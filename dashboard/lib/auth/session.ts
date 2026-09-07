/**
 * §5's session token: minting one, and deciding whether one that came back is valid.
 *
 * > §5: "`POST /api/session` verifies, sets an **httpOnly, SameSite=Strict, 30-day** session
 * > cookie signed with a server secret from the same env file."
 * > §5: "A session check that cannot reach a verdict DENIES … **and any error raised while
 * > deciding** — is **401**, never 500."
 *
 * ---
 *
 * ### The token
 *
 * ```
 * <payload-base64url> "." <hmac-sha256-base64url>
 * payload = {"v":1,"sid":"<16 random bytes, base64url>","iat":<ms>,"exp":<ms>}
 * hmac    = HMAC-SHA256(SESSION_SECRET, <payload-base64url>)
 * ```
 *
 * **Why it is not forgeable without `SESSION_SECRET`:** the signature covers the exact bytes
 * the verifier parses — the encoded **payload**, not a re-serialisation of it — so there is
 * no canonicalisation gap *on the payload*, and every field a forger would want to change
 * (`exp`, `sid`) is inside the signed region. Recovering the key from an HMAC-SHA256 tag is
 * the standard PRF assumption; `config.ts` refuses a secret short enough to search, which is
 * the only way this project could realistically get it wrong.
 *
 * ### ⚠ The SIGNATURE field has a canonicalisation gap of its own, and it is closed here
 *
 * That sentence used to be written of "the token" and it was only ever true of the payload.
 * A 32-byte tag is 43 base64url characters and the last one carries **four significant bits
 * of six**, so every tag has four spellings that decode to the same bytes. `Buffer.from`
 * decodes all four, so a verifier that compares only the decoded bytes accepts all four —
 * measured live against the built server: one logical cookie, four wire forms, all 200.
 *
 * Not a forgery vector — producing any spelling still needs `HMAC-SHA256(SESSION_SECRET, …)`,
 * the tag space is unchanged, and revocation keys on `sid` inside the signed payload, so all
 * four die together. It was a **correctness wart**: `scrypt.ts` rejected exactly this on its
 * own fields and this module did not, so one directory held two disagreeing definitions of
 * canonical base64url. {@link decodeExact} is now the single definition and the signature
 * goes through it. See `base64url.ts`.
 *
 * ⚠ The payload deliberately does **not** get the same check: a non-canonical payload
 * spelling changes the signed input and is refused by the signature, so a canonical check
 * there is unreachable code with no possible mutation.
 *
 * **Why the signature is checked before the payload is parsed:** an unsigned payload never
 * reaches `JSON.parse`. The parse is inside a `try` anyway, but ordering it second means the
 * only JSON this process ever parses out of a cookie is JSON it wrote itself.
 *
 * ### ⚠ Constant-time comparison, and the length check that has to come first
 *
 * `timingSafeEqual` **throws** when the two buffers differ in length, which turns the
 * classic defence into the classic 500. The lengths are compared first, against the
 * constant 32 — which leaks nothing, because 32 is the length of every signature this
 * server produces.
 *
 * ### ⚠ Wall clock here, monotonic in the rate limiter — and the difference is deliberate
 *
 * `iat`/`exp` are `Date.now()` milliseconds. They have to be: a 30-day life is stored in a
 * browser and must survive container restarts, and `performance.now()` restarts with the
 * process. The rate limiter is the opposite case — a 60 s lockout that must not be
 * shortened or extended by an NTP step — and uses a monotonic clock for exactly that reason
 * (the same reasoning as mutation `R14`, which timed §4's cache on `Date.now()`).
 *
 * The cost of the wall clock is that a backward step can extend a session and a forward one
 * can end it early. Over 30 days on an NTP-synced LAN box that is noise, and there is no
 * clock that is both durable across restarts and immune to steps.
 *
 * ### ⚠ Revocation is NOT here
 *
 * `revocations.ts` holds it, and nothing in this module imports it. That split is what lets
 * `proxy.ts` — which Next's own documentation says must not "rely on shared modules or
 * globals" — reach the cryptographic verdict without pretending to see process-local state
 * it may not share. See `revocations.ts` and `authorize.ts` for the two-verdict split.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { BASE64URL, decodeExact } from './base64url';
import { SESSION_COOKIE, SESSION_TTL_MS, readCookie } from './cookie';

/** How many bytes of session id. 128 bits: unguessable, and short enough to keep the cookie small. */
export const SESSION_ID_BYTES = 16;

/** HMAC-SHA256's digest length, in bytes. */
const SIGNATURE_BYTES = 32;

/** The only payload version this build writes or accepts. */
export const SESSION_VERSION = 1;

/** A verified session's payload. */
export interface Session {
  readonly v: typeof SESSION_VERSION;
  /** Random per login. The handle `DELETE /api/session` revokes. */
  readonly sid: string;
  /** Issued at, in wall-clock milliseconds. */
  readonly iat: number;
  /** Expires at, in wall-clock milliseconds. §5's thirty days after `iat`. */
  readonly exp: number;
}

const sign = (secret: string, payload: string): Buffer =>
  createHmac('sha256', secret).update(payload).digest();

/**
 * Mint a token for a login that has just succeeded.
 *
 * @param nowMs wall-clock milliseconds; injected so a test does not have to wait 30 days
 */
export const mintSession = (
  secret: string,
  nowMs: number,
  ttlMs: number = SESSION_TTL_MS,
): { readonly token: string; readonly session: Session } => {
  const session: Session = {
    v: SESSION_VERSION,
    sid: randomBytes(SESSION_ID_BYTES).toString('base64url'),
    iat: nowMs,
    exp: nowMs + ttlMs,
  };
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return { token: `${payload}.${sign(secret, payload).toString('base64url')}`, session };
};

/** Is this a `Session`, and not merely an object that parsed? */
const asSession = (value: unknown): Session | null => {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate['v'] !== SESSION_VERSION) return null;
  if (typeof candidate['sid'] !== 'string' || candidate['sid'] === '') return null;
  if (typeof candidate['iat'] !== 'number' || !Number.isFinite(candidate['iat'])) return null;
  if (typeof candidate['exp'] !== 'number' || !Number.isFinite(candidate['exp'])) return null;
  return { v: SESSION_VERSION, sid: candidate['sid'], iat: candidate['iat'], exp: candidate['exp'] };
};

/**
 * Verify a token: signature, then shape, then §5's thirty days.
 *
 * ⚠ **Total.** `null`, `''`, one field, three fields, a payload that is not base64url, a
 * signature of the wrong length, a signature spelled non-canonically, a payload that is not
 * JSON, JSON that is not a session, and a session that has expired all return `null`, and
 * none of them raises. That is what makes
 * the 401 in `lib/telemetry/handler.ts` a 401 for the *right* reason rather than a caught
 * throw.
 */
export const verifySessionToken = (
  token: string | null,
  secret: string,
  nowMs: number,
): Session | null => {
  try {
    if (token === null || token === '') return null;

    const dot = token.indexOf('.');
    // Exactly one separator: `indexOf === lastIndexOf` rejects both `abc` and `a.b.c`
    // without allocating a split.
    if (dot <= 0 || dot !== token.lastIndexOf('.') || dot === token.length - 1) return null;

    const payload = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (!BASE64URL.test(payload)) return null;

    // ⚠ Canonically, and the length is part of it — `timingSafeEqual` throws on a length
    // mismatch, which is the classic constant-time defence turning into the classic 500. 32
    // is a constant and leaks nothing. The re-encode is what refuses the three alternate
    // spellings of the same tag; see the module doc.
    const given = decodeExact(signature, SIGNATURE_BYTES);
    if (given === null) return null;
    if (!timingSafeEqual(given, sign(secret, payload))) return null;

    // Only now — the bytes are ours.
    const session = asSession(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (session === null) return null;

    // §5's thirty days, enforced by the server rather than trusted to the browser's
    // `Max-Age`: a client that keeps sending an expired cookie is the normal case for
    // anything that is not a browser.
    return session.exp > nowMs ? session : null;
  } catch {
    // ⚠ §5: any error raised while deciding is a denial. Nothing here is expected to throw —
    // every step above is guarded — and this is the second lock, not the first.
    return null;
  }
};

/**
 * The cryptographic verdict for a whole request: cookie → token → {@link Session}.
 *
 * ⚠ This is the **partial** verdict, deliberately. It knows nothing about revocation, so it
 * is the one `proxy.ts` can use honestly. `authorize.ts` composes the full one.
 */
export const verifiedSessionOf = (
  request: { readonly headers: { get(name: string): string | null } },
  secret: string,
  nowMs: number,
): Session | null =>
  verifySessionToken(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret, nowMs);
