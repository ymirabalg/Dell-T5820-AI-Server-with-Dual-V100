# Handoff — 12c BUILD: **named instances, and a wire that drops the row instead of the page**

**Written by the parent, 2026-09-17.** Fresh agent, no memory of this project. Read: this file →
**`SPEC.md` §3.4's ⚠⚠ 2026-09-17 two rulings** (the brief), §3.4's `gpus` table, §6.2's inverted
join, §4, §6.4, §9 → **`SERVING-MODES.md` §4** → `pipeline/HANDOVER.md` §0.0, §0.16, §8 (rows
`12b-Q1`…`Q6`) → `steps/12-deploy/12b-reconciliation.md` **§9, the cost survey** (seven layers, and
it is the map for this loop) → `lib/collectors/serving.ts`, `lib/client/wire.ts`, `lib/types.ts`,
`lib/conditions.ts`, `components/panels/serving-panel.tsx`, `gpu-panel.tsx` → `ANCHOR.md`
§4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree clean at `cb8a3c7`.
⚠ **The box is LIVE.** Read it; **write nothing**; **open no D-Bus connection you do not close**.
You do not deploy.

## 1. Ruling 1 — instance ids are STRINGS, and discovery accepts named instances

`discoverInstances` requires a bare-integer filename, so `serving-mode.sh`'s `split.env` is rejected
outright and **split mode cannot be rendered at all** — found only after 12b shipped the join that
needed it. Accept named instances across discovery, ordering, unit naming and keys.

⚠ **Two things stop being free. They are the loop.**

- **`servingUnitName` becomes a MAPPING, not a template.** `0` → `llama-server@0.service`;
  `split` → **`llama-split.service`**, not `llama-server@split.service`. ⚠ **Every wrong answer
  here is silent** — a unit name that does not exist yields "inactive", which reads as a stopped
  service rather than a lookup failure. **Make a miss loud**: a name the mapping cannot produce is
  an `errors[]` entry, never a default.
- **Ordering must be SPECIFIED, not inherited from a sort.** The numeric sort that orders
  `0, 1, 2, 10` has no string equivalent, and `serving[]`'s order is what *first claimant wins*
  means in §6.2's join. Decide the rule, write it in the code's own words, and **test that two
  instances claiming one card resolve deterministically** — the same list in a different order
  must give the same answer, or the order is load-bearing and must be stated.

Also in scope, from the survey: condition ids (already `string`-keyed — confirm, do not assume),
React keys, and anything that parses an instance id back to a number.

## 2. Ruling 2 — `wire.ts` refuses the ROW, not the snapshot

One invalid `serving[]` entry currently blanks the whole dashboard, so a box switched to split mode
before its dashboard is redeployed shows **nothing**. Drop the offending row, render the rest, file
an `errors[]` entry naming **which row and why**.

⚠ **This is not a relaxation — it is invariant 5** (*a failed reading is a partial snapshot plus an
`errors[]` entry, never a 500*). Two consequences to build deliberately:

1. **A dropped row must never be counted as a healthy instance** by §9's aggregate, and §6.2's
   "N of M up" style counts must not silently shrink M.
2. **Row-level refusal must not become snapshot-level leniency.** Everything outside `serving[]`
   keeps whole-snapshot validation. Say in the code why this array and no other.

## 3. The bar

- ⚠ **Render the acceptance; do not reason about it.** Named and numeric instances; a split row; a
  row that fails validation beside two good ones; a mapping miss; two instances claiming one card.
- ⚠ **12b's own lesson**: a fixture where the instance id and the card index **agree** cannot tell a
  right implementation from a wrong one. Default to disagreement — and now also to a **non-numeric
  id**, which is the new coincidence available to be relied on by accident.
- **The wire change is NOT additive**: an id that was a number becomes a string. ⚠ **The live box's
  snapshot must still validate and render identically** — prove it against the frozen
  `LIVE_BOX_SERVING_WIRE`, and say what a client sees if the server is newer than it.
- Mutation ids `12c-`, unique across all harnesses, ⚠ names ≥12 matchable chars, fixtures both
  sides. `components/` stays hook-free. A guard whose pass condition is "nothing found" must judge
  its own failure.
- ⚠ **You touch steps 5, 8 and 10's `LEDGER_FILES`.** Run each harness **serially, one at a time,
  never two at once, never kill one.** The browser measurements must stay green — 102 records, and
  one panel sits **0.8 px** from its cap at 1600.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
python3 pipeline/steps/08-client-runtime/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never `pnpm verify` beside a harness; never
  poll with `pgrep`. No `.env`; `next-env.d.ts` byte-identical.
- **Do not edit `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` or `SERVING-MODES.md`.** Record
  disagreements. Invariant 7: if the spec is silent, STOP and record it.

## 5. Deliverable

`pipeline/steps/12-deploy/12c-build.md`: the id type change and everything it touched; the unit-name
mapping and **how a miss is made loud**; the ordering rule in its own words and the determinism
test; the row-refusal path and what stops it becoming snapshot leniency; the four renders quoted
from real output; the live-box compatibility proof; measurements; harness totals; every spec
silence. Short summary back. The parent will not read your transcript.
