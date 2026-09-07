/**
 * The D-Bus wire format, as much of it as §2.2's one requirement needs and no more.
 *
 * > "systemd unit state | `-v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro`
 * > | Query `ActiveState` over D-Bus. **Read-only and unprivileged — no `systemctl`
 * > shelling out, no root**."
 *
 * ### ⚠ Why this is hand-written rather than a dependency or a subprocess
 *
 * Three routes exist and two of them are closed by the spec or by the target:
 *
 * 1. **Shell out to `systemctl` or `busctl`.** §2.2 forbids the first by name, and both
 *    are systemd binaries: the image is `node:24-slim` (§2.3), which ships no systemd at
 *    all. It would work on the developer's box and fail in the container — the single
 *    worst failure shape for this project, because every test would be green.
 * 2. **A D-Bus npm package.** Invariant 6 allows a dependency with a recorded reason, but
 *    the reason would have to survive the comparison below: the *entire* protocol surface
 *    used here is three method calls whose arguments are strings and whose replies are one
 *    string each. A general marshaller for every D-Bus type is two orders of magnitude more
 *    code than that, none of it exercised, all of it shipped.
 * 3. **This file.** Pure functions over `Uint8Array`, with no IO, testable byte-for-byte
 *    against captured frames and against its own encoder.
 *
 * The narrowness is deliberate and is enforced by returning `malformed` rather than
 * guessing: **containers (`a`, `(`, `{`) are not implemented**, because no reply this
 * dashboard asks for contains one. A future caller that needs `ListUnits` must widen this
 * on purpose, with tests, rather than discover a silent misparse.
 *
 * ⚠ **Two places where this file is deliberately WIDER than the three calls it makes, and
 * the reason is the same in both.** Nine of {@link Reader.basic}'s fourteen branches — `y b
 * n q i h x t d` — are unreachable for `Hello`, `GetUnit` and `Properties.Get`, which only
 * ever carry `u s o g v`. They are kept because a header field carrying an unexpected basic
 * type would otherwise throw `Malformed`, and `Conversation.message()` turns that into a
 * thrown error that ends the **whole conversation** — blanking every unit's `ActiveState`
 * rather than one field of one reply. Decoding a `y` nobody reads costs nothing; refusing to
 * decode it costs the panel. (The file's doc used to claim "~250 lines … and no more"; it is
 * 458 lines and the generality is a decision, not an oversight.)
 *
 * ### The subset
 *
 * | | |
 * |---|---|
 * | Encoded | `METHOD_CALL` with a body of zero or more `STRING`s |
 * | Decoded | any message; body values of the **basic** types plus `VARIANT` |
 * | Endianness | encodes little-endian; **decodes both**, because the byte is the peer's |
 *
 * ### Alignment, which is where a hand-rolled codec goes wrong
 *
 * Every D-Bus value is aligned to its own type's boundary **relative to the start of the
 * message**, not to the start of the buffer it is being written into. Two sub-buffers are
 * built here — the header-field array and the body — and both are safe only because each
 * begins at a message offset that is a multiple of 8: the field array at a fixed offset 16,
 * and the body at an explicitly 8-padded offset after it. That is stated because it is an
 * invariant a later edit could quietly break, and the symptom would be a peer that closes
 * the connection with no diagnostic.
 *
 * No IO. Everything in this file is a pure function of its arguments.
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder('utf-8', { fatal: false });

/** `'l'` — the endianness byte this encoder writes. */
export const DBUS_LITTLE_ENDIAN = 0x6c;
/** `'B'` — accepted when decoding, never written. */
export const DBUS_BIG_ENDIAN = 0x42;
/** The only protocol version D-Bus has ever had. */
export const DBUS_PROTOCOL_VERSION = 1;
/** The fixed part of a message header: endian, type, flags, version, 3 × uint32. */
export const DBUS_HEADER_BYTES = 16;

/**
 * The D-Bus specification's own ceiling on a whole message: **2²⁷ bytes** (128 MiB).
 *
 * ⚠ **Without it, sixteen bytes of rubbish cost the whole budget.** `bodyLength` and
 * `fieldsLength` are raw uint32s off the wire, and the only consequence of an absurd value
 * was `bytes.length < byteLength → incomplete`, which {@link module:lib/collectors/dbus}'s
 * `Conversation.message()` answers by pulling more bytes until the deadline. Measured
 * against `collectUnitStates` with a scripted stream (`OK`, then 16 bytes declaring a
 * four-billion-byte body): **one `dbus` entry saying "timed out after 400 ms" about a peer
 * that answered in 1 ms** — verbatim the failure {@link DbusDecode}'s two kinds exist to
 * prevent. The endian-invalid case was already caught at byte 0 and fails in 1 ms; the
 * length-field case had no check at all.
 *
 * The limits are the protocol's, not invented: no legitimate systemd reply can exceed them,
 * because the specification forbids emitting one.
 */
export const DBUS_MAX_MESSAGE_BYTES = 2 ** 27;

/** The specification's ceiling on the header field array: **2²⁶ bytes**. */
export const DBUS_MAX_FIELDS_BYTES = 2 ** 26;

/** §-less: the four message types, from the D-Bus specification. */
export const DBUS_MESSAGE_TYPE = {
  methodCall: 1,
  methodReturn: 2,
  error: 3,
  signal: 4,
} as const;

/** Header field codes. Only the ones this client writes or reads are named. */
export const DBUS_HEADER_FIELD = {
  path: 1,
  interface: 2,
  member: 3,
  errorName: 4,
  replySerial: 5,
  destination: 6,
  sender: 7,
  signature: 8,
  unixFds: 9,
} as const;

/**
 * A decoded message, reduced to the five facts this client uses.
 *
 * `byteLength` is how much of the buffer the message consumed, so a caller framing a
 * stream can advance without re-deriving the arithmetic.
 */
export interface DbusMessage {
  readonly type: number;
  readonly serial: number;
  /** `REPLY_SERIAL`, present on returns and errors, absent on calls and signals. */
  readonly replySerial: number | null;
  /** `ERROR_NAME`, e.g. `org.freedesktop.systemd1.NoSuchUnit`. */
  readonly errorName: string | null;
  /** The body's signature, `''` when there is no body. */
  readonly signature: string;
  readonly body: readonly unknown[];
  readonly byteLength: number;
}

/**
 * The outcome of {@link decodeMessage}. **Total — it never throws.**
 *
 * `incomplete` and `malformed` are deliberately different: the first says *read more
 * bytes*, the second says *this connection is not speaking D-Bus and no amount of waiting
 * will fix it*. Collapsing them would turn a protocol error into a hang that only the
 * deadline could end, and the `errors[]` entry would then say "timed out" about a peer
 * that answered immediately with rubbish.
 */
export type DbusDecode =
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'malformed'; readonly problem: string }
  | { readonly kind: 'message'; readonly message: DbusMessage };

/** Thrown internally by {@link Reader} and converted at the one public boundary. */
class Incomplete extends Error {}
/** Thrown internally by {@link Reader} and converted at the one public boundary. */
class Malformed extends Error {}

const alignUp = (pos: number, to: number): number => pos + ((to - (pos % to)) % to);

/** Writes the little-endian subset {@link encodeMethodCall} needs. */
class Writer {
  private readonly out: number[] = [];

  get length(): number {
    return this.out.length;
  }

  align(to: number): void {
    while (this.out.length % to !== 0) this.out.push(0);
  }

  byte(value: number): void {
    this.out.push(value & 0xff);
  }

  uint32(value: number): void {
    this.align(4);
    this.out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  /** `STRING`/`OBJECT_PATH`: 4-aligned length, UTF-8 bytes, NUL. */
  string(value: string): void {
    const bytes = ENCODER.encode(value);
    this.uint32(bytes.length);
    for (const b of bytes) this.out.push(b);
    this.out.push(0);
  }

  /** `SIGNATURE`: 1-aligned single-byte length, ASCII bytes, NUL. */
  signature(value: string): void {
    const bytes = ENCODER.encode(value);
    this.byte(bytes.length);
    for (const b of bytes) this.out.push(b);
    this.out.push(0);
  }

  raw(bytes: Uint8Array): void {
    for (const b of bytes) this.out.push(b);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.out);
  }
}

/** One method call to encode. Arguments are strings, which is all this client sends. */
export interface DbusMethodCall {
  /** Non-zero, and unique per connection. The reply carries it back as `REPLY_SERIAL`. */
  readonly serial: number;
  readonly destination: string;
  readonly path: string;
  readonly iface: string;
  readonly member: string;
  /** Marshalled as a body of `STRING`s; `[]` means no body and no `SIGNATURE` field. */
  readonly args: readonly string[];
}

/**
 * Write one header field: a `(yv)` struct, 8-aligned, whose variant holds a single basic.
 *
 * ⚠ **`g` is not `s`.** A `SIGNATURE` carries a **one-byte** length and a `STRING` a
 * 4-byte one, and the `SIGNATURE` header field is the only place this client writes the
 * former. Writing it as a string made the field array three bytes too long, which moved
 * the 8-aligned body and left every offset after it wrong. Nothing local caught it — the
 * encoder and the decoder agreed with each other perfectly, and a round-trip test still
 * passes today with this branch removed. **systemd caught it**: it accepted `Hello`,
 * received the next frame, and closed the connection with no error message at all, so the
 * symptom was an `EPIPE` several calls later. It is the reason the frames below were
 * replayed against the live system bus rather than trusted.
 */
const headerField = (w: Writer, code: number, sig: string, value: string | number): void => {
  w.align(8);
  w.byte(code);
  w.signature(sig);
  if (sig === 'u') w.uint32(value as number);
  else if (sig === 'g') w.signature(value as string);
  else w.string(value as string);
};

/**
 * Marshal a `METHOD_CALL`.
 *
 * The `NO_REPLY_EXPECTED` flag is **never** set: every call this client makes is a
 * question, and a fire-and-forget call would be indistinguishable from a lost one.
 */
export const encodeMethodCall = (call: DbusMethodCall): Uint8Array => {
  const body = new Writer();
  for (const arg of call.args) body.string(arg);
  const bodyBytes = body.toBytes();

  const fields = new Writer();
  headerField(fields, DBUS_HEADER_FIELD.path, 'o', call.path);
  headerField(fields, DBUS_HEADER_FIELD.destination, 's', call.destination);
  headerField(fields, DBUS_HEADER_FIELD.interface, 's', call.iface);
  headerField(fields, DBUS_HEADER_FIELD.member, 's', call.member);
  if (call.args.length > 0) {
    headerField(fields, DBUS_HEADER_FIELD.signature, 'g', 's'.repeat(call.args.length));
  }
  const fieldBytes = fields.toBytes();

  const message = new Writer();
  message.byte(DBUS_LITTLE_ENDIAN);
  message.byte(DBUS_MESSAGE_TYPE.methodCall);
  message.byte(0); // flags — see the doc comment
  message.byte(DBUS_PROTOCOL_VERSION);
  message.uint32(bodyBytes.length);
  message.uint32(call.serial);
  message.uint32(fieldBytes.length);
  // ⚠ The field array starts at offset 16, a multiple of 8, so `fields`' own alignment
  // arithmetic (which counted from 0) is the message's. See the module doc.
  message.raw(fieldBytes);
  message.align(8);
  message.raw(bodyBytes);
  return message.toBytes();
};

/** Reads the basic types plus `VARIANT`. Throws {@link Incomplete} or {@link Malformed}. */
class Reader {
  // ⚠ Plain fields, not TypeScript parameter properties. Parameter properties are the one
  // class syntax Node's type-stripping loader cannot erase, and this module is worth being
  // able to run directly — the frames below were validated against the live system bus by
  // doing exactly that.
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly le: boolean;
  pos: number;

  constructor(bytes: Uint8Array, view: DataView, pos: number, le: boolean) {
    this.bytes = bytes;
    this.view = view;
    this.pos = pos;
    this.le = le;
  }

  align(to: number): void {
    this.pos = alignUp(this.pos, to);
  }

  private need(count: number): void {
    if (this.pos + count > this.bytes.length) throw new Incomplete();
  }

  byte(): number {
    this.need(1);
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  uint32(): number {
    this.align(4);
    this.need(4);
    const v = this.view.getUint32(this.pos, this.le);
    this.pos += 4;
    return v;
  }

  string(): string {
    const length = this.uint32();
    this.need(length + 1);
    const s = DECODER.decode(this.bytes.subarray(this.pos, this.pos + length));
    this.pos += length + 1; // + the NUL terminator, which is not part of the value
    return s;
  }

  signature(): string {
    const length = this.byte();
    this.need(length + 1);
    const s = DECODER.decode(this.bytes.subarray(this.pos, this.pos + length));
    this.pos += length + 1;
    return s;
  }

  /**
   * One value of a **single-character** signature.
   *
   * ⚠ Containers throw {@link Malformed} rather than being skipped. A skipped container
   * would desynchronise the reader by an unknown number of bytes and every subsequent
   * value would be silently wrong — the failure this whole module is narrow to avoid.
   */
  basic(sig: string): unknown {
    switch (sig) {
      case 'y':
        return this.byte();
      case 'b': {
        const v = this.uint32();
        return v !== 0;
      }
      case 'n':
      case 'q': {
        this.align(2);
        this.need(2);
        const v = sig === 'n' ? this.view.getInt16(this.pos, this.le) : this.view.getUint16(this.pos, this.le);
        this.pos += 2;
        return v;
      }
      case 'i': {
        this.align(4);
        this.need(4);
        const v = this.view.getInt32(this.pos, this.le);
        this.pos += 4;
        return v;
      }
      case 'u':
      case 'h':
        return this.uint32();
      case 'x':
      case 't': {
        this.align(8);
        this.need(8);
        const v = sig === 'x' ? this.view.getBigInt64(this.pos, this.le) : this.view.getBigUint64(this.pos, this.le);
        this.pos += 8;
        return v;
      }
      case 'd': {
        this.align(8);
        this.need(8);
        const v = this.view.getFloat64(this.pos, this.le);
        this.pos += 8;
        return v;
      }
      case 's':
      case 'o':
        return this.string();
      case 'g':
        return this.signature();
      case 'v':
        return this.basic(this.signature());
      default:
        throw new Malformed(`unsupported D-Bus type \`${sig}\``);
    }
  }
}

/**
 * Decode the first complete message in `bytes`.
 *
 * Returns `incomplete` when the buffer holds only part of a message — the normal case
 * while framing a stream — and `malformed` when it holds something that is not a message.
 *
 * ⚠ **The length ceiling is checked BEFORE the "have I got all the bytes yet" test**, and
 * that ordering is the whole point: an over-long declared length must be *"this is not
 * D-Bus"* and never *"read more"*. See {@link DBUS_MAX_MESSAGE_BYTES}. One check here also
 * covers the two sites a reader would otherwise want their own guards on —
 * `Reader.string()`'s four-billion-byte length and `Reader.signature()`'s 255-byte one both
 * reach `need()` only after this function has already returned `malformed`, and the body
 * reader is built on `bytes.subarray(0, byteLength)`.
 */
export const decodeMessage = (bytes: Uint8Array): DbusDecode => {
  if (bytes.length < DBUS_HEADER_BYTES) return { kind: 'incomplete' };
  const endian = bytes[0];
  if (endian !== DBUS_LITTLE_ENDIAN && endian !== DBUS_BIG_ENDIAN) {
    return { kind: 'malformed', problem: `unknown endianness byte 0x${(endian ?? 0).toString(16)}` };
  }
  const le = endian === DBUS_LITTLE_ENDIAN;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[3] !== DBUS_PROTOCOL_VERSION) {
    return { kind: 'malformed', problem: `unsupported protocol version ${String(bytes[3])}` };
  }

  const type = bytes[1] ?? 0;
  const bodyLength = view.getUint32(4, le);
  const serial = view.getUint32(8, le);
  const fieldsLength = view.getUint32(12, le);
  const bodyStart = alignUp(DBUS_HEADER_BYTES + fieldsLength, 8);
  const byteLength = bodyStart + bodyLength;
  if (fieldsLength > DBUS_MAX_FIELDS_BYTES) {
    return {
      kind: 'malformed',
      problem: `header field array claims ${String(fieldsLength)} bytes, above D-Bus's ${String(DBUS_MAX_FIELDS_BYTES)}`,
    };
  }
  if (byteLength > DBUS_MAX_MESSAGE_BYTES) {
    return {
      kind: 'malformed',
      problem: `message claims ${String(byteLength)} bytes, above D-Bus's ${String(DBUS_MAX_MESSAGE_BYTES)}`,
    };
  }
  if (bytes.length < byteLength) return { kind: 'incomplete' };

  try {
    const reader = new Reader(bytes, view, DBUS_HEADER_BYTES, le);
    const fieldsEnd = DBUS_HEADER_BYTES + fieldsLength;
    let replySerial: number | null = null;
    let errorName: string | null = null;
    let signature = '';
    while (reader.pos < fieldsEnd) {
      reader.align(8);
      if (reader.pos >= fieldsEnd) break;
      const code = reader.byte();
      const value = reader.basic('v');
      if (code === DBUS_HEADER_FIELD.replySerial && typeof value === 'number') replySerial = value;
      else if (code === DBUS_HEADER_FIELD.errorName && typeof value === 'string') errorName = value;
      else if (code === DBUS_HEADER_FIELD.signature && typeof value === 'string') signature = value;
    }

    const body: unknown[] = [];
    if (signature !== '') {
      const bodyReader = new Reader(bytes.subarray(0, byteLength), view, bodyStart, le);
      for (const sig of signature) body.push(bodyReader.basic(sig));
    }
    return { kind: 'message', message: { type, serial, replySerial, errorName, signature, body, byteLength } };
  } catch (e) {
    if (e instanceof Incomplete) return { kind: 'incomplete' };
    if (e instanceof Malformed) return { kind: 'malformed', problem: e.message };
    return { kind: 'malformed', problem: e instanceof Error ? e.message : 'decode failed' };
  }
};

// ---------------------------------------------------------------------------
// SASL — the text handshake that precedes every binary message
// ---------------------------------------------------------------------------

/**
 * The lone NUL byte that must be the **first** thing written on the socket, before any
 * SASL line. It is not part of the auth protocol; it exists so the kernel has a datum to
 * attach `SO_PEERCRED` to, which is exactly what makes `EXTERNAL` work.
 */
export const DBUS_AUTH_NUL = Uint8Array.of(0);

/** `BEGIN` ends the handshake; every byte after it is a marshalled message. */
export const DBUS_AUTH_BEGIN = 'BEGIN\r\n';

/** Hex-encode ASCII, which is how SASL carries the `EXTERNAL` identity. */
export const hexAscii = (text: string): string =>
  [...ENCODER.encode(text)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * The `AUTH EXTERNAL` line for a uid.
 *
 * `EXTERNAL` proves nothing by itself: the *kernel* supplies the peer's real uid over the
 * unix socket and the bus compares it with this line. So this is a claim the bus checks,
 * not a credential — which is why the container needs no secret and no root (§2.2), and
 * why a wrong uid is rejected rather than believed.
 */
export const authExternalLine = (uid: number): string => `AUTH EXTERNAL ${hexAscii(String(uid))}\r\n`;

/** What the bus said in reply to `AUTH`. */
export type DbusAuthReply = 'ok' | 'rejected' | 'data' | 'error' | 'unknown';

/**
 * Classify one CRLF-terminated SASL reply line.
 *
 * `data` is listed because the bus may ask for the identity separately when the `AUTH`
 * line carried none. This client always sends one, so `data` is a protocol surprise rather
 * than a step to implement, and it is reported as such instead of being answered blindly.
 */
export const classifyAuthReply = (line: string): DbusAuthReply => {
  const said = line.trim();
  if (said.startsWith('OK')) return 'ok';
  if (said.startsWith('REJECTED')) return 'rejected';
  if (said.startsWith('DATA')) return 'data';
  if (said.startsWith('ERROR')) return 'error';
  return 'unknown';
};
