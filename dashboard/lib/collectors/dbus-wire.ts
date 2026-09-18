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
 * guessing: **structs (`(`) and dict entries (`{`) are not implemented**, because no reply
 * this dashboard asks for contains one. A future caller that needs `ListUnits` must widen
 * this on purpose, with tests, rather than discover a silent misparse.
 *
 * ### ⚠ 12b — ARRAYS of a single basic type, and nothing wider
 *
 * §3.4's `gpus` is read from the unit's own `CUDA_VISIBLE_DEVICES`, which lives in
 * `org.freedesktop.systemd1.Service`'s **`Environment`** property — a `v` carrying an `as`.
 * That is the first container this dashboard has ever had to decode, so {@link Reader} grew
 * exactly one: `a` followed by ONE basic type character. `a(`, `a{` and `aa` still return
 * `malformed`, for the reason the whole module is narrow — a container skipped by guesswork
 * desynchronises the reader by an unknown number of bytes and every value after it is
 * silently wrong.
 *
 * ⚠ **An array's declared length is checked BEFORE its bytes are read**, in both directions,
 * and the reason is the one {@link DBUS_MAX_MESSAGE_BYTES} records: a length field the reader
 * merely *waits* for turns a peer that answered instantly into a `dbus` entry saying "timed
 * out". `decodeMessage` has already established that the whole message is present, so an
 * array claiming more bytes than the message holds is **malformed**, never `incomplete`.
 *
 * ⚠ **Two places where this file is deliberately WIDER than the three calls it makes, and
 * the reason is the same in both.** Nine of {@link Reader.basic}'s fourteen branches — `y b
 * n q i h x t d` — are unreachable for `Hello`, `GetUnit` and `Properties.Get`, which only
 * ever carry `u s o g v`. They are kept because a header field carrying an unexpected basic
 * type would otherwise throw `Malformed`, and `Conversation.message()` turns that into a
 * thrown error that ends the **whole conversation** — blanking every unit's `ActiveState`
 * rather than one field of one reply. Decoding a `y` nobody reads costs nothing; refusing to
 * decode it costs the panel. (The file's doc used to claim "~250 lines … and no more"; it is
 * several times that, and the generality is a decision rather than an oversight. ⚠ 12b-TEST
 * removed the exact figure that stood here — it said 458 and the file was already longer. A
 * number in a comment is a claim that goes stale in silence, which is the same failure as the
 * `need()` claim corrected under {@link decodeMessage}, in a cheaper place.)
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
 * ⚠ **It moves that failure's threshold; it does not close it, and the claim that used to
 * stand here said otherwise.** `bodyLength` and `fieldsLength` are raw uint32s off the wire,
 * and the only consequence of an absurd value was `bytes.length < byteLength → incomplete`,
 * which {@link module:lib/collectors/dbus}'s `Conversation.message()` answers by pulling more
 * bytes until the deadline. Measured against `collectUnitStates` with a scripted stream
 * (`OK`, then 16 bytes declaring a four-billion-byte body): **one `dbus` entry saying "timed
 * out after 400 ms" about a peer that answered in 1 ms** — verbatim the failure
 * {@link DbusDecode}'s two kinds exist to prevent. What this constant does is refuse the
 * declarations D-Bus itself forbids; every declaration *at or under* the ceiling is still
 * waited for, because a stream decoder cannot tell an inflated length from a large message
 * until the bytes arrive. Measured 2026-09-17, one byte apart: 16 bytes declaring `2**27`
 * exactly → **timed out after 300 ms**; declaring `2**27 + 1` → `malformed` in **7 ms**.
 * ⚠ The line that used to stand here — *"without it, sixteen bytes of rubbish cost the whole
 * budget"* — is true of `2**32` and false of `2**27 + 1`, which is the same class of mistake
 * as the `need()` sentence corrected under {@link decodeMessage}: a written claim standing in
 * for a measurement. The self-contradiction a header CAN prove on its own — a `bodyLength`
 * with no signature to read it — is now refused by {@link Reader.region}'s rule 3, but that
 * needs the bytes too.
 *
 * The limits are the protocol's, not invented: no legitimate systemd reply can exceed them,
 * because the specification forbids emitting one.
 */
export const DBUS_MAX_MESSAGE_BYTES = 2 ** 27;

/** The specification's ceiling on the header field array: **2²⁶ bytes**. */
export const DBUS_MAX_FIELDS_BYTES = 2 ** 26;

/**
 * The specification's ceiling on **any** array: **2²⁶ bytes** (64 MiB).
 *
 * ⚠ It is not redundant with {@link DBUS_MAX_MESSAGE_BYTES}. That one bounds the *declared*
 * message, which is why an over-long message is `malformed` rather than "read more"; this one
 * bounds a length field **inside** a body that has already been fully received, where the
 * failure is different — a four-billion-byte array length inside a 40-byte reply would make
 * `Reader.array` allocate against a loop bound taken from the wire. The limit is the
 * protocol's, not invented: systemd cannot legally emit an array above it.
 */
export const DBUS_MAX_ARRAY_BYTES = 2 ** 26;

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
  /**
   * The end of the innermost region a declared length has opened — see {@link region}. It
   * starts as the whole frame, because **the frame is itself a region**: `decodeMessage`
   * cut it to the byte count the message's own header declared.
   */
  private limit: number;
  /** What declared {@link limit}. Carried only so a diagnosis can name the region. */
  private declaredBy: string;
  pos: number;

  constructor(bytes: Uint8Array, view: DataView, pos: number, le: boolean) {
    this.bytes = bytes;
    this.view = view;
    this.pos = pos;
    this.le = le;
    this.limit = bytes.length;
    this.declaredBy = 'message';
  }

  align(to: number): void {
    this.pos = alignUp(this.pos, to);
  }

  /**
   * ⚠ **Rule 2 of {@link region}: bounded by the region that declared the value, not by the
   * buffer and not by the frame.** The {@link Incomplete} it raises carries its own sentence
   * because by the time it is converted at {@link decodeMessage}'s boundary the region that
   * was overrun is no longer on the stack.
   */
  private need(count: number): void {
    if (this.pos + count > this.limit) {
      throw new Incomplete(`a value in the ${this.declaredBy} overran its declared length`);
    }
  }

  /**
   * ⚠⚠ **THE INVARIANT, stated once: a declared length is a REGION.**
   *
   * Every byte this codec reads sits inside some count the *peer* supplied — the message's
   * own `bodyLength`, its `fieldsLength`, an array's byte count. Three rules follow, and
   * they are the same three every time:
   *
   * 1. a region must FIT the region that declared it;
   * 2. nothing inside it may read past its end;
   * 3. its values must account for EXACTLY its bytes — stopping short is the same lie as
   *    running over, told in the other direction.
   *
   * ⚠ **Rule 3 is the one that was stated only here, for arrays, and nowhere else** — and it
   * is the one that costs the most when it is missing. {@link decodeMessage} returns
   * `byteLength` and `Conversation.message()` advances the stream by it, so a message whose
   * values stop short of its own declared length **eats the next message**. Measured on the
   * real captured `GetUnit` reply, 2026-09-17: one flipped byte at offset 4 yields a
   * perfectly well-formed message — right serial, right object path — declaring 191 bytes
   * instead of 96, and the 95 bytes of the *following* reply are discarded. End to end that
   * turned `active` in 2 ms into `null` and *"timed out after 300 ms"* about a bus that had
   * already answered.
   *
   * ⚠ **Rule 2 is why {@link need} bounds on {@link limit} and not on the buffer.** A header
   * field whose value overran the *field array* used to read on into the BODY and still
   * return a message: `errorName` decoded out of the unit's own environment strings, then
   * interpolated into an `errors[]` sentence on a panel. Bounding the reads at the frame —
   * which is what 12b's test phase fixed — is not the same as bounding them at the region
   * that declared them.
   *
   * ⚠ **An {@link Incomplete} raised inside a region is `malformed`, never "read more".**
   * {@link decodeMessage} has already established that every declared byte is present, so a
   * length inside the message pointing past its own region is a lie no waiting can repair;
   * answering `incomplete` is the documented failure where a peer that replied in one
   * millisecond is reported as a timeout. See {@link DBUS_MAX_MESSAGE_BYTES}. The conversion
   * stays at {@link decodeMessage}'s boundary — the one place this module turns a throw into
   * a value — and the sentence {@link need} raises is what names the region it happened in.
   *
   * ⚠ **Do not add a fourth bounds check beside these.** A new reader that needs one needs a
   * region instead — that is what this method is for. Three phases of one loop each found a
   * different symptom of rule 3 going unstated: the build shipped it, the test phase bounded
   * two readers, the adversarial found the rule. `12b-reconciliation.md` records it.
   */
  region<T>(what: string, declared: number, read: (end: number) => T): T {
    const start = this.pos;
    const end = start + declared;
    if (end > this.limit) {
      throw new Malformed(`${what} claims ${String(declared)} bytes, past the end of the ${this.declaredBy}`);
    }
    const outerLimit = this.limit;
    const outerDeclaredBy = this.declaredBy;
    this.limit = end;
    this.declaredBy = what;
    try {
      const value = read(end);
      if (this.pos !== end) {
        throw new Malformed(
          `the ${what} declared ${String(declared)} bytes and its values account for ${String(this.pos - start)}`,
        );
      }
      return value;
    } finally {
      this.limit = outerLimit;
      this.declaredBy = outerDeclaredBy;
    }
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
        // ⚠ A variant's own signature is ONE complete type, and since 12b that type may be
        // an array — `Environment` arrives as `v` wrapping `as`. Reading it with `basic`
        // would have thrown `Malformed` on the leading `a`, which `Conversation.message()`
        // turns into a thrown error that ends the WHOLE conversation.
        return this.value(this.signature());
      default:
        throw new Malformed(`unsupported D-Bus type \`${sig}\``);
    }
  }

  /**
   * One value of a **complete** type signature — a basic type, or `a` + one basic type.
   *
   * ⚠ Every other container is {@link Malformed} by construction: the check is that what
   * follows `a` is exactly one character and that {@link basic} knows it, so `a(ii)`, `a{sv}`
   * and `aas` are refused rather than half-read. See the module doc.
   */
  value(sig: string): unknown {
    if (sig.length === 1) return this.basic(sig);
    if (sig.length === 2 && sig.startsWith('a')) return this.array(sig.slice(1));
    throw new Malformed(`unsupported D-Bus type \`${sig}\``);
  }

  /**
   * `a<basic>`: a 4-aligned uint32 **byte count**, then the elements, each aligned to its own
   * type's boundary.
   *
   * ⚠ **The padding after the length belongs to the array, not to the first element**, and it
   * is present even when the array is EMPTY — `Environment` on a unit with no `Environment=`
   * directive is exactly that frame, captured from this box on 2026-09-17. Reading the
   * element alignment only when there is an element to read would leave the cursor short and
   * every value after it wrong.
   *
   * ⚠ **The count is a REGION, and {@link region} is where that is stated** — this reader
   * used to carry its own copy of the two rules and was the only caller that had them, which
   * is exactly how the message itself came to have neither. The count fitting the message,
   * the elements not reading past it, and the elements accounting for all of it are all
   * {@link region}'s; the only thing left here is D-Bus's own ceiling, which is about what is
   * *legal* rather than about what fits. See {@link DBUS_MAX_ARRAY_BYTES}.
   */
  array(elementSig: string): unknown[] {
    const bytes = this.uint32();
    if (bytes > DBUS_MAX_ARRAY_BYTES) {
      throw new Malformed(
        `array claims ${String(bytes)} bytes, above D-Bus's ${String(DBUS_MAX_ARRAY_BYTES)}`,
      );
    }
    this.align(alignmentOf(elementSig));
    return this.region('array', bytes, (end) => {
      const out: unknown[] = [];
      while (this.pos < end) out.push(this.basic(elementSig));
      return out;
    });
  }
}

/**
 * The boundary a value of `sig` is aligned to, per the D-Bus specification's type table.
 *
 * Written out rather than derived, because the one that looks wrong is right: `b` (BOOLEAN)
 * is marshalled as a **uint32** and is therefore 4-aligned, not 1. `v` and `g` are 1-aligned
 * because both begin with a single-byte length.
 *
 * ⚠ **Exported only so the table can be read against the specification.** It is reached from
 * exactly one place — {@link Reader.array}, for the padding after an array's length — and the
 * cursor there is always 4-aligned already (the length is a `uint32`, which aligns itself), so
 * every row below 8 is INVISIBLE through a decode: `v`'s 1 and `s`'s 4 produce identical
 * bytes for every frame this codec can be handed. 12b's adversarial found `case 'v': return 1`
 * → `4` — a D-Bus specification violation — with all 3634 tests green, and it is green for
 * that reason rather than for want of a frame to try. A table whose rows cannot be observed
 * one at a time has to be asserted as a table.
 */
export const alignmentOf = (sig: string): number => {
  switch (sig) {
    case 'y':
    case 'g':
    case 'v':
      return 1;
    case 'n':
    case 'q':
      return 2;
    case 'b':
    case 'i':
    case 'u':
    case 'h':
    case 's':
    case 'o':
      return 4;
    case 'x':
    case 't':
    case 'd':
      return 8;
    default:
      throw new Malformed(`unsupported D-Bus type \`${sig}\``);
  }
};

/**
 * Split a body signature into complete types — `ss` → `['s','s']`, `as` → `['as']`.
 *
 * ⚠ **The body loop used to be `for (const sig of signature)`, one CHARACTER at a time**, and
 * that is only correct while every type is one character. A body of `as` would have been read
 * as an `a` (malformed) followed by an `s`; a body of `sas` as three basics. Since 12b the
 * loop asks this function instead, and anything it cannot split is `malformed` rather than
 * guessed.
 */
const completeTypes = (signature: string): string[] => {
  const out: string[] = [];
  let at = 0;
  while (at < signature.length) {
    const head = signature[at];
    if (head === 'a') {
      const element = signature[at + 1];
      if (element === undefined) throw new Malformed('signature ends with a bare `a`');
      out.push(`a${element}`);
      at += 2;
      continue;
    }
    if (head === undefined) throw new Malformed('signature ended unexpectedly');
    out.push(head);
    at += 1;
  }
  return out;
};

/**
 * Decode the first complete message in `bytes`.
 *
 * Returns `incomplete` when the buffer holds only part of a message — the normal case
 * while framing a stream — and `malformed` when it holds something that is not a message.
 *
 * ⚠ **The length ceiling is checked BEFORE the "have I got all the bytes yet" test**, and
 * that ordering is the whole point: an over-long declared length must be *"this is not
 * D-Bus"* and never *"read more"*. See {@link DBUS_MAX_MESSAGE_BYTES}.
 *
 * ⚠⚠ **12b-TEST — the claim that used to stand here was FALSE, and it mattered.** It said
 * that one check "also covers the two sites a reader would otherwise want their own guards
 * on — `Reader.string()`'s four-billion-byte length and `Reader.signature()`'s 255-byte
 * one". It does not: the ceiling bounds the *message*, and a string length inside a
 * legal-sized, fully-received body reached `need()` and threw {@link Incomplete}, which this
 * function returned as `incomplete` — *read more bytes* about a message that was entirely
 * present. `Reader.array` was given its own guard for exactly this in 12b; the string, the
 * signature and every alignment inside a body had none. The guard now lives at the one place
 * that covers all of them: **after the "have I got all the bytes" test, an `Incomplete` is
 * `malformed`.** See the `catch` below.
 *
 * ⚠⚠ **12b-RECONCILE — and that was still the second of three layers.** Bounding the reads
 * said nothing about the number they were bounded BY: this function waited for `byteLength`
 * bytes, cut the frame to exactly that, read the fields and the body — and never checked that
 * what it read accounted for them. One flipped byte at offset 4 of the real captured `GetUnit`
 * reply returns a well-formed message declaring 191 bytes instead of 96, and
 * `Conversation.message()` advances the stream by that number: the next reply's first 95
 * bytes are gone. The rule is {@link Reader.region}'s and it is stated once there; this
 * function is one of its three callers. **A bounds check that is not stated as an invariant
 * gets re-found as a symptom, once per phase.**
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

  // ⚠⚠ **The frame is the OUTERMOST region** — {@link Reader} takes its initial `limit` from
  // the buffer it is given, so cutting the buffer to the byte count this message's own header
  // declared is what makes "the message" a region like any other. 12b's test phase added it
  // to stop a header field reading into the NEXT MESSAGE's bytes; 12b's reconciliation made
  // the field array and the body regions of their own, which bound tighter still. Both
  // statements are the same rule at different scales, and {@link Reader.region} is where it is
  // written down. See the `⚠ nothing is read past the frame` tests.
  const frame = bytes.subarray(0, byteLength);

  try {
    const reader = new Reader(frame, view, DBUS_HEADER_BYTES, le);
    const fieldsEnd = DBUS_HEADER_BYTES + fieldsLength;
    let replySerial: number | null = null;
    let errorName: string | null = null;
    let signature = '';
    // ⚠⚠ 12b-RECONCILE — **the header field array is a REGION** ({@link Reader.region}), which
    // is the boundary that actually applies to a field: `fieldsLength` is what declared it.
    // The frame is the wrong boundary here even though it is the tighter-sounding one — a
    // field value bounded only by the frame reads on into the BODY, the loop then exits
    // because the cursor is past `fieldsEnd`, and the decode returns a message whose
    // `errorName` is made of the unit's own environment strings.
    reader.region('header field array', fieldsLength, () => {
      while (reader.pos < fieldsEnd) {
        reader.align(8);
        if (reader.pos >= fieldsEnd) break;
        const code = reader.byte();
        const value = reader.basic('v');
        if (code === DBUS_HEADER_FIELD.replySerial && typeof value === 'number') replySerial = value;
        else if (code === DBUS_HEADER_FIELD.errorName && typeof value === 'string') errorName = value;
        else if (code === DBUS_HEADER_FIELD.signature && typeof value === 'string') signature = value;
      }
    });

    const body: unknown[] = [];
    const bodyReader = new Reader(frame, view, bodyStart, le);
    // ⚠⚠ 12b-RECONCILE — **the message's own body is a region too, and it is entered even when
    // the signature is EMPTY.** A `bodyLength` with no signature to read it is a
    // self-contradiction the header alone proves, and rule 3 is what proves it: zero values
    // cannot account for a declared 95 bytes. This is the check whose absence let one flipped
    // byte at offset 4 eat the next reply — see {@link Reader.region}.
    bodyReader.region('message body', bodyLength, () => {
      for (const sig of completeTypes(signature)) body.push(bodyReader.value(sig));
    });
    return { kind: 'message', message: { type, serial, replySerial, errorName, signature, body, byteLength } };
  } catch (e) {
    // ⚠⚠ 12b-TEST — **an {@link Incomplete} raised HERE is `malformed`, not "read more".**
    //
    // Every genuinely-short buffer has already been answered above: `bytes.length <
    // DBUS_HEADER_BYTES` and `bytes.length < byteLength` are both returned before this
    // `try`, and both readers are built on {@link frame}, which is exactly the message the
    // header declared. So the only way {@link Reader.need} can fail from here is a length
    // field INSIDE a fully-received message pointing past that message's own end — a lie
    // the peer told, which no amount of waiting will repair.
    //
    // ⚠ It is the same lesson as {@link DBUS_MAX_ARRAY_BYTES} and {@link
    // DBUS_MAX_MESSAGE_BYTES}, on the two paths those two do not cover. Measured before this
    // line existed: a 46-byte `METHOD_RETURN` whose body `STRING` declared 4096 bytes
    // decoded as `incomplete`, and `Conversation.message()` answers that by pulling bytes
    // until the deadline — **one `dbus` entry saying "timed out after 2 s" about a peer that
    // answered in one millisecond**, verbatim the failure {@link DbusDecode}'s two kinds
    // exist to prevent. `Reader.array` had its own guard for this and `Reader.string`,
    // `Reader.signature` and every alignment inside a body did not; the module doc claimed
    // otherwise, which is how it survived.
    if (e instanceof Incomplete) {
      return { kind: 'malformed', problem: e.message };
    }
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
