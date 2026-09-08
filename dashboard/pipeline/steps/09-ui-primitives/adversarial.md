# Step 9 — ADVERSARIAL

**Baseline confirmed before and after:** `pnpm verify` → 66 files, 2137 tests, `Type Errors no
errors`, exit 0. `git status --short` empty. Two scratch probe files were created, run, and
deleted; nothing under `components/`, `lib/`, `app/` or the harness was edited.

**Method.** Every finding below with a `[measured]` tag was produced by rendering the real
component through `renderToStaticMarkup` in a throwaway test file and reading the emitted SVG
attributes. The palette claim was re-validated by running the skill's own script. Findings
marked `[read]` are read off the source or the CSS cascade, and are labelled so, because they
are a weaker class of evidence than a measurement.

---

## HIGH

### H1 — every chart announces itself to a screen reader as the COOLING chart `[measured]`

`stacked-time-series-chart.tsx:189` hard-codes

```
aria-label="cooling: temperature and fan speed over the selected window"
```

with no prop to override it. The module's own docstring (lines 3–8) says the component is
deliberately generic *because* §6.1's ≥1600 px "sparklines promoted to full line charts inside
the GPU cards" is a single-plot use of exactly this component.

**Scenario.** Step 10 renders the GPU 0 card's promoted temperature chart. A screen-reader user
on the laptop that §6.2 says is opened "exactly when something is wrong" hears *"cooling:
temperature and fan speed over the selected window"* while looking at GPU 0's temperature.
With two GPU cards plus COOLING on screen, three charts announce the same wrong sentence.

**Evidence.** Probe P1 — a one-plot, one-series temperature chart:
`P1 aria: cooling: temperature and fan speed over the selected window`.

**Breaks.** §6.2's own justification for the table view ("what makes a chart's content
reachable when colour, size or vision make the marks unreadable"); the component docstring's
claim that one primitive serves both callers. No test asserts the aria-label at all, so nothing
in the 2137 would notice.

---

### H2 — the chart's docstring asserts a §6.2 position that §6.2 explicitly disowns `[measured]`

`stacked-time-series-chart.tsx:33-39`:

> *"No hover, no crosshair, no tooltip, and no table-view toggle. Both are dataviz defaults
> **this project deliberately does not add** — see the step notes: §6.2 lists this as a
> single-screen wall panel with an exhaustive, hover-free control set, and inventing
> interactive chrome the spec does not ask for is exactly what the handoff tells step 9 not to
> do."*

`SPEC.md` as committed at HEAD says the opposite, in a paragraph written to pre-empt that exact
reasoning. Verified with `git show HEAD:dashboard/SPEC.md | grep -n` — it is in the committed
spec, not a working-tree edit:

- **line 953:** *"**⚠ Charts carry a hover layer and a table view, and both are DEFAULTS rather
  than requests.** … Earlier drafts of this section listed exactly four controls and said
  nothing about any of that, **which made the silence read as a prohibition — it was not
  one.**"*
- **line 966:** *"**The table view is an accessibility floor**, not a convenience."*
- **line 970:** *"⚠ They remain outside §6.2's four controls."* — i.e. the "exhaustive control
  set" argument the docstring makes is the argument §6.2 already answered.
- **line 1464 (§9):** *"Chart interaction | **Hover layer and table view are the default**."*

The step-9 handoff §5 ("One place the skill asks for something `SPEC.md` does not mention: the
hover layer") is stale on the same point, and HANDOVER's standing rule is *"where it disagrees
with `SPEC.md`, the spec wins"*.

**Scenario.** Step 10 gets clean context, reads this docstring as the inherited decision, and
ships nine panels with no table view — an accessibility floor the spec names twice. Nothing
re-opens the question, because the code says it was already settled.

**Breaks.** §7 do-not-copy **#11**: *"a documentation claim that names a property the code does
not have"* — here, a property the **spec** does not have, which is the same species and reached
`build.md` three times in step 8. Also the dataviz anti-pattern *"No table view / color-only
encoding on a continuous scale"*.

I am not calling the missing feature itself HIGH — the handoff did tell step 9 not to build it.
The HIGH is the false citation, because that is what will propagate.

---

### H3 — the end dot and its value label are pinned to "now", whatever the data says `[measured]`

`stacked-time-series-chart.tsx:298-306` draws the end dot at `cx={plotWidth}` and the end label
at `plotWidth + 6`, always — the x is never derived from the last readable point's `tMs`. Only
the `y` comes from the data.

**Scenario.** §9: *"A channel lost mid-session — same rule as a failed poll: the trace stops,
the gap is hatched, nothing is drawn to zero."* `nvidia-smi` starts failing at 14:20 on a 30-min
window. At 14:50 the trace occupies the leftmost 1 % of the plot and the rest is hatched — and
a solid coloured dot with the label `69 °C` sits at the far right edge, on the "now" tick. The
chart says the card is at 69 °C right now. It has not been read for half an hour.

**Evidence.** Probe P2 — ten samples over 9 s inside a 30-min domain (`0 … 1_800_000`):

```
P2 last polyline coord: 2.77,0
P2 circle: <circle cx="554" cy="0" r="2.5" ...>
```

The line ends at x = 2.77; the dot is at x = 554. 551 px of separation, and the dot is the only
thing carrying the value label.

**Breaks.** §6.2's *"when polling fails, the page must visibly stop claiming to be live"*, which
is the sentence the whole age indicator exists to satisfy. Also HANDOVER rule 9's premise that
the chart's last point and `latestSample` are the same sample — they are, but the *mark* is not
drawn at that sample. No test asserts `cx`; `chart.test.tsx:224` and `sparkline.test.tsx:80`
both check only `cy`.

---

### H4 — the "structurally impossible to debounce" claim is false: the hook guard misses `useSyncExternalStore` `[measured]`

`components/purity.test.ts:25`:

```js
/\buse(?:State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect|ImperativeHandle)\s*\(/
```

and its docstring: *"the debounce that rule forbids is structurally impossible only because
these components hold no state across renders at all … This proves it directly, over the
primitives' own source text."*

**Measured against the regex:**

| call | matched? |
|---|---|
| `useState(` / `React.useState(` | **true** |
| `useSyncExternalStore(` | **false** |
| `useContext(` | **false** |
| `use(` | **false** |
| `useTransition(` · `useDeferredValue(` · `useOptimistic(` · `useActionState(` · `useId(` · `useDebugValue(` | **false** |

`useSyncExternalStore` is not an exotic miss — it is the hook step 8's runtime is consumed
with, named in HANDOVER §7's client-runtime section.

**Scenario.** A step-10 agent writes inside `chip.tsx`:

```tsx
const { displayed } = useSyncExternalStore(store.subscribe, store.getState, store.getServerSnapshot);
```

and colours the chip from the **debounced** band. That is HANDOVER rule 1 violated in the one
file the harness has a mutation (`PU1`) for. Probe Q6 confirms `useSyncExternalStore` renders
cleanly under `renderToStaticMarkup` with a `getServerSnapshot`
(`<span data-severity="watch">watch</span>`), so every co-located test stays green, the purity
test stays green, and `pnpm verify` stays at exit 0.

`useContext` is the cheaper version of the same attack and is equally unmatched.

**Breaks.** The purity docstring's "proves it directly", and by extension `chip.tsx`'s *"this
file has no way to get it wrong because it never sees a second reading to compare against"* —
with the guard holed, a hook is exactly how it would see one.

**Secondary:** `readdirSync` (line 27) does not recurse, so a `components/panels/*.tsx` in
step 10 is outside the guard entirely — §5.3 note 3's "a guard over a hard-coded file list is
defeated by adding a file", in its directory form.

---

## MEDIUM

### M1 — x is clamped to the plot; y is not, so an out-of-range reading is drawn off-canvas `[measured]`

`xFor` (line 174) clamps to `[0, plotWidth]`. `yFor` (line 224) does not clamp at all, and
`.chart` carries **no `overflow` rule** — so the UA's `svg:not(:root) { overflow: hidden }`
applies. (`.sparkline` sets `overflow: visible` explicitly; the chart's stylesheet does not,
which shows the asymmetry was not deliberate.)

**Scenario.** COOLING's fan plot is declared `yMin: 0, yMax: 5100` — the obvious choice, since
§6.3 names 5100 as the nominal max. The tach then reports **14,451 RPM**, the reading §6.3 calls
*"the early warning for the condition that once hung POST"*. The spike is drawn 201 px above a
110 px plot and is clipped away completely; what remains on screen is two long diagonals leaving
and re-entering the top edge with no apex. The alarm cell goes red and the chart shows nothing.

**Evidence.** Probe Q3, `yMin: 0, yMax: 5100`, points `4300 → 14451 → 4300`:

```
Q3 polyline: 0,17.25  184.67,-201.69  369.33,17.25      (valid y range is 0..110)
```

No fixture in `stacked-time-series-chart.test.tsx` puts a value outside an explicit `yMin`/`yMax`.

---

### M2 — a flat series invents a ±1 domain in the metric's own unit; a stopped fan draws dead centre `[measured]`

`yDomainOf` line 125: `if (min === max) return [min - 1, max + 1];`

**Scenario.** §6.3: *"`0` RPM … no state this channel can be commanded into produces it"* —
alarm. The hub's reference fan dies, `fan5_input` reads `0` for the whole window.

**Evidence.** Probe P5, six points all `v: 0`, `formatTick` = round + ` RPM`:

```
P5 y ticks:  [108, '-1 RPM']  [71.3, '0 RPM']  [34.7, '0 RPM']  [-2, '1 RPM']
P5 polyline: 0,55  92.3,55  184.7,55  277,55  369.3,55  461.7,55
```

Two consequences, both wrong:

1. The y axis is labelled **`-1 RPM`**. A negative reading is physically impossible for a tach
   and §6.6's posture on negative renderings is explicit for age; nothing licenses one here.
   The label comes from the caller's formatter applied to a value the chart fabricated.
2. The dead fan's line is drawn at **y = 55 of a 110 px plot — the exact vertical centre**,
   which is also where a healthy flat 4,300 RPM would be drawn. The chart cannot distinguish
   a stopped fan from a fan running at spec by its position.

The existing test for this case (`'a flat y-domain (every value equal) does not divide by
zero'`, line 151) asserts only `not.toContain('NaN')` — the weakest property the case has.

---

### M3 — duplicate y-axis tick labels on a narrow domain `[measured]`

`ticksBetween` (line 130) produces evenly spaced *raw* values, and `formatTick` rounds them. The
docstring calls this a "recorded simplification"; the dataviz reference calls it out directly:
*"Y-axis ticks: round to clean numbers."*

**Scenario.** An idle box holds 66 °C across the whole window (GPU temp is an integer; §6.3
records a production mean of 66.2). Auto-domain → `[65, 67]` → four ticks at 65 / 65.667 /
66.333 / 67, integer-formatted.

**Evidence.** Probe P6:

```
P6 y ticks: [108, '65 °C']  [71.3, '66 °C']  [34.7, '66 °C']  [-2, '67 °C']
```

Two different gridlines, 36.7 px apart, both labelled **66 °C**, and neither is actually at 66.
A reader tracing a value against the axis is off by up to 0.33 °C with no way to know.

---

### M4 — end labels are nudged apart and detached from their dots, and overflow into the next plot `[measured]`

`spaceApart` (line 134) moves the **text** down while the **circle** stays at `row.y`
(lines 298 vs 305), and it only ever pushes down — never up, and never against a bound.

The dataviz reference names this exact remedy as the wrong one:

> *"When end-labels collide, don't stack them. … nudging labels apart vertically **detaches them
> from their lines and reads as noise** — instead use leader lines … or fall back to the legend
> + tooltip."*

**Scenario A (two series, ordinary).** GPU 0 and GPU 1 both read 66 °C at idle. Both dots land
at the same y; GPU 1's label is pushed 12 px below it. The reader has two dots at one height and
two labels at two heights, with nothing connecting them — the label is now beside GPU 0's dot.

**Scenario B (three series).** Probe P3, `yMin: 0, yMax: 100`, three series all flat at 1,
two plots:

```
P3 circles:        93.06, 93.06, 93.06          (chartHeight = 94)
P3 endLabel texts: y=93.06 'A 1'   y=105.06 'B 1'   y=117.06 'C 1'
```

Label C is 23 px **below its own plot's floor**. In absolute chart coordinates that is y ≈ 133,
and plot 1's legend band occupies 120–136 — so `C 1` is drawn **on top of the next plot's
legend**. There is no clamp and no collision check against the plot box.

---

### M5 — clipped axis labels: the top y-tick and the leftmost time tick `[measured]`

`.chart` has no `overflow` rule → UA `svg:not(:root) { overflow: hidden }`. Anti-pattern: *"A
label clipped by, or overflowing … `overflow: hidden` cropping the first/last characters."*

**(a) The top y-tick label, at `y = -2`.** Y-tick text is drawn at `y={y - 2}` (line 271). The
top tick has `y = 0`, so its baseline is at −2 and the whole 9 px glyph sits above the viewBox.

Probe P1, a **single-series** plot (`legendNeeded` false → `chartTop = 0`):

```
P1 tick texts: ['108','60 C'] ['71.33','61 C'] ['34.67','63 C'] ['-2','64 C']
```

The maximum of the scale — the number a temperature chart is read for — is invisible. That is
the ≥1600 px promoted GPU-card chart, and it is the second plot of the COOLING stack too: the
fan plot has one series, so its top label (`5,100 RPM`) lands at absolute y = 118, inside the
10 px `PLOT_GAP` rather than on its own gridline at y = 120.

The two-series temperature plot escapes this only by accident: its legend pushes `chartTop` to
16, so `16 − 2 = 14` is on-canvas. Remove GPU 1 (one card installed — the state `CLAUDE.md`
records) and the top label disappears.

**(b) The leftmost time tick.** Probe P4:

```
<text x="0" y="14" text-anchor="middle">14:17:31</text>
```

`text-anchor="middle"` at x = 0: an 8-character 9 px monospace string is ~43 px wide, so ~21 px
hangs left of the viewBox and is cropped. The window's start time renders as `7:31` or less.
The rightmost tick survives only because `END_LABEL_MARGIN` happens to leave 46 px.

---

### M6 — the sparkline draws a flat series along its bottom edge `[measured]`

`sparkline.tsx:97`: `const span = max - min === 0 ? 1 : max - min;` then
`yFor(v) = height - ((v - min) / span) * height`. For a flat series `v - min = 0`, so **every
point lands at `y = height`** — the floor.

**Evidence.** Probe P7, six points all `v: 66`, default 96×24:

```
points="0,24 19.2,24 38.4,24 57.6,24 76.8,24 96,24"   circle cx="96" cy="24"
```

**Scenario.** A GPU idling at a constant 66 °C. The sparkline behind the dominant temperature
figure shows a line pinned to the bottom of its box — the position that in every other frame of
the same trace means *coldest reading in the window*. The identical input in
`StackedTimeSeriesChart` renders mid-plot (`[65, 67]`). Two primitives, same data, opposite
reading; the sparkline's is the misleading one.

The existing test (`'a flat series (every value equal) does not divide by a zero span'`, line
34) asserts only `not.toContain('NaN')`.

Secondary: the end dot at `cx = width, cy = height` and the 1.5 px stroke both sit half outside
the box. `.sparkline` sets `overflow: visible`, so instead of being clipped they bleed onto
whatever is laid out beneath.

---

### M7 — the `errors[]` note never gets its own line, and forces the row to overflow the panel `[read]`

`row.module.css`: `.row { display: flex; … }` with **no `flex-wrap`** (grepped: `flex-wrap`
appears nowhere under `components/` or `app/`), and `.note { flex-basis: 100%; }`.

`flex-basis: 100%` only wraps an item onto its own line in a `wrap` container. In the default
`nowrap` container it merely gives the note a huge hypothetical size, which then shrinks against
its siblings — and every flex item's `min-width: auto` floors it at min-content, so nothing can
shrink below its longest word.

**Scenario.** §6.2: *"Each row carries its `errors[]` explanation beside it, and that is not
decoration."* SAFETY renders

```tsx
<Row label="pwm5 present" value="no" severity="alarm" note="dell-smm: no pwm5 on hwmon dell_smm" />
```

In §6.1's 2×2 small-panel arrangement (900–1279 px) that panel is ~300 px wide. Chip + label +
value + a 34-character monospace note on one non-wrapping line has a min-content width well past
300 px, and neither `.row` nor `.panel` sets `overflow`, so the row spills out of the panel box.
The DKMS entry is worse — §6.5 says it *names the running kernel release*, so it is longer
still.

The CSS comment shows the intent was a wrapped second line; the declaration does not produce
one. `row.test.tsx` asserts only that the note's text is present in the markup, which cannot see
layout.

---

### M8 — a test name over-claims: "drawn out to the domain end" only asserts `width > 0` `[read]`

`stacked-time-series-chart.test.tsx:119`:

```
test('⚠ an OPEN gap (toMs: null) is drawn out to the domain end, not zero-width', …)
  expect(width).toBeGreaterThan(0);
```

An implementation writing `toX = fromX + 1` satisfies the body and contradicts the name. The
name's actual property — that the rect reaches `plotWidth` — is never checked. Mutation `T5`
(`?? gap.fromMs`) reddens it because it collapses to exactly zero, so the ledger is satisfied by
the *weaker* property.

This is §7 do-not-copy **#3** (*"a test that names a property it does not check — eight steps,
eight occurrences"*) and, per §5.2 note 2, the class the ledger structurally cannot catch. The
TEST phase found one; this is a second.

Related, milder: `sparkline.test.tsx:25` `'a single readable point renders without dividing by
zero'` asserts `polylineCount === 1`. It renders a `<polyline>` **element**; see M10 for why
that element draws nothing.

---

### M9 — a gap has no minimum rendered width, so the common gap is invisible `[measured]`

`gaps.map` (line 200) emits `width={toX - fromX}` with no floor, filled with a 6 px hatch
pattern.

**Scenario.** §6.7's window selector offers **2 h**. One failed poll at the 5 s cadence opens a
gap of ~10 s. At `width = 600` (`plotWidth = 554`) that is
`10_000 / 7_200_000 × 554 = 0.77 px` — a sub-pixel slice of a 6 px 45° hatch, which renders as
nothing or as a faint tick indistinguishable from a gridline. At the 30-min default a 10 s gap
is 3.1 px, which is a thin sliver.

**Breaks.** The whole point of §6.5/§9's *"the trace stops, the gap is hatched, nothing is drawn
to zero"* and HANDOVER rule 3. A gap that cannot be seen is the un-hatched line by another name.
Probe Q5 also shows a zero-duration gap is dropped silently (`if (toX <= fromX) return null`),
which is the same failure at its limit. No fixture uses a window longer than 600 s.

---

### M10 — a window holding exactly one reading draws no visible line `[measured]`

`runsOf` emits a run of length 1, which becomes `<polyline points="277,55">`. An SVG polyline
with a single vertex has no geometry and paints nothing.

**Evidence.** Probe Q1 — one point at `tMs = 30_000` in a `0 … 60_000` domain:

```
Q1 polyline: <polyline ... points="277,55">      (nothing is painted)
Q1 circle:   <circle cx="554" cy="55" ...>       (the only visible mark, at the wrong x — H3)
```

**Scenario.** The first poll after a resume, or the first sample of a session, or a channel that
enumerated once and then vanished. The reading exists, `latestSample` has it, and the chart
shows a dot at "now" and nothing where the reading actually is. `sparkline.tsx` has the same
shape but its end dot *is* at the point's own x, so the sparkline degrades better than the
chart.

---

## LOW

**L1 — an explicit `yMin`/`yMax` is silently discarded when no value is readable `[measured]`.**
`yDomainOf` returns early with `[0, 1]` when `values.length === 0` (line 122), *before* the
`plot.yMin ?? …` lines that would have honoured a partial bound. Probe Q2 — an all-null fan
series — renders a y axis reading `0 RPM · 0 RPM · 1 RPM · 1 RPM`, i.e. a fabricated 0–1 RPM
scale on a chart where nothing was read, with no line. Probe P10 confirms `yMin: 0` alone is
honoured when data exists and ignored when it does not.

**L2 — end dots are below the marker floor.** Both charts use `r={2.5}` (5 px). The dataviz mark
spec is *"Marker / end-dot: >= 8px (r >= 4)"*. `.endDot`/`.end` use `stroke-width: 1` against
the spec's 2 px surface ring.

**L3 — a single-series plot can carry no identifying text at all.** `legendNeeded` is
`series.length >= 2`, and the component renders **no title or subtitle element**. The skill
allows dropping the legend for one series only *"because the chart's title or subtitle already
says what is plotted"* — there is none here. With `endLabel` omitted (a state the suite tests at
line 86 and asserts renders an empty end-labels group), the plot has zero text naming its
series, leaving colour alone — which is the thing §6.3 forbids.

**L4 — duplicate `<defs>` ids are undefended `[measured]`.** The `id` prop's docstring says
*"Uniqueness for this instance's `<defs>` — several charts may render on one page"*, but nothing
checks it. Probe Q7 renders two charts with `id="cooling"` and produces two
`<pattern id="c-hatch">` elements; the second chart's `url(#c-hatch)` resolves to the first
chart's node. Harmless today (identical patterns), latent if the pattern ever varies.

**L5 — `Chip` conflates "no band" with "no reading".** `severity === null` renders `EM_DASH` and
the assistive word **`no reading`** (chip.tsx:59-60). §6.3 has readings that exist and carry no
severity — `/health: null` is *"not probed this cycle"*, `ch5Mode: null` renders **`unavailable`,
not `—`** per §6.6, and invariant 3 says *"`EC auto` and `unavailable` are not severities"*. A
`Row` with `value="unavailable"` and `severity={null}` therefore shows an em dash and announces
"no reading" beside a value that is a reading.

**L6 — `PanelShell`'s `data-severity` on `<section>` styles nothing.** `panel-shell.module.css`
has no `.panel[data-severity=…]` rule, so the attribute mutation `PS3` guards is inert at
render. Fine as a contract for step 10; worth knowing it is not currently a visual channel.

**L7 — `Meter`'s `role="img"` + `aria-label` duplicates its own visible head text**, so a screen
reader hears the label and value twice.

**L8 — legend entries sit at a fixed 90 px pitch `[measured]`**, independent of label length and
of `width`. Probe P8 at `width={320}` with labels `GPU 0 temperature` / `GPU 1 temperature` /
`fan 5 RPM`: entry 1's text starts at x = 20 and is ~92 px wide at 9 px monospace, while entry 2
starts at x = 90 — overlapping text. §9's own short labels (`GPU 0`, `fan 5`) fit; anything past
~12 characters does not.

**L9 — the SVGs are fixed-size.** Both emit literal `width`/`height` attributes with
`display: block` and no `width="100%"` / `preserveAspectRatio` option, so a chart does not scale
across §6.1's four breakpoints. A 600 px chart in the <900 px single column overflows its panel.

**L10 — `SERIES_STYLES.dashed` has no consumer in `Sparkline`,** which accepts `color` only. The
palette module exports a dash flag one of the two chart primitives cannot express.

**L11 — rule 7's unit-name half has no guard.** `productionFiles()` walks the tree, so
`/api/telemetry`, `/login` and `/api/session` are guarded inside `components/` automatically —
but there is no equivalent test for `llama-server` or `gpu-fan-control.service`. Step 9
introduced the first `llama-server` literal outside `lib/` (`panel-shell.test.tsx:74`, as a
subtitle fixture). A test file, so not a breach; noted because step 10 writes the real subtitles.

---

## What I attacked and could NOT break

This is the half reviewers skip, so it is explicit.

- **§6.3's boundary rule (90 % VRAM is normal, RAM 85, disk-free 15).** There is nothing to
  break: no primitive bands anything. `Severity` arrives as a prop in all five components that
  take one, and no component compares, holds or derives a band. HANDOVER rule 11 is honoured
  structurally, not by convention.
- **§6.6's "never format a number yourself".** `grep -rn "toFixed\|toLocaleString\|Intl\.\|String("
  components/*.tsx` returns **one** hit, and it is inside a comment saying the file does none of
  it. Every numeral on screen is a caller-supplied string; `Meter` takes `formattedValue`
  separately from the numbers it uses for geometry; the chart takes `formatTick`, `formatTime`
  and `endLabel`. I could not find a path where a component produces a digit.
- **HANDOVER rule 3 (gaps from `state.gaps`, never inferred).** `gaps` and `series.points` are
  genuinely independent inputs and the component never cross-references them, in either
  direction. Mutations `T4` and `T10` cover both directions and both bite. I could not construct
  an input where a hole produced a rect or a gap failed to.
- **HANDOVER rule 10 (600 per series, not per chart).** Measured: two 600-point series in one
  plot emit two polylines of exactly 600 coordinate pairs each. No internal budget, no
  re-decimation.
- **"Never a dual y-axis" — the structural claim holds as literally stated.** `ChartPlot` carries
  exactly one `formatTick`/`yMin`/`yMax`; there is no member to hang a second scale on; and the
  x-axis renders exactly once for N plots (measured — one `data-role="x-axis"` for two plots).
  The residual hazard is different and smaller: a caller can put two incommensurable series into
  **one** plot and get a single squashed shared scale. That is not a dual axis, and I could not
  turn it into one.
- **Invariant 1 at the geometry level.** `p.v === null || !Number.isFinite(p.v)` keeps `0` and
  `-0` inside a run in both primitives; `SP4` and `T12` bite on a falsy check. `Meter`'s
  `used === null` vs `used === 0` distinction survives every input I tried.
- **Degenerate inputs never produce `NaN` or `Infinity`.** Zero points, all-null points, a single
  point, `plots: []`, `series: []`, `domainEnd === domainStart`, `total: 0`, `total: null`,
  `used > total` — I could not get either string into the markup in any probe.
- **Gap clamping at the window edges.** A gap spanning from before `domainStartMs` to after
  `domainEndMs` clamps correctly to the full `[0, plotWidth]`; gaps entirely outside collapse and
  are dropped. Correct — though untested by any fixture.
- **The §9 palette.** Re-ran the skill's own validator to confirm rather than re-choose:

  ```
  $ node scripts/validate_palette.js "#3987e5,#199e70,#d95926" --mode dark --surface "#1a1a19"
    [PASS] Lightness band       all 3 inside L 0.48–0.67
    [PASS] Chroma floor         all 3 >= 0.1
    [PASS] CVD separation       worst adjacent #d95926↔#199e70 ΔE 9.4 (deutan) · tritan 4.0
    [PASS] Normal-vision floor  worst adjacent #199e70↔#3987e5 ΔE 20.9 (normal)
    [PASS] Contrast vs surface  all 3 >= 3:1
    → ALL CHECKS PASS
  ```

  ΔE 9.4 matches §9's recorded number exactly. `#1a1a19` is also the skill's own dark surface, so
  the surface `tokens.css` paints and the surface the number was validated against agree. The
  three status tokens (`#0ca30c` / `#fab219` / `#d03b3b`) are verbatim from `references/palette.md`'s
  dark column, as `tokens.css` claims. **No drift, and the "only three of the skill's four status
  steps" note is accurate.** (Tritan separation is 4.0, which the validator does not gate; §9's
  dash + direct label is the secondary encoding that covers it.)
- **Route spellings inside `components/`.** `sourceFiles()`/`productionFiles()` walk the whole
  project root, so step 9's new directory is inside the step-7/8 guards automatically — adding a
  directory did not escape them.
- **The `SparklinePoint` / `SeriesPoint` structural-typing claim.** `SeriesPoint` really is
  `{ readonly tMs: number; readonly v: number | null }`; `traceFor`'s output assigns to
  `SparklinePoint[]` with no import and no cast, exactly as the docstring says.
- **Fixture symmetry (§5.1) on the four boundaries the harness names.** `used > total`
  (M1/M1b), `total <= 0` (fixtures at 0 and 232.6), `series.length >= 2` (T3a/T3b), and
  `domainEndMs <= domainStartMs` (T6 plus an equal-bounds fixture) all have both sides present.
  The harness's claim on this is accurate.
- **Mutation-id uniqueness and the ledger machinery.** `_assert_unique_ids` runs at import; the
  ledger block matches step 8's verbatim apart from `LEDGER_FILES`. Nothing wrong found in the
  harness itself other than what H4 and M8 say about what it can see.

---

## Notes on classification

- H1, H3, M1, M2, M3, M4, M5, M6, M9, M10, L1, L4, L8 were each reproduced by rendering the real
  component and reading the emitted attributes.
- H2 was verified against the committed spec (`git show HEAD:dashboard/SPEC.md`), not the working
  tree, so it is not an artefact of an uncommitted edit.
- H4 was verified by evaluating the guard's own regex against each hook name and by confirming
  the bypass renders under `renderToStaticMarkup`.
- M7 and M8 are read off the source/CSS cascade rather than measured, and are labelled `[read]`.
  M7 in particular deserves a browser check before anyone acts on it — the mechanism is certain,
  the pixel outcome at a given panel width is not.

**Nothing was fixed, refactored, or committed.** `git status --short` is empty; `pnpm verify`
exits 0 at 66 files / 2137 tests.
