# Handoff — 12c, RECONCILE phase (background agent)

**Written by the parent, 2026-09-18.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12c-adversarial.md` (**11 findings — primary subject**), `…/12c-test.md`,
`…/12c-build.md` (⚠ its §8.2 is **known wrong** — correct it), `handoffs/12c-named-instances.md`,
**`SPEC.md` §9 rows 1 and 2 (row 2 was amended 2026-09-18 — it is the rule A1 breaks), §3.4's two
2026-09-17 rulings, §4, §6.2, §6.4**, `HANDOVER.md` in full (you rewrite it),
`steps/12-deploy/12b-reconciliation.md` (the model), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`, tree dirty on `cb8a3c7`.
⚠ **The box is LIVE** — read it, write nothing, open no D-Bus connection you do not close.

## 1. ⚠ Two of the adversarial's claims, checked by the parent — one confirmed, one OVERSTATED

**`12c-A1` — CONFIRMED, and it is the governing finding.** The parent read it: the GPU panel calls
`servedBy(snapshot?.serving ?? null, index)` and **nothing tells it rows were refused**, so a row
dropped for a bad `port` yields `unserved`, rendered `served by · no instance` — under a comment
asserting *"every list was READ and none of them names this card"*, which is now false. It is the
retirement defect **one panel over**, and it contradicts the sentence the owner ratified into §9
row 2: *"the collection was read successfully and the client discarded part of it, which is not the
same as the server not reporting it."* ⚠ And `panelsForSource('llama-env')` is `['serving']`, so
**no `errors[]` entry can reach that card to explain it** — the honest `unknown` branch sits one
line away, untaken.

**`12c-A3` — ACCURATE IN KIND, OVERSTATED IN DEGREE. Do not inherit its numbers.** It says
`ring.test.ts`/`series.test.ts` run 2.3–4.3 s against a 5 s default, making `pnpm verify` itself
load-dependent. **Measured by the parent on an idle machine: both files together take 1.64 s and
the slowest single test is 406 ms — a ~12× margin, not a near-miss.** The underlying concern stands
and is worth closing — **24 ⚠ marks across five harnesses whose verdict is a wall-clock
measurement** is a real evidence-integrity problem — but **re-measure before quoting**, and say
under what load each figure was taken. A finding about flaky evidence must not itself rest on an
unrepeatable measurement.

## 2. Fix A1 at the seam, not at the call site

The build routed `servingRowsRefused` → `enumerationsRead` → `conditions.ts`. **The panel join was
left on the old path.** ⚠ **If you fix this by passing a second argument to `servedBy` at one call
site, you have patched the symptom** — the same shape that took three phases to close in 12b. Ask
what the join is actually missing (*"was this array complete?"*) and make that part of what it is
given, so a future caller cannot forget it.

Then: **A6** (one refused row freezes retirement for every *other* instance forever, keeping a
departed instance's alarm in the count at 20 minutes) is the same seam; expect one fix to close
both, and say so if it does not.

## 3. Then, in order

- **`12c-A2`** — the unit-name miss **is** a denial of service on escalation: two entries filed every
  poll forever, and with a stray `backup.env` present a **real bus outage emits no `source-lost`
  line at all**. Two mechanisms key on presence-of-a-source rather than on the event. Fix the
  masking; the "one stray file changes the header forever" half may be correct behaviour — say which.
- **`12c-A4`** — the refused row's `ErrorSource` was recorded as a spec silence and has **no test**:
  `'ufw'` moves the note to SAFETY and the suite stays green. Pin it, then the silence is a real
  question rather than an unguarded guess.
- **`12c-A5`** — `enumerationsRead`'s parameter **defaults the unsafe way** while its doc claims the
  opposite, reproducing the defect the build fixed. ⚠ A default that reintroduces a closed bug is
  worse than no default.
- **`12c-A7`** — `assertPortFree` returns "free" for a port that is bound but slow to answer, which
  is the exact occupant it exists to catch, and neither new guard has a behavioural test.
- **`12c-A8`** — `compareInstances` is **not a total order** and the join falls back to array
  position. The test phase asserted 24 permutations agree; that is consistent with a comparator
  that is merely *usually* consistent. Make it total, or state the tie-break.
- **Six one-line reverts stay green, two of them provably dead guards.** Close them and report the
  count before and after.
- **Correct `12c-build.md` §8.2** and anything else in the notes that repeats it.

## 4. Then

`pnpm verify` cold; the five harnesses **serially, one at a time**, ⚠ **reading the anchor report,
never the exit status through a pipe**; `measure-breakpoints.mjs` and the density pair. Then
`git status`.

Write `steps/12-deploy/12c-reconciliation.md` (adjudication table first) and **rewrite
`HANDOVER.md`**: §0.0 = 12c's state and whether a refused row can still erase a reading anywhere;
§8 the open questions; §1 the totals; §0.17 this loop's rules — including the one it earned twice:
**a shortened array means two different things, and every reader of one must be told which.**

## 5. Not yours

No commit. No spec edits — quote wording you want. No claiming green: paste exit codes. ⚠ Never
`git add`; never two harnesses at once; never poll with `pgrep`.

## 6. Report

Adjudication counts; how A1 was closed **and at which seam**; your re-measured A3 figures with the
load stated; the revert sweep before and after; exit codes; the owner questions. The parent will
not read your transcript.
