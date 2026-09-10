# Handoff — 10h BUILD: **bound the GRID.** The loop that closes §6.1 for good.

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read: this file →
`SPEC.md` §6.1 — ⚠⚠ **the 2026-09-10 grid-bounding paragraph is the ruling; the per-term ⚠
paragraphs above it are now history, not your instructions** — plus §6.4's `+N more` paragraph and
§3.4's `model` ruling → `pipeline/HANDOVER.md` §0.0, §0.11, §1, §8 → 
`steps/10-panels-assembly/10g-adversarial.md` **A1** (the four breaking scenarios, measured) →
`steps/10-panels-assembly/10g-reconciliation.md` §1 → `steps/10-panels-assembly/10g-build.md`
§1–§2 (the wells, the chart box) and `10f-build.md` §1.3–§1.4 (**the row model: rows 2 and 3 size
INDEPENDENTLY**) → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`. Load the `dataviz` skill if you touch a chart.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `29e2240`.

## 1. Verified by the parent

`pnpm verify` exit 0, 101 files, **3010** tests. Nine harnesses exit 0, **1130** mutations, every ⚠
mark reddened, and the harnesses now **refuse an unmatchable ledger key** (`return 1`). Browser:
`measure-breakpoints.mjs` **30/30**; `check-density.mjs` ALL PASS (263.2 / 227.6 / 283.6 spare);
m11 (all sources explained) 41 / 6 / 62. **The grid, the banner's list and `model`'s rendering are
untouched — confirmed by the parent — so all three rulings are yours to build.**

## 2. The ruling: every panel is bounded by its grid row

**Why**, so you do not re-open it: four loops bounded one term each and a new one appeared every
time. Measured from m11's own fixture, **each one field alone** breaks 1600×1024: a notable throttle
mask −16, §6.3's four alarm bits −40, **a third `llama-server` instance (§3.4 requires N to work)**
−42, a path-valued `model` −19 at 1280. Together −113 / −64 / −8.

**Build:** every panel gets a **max-height computed from its grid row's share**, and its **body**
scrolls inside it. Non-negotiable properties, each of which needs a test:

1. **The head never scrolls away** — title, subtitle, chip stay pinned. A reader must always see
   which panel is which and its severity. (Sticky head, or a flex column whose head is fixed and
   body is the scroller — say which and why.)
2. **The page fits for ANY telemetry** at 1280×1024, 1600×1024, 1920×1080. That is the acceptance,
   and it must be measured on **hostile** fixtures, not healthy ones (§4).
3. **A scrolling panel says so** — the same fade + `… N more` affordance the wells use. ⚠ `10g-Q1`
   is open and now yours to answer for a panel body: the marker counts **entries**, not hidden
   lines. Decide what a panel body counts, and record the reasoning. If the honest answer needs a
   number `components/` cannot compute without measuring, **say so and record it** rather than
   inventing one — `purity.test.ts` forbids hooks in `components/`.
4. **Rows 2 and 3 size independently** (`row2 = max(CPU, MEMORY)`, `row3 = max(SAFETY, STORAGE)`),
   so a max-height is per panel from its row's share. `align-items: start` and COOLING's
   `align-self: stretch` still hold.
5. **The per-term wells stay** — they are now legibility, not the thing holding the promise up. Do
   not delete them; do not add new ones.

## 3. Also ruled, and part of this loop

- **Banner: `+N more`** (§6.4, 2026-09-10). Render the conditions that fit the two lines, then a
  `+N more` count. Measured cause: 4 of 20 items readable at 21 conditions, no scrollbar in layout.
  Keep the fixed height, the pinned alarm count, and every condition in the panels and event log.
- **`model` renders as its filename** (§3.4). Raw on the wire, filename on screen, full string in
  the row's `title` and the table view. Worth +21 px per SERVING row and +17.9 px per GPU card.

## 4. ⚠ The fixtures are part of the work — this is why the failure was invisible

**Every browser fixture in this project hard-codes `throttleReasons: '0x…04'`, which is not
notable**, so no measured page has ever rendered a throttle line. Build a **hostile fixture** and
grade against it: every source explained · a notable multi-bit throttle mask on both cards · §6.3's
four alarm bits · **three** `llama-server` instances · path-valued models · long messages · a
21-condition banner · 500 log entries · every table view open. Add it as a numbered measurement in
`measure-breakpoints.mjs` with a fixture-took precondition (measurement 10's pattern), and **probe
every new measurement by breaking it** before trusting it — two of 10g's passed vacuously.

## 5. Acceptance

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs          # all measurements, incl. yours
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
for s in 02-format-severity 03-collectors-gpu-host 04-collector-cooling 05-collectors-serving-storage-safety \
         06-telemetry-route 07-auth-login 08-client-runtime 09-ui-primitives 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done
```

The hostile page fits at all three viewports; `check-density.mjs` stays ALL PASS on the healthy
page (the bound must not shrink a panel that fits); every existing measurement still passes.

## 6. Rules

- Mutation ids `10h-`, unique across all harnesses; ⚠ marks need a **matchable prefix ≥12 chars**
  (the harness now returns 1 otherwise); fixtures both sides; a re-aim no narrower than the original.
- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ never poll with `pgrep`; ⚠ **never `git checkout --` while this item is uncommitted** —
  undo an experiment with the edit that reverses it. Close only browsers you launch; kill only
  `next dev` you started (:8391/:8392 are the user's); no `.env`; `next-env.d.ts` byte-identical.
- `components/` stays hook-free. **Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not
  weaken a guard.** Invariant 7: if the spec is silent, STOP and record it.

## 7. Deliverable

`steps/10-panels-assembly/10h-build.md`: the bound's mechanism and the per-row arithmetic; the
hostile fixture and what it measures at each viewport, before and after; the head-pinning approach;
what a panel body's `… N more` counts and why; the banner and `model` changes with numbers; harness
totals; spec silences. Short summary back. The parent will not read your transcript.
