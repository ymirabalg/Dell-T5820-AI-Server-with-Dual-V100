/**
 * `/etc/ai-dashboard.env`, read **by the server** — SPEC.md §5.1's ⚠⚠ ruling of 2026-09-11
 * (`11-Q2`), INSTALL-SPEC.md §11.2.
 *
 * ---
 *
 * ### ⚠ This IS the third parser `config.ts` said would not be written
 *
 * `lib/auth/config.ts`'s header used to close HANDOVER §7's open question with *"the
 * dashboard reads neither grammar — Docker parses the file and the values arrive in
 * `process.env`. **A third parser is not written.**"* That reasoning was correct for what it
 * weighed and it has been **overturned by the owner on a threat it did not weigh**:
 * `--env-file` copies both secrets into the container's environment, where `docker inspect`
 * shows them to every member of the `docker` group and `/proc/1/environ` to root. This repo
 * already refuses that trade one directory up — `serve-llm.sh` uses `--api-key-file`, never
 * `--api-key`, so a key never appears in `ps`.
 *
 * So the file is now **bind-mounted read-only** and parsed here, and the parser is written
 * deliberately rather than by accident. `STANDING` is NOT read here: it is configuration
 * rather than a secret, it stays an environment variable, and `lib/telemetry/source.ts` goes
 * on reading it from `process.env`.
 *
 * ### ⚠⚠ THE RULE THIS MODULE IS HELD TO: stricter than Docker's grammar, NEVER looser
 *
 * Docker's `--env-file` grammar (`opts.parseKeyValueFile`): it strips a UTF-8 BOM from the
 * first line, trims **leading** whitespace from every line, skips blank lines and lines whose
 * first non-blank character is `#`, splits the rest on the **first** `=`, refuses a key
 * containing whitespace, takes the rest of the line **verbatim** — quotes kept, nothing
 * expanded, trailing whitespace kept — and treats a line with **no** `=` as *take this
 * variable from the host's environment*. `bufio.Scanner` drops a trailing `\r`, so CRLF is
 * tolerated. Invalid UTF-8 is an error. **And a line longer than `bufio.MaxScanTokenSize`
 * (64 KiB) is an error** — see {@link MAX_LINE_BYTES}.
 *
 * Every rule below either **refuses something Docker accepts** or refuses exactly what Docker
 * refuses. Nothing here accepts a file Docker would reject, and nothing here yields a
 * *different value* than Docker would for a file both accept. That property is fixtured in
 * both directions in `secret-file.test.ts` against a model of Docker's own rules, because
 * "stricter, never looser" has already been **falsified twice by measurement in this
 * project** — the `awk -v` escape that made D8's judge looser, and the twelve Unicode spaces
 * JavaScript trims and `[[:space:]]` under `LC_ALL=C` does not.
 *
 * ⚠⚠ **And a THIRD time, 2026-09-11, by the test phase** — which is why the shapes are now
 * **generated** rather than listed. A hand-written table of 26 shapes cannot falsify its own
 * property: it only ever asks about the 26 things whoever wrote it already thought of. Driving
 * every ASCII code point, every Unicode space and format character, and the structural shapes
 * (`export KEY=`, a NUL byte, no trailing newline, a duplicate whose second spelling is valid,
 * a very long line) through both sides found **one** shape on which this reader was the more
 * permissive: a line past 64 KiB, which `parseKeyValueFile`'s own package comment documents as
 * an error and which nothing here bounded. {@link MAX_LINE_BYTES} is that bound.
 *
 * ### ⚠ What this buys: O21 stops being a silent failure
 *
 * O21's hazard was that Docker keeps quotes, so `SESSION_SECRET="…32 chars…"` passes
 * {@link MIN_SESSION_SECRET_CHARS} as a *different* secret, serves a working dashboard, and
 * kills every open session the moment anyone rewrites the file unquoted. Nothing logs it,
 * because §5 logs nothing about authentication. Here it is a **startup refusal naming the key
 * and the reason** — and never the value.
 *
 * ### ⚠ Nothing in this module ever prints a value
 *
 * A refusal carries a key, a line number and a reason. **Never the value and never the
 * line** — 11-A6 is the precedent: a row that printed `${line%%[!A-Za-z0-9_]*}…` put a whole
 * 64-character `SESSION_SECRET` on the terminal followed by an ellipsis implying it had been
 * truncated. Even the "outside printable ASCII" reason names the *class* rather than the code
 * point, because one code point of a secret is still one code point of a secret.
 *
 * ⚠⚠ **The one thing a refusal can print that came off the line is a bad KEY, and the
 * sentence here used to claim otherwise** — *"not a prefix of either, and not a character of
 * either"* — which 11b-A12 measured false on 2026-09-11. A hard-wrapped secret whose tail
 * carries an `=` puts a fragment of the **value** in key position, and {@link namedKey} then
 * prints it. The absolute is now the true one: what can be printed is bounded by
 * {@link MAX_NAMED_KEY_CHARS}, one character below the shortest `SESSION_SECRET` this build
 * accepts, **so a printed key can never be a whole secret of this build's**. It can still be
 * a fragment of a longer one; that is stated rather than claimed away, and the line number
 * is what finds the line anyway.
 */

import { MIN_SESSION_SECRET_CHARS, PASSWORD_HASH_KEY, SESSION_SECRET_KEY } from './config';
import type { Environment } from './config';

/** Where the file is mounted in the container. §5, §7: `root:10001 0640`, bind-mounted `:ro`. */
export const SECRET_ENV_FILE = '/etc/ai-dashboard.env';

/** The two keys this reader is responsible for, and the only two it returns. */
export const SECRET_KEYS = [PASSWORD_HASH_KEY, SESSION_SECRET_KEY] as const;

/**
 * The longest line this reader will look at, in BYTES.
 *
 * ⚠⚠ **The one place a generated shape caught this reader being LOOSER than Docker**
 * (2026-09-11, the test phase). `parseKeyValueFile` reads with a default `bufio.Scanner`, and
 * the package's own comment says so out loud: *"Maximum line-length is limited to
 * [bufio.MaxScanTokenSize]"* — 64 KiB. Past that the scanner stops, `parseKeyValueFile`
 * returns `scanner.Err()`, and `docker run --env-file` **refuses the whole file**. Nothing
 * here bounded the line at all, so a 70 KiB `SESSION_SECRET=` line — or a 70 KiB comment, or a
 * 70 KiB `STANDING=` — was a file this server would start on and Docker would not.
 *
 * ⚠⚠ **Compared with `>=`, and that is EXACTLY Docker rather than one byte tighter than it.**
 * This paragraph used to say the boundary *"depends on how its buffer grows, so the bound is
 * taken one byte tighter than the most permissive reading of it"*. Read against `bufio`'s own
 * source (11b-A10, 2026-09-11), it does not depend on anything: `scan.go` caps the buffer at
 * `newSize = min(newSize, s.maxTokenSize)` and then gives up on
 * `len(s.buf) >= s.maxTokenSize`, so a line of **65536 bytes or more** is `ErrTooLong` and a
 * line of 65535 plus its `\n` is fine. The boundary is determinate and this is on it. The
 * *model* in `secret-file.test.ts` was the loose one — it refused at `> 65536`, one byte more
 * permissive than the real scanner, so exactly-65536 read as "Docker takes it, we refuse"
 * when in truth both refuse. Fixed there; recorded here because this is where the claim was.
 *
 * ⚠ BYTES, not characters, because that is what `bufio` counts — measured on the undecoded
 * `Uint8Array` before anything is turned into a string.
 */
export const MAX_LINE_BYTES = 64 * 1024;

/**
 * One reason the file was refused.
 *
 * `key` is `''` for a problem with the file as a whole. `line` is 1-based, or `null` when the
 * problem is not about one line (a missing key).
 */
export interface SecretRefusal {
  readonly key: string;
  readonly line: number | null;
  readonly reason: string;
}

/** Accepted: exactly the two secrets. Refused: every reason, so one run names them all. */
export type SecretFileVerdict =
  | { readonly ok: true; readonly env: Environment }
  | { readonly ok: false; readonly refusals: readonly SecretRefusal[] };

/**
 * Why `value` is not a usable secret, or `null` if it is.
 *
 * ⚠ **This function is spelled twice** — here and as `secret_value_error` in `dashboard.sh`,
 * where `check` and `configure` use it — and the two are asserted **equal message for message
 * over a fixture table** in `packaging.test.ts`. Two implementations of one format is the
 * shape on HANDOVER's do-not-copy list; a cross-check that runs the real other side is how
 * this repo pays for the one it already has (`scripts/hash-password.py`, §5). **The order of
 * the tests below is part of the contract**, because the message is.
 *
 * ⚠ The first six reasons are `env_value_error`'s own words, unchanged: `dashboard.sh`
 * refuses these at WRITE time so `configure` cannot produce a file the server then refuses to
 * start on. The last three are this reader being stricter than the writer, in the only
 * direction that is safe — a value the writer would have written and this refuses is a loud
 * startup failure, never a login that silently denies.
 */
export const secretValueError = (value: string): string | null => {
  if (value === '') return 'is empty';
  if (value.includes('\n') || value.includes('\r')) {
    return 'contains a line break — Docker reads one line per key';
  }
  if (value.includes('"')) {
    return 'contains a double quote. --env-file does not strip quotes: the value would include it';
  }
  if (value.includes("'")) {
    return 'contains a single quote. --env-file does not strip quotes: the value would include it';
  }
  if (value.includes('$')) {
    return 'contains a $, which a shell that ever sourced this file would expand';
  }
  if (value.includes('`')) {
    return 'contains a backtick, which a shell that ever sourced this file would EXECUTE';
  }
  if (value.startsWith(' ') || value.startsWith('\t')) {
    return 'has leading whitespace, which Docker keeps';
  }
  if (value.endsWith(' ') || value.endsWith('\t')) {
    return 'has trailing whitespace, which Docker keeps';
  }
  if (value.includes('\\')) {
    return 'contains a backslash, which systemd and a sourcing shell both read as an escape';
  }
  if (value.includes('#')) {
    return "contains a '#', which several .env readers take as a comment and Docker does not";
  }
  // ⚠ LAST, because every reason above is a special case of it with a better message. A
  // code-point range, not `.trim()` and not a whitespace class: U+00A0 and the eleven other
  // spaces JavaScript trims are outside this range, and so is U+200B, which `trim()` does
  // NOT remove (HANDOVER §0.12 — U+200B is `Cf`, not whitespace). The class is named and the
  // character is not, because one code point of a secret is still one code point of a secret.
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x21 || cp > 0x7e) {
      return 'contains a character outside printable ASCII (a space, a tab, a non-breaking ' +
        'space, a zero-width character or any non-ASCII character — not printed)';
    }
  }
  return null;
};

/** `bytes` as UTF-8, or `null` if they are not valid UTF-8 — which Docker also refuses. */
const decodeStrictUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * The longest bad key a refusal will print.
 *
 * ⚠⚠ **Strictly shorter than {@link MIN_SESSION_SECRET_CHARS}, and derived from it** —
 * 11b-A12, 2026-09-11. The bound used to be 32, which *is* the floor, so a `SESSION_SECRET`
 * written at exactly the minimum length could reach the terminal **whole** from key position:
 * a hard-wrapped secret whose tail carries an `=` puts a fragment of the value where the key
 * goes, and the rule that prints the key does not know the difference. One character under
 * the floor is the bound at which a printed key cannot be a whole secret of this build's.
 * `dashboard.sh` derives the same number from `MIN_SECRET_CHARS`, and neither retypes it.
 */
export const MAX_NAMED_KEY_CHARS = MIN_SESSION_SECRET_CHARS - 1;

/** A key short enough that printing it cannot be printing a whole secret. */
const namedKey = (key: string): string =>
  new RegExp(`^[\\x21-\\x7e]{1,${MAX_NAMED_KEY_CHARS}}$`).test(key)
    ? `'${key}'`
    : `a ${key.length}-character key (not printed)`;

/**
 * Parse the mounted file. **Bytes, not a string** — `readFileSync(path, 'utf8')` replaces an
 * invalid sequence with U+FFFD, which would make this reader *accept* a file Docker refuses,
 * and "never looser" is the whole rule.
 */
export const parseSecretEnvFile = (bytes: Uint8Array): SecretFileVerdict => {
  const refusals: SecretRefusal[] = [];
  const refuse = (key: string, line: number | null, reason: string): void => {
    refusals.push({ key, line, reason });
  };

  // ⚠ BEFORE the decode, because `bufio` counts bytes. A line past this is a file
  // `docker run --env-file` refuses outright, and until 2026-09-11 it was the one shape on
  // which this reader was the MORE PERMISSIVE of the two. See {@link MAX_LINE_BYTES}.
  let lineStart = 0;
  let byteLine = 1;
  for (let i = 0; i <= bytes.length; i += 1) {
    if (i === bytes.length || bytes[i] === 0x0a) {
      if (i - lineStart >= MAX_LINE_BYTES) {
        refuse('', byteLine, `is ${i - lineStart} bytes long, past the ${MAX_LINE_BYTES}-byte ` +
          "line limit Docker's own scanner refuses the whole file on (not printed)");
      }
      lineStart = i + 1;
      byteLine += 1;
    }
  }

  const text = decodeStrictUtf8(bytes);
  if (text === null) {
    return {
      ok: false,
      refusals: [{ key: '', line: null, reason: 'is not valid UTF-8, which Docker also refuses' }],
    };
  }
  // ⚠ ANYWHERE, not just at the start. Docker strips a leading BOM and would then read the
  // rest happily; an editor that writes one has usually done something else as well.
  if (text.includes('\ufeff')) {
    refuse('', null, 'carries a byte-order mark, which Docker strips from line 1 and this does not');
  }
  // ⚠ Docker's scanner drops a trailing \r, so a CRLF file WORKS — until a value ends in one
  // that something else keeps. Refusing it is the stricter direction.
  if (text.includes('\r')) {
    refuse('', null, 'has CRLF (or a lone CR) line endings, which Docker tolerates and this does not');
  }

  const values = new Map<string, { value: string; line: number }>();
  text.split('\n').forEach((line, index) => {
    const lineNumber = index + 1;
    // ⚠ Docker trims LEADING whitespace from every line before deciding, so an indented
    // comment and a whitespace-only line are skips to it. Skipping them here too is not a
    // loosening — neither carries a key or a value — and refusing them would be a refusal
    // firing on a file a person would call correct, which is the one kind of refusal that
    // teaches an operator to ignore the rest (HANDOVER §0.13). An indented KEY=VALUE is a
    // different matter: it falls through and is refused by the key rule below, which is
    // stricter than Docker and deliberately so.
    const afterIndent = line.replace(/^[ \t]+/, '');
    if (afterIndent === '' || afterIndent.startsWith('#')) return;
    const at = line.indexOf('=');
    if (at < 0) {
      // ⚠ Never the line: a hard-wrapped `SESSION_SECRET=…` leaves its tail here, and that
      // tail is the secret (11-A6). Docker reads a bare line as "take it from the host
      // environment", which on a container started with no such variable is empty.
      refuse('', lineNumber, `has no '=' (${line.length} characters, not printed): Docker reads ` +
        'that as "take this from the host environment"');
      return;
    }
    const key = line.slice(0, at);
    const value = line.slice(at + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      refuse('', lineNumber, `${namedKey(key)} is not a usable environment-variable name`);
      return;
    }
    const seen = values.get(key);
    if (seen !== undefined) {
      // Docker keeps the LAST occurrence and says nothing. Two spellings of one credential is
      // a file nobody can read by eye, and `env_get` had to grow a `tail -1` for the same fact.
      refuse(key, lineNumber, `appears twice (also on line ${seen.line}) — Docker silently takes the last`);
      return;
    }
    values.set(key, { value, line: lineNumber });
  });

  const env: Record<string, string> = {};
  for (const key of SECRET_KEYS) {
    const found = values.get(key);
    if (found === undefined) {
      refuse(key, null, 'is absent');
      continue;
    }
    const why = secretValueError(found.value);
    if (why !== null) {
      refuse(key, found.line, why);
      continue;
    }
    if (key === SESSION_SECRET_KEY && found.value.length < MIN_SESSION_SECRET_CHARS) {
      refuse(key, found.line, `is ${found.value.length} characters, below the ` +
        `${MIN_SESSION_SECRET_CHARS}-character floor §5's unforgeability claim rests on`);
      continue;
    }
    env[key] = found.value;
  }

  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, env };
};

/**
 * The first line of a refusal printed by the STARTUP check — the one `journalctl -u
 * ai-dashboard` carries, and the one `instrumentation.ts` exits on.
 */
export const refusalHeadline = (path: string): string =>
  `ai-dashboard: REFUSING TO START — ${path} is not readable as §5.1 requires`;

/**
 * The first line of a refusal printed by a REQUEST path, which is a different sentence about
 * a different situation and must not borrow the one above.
 *
 * ⚠ 11-A18g's rule, and the test phase paid for it once already in `startup.ts`'s warn arm: a
 * message that announces a refusal on a process that then serves requests is a true sentence
 * about the wrong thing, and it teaches whoever reads it that this message means nothing. A
 * process that reaches here has **already started** — it is denying, not refusing to start.
 */
export const degradedHeadline = (path: string): string =>
  `ai-dashboard: ${path} was refused when this process first read it — the server is RUNNING ` +
  'and EVERY login and every session is now denied with a 401';

/**
 * The refusal an operator reads, at startup, in `journalctl -u ai-dashboard`.
 *
 * One line per reason, each naming its key and why — never its value. The closing line says
 * so out loud, because a reader who does not see their secret in the message should know that
 * is deliberate rather than wonder whether the message was truncated.
 */
export const refusalReport = (
  path: string,
  refusals: readonly SecretRefusal[],
  headline: string = refusalHeadline(path),
): string => {
  const lines = refusals.map((r) => {
    const where = r.line === null ? '' : ` (line ${r.line})`;
    const subject = r.key === '' ? 'the file' : r.key;
    return `  ${subject}${where}: ${r.reason}`;
  });
  return [
    headline,
    ...lines,
    '  (values are never printed; fix the file and `sudo ./dashboard.sh check`)',
  ].join('\n');
};

/**
 * The process's one read of the file. See {@link makeSecretSource}.
 *
 * ⚠⚠ **TWO entrances, not three — `require()` was deleted on 2026-09-11 (11b-A9).** It was
 * documented as *"the STARTUP path"* and had **zero production callers**: the real path is
 * `instrumentation.ts` → `startup.ts` → {@link SecretSource.refusal}, which prints and calls
 * `process.exit(1)` rather than throwing, deliberately and for reasons `startup.ts` states in
 * full. So the interface carried a third entrance whose only callers were four assertions
 * about itself — a certificate for something nothing does — while `refusal()`, the one the
 * whole ruling turns on, had none of its own. Wiring `require()` instead of deleting it would
 * have meant *changing* the startup contract to a throw, which is the option the build weighed
 * and rejected.
 */
export interface SecretSource {
  /**
   * The two secrets, or an EMPTY environment. Never throws — the REQUEST path.
   *
   * ⚠ Empty is not a fallback, it is the denial: `readAuthConfig({})` is `null`, every login
   * is refused and every cookie is rejected. §5's *"a session check that cannot reach a
   * verdict DENIES"* is a promise about a 401, and a getter that threw would make it a 500.
   *
   * ⚠⚠ **And it never degrades SILENTLY.** If this entrance is the one that performs the read
   * and the file is refused, the source reports it through `onDegraded` before returning the
   * empty environment — see {@link makeSecretSource}.
   */
  readonly environment: () => Environment;
  /** The refusal text, or `null`. Never throws. The STARTUP path. */
  readonly refusal: () => string | null;
}

/** What one read decided. Kept as the refusals rather than as rendered text, so the two
 * headlines above can both be rendered from one read. */
interface SecretState {
  readonly env: Environment | null;
  readonly refusals: readonly SecretRefusal[];
}

/**
 * Read the file **once**, whatever is asked of it afterwards.
 *
 * ⚠ Once, deliberately. §4 already says a `STANDING` change needs a restart, and a secret
 * re-read per request is a new failure mode: a file rewritten mid-flight by `set-password`
 * would change the answer between the gate and the route, and an unreadable file would turn
 * a denial into a per-request `readFileSync`. The memo also means a refusal is stable — the
 * same message every time it is asked, rather than one that depends on who asked first.
 *
 * ⚠⚠ **"Once" is a property of a SOURCE, not of a process, and until 2026-09-11 nothing made
 * the two the same thing.** The test phase measured `lib/auth/secrets.ts` bundled into
 * **three** server chunks of `.next/standalone` — the instrumentation entry, the gate and the
 * route handlers — each with its own copy of this factory and so its own memo. The
 * consequence was measured by the adversarial and it is the failure this whole ruling exists
 * to remove, wearing the guard's own name: startup validates the file and the server goes
 * ready; an **in-place** append then makes the gate's and the routes' copies read a refused
 * file; both memoise an **empty** `Environment`; every login is a 401; **nothing is logged**,
 * because `runStartup` is the only thing that ever consults `refusal()` and it has already
 * run; and the process does not exit, so `Restart=always` never fires. `lib/auth/secrets.ts`
 * is what makes the three copies share one read; `onDegraded` is what makes a read that goes
 * wrong impossible to miss even if they ever stop sharing.
 *
 * ⚠ A factory rather than a module-level constant, so the "once" property itself can be
 * measured: a test hands in a counting reader and asserts three calls read one file.
 *
 * @param onDegraded called **at most once per source**, and only when {@link
 * SecretSource.environment} is the entrance that performed the read and the read was refused.
 * Not called from `refusal()`, whose only caller prints what it is given — reporting there
 * too would print the same refusal twice on the one path that is already loud.
 */
export const makeSecretSource = (
  readBytes: () => Uint8Array,
  path: string = SECRET_ENV_FILE,
  onDegraded: (report: string) => void = () => {},
): SecretSource => {
  let memo: SecretState | null = null;

  /** The state, and whether THIS call is the one that produced it. */
  const load = (): { state: SecretState; fresh: boolean } => {
    if (memo !== null) return { state: memo, fresh: false };
    let bytes: Uint8Array;
    try {
      bytes = readBytes();
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unreadable';
      memo = {
        env: null,
        refusals: [
          { key: '', line: null, reason: `could not be read (${code}). §7 bind-mounts it into the container read-only` },
        ],
      };
      return { state: memo, fresh: true };
    }
    const verdict = parseSecretEnvFile(bytes);
    memo = verdict.ok ? { env: verdict.env, refusals: [] } : { env: null, refusals: verdict.refusals };
    return { state: memo, fresh: true };
  };

  const frozenEmpty: Environment = Object.freeze({});

  return {
    environment: (): Environment => {
      const { state, fresh } = load();
      if (state.env !== null) return state.env;
      // ⚠ `fresh` is what makes this exactly once and in the right place. If the startup check
      // read the file, it has already printed the refusal (and in the container exited on it);
      // if this entrance read it, nothing else ever will.
      if (fresh) onDegraded(refusalReport(path, state.refusals, degradedHeadline(path)));
      return frozenEmpty;
    },
    refusal: (): string | null =>
      load().state.env === null ? refusalReport(path, (memo as SecretState).refusals) : null,
  };
};
