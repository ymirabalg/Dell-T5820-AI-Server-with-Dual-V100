/**
 * `POST /api/session` and `DELETE /api/session` (§4, §5), as plain functions of a `Request`.
 *
 * The split from `app/api/session/route.ts` is the same one step 6 made for telemetry and
 * for the same reason: a `route.ts` may only export the names Next recognises, so the seams
 * a test needs cannot be exported from there, and a handler reachable only through the
 * framework would be tested against the framework rather than against §5.
 *
 * ---
 *
 * ### The order of `POST`, and why it is this order
 *
 * 1. **`Content-Type: application/json`**, before anything at all is spent on the request.
 *    See the note below: this is what stops a page the operator merely *visits* from
 *    spending the login budget, so it has to run before the budget is spent.
 * 2. **Rate limit**, before the body is read and long before scrypt runs. A locked service
 *    must cost this box nothing — that is what a rate limit is *for*, and hashing before
 *    checking would turn 5-per-minute into "5 answers per minute, unlimited work". §5 makes
 *    the limit global, so this is also the only bound on queued password hashing, and it
 *    bounds it at `MAX_ATTEMPTS` pending by construction.
 * 3. **Body**, capped. See {@link MAX_BODY_BYTES}.
 * 4. **Credentials**, or a denial. No `PASSWORD_HASH` is a denial, not a bypass.
 * 5. **Verify**, in constant time, one hash at a time (`scrypt.ts`).
 * 6. **Success:** forget the attempts, mint, set the cookie, 302 to `/`.
 *
 * ### ⚠ Why the `Content-Type` requirement is a security control, not a formality
 *
 * > §5: "**`POST /api/session` requires `Content-Type: application/json`** and refuses
 * > anything else with the same empty 401 as a wrong password. Without that requirement the
 * > request is a CORS *simple request* needing no preflight, so any page the operator's
 * > browser happens to load could spend the login rate limit and queue password hashing on
 * > the dashboard's behalf."
 *
 * A cross-origin `POST` carrying `text/plain` needs no preflight and is sent; one carrying
 * `application/json` is preflighted, and this server answers no CORS headers, so the browser
 * never sends it. The attacker could not read the response either way — what they are
 * spending is the **budget**, and under §5's single global bucket that is the whole cost of
 * holding the dashboard closed. `app/login/login-form.tsx` already sends the header, so the
 * requirement costs the real client nothing.
 *
 * ⚠ Parameters are allowed (`application/json; charset=utf-8`) and the comparison is
 * case-insensitive, because both are legal spellings of the same media type. Neither loosens
 * the property above: no spelling of `application/json` is a CORS simple request.
 *
 * ### ⚠ Every failure is 401 — there is no 400, and that is deliberate
 *
 * §5.2's screen has six states, and the ones reachable from a status code are
 * `Password not recognised.` (401), `Too many attempts…` (429), and
 * `Could not reach the dashboard.` (**anything else**). A 400 for a malformed body would
 * therefore not merely be an unspecified seventh state — it would render as *"could not reach
 * the dashboard"*, which is a lie about a server that answered. So a request with no body, a
 * body that is not JSON, a JSON body with no `password`, a wrong `Content-Type` and a wrong
 * password all answer **401 with no body**. That is truthful: none of them supplied a
 * password this server recognises.
 *
 * It is also the safe direction. A distinct status for "malformed" would tell an
 * unauthenticated caller which of its guesses was closer to being well-formed — the same
 * reasoning §5 gives for the 401 carrying no body at all.
 *
 * ### ⚠ 302 on success, per §5.2, and what that costs the client
 *
 * §5.2: "**On success:** 302 to `/`." A browser `fetch` cannot read a 302 it did not follow —
 * with `redirect: 'manual'` the response is opaque (`type: 'opaqueredirect'`, `status: 0`) —
 * so `app/login/login-form.tsx` treats an opaque redirect, a readable 302 and a 2xx alike and
 * navigates to `/`. The `Set-Cookie` is applied by the user agent when the response arrives,
 * before any redirect handling, so an opaque response still logs the user in.
 *
 * ### ⚠ `DELETE` always succeeds
 *
 * There is nothing for it to refuse. It clears the cookie unconditionally — a client whose
 * cookie is malformed is precisely the client that most needs it gone — and additionally
 * **revokes** the session when the cookie verifies, which is what makes the token
 * non-replayable afterwards. See `revocations.ts` for the scope of that promise.
 *
 * ⚠ Including when the verdict itself throws. `liveSessionOf` is the one member of the
 * session pair that is **not** total by catch (`verifySession` is), so a revocation store or
 * clock that threw would escape this function as a 500 — and §5.2's screen maps every status
 * that is not 302/401/429 to *Could not reach the dashboard.* A logout that cannot decide
 * still clears the cookie: the fail-closed direction here is "log the browser out anyway".
 *
 * ### ⚠ `Cache-Control: no-store` on every response
 *
 * A response carrying `Set-Cookie` must never be held by anything, and a 429 that outlived
 * its own `Retry-After` would leave the screen counting down against a server that had
 * already forgotten the lockout.
 */

import { liveSessionOf } from './authorize';
import type { AuthorizeDeps } from './authorize';
import { readAuthConfig } from './config';
import type { Environment } from './config';
import { clearedCookieHeader, sessionCookieHeader } from './cookie';
import { productionRateLimiter } from './rate-limit';
import type { RateLimiter, RateVerdict } from './rate-limit';
import { productionRevocations } from './revocations';
import type { Revocations } from './revocations';
import { verifyPassword } from './scrypt';
import { mintSession } from './session';

/**
 * The largest login body this route will look at, **in bytes on both sides of the check**.
 *
 * A password is a handful of bytes; 4 KiB is three orders of magnitude of headroom and it
 * stops a scripted caller from making this process hold a megabyte per attempt. It bounds
 * what is *stored*, not what the platform buffers — a route handler is handed a body that
 * Next has already read, so a truly unbounded upload is bounded upstream or not at all.
 *
 * ⚠ One constant, one unit. It used to be compared against `content-length` (bytes) and then
 * against `text.length` (**UTF-16 code units**), so a 4 096-character body of three-byte
 * characters was 12 KiB and passed. Harmless at these magnitudes, and exactly the kind of
 * quiet unit mismatch this project renamed 98 occurrences of `GB` to `GiB` to avoid.
 */
export const MAX_BODY_BYTES = 4096;

/** §5's required request grammar. Compared case-insensitively, parameters allowed. */
export const REQUIRED_CONTENT_TYPE = 'application/json';

/**
 * Is this the request grammar §5 requires? See the module doc for why this decides whether
 * an arbitrary web page can spend the dashboard's login budget.
 */
const isJson = (request: Request): boolean => {
  const header = request.headers.get('content-type');
  if (header === null) return false;
  return (header.split(';')[0] ?? '').trim().toLowerCase() === REQUIRED_CONTENT_TYPE;
};

/** Every response here forbids caching — see the module doc. */
const NO_STORE = 'no-store';

/** What the two handlers need. Replaced wholesale in tests. */
export interface SessionHandlerDeps {
  /** Where `PASSWORD_HASH` and `SESSION_SECRET` come from. */
  readonly env: Environment;
  /** §5.2's 5-per-minute limiter. */
  readonly limiter: RateLimiter;
  /** The store `DELETE` writes to. */
  readonly revocations: Revocations;
  /** Monotonic milliseconds, for the limiter. `performance.now()` in production. */
  readonly monotonicMs: () => number;
  /** Wall-clock milliseconds, for the cookie's `iat`/`exp`. `Date.now()` in production. */
  readonly nowMs: () => number;
  /**
   * Password verification. Injected so a test does not pay 60 ms of scrypt per case — and
   * so the tests that *do* care about the KDF are the ones in `scrypt.test.ts`.
   */
  readonly verify: (password: string, encodedHash: string) => Promise<boolean>;
}

/** The process-wide wiring. */
export const productionSessionDeps: SessionHandlerDeps = {
  env: process.env,
  limiter: productionRateLimiter,
  revocations: productionRevocations,
  monotonicMs: () => performance.now(),
  nowMs: () => Date.now(),
  verify: verifyPassword,
};

const refused = (): Response =>
  new Response(null, { status: 401, headers: { 'cache-control': NO_STORE } });

/**
 * The `password` field of a JSON body, or `null` for anything else.
 *
 * ⚠ Total. A body that is absent, empty, oversized, not JSON, JSON that is not an object, or
 * an object whose `password` is not a non-empty string all give `null` — and `null` is a 401,
 * per the module doc.
 *
 * JSON only, and no `application/x-www-form-urlencoded` fallback: one request grammar is one
 * thing to test and one thing to get wrong, and §5.2's screen needs JavaScript for its
 * server-supplied countdown regardless, so a no-JS form would not reach a working state.
 */
const passwordFrom = async (request: Request): Promise<string | null> => {
  try {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

    const text = await request.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes === 0 || bytes > MAX_BODY_BYTES) return null;

    const body: unknown = JSON.parse(text);
    if (typeof body !== 'object' || body === null) return null;

    const password = (body as Record<string, unknown>)['password'];
    return typeof password === 'string' && password !== '' ? password : null;
  } catch {
    // A body that is not JSON, or a stream that failed mid-read. Neither is a password.
    return null;
  }
};

/**
 * `POST /api/session` — §5's login.
 *
 * @param deps injected by tests; the production wiring is {@link productionSessionDeps}
 */
export const handleSessionPost = async (
  request: Request,
  deps: SessionHandlerDeps = productionSessionDeps,
): Promise<Response> => {
  // 1. §5's request grammar, before any budget is spent on this caller.
  if (!isJson(request)) return refused();

  // 2. Before the body, and long before the KDF. One bucket for the service, so at most
  //    MAX_ATTEMPTS hashes can be queued behind this line.
  let verdict: RateVerdict;
  try {
    verdict = deps.limiter.attempt(deps.monotonicMs());
  } catch {
    // ⚠ Fail closed. The limiter is a seam, and §5's rule — a refusal that cannot reach a
    // verdict denies, never 500s — has to hold at the seam and not merely inside the Map.
    // A 500 here would render as "Password not recognised." on §5.2's own screen were it not
    // for the *Could not reach the dashboard.* branch, and neither is a thing to leave to
    // the client to make right.
    return refused();
  }
  if (!verdict.allowed) {
    return new Response(null, {
      status: 429,
      headers: {
        // §5.2: "the screen renders its countdown from that value". Whole seconds, never 0.
        'retry-after': String(verdict.retryAfterSeconds),
        'cache-control': NO_STORE,
      },
    });
  }

  const password = await passwordFrom(request);
  if (password === null) return refused();

  const config = readAuthConfig(deps.env);
  if (config === null) return refused();

  let ok = false;
  try {
    ok = await deps.verify(password, config.passwordHash);
  } catch {
    // ⚠ Fail closed. `verifyPassword` is total, but the seam is injectable and §5's rule —
    // any error while deciding is a denial — is the one that must hold at the boundary.
    ok = false;
  }
  if (!ok) return refused();

  // A correct password is not a guess: the counter starts clean, so a user who mistyped four
  // times and then succeeded is not one attempt from a lockout.
  deps.limiter.clear();

  const { token } = mintSession(config.sessionSecret, deps.nowMs());
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': sessionCookieHeader(token),
      'cache-control': NO_STORE,
    },
  });
};

/** The subset of {@link SessionHandlerDeps} a session verdict needs. */
const authorizeDepsOf = (deps: SessionHandlerDeps): AuthorizeDeps => ({
  env: deps.env,
  revocations: deps.revocations,
  nowMs: deps.nowMs,
});

/**
 * `DELETE /api/session` — §5's logout.
 *
 * Always 204, always clears the cookie, and revokes the session when there was one to revoke.
 */
export const handleSessionDelete = (
  request: Request,
  deps: SessionHandlerDeps = productionSessionDeps,
): Response => {
  try {
    const session = liveSessionOf(request, authorizeDepsOf(deps));
    if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());
  } catch {
    // ⚠ See the doc above: `liveSessionOf` is not total by catch, and a logout must clear the
    // cookie whatever the store says.
  }

  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': clearedCookieHeader(), 'cache-control': NO_STORE },
  });
};
