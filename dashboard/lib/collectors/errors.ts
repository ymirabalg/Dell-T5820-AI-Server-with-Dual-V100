/**
 * The three helpers every IO wrapper needs to turn a rejection into an `errors[]` entry.
 *
 * They were private to `collect.ts` while step 3 was the only collector. Step 4 adds a
 * second wrapper (`cooling.ts`) and a shared hwmon walk (`hwmon.ts`), and a second copy of
 * either would be drift of exactly the kind HANDOVER §6 warns about for `numbers.ts` —
 * "a second strict-parse helper anywhere is a second definition of null", one layer up.
 *
 * ⚠ They live **here** rather than being exported from `collect.ts` so that `collect.ts`
 * can adopt {@link module:lib/collectors/hwmon}'s walk later without an import cycle
 * (`collect → hwmon → collect`). Moving the definitions changed no call site, so step 3's
 * regression anchors still hit.
 *
 * No IO. Both functions are pure.
 */

import type { ErrorSource, TelemetryError } from '../types';

/**
 * An error message, tagged with the §3.7 source that explains which figure it blanks.
 *
 * §6.5 requires "matching an error to the figure it explains", which is the whole reason
 * `ErrorSource` is a closed set of eighteen names rather than a free string.
 */
export const tag = (source: ErrorSource, messages: readonly string[]): TelemetryError[] =>
  messages.map((message) => ({ source, message }));

/**
 * Turn a rejected read into one message. `unknown` because a `catch` binding always is.
 *
 * ⚠ **This deliberately keeps only the prose.** Where the *errno* matters — §3.7's `pwm5`
 * probe has to tell `ENODATA` (healthy EC auto) from `EACCES` (unknown mode) — read
 * `error.code` with {@link errnoCodeOf} instead. HANDOVER: "Do not match on message text."
 */
export const reason = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'unknown failure';

/**
 * Read `error.code` off a rejection, as a string, or `null`.
 *
 * ⚠ **Sometimes the code is the whole answer, and the prose cannot carry it.** §3.7's
 * `pwm5` probe has to tell `ENODATA` — healthy EC auto, invariant 3 — from `EACCES`, an
 * unknown mode; they differ in one field of the error object and in nothing else that is
 * safe to look at. HANDOVER: "Do not match on message text" — a `readFile` message is
 * localised prose around a path, and `describeExecFailure` in `io.ts` is the precedent for
 * taking the code instead. {@link reason} is the complement: it keeps only the prose, for
 * the `errors[]` entry a human reads.
 *
 * ⚠ **A numeric code is `null`, deliberately.** Node surfaces errnos as strings; a `61`
 * would be a different convention, and stringifying it would put `'61'` up against
 * `'ENODATA'` in an equality that then silently never matches.
 *
 * Verified 2026-09-06 that the code survives the trip: libuv 1.52 carries `ENODATA` in its
 * error map (`util.getSystemErrorMap()` lists it, on both Node 24 and 26), so Node surfaces
 * Linux errno 61 as `code: 'ENODATA'` rather than as `UNKNOWN`.
 *
 * ⚠ **It lives here, not in `dell-smm.ts`, because step 5 is the third caller.** `/health`
 * distinguishes `unhealthy` (503) from `unreachable` off the status, and D-Bus needs the
 * code off its rejection. Both need this discipline and neither has any business importing
 * a Dell module to get it.
 */
export const errnoCodeOf = (e: unknown): string | null => {
  if (typeof e !== 'object' || e === null) return null;
  const code = (e as { readonly code?: unknown }).code;
  return typeof code === 'string' && code !== '' ? code : null;
};
