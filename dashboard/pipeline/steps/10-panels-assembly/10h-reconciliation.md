# 10h — the GRID is bounded (RECONCILIATION). **The acceptance was wrong in KIND, and it is fixed: a record now FAILS when a panel body hides a reading. The owner's headroom ruling was measured both ways and it costs readings on two graded pages — the arithmetic says the headroom is already there, in the 59 px of band reserve nobody spends.**

**Written 2026-09-10 by the reconcile phase.** Nothing committed, nothing staged. `SPEC.md` and
`MOCK.html` untouched. **No guard weakened** — three were made strictly stronger (`10h-A1`/`A2`/`A8`),
one CSS rule was added with a guard and a mutation behind it, and fifteen browser records were added.
Every number below was measured **by this phase**, on the tree this file describes, and each of the
three new record families was probed by breaking it.

---

## 0. The headline, before the table

| | |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 3061 tests, no type errors** (3056 inherited; +5) |
| `measure-breakpoints.mjs` | **59 passed · 0 failed · 0 blocked · 59 total, exit 0** (44 inherited; **+15 records**, and 12 of them are the missing half of the acceptance) |
| `measure-arrangements.mjs` + `check-density.mjs` (no `--oq`) | **ALL PASS**, healthy spare **263.2 / 227.6 / 283.6 px** — identical to the digit to 10g's, 10h's build's and 10h's test's runs. The bound still shrinks no panel that already fitted |
| the nine `regressions.py` harnesses | **all nine exit 0 — 1180 mutations** (1170 inherited; +10), zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, zero unmatchable ledger keys, every ⚠ mark reddened. ⚠ **The FIRST run returned 1**, and its reason is a finding of its own: the ledger named an ⚠ test *this reconciliation had made inert* — a document-wide `toContain` that the new `title` satisfies. Fixed, `10h-DS1` added, step 10 re-run. §5.1, §7.1 |
| ⚠⚠ **the finding that mattered most (`10h-A3`)** | **CLOSED.** *"The page fits"* was necessary and not sufficient; **`recordNoClipping` is the sufficient half** — no panel body hides a reading, on either axis, on the four pages the design is supposed to hold whole, at all three viewports. Probed with the adversarial's own compensating share pair: **2 records FAIL**, naming `gpu0 hides 7px · gpu1 hides 7px`, where the same defect previously produced **44 passed, 0 failed** with the headline number *improving* |
| ⚠⚠ **the headroom ruling** | **MEASURED BOTH WAYS, and it is the owner's call with numbers now.** Shares at 1.0: **59/59, nothing clipped anywhere.** Shares at 0.98: **every page-fit record still passes** — and **four clipping records FAIL** (55 passed, 4 failed, exit 1) — `safety`, `serving`, `gpu0`, `gpu1` and `cpu` hide 2–4 px each on the all-collectors-failed page and on the all-sources-explained page. **Recommendation: keep 1.0 and take the headroom from `--band-reserve` instead.** §3 |
| the hostname ruling | **BUILT.** One line, ellipsis, whole reading in the `title` — the same rule as `model`. The hostile fixture now carries a **150-character** FQDN and the band measures **101.8 of 102 at all three viewports** (a 79-character one took it to 130.7 and the page 1 px over) |
| the three guard defects | **all three closed and each probed**: `10h-A1` (a first-match `.grid` read), `10h-A2` (a `toMatch` a duplicate declaration defeats), `10h-A8` (a `slice`-to-end-of-file caps block). New mutations `10h-GR12`/`GR13`/`GR14` |
| the two accessibility regressions | `10h-A6` **fixed** — `.body :focus-visible { outline-offset: -2px }`, guarded, mutated (`10h-PS11`) and now **measured in the browser**: 24 rings painted of 28 focusable children inside scrolling bodies, offsets `[-2]`, zero clipped. `10h-A5` **graded rather than changed** — every `overflow: hidden`/`clip` alternative makes the content *unreachable*; the x axis is now a graded number on every page. §4 |
| the tree | nothing committed, nothing staged, no `.env`, `next-env.d.ts` byte-identical, no stranded mutation, `SPEC.md` and `MOCK.html` untouched |

**What §6.1's promise covers now, stated plainly — this is §0.0's sentence.**

- **The page fits** at 1280×1024, 1600×1024 and 1920×1080, for any telemetry, on every graded
  fixture including the hostile one. Unchanged, re-measured: 140/104/160 · 164/129/185 · 41/6/62 ·
  **28/4/36**.
- ⚠ **And now: nothing is HIDDEN to buy that fit**, on the healthy page, the real box's degraded
  page, the all-collectors-failed page and the all-sources-explained page. That is the claim this
  project could not make before today, and it is the claim the caps made necessary.
- ⚠ **The hostile page still hides readings, by design and by measurement**: `gpu0` 7 / `gpu1` 7 /
  `serving` 109 px at 1280, **18 / 18 / 46** at 1600, 5 / 5 / 35 at 1920 — six of nine panels
  untouched at every viewport, and **zero horizontal hiding on all nine**. That is the ruling
  working: hostile telemetry clips instead of overflowing.

---

## 1. The adjudication — all ten findings

| # | Verdict | What was done |
|---|---|---|
| **10h-A1** — a one-line `gap` inside the ≥1280px query defeats `10h-GR11`; 5 px over, suite green | ⚠ **ACCEPTED — fixed and probed.** The guard was first-match-only | `grid.test.tsx`'s derived-token test now sweeps **every** `.grid` block (`matchAll`, not `exec`) and requires `padding` and `gap` to be declared **exactly once across all of them** — strictly stronger than "the first block agrees", because a per-breakpoint override then cannot exist without this test being edited on purpose. `row-gap` counts as `gap`, so the more precise spelling does not slip past. **Probed on this tree**: `gap: 12px` added to the `.grid` rule inside `@media (min-width: 1280px)` → **1 failed / 54 passed**, the derived-token test, and reverted with the edit that reverses it. Mutation `10h-GR12`. §2.1 |
| **10h-A2** — a duplicate `--band-reserve` five lines below the pinned one; 21 px over, suite green | ⚠ **ACCEPTED — fixed and probed, and widened past the reserve to every token in the block** | `toMatch` asks *does this text appear*; CSS's last declaration wins. A `soleDeclaration(name)` helper now asserts each custom property is declared **exactly once** and returns its value for an `toBe` comparison, and **all nine** tokens in the block go through it (`--band-reserve`, `--grid-pad-v`, `--grid-row-gaps`, `--rows-available`, `--row1..4-max`, `--row23-max`) — the adversarial's own point that *"every token in that block has the same exposure"*. **Probed**: `--band-reserve: 43px;` added immediately after the pinned `102px` → **1 failed / 54 passed**. Mutation `10h-GR13`. ⚠ Deliberately strict: it refuses a second declaration **anywhere**, including a media query, which means a future conditional reserve (§3's recommendation) must change this guard on purpose. That is the intent, and it is written into the test. §2.1 |
| **10h-A3** — a compensating share pair clips a graded page with 44/44 and the headline number IMPROVING | ⚠⚠ **ACCEPTED — the priority of the list, and CLOSED by adding the acceptance's missing half** | *"The page fits"* stopped being sufficient the moment the caps existed, because every failure the caps prevent they convert into a body that scrolls, and no record graded that. **`recordNoClipping`** now grades *"no panel body hides a reading, on either axis"* at all three viewports on **four** pages — m9 (all collectors failed), m10 (the real box's degraded page), m11 (all sources explained, the tightest page this project has) and m13 (healthy, every table view open) — with a 9-bodies-found anti-vacuity term and the **closest-to-its-cap margin printed on PASS**, because a page that clips nothing by 0.8 px and one that clips nothing by 90 are the same word and very different facts. **Probed with A3's own defect** (`--row1-max` 0.2286 → 0.2200 with `--row2-max` 0.3019 → 0.3105, sum still exactly 1, both shares still clearing their healthy constants): **57 passed, 2 failed** — `9. 1600x1024` and `11. 1600x1024`, detail `gpu0 hides 7px · gpu1 hides 7px`. The same tree, the same defect, previously reported **44 passed, 0 failed**. §2.2 |
| **10h-A4** — a 16 px root text size takes the band to 105.6 px with no telemetry at all | ⚠ **ACCEPTED — RE-MEASURED on this tree, and the hostname ruling does NOT close it. DEFERRED to the owner.** §3 of the probe table: with the truncation in force, `body { font-size: 16px }` still gives band **105.6 of 102** at all three viewports | Two things are true and neither cancels the other. (a) The **telemetry-driven** half is closed: §3.2's `hostname` was the one free-form string in the band and it is now truncated, measured at **101.8 of 102 with a 150-character FQDN**. (b) The **environment-driven** half is not, and cannot be from inside this repo: Chrome's *Minimum font size* is a floor on **computed** font-size that overrides an author's `px` declaration by design, so no CSS here can defend against it. **Re-measured by this phase on the shipped tree** (`body { font-size: 12px }` → `16px`, nothing else, one variable): band **105.6 of 102 at all three viewports**, `measure-breakpoints.mjs` **49 passed / 10 failed**, m11 **2 px over** and m14 **3 px over** at 1600×1024, and SAFETY hiding **27 px** at 1280 on two graded pages. The adversarial's figure reproduces exactly, *with the hostname bounded* — so the ruling closed the telemetry handle and not the box. The two real closures are both owner rulings — bound the band's height in CSS and let its own content truncate or scroll (a §6.2/§6.4 rendering decision about what disappears from the band), or make `--rows-available` **measure** the band at runtime, which needs a hook `components/` may not have and changes §6.1's mechanism from arithmetic to measurement. Recorded as `10h-Q1`; measurement 15's band record names the premise and prints both numbers on every run, so it cannot be inherited silently |
| **10h-A5** — the nine bodies are HORIZONTAL scrollers, and no guard, fade or record covers that axis | ⚠ **ACCEPTED as measured — the CSS is deliberately NOT changed, and the axis is GRADED instead.** The refuting line for a `hidden`/`clip` fix is §6.1's own subject: *"the single-screen wall panel"* | The mechanism is real, and `hiddenX` is now a measured number on all nine bodies of every graded page — 0 everywhere today. But the two available CSS fixes both make things **worse**: `overflow-x: hidden` and `overflow-x: clip` each produce a box that clips horizontally and **cannot be scrolled by the user at all**, which turns "a reading with no affordance" into "a reading with no route" on a page with no pointer. So the finding is closed the way it can be honestly closed: **`recordNoClipping` fails on `scrollWidth > clientWidth`** on all four graded pages, and measurement 14 prints `and Npx HORIZONTALLY` beside every hostile body that scrolls sideways. A latent unreachable-content class is now a graded number rather than a note. The affordance question — a fade on the x axis, or a `white-space` rule for panel bodies — goes to the owner as `10h-Q2` |
| **10h-A6** — every focus ring inside a scrolling body is CLIPPED, on the tab stops 10h itself added | ⚠ **ACCEPTED — FIXED here rather than deferred**, because it is a regression this loop introduced on affordances this loop added | One declaration, and it is the convention four other stylesheets in this project already carry (`panel-text.module.css`'s `.well`, `alarm-banner.module.css`'s `.rest`, both chart table scrollers): `.body :focus-visible { outline-offset: -2px }`. A DESCENDANT rule rather than nine copies, so it covers every focusable child a later loop adds. Only the offset moves — the colour and width stay `tokens.css`'s, so keyboard focus is still never mistaken for a severity band. Guarded in `panel-shell.test.tsx` on the **sign** and not the presence (`+2px` is exactly the value the rule inherits when deleted), mutation `10h-PS11`, and **measured in a browser**: measurement 14 focuses every focusable child inside every scrolling body at all three viewports — **24 rings painted of 28, offsets `[-2]`, zero painted outside their border box**. §4.1 |
| **10h-A7** — the unconditional 59 px reserve is paid by panels that are actively hiding readings | ⚠ **ACCEPTED as measured, reproduced from a different angle, and DEFERRED to the owner — and it is now the CENTRE of the headroom answer**, not a side note | Reproduced on this tree without suppressing the banner at all: on **m9**, which has no banner and a real band of **43 px**, the page has **104 px of spare at 1600×1024 while `gpu0` sits 1.0 px from clipping.** The rows are capped as though the band were 102 px, so 59 px of screen is reserved that the page is not using and the rows are forbidden to use. **That is where the owner's headroom already is**, and it is why §3 recommends against buying headroom out of the shares. ⚠ One half of A7 is corrected: the *"275.2 px unused"* on the healthy page is **not** a share-proportioning problem — the caps are MAXIMA and `align-items: start` keeps a healthy panel at its own intrinsic height, so no share value recovers that space and none should. Recorded as `10h-Q3` (make `--band-reserve` conditional on the banner: a DOM attribute and two CSS lines, plus a deliberate edit to `10h-A2`'s new guard) |
| **10h-A8** — one brace takes COOLING's cap outside §6.1's condition; 1280×800 clips 37 px, suite green | ⚠ **ACCEPTED — fixed and probed** | `capsBlock()` returned `DECLARATIONS.slice(at)` — everything from the query to end of file — so a cap that had fallen **out** of the query still satisfied it, and its companion asked only that no `max-height` appear *before* the query. Both now read a **brace-matched query body**, and "outside" means both sides of it. Brace matching rather than a regex, because a `@media` body contains nested rules: `[^}]*` stops at the first inner `}` and `slice` never stops at all. **Probed**: the block's closing `}` moved up one rule → **2 failed / 53 passed** (the COOLING cap test and the inside-the-query test). Mutation `10h-GR14`. §2.1 |
| **10h-A9** — two of five declarations the module doc calls load-bearing are inert, one satisfies the boundedness guard | **ACCEPTED as a DOCUMENTATION defect, corrected at source; the declarations are KEPT, and the reason each is kept is now the true one** | (a) `.head { flex: 0 0 auto }` — the doc claimed a shrinking head would lose its 6 px padding first; measured, `0 1 auto` produces an identical head at an identical slot, because a flex item's automatic minimum size already refuses to shrink it below its content. The declaration is **insurance whose absence is unobservable**, and that is what the doc and the test comment now say. Removing it would be a behaviour change no test in this project could see, which is a worse trade than an honest comment. (b) `.body { max-height: 100% }` — accepted in full: it is inert in both regimes and it is what satisfies `styles.test.ts`'s `BOUNDED` rule, whose whole point is that `overflow-y: auto` on an unbounded box does nothing. **Not "fixed" by deleting it, because deleting it means weakening that guard**, which this phase may not do. The real fact — this is the first box in the project whose bound is one box up, and `BOUNDED` cannot express "bounded by an ancestor" — is recorded as `10h-Q4`. The third of the "first three" is confirmed real and untouched |
| **10h-A10** — `formatModelName`'s anti-blank-cell fallback is defeated by a zero-width character | ⚠ **ACCEPTED in part — FIXED; and the `.` / `..` half is REJECTED as a defect**, with the refuting line named | **Fixed:** `trim()` strips Unicode `White_Space` only, and **U+200B is `Cf`**, so `/models/​` produced a cell of length 1 that is visually empty — §6.6's forbidden blank cell, produced by the guard written to prevent it. `printableText` strips `\p{Cf}` before the blank test and from the output, which closes the same class's other member: U+202E RIGHT-TO-LEFT OVERRIDE no longer reaches the cell, so `/models/‮gguf.exe` renders `gguf.exe` instead of painting `exe.gguf`. ⚠ Scope is `formatModelName` alone — widening a rendering rule to `formatText`'s other subjects (kernel, GPU name, bus id) is a §6.6 change, not a bug fix. New ⚠ test, mutation `10h-FM6`, and `10h-FM4` re-aimed onto the line that moved under it. **Rejected:** `/models/.` rendering `.` is the ruling working — `SPEC.md` §3.4 says the rendering is *"the path's final segment"*, *"not a lookup, not a prettification"*, and `.` **is** that segment; a dot-segment rule would be a change to §3.4. **Rejected:** the raw override surviving in the `title` is §3.4's own requirement (*"the whole string reachable in the row's `title`"*) and §3.1's raw-reading rule. Both recorded as `10h-Q5` |

**Counts: 10 findings — 8 ACCEPTED and fixed or closed in this loop, 2 ACCEPTED-and-DEFERRED with a
named owner (`10h-A4`, `10h-A7`), and 3 sub-claims REJECTED with the refuting line quoted** (A5's
CSS-level fix, A10's `.` / `..` case, A10's raw `title`). A9 is accepted as a documentation defect
rather than a code one, which is stated in its row rather than scored as a fix.

---

## 2. The three guard defects, and the record that did not exist

### 2.1 A1, A2 and A8 — one shape, three instances

Every one of them is the same sentence: **a text assertion cannot see a later override, and
`exec`/`slice` take the first match.** The fixes are correspondingly of one shape — read the whole
file, and assert *uniqueness* rather than *presence*:

| finding | was | is | probe result on this tree |
|---|---|---|---|
| `10h-A1` | `/\.grid\s*\{([^}]*)\}/.exec(...)` — the first of the file's three `.grid` blocks | `matchAll`, all blocks, **exactly one** `padding` and one `gap`/`row-gap` across them | `gap: 12px` in the ≥1280 query → **1 failed / 54 passed** |
| `10h-A2` | `expect(TOKENS).toMatch(/--band-reserve:\s*102px;/)` ×9 tokens | `soleDeclaration(name)` — exactly one declaration, `toBe` on its value, for all nine | a duplicate `--band-reserve: 43px;` → **1 failed / 54 passed** |
| `10h-A8` | `DECLARATIONS.slice(at)` — query start to end of file | a **brace-matched** query body, with "outside" meaning both sides | the closing `}` moved up one rule → **2 failed / 53 passed** |

Each probe was reversed with the edit that reverses it, never `git checkout --`, and
`diff` against the pre-probe copy was checked after each.

⚠ **The mirror shapes were swept.** `capsBlock()` was A8's own mirror and is fixed with it. The
remaining raw-`CSS` match in `grid.test.tsx` — the pre-dating *"every class `grid.tsx` binds declares
the grid-area of the same name"* — is unchanged and still out of this item's scope, exactly as the
TEST phase recorded; it is named again here so the next loop touching that file does not rediscover
it. `panel-shell.test.tsx`, `alarm-banner.test.tsx` and `styles.test.ts` all strip comments where
they read, and `header.test.tsx`'s new CSS assertion was written that way from the start.

### 2.2 A3 — what the acceptance was missing, and what it says now

The caps convert *"the page overflows"* — loud, visible, and graded by nine records — into *"a panel
body scrolls"*, which on a wall panel with no pointer means a reading behind a fade. **Every fit
record grades the former.** So the class of regression the caps introduced was the one class this
project's acceptance could not see, and the adversarial demonstrated it end to end.

`recordNoClipping(page, record, label)` is the missing half. Per viewport it reads all nine panel
bodies and fails if any of them has `scrollHeight > clientHeight + 1` **or**
`scrollWidth > clientWidth + 1`; it requires nine bodies to have been FOUND; and on PASS it prints
the slot closest to its own row cap and by how much.

**Where it is applied, and the reason for each:**

| page | why it must clip nothing |
|---|---|
| **m13**, healthy `box`, every table view open | the density baseline; a bound that hid a reading here would be a regression dressed as a fix |
| **m10**, the real box's degraded page | the page this dashboard will actually show on a bad day |
| **m9**, every non-GPU collector failed | ⚠ the four shares are `healthy + surplus × growth / total growth`, and `growth` **is** the degraded growth 10f measured — a degraded page that clips is the derivation being wrong |
| **m11**, all sources explained | the arithmetic worst case, and the tightest page this project grades: **0.7 px** of margin at 1600×1024 |

**Not applied to m14, the hostile page, and that is deliberate**: clipping there is the ruling
working. Measurement 14 reports what it clips, per viewport, rather than grading it away.

**Measured, this tree, shares at 1.0 — the closest any slot comes to its own cap:**

| page | 1280×1024 | 1600×1024 | 1920×1080 |
|---|---|---|---|
| m9 all-collectors-failed | `safety` 2.9 px | **`gpu0` 1.0 px** | `gpu0` 13.8 px |
| m10 the real box degraded | `gpu0` 35.3 px | `cpu` 23.7 px | `gpu0` 36.6 px |
| m11 all sources explained | `serving` 1.3 px | **`cpu` 0.7 px** | `serving` 12.1 px |
| m13 healthy, views open | `gpu0` 35.3 px | `cpu` 23.7 px | `gpu0` 36.6 px |

**The probe.** The adversarial's compensating pair applied to `tokens.css` and nothing else:

```
--row1-max  0.2286 → 0.2200      --row2-max  0.3019 → 0.3105      (sum still exactly 1)
```

| | before this loop | now |
|---|---|---|
| `measure-breakpoints.mjs` under that defect | **44 passed, 0 failed, exit 0** | **57 passed, 2 failed, exit 1** |
| what fails | nothing | `9. 1600x1024` and `11. 1600x1024`, detail `gpu0 hides 7px vertically · gpu1 hides 7px vertically` |
| m11's printed page spare | 6 → **12 px** (it *improved*) | unchanged as a number, and no longer the only number |

Reverted with the reversing edit; `diff` against the pre-probe copy is clean.

---

## 3. ⚠⚠ The headroom ruling, measured BOTH WAYS

**The ruling** (owner, 2026-09-10): *reserve explicit headroom — the four row shares sum to ~0.98
rather than 1.0, buying ~18 px at 1024 tall.* It was made **before** `10h-A3` and `10h-A7` existed,
and shrinking the shares makes clipping worse, so the handoff asked for numbers rather than
compliance. Here they are.

**What was run.** `tokens.css` and nothing else, uniform ×0.98 on each share, four decimal places so
the sum is exactly 0.98: `0.2240 / 0.2959 / 0.2717 / 0.1884`. A full
`measure-breakpoints.mjs` run each way, on the same tree, with the same fixtures.

| | **shares sum 1.0** (shipped) | **shares sum 0.98** |
|---|---|---|
| §6.1's page-fit records, every graded page, all three viewports | **all PASS** | **all PASS** |
| m11 page spare (all sources explained) | 41 / **6** / 62 px | 45 / **18** / 62 px |
| m14 page spare (hostile) | 28 / **4** / 36 px | 37 / **18** / 44 px |
| bodies hiding a reading — **m13 healthy** | **none** | **none** |
| bodies hiding a reading — **m10 the real box degraded** | **none** | **none** |
| bodies hiding a reading — **m9 all collectors failed** | **none** | ⚠ `safety` 2 px at 1280; **`gpu0` 3 · `gpu1` 3 · `cpu` 2 · `safety` 2** at 1600 |
| bodies hiding a reading — **m11 all sources explained** | **none** | ⚠ `safety` 2 · `serving` 2 at 1280; **`gpu0` 3 · `gpu1` 3 · `cpu` 4 · `safety` 2 · `serving` 2** at 1600 |
| readings hidden on the hostile page at 1600 | 18 + 18 + 46 = **82 px** | 22 + 22 + 4 + 2 + 49 = **99 px** |
| `measure-breakpoints.mjs` | **59 passed, 0 failed, exit 0** | **55 passed, 4 failed, exit 1** |

**Read that table in one sentence: 0.98 buys ~12–14 px of page spare at 1024 tall by hiding
2–4 px of readings in each of four or five panels on two pages that were showing everything.** It is
not a wash — it is a trade of a number nobody reads for readings someone does. At 1920×1080 it costs
nothing (the taller viewport has 930 px of rows and margins of 12–18 px absorb the 2 %), so the
entire cost lands on the two viewports §6.1 names as the **design target**.

### 3.1 Should the shares be re-proportioned instead? The arithmetic says there is no donor.

`10h-A7`'s *"74.6 px of empty screen beside three scrolling bodies"* suggests the shares are
mis-proportioned. On m11 at 1600×1024, shares at 1.0 — the ROW margins are the adversarial's own
measured table, and this phase's `tightest` figure reproduces its smallest to within 0.2 px (`cpu`
**0.7**); the sibling columns are derived from this run's printed `slotHeights` against the four
caps (199.8 / 263.9 / 242.3 / 168.1 at 1024 tall) and are rounded:

| row | the panel that GOVERNS it | margin to its cap | the sibling's slack, and why it is unusable |
|---|---|---|---|
| 1 — GPU 0 / GPU 1 | either (both 199) | **0.8 px** | none — the two cards are the same height |
| 2 — CPU / MEMORY | CPU (263 of 263.9) | **0.8 px** (this phase measured 0.7) | MEMORY sits at 188, ~76 px under. `row2 = max(CPU, MEMORY)` |
| 3 — SAFETY / STORAGE | SAFETY (239 of 242.3) | **2.9 px** | STORAGE sits at 218, ~24 px under. `row3 = max(SAFETY, STORAGE)` |
| 4 — SERVING / LOG | SERVING (167 of 168.1) | **1.3 px** | the LOG sits at 130, ~38 px under. Same shape |

**All four rows are within 0.8–2.9 px of their caps at the same time: 5.8 px of slack in 874.** The
apparent slack is all in MEMORY, STORAGE and the LOG — and it is **not available**, because §6.1's
row model is `row2 = max(CPU, MEMORY)` and `row3 = max(SAFETY, STORAGE)`: a row's share cannot be cut
toward MEMORY's height without clipping CPU. There is no donor row. **Re-proportioning cannot produce
headroom on this page; only enlarging `--rows-available` can.**

### 3.2 Where the headroom actually is: the 59 px of band reserve

`--rows-available = 100vh − 102 − 21 − 27`, and the 102 is *the band at its tallest*, reserved
unconditionally. When no alarm stands, the real band is **43 px**. Measured on m9, which has no
banner:

```
1600x1024   page spare 104 px   band 43 of a reserved 102   gpu0 1.0 px from clipping
```

**59 px of screen is reserved that the page is not using and the rows are forbidden to use, while a
row is one pixel from hiding a reading.** That is `10h-A7`, and it is the same 59 px the owner's
ruling was trying to create out of the shares.

Making the reserve conditional on the banner's presence is strictly better than 0.98 on both
criteria at once:

| | page fit | readings hidden |
|---|---|---|
| shares 0.98 | +12–14 px of spare | ⚠ **worse** — 2–4 px hidden in 4–5 panels on two graded pages |
| `--band-reserve` conditional | unchanged when a banner stands (102, exactly today's behaviour); **+59 px of row budget when none does** | ⚠ **better** — m9's 1.0 px margin becomes ~14 px, and nothing anywhere loses room |

**RECOMMENDATION, and it is left as a recommendation because it is a ruling: keep the four shares
summing to 1.0, and if explicit headroom is wanted, take it from `--band-reserve` by making it
conditional on whether §6.4's banner is on the page.** The build already costed that change at *"a
DOM attribute and two CSS lines"* (`10h-build.md` §6, silence 6). It is **not built here**, for two
reasons stated rather than glossed: the owner ruled the shares, not the reserve, and a conditional
reserve is exactly the second declaration `10h-A2`'s new guard is written to refuse — so it needs a
deliberate edit to that guard, which is a decision, not a side effect.

**What is shipped: the shares are unchanged at 0.2286 / 0.3019 / 0.2772 / 0.1923, summing to 1.0.**
Nothing was silently kept and nothing was silently shipped: both configurations were run in full and
both tables are above.

---

## 4. The hostname, and the two accessibility findings

### 4.1 §3.2's `hostname` is truncated — the band's own bound

The owner ruled it the same day: *one line, ellipsis, full string in the `title` — the same rule as
`model`.* Built:

| where | what |
|---|---|
| `header.module.css` | `.hostname` gains `max-width: 320px; overflow: hidden; text-overflow: ellipsis` beside its existing `white-space: nowrap` |
| `header.tsx` | a new `hostnameTitle: string \| null` prop on the span — **no attribute at all when null**, the same shape as `StatusRow.inlineTitle` and `StripItem.title` |
| `app/dashboard-shell.tsx` | passes the RAW `snapshot?.hostname ?? null` |

⚠ **`max-width` is what does the work, and this is the part worth not re-deriving.** `.header` is
`flex-wrap: wrap`, and a wrapping flex container breaks its lines on each item's **hypothetical main
size** — so `min-width: 0`, which only lets an item shrink *within* a line it has already been given,
cannot prevent the wrap. Only clamping the hypothetical size can. (The span is a flex item and
therefore blockified, so `max-width` and `overflow` apply to it at all; on a bare inline box both
would be ignored.)

**320px is ~35 characters at this 15px mono face.** The two measured points that bracket the wrap
threshold at 1280 wide are the TEST phase's: **53 characters fits** (band 101.8) and **79 wraps**
(band 130.7) — roughly 480 px and 710 px of rendered text. 320 px is deliberately well inside that
bracket rather than at it, and the margin is the point: what is left for this item is a function of
the *other* header items' rendered widths, and a bound set exactly at a measured threshold fails on
the first machine whose clock string is wider. Raising it is a legibility trade the owner can now
make with both numbers in hand (`10h-Q6`).

**Measured.** The hostile fixture now carries a **150-character** FQDN — roughly twice the length
that used to break the fold — and it is a precondition of measurement 14 that the reading is whole in
the `title` **and** that the element really is overflowing its box (an ellipsis that never fires
proves nothing) **and** that its drawn width is inside the bound:

```
15. the sticky band fits inside --band-reserve
    band 1280x1024: 101.8 of 102 · 1600x1024: 101.8 of 102 · 1920x1080: 101.8 of 102
14. the HOSTILE fixture TOOK ... a 150-character hostname truncated with its reading kept   PASS
14. 1280x1024 / 1600x1024 / 1920x1080: §6.1's no-scroll promise   PASS, spare 28 / 4 / 36
```

Before the ruling, a **79**-character hostname took the same band to **130.7** and the same page
1 px over. Mutations `10h-HD1` (the bound), `10h-HD2` (the ellipsis), `10h-HD3` (the `title` deleted)
and `10h-HD4` (`title=""`), plus `10h-DS1` for the shell's own wiring of the raw reading; `10a-H10`
was re-aimed onto the element that moved under it, unchanged in what it says.

**Probed by removing the bound** — `10h-HD1`'s own edit, `max-width: 320px` → `none`, and the whole
script re-run. This is the pre-ruling failure, reproduced on this tree rather than quoted:

| | shipped | with the bound removed |
|---|---|---|
| `measure-breakpoints.mjs` | **59 passed, 0 failed, exit 0** | **52 passed, 7 failed, exit 1** |
| the sticky band | 101.8 / 101.8 / 101.8 **of 102** | **152.9 / 128.1 / 130.7 of 102** |
| §6.1's page-fit on the hostile page | +28 / +4 / +36 px spare | **23 px OVER at 1280, 22 px OVER at 1600** |
| the hostname span's drawn width | inside its own computed `max-width` | **1254 px**, `hostnameInsideBound: false` |
| what else broke | — | measurement 15's three mechanism records and its band record, all four for the same reason |

⚠ **Every row cap still held under that defect**, exactly as the TEST phase measured with the
79-character name: the overflow is entirely in the term the caps subtract. That is why the band's own
record (m15) is the one that names the cause while the fit records only report the symptom. Reverted
with the edit that reverses it; `diff` clean.

### 4.2 A6 — the focus ring this loop clipped

An outline is **ink** overflow: it never contributes to scrollable overflow, so a child flush with a
scroller's padding edge loses its ring entirely. `tokens.css` paints the app-wide ring 2–4 px
*outside* the border box, `.body` has no padding, and `.body` was `overflow: visible` before 10h —
so this loop clipped the one affordance that tells a keyboard user where it is, on ten of the fifteen
tab stops 10f/10g/10h added *so that clipped content stays reachable*.

Fixed with one descendant rule, `.body :focus-visible { outline-offset: -2px }`, which is the
convention four other stylesheets here already use. **Guarded on the sign, not on the presence** —
`+2px` is precisely the value the rule inherits if it is deleted, so a guard reading "an offset is
declared" would pass on the defect — and mutated (`10h-PS11`).

⚠ **And measured, which took two attempts and the first one is worth recording.** The first version
of the record read `getComputedStyle(el).outlineOffset` on the resting element and reported **28 of
28 broken at every viewport on a tree whose rule is correct**: the ring lives in a `:focus-visible`
rule, so an unfocused element computes `0px`. The record now presses `Tab` (to put Chrome into
keyboard modality, without which programmatic focus does not match `:focus-visible` at all), focuses
each child with `preventScroll`, reads the offset, blurs, and restores the scroller's position.
Measured, all three viewports:

```
focus rings: 24 painted of 28 focusable children, offsets [-2]
```

The graded property is *"no ring inside a scroller is painted outside its own border box, on a
non-empty sample"* — deliberately **not** *"every focusable child paints a ring"*, because whether
Chrome's `:focus-visible` heuristic engages under programmatic focus is a property of the browser's
modality tracking rather than of this stylesheet, and grading it would make an accessibility record
fail for a reason that is not an accessibility fact. The four that do not engage are named in the
record's own detail (`gpu0`/`gpu1`/`cpu`'s `div[table-view]` scrollers).

**Probed by re-applying the defect** — `10h-PS11`'s own edit, `outline-offset: -2px` → `2px`, and
the whole script re-run:

| | shipped | with the ring outset again |
|---|---|---|
| `measure-breakpoints.mjs` | **59 passed, 0 failed, exit 0** | **56 passed, 3 failed, exit 1** |
| the three `14. … inset focus ring` records | PASS at all three viewports | **FAIL at all three** |
| offsets seen | `[-2]` | `[2, -2]` |
| rings clipped | none | **21 of 24**, named per slot — `gpu0 +2px`, `cpu +2px`, `safety +2px ×4`, `serving +2px ×4`, `session-event-log +2px`, … |

The three that stay inset under the defect are the boxes that already carried their own
`outline-offset: -2px` before this loop (the GPU throttle wells and the chart table scrollers) —
which is the measured evidence that the new rule is what covers the other twenty-one, and that the
convention it follows was already here. Reverted with the edit that reverses it; `diff` clean.

### 4.3 A5 — the axis with no affordance, graded rather than changed

`overflow-y: auto` computes `overflow-x` to `auto`, so all nine bodies are horizontal scrollers and
the continuation fade is `background-position: bottom` only. Nothing reaches it today — the
adversarial measured a 220-character ext4-legal filename and a 4000-character alias both wrapping,
and this phase's own run passes the x-axis condition — `scrollWidth <= clientWidth + 1` on each of
the nine bodies — on all four graded pages at all three viewports. (The exact `hiddenX: 0` figures
are printed in full in the 0.98 run's failure detail, where the same nine bodies are listed.)

**The CSS is not changed, and the reason is checkable rather than a preference.** `overflow-x: hidden`
and `overflow-x: clip` both produce a box that clips horizontally and cannot be scrolled by the user
at all — on §6.1's own subject, *"the single-screen wall panel"* with no pointer, that converts a
reading with a poor affordance into a reading with no route. So the axis is graded instead: it is
half of `recordNoClipping`'s failure condition on every page above, and measurement 14 prints
`and Npx HORIZONTALLY` beside any hostile body that scrolls sideways. Whether a panel body should
carry an x-axis affordance, or forbid `white-space: nowrap` children outright, is `10h-Q2`.

---

## 5. What changed in the tree

### Source — 5 files

| file | what | why |
|---|---|---|
| `components/header.module.css` | `.hostname` gains `max-width: 320px; overflow: hidden; text-overflow: ellipsis` | the owner's hostname ruling; the band's only unbounded term |
| `components/header.tsx` | `hostnameTitle: string \| null`, rendered as `title` or as no attribute | §3.4's rule applied to §3.2 — the shortened form on screen, the whole reading kept |
| `app/dashboard-shell.tsx` | passes the raw `snapshot?.hostname ?? null` | the raw reading, unformatted, as §3.1 requires |
| `components/panel-shell.module.css` | `.body :focus-visible { outline-offset: -2px }` | `10h-A6` — this loop clipped the ring on the tab stops it added |
| `lib/format.ts` | `printableText`, used by `formatModelName` | `10h-A10` — `trim()` does not strip U+200B, so §6.6's blank cell was reachable |

⚠ **`components/tokens.css` and `components/grid.module.css` are UNCHANGED** — the shares stay at
1.0 and every cap is where the build put it. Both were edited and reverted during §2 and §3's five
probes, each with the edit that reverses it, and each `diff`ed clean against its pre-probe copy.

### Tests — 4 files, none weakened

| file | what |
|---|---|
| `components/grid.test.tsx` | `capsQuery()` (brace-matched, A8), the all-blocks `.grid` sweep (A1), `soleDeclaration()` across all nine tokens (A2). **No test renamed** — the ledger keys are untouched |
| `components/header.test.tsx` | three new ⚠ tests: the `title` carries the whole reading, a header with no reading renders **no** attribute, and the CSS bound exists (both sides of the optional prop, per HANDOVER §0.8) |
| `components/panel-shell.test.tsx` | one new ⚠ test: a focus ring inside the scroller is inset, asserted on the **sign** |
| `lib/format.test.ts` | one new ⚠ test: a zero-width character is not a reading, and a bidi override does not reach the cell |

### Measurement — 1 file

`measure-breakpoints.mjs`: `recordNoClipping` (12 records across m9/m10/m11/m13), the focus-ring
record (3, m14), `HOSTILE_HOSTNAME` and measurement 14's three new hostname preconditions, the
horizontal axis in m14's per-viewport scrolling report, and two PASS printers (the closest-to-cap
margin, and the ring counts and offsets).

### Harnesses — 3 files, +10 mutations, 1170 → 1180

| harness | before | after | new |
|---|---|---|---|
| `02-format-severity` | 65 | **66** | `10h-FM6`; `10h-FM4` **re-aimed** (the line moved, not the property) |
| `09-ui-primitives` | 152 | **153** | `10h-PS11` |
| `10-panels-assembly` | 291 | **299** | `10h-GR12`/`GR13`/`GR14`, `10h-HD1`…`HD4`, `10h-DS1`; `10a-H10` **re-aimed** (the element moved, not the property) |

**Two re-aims, neither narrower than the original**, each because 10h's own edit moved the text under
it: `10h-FM4` still deletes `formatText` from `formatModelName`'s chain and still says exactly what it
said; `10a-H10` still re-grows an IP address next to the hostname, in the same span, with the same
red test.

### ⚠⚠ 5.1 The ledger caught THIS PHASE making an existing guard inert — and it is the eleventh instance of one shape

**The first full nine-harness run exited 1 on step 10**, and the reason is worth more than the fix:

```
NO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:
  app/dashboard-shell.test.tsx
    ⚠ the hostname is the snapshot’s own, not a literal
```

That test was `expect(html).toContain('probe-host-42')` — a **document-wide** `toContain`, which is
HANDOVER §0.4's shape and has now been found in this project ten times before this one. It was live
until this reconciliation added `hostnameTitle`: with the raw hostname also rendered into a `title`
attribute, `10a-DS16` (*"the hostname is a literal"*, `hostname={'ai-server'}`) leaves
`probe-host-42` in the markup anyway, and the assertion passes on a header that draws a hard-coded
machine name.

**Nothing about the feature was wrong; the guard around a neighbouring one went blind, and only the
ledger could see it.** Both phases before this one, and this phase's own first reading, would have
reported "every ⚠ mark reddened" — the run's exit code is what said otherwise.

Closed two ways, because one would have left the other open:

1. The assertion is now scoped to **one element and both halves at once** —
   `/<span[^>]*title="probe-host-42"[^>]*>probe-host-42<\/span>/` — so it fails when the drawn
   string is a literal *and* when the kept string is missing. `10a-DS16` reddens it again.
2. **`10h-DS1`** mutates the shell's `hostnameTitle={snapshot?.hostname ?? null}` to `{null}`, so
   the wiring of the new optional prop has a mutation of its own at the shell level as well as at
   the component level (`10h-HD3`/`HD4`). *An optional prop is an untested one until both sides are
   fixtured **and** both sides have a mutation* — HANDOVER §0.8, paying for itself again.

⚠ **Step 10 was then re-run on its own**, and it is the only harness that could have moved: the edit
touches `app/dashboard-shell.test.tsx` and step 10's own `regressions.py`, and no other harness's
`LEDGER_FILES` contains either. Its row in §7.1 is from that second run; the other eight are from
the first. This is the same accommodation the TEST phase recorded when `lib/format.test.ts` gained a
fixture after step 2 had already passed.

---

## 6. Owner questions this loop raises — six, none of them chosen

| # | Question | What stands today |
|---|---|---|
| **10h-Q1** ⚠⚠ | **The band is bounded against telemetry and NOT against the environment.** A browser *Minimum font size* setting is a floor on computed font-size that overrides an author's `px` by design. **Re-measured by this phase, on the shipped tree with the hostname truncation in force**: a 16 px root gives band **105.6 of 102 at all three viewports**, m11 2 px over and m14 3 px over at 1600×1024, SAFETY hiding 27 px at 1280 — 10 records fail. No telemetry involved. Bounding the band's own height, or measuring it into `--rows-available`, are the two closures and both are rulings — the first decides what disappears from the band, the second changes §6.1's mechanism from arithmetic to measurement and needs a hook `components/` may not have | `--band-reserve: 102px` is a measured constant. Measurement 15 grades the premise and prints `101.8 of 102` on every run |
| **10h-Q2** | **A panel body scrolls on the X axis with no affordance at all.** The fade is `background-position: bottom`; the x axis has none. Nothing reaches it today and it is now graded, so the question is whether a body should carry an x-axis fade or simply forbid `white-space: nowrap` children | `overflow-x` computes to `auto` on all nine bodies; `hiddenX` is 0 on every graded page and is a failure condition if it stops being |
| **10h-Q3** ⚠⚠ | **Should `--band-reserve` become conditional on the banner?** 59 px is reserved unconditionally; on an un-alarmed page the real band is 43 and a row can sit 1.0 px from clipping while 104 px of screen is unused. This is where the owner's headroom already is (§3.2) | Unconditional, deliberately — §6.1's promise is unconditional on the banner. The change is a DOM attribute, two CSS lines, and a deliberate edit to `10h-A2`'s new sole-declaration guard |
| **10h-Q4** | **`styles.test.ts`'s `BOUNDED` rule cannot express "bounded by an ancestor".** `.body`'s real bound is the slot's `max-height` one box up; what satisfies the guard is `max-height: 100%`, which is inert in both regimes (`10h-A9`). The guard is therefore satisfied here by a declaration that does nothing | Unchanged, and **not** removed: deleting it would weaken a guard this phase may not weaken. The comment now says which box holds the real bound |
| **10h-Q5** | **`formatModelName` at two more boundaries.** `/models/.` renders `.`, which reads as a rendering fault; and the raw `title` still carries whatever the wire sent, bidi overrides included | Both follow §3.4 as written (*"the path's final segment"*, *"the whole string reachable in the `title`"*). Changing either is a §3.4 change, not a bug fix |
| **10h-Q6** | **Is 320px the right hostname bound?** ~35 characters at the header's 15px mono face. The measured bracket at 1280 wide is 53 characters fitting and 79 wrapping — roughly 480 px and 710 px of rendered text — so the threshold is between them and 320 px sits well inside. A shorter bound is safer against other header content growing; a longer one shows more of an FQDN | 320px, with both measured points recorded in the stylesheet so the trade can be made without re-measuring |

---

## 7. Everything this phase ran

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"   # node v24.16.0
```

### 7.1 The nine harnesses

Run **serially, in one call**, on the tree this file describes — with one exception recorded in
§5.1 and in the table's own footnote: **step 10 was re-run on its own** after the first run's ledger
returned 1 on an inert ⚠ test, and its row is from that second run. ⚠ **On "one FOREGROUND call"**: the
nine take ~11 minutes and this environment's foreground tool caps at 10, so this was one **detached**
command — still one command, still strictly serial, nothing else running beside it, and **no `pgrep`
anywhere** (the log was read, never polled). Both hazards the rule exists for — concurrency and the
self-matching wait loop — are avoided; only the word "foreground" is not literally met, and it is
recorded rather than glossed. This is the same accommodation the build and test phases recorded.

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | **66** | 282 red across 66; **30 ⚠ checked** | **exit 0** |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | **153** | 210 red across 153; **155 ⚠ checked** | **exit 0** |
| `10-panels-assembly` *(second run, §5.1)* | **299** | 341 red across 299; **302 ⚠ checked** | **exit 0** |

**1180 mutation ids across the nine, 1180 unique, zero cross-harness collisions** — re-derived by importing each `regressions.py`, never by `grep -c`. **Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, and every ⚠ mark reddened in all nine.**

⚠ **Steps 3-8 are identical to the TEST phase's run in every column** — 115/25 · 188/85 · 190/100 · 88/56 · 202/130 · 288/221 — which is the check that says nothing under `lib/` (other than `lib/format.ts`) or `app/` moved outside this loop's own two files. Step 2 grew because `lib/format.ts` is its ledger's subject (`10h-FM6`, plus the new ⚠ test it reddens: 29 → 30 marks checked); step 9 grew by `10h-PS11` (154 → 155 marks); step 10 owns every other file this reconciliation touched.

⚠ **Step 10's row is from a SECOND run**, and the first run's exit code is the finding of §5.1: the ledger reported one ⚠ test that no mutation reddens — one this reconciliation had itself made inert — and **returned 1**. The other eight rows are from the first run, which no part of that fix could reach.


### 7.2 The browser measurements

| what | result |
|---|---|
| `measure-breakpoints.mjs` | **59 passed · 0 failed · 0 blocked · 59 total, exit 0** — the run on the shipped tree, after every probe was reversed |
| `measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture` | **exit 0**; band 43 / grid 717.8 · 753.4 · 753.4, overflow 0 at all three, open and closed alike |
| `check-density.mjs` (no `--oq`) | **exit 0, ALL PASS**, spare **263.2 / 227.6 / 283.6 px** — identical to the digit to 10f's, 10g's, 10h's build's and 10h's test's runs |
| **eight probes**, each one variable and each reversed with the edit that reverses it, `diff`ed clean afterwards | §2.1's three guard defects (in `vitest`); §2.2's compensating share pair; §3's 0.98 shares; §4.2's focus-ring revert; §4.1's `max-width: none`; and §6's `10h-Q1` re-measurement (`body { font-size: 16px }`) |

### 7.3 `pnpm verify`, cold

```
$ pnpm verify
> rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run

 Test Files  101 passed (101)
      Tests  3061 passed (3061)
Type Errors  no errors

PNPM_VERIFY_EXIT=0
```

3056 inherited, **+5**: two on the header's `hostnameTitle` (both sides of the optional prop), one on
the hostname's CSS bound, one on the inset focus ring, one on `formatModelName`'s zero-width case.
`app/dashboard-shell.test.tsx`'s existing hostname test was strengthened rather than added to (§5.1),
so it does not appear in that count.


### 7.4 `git status`

```
$ git status --short
 M app/dashboard-shell.test.tsx
 M app/dashboard-shell.tsx
 M components/alarm-banner.module.css
 M components/alarm-banner.test.tsx
 M components/alarm-banner.tsx
 M components/grid.module.css
 M components/grid.test.tsx
 M components/header.module.css
 M components/header.test.tsx
 M components/header.tsx
 M components/panel-shell.module.css
 M components/panel-shell.test.tsx
 M components/panel-shell.tsx
 M components/panels/gpu-panel.test.tsx
 M components/panels/gpu-panel.tsx
 M components/panels/serving-panel.test.tsx
 M components/panels/serving-panel.tsx
 M components/panels/status-row.test.tsx
 M components/panels/status-row.tsx
 M components/strip.test.tsx
 M components/strip.tsx
 M components/styles.test.ts
 M components/tokens.css
 M lib/format.test.ts
 M lib/format.ts
 M pipeline/ANCHOR.md
 M pipeline/HANDOVER.md
 M pipeline/steps/02-format-severity/regressions.py
 M pipeline/steps/09-ui-primitives/regressions.py
 M pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
 M pipeline/steps/10-panels-assembly/regressions.py
?? pipeline/handoffs/10h-adversarial.md
?? pipeline/handoffs/10h-bound-the-grid.md
?? pipeline/handoffs/10h-reconcile.md
?? pipeline/handoffs/10h-test-phase.md
?? pipeline/steps/10-panels-assembly/10h-adversarial.md
?? pipeline/steps/10-panels-assembly/10h-build.md
?? pipeline/steps/10-panels-assembly/10h-reconciliation.md
?? pipeline/steps/10-panels-assembly/10h-test.md
```

**31 modified, 8 untracked.** Nothing committed, nothing staged, **no `.env`**, and
`next-env.d.ts` is byte-identical (`git diff` on it is empty — `measure-breakpoints.mjs` restores
it and `git status` agrees). ⚠ **No stranded mutation**: `git status` was re-read after the
harnesses finished, not while they were running — a file under a running harness is mutated for a
second or two at a time, and a check taken then reports the harness's own in-flight edit as a
defect (this phase saw exactly that, `lib/collectors/io.ts` mid-run, and re-checked afterwards).

**No browser and no `next dev` survives this phase.** `measure-breakpoints.mjs` and
`measure-arrangements.mjs` each own their own server and kill their own process group; after the last
run, ports **39173** and **39174** are free and no `next dev` process exists. The user's `:8391` and
`:8392` were never touched, and the only browser processes on the machine are the user's own.

The seven paths this reconciliation added to the inherited 24: `app/dashboard-shell.tsx`,
`app/dashboard-shell.test.tsx`, `components/header.module.css`, `components/header.test.tsx`,
`components/header.tsx`, `pipeline/ANCHOR.md` and `pipeline/HANDOVER.md`. **`SPEC.md` and
`MOCK.html` do not appear**, and neither does anything under `lib/` other than `lib/format.ts`
and its test.


---

## 8. What a reviewer should check first

1. **§3's table, both columns.** The headroom ruling is the one place this phase did not do what it
   was told, and it says so with two full measurement runs behind it. The rejection to audit is
   *"do not ship 0.98"*; the evidence is the four FAILing clipping records and which panels they name.
2. **`recordNoClipping`'s probe (§2.2).** 44/44 → 2 failed on the same defect is the whole of why
   this loop's acceptance is different in kind from the one it inherited.
3. **The three guard fixes (§2.1) against their probes.** Each is a one-line defect that used to
   leave 3056 tests green.
4. **§6's `10h-Q1` and `10h-Q3`.** The band is still a constant subtracted rather than a bound
   enforced, and 59 px of it is reserved unconditionally. Neither is fixed here and both are named.
