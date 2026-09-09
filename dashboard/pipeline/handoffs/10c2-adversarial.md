# Handoff — Step 10c-2, ADVERSARIAL phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10c2-build.md` and `10c2-test.md`, then `SCOPE.md`, `HANDOVER.md`
§0.3/§0.5/§0.6, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10c-2 uncommitted.

## ⚠ You fix NOTHING

Findings only. Concrete failure scenario each. Mark **EXECUTED** or **REASONED**.

---

## 1. What 10c-2 is

**Five guards**, all built because a mechanism here failed repeatedly: a `toContain` lint, a
cross-harness ledger runner, a dangling-CSS-class audit, an L11 unit-suffix guard plus its
`UNIT_*` constants, and a finding that `exactOptionalPropertyTypes` was **already on** (the
parent's handoff premise was wrong).

## 2. Settled — do not re-open

| | |
|---|---|
| `pnpm verify` exit **0**, **99 files, 2745 tests** | parent |
| **The lint catches 2 of the 4 founding failures, and the doc now SAYS so** | parent read it: *"it is TWO of the four founding failures, already realised, and this guard does not close them"*, and `'paused'`/`'refresh'` are excluded **twice over** — bare words match no dangerous-literal pattern, and `header.tsx` sits outside `components/panels/`. The build's doc had called this a hypothetical future shape while naming `'paused'` in the same sentence; the test phase corrected it |
| All 8 lint hits real and scoped, not silenced | test phase read every diff |
| The ledger union is genuinely re-derived | test phase proved it live by adding and removing a fake tenth harness |
| Step 2's re-anchored `02-R3` tests the same property | test phase |

## 3. Where I would look

### 3.1 ⚠ Is a half-guard worth having — and can the other half be caught at all?

The lint closes the two *attribute-shaped* founding failures and not the two *bare-word* ones. The
doc is honest about it now. **The open question is whether that is a good trade or a trap.**

A guard that catches half the known cases creates a place where a reader stops looking. Argue it
either way, but **do the constructive half**: is there a rule that catches `toContain('paused')`
without false positives? Candidates — an assertion whose literal appears in the rendered output
from **more than one source**; a `toContain` on a ⚠-marked test; a literal that is a substring of
an attribute *name or value* the component emits unconditionally. **If no such rule exists without
unacceptable noise, that is a finding worth stating** — it bounds what this project can mechanise
and tells the next reader to keep reading names against bodies.

### 3.2 The anti-vacuity checks

The test phase says it *"found and manually verified (not previously wired)"* that each guard's
finds-nothing safety net works, by breaking each file-walk. ⚠ **"Manually verified" is not
"guarded".** Is each anti-vacuity check now an actual assertion that runs in `pnpm verify`, with a
mutation behind it — or does it rest on that one manual demonstration? A guard whose own emptiness
check is unguarded is the exact recursion this loop exists to end.

### 3.3 The dangling-class audit's escape routes

It handles `:global()`, `composes` and dynamic access. What about a class assembled in a **template
literal**, via a helper, or through an object lookup? What about a class declared in CSS but never
used (the other direction — dead CSS)? And what does it do with a `.module.css` that has no `.tsx`
sibling, or a `.tsx` importing **two** stylesheets?

### 3.4 The unit-suffix guard's completeness

`UNIT_*` now lives in `lib/format.ts` (deliberately not `lib/units.ts`, which means *systemd* unit
names — check that reasoning holds). What stops a **new** unit being hard-coded — is the guard over
a fixed list of suffixes, which a new unit escapes by simply not being on it? That is the
blocklist-versus-allowlist problem `purity.test.ts` already solved once by matching a *shape*.

### 3.5 The cross-harness runner's edges

Proved re-derived. Now: a harness with a malformed or missing `LEDGER_FILES`; a ⚠-bearing test file
outside the directories it walks; a file listed in **two** ledgers; a ledger entry naming a file
that no longer exists.

### 3.6 Free hunting

Not limited to the above.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; never two at once — **sequential
  foreground**. ⚠ **Never poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9).
- Experiments are fine; **revert them, confirm with `git status`**, leave the tree exactly as found.
  ⚠ Note `lib/collectors/errors.ts` and `lib/format.ts` are legitimately dirty — the test phase
  confirmed they are intended edits, not stranded mutations. Do not "restore" them.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 5. Deliverable

`steps/10-panels-assembly/10c2-adversarial.md`: numbered findings, EXECUTED or REASONED, each with
a concrete failure scenario, plus **"what I attacked and could NOT break"**.

Report back a short summary. The parent will not read your transcript.
