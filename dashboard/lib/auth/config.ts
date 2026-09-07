/**
 * The `/etc/ai-dashboard.env` contract — **step 7 defines it; step 11 writes it.**
 *
 * > §5: "an env file (`/etc/ai-dashboard.env`, `root:root` 0600, bind-mounted read-only)."
 * > §5.1: "Env file keys: `PASSWORD_HASH`, `SESSION_SECRET`, `STANDING`."
 *
 * ---
 *
 * ### ⚠ Step 7 does not parse that file, and that is the answer to HANDOVER's open question
 *
 * HANDOVER §7 leaves open "which `KEY=VALUE` grammar `/etc/ai-dashboard.env` is", having
 * established that systemd's `EnvironmentFile` and a shell-sourced `ufw.conf` are two
 * genuinely different grammars that must not share a parser. The answer here is that the
 * dashboard reads **neither**: §2.5 runs the container with `docker run`, so Docker parses
 * the file (`--env-file`) and the values arrive in `process.env`. This module reads
 * `process.env` and nothing else. **A third parser is not written.**
 *
 * What step 7 *does* owe step 11 is the constraint that makes that safe, because Docker's
 * `--env-file` grammar is unlike both of the others:
 *
 * - it splits on the **first** `=` and takes the rest of the line verbatim;
 * - it does **not** strip quotes — `SESSION_SECRET="abc"` yields the four characters
 *   `"abc"` including the quotes;
 * - it does **not** expand anything, but a `dashboard.sh` that ever *sources* the file in
 *   bash would.
 *
 * So both values must be single-line, unquoted, with no leading or trailing space, and must
 * avoid `$`. `scrypt.ts`'s encoding is chosen to satisfy that; `SESSION_SECRET` must be
 * generated in the same alphabet (base64url or hex — see {@link MIN_SESSION_SECRET_CHARS}).
 *
 * ### ⚠ `STANDING` is §6.4's, and it is read here but never judged here
 *
 * It shares the file, so it shares this module's one reader of `process.env` —
 * {@link readStandingList}. What this module does **not** do is decide whether an entry is a
 * legal condition id: §4 says the list is *"echoed verbatim and never parsed server-side"*, so
 * §6.4's *"an id that matches no kind is reported as unknown"* stays a client-side fact and one
 * typo cannot fail a poll. Splitting on the separator §6.4 itself fixes is the whole of the
 * server's involvement.
 *
 * ### ⚠ Missing or unusable credentials deny everything, silently
 *
 * There is no fallback password and no "unconfigured" mode. A dashboard that will not open
 * is the loud, immediate and harmless failure (HANDOVER §3.2 rule 1); a dashboard that opens
 * without a password is the other one. Nothing is logged, because the only thing worth
 * logging would sit one edit away from logging the value.
 */

/** The scrypt hash every login is checked against. */
export const PASSWORD_HASH_KEY = 'PASSWORD_HASH';

/** §6.4's standing-condition list. Read by {@link readStandingList}, judged only in the browser. */
export const STANDING_KEY = 'STANDING';

/**
 * §6.4's separator, and the **only** thing the server knows about this value.
 *
 * §6.4: "`STANDING` in `/etc/ai-dashboard.env` is a comma-separated list of condition ids."
 */
export const STANDING_SEPARATOR = ',';

/** The HMAC key behind every session cookie. §5.1: `dashboard.sh install` generates 32 bytes. */
export const SESSION_SECRET_KEY = 'SESSION_SECRET';

/**
 * The shortest `SESSION_SECRET` this build will accept.
 *
 * §5.1 specifies **32 random bytes**, which is 43 characters in unpadded base64url and 64 in
 * hex. 32 *characters* is therefore a floor well below what the install script produces, and
 * it exists to refuse a hand-written secret rather than to grade a generated one — a short
 * secret makes the cookie's HMAC brute-forceable, and §5's whole unforgeability claim rests
 * on it. Below the floor, every session is refused.
 */
export const MIN_SESSION_SECRET_CHARS = 32;

/** Everything step 7 needs from the environment. Both fields are required; there is no partial state. */
export interface AuthConfig {
  /** `PASSWORD_HASH` — an encoded scrypt hash. Its *shape* is checked when it is used, not here. */
  readonly passwordHash: string;
  /** `SESSION_SECRET` — the HMAC key. Opaque text; never logged, never sent anywhere. */
  readonly sessionSecret: string;
}

/** What `process.env` looks like, without depending on `@types/node`'s mutable shape. */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Read the two credentials, or `null` if either is absent or unusable.
 *
 * ⚠ Read **per call**, not captured at module load. The cost is two property reads, and it
 * means a test can hand in an environment without reloading a module — the same reason
 * `lib/telemetry/handler.ts` takes its deps as an argument.
 */
export const readAuthConfig = (env: Environment): AuthConfig | null => {
  const passwordHash = env[PASSWORD_HASH_KEY]?.trim() ?? '';
  const sessionSecret = env[SESSION_SECRET_KEY]?.trim() ?? '';

  if (passwordHash === '') return null;
  if (sessionSecret.length < MIN_SESSION_SECRET_CHARS) return null;

  return { passwordHash, sessionSecret };
};

/**
 * `STANDING`, as §4's snapshot carries it: **verbatim entries, split and nothing else.**
 *
 * ⚠ No trim, no filter, no validation. Every one of those is a judgement about an id, and
 * §6.4 puts every such judgement in the browser (`parseStandingIds`) so that
 * *"an id that matches no kind is reported as unknown"* can actually happen. A server that
 * dropped `ufw_enforcing:yes` for looking wrong would turn §6.4's loudest rule into silence
 * — the same shape as a ufw rule written into a firewall that never loaded it.
 *
 * ⚠ Unset **and** empty both give `[]`, per §4. `''.split(',')` is `['']`, and an empty id
 * is not an entry an operator wrote; it is the absence of the key spelled differently.
 *
 * ⚠ Read **per call**, like {@link readAuthConfig} — but that no longer buys a live change,
 * and the comment here used to claim it did. `--env-file` is read once at `docker run`, so
 * `process.env` is fixed for the life of the container and re-reading it answers the same
 * value every time. §4 now says a `STANDING` change takes effect **on the next container
 * restart**, and `createTelemetrySource` captures the list once. This function stays a pure
 * read of whatever environment it is handed, which is what makes it testable and what would
 * make a bind-mounted, per-sample file read a small change rather than a rewrite.
 */
export const readStandingList = (env: Environment): readonly string[] => {
  const raw = env[STANDING_KEY];
  if (raw === undefined || raw === '') return [];
  return raw.split(STANDING_SEPARATOR);
};
