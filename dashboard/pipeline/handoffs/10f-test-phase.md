# Handoff — 10f, TEST phase

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10f-build.md` (**your primary subject**), `handoffs/10f-degraded-fit.md`
(the rulings and acceptance), `SPEC.md` §6.1 (last ⚠ paragraph) and §6.2's GPU paragraph,
`HANDOVER.md` §0.9, §5, `steps/10-panels-assembly/10e-test.md` §1 (how a re-aim is checked),
`ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10f uncommitted. Ports free.

## 1. Verified by the parent

`pnpm verify` exit 0 on the build tree (see the parent's figures in the summary you get; the build
reports 101 files, 2957 tests). `row.tsx` is gone. Everything else — 16/16 breakpoints, the new
measurement 10, check-density unchanged, nine harnesses green, step 2's ledger 272/60/22 — is the
builder's claim; re-run what you can (the browser scripts are available; ports are free).

## 2. ⚠ Priorities

1. **Five retirements** (`09-R1`/`R2`/`R3`, `10e-R1`/`R2`) and the re-aims (`09-CS1`, the
   `styles.test.ts` non-vacuity anchor, `02-R20`/`R30`/`R31`). For each: is the property still
   caught by something, and is the re-aim no narrower than the original? The builder says
   `09-R1`/`R3` were ported to `status-row.test.tsx` — read the ported tests against the originals
   at `git show HEAD:components/row.test.tsx`.
2. **The bounded wells.** `max-height`, not `height`: prove boundedness holds when the well has one
   line, zero lines (must render nothing — the builder claims density on `--fixture box` is
   unchanged to the digit), and 40 lines. Is `overflow-y: auto` + `position: relative` present on
   every well, and does `styles.test.ts`'s scrolling-box rule see all of them? Are the wells
   keyboard-reachable (`tabindex`) only when they actually overflow, or always?
3. **The three bespoke notes copies folded into `PanelNotes`** (GPU takeover, SERVING empty,
   STORAGE link error): did any string, attribution (S-G), or one-message-per-source rule (S-H)
   change on the way? Render each before/after with `git stash` if needed.
4. **`Chip band={false}`**: fixture both sides, and confirm it is distinct from `severity={null}`
   in the DOM and for a screen reader. `0x4` alone → no line at all.
5. **Measurement 10's fixture**: the builder says it "asserts the fixture took before grading" —
   confirm that assertion cannot pass vacuously (HANDOVER §0.8's rule: a measurement that names a
   subject must prove the subject exists).
6. **The row model correction** (rows 2 and 3 size independently). The builder's worst-case bound
   is 163 px; re-derive it from the CSS and the well heights, and check the 1600×1024 compound
   case the builder says is 1–8 px over — is that arithmetic or measured?
7. Test names against bodies in every changed test file; the `toContain` shape (eleven instances
   so far); entropy/timers in new tests.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/02-format-severity/regressions.py; python3 pipeline/steps/09-ui-primitives/regressions.py; python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ never poll with `pgrep`. `git checkout --` a stranded mutation. Re-run every harness whose
  `LEDGER_FILES` you touch. Close only browsers you launch; no `next dev` left; no `.env`.
- **Fixing IS in scope. Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken a guard.**

## 4. Deliverable

`steps/10-panels-assembly/10f-test.md`, leading with §2 in order; short summary; end with
`pnpm verify`, every harness result, and `git status`. The parent will not read your transcript.
