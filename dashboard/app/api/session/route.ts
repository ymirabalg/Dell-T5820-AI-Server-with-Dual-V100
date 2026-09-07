/**
 * `POST /api/session` · `DELETE /api/session` (§4, §5) — the whole of the route.
 *
 * Everything testable lives in `@/lib/auth/handler`, for the reason `app/api/telemetry/route.ts`
 * gives: a `route.ts` may only export the names Next recognises, so the rate limiter, the
 * clocks and the credential source cannot be exported from here.
 *
 * ⚠ **Both handlers are written as explicit single-parameter wrappers**, never as
 * `export const POST = handleSessionPost`. Next calls a route handler as
 * `POST(request, context)` and both handlers' second parameter is their injected
 * dependencies — so an alias would hand the route's `{ params }` in as the rate limiter, the
 * clock and the credential source, and every login would fail on it. Step 6 measured this
 * exact mistake on `GET /api/telemetry` (mutation `N2`).
 *
 * ⚠ **`force-dynamic`**, for the same reason as the telemetry route: §4 samples per request,
 * and nothing here may be prerendered or cached.
 */

import { handleSessionDelete, handleSessionPost } from '@/lib/auth/handler';

export const dynamic = 'force-dynamic';

export const POST = (request: Request): Promise<Response> => handleSessionPost(request);

export const DELETE = (request: Request): Response => handleSessionDelete(request);
