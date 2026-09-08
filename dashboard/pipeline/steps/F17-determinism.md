# 10a-F17 — making `serving.test.ts`'s slow-discovery test deterministic

**Owner ruling implemented 2026-09-08.** Scope: `lib/collectors/serving.test.ts` only.
`lib/collectors/deadline.ts` and `lib/collectors/serving.ts` are **untouched** — confirmed
below.

## The problem, restated precisely

`⚠ a slow discovery cannot band an alarm on a healthy instance` (§6.7's F1 regression test)
slept a **real** 95 ms inside a **real** 100 ms `discoveryTimeoutMs`, racing that sleep
against `deadline()`'s own real `setTimeout(reject, 100)`. `setTimeout` is a *minimum*
delay, not an exact one, so under CPU contention the 95 ms sleep could itself take
>100 ms of wall clock and lose a race the test was written to always win. Measured: 2/6
under load, 0/10 idle, and one unprompted `pnpm verify` failure.

## The seam chosen — and why it is NOT the one named in the handoff

The handoff's default suggestion was to inject a clock into `deadline(timeoutMs,
fallbackMs, now?)`, defaulting `now` to `performance.now`, and thread it through
`CollectServingOptions` to both `deadline()` call sites in `collectServing`. I did not take
that seam. Reasoning:

- It requires new production-code surface in two files (`deadline.ts` and `serving.ts`)
  purely to serve one test.
- Injecting `now` decouples the arithmetic (`deadlineAt - now()`) from the clock
  `setTimeout` actually counts on. In production this is a no-op (default parameter), but
  it creates a *class* of bug the handoff explicitly warns against: a caller could thread a
  `now` that is not the same clock `setTimeout` uses, and the two would disagree exactly the
  way `Date.now()` vs `performance.now()` disagree today. That is a strictly larger surface
  for the exact defect `deadline.ts`'s docstring exists to prevent, even though the default
  argument keeps today's behavior unchanged.

**What I used instead: `vi.useFakeTimers()`, entirely inside the test.** Vitest's fake
timers (backed by `@sinonjs/fake-timers`) replace `setTimeout`/`clearTimeout` **and**
`performance.now()` together, advanced in lockstep by `vi.advanceTimersByTimeAsync()`. I
verified this directly against this project's own `deadline()` before relying on it (throwaway
probe, not committed):

```ts
vi.useFakeTimers();
const t0 = performance.now();
const p = new Promise((resolve) => setTimeout(resolve, 95));
await vi.advanceTimersByTimeAsync(95);
await p;
console.log(performance.now() - t0); // >= 90, confirmed
```

and against a two-`deadline()` chain shaped exactly like `collectServing`'s discovery +
per-instance-probe structure (95 ms readDir, then two concurrent instances each doing two
sequential 20 ms "requests"), confirming a single `advanceTimersByTimeAsync` call correctly
cascades through nested/sequential timers and that a `deadline(100, 100)` given a 105 ms
operation still rejects exactly as before.

This turns "95 ms of a 100 ms budget" from a **race** (two independent clocks, real
`setTimeout` scheduling being a minimum-delay, best-effort guarantee) into an **exact
ordering fact**: the fake timer engine fires callbacks in scheduled-time order, and 95 < 100
deterministically, on every run, regardless of host load — because nothing is actually
waiting on the host's scheduler any more. The 95/100/20 numbers are untouched; the margin is
not widened by even 1 ms, it is just no longer executed against a real clock.

## Why `deadline.ts`'s monotonic property survives — because it was never touched

`git diff --stat -- lib/collectors/deadline.ts lib/collectors/serving.ts` is empty. Neither
file changed. `deadline()` still reads the real `performance.now()` in production, exactly
as before; its `Date.now()` vs `performance.now()` distinction (the reason the module exists
— `systemd-timesyncd` steps the wall clock on the very machine this dashboard watches) is not
exercised by the rewritten test at all, in either direction. The fake-timer seam lives
entirely inside the one test's `try { vi.useFakeTimers(); ... } finally { vi.useRealTimers();
}` block and cannot leak into, or be affected by, production behavior. This is the same
technique `deadline.test.ts` already uses for its own latch test (`vi.useFakeTimers({ toFake:
['setTimeout', 'clearTimeout'] })`), except here `performance` is left in the faked set
(the default) because the property under test needs `performance.now()` to advance with the
timers, not lag behind them.

## Proof the test can still fail

The rewritten test's own comment reproduces §6.7's original discriminator finding: with an
*instant* fake, a probe handed the ~5 ms left of a re-shared budget still wins the race and
the defect is invisible (measured previously in the adversarial phase). The 20 ms HTTP fake
delay is kept unchanged for exactly this reason, and it is now enforced deterministically
under the fake clock rather than merely "usually enough."

I reintroduced the exact historical F1 defect twice (matching the harness's own `05-V20`
mutation) — the per-instance probe budget replaced with the shared `discovery` deadline
instead of a fresh one:

```diff
- const probed = await probe(http, deadline(probeBudget, SERVING_PROBE_TIMEOUT_MS), env, probeBudget);
+ const probed = await probe(http, discovery, env, probeBudget);
```

Both times, `pnpm vitest run lib/collectors/serving.test.ts` reddened **only** this test
(32/33 others stayed green), deterministically, across repeated runs:

```
AssertionError: expected [ 'unreachable', 'unreachable' ] to deeply equal [ 'ok', 'ok' ]
 FAIL  lib/collectors/serving.test.ts > the budget is never evidence about a subject (§6.7)
       > ⚠ a slow discovery cannot band an alarm on a healthy instance
```

reddened 4/4 times it was tried (3 repeats the first pass, 1 more the second, both under the
identical mutation). Each time the file was restored from a backup copy and `git diff --stat
-- lib/collectors/serving.ts` confirmed empty (byte-identical to HEAD) before moving on, and
`pnpm vitest run lib/collectors/serving.test.ts` returned to 33/33 immediately after revert.

## Repeat-run tally — the deliverable

`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"` first, as
required. `pnpm vitest run lib/collectors/serving.test.ts`, run as plain sequential
foreground commands (never inside a `pgrep`-style wait loop):

| condition | runs | pass | fail |
|---|---|---|---|
| idle | 10 | 10 | 0 |
| idle (second batch, after the harness) | 15 | 15 | 0 |
| **under load** — six `yes > /dev/null &` pinned across a 10-core Mac | 20 | 20 | 0 |
| **under load** — same, second batch | 15 | 15 | 0 |
| **totals** | **60** | **60** | **0** |

Plus the 4/4 reddening runs above (expected failures, confirming the test is not inert), each
followed by a clean revert. 0 flakes in 60 green runs across two separate loaded batches,
against a defect that reproduced 2/6 before this fix.

## Step 5's harness (127 mutations)

`python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py`, run alone (no
`pnpm verify` running concurrently), as a single foreground/background-then-monitored
invocation — no `pgrep` wait loop was used.

- **All 127 mutations failed their check, as required.** No `DID NOT BITE`, no `ANCHOR NOT
  FOUND`, no `ANCHORS AMBIGUOUS`.
- **Ledger: every ⚠-marked test (97 of them) went red under at least one mutation.**
  `05-V20 the probes spend the DISCOVERY budget, so a slow listing blames the servers` —
  the harness's own pre-existing copy of the exact defect I hand-verified above — reddens
  `⚠ a slow discovery cannot band an alarm on a healthy instance` on its own, as it did
  before this change. `05-V19` (the sibling shared-budget mutation) continues to redden the
  neighboring "a LATE-starting instance gets a whole probe budget" test, unaffected.
- **No new mutation was added.** Since the fix touches only test-side timing infrastructure
  and adds no new production behavior (`deadline.ts` and `serving.ts` are unmodified, and the
  test's name did not change), there is no new source-text property for a `10a-F17`-prefixed
  mutation to guard, and the pre-existing `05-V19`/`05-V20` already certify the property this
  test protects. `git status --porcelain` after the harness run showed only the intended
  `lib/collectors/serving.test.ts` edit under `lib/` — no stranded mutation.

Tail of the harness's own summary:

```
Red-test ledger: 184 distinct failing tests across 127 mutations; 97 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 127 regressions failed their check, as they must.
```

## `pnpm verify`

Cold run (`rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run`), not run alongside the
harness:

```
Test Files  91 passed (91)
     Tests  2512 passed (2512)
Type Errors  no errors
```

Exit 0.

## Files touched

- `lib/collectors/serving.test.ts` — the one test rewritten to use `vi.useFakeTimers()` /
  `vi.advanceTimersByTimeAsync()` instead of real sleeps. Test name, assertions, and the
  95/100/20 ms constants are unchanged. `import { vi } from 'vitest'` added to the file's
  existing import.
- `lib/collectors/deadline.ts` — **not touched.**
- `lib/collectors/serving.ts` — **not touched.**
- `pipeline/steps/05-collectors-serving-storage-safety/regressions.py` — **not touched**
  (no new mutation needed; see above).
