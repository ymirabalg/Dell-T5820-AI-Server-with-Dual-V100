# 10f — the four rulings (RECONCILIATION). **§6.1 holds on the healthy page and on the real box's degraded page, measured. Three unbounded terms remain and none of them is 10f's.**

**Written 2026-09-09 by the reconcile phase.** Nothing was committed. `SPEC.md` and `MOCK.html` are
untouched. No guard was weakened. The browser measurements below were **run by this phase**, on the
tree this file describes; A2 and A3 were re-measured from a fixture of this phase's own writing
rather than inherited from the adversarial's numbers.

---

## 0. The headline, before the table

| | |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 2967 tests, no type errors** (2960 before this phase; +7, every one an assertion added) |
| `measure-breakpoints.mjs` | **16 passed · 0 failed · 0 blocked · 16 total, exit 0.** Measurement 9 (all seven non-GPU collectors failed, dev-Mac): spare **140 / 104 / 160 px**. Measurement 10 (the real box's DKMS failure): precondition **PASS**, then **157 / 122 / 178 px** |
| `check-density.mjs --fixture box` (no `--oq`) | **ALL PASS**, spare **263.2 / 227.6 / 283.6 px**, banner pinned overflow 0 — identical to 10e's and to 10f's build/test runs, to the digit |
| nine `regressions.py` harnesses | **all nine run serially in ONE foreground call, all nine exit 0** — 1093 mutations, zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, every ⚠ mark reddened. §6 |
| mutation ids | **1093 across the nine, zero cross-harness collisions, and every anchor occurs EXACTLY ONCE in the file it names** — re-derived by importing each `regressions.py`, never counted by `grep` |
| ⚠ **A3, re-measured by this phase** | on a page where **every one of §3.7's eighteen sources has filed the 150-character DKMS message** while the readings themselves stay healthy, with §6.4's ordinary **two-alarm** banner pinned: **1280 fits with 34.6 px · 1600 is OVER by 1 px · 1920 fits with 55.0 px.** Two independent runs, identical to the digit |
| ⚠ **A2, re-measured by this phase** | the compound case — every non-GPU collector stops answering while the GPU cards keep alarming, so fourteen conditions stand: **1280 over by 40 px · 1600 over by 75 px · 1920 fits with 7.5 px** |

**What §6.1's promise does and does not now cover, stated plainly.**

- **Healthy page: holds**, 263.2 / 227.6 / 283.6 px of spare, banner pinned overflow 0 (measured).
- **All-collectors-failed page: holds** on both graded fixtures — the dev Mac's (measurement 9)
  and the real box's own DKMS failure (measurement 10) — with 104–178 px of spare (measured).
  That is 10f's ruling working: before it, those pages missed the fold by 27 / 49 px, and by
  92 / 115 with the banner pinned.
- ⚠ **A page where every source is explained AND every reading is present: 1 px over at
  1600×1024** (this phase, twice). That is not the *"all collectors failed"* page — a failed
  collector blanks its readings, which makes its panel **shorter** — it is the arithmetic worst
  case, and the build's own §1.4 predicted it: *"1600 × 1024 … −1.1"*. The prediction was right.
- ⚠ **Three terms are unbounded and none is 10f's**: a chart's **table view** (five reachable at
  once, 40vh each, one click and no telemetry needed), §6.4's **banner** (no cap in
  `lib/client/banner.ts`, no `max-height` in its stylesheet), and `10e-Q2`'s **throttle line**.
  All three are §6.1/§6.2/§6.4 wording and are recorded as owner questions, not chosen
  (invariant 7).

---

## 1. The adjudication — all ten findings

| # | Verdict | What was done |
|---|---|---|
| **10f-A1** — opening one chart's table view breaks §6.1 on a HEALTHY page; build silence #5 ("`10e-Q2` is the only unbounded term left") is false | ⚠ **ACCEPTED as a measurement; NOT RULED — owner question `10f-Q1`**, and the false claim is **corrected in place** | The finding is right and the claim it refutes is 10f's own: `10f-build.md` silence #5 now carries the correction, naming all three unbounded terms. The subject itself is **not 10f's** — `--table-scroll-max: 40vh` and both `.tableView` rules are byte-identical to `HEAD` (Q2's) — and closing it means choosing between §6.2's own carve-out (*"the table view scrolls within its own container … §6.1's promise governs the PAGE, not a component"*) and §6.1's promise. That is spec wording. §2 |
| **10f-A2** — the compound worst case is over at all three viewports, and §6.4's banner is the term nobody bounded | ⚠ **ACCEPTED IN PART — re-measured by this phase, and one of its inputs corrected.** The banner half is owner question `10f-Q2` | Over at 1280 (**+40**) and 1600 (**+75**); at 1920 this phase's fixture **fits with 7.5 px**, where the adversarial measured +15 over. The two runs reconcile exactly (§3.2): its fixture also carried an `nvidia-smi` error, worth one **+23 px** GPU well on row 1, and a differently-worded banner. ⚠ **Corrected: its normalisation to "the build's own six-alarm assumption" used a constant that is wrong.** Measured, a six-alarm banner is **65.7 px at all three viewports — the same as a two-alarm one**, not the build's 90.5 / 72.7. The banner grows with its TEXT, not with the count. §3 |
| **10f-A3** — 1.3 px of spare at 1600×1024 on the ordinary all-sources-explained page | ⚠ **ACCEPTED — re-measured, and it is 2.3 px WORSE than reported: the page is 1 px OVER, not 1.3 px under. NOT RULED — owner question `10f-Q3`** | Two independent runs of this phase's own fixture, identical to the digit: overflow **0 / 1 / 0**, spare **34.6 / −1.0 / 55.0**. The measurement also confirms the build's own arithmetic to 0.1 px — grid growth **+162.9 at 1280 and +163.0 at 1600** against its predicted **163.0** — so what is over is not a mis-estimate; it is the budget. Fixing it means widening nothing and capping nothing (both §6.1/§6.4 wording), so it goes to the owner with the number. §3.1 |
| **10f-A4** — six one-line reverts of the 10f diff keep `pnpm verify` green at 101 files / 2960 | **ACCEPTED — all six closed**, one `10f-` mutation each, behind a new ⚠ test (R1, R4) or a new assertion inside the existing ⚠ CSS-text test that owns that rule (R2, R5, R6, R7) | R1 `10f-SR6` (the MUTED note well loses `role`/`tabIndex`/`aria-label`), R2 `10f-PN7` and R5 `10f-SR7` (`overflow-wrap: anywhere`, the declaration that keeps a 600-character path inside the well), R6 `10f-PN8` (the sunken ground), R7 `10f-PN9` (the padding `box-sizing: border-box` is about), R4 `10f-PN6` (the React key, which no rendered-markup assertion can see — the test reads the KEYS). §4.1 |
| ↳ A4's rider — `measure-breakpoints.mjs` has **zero** mutation coverage and sits outside `pnpm verify` | **ACCEPTED as accurate — DEFERRED with a named owner** (`10f-Q6`) | True and unchanged: the file is in no harness's `LEDGER_FILES`, so `&&` → `||` in measurement 10's precondition is green in every command this project runs. The grader would have to be a harness that spawns a browser per mutation (~2 min each), which is `10e-Q9`'s problem — *"nothing runs the density grader"* — one file over. Owner: the loop that makes the browser measurements repeatable (step 11/12) |
| **10f-A5** — the test phase's ≈277.8 px worst case over-counts: two rows can be stale-and-explained, not seven | **ACCEPTED — corrected in place in `10f-test.md` §6**, and independently CONFIRMED by measurement | The mechanism is right (SAFETY's other three checks call TOTAL severity functions and never carry absent; SERVING's rows are retired, not staled). ⚠ The adversarial's own headline figure — *"moves the estimate from ≈277.8 to ≈216"* — is **not reproducible from the constants it states**; the corrected sum, written out term by term, is **≈182.1**. This phase's A2 run then measured SAFETY at **258.5 px**, which is exactly the corrected row-3 term (`159.4 + 3 × 20.0 + 39.13`). §4.2 |
| **10f-A6** — nine wells share one accessible name, and two different subjects share another | **ACCEPTED — fixed**, and the property is now guarded where it actually lives | `PanelNotes` takes a required `subject` (nine call sites, nine names); `StatusRow` takes a required `panel`, and its two well slots take two different words. ⚠ The page-wide property — *no two wells announce the same name* — is asserted in `app/dashboard-shell.test.tsx`, because no primitive can see nine call sites at once; backed by `10f-PN5`, `10f-SR8` and `10f-SN4`. Measured after the fix: **20 `role="group"` elements on the A3 page and 18 on the compound page, zero duplicates**. §4.3 |
| **10f-A7** — the bound holds; the readability it buys was never quantified, and on the wall panel it is zero | ⚠ **ACCEPTED as a measurement; NOT RULED — owner question `10f-Q4`** | 7.7 % of CPU's four-source explanation is visible in an 18 px well, and nothing is drawn to say text continues (`offsetHeight − clientHeight = 0` on every well). This is the ruling's own cost, not a defect in executing it, and both available answers — a taller `tight`, or an affordance — are §6.1/§6.5 wording. **Deliberately not widened**: the build's arithmetic shows +8 px on `roomy` alone takes STORAGE past SAFETY and grows the page |
| **10f-A8** — `Chip band={false}` is not constrained to `size="md"`, and on an `sm` chip it renders nothing at all | **ACCEPTED — fixed**, and it is 10f's own API | `band` is 10f/Q3's prop, and an `sm` chip's entire visible and announced content **is** the band, so `band={false}` there is an empty 11 px box that says nothing. The component now bands an `sm` chip unconditionally, with both directions asserted (an `sm` chip ignores it; an `md` chip still honours it) and `10f-C5` behind them. §4.4 |
| **10f-A9** — measurement 10's precondition is a containment check, not an exclusivity one | **ACCEPTED as accurate — no change, with the reason** | The check's job is *"the fixture took"*, and containment is exactly that. Making it exclusive would assert `panelsForSource`'s mapping, which is `lib/client/observations.test.ts`'s property under step 8's harness — a second derivation of a guarded fact is what HANDOVER §0.8 tells this project not to build. The three limits the finding names (evaluated once at the first viewport; `textContent` sees hidden text; `dell-smm` reaches two panels and the check names one) are now written into the script beside the assertion, so the next reader knows what the PASS means. §4.5 |
| **10f-A10** — one message is three lines in COOLING and one line in STORAGE, and §6.5 is silent | ⚠ **ACCEPTED as an observation; the SPEC IS SILENT, so recorded, not chosen** (invariant 7) — owner question `10f-Q5` | Measured: COOLING's well `32 / 32` (nothing hidden) against STORAGE's link well `18 / 59` (69 % hidden), for one message each. The per-panel `bound` is what the ruling asked for (*"the height per panel is a builder decision measured against §2.11's budgets"*), and the arithmetic behind each choice is recorded and correct; what no document states is the reader-facing consequence, which is A7's question in a second place |

**Counts, over the ten: 4 ACCEPTED-and-fixed** (A4, A5, A6, A8) **· 1 ACCEPTED-IN-PART with one of
its inputs corrected** (A2) **· 4 ACCEPTED-as-measured/observed and deliberately NOT ruled** (A1,
A3, A7, A10 — owner questions) **· 1 ACCEPTED-as-accurate with no change and a stated reason**
(A9) **· 1 DEFERRED with an owner** (A4's rider) **· 0 REJECTED.**

⚠ **Zero rejections is the shape a rubber-stamp makes** (ANCHOR §8 rule 2), so here is what this
phase actually did instead of rejecting: it **re-measured the two findings that decide the loop**
from a fixture of its own writing, and both came back *different from the numbers reported* — A3
worse by 2.3 px (over, not under) and A2's 1920 column better by 22.5 px (fits, not over). It also
found one of A2's inputs to be wrong (the six-alarm banner constant) and one of A5's headline
figures to be underivable from its own constants. Those corrections are the audit; a finding whose
mechanism is right and whose number is wrong is corrected, not rejected.

---

## 2. A1 — what the table views actually break, and why it is the owner's

Not re-measured by this phase (the parent asked for A2 and A3), and it does not need to be: the
mechanism is in three lines of source, all of them **byte-identical to `HEAD`** and none of them
10f's.

- `components/tokens.css` — `--table-scroll-max: 40vh`.
- `components/sparkline.module.css` and `components/stacked-time-series-chart.module.css` — both
  `.tableView` rules read that token.
- Five table views are reachable on one page (GPU 0, GPU 1, COOLING, and CPU's two), so the page's
  own bound is **200vh** on a 100vh promise.

The adversarial measured `+851 / +851 / +862 px` with all of them open on a **healthy** page, and
**+371.1 px from GPU 0's alone** against 263.2 px of healthy spare at 1280 — one click, no
telemetry, under two minutes of samples to fill the cap.

**Why this is not a build defect.** §6.2's own 2026-09-08 ruling says the table view *"scrolls
within its own container — `max-height` plus `overflow-y`"*, and §6.1's 2026-09-08 clarification
says *"the promise is about the PAGE, not about every component … §6.2's table view is ruled the
same"*. A component that scrolls inside its own box is exactly what both paragraphs allow. What
neither paragraph says is what happens when the component's own box is **40 % of the viewport** and
five of them can be open at once — the container scrolls, and the grid grows anyway. That is a
collision between two spec sentences, and the owner writes spec sentences (`10f-Q1`).

---

## 3. A2 and A3, re-measured by this phase

**Harness.** A scratch `playwright-core` script in this session's scratchpad, built on
`measure-breakpoints.mjs`'s skeleton: its own `next dev` on **:39174** with an ephemeral credential
pair, system Chrome over CDP, `/api/telemetry` rewritten **in the browser** (invariant 2 — a
response is rewritten, never a request built). Nothing was added to the repo, no browser was left
open, and `next-env.d.ts` was restored by the script.

⚠ **One fixture bug of this phase's own, recorded because it produced a plausible wrong answer.**
The first A2 fixture set `host: null`, `cooling: null`, `storage: null`. `lib/client/wire.ts`'s
`hostOf` returns `undefined` for a non-record, so the **whole snapshot failed validation**: the page
went `stale`, every reading rendered an em dash, and the measurement reported healthy slot heights
and `overflow 0` — a clean, quotable, entirely wrong result. §4's nullability is **per field, not
per collection**. The corrected fixture nulls every field inside each object, and the numbers below
are that one's.

### 3.1 A3 — every source explained, readings intact, the two-alarm banner pinned

Fixture: the healthy box (`CLAUDE.md`'s own figures), each of §3.7's **eighteen** sources carrying
the real 150-character DKMS message, plus two instance-tagged `llama-server` entries, with two GPU
temperatures in the alarm band held past §6.4's 10 s debounce.

| viewport | band | banner | content bottom | overflow | **spare** |
|---|---|---|---|---|---|
| 1280 × 1024 | 108.7 | 65.7 | 989.4 | 0 | **34.6** |
| **1600 × 1024** | 108.7 | 65.7 | **1025** | **1** | **−1.0** |
| 1920 × 1080 | 108.7 | 65.7 | 1025 | 0 | **55.0** |

Control, same page with no banner: spare **100.3 / 64.7 / 120.7** — so the two-alarm banner costs
exactly **65.7 px** at every viewport, which is `check-density.mjs`'s own 43 → 108.7 band figure.

Slot heights at 1600: `gpu0 199 · gpu1 199 · cooling 511.5 · cpu 263.1 · memory 188.1 · safety
239.4 · storage 232.1 · serving 166.8 · log 129.8`.

**Two things this settles.**

1. **The build's 163 px is right.** Grid growth over the healthy page with the same banner is
   **+162.9 at 1280 and +163.0 at 1600**, against §1.4's predicted 163.0. Nothing in the estimate
   was wrong; the budget at 1600 is 162.0, and 163.0 does not fit in it. The build's own table said
   **−1.1** and this is that 1.1 px, measured as a 1 px overflow.
2. **"1.3 px is not a margin" is right and understated.** Two independent runs put this page 1 px
   on the wrong side of the fold at the tightest viewport.

⚠ **What this fixture is, precisely.** It is not the *all-collectors-failed* page (measurements 9
and 10 grade that, and both pass with 104–178 px to spare) — a collector that fails **blanks its
readings**, which makes its panel shorter. This one keeps every reading AND adds every explanation,
which is the arithmetic worst case rather than a routine state. It is reachable — a source can file
an error while the figures beside it are fine (`statvfs` files one entry per mount; a `llama-env`
parse problem does not blank a GPU) — but eighteen at once is a bound-prober, not a Tuesday.

### 3.2 A2 — the compound case, in the order it actually happens

Stage 1: nineteen alarm-band readings, held past the debounce. Stage 2, **without a reload**: every
non-GPU collector stops answering (every field null) while the GPU cards keep alarming, so the
conditions that were alarming go **stale and keep their band** (S-B) and stay in the banner. That
sequence is what makes the compound case reachable at all: collectors fail *after* the alarm that
made someone look.

| viewport | banner | alarms standing | content bottom | overflow | spare |
|---|---|---|---|---|---|
| 1280 × 1024 | 146.2 | 14 | 1063.8 | **+40** | −39.8 |
| 1600 × 1024 | 146.2 | 14 | 1099.3 | **+75** | −75.3 |
| 1920 × 1080 | 119.4 | 14 | 1072.5 | 0 | **+7.5** |

Slots at 1600: `gpu0 176 · gpu1 176 · cooling 528.3 · cpu 260.8 · memory 185.8 · safety 258.5 ·
storage 251.3 · serving 166.8 · log 129.8`.

**This reconciles with the adversarial's +63 / +71 / +15 exactly**, which is worth stating because
the two runs used different fixtures: its slot list at 1600 is `cooling 528.3 · cpu 260.8 · memory
185.8 · safety 258.5 · storage 251.3 · serving 166.8 · log 129.8` — **identical to this phase's,
to the tenth of a pixel** — and differs only in `gpu 199` against this phase's `176`. That 23 px is
one GPU card's tight well: its fixture filed an `nvidia-smi` error and this one did not. Add 23 px
on row 1 and this phase's 1920 column goes from +7.5 spare to **−15.5**, which is its +15. The
remaining difference at 1600 is the banner's own text (14 alarms at 146.2 here, 12 at 119.4 there).

**Three consequences.**

- The compound page is over at the two tight viewports either way, and at 1920 it turns on a
  single well. It is not a comfortable case at any size.
- ⚠ **The row model reproduces a third time.** `cooling 528.3 = cpu 260.8 + 9 + safety 258.5`, and
  `safety 258.5` is exactly A5's corrected term. Rows 2 and 3 size independently; the build's
  correction of its own first model is confirmed by a fixture written to test something else.
- **SERVING measured 166.8**, the build's own figure for the term it could not measure on either
  graded fixture (`103.8 + 2 × 20.0 + 23`). §1.4's row-4 term of **+37.0** is now measured.

### 3.3 The banner is unbounded, and it does not grow with the alarm COUNT

`lib/client/banner.ts:88` returns `rest: mapped.slice(1)` with no cap, `AlarmBanner` renders every
item, and `components/alarm-banner.module.css` has no `max-height`. Measured on the healthy page,
each held past the debounce:

| alarm-band readings fabricated | banner, 1280 | 1600 | 1920 | page spare, 1280 / 1600 / 1920 |
|---|---|---|---|---|
| 2 | 65.7 | 65.7 | 65.7 | 197.5 / 162.0 / 218.0 |
| **6** | **65.7** | **65.7** | **65.7** | 197.5 / 162.0 / 218.0 |
| 12 | 92.5 | 92.5 | 92.5 | 170.6 / 135.1 / 191.1 |
| 21 | 173.1 | 146.2 | 119.4 | 90.1 / 81.4 / 164.3 |

⚠ **Two corrections fall out of this table, and they cut in opposite directions.**

- **The build's six-alarm column is wrong in the pessimistic direction.** §1.4 assumed 90.5 px at
  1280 and 63.7 / 72.7 at ≥1600 (carried from 10e §2.11 and never re-measured); six alarms measure
  **65.7 everywhere**, the same as two, because six chips still wrap to the same two lines. So the
  budget is **197.5 / 162.0 / 218.0** for anything up to six alarms, and the build's separate
  six-alarm margin column can be deleted rather than corrected. A2's normalisation used the wrong
  constant and its **+7 / +25 px** figures do not stand.
- **The banner's height is a function of its TEXT, not its count.** The adversarial measured 12
  alarms at 146.2 px where this phase measures 92.5 — different conditions, different label
  lengths, same count. Anyone budgeting against "N alarms" is budgeting against the wrong variable,
  which is the deeper half of A2's point and the reason `10f-Q2` is worth asking.

---

## 4. What changed in the tree

### 4.1 A4 — six reverts, six guards

| revert | now caught by | mutation |
|---|---|---|
| R1 `status-row.tsx` — the MUTED `note` well loses `role`/`tabIndex`/`aria-label` | ⚠ *a MUTED note is a well too: named, reachable, and named DIFFERENTLY from detail* | `10f-SR6` |
| R2 `panel-notes.module.css` `.note` loses `overflow-wrap: anywhere` | the `.notes` CSS-text test, extended | `10f-PN7` |
| R5 `status-row.module.css` `.note` loses `overflow-wrap: anywhere` | the `.note` CSS-text test, extended | `10f-SR7` |
| R6 `.notes` loses `background: var(--surface-sunken)` | same test — the ground is the only cue that a box IS a box | `10f-PN8` |
| R7 `.notes` `padding: 2px 5px` → `padding: 0` | same test — a non-zero padding is what `box-sizing: border-box` is about (18 = 4 + 14) | `10f-PN9` |
| R4 `panel-notes.tsx` — `key` back to `e.source` alone | ⚠ *two entries from ONE source get DISTINCT React keys* — the test reads the **keys**, because a duplicate key is invisible in static markup | `10f-PN6` |

**Every one of the ten mutations this phase added reddened a real TEST, not a type error** — read
off the run's own `red=` lines: `10f-PN5` **4**, `10f-SR8` **5**, `10f-SN4` **2**, `10f-C5` **1**,
`10f-SR6` **1**, `10f-SR7` **1**, `10f-PN6` / `PN7` / `PN8` / `PN9` **1** each. That distinction
matters here: three of them touch a parameter whose only use they remove, and a mutation that fails
`tsc` before a test runs would have looked identical in the exit code and told the ledger nothing.

⚠ **R4's guard could not be written as a markup assertion**, and the existing test that looks like
its guard (*"two entries with the same source and different messages both render"*) passes under the
revert: `renderToStaticMarkup` renders both children regardless, and React's recovery from a
duplicate key — reusing the first element — only shows up in a reconciling client. The new test
calls the component as a function and reads `element.props.children[].key`.

### 4.2 A5 — the correction, and what confirms it

`10f-test.md` §6's table is corrected **in place**, marked as this phase's, with the mechanism and
the measurement that support it. The corrected page term is **≈182.1 px** (row 1 +23.0, row 2
+23.0, row 3 +99.1, row 4 +37.0), against the section's ≈277.8 and the adversarial's underivable
≈216. §3.2's compound run measures `safety 258.5` and `serving 166.8` — both exactly the corrected
terms — so this is not arithmetic against arithmetic.

### 4.3 A6 — nine wells, nine names

- `PanelNotes` gains a **required** `subject`; the name is `` `${subject} messages` ``. The nine
  call sites pass copy already on the screen: their `PanelShell` title (`cooling`, `GPU 0`, `GPU 1`,
  `cpu`, `memory`, `serving`, `storage & network`) and, for STORAGE's second well, the `Caption`
  label it sits under (`link`).
- `StatusRow` gains a **required** `panel`; the two well slots take two different words —
  `` `${panel} ${label} explanation` `` for `detail` and `` `${panel} ${label} note` `` for a muted
  `note`. That closes both halves the finding names: COOLING's and SAFETY's `fan service` rows no
  longer announce identically, and a row carrying both slots no longer puts two identically-named
  groups side by side.
- **Required, not defaulted, in both cases.** A default lets the next call site re-create the
  collision with nothing to notice it; a required prop makes the compiler the guard at every call
  site, which is what nine call sites need.
- The page-wide property lives in `app/dashboard-shell.test.tsx`: with every well on the page it
  gathers every `role="group"` accessible name and asserts **no duplicates**, plus a positive test
  naming the eleven the page must announce. Backed by `10f-PN5` (the name goes back to a constant),
  `10f-SR8` (a row's well drops the panel) and `10f-SN4` (two wells in one panel take one subject).
- ⚠ `10f-PN5` is a **two-edit** mutation, deliberately: dropping `${subject}` alone leaves the
  parameter unread and `noUnusedParameters` fails the run before a test executes, and a mutation
  that does not compile proves nothing about the tests.
- Measured after the fix, in the browser: **20 named groups on the A3 page, 18 on the compound
  page, zero duplicates on either.**

⚠ **Not fixed, and recorded instead:** both GPU cards still render the same
`errorsForPanel(snapshot, 'gpu')` list, so one `nvidia-smi` message occupies two wells. That is
`panelsForSource`'s deliberate design (*"there is no `errors[]` entry it could ever return for one
card and not the other"*) and predates 10f. The names now differ (`GPU 0 messages` /
`GPU 1 messages`), so a reader can at least tell which card they are in.

⚠ **One thing this fix surfaced, not 10f's:** `PanelShell` renders a bare `<section>` with no
accessible name, which ARIA maps to `generic` — so a panel supplies its contents no context at all
for a screen reader, and every group name has to carry its own. Recorded as an observation for the
loop that owns `PanelShell`; changing it is a §9 accessibility decision, not this loop's.

### 4.4 A8 — an `sm` chip is always banded

`Chip` bands an `sm` chip regardless of `band`, because an `sm` chip's entire visible content is the
glyph and its entire announced content is the `sr-only` word: `band={false}` there renders an empty
11 px box with no `data-severity`, no glyph and no announced word — a severity indicator that says
nothing, in the four places `sm` is used. Both directions are asserted (an `sm` chip ignores
`band={false}`; an `md` chip still honours it, which is 10f/Q3's whole point) and `10f-C5` is behind
them. No caller does this today — `band` is passed at exactly one site in the tree — which is
precisely why nothing would have caught it.

### 4.5 A9 — the limits of measurement 10's precondition, written down

No behaviour change. The three limits the finding names are now recorded beside the assertion in
`measure-breakpoints.mjs`: the check is containment rather than exclusivity (and the exclusive form
would duplicate `lib/client/observations.test.ts`'s property); it is evaluated once, at the first
viewport, before `recordFit` changes the viewport three times; and `textContent` is satisfied by
text inside a `display: none` subtree or scrolled out of a well, so *"the fixture took"* is strictly
weaker than *"the fixture is on screen"*.

### 4.6 Files changed by this phase

| file | change |
|---|---|
| `components/panels/panel-notes.tsx` | A6 — required `subject`; the name is `` `${subject} messages` ``; module doc |
| `components/panels/status-row.tsx` | A6 — required `panel`; two words for the two well slots; module doc |
| `components/panels/cpu-panel.tsx` · `memory-panel.tsx` · `gpu-panel.tsx` · `serving-panel.tsx` · `storage-network-panel.tsx` · `cooling-panel.tsx` · `safety-panel.tsx` | A6 — `subject=` at nine `PanelNotes` call sites, `panel=` at six `StatusRow` call sites |
| `components/chip.tsx` | A8 — an `sm` chip is banded unconditionally; module doc |
| `components/panels/panel-notes.test.tsx` | A6's primitive half, A4/R4's key test, A4/R2+R6+R7 in the CSS-text test |
| `components/panels/status-row.test.tsx` | A4/R1's muted-note well, A6's cross-panel name test, A4/R5 in the CSS-text test |
| `components/chip.test.tsx` | A8, both directions |
| `app/dashboard-shell.test.tsx` | A6's page-wide property — no two wells announce the same name — plus the positive list |
| `pipeline/steps/09-ui-primitives/regressions.py` | `10f-C5` (A8), and `09-C2`/`10f-C3`/`10f-C4` re-aimed onto `banded` → **129** |
| `pipeline/steps/10-panels-assembly/regressions.py` | nine new mutations (`10f-PN5`…`PN9`, `SR6`…`SR8`, `SN4`) and **fourteen anchors re-aimed** for the two new props → **242** |
| `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` | A9 — the precondition's limits recorded beside it (comment only) |
| `pipeline/steps/10-panels-assembly/10f-build.md` | silence #5 corrected in place (A1) |
| `pipeline/steps/10-panels-assembly/10f-test.md` | §6's over-count corrected in place (A5) |

---

## 5. The owner questions — recorded, not ruled

All are written into `HANDOVER.md` §8 with what the code does today. **None was chosen**
(invariant 7), and none of the three unbounded terms was widened or capped by this phase.

| # | Question | What stands today |
|---|---|---|
| **10f-Q1** (A1) | **A chart's table view is bounded per component at 40vh, and five are reachable at once.** Opening them measures **+851 / +851 / +862 px** on a HEALTHY page; GPU 0's alone is **+371.1** against 263.2 px of spare. §6.2 rules the table view *"scrolls within its own container"* and §6.1 says the promise governs the page, not a component — both were written before anyone measured five containers at 40 % of the viewport each. Options named by the adversarial: one table open at a time; a table bounded to its panel's body; or the promise conceded while a table is open | `--table-scroll-max: 40vh` (`components/tokens.css`), read by `sparkline.module.css` and `stacked-time-series-chart.module.css`. No page-level coordination: any number can be open |
| **10f-Q2** (A2) | **§6.4's banner is unbounded, and it is the constant every §6.1 budget is drawn against.** Measured 65.7 px at 2 AND 6 alarms, 92.5 at 12, and 173.1 / 146.2 / 119.4 at 21 — and it grows with the TEXT, not the count. Options: cap the rows shown (`+N more`), a fixed-height scrolling banner, or concede | `lib/client/banner.ts:88` returns `rest: mapped.slice(1)` with no cap; `AlarmBanner` renders every item; `alarm-banner.module.css` has no `max-height` |
| **10f-Q3** (A3) | **1 px OVER at 1600×1024** on the all-sources-explained page with the ordinary two-alarm banner (this phase, twice). Is that acceptable margin, and if not, which term gives? The three candidates are all wording: the well heights (§6.1), the banner (§6.4), and SERVING's +37 px | Nothing is capped further. The build's arithmetic is confirmed to 0.1 px, so this is a budget question, not an estimation error |
| **10f-Q4** (A7) | **The `tight` well shows 7.7 % of CPU's four-source explanation**, and a wall panel has no pointer to scroll it and no affordance to say text continues (`offsetHeight − clientHeight = 0` on every well). Is a one-line well the right shape, or should `tight` be two lines? | 18 px `tight` / 60 px `roomy` / 14 px on a row. Raising `roomy` by one line (+8) takes STORAGE past SAFETY and grows the page, so this is not free |
| **10f-Q5** (A10) | **How much of a message an operator can read depends on which panel's grid row has slack.** COOLING's one message is three lines (`32 / 32`, nothing hidden); STORAGE's link message is one line (`18 / 59`, 69 % hidden). §6.5 does not state a rule for that | Per-panel `bound`, exactly as the ruling permits, with the arithmetic recorded |
| **10f-Q6** (A4's rider) | **`measure-breakpoints.mjs` has zero mutation coverage** and is outside `pnpm verify`: `&&` → `||` in measurement 10's precondition is green in every command this project runs. Same shape as `10e-Q9` | In no harness's `LEDGER_FILES`. A mutation harness over it would spawn a browser per mutation |
| **10e-Q2** (carried, sharpened) | **The throttle line remains unbounded**: a notable mask costs **+44 px per GPU card** at 1280 and Q3's neutral chip does not change its height. Added to §1.4's corrected worst case it exceeds the budget at every viewport with a banner pinned | Renders only when `decodeThrottleMask(...).notable`, so the healthy page carries none of it |

---

## 6. The nine harnesses, `pnpm verify`, and the tree

All nine were run **serially, in one foreground command**, nothing else running (ANCHOR §9 — no
`pgrep`, no wait loop). Each figure below is that harness's own printed
`Red-test ledger` / `All N regressions failed their check` line, never carried forward.

| harness | mutations | red-test ledger | result |
|---|---:|---|---|
| `02-format-severity` | 60 | 272 red across 60; 22 ⚠ checked | **exit 0** |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | **129** (was 128: +`10f-C5`) | 185 red across 129; **136 ⚠ checked** | **exit 0** |
| `10-panels-assembly` | **242** (was 233: +9) | 280 red across 242; **257 ⚠ checked** | **exit 0** |

**1093 mutation ids, zero cross-harness collisions, zero within-file duplicates, and every one of
the 1093 anchors occurs exactly once in the file it names** — re-derived by importing each
`regressions.py`, after the run as well as before it. Zero `ANCHOR NOT FOUND`, zero
`ANCHOR AMBIGUOUS`, zero `DID NOT BITE` in any of the nine.

⚠ **Steps 9 and 10 are the only two that mutate or grade any file this phase edited**, established
by grepping every `pipeline/steps/*/regressions.py` for each edited file — and they run **last** in
the serial order, after every edit had landed, so both graded the final tree. Nothing this phase
touched is in steps 2–8's `LEDGER_FILES` or in any of their mutations.

**`pnpm verify` (cold, run after the harnesses, never alongside one): exit 0 — 101 test files,
2967 tests, no type errors.** 101/2960 at the start of this phase; the seven added are two in
`panel-notes.test.tsx`, two in `status-row.test.tsx`, one in `chip.test.tsx` and two in
`app/dashboard-shell.test.tsx`.

**Browser measurements, all run by this phase, none alongside a harness:**

| script | result |
|---|---|
| `measure-breakpoints.mjs` | **16 passed · 0 failed · 0 blocked · 16 total, exit 0.** Measurement 9 spare **140 / 104 / 160**; measurement 10 precondition PASS then **157 / 122 / 178** |
| `measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json` → `check-density.mjs` (no `--oq`) | **ALL PASS**, every slot within ±10 % of target (four at exactly 0.0 %), spare **263.2 / 227.6 / 283.6**, banner pinned overflow **0** at all three |
| this phase's A2/A3 harness (scratchpad, :39174) | §3. Run twice; the A3 numbers are identical to the digit across both runs |

**No guard weakened.** `lib/purity.test.ts`, `lib/tocontain-scope.test.ts`,
`lib/dangling-css-class.test.ts`, `lib/unit-suffix.test.ts` and `lib/cross-harness-ledger.test.ts`
are **byte-identical to `HEAD`** (`git diff --quiet`). `components/styles.test.ts` differs, and that
diff is the BUILD's — Q12's re-aimed `flex-basis` non-vacuity anchor and the new directory-wide
"a scrolling box must be a bounded box" rule; **this phase did not touch it.** Every assertion this
phase added is an addition to an existing test or a new test; no threshold moved and no assertion
was loosened.

**Tree hygiene.** `git status` is 31 modified/deleted tracked files and 8 untracked `.md` — every
one an intended change of 10f's four phases; **no stranded mutation**. `git diff --shortstat`:
31 files, 1789 insertions, 241 deletions. `next-env.d.ts`, `SPEC.md`, `MOCK.html` and `AGENTS.md`
are **byte-identical to `HEAD`** (`git diff --quiet`). Nothing is listening on :39173 / :39174 /
:39175; every browser this phase launched was closed by the script that launched it and every
`next dev` it started was killed by process group. **Nothing committed.**

⚠ **Three `next-server (v16.3.4)` processes remain, aged 3 d, 3 d and 2 d** — the same three the
adversarial phase recorded (one more than `10f-test.md`'s two). None is this phase's (mine would be
minutes old), none is on a measurement port, and the rule is to close only what you launch. Left
running, and recorded again so the next reader who counts them is not surprised.

---

## 7. What a reviewer should check first

1. **§3.1's A3 table and §3.2's A2 table** — they are this phase's own measurements and they are
   what changed the picture: the build's 163 px is confirmed to 0.1 px, and the page is 1 px over
   at 1600 with an ordinary banner. Both were run twice.
2. **§3.3's banner table**, which corrects a constant three documents have now used.
3. **The four rows in §1 that were NOT acted on** (A1, A3, A7, A10) and the one deferral (A4's
   rider). Each names why it is the owner's rather than this phase's, and each is in HANDOVER §8
   with its number.
4. **`app/dashboard-shell.test.tsx`'s new duplicate-name test** — it is the only assertion in the
   tree that can see all nine `PanelNotes` call sites at once, and A6 is the finding that shows why
   a per-primitive test could not.
5. **The fourteen re-aimed anchors** in step 10's harness: every one is the same property on the
   same line, moved only by the two new props, and every anchor in all nine harnesses was checked
   to occur exactly once in the file it names.
