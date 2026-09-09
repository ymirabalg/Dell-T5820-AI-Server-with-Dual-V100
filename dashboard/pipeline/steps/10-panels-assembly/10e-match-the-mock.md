# 10e — Match the mock: a builder specification for the density of `MOCK.html`

**2026-09-09. Changes no production code. Edits no `SPEC.md`. Nothing committed.** Every pixel
figure below was read from real headless Chrome (system Google Chrome over CDP, `playwright-core`
1.63): the mock from `file://` with `mocks/measure-mock-anatomy.mjs` (new, this loop), the real
app logged in under `page.route` box-faithful telemetry with 10d's `mocks/measure-arrangements.mjs
--only baseline --anatomy`. Nothing is estimated. `mocks/check-density.mjs` (new) grades a real-app
measurement against §8's targets, and was run against today's build to prove it discriminates
(31 FAIL, chart boxes read as 450 / 44 / 160 — the numbers this document says must change).

## 0. The answer in one screen

**The §6.1 grid is right and stays. The built panels are 1.8–2.4× the mock's height because every
one of them stacks readings vertically at a 16 px base that the mock sets at 12 px and lays out
horizontally.** Four things account for almost all of it, and none is a chart:

| cause | built | mock | recovered at 1920 |
|---|---|---|---|
| base type 16 px `em`-scaled, panel padding 13.6/16, body gap 9.6, head 44 | — | 12 px base, padding 8/10/9, gap 5, head 25.8 | ~90 px across nine heads and paddings |
| one reading per line (`temperature`, `power`, `utilisation`, `SM clock`, `served by`) at 24 px a line | 5 × 24 | one 32 px hero row, two 23 px meter rows, one 15 px strip | ~120 px per GPU card |
| CPU draws a temperature trace §6.2 never asked for, MEMORY/SWAP as lines not meters, `table view` as a 21 px body row | | | ~70 px |
| the ≥1600 "promotion" is a 160 px second chart | 160 | a 50 px sparkline with a time axis and threshold lines | 110 px per GPU card |

**Targets (healthy, spec-only — §9's owner questions excluded), measured arithmetic on the mock's
own row budgets, checked against the mock's totals (`check-density.mjs --oq caption,notes`
reproduces CPU 204.3, STORAGE 182.4, LOG 133.8 exactly):**

| panel | 1280 × 1024 | 1600 × 1024 | 1920 × 1080 | mock (1920) | built today (1920) |
|---|---|---|---|---|---|
| GPU 0 / GPU 1 | **164.5** | **176.0** | **176.0** | 219.7 (of which 24.5 is a throttle row §6.2 hides when healthy, 19.2 an OQ caption) | 458 |
| COOLING (intrinsic; the cell stretches to rows 2–3) | 366 | 366 | 366 | 472 stretched, ≈410 intrinsic | 750 |
| CPU | **173.1** | **185.1** | **185.1** | 204.3 (19.2 OQ caption) | 397 |
| MEMORY | **138.5** | 138.5 | 138.5 | 195.2 (37.6 OQ note, 19.2 caption folded into the meter label) | 397 |
| SAFETY | **160.0** | 160.0 | 160.0 | 259.1 — **99 px of it is prose §3.7 forbids** (§6) | 340 |
| STORAGE & NET | **144.8** | 144.8 | 144.8 | 182.4 (37.6 OQ note) | 340 |
| SERVING | **104.4** | 104.4 | 104.4 | 140.2 (37.6 OQ note) | 137 |
| SESSION EVENT LOG | **133.8** | 133.8 | 133.8 | 133.8 | 137 (1 entry; grows with the page — F1) |
| header band | 53 (10 gutter + 43) | 53 | 53 | 43 + 10 | 48.8 |
| **page** (band + grid, no banner) | **756.6** | **768.1** | **768.1** | ≈ 1001 / 933 / 920 | 1380 / 1442 / 1442 |
| **spare** | **267** | **256** | **312** | 23 / 91 / 160 | −356 / −418 / −362 |

With every owner question accepted the page is 821.6 / 833.1 / 833.1 and a six-alarm banner (63.7
+ 9) still fits at 1280 × 1024 with ~130 px to spare (§2.10). Today it overflows by 414 with a
two-alarm banner. The spare is not slack to spend: it is what §6.5's degraded states need — a throttle row
(+24.5 per card), an `errors[]` line under each SAFETY row (+19.1 each), a dell-smm message on
COOLING — all of which the mock's state B shows, and which §2.11 budgets.

**What the builder changes:** `tokens.css` (values + 9 tokens), `layout.tsx`/`tokens.css` (12 px
base), `panel-shell`, `chip`, `meter`, `row`/`status-row`, `sparkline` (three optional props for
the ≥1600 form), `grid.tsx`'s `CHART_SIZE`, `grid.module.css`, `header`, `alarm-banner`, the nine
panels' bodies, and two new leaf primitives (`hero.tsx`, `strip.tsx`). Plus `lib/format.ts`'s
long-recorded `parts` variants (O14) so a hero can set its unit smaller without splitting a
formatter's string. **What does not change:** every string, formatter, severity rule, ruling and
invariant — §6 enumerates the twenty-six places the mock would have you get them wrong.

---

## 1. Tokens — `components/tokens.css`

Measured on the mock (`getComputedStyle`, 1920 × 1080): body `12px` / line-height `16.2px` (1.35),
`.app` padding `10px 12px 12px`, gap 9; grid gap 9 / 9, columns `repeat(4, minmax(0,1fr))`
(467.25 px each at 1920); panel padding `8px 10px 9px`, gap 5, border 1, radius 3.

### 1.1 The base — one line that does a third of the work

The built stylesheets size everything in `em`/`rem` against the browser's 16 px root (`.panel`
padding `0.85em 1em` measures 13.6/16 px; `.body` gap `0.6em` = 9.6). The mock sets `body` to
12 px. **Rule for this loop: components size in `px`, never `em`/`rem`**, so a panel's height is
the arithmetic in §2 and not a function of an ancestor's font size. Add to `tokens.css` (it is
already imported globally by `app/layout.tsx`):

```css
body {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid #3987e5; outline-offset: 2px; }   /* the mock's; series-0 blue, not a status hue */
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

`app/layout.tsx` keeps its inline `margin: 0; background: var(--surface-0); color:
var(--ink-secondary)`; nothing else there changes.

### 1.2 Colour and chrome tokens — every change listed

Status and series hexes are **identical** in the mock and in `tokens.css`/`palette.ts`
(`#0ca30c` / `#fab219` / `#d03b3b`; `#3987e5` / `#199e70` / `#d95926`). Nothing below invents a
colour: every value is the mock's own, and the mock's header comment records the series
validation (protan/deutan ΔE 9.4, normal ΔE 20.9) and the rule *"status … reserved; never used
for a series."* Both rules stand. What changes is the **neutral** ramp (the built one came from
the dataviz skill's warm-grey instance; the mock's is the cool blue-grey the owner designed) and
the addition of the mock's text-contrast status inks.

| `tokens.css` name | today | **spec** | mock name | used by (after this loop) |
|---|---|---|---|---|
| `--surface-0` | `#0d0d0d` | **`#07090c`** | `--ground` | page ground, sticky band ground |
| `--surface-1` | `#1a1a19` | **`#0d1116`** | `--panel` | panel, header, sticky `thead`, chart `hatchGround`, end-dot stroke, banner ground under the gradient |
| `--surface-2` **new** | — | `#11161d` | `--raised` | rows, the status pill, header controls, chip ground for `code` chips |
| `--surface-sunken` **new** | — | `#090c11` | `--sunken` | meter track, log well, table wells |
| `--ink-primary` | `#ffffff` | **`#e4eaf1`** | `--ink` | values, hero figures, strip values, row names, log sentences |
| `--ink-secondary` | `#c3c2b7` | **`#98a5b4`** | `--ink-2` | panel titles, meter values, chip text (neutral), legend, log source |
| `--ink-muted` | `#898781` | **`#6b7889`** | `--ink-3` / `PAL.tick` | subtitles, labels, captions, chart tick labels, row notes |
| `--ink-faint` **new** | — | `#4a5566` | `--ink-4` | note footers (OQ-2), control keys, no-band row rule, log `·` tag |
| `--ink-max` **new** | — | `#ffffff` | literal in mock | alarm/watch hero value, banner lead `<b>`, alarm log sentence — the only places pure white appears |
| `--gridline` | `#2c2c2a` | **`#1c232c`** | `--hairline` / `PAL.grid` | chart gridlines, table row rules |
| `--baseline` | `#383835` | **`#28313d`** | `--hairline-hi` / `PAL.axis` | chart axis lines |
| `--border` | `rgba(255,255,255,.1)` | **`#1c232c`** | `--hairline` | panel and header border |
| `--border-lo` **new** | — | `#151b23` | `--hairline-lo` | panel head rule, meter border, log box border and row rules, note rule |
| `--border-hi` **new** | — | `#28313d` | `--hairline-hi` | chips, pills, controls, default row left-rule, meter tick |
| `--status-good` | `#0ca30c` | unchanged | `--good` | chip tints (`rgba(12,163,12,.45/.12)`), row left-rule `.55` |
| `--status-good-ink` **new** | — | `#3fc63f` | `--good-ink` | glyph and chip text on the good band |
| `--status-watch` | `#fab219` | unchanged | `--warn` / `--warn-ink` | meter fill, chip tints (`.48/.13`), row rule + `rgba(250,178,25,.07)` ground, stale text (S-B) |
| `--status-alarm` | `#d03b3b` | unchanged | `--crit` | meter fill, banner rule, row rule + `rgba(208,59,59,.09)` ground |
| `--status-alarm-ink` **new** | — | `#ef6a6a` | `--crit-ink` | glyph and chip text on the alarm band, banner count/glyph, `0 RPM` numeral |
| `--meter` **new** | — | `#55697f` | `--meter` | **the neutral meter fill — a `normal` meter is NOT green** (§6.3: *"colour is spent almost entirely on state"*; the mock's `meter()` sets `data-sev` only when `sev !== 'ok'`) |
| `--nodata` **new** | — | `repeating-linear-gradient(45deg, rgba(152,165,180,.13) 0 3px, transparent 3px 6px)` | the mock's hatch | no-band chip, unavailable hero, paused/stale status pill — the same "no reading" hatch the chart uses |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | the mock's stack: `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace` | `--mono` | everything numeric |
| `--font-sans` **new** | — | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | `--sans` | uppercase labels: panel titles, chips, banner count, control keys, log severity tag |
| `--radius` **new** | — | `3px` | `--r` | panel, header, banner; chips and controls use `2px`, the status pill `999px` |
| `--table-scroll-max` | `40vh` | **unchanged** | — | the two chart table views (SCOPE 2.5f stays open; not this loop's) |

Alpha tints written literally in §2's CSS (`rgba(12,163,12,.45)` etc.) are the mock's own alpha
steps of the three status hexes and are not new colours.

### 1.3 Type scale (measured `font-size` on the mock)

| role | size | face | weight / case | line box |
|---|---|---|---|---|
| body / row name / strip value / log sentence ground | 12 px | mono | 400 | 16.2 (row `line-height: 1.25` → 15) |
| panel title | 10 px | sans | 600, uppercase, `letter-spacing .14em` | 13.5 |
| subtitle, strip, chan table, legend text, log cells, banner item, header meta, control value | 11 px | mono | 400 | 14.85 |
| caption, meter label line, row note, chan note | 10.5 px | mono | 400 | 14.2 |
| chip (pill) | 9.5 px | sans | 600, uppercase, `.09em` | 12.8 (+4 pad +2 border = **18.8**) |
| `code` chip (hex codes, unit strings — `text-transform: none`) | 10 px | mono | 400, `.03em` | 13.5 (+6 = 19.5) |
| note footer (OQ-2) | 9.5 px / 1.4 | mono | 400 | 13.3 |
| hero value | **34 px** / `.95` | mono | 500, `-.02em` | **32.3** |
| hero unit | 13 px | mono | 400, `padding-bottom: 3px` | — |
| unavailable hero value (`—`) | 28 px, `.1em`, hatch, `padding 0 8px`, 1 px border | mono | | 28.6 |
| sub-figure (power in the GPU hero row) | 18 px value + 11 px unit | mono | | 24.3 |
| header hostname | 15 px | mono | 600, `.02em` | 20.3 |
| status pill glyph / text | 11 px / 11 px `.03em` | mono | | pill 22.8 |
| control key | 8.5 px | sans | uppercase `.1em`, `--ink-faint` | — |
| control button | 11 px mono, `line-height: 1`, **height 23** | | | 23 |
| banner count | 10 px sans 700 uppercase `.13em` | | | |
| banner lead | 13 px, `<b>` `--ink-max` 600 | | | 17.8 |
| banner since / item | 11 px | | | item 20.8 |
| chart tick label | 9 px, `--ink-muted` | mono | | (inside SVG, unchanged) |
| sparkline axis / ref label (≥1600) | 8.5 px, `--ink-muted` | mono | | (inside SVG) |

---

## 2. Per-panel anatomy

### 2.0 The primitives every panel is built from — with their measured box

All numbers are the mock's, read from `measure-mock-anatomy.mjs` (state `a`, 1920 unless noted).
Each primitive maps onto an existing `components/` file; "new" means a new leaf under
`components/`. **No hook anywhere** (`purity.test.ts`), every string pre-formatted by the caller
as today.

**`.panel` (`panel-shell.module.css`)** — `display:flex; flex-direction:column; gap:5px;
padding:8px 10px 9px; background:var(--surface-1); border:1px solid var(--border);
border-radius:var(--radius); min-width:0; min-height:0; position:relative` (F1, §7). Vertical
overhead = 8 + 9 + 2 = **19 px**, plus 5 per gap. `data-severity` on the section now paints:
`[data-severity='watch'] { border-color: rgba(250,178,25,.34) }`, `[data-severity='alarm'] {
border-color: rgba(208,59,59,.46); background: linear-gradient(180deg, rgba(208,59,59,.045),
transparent 90px), var(--surface-1) }` — the mock's severity stripe, which closes the
`panel-shell.tsx` doc's *"a hook with no rule behind it yet"*.

**`.head`** — replaces the 2-row grid (44 px) with the mock's single line: `display:flex;
align-items:center; gap:10px; padding-bottom:6px; border-bottom:1px solid var(--border-lo)`.
Children in order: `h2.title` (10 px sans, `--ink-secondary`, nowrap, margin 0), `p.subtitle`
(11 px mono `--ink-muted`, `overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
min-width:0` — the mock ellipsises at 1280 too: STORAGE's sub measured 34.7 px wide), `span.sp`
(`flex:1 1 auto`), **`headControl`** (new optional `ReactNode` prop — §2.1 puts the chart/table
toggle here), then `Chip` (md) **with its severity word visible** (`label={SEVERITY_WORD[chip]}`;
`null` → the `—` glyph alone in the hatched no-band pill, no label). Height = chip 18.8 + 6 + 1
= **25.8**. The `.head > [data-severity]` grid-placement rule goes.

**`Chip` (`chip.tsx` / `chip.module.css`)** — two forms by the existing `size` prop, no API change:

- `md` = the mock's `.chip` **pill**: `display:inline-flex; align-items:baseline; gap:5px;
  font:600 9.5px/1.35 var(--font-sans); letter-spacing:.09em; text-transform:uppercase;
  padding:2px 7px; border-radius:2px; border:1px solid var(--border-hi);
  background:rgba(152,165,180,.07); color:var(--ink-secondary); white-space:nowrap`; the glyph
  `i` 9 px. Bands: `normal` border `rgba(12,163,12,.45)` bg `rgba(12,163,12,.12)` colour
  `--status-good-ink`; `watch` `rgba(250,178,25,.48)` / `.13` / `--status-watch`; `alarm`
  `rgba(208,59,59,.58)` / `.16` / `--status-alarm-ink`; `none` border `--border-hi`, background
  `var(--nodata)`, colour `--ink-secondary`. **Height 18.8.** The dataviz "glyph-only colour"
  rule the built chip follows is superseded *for the pill* by the mock's form — a 9.5 px
  uppercase word on a wall panel is read by its tint, not its 9 px glyph; the sr-only word stays.
- `sm` = the mock's `.row__glyph` **bare glyph**: no border, no background, no padding; mono
  10 px; `width:11px; text-align:center; flex:0 0 auto`; colour by band (`--status-good-ink` /
  `--status-watch` / `--status-alarm-ink` / `--ink-muted`). This is what a `Row`, the chan table
  and a log entry carry at their left edge.
- A third variant, **`code`** (new boolean prop, `code?: true`): the mock's `.chip--code` for a
  throttle reason — `text-transform:none; letter-spacing:.03em; font:400 10px var(--font-mono)`
  so `0x4` is never shouted into `0X4`. Height 19.5.

**`Hero` (new, `components/hero.tsx` + `.module.css`)** — the mock's `.hero`: `display:flex;
align-items:flex-end; gap:4px; line-height:.95`; `.value` 34 px 500 `-.02em` `--ink-primary`;
`.unit` 13 px `--ink-muted` `padding-bottom:3px`. Props: `{ value: string; unit: string;
severity?: Severity | null; ariaLabel?: string }`. `data-severity='alarm'` → value
`--ink-max` + `text-shadow: 0 0 22px rgba(208,59,59,.55)`; `watch` → `--ink-max`. **`value ===
EM_DASH`** → the mock's `.hero--unk`: value 28 px `--ink-muted` `letter-spacing:.1em; padding:0
8px; background:var(--nodata); border:1px solid var(--border-hi)` (28.6 tall) — invariant 1's
`—`, struck through with the same hatch the chart uses, so it can never be mistaken for a zero;
the unit stays the unit (`°C`, `RPM`), never prose. **Height 32.3.**

⚠ **The value and the unit come from a `parts` formatter, never from splitting a string.**
HANDOVER's rule (O14) exists for exactly this: add to `lib/format.ts` `formatCelsiusParts`,
`formatRpmParts`, `formatGiBParts`, `formatWattsParts`, each returning `{ value: string; unit:
string }` built from the same `render` internals (same rounding, same `en-US` separators, same
`EM_DASH` for `null` — `{ value: '—', unit: '°C' }`), with a table test proving
`` `${parts.value} ${parts.unit}` === formatX(v) `` for every fixture the existing formatter
test uses, including `0` and `null`.

**`Figure` (part of `hero.tsx`, exported)** — the GPU hero row's power block, the mock's
`.gpuTop__pw`: right-aligned; `.n` 18 px `--ink-primary`, `.u` 11 px `--ink-muted`; a `caption`
line beneath (10.5 px, `cap 250.0 W`). 24.3 + 14.2 = **38.5**.

**`Caption`** — a plain `<p>`/`<div>` class in a shared `panels/panel-text.module.css`: 10.5 px
`--ink-muted`, `display:flex; gap:10px; flex-wrap:wrap; min-height:14px`, `b` `--ink-secondary`
500. **14.2** per line. `PanelNotes` (§6.5 explanations) adopts this class: 10.5 px, gap 2, no
padding — 14.2 per message.

**`Meter` (`meter.tsx` / `.module.css`)** — the mock's `.meterRow`: `display:flex;
flex-direction:column; gap:3px`; `.head` = `.meterRow__lbl`: `display:flex;
justify-content:space-between; gap:10px; font-size:10.5px; color:var(--ink-muted)`, `.value`
`--ink-secondary` 500; `.track`: `position:relative; height:6px; background:var(--surface-sunken);
border:1px solid var(--border-lo); border-radius:1px; overflow:hidden`; `.fill`
`position:absolute; inset:0 auto 0 0; background:var(--meter)`. **Fill colour: `normal` and `none`
both `--meter`; `watch` `--status-watch`; `alarm` `--status-alarm`.** The track keeps one ground in
every band (the built `color-mix` tinted tracks go). New optional prop `tickPercent?: number` →
`.tick { position:absolute; top:-1px; bottom:-1px; width:1px; background:var(--border-hi);
left:<n>% }` — the mock's watch-threshold mark (VRAM 90, RAM 85, disk 85 used = 15 free).
`fillPercentOf`'s four boundary rules are unchanged. **Height 14.2 + 3 + 6 = 23.2.**

**`Strip` (new, `components/strip.tsx` + `.module.css`)** — the mock's `.strip`: a `<dl>`:
`display:flex; flex-wrap:wrap; gap:3px 20px; font-size:11px`; each `<div>` `display:flex; gap:7px;
align-items:baseline; min-width:0`, `dt` `--ink-muted`, `dd` `margin:0; color:var(--ink-primary);
white-space:nowrap`. Props `items: readonly { k: string; v: string }[]`. **14.8** per line; it
wraps rather than truncates, which is the only way it grows.

**`Row` / `StatusRow` (`row.module.css`, `status-row.module.css`)** — the mock's `.row` inside a
`.rows` list (`display:flex; flex-direction:column; gap:1px`): `display:flex; align-items:center;
gap:6px 9px; flex-wrap:wrap; padding:4px 7px; line-height:1.25; background:var(--surface-2);
border-left:2px solid var(--border-hi); min-width:0`. Bands on the row: `normal` rule
`rgba(12,163,12,.55)`; `watch` rule `--status-watch` + ground `rgba(250,178,25,.07)`; `alarm`
rule `--status-alarm` + ground `rgba(208,59,59,.09)`; `none` rule `--ink-faint`. Children:
`Chip sm` (glyph, 11 px wide) · `.label` (`--ink-primary`, `flex:0 0 auto`) · `.value` · `.note`
(10.5 px `--ink-muted`, `min-width:0; white-space:normal; overflow-wrap:anywhere`) · `.end`
(`margin-left:auto; display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; min-width:0`).
**When `severity` is given, the value renders as a `Chip md` pill of that band inside `.end`
(`label={value}`)** — the mock's `chip(sev, state)` — and the row is **26.8** tall (18.8 + 8).
Without `severity`, `.value` is plain 12 px text and the row is 23. A `detail`/`errors[]`
explanation is the mock's `.row__note--full`: `flex:1 0 100%; padding-left:20px` — **+13.1 per
line, +6 for the row's own row-gap** (measured 45 for a one-line note, 58.1 for two). S-B's stale
`note` keeps `--status-watch` on the same full-width line. `.value`/`.note` are `flex:0 1 auto;
min-width:0` — that is F5 (§7).

**Chan table (COOLING only, inline in `cooling-panel.module.css`)** — the mock's `.chan`:
`display:grid; grid-template-columns:auto auto auto minmax(0,1fr); gap:3px 10px;
align-items:center; font-size:11px`; columns: glyph (`Chip sm`) · id (`--ink-muted`) · value
(`--ink-primary; text-align:right; min-width:42px`; `--unk` `--ink-muted; letter-spacing:.18em`;
`--zero` `--status-alarm-ink`) · trailing note (10.5 px, ellipsis) for S-B stale age or nothing.
Four channels = 4 × 14.8 + 3 × 3 = **68.4**.

**Note footer (OQ-2, only if accepted)** — `.note`: 9.5 px / 1.4 `--ink-faint`, `border-top:1px
solid var(--border-lo); padding-top:5px`, `b` `--ink-muted` 400. One line 19.3, two lines 32.6.

**Log box (§2.9)** — 84 px fixed.

**Toggle (`chart-view-toggle.tsx`)** — restyled as a `Chip md` pill (`font: 600 9.5px/1.35
var(--font-sans)`, uppercase, `padding:2px 7px`, border `--border-hi`, ground `--surface-2`,
`cursor:pointer`, `aria-pressed` as today) with the visible label **`table`** / **`chart`** (the
view it switches to — today's `table view`/`chart view`, shortened) and the same `aria-label`. It
is passed to `PanelShell` as `headControl`, so it costs **0 px** of height. `align-self:
flex-start` goes with it. ⚠ At 1280 the CPU head (`cpu` + `Xeon W-2135 · 6C / 12T` + `table` +
`✓ normal` ≈ 322 px) exceeds its 285 px content width by ~37 px and the subtitle ellipsises to
`Xeon W-2135 · 6C…`; at ≥1600 it fits. The mock itself ellipsises subtitles at 1280 (STORAGE),
so this is the mock's own behaviour, but note it in the build notes.

### 2.1 GPU 0 / GPU 1 — `panels/gpu-panel.tsx`

§6.2: *temperature as the dominant figure with a 30-minute trace behind it, power against the
250 W cap, VRAM as a bar with absolute MiB, utilisation, SM clock, and the model currently served
on that card (joined from the serving data by instance index). Throttle reasons appear only when
something other than `0x4` is active.*

Element sequence (mock `renderGPU`, mapped):

| # | element | content (built strings, unchanged) | font | height | 1280 | ≥1600 |
|---|---|---|---|---|---|---|
| 1 | `PanelShell` head | `GPU 0` · `Tesla PG500-216 · 00000000:17:00.0` · toggle · chip `✓ normal` (`panelChip`) | 10/11/9.5 | 25.8 | 25.8 | 25.8 |
| 2 | **hero row** `div.heroRow` (`display:flex; align-items:flex-end; gap:14px; flex-wrap:wrap`) | `Hero` `formatCelsiusParts(tempC)` sev `severityGpuTemp` · `Sparkline` (`flex:1 1 130px; min-width:110px` wrapper) · `Figure` `formatWattsParts(powerW)` + caption `cap ${formatWatts(powerCapW)}` | 34/13 · — · 18/11 + 10.5 | max(32.3, chart, 38.5) | **38.5** | **50** |
| 3 | `Meter` **power** | label `power`, value `${formatWatts(powerW)} / ${formatWatts(powerCapW)}`, `used=powerW total=powerCapW`, severity `null` (power has no §6.3 band → `--meter` fill) | 10.5 | 23.2 | 23.2 | 23.2 |
| 4 | `Meter` **VRAM** | label `VRAM`, value `${formatMiBPair(used,total)} · ${formatPercent(pct)}`, severity `severityVram`, `tickPercent={90}` | 10.5 | 23.2 | 23.2 | 23.2 |
| 5 | `Strip` | `util` `formatPercent(utilPct)` · `SM clk` `formatMHz(smClockMHz)` · **`served by instance N`** `formatText(instance?.model)` | 11 | 14.8 | 14.8 | 14.8 |
| 6 | throttle line **only when `decode.notable`** | `Caption`: `throttle` + one `Chip code` per reason (`decode.reasons[i].label`, e.g. `0x20 sw thermal slowdown`), band per reason's severity | 10.5 / 10 | 19.5 | (0 healthy) | (0 healthy) |
| 7 | `PanelNotes` | `errorsForPanel(snapshot,'gpu')` | 10.5 | 14.2 × n | (0 healthy) | (0 healthy) |

Budget, healthy: 25.8 + hero + 23.2 + 23.2 + 14.8 + 4 gaps (20) + 19 = **164.5 at 1280, 176.0 at
≥1600**. With the throttle line: +24.5. With OQ-1's caption (`30 min · min · max · now`, 14.2 +
5): +19.2 → the mock's 208.1 / 219.7 exactly.

Kept from the built, unchanged: the `gpus === null` takeover (`no GPUs enumerated` +
`errorsForPanel`), the S-E `card not enumerated` takeover, `panelChip` over the three leaves,
`decodeThrottleMask(...).notable`, the join `gpu.index === serving.instance`, the label *served by
instance N*, `data-role="gpu-sparkline-wrap"` / `"gpu-full-chart-wrap"` (measurements 7/8).
Removed: the `temperature` `Row` (it is the hero), the body-row toggle (head), the `power` `Row`
(meter), the three `Row`s util/SM/served (one strip), and **the `StackedTimeSeriesChart`
promotion** — §3 replaces it with the 50 px sparkline. The VRAM `%` in the meter label is the
figure §6.3 bands on and costs no height; the mock prints it and it is kept.

The mock's `.gpuTop__pw` (the 18 px power figure) renders the **same** `powerW` reading the meter
row draws against the cap; it is the mock's form for "power" and costs 0 px (the row is 38.5 at
1280 because of it, 50 at ≥1600 because of the chart). Kept.

### 2.2 COOLING — `panels/cooling-panel.tsx`

§6.2: *`fan5` RPM as the headline, the derived mode, `fan2` and the remaining channels smaller,
and the fan service state*, with the shared-time chart.

| # | element | content | height |
|---|---|---|---|
| 1 | head | `cooling` · `dell_smm · channel 5 = FAN_HDD (PCIe/GPU)` · toggle · chip (`panelChip` over fan5 + fan1–4 + service) | 25.8 |
| 2 | hero row | `Hero` `formatRpmParts(fan5Rpm)` (unit `RPM`), sev `severityFan5`, **`staleValueOr`** as today · right block: `Chip md` **`mode`** pill whose label is `formatCh5Pwm(cooling)` verbatim (`HIGH pwm 255` / `EC auto` / `unavailable`), band `null` (**invariant 3, O13: the mode is not a severity**; `unavailable` wears the `none` hatch — the mock's `chip('unk', 'unavailable')`) | 32.3 |
| 3 | `StackedTimeSeriesChart` (as today, `CHART_SIZE.cooling`) | temp plot (GPU 0 solid, GPU 1 dashed) over fan plot, legend inside the first plot | **174** |
| 4 | chan table | fan 2, fan 1, fan 3, fan 4 (built order kept) — glyph `severityFanStopped` · `fan N` · `formatRpm` (`0 RPM` in `--status-alarm-ink`; `—` in `--unk`) · note column for S-B/S-H detail when present | 68.4 |
| 5 | `.rows` › `StatusRow` **fan service** | glyph `severityUnitState` · `gpu-fan-control.service` · [`note`: S-B stale age] · `.end`: pill `formatText(serviceState)` · [`detail` full-width: the `dbus` message] | 26.8 |
| 6 | `PanelNotes` (`dell-smm` message, S-H: once, under the figures it blanks) | | 14.2 × n |

Intrinsic budget: 25.8 + 32.3 + 174 + 68.4 + 26.8 + 4 gaps (20) + 19 = **366.3**. The grid cell
stretches it to rows 2–3 (`align-self: stretch`, §3.1); healthy at 1920 rows 2–3 = max(366.3,
CPU 185.1 + 9 + SAFETY 160.0 = 354.1) = **366.3** — COOLING now sets its own rows by 12 px, which
is the shape the mock has (its intrinsic ≈ 410 sits in a 472 cell). With OQ-2's note: 403.9.

The mock's HTML legend line (`14.8`) is the built chart's in-SVG legend (16 px inside plot 1) —
not duplicated. The mock's `mode HIGH` pill + `pwm5 = 255` caption is **one** string here
(§6.6's row: `HIGH pwm 255`), so the right block is 18.8 not 33, and the hero row is 32.3.

Removed: the headline `StatusRow` (hero), the `mode` `Row` (pill), the four `.smaller` `Row`s (chan
table, 81 → 68.4), the body toggle. The `fan5` row's two note slots (`note={fan5Age}`,
`detail={dellSmmError}`) move: the stale age to the hero's `ariaLabel`-adjacent caption? — **no**:
S-B's stale text is a fact the operator must see, so when `fan5Age !== null` the hero row gains a
`Caption` line under it (`--status-watch`, 14.2 + 5) — degraded only, 0 healthy. `dellSmmError`
renders once in `PanelNotes` (S-H). 10b-CO5's assertion (no note element when neither exists)
holds: nothing is defaulted.

### 2.3 CPU — `panels/cpu-panel.tsx`

§6.2: *package temperature, aggregate utilisation with a trace, and load average.* The trace
belongs to **utilisation** — the built temperature sparkline is an addition §6.2 does not make and
the mock does not draw; it is removed.

| # | element | content | height |
|---|---|---|---|
| 1 | head | `cpu` · `Xeon W-2135 · 6C / 12T` (`formatCpuModel`, `coreThread`) · toggle · chip `severityCpuTemp` | 25.8 |
| 2 | `Hero` | `formatCelsiusParts(cpuTempC)`, unit **`°C pkg`** (the mock's; "package" is §6.2's own word), sev = chip | 32.3 |
| 3 | `Sparkline` (utilisation, `SERIES_COLORS.gpu1` as today, `CHART_SIZE.cpuSparkline` / `.cpuPromoted`, two wrappers by media query exactly as the GPU card) | | **38** / **50** |
| 4 | `Meter` **utilisation** | label `utilisation`, value `formatPercent(cpuPct)`, `used=cpuPct total=100`, severity `null` (`--meter`) | 23.2 |
| 5 | `Strip` | `load` `formatLoadAverage(loadAvg)` | 14.8 |
| 6 | `PanelNotes` | **all** CPU `errorsForPanel` messages (`coretemp`, `proc-stat`, `proc-loadavg`, `proc-cpuinfo`) — the hero and the strip have no note slot, and S-H says the panel satisfies "beside it" | 14.2 × n |

Budget: 25.8 + 32.3 + 38 + 23.2 + 14.8 + 20 + 19 = **173.1 at 1280; 185.1 at ≥1600**. OQ-1's
caption (`30 min util · min · max · now`): +19.2 → 204.3, the mock's number. The mock's second
strip item `coretemp pkg · Tjmax 100` is a §6.3 basis constant, not a reading — not copied (§6),
which is why the 1280 strip stays one line (mock 210.1 had it wrapping to 32.7).

### 2.4 MEMORY — `panels/memory-panel.tsx`

§6.2: *used against 61 GiB as a bar, plus swap. Swap gets its own row.*

| # | element | content | height |
|---|---|---|---|
| 1 | head | `memory` · `/proc/meminfo` · chip `panelChip(severityRam, severitySwap)` | 25.8 |
| 2 | `Hero` | `formatGiBParts(memUsedGiB)`, unit **`GiB used`**, sev `severityRam` | 32.3 |
| 3 | `Meter` **RAM** | `RAM` · `${formatGiB(used)} / ${formatGiB(total)} · ${formatPercent(pct)}` · sev `severityRam` · `tickPercent={85}` | 23.2 |
| 4 | `Meter` **swap** | `swap` · `${formatSwapGiB(swap)} / ${formatSwapGiB(swapTotalGiB)}` · `used=swap total=swapTotal` · sev `severitySwap` | 23.2 |
| 5 | `PanelNotes` (`proc-meminfo`) | | 14.2 × n |

Budget: 25.8 + 32.3 + 23.2 + 23.2 + 15 + 19 = **138.5** everywhere. OQ-2's note (`any swap in use
is notable here — 2 × 12 GiB …`, 32.6 + 5): 176.1. The mock's caption `MemTotal − MemAvailable ·
19.8 %` is a formula (prose) plus the percentage; the percentage is kept **inside the RAM meter's
label line** (same as VRAM), so no caption row — that is the 19.1 px between 176.1 and the mock's
195.2. The mock composes the GiB pair with one unit; `lib/format.ts` has no `formatGiBPair`
(memory-panel's own doc, invariant 7) — keep two `formatGiB` calls: `33.2 GiB / 61.6 GiB · 53.9 %`.
`swapTotalGiB` is on the wire (`host.swapTotalGiB`) and the fixture, so the swap meter has a total.

### 2.5 SAFETY — `panels/safety-panel.tsx`

§6.2: *the four checks as a compact list with pass/warn/fail glyphs … each row carries its
`errors[]` explanation beside it.*

| # | element | content | height (healthy) |
|---|---|---|---|
| 1 | head | `safety` · `ufw · pwm5 · dkms · fan service` (built; §6.2's table gives SAFETY a fixed source label, and *silent failures* is not one) · chip `panelChip(...)` (severity word — the mock's `1 of 4 failing` is OQ-3) | 25.8 |
| 2 | `.rows` › 4 × `StatusRow` | glyph · `ufw enforcing` / `pwm5 present` / `DKMS for running kernel` / `fan service` · `.end`: [`standing` neutral pill when the row's condition is standing — see below] + value pill (`yes`/`no`/`—`, `active`…) · full-width `note` (S-B age, watch) · full-width `detail` (`errorsForPanel` message per source, S-G/S-H) | 4 × 26.8 + 3 = 110.2 |
| 3 | `unknownStanding` block (D3) | as today, restyled 10.5 px | 0 healthy |

Budget: 25.8 + 110.2 + 5 + 19 = **160.0** at every viewport. **The mock's 259.1 is 99 px of
per-row prose** (`hwmon4/pwm5 — 5-fan DKMS module loaded`, `updates/dkms/dell-smm-hwmon.ko.zst`,
`channel 5 claimed, INTERVAL=1`, a three-line ufw sentence) that §3.7 forbids writing in the UI:
the only text under a row is its `errors[]` entry, which a healthy box does not file. Degraded:
each row with a one-line entry is 45.9 (26.8 + 6 + 13.1), two lines 59 — the mock's state B
SAFETY (58.1-px rows) is exactly this shape and measures 232–325 depending on width; §2.11.

The `standing` pill is the mock's form for §6.4's *"shows at watch colour in SAFETY with its real
severity named in the row"*. Whether the built SAFETY renders a standing marker at all is outside
this loop (there is no live standing subject — `ufw.conf` reads `ENABLED=yes`); the spec only
fixes where it goes and what it costs (0 px: inside `.end`).

### 2.6 STORAGE & NETWORK — `panels/storage-network-panel.tsx`

| # | element | content | height |
|---|---|---|---|
| 1 | head | `storage & network` · `statvfs · eno1` · chip `panelChip(root, home, link)` | 25.8 |
| 2 | `Meter` `/` | `${formatGiB(used)} / ${formatGiB(total)}` **GiB** (O19/§6.6 — never `GB`) · `severityDiskFree` · `tickPercent={85}` | 23.2 |
| 3 | `Meter` `/home` | same | 23.2 |
| 4 | `PanelNotes` (`statvfs`) | | 14.2 × n |
| 5 | `Strip` | `eno1 ↓ rx` `formatBytesPerSecond(rx)` · `eno1 ↑ tx` `formatBytesPerSecond(tx)` (the arrows are §6.2's "direction"; `proc-net-dev`'s message goes to `PanelNotes`) | 14.8 |
| 6 | `Caption` **link** | `link` + `Chip md` pill `formatText(link)` band `severityLink` (+ S-B stale text, `net-operstate` detail beneath as a caption line) | 18.8 |

Budget: 25.8 + 23.2 + 23.2 + 14.8 + 18.8 + 20 + 19 = **144.8**. OQ-2's note (`~/models 80.4 GB
across 5 GGUF — …`): 182.4, the mock's number exactly. The mock's meter label adds `148.6 GB free`
— a figure not on §4's snapshot and arithmetic a component must not do; not copied. The mock's
pill text `up · 1000 Mb/s full` carries link speed and duplex, neither on the snapshot; the pill
reads `up`.

### 2.7 SERVING — `panels/serving-panel.tsx`

§6.2: *one row per discovered instance: unit state dot, port, model alias, context, `/health`
result. No token rates.*

| # | element | content | height |
|---|---|---|---|
| 1 | head | `serving` · `llama-server instances` (built fixed label) · chip `panelChip(...)` (`2 of 2 up` is OQ-3) | 25.8 |
| 2 | `.rows` › one `StatusRow` per instance | glyph (`worstSeverity(unit, health)`) · label `llama-server@N` · **second name span** `:${formatPort(port)}` · `.note` `${formatText(model)} · ctx ${formatTokens(ctx)}` · `.end`: `health ${formatText(health)}` (11 px `--ink-muted`) + pill `formatText(unitState)` · full-width `note`/`detail` (S-B age; the S-G per-instance `errors[]` join, unchanged) | 26.8 each, 1 px gap |
| 3 | `PanelNotes` (unattributed entries) | | 14.2 × n |

Budget: 25.8 + 2 × 26.8 + 1 + 5 + 19 = **104.4**. OQ-2's note (`instances are discovered from
/etc/llama-server/*.env …`): 142.0 (the mock's 140.2 is the same anatomy at the mock's 25.9-px
row; the 0.9 px is `line-height` 1.25 vs the chip's 1.35 — noted, inside tolerance). The mock's
`since 2026-09-04 12:46:18` is not on the snapshot. The `serving: null` / `[]` branches stay.
**F5 (§7) is what keeps this row on one line at 1280** (`:8080 · qwen3.6-27b · ctx 131,072 ·
health ok` used to be one non-wrapping value; it is now three wrapping pieces).

### 2.8 SESSION EVENT LOG — `panels/session-event-log-panel.tsx`

| # | element | content | height |
|---|---|---|---|
| 1 | head | `session event log` · `state transitions since page load` (built; the mock's `6 since 14:09:12 · newest first · lost on reload` is a live count — measurement, forbidden in a subtitle) · chip `null` (OQ-4) | 25.8 |
| 2 | scroll box `div[role=group][tabindex=0]` | **`height: 84px`** (fixed, not `max-height` — so the panel is 133.8 whether the log holds one entry or five hundred), `overflow-y:auto; overflow-x:auto; border:1px solid var(--border-lo); border-radius:2px; background:var(--surface-sunken)`; `--table-scroll-max` no longer used here | 84 |

Each `<li>`: `display:grid; grid-template-columns:auto auto auto minmax(0,1fr); gap:0 9px;
padding:3px 9px; border-bottom:1px solid var(--border-lo); font-size:11px; align-items:baseline`
— time (`--ink-muted`) · source (`--ink-secondary`) · `Chip sm` glyph · sentence
(`--ink-primary; white-space:normal`); last `li` no rule; `[data-severity='alarm']` ground
`rgba(208,59,59,.07)` + sentence `--ink-max`; `watch` `rgba(250,178,25,.05)`. ~21 px per entry,
four visible. Budget: 25.8 + 84 + 5 + 19 = **133.8** — the mock's number exactly, at every
viewport. `describeEvent`'s sentences and `entry.source` are unchanged. F1 (§7) is what stops
this box growing the page.

### 2.9 What every panel gains and loses — the reconciliation, per the handoff's rule

*§6.2 fixes content, so every §6.2 row stays; layout rows the mock omits are removed; rows the
mock adds that §6.2 does not require are owner questions.*

| built row | fate | reason |
|---|---|---|
| `temperature` / `fan 5` headline `Row`s (GPU, CPU, COOLING) | → `Hero` | the §6.2 "dominant figure" in the mock's form |
| `table view` body `button` | → head control | §6.2 requires the table view; where its switch sits is layout; 0 px in the head |
| GPU `power` `Row` | → `Meter` | §6.2 "power against the cap" — a bar is the mock's form |
| GPU `utilisation` / `SM clock` / `served by instance N` `Row`s | → one `Strip` line | same three §6.2 readings, 72 → 14.8 px |
| CPU temperature `Sparkline` | **removed** | §6.2 attaches the trace to utilisation; the mock has one spark |
| CPU `utilisation` `Row` | → `Meter` | mock form |
| CPU `load average` `Row` | → `Strip` | mock form |
| MEMORY `swap` `Row` | → `Meter` | §6.2 "its own row"; the mock's row is a meter |
| COOLING `mode` `Row` | → pill in the hero row | §6.2 "the derived mode" beside the headline |
| COOLING fan 1–4 `Row`s | → chan table | §6.2 "smaller" — 11 px grid |
| GPU ≥1600 `StackedTimeSeriesChart` | → 50 px `Sparkline` variant | §3 |
| every `PanelNotes` / `detail` / stale `note` | kept, restyled | §6.5 / §3.7 / S-B / S-G / S-H |
| `gpus: null`, `card not enumerated`, `serving: null`/`[]`, `unknownStanding` | kept | §6.5, S-E, D3 |

| mock row | fate |
|---|---|
| min/max/now `caption` under a trace (GPU, CPU) | **OQ-1** |
| per-panel `note` footers (COOLING, MEMORY, STORAGE, SERVING) | **OQ-2** |
| chip texts with counts (`1 of 4 failing`, `2 of 2 up`, `1 of 2 down`, `channel lost`, `10 s debounce`) | **OQ-3 / OQ-4** |
| paused banner | **OQ-5** |
| `engage 55` / `EC auto 2210` reference lines on the cooling chart | **OQ-6** |
| throttle line always present with `· normal, not a fault` | not copied (§6.2 hides `0x4`) |
| per-row prose notes, `since …`, `Tjmax 100`, link speed, `GB free`, `MemTotal − MemAvailable` | not copied (§6) |

### 2.10 The page — arithmetic the builder can check by hand

Sticky band = 10 px top gutter + header 43 = **53** (+ 9 + banner when pinned). Grid padding
`9px 12px 12px` (the 9 is the band→grid gap), gap 9, four rows: r1 = GPU, r2+r3 = max(COOLING
intrinsic, CPU + 9 + SAFETY), r4 = max(SERVING, LOG).

| viewport | r1 | r2+r3 | r4 | grid | page | spare | with 6-alarm banner (+72.7) |
|---|---|---|---|---|---|---|---|
| 1280 × 1024, spec-only | 164.5 | 366.3 | 133.8 | 703.6 | **756.6** | **267** | 829 — fits |
| 1600 × 1024 | 176.0 | 366.3 | 133.8 | 715.1 | 768.1 | 256 | 841 |
| 1920 × 1080 | 176.0 | 366.3 | 133.8 | 715.1 | 768.1 | **312** | 841 |
| 1280, every OQ accepted | 183.7 | 403.9 | 142.0 | 768.6 | 821.6 | 202 | 894 |
| 1920, every OQ accepted | 195.2 | 403.9 | 142.0 | 780.1 | 833.1 | 247 | 906 |

(grid = rows + 2 × 9 gaps + 21 padding.) Today: 1380 / 1442 / 1442.

### 2.11 Degraded-state budgets, from the mock's state B

The spare above is spent here, never on chrome:

| state | where | cost | source |
|---|---|---|---|
| a notable throttle mask | GPU card | +24.5 (19.5 line + gap) | mock b: `0x4` + `✕ 0x20 sw thermal slowdown` |
| a source's `errors[]` line | `PanelNotes` | +14.2 per message (+5 once) | |
| a `StatusRow` with a one-line explanation | SAFETY, SERVING, COOLING service | +19.1 per row (45.9 vs 26.8) | mock b: 58.1-px rows carry two lines |
| SAFETY, all four rows explained (one line each) | | 160.0 → 236.4 | mock b at 1920: 259.1 with three prose lines |
| S-B stale age on a row | +19.1 (full-width watch line) | |
| unavailable channel 5 | hero 28.6 instead of 32.3; mode pill `unavailable` | −3.7 | mock b `hero--unk` 28.6 |
| fan 3 at `0 RPM` | chan row unchanged (14.8; the numeral turns `--status-alarm-ink`) | 0 | the mock spends 18.8 on a `stalled` chip — not copied |
| six-alarm banner (lead + 5 chips on one line at ≥1600) | band | +63.7 + 9 | mock b: 63.7 at 1920/1600, 90.5 at 1280 (chips wrap to two lines) |
| worst plausible at 1280, every OQ on: r1 208, r2+r3 = CPU 204 + 9 + SAFETY 236 = 449, r4 180, banner 99 | page ≈ 1005 | **fits 1024** | |

---

## 3. The grid and the chart sizes

### 3.1 `components/grid.module.css` — the §6.1 areas stay; four values change

The three `grid-template-areas` blocks (≥1280 / 900–1279 / <900) and the nine `grid-area`
rules are **untouched** — §6.1's placement was never the problem. Measured on the mock's
`.grid`: gap 9 / 9, `align-items: start`, COOLING `align-self: stretch`; on `.app`: padding
`10px 12px 12px`, gap 9.

```css
.grid {
  display: grid;
  gap: 9px;                    /* was 0.75rem = 12 */
  padding: 9px 12px 12px;      /* was 0.75rem all round; the 9 is the band→grid gap, the 12s are the mock's .app gutter */
  align-items: start;          /* NEW — the mock's; a short panel no longer stretches to its row (MEMORY under CPU, STORAGE under SAFETY) */
  grid-template-columns: repeat(4, minmax(0, 1fr));   /* minmax(0, …) as the mock: a long subtitle cannot widen a track */
  /* …areas unchanged… */
}
.cooling { grid-area: cooling; align-self: stretch; }   /* NEW — §6.1: COOLING takes rows 2–3 whole */
```

The slot wrappers' `display:flex; min-width:0; min-height:0` and `> * { flex: 1 1 auto }` stay
(with `align-items: start` a slot is its panel's intrinsic height and the panel fills it; the
stretched COOLING slot is filled by its panel the same way). The 2-column and 1-column bands use
the same `minmax(0, 1fr)` tracks. Measurements 1–6 of `measure-breakpoints.mjs` are unaffected;
measurement 9 is what this loop turns green.

### 3.2 `CHART_SIZE` in `components/grid.tsx`

Measured on the mock: the GPU/CPU sparkline `<svg>` is **38 px** tall below 1600 and **50 px** at
≥1600 (`drawSpark`: `padT 4`, `padB 10` when tall, `padR 26` reserved for reference labels, two
8.5 px `hh:mm` labels at `y = H − 1`, dashed reference lines with a right-hand label); its width
is the hero row's remainder (447 at 1280, 607 at 1600, 767 at 1920 for a GPU card; 285 / 365 /
445 for CPU). COOLING's pair is `padTop 6 + hTemp 84 + gap 10 + hFan 46 + axis 14 = 160`, plus a
14.8-px HTML legend line.

```ts
export const CHART_SIZE = {
  /** GPU card, 1280–1599 — fills the hero row beside the 34 px figure and the power block (601 − 59 − 67 − 28 = 447 available). */
  gpuSparkline: { width: 440, height: 38 },
  /** GPU card, ≥1600 — §6.1's "promoted" form: the SAME primitive, 50 px, with the time axis and the §6.3 reference lines (607 available at 1600). */
  gpuPromoted: { width: 600, height: 50 },
  /** CPU utilisation, 1280–1599 (a 307 px column has 285 px of content). */
  cpuSparkline: { width: 280, height: 38 },
  /** CPU utilisation, ≥1600 (365 available). */
  cpuPromoted: { width: 360, height: 50 },
  /** COOLING, PER PLOT: two plots paint 2 × 72 + 10 (gap) + 20 (axis) = 174 px, the mock's 160 + its 14.8 legend line, with the legend inside plot 1. */
  cooling: { width: 600, plotHeight: 72 },
} as const;
```

`sparkline` (220 × 44) and the old `gpuPromoted` (480 × 140 → 160 painted) are **removed**; every
importer is one of the four chart-bearing panels and each is rewritten in §2 anyway. `grid.test.tsx`'s
assertions on the keys change with them.

**Widths are fixed at the 1280 design width and leave slack at 1600/1920** (a 600-px chart in a
921-px content row at 1920). The mock fills the row because `drawSpark` reads `host.clientWidth`;
`components/` cannot measure (no `ResizeObserver`, no state), a `viewBox` + `width:100%` scales
height with width (breaks every budget above), and `preserveAspectRatio="none"` stretches the 8.5
px axis text on the promoted form. 10d's Q5 ("one constant, or per breakpoint?") stands; one
constant per chart, sized for the design target, is L9's answer and this loop keeps it. If the
slack offends on the wall, the cheap follow-up is a third wrapper at ≥1920 — not this loop.

**The ≥1600 promotion — mechanism, and why a CSS media query rather than a shell prop.** The
mock's `drawSpark` reads `window.innerWidth`. `components/` is hook-free (`purity.test.ts`
walks it), so the width decision must come from outside the render. Two candidates:

1. **A CSS media query in the panel's own module** — the mechanism 10b built and 10c-3 measured
   (measurements 7 and 8): both variants render, `gpu-panel.module.css` shows one, and the
   breakpoint lives in the same stylesheet family as `grid.module.css`'s own `1280`/`1600`,
   so there is exactly one vocabulary for "how wide am I". Cost: two `<svg>`s in the DOM per
   card, one hidden — ~600 points twice, which already ships.
2. **A shell-computed prop** — `app/dashboard-shell.tsx` subscribing to `matchMedia('(min-width:
   1600px)')` via `useSyncExternalStore` and passing `promoted: boolean` down. Legal (hooks are
   allowed in `app/`), one `<svg>`, but it is a second source of truth for the breakpoint that can
   drift from the CSS one, it re-renders nine panels on every crossing, and it makes the promotion
   invisible to `renderToStaticMarkup` in a new way (a prop instead of a class).

**This spec chooses (1).** It is measured, it needs no new hook, and its one cost (a hidden
duplicate) is already paid. CPU gets the same two wrappers (`data-role="cpu-sparkline-wrap"` /
`"cpu-full-chart-wrap"`) so measurement 7/8's shape covers it.

**`Sparkline` gains three optional props — the promoted form is the same primitive, not a second
chart.** `stacked-time-series-chart.tsx` at a 50-px total would be `plotHeight 30`, with a
16-px legend or an end-label, four 9-px y-tick labels in a 30-px plot and five x-ticks — not the
mock's form, and illegible. So, in `sparkline.tsx`:

- `domain?: { readonly min: number; readonly max: number }` — a fixed y-scale (values clamped
  into it, as the big chart clamps). GPU cards pass `{ min: 30, max: 90 }` at **both** sizes (the
  mock does: both cards share a scale and the 80 °C line is always on screen). CPU passes none
  (autoscale, as today).
- `refs?: readonly { readonly v: number; readonly label: string; readonly alarm?: boolean }[]`
  — dashed 1-px lines (`stroke-dasharray: 3 3`, opacity .55; `alarm` → `--status-alarm`,
  otherwise `--ink-muted`) with an 8.5-px label at `x = W − 26 + 3`; reserves `padR = 26`. GPU
  cards pass `[{ v: 80, label: '80', alarm: true }, { v: 70, label: '70' }]` — **§6.3's own
  boundaries** (`≥ 80` alarm, `70–79` watch). Today they are bare literals inside
  `severityGpuTemp` (`lib/severity.ts:125` and `:127`, verified); export them as
  `GPU_TEMP_WATCH_C = 70` / `GPU_TEMP_ALARM_C = 80` and have both the function and the panel read
  the constants, so the line on the chart and the colour of the cell cannot disagree. The mock's
  `55` is `gpu-fan-control`'s `AUTO_BELOW`, which the dashboard does not read — OQ-6.
- `timeLabels?: boolean` — `formatTime(points[0].tMs)` at `x = 0` and `formatTime(last.tMs)`
  anchored `end` at `x = W − padR`, 8.5 px `--ink-muted`, `y = H − 1`; reserves `padB = 10`,
  `padT = 4`. `formatTime` is already required, so `HH:MM:SS` renders (the mock prints
  `hh:mm`; 8 characters at 8.5 px ≈ 43 px, fine).

When none of the three is given the primitive draws exactly what it draws today (the existing
tests are unchanged; new ones cover the three props, their `null`-point behaviour, and that the
table view is identical with or without them — the table is the chart's accessibility floor and
must not gain rows a decoration added). The hover layer, gap marks and table view are untouched.
The mock also fills the area under the line at opacity .10 (`areaFrom`) and draws a 4.5-px end
dot with a 2-px surface stroke; add the area (`<path>` per run, `fill=color opacity=.1`) and set
the end dot `r=4.5` / `stroke-width 2` — form, 0 px.

`StackedTimeSeriesChart` needs **no API change**: `plotHeight 72` gives a 56-px temperature plot
under the 16-px legend and a 72-px fan plot. The mock's unequal 84/46 split would need a per-plot
`plotHeight` on `ChartPlot` — declined here to keep one constant (`CHART_SIZE.cooling`) and no
primitive change; recorded as a refinement, not required for acceptance. Its stroke width stays
2 (mock 2), tick labels 9 px (mock 9), `--gridline`/`--baseline` take the mock's hexes via §1.

---

## 4. The header — `components/header.tsx` / `header.module.css`

§6.2's list is exhaustive: *hostname, `uptimeSec` beside it, an aggregate status dot, the snapshot
timestamp and the age, cadence, window, refresh now, pause/resume, logout.* The mock's `hostMeta`
(`192.168.4.71 · kernel 7.0.0-30 · up 2 d 02:01`) shows an IP and a kernel **§6.2 forbids**; only
the uptime survives. Measured: topbar **43 px** (padding 9/12, tallest child the 23-px control
row), `.brand` 20.3, `.agg` 22.8, `.snap` 14.8, `.ctl` 23.

DOM order and CSS (the built prop set is unchanged; `aggregateStatus` still produces glyph + text):

```
header.header            display:flex; align-items:center; gap:6px 13px; flex-wrap:wrap;
                         padding:9px 12px; background:var(--surface-1);
                         border:1px solid var(--border); border-radius:var(--radius)
  div.identity           display:flex; align-items:baseline; gap:10px; min-width:0; flex-wrap:wrap
    span.hostname        font-size:15px; font-weight:600; letter-spacing:.02em; color:var(--ink-primary); white-space:nowrap
    span.uptime          font-size:11px; color:var(--ink-muted); white-space:nowrap        ← `formatUptime`, "up 2 d 02:01"; NOTHING else
  span.spacer            flex:1 1 auto                                                    ← the mock's .topbar__spacer (new)
  div.status[role=status]   display:flex; align-items:center; gap:8px; padding:3px 10px 3px 8px;
                         border:1px solid var(--border-hi); border-radius:999px; background:var(--surface-2); white-space:nowrap
    span.dot             font-size:11px; line-height:1                                    ← glyph ● / ❙❙ / ⊘, colour by data-severity
    span.statusText      font-size:11px; letter-spacing:.03em; color:var(--ink-primary)   ← "all healthy" / "1 alarm" / "paused · 6 alarms" / "no readings"
  span.time              font-size:11px; color:var(--ink-muted); white-space:nowrap        ← `14:47:31 EDT · 2 s ago`, the two figures wrapped in <b> --ink-secondary 500
  div.controls           display:flex; align-items:center; gap:5px
    label.control        display:inline-flex; align-items:baseline; gap:6px; padding:3px 7px 3px 8px;
                         border:1px solid var(--border-hi); border-radius:2px; background:var(--surface-2)
      span.controlLabel  font:8.5px var(--font-sans); letter-spacing:.1em; text-transform:uppercase; color:var(--ink-faint)
      select             appearance:none; font:11px/1.35 var(--font-mono); color:var(--ink-primary); background:transparent; border:0; padding:0; height:15px
                         (a `▼` 7 px --ink-muted pseudo-element after it, the mock's .ctl__caret)
    button ×2            font:11px/1 var(--font-mono); min-width:26px; height:23px; padding:0 7px; color:var(--ink-secondary);
                         background:var(--surface-2); border:1px solid var(--border-hi); border-radius:2px
                         [aria-pressed='true'] → color:var(--ink-primary); border-color:#3a4552; background:var(--nodata)
    span.separator       width:1px; align-self:stretch; background:var(--border-hi); margin:0 3px
    button.logout        as above
```

- **Status pill bands** (`data-severity`, unconditional as today — §6.2 *alongside, never instead*):
  `normal` border `rgba(12,163,12,.40)`, glyph `--status-good-ink`; `watch` `rgba(250,178,25,.42)`,
  `--status-watch`; `alarm` border `rgba(208,59,59,.55)`, background `rgba(208,59,59,.10)`, glyph
  `--status-alarm-ink`; `none` glyph `--ink-muted`. **Mode** (`data-mode` `paused` / `stale`) adds
  the mock's `.agg__mode` hatch — `background: var(--nodata), var(--surface-2)` — to the same pill.
  The mock renders mode as a second sub-pill and the severity text without the mode word; the
  built `aggregateStatus` returns §6.2's literal (`❙❙ paused · 6 alarms`) in one string, and that
  literal, its `no readings` (S-A) and its omitted-zero rule are spec text — **kept**. One pill.
- **Buttons are glyph-only** — `⟳`, `❙❙` / `▶`, `⏻` — with `aria-label` and `title` (`Refresh
  now`, `Pause polling` / `Resume polling`, `Log out`), the mock's form. `header.test.tsx` asserts
  the visible words today (`'⟳ refresh'` at line 69, `'pause'` at 70, `'logout'` at 75); those
  three assertions move to the accessible names (`aria-label="Refresh now"` etc.), and the test's
  own comment about `toContain('refresh')` being satisfied by the cadence control's label goes
  away with the next point.
- **The cadence select's key reads `cadence`**, the mock's word and §6.2's own (*"the cadence
  selector"*); the built label is `refresh`, which `header.test.tsx`'s comment already records as
  ambiguous beside the refresh-now button. The window select's key stays `window`.
- The `.snap[data-stale]` hatch on the time string is dropped: the pill already carries the mode.
- **Height 43.** The built band is `padding .6em` + `border-bottom` = 48.8; §1's 12-px base
  alone would make it ~38, so the values above are stated in px, not scaled.

**Sticky band (`app/dashboard-shell.module.css`)**: `.stickyBand { position:sticky; top:0;
z-index:10; padding:10px 12px 0; background:var(--surface-0); display:flex;
flex-direction:column; gap:9px }` — the mock's `.app` gutter and its 9-px gap between topbar and
banner, on the one sticky element (F13 stays one element). The grid's padding becomes `9px 12px
12px`.

---

## 5. The banner — `components/alarm-banner.tsx` / `alarm-banner.module.css`

Measured on the mock's state B: **63.7 px** at 1600/1920 (head 17.8 + `margin-top 7` + rest 20.8
+ padding 16 + border 2), **90.5** at 1280 (the five chips wrap to two lines: rest 47.7); one
alarm (no `rest`) is 35.8. The real app's two-alarm banner is 58 today (two 16-px-base lines).

```
div.banner[role=alert]   display:flex; align-items:flex-start; gap:14px; padding:8px 12px;
                         background:linear-gradient(90deg, rgba(208,59,59,.20), rgba(208,59,59,.07) 60%, rgba(208,59,59,.03)), var(--surface-1);
                         border:1px solid rgba(208,59,59,.55); border-left:3px solid var(--status-alarm); border-radius:var(--radius)
  span.glyph             color:var(--status-alarm-ink); font-size:14px; line-height:1.25          ← ✕
  div.body               min-width:0; flex:1 1 auto
    div.head             display:flex; align-items:baseline; gap:10px; flex-wrap:wrap
      span.count         font:700 10px var(--font-sans); letter-spacing:.13em; text-transform:uppercase; color:var(--status-alarm-ink)   ← "6 active alarms" (derived from the list, F14 — unchanged)
      span.lead > b      font-size:13px; color:var(--ink-max); font-weight:600                     ← `${lead.label} ${lead.value}`
      span.since         font-size:11px; color:var(--ink-muted)                                   ← `for 2 d 06:00` (S-C — ELAPSED; the mock's `since 15:10:40` clock is wrong, §6)
      span.stale         font-size:11px; color:var(--status-watch)                                ← `last read 6:12 ago` (S-B), only when stale
    div.rest             margin-top:7px; display:flex; flex-wrap:wrap; gap:6px 8px
      span (item)        display:inline-flex; align-items:baseline; gap:7px; font-size:11px; color:var(--ink-secondary);
                         padding:2px 8px; border:1px solid rgba(208,59,59,.32); border-radius:2px; background:rgba(208,59,59,.06)
        i.itemSince      font-style:normal; color:var(--ink-muted)                               ← `for 4 min`
        i.stale          color:var(--status-watch)
```

The mock's lead carries a prose `note` (`alarm band ≥ 80 °C (spec 83, slowdown 87)`) after the
value; `BannerCondition` has `label` and `value` and no such field — not copied. The item text is
`${label} ${value}` + since, as built. `.item` gains a real class this time (10c1-A8's dangling
`styles.item` is a class now, so `lib/dangling-css-class.test.ts` must see it declared).

**Paused variant (OQ-5).** The mock's `renderBanner` prepends a `role="status"` banner when the
client is paused — `.banner--paused`: `background: repeating-linear-gradient(45deg,
rgba(152,165,180,.10) 0 4px, transparent 4px 8px), var(--surface-2); border-color:
var(--border-hi); border-left-color: var(--ink-muted)`, glyph `❙❙` `--ink-secondary`, count
`polling paused` `--ink-primary`, lead `Nothing on this screen has been refreshed for 2 m 45 s.`
— **35.5 px** at 1920, 59 at 1280 (the sentence wraps). §6.2 places the paused announcement in the
header's status area and says nothing about a banner; `AlarmBanner` renders only alarm
conditions. The CSS above is the mapping if the owner wants it; the component gains a
`paused?: { gap: string } | null` prop only on that ruling. Deliberately NOT a replacement for the
alarm banner — the mock renders both, the alarm banner second.

---

## 6. What the mock gets wrong — take the form, never these

`ANCHOR.md` §9, added by the parent today: *"`MOCK.html` is a source for FORM only … Data,
strings and rules come from `SPEC.md`, and where the two disagree the spec wins."* Every item
below is a place the mock's *data* or *rule* disagrees with the built behaviour, which stands.

| # | the mock shows | the build keeps (authority) |
|---|---|---|
| 1 | GPU name `Tesla V100-PCIE-32GB` | **`Tesla PG500-216`** — the driver's string, raw, via `formatText`; no lookup, no marketing name (§6.2, §6.6) |
| 2 | bus `17:00.0` | **`00000000:17:00.0`** — full domain form, never trimmed (§6.2, §6.6) |
| 3 | disk `87.4 / 236.0 GB` | **GiB**, `formatGiB` — `41.7 GiB / 233.1 GiB` (O19, §6.6: powers of 1024, what `df -h` prints) |
| 4 | `hostMeta` `192.168.4.71 · kernel 7.0.0-30 · up …` | **hostname + uptime only** (§6.2: no IP, no kernel; `host.kernel` is rendered nowhere, deliberately) |
| 5 | `snapshot 14:47:31 EDT · 2 s ago` | `14:47:31 EDT · 2 s ago` — no "snapshot" word; `formatTimeOfDay` (`h23`, seconds), `formatZoneAbbreviation` once, `formatAge` + ` ago` composed in the shell (F9) |
| 6 | `▲ 1 warning · 0 alarms`, `✕ 6 alarms · 1 warning` | `aggregateStatus`: **`● all healthy` / `● 1 alarm` / `● 6 alarms` / `❙❙ paused · 6 alarms` / `⊘ stale · …` / `● no readings` (S-A)** — one reduction (§9), the count omitted when zero, and no watch count in the header at all |
| 7 | throttle line always shown: `0x4 sw power cap · normal, not a fault` | **rendered only when `decodeThrottleMask(...).notable`**; labels are `decode.reasons[i].label` (`0x<hex> <§3.7 name>`, unknown bits `0x<hex> unknown` at watch); no prose (§6.2, §6.3) |
| 8 | chip texts `nominal`, `watch 70–79 °C`, `alarm ≥ 80 °C` | chip = the severity **word** (`normal` / `watch` / `alarm`) from `panelChip`; thresholds are not printed in a chip (OQ-3 for the count forms) |
| 9 | chip `channel lost`, `N of 4 failing`, `2 of 2 up`, `1 of 2 down`, `10 s debounce` | OQ-3 / OQ-4 — not added |
| 10 | hero `—` with `fan 5 · no reading, not zero` in the unit slot; chan `—` + hatched `no reading` chip; `0 rpm · stalled` chip | **invariant 1 / §6.6:** `null` → `—` (the hero's hatched slot, the unit stays `RPM`); `0` → **`0 RPM`** (numeral, unit, upper-case RPM) in `--status-alarm-ink` with the alarm glyph from `severityFanStopped`. No prose in a value slot |
| 11 | mode as `chip "mode HIGH"` + caption `pwm5 = 255`; `⊘ unavailable` + `pwm5 ENOENT — channel not enumerated` | **`formatCh5Pwm`**: `HIGH pwm 255` / `EC auto` / `unavailable` as one string (§6.6); `EC auto` is healthy (invariant 3); `unavailable` is not a severity (O13) and gets the no-band hatch; the explanation, when one exists, is the `dell-smm` `errors[]` entry — and S11/G5 says the `unavailable` neighbour IS the explanation for a `fan5` em dash, so nothing is defaulted |
| 12 | chan notes `CPU heatsink · EC auto`, `GPU-area OEM · EC auto · not driven`, `tach stalled since 15:06:02` | not on §4's snapshot; a channel's only note is S-B's stale age or nothing (S-H: `dell-smm`'s message is stated once, under the figures) |
| 13 | service row `since 2026-09-04 12:46:13`; serving rows `since …`, `exit-code · status=1/FAILURE` | not on the snapshot; a row's notes are S-B's age and the S-G-attributed `errors[]` message only |
| 14 | SAFETY notes on every row (`hwmon4/pwm5 — 5-fan DKMS module loaded`, `updates/dkms/…`, `channel 5 claimed, INTERVAL=1`, the ufw sentence) | **§3.7: explanation text comes from the `errors[]` source match, never copy written in the UI** — a healthy row has no note; the DKMS entry names the running kernel (§6.2) |
| 15 | `coretemp pkg · Tjmax 100`; `MemTotal − MemAvailable`; `148.6 GB free`; `link up · 1000 Mb/s full`; `~/models 80.4 GB across 5 GGUF` | none is on the snapshot; the strip/meter/pill carry the §4 fields only (`load`, `formatPercent`, `formatText(link)` = `up`) |
| 16 | `model qwen3.6-27b` | label **`served by instance N`** (§6.2's ruling: the join `gpu.index === serving.instance` is a deployment fact, and "on this card" is not the claim the data supports) |
| 17 | banner `since 15:10:40` | **`for 2 d 06:00`** — elapsed (S-C); stale items `last read 6:12 ago` in `--status-watch` (S-B) |
| 18 | banner lead note `alarm band ≥ 80 °C (spec 83, slowdown 87)` | `BannerCondition` has label + value; nothing else is printed |
| 19 | paused: `.snap` hatch, mode sub-pill, paused banner | header pill carries mode + severity in one string (§6.2 literal); banner OQ-5 |
| 20 | no pre-first-poll frame | **S-A / S-D**: the connecting shell covers `state === null`; after it, a `null` field is `—` like any other reading, and the header reads `● no readings` |
| 21 | no absent-card state | **S-E**: a card absent from a `gpus[]` that was read renders `card not enumerated` (takeover, no served-model row); `gpus: null` renders `no GPUs enumerated` |
| 22 | chip = worst-of with no `null` handling | **S-F / `panelChip`**: never green over its own em dash — `normal` with any `null` leaf is no band; `watch`/`alarm` untouched |
| 23 | per-row notes attributed by position | **S-G**: `errors[].instance` is the only join for SERVING rows; entries without an instance go under the rows |
| 24 | six identical explanations would repeat per cell | **S-H**: one source, one message, once per panel (`PanelNotes`) |
| 25 | `engage 55` / `alarm 80` / `EC auto 2210` lines on the cooling chart; sparkline refs at 55/80 | `80` and `70` are §6.3 constants; `55` (`AUTO_BELOW`) and `2210` (a measured EC-auto RPM) are `CLAUDE.md` facts the dashboard never reads — OQ-6; the built cooling chart draws neither today |
| 26 | `.foot`: *"units are each source's own: … disk GB"* | the footer is mock chrome (as is the `.mockstrip`); not carried, and it is wrong about GB anyway |

Also unchanged and not up for negotiation: `worstSeverity`/`severity*` functions, every
`lib/format.ts` law (`en-US`, `h23`, thousands only where §6.6 says, ports bare), `state.gaps` as
the only source of a hatch, cells coloured from the current reading and never `displayed`, and
`--table-scroll-max` on the two table views.

---

## 7. The two shipped defects (10d §2), as edits

**F1 — the session event log grows the page through its clipped scroll box.** Every `Chip`
renders a `position:absolute` `.sr-only` span; with no positioned ancestor its containing block
is the initial containing block, so clipped `<li>`s' hidden spans stack below the fold (10d
measured `documentElement.scrollHeight` 4568 on a 1080 viewport with 200 entries; 1477 in the
shipped build under `--fixture mac`). **Edit: `panel-shell.module.css`, `.panel { position:
relative; }`** — already in §2.0's `.panel` rule. Nothing else. It covers the log, both table
views and any future bounded cell, because the panel becomes the containing block for every
`.sr-only` span inside it.

**F5 — SERVING's instance row overflows horizontally below ~450 px.** `status-row.module.css`
`.value { flex: 0 0 auto; text-align: right }` cannot shrink or wrap, so `:8080 · qwen3.6-27b ·
ctx 131,072 · health ok` overflowed a 372-px column by 79 px (143 at 308, 188 at 262). **Edit,
in both `row.module.css` and `status-row.module.css`:**

```css
.value { flex: 0 1 auto; min-width: 0; text-align: right; white-space: normal; overflow-wrap: anywhere; }
```

and in §2.7 the value is no longer one string: port is a second name span, model · ctx is the
`.note` (already `min-width:0; overflow-wrap:anywhere`), health is `.end` text. At 1280's 601-px
row it is one line; in a hypothetical 262-px cell it wraps instead of overflowing. Measured on
the mock's own `.row` (`flex-wrap: wrap`; `.row__note { min-width:0; white-space:normal;
overflow-wrap:anywhere }`): no horizontal overflow at any of the three widths.

---

## 8. Acceptance — numbers the real app must reproduce

Run, from `dashboard/` with the Node pin on `PATH`:

```bash
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs                      # measurements 0–9: all PASS
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs \
     --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json  # ~2 min; its own next dev on :39174
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json    # add --oq caption,notes,… for accepted OQs
pnpm verify                                                                        # exit 0, cold
for s in 02-format-severity 03-collectors-gpu-host 04-collector-cooling \
         05-collectors-serving-storage-safety 06-telemetry-route 07-auth-login \
         08-client-runtime 09-ui-primitives 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done                                 # all nine, serially, in ONE call — never polled (ANCHOR §9)
```

`check-density.mjs` encodes the table below and was run against today's tree: **31 FAIL** (every
panel, every viewport; chart boxes read 450 / 44 / 160), which is the discrimination the handoff
asks for. It passes when:

1. **Page ≤ viewport** at 1280 × 1024, 1600 × 1024, 1920 × 1080, healthy box-faithful telemetry
   (`documentElement.scrollHeight ≤ clientHeight`, measurement 9's method) — **and with ≥ 200 px
   spare** at each, since §2.11's degraded states must fit without re-planning.
2. **With §6.4's banner pinned** (the harness's two-alarm banner), page ≤ viewport at all three.
3. **Per-panel slot heights within ±10 %** of the spec-only targets — or of the same targets plus
   each OQ row the owner accepts, which the script adds with `--oq`:

| slot | 1280 | 1600 | 1920 | +OQ-1 caption | +OQ-2 note |
|---|---|---|---|---|---|
| `gpu0`, `gpu1` | 164.5 | 176.0 | 176.0 | +19.2 | — |
| `cpu` | 173.1 | 185.1 | 185.1 | +19.2 | — |
| `memory` | 138.5 | 138.5 | 138.5 | — | +37.6 |
| `safety` | 160.0 | 160.0 | 160.0 | — | — |
| `storage-and-network` | 144.8 | 144.8 | 144.8 | — | +37.6 |
| `serving` | 104.4 | 104.4 | 104.4 | — | +37.6 |
| `session-event-log` | 133.8 | 133.8 | 133.8 | — | — |
| `cooling` (stretched) | = max(366.3 [+37.6], `cpu` + 9 + `safety`) | | | | |

4. **Painted chart boxes** (from `--anatomy`): COOLING `<svg>` 174 px; the visible GPU and CPU
   chart 38 px below 1600 and 50 px at ≥1600 (the hidden wrapper reports 0).
5. **Measurements 0–9 of `measure-breakpoints.mjs` pass** — 0 (nine slots), 1 (COOLING spans),
   2–5 (columns), 6 (priority order), 7/8 (the promotion, by `data-role`), 9 (no scroll, now
   genuinely).
6. `pnpm verify` exits 0 (cold), and every `regressions.py` harness is green, run serially.
   New ⚠ tests carry mutations in `10-panels-assembly/regressions.py` under `10e-` ids; leaf
   primitive changes in step 9's files (`chip`, `meter`, `row`, `sparkline`, `panel-shell`) are
   backed in `09-ui-primitives/regressions.py` with `10e-` ids (ANCHOR §9: the prefix names the
   creating step).
7. `lib/dangling-css-class.test.ts`, `components/styles.test.ts` and `components/purity.test.ts`
   pass unchanged — every `styles.X` declared, every `flex-basis:100%` inside a `flex-wrap:wrap`
   container (the `.row` note keeps both), no hook under `components/`.
8. `next-env.d.ts` byte-identical after the runs; no `next dev` left on :39173/:39174.

Tolerance note: ±10 % of `serving` (104.4) is ±10 px and of `session-event-log` ±13; the
chip-in-row line-height difference (§2.7) is 1.8 px. `cooling`'s line in the checker is
structural on a stretched cell and cannot fail alone; its box is caught by item 4 and the page
by item 1.

---

## 9. Owner questions — nothing below is assumed; the builder omits it until ruled

> **RULED by the owner, 2026-09-09 (recorded in `SPEC.md` §6.1 and §6.2 by the parent):**
> banner — **the promise is unconditional**; the page must fit with the banner pinned at all three
> viewports (§8 item 2 stands). **OQ-1 declined. OQ-2 declined, all four. OQ-3 severity word only.
> OQ-4 no chip on the log** (neither `—` nor a debounce constant). **OQ-5 declined. OQ-6 leave out**
> (only §6.3's 70/80, on the GPU sparkline's ≥1600 form). **OQ-7 KEEP BOTH CPU traces** — the CPU
> target becomes spec-only + one sparkline + gap: **216.1 / 240.1 / 240.1**; rows 2–3 become
> max(366.3, CPU + 9 + 160) = 385.1 / 409.1 / 409.1, page ≈ 775 / 811 / 811, spare ≈ 249 / 213 / 269,
> with a six-alarm banner ≈ 848 / 884 / 884 — still fits. `check-density.mjs`'s `cpu` row now
> carries the second sparkline by default. **OQ-8 recorded** for the loop that owns §6.4's SAFETY.

- **OQ-1 — the trace readout caption.** The mock prints `30 min · min 43 · max 67 · now 66 °C`
  under every sparkline (and writes the hover value into it). Min/max over the window are
  readings §6.2 does not list. Cost 19.2 px on each GPU card and CPU; with it the GPU card is the
  mock's 208 / 220 and CPU its 204. Note the built hover tooltip already reports any instant's
  value; this caption is the at-a-glance form. **Accept / decline?**
- **OQ-2 — per-panel note footers.** COOLING (`EC auto = pwm returns ENODATA — a normal mode,
  not a fault. fan 2 is reported, never driven. engage ≥ 55 °C · release ≤ 51 °C · dwell 30 s ·
  nominal max 5100 RPM.`), MEMORY (`any swap in use is notable here — 2 × 12 GiB of host prompt
  cache is configured (--cache-ram 12288).`), STORAGE (`~/models … — hf-get.sh writes by source
  filename with no space check.`), SERVING (`instances are discovered from /etc/llama-server/*.env
  … token rates and KV depth are deliberately out of scope (decision 13) …`). 32.6 px each (37.6
  with the gap), 9.5 px `--ink-faint`. They are static operator notes — `CLAUDE.md` facts, not
  telemetry — and §3.7's "never copy written in the UI" was written about *explanations of
  failures*, not about a footer. If accepted, the text needs an owner-approved source (a
  constant per panel, or `STANDING`-style config) and the `~/models` figures cannot stay (they
  are measurements). **Accept none / some / all, and the text?**
- **OQ-3 — count chips.** SAFETY `1 of 4 failing`, SERVING `2 of 2 up` / `1 of 2 down`, COOLING
  `channel lost`. §6.2 says the chip is the panel's severity; the count is a second reading in
  the same pill. 0 px. **Severity word only (the default), or the mock's count forms?**
- **OQ-4 — the log's head chip.** `chip={null}` renders the hatched `—` pill; on the LOG that
  reads as a failed reading. The mock shows a neutral `10 s debounce` (§6.4's debounce
  constant). **`—`, no chip, or the mock's text?**
- **OQ-5 — a paused banner** (`polling paused · Nothing on this screen has been refreshed for
  2 m 45 s.`, `role=status`, 35.5 px at 1920 / 59 at 1280). §6.2 puts the paused announcement in
  the header pill and the age indicator; the mock adds the banner on the ground that *"a frozen
  display that looks live is the failure the age indicator exists to prevent."* **Add it?** (The
  mapping is in §5; the component gains a prop only on yes.)
- **OQ-6 — reference lines from outside the snapshot.** The mock draws `engage 55` (the fan
  script's `AUTO_BELOW`) and `EC auto 2210` (a measured RPM) on the cooling chart and `55`/`80`
  on the GPU sparklines. `80` and `70` are §6.3's; `55` and `2210` are `CLAUDE.md` constants the
  dashboard does not read. The spec draws §6.3's two on the GPU sparkline at ≥1600 and nothing on
  the cooling chart. **Draw 55 / 2210 as fixed constants, read them from config, or leave them
  out?**
- **OQ-7 — the CPU temperature trace.** Removed here because §6.2's wording attaches the trace
  to utilisation and the mock draws one spark. If the owner wants a temperature trace too, it is
  +38/+50 px + gap on CPU (a second `Sparkline`, as built today) — CPU 216 / 240. **Confirm the
  removal?**
- **OQ-8 — the `standing` pill.** §6.4's "real severity named in the row" has the mock's form
  here (a neutral `standing` pill before the value pill). Whether the built SAFETY renders
  standing at all is not this loop's, and there is no live subject. **Record for the loop that
  owns §6.4's SAFETY rendering.**

---

## 10. Method and files

- `mocks/measure-mock-anatomy.mjs` (new) — `MOCK.html` from `file://` at the three viewports in
  states `a`, `ap`, `b`: per panel every direct child (class, height, width, computed font-size,
  text) and one level down for `.gpuTop`, `.rows`, `.chan`, `.meterRow`, `.legend`, `.caption`,
  `.strip`, `.panel__hd`; every chart `<svg>` box; the topbar's children; each banner's head/
  rest/items; and the computed style block §1 quotes. `--json` writes it all. Headline totals
  match `measure-mock.mjs` and the parent's table to the pixel (1920: 219.7 / 472.4 / 204.3 /
  195.2 / 259.1 / 182.4 / 140.2 / 133.8; `mockstrip` 31).
- `mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json`
  (10d's, unchanged) — the real app: band 48.8, grid 1330.8 / 1392.8 / 1392.8, overflow 356 /
  418 / 362 (414 / 476 / 420 with the banner), per-child anatomy quoted in §0.
- `mocks/check-density.mjs` (new) — §8's grader; `--oq` adds accepted rows.
- Raw JSON for both runs is in the session scratchpad, not the repo; both are reproducible in
  under three minutes.
- Browsers: only the headless instances these scripts launched were closed; the user's Chrome
  was not touched. No dev server left running; `next-env.d.ts` unchanged; `.env` not written.

Tree state: `7de7dd3` plus 10d's untracked files, `pipeline/ANCHOR.md` carrying the parent's
09:31 edit (the "form only" rule this document follows), this file and the two scripts.
`components/`, `app/`, `lib/` and `SPEC.md` untouched.
