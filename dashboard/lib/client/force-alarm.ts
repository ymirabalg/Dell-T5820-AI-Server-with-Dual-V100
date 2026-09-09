/**
 * 10a-F4's second half — a way to force an alarm client-side, so the sticky banner (§6.4) can
 * be exercised without waiting for a real excursion. Without this the banner never mounts on a
 * quiet box, which is exactly why the manual pass in 10a's build could not have caught 10a's
 * z-index occlusion bug (`HANDOVER.md` §0.3 item 3: two sticky siblings overlapping rather than
 * stacking) — nobody could get the banner on screen to look at it.
 *
 * ### Why this reshapes the RESPONSE rather than fabricating a `DisplayedCondition`
 *
 * `lib/conditions.ts`'s `DisplayedCondition` is documented "never built by hand" — it only
 * ever comes out of `observePoll`'s debounce/standing pipeline. Constructing one here to hand
 * straight to the banner would violate that, and would also have to be kept in sync by hand
 * with every other field `alarmCount`/`state.severity` derive from `state.displayed` — the
 * exact "one reduction" duplication §9 forbids. Instead this module sits behind
 * `RuntimeEnv.fetchTelemetry` (`lib/client/env.ts`), the seam that already exists for the real
 * network round-trip, and mutates the ALREADY-RECEIVED JSON body before `wire.ts` validates
 * it. Every later stage — validation, §6.3's severity bands, the 10 s debounce, the banner's
 * own ordering — runs unmodified and for real, so a forced alarm takes the same two-poll
 * confirmation delay a genuine one would. That is a feature for this tool's purpose (exercising
 * the real timing), not an accident of the implementation.
 *
 * ### Invariant 2 — still read-only
 *
 * This never builds a request and never changes what is sent to `/api/telemetry`. It only
 * reshapes, in the browser's own memory, the JSON body the browser already received. The box
 * is untouched either way.
 *
 * ### ⚠ Production unreachability — VERIFIED by building, and the verification corrected the
 *     original claim (invariant 6: verify rather than assert)
 *
 * The first draft of this file claimed `next build`'s minifier deletes this function's body
 * outright, the same way jsdom never reaches `.next/standalone` (10a's D6 precedent). **That
 * claim was checked by actually building and grepping the client bundle, and it was wrong.**
 * `pnpm build` then `grep -rl forceAlarmForTesting .next/static` finds the literal string in
 * `.next/static/chunks/*.js` — the function ships, unminified away, string and all.
 *
 * What the same grep also shows is why the gate still holds. The ONE call site
 * (`use-telemetry.ts`) reads `process.env.NODE_ENV` and Next's build DOES replace that read
 * with the literal `"production"` — the compiled call is
 * `…(e.body,window.location.search,"production")`, not a variable. So `nodeEnv` inside this
 * function is a hard-coded string baked in at build time for the ONE place it is ever called;
 * no input from the browser — not a query string, not a spoofed global — can make that
 * argument anything else, because it is never read from anywhere at runtime. The minifier
 * simply does not go one step further and inline the CALLEE's body at that call site too (an
 * interprocedural optimisation ordinary JS minifiers do not perform for a function this
 * shape), which is why the dead branch's code and its string literal are still bytes in the
 * bundle even though they can never execute in a production build.
 *
 * **The honest claim, stated precisely:** the escape hatch cannot be TRIGGERED in a
 * production build — the query-string check is provably unreachable, not merely
 * false-by-default — but it is not ABSENT from the bundle the way jsdom is absent from
 * `.next/standalone`. `10c1-build.md` §3 carries the full grep output this section
 * summarises, and the earlier stronger wording is a record of what invariant 6's
 * "verify rather than assert" caught, kept rather than quietly fixed.
 *
 * A second gate — an explicit, undocumented query string, never a bare "debug mode" flag — is
 * kept regardless: it is what stops a `next dev` server (real `NODE_ENV` of `'development'`,
 * genuinely reachable at that call site) from forcing an alarm for every visitor by default.
 */

/** The query-string flag this module looks for. Exported so `10c1-build.md`'s verification
 *  grep and this file's own tests read the identical literal rather than two copies. */
export const FORCE_ALARM_PARAM = 'forceAlarmForTesting';

/** §6.3: `tempC >= 80` is `'alarm'` for a GPU. Comfortably past the band, not merely across it,
 *  so a slow poll or a rounding formatter can never leave this short of alarm-level. */
const FORCED_ALARM_TEMP_C = 95;

/**
 * Reshape an already-parsed `/api/telemetry` body to force GPU 0's temperature into §6.3's
 * alarm band, IF AND ONLY IF `nodeEnv` is not `'production'` and `search` carries
 * {@link FORCE_ALARM_PARAM}. A pure function of its three inputs — no `window`, no
 * `process.env` read inside it — so it is testable in plain Node with no DOM, matching this
 * project's `RuntimeEnv` seam pattern (`lib/client/env.ts`'s own module doc).
 *
 * Returns `body` UNCHANGED (the identical reference, not a clone) whenever either gate fails
 * or the body does not have the shape expected — a snapshot missing `gpus` or an empty array
 * is left alone rather than thrown at, since `wire.ts` is still the one place that decides
 * whether a body is valid at all.
 */
export function forceAlarmForTesting(body: unknown, search: string, nodeEnv: string | undefined): unknown {
  if (nodeEnv === 'production') return body;
  if (!new URLSearchParams(search).has(FORCE_ALARM_PARAM)) return body;
  if (body === null || typeof body !== 'object') return body;
  const snapshot = body as { readonly gpus?: unknown };
  if (!Array.isArray(snapshot.gpus) || snapshot.gpus.length === 0) return body;
  const [firstGpu, ...restGpus] = snapshot.gpus as readonly unknown[];
  if (firstGpu === null || typeof firstGpu !== 'object') return body;
  const forcedGpu = { ...(firstGpu as Record<string, unknown>), tempC: FORCED_ALARM_TEMP_C };
  return { ...snapshot, gpus: [forcedGpu, ...restGpus] };
}
