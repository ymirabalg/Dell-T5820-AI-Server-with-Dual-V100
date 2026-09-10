# 10g — the last unbounded terms (BUILD). **A table view is the chart's own box, the banner is one height at any count, the throttle line is one line — and the all-sources-explained page fits.**

**Written 2026-09-09 by the build phase.** Nothing committed. `SPEC.md` and `MOCK.html` untouched.
No guard weakened; three were re-aimed at the ruled numbers and four grew. Every figure below was
measured by this phase, in real headless Chrome, on the tree it describes.

---

## 0. The headline, before anything else

| | |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 3006 tests, no type errors** (2967 before; +39, every one an assertion added) |
| `measure-breakpoints.mjs` | **29 passed · 0 failed · 0 blocked · 29 total, exit 0** (was 16/16 — three graded measurements are new: **11** the all-sources-explained page, **12** §6.4's banner at 2/6/12/21 conditions, **13** every table view open vs closed) |
| `check-density.mjs --fixture box` | **ALL PASS**, spare **263.2 / 227.6 / 283.6 px** — identical to 10f's, to the digit |
| nine `regressions.py` harnesses | **all nine run serially in ONE foreground call, all nine exit 0** — **1124 mutations** (60 · 73 · 94 · 130 · 63 · 128 · 174 · **138** · **264**), zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, every ⚠ mark reddened. §5 |
| ⚠ **10f-Q1** — five table views open | page height **IDENTICAL** to all closed at all three viewports: grid **717.8 / 753.4 / 753.4 px** either way, every slot to 0.1 px. Was **+851 / +851 / +862** |
| ⚠ **10f-Q2** — the banner | **58.8 px at 2, 6, 12 AND 21 conditions**, at all three viewports, with every condition still in the DOM. Was 65.7 / 65.7 / 92.5 / 173.1 at 1280 |
| ⚠ **10f-Q3 + 10e-Q2** — the all-sources-explained page | **FITS at all three: spare 41 / 6 / 62 px.** Was 34.6 / **−1.0** / 55.0 |
| ⚠ **10f-Q4/Q5** — the affordance | a CSS fade on every bounded well, and `… N more` on `PanelNotes`, costing **0 px** of layout. ⚠ **"exact (it draws iff the well overflows)" is CORRECTED**: measured by the TEST phase at **9/255 with nothing hidden** and fully on past 9 px — proportional, not conditional (§5 there, and `tokens.css` carries the numbers). ⚠ **"0 px" is layout only**: the marker paints opaquely over 46 × 11 px of the line it describes (A4) |
| measurement 9 (all collectors failed) | **140 / 104 / 160 px — unchanged, to the pixel** |
| measurement 10 (the real box's DKMS failure) | 157 / 122 / 178 → **164 / 129 / 185**. ⚠ Every one of the nine slots is IDENTICAL; the whole 7 px is §6.4's banner, and §2.4 shows the arithmetic |

---

## 1. 10f-Q1 — a table view is the chart's own painted box

### 1.1 What it was

`components/tokens.css` carried `--table-scroll-max: 40vh`, read by `sparkline.module.css` and
`stacked-time-series-chart.module.css`. **Five table views are reachable at once** — GPU 0, GPU 1,
COOLING, and CPU's two, which share one control — so the page's own bound was **200vh on a 100vh
promise**. 10f-A1 measured a healthy page with all five open at **+851 / +851 / +862 px**, and GPU
0's alone at **+371.1** against 263.2 px of spare: one click, no telemetry needed, ~21 samples to
fill the cap.

### 1.2 What it is

The table renders in a box of **exactly the chart's painted height** — `overflow-y: auto`,
`position: relative`, `box-sizing: border-box`, sticky `thead`, rows and toggle name untouched:

| where | the chart's box | the table's box |
|---|---|---|
| GPU card, 1280–1599 | `<svg height=38>` | 38 |
| GPU card, ≥1600 (promoted) | `<svg height=50>` | 50 |
| CPU, both traces, 1280 / ≥1600 | 38 / 50 each | 38 / 50 each |
| COOLING | `<svg height=174>` (2 × 72 + 10 + 20) | 174 |

**The height reaches CSS as a custom property, and that is not incidental.**
`components/styles.test.ts` carries a directory-wide rule that *a scrolling box must also be a
bounded box* — the one-line revert that would silently un-cap the table again. A box whose height
lived only in a JSX `style={{ height }}` would be a bound no CSS guard can see, so the component
sets `--table-box-height` inline and the stylesheet keeps a real `height:` declaration for the
guard to read. That guard's own fixture list is re-aimed to it.

**The accessibility floor is untouched** (§6.2, and the `dataviz` skill's own "a table view
exists" rule). Every row is still in the table, the `<caption>`, the sticky `thead`, the row
headers and the gap rows are unchanged, and the box is still a named, keyboard-reachable
`role="group"`. What changed is its size — and the ruling states the cost in its own words: *"a
38 px table with a sticky head shows about one row and scrolls — that is the ruling's cost, and it
stays."*

**One derivation, not two agreeing ones** (HANDOVER §0.8). `StackedTimeSeriesChart` exports
`chartBoxHeight(plotCount, plotHeight)` and BOTH branches call it — the `<svg>`'s `height` and the
table's box — so the two views cannot drift apart while both look right. The sparkline's two views
already share one `height` prop.

⚠ **The empty case renders INSIDE the box**, in both components. An empty series still paints a
full-height `<svg>` in chart view, so the pre-10g bare `<p>` beside the box was the one state in
which toggling the view moved the page.

### 1.3 Measured

`measure-breakpoints.mjs` **measurement 13** drives the REAL toggle buttons (the state is the
shell's, 10c-1) on the healthy box fixture, and asserts its own precondition first — four controls
found, five table views on the page after:

| viewport | grid, all closed | grid, all five open | slots that moved |
|---|---|---|---|
| 1280 × 1024 | **717.8** | **717.8** | none |
| 1600 × 1024 | **753.4** | **753.4** | none |
| 1920 × 1080 | **753.4** | **753.4** | none |

`mocks/measure-arrangements.mjs` reports the same comparison independently (its `withTables` pass,
extended from two viewports to three by this build and now printed):
`baseline: … grid=717.8 | 753.4 | 753.4` against `baseline+tables: … grid=717.8 | 753.4 | 753.4`.

**`--table-scroll-max` is deleted from `tokens.css`, and SCOPE 2.5f with it.** The stopgap's own
comment ("once step 10 gives a panel body a genuine bounded height, this should become
`max-height: 100%`") is replaced by the reason there is no page-independent number left to name.
`mocks/arrangements.mjs`'s `FULL_TABLES` override, which forced the old cap for 10d's comparisons,
now spells `40vh` literally — an override reading a retired token would have silently forced
nothing.

---

## 2. 10f-Q2 — §6.4's banner is one height at any count

### 2.1 The shape

`.rest` — the conditions past the lead — is a **fixed one-line scrolling well**; `.head`, which
carries the count, is **outside the scroller entirely**. That is the ruling's own alternative to
`position: sticky`, and it is the better one here: the banner's ground is a 90° red gradient, and a
sticky head would need an opaque ground of its own to stop chips scrolling visibly under it. The
count §6.4 requires *"always visible"* is not merely pinned — it is not in the scrolling box.

**The component's contract is unchanged, and that is the point.** `rest` is still rendered in full,
one item per condition, and `lib/client/banner.ts`'s `rest: mapped.slice(1)` still has no cap:
every condition's text is in the DOM at every count. Capping the list (`+N more`) was the
alternative and was not taken — a banner that renders fewer conditions than it counts is the lying
banner 10a-F14 already removed from this component once.

### 2.2 The two numbers, both deliberate

- **`height: 21px`, not `max-height`.** The measured chip line is **20.8 px**; under `max-height` a
  two-alarm banner would measure 20.8 and a twenty-one-alarm one 21.0, so the acceptance —
  *identical* at 2 / 6 / 12 / 21 — would fail by 0.2 px on a rule that is working. `height` fixes
  the line at every count, exactly as `session-event-log-panel.module.css`'s own well does. 21 is
  the whole pixel above 20.8, so one line is never clipped by rounding.
- ⚠ **`.rest`'s `margin-top: 7px` is removed**, and this is the one visual change in 10g that the
  ruling does not name. It reserved optical separation *under an unbounded, growing block*; between
  the two lines of a fixed two-line box the separation is the body's own 2 px gap, the same as
  between any two lines of one box. The banner therefore measures **58.8 px** rather than 65.7 at
  every count — and **that 6.9 px is what closes 10f-Q3's 1 px** (§2.4). Recorded here rather than
  buried, because it is a design consequence and the owner ruled "~66 px".

The well also takes a `--surface-sunken` ground. That is not free-hand design either: the
continuation fade (§4) only vanishes when its cover layer is painted in the well's *exact* ground,
and this region's ground was the banner's own horizontal gradient, which no single colour matches.
`tokens.css` reserves `--surface-sunken` for "a recessed well", which is now what this is.

### 2.3 Measured — `measure-breakpoints.mjs` measurement 12

Four alarm counts, applied to one live page without a reload (a confirmed condition stays
confirmed, so four stages cost four debounce waits rather than four page loads), each stage a
superset of the last:

| conditions | banner at 1280 | 1600 | 1920 | items in the DOM | `.rest` client / scroll at 1280 |
|---|---|---|---|---|---|
| 2 | **58.8** | **58.8** | **58.8** | 1 | 21 / 21 |
| 6 | **58.8** | **58.8** | **58.8** | 5 | 21 / 48 |
| 12 | **58.8** | **58.8** | **58.8** | 11 | 21 / **75** |
| 21 | **58.8** | **58.8** | **58.8** | 20 | 21 / **128** |

⚠ **CORRECTED 2026-09-10 by the reconciliation (adversarial A10; the TEST phase had already
corrected the 21 row).** This table printed `21 / 101` at BOTH 12 and 21 conditions. Measured
from a fresh load per stage, 12 conditions is **21 / 75** and 21 is **21 / 128**. The build
applied its four stages to one live page without a reload, so its `since` strings had been
counting for longer and its chips were wider — the scroll height is a property of the RUN, not
of the rule, which is a reason not to quote it as one. The number the acceptance rests on is
the banner HEIGHT, which is 58.8 in every run at every count.

Before: 65.7 / 65.7 / 92.5 / **173.1** at 1280, and 173.1 / 146.2 / 119.4 across the three
viewports at 21.

Two preconditions are graded before the equality, both of which failed on this build's first run
and are the reason the run is trustworthy now:

1. **The fixtures produce the counts they claim** — read from the banner's own `N active alarms`
   line, not assumed. ⚠ The first run measured `[2, 6, 12, 12]`: a fixed 13 s wait is not enough
   for nine new conditions, because §6.4 confirms a band on ten seconds of wall time the client was
   **sampling** and the first poll carrying a new reading arrives up to a cadence late. The script
   now waits for the count itself (`waitForFunction`, 45 s ceiling) rather than sleeping a guess.
2. **Nothing is dropped** — one rendered item per condition past the lead, at every count.

The stages are built from §6.3's own bands, so the counts are derivable rather than tuned:
`2` = `gpu_temp` ×2 · `6` = + `gpu_vram` ×2, `cpu_temp`, `ram` · `12` = + `disk_free` ×2, `unit:llama-server@{0,1}.service`, `health` ×2 ·
`21` = + `fan_stopped` 1–4, `fan5_absolute`, `link`, `ufw_enforcing`, `pwm5_present`,
`dkms_for_running_kernel`. ⚠ `fan5Rpm: 0` is paired with `ch5Mode: null` deliberately: §6.3's
*engaged* band applies only while engaged, so `fan5_engaged` stays out and 21 really is 21.

---

## 3. 10f-Q3 + 10e-Q2 — the throttle line is a one-line well, and `roomy` is 46 px

### 3.1 The throttle line

`Caption` gains an optional `well` prop carrying the well's **accessible name**. When given, the
children (and only the children — see below) render inside a bounded, named, focusable
`role="group"`; the GPU card passes `` `GPU ${index} throttle` ``, so the two cards never announce
the same box (10f-A6). STORAGE's link line passes nothing and is unchanged: a well round one state
pill and an age is chrome spent on nothing, and it would be an unnamed box and a tab stop for it.

**⚠ The LABEL stays outside the well.** `throttle` is this line's equivalent of §6.4's pinned
count; a well that scrolled its own name away would be a box with nothing saying what it is.

**17 px is measured, not chosen.** On this tree, before the change:

| mask | caption height at 1280 / 1600 / 1920 |
|---|---|
| `0x24` — `0x4 sw power cap` + `✕ 0x20 sw thermal slowdown` | **17 / 17 / 17** (one line) |
| `0xec` — three more notable bits | **44** at 1280 (three lines) |

So the term this bounds is **+27 px per card on a third notable bit**, on the row that sets the
page's first term — and `10e-Q2` measured a fourth bit taking it to 71. After: 17 px whatever the
mask, chips wrapping and scrolling inside it.

⚠ **CORRECTED 2026-09-10 by the reconciliation (adversarial A2) — "17 px whatever the mask"
was FALSE AS SHIPPED, and it was false about the CAPTION rather than the well.** `max-height: 17px`
bounds the well; `caption.tsx` puts the label and the well side by side inside a `flex-wrap: wrap`
`<p>`, and a wrapping flex container breaks lines on each item's *hypothetical* main size — the
chips' max-content width, 839 px at `0x…ec` — computed before any shrinking. So the well dropped
onto its own second line and the caption measured **41.2 px at 1280 and 1600**, 17 only at 1920.
Measured A/B on the shipped tree, mask `0x…ec`: the ruling bought **2 / 3 / 0 px per card**, not 27.
The reconciliation fixed it with one declaration — `flex: 1 1 auto` → `flex: 1 1 0` on `.well`,
which makes that hypothetical size zero — and re-measured: caption **17.0 / 17.0 / 17.0**, GPU card
**211 / 222 / 198 → 186 / 198 / 198**, page spare **158 / 123 / 203 → 182 / 147 / 203** on a
throttling healthy page. The bound was real; the shape the ruling asked for was not, and no test
could see the difference because both live in CSS the suite reads one rule of.

⚠ **The +44 px per card in `10e-Q2`/`10f-Q3` is not reproducible on this tree and did not need to
be.** That figure was measured before 10e's density work and 10f's Q3 neutral chip; the same
two-bit mask is now one 17 px line. The finding's *mechanism* — an unbounded line on row 1 that
grows with the mask — is intact and is what is bounded here, and the number it costs is 27, not 44.

### 3.2 `roomy` 60 → 46

One line in `panel-notes.module.css`, exactly as ruled. ⚠ Its arithmetic is recorded in place
rather than restated, because the same gap term has now been dropped twice: 46 = 4 px of padding
plus three 14 px lines, but a message line measures **13.77 px** and the block's own `gap` is 3 px,
so 46 px shows **three lines of one wrapped message** (4 + 3 × 13.77 = 45.3) and **two whole
messages plus 88 % of a third** when the well holds three separate ones. Implemented as ruled; the
discrepancy is §6's silence #4.

### 3.3 The re-measurement — `measure-breakpoints.mjs` measurement 11 (new)

10f's A3 page was measured from a scratch script that was never committed. It is a graded
measurement now, reproduced term by term: the healthy box, **all eighteen** of §3.7's sources each
carrying the real 150-character DKMS message, **plus the two instance-tagged `llama-server`
entries** — §4's `TelemetryError.instance` is what puts an explanation on a SERVING *row* rather
than in the panel's block (10b-S-G), and those two row wells are the +40 px that made SERVING, not
the session event log, row 4's governor. Without them the fixture is 37 px kinder than the one it
claims to reproduce; this build measured it both ways and says so.

| viewport | 10f's A3 | 10g | slots at 1600 |
|---|---|---|---|
| 1280 × 1024 | spare 34.6 | **41** | `gpu 199 · cooling 512 · cpu 263 · memory 188 · safety 239 · storage 218 · serving 167 · log 130` |
| **1600 × 1024** | **OVER by 1 px** | **6** | — |
| 1920 × 1080 | spare 55.0 | **62** | — |

**It fits at all three, and the margin at 1600 × 1024 is 6 px.** Stated plainly: that is a margin,
not comfort. §4's silence names what would eat it.

⚠ **Reconciled term by term against 10f's numbers, which is where the honest surprise is.**
Comparing this build's slots at 1600 with 10f's reconciliation's:

| term | 10f | 10g | why |
|---|---|---|---|
| `gpu`, `cpu`, `memory`, `safety`, `cooling` | 199 / 263.1 / 188.1 / 239.4 / 511.5 | 199 / 263 / 188 / 239 / 512 | unchanged — no ruling touches them on this fixture |
| `storage` | 232.1 | **218** | `roomy` 60 → 46. It does **not** move the page: SAFETY (239) still sets row 3 |
| `serving` | 166.8 | 167 | reproduced, with the two instance-tagged entries |
| the banner | 65.7 | **58.8** | §2.2 |
| **page** | **1 px over** | **6 px spare** | the whole difference is the banner's 6.9 px |

**So the term that closes 10f-Q3 is §6.4's banner, not `roomy`.** On this page — and on every page
this project grades — no `roomy` cell governs its grid row, so 60 → 46 buys **0 px** today. It is
slack against the page where STORAGE or MEMORY would govern (STORAGE's headroom under SAFETY goes
from 7.3 px to 21.3), and it was ruled; it is implemented and measured, and its contribution is
reported as zero rather than credited with the fix.

### 3.4 Measurements 9 and 10

**Measurement 9 is unchanged to the pixel: 140 / 104 / 160.** Inside it, STORAGE moved 232 → 218
(the `roomy` change) and the page did not, because SAFETY sets row 3 — the same term-by-term
result as above, from a fixture written for something else.

**Measurement 10 went 157 / 122 / 178 → 164 / 129 / 185, and every one of the nine slots is
identical.** This build re-ran the pre-10g tree to reproduce 10f's own numbers (they reproduce
exactly) rather than argue about the difference, and then found where the 7 px lives: **not in a
slot at all — in the sticky band.** The real box's degraded page *pins a two-alarm banner*
(`pwm5_present` and `dkms_for_running_kernel` are both alarm-severity), so band + gutter is
**109 → 102** and the whole delta is §6.4's 6.9 px. `recordFit` now prints the band beside the
spare: a page total whose terms are all published except one is a total nobody can reconcile.

---

## 4. 10f-Q4/Q5 — a well that hides text says so

### 4.1 The fade is CSS, and it is EXACT

Two background layers on every bounded well: a **cover** painted in the well's own ground and
attached to the **content** (`local`), over a **fade** attached to the **container** (`scroll`).
When nothing is hidden, the content's bottom edge and the box's bottom edge coincide, the cover
sits exactly over the fade, and nothing is drawn; when there is more below, the cover has scrolled
out of view and the fade shows; scroll to the end and the cover comes back over it. No measurement,
no state, no JS — and right in all three positions rather than approximately right in one.

⚠ **Why a background and not a `mask-image` that fades the TEXT**, which the ruling names as an
option: a mask has no `local` attachment, so it cannot be made conditional on overflow. It would
fade the bottom of every well including the ones with nothing hidden — which is precisely the *"and
nothing when it does not"* half of the ruling.

Applied to the four wells the ruling names: `PanelNotes`, `StatusRow`'s `note`/`detail`, the
throttle well, and the banner's conditions.

### 4.2 The count is DATA, and it is a lower bound

`components/` is hook-free (`purity.test.ts`), so nothing here can read `scrollHeight`. Per the
ruling, the `N` in `… N more` comes from what the panel already has:
`hiddenMessageCount(total, bound) = max(0, total − LINES_SHOWN[bound])`, with `LINES_SHOWN` =
`{ tight: 1, roomy: 3 }` — the same two numbers the stylesheet's two `max-height` rules are, in one
place so the marker and the box it marks cannot drift apart.

The marker is **out of flow**: `position: absolute` against a `position: relative` wrapper that adds
no height, so it costs the page **0 px** — §6.1's *"the heights stay as budgeted"*. ⚠ **That is
true of LAYOUT and only of layout (adversarial A4, 2026-09-10).** `.more` is painted in an opaque
`--surface-2`, anchored to the wrapper's bottom edge, so it sits over the bottom-most VISIBLE line
at every scroll position — and on a `tight` well that is the only line there is. Measured on the
graded all-sources-explained page at 1280: a 49 × 11 px marker overlapping **46 × 11 px** of the
note beneath it, 17 % of `cpu messages`' 275 px line and 8 % of `serving messages`' 592 px one. The
page cost is zero and the legibility cost is not; it is recorded rather than fixed, because the
owner's 2026-09-10 ruling puts the same affordance on every panel BODY (10h) and the marker's
placement is decided there. It is
`aria-hidden`, because nothing is hidden from a screen reader: every message is in the DOM inside a
named, focusable `role="group"`. This is the wall panel's affordance, where there is no pointer and
no keyboard to discover the scroll with. It is a count and never a sentence (§6.1's wording).

**Where there is a marker and where there is only the fade — and why:**

| well | fade | `… N more` | why |
|---|---|---|---|
| `PanelNotes` (`tight`, `roomy`) | yes | **yes** | a LIST of messages; `entries − linesShown` is the ruling's own formula |
| `StatusRow`'s `note` / `detail` | yes | no | one string, not a list — no count exists in the panel's data |
| the throttle well | yes | no | chips WRAP, so "chips past the first line" is not derivable from data |
| §6.4's banner | yes | no | the pinned lead already carries the total (`12 active alarms`) |

All three "no"s are recorded as spec silences (§6), not decided quietly. And the count is exact
only when each message is one line: a single 150-character message overflowing an 18 px well
returns 0 and shows the fade alone. That is the ruling's own anticipated case — *"record as a spec
silence if the count can only approximate what is visually hidden"* — and §6 records it.

---

## 5. What changed in the tree

### Source (10 files)

| file | what |
|---|---|
| `components/tokens.css` | `--table-scroll-max` **deleted** (Q1); `--well-fade-cover` / `--well-fade-edge` / `--well-fade-height` added (Q4), with the mechanism and the mask argument |
| `components/sparkline.tsx` | the table view takes the chart's `height` and sets `--table-box-height`; the empty case moves inside the box |
| `components/sparkline.module.css` | `.tableView` — `height: var(--table-box-height)` + `box-sizing`, replacing the 40vh cap |
| `components/stacked-time-series-chart.tsx` | `chartBoxHeight()` exported and used by BOTH branches; the table view takes `plotHeight`; the empty case moves inside the box |
| `components/stacked-time-series-chart.module.css` | same `.tableView` change |
| `components/alarm-banner.tsx` | `.rest` becomes a named, focusable `role="group"` (`data-role="banner-rest"`); the list is untouched |
| `components/alarm-banner.module.css` | `.rest` — fixed one-line scrolling well, sunken ground, fade; `margin-top` removed |
| `components/panels/panel-notes.tsx` | `hiddenMessageCount` + `LINES_SHOWN` exported; the well is wrapped and gains the `… N more` marker |
| `components/panels/panel-notes.module.css` | `roomy` 60 → **46**; the fade; `.well` wrapper and `.more` marker rules |
| `components/panels/status-row.module.css` | the fade on `.note` |
| `components/panels/panel-text.module.css` | `.well` — the throttle line's 17 px bounded well, with the fade |
| `components/panels/caption.tsx` | the optional `well` prop (the well's accessible name); the label stays outside it |
| `components/panels/gpu-panel.tsx` | passes `` well={`GPU ${index} throttle`} `` |

### Tests (7 files, none weakened)

`components/sparkline.test.tsx` (+4 describes' worth), `components/stacked-time-series-chart.test.tsx`,
`components/panels/panel-notes.test.tsx`, `components/panels/caption.test.tsx`,
`components/panels/gpu-panel.test.tsx`, `components/alarm-banner.test.tsx`, `components/styles.test.ts`.

**Three re-aims, all at a ruled number, none narrower than the original:**

1. `panel-notes.test.tsx` — `expect(heightIn(roomy)).toBe(60)` → `.toBe(46)`. Both heights are
   still asserted exactly and the ordering assertion is untouched.
2. `panel-notes.test.tsx` — the React-key test reads the keys one level deeper, through the new
   `.well` wrapper. Same property, same strength; only the depth moved.
3. `styles.test.ts` — the `var(...)` fixture reads `height: var(--table-box-height)` instead of the
   retired token, and the bounded-panes list grows from five to **seven** (`alarm-banner.module.css`
   and `panels/panel-text.module.css` join it). The list grew; nothing left it.

⚠ **One of this build's own new tests was strengthened before it shipped**, and it is worth naming
because it is §0.4's shape: both chart CSS tests first asserted `/height:\s*var\(--table-box-height\)/`,
which **also matches `max-height:`** — and a maximum is a real defect in the other direction (a
one-row table shorter than the chart it replaced moves the page just as surely). They now assert
`(?:^|[^-])height:` and refuse `max-height` outright, with `10g-SP4` / `10g-CH5` behind them.

### Harnesses (2 files)

`pipeline/steps/09-ui-primitives/regressions.py` **129 → 138** (`10g-SP1`…`SP4`, `10g-CH1`…`CH5`),
gaining two CSS sources of its own — the table view's BOUND is the only part of its box that lives
in CSS at all, so nothing else could guard it. `pipeline/steps/10-panels-assembly/regressions.py`
**242 → 264** (`10g-AB1`…`AB7`, `10g-PN1`…`PN8`, `10g-CP1`…`CP5`, `10g-GP1`/`GP2`), and its
id-prefix guard accepts `10g-`.

**All 31 new mutations reddened a real TEST** — read off the run's own `red=` lines, never off the
exit code. That distinction is HANDOVER §0.10's (*"a mutation that does not COMPILE proves nothing
about the tests"*) and four of these were written twice because of it: `10g-CH2`, `10g-PN1`,
`10g-CP1` and `10g-AB2` each had a first draft that removed the only use of a parameter or of a
local. The rewrites are also the likelier defects — a prop that was never threaded (`10g-CH2`), a
bound hard-coded at the call (`10g-PN1`), an inverted condition (`10g-CP1`).

⚠ **`10g-AB2` is a MOVE, not a deletion, and that is the whole point of it.** Deleting the count
compiles and reddens eleven tests — but it is `10a-AB1`'s subject, and it leaves the ⚠ test it was
written for (*the count PRECEDES the well*) **passing**, because `indexOf` returns −1 for text that
is not there and −1 is less than everything. The mutation moves the count in with the conditions it
counts, which is the wrong implementation someone would actually write.

**Five inherited anchors re-aimed, none weakened** (HANDOVER: *`ANCHOR NOT FOUND` means the
implementation moved*):

| id | why it moved | how it is pinned now |
|---|---|---|
| `Q2-TV6`, `Q2-TV11`, `Q2-SP13` | the table view's opening tag became MULTI-LINE when it gained the `style` carrying the chart's box | the same attributes, deleted from the same element, anchored on their own lines |
| `10f-PN2` | the notes well gained a wrapper, indenting its four attribute lines by two | the same three attributes, at the new indentation |
| ⚠ `Q2-SP10` | **`ANCHOR AMBIGUOUS`, and it is the more dangerous of the two labels.** Its second edit was the bare `      aria-label={ariaLabel}\n`; the multi-line table-view tag now carries that attribute at the SAME indentation as the `<svg>`'s, so it matched twice and `replace(old, new, 1)` would have silently taken the first — the mutation applies, a test reddens, and the property being certified is no longer the one its name records | both edits pinned to one site: the caption by its new indentation, the chart's label by the `role="img"` line above it, which only the `<svg>` has |

### Measurement (3 files)

`measure-breakpoints.mjs` — measurements **11**, **12** and **13**, each with a fixture-took
precondition of its own; the band height is printed beside the spare; two new fixtures
(`fixtureAllExplained`, `fixtureAlarms`) and two new fabrication modes.
`mocks/measure-arrangements.mjs` — the `withTables` comparison runs at all three viewports and is
printed. `mocks/arrangements.mjs` — `FULL_TABLES` spells `40vh` rather than reading a retired token.

---

## 6. Spec silences — recorded, not chosen (invariant 7)

1. **`… N more` is a count of ENTRIES, and cannot see wrapping.** §6.1 asks for the marker
   *"whenever `scrollHeight > clientHeight`"*; `components/` is hook-free and cannot measure, and
   the ruling's own instruction is to take `N` from the panel's data. So a well hiding the tail of
   ONE long message shows the fade and **no count** (it is exact for a list of one-line messages,
   and a lower bound otherwise). The handoff anticipated this and asked for it to be recorded.
2. **Three wells get the fade and no marker**, for three different reasons, none of them stated in
   §6.1: a `StatusRow`'s `note`/`detail` holds one string rather than a list; the throttle well
   holds chips, which wrap, so "chips past the first line" is not in the data; and §6.4's banner
   already pins the total, so a second count beside it would be the same fact twice. §4.2 has the
   table.
3. **§6.1 does not say whether the affordance should disappear when the reader scrolls to the
   bottom.** The CSS mechanism does (the cover returns over the fade), which is the reading that
   matches *"and nothing when it does not"*; the marker does not, because it is not a measurement.
4. **`roomy = 46 px` is three 14 px lines, and a line measures 13.77 with a 3 px gap between
   messages.** Implemented exactly as ruled. The consequence — three lines of one wrapped message,
   but two-and-a-bit *separate* messages — is recorded in the stylesheet and in §3.2 rather than
   silently corrected to 51 px, which is what three separate messages would need.
5. **The banner's `margin-top: 7px` is removed and the fixed box measures 58.8 px, not the
   ruling's "~66".** §6.4 fixes the SHAPE (two lines, the count pinned, the rest scrolling) and
   gives ~66 as the measured height of what it replaces. §2.2 gives the reasoning and §3.3 the
   consequence: it is the 6.9 px that closes 10f-Q3. If the owner wants the 7 px kept, the page is
   1 px over at 1600 × 1024 again and 10f-Q3 needs a different term.
6. **`.rest` gains a `--surface-sunken` ground.** Required by the fade (the cover must match the
   well's exact ground, and the banner's is a gradient), and consistent with `tokens.css`'s own
   assignment of that surface to "a recessed well" — but it is a surface change inside §6.4's
   banner that no ruling names.
7. **The session event log's own bounded well takes neither the fade nor a marker.** It is not in
   the ruling's list, and §6.4 specifies it as a scrolling list with its own border; extending the
   affordance to it is a one-line change if the owner wants it.
8. **Two region names are new copy**: the throttle well announces `` `GPU N throttle` `` and the
   banner's scrolling region announces `other alarm conditions`. Both are region NAMES rather than
   messages — the precedent is 10f's own build silence #2 (`${subject} messages`) — and neither is
   visible text.
9. **The margin at 1600 × 1024 on the all-sources-explained page is 6 px.** §6.1's promise is met
   at all three viewports on every fixture this project grades, but that is the tightest of them,
   and the terms that would eat it are named: one more `StatusRow` explanation on SAFETY (+20),
   or a third SERVING row (⚠ **+48, not +20** — measured 2026-09-10, adversarial A10: SERVING goes
   167 → 215, which is what takes 1600×1024 from +6 to −42), or a lead condition long enough to
   wrap §6.4's head line (⚠ measured NOT reachable from §6.3's own condition labels — adversarial
   §2). The SAFETY +20 was never measured and is still an estimate. ⚠ And the list was not the
   whole list: a notable throttle mask (−16 at 1600), §6.3's four alarm bits (−40) and a
   path-valued `model` (−19 at 1280) each break the same page on their own. That is 10g-A1, and
   it is why the owner ruled the GRID bounded on 2026-09-10 rather than one more term.

---

## 6a. The nine harnesses, as this build left them

Re-derived from each harness's own printed lines, never carried forward. ⚠ The first run of the
nine exited 1 on **steps 9 and 10** — five inherited anchors moved or went ambiguous when 10g's
edits re-indented the code they pointed at (§5). They were re-aimed and all nine were re-run
serially in one foreground call:

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | 60 | 272 red across 60; 22 ⚠ checked | exit 0 |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | exit 0 |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | exit 0 |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | exit 0 |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | exit 0 |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | exit 0 |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | exit 0 |
| `09-ui-primitives` | **138** | 197 red across 138; **145** ⚠ checked | exit 0 |
| `10-panels-assembly` | **264** | 309 red across 264; **278** ⚠ checked | exit 0 |

**1124 mutations** (was 1093), zero cross-harness id collisions, and every 10g anchor occurs
exactly once in the file it names — re-derived by importing each `regressions.py`, never by
`grep -c`.

⚠ **Seven of the nine could not have been affected by 10g and were run anyway**, because the
acceptance is the whole set: nothing under `lib/` or `app/` changed in this item, so steps 2–8 own
no file 10g touched. Their numbers are identical to 10f's, which is the check that says so.

---

## 7. What a reviewer should check first

1. **Run `measure-breakpoints.mjs` yourself.** Measurements 11, 12 and 13 are the acceptance, and
   each grades its own precondition first — measurement 12's caught this build's first run
   measuring twelve alarms while calling them twenty-one.
2. **§3.3's reconciliation table**, and specifically the claim that `roomy` 60 → 46 buys **zero**
   px on every graded page. It is the ruling's stated purpose, and the honest answer is that the
   banner did the work.
3. **§2.2's removed `margin-top`** — the one visual change 10g makes that no ruling asked for.
4. **`components/styles.test.ts`'s bounded-panes list**: it must be seven, and the two new entries
   must be the banner and the throttle line.
