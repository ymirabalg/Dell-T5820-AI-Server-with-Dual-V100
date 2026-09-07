/**
 * §2.2's systemd reader: `ActiveState` over the read-only system bus socket.
 *
 * Three things this file must get right, and each is a rule from somewhere else:
 *
 * 1. **Read-only and unprivileged (§2.2, invariant 2).** The only two methods called are
 *    `Manager.GetUnit` and `org.freedesktop.DBus.Properties.Get`. Neither changes anything.
 *    ⚠ `LoadUnit` is deliberately NOT used even though it is what `systemctl show` calls:
 *    it *loads* a unit into systemd's memory, which is a state change on the box, and
 *    invariant 2 has no "harmless write" exception. §3.7 now states what `GetUnit` answers
 *    instead, and what it means — see {@link NO_SUCH_UNIT_ERROR}.
 * 2. **Bounded (O17).** `CollectorIo` bounds `run` only; a unix socket to a hung `systemd`
 *    would otherwise hang the per-request telemetry route and every browser polling it.
 *    The whole conversation shares one {@link deadline} on a **monotonic** clock.
 * 3. **The closed vocabulary (§3.7).** `ActiveState` arrives as an arbitrary string and is
 *    validated against {@link UnitState}'s six members by {@link asUnitState}. ⚠ A cast
 *    would put a seventh value into a union the UI switches on exhaustively, and §6.3's
 *    `severityUnitState` would return `undefined` for it — an uncoloured row on the panel
 *    that reports whether GPU fan control is running.
 *
 * ### The parser/IO split, here
 *
 * `dbus-wire.ts` is the pure half: it turns method calls into bytes and bytes into
 * messages, and it is tested against **frames captured from this box's real system bus**.
 * This file is the IO half: it owns the socket, the SASL handshake, the serial counter and
 * the framing, and it never interprets a byte itself.
 *
 * Every failure in this file is `errors[].source === 'dbus'` (§3.7).
 */

import { connect } from 'node:net';
import type { Socket } from 'node:net';

import type { TelemetryError, UnitState } from '../types';
import { DEFAULT_PATHS } from './collect';
import type { CollectorPaths } from './collect';
import {
  DBUS_AUTH_BEGIN,
  DBUS_AUTH_NUL,
  DBUS_MESSAGE_TYPE,
  authExternalLine,
  classifyAuthReply,
  decodeMessage,
  encodeMethodCall,
} from './dbus-wire';
import type { DbusMessage } from './dbus-wire';
import { boundedTimeoutMs, deadline } from './deadline';
import type { Within } from './deadline';
import { reason, tag } from './errors';

/**
 * The whole conversation's budget, in milliseconds — **and the real default at both call
 * sites**, not merely a fallback.
 *
 * §6.7 now states it: *"the D-Bus conversation 2 s"*. A healthy round trip on a unix socket
 * is sub-millisecond, so 2 s is three orders of magnitude of headroom; it sits under §6.7's
 * 5 s default cadence, so a wedged `systemd` costs one late poll rather than a wedged route;
 * and it is below {@link NVIDIA_SMI_TIMEOUT_MS} because a local socket that outlasts a
 * process spawn is already pathological.
 *
 * ⚠ It briefly was **not** the operating number: `collectServing` handed the conversation
 * its own 4 s while this doc argued at length for 2 s, so the constant was live only as a
 * fallback and the doc described a bound nothing used. `collectServing` now passes
 * `dbusTimeoutMs`, which defaults to this.
 */
export const DBUS_TIMEOUT_MS = 2000;

export const SYSTEMD_DESTINATION = 'org.freedesktop.systemd1';
export const SYSTEMD_MANAGER_PATH = '/org/freedesktop/systemd1';
export const SYSTEMD_MANAGER_IFACE = 'org.freedesktop.systemd1.Manager';
export const SYSTEMD_UNIT_IFACE = 'org.freedesktop.systemd1.Unit';
export const PROPERTIES_IFACE = 'org.freedesktop.DBus.Properties';
export const ACTIVE_STATE_PROPERTY = 'ActiveState';

/**
 * `gpu-fan-control.service` and `llama-server@<i>.service` — **defined in `lib/units.ts`**
 * and re-exported here, where every server-side caller already looks for them.
 *
 * ⚠ They moved because step 8 builds §6.4's condition ids (`unit:gpu-fan-control.service`,
 * `unit:llama-server@1.service`) **in the browser**, and this file's first import is
 * `node:net`. One definition, reachable from both sides — see `lib/units.ts`.
 */
export { FAN_SERVICE_UNIT, servingUnitName } from '../units';

/**
 * systemd's answer when a unit exists on disk but has never been loaded.
 *
 * ⚠ **This reads `inactive`, and §3.7 now says so in as many words:**
 *
 * > **A unit systemd has not loaded reads `inactive`, not `null`.** … For a unit that exists
 * > but has never been loaded — `gpu-fan-control.service` on a box where it was installed
 * > and left disabled, this box's documented state from 2026-08-15 to 2026-08-27 — `GetUnit`
 * > answers `org.freedesktop.systemd1.NoSuchUnit` where `LoadUnit` would answer `inactive`.
 * > **Report `inactive`, and carry a `dbus` entry naming the unit and the `NoSuchUnit`
 * > reply.**
 *
 * This is not inferring a state from an absence. An unloaded unit has no `ActiveState`
 * because it has no *object*; `LoadUnit` materialises the object, and the state it then
 * reports is the state that was already true — loading is what creates the object, not what
 * sets the state.
 *
 * And **this dashboard never asks about a unit speculatively.** It asks about
 * {@link FAN_SERVICE_UNIT}, which §3.6 names, and about exactly one unit per `<i>.env` the
 * box's own configuration declares. "systemd has no record of it" about a unit this box
 * declares *is* the news. Verified on the live bus, read-only, 2026-09-06: `GetUnit` on
 * `llama-server@7.service` returns exactly this error name while
 * `/etc/systemd/system/llama-server@.service` sits on disk.
 *
 * ⚠ The step-5 build reported `null` here, reasoning that `inactive` would infer §6.3's
 * alarm from *"I have no record of this unit"*. The cost was the opposite failure and the
 * worse one: `severityUnitState(null)` is `null`, §6.3's "Any unit" row has no `null`
 * column, so SAFETY's *"Fan service active"* row rendered an **uncoloured em dash** for a
 * service that was installed and never started — silence from the panel that earns this
 * dashboard's existence. `null` is now reserved for *"the state could not be READ"*.
 */
export const NO_SUCH_UNIT_ERROR = 'org.freedesktop.systemd1.NoSuchUnit';

/**
 * What {@link NO_SUCH_UNIT_ERROR} maps to (§3.7). Named rather than inlined so the mapping
 * is one identifier a reader can grep, and so the regression that inverts it has an anchor.
 */
export const NO_SUCH_UNIT_STATE: UnitState = 'inactive';

/** §3.7's six `ActiveState` values, as a runtime set. */
const UNIT_STATES: readonly UnitState[] = [
  'active',
  'reloading',
  'inactive',
  'failed',
  'activating',
  'deactivating',
];

/**
 * Validate an `ActiveState` string against §3.7's closed vocabulary.
 *
 * ⚠ Pure, total, and the only way a `UnitState` enters this project from the wire. A
 * seventh value — a future systemd, a different bus, a fake in a test — becomes `null`,
 * which is "not read" and carries no severity, rather than a string the UI cannot switch
 * on. `null` in gives `null` out, so a missing property and an unknown one agree.
 */
export const asUnitState = (text: string | null): UnitState | null =>
  text === null ? null : (UNIT_STATES.find((s) => s === text) ?? null);

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

/**
 * A byte stream to the bus. Deliberately dumber than a D-Bus connection: it knows nothing
 * about messages, so a test can script one from an array of chunks.
 */
export interface DbusStream {
  write(bytes: Uint8Array): Promise<void>;
  /** The next chunk the peer sent. Rejects when the connection ends or errors. */
  next(): Promise<Uint8Array>;
  close(): void;
}

/**
 * Bytes-to-the-bus, injectable — the same role {@link CollectorIo} plays for files.
 *
 * ⚠ It is a **separate** seam rather than three more methods on `CollectorIo`. Two
 * reasons, and the second is the load-bearing one: a socket, an HTTP client and `statvfs`
 * are not "the contents of a path", so a single interface would be four unrelated
 * capabilities wearing one name; and every fake `CollectorIo` in steps 3 and 4 is an object
 * literal, so widening it would turn ten of *their* tests red for a change that has nothing
 * to do with them.
 */
export interface DbusIo {
  /**
   * ⚠ `timeoutMs` bounds the CONNECT and **destroys the socket** if it expires, exactly as
   * `CollectorIo.run` bounds `execFile` and `HttpIo.get` bounds its request. The shared
   * {@link deadline} settles the *promise*; only the seam can close the handle, and a
   * connect the deadline abandoned would otherwise leave one open socket per poll per tab
   * against a bus that accepts but never speaks.
   */
  connect(socketPath: string, timeoutMs: number): Promise<DbusStream>;
  /**
   * The uid the bus will see over `SO_PEERCRED`.
   *
   * ⚠ Not a secret and not a credential — see {@link authExternalLine}. It is a claim the
   * kernel independently verifies, which is exactly why §2.2 can call this access
   * unprivileged.
   */
  uid(): number;
}

/** Wrap a connected socket as a {@link DbusStream}: a chunk queue with one waiter. */
const streamOf = (socket: Socket): DbusStream => {
  const chunks: Uint8Array[] = [];
  let waiting: { resolve: (b: Uint8Array) => void; reject: (e: Error) => void } | null = null;
  let failure: Error | null = null;

  const fail = (e: Error): void => {
    failure ??= e;
    const w = waiting;
    waiting = null;
    w?.reject(failure);
  };

  socket.on('data', (chunk: Buffer) => {
    const bytes = new Uint8Array(chunk);
    const w = waiting;
    if (w !== null) {
      waiting = null;
      w.resolve(bytes);
    } else {
      chunks.push(bytes);
    }
  });
  socket.on('error', (e: Error) => {
    fail(e);
  });
  socket.on('close', () => {
    fail(new Error('the system bus closed the connection'));
  });

  return {
    write: (bytes) =>
      new Promise<void>((resolve, reject) => {
        socket.write(bytes, (e) => {
          if (e) reject(e);
          else resolve();
        });
      }),
    next: () => {
      const queued = chunks.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (failure !== null) return Promise.reject(failure);
      return new Promise<Uint8Array>((resolve, reject) => {
        waiting = { resolve, reject };
      });
    },
    close: () => {
      socket.destroy();
    },
  };
};

/**
 * The real implementation. Alongside `io.ts` this is the only file in `lib/collectors/`
 * that imports a `node:` module.
 *
 * ⚠ **`process.getuid` is optional in the type system** because Node does not define it on
 * Windows. It is always present on the Linux target; the fallback of `0` would simply be
 * rejected by the bus, which is the honest outcome for an environment that cannot say who
 * it is.
 *
 * ⚠ **`connect` closes its own handle at the bound**, which it did not before step 5's
 * reconciliation. `io.ts` aborts, destroys both pipes and `unref()`s the child; `nodeHttp`
 * destroys its `req`. This created the socket inside a promise the deadline abandons and
 * nothing ever called `destroy()` — in the exact case the bound exists for, a socket path
 * that exists but whose peer never accepts, the handle stayed open for the life of the
 * process, one per poll per tab. The delay goes through {@link boundedTimeoutMs} for the
 * reason `io.ts` and `http.ts` do.
 */
export const nodeDbus: DbusIo = {
  connect: (socketPath, timeoutMs) =>
    new Promise<DbusStream>((resolve, reject) => {
      const bound = boundedTimeoutMs(timeoutMs, DBUS_TIMEOUT_MS);
      const socket = connect(socketPath);
      let settled = false;
      const finish = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outcome();
      };
      const timer = setTimeout(() => {
        socket.destroy();
        finish(() => {
          reject(new Error(`connecting timed out after ${bound} ms`));
        });
      }, bound);
      socket.once('error', (e: Error) => {
        finish(() => {
          reject(e);
        });
      });
      socket.once('connect', () => {
        finish(() => {
          resolve(streamOf(socket));
        });
      });
    }),
  uid: () => process.getuid?.() ?? 0,
};

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

/** Frames a {@link DbusStream} into SASL lines and then into D-Bus messages. */
class Conversation {
  private readonly stream: DbusStream;
  private readonly within: Within;
  private buffer = new Uint8Array(0);
  private serial = 0;

  constructor(stream: DbusStream, within: Within) {
    this.stream = stream;
    this.within = within;
  }

  private async pull(): Promise<void> {
    const chunk = await this.within(() => this.stream.next());
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
  }

  /** One CRLF-terminated SASL line. Only used before `BEGIN`. */
  private async line(): Promise<string> {
    for (;;) {
      const at = this.buffer.indexOf(0x0a);
      if (at >= 0) {
        const text = new TextDecoder().decode(this.buffer.subarray(0, at + 1));
        this.buffer = this.buffer.subarray(at + 1);
        return text;
      }
      await this.pull();
    }
  }

  /**
   * The next complete message.
   *
   * ⚠ A `malformed` decode **throws** rather than being retried. The distinction is the
   * whole reason {@link decodeMessage} has two failure kinds: waiting for more bytes after
   * a protocol error is a hang that only the deadline can end, and the resulting
   * `errors[]` entry would say "timed out" about a peer that answered instantly.
   */
  private async message(): Promise<DbusMessage> {
    for (;;) {
      const decoded = decodeMessage(this.buffer);
      if (decoded.kind === 'message') {
        this.buffer = this.buffer.subarray(decoded.message.byteLength);
        return decoded.message;
      }
      if (decoded.kind === 'malformed') {
        throw new Error(`the system bus sent something that is not a D-Bus message: ${decoded.problem}`);
      }
      await this.pull();
    }
  }

  /** SASL `EXTERNAL`, then `BEGIN`. Everything after this is marshalled messages. */
  async authenticate(uid: number): Promise<void> {
    const encoder = new TextEncoder();
    // ⚠ The NUL and the AUTH line in ONE write. Some bus implementations read the NUL with
    // the first line; splitting them is legal but has no upside, and one syscall is fewer
    // ways for a partial write to interleave.
    const hello = encoder.encode(authExternalLine(uid));
    const opening = new Uint8Array(DBUS_AUTH_NUL.length + hello.length);
    opening.set(DBUS_AUTH_NUL);
    opening.set(hello, DBUS_AUTH_NUL.length);
    await this.within(() => this.stream.write(opening));

    const replied = classifyAuthReply(await this.line());
    if (replied !== 'ok') {
      throw new Error(
        replied === 'rejected'
          ? 'the system bus rejected EXTERNAL authentication — the socket peer uid is not the one we claimed'
          : `unexpected SASL reply from the system bus: ${replied}`,
      );
    }
    await this.within(() => this.stream.write(encoder.encode(DBUS_AUTH_BEGIN)));
  }

  /**
   * One method call, and the reply that carries its serial back.
   *
   * ⚠ **Messages that are not this call's reply are skipped, not treated as one.** The bus
   * sends a `NameAcquired` signal immediately after `Hello`, and it arrives in the *same*
   * read as the `Hello` reply on this box — measured, and kept as a fixture. A client that
   * took "the next message" as its answer would read the signal's body as an object path
   * on its second call and be wrong from then on.
   */
  async call(destination: string, path: string, iface: string, member: string, args: readonly string[]): Promise<DbusMessage> {
    this.serial += 1;
    const serial = this.serial;
    await this.within(() => this.stream.write(encodeMethodCall({ serial, destination, path, iface, member, args })));
    for (;;) {
      const message = await this.message();
      if (message.replySerial === serial) return message;
    }
  }
}

/** The `Hello` every connection must make before the bus will route anything else. */
const sayHello = (c: Conversation): Promise<DbusMessage> =>
  c.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'Hello', []);

/** Turn a reply into its first `string` body value, or `null`. */
const firstString = (message: DbusMessage): string | null => {
  const first = message.body[0];
  return typeof first === 'string' && first !== '' ? first : null;
};

/** Arguments to {@link collectUnitStates}. Options object, like every collector. */
export interface CollectUnitStatesOptions {
  readonly dbus?: DbusIo;
  readonly paths?: CollectorPaths;
  /** The units to ask about. Discovered by the caller; never hard-coded here. */
  readonly units: readonly string[];
  /** O17's bound on the whole conversation. See {@link DBUS_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * What {@link collectUnitStates} yields.
 *
 * ⚠ **Every requested unit is a key, always** — a unit that could not be read maps to
 * `null` rather than being absent. A caller doing `states.get(name)` cannot then tell "not
 * asked for" from "asked for and unknown", and both would render the same em dash for
 * different reasons.
 *
 * ⚠ **`null` in this map means the state could not be READ, and nothing else** (§3.7). The
 * four routes to it: the bus socket was unreachable, the conversation failed or was cut
 * short by its bound, the reply was not a D-Bus message, or `ActiveState` came back as a
 * seventh value. **A unit that is not running is never `null`** — see
 * {@link NO_SUCH_UNIT_ERROR}.
 */
export interface UnitStateCollection {
  readonly states: ReadonlyMap<string, UnitState | null>;
  readonly errors: readonly TelemetryError[];
}

/** Every requested unit, unknown. The shape returned when the bus itself is unreachable. */
const allUnknown = (units: readonly string[]): Map<string, UnitState | null> =>
  new Map(units.map((unit) => [unit, null]));

/**
 * Read `ActiveState` for each named unit, over one connection.
 *
 * One connection rather than one per unit: the SASL handshake and `Hello` are three round
 * trips that say nothing about any unit, and repeating them per unit would triple the
 * conversation for no information.
 *
 * ⚠ **A failure to reach the bus at all is `null` for every unit and ONE `errors[]`
 * entry** — not one per unit. §6.5 wants an error matched to the figure it explains, and
 * the figure a dead bus explains is "the bus", not each row. A failure to read a *single*
 * unit is that unit's own entry, because the others are still readable and their rows are
 * still true.
 */
export const collectUnitStates = async ({
  dbus = nodeDbus,
  paths = DEFAULT_PATHS,
  units,
  timeoutMs = DBUS_TIMEOUT_MS,
}: CollectUnitStatesOptions): Promise<UnitStateCollection> => {
  const states = allUnknown(units);
  if (units.length === 0) return { states, errors: [] };

  const within = deadline(timeoutMs, DBUS_TIMEOUT_MS);
  const socket = paths.dbusSystemSocket;

  let stream: DbusStream;
  try {
    stream = await within(() => dbus.connect(socket, boundedTimeoutMs(timeoutMs, DBUS_TIMEOUT_MS)));
  } catch (e) {
    return { states, errors: tag('dbus', [`${socket}: ${reason(e)}`]) };
  }

  const problems: string[] = [];
  try {
    const conversation = new Conversation(stream, within);
    await conversation.authenticate(dbus.uid());
    await sayHello(conversation);

    for (const unit of units) {
      try {
        const found = await conversation.call(
          SYSTEMD_DESTINATION,
          SYSTEMD_MANAGER_PATH,
          SYSTEMD_MANAGER_IFACE,
          'GetUnit',
          [unit],
        );
        if (found.type === DBUS_MESSAGE_TYPE.error) {
          const detail = firstString(found) ?? 'no detail';
          if (found.errorName === NO_SUCH_UNIT_ERROR) {
            // ⚠ §3.7: a unit systemd has not loaded reads `inactive`, WITH an entry. See
            // NO_SUCH_UNIT_ERROR — this is the one error reply that is a state, not a
            // failure to read one, and it is the state SAFETY's fan-service row exists for.
            states.set(unit, NO_SUCH_UNIT_STATE);
            problems.push(
              `${unit}: ${NO_SUCH_UNIT_ERROR}: ${detail} — systemd has no record of this unit, ` +
                `which for a unit this box's own configuration declares is \`${NO_SUCH_UNIT_STATE}\``,
            );
            continue;
          }
          problems.push(`${unit}: ${found.errorName ?? 'error'}: ${detail}`);
          continue;
        }
        const objectPath = firstString(found);
        if (objectPath === null) {
          problems.push(`${unit}: GetUnit answered without an object path`);
          continue;
        }
        const property = await conversation.call(
          SYSTEMD_DESTINATION,
          objectPath,
          PROPERTIES_IFACE,
          'Get',
          [SYSTEMD_UNIT_IFACE, ACTIVE_STATE_PROPERTY],
        );
        if (property.type === DBUS_MESSAGE_TYPE.error) {
          problems.push(`${unit}: ${property.errorName ?? 'error'}: ${firstString(property) ?? 'no detail'}`);
          continue;
        }
        const raw = firstString(property);
        const state = asUnitState(raw);
        if (state === null) {
          // §3.7's vocabulary is closed. An unmatched value is reported, never carried.
          problems.push(
            raw === null
              ? `${unit}: ${ACTIVE_STATE_PROPERTY} came back empty`
              : `${unit}: ${ACTIVE_STATE_PROPERTY} is \`${raw}\`, which is not one of systemd's six states`,
          );
          continue;
        }
        states.set(unit, state);
      } catch (e) {
        // A failure mid-conversation ends it: the stream framing is now at an unknown
        // offset, so the remaining units stay `null` rather than being read from a
        // desynchronised buffer.
        problems.push(`${unit}: ${reason(e)}`);
        break;
      }
    }
  } catch (e) {
    problems.push(`${socket}: ${reason(e)}`);
  } finally {
    stream.close();
  }

  return { states, errors: tag('dbus', problems) };
};
