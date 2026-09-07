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
  DBUS_MAX_FIELDS_BYTES,
  DBUS_MAX_MESSAGE_BYTES,
  DBUS_MESSAGE_TYPE,
  DBUS_PROTOCOL_VERSION,
  authExternalLine,
  classifyAuthReply,
  decodeMessage,
  encodeMethodCall,
  hexAscii,
} from './dbus-wire';
import type { DbusMessage } from './dbus-wire';
import {
  CAPTURED_DBUS_ACTIVE_STATE_REPLY,
  CAPTURED_DBUS_AUTH_OK,
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
