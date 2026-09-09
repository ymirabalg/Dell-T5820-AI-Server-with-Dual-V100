# 10d — Layout re-plan: measured arrangements, a recommendation, and a builder specification

**2026-09-09. Changes no production code. Edits no `SPEC.md`. Nothing committed.** Every number
below was read from real headless Chrome (system Google Chrome over CDP, `playwright-core`
1.63) driving the actual app, logged in, with `page.route` supplying the telemetry. Nothing is
estimated. The harness and the mocks are under `pipeline/steps/10-panels-assembly/mocks/`.

## 0. The answer in one screen

**Recommend arrangement B** — put COOLING in a column of its own beside the two GPU cards
stacked, and the four small panels in a 2×2 block to the right; SERVING and the SESSION EVENT
LOG go into a **closed `<details>` under the grid on the same page**. COOLING keeps its full
450 px stacked chart. Measured page height (sticky band + grid + the disclosure's summary line),
box-faithful healthy telemetry:

| viewport | page | **margin to the fold** | with a 2-alarm banner pinned (+58 px) |
|---|---|---|---|
| 1280 × 1024 | 930 | **94 px** | **36 px** |
| 1600 × 1024 | 944 | **80 px** | **22 px** |
| 1920 × 1080 | 944 | **136 px** | **78 px** |

Against §6.1 as built (overflow **356 / 418 / 362** with the same telemetry; the 596 / 632 / 560
10c-3 reported includes ~200 px of `errors[]` notes that only this Mac produces — §2.2).

What it costs: the ≥1600 px promoted GPU chart drops from 160 to 120 px painted (`plotHeight`
140 → 100); the two big charts are 400 px wide instead of 480; the sparkline is 200 px wide
instead of 220; at 1280 the four small panels are 244 px wide and their long rows wrap (visible
in `mocks/B-final-1280x1024.png`); SERVING and the LOG are one click away rather than on the
wall. **Nothing §6.2 requires is dropped, and COOLING's chart height — the load-bearing thing —
is untouched.**

Two defects the measurement found in the *shipped* code, both of which the builder must fix
(§2.1, §2.5): the session event log **grows the page through its clipped scroll box** (every
`Chip` renders a `position:absolute` `.sr-only` span, and nothing between it and the viewport
is positioned), and SERVING's instance row **overflows horizontally** in any column narrower
than ~450 px.

A **stage 2** (arrangement D, §4.6) bounds the grid to the viewport so the page can never
scroll — banner, table view, degraded state — at the price of panels clipping inside their cell
when content outgrows it. Measured; recommended as a follow-up that needs one owner ruling
(SCOPE 2.5f, the `--table-scroll-max` stopgap).

---

## 1. Method

### 1.1 What was built

`mocks/measure-arrangements.mjs` — the same machinery as `measure-breakpoints.mjs` (ephemeral
credential pair hashed by `scripts/hash-password.py`, `next dev` on :39174 in its own process
group, login through the real form, `page.route('**/api/telemetry**')` rewriting the response
in the browser, `documentElement.scrollHeight` vs `clientHeight` plus every `[data-slot]` rect,
`next-env.d.ts` restored afterwards) — plus:

- **`--fixture box`** (default): a whole fabricated snapshot of the machine `CLAUDE.md`
  describes — two `Tesla PG500-216` cards, the W-2135, 61.6 GiB, fan RPMs from the 2026-08-27
  characterisation, both `llama-server` instances active on `qwen3.6-27b`, every safety check
  `yes`, `errors: []`. This is the state the wall shows nearly all the time.
- **`--fixture mac`**: exactly what 10c-3 measured — this Mac's own `/api/telemetry` (every
  Linux collector failing, one `errors[]` note per failure) with only `gpus` fabricated. Kept
  so the two can be compared, and used below as the **degraded** case.
- **Arrangements as CSS injected over the live page** (`mocks/arrangements.mjs`). Panel content
  is genuine; only the grid and chart boxes change. Selectors out-specify `grid.module.css`
  (`div:has(> [data-slot="gpu0"])` beats `.grid`), so nothing is `!important`.
- **`CHART_SIZE` emulated by box**: the constant cannot be changed in-page, so each candidate
  value is applied as the CSS box the chart `<svg>` would paint — `plots × plotHeight +
  (plots − 1) × 10 + 20` tall (`AXIS_HEIGHT` 20, `PLOT_GAP` 10, from
  `stacked-time-series-chart.tsx`). The **box** is what the grid measures and it is exact; the
  interior is letterboxed in the mocks (the real render will fill it).
- **Two passes per arrangement**: one plain, one with §6.4's banner pinned (both cards driven
  to 86/84 °C and the 10 s wall-clock debounce waited out — a real banner, not a stub), plus
  every chart toggled to its table view through the real buttons.
- **Static captures**: each arrangement is saved as a self-contained `mocks/<name>.html`
  (stylesheets inlined, scripts stripped) and then **re-measured from `file://`**. Delta
  against the live measurement: **0 px at every viewport for every arrangement.** The mocks
  reproduce the app's geometry, not an approximation of it.

### 1.2 Validation

Under `--fixture mac` the harness reproduces 10c-3's numbers exactly: grid **1571.3 / 1607.3 /
1591.3**, overflow **596 / 632 / 560**. Same method, same result — so the differences below are
the arrangements', not the harness's.

### 1.3 What the numbers do NOT cover — read before trusting a margin

- **Font metrics are macOS Menlo** (`ui-monospace`). The wall's browser will resolve
  `--font-mono` differently (Linux: DejaVu Sans Mono, same advance width, slightly different
  line height). Every margin under ~20 px is inside that variation. **Re-measure on the wall's
  own browser in step 12** with `measure-breakpoints.mjs` (measurement 9 now measures exactly
  this).
- The ring held only a few samples when measured; chart **boxes** do not depend on sample count.
  Table views do — §4.7 forces them to their cap.
- Widths were measured at exactly 1280 / 1600 / 1920. §4.2 gives the track formulae so the
  builder can predict the in-between widths.

---

## 2. What the measurement found before any re-plan

### 2.1 ⚠ F1 — the session event log grows the PAGE through its clipped scroll box (live defect)

Filling the log with 200 entries inside its `max-height` / `overflow-y: auto` box: the box
measures 110 px, its `scrollHeight` 3854, `overflow-y` computes `auto` — a correct scroll
container — and yet `documentElement.scrollHeight` reads **4568** on a 1080 viewport.
`body.scrollHeight` reads 923. Hiding the `<ul>` drops the document to 1080; setting
`overflow: hidden` on the box changes nothing; **setting `position: relative` on the box
drops it to 1080.**

Cause: every `Chip` renders `<span class="sr-only">` (`tokens.css`: `position: absolute; …
clip`). An absolutely positioned element contributes to the scrollable overflow of its
**containing block**, and with no positioned ancestor that is the initial containing block —
the page — so the clipped `<li>`s' hidden spans stack up below the fold, outside the scroll
box's clip. A standalone probe without the spans (`scratchpad/probe.html`) shows Chrome behaves
correctly; this is the app's markup.

It is already happening in the shipped build: under `--fixture mac` with alarms flowing, the
baseline's overflow went from 560 to **1477** as the log filled. The same mechanism reaches the
sparkline's table view (its `<caption class="sr-only">`) the moment a panel is a scroll
container (§4.6 measured it). **Fix: `position: relative` on `.panel` in
`panel-shell.module.css`** — one rule, covers the log, the table views and any bounded cell.
Included in the builder spec (§7.3).

### 2.2 ~200 px of 10c-3's overflow was this Mac's own `errors[]` notes

| fixture | grid 1280 | grid 1600 | grid 1920 | overflow |
|---|---|---|---|---|
| mac (as 10c-3) | 1571 | 1607 | 1591 | 596 / 632 / 560 |
| **box (healthy)** | **1331** | **1393** | **1393** | **356 / 418 / 362** |

Every SAFETY row was 64 px instead of 24 (an `ENOENT` detail under each), COOLING's headline
52 instead of 25, SERVING a 107 px "unknown" block. The healthy wall is 362 px over at 1920,
not 560 — still not a padding problem, but a third smaller than reported.

### 2.3 Rows 2–3 are set by COOLING, not by the panels beside it

Intrinsic heights at 1920, healthy (from per-child anatomy, `mocks` `--anatomy`):

| panel | intrinsic | of which chart | in §6.1's grid |
|---|---|---|---|
| GPU 0 / GPU 1 (≥1600, promoted) | 458 | 160 (+21 toggle) | 458 |
| GPU 0 / GPU 1 (1280–1599, sparkline) | 342 | 44 (+21) | 342 |
| COOLING | **750** | 450 (+21) | 750 |
| CPU | 294 | 2 × 44 (+21) | stretched to 397 |
| MEMORY | 140 | — | stretched to 397 |
| SAFETY | 196 | — | stretched to 340 |
| STORAGE & NETWORK | 237 | — | stretched to 340 |
| SERVING | 137 | — | 137 |
| SESSION EVENT LOG | 137 (1 entry) | — | 137 |

The 2×2 block needs 294 + 237 + 12 = **543**; COOLING needs **750**, and CSS grid distributes a
spanning item's excess across the rows it spans, so CPU/MEMORY/SAFETY/STORAGE sit in 397 / 340
px cells with 100–250 px of dead ground each. The arithmetic that follows from this:
**any layout with COOLING above or below the GPU cards sums to ≥ 458 + 12 + 750 = 1220**, and
the budget (§3) is ~950. The only way to keep COOLING's chart is a column beside the two GPU
cards stacked (458 + 12 + 458 = 928 ≈ 750 + slack).

### 2.4 The banner is 58 px; the band goes 49 → 107

Two alarm conditions (`✕ 2 active alarms · GPU 0 temperature 86 °C for <1 min · GPU 1 …`)
measured **58 px** at every viewport; the sticky band 48.8 → **107.2**. A single-condition
banner is one line shorter; 58 is the number budgeted throughout.

### 2.5 F5 — SERVING's instance row overflows horizontally below ~450 px

Placed in a 372 px column (arrangement C, `mocks/C2-1920x1080.png`) the row's value
`:8080 · qwen3.6-27b · ctx 131,072 · ok` does not wrap (`status-row.module.css` `.value` is
`flex: 0 0 auto`) and overflows the panel by **79 px** at 372 wide, 143 at 308, 188 at 262.
Invisible today only because SERVING spans two columns. Relevant to wherever SERVING lands
(§5) and to any future narrow placement.

### 2.6 The owner's ruling alone: measured

Removing row 4 and nothing else (`row4-off`): grid **1128 / 1244 / 1244**, overflow **153 /
269 / 213** (211 / 327 / 271 with a banner). The parent's estimate was right — 13 % recovered
of the ~35 % needed.

---

## 3. The budget

`viewport − sticky band (48.8) − grid padding (2 × 12)` is what rows and gaps may use;
subtract 58 for the banner reserve:

| viewport | rows + gaps available | with banner reserve |
|---|---|---|
| 1280 × 1024 | 951 | 893 |
| 1600 × 1024 | 951 | 893 |
| 1920 × 1080 | 1007 | 949 |

Panel heights §2.3; gaps 12 px; each arrangement below states what it uses.

---

## 4. The arrangements

Every table: **page** = band + grid (+ the disclosure line where present); **margin** =
viewport − page; **banner** = margin with the 58 px banner pinned (measured, not subtracted);
**degraded** = the same page under `--fixture mac`. Negative = the page scrolls by that much.

### 4.1 A — §6.1's shape, compressed

```
            ┌──────────────────────────────┬──────────────────────────────┐
      row 1 │ GPU 0                        │ GPU 1                        │  418
            ├──────────────────────────────┼──────────────┬───────────────┤
      row 2 │                              │ CPU          │ MEMORY        │  275
            │ COOLING (rows 2–3)           ├──────────────┼───────────────┤
      row 3 │                              │ SAFETY       │ STORAGE & NET │  242
            └──────────────────────────────┴──────────────┴───────────────┘
              1920: 465 465 465 465 · row heights at 1920
```

`CHART_SIZE`: cooling `plotHeight` 210 → **100** (450 → 230 painted), gpuPromoted 140 → 100,
sparkline height 44 → 32. Same areas as `row4-off`.

| viewport | grid | page | margin | banner | degraded |
|---|---|---|---|---|---|
| 1280 × 1024 | 914.5 | 963 | 61 | **3** | not run |
| 1600 × 1024 | 983.7 | 1033 | **−9** | **−67** | — |
| 1920 × 1080 | 983.7 | 1033 | 48 | **−11** | — |

**Costs:** COOLING's shared-time chart loses **49 % of its height** — the plot in which
engage/release is meant to be read at a glance is 100 px per series. Every sparkline loses
27 %. And it still **fails the banner reserve at 1600 and 1920**, and fails outright at 1600.
Row 1 is 418 because the promoted chart drives it; rows 2–3 are 517 because the 2×2 block
(CPU 294 + STORAGE 237 + 12 = 543 minus the 32 px sparkline saving) drives them, so COOLING
would have to shrink a further ~80 px to buy the banner back. **The shape is the problem, not
the numbers.** Mock: `mocks/A.html`, `mocks/A-1920x1080.png`.

### 4.2 B — COOLING in its own column (recommended)

```
            ┌───────────────┬───────────────┬───────────┬───────────┐
      row 1 │ GPU 0         │               │ CPU       │ MEMORY    │  418 (411 at 1280)
            ├───────────────┤ COOLING       ├───────────┼───────────┤
      row 2 │ GPU 1         │ (rows 1–2)    │ SAFETY    │ STORAGE   │  418 (411 at 1280)
            └───────────────┴───────────────┴───────────┴───────────┘
              ≥1600: minmax(432px,1.5fr) minmax(432px,1.5fr) 1fr 1fr
              1280–1599: minmax(300px,1fr) minmax(432px,1.5fr) 1fr 1fr
```

Measured tracks: **1280: 300 / 432 / 244 / 244 · 1600: 462 / 462 / 308 / 308 · 1920: 558 / 558
/ 372 / 372.** `CHART_SIZE`: cooling **400 × 210** (height unchanged, 470 painted), gpuPromoted
**400 × 100** (120 painted), sparkline **200 × 44**.

Rows are the GPU cards (418 at ≥1600 with the 120 px chart; 411 at 1280, where the 300 px
column wraps the card's subtitle and its `power` and `served by instance` rows); COOLING gets 848 for its 750 and the right block gets 418 per row for
294 / 237. Below, "B" is the grid alone (SERVING and LOG hidden); "B-final" adds the disclosure
of §5 — the recommended whole.

| viewport | grid | B page / margin / banner | **B-final page / margin / banner** | degraded (B-final) |
|---|---|---|---|---|
| 1280 × 1024 | 858.2 | 907 / 117 / 59 | **930 / 94 / 36** | −180 / −238 |
| 1600 × 1024 | 872.2 | 921 / 103 / 45 | **944 / 80 / 22** | −35 / −94 |
| 1920 × 1080 | 872.2 | 921 / 159 / 101 | **944 / 136 / 78** | **69 / 10** |

Slot rects at 1920 (B-final): GPU 0 (12, 60.8) 558 × 418.1 · GPU 1 (12, 490.9) · COOLING
(582, 60.8) 558 × 848.2 · CPU (1152, 60.8) 372 × 418.1 · MEMORY (1536, 60.8) · SAFETY (1152,
490.9) · STORAGE (1536, 490.9) · disclosure summary y 921, 22.8 tall.

**Variants that price each decision** (all measured, same harness):

| variant | change | 1280 margin / banner | 1600 | 1920 |
|---|---|---|---|---|
| B0 | `CHART_SIZE` untouched (480 wide, gpu ph 140) | 79 / 21 | 23 / **−35** | 79 / 21 |
| B (252 px GPU track at 1280) | as B but 1280 tracks `minmax(252px,1fr)`, sparkline 220 | 79 / 21 | 103 / 45 | 159 / 101 |
| **B-w (= B above)** | GPU track ≥300 at 1280, sparkline 200 | **117 / 59** | 103 / 45 | 159 / 101 |

So the 140 → 100 `plotHeight` cut buys **80 px at ≥1600** (two cards stack, 40 each) and is
what makes 1600 × 1024 survive a banner; the 1280 width fix buys **38 px at 1280** by stopping
the GPU card's `power` and `served by instance` rows wrapping in a 262 px column.

**Costs, named:**

- The ≥1600 promoted GPU chart is 120 px painted instead of 160 (plot 100 instead of 140 —
  **−29 %**). A 30-minute temperature trace in 100 px with four y-ticks; the sparkline it
  replaces is 44.
- Both big charts are **400 px wide, not 480** — 354 px of plot for 30 min ≈ 5.1 s/px against
  4.1; at the 2 h window 20 s/px against 17. The 5 s cadence still resolves ~1 px per sample.
  The COOLING column is 558 px at 1920, so 126 px of the chart's row is empty ground there.
- The sparkline is **200 px wide, not 220** (−9 %). Needed only at 1280, where the small
  columns are 244; a single constant means it applies everywhere.
- **At 1280 the four small panels are 244 px wide and wrap**: `DKMS for running kernel · yes`
  to three lines, both meter heads (`/home 312.4 GiB / 915.8 GiB`) to two, SAFETY's subtitle to
  two. Legible but cramped (`mocks/B-final-1280x1024.png`). The 305 px they have today is not
  available: 1196 px of track has to hold 300 + 432 + 2 × small, and the GPU column below 300
  wraps its own rows and costs more height than it saves (the B / B-w rows above).
- The right block carries dead ground: at 1920 CPU sits in 418 for 294, MEMORY 418 for 140.
  This is what absorbs the degraded state — the same class of slack §6.1 has today.
- SERVING and the SESSION EVENT LOG leave the wall (§5).
- **1600 × 1024 with a banner is 22 px** — inside font-metric variation (§1.3).

Mocks: `mocks/B-final.html` (+ `-1920x1080.png`, `-1280x1024.png`), `mocks/B-final-open.html`
(the disclosure open), `mocks/B.html`, `mocks/B-w.html`, `mocks/B0.html`.

### 4.3 C — B with SERVING and the LOG kept on the wall

The premise of the ruling was that they do not fit. B's right block has ~800 px of slack at
1920, so this was measured rather than assumed. Two shapes:

**C2 (three rows; GPU 1 spans rows 2–3):**

```
            ┌───────────────┬───────────────┬───────────┬───────────┐
      row 1 │ GPU 0         │               │ CPU       │ MEMORY    │  418
            ├───────────────┤ COOLING       ├───────────┼───────────┤
      row 2 │ GPU 1         │ (rows 1–3)    │ SAFETY    │ STORAGE   │  238
            │ (rows 2–3)    │               ├───────────┼───────────┤
      row 3 │               │               │ SERVING   │ EVENT LOG │  193 (208 at ≤1600)
            └───────────────┴───────────────┴───────────┴───────────┘
```

Log capped at 110 px (~6 entries) with F1's fix, filled with 200 entries to prove the cap.

| viewport | grid | page | margin | banner | degraded |
|---|---|---|---|---|---|
| 1280 × 1024 | 952.7 | 1002 | 23 | **−36** | −309 / −367 |
| 1600 × 1024 | 912.3 | 961 | 63 | **5** | −245 / −303 |
| 1920 × 1080 | 897.3 | 946 | 134 | 76 | **−109 / −167** |

**C6 (six rows, each GPU card spanning three, equal thirds on the right)**: 927.6 / 901.4 /
874.4 → margins 48 / 74 / 157, with banner **−11** / 16 / 99. Mock `mocks/C.html`.

**Verdict: the ruling stands, with numbers.** At 1920 alone C2 fits with 76 px under a banner
— but 1600 with a banner is 5 px, 1280 fails by 36, and the degraded state fails everywhere
including 1920 (SERVING's error block and SAFETY's notes land in the same third row). And
SERVING's rows overflow the 372 / 308 / 262 px columns horizontally (F5, §2.5) — visible in
`mocks/C2-1920x1080.png`. Keeping both on the wall costs the whole reserve at every width but
1920 and requires a row-level fix to SERVING first. Recorded as owner question Q1 (§8), since
a 1920-only wall could take it.

### 4.4 Strip — SERVING as one line in the sticky band

`mocks/B-strip.html`: the two instance rows cloned into a compact 0.85 em flex strip under the
header. **Band 48.8 → 72.6 (+23.8 px)** at every width. B's margins become 55 / 79 / 135
(**−3** / 21 / 77 with a banner). Keeps per-instance state on the wall; the log still needs a
home. Same pixel cost as the disclosure's summary, so it is a choice about what those 24 px
show, not about whether to spend them.

### 4.5 Disclosure — SERVING and the LOG in a closed `<details>` under the grid

`mocks/B-final.html`: a `<details>` after the grid, `summary` reading `serving · session event
log`, both panels inside on a two-column grid. **Closed: 22.8 px** (the summary line; margin 0
so nothing else is spent). Open at 1920 with 200 log entries: 574 px, page 1495 — the laptop
viewer scrolls, which §6.1 permits. Measured with F1's fix on the log box.

### 4.6 D — B bounded to the viewport (stage 2)

`body { display:flex; flex-direction:column; height:100vh }`, `.grid { flex:1 1 0; min-height:0;
grid-template-rows: minmax(0,1fr) minmax(0,1fr) }`, the disclosure `flex: 0 0 auto`, and every
panel `overflow-y: auto; position: relative`. The grid is always exactly the viewport remainder
— band, banner and summary included — and a panel whose content outgrows its cell scrolls
inside it instead of growing the page.

**Page height: exactly the viewport in every pass** — plain, banner, degraded, every table at
its cap (`D-final`, `D-final-tables`, both fixtures). What moves is the cell:

| viewport | cell (plain) | cell (banner) | GPU card spare (banner) | COOLING spare (banner) |
|---|---|---|---|---|
| 1280 × 1024 | 458.2 | 429.0 | 429 − 411 = **18** | 870 − 750 = 120 |
| 1600 × 1024 | 458.2 | 429.0 | 429 − 418 = **11** | 120 |
| 1920 × 1080 | 486.2 | 457.0 | 457 − 418 = **39** | 176 |

Degraded, with a banner: at 1280 CPU (515), SAFETY (542) and STORAGE (478) exceed their 429 px
cells and scroll internally (their bottom rows are hidden until scrolled); at 1600 CPU (483)
does; at 1920 everything fits. With every table at its cap: GPU cards hold 715 in 486 and CPU
1056 — they scroll inside their cells, the page does not.

**Cost:** panels that clip. On a wall a clipped panel hides its last rows the way a scrolled
page hides its last panels — strictly less, since it is one panel's tail rather than a row of
panels, and SAFETY's four rows fit their cell in every healthy pass. **It also changes what
`--table-scroll-max: 40vh` is for**, which `tokens.css` records as SCOPE 2.5f's open stopgap
and which is the owner's to rule (Q3). Mocks: `mocks/D.html`, `mocks/D-tables.html`.

### 4.7 The table view, under the recommendation

With every chart toggled and each table forced to its `40vh` cap (a full ring):

| | 1280 × 1024 | 1920 × 1080 |
|---|---|---|
| B-final, page | 1938 (**scrolls 914**) | 1909 (**scrolls 829**) |
| CPU alone (two tables replace two 44 px sparklines) | +776 | +776 |
| a GPU card (table replaces the 120 px chart) | +312 | +312 |
| D-final, page | 1024 (**0**) | 1080 (**0**) |

Under auto rows no arrangement can absorb a 432 px table — the whole grid is ~860 px. The
table is a laptop interaction (§6.2: "the wall is not the only viewer") and the page scrolling
there is what §6.1 already allows; on the wall it breaks the fold until toggled back. D is the
only measured answer that keeps the page still.

---

## 5. Where SERVING and the SESSION EVENT LOG go

§6.2 requires both. §6.4's log is **computed in the browser since page load** and lost on
reload (decision 4) — so its history exists only on the page that has been open longest, which
is the wall's. That rules one option out and shapes the rest:

| destination | wall cost (px) | what the laptop viewer gets | cost |
|---|---|---|---|
| **Closed `<details>` under the grid, same page** (recommended) | **22.8** | SERVING in full; the WALL's own event history, when opened on the wall or over remote desktop; on a fresh laptop load, the log since that load | one click; the summary line is on the wall for nothing |
| Compact SERVING strip in the band | 23.8 | per-instance state always visible; **the log still needs the disclosure** (+22.8 → 46.6 total) | a new component; §6.2's exhaustive header is unchanged only if the strip is not in the header |
| A second route (`/more`) | 0 | SERVING; **an empty log** — a new page has no history, and the wall's is unreachable from it | discoverable only by URL, or by a header link (amends §6.2's exhaustive list) |
| Fold SERVING into the GPU cards | 0 for SERVING, log still needs a home | port/ctx/health/unit beside `served by instance N` | **+2 rows per card ≈ +96 px on the stacked column** — exactly where B's margin is thinnest at 1600 (45 → −51 with a banner); and a §6.2 content change to the GPU card |

**Recommendation: the disclosure**, with F1's `position: relative` fix, SERVING and the LOG
side by side inside it, closed by default. It is the only destination in which the event log
keeps the property §6.4 gives it ("a 03:00 excursion is still on screen at 09:00" — on screen
one click away, on the page that saw it). Its 22.8 px is the cheapest visible cost measured,
and it needs no change to §6.2's header. If the owner prefers zero pixels, a header control
(Q2) costs 0 px and one line of §6.2.

---

## 6. Recommendation, and the case against the runner-up

**B + the disclosure (B-final), then D as stage 2.**

B is the only shape that keeps COOLING's 450 px chart *and* clears the banner reserve at every
§6.1 width. It does so because it is the only shape in which COOLING's 750 px sits beside
something of the same height — two GPU cards — instead of above the 543 px block it was
paired with. The chart cuts it needs are on the GPU cards (which had 160 px for a single
series) and on width (480 → 400), not on the panel §6.1 calls load-bearing.

**Runner-up: C2**, everything on the wall. It is tempting — the right block has the slack, the
log is where its history is, and at 1920 it fits with 76 px under a banner. It loses on three
measured facts: 1600 × 1024 keeps 5 px under a banner and 1280 × 1024 loses 36, so §6.1's own
promise breaks the first time an alarm fires on the design-target width; the degraded state
overflows at every width including 1920 (−109), because SERVING's failure text and SAFETY's
notes land in the same third row; and SERVING's row overflows every column narrower than
~450 px, which a re-plan cannot fix without a row-level change to `status-row`. If the wall is
1920 × 1080 only and the owner will relax the 1280 promise, C2 is viable and Q1 asks that.

**A** is not a runner-up: it cuts the one thing that must not be cut and still fails the
reserve.

**Why D is stage 2 and not the recommendation:** it is strictly stronger on the promise and
strictly weaker on content — panels clip, and at 1600 with a banner the GPU cell has 11 px to
spare. It also decides SCOPE 2.5f's stopgap, which is the owner's. Ship B-final first; it is
green on the promise with real margin; add D when the owner has ruled Q3.

---

## 7. Builder specification

**No judgment calls.** Where this section is silent, do what the current file does.

### 7.1 `components/grid.module.css` — replace the grid rules with exactly these

```css
.grid {
  display: grid;
  gap: 0.75rem;
  padding: 0.75rem;
  grid-template-columns: 1fr;
  grid-template-areas:
    'gpu0'
    'gpu1'
    'cooling'
    'safety'
    'cpu'
    'memory'
    'storage';
}

@media (min-width: 900px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    grid-template-areas:
      'gpu0 gpu1'
      'cooling cooling'
      'cpu memory'
      'safety storage';
  }
}

@media (min-width: 1280px) {
  .grid {
    grid-template-columns: minmax(300px, 1fr) minmax(432px, 1.5fr) 1fr 1fr;
    grid-template-rows: auto auto;
    grid-template-areas:
      'gpu0 cooling cpu memory'
      'gpu1 cooling safety storage';
  }
}

@media (min-width: 1600px) {
  .grid {
    grid-template-columns: minmax(432px, 1.5fr) minmax(432px, 1.5fr) 1fr 1fr;
  }
}
```

Keep the seven `grid-area` rules (`.gpu0 .gpu1 .cpu .memory .cooling .safety .storage`) and the
two shared rules (`min-width: 0; min-height: 0; display: flex` on the slots; `flex: 1 1 auto;
min-width: 0; min-height: 0` on their children) **with `.serving` and `.log` removed from
every selector list**. Delete the `.serving` and `.log` rules. Rewrite the header comment's
ASCII to §4.2's drawing and the invariant-7 paragraph to say: 900–1279 is
`gpu0 gpu1 / cooling cooling / cpu memory / safety storage`; <900 is
`gpu0 gpu1 cooling safety cpu memory storage`; SERVING and the SESSION EVENT LOG render in the
disclosure after the grid at every width (§6.1's <900 order had SERVING fourth — owner Q4).

Expected tracks (`getComputedStyle(grid).gridTemplateColumns`), for verification:
**1280: `300px 432px 244px 244px` · 1600: `462px 462px 308px 308px` · 1920: `558px 558px
372px 372px`.** Between: at 1280 both minima bind (300 and 432 fixed, the remaining 464 split between
the two `1fr` tracks); the browser resolves `minmax()` from there, and above ~1410 px no
minimum binds and all four are plain shares, `1fr = (width − 60) / 4.5` (1599: 336.7). At
≥1600, `1fr = (width − 60) / 5` (1600: 308; 1920: 372).

### 7.2 `components/grid.tsx`

- `CHART_SIZE` becomes exactly:

  ```ts
  export const CHART_SIZE = {
    /** Total `<svg>` height — `Sparkline` draws no axis. */
    sparkline: { width: 200, height: 44 },
    /** PER PLOT. COOLING stacks two, so it paints 470px in total (2 × 210 + 10 + 20). */
    cooling: { width: 400, plotHeight: 210 },
    /** PER PLOT. One plot, so it paints 120px in total (100 + the 20px axis). */
    gpuPromoted: { width: 400, plotHeight: 100 },
  } as const;
  ```

  Painted boxes the builder must observe in a browser: COOLING `svg[role="img"]` **400 × 470**;
  `[data-role="gpu-full-chart-wrap"] svg` **400 × 120**; every sparkline `svg` **200 × 44**.
  Update the A7 table in the doc comment to these numbers and replace the "480 wide to match
  cooling" justification with: 400 wide because the 1280–1599 tracks (§7.1) leave 432 px for
  the COOLING column and 300 for the GPU column, and a chart must not exceed its column's inner
  width (column − 32 px padding); `gpuPromoted.plotHeight` 100 because the two GPU cards stack
  and each 20 px of plot costs the grid 40 (10d §4.2).
- `GridProps` loses `serving` and `sessionEventLog`; `Grid` loses the two slot `<div>`s. The
  seven remaining `data-slot` names are unchanged.
- The module doc's ASCII becomes §4.2's.

### 7.3 `components/panel-shell.module.css` — F1

Add `position: relative;` to `.panel`. Nothing else. (Reason in §2.1; it makes `.panel` the
containing block for every `.sr-only` span inside it, so a clipped scroll box inside a panel
can no longer grow the page.)

### 7.4 `app/dashboard-shell.tsx` and `app/dashboard-shell.module.css` — the disclosure

Immediately after `<Grid … />` (a sibling, inside the fragment, after the grid):

```tsx
<details className={styles.more} data-role="more">
  <summary className={styles.moreSummary}>serving · session event log</summary>
  <div className={styles.moreGrid}>
    <div className={styles.moreSlot} data-slot="serving">
      <ServingPanel {...panel('serving')} />
    </div>
    <div className={styles.moreSlot} data-slot="session-event-log">
      <SessionEventLogPanel {...panel('session-event-log')} />
    </div>
  </div>
</details>
```

No `open` attribute (closed by default; the browser remembers nothing, and that is intended:
the wall reloads closed). CSS, appended to `app/dashboard-shell.module.css`:

```css
.more {
  margin: 0 0.75rem;
  font-family: var(--font-mono);
  color: var(--ink-muted);
}

.moreSummary {
  cursor: pointer;
  padding: 0.25em 0;
  font-size: 0.85em;
}

.moreGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  padding: 0.75rem 0;
}

@media (max-width: 899px) {
  .moreGrid {
    grid-template-columns: 1fr;
  }
}

.moreSlot {
  display: flex;
  min-width: 0;
}

.moreSlot > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
```

(The mock used the literal values of `--ink-muted` and `--font-mono`; the tokens resolve to the
same pixels. The `max-width: 899px` rule is the one thing not in the mock — below 900 px the
two panels stack; it does not affect the ≥1280 numbers.)

The event log's own `max-height: var(--table-scroll-max)` stays as it is.

### 7.5 Tests and the measurement script

- `components/grid.test.tsx`: the slot list and the class↔slot table drop `serving` and
  `session-event-log` (seven slots).
- `app/dashboard-shell.test.tsx`: the slot map at line ~397 still expects both panels' text;
  they now render inside `details[data-role="more"]` — assert presence there, not in the grid.
- `lib/dangling-css-class.test.ts` / `components/styles.test.ts`: the new
  `dashboard-shell.module.css` classes are all referenced (`more`, `moreSummary`, `moreGrid`,
  `moreSlot`); `.moreSlot > *` has no `flex-basis: 100%`, so the wrap guard has nothing new to
  check.
- `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`:
  - `SLOTS` unchanged (all nine are in the DOM); before measurement **0** and **6**, open the
    disclosure: `await page.evaluate(() => { document.querySelector('details[data-role="more"]').open = true; })`,
    and close it again before **9** (measurement 9 is the wall's state).
  - `PRIORITY_ORDER_900` becomes `gpu0, gpu1, cooling, safety, cpu, memory, storage-and-network,
    serving, session-event-log`.
  - Measurement **1** ("COOLING spans rows 2–3 in columns 1–2") becomes "COOLING spans both rows
    in column 2": `|cooling.x − (gpu0.x + gpu0.width + 12)| < 2`, `|cooling.height −
    (gpu0.height + gpu1.height + 12)| < 2`, `|cpu.x − (cooling.x + cooling.width + 12)| < 2`.
  - Measurement **3** (4 columns at 1280) and **9** are unchanged. **9 must now PASS and the
    script must exit 0.**
- `pnpm verify` green; then `node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`
  exits 0.

### 7.6 Acceptance — numbers the build must reproduce (Chrome/macOS, `--fixture box`)

Run `node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --only baseline
--no-capture` (with the change in place, `baseline` measures the real grid; the harness reads
`details[data-role="more"]`). Tolerance ±2 px (font hinting):

| | 1280 × 1024 | 1600 × 1024 | 1920 × 1080 |
|---|---|---|---|
| `.grid` height | 858.2 | 872.2 | 872.2 |
| grid rows | `411.1 411.1` | `418.1 418.1` | `418.1 418.1` |
| disclosure height / bottom | 22.8 / 929.8 | 22.8 / 943.8 | 22.8 / 943.8 |
| `scrollHeight` | 1024 | 1024 | 1080 |
| with banner, `scrollHeight` | 1024 | 1024 | 1080 |

A build that reproduces these has implemented this document. One that does not has changed a
size somewhere — compare per-slot rects against §4.2 before touching the tracks.

### 7.7 Stage 2 (D) — apply only after Q3 is ruled

To `app/dashboard-shell.module.css` (or `app/layout.tsx`'s body style) and `grid.module.css`,
inside `@media (min-width: 1280px)` only:

```css
body { display: flex; flex-direction: column; height: 100vh; }          /* layout.tsx sets margin:0 */
.grid { flex: 1 1 0; min-height: 0; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
.more { flex: 0 0 auto; }
```

and in `panel-shell.module.css`: `.panel { overflow-y: auto; }` (with §7.3's `position:
relative` already present). Then `--table-scroll-max` may become `100%`-based per
`tokens.css`'s own note, since a panel body finally has a bounded ancestor — that is Q3's
substance. Acceptance: `scrollHeight === clientHeight` at all three viewports in every pass of
the harness (`D-final`, `D-final-tables`, both fixtures), cells `458.2 / 458.2 / 486.2` plain
and `429.0 / 429.0 / 457.0` with a banner.

---

## 8. Owner questions — nothing below is assumed

- **Q1 — Is the wall 1920 × 1080 only, and may §6.1's 1280 × 1024 promise be relaxed?** If
  yes, C2 keeps all nine panels on the wall with 76 px under a banner at 1920 (§4.3), at the
  price of SERVING's row fix (F5) and no reserve at 1280/1600. The recommendation assumes no.
- **Q2 — Where does the disclosure's handle live?** Recommended: a `<summary>` line under the
  grid (22.8 px, measured). Alternative: a control in the header (0 px), which amends §6.2's
  "that is the whole header, and the list is exhaustive". Not assumed.
- **Q3 — May the grid be bounded to the viewport (stage 2, §4.6 / §7.7)?** It settles SCOPE
  2.5f's `--table-scroll-max` stopgap and makes panels clip instead of the page scrolling.
  Measured spare under a banner: GPU cell 18 / 11 / 39 px at 1280 / 1600 / 1920.
- **Q4 — §6.1's <900 px priority order** places SERVING fourth ("GPUs → cooling → safety →
  serving → host → storage"). With SERVING in the disclosure it is after STORAGE at every
  width. The spec's own rule for the log there was already invariant-7 territory.
- **Q5 — `CHART_SIZE.cooling.width` 400 everywhere, or 480 at ≥1600?** One constant is what
  L9 established; 400 is forced only by the 1280–1599 tracks. A per-breakpoint width needs a
  second export or a CSS scaling rule, both of which L9 declined. The recommendation keeps one
  constant.
- **Q6 — The ≥1600 promotion at `plotHeight` 100.** §6.1 says "promoted to full line charts";
  100 px per plot is the number that clears the banner reserve at 1600 × 1024 (B0 shows 140
  fails it by 35). If 1600 × 1024 is not a real display, 120 (B: 1920 margin 119 / 61) or
  140 (B0) are on the table.
- **Q7 — F1 and F5 are defects in shipped code**, found by measurement and outside this
  loop's remit. §7.3 fixes F1 because the disclosure needs it; F5 (SERVING's `.value` not
  wrapping below ~450 px) is recorded and left, since SERVING's new home is ≥ 610 px wide at
  ≥1280.

---

## 9. Files

- `pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs` — the harness (usage in
  its header; `--fixture box|mac`, `--only`, `--anatomy`, `--no-capture`, `--json`).
- `pipeline/steps/10-panels-assembly/mocks/arrangements.mjs` — every arrangement above as CSS
  (+ a `dom` hook for the strip / disclosure / filled-log variants).
- Static, openable mocks (`file://`, no server): `baseline.html`, `row4-off.html`, `A.html`,
  `B0.html`, `B.html`, `B-w.html`, `B-final.html` (**the recommendation**), `B-final-open.html`,
  `B-strip.html`, `B-disclosure.html`, `C.html` (six-row), `C2.html`, `C2-w.html`, `D.html`,
  `D-tables.html`. Screenshots: `baseline-1920x1080.png`, `A-1920x1080.png`,
  `B-final-1920x1080.png`, `B-final-1280x1024.png`, `B-final-open-1920x1080.png`,
  `C2-1920x1080.png`.
- Raw measurement JSON is in the session scratchpad, not the repo; every number here is
  reproducible by re-running the harness (≈ 2 min per fixture; it starts its own `next dev` on
  :39174 and kills it).

Tree state: `7de7dd3`, nothing under `components/`, `app/` or `lib/` touched, `SPEC.md`
untouched, no dev server left running, `next-env.d.ts` byte-identical.
