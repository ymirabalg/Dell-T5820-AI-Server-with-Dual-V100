/**
 * `GET /api/telemetry` (§4) — the whole of the route, which is deliberately four lines.
 *
 * Everything testable lives in `@/lib/telemetry/handler`: a `route.ts` may only export the
 * names Next recognises, so the session seam and the telemetry source cannot be exported
 * from here, and a handler reachable only through the framework would be tested against the
 * framework instead of against the spec.
 *
 * ⚠ **`force-dynamic` is load-bearing, not boilerplate.** §4: "Sampling is per-request, not
 * a background loop." Without it a `GET` route handler with no request-time API is a
 * candidate for prerendering, and `next build` would *run the collectors on the build
 * machine* and bake the result — a snapshot of a developer's Mac, served to the browser as
 * this box's telemetry, with `nvidia-smi` absent and `/proc/stat` unreadable. The failure
 * would look exactly like a dead server rather than like a build-time mistake.
 *
 * ⚠ **`GET` is written with an explicit single parameter**, not as a bare alias for
 * `handleTelemetry`. Next calls a route handler as `GET(request, context)`, and
 * `handleTelemetry`'s second parameter is its injected dependencies — so
 * `export const GET = handleTelemetry` would hand the route's `{ params }` object in as the
 * session check and the telemetry source, and every request would fail on it.
 */

import { handleTelemetry } from '@/lib/telemetry/handler';

export const dynamic = 'force-dynamic';

export const GET = (request: Request): Promise<Response> => handleTelemetry(request);
