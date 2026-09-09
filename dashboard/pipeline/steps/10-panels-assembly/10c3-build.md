# Step 10c-3 — sizing and visual (BUILD). **Step 10 closes with this loop.**

**Written by the build agent, 2026-09-09.** Branch `dashboard-frontend`, started clean at
`6c2e64a`. Seven items, per the handoff at `pipeline/handoffs/10c3-sizing.md`.

## 0. Summary

| # | Item | Outcome |
|---|---|---|
| L9 | Chart/sparkline sizing | **Canonical answer named**: `components/grid.tsx`'s `CHART_SIZE`. Added the missing `gpuPromoted` entry and pointed `gpu-panel.tsx` at it, closing the one place a size was still a bare literal |
| 2.5f | `40vh` → `max-height: 100%` | **Verified, not changed.** No panel body has a bounded ancestor even after the grid landed — switching would silently uncap the table again. Stopgap stays; the tokens.css comment now says so with the grep that proves it |
| 10b-F14b | No gap hatching at 1280–1599px | **Fixed.** `Sparkline` gained an optional `gaps` prop. The actual failure was worse than "no hatch": a real sampling gap between two rendered points drew one smooth, unbroken line — indistinguishable from a genuine reading |
| Q2-F9 | Clamp vs drop | **Decided: DROP.** `clipPlotsToDomain` removes an out-of-domain point from `StackedTimeSeriesChart` entirely (chart, hover, table) before anything else sees it, rather than pegging it to the domain's rail |
| 10a-F4 (remaining half) | The 7 breakpoint measurements | **Closed with a real headless run.** `playwright-core` (new devDependency, verified absent from `.next/standalone`) drives the SYSTEM Chrome via CDP. 6/7 measurements pass; #7 (≥1600px promotion) is environment-blocked on this GPU-less dev Mac, confirmed by evidence, not assumed |
| 10c1-A9-paint | Scope the browser step | Satisfied by construction — the script only reads `getBoundingClientRect`/`getComputedStyle` (paint), never binding or reference |
| Banner wrapping | Invariant 7 | **Recorded, not chosen.** SPEC §6.4 is silent on whether a banner item may wrap mid-condition; no CSS touched |

**Final state:** `pnpm verify` — 99 files / 2788 tests / exit 0. Step 9's harness
(`09-ui-primitives/regressions.py`, which owns `sparkline.tsx` and
`stacked-time-series-chart.tsx`) — 101 mutations, all bite, every ⚠ covered, exit 0. Step 10's
harness — 172 mutations, all bite, 200 ⚠ marks covered, exit 0, unaffected by this loop's
changes. `git status` clean except the intended diff (§8).

---

## 1. L9 — chart and sparkline sizing: the canonical answer, and what computes it

**The canonical answer is `components/grid.tsx`'s exported `CHART_SIZE` object.** This was
already the direction 10b took (it existed before this loop, with `sparkline` and `cooling`
entries) — the gap was that it was not yet *complete*: the ≥1600px GPU-card promotion
(`StackedTimeSeriesChart` inside `gpu-panel.tsx`) still carried its size as bare literals,
`width={480} plotHeight={140}`, at the call site rather than as a third named export. That is
precisely the drift the handoff named: "10b recorded GPU's 1600px-and-up chart as 480×140,
explicitly a recorded default" — a default that lived in the wrong file.

> ### ⚠ CORRECTION, written in by 10c-3's RECONCILIATION (adversarial A7) — this section's
> ### recorded derivation rests on a wrong number, and L9's canonical value was built on it
>
> **`height` in this object meant two different measurements, and the two entries this loop
> reasoned about were the ones where it did not mean height.** `Sparkline`'s `height` is the
> whole rendered `<svg>`. `StackedTimeSeriesChart`'s corresponding value is `plotHeight`, which
> is **per plot**: `plotsHeight = plots.length * plotHeight + (plots.length − 1) * PLOT_GAP`,
> plus `AXIS_HEIGHT = 20`. Rendered and measured:
>
> | entry | declared below | actually painted |
> |---|---|---|
> | `sparkline` | 220 × 44 | 220 × **44** |
> | `cooling` | 480 × 210 | 480 × **450** |
> | `gpuPromoted` | 480 × 140 | 480 × **160** |
>
> So a future panel asking this file — the file L9 makes canonical — how tall COOLING's chart is
> was told **210 for a 450px element**, under a key named `height`, beside an entry where
> `height` does mean height.
>
> **And the justification recorded below is derived from that misreading.** *"140px tall (shorter
> than COOLING's 210px, because COOLING stacks two plots and this is one)"* does not hold: if 210
> is per-plot, then "COOLING stacks two plots" is a reason for its **total** to be larger and says
> nothing about its per-plot box — taken at face value the argument would give `gpuPromoted`
> **210**, the same per-plot box for one plot instead of two. The same category error appears in
> the pre-existing paragraph comparing 210 against *"that primitive's own default `plotHeight`
> for two stacked plots"* (2 × 110 = 220), so it predates this loop; what this loop did was make
> the file canonical and add a third entry reasoned the same way.
>
> **The number 140 is unchanged and nothing regressed.** What was wrong was the recorded
> derivation, which is exactly what L9 asked for ("say what computes it and where").
>
> **Applied by the reconciliation:** the field is renamed `plotHeight` for `cooling` and
> `gpuPromoted`, so the type checker refuses the confusion at every call site, and the honest
> derivation is written into `grid.tsx`: these numbers are **authored**, not computed — a live
> measured size would need `ResizeObserver` + `useState`, which `purity.test.ts` forbids anywhere
> under `components/` — and `gpuPromoted`'s real justification is that 480 matches `cooling`'s
> width and a 160px painted total is what fits beside a GPU card's headline row, toggle, meter
> and rows. Read the block below with that correction in force.

**What now computes a size, concretely** (⚠ shown as this loop wrote it; the field is now
`plotHeight` on the lower two entries — see the correction above):

```ts
// components/grid.tsx
export const CHART_SIZE = {
  sparkline:   { width: 220, height: 44  },
  cooling:     { width: 480, height: 210 },
  gpuPromoted: { width: 480, height: 140 },  // added this loop
} as const;
```

- A primitive (`Sparkline`, `StackedTimeSeriesChart`) never picks its own size. Both already
  took `width`/`height`(`/plotHeight`) as **props** — that half of L9's ruling ("a primitive
  that picked its own size would be deciding layout from a leaf") was already honoured.
- A panel body (`gpu-panel.tsx`, `cpu-panel.tsx`, `cooling-panel.tsx`) reads the value it needs
  from `CHART_SIZE` and passes it down. There is now exactly **one** place in the codebase
  that spells out a chart's pixel box — `grid.tsx` — and three named entries for the three
  distinct shapes on the page: a one-row sparkline slot, COOLING's two-stacked-plot chart, and
  a promoted single-plot chart at ≥1600px (shorter than COOLING's because it draws one plot,
  not two).

**What "computed by the grid" means here, honestly.** `grid.module.css` never sets an explicit
row height — every grid row is `auto`-sized to its content (§2 below explains why this
matters for 2.5f too). So `CHART_SIZE`'s numbers are not *algebraically derived* from a live
CSS track size; they are **authored once, in the one module that owns layout**, as the
canonical value every chart-bearing panel must ask for rather than invent. That is the honest
answer the handoff asked for: *"if the honest answer is a size prop whose value the grid
computes, say what computes it and where"* — it is `grid.tsx`, and it computes it by being the
single source of truth an author edits once, not by reading back a live layout measurement.
Making it a *literal* live measurement (e.g. reading `getBoundingClientRect` on a grid cell and
sizing a chart to fit) is not viable inside `purity.test.ts`'s hook ban — that would need a
`ResizeObserver` and `useState`, which no file under `components/` may hold — so an authored
constant, kept in one file, is both the pragmatic and the structurally required answer.

**Files:** `components/grid.tsx` (new `gpuPromoted` entry + doc), `components/panels/gpu-panel.tsx`
(the two literals replaced with `CHART_SIZE.gpuPromoted.width`/`.height`). No test changes needed —
no existing test asserted the literal `480`/`140` text; the values are unchanged, only their
location moved. `grid.test.tsx` and `gpu-panel.test.tsx` both still pass unmodified.

---

## 2. SCOPE 2.5f — verified, not changed: no panel body has a bounded ancestor

**Verification method** (matching "verify rather than assert"): grepped every `height`,
`min-height` and `max-height` declaration in every `.css`/`.module.css` under `components/`
and `app/`, and read `app/layout.tsx` for an inline style.

**Result: still no bound, anywhere in the chain.**

- `grid.module.css`'s `.grid` sets `grid-template-columns` at every breakpoint but **never
  `grid-template-rows`** — rows are the CSS Grid default, `auto`, sized to their content. The
  file *does* set `min-height: 0` all the way down (`.grid` → each named slot → the slot's
  child), which is real and load-bearing (it lets the child's own `min-height: 0` actually
  shrink, per the file's own comment) — but `min-height: 0` bounds nothing; it only removes the
  *implicit minimum* a grid/flex item would otherwise refuse to shrink below.
- `panel-shell.module.css`'s `.panel`/`.body` carry `min-height: 0`, same story, still no
  `height`.
- `app/dashboard-shell.module.css` sets `position: sticky` on the header+banner band, nothing
  about height.
- `app/layout.tsx`'s `<body>` sets only `margin: 0` and colours — no `height: 100vh`, no
  `overflow`.
- The only OTHER `height` declarations anywhere under `components/`/`app/` are
  `meter.module.css`'s progress-bar (`6px` / `100%`, a small fixed-size decoration unrelated to
  a panel body) and `tokens.css`'s own `.sr-only` 1px trick. Neither bounds anything upstream
  of a panel.

**Consequence: switching `--table-scroll-max: 40vh` to `max-height: 100%` today would silently
un-cap the table again** — exactly the bug the 2026-09-04 stopgap exists to prevent.
`max-height: 100%` on a box whose parent chain has no *definite* height computes as
unconstrained per CSS's own percentage-height rule; the table would grow to its content again,
just like before Q2-S2 shipped the viewport-relative fallback.

**Decision: keep `40vh`. Do not change it this loop.** The `tokens.css` comment now records the
exact verification (the grep, the chain, the CSS rule that makes `100%` a no-op here) so a
future reader does not have to re-derive it, and states explicitly why this is not a small
follow-up step 10 merely forgot: **giving the grid a genuine bounded height (e.g.
`height: 100vh` with the grid scrolling internally) is a real layout decision, and it would cut
against §6.1's own "no-scroll promise governs the PAGE, not a component" — below 1280px the
page is *expected* to scroll.** Making the grid itself height-bound to satisfy one component's
stopgap would be solving 2.5f by re-litigating §6.1's breakpoint behaviour, which is out of this
loop's scope and belongs to whoever next revisits the grid.

**File touched:** `components/tokens.css` (comment only — no selector, no value changed).
`git diff` confirms the only change is the added ⚠ paragraph.

---

## 3. 10b-F14b — the 1280–1599px band's actual failure, and the fix

### 3.1 What the failure actually was (verified, not assumed)

`SPEC.md` §6.1 only promotes GPU/CPU sparklines to `StackedTimeSeriesChart` at ≥1600px; the
1280–1599px design-target band draws `Sparkline` (index-positioned, no time axis). `Sparkline`
took no `gaps` prop at all, by design (its own module doc called this "a recorded decision, not
an oversight" — sub-pixel timing differences are not legible at a few dozen pixels).

Tracing what that actually produces: a real sampling gap (hidden tab, pause, a run of failed
polls) means the **ring holds no sample at all** for that span — `lib/client/gaps.ts`'s `Gap`
entries are a wholly separate array from the ring, carrying real `fromMs`/`toMs`. `traceFor`'s
output therefore has **no null placeholder** for the missing span; the point immediately
before the gap and the point immediately after it are simply **adjacent in the array**.
`Sparkline` positions by array index, so it drew one continuous, unbroken polyline straight
across them.

**This is not "no hatch" — it is the worse of the two failures the handoff named.** A hole in a
series (a `null` point breaking the line) is at least visibly discontinuous and honest about
not knowing something. What actually shipped here had no discontinuity at all: a smooth line
that reads as a genuine continuous reading over ground nobody measured. That is strictly worse
than an un-hatched hole.

### 3.2 The fix

`Sparkline` gained an optional `gaps?: readonly SparklineGap[]` prop (a structural type
mirroring `lib/client/gaps.ts`'s `Gap`, not an import — same reasoning `SparklinePoint` already
gives for not pulling the client runtime into this file). Because every point still carries its
own real `tMs` even though its on-screen x is compressed to an index, the fix does not need a
time axis:

- `runsOf` now also flushes the current run when a `gaps` entry's interval falls strictly
  between two **adjacent, readable** array entries — the same mechanism a `null` reading
  already used, one more trigger.
- A `<rect>` marks the pixel span between those two indices. **Not the full chart's diagonal
  hatch pattern** — that needs a per-instance SVG `id` this component has never needed (nothing
  else here draws a `<pattern>` or `<clipPath>`), and a 6px-repeat weave is illegible across the
  2–8px a gap mark typically spans on a sparkline's own canvas. A flat, muted `fill: var(--gridline); opacity: .55`
  tint is used instead — strictly more honest than the smooth line it replaces, without
  inventing an id-management scheme for a decoration nobody could read at that scale anyway.
- The table view gained a matching **gap row** (`colSpan={2}`, same `gap (reason) — from to`
  wording `StackedTimeSeriesChart`'s table already uses) — this **reverses** the sparkline's own
  prior doc, which said the table had no gap column because the chart form didn't either; that
  symmetry argument flips the moment the chart side becomes gap-aware, or the table would say
  *less* than the chart it exists to be a complete substitute for.
- An open gap (`toMs: null`) extends to `+Infinity` when checking overlap, matching
  `StackedTimeSeriesChart`'s own `toMs ?? domainEndMs` at this component's scale (no domain
  here, so no upper bound to clamp to); its table row reads "ongoing".
- **No domain filtering is needed**, unlike the full chart's `tableRowsFor` (which must filter
  `gaps` against `[domainStartMs, domainEndMs]` because it draws against a fixed pixel domain
  independent of which points exist). Here a gap only ever matters between two points that are
  BOTH already in the caller's windowed `points` array, so an out-of-window gap is excluded by
  construction.

**Wired into production:** `gaps={state.gaps}` added to all three Sparkline call sites that
matter — GPU 0/GPU 1's temperature trace (`gpu-panel.tsx`) and CPU's temperature + utilisation
traces (`cpu-panel.tsx`). `state.gaps` was already in scope at every call site (the same object
`traceFor(state, …)` reads).

### 3.3 Tests and mutations

13 new tests in `components/sparkline.test.tsx` (6 chart-form gap tests including an open-gap
case and a "gap resolved before the first point" negative case; 3 table-form gap tests; 4 kept
unmarked as baseline/negative cases with no plausible wrong implementation). All 8 pre-existing
mutations in step 9's harness that anchor into `runsOf`/the table body were **re-anchored**, not
left broken — `09-SP2`, `09-SP4`, `Q2-SP5`, `Q2-SP6`, `Q2-SP11`, `Q2-SP12` all targeted text that
moved when `runsOf` and the table body were restructured; each is now re-pointed at the
equivalent new line, with the property under test unchanged and a note saying so. 5 new
`10c-SP*` mutations back the new ⚠ tests. Full harness: 101 mutations, all bite, 0 moved/ambiguous.

**Files:** `components/sparkline.tsx`, `components/sparkline.module.css` (`.gap`, `.gapRow`),
`components/sparkline.test.tsx`, `components/panels/gpu-panel.tsx`, `components/panels/cpu-panel.tsx`,
`pipeline/steps/09-ui-primitives/regressions.py`.

---

## 4. Q2-F9 — clamp vs drop: decided DROP, and implemented

### 4.1 The decision

**Drop an out-of-domain instant entirely — from the polyline, the lone-point/end-dot marks, the
hover layer, and the table's sample rows — rather than clamp its x into `[0, plotWidth]`.**

The reconciliation's own framing of the rejected middle ground is the reason this could not be
a one-line guard: dropping only the **hover column** while still drawing the clamped mark
"trades a wrong reading for a wrong reading" — the mark would still visually assert a false
instant, and hovering it would now report a *different*, neighbouring in-domain reading instead
of nothing at all. Both halves have to move together, or the chart and its own hover layer
disagree about what a mark on screen means.

Weighed against the alternative of leaving it clamped (the status quo): a mark pegged to the
domain's rail makes a **positional claim** — "this was read at (about) this time" — that is
false whenever the real `tMs` lies outside the window. This project already has a directly
analogous rule and I extended it rather than inventing a new one: the end-dot logic already
refuses to sit at the right edge for a trace that stopped early ("nothing is drawn at a time it
was not read"). Clamping to the *left* or *right* rail for an out-of-domain point is the same
lie in the other direction. `traceFor`'s own pipeline (`samplesWithin` → `seriesFrom` →
`decimateSeries`) already drops every out-of-window sample before a chart sees it — extending
the same treatment inside the chart primitive is closing a precondition gap, not adding new
behaviour.

**Why the Y-axis clamp is not a counter-example.** §6.3's magnitude clamp (a reading pegged to
the top rail when its *value* exceeds the plotted scale, e.g. the 14,451 RPM POST-hang reading)
keeps the mark at its real **time** position and only truncates its *value*, with the real
number still in the tooltip. A time-axis clamp has no equivalent "pegged but still
recognisable" story, because a mark's x *is* its claimed instant — there is no "capped
position" the way there is a "capped magnitude".

### 4.2 The implementation

`clipPlotsToDomain(plots, domainStartMs, domainEndMs)` filters every series' `points` to
`p.tMs >= domainStartMs && p.tMs <= domainEndMs`, applied **once**, at the top of
`StackedTimeSeriesChart`, before either the `view === 'chart'` or `view === 'table'` branch —
so the two views cannot disagree about which points exist. This closes the gap Q2's own table
view had that was never named as F9's problem but was real: `tableRowsFor`'s sample rows were
built straight from `plot.series[].points` with no domain filter at all (only its **gap rows**
were filtered against the domain), so an out-of-domain reading used to show up in the table
even though F9 was scoped to the chart's hover layer.

`xFor`'s own clamp is unchanged and still load-bearing — the gap-hatch rectangle logic
legitimately needs to clamp a *partial* overlap at the domain edge, which is a different,
correct use of clamping than pegging a whole point. The `hoverColumnsFor` zero-width filter
also stays, now explicitly documented as a second line of defence for a code path the public
component can no longer reach (see §4.3).

### 4.3 What this retired, and why

`Q2-H10` (the mutation that broke the zero-width hover-column filter) is now unreachable
through the public component: the only way to construct two out-of-domain instants that
collapse onto the same rail was clamping, which no longer happens before `hoverColumnsFor` runs.
Mutating that filter line no longer reddens any test — `regressions.py`'s own rule is that a
mutation returning `exit=0` ("DID NOT BITE") fails the harness, so leaving `Q2-H10` in place
would make the harness permanently red for a reason unrelated to a real defect. It is retired
with a comment explaining exactly this (matching the project's own standard: "if the property
has no plausible wrong implementation, drop it"), and replaced by two new `10c-F9-*` mutations
that target `clipPlotsToDomain` itself — the actual fix.

### 4.4 Tests and mutations

4 new tests in `components/stacked-time-series-chart.test.tsx`: the polyline carries only the
in-domain points; the hover layer has no column (and no tooltip) for a dropped instant; the
table has no sample row for one either; and a fully-in-domain series behaves exactly as before
(no regression). One pre-existing test (`⚠ a hover column that collapses to zero width…`) was
rewritten rather than deleted — its fixture is unchanged, but its expectation now asserts the
**corrected** behaviour (one surviving hover zone, not two collapsed-then-filtered ones), since
the scenario it built no longer produces the bug it used to demonstrate.

**Files:** `components/stacked-time-series-chart.tsx`, `components/stacked-time-series-chart.test.tsx`,
`pipeline/steps/09-ui-primitives/regressions.py`.

---

## 5. 10a-F4's remaining half — the seven breakpoint measurements, run headlessly and repeatably

### 5.1 Why `resize_window` was replaced, not re-tried

10c-1 measured five of seven by hand in a real, interactively-driven Chrome, but `resize_window`
could not set the viewport — `window.innerWidth` read a constant 3440 across every call. That
tool resizes the **OS window**; on this setup that mechanism does not reach the page's actual
CSS viewport at all. Retrying the same tool would be re-diagnosing a documented limitation the
handoff explicitly says to replace instead.

### 5.2 What was built, and the dependency decision (invariant 6)

`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` — a standalone Node script, **not**
wired into `pnpm verify** or any vitest harness. It:

1. Generates an ephemeral password + `PASSWORD_HASH` (via the real `scripts/hash-password.py`,
   never a reimplementation) and a random `SESSION_SECRET`, passed as environment variables to
   a spawned `next dev` — never written to disk, no `.env` file.
2. Launches the **system's already-installed Google Chrome** (`/Applications/Google Chrome.app/…`)
   via `playwright-core`'s `executablePath` option — headless, over CDP.
3. Logs in through the real `/login` form (not a reimplemented POST body).
4. Sets the viewport to each of the seven checkpoints with `page.setViewportSize()` — CDP's
   `Emulation.setDeviceMetricsOverride` under the hood, a genuinely different mechanism from an
   OS window resize, which is *why* it does not inherit `resize_window`'s failure mode.
5. Reads `getBoundingClientRect()` (COOLING's span, the priority order's y-positions) and
   `getComputedStyle()` (`grid-template-columns`' track count, the `display` of the sparkline
   vs. promoted-chart wrapper) — paint-tier facts only (see §6).

**The dependency: `playwright-core`, not `playwright`.** `playwright` bundles a Chromium
download (~300 MB); `playwright-core` ships no browser at all and expects `executablePath`,
which this script supplies. Nothing is downloaded.

**Verified, not asserted, per invariant 6 — the same method 10a used for jsdom:**

```
pnpm build
grep -rl playwright .next/standalone   # 3 hits — all inside next's OWN shipped files
                                        # (server-external-packages.jsonc, next-test.js),
                                        # listing "playwright"/"playwright-core" as names
                                        # Next itself recognises for `next test` scaffolding.
                                        # No playwright-core PACKAGE directory anywhere in
                                        # .next/standalone (confirmed with `find -type d`).
grep -rl playwright .next/static       # no matches
```

`playwright-core` is imported by nothing under `app/`, `lib/`, `components/` or `proxy.ts` — only
by this script, which `next build`'s tracer never walks — so it costs the production image
**nothing**, the same conclusion 10a reached for jsdom.

**What it costs, honestly:** it is a macOS-only script as written (`CHROME_CANDIDATES` hardcodes
`/Applications/Google Chrome.app` and `/Applications/Chromium.app`), it needs Chrome physically
installed on whatever machine runs it, and it is **not** part of `pnpm verify` — running it is a
separate, explicit, slower step (`node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`),
deliberately, so the project's one deterministic command never depends on a real browser being
present. This matches 10c-1's own §3.3 recommendation for exactly this: "separate, given the
never-two-harnesses-at-once rule and the browser runtime's own startup cost."

A real mistake this build made and fixed while getting there: the first version spawned
`next dev` via `spawn('pnpm', ['exec', 'next', 'dev', …])` without `detached: true`, and
`server.kill()` only ever reached the `pnpm` wrapper process, leaving the actual `next dev`
(and port 39173) running after a "successful" exit — caught by checking `ps`/`lsof` after each
run rather than trusting the exit code. Fixed with `detached: true` + `process.kill(-pid, …)`
to signal the whole process group; verified clean on the next run.

### 5.3 The measured results

Run four times total against this dev Mac (once with a diagnostic added mid-way, once fixing an
unrelated random-password generation bug, twice as a final confirmation) — same result every
time:

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

**Measurements 1–6, the exact ones 10c-1 could not pin, are now closed — pinned to real,
repeatable pixel/CSS assertions on a real browser, not by eye.** This directly closes the "1–4
and 6" gap the handoff named.

**Measurement 7 is environment-blocked, confirmed by evidence rather than assumed.** The
diagnostic added mid-loop shows exactly why: GPU 0's slot has **zero** `<svg>` elements, and its
text content is literally `"no GPUs enumerated … nvidia-smi: ENOENT"` — this Mac has no NVIDIA
driver at all (expected and correct per `CLAUDE.md`/`ANCHOR.md`: "there is no compute GPU" on
development hardware). `GpuPanel`'s `snapshot.gpus === null` takeover branch is *working
correctly* here; it simply has nothing to promote. This is the same environment limitation
10c1-build.md independently noted for the force-alarm escape hatch ("needs a machine where
`gpus` is actually an array") — not a new finding, but now nailed down with a concrete DOM
dump rather than inferred. Closing measurement 7 for real needs either the actual `ai-server`
box (read-only, no browser, out of scope) or extending `force-alarm.ts` to fabricate a whole
`gpus` array rather than mutate an existing entry — recorded for whoever next touches that file,
not attempted here since it is a behavioural change to production-adjacent code, not a
measurement-tooling one.

**Files:** `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` (new), `package.json` /
`pnpm-lock.yaml` (the one new devDependency).

---

## 6. 10c1-A9-paint — the browser step is scoped to paint only, by construction

HANDOVER §0.6's three-tier table: **binding** (which element carries which class — provable in
jsdom today, via the CSS-module Proxy) and **reference** (a `styles.X` naming a real rule — a
static check, 10c-2's dangling-class audit) both need no browser. Only **paint** (cascade,
media queries, the ≥1600px `display:none` promotion, layout/positioning) does.

`measure-breakpoints.mjs` reads exactly two kinds of fact from the real browser:
`getBoundingClientRect()` (where something actually painted) and `getComputedStyle()`'s
`display`/`gridTemplateColumns` (what actually rendered, post-cascade, post-media-query). It
never asserts which CSS class an element carries, and never checks whether a `styles.X`
reference resolves to a real rule — both of those questions are answered elsewhere already.
Nothing needed to change to satisfy this; it is recorded here because the handoff asked for the
browser step's scope to be stated explicitly, not left implicit.

---

## 7. The banner-item wrapping question — invariant 7, recorded for the owner

**Confirmed: `SPEC.md` §6.4 says nothing about whether one alarm condition's own text may wrap
across a line break.** It specifies the banner's content (condition, value, elapsed "since"),
the collapsing-into-one-with-a-count rule, and the debounce — never the CSS behaviour of an
individual item's text when the viewport is narrow.

**Current state, unchanged this loop:** `alarm-banner.tsx`'s per-condition `<span>` in `.rest`
carries no class at all (`10c1-A8`'s fix, after removing a dangling `styles.item` reference that
named a rule that never existed). The only wrapping behaviour on screen comes from `.rest`
itself (`flex-wrap: wrap; gap: .4em 1em`), which wraps **between** items — nothing stops the
browser's default inline wrapping from *also* breaking a single item's own text (e.g. its label
separating from its value, or from its `since`/`age` sub-spans) if that one item's content does
not fit on one line. 10c-1 recorded this as working "on `.rest`'s gap by luck, not design", and
declined to add a rule rather than invent one; this loop reached the same conclusion by the same
reasoning and made no change.

**Not chosen, and why it should not be:** adding `white-space: nowrap` to the item span would
force it to overflow instead of wrap, which risks clipping or a horizontal scrollbar on a narrow
viewport (the same <900px band where the banner is arguably most likely to have several
conditions active). Leaving it to wrap freely risks a label reading as separated from its own
value across a line break, in the one component whose entire job is an unambiguous, at-a-glance
alarm. Both are real UX trade-offs a spec author should make, not a build phase inferring intent
from silence.

**For the owner:** SPEC.md §6.4 should either explicitly permit an item to wrap mid-condition
(in which case the current behaviour is already correct, just undocumented) or forbid it (in
which case `.item { white-space: nowrap }` — or a `min-width` — is the fix, and someone should
also decide what happens to an item too long for the narrowest supported width). No code
changed for this item.

---

## 8. What step 10 leaves behind, for step 11 (packaging)

This is step 10's last loop. What the nine panels and the shell now assume, and what step 11
should know before writing `dashboard.sh`/the Dockerfile:

1. **A new devDependency, `playwright-core`, verified NOT to reach `.next/standalone`** (§5.2).
   Step 11's image build (`pnpm install` + `next build` inside the image, or an install-then-copy
   multi-stage) does not need Chrome, Playwright, or any browser present — nothing in `app/`,
   `lib/`, `components/` or `proxy.ts` imports it. If step 11's Dockerfile ever runs
   `pnpm install --prod` for the final stage, this devDependency is excluded automatically; if it
   runs a full `pnpm install`, it is still inert (no browser binary is downloaded by
   `playwright-core` itself).
2. **`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` is dev-machine tooling, not
   part of the shipped product and not part of `pnpm verify`.** It is macOS-specific
   (hardcoded Chrome path) and needs a real Chrome install; it is not something step 11's image
   or step 12's deployment should ever invoke. It exists to be re-run by hand when the grid's
   breakpoints change.
3. **`CHART_SIZE` (`components/grid.tsx`) is the one place a future panel gets a chart's pixel
   box from.** A tenth panel or a redesigned chart should add a named export there, never a
   literal at the call site — this loop's own L9 fix was closing exactly that drift.
4. **`Sparkline` now takes an optional `gaps` prop**; every current caller (GPU 0, GPU 1, CPU
   ×2) supplies it via `gaps={state.gaps}`. A future sparkline-backed chart that omits it will
   still render (default `[]`, byte-identical to pre-10c-3 behaviour) but will silently
   reintroduce the F14b failure for its own trace — ~~worth a code-review habit, not a guard, since
   the prop is optional by design~~. ⚠ **OVERRULED by the reconciliation (A6):** the adversarial
   measured that deleting the prop from both CPU call sites leaves **2801/2801 green** with both
   harnesses silent. It is now a behavioural fixture in `cpu-panel.test.tsx` and
   `gpu-panel.test.tsx` plus mutations `10c-P1`/`P2`/`P3`, one per production call site — the same
   answer L11 got in 10c-2 for the same shape of gap.
5. **`StackedTimeSeriesChart` now enforces its own domain precondition** (`clipPlotsToDomain`,
   Q2-F9). A future caller no longer needs to guarantee every point it passes falls inside
   `[domainStartMs, domainEndMs]` — the primitive defends itself — but should not rely on this
   as a substitute for actually windowing its own data; the caller-computed domain is still what
   the chart is titled and scaled against, per `chartDomainOf`.
6. **`--table-scroll-max: 40vh` remains a stopgap**, now with a recorded, verified reason it
   cannot yet become `max-height: 100%`. Whoever next gives the grid a genuine bounded height (a
   larger layout decision than step 10's scope, see §2) should flip this one token.
7. ⚠ **CLOSED by the reconciliation (A2) — measurements 7 AND 8 now pass in a real browser.**
   The lever was cheaper than this section proposes: `measure-breakpoints.mjs` intercepts the
   `/api/telemetry` RESPONSE in the measuring browser and substitutes a fabricated `gpus` array,
   so no production code learns a new behaviour and nothing new ships. The 1280–1599px side of
   the same media query — never observed either, and not among the seven — is now measurement 8.
   The paragraph below is kept as written:

7. **Measurement 7 (the ≥1600px sparkline→chart promotion) has never been confirmed end-to-end
   against real GPU data.** It is confirmed correct in every other way (source-text guard,
   `getComputedStyle` structure, and now 6/7 real-browser measurements) but the actual visual
   promotion needs either the real `ai-server` box (no browser, read-only, out of scope) or a
   `force-alarm.ts`-style fixture that fabricates a whole `gpus` array rather than mutating one.
   Neither exists yet; recorded for whoever next needs it.
8. **The banner-item wrapping question is open for the owner** (§7) — no code depends on its
   answer either way today.
9. Every other step-10 obligation this loop's handoff named as closed (L9, 2.5f's verification,
   10b-F14b, Q2-F9, 10a-F4's remaining half, 10c1-A9-paint's scoping) is closed as described
   above. **`10a-F17` was never in this loop's scope** — it was fixed and committed at `3c37107`
   before 10b landed, per the parent's 2026-09-09 correction, and nothing here touches it.

---

## 9. Verification

```
$ pnpm verify
 Test Files  99 passed (99)
      Tests  2788 passed (2788)
Type Errors  no errors
```

```
$ python3 pipeline/steps/09-ui-primitives/regressions.py
Red-test ledger: … distinct failing tests across 101 mutations; … ⚠-marked tests checked.
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
?? pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
```

No stranded mutation from either harness (`git status` checked after each run). `.next/` was
removed after the `pnpm build` used to verify `playwright-core`'s absence. `next-env.d.ts`,
auto-regenerated by the two `next dev` sessions this loop's browser step spawned, was reverted
each time (`git checkout -- next-env.d.ts`) — it is `next dev`'s own generated file, not this
loop's work. No `.env` file was ever written; both `next dev` sessions received their
credentials as process environment variables only, and both server processes (and their real
process groups, after the `detached: true` fix) were confirmed torn down (`ps`/`lsof` checked,
not merely the exit code) before this document was written.
