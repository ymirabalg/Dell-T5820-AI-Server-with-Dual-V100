# Handoff — 10h, RECONCILE phase (background agent)

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10h-adversarial.md` (**10 findings — primary subject**),
`steps/10-panels-assembly/10h-test.md`, `steps/10-panels-assembly/10h-build.md`,
`handoffs/10h-bound-the-grid.md`, `SPEC.md` §6.1's ⚠⚠ 2026-09-10 grid paragraph, §6.4, §3.2, §3.4,
`HANDOVER.md` in full (you rewrite it), `steps/10-panels-assembly/10g-reconciliation.md` (the
model), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10h build + test + adversarial,
uncommitted on `29e2240`. Ports free (:8391/:8392 are the user's).

## 1. Verified by the parent

`pnpm verify` exit 0, 101 files, **3056** tests, on the tree the adversarial left; `next-env.d.ts`
clean. The four row shares sum to exactly **1.0** (parent-computed). Everything else is an agent
claim: 44/44 measurements, nine harnesses at 1170 mutations, hostile **+28 / +4 / +36**.

## 2. ⚠ THE FINDING THAT MATTERS MOST — read this before adjudicating anything

**The caps turned a VISIBLE failure into an INVISIBLE one, and nothing grades the new one.**
Before 10h, too much content made the *page* scroll — loud, and measured by nine records. After
10h, too much content makes a *panel body* scroll, which hides readings behind a fade, and **no
measurement fails when that happens**. The adversarial proved it: a compensating share pair passes
both the sum test and the healthy-height test, `measure-breakpoints.mjs` reports 44 passed, and
m11's printed spare *improves* from 6 to 12 px **because the GPU panel was clipped from 199 to
192** (A3). On m11 the four rows sit **0.8 / 0.8 / 2.9 / 1.3 px** from clipping, while A7 measures
**74.6 px of empty screen** with three bodies scrolling and **275.2 px unused** on the healthy page.

**So the acceptance is now wrong in kind.** "The page fits" is necessary and no longer sufficient.
Add the missing half: **a measurement that FAILS when a panel body scrolls on a page whose content
the design is supposed to hold** — healthy and ordinary-degraded at minimum — and report, per
viewport, which bodies scroll on the hostile page and by how much. A reading hidden behind a fade
is this project's founding failure shape (`null` rendered as though it were data), one layer up.

⚠ **The owner's two rulings interact with this, and you must MEASURE the interaction, not assume
it.** Ruled 2026-09-10, after the test phase and before these findings:

- **Truncate the `hostname`** (one line, ellipsis, full string in `title`) — the same rule as
  `model`. That closes the band's unbounded term.
- **Reserve explicit headroom: the four shares sum to ~0.98, not 1.0**, buying ~18 px at 1024 tall.

⚠ **Shrinking the shares makes clipping WORSE, which is the opposite of what §2 wants.** The owner
ruled the headroom before A3/A7 existed. So: implement the hostname truncation; then measure the
headroom change **both ways** (0.98 and 1.0) against *both* criteria — page fit and bodies-scrolling
— and **report the numbers with a recommendation. Do not silently keep 1.0, and do not silently
ship 0.98 if it hides readings on a page that fitted before.** If the honest answer is that the
shares need re-proportioning rather than uniform shrinking (A7's 74.6 px of empty screen beside
three scrolling bodies says they might), say so with the arithmetic and leave it for the owner.

## 3. Adjudicate all ten, fix what is 10h's

A1, A2, A8 are **guard defects in 10h's own tests** — a regex taking the first `.grid` block, a
`toMatch` that a duplicate declaration defeats, a media-query brace — each with a measured page
overflow behind it. Close all three and check the same shape nowhere else (`capsBlock()` has the
mirror version). **A4** (a browser minimum-font-size setting alone breaks the band, no telemetry
involved) is not fixed by the hostname ruling — adjudicate it. **A5** horizontal scroll in bodies
with no affordance, **A6** clipped focus rings on 10 of 15 focusable children *that 10h added* —
both are accessibility regressions of this loop; fix or defer with a named owner.

Each row ACCEPTED / REJECTED / DEFERRED with a checkable reason. A REJECTED row names the refuting
line.

## 4. Then

`measure-breakpoints.mjs`, `measure-arrangements.mjs --fixture box --only baseline --anatomy
--no-capture --json /tmp/density.json`, `check-density.mjs` (no `--oq`), then **all nine**
`regressions.py` — one **detached**, strictly serial command (they take ~11 min, the foreground
tool caps at 10; read the log, ⚠ never poll with `pgrep`) — then `pnpm verify` cold, then
`git status`.

Write `steps/10-panels-assembly/10h-reconciliation.md` (table first) and **rewrite `HANDOVER.md`**:
§0.0 must say plainly whether §6.1 now holds and **at what cost in hidden readings**; §8 the open
questions; §1 the totals; §0.12 this loop's rules. Correct `ANCHOR.md` §2 where a fact is wrong.

## 5. Not yours (ANCHOR §8)

No commit. No `SPEC.md` / `MOCK.html` edits — quote wording you want. No claiming green: paste exit
codes.

## 6. Rules

`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
alongside a harness; ⚠ never poll with `pgrep`; ⚠ **never `git checkout --` while this item is
uncommitted** — undo with the reversing edit. New ids `10h-`, unique, ⚠ names ≥12 matchable chars.
Close only browsers you launch; no `.env`; `next-env.d.ts` byte-identical. Do not weaken a guard.

## 7. Report

Adjudication counts; what was fixed; **the headroom measurement both ways with your recommendation**;
which bodies scroll on which pages; browser verdicts; nine harness totals; `pnpm verify` exit code;
the owner questions. The parent will not read your transcript.
