# Handoff — 12d, TEST phase

**Written by the parent, 2026-09-22.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12d-build.md` (**your primary subject**), `handoffs/12d-partial-reads.md`,
**`SPEC.md` §3.4's ⚠⚠ 2026-09-22 card-form ruling and §9 row 2's ⚠⚠ 2026-09-22 retirement ruling**,
then §4, §6.2, §6.4, §9 row 1, then `HANDOVER.md` §0.0, §0.17, §5, §8, then
`steps/12-deploy/12c-reconciliation.md` (the seam 12d builds on), then `lib/client/wire.ts`,
`lib/client/observations.ts`, `lib/conditions.ts`, `components/panels/gpu-panel.tsx`, then
`ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. **Tree dirty: 12d's build, on `9fcff77`** —
15 modified, 1 untracked (`12d-build.md`). The parent confirmed nothing is staged and no spec file
is touched.
⚠ **The box is LIVE** — inference on 8080/8081, the dashboard on 8090. Read it; write nothing. You
do not deploy.

## 1. Verified by the parent

`git status` matches the build's claim exactly: 15 modified, 1 untracked, nothing staged,
`next-env.d.ts` byte-identical, no `SPEC.md`/`MOCK.html`/`INSTALL-SPEC.md`/`SERVING-MODES.md` edit.
**The build's numbers themselves are NOT yet re-run by the parent** — that is partly your job.

## 2. ⚠ Priorities, in order

1. ⚠⚠ **THE HARNESS THE BUILD DECIDED NOT TO RUN.** The build ran **04/08/10**, derived by
   intersecting each `regressions.py`'s `LEDGER_FILES` with the dirty files — correcting the
   handoff's predicted 05/08/10. **That derivation is probably right and its conclusion is still
   unsafe.** The build states step **02 mutates `lib/conditions.ts`**, a file this loop changed
   heavily, and skipped it because step 02's *ledger files* are clean — resting on an anchor census
   that proves every anchor still matches **exactly once**. ⚠ **An anchor that still matches is not
   a mutation that still bites.** `observePoll`'s enumeration check went from one line to three; a
   step-02 mutation aimed at the old single line can match, apply, and be caught by nothing — which
   is `DID NOT BITE`, the failure the census cannot see. **Settle this by running step 02 and any
   other of the ten whose MUTATIONS (not ledger files) touch `lib/conditions.ts`,
   `lib/client/wire.ts`, `lib/client/observations.ts` or `components/panels/gpu-panel.tsx`.** If
   they are all clean, say so plainly so nobody re-hunts it. If one is not, it outranks everything
   else in this file.
2. ⚠⚠ **The member-vs-subject conflation is the loop's stated risk and it hides in fixtures.** The
   build says an exclusion compared against `subject` "looks exactly like the correct implementation
   on every GPU fixture in the tree", and that `12d-C1` catches it via a fixture whose subject and
   member deliberately disagree. **Verify that disagreement is real and load-bearing** — read the
   fixture, not the test name. Then go further: `ConditionObservation.enumeration` became a pair for
   **every** enumeration, not only `serving`. **Check every `push` site states the right member**,
   and prove **GPU retirement still works** — a wrong member on the `gpus` enumeration freezes or
   retires GPU conditions and no `12d-` mutation is aimed there.
3. ⚠ **The frozen branch, attacked rather than confirmed.** Four tests with twins, and
   `12d-O1` as the wrong implementation. **Find the fifth way it can be optimised away** — e.g. an
   anonymous refusal arriving in a poll AFTER the enumeration was already read clean, a snapshot
   where `serving` is `partial` with `refused: []`, or a refusal list mixing `null` with an identity
   that is the empty string. ⚠ **`''` and `null` are different identities and one of them is
   falsy** — check the code distinguishes them by `=== null`, not by truthiness, and fixture it.
4. ⚠ **`12d-O6` reddens exactly ONE test, and the build flagged it itself.** Decide whether that is
   narrow-by-construction or under-tested, and **fix it if a second honest assertion exists**. The
   precedence it encodes (`incomplete` wins over an unreadable `gpus`) is `12d-Q1`, a spec silence —
   so the test must pin the *choice*, with its twin, not merely the current output.
5. **The five renders must be the validator's own output, not a fixture's.** The build says
   `servingReadCases()` builds five raw JSON snapshots through the real `parseSnapshot`. **Confirm
   that path has no fixture shortcut**, and confirm the five differ from `complete` in exactly one
   field each as claimed. ⚠ **The build asserts the two partial renders are deliberately EQUAL.**
   That assertion is the one most able to hide a defect — satisfy yourself it pins the ruling rather
   than papering over a branch that never ran, and check both partials arrive by genuinely different
   code paths.
6. **The em dash and the new form, distinguishable in the DOM and to a screen reader.** The build
   added **no** `data-` attribute, arguing the announced text is the distinction. Test the claim as
   stated: assert on what a reader announces, and confirm nothing else on either panel renders the
   literal `list not fully read` by accident.
7. **`EnumerationsRead`'s three states** — absent key / empty set / member held — are §3.1's
   `null` ≠ `[]` one level in. Fixture all three in **both** directions at every layer that reads
   the map, and confirm no call site treats a missing key as an empty one.
8. **`12d-Q5`, the duplicate identity.** A server sending instance `0` twice — one valid, one
   refused — puts `0` in the exclusion set while a good row for `0` is on the page. The build chose
   *held back anyway*. **Fixture the poll AFTER the good row disappears**, which is where it bites,
   and confirm the conservative direction is what actually happens rather than what was intended.
9. **Sweep for the inert mutation.** 12c had five, three for this project's recurring reason — a
   fixture whose two candidate answers coincide. The build's own anti-coincidence measure is that
   instance `'7'` serves card 1. **Check it holds everywhere**, including in `lib/conditions.test.ts`
   where subject and member must also disagree, and in the `retired`/`stale` pair.
10. Test names read against their bodies; the `toContain` shape; entropy or clocks; ⚠ names with a
    matchable prefix **≥12 chars**; **a guard whose pass condition is "nothing found" judging its
    own failure** (six instances in this project); every `retired === []` paired with a `stale` list
    named in full.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
# the harnesses 12d touches — SERIALLY, one at a time, and read each ANCHOR report
for s in 04-collector-cooling 08-client-runtime 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done
# plus whatever priority 1 turns up
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness. ⚠ **Never capture a harness's exit
  status through a pipe** — `… | tail` yields *tail's* status, and a phase misread one that way and
  reported a fail-open that does not exist.
- **Fixing IS in scope.** Fix in the FIXTURE, never by weakening an assertion.
- **Do not edit `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` or `SERVING-MODES.md`** — record
  disagreements. **Invariant 7: if the spec is silent, STOP and record it.** Do not deploy.

## 4. Deliverable

`steps/12-deploy/12d-test.md`, leading with §2 in order and settling priority 1 first. Short summary
back. End with `pnpm verify`, every harness result **with its anchor report**, the measurements
(102 records; `gpu0` 0.8 px from its cap at 1600), and `git status`.
**The parent will not read your transcript.**
