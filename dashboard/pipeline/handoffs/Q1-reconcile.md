# Handoff — Q1, RECONCILE phase

**Written by the parent, 2026-09-07.** You are a fresh agent with no memory of this project.

⚠ **You are the first reconcile phase to run as a background subagent rather than as the parent
itself.** That change is recorded in `ANCHOR.md` §8, and §8 also lists **four things the parent
did NOT delegate**. Read §8 before you start; the four are restated in §5 below and they are
binding.

Read, in order: this file → `pipeline/ANCHOR.md` (§4, §5, §8, §9) → `pipeline/PLAN.md` →
`pipeline/steps/Q1-ledger-scanner/build.md` → `test.md` → `adversarial.md`.

Branch `dashboard-frontend`, working directory `dashboard/`. Tree intentionally dirty: 12
modified files, 4 untracked paths.

---

## 1. The item

Steps 2–8's `regressions.py` each run a **red-test ledger**: apply every mutation, record which
tests vitest reports `FAIL`, fail the run if a `⚠`-marked test never reddened. Its ⚠-name scanner
used a regex that could not span a newline, so ⚠ names on multi-line `test.each([...])(...)` were
**invisible — uncounted, never required to redden.** The ledger reported success over a set
smaller than the real one. Q1 back-ported step 9's corrected scanner into all seven.

Build: 37 marks surfaced, 35 already backed, 5 unbacked in step 7 → new mutations `S11`, `K8`,
`W19`, one mark backed incidentally, one ⚠ dropped. Four names reworded. Test: verified all three
mutations by hand; fixed one rename that had become broken English; confirmed the drop.
Adversarial: **seven findings**, listed in `adversarial.md`.

## 2. Your job

Adjudicate **every** adversarial finding **ACCEPTED / REJECTED / DEFERRED, with a reason**, apply
what survives, re-run what the changes touch, and write the notes. This project's history says a
later phase overruling an earlier one on measurement is normal and correct — including a
reconciliation overruling its own review. Do not defer to `adversarial.md` because it is
confident; check it. It has been wrong before, and so has the parent.

### What the parent has already spot-checked — F1 and F2 are REAL, not claims

| | |
|---|---|
| **F1** | `test.each<[...]>(` generic syntax confirmed at `lib/auth/login-view.test.ts:78` and `:110`. `CALL`'s `(?:test\|it)(\.each)?\s*\(` cannot span the `<…>`, so the call is never matched |
| **F2** | The ⚠ name is **character-identical** in `lib/collectors/http.test.ts:202` and `lib/collectors/io.test.ts:260`, both in step 5's `LEDGER_FILES` |
| green | `pnpm verify` exit **0**, 67 files, 2210 tests, no type errors — run by the parent after the test phase |
| step 7 ledger | **parent's own re-run**: 128 mutations all bit, every ⚠ mark reddened, exit 0 |
| tree | byte-identical to what the test phase left; adversarial changed nothing |

### ⚠ F1 has a consequence that reaches beyond steps 2–8

**Step 9's scanner — the donor — has the same blind spot.** So a fix here is a fix to **all eight**
harnesses, not seven, and step 9's own ledger has been under-counting too. Also: F1 makes the true
invisible-mark total **39, not 37**, and step 7's **23, not 21**. `build.md`'s table and
`WORK-ITEMS.md` §10.1 both record the old numbers. **Correct them where they are recorded**, and
say plainly in your notes that §10.1's prediction was matched by the build only because both the
old and new scanners shared this second blind spot. That is a more interesting result than "the
prediction was right" and it should not be quietly smoothed over.

### Judgement calls that are genuinely yours

- **F3** proposes a *diagnostic* (warn on a ⚠ the scanner cannot match) rather than a parser
  extension. The parent's view — argue with it if you disagree — is that a diagnostic is the right
  shape, because parsing template literals reintroduces interpolation risk into eight harnesses at
  once, while a warning cannot break a passing run. Note F3's own caveat: a naive implementation
  prints false positives on English prose containing `it (`, so it must suppress in-comment
  matches.
- **F2** is a live inertness risk, not a hypothetical: `H8` could be dropped or re-aimed and the
  ledger would stay green over an inert mark. Renaming one of the two duplicate tests is the
  obvious fix; satisfy yourself it is also the *right* one.
- **F5** (`S11` mutation id collides with the open `S11/G5` work-item id) is cheap to fix and
  `ANCHOR.md` §7 already warns the `S*` namespace is polluted. **F6** (an anchor matching twice
  where `U6` claims "both guards") is a correctness bug in a mutation and looks more serious than
  its position in the list suggests. **F4** and **F7** are smaller; adjudicate them honestly
  rather than accepting them to be thorough.

**Rejecting is a legitimate outcome and needs the same quality of reason as accepting.** The
parent audits rejections specifically, because accepting a fix leaves a visible diff and rejecting
one leaves nothing.

## 3. Re-running

Any harness whose scanner or mutations you touch must be re-run to completion, and **a scanner fix
touches all eight**. That is ~770 mutations if you re-run everything; budget for it and run them
**strictly one at a time**.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0, never a printed summary
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ **Never** run `pnpm verify` alongside a harness, and never two harnesses at once. They mutate
  one working tree.
- ⚠ **Never** sleep-poll `pgrep -f regressions.py` — the pattern matches your own shell. Use
  `pgrep -f "regressions[.]py"`.
- After every harness: `git status` for a stranded mutation in `lib/`; `git checkout --` it. A
  stranded mutation makes a later `pnpm verify` lie.

## 4. Deliverables

1. `pipeline/steps/Q1-ledger-scanner/reconciliation.md` — an adjudication table with **every one of
   F1–F7**, its verdict, and its reason; what you applied; what you re-ran and the result; and a
   "new gaps for the owner" section if any.
2. **Rewrite `pipeline/HANDOVER.md`** — it is the authoritative list of open obligations and each
   reconciliation rewrites it. It has been found stale in the safe direction three times, so
   re-check entries against `SPEC.md` rather than copying them forward.
3. **Correct the recorded numbers** per §2 above: `build.md`'s table and `WORK-ITEMS.md` §10.1.
4. **`ANCHOR.md` §7 and §2.2 currently list A6 (step 3's ledger retrofit) as open work folded into
   Q1. It is not open — it was done during step 8, and the build phase confirmed it.** Correct
   that. Update §2.2's "what to do next" so it points at what actually remains: **Q2** (§6.2's
   hover layer and table view), then step 10.

## 5. ⚠ The four things you must NOT do — ANCHOR §8

1. **Do not commit or stage anything.** The parent commits, after running `pnpm verify` itself.
   Leave the tree dirty and describe it.
2. **Do not treat your own `pnpm verify` as the green.** Run it — you need it to know your work
   holds — but the parent re-runs it independently. An agent has claimed green on a failing tree
   in this project; that is why the rule exists.
3. **Do not edit `SPEC.md`.** Phases record gaps; the owner writes wording. If a finding needs a
   spec change, say so in your notes.
4. **Nothing outside `dashboard/` changes.**

Invariant 7 still binds: **if the spec is silent, STOP and record it.** Do not invent.

## 6. Report back

A short summary: the verdict on each of F1–F7 in one line each, what you applied, what you
re-ran and its result, the corrected numbers, and anything you left open. The parent has not read
your transcript and never will.
