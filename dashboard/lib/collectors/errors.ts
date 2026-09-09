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
 *
 * ⚠ **`instance` (10b-S-G) is set on every message in the batch, or on none.** A caller
 * with several messages about different instances calls this once per instance, never once
 * for the batch — the same discipline `collectUnitStates` follows per unit. Omit it (the
 * default) for a message that names no instance; passing `undefined` explicitly is the same
 * as omitting it, never a way to attach "no instance" as a distinct value.
 *
 * ⚠ **That last sentence is true of THIS function and of nothing else** (adversarial A11,
 * recorded 2026-09-08; **corrected 2026-09-08 by 10c-2's test phase** — `exactOptionalPropertyTypes`
 * has been **on** since the first commit, not off; `{ ...base, instance: maybeUndefined }` with
 * `maybeUndefined: number | undefined` fails to compile today (`tsc` reports TS2375), which is
 * exactly what the flag being on buys). `contract.test.ts` asserts
 * `Object.hasOwn(entry, 'instance') === false` for an entry that names no instance, and that is
 * still a RUNTIME guarantee the type system does not fully carry on its own: `tsc` only catches a
 * spread it can see the type of, so an entry assembled through a loosely-typed path (an `any`, a
 * cast, a value threaded through `JSON.parse`) could still end up with the key present and
 * holding `undefined`. It holds today only because this function branches on `undefined` rather
 * than spreading it, and because `JSON.stringify` drops an `undefined` value on the way out.
 * Mint entries here.
 */
export const tag = (
  source: ErrorSource,
  messages: readonly string[],
  instance?: number,
): TelemetryError[] =>
  messages.map((message) => (instance === undefined ? { source, message } : { source, message, instance }));

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
