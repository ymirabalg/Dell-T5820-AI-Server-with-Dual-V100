/**
 * §5's gate: **"The login screen is the only route reachable unauthenticated."**
 *
 * ---
 *
 * ### ⚠ This file is `proxy.ts`, not `middleware.ts`
 *
 * Next 16 renamed the convention. From the bundled docs
 * (`01-app/01-getting-started/16-proxy.md`): *"Starting with Next.js 16, Middleware is now
 * called Proxy … The functionality remains the same."* `middleware.ts` is deprecated. This
 * is exactly the sort of thing `AGENTS.md` warns about — "This is NOT the Next.js you know" —
 * and it is why the docs were read before the file was written rather than after it failed
 * to run.
 *
 * The proxy runs in the **Node.js runtime** by default in Next 16, so `node:crypto` (which
 * `lib/auth/session.ts` uses) is available and the `runtime` segment option must not be set.
 *
 * ### ⚠ What it decides, and what it deliberately does not
 *
 * It makes the **cryptographic** verdict only: signature, shape, and §5's thirty days. It
 * does **not** consult the revocation store, because Next's own proxy documentation says
 * *"you should not attempt relying on shared modules or globals"* — the proxy may be a
 * separate module instance from the route handlers, so a `Set` written by
 * `DELETE /api/session` is not something this file can honestly read. `lib/auth/authorize.ts`
 * makes the full verdict and every `/api/*` route runs it.
 *
 * The consequence, stated rather than hidden: a revoked cookie can still fetch the
 * dashboard's HTML **shell**, which carries no telemetry, and the first
 * `GET /api/telemetry` that shell makes is a 401 that §5.2 routes back to `/login`.
 *
 * ### ⚠ Adding this does NOT relax the route-level check
 *
 * HANDOVER §3.2 rule 4 and §6 item 3: *"If step 7 adds middleware, the route-level check
 * stays — middleware is not a reason to relax an ordering a test pins."* Both checks exist,
 * and `lib/telemetry/handler.test.ts` still asserts by call count that authorisation happens
 * before the sample.
 *
 * ### ⚠ It does not import `lib/telemetry/handler.ts`
 *
 * HANDOVER §6 item 8: that module builds the process's single `TelemetrySource` at load, and
 * loading it in a second runtime would mean a second 2 s cache and a second set of carried
 * counters. This file imports only the pure auth modules.
 *
 * ### The three exemptions, and §5 enumerates them exactly
 *
 * > §5: "**The login screen is the only *page* reachable unauthenticated**, and exactly two
 * > other things are: `POST`/`DELETE /api/session`, because there is no other way to obtain
 * > or discard a session; and the static assets under `_next/static`, `_next/image` and
 * > `favicon.ico`, because the login screen is a client component and its own JavaScript is
 * > served from there. **The gate's matcher must exempt all three, and nothing else.** No
 * > route that returns a reading is ever exempt."
 *
 * Two of them are this function's (`LOGIN_PATH`, `SESSION_PATH`, both exact matches); the
 * third is {@link config}'s matcher, because the proxy must not run for those assets at all.
 * Everything else is gated: `/api/*` answers **401 with no body** (§5's contract, so §5.2's
 * client routes to `/login` rather than taking §6.7's failed-poll path), and a page request
 * is redirected to `/login`.
 *
 * ⚠ **The two path constants live in `@/lib/auth/login-view`, not here.** Step 8 routes a 401
 * to `/login?expired=1` and step 10 needs `DELETE /api/session`, both from client code, and
 * this module imports `next/server` and `node:crypto`. One spelling of each literal, in the
 * one module a browser bundle may import. `login-view.ts` says the rest.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { readAuthConfig } from '@/lib/auth/config';
import { SESSION_COOKIE, readCookie } from '@/lib/auth/cookie';
import { EXPIRED_PARAM, LOGIN_PATH, SESSION_PATH } from '@/lib/auth/login-view';
import { verifiedSessionOf } from '@/lib/auth/session';

/**
 * ⚠ Without a matcher the proxy runs on **every** request including `_next/static`, so the
 * gate would also 302 the stylesheet the login screen needs and the page would render
 * unstyled. The negative pattern is the shape Next's own docs give for exactly this.
 *
 * `matcher` must be a literal — Next reads it at build time and silently ignores anything it
 * cannot statically analyse.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};

/** Never a body, never cached — §5, and a 401 that a cache could resurrect is worse than none. */
const refuse = (): NextResponse =>
  new NextResponse(null, { status: 401, headers: { 'cache-control': 'no-store' } });

/**
 * Send an unauthenticated page request to the login screen.
 *
 * **302**, explicitly, rather than `NextResponse.redirect`'s 307 default: 307 preserves the
 * method, so a POST to a gated page would be re-POSTed at `/login`. 302 is what every agent
 * turns into a GET, and it is the status §5.2 already uses for the success direction.
 *
 * ⚠ `?expired=1` **only when a cookie was present**. §5.2's *Session expired* state means
 * "arrived here from an expired session"; a first visit with no cookie at all is the *Idle*
 * state, and showing "Session expired — sign in again." to someone who has never signed in
 * would be a lie of the kind §6.5 exists to prevent.
 */
const toLogin = (request: NextRequest, hadCookie: boolean): NextResponse => {
  const target = new URL(LOGIN_PATH, request.url);
  if (hadCookie) target.searchParams.set(EXPIRED_PARAM, '1');
  return NextResponse.redirect(target, 302);
};

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // The two paths that must work without a session.
  if (pathname === LOGIN_PATH || pathname === SESSION_PATH) return NextResponse.next();

  const isApi = pathname.startsWith('/api/');
  let hadCookie = false;

  try {
    hadCookie = readCookie(request.headers.get('cookie'), SESSION_COOKIE) !== null;

    const credentials = readAuthConfig(process.env);
    if (credentials !== null) {
      const session = verifiedSessionOf(request, credentials.sessionSecret, Date.now());
      if (session !== null) return NextResponse.next();
    }
  } catch {
    // ⚠ §5: "any error raised while deciding — is 401, never 500." A throw here would
    // otherwise be Next's own 500 page, which puts the client on §6.7's failed-poll path
    // instead of sending the user to sign in. Falls through to the refusal below.
  }

  return isApi ? refuse() : toLogin(request, hadCookie);
}
