# Handoff — 12d BUILD: **a partial read says so, and retires what it can**

**Written by the parent, 2026-09-22, for a FRESH SESSION.** You have no memory of this project.
Read, in order: **`pipeline/ANCHOR.md` §2 (the whole of it — §2.0, §2.0a, §2.0b, §2.6)** → this
file → **`SPEC.md` §3.4's ⚠⚠ 2026-09-22 card-form ruling and §9 row 2's ⚠⚠ 2026-09-22 retirement
ruling** (the two briefs) → §4, §6.2, §6.4, §9 row 1 → `pipeline/HANDOVER.md` §0.0, §0.17, §8 →
`steps/12-deploy/12c-reconciliation.md` (the seam this builds on) → `lib/client/wire.ts`,
`lib/client/observations.ts`, `lib/conditions.ts`, `components/panels/gpu-panel.tsx`,
`components/panels/serving-panel.tsx` → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`, **clean at `c7070a2`**.
⚠ **The box is LIVE** — inference on 8080/8081, the dashboard on 8090. **Read it; write nothing.**
You do not deploy.

## 1. What you are building on

12c made the completeness of `serving[]` a **type**: `ServingEnumeration` is
`{read:'none'}` / `{read:'partial',rows,refused}` / `{read:'all',rows}`, its constructor demands
the refusal count, and both `servedBy` and `enumerationsRead` take it — a caller holding only rows
fails to compile. **The seam exists; 12d uses it.** Do not re-plumb it.

## 2. Ruling 1 — a partial read has its OWN form on the card (`SPEC.md` §3.4)

Today a refused row makes the GPU card's served-by line an **em dash**, which already means *this
reading could not be taken* — what an unreadable `gpus` shows. **Two different facts render
identically**, which is invariant 1's own failure one level up, and the `errors[]` entry explaining
the refusal reaches **only the SERVING panel**, so the card carries a failure it cannot account for.

Build a third form, distinct from the em dash and from a positive answer, saying the **list was
incomplete** rather than that the reading failed. ⚠ **It is a statement about OUR knowledge, not
about the machine, and it must read that way.** The full reason stays on SERVING beside the refused
row. Keep it short; §3.7 forbids explanatory prose in a value slot.

## 3. Ruling 2 — retire what you can (`SPEC.md` §9 row 2)

A partial read currently freezes retirement for **every** instance, so an instance that genuinely
left keeps its alarm in the count indefinitely — measured still there at 20 minutes. Per subject now:

- **The refused row's identity PARSED** → protect **that identity alone**; every other absent
  subject retires normally.
- ⚠ **The identity did NOT parse** → no subject can be shown absent, so **retirement stays frozen
  for the whole enumeration.** That is the honest answer to *we cannot tell who is missing* — **it
  is not a case to optimise away**, and a test must pin that it stays frozen.

This needs a per-subject exclusion in `observePoll`, not a global flag. ⚠ **A protected subject goes
STALE, never retired** (§9 row 2), and staleness never raises or lowers a severity.

## 4. The bar

- ⚠ **Render the acceptance; do not reason about it.** Both panels, all of: complete list; partial
  with a parsed identity; partial with an unparsed identity; unreadable `gpus`; absent `gpus`. The
  em dash and the new form must be **distinguishable in the DOM and to a screen reader**.
- ⚠ **Three of this project's recurring traps apply directly here.** A guard whose pass condition is
  "nothing found" must judge its own failure (six instances so far). A fixture whose two candidate
  answers coincide cannot discriminate — the instance id and the card index must **disagree** by
  default, and so must "protected" and "absent". And a ⚠ test needs a mutation that is a **wrong
  implementation**, not merely a deletion.
- Mutation ids `12d-`, unique across all ten harnesses, ⚠ names with a matchable prefix **≥12
  chars**; fixtures on both sides. `components/` stays hook-free.
- ⚠ **You touch steps 5, 8 and 10's `LEDGER_FILES`.** Run each harness **serially, one at a time,
  never two at once, never kill one, and read the ANCHOR report — never take an exit status through
  a pipe** (a phase misread one that way and reported a tooling fail-open that does not exist).
- The browser measurements must stay green: **102 records**, and one panel sits **0.8 px** from its
  cap at 1600.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
for s in 05-collectors-serving-storage-safety 08-client-runtime 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done   # serially; read each anchor report
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never `pnpm verify` beside a harness; never
  poll with `pgrep`. No `.env`; `next-env.d.ts` byte-identical.
- **Do not edit `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` or `SERVING-MODES.md`** — record
  disagreements. **Invariant 7: if the spec is silent, STOP and record it.**

## 6. Deliverable

`pipeline/steps/12-deploy/12d-build.md`: the card's third form and why it reads as knowledge rather
than as a machine state; the per-subject exclusion and **the frozen branch with the test that pins
it**; the five renders quoted from real output; measurements; harness totals; every spec silence.
Short summary back. The parent will not read your transcript.

## 7. ⚠ Then the loop continues — this is a BUILD phase only

`12d` is not done when this is built. **test → adversarial → reconcile → parent review**, each a
fresh agent with a written handoff, the parent re-running `pnpm verify` itself and auditing the
adjudication before any commit. Owner's standing instruction; root `CLAUDE.md` records it.
