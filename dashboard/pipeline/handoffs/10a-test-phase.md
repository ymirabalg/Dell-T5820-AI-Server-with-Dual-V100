# Handoff — Step 10a, TEST phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `pipeline/steps/10-panels-assembly/10a-build.md` (**your primary subject**), then
`pipeline/steps/10-panels-assembly/SCOPE.md`, then `SPEC.md` §6.1/§6.2/§6.4, then `ANCHOR.md`
§4/§5/§8 and `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree intentionally dirty.

---

## 1. What 10a built

The **shell** of step 10 — header, sticky alarm banner, grid, `app/` wiring, D6, and step 10's
new harness. The nine panel bodies are **10b's**, not yours.

It settled the hook boundary: `components/` stays **100% hook-free**, all state lives in two
hooks under `app/` (`useTelemetry` from step 8, plus a new `useNowTick` for D2's independent age
tick), both called once from `app/dashboard-shell.tsx`. New pure modules `lib/client/banner.ts`
and `lib/client/header-status.ts`.

## 2. Verified by the parent — do not re-derive

| | |
|---|---|
| `pnpm verify` exit **0**, **76 files, 2340 tests**, no type errors | parent, this tree, nothing else running |
| `purity.test.ts` **untouched** | `git diff --stat` empty |
| **Zero hooks in `components/`** | grepped the shape across all non-test `.tsx` — the boundary genuinely holds |
| Hooks confined to `app/` | only `dashboard-shell.tsx` and `use-now-tick.ts` |
| jsdom is **dev-only** | runtime `dependencies` are still exactly `next`, `react`, `react-dom` — invariant 6 respected |

## 3. ⚠ Your highest-priority question: HALF THE GREEN CRITERION MAY BE UNVERIFIED

`PLAN.md` says step 10 is green when **"grid matches §6.1 placement; paused shows mode *and*
alarm count"**. Those are the two acceptance criteria for the whole step.

The build states plainly — to its credit — that **CSS and grid placement are not observable in
jsdom and no real browser was opened**. If that is so, then the first half of the green criterion
is *asserted but not tested*: a suite that cannot see grid placement cannot prove the grid matches
§6.1.

**Establish what is actually true.** For each of these, say what would have to break for a test to
go red:

- COOLING spanning **rows 2–3 in columns 1–2** — settled in §6.1 and wrong in earlier drafts.
- The four breakpoints (≥1600 / 1280–1599 / 900–1279 / <900) and their reorderings.
- The panel order at <900: GPUs → cooling → safety → serving → host → storage.

Then judge: is a **source-text or emitted-`className`/`style` assertion** an honest proxy here, or
does this need a real browser? Q2-S2 set the precedent — its CSS was verified in Chrome with real
geometry, `getComputedStyle` and `getBoundingClientRect`, and that found a WebKit sticky bug no
test would have. **That option is open to you.** If you conclude a browser check is required and
you cannot do it, say so as a finding rather than leaving the criterion looking met.

The **second** half — paused shows mode **and** count, count omitted at zero — is testable in
jsdom and must be genuinely covered. The build already caught one inert assertion here (see §4).

## 4. The build's own three findings — confirm each, do not take them on trust

It reported these against itself, which is a good sign, but they are exactly what a second pass
should re-derive:

1. **An inert assertion in its own `header.test.tsx`** — `toContain('paused')` was trivially
   satisfied by an unrelated `data-mode="paused"` attribute. Caught by the harness and fixed.
   **Check for siblings**: this project's rule is that when a fix lands, you grep for the same
   shape elsewhere. Are there other `toContain` assertions satisfied by an attribute rather than
   by rendered text?
2. **A removed mutation.** A plausible mutation ("runtime rebuilt every render") triggers a real
   React `useSyncExternalStore` pathology — 506 s, OOM/SIGABRT — rather than failing cleanly, so
   it was removed and **the test left deliberately unmarked**. ⚠ Judge that honestly: an unmarked
   test is outside the ledger, so the property is now unprotected. Is leaving it unmarked right
   (the ledger cannot hold what cannot be mutated cleanly), or does it need a *different* mutation
   that reddens the same property without the pathology?
3. **Vitest's `@vitest-environment` docblock pragma matches anywhere in file text**, so its own
   prose mentioning another file's pragma silently pulled that file into jsdom. Fixed. **Check
   whether any other file's prose can do the same** — this is a guard-defeated-by-text defect,
   the same species as the ⚠-scanner bug Q1 fixed.

## 5. Also worth your attention

- **Count discrepancy:** the build reports **32** mutations; `grep -c '("10a-'` returns **33**.
  Probably a stray occurrence in a comment or docstring, but confirm which number the harness
  actually runs and reconcile it. Small, and exactly the kind of thing this project does not wave
  through.
- **The props contract is the handover to 10b.** Read `10a-build.md` §2 as a *consumer* would:
  is it precise enough to write nine panels against without asking a question? Specifically — what
  a panel receives, who owns SVG ids, who owns chart sizing, and what the null-before-first-poll
  wrapper hands down. Ambiguity here costs 10b nine reworks, so a vague clause is a finding.
- **`lib/client/banner.ts` and `header-status.ts`** were outside the scope the build was given; it
  argued the case in §3. Assess the *code*, not the scope call — the parent will rule on scope.
- **D2's age tick.** The rule is that it must **not** derive from store changes: the store changes
  once, at the `live → stale` crossing, which is worse than never because it looks right in a
  fast-cadence fixture and freezes on a real failure. Confirm `useNowTick` genuinely has its own
  interval and that a test would notice if it were rewired to the store.
- **Invariant 1** — `null` is *before the first poll* in the wrapper's case and must not render
  `—`; elsewhere `null` **is** `—` and zero is the numeral with its unit. Both directions.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness.** A `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever — five hours lost 2026-09-08
  (ANCHOR §9). Plain **sequential foreground commands**.
- ⚠ If you back up a source file to experiment, **restore it and confirm with `git status`**. The
  build did exactly this correctly; an interrupted experiment leaves a stranded mutation and makes
  the next `pnpm verify` lie.
- **Fixing IS in scope** — say what you changed and why.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 7. Deliverable

`pipeline/steps/10-panels-assembly/10a-test.md`, then a short summary. Lead with your answer on
§3 — whether the grid half of the green criterion is genuinely tested — because that decides
whether 10a can close. A clean result stated with its evidence beats a manufactured finding.
End with `pnpm verify`, the harness result, and `git status`.
