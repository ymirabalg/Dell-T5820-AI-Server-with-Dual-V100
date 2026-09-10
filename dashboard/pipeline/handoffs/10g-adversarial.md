# Handoff — 10g, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10g-build.md` and `steps/10-panels-assembly/10g-test.md` (**your
subjects** — the test phase found BOTH new measurements passing vacuously and fixed them; assume
nothing it did not check), `handoffs/10g-bounded-terms.md` (the four rulings), `SPEC.md` §6.1's five
⚠ 2026-09-09 paragraphs and §6.4's ⚠ banner paragraph, §6.2, §6.5, `HANDOVER.md` §0.10, §5, §8,
`ANCHOR.md` §4/§5/§9, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10g build + test, uncommitted on
`5769522`. Ports 39173/39174 free — **use the browser**; :8391/:8392 are the user's, leave them.

## 1. Verified by the parent

`pnpm verify` exit 0, 101 files, **3008** tests. The test phase reports harnesses 09 **140** / 10
**264** exit 0, `measure-breakpoints.mjs` **30/30**, `check-density.mjs` ALL PASS — its claims.
⚠ The test phase **reconstructed `components/alarm-banner.module.css` and
`components/panels/panel-notes.module.css`** after a `git checkout --` discarded uncommitted work
in them. The parent re-checked both carry their ruled declarations, but **a reconstruction is a
prime place for a silent loss** — diff both against what `10g-build.md` says they should contain,
declaration by declaration, and report anything missing.

## 2. Where to aim

1. **The margin is 6 px at 1600×1024** on the all-sources-explained page (measurement 11). Find
   what eats it. Candidates to fabricate and MEASURE: a 21-condition banner *plus* every source
   explained; a GPU throttle mask with an unknown bit while every source is explained; the longest
   real string each collector can emit (read the collectors, not the fixtures); a hostname or model
   alias at its maximum; `standing` entries; a 2 d 06:00 elapsed form on every row. Report the
   number per scenario; do not rule.
2. **Table views, again, and harder.** m13 now grades five open. Try: open all five *and* fill every
   well *and* 200 log entries *and* a banner; toggle repeatedly (does height drift?); open a table
   in a panel whose chart is the *hidden* promotion wrapper; resize across 1600 with tables open.
3. **The banner well at `height: 21px` (not `max-height`).** One condition renders no `.rest` at
   all — so what renders at exactly two conditions that wrap to two lines? Is a condition ever
   *unreachable* (scrolled out with no scrollbar affordance on a wall panel)? Does `role="alert"`
   re-announce on every poll when the list scrolls?
4. **The fade is proportional, not exact** (test phase measured 9/255 with nothing hidden). Find
   where that misleads: a well with nothing hidden that *looks* clipped, or one with 8 px hidden
   that looks clean. Screenshot-decode as they did.
5. **`… N more` is a lower bound.** Find the worst divergence between the count and what a reader
   can actually see, and say whether any of it is *wrong* rather than merely conservative.
6. **`chartBoxHeight`'s single derivation** was just unified. Find any remaining path where the
   painted `<svg>` and the table box can differ: pre-first-poll, all-null series, one point, a
   domain of zero width, the empty state, the promoted wrapper at each breakpoint.
7. **Anything in the 10g diff you can revert one line of and keep the suite green.** Name each.
8. **Harness integrity**: 1124+ mutations — any `10g-` id that bites on an accident rather than its
   named property; any ⚠ mark reddened only by a neighbour; `styles.test.ts`'s two `test.each`
   blocks sharing a ledger prefix (the test phase recorded it as pre-existing — confirm the
   consequence).

## 3. Rules

- **Fix nothing.** Findings `10g-A1…`, most severe first, each with a concrete scenario, severity,
  file:line, and how proven ("measured" / "reasoned, not run"). Throwaway scripts in
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git checkout --` a file while this item is uncommitted** — undo an experiment with the
  edit that reverses it. The test phase lost work that way (its §8).
- `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
  alongside a harness; harnesses serially, foreground, one call; ⚠ never poll with `pgrep`. Close
  only browsers you launch; no `.env`. No commit; no `SPEC.md` / `MOCK.html` edits.

## 4. Deliverable

`steps/10-panels-assembly/10g-adversarial.md`: findings first; then what held; then what you could
not verify. Short summary back. The parent will not read your transcript.
