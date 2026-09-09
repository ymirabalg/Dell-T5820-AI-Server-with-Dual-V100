# Step 10c-3 — sizing and visual (RECONCILIATION). **Step 10 closes with this loop — and it does not close green.**

**Written by the reconcile agent, 2026-09-09.** Fresh agent, no memory of prior sessions.
Branch `dashboard-frontend`, 10c-3 uncommitted, everything else at `6c2e64a`.

---

## 0. The headline, before the table

**Step 10 closes CLOSED-WITH-A-KNOWN-FAILURE, not green.** Every finding is adjudicated, every
accepted fix is applied, `pnpm verify` exits 0 and both harnesses are clean — but the loop's own
deliverable measured `SPEC.md` §6.1's only quantitative promise and it is **false at every size
the promise applies to**. That is not a defect a reconciliation may fix: §6.1's numbers are the
owner's (ANCHOR §8, rule 3), and the two available repairs — change the layout, or change the
promise — are both the owner's call. It is recorded, with measurements, in `HANDOVER.md` §0.0 and
in ANCHOR §2.2, and it is stated here first so nobody reads a green suite as a finished step.

**What DID close, and is real:** the sparkline↔chart promotion has now been **observed working in
a real browser in both directions** for the first time in this project (A2), the `<900px`
priority order is measured for all nine panels instead of seven (A3), the sparkline and the
promoted chart now agree about gaps in every shape a `Gap` can take (A4/A5/A9), and the panel
wiring F14b exists to deliver is defended by three mutations instead of by a code-review habit
(A6).

| | |
|---|---|
| `pnpm verify` | **99 files · 2793 tests · exit 0** (was 2788) |
| step 9's harness | **102** mutations, all bite, 114 ⚠ marks covered, exit 0 (was 101/112) |
| step 10's harness | **175** mutations, all bite, 203 ⚠ marks covered, exit 0 (was 172/200) |
| `measure-breakpoints.mjs` | **9 pass · 3 fail · 0 blocked · 12 total.** The three failures are A1, and they are the SPEC's, not the script's |
| tree | `git status` matches the intended diff (§6); no stranded mutation after either harness; port 39173 free, no `next dev`, no headless Chrome, `next-env.d.ts` restored **by the script** |

---

## 1. The adjudication table — all 12

| # | Verdict | What was done |
|---|---|---|
| **A1** — §6.1's no-scroll promise is measured false | ⚠ **ACCEPTED, and ESCALATED to the owner. Not fixed, deliberately** | Re-derived independently (§2). The script now MEASURES it (measurement 9, three viewports); no layout and no spec text was touched |
| **A2** — the promotion has never been observed in either direction | **ACCEPTED — and CLOSED**, better than the finding asked for | A response-interception fixture in the measuring browser (no production code) makes both sides observable. Measurements **7 and 8 now PASS** |
| **A3** — measurement 6 is a vacuous PASS; measurement 4 has a second vacuous path | **ACCEPTED — fixed at both ends** | Real slot names, a missing slot is now a hard failure, a new **measurement 0** asserts all nine render, and `columnsOf` refuses a non-grid |
| **A4** — the sparkline drops a gap entirely when a `null` abuts it | **ACCEPTED — fixed** | `bothReadable` removed from the mark and row paths; the ⚠ test that asserted the old behaviour is replaced by one asserting the new; mutation `10c-SP3` **retired with a note** |
| **A5** — one gap draws N marks and N identical table rows | **ACCEPTED — fixed** | `gapSpansFor` collapses each gap to one span; one mark and one row per **gap**, matching `StackedTimeSeriesChart`. New mutations `10c-SP6`/`10c-SP7` |
| **A6** — the panels' `gaps` wiring has no test and no mutation | **ACCEPTED — fixed, and the build's "code-review habit" answer is overruled** | Behavioural fixtures in `cpu-panel.test.tsx` (both mounts) and `gpu-panel.test.tsx`; mutations `10c-P1`/`P2`/`P3`, one per production call site |
| **A7** — `CHART_SIZE.height` means two things; the new entry's justification is derived from the misreading | **ACCEPTED — fixed, and the build doc corrected** | Field renamed to `plotHeight` for `cooling`/`gpuPromoted` (type-checked at every call site); the wrong derivation is corrected in `grid.tsx`, `gpu-panel.tsx` **and `10c3-build.md` §1** |
| **A8** — the gap tint is colour-only at 1.12:1 | ⚠ **ACCEPTED IN PART; the §9 citation is OVERSTATED; the residue is the owner's** | Contrast re-derived (1.120:1 exactly). Opacity dropped so the mark matches the chart's own hatch stroke (1.245:1). §9's colour rule is about **series identity**, and the blessed chart hatch fails the same 3:1 test — a token decision across both components, recorded for the owner |
| **A9** — "excluded by construction" is false for an open gap | **ACCEPTED — the doc corrected and the behaviour fixed** | The claim is narrowed to closed gaps in the module doc; the open case is now handled by A5's per-gap collapse rather than by an exclusion that never existed |
| **A10** — the script cannot signal | ⚠ **ACCEPTED IN PART — two of four fixed, two DEFERRED with owners** | `BLOCKED` is now a third state and the exit code means something; the typo class is closed by A3's fix + measurement 0. **Deferred:** nothing runs it automatically (step 11/12), and it measures `next dev`, not the standalone build (step 12) |
| **A11** — the script leaves a tracked file dirty | **ACCEPTED — fixed** | The script restores `next-env.d.ts` itself in `finally`; the prose instruction is retired |
| **A12** — a test that cannot fail independently of the one above it | **ACCEPTED — replaced, not deleted** | Its fixture is now A5's multi-pair gap, which is the property its NAME always promised and which nothing tested |

**Zero rejected outright.** ANCHOR §8 says a run with zero rejections gets the same scrutiny, not
less, so: the two adjudications that are *not* full acceptances are **A8** (the §9 citation does
not support the strength of the claim, and the same criticism indicts already-blessed code) and
**A10** (two of its four sub-parts are real but are not this loop's to fix). Both are argued in
full below rather than in a table cell.

---

## 2. A1 — re-derived independently, and it is WORSE than reported

The handoff required this to be re-derived without trusting the script's pass/fail predicates,
because A3 proves those are unreliable. Done: the measurement is a bare `page.evaluate` reading
`document.documentElement.scrollHeight` and `clientHeight`, with each body child's and each grid
slot's own `getBoundingClientRect` beside it, and the numbers are printed raw. Nothing about it
routes through a predicate that could skip a `null`.

**Measured in real headless Chrome, logged in, default `chart` view, 2026-09-09:**

| viewport | `scrollHeight` | `clientHeight` | **overflow** | sticky band | grid |
|---|---|---|---|---|---|
| **1280 × 1024** | 1620 | 1024 | **596 px** | 49 | 1571 |
| **1600 × 1024** | 1656 | 1024 | **632 px** | 49 | 1607 |
| **1920 × 1080** | 1640 | 1080 | **560 px** | 49 | 1591 |

The two body children with any height are the sticky header+banner band (49) and `.grid`. **It is
the grid**, which is precisely what §6.1's 2026-09-08 clarification forbids: *"what the promise
forbids is the GRID growing past the viewport and the reader having to scroll the dashboard to
see a panel."*

**⚠ The adversarial measured 389/309/237 px of overflow. I measure 596/632/560.** The difference
is not a disagreement — it is the adversarial's own prediction coming true. Its numbers were
taken with `gpus: null`, which puts both GPU cards in the takeover branch at 162 px; this run
fabricates two populated cards (§3), and they render at **485 px** each. The finding said *"with
real cards it is worse"*, and it is worse by about 250 px.

**Per-slot heights at 1920×1080** — so the owner can see where it is, not merely that it is:

| slot | height |
|---|---|
| GPU 0 / GPU 1 | 485 each (row 1) |
| COOLING | 868 (spans rows 2–3) |
| CPU / MEMORY | 458 each (row 2) |
| SAFETY / STORAGE & NETWORK | 397 each (row 3) |
| SERVING / SESSION EVENT LOG | 190 each (row 4) |

485 + 868 + 190 + row gaps ≈ 1591. To keep the promise at 1920×1080 the grid must lose ~560 px —
about **35 %** of its height — and at 1280×1024 about 596 of 1571, near **38 %**. This is not a
padding adjustment.

**Why it is not fixed here.** Three repairs exist and every one of them is a decision this seat
does not hold:

1. **Shrink the panels** — which panel, by how much, and what stops being visible. §6.2 fixes the
   row content; a reconciliation choosing what to drop is inventing.
2. **Bound the grid and let it scroll internally** — which contradicts §6.1's own promise about
   the page rather than keeping it, and interacts with SCOPE 2.5f (below).
3. **Change §6.1's numbers** — the owner's, and explicitly forbidden to this phase.

Invariant 7, in its strongest form: *the spec makes a measurable promise the build does not
keep.* Recorded, not filled in.

**⚠ Two things that make it worse than the table shows**, both stated so nobody discovers them
after choosing a fix:

- **Every panel is in its `chart` view.** Toggling one to `table` adds up to
  `--table-scroll-max: 40vh` (432 px at 1080) of height to that cell. The table view has never
  been measured in a browser at any width (this is Q2-S2, still open and still the owner's).
- **A pinned alarm banner is not in these numbers.** The fabricated cards are deliberately not
  alarming, so the sticky band is 49 px. §6.4's banner adds to it.

---

## 3. A2 — closed, and closed more cheaply than either document proposed

Both the adversarial and `10c3-build.md` §5.3 concluded that observing the ≥1600px promotion
needs a production-adjacent change: extending `force-alarm.ts` to fabricate a whole `gpus` array
behind its two gates. That is a real option, and it would ship code in `.next/static` (as
`force-alarm.ts` itself does — verified in 10c-1) for a measurement's benefit.

**It is not necessary.** The measuring browser can rewrite the response itself:
`page.route('**/api/telemetry**')` fetches the real response and substitutes a two-card `gpus`
array before the page sees it. Nothing in `app/`, `lib/`, `components/` or `proxy.ts` changes; no
new gate has to be reasoned about; the wire validator, the ring, `traceFor`, the severity bands
and the panel all run completely unmodified. Invariant 2 is untouched — a response is reshaped in
the browser's memory and no request is ever built.

Result, first observation of this behaviour in this project:

```
PASS  7. >=1600px: GPU 0 shows the promoted chart, not the sparkline
PASS  8. 1280-1599px (the design target): GPU 0 shows the sparkline, not the promoted chart
```

Measurement **8 is new** — the adversarial's widening of the finding, that the *other* side of
the media query had never been observed either, was correct and is now covered. Both assert the
computed `display` of a named wrapper **and** that the shown one actually contains an `<svg>`, so
"neither renders" cannot pass either.

The third part of A2 is fixed too: `gpu-panel.tsx`'s two wrappers carry `data-role` attributes
and the script identifies them **by name**. The positional `svgs[0]`/`svgs[1]` reading held only
while those two files were the only `<svg>` emitters in the tree, and its failure mode was to
measure the wrong pair *in the direction that passes*.

---

## 4. The findings that changed rendering, and the one rule behind all three

A4, A5 and A9 are one defect wearing three faces: **the sparkline's gap marks were computed per
adjacent PAIR; `StackedTimeSeriesChart`'s are computed per GAP.** Everything downstream followed
from that mismatch.

- Per-pair + a `bothReadable` guard ⇒ **A4**: a gap flanked by a `null` produced no mark and,
  worse, no table row, so the accessibility floor said *less* than the chart it substitutes for.
- Per-pair without a collapse ⇒ **A5**: §6.7's blessed case (paused, two *refresh now* readings
  kept inside the gap, resumed) drew **3** marks and listed **3** identical outages where the
  chart draws and lists one — and §6.7 says in as many words that such a reading leaves the gap
  *"neither closed nor split."*
- Per-pair with `toMs: null` ⇒ **A9**: an open gap matches every pair, so the module doc's
  *"an out-of-window gap is excluded by construction"* was true for closed gaps only.

`gapSpansFor(points, gaps)` returns one span per gap — first and last straddled pair — and both
the marks and the table rows are built from it. One gap in, one mark and one row out, spanning
the range it covers. Readability is not consulted: a gap is a fact about time nobody sampled;
whether the readings on its shoulders parsed is a different fact, carried by the polyline break
and the em dash. `runsOf` still consults it, correctly — it decides where a *line* may be drawn.

**Mutation accounting**, since a retirement is the shape that hides a lost property:

- `10c-SP3` is **retired with a note in the harness**, the same disposition and the same
  reasoning `Q2-H10` got: it defended the `bothReadable` guard, the guard was the defect, and the
  code it anchored on no longer exists. It is deleted rather than left to report DID NOT BITE.
- `10c-SP4` is **re-anchored** onto the rewritten `tableRowsFor`, same property (the table stops
  carrying gap rows), verified red by name in the harness run.
- `10c-SP6` (a gap drawn once per pair again) and `10c-SP7` (a row per pair again) are new, and
  both bite. `10c-SP7` did **not** bite on first attempt — the A5 test asserted the chart's mark
  count but not the table's row count — which is exactly the kind of half-covered property the
  ledger exists to expose. The assertion was added; it bites now.

---

## 5. The three adjudications that are not simple acceptances

### A6 — the build's answer is overruled, on this project's own precedent

`10c3-build.md` §8.4 called the unguarded `gaps={state.gaps}` wiring *"worth a code-review habit,
not a guard, since the prop is optional by design."* The adversarial measured the consequence:
deleting it from both CPU call sites leaves **2801/2801 green** and both harnesses silent.

Overruled for three reasons, none of them stylistic. **L11 was the same shape** — *"nothing stops
a component hard-coding `' RPM'`"* — and this project's answer was a guard, shipped in 10c-2.
**`StackedTimeSeriesChart.gaps` is a required prop for the identical fact**, so the two
primitives disagree about whether gap-awareness is optional and the one that made it optional is
the one drawn in the band §6.1 calls the design target. And the failure is silent in exactly the
place this project has been bitten repeatedly: green suite, green harnesses, wrong page.

Of the three options the adversarial listed, the behavioural fixture was taken: it costs nothing
at the call sites, it proves the value **arrives** rather than that it is mentioned, and it is
mutation-anchorable per call site. `test-support.ts` grew a `gaps` override and a
`ringOfSeries` builder, because a fixture that always carries `[]` cannot tell a wired panel from
an unwired one — which is `HANDOVER.md` §0.6's rule (*a fixture whose two subjects are identical
cannot discriminate between them*) at a new site.

Making `Sparkline.gaps` **required** was considered and not taken: it is compile-time and
strictly stronger, but it forces every existing render in `sparkline.test.tsx` to carry a prop
irrelevant to what it tests, and it does not prove the value that arrives is `state.gaps` rather
than `[]`. Recorded so a future loop can still take it.

### A8 — accepted on arithmetic, narrowed on the citation, deferred on the fix

The number is right: `--gridline` at `opacity: .55` over `--surface-1` composites to `#242422`,
**1.120:1**. I re-derived it rather than trusting it.

Two things the finding does not support:

1. **§9 does not state a contrast floor.** Its colour rule is *series distinguishability* —
   "colour **plus** dash pattern **plus** a direct end-label", against §6.3's "must be
   distinguishable without relying on colour alone". A gap mark is not a series. The relevant
   standard is WCAG 2.2 SC 1.4.11, which the spec does not adopt anywhere.
2. **The same criticism indicts already-blessed code.** `StackedTimeSeriesChart`'s diagonal hatch
   is `--gridline` at full opacity over the same ground = **1.245:1**, and only about a sixth of
   its area is the line. Whatever is wrong here has been wrong in the chart since step 9.

Applied: the `opacity: .55` is dropped so the sparkline's mark is at least as visible as the
chart's hatch stroke rather than dimmer than it. Recorded for the owner: raising either to 3:1 is
a token-level decision across both components. And the part that actually answers §9's spirit is
now true — a gap is never carried by colour alone here, because the polyline breaks across every
gap and the table view carries a row for **every** gap in every case, including the null-abutting
one A4 restored.

### A10 — two of four fixed, two deferred with owners

| sub-part | disposition |
|---|---|
| Its exit code is permanently 1, so it carries no information | **Fixed.** `BLOCKED` is a third state and does not set the code. It now exits 1 for exactly one reason: A1 |
| A FAIL cannot be told from an environment block | **Fixed** by the same change — and the block it was about no longer occurs (§3) |
| Nothing runs it; it is not typechecked or linted, and A3 was a typo nobody caught | **Partly fixed, partly DEFERRED.** Measurement 0 plus hard-failing slot lookups mean a rename now breaks it visibly instead of silently passing. Wiring it into CI is **step 11/12's**, and it must not join `pnpm verify` — ANCHOR §4's one deterministic command must not acquire a browser prerequisite |
| It is macOS-only and measures `next dev`, not the standalone build step 11 ships | ⚠ **DEFERRED to step 12**, recorded in `HANDOVER.md` §9. Nothing has ever loaded the shipped artifact's CSS in a browser |

---

## 6. What changed on disk

| file | why |
|---|---|
| `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` | A1 (measurement 9), A2 (fabrication + measurement 8 + `data-role` lookup), A3 (real slot names, measurement 0, hard failures, non-grid rejection), A10 (`BLOCKED`), A11 (`next-env.d.ts`) |
| `components/sparkline.tsx` | A4/A5/A9 — `gapSpansFor`, per-gap marks and rows, three doc corrections |
| `components/sparkline.module.css` | A8 — opacity, and the measured reasoning |
| `components/sparkline.test.tsx` | A4 (flipped expectation), A5 (new ⚠ test), A12 (the inert test replaced) |
| `components/grid.tsx` | A7 — `plotHeight` rename, the two meanings documented, the wrong derivation corrected |
| `components/panels/cooling-panel.tsx`, `components/panels/gpu-panel.tsx` | A7's rename at the call sites; A2's `data-role` attributes (gpu only) |
| `components/panels/cpu-panel.test.tsx`, `components/panels/gpu-panel.test.tsx`, `components/panels/test-support.ts` | A6 — the wiring fixtures, the `gaps` override, `ringOfSeries` |
| `pipeline/steps/09-ui-primitives/regressions.py` | `10c-SP3` retired, `10c-SP4` re-anchored, `10c-SP6`/`SP7` added |
| `pipeline/steps/10-panels-assembly/regressions.py` | `10c-P1`/`P2`/`P3` added; A7's rename in one anchor |
| `pipeline/steps/10-panels-assembly/10c3-build.md` | A7's correction, written into the document that carries the wrong derivation |
| `pipeline/HANDOVER.md`, `pipeline/ANCHOR.md` | §0.0 / §0.8 / §9 / §11 and §2.2 |

**Not changed, deliberately:** `SPEC.md` (ANCHOR §8 rule 3, and A1 makes it load-bearing);
`components/tokens.css`'s `--table-scroll-max` (2.5f's verification stands, and A1 strengthens
the build's own reasoning for leaving it: the page is now measured to scroll where §6.1 says it
must not, so bounding the grid is part of A1's decision, not a token flip); `components/purity.test.ts`;
anything outside `dashboard/`. Nothing was staged or committed.

---

## 7. Verification, re-run after every change

```
$ pnpm verify
 Test Files  99 passed (99)
      Tests  2793 passed (2793)
Type Errors  no errors

$ python3 pipeline/steps/09-ui-primitives/regressions.py
Red-test ledger: 148 distinct failing tests across 102 mutations; 114 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 102 regressions failed their check, as they must.

$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 223 distinct failing tests across 175 mutations; 203 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 175 regressions failed their check, as they must.

$ node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
9 passed, 3 failed, 0 blocked by this environment, 12 total.     # the 3 are A1
```

Sequential, foreground, never two at once, never a harness beside `pnpm verify`, no polling.
`git status` checked after each: no stranded mutation. The only browser launched was the script's
own headless Chrome, closed by its `finally` block — `lsof -nP -iTCP:39173` empty and no
`next dev` or headless Chrome in `ps` after each of the two runs. The user's own Chrome was never
touched. `next-env.d.ts` is restored by the script itself now, and `git status` proves it.

---

## 8. What step 11 inherits — and the one thing it must not inherit quietly

Full list with owners in `HANDOVER.md` §9. The two that decide how step 11 reads this step:

1. ⚠ **§6.1's promise is broken and the fix is unchosen.** Step 11 packages what step 10 built.
   If the owner's answer to A1 is "shrink the panels" or "bound the grid", that is a change to
   the thing step 11 is packaging, and it should land before the image is specified rather than
   after. **`HANDOVER.md` §0.0 states it; it is not in a table.**
2. **Nothing has ever loaded the standalone build's CSS in a browser.** Every browser fact in
   step 10 comes from `next dev` on a GPU-less macOS host. That is a step-12 verification, and
   `measure-breakpoints.mjs` is the tool that would do it if pointed at the built artifact.
