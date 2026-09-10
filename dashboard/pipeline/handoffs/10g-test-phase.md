# Handoff — 10g, TEST phase

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10g-build.md` (**your primary subject**), `handoffs/10g-bounded-terms.md`
(the four rulings), `SPEC.md` §6.1's five ⚠ 2026-09-09 paragraphs and §6.4's ⚠ banner paragraph,
`HANDOVER.md` §0.10, §5, §8, `steps/10-panels-assembly/10e-test.md` §1 (how a re-aim is checked),
`ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10g uncommitted on `5769522`.
Ports free (:8391/:8392 are the user's — leave them).

## 1. Verified by the parent

`pnpm verify` exit 0 on the build tree (figures in the summary below your read). `--table-scroll-max`
is gone from `components/`. Everything else — 29/29 breakpoints, density unchanged, nine harnesses
at 1124 mutations, the table-view and banner invariance measurements — is the builder's claim.
Browser scripts are available to you; re-run what decides a claim.

## 2. ⚠ Priorities

1. **Eight re-aimed anchors** (three at ruled numbers, five inherited). For each: same property, no
   narrower? Read each against what it was written to catch, and confirm by running the harness and
   reading which test reddened — not by reading the diff alone.
2. **The two new invariance measurements (12 and 13) are the acceptance, so audit them like guards.**
   Can measurement 13 pass with the table views not actually open (a toggle that silently no-ops)?
   Can 12 pass with conditions dropped rather than scrolled — does it assert one rendered item per
   condition at 21, and does it assert the *text* of the last one is in the DOM? A measurement that
   names a subject must prove the subject exists (HANDOVER §0.8). Try to make each pass vacuously.
3. **`chartBoxHeight()` is now one derivation feeding two branches** (the `<svg>` and the table box).
   Prove they cannot diverge: fixture every size (38 / 50 / 174), and mutate the export to confirm
   both move together. Does the empty-state box use it too?
4. **The banner's `height: 21px` (not `max-height`).** At ONE condition, is there dead space or a
   scrollbar? At zero conditions is the banner absent entirely? Does `role=status`/`alert` still
   announce, and does the scrolling well steal focus order from the page?
5. **The fade is claimed EXACT** — draws iff the well overflows. Fixture: content exactly equal to
   the box height (no fade), one pixel over (fade), empty (nothing). Four wells.
6. **`… N more` counts ENTRIES, not hidden lines** (the builder's own silence). Construct the case
   it names — one long message wrapping past the box — and confirm what the reader sees. Is the
   count ever *wrong* rather than merely absent (e.g. 4 entries, 3 shown, one of them wrapping)?
7. **The builder says `roomy` 60→46 bought 0 px and the banner's removed `margin-top` closed
   Q3.** Verify both halves: revert the margin change alone and re-measure the all-explained page;
   revert 46→60 alone and re-measure. If the ruling's stated mechanism did nothing, that belongs in
   the notes plainly.
8. Test names against bodies in every changed file; the `toContain` shape (eleven so far); entropy
   or timers in new tests; `git show HEAD:` for anything deleted.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/09-ui-primitives/regressions.py; python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ never poll with `pgrep`. Re-run every harness whose `LEDGER_FILES` you touch. `git checkout --`
  a stranded mutation. Close only browsers you launch; no `next dev` left; no `.env`.
- **Fixing IS in scope. Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken a guard.**

## 4. Deliverable

`steps/10-panels-assembly/10g-test.md`, leading with §2 in order; short summary; end with
`pnpm verify`, every harness result, and `git status`. The parent will not read your transcript.
