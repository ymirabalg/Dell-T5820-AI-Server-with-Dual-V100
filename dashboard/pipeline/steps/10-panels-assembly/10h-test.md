# 10h — TEST. **The bound works, on all nine panels and not just the three the fixture overflowed — and the page fits by construction only while the SIXTH term holds, which is the one nothing bounds.**

**Written 2026-09-10 by the test phase.** Nothing committed. `SPEC.md` and `MOCK.html` untouched.
No guard weakened. Every number below was measured on the tree it describes, in real headless
Chrome, by this phase.

---

## 0. The headline

| | |
|---|---|
| the builder's claims | **all reproduced.** `measure-breakpoints.mjs` 38/38 at the inherited tree, hostile page +28 / +4 / +36, `check-density.mjs` untouched, `pnpm verify` exit 0 at 3054 tests |
| ⚠⚠ the one that does NOT hold | **§6.1's *"for any telemetry whatsoever"* is not yet true.** The row caps are sound; `--band-reserve: 102px` is a **measured constant, not a bound**, and the band carries §3.2's `hostname`. A 79-character FQDN wraps the header at 1280, takes the band **101.8 → 130.7 px**, and the hostile page goes **1 px OVER** with every row cap holding and every slot height unchanged. §5 |
| the margin at 1600×1024 | **+4 px is the construction's own residue, not slack.** Three of the four rows sit exactly AT their caps there (gpu0 200/199.8, cpu 263/263.9, serving 168/168.1); the 4 px is row 3's 3.3 px of headroom plus the band's 0.2. Telemetry cannot eat it — only a change to one of the three subtracted terms can |
| priority 2, the real answer | **all nine panels, at all three viewports, now measured scrolling** — 3000 px into each body in turn, slot pinned to its row cap to the digit, body 119–498 px of 3007–3378, page still fitting. Before this phase, **three** panels had ever been seen to scroll |
| priority 8, the same shape one guard over | **found.** `grid.test.tsx` read the RAW stylesheet, so wrapping the `.serving, .log` cap in a CSS comment left it green at 121 tests. Fixed; the fixed guard was shown to bite |
| priority 3, a second hole | the head records answer *"the first header in the slot is outside the scroller"*, not *"no header is inside it"* — a SECOND `<header>` inside `.body` passed every one of them. Closed in measurement 15 |
| a cross-file staleness | `--grid-pad-v: 21px` and `--grid-row-gaps: 27px` were **re-typed copies** of `.grid`'s own `padding` and `gap`, with nothing tying them. `gap: 9px → 12px` (its pre-10e value) leaves the whole suite green and the page 9 px over. Closed, with `10h-GR11` |
| new measurement | **15**, six records, every one probed by breaking it |
| ⚠ all five probes | each reproduced the record it targets, and two found a hole the build's probes could not. §4 |

---

## §2 — the nine priorities, in order

### 1. ⚠⚠ The +4 px, and whether the construction is a construction

**The question was: does the sum-to-1 assertion constrain the shipped values, or would it pass
for a different set that overflows?** Answered three ways, by changing the shares and running
the file.

| edit | what fails |
|---|---|
| one share moved a point (`--row1-max` 0.2286 → **0.2386**) | **two tests**: the literal pin for `row1` AND *"the four shares sum to exactly 1"* |
| a COMPENSATING pair (0.2286/0.3019 → **0.1286/0.4019**, still summing to 1) | the two literal pins and *"every share leaves the panel its HEALTHY measured height"*. **The sum test passes** — correctly, because that set does still fit; it clips GPU instead |
| row 1 and row 3 SWAPPED (0.2772 / 0.2286) | only the literal pins. Sum passes, healthy passes — and the page does still fit |

So the assertion is **not vacuous** — it bites on any non-compensating edit — and it is **not
what pins the shipped numbers** either; the four `test.each` literals are. The three tests
divide cleanly: the literals say *which* set, the sum says *the set is complete*, and the
healthy-height test says *the set does not shrink a panel that already fitted*. Nothing here
"would pass for a different set that overflows", because **no set summing to 1 overflows** —
which is the point, and also the problem, because it means the assertion is one premise of
four and the other three are unasserted arithmetic:

```
page height = band + grid padding + row gaps + Σ rows      (each row ≤ its cap)
Σ caps      = 100vh − --band-reserve − --grid-pad-v − --grid-row-gaps
⇒ the page fits  ⟺  band ≤ --band-reserve  ∧  padding = --grid-pad-v  ∧  gaps = --grid-row-gaps
```

The sum-to-1 property is the `Σ caps` line. **The three `⟺` conditions are what actually decide
it, and at the start of this phase not one of them was checked against the thing it names.**
Two were re-typed copies of another file's declarations and one was a measurement of a box
nothing bounds. The band is §5's silence 1; the copies are closed in §3 with `10h-GR11` behind them.

**The +4 px is not margin.** At 1600×1024, measured: `--rows-available` = 1024 − 102 − 21 − 27 =
**874 px**, and the caps are 199.8 / 263.9 / 242.3 / 168.1. The measured slots are **200 / 263 /
239 / 168** — rows 1, 2 and 4 are AT their caps, row 3 is 3.3 px under, and the band is 101.8 of
its 102. 3.3 + 0.2 + rounding = the 4 px. So the number to carry forward is not *"4 px of
headroom"* but ***"this page is at its constructed maximum"***: no telemetry can take it lower,
and **every cap is load-bearing** — neutralising row 1's alone (`max-height: none`, nothing else)
puts measurement 14 at **FAIL at 1600×1024** while 1280 and 1920 still pass.

### 2. `min-height: 0` and `flex: 0 1 auto` — proved for EVERY panel, which it was not

**Which panels had actually been seen to scroll: three.** Measurement 14 records body geometry
for all nine, but on the hostile page only `gpu0`, `gpu1` and `serving` overflow — so six of the
nine panels' `min-height: 0` could be deleted and no measured page would notice.

**Measurement 15** puts a 3000 px child into each panel body in turn and asks the three
questions the ruling makes. Measured, all nine, all three viewports:

| 1600×1024 | slot / cap | body client of scroll | head |
|---|---|---|---|
| `gpu0`, `gpu1` | 199.8 / **199.8** | 150 of 3173 | 25.8 |
| `cooling` | 515.1 / **515.1** | 465 of 3378 | 25.8 |
| `cpu` | 263.9 / **263.9** | 214 of 3218 | 25.8 |
| `memory` | 263.9 / **263.9** | 215 of 3144 | 25.1 |
| `safety`, `storage-and-network` | 242.3 / **242.3** | 193 of 3169–3195 | 25.1 |
| `serving` | 168.1 / **168.1** | 119 of 3170 | 25.1 |
| `session-event-log` | 168.1 / **168.1** | 122 of 3007 | 21.8 |

Every slot stops **exactly at its own row's cap** — the panel does not grow, the body absorbs
it — and `documentElement.scrollHeight <= clientHeight` holds throughout, so a panel asked for
twenty times its height costs the page nothing. `--row23-max` is confirmed as rows 2 + 9 + 3
arithmetically as well as in text: 263.861 + 9 + 242.273 = **515.134**, and COOLING stops there.

### 3. The head is pinned — and the records had a hole

**Proved, with the body scrolled to its very end** (`body.scrollTop = body.scrollHeight`), for
all nine panels at all three viewports: the head is not a descendant of the scroller, its height
is unchanged from scroll 0, its box is inside the slot's own rectangle, and each part §6.1 names
by name — the `h2` title, the subtitle `p`, and the chip where one exists — still has a
rectangle of its own on screen. (SESSION EVENT LOG renders no chip: §6.1's OQ-4 ruling.)

**But *"the head is not itself inside the scroller anywhere"* was NOT what the records checked.**
Both measurement 14's head records and measurement 15's first draft read
`slot.querySelector('header')`, which returns the FIRST header in document order — so they
answer *"the head this measurement found is outside the body"*. Measured: adding a **second**
`<header>` inside `.body` left **43 of 43 records green**. Measurement 15 now also requires
`body.querySelector('header') === null`, and that strengthening was probed: the same defect now
FAILS all three of its records while measurement 14's still pass, which is exactly the residual
difference and is recorded rather than papered over.

The builder's own probe reproduces: moving the real head inside `.body` fails
`14. … every panel HEAD is intact` at all three viewports and all three of measurement 15's —
**and the page still fits**, which is why the fit record cannot stand in for the head record.

### 4. Both sides of the `(min-width: 1280px) and (min-height: 1024px)` bound

Measured in a browser, on the hostile page, and now a record (`15.` the row caps exist …):

| viewport | columns | slots carrying a cap | page height |
|---|---|---|---|
| **1280×1024** | 4 | **9 of 9** | 1024 of 1024 |
| 1279×1024 | 2 | **0 of 9** | 1606 of 1024 |
| 1280×1023 | 4 | **0 of 9** | **1115 of 1023** |

That is right per §6.1 (*"the promise holds at ≥1280px wide and ≥1024px tall. Below either
bound, legibility wins, so a 1280×800 display does scroll"*), and **nothing else changes at the
height boundary**: `min-height` appears in exactly one media query in the whole stylesheet set,
and the column count is a width breakpoint. Recorded for the owner, not argued away: the
discontinuity is **92 px of scroll for one pixel of viewport height** — at 1023 tall the caps
would compute to 873 px against 874, i.e. they would still fit, so the cliff is the reading of
the sentence rather than anything the arithmetic requires. §5's silence 2.

### 5. ⚠⚠ §6.4's `+N more`, and the term that broke the promise

**`N` is never arithmetically wrong**, and the 10g `… N more` lesson does not transfer:
`hidden = rest.length - shown.length`, so `1 + drawn + hidden === count` is an identity, not an
estimate. The wells' marker was a *lower bound on lines*; this one counts conditions that are
**absent from the DOM**. Measured on the acceptance page: **529 conditions announced, 3 drawn,
`+525 more`**, banner height 58.8 px — the same 58.8 as at two conditions.

**The half that could still go wrong is text width**, and measurement 12 grades it only at
2/6/12/21 with two-word labels. A new record grades it on the 500-condition page, whose subjects
run to three digits (`gpu 169 temperature`): the last drawn item's bottom edge is inside the
well's one visible line. **PASS.**

**The marker is reachable and announced**: it is a plain `<span>` in the banner's `role="alert"`
region, NOT `aria-hidden` (unlike a well's marker, because these conditions really are absent),
and it is a `flex: 0 0 auto` SIBLING of the `flex: 1 1 0` well, so it cannot itself be the item
scrolled out of view. Both halves are asserted in `alarm-banner.test.tsx` and measured here.

**⚠ What DID break the fold is the box the banner sits in.** `--band-reserve: 102px` = the 43 px
header + §6.4's fixed 58.8 px banner. It is a **measurement of two boxes, not a bound on either**,
and `header.module.css`'s `.header` is `flex-wrap: wrap` carrying `snapshot.hostname` — §3.2
telemetry of unbounded length, `white-space: nowrap`, never shortened. Measured, hostile fixture,
one field changed:

| hostname | band at 1280 | measurement 14 at 1280×1024 |
|---|---|---|
| `ai-server` (9 chars) | 101.8 | **PASS, +28 px** |
| `ai-server.rack14.datacenter-east.internal.example.com` (53) | 101.8 | PASS, +28 px |
| `ai-server.rack14.row-c.datacenter-east.corp.internal.example-holdings-group.com` (79) | **130.7** | **FAIL, −1 px** |

Every row cap held; every slot height was identical to the passing run. **The overflow is
entirely in the term the caps subtract.** This is the fifth unbounded term in the sequence
§6.1's ruling was written to end (notes wells → throttle line → table views → banner → **the
band**), and it is not fixed here: shortening or truncating a hostname is a rendering rule §6.2
does not state, and invariant 7 says record it. §5's silence 1.

New record `15. the sticky band fits inside --band-reserve` names the premise and prints both
numbers on PASS (`101.8 of 102` at all three viewports — **0.2 px**). Probed: it FAILS on the long
hostname, and it names the cause where the fit record only reports the symptom.

### 6. `formatModelName`

Read against §3.4 and exercised at every boundary the priority names. All correct:

| input | renders |
|---|---|
| `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf` | `Qwen3.6-27B-Q4_K_M.gguf` |
| `qwen3.6-27b` (a bare alias) | `qwen3.6-27b` |
| `/models/UNSLOTH/…-Q4_K_M.gguf` (deep) | `Qwen3.5-35B-A3B-UD-Q4_K_M.gguf` |
| `/home/yorman/models/` , `/` (no basename) | the whole string — never a blank cell (§6.6) |
| `''` , `'   '` , `null` | `—` |
| `models\a.gguf` (Windows-ish) | unchanged — the box is Linux |
| `' /models/ a.gguf '` | `a.gguf` (trimmed on both sides of the cut) |

**One case the fixtures did not carry, and it is a real §3.4 input**: a slash-bearing name that
is not a filesystem path — `unsloth/Qwen3.6-27B-GGUF`, llama.cpp's `-hf` argument, or an `ALIAS`
set to one. It is cut like a path and **the org is dropped**. That follows from the ruling as
written and the whole string stays in the `title`, so it is added as a fixture and **recorded**
rather than guarded — an org-bearing id left whole would be a change to §3.4, not a bug here.
§5's silence 3.

**The `title` is on both call sites and nowhere else.** `model` is read in exactly two render
paths (`serving-panel.tsx:100`, `gpu-panel.tsx:265`); both pass the raw value and both sides of
the optional prop are fixtured and mutated (`10h-SR1`/`SR2`, `10h-ST1`/`ST2`, `10h-GP2`/`GP3`).
**The wire is untouched** — nothing under `lib/client/` or `lib/collectors/` is in this item's
diff, so §3.1's raw reading is unaffected; `lib/format.ts` is the only `lib/` file that moved.
§3.4's *"and the table view"* still has no subject (the build's silence 4 is correct: SERVING
draws no chart, and the GPU card's table view is its temperature series).

### 7. Six measurement records, re-probed — and the two RE-AIMED ones read against `HEAD`

**Five probes run, each one variable, each reversed with the edit that reverses it** (never
`git checkout --`), and `git diff | shasum` compared against the inherited value after every one.
§4 has the table. Three of the six new records were probed here, including the hostile one, and
two probes found something the build's did not (§3's second header, §5's band).

**The two re-aimed measurement-12 records are not weaker.** Read against
`git show HEAD:…/measure-breakpoints.mjs`:

| HEAD | now | verdict |
|---|---|---|
| `itemsInDom === stage−1` **and** every item has text **and** the last has text | `itemsWithText === itemsInDom` **and** the last has text **and** `1 + drawn + more === stage` | the exact-count pin is **false by design** under the 2026-09-10 ruling; what replaces it is a reconciliation the old shape could not express. The drawn count itself is pinned by `expect(BANNER_REST_SHOWN).toBe(3)` in `alarm-banner.test.tsx`, so nothing is unpinned |
| last item's bottom inside `restScrollHeight` | last item's bottom inside `restClientHeight` | **strictly stronger** — the old one is exactly what let 16 of 21 sit below the fold and report PASS |

Both keep `restVisible` and `restClientHeight >= 20`, so 10g's `display: none` hole stays shut.
The `alarm-banner.test.tsx` re-aim is stronger in three further ways the build undersold: it now
asserts the tail labels are **absent**, the `<i>` count equals the drawn count exactly, and the
marker is absent at `hidden === 0`.

**One residual, recorded:** the browser records no longer pin *how many* the banner draws, so a
banner drawing zero and saying `+N more` reconciles. `expect(BANNER_REST_SHOWN).toBe(3)` is the
guard that refuses it, and `10h-AB1` reddens that test — so it is covered, in vitest rather than
in the browser.

### 8. ⚠ A CSS-text assertion satisfied by a comment — the `10h-GR10` shape, one guard over

**Found, in the guard that holds the whole ruling up.** `grid.test.tsx`'s `capsBlock()` sliced
the **raw** stylesheet, so a rule inside a CSS comment satisfies it. Measured: wrapping

```css
  .serving,
  .log {
    max-height: var(--row4-max);
  }
```

in `/* … */` left `grid.test.tsx` and `styles.test.ts` green at **121 tests, 0 failed** — and
SERVING is the panel that hides the most on the graded page (109 px at 1280). The neighbouring
test in the same `describe` already stripped comments *because 10h-GR10 had bitten there*; the
eight per-slot `test.each` rows and the COOLING rule did not.

Fixed by hoisting one comment-stripped `DECLARATIONS` constant and reading every assertion in
that block from it (`.cooling`'s `align-self: stretch` included, which had the same shape). The
fixed guard was then re-run against the same commented-out cap: **2 failed**, `serving` and
`log`. Nothing was weakened — the mutations `10h-GR1`…`GR5` replace declarations rather than
comment them, so they bit before and bite now.

**Swept the rest of 10h's new CSS-text assertions**: `panel-shell.test.tsx` strips comments at
the point it reads the file, `alarm-banner.test.tsx` does the same, and `styles.test.ts` reads
through `declarationsOf`. `grid.test.tsx` was the only one, and after the fix exactly **one**
raw-`CSS` match survives in it — the pre-dating *"every class grid.tsx binds declares the
grid-area of the same name"* (`grid.test.tsx:371`). It is not satisfiable by anything in that
file's comments today (no `.gpu0 { grid-area: gpu0;` appears in prose), so it was left alone as
out of this item's scope — but it has the same latent shape and is named here so the next loop
touching that file does not have to rediscover it.

### 9. Names against bodies, entropy, timers, `toContain`

- **Names vs bodies.** 10h's new tests match their names, with two mild over-claims recorded
  rather than renamed (a rename is a ledger change, §5.2 rule 8, and neither is wrong):
  *"⚠ an ALIAS model is unchanged, and still carries its own title — **one code path, not two**"*
  asserts the rendering, not the path count; and *"⚠ the four shares sum to exactly 1 — **which
  is why the page fits by construction**"* names a consequence its body cannot see and which §1
  shows to be conditional on three other terms.
- **Entropy and timers**: 10h added none. Every new test is static markup or CSS text; the only
  randomness in the item is `measure-breakpoints.mjs`'s ephemeral password, which predates it.
- **The `toContain` shape**: no new whole-document `toContain` of a bare `data-severity` or a bare
  em dash. The new ones match long specific literals (`title="/home/yorman/…"`) or a scoped
  substring (`rowFor(html, 'llama-server@0')`), and two of them count occurrences exactly
  (`expect((html.match(/title=/g) ?? []).length).toBe(1)`), which is the stronger form this
  project asked for. `tocontain-scope.test.ts` passes.
- **⚠ marks**: 1075 scanned across the tree. **10h introduced no new cross-file duplicate key**
  (the eight families found are the seven `10g-Q4` ones plus the recorded `force-dynamic` pair),
  and no key under 12 characters. Every new `test.each` name puts its placeholder late.

---

## 3. What changed in the tree, and why each one

| file | change | why |
|---|---|---|
| `components/grid.test.tsx` | `capsBlock()` and the `align-self` assertion read **comment-stripped** declarations | §2.8 — the caps passed while commented out |
| `components/grid.test.tsx` | new test: `--grid-pad-v` / `--grid-row-gaps` **derived** from `.grid`'s own `padding` / `gap` | they were re-typed copies with nothing tying them; `gap: 9px → 12px` is green today and 9 px over |
| `pipeline/steps/10-panels-assembly/regressions.py` | `10h-GR11` — the grid's row gap goes back to its pre-10e 12px | the mutation that reddens the test above |
| `lib/format.test.ts` | a Hugging Face repo id renders as its last segment (plain, not ⚠) | §2.6 — a real §3.4 input the fixtures did not carry; records the consequence, and the rule already has `10h-FM1`…`FM5` |
| `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` | **measurement 15**, six records | §2.2/§2.3/§2.4/§2.5 — the mechanism on all nine panels, the head at the scroll bottom, both sides of §6.1's bound, the band premise, and the banner on the 500-condition page |

**Nothing else moved.** Every source file under `components/`, `lib/` and `app/` carries exactly
the diff this phase inherited, verified with `git diff <file> | shasum` after each probe.

---

## 4. The five probes

Each ran the whole of `measure-breakpoints.mjs` on a tree differing in one thing, then reversed
it with the edit that reverses it.

| # | the defect | result |
|---|---|---|
| 1 | `--row1-max` cap → `max-height: none`, nothing else | **`14.` FAILS at 1600×1024 only** (1280 +28 and 1920 +36 still pass); **`15.` FAILS at all three**. 4 failed of 43 |
| 2a | a SECOND `<header>` inside `.body` | ⚠ **43 passed, 0 failed** — the hole in §2.3. After the strengthening: **3 failed** (measurement 15's), measurement 14's still pass |
| 2b | the real head MOVED inside `.body` | `14. … every panel HEAD is intact` **FAILS ×3** and `15.` **FAILS ×3**; every fit record still passes. 6 failed of 43 |
| 3 | `` `+${hidden} more` `` → `` `+${hidden + 1} more` `` | `12.` and `14.` accounting records **FAIL**, nothing else. 2 failed of 43. Detail printed: `{"announced":529,"drawn":3,"more":526}` |
| 4 | a 79-character hostname on the hostile fixture | `15. the sticky band …` **FAILS** (`1280x1024: 130.7 of 102`), `14.` at 1280 **FAILS** (`overflowPx 1`), `15.` at 1280 fails with it. 3 failed of 44 |
| 5 | the caps' query → `(min-height: 900px)` (the shape of `10h-GR5`) | `15. the row caps exist at … NEITHER side` **FAILS** — `1280x1023` reports `9/9 capped`. 1 failed of 44 |

And the CSS-comment probe of §2.8, run against vitest rather than the browser, with the
`.serving, .log` cap wrapped in `/* … */`: **`grid.test.tsx` + `styles.test.ts` = 121 passed, 0
failed** on the inherited guard; **`grid.test.tsx` = 2 failed** (`serving`, `log`) on the fixed
one, and 54 passed again once the cap was restored.

---

## 5. For the owner — three silences this phase found, none of them chosen

1. ⚠⚠ **The sticky band is the fifth unbounded term, and it is the one §6.1's promise now rests
   on.** `--band-reserve: 102px` is a measurement of the header plus §6.4's fixed banner; the
   header is `flex-wrap: wrap` and carries `snapshot.hostname`, which §3.2 does not bound and no
   formatter shortens. Measured: a 79-character FQDN takes the band to **130.7 px** and the
   hostile page **1 px over** at 1280×1024, with every row cap holding. The fix is a rendering
   rule the spec does not state — shorten the hostname the way §3.4 now shortens `model`, bound
   the band's height and let the header's own content scroll or truncate, or make
   `--rows-available` measure the band (which needs a hook `components/` may not have). **Not
   built.** Measurement 15 names the premise so the next loop cannot inherit it silently.
   ⚠ **Neither half of the band is bounded in CSS** — `.rest` carries the only `height` in
   `alarm-banner.module.css`, so the banner's 58.8 px is a measurement of `.head` + one line
   too, and `.head` is `flex-wrap: wrap` as well. That half is *reasoning, not a measurement*:
   the lead's label comes from §6.3's closed vocabulary and its value from a formatter, so
   nothing plausible fills 1200 px — where the hostname is free-form and did. The threshold
   measured for the hostname at 1280 is **between 53 and 79 characters** (53 fits, 79 wraps).
2. **The height bound is a 92 px cliff.** At 1280×1023 the page scrolls by 92 px; at 1280×1024 it
   fits exactly. The caps would still fit at 1023 (873 px of rows against 874), so the
   discontinuity is entirely the reading of *"below either bound, legibility wins"* — which is a
   reading of the sentence, as the build's own silence 7 says. Whether a 1280×1000 display should
   get the caps or the scroll is the owner's.
3. **A slash-bearing model id that is not a path loses its org.** `unsloth/Qwen3.6-27B-GGUF`
   renders `Qwen3.6-27B-GGUF`. §3.4 says *"a path's identity is its filename"* and gives no rule
   for a repo id; the whole string stays in the `title` at both call sites. Fixtured and recorded.

---

## 6. Everything that was run, on the tree this file describes

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"   # node v24.16.0
```

| what | result |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 3056 tests, no type errors** (3054 inherited; +2, one ⚠ with a mutation and one plain) |
| `measure-breakpoints.mjs` | **44 passed · 0 failed · 0 blocked · 44 total, exit 0** (38 inherited + measurement 15's six) |
| `mocks/measure-arrangements.mjs` + `check-density.mjs --fixture box` | **ALL PASS**, spare **263.2 / 227.6 / 283.6 px** — identical to the figures the build reported, so the bound still shrinks no panel that already fits |
| the hostile page (m14) | **+28 / +4 / +36 px** — unchanged by anything this phase did |
| the nine harnesses | **all nine exit 0.** Table below |

⚠ **On how the nine were run.** They were run **serially, in one call**, as the build's own note
describes (the foreground tool caps at 10 minutes and the set takes longer, so it was one
detached command, strictly serial, nothing beside it, and no `pgrep` anywhere). Steps 3–10 read
the tree exactly as this file leaves it. **Step 2 was then re-run on its own**, because
`lib/format.test.ts` gained its Hugging-Face fixture after step 2's first pass and a stale
number would be a number nobody could reconcile; its row below is from that second run.

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | 65 | **281** red across 65; 29 ⚠ checked | **exit 0** |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | 152 | 209 red across 152; 154 ⚠ checked | **exit 0** |
| `10-panels-assembly` | **291** | **338** red across 291; **299** ⚠ checked | **exit 0** |

**1170 mutations** (1169 inherited + `10h-GR11`), **zero `ANCHOR NOT FOUND`, zero `ANCHOR
AMBIGUOUS`, zero `DID NOT BITE`, zero unmatchable ledger keys, and every ⚠ mark reddened.**
`10h-GR11` reddens exactly one test — the new derived-token one — and step 10's checked-mark
count moved 298 → 299 with it, which is the ledger confirming the new mark is not inert.
Steps 3–9 are identical to the build's run in every column, which is the check that says nothing
else moved.

⚠ The `!!! … a test/it call the ⚠-scanner cannot read` lines in steps 3 and 5 are **pre-existing**
(template-literal test names in `lib/collectors/numbers.test.ts` and `proc.test.ts`, none of them
⚠-marked, none of them touched by 10h) and are warnings, not failures — all nine still exit 0.

**The tree.** Nothing committed, nothing staged, no `.env`, `next-env.d.ts` byte-identical (the
measurement script restores it and `git status` agrees), no stranded mutation: every source file
under `components/`, `lib/` and `app/` was hashed with `git diff <file> | shasum` after each of
the five probes and matched the value inherited from the build. No browser and no `next dev`
survives this phase — `measure-breakpoints.mjs` owns both and kills its own process group; the
only browser processes on the machine afterwards are the user's WebStorm ones.

```
$ git status --short
 M components/alarm-banner.module.css        M components/panels/serving-panel.tsx
 M components/alarm-banner.test.tsx          M components/panels/status-row.test.tsx
 M components/alarm-banner.tsx               M components/panels/status-row.tsx
 M components/grid.module.css                M components/strip.test.tsx
 M components/grid.test.tsx            ←     M components/strip.tsx
 M components/panel-shell.module.css         M components/styles.test.ts
 M components/panel-shell.test.tsx           M components/tokens.css
 M components/panel-shell.tsx                M lib/format.test.ts            ←
 M components/panels/gpu-panel.test.tsx      M lib/format.ts
 M components/panels/gpu-panel.tsx           M pipeline/steps/02-format-severity/regressions.py
 M components/panels/serving-panel.test.tsx  M pipeline/steps/09-ui-primitives/regressions.py
                                             M pipeline/steps/10-panels-assembly/measure-breakpoints.mjs  ←
                                             M pipeline/steps/10-panels-assembly/regressions.py           ←
?? pipeline/handoffs/10h-bound-the-grid.md
?? pipeline/handoffs/10h-test-phase.md
?? pipeline/steps/10-panels-assembly/10h-build.md
?? pipeline/steps/10-panels-assembly/10h-test.md
```

`←` marks the four files this phase changed. The other twenty carry the build's diff untouched.
