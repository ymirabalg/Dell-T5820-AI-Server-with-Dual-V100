# Handoff — 10g BUILD: the last unbounded terms. **Table views, the banner, the throttle line, and the "… N more" affordance.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read: this file →
`SPEC.md` §6.1 (every ⚠ paragraph dated 2026-09-09 — there are now five) and §6.4's ⚠ banner
paragraph → `pipeline/HANDOVER.md` §0.0, §0.10, §1, §8 (rows `10f-Q1`…`Q5`, `10e-Q2`) →
`steps/10-panels-assembly/10f-reconciliation.md` §1–§3 (the measured numbers) →
`steps/10-panels-assembly/10f-build.md` §1.3–§1.4 (the well heights and the row model — rows 2 and
3 size INDEPENDENTLY) → `steps/10-panels-assembly/10f-adversarial.md` A1/A2/A3/A7 → `ANCHOR.md`
§4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `5769522`. Load the
`dataviz` skill before touching the table view or the chart box.

## 1. Verified by the parent on the tree you inherit

`pnpm verify` exit 0, 101 files, 2967 tests. All nine harnesses exit 0 (02 60 · 09 129 · 10 242).
`measure-breakpoints.mjs` 16/16 exit 0 (m9 spare 140/104/160 on the dev-Mac fixture; m10 157/122/178
on the real-box degraded case). `check-density.mjs` ALL PASS, healthy spare 263.2/227.6/283.6 —
all run by the parent. Reconcile-measured and audited: the all-sources-explained page with a
two-alarm banner is **1 px over at 1600×1024** (spare 34.6 / −1.0 / 55.0); a notable throttle mask
adds **+44 px per GPU card**; five table views at `40vh` each add **+851 px** to a healthy page; the
banner is 65.7 px at 2 and 6 alarms, 92.5 at 12, 173 at 21.

## 2. The four rulings — owner's, do not re-ask

### 2.1 10f-Q1 — a table view replaces its chart INSIDE the chart's own box (SPEC §6.1)

Today `[data-role="table-view"]` is bounded by `--table-scroll-max: 40vh` and renders beside/below
the chart. After: toggling to the table hides the chart's `<svg>` and shows the table in a box of
**exactly the chart's painted height** (38/50 px sparklines, 174 px COOLING), `overflow-y: auto`,
`position: relative`, `box-sizing: border-box`, sticky `thead`. **Opening any number of table
views changes no slot height** — that is the acceptance, measured: page height identical with all
five open and all closed, at all three viewports. Retire `--table-scroll-max` and SCOPE 2.5f with
it. Keep the table's rows, the toggle's accessible name, and Q2-S2's rulings intact; a 38 px table
with a sticky head shows about one row and scrolls — that is the ruling's cost, and it stays.

### 2.2 10f-Q2 — the banner is a fixed two-line scrolling box (SPEC §6.4)

`alarm-banner`: `max-height` = the measured two-line height (~66 px at 1280 — measure it, do not
copy), `overflow-y: auto`, `position: relative`, the **lead with the count** (`6 alarms`) pinned
visible (sticky or outside the scrolling region), conditions beyond the second line scroll. Assert
by fixture: 2, 6, 12 and 21 conditions all measure the same band height; the count is in the DOM
for each; every condition's text is present in the DOM (nothing dropped). `role=status`/`alert`
semantics unchanged.

### 2.3 10f-Q3 + 10e-Q2 — bound the throttle line; `roomy` becomes three lines

GPU card: the throttle `Caption` becomes a **one-line well** (same four declarations as the notes
wells; chips wrap inside it and scroll). `roomy` `PanelNotes` goes **60 → 46 px** (three 14 px lines
+ 4). Then **re-measure the all-sources-explained + two-alarm-banner page** (the reconcile's A3
fixture is described in `10f-reconciliation.md` §3.1 — reproduce it, or add it to
`measure-breakpoints.mjs` as measurement 11 with a fixture-took precondition like measurement 10's).
Acceptance: it fits at all three viewports with margin you state; measurement 10 and
`check-density.mjs` unchanged.

### 2.4 10f-Q4/Q5 — a continuation affordance on every overflowing well

Every bounded well (`PanelNotes`, `StatusRow` detail/note, the throttle well, the banner) shows a
**bottom fade plus a small `… N more` marker** when `scrollHeight > clientHeight`, and nothing when
not. ⚠ `components/` is hook-free and cannot measure — so the marker is **CSS-only where CSS can
do it** (a fade via a `mask-image`/gradient on the well that is inert when nothing overflows), and
the `N` in `… N more` comes from **data the panel already has** (messages beyond the first line =
`entries.length − 1` for a one-line well; for `roomy`, `max(0, entries.length − 3)`), not from
measurement. Say so in the notes, and record as a spec silence if the count can only approximate
what is visually hidden. The marker is a count, never a sentence (§6.1's wording).

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
for s in 02-format-severity 03-collectors-gpu-host 04-collector-cooling 05-collectors-serving-storage-safety \
         06-telemetry-route 07-auth-login 08-client-runtime 09-ui-primitives 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done
```

- Mutation ids `10g-`, unique across all harnesses; ⚠ on load-bearing tests; fixtures both sides;
  a re-aim must be no narrower than the original (10e-test §1's method).
- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ never poll with `pgrep`. `git checkout --` a stranded mutation. Close only browsers you
  launch; kill only `next dev` you started (:8391/:8392 are the user's); no `.env`; `next-env.d.ts`
  byte-identical. **Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken any guard.**
- Invariant 7: if the spec is silent, STOP and record it.

## 4. Deliverable

`steps/10-panels-assembly/10g-build.md`: per ruling what changed and the measured before/after
(table views open vs closed; banner at 2/6/12/21; the all-explained page at all three viewports;
m9/m10/density unchanged); harness totals; spec silences. Short summary back. The parent will not
read your transcript.
