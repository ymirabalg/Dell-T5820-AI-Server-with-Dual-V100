/**
 * §3.4's and §3.6's systemd reader — {@link collectUnitStates} and {@link asUnitState}.
 *
 * Every test drives a **fake** {@link DbusIo}: a scripted bus that decodes what the client
 * writes and answers it. So the whole conversation — SASL, `Hello`, the skipped
 * `NameAcquired` signal, `GetUnit`, `Properties.Get`, `NoSuchUnit` — is exercised with no
 * socket, no systemd and no Linux.
 *
 * ⚠ The reply frames the fake sends are **built here**, because the states a healthy box
 * cannot produce (`failed`, `activating`) have no captured bytes. The builder is anchored
 * to reality by the first test below, which asserts it decodes identically to the frame
 * captured from the live bus. `dbus-wire.test.ts` is where the captured frames themselves
 * are the subject.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { severityUnitState } from '../severity';
import { errnoCodeOf } from './errors';
import type { UnitState } from '../types';
import { DEFAULT_PATHS } from './collect';
import {
  ACTIVE_STATE_PROPERTY,
  FAN_SERVICE_UNIT,
  NO_SUCH_UNIT_ERROR,
  NO_SUCH_UNIT_STATE,
  SYSTEMD_MANAGER_IFACE,
  SYSTEMD_UNIT_IFACE,
  asUnitState,
  collectUnitStates,
  nodeDbus,
  servingUnitName,
} from './dbus';
import type { DbusIo, DbusStream } from './dbus';
import { DBUS_MESSAGE_TYPE, decodeMessage } from './dbus-wire';
import { CAPTURED_DBUS_ACTIVE_STATE_REPLY, CAPTURED_DBUS_AUTH_OK } from './samples';

const ENCODER = new TextEncoder();

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)));

/** Little-endian uint32. */
const le32 = (value: number): readonly number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 24) & 0xff,
];

const pad = (out: number[], to: number): void => {
  while (out.length % to !== 0) out.push(0);
};

const putString = (out: number[], text: string): void => {
  pad(out, 4);
  const encoded = ENCODER.encode(text);
  out.push(...le32(encoded.length), ...encoded, 0);
};

/** A METHOD_RETURN or ERROR frame: REPLY_SERIAL, optional ERROR_NAME, SIGNATURE, body. */
const reply = (
  type: number,
  replySerial: number,
  signature: string,
  body: readonly number[],
  errorName?: string,
): Uint8Array => {
  const fields: number[] = [];
  fields.push(5, 1, 0x75, 0, ...le32(replySerial)); // REPLY_SERIAL, a `u`
  if (errorName !== undefined) {
    pad(fields, 8);
    fields.push(4, 1, 0x73, 0); // ERROR_NAME, an `s`
    putString(fields, errorName);
  }
  pad(fields, 8);
  const sigBytes = ENCODER.encode(signature);
  fields.push(8, 1, 0x67, 0, sigBytes.length, ...sigBytes, 0); // SIGNATURE, a `g`

  const out: number[] = [0x6c, type, 0, 1, ...le32(body.length), ...le32(9999), ...le32(fields.length)];
  out.push(...fields);
  pad(out, 8);
  out.push(...body);
  return Uint8Array.from(out);
};

/** A body holding one `STRING`. */
const stringBody = (text: string): readonly number[] => {
  const out: number[] = [];
  putString(out, text);
  return out;
};

/** A body holding one `VARIANT` wrapping a `STRING` — what `Properties.Get` returns. */
const variantStringBody = (text: string): readonly number[] => {
  const out: number[] = [1, 0x73, 0];
  putString(out, text);
  return out;
};

/** What the scripted bus knows about one unit. */
type UnitAnswer = { readonly kind: 'state'; readonly state: string } | { readonly kind: 'no-such-unit' };

interface FakeBusOptions {
  readonly units?: Readonly<Record<string, UnitAnswer>>;
  /** Fail the SASL step instead of answering `OK`. */
  readonly authReply?: string;
  /** Reject `connect` itself, as a missing socket does. */
  readonly connectError?: Error;
  /** Answer the first frame after `BEGIN` with bytes that are not a D-Bus message. */
  readonly garbageAfterBegin?: boolean;
  /**
   * Answer with a well-formed 16-byte header declaring a four-billion-byte body — the F3
   * case. The header parses; only the length fields are a lie, so nothing before the
   * ceiling could tell it from "the rest is still in flight".
   */
  readonly absurdLengthAfterBegin?: boolean;
  /** Never answer anything after `BEGIN` — a bus that accepts the socket and goes quiet. */
  readonly silent?: boolean;
}

interface FakeBus {
  readonly dbus: DbusIo;
  /** Every unit name the client actually asked `GetUnit` about, in order. */
  readonly asked: string[];
  /** Every `Properties.Get` the client made, as `interface/property`. */
  readonly properties: string[];
  readonly closed: () => number;
}

/**
 * A bus that answers what it is asked. It decodes each frame the client writes, so a client
 * that marshalled a call wrongly gets no reply here for the same reason it would get none
 * from systemd.
 */
const fakeBus = (options: FakeBusOptions = {}): FakeBus => {
  const asked: string[] = [];
  const properties: string[] = [];
  const paths = new Map<string, string>();
  let closes = 0;

  const dbus: DbusIo = {
    uid: () => 1000,
    connect: (): Promise<DbusStream> => {
      if (options.connectError) return Promise.reject(options.connectError);
      const queue: Uint8Array[] = [];
      let waiting: ((b: Uint8Array) => void) | null = null;
      let begun = false;

      const emit = (chunk: Uint8Array): void => {
        const w = waiting;
        if (w !== null) {
          waiting = null;
          w(chunk);
        } else {
          queue.push(chunk);
        }
      };

      const answer = (frame: Uint8Array): void => {
        const decoded = decodeMessage(frame);
        if (decoded.kind !== 'message') return;
        const { serial, body } = decoded.message;
        if (options.silent) return;
        if (options.garbageAfterBegin) {
          emit(ENCODER.encode('this is not a D-Bus message at all'));
          return;
        }
        if (options.absurdLengthAfterBegin) {
          const header = new Uint8Array(16);
          header[0] = 0x6c; // little-endian
          header[1] = DBUS_MESSAGE_TYPE.methodReturn;
          header[3] = 1; // protocol version
          new DataView(header.buffer).setUint32(4, 0xffffffff, true); // body length
          new DataView(header.buffer).setUint32(8, serial, true);
          emit(header);
          return;
        }
        const first = typeof body[0] === 'string' ? body[0] : '';
        const second = typeof body[1] === 'string' ? body[1] : '';
        if (first === '' && body.length === 0) {
          // `Hello`. Answer, then send the NameAcquired signal in the SAME chunk — which is
          // what the live bus did, measured 2026-09-06.
          const ret = reply(DBUS_MESSAGE_TYPE.methodReturn, serial, 's', stringBody(':1.102'));
          const signal = reply(DBUS_MESSAGE_TYPE.signal, 0, 's', stringBody(':1.102'));
          const both = new Uint8Array(ret.length + signal.length);
          both.set(ret);
          both.set(signal, ret.length);
          emit(both);
          return;
        }
        if (second === '') {
          // `GetUnit(name)`.
          asked.push(first);
          const known = options.units?.[first];
          if (known === undefined || known.kind === 'no-such-unit') {
            emit(
              reply(
                DBUS_MESSAGE_TYPE.error,
                serial,
                's',
                stringBody(`Unit ${first} not loaded.`),
                NO_SUCH_UNIT_ERROR,
              ),
            );
            return;
          }
          const objectPath = `/org/freedesktop/systemd1/unit/${first.replace(/[^A-Za-z0-9]/g, '_')}`;
          paths.set(objectPath, first);
          emit(reply(DBUS_MESSAGE_TYPE.methodReturn, serial, 'o', stringBody(objectPath)));
          return;
        }
        // `Properties.Get(interface, property)`.
        properties.push(`${first}/${second}`);
        // The decoder does not surface the header PATH field, so the fake answers for the
        // most recently resolved unit. The client always issues `Get` immediately after the
        // `GetUnit` it belongs to, which is the property `collectUnitStates` is built on.
        const unit = [...paths.entries()].map(([, name]) => name).at(-1) ?? '';
        const known = options.units?.[unit];
        emit(
          reply(
            DBUS_MESSAGE_TYPE.methodReturn,
            serial,
            'v',
            variantStringBody(known?.kind === 'state' ? known.state : ''),
          ),
        );
      };

      const stream: DbusStream = {
        write: (written) => {
          if (!begun) {
            const text = new TextDecoder().decode(written);
            if (text.includes('AUTH')) emit(ENCODER.encode(options.authReply ?? CAPTURED_DBUS_AUTH_OK));
            else if (text.includes('BEGIN')) begun = true;
            return Promise.resolve();
          }
          answer(written);
          return Promise.resolve();
        },
        next: () => {
          const queued = queue.shift();
          if (queued !== undefined) return Promise.resolve(queued);
          return new Promise<Uint8Array>((resolve) => {
            waiting = resolve;
          });
        },
        close: () => {
          closes += 1;
        },
      };
      return Promise.resolve(stream);
    },
  };

  return { dbus, asked, properties, closed: () => closes };
};

const liveBox: Readonly<Record<string, UnitAnswer>> = {
  'llama-server@0.service': { kind: 'state', state: 'active' },
  'llama-server@1.service': { kind: 'state', state: 'active' },
  [FAN_SERVICE_UNIT]: { kind: 'state', state: 'active' },
};

describe('the reply builder these tests use is anchored to a real frame', () => {
  test('⚠ a built ActiveState reply decodes identically to the one the live bus sent', () => {
    // Without this, every test below could be green against a fiction. The captured frame
    // carries SENDER and DESTINATION fields the builder omits, so the frames differ byte
    // for byte — the assertion is on what the decoder makes of each, which is what the
    // client under test actually consumes.
    const captured = decodeMessage(bytes(CAPTURED_DBUS_ACTIVE_STATE_REPLY));
    const built = decodeMessage(reply(DBUS_MESSAGE_TYPE.methodReturn, 3, 'v', variantStringBody('active')));
    expect(captured.kind).toBe('message');
    expect(built.kind).toBe('message');
    if (captured.kind !== 'message' || built.kind !== 'message') return;
    expect(built.message.type).toBe(captured.message.type);
    expect(built.message.replySerial).toBe(captured.message.replySerial);
    expect(built.message.signature).toBe(captured.message.signature);
    expect(built.message.body).toEqual(captured.message.body);
  });
});

describe('asUnitState — §3.7’s closed vocabulary', () => {
  test.each<UnitState>(['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating'])(
    '%s is carried through',
    (state) => {
      expect(asUnitState(state)).toBe(state);
    },
  );

  test('⚠ a seventh value becomes null rather than entering the union', () => {
    // §6.3's `severityUnitState` is an exhaustive switch over six members. A cast here
    // would hand it a value it has no case for, and the SAFETY row that says whether GPU
    // fan control is running would render with no colour at all.
    for (const junk of ['running', 'ACTIVE', 'active ', '', 'dead', 'failed\n']) {
      expect(asUnitState(junk), junk).toBeNull();
    }
  });

  test('null in, null out', () => {
    expect(asUnitState(null)).toBeNull();
  });
});

describe('collectUnitStates', () => {
  test('reads ActiveState for every unit over one connection', async () => {
    const bus = fakeBus({ units: liveBox });
    const units = [servingUnitName(0), servingUnitName(1), FAN_SERVICE_UNIT];
    const { states, errors } = await collectUnitStates({ dbus: bus.dbus, units });
    expect(errors).toEqual([]);
    expect([...states]).toEqual([
      ['llama-server@0.service', 'active'],
      ['llama-server@1.service', 'active'],
      ['gpu-fan-control.service', 'active'],
    ]);
    expect(bus.asked).toEqual(units);
    // ⚠ Read-only: the only property ever asked for is ActiveState, on the Unit interface.
    expect(new Set(bus.properties)).toEqual(new Set([`${SYSTEMD_UNIT_IFACE}/${ACTIVE_STATE_PROPERTY}`]));
  });

  test('⚠ only GetUnit and Properties.Get are ever called — never LoadUnit', async () => {
    // Invariant 2 and §2.2. `LoadUnit` is what `systemctl show` calls and it *loads* the
    // unit, which is a change to the box. This asserts the members by name rather than
    // trusting a comment.
    const bus = fakeBus({ units: liveBox });
    const written: string[] = [];
    const wrapped: DbusIo = {
      uid: () => bus.dbus.uid(),
      connect: async (path, timeoutMs) => {
        const stream = await bus.dbus.connect(path, timeoutMs);
        return {
          ...stream,
          write: (frame) => {
            written.push(new TextDecoder().decode(frame));
            return stream.write(frame);
          },
        };
      },
    };
    await collectUnitStates({ dbus: wrapped, units: [FAN_SERVICE_UNIT] });
    const conversation = written.join('\n');
    // The MEMBER travels in the frame as plain ASCII, so this reads the wire, not a mock.
    expect(conversation).toContain('GetUnit');
    expect(conversation).toContain('ActiveState');
    for (const mutating of [
      'LoadUnit',
      'StartUnit',
      'StopUnit',
      'RestartUnit',
      'ReloadUnit',
      'KillUnit',
      'ResetFailed',
      'SetUnitProperties',
      'Reexecute',
    ]) {
      expect(conversation, mutating).not.toContain(mutating);
    }
    expect(bus.asked).toEqual([FAN_SERVICE_UNIT]);
  });

  test('⚠ the NameAcquired signal that follows Hello is skipped, not read as a reply', async () => {
    // The live bus sends it in the SAME chunk as the Hello reply, and the fake reproduces
    // that. A client that took "the next message" would read the signal's body as an
    // object path and then ask for `ActiveState` on a path that does not exist.
    const bus = fakeBus({ units: liveBox });
    const { states, errors } = await collectUnitStates({ dbus: bus.dbus, units: [FAN_SERVICE_UNIT] });
    expect(errors).toEqual([]);
    expect(states.get(FAN_SERVICE_UNIT)).toBe('active');
  });

  test.each<UnitState>(['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating'])(
    'a unit reporting %s is carried through unchanged',
    async (state) => {
      const bus = fakeBus({ units: { [FAN_SERVICE_UNIT]: { kind: 'state', state } } });
      const { states, errors } = await collectUnitStates({ dbus: bus.dbus, units: [FAN_SERVICE_UNIT] });
      expect(states.get(FAN_SERVICE_UNIT)).toBe(state);
      expect(errors).toEqual([]);
    },
  );

  test('⚠ NoSuchUnit reads `inactive` WITH an entry — §3.7, and it bands ALARM', async () => {
    /*
     * §3.7: "A unit systemd has not loaded reads `inactive`, not `null`. … Report
     * `inactive`, and carry a `dbus` entry naming the unit and the `NoSuchUnit` reply."
     *
     * The step-5 build reported `null` here, reasoning that `inactive` would infer §6.3's
     * alarm from an answer saying "I have no record of this unit". The cost was the
     * opposite failure and the worse one: `severityUnitState(null)` is `null` and §6.3's
     * "Any unit" row has no `null` column, so SAFETY's *"Fan service active"* row rendered
     * an uncoloured em dash for a `gpu-fan-control.service` installed and never started —
     * this box's own state for twelve days in August.
     *
     * The argument that settles it: an unloaded unit has no `ActiveState` because it has no
     * *object*; `LoadUnit` materialises the object and reports the state that was already
     * true. And this dashboard never asks speculatively — only about `gpu-fan-control` and
     * one unit per discovered `<i>.env` — so "systemd has no record of it" about a unit the
     * box's own config declares IS the news.
     */
    const bus = fakeBus({ units: { 'llama-server@7.service': { kind: 'no-such-unit' } } });
    const { states, errors } = await collectUnitStates({
      dbus: bus.dbus,
      units: ['llama-server@7.service'],
    });
    expect(states.get('llama-server@7.service')).toBe(NO_SUCH_UNIT_STATE);
    expect(states.get('llama-server@7.service')).toBe('inactive');
    expect(severityUnitState(states.get('llama-server@7.service') ?? null)).toBe('alarm');
    // ⚠ The entry is not optional: an alarm with no explanation beside it is not actionable,
    // and the reader must be able to tell "stopped" from "systemd has never loaded it".
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('dbus');
    expect(errors[0]?.message).toContain(NO_SUCH_UNIT_ERROR);
    expect(errors[0]?.message).toContain('llama-server@7.service');
  });

  test('⚠ `null` means the state could not be READ, and no answer produces it', async () => {
    // §3.7 fixes four routes to `null` and none of them is a unit that exists and is
    // stopped. Both routes reachable from a *reply* are asserted here: an `ActiveState`
    // outside the six, and an error reply that is not `NoSuchUnit`. Both carry an entry
    // and neither is a state.
    const seventh = fakeBus({ units: { [FAN_SERVICE_UNIT]: { kind: 'state', state: 'quiescent' } } });
    const seventhRun = await collectUnitStates({ dbus: seventh.dbus, units: [FAN_SERVICE_UNIT] });
    expect(seventhRun.states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(severityUnitState(seventhRun.states.get(FAN_SERVICE_UNIT) ?? null)).toBeNull();

    const refused = fakeBus({ connectError: new Error('connect ENOENT') });
    const refusedRun = await collectUnitStates({ dbus: refused.dbus, units: [FAN_SERVICE_UNIT] });
    expect(refusedRun.states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(refusedRun.errors).toHaveLength(1);
  });

  test('⚠ an ActiveState outside the six is null with an entry, not carried as a string', async () => {
    const bus = fakeBus({ units: { [FAN_SERVICE_UNIT]: { kind: 'state', state: 'quiescent' } } });
    const { states, errors } = await collectUnitStates({ dbus: bus.dbus, units: [FAN_SERVICE_UNIT] });
    expect(states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(errors[0]?.message).toContain('quiescent');
  });

  test('one unit systemd has never loaded leaves the others readable', async () => {
    const bus = fakeBus({
      units: {
        'llama-server@0.service': { kind: 'state', state: 'active' },
        'llama-server@1.service': { kind: 'no-such-unit' },
      },
    });
    const { states, errors } = await collectUnitStates({
      dbus: bus.dbus,
      units: [servingUnitName(0), servingUnitName(1)],
    });
    expect(states.get('llama-server@0.service')).toBe('active');
    expect(states.get('llama-server@1.service')).toBe('inactive');
    expect(errors).toHaveLength(1);
  });

  test('⚠ an unreachable bus is null for EVERY unit and exactly ONE entry', async () => {
    // §6.5 matches an error to the figure it explains, and the figure a dead bus explains
    // is the bus. Three entries saying the same thing would push the real cause off a
    // panel that lists them.
    const refused = Object.assign(new Error('connect ENOENT /run/dbus/system_bus_socket'), {
      code: 'ENOENT',
    });
    const bus = fakeBus({ connectError: refused });
    const units = [servingUnitName(0), servingUnitName(1), FAN_SERVICE_UNIT];
    const { states, errors } = await collectUnitStates({ dbus: bus.dbus, units });
    expect(units.map((u) => states.get(u))).toEqual([null, null, null]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('dbus');
    expect(errors[0]?.message).toContain(DEFAULT_PATHS.dbusSystemSocket);
  });

  test('⚠ every requested unit is a key, even when unknown', async () => {
    // `states.get(name)` must not conflate "not asked for" with "asked for and unknown":
    // both would render an em dash, for different reasons and with different fixes.
    const bus = fakeBus({ connectError: new Error('nope') });
    const units = [servingUnitName(0), FAN_SERVICE_UNIT];
    const { states } = await collectUnitStates({ dbus: bus.dbus, units });
    expect([...states.keys()]).toEqual(units);
    expect(states.has('llama-server@9.service')).toBe(false);
  });

  test('a rejected SASL handshake is one entry and no states', async () => {
    const bus = fakeBus({ units: liveBox, authReply: 'REJECTED EXTERNAL\r\n' });
    const { states, errors } = await collectUnitStates({ dbus: bus.dbus, units: [FAN_SERVICE_UNIT] });
    expect(states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('rejected EXTERNAL');
  });

  test('⚠ bytes that are not a D-Bus message fail fast rather than waiting for the deadline', async () => {
    // `malformed` and `incomplete` are different decode kinds for exactly this reason. If
    // a protocol error were retried as "read more", the poll would burn its whole budget
    // and file an entry saying "timed out" about a peer that answered instantly.
    const bus = fakeBus({ units: liveBox, garbageAfterBegin: true });
    const started = performance.now();
    const { states, errors } = await collectUnitStates({
      dbus: bus.dbus,
      units: [FAN_SERVICE_UNIT],
      timeoutMs: 1500,
    });
    expect(performance.now() - started).toBeLessThan(500);
    expect(states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(errors[0]?.message).toContain('not a D-Bus message');
  });

  test('⚠ a 16-byte frame declaring a four-billion-byte body fails fast too — F3', async () => {
    /*
     * The endian-invalid case above is caught at byte 0. This one is not: the header parses
     * perfectly and only its *length fields* are absurd, so before the ceiling the decoder
     * answered `incomplete` and `Conversation.message()` pulled bytes until the deadline.
     * Measured: one `dbus` entry reading "timed out after 400 ms" about a peer that had
     * answered in 1 ms — the entry blames the clock and the reader looks at the network.
     *
     * ⚠ Elapsed time is the assertion, not `errors.length`. The broken implementation also
     * produces exactly one entry; it just produces it 400 ms later and with the wrong prose.
     */
    const bus = fakeBus({ units: liveBox, absurdLengthAfterBegin: true });
    const started = performance.now();
    const { states, errors } = await collectUnitStates({
      dbus: bus.dbus,
      units: [FAN_SERVICE_UNIT],
      timeoutMs: 1500,
    });
    expect(performance.now() - started).toBeLessThan(500);
    expect(states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(errors[0]?.message).toContain('not a D-Bus message');
    expect(errors[0]?.message).not.toContain('timed out');
  });

  test('⚠ a bus that accepts the socket and never answers is bounded, not a hang', async () => {
    // O17: the seam bounds `run` only. §4 samples per request, so an unbounded read here
    // hangs the telemetry route and every browser polling it.
    const bus = fakeBus({ silent: true });
    const started = performance.now();
    const { states, errors } = await collectUnitStates({
      dbus: bus.dbus,
      units: [FAN_SERVICE_UNIT],
      timeoutMs: 40,
    });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(2000);
    expect(states.get(FAN_SERVICE_UNIT)).toBeNull();
    expect(errors[0]?.message).toContain('timed out');
  });

  test('the connection is closed on every path, including the failing ones', async () => {
    const good = fakeBus({ units: liveBox });
    await collectUnitStates({ dbus: good.dbus, units: [FAN_SERVICE_UNIT] });
    expect(good.closed()).toBe(1);

    const bad = fakeBus({ units: liveBox, authReply: 'REJECTED\r\n' });
    await collectUnitStates({ dbus: bad.dbus, units: [FAN_SERVICE_UNIT] });
    expect(bad.closed()).toBe(1);
  });

  test('no units means no connection is opened at all', async () => {
    // Step 5's own caller reaches this whenever `/etc/llama-server` lists no instances.
    let connects = 0;
    const dbus: DbusIo = {
      uid: () => 1000,
      connect: () => {
        connects += 1;
        return Promise.reject(new Error('should not be called'));
      },
    };
    const { states, errors } = await collectUnitStates({ dbus, units: [] });
    expect(connects).toBe(0);
    expect([...states]).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the unit name for an instance is §6.4’s join key, derived from the index', () => {
    expect(servingUnitName(0)).toBe('llama-server@0.service');
    expect(servingUnitName(12)).toBe('llama-server@12.service');
    expect(FAN_SERVICE_UNIT).toBe('gpu-fan-control.service');
    expect(SYSTEMD_MANAGER_IFACE).toBe('org.freedesktop.systemd1.Manager');
  });
});

/**
 * ⚠ {@link nodeDbus} against a **real unix socket**, the way `io.test.ts` uses real
 * processes and `http.test.ts` real loopback servers.
 *
 * Every test above drives the fake, which is right for the conversation — and is precisely
 * why these exist: a fake cannot catch a typo in the seam, and the seam is what runs in the
 * container. Until step 5's reconciliation nothing exercised `nodeDbus` at all, which is
 * how it came to be the only bounded seam that never released its handle: `io.ts` aborts,
 * destroys both pipes and `unref()`s; `nodeHttp` destroys its `req`; `connect` created a
 * socket inside a promise the deadline abandons and nothing ever called `destroy()`.
 *
 * Sockets are created under `os.tmpdir()`. Nothing here touches `ai-server`.
 */
describe('nodeDbus — the real seam', () => {
  const servers: Server[] = [];
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ai-dashboard-dbus-'));
  });

  afterAll(async () => {
    for (const server of servers.splice(0)) server.close();
    if (dir !== '') await rm(dir, { recursive: true, force: true });
  });

  /** A unix server that echoes back whatever is written to it. */
  const listening = async (name: string): Promise<string> => {
    const path = join(dir, name);
    const server = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => socket.write(chunk));
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(path, resolve);
    });
    return path;
  };

  test('connects to a real unix socket and round-trips bytes', async () => {
    const stream = await nodeDbus.connect(await listening('echo.sock'), 1000);
    await stream.write(Uint8Array.of(1, 2, 3));
    expect([...(await stream.next())]).toEqual([1, 2, 3]);
    stream.close();
  });

  test('a missing socket path rejects with its errno, not with a 1 ms timeout', async () => {
    const failure = await nodeDbus
      .connect(join(dir, 'not-there.sock'), 1000)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(errnoCodeOf(failure)).toBe('ENOENT');
  });

  /*
   * ⚠ **Not ⚠-marked, and the reason is the point of the project's third guard rule.**
   *
   * A unix connect settles in well under a millisecond, so `setTimeout`'s 1 ms clamp is
   * cleared before it can fire and this test passes under a bound that skips
   * `boundedTimeoutMs`. It is a smoke test, not a proof. The property — *this seam's delay
   * goes through `boundedTimeoutMs`* — is a statement about a CALL, and it is covered by
   * `guardrails.test.ts`'s source-text rule, which mutation D11 reddens. That is exactly
   * the class §7 of the review named: a call that should exist and does not, which no
   * behavioural test in this file can see.
   */
  test('a nonsense timeout still connects, and the connection stays usable', async () => {
    const stream = await nodeDbus.connect(await listening('infinity.sock'), Number.POSITIVE_INFINITY);
    // The wait at least widens the window: a 1 ms clamp that fires after the connect
    // resolves destroys a live stream. It does not close it — `clearTimeout` on a
    // sub-millisecond connect gets there first — which is why this is not ⚠-marked.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await stream.write(Uint8Array.of(7));
    expect([...(await stream.next())]).toEqual([7]);
    stream.close();
  });

  test('⚠ the connect timer is cleared on success — it must not destroy a LIVE socket', async () => {
    /*
     * The destroy path's guard, and the only half of R3 a test can reach without a
     * connect that blocks. A naive implementation — `setTimeout(() => socket.destroy(), ms)`
     * with no `settled` flag and no `clearTimeout` — connects fine and then tears the
     * connection down mid-conversation, which on a real bus would arrive as an EPIPE
     * several calls later. The conversation here outlives its own connect bound by 3×.
     */
    const stream = await nodeDbus.connect(await listening('cleared.sock'), 30);
    await new Promise((resolve) => setTimeout(resolve, 90));
    await stream.write(Uint8Array.of(42));
    expect([...(await stream.next())]).toEqual([42]);
    stream.close();
  });
});
