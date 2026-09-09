# Handoff — Step 10c-2, TEST phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10c2-build.md` (**your primary subject**), then `SCOPE.md`,
`HANDOVER.md` §0.3/§0.5/§0.6, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10c-2 uncommitted.

---

## 1. What 10c-2 built

Five guards: a **`toContain` lint**, a **cross-harness ledger runner**, a **dangling-CSS-class
audit**, an **L11 unit-suffix guard** (plus the `UNIT_*` constants it needed, placed in
`lib/format.ts` — deliberately not `lib/units.ts`, which already means *systemd* unit names), and
the **`exactOptionalPropertyTypes` finding**.

## 2. Verified by the parent

| | |
|---|---|
| `pnpm verify` exit **0**, **99 files, 2745 tests** (was 95 / 2627) | parent |
| **The handoff's premise on guard 5 was MINE and it was wrong** | `exactOptionalPropertyTypes: true` is in `tsconfig.json` at line 17 and has been since the first commit. My `tsc --noEmit --exactOptionalPropertyTypes` probe exited 0 **because it was already on**, not because enabling it was free. The build caught this and found two source comments still claiming it is off |
| The four guard files exist; `UNIT_*` constants are in `lib/format.ts` | parent |

## 3. ⚠ Highest priority: the lint catches only HALF the failures that motivated it

The `toContain` lint exists because that shape fooled four loops. Those four were:

| | assertion | shape |
|---|---|---|
| 10a | `toContain('paused')` | **a bare word**, satisfied by an unrelated `data-mode` attribute |
| 10a test | `toContain('refresh')` | **a bare word**, satisfied by a cadence-control label |
| 10b | `toContain('—')` | an em dash, satisfied by `Chip`'s null glyph |
| 10b-S-F | `toContain('data-severity="none"')` | a bare attribute |

The build's rule flags **a bare `data-severity="…"` or a bare em dash**, in panels importing
`PanelShell`. **On its face that catches the last two and misses the first two** — the two that are
bare *words*, which is the harder and arguably more common case.

**Establish this precisely.** Would the lint, as written, have caught `toContain('paused')` in
`header.test.tsx`? (Note `header.tsx` may not import `PanelShell` at all, which would exclude it
twice over.) Then judge: is a narrow, zero-false-positive guard that catches half the known cases
the **right** trade — a defensible position — or is it a guard whose *name* implies more than it
does, which is this project's most-repeated defect? **The build was asked to state what it cannot
catch; check that the statement matches reality.**

## 4. The rest

- **The 8 hits.** One was proven a genuine live bug by mutation (a CPU-panel row's severity could be
  wired wrong while `PanelShell`'s head chip masked it). **Are the other 7 real?** And were they
  *fixed* — scoped to the row they mean — or *silenced*? Read each diff.
- **The cross-harness runner found `lib/contract.test.ts` had gained a ⚠ mark** since Q1's
  measurement, and **caught its own sibling guard files as orphans**. Verify the union is
  re-derived, not hardcoded — Q1 rejected a hardcoded list as *"a check green over a subset of the
  real set."* Does it still pass if a tenth harness appears, or if a file leaves a ledger?
- **The dangling-class audit is clean on today's tree**, and two false positives were found *while
  building it*. A clean guard on a clean tree is exactly the case where a false **negative** hides.
  Introduce a dangling class and confirm it fires; check `:global()`, `composes`, and dynamic
  access are handled rather than merely mentioned.
- **The L11 guard required re-anchoring one of step 2's mutations.** ⚠ A re-anchored mutation can
  end up testing something narrower and the ledger will not notice. Read it against its original
  property.
- **Guards are code and their own branches need mutations** (HANDOVER §0.5) — including the branch
  where a guard finds nothing.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py      # 172
python3 pipeline/steps/02-format-severity/regressions.py      # if you touch its ledger files
python3 pipeline/steps/03-collectors-gpu-host/regressions.py  # 73
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; never two at once — **sequential
  foreground**. ⚠ **Never poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9).
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- Re-run only the harnesses whose `LEDGER_FILES` you touch, and say which and why.
- **Fixing IS in scope** — say what you changed and why.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 6. Deliverable

`steps/10-panels-assembly/10c2-test.md`, leading with §3's answer. Short summary after. End with
`pnpm verify`, the harness results, and `git status`.
