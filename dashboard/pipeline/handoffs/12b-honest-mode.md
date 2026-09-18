# Handoff — 12b BUILD: **the dashboard states the serving mode honestly.** Invert the join.

**Written by the parent, 2026-09-17.** Fresh agent, no memory of this project. Read: this file →
**`SPEC.md` §3.4's ⚠⚠ 2026-09-15 `gpus` ruling and its three-value table**, **§6.2's ⚠⚠ inverted-join
paragraph**, §4's contract, §6.5, §9 → **`SERVING-MODES.md` §4** (ruled) → `pipeline/HANDOVER.md`
§0.0, §0.15, §8 → `lib/types.ts`, `lib/collectors/serving.ts`, `lib/client/wire.ts`,
`components/panels/gpu-panel.tsx`, `components/panels/serving-panel.tsx`,
`lib/client/observations.ts` → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree clean at `f6f3101` plus the parent's
`SPEC.md` edit. ⚠ **The box is LIVE** — inference on 8080/8081, the dashboard on 8090. **Write
nothing to it.** You do not deploy.

## 1. Why this is a repair, not a feature

`gpu.index === serving.instance` is **not a fact about the system**. It is a coincidence of the one
serving arrangement that has ever run here: the unit template pins instance N to card N with
`CUDA_VISIBLE_DEVICES=%i`, and **nothing on §4's wire ever said so** — the spec already admitted
the dashboard could not verify it. A second arrangement (`SERVING-MODES.md`) does not break that
join; **it reveals there was never one.**

So: **an instance declares the cards it serves, and a card asks which instance lists it.** In
per-GPU mode that yields today's answer for a reason instead of by luck, and a mis-pinned instance
would show the **wrong card** rather than being invisible.

## 2. Build

1. **§4 gains `serving[].gpus: readonly number[] | null`**, read from the unit's own
   `CUDA_VISIBLE_DEVICES`. `lib/types.ts`, the collector, and `wire.ts`'s validation.
2. **The join inverts** in `observations.ts` / the panels: a card finds the instance whose `gpus`
   contains its index.
3. **The GPU card** says *served by instance N* when that instance lists this card alone, and names
   the joint arrangement when it lists more than one. ⚠ **An em dash there would be a lie** — the
   reading is not missing, it is different.
4. **The SERVING panel** shows one row per process, naming the cards it spans.
5. ⚠ **The three values are three different things** (§3.4's table): `[N]`, `[0,1]`, `null` (unit
   unreadable → em dash + the `errors[]` entry), and **absent** (an older server → fall back to the
   index join, silently, because a server without the field cannot be in split mode). **`null` and
   absent must not be collapsed.**
6. ⚠ **The mode must NEVER be inferred from the instance count.** One instance can also mean one
   card's service failed. If you need a mode word, derive it from the `gpus` arrays themselves.

## 3. The bar

- ⚠ **Additive on the wire**: the live box's snapshot has no `gpus` and must still validate and
  render exactly as it does today. **Prove that against the real endpoint's shape**, not a fixture
  you wrote to match your own change.
- **Render the acceptance, do not reason about it** — this project's rule, twice earned. All four
  shapes, both panels: `[0]`/`[1]`, `[0,1]`, `null`, absent.
- ⚠ **The browser measurements are working again** (81 records) and a changed served-by line changes
  panel height. Run them. `measurement 17` already sits **0.8 px** from a cap at 1600.
- Mutation ids `12b-`, unique across all harnesses, ⚠ names ≥12 matchable chars; fixtures both
  sides. `components/` stays hook-free. **A guard whose pass condition is "nothing found" must
  judge its own failure** — five of those have been found here.
- ⚠ **`serving.ts` is step 5's harness; `wire.ts` is step 8's; the panels are step 10's.** Run
  every harness whose `LEDGER_FILES` you touch, **serially, one at a time, never two at once, and
  never kill one.**

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never `pnpm verify` beside a harness; never
  poll with `pgrep`. No `.env`; `next-env.d.ts` byte-identical.
- **Do not edit `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` or `SERVING-MODES.md`.** Record
  disagreements. Invariant 7: if the spec is silent, STOP and record it.

## 5. Deliverable

`pipeline/steps/12-deploy/12b-build.md`: the wire change and its validation; where the join now
lives; what each of the four `gpus` shapes renders on both panels, **quoted from a real render**;
the older-server fallback and how you proved it does not regress; the measurements; harness totals;
every spec silence. Short summary back. The parent will not read your transcript.
