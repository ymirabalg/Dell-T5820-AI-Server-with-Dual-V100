# Handoff — Q2: the chart hover layer and table view (BUILD phase)

**Written by the parent, 2026-09-08.** You are a fresh agent with no memory of this project.
Read this file, then `SPEC.md` §6.2 (the amendment at line ~953) and §9's chart-interaction row
(~line 1464), then `pipeline/ANCHOR.md` §4/§5/§8, then `pipeline/PLAN.md`'s seven invariants.

⚠ **Load the `dataviz` skill before writing any chart code.** `ANCHOR.md` §8 requires it for
anything with a chart, meter or stat row, and step 9's own reconciliation was decided partly on
its rules.

Branch `dashboard-frontend`, working directory `dashboard/`.

---

## 1. Why this item exists

Step 9 built the chart primitives **before** §6.2 was amended. The build phase correctly recorded
the absence of a hover layer and table view as a spec gap under invariant 7 ("if the spec is
silent, STOP and record it"). The owner then ruled — *do not fight `dataviz` to strip its
defaults; amend the spec instead* — and §6.2 now says:

> **Charts carry a hover layer and a table view, and both are DEFAULTS rather than requests.**

So this is no longer a question. It is unbuilt work with a spec behind it. §6.2 asks for:

- a **crosshair + tooltip** on a line or area plot,
- a **per-mark tooltip** on bars and dots,
- a **table view** so the numbers are reachable without reading pixels.

§6.2's stated reasoning, which should shape your design: they **cost nothing when unused** (a
tooltip that never fires renders nothing and takes no grid space, so §6.1's no-scroll promise is
untouched); **the wall is not the only viewer** (the same page is opened on a laptop exactly when
reading a value off a 600-point trace by eye is worst); and **the table view is an accessibility
floor, not a convenience** — it is what makes the content reachable when colour, size or vision
make the marks unreadable, and §9 already forbids identity resting on colour alone.

⚠ §6.2 also says these remain **outside its four dashboard controls** (cadence, window, refresh,
pause). A tooltip is part of a chart, not a control of the page. Neither writes to the server —
invariant 2, read-only, always.

## 2. ⚠ The constraint that decides the architecture — verified by the parent

**`components/purity.test.ts` forbids every React hook in `components/`.** Not a name blocklist —
it matches the *shape* React mandates (`use` followed by a capital, called), so `useState`,
`useId`, `useSyncExternalStore` and hooks React has not shipped yet are all caught. It **walks the
directory recursively**, so `components/panels/*.tsx` is inside the guard too.

That is not an obstacle to route around. It is the architecture: **`components/` is the pure
presentation layer and state lives in `app/` and `lib/client/`.** Two consequences, and they match
decisions this project already took:

- **The chart/table toggle is a PROP, not internal state.** Step 9 deferred L9 (the sparkline's
  sizing) with the reasoning *"sizing is the grid's decision, and a primitive that picked its own
  size would be deciding layout from a leaf."* A primitive that owned its own view toggle would be
  deciding page behaviour from a leaf in exactly the same way. The stateful owner is step 10's.
- **The hover layer must be CSS/SVG-native**, not pointer-event JS: SVG `<title>` gives a native
  tooltip for free, and `:hover` with sibling/descendant selectors can reveal a crosshair band
  without a single hook. If some part of §6.2's crosshair genuinely cannot be done without pointer
  coordinates, **record that as a gap** rather than smuggling in state or weakening
  `purity.test.ts` — and say precisely which part.

**Challenge this reading if you think it is wrong** — say so in your notes with the argument. What
you must not do is quietly relax the guard.

## 3. What exists now

`components/`: `palette.ts`, `chip.tsx`, `row.tsx`, `meter.tsx`, `panel-shell.tsx`,
`sparkline.tsx`, `stacked-time-series-chart.tsx`, plus `tokens.css` and per-component
`*.module.css`, and the guards `purity.test.ts` / `styles.test.ts`.

The chart's public surface today:

```ts
interface ChartSeries { id; label; color; dashed?; points: readonly SeriesPoint[]; endLabel? }
interface ChartPlot   { id; series; formatTick: (v:number)=>string; yMin?; yMax? }
interface StackedTimeSeriesChartProps {
  id; ariaLabel; plots; gaps: readonly Gap[]; domainStartMs; domainEndMs;
  formatTime: (ms:number)=>string; width?; plotHeight?;
}
Sparkline({ points, color, width = 96, height = 24 })
```

Note `gaps` — the chart already models missing time explicitly. **A table view must represent gaps
and nulls as honestly as the chart does.**

## 4. Rules you will get wrong if you skim

- **Invariant 1: `null` is not `0`.** `null` renders `—`; zero renders the numeral **with its
  unit**. In a table of readings this is the single easiest thing to break, and it is the
  project's first invariant. Use the `lib/format.ts` formatters; do not write your own, and do not
  hard-code a unit string (step 9 deferred L11 because no guard yet stops that — do not be its
  first violation).
- **§6.7's 600-point budget is PER SERIES.** A hover band per point per series is a real cost;
  say what your approach costs at 600 × N and whether it is acceptable.
- **Unique SVG `id`s across instances are the CALLER's obligation**, stated in the prop docs —
  step 9 rejected L4 because `useId` is a hook. Any new `id` you introduce follows the same rule
  and must be documented the same way.
- **Mark load-bearing tests `⚠`** and expect the red-test ledger to hold them. A ⚠ mark with no
  mutation behind it fails the harness — that is the mechanism Q1 just repaired.
- ⚠ **Mutation ids now carry their creating step's id as a prefix** (`Q2-...`), a convention
  added 2026-09-08. If you add mutations to step 9's harness, use `Q2-` — provenance, not host.
- **A test that names a property it does not check has appeared in every single step.** Read each
  test name against its body before you finish.

## 5. Toolchain and hygiene

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0, never a printed summary
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never run `pnpm verify` alongside a `regressions.py` harness, and never two harnesses at once.
- ⚠ Never sleep-poll `pgrep -f regressions.py` — it matches your own shell. Use
  `pgrep -f "regressions[.]py"`.
- `git status` after anything that mutates the tree.

## 6. Scope

- **`components/` only**, plus its tests and CSS. Do not touch `lib/`, `app/`, or `SPEC.md`.
- **Do not commit.** The parent commits after running `pnpm verify` itself and reviewing.
- Nothing outside `dashboard/` changes.
- Invariant 7 still binds: **if the spec is silent, STOP and record it** as a gap. The owner
  answers spec questions; phases never write spec wording. §6.2 tells you *what* is required and
  deliberately does not tell you *how* — design decisions are yours to make and to record, but a
  genuine requirement gap is the owner's.

## 7. Deliverable

`pipeline/steps/Q2-hover-and-table/build.md`: what you built and why, the design decisions with
their reasoning (especially anything where §6.2 was silent), what `dataviz` said and where you
followed or departed from it, the 600-point cost analysis, your ⚠ marks and the mutations backing
them, and any spec gap you are recording. End with `pnpm verify` result and `git status`.

Report back a short summary. The parent will not read your transcript.
