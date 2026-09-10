# 10g — the last four unbounded terms (RECONCILIATION). **The four terms are bounded and measured. The ledger that certified them was certifying nothing, and §6.1 is still breakable — which is why the owner has ruled the GRID bounded.**

**Written 2026-09-10 by the reconcile phase.** Nothing was committed. `SPEC.md` and `MOCK.html` are
untouched. No guard was weakened — five were added and two harness renames widened what the ledger
can distinguish; the one behaviour change (`marked_tests()` now FAILS on an unmatchable ledger key
instead of warning) is strictly stronger than what it replaced. Every browser number below was
measured **by this phase**, on the tree this file describes, and the one new measurement was probed
by breaking it before it was believed.

⚠ **Three of the adversarial's ten findings were NOT adjudicated here, deliberately: the owner
already ruled on `10g-A1`, `10g-A6` and the `model` term on 2026-09-10, and all three are 10h's
work.** This phase's job on them was to record them accurately with their measured numbers so 10h
inherits facts rather than claims — §5 below, and `HANDOVER.md` §8. Nothing was implemented or
half-implemented for any of the three.

---

## 0. The headline, before the table

| | |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 3010 tests, no type errors** (3008 before this phase; +2, both new ⚠ tests behind A3's unguarded reverts) |
| `measure-breakpoints.mjs` | **30 passed · 0 failed · 0 blocked · 30 total, exit 0.** m9 spare **140 / 104 / 160**; m10 **164 / 129 / 185**; m11 (all sources explained) **41 / 6 / 62**; m12 banner **58.8 px at 2 / 6 / 12 / 21** at all three viewports; m13 grid **717.8 / 753.4 / 753.4** open and closed alike |
| `measure-arrangements.mjs` + `check-density.mjs` (no `--oq`) | **ALL PASS**, healthy spare **263.2 / 227.6 / 283.6 px**, banner pinned overflow 0, cooling chart 174 px — identical to 10f's and to 10g's build and test runs, to the digit |
| nine `regressions.py` harnesses | **all nine run serially in ONE call, all nine exit 0** — **1130 mutations** (60 · 73 · 94 · 130 · 63 · 128 · 174 · **140** · **268**), zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, zero unmatchable ledger keys, every ⚠ mark reddened. §7.1 |
| mutation ids | **1130 across the nine** (was 1126), **zero cross-harness collisions** — re-derived by importing each `regressions.py`, never counted by `grep` |
| ⚠ **A2, re-measured by this phase, and FIXED** | the throttle **caption** measured **41.2 / 41.2 / 17.0 px** at 1280 / 1600 / 1920 on a page whose mask really is notable — the well was one line and the caption was two. One declaration (`flex: 1 1 auto` → `flex: 1 1 0`) makes it **17.0 / 17.0 / 17.0**; the GPU card goes **211 / 222 / 198 → 186 / 198 / 198** and page spare **158 / 123 / 203 → 182 / 147 / 203**. §2 |
| ⚠ **A7, the priority** | **three ⚠ tests carried a ledger key too short to match — one of them the single character `⚠`, a substring of all 279 ⚠ FAIL lines step 10 can emit.** All three were 10g's own acceptance tests. Renamed, and the harness now **exits 1** on an unmatchable key instead of printing a warning both earlier phases read past. Swept all nine harnesses and all **1064** marks: **those three were the only ones**. §3 |

**What §6.1's promise does and does not now cover, stated plainly — this is the sentence the loop
turns on.**

- **Every fixture this project grades: holds.** Healthy 263.2 / 227.6 / 283.6 · all-collectors-failed
  140 / 104 / 160 · the real box's DKMS failure 164 / 129 / 185 · all-sources-explained 41 / 6 / 62.
  All measured by this phase, all exit 0.
- ⚠ **Ordinary telemetry that no fixture carries: BREAKS it**, and four independent ways were
  measured (10g-A1). **The owner has ruled: the grid itself is bounded (10h).** §5.
- ⚠ **The four terms 10g was asked to bound ARE bounded**, and that is not undone by the above — a
  table view is the chart's own box (m13, identical open and closed), the banner is 58.8 px at
  every count (m12), the throttle line is a 17 px well inside a caption that is now also 17 px
  (§2), and `roomy` is 46 px. What the owner's ruling changes is their JOB: they stop being what
  holds the promise up and become a legibility choice, which is what `SPEC.md` §6.1 now says.

---

## 1. The adjudication — all ten findings

| # | Verdict | What was done |
|---|---|---|
| **10g-A1** — §6.1's promise fails on the graded page under ordinary telemetry, four independent ways | ⚠ **NOT THIS PHASE'S — ALREADY RULED BY THE OWNER, 2026-09-10, and assigned to 10h.** Recorded with its measured numbers, not implemented and not half-implemented | `SPEC.md` §6.1 carries the ruling (the grid itself is bounded; head pinned, body scrolls). This phase's only work on it: the numbers are transcribed into `HANDOVER.md` §8 and §5 below, the one claim of the build's that A1 refutes is corrected in place (`10g-build.md` §6 silence 9 named three terms and the list was not the list), and the ⚠ fixture fact 10h needs most — **every browser fixture in this project hard-codes `throttleReasons: '0x…04'`, which is not `notable`** — is confirmed by this phase's own probe: the graded page renders **no throttle line at all**. §5 |
| **10g-A2** — the throttle ruling bounds the WELL and not the LINE; measured A/B it buys 2 / 3 / 0 px, not 27 | ⚠ **ACCEPTED — reproduced to the pixel, and FIXED HERE rather than deferred to 10h.** The build's claim is corrected in place either way | Reproduced: caption **41.2 / 41.2 / 17.0** with the well at `top: 24.2` inside it, i.e. on its own second line, at mask `0x…ec`. Not subsumed by the grid bound: 10h makes the PAGE fit, and a two-line caption then costs 24 px of a bounded panel's scrollable body — a legibility cost that survives the ruling — while `SPEC.md` §6.1's ruled shape says *"a one-line well"* and the shipped tree did not have one. The fix is one declaration and it is measured, not argued: `flex: 1 1 auto` → `flex: 1 1 0` on `.well`, guarded by an assertion in `caption.test.tsx` and by `10g-CP6`. §2 |
| **10g-A3** — three one-line reverts stay green, one of them the `StatusRow` fade guarded by no test and no mutation | **ACCEPTED — all three closed**, one new ⚠ test or assertion each and one `10g-` mutation each | R1 `--well-fade-height: 9px` → `0px` (deletes the affordance from all four wells at once): new ⚠ test in `panel-notes.test.tsx`, `10g-PN9`. R2 `status-row.module.css`'s `background-attachment` (the structural hole — five declarations, no test, no mutation): new ⚠ test in `status-row.test.tsx` asserting all five plus the ground, `10g-SR1`. R3 `panel-text.module.css`'s `background-position`: four assertions added to the existing ⚠ CSS test, `10g-CP7`. Each mutation was applied by hand and its RED set read before the harness ran: **1 red each, every one the test named for that property.** §4 |
| **10g-A4** — the `… N more` marker paints opaquely over 46 × 11 px of the one visible line it describes | ⚠ **ACCEPTED as measured — DEFERRED to 10h with a named owner**, and the build's "0 px" claim is qualified in place | ⚠ **Accepted as REPORTED, not re-measured** — this phase re-measured A2 and swept A7, and says so rather than implying four browser runs it did not do; what it did verify is the MECHANISM, by reading the rule: `.more` is `position: absolute; right: 2px; bottom: 0` on `background: var(--surface-2)`, an opaque `#11161d`, anchored to a wrapper that is the well's sibling — so it necessarily sits over the bottom-most visible line at every scroll position, and on an 18 px `tight` well that is the only line there is. The overlap is the ruling's own cost, not a defect in executing it: the marker must be OUT OF FLOW (§6.1's *"the heights stay as budgeted"*), and every in-flow alternative buys legibility with page height — the one thing the ruling forbids. Deferred rather than redesigned because the owner's 2026-09-10 ruling puts *the same affordance on every panel body*, so its placement is decided at panel scale in 10h; solving it twice is the shape this project has now paid for four times. `10g-build.md` §4.2 and its headline row now say "0 px **of layout**" with A4's measurement beside it. `10g-Q2` in `HANDOVER.md` §8 |
| **10g-A5** — every `… N more` on the graded page is wrong, and the wells hiding the most have none | ⚠ **ACCEPTED as measured; the count-is-ENTRIES behaviour is REJECTED as a defect — it is the owner's ruling, and the refuting line is `SPEC.md` §6.1** (*"a count, never a sentence"*, with the ruling's own instruction that `components/` cannot measure) | ⚠ **Accepted as REPORTED for the live-page numbers (not re-measured here); the MECHANISM was re-derived from the code and is what the verdict rests on.** Both halves are `10g-build.md` §6 silence 1, recorded before the adversarial found them: `hiddenMessageCount = max(0, total − LINES_SHOWN[bound])` counts ENTRIES, so a well hiding the tail of one WRAPPED entry hides 41–71 px and shows no count, and a `tight` well whose single visible line is itself a fragment says `… 3 more` while four entries are unreadable. It is a lower bound, never an overcount — structural, and re-confirmed here. What is NOT the ruling's cost is that no document stated the reader-facing consequence on a real page; it is stated now, with A5's table, and goes to the owner as **`10g-Q1`**, which is the same question 10h must answer for a panel body |
| **10g-A7** — three ⚠ tests carry an unmatchably short ledger prefix; one is the single character `⚠` | ⚠ **ACCEPTED — the priority of the list, and closed twice over: the three names are fixed AND the harness now refuses the shape** | The hole was **live**: the ledger's check is `prefix not in "\n".join(failing_test_lines)`, so a key of `⚠` alone matched every one of step 10's 279 ⚠ FAIL lines and the `… N more` marker's own acceptance test was certified by any mutation anywhere in the harness. Renamed all three (the key now runs 40–81 characters), and — because a rule that is written down and not checked has already been broken somewhere nobody looked — the shared ledger block in **all nine** harnesses now collects unmatchable keys and **returns 1**, naming them, instead of printing a `!!!` line past which both earlier phases reported *"every ⚠ mark reddened"*. **Swept every mark in every harness: 1064 marks, exactly three short, all three 10g's, and after the renames zero.** §3 |
| **10g-A8** — `styles.test.ts`'s two `test.each` blocks share one ledger key, and 10g widened it to 14 generated tests | **ACCEPTED — fixed**, and the sweep it prompted found one more of the same shape that IS 10g's | The two names now begin `⚠ a scrolling box is also a BOUNDED box — %s` and `⚠ … POSITIONED box — %s`: two keys, neither a substring of the other, so a mutation reddening the bounded rule no longer discharges the positioned one. ⚠ The residue is stated rather than hidden: **each key still stands for seven generated tests** (one per file in `cssFiles`), and no per-file accounting is possible under a ledger that matches a name prefix — that is inherent to `test.each` here, and it is `10g-Q3`. The sweep also found **eight families of character-identical ⚠ names across DIFFERENT files** — seven pre-existing, one created by 10g — and 10g's own was split. §3 |
| **10g-A9** — `panel-notes.module.css`'s module doc still argues `roomy` is 60 px | **ACCEPTED — fixed at source** | The `.notes` doc block argued *"60 is kept rather than raised to 68 … the bound is what matters and 60 is the bound"* forty lines above a rule that has read `max-height: 46px` since the build. Rewritten in place: `roomy` is 46 px, stated once, in the rule that owns it; the derivation the old paragraph carried is kept because it is still true and is why 46 is not 51 (three SEPARATE messages need 4 + 3×13.77 + 2×3 = 51.1) — which is exactly the entries-vs-lines gap A5 measures |
| **10g-A10** — two published numbers do not reproduce | **ACCEPTED — both corrected at source**, with the reason each was wrong | `10g-build.md` §2.3's `.rest` table printed `21 / 101` at BOTH 12 and 21 conditions; measured from a fresh load per stage it is **21 / 75** and **21 / 128**, and this phase's own m12 run reproduces `2: 21/21 · 6: 21/48 · 12: 21/101 · 21: 21/128` — ⚠ **note the 12 figure differs between a fresh load and m12's no-reload staging, which is A10's own point: the scroll height is a property of the RUN, and the acceptance rests on the banner HEIGHT, 58.8 in every run.** §6 silence 9's *"a third SERVING row (+20)"* is corrected to **+48**, and the silence itself is corrected: its list of what would eat the 6 px was not the list |
| **10g-A6** — 16 of 21 alarm conditions are unreachable on a pointerless wall panel | ⚠ **NOT THIS PHASE'S — ALREADY RULED BY THE OWNER, 2026-09-10** (`SPEC.md` §6.4: the banner shows what fits plus `+N more`), **and assigned to 10h.** Recorded with its measured numbers, not implemented | The banner's own `.rest` measurements are transcribed into `HANDOVER.md` §8 so 10h inherits them: **client 21 / scroll 21, 48, 75, 128 at 2 / 6 / 12 / 21 conditions**, `offsetHeight − clientHeight = 0` at every count (no scrollbar occupies layout), **4 items fully visible at 6, 12 and 21**, first hidden condition at **six** at 1280 and at **twelve** at 1920, and two conditions never wrap. ⚠ Its own `.rest` figure at 12 conditions is **75**, which is the fresh-load number A10 is about. §5 |

**Counts, over the ten: 5 ACCEPTED-and-fixed** (A2, A3, A7, A8, A9) **· 1 ACCEPTED-and-corrected-at-source with no code change** (A10) **· 1 ACCEPTED as measured and DEFERRED with a named owner** (A4 → 10h, `10g-Q2`) **· 1 ACCEPTED-in-part with the other part REJECTED against a named line** (A5 — the measurement accepted and published, the count-is-entries claim rejected against `SPEC.md` §6.1's ruling and `10g-build.md` §6 silence 1) **· 2 NOT ADJUDICATED because the owner ruled first** (A1, A6 → 10h).

⚠ **What this phase did instead of rejecting things, since one rejection is close to the shape a
rubber-stamp makes** (ANCHOR §8 rule 2): it **re-measured the finding it was told to decide** (A2)
from a fixture of its own writing and reproduced the adversarial's numbers to the pixel, then fixed
what the measurement showed and re-measured the fix; and it **generalised the priority finding
rather than closing the three instances** (A7) — sweeping all 1064 ⚠ marks in all nine harnesses,
finding one more collision family of 10g's own making that A8 did not name, and making the harness
itself refuse the shape. The one refusal in the table (A5's count) names its refuting line and the
build silence that recorded it before the adversarial arrived.

---

## 2. A2 — the well was bounded and the LINE was not

### 2.1 What the adversarial measured, reproduced here

`caption.tsx` puts the label and the well side by side inside `<p class="caption">`, which is
`display: flex; flex-wrap: wrap`. **A wrapping flex container breaks lines on each item's
hypothetical main size** — the flex base size clamped by min/max, computed *before* any shrinking —
so with `flex-basis: auto` the well's hypothetical size is its chips' max-content width. At §6.3's
five-bit mask that is 839 px against ~542 px of space beside the `throttle` label at 1280, and the
well drops onto its own second line. `min-width: 0` and `flex-grow`/`flex-shrink` do not prevent
it; they only govern what happens *after* the break.

Measured by this phase, real headless Chrome, `next dev` on **:39176**, two GPU cards at
`throttleReasons: 0x00000000000000ec`, three viewports, precondition graded first (**the throttle
well exists and carries exactly 5 chips** — a page with no throttle line would report a caption
height of `null`, not a small number that looks like a pass):

| | caption height | well height | well top *inside* the caption | GPU card | page spare |
|---|---|---|---|---|---|
| 1280 × 1024 | **41.2** | 17 | **24.2** (second line) | 211 | 158 |
| 1600 × 1024 | **41.2** | 17 | **24.2** (second line) | 222 | 123 |
| 1920 × 1080 | 17.0 | 17 | 0 (one line) | 198 | 203 |

That is the adversarial's table to the digit. The build's *"After: 17 px whatever the mask"* was
true of `max-height: 17px` and false of the line the ruling is about, and **no test could see the
difference**: `caption.test.tsx` reads the `.well` rule's declarations, which were all correct.

### 2.2 The fix, and why it is one declaration

`flex: 1 1 auto` → **`flex: 1 1 0`**. With an explicit `flex-basis: 0` the flex base size is 0 and,
with `min-width: 0` already present, the hypothetical main size is 0 — so the well can never force
a line break, and `flex-grow: 1` still gives it the rest of the caption's line. Re-measured on the
same fixture, same run shape:

| | caption height | well top | GPU card | page spare |
|---|---|---|---|---|
| 1280 × 1024 | **17.0** | 0 | **186** | **182** |
| 1600 × 1024 | **17.0** | 0 | **198** | **147** |
| 1920 × 1080 | **17.0** | 0 | 198 | 203 |

The card loses **25 / 24 / 0 px** and the page gains **24 / 24 / 0 px** of spare — ⚠ the two are the
same term, not two: GPU 0 and GPU 1 sit side by side on row 1, so the row is the taller of them and
the page collects one card's delta, not both (the 25-vs-24 is sub-pixel rounding in the reported
integers). It changes nothing on the four graded fixtures, and that is not a disappointment — it is
A1's point in miniature: **none of them renders a throttle line at all**, because every one
hard-codes `throttleReasons: '0x…04'`, which is not `notable`.

### 2.3 How the measurement was probed before it was trusted

The rule this loop is adding (`HANDOVER.md` §0.11) is that a new browser measurement must be broken
before it is believed, and this one was, in the cheapest available direction: **the BEFORE run is
the probe.** It reported 41.2 px where the fix reports 17.0, so the measurement demonstrably
distinguishes a one-line caption from a two-line one; an AFTER run of 17.0 is therefore not the
vacuous pass a mis-selected element would produce. The precondition (`chips === 5`, well present)
is graded at every viewport and sets a non-zero exit code, so a fixture that stopped taking would
report a failure rather than a caption height.

⚠ **Guard and mutation.** `caption.test.tsx`'s ⚠ CSS test now asserts `flex: 1 1 0` and refuses
`flex: 1 1 auto` outright, with the flex-line-breaking reason in the test and the measured A/B in
the stylesheet. `10g-CP6` writes the old value back: applied by hand, **1 red, and it is the test
named for the well's bound.**

---

## 3. A7 and A8 — the ledger was certifying nothing, and now it cannot

### 3.1 The hole, and that it was live

`regressions.py` computes a `test.each` name's ledger key as `name.split("%")[0].strip()` and the
ledger's whole check is `prefix not in "\n".join(failing_test_lines)`. A key of `⚠` alone is a
substring of **every** ⚠ FAIL line, so the mark is reported covered by a run that never touched it.
Three names in the tree had a key under 12 characters, **all three added by 10g, and every one of
them 10g's own acceptance test**:

| test | old ledger key | new key | other ⚠ names in that harness containing the old key |
|---|---|---|---|
| `panel-notes.test.tsx` — the `… N more` marker | **`⚠`** (1 char) | `⚠ the marker counts ENTRIES, not lines —` (40) | **278** |
| `alarm-banner.test.tsx` — every condition in the DOM | `⚠ at` (4) | `⚠ every condition is in the DOM and the count names all of them, at` (67) | 0 today |
| `sparkline.test.tsx` — the table box is the height prop | `⚠ height=` (9) | `⚠ the table view box is exactly the height prop, not a viewport fraction — height=` (81) | 0 today |

⚠ **"No other mark anywhere has this shape" is a measurement, not an assumption.** Every
`regressions.py` was imported and `marked_tests()` run against the real tree: **1064 ⚠ marks across
the nine harnesses, exactly three with a key under 12 characters, and after the renames zero.**

### 3.2 The generalisation — the harness now refuses the shape

The `!!! … unmatchably short` line existed and printed on every run. Both the build and the test
phase reported *"every ⚠ mark reddened"* off runs that were printing it. So the warning is replaced
by a failure, in the block that is shared by all nine harnesses: `marked_tests()` collects the
offending keys in a module-level `UNMATCHABLE`, and `main()` prints them and **returns 1** before
the ledger's verdict — because a ledger that cannot match a key has no verdict to give about it.
Identical text in all nine files.

⚠ **`HANDOVER.md` §5.2's md5 for the shared block is stale and could not be reproduced** — see
§7.3. The block's *code* is identical in all nine; its surrounding *comment prose* diverged into
three variants long before this loop, so the "byte-identical, md5 `d9bb…`" instruction has been
uncheckable for some time. §7.3 replaces it with a check that works.

### 3.3 A8, and the family it belongs to

`styles.test.ts:112` and `:176` are two `test.each(cssFiles)` blocks whose names both began
`⚠ every scrolling box in ` — **one key over both rules and all seven files**, so a mutation
reddening the *bounded* rule in one file discharged the *positioned* rule in all seven. Renamed to
`⚠ a scrolling box is also a BOUNDED box — %s` and `⚠ a scrolling box is also a POSITIONED box — %s`:
two keys, neither a substring of the other.

⚠ **The residue, stated rather than quietly fixed.** Each key still stands for **seven** generated
tests. Under a ledger that matches a name PREFIX, a `test.each` over a file list cannot have
per-file accounting at all — the placeholder is the only thing that differs. Both rules do have
live mutations today (`10f-CS4`/`CS5` and `10f-CS6`/`10e-CS3`), so nothing is inert; what is
missing is the ability to *know* that from the ledger. **`10g-Q3`.**

⚠ **The sweep found one more, and it is 10g's.** **Eight** families of character-identical ⚠ names
across DIFFERENT files exist in steps 9 and 10 — one name, one key, so a mutation reddening either
file's copy scores both covered. **Seven are pre-existing at `HEAD`**, verified by `git grep` against
that commit: `⚠ with every reading null, no value cell prints a numeral` in **five** panel test
files; `⚠ the toggle control renders ONLY when the caller supplies onToggleView` in **three**; and
five two-file pairs — four across the two chart primitives (`sparkline.test.tsx` /
`stacked-time-series-chart.test.tsx`) and one across `gpu-panel.test.tsx` /
`serving-panel.test.tsx`. **The eighth was created by 10g**: `⚠ the stylesheet bounds the table view
by that property…`, added to both chart test files. That one is split here (each now names its own
stylesheet); the seven pre-existing ones — **18 test names between them** — are **`10g-Q4`**,
recorded with the count and not swept up inside this item, because eleven-plus renames across files
this loop did not otherwise touch is a ledger change with no measurement behind it, and a ⚠ rename
obliges a full nine-harness re-run (§5.2 rule 8).

---

## 4. A3 — three reverts, three guards

All three were reproduced as described: applied together, `pnpm verify` green. Each is now closed by
an assertion **and** a mutation, and each mutation's RED set was read off its own run before the
harness was started (HANDOVER §0.10: *never off the exit code*).

| revert | the guard added | the mutation | measured |
|---|---|---|---|
| `--well-fade-height: 9px` → `0px` (`tokens.css`) — the affordance vanishes from **all four wells at once** | new ⚠ test in `panel-notes.test.tsx`: the token is parsed and asserted to be `9` **and** greater than zero. Every fade test in the project asserted `background-size: 100% var(--well-fade-height)` and none asserted the value | `10g-PN9` | **1 red** — *the fade has a REAL height* |
| `background-attachment: local, scroll` → `scroll, scroll` (`status-row.module.css`) — every row's well claims hidden text permanently | new ⚠ test in `status-row.test.tsx` asserting all five fade declarations, the well's own ground, and — as the anti-vacuity half — that `.noteWatch` carries no fade at all. This was the structural hole: one of the FOUR wells the ruling names, with **no test in the suite and no mutation in either harness** | `10g-SR1` | **1 red** — *.note draws the continuation fade* |
| `background-position: bottom` → `top` (`panel-text.module.css`) — the throttle well's fade marks the edge the chips do NOT continue past | four assertions added to `caption.test.tsx`'s existing ⚠ CSS test (position, image, size, repeat), so this copy of the rule is asserted as completely as `panel-notes.module.css`'s | `10g-CP7` | **1 red** — *the stylesheet bounds the well to one measured line* |

⚠ **Why the middle one was invisible and the others were not.** `styles.test.ts`'s directory-wide
rules cover *bounded* and *positioned*; they say nothing about the affordance, and the affordance is
the half §6.1's 10f-Q4/Q5 ruling actually added. Three of the four wells had a file-local CSS test
that happened to name one or more fade declarations; `StatusRow`'s had none, and its five
declarations are a copy of `panel-notes.module.css`'s — which is precisely the shape
`HANDOVER.md` §0.9 records (*"fixing a defect in one primitive does not fix it in the primitive you
write next"*), one loop later and in the other direction.

---

## 5. A1, A6 and `model` — ruled by the owner, assigned to 10h, recorded here as facts

**Not implemented. Not half-implemented.** `SPEC.md` §6.1, §6.4 and §3.4 carry the owner's wording
(2026-09-10) and `WORK-ITEMS.md` §11 carries the three rows. What follows is only the measured
inheritance, so 10h does not re-derive it.

### 5.1 A1 — the four ways ordinary telemetry breaks the graded page

Each row changes **one** field of measurement 11's own fixture. The control reproduces m11 to the
pixel, and this phase's own m11 run reproduces the control (spare 41 / 6 / 62, band 102, banner
58.8, every one of the nine slots), so the deltas are against a fixture that is demonstrably the
graded one.

| scenario — one variable from measurement 11's fixture | 1280×1024 | **1600×1024** | 1920×1080 |
|---|---|---|---|
| control (measurement 11 as graded) | 41 | **6** | 62 |
| `throttleReasons: 0x…24` — one notable bit beside the routine cap | 19 | **−16 OVER** | 40 |
| `throttleReasons: 0x…ec` — §6.3's four alarm bits plus the cap | **−5 OVER** | **−40 OVER** | 40 |
| a THIRD `llama-server` instance, explained like the other two | **−7 OVER** | **−42 OVER** | 14 |
| `model` = `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf` | **−19 OVER** | 6 | 62 |
| all four together | **−113** | **−64** | **−8 OVER** |

Three facts 10h needs beside that table:

1. ⚠ **Every browser fixture in this project hard-codes `throttleReasons: '0x0000000000000004'`**
   (`measure-breakpoints.mjs:448`, `mocks/measure-arrangements.mjs:128`), which is not `notable`, so
   `gpu-panel.tsx`'s `decode.notable` guard renders **no throttle line at all** on any measured page.
   Confirmed independently by this phase: the A2 probe had to fabricate the mask itself, and the
   graded m11 page's GPU slots are unchanged by A2's fix. **The fixtures are part of 10h's work**,
   and `SPEC.md` §6.1 now says so.
2. **A third instance costs +48 px on SERVING** (167 → 215), not the +20 the build predicted — and
   `SPEC.md` §3.4 requires it to work without a code change.
3. **`model` as a path costs +21 px per SERVING row and +17.9 px per GPU card** (the
   `served by instance N` strip, 14.8 → 32.7). The owner's ruling renders it as its filename; the
   wire keeps it raw.

### 5.2 A6 — what the banner's reader can actually reach

Measured at 1280×1024 on `.rest`, and this is the evidence behind `SPEC.md` §6.4's `+N more`:

| conditions | items rendered | `.rest` client / scroll | items **fully visible** | first one hidden |
|---|---|---|---|---|
| 2 / 3 / 4 | 1 / 2 / 3 | 21 / 21 | all | — |
| 6 | 5 | 21 / **48** | **4** | `RAM 33.2 GiB used · swap 2.00 GiB` |
| 12 | 11 | 21 / **75** | **4** | `GPU 0 VRAM 32,200 / 32,768 MiB` |
| 21 | 20 | 21 / **128** | **4** | `fan 2 0 RPM` |

`offsetHeight − clientHeight = 0` at every count — **no scrollbar occupies layout**, so on a
pointerless, keyboardless wall panel nothing on screen says the box scrolls except a 9/255 fade.
At 21 conditions **16 of the 20 rest items cannot be read at all.** Two conditions never wrap to a
second line. ⚠ The `12 → 75` here is a **fresh load**; m12's staged run measures 101 at the same
count, which is A10's finding and the reason this number is quoted with its run.

### 5.3 What 10h also inherits from this loop, unruled

`10g-Q1`…`10g-Q4` in `HANDOVER.md` §8 — A5's entries-vs-lines count (which 10h must answer again
for a panel BODY), A4's marker overlap (whose placement 10h decides), A8's `test.each` ledger
residue, and the seven pre-existing cross-file ⚠ name collisions.

---

## 6. What changed in the tree

### Source — **2 files edited**, and 2 more that this phase deliberately did NOT edit but now guards

| file | what | why |
|---|---|---|
| `components/panels/panel-text.module.css` | `.well` — `flex: 1 1 auto` → **`flex: 1 1 0`**, with the flex-line-breaking reason and the measured A/B in place | A2 |
| `components/panels/panel-notes.module.css` | the `.notes` doc block rewritten: `roomy` is **46 px**, stated once, in the rule that owns it | A9 |
| `components/tokens.css` | unchanged in content — it is the SUBJECT of A3/R1's new guard and `10g-PN9`, not an edit | A3 |
| `components/panels/status-row.module.css` | unchanged in content — the subject of A3/R2's new guard and `10g-SR1` | A3 |

### Tests (7 files, none weakened)

| file | what |
|---|---|
| `components/panels/caption.test.tsx` | +6 assertions in the existing ⚠ CSS test: `flex: 1 1 0` and the refusal of `1 1 auto` (A2), and the four remaining fade declarations (A3/R3) |
| `components/panels/status-row.test.tsx` | **+1 ⚠ test** — the `.note` well's five fade declarations, its ground, and `.noteWatch` as the anti-vacuity side (A3/R2) |
| `components/panels/panel-notes.test.tsx` | **+1 ⚠ test** — `--well-fade-height` is a positive px (A3/R1); and the `test.each` name renamed (A7) |
| `components/alarm-banner.test.tsx` | ⚠ `test.each` name renamed (A7) |
| `components/sparkline.test.tsx` | ⚠ `test.each` name renamed (A7); the stylesheet test renamed to name its own file (A8's family) |
| `components/stacked-time-series-chart.test.tsx` | the stylesheet test renamed to name its own file (A8's family) |
| `components/styles.test.ts` | both `test.each` names renamed to two distinct ledger keys (A8) |

⚠ **Every rename is a LEDGER change** (HANDOVER §5.2 rule 8), which is why all nine harnesses were
re-run rather than the two whose `LEDGER_FILES` were touched.

### Harnesses (9 files)

`pipeline/steps/10-panels-assembly/regressions.py` **264 → 268** (`10g-CP6`, `10g-CP7`, `10g-SR1`,
`10g-PN9`). `pipeline/steps/09-ui-primitives/regressions.py` unchanged at **140**. And the shared
ledger block in **all nine**: unmatchable keys are collected and the run **returns 1**, identical
text in every file (§3.2).

### Documents

`10g-build.md` — five corrections at source: the `.rest` table (A10), silence 9's `+48` and its
incomplete list (A10 + A1), §3.1's *"17 px whatever the mask"* (A2), §4.2's *"0 px"* (A4), and the
headline's *"a CSS fade that is exact"* (the TEST phase's §5, which had corrected `tokens.css` and
its own note but not the build's headline). `pipeline/ANCHOR.md` §2.0 / §2.1 / §2.2 / §2.5 / §2.7 —
five stale facts corrected, the largest being that **10d Q3 "bound the grid" is now RULED, not
deferred**. `pipeline/HANDOVER.md` — rewritten.

---

## 7. The nine harnesses, `pnpm verify`, and the tree

### 7.1 The nine

Re-derived from each harness's own printed `Red-test ledger` / `All N regressions failed their
check` lines, never carried forward. ⚠ **Run as one sequential command** (`python3 …/02.py;
python3 …/03.py; …`) — serial by construction, no `pgrep`, and its **exit status** is the signal
(HANDOVER §1). Nothing else ran beside it.

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | 60 | 272 red across 60; 22 ⚠ checked | **exit 0** |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | **140** | 198 red across 140; **146 ⚠ checked** | **exit 0** |
| `10-panels-assembly` | **268** | **312 red across 268; 281 ⚠ checked** | **exit 0** |

**1130 mutations** (was 1126), zero cross-harness id collisions. Steps 2–8 are identical to 10f's
and to 10g's build/test runs in every column — which is the check that says the ledger-block edit
changed no coverage anywhere it was not meant to. Step 10 went **264 → 268** mutations and
**279 → 281** ⚠ marks (A3's two new tests).

⚠ **Zero `!!! … unmatchably short` lines in the whole run** — the three that both earlier phases
printed and read past are gone, and the five `a test/it call the ⚠-scanner cannot read` lines in
step 2 are the long-standing backtick-named tests Q1 documented (all unmarked, nothing lost).

⚠ **The new guard was PROBED BY BREAKING IT**, which is this loop's own §0.11 rule. One ⚠
`test.each` name in `lib/severity.test.ts` was temporarily reworded to move its `%s` to the front,
giving it a ledger key of `⚠`, and step 2's harness was re-run:

```
PROBE exit = 1
!!! lib/severity.test.ts: ⚠ test name is unmatchably short: '⚠ %s duty, fan STOPPED: ALARM — …'
UNMATCHABLE LEDGER KEYS — these ⚠ names cannot be matched against a FAIL line,
  lib/severity.test.ts
    ⚠ %s duty, fan STOPPED: ALARM — this is the state that used to band green
    ledger key '⚠' (1 chars)
```

**Before this change the identical run printed the same `!!!` line and exited 0.** The name was
restored with the edit that reverses it (never `git checkout --`, §0.11) and verified
byte-identical.

### 7.2 `pnpm verify`, cold, on the tree this file describes

```
Test Files  101 passed (101)
     Tests  3010 passed (3010)
Type Errors  no errors
VERIFY_EXIT=0
```

3008 before this phase; **+2**, both of them ⚠ tests added behind A3's unguarded reverts (the
`StatusRow` fade and `--well-fade-height`'s value). No test was deleted, renamed-away or weakened:
the seven renames are ⚠ *names*, and every one of their bodies is byte-identical.

### 7.3 ⚠ `HANDOVER.md` §5.2's md5 for the shared ledger block does not reproduce — replaced

§5.2 says the block is *"byte-identical in all eight, md5 `d9bb8cfeae1ba6dbc9a87ceac24baaf3` over
the span from the `F1` comment through `red_test_lines`"*, and instructs a copier to check that md5
first. **It is uncheckable**: there are nine harnesses now, and the block's surrounding comment
prose exists in three variants (steps 2–8 share one, step 9 has the Q1-era original, step 10 a
condensed rewrite) — no span containing those comments hashes the same in any two groups, and no
span was found that hashes to `d9bb…` at all. The **code** is identical in all nine, which is what
the rule is actually about. `HANDOVER.md` §5.2 now carries a check that measures that instead of a
hash that cannot be taken.

### 7.4 `git status`

**38 modified, 8 untracked, nothing staged, nothing committed.** No `.env`;
`next-env.d.ts` byte-identical (`git status --short next-env.d.ts` is empty — `measure-breakpoints.mjs`
restores it in its own `finally`, and this phase's A2 probe does the same).

⚠ **One entry appeared and then vanished, and it is worth recording because it looks exactly like a
defect.** A `git diff --stat` taken while the nine were still running showed
`lib/collectors/serving.ts` modified — a file no part of 10g touches. It was step 5's harness
mid-mutation, restored seconds later, and the final `git status` does not list it. That is
`HANDOVER.md` §1's *"run the anchor check after a run as well as before it"* happening a third
time. **Nothing under `lib/` or `app/` is 10g's**, so a file there in `git status` is a stranded
mutation, not an edit.

---

## 8. What a reviewer should check first

1. **A7's sweep, because the whole ledger rests on it.** `python3 -c` over each `regressions.py`,
   calling `marked_tests()` and counting keys under 12 characters: it must be **zero**, and the
   three renamed names must be the ones §3.1 lists. Then break one on purpose — shorten a `test.each`
   name so its key is `⚠` — and confirm the harness now **exits 1** naming it rather than printing a
   warning and going green.
2. **A2's fix in the browser, not in the diff.** One declaration decides a ~24 px-per-card claim,
   and no fixture this project grades can see it, because none renders a throttle line. The probe
   is `scratchpad/adv-a2-caption.mjs`'s shape: fabricate `throttleReasons: 0x…ec` and read the
   caption's height, not the well's.
3. **The A5 row in §1 — the one refusal.** It rejects the *count* as a defect while accepting every
   number the finding measured. The refuting lines are `SPEC.md` §6.1 (*"a count, never a
   sentence"*, plus the ruling's instruction that the count comes from the panel's data) and
   `10g-build.md` §6 silence 1, which recorded the case before the adversarial found it.
4. **That A1, A6 and `model` really were left alone.** This phase's own SOURCE edits are two
   stylesheets — `panels/panel-text.module.css` (one declaration and its comment) and
   `panels/panel-notes.module.css` (a comment) — and nothing else under `components/`, `lib/` or
   `app/` moved. Three greps settle it: `grid.module.css` has no `max-height` and no
   `grid-template-rows`; `lib/client/banner.ts` still returns `rest: mapped.slice(1)` uncapped and
   `alarm-banner.tsx` still maps all of it; and `serving-panel.tsx` / `gpu-panel.tsx` still render
   `instance.model` whole. If any of the three has been started, it belongs to 10h and this loop
   overstepped.
