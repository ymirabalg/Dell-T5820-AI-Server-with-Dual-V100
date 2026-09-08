# Handoff — Q1: back-port step 9's ⚠-scanner into steps 2–8, then read the ledger

**Phase: BUILD.** Written by the parent session, 2026-09-07. You are a fresh agent with no
memory of this project. Read this file, then `pipeline/ANCHOR.md`, then
`pipeline/WORK-ITEMS.md` §10.1, then `pipeline/PLAN.md` §invariants. `SPEC.md` is authoritative
for behaviour but this item barely touches behaviour — it touches the *harnesses*.

---

## 1. The item, in one paragraph

Every step's `regressions.py` carries a **red-test ledger**: it applies each mutation, records
which test names vitest reports as `FAIL`, unions those sets, and fails the run if a test whose
name carries a `⚠` never reddened. The scanner that finds those ⚠ names uses a regex whose
`.each(…)` argument-list matcher is `[^\n]*` — it **stops at the first newline**. So a ⚠ name on
a **multi-line `test.each([...])(...)`** is invisible to the ledger: it is not counted as marked,
and nothing ever requires a mutation to redden it. Step 9's reconciliation found this and wrote a
corrected scanner. **Steps 2–8 all still carry the broken one.** Your job is to back-port the
corrected scanner into all seven, re-run all seven harnesses, and deal with what falls out.

**This is not a claim that any specific test is inert.** It is a claim that nobody knows, because
the mechanism built to answer the question could not see the tests. Expect real failures. That is
success, not a setback.

## 2. What the parent has ALREADY VERIFIED — do not re-litigate these

Stated so you spend your effort on the open part.

| Fact | How it was verified, 2026-09-07 |
|---|---|
| The tree is green | `pnpm verify` exit **0**, **67 files, 2210 tests, no type errors**, run by the parent on `dashboard-frontend` at `391d17f`, clean `git status` |
| Toolchain works | `node v24.16.0`, `pnpm 12.3.4`, with the PATH export in §4 below |
| The broken scanner is **textually identical** in all seven | `grep -n each */regressions.py` — same `MARKED` regex at 02:66, 03:75, 04:79, 05:93, 06:101, 07:143, 08:141, each followed by the same 12-line `marked_tests()` |
| `dashboard-backend` carries zero UI | `git ls-tree -r dashboard-backend -- dashboard/components` is empty; so is `steps/09-ui-primitives` |
| `main` now == `dashboard-backend` | fast-forward merge, `main` at `3f06e98`. Irrelevant to your work; noted so you are not confused by it |

The counts in `WORK-ITEMS.md` §10.1 (37 invisible marks, 21 of them in step 7) come from step 9's
reconciliation running its corrected scanner against each step's `LEDGER_FILES`. **The parent did
not independently re-derive them.** Treat them as a strong prior, not as verified fact — and if
your back-port produces different numbers, **your numbers win and you say so loudly.**

## 3. The work, in order

### 3.1 Back-port the scanner

Source of truth: `pipeline/steps/09-ui-primitives/regressions.py`. Copy **four things**, verbatim
where you can:

- `CALL` and `FIRST_STRING` regexes
- `_skip_balanced(text, i)` — paren-balanced, **string-aware and comment-aware**
- the rewritten `marked_tests()`

Delete the old `MARKED` regex from each file. Keep each step's own `LEDGER_FILES` — that list is
per-step and must not be touched.

⚠ **The comment-awareness is not decoration.** An apostrophe inside a `//` comment (`step 8's
runtime`) opens a string as far as a naive scanner is concerned and mis-parses everything after
it; the step 9 fixtures also contain a literal `'useState('`, an unbalanced paren inside a string.
Both of these are why the replacement is a hand-written scanner and not a cleverer regex. If you
find yourself writing a regex, you have taken a wrong turn.

⚠ **Do not "improve" the scanner while porting it.** Port it, get the seven steps onto one
identical implementation, *then* raise any improvement as a finding. A scanner that differs
between steps is the defect you are here to remove.

### 3.2 Re-run all seven harnesses and read the ledgers

Each `regressions.py` is run from `dashboard/` (its paths are relative to it, e.g.
`lib/format.test.ts`) and exits non-zero on any of: an anchor that moved, a mutation that did not
bite, or a ⚠ test no mutation reddens. **706 mutations across the seven** (55/72/92/127/63/125/172),
each spawning a vitest run — this is long. Run them in the background; see §4 for the rules.

### 3.3 Adjudicate every newly-exposed mark — this is the actual work

For each ⚠ test the corrected ledger now reports as unreddened, apply `PLAN.md` §5.2 rule 1:

- **give the test a body that matches its name** — the usual cause is a test that names a
  property it does not check, a defect class this project has hit in *every single step*; or
- **drop the `⚠` and record why** in your build notes, if the mark was aspirational and the
  standard, not the test, is what should give.

Never silence a ledger failure by adding a mutation aimed at making a specific test go red
without that mutation being a wrong implementation somebody would plausibly write. And a mutation
that reddens **probabilistically** is worse than none — the ledger cannot tell it from a sound one.

### 3.4 The rider defect

The corrected scanner prints `⚠ test name is unmatchably short` for `test.each` names whose first
`%` placeholder falls too early for the ledger's prefix match. §10.1 names four files:
`collect.test.ts`, `safety.test.ts`, `config.test.ts`, `wire.test.ts`. Fix by **moving the
placeholder later in the sentence** so a ≥12-character literal prefix survives. Confirm the real
list from your own run rather than trusting those four.

### 3.5 Also in scope, and easy to forget

**A6 / the step 3 retrofit:** step 3's harness has historically had no red-test ledger at all.
`WORK-ITEMS.md` §2 (A6) and §8.1 say the retrofit "paid for itself"; ANCHOR §7 folds it into Q1.
**Check whether step 3 actually has a ledger now** (it has `LEDGER_FILES` at line 73, which
suggests yes) and say plainly in your notes which it is. If it is already retrofitted, record
that A6 is closed and move on — do not invent work to justify the entry.

## 4. Rules that will bite you if you skip them

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0. Never a printed summary.
```

- **The `nvm` path must come first.** `$HOME/.local/bin/node` symlinks to `~/.hermes/node`
  (**v26.8.1**) and shadows the pin. Testing on 26 is a skew this project has removed twice.
- ⚠ **NEVER run `pnpm verify` concurrently with a `regressions.py` harness.** It produces a
  plausible false `TS6133` and a ledger that falsely reports ⚠ tests as uncovered. **Serially.**
  This includes two harnesses against each other — they mutate the same working tree.
- ⚠ **Never `sleep`-poll.** `until ! pgrep -f regressions.py` never exits: the pattern matches
  the waiting shell's own command line. Write `pgrep -f "regressions[.]py"`.
- **Integrity check.** A harness killed mid-run leaves a mutation stranded in a source file. The
  tree is committed, so `git status` / `git diff --stat` is the check — run it after every
  harness and before every `pnpm verify`. A dirty `lib/` file you did not intend to edit is a
  stranded mutation; `git checkout --` it.
- **Green is `pnpm verify` exit 0 on a clean tree**, verified after all seven harnesses are done.

## 5. Scope and boundaries

- Branch **`dashboard-frontend`**. Everything happens here, including the edits to steps 2–8's
  harnesses, which live in this branch's inherited history. Do not check out another branch.
- **Nothing outside `dashboard/` changes.**
- **Do not commit.** The parent commits, after running `pnpm verify` itself. Leave the tree
  dirty and describe it.
- **Do not edit `SPEC.md`.** Invariant 7 still binds: if the spec is silent on something you
  need, **STOP and record it** as a gap in your notes. The owner answers spec questions now;
  phases still never write spec wording.
- **`ai-server` is read-only to this work** and you almost certainly do not need it at all.
- Q2 (the hover layer and table view) is **not yours**. It gets its own loop.

## 6. What to write, and where

`pipeline/steps/Q1-ledger-scanner/build.md`, following the shape of
`steps/09-ui-primitives/` notes. It must contain:

1. **A before/after table**: per step, marks the old scanner saw, marks the new one sees, and the
   difference — **measured by you**, next to §10.1's predicted column, with any disagreement
   called out.
2. **Every newly-exposed unreddened ⚠ mark**, with what you did: body fixed (show the diff), mark
   dropped (say why), or already-backed-incidentally.
3. The unmatchably-short names you fixed.
4. The A6 / step-3-ledger answer from §3.5.
5. **Anything you could not settle**, stated as an open question rather than resolved by guess.
6. Final `pnpm verify` result and `git status` at handover.

## 7. Report back

A short summary: what changed, the before/after counts, how many marks turned out inert, what is
open. The parent has not read your transcript and never will — the summary is the whole handover.
