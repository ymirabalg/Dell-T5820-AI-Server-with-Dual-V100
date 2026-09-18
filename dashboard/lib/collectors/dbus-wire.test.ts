/**
 * The D-Bus codec (§2.2).
 *
 * ⚠ **The load-bearing tests here are the ones that decode frames captured from this box's
 * real system bus**, not the round-trip ones. A round trip only proves the encoder and the
 * decoder agree with each other, and they did agree — perfectly — while the encoder was
 * writing a `SIGNATURE` header field with a 4-byte length instead of a 1-byte one. systemd
 * accepted `Hello`, then closed the connection on the next frame with no diagnostic. The
 * bug was found by replaying the encoder's own bytes at the live bus, and the frames it
 * sent back are `samples.ts`'s `CAPTURED_DBUS_*`.
 *
 * Nothing in this file does IO.
 */

import { describe, expect, test } from 'vitest';

import {
  DBUS_BIG_ENDIAN,
  DBUS_HEADER_BYTES,
  DBUS_HEADER_FIELD,
  DBUS_LITTLE_ENDIAN,
  DBUS_MAX_ARRAY_BYTES,
  DBUS_MAX_FIELDS_BYTES,
  DBUS_MAX_MESSAGE_BYTES,
  DBUS_MESSAGE_TYPE,
  DBUS_PROTOCOL_VERSION,
  authExternalLine,
  classifyAuthReply,
  alignmentOf,
  decodeMessage,
  encodeMethodCall,
  hexAscii,
} from './dbus-wire';
import type { DbusMessage } from './dbus-wire';
import {
  CAPTURED_DBUS_ACTIVE_STATE_REPLY,
  CAPTURED_DBUS_AUTH_OK,
  CAPTURED_DBUS_EMPTY_ENVIRONMENT_REPLY,
  CAPTURED_DBUS_ENVIRONMENT_REPLY,
  CAPTURED_DBUS_ENVIRONMENT_REPLY_INSTANCE_1,
  CAPTURED_DBUS_GET_UNIT_REPLY,
  CAPTURED_DBUS_HELLO_REPLY,
  CAPTURED_DBUS_NO_SUCH_UNIT_ERROR,
} from './samples';

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from((hex.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)));

/** The one decoded message a frame holds, or a failure with the decode kind in the message. */
const decodeOne = (hex: string): DbusMessage => {
  const decoded = decodeMessage(bytes(hex));
  if (decoded.kind !== 'message') throw new Error(`expected a message, got ${decoded.kind}`);
  return decoded.message;
};

const GET_UNIT = {
  serial: 2,
  destination: 'org.freedesktop.systemd1',
  path: '/org/freedesktop/systemd1',
  iface: 'org.freedesktop.systemd1.Manager',
  member: 'GetUnit',
  args: ['llama-server@0.service'],
} as const;

describe('decoding frames captured from the live system bus', () => {
  test('⚠ Hello returns the unique name AND a NameAcquired signal in ONE read', () => {
    // 2026-09-06, measured: the bus sent both messages in a single 262-byte chunk. A client
    // that treated "the next message" as its reply would read the signal's body as its next
    // answer and be wrong for the rest of the connection.
    const buffer = bytes(CAPTURED_DBUS_HELLO_REPLY);
    const first = decodeMessage(buffer);
    expect(first.kind).toBe('message');
    if (first.kind !== 'message') return;
    expect(first.message.type).toBe(DBUS_MESSAGE_TYPE.methodReturn);
    expect(first.message.replySerial).toBe(1);
    expect(first.message.body).toEqual([':1.102']);

    const second = decodeMessage(buffer.subarray(first.message.byteLength));
    expect(second.kind).toBe('message');
    if (second.kind !== 'message') return;
    expect(second.message.type).toBe(DBUS_MESSAGE_TYPE.signal);
    // ⚠ The distinguishing fact: a signal carries no REPLY_SERIAL at all.
    expect(second.message.replySerial).toBeNull();
    // Together they account for the whole capture, so no third message is being ignored.
    expect(first.message.byteLength + second.message.byteLength).toBe(buffer.length);
  });

  test('GetUnit returns the unit object path, typed `o`', () => {
    const message = decodeOne(CAPTURED_DBUS_GET_UNIT_REPLY);
    expect(message.type).toBe(DBUS_MESSAGE_TYPE.methodReturn);
    expect(message.replySerial).toBe(2);
    expect(message.signature).toBe('o');
    expect(message.body).toEqual(['/org/freedesktop/systemd1/unit/llama_2dserver_400_2eservice']);
  });

  test('⚠ Properties.Get returns a VARIANT, and the string inside it is the ActiveState', () => {
    const message = decodeOne(CAPTURED_DBUS_ACTIVE_STATE_REPLY);
    expect(message.signature).toBe('v');
    // A decoder that stopped at the variant's own signature would yield `'s'` here — the
    // type name — which is a non-empty string and would sail through every later check.
    expect(message.body).toEqual(['active']);
  });

  test('⚠ an unloaded unit is an ERROR message carrying NoSuchUnit, not a state', () => {
    const message = decodeOne(CAPTURED_DBUS_NO_SUCH_UNIT_ERROR);
    expect(message.type).toBe(DBUS_MESSAGE_TYPE.error);
    expect(message.errorName).toBe('org.freedesktop.systemd1.NoSuchUnit');
    expect(message.replySerial).toBe(4);
    expect(message.body).toEqual(['Unit llama-server@7.service not loaded.']);
  });
});

describe('encoding a method call', () => {
  test('⚠ the SIGNATURE header field is a `g`, whose length is ONE byte, not four', () => {
    // The bug the live bus found. `g` and `s` differ only in the width of their length
    // prefix, so writing a signature as a string makes the field array 3 bytes longer,
    // moves the 8-aligned body, and desynchronises everything after it — while every
    // local round trip still passes, because the decoder makes the same mistake.
    const frame = encodeMethodCall(GET_UNIT);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const fieldsLength = view.getUint32(12, true);
    const bodyLength = view.getUint32(4, true);

    // Walk to the SIGNATURE field and assert its encoding directly.
    const at = frame.indexOf(DBUS_HEADER_FIELD.signature, DBUS_HEADER_BYTES);
    expect(frame[at]).toBe(DBUS_HEADER_FIELD.signature);
    expect(frame[at + 1]).toBe(1); // the variant's own signature: length 1
    expect(frame[at + 2]).toBe(0x67); // 'g'
    expect(frame[at + 3]).toBe(0); // NUL
    expect(frame[at + 4]).toBe(1); // ⚠ the SIGNATURE value's length — ONE byte
    expect(frame[at + 5]).toBe(0x73); // 's'
    expect(frame[at + 6]).toBe(0); // NUL

    // …and the length that the bug moved: 151, not the 154 a 4-byte prefix produces.
    expect(fieldsLength).toBe(151);
    // 4-byte length + 22 characters + NUL.
    expect(bodyLength).toBe(27);
  });

  test('the fixed header is little-endian, a METHOD_CALL, version 1, and carries the serial', () => {
    const frame = encodeMethodCall(GET_UNIT);
    expect(frame[0]).toBe(DBUS_LITTLE_ENDIAN);
    expect(frame[1]).toBe(DBUS_MESSAGE_TYPE.methodCall);
    // ⚠ Flags 0: NO_REPLY_EXPECTED is never set. A fire-and-forget call is
    // indistinguishable from a lost one, and every call here is a question.
    expect(frame[2]).toBe(0);
    expect(frame[3]).toBe(DBUS_PROTOCOL_VERSION);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    expect(view.getUint32(8, true)).toBe(GET_UNIT.serial);
  });

  test('the body starts on an 8-byte boundary', () => {
    // Not decoration: every alignment in the message is relative to its start, so a body
    // that begins off an 8-boundary makes every value in it wrong by 1–7 bytes.
    const frame = encodeMethodCall(GET_UNIT);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const bodyStart = frame.byteLength - view.getUint32(4, true);
    expect(bodyStart % 8).toBe(0);
  });

  test('a call with no arguments has no body and no SIGNATURE field', () => {
    const frame = encodeMethodCall({ ...GET_UNIT, member: 'Hello', args: [] });
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    expect(view.getUint32(4, true)).toBe(0);
    expect(frame.indexOf(DBUS_HEADER_FIELD.signature, DBUS_HEADER_BYTES)).toBe(-1);
  });

  test('two arguments produce the signature `ss`, so Properties.Get is marshalled correctly', () => {
    const frame = encodeMethodCall({
      ...GET_UNIT,
      member: 'Get',
      args: ['org.freedesktop.systemd1.Unit', 'ActiveState'],
    });
    const at = frame.indexOf(DBUS_HEADER_FIELD.signature, DBUS_HEADER_BYTES);
    expect(frame[at + 4]).toBe(2);
    expect(frame[at + 5]).toBe(0x73);
    expect(frame[at + 6]).toBe(0x73);
  });

  test('⚠ UTF-8 arguments are measured in bytes, not characters', () => {
    // A length in characters truncates the value and leaves the reader short for every
    // field after it. ⚠ The body's total byte count does NOT change under that bug — only
    // the string's own length prefix does — so the assertion has to be on the decoded
    // VALUE. Asserting the header length alone is a test that names a property it does not
    // check, and the regression harness found exactly that here.
    const frame = encodeMethodCall({ ...GET_UNIT, args: ['é.service'] });
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    expect(view.getUint32(4, true)).toBe(4 + 10 + 1);
    const decoded = decodeMessage(frame);
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual(['é.service']);
  });
});

describe('the encoder and the decoder agree', () => {
  test.each([
    ['no arguments', [] as readonly string[]],
    ['one', ['llama-server@0.service']],
    ['two', ['org.freedesktop.systemd1.Unit', 'ActiveState']],
    ['an empty string, which is a legal STRING', ['']],
  ])('a %s call round-trips', (_name, args) => {
    const message = decodeMessage(encodeMethodCall({ ...GET_UNIT, args }));
    expect(message.kind).toBe('message');
    if (message.kind !== 'message') return;
    expect(message.message.type).toBe(DBUS_MESSAGE_TYPE.methodCall);
    expect(message.message.serial).toBe(GET_UNIT.serial);
    expect(message.message.body).toEqual([...args]);
  });
});

describe('incomplete is not malformed', () => {
  /*
   * ⚠ The distinction is the reason `DbusDecode` has three arms. `incomplete` means read
   * more bytes; `malformed` means this peer is not speaking D-Bus and reading more will
   * never help. Collapsing them turns a protocol error into a hang that only the deadline
   * ends, and the resulting entry says "timed out" about a peer that answered instantly.
   */
  test('⚠ every truncation of a real frame decodes as `incomplete`, never as a message', () => {
    const frame = bytes(CAPTURED_DBUS_GET_UNIT_REPLY);
    for (let cut = 0; cut < frame.length; cut += 1) {
      const decoded = decodeMessage(frame.subarray(0, cut));
      expect(decoded.kind, `truncated to ${String(cut)} bytes`).toBe('incomplete');
    }
    // …and the whole frame is the first length that yields one.
    expect(decodeMessage(frame).kind).toBe('message');
  });

  test('an empty buffer is incomplete', () => {
    expect(decodeMessage(new Uint8Array(0))).toEqual({ kind: 'incomplete' });
  });

  /*
   * ⚠ F3 — the length fields had no ceiling, so sixteen bytes of rubbish cost the whole
   * D-Bus budget.
   *
   * `bodyLength` and `fieldsLength` are raw uint32s off the wire, and the only consequence
   * of an absurd value was `bytes.length < byteLength → incomplete`, which
   * `Conversation.message()` answers by pulling more bytes until the deadline. Measured
   * against `collectUnitStates` with a scripted stream (`OK`, then 16 bytes declaring a
   * four-billion-byte body): one `dbus` entry reading **"timed out after 400 ms" about a
   * peer that answered in 1 ms** — verbatim the failure this describe block's own doc says
   * the two kinds exist to prevent. The endian-invalid case was already caught at byte 0;
   * the length-field case was not covered by any test or mutation.
   *
   * ⚠ Both sides of both boundaries are fixtured (HANDOVER §5.1), and the two sides differ
   * at a panel: one is a decoded message, the other is a 2 s blank. The ceilings are the
   * protocol's own — a message is capped at 2²⁷ bytes and the header field array at 2²⁶ —
   * so no legitimate systemd reply can exceed them.
   */
  const declaring = (fieldsLength: number, bodyLength: number): Uint8Array => {
    const header = new Uint8Array(DBUS_HEADER_BYTES);
    header[0] = DBUS_LITTLE_ENDIAN;
    header[1] = DBUS_MESSAGE_TYPE.methodReturn;
    header[3] = DBUS_PROTOCOL_VERSION;
    new DataView(header.buffer).setUint32(4, bodyLength, true);
    new DataView(header.buffer).setUint32(8, 1, true); // serial
    new DataView(header.buffer).setUint32(12, fieldsLength, true);
    return header;
  };

  test('⚠ a message longer than D-Bus allows is MALFORMED, not "read more bytes"', () => {
    // One byte over 2^27 with an empty field array: `alignUp(16 + 0, 8) + body`.
    const over = decodeMessage(declaring(0, DBUS_MAX_MESSAGE_BYTES - DBUS_HEADER_BYTES + 1));
    expect(over.kind).toBe('malformed');
    if (over.kind === 'malformed') expect(over.problem).toContain(String(DBUS_MAX_MESSAGE_BYTES));

    // The other side: exactly at the limit is a legitimate (if absurd) message, so the
    // decoder must still be willing to wait for its bytes.
    const at = decodeMessage(declaring(0, DBUS_MAX_MESSAGE_BYTES - DBUS_HEADER_BYTES));
    expect(at.kind).toBe('incomplete');
  });

  test('⚠ a header field array longer than D-Bus allows is MALFORMED too', () => {
    const over = decodeMessage(declaring(DBUS_MAX_FIELDS_BYTES + 1, 0));
    expect(over.kind).toBe('malformed');
    if (over.kind === 'malformed') expect(over.problem).toContain(String(DBUS_MAX_FIELDS_BYTES));

    const at = decodeMessage(declaring(DBUS_MAX_FIELDS_BYTES, 0));
    expect(at.kind).toBe('incomplete');
  });

  test('the four-billion-byte lie a 16-byte frame can tell is caught at once', () => {
    // The measured case: 0xffffffff in the body-length field. Under the old decoder this
    // was `incomplete` forever.
    const decoded = decodeMessage(declaring(0, 0xffffffff));
    expect(decoded.kind).toBe('malformed');
  });

  test('a bad endianness byte is malformed', () => {
    const frame = bytes(CAPTURED_DBUS_GET_UNIT_REPLY);
    frame[0] = 0x78;
    expect(decodeMessage(frame).kind).toBe('malformed');
  });

  test('a bad protocol version is malformed', () => {
    const frame = bytes(CAPTURED_DBUS_GET_UNIT_REPLY);
    frame[3] = 2;
    expect(decodeMessage(frame).kind).toBe('malformed');
  });

  test('⚠ a container in the body signature is malformed, never silently skipped', () => {
    // The narrowness is the safety property: skipping a container desynchronises the
    // reader by an unknown number of bytes and every later value is quietly wrong.
    const frame = encodeMethodCall(GET_UNIT);
    const at = frame.indexOf(DBUS_HEADER_FIELD.signature, DBUS_HEADER_BYTES);
    frame[at + 5] = 0x61; // 'a' — an array
    const decoded = decodeMessage(frame);
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('a');
  });

  test('⚠ a basic type this codec does not know is malformed, never decoded as null', () => {
    // ⚠ 12b — the test above no longer reaches `Reader.basic`'s `default` branch: a `a` in
    // the signature is now caught by `completeTypes` ("signature ends with a bare `a`") and a
    // container by `alignmentOf`, both BEFORE `basic` is asked. Measured: step 5's `05-W4`
    // (make the unknown type return `null` instead of throwing) stopped biting the moment the
    // array reader landed. `z` is not a D-Bus type at all, so it reaches `basic` and nothing
    // else — a body decoded as `[null]` is the silent desynchronisation this file is narrow
    // to avoid.
    const frame = encodeMethodCall(GET_UNIT);
    const at = frame.indexOf(DBUS_HEADER_FIELD.signature, DBUS_HEADER_BYTES);
    frame[at + 5] = 0x7a; // 'z'
    const decoded = decodeMessage(frame);
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('z');
  });

  test('⚠ a big-endian message is decoded as big-endian, not read little-endian', () => {
    // The endianness byte is the PEER's choice, so the decoder must not assume. Nothing on
    // this x86 box sends big-endian, so this frame is hand-built rather than captured — a
    // METHOD_RETURN carrying REPLY_SERIAL and a `s` body, every integer written big-endian.
    const be = (value: number): readonly number[] => [
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ];
    const frame = Uint8Array.from([
      DBUS_BIG_ENDIAN,
      DBUS_MESSAGE_TYPE.methodReturn,
      0,
      DBUS_PROTOCOL_VERSION,
      ...be(11), // body length
      ...be(9), // this message's own serial
      ...be(15), // header field array length
      DBUS_HEADER_FIELD.replySerial, 1, 0x75, 0, ...be(3), // REPLY_SERIAL = 3
      DBUS_HEADER_FIELD.signature, 1, 0x67, 0, 1, 0x73, 0, // SIGNATURE = 's'
      0, // pad 31 -> 32
      ...be(6), 0x61, 0x63, 0x74, 0x69, 0x76, 0x65, 0, // "active"
    ]);
    const decoded = decodeMessage(frame);
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    // ⚠ Read little-endian, `replySerial` would be 50331648 and the string length
    // 100663296 — so both assertions distinguish the two readings, not just one.
    expect(decoded.message.replySerial).toBe(3);
    expect(decoded.message.serial).toBe(9);
    expect(decoded.message.body).toEqual(['active']);
    expect(decoded.message.byteLength).toBe(frame.length);
  });
});

describe('SASL', () => {
  test('⚠ EXTERNAL sends the uid hex-encoded, and it is a claim the kernel verifies', () => {
    // Not a secret: the bus compares this with SO_PEERCRED. That is exactly what lets §2.2
    // call the access unprivileged — there is nothing here to leak.
    expect(hexAscii('1000')).toBe('31303030');
    expect(authExternalLine(1000)).toBe('AUTH EXTERNAL 31303030\r\n');
    expect(authExternalLine(0)).toBe('AUTH EXTERNAL 30\r\n');
  });

  test.each([
    [CAPTURED_DBUS_AUTH_OK, 'ok'],
    ['REJECTED EXTERNAL\r\n', 'rejected'],
    ['DATA\r\n', 'data'],
    ['ERROR\r\n', 'error'],
    ['SOMETHING ELSE\r\n', 'unknown'],
  ])('%j classifies as %s', (line, expected) => {
    expect(classifyAuthReply(line)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// ⚠⚠ 12b — ARRAYS. §3.4's `gpus` arrives as a `v` holding an `as`.
// ---------------------------------------------------------------------------

/** Little-endian uint32, as four bytes. */
const le32 = (v: number): readonly number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/**
 * A `METHOD_RETURN` with an arbitrary body signature and body bytes.
 *
 * ⚠ Hand-built rather than taken from `encodeMethodCall`, which can only write `STRING`
 * arguments: the whole point of these tests is bodies that encoder cannot produce, and a
 * decoder tested only against its own encoder is the failure this file's module doc records.
 */
const returnFrame = (signature: string, body: readonly number[]): Uint8Array => {
  const sig = [...new TextEncoder().encode(signature)];
  const fields: number[] = [
    DBUS_HEADER_FIELD.replySerial, 1, 0x75, 0, ...le32(7),
    DBUS_HEADER_FIELD.signature, 1, 0x67, 0, sig.length, ...sig, 0,
  ];
  while (fields.length % 8 !== 0) fields.push(0);
  const out: number[] = [
    DBUS_LITTLE_ENDIAN, DBUS_MESSAGE_TYPE.methodReturn, 0, DBUS_PROTOCOL_VERSION,
    ...le32(body.length), ...le32(11), ...le32(fields.length),
  ];
  out.push(...fields);
  while (out.length % 8 !== 0) out.push(0);
  out.push(...body);
  return Uint8Array.from(out);
};

/** The bytes of one `as` value: a 4-byte element count in BYTES, then the strings. */
const stringArrayBytes = (values: readonly string[]): number[] => {
  const elements: number[] = [];
  for (const value of values) {
    while (elements.length % 4 !== 0) elements.push(0);
    const e = [...new TextEncoder().encode(value)];
    elements.push(...le32(e.length), ...e, 0);
  }
  return [...le32(elements.length), ...elements];
};

describe('⚠⚠ 12b — decoding the `Environment` frames captured from the live system bus', () => {
  test('⚠ instance 0 answers a VARIANT holding `as` with CUDA_VISIBLE_DEVICES=0', () => {
    // This is §3.4's `gpus` at its source, captured read-only from this box on 2026-09-17.
    // It is the frame that proves the claim the whole inverted join rests on: systemd has
    // ALREADY expanded the template's `%i`, so the unit says which card it serves on the
    // wire rather than by our arithmetic.
    const message = decodeOne(CAPTURED_DBUS_ENVIRONMENT_REPLY);
    expect(message.type).toBe(DBUS_MESSAGE_TYPE.methodReturn);
    expect(message.signature).toBe('v');
    expect(message.body).toEqual([['CUDA_VISIBLE_DEVICES=0']]);
  });

  test('⚠ instance 1 answers card 1 — the two frames are NOT interchangeable', () => {
    // A fixture whose two subjects are identical cannot discriminate between them
    // (HANDOVER §0.6). With only instance 0's frame, a reader that answered every unit
    // from the first reply it saw would score green on the one arrangement this box runs.
    const message = decodeOne(CAPTURED_DBUS_ENVIRONMENT_REPLY_INSTANCE_1);
    expect(message.body).toEqual([['CUDA_VISIBLE_DEVICES=1']]);
  });

  test('⚠ a unit with no Environment= answers an EMPTY list, which is not a failure', () => {
    // `gpu-fan-control.service`, same capture. Eight body bytes: the `as` signature and a
    // zero length. The reader still pads to the element alignment after the length — making
    // that padding conditional on there being an element leaves the cursor short — and the
    // value is `[]`, which §3.1's `null` ≠ `[]` discipline says is an answer, not a gap.
    const message = decodeOne(CAPTURED_DBUS_EMPTY_ENVIRONMENT_REPLY);
    expect(message.body).toEqual([[]]);
    expect(message.body[0]).not.toBeNull();
  });
});

describe('⚠⚠ 12b — the array reader, and the four ways it must refuse rather than guess', () => {
  test('a body of `as` decodes its elements in order, with the count read as BYTES', () => {
    const frame = returnFrame('as', stringArrayBytes(['A=1', 'BB=22', 'C=3']));
    const decoded = decodeMessage(frame);
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual([['A=1', 'BB=22', 'C=3']]);
  });

  test('⚠ a multi-type body signature splits into COMPLETE types, not characters', () => {
    // The body loop used to be `for (const sig of signature)`, which is only correct while
    // every type is one character: `sas` would have been read as three basics and `as`
    // alone as a malformed `a` followed by an `s`.
    const body: number[] = [];
    const first = [...new TextEncoder().encode('first')];
    body.push(...le32(first.length), ...first, 0);
    while (body.length % 4 !== 0) body.push(0);
    body.push(...stringArrayBytes(['X=1']));
    const decoded = decodeMessage(returnFrame('sas', body));
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual(['first', ['X=1']]);
  });

  test('⚠ an array claiming more bytes than the message holds is MALFORMED, never incomplete', () => {
    // The lesson `DBUS_MAX_MESSAGE_BYTES` was added for, one layer in: `decodeMessage` has
    // already established the whole message is present, so saying "read more" here would
    // make `Conversation.message()` wait for bytes that will never come and file a `dbus`
    // entry saying "timed out" about a peer that answered in one millisecond.
    const body = stringArrayBytes(['X=1']);
    const overstated = [...le32(4096), ...body.slice(4)];
    const decoded = decodeMessage(returnFrame('as', overstated));
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('past the end of the message');
  });

  test('⚠ an array above D-Bus’s own 2^26 ceiling is malformed, and is refused by the CEILING', () => {
    // Distinct from the row above, and both directions are needed: this one is refused for
    // being illegal rather than for overrunning, so a reader that only compared against the
    // buffer would still allocate against a wire-supplied loop bound on a longer message.
    const decoded = decodeMessage(returnFrame('as', [...le32(DBUS_MAX_ARRAY_BYTES + 1)]));
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain(String(DBUS_MAX_ARRAY_BYTES));
  });

  test('⚠ elements that overrun the declared length are malformed, not returned as data', () => {
    // A count that does not divide into whole elements means the element type is not what
    // the signature said. Returning what was read would be a silent misparse — the exact
    // failure this module is narrow to avoid.
    const body = stringArrayBytes(['X=1']);
    const understated = [...le32(2), ...body.slice(4)];
    const decoded = decodeMessage(returnFrame('as', understated));
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('overran');
  });

  /*
   * ⚠⚠ 12b-RECONCILE — **the ⚠ was DROPPED from this test, deliberately, and the harness's own
   * rule is why**: *"the second hypothesis is that the property has no plausible wrong
   * implementation, in which case drop the ⚠ rather than the standard."* These three signatures
   * are refused by TWO independent guards (`alignmentOf`'s `default` and `Reader.basic`'s), and
   * the body is too short for either container to complete under any of them, so no one-line
   * change makes them decode — three were tried and measured (`alignmentOf`'s default → `1`,
   * `value`'s `length === 2` → `>= 2`, `completeTypes` swallowing the rest of the signature), and
   * each reddened a different test or none.
   *
   * ⚠ It HAD been scoring covered, and by an accident worth recording: its only reddening
   * mutation was `05-W3` (*a VARIANT decodes to its own type name*), which corrupts the SIGNATURE
   * **header field** and has nothing to do with the widening — the body then decoded as whatever
   * the wrong signature said, and this test's `malformed` expectation failed for a reason it does
   * not name. {@link Reader.region}'s rule 3 refuses those bodies now, so the accident is gone
   * and what was left is a mark with no mutation of its own. **The ledger is a necessary
   * condition, not a sufficient one**, and this is what the difference looks like.
   */
  test.each([
    ['a(ii)', 'an array of structs'],
    ['a{sv}', 'an array of dict entries'],
    ['aas', 'an array of arrays'],
  ])('the widening is ONE level deep — %s (%s) is still malformed', (signature) => {
    const decoded = decodeMessage(returnFrame(signature, [...le32(0), 0, 0, 0, 0]));
    expect(decoded.kind).toBe('malformed');
  });

  test('⚠ a signature ending in a bare `a` is malformed rather than silently dropped', () => {
    const decoded = decodeMessage(returnFrame('sa', [...le32(0), 0]));
    expect(decoded.kind).toBe('malformed');
  });

  test('⚠ an 8-ALIGNED element is padded to after the length — the alignment belongs to the array', () => {
    // `as` and `ab` are both 4-aligned, so the padding this asserts is INVISIBLE on every
    // type this dashboard actually reads: dropping `align(alignmentOf(...))` altogether would
    // still decode `Environment` perfectly. A `t` (uint64) is the shortest signature that can
    // tell the difference — its element starts 4 bytes after the length, not 0.
    const body = [...le32(8), 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    const decoded = decodeMessage(returnFrame('at', body));
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual([[1n]]);
  });

  test('⚠ an array of BOOLEANs is 4-aligned, because a D-Bus boolean is a uint32', () => {
    // The alignment that looks wrong and is right. `ab` is not a type this dashboard reads;
    // it is here because `alignmentOf` is a table, and a table with one entry wrong is a
    // silent misparse the moment anything asks for that type.
    const decoded = decodeMessage(returnFrame('ab', [...le32(8), ...le32(1), ...le32(0)]));
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual([[true, false]]);
  });
});

// ---------------------------------------------------------------------------
// ⚠⚠ 12b-TEST — the widening, fuzzed. **Nothing may throw, nothing may read past the
// frame, and `malformed` vs `incomplete` must be right in every NEIGHBOURING case.**
//
// The array reader was given its own "past the end of the message" guard in 12b and the
// reasoning it was given is general: `decodeMessage` has already established that the whole
// message is present, so a length field pointing beyond it is a lie, not a short read. The
// tests below are what happens when that reasoning is applied to the paths 12b did not
// touch — and the first one FAILED when it was written.
// ---------------------------------------------------------------------------

describe('⚠⚠ 12b-TEST — a length inside a complete message is MALFORMED, never `incomplete`', () => {
  test('⚠ a body STRING claiming more bytes than the message holds is malformed', () => {
    // ⚠ MEASURED FAILING, 2026-09-17. This returned `incomplete`, and `Conversation.message()`
    // answers `incomplete` by pulling bytes until the deadline: one `dbus` entry saying
    // "timed out" about a peer that answered in a millisecond, which is verbatim the failure
    // `DBUS_MAX_MESSAGE_BYTES` and `Reader.array`'s own guard exist to prevent. The array had
    // a guard; the string beside it did not, and the module doc claimed it did.
    const decoded = decodeMessage(returnFrame('s', [...le32(4096), 0x61, 0]));
    expect(decoded.kind).toBe('malformed');
  });

  test('⚠ a body SIGNATURE claiming more bytes than the message holds is malformed', () => {
    // `Reader.signature`'s length is one byte, so it cannot lie by four billion — but 200
    // bytes in a 3-byte body is the same lie at a smaller scale and had the same answer.
    expect(decodeMessage(returnFrame('g', [200, 0x61, 0])).kind).toBe('malformed');
  });

  test('⚠ a body value whose ALIGNMENT runs off the end of the message is malformed', () => {
    // No length field lies here: `t` is 8-aligned, and the padding needed to reach that
    // boundary is itself past the declared body. The guard has to be about the FRAME, not
    // about any one length field, or each new reader needs its own copy of it.
    expect(decodeMessage(returnFrame('yt', [0x01, 0x02])).kind).toBe('malformed');
  });

  test('⚠ an element STRING inside an array may not run past the array either', () => {
    // One layer further in than the declared-length guard: the array's own count fits the
    // message, and the string inside it does not.
    const decoded = decodeMessage(returnFrame('as', [...le32(8), ...le32(4096), 0x61, 0, 0, 0]));
    expect(decoded.kind).toBe('malformed');
  });

  test('⚠ a truncated frame is still `incomplete` — the two kinds did NOT collapse', () => {
    // The other direction, and the one the fix above could have broken: every prefix of a
    // real captured frame must still say "read more bytes". `05-W5` is the mutation for it.
    const frame = bytes(CAPTURED_DBUS_ENVIRONMENT_REPLY);
    for (let cut = 0; cut < frame.length; cut += 1) {
      expect(decodeMessage(frame.subarray(0, cut)).kind, `truncated to ${String(cut)} bytes`).toBe('incomplete');
    }
    expect(decodeMessage(frame).kind).toBe('message');
  });

  test('⚠ a legal message longer than the buffer is `incomplete`, however large it claims to be', () => {
    // The distinction survives at the boundary: a declared length inside D-Bus's own ceiling
    // is a message we have not finished receiving, and only a length ABOVE the ceiling — or
    // one inside a message we HAVE finished receiving — is a lie.
    const header = new Uint8Array(DBUS_HEADER_BYTES);
    header[0] = DBUS_LITTLE_ENDIAN;
    header[1] = DBUS_MESSAGE_TYPE.methodReturn;
    header[3] = DBUS_PROTOCOL_VERSION;
    new DataView(header.buffer).setUint32(4, 4096, true);
    expect(decodeMessage(header).kind).toBe('incomplete');
  });
});

describe('⚠⚠ 12b-TEST — nothing is read past the frame', () => {
  const twoMessages = (): Uint8Array => {
    const first = returnFrame('s', [...le32(3), 0x6f, 0x6e, 0x65, 0]); // "one"
    const second = returnFrame('s', [...le32(3), 0x74, 0x77, 0x6f, 0]); // "two"
    return Uint8Array.from([...first, ...second]);
  };

  test('⚠ two complete messages in one buffer frame independently, by `byteLength`', () => {
    // The positive half, and the reason the negative one below is not vacuous: this is the
    // arrangement a stream really produces (the captured `Hello` reply is two messages in one
    // 262-byte read), so a buffer holding a second message is the normal case, not a contrived
    // one.
    const buffer = twoMessages();
    const first = decodeMessage(buffer);
    expect(first.kind).toBe('message');
    if (first.kind !== 'message') return;
    expect(first.message.body).toEqual(['one']);
    const second = decodeMessage(buffer.subarray(first.message.byteLength));
    expect(second.kind === 'message' ? second.message.body : null).toEqual(['two']);
  });

  test('⚠ a HEADER FIELD that reaches beyond its own message cannot read the NEXT one', () => {
    // ⚠ MEASURED, 2026-09-17: the header-field reader was built on the whole BUFFER while the
    // body reader was built on `subarray(0, byteLength)`. `REPLY_SERIAL`'s variant is retyped
    // from `u` to `s` and its four bytes become a 20-byte string length — 20 bytes that end
    // inside the SECOND message. Measured against a reader built on the buffer, this decoded
    // as a **`message`**: the field ran off the end of message one, the cursor landed past the
    // field array, `SIGNATURE` was therefore never read, and a well-formed empty-bodied reply
    // came back from bytes that are not message one's at all.
    const buffer = twoMessages();
    buffer[18] = 0x73; // the REPLY_SERIAL field's variant signature: `u` -> `s`
    buffer[20] = 20; // …so its uint32 is now a STRING length, reaching into message two
    expect(decodeMessage(buffer).kind).toBe('malformed');

    // …and not merely because 20 bytes of the next message failed to parse: the same
    // corruption with NO second message behind it reaches the same answer, so the test is
    // about the FRAME rather than about what happens to follow it.
    const alone = Uint8Array.from(twoMessages().subarray(0, 40));
    alone[18] = 0x73;
    alone[20] = 20;
    expect(decodeMessage(alone).kind).toBe('malformed');
  });

  test('⚠ a BODY value that reaches beyond its own message cannot read the NEXT one either', () => {
    // The same fault on the other reader, and the same measurement: with the body reader
    // built on the buffer, message one's `s` body came back as its own three characters
    // followed by the LITERAL BYTES OF MESSAGE TWO'S HEADER — the endianness byte, the type,
    // the lengths — returned as a decoded string with `kind: 'message'`. A caller cannot tell
    // that from data.
    const buffer = twoMessages();
    buffer[32] = 20; // the body STRING's length: 3 -> 20, which ends inside message two
    expect(decodeMessage(buffer).kind).toBe('malformed');
    const alone = Uint8Array.from(twoMessages().subarray(0, 40));
    alone[32] = 20;
    expect(decodeMessage(alone).kind).toBe('malformed');
  });
});

describe('⚠⚠ 12b-RECONCILE — a declared length is a REGION, and its values must account for it', () => {
  /*
   * ⚠⚠ The third layer of one bug, and the one nothing stated. 12b's build gave `Reader.array`
   * the rule; 12b's test phase bounded both readers at the frame; neither asked whether the
   * frame's own number was accounted for. `decodeMessage` returns `byteLength` and
   * `Conversation.message()` advances the stream by it, so a message whose values stop short of
   * its declared length DISCARDS the bytes in between — which in a stream are the next message.
   *
   * These tests are the measurements from `12b-adversarial.md` §1, run against the fix.
   */

  test('⚠⚠ a message whose body stops SHORT of its declared length is refused — it would eat the next one', () => {
    // The construction from the adversarial's §1(a): two legal `METHOD_RETURN`s, the first's
    // `bodyLength` inflated by exactly the second's length. Before the fix this decoded as a
    // well-formed message — right serial, correct body value — with `byteLength` covering BOTH,
    // and message two was gone with no error anywhere.
    const first = returnFrame('s', [...le32(3), 0x6f, 0x6e, 0x65, 0]); // "one"
    const second = returnFrame('s', [...le32(3), 0x74, 0x77, 0x6f, 0]); // "two"
    const honest = Uint8Array.from([...first, ...second]);
    expect(decodeMessage(honest).kind).toBe('message');

    const lying = Uint8Array.from(honest);
    const view = new DataView(lying.buffer, lying.byteOffset, lying.byteLength);
    view.setUint32(4, view.getUint32(4, true) + second.length, true);
    const decoded = decodeMessage(lying);
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('account for');
  });

  test('⚠⚠ ONE flipped byte in the REAL captured `GetUnit` reply cannot inflate its `byteLength`', () => {
    // ⚠ MEASURED, 2026-09-17, on the frame this box's own system bus sent: byte 4 is the low
    // byte of `bodyLength`, and `0x7f` there returned `kind: 'message'` with the right serial,
    // the right object path and `byteLength: 191` instead of 96. End to end that was
    // `unitState: null` and "timed out after 300 ms" about a bus that answered in 2 ms.
    const honest = bytes(CAPTURED_DBUS_GET_UNIT_REPLY);
    const decodedHonest = decodeMessage(honest);
    expect(decodedHonest.kind === 'message' ? decodedHonest.message.byteLength : null).toBe(honest.length);

    // Padded with a second copy of the frame, because a declared length nobody has the bytes
    // for is `incomplete` — honestly so. The lie only becomes reachable once the bytes arrive,
    // which in a stream is the next reply.
    const stream = Uint8Array.from([...honest, ...honest]);
    stream[4] = 0x7f;
    const decoded = decodeMessage(stream);
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('message body');
  });

  test('⚠ a `bodyLength` with no SIGNATURE to read it is a self-contradiction, not an empty body', () => {
    // The one lie a header can prove on its own, and rule 3 is what proves it: zero values
    // cannot account for a declared body. The body region is therefore entered even when the
    // signature is empty — before, an empty signature skipped the body reader altogether and
    // whatever `bodyLength` claimed was simply believed and skipped over.
    // Built by hand rather than from `returnFrame`, because the point is a message with NO
    // `SIGNATURE` header field at all: REPLY_SERIAL alone, eight bytes exactly, and a body
    // length that claims eight bytes nothing will ever read.
    const fields = [DBUS_HEADER_FIELD.replySerial, 1, 0x75, 0, ...le32(7)];
    const frame = Uint8Array.from([
      DBUS_LITTLE_ENDIAN, DBUS_MESSAGE_TYPE.methodReturn, 0, DBUS_PROTOCOL_VERSION,
      ...le32(8), ...le32(11), ...le32(fields.length),
      ...fields,
      ...le32(3), 0x6f, 0x6e, 0x65, 0,
    ]);
    const decoded = decodeMessage(frame);
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('message body');
  });

  test('⚠⚠ a HEADER FIELD may not read out of the BODY — the field array is the region that declared it', () => {
    // 12b-A2. The frame is the wrong boundary for a header field even though it is the tighter
    // one: with the reads bounded only by the frame, an `ERROR_NAME` whose declared length is a
    // lie decoded out of the BODY's bytes, the loop exited because the cursor was past
    // `fieldsEnd`, and `kind: 'message'` came back carrying it. `errorName` is compared against
    // `NoSuchUnit` and interpolated into `errors[]` sentences that render on two panels, and
    // for `Environment` the body is the unit's own environment strings.
    const frameWith = (declaredNameLength: number): Uint8Array => {
      const fields: number[] = [4, 1, 0x73, 0, ...le32(declaredNameLength), 0x78, 0x2e, 0x79, 0]; // ERROR_NAME "x.y"
      while (fields.length % 8 !== 0) fields.push(0);
      fields.push(8, 1, 0x67, 0, 1, 0x73, 0); // SIGNATURE `s`
      const body = [...le32(17), ...new TextEncoder().encode('BODY-SECRET-VALUE'), 0];
      const out: number[] = [
        DBUS_LITTLE_ENDIAN, DBUS_MESSAGE_TYPE.error, 0, DBUS_PROTOCOL_VERSION,
        ...le32(body.length), ...le32(11), ...le32(fields.length),
      ];
      out.push(...fields);
      while (out.length % 8 !== 0) out.push(0);
      out.push(...body);
      return Uint8Array.from(out);
    };

    const honest = decodeMessage(frameWith(3));
    expect(honest.kind).toBe('message');
    if (honest.kind !== 'message') return;
    expect(honest.message.errorName).toBe('x.y');
    expect(honest.message.body).toEqual(['BODY-SECRET-VALUE']);

    // 16 and 24 both decoded — as `x.y` followed by NULs and then the body's own uint32 length
    // prefix and its first characters. Both are inside the frame; neither is inside the field
    // array that declared them.
    for (const lie of [16, 24]) {
      const decoded = decodeMessage(frameWith(lie));
      expect(decoded.kind, `ERROR_NAME declaring ${String(lie)} bytes`).toBe('malformed');
      if (decoded.kind !== 'malformed') continue;
      expect(decoded.problem).toContain('header field array');
      expect(decoded.problem).not.toContain('SECRET');
      // ⚠ **`overran`, not `account for`** — the two diagnoses are the region's two rules, and
      // which one fires is the difference between refusing the READ and noticing afterwards
      // that the cursor ended somewhere impossible. Bounded only by the frame, the body's
      // bytes are decoded into `errorName` and only the cursor's final position gives it away;
      // bounded by the field array, the read never happens.
      expect(decoded.problem).toContain('overran');
    }
  });

  test('⚠ a STRING whose NUL terminator falls outside the region is refused BEFORE the read, not after', () => {
    // `Reader.string`/`Reader.signature` ask for `length + 1` — the `+ 1` is what checks the
    // terminator is inside the region rather than one byte past its end. 12b's adversarial
    // reverted both to `need(length)` with the whole suite green (`R40`/`R41`), and the
    // exhaustive corruption sweep structurally cannot reach them: every truncation it builds is
    // SHORTER than `byteLength`, so it is answered `incomplete` before a reader is entered.
    //
    // ⚠ The revert is no longer a silent misparse — rule 3 catches the cursor landing one past
    // the region — so what this pins is WHICH rule refuses it, which is the sentence a person
    // reads in an `errors[]` entry. Refusing the read is "overran"; noticing afterwards is "the
    // message body declared N bytes and its values account for N+1".
    const decoded = decodeMessage(returnFrame('s', [...le32(3), 0x6f, 0x6e, 0x65]));
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('overran');
  });

  test('⚠ a SIGNATURE whose NUL terminator falls outside the region is refused the same way', () => {
    // `Reader.signature`'s length is one byte rather than four, which is why it needs its own
    // row here: the same `+ 1`, the same revert (`R41`), the same refusal.
    const decoded = decodeMessage(returnFrame('g', [1, 0x73]));
    expect(decoded.kind).toBe('malformed');
    if (decoded.kind !== 'malformed') return;
    expect(decoded.problem).toContain('overran');
  });

  test.each([
    ['y', 1], ['g', 1], ['v', 1],
    ['n', 2], ['q', 2],
    ['b', 4], ['i', 4], ['u', 4], ['h', 4], ['s', 4], ['o', 4],
    ['x', 8], ['t', 8], ['d', 8],
  ])('⚠ the D-Bus alignment table is the specification’s — `%s` is %i-aligned', (sig, boundary) => {
    // ⚠ A TABLE, asserted as a table, because its rows cannot be observed one at a time.
    // `alignmentOf` is reached from exactly one place — the padding after an array's length —
    // and the cursor there is always 4-aligned already, so `v`'s 1 and `s`'s 4 produce
    // identical bytes for every frame this codec can be handed. 12b's adversarial changed
    // `case 'v'` from 1 to 4 — a specification violation — and all 3634 tests stayed green
    // (`R33`). The two rows that DO show through a decode have their own frames above (`ab`
    // is 4-aligned because a D-Bus boolean is a uint32; `at` is 8-aligned).
    expect(alignmentOf(sig)).toBe(boundary);
  });
});

describe('⚠⚠ 12b-TEST — every single-byte corruption of the captured `Environment` frame', () => {
  /*
   * ⚠ EXHAUSTIVE AND DETERMINISTIC, not random. Entropy in a test makes a failure that
   * cannot be reproduced from the file alone, and this project has a rule about clocks and
   * random sources for exactly that reason. Every byte of the real frame is replaced by each
   * of five values chosen to hit the codec's edges — `0x00`, `0x01`, `0x7f`, `0xff` and the
   * ASCII `a` that is also D-Bus's array type character — which is 5 × the frame length
   * decodes, all of them of a message that IS entirely present.
   *
   * Two properties, and the second is the one 12b's array guard is about:
   *
   *  1. `decodeMessage` is TOTAL. It never throws, whatever the bytes say.
   *  2. It never answers `incomplete` about a buffer that already holds every byte the
   *     message's own header claimed — that answer means "wait", and waiting cannot help.
   */
  const CORRUPTIONS = [0x00, 0x01, 0x7f, 0xff, 0x61] as const;

  test.each([
    ['instance 0', CAPTURED_DBUS_ENVIRONMENT_REPLY],
    ['instance 1', CAPTURED_DBUS_ENVIRONMENT_REPLY_INSTANCE_1],
    ['the EMPTY environment', CAPTURED_DBUS_EMPTY_ENVIRONMENT_REPLY],
  ])('⚠ every one-byte corruption of the %s frame is total, and never asks to wait', (_name, hex) => {
    const original = bytes(hex);
    let decodes = 0;
    for (let at = 0; at < original.length; at += 1) {
      for (const value of CORRUPTIONS) {
        if (original[at] === value) continue;
        const frame = Uint8Array.from(original);
        frame[at] = value;
        const decoded = decodeMessage(frame);
        decodes += 1;
        expect(['incomplete', 'malformed', 'message'], `byte ${String(at)} = ${String(value)}`).toContain(
          decoded.kind,
        );
        if (decoded.kind !== 'incomplete') continue;
        // `incomplete` is only honest while the buffer really is short of what the header
        // declared. Recomputing that here rather than trusting the decoder is the point.
        const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
        const le = frame[0] === DBUS_LITTLE_ENDIAN;
        const fields = view.getUint32(12, le);
        const declared = Math.ceil((DBUS_HEADER_BYTES + fields) / 8) * 8 + view.getUint32(4, le);
        expect(declared, `byte ${String(at)} = ${String(value)} said "read more" about a whole message`).toBeGreaterThan(
          frame.length,
        );
      }
    }
    expect(decodes).toBeGreaterThan(300);

    /*
     * ⚠⚠ 12b-RECONCILE — **THE SECOND ARM, and it is the one that reaches the finding.** Every
     * corruption above is decoded again with an honest COPY of the frame behind it, which is the
     * arrangement a stream really produces: the captured `Hello` reply is two messages in one
     * 262-byte read. The first arm cannot see an inflated length at all — the bytes it would
     * claim do not exist, so `decodeMessage` answers `incomplete`, honestly, and the loop moves
     * on. With a second message behind it the lie becomes reachable, and 12b's adversarial had
     * to EXCLUDE 60 such corruptions from its differential sweep for exactly that reason.
     *
     * The property is the invariant stated from outside: **framing must not damage the next
     * message.** If a corrupted frame still decodes, advancing by the `byteLength` it reports —
     * which is precisely what `Conversation.message()` does — must leave the copy behind it
     * intact. Before the region invariant, one flipped byte at offset 4 reported 191 bytes for a
     * 96-byte reply and the 95 bytes it swallowed were the next reply's.
     */
    let framed = 0;
    for (let at = 0; at < original.length; at += 1) {
      for (const value of CORRUPTIONS) {
        if (original[at] === value) continue;
        const stream = new Uint8Array(original.length * 2);
        stream.set(original);
        stream.set(original, original.length);
        stream[at] = value;
        const decoded = decodeMessage(stream);
        framed += 1;
        expect(['incomplete', 'malformed', 'message'], `byte ${String(at)} = ${String(value)}, padded`).toContain(
          decoded.kind,
        );
        if (decoded.kind !== 'message') continue;
        const rest = decodeMessage(stream.subarray(decoded.message.byteLength));
        expect(
          rest.kind,
          `byte ${String(at)} = ${String(value)}: advancing by the reported byteLength ate the next message`,
        ).toBe('message');
      }
    }
    expect(framed).toBe(decodes);
  });
});

describe('⚠⚠ 12b-TEST — where the widening really stops, and what it costs', () => {
  test('⚠ an empty array whose element PADDING is missing is malformed, not an empty list', () => {
    // The empty-array case at its sharpest. `at`'s element is 8-aligned, so four bytes of
    // padding must follow the length even though no element follows the padding; a frame that
    // ends at the length field has not sent them. `as` — the only array this dashboard reads —
    // cannot show this, because a 4-aligned element needs no padding after a 4-byte length.
    expect(decodeMessage(returnFrame('at', [...le32(0)])).kind).toBe('malformed');
    expect(decodeMessage(returnFrame('at', [...le32(0), 0, 0, 0, 0])).kind).toBe('message');
  });

  test('⚠ `a` followed by a character that is not a type at all is malformed', () => {
    // `alignmentOf`'s `default`, which is a different branch from `Reader.basic`'s: the
    // element type is rejected before a single element byte is read.
    expect(decodeMessage(returnFrame('az', [...le32(0)])).kind).toBe('malformed');
  });

  test('⚠⚠ `av` DECODES, and an array of arrays is therefore reachable — through a VARIANT', () => {
    // ⚠ The module doc says the widening is `a` plus "ONE basic type", and `aas` is refused.
    // Both are true and neither is the whole boundary: `v` is a CONTAINER that `Reader.basic`
    // handles, so `av` is accepted, and each variant inside carries its own signature — which
    // may be `as`. That is an array of arrays by another name, and it is SAFE for the reason
    // `aas` is not: a variant states its own type on the wire, so nothing is guessed and the
    // reader cannot desynchronise. Pinned here so that a later reader meeting `av` does not
    // "fix" it into a throw, and so the doc's claim is not mistaken for the code's.
    const inner = [2, 0x61, 0x73, 0, ...le32(0)]; // a variant holding an empty `as`
    const decoded = decodeMessage(returnFrame('av', [...le32(inner.length), ...inner]));
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual([[[]]]);
    // …and the form that WOULD have to be guessed is still refused.
    expect(decodeMessage(returnFrame('aas', [...le32(0)])).kind).toBe('malformed');
  });

  test('⚠ a VARIANT nested thousands deep is refused rather than thrown', () => {
    // `Reader.basic('v')` recurses, and a signature costs three bytes per level, so a legal
    // 2^27-byte message can nest deeper than any JavaScript stack. The requirement is not that
    // it decode — it is that `decodeMessage` stay TOTAL, because `Conversation.message()`
    // turns a thrown error into the end of the whole conversation and every unit's
    // `ActiveState` goes blank rather than one reply failing.
    const body: number[] = [];
    for (let i = 0; i < 20_000; i += 1) body.push(1, 0x76, 0);
    body.push(1, 0x79, 0, 0x2a);
    expect(() => decodeMessage(returnFrame('v', body))).not.toThrow();
    expect(decodeMessage(returnFrame('v', body)).kind).toBe('malformed');
  });

  test('⚠ a shallow nest of VARIANTs decodes to the value at the bottom', () => {
    // The positive companion: the refusal above must be the DEPTH, not variants-in-variants
    // being broken. Three levels, ending in a `y`.
    const decoded = decodeMessage(returnFrame('v', [1, 0x76, 0, 1, 0x76, 0, 1, 0x79, 0, 0x2a]));
    expect(decoded.kind).toBe('message');
    if (decoded.kind !== 'message') return;
    expect(decoded.message.body).toEqual([42]);
  });
});
