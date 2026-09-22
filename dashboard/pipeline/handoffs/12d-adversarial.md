# Handoff — 12d, ADVERSARIAL phase

**Written by the parent, 2026-09-22.** Fresh agent, clean context, no memory of this project.
Read this file, then `steps/12-deploy/12d-build.md` and `steps/12-deploy/12d-test.md` (**your two
subjects**), `handoffs/12d-partial-reads.md`, **`SPEC.md` §3.4's ⚠⚠ 2026-09-22 card-form ruling and
§9 row 2's ⚠⚠ 2026-09-22 retirement ruling** — read those two in the spec itself, not as quoted by a
phase note — then §4, §6.2, §6.4, §9 row 1, `HANDOVER.md` §0.0, §0.17, §5, §8,
`steps/12-deploy/12c-reconciliation.md`, and the source: `lib/client/wire.ts`,
`lib/client/observations.ts`, `lib/conditions.ts`, `components/panels/gpu-panel.tsx`.

Branch `dashboard-frontend`, working dir `dashboard/`. **Tree dirty: 12d's build + test, on
`9fcff77`** — 15 modified, 3 untracked.
⚠ **The box is LIVE** — inference on 8080/8081, the dashboard on 8090. Read it; write nothing.

## 1. ⚠⚠ YOUR JOB IS TO BREAK IT, AND TO FIX NOTHING

**Every finding needs a concrete failure scenario and how you PROVED it** — an input, a sequence, a
render, a measurement. A finding without one is an opinion and will be rejected by the
reconciliation. **You fix nothing**: no source edit, no test edit, no fixture edit. Write findings.

You may add throwaway probe scripts under `/tmp` and run them. Nothing under the repo.

⚠ **Every loop in this project has found something here that the build and the test phase both
missed**, and several were the difference between a thing that worked and a thing that only looked
like it did. Assume that is true again.

## 2. Two phases have already passed. Here is what they did NOT settle

The test phase left three things open by name. **They are your starting point, not your scope.**

1. ⚠ **A mis-citation in three places.** The build justifies its wording with *"§3.4 says keep it
   short"* and *"§6.4 forbids prose in a value slot"*, and a comment in `gpu-panel.tsx` attributes
   the first to §3.4. **The test phase reports neither phrase is in `SPEC.md`** — both come from the
   parent's own build handoff. **Verify that independently** (the test phase could be wrong in
   either direction), establish how far the contamination goes, and judge whether the *constraint*
   survives without the citation. A rule this project follows on a citation it cannot find is a rule
   nobody ruled.
2. **`{read:'partial', refused: []}` is expressible and incoherent** — it would tell the ledger
   *fully read* and the card *incomplete*. The test phase says it is unreachable through
   `servingEnumeration`. **Try to reach it anyway**, by any path a real snapshot can take, and if it
   is genuinely unreachable say whether the type should still forbid it.
3. **The GPU enumeration's `member` is claimed "inert by construction"** — `gpus` holds nothing back,
   so a wrong member there supposedly cannot bite. The test phase concluded no mutation should guard
   it. ⚠ **That is a "nothing can go wrong here" claim guarding a silent, dangerous-direction
   failure, which is this project's most expensive recurring shape.** Attack it: find the future or
   present path where `gpus` DOES hold something back, or prove the inertness from the code.

## 3. ⚠ Where to hunt

- ⚠⚠ **THE SAFETY PROPERTY: can an alarm still be deleted?** That is what §9 row 2 exists to
  prevent and what 12c was measured getting wrong. **Construct a poll sequence that takes a genuine
  `alarm` out of the ledger, the dot and the count** through the new per-subject path. Try: an
  identity that parses to a *different* string than the condition's member; a refusal whose identity
  matches nothing; an enumeration read clean on poll N and partial on N+1 and clean on N+2; a
  subject appearing in two enumerations.
- ⚠ **THE OPPOSITE FAILURE, which the ruling created.** A permanently malformed row protects its
  identity **forever**. The 12c defect being fixed was an alarm stuck in the count indefinitely; for
  one subject, this fix reproduces it by design. **Establish whether that is bounded anywhere** —
  and if it is not, whether §9's ruling anticipated it. That may be a spec question rather than a
  defect, and saying which is your call to make.
- **Does the built thing satisfy the RULINGS, or only the handoff's summary of them?** Read both
  rulings in `SPEC.md` directly. §3.4 requires the card's form be *a statement about our knowledge,
  not about the machine, and it must read that way* — judge `list not fully read` against that
  sentence, not against the build's defence of it.
- ⚠ **The no-attribute accessibility decision.** The build added no `data-` attribute, arguing the
  announced text is the distinction and an attribute would be inaudible. **Test the whole claim**:
  what a screen reader actually announces for `—` in this markup, whether `served by` + four words
  parses as an answer or as a fragment, and whether the DOM half of the bar is met by text alone.
- **The precedence choice (`12d-Q1`, `incomplete` wins).** A spec silence decided by the build.
  Argue the other side properly and see if the built side survives it.
- ⚠ **The two partial renders are asserted EQUAL.** Find the case where they must differ, or prove
  none exists.
- **The Set→Map migration touched ~30 call sites in `lib/conditions.test.ts`, driven by the
  compiler.** A compiler-driven migration makes every site compile; it does not make every site
  still *mean* what it meant. **Sample them and find the one whose assertion silently weakened.**
- **The three new tests and five assertion additions the TEST phase wrote are themselves unreviewed
  by anyone.** They get the same scrutiny as the build's.
- **The recurring traps, each with six-plus instances here:** a guard whose pass condition is
  "nothing found" passing hardest when it cannot look; a fixture whose two candidate answers
  coincide; a ⚠ test whose mutation is a deletion rather than a wrong implementation; a measurement
  that passes vacuously.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
# the four exposed harnesses — SERIALLY, one at a time, read each ANCHOR report
for s in 02-conditions-severity 04-collector-cooling 08-client-runtime 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
```

⚠ Check step 02's directory name before using it above — the test phase names four exposed
harnesses (02, 04, 08, 10); confirm the path rather than trusting this line.

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness. ⚠ **Never capture a harness's exit
  status through a pipe.**
- **Do not edit any file in the repo.** Not source, not tests, not spec. Findings only.
- Do not deploy. Do not contact the box except to read.

## 5. Deliverable

`steps/12-deploy/12d-adversarial.md`: every finding numbered, each with **severity, a concrete
failure scenario, and how you proved it**, ordered worst first. Say plainly which of §2's three you
confirmed, refuted, or could not settle. A short summary back — the parent will not read your
transcript.

⚠ **If you find nothing serious, say so plainly rather than padding.** A phase that reports six
cosmetic findings and misses the one that matters is worse than one that reports nothing.
