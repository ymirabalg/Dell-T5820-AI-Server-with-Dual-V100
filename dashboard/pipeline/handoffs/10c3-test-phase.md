# Handoff — Step 10c-3, TEST phase

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10c3-build.md` (**your primary subject**), then `SCOPE.md`,
`SPEC.md` §6.1/§6.2/§6.7, `HANDOVER.md` §0.5–§0.7, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10c-3 uncommitted.
**Step 10 closes with this loop.**

---

## 1. What 10c-3 built

**L9** — `CHART_SIZE` in `components/grid.tsx` is the canonical home; `gpu-panel.tsx`'s ≥1600px
promoted chart moved off bare `480×140` literals onto `CHART_SIZE.gpuPromoted`. **2.5f** —
verified no panel body has a bounded ancestor and therefore **left `--table-scroll-max: 40vh`
alone**. **F14b** — `Sparkline` gained an optional `gaps` prop, wired at three call sites.
**Q2-F9** — **drop, not clamp**: `clipPlotsToDomain` strips out-of-domain points before render.
**10a-F4** — `measure-breakpoints.mjs` driving real Chrome over CDP via `playwright-core`.
**A9-paint** and the **banner-wrapping** silence, recorded.

## 2. Verified by the parent

| | |
|---|---|
| `pnpm verify` exit **0**, **99 files, 2788 tests**; `pnpm build` exit 0 | parent |
| Runtime deps still exactly `next`, `react`, `react-dom`; `playwright-core` is dev-only | parent read `package.json` |
| `--table-scroll-max: 40vh` correctly **left in place** | parent |
| ⚠ **The image claim needs sharpening, and step 11 depends on it** | I checked `.next/standalone`: **no playwright package directory exists** — the code genuinely does not ship. But **four files contain the string**: our copied `package.json` (naming it under devDependencies) and three files inside **Next's own package** (`next-test.js`, `server-external-packages.jsonc`, `next/package.json`), which reference playwright for their own reasons. **"Absent from the image" is right about the package and wrong about a grep.** Someone auditing the image with `grep -r playwright` will get hits and be misled. Make the claim precise in the notes — step 11 reads them |

## 3. ⚠ Priority: F14b changed a STEP 9 primitive, and six anchors moved

`Sparkline` is step 9's, consumed by three production call sites and its own tests. Adding a
`gaps` prop is the first change to a step-9 primitive since step 9 closed.

- **Do the three call sites all pass `state.gaps`, and is that the right source at each?**
- ⚠ **Six pre-existing mutations were re-anchored** because their text moved. A re-anchored mutation
  can end up testing something **narrower** than before and the ledger will not notice — it only
  asks whether *some* ⚠ test reddened. Read each against the property it was written to catch.
- **The failure it fixes is worth confirming**: the build says a real sampling gap left no null
  marker, so the index-positioned polyline drew **one smooth unbroken line across it** — a hole
  rendered as a reading. Construct that and confirm the fix shows a hatch instead.

## 4. The rest

- **Q2-F9's drop.** `clipPlotsToDomain` strips points. What happens when **all** points are out of
  domain — an empty plot, or a crash? What about exactly one surviving point (step 9 shipped an
  isolated-point defect where a one-vertex polyline paints nothing, in **two** places)? And does the
  **table view** drop the same rows as the chart, or do they now disagree?
- **L9's reasoning.** The build says the grid **authors** the size rather than measuring live,
  because a `ResizeObserver` needs a hook `purity.test.ts` forbids. Sound — but check
  `CHART_SIZE.gpuPromoted` is genuinely used, and that no other bare size literal survives elsewhere.
- **2.5f's verification.** It grepped every CSS file and `app/layout.tsx` and concluded no bounded
  ancestor exists. **Re-derive it** — this is the check that decided *not* to change something, and
  a wrong "no" here silently keeps a stopgap forever.
- **F4: 6 of 7 measurements pass; #7 is claimed environment-blocked** (this Mac has no GPU,
  `nvidia-smi: ENOENT`). Plausible — but "blocked by environment" and "unverified" are the same
  state from step 11's perspective. Say what #7 would prove and what still rests on 10a's one-off
  manual pass.
- ⚠ **The `toContain` lint and dangling-class audit are live.** If either fires on this work it is
  probably right — nine instances of that shape have been found so far.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/09-ui-primitives/regressions.py         # Sparkline is step 9's
python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; never two at once — **sequential
  foreground**. ⚠ **Never poll** (ANCHOR §9). `git status` after each.
- Re-run only the harnesses whose `LEDGER_FILES` you touch — ⚠ **`Sparkline` means step 9's**.
- **If you run a dev server or the measurement script, stop it and leave no `.env` behind.**
- **Fixing IS in scope.** **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 6. Deliverable

`steps/10-panels-assembly/10c3-test.md`, leading with §3. Then a short summary. End with
`pnpm verify`, every harness result, and `git status`.
