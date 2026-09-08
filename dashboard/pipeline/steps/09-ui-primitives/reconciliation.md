# Step 9 — RECONCILIATION

**Adjudicating `adversarial.md`'s 25 findings.** Every one is dispositioned below with a
reason; a rejection carries an argument, not a shrug.

| | count |
|---|---|
| **ACCEPTED** (fixed, with a test, and — where the test is ⚠ — a mutation) | **20** |
| **REJECTED** (with the argument, in writing) | **3** — L2, L4, L10 |
| **DEFERRED** (real, but owned by step 10; recorded, not built) | **2** — L9, L11 |

**Evidence, all three gates, run one at a time and never concurrently:**

```
$ pnpm verify            → Test Files 67 passed (67) · Tests 2210 passed (2210)
                           Type Errors  no errors                      exit 0
$ pnpm build             → ✓ Compiled · Running TypeScript … Finished  exit 0
$ python3 pipeline/steps/09-ui-primitives/regressions.py
                           All 61 regressions failed their check, as they must.
                           Red-test ledger: 89 distinct failing tests across 61 mutations;
                           67 ⚠-marked tests checked.
                           Every ⚠-marked test went red under at least one mutation.   exit 0
```

Baseline before any edit: 66 files / 2137 tests / exit 0. Step 9's harness held 34 mutations;
it now holds 61. No file under `lib/`, `app/`, `SPEC.md`, `MOCK.html` or `PLAN.md` was touched,
nothing was committed, the branch is still `dashboard-frontend`, and the box was not contacted.

---

## HIGH — all four confirmed by the owner, all four fixed

### H1 — every chart announced itself as the COOLING chart · **ACCEPTED**

`ariaLabel` is now a **required prop**, used for the real chart and for the empty state. Not
defaulted: a default is exactly how the wrong sentence reaches §6.1's ≥1600 px per-GPU-card
charts, and with two GPU cards plus COOLING on one screen a default announces two of three
charts wrongly. The build's docstring already said the component is generic *because* of that
caller, so the hard-coded label contradicted the file it was in.

Tests: `⚠ the aria-label is the caller's, with no built-in "cooling" sentence anywhere` and
`⚠ the empty state names the same chart…`. Mutation **`T13`** restores both hard-coded strings.

### H2 — the docstring cited a §6.2 position §6.2 explicitly disowns · **ACCEPTED**

Corrected in two places, and the correction is the whole fix — the *features* are not step 9's.

- `stacked-time-series-chart.tsx`'s "What this is NOT" section is now **"What this is NOT —
  and what it still OWES"**: it quotes §6.2's amendment (*"made the silence read as a
  prohibition — **it was not one**"*), §6.2's *"the table view is an accessibility floor"*, and
  §9's *"Hover layer and table view are the default"*, states that the absent hover layer and
  table view are a **gap and not a decision**, and points here.
- `pipeline/handoffs/step-09-ui-primitives.md` §5's bullet is **struck through** and followed by
  a dated SUPERSEDED note. The handoff was right when written and wrong the moment §6.2 was
  amended; HANDOVER's rule is that the spec wins, so the stale sentence had to stop reading as
  an instruction to step 10.

This was do-not-copy #11 (*a documentation claim naming a property the code does not have* —
here, a property the **spec** does not have) and it would have been inherited as settled.

### H3 — the end dot and its label were pinned to "now" · **ACCEPTED**

`endRows` now carries `x: xFor(lastPoint.tMs)`; the dot, its leader and its value label all sit
there. Measured before the fix: a trace of ten samples over 9 s inside a 30-minute window
ended its polyline at x = 2.77 and drew the dot at x = 554 — 551 px away, on the "now" tick,
carrying the only value label on the plot. That is the page claiming to be live at the moment
§6.2's age indicator exists to stop it doing so.

Tests: `⚠ a trace that stopped early puts its dot at that point's x…` (asserts the dot equals
the polyline's last coordinate **and** that the label travelled with it) and the other side,
`⚠ a trace that runs to the window's end still ends at the right edge`. Mutations **`T14`**
(pinned right) and **`T14b`** (pinned left) — both sides of the same mistake.

### H4 — the "structurally impossible to debounce" claim was false · **ACCEPTED, and inverted**

The guard is now `/\buse(?:[A-Z]\w*)?\s*\(/` — the **shape** React's own naming rule mandates,
not a list of eight names. Your reading is the one adopted: a blocklist is defeated by any
name not on it, including hooks React has not shipped; `useSyncExternalStore` (the hook step
8's runtime is consumed with), `useContext`, `use`, `useTransition`, `useDeferredValue`,
`useOptimistic` and `useActionState` all walked past the old pattern, so a component could have
coloured itself from the **debounced** band and stayed green through all 2137 tests. This is
§5.3 note 3 one level down: a guard over a hard-coded *name* list is defeated by adding a name.

The `readdirSync` half is fixed too — the walk recurses, so step 10's `components/panels/` is
covered on the day it is created rather than silently exempt.

Both halves are tested from **both** sides: sixteen hook spellings that must match, seven
non-hook lines that must not (`pause`, `misuse`, `userAgent`, `because(` — the strings that
would make a too-greedy pattern fail the whole directory), and two temp-directory fixtures for
the walk. Mutations **`PU2`** (`useSyncExternalStore` in `chip.tsx` — the attack, verbatim),
**`PU3`** (the walk stops at the top level) and **`PU4`** (the pattern reverts to the eight
names). The docstring no longer says "structurally impossible"; it says what is actually true.

---

## MEDIUM

### M1 — y was unclamped with no `overflow: visible` · **ACCEPTED**

Reproduced: `yMin: 0, yMax: 5100` with a 14,451 RPM sample drew `184.67,-201.69` in a 110 px
plot, and `.chart` sets no `overflow`, so the UA's `svg:not(:root) { overflow: hidden }` cropped
the apex entirely. §6.3 calls that reading *"the early warning for the condition that once hung
POST"*.

`yFor` now clamps to `[0, chartHeight]`, exactly as `xFor` already clamped to `[0, plotWidth]`.
**Clamped rather than made visible, and rather than auto-expanding the domain:** the plots are
stacked, so an overflowing mark paints across its neighbour, and silently overriding a caller's
explicit scale is a different lie. A pegged trace at the top rail is legible as "at or above the
top of scale", and the end label and the alarm cell carry the number.

Tests: above `yMax`, below `yMin`, and an in-range reading proving the clamp changed nothing
else. Mutation **`T15`**.

### M2 — a flat series fabricated a `[min−1, max+1]` domain · **ACCEPTED**

Reproduced exactly: six samples of `0` RPM produced a `-1 RPM` axis label and drew the dead fan
at y = 55 of a 110 px plot — the same place a healthy flat 4,300 RPM lands.

`yDomainOf` now keeps `0` as the floor when the flat value is non-negative, so a stopped fan
gets `[0, 1]` and draws on the floor — the honest position for the lowest reading a tach can
report, and visibly not where a healthy fan draws. A flat **negative** value keeps its real
domain (a temperature can be below zero; a tach cannot), which is the other side of the branch
and has its own fixture. An ordinary flat 66 °C still centres, so nothing else moved.

Four tests, mutation **`T16`**. The existing test for this case asserted only
`not.toContain('NaN')` — the weakest property it had, as you said.

### M3 — duplicate y-axis tick labels · **ACCEPTED**

Reproduced: a flat 66 °C series produced gridlines at 65.667 and 66.333 **both labelled
`66 C`**, 36.7 px apart, neither at 66.

Ticks are now placed on multiples of a `{1,2,5}×10^k` step, and the step **escalates until every
formatted label is distinct**. That second half is not decoration: the formatter is the
caller's and its resolution (integer RPM) can be coarser than the domain, so round values alone
do not guarantee unique labels — `[0, 1]` at step 0.5 still reads `0 / 1 / 1`. The x-axis keeps
even division on purpose: its ends are the window's own bounds and must be shown exactly.

Tests assert the exact tick sets `['65 C','66 C','67 C']` and `['0 RPM','2000 RPM','4000 RPM']`.
Mutation **`T17`** restores the even division.

### M4 — end labels detached from their dots and overflowed into the next plot · **ACCEPTED**

Reproduced: three coincident labels at 93.06 / 105.06 / 117.06 in a 94 px plot — the third 23 px
below its own floor, on top of the next plot's legend band.

`spaceApart` now takes the plot's height, shifts the whole block back up when it would overrun,
and clamps. And, per the dataviz reference you quoted — *"nudging labels apart detaches them
from their lines"* — every label that had to move now draws a **leader line** in its series
colour back to its own dot. The label text still wears a text token, never the data colour.

Tests: all three labels inside `[0, 94]`; three leaders when three labels move; and the other
side — a single label sits on its dot and draws no leader. Mutation **`T18`**.

### M5 — clipped axis labels, both halves · **ACCEPTED**

(a) The top y-tick's baseline was `0 − 2 = −2`: the maximum of the scale, entirely above the
viewBox. A tick whose label would not fit above its own gridline is now drawn just **below** it,
which also keeps the fan plot's top label inside its own box instead of in the 10 px `PLOT_GAP`.
(b) The first and last time ticks now anchor `start` and `end`; the middle ones stay `middle`.
`text-anchor="middle"` at x = 0 hung ~21 px of the window's start time off-canvas.

Four tests, including the "not at the top" case that must still label *above* its line.
Mutations **`T19`** and **`T20`**.

### M6 — a flat sparkline drew along its bottom edge · **ACCEPTED** (primary) / **REJECTED** (secondary)

**Primary, accepted.** Reproduced: `points="0,24 … 96,24"` at height 24 — a GPU idling at a
constant 66 °C rendered pinned to the floor, the position that in every other frame of the same
trace means *coldest reading in the window*, while `StackedTimeSeriesChart` drew the identical
input mid-plot. Two primitives, same data, opposite reading. A flat series now draws on the
centre line, which is what the full chart does, so they can no longer disagree. Both sides
tested; mutation **`SP5`**.

**Secondary, rejected: the end dot at `cx = width, cy = height` bleeding outside the box.** That
is not a defect of this primitive. `.sparkline` sets `overflow: visible` deliberately so the
2.5 px dot and the 1.5 px stroke are not sliced in half by their own viewBox, and the dot marks
the last sample, which *is* at `x = width`. Insetting the drawing area would move every
coordinate the two `cy="0"` tests pin and change the primitive's contract to buy 2.5 px. What
the bleed actually needs is padding around the sparkline in whatever lays it out — **step 10's
grid**, recorded here rather than papered over in the leaf.

### M7 — the `errors[]` note never got its own line · **ACCEPTED**

Confirmed by reading the cascade, and the mechanism is certain: `flex-basis: 100%` only wraps an
item onto a new line in a `wrap` container, and `.row` was `nowrap`. `flex-wrap: wrap` added,
plus `overflow-wrap: anywhere` on `.note` for §6.5's DKMS entry, which names the running kernel
release — one long unbroken token in a monospace face.

New file `components/styles.test.ts` asserts the rule over the whole directory: **any stylesheet
declaring `flex-basis: 100%` must also declare `flex-wrap: wrap`**, with comments stripped first
so a rule quoted in prose cannot satisfy it, plus a non-vacuity test naming `row.module.css`.
Written as a general fact about flexbox rather than an assertion about one class, so step 10's
stylesheets are covered too. Mutation **`CS1`**.

⚠ Your `[read]` caveat is honoured: the *pixel* outcome at a given panel width is still
unverified — no browser was opened, and `renderToStaticMarkup` cannot lay anything out. What is
now guaranteed is that the declaration does what it was written to do.

### M8 — a test name over-claimed · **ACCEPTED**

`⚠ an OPEN gap (toMs: null) is drawn out to the domain end, not zero-width` now asserts
`x + width === plotWidth`, the property its name states, with a closed-gap fixture on the other
side. Mutation **`T5b`** is the point of the exercise: it ends the open gap at 90 % of the
window, which satisfies the old `width > 0` and contradicts the name — the harness could not
have seen it before, and reddens it now. `T5` (collapse to zero) still bites.

The related note is accepted as well: `sparkline.test.tsx`'s *"a single readable point renders
without dividing by zero"* rendered a `<polyline>` element that paints nothing, so the name was
satisfied by a blank box. It is now ⚠-marked and asserts the point is actually drawn — see M10.

### M9 — a gap had no minimum rendered width · **ACCEPTED**

Reproduced: `width="0.7694…"` for one missed 5 s poll in §6.7's 2 h window. A sub-pixel slice of
a 6 px hatch is invisible, and *"a gap that cannot be seen is the un-hatched line by another
name."* Gaps are now floored at 2 px, clamped to stay inside the plot, and the drop condition is
an explicit **out-of-window test** rather than the accidental `toX <= fromX`, which also silently
dropped a gap that had just opened at "now".

Three tests — the 10 s gap, a wide gap keeping its true width (the floor is a floor, not a
resize), and a gap entirely outside the window drawing nothing. Mutations **`T21`**, **`T21b`**,
**`T21c`**.

### M10 — a one-reading window painted nothing · **ACCEPTED**

Reproduced: `<polyline points="277,55">` — one vertex, no geometry, nothing painted, with the
only visible mark a dot at the wrong x (H3). A run of exactly one point now also draws a
`data-role="lone-point"` dot at its own coordinates. **The polyline is still emitted per run**,
because "one polyline per run" is the shape invariant 1's tests and mutations `T8`/`SP2` are
written against; the dot is what is seen. Fixed in the sparkline too — it has the same defect
for an isolated point mid-series, which the adversarial did not raise.

Both sides tested in both primitives. Mutations **`T22`**, **`SP6`**.

---

## LOW

### L1 — an explicit `yMin`/`yMax` was discarded when nothing was readable · **ACCEPTED**

`yDomainOf` returned `[0, 1]` before it ever looked at `plot.yMin`. It now honours whatever
bound was given in both branches. Two tests — nothing readable and readings present — because
the branch is the boundary. Mutation **`T23`**.

### L2 — end dots below the dataviz marker floor (r ≥ 4) · **REJECTED**

The floor exists for **interactive** marks: an 8 px target is what a pointer can hit and what a
dot plot needs when the dot *is* the datum. Neither applies. These are end-of-line anchors on a
wall panel with no pointer, each already accompanied by §9's third identity channel — a direct
text label — and by the line they terminate. Against that, r = 4 on a 24 px sparkline makes the
dot a third of the chart's height, and 2 px of surface ring on a 5 px dot leaves 1 px of colour.
Adopting the floor would degrade both primitives to satisfy a number written for a different
kind of mark. §9 is this project's design system (the handoff says so explicitly) and it fixes
colour, dash and label — not radius. Recorded as a deliberate deviation rather than an oversight.

### L3 — a single-series plot could carry no identifying text · **ACCEPTED**

Real, and reachable: `legendNeeded` was `series.length >= 2`, there is no title element, and
`endLabel` is optional — a state the suite already exercised. `legendNeeded` is now
`series.length >= 2 || series.some(s => s.endLabel == null)`, so **every series carries at least
one text identifier**, which is §9's "colour plus dash plus a direct label" made structural
rather than conventional. A lone series that does carry an end-label still gets no legend, so
COOLING's fan plot is unchanged. Both sides tested; mutation **`T24`**.

### L4 — duplicate `<defs>` ids are undefended · **REJECTED as a code change**

Accurate, and unfixable in this component: a leaf cannot see its siblings, and the one React API
that could mint a unique id — `useId` — is a hook `purity.test.ts` exists to forbid. Deriving a
suffix from the plots' contents would not be unique either. So the honest move is not a
mechanism that looks like a guarantee: the `id` prop's docstring now states plainly that
uniqueness is **the caller's obligation, unenforced and unenforceable here**, what happens when
it is violated (the second chart's `url(#…)` resolves to the first chart's node), that it is
harmless only while the patterns are identical, and that **step 10 renders at least three charts
on one page**. Recorded as step 10's obligation below.

### L5 — `Chip` conflated "no band" with "no reading" · **ACCEPTED**

The assistive word is now **`no severity band`**. `severity === null` means the reading has no
§6.3 row, which is not the same as no reading — §6.3 is full of readings that carry no band
(`/health: null` is *"not probed this cycle"*, `ch5Mode: null` renders **`unavailable`, not
`—`**, and invariant 3 says *"`EC auto` and `unavailable` are not severities"*). A `Row` with
`value="unavailable" severity={null}` announced "no reading" beside a reading. The em-dash glyph
stays: it is the app's visual vocabulary for "nothing here", and the chip only ever claims
things about bands. Mutation **`C4`**.

### L6 — `PanelShell`'s `data-severity` styles nothing · **ACCEPTED as documentation**

Correct, and correctly classified by you as a contract rather than a bug. `panel-shell.tsx` now
says so in its own docstring — the attribute renders, `PS3` guards that `null` never defaults to
the good band, and **nothing is painted from it**; what a whole panel's severity looks like is
§6.1/§6.2's question and belongs to step 10. Stated so nobody reads the attribute's presence as
evidence a style exists. No code change: inventing a rule here would be step 10's design
decision taken in the wrong file.

### L7 — `Meter`'s `role="img"` duplicated its own visible text · **ACCEPTED — and it was worse**

The duplication is real: the track's `aria-label` was `${label}: ${formattedValue}`, which is
the text directly above it. But pulling that thread found something the adversarial did not
name: **everything the bar added over that text was the colour of the fill.** Unlike `Chip`,
`Meter` paired its band with no glyph and no word, so a screen-reader, greyscale or
forced-colors user got the band's *colour* and nothing else — the colour-only encoding §6.3
("distinguishable without relying on colour alone") and the dataviz reference ("status colours …
always ship with an icon + label, never colour alone") both forbid, in the one primitive that
carries a severity and no chip.

The track is now `aria-hidden` — it is a picture of text that is already present — and the band
travels as a visually-hidden word beside the value, taken from `Chip`'s exported
`SEVERITY_WORD` rather than a second spelling of the same three strings. `severity === null`
adds nothing, because there is no band to name. Three tests, mutations **`ME1`** (drop the
word — colour only), **`ME2`** (restore the duplicate label), **`ME3`** (invent a word for a
null band).

### L8 — legend entries at a fixed 90 px pitch · **ACCEPTED**

Reproduced at `width={320}`: `GPU 0 temperature` starts at x = 20 and runs ~92 px, while entry 2
starts at x = 90. Entries are now laid out by their own labels' widths — swatch + gap +
`label.length × 5.4 px` + entry gap — which is sound here because `.chart` sets the mono face and
9 px monospace is ~0.6 em per glyph. Test asserts no entry begins before the previous entry's
text ends, at the narrow width. Mutation **`T25`**.

⚠ Recorded, not fixed: with long enough labels the row can still exceed `width`. It is a
per-character estimate, not text measurement, which is not available without a DOM.

### L9 — the SVGs are fixed-size · **DEFERRED to step 10**

Accurate and unfixed, deliberately. Both primitives take explicit `width`/`height` props and the
chart already emits a `viewBox`, so making it fluid is a one-line change — but *which* sizing is
right is §6.1's four-breakpoint grid question, and the grid is step 10's. The end-label margin,
the legend layout and the tick geometry are all in px and would need re-checking against a fluid
width; doing that here would be designing the grid in a leaf component. **Step 10 must either
pass a width per breakpoint or ask this primitive for a fluid mode** — it cannot do neither,
because a 600 px chart in §6.1's <900 px single column overflows its panel.

### L10 — `SERIES_STYLES.dashed` has no consumer in `Sparkline` · **REJECTED**

Not a defect, and not do-not-copy #9's "tested, exported and unused" either — the chart consumes
it. A dash pattern distinguishes one series *from another in the same frame*; a sparkline draws
exactly one series behind one number, so there is nothing for a dash to distinguish it from, and
§9's requirement is explicitly about telling GPU 0 from GPU 1 on the cooling chart. Adding a
dash flag to `Sparkline` would add a prop with no meaning at 96×24 px. `palette.ts` now says
this in the type's docstring, so the asymmetry reads as a decision.

### L11 — rule 7's unit-name half has no guard · **DEFERRED to step 10/11**

Confirmed: the route guards walk the tree, and there is **no equivalent for `llama-server` or
`gpu-fan-control.service`**. It is also unbuildable as stated today — a "second spelling" guard
needs a canonical first spelling to point at, and there is none: the unit names arrive at
runtime in the snapshot, and every literal in the repo is inside a fixture or a test. The one
place it could live (`lib/guardrails.test.ts`) is out of this step's bounds, and a
`components/`-only copy would be a second guard in a second place. **Step 10 writes the real
subtitles and is where the risk lands**; it should either add the guard beside the route guards
or record why one cannot exist. Step 9's own `llama-server` literal is a `panel-shell.test.tsx`
subtitle fixture — a test file, so not a breach, as you said.

---

## What the adversarial missed

Four, found while fixing the above. All are fixed here except where noted.

1. **⚠ The red-test ledger's own scanner could not see a multi-line `test.each`.** Its
   `\.each\([^\n]*\)` stops at the first newline, so a ⚠ name on a `test.each([` … `])('⚠ …')`
   spanning lines did not count as marked — the ledger required no mutation for it and printed a
   smaller number. `chip.test.tsx`'s *"⚠ the visually-hidden word survives even with colour and
   glyph removed: %s"* had been invisible since the day it was written. The adversarial checked
   the harness and reported *"nothing wrong found in the harness itself"*; this is the ledger
   failing at exactly the job it exists to do, silently. Replaced with a paren-balanced,
   string-aware **and comment-aware** scan (§5.3 note 1's advice, and needed: this step's own
   fixtures contain `'useState('` and an apostrophe inside a comment). It raised the ⚠ count
   over today's files from 64 to 67 and every newly-visible mark is now backed. **⚠ Steps 2–8 carry the old regex
   and should be re-run against this scanner** — recorded, not done, because those harnesses are
   not step 9's to edit.
2. **`Meter` encoded severity by colour alone** — no glyph, no word, no chip. See L7.
3. **`yDomainOf` discarded an explicit `yMin` for a FLAT series too**, not only for an empty one:
   the `min === max` branch ran *after* `plot.yMin ?? …` and returned `[min − 1, max + 1]`
   regardless. L1 named the empty case; this is the same bug one branch over, and the rewrite
   closes both.
4. **The sparkline had M10's defect as well** — an isolated readable point between two nulls is a
   one-vertex polyline there too, and painted nothing. Fixed symmetrically.

One thing worth stating that is *not* a defect: `xFor` clamps, so a point whose `tMs` lies
outside the window is drawn at the edge — H3's lie in another form. It is unreachable through
the real caller (`traceFor` windows before it decimates, and HANDOVER rule 9 pins
`latestSample` to the chart's last point), so it stays a documented property of the primitive
rather than a guard.

---

## What step 10 inherits, in writing

1. **The hover layer and the table view are OWED** (H2). §6.2 and §9 both call them defaults,
   and §6.2 calls the table view *"an accessibility floor, not a convenience"*. Step 9 did not
   build them because its scope was the primitives and its handoff said not to; that handoff
   bullet is now struck through. This is the highest-value item on the list.
2. **`StackedTimeSeriesChart.id` must be unique per page** (L4). Nothing enforces it, and
   step 10 renders at least three charts.
3. **Sizing** (L9): pass a width per §6.1 breakpoint, or extend the primitive to a fluid mode.
   Do not leave a 600 px chart in the <900 px single column.
4. **A unit-name guard, or a recorded reason there cannot be one** (L11).
5. **Panel-level severity styling** (L6): `data-severity` is on the `<section>` and paints
   nothing yet.
6. **Padding around a sparkline** (M6, secondary): its end dot and stroke deliberately bleed
   ~2 px outside the box.
7. **`components/panels/` is now inside the purity guard** (H4) — the walk recurses, so a hook
   in a panel file fails the suite the day it is written. That is the intended behaviour, not a
   surprise to route around: push state up to the runtime, as the handoff says.

---

## Files changed

| file | why |
|---|---|
| `components/stacked-time-series-chart.tsx` | H1, H2, H3, M1, M2, M3, M4, M5, M9, M10, L1, L3, L4, L8 |
| `components/stacked-time-series-chart.module.css` | `.point`, `.leader` |
| `components/stacked-time-series-chart.test.tsx` | M8's strengthened assertion + 30 new tests (21 → 51) |
| `components/sparkline.tsx` · `.module.css` · `.test.tsx` | M6, M10 |
| `components/purity.test.ts` | H4 — the pattern and the walk |
| `components/chip.tsx` · `.test.tsx` | L5, and `SEVERITY_WORD` exported for L7 |
| `components/meter.tsx` · `.test.tsx` | L7 and the colour-only encoding under it |
| `components/row.module.css` | M7 |
| `components/styles.test.ts` | **new** — M7's guard |
| `components/panel-shell.tsx` · `components/palette.ts` | L6, L10 — docstrings only |
| `pipeline/steps/09-ui-primitives/regressions.py` | 27 new mutations (34 → 61), 9 re-aimed, the ledger scanner |
| `pipeline/handoffs/step-09-ui-primitives.md` | H2 — §5's superseded bullet |
