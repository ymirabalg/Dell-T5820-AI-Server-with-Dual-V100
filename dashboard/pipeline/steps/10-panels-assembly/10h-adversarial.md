# 10h — ADVERSARIAL. **The caps hold. The guards around them do not: three one-line edits put the acceptance page over the fold with all 3056 tests green, and a fourth clips a graded page with the browser acceptance at 44/44 and its headline number IMPROVING.**

**Written 2026-09-10 by the adversarial phase.** Nothing committed, nothing fixed, no edit left in the
tree (`git status --porcelain` is byte-identical to the inherited 24 `M` + 5 `??`; every experiment was
reversed with the edit that reverses it, never `git checkout --`). `SPEC.md` and `MOCK.html` untouched.
Every number below was measured by this phase, in real headless Chrome or in `vitest`, on the tree this
file describes.

⚠ The band/hostname finding of the TEST phase (§5.1 there) is **not** repeated here. `10h-A4` is a
*different* way to break the same premise and needs no telemetry at all.

---

## 0. The headline

| | |
|---|---|
| the mechanism | **sound.** The fit really is `band ≤ 102 ∧ padding = 21 ∧ gaps = 27`; two sweeps (15 heights × 1600 wide, 15 widths × 1024 tall) put `pageOver` at **0** everywhere. No telemetry and no row can overflow the page any more |
| ⚠⚠ the guards | **three one-line edits leave `pnpm exec vitest run` at 101 files / 3056 tests / no type errors and put the page 5, 21 and 37 px wrong.** A4/A1/A2/A8 |
| ⚠⚠ the acceptance | **a compensating share pair clips GPU on measurement 11's page and `measure-breakpoints.mjs` reports 44 passed, 0 failed** — with m11's printed spare moving 6 → **12 px**, i.e. the headline number *improves* as the page gets worse. A3 |
| the margin, measured on the pages that have one | m11 at 1600×1024: **0.8 / 0.8 / 2.9 / 1.3 px** per row. The healthy-height guard grades against constants **23.8 px** below the caps, so it cannot see any of that |
| new regression surface | the nine bodies are **horizontal** scrollers (`overflow-x` computes to `auto`; measured `auto/auto` on all nine) and every focus ring inside them is **clipped** — proven pixel-exact. A5, A6 |
| what the reserve costs | banner suppressed at 1600×1024: **74.6 px of empty screen** below the last panel while three bodies hide readings. On the ordinary healthy page, **275.2 px** unused at 1280. A7 |
| held | no horizontal overflow from real telemetry (incl. a 220-char ext4-legal filename and a 4000-char alias), no `scrollIntoView` leak, scroll survives the poll, one scrollbar below the bound, an opaque band, `+0 more` impossible, no stacked stickies, healthy and box-degraded pages clip nothing |
| the tree | `git status` matches what was inherited; `next-env.d.ts` restored byte-for-byte; no `.env`; no browser and no `next dev` left running (ports 39173/39181–39187 all free) |

---

## 1. Findings

### 10h-A1 — ⚠⚠ a one-line `gap` inside the ≥1280px query defeats `10h-GR11`; **5 px over, 3056/3056 green**

**Severity: high.** The guard the TEST phase wrote this loop to close exactly this hole is
first-match-only.

`components/grid.test.tsx:296` derives the two copied tokens with

```ts
const gridRule = /\.grid\s*\{([^}]*)\}/.exec(CSS.replace(/\/\*[\s\S]*?\*\//g, ' '))?.[1] ?? '';
```

`exec` returns the **first** `.grid { … }` block — `components/grid.module.css:52`. The file declares
`.grid` **four** times (`:52`, and again at `@media (min-width: 900px)` and
`@media (min-width: 1280px):83`, `:1279`-and-below variants), and the one that governs at §6.1's own
breakpoint is invisible to the regex. This is `10h-GR10` / the TEST phase's `querySelector('header')`
one guard over.

**Scenario.** Someone restores 10e's pre-density gutter at the design width, or a future layout tweak
sets `gap` per breakpoint — one line in the block that already exists.

**Proven (measured).** Added `gap: 12px;` to the `.grid` rule inside `@media (min-width: 1280px)`:

| | |
|---|---|
| `pnpm exec vitest run` | **101 files, 3056 tests, 0 failed, no type errors** |
| browser, hostile page, 1600×1024 | **page 1029 of 1024 — `pageOver 5`**, computed `row-gap: 12px`, `gpu0` hides 18, `gpu1` 18, `serving` 46 |
| 1280×1024 and 1920×1080 | still fit (their spare absorbs it) — so the only viewport that would catch it is 1600 |

Reverted; `git diff --numstat components/grid.module.css` back to `54 0`.

⚠ The same shape applies to `--grid-pad-v`: a `padding` declaration in that media block is equally
invisible.

---

### 10h-A2 — ⚠⚠ a duplicate `--band-reserve` five lines below the pinned one: **21 px over, 3056/3056 green**

**Severity: high.**

`components/grid.test.tsx:273` pins the term everything rests on with
`expect(TOKENS).toMatch(/--band-reserve:\s*102px;/)`. `toMatch` asks *does this text appear
somewhere*, not *is this the effective value*. In CSS the **last** declaration in a rule wins.

**Scenario.** The obvious response to `10h-A7` (59 px of reserve nobody spends) is to re-declare the
reserve — in a media query, in a `:root` block added by a later loop, or one line lower in the same
block.

**Proven (measured).** Added `--band-reserve: 43px;` immediately after
`components/tokens.css:206`:

| | |
|---|---|
| `pnpm exec vitest run` | **101 files, 3056 tests, 0 failed** |
| browser, hostile page, 1600×1024 | **page 1045 of 1024 — `pageOver 21`**; caps grew to 213.3 / 281.7 / 258.6 / 179.4 |

Reverted. **Every token in that block has the same exposure** — `--grid-pad-v`, `--grid-row-gaps`,
`--rows-available` and the four shares are all pinned by "this string appears", none by "this is what
the browser computes". `capsBlock()` (`grid.test.tsx:214`) has the mirror-image version: it slices
`DECLARATIONS` from the `@media` index **to end of file**, so a cap redeclared *after* the query — at
any width, unconditionally — satisfies it too (see `10h-A8`).

---

### 10h-A3 — ⚠⚠ a compensating share pair clips a graded page, and **nothing** catches it: 44/44, with the headline number improving

**Severity: high.** This is the parent's priority 9, and the second net is not real.

The caps turned every *"the page overflows"* failure into a silent *"a panel hides readings"*. Every
fit record grades the former. So the class of regression the caps introduced is the one class this
project's acceptance can no longer see.

**Proven (measured).** `--row1-max` `0.2286 → 0.2200` with `--row2-max` `0.3019 → 0.3105` — the sum is
still exactly 1, and both shares still clear their healthy constants:

| net | verdict |
|---|---|
| `⚠ the four shares sum to exactly 1` (`grid.test.tsx:329`) | **passes** — correctly; no set summing to 1 overflows |
| `⚠ every share leaves the panel its HEALTHY measured height` (`:342`) | **passes** — 198.1 > 176 |
| the four `test.each` literals (`:311`) | **2 fail** — the only net |
| `node measure-breakpoints.mjs` | ⚠⚠ **44 passed · 0 failed · 44 total, exit 0** |

And the direction of the numbers is the finding:

```
11. 1600x1024  spare 12 px … slots {"gpu0":192,"gpu1":192,…}      (inherited: spare 6, gpu0 199)
14. 1600x1024  scrolling bodies: gpu0 hides 26px · gpu1 hides 26px · serving hides 46px   (was 18/18/46)
```

**m11's spare went from 6 px to 12 px because 7 px of GPU readings were clipped.** The record that has
been this project's tightest fit measure since 10f now *rewards* the defect. m14's scrolling line moved
too, but it is printed, not graded.

The literals are therefore the whole guard — and they are exactly what an author edits when the task is
"adjust the shares". Measured margins on the page the project actually grades (m11, all sources
explained, this phase):

| | 1280×1024 | **1600×1024** | 1920×1080 |
|---|---|---|---|
| gpu0 / gpu1 | 12.3 | **0.8** | 13.6 |
| cpu | 24.8 | **0.8** | 17.7 |
| safety | 2.9 | **2.9** | 18.4 |
| serving | 1.3 | **1.3** | 12.0 |

The healthy-height guard's constants (176 / 240.1 / 159.4 / 129.8) sit **23.8 px** below the caps, i.e.
it grades a page 23 px shorter than the one that matters. **A share change of 0.002 clips m11 and
passes it.**

---

### 10h-A4 — ⚠⚠ the band premise breaks with **no telemetry at all**: a 16 px root text size takes the band to 105.6 px and the page 3 px over

**Severity: high.** Distinct from the TEST phase's hostname: this needs nothing on the wire.

`--band-reserve: 102px` is a measurement of the header plus the banner *at this app's own 12 px root
size* (`components/tokens.css:213`, `body { font-size: 12px }`). `tokens.css`'s own doc says the
density fix means *"a panel's height is arithmetic, not a function of an ancestor's font size"* — true
of the panels, **false of the band**, which is `flex-wrap: wrap` in both halves and is subtracted
rather than measured.

**Scenario.** Chrome's *Minimum font size* / *Font size* accessibility settings, a UA stylesheet that
does not honour the 12 px, or any future `:root` sizing change. No hostile fixture required.

**Proven (measured).** `document.body.style.fontSize = '16px'` on the hostile page:

| viewport | band | page |
|---|---|---|
| 1280×1024 | — | fits |
| **1600×1024** | **105.6 of 102** | **1027 of 1024 — `pageOver 3`**, with `gpu0` hiding 66, `gpu1` 600, `safety` 2, `serving` 610 |

Closing the hostname does not close this. The premise needs a **bound** on the band (or a measured
`--rows-available`), not a longer list of things that must not grow.

---

### 10h-A5 — the nine bodies are HORIZONTAL scrollers, and no guard, fade or record covers that axis

**Severity: medium (latent — no real content reaches it today).**

`panel-shell.module.css:131` sets `overflow-y: auto` and nothing else, so CSS computes
`overflow-x: visible → auto`. **Measured: every one of the nine bodies computes `overflow-x/overflow-y
= auto/auto`.**

**Proven (measured).** A 4000 px-wide child appended to SERVING's body at 1280×1024:
`scrollWidth 4000 / clientWidth 602`, `scrollLeft` driven to **3398**, `documentElement.scrollWidth`
unchanged at 1280. The page absorbs it; the reader loses it — the continuation fade is
`background-position: bottom` only, §6.1's subject *"has no pointer"*, and `styles.test.ts`'s
`BOUNDED` guard (`:180`) is a height-axis rule (`(?:max-)?height`) with no x-axis counterpart.

**What does NOT reach it today** (measured, so the finding is honest about its own reach): with the
hostile fixture carrying a **220-character ext4-legal filename** and a **4000-character alias**, all
nine bodies had `scrollWidth === clientWidth` at 1280/1600/1920 and the page fit. The strings wrap.
One `white-space: nowrap` child inside a body is all that stands between here and unreachable
readings, and nothing in the suite or the measurements would say so.

---

### 10h-A6 — every focus ring inside a scrolling body is CLIPPED, on the tab stops 10h itself added

**Severity: medium.** A regression this change introduced: `.body` was `overflow: visible` before 10h.

An outline is *ink* overflow — it never contributes to scrollable overflow — so a child flush with the
body's padding edge loses its ring to `overflow: auto`. `:focus-visible` here is
`outline: 2px solid #3987e5; outline-offset: 2px` (`tokens.css:224`), i.e. it paints 2–4 px **outside**
the border box, and the bodies have no padding.

**Proven (measured, pixel-exact).** CPU's first `[tabindex="0"]` well at 1280×1024, right edge at
940.75 and body right edge at **940.75** (margin 0). Screenshot of the 3 × 14 px strip at x = 941,
unfocused vs focused (`document.activeElement === el`, `el.matches(':focus-visible')` both true):
**the two PNGs are byte-identical (108 bytes each).** Nothing is painted there.

**Reach:** of 15 focusable children inside scrolling bodies on the hostile page, **10 sit at margin 0**
from a clip edge — every `` `${subject} messages` `` well (gpu0, gpu1, cooling, cpu, memory,
storage-and-network ×2), the session event log's scroller (both sides), and both GPU throttle wells
(right side). These are the tab stops 10f/10g/10h added *so that clipped content stays reachable*; the
one affordance that tells a keyboard user where they are is now invisible on them.

---

### 10h-A7 — the unconditional 59 px reserve is paid by panels that are actively hiding readings

**Severity: medium.** Recorded as build silence 6 — *"a page with no banner simply keeps 59 px it is
never asked to spend"*. Measured, it **is** asked to spend it.

**Proven (measured), 1600×1024, banner suppressed:**

| | |
|---|---|
| band | 101.8 → **43** |
| empty screen below the last panel | **74.6 px** |
| bodies hiding content at the same moment | `gpu0`, `gpu1`, `serving` |

And on the ordinary pages, where the reserve is pure loss (band 43, no banner):

| fixture | 1280×1024 | 1600×1024 | 1920×1080 |
|---|---|---|---|
| `box` (healthy) — unused at bottom | **275.2** | 239.6 | 295.6 |
| `box-degraded` (banner present) | 176.3 | 140.8 | 196.8 |

The reserve is what decides **when a body starts scrolling**, not merely how much screen is spare — so
an un-alarmed but degraded page begins hiding readings 59 px earlier than the arithmetic requires. The
build's own fix note ("a DOM attribute and two CSS lines") is the cheap half; `10h-A2` is what makes
attempting it dangerous.

---

### 10h-A8 — one brace takes COOLING's cap outside §6.1's condition: a 1280×800 display clips 37 px, suite green

**Severity: medium.**

`capsBlock()` (`grid.test.tsx:214`) returns `DECLARATIONS.slice(at)` — everything from the caps query to
**end of file** — and its companion (`:249`) asserts only that no `max-height` appears *before* `at`. A
cap that has fallen **out** of the query still lives after `at`, so both are satisfied.

**Proven (measured).** Moved the media block's closing `}` up one rule (one character's worth of edit)
so `.cooling { max-height: var(--row23-max) }` is unconditional:

| | |
|---|---|
| `pnpm exec vitest run` | **101 files, 3056 tests, 0 failed** |
| 1280×800 (§6.1's named "does scroll" display) | `.cooling` computes a **385.4 px** cap and its body **hides 37 px** |
| 1279×1024 / 1280×1023 | `.cooling` capped there too (515.1 / 514.6), not yet biting |

Reverted. *"Below either bound, legibility wins"* is the sentence this defeats, and it defeats it
silently.

---

### 10h-A9 — two of the five declarations the module doc calls load-bearing are inert, and one of them is what satisfies the boundedness guard

**Severity: low.** No behaviour is wrong; two claims are.

Measured at 1600×1024 with a 3000 px stuffer in `gpu0`'s body (slot pinned at its 199.78 cap):

| variant | slot | head | body client |
|---|---|---|---|
| as shipped (`.head { flex: 0 0 auto }`) | 199.78 | **25.81** | 150 |
| forced to the default `0 1 auto` | 199.78 | **25.81** | 150 |
| `.body { max-height: 100% }` → `none` | 199.78 | 25.81 | **150** |

- **`panel-shell.module.css:64` / `panel-shell.test.tsx:235`** — *"a panel squeezed to its cap would
  otherwise take the head's 6px padding-bottom … first"*. It would not: a flex item's automatic
  minimum size (`min-height: auto`) already refuses to shrink the head below its content, padding
  included. The declaration is harmless insurance; the reason given for it is measured false, and the
  test pins the text of a rule that changes nothing.
- **`panel-shell.module.css:130`** — `max-height: 100%` changes nothing when the slot is capped (flex
  already bounds the body) and resolves to `none` when it is not (a percentage against an auto-height
  `.panel`). It is the declaration that satisfies `styles.test.ts`'s `BOUNDED` guard (`:180`), whose
  whole point is *"`overflow-y: auto` on a box with no height/max-height does exactly nothing"* — so
  the guard is satisfied here by a declaration that does exactly nothing, in both regimes. The comment
  is candid about the real bound being one box up; the guard is not.
- For contrast, the third of the "first three" **is** real: `.body { flex: 1 1 auto }` measurably moves
  COOLING's body. Note that `0 1 auto` is the CSS *initial* value, so deleting the line is a no-op —
  only changing it is observable.

---

### 10h-A10 — `formatModelName`'s anti-blank-cell fallback is defeated by a zero-width character; `.` / `..` render as a lone dot; a bidi override reaches the screen

**Severity: low.** `lib/format.ts:519`.

```ts
const last = text.slice(text.lastIndexOf('/') + 1).trim();
return last === '' ? text : last;
```

Measured (18 inputs, run through the real function):

| input | renders | note |
|---|---|---|
| `/models/​` | `​` — **length 1, visually empty** | ⚠ `trim()` does not strip U+200B, so `last === ''` is false and the whole-string fallback never fires. §6.6's blank cell is exactly what appears — the case the fallback exists for |
| `/models/.` · `/models/..` | `.` · `..` | a cell that reads as a rendering fault |
| `/models/‮gguf.exe` | `‮gguf.exe` → paints as **`exe.gguf`** | the override survives into both the cell and the `title`, so neither half of §3.4's ruling shows the real name |
| `/models/ ` · `/models/\t` · `/models/   ` | `/models/` | correct — these *are* trimmed |
| `https://…/resolve/main/a.gguf` | `a.gguf` | correct |
| `'A'.repeat(4000)` | 4000 chars | the documented fallback; bounded by the panel (measured, `10h-A5`) |
| `models\a.gguf` | unchanged | documented (Linux) |

Reachable only by whoever writes `/etc/llama-server/<i>.env` or names the weights file, so this is
about honesty of rendering rather than an attack surface. The zero-width case is the one worth a line
of code: it is the guard's own stated purpose, failing.

---

## 2. What held — measured, not assumed

1. **The fit is genuinely by construction, and a sub-pixel in a row is a CLIP, never an overflow.**
   The parent's priority 2 rests on a premise this phase disproved: because Σcaps = `--rows-available`
   *exactly* and each row is clamped, `page = band + 21 + 27 + Σrows ≤ 100vh` for any row content
   whatsoever. Two sweeps on the hostile page, `pageOver` at every point:
   - **1600 wide, heights 1024 → 1080 in 4 px steps (15 points): 0 everywhere.**
   - **height 1024, widths 1280 / 1281 / 1300 / 1365 / 1400 / 1440 / 1500 / 1536 / 1599 / 1600 / 1680 /
     1728 / 1920 / 2560 / 3440: 0 everywhere, band 101.8 everywhere.**
   Only the three subtracted terms can break it — which is why A1, A2 and A4 are the findings and the
   rows are not.
2. **No horizontal overflow from real telemetry**, including a 220-char ext4-legal filename and a
   4000-char no-slash alias on all three instances, at all three viewports.
3. **No `scrollIntoView` leak.** `lastElementChild.scrollIntoView({block:'end'})` inside every
   scrolling body at 1280×1024: `documentElement.scrollTop`/`scrollLeft` stayed **0**, each head's
   `top` was unchanged to the sub-pixel and still inside its slot's rectangle.
4. **A scrolled body survives the poll.** SERVING's body driven to its bottom and re-read **14 s
   later (≥ 2 polls): identical `scrollTop`.** The affordance is not undone by the refresh.
5. **Below the bound there is one scrollbar for one overflow.** At 1280×1023 (page 1115 of 1023),
   1279×1024 (1606 of 1024) and 1280×900 (1115 of 800), **no panel body scrolls at all** — nothing is
   capped, so nothing is worse than the pre-10h page. (The cliff itself is real and stays the owner's:
   1 px of height is 92 px of scroll, 1 px of width is 582 px *and* the 2-column layout.)
6. **The sticky band is opaque over scrolling content.** At 1280×900 scrolled to 250, every pixel row
   of the band's rectangle hit-tests to a descendant of the band — no transparent stripe between the
   header and the banner (the `margin-top: 7px` 10g removed would have been one).
7. **The bound shrinks no panel that already fitted.** `box` and `box-degraded`, all three viewports:
   **no body hides anything**, page fits, tightest margin 23.8 px (`box`, row 1 at 1600).
8. **`+0 more` cannot be drawn** — `alarm-banner.tsx:165` is `hidden === 0 ? null : …`, so the marker
   is structurally absent at 1, 2, 3 and 4 conditions.
9. **No stacked-sticky repeat of 10a-F13.** The two `position: sticky` table heads
   (`sparkline.module.css:166`, `stacked-time-series-chart.module.css:163`) stick inside `.tableView`'s
   own bounded scroller, which is a child of the body — one sticky per scroller, not two per rectangle.
10. **The banner's lead cannot grow the band from telemetry.** Every `label`/`value` reaching it comes
    from a closed union (`UnitState`, `HealthState`, `LinkState`, `ThrottleMask`) or a formatter
    (`lib/client/observations.ts:383-520`); the only free-form strings on the page (`errors[].message`)
    never reach `.head`. The TEST phase's *reasoning* on this half is correct — but `10h-A4` breaks the
    same box a different way, so "the band is bounded" still does not follow.
11. **The `Chip` `.sr-only` family does not escape**: `.body` is `position: relative`, so every
    absolutely-positioned descendant is in its containing-block chain and is clipped — all nine bodies
    measured `scrollWidth === clientWidth` with the page at `pageOver 0`.

---

## 3. What I could not verify

1. **Fractional CSS-pixel viewport heights** (a non-integer device pixel ratio, e.g. a 1440 px panel at
   140 %). That is where the four caps, each a fraction of `100vh`, could round *up* independently and
   sum past `--rows-available` by up to four layout units — a 1 px phantom scrollbar for 1/16 px of
   overflow. `setViewportSize` takes integers and Playwright exposes no browser-zoom control, so this
   is reasoned, not run.
2. **Classic (non-overlay) scrollbars.** macOS gives every measurement this project has ever taken a
   zero-width scrollbar. On the Linux/Windows wall panel this dashboard is for, nine `overflow: auto`
   bodies each take ~15 px of width when they scroll (more wrapping, more clipping) and a horizontal
   one would take height from a box `100vh` does not know about. Nothing here is measured on that
   platform.
3. **Whether a clipped focus ring is invisible to a person.** I proved no pixels are painted outside
   the clip edge; I did not photograph a wall panel, and a ring that survives on the *top* edge of the
   first child may still orient a user.
4. **Whether `model: ''` can reach the client.** Both call sites elide the attribute only on `null`
   (`strip.tsx:49`, `status-row.tsx:177`), so an empty-string model would render `title=""` — the exact
   shape the build named as "the two ways this ships unnoticed". I did not trace `lib/client/wire.ts`
   to see whether `''` survives validation.
5. **A second `<header>` inside a `.body`** — the TEST phase closed this in measurement 15; I did not
   re-probe it, and measurement 14's own head records still take the first match.
6. **`prefers-reduced-motion`, a different font stack, and 125 % OS scaling** were not measured. The
   first two only change content height (a clip, never an overflow, by §2.1); the third is the cliff of
   §2.5 rather than a new failure, since browser zoom shrinks the CSS viewport below 1024.

---

## 4. Everything this phase ran

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"   # node v24.16.0
```

| run | result |
|---|---|
| `pnpm exec vitest run` (baseline) | 101 files, **3056** tests, no type errors, 3.4 s |
| five scratch browser harnesses (`scratchpad/probe{,2,3,4,5}.mjs` — copies of `measure-breakpoints.mjs` with its measurement block replaced, own ports 39181–39187) | 40 records across P1–P11, Q1–Q5, W1–W4, Y×9, Z×6 |
| `node measure-breakpoints.mjs` (unmodified, once, under the `10h-A3` defect) | **44 passed, 0 failed** — the finding |
| `vitest --config vitest.probe.mts` on a temporary `scripts/adv-format.probe.ts` | 18 `formatModelName` inputs; file deleted afterwards |
| the nine `regressions.py` harnesses | **not run** — this phase changed no source and no test, so the TEST phase's 1170-mutation run still describes the tree. Every experiment above was reversed and `git diff --numstat` re-checked after each |

**The tree.** Nothing committed, nothing staged, no `.env`. `next-env.d.ts` was rewritten by one probe
whose `finally` block was cut short by a `SIGPIPE` from a shell pipeline; it was restored to
`git show HEAD:…`'s bytes with an edit, not a checkout, and `git status --porcelain` now lists exactly
the 24 modified and 5 untracked paths this phase inherited. No browser and no `next dev` survives:
ports 39173 and 39181–39187 are all free (one orphaned dev server from the SIGPIPE run was killed by
pid; the user's :8391/:8392 were never touched).

---

## 5. What the owner should decide first

1. **`10h-A3`.** The caps made the acceptance blind to the failure mode the caps introduced. Until some
   record grades *"measurement 11's page clips nothing"*, the four `test.each` literals are the entire
   defence of a page with **0.8 px** of margin — and they are the line an author edits on purpose.
2. **`10h-A1` / `10h-A2` together.** Every term of the arithmetic is pinned by "this string appears in
   this file". Three of the four premises can be falsified one line at a time with the suite green.
   The shape is the same each time: **a text assertion cannot see a later override, and `exec`/`slice`
   take the first match.**
3. **`10h-A4`.** The band is the premise, and the hostname is only one of its handles. A 16 px root
   size gets there with no telemetry at all. Bounding the band's *height* closes both; enumerating the
   strings that must not grow closes neither.
4. **`10h-A6`.** Nine tab stops were added this loop so clipped content stays reachable, and the same
   change clipped the ring that shows a keyboard user where they are. One `padding` on `.body`, or
   `outline-offset: -2px` on the wells, is the size of the fix — but it is a §6 rendering decision,
   not a bug fix, so it is recorded rather than made.
