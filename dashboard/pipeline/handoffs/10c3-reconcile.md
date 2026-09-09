# Handoff — Step 10c-3, RECONCILE phase. **Step 10 was to close with this.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project.

⚠ Background subagent. `ANCHOR.md` §8 lists **four things the parent does not delegate** (§5) and
defines the **parent's review** as the phase that closes this. Read §8 first.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `SPEC.md` §6.1 → `SCOPE.md` →
`10c3-build.md` → `10c3-test.md` → `10c3-adversarial.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. 10c-3 uncommitted; all else at `6c2e64a`.

## 1. ⚠ This loop cannot close step 10 as planned

Adversarial raised **12 findings, 9 EXECUTED**, and **A1 is a spec-level failure, not a defect in
10c-3's work.** Adjudicate all 12 — but the honest outcome may be that step 10 closes with a
recorded, owner-facing failure rather than a green one. **Say so if so.**

## 2. ⚠ Confirmed by the parent

| | |
|---|---|
| **A3 — a vacuous PASS, verified** | The grid renders `data-slot="storage-and-network"` and `"session-event-log"`. **The script queries `'storage'` and `'log'`.** Those elements do not exist, the ordering predicate skips `null`s, and measurement 6 prints `PASS … -> STORAGE -> LOG` having looked at nothing. **Two phases read that line as evidence.** Measurement 4 has a second vacuous path: `gridTemplateColumns: none` splits to length 1, so it "passes" on a non-grid element |
| green | `pnpm verify` exit **0**, 99 files, 2788 tests — parent |
| no leaked browser | parent — the Chrome here is the user's own |

## 3. A1 — §6.1's only quantitative promise is measured false

§6.1: *"The 'no scroll' promise holds at ≥1280px wide **and ≥1024px tall**"*, and at 1920×1080 it
*"fits comfortably"*. Measured in real Chrome: **1280×1024 → 1413px** (scrolls 389),
**1600×1024 → 1333** (309), **1920×1080 → 1317** (237). The overflow is **the grid itself** (sticky
band 49 + grid 1268), not a dev overlay.

⚠ **And that is the most favourable case**: the GPU cards were only 162px tall because `gpus: null`
put them in the takeover branch. With real cards it is worse.

**None of the seven measurements checks this**, and the script measures the 1280 checkpoint at
height **900** — below the 1024 the promise is conditioned on.

**What to do, and what NOT to do:**

1. ⚠ **Re-derive A1 independently of the script's pass/fail predicates** — A3 proves those are
   unreliable. A1 was measured from `getBoundingClientRect`, which is not affected, but confirm it
   yourself before anyone acts on it.
2. **Do not "fix" §6.1 by shrinking a panel on your own judgment.** Either the layout must change or
   §6.1's numbers must — and **§6.1's numbers are the owner's**. This is invariant 7 in its
   strongest form: the spec makes a measurable promise the build does not keep.
3. **Fix the script's vacuous paths (A3)** — that *is* yours, and it is the reason nobody noticed.

## 4. The rest

- **A2** — measurement #7 has never been observed, and the adversarial **widens** it: the media
  query has two sides and **neither** has ever been seen, including the 1280–1599 design target.
  Both failure modes (two charts, or none) are silent in `pnpm verify` and in the six passing
  measurements. It also found the lever is **cheaper than either document claims**: the
  `RuntimeEnv.fetchTelemetry` seam plus **one fabricated card with every field null**, since both
  primitives emit an `<svg>` on their empty branch. No hardware needed.
- **A6** — deleting `gaps={state.gaps}` from **both** CPU call sites leaves **2801/2801 green** and
  neither harness names it. F14b's fix is unguarded where it was just installed.
- **A7** — ⚠ **`CHART_SIZE.cooling` declares 210 for a chart that paints 450**, and the new
  `gpuPromoted` entry's recorded justification is **derived from that misreading**. L9's canonical
  value is built on a wrong number.
- **A4 / A5** — sparkline and chart **disagree about gaps**: the sparkline drops a gap entirely (no
  hatch, no table row) when a `null` reading abuts it, while the promoted chart hatches and lists
  it; and in §6.7's blessed refresh-now-while-paused case one gap draws 3 marks and 3 identical
  table rows where the chart draws 1.
- **A8** — the gap tint is a **colour-only** signal at **1.12:1** contrast. §9 forbids identity
  resting on colour alone.

**Could-not-break is substantial** — `clipPlotsToDomain`'s inclusivity (both operators
load-bearing and defended), zero-width domains, one-instant series, `Q2-H10`'s retirement,
chart/table point agreement, all guards green at 227/227. **Do not re-spend budget there.**

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. Do not commit or stage. 2. Your green is not the green. 3. **Do not edit `SPEC.md`** — A1 makes
this rule load-bearing. 4. Nothing outside `dashboard/`; do not weaken `purity.test.ts`.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/09-ui-primitives/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
```

⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**. ⚠ **Never
poll** (ANCHOR §9). `git status` after each. ⚠ **If you launch a browser, close only what you
launched** — the user's own Chrome is running here. New mutations **`10c-`**.

## 7. Deliverables

1. `steps/10-panels-assembly/10c3-reconciliation.md` — all 12, verdicts and reasons.
2. **Rewrite `pipeline/HANDOVER.md`** — every deferral with an owner, and **A1 stated as an
   owner-facing spec failure with its measurements**, not buried in a table.
3. Correct `10c3-build.md` where A7 shows the L9 justification rests on a wrong number.
4. Update `ANCHOR.md` §2.2 — ⚠ **state honestly whether step 10 is closed or closed-with-a-known
   failure**, and what step 11 inherits.

## 8. Report back

One line per finding with its verdict, what you applied, what you re-ran, and — explicitly —
**whether step 10 can be called done.**
