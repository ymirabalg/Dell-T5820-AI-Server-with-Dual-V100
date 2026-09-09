# 10e — the density build (RECONCILIATION). **§6.1's promise is measured TRUE on the healthy page.**

**Written 2026-09-09 by the reconcile phase.** Nothing was committed. `SPEC.md` and `MOCK.html` are
untouched. The three browser scripts were run **by this phase** — the first session other than the
second build agent to run any of them — and their numbers are reproduced below verbatim.

---

## 0. The headline, before the table

| | |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 102 files, 2933 tests, no type errors** (was 2892) |
| `check-density.mjs` (`--fixture box`, no `--oq`) | **ALL PASS at 1280×1024, 1600×1024 and 1920×1080.** Spare **263.2 / 227.6 / 283.6 px**; with §6.4's banner pinned (band 43 → 108.7) overflow **0** at all three |
| `measure-breakpoints.mjs` | **10 pass · 2 fail · 0 blocked · 12 total.** Measurements 0–8 pass; **9 passes at 1920×1080** and fails at 1280×1024 (**27 px**) and 1600×1024 (**49 px**) — under the **dev-Mac** fixture only, where all seven non-GPU collectors have filed a long-path `errors[]` message. That is the owner question below, not a density miss |
| **10e-A1, re-measured on the REAL page** | at 200 log entries, `documentElement.scrollHeight` is **5189** without the fix and **1024** (= the viewport) with it; **1024 at 500 entries** too. `.panel { position: relative }` — the shipped F1 edit — measures **5189 either way** |
| nine `regressions.py` harnesses | run serially in one foreground call — table in §7. Eight exit 0; `02` exits 1 on the three **pre-existing** orphans (`02-R20`/`R30`/`R31`) and nothing else |
| mutation ids | **1061 across the nine harnesses, zero cross-harness collisions, zero within-file duplicates** (re-derived by AST, not counted by grep) |
| tree | no stranded mutation; `next-env.d.ts` byte-identical; nothing listening on :39173/:39174/:39175; no `.env` |

**§6.1's promise, stated plainly.** On the healthy page — `--fixture box`, the state §6.1's own
acceptance sentence names — the page **fits at all three viewports, with and without the alarm
banner**, with 227–284 px to spare. It is **measured TRUE**. Under the dev-Mac fixture, where every
Linux-only collector has failed, it is measured **FALSE by 27 / 49 px at 1280 and 1600** and true at
1920. Which of those two the promise is about is `10e-A10`/silence #5, and it is the owner's.

---

## 1. The adjudication table — all 15, plus two findings of this phase

| # | Verdict | What was done |
|---|---|---|
| **10e-A1** — F1's fix does not work; the page scrolls from ~15 log entries | ⚠ **ACCEPTED — re-measured on the real page, and FIXED** | The finding is exactly right, mechanism included. `position: relative` moved onto the three **clipping** boxes (`.scroll`, and `.tableView` in both chart primitives). Measured 5189 → 1024 at 200 entries, 1024 at 500. New CSS invariant in `styles.test.ts` + a `.scroll` CSS-text test; mutations `10e-CS2`/`CS3` (step 9), `10e-SE4`/`SE5` (step 10) |
| **10e-A2** — `Strip`'s `nowrap` re-creates F5 on the GPU card | **ACCEPTED — fixed** | `.v` takes `status-row.module.css`'s `.value` declarations verbatim (`min-width: 0; white-space: normal; overflow-wrap: anywhere`) — F5's own fix, one primitive over. ⚠ test in `strip.test.tsx`; mutation `10e-ST3` |
| **10e-A3** — invariant 1's three chan inks are unasserted, and `10e-test.md` says the opposite | **ACCEPTED — fixed** | `chanValueClassFor` reads the CLASS `chanValueFor` discards; the three branches are fixtured and asserted mutually distinct. Mutations `10e-CO2` (zero branch) and `10e-CO3` (unknown branch), one rail each |
| **10e-A4** — OQ-4 has no guard at the call site | **ACCEPTED — fixed, and a stale test name went with it** | The test that should have caught it was named *"chip renders the explicit no-band state"* — the opposite of OQ-4's ruling — and was satisfied by the `<section>`'s own `data-severity`. Now an exact occurrence count (1, not 2); mutation `10e-SE3` |
| **10e-A5** — seven prop wirings asserted by nothing | **ACCEPTED — all seven fixed** | ⚠ tests at each call site + `10e-GP6` (`code`), `10e-GP7` / `10e-MP1` / `10e-SN1` (the four `tickPercent`s), `10e-GP8` (the `cap` caption), `10e-CP1`/`CP4` (CPU's promoted time axis, both directions), `10e-CO4` (COOLING's `md` mode pill) |
| **10e-A6** — six one-line CSS reverts, all green | ⚠ **ACCEPTED IN PART — three closed, three DEFERRED with a named grader** | `Q` is superseded by A1's fix and is now `10e-CS2`. `R` (`height`, not `max-height`) and `T` (`.scroll` box-sizing) are closed by the new `.scroll` CSS-text test + `10e-SE4`/`SE5`. `S` (`.track` box-sizing), `W` (12px root) and `X` (`.grid` gap 9) are **deferred**: their only honest check is a browser measurement, a pixel-literal assertion would be a change-detector, and the grader that sees them — `check-density.mjs` — was **run by this phase and is ALL PASS** (§3). Owner: the loop that makes that run repeatable (step 11/12) |
| **10e-A7** — S-B's watch tone unguarded on both surfaces | **ACCEPTED — fixed on all THREE** | Both tests the finding names were called *"watch-toned"* and asserted only the wording — §0.4's shape again. SAFETY (`10e-SP2`), STORAGE's inline one-off (`10e-SN3`), and COOLING's `.staleCaption`, which the finding names as a third unasserted copy (`10e-CO9`) |
| **10e-A8** — `aria-label` on a role-less `<div>`; COOLING loses the words `fan 5` | **ACCEPTED — fixed on both halves, and on a third the finding surfaced** | `Hero` renders `role="group"` beside `aria-label` (`group`, not `img`, which would replace the numeral). COOLING gains a **visible** `fan 5` at 0 px and drops the attribute. GPU and CPU heroes are renamed from the CHART's window sentence to the point reading they are. MEMORY's call site, which the finding notes was covered by nothing, is now covered too. Mutations `10e-H5`/`H6` (step 9), `10e-CO8`, `10e-GP9`, `10e-CP3`, `10e-MP2` |
| **10e-A9** — §2.11's throttle budget is 1.8× under at 1280 | ⚠ **ACCEPTED as a measurement; NOT RULED — owner question** | Recorded in HANDOVER §8 with the numbers. It is a **degraded-state** budget: `0x4` alone is not notable, so the healthy page — the one §6.1's acceptance sentence is about — carries no throttle line at all, and §3's ALL PASS is unaffected |
| **10e-A10** — the `errors[]` wrapping is not a Mac-only artefact | ⚠ **ACCEPTED as a measurement; NOT RULED — owner question** | The DKMS message is this box's documented failure mode and costs 65.6 px against 14.2 budgeted. Recorded with build silence #5 in HANDOVER §8, together with measurement 9's 27/49 px, which this phase reproduced |
| **10e-A11** — `0x4` paints as a green `✓ NORMAL` pill | ⚠ **ACCEPTED as an observation; the SPEC IS SILENT, so recorded, not chosen** (invariant 7) | §6.2 forbids styling the normal cap **as a warning**, which it is not; §6.3 bands the *metric* `GPU throttle`, never a bit, and the per-reason `severity` is `lib/throttle.ts`'s own construction. Nothing in either says how a `normal` bit is presented once another bit makes the line notable. Recorded with the internal tension the finding names (a `normal` `Meter` is deliberately grey) |
| **10e-A12** — COOLING's chan table has a dead fourth column | **DEFERRED with an owner** | It is not accidental dead code: 10e §2.0 and §2.2 both specify the fourth `minmax(0, 1fr)` track and its content — *"S-B stale age or nothing"*. No loop has yet rendered a per-channel stale age, so it is a specified slot with no caller. It costs 0 px and 4 empty spans; deleting it contradicts the builder spec's own anatomy, and adding a caller is a §6.5 rendering decision outside 10e. Owner: the loop that renders S-B on channels 1–4 |
| **10e-A13** — STORAGE reads the FIRST `proc-net-dev` entry under a ⚠ comment saying LAST | **ACCEPTED — fixed** | `.find` → `.findLast`, matching every sibling in the loop. A two-entry fixture now pins it in both directions; mutation `10e-SN2` |
| **10e-A14** — `10e-GP5` bites on an arithmetic accident | **ACCEPTED — fixed** | The single both-mounts test is split in two, each scoped to its own wrapper by `data-role` and each checked against **its own** rails (0/38 for the 1280 mount, 4/40 for the promoted one, whose `timeLabels` reserve padT 4 / padB 10). Autoscaling lands exactly on each pair, so `10e-GP4` and `10e-GP5` both still bite — for the property they name |
| **10e-A15** — four carried-forward items | **ACCEPTED as accurate; all four DEFERRED with owners** | None is 10e's: each is byte-identical to `HEAD` or predates the loop. All four are written into HANDOVER §8 with what the code does today — the GPU *retired*-card branch rendering no `errors[]`, the power pair printed twice, the doubled screen-reader band announcement, and `aria-pressed` beside a label that names the next action |
| **10e-R1** (this phase) — `codeOnly` has no regex-literal state, and a regex with an odd number of `"` silently disables comment-stripping for the rest of the file | ⚠ **ACCEPTED — measured, contained in the files this loop touched, DEFERRED with an owner** | §5 |
| **10e-R2** (this phase) — the stacked chart's SECOND `sr-only` caption is A1's mechanism in a second place | **ACCEPTED — fixed with A1** | Its `<caption>` sits below the first table's ~361 rows, so *"the caption is at the top"* is true of the sparkline's table view and false of this one |

**Counts, over the seventeen rows: 10 ACCEPTED-and-fixed** (A1, A2, A3, A4, A5, A7, A8, A13, A14,
R2) **· 1 ACCEPTED-IN-PART** (A6 — three of six closed, three deferred) **· 4 ACCEPTED-AS-RECORDED,
deliberately not ruled** (A9, A10, A11, A15 — owner questions, per the handoff and invariant 7)
**· 2 DEFERRED with an owner** (A12, R1) **· 0 REJECTED.**

⚠ **Zero rejections is the shape a rubber-stamp makes** (ANCHOR §8 rule 2), so it is worth saying
why there are none: the adversarial phase measured every finding it raised, in a real browser or by
applying the mutation and running the suite, and this phase re-derived the two that decide the
loop — A1's mechanism (§2) and the density numbers (§3) — independently rather than inheriting
them. The findings this phase did **not** simply act on are A9/A10/A11/A15 and A12, and each is
recorded above with the reason it is the owner's rather than mine.

---

## 2. A1 — re-measured on the real page, and the finding is exactly right

The adversarial measured standalone repros. This phase measured **the app**, at 1280×1024, by
cloning the session event log's own rendered `<li>` and reading the document:

| case | entries | `documentElement.scrollHeight` | panel height | `.scroll` scrollHeight |
|---|---|---|---|---|
| **as shipped (fixed)** | 1 / 5 / 15 / 20 / 50 / 200 | **1024 every time** | 129.8 | 86 → 4368 |
| **as shipped (fixed)** | **500** (`MAX_EVENTS`) | **1024** | 129.8 | 10921 |
| control — `.scroll` static, `.panel` relative (**= 10e's shipped F1 edit, alone**) | 200 | **5189** | 129.8 | 4368 |
| control — both static (**pre-10e**) | 200 | **5189** | 129.8 | 4368 |
| control — `.scroll` relative, `.panel` static | 200 | **1024** | 129.8 | 4368 |

Three things fall out, and each is now written into the stylesheet that carries it:

1. **`.panel { position: relative }` is worth exactly zero.** 5189 with it and 5189 without it, to
   the pixel. The comment claiming it *"closes the `.sr-only` clipping leak"* was wrong about the
   mechanism: `top`/`left` are `auto`, so the span is placed at its **static** position either way,
   and a scroll container clips an absolutely-positioned descendant only when it sits in that
   descendant's **containing-block chain** — which a `position: static` box never does. `.panel` is
   `overflow: visible`, so the scrollable overflow propagates straight past it.
2. **`position` on the clipping box is the whole fix**, and it holds to `MAX_EVENTS`.
3. **The panel's own height was never the symptom.** 129.8 px at one entry and at five hundred,
   which is why `check-density.mjs`'s per-slot check and 10e §2.8's *"133.8 px whether the log holds
   one entry or five hundred"* stayed true while §6.1's promise failed.

`.panel { position: relative }` is **kept** — it is §2.0's `.panel` rule and it keeps a stray
absolutely-positioned descendant in the panel's own coordinate space — but its comment now says
what it does and does not do, with the measurement beside it.

**The second victim was real and is fixed too (10e-R2).** The adversarial cleared both chart table
views on the ground that *"their only `.sr-only` is the `<caption>`, which sits at the top"*. True
of `sparkline.module.css`'s one-table view. **False of `stacked-time-series-chart.module.css`**,
whose `.tableView` holds one `<table>` **per plot**: the second table's caption sits below the first
table's ~361 rows, so its static position is thousands of px down, and `.tableView` was
`position: static` with `max-height: 40vh; overflow-y: auto` — the identical shape. Both are
positioned now.

**The guard is a rule, not an assertion about one file.** `components/styles.test.ts` gains: *every
rule that sets `overflow`/`overflow-x`/`overflow-y` to `auto` or `scroll` must also be positioned*,
over every stylesheet under `components/`, with a non-vacuity test naming the three bounded panes
this app actually has. `overflow: hidden` is deliberately excluded — `.sr-only`, `.subtitle`,
`.chanNote` and the meter track all clip for ellipsis or shape reasons and are not panes with
content behind them. ⚠ `styles.test.ts` is therefore **no longer byte-identical to HEAD** — it is
**strengthened**, not weakened: both existing rules are untouched and one general rule is added.

---

## 3. The three browser measurements, run by this phase

### 3.1 `check-density.mjs` — ALL PASS, and it reproduces the build's numbers exactly

`measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json`, then
`check-density.mjs` with **no `--oq` flag**:

| slot | 1280 target | 1280 measured | 1600/1920 target | 1600/1920 measured |
|---|---|---|---|---|
| `gpu0` / `gpu1` | 164.5 | **164.5** (0.0 %) | 176.0 | **176.0** (0.0 %) |
| `cpu` (OQ-7, both traces) | 216.1 | **216.1** (0.0 %) | 240.1 | **240.1** (0.0 %) |
| `memory` | 138.5 | 137.8 (−0.5 %) | 138.5 | 137.8 (−0.5 %) |
| `safety` | 160.0 | 159.4 (−0.4 %) | 160.0 | 159.4 (−0.4 %) |
| `storage-and-network` | 144.8 | 144.1 (−0.5 %) | 144.8 | 144.1 (−0.5 %) |
| `serving` | 104.4 | 103.8 (−0.6 %) | 104.4 | 103.8 (−0.6 %) |
| `session-event-log` | 133.8 | 129.8 (−3.0 %) | 133.8 | 129.8 (−3.0 %) |
| `cooling` (stretched, rows 2–3) | 384.5 | **384.5** (0.0 %) | 408.5 | **408.5** (0.0 %) |

Page fit and spare, healthy, no banner:

| viewport | band | grid | content bottom | **spare** | with §6.4's banner pinned |
|---|---|---|---|---|---|
| 1280 × 1024 | 43 | 717.8 | 760.8 | **263.2 px** | band 108.7 → **overflow 0** |
| 1600 × 1024 | 43 | 753.4 | 796.4 | **227.6 px** | band 108.7 → **overflow 0** |
| 1920 × 1080 | 43 | 753.4 | 796.4 | **283.6 px** | band 108.7 → **overflow 0** |

Painted chart boxes from `--anatomy`: COOLING `[174]` everywhere; `gpu0` `[38,0]` below 1600 and
`[0,50]` at ≥1600; `cpu` `[38,38,0,0]` below 1600 and `[0,0,50,50]` at ≥1600. **`ALL PASS`, exit 0.**

Two things worth stating because the adversarial could not: every figure in `10e-build.md` §1 is
**reproduced to the digit by an independent session**, and this phase's own edits (COOLING's visible
`fan 5` key, `Hero`'s `role`, the four `position: relative` lines) cost **0 px** — the per-slot
numbers are unchanged from the build's.

### 3.2 `measure-breakpoints.mjs` — 10 pass, 2 fail, and the two failures are the dev-Mac fixture

```
PASS     0. every §6.1 slot is present in the DOM (the anti-vacuity net for 1, 5 and 6)
PASS     7. >=1600px: GPU 0 shows the promoted chart, not the sparkline
PASS     8. 1280-1599px (the design target): GPU 0 shows the sparkline, not the promoted chart
PASS     3. 1280px: 4-column layout (the design target)
PASS     1. >=1280px: COOLING spans rows 2-3 in columns 1-2
PASS     2. 1279px side of the 900/1280 breakpoint: 2-column layout
PASS     5. 900px side: 2-column layout, COOLING full width
PASS     4. 899px side of the 900px breakpoint: 1-column layout
PASS     6. <900px: panel priority order
PASS     9. 1920x1080: §6.1's no-scroll promise — the grid does not grow past the viewport
FAIL     9. 1280x1024: overflowPx 27
FAIL     9. 1600x1024: overflowPx 49

10 passed, 2 failed, 0 blocked by this environment, 12 total.
```

**Identical to the build's run, to the pixel** — 27 and 49 — so A1's fix changed measurement 9 by
nothing, which is expected: this fixture's log holds a handful of entries, and the leak needs ~15.
`measure-breakpoints.mjs` fabricates only `gpus[]` and takes the rest of `/api/telemetry` as this
**development Mac** returns it, so all seven non-GPU sources have filed a long absolute-path
`errors[]` message. The same build, same tree, under `--fixture box` fits at all three with
227–284 px spare (§3.1). **Measurement 9 fails under the Mac fixture only**, and that is exactly
10e-A10 / silence #5 — recorded in HANDOVER §8, not ruled here.

### 3.3 The 200-entry log measurement

§2's table. Harness: a scratch `playwright-core` script in this session's scratchpad, not added to
the repo; it starts its own `next dev` on **:39175**, logs in with an ephemeral credential pair,
clones the log's own rendered `<li>`, and restores `next-env.d.ts`. Nothing was left running.

---

## 4. What changed in the tree

### Source (12 files)

| file | change |
|---|---|
| `components/panels/session-event-log-panel.module.css` | **F1's actual fix** — `position: relative` on `.scroll`, with the measurement in the comment |
| `components/sparkline.module.css` · `components/stacked-time-series-chart.module.css` | the same line on each `.tableView` (10e-R2) |
| `components/panel-shell.module.css` | `.panel { position: relative }` kept; its comment corrected — it does **not** close F1, and the measurement says so |
| `components/strip.module.css` · `components/strip.tsx` | A2 — `.v` gets F5's three declarations; the module doc corrected (it claimed `nowrap` protected a value, which is what broke it) |
| `components/hero.tsx` | A8 — `role="group"` beside `aria-label`, both or neither |
| `components/panels/cooling-panel.tsx` · `.module.css` | A8 — a visible `.heroKey` `fan 5` (0 px), `ariaLabel` dropped from the Hero |
| `components/panels/gpu-panel.tsx` · `components/panels/cpu-panel.tsx` | A8 — the heroes take a point-reading name (`GPU 0 temperature`, `CPU package temperature`); the charts keep the window sentence |
| `components/panels/storage-network-panel.tsx` | A13 — `.find` → `.findLast` for `proc-net-dev` |

### Tests (11 files)

`styles.test.ts` (the new scroll-container rule), `strip.test.tsx`, `hero.test.tsx`,
`session-event-log-panel.test.tsx`, `cooling-panel.test.tsx`, `gpu-panel.test.tsx`,
`cpu-panel.test.tsx`, `memory-panel.test.tsx`, `storage-network-panel.test.tsx`,
`safety-panel.test.tsx`, `status-row.test.tsx` (regex form only, §5).

**Every change is an assertion added or a `toContain` replaced by an exact count, with three
exceptions worth stating rather than hiding:**

1. **A14's split is looser in one direction and tighter in another, and that is the fix.** The old
   single test bounded *both* mounts by `y < 38`; the promoted mount's honest lower rail is 40, so
   its upper bound is now 40 (**looser by 2 px**) and it gains a lower bound of 4 (**tighter than
   the old 0**). The old 38 bit on the promoted mount by 2 px of accident, which is the finding.
2. **`cooling-panel.test.tsx`'s `heroContaining` became `coolingHero`** — it anchored on the
   `aria-label` A8 removed, and now anchors on `Hero`'s own root class. Same element, same scope.
3. **`status-row.test.tsx`'s one change is the regex FORM only** (§5) — the same assertion, written
   so it cannot desynchronise `codeOnly`.

⚠ **Five of the six mechanical guards are byte-identical to HEAD** — `purity.test.ts`,
`dangling-css-class.test.ts`, `tocontain-scope.test.ts`, `unit-suffix.test.ts`,
`cross-harness-ledger.test.ts`. The sixth, `styles.test.ts`, gained a rule and lost nothing.

### Harnesses (2 files, +26 mutations)

| harness | added |
|---|---|
| `09-ui-primitives` (122 → **127**) | `10e-CS2`/`CS3` (the two clipping boxes), `10e-ST3` (Strip's wrap), `10e-H5`/`H6` (the hero's role, both directions) |
| `10-panels-assembly` (191 → **212**) | `10e-SE3`/`SE4`/`SE5`, `10e-CO2`/`CO3`/`CO4`/`CO8`/`CO9`, `10e-SP2`, `10e-SN1`/`SN2`/`SN3`, `10e-GP6`/`GP7`/`GP8`/`GP9`, `10e-MP1`/`MP2`, `10e-CP1`/`CP3`/`CP4` |

---

## 5. 10e-R1 — a scanner defect this phase tripped, measured, and did not fix

**`lib/source-text.ts`'s `codeOnly` has no regex-literal state.** It is a character state machine
over `'`, `"`, `` ` ``, `//` and `/* */`, and a regular-expression literal is none of those — so
`/class="_noteWatch[^"]*">…/`, which contains **three** `"` characters, leaves it in string mode.
Everything after it, to the next `"` anywhere in the file, stops being stripped: **comments read as
live code**.

It bit immediately and in the *safe* direction. A new ⚠ test in `safety-panel.test.tsx` desynced the
scanner, and `lib/tocontain-scope.test.ts` then flagged a `data-severity="watch"` literal **quoted
inside a comment** — 10c-2's own explanation of a fix it had made — as a live whole-document
`toContain`. A false positive is recoverable; the same defect in the other direction hides a real
one.

**Measured, over every test file in the tree** (a scratch reimplementation of `codeOnly` reporting
each line that begins inside `'`/`"` mode):

| file | lines the stripper is desynced over |
|---|---|
| `components/sparkline.test.tsx` | 672 |
| `lib/tocontain-scope.test.ts` — the guard itself | 333 |
| `components/stacked-time-series-chart.test.tsx` | 294 |
| `lib/guardrails.test.ts` | 188 |
| `components/meter.test.tsx` | 154 |
| ten more files | 2 – 62 each |

Six guards read source through `codeOnly`: `tocontain-scope`, `dangling-css-class`, `unit-suffix`,
`guardrails`, `client/guardrails` and `cross-harness-ledger`.

**Not fixed here, deliberately.** The fix is small and well-defined — a `'` or `"` may not open a
string that does not close before the next newline, which is true of every JS string literal and
false of every regex-embedded quote — but it changes what **six** guards can see, on a tree that has
never run them with the desync closed. That is a change whose failures are the point, and it belongs
to a loop that can act on them, not to a reconciliation whose job is to land 10e. **Owner: the next
loop that touches `lib/source-text.ts`.** Recorded in HANDOVER §8 and §0.9.

**What this phase did instead:** every regex it added to a file `codeOnly` reads is quote-balanced
or built with `new RegExp` over a single-quoted string, with the reason written beside it — and the
three pre-existing offenders in the files it touched (`gpu-panel.test.tsx`'s `_figureValue`,
`status-row.test.tsx`'s `_noteWatch`, the three `class="_tick` counters) are balanced too. It adds
no new desync.

---

## 6. The owner questions — recorded, not ruled

All are written into `HANDOVER.md` §8 with what the code does today.

| # | Question | What stands today |
|---|---|---|
| **10e-Q1** (A10 + build silence #5) | **Is §6.1's no-scroll promise conditioned on healthy telemetry?** §6.1's acceptance sentence says *"fabricated healthy telemetry"*, and under that fixture the page fits at all three with 227–284 px spare. `measure-breakpoints.mjs` measurement 9 grades an **all-collectors-failed** page and is 27 / 49 px over at 1280 / 1600. If the promise is unconditional, nothing bounds an `errors[]` block: §2.11 budgets **14.2 px** for a source's message, and this box's own documented DKMS message (152 characters) measures **65.6 px** in a 285 px column | Nothing caps `PanelNotes` or a `StatusRow`'s `detail`; the text is the collector's own (S-H). Sub-question, if the promise is unconditional: truncation, a scroll box, or a per-panel budget? |
| **10e-Q2** (A9) | **§2.11's throttle budget is 1.8× under at the design width.** A notable mask costs a measured **44.0 px** at 285 px (the 1280 GPU column) against 24.5 budgeted, and 17.0 at ≥1600; a third, unknown bit takes it to 71 px and overflows the caption horizontally below ~245 px | The line renders only when `decodeThrottleMask(...).notable`, so the healthy page carries none of it and §3's ALL PASS is untouched |
| **10e-Q3** (A11) | **How is `0x4` presented once another bit makes the throttle line notable?** §6.2 says the normal power cap *"is not news and must not be styled as a warning"* — it is not; it is styled as a **verdict**, a green `✓` pill asserting the routine 250 W cap is healthy. §6.3 bands the metric `GPU throttle`, never a bit | One `Chip md code` per reason, banded by that reason's own `r.severity` (`lib/throttle.ts:163`). 10e decided in the same loop that a `normal` **`Meter`** is deliberately grey, so this is the one place a `normal` band is painted its status colour |
| **10e-Q4** (A15) | **The GPU *retired*-card branch renders no `errors[]` at all** — `gpus: []` with an `nvidia-smi` entry present renders `card not enumerated` and nothing else, while the `gpus: null` branch two lines below maps `errorsForPanel` into `.takeoverNote` | Byte-identical to `HEAD`; 10b's S-E residue, not 10e's |
| **10e-Q5** (A15) | **The GPU card prints the power pair twice** — `Figure` (`249.8 W` + `cap 250.0 W`) and the power `Meter`'s head (`249.8 W / 250.0 W`) — four numerals for two facts, against §6.5's "one fact, stated once" | The mock's form, recorded as such in `gpu-panel.tsx` |
| **10e-Q6** (A15) | **A severity-bearing row announces its band twice** to a screen reader (`Chip sm`'s `sr-only` + `Chip md`'s) | Recorded by the test phase; unchanged |
| **10e-Q7** (A15) | **`aria-pressed` beside a label that names the NEXT action.** `header.tsx:182-184` gives `aria-pressed={paused}` *and* `aria-label={paused ? 'Resume polling' : 'Pause polling'}`, so a paused control announces *"Resume polling, toggle button, pressed"*. `ChartViewToggle` has the same shape | Inherited: `aria-pressed` predates 10e and 10e only moved the name into the attribute |
| **10e-Q8** (A12) | **Delete COOLING's dead fourth chan column, or leave the slot §2.2 specifies?** All four call sites pass `note: null` | Four empty spans and a `1fr` track; 0 px |
| **10e-Q9** (A6) | **Nothing runs the density grader.** `check-density.mjs` is the only tool that can see the six one-line CSS reverts, and it is not wired to any command a future loop must run | Run by hand, ALL PASS, this phase |
| **10e-Q10** (R1) | **Fix `codeOnly`'s regex blind spot?** §5 | Six guards read through it; 16 test files currently desync it |
| **10e-Q11** (test phase) | **SERVING's row severity is `worstSeverity(unit, health)` and the pill's label is `unitState`**, so an instance that is `active` with `/health` `unreachable` paints the word **`active`** alarm-red | Unchanged; recorded by the test phase, repeated here so it is not lost |
| **10e-Q12** (test phase) | **Delete the now-dead `Row` primitive?** `<Row` appears only in `row.test.tsx`; `row.module.css` is a stylesheet no page loads, and 10e added a pill branch and two mutations for callers that do not exist | Unchanged |
| **10e-Q13** (test phase) | **Re-aim `02-R20`/`R30`/`R31` so step 2's ledger runs again?** They sit before the ledger's `return 1`, so step 2's ⚠ check has been dark since `formatUptime` gained `prefix` — `lib/format.test.ts` has no second owner, so its marks (including 10e's seven new ones) are checked by nothing that runs | HANDOVER §1 says they are not this loop's; left untouched. The test phase ran the ledger diagnostically with only those three excluded: **261 red tests across 57 mutations, 22 ⚠ checked, all reddened** — the coverage is there; nothing is checking it |

---

## 7. The nine harnesses, `pnpm verify`, and the tree

Run **serially, in one foreground call**, nothing else running (ANCHOR §9 — no `pgrep`, no wait
loop). ⚠ **Stated exactly, because the numbers differ by one:** that call ran step 10 at **211**
mutations and exit 0; this phase then added the last fix of the loop (A8's third caller, MEMORY's
hero name — `10e-MP2`, the one the adversarial measured as green) and **re-ran step 10 alone**, at
**212**, exit 0. `memory-panel.test.tsx` belongs to step 10's `LEDGER_FILES` and to no other, so
step 10 is the only harness that owed a re-run (checked by grepping every
`pipeline/steps/*/regressions.py` for that file). `pnpm verify` was run cold **after** that re-run.
The table below is the state of the tree as it stands:

| harness | mutations | ledger | result |
|---|---|---|---|
| `02-format-severity` | 60 | not printed (the run returns at the moved anchors) | ⚠ **exit 1 — the three PRE-EXISTING orphans only:** `02-R20`/`R30`/`R31`, `ANCHOR NOT FOUND in lib/format.ts`. No other failure of any kind |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | **127** (was 122) | 186 red across 127; **138 ⚠ checked** | **exit 0** |
| `10-panels-assembly` | **212** (was 191) | 253 red across 212; **232 ⚠ checked** | **exit 0** |

`pnpm verify` (cold, after the harnesses): **exit 0 — 102 test files, 2933 tests, no type errors.**
Baseline at the start of this phase was 2892; every one of the 41 is an assertion added.

`git status` after the run: **88 entries**, every one an `M` or `??` belonging to this loop —
no stranded mutation. `next-env.d.ts` byte-identical. Nothing listening on :39173/:39174/:39175. No
`.env` written. Only the headless Chrome instances the three scripts launched were closed; the
user's own browser was not touched.

---

## 8. What a reviewer should check first

1. **§2's control table.** It is the whole of A1, and it is four numbers: 5189 / 5189 / 1024 / 1024.
   Re-run the scratch script or reproduce it by hand — the shipped F1 edit is worth zero.
2. **The three deferrals in A6, and A12.** They are the rows with no diff behind them.
3. **`styles.test.ts` is the one guard file that changed.** Read the diff: two existing rules
   untouched, one general rule added, one non-vacuity test naming the three panes.
4. **The owner questions in §6 are questions, not proposals.** Four findings (A9, A10, A11, A15)
   were deliberately not acted on, per the handoff and invariant 7.
