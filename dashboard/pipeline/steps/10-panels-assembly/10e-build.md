# 10e BUILD — the deliverable, browser measurements included

**Two sessions wrote this file.** Everything from here to *"Spec silences recorded"* is the FIRST
build agent's, written while it still had the browser pass ahead of it. Everything under
*"The browser pass — measured 2026-09-09 by the second build agent"* is the SECOND's: the
measurements, the fixes they forced, the nine harness results and two further spec silences. The
first agent's own closing prediction — that harnesses 03–08 "are not expected to find anything" —
is **contradicted below**: harness 04 found a ⚠ mark this loop added and did not back.

## What is DONE, verified, and green right now

- **`pnpm verify` (cold): exit 0, 102 test files, 2886 tests.**
- **`pipeline/steps/09-ui-primitives/regressions.py`: green** — 120/120 mutations bite, every ⚠
  test covered.
- **`pipeline/steps/10-panels-assembly/regressions.py`: green** — 181/181 mutations bite ("All 181
  regressions failed their check, as they must"), every ⚠ test covered, no ANCHOR NOT FOUND / no
  ANCHOR AMBIGUOUS / no DID NOT BITE.
- **`pipeline/steps/02-format-severity/regressions.py`: green except three PRE-EXISTING, confirmed
  unrelated failures** (`02-R20`/`02-R30`/`02-R31`, orphaned when `formatUptime` gained a `prefix`
  parameter before this loop — the parent confirmed this via HANDOVER §1 and instructed not to
  touch them). Every 10e-added mutation in this harness (`10e-F1`/`F2`/`F3`, `10e-S1`/`S2`) bites
  correctly and every 10e ⚠ test is covered.
- `git status`: no stray mutated files (each harness run left the tree clean; confirmed by
  `pnpm verify` passing immediately after).
- No `next dev` left running; no `.env` written; no browser opened yet in this session.

## Files changed, per 10e's list

### Tokens and shared primitives (`components/`)

| file | change |
|---|---|
| `tokens.css` | 12px `body` base (was the browser default via `em`/`rem` scaling), `:focus-visible`, reduced-motion; full §1.2 token set added (`--surface-2`, `--surface-sunken`, `--ink-faint`, `--ink-max`, `--border-lo/hi`, `--status-good-ink`, `--status-alarm-ink`, `--meter`, `--nodata`, `--font-sans`, `--radius`); existing tokens re-valued to the mock's hex, none renamed |
| `chip.tsx` / `.module.css` | new `code?: boolean` prop → `data-code`; `size="md"` is now the mock's full pill (border+background+text carry the band); `size="sm"` stays the bare glyph (colour on the glyph only) |
| `meter.tsx` / `.module.css` | new `tickPercent?: number` (a `.tick` mark, absolute-positioned via inline `left`); fill is now neutral `--meter` for `normal`/no-band, only `watch`/`alarm` recolour (§6.3: "colour is spent almost entirely on state") |
| `row.tsx` / `.module.css` | F5: `.value`/`.end` wrap (`flex: 0 1 auto; min-width: 0`); when `severity` is given the value renders as a `Chip md` pill inside `.end` (the mock's `chip(sev, state)`), else plain text; `data-severity` now also lives on the row `<div>` itself (the severity-stripe left-rule) |
| `panels/status-row.tsx` / `.module.css` | same pill logic as `Row`, plus three new optional SERVING-only slots: `secondaryLabel` (port, non-full-width), `inline` (model·ctx, wraps but never forced full-width, distinct from `note`/`detail`), `endPrefix` (health text ahead of the pill inside `.end`) |
| `panel-shell.tsx` / `.module.css` | F1: `.panel { position: relative }` (closes the `.sr-only` clipping leak that grew the page — session log, both table views); new `headControl?: ReactNode` prop, 0px of body height; `chip` is now **optional** — **omitted** renders no `<Chip>` at all (OQ-4, session log only), `chip={null}` is unchanged (today's hatched no-band pill). Head restyled to the mock's flex row (uppercase sans title, ellipsis subtitle, spacer, then `headControl`, then the chip). Severity stripe now painted on `.panel[data-severity]` |
| `hero.tsx` / `.module.css` **(new)** | `Hero` (dominant figure — value/unit as two spans, O14; `EM_DASH` value gets its own hatched `.hero--unk` form) + `Figure` (the GPU hero row's power block) |
| `strip.tsx` / `.module.css` **(new)** | the mock's `<dl>` key/value strip; wraps rather than truncates |
| `sparkline.tsx` / `.module.css` | three new optional props, each independently gated and each a no-op when omitted (verified byte-identical to pre-10e output when none of the three is given): `domain` (fixed y-scale + a magnitude clamp, §6.3's Y-axis rule, never Q2-F9's rejected X-drop), `refs` (dashed threshold lines, reserves 26px on the right), `timeLabels` (window-start/end axis text, reserves 4px top / 10px bottom). Also: a filled area per run (opacity .1, breaks at the same points the line does) and the end dot grew from r=2.5/stroke-width 1 to r=4.5/stroke-width 2 (mock's form) |
| `grid.tsx` | `CHART_SIZE` fully replaced: `gpuSparkline` 440×38, `gpuPromoted` 600×50, `cpuSparkline` 280×38, `cpuPromoted` 360×50, `cooling` 480×**72** (plotHeight; two plots + gap + axis = 174px painted, matching §2.2's target) |
| `grid.module.css` | `gap: 9px` (was 12), `padding: 9px 12px 12px`, `align-items: start` (a short panel no longer stretches to fill its row), `minmax(0, 1fr)` tracks at all three breakpoints, `.cooling { align-self: stretch }` so it alone still fills its spanned rows. The three `grid-template-areas` blocks are untouched |
| `header.tsx` / `.module.css` | glyph-only buttons (`⟳`, `❙❙`/`▶`, `⏻`) with `aria-label`+`title` carrying the word that used to be visible text; cadence control's visible key renamed `refresh`→`cadence` (the mock's word, §6.2's own name for it); DOM reordered to `identity, spacer, status, time, controls` (`.time` is now a header-level sibling of the status pill, not nested inside it) |
| `alarm-banner.tsx` / `.module.css` | restyled per §5 (gradient background, `.item` real rule again — the dangling class 10c1-A8 found is now legitimately styled, not just referenced) |

### Panel-local leaves (`components/panels/`)

| file | change |
|---|---|
| `caption.tsx` + `panel-text.module.css` **(new)** | shared `.caption` leaf (optional bold `label` + children) — backs GPU's throttle line and STORAGE's link line |
| `chart-view-toggle.tsx` / `.module.css` | restyled as a `Chip md`-shaped pill (still a real `<button>`, not the `Chip` component, so it stays focusable); visible label shortened `table view`/`chart view` → `table`/`chart`; `aria-label` sentence unchanged |

### The nine panel bodies

| panel | change |
|---|---|
| GPU (`gpu-panel.tsx`/css, ×2 mounts) | `Hero`(temp, `domain={30,90}`)+two-wrapper `Sparkline` promotion (replacing `StackedTimeSeriesChart` — the ≥1600px form is now the SAME `Sparkline` primitive with `refs`=§6.3's 70/80 and `timeLabels`, per 10e §3.2's "a size, not a component change")+`Figure`(power, 0px extra — same reading the meter draws against the cap)+`Meter`(power)+`Meter`(VRAM, tick 90, label shows the §6.3 percentage via `usedPercent`)+`Strip`(util/SM clk/served-by)+`Caption`(throttle, `Chip code` per reason)+`PanelNotes`. Join, absent-card branch, `gpus:null` takeover, `panelChip`, `decodeThrottleMask(...).notable` all UNCHANGED |
| CPU (`cpu-panel.tsx`/css) | OQ-7 (owner's ruling — KEEP BOTH traces): `Hero`(temp, unit `"°C pkg"`)+ONE wrapper-pair holding BOTH sparklines (temp+util) per size (4 `Sparkline` mounts total: 2 traces × 2 sizes)+`Meter`(utilisation)+`Strip`(load)+ONE `PanelNotes` call (all four CPU sources together — Hero/Meter/Strip have no per-row note slot any more, S-H: "the panel satisfies 'beside it'") |
| COOLING (`cooling-panel.tsx`/css) | `Hero`(fan5)+mode `Chip md` (severity **always** `null`, O13/invariant 3)+unchanged `StackedTimeSeriesChart` (temp+fan5, plotHeight now 72)+new local `ChanTable` (fan2/1/3/4, invariant-1's `--unk`/`--zero` inks)+`StatusRow`(fan service)+`PanelNotes`(dell-smm). **Spec silence recorded** (below): `Hero` cannot consume `staleValueOr`'s pre-formatted combined string without splitting it (O14) |
| MEMORY (`memory-panel.tsx`) | `Hero`(RAM used, unit `"GiB used"`, composed from `formatGiBParts`+the literal word, not a split)+`Meter`(RAM, tick 85)+`Meter`(swap)+`PanelNotes`. `panelChip`/severities unchanged |
| SAFETY (`safety-panel.tsx`/css) | Unchanged panel logic — the pill-valued `StatusRow` and the 0px-cost restyle came for free from the primitive change. Only edits: wrapped the four rows in a `.rows` list (`gap: 1px`, matching §2.0's row-list spacing exactly, distinct from the panel body's own 5px gap) and restyled `unknownStanding` to px |
| STORAGE & NETWORK (`storage-network-panel.tsx`) | `Meter`(`/`, tick 85)+`Meter`(`/home`, tick 85)+ONE `PanelNotes` call (statvfs AND proc-net-dev together, since `Strip` has no note slot for rx/tx any more)+`Strip`(rx/tx)+`Caption`(link, `Chip md` pill for the state) with two degraded-only sibling lines (stale age, watch-toned inline; net-operstate detail) |
| SERVING (`serving-panel.tsx`/css) | Per-instance `StatusRow` now uses the three new slots: `secondaryLabel` (port), `inline` (model·ctx), `endPrefix` (health) — replacing the single hand-joined string F5 found overflowing narrow columns. Wrapped rows in a `.rows` list. Join/attribution logic (10b-S-G) unchanged |
| SESSION EVENT LOG (`session-event-log-panel.tsx`/css) | OQ-4: `chip` prop **omitted** on `PanelShell` (not `chip={null}`) — no chip element in the head at all. `.scroll` is now a genuinely bounded well: fixed `height: 84px` (not `max-height`), `overflow-x: auto` too, bordered, `--surface-sunken` ground. Row column order changed to the mock's `time · source · chip · sentence` (was `time · chip · sentence · source`) |

## Tests: every one of the above has a matching test-file pass, and `pnpm verify` proves it

Every panel's test file was read against the new markup and adapted where the DOM shape changed
(the two recurring adaptations): (1) `Hero`/`Figure` render `{ value, unit }` as two sibling
`<span>`s, so a `toContain('66 °C')`-style assertion becomes two assertions or a scoped
extraction; (2) a `severity`-bearing `Row`/`StatusRow`'s value moved from a `.value` span into a
`Chip md` pill's `.label` span, so `test-support.ts`'s `valueCells` helper was WIDENED (Chip-pill
labels + `Strip`'s `.v` span, in addition to the original `.value` match) rather than each panel
re-deriving its own scope. New leaf tests: `hero.test.tsx`, `strip.test.tsx`,
`components/panels/caption.test.tsx`.

Three DID-NOT-BITE / test-name-vs-body gaps were found and fixed while wiring the harness (the
project's own recurring lesson — a second independent source of the same fact makes an earlier
guard's mutation inert):

1. `row.test.tsx` / `status-row.test.tsx`'s "`severity={null}` still renders a chip" tests used a
   loose `toContain('data-severity="none"')`, satisfied by the row's OWN new `data-severity`
   attribute (added for the severity stripe) regardless of whether the left-edge glyph chip
   itself rendered. Fixed to an exact occurrence count (3: row + sm chip + md chip).
2. `safety-panel.test.tsx`'s "booleans render yes/no" test scoped to
   `class="…value…">(?:true|false)<` — a class name that no longer exists once the value became
   a `Chip md` pill (`.label`). Fixed to scope on the row instead.
3. `serving-panel.test.tsx`'s "no value cell prints a numeral" sweep used `valueCells`, which
   cannot see the three NEW `StatusRow` slots (`secondaryLabel`/`inline`/`endPrefix` are not
   `.value`-classed). Added a direct check alongside the sweep.

## `10e-` mutations added, by harness

- **`02-format-severity/regressions.py`**: `10e-F1`/`F2`/`F3` (the `parts` helper's null-gate,
  zero-as-unreadable, and GiB precision), `10e-S1`/`S2` (the exported GPU-temp constants and the
  function that reads them). Re-aimed `02-R5` (source moved to the named constant).
- **`09-ui-primitives/regressions.py`**: `10e-C1` (chip `code` modifier), `10e-ME1` (meter tick),
  `10e-R1`/`R2` (row pill, both directions), `10e-H1`..`H4` (hero: unavailable-form drop, unit
  suppression, severity default, zero-as-unavailable), `10e-ST1`/`ST2` (strip: em-dash
  suppression, semantic wrapper), `10e-SP6`..`SP11` (sparkline: Y-clamp drop, domain-ignored,
  ref-label drop, `hasRefs` empty-array bug, time-label swap, area-per-run-only). Re-aimed
  `09-C2`, `09-PU1`, `09-PU2`, `09-SP5`, `09-CS1` (widened — the file-wide, not rule-scoped,
  `styles.test.ts` guard needed BOTH `.row`'s and `.end`'s `flex-wrap: wrap` removed, not just
  one, once `.end` also carries the property), `Q2-SP1`.
- **`10-panels-assembly/regressions.py`**: `10e-SR1`/`SR2`/`SR3` (status-row's three new slots),
  `10e-H1` (header refresh button's accessible name), `10e-CO1` (cooling's dell-smm PanelNotes),
  `10e-SP1` (safety's yes/no), `10e-CVT1` (toggle's aria-label), `10e-SV1` (serving's ctx
  fallback), `10e-CAP1` (caption's label). Re-aimed 29 pre-existing mutations across
  `10a-H3/H4/H5/H6/H9`, `10b-GP2/GP3`, `10c-GP2/GP3`, `10b-CP3/CP4/CP6`, `10c-CP2/CP3`,
  `10b-MP1/MP2/MP6`, `10b-SN2/SN4/SN6`, `10b-CO1/CO3/CO4/CO6/CO7`, `10c-CO2`, `10b-SV1`,
  `10b-SP2/SP4`, `10b-SE2`, `10c-CVT2/CVT3`, `10c-G2/G4/G5`, `10c-P1/P2/P3`, `10b-SR2` — all
  against the exact new source text (verified by grep before writing each new anchor, per the
  09-harness lesson). **Retired two** (`10a-H13`, `10b-CP5`, `10b-CO5`) whose entire premise was
  structurally superseded by 10e's own redesign (each documented in place with why no plausible
  wrong implementation remains at that source line) — see ANCHOR §9/HANDOVER §5.2 rule 1. Also
  widened the harness's own hardcoded mutation-id prefix whitelist (`10a-`/`10b-`/`10c-` →
  `+ 10e-`), which the harness's own comment anticipated ("widen this set as each further loop
  lands its own mutations").
- Both harnesses independently confirmed GREEN after every re-aim (see above).

## Spec silences recorded (invariant 7 — STOP and record, do not choose)

1. **`formatXParts(null)` does not satisfy the builder spec's literal concatenation identity for
   every fixture.** The spec text says a table test should prove
   `` `${parts.value} ${parts.unit}` === formatX(v) `` "for every fixture … including 0 and null".
   It holds for every READABLE fixture. For `null`, the parts formatter keeps the REAL unit
   (`Hero`'s own requirement: "the unit stays the unit, never prose") while the string formatter
   (`render`'s `EM_DASH` branch) drops the unit entirely. Resolved by asserting the identity only
   over readable fixtures and asserting the `null` shape explicitly and separately
   (`{ value: EM_DASH, unit: <real unit> }`). Recorded in `lib/format.ts`'s doc comment and in
   `format.test.ts`'s own describe blocks.
2. **`Hero` + `staleValueOr` (COOLING's fan5) have no clean composition.**
   `condition-lookup.ts`'s `staleValueOr` returns ONE already-formatted string
   (`DisplayedCondition.value`, e.g. `'4,308 RPM'`); `Hero` wants `{ value, unit }` separately,
   and O14 forbids splitting a formatted string back apart. Resolved by re-deriving the SAME
   stale/current decision at the parts level (comparing the current reading's OWN parts against
   `EM_DASH` — `staleValueOr`'s own condition, not a re-implementation of its logic against a
   different input) rather than parsing the combined string: when stale-and-currently-unreadable,
   the whole condition string becomes `Hero`'s `value` with an EMPTY `unit`. Cosmetic only (the
   stale numeral and its unit share one type size instead of two during that one degraded state)
   and structurally 0 occurrences under healthy telemetry, so it does not touch
   `check-density.mjs`'s graded numbers. Recorded in `cooling-panel.tsx`'s own doc comment.
3. **`02-R20`/`02-R30`/`02-R31`** (step-2 harness, the uptime formatter) are confirmed
   PRE-EXISTING, predating this loop — per the parent's own confirmation, citing HANDOVER §1.
   Left untouched; not this loop's to fix, and not counted against 10e's own green/red totals.
4. **STORAGE's stale-age tone has no shared component to express it.** §6.5/S-B require a stale
   condition's age to read `--status-watch` (matching `status-row.tsx`'s `.noteWatch` and
   `alarm-banner.module.css`'s `.stale`), but `Caption` (the new shared leaf) has no tone
   variant — every OTHER caller of `Caption` uses its default muted ink. Rather than add a
   `tone` prop to the shared leaf for one caller, `storage-network-panel.tsx` wraps the age text
   in an inline `style={{ color: 'var(--status-watch)' }}` `<span>` inside a plain `<Caption>`.
   This is degraded-only (0px healthy) and functionally correct, but it is a one-off rather than
   a reusable pattern; recorded rather than silently generalising `Caption` beyond what this
   loop's callers actually need.

## The browser pass — measured 2026-09-09 by the second build agent

Everything below was run by this session on the tree the first builder left, plus the three
edits §"What changed to converge" records. Node v24.16.0, system Google Chrome over CDP,
`playwright-core`. No `next dev` left on :39173/:39174, no `.env` written, `next-env.d.ts`
byte-identical (`git diff next-env.d.ts` empty).

### 1. `check-density.mjs` — ALL PASS at all three viewports, no `--oq`

`node .../mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture
--json <out>` then `node .../mocks/check-density.mjs <out>` — **no `--oq` flag**, every owner
question declined, CPU's second trace already in the target (OQ-7).

```
=== 1280x1024  (OQ accepted: none)
PASS  gpu0                 measured  164.5  target  164.5  0.0 %
PASS  gpu1                 measured  164.5  target  164.5  0.0 %
PASS  cpu                  measured  216.1  target  216.1  0.0 %
PASS  memory               measured  137.8  target  138.5  -0.5 %
PASS  safety               measured  159.4  target  160.0  -0.4 %
PASS  storage-and-network  measured  144.1  target  144.8  -0.5 %
PASS  serving              measured  103.8  target  104.4  -0.6 %
PASS  session-event-log    measured  129.8  target  133.8  -3.0 %
PASS  cooling              measured  384.5  target  384.5  0.0 %  (rows 2-3: max(intrinsic 366.3, cpu+gap+safety))
PASS  cooling chart paints 174 px → svg heights seen [174]
PASS  gpu0 visible chart paints 38 px → svg heights seen [38,0] (a hidden wrapper reports 0)
PASS  cpu visible chart paints 38 px → svg heights seen [38,38,0,0]
PASS  page: scrollHeight 1024 vs viewport 1024 → overflow 0 (band 43, grid 717.8; expected page ≈ 771)
PASS  page: spare ≥ 200 px for degraded states → 263.2 px (content bottom 760.8, viewport 1024)
PASS  page with §6.4 banner pinned: overflow 0 (band 108.7)

=== 1600x1024  (OQ accepted: none)
PASS  gpu0                 measured    176  target  176.0  0.0 %
PASS  gpu1                 measured    176  target  176.0  0.0 %
PASS  cpu                  measured  240.1  target  240.1  0.0 %
PASS  memory               measured  137.8  target  138.5  -0.5 %
PASS  safety               measured  159.4  target  160.0  -0.4 %
PASS  storage-and-network  measured  144.1  target  144.8  -0.5 %
PASS  serving              measured  103.8  target  104.4  -0.6 %
PASS  session-event-log    measured  129.8  target  133.8  -3.0 %
PASS  cooling              measured  408.5  target  408.5  0.0 %  (rows 2-3: max(intrinsic 366.3, cpu+gap+safety))
PASS  cooling chart paints 174 px → svg heights seen [174]
PASS  gpu0 visible chart paints 50 px → svg heights seen [0,50] (a hidden wrapper reports 0)
PASS  cpu visible chart paints 50 px → svg heights seen [0,0,50,50]
PASS  page: scrollHeight 1024 vs viewport 1024 → overflow 0 (band 43, grid 753.4; expected page ≈ 806)
PASS  page: spare ≥ 200 px for degraded states → 227.6 px (content bottom 796.4, viewport 1024)
PASS  page with §6.4 banner pinned: overflow 0 (band 108.7)

=== 1920x1080  (OQ accepted: none)
PASS  gpu0                 measured    176  target  176.0  0.0 %
PASS  gpu1                 measured    176  target  176.0  0.0 %
PASS  cpu                  measured  240.1  target  240.1  0.0 %
PASS  memory               measured  137.8  target  138.5  -0.5 %
PASS  safety               measured  159.4  target  160.0  -0.4 %
PASS  storage-and-network  measured  144.1  target  144.8  -0.5 %
PASS  serving              measured  103.8  target  104.4  -0.6 %
PASS  session-event-log    measured  129.8  target  133.8  -3.0 %
PASS  cooling              measured  408.5  target  408.5  0.0 %  (rows 2-3: max(intrinsic 366.3, cpu+gap+safety))
PASS  cooling chart paints 174 px → svg heights seen [174]
PASS  gpu0 visible chart paints 50 px → svg heights seen [0,50] (a hidden wrapper reports 0)
PASS  cpu visible chart paints 50 px → svg heights seen [0,0,50,50]
PASS  page: scrollHeight 1080 vs viewport 1080 → overflow 0 (band 43, grid 753.4; expected page ≈ 806)
PASS  page: spare ≥ 200 px for degraded states → 283.6 px (content bottom 796.4, viewport 1080)
PASS  page with §6.4 banner pinned: overflow 0 (band 108.7)

ALL PASS
```

**Per-slot, measured vs target, in one table** (identical at 1600 and 1920 except GPU/CPU,
whose charts are promoted):

| slot | 1280 target | 1280 measured | 1600/1920 target | 1600/1920 measured |
|---|---|---|---|---|
| `gpu0` / `gpu1` | 164.5 | **164.5** (0.0 %) | 176.0 | **176.0** (0.0 %) |
| `cpu` (OQ-7, both traces) | 216.1 | **216.1** (0.0 %) | 240.1 | **240.1** (0.0 %) |
| `memory` | 138.5 | 137.8 (−0.5 %) | 138.5 | 137.8 (−0.5 %) |
| `safety` | 160.0 | 159.4 (−0.4 %) | 160.0 | 159.4 (−0.4 %) |
| `storage-and-network` | 144.8 | 144.1 (−0.5 %) | 144.8 | 144.1 (−0.5 %) |
| `serving` | 104.4 | 103.8 (−0.6 %) | 104.4 | 103.8 (−0.6 %) |
| `session-event-log` | 133.8 | 129.8 (−3.0 %) | 133.8 | 129.8 (−3.0 %) |
| `cooling` (stretched, rows 2–3) | 384.5 | 384.5 (0.0 %) | 408.5 | 408.5 (0.0 %) |

Page, healthy, no banner: **content bottom 760.8 / 796.4 / 796.4** against 1024 / 1024 / 1080,
so **spare 263.2 / 227.6 / 283.6 px** — every one over the ≥200 px bar, and each better than
§9's OQ-7 arithmetic predicted (249 / 213 / 269). With §6.4's two-alarm banner pinned (band
43 → 108.7) the page still fits at all three: overflow 0.

Painted chart boxes, from `--anatomy`: COOLING `[174]` everywhere; `gpu0` `[38,0]` below 1600
and `[0,50]` at ≥1600; `cpu` `[38,38,0,0]` below 1600 and `[0,0,50,50]` at ≥1600 (two traces
per size, OQ-7).

`session-event-log`'s −3.0 % is not a miss: the 133.8 target was built from a 25.8 px head that
includes a `Chip md`, and **OQ-4 removes the log's chip entirely**, so its head measures 22.
133.8 − 3.8 = 130.0, against 129.8 measured.

### 2. `measure-breakpoints.mjs` — 10 of 12 PASS. ⚠ Measurement 9 fails at 1280 and 1600, and the cause is the FIXTURE, not the density

```
Starting next dev on :39173 with an ephemeral credential pair (not written to disk)...

=== 10a-F4 / §6.1 breakpoint measurements ===

PASS     0. every §6.1 slot is present in the DOM (the anti-vacuity net for 1, 5 and 6)
PASS     7. >=1600px: GPU 0 shows the promoted chart, not the sparkline
PASS     8. 1280-1599px (the design target): GPU 0 shows the sparkline, not the promoted chart
PASS     3. 1280px: 4-column layout (the design target)
PASS     1. >=1280px: COOLING spans rows 2-3 in columns 1-2
PASS     2. 1279px side of the 900/1280 breakpoint: 2-column layout
PASS     5. 900px side: 2-column layout, COOLING full width
PASS     4. 899px side of the 900px breakpoint: 1-column layout
PASS     6. <900px: panel priority order (GPUs -> COOLING -> SAFETY -> SERVING -> CPU/MEMORY -> STORAGE & NETWORK -> SESSION EVENT LOG)
PASS     9. 1920x1080: §6.1's no-scroll promise — the grid does not grow past the viewport
FAIL     9. 1280x1024: §6.1's no-scroll promise — the grid does not grow past the viewport
         {"scrollHeight":1051,"clientHeight":1024,"grid":{"y":43,"height":1008},"bodyChildren":[{"tag":"div","y":0,"height":43},{"tag":"div","y":43,"height":1008}],"slotHeights":{"gpu0":187,"gpu1":187,"cooling":652,"cpu":342,"memory":172,"safety":302,"storage-and-network":289,"serving":94,"session-event-log":130},"overflowPx":27}
FAIL     9. 1600x1024: §6.1's no-scroll promise — the grid does not grow past the viewport
         {"scrollHeight":1073,"clientHeight":1024,"grid":{"y":43,"height":1030},"bodyChildren":[{"tag":"div","y":0,"height":43},{"tag":"div","y":43,"height":1030}],"slotHeights":{"gpu0":198,"gpu1":198,"cooling":663,"cpu":366,"memory":172,"safety":288,"storage-and-network":275,"serving":94,"session-event-log":130},"overflowPx":49}

10 passed, 2 failed, 0 blocked by this environment, 12 total.

Restored next-env.d.ts (rewritten by `next dev`).
```

Measurements 0–8 all pass, and measurement 9 passes at 1920×1080. It fails at 1280×1024
(overflow **27 px**) and 1600×1024 (overflow **49 px**) — down from 10c-3's 596 / 632 and 10d's
356 / 418, but not zero. **Recorded and reported rather than chosen** (handoff §3): closing it
needs a ruling, and every route to it is outside 10e §6.

**Why it is not the density.** `measure-breakpoints.mjs` fabricates only the `gpus` array
(`installGpuFabrication`, its own doc explains why) and leaves the rest of `/api/telemetry`
as this **development Mac** returns it — where *every* Linux-only collector fails. So
measurement 9 grades a page in which all seven non-GPU sources have filed an `errors[]`
message, each a long absolute path. `SPEC.md` §6.1's acceptance sentence names
*"fabricated healthy telemetry"*; `--fixture box` is that state, and §1 above measures the
same build fitting it at all three viewports with 227–284 px to spare.

**Quantified, from the `--fixture mac --anatomy` run of the same tool** (1280×1024):

| | healthy (`--fixture box`) | dev Mac, every collector failing |
|---|---|---|
| page content bottom | 760.8 | 1051 |
| `cpu` | 216.1 | 342 (`errors[]` block alone **123 px** — four sources) |
| `safety` | 159.4 | 302 (four rows, each with a two-line explanation: **252 px** of rows) |
| `storage-and-network` | 144.1 | 289 (92 px of `statvfs` notes + a 43 px `net-operstate` caption) |
| `memory` | 137.8 | 172 |

**§2.11's degraded budget is one 14.2 px line per message, and these messages wrap to two and
three.** Re-costing the same failure set at the budgeted one line each — CPU notes 123 → 62.8,
SAFETY rows 252 → 186.6 — puts rows 2–3 at 528 and the page at **927 at 1280 (97 px spare)**
and **963 at 1600**. The overflow is entirely message *wrapping*, and the messages that wrap
are dev-Mac paths (`/proc/stat: ENOENT: no such file or directory, open '/proc/stat'`) that
the real box does not produce.

### 3. What changed to converge, and why

Four edits, all measured before and after: two one-line CSS fixes in `components/`, and two
defects in the MEASURING TOOLS. **No `.tsx`, and nothing under `app/` or `lib/`, was touched by
this session** — the panels the first builder wrote were already within tolerance, and the
convergence to 0.0 % came from the two CSS lines.

**(a) `components/meter.module.css` — `box-sizing: border-box` on `.track`.** `MOCK.html` sets
`* { box-sizing: border-box }` globally; this app does not, and 10e §2.0's every measured box
was read off the mock under that rule. Without it the track's 1 px hairline sits *outside* its
6 px, so a meter row measures 25.0 where §2.0 budgets 23.2. It showed up as a constant
+1.8 px per meter in the first `check-density` run — GPU +3.6 (two meters) → 168.5 vs 164.5,
MEMORY +3.6 → 141.8 vs 138.5, STORAGE +3.6 → 148.1 vs 144.8, CPU +1.8 (one meter) → 218.1 vs
216.1. Every one of those four landed exactly on target afterwards.

**(b) `components/panels/session-event-log-panel.module.css` — `box-sizing: border-box` on
`.scroll`.** Same cause: §2.8's 84 px is the mock's total box, and the well measured 86.

**(c) Two defects in the MEASURING TOOLS, both of which made a passing state unobservable.**
No production behaviour depends on either; both are recorded here because a grader that
cannot fail honestly is worse than no grader.

- `mocks/measure-arrangements.mjs`'s `anatomy()` recorded **only the first `<svg>`** in each
  part (`child.querySelector('svg')`). The GPU card keeps **both** ≥1600 px promotion wrappers
  inside **one** hero-row child, so the first svg is always the narrow one — the *hidden* one
  at ≥1600. The part read `(svg 440x0)` while a visible 600×50 chart sat beside it, and §8
  item 4's `gpu0 visible chart paints 50 px` could never pass at 1600/1920 whatever the app
  painted. Now every svg in the part is listed; `check-density.mjs`'s scan became a global
  `matchAll`. CPU was never affected (its two wrappers are two separate children).
  Independent corroboration that the app was already right: the GPU hero row *itself* measures
  38 at 1280 and **50 at ≥1600**, and only the chart can set that.
- `mocks/check-density.mjs`'s spare check read `viewportHeight − document.documentElement.
  scrollHeight`. Per CSSOM, `scrollHeight` on the document element is **at least** the viewport
  height, so on any page that fits it equals `clientHeight` and the expression is **0 by
  construction** — the check was unsatisfiable for exactly the state it grades, and had only
  ever been run against an overflowing tree, where it happened to look correct. It now measures
  from the content bottom (`grid.bottom`, which the same run already recorded — the band is the
  only other body child and sits above the grid). That is the number §2.10's "spare" column
  predicts. Item 1's `scrollHeight ≤ clientHeight` check is unchanged and still passes.

### 4. The nine `regressions.py` harnesses, and `pnpm verify`

`pnpm verify` (cold, Node 24.16.0): **exit 0 — 102 test files, 2886 tests, no type errors.**
Run after every edit above and again after the harnesses; `git status` shows no stranded
mutation.

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | 60 (57 ran) | — (the run stops at the moved anchors before printing it) | ⚠ **exit 1 — the three PRE-EXISTING failures only**: `02-R20` / `02-R30` / `02-R31`, "ANCHOR NOT FOUND in `lib/format.ts` — the implementation moved", orphaned by `formatUptime`'s `prefix` parameter before this loop (HANDOVER §1). Every other mutation bit, including 10e's own `10e-F1`/`F2`/`F3`/`S1`/`S2` |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** — all 73 bit, every ⚠ covered |
| `04-collector-cooling` | 92 → **94** | 188 red across 94; 85 ⚠ checked | ⚠ **exit 1 on the first run, exit 0 after the fix below** — all 94 bit, every ⚠ covered |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | 120 | 180 red across 120; 133 ⚠ checked | **exit 0** |
| `10-panels-assembly` | 181 | 230 red across 181; 210 ⚠ checked | **exit 0** |

No `DID NOT BITE`, no `ANCHOR AMBIGUOUS`, and no `ANCHOR NOT FOUND` anywhere except the three
pre-existing `02-` ones. `git status` after the run: 77 entries, every one an `M` or `??` that
belongs to this loop — no stranded mutation.

**⚠ Harness 04 found a real gap, and the first builder's prediction that 03–08 "are not expected
to find anything" was wrong.** `lib/severity.test.ts` is in the `LEDGER_FILES` of **both** step
2's harness and step 4's, so a ⚠ mark added to it has to be backed **twice, once per owner**.
10e added two marks there — the exported `GPU_TEMP_WATCH_C` / `GPU_TEMP_ALARM_C` that 10e §3.2
requires `severityGpuTemp` and the sparkline's reference lines to share — and backed them only in
step 2 (`10e-S1`/`10e-S2`). Step 4's ledger correctly reported them as marks no mutation reddens:

```
NO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:
  lib/severity.test.ts
    ⚠ GPU_TEMP_WATCH_C is 70 and GPU_TEMP_ALARM_C is 80 — §6.3’s own boundaries, exported
  lib/severity.test.ts
    ⚠ severityGpuTemp bands the WATCH floor from the exported constant, not a second copy
```

Fixed by adding **`10e-S3`** and **`10e-S4`** to `pipeline/steps/04-collector-cooling/regressions.py`
(the `10e-` prefix names the CREATING step, ANCHOR §9, which is why they read `10e-` in an `04-`
file). They are deliberately **not** copies of `10e-S1`/`10e-S2`: step 2's pair drifts the WATCH
constant and weakens the `>=` comparison, step 4's drifts the **ALARM** constant and re-introduces
a drifted **second copy** of the watch floor (`tempC >= 71`) — the exact wrong implementation the
second mark's own name names. Both bite: `10e-S3` reddens 3 tests, `10e-S4` reddens 2, and 04
re-ran to **94/94, every ⚠ covered, exit 0**.

### 5. Spec silences recorded by this session (invariant 7 — record, do not choose)

5. **`errors[]` notes have no height bound, and §2.11's degraded budget assumes they never
   wrap.** §2.11 costs a source's `errors[]` line at 14.2 px — one line — and §2.10's "worst
   plausible" page is built on that. Nothing in §6.5, §3.7 or 10e caps the height of a
   `PanelNotes` block or of a `StatusRow`'s `detail`, and the message text is the collector's
   own (`S-H`), so a long one simply wraps: measured, four CPU messages occupy **123 px** where
   the budget says 62.8, and SAFETY's four rows occupy 252 px where the budget says 186.6. On
   the box the messages are short (`nvidia-smi: ENOENT`, 17 px) and this never bites; on any
   host whose failure messages carry absolute paths it does, and it is the whole of
   measurement 9's remaining 27 / 49 px. Whether §6.1's promise is conditioned on healthy
   telemetry only (as §6.1's acceptance sentence reads), or must hold under an all-sources-
   failed page too (as `measure-breakpoints.mjs`'s fixture asserts), is an owner question this
   session did not answer. **Not chosen. `measure-breakpoints.mjs`'s fixture was left exactly
   as it was.**
6. **`MOCK.html` is globally `border-box` and the app is not**, so every height 10e §2 and §4
   quote from the mock is a *border-box* height. The spec's §1 token list does not say so, and
   two graded boxes were built content-box because of it (above). Swept for the rest: the only
   other rule in `components/` that puts an explicit `height` beside a border or padding is
   `header.module.css`'s `.controls button` (`height: 23px; padding: 0 7px; border: 1px`), which
   therefore paints **25**, not §4's measured 23 — and it was **left alone deliberately**,
   because the sticky band it sits in measures **43 px**, exactly the number §4 gives and exactly
   the number `check-density.mjs`'s `BAND` constant assumes. Making that one box border-box would
   move a band that is currently on target, to satisfy an arithmetic no measurement checks.
   Recorded rather than adopting the mock's global `* { box-sizing: border-box }`, which would
   be a page-wide change nothing in this loop measured; but a future primitive with a fixed box
   will hit the same trap.
