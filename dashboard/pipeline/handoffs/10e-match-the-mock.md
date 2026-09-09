# Handoff — 10e: make the implementation match MOCK.html's density. **Produce a BUILDER SPEC. Change no production code.**

**Written by the parent, 2026-09-09, at the owner's instruction: *"the design is super cool, just adapt
it, or spec it properly."*** Fresh agent, no memory of this project.

Read: this file → `MOCK.html` (**the design; open it, read its CSS and its panel renderers**) →
`SPEC.md` §6.1, §6.2, §6.3, §6.6 → `pipeline/HANDOVER.md` §0.0 → `steps/10-panels-assembly/10d-layout-replan.md`
§2 (the measured failure and the two shipped defects F1/F5) → `components/` (what is built) →
`ANCHOR.md` §4/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree clean at `7de7dd3` plus 10d's untracked files.

---

## 1. What the parent established — build on it, do not re-derive

**The §6.1 grid was never the problem. The built panels are 1.8–2.4× taller than the design.**
Measured with `pipeline/steps/10-panels-assembly/mocks/measure-mock.mjs` on `MOCK.html`
(subtract the 31 px `.mockstrip`, which the real app does not have):

| viewport | mock, healthy | mock, 6-alarm banner (state B) | built app, healthy (10d §2) |
|---|---|---|---|
| 1280 × 1024 | fits by ~19 px | over by ~166 | **over by 356** |
| 1600 × 1024 | fits by ~90 | over by ~52 | **over by 418** |
| 1920 × 1080 | **fits by ~159** | **fits by ~86** | **over by 362** |

Per-panel heights at 1920 — **mock vs built**: GPU **220 vs 485** · COOLING **472 vs 868** · CPU
**204 vs 458** · MEMORY **195 vs 458** · SAFETY **259 vs 397** · STORAGE **182 vs 397** · SERVING
**140 vs 190** · LOG **134 vs 190**. (1280: gpu 208, cool 525, cpu 210, ram 209, safe 306, store
197, serv 182, log 134. 1600: 220 / 485 / 204 / 195 / 272 / 182 / 140 / 134.)

**Consequences that are settled:** the §6.1 grid stays exactly as drawn — four rows, COOLING
spanning rows 2–3 in columns 1–2, **all nine panels on the wall**. 10d's arrangement B, its
disclosure and the panel-removal ruling are **withdrawn**; 10d's *measurements* and its two shipped
defects (F1 `position: relative` on `.panel`; F5 SERVING's `.value` not wrapping) stand.

## 2. What you must produce

A specification a builder follows **to the dot** to bring `components/` and `app/` to the mock's
density, panel by panel — with the acceptance being the numbers above reproduced on the **real
app**. It must contain:

1. **A token table**: the mock's type scale (12 px mono base, 10/10.5/11 px secondary, 34 px hero,
   9.5–10 px uppercase sans labels), spacing (panel padding `8px 10px 9px`, gap 5, grid gap 9),
   line-height 1.35, and every colour token — mapped onto `components/tokens.css`'s existing names,
   with each addition or change listed. ⚠ Keep the project's validated series palette and its
   status-never-for-a-series rule (`MOCK.html` header comment) — do not invent colours.
2. **Per-panel anatomy, from the mock's renderers** (`renderGPU`, `renderCooling`, `renderCPU`,
   `renderRAM`, `renderServing`, `renderSafety`, `renderStorage`, `renderLog`): the exact element
   sequence, each row's font-size and height budget, and **the target height per panel at each
   viewport** (the table above). Where the built component renders something the mock does not
   (or vice versa), **list it and decide**: §6.2 fixes *content*, so every §6.2 row stays; layout
   rows the mock omits are removed; rows the mock adds that §6.2 does not require are **owner
   questions**, not additions.
3. **Chart sizes**: the mock's sparkline is **38 px tall (50 at ≥1600, with axis labels)** and its
   COOLING pair is **hTemp 84 + gap 10 + hFan 46 + axis 14 = 160 px** (`drawCooling`). Map these onto
   `CHART_SIZE` in `components/grid.tsx` and onto the existing primitives' props. ⚠ The mock's
   `drawSpark` reads `window.innerWidth` — **`components/` is hook-free** (`purity.test.ts` walks it),
   so the ≥1600 promotion must be a **CSS media query** or a prop the shell computes, not a read in
   a render. Say which and why.
4. **The header**: the mock's `.topbar` with the `agg` pill (mode beside severity, never instead —
   §6.2), `snap`, and `ctl` controls, mapped onto `components/header.tsx`. §6.2's list is exhaustive;
   the mock's `hostMeta` line shows an IP and a kernel that **§6.2 forbids in the header** — do not
   carry them.
5. **The banner** (`renderBanner`): `.banner` with lead + `banner__rest` chips, and the paused
   variant, mapped onto `components/alarm-banner.tsx`.
6. **What the mock gets wrong and must NOT be copied** — §6.2/§6.6 rules the mock predates:
   the GPU name is `Tesla V100-PCIE-32GB` in the mock and **must be the raw driver string**
   (`Tesla PG500-216`); the bus id is short in the mock and **must be full** (`00000000:17:00.0`);
   disk is `GB` in the mock and **must be `GiB`** (O19); the throttle chip, the `0x4`-is-normal rule,
   invariant 1 (`null` → `—`, zero → the numeral with its unit), S-A/S-B/S-C/S-D/S-E/S-F/S-G/S-H's
   rulings. **Enumerate every such divergence** so the builder keeps the built behaviour and takes
   only the mock's *form*.
7. **The two shipped defects** F1 and F5 from 10d §2, as concrete edits.
8. **Acceptance**: the real app, measured with `measure-breakpoints.mjs`'s method, healthy telemetry,
   ≤ viewport at all three sizes; per-panel heights within **±10 %** of the mock's table; the
   existing browser measurements 0–9 passing; `pnpm verify` green; every harness green.
9. **Owner questions** — anything §6.2 does not settle that the mock decides (e.g. the mock's
   per-panel `note` footers, the log's `10 s debounce` chip, the mock's `"1 of 2 down"` chip text).

## 3. Measure, do not estimate

Every height in your spec must come from a browser. `pipeline/steps/10-panels-assembly/mocks/measure-mock.mjs`
measures `MOCK.html`; `measure-breakpoints.mjs` and `mocks/measure-arrangements.mjs` show how to
drive the real app logged-in under CDP with fabricated telemetry. Reuse them. For each panel,
measure the mock's **sub-elements** too (head, hero row, chart, meter rows, strip, note) so the
builder knows the budget per row, not just per panel.

## 4. Do NOT

- ⚠ **Do not change production code.** No `components/`, `app/`, `lib/`. Spec and measurements only.
- ⚠ **Do not edit `SPEC.md`** — the owner amends it after ruling on your §9 questions.
- **Do not commit.** ⚠ **If you launch a browser, close only what you launched** — the user's own
  Chrome is running. Leave no dev server and no `.env`.

## 5. Deliverable

`pipeline/steps/10-panels-assembly/10e-match-the-mock.md`, plus any measurement scripts under
`mocks/`. Lead with a one-screen summary; then §2's nine parts in order. Report back a short summary.
The parent will not read your transcript.
