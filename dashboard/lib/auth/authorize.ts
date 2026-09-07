/**
 * The **full** session verdict — the one that replaces step 6's deny-everything placeholder
 * in `lib/telemetry/handler.ts`.
 *
 * > §4: "Requires a valid session cookie; returns 401 otherwise."
 * > §5: "A session check that cannot reach a verdict DENIES … **and any error raised while
 * > deciding** — is **401**, never 500."
 *
 * ---
 *
 * ### ⚠ Two verdicts, and the split is structural
 *
 * | | what it checks | who uses it |
 * |---|---|---|
 * | `verifiedSessionOf` (`session.ts`) | signature · shape · §5's thirty days | `proxy.ts` |
 * | {@link liveSessionOf} (here) | all of that **plus** revocation | every `/api/*` route |
 *
 * The proxy cannot honestly consult the revocation store: Next's own documentation for the
 * proxy file says it "is meant to be invoked separately of your render code … you should not
 * attempt relying on shared modules or globals". So the proxy makes the verdict it can make,
 * and every path that reaches a *reading* makes the full one. `revocations.ts` records what
 * that costs — a revoked cookie can still fetch an HTML shell that carries no telemetry, and
 * its first poll is a 401 that §5.2 routes to `/login`.
 *
 * ### ⚠ This does not throw, and the handler's `try`/`catch` is the second lock
 *
 * HANDOVER §3.2 rule 2: *"`handler.ts` wraps the check in a denying `try/catch` and two tests
 * pin it. **Do not remove it**, and do not rely on it either: an `authorize` that throws on
 * ordinary input is still a bug, it just is not a 500."* Every step below is total by
 * construction — `readCookie`, `verifySessionToken` and `readAuthConfig` each map every input
 * to a value — and {@link verifySession} still catches, because "total by construction" is a
 * claim about today's code and the 401/500 distinction is the difference between §5.2's
 * *sign in again* and §6.7's *the server is broken*.
 *
 * ### ⚠ Deny-by-default survives, in a different shape
 *
 * Step 6 shipped `noSessionVerifierYet` returning `false`. That constant is gone — an
 * exported, tested, unused seam is its own hazard — and the property it protected is now
 * carried by the code: with no `SESSION_SECRET` in the environment, `readAuthConfig` returns
 * `null` and this function returns `false` for every request, including one carrying a cookie
 * that a correctly-configured server would accept. An unconfigured dashboard is one that will
 * not open, which is the loud, immediate and harmless direction.
 */

import { readAuthConfig } from './config';
import type { Environment } from './config';
import { productionRevocations } from './revocations';
import type { Revocations } from './revocations';
import { verifiedSessionOf } from './session';
import type { Session } from './session';

/** What a verdict needs. Replaced wholesale in tests. */
export interface AuthorizeDeps {
  /** Where `PASSWORD_HASH` and `SESSION_SECRET` come from. Production: `process.env`. */
  readonly env: Environment;
  /** The process's revocation store. */
  readonly revocations: Revocations;
  /** Wall-clock milliseconds — see `session.ts` for why this clock and not the monotonic one. */
  readonly nowMs: () => number;
}

/** The process's own wiring. */
export const productionAuthorizeDeps: AuthorizeDeps = {
  env: process.env,
  revocations: productionRevocations,
  nowMs: () => Date.now(),
};

/** Just enough of a `Request` to reach the `Cookie` header — so a test needs no `Request`. */
export interface HasHeaders {
  readonly headers: { get(name: string): string | null };
}

/**
 * The session this request carries, if it carries a live one.
 *
 * Returns the {@link Session} rather than a boolean because `DELETE /api/session` needs the
 * `sid` to revoke.
 */
export const liveSessionOf = (
  request: HasHeaders,
  deps: AuthorizeDeps = productionAuthorizeDeps,
): Session | null => {
  const config = readAuthConfig(deps.env);
  if (config === null) return null;

  const nowMs = deps.nowMs();
  const session = verifiedSessionOf(request, config.sessionSecret, nowMs);
  if (session === null) return null;

  return deps.revocations.isRevoked(session.sid, nowMs) ? null : session;
};

/**
 * The `SessionCheck` `lib/telemetry/handler.ts` runs before it samples.
 *
 * ⚠ Its signature is matched **structurally** rather than by importing `SessionCheck` from
 * the handler: `handler.ts` imports this module, and a type import back the other way would
 * be a cycle in the module graph that is only erased by accident.
 */
export const verifySession = (
  request: HasHeaders,
  deps: AuthorizeDeps = productionAuthorizeDeps,
): boolean => {
  try {
    return liveSessionOf(request, deps) !== null;
  } catch {
    // ⚠ Unreachable by construction, and kept anyway — §5 makes every failure to reach a
    // verdict a denial, and this is the layer that owns that promise for its own callers.
    return false;
  }
};
