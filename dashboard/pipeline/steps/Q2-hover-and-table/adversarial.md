# Adversarial — Q2: the chart hover layer and table view

Fresh agent, no memory of prior sessions. Read `pipeline/handoffs/Q2-adversarial.md`,
`build.md`, `test.md`, `SPEC.md` §6.2 / §6.1 / §6.7 / §9, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

**I fixed nothing.** Every experiment below was applied to a copy-backed file and reverted;
`git status --short` and `pnpm verify` were re-run at the end and the tree is exactly the
seven modified files plus the three untracked pipeline paths the test phase left, with
`pnpm verify` at **exit 0, 2237 tests, no type errors**. The one file I created
(`components/__adv_scratch.test.tsx`, a console-only render dump) was deleted.

Each finding is tagged **[EXECUTED]** (I ran it and read the output) or **[REASONED]**
(derived from the CSS/SVG/ARIA specs and the code as written — jsdom cannot answer it).

---

## Verdict up front

The implementation logic is largely right. **What is thin is the test surface around the
geometry, and what is wrong is one browser-reality claim.**

- The single most important result: **`hoverColumnsFor` — the function `build.md` §2 calls
  "the entire snap-to-nearest-data-position behaviour" — has no test on the property that
  makes it work.** Three separate plausible defects (F1) each leave the whole
  `components/` suite at **184/184 passing**.
- The second: **the two per-mark `<title>` tooltips that `build.md` §3.5/§7 offers as
  satisfying §6.2's "per-mark tooltip on bars and dots" clause are occluded** by the hover
  layer the same commit added (F2). The recorded spec gap is understated.
- The third: **the "accessibility floor" can lose its entire accessible naming — the
  caller's `aria-label` *and* every `<caption>` — with the suite still green** (F3), and
  the harness carries a comment asserting the opposite (F12).

The handoff's own §3.1 hypotheses are both **negative** — see *What I could not break*.

---

## F1 — [EXECUTED] The Voronoi partition and the crosshair's own x are untested. Three plausible defects each leave 184/184 green.

`hoverColumnsFor` (both files) is the whole mechanism: it partitions `[0, plotWidth]` at the
midpoints between consecutive instants so that "whichever zone the pointer is over IS the
nearest data position", and the crosshair line is drawn at `col.x` — the instant's own x,
inside that zone. **Nothing anywhere asserts either property.** Every Q2 hover test asserts a
*count* (`hoverZoneCount`, `crosshairCount`), a *tooltip string*, or *adjacency*. `grep -n
"crosshair\|x1=" components/*.test.tsx` returns no geometric assertion at all; the chart side
has no equivalent of the sparkline's `Q2-SP3`, and `Q2-SP3` itself only pins the two outer
edges.

I applied three mutations, one at a time, restoring from a pre-mutation copy each time, and
ran `npx vitest run components/`:

| mutation | what it does to a user | result |
|---|---|---|
| **A** `x1/x2={col.x}` → `{col.xStart}` in the chart's crosshair `<line>` | the crosshair snaps to the **midpoint between two readings**, never to a reading. The tooltip still names the right instant, so the line and the numbers disagree | **10 files passed, 184/184 tests passed** |
| **B** chart: `xStart = (xFor(prev)+x)/2` → `xFor(prev)`, `xEnd = (x+xFor(next))/2` → `xFor(next)` | zones now span neighbour-to-neighbour and **overlap**. The later-painted zone wins hit testing, so the pointer anywhere between two readings — *including directly on top of reading i's own dot* — reports reading **i+1**. "Snap to nearest" silently becomes "snap to next" | **184/184 passed** |
| **C** sparkline: `xEnd = (x + xFor(index+1))/2` → `xFor(index+1)` | same defect on the sparkline. `Q2-SP3` survives it, because the first column still starts at 0 and the last still ends at `width` | **184/184 passed** |

Concrete failure scenario for B/C, in the shape §6.2's amendment names: an operator on a
laptop hovers the spike on the COOLING chart to read it. The crosshair sits on the spike, and
the tooltip reports the *following* sample — 5 s later and several degrees cooler. Nothing in
the suite, in the 79-mutation harness, or in `pnpm verify` notices.

**Sub-finding F1a — the new adjacency test names a property it does not check.** The test
phase's `Q2-H6`/`Q2-SP7` test is `⚠ every hover-zone rect is immediately followed by its OWN
crosshair group`. Its body counts `<rect …hover-zone…>…</rect><g …crosshair` matches and
compares to `hoverZoneCount`. It never establishes *ownership*: an implementation emitting
`<g c0/><rect z0/><g c1/><rect z1/><g c2/>` — every zone paired with the **next** column's
crosshair — produces exactly `zones` adjacent pairs and passes. This is `ANCHOR.md` §5's
named recurring defect ("a test that names a property it does not check has appeared in
every single step") landing on the very test written to close the previous gap. The property
that would actually hold it is `col.xStart <= x1 <= col.xEnd` per pair, which is also what
kills mutations A, B and C.

---

## F2 — [REASONED, DOM order EXECUTED] Both per-mark `<title>` tooltips are occluded by the hover layer. §6.2's "per-mark tooltip on bars and dots" is not satisfied for the marks that exist.

`build.md` §3.5 and §7 rest the "per-mark tooltip" half of §6.2 on native `<title>`s attached
to the two discrete dot marks the chart draws — a lone-point run's dot (`Q2-H4`) and an
end-label's dot (`Q2-H5`) — and the sparkline's own lone-point dot. §3.7 describes the dot's
title as "a redundant, more precise path to the same content".

**It is not a path at all.** The hover `<g>` is the *last* child of the `<svg>` (I dumped the
markup: `lone-point` at index 955, `data-role="hover"` at index 1866), its rects carry
`pointer-events: all`, and they tile the whole of `[0, plotWidth] × [0, plotsHeight]`. SVG
hit-testing walks paint order topmost-first; the topmost hit element that carries a `<title>`
supplies the tooltip. The rect is on top and has its own `<title>`. **The circle below it can
never receive the pointer, so its `<title>` can never be displayed.**

Two precise exceptions, both accidental:

- A **mid-plot lone-point dot** (`r=2`) is fully covered — its own column, or a neighbour's,
  covers every pixel of it. Fully unreachable.
- The **end dot** (`r=2.5`) sits at `cx = xFor(lastPoint.tMs)`, which for the newest sample is
  `plotWidth` — the last zone's `xEnd`. So a ~2.5 px crescent on its right edge protrudes past
  the hover layer and *is* hoverable (it lies inside the 600-wide viewBox, since
  `plotWidth = width − 46`). The tooltip is reachable in a 2.5 px sliver at the extreme right
  of the plot. The same holds for the sparkline's end dot, which protrudes past `width` and is
  visible because `.sparkline` sets `overflow: visible`.

Consequences to adjudicate:

1. **`build.md` §7's recorded spec gap is understated.** It says §6.2's bar/dot clause "has
   nothing else to attach to" but is "satisfied … for the marks that exist today". The marks
   that exist today carry titles that a user cannot reach. The honest statement is that the
   clause is **entirely** unmet, not partially met.
2. **`Q2-H4` and `Q2-H5` back tests over markup with no user-facing effect.** They are not
   *wrong* — the markup is what it claims — but they are the only two Q2 mutations whose
   protected behaviour is inert in a browser, and the ledger cannot tell that apart from a
   sound one.
3. The end dot's title is also the one place the two tooltips can *disagree*: it renders
   `s.endLabel` (a free caller string) while the hover column at the same instant renders
   `plot.formatTick(v)`. My fixture made them "66 °C" and "9 °C" simultaneously.

Not a re-file of the parent's `pointer-events` check: that was about the zone being inert.
This is the zone working correctly and shadowing something else.

---

## F3 — [EXECUTED] The table view's entire accessible naming is unprotected. Removing the caller's `aria-label` and every `<caption>` leaves the suite green.

§6.2 calls the table view "an accessibility floor". The naming that makes it one is
`<div role="group" aria-label={ariaLabel}>` on the wrapper plus a `<caption class="sr-only">`
per table (`sparkline.tsx` likewise). I applied:

- **MUT D** — deleted `role="group" aria-label={ariaLabel}` from the chart's table wrapper
  *and* deleted the `<caption>` entirely → **184/184 passed.**
- **MUT E** — deleted the sparkline table's `<caption>` → **184/184 passed.**

`grep -n "caption\|aria-label\|scope=" components/*.test.tsx` confirms the only `aria-label`
assertion in either file is at `stacked-time-series-chart.test.tsx:312`, which renders the
**default (chart) view**; there is no caption assertion anywhere and no ⚠ test covering the
table view's naming.

Concrete failure scenario: a future refactor tidies the wrapper `<div>` away (it exists only
to hold `role`/`aria-label` and a flex class). The COOLING table then reaches a screen-reader
user as two unnamed tables of unlabelled numbers, the chart's `role="img"` name having been
left behind in the branch that no longer renders. `pnpm verify` is green and the 79-mutation
harness is green.

---

## F4 — [REASONED] No row header. The time column is `<td>`, so a cell announces its series but never its instant.

`<th scope="col">time</th>` labels the column, but each row's own time cell is
`<td>{formatTime(row.tMs)}</td>` — the same in both components. In a data table, a screen
reader navigating cell-by-cell announces the column header plus the cell content; with no
`<th scope="row">` there is nothing to announce the *row*.

Concrete failure scenario: a user reading the COOLING table with VoiceOver/NVDA in table mode
arrows right across a row and hears "GPU 0, 66 °C" then "GPU 1, 63 °C" — and has no way to
learn which of the 360 instants they are on without arrowing back to column 1 and reading it
as ordinary data. The chart's crosshair binds the reading to its instant; the table, which is
supposed to be the *complete substitute* for that (`build.md` §3.6 declines keyboard parity on
exactly this ground), does not.

The fix is one attribute per component (`<th scope="row">` for the time cell), so this is
cheap; I record it because the handoff asked specifically whether the markup earns the phrase
"accessibility floor", and this is the clearest place it does not.

---

## F5 — [EXECUTED] A gap outside the drawn window renders as a table row but not as a hatch. Reachable with ordinary production data.

The chart branch filters gaps against the domain:

```
if (toMs < fromMs) return null;
if (toMs < domainStartMs || fromMs > domainEndMs) return null;
```

`tableRowsFor` applies **neither** filter — it maps every element of `gaps` to a row.

**This is reachable without contriving anything.** `lib/client/runtime.ts` prunes gaps at
`(ring.newest?.tsMs ?? wire.tsMs) - LONGEST_WINDOW_MS`, and `lib/client/prefs.ts` sets
`LONGEST_WINDOW_MS = max(WINDOW_MINUTES) * 60_000 = 120 min` while the selectable window is
**10, 30 or 120** minutes (default 30). So `state.gaps` legitimately holds gaps up to 110
minutes older than the start of a default 30-minute window.

Executed (`E3`): domain `[t0, t5s]`, one gap `hidden` at `t−500s … t−450s`.

```
chart view : 0 hatch rects            (data-gap-reason count = 0 — correct)
table view : <tr data-role="gap-row"><td colSpan="2">gap (hidden) — t-500 to t-450</td></tr>
```

Concrete failure scenario: the operator is on the default 30-minute window. Forty-five minutes
ago the tab was hidden for ten minutes. The chart correctly shows no hatch. Toggling to the
table view puts `gap (hidden) — 13:15:00 to 13:25:00` as the first row of a table whose
readings all lie between 14:00 and 14:30. The reader is told the selected window contains a
gap it does not contain, at two times that are not on the axis. That is the table view
claiming *more* than the chart, which is the exact inverse of the symmetry `build.md` §3.4
argues for when it declines to give the sparkline a gap column.

**F5a — the inverted-gap guard is also missing.** Same experiment with
`{fromMs: t25, toMs: t5}`: chart draws 0 hatches (the `toMs < fromMs` guard), table renders
`gap (failed) — t25 to t5`. Lower reachability (nothing in `gaps.ts` produces one today), but
it is the same one-line omission.

---

## F6 — [EXECUTED] A non-finite reading is "unreadable" to the chart and `NaN °C` to the tooltip and the table. Invariant 1, in the interaction the handoff asked about.

Both components' chart paths deliberately treat non-finite as unreadable:
`sparkline.tsx:114` and `stacked-time-series-chart.tsx:204` both read
`if (p.v === null || !Number.isFinite(p.v))`, and `stacked-time-series-chart.tsx:231` filters
the y-domain the same way. **Q2's three new value-rendering paths do not**:

- `hoverTooltipFor`: `v === undefined || v === null ? EM_DASH : plot.formatTick(v)`
- `tableRowsFor`: `v === undefined || v === null ? EM_DASH : plot.formatTick(v)`
- sparkline hover title and table cell: `p.v === null ? EM_DASH : formatValue(p.v)`

Executed, `points = [{v: 5}, {v: NaN}, {v: Infinity}]`:

```
sparkline chart : polyline breaks at index 1; no dot; nothing drawn   (correct)
sparkline hover : <title>t5\nNaN °C</title>                            (WRONG)
sparkline table : <td>NaN °C</td> … <td>Infinity °C</td>               (WRONG)
chart    table  : <td>NaN °C</td>                                      (WRONG)
```

Same expression backs the chart's tooltip, so it prints `NaN °C` too.

**Reachability, stated honestly.** JSON cannot carry `NaN`/`Infinity`, so nothing crossing
`/api/telemetry` produces one; this is not reachable from the wire today. It is reachable from
a caller-supplied `pick` in `traceFor(state, pick)` — any derived trace with a division
(`usedMiB / totalMiB`, a rate, a percentage against a zero denominator) yields `NaN` or
`Infinity` while typechecking as `number`. Step 10 writes those `pick` functions and has not
been built. The components already decided this input is in scope — they guard it in three
places — so the finding is the **internal inconsistency**, not a hypothetical: the same value
is a silent break in the chart and a printed measurement in the two surfaces Q2 added.
Invariant 1's governing sentence ("never draw a value that was not read") points the same way,
and `build.md` §3.1 invokes exactly that sentence to justify the tooltip's exact-instant
lookup.

---

## F7 — [EXECUTED] A plot with series but no samples renders a header-only `<table>` with an empty `<tbody>`. The "no readings" note is unreachable for the realistic empty case.

`ChartTableView`'s empty branch fires only on `plots.length === 0`. Executed with one plot
carrying one series and `points: []`:

```html
<div role="group" aria-label="X"><table><caption class="sr-only">A</caption>
<thead><tr><th scope="col">time</th><th scope="col">A</th></tr></thead>
<tbody></tbody></table></div>
```

Concrete failure scenario: `nvidia-smi` has been failing for the whole window (§6.5's
degraded state, and the shape §9's "a condition whose subject stops being reported" row is
about). The chart view still draws axes, gridlines and hatched gaps, which reads as "the
window is empty". The table view renders a table with two headings and zero rows — silence,
with no `—` and no sentence. `plots.length === 0` is the case a caller essentially never
produces, because the COOLING panel always passes its two `ChartPlot`s; the case it *does*
produce is this one, and it is the one with no message.

The sparkline handles the same situation (`points.length === 0` → `<p>no readings in the
selected window</p>`), so the two primitives disagree. This is `ANCHOR.md` §5's "every
boundary guard needs a fixture on both sides" — the guard exists, on the wrong side.

---

## F8 — [EXECUTED] The sparkline drops its hover layer entirely when every reading is null; the stacked chart keeps it. `Q2-SP1`'s property does not survive that boundary.

`Sparkline` returns the `data-empty` `<svg/>` on `points.length === 0 || readable.length === 0`.
`readable.length === 0` means *there are points, all null*. Executed:

```
Sparkline,  points = [{null},{null}]   -> <svg … data-empty="true"></svg>   0 hover zones
StackedTSC, same input                  -> 2 hover zones, each <title> "…: —"
```

`Q2-SP1` is `⚠ a null point still gets its own hover zone — it is not silently absorbed by a
neighbour`. That property holds only while at least one readable point exists; at the all-null
boundary the null points get no zone at all, which is a stronger version of the same loss the
mutation exists to catch. Concrete failure scenario: a GPU whose collector has been failing for
the whole 30-minute window. Its sparkline offers no tooltip at all, so a laptop reader cannot
discover *when* the box was sampled-but-unreadable; the full chart in the same state does tell
them. The sparkline's table view does render `—` rows, so the information exists — it is only
the hover layer that vanishes, asymmetrically with its sibling primitive.

---

## F9 — [EXECUTED] Points outside the domain produce zero-width hover zones and let one instant claim a quarter of the plot.

`hoverColumnsFor` computes midpoints from `xFor`, which **clamps** to `[0, plotWidth]`. Two
consecutive instants that both clamp to the same edge therefore produce identical midpoints.
Executed — domain `[t0, t10s]`, points at `t−30s, t−20s, t−10s, t+5s`:

```
<rect data-role="hover-zone" x="0" y="0" width="0"     height="110">   <- unhoverable
<rect data-role="hover-zone" x="0" y="0" width="0"     height="110">   <- unhoverable
<rect data-role="hover-zone" x="0" y="0" width="138.5" height="110">   <- instant t-10s, OUTSIDE the window, owns 25% of the plot
<rect data-role="hover-zone" x="138.5"   width="415.5" height="110">
```

Two distinct wrong outputs: (a) zero-width rects that are unhoverable but still emit a
crosshair `<g>` each, so `hoverZoneCount === crosshairCount` still holds and every Q2 count
assertion is satisfied by dead nodes; (b) the last out-of-domain instant claims the span from
`x=0` to the midpoint of the first in-domain instant, so hovering the left quarter of the plot
reports a reading taken **before the window the axis is labelled with** — the chart draws
nothing there, and there is no visible mark under the crosshair to contradict it.

**Reachability caveat.** `traceFor` windows the ring with `samplesWithin` before decimating,
so if step 10 sets `domainStartMs` from the same window bound, no point escapes it. The
component's own prop doc says the bounds are "explicit — never inferred from the data", so it
neither requires nor checks the containment it depends on; F5 shows the sibling input (`gaps`)
genuinely does exceed the domain in production. I rank this **medium-low reachability, real
defect**: the guard `xEnd > xStart` and a domain filter on instants are both one line.

---

## F10 — [EXECUTED count, REASONED consequence] The table view has no height bound. Toggling it puts 700–1,200 rows into a fixed grid cell, which §6.1's no-scroll promise cannot absorb.

The handoff's §3.5 asks for the *consequence*, not the arithmetic. Measured on the real
components:

| case | hover zones | crosshair `<g>` | markup |
|---|---|---|---|
| shared sample clock, 3 series × 600 points, 2 plots (`build.md`'s common case) | **600** | 600 | 281 KB |
| adversarial, no shared instants (`build.md`'s 600×N) | **1,800** | 1,800 | **726 KB** |
| same chart, `view="table"` | — | — | **1,202 `<tr>`**, 52 KB |

- **Hover layer, §6.7.** 1,800 columns is 1,800 `<rect>` + 1,800 `<title>` + 1,800 `<g>` +
  1,800 `<line>` = **~7,200 additional DOM nodes**, reconciled by React on **every 5 s poll**.
  §6.7 fixes no DOM budget, so this is not a violation; it is a number the spec does not carry
  and step 10 will inherit. I do not think it threatens §6.1 — the layer occupies no layout
  space.
- **Table view, §6.1 — this is the one that bites.** `.tableView` is `display: flex;
  flex-direction: column; gap: 12px` and `.table` is `width: 100%; border-collapse: collapse`.
  **Neither carries a `max-height`, an `overflow`, or any row cap.** A COOLING chart on the
  default 30-minute window at the 5 s cadence holds ~360 instants → 2 tables × ~361 rows
  ≈ **722 rows**; at the 120-minute window it decimates to 600 → **1,202 rows**. At the ~17 px
  the `.table` rules imply, that is **12,000–20,000 px of content dropped into a grid cell that
  §6.1 budgets at a few hundred px**, inside a layout whose whole promise is "no scroll at
  ≥1280×1024".

The build's §4 cost analysis is careful and correct — about the *chart's* DOM. It never
computes the table view's height, and that is the axis on which §6.2's "they cost nothing when
unused" stops being true the moment they are used. Whoever wires step 10 needs either a
scroll container, a row cap, or a stated decision that toggling to table view is allowed to
scroll; none of the three exists today and the primitive gives the caller nothing to hang it
on.

---

## F11 — [EXECUTED] `09-T13`'s new comment records coverage that does not exist.

The re-anchor comment added by Q2 (`regressions.py`, around line 538) reads:

> This anchor is unique to the `<svg role="img">` block; **the table view's own aria-labelling
> is covered by Q2-TV's own mutations instead.**

No `Q2-TV*` mutation touches `aria-label={ariaLabel}` on the table wrapper, and MUT D (F3)
demonstrates that deleting it costs nothing. The re-anchor itself is sound — I confirmed the
two-line `role="img"\n      aria-label={ariaLabel}` block is unique and that the mutation
still reddens its own tests — but the sentence justifying the narrowing is false, and it is
exactly the kind of sentence a later phase will read instead of re-checking. `ANCHOR.md`'s
own lesson applies: writing it down is not evidence it took.

---

## F12 — [REASONED] The sparkline's table and chart both carry a constant accessible name, so N sparklines on a page are N identically-named tables.

`Sparkline` has no `ariaLabel` prop. Its chart view is `aria-label="trend over the selected
window"` (pre-existing, step 9) and Q2's table view adds `<caption class="sr-only">trend over
the selected window</caption>` plus columns `time` / **`value`** — the unit appears only
inside each cell, via `formatValue`.

Concrete failure scenario: §6.1 puts a sparkline in GPU 0, GPU 1 and CPU. A screen-reader user
listing the page's tables hears three tables all named "trend over the selected window", each
with a column called "value". Which card a table belongs to is recoverable only from DOM
position. §9 requires that "identity never rests on colour alone" and §6.2 promotes the table
to the thing that discharges it; here identity rests on document order alone, which is worse.

The stacked chart does better (its caption is the series labels), though its caption still
carries no unit and no metric — "GPU 0, GPU 1" for a temperature table. This is why F4 and F3
matter together: the floor is assembled from a name, a caption, column headers and row
headers, and three of those four are either generic, absent, or untested.

Contrast with the same repo's own precedent: `Meter` and `Chip` both carry an `sr-only` word
precisely so meaning survives without colour, and `stacked-time-series-chart.tsx` makes
`ariaLabel` **required and deliberately un-defaulted** for exactly this reason ("any built-in
sentence would announce two of the three charts on screen as the wrong one" — its own prop
doc). The sparkline has the built-in sentence that comment argues against.

---

## F13 — [REASONED, low] Two points sharing a `tMs` collide on the table's React key.

`<tr key={p.tMs}>` (sparkline) and `<tr key={row.tMs}>` (chart). Executed: two points at the
same `tMs` render two rows with the same key; `renderToStaticMarkup` is silent, a live client
would warn and could mis-reconcile on the next 5 s poll. **Reachability is nil today** — §6.7
keys the ring on `ts` and drops repeats, and `decimateSeries` guards `secondIndex !==
firstIndex` so a bucket never emits its point twice. Recorded only so a future change to
either of those two guards has a written note that this row key depends on them.

---

## What I attacked and could NOT break

This section is load-bearing per the handoff; it is where reconcile should *not* spend budget.

1. **The handoff's §3.1 hypothesis about the crosshair group — refuted, twice over.**
   `.crosshairGroup { opacity: 0; pointer-events: none; }`. `pointer-events: none` is
   inherited by the `<line>` child, so an `opacity: 0` group is not hit-testable and **cannot**
   intercept the pointer or block the next zone. And the `<title>` is not inside the
   crosshair group at all — it is a child of the `<rect class="hoverZone">`, which is opaque to
   hit testing (`pointer-events: all`). So the "does a `<title>` inside an `opacity: 0` element
   still show" question does not arise: no tooltip lives in a hidden element. The build picked
   `opacity` over `visibility`/`display` and put the title in the zone; both choices are right.
   *(This is what led me to F2 instead: the danger is not the hidden group, it is the visible
   zone shadowing the marks underneath.)*

2. **The CSS-only reveal mechanism itself.** `.hoverZone:hover + .crosshairGroup { opacity: 1 }`
   with the pair emitted adjacently by one `Fragment` per column: React flattens Fragments, and
   the dumped markup is `</rect><g class="…crosshairGroup…">` with nothing between, in every
   fixture I rendered. `+` works on SVG elements in an HTML document. The mechanism is sound.

3. **Exact-instant lookup — no fabricated readings anywhere.** I could not get
   `hoverTooltipFor` to emit a neighbour's value: `Map.get` miss → `undefined` → `EM_DASH`,
   explicit `null` → `EM_DASH`, and the timestamp on the tooltip is always the instant the
   reading was taken at, never the pointer's position. **Including inside a gap**: hovering the
   middle of a hatched span reports the last pre-gap sample *with that sample's own timestamp*,
   which is honest — the handoff's §3.4 worry about a tooltip printing `0`, blank or a
   fabricated in-gap reading does not occur. (`NaN` does — that is F6, and it is a different
   mechanism.)

4. **Invariant 1 in the table, both directions, both components.** `v: null` → `EM_DASH`;
   `v: 0` → the caller's formatted zero **with its unit**. Both are tested, and `Q2-TV4`/
   `Q2-SP6` correctly mutate to the falsy check (`!v`), which is the classic way to break it.
   No hard-coded unit exists in either component; every value-bearing cell goes through the
   caller's formatter. Nothing to add here.

5. **Degenerate geometry.** Single instant → one full-width column `[0, plotWidth]`. Series
   with `points: []` → zero hover zones, no crash. Sparkline with `n === 1` → `xFor` guards the
   divide-by-zero and emits one column `[0, width]`. All-null stacked chart → one zone per
   instant with an em-dash title. The step-9 "one-vertex polyline paints nothing" defect has
   **no analogue in the hover layer** — a lone instant gets the whole width, not a zero-width
   rect. (The zero-width case exists, but for a different reason: clamping, F9.)

6. **`Q2-TV1`/`Q2-SP4` are not false bites.** `view === 'chart-x'` is a `TS2367` under
   `tsc --noEmit`, so I checked whether the harness "bites" on a type error rather than on the
   named behaviour. It does not: applied to the chart, `npx vitest run` reported
   `Type Errors  no errors` and **7 genuine test failures**, the table-view assertions. Vitest's
   `typecheck.include` is `**/*.test-d.ts` and `components/` has none. The mutation is sound.

7. **The re-anchoring of `09-T1` and `09-T13`.** I re-checked uniqueness of both new anchors by
   grep and re-ran `09-T13` by hand (both of its substitutions together — it is a pair, and
   applying one gives a misleading single failure). Both anchor where the test phase says they
   do. The only defect is the *comment* on `09-T13` (F11), not the mutation.

8. **The 600×N cost claim's arithmetic and its shape.** Measured directly: shared clock → 600
   zones (not 1,800); fully divergent → 1,800. `hoverInstantsFor` really does union across every
   plot, so `N` is the chart's total series count, matching `build.md`. The claim is accurate.
   My disagreement is about the *table's* height, not the hover layer's node count (F10).

9. **The "one table per plot, never merged" decision, and the tooltip that does merge them.**
   I looked for an inconsistency here — the tooltip lists °C and RPM lines in one popup, which
   is precisely what `build.md` §3.2 refuses to do in a table row — and concluded there is
   none: a tooltip line is `label: value`, self-describing and vertically stacked, whereas a
   table row puts two units in adjacent cells under one header row. Different failure, correctly
   decided differently. Not a finding.

10. **`purity.test.ts` is untouched and both components remain hook-free.** `git diff --stat`
    shows no change to it, and the `view`-as-prop architecture follows necessarily. I did not
    find a way the toggle could have been held internally.

11. **The two new required `Sparkline` props.** No production call site exists
    (`grep -rn "<Sparkline"` finds only the test file), so the source-breaking change is
    confined as claimed, and `tsc --noEmit` enforces it structurally.

---

## Reproduction notes

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard
npx vitest run components/          # 10 files, 184 tests — the F1/F3 mutations all leave this green
pnpm verify                         # exit 0, 2237 tests, no type errors  (re-run after revert)
git status --short                  # 7 modified + 3 untracked, exactly as build+test left it
```

Every mutation in F1 and F3 was applied with a Python in-place substitution against a
`cp`-backed original and restored immediately after the run. No harness was run (the parent
and the test phase both already ran it; nothing here changes a mutation), and `pnpm verify`
was never run alongside one.
