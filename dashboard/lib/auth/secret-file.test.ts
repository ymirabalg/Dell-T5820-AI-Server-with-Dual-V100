import { describe, expect, test } from 'vitest';

import { MIN_SESSION_SECRET_CHARS, PASSWORD_HASH_KEY, SESSION_SECRET_KEY } from '@/lib/auth/config';
import {
  SECRET_ENV_FILE,
  makeSecretSource,
  parseSecretEnvFile,
  refusalReport,
  secretValueError,
} from '@/lib/auth/secret-file';

/**
 * SPEC.md §5.1's ⚠⚠ ruling of 2026-09-11 (`11-Q2`), and the one rule the reader is held to:
 * **stricter than Docker's `--env-file` grammar, never looser.**
 *
 * ⚠ That claim is fixtured **in both directions against a model of Docker's own parser**,
 * because "stricter, never looser" has already been falsified twice by measurement in this
 * project — `11-S7` (a condition kind reaching `awk` through `-v`, whose escape processing
 * made the bash judge LOOSER than the browser) and `11-A2` (the twelve Unicode spaces
 * JavaScript trims and `[[:space:]]` under `LC_ALL=C` does not). Both were believed stricter
 * by the people who wrote them.
 *
 * ⚠ **The Docker model below is reasoned, not run.** There is no Docker on this Mac. Where the
 * model is wrong this test is wrong with it, which is why step 12 owns one confirmation on the
 * box: write a file with each shape, run `docker run --env-file … env`, and compare.
 *
 * ⚠ It is **no longer a transcription from memory**. On 2026-09-11 the test phase fetched the
 * real upstream — `docker/cli` `pkg/kvfile/kvfile.go`, which `opts.ReadKVEnvStrings` calls with
 * `os.LookupEnv` and which `--env-file` goes through — and re-derived every rule below from it.
 * One rule was missing from the earlier transcription and it is the one that mattered: the
 * package comment says *"Maximum line-length is limited to [bufio.MaxScanTokenSize]"*, and a
 * `parseKeyValueFile` that runs out of scanner ends with `return lines, scanner.Err()`, so a
 * line past 64 KiB **refuses the whole file**. This reader had no bound at all.
 *
 * ⚠⚠ **And that is why the shapes are GENERATED below rather than listed.** A hand-written
 * table asks only about the cases whoever wrote it already thought of, so it cannot falsify its
 * own property — the 26 rows were all green while the reader was the more permissive of the two
 * on a 70 KiB line. The table stays, because each row carries the sentence that says *why* the
 * difference is the right way round; the property is measured over {@link GENERATED} instead.
 */

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const HASH = 'scrypt.15.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HEX64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** A file every side accepts: comments, both secrets, an empty `STANDING`. */
const GOOD = `# /etc/ai-dashboard.env — SPEC.md §5.1\n${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64}\nSTANDING=\n`;

// ---------------------------------------------------------------------------------------
// The model of Docker's own grammar
// ---------------------------------------------------------------------------------------

type DockerVerdict =
  | { readonly ok: true; readonly env: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly why: string };

/** Go's `unicode.IsSpace`, which is what `TrimLeftFunc` uses on each line. */
const GO_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003,
  0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000,
]);

const trimLeftGoSpace = (line: string): string => {
  let i = 0;
  while (i < line.length) {
    const cp = line.codePointAt(i) ?? 0;
    if (!GO_SPACE.has(cp)) break;
    i += String.fromCodePoint(cp).length;
  }
  return line.slice(i);
};

/**
 * `bufio.MaxScanTokenSize`, the bound `parseKeyValueFile`'s own package comment names.
 *
 * ⚠⚠ **Modelled with `>=`, because that is what `bufio` does — corrected 2026-09-11 (11b-A10),
 * and it had been one byte LOOSER than the real thing at exactly the boundary the previous
 * loop's headline was about.** The comment here used to call `>` "the most permissive reading"
 * of a boundary that supposedly "depends on how the buffer grows". Read against `scan.go`, it
 * does not: the buffer is capped at `newSize = min(newSize, s.maxTokenSize)` and the give-up
 * test is `len(s.buf) >= s.maxTokenSize || len(s.buf) > maxInt/2`, so a line of **65536 bytes
 * or more** is `ErrTooLong` and 65535 + `\n` is fine. With `>`, a line of exactly 65536 read
 * as *"Docker takes it, we refuse"* when in truth both refuse — and if `MAX_LINE_BYTES` were
 * ever relaxed from `>=` to `>`, the implication test would still have passed while this
 * reader accepted a file Docker refuses. That is the P1 falsification, in the one place the
 * last loop hardened.
 */
const MAX_SCAN_TOKEN_SIZE = 64 * 1024;

/**
 * What `docker run --env-file` would make of these bytes.
 *
 * Derived from `pkg/kvfile/kvfile.go`: a UTF-8 check per line, a BOM stripped from line 1
 * only, `bufio.ScanLines` dropping a trailing `\r`, leading whitespace trimmed by
 * `unicode.IsSpace`, blank and `#` lines skipped, `strings.Cut(line, "=")`, an empty key
 * refused, a key containing `" \t"` refused, a key with no `=` taken **from the host's
 * environment** via `os.LookupEnv`, the value kept **verbatim** — and a line past
 * {@link MAX_SCAN_TOKEN_SIZE} ending the scan, which `return lines, scanner.Err()` turns into
 * a refusal of the whole file.
 */
const dockerEnvFile = (
  bytes: Uint8Array,
  hostEnv: Readonly<Record<string, string>> = {},
): DockerVerdict => {
  const env: Record<string, string> = {};
  // Split on 0x0A the way bufio.ScanLines does, dropping a trailing 0x0D from each line.
  const raw: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i += 1) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      if (i === bytes.length && i === start) break;
      // The scanner gives up before the token is ever handed to the loop below, and
      // `parseKeyValueFile` returns that error instead of the lines it had.
      if (i - start >= MAX_SCAN_TOKEN_SIZE) return { ok: false, why: 'bufio.Scanner: token too long' };
      let end = i;
      if (end > start && bytes[end - 1] === 0x0d) end -= 1;
      raw.push(bytes.slice(start, end));
      start = i + 1;
    }
  }
  for (const [index, lineBytes] of raw.entries()) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(lineBytes);
    } catch {
      return { ok: false, why: `invalid utf8 bytes at line ${index + 1}` };
    }
    if (index === 0) text = text.replace(/^﻿/, '');
    const line = trimLeftGoSpace(text);
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 0) {
      if (/[ \t]/.test(line)) return { ok: false, why: `variable '${line}' contains whitespaces` };
      const fromHost = hostEnv[line];
      if (fromHost !== undefined) env[line] = fromHost;
      continue;
    }
    const key = line.slice(0, at);
    if (key === '') return { ok: false, why: `no variable name on line '${line}'` };
    if (/[ \t]/.test(key)) return { ok: false, why: `variable '${key}' contains whitespaces` };
    env[key] = line.slice(at + 1);
  }
  return { ok: true, env };
};

// ---------------------------------------------------------------------------------------
// The comparison table
// ---------------------------------------------------------------------------------------

interface Shape {
  /** What the file carries. */
  readonly what: string;
  readonly bytes: Uint8Array;
  /** Does Docker take this file? */
  readonly docker: 'takes' | 'refuses';
  /** Do we? */
  readonly ours: 'takes' | 'refuses';
  /** A substring the refusal must carry, so the message is measured and not only the verdict. */
  readonly says?: string;
}

const line = (key: string, value: string): Uint8Array => utf8(`${key}=${value}\n`);

/** The GOOD file with one key's value replaced. */
const withValue = (key: string, value: string): Uint8Array =>
  utf8(
    GOOD.split('\n')
      .map((l) => (l.startsWith(`${key}=`) ? `${key}=${value}` : l))
      .join('\n'),
  );

const SHAPES: readonly Shape[] = [
  { what: 'the file `configure` writes', bytes: utf8(GOOD), docker: 'takes', ours: 'takes' },
  {
    what: 'a QUOTED secret — O21 itself, a working dashboard whose sessions die on the next rewrite',
    bytes: withValue(SESSION_SECRET_KEY, `"${HEX64}"`),
    docker: 'takes',
    ours: 'refuses',
    says: 'does not strip quotes',
  },
  {
    what: 'a single-quoted hash',
    bytes: withValue(PASSWORD_HASH_KEY, `'${HASH}'`),
    docker: 'takes',
    ours: 'refuses',
    says: 'single quote',
  },
  {
    what: 'a TRAILING SPACE, which Docker keeps as part of the secret and no reader can see',
    bytes: withValue(SESSION_SECRET_KEY, `${HEX64} `),
    docker: 'takes',
    ours: 'refuses',
    says: 'trailing whitespace',
  },
  {
    what: 'a leading tab',
    bytes: withValue(SESSION_SECRET_KEY, `\t${HEX64}`),
    docker: 'takes',
    ours: 'refuses',
    says: 'leading whitespace',
  },
  {
    what: 'a `$`, which a shell that ever sourced the file would expand away',
    bytes: withValue(SESSION_SECRET_KEY, `$HOME${HEX64}`),
    docker: 'takes',
    ours: 'refuses',
    says: 'would expand',
  },
  {
    what: 'a backtick, which a sourcing shell would EXECUTE',
    bytes: withValue(SESSION_SECRET_KEY, `\`id\`${HEX64}`),
    docker: 'takes',
    ours: 'refuses',
    says: 'EXECUTE',
  },
  {
    what: 'a backslash, which systemd and a shell both read as an escape',
    bytes: withValue(SESSION_SECRET_KEY, `${HEX64}\\n`),
    docker: 'takes',
    ours: 'refuses',
    says: 'escape',
  },
  {
    what: "a '#' mid-value, which several .env readers take as a comment and Docker does not",
    bytes: withValue(SESSION_SECRET_KEY, `${HEX64}#x`),
    docker: 'takes',
    ours: 'refuses',
    says: 'comment',
  },
  {
    what: 'a NON-BREAKING SPACE inside the secret — invisible, and not what `.trim()` removes',
    bytes: withValue(SESSION_SECRET_KEY, `${HEX64.slice(0, 32)}\u00a0${HEX64.slice(33)}`),
    docker: 'takes',
    ours: 'refuses',
    says: 'outside printable ASCII',
  },
  {
    what: 'a ZERO-WIDTH SPACE, which `.trim()` does NOT remove (U+200B is Cf, not whitespace)',
    bytes: withValue(SESSION_SECRET_KEY, `${HEX64}\u200b`),
    docker: 'takes',
    ours: 'refuses',
    says: 'outside printable ASCII',
  },
  {
    what: 'CRLF line endings, which Docker tolerates by dropping the \\r',
    bytes: utf8(GOOD.replace(/\n/g, '\r\n')),
    docker: 'takes',
    ours: 'refuses',
    says: 'CRLF',
  },
  {
    what: 'a UTF-8 BOM, which Docker strips from line 1',
    bytes: utf8(`\ufeff${GOOD}`),
    docker: 'takes',
    ours: 'refuses',
    says: 'byte-order mark',
  },
  {
    what: 'a BARE line — Docker reads it as "take this from the host environment"',
    bytes: utf8(`${GOOD}${HEX64}\n`),
    docker: 'takes',
    ours: 'refuses',
    says: "has no '='",
  },
  {
    what: 'a DUPLICATE SESSION_SECRET, of which Docker silently takes the last',
    bytes: utf8(`${GOOD}${SESSION_SECRET_KEY}=${HEX64.replace(/0/g, '9')}\n`),
    docker: 'takes',
    ours: 'refuses',
    says: 'appears twice',
  },
  {
    what: 'a value "wrapped" onto two lines, which is two keys to Docker and one to nobody',
    bytes: utf8(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64.slice(0, 32)}\n${HEX64.slice(32)}\n`),
    docker: 'takes',
    ours: 'refuses',
    says: "has no '='",
  },
  {
    what: 'a short SESSION_SECRET, which makes the cookie HMAC brute-forceable',
    bytes: withValue(SESSION_SECRET_KEY, 'a'.repeat(MIN_SESSION_SECRET_CHARS - 1)),
    docker: 'takes',
    ours: 'refuses',
    says: 'below the 32-character floor',
  },
  {
    what: 'a SESSION_SECRET of exactly the floor',
    bytes: withValue(SESSION_SECRET_KEY, 'a'.repeat(MIN_SESSION_SECRET_CHARS)),
    docker: 'takes',
    ours: 'takes',
  },
  {
    what: 'an empty PASSWORD_HASH',
    bytes: withValue(PASSWORD_HASH_KEY, ''),
    docker: 'takes',
    ours: 'refuses',
    says: 'is empty',
  },
  {
    what: 'no PASSWORD_HASH at all',
    bytes: line(SESSION_SECRET_KEY, HEX64),
    docker: 'takes',
    ours: 'refuses',
    says: 'is absent',
  },
  {
    what: 'an INDENTED comment, which Docker skips — refusing it would be a false alarm',
    bytes: utf8(`  # indented\n${GOOD}`),
    docker: 'takes',
    ours: 'takes',
  },
  {
    what: 'a whitespace-only line, which Docker also skips',
    bytes: utf8(`${GOOD}   \n`),
    docker: 'takes',
    ours: 'takes',
  },
  {
    what: 'an INDENTED assignment, which Docker accepts and this refuses',
    bytes: utf8(`${GOOD}  EXTRA=x\n`),
    docker: 'takes',
    ours: 'refuses',
    says: 'not a usable environment-variable name',
  },
  {
    what: 'a key name Docker itself cannot use',
    bytes: utf8(`${GOOD}1BAD=x\n`),
    docker: 'takes',
    ours: 'refuses',
    says: 'not a usable environment-variable name',
  },
  {
    what: 'a key with a space in it — the one shape DOCKER refuses and we do too',
    bytes: utf8(`${GOOD}BAD KEY=x\n`),
    docker: 'refuses',
    ours: 'refuses',
  },
  {
    what: 'invalid UTF-8, which Docker refuses by name',
    bytes: new Uint8Array([...utf8(GOOD), 0x41, 0x3d, 0xff, 0xfe, 0x0a]),
    docker: 'refuses',
    ours: 'refuses',
    says: 'not valid UTF-8',
  },
  // ⚠⚠ The row a GENERATED shape added on 2026-09-11, and the only one in this table that was
  // ever the wrong way round: Docker's scanner refuses a line past 64 KiB and this reader
  // bounded nothing, so a 70 KiB line was a file the server started on and `docker run
  // --env-file` would not. Three lines of the table are it, because the line that does it need
  // not be a secret at all — a comment or a STANDING list refuses the file just as hard.
  {
    what: '⚠ a 70 KiB SESSION_SECRET line, past the scanner bound Docker refuses the whole file on',
    bytes: utf8(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${'a'.repeat(70000)}\n`),
    docker: 'refuses',
    ours: 'refuses',
    says: 'line limit',
  },
  {
    what: '⚠ a 70 KiB COMMENT — a comment is the last place anyone would look for a refusal',
    bytes: utf8(`#${'a'.repeat(70000)}\n${GOOD}`),
    docker: 'refuses',
    ours: 'refuses',
    says: 'line limit',
  },
  {
    what: 'a 60 KiB line, under the bound, which both sides still take',
    bytes: utf8(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${'a'.repeat(60000)}\n`),
    docker: 'takes',
    ours: 'takes',
  },
];

// ---------------------------------------------------------------------------------------
// ⚠⚠ The GENERATED shapes — the half of the comparison a hand-written table cannot do
// ---------------------------------------------------------------------------------------

/**
 * Every shape the implication is measured over, built rather than listed.
 *
 * ⚠ The table above is a set of examples with reasons attached. This is a **search**: each
 * ASCII code point and each Unicode space or format character is placed in five different
 * positions (inside a value, at the end of one, inside a key, at the head of a line, and alone
 * on a line), and the structural shapes an operator's editor actually produces are enumerated
 * beside them. It is the difference between "the 26 cases we thought of agree" and "we looked
 * for a case that does not", and on 2026-09-11 it was the second that found one.
 */
const GENERATED: readonly Uint8Array[] = (() => {
  const out: Uint8Array[] = [];
  const both = (value: string): string => `${PASSWORD_HASH_KEY}=${HASH}\n${value}\n`;
  const positions = (ch: string): void => {
    out.push(utf8(both(`${SESSION_SECRET_KEY}=${HEX64.slice(0, 32)}${ch}${HEX64.slice(32)}`)));
    out.push(utf8(both(`${SESSION_SECRET_KEY}=${HEX64}${ch}`)));
    out.push(utf8(both(`SESSION${ch}_SECRET=${HEX64}\n${SESSION_SECRET_KEY}=${HEX64}`)));
    out.push(utf8(both(`${ch}${SESSION_SECRET_KEY}=${HEX64}`)));
    out.push(utf8(`${GOOD}${ch}\n`));
    out.push(utf8(`${GOOD}${ch}# a comment\n`));
  };
  // Every ASCII code point, NUL included — the byte a shell variable cannot even hold.
  for (let cp = 0x00; cp <= 0x7f; cp += 1) positions(String.fromCodePoint(cp));
  // Go's `unicode.IsSpace` set, plus the format characters `.trim()` leaves behind.
  for (const cp of [
    0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
    0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0x200b, 0x200c, 0x200d,
    0x2060, 0xfeff, 0x180e, 0x00ad, 0x061c, 0x202a, 0x202e,
  ]) positions(String.fromCodePoint(cp));
  // The structural shapes, named so a failure says which one.
  for (const text of [
    '',
    '\n',
    '# only a comment\n',
    `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64}`, // no trailing newline
    GOOD.replace(/\n/g, '\r\n'),
    GOOD.replace(/\n/g, '\r'),
    `﻿${GOOD}`,
    `${PASSWORD_HASH_KEY}=${HASH}\n﻿${SESSION_SECRET_KEY}=${HEX64}\n`,
    both(`${SESSION_SECRET_KEY}=${HEX64.slice(0, 32)}=${HEX64.slice(33)}`),
    both(`${SESSION_SECRET_KEY}====`),
    both(`${SESSION_SECRET_KEY}=`),
    `${PASSWORD_HASH_KEY}=\n${SESSION_SECRET_KEY}=${HEX64}\n`,
    `${GOOD}export FOO=1\n`,
    `${GOOD}export FOO\n`,
    `${PASSWORD_HASH_KEY}=${HASH}\nexport ${SESSION_SECRET_KEY}=${HEX64}\n`,
    `${GOOD}   \t  \n`,
    `   # hi\n${GOOD}`,
    `${GOOD}  FOO=1\n`,
    `${GOOD}=novalue\n`,
    `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}\n`,
    `${GOOD}SOMETHING\n`,
    `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}="bad"\n${SESSION_SECRET_KEY}=${HEX64}\n`,
    `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64}\n${SESSION_SECRET_KEY}=${HEX64}\n`,
    `${GOOD}STANDING=gpu_temp\n`,
    both(`${SESSION_SECRET_KEY}=${'a'.repeat(MIN_SESSION_SECRET_CHARS)}`),
    both(`${SESSION_SECRET_KEY}=${'a'.repeat(MIN_SESSION_SECRET_CHARS - 1)}`),
    both(`${SESSION_SECRET_KEY}=${'a'.repeat(70000)}`),
    both(`${SESSION_SECRET_KEY}=${'a'.repeat(60000)}`),
    `#${'a'.repeat(70000)}\n${GOOD}`,
    `${GOOD}STANDING=${'a'.repeat(70000)}\n`,
    `${GOOD}BAD KEY=x\n`,
    `${GOOD}BAD\tKEY=x\n`,
    `${GOOD}lower=x\n`,
    `${GOOD}1BAD=x\n`,
    `${GOOD}BAD-KEY=x\n`,
    `${GOOD}${'K'.repeat(4000)}=x\n`,
    `${PASSWORD_HASH_KEY} =${HASH}\n${SESSION_SECRET_KEY}=${HEX64}\n`,
    both(`${SESSION_SECRET_KEY}=${HEX64.slice(0, 32)}\\\n${HEX64.slice(32)}`),
  ]) out.push(utf8(text));
  // Byte sequences a string literal cannot hold.
  const bad = (head: string, raw: readonly number[], tail: string): void => {
    out.push(new Uint8Array([...utf8(head), ...raw, ...utf8(tail)]));
  };
  bad(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=`, [0xff, 0xfe], '\n');
  bad(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=`, [0xed, 0xa0, 0x80], '\n'); // lone surrogate
  bad(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=`, [0xc0, 0xaf], '\n'); // overlong '/'
  bad('#', [0xc3, 0x28], `\n${GOOD}`);
  bad(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64.slice(0, 32)}`, [0x00], `${HEX64.slice(33)}\n`);
  bad(GOOD, [0x00], '\n');
  return out;
})();

describe('⚠⚠ the reader is STRICTER than Docker’s --env-file grammar, and never looser', () => {
  test('⚠ every shape lands where the table says, on both sides of the comparison', () => {
    const actual = SHAPES.map((shape) => ({
      what: shape.what,
      docker: dockerEnvFile(shape.bytes).ok ? 'takes' : 'refuses',
      ours: parseSecretEnvFile(shape.bytes).ok ? 'takes' : 'refuses',
    }));
    const expected = SHAPES.map((shape) => ({
      what: shape.what,
      docker: shape.docker,
      ours: shape.ours,
    }));
    expect(actual).toEqual(expected);
  });

  /**
   * ⚠⚠ The property, stated as an implication rather than as a list, and measured over
   * **generated** shapes: **anything we take, Docker takes — with the same values.** A shape
   * that broke this would be a file the server starts on and the operator's `docker run` would
   * have read differently, which is O21 wearing our own name instead of Docker's.
   *
   * ⚠ Run over the hand-written table AND {@link GENERATED}, because the table cannot falsify
   * its own property: on 2026-09-11 all 26 of its rows were green while a 70 KiB line made this
   * reader the more permissive of the two. The generated half is what found it, and the failure
   * message names the shape by its bytes' shape rather than by a label nobody wrote.
   */
  test('⚠ nothing this reader accepts is a file Docker would refuse or read differently', () => {
    const looserThan = (bytes: Uint8Array): boolean => {
      const ours = parseSecretEnvFile(bytes);
      if (!ours.ok) return false;
      const theirs = dockerEnvFile(bytes);
      if (!theirs.ok) return true;
      return (
        theirs.env[PASSWORD_HASH_KEY] !== ours.env[PASSWORD_HASH_KEY] ||
        theirs.env[SESSION_SECRET_KEY] !== ours.env[SESSION_SECRET_KEY]
      );
    };
    expect(SHAPES.filter((s) => looserThan(s.bytes)).map((s) => s.what)).toEqual([]);

    const describeBytes = (b: Uint8Array): string =>
      `${b.length} bytes: ${JSON.stringify(new TextDecoder().decode(b.slice(0, 120)))}`;
    expect(GENERATED.filter(looserThan).map(describeBytes)).toEqual([]);
    // ⚠ And the search is not vacuous: it has to be big enough to have looked somewhere.
    expect(GENERATED.length).toBeGreaterThan(600);
    expect(GENERATED.filter((b) => parseSecretEnvFile(b).ok).length).toBeGreaterThan(20);
  });

  /**
   * ⚠ **`dockerEnvFile`'s `os.LookupEnv` branch, which every other call site leaves dead**
   * (11b-A14, 2026-09-11). Both tests above pass the default `hostEnv = {}`, so the one rule
   * of Docker's grammar that reads something *outside the file* was modelled and never
   * exercised. It is harmless for the implication — this reader refuses **every** bare line,
   * so it can never be the more permissive side there — but it is not harmless for step 12:
   * the planned confirmation on the box is `docker run --env-file <shape> env` per shape, and
   * for a bare line **that gives a different answer depending on the invoking shell's own
   * environment**. Nothing said so; this does, and it makes the branch a measured one.
   */
  test('⚠ a bare line is Docker reading the HOST environment, and this reader refuses it either way', () => {
    const bare = utf8(`${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}\n`);

    // With the variable set in the invoking environment, Docker builds a COMPLETE, working
    // container — the silent failure O21 is about, one hard wrap away.
    const withHost = dockerEnvFile(bare, { [SESSION_SECRET_KEY]: HEX64 });
    expect(withHost.ok).toBe(true);
    expect(withHost.ok && withHost.env[SESSION_SECRET_KEY]).toBe(HEX64);

    // With it unset — the ordinary case, and what a systemd unit gives — the key is simply
    // ABSENT, and `readAuthConfig` then denies every login with nothing logged.
    const withoutHost = dockerEnvFile(bare);
    expect(withoutHost.ok).toBe(true);
    expect(withoutHost.ok && withoutHost.env[SESSION_SECRET_KEY]).toBeUndefined();

    // ⚠ And this reader refuses the file in BOTH cases, which is the whole point of the rule —
    // **by the bare-line rule, and the REASON is what says so**. Asserting only `ok === false`
    // was not enough and the red-test ledger said so: with the rule disabled (`11b-S6`) the file
    // is still refused, because `line.slice(0, -1)` leaves a key one character short and
    // `SESSION_SECRET` is then *absent* — a true refusal for the wrong reason, which sends an
    // operator to the wrong line. That is 11-A18g, and it is why this asserts the sentence.
    const verdict = parseSecretEnvFile(bare);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? '' : refusalReport(SECRET_ENV_FILE, verdict.refusals)).toContain(
      "has no '='",
    );
  });

  /**
   * ⚠ 11-A6's rule, over the generated half as well: a refusal carries a key, a line number
   * and a reason. Not the value, not the line, and not a prefix of either — including on the
   * shapes where the value is *what makes the line malformed*, which is the case where a
   * "helpful" message is most tempting to write.
   */
  test('⚠ no generated shape puts the secret it refused into its own refusal report', () => {
    const leaked: string[] = [];
    for (const bytes of GENERATED) {
      const verdict = parseSecretEnvFile(bytes);
      if (verdict.ok) continue;
      const report = refusalReport(SECRET_ENV_FILE, verdict.refusals);
      for (const secret of [HEX64, HASH]) {
        for (const fragment of [secret, secret.slice(0, 16), secret.slice(-16)]) {
          if (report.includes(fragment)) leaked.push(`${bytes.length} bytes leaked ${fragment}`);
        }
      }
    }
    expect(leaked).toEqual([]);
  });

  test('⚠ each refusal names its reason, and the table’s strict half is not empty', () => {
    for (const shape of SHAPES) {
      if (shape.says === undefined) continue;
      const verdict = parseSecretEnvFile(shape.bytes);
      expect(verdict.ok, shape.what).toBe(false);
      const report = verdict.ok ? '' : refusalReport(SECRET_ENV_FILE, verdict.refusals);
      expect(report, shape.what).toContain(shape.says);
    }
    // The whole point of the ruling: there IS a gap, and it is where O21 lived.
    const stricter = SHAPES.filter((s) => s.docker === 'takes' && s.ours === 'refuses');
    expect(stricter.length).toBeGreaterThanOrEqual(15);
  });
});

describe('⚠ a refusal names the key and the reason, and never the value', () => {
  /**
   * ⚠ 11-A6 is the precedent: a `check` row printed `${line%%[!A-Za-z0-9_]*}…`, which removed
   * nothing from 64 characters of `[0-9a-f]`, so a whole `SESSION_SECRET` reached the
   * terminal followed by an ellipsis implying it had been truncated. Every refusal path is
   * driven here and the secret is required to be absent from the report — whole, and by
   * halves, since a prefix is still a prefix of a credential.
   */
  test('⚠ no refusal report contains the secret it refused, whole or by halves', () => {
    for (const shape of SHAPES) {
      const verdict = parseSecretEnvFile(shape.bytes);
      if (verdict.ok) continue;
      const report = refusalReport(SECRET_ENV_FILE, verdict.refusals);
      for (const secret of [HEX64, HASH]) {
        expect(report, shape.what).not.toContain(secret);
        expect(report, shape.what).not.toContain(secret.slice(0, 20));
        expect(report, shape.what).not.toContain(secret.slice(-20));
      }
    }
  });

  test('⚠ the report names the file, every failing key, and says values are not printed', () => {
    const verdict = parseSecretEnvFile(utf8(`${PASSWORD_HASH_KEY}="${HASH}"\n`));
    expect(verdict.ok).toBe(false);
    const report = verdict.ok ? '' : refusalReport(SECRET_ENV_FILE, verdict.refusals);

    expect(report).toContain('REFUSING TO START');
    expect(report).toContain(SECRET_ENV_FILE);
    expect(report).toContain(PASSWORD_HASH_KEY);
    // Both failures are reported in one run — a file with two problems is fixed once.
    expect(report).toContain(SESSION_SECRET_KEY);
    expect(report).toContain('values are never printed');
  });
});

describe('⚠ the per-value rule, which dashboard.sh spells a second time', () => {
  /**
   * ⚠ The ORDER of these is part of the contract, because `packaging.test.ts` asserts that
   * `secret_value_error` in `dashboard.sh` returns the SAME message for the same input —
   * message for message, not merely verdict for verdict. Two implementations of one format
   * is the shape on HANDOVER's do-not-copy list; this repo pays for the one it already has
   * (`scripts/hash-password.py`) with a cross-check that runs the real other side.
   */
  test('⚠ each value rule fires in its own order and a clean value passes', () => {
    expect(secretValueError(HEX64)).toBeNull();
    expect(secretValueError(HASH)).toBeNull();
    expect(secretValueError('')).toBe('is empty');
    expect(secretValueError('a\nb')).toContain('line break');
    expect(secretValueError('"a"')).toContain('double quote');
    expect(secretValueError("'a'")).toContain('single quote');
    expect(secretValueError('a$b')).toContain('would expand');
    expect(secretValueError('a`b')).toContain('EXECUTE');
    expect(secretValueError(' a')).toContain('leading whitespace');
    expect(secretValueError('a ')).toContain('trailing whitespace');
    expect(secretValueError('a\\b')).toContain('escape');
    expect(secretValueError('a#b')).toContain('comment');
    expect(secretValueError('a b')).toContain('outside printable ASCII');
    // ⚠ A quoted value is refused for the QUOTE, not for the range — the specific message is
    // what sends an operator to the right line, and it is the one 11-A18g was about.
    expect(secretValueError('" a"')).toContain('double quote');
  });

  test('⚠ every printable ASCII character except the six named ones is accepted', () => {
    const refused: string[] = [];
    for (let cp = 0x21; cp <= 0x7e; cp += 1) {
      const ch = String.fromCodePoint(cp);
      if (secretValueError(`aa${ch}aa`) !== null) refused.push(ch);
    }
    expect(refused.sort().join('')).toBe('#$\'"\\`'.split('').sort().join(''));
  });
});

describe('⚠⚠ the file is read once, and a degraded read is never SILENT', () => {
  const sourceOf = (
    text: string,
  ): {
    source: ReturnType<typeof makeSecretSource>;
    reads: () => number;
    reported: string[];
  } => {
    let reads = 0;
    const reported: string[] = [];
    const source = makeSecretSource(
      () => {
        reads += 1;
        return utf8(text);
      },
      SECRET_ENV_FILE,
      (report) => reported.push(report),
    );
    return { source, reads: () => reads, reported };
  };

  test('⚠ three calls across both entrances read the file exactly once', () => {
    const { source, reads } = sourceOf(GOOD);
    expect(source.environment()[SESSION_SECRET_KEY]).toBe(HEX64);
    expect(source.environment()[PASSWORD_HASH_KEY]).toBe(HASH);
    expect(source.refusal()).toBeNull();
    expect(reads()).toBe(1);
  });

  test('⚠ a refused file DENIES on the request path — a 401, never a 500', () => {
    const { source, reads } = sourceOf(`${PASSWORD_HASH_KEY}="${HASH}"\n${SESSION_SECRET_KEY}=${HEX64}\n`);
    // §5: a check that cannot reach a verdict is a 401, never a 500 — so the request path
    // must not throw, on any entrance. The loud half is the report, not an exception.
    expect(() => source.environment()).not.toThrow();
    expect(source.environment()).toEqual({});
    expect(source.refusal()).toContain(PASSWORD_HASH_KEY);
    expect(source.refusal()).toContain('REFUSING TO START');
    expect(reads()).toBe(1);
  });

  /**
   * ⚠⚠ **The property `11b-A3` is about, and it is "never silently degrades" rather than
   * "reads once".** Measured 2026-09-11: startup validated the file and the server went ready;
   * an in-place append then made the request-path copies of this reader memoise an **empty**
   * `Environment`; every login was a 401; **nothing was logged**, because `runStartup` is the
   * only thing that ever consults `refusal()` and it had already run; and the process never
   * exited, so `Restart=always` never fired. `lib/auth/secrets.ts` makes the copies share one
   * read, which removes the ordering that produced it — and this is the guarantee that does
   * not depend on the sharing holding.
   */
  test('⚠⚠ a request path that is the FIRST to read a refused file reports it before denying', () => {
    const { source, reported } = sourceOf(`${PASSWORD_HASH_KEY}=\n${SESSION_SECRET_KEY}=${HEX64}\n`);
    expect(reported).toEqual([]);
    expect(source.environment()).toEqual({});
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain(PASSWORD_HASH_KEY);
    expect(reported[0]).toContain('is empty');
  });

  test('⚠ it says the server is RUNNING and denying, and does NOT borrow "REFUSING TO START"', () => {
    // ⚠ 11-A18g, and the test phase paid for this exact shape once in `startup.ts`'s warn arm:
    // a message announcing a refusal on a process that then serves requests is a true sentence
    // about the wrong thing, and it is the fastest way to teach a reader that this particular
    // message can be ignored.
    const { source, reported } = sourceOf(`${SESSION_SECRET_KEY}=${HEX64}\n`);
    source.environment();
    expect(reported[0]).not.toContain('REFUSING TO START');
    expect(reported[0]).toContain('the server is RUNNING');
    expect(reported[0]).toContain(SECRET_ENV_FILE);
    // …and it still never prints a value.
    expect(reported[0]).not.toContain(HEX64);
  });

  test('⚠ it reports ONCE, however many requests arrive', () => {
    const { source, reported } = sourceOf(`${SESSION_SECRET_KEY}=${HEX64}\n`);
    for (let i = 0; i < 25; i += 1) source.environment();
    expect(reported).toHaveLength(1);
  });

  test('⚠ the STARTUP entrance does not report — its caller prints what it is given', () => {
    // Reporting here too would print one refusal twice on the one path that is already loud,
    // and `startup.ts` needs the text in order to choose between exit(1) and a warning.
    const { source, reported } = sourceOf(`${SESSION_SECRET_KEY}=${HEX64}\n`);
    expect(source.refusal()).toContain('REFUSING TO START');
    expect(reported).toEqual([]);
    // …and a request path that arrives AFTER it does not repeat what startup already said.
    expect(source.environment()).toEqual({});
    expect(reported).toEqual([]);
  });

  test('⚠ a GOOD file reports nothing at all — §5 logs nothing about authentication', () => {
    const { source, reported } = sourceOf(GOOD);
    expect(source.environment()[PASSWORD_HASH_KEY]).toBe(HASH);
    expect(source.refusal()).toBeNull();
    expect(reported).toEqual([]);
  });

  test('⚠ a file that cannot be read at all is a refusal, not an exception at request time', () => {
    const reported: string[] = [];
    const source = makeSecretSource(
      () => {
        throw Object.assign(new Error('nope'), { code: 'ENOENT' });
      },
      SECRET_ENV_FILE,
      (report) => reported.push(report),
    );
    expect(source.environment()).toEqual({});
    expect(source.refusal()).toContain('ENOENT');
    expect(source.refusal()).toContain(SECRET_ENV_FILE);
    expect(reported).toHaveLength(1);
  });

  test('⚠ only the two secrets cross the seam — STANDING in the file reaches nothing', () => {
    // §6.4's list is configuration and stays an environment variable (`docker run -e
    // STANDING`). A STANDING that arrived through this reader would be a second source for
    // one value, and `lib/telemetry/source.ts` would never see a change to it.
    const { source } = sourceOf(
      `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64}\nSTANDING=gpu_temp,unit:llama-server@0.service\n`,
    );
    expect(Object.keys(source.environment()).sort()).toEqual([PASSWORD_HASH_KEY, SESSION_SECRET_KEY]);
  });

  // ⚠ NOT ⚠-marked, and the reason is recorded rather than papered over: there is no
  // one-file wrong implementation of this that COMPILES. Adding a third property to the
  // returned object is an excess-property error against the declared `SecretSource` return
  // type, and renaming one is an interface mismatch — so no mutation can redden it, and a
  // mutation that does not compile proves nothing about the tests (HANDOVER §0.10). It is a
  // structural assertion, kept because 11b-A9 is what it is about.
  test('the interface has exactly TWO entrances — require() had no production caller', () => {
    // 11b-A9: it was documented as "the startup path", and the startup path is
    // `instrumentation.ts` → `startup.ts` → `refusal()` → `process.exit(1)`, deliberately not
    // a throw. Four assertions about `require()` and nothing else called it, while `refusal()`
    // — the entrance the whole ruling turns on — had no test of its own. An exported seam
    // nothing uses is the hazard step 7 already removed once (`noSessionVerifierYet`).
    const { source } = sourceOf(GOOD);
    expect(Object.keys(source).sort()).toEqual(['environment', 'refusal']);
  });
});
