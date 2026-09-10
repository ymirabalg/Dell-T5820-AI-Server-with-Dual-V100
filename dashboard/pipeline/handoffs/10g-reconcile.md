# Handoff — 10g, RECONCILE phase (background agent)

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10g-adversarial.md` (**10 findings — primary subject**),
`steps/10-panels-assembly/10g-test.md`, `steps/10-panels-assembly/10g-build.md`,
`handoffs/10g-bounded-terms.md`, `SPEC.md` §6.1 (⚠⚠ **the new 2026-09-10 grid-bounding paragraph
comes first and changes what matters**), §6.4's two ⚠ banner paragraphs, §3.4's `model` ruling,
`HANDOVER.md` in full (you rewrite it), `steps/10-panels-assembly/10f-reconciliation.md` (the
model), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10g build + test + adversarial,
uncommitted on `5769522`, plus the parent's `SPEC.md`/`WORK-ITEMS.md` edits. Ports free
(:8391/:8392 are the user's).

## 1. ⚠ The owner has already ruled on A1, A6 and the `model` term — do not adjudicate those

They are **10h's work, not yours.** `SPEC.md` carries all three (2026-09-10):

- **A1 → the grid itself is bounded.** Every panel gets a max-height from its grid row; its body
  scrolls; the head stays pinned. Bounding terms one at a time is abandoned as non-convergent.
- **A6 → the banner shows what fits plus `+N more`**, replacing the scrolling form.
- **`model` renders as its filename**, raw on the wire.

Your job for these three is only to **record them accurately in `HANDOVER.md` §8 as ruled-and-
assigned-to-10h**, with the adversarial's measured numbers, so 10h inherits facts. **Do not
implement them. Do not half-implement them.**

## 2. What you DO adjudicate and fix: A2, A3, A4, A5, A7, A8, A9, A10

Each ACCEPTED / REJECTED / DEFERRED with a checkable reason, and fixed where it is 10g's own defect:

- **A2** the throttle well drops to a second line (caption 41.2 px at 1280/1600), so the ruling
  buys 2/3/0 px, not the build's claimed 27. ⚠ **The measurement stands regardless of 10h** — decide
  whether the wrapping is a defect to fix now or is subsumed by the grid bound, and say which.
  Correct `10g-build.md`'s claim in place either way.
- **A3** three one-line reverts stay green — including `background-attachment` on the row
  explanation well, whose fade is guarded by **no test and no mutation**. Close all three or defer
  with a named grader.
- **A4** the `… N more` marker opaquely covers 46×11 px of the one visible line it describes.
- **A5** every marker on the graded page is wrong (says 3 while four entries are unreadable) and
  the wells hiding most have none. ⚠ Note the count is entries, not lines, **by the owner's
  ruling** — so fix what is a defect against that ruling, and record what is the ruling's own cost.
- **A7** three ⚠ tests carry an unmatchably short ledger prefix — one is the single character `⚠`,
  matching 278 other names, so the `… N more` acceptance test is certified by nothing. **This is a
  ledger-integrity defect and it is the priority of this list.** Check no other mark in any harness
  has the same shape.
- **A8** `styles.test.ts`'s two `test.each` blocks share one ledger key (now 14 generated tests
  behind it). Pre-existing; fix or defer with the consequence stated.
- **A9** `panel-notes.module.css`'s doc still argues `roomy` is 60 px.
- **A10** two published numbers do not reproduce (`.rest` 21 vs 75 at 12 conditions; the third
  SERVING row +48 not +20). Correct them at their source.

## 3. Then

Run `measure-breakpoints.mjs`, `measure-arrangements.mjs --fixture box --only baseline --anatomy
--no-capture --json /tmp/density.json`, `check-density.mjs` (no `--oq`), then **all nine**
`regressions.py` serially in ONE foreground call (the adversarial could not; they must be run
here), then `pnpm verify` cold, then `git status`.

Write `steps/10-panels-assembly/10g-reconciliation.md` (table first) and **rewrite `HANDOVER.md`**:
§0.0 = "10g closed pending parent review — the four terms are bounded and measured, **and §6.1 is
still breakable on hostile telemetry, which is why the owner has ruled the GRID bounded (10h)**";
§8 carries the ruled-and-assigned rows plus what is still open; §1 the harness totals; a §0.11 with
this loop's rules — including the two process ones (never `git checkout --` on an uncommitted item;
a new browser measurement must be probed by breaking it before it is trusted). Correct `ANCHOR.md`
§2 where a fact is now wrong.

## 4. Not yours (ANCHOR §8)

No commit. No `SPEC.md` / `MOCK.html` edits. No claiming green — paste exit codes. A REJECTED row
names the refuting line or becomes DEFERRED with an owner.

## 5. Rules

`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
alongside a harness; harnesses serially, foreground, one call; ⚠ never poll with `pgrep`; ⚠ **never
`git checkout --` while this item is uncommitted** — undo an experiment with the edit that reverses
it (the test phase lost work that way). New ids `10g-`, unique across all harnesses. Close only
browsers you launch; no `.env`; `next-env.d.ts` byte-identical. Do not weaken a guard.

## 6. Report

Adjudication counts; what was fixed; the browser verdicts; nine harness totals; `pnpm verify` exit
code; what 10h inherits. The parent will not read your transcript.
