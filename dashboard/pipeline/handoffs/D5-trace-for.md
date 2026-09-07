# Handoff — D5: `traceFor`, one call instead of three

**BUILD phase, clean context.** Read this, then `HANDOVER.md` §1, §5, §6 (rule 3 and rule 10),
and `pipeline/UI-BACKEND-GAPS.md` §2.3. `SPEC.md` §6.7 is the authority.

---

## What it is for

Every trace on the dashboard is three calls in a fixed order:

```ts
samplesWithin(ring, windowMs)                       // ring.ts:164
  → seriesFrom(samples, pick)                       // series.ts:82
  → decimateSeries(points, MAX_RENDERED_POINTS)     // series.ts:101
```

Four panels repeat it — GPU 0, GPU 1, CPU, and §6.2's stacked cooling chart, which alone has
three traces. **The order is silently load-bearing.**

⚠ **Decimating before windowing spends the 600-point budget on data that is not drawn**, and
produces a chart that is *subtly wrong rather than obviously broken* — the worst failure shape
this project has. Nothing today catches it: both orders type-check, both return points, and the
error is a slightly-wrong curve.

## What to build

In `lib/client/series.ts` (it owns decimation and already documents the budget):

```ts
export const traceFor = (
  state: RuntimeState,
  pick: (snapshot: TelemetrySnapshot) => number | null,
): readonly SeriesPoint[]
```

Take the window from `state.preferences.windowMinutes` via `windowMs()` — a caller that passes
its own window is a caller that can disagree with the selector.

## ⚠ Four things the composition must get right

1. **`samplesWithin` takes NO `nowMs`.** It is anchored on the newest sample's `ts`
   (§6.7). A call written from an older note will not compile — that is the safe direction —
   but **do not re-add the parameter.** Anchored on the browser's clock, a server 31 minutes
   behind empties a 30-minute chart while the ring is full of good data and the header still
   reads `live`.
2. **600 points PER SERIES, not per chart** (§6.7, settled 2026-09-07). `traceFor` is called
   once per trace, so the stacked chart draws up to 1,800. **Do not add a per-chart budget** —
   HANDOVER §6 rule 10.
3. **Window first, then pick, then decimate.** That is the whole point; make the order
   impossible to get wrong from outside, and say at the code what the other order costs.
4. **`pick` returning `null` is a hole, not a zero.** Invariant 1. `seriesFrom` already carries
   `v: number | null`; do not coerce, filter or interpolate. §6.7: *"traces freeze rather than
   plotting zeros"*, and decimation deliberately drops a `null` inside an otherwise readable
   bucket — which is exactly why gaps are hatched from `state.gaps` and **never inferred from
   holes in a series** (HANDOVER §6 rule 3).

## ⚠ And one thing NOT to do

**Do not make `traceFor` take the gaps, or return them.** A trace and a hatch are two different
renderings of two different facts, and joining them here would invite a panel to infer one from
the other.

## Rules

- `pnpm verify` exiting 0 is the only green. Never a printed summary.
- ⚠ Never run a harness concurrently with `verify` or another harness. Serially.
- Mark load-bearing tests `⚠` and back each with a mutation. `series.test.ts` is **step 8's**.
- **Both sides of every boundary.** Here: a window that includes the boundary sample and one
  that excludes it; a series just under 600 points and one just over.
- ⚠ **The order is the property.** Write a mutation that swaps decimate-before-window and prove
  a test goes red — if none does, the wrapper has bought nothing and you have found that out
  before shipping it, which is the point.
- Do not touch `SPEC.md`, `MOCK.html`, `PLAN.md`. Do not commit. Do not touch the box.

## Report back

What you built, the mutation proving the order is load-bearing, anything out of scope you found,
and the real evidence output.
