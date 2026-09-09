# Handoff — Step 10c-2, RECONCILE phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

⚠ Background subagent. `ANCHOR.md` §8 lists **four things the parent does not delegate** (§4) and
defines the **parent's review** as the phase that closes this. Read §8 first.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `SCOPE.md` → `10c2-build.md` →
`10c2-test.md` → `10c2-adversarial.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. 10c-2 uncommitted; all else at `a0c2c0e`.

## 1. The item

Five guards. Adversarial raised **11 findings, 9 EXECUTED**. Adjudicate **every one** with a
reason, apply what survives, re-run, write the notes.

## 2. ⚠ Confirmed by the parent

| | |
|---|---|
| **F8 — the ledger guard is INVERTED** | `cross-harness-ledger.test.ts:262` is `expect(orphans.length).toBeGreaterThan(0)`. Its comment says it exists so *"zero orphans is not silently satisfying every `test.each` above"* — but the effect is that **the guard goes RED the moment the project reaches zero orphans.** Fixing the last orphan breaks the suite. Note lines 246–248 already assert the scanned sets are non-empty, which is the honest anti-vacuity check |
| **F1 — the `EM_DASH` bypass is live** | `components/sparkline.test.tsx:217` is `expect(nullTooltip).toContain(EM_DASH)`. The lint's `literalContent` returns `null` for a constant, so it is **bypassed and not even reported** |
| green | `pnpm verify` exit **0**, 99 files, 2745 tests — parent |

## 3. The centre

### 3.1 F8 — a guard that fails when the project succeeds

This is the worst shape a guard can have: it punishes the fix. **One orphan (`lib/throttle.test.ts`)
stands between today's green suite and a red one.** The adversarial demonstrated it live with a
throwaway tenth harness (`expected 0 to be greater than 0`).

The anti-vacuity intent is right and the implementation is backwards. Assert the **inputs** are
non-empty (files scanned, harnesses found, union size) — which §246–248 already do — not that the
**output** is non-empty. Fix it, and check the other four guards for the same inversion:
per the adversarial, `dangling-css`'s is `> 0` of 18, which an 18→1 narrowing passes silently.

### 3.2 F7 — the documented bound is wrong, and the correction is constructive

The build and the guard's doc say the bare-word case cannot be mechanised. **The adversarial
measured otherwise**, overriding `toContain` across 454 calls in 27 files: the rule *"the needle
occurs **more than once** in the subject"* catches **all four founding failures** — `'paused'`
occurs 2× in a paused header (`data-mode` + the visible label), `'refresh'` 3× in every header
render, and both em-dash shapes ≥2.

Measured cost: **43/454 false positives (9.5 %)**, 7 already covered by the `"throwing"` exemption,
leaving 36 — an order of magnitude below the 198 the build rejected. And several of the 36 look
like **latent instances of the very trap this guard exists for** (`safety-panel`'s `'ufw'`,
`'pwm5'`, `'fan service'` each ×2; `storage-network`'s `'eno1'` ×4).

**The verdict to adjudicate:** the build's *scope* call stands — no **source lint** can do this —
but *"cannot be mechanised"* is false; it is mechanisable **in a matcher**, at ~9.5 % adjudication
cost. **At minimum the doc's bound must be corrected** (this project's most-repeated defect is a
mechanism whose description overstates it, and that is exactly what the test phase caught in this
same file one phase ago). Whether to **build** the matcher is yours: if it belongs to a later loop,
say which and why, and record the measured numbers so nobody re-derives them.

## 4. The rest

- **F1** — the `EM_DASH`/hoisted-constant bypass. ⚠ **The sharper half:** the sibling guard in this
  same loop *counts* what it cannot read (`dynamicAccessCount`, citing Q1's rule); this one drops it
  **in silence**. Today's tree would pass a strict "unreadable == 0" assertion for free.
- **F3** — the L11 guard **cannot see JSX text**: `<td>{cooling.fan2Rpm} RPM</td>` yields nothing.
  Also escapes `` `${n} RPM (fan 5)` ``, `` `${n} RPM.` `` and `` `${pct}%` `` — the commonest
  spelling of percent. ⚠ `10c-G4` uses the *template* form, so **the ledger never exercises the JSX
  path**.
- **F4** — the suffix membership list is **hand-typed**, despite the doc's *"never a hand-typed copy
  that could drift"*. `Object.keys(format).filter(k => k.startsWith('UNIT_'))` is the shape-derived
  fix `purity.test.ts` already used. A doc contradicting its code, again.
- **F5** — both walking guards scan **`.tsx` only**; 19 `.ts` files sit under the scan roots,
  including `condition-lookup.ts` (whose own doc says values are *"already formatted
  (`'4,308 RPM'`)"*) and `panel-chart.ts`, which imports `lib/format` and builds tick labels.
- **F6** — a **double-quoted** CSS-module import silently removes a file from the audit (`[]`, not
  an error). 18/18 coverage today, so a proportional assertion is free.
- **F9** — `ledgerFilesOf` drops entries on a `#` comment inside `LEDGER_FILES`. Latent across all
  nine, safe direction, but a maximally confusing failure.
- **F11** — "exactly one ⚠ per file" is inaccurate: 12 ⚠ marks sit on `describe` blocks that
  `marked_tests()` cannot read. Pre-existing practice in 20+ files; judge as documentation
  precision.

**Could-not-break is substantial** — the ledger union re-derivation, `codeOnly` blinding on all
four guards, ⚠-mark forging, every `declaredClasses` selector shape, two-stylesheet files, the
composite-panel walk. **Do not re-spend budget there.**

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. Do not commit or stage. 2. Your green is not the green. 3. Do not edit `SPEC.md`. 4. Nothing
outside `dashboard/`; do not weaken `purity.test.ts`.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py
```

⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**. ⚠ **Never
poll** (ANCHOR §9). `git status` after each. Re-run only the harnesses whose `LEDGER_FILES` you
touch, and say which. New mutations **`10c-`**. ⚠ `lib/collectors/errors.ts` and `lib/format.ts`
are **legitimately dirty** — intended edits, not stranded mutations.

## 7. Deliverables

1. `steps/10-panels-assembly/10c2-reconciliation.md` — all 11, verdicts and reasons.
2. **Rewrite `pipeline/HANDOVER.md`** — every deferral with an owner, and F7's **measured numbers**
   so they are not re-derived.
3. **Correct the guard docs where a finding shows they overstate** — marked corrections.
4. Update `ANCHOR.md` §2.2 — **10c-3** is next and step 10 closes with it.

## 8. Report back

One line per finding with its verdict, what you applied, what you re-ran, gaps handed up.
