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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { readAuthConfig, MIN_SESSION_SECRET_CHARS } from '@/lib/auth/config';
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
   * ⚠ The measurement that says why this check has to exist at all: the server CANNOT see
   * the defect. A quoted 32-character secret is a 34-character secret to Docker, it clears
   * `readAuthConfig`'s floor, and it works — until the next person writes the file without
   * the quotes and every open session dies.
   */
  test('⚠ a quoted secret passes readAuthConfig and is caught only here', () => {
    const quoted = `"${'a'.repeat(MIN_SESSION_SECRET_CHARS)}"`;
    expect(readAuthConfig({ PASSWORD_HASH: 'x', SESSION_SECRET: quoted })).not.toBeNull();
    expect(quoted.length).toBe(MIN_SESSION_SECRET_CHARS + 2);

    const [message] = validate('env_value_error', [quoted]);
    expect(message).toContain('does not strip quotes');
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

    const clean = checkRow('check_session_secret', `SESSION_SECRET=${HEX64}\n`);
    expect(clean.failed).toBe(0);
    expect(clean.out).toContain('64 characters, unquoted, single-line');
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
  test('⚠ the body of cmd_check calls exactly the eleven rows, in order and with nothing else', () => {
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
  'have() { case "$1" in docker|ss|curl|ufw|python3) return 0 ;; *) return 1 ;; esac; }',
  'docker_ok() { return 0; }',
  'docker() {',
  '  case "$*" in',
  '    ps*name=*)               emit "$D_NAMED" ;;',
  '    ps*ancestor=*)           emit "$D_BYID" ;;',
  '    "ps --format"*)          emit "$D_PS" ;;',
  '    top*)                    emit "$D_TOP" ;;',
  '    "image inspect"*)        emit "$D_LATEST" ;;',
  '    inspect*DeviceRequests*) emit "$D_DEVREQ" ;;',
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
  'env_file_stat() { printf "%s" "${FILE_STAT-600 root:root}"; }',
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
      verdict: 'fail', env: { FILE_STAT: '644 alice:staff' }, says: 'expected root:root 600' },
    { guard: 'mode/owner', row: 'check_env_file', what: 'root:root 0600', verdict: 'pass',
      envFile: `SESSION_SECRET=${HEX64_SECRET}\n` },
    { guard: 'unreadable', row: 'check_env_file', what: 'a file this user cannot read',
      verdict: 'unknown', env: { READABLE: 'no' }, says: 're-run with sudo' },
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
      verdict: 'pass' },
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
      expect(readFileSync(file, 'utf8')).toBe('PASSWORD_HASH=x\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('⚠ the credentials file and every backup of it are 0600, and the rewrite is atomic', () => {
    // ⚠ `-m 0600` -> `-m 0644` on either writer was green: the mode of the file carrying the
    // password hash was unmeasurable off the box, because `install -o root` fails for a
    // non-root caller and no test could reach the real write path (X37, X38).
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
      expect(result.out).toContain('MODE=600');
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
      '--env-file /etc/ai-dashboard.env',
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
    expect(valueOf('--env-file')).toBe('/etc/ai-dashboard.env');
    expect(argv[argv.length - 1]).toBe('ai-dashboard:latest');
    // …and the name in ExecStart is the one every other line uses, including the script's.
    for (const line of ['ExecStartPre=-/usr/bin/docker rm -f ai-dashboard',
                        'ExecStopPost=-/usr/bin/docker rm -f ai-dashboard']) {
      expect(unitCode()).toContain(line);
    }
    expect(DASHBOARD_SH).toContain('CONTAINER="${CONTAINER:-ai-dashboard}"');
    // ⚠ systemd owns restarts. A Docker restart policy would fight it and restart outside
    // its control — and §2.5 forbids a HEALTHCHECK that restarts for the same reason.
    expect(cmd).not.toContain('--restart');
    expect(unitCode()).toContain('Restart=on-failure');
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
    expect(mounts).toHaveLength(8);
    expect(mounts.filter((m) => m.endsWith(':ro'))).toHaveLength(8);
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
