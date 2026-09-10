# 10g — TEST. **Two of the three acceptance measurements passed vacuously, and the one derivation had two. All three are fixed; the builder's two disputed numbers are both true.**

**Written by the TEST phase, 2026-09-09.** Fixing was in scope and ten changes were applied, every
one named below with the measurement behind it. Nothing committed. `SPEC.md` and `MOCK.html`
untouched. No guard weakened: every re-aim widened or held, and the strengthened records in
`measure-breakpoints.mjs` were each proved to FAIL on the defect they name before being believed.

---

## §2 — the eight priorities, in order

### 1. The eight re-aimed anchors — all eight sound, each read off its own run

Run one mutation at a time and print its RED set (the harness's own `red_test_lines`), never the
diff alone. Every one bit, and every one reddened a test about the property its name records:

| re-aim | red tests | verdict |
|---|---|---|
| `Q2-TV6` (chart, multi-line tag) | *the table view carries the CALLER's accessible name* · *the table view's own group is a keyboard-focusable scroll container* | **sound** — see below |
| `Q2-TV11` | *…keyboard-focusable scroll container* | sound |
| `Q2-SP13` (sparkline) | *…keyboard-focusable scroll container* | sound |
| ⚠ `Q2-SP10` (was AMBIGUOUS) | *the chart view announces the caller's own name* · *the table view's `<caption>` is that same caller name* | sound — **both edits landed on their own sites**, which is exactly what the ambiguity fix claims and what these two red tests prove (one per site) |
| `10f-PN2` (wrapper indent) | *the well is a NAMED, keyboard-reachable group* | sound |
| the React-key test read one level deeper | `10f-PN6` → *two entries from ONE source get DISTINCT React keys* | sound — the key defect is still caught **through** the new wrapper |
| `roomy` `.toBe(60)` → `.toBe(46)` | `10g-PN8` → *`.notes` is a bounded, positioned, border-box well* | sound, at the ruled number |
| `styles.test.ts`'s `var(...)` fixture + the pane list 5 → 7 | `10f-CS4` → *every scrolling box in `panels/panel-notes.module.css` is also a bounded box*; `10f-CS6` / `10e-CS3` → the positioned-box rule | **widened, not narrowed** |

Two of those deserve their working:

- **`Q2-TV6` deletes LESS than it used to, and loses nothing.** Its pre-10g edit removed
  `role="group"` *and* `aria-label`; the re-aim removes only the label. I re-applied the original,
  wider deletion at the new indentation and read the RED set: **identical, two tests, the same
  two.** And `role="group"` alone, deleted by hand in both chart files, still reddens (2 red in
  the stacked chart, 1 in the sparkline). Nothing lost; the smaller defect is the harder test.
- **The `styles.test.ts` list could not narrow.** Both rules that read it are
  `test.each(cssFiles)` over the whole directory — the list is the anti-vacuity check, not the
  scope — so growing it from five files to seven *added* two generated `⚠` tests
  (`alarm-banner.module.css`, `panels/panel-text.module.css`) rather than moving a boundary.

### 2. Measurements 12 and 13 — **both passed vacuously. Both now refuse the defect they name.**

Audited as guards, and each one attacked until it passed on a page that violates the ruling it
grades. Both attacks succeeded on the build's version; both fail on this one.

**⚠ Measurement 13 compared five open table views against five open table views.** Starting the
shell in table view (`INITIAL_CHART_VIEWS` all `'table'`, one line) and re-running:

```
PASS 13. the table-view fixture TOOK …          <- with nothing ever toggled shut
PASS 13. 1280x1024: every table view open measures the SAME page as every one closed
```

all four records green, because `tablesClosed` was recorded and never graded. A toggle that
silently no-opped in the *chart* direction would read exactly like a ruling that holds.

Two further defects in the same function, found on the way:

- **It clicked the header's PAUSE button.** `page.$$('button[aria-pressed]')` matches
  `header.tsx:182` as well as the four `ChartViewToggle`s, so the "open" side of the comparison
  was measured with the client **paused** and the "closed" side with it polling, and `controls`
  counted five where the precondition means four.
- **`[data-role="table-view"]` counts NINE, not five.** A GPU card renders both its sparkline and
  its promoted full chart and lets the media query hide one (measurements 7 and 8 are about
  precisely that), so the DOM count double-counts every promoted trace. The ruling's *"five table
  views are reachable at once"* means five a reader can see.

Fixed: the selector is `button[aria-pressed][aria-label*="show as"]`, the precondition is
`controls === 4 && tablesVisible(open) === 5 && tablesVisible(closed) === 0`, and `tablesVisible`
counts elements with a client rect. Re-probed with the shell starting in table view:
**`FAIL 13. … {"controls":4,"tablesOpen":5,"tablesClosed":5,"tableViewsInDom":9}`**.

**⚠ Measurement 12 passed with every condition past the lead INVISIBLE.** One declaration —
`.rest { display: none }` — and the run reported **29 passed, 0 failed**: four counts read from
the banner's own line, four item totals, and the height equality at all three viewports, all
green, with `restClientHeight: 0` and nothing scrollable. That is §6.4's *"nothing is dropped"*
failing in the only way that matters, invisible to a measurement that counts DOM children.

Fixed in two places:

- *nothing dropped* now requires the right NUMBER of items, **every one of them carrying text**,
  and the **last** item's text non-empty (the tail is what a bounded box loses first);
- a new record — *the conditions are SCROLLED, not hidden* — grades `restVisible`,
  `restClientHeight >= 20` (§6.4's one line), `restScrollHeight > restClientHeight` past two
  conditions, and `lastItemBottom <= restScrollHeight`, i.e. the last condition's bottom edge is
  inside the scrollable content rather than past its end.

Re-probed with `display: none`: **FAIL at all four stages** (`unreachable: [2,6,12,21]`). The
well's own geometry is printed beside the heights now, for the same reason the heights are:

```
.rest at 1280 — 2: client 21 / scroll 21 · 6: 21 / 48 · 12: 21 / 101 · 21: 21 / 128
```

⚠ The build's §2.3 table reports `21 / 101` at **both** 12 and 21 conditions. Measured here, 21
conditions scroll to **128**, and the last condition's bottom edge is inside it at every stage.

### 3. `chartBoxHeight()` — **the one derivation was two, and the divergence is on the first frame after every reload**

The `<svg>` and the table box cannot diverge *when the chart draws a chart*. They diverged when it
does not:

| state | chart `<svg>` | table box |
|---|---|---|
| 2 plots, healthy domain | 174 | 174 |
| 1 plot | 92 | 92 |
| `plots: []` | 72 | 72 |
| ⚠ **2 plots, `domainEndMs <= domainStartMs`** | **72** (`data-empty="true"`) | **174**, and it printed two tables |

The chart branch tested `plots.length === 0 || domainEndMs <= domainStartMs`; the table branch
tested `plots.length === 0`. **That state is ordinary, not exotic**: `chartDomainOf` returns a
degenerate `0 → 0` domain until the first accepted poll — its own doc says so — and COOLING's two
plots are literals in `cooling-panel.tsx`, present from the first render. A page reloaded with
COOLING in table view therefore showed a 174 px box beside the 72 px chart it replaces, until the
first poll landed: 102 px of exactly the toggle-moves-the-page this ruling forbids.

Fixed by deciding both ONCE, above either branch, the way `clipPlotsToDomain` already is:

```ts
const emptyBox = plots.length === 0 || domainEndMs <= domainStartMs;
const boxHeight = chartBoxHeight(emptyBox ? 0 : plots.length, plotHeight);
```

`ChartTableView` takes `boxHeight` and `empty` (it no longer computes anything), the empty case
renders the chart's own *"no time range to plot"* note and no tables, and `totalHeight` **is**
`boxHeight` rather than a second call that agrees with it.

Guarded three ways, each read off its run: a new ⚠ test (*a DEGENERATE domain with plots present
is the same box in both views*), `10g-CH6` (the table decides emptiness from `plots.length` again
→ 1 red) and `10g-CH7` (the shared test drops the degenerate domain → 2 red, including the
pre-existing `⚠ domainEndMs === domainStartMs renders a placeholder`). `10g-CH2` was re-aimed onto
the threading (`boxHeight={boxHeight}` → `boxHeight={plotHeight}`) because its old subject — a
default plot height at the table's call site — **no longer exists to get wrong**, which is what
one derivation buys. Mutating the export still moves both views together: `10g-CH1` and `10g-CH3`
each redden the `<svg>` test and the table-box test in the same run.

Sizes fixtured on both sides: 38 and 50 (sparkline, both views), 92 and 174 (chart), 72 (empty,
both kinds). The sparkline never had this defect — every one of its branches paints `height`.

### 4. The banner's `height: 21px` at ONE condition and at ZERO

Measured on the live page, one alarm-level condition (GPU 0 only):

| conditions | banner | `.rest` |
|---|---|---|
| 1 | **35.8 px** | **not rendered at all** |
| 2 / 6 / 12 / 21 | 58.8 px | present, client 21 |

So there is **no dead space and no scrollbar** at one condition — `rest.length === 0` renders no
well rather than an empty 21 px box. Stated precisely, because the headline does not: the fixed
height is the *well's*, and a one-condition banner is one line and 23 px shorter than a
two-condition one. That is the safe direction for every §6.1 budget, which is drawn against the
two-line form.

**At zero conditions the banner is absent entirely** — `alarm-banner.tsx:73` returns `null` on a
null lead, and measurement 9's healthy page measures band + gutter at **43 px** against **102 px**
on the two-alarm pages, which is the same fact in pixels.

`role="alert"` is present at 1, 2, 6, 12 and 21 conditions (read from the live DOM, not from the
markup test), with no `aria-live` of its own — unchanged by 10g in either respect.

**The scrolling well does not steal focus order; it adds one stop where the banner already is.**
Live tab order at 1280 with 21 conditions:

```
refresh cadence · chart window · Refresh now · Pause polling · Log out · [banner-rest] ·
GPU 0 sparkline · GPU 1 sparkline · COOLING toggle · CPU toggle · session event log
```

11 focusables with the banner, 10 without, index 5 of 11, and every other control keeps its
relative position.

### 5. The fade is **PROPORTIONAL, not exact** — measured, and the build's claim is wrong in both directions

The build states *"a CSS fade that is exact (it draws iff the well overflows)"* and, in
`tokens.css`, *"the cover sits exactly over the fade and it is invisible … right in all three
positions"*. Measured by rendering each well twice from the **shipped declarations** — as
shipped, and with `background-image: none` — screenshotting both and decoding the PNGs, so the
answer is a per-pixel delta rather than an argument:

| well | nothing hidden | 1 px hidden | ≥ 9 px hidden |
|---|---|---|---|
| `.rest` (banner) | **9 / 255** | 11 / 255 | 34 / 255 |
| `.well` (throttle) | **9 / 255** | 10 / 255 | 31 / 255 |
| `.note` (a row's) | **9 / 255** | 11 / 255 | 34 / 255 |

(`.notes` carries the identical five declarations; its own column-flex fixture collapsed and it is
not separately measured.)

Two mechanisms, both inherent to the technique, neither a mistake in this build:

1. **The cover is itself a gradient**, so where it is half-transparent it half-hides the fade
   beneath it. The residual peaks at a quarter of the fade's alpha mid-band — the 9/255 above.
2. **The cover moves with the content**, one pixel per pixel scrolled, so the affordance reaches
   full strength only once `--well-fade-height` (9 px) is hidden. At one pixel hidden the signal
   is **2/255 stronger** than at none.

What this does and does not break: every real case hides at least a whole message line (≥ 11 px
measured), so the fade IS on when something is hidden. But *"and nothing when it does not"* is
approximated, not met — every bounded well on the page carries a faint bottom edge at all times.
A solid-colour cover was measured too and reached **8/255**, not zero, so this is not a one-token
fix and I did not invent one. The `tokens.css` comment now carries these numbers instead of the
exactness claim, the describe that said *"it is inert when nothing is hidden"* is renamed to what
its body checks (declarations), and the question goes to the owner.

### 6. `… N more` counts ENTRIES — and it can be **wrong**, not merely absent

Constructed and measured at the real 285 px column:

| fixture | box | content | hidden | entries fully visible | marker |
|---|---|---|---|---|---|
| `tight`, ONE 150-char message | 18 | 48 | **30 px (≈ 3 of 4 lines)** | 0 | **nothing** |
| `tight`, two one-line messages | 18 | 29 | 11 px | 1 | `… 1 more` ✓ |
| `roomy`, three one-line messages | 43 | 43 | 0 | 3 | nothing ✓ |
| ⚠ `roomy`, FOUR entries, the first wrapping to four lines | 46 | 90 | **44 px** | **0** | **`… 1 more`** |

So the handoff's question has a sharp answer. The first row is the case the build's silence #1
names, confirmed: the reader sees a fade and no count at all. The last row is the case it does
not: the marker **states a number and the number is wrong** — one, while four entries are
unreadable without scrolling.

It is wrong only ever **low**, and that is structural rather than lucky: every entry occupies at
least one line, so the entries past the line budget are always hidden, and
`max(0, total − LINES_SHOWN[bound])` can never exceed what is hidden. A lower bound, never an
overcount, and never a claim that something is hidden when nothing is.

⚠ One arithmetic note: a message line measures **11 px** in this fixture (12 px base, `.note` at
`0.85em`), not the 13.77 px the build's §3.2 arithmetic uses, so its consequence — *"two whole
messages plus 88 % of a third"* — did not reproduce: three one-line messages fit a `roomy` well
with 3 px to spare. Both numbers are context-dependent; the marker's behaviour above is not.

### 7. The two reverts, each alone — **the builder is right on both halves**

Measurement 11 (`all-sources-explained`, two-alarm banner), one variable at a time, the graded
measurement unmodified:

| tree | 1280 | **1600** | 1920 | band + gutter |
|---|---|---|---|---|
| 10g as shipped | 41 | **6** | 62 | 102 |
| `.rest { margin-top: 7px }` restored, nothing else | 34 | **−1 (OVER)** | 55 | 109 |
| `roomy` back to 60 px, nothing else | 41 | **6** | 62 | 102 |

**The banner's removed margin is the whole of 10f-Q3's 1 px**, and restoring it reproduces 10f's
own `34.6 / −1.0 / 55.0` to the pixel. **`roomy` 60 → 46 buys exactly 0 px** — not approximately:
every slot except STORAGE (218 → 232) and MEMORY (189 → 202 at 1280) is unchanged and the page
total is identical at all three viewports, because SAFETY's 239 governs row 3 either way. The
build reported both of these against itself; both are now measured independently.

### 8. Names against bodies, `toContain`, entropy, deletions

- ⚠ **One test name over-claimed, and its ⚠ mark was covered for the wrong reason.**
  `gpu-panel.test.tsx`'s `⚠ STORAGE's link caption is NOT a well` renders a **GPU card**, which
  has no link line — so no defect in STORAGE could ever redden it. Its mark was covered by
  `10g-CP1` (the well disappearing, the opposite direction), which is HANDOVER §5.2 rule 2
  verbatim. Renamed to what it checks (*the GPU card boxes its throttle line and NOTHING else*),
  and the property it was named for is now a ⚠ test in `storage-network-panel.test.tsx` with
  `10g-CP2` extended to check that file: **CP2 now reddens two tests, one of them about STORAGE.**
- ⚠ **Two module docs still described the retired stopgap as live.** `sparkline.tsx` and
  `stacked-time-series-chart.tsx` both carried a bullet saying the table view is bounded by
  `max-height: var(--table-scroll-max)`, a token 10g deleted. Both rewritten in place.
- **No test was deleted anywhere in the diff** (`git diff` over every `*.test.*`: one renamed
  `styles.test.ts` line and nothing else), and **no added test consumes entropy, a timer or a
  clock** — no `Math.random`, `Date.now`, `setTimeout`, `setInterval` or `new Date(` in any added
  line.
- The eleven-instance `toContain` shape: `lib/tocontain-scope.test.ts` narrows to
  `data-severity="…"` and the bare em dash inside `PanelShell` composites; nothing 10g or this
  phase added is in either class. The one document-wide assertion I added is scoped to the link
  caption's own `<p>` first, with the whole-document check as a *negative* beside it.
- **Pre-existing, NOT 10g's, and recorded rather than fixed:** `styles.test.ts`'s two
  `test.each(cssFiles)` blocks share a ledger prefix — both names begin `⚠ every scrolling box in `
  and the ledger matches the text before the first `%` (HANDOVER §5.2 rule 5). One mutation
  reddening either scores both covered. There is no live hole today (the bounded rule is backed by
  `10f-CS4`/`CS5`, the positioned rule by `10f-CS6`/`10e-CS3`, verified separately in this phase),
  but a rename is a ledger change and belongs to the loop that next touches that file.

---

## What changed in the tree, and why each one

| file | change |
|---|---|
| `components/stacked-time-series-chart.tsx` | `emptyBox`/`boxHeight` computed once above both branches; `ChartTableView` takes `boxHeight` + `empty`; the empty case is the chart's; two doc corrections (§3, §8) |
| `components/stacked-time-series-chart.test.tsx` | ⚠ the degenerate-domain test (§3) |
| `components/sparkline.tsx` | the stale `--table-scroll-max` bullet (§8) |
| `components/tokens.css` | the fade comment now carries the measured numbers instead of "exactly" (§5) |
| `components/panels/panel-notes.test.tsx` | the describe renamed to what it checks (§5) |
| `components/panels/gpu-panel.test.tsx` | the over-claiming test renamed (§8) |
| `components/panels/storage-network-panel.test.tsx` | ⚠ STORAGE's link line is not a well (§8) |
| `pipeline/steps/09-ui-primitives/regressions.py` | `10g-CH2` re-aimed; `10g-CH6`, `10g-CH7` added (§3) — **138 → 140** |
| `pipeline/steps/10-panels-assembly/regressions.py` | `10g-CP2` also checks the STORAGE test (§8) — **264, unchanged** |
| `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` | measurement 12 gains the text/tail/visibility grading and a new record; measurement 13 gains the right selector and both-sided precondition; both print their numbers (§2) — **29 → 30 records** |

⚠ **One process error of my own, recorded plainly.** I ran `git checkout --` on
`components/alarm-banner.module.css` and `components/panels/panel-notes.module.css` while
reverting an experiment. The rule I was following (*"`git checkout --` a stranded mutation"*) is
written for a **clean** tree; on this one it discarded 10g's uncommitted work in both files. Both
were rebuilt from the diff captured earlier in the session and verified three independent ways
before anything else ran: `git diff --stat` line counts identical to the originals (55 and 52),
every CSS-text assertion in `pnpm verify` green, and all six mutation anchors that point into
those two files (`10g-AB6`, `AB7`, `PN5`, `PN6`, `PN7`, `PN8`) found and biting on their own
tests. **The rule needs a qualifier while an item is uncommitted: revert an experiment with the
edit that undoes it, never with `git checkout`.**

---

## Everything that was run, on the tree this describes

| command | result |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 3008 tests, no type errors** (3006 before this phase: +2 assertions, the degenerate-domain box and STORAGE's un-boxed link line) |
| `pipeline/steps/09-ui-primitives/regressions.py` | **exit 0 — 140 mutations** (was 138), 198 red across 140, **146 ⚠ checked**, every one reddened. Zero `ANCHOR NOT FOUND`, zero `AMBIGUOUS`, zero `DID NOT BITE` |
| `pipeline/steps/10-panels-assembly/regressions.py` | **exit 0 — 264 mutations**, 310 red across 264, **279 ⚠ checked** (was 278 — the new STORAGE mark), every one reddened |
| `measure-breakpoints.mjs` | **30 passed · 0 failed · 0 blocked · 30 total, exit 0** (was 29 — measurement 12's new record) |
| `measure-arrangements.mjs` + `check-density.mjs --fixture box` | **ALL PASS**, spare 283.6 px at 1920, `cooling chart paints 174 px`, and `baseline+tables` identical to `baseline` at all three viewports |
| `git status` | only the 10g files, plus this note and the new STORAGE test. No `.env`, `next-env.d.ts` unmodified, nothing staged, nothing committed |

⚠ **The first run of step 9 exited 1** on two anchors my own fix moved (`09-T6`, `Q2-TV2` — the
empty-domain guard left the chart branch's `if`, and the table's `.map` gained the shared empty
guard). Both were re-aimed and step 9 was re-run alone; step 10 owns neither file, and its run was
already on the final tree. `09-T6` is **wider** for it: the comparison it weakens is now the one
both branches read, so the same character reaches the table view too.

---

## For the owner — what this phase found that no ruling covers

1. **The continuation fade is proportional, not conditional** (§5). *"and nothing when it does
   not"* is met to within 9/255; a well with nothing hidden carries a faint bottom edge at all
   times, and one pixel of hidden content is 2/255 away from none. Fully on once 9 px is hidden,
   which every real case is. A solid cover does not reach zero either.
2. **`… N more` can name a wrong number, not only fall silent** (§6): measured at `… 1 more` with
   four entries unreadable. It is always a lower bound. §6.1 asks for the marker *"whenever
   `scrollHeight > clientHeight`"*, which hook-free `components/` cannot see.
3. **§6.4's fixed height is the WELL's, not the banner's** (§4): one condition is 35.8 px and two
   are 58.8. Nothing budgeted is at risk — the short one is the safe direction — but "one height
   at any count" is true only for two and up.
