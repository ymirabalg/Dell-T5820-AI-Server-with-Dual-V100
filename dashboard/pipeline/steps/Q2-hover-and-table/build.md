# Build — Q2: the chart hover layer and table view

Fresh agent, no memory of prior sessions. Read the handoff, `SPEC.md` §6.2/§9, `ANCHOR.md`
§4/§5/§8, `PLAN.md`'s seven invariants, and loaded the `dataviz` skill before writing any
chart code, per ANCHOR §8 and the handoff's own instruction.

## 1. What was built

`SPEC.md` §6.2 (amended 2026-09-07) makes a hover layer (crosshair + tooltip on line/area,
per-mark tooltip on bars/dots) and a table view **defaults** on every chart. Step 9 built the
chart primitives before the amendment and correctly recorded the absence as a gap. This item
builds both, on the two chart primitives that exist:

- **`components/stacked-time-series-chart.tsx`** — a `view: 'chart' | 'table'` prop (default
  `'chart'`), a CSS/SVG-native crosshair with a native `<title>` tooltip, and a table view
  rendering one `<table>` per plot.
- **`components/sparkline.tsx`** — the same `view` prop, plus two new **required** props
  (`formatValue`, `formatTime`) the hover/table layer needs to render a reading at all, and
  the same crosshair + table mechanism scaled to its own single-series, index-positioned
  geometry.

Both remain pure functions of props with zero React hooks — `pnpm verify`'s
`components/purity.test.ts` still passes, unmodified and unweakened.

Files touched (all in `components/`, per scope):

- `components/stacked-time-series-chart.tsx` (+340/−? — see `git diff --stat`)
- `components/stacked-time-series-chart.module.css`
- `components/stacked-time-series-chart.test.tsx`
- `components/sparkline.tsx`
- `components/sparkline.module.css`
- `components/sparkline.test.tsx`
- `pipeline/steps/09-ui-primitives/regressions.py` — 16 new `Q2-*` mutations backing the new
  ⚠ tests, plus a re-aim of one pre-existing mutation this work collided with (§6 below).

Nothing in `lib/`, `app/`, or `SPEC.md` was touched. No dependency was added.

## 2. The architecture question, and where I landed

The handoff invited a challenge to its own reading if I disagreed. I don't, on the substance:
`purity.test.ts` really does forbid every hook by shape, not by name, and it walks the
directory recursively, so there is no way to hold hover-position state, a view toggle, or a
`useId` anywhere under `components/`. Two consequences follow directly and both hold:

- **The view toggle is a prop.** Neither component picks its own view; the caller (step 10)
  owns that state, exactly as the handoff describes and exactly as step 9 already reasoned
  about the sparkline's own sizing ("a primitive that picked its own size would be deciding
  layout from a leaf").
- **The hover layer is CSS/SVG-native.** Native `<title>` gives a tooltip with zero JS.
  `:hover` plus an **adjacent-sibling** selector (`.hoverZone:hover + .crosshairGroup`) reveals
  a crosshair line with zero JS and zero new `id`s — no `useId`, no per-instance uniqueness
  problem at all, because the CSS relies on document position, not on identity.

The one place I found something genuinely **not** achievable without pointer coordinates —
"the crosshair finds the X" in the literal sense of *snapping to wherever the pointer sits* —
turned out not to need pointer coordinates either. A crosshair "snaps to nearest data
position" if the geometry already partitions the axis so that whichever invisible zone the
pointer happens to be over **is** the nearest position. I partition `[0, plotWidth]` into
Voronoi-style columns at the midpoints between consecutive instants (`hoverColumnsFor` in both
files), so the "nearest neighbour" computation is done once at render time over the *data*,
never against the *pointer*. Nothing about §6.2's crosshair required smuggling in state; I am
not recording a gap here, because there is nothing this component still owes.

**One thing I did NOT attempt to make hook-free, because it doesn't need to be:** keyboard
focus parity. See §5.

## 3. Design decisions and their reasoning

### 3.1 The tooltip lists every series at the EXACT instant, never a nearest-neighbour guess

`StackedTimeSeriesChart`'s hover tooltip (`hoverTooltipFor`) looks up each series' value at
**exactly** the hovered instant's `tMs`. A series with no point at that exact instant renders
`EM_DASH`, never a neighbouring reading. I considered "nearest point per series" (the more
common charting-library behaviour, and closer to a literal reading of dataviz's "snap to
nearest data position") and rejected it: this project's whole discipline is "never draw a
value that was not read" (invariant 1, and the module's own gap-hatching rule — "a gap is
drawn from `gaps`, never inferred"). Showing a reading against a timestamp it was not taken
at is exactly that mistake one level up — the tooltip equivalent of bridging a `null` across a
gap. Exact-match costs nothing extra to compute (a `Map<tMs, v>` per series, built once) and
is the more honest choice.

### 3.2 One `<table>` per plot, never one merged table

A merged table would put two different units (°C and RPM) in adjacent cells of one row. I
read this as the same mistake §9 already names for the chart's own y-axis ("never a dual
y-axis on one plot") one level removed into tabular form: one table, one scale. Each table's
cells reuse the plot's own `formatTick` — the same function the axis and the hover tooltip
already call — so a reader can't get three different renderings of "GPU 0's 66°" across the
chart, the tooltip, and the table.

### 3.3 Gaps get their own table row, spanning every column

The handoff flagged this directly: "a table view must represent gaps and nulls as honestly as
the chart does." A table's rows are keyed by real sample instants; a gap by definition has no
sample inside it, so there is no row to annotate — the honest representation is a row that
says a span passed with nothing sampled, mirroring the hatched rectangle. I render it as
`gap (hidden) — 14:32:05 to 14:33:35` (or `to ongoing` for an open gap), spanning every column
via `colSpan`.

### 3.4 The sparkline gets the full treatment too — this was not obvious, and I checked it

My first instinct was that a 96×24px sparkline is too small to carry its own crosshair and
table, and that the *promoted* full chart at ≥1600px already covers the "read a value off a
trace" problem. That instinct is wrong, and §6.2's own stated reasoning says so directly:
*"The wall is not the only viewer. The same page is opened on a laptop exactly when reading a
value off a 600-point trace by eye is worst."* A common laptop viewport (1280–1536px) is
**under** §6.1's 1600px breakpoint — so the sparkline, not the promoted full chart, is exactly
what the "laptop viewer" scenario in the spec's own justification will render. I built the
full treatment into `Sparkline` rather than treating it as exempt.

Two consequences of that reading:

- `formatValue`/`formatTime` are **required** props on `Sparkline`, not optional. A sparkline
  previously took no formatter at all (its only text lived in the caller's headline figure,
  drawn elsewhere). Making them required means a caller cannot ship an inert hover layer by
  forgetting an optional prop — the "defaults rather than requests" language is enforced by
  the type system, not by convention. This broke every existing call site in
  `sparkline.test.tsx` (13 of them); I mechanically added the two props everywhere via a
  scripted substitution and reran the suite to confirm nothing else moved.
- The sparkline's table has **no gap column**. `Sparkline` already made a deliberate,
  documented decision not to represent gaps in its chart form (position-by-index, no `tMs`
  domain, no hatching) — extending gap rows into its table would claim more honesty than the
  chart form itself offers. Nulls still render `EM_DASH` in the table, matching the chart's
  broken polyline; only the gap-specific machinery is skipped, by symmetry.

### 3.5 Per-mark tooltips on the marks that already exist

§6.2 also asks for "a per-mark tooltip on bars and dots." `components/` has no bar-chart or
dot/scatter-chart TIME-SERIES primitive today — `Meter` is a single already-labelled gauge
(its value is permanent visible text beside the bar, so there is no hidden-behind-pixels value
to reach via a tooltip in the first place; it is out of scope for this reason, not by
oversight). The chart primitives that DO exist already draw two kinds of discrete dot marks —
a lone-point run's dot and an end-label's dot — so I attached the same native `<title>`
treatment to both. That is the literal clause satisfied for the marks in scope today; see the
spec-gap note in §7 for the residue.

### 3.6 Keyboard/focus parity is via the table view, not via 600 focusable hover zones

dataviz's own interaction guidance says "same details on keyboard focus as on hover." I did
not make each hover column focusable (`tabIndex={0}` on every `<rect>`), even though that
would not have required a hook — it is a plain HTML attribute. The reason is UX, not purity:
a chart with up to several hundred hover columns would turn into several hundred tab stops,
which is worse for a keyboard user than the table view already sitting one toggle away. I am
treating the table view as the accessibility-complete substitute for the crosshair — which is
exactly what §6.2 calls it ("an accessibility floor") — rather than cloning the hover
interaction onto a focus ring. Recorded here as a considered trade-off; if the owner wants
literal parity, the fix is additive (`tabIndex` + an `aria-label` per column) and does not
touch the architecture.

### 3.7 The discrete marks' own hit areas were not enlarged to dataviz's 24px floor

dataviz recommends a ≥24px transparent hit area around a small scatter dot. I left the
lone-point and end-label dots at their existing 1.5–2.5px radius, because the crosshair's own
hover zone already spans the full column width and height at that instant — hovering anywhere
near the mark reveals the same information through the crosshair's tooltip. The dot's own
`<title>` is a redundant, more precise path to the same content, not the primary one. I judged
enlarging the dots' hit areas not worth the added markup for a benefit the crosshair already
provides, but it is a real, acknowledged departure from the skill's mark-hover guidance.

## 4. The 600×N cost analysis (SPEC §6.7)

§6.7 fixes the render budget at 600 points **per series**. The hover layer's cost is a new
number the spec does not fix, so I derived and bounded it rather than assuming a shape.

**Mechanism.** `hoverInstantsFor` takes the union (a `Set`) of every distinct `tMs` any series
in the chart reports, across every plot. `hoverColumnsFor` partitions `[0, plotWidth]` into
one Voronoi column per instant. Each column costs one `<rect>` (the hit target, carrying one
`<title>`) and one sibling `<g>` (the crosshair line) — a small, constant number of DOM nodes
per instant, independent of how many series are drawn.

**The bound.** In the case every real caller in this project produces — every series in one
chart drawn from a single poll of `state.ring` (the COOLING chart's GPU0/GPU1/fan5, all from
one `TelemetrySnapshot`) — every series shares the same sample clock, so the union collapses
to **~600**, not 600×N. This is not hypothetical: the test fixture already used throughout
`stacked-time-series-chart.test.tsx` (`gpuPlot()` + `fanPlot()`, three series) demonstrates it
directly — `hoverZoneCount(html)` is exactly **10**, matching one series' own point count, not
30 (a dedicated test asserts this: `Q2 — hover column cost`).

**The adversarial bound.** §6.7's own decimation is per series (`decimateSeries`), and its own
module doc records that "bucket boundaries move on every append" — so two series drawn from
the same underlying samples can genuinely decimate to *different* exact instants after
independent min/max bucketing. In the worst case (no two series' decimated instants ever
coincide), the union is the **sum**, bounded above by **600 × N**. I chose exact-instant
matching over a coarser (e.g. pixel-bucketed) approach specifically because it is the *honest*
direction — see §3.1 — and accepted the worst-case cost as the price of that honesty. At the
project's actual N (2–3 series per chart today, per the COOLING panel spec), 600×N tops out
around 1,800 hover columns — a few thousand small SVG nodes, well within what a browser
renders without difficulty, and the same order of magnitude as the chart's own point-drawing
cost at that N.

**Is it acceptable?** Yes, for this project's actual chart shapes. If a future chart ever
stacks many more series (the palette module already caps categorical series at three — see
`components/palette.ts`'s own warning against a fourth generated hue), the bound would need
revisiting, but nothing here scales worse than the chart it augments.

**The sparkline's cost is simpler and smaller.** It positions by array index, so its hover
columns are exactly `points.length` — the same one-series decimation budget the sparkline
already draws from, with no cross-series union to reason about at all.

## 5. ⚠ marks and their backing mutations

Every new load-bearing test is marked ⚠ and backed by a `Q2-*` mutation in
`pipeline/steps/09-ui-primitives/regressions.py`, per the 2026-09-08 mutation-id convention
(creating step's prefix, not the harness's).

| Mutation | Test it backs |
|---|---|
| `Q2-H1` | `⚠ three series sharing ONE sample clock produce as many hover columns as one series has points, not the sum` |
| `Q2-H2` | `⚠ a series with no point at a shared instant renders the em dash there, never a neighbour's value` |
| `Q2-H3` | `⚠ a null reading at a shared instant renders the em dash, not the numeral 0` |
| `Q2-H4` | `⚠ a lone-point run carries a native title with its series label and formatted value` |
| `Q2-H5` | `⚠ an end dot carries a native title with BOTH the series label and its own endLabel text` |
| `Q2-TV1` | `⚠ table view draws no <svg> at all, and chart view (the default) draws no <table>` |
| `Q2-TV2` | `⚠ one table PER PLOT, never one table merging two different units` |
| `Q2-TV3` | `⚠ invariant 1 in the table: a null reading renders the em dash, not the numeral 0` |
| `Q2-TV4` | `⚠ invariant 1's other half: a v=0 reading renders the caller's formatted zero, not the em dash` |
| `Q2-TV5` | `⚠ a gap gets its own row spanning every column, not a silent jump between two readings` |
| `Q2-SP1` | `⚠ a null point still gets its own hover zone — it is not silently absorbed by a neighbour` |
| `Q2-SP2` | `⚠ a null point's tooltip renders the em dash, never the caller's formatter` |
| `Q2-SP3` | `⚠ the first column starts at 0 and the last ends at the drawn width` |
| `Q2-SP4` | `⚠ table view draws no <svg> at all, and chart view (the default) draws no <table>` (sparkline) |
| `Q2-SP5` | `⚠ invariant 1 in the table: a null reading renders the em dash, not the numeral 0` (sparkline) |
| `Q2-SP6` | `⚠ invariant 1's other half: a v=0 reading renders the numeral WITH its unit, not the em dash` (sparkline) |

All 77 mutations in the (now Q2-extended) `09-ui-primitives` harness fail their check, as
required; every ⚠-marked test in the harness's ledger reddens under at least one mutation
(`Red-test ledger: 113 distinct failing tests across 77 mutations; 83 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.`).

I read every new test's name against its body before finishing (the ledger's own stated
recurring defect). Two were tightened during that pass:

- **`⚠ an end dot carries a native title with the series label and its endLabel text`** — the
  original body only asserted the LABEL half via a loose `toMatch(/GPU 0|GPU 1|fan 5/)`, which
  would pass even if the endLabel text were missing entirely. Rewrote it to a single-series
  fixture asserting both halves are present together.
- **`⚠ invariant 1's other half: a v=0 reading renders the caller's formatted zero, not the em
  dash`** (stacked chart) — the original body checked only the positive half (`TICK(0)`
  present); added the negative half (`EM_DASH` absent), matching the sparkline's own version
  of the same test which already checked both directions.

## 6. A pre-existing mutation this work collided with, and how it was fixed

`09-T13` ("every chart announces itself as the COOLING chart, whatever it is drawing") used
`aria-label={ariaLabel}` as an anchor, unique when step 9 wrote it. My table view's wrapping
`<div>` introduces a second, textually identical `aria-label={ariaLabel}` — the harness caught
this immediately as `ANCHOR AMBIGUOUS`. Re-anchored it to the SVG's own multi-line
`role="img"\n      aria-label={ariaLabel}` block, which is unique to the chart-view branch.

A second, more dangerous collision: `09-T1` ("the x-axis is rendered once PER PLOT instead of
once, shared") anchored its second half on `))}\n      </g>\n    </svg>` — the x-axis's own
closing immediately followed by the file's `</svg>`. My hover layer is now the last thing
before `</svg>`, and its own `Fragment`-map closes with the **identical** three lines. The old
anchor did not go missing — it silently **re-aimed** at the hover layer's closing instead,
still a single unambiguous match, so nothing printed `ANCHOR AMBIGUOUS`. The only symptom was
`exit=1  Tests  no tests` — a compile error from the resulting malformed JSX, which the
harness still counted as "biting" (it exits 1) but for the wrong reason and against the wrong
code. This is exactly `ANCHOR.md`'s "an anchor that matches its file TWICE is the most
dangerous [failure], because it does not look like one" — one level worse here, since the
match count stayed at one throughout; only the *site* moved. Fixed by anchoring on
`{formatTime(t)}` immediately before the x-axis's own closing tags, which is unique to the
x-axis's own tick loop regardless of what renders after it. Verified: `09-T1` now reddens the
correct test (`⚠ exactly one x-axis group with two plots`) rather than crashing the file.

Lesson for whoever extends this file next: **a mutation anchored on a generic closing pattern
(`))}\n</g>\n</svg>`) is only as stable as "this is the last thing in the file" staying true.**
Anchor on the nearest content unique to the element you mean, not on shared boilerplate that
happens to be adjacent today.

## 7. Spec gap recorded (invariant 7)

⚠ **CORRECTED BY THE RECONCILIATION, 2026-09-08 (adversarial F2). The original wording is kept
below, struck through, because the way it was wrong is instructive.** The build phase wrote it
in good faith and the fact that falsifies it — SVG paint order — is not visible from the code it
was describing.

**The gap, as it actually stands.** §6.2 requires "a per-mark tooltip on bars and dots". This
item satisfies **none of it**, and the two `<title>`s attached to the chart's discrete dot marks
(a lone-point run's dot, an end-label's dot) do not change that, because **they are occluded by
the hover layer this same item added**. The hover `<g>` is the last child of the `<svg>`, its
rects carry `pointer-events: all`, and they tile `[0, plotWidth] × [0, plotsHeight]`. SVG
hit-testing hands the pointer to the topmost element that has one, which is always a hover zone;
the circle beneath it can never receive the pointer, so its `<title>` can never display. The
sole reachable remnant is a ~2.5px crescent of the end dot protruding past `plotWidth`.

So the honest statement is: the clause is **entirely unmet**, not partially met. Two consequences
the reconciliation records rather than fixes:

- **`Q2-H4` and `Q2-H5` protect markup with no independent user-facing effect.** They are not
  wrong — the markup is exactly what they say it is — but they are the only two Q2 mutations
  whose protected behaviour is inert in a browser, and the red-test ledger structurally cannot
  tell that apart from a sound one. Written at their site in the harness and in the module doc.
  The `<title>`s are kept: the markup is correct, costs nothing, and becomes reachable again if
  paint order ever changes.
- **The end dot's title is the one place two tooltips can disagree** — it renders `s.endLabel`, a
  free caller string, while the hover column at the same instant renders `plot.formatTick(v)`.

**Why this was not fixed in code.** Every available fix is worse than the defect. Painting the
marks after the hover layer restores the dot's tooltip and simultaneously kills the crosshair
wherever the pointer is over a mark — the one place a reader most wants it. Shrinking the zones
to leave the marks exposed reintroduces the un-partitioned axis F1 is about. And none of it is
observable in jsdom, so any such change would be untested by construction. **The clause and the
crosshair are in structural tension on a line chart**, which is an owner's call: it is handed up
as spec question **Q2-S1** in `reconciliation.md` §4, along with the observation that
`components/` still has no bar or dot time-series primitive for the clause to attach to (`Meter`
is a single already-labelled bar whose value is permanent visible text, so it has no hidden
numeral a tooltip would reveal).

---

### The original wording, superseded

> ~~**§6.2 requires "a per-mark tooltip on bars and dots," but `components/` has no bar-chart or
> dot/scatter-chart TIME-SERIES primitive to attach that half of the requirement to.** The two
> chart primitives that exist (`StackedTimeSeriesChart`, `Sparkline`) are both line/area plots;
> their crosshair-and-tooltip half of §6.2 is fully built by this item. `Meter` is the only
> bar-shaped primitive, and it does not have the ambiguity a tooltip would resolve — its value is
> already permanent, visible text beside the bar, not something reachable only by hovering
> pixels. I attached the closest available analogue — native `<title>` tooltips on the two
> discrete DOT marks the line chart already draws (a lone-point run's dot, an end-label's dot) —
> which satisfies the literal words for the marks that exist today.~~

**The half that survives** is the inventory: there really is no bar or dot time-series primitive,
and `Meter` really is out of scope for the reason given — the test phase re-verified both by
reading `meter.tsx` and enumerating `components/*.tsx`. **The half that does not** is the last
sentence: the marks that exist today carry titles a user cannot reach, so nothing about the
clause is satisfied for them.

## 8. What was NOT touched

`lib/`, `app/`, `SPEC.md` — untouched, per scope. No dependency was added (invariant 6). The
`view` prop's default (`'chart'`) means every existing caller (there are none outside
`components/` yet — step 10 hasn't wired panels) sees identical behaviour to before this item,
except for the two REQUIRED new props on `Sparkline`, which is a source-breaking change
confined entirely to this step's own test file (13 call sites, mechanically updated).

## 9. Verification

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard
pnpm verify                                              # EXIT 0 — 67 files, 2235 tests
python3 pipeline/steps/09-ui-primitives/regressions.py   # EXIT 0 — 77/77 mutations bite,
                                                          # every ⚠ test covered
```

`git status --short`:

```
 M components/sparkline.module.css
 M components/sparkline.test.tsx
 M components/sparkline.tsx
 M components/stacked-time-series-chart.module.css
 M components/stacked-time-series-chart.test.tsx
 M components/stacked-time-series-chart.tsx
 M pipeline/steps/09-ui-primitives/regressions.py
```

Not committed — the parent runs `pnpm verify` itself and reviews before committing, per the
handoff.
