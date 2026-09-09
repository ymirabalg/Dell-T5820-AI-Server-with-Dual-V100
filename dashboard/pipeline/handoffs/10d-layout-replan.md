# Handoff — 10d: re-plan the grid. **Produce a MOCK and a BUILDER SPEC. Change no production code.**

**Written by the parent, 2026-09-09, at the owner's instruction.** Fresh agent, no memory of this
project.

Read: this file → `SPEC.md` **§6.1 in full** and §6.2's panel list → `pipeline/HANDOVER.md` **§0.0**
(the measured failure) → `pipeline/steps/10-panels-assembly/10c3-reconciliation.md`'s A1 →
`ANCHOR.md` §4/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `7de7dd3`.

---

## 1. Why you exist

§6.1's placement was **drawn before any of it was measured**, and it does not fit. Measured in real
headless Chrome, every panel populated, default chart view, **no** alarm banner:

| viewport | `scrollHeight` | `clientHeight` | overflow |
|---|---|---|---|
| 1280 × 1024 | 1620 | 1024 | **596** |
| 1600 × 1024 | 1656 | 1024 | **632** |
| 1920 × 1080 | 1640 | 1080 | **560** |

Body has two children with height: the sticky band **49** and `.grid` **1571 / 1607 / 1591**.
Panel heights at 1920: **GPU 0 / GPU 1 485 each · COOLING 868** (spans rows 2–3) **· CPU 458 ·
MEMORY 458 · SAFETY 397 · STORAGE & NETWORK 397 · SERVING 190 · SESSION EVENT LOG 190**.

**The owner ruled: SERVING and the SESSION EVENT LOG come off the single screen.** ⚠ **That is not
sufficient and the owner knows it** — the parent computed it: row 4 is 190 + one 16px gap = **206
recovered against 560 needed** (13 % where ~35 % is required); at 1280×1024, 390 still over. The
rows are content-sized, so nothing re-flows to absorb the rest.

So the owner asked for a **re-plan**, with a mock and a specification a builder can follow exactly.

## 2. What you must produce — and what you must NOT

**PRODUCE:**

1. **Two or three concrete grid arrangements.** Each a real, openable mock that can be measured.
2. **Measured heights for each**, at **1280×1024, 1600×1024, 1920×1080**, in a real browser — the
   same method `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` uses
   (`documentElement.scrollHeight` vs `clientHeight`, plus per-slot rects). **Measure; do not
   estimate.** Every number in your deliverable must come from a browser.
3. **A recommendation** with its reasoning and its costs.
4. **A builder specification** precise enough that an implementing agent makes **no judgment
   calls**: exact `grid-template-areas` / `grid-template-columns` / `grid-template-rows`, exact
   `CHART_SIZE` values, which panel is in which slot at which breakpoint, and where SERVING and the
   SESSION EVENT LOG go instead.

**DO NOT:**

- ⚠ **Do not change production code.** No `components/`, no `app/`, no `lib/`. Your mocks live
  under `pipeline/steps/10-panels-assembly/mocks/`.
- ⚠ **Do not edit `SPEC.md`.** §6.1's placement and its numbers are the **owner's** (ANCHOR §8
  rule 3). You propose; the owner rules; a later loop implements.
- **Do not commit.**

## 3. The constraints your arrangements must satisfy

- **Decision 7: it is a wall panel nobody stands at.** A scroll region on a wall is a region nobody
  scrolls. Anything below the fold is invisible in practice, not merely inconvenient.
- **§6.2 fixes panel CONTENT.** You may change **placement and sizing**; you may not drop a row §6.2
  requires. Chart *height* is not content — **L9 established sizing is the grid's decision**, and
  `CHART_SIZE` in `components/grid.tsx` is the lever.
- **COOLING's two-row span is settled and load-bearing**: §6.1 says its shared-time chart needs the
  height, and *"when the GPU temperature trace and the fan RPM trace are drawn on shared time, the
  engage/release behaviour is legible at a glance — the single most useful thing this panel can
  do."* If an arrangement shortens it, **say what is lost**.
- **SAFETY is *"the panel that earns the dashboard's existence"*** and §6.2 says it does not get
  hidden behind a tab. Treat it as immovable from the wall view.
- ⚠ **Budget for what the measurement did NOT include:** §6.4's alarm banner adds to the 49px band,
  and toggling any panel to **table view** adds up to `--table-scroll-max: 40vh` = **432px at 1080**.
  An arrangement that only just fits is an arrangement that breaks the first time an alarm fires.
  **State the margin.**
- The four breakpoints (≥1600 / 1280–1599 / 900–1279 / <900) still exist. Below 1280 scrolling is
  already accepted; your arrangements must not make **those** worse.

## 4. Where SERVING and the SESSION EVENT LOG go

The owner ruled them off the single screen. **Where they land is part of your design**, and it is a
real question, not a detail: §6.2 requires both, and §1's *"Prometheus scrapes the same JSON"* does
not cover a human wanting to see instance health. Options to weigh and cost: a second route, a
disclosure the wall never opens, a compact strip in the sticky band, folding SERVING's per-instance
state into an existing panel. **Recommend one and say what it costs.**

## 5. Method

`MOCK.html` in the repo root is a **reference, never a source** — and it renders strings this box
never produces (a GPU name and a short bus id). Do not copy from it.

Your mocks should reproduce the **real** rendered dimensions. The cheapest honest route is to drive
the actual app and override the grid CSS in the page, so panel content is genuine rather than
approximated; `measure-breakpoints.mjs` already shows how to run the app logged-in under CDP and how
it fabricates telemetry with `page.route`. Reuse that machinery.

⚠ **If you launch a browser, close only what you launched** — the user's own Chrome is running on
this machine. Leave no dev server and no `.env`.

## 6. Deliverable

`pipeline/steps/10-panels-assembly/10d-layout-replan.md`, plus mocks under
`pipeline/steps/10-panels-assembly/mocks/`. The document must contain:

1. Each arrangement, drawn as §6.1 draws its layout (the ASCII grid), with **measured** heights per
   viewport and the **margin** left for the banner and a table toggle.
2. What each costs — named panels, named legibility trades.
3. Your recommendation, and the argument against the runner-up.
4. **The builder specification**: exact CSS grid definitions, exact `CHART_SIZE` values, exact slot
   assignments per breakpoint, and the SERVING / event-log destination — written so an implementing
   agent needs to decide nothing.
5. Anything §6.1 or §6.2 does not settle, recorded as an owner question rather than assumed.

Report back a short summary. The parent will not read your transcript.
