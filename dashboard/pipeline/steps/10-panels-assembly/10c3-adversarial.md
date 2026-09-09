# Step 10c-3 — sizing and visual (ADVERSARIAL). **Step 10 closes after this loop.**

**Written by the adversarial agent, 2026-09-09.** Fresh agent, no memory of prior sessions.
Nothing was fixed; every experiment below was reverted and `git status` re-checked. Final state
of the tree is byte-identical to the one `10c3-build.md` §8 describes, and `pnpm verify` exits 0
at **99 files / 2788 tests** after every experiment was undone.

**12 findings. 9 EXECUTED, 3 REASONED.** The two that matter most are **A1** (SPEC §6.1's only
quantitative promise is violated at every viewport size it applies to — measured in a real
browser, and the seven measurements this loop built do not check it) and **A3** (the
measurement that reports `PASS` for the <900px priority order never looked at two of its nine
panels, because the script asks for slot names that do not exist).

---

## 0. Method — what I actually ran

| | |
|---|---|
| `pnpm verify` after reverting every experiment | 99 files / **2788 tests** / exit 0 |
| Guard files run directly (`tocontain-scope`, `dangling-css-class`, `styles`, `guardrails`, `unit-suffix`, `cross-harness-ledger`, `purity`) | 227/227 pass — **neither the `toContain` lint nor the dangling-class audit fires on this loop's work** |
| Scratch render tests (`renderToStaticMarkup`, written → run → deleted) | 4 scenarios, §A4/A5/A9 below |
| Source mutations, applied and reverted | 4 (`clipPlotsToDomain`'s two boundaries; `gaps={state.gaps}` removed from both CPU call sites) |
| Real headless Chrome, via a **copy** of `measure-breakpoints.mjs` with only `measure()` replaced | 2 runs. Copy deleted; `next-env.d.ts` reverted; port 39173 free and no `next dev` process after each |

⚠ Nothing ran concurrently. No harness ran alongside `pnpm verify`. No polling. The only browser
launched was the script's own headless Chrome, closed by its own `finally` block — verified by
`lsof -nP -iTCP:39173` (empty) and `ps` (no `next dev`, no headless Chrome) after each run. The
user's own Chrome was never touched.

I did not re-open anything the handoff listed as settled.

---

## 1. Findings

### A1 — ⚠ §6.1's no-scroll promise is violated at **every** size it applies to, and none of the seven measurements checks it. **EXECUTED.**

§6.1 makes exactly one quantitative claim: *"The 'no scroll' promise holds at ≥1280px **wide**
and ≥1024px **tall** … At 1920×1080 it fits comfortably,"* clarified 2026-09-08 to mean *"what
the promise forbids is the **grid** growing past the viewport and the reader having to scroll the
dashboard to see a panel."*

Measured in real Chrome, logged in, default (`chart`) view, this Mac:

| viewport | `documentElement.scrollHeight` | `clientHeight` | verdict |
|---|---|---|---|
| **1280 × 1024** | **1413** | 1024 | **SCROLLS by 389px** |
| **1600 × 1024** | **1333** | 1024 | **SCROLLS by 309px** |
| **1920 × 1080** | **1317** | 1080 | **SCROLLS by 237px** |

It is the grid, not a stray element. At 1920×1080 the only two body children with height are the
sticky header band (**49px**, `position: sticky`) and `.grid` (**1268px**, at `y=49`, bottom
edge 1317). Every other body child is a 0-height `<script>` or `next-route-announcer`
(`position: absolute`), so **no dev-server overlay is in flow** and none of the overflow is an
artefact of `next dev`. Row heights at that width: GPU cards 162, COOLING 868 (spanning),
CPU/MEMORY 458, SAFETY/STORAGE 397, SERVING/LOG 190.

**This measurement is the most favourable case that exists, and it still fails.** The GPU cards
were 162px tall *only because* `gpus: null` puts them in the takeover branch — one `<p>` and an
error note. Populated they carry a headline row, a view toggle, a 44px sparkline, a VRAM meter
and four to five rows; row 1 is `max(gpu0, gpu1)`, so on the real box the page gets **taller**,
not shorter. §6.1 says the mock was ~1026px tall at 1280 wide; the built grid is **1364px** at
that width (1413 − 49), ~340px past the thing it was drawn from.

**Concrete failure:** the wall panel in §1's decision 7 — a fixed display nobody stands at — hides
SERVING and SESSION EVENT LOG below the fold at 1920×1080, and hides SAFETY (*"the panel that
earns the dashboard's existence"*) partially at 1280×1024. Nobody scrolls a wall panel.

**Why this is 10c-3's, not a leftover:** this loop's own deliverable was *"the seven §6.1
breakpoint measurements, run headlessly and repeatably"*. Six of the seven measure **column
counts and relative positions**; the seventh measures a `display` toggle. The one number §6.1
actually commits to is not among them, and the script measures the 1280 checkpoint at
**height 900** — below the 1024 the promise is conditioned on — so it could not have observed it
even incidentally. One `page.evaluate` would have.

I make no claim about the right fix (a bounded grid, tighter panels, or a spec revision are all
real options and it is a layout decision, not a bug fix). The finding is that **step 10 is about
to close with §6.1's only measurable promise unmeasured and, now that it has been measured,
false.**

### A2 — measurement #7: what it asserts, why nothing has ever shown it, and the fixture lever that does exist. **EXECUTED (the lever), REASONED (the residue).**

**What #7 asserts, precisely.** Not "the promotion is implemented". It asserts three things at
once, all of which need a real cascade: that `.sparklineWrap` computes `display: none` at
≥1600px, that `.fullChartWrap` computes non-`none` there, and that both wrappers are in the DOM
to be asked. `gpu-panel.module.css` carries `.fullChartWrap { display: none }` at base with a
`@media (min-width: 1600px)` block flipping both — a paint-tier fact by HANDOVER §0.6's table,
so jsdom, `grid.test.tsx`'s source-text guard and `gpu-panel.test.tsx`'s structural tests are all
structurally incapable of it, by their own module doc's admission.

**I confirm the test phase's §5.2 correction, and I add to it.** `forceAlarmForTesting` returns
`body` **unchanged** unless `Array.isArray(snapshot.gpus) && snapshot.gpus.length > 0`
(`lib/client/force-alarm.ts:86`) — it can only mutate an existing entry, so it is structurally
inert on a machine whose `/api/telemetry` returns `gpus: null`. I re-confirmed in a real browser
today that this Mac still produces the takeover branch: `document.querySelectorAll('[data-slot="gpu0"] svg')`
has **length 0**.

**The lever exists and is cheaper than either document says.** The seam is already built and
already used: `RuntimeEnv.fetchTelemetry`'s response is reshaped in the browser's own memory,
behind the same two gates (`NODE_ENV !== 'production'` **and** an explicit query flag), before
`wire.ts` validates. Fabricating a `gpus` array is the same mechanism as mutating one, at the
same seam, under the same gates. And it needs **less** fidelity than the docs assume, because
**both chart primitives emit an `<svg>` on their empty branch** — `sparkline.tsx`'s
`data-empty="true"` `<svg>` and `stacked-time-series-chart.tsx`'s `"— no time range to plot"`
`<svg>`. So a single fabricated card with every field `null` and an empty ring is enough to make
both wrappers render and make `svgs.length >= 2` true; no trace data, no second card, no real
hardware. That is the concrete recommendation for whoever picks this up — it is a behavioural
change to production-adjacent code, so I did not attempt it.

**⚠ The residue is wider than "measurement 7".** The same media query has **two** sides and
neither has ever been observed:

- **≥1600px:** the promoted chart is visible and the sparkline is hidden. Never observed.
- **1280–1599px — the design target:** the sparkline is visible and the promoted chart is hidden.
  **Equally never observed**, and not among the seven measurements at all. Every measurement
  taken at 1280 is about the grid's columns, not the GPU card's interior.

So what steps 11 and 12 inherit is not "one of seven is blocked". It is: **the GPU card's
sparkline↔chart promotion has never been seen to work in either direction in any browser**, and
the only evidence for either is that the CSS text is written correctly and both elements render.
If the media query's `min-width` were wrong, or if a later rule out-specified
`.fullChartWrap { display: none }`, the failure mode is silent in both bands: at the design
target you would get **two** charts stacked in the card (both visible), and at ≥1600px you would
get **none**. Neither shows up in `pnpm verify`, and neither shows up in the six measurements
that pass.

**One more thing #7 depends on that nothing asserts.** The script identifies the two wrappers
**positionally** — `svgs[0].parentElement` is assumed to be `.sparklineWrap` and
`svgs[1].parentElement` `.fullChartWrap`. That holds today only because `sparkline.tsx` and
`stacked-time-series-chart.tsx` are the only two files in `components/` and `app/` that emit
`<svg>` (verified by grep). Add any icon, badge or second trace to the GPU card and #7 silently
measures the wrong pair, in the direction that **passes**.

### A3 — ⚠ measurement 6 reports **PASS** while two of its nine panels were never looked at. **EXECUTED.**

`PRIORITY_ORDER_900` (line 102) names `'storage'` and `'log'`. The grid renders
`data-slot="storage-and-network"` and `data-slot="session-event-log"`. Attribute selectors are
exact-match, so `document.querySelector('[data-slot="storage"]')` is `null` — confirmed against
the live page:

```
PROBE slots present: ["gpu0","gpu1","cooling","cpu","memory","safety",
                      "storage-and-network","serving","session-event-log"]
PROBE querySelector([data-slot="storage"]) = null
PROBE querySelector([data-slot="log"])     = null
```

`rectsOf` returns `null` for both, and the ordering predicate is null-tolerant:

```js
ys.every((y, i) => i === 0 || y === null || ys[i - 1] === null || y >= (ys[i - 1] ?? 0))
```

so both the `memory → storage` and the `storage → log` comparisons are **skipped**, and the
measurement prints `PASS  6. <900px: panel priority order (… -> STORAGE -> LOG)` having checked
neither. Replayed in Node: with every slot `null` the predicate returns `true` — a *fully*
vacuous PASS is one rename away.

This is the fifth instance of the project's own documented shape (HANDOVER §0.6: *"an assertion
whose subject does not render cannot fail"*), and the two positions it skipped are exactly the
two §6.1 is silent about and `grid.module.css` had to decide by hand (its own ⚠ block: *"where
SESSION EVENT LOG lands in the <900px priority list"*). The one recorded invariant-7 decision in
that file is the one the browser measurement did not check.

**A second vacuous path in the same script, same class.** `columnsOf` reads
`getComputedStyle(gpu0.parentElement).gridTemplateColumns`. On any element that is not a grid
that computes to `'none'`, and `'none'.trim().split(/\s+/).filter(Boolean).length === 1` — so
**measurement 4 (`899px → 1 column`) passes on an element that is not a grid at all.** Wrap the
grid in one div and #4 keeps saying PASS.

### A4 — ⚠ the sparkline renders a real gap as a **hole**, with no hatch and no table row, whenever a `null` reading sits on either side of it. **EXECUTED.**

`components/panel-props.ts`'s binding rules, quoted by the test phase: **"hatch `state.gaps`,
never a hole in a series."** `gapMarksFor` and `tableRowsFor` both bail on `if (!bothReadable)
return;`, so a gap bounded by a `null` point produces nothing at all. Rendered, same data, same
`gaps` array:

| | sparkline (1280–1599px, the design target) | promoted chart (≥1600px) |
|---|---|---|
| chart form | **0** `data-role="gap"` rects | **1** hatch rect |
| table form | **0** gap rows | **1** `gap (hidden) — … to …` row |

The sparkline's table for that fixture, verbatim from the render:

```html
<tr><th scope="row">00:00:00</th><td>60 u</td></tr>
<tr><th scope="row">00:00:01</th><td>—</td></tr>
<tr><th scope="row">00:30:00</th><td>65 u</td></tr>
```

**Concrete failure:** a poll succeeds but `nvidia-smi` returns no `tempC` for that one sample
(invariant 5's ordinary case — a partial snapshot), then the tab is hidden for thirty minutes,
then sampling resumes. The CPU/GPU card shows a broken line and a table with an em dash and no
gap row. A reader cannot distinguish *"one reading failed"* from *"thirty minutes were never
sampled"*, which is the distinction §6.7 spends a paragraph on and the distinction the whole
`gaps` mechanism exists to carry.

**This is a deliberate, mutation-guarded decision (`10c-SP3`), and the reason given for it only
covers half of what it does.** The reason is *"the null already breaks it"* — true of the
**chart** form, where a discontinuity is at least visible. It is not true of the **table** form,
where nothing breaks, nothing is drawn, and the row simply is not there. `10c-SP3`'s ⚠ test
asserts `gapRectCount === 0` on the chart branch **only**; the table branch of that same fixture
is never rendered in the suite. This is HANDOVER §0.6's "sibling case, for the third loop
running" at a fourth site: fixed on the branch it was reasoned about, missed one branch over —
and the branch missed is §6.2's declared **accessibility floor**, the thing that is supposed to
say at least as much as the chart it substitutes for.

### A5 — ⚠ one gap draws **N marks and N identical table rows** on the sparkline where the chart draws one — and the case is the one §6.7 spells out. **EXECUTED.**

`gapBetween` is an interval **overlap** test between a gap and each *adjacent pair of points*,
so it fires once per pair the gap spans. §6.7 explicitly blesses readings landing **inside** a
gap: *"A poll already in flight when the tab is hidden, a poll in flight when the operator
pauses, and a refresh now taken while paused all land inside the gap: the reading is kept, and
the gap is **neither closed nor split**."*

Fixture: paused at t=1s; *refresh now* at 20s and 40s (both kept, per that rule); resumed at 60s.
One `Gap {fromMs: 1000, toMs: 60000, reason: 'paused'}`.

| | sparkline | promoted chart |
|---|---|---|
| gap rects | **3** | **1** |
| table gap rows | **3**, all reading `gap (paused) — TIME(1000) to TIME(60000)` | **1** |
| polylines | 4 (two lone points) | — |

The sparkline **splits** the gap the spec says is not split, and its table asserts three separate
outages of identical extent where there was one. **Concrete failure:** an operator counting
outage windows in the table — the accessibility floor, the thing that exists so numbers are
reachable without reading pixels — counts three. The same operator on a ≥1600px display counts
one. Neither the count nor the duplication is asserted anywhere: the F14b table test uses
`expect(html).toContain('gap (hidden) — …')`, which is HANDOVER §0.5's *"`toContain` cannot see a
duplicate"* at a tenth site.

The doc's own words — *"One hatched marker per gap that falls between two consecutive rendered
points"* (`GapMark`) — describe the intended model, and the implementation is one marker per
*pair*, not per *gap*.

### A6 — ⚠ the production wiring that F14b exists to deliver has **no test and no mutation**. **EXECUTED.**

Deleting `gaps={state.gaps}` from **both** of `cpu-panel.tsx`'s `<Sparkline>` call sites and
running the full suite:

```
Tests  2801 passed (2801)      # 2788 + 13 scratch; zero failures
```

Green. `components/` alone: 492/492. Neither harness names it either — `grep -c gaps` in
`pipeline/steps/10-panels-assembly/regressions.py` (172 mutations) is **0**, and all five
`10c-SP*` mutations target `sparkline.tsx`, not the panels. So the wiring that turns a fixed
primitive into a fixed dashboard is defended by nothing, in a project whose own rule
(HANDOVER §0.5) is *"when a function is used more than once, grep for its other call sites before
believing the mutation that names it"*.

**Concrete failure:** any future edit to `cpu-panel.tsx` that drops the prop — a refactor, a
props-object change, a merge — restores the exact F14b bug (a smooth line across unsampled
ground) on CPU temperature and CPU utilisation, silently, at the design-target breakpoint, with
`pnpm verify` green and both harnesses green.

**The build's own §8.4 answer to this — *"worth a code-review habit, not a guard"* — runs against
this project's own precedent twice over.** L11 was the same shape (*"no guard stops a component
hard-coding `' RPM'`"*) and this project's answer was a **guard**, shipped in 10c-2, with a
canonical constant built to point it at. And `StackedTimeSeriesChart.gaps` is a **required** prop
for the identical fact — so the two primitives disagree about whether gap-awareness is optional,
and the one that made it optional is the one used in the band §6.1 calls *the design target*.
Three options exist and none was weighed in the notes: make it required (costs edits in
`sparkline.test.tsx`'s renders, no new machinery, compile-time), add a source-text guard over
`components/panels/*.tsx` (costs nothing at the call sites, precedent already built), or fixture
it at the panel level (cheapest, weakest).

### A7 — ⚠ `CHART_SIZE`'s `height` means two different things, and the entry added this loop is justified by misreading it. **EXECUTED.**

`CHART_SIZE.sparkline.height` is the **total** height of the rendered `<svg>`.
`CHART_SIZE.cooling.height` and `CHART_SIZE.gpuPromoted.height` feed `plotHeight`, which is
**per plot**: `plotsHeight = plots.length * plotHeight + (plots.length − 1) * PLOT_GAP`, plus
`AXIS_HEIGHT = 20`. Rendered and measured:

| entry | declared | actually painted |
|---|---|---|
| `sparkline` | 220 × 44 | 220 × **44** |
| `cooling` | 480 × 210 | 480 × **450** |
| `gpuPromoted` | 480 × 140 | 480 × **160** |

L9's deliverable was *"the one place a future panel gets a chart's pixel box from"*. A future
panel asking "how tall is COOLING's chart" is told 210 for a 450px element — the file is
canonical and the answer it gives is wrong by 2.1×, under a field named `height` next to an entry
where `height` does mean height.

The consequence is not hypothetical, because **the justification written this loop is derived
from the misreading**: *"140px tall (shorter than COOLING's 210px, because COOLING stacks two
plots and this is one)."* If 210 is per-plot, then "COOLING stacks two plots" is a reason for its
**total** to be larger and says nothing about its per-plot box; taken at face value the stated
reasoning argues `gpuPromoted` should be **210** (the same per-plot box, one plot instead of two).
The number 140 is unchanged from 10b and nothing regressed — but L9 asked for *what computes a
size and where*, and the recorded derivation does not hold. (The pre-existing paragraph
comparing 210 against *"that primitive's own default `plotHeight` for two stacked plots"* — 2×110
= 220 — makes the same category error, so this predates the loop; 10c-3 is the loop that made the
file canonical and added a third entry reasoned the same way.)

### A8 — ⚠ the gap mark is a colour-only signal at **1.12:1** contrast and a 2px floor. **REASONED (computed from the tokens).**

`.gap { fill: var(--gridline); opacity: .55 }` over `--surface-1`:
`#2c2c2a` at 0.55 over `#1a1a19` = **`#242422`**, a contrast ratio of **1.12:1** against the panel
ground. WCAG 2.2 SC 1.4.11's floor for a non-text UI component is 3:1. On a sparkline the mark's
width is `max(2, |x₁ − x₀|)`, and because this component positions by **index**, `|x₁ − x₀|` is
one point-spacing — at 220px wide with a full 600-point window that is **0.37px**, so essentially
every real gap mark renders at the 2px floor regardless of whether it covers six seconds or two
hours.

**Concrete failure:** on the wall panel §1's decision 7 describes, the only on-screen difference
between *"the client stopped sampling for thirty minutes"* and *"this reading failed"* is a 2px
column that is 12% lighter than the background behind it. §9 requires identity never to rest on
colour alone; the text equivalent that would discharge that is the table's gap row — which A4
shows is suppressed in precisely the ambiguous case, and A5 shows is triplicated in another.

I am not claiming the diagonal hatch was the right call — the module doc's argument against a
per-instance `<pattern>` id is sound. The finding is that *"strictly more honest than the smooth
line it replaces"* is true and *"visible"* is untested, unmeasured, and by this arithmetic
doubtful.

### A9 — ⚠ the module doc's *"an out-of-window gap is excluded by construction"* is false for an **open** gap. **EXECUTED.**

`sparkline.tsx`'s F14b section: *"a gap entirely outside the window has no such pair to fall
between — so an out-of-window gap is excluded by construction, not by a second check."* True for
a **closed** gap. False for an open one, because `gapBetween` substitutes
`Number.POSITIVE_INFINITY` for `toMs === null`: an open gap is never outside any window, and
matches **every** adjacent pair in it. Rendered — three points spanning two minutes, one gap
`{fromMs: 0, toMs: null}` that opened two hours before the first rendered point:

```
rects = 2, polylines = 3, table gap rows = 2
```

The marks themselves are arguably right (nothing between those points was sampled), so this is
not a wrong rendering on its own — it is A5's mechanism again, and it means the **stated reason
the sparkline needs no domain filter does not cover the open case.** `state.gaps` legitimately
holds entries up to 110 minutes older than a 30-minute window (the chart's own `tableRowsFor`
comment says so and filters accordingly); the sparkline's claim to need no equivalent filter is
justified by an argument that holds for two of the three shapes `Gap` can take. HANDOVER §0.7's
rule applies verbatim: *"read the guard's doc as a CLAIM and try to falsify it with one call."*

### A10 — the measurement script is a pipeline artifact that nothing runs, cannot pass, and cannot distinguish an environment block from a regression. **REASONED.**

Four properties, each individually defensible and jointly leaving the artifact unable to signal:

1. **Nothing runs it.** Not `pnpm verify`, not a harness. It is `.mjs`, so `tsc --noEmit` does not
   see it either, and there is no linter in the project (devDeps are `@types/*`, `jsdom`,
   `playwright-core`, `typescript`, `vitest`). A typo in it is caught only by running it — and
   A3 is exactly that, undetected across two independent runs by two phases who both read the
   `PASS` line.
2. **Its exit code is permanently 1** on the only machine that can run it, because #7 cannot pass
   here. So `process.exitCode` carries no information and the script cannot be wired into
   anything (a future CI step included) without first solving #7 or teaching it a "known blocked"
   state.
3. **A FAIL does not say which kind of FAIL it is.** #7's failure detail (`svgCount: 0`) is an
   *environment* block; a real cascade regression would print a *different* detail under the same
   `FAIL` line and the same exit code. Two phases have now written "6/7, #7 environment-blocked"
   into the record; the third reader will skim it.
4. **It is macOS-only by hardcoded path** and it measures `next dev`, not the standalone
   production build step 11 ships. CSS modules behave the same in both, so the risk is low — but
   nothing has measured the artifact that actually gets deployed.

### A11 — the script mutates a **tracked** file with no cleanup, and the project's own revert check is satisfied only by prose. **EXECUTED.**

Each run rewrites tracked `next-env.d.ts` from `./.next/types/…` to `./.next/dev/types/…`, and
the script's `finally` block does not restore it. Both `10c3-build.md` §9 and `10c3-test.md` §7
record a manual `git checkout -- next-env.d.ts` — a prose instruction standing in for the one
check ANCHOR §4 calls *"the primary check"*.

**I tested the failure I expected here and it does NOT occur**, so the finding is smaller than it
first looked: with the dev variant in place and `.next/` moved away entirely (a fresh-clone
state), `pnpm typecheck` still exits **0**. Recording that so nobody re-derives it. What is left
is real but modest: every run of this artifact leaves the tree dirty in a file no phase intends
to change, and `next build` silently reverts it, so a stray commit is self-healing rather than
harmful.

### A12 — a new test that cannot fail independently of the one above it. **EXECUTED (by reading both bodies).**

`sparkline.test.tsx`'s *"a gap entirely INSIDE one existing span … does not double-break unrelated
pairs"* builds a **byte-identical** fixture to the ⚠ test immediately preceding it and asserts a
strict subset of its assertions (`gapRectCount === 1`, which that test already makes). It cannot
go red unless the ⚠ test above it does. Its name promises a property — *unrelated pairs are not
double-broken* — that no assertion in its body distinguishes; the fixture the name describes
(a gap with several candidate pairs around it) is A5's fixture, which nothing tests. ANCHOR §5:
*"a test that names a property it does not check has appeared in every single step."* It is
unmarked, so the ledger does not require it to redden; it is dead weight either way, and the
property it names is the one A5 shows is broken.

---

## 2. What I attacked and could NOT break

- **`clipPlotsToDomain`'s boundary inclusivity is right, and both halves are load-bearing.**
  `<=` at the young end is not a style choice: `chartDomainOf` sets `domainEndMs` to
  `newestSample(ring).tsMs` **exactly**, so `<` would delete the newest reading — the end dot,
  the most important point on the trace — from every chart and every table on every render.
  `>=` at the old end matches `samplesWithin`'s own `sample.tsMs >= from`, which the module doc
  calls *"inclusive at the old end so the boundary sample belongs to the window it names."*
  I mutated both and the suite caught both: `<=`→`<` reddens 3 tests, `>=`→`>` reddens 14.
  (Neither of the two `10c-F9-*` mutations targets the operators — they remove the filter and
  the call — but existing tests cover the property, so this is a note, not a finding.)
- **A zero-width domain does not produce `NaN`.** `domainEndMs <= domainStartMs` reaches the
  `data-empty="true"` branch before `xFor` can divide by zero, in both views; a series whose
  points all share one instant renders clean too.
- **`Q2-H10`'s retirement holds**, though for a broader reason than the note gives.
  `hoverInstantsFor` collects into a `Set`, so duplicate `tMs` values collapse to one instant
  and cannot produce the zero-width column either — clamping was not the *only* path to it, the
  `Set` is what closes the other one.
- **Chart and table genuinely cannot disagree about which points exist.** One
  `clipPlotsToDomain` call above the `view` branch, both branches read the same reference. My own
  renders agree. (They *do* disagree about **gaps** — A4/A5 — which is a different mechanism.)
- **All four production `<Sparkline>` mounts and the promoted `<StackedTimeSeriesChart>` pass
  `gaps={state.gaps}`** — re-grepped, including the one the build's own diff hunk did not show.
- **The `toContain` lint, the dangling-class audit, `purity`, `unit-suffix`, `guardrails`,
  `styles` and the cross-harness ledger are all green on this diff** — 227/227, run directly.
  `.gap` and `.gapRow` are both declared; `--gridline` and `--ink-muted` both exist in
  `tokens.css`. Neither of the two guards the handoff warned about fires.
- **2.5f's "no bounded ancestor" conclusion is right, and I have independent physical evidence
  for it.** I did not re-run the grep a third time. I did something better by accident: the
  browser probe in A1 shows `document.documentElement.scrollHeight` exceeding `clientHeight` by
  237–389px, which *is* the observable consequence of nothing in the chain having a bounded
  height. Keeping `--table-scroll-max: 40vh` is correct. (⚠ A1 also strengthens the *other* half
  of that decision: the build declined a bounded grid partly because *"below 1280px the page is
  EXPECTED to scroll"* — true, and beside the point, since it now also scrolls at 1920×1080 where
  it is expected not to.)
- **No leaked process.** Port 39173 free, no `next dev`, no headless Chrome after both runs.
  `git status` matches the build's manifest exactly; `pnpm verify` 99/2788/exit 0.

---

## 3. ⚠ What step 10 leaves UNVERIFIED — read this first, step 11

Ordered by how likely it is to cost someone time.

1. **§6.1's no-scroll promise is not unverified any more — it is measured false** (A1), at
   1280×1024, 1600×1024 and 1920×1080, in the most favourable state the app has. It is a layout
   decision, not a bug fix, and it is the last thing step 10 should have closed. Everything about
   panel heights below inherits from it.
2. **The sparkline↔chart promotion has never been observed in a real browser in EITHER
   direction** (A2) — not at ≥1600px, and not at the 1280–1599px design target either. The
   fixture that would close it is a `gpus`-array fabrication at the `RuntimeEnv.fetchTelemetry`
   seam, gated exactly as `force-alarm.ts` is, and it needs only **one card with every field
   null** because both primitives emit an `<svg>` on their empty branch.
3. **The `<900px` priority order is verified for 7 of its 9 panels** (A3). STORAGE & NETWORK and
   SESSION EVENT LOG were never looked at, and those are the two positions §6.1 is silent about
   and `grid.module.css` decided by hand under invariant 7.
4. **The table view has never been measured in a browser at any width.** All seven measurements
   run with every panel in its default `chart` view. Toggling a panel to `table` changes its
   height by up to `--table-scroll-max: 40vh` (432px at 1080), which interacts directly with (1).
5. **Nothing has been measured against the artifact step 11 ships.** Every browser fact in this
   step comes from `next dev` on a GPU-less macOS host. The standalone production build's CSS has
   never been loaded in a browser by anyone.
6. **The panels' `gaps` wiring is unguarded** (A6) and **`Sparkline.gaps` is optional while
   `StackedTimeSeriesChart.gaps` is required** — a future chart-bearing panel inherits the F14b
   defect by omission, and neither harness will say so.
7. **Sparkline and the promoted chart disagree about gaps** in two directions (A4: sparkline says
   nothing where the chart hatches; A5: sparkline says it three times where the chart says it
   once). Whichever way that is settled, the two views of the same data currently do not agree,
   and the table — the accessibility floor — is on the wrong side of it in both.
8. **The banner-item wrapping question is still the owner's** (§6.4 silence, no code depends on
   it). Unchanged this loop, correctly.
9. **`measure-breakpoints.mjs` will not tell anyone when the grid changes shape** (A10): nothing
   runs it, its exit code is pinned to 1, and it is not typechecked or linted. Treat its recorded
   `PASS` lines as a snapshot taken by hand on 2026-09-09, not as a standing guarantee — and note
   that one of those `PASS` lines (A3) was already wrong when it was written.

⚠ **Nothing in this document was fixed.** `git status` is the build's manifest, `pnpm verify`
exits 0 at 99 files / 2788 tests, and every scratch file, mutation, probe copy and regenerated
`next-env.d.ts` was reverted and re-checked.
