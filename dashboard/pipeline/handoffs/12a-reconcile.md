# Handoff — 12a, RECONCILE phase (background agent)

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12a-adversarial.md` (**10 findings — primary subject**),
`steps/12-deploy/12a-test.md`, `steps/12-deploy/12a-build.md`,
`handoffs/12a-visible-failure.md`, **`SPEC.md` §6.2's ⚠⚠ 2026-09-14 ruling, §9, §6.1**,
`INSTALL-SPEC.md` §11.4, `HANDOVER.md` in full (you rewrite it),
`steps/11-packaging/reconciliation.md` (the model), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`, tree dirty on `4a2f47a`.
⚠ **The box is LIVE.** Read it if you must; write nothing.

## 1. Verified by the parent

`pnpm verify` exit 0, **106 files, 3455 tests**; `shellcheck` clean; the `serve-llm.sh`
dry-run fix is in the tree with its reasoning. The adversarial ran four serial measurement runs and
left the tree byte-identical to what it inherited.

## 2. ⚠ The finding that governs this loop

**`12a-A1` — the two new measurement records print NO NUMBERS on a PASS**, because the printer is a
whitelist of eight detail keys and neither record's detail matches. So the 208.6 / 43.0 / 98.1 px
quoted as standing figures in `12a-test.md` §1.4 **do not appear in the green run at all** — they
were transcribed from the run where 15d had been deliberately broken.

**That is this harness's own rule, broken in the file that states it three times: a bare PASS is a
claim with no number behind it.** Fix the printer so a passing record prints what it measured, and
then **re-run and re-transcribe every standing figure from a green run** — including the build's
§3.4 header measurement. Any number in the notes that cannot be reproduced from a passing run is
to be struck, not re-justified.

## 3. Then, in order

- **`12a-A2` — §11.4's ninth arm and two behind it.** `${out##*RC=}` takes the **last** marker, so
  `RC=255` followed by `RC=0` scores ✓. Shell *command-not-found* (127/126) gets the production
  failure's message and a restart that cannot help. And `nvidia-smi -L >/dev/null` discards the
  list, so a container enumerating **zero** cards at exit 0 also scores the tick — which is
  precisely the `gpus: []` shape measurement 16 exists for. **Fix the parse to require exactly one
  marker, distinguish the exec failures, and assert the list is non-empty.** This is the fifth
  failing-open defect in this family; make the fix general if you can see how.
- **`12a-A3`** — the shim's absence fails loudly but names the wrong cause, because both harnesses
  pipe the spawned server's stderr and **never read it**. Fix the diagnosis and the latent
  full-buffer hang together.
- **`12a-A5`** — the unsatisfiable CSS rule is confirmed, dated (arrived one day after the
  attribute it targets moved) and is the **only** one in the tree across all 22 modules. Fix the
  rule, and **write the mirror guard**: `dangling-css-class.test.ts` catches a class with no rule;
  nothing catches a rule no element can satisfy. One finding and no noise is the argument for it.
- **`12a-A6`** — the "0…18 × 4 × 4 crossing" is two 2-D slices with `alarms` pinned at 0 and mode ×
  band never crossed. Make it a real crossing.
- **`12a-A7`/`A8`** — measurement 16 asserts co-presence where it claims containment, grades
  `gpus: []` rather than the mixed page its own `roomy` justification rests on, and its three fit
  rows are near-unfalsifiable because the row caps convert overflow into clipping. Address all
  three or say why not.
- **`12a-A9`** — **eleven one-line reverts stay green**, and four of them are covered by literally
  nothing: the shim's loud-refusal guard, both new measurements' terms, and both sibling scripts'
  `--dry-run` fixes. The last loop closed 48 of 48 this way; do the same and **report the count
  before and after**.

## 4. The parent's own item, for your report — do not edit the spec

**§9 row 1 defines the header dot as one reduction over each condition's `displaySeverity`**, and
after 12a the painted dot is no longer that. The choice is right; the **wording is the parent's**.
Quote in your report the sentence you would like §9 row 1 to become, and say what in the tree
would have to change if the parent instead ruled the other way.

## 5. Then

`pnpm verify` cold; `shellcheck dashboard.sh`; harnesses for everything you touch, **serially,
foreground, one at a time**; `measure-breakpoints.mjs` and the density pair. Then `git status`.

Write `steps/12-deploy/12a-reconciliation.md` (adjudication table first, and §2's re-transcribed
figures) and **rewrite `HANDOVER.md`**: §0.0 = 12a's state and whether the production failure is
now visible; §8 the open questions; §1 the totals; §0.15 this loop's rules — including the one it
earned: **a PASS that prints no number is a claim, and a number transcribed from a failed run is
not evidence.**

## 6. Not yours (ANCHOR §8)

No commit. No `SPEC.md` / `MOCK.html` / `INSTALL-SPEC.md` edits. No claiming green — paste exit
codes. A REJECTED row names the refuting line. ⚠ Never `git add`; never two harnesses at once;
never poll with `pgrep`.

## 7. Report

Adjudication counts; the re-transcribed standing figures; the revert sweep before and after; what
was fixed; your §9 wording proposal; exit codes; the owner questions. The parent will not read your
transcript.
