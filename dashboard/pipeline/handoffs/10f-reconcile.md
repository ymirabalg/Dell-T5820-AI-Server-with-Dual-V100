# Handoff — 10f, RECONCILE phase (background agent)

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10f-adversarial.md` (**10 findings — primary subject**),
`steps/10-panels-assembly/10f-test.md`, `steps/10-panels-assembly/10f-build.md`,
`handoffs/10f-degraded-fit.md` (the four rulings), `SPEC.md` §6.1 (all three ⚠ paragraphs), §6.2,
§6.4, §6.5, `HANDOVER.md` in full (you rewrite it), `steps/10-panels-assembly/10e-reconciliation.md`
(the model), `ANCHOR.md` §4/§5/§8/§9, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10f build + test + adversarial
notes, uncommitted. Ports 39173/39174 free — run the browser scripts yourself.

## 1. Verified by the parent

`pnpm verify` exit 0 (101 files, 2957) on the build tree; `row.tsx` deleted. Test phase: 2960 /
exit 0, harnesses 02 60 · 09 128 · 10 233, breakpoints 16/16, check-density unchanged (its claims,
reproduced by the adversarial). The adversarial's measurements (A1 +851/+851/+862 with table views
open; A2 compound +63/+71/+15; A3 1.3 px spare at 1600) are its claims — **re-measure A2 and A3
yourself**, they decide what goes to the owner.

## 2. What you must do

1. **Adjudicate `10f-A1…A10`**, each ACCEPTED / REJECTED / DEFERRED with a checkable reason.
2. **Apply what survives that is 10f's to fix**: A4 (six unguarded one-line reverts — ⚠ test +
   `10f-` mutation each, or a reasoned deferral naming the grader), A6 (distinct accessible names
   per well — the panel title is available; no invented copy beyond `<panel> messages`), A5 (correct
   the test phase's over-count in `10f-test.md`'s numbers with the measured 2-row figure, in place),
   and anything else that is a defect in 10f's own diff.
3. **Owner questions — record, do not rule** (HANDOVER §8, numbered `10f-Q*`, each with the
   measured number and what the code does today):
   - **A1** the table views: five visible, each `40vh` (SCOPE 2.5f's stopgap) — the §6.1 promise vs
     an open table view. Options the owner can pick from: one table open at a time; a table bounded
     to its panel's body; or the promise conceded while a table is open.
   - **A2** the banner is unbounded in §6.4 — cap the rows shown (`+N more`), a fixed-height
     scrolling banner, or concede.
   - **A3** 1.3 px at 1600 on the all-failed page with a two-alarm banner: is that acceptable margin?
   - **A7** the `tight` well shows 7.7 % of CPU's explanation and a wall panel has no pointer to
     scroll it — is a one-line well the right shape, or should `tight` be two lines?
   - **10e-Q2** the throttle line's +44 px per card remains unbounded.
   Do **not** widen the wells or cap the banner yourself: both are §6.1/§6.4 wording.
4. **Run**: `measure-breakpoints.mjs` (must be 16/16, exit 0), `measure-arrangements.mjs --fixture
   box --only baseline --anatomy --no-capture --json /tmp/density.json` + `check-density.mjs` (no
   `--oq`), then all nine `regressions.py` serially in ONE foreground call, then `pnpm verify` cold,
   then `git status`.
5. **Write `steps/10-panels-assembly/10f-reconciliation.md`** (table first) and **rewrite
   `HANDOVER.md`**: §0.0 = "10f closed pending parent review — §6.1 holds on healthy AND
   all-collectors-failed pages (measured); three unbounded terms remain and are the owner's: table
   views, banner, throttle line"; the §8 questions; §1 harness totals; a §0.10 with this loop's
   rules. Correct `ANCHOR.md` §2 only where a fact is now wrong.

## 3. Not yours (ANCHOR §8)

No commit. No `SPEC.md` / `MOCK.html` edits (quote wording you want). No claiming green — paste
exit codes. A REJECTED row names the refuting line or becomes DEFERRED with an owner.

## 4. Rules

`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
alongside a harness; harnesses serially, foreground, one call; ⚠ never poll with `pgrep`. New ids
`10f-`, unique across all harnesses. Close only browsers you launch; kill only `next dev` you started
(:8391/:8392 are the user's); no `.env`; `next-env.d.ts` byte-identical. Do not weaken a guard.

## 5. Report

Adjudication counts; what was fixed; your own A2/A3 numbers; breakpoints and density verdicts; nine
harness totals; `pnpm verify` exit code; the owner questions. The parent will not read your transcript.
