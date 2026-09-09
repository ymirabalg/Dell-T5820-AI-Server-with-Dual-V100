# Handoff — 10e BUILD: bring `components/` and `app/` to `MOCK.html`'s density. **Implement the spec to the dot.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project.

Read, in order: this file → **`steps/10-panels-assembly/10e-match-the-mock.md` in full** (the builder
spec — every height, token, prop and edit is there; ⚠ its §9 now opens with the owner's RULINGS) →
`SPEC.md` §6.1 (rewritten today), §6.2, §6.3, §6.6 → `MOCK.html` (open it; read its CSS and the
`render*` functions — **for FORM only**) → `pipeline/HANDOVER.md` §0.0, §0.6, §0.7, §0.8, §1, §9 →
`ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` (the seven invariants).

⚠ **Load the `dataviz` skill** — this loop is type scale, meters, sparklines, chart sizing and paint.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree at `5d9b00e` plus the parent's four
uncommitted doc edits (`SPEC.md`, `WORK-ITEMS.md`, 10e's spec, `check-density.mjs`). Nothing under
`components/`, `app/`, `lib/` is dirty — `git status` confirms it.

---

## 0. ⚠ You are the SECOND builder — a previous one died partway. Inherit its work, do not trust it.

> **Record note (parent, later the same day):** this section was written for a replacement builder
> after the first was killed by a rate limit. The owner restarted the first builder instead; the
> replacement was cancelled before it touched a file, and the first builder finished the code. The
> browser pass was then done by a second agent from `10e-build-2.md`. Kept as written.

The first build agent was killed by an API rate limit mid-loop, with **no notes written**. Its
partial work is in the tree, uncommitted. `git status` / `git diff` show it exactly:

| file | what the diff shows it got to |
|---|---|
| `components/tokens.css` | the §1 tokens and the 12 px base (+85/−) |
| `lib/format.ts` + `format.test.ts` | the `parts` variants (`renderParts`, `format*Parts`, `FormattedParts`) — O14 |
| `lib/severity.ts` + `severity.test.ts` | `GPU_TEMP_WATCH_C` / `GPU_TEMP_ALARM_C` exported and read by `severityGpuTemp` |
| `components/chip.*` | the `code` variant and the mock's chip form |
| `components/meter.*` | **started, probably unfinished** — it was "continuing with meter" when it died |
| `pipeline/steps/02-format-severity/regressions.py` | `02-R5` re-aimed at the constant; five new `10e-F*`/`10e-S*` mutations |
| `pipeline/steps/09-ui-primitives/regressions.py` | 3 lines added |

**Audit before you build on it**: read each diff against 10e's spec; keep what matches, fix what
does not, and say in your notes which you did per file. Run `pnpm verify` first to see where the
tree stands. **Parent-verified fact**: the 02 harness reports three failures — `02-R20` / `02-R30` /
`02-R31`, "anchor moved" — and those are **pre-existing and documented** in `HANDOVER.md` §1
(broken anchors on the uptime formatter, orphaned before this loop). They are not yours to fix and
not evidence against your work; every *other* line of every harness must be green.

Nothing under `components/panels/`, `app/`, `grid.*`, `header.*`, `alarm-banner.*`,
`panel-shell.*`, `row.*`, `status-row.*`, `sparkline.*` was touched. Those are all still ahead.

---

## 1. What the parent has already verified — inherit these as facts

- **`pnpm verify` exits 0 on this tree**, run by the parent today (cold, Node 24.16.0, pnpm 12.3.4).
- **The failure is measured, not argued**: the page overflows by 356 / 418 / 362 px at 1280×1024 /
  1600×1024 / 1920×1080 with healthy telemetry; `MOCK.html`, the same grid, fits by ~19 / ~90 / ~159.
  The built panels are 1.8–2.4× the mock's heights. Cause: a 16 px `em` base with one reading per
  24 px body line, where the mock is 12 px with heroes, meters and strips laid out horizontally.
- **`check-density.mjs` discriminates**: run on today's tree it reports 31 FAIL. It is the grader.
- **`SPEC.md` was amended today by the parent** (phases never edit it): §6.1 carries the measured
  numbers, the "mock is form only" rule, the banner ruling and all eight OQ rulings; §6.2's CPU
  entry records OQ-7. Read the new §6.1 text before anything else in the spec.

## 2. The owner's rulings — apply exactly; do not re-ask, do not build what was declined

| question | ruling | what you build |
|---|---|---|
| §6.1 and the banner | **unconditional** — the page fits with §6.4's banner pinned at all three viewports | acceptance item 2 of 10e §8 stands |
| OQ-1 min/max/now caption | **declined** | no caption under any trace |
| OQ-2 per-panel note footers | **declined, all four** | no `.note` footers; no text constants |
| OQ-3 count chips | **severity word only** | `panelChip` unchanged: `normal` / `watch` / `alarm` / no band |
| OQ-4 the log's head chip | **no chip** | SESSION EVENT LOG's head renders nothing in the chip slot — not `—`, not `10 s debounce`. `PanelShell` needs a way to say "no chip slot" that is distinct from `chip={null}` (which means "no band" = the hatched `—` on a panel that HAS readings). Say how you did it |
| OQ-5 paused banner | **declined** | `alarm-banner.tsx` gains no paused variant; the header pill + counting age remain the announcement |
| OQ-6 `engage 55` / `EC auto 2210` | **leave out** | only §6.3's 70/80 lines, on the GPU sparkline's ≥1600 form, from the exported constants |
| OQ-7 CPU temperature trace | **KEEP BOTH traces** | CPU renders temperature AND utilisation sparklines (38 px each below 1600, 50 at ≥1600). CPU target = 10e's spec-only + one sparkline + 5 px gap: **216.1 / 240.1 / 240.1**. `check-density.mjs` already carries this |
| OQ-8 `standing` pill form | recorded for §6.4's owner | nothing this loop |

With OQ-7, rows 2–3 = max(COOLING 366.3, CPU + 9 + SAFETY 160) = 385 / 409 / 409, page ≈ 775 /
811 / 811, spare ≈ 249 / **213** / 269. The ≥200 px spare criterion holds at 1600 by 13 px — **do not
spend any of it on chrome**; if a measured row comes out taller than the spec's budget, find out why
before accepting it.

## 3. What you build — 10e §1–§7, and nothing the mock draws that §2's table declines

10e's own summary: `tokens.css` (values + new tokens; 12 px body base; `px` everywhere, never `em`/
`rem`), `panel-shell` (`position: relative` — F1; `headControl` prop), `chip` (`code` variant),
`meter` (`tickPercent`; neutral fill — a `normal` meter is NOT green), `row` / `status-row` (F5:
`.value` wraps), `sparkline` (three optional props `domain` / `refs` / `timeLabels`, area fill, end
dot), `grid.tsx`'s `CHART_SIZE` (the four new entries; `sparkline` and the old `gpuPromoted` removed),
`grid.module.css` (gap 9, padding, `align-items: start`, COOLING `align-self: stretch`), `header`,
`alarm-banner`, the nine panels' bodies, new leaves `hero.tsx` / `strip.tsx`, and in `lib/`:
`format.ts` `parts` variants (O14 — a hero sizes its unit without splitting a string; **never split a
formatter's output on whitespace**) and `severity.ts` exporting `GPU_TEMP_WATCH_C = 70` /
`GPU_TEMP_ALARM_C = 80` with `severityGpuTemp` reading them.

Non-negotiable, from 10e §6's 26 rows: every string, formatter, severity rule, S-* ruling and
invariant stays exactly as built. Raw driver name, full bus id, `GiB`, `served by instance N`,
`for 2 d 06:00`, `0 RPM` in alarm ink for zero, `—` for `null`, `EC auto` healthy, one message per
source per panel. **The mock supplies how tall and how dense, never what is printed.**

The ≥1600 promotion is 10e §3.2's choice (1): the CSS media-query two-wrapper mechanism already
built and measured (`data-role` wrappers; measurements 7/8). CPU gets the same two wrappers for
each of its two traces. `components/` stays hook-free — `purity.test.ts` walks it.

## 4. The bar

- **Measure, do not estimate.** Every height claim in your notes comes from the browser, via the
  acceptance commands below. Run them yourself before reporting.
- ⚠ **CSS and paint are not observable in jsdom.** A test that asserts a stylesheet contains a
  string must say so in its name. `lib/dangling-css-class.test.ts`, `components/styles.test.ts`
  and `components/purity.test.ts` must pass unchanged (10e §8 item 7).
- ⚠ The `toContain` lint and the dangling-class audit are live (10c-2). If a guard fires, it is
  probably right.
- Mark load-bearing tests `⚠`; back each with a **`10e-`**-prefixed mutation — in
  `10-panels-assembly/regressions.py` for panel/shell work, in `09-ui-primitives/regressions.py`
  for leaf primitives (`chip`, `meter`, `row`, `sparkline`, `panel-shell`), in
  `02-format-severity/regressions.py` for `format.ts` `parts` and the severity constants.
- **Every boundary guard needs a fixture on both sides** (HANDOVER §5.1). A `Sparkline` with
  `domain` clamps; one without autoscales — test both. `refs` and `timeLabels` absent → byte-for-
  byte today's output (10e §3.2).
- **The table view is the chart's accessibility floor**: it must not gain rows because a
  decoration (area fill, ref line, axis label) was added.
- `header.test.tsx` lines 69/70/75 move from visible words to accessible names (10e §4) — do not
  weaken what they prove.
- **Invariant 1 both directions. Invariant 2: read-only. Invariant 7: if the spec is silent, STOP
  and record it** in your notes under "spec silences" — do not choose.

## 5. Acceptance — all of it, run by you, quoted in your notes

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"   # nvm FIRST — ~/.local/bin/node is v26 and shadows the pin
cd dashboard
pnpm verify                                                                   # exit 0, cold; green is EXIT 0 and nothing else
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs                # measurements 0–9 all PASS; exit 0
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs \
     --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json   # ~2 min; its own next dev on :39174
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json     # NO --oq flag: every OQ is declined; CPU's second trace is already in the target
for s in 02-format-severity 03-collectors-gpu-host 04-collector-cooling \
         05-collectors-serving-storage-safety 06-telemetry-route 07-auth-login \
         08-client-runtime 09-ui-primitives 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done                            # all nine, serially, in ONE call
```

Pass criteria are 10e §8 items 1–8 with the CPU row at 216.1 / 240.1 / 240.1: page ≤ viewport
with ≥200 px spare at all three sizes healthy; page ≤ viewport with the harness's banner pinned;
per-slot heights within ±10 % of target; painted chart boxes COOLING 174, GPU/CPU visible chart
38 below 1600 and 50 at ≥1600; measurements 0–9 green; verify green; nine harnesses green;
`next-env.d.ts` byte-identical; no `next dev` left on :39173/:39174.

## 6. Rules

- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once — sequential foreground.
- ⚠ **Never poll for a harness** — a `pgrep` wait loop in the same shell self-matches and spins
  forever (ANCHOR §9). Run them serially in one call and let the call return.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- ⚠ **If you launch a browser, close only what you launched** — the user's own Chrome is running;
  `pgrep -f chrome` matches it. Leave no dev server, no `.env`, no secret.
- **Do not commit. Do not edit `SPEC.md`. Do not edit `MOCK.html`. Do not weaken `purity.test.ts`.**
- `ai-server` is read-only and you do not need it.
- A heredoc written to a relative path from the wrong cwd fails silently — `ls` the file.

## 7. Deliverable

`steps/10-panels-assembly/10e-build.md`: what changed per file; how OQ-4's "no chip slot" was
expressed; the `parts` variants added and who calls them; the measured per-slot heights at all
three viewports against target (paste `check-density.mjs`'s output); `measure-breakpoints.mjs`'s
output; the harness totals; every spec silence recorded; anything in 10e you could not do to the
dot, with the measured reason. Report back a short summary. The parent will not read your transcript.
