# Handoff — 10a-F17: make `pnpm verify` deterministic

**Written by the parent, 2026-09-08, implementing an owner ruling.** Fresh agent, no memory of
this project. Read this file, then `pipeline/HANDOVER.md` §0.3, then `lib/collectors/deadline.ts`
(**its whole docstring — it is the reason this is delicate**), then `ANCHOR.md` §4/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree is dirty with **10b's uncommitted
build** — do not touch `components/panels/`, `components/`, or `pipeline/steps/10-panels-assembly/`.

## 1. The problem, and why it outranks its size

`lib/collectors/serving.test.ts` — `⚠ a slow discovery cannot band an alarm on a healthy instance`
(~line 592) — sleeps a **real 95 ms** inside a **100 ms** `discoveryTimeoutMs`, with a second real
20 ms sleep in its HTTP fake. Under load it loses the race: it failed one `pnpm verify` run
unprompted and reproduced **2 in 6** under CPU load.

**A `⚠` test that reddens probabilistically can be falsely credited by ANY harness ledger in this
project.** `PLAN.md` says a probabilistic *mutation* is worse than none because the ledger cannot
distinguish it from a sound one; this is the same disease in the test. And `pnpm verify` exiting 0
is the **only** acceptance signal this project has — every step has been accepted on it.

The owner ruled: **fix it now**, ahead of 10b landing, rather than deferring to 10c.

## 2. ⚠ The two things you must not do

1. **Do not widen the margin.** Raising 100 ms, lowering 95 ms, or adding slack makes the flake
   rarer and leaves it a flake. `HANDOVER.md` names this explicitly.
2. **Do not break `deadline.ts`'s monotonic-clock property.** Read its docstring: it exists
   *because* `Date.now()` is the wall clock and steppable while `setTimeout` counts on the
   monotonic clock, and mixing them breaks whenever `systemd-timesyncd` steps the clock — the
   first sync after boot, on the very machine this dashboard watches. It also documents a
   **latch** around `performance.now()` and libuv's cached millisecond clock. If your seam
   changes any of that, you have made a worse bug than the one you fixed.

## 3. What the test must still prove

Its name is its contract: **a slow discovery cannot band an alarm on a healthy instance.** The
existing body asserts both instances answer `ok`, both models resolve, four probes are requested,
**no `llama-health` entry is filed**, and both severities are `normal`.

⚠ Its own comments record two measured facts that constrain your fix — read them before editing:

- *"The probes must take measurable time. With an instant fake, a probe handed the ~5 ms left of
  the discovery budget still WINS the race, and the defect is invisible."* A naive move to fake
  timers or zero-delay fakes **deletes the test's meaning** while leaving it green.
- The *"rejected without being started"* discriminator was **measured not to cover this**.

So the bar is: **deterministic, and still able to fail** if the defect returns. A test that cannot
fail is worse than a flaky one. Prove it still fails — reintroduce the defect, watch it redden,
revert.

## 4. The approach the project has already named

**Inject a clock.** `deadline(timeoutMs, fallbackMs)` closes over `performance.now()`; an optional
injected `now` (defaulting to the real one) lets the test drive elapsed time exactly, so "95 ms of
a 100 ms budget" becomes an arithmetic fact rather than a race. Thread it only as far as it needs
to go.

**If you find a better seam, take it** — but say in your notes why, and satisfy §2 and §3 either
way. If you conclude the honest fix changes what the test can prove, **stop and report** rather
than shipping a weaker test with a confident name.

## 5. The bar

- The test keeps its **`⚠`** and stays in **step 5's** ledger.
- If you add a mutation, prefix it **`10a-`** — ids carry their *creating* step, and this is
  10a-F17's fix (`ANCHOR.md` §9). It goes in **step 5's** harness, where the test lives.
- ⚠ **Re-run step 5's harness in full** (`05-collectors-serving-storage-safety`, **127
  mutations**) — you are editing a file in its `LEDGER_FILES`, and a changed test name changes
  what the ledger matches.
- **Determinism is the deliverable.** Run `pnpm vitest run lib/collectors/serving.test.ts` **at
  least 10 times**, and ideally under load, and report the tally. "It passed once" is not evidence.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; two orphans already
  killed). Plain **sequential foreground commands**.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit. Do not edit `SPEC.md`.** Scope: `lib/collectors/serving.test.ts`,
  `lib/collectors/deadline.ts` and its callers if the seam requires it, and step 5's harness.
  **Nothing under `components/`, `app/`, or step 10** — 10b's build is uncommitted in this tree.

## 7. Deliverable

`pipeline/steps/F17-determinism.md`: the seam you chose and why, how `deadline.ts`'s monotonic
property is preserved, the proof the test can still fail, the **repeat-run tally**, step 5's
harness result, and `pnpm verify`. Report back briefly.
