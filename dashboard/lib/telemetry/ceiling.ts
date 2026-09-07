/**
 * §4's per-collector ceiling — and it is on `collectHost` **alone**.
 *
 * > §4: "Five of the six collectors carry a monotonic budget of their own (§6.7) and are
 * > guaranteed to settle. `collectHost` does not — its `/proc` and `/sys` reads carry no
 * > bound — so it alone carries a **6 s ceiling at the assembly**, equal to the poll's
 * > blessed worst case, so it can neither shorten a healthy poll nor pre-empt a collector
 * > that is merely slow."
 *
 * ---
 *
 * ### ⚠ Why `collectHost` and nothing else
 *
 * Two independent reasons, either sufficient:
 *
 * 1. **It is the only collector with no budget.** O17 exempts `readFile`/`readDir` from
 *    carrying one, on the grounds that procfs does not block. That premise is not the
 *    failure mode: measured on this project, four concurrently blocked libuv thread-pool
 *    operations block **every** subsequent `readFile`, `readdir` and `statfs` in the
 *    process, indefinitely. `collectHost`'s reads then never start — not because procfs
 *    blocked, but because another collector's abandoned work has taken the pool.
 * 2. **It is the only collector with no per-subject verdicts.** §6.5 forbids a
 *    collector-wide bound that could blank a per-instance verdict; `collectServing` is the
 *    collector that has them, and a ceiling over it is precisely the forbidden thing.
 *    `collectHost` blanks nine figures that are all its own.
 *
 * ### ⚠ Generous, not tight — 6 s, and the number is not free to choose
 *
 * {@link HOST_CEILING_MS} equals the poll's existing blessed worst case (§6.7:
 * `collectServing`'s 2 s discovery + 4 s probe). A **tighter** ceiling would fire during
 * thread-pool contention *caused by another collector* and mint nine host failure verdicts
 * from another subject's problem — §6.7 forbids exactly that, and it is HANDOVER §6 item
 * 1's harm in miniature. A ceiling here can only ever shorten `collectHost`; it must never
 * be able to shorten a healthy poll.
 *
 * ### ⚠ `Promise.race` against a timer, never an `AbortSignal`
 *
 * Measured: aborting a blocked `fs` read frees no worker **and never settles the read's own
 * promise** — not even with an `AbortError`. There is no correct cancellation to reach for,
 * so the ceiling settles the *request* and abandons the work, which is what
 * `lib/collectors/deadline.ts` already does for every other collector. Timers are event-loop
 * work rather than pool work, so a ceiling still fires while the pool is starved — without
 * that, the whole mechanism would be circular.
 *
 * ### ⚠ A ceiling never ships without the gate
 *
 * §4: "Neither half ships without the other." Today the in-flight cache is an accidental
 * fail-stop — a wedged `collectHost` never settles, so the sample never settles, so no
 * further collector call is ever issued. The endpoint is dead, but nothing accumulates. A
 * ceiling **removes that back-pressure**: every poll settles, every poll re-issues, and
 * every poll leaves one more permanently blocked worker. That is why `source.ts` composes
 * this **outside** {@link oneAtATime} and never alone — see the composition note there.
 *
 * ### The budget itself is `deadline()`'s, not a new one
 *
 * `deadline` is the project's single definition of a validated, monotonic budget (HANDOVER
 * §5.3): it clamps the delay through `boundedTimeoutMs`, counts on `performance.now()`,
 * clears its timer when the call settles, and subscribes to the abandoned promise so a late
 * rejection can never surface as an `unhandledRejection` that takes the route down. A
 * hand-rolled `Promise.race` here would be the fifth hand-rolled bound in this tree.
 */

import { deadline } from '@/lib/collectors';

import type { SnapshotCollectors } from './snapshot';

/**
 * §4's ceiling: **6 s**, equal to the poll's blessed worst case (§6.7).
 *
 * ⚠ Not a tuning knob. See the module doc: a smaller number converts another collector's
 * slowness into nine host failure verdicts.
 */
export const HOST_CEILING_MS = 6000;

/**
 * The same six collectors, with `collectHost` bounded and the other five **untouched**.
 *
 * The five are passed through by identity, not re-wrapped, so "only host carries a ceiling"
 * is observable rather than merely intended.
 */
export const withHostCeiling = (
  collectors: SnapshotCollectors,
  ceilingMs: number = HOST_CEILING_MS,
): SnapshotCollectors => ({
  ...collectors,
  // A fresh budget per call: it must start when the call does, not when the source was
  // constructed. `deadline`'s rejection reads `timed out after 6000 ms`, which is what
  // §6.7 asks an abandoned reading's entry to say — the budget, not the subject.
  host: (options) => deadline(ceilingMs, HOST_CEILING_MS)(() => collectors.host(options)),
});
