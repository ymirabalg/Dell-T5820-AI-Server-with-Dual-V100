/**
 * The `/etc/ai-dashboard.env` contract — **step 7 defines it; step 11 writes it.**
 *
 * > §5: "an env file (`/etc/ai-dashboard.env`, `root:root` 0600, bind-mounted read-only)."
 * > §5.1: "Env file keys: `PASSWORD_HASH`, `SESSION_SECRET`, `STANDING`."
 *
 * ---
 *
 * ### ⚠⚠ "A third parser is not written" — OVERTURNED 2026-09-11, deliberately
 *
 * This header used to close HANDOVER §7's open question — *"which `KEY=VALUE` grammar is
 * `/etc/ai-dashboard.env`?"* — like this, and the paragraph is kept because the reasoning was
 * sound for what it weighed:
 *
 * > "The dashboard reads **neither**: §2.5 runs the container with `docker run`, so Docker
 * > parses the file (`--env-file`) and the values arrive in `process.env`. This module reads
 * > `process.env` and nothing else. **A third parser is not written.**"
 *
 * What it did not weigh is where `--env-file` **puts** the values: in the container's
 * environment, where `docker inspect` shows them to every member of the `docker` group and
 * `/proc/1/environ` to root. The owner ruled on 2026-09-11 (SPEC.md §5.1, INSTALL-SPEC §11.2,
 * `11-Q2`) that the file is **bind-mounted read-only and parsed by the server**, on the
 * precedent of `serve-llm.sh`'s `--api-key-file, never --api-key`. So the third parser IS
 * written, in `lib/auth/secret-file.ts`, and it is held to one rule: **stricter than Docker's
 * grammar, never looser**, refusing at startup what Docker would keep verbatim.
 *
 * **This module is unchanged by that**, and that is the point of its shape. It reads an
 * {@link Environment}; which `Environment` is the composition root's business. In production
 * `readAuthConfig` is now handed the file-backed one and `readStandingList` is still handed
 * `process.env` — `STANDING` is configuration, not a secret, and stays an environment
 * variable.
 *
 * The constraint that made the old arrangement safe still binds on whoever WRITES the file,
 * because Docker's grammar is what `dashboard.sh` must not produce something unreadable in:
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
 * `secret-file.ts` refuses all of it at startup rather than hoping.
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
 *
 * ⚠ **Still the second lock, and still not the first.** Since 2026-09-11 the production
 * `Environment` comes from `lib/auth/secret-file.ts`, which refuses at startup anything this
 * function would merely return `null` for — and a good deal more besides. This stays exactly
 * as strict as it was: a `null` here is a clean, silent, total denial, which is the correct
 * behaviour for a process that somehow reached a request with no credentials.
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
