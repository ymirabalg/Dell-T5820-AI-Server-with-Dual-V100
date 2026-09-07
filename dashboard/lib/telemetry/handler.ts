/**
 * `GET /api/telemetry`, as a plain function of a `Request`.
 *
 * The Next route file (`app/api/telemetry/route.ts`) is four lines that call this. The
 * split is not ceremony: a `route.ts` may only export the names Next recognises, so the
 * seams a test needs — the session check, the telemetry source — cannot be exported from
 * there, and a handler that could only be exercised through the framework would be tested
 * against the framework rather than against §4.
 *
 * ---
 *
 * ### ⚠ 401, and the verifier that now stands behind it
 *
 * §4: "Requires a valid session cookie; returns 401 otherwise." §5 fixes the mechanism — an
 * httpOnly, SameSite=Strict, 30-day cookie signed with a `SESSION_SECRET` from
 * `/etc/ai-dashboard.env` — and **step 7 built it**. Step 6 owned the *shape*: a seam the
 * route consults before it samples. {@link verifySession} is what that seam now holds.
 *
 * **It still denies by default**, in a different shape. Step 6's `noSessionVerifierYet`
 * returned `false` for everything; step 7 deleted it rather than leave an exported, tested,
 * unused seam behind, and the property moved into the verifier: with no `SESSION_SECRET` in
 * the environment `verifySession` refuses every request, cookie or not. Two reasons that
 * direction is the right one, and the second decides it:
 *
 * 1. §5.2: "The login screen is the only route reachable unauthenticated."
 * 2. An allow-by-default seam is an unauthenticated telemetry endpoint on a LAN box — the
 *    same class of mistake as `serve-llm.sh` writing a ufw rule into a firewall that was
 *    never enabled, which left 8080/8081 open for a week. Denying by default fails as a
 *    dashboard that will not open: loud, immediate, and harmless.
 *
 * ⚠ **The route-level check stays, even though `proxy.ts` also refuses.** HANDOVER §3.2 rule
 * 4: middleware is not a reason to relax an ordering a test pins. The proxy makes only the
 * cryptographic verdict (it cannot honestly consult process-local state — see
 * `lib/auth/revocations.ts`); this check makes the full one, and it is the one that stands
 * between an unauthenticated caller and `nvidia-smi`.
 *
 * ### ⚠ Authorisation happens BEFORE the sample
 *
 * An unauthenticated request must not be able to make this box run `nvidia-smi`, open two
 * D-Bus connections and probe both `llama-server` instances. Ordering the check first is
 * what makes that true; it is asserted by call count rather than by reading the code.
 *
 * ### The response
 *
 * `200` carries §4's snapshot as JSON. A failed *reading* is never a 500 — it is `null` in
 * the snapshot plus an `errors[]` entry (invariant 5) — and the snapshot arrives already
 * assembled, so there is no failure this handler has to map.
 *
 * ### ⚠ A session check that cannot reach a verdict DENIES
 *
 * §5, and it lands on step 7 immediately: "A cookie that is missing, malformed, truncated,
 * or whose signature cannot be verified — **and any error raised while deciding** — is
 * **401**, never 500." Step 7's cookie parse throws on the routine malformed input, so the
 * `try/catch` in {@link authorized} is the difference between §5.2's *sign in again* and
 * §6.7's *the server is broken*, with no way back but clearing the cookie by hand.
 *
 * `401` carries **no body**. §4 and §5 specify the status and nothing else, and §5.2's
 * client behaviour ("every `/api/*` returns 401, and the client routes to `/login` with the
 * expired message") needs only the status. Inventing an error body would be a second,
 * unspecified contract for step 8 to depend on.
 *
 * `Cache-Control: no-store` on both. Not spec'd, and chosen: §4 samples per request and
 * §6.7 polls on a cadence, so any intermediary or heuristic browser cache holding a
 * telemetry response would freeze the dashboard on a stale snapshot while the age
 * indicator kept counting — a lie of exactly the kind §6.5 exists to prevent. It is also
 * the correct header for a 401 that a session change should not resurrect.
 */

import { verifySession } from '@/lib/auth/authorize';

import { createTelemetrySource } from './source';
import type { TelemetrySource } from './source';

/**
 * Does this request carry a valid session (§5)?
 *
 * Deliberately takes the whole `Request`: step 7 may read the cookie from it, or replace
 * this with something that consults `cookies()` from `next/headers`. Either satisfies the
 * seam, and neither is decided here.
 *
 * ⚠ **It may throw, and throwing means 401.** The type says `boolean` because §5 says the
 * status is the whole contract — the check cannot express *why*, on purpose. See
 * {@link authorized}.
 */
export type SessionCheck = (request: Request) => boolean | Promise<boolean>;

/**
 * Run the session check, and treat **any** failure to reach a verdict as a refusal.
 *
 * > §5: "A session check that cannot reach a verdict DENIES. A cookie that is missing,
 * > malformed, truncated, or whose signature cannot be verified — **and any error raised
 * > while deciding** — is **401**, never 500."
 *
 * ⚠ **This is step 7's routine path, not an exotic one.** Step 7's `authorize` is cookie
 * read → base64/JSON decode → HMAC verify against `SESSION_SECRET`, and every one of those
 * throws on malformed input. A cookie truncated by a proxy or edited by hand is the
 * ordinary way a bad session arrives.
 *
 * The difference is not merely the status code. §5.2 routes a **401** to `/login` with the
 * expired message; a **500** puts the client on §6.7's *failed poll* path instead — the
 * header dot greys, the age counts up, traces freeze, backoff climbs to 30 s and a banner
 * names a server failure. The user is never told to sign in and never recovers without
 * clearing the cookie by hand. The 401 fails closed; an uncaught throw fails **open into
 * the wrong UI state**, which is worse than either.
 */
const authorized = async (check: SessionCheck, request: Request): Promise<boolean> => {
  try {
    return await check(request);
  } catch {
    // ⚠ Deliberately swallowed, and deliberately not logged into the response. The status
    // is the whole contract (§5): a body distinguishing "malformed" from "expired" would be
    // a second, unspecified contract *and* would tell an unauthenticated caller which of
    // its guesses was closer.
    return false;
  }
};

/** What {@link handleTelemetry} needs. Both are replaced wholesale in tests. */
export interface TelemetryHandlerDeps {
  readonly authorize: SessionCheck;
  readonly source: TelemetrySource;
}

/** Every response from this route is uncacheable — see the module doc. */
const NO_STORE = 'no-store';

/**
 * The process-wide deps.
 *
 * ⚠ **One `TelemetrySource` for the whole server**, because the 2 s cache and the carried
 * counters are only meaningful if every request meets the same one. Building it here rather
 * than inside the handler is what makes it process-wide; building it at module load costs
 * nothing, because constructing a source samples nothing.
 */
export const productionTelemetryDeps: TelemetryHandlerDeps = {
  authorize: verifySession,
  source: createTelemetrySource(),
};

/**
 * Handle one `GET /api/telemetry`.
 *
 * @param request the incoming request, consulted only by {@link SessionCheck}
 * @param deps injected by tests; the production defaults are {@link productionTelemetryDeps}
 */
export const handleTelemetry = async (
  request: Request,
  deps: TelemetryHandlerDeps = productionTelemetryDeps,
): Promise<Response> => {
  // ⚠ Before the sample, not after. See the module doc. And through {@link authorized},
  // so that a check which throws is a 401 rather than a 500 (§5).
  if (!(await authorized(deps.authorize, request))) {
    return new Response(null, { status: 401, headers: { 'cache-control': NO_STORE } });
  }

  const snapshot = await deps.source.snapshot();
  // ⚠ `JSON.stringify` rather than `Response.json`, so the serialisation this route
  // performs is the one the tests read back. §3.3 of HANDOVER: the brands are compile-time
  // fictions and must leave the process as plain numbers and strings.
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': NO_STORE,
    },
  });
};
