# Step 10c-3 — sizing and visual (TEST). **Step 10 closes with this loop.**

**Written by the test-phase agent, 2026-09-09.** Fresh agent, no memory of prior sessions.
Verified against the tree as built by `10c3-build.md`; every claim below was re-derived by
reading the code and/or re-running a harness myself, not taken on the build doc's word.

---

## 1. §3 — F14b's `gaps` wiring, and whether the six re-anchored mutations were narrowed

### 1.1 The three call sites all pass `state.gaps`, and it is the ONLY correct source

Three production `<Sparkline gaps={…}>` call sites exist: `gpu-panel.tsx` (one, mounted twice —
GPU 0 and GPU 1 — so two card instances) and `cpu-panel.tsx` (two — temperature and
utilisation). All three pass `gaps={state.gaps}`.

`state.gaps` is not a per-metric quantity. `lib/client/runtime.ts:114` carries `gaps` at the
**top level** of `RuntimeState` — one array per session, populated by `paused`/`hidden`/`failed`
sampling events (`lib/client/runtime.ts:332,376,493`), never by anything about a specific
reading. Every panel receives the same, full `RuntimeState` deliberately: `components/panel-props.ts`'s
own doc says so in as many words — **"The full `RuntimeState`, deliberately, not a pre-sliced
subset"** — and its bullet list of binding rules a panel body must already follow includes
**"hatch `state.gaps`, never a hole in a series"**, a rule that predates F14b. So F14b's change
is not introducing a new source; it is Sparkline finally honouring an obligation every other
chart-bearing panel (COOLING's `StackedTimeSeriesChart`, wired to `state.gaps` since Q2) already
met, and `state.gaps` is definitionally the right value at all three sites because there is only
one such value in the whole client state. There is no discrimination question here — GPU 0,
GPU 1, and CPU's two traces were never sampled on independently gappy schedules; the client
either was or was not collecting samples at all, session-wide.

### 1.2 The six re-anchored mutations — verified NOT narrowed, by re-running, not by reading

I ran `pipeline/steps/09-ui-primitives/regressions.py` myself and checked, by name, which
⚠-marked test reddens under each of the six re-anchored mutations (`09-SP2`, `09-SP4`,
`Q2-SP5`, `Q2-SP6`, `Q2-SP11`, `Q2-SP12`). This is the check the handoff specifically asked for:
the ledger only proves *some* ⚠ test reddened, not that it is the *same* test defending the
*same* property as before the restructuring.

| mutation | test that reddens | same property as before? |
|---|---|---|
| `09-SP2` | `⚠ a null reading breaks the line rather than being bridged across` | **Yes.** The mutant makes an unreadable point neither flush the run nor get pushed — same "silently dropped instead of breaking" bug, reproduced with an ordinary null point and an **empty `gaps` array**, so the new `gapBreak` machinery is not what makes this test fail |
| `09-SP4` | `⚠ zero does not break the run — it renders in the same polyline as its neighbours` | **Yes.** The mutant swaps `p.v !== null` for `Boolean(p.v)`, the identical falsy-vs-null substitution the original targeted |
| `Q2-SP5` | `⚠ invariant 1 in the table: a null reading renders the em dash` | **Yes.** Only the accessor moved (`p.v` → `row.point.v`) to match the new `TableRow` union; the assertion (`formatValue` must not run on `null`) is untouched |
| `Q2-SP6` | `⚠ invariant 1's other half: a v=0 reading renders the numeral` | **Yes.** Same accessor move, same falsy-vs-null property |
| `Q2-SP11` | `⚠ each row's time cell is a <th scope="row">…` | **Yes.** Same accessor move, same row-header property |
| `Q2-SP12` | `⚠ NaN and Infinity render the em dash in the table too…` | **Yes.** Same accessor move, same non-finite property |

All six land on the exact test whose name states the property the original mutation defended,
not on some other ⚠ test that happens to also redden. None of the six requires a non-empty
`gaps` array to trigger — they all still exercise the pre-F14b property in isolation, which is
the property that would have gone silently unguarded if the restructuring had narrowed them.
**Not narrowed.**

One further check worth recording: `Q2-H10` (the zero-width hover-column mutation) was
**retired**, not re-anchored, because `clipPlotsToDomain` removed its only reachable trigger
through the public component. I confirm this is a real retirement, not a hidden narrowing: the
harness's own rule is that a mutation returning `exit=0` ("did not bite") fails the run, so
leaving it in would make `regressions.py` permanently red for a reason unrelated to a defect —
verified by reading the current `hoverColumnsFor` filter, which only a caller bypassing the
public component (a future internal-helper test) could still reach out-of-domain input against.
It is replaced by `10c-F9-1`/`10c-F9-2`, which target `clipPlotsToDomain` itself — the actual
fix — and both bite (confirmed in the harness run below).

### 1.3 The failure F14b fixes — constructed and confirmed

The build's own test file already constructs the exact scenario: four points where a real
sampling gap sits between array indices 1 and 2 (99 seconds apart, `tMs: 1000` then
`tMs: 100_000`, no null placeholder). I re-ran it:

- **Baseline** (`gaps` omitted): `polylineCount === 1`, `gapRectCount === 0` — one smooth,
  unbroken line across the gap. This is the pre-fix bug, reproduced and kept in the suite
  explicitly as "the pre-existing (wrong) behaviour, kept as the baseline this fix changes."
- **Fixed** (same points, `gaps={[{fromMs: 5000, toMs: 90_000, reason: 'hidden'}]}`):
  `polylineCount === 2`, `gapRectCount === 1` — the run breaks and a hatch mark (flat tint
  `<rect data-role="gap">`, per the module doc's reasoning for not using the full chart's
  diagonal pattern) appears in its place.

Both pass under `pnpm verify` (confirmed in §5). This is the concrete before/after the handoff
asked for: the fix does show a hatch (a flat-tint rect, not a diagonal weave — a deliberate,
documented simplification for a canvas a few dozen pixels wide) in place of the smooth,
misleading line.

---

## 2. Q2-F9 — the drop, and its edge cases

### 2.1 All points out of domain

**No crash, in either view.** I constructed this directly (a plot whose one series has two
points, both before `[domainStartMs, domainEndMs]`) and rendered both view modes:

- **Table branch:** correctly renders `no readings in the selected window` — this is `tableRowsFor`'s
  pre-existing empty-row guard (Q2 reconciliation, F7), which fires here because `rows.length === 0`
  after both the (now empty) sample rows and any gap rows are computed. `clipPlotsToDomain` makes
  this reachable through domain-clipping in addition to F7's original trigger (a collector that
  failed for the whole window).
- **Chart (SVG) branch:** renders an axis-only plot box with **no polyline, no dot, and no
  "no readings" message** — `yDomainOf` degrades gracefully to a default `[yMin, yMin+1]` range
  when `values.length === 0`, and `runsOf([])` returns no runs, so nothing throws. But note this
  is a genuine **asymmetry**: `plots.length === 0` (the whole array empty) gets the accessible
  `aria-label="… — no time range to plot"` / `data-empty="true"` treatment; a single *plot* whose
  own series all lost their points does not get an equivalent per-plot announcement — the SVG's
  one shared `aria-label` stays generic and the plot is silently blank.

  **This is not new to Q2-F9 and not something F9 was asked to fix** — F7 closed only the table
  side of exactly this gap (its own comment names the trigger as "a plot whose series reported
  nothing for the whole window \[…] a collector failing throughout"); the chart-branch half of
  that same asymmetry already existed before this loop and Q2-F9 merely adds a second way to
  reach it (a domain that excludes every point, versus F7's "the collector never returned
  anything"). In today's real callers this path is a defensive backstop only — `traceFor`
  windows data before any chart sees it, so a live caller does not produce this state — matching
  the framing already given to `Q2-H10`'s retirement. **Recorded for whoever next touches Q2/F7's
  chart branch; not fixed here**, since a real fix means deciding how to surface a per-plot empty
  state inside one shared multi-plot `<svg>` (a `<title>` per plot group, or a second `aria-label`
  scheme), which is an accessibility design decision `SPEC.md` does not make and this loop's
  scope (sizing/visual) should not improvise.

### 2.2 Exactly one surviving point after clipping

**Both files already carry the step-9 "lone-point circle" fix, in the two places the handoff
named**, and it composes correctly with `clipPlotsToDomain`:

- `components/sparkline.tsx` (~line 513): `run.length === 1` draws a `<circle data-role="lone-point">`
  because "an SVG polyline with a single vertex paints nothing."
- `components/stacked-time-series-chart.tsx` (~line 906): the identical guard, same comment,
  same `data-role="lone-point"`.

I constructed the domain-clip case directly (three points, only the middle one inside
`[0, 60000]`) and confirmed via a scratch test: `runsOf` on the clipped, single-survivor array
produces one run of length 1, and the lone-point `<circle>` renders with a correct `<title>`
tooltip and the polyline still carries that one coordinate (an SVG polyline with one point
paints nothing, but the run's own polyline element is still emitted per the "one polyline per
run" invariant). **No crash, no vanishing reading.** (Scratch test was written, run, and deleted
— not part of the committed diff; `git status` was clean before and after.)

### 2.3 Table vs. chart agreement

**They cannot disagree, by construction.** `StackedTimeSeriesChart` calls `clipPlotsToDomain`
exactly once, before branching on `view`:

```ts
const plots = clipPlotsToDomain(rawPlots, domainStartMs, domainEndMs);
if (view === 'table') { return <ChartTableView plots={plots} … />; }
… // chart branch also reads `plots`, the same clipped value
```

Both branches consume the identical `plots` reference — there is no second, independent
filtering step either could diverge on. This is also asserted directly in the build's own new
test (`⚠ the table view has no sample row for a dropped instant either — chart and table cannot
disagree about which points exist`), which passes.

---

## 3. L9 — `CHART_SIZE.gpuPromoted`, and no bare literal survives

Confirmed by grep across every production call site (`components/grid.tsx`,
`components/panels/{gpu,cpu,cooling}-panel.tsx`): the only `width={…}`/`height={…}`/
`plotHeight={…}` literals anywhere under `components/` are (a) inside `grid.tsx`'s own
`CHART_SIZE` object definition, and (b) inside test files, where an explicit small size (`100`,
`90`, `80`) is a legitimate fixture value, not a production chart's dimension. Every panel call
site reads `CHART_SIZE.sparkline`, `CHART_SIZE.cooling`, or `CHART_SIZE.gpuPromoted` — no bare
number remains at a call site. `gpu-panel.tsx`'s promoted chart genuinely uses
`CHART_SIZE.gpuPromoted.width`/`.height` (verified by reading the diff directly, not the build
doc's description of it).

---

## 4. 2.5f — re-derived independently, same conclusion

I re-ran the verification myself rather than trusting the build doc's grep: every `height`,
`min-height`, `max-height` declaration in every `.css`/`.module.css` under `components/` and
`app/`, plus `app/layout.tsx`'s inline style and `grid.module.css`'s
`grid-template-columns`/`grid-template-rows` usage.

**Same result.** `grid.module.css` sets `grid-template-columns` at every breakpoint and never
`grid-template-rows` (rows stay the CSS Grid default, `auto`). `app/layout.tsx`'s `<body>` sets
only `margin`/`background`/`color`. The only real, non-`min-height:0` `height` declarations
anywhere in the tree are `meter.module.css`'s 6px/100% progress bar (a small fixed decoration,
unrelated to a panel body) and `tokens.css`'s own 1px `.sr-only` trick. `min-height: 0` appears
at `panel-shell.module.css` and `grid.module.css` but — per CSS's own rules — that only removes
an implicit minimum, it does not bound anything. **No panel body has a bounded ancestor.**
Switching `--table-scroll-max: 40vh` to `max-height: 100%` today would compute as unconstrained
(no definite containing-block height in the chain) and silently uncap the table. **Correctly
left alone.**

---

## 5. F4 — 6/7 confirmed by independent re-run; #7's prior "corroboration" does not hold up

### 5.1 Independent re-run

I ran `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` myself (Chrome present,
port 39173 free beforehand). Identical result to the build doc, byte-for-byte on the failure
detail:

```
PASS  3. 1280px: 4-column layout (the design target)
PASS  1. >=1280px: COOLING spans rows 2-3 in columns 1-2
PASS  2. 1279px side of the 900/1280 breakpoint: 2-column layout
PASS  5. 900px side: 2-column layout, COOLING full width
PASS  4. 899px side of the 900px breakpoint: 1-column layout
PASS  6. <900px: panel priority order (GPUs -> COOLING -> SAFETY -> SERVING -> CPU/MEMORY -> STORAGE -> LOG)
FAIL  7. >=1600px: GPU 0 shows the promoted chart, not the sparkline
      {"svgCount":0,"gpu0Text":"GPU 0— · ——no severity bandno GPUs enumeratednvidia-smi: ENOENT"}
```

Teardown verified clean: `lsof -i :39173` empty after exit, no stray `next dev` process, no
`.env` file written or left behind, `next-env.d.ts` regenerated by the spawned `next dev` and
reverted with `git checkout -- next-env.d.ts`. `git status` matched the pre-run state exactly.

### 5.2 ⚠ Correction: 10c1's earlier claim about measurement 7 does not survive re-derivation

The handoff asked what #7 would prove and what still rests on the earlier manual pass. Checking
that manual pass (`10c1-build.md` §3.1, the interactive-browser attempt that preceded this
loop's headless script) turned up a real contradiction, not just an "unverified" label:

`10c1-build.md` §3.1 states measurement 7 **"was confirmed by reading computed style, not by
eye"** — that `getComputedStyle` on GPU 0's `fullChartWrap` read `display: block` and on its
`sparklineWrap` read `display: none`.

That cannot be reconciled with the code as it stood at the time. `gpu-panel.tsx`'s
"no GPUs enumerated" takeover branch (`snapshot.gpus === null` → renders
`<p className={styles.takeover}>no GPUs enumerated</p>` and returns, **never** rendering
`sparklineWrap` or `fullChartWrap` at all) was introduced in commit `bdc1c5c` (step 10b) —
**two commits before** 10c1's own commit `a0c2c0e`, so it already existed during 10c1's
measurement session. And `10c1-build.md`'s own text, a few paragraphs later in the *same*
document, confirms `gpus: null` was the live condition on this Mac during that very session
(the force-alarm discussion: *"`?forceAlarmForTesting=1` on this GPU-less Mac
(`/api/telemetry` genuinely returns `gpus: null`)"*). If `gpus` was null, the takeover branch
must have been active, and `fullChartWrap`/`sparklineWrap` could not have existed in the DOM for
`getComputedStyle` to read — those two claims inside `10c1-build.md` are mutually
inconsistent. I confirmed independently, by re-running the actual dashboard today, that the
identical `gpus: null` condition still produces the takeover branch with zero `<svg>` elements
and the literal text `"no GPUs enumerated"` — matching the *second* of 10c1's two claims, not
the first.

I cannot determine from the document alone how the `display: block`/`none` reading was
produced (a stale/cached page, a different route, or a misattributed result are all
possibilities) — but it should **not** be treated as corroborating evidence for measurement 7.
The correct accounting is: **6 of 7 measurements are now real, repeatable, browser-verified
facts** (this loop's headless script). **Measurement 7 has never been observed against a real
`display` toggle with real markup in a real browser** — not partially, not by an earlier pass.

### 5.3 What #7 would actually prove, and what step 11 should know rests on nothing but structure

Closing #7 for real would show that when `gpus` is genuinely a populated array (real hardware,
or a fixture that fabricates the whole array — `force-alarm.ts` can only **mutate an existing
entry**, so it structurally cannot produce this state on a GPU-less machine, confirmed by
reading its own code and `10c1-build.md`'s note that live-mounting a real alarm "needs a machine
where `gpus` is actually an array"), the `min-width: 1600px` media query genuinely flips
`sparklineWrap` to `display: none` and `fullChartWrap` to visible **in a real browser's
cascade**, and that `StackedTimeSeriesChart` paints real SVG content there.

Today, nothing has shown that. What stands in its place, and what it does and does not prove:

- `grid.test.tsx`'s source-text guard — proves the breakpoint **number** and the CSS rule
  **text** are written correctly. A static check; no cascade, no browser.
- `gpu-panel.test.tsx`'s jsdom tests — by `gpu-panel.tsx`'s own module doc, quoted verbatim:
  *"CSS media-query behaviour is not observable from `renderToStaticMarkup`. This file's tests
  can prove both elements render with the right content and that exactly one of the two wrapper
  classes is meant to be visible at a time by construction; they cannot prove the breakpoint
  paints correctly in a real browser."*

Both are real and both stop short of a paint proof. From step 11's perspective this is the same
state as "unverified," full stop — not "unverified, but a prior pass got partway there." Closing
it needs either the real `ai-server` box, or a `force-alarm.ts` successor that fabricates a
whole `gpus` array (recorded as future work in both `10c3-build.md` §5.3 and here — not
attempted in this loop, since it is a behavioural change to production-adjacent code).

---

## 6. The `toContain` lint and dangling-class audit

Ran both guard files directly: `lib/tocontain-scope.test.ts` and `lib/dangling-css-class.test.ts`
— **80/80 pass**. Neither guard fires on this loop's work: the new `.gap`/`.gapRow` classes in
`sparkline.module.css` are declared and referenced correctly (no dangling `styles.X`), and none
of the new or restructured `toContain` assertions in `sparkline.test.tsx` /
`stacked-time-series-chart.test.tsx` hit an ambiguous, multiply-occurring needle.

---

## 7. Verification

```
$ pnpm verify
 Test Files  99 passed (99)
      Tests  2788 passed (2788)
Type Errors  no errors
```

```
$ python3 pipeline/steps/09-ui-primitives/regressions.py
Red-test ledger: 148 distinct failing tests across 101 mutations; 112 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 101 regressions failed their check, as they must.
```

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 220 distinct failing tests across 172 mutations; 200 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 172 regressions failed their check, as they must.
```

```
$ git status --short
 M components/grid.tsx
 M components/panels/cpu-panel.tsx
 M components/panels/gpu-panel.tsx
 M components/sparkline.module.css
 M components/sparkline.test.tsx
 M components/sparkline.tsx
 M components/stacked-time-series-chart.test.tsx
 M components/stacked-time-series-chart.tsx
 M components/tokens.css
 M package.json
 M pipeline/steps/09-ui-primitives/regressions.py
 M pnpm-lock.yaml
?? pipeline/handoffs/10c3-sizing.md
?? pipeline/handoffs/10c3-test-phase.md
?? pipeline/steps/10-panels-assembly/10c3-build.md
?? pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
```

Checked after every harness run and after the independent `measure-breakpoints.mjs` re-run — no
stranded mutation, no leftover `.env`, `next-env.d.ts` reverted each time it was regenerated.
No `pnpm verify` was ever run concurrently with a harness or with the browser script; all runs
were sequential, foreground, no polling.

**No code was changed in this phase.** Every item in §1–§6 was a verification (re-derivation,
re-run, or direct construction of the scenario in question), not a fix — the build's own
implementation held up against all of it except the one documentation correction in §5.2, which
is a correction to `10c1-build.md`'s claim, not to any code in this loop's diff.
