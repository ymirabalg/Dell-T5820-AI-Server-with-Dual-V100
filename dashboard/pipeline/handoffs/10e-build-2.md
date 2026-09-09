# Handoff — 10e BUILD, part 2: MEASURE the real app and CONVERGE it onto 10e's density targets

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. You continue a build
another agent finished writing; **your job is the browser measurement it never ran, and the fixes
it reveals.**

Read, in order: this file → `pipeline/handoffs/10e-build.md` (the original build handoff — rulings
in §2, acceptance in §5; **ignore its §0**, it was for a cancelled replacement) →
`steps/10-panels-assembly/10e-build.md` (the first builder's checkpoint notes: what was built, per
file, and four spec silences) → `steps/10-panels-assembly/10e-match-the-mock.md` §0, §2.0–§2.11,
§3, §8 (targets and acceptance) → `SPEC.md` §6.1 → `HANDOVER.md` §1 → `ANCHOR.md` §4/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Load the `dataviz` skill if you touch a chart.

## 1. What the parent has verified on the tree you inherit

- **`pnpm verify` exits 0** on the built tree (run by the parent after the first builder stopped).
- The first builder's report: 09 harness green (120/120), 10 harness green (181/181), 02 harness
  green except the **three pre-existing** `02-R20`/`R30`/`R31` anchors (HANDOVER §1; not yours).
- A stranded harness mutation in `lib/collectors/dbus-wire.ts` (from a killed background run of
  harness 03–08) was found and restored by the parent. **Harnesses 03–08 have NOT been run clean
  on this tree** — that is yours (§3 step 5).
- All code under `components/`, `app/`, `lib/` is uncommitted work from the first builder. Treat it
  as a build to measure, not as a spec.

## 2. What you must do

1. Run `measure-breakpoints.mjs` (measurements 0–9). Record the output.
2. Run `measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json
   /tmp/density.json`, then `check-density.mjs /tmp/density.json` with **no `--oq` flag**. Record it.
3. For every FAIL: find the cause in the built component or CSS by reading the `--anatomy` per-child
   heights against 10e §2's row budgets, fix it in the component, and re-measure. **Targets are
   10e §8's table with CPU at 216.1 / 240.1 / 240.1** (OQ-7). Every OQ is declined except OQ-7 and
   OQ-4 (no chip on the log) — do not add a caption, note footer, count chip or paused banner to
   make a height match.
4. Converge until: page ≤ viewport with ≥200 px spare at 1280×1024 / 1600×1024 / 1920×1080 healthy;
   page ≤ viewport with the harness's banner pinned; every slot within ±10 % of target; chart boxes
   COOLING 174, GPU/CPU visible chart 38 (<1600) / 50 (≥1600); measurements 0–9 PASS.
5. Then, in ONE foreground call, serially: all nine `regressions.py` harnesses. Then `pnpm verify`
   cold. Then `git status` for a stranded mutation.
6. Complete `steps/10-panels-assembly/10e-build.md`: replace its "Not yet done" section with the
   measured per-slot heights vs target at all three viewports (paste `check-density.mjs`'s final
   output and `measure-breakpoints.mjs`'s), what you changed to converge and why, the nine harness
   totals, and any new spec silence.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"   # nvm FIRST
cd dashboard
```

- If a fix changes a ⚠-tested behaviour, keep the test honest and re-aim its `10e-` mutation.
- Never `pnpm verify` alongside a harness; never two harnesses at once; **never poll with `pgrep`**
  (it self-matches and spins — ANCHOR §9). Run harnesses serially in one call, in the foreground.
- ⚠ Close only the browsers you launch (the user's Chrome is running). Leave no `next dev` on
  :39173/:39174, no `.env`. `next-env.d.ts` must be byte-identical afterwards.
- **Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken `purity.test.ts`.**
- If a target cannot be met without violating a rule in 10e §6 or a ruling, **stop, record it with
  the measured number, and report** — do not choose.

## 4. Report

Short summary: check-density pass/fail per viewport with page height and spare, healthy and with
banner; measure-breakpoints result; what you changed; nine harness totals (02's three pre-existing
failures listed separately); verify exit code; spec silences. The parent will not read your transcript.
