# Handoff — Step 10c-1: wire the panels, and make the browser check repeatable (BUILD)

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

Read: this file → `steps/10-panels-assembly/SCOPE.md` (**you are 10c, first of three parts**) →
`components/panel-props.ts` → `pipeline/HANDOVER.md` §0.3, §0.5, §3.5, §3.6 → `SPEC.md` §6.1, §6.2
→ `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

⚠ **Load the `dataviz` skill** — the assembled page is charts, meters and stat rows.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `be53c8d`.

---

## 1. Why this is the piece that matters

**The nine panels have no production call site.** `app/dashboard-shell.tsx` renders
`PanelPlaceholder` in all nine slots (lines ~206–217); I verified this. So every panel test renders
**in isolation**, and *nothing in this project has ever rendered the actual dashboard*. Step 10's
green criterion — *"grid matches §6.1 placement; paused shows mode and alarm count"* — has been
verified against placeholders.

**Expect this to find things.** Composition is where SVG id collisions, CSS module collisions, a
panel overflowing its cell, and duplicate DOM ids live. 10b's adversarial confirmed `panelId` is
used everywhere an id is minted — but it tested nine panels mounted in a test, not in the real grid.

## 2. What to build

### 2.1 The wiring

Replace the nine `PanelPlaceholder`s with the real panels. Notes:

- `GpuPanel` **narrows `panelId` and derives its own index** (from 10b-S-F's work) — it takes no
  `index` prop. Do not pass one.
- `PanelPlaceholder` becomes unused. **Decide and record**: delete it, or keep it for a reason you
  state. HANDOVER's do-not-copy list is against leaving a thing that implies a mechanism that no
  longer runs.
- ⚠ **`app/` may use hooks; `components/` may not.** `purity.test.ts` walks `components/`
  recursively. Nothing you add under `components/` may call a hook.

### 2.2 Q2-S2's table toggle — now unblockable

Q2 built a `view: 'chart' | 'table'` prop and the owner ruled the table view is an **accessibility
floor** that scrolls in its own container. 10b recorded that **nothing can flip it**: the state
cannot live in a hook-free panel and the shell did not own it. **The shell owns it now.**

Wire it. ⚠ **The control is not one of §6.2's four dashboard controls** — §6.2 is explicit that its
header list is exhaustive and that a tooltip or table view is part of a chart, not a control of the
page. So it belongs **with the chart**, not in the header. If §6.2 does not say where, that is
invariant 7: **record it** rather than inventing a header control.

### 2.3 The repeatable browser check (10a-F4)

10a's §6.1 placement was measured once, by hand, in Chrome. **Nothing repeats it**, and 10b's nine
panels have now landed in those exact cells. Make it repeatable. Two parts, and the second is what
10a's manual pass could not do:

1. **The seven viewport measurements** — COOLING's two-row span in columns 1–2, the breakpoints at
   899/900 and 1279/1280, the <900 panel order.
2. ⚠ **A way to force an alarm client-side.** Without it the banner never mounts — which is exactly
   why the manual pass could not have caught 10a's z-index occlusion bug. Whatever mechanism you
   choose must be **test-only and unreachable in production**; say how that is enforced.

**Invariant 6: no dependency without a recorded reason.** If this needs a headless browser, record
what it buys **and what it costs step 11's image** — and *verify* rather than assert whether it
reaches that image (10a did exactly this for jsdom by inspecting `.next/standalone`).

If you conclude the browser step belongs in a separate loop, **say so with the argument** rather
than half-building it.

## 3. Not yours — 10c-2 and 10c-3

**10c-2 (guards):** Q1-F4's cross-harness runner · the `toContain` lint · L11's unit-name constant
· `exactOptionalPropertyTypes` (**measured free today** — `npx tsc --noEmit
--exactOptionalPropertyTypes` exits 0).
**10c-3 (sizing/visual):** L9 · F14b's gap hatching · `--table-scroll-max: 40vh` →
`max-height: 100%` (2.5f) · Q2-F9's clamp-vs-drop.
**Owner:** S-G-Q1…Q4, F14a, D1.

Touching one of these because it blocks you is fine — **say so and keep it minimal.**

## 4. The bar

- ⚠ **A document-wide `expect(html).toContain(…)` has fooled FOUR loops here** (`'paused'`,
  `'refresh'`, `'—'`, `'data-severity="none"'`). On an assembled page with nine panels it is
  worthless. **Scope every assertion.**
- ⚠ **HANDOVER §0.5:** *a harness proves every ⚠ test can fail, never that every branch has one.*
  10b's A1 was an unmutated line in a file that had mutations. New branches need their own.
- Mark load-bearing tests `⚠`; back each with a **`10c-`**-prefixed mutation in step 10's harness.
- **Invariant 1** both directions. **Invariant 2**: read-only — the toggle changes the browser's
  rendering, nothing else.
- **Invariant 7:** if the spec is silent, **STOP and record it.**

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 138 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**.
- ⚠ **Never poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; orphans killed twice).
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **If you run a dev server, stop it and leave no `.env` or secret behind** — the parent checks.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**
- `ai-server` is **read-only** to this work and you do not need it.

## 6. Deliverable

`steps/10-panels-assembly/10c1-build.md`: what the assembled page revealed (findings from
composition are the point of this loop), the `PanelPlaceholder` decision, where the table toggle
went and why, the browser step's shape and its dependency reasoning with the image measurement,
your ⚠ marks and mutations, and every gap recorded. End with `pnpm verify`, the harness result, and
`git status`.

Report back a short summary. The parent will not read your transcript.
