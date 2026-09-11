/**
 * Step 11 — the packaging artefacts, and the three rules `dashboard.sh` spells a SECOND time.
 *
 * ---
 *
 * ### ⚠ Why this file exists at all
 *
 * `dashboard.sh` has to judge, in bash, on a box with no Node, three things whose first and
 * canonical spelling is TypeScript in `lib/`:
 *
 * | rule | canonical spelling | what a divergence costs |
 * |---|---|---|
 * | O20 the hash encoding | `parseScryptHash` (`lib/auth/scrypt.ts`) | a clean empty **401** on every login, with **nothing logged** |
 * | O21 the env-file grammar | `readAuthConfig` (`lib/auth/config.ts`) + Docker's `--env-file` | a working dashboard whose sessions all die the next time the file is rewritten |
 * | D8 the STANDING vocabulary | `standingIdsFrom` (`lib/conditions.ts`) | a suppression that suppresses nothing, with the banner nailed open |
 *
 * Every one of those is silent. This project has already shipped a divergence of exactly
 * this shape — two base64url decoders, so 1 tag in 16 had four accepted spellings — and the
 * rule on HANDOVER's do-not-copy list is **never a second implementation of a canonical
 * format**. `scripts/hash-password.py` is allowed to be a second *producer* only because
 * `lib/auth/hash-password-script.test.ts` runs the real file and measures the agreement.
 *
 * **This file is that measurement for the second *judge*.** It sources the real
 * `dashboard.sh` — not a copy of its logic, which would be a third implementation proving
 * nothing — and asserts its verdict equals the TypeScript's on every fixture.
 *
 * ⚠ INSTALL-SPEC §9 asks for O20 to be *"verified by running it through the image, not by a
 * regex here"*. It cannot be, and `pipeline/steps/11-packaging/build.md` §5 records why: the
 * image exposes `parseScryptHash` only behind Next's bundled server, and the HTTP surface
 * cannot distinguish an unparseable hash from a wrong password — both are a 401 by design.
 * Agreement measured here is what replaces it.
 *
 * ### ⚠⚠ What the 2026-09-10 reconciliation added, and why it is the shape to copy
 *
 * The adversarial applied **63 one-line edits** to the four artefacts this file measures and
 * **49 kept the whole suite green** — every `check` row the test phase had not wired, all seven
 * preflight refusals, `restart`'s container-id proof, `install`'s own failure gate, and
 * `check_one_process` **deleted from `cmd_check` outright**. Two structural causes:
 *
 *   1. nothing asserted **which functions `cmd_check` calls**, and
 *   2. nothing asserted **that a guard REFUSES** — only that it could be called and that the
 *      validator behind it returned the right verdict.
 *
 * So there are now two general mechanisms rather than 49 assertions, and both are TABLES: a row
 * added to `check`, or a refusal added to `preflight`, must be entered in one of them or the
 * mechanism itself goes red.
 *
 *   · `CHECK_ROWS` + `cmdCheckWithRows` — the call graph, read from the source AND exercised.
 *   · `guardRow` / `preflightWith` + their case tables — every guard, on its own bad input and
 *     on a healthy box, with the verdict AND a substring of the message.
 *
 * **Re-measured after: 48 of 48 enumerated survivors now fail the suite.** The rule to carry, and
 * it is HANDOVER §0.13's: *a cross-check is only worth the call site it is wired into, and a
 * guard is only worth an assertion that it refuses.*
 *
 * ### What else is pinned
 *
 * The Dockerfile, the unit and `.dockerignore` are configuration, and this repo's standing
 * rule is that **writing the config is not evidence it took**. Where the check can be made
 * against the system (`systemctl show -p StartLimitIntervalUSec`) `dashboard.sh` makes it on
 * the box; the assertions here are the half that can be made without one, and they are
 * text assertions for that reason.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { readAuthConfig, MIN_SESSION_SECRET_CHARS } from '@/lib/auth/config';
import { MAX_LINE_BYTES, parseSecretEnvFile, refusalReport, secretValueError } from '@/lib/auth/secret-file';
import { standingIdsFrom } from '@/lib/conditions';
import { KEY_BYTES, SALT_BYTES, parseScryptHash } from '@/lib/auth/scrypt';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(projectRoot, rel), 'utf8');

const DASHBOARD_SH = read('dashboard.sh');
const DOCKERFILE = read('Dockerfile');
const DOCKERIGNORE = read('.dockerignore');
const UNIT = read('systemd/ai-dashboard.service');

// ---------------------------------------------------------------------------------------
// Calling the real script's validators
// ---------------------------------------------------------------------------------------

/**
 * Run one of `dashboard.sh`'s validators over several inputs, in ONE bash process.
 *
 * ⚠ The script is **sourced**, under `DASHBOARD_SH_LIB=1`, which is the only reason it does
 * not run `main`. That hook exists for this file: the alternative was a CLI subcommand
 * nobody would ever type, or no cross-check at all.
 *
 * Returns one entry per input: `null` when the validator accepted it, or the message it
 * printed. Newlines in a message are folded, so one input is always one line.
 */
const validate = (fn: string, inputs: readonly string[]): (string | null)[] => {
  const script = [
    'DASHBOARD_SH_LIB=1 . ./dashboard.sh',
    'load_condition_rules',
    'fn="$1"; shift',
    'i=0',
    'for v in "$@"; do',
    '  if out="$("$fn" "$v")"; then printf "%s\\tOK\\t\\n" "$i"',
    '  else out="${out//$\'\\n\'/ }"; printf "%s\\tERR\\t%s\\n" "$i" "$out"; fi',
    '  i=$((i+1))',
    'done',
  ].join('\n');
  const stdout = execFileSync('bash', ['-c', script, 'dashboard.sh', fn, ...inputs], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, SRC: projectRoot },
  });
  const lines = stdout.split('\n').filter((l) => l !== '');
  expect(lines).toHaveLength(inputs.length);
  return lines.map((line) => {
    const [, verdict, message] = line.split('\t');
    return verdict === 'OK' ? null : (message ?? '');
  });
};

/** Source `dashboard.sh` and run `body` against it, with `$1…` bound to `args`. */
const sourced = (
  body: readonly string[],
  env: Readonly<Record<string, string>> = {},
  args: readonly string[] = [],
  input?: string,
): ScriptRun => {
  const script = ['DASHBOARD_SH_LIB=1 . ./dashboard.sh', ...body].join('\n');
  try {
    const out = execFileSync('bash', ['-c', script, 'dashboard.sh', ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      ...(input === undefined ? {} : { input }),
      env: { ...process.env, SRC: projectRoot, ...env },
    });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

/**
 * The body of one shell function, read out of the script.
 *
 * ⚠ Every function in `dashboard.sh` closes with a `}` in column 0, which is what makes this
 * a lexical fact rather than a guess.
 */
const functionBody = (name: string): string => {
  const header = `\n${name}() {\n`;
  const at = DASHBOARD_SH.indexOf(header);
  expect(at, `${name}() is not defined in dashboard.sh`).toBeGreaterThan(-1);
  const from = at + header.length;
  const to = DASHBOARD_SH.indexOf('\n}\n', from);
  expect(to).toBeGreaterThan(from);
  return DASHBOARD_SH.slice(from, to);
};

/**
 * Run one of `check`'s ROWS against an env file, and return what it printed together with
 * the number of rows it failed.
 *
 * ⚠ **A different measurement from {@link validate}, and neither replaces the other.**
 * `validate` proves the three validators agree with the TypeScript. This proves the rows
 * that are supposed to CALL them actually do — and that is not the same property. Measured
 * 2026-09-10, before these tests existed: `check_session_secret`, `check_password_hash`,
 * `check_standing`, the env-file row and `env_set`'s refusal could EACH be disconnected
 * from its validator and all 24 tests stayed green. The shell half broken while the table
 * still passed, five ways, on the four obligations this whole step exists for.
 */
const checkRow = (fn: string, envFileBody: string): { out: string; failed: number } => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
  try {
    const file = join(dir, 'ai-dashboard.env');
    writeFileSync(file, envFileBody);
    const result = sourced(['CHECK_FAIL=0', '"$1" || true', 'printf "\\nFAILED=%s\\n" "$CHECK_FAIL"'], {
      ENV_FILE: file,
    }, [fn]);
    const matched = /FAILED=(\d+)/.exec(result.out);
    expect(matched).not.toBeNull();
    return { out: result.out, failed: Number((matched as RegExpExecArray)[1]) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------------------------------
// O20 — the hash encoding
// ---------------------------------------------------------------------------------------

/** A real hash, produced by the project's own host-side producer. */
const realHash = (): string =>
  execFileSync('python3', [join(projectRoot, 'scripts/hash-password.py')], {
    input: 'correct horse battery 9',
    encoding: 'utf8',
  }).trim();

const b64 = (bytes: number, fill = 0): string => Buffer.alloc(bytes, fill).toString('base64url');

describe('⚠ O20 — dashboard.sh judges a PASSWORD_HASH exactly as parseScryptHash does', () => {
  const good = realHash();

  /**
   * Both sides of every rule `parseScryptHash` enforces, plus the four spellings that make
   * this worth measuring rather than eyeballing.
   *
   * ⚠ The trailing character class in `HASH_SALT_RE` needs a salt of the RIGHT LENGTH
   * whose last character carries unused low bits — `A`×21 + `B`, 22 characters. `decodeExact`
   * re-encodes what it decoded and compares, so that spelling decodes to the right sixteen
   * bytes and is still refused; a validator checking only the alphabet and the length would
   * accept it, and the server would then reject the hash that `check` had just approved.
   * ⚠ The `A`×21 + `Ag` row above it is **23** characters and is refused for its LENGTH, by
   * both sides, whatever the trailing class says. It was the only salt-tail fixture until
   * 2026-09-10, and with it alone `HASH_SALT_RE` could be reduced to `{22}$` — the exact
   * defect this comment describes — with every test still green. The key side had both.
   */
  const fixtures: readonly string[] = [
    good,
    '',
    'argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aGFzaA',
    `$argon2id$v=19$m=65536,t=3,p=4$${b64(SALT_BYTES)}$${b64(KEY_BYTES)}`,
    `scrypt.15.8.1.${b64(SALT_BYTES)}`, // five fields
    `scrypt.15.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}.extra`, // seven
    `bcrypt.15.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // wrong tag
    `scrypt.0.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // logN below LIMITS
    `scrypt.20.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // logN at the ceiling
    `scrypt.21.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // logN above it
    `scrypt.015.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // zero-padded
    `scrypt.15.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // canonical, all-zero bytes
    `scrypt.15.32.16.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // r and p at their ceilings
    `scrypt.15.33.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // r above its ceiling
    `scrypt.15.0.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // r below its floor
    `scrypt.15.8.0.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // p below its floor
    `scrypt.15.8.17.${b64(SALT_BYTES)}.${b64(KEY_BYTES)}`, // p above its ceiling
    `scrypt.15.8.1.${b64(SALT_BYTES - 1)}.${b64(KEY_BYTES)}`, // short salt
    `scrypt.15.8.1.${b64(SALT_BYTES)}.${b64(KEY_BYTES - 1)}`, // short key
    `scrypt.15.8.1.${'A'.repeat(21)}Ag.${b64(KEY_BYTES)}`, // a salt one character too LONG
    `scrypt.15.8.1.${'A'.repeat(21)}B.${b64(KEY_BYTES)}`, // non-canonical salt tail, right length
    `scrypt.15.8.1.${b64(SALT_BYTES)}.${'A'.repeat(42)}B`, // non-canonical key tail
    `scrypt.15.8.1.${b64(SALT_BYTES).replace(/.$/, '+')}.${b64(KEY_BYTES)}`, // standard alphabet
    `scrypt.15.8.1.${b64(SALT_BYTES)}==.${b64(KEY_BYTES)}`, // padded
  ];

  test('⚠ the bash validator and parseScryptHash accept exactly the same hashes', () => {
    const bash = validate('scrypt_hash_error', fixtures);
    const node = fixtures.map((h) => parseScryptHash(h) !== null);

    const disagreements = fixtures
      .map((h, i) => ({ hash: h.slice(0, 40), bashAccepts: bash[i] === null, node: node[i] }))
      .filter((row) => row.bashAccepts !== row.node);

    expect(disagreements).toEqual([]);
    // …and the table is not vacuous in either direction.
    expect(node.filter(Boolean).length).toBeGreaterThan(2);
    expect(node.filter((v) => !v).length).toBeGreaterThan(10);
  });

  test('⚠ an argon2id hash is named as such rather than reported as a shape problem', () => {
    const [message] = validate('scrypt_hash_error', [
      `$argon2id$v=19$m=65536,t=3,p=4$${b64(SALT_BYTES)}$${b64(KEY_BYTES)}`,
    ]);
    expect(message).toContain('argon2id');
    expect(message).toContain('401');
  });

  test('⚠ no rejection message repeats the hash it was handed', () => {
    // ⚠ BOTH message paths, because there are two fields a message could quote and each
    // has its own line: the key's (`11-H8`) and the salt's (`11-H12`).
    const badKey = `scrypt.15.8.1.${'S'.repeat(21)}Q.${'S'.repeat(43)}`;
    const badSalt = `scrypt.15.8.1.${'S'.repeat(21)}B.${b64(KEY_BYTES)}`;
    const [keyMessage, saltMessage] = validate('scrypt_hash_error', [badKey, badSalt]);
    expect(keyMessage).not.toBeNull();
    expect(keyMessage).toContain('field 6 (key)');
    expect(keyMessage).not.toContain('S'.repeat(21));
    expect(saltMessage).not.toBeNull();
    expect(saltMessage).toContain('field 5 (salt)');
    expect(saltMessage).not.toContain('S'.repeat(21));
  });
});

// ---------------------------------------------------------------------------------------
// O21 — the env-file grammar
// ---------------------------------------------------------------------------------------

describe('⚠ O21 — dashboard.sh refuses a value Docker would keep verbatim', () => {
  const cases: readonly (readonly [string, boolean, string])[] = [
    ['0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', true, '64 hex characters, what configure writes'],
    ['', true, 'empty is legal — STANDING= means nothing is standing'],
    ['a,b', true, 'a comma is §6.4’s own separator'],
    ['"0123456789abcdef0123456789abcdef"', false, 'double-quoted'],
    ["'0123456789abcdef0123456789abcdef'", false, 'single-quoted'],
    ['0123456789abcdef$HOME', false, 'a $ a sourcing shell would expand'],
    ['0123456789abcdef`id`', false, 'a backtick a sourcing shell would EXECUTE'],
    [' 0123456789abcdef0123456789abcdef', false, 'leading space'],
    ['0123456789abcdef0123456789abcdef ', false, 'trailing space'],
    ['first\nsecond', false, 'a line break'],
    ['first\rsecond', false, 'a carriage return'],
    // ⚠ Both tab shapes. `env_value_error` refuses leading and trailing whitespace as TEXT
    // rather than by a trim-and-compare, and the `$'\t'` alternatives of that case could be
    // dropped with everything green (X39): Docker keeps a tab exactly as it keeps a space.
    ['\t0123456789abcdef0123456789abcdef', false, 'a leading tab'],
    ['0123456789abcdef0123456789abcdef\t', false, 'a trailing tab'],
  ];

  test('⚠ every quoted, padded or multi-line value is refused and every clean one is kept', () => {
    const verdicts = validate('env_value_error', cases.map(([value]) => value));
    const actual = cases.map(([value, , why], i) => [why, value, verdicts[i] === null] as const);
    const expected = cases.map(([value, accepted, why]) => [why, value, accepted] as const);
    expect(actual).toEqual(expected);
  });

  /**
   * ⚠ The measurement that says why this check has to exist at all: `readAuthConfig` CANNOT
   * see the defect. A quoted 32-character secret is a 34-character secret to Docker, it
   * clears the floor, and it works — until the next person writes the file without the quotes
   * and every open session dies.
   *
   * ⚠ **Half of that changed on 2026-09-11 and the other half did not.** The SERVER now
   * refuses it, at startup, by name (`parseSecretEnvFile`, SPEC §5.1's ruling) — so this is no
   * longer the only place it is caught. `readAuthConfig` still cannot see it, and that is why
   * the ruling moved the parse rather than tightening this function.
   */
  test('⚠ a quoted secret passes readAuthConfig, and is caught by the script AND the reader', () => {
    const quoted = `"${'a'.repeat(MIN_SESSION_SECRET_CHARS)}"`;
    expect(readAuthConfig({ PASSWORD_HASH: 'x', SESSION_SECRET: quoted })).not.toBeNull();
    expect(quoted.length).toBe(MIN_SESSION_SECRET_CHARS + 2);

    const [message] = validate('env_value_error', [quoted]);
    expect(message).toContain('does not strip quotes');

    // …and the server's own reader, which is what turns it from a silent failure into a
    // startup refusal.
    const file = new TextEncoder().encode(`PASSWORD_HASH=x\nSESSION_SECRET=${quoted}\n`);
    expect(parseSecretEnvFile(file).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ 11-Q2 — the SECRET rule, spelled once in bash and once in TypeScript
// ---------------------------------------------------------------------------------------

describe('⚠⚠ secret_value_error and secretValueError are the SAME rule, message for message', () => {
  /**
   * ⚠ SPEC.md §5.1's ruling of 2026-09-11 moved the parse of `/etc/ai-dashboard.env` into the
   * server. That makes `dashboard.sh` — which WRITES the file — and `lib/auth/secret-file.ts`
   * — which REFUSES TO START on it — two implementations of one grammar, the shape on
   * HANDOVER's do-not-copy list. The same answer as `scripts/hash-password.py`'s: keep them
   * equal by MEASUREMENT, running the real bash against the real TypeScript.
   *
   * ⚠ Verdicts alone would not be enough. A value refused for the wrong REASON sends an
   * operator to the wrong line — 11-A18g is exactly that defect — so the messages are
   * compared too, which also pins the ORDER the rules fire in.
   */
  const NAMED: readonly string[] = [
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'scrypt.15.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    '',
    '"quoted"',
    "'quoted'",
    'has$dollar',
    'has`backtick`',
    ' leading',
    'trailing ',
    '\tleading-tab',
    'trailing-tab\t',
    'two\nlines',
    'carriage\rreturn',
    'back\\slash',
    'hash#mark',
    'interior space',
    'non\u00a0breaking',
    'zero\u200bwidth',
    'em\u2003space',
    'accented-\u00e9',
    'tilde~and-bang!',
    'every+printable/char=is:fine;[]{}()<>|&*?^@%-_.,',
  ];

  /**
   * ⚠⚠ GENERATED, not listed — and the reason is a measurement, taken 2026-09-11.
   *
   * The 22 values above were the whole corpus, and **two one-line edits to `secretValueError`
   * kept the entire suite green while the two implementations disagreed**:
   *
   *   1. `cp > 0x7e` → `cp > 0x7f`, so TypeScript accepts DEL and `!-~` under `LC_ALL=C` still
   *      refuses it. No listed value carried a 0x7f.
   *   2. swapping the backslash rule and the `#` rule, so a value carrying BOTH gets a
   *      different *message* from each side. No listed value carried both — and the header of
   *      `secretValueError` says in so many words that "the order of the tests below is part of
   *      the contract".
   *
   * So the corpus is built instead: **every ASCII code point** in the middle of a value (which
   * pins the boundaries of the printable range from both sides), and **every ordered pair of
   * the ten characters that have a rule**, which is what pins the order the rules fire in. That
   * is 227 values on top of the 22, in one bash process.
   *
   * ⚠ NUL is the one byte not here, and it cannot be: `execve` takes NUL-terminated arguments,
   * so no value containing one can reach `secret_value_error` at all — and a bash variable
   * cannot hold one either. The two do diverge on it (TypeScript refuses, bash cannot see it),
   * which is why the FILE-level rule in `check_env_file` had to grow a byte check of its own
   * rather than relying on this table.
   */
  const SPECIAL = ['"', "'", '$', '`', '\\', '#', ' ', '\t', '\n', '\r'] as const;
  const values: readonly string[] = [
    ...NAMED,
    // Every ASCII code point except NUL, in the middle of an otherwise clean value.
    ...Array.from({ length: 0x7f }, (_, i) => `aa${String.fromCodePoint(i + 1)}aa`),
    // Every ordered pair of the ten characters with a rule — the order IS the contract.
    ...SPECIAL.flatMap((x) => SPECIAL.map((y) => `a${x}b${y}c`)),
  ];

  test('⚠ every value gets the same verdict AND the same message from both implementations', () => {
    const fromBash = validate('secret_value_error', values);
    const fromTypeScript = values.map((v) => secretValueError(v));
    // ⚠ Reported as a list of DISAGREEMENTS rather than as two 249-element arrays, so a
    // failure names the value and both messages instead of printing a diff nobody can read.
    const disagreements = values
      .map((value, i) => ({ value: JSON.stringify(value), bash: fromBash[i], ts: fromTypeScript[i] }))
      .filter((row) => row.bash !== row.ts);
    expect(disagreements).toEqual([]);
    // The search is not vacuous: it has to have asked about more than the named values.
    expect(values.length).toBeGreaterThan(240);
    expect(fromTypeScript.filter((m) => m === null).length).toBeGreaterThan(80);
  });

  /**
   * ⚠ The direction that matters on a deploy: `configure` must not be able to WRITE a value
   * the server will then refuse to start on.
   *
   * ⚠ TWO halves, because either alone would name a property it does not check — the shape
   * this project has shipped in every single step. The first is that the writer's rule is no
   * looser than the reader's parser; the second is that `env_set` — the one function that
   * writes this file — actually ASKS the writer's rule for the two secret keys. A table that
   * agrees with a function nothing calls is worth nothing (HANDOVER §0.13).
   */
  test('⚠ env_set asks the strict rule, and everything that rule permits the reader parses', () => {
    expect(functionBody('env_set')).toContain('secret_value_error "$value"');

    const verdicts = validate('secret_value_error', values);
    const writable = values.filter((_v, i) => verdicts[i] === null);
    for (const value of writable) {
      const file = new TextEncoder().encode(
        `PASSWORD_HASH=${value}\nSESSION_SECRET=0123456789abcdef0123456789abcdef\n`,
      );
      expect(parseSecretEnvFile(file).ok, value).toBe(true);
    }
    expect(writable.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ 11-Q2 — and the FILE grammar, which is the half that was not being compared
// ---------------------------------------------------------------------------------------

/**
 * Run the three `check` rows that read the credentials file, against a file given as BYTES,
 * with the mode row satisfied so only the content rows can fail.
 *
 * ⚠ Bytes rather than a string because one of the shapes below is a NUL, which is the whole
 * point: `read` drops it, so the rows above could not see it at all.
 */
const checkFileRows = (bytes: Uint8Array): { refuses: boolean; out: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
  try {
    const file = join(dir, 'ai-dashboard.env');
    writeFileSync(file, bytes);
    const result = sourced(
      [
        'env_file_stat() { printf "%s" "640 0:10001"; }',
        'container_gid() { printf "%s" "10001"; }',
        'CHECK_FAIL=0',
        'CHECK_UNKNOWN=0',
        'check_env_file || true',
        'check_password_hash || true',
        'check_session_secret || true',
        'printf "\\nFAILED=%s\\n" "$CHECK_FAIL"',
      ],
      { ENV_FILE: file },
    );
    const matched = /FAILED=(\d+)/.exec(result.out);
    expect(matched, result.out).not.toBeNull();
    return { refuses: Number((matched as RegExpExecArray)[1]) > 0, out: result.out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * The same three rows over MANY files, in **one** bash process — {@link validate}'s shape,
 * applied to files instead of to values.
 *
 * ⚠⚠ **This exists because a hand-written table cannot falsify its own property, and the
 * table one screen down was the second instance of that in two loops.** The test phase fixed
 * `secret-file.test.ts` by generating 986 shapes, wrote the sentence, and closed the
 * check-vs-server hole in this file with **21 literal rows** — whose constant first line was
 * never perturbed and which never put anything in a comment or in a non-secret value, the two
 * regions `check` does not look at. A generated sweep found **11 files of 45** where every
 * `check` row was green and `lib/auth/secret-file.ts` refuses to start (11b-A1/11b-A2,
 * 2026-09-11). One `bash` per file would be ~300 processes; one process is seconds.
 *
 * Returns, per file, whether `check` failed a row.
 */
const checkFileVerdicts = (files: readonly Uint8Array[]): boolean[] => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-corpus-'));
  try {
    files.forEach((bytes, i) => {
      writeFileSync(join(dir, `f${i}`), bytes);
    });
    const result = sourced(
      [
        'env_file_stat() { printf "%s" "640 0:10001"; }',
        'container_gid() { printf "%s" "10001"; }',
        'dir="$1"; n="$2"; i=0',
        'while (( i < n )); do',
        '  ENV_FILE="$dir/f$i"',
        '  CHECK_FAIL=0; CHECK_UNKNOWN=0',
        '  { check_env_file; check_password_hash; check_session_secret; } >/dev/null 2>&1 || true',
        '  printf "%s\\t%s\\n" "$i" "$CHECK_FAIL"',
        '  i=$(( i + 1 ))',
        'done',
      ],
      {},
      [dir, String(files.length)],
    );
    const lines = result.out.split('\n').filter((l) => /^\d+\t\d+$/.test(l));
    expect(lines, result.out).toHaveLength(files.length);
    return lines.map((line) => Number(line.split('\t')[1]) > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('⚠⚠ check and the SERVER reach the same verdict on the same file, not just on a value', () => {
  /**
   * ⚠ The hole this closes, and it is the same hole one level up from the one the previous
   * loop found. `secret_value_error` and `secretValueError` are held equal message for message
   * — but that is the per-VALUE rule, and the file has a grammar of its own: which lines are
   * skipped, whether a key may appear twice, how long a line may be, what a byte bash cannot
   * hold does. **None of that was compared.** Measured 2026-09-11 over twenty hand-edited
   * files: five disagreed, three of them the dangerous way round —
   *
   * | file | `check` said | the container did |
   * |---|---|---|
   * | a duplicate `SESSION_SECRET`, both spellings valid | every row green | REFUSED TO START |
   * | a duplicate `STANDING` | every row green | REFUSED TO START |
   * | a NUL inside the secret | "64 characters, and printable-ASCII" (bash dropped the NUL) | REFUSED TO START |
   * | an INDENTED comment | line 1 has no '=' | started, correctly |
   * | a whitespace-only line | line 4 has no '=' | started, correctly |
   *
   * A `check` that ticks a file the container will not boot on is the silent failure this
   * whole ruling exists to remove, wearing `check`'s own name; a `check` that fails on a file
   * the container is happy with teaches an operator to ignore the row that matters. Both
   * directions are asserted, over the files an operator's editor actually produces.
   */
  const HASH = realHash();
  const HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const GOOD_FILE = `# /etc/ai-dashboard.env\nPASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX}\nSTANDING=\n`;
  const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

  const FILES: readonly { what: string; bytes: Uint8Array }[] = [
    { what: 'what configure writes', bytes: enc(GOOD_FILE) },
    { what: '⚠ an INDENTED comment — Docker skips it and so must both of ours', bytes: enc(`  # indented\n${GOOD_FILE}`) },
    { what: '⚠ a whitespace-only line', bytes: enc(`${GOOD_FILE}   \t \n`) },
    { what: '⚠ a DUPLICATE SESSION_SECRET, both spellings valid', bytes: enc(`${GOOD_FILE}SESSION_SECRET=${HEX}\n`) },
    { what: '⚠ a DUPLICATE STANDING, which Docker resolves silently with the last', bytes: enc(`${GOOD_FILE}STANDING=gpu_temp\n`) },
    { what: '⚠ a NUL byte inside the secret, which bash cannot hold', bytes: new Uint8Array([...enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX.slice(0, 32)}`), 0, ...enc(`${HEX.slice(33)}\nSTANDING=\n`)]) },
    { what: '⚠ a line past Docker’s own 64 KiB scanner bound', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${'a'.repeat(70000)}\nSTANDING=\n`) },
    { what: 'a 60 KiB line, under the bound', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${'a'.repeat(60000)}\nSTANDING=\n`) },
    { what: 'a quoted secret — O21 itself', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET="${HEX}"\nSTANDING=\n`) },
    { what: 'a trailing space', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX} \nSTANDING=\n`) },
    { what: 'an interior non-breaking space', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX.slice(0, 32)} ${HEX.slice(33)}\nSTANDING=\n`) },
    { what: 'CRLF line endings', bytes: enc(GOOD_FILE.replace(/\n/g, '\r\n')) },
    { what: 'a BOM', bytes: enc(`\ufeff${GOOD_FILE}`) },
    { what: 'a bare line with no =', bytes: enc(`${GOOD_FILE}${HEX}\n`) },
    { what: 'an indented assignment, which carries a key and a value', bytes: enc(`${GOOD_FILE}  EXTRA=1\n`) },
    { what: 'export KEY=, which Docker refuses for the space in the key', bytes: enc(`PASSWORD_HASH=${HASH}\nexport SESSION_SECRET=${HEX}\nSTANDING=\n`) },
    { what: 'an empty PASSWORD_HASH', bytes: enc(`PASSWORD_HASH=\nSESSION_SECRET=${HEX}\nSTANDING=\n`) },
    { what: 'a SESSION_SECRET one character under the floor', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${'a'.repeat(MIN_SESSION_SECRET_CHARS - 1)}\nSTANDING=\n`) },
    { what: 'a SESSION_SECRET of exactly the floor', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${'a'.repeat(MIN_SESSION_SECRET_CHARS)}\nSTANDING=\n`) },
    { what: 'no trailing newline', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX}`) },
    { what: 'an = inside the secret, which Docker keeps and both take', bytes: enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX.slice(0, 32)}=${HEX.slice(33)}\nSTANDING=\n`) },
  ];

  test('⚠⚠ every file gets the same verdict from the row an operator runs and from the server', () => {
    const verdicts = checkFileVerdicts(FILES.map((f) => f.bytes));
    const actual = FILES.map((f, i) => ({
      what: f.what,
      check: verdicts[i] === true ? 'refuses' : 'starts',
      server: parseSecretEnvFile(f.bytes).ok ? 'starts' : 'refuses',
    }));
    expect(actual.map((r) => ({ what: r.what, agree: r.check === r.server }))).toEqual(
      FILES.map((f) => ({ what: f.what, agree: true })),
    );
    // ⚠ Not vacuous in either direction: some of these files must start and some must not.
    expect(actual.filter((r) => r.check === 'starts').length).toBeGreaterThanOrEqual(6);
    expect(actual.filter((r) => r.check === 'refuses').length).toBeGreaterThanOrEqual(10);
  });

  /**
   * ⚠⚠ **GENERATED, not listed — and this is the SECOND time one loop has had to learn it.**
   *
   * The table above is 21 rows, and every one of them varies a **secret line** or appends
   * **one** extra line. The constant first line `# /etc/ai-dashboard.env` is never perturbed;
   * nothing is ever put in a comment, on a blank line, or in a non-secret value. Those are
   * exactly the regions `check` did not look at, and a generated sweep of 45 files found
   * **11** where every `check` row was green and `lib/auth/secret-file.ts` refuses to start
   * (11b-A1, 2026-09-11) — a green pre-restart check, then `exit 1` five times and a unit in
   * `failed` long after whoever ran `check` has gone. Three causes, all of them whole-FILE
   * rules the reader has and the row did not: a `\r` anywhere, a BOM anywhere, and the 64 KiB
   * line bound, which was applied **after** the comment/blank skip so a large comment was
   * never measured.
   *
   * So the corpus is **built**: every payload in every position a payload can occupy.
   */
  const PAYLOADS: readonly { what: string; text: string }[] = [
    { what: 'a CR', text: '\r' },
    { what: 'a BOM', text: '\ufeff' },
    { what: 'a NUL', text: '\u0000' },
    { what: 'a non-breaking space', text: '\u00a0' },
    { what: 'a zero-width space', text: '\u200b' },
    { what: 'a double quote', text: '"' },
    { what: 'a single quote', text: "'" },
    { what: 'a $', text: '$' },
    { what: 'a backtick', text: '`' },
    { what: 'a backslash', text: '\\' },
    { what: 'a #', text: '#' },
    { what: 'a space', text: ' ' },
    { what: 'a tab', text: '\t' },
    { what: 'a DEL', text: '\u007f' },
    { what: 'a C0 control', text: '\u0001' },
    { what: 'an =', text: '=' },
    { what: 'a plain letter (the control)', text: 'x' },
    { what: 'a 70000-byte run', text: 'a'.repeat(70000) },
    { what: 'a 40000-character multibyte run', text: 'é'.repeat(40000) },
  ];

  /**
   * ⚠ Every position EXCEPT the interior of `PASSWORD_HASH`, and the exclusion is not
   * squeamishness: `check_password_hash` judges the **scrypt encoding**, which the server
   * cannot judge at all (§5's 401 is indistinguishable from a wrong password), so `check` is
   * deliberately stricter there and that region is measured by the O20 table instead.
   * Everywhere else the two are supposed to agree about the GRAMMAR.
   */
  const at = (hay: string, needle: string, repl: string): string => {
    const i = hay.indexOf(needle);
    // ⚠ A throw, not an `expect`: this runs while the corpus is being BUILT, which is
    // collection time, where a failed assertion is not attributed to any test.
    if (i < 0) throw new Error(`the corpus generator looked for a substring the good file does not carry`);
    // ⚠ Not `String.replace`: a `$` in the REPLACEMENT is `$&`/`$'`/`` $` `` to it, so three
    // of the payloads above would have been silently rewritten into something else.
    return hay.slice(0, i) + repl + hay.slice(i + needle.length);
  };
  const POSITIONS: readonly { what: string; build: (p: string) => string }[] = [
    { what: 'inside a comment', build: (p) => `# note ${p} here\n${GOOD_FILE}` },
    { what: 'at the END of a comment', build: (p) => `# note${p}\n${GOOD_FILE}` },
    { what: 'inside an INDENTED comment', build: (p) => `   # note ${p}\n${GOOD_FILE}` },
    { what: 'alone on a line', build: (p) => `${GOOD_FILE}${p}\n` },
    { what: 'on an otherwise blank line', build: (p) => `${GOOD_FILE}  ${p}  \n` },
    { what: 'inside SESSION_SECRET', build: (p) => at(GOOD_FILE, HEX, `${HEX.slice(0, 32)}${p}${HEX.slice(32)}`) },
    { what: 'at the END of SESSION_SECRET', build: (p) => at(GOOD_FILE, `${HEX}\n`, `${HEX}${p}\n`) },
    { what: 'inside STANDING', build: (p) => at(GOOD_FILE, 'STANDING=', `STANDING=gpu_temp${p}`) },
    { what: "inside a NON-secret key's value", build: (p) => `${GOOD_FILE}EXTRA=aa${p}bb\n` },
    { what: 'inside a KEY', build: (p) => `${GOOD_FILE}EX${p}TRA=1\n` },
    { what: 'at the HEAD of a line', build: (p) => `${GOOD_FILE}${p}EXTRA=1\n` },
    { what: 'on line 1, before everything', build: (p) => `${p}${GOOD_FILE}` },
    { what: 'on a trailing line with NO newline', build: (p) => `${GOOD_FILE}${p}` },
  ];

  /** The bound, on both sides of it, in each of the three regions that carry a line. */
  const line = (n: number): string => 'a'.repeat(n);
  const STRUCTURAL: readonly { what: string; bytes: Uint8Array }[] = [
    { what: 'an empty file', bytes: enc('') },
    { what: 'comments only', bytes: enc('# nothing here\n# nor here\n') },
    { what: 'a comment line one byte UNDER the bound', bytes: enc(`# ${line(65533)}\n${GOOD_FILE}`) },
    { what: 'a comment line exactly AT the bound', bytes: enc(`# ${line(65534)}\n${GOOD_FILE}`) },
    { what: 'a comment line one byte OVER the bound', bytes: enc(`# ${line(65535)}\n${GOOD_FILE}`) },
    { what: 'a blank line exactly AT the bound', bytes: enc(`${' '.repeat(65536)}\n${GOOD_FILE}`) },
    { what: 'a blank line one byte UNDER the bound', bytes: enc(`${' '.repeat(65535)}\n${GOOD_FILE}`) },
    { what: 'a STANDING line exactly AT the bound', bytes: enc(at(GOOD_FILE, 'STANDING=', `STANDING=${line(65527)}`)) },
    { what: 'a final line AT the bound with no newline', bytes: enc(`${GOOD_FILE}# ${line(65534)}`) },
    { what: 'a duplicate PASSWORD_HASH', bytes: enc(`${GOOD_FILE}PASSWORD_HASH=${HASH}\n`) },
    { what: 'a duplicate comment key spelling', bytes: enc(`${GOOD_FILE}EXTRA=1\nEXTRA=2\n`) },
    { what: 'a key with a leading digit', bytes: enc(`${GOOD_FILE}1BAD=x\n`) },
    { what: 'a key with a space', bytes: enc(`${GOOD_FILE}A B=x\n`) },
    { what: 'an EMPTY key', bytes: enc(`${GOOD_FILE}=x\n`) },
    { what: 'an indented EMPTY key', bytes: enc(`${GOOD_FILE}   =x\n`) },
    { what: 'a lone # line', bytes: enc(`#\n${GOOD_FILE}`) },
    { what: 'a CRLF file', bytes: enc(GOOD_FILE.replace(/\n/g, '\r\n')) },
    { what: 'a lone CR at the very end', bytes: enc(`${GOOD_FILE}\r`) },
    { what: 'SESSION_SECRET absent entirely', bytes: enc(`# c\nPASSWORD_HASH=${HASH}\nSTANDING=\n`) },
    { what: 'PASSWORD_HASH absent entirely', bytes: enc(`# c\nSESSION_SECRET=${HEX}\nSTANDING=\n`) },
    { what: 'both absent, a comment only', bytes: enc('# c\nSTANDING=\n') },
    { what: 'an empty SESSION_SECRET', bytes: enc(at(GOOD_FILE, `SESSION_SECRET=${HEX}`, 'SESSION_SECRET=')) },
    { what: 'export SESSION_SECRET=', bytes: enc(at(GOOD_FILE, 'SESSION_SECRET=', 'export SESSION_SECRET=')) },
    { what: 'a bare line carrying the secret’s tail', bytes: enc(`${GOOD_FILE}${HEX}\n`) },
    { what: 'a wrapped tail that puts a fragment in KEY position', bytes: enc(`${GOOD_FILE}${HEX.slice(0, 20)}=${HEX.slice(20)}\n`) },
    // ⚠ Bytes, not text: an invalid UTF-8 sequence cannot be written as a JavaScript string,
    // and it is the one shape whose whole point is that it never becomes one.
    { what: 'a lone 0x80 in a comment', bytes: new Uint8Array([...enc('# n'), 0x80, ...enc('\n'), ...enc(GOOD_FILE)]) },
    { what: 'a truncated 2-byte sequence in a non-secret value', bytes: new Uint8Array([...enc(`${GOOD_FILE}EXTRA=a`), 0xc3, ...enc('\n')]) },
    { what: 'an overlong encoding of "/" in a comment', bytes: new Uint8Array([...enc('# '), 0xc0, 0xaf, ...enc('\n'), ...enc(GOOD_FILE)]) },
    { what: 'a lone 0xff on its own line', bytes: new Uint8Array([...enc(GOOD_FILE), 0xff, ...enc('\n')]) },
  ];

  const GENERATED: readonly { what: string; bytes: Uint8Array }[] = [
    ...POSITIONS.flatMap((pos) =>
      PAYLOADS.map((p) => ({ what: `${p.what} ${pos.what}`, bytes: enc(pos.build(p.text)) })),
    ),
    ...STRUCTURAL,
  ];

  /**
   * ⚠⚠ **The property, as an IMPLICATION rather than as a list** — the same shape
   * `secret-file.test.ts` states for "stricter than Docker, never looser", and for the same
   * reason: a two-way equality cannot be generated, because `check` is stricter on purpose in
   * places (a quoted `STANDING` is refused by `check` and accepted by the reader, and it must
   * be — systemd's `EnvironmentFile` strips quotes where Docker keeps them). The direction
   * that costs an operator anything is the other one:
   *
   * > **if every `check` row is green, the container starts.**
   *
   * A violation is a file an operator is told is fine and a unit that then sits in `failed`.
   */
  test('⚠⚠ no generated file gets a green check and a container that refuses to start', () => {
    const verdicts = checkFileVerdicts(GENERATED.map((f) => f.bytes));
    const greenButRefused = GENERATED.filter(
      (f, i) => verdicts[i] === false && !parseSecretEnvFile(f.bytes).ok,
    ).map((f) => f.what);
    expect(greenButRefused).toEqual([]);

    // ⚠ Not vacuous, in three ways: the sweep has to be large, it has to contain files that
    // pass, and it has to contain files the server refuses — otherwise "no green-and-refused"
    // is satisfied by a corpus nothing could have failed.
    expect(GENERATED.length).toBeGreaterThan(240);
    expect(verdicts.filter((v) => v === false).length).toBeGreaterThan(30);
    expect(GENERATED.filter((f) => !parseSecretEnvFile(f.bytes).ok).length).toBeGreaterThan(150);
    // ⚠ An explicit timeout, because this is the one test in the file that is allowed to be
    // slow: ~15 s for 276 files, each of which runs three real `check` rows in bash. Vitest's
    // default is 5 s, and a corpus that grows past it would fail as a TIMEOUT — a red test
    // whose message says nothing about the property, which is the worst kind of red.
  }, 180_000);

  test('⚠ the 64 KiB line bound is ONE number, spelled in both places and asserted equal', () => {
    const fromScript = /^MAX_ENV_LINE_BYTES=(\d+)$/m.exec(DASHBOARD_SH);
    expect(fromScript, 'MAX_ENV_LINE_BYTES is not defined in dashboard.sh').not.toBeNull();
    expect(Number((fromScript as RegExpExecArray)[1])).toBe(MAX_LINE_BYTES);
    // …and it is the bound Docker's own package comment names, not a number we picked.
    expect(MAX_LINE_BYTES).toBe(64 * 1024);
  });

  test('⚠ a bad KEY is printed only when printing it cannot be printing a credential', () => {
    // ⚠ 11-A6's rule applied to the other half of the line. An editor's hard wrap can leave a
    // fragment of a VALUE in key position — the value only has to contain one `=` for that —
    // and this row printed `'${key}'` whatever it was. `namedKey` in lib/auth/secret-file.ts
    // bounds it at 32 printable-ASCII characters; so does this now, and the two agree.
    const short = checkFileRows(enc(`${GOOD_FILE}1BAD=x\n`));
    expect(short.out).toContain("'1BAD' is not a usable environment-variable name");

    const long = `${'Zq'.repeat(79)}-x`; // 160 characters, and not a usable name
    const wrapped = checkFileRows(enc(`${GOOD_FILE}${long}=tail\n`));
    expect(wrapped.out).toContain('160-character key (not printed)');
    expect(wrapped.out).not.toContain(long);
    expect(wrapped.out).not.toContain(long.slice(0, 20));

    // …and a key that is short but not printable is not printed either.
    const invisible = checkFileRows(enc(`${GOOD_FILE}A B=x\n`));
    expect(invisible.out).toContain('(not printed)');
  });

  /**
   * ⚠⚠ **Both sides of the bound, and the bound moved on 2026-09-11 (11b-A12).** It used to be
   * 32 — which *is* `MIN_SESSION_SECRET_CHARS`, so a `SESSION_SECRET` written at exactly the
   * minimum length could reach the terminal **whole** from key position, under a rule whose own
   * header says *"not the value, not the line, not a prefix of either, and not a character of
   * either"*. It is now one character under the floor, derived from it in both spellings rather
   * than retyped, so a printed key can never be a whole secret of this build's.
   */
  test('⚠⚠ a printed key is always SHORTER than the shortest secret, in both spellings', () => {
    // ⚠ A trailing `-` makes the key unusable without changing its length, so both cases reach
    // the same row for the same reason and only the LENGTH is under test.
    const badKey = (n: number): string => `K${'a'.repeat(n - 2)}-`;
    const under = badKey(MIN_SESSION_SECRET_CHARS - 1);
    const atFloor = badKey(MIN_SESSION_SECRET_CHARS);
    expect(under).toHaveLength(MIN_SESSION_SECRET_CHARS - 1);
    expect(atFloor).toHaveLength(MIN_SESSION_SECRET_CHARS);

    const bashUnder = checkFileRows(enc(`${GOOD_FILE}${under}=x\n`));
    const bashAt = checkFileRows(enc(`${GOOD_FILE}${atFloor}=x\n`));
    expect(bashUnder.out).toContain(under);
    expect(bashAt.out).not.toContain(atFloor);
    expect(bashAt.out).toContain(`${MIN_SESSION_SECRET_CHARS}-character key (not printed)`);

    // …and the reader says the same about the same two keys, which is what makes it one rule.
    const report = (key: string): string => {
      const verdict = parseSecretEnvFile(enc(`${GOOD_FILE}${key}=x\n`));
      expect(verdict.ok).toBe(false);
      return verdict.ok ? '' : refusalReport('/etc/ai-dashboard.env', verdict.refusals);
    };
    expect(report(under)).toContain(under);
    expect(report(atFloor)).not.toContain(atFloor);
    expect(report(atFloor)).toContain(`${MIN_SESSION_SECRET_CHARS}-character key (not printed)`);
  });

  /**
   * ⚠⚠ 11b-A5 and 11b-A11, in the one function that separates "absent" from "unreadable".
   *
   * `env_readable` was `[[ -r "$ENV_FILE" ]]`, which is **true for a readable directory** — so
   * every row that asks it first went on to read a path it could not read, and the row that is
   * supposed to say *what is wrong with the file* said the file was fine. And the message it
   * printed named `root:root 0600` as *"a correct deployment"*, which since the ruling of
   * 2026-09-11 is the ONE mode that produces the silent 401 the ruling exists to remove.
   *
   * ⚠ Driven against the REAL `env_readable`, not the guard table's stub of it — a stub of the
   * function under test certifies nothing about it.
   */
  test('⚠⚠ a path that is not a regular file is its own diagnosis, not "it needs root"', () => {
    const rowsOn = (envFile: string): string =>
      sourced(
        ['CHECK_FAIL=0', 'CHECK_UNKNOWN=0', 'check_password_hash || true',
         'printf "\\nFAILED=%s UNKNOWN=%s\\n" "$CHECK_FAIL" "$CHECK_UNKNOWN"'],
        { ENV_FILE: envFile },
      ).out;

    const onDirectory = rowsOn(tmpdir());
    expect(onDirectory).toContain('is not a regular file');
    expect(onDirectory).toContain("NOT 'it is absent'");
    expect(onDirectory).toContain('FAILED=0 UNKNOWN=1');

    // …and the other cause still says the other thing, with the mode the ruling actually wants.
    const onUnreadable = rowsOn(join(tmpdir(), 'no-such-dashboard-dir', 'ai-dashboard.env'));
    expect(onUnreadable).toContain('needs root');
    expect(onUnreadable).toContain("root:<the container's gid> 0640");
    expect(onUnreadable).not.toContain('root:root 0600');
  });

  test('⚠ the NUL row says WHY no other row could have seen it', () => {
    const withNul = new Uint8Array([...enc(`PASSWORD_HASH=${HASH}\nSESSION_SECRET=${HEX}`), 0, ...enc('\nSTANDING=\n')]);
    const { out } = checkFileRows(withNul);
    expect(out).toContain('contains a NUL byte');
    expect(out).toContain('bash drops it silently');
    // And the secret is not in the message — the value is what makes the line malformed.
    expect(out).not.toContain(HEX);
  });
});

// ---------------------------------------------------------------------------------------
// D8 — the STANDING vocabulary
// ---------------------------------------------------------------------------------------

describe('⚠ D8 — dashboard.sh judges a STANDING entry exactly as standingIdsFrom does', () => {
  /** §6.4's five documented outcomes, plus every kind's own bare form. */
  const entries: readonly string[] = [
    'gpu_temp',
    'gpu_temp:0',
    'gpu_fan_speed',
    'ufw_enforcing',
    'ufw_enforcing:yes',
    'gpu_temp:',
    'unit:',
    'unit',
    'unit:gpu-fan-control.service',
    'disk_free:home',
    'fan_stopped',
    'fan5_absolute',
    'fan5_absolute:5',
    'health:0',
    'link',
    'cpu_temp',
    'ram',
    'GPU_TEMP',
    ' gpu_temp ',
    'gpu_temp:0:1',
    // ⚠ A backslash, because the lookup goes through `awk`. `awk -v k=VALUE` processes
    // ESCAPE SEQUENCES in VALUE: `gpu_te\\mp` reached the table as `gpu_temp` and was
    // ACCEPTED, while `standingIdsFrom` reports it unknown — this judge LOOSER than the
    // browser, which is the one direction D8 cannot afford. Fixed by reading it out of
    // `ENVIRON` instead; `11-S7` puts the `-v` back.
    'gpu_te\\mp',
    'gpu_temp\\',
  ];

  test('⚠ the bash judge and standingIdsFrom disagree about no entry at all', () => {
    const bash = validate('standing_entry_error', entries);
    const node = entries.map((entry) => standingIdsFrom([entry]).unknown.length === 0);

    const disagreements = entries
      .map((entry, i) => ({ entry, bashAccepts: bash[i] === null, nodeAccepts: node[i] }))
      .filter((row) => row.bashAccepts !== row.nodeAccepts);

    expect(disagreements).toEqual([]);
    expect(node.filter(Boolean).length).toBeGreaterThan(8);
    expect(node.filter((v) => !v).length).toBeGreaterThan(5);
  });

  /**
   * ⚠ The one KNOWN divergence, pinned rather than papered over. JavaScript's `.trim()`
   * strips U+00A0; bash's `[[:space:]]` does not. The bash side is therefore STRICTER, which
   * is a false alarm an operator can see rather than a silent pass — and a check that had
   * quietly become the looser of the two would be worthless for exactly the reason D8 is on
   * the silent-failure list.
   */
  test('⚠ a non-breaking space makes bash stricter than the browser, never looser', () => {
    const padded = 'gpu_temp\u00a0';
    expect(standingIdsFrom([padded]).unknown).toEqual([]);
    expect(validate('standing_entry_error', [padded])[0]).not.toBeNull();
  });

  /**
   * ⚠ THE DIVERGENCE THAT WAS STATED ONE-DIRECTIONAL AND WAS NOT.
   *
   * The test above is named *"…stricter than the browser, never looser"* and, until
   * 2026-09-10, it exercised only the BARE-KIND shape — the safe half of its own name. A
   * differential fuzz found **24 inputs where this judge was LOOSER**: with the extra
   * whitespace AFTER the colon, bash saw a non-empty subject and ACCEPTED while
   * `standingIdsFrom` trimmed it to `''` and reported the entry unknown. `check` then
   * printed `✓ all N STANDING entries match a §6.4 condition kind or id` for an entry that
   * suppresses nothing — D8's entire failure mode, certified green by the only thing on the
   * box that can see it.
   *
   * The boundary is exactly `String.prototype.trim`'s set: these twelve, and NOT U+200B,
   * which JavaScript does not trim either (so the two agree about it by another route).
   */
  const JS_ONLY_SPACES = [
    '\u00a0', // NO-BREAK SPACE — what a paste from a rendered document carries
    '\u1680',
    '\u2000',
    '\u2003',
    '\u2007',
    '\u200a',
    '\u2028', // LINE SEPARATOR
    '\u2029', // PARAGRAPH SEPARATOR
    '\u202f',
    '\u205f',
    '\u3000', // IDEOGRAPHIC SPACE
    '\ufeff', // the BOM
  ] as const;

  test('⚠ the twelve spaces JavaScript trims and bash cannot never make this judge LOOSER', () => {
    // Every character in both positions the fuzz found, plus the one that is not in the set.
    const entries = [
      ...JS_ONLY_SPACES.flatMap((c) => [
        `gpu_temp${c}`, // the bare-kind shape: JS accepts, bash must not silently accept
        `unit:${c}`, // ⚠ the shape that was LOOSER: JS -> empty subject -> unknown
        `gpu_temp:${c}`, // the same, on a kind that takes a subject
        `${c}gpu_temp`,
      ]),
      'gpu_temp\u200b', // NOT in JavaScript's trim set: both sides report it unknown
      'gpu_temp',
      'unit:llama-server@0.service',
    ];
    const bash = validate('standing_entry_error', entries);
    const node = entries.map((e) => standingIdsFrom([e]).unknown.length === 0);

    // The rule, stated as a comparison rather than as prose: wherever the two differ, it is
    // the browser that accepts and this that refuses. Never the other way round.
    const looser = entries
      .map((entry, i) => ({ entry: JSON.stringify(entry), bashAccepts: bash[i] === null, nodeAccepts: node[i] }))
      .filter((row) => row.bashAccepts && !row.nodeAccepts);
    expect(looser).toEqual([]);
    // …and the table is not vacuous: the after-colon shapes really are ones the browser calls
    // unknown, so a judge that accepted them would appear in `looser`.
    expect(node.filter((v) => !v).length).toBeGreaterThan(24);
    // The refusal names the cause rather than saying "matches no condition kind", because
    // the character is invisible in the file it came from.
    expect(validate('standing_entry_error', ['unit:\u00a0'])[0]).toContain('non-ASCII whitespace');
  });

  test('⚠ the vocabulary is read from lib/conditions.ts, not retyped in the script', () => {
    // The kinds must not appear as a hand-written list anywhere in the script; the only
    // mention of any of them is inside a comment giving §6.4's five worked examples.
    expect(DASHBOARD_SH).toContain('CONDITION_KIND_RULES');
    expect(DASHBOARD_SH).toContain("s/^  \\([a-z0-9_]*\\): { singleton:");
    for (const kind of ['dkms_for_running_kernel', 'gpu_throttle', 'fan5_engaged']) {
      expect(DASHBOARD_SH).not.toContain(kind);
    }
  });
});

// ---------------------------------------------------------------------------------------
// `check` — the rows, not just the validators they call
// ---------------------------------------------------------------------------------------

/**
 * ⚠ Everything above measures a VALIDATOR. Nothing above measures the row that is supposed
 * to call it, and a row is exactly where the wiring can come undone: `check` is the only
 * place any of O20, O21, O22 or D8 can be noticed on the box, so a row that stopped asking
 * is the same silence, one level up. Five mutations (`11-R1`…`11-R5`) are the proof these
 * bite; before they existed, each of those five breaks left all 24 tests green.
 */
describe('⚠ check asks its validators, and fails the row when they refuse', () => {
  const HEX64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  test('⚠ the O21 row FAILS on the quoted secret readAuthConfig cannot see, and on padding', () => {
    const quoted = checkRow('check_session_secret', `SESSION_SECRET="${HEX64}"\n`);
    expect(quoted.failed).toBeGreaterThan(0);
    expect(quoted.out).toContain('does not strip quotes');

    const padded = checkRow('check_session_secret', `SESSION_SECRET=${HEX64} \n`);
    expect(padded.failed).toBeGreaterThan(0);
    expect(padded.out).toContain('trailing whitespace');

    const short = checkRow('check_session_secret', 'SESSION_SECRET=tooshort\n');
    expect(short.failed).toBeGreaterThan(0);

    // ⚠ Since SPEC §5.1's ruling of 2026-09-11 the row asks `secret_value_error`, which is
    // the SERVER's own rule. A value that passes Docker's grammar and not the server's — an
    // interior non-breaking space — is now a FAILING row rather than a container that exits
    // at startup after the operator has gone.
    const nbsp = checkRow('check_session_secret', `SESSION_SECRET=${HEX64.slice(0, 32)}\u00a0${HEX64.slice(33)}\n`);
    expect(nbsp.failed).toBeGreaterThan(0);
    expect(nbsp.out).toContain('outside printable ASCII');

    const clean = checkRow('check_session_secret', `SESSION_SECRET=${HEX64}\n`);
    expect(clean.failed).toBe(0);
    expect(clean.out).toContain('64 characters, and printable-ASCII, unquoted and single-line');
  });

  // ⚠ No escaped apostrophe in a ⚠ name: the ledger reads the name out of the SOURCE and
  // matches it against vitest's FAIL line, where `\'` has become `'`. The mark would score
  // uncovered for a reason that has nothing to do with any mutation.
  test('⚠ the O20 row FAILS on an argon2id hash and passes what the producer wrote', () => {
    const argon = checkRow(
      'check_password_hash',
      `PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=4$${b64(SALT_BYTES)}$${b64(KEY_BYTES)}\n`,
    );
    expect(argon.failed).toBeGreaterThan(0);
    expect(argon.out).toContain('argon2id');

    // ⚠ The row asks TWO validators since 2026-09-11 and they catch different things: a
    // QUOTED hash is a perfectly good scrypt encoding to `scrypt_hash_error` and a file the
    // server refuses to start on. O20 wearing O21's clothes.
    const quoted = checkRow('check_password_hash', `PASSWORD_HASH="${realHash()}"\n`);
    expect(quoted.failed).toBeGreaterThan(0);
    expect(quoted.out).toContain('REFUSES this at startup');

    // ⚠ A hash the server cannot PARSE but that the value rule has no objection to — no
    // quote, no `$`, nothing outside printable ASCII. It is the only case that reaches the
    // second `scrypt_hash_error` call, and until it existed `11-R2` (that call replaced by
    // `true`) DID NOT BITE: the argon2id case above was answered by the FIRST call, which
    // this loop added for the message's sake. Measured, not reasoned — the harness said so.
    const malformed = checkRow('check_password_hash', 'PASSWORD_HASH=scrypt.15.8.1.tooshort.tooshort\n');
    expect(malformed.failed).toBeGreaterThan(0);
    expect(malformed.out).toContain('parseScryptHash returns null');

    const good = checkRow('check_password_hash', `PASSWORD_HASH=${realHash()}\n`);
    expect(good.failed).toBe(0);
    expect(good.out).toContain('parses as scrypt');
    // ⚠ And it says what it cannot do, because "check validates the password" is the
    // natural wrong assumption (INSTALL-SPEC §9).
    expect(good.out).toContain('can NEVER confirm');
  });

  test('⚠ the D8 row FAILS on a subject over a singleton kind, and on a missing key', () => {
    const typo = checkRow('check_standing', 'STANDING=gpu_temp,ufw_enforcing:yes\n');
    expect(typo.failed).toBeGreaterThan(0);
    expect(typo.out).toContain('singleton');

    const absent = checkRow('check_standing', `SESSION_SECRET=${HEX64}\n`);
    expect(absent.failed).toBeGreaterThan(0);
    expect(absent.out).toContain('STANDING is absent');

    const empty = checkRow('check_standing', 'STANDING=\n');
    expect(empty.failed).toBe(0);

    const good = checkRow('check_standing', 'STANDING=gpu_temp, unit:llama-server@0.service\n');
    expect(good.failed).toBe(0);
    expect(good.out).toContain('all 2 STANDING entries');
    // A change here needs a restart, and the row says so rather than leaving the natural
    // assumption that the next poll picks it up (§4, corrected 2026-09-07).
    expect(good.out).toContain('restart');
  });

  test('⚠ the env-file row FAILS on a line with no =, which Docker takes from the host', () => {
    // ⚠ Not a syntax error to Docker: a bare `PASSWORD_HASH` means "pass the HOST's value
    // of that variable through", which is almost always empty — every login denied, with
    // nothing logged. INSTALL-SPEC does not mention it (S6).
    const bare = checkRow('check_env_file', `PASSWORD_HASH\nSESSION_SECRET=${HEX64}\n`);
    expect(bare.out).toContain("take this from the host environment");
    expect(bare.out).not.toContain('every line is a single-line');

    const quoted = checkRow('check_env_file', `SESSION_SECRET="${HEX64}"\n`);
    expect(quoted.out).toContain('does not strip quotes');

    const clean = checkRow('check_env_file', `# a comment\n\nSESSION_SECRET=${HEX64}\n`);
    expect(clean.out).toContain('every line is a single-line, unquoted KEY=VALUE');
  });

  test('⚠ configure cannot write a value Docker would keep verbatim — env_set refuses first', () => {
    // O21's other half. `check` catches a file someone else wrote; this is the guarantee
    // that the script itself can never produce one.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      const env = { ENV_FILE: file, BACKUP_DIR: dir };
      // The real path: it dies before the file is created, not after.
      const refused = sourced(['env_set SESSION_SECRET "$1"'], env, [`"${HEX64}"`]);
      expect(refused.status).not.toBe(0);
      expect(refused.out).toContain('refusing to write SESSION_SECRET');
      expect(existsSync(file)).toBe(false);

      // ⚠ And the refusal comes BEFORE the --dry-run return, so a dry run cannot print
      // `would write` for a value the real run would refuse — a review surface promising a
      // write that cannot happen is the same defect as a tick over one that did not.
      const dryRefused = sourced(['DRY=1', 'env_set SESSION_SECRET "$1"'], env, [`"${HEX64}"`]);
      expect(dryRefused.status).not.toBe(0);
      expect(dryRefused.out).not.toContain('would write');

      const dryAccepted = sourced(['DRY=1', 'env_set SESSION_SECRET "$1"'], env, [HEX64]);
      expect(dryAccepted.status).toBe(0);
      expect(dryAccepted.out).toContain('would write SESSION_SECRET=<64 characters, not printed>');
      // ⚠ The length, never the value: this file's whole point is that a credential does
      // not reach a scrollback.
      expect(dryAccepted.out).not.toContain(HEX64);
      expect(existsSync(file)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ O22 counts a container from ANOTHER tag of this image as a second instance', () => {
    // ⚠ `--filter ancestor=ai-dashboard:latest` resolves to ONE image id, so an operator
    // comparing two builds — `docker run ai-dashboard:notag-20260901` — has a second
    // telemetry cache, a second revocation set and a second rate limiter that the ancestor
    // filter cannot see. On a port of its own, the listener count on 8090 cannot see it
    // either. There is no Docker on this Mac, so the matcher is fed `docker ps`'s own
    // `{{.Names}} {{.Image}}` shape directly.
    const ps = [
      'ai-dashboard ai-dashboard:latest',
      'ai-dashboard-old ai-dashboard:notag-20260901',
      'by-implicit-latest ai-dashboard',
      'someone-elses ghcr.io/other/ai-dashboard:latest',
      'unrelated nginx:1.27',
      '',
    ].join('\n');
    const found = sourced([`printf '%s' "$1" | other_app_containers`], {}, [ps]);
    expect(found.status).toBe(0);
    expect(found.out.split('\n').filter((l) => l !== '')).toEqual([
      'ai-dashboard-old',
      'by-implicit-latest',
    ]);
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ The two GENERAL mechanisms — 2026-09-10
// ---------------------------------------------------------------------------------------
//
// The adversarial applied 63 one-line edits to these four files and **49 kept the whole
// suite green**, including every `check` row the test phase had not wired, `check_one_process`
// deleted from `cmd_check` outright, `cmd_check` made unable to return 1, and all seven
// preflight refusals. Two structural causes produce nearly all of it:
//
//   1. **nothing asserted WHICH functions `cmd_check` calls**, and
//   2. **nothing asserted THAT A GUARD REFUSES** — only that a validator's verdict was right,
//      or (for a preflight) that *some* refusal was printed.
//
// The two blocks below are the answer to those two sentences, and they are deliberately
// written as TABLES rather than as one test per case: a row added to `check`, or a refusal
// added to `preflight`, has to be entered here or the mechanism itself goes red.

/** Every function `cmd_check` is supposed to call, in the order it calls them. */
const CHECK_ROWS = [
  'check_env_file',
  'check_password_hash',
  'check_session_secret',
  'check_standing',
  'check_hasher',
  'check_unit',
  'check_one_process',
  'check_container',
  'check_drift',
  'check_firewall',
  'check_gate',
  'check_neighbours',
] as const;

/**
 * Run `cmd_check` with every row REPLACED by a stub, and return its exit status.
 *
 * ⚠ This is the mechanism. With all eleven rows stubbed silent the run must be 0; with
 * exactly one of them raising `row_fail` it must be 1 — and it can only be 1 if `cmd_check`
 * actually CALLS that function. So one table proves the call graph and the exit-code
 * contract at the same time, for every row, from one place.
 */
const cmdCheckWithRows = (overrides: Readonly<Record<string, string>> = {}): number => {
  const body = [
    ...CHECK_ROWS.map((fn) => `${fn}() { ${overrides[fn] ?? ':'}; }`),
    'browser_note() { :; }',
    'rc=0',
    'cmd_check >/dev/null 2>&1 || rc=$?',
    'printf "STATUS=%s\\n" "$rc"',
  ];
  const result = sourced(body);
  const matched = /STATUS=(\d+)/.exec(result.out);
  expect(matched, result.out).not.toBeNull();
  return Number((matched as RegExpExecArray)[1]);
};

describe('⚠⚠ cmd_check calls every row it is supposed to, and a failed row reaches the exit code', () => {
  test('⚠ the body of cmd_check calls exactly the twelve rows, in order and with nothing else', () => {
    // ⚠ A SOURCE-TEXT half as well as the behavioural one below, because they are blind to
    // different things. `check_one_process` was replaceable by `  true` — the whole O22
    // section deleted from `check` — with 31 tests green. Reading the body means a row
    // cannot be dropped, reordered or renamed without this list being edited on purpose,
    // which is the only moment anyone will ask whether the new row has a refusal test.
    const called = functionBody('cmd_check')
      .split('\n')
      .map((line) => /^ {2}(check_[a-z_]+)(?: \|\| true)?$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]);
    expect(called).toEqual([...CHECK_ROWS]);
  });

  test('⚠ with every row silent cmd_check is 0, and each row on its own can make it 1', () => {
    // The control first: if this were not 0, every row below would be "passing" for a
    // reason that has nothing to do with the row.
    expect(cmdCheckWithRows()).toBe(0);

    const reachable = CHECK_ROWS.map((fn) => ({
      row: fn,
      status: cmdCheckWithRows({ [fn]: 'row_fail "the mechanism"' }),
    }));
    expect(reachable).toEqual(CHECK_ROWS.map((row) => ({ row, status: 1 })));
  });

  test('⚠ an unevaluated row is exit 2 and never exit 0, and a failure outranks it', () => {
    // §9's third state: "a row nobody could evaluate is not a row that passed". The script's
    // own header promises exit 2 means *re-run it with sudo*.
    expect(cmdCheckWithRows({ check_unit: 'row_unknown "no systemd here"' })).toBe(2);
    expect(
      cmdCheckWithRows({
        check_unit: 'row_unknown "no systemd here"',
        check_gate: 'row_fail "the gate is open"',
      }),
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ Mechanism 2 — every guard REFUSES on its own bad input, and PERMITS on good
// ---------------------------------------------------------------------------------------

/** Stubs for the things a `check` row asks the box about, none of which exists on this Mac. */
const BOX_STUBS = [
  'emit() { if [[ -n "$1" ]]; then printf "%s\\n" "$1"; fi; }',
  'D_NAMED="${D_NAMED-}"; D_BYID="${D_BYID-}"; D_PS="${D_PS-}"; D_TOP="${D_TOP-}"',
  'D_RUNNING="${D_RUNNING-}"; D_LATEST="${D_LATEST-}"; D_DEVREQ="${D_DEVREQ-}"',
  // ⚠ 11-Q3's rows. Each is a DIFFERENT `docker inspect --format`, and the patterns are
  // ordered most-specific-first: `{{.HostConfig.RestartPolicy.Name}}` also contains `.Name`,
  // so a `inspect*.Name*` arm placed above it would answer for the wrong question — which is
  // a stub bug that would have made the restart-policy row untestable while it looked green.
  'D_NAME="${D_NAME-/ai-dashboard}"; D_NET="${D_NET-host}"; D_RESTART="${D_RESTART-no}"',
  'D_PORTS="${D_PORTS-}"; D_BINDS="${D_BINDS-}"; D_ENV="${D_ENV-}"; D_IMAGE_ENV="${D_IMAGE_ENV-}"',
  // ⚠ 11b-A8's rows — the eight flags the first six comparisons left out. `--read-only` is
  // a §2.5 hard requirement one of the test phase's nine stranded mutations had deleted
  // from the unit, and `--user` is the number the credentials file's mode row hangs on.
  'D_RO="${D_RO-true}"; D_USER="${D_USER-10001:10001}"; D_PID="${D_PID-host}"',
  'D_TMPFS="${D_TMPFS-/tmp}"; D_AUTORM="${D_AUTORM-true}"; D_LOGDRV="${D_LOGDRV-json-file}"',
  'have() { case "$1" in docker|ss|curl|ufw|python3) return 0 ;; *) return 1 ;; esac; }',
  'docker_ok() { return 0; }',
  'docker() {',
  '  case "$*" in',
  '    ps*name=*)               emit "$D_NAMED" ;;',
  '    ps*ancestor=*)           emit "$D_BYID" ;;',
  '    "ps --format"*)          emit "$D_PS" ;;',
  '    top*)                    emit "$D_TOP" ;;',
  // ⚠ Each of these can FAIL, deliberately. Until 2026-09-11 only the Env one could, on the
  // reasoning that "every other row compares two values, so a failed read makes them differ".
  // MEASURED false for two of them: the unit carries no --restart and publishes no port, so
  // those expectations are the EMPTY STRING and an unreadable `docker inspect` produced the
  // empty string too — "" against "" printed a TICK. A stub that cannot fail is a stub that
  // certifies nothing about the row that reads it.
  '    "image inspect"*Config.Env*) [[ "${IMAGE_ENV_READ-ok}" == ok ]] || return 1; emit "$D_IMAGE_ENV" ;;',
  '    "image inspect"*)        emit "$D_LATEST" ;;',
  '    inspect*DeviceRequests*) emit "$D_DEVREQ" ;;',
  '    inspect*RestartPolicy*) [[ "${RESTART_READ-ok}" == ok ]] || return 1;  emit "$D_RESTART" ;;',
  '    inspect*NetworkMode*) [[ "${NET_READ-ok}" == ok ]] || return 1;    emit "$D_NET" ;;',
  '    inspect*PortBindings*) [[ "${PORTS_READ-ok}" == ok ]] || return 1;   emit "$D_PORTS" ;;',
  '    inspect*Binds*) [[ "${BINDS_READ-ok}" == ok ]] || return 1;          emit "$D_BINDS" ;;',
  // ⚠ This one can FAIL, deliberately: absence is the leak row's pass condition, so a
  // `docker inspect` nobody could read must not look like a container with clean Env.
  '    inspect*Config.Env*)     [[ "${ENV_READ-ok}" == ok ]] || return 1; emit "$D_ENV" ;;',
  '    inspect*ReadonlyRootfs*) [[ "${RO_READ-ok}" == ok ]] || return 1;     emit "$D_RO" ;;',
  '    inspect*Config.User*)    [[ "${USER_READ-ok}" == ok ]] || return 1;   emit "$D_USER" ;;',
  '    inspect*PidMode*)        [[ "${PID_READ-ok}" == ok ]] || return 1;    emit "$D_PID" ;;',
  '    inspect*Tmpfs*)          [[ "${TMPFS_READ-ok}" == ok ]] || return 1;  emit "$D_TMPFS" ;;',
  '    inspect*AutoRemove*)     [[ "${AUTORM_READ-ok}" == ok ]] || return 1; emit "$D_AUTORM" ;;',
  '    inspect*LogConfig.Type*) [[ "${LOGDRV_READ-ok}" == ok ]] || return 1; emit "$D_LOGDRV" ;;',
  '    "inspect ai-dashboard --format {{.Name}}") [[ "${NAME_READ-ok}" == ok ]] || return 1; emit "$D_NAME" ;;',
  '    inspect*)                emit "$D_RUNNING" ;;',
  '    *) return 1 ;;',
  '  esac',
  '}',
  'ss() { emit "${LISTENERS-}"; }',
  'curl() { printf "%s" "${HTTP_CODE-000}"; }',
  'gpu_runtime_available() { [[ "${GPU_PROBE-}" == ok ]]; }',
  'start_limit_value() { printf "%s" "${START_LIMIT-5min}"; }',
  'unit_active_state() { printf "%s" "${ACTIVE_STATE-active}"; }',
  'unit_file_state() { printf "%s" "${FILE_STATE-enabled}"; }',
  'report_ordering_cycles() { return "${CYCLE_RC-0}"; }',
  'ufw_enforcing() { [[ "${UFW_ON-yes}" == yes ]]; }',
  'ufw_rule_for_port() { if [[ "$1" == 22 ]]; then emit "${R22-22/tcp ALLOW x}"; else emit "${R8090-8090/tcp ALLOW x}"; fi; }',
  // ⚠ 0640 root:<the container's gid>, since SPEC §5.1's ruling of 2026-09-11 mounts the file
  // into a container that runs as `--user 10001:10001` — `root:root 0600` is unreadable to
  // it, and the dashboard would deny every login with nothing logged. NUMERIC ids, because no
  // account on the box has gid 10001 and `%G` would answer from /etc/group.
  'env_file_stat() { printf "%s" "${FILE_STAT-640 0:10001}"; }',
  'env_readable() { [[ "${READABLE-yes}" == yes ]]; }',
] as const;

interface RowVerdict {
  readonly out: string;
  readonly failed: number;
  readonly unknown: number;
}

/**
 * Run ONE `check` row against a stubbed box, and report how many rows it failed and how
 * many it could not evaluate.
 *
 * ⚠ `checkRow` above does the same for the four rows that read only the env file. This is
 * the same idea for the rows that read docker, systemd, ufw and the network — the rows that
 * had NO measurement at all, and each of which could be disconnected with one line.
 */
const guardRow = (
  row: string,
  env: Readonly<Record<string, string>> = {},
  envFileBody = '',
): RowVerdict => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
  try {
    const file = join(dir, 'ai-dashboard.env');
    writeFileSync(file, envFileBody);
    // The unit file has to EXIST for `check_unit` to get past its first row; the case that
    // wants it missing points UNIT_PATH somewhere else.
    writeFileSync(join(dir, 'unit.service'), '[Unit]\n');
    const result = sourced(
      [
        ...BOX_STUBS,
        'CHECK_FAIL=0',
        'CHECK_UNKNOWN=0',
        '"$1" || true',
        'printf "\\nFAILED=%s UNKNOWN=%s\\n" "$CHECK_FAIL" "$CHECK_UNKNOWN"',
      ],
      { ENV_FILE: file, UNIT_PATH: join(dir, 'unit.service'), ...env },
      [row],
    );
    const matched = /FAILED=(\d+) UNKNOWN=(\d+)/.exec(result.out);
    expect(matched, result.out).not.toBeNull();
    const [, failed, unknown] = matched as RegExpExecArray;
    return { out: result.out, failed: Number(failed), unknown: Number(unknown) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const HEX64_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * The repository's own unit, pointed at as if it were the installed one.
 *
 * ⚠ `check_drift` derives every expectation from `ExecStart=` in `$UNIT_PATH` — the INSTALLED
 * unit, which is what systemd actually runs — so these cases must drive it against a real
 * one. Using this repo's copy also means a flag added to the unit and not to the container is
 * a row that fails here, rather than a list in this file that someone forgot to update.
 */
const REAL_UNIT = join(projectRoot, 'systemd/ai-dashboard.service');

/**
 * The repository's unit with ONE flag changed in its `docker run` line — which is what a
 * hand-edited installed unit, or a checkout at a different commit from the one that installed
 * it, actually looks like (11b-A6). `--user` is the flag deliberately: it is the number the
 * credentials file's mode row derives its expectation from.
 */
const DRIFTED_UNIT = ((): string => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-unit-'));
  const path = join(dir, 'ai-dashboard.service');
  writeFileSync(path, read('systemd/ai-dashboard.service').replace('--user 10001:10001', '--user 10002:10002'));
  return path;
})();

/**
 * The nine `-v` binds the unit asks for, as `docker inspect .HostConfig.Binds` returns them.
 *
 * ⚠ Deliberately in a DIFFERENT order from the unit, because `check_drift` sorts both sides:
 * a comparison that depended on docker preserving the order of the flags would be a row that
 * fails on a correct box for a reason nobody could act on.
 */
const HEALTHY_BINDS = [
  '/sys:/sys:ro',
  '/etc/ai-dashboard.env:/etc/ai-dashboard.env:ro',
  '/:/host/root:ro',
  '/home:/host/home:ro',
  '/run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro',
  '/etc/llama-server:/etc/llama-server:ro',
  '/etc/ufw/ufw.conf:/etc/ufw/ufw.conf:ro',
  '/lib/modules:/lib/modules:ro',
  '/etc/hostname:/etc/hostname:ro',
].join('\n');

/** The image's own `ENV`, which the container carries whatever the unit passes. */
const IMAGE_ENV = 'PATH=/usr/local/bin\nNODE_ENV=production\nHOSTNAME=0.0.0.0\nPORT=8090';

/** A box on which every row this table drives is healthy. */
const HEALTHY = {
  D_NAMED: 'abc123',
  D_BYID: '',
  D_PS: 'ai-dashboard ai-dashboard:latest',
  D_TOP: 'PID   COMMAND\n1     node server.js',
  D_RUNNING: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  D_LATEST: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  D_DEVREQ: '[{"Driver":"nvidia","Count":-1,"Capabilities":[["gpu"]]}]',
  LISTENERS: 'LISTEN 0 511 *:8090 *:*',
  HTTP_CODE: '401',
  GPU_PROBE: 'ok',
  // 11-Q3 — a container created from exactly the unit's own flags.
  D_NAME: '/ai-dashboard',
  D_NET: 'host',
  D_RESTART: 'no',
  D_PORTS: '',
  D_BINDS: HEALTHY_BINDS,
  D_ENV: `${IMAGE_ENV}\nNVIDIA_DRIVER_CAPABILITIES=utility\nUV_THREADPOOL_SIZE=16`,
  D_RO: 'true',
  D_USER: '10001:10001',
  D_PID: 'host',
  D_TMPFS: '/tmp',
  D_AUTORM: 'true',
  D_LOGDRV: 'json-file',
  D_IMAGE_ENV: IMAGE_ENV,
  FILE_STAT: '640 0:10001',
} as const;

interface GuardCase {
  readonly guard: string;
  readonly what: string;
  readonly row: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly envFile?: string;
  /** `fail` = the row must refuse · `pass` = it must permit · `unknown` = it must not judge. */
  readonly verdict: 'fail' | 'pass' | 'unknown';
  readonly says?: string;
}

describe('⚠⚠ every check row REFUSES on its own bad input and PERMITS on a healthy box', () => {
  /**
   * ⚠ One row per guard, both directions. Before this table existed, EIGHTEEN of these rows
   * could each be disconnected with one line and the whole suite stayed green — including
   * the row about a world-readable credentials file, the row about a firewall that reads
   * `ENABLED=no`, the row about no rule covering port 22, and the row about a gate that
   * answers 200 without a cookie. A validator's verdict being right is not evidence that
   * anything asks it, and *being able to call a guard* is not evidence that it refuses.
   */
  const cases: readonly GuardCase[] = [
    // ---- the env file --------------------------------------------------------------
    { guard: 'mode/owner', row: 'check_env_file', what: 'a world-readable credentials file',
      verdict: 'fail', env: { FILE_STAT: '644 0:0' }, says: 'expected 0:10001 640' },
    { guard: 'mode/owner', row: 'check_env_file', what: 'the 0600 root:root the container cannot read',
      verdict: 'fail', env: { FILE_STAT: '600 0:0' }, says: 'would deny every login' },
    { guard: 'mode/owner', row: 'check_env_file', what: 'root:10001 0640, which the mount needs',
      verdict: 'pass', envFile: `SESSION_SECRET=${HEX64_SECRET}\n` },
    { guard: 'unreadable', row: 'check_env_file', what: 'a file this user cannot read',
      verdict: 'unknown', env: { READABLE: 'no' }, says: 're-run with sudo' },
    // ---- ⚠⚠ 11b-A5 — the shape `docker run -v` CREATES when the source is missing --------
    // With `env_readable` as `[[ -r ]]` a readable DIRECTORY passed it, the NUL row's inline
    // arithmetic became `(( != 0 ))` — a bash SYNTAX ERROR nothing judged — the `while read`
    // redirection failed unjudged, and the row then printed *"every line is a single-line,
    // unquoted KEY=VALUE"* about a path it had not read one byte of. The test phase's own §5.1
    // sweep examined this row and pronounced it **Sound**.
    { guard: '⚠ a DIRECTORY', row: 'check_env_file',
      what: 'the shape docker creates at the host path when a bind-mount source is missing',
      verdict: 'fail', env: { ENV_FILE: tmpdir() }, says: 'is a DIRECTORY' },

    { guard: 'key name', row: 'check_env_file', what: 'a key name Docker cannot use',
      verdict: 'fail', envFile: '1BAD=x\n', says: 'not a usable environment-variable name' },
    { guard: "line with no '='", row: 'check_env_file', what: 'a bare line Docker takes from the host',
      verdict: 'fail', envFile: `${HEX64_SECRET}\n`, says: 'take this from the host environment' },
    // ---- O20 / O21 / D8, the "absent" arms the validators never see -----------------
    { guard: 'O20 absent', row: 'check_password_hash', what: 'no PASSWORD_HASH at all',
      verdict: 'fail', envFile: 'STANDING=\n', says: 'every login is denied' },
    { guard: 'O21 absent', row: 'check_session_secret', what: 'no SESSION_SECRET at all',
      verdict: 'fail', envFile: 'STANDING=\n', says: 'every session is refused' },
    { guard: 'D8 absent', row: 'check_standing', what: 'no STANDING at all',
      verdict: 'fail', envFile: 'PASSWORD_HASH=x\n', says: 'STANDING is absent' },
    { guard: 'O20 unreadable', row: 'check_password_hash', what: 'a correct file, checked without sudo',
      verdict: 'unknown', env: { READABLE: 'no' }, says: "NOT 'it is absent'" },
    { guard: 'O21 unreadable', row: 'check_session_secret', what: 'a correct file, checked without sudo',
      verdict: 'unknown', env: { READABLE: 'no' } },
    { guard: 'D8 unreadable', row: 'check_standing', what: 'a correct file, checked without sudo',
      verdict: 'unknown', env: { READABLE: 'no' } },
    // ---- the producer ---------------------------------------------------------------
    { guard: 'hasher', row: 'check_hasher', what: 'no scripts/hash-password.py on the box',
      verdict: 'fail', env: { SRC: tmpdir() }, says: 'set-password has no producer' },
    { guard: 'hasher', row: 'check_hasher', what: 'the producer present', verdict: 'pass' },
    // ---- the unit --------------------------------------------------------------------
    { guard: 'unit installed', row: 'check_unit', what: 'no unit file at all', verdict: 'fail',
      env: { UNIT_PATH: join(tmpdir(), 'no-such-ai-dashboard.service') }, says: 'is not installed' },
    { guard: 'StartLimit', row: 'check_unit', what: 'the 10 s window systemd falls back to',
      verdict: 'fail', env: { START_LIMIT: '10s' }, says: 'systemd IGNORES StartLimit*' },
    { guard: 'ActiveState', row: 'check_unit', what: 'a unit that is not running', verdict: 'fail',
      env: { ACTIVE_STATE: 'failed' }, says: 'the unit is failed' },
    { guard: 'UnitFileState', row: 'check_unit', what: 'a unit that will not survive a reboot',
      verdict: 'fail', env: { FILE_STATE: 'disabled' }, says: 'does NOT start after a reboot' },
    { guard: 'ordering cycle', row: 'check_unit', what: 'a cycle in this boot', verdict: 'fail',
      env: { CYCLE_RC: '1' }, says: 'deleted a start job' },
    { guard: 'ordering cycle', row: 'check_unit', what: 'a journal this account cannot read',
      verdict: 'unknown', env: { CYCLE_RC: '2' }, says: 'was not ruled out' },
    { guard: 'the unit', row: 'check_unit', what: 'a unit that is installed, enabled and active',
      verdict: 'pass', env: { UNIT_PATH: REAL_UNIT }, says: "the installed unit's docker run line is" },
    // ---- ⚠⚠ 11b-A6 — the installed unit against the repo's, which NOTHING compared ------
    // `container_user` derives the credentials file's mode from a unit and `check_drift`
    // derives every container expectation from a unit; while those could be different files,
    // one `check` run could tick both while judging two different deployments. And the two
    // drift rows whose labels state an absolute — "systemd owns restarts", "§2.1: NONE" —
    // take their expectation from the installed unit, so one that GAINED `--restart always`
    // or `-p 8090:8090` made both sides agree and both rows tick.
    { guard: '⚠ installed unit vs the repo', row: 'check_unit',
      what: 'an installed unit whose docker run line is not the reviewed one',
      verdict: 'fail', env: { UNIT_PATH: DRIFTED_UNIT }, says: 'is NOT' },
    { guard: '⚠ installed unit unreadable', row: 'check_unit',
      what: 'a unit with no ExecStart to compare — NOT "they are the same"',
      verdict: 'unknown', says: "NOT 'they are the same'" },
    // ---- O22 --------------------------------------------------------------------------
    { guard: 'O22 count', row: 'check_one_process', what: 'two containers of that name',
      verdict: 'fail', env: { D_NAMED: 'abc\ndef' }, says: 'expected 1' },
    { guard: 'O22 other tag', row: 'check_one_process', what: 'a container from an older tag',
      verdict: 'fail', env: { D_PS: 'ai-dashboard ai-dashboard:latest\nold ai-dashboard:notag-20260901' },
      says: 'a second telemetry cache' },
    { guard: 'O22 ancestor', row: 'check_one_process', what: 'a container of the same image id under another name',
      verdict: 'fail', env: { D_BYID: 'someone-elses' }, says: 'someone-elses' },
    { guard: 'O22 processes', row: 'check_one_process', what: 'two processes inside the container',
      verdict: 'fail', env: { D_TOP: 'PID   COMMAND\n1     node server.js\n2     sh' },
      says: 'processes inside ai-dashboard' },
    { guard: 'O22 listeners', row: 'check_one_process', what: 'two listeners on 8090',
      verdict: 'fail', env: { LISTENERS: 'LISTEN 1\nLISTEN 2' }, says: 'listeners on 8090' },
    { guard: 'O22', row: 'check_one_process', what: 'one container, one process, one listener',
      verdict: 'pass' },
    // ---- the running container --------------------------------------------------------
    { guard: 'image id', row: 'check_container', what: 'a container running an OLDER image than :latest',
      verdict: 'fail', env: { D_LATEST: 'sha256:2222222222222222222222222222222222222222222222222222222222222222' },
      says: 'serving an OLDER image' },
    { guard: 'no container', row: 'check_container', what: 'nothing running at all', verdict: 'fail',
      env: { D_NAMED: '' }, says: 'no container named ai-dashboard is running' },
    { guard: 'GPU mode', row: 'check_container', what: 'fallback while the toolkit answers again',
      verdict: 'fail', env: { D_DEVREQ: 'null', GPU_PROBE: 'ok' }, says: 'Fix: sudo ./dashboard.sh restart' },
    { guard: 'GPU mode', row: 'check_container', what: 'fallback that the probe agrees with',
      verdict: 'pass', env: { D_DEVREQ: 'null', GPU_PROBE: 'broken' }, says: 'FALLBACK, and the probe agrees' },
    { guard: 'GPU mode', row: 'check_container', what: 'the GPU device request in force',
      verdict: 'pass', says: 'nvidia device request' },
    // ---- 11-Q3, the container against the unit --------------------------------------
    { guard: 'drift', row: 'check_drift', what: 'a container created from exactly the unit’s flags',
      verdict: 'pass', env: { UNIT_PATH: REAL_UNIT }, says: 'neither secret is in docker inspect' },
    { guard: '⚠ the secrets are in Env', row: 'check_drift',
      what: 'PASSWORD_HASH and SESSION_SECRET back in the container’s environment',
      verdict: 'fail',
      env: { UNIT_PATH: REAL_UNIT, D_ENV: `${IMAGE_ENV}\nNVIDIA_DRIVER_CAPABILITIES=utility\nUV_THREADPOOL_SIZE=16\nPASSWORD_HASH=scrypt.15.8.1.aa.bb\nSESSION_SECRET=${HEX64_SECRET}` },
      says: 'every member of the docker group' },
    { guard: 'drift: mounts', row: 'check_drift', what: 'a container started by hand with one mount',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_BINDS: '/sys:/sys:ro' },
      says: 'the mounts, source:target:ro and all DRIFTED' },
    { guard: 'drift: mounts :ro', row: 'check_drift', what: 'a mount that lost its :ro — invariant 2',
      verdict: 'fail',
      env: { UNIT_PATH: REAL_UNIT, D_BINDS: HEALTHY_BINDS.replace('/sys:/sys:ro', '/sys:/sys') },
      says: 'DRIFTED' },
    { guard: 'drift: ports', row: 'check_drift', what: 'a published port, which bypasses ufw entirely',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_PORTS: '8090/tcp' },
      says: 'published ports' },
    { guard: 'drift: name', row: 'check_drift', what: 'a second container under another name',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_NAME: '/ai-dashboard-2' },
      says: '--name DRIFTED' },
    { guard: 'drift: network', row: 'check_drift', what: 'bridge networking instead of host',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_NET: 'bridge' }, says: '--network DRIFTED' },
    { guard: 'drift: restart policy', row: 'check_drift',
      what: 'a Docker restart policy fighting systemd for the container',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_RESTART: 'always' },
      says: 'the Docker restart policy' },
    { guard: 'drift: env keys', row: 'check_drift', what: 'UV_THREADPOOL_SIZE never reaching the container',
      verdict: 'fail',
      env: { UNIT_PATH: REAL_UNIT, D_ENV: `${IMAGE_ENV}\nNVIDIA_DRIVER_CAPABILITIES=utility` },
      says: 'the environment keys the unit assigns' },
    { guard: 'drift: -e STANDING', row: 'check_drift',
      what: 'STANDING unset by the operator — a PASS-THROUGH is optional and must NOT drift',
      verdict: 'pass', env: { UNIT_PATH: REAL_UNIT } },
    { guard: 'drift: -e STANDING', row: 'check_drift', what: 'STANDING set by the operator',
      verdict: 'pass',
      env: { UNIT_PATH: REAL_UNIT, D_ENV: `${IMAGE_ENV}\nNVIDIA_DRIVER_CAPABILITIES=utility\nUV_THREADPOOL_SIZE=16\nSTANDING=gpu_temp` } },
    { guard: '⚠ Env unreadable', row: 'check_drift',
      what: 'a docker inspect nobody could read — NOT "the secrets are absent"',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, ENV_READ: 'fail' },
      says: "NOT 'they are absent'" },
    // ⚠⚠ The SAME defect as the row above, in the rows the build believed were the safe kind.
    // Two of these expectations are the EMPTY STRING by design — the unit carries no
    // `--restart` and publishes no port — so an unreadable read compared "" with "" and
    // printed a TICK. Measured 2026-09-11 by making the inspect call fail outright. One case
    // per read, including the three that DO fail closed, so a future edit cannot quietly turn
    // one of them into the other kind.
    { guard: '⚠ ports unreadable', row: 'check_drift',
      what: 'an unreadable PortBindings — an EMPTY expectation, so "" == "" used to TICK',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, PORTS_READ: 'fail' },
      says: "NOT 'it matches the unit'" },
    { guard: '⚠ restart policy unreadable', row: 'check_drift',
      what: 'an unreadable RestartPolicy — the other EMPTY expectation',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, RESTART_READ: 'fail' },
      says: "NOT 'it matches the unit'" },
    { guard: '⚠ mounts unreadable', row: 'check_drift', what: 'an unreadable Binds',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, BINDS_READ: 'fail' },
      says: 'the mounts:' },
    { guard: '⚠ name unreadable', row: 'check_drift', what: 'an unreadable .Name',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, NAME_READ: 'fail' }, says: '--name:' },
    { guard: '⚠ network unreadable', row: 'check_drift', what: 'an unreadable NetworkMode',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, NET_READ: 'fail' }, says: '--network:' },
    { guard: '⚠ the image’s own ENV unreadable', row: 'check_drift',
      what: 'the subtracted set unreadable — NOT "they match" and NOT "they drifted"',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, IMAGE_ENV_READ: 'fail' },
      says: "the IMAGE's own ENV" },
    // ---- ⚠⚠ 11b-A8 — the eight flags the six rows above left out, each with its own bad
    // input AND its own failed read. `--read-only` and `--user` are the two that matter most:
    // a container started by hand without either passed every drift row, and `--user` is the
    // number the credentials file's mode row derives its expectation from.
    { guard: 'drift: --read-only', row: 'check_drift', what: 'a WRITABLE root filesystem — §2.5 forbids it',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_RO: 'false' }, says: '--read-only' },
    { guard: 'drift: --user', row: 'check_drift', what: 'a container running as root, which reads a 0600 file the row calls wrong',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_USER: '' }, says: '--user' },
    { guard: 'drift: --pid', row: 'check_drift', what: 'a private pid namespace — §2.2 needs /proc',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_PID: '' }, says: '--pid' },
    { guard: 'drift: --tmpfs', row: 'check_drift', what: 'no tmpfs under a read-only root',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_TMPFS: '' }, says: '--tmpfs' },
    { guard: 'drift: --rm', row: 'check_drift', what: 'a container that survives its own exit',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_AUTORM: 'false' }, says: '--rm' },
    { guard: 'drift: --log-driver', row: 'check_drift', what: 'a different log driver',
      verdict: 'fail', env: { UNIT_PATH: REAL_UNIT, D_LOGDRV: 'local' }, says: '--log-driver' },
    { guard: '⚠ --read-only unreadable', row: 'check_drift', what: 'an unreadable ReadonlyRootfs',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, RO_READ: 'fail' }, says: '--read-only:' },
    { guard: '⚠ --user unreadable', row: 'check_drift', what: 'an unreadable .Config.User',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, USER_READ: 'fail' }, says: '--user:' },
    { guard: '⚠ --pid unreadable', row: 'check_drift', what: 'an unreadable PidMode',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, PID_READ: 'fail' }, says: '--pid:' },
    { guard: '⚠ --tmpfs unreadable', row: 'check_drift', what: 'an unreadable Tmpfs — another EMPTY-looking read',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, TMPFS_READ: 'fail' }, says: '--tmpfs:' },
    { guard: '⚠ --rm unreadable', row: 'check_drift', what: 'an unreadable AutoRemove',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, AUTORM_READ: 'fail' }, says: '--rm:' },
    { guard: '⚠ --log-driver unreadable', row: 'check_drift', what: 'an unreadable LogConfig.Type',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, LOGDRV_READ: 'fail' }, says: '--log-driver:' },
    { guard: 'drift: no unit', row: 'check_drift', what: 'a unit file with no ExecStart to derive from',
      verdict: 'unknown', says: 'DERIVED from that line' },
    { guard: 'drift: nothing running', row: 'check_drift', what: 'no container at all',
      verdict: 'unknown', env: { UNIT_PATH: REAL_UNIT, D_NAMED: '' }, says: 'nothing to compare' },

    // ---- ufw ----------------------------------------------------------------------------
    { guard: 'ufw enforcing', row: 'check_firewall', what: 'a firewall that reads ENABLED=no',
      verdict: 'fail', env: { UFW_ON: 'no' }, says: 'ufw reads ENABLED=no' },
    { guard: 'ufw 22', row: 'check_firewall', what: 'no rule covering port 22', verdict: 'fail',
      env: { R22: '' }, says: 'NO rule covers port 22' },
    { guard: 'ufw 8090', row: 'check_firewall', what: 'no rule covering 8090', verdict: 'fail',
      env: { R8090: '' }, says: 'no rule covers 8090' },
    { guard: 'ufw', row: 'check_firewall', what: 'enforcing, with both rules', verdict: 'pass' },
    // ---- the gate -------------------------------------------------------------------------
    { guard: 'the gate', row: 'check_gate', what: 'a route that answers 200 without a cookie',
      verdict: 'fail', env: { HTTP_CODE: '200' }, says: 'renamed middleware.ts to proxy.ts' },
    { guard: 'the gate', row: 'check_gate', what: 'nothing answering at all', verdict: 'fail',
      env: { HTTP_CODE: '000' }, says: 'nothing answered' },
    { guard: 'the gate', row: 'check_gate', what: '401 without a cookie', verdict: 'pass' },
  ];

  test('⚠ each of the check rows above refuses its own bad input, and permits a healthy box', () => {
    const actual = cases.map((c) => {
      const envFile = c.envFile ?? `PASSWORD_HASH=x\nSESSION_SECRET=${HEX64_SECRET}\nSTANDING=\n`;
      const r = guardRow(c.row, { ...HEALTHY, ...(c.env ?? {}) }, envFile);
      const verdict = r.failed > 0 ? 'fail' : r.unknown > 0 ? 'unknown' : 'pass';
      const says = c.says === undefined ? true : r.out.includes(c.says);
      return { guard: c.guard, what: c.what, verdict, says };
    });
    const expected = cases.map((c) => ({
      guard: c.guard,
      what: c.what,
      verdict: c.verdict,
      says: true,
    }));
    expect(actual).toEqual(expected);
  });

  test('⚠ the row for a bare line prints its LINE NUMBER and its length, never the line', () => {
    // ⚠ It printed `${line%%[!A-Za-z0-9_]*}…` — the prefix up to the first character outside
    // [A-Za-z0-9_] — and a SESSION_SECRET is 64 characters of [0-9a-f] by `configure`'s own
    // choice, so the expansion removed NOTHING: the whole secret went to the terminal
    // followed by an ellipsis implying it had been truncated. An editor's hard wrap on a
    // long `SESSION_SECRET=…` line leaves exactly this input.
    const r = guardRow('check_env_file', HEALTHY, `PASSWORD_HASH=x\n${HEX64_SECRET}\n`);
    expect(r.failed).toBeGreaterThan(0);
    expect(r.out).not.toContain(HEX64_SECRET);
    expect(r.out).not.toContain(HEX64_SECRET.slice(0, 32));
    expect(r.out).toContain('line 2 has no');
    expect(r.out).toContain('64 characters, not printed');
  });

  test('⚠ a non-quote failure of the O21 row does not explain itself with quotes', () => {
    const padded = guardRow('check_session_secret', HEALTHY, `SESSION_SECRET=${HEX64_SECRET} \n`);
    expect(padded.failed).toBeGreaterThan(0);
    expect(padded.out).toContain('trailing whitespace');
    expect(padded.out).not.toContain('does not strip quotes');
    const quoted = guardRow('check_session_secret', HEALTHY, `SESSION_SECRET="${HEX64_SECRET}"\n`);
    expect(quoted.out).toContain('does not strip quotes');
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ Mechanism 2, part two — every PREFLIGHT refusal
// ---------------------------------------------------------------------------------------

/**
 * Drive `preflight` with one input flipped from a healthy baseline, and return every
 * refusal it made.
 *
 * ⚠ All seven refusals could be turned into warnings with the suite green, because the only
 * assertion about them was that `install --dry-run` printed *some* `WOULD REFUSE` — which,
 * as `11-A18a` noted, was really an assertion about the machine running the suite (a Mac is
 * not Ubuntu and not root, so two refusals fired for free). Flipping ONE input at a time and
 * requiring EXACTLY ONE refusal is the form that cannot be satisfied by accident.
 */
const preflightWith = (
  overrides: readonly string[],
  args = '1 1 1 1',
  files?: Readonly<Record<string, string>>,
): { readonly out: string; readonly refusals: number } => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
  try {
    const osRelease = join(dir, 'os-release');
    writeFileSync(osRelease, 'ID=ubuntu\nVERSION_ID="26.04"\n');
    // ⚠ A whole source tree, when the case is about one. `SRC` feeds TWO refusals — the
    // package.json name and `scripts/hash-password.py` — so pointing it at an empty
    // directory fires both and the "exactly one" rule cannot say which guard did it.
    const src = join(dir, 'src');
    if (files !== undefined) {
      for (const [rel, body] of Object.entries(files)) {
        const path = join(src, rel);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, body);
      }
      mkdirSync(src, { recursive: true });
    }
    const result = sourced(
      [
        'DRY=1',
        'CMD=install',
        'is_root() { return 0; }',
        'uname() { printf "x86_64\\n"; }',
        'have() { case "$1" in python3|ufw|ss|curl) return 0 ;; *) return 1 ;; esac; }',
        'ufw_enforcing() { return 0; }',
        'ufw_rule_for_port() { printf "22/tcp ALLOW 192.168.4.0/22\\n"; }',
        'df() { printf "H\\n/dev/x 1 1 52428800 1%% /var/lib\\n"; }',
        'ss() { :; }',
        'container_ids() { :; }',
        ...overrides,
        `preflight ${args}`,
        'printf "\\nREFUSALS=%s\\n" "$PREFLIGHT_REFUSALS"',
      ],
      { OS_RELEASE: osRelease, ...(files === undefined ? {} : { SRC: src }) },
    );
    const matched = /REFUSALS=(\d+)/.exec(result.out);
    expect(matched, result.out).not.toBeNull();
    return { out: result.out, refusals: Number((matched as RegExpExecArray)[1]) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('⚠⚠ every preflight refusal fires on its own bad input, and on nothing else', () => {
  const PY_OK = { 'scripts/hash-password.py': '#\n' };
  const cases: readonly (readonly [
    string,
    readonly string[],
    string,
    Readonly<Record<string, string>>?,
  ])[] = [
    ['a healthy box refuses nothing', [], ''],
    [
      'not Ubuntu',
      ['OS_RELEASE=/dev/null'],
      'needs Ubuntu 24.04 or newer',
    ],
    [
      'not x86_64 — the image is amd64-only',
      ['uname() { printf "aarch64\\n"; }'],
      'needs x86_64',
    ],
    [
      'not root',
      ['is_root() { return 1; }'],
      'needs root — re-run with sudo',
    ],
    [
      'no package.json where the source should be',
      [],
      'no package.json in',
      { ...PY_OK },
    ],
    [
      'a package.json that is not this project',
      [],
      "is 'other-project', not 'ai-dashboard'",
      { ...PY_OK, 'package.json': '{\n  "name": "other-project"\n}\n' },
    ],
    [
      'an rsync that did not carry scripts/',
      [],
      'the rsync must carry scripts/',
      { 'package.json': '{\n  "name": "ai-dashboard"\n}\n' },
    ],
    [
      'under 10 GB free on /var/lib',
      ['df() { printf "H\\n/dev/x 1 1 5242880 1%% /var/lib\\n"; }'],
      'the build plus the image needs 10 GB',
    ],
    [
      '⚠ THE HARD REFUSAL — ufw enforcing and no rule covers port 22',
      ['ufw_rule_for_port() { :; }'],
      'HARD REFUSAL',
    ],
    [
      'no python3, the only producer of a PASSWORD_HASH',
      ['have() { case "$1" in ufw|ss|curl) return 0 ;; *) return 1 ;; esac; }'],
      'python3 is missing',
    ],
    [
      'something else already listening on 8090',
      ['ss() { printf "LISTEN 0 511 *:8090 *:*\\n"; }'],
      'something is already listening on 8090',
    ],
    [
      '⚠ ufw not enforcing, on a run that REACHES the firewall step',
      ['ufw_enforcing() { return 1; }'],
      'reaches the firewall step and ufw reads ENABLED=no',
    ],
  ];

  test('⚠ one bad input at a time produces exactly one refusal, and it names the right thing', () => {
    const actual = cases.map(([what, overrides, says, files]) => {
      const r = preflightWith(overrides, '1 1 1 1', files);
      return { what, refusals: r.refusals, says: says === '' ? true : r.out.includes(says) };
    });
    const expected = cases.map(([what, , says]) => ({
      what,
      refusals: says === '' ? 0 : 1,
      says: true,
    }));
    expect(actual).toEqual(expected);
  });

  test('⚠ a run that does NOT reach the firewall step only warns about a disabled ufw', () => {
    // ⚠ The other half of the same guard, and the reason the 4th argument exists: `check`,
    // `status` and `logs` must not be refused because the operator has not enabled a
    // firewall. `install` and `firewall` are the two that pass 1.
    const notFirewall = preflightWith(['ufw_enforcing() { return 1; }'], '1 1 1 0');
    expect(notFirewall.refusals).toBe(0);
    expect(notFirewall.out).toContain('NOT enforcing');
    expect(DASHBOARD_SH).toContain('cmd_firewall() {\n  preflight 1 0 0 1');
    expect(DASHBOARD_SH).toContain('preflight 1 1 1 1');
  });

  test('⚠ need_root refuses rather than dying, so a dry run prints the rest of its account', () => {
    const refused = sourced([
      'DRY=1',
      'CMD=restart',
      'is_root() { return 1; }',
      'need_root',
      'printf "\\nREFUSALS=%s\\n" "$PREFLIGHT_REFUSALS"',
    ]);
    expect(refused.out).toContain('WOULD REFUSE');
    expect(refused.out).toContain('restart needs root');
    expect(refused.out).toContain('REFUSALS=1');

    const permitted = sourced([
      'DRY=1',
      'CMD=restart',
      'is_root() { return 0; }',
      'need_root',
      'printf "\\nREFUSALS=%s\\n" "$PREFLIGHT_REFUSALS"',
    ]);
    expect(permitted.out).toContain('REFUSALS=0');
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ Mechanism 2, part three — the guards that are whole SUBCOMMANDS
// ---------------------------------------------------------------------------------------
//
// `build.md` §1 names three of these as deliberate, load-bearing choices and none of them
// was measured: `restart` proving the container id changed, `start` proving something
// answered, `install` FAILING on a failed check. Each could be disconnected with one line.

/** Stubs for the things a whole subcommand reaches for. */
const CMD_STUBS = [
  'is_root() { return 0; }',
  'systemctl() { printf "SYSTEMCTL %s\\n" "$*"; }',
  'journalctl() { :; }',
  'install() { :; }',
  'container_ids() { :; }',
  'wait_for_answer() { return "${ANSWER_RC-0}"; }',
  'check_start_limit() { return "${LIMIT_RC-0}"; }',
  'report_ordering_cycles() { return 0; }',
  'preflight() { :; }',
] as const;

describe('⚠⚠ the subcommand guards refuse, and each of them is one line from being inert', () => {
  test('⚠ restart REFUSES when the container id did not change, and re-checks when it did', () => {
    // ⚠ "A restart that reports success and changes nothing" is this repo's most-repeated
    // failure mode and the dashboard has already produced one: the standalone server renames
    // its own process to `next-server (v16.3.4)`, so `pkill -f "node server.js"` missed it
    // and the old process kept serving (FIRST-DEPLOY §5.1). The proof that it did not happen
    // again is this comparison — and `if [[ -n "$before" && … ]]` could be `if false` with
    // the whole suite green (X30), as could the `cmd_check` that follows it (X31).
    const run = (before: string, after: string): ScriptRun =>
      sourced(
        [
          ...CMD_STUBS,
          // ⚠ A FILE, not a variable: `before="$(container_ids …)"` runs in a subshell, so a
          // counter incremented inside it is gone by the second call.
          `container_ids() { if [[ -e "$COUNTER" ]]; then printf "${after}"; else : >"$COUNTER"; printf "${before}"; fi; }`,
          'cmd_check() { printf "CHECK_RAN\\n"; }',
          'rc=0; cmd_restart || rc=$?; printf "STATUS=%s\\n" "$rc"',
        ],
        { UNIT_PATH: '/nonexistent', COUNTER: join(mkdtempSync(join(tmpdir(), 'dashboard-sh-')), 'n') },
      );

    const unchanged = run('abc123', 'abc123');
    expect(unchanged.status).not.toBe(0);
    expect(unchanged.out).toContain('the container id did not change');
    expect(unchanged.out).not.toContain('CHECK_RAN');

    const changed = run('abc123', 'def456');
    expect(changed.out).toContain('STATUS=0');
    expect(changed.out).toContain('container id abc123 -> def456');
    // ⚠ …and it re-checks. A restart is the moment a changed env file, a changed unit or a
    // new image first takes effect, which is exactly when every row of `check` is worth
    // asking again.
    expect(changed.out).toContain('CHECK_RAN');
  });

  test('⚠ start REFUSES when nothing answered, and unit REFUSES when StartLimit did not take', () => {
    const dead = sourced([...CMD_STUBS, 'cmd_start'], { ANSWER_RC: '1' });
    expect(dead.status).not.toBe(0);
    expect(dead.out).toContain('the unit started but nothing answered');

    const alive = sourced([...CMD_STUBS, 'cmd_start'], { ANSWER_RC: '0' });
    expect(alive.status).toBe(0);

    // ⚠ TRAP 1's install-time half — "ask systemd what it ended up with". `check_start_limit
    // || die` could be `|| true` with everything green (X32), and the runtime half is the
    // `StartLimit` row of the guard table above.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const unit = join(dir, 'ai-dashboard.service');
      writeFileSync(unit, '[Unit]\n');
      const ignored = sourced([...CMD_STUBS, 'cmd_unit'], { LIMIT_RC: '1', UNIT_PATH: unit });
      expect(ignored.status).not.toBe(0);
      expect(ignored.out).toContain('the StartLimit* keys did not take');

      const took = sourced([...CMD_STUBS, 'cmd_unit'], { LIMIT_RC: '0', UNIT_PATH: unit });
      expect(took.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ a failed systemctl enable prints NO tick, and keeps the reason systemd gave', () => {
    // It printed `! systemctl enable reported a problem` AND `✓ enabled ai-dashboard.service`
    // on consecutive lines, with the reason discarded by `>/dev/null 2>&1` (11-A12). A tick
    // over a failure is the shape this whole script exists to prevent.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const unit = join(dir, 'ai-dashboard.service');
      writeFileSync(unit, '[Unit]\n');
      const failed = sourced(
        [
          ...CMD_STUBS,
          'systemctl() { if [[ "$1" == enable ]]; then echo "Failed to enable unit: bad symlink" >&2; return 1; fi; }',
          'cmd_unit',
        ],
        { UNIT_PATH: unit },
      );
      expect(plain(failed.out)).not.toContain('✓ enabled');
      expect(failed.out).toContain('systemctl enable exited 1');
      expect(failed.out).toContain('bad symlink');
      expect(failed.out).toContain('will NOT start after a reboot');

      const ok = sourced([...CMD_STUBS, 'cmd_unit'], { UNIT_PATH: unit });
      expect(plain(ok.out)).toContain('✓ enabled ai-dashboard.service');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ install FAILS on a failed check, and never re-prompts for a password it already has', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, 'PASSWORD_HASH=already-set\n');
      const body = (checkRc: string): readonly string[] => [
        ...CMD_STUBS,
        'cmd_deps() { :; }',
        'cmd_build() { :; }',
        'cmd_configure() { :; }',
        'cmd_unit() { :; }',
        'cmd_firewall() { :; }',
        'cmd_start() { :; }',
        'cmd_set_password() { printf "PROMPTED\\n"; }',
        `cmd_check() { return ${checkRc}; }`,
        'rc=0; cmd_install || rc=$?; printf "STATUS=%s\\n" "$rc"',
      ];
      // ⚠ §12.2's answered question: every row of `check` detects something with no
      // diagnostic anywhere else, so a warning at the end of a long run is a warning nobody
      // reads. `die` -> `warn` here left everything green (X34).
      const bad = sourced(body('1'), { ENV_FILE: file });
      expect(bad.status).not.toBe(0);
      expect(bad.out).toContain("install completed but 'check' did not pass");

      const good = sourced(body('0'), { ENV_FILE: file });
      expect(good.out).toContain('STATUS=0');
      expect(plain(good.out)).toContain('✓ installed');
      // ⚠ Idempotence, which `cmd_install`'s own header promises and nothing measured (X44).
      expect(good.out).toContain('already present — keeping it, not re-prompting');
      expect(good.out).not.toContain('PROMPTED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ configure NEVER rewrites a live SESSION_SECRET or the STANDING an operator wrote', () => {
    // ⚠ Rotating SESSION_SECRET logs out every open session — the same principle as
    // `serve-llm.sh install` never repointing a live model — and `STANDING` is the
    // operator's. Both guards could be `if false` with the suite green (X42, X43).
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      const body = `SESSION_SECRET=${HEX64_SECRET}\nSTANDING=gpu_temp\n`;
      writeFileSync(file, body);
      const result = sourced(
        ['preflight() { :; }', 'unit_installed() { return 1; }', 'cmd_configure'],
        { ENV_FILE: file, BACKUP_DIR: dir },
      );
      expect(result.status).toBe(0);
      expect(result.out).toContain('SESSION_SECRET already present');
      expect(result.out).toContain('STANDING already present');
      // The file itself, byte for byte — the assertion the message cannot make for itself.
      expect(readFileSync(file, 'utf8')).toBe(body);
      expect(existsSync(join(dir, 'ai-dashboard.env.bak'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * ⚠⚠ **"Already present" is not "already correct", and this is the deploy path** (HANDOVER
   * §0.13). Measured 2026-09-11 (11b-A7): an upgrading box carries the pre-ruling
   * `0600 root:root`, every value in the file is already there, so `cmd_configure` printed
   * three green *"already present"* lines, **never called `env_set`**, and left the file at a
   * mode the container cannot read. The mode was repaired only as a SIDE EFFECT of writing a
   * value, and there was no value to write. `check`'s failing mode row names `configure` in its
   * `Fix:` line, and `configure` was measured not to fix it.
   */
  /**
   * ⚠⚠ 11b-A6. `container_user` read `$SRC/systemd/ai-dashboard.service` **unconditionally**
   * while every expectation in `check_drift` reads `$UNIT_PATH` — so in one `check` run the
   * file-mode row judged the credentials file against the **repo's** gid and the drift rows
   * judged the container against the **installed** unit. Measured to disagree with an installed
   * unit carrying `--user 10002:10002`: the derived gid stayed 10001, and `check` then said
   * *"is root:10001 0640 — mounted, and readable by the container only"* about a file the
   * container cannot open, which is the same clean unlogged 401 O20 is about. `env_set`'s
   * `chown` uses the same number, so `configure` wrote the wrong group too.
   */
  // ⚠ DOUBLE-quoted deliberately: the red-test ledger reads the test's name out of the source
  // literal, and an ESCAPED apostrophe (`repo\'s`) makes that literal `repo\'s` while vitest
  // reports `repo's` — so the name never matched, and the ledger reported this ⚠ test as inert
  // while the harness log showed it going red under `11b-U1`. Measured 2026-09-11.
  test("⚠⚠ the container gid comes from the unit systemd RUNS, not from the repo's copy", () => {
    const gidWith = (unitPath: string): string =>
      sourced(['container_gid'], { UNIT_PATH: unitPath }).out.trim();

    expect(gidWith(REAL_UNIT)).toBe('10001');
    expect(gidWith(DRIFTED_UNIT)).toBe('10002');
    // …and with no installed unit at all — the ordinary state before `dashboard.sh unit` —
    // the repo's copy is the fallback rather than a failure, because `configure` legitimately
    // runs first.
    expect(gidWith(join(tmpdir(), 'no-such-ai-dashboard.service'))).toBe('10001');
  });

  test('⚠⚠ configure REPAIRS the mode of a file it has nothing to write to', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, `PASSWORD_HASH=x\nSESSION_SECRET=${HEX64_SECRET}\nSTANDING=\n`);
      chmodSync(file, 0o600);
      const result = sourced(
        ['preflight() { :; }', 'unit_installed() { return 1; }', 'cmd_configure'],
        { ENV_FILE: file, BACKUP_DIR: dir },
      );
      expect(result.status).toBe(0);
      // Every value is already present, so nothing is written — and the mode still moves.
      expect(result.out).toContain('SESSION_SECRET already present');
      expect(result.out).toContain('STANDING already present');
      expect(statSync(file).mode & 0o777).toBe(0o640);
      expect(result.out).toContain('it was uid:gid');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ configure --dry-run announces the mode it would change, and changes none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, `PASSWORD_HASH=x\nSESSION_SECRET=${HEX64_SECRET}\nSTANDING=\n`);
      chmodSync(file, 0o600);
      const result = runScript(['configure', '--dry-run'], { ENV_FILE: file, BACKUP_DIR: dir });
      expect(result.out).toContain('would chmod 0640 and chown root:10001');
      expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * ⚠⚠ 11b-A4. `env_set` finishes with `mv -f "$TMP" "$ENV_FILE"` — correct, because `install`
   * COPIES ONTO the destination and an interrupt in that window leaves a truncated credentials
   * file (11-A17) — but `$ENV_FILE` is a **bind-mount source**, and Docker binds the *inode*.
   * After the rename the container's `/etc/ai-dashboard.env` is the OLD inode for the life of
   * that container, `check` reads the NEW one, and every row is green while the container
   * denies the new password. Two callers printed a warning and `env_set` — the one function
   * that writes this file — printed nothing, so any third writer got silence.
   */
  test('⚠⚠ env_set itself warns that a running container cannot see the file it just wrote', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, 'STANDING=\n');
      const run = (running: boolean): ScriptRun =>
        sourced(
          [
            'unit_installed() { return 0; }',
            `container_ids() { printf '%s' ${running ? "'abc123'" : "''"}; }`,
            'env_set STANDING gpu_temp',
          ],
          { ENV_FILE: file, BACKUP_DIR: dir },
        );

      const withContainer = run(true);
      expect(withContainer.status).toBe(0);
      expect(withContainer.out).toContain('A bind mount pins the INODE');
      expect(withContainer.out).toContain('dashboard.sh restart');

      // ⚠ And NOT on a box with no container running: a warning that fires on a correct
      // configuration teaches an operator to ignore the one that matters.
      expect(run(false).out).not.toContain('A bind mount pins the INODE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ set-password REFUSES a hash its own producer wrote but this build cannot parse', () => {
    // ⚠ Belt and braces over `scripts/hash-password.py`, because the failure it guards is
    // silent: an unparseable PASSWORD_HASH is a clean empty 401 on every attempt with
    // nothing logged. `if ! why="$(scrypt_hash_error …)"` -> `if false` was green (X45).
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      const run = (hash: string): ScriptRun =>
        sourced(
          [
            'preflight() { :; }',
            // ⚠ NOT `is_root() { return 0; }` — `env_set` chowns root:root when it believes
            // it is root, and the point of this test is the REAL write path.
            'have_terminal() { return 0; }',
            'unit_installed() { return 1; }',
            `python3() { printf '%s' ${JSON.stringify(hash)}; }`,
            'cmd_set_password',
          ],
          { ENV_FILE: file, BACKUP_DIR: dir },
          [],
          'hunter2a\nhunter2a\n',
        );

      const rejected = run('scrypt.15.8.1.tooshort.alsoshort');
      expect(rejected.status).not.toBe(0);
      expect(rejected.out).toContain('produced something this build cannot verify');
      expect(existsSync(file)).toBe(false);

      const accepted = run(realHash());
      expect(accepted.status).toBe(0);
      expect(accepted.out).toContain('PASSWORD_HASH written');
      expect(readFileSync(file, 'utf8')).toContain('PASSWORD_HASH=scrypt.');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ set-password --dry-run announces the /root backup it would make, as configure does', () => {
    // ⚠ The 11-N3 fix reached one of two callers: `cmd_set_password` returns BEFORE
    // `env_set`, so `backup_env`'s dry-aware branch was unreachable from the one subcommand
    // that rewrites a live credentials file every single time it is run (11-A7).
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, 'PASSWORD_HASH=x\n');
      const result = runScript(['set-password', '--dry-run'], { ENV_FILE: file, BACKUP_DIR: dir });
      expect(result.out).toContain(`would copy ${file} -> ${dir}/ai-dashboard.env.bak.`);
      expect(result.out).toContain('(mode 0600)');
      expect(result.out).toContain('would write PASSWORD_HASH=<the hash, not printed>');
      // ⚠⚠ THE MODE, and it said `(0600 root:root)` until 2026-09-11 (11b-A11) — the mode the
      // ruling REPLACED, and the one that produces the silent 401 the ruling exists to remove.
      // `env_set`'s two dry-run arms were updated; this one returns before `env_set`, so it was
      // missed. INSTALL-SPEC §1 asks a dry run to be a complete account of what the real run
      // does, and on the loop's most contested item it was an account of the opposite.
      expect(result.out).toContain('(0640 root:10001)');
      expect(result.out).not.toContain('0600 root:root');
      expect(readFileSync(file, 'utf8')).toBe('PASSWORD_HASH=x\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ the credentials file is 0640 for the mount, every backup is 0600, and the rewrite is atomic', () => {
    // ⚠ `-m 0600` -> `-m 0644` on either writer was green: the mode of the file carrying the
    // password hash was unmeasurable off the box, because `install -o root` fails for a
    // non-root caller and no test could reach the real write path (X37, X38).
    //
    // ⚠⚠ 0640 on the LIVE file since SPEC §5.1's ruling of 2026-09-11, and 0600 on the
    // backups — the difference is deliberate and is the whole of what the ruling costs. The
    // live file is BIND-MOUNTED into a container running as `--user 10001:10001`, which
    // cannot read `root:root 0600`; nothing mounts a backup, so nothing loosens one. The gid
    // is read out of the unit's own `--user` rather than retyped.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      const result = sourced(
        [
          `env_set SESSION_SECRET ${HEX64_SECRET}`,
          'env_set STANDING gpu_temp',
          'printf "MODE=%s\\n" "$(stat -f %Lp "$ENV_FILE")"',
          'for b in "$BACKUP_DIR"/ai-dashboard.env.bak.*; do printf "BACKUP=%s\\n" "$(stat -f %Lp "$b")"; done',
        ],
        { ENV_FILE: file, BACKUP_DIR: dir },
      );
      expect(result.status).toBe(0);
      expect(result.out).toContain('MODE=640');
      expect(result.out).toContain('BACKUP=600');
      expect(readFileSync(file, 'utf8')).toContain(`SESSION_SECRET=${HEX64_SECRET}`);
      // ⚠ …and nothing is left behind. The rewrite builds a dot-file in the DESTINATION's
      // own directory and renames it, so an interrupt cannot leave a truncated credentials
      // file (11-A17); the rename is only atomic if the temp file is on the same filesystem.
      const leftovers = execFileSync('bash', ['-c', `ls -a ${JSON.stringify(dir)}`], {
        encoding: 'utf8',
      })
        .split('\n')
        .filter((n) => n.startsWith('.ai-dashboard'));
      expect(leftovers).toEqual([]);
      expect(DASHBOARD_SH).toContain('mv -f "$TMP" "$ENV_FILE"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ env_get returns the LAST duplicate of a key, which is the one Docker uses', () => {
    // ⚠ `tail -1` -> `head -1` was green (X36). A hand-edited file with two SESSION_SECRET
    // lines is then judged on the line the container never sees: `check` approves the first
    // and the server runs on the second.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, 'SESSION_SECRET=first\nSESSION_SECRET=second\n');
      const result = sourced(['printf "GOT=%s\\n" "$(env_get SESSION_SECRET)"'], {
        ENV_FILE: file,
      });
      expect(result.out).toContain('GOT=second');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ report_ordering_cycles has three answers, and "could not look" is not "clean"', () => {
    // ⚠ `journalctl -b` gives a user outside `adm` only their OWN journal and still exits 0,
    // so an empty result printed a tick having read nothing — on the one trap that can only
    // ever be observed on a real boot, and that has already deleted start jobs here (11-A11).
    const run = (stub: string): ScriptRun =>
      sourced([stub, 'rc=0; report_ordering_cycles || rc=$?; printf "RC=%s\\n" "$rc"']);

    const clean = run('journalctl() { if [[ "$*" == *--system* ]]; then printf "boot\\n"; fi; }');
    expect(clean.out).toContain('RC=0');
    expect(clean.out).toContain('no ordering cycle');

    const cycle = run(
      'journalctl() { printf "multi-user.target: Found ordering cycle: a/start after b\\n"; }',
    );
    expect(cycle.out).toContain('RC=1');
    expect(cycle.out).toContain('ORDERING CYCLE');

    const blind = run('journalctl() { return 1; }');
    expect(blind.out).toContain('RC=2');
    expect(blind.out).toContain('cannot read this boot');
    expect(blind.out).not.toContain('no ordering cycle');
  });

  test('⚠ load_condition_rules fails on a PARTIAL read of the table, not only on an empty one', () => {
    // ⚠ Measured 2026-09-10 (11-A13): a `gpu_temp` row reformatted onto four lines by
    // prettier left 14 of 15 kinds extracted with NO warning, and `check` then reported the
    // operator's perfectly good `STANDING=gpu_temp` as matching nothing. The operator's fix
    // for that is to delete a valid suppression, which un-suppresses an accepted condition.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      mkdirSync(join(dir, 'lib'));
      const original = read('lib/conditions.ts');
      const reformatted = original.replace(
        '  gpu_temp: { singleton: false, bareKindAllowedInStanding: true },',
        '  gpu_temp: {\n    singleton: false,\n    bareKindAllowedInStanding: true,\n  },',
      );
      expect(reformatted).not.toBe(original);
      writeFileSync(join(dir, 'lib/conditions.ts'), reformatted);
      const partial = sourced(['load_condition_rules', 'echo LOADED'], { SRC: dir });
      expect(partial.status).not.toBe(0);
      expect(partial.out).toContain('read 14 of 15 condition kinds');
      expect(partial.out).not.toContain('LOADED');

      writeFileSync(join(dir, 'lib/conditions.ts'), original);
      const whole = sourced(['load_condition_rules', 'echo LOADED'], { SRC: dir });
      expect(whole.status).toBe(0);
      expect(whole.out).toContain('LOADED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ ufw_rule_for_port reads the To COLUMN wherever it is, and never the From column', () => {
    // ⚠ This function feeds the HARD REFUSAL, and a refusal that fires on a CORRECTLY
    // configured machine is how an operator learns to ignore the one refusal that matters.
    // Three legal spellings were invisible to the old `to = $1` (11-A8). Measured here
    // against the real awk program with fabricated `ufw status` output, since there is no
    // ufw on this Mac.
    //
    // ⚠ Stated accurately: the box's own rule is `22/tcp ALLOW 192.168.4.0/22`, which the
    // old matcher DID find — so this was a latent hazard here, not a live blocker.
    const rows: readonly (readonly [string, number, boolean, string])[] = [
      ['22/tcp                     ALLOW       192.168.4.0/22', 22, true, "this box's own rule"],
      ['192.168.4.71 22/tcp        ALLOW       192.168.4.0/22', 22, true, 'to <ip> port 22'],
      ['Anywhere                   ALLOW       192.168.4.0/22', 22, true, 'a blanket allow from the LAN'],
      ['Anywhere (v6)              ALLOW       Anywhere (v6)', 22, false, '⚠ a v6 blanket is NOT a v4 SSH rule'],
      ['[ 1] 22/tcp                ALLOW IN    Anywhere', 22, true, 'numbered, rules 1-9'],
      ['[10] 22/tcp                ALLOW IN    Anywhere', 22, true, 'numbered, rules 10+'],
      ['20:30/tcp                  ALLOW       192.168.4.0/22', 22, true, 'a range'],
      ['OpenSSH                    ALLOW       Anywhere', 22, true, 'an app profile'],
      ['8090/tcp                   ALLOW       192.168.4.0/22', 8090, true, 'the rule this script writes'],
      // ⚠ THE ONE THIS MUST NEVER MATCH. The LAN range ends in the characters `/22`, so a
      // grep for "22" anywhere in the line reports that SSH is covered by the rule that
      // covers 8090 — on the one check whose failure takes the box off the network.
      ['8090/tcp                   ALLOW       192.168.4.0/22', 22, false, 'the source range ends /22'],
      ['192.168.4.0/22             ALLOW       Anywhere', 22, false, 'a subnet in the To column'],
    ];
    const script = [
      'is_root() { return 0; }',
      'have() { return 0; }',
      'ufw() { printf "Status: active\\n\\nTo    Action    From\\n--    ------    ----\\n%s\\n" "$LINE"; }',
      'for i in "$@"; do',
      '  LINE="${i%%|*}"; WANT="${i##*|}"',
      '  if [[ -n "$(ufw_rule_for_port "$WANT")" ]]; then printf "FOUND\\n"; else printf "MISS\\n"; fi',
      'done',
    ];
    const result = sourced(script, {}, rows.map(([line, want]) => `${line}|${want}`));
    const verdicts = result.out.trim().split('\n');
    expect(verdicts).toHaveLength(rows.length);
    expect(rows.map(([, , , why], i) => [why, verdicts[i] === 'FOUND'])).toEqual(
      rows.map(([, , found, why]) => [why, found]),
    );
  });

  test('⚠ Documentation= does not point systemctl status at the credentials file', () => {
    // ⚠ `Documentation=file:/etc/ai-dashboard.env` invited a reader to open the one 0600
    // file on this box — a password hash and a session secret — as the unit's documentation
    // (11-A18c).
    const doc = (/^Documentation=(.*)$/m.exec(unitCode()) ?? [])[1] ?? '';
    expect(doc).not.toBe('');
    expect(doc).not.toContain('ai-dashboard.env');
    expect(DASHBOARD_SH).toContain('ENV_FILE="${ENV_FILE:-/etc/ai-dashboard.env}"');
  });

  test('⚠ every subcommand in the header is in the dispatch case, and nothing else is', () => {
    // ⚠ `usage()` re-reads the header, so the two are one text — but the DISPATCH is a third
    // list, and nothing compared it (11-A18b). A subcommand documented and not dispatched
    // answers `unknown command`; one dispatched and not documented is invisible.
    const documented = [...DASHBOARD_SH.matchAll(/^#\s+\.\/dashboard\.sh ([a-z-]+)/gm)].map(
      (m) => m[1],
    );
    const dispatched = [...functionBody('main').matchAll(/^ {4}([a-z-]+)\)\s+cmd_/gm)].map(
      (m) => m[1],
    );
    expect(documented).toHaveLength(13);
    expect([...dispatched].sort()).toEqual([...documented].sort());
  });
});

// ---------------------------------------------------------------------------------------
// ⚠⚠ The --gpus all fallback — INSTALL-SPEC §11.1
// ---------------------------------------------------------------------------------------

describe('⚠⚠ the GPU fallback starts the dashboard without a GPU rather than not at all', () => {
  test('⚠ ExecStart takes its GPU flags from a variable, UNBRACED, with one ExecStart line', () => {
    // ⚠ systemd splits the UNBRACED form on whitespace and passes `${GPU_FLAGS}` as a SINGLE
    // argv — and `--gpus all` as one argument is rejected by docker. The two spellings look
    // identical in review, which is why this is asserted rather than eyeballed (11-A14).
    expect(execStart()).toContain(' $GPU_FLAGS ');
    expect(unitCode()).not.toContain('${GPU_FLAGS}');
    // ⚠ …and NOT unconditionally. The literal flag in ExecStart is the whole defect.
    expect(execStart()).not.toContain('--gpus all');
    // ⚠ ONE ExecStart=. systemd accepts several only for Type=oneshot; a second one on this
    // Type=simple unit makes the file fail to load, which is not a fallback at all.
    expect(unitCode().match(/^ExecStart=/gm) ?? []).toHaveLength(1);
    expect(unitCode()).toContain('Type=simple');
  });

  test('⚠ the probe writes the variable, and never runs this repository own image', () => {
    const probe = (/^ExecStartPre=(\/bin\/sh.*)$/m.exec(unitCode()) ?? [])[1] ?? '';
    expect(probe).toContain('nvidia-container-cli info');
    // ⚠ `docker run --rm --gpus all ai-dashboard:latest true` would be a SECOND CONTAINER of
    // this repository, which `check`'s O22 row matches by repository AND by image id — a
    // check racing a start would report a false second instance.
    expect(probe).not.toContain('docker run');
    expect(probe).not.toContain('ai-dashboard:latest');
    // Both spellings of the variable, so the fallback is a value and not an absence.
    expect(probe).toContain('GPU_FLAGS=--gpus all');
    expect(probe).toContain('GPU_FLAGS=;');
    expect(unitCode()).toContain('EnvironmentFile=-/run/ai-dashboard-gpu.env');
    expect(probe).toContain('/run/ai-dashboard-gpu.env');
    // ⚠ The one thing `EnvironmentFile=-` cannot do is complain about its own absence, so
    // the mode has to be reported from the CONTAINER. That row is the compensation, and it
    // is in the guard table above with all three of its states.
    expect(DASHBOARD_SH).toContain("--format '{{json .HostConfig.DeviceRequests}}'");
  });

  test('⚠ check reads the mode from the container and RE-PROBES, so a fallback cannot last', () => {
    // ⚠ Not from the unit text, which always says `$GPU_FLAGS`; and not from `gpus: null` in
    // the telemetry, which is ALSO what a box with no compute card reports — and this box
    // documents having none, so that inference is guaranteed wrong here at least once.
    const body = functionBody('container_gpu_mode');
    expect(body).toContain('.HostConfig.DeviceRequests');
    expect(body).toContain('nvidia');
    expect(functionBody('check_container')).toContain('gpu_runtime_available');
    // The re-probe asks the same question the unit's ExecStartPre asks, spelled the same way.
    expect(functionBody('gpu_runtime_available')).toContain('nvidia-container-cli info');

    // The three states, driven through the real parser rather than a stub of it.
    const modes = sourced([
      'docker() { printf "%s\\n" "$DEVREQ"; }',
      'for DEVREQ in \'[{"Driver":"nvidia","Count":-1}]\' null "[]"; do',
      '  printf "%s -> %s\\n" "$DEVREQ" "$(container_gpu_mode)"',
      'done',
    ]);
    expect(modes.out).toContain('-> gpu');
    expect(modes.out).toContain('null -> fallback');
    expect(modes.out).toContain('[] -> fallback');
  });

  test('⚠ every text that promised the OLD all-or-nothing behaviour was corrected with it', () => {
    // ⚠ Six texts asserted that a broken toolkit takes the whole dashboard down, and none of
    // them was measured, so nothing would have gone red when they became false (11-A14).
    for (const source of [DASHBOARD_SH, UNIT, read('README.md')]) {
      expect(source).not.toMatch(/so 'docker run' fails/);
      expect(source).not.toMatch(/the container does not start at all/);
      expect(source).not.toMatch(/the unit will not start\b/);
    }
    expect(read('README.md')).toContain('INSTALL-SPEC §11.1');
    expect(DASHBOARD_SH).toContain('INSTALL-SPEC §11.1');
  });
});

// ---------------------------------------------------------------------------------------
// The unit — SPEC §2.5, and the three traps this repo has already paid for
// ---------------------------------------------------------------------------------------

/** The `[Unit]` / `[Service]` / `[Install]` section a directive is written in. */
const sectionOf = (directive: string): string | null => {
  let section: string | null = null;
  for (const raw of UNIT.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const heading = /^\[(\w+)\]$/.exec(line);
    if (heading) {
      section = heading[1] ?? null;
      continue;
    }
    if (line.startsWith(`${directive}=`)) return section;
  }
  return null;
};

/** The uncommented body of the unit, so a directive quoted in a comment cannot answer for one. */
const unitCode = (): string =>
  UNIT.split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

/** `ExecStart=` with its line continuations joined and its whitespace collapsed. */
const execStart = (): string => {
  const body = unitCode();
  const start = body.indexOf('ExecStart=');
  expect(start).toBeGreaterThan(-1);
  let out = '';
  for (const line of body.slice(start).split('\n')) {
    out += line.replace(/\\$/, ' ');
    if (!line.trimEnd().endsWith('\\')) break;
  }
  return out.replace(/\s+/g, ' ').trim();
};

describe('⚠ ai-dashboard.service', () => {
  test('⚠ StartLimitIntervalSec and StartLimitBurst are in [Unit], where systemd reads them', () => {
    // systemd moved them in v229 and IGNORES them in [Service], falling back to a 10 s
    // window that RestartSec=10 can never fill — so a broken instance retries for ever.
    expect(sectionOf('StartLimitIntervalSec')).toBe('Unit');
    expect(sectionOf('StartLimitBurst')).toBe('Unit');
    expect(unitCode()).toContain('StartLimitIntervalSec=300');
    expect(unitCode()).toContain('StartLimitBurst=5');
    // …and the script asks systemd what it ended up with rather than trusting the file.
    expect(DASHBOARD_SH).toContain('systemctl show "$UNIT_NAME" -p StartLimitIntervalUSec');
  });

  test('⚠ the unit is WantedBy multi-user.target and ordered after sysinit.target, never after it', () => {
    // ⚠ `After=` a target that `Wants=` this unit is an ordering cycle, and systemd breaks a
    // cycle by SILENTLY DELETING a start job. Both llama-server instances failed to come up
    // on the 2026-08-28 boot that way, with no failed unit and no error anywhere.
    const after = /^After=(.*)$/m.exec(unitCode());
    expect(after?.[1]).toBe('docker.service sysinit.target');
    expect(sectionOf('WantedBy')).toBe('Install');
    expect(unitCode()).toContain('WantedBy=multi-user.target');
  });

  test('⚠ ExecStart binds in the host network namespace and publishes no port', () => {
    // Publishing inserts rules into DOCKER/FORWARD, evaluated BEFORE ufw's INPUT: the port
    // becomes reachable from anywhere routable whatever ufw says. §2.1.
    expect(execStart()).toContain('--network host');
    expect(execStart()).not.toContain('-p 8090');
    expect(execStart()).not.toMatch(/--publish/);
  });

  test('⚠ ExecStart carries every §2.5 runtime flag, and no Docker restart policy', () => {
    const cmd = execStart();
    for (const flag of [
      '--rm',
      '--name ai-dashboard',
      '--pid host',
      '--read-only',
      '--tmpfs /tmp',
      '--user 10001:10001',
      '$GPU_FLAGS',
      '-e NVIDIA_DRIVER_CAPABILITIES=utility',
      '-e UV_THREADPOOL_SIZE=16',
      // ⚠⚠ SPEC §5.1's ruling of 2026-09-11 (11-Q2). `--env-file /etc/ai-dashboard.env` was
      // HERE and is gone: it copied PASSWORD_HASH and SESSION_SECRET into the container's
      // environment, where `docker inspect` shows them to every member of the docker group.
      // STANDING stays an environment variable in the PASS-THROUGH spelling — no `=`, so its
      // value comes from the unit's own environment and never from this line.
      '-e STANDING',
      '--log-driver json-file',
      '--log-opt max-size=10m',
      '--log-opt max-file=3',
      'ai-dashboard:latest',
    ]) {
      expect(cmd).toContain(flag);
    }
    // ⚠ EXACT ARGUMENT VALUES, not substrings. `--name ai-dashboard` is a PREFIX of
    // `--name ai-dashboard2`, so renaming the container — away from the name `check`,
    // `ExecStartPre` and `ExecStopPost` all use — satisfied `toContain` (11-A1, X59). The
    // same for `--env-file`, which could be pointed at `…env.bak` unnoticed (X56).
    const argv = cmd.split(' ');
    const valueOf = (flag: string): string | undefined => argv[argv.indexOf(flag) + 1];
    expect(valueOf('--name')).toBe('ai-dashboard');
    expect(argv[argv.length - 1]).toBe('ai-dashboard:latest');
    // ⚠ And the secrets are NOT here in any spelling. `--env-file` is the one that shipped;
    // `-e PASSWORD_HASH=…` is the one someone reaches for when they undo the ruling by hand.
    expect(cmd).not.toContain('--env-file');
    expect(cmd).not.toContain('PASSWORD_HASH');
    expect(cmd).not.toContain('SESSION_SECRET');
    // The pass-through spelling, exactly: `-e STANDING=` would be a value baked into the unit.
    expect(valueOf('-e STANDING'.split(' ')[0] as string)).toBe('NVIDIA_DRIVER_CAPABILITIES=utility');
    expect(argv.filter((a) => a === 'STANDING')).toEqual(['STANDING']);
    // …and the name in ExecStart is the one every other line uses, including the script's.
    for (const line of ['ExecStartPre=-/usr/bin/docker rm -f ai-dashboard',
                        'ExecStopPost=-/usr/bin/docker rm -f ai-dashboard']) {
      expect(unitCode()).toContain(line);
    }
    expect(DASHBOARD_SH).toContain('CONTAINER="${CONTAINER:-ai-dashboard}"');
    // ⚠ systemd owns restarts. A Docker restart policy would fight it and restart outside
    // its control — and §2.5 forbids a HEALTHCHECK that restarts for the same reason.
    expect(cmd).not.toContain('--restart');
    // ⚠⚠ ALWAYS, not on-failure — INSTALL-SPEC §11.2's ruling of 2026-09-11 (11-Q1). `docker
    // run` exits with the CONTAINER's status and Next's standalone server handles SIGTERM and
    // exits 0, so a `docker stop` left the unit `inactive (dead)` with `Result=success` and
    // systemd did not bring the monitor back.
    expect(unitCode()).toContain('Restart=always');
    expect(unitCode()).not.toContain('Restart=on-failure');
    expect(unitCode()).toContain('RestartSec=10');
    // A stale container cannot block a restart, and cannot become a second instance.
    expect(unitCode()).toContain('ExecStartPre=-/usr/bin/docker rm -f ai-dashboard');
  });

  test('⚠ every §2.2 mount is present, read-only, and mounted where the collectors look', () => {
    const cmd = execStart();
    // ⚠ `/host/root` and `/host/home` are not decoration: `statvfs('/')` INSIDE a container
    // measures the container's own overlay — a plausible-looking number about the wrong
    // filesystem. The first deploy found exactly that (FIRST-DEPLOY §4).
    for (const mount of [
      // ⚠ The credentials, MOUNTED rather than exported — SPEC §5.1's ruling of 2026-09-11.
      // Read-only, at the same path inside the container, which is the path
      // `lib/auth/secret-file.ts` reads.
      '-v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro',
      '-v /sys:/sys:ro',
      '-v /:/host/root:ro',
      '-v /home:/host/home:ro',
      '-v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro',
      '-v /etc/llama-server:/etc/llama-server:ro',
      '-v /etc/ufw/ufw.conf:/etc/ufw/ufw.conf:ro',
      '-v /lib/modules:/lib/modules:ro',
      '-v /etc/hostname:/etc/hostname:ro',
    ]) {
      expect(cmd).toContain(mount);
    }
    // Invariant 2: nothing writes to the server. Every mount is :ro, and there are no others.
    const mounts = cmd.match(/-v \S+/g) ?? [];
    expect(mounts).toHaveLength(9);
    expect(mounts.filter((m) => m.endsWith(':ro'))).toHaveLength(9);
  });
});

describe('⚠⚠ the three rulings of 2026-09-11 — mounted secrets, Restart=always, drift', () => {
  test('⚠ the credentials reach the container as a read-only MOUNT and in no other way', () => {
    // SPEC §5.1 (11-Q2). `--env-file` copied both secrets into the container's environment,
    // where `docker inspect` shows them to every member of the docker group and
    // /proc/1/environ shows them to root. The same trade `serve-llm.sh` already refuses with
    // `--api-key-file, never --api-key`.
    const cmd = execStart();
    expect(cmd).toContain('-v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro');
    expect(cmd).not.toContain('--env-file');
    // …and the server reads it at the path it is mounted at, from one spelling.
    expect(read('lib/auth/secret-file.ts')).toContain(
      "export const SECRET_ENV_FILE = '/etc/ai-dashboard.env'",
    );
    // ⚠ The mount is READ-ONLY. A writable mount would let a compromised container rewrite
    // the hash it authenticates against, and invariant 2 says nothing writes to the server.
    const bind = (cmd.match(/-v \/etc\/ai-dashboard\.env:\S+/) ?? [''])[0];
    expect(bind.endsWith(':ro')).toBe(true);
  });

  test('⚠ a second ExecStartPre lifts STANDING out of the file, and lifts nothing else', () => {
    // ⚠ §6.4's list is configuration rather than a secret and stays an environment variable,
    // so it has to get out of the credentials file somehow. `grep` emits at most that one
    // line: the hash and the secret never enter this unit's environment, which is what keeps
    // them out of `docker inspect` and out of the docker client's /proc/<pid>/environ.
    const pre = unitCode()
      .split('\n')
      .filter((l) => l.startsWith('ExecStartPre='));
    const standing = pre.filter((l) => l.includes('STANDING'));
    expect(standing).toHaveLength(1);
    expect(standing[0]).toContain('grep -E "^STANDING="');
    // ⚠ Docker's own rule for a repeated key, kept so that lifting the value out cannot
    // change which one wins — `env_get` grew a `tail -1` for the same fact.
    expect(standing[0]).toContain('tail -n 1');
    // ⚠ grep exits 1 on no match, and an operator with nothing standing is the ordinary case.
    expect(standing[0]).toContain('|| true');
    expect(unitCode()).toContain('EnvironmentFile=-/run/ai-dashboard-standing.env');
    // Nothing in this unit may read the two secrets out of the file.
    expect(unitCode()).not.toContain('PASSWORD_HASH');
    expect(unitCode()).not.toContain('SESSION_SECRET');
  });

  test('⚠ Restart=always is bounded by StartLimit, and neither cleanup can feed the loop', () => {
    // INSTALL-SPEC §11.2 (11-Q1): `docker stop` exits 0, so `on-failure` left the monitor
    // down until a human noticed. ⚠ The thing to check about `always` is that it cannot spin:
    expect(unitCode()).toContain('Restart=always');
    expect(sectionOf('StartLimitIntervalSec')).toBe('Unit');
    expect(sectionOf('StartLimitBurst')).toBe('Unit');
    // Both cleanups are `-` prefixed, so neither a failing `docker rm` on the way in nor one
    // on the way out can fail a start — the loop has no engine of its own.
    for (const l of ['ExecStartPre=-/usr/bin/docker rm -f ai-dashboard',
                     'ExecStopPost=-/usr/bin/docker rm -f ai-dashboard']) {
      expect(unitCode()).toContain(l);
    }
    // ⚠ And there is still no Docker restart policy: two restart owners is the thing
    // `Restart=` may not become.
    expect(execStart()).not.toContain('--restart');
  });

  test('⚠ check_drift derives every expectation from the unit file and retypes no flag', () => {
    // ⚠ INSTALL-SPEC §11.2 (11-Q3) asks for exactly this: "Derive the expectation from the
    // unit file itself rather than retyping the flags — two producers of one list is the
    // shape this project has been bitten by repeatedly." A hand-written list here would go
    // stale on the next unit edit, which is the moment the row exists for.
    const body = functionBody('check_drift');
    expect(body).toContain('unit_exec_start "$UNIT_PATH"');
    for (const call of ['unit_flag_value "$cmd" --name', 'unit_flag_value "$cmd" --network',
                        'unit_flag_values "$cmd" -v --volume', 'unit_flag_values "$cmd" -p --publish']) {
      expect(body).toContain(call);
    }
    // Nothing the unit says is repeated here — not a mount, not the network mode, not a port.
    for (const retyped of ['/sys:/sys:ro', '/host/root', 'ai-dashboard:latest', '8090']) {
      expect(body, retyped).not.toContain(retyped);
    }
    // ⚠ …and the one flag deliberately NOT compared is the GPU one, which has its own
    // three-state row: a fallback start is legitimate, and reporting it as drift would be a
    // refusal firing on a correct configuration.
    expect(body).not.toContain('--gpus');
  });

  test('⚠ nothing in the auth path reads the two secrets from process.env any more', () => {
    // ⚠ The call-site assertion, in the direction that matters: a composition root put back
    // on `process.env` would undo the whole ruling and every test above would still pass,
    // because each of them measures one artefact rather than the wiring between them.
    for (const file of ['lib/auth/authorize.ts', 'lib/auth/handler.ts', 'proxy.ts']) {
      const code = read(file)
        .split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
        .join('\n');
      expect(code, file).toContain('credentialEnvironment()');
      expect(code, file).not.toContain('env: process.env');
      expect(code, file).not.toContain('readAuthConfig(process.env)');
    }
    // …and the one module that DOES read process.env still does: STANDING is configuration.
    expect(read('lib/telemetry/source.ts')).toContain('env = process.env');
  });
});

// ---------------------------------------------------------------------------------------
// The Dockerfile and .dockerignore
// ---------------------------------------------------------------------------------------

/**
 * The Dockerfile's uncommented body, so a directive QUOTED IN A COMMENT cannot answer for
 * one.
 *
 * ⚠ Measured 2026-09-10: `--shell /usr/sbin/nologin` appears twice — once in the `useradd`
 * and once in the comment explaining why it is there — and dropping it from the `useradd`
 * left all 31 tests green. §2.5's "no shell" half was certified by prose. The unit already
 * had `unitCode()` for exactly this; the Dockerfile did not (`11-D5`).
 */
const dockerfileCode = (): string =>
  DOCKERFILE.split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

describe('⚠ the image', () => {
  test('⚠ both stages are node:24-slim and the runtime stage runs as 10001 with no shell', () => {
    const froms = dockerfileCode().match(/^FROM \S+/gm) ?? [];
    expect(froms).toEqual(['FROM node:24-slim', 'FROM node:24-slim']);
    expect(dockerfileCode()).toContain('USER 10001:10001');
    expect(dockerfileCode()).toContain('--shell /usr/sbin/nologin');
    // §2.5: no HEALTHCHECK that restarts the container.
    expect(dockerfileCode()).toContain('HEALTHCHECK NONE');
  });

  test('⚠ .next/static is copied into the standalone tree, which Next does not do itself', () => {
    // Without it every stylesheet and client chunk 404s and the page renders unstyled, with
    // nothing in the server log. HANDOVER §10, learned on the first deploy.
    expect(dockerfileCode()).toContain('COPY --from=build /app/.next/standalone ./');
    expect(dockerfileCode()).toContain('COPY --from=build /app/.next/static ./.next/static');
  });

  test('⚠ HOSTNAME is pinned to 0.0.0.0, which is a bind address and not a name', () => {
    // Next's standalone server reads `process.env.HOSTNAME || '0.0.0.0'`. A container that
    // inherits HOSTNAME=ai-server binds 127.0.1.1, logs its usual "Ready" line, and answers
    // nobody on the LAN.
    expect(dockerfileCode()).toMatch(/HOSTNAME=0\.0\.0\.0/);
    expect(dockerfileCode()).toMatch(/PORT=8090/);
  });

  test('⚠ public/ does not exist — and if it ever does, the Dockerfile must copy it', () => {
    // The same silent 404 as .next/static, one directory over. This is the guard for a
    // directory that does not exist yet, which is the only moment it can be written.
    if (existsSync(join(projectRoot, 'public'))) {
      expect(dockerfileCode()).toContain('/app/public');
    } else {
      expect(dockerfileCode()).not.toContain('COPY --from=build /app/public');
    }
  });

  test('⚠ the build stage is reproducible and the runtime stage is production', () => {
    // ⚠ Three unasserted lines, each of which changes what ships (X47, X50, X51).
    // `--frozen-lockfile` is what the Dockerfile's own comment calls load-bearing: the
    // lockfile carries every linux/x64 variant, and resolving freely on the box is how a
    // build stops being the thing that was tested.
    expect(dockerfileCode()).toContain('pnpm install --frozen-lockfile');
    expect(dockerfileCode()).toMatch(/^ENV NODE_ENV=production/m);
    // The build stage copies the whole (already filtered) context; narrowing it silently
    // drops whatever is not enumerated, and `next build` says nothing about a missing page.
    expect(dockerfileCode()).toMatch(/^COPY \. \.$/m);
  });

  test('⚠ .dockerignore keeps the test files and every credential out of the context', () => {
    // INSTALL-SPEC §11.2. `next build` type-checks everything tsconfig's `include` matches,
    // and every test file imports vitest; and a build context is uploaded whole to the
    // daemon, so anything secret in it is in the finished image.
    const patterns = DOCKERIGNORE.split('\n').map((line) => line.trim());
    for (const pattern of [
      'node_modules',
      '.next',
      'out',
      '**/*.test.ts',
      '**/*.test.tsx',
      '.env',
      'scripts',
      // ⚠ The pipeline and the spec are not "documents that would only make it bigger": the
      // context is uploaded whole to the daemon and cached on the box (X54).
      'pipeline',
      'SPEC.md',
      // ⚠ THE TWINS. Patterns are root-relative with `filepath.Match` semantics, so a bare
      // `.env` matches `./.env` and NOTHING else — and the credentials section was the one
      // section of this file without the `**/` twin its own header comment explains
      // (11-A15). `app/.env.local` or `lib/.env` would have gone to the daemon.
      '**/.env',
      '**/.env.*',
      '**/*.apikey',
    ]) {
      expect(patterns).toContain(pattern);
    }
  });

  test('⚠ the runtime dependencies are exactly next, react and react-dom', () => {
    // Invariant 6: no dependency without a recorded reason, and step 11 adds none. Anything
    // listed here is traced into `.next/standalone` and ships to the box.
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(['next', 'react', 'react-dom']);
  });
});

// ---------------------------------------------------------------------------------------
// dashboard.sh's own conventions
// ---------------------------------------------------------------------------------------

interface ScriptRun {
  readonly status: number;
  readonly out: string;
}

/** Output with the colour escapes removed, so an assertion can name a whole line. */
const plain = (out: string): string => out.replace(/\u001b\[[0-9;]*m/g, '');

/** Run the real script, capturing stdout and stderr together with the exit code. */
const runScript = (
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): ScriptRun => {
  try {
    const out = execFileSync('bash', [join(projectRoot, 'dashboard.sh'), ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SRC: projectRoot, ...env },
    });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

describe('⚠ dashboard.sh', () => {
  test('⚠ usage() re-reads the header comment, and its line range still covers all of it', () => {
    // The repo convention is that the help text and the comment at the top are one text. A
    // range that drifts truncates the help silently: the header stays correct and the
    // operator simply stops seeing the end of it.
    const range = /sed -n '(\d+),(\d+)p' "\$0"/.exec(DASHBOARD_SH);
    expect(range).not.toBeNull();
    const [, fromRaw, toRaw] = range as RegExpExecArray;
    const lines = DASHBOARD_SH.split('\n');
    const from = Number(fromRaw);
    const to = Number(toRaw);

    // Every line in the range is header comment…
    for (let i = from; i <= to; i += 1) {
      expect(lines[i - 1]).toMatch(/^#/);
    }
    // …and the range reaches the end of it. The first non-comment line is `set -euo
    // pipefail`, and at most the header's own closing `#` sits between it and the range.
    const firstCode = lines.findIndex((line, i) => i >= 2 && !line.startsWith('#'));
    expect(lines[firstCode]).toBe('set -euo pipefail');
    expect(firstCode + 1).toBeLessThanOrEqual(to + 2);

    const help = runScript(['--help']);
    expect(help.status).toBe(0);
    expect(help.out).toContain('./dashboard.sh check');
    expect(help.out).toContain('--dry-run');
  });

  test('⚠ every subcommand takes --dry-run, and afterwards nothing on this host was written', () => {
    const subcommands = [
      'deps',
      'build',
      'install',
      'set-password',
      'configure',
      'unit',
      'firewall',
      'start',
      'check',
      'status',
      'logs',
      'restart',
      'uninstall',
    ];
    // ⚠ THIRTEEN, which is every row of `usage()`'s own list. `install` was missing from
    // this array until 2026-09-10 while the name said "every subcommand" — the orchestrator
    // is the one whose dry run has to be a complete account, so it is the one that most
    // needed to be here.
    expect(subcommands).toHaveLength(13);
    const help = runScript(['--help']).out;
    for (const cmd of subcommands) {
      expect(help).toContain(`./dashboard.sh ${cmd}`);
    }
    // ⚠ Existence BEFORE and AFTER, not absence: this same assertion has to stay true on a
    // box where the deployment is installed, and `expect(...).toBe(false)` would turn a
    // correct deployment into a failing suite.
    const touched = ['/etc/ai-dashboard.env', '/etc/systemd/system/ai-dashboard.service'];
    const before = touched.map(existsSync);

    const rejected = subcommands.filter((cmd) =>
      runScript([cmd, '--dry-run']).out.includes('unknown option'),
    );
    expect(rejected).toEqual([]);
    // Every subcommand ran to a verdict rather than falling over on an unknown command.
    const unknown = subcommands.filter((cmd) =>
      runScript([cmd, '--dry-run']).out.includes('unknown command'),
    );
    expect(unknown).toEqual([]);
    expect(touched.map(existsSync)).toEqual(before);
  });

  test('⚠ configure --dry-run announces the write it did not make, and makes none', () => {
    const envFile = join(projectRoot, 'node_modules/.dashboard-sh-test.env');
    const result = runScript(['configure', '--dry-run'], { ENV_FILE: envFile });
    expect(result.out).toContain('would write STANDING=');
    expect(result.out).toContain('would generate 32 random bytes');
    // ⚠ A tick after a write that did not happen is the one thing a review surface must
    // never print, so `ok_done` stays silent under --dry-run.
    expect(result.out).not.toContain('STANDING= written');
    expect(existsSync(envFile)).toBe(false);
  });

  test('⚠ a dry run announces the backup of the env file a real run would rewrite', () => {
    // ⚠ INSTALL-SPEC §6 requires a timestamped 0600 copy into /root before any rewrite, and
    // §1 requires `--dry-run` to be a complete account of what the real run does. It was
    // not: `backup_env` sat BELOW `env_set`'s dry-run return, so its own `would copy …`
    // line was unreachable and a write into /root went unmentioned on the surface an
    // operator reads first. Fixed 2026-09-10; `11-N3` puts it back.
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-sh-'));
    try {
      const file = join(dir, 'ai-dashboard.env');
      writeFileSync(file, 'PASSWORD_HASH=x\n');
      const result = runScript(['configure', '--dry-run'], { ENV_FILE: file, BACKUP_DIR: dir });
      expect(result.out).toContain(`would copy ${file} -> ${dir}/ai-dashboard.env.bak.`);
      expect(result.out).toContain('(mode 0600)');
      // ⚠ …and the write itself, with its file and mode. The SESSION_SECRET branch used to
      // print one sentence and skip `env_set` entirely, so the one branch that rewrites a
      // live credentials file was the one whose dry run said least about it.
      expect(result.out).toContain('would write SESSION_SECRET=<64 characters, not printed>');
      // …and it is still a dry run.
      expect(readFileSync(file, 'utf8')).toBe('PASSWORD_HASH=x\n');
      expect(existsSync(join(dir, 'ai-dashboard.env.bak'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ a preflight refusal under --dry-run is printed AND exits non-zero', () => {
    // A dry run that printed WOULD REFUSE and exited 0 would be a green tick over a failure
    // — the shape of `systemctl is-active ufw` reading green on a disabled firewall.
    //
    // ⚠ `OS_RELEASE=/dev/null` is what makes this an assertion about the ARTEFACT. It used
    // to rely on the machine running the suite not being Ubuntu and not being root (11-A18a)
    // — so on the box, as root, with everything healthy, `install --dry-run` would refuse
    // nothing and this test would fail for a reason that is not a defect.
    const result = runScript(['install', '--dry-run'], { OS_RELEASE: '/dev/null' });
    expect(result.out).toContain('WOULD REFUSE');
    expect(result.out).toContain('needs Ubuntu 24.04 or newer');
    expect(result.status).not.toBe(0);
    // …and the closing line counts what it says it counts. It said "5 preflight refusal(s)"
    // for three preflight refusals plus one from `firewall` and one from `start` (11-A9).
    expect(plain(result.out)).toMatch(/\d+ refusal\(s\) above; a real run stops at the FIRST one/);
  });

  test('⚠ the script never sources the env file, and never puts a password in argv', () => {
    // A sourced env file expands `$`; an argument lands in shell history and in `ps`. Both
    // are §5.1's own reasoning behind --api-key-file rather than --api-key. `printf` is a
    // bash BUILTIN, so the password never becomes an argv of an external process.
    // ⚠ The leading `(` alternative is not padding: `( . "$ENV_FILE"; … )` is the spelling
    // someone reaches for precisely BECAUSE it looks contained, and a `^\s*` anchor cannot
    // see it. A source-text guard is only ever as wide as the spellings it enumerates —
    // `11-C2` in this step's harness is the measurement that it sees this one.
    // ⚠ `\${ENV_FILE}` as well as `$ENV_FILE`: the braced spelling is the one an editor's
    // own completion writes, and the guard could not see it until 2026-09-10 (`11-C3`).
    expect(DASHBOARD_SH).not.toMatch(/(^|[\s(])(\.|source)\s+"?\$\{?ENV_FILE/m);
    expect(DASHBOARD_SH).toContain('IFS= read -rs PW1');
    expect(DASHBOARD_SH).toContain('printf \'%s\' "$PW1" | python3');
  });
});
