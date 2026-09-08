# Reconciliation — Q2: the chart hover layer and table view

**Run 2026-09-08 as a background subagent** (ANCHOR §8). Fresh agent, no memory of prior
sessions. Read `pipeline/handoffs/Q2-reconcile.md`, `ANCHOR.md` §4/§5/§8/§9, `PLAN.md`,
`build.md`, `test.md`, `adversarial.md`, then `SPEC.md` §6.1/§6.2 and the two components.

Nothing was committed or staged. `SPEC.md` was not touched. Nothing outside `dashboard/`
changed, and `purity.test.ts` is byte-identical — both components are still hook-free.

---

## 1. Verdict up front

**Ten accepted, two rejected, one split (accepted in part, deferred in part) — plus two spec
questions handed up.** The adversarial's central claim is upheld and is the finding this phase
spent most of its budget on: the geometry the whole feature rests on had **no test naming it**,
and three plausible defects each left `components/` fully green. It now has five tests and five
mutations across the two components.

Two results are worth stating before the table, because they change how this item reads:

- **F2 holds, and `build.md` §7's spec gap was understated.** The two per-mark `<title>`s are
  occluded by the hover layer the same commit added, so §6.2's "per-mark tooltip on bars and
  dots" clause is **entirely** unmet, not partially. Corrected in `build.md` §7 and in the
  component's own module doc, and handed up as spec question **Q2-S1** — because the two
  requirements are in genuine tension (a full-body crosshair layer necessarily shadows the
  marks it covers), which is an owner's call, not a reconciliation's.
- **F10 is an owner question and is left as one.** ~722 `<tr>` at the default window, unbounded,
  inside a fixed grid cell, against §6.1's no-scroll promise. The three available fixes each
  trade against a different part of the spec. Handed up as **Q2-S2** with the measurements; **no
  wording was invented and no fix was applied.**

**The recurring defect landed again, and on the test written to close the previous gap.** The
test phase added `⚠ every hover-zone rect is immediately followed by its OWN crosshair group` —
whose body counts adjacent pairs and never establishes ownership, so an implementation pairing
every zone with the *next* column's crosshair passes it. That is ANCHOR §5's *"a test that names
a property it does not check has appeared in every single step"*, one level up: it appeared on
the test written to fix the previous instance of itself. F1's new tests close it by asserting
per-pair geometry, which is the property the name was always claiming.

---

## 2. The adjudication — all 13

| # | Verdict | Reason |
|---|---|---|
| **F1** | **ACCEPTED** | Upheld in full, and the most serious finding in the item. `hoverColumnsFor` is what `build.md` §2 calls "the entire snap-to-nearest-data-position behaviour" and it appeared **zero times** in either test file. Re-derived the adversarial's three mutations as harness entries (`Q2-H7`, `Q2-H8`, `Q2-SP8`, `Q2-SP9`) and confirmed each bites only the new tests. Mutation B is the one that decides it: zones spanning neighbour-to-neighbour **overlap**, the later-painted rect wins hit testing, and "snap to nearest" becomes "snap to **next**" — hovering a spike reports the following sample, with the crosshair sitting on the spike and the numbers naming a different instant. A wrong reading presented confidently is worse than no tooltip. **F1a accepted with it**: the adjacency test's body counts pairs without establishing ownership (see §1) |
| **F2** | **ACCEPTED** as a documentation + spec correction; **no code change** (reasons below) | The occlusion is real and I re-read the paint order to confirm it: the hover `<g>` is the last child of the `<svg>`, its rects carry `pointer-events: all` and tile `[0, plotWidth] × [0, plotsHeight]`, so hit-testing never reaches the circles beneath. `build.md` §7's "satisfied … for the marks that exist today" is wrong and is corrected. **Not fixed in code**, for a reason I want on the record rather than buried: every available fix is worse. Painting the marks *after* the hover layer would give the dot its tooltip back and simultaneously kill the crosshair whenever the pointer is over a mark — the one place a reader most wants it. Shrinking the zones to leave the marks exposed reintroduces exactly the un-partitioned axis F1 is about. And none of it is observable in jsdom, so any such change would be untested by construction. The `<title>`s are **kept**: the markup is correct, it costs nothing, and it becomes reachable again if paint order ever changes. **`Q2-H4`/`Q2-H5` are therefore mutations protecting markup with no independent user-facing effect** — that is now written at their site in the harness and in the module doc, because the ledger cannot tell an inert-but-correct property from a live one |
| **F3** | **ACCEPTED** | §6.2 calls the table view "an accessibility floor" and *nothing asserted the naming that makes it one*: the adversarial deleted `role="group" aria-label={ariaLabel}` **and** every `<caption>` and the suite stayed at 184/184. Three tests and three mutations added (`Q2-TV6`, `Q2-TV7`, and the sparkline's `Q2-SP10`). Cheap, and it closes the one place the "floor" was assembled from four things of which three were untested |
| **F4** | **ACCEPTED** | The time cell was a `<td>`, so a screen reader arrowing across a row announces "GPU 0, 66 °C" with no way to learn *which* instant without arrowing back to column 1 and reading it as ordinary data. This is not a stylistic nicety here: `build.md` §3.6 explicitly declines keyboard parity **on the ground that the table view is the complete substitute**, so the table owes the binding of reading-to-instant that the crosshair provides in the chart. One attribute per component (`<th scope="row">`), plus a `.table tbody th` rule in both stylesheets so making it a header does not silently restyle the time column muted. Mutations `Q2-TV8`, `Q2-SP11` |
| **F5** | **ACCEPTED** (with **F5a**) | Reachable with ordinary production data, and I re-checked the reachability rather than taking it: `runtime.ts` prunes gaps at `LONGEST_WINDOW_MS` (120 min) while the selectable window is 10/30/120 min, default 30 — so `gaps` legitimately holds entries up to 110 minutes older than the domain. The chart filters them; `tableRowsFor` mapped every element. The table view therefore claimed a gap the chart correctly refused to hatch, at two times that are not on the axis — the table asserting **more** than the chart, which is the exact inverse of the symmetry `build.md` §3.4 argues from when it denies the sparkline a gap column. `tableRowsFor` now takes the domain and applies the *same two* filters the chart branch applies (F5a's inverted-gap guard included). Mutation `Q2-TV9`, with a fixture on both sides of the guard |
| **F6** | **ACCEPTED** | Not reachable over the wire (JSON carries no `NaN`), and I did not treat it as if it were. What earns the fix is the **internal inconsistency**: both components already decided non-finite is in scope and guard it in three places (`runsOf`, `yDomainOf`, the sparkline's own `runsOf`), so the same value was a silent *break in the polyline* and a printed `NaN °C` in the tooltip and table beside it. Reachable from a caller's derived `pick` — a rate, a ratio over a zero denominator — which is step 10's work and not yet written. Guarding it costs one expression at each of four sites and closes the inconsistency before the caller that produces it exists. Written as one positive test (`typeof v === 'number' && Number.isFinite(v)`) rather than three negative clauses, because `Number.isFinite` already rejects `null`/`undefined` and a redundant clause is a mutation nothing can distinguish. Mutations `Q2-H9`, `Q2-SP12` |
| **F7** | **ACCEPTED** | The guard existed on the side no caller produces. `plots.length === 0` is essentially unreachable (COOLING always passes its two `ChartPlot`s); the case that *does* occur — a collector failing for the whole window, §6.5's degraded state — rendered a header row over an empty `<tbody>`: silence, no `—`, no sentence, while the sparkline says so in words for the same situation. ANCHOR §5's "every boundary guard needs a fixture on both sides", in its sharper form: the guard was on the wrong side. Per-plot empty row added; mutation `Q2-TV10`, fixture both sides |
| **F8** | **REJECTED** | The asymmetry is real and the reasoning is not. The sparkline's all-null empty state is a **step-9 decision with its own contract** — `data-empty="true"` plus `aria-label="… no readings in the selected window"`, and a ⚠ test (`⚠ all-null points renders the empty state, not a crash from an empty min/max`) that has held since step 9. Q2 should not silently reverse it. More decisively, the two primitives are *right to differ here*: `StackedTimeSeriesChart` has a real time axis and a caller-supplied domain, so an all-null window still has labelled instants to hover **against**; the sparkline positions by array index and draws no axis, so its hover columns over an all-null window would be zones over a blank box with no visual referent whatsoever — tooltips floating over nothing. And the information F8 wants is not lost: the sparkline's table view renders the em-dash rows, which is exactly what §6.2 makes the table view the floor for. Recorded in `HANDOVER.md` for step 10 to revisit if a real card needs it |
| **F9** | **SPLIT — half ACCEPTED, half DEFERRED to step 10** | **Accepted:** the zero-width columns. `xFor` clamps, so two instants both outside the domain collapse onto the same edge and emit a zero-width, unhoverable `<rect>` **plus its own crosshair `<g>`** — dead nodes that satisfy `hoverZoneCount === crosshairCount` and every other Q2 count assertion. That is a test-integrity problem as much as a rendering one, the guard is one line and unambiguously right (a zero-width rect can never be hovered, so nothing correct is lost), and it is now backed by `Q2-H10`. **Deferred:** the other half — the last out-of-domain instant owning the span from `x=0` to the first in-domain midpoint, so hovering the left quarter reports a reading taken before the labelled window. I did **not** filter instants to the domain, and the reason is not cost: the chart *draws* out-of-domain points clamped to the rail, so dropping their hover columns would leave a visible pegged mark whose tooltip names a **different** instant — trading a wrong reading for a wrong reading. Making them agree means deciding whether the chart should clamp or drop out-of-domain points at all, which is a rendering decision for the caller that produces them. Reachability is medium-low as the adversarial said (`traceFor` windows the ring before decimating), so step 10 owns it; the precondition is now written at the code |
| **F10** | **DEFERRED — owner question `Q2-S2`, §4** | Confirmed by reading the CSS: `.tableView` has no `max-height`, no `overflow`, no row cap. The measured consequence is ~722 `<tr>` at the default 30-minute window and 1,202 at 120 minutes, in a grid cell §6.1 budgets at a few hundred px. **This is where the handoff was right that it is not mine.** The three fixes trade against three different parts of the spec: a row cap makes the table a *sample* of the window and no longer the chart's complete substitute (§6.2's "accessibility floor"); decimating twice puts a second budget beside §6.7's; and a scroll container inside a panel is arguably precisely what §6.1's no-scroll promise forbids. Any of the three needs §6.1 or §6.2 reworded. Recorded with the numbers; **no fix applied and no wording invented** |
| **F11** | **ACCEPTED** | A one-line comment in `regressions.py` justifying `09-T13`'s re-anchor with *"the table view's own aria-labelling is covered by Q2-TV's own mutations instead"* — which was **false when written**: no `Q2-TV*` mutation touched it, and F3's MUT D proves deleting it cost nothing. Exactly the kind of sentence a later phase reads instead of re-checking, and exactly ANCHOR's own lesson that writing it down is not evidence it took. The comment is corrected in place, says it *was* false, and now names `Q2-TV6`/`Q2-TV7` — which is only true **because F3's fix made it true** |
| **F12** | **ACCEPTED** | `Sparkline` carried a built-in accessible name (`"trend over the selected window"`) in both views, so §6.1's three sparklines (GPU 0, GPU 1, CPU) reach a screen reader as three identically-named charts and three identically-named tables with a column called `value` — identity resting on **document order alone**, which is worse than the colour-alone failure §9 forbids. The repo's own precedent settles it: `StackedTimeSeriesChart` makes `ariaLabel` **required and deliberately un-defaulted** for this exact reason, in a prop doc that argues against the sentence the sparkline had. `ariaLabel` is now a required prop, used for the `role="img"` label, the `<caption>`, and the empty state. Source-breaking, and confined: `grep -rn "<Sparkline"` still finds no production call site (step 10 has not wired panels), so the 25 call sites updated are all in its own test file — the same shape as the build's two required formatter props |
| **F13** | **REJECTED** | Reachability is nil today and doubly guarded (§6.7 keys the ring on `ts` and drops repeats; `decimateSeries` guards `secondIndex !== firstIndex`) — the adversarial says so itself and files it only as a written note. The stronger reason is that the fix is **unfalsifiable here**: `renderToStaticMarkup` cannot observe a React key, so no test could hold a composite key and no mutation could bite it. Adding it would be untested code protecting an unreachable case — the same "markup with no observable effect" shape this same reconciliation criticises in F2's `Q2-H4`/`Q2-H5`. The dependency on those two upstream guards is recorded in `HANDOVER.md` instead, which is what the finding actually asked for |

**On the 11-item "could not break" section:** read in full and not re-litigated. It contains the
refutation of both of the parent's own hypotheses (an `opacity: 0` crosshair cannot intercept the
pointer — `pointer-events: none` is inherited by the `<line>`; and no `<title>` lives in a hidden
element, since the tooltip is a child of the `pointer-events: all` rect). Both stay refuted. Its
item 6 — that `Q2-TV1`/`Q2-SP4`'s `'chart-x'` mutations bite on real assertions rather than on a
`TS2367`, because `typecheck.include` is `**/*.test-d.ts` and `components/` has none — was
re-confirmed incidentally by this phase's own harness run, which reports `Type Errors no errors`
for those two entries.

---

## 3. What was applied

**Source (`components/`)**

| file | change | finding |
|---|---|---|
| `stacked-time-series-chart.tsx` | `hoverColumnsFor` drops collapsed (zero-width) columns | F9 |
| | `hoverTooltipFor` + `tableRowsFor` guard non-finite readings | F6 |
| | `tableRowsFor` takes the domain and filters gaps exactly as the chart branch does | F5, F5a |
| | `ChartTableView` renders a per-plot "no readings" row when a plot has no samples | F7 |
| | the table's time cell is `<th scope="row">` | F4 |
| | module doc: the mark `<title>`s are OCCLUDED and do not deliver §6.2's bar/dot clause | F2 |
| `sparkline.tsx` | `ariaLabel` is a required prop; drives the `role="img"` label, the `<caption>` and the empty state | F12 |
| | the hover title and the table cell guard non-finite readings | F6 |
| | the table's time cell is `<th scope="row">` | F4 |
| `*.module.css` (both) | `.table tbody th` keeps the body's ink, so F4's row header does not restyle the time column | F4 |

**Tests — 21 added** (13 chart, 8 sparkline), 15 of them ⚠-marked and every one backed:

- F1: two chart tests reading the actual coordinates (crosshair on its own instant and strictly
  inside its own zone; bounds at the midpoints, contiguous, tiling `[0, plotWidth]`) and the
  sparkline's two equivalents. These are the first tests in the item to read a coordinate at all.
- F9: a chart test that a collapsed column is not emitted.
- F3/F4: the table view's `role`/`aria-label`, its per-table `<caption>`s, and the row header —
  in both components.
- F5: a gap before the window, a gap inside it (both sides of the guard), and an inverted gap.
- F6: NaN/Infinity in the tooltip and the table, both components.
- F7: a plot with series and no samples, and one with samples (both sides).
- F12: the caller's name in chart view, in the `<caption>`, and in the empty state.

**Harness (`pipeline/steps/09-ui-primitives/regressions.py`) — 79 → 93 mutations**

- **14 added:** `Q2-H7` `Q2-H8` `Q2-H9` `Q2-H10` `Q2-TV6` `Q2-TV7` `Q2-TV8` `Q2-TV9` `Q2-TV10`
  `Q2-SP8` `Q2-SP9` `Q2-SP10` `Q2-SP11` `Q2-SP12`. All `Q2-` prefixed per ANCHOR §9 (the id
  carries its *creating* step, not the harness it lives in).
- **12 re-anchored** because this phase's own fixes moved the code they pointed at: `Q2-H2`,
  `Q2-H3`, `Q2-TV1`, `Q2-TV2`, `Q2-TV3`, `Q2-TV4`, `Q2-TV5`, `Q2-SP2`, `Q2-SP4`, `Q2-SP5`,
  `Q2-SP6`, `Q2-SP7`. ⚠ **Two of them needed their *replacement* text rethought, not just their
  anchor** — and this is the trap worth recording. `Q2-H2` and `Q2-H3` mutate the null/undefined
  halves of the tooltip's guard. F6 adds `Number.isFinite`, which **subsumes both**:
  `Number.isFinite(null)` and `Number.isFinite(undefined)` are already `false`, so a mutation
  that merely *deletes* one of those clauses becomes an **equivalent mutation** — it applies,
  nothing changes, the harness reports `DID NOT BITE`, and the natural reading is "the test is
  inert" when the truth is "the fix made the mutation vacuous". This is HANDOVER §1's *"adding a
  second, independent defence makes the first one's mutation inert"* (step 8's `W4`) recurring in
  a new place. Both now **replace the whole predicate** rather than dropping a clause, which
  keeps them biting for their own named reason. Written as a positive `typeof v === 'number' &&
  Number.isFinite(v)` so no redundant clause is left in the source to invite the same edit again.
- **1 comment corrected** — `09-T13`'s (F11).

**Notes** — `build.md` §7 rewritten (F2); `ANCHOR.md` §2.2 queue advanced; `HANDOVER.md`
rewritten.

---

## 4. New gaps for the owner

⚠ **Both are questions, not proposals. `SPEC.md` was not edited (ANCHOR §8 rule 3).**

### Q2-S1 — §6.2's "per-mark tooltip on bars and dots", on a chart that also carries a crosshair layer

**The clause as written:** *"the established practice for one is a crosshair + tooltip on a line
or area plot, **a per-mark tooltip on bars and dots**, and a table view…"* (§6.2, amended
2026-09-07).

**What is true after Q2:** the two clauses are in tension on a line chart, and the tension is
structural rather than an implementation slip. §6.2's crosshair half is delivered by a hover
layer that tiles the plot body at `pointer-events: all` and is painted last, which is what makes
"whichever zone the pointer is over IS the nearest data position" work with no JS. That same
layer **necessarily shadows every mark beneath it** — SVG hit-testing gives the pointer to the
topmost element, so the `<title>` on a lone-point dot or an end dot can never display (the sole
exception being a ~2.5px crescent of the end dot that protrudes past `plotWidth`). You can have a
full-body crosshair or reachable per-mark tooltips on the same plot; not both.

**Three sub-questions, none of which a phase should answer for you:**

1. Was the bar/dot clause written about a **different chart shape** — a bar chart or a scatter
   plot, where there is no crosshair layer and per-mark hit areas are the whole interaction —
   rather than about the dots a line chart happens to draw? `components/` has **no bar or dot
   time-series primitive**, and `Meter` (the only bar-shaped thing) has its value as permanent
   visible text, so it has no hidden numeral a tooltip would reveal.
2. If so, is the clause **satisfied vacuously today** and inherited by whichever future primitive
   introduces bars or dots — and should that primitive then inherit this same native-`<title>`
   pattern?
3. Or does the crosshair's tooltip **discharge** the clause on a line chart, on the grounds that
   it already reports the mark's own instant and every series' value at it — in which case §6.2
   would say so, and the honest reading is that a per-mark tooltip is not additionally owed
   wherever a crosshair layer covers the marks?

**What the build recorded was weaker than this**, and is corrected: it said the clause was
"satisfied … for the marks that exist today". It is not satisfied for them at all.

### Q2-S2 — the table view's height, against §6.1's no-scroll promise

**The clause the numbers meet:** §6.2's own justification for accepting the table view is
*"**They cost nothing when unused.** A tooltip that never fires renders nothing and occupies no
space in the grid, so §6.1's no-scroll promise is untouched."* That sentence is **true of the
tooltip and silent about the table view**, which is not "unused" once a caller toggles it and
which occupies exactly as much space as it has rows.

**Measured, on the real components** (the adversarial's figures, re-derived from the code):

| window | instants | `<tr>` in a COOLING chart (2 plots) | approx. height at the stylesheet's ~17px row |
|---|---|---|---|
| 30 min (default), 5 s cadence | ~360 | **~722** | ~12,000 px |
| 120 min, decimated to §6.7's 600 | 600 | **1,202** | ~20,000 px |

§6.1 gives COOLING a fixed grid cell spanning rows 2–3 and promises no scroll at ≥1280×1024.
`.tableView` carries **no `max-height`, no `overflow` and no row cap**, and the primitive gives a
caller nothing to hang one on.

**The three fixes and what each costs — this is why it is yours:**

| fix | what it trades |
|---|---|
| **cap the rows** (e.g. most recent N) | the table stops being the chart's complete substitute, so §6.2's "accessibility floor" no longer holds: the chart shows the whole window and the table shows part of it |
| **decimate again for the table** | a second render budget beside §6.7's 600-point one, and two decimations of the same data that can disagree |
| **scroll inside the panel** | arguably exactly what §6.1's no-scroll promise forbids — though it may be the intended reading, since §6.1 already accepts scrolling below 1280px and a *panel* scrollbar is not a *page* scrollbar |

**What is needed is a sentence in §6.1 or §6.2**, not a component change: whichever way it goes,
step 10 implements it and the primitive grows one prop. **No wording is proposed here.**

### Still open from earlier, restated because they touch this item

- **F9's deferred half** (§2) — a caller must supply a domain containing the points it passes.
  `traceFor` does; the component neither requires nor checks it. Owner: **step 10**, and it is a
  code decision rather than a spec question unless the chart's clamp-vs-drop behaviour for
  out-of-domain points turns out to be one.
- **`build.md` §3.6's keyboard-parity trade-off** stands (the table view instead of several
  hundred tab stops), and F4's row headers strengthen it — but it is still a *recorded
  trade-off*, not a spec ruling. If the owner wants literal parity the fix is additive.

---

## 5. What was re-run, and what it said

Strictly sequential foreground commands. **No harness ran beside `pnpm verify`, no two harnesses
ran together, and nothing was polled** — ANCHOR §9's five-hour lesson was followed by not waiting
at all.

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"

python3 pipeline/steps/09-ui-primitives/regressions.py
# EXIT 0 — All 93 regressions failed their check, as they must.
#          Red-test ledger: 134 distinct failing tests across 93 mutations;
#          103 ⚠-marked tests checked. Every ⚠-marked test went red under at
#          least one mutation.
#          No ANCHORS MOVED, no DID NOT BITE.

pnpm verify
# EXIT 0 — 67 files, 2258 tests, Type Errors: no errors.

git status --short
#  M components/sparkline.module.css
#  M components/sparkline.test.tsx
#  M components/sparkline.tsx
#  M components/stacked-time-series-chart.module.css
#  M components/stacked-time-series-chart.test.tsx
#  M components/stacked-time-series-chart.tsx
#  M pipeline/steps/09-ui-primitives/regressions.py
#  ?? pipeline/handoffs/Q2-*.md   ?? pipeline/steps/Q2-hover-and-table/
# — no stranded mutation; the seven modified files are exactly the ones this item owns.
```

**Only the step-9 harness was re-run, deliberately.** Every file this phase touched
(`components/*`) is in that harness's `LEDGER_FILES` and in no other's; steps 2–8's harnesses
mutate `lib/` and `app/`, which this item did not touch. HANDOVER §1's rule is "ledger ownership
follows the FILE" — running the other seven would have measured nothing this item can have
changed, at a cost of several minutes each.

**Counts, so the next phase can see the deltas:** 2237 → **2258** tests (+21); 79 → **93**
mutations in the step-9 harness (+14); 85 → **103** ⚠ marks checked (+18); project total
**803 mutations** across eight harnesses (710 across steps 2–8, unchanged, plus this
harness's 93 — was 771 when the step-9 harness held 61).

⚠ **The parent re-runs `pnpm verify` itself before committing.** This phase's green is evidence
that the tree was green when it left; it is not the green (ANCHOR §8).

---

## 6. Two things the next phase should know

1. **The step-9 harness now carries 93 mutations, 32 of them `Q2-`.** It is the harness for
   *`components/`*, not for "step 9" — every UI item lands its mutations here, prefixed with its
   own id. It takes about a minute.
2. **`Sparkline` has three required props that did not exist a week ago** (`ariaLabel`,
   `formatValue`, `formatTime`) and `StackedTimeSeriesChart`'s table view now needs the domain
   it was already being given for the chart. Step 10 wires the first callers, so it is the phase
   that will discover whether "required and un-defaulted" was the right call. It was made twice,
   for the same stated reason, and the component that made it first (`StackedTimeSeriesChart`)
   has an argued prop doc for it — read that before relaxing either.
