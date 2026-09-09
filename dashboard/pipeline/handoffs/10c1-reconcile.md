# Handoff — Step 10c-1, RECONCILE phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

⚠ Background subagent. `ANCHOR.md` §8 lists **four things the parent does not delegate** (§5) and
defines the **parent's review** as the phase that closes this. Read §8 first.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `SCOPE.md` → `10c1-build.md` →
`10c1-test.md` → `10c1-adversarial.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. 10c-1 uncommitted; all else at `be53c8d`.

## 1. The item

The first composed render: nine panels wired, `PanelPlaceholder` deleted, a shell-owned table
toggle, an alarm-forcing escape hatch. Adversarial raised **12 findings, 10 EXECUTED**. Adjudicate
**every one** with a reason, apply what survives, re-run, write the notes.

## 2. ⚠ Confirmed by the parent — two of these change what you would otherwise do

| | |
|---|---|
| **A7 — the test phase's CSS claim is WRONG, and I verified the inversion** | I ran a probe: `Object.keys(styles)` is `[]` (which is why its `console.log` printed `{}`) **but `styles.gpu0` returns `_gpu0_e75739`** — a real hashed name. Property access **works**. So `grid.test.tsx`'s tier-2 placement guard and the sticky-band assertion are **LIVE**. ⚠ **Acting on `10c1-test.md`'s claim would weaken guards 10a added to close F1.** Correct that document as a marked correction |
| **A8 — the real void, also verified** | `styles.zzzNoSuchRule` returns `_zzzNoSuchRule_e75739`. **Any key resolves, including one with no CSS rule** — so a deleted or misspelled rule is invisible. The adversarial found a live instance: `alarm-banner.tsx` uses `styles.item`, and `alarm-banner.module.css` declares no `.item` |
| green | `pnpm verify` exit **0**, 94 files, 2617 tests — parent |
| the production gate | I verified in the **built bundle** that the call bakes `"production"`. **A5 does not contradict that** — it says nothing *defends* it: change one token and the build bakes `"development"`. Both are true |

## 3. The centre: one defect shape, three sites, all green

**A1 / A2 / A11 are the same bug in three places**, and the adversarial applied four wrong edits at
once with `pnpm verify` **exit 0, 94 files, 2617 tests**:

- **A1** — §6.2's `gpu.index === serving.instance` join replaced by **array-position** indexing.
  Reachable, not hypothetical: `discoverInstances` returns the *sorted set* of instance indices
  whose `<i>.env` was found, so `serving: [{instance: 1}]` is a shape the collector is **designed
  to produce** — and positional lookup then prints instance 1's model on GPU 0's card. That is
  §6.2's named failure verbatim: *"prints the wrong model on a card rather than failing visibly."*
- **A2** — `gpuAt` has the identical hole; `nvidia-smi.ts` documents skipping a row whose index
  will not parse, so `gpus: [{index: 1}]` is real. GPU 0's panel would render GPU 1's die.
  ⚠ A hard-coded `=== 0` **is** caught; only positional escapes.
- **A11** — GPU 1's temperature trace can read GPU 0's card. **This is `10c-CO4`'s exact twin**:
  the test phase fixed cooling and stopped. The sibling-case rule this project keeps paying for.

⚠ **A10 explains why they all survived**, and it is the finding to act on hardest: `stateOfTwoGpus()`
**clones GPU 0 verbatim**, so the two cards are indistinguishable and a positional read is
observationally identical to an index read. A two-GPU helper existed and still hid three of four
edits. **A fixture whose two subjects are identical cannot discriminate between them.**

## 4. The rest

- **A3/A4** — two of the four shell toggle wirings are unasserted: GPU 1's slot fed `gpu0`'s state
  ships green, because both toggle tests use the one-GPU `stateOf()`, under which the `gpu1` cell
  has no `<svg>`, no button and no `table-view` — so the negative assertion **can never fail**.
  COOLING's wiring is green the same way. Same species as A10.
- **A5** — the escape hatch's gate rests on **one undefended token**. The adversarial built it and
  found `location.search,"development"` in the chunk. Judge whether a guard is warranted here or
  is 10c-2's (it is guard-shaped work).
- **A9** — the browser is **not** the only answer to the CSS question: binding is observable today,
  dangling references are statically checkable, only paint is 10c-3's. That sharpens 10c-3's scope
  rather than expanding this loop.
- ⚠ **A correction inside a correction:** the test phase's proposed `!==`→`===` demonstration does
  **not compile** (`TS2339`), so its stated justification was wrong while its finding was right.
  Record both.

**Could-not-break is substantial** — toggle state surviving a poll (now *dynamically* measured),
both-charts-flip, conditions/event-log/aggregate with two GPU subjects **genuinely covered at the
`lib/` layer** (so the single-GPU problem is confined to `components/panels/` and `app/`), grid
tiers 1–3, SVG ids, header exhaustiveness, invariant 2, the harness anchor guards. **Do not
re-spend budget there.**

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. Do not commit or stage. 2. Your green is not the green. 3. Do not edit `SPEC.md` — record spec
questions. 4. Nothing outside `dashboard/`; do not weaken `purity.test.ts`.

Invariant 7: if the spec is silent, **STOP and record it**.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py       # 159 mutations
```

⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**. ⚠ **Never
poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9). `git status` after each.
Re-run only the harnesses whose `LEDGER_FILES` you touch, and say which. New mutations **`10c-`**.

## 7. Deliverables

1. `steps/10-panels-assembly/10c1-reconciliation.md` — adjudication table with **all 12**, verdicts
   and reasons; what you applied; what you re-ran; gaps for the owner.
2. **Rewrite `pipeline/HANDOVER.md`** — every deferral with an owner. Add the A10 lesson: **a
   fixture whose two subjects are identical cannot discriminate between them.**
3. **Correct `10c1-test.md`'s CSS claim** as a marked correction — struck, not deleted.
4. Update `ANCHOR.md` §2.2 — after this, **10c-2** (guards) then **10c-3** (sizing/visual).

## 8. Report back

One line per finding with its verdict, what you applied, what you re-ran and its result, spec
questions handed up, anything left open.
