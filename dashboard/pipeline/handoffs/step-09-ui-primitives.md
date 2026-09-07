# Handoff — step 9: UI primitives & charts

**You are the BUILD phase.** Clean context. This is the first step that renders anything.

**Read, in order:** this file · `SPEC.md` §6.1, §6.2, §6.3, §6.6, §9 · `pipeline/HANDOVER.md`
(§1 how to run, §3 the surface, §5 the structural rules, **§6 the twelve rules**, §7 do-not-copy)
· `pipeline/UI-BACKEND-GAPS.md` (what exists and what does not).

**Green when** (PLAN.md): render tests distinguish `null` → `—` from `0 RPM`, and the cooling
chart is **two stacked plots, never a dual axis**.

---

## 1. Scope

Panel **shell**, **chips**, **meters**, **rows**, **sparkline**, **stacked cooling chart**.
Primitives — not the nine panels, not the grid assembly, not the header. **Those are step 10.**
If you find yourself writing `GpuPanel`, stop: you are building step 10's job out of order and
step 10 will have to unpick it.

`components/` does not exist yet (§2.4 places it at `dashboard/components/`).

## 2. ⚠ How React is tested here: no jsdom, and that is not a limitation

Step 7 set the pattern and it works: **`react-dom/server`'s `renderToStaticMarkup` in plain
Node.** `LoginCard` is a pure function of a `LoginView`, so all six of §5.2's states render and
assert without a DOM, a testing library, or a dependency.

**Do the same.** Every primitive is a **pure function of props**. A component that needs a DOM to
be tested is a component that has state it should not have — push the state up to step 10.

⚠ **Do not add jsdom.** Invariant 6, and HANDOVER's D6 records what would justify it (an
unmount assertion on `useTelemetry`, which is not yours). If you believe a primitive genuinely
cannot be tested this way, **that is a finding to report, not a reason to add a dependency.**

## 3. What already exists — do not rebuild any of it

| you need | it is already there |
|---|---|
| every reading | §4's snapshot, validated by `wire.ts` |
| **a cell's colour** | `lib/severity.ts` — a function for **all fifteen** of §6.3's rows |
| the banner / log / dot / count | `state.displayed`, `state.events`, `state.severity`, `state.alarms` |
| **a trace** | **`traceFor(state, pick)`** — window → series → decimate, in the one order that is right |
| hatched gaps | `state.gaps`, with real endpoints |
| **an em dash's explanation** | **`errorsForPanel(snapshot, panel)`** |
| every number as text | `lib/format.ts` — ~20 formatters, `en-US` pinned once |
| throttle bits | `decodeThrottleMask` — code + name, unknown bits at `watch` |

⚠ **Never format a number yourself.** §6.6 is implemented once, in `format.ts`, and invariant 1
(`null` → `—`, `0` → `0 RPM`) lives inside those functions. `String(x)`, `.toFixed()` or a
template literal around a reading is a defect, not a shortcut.

⚠ **`formatUptime` already carries the word "up"** (`up 2 d 02:01`). A header that composes
`up ${formatUptime(...)}` prints `up up 2 d 02:01` — measured on the live box.

## 4. §6.2's panel head — new on 2026-09-07, and it is why four fields exist

**Every panel is `title · subtitle · chip`.** The subtitle is **identity, never measurement** —
it answers *what am I looking at*, so it must not change on a poll.

| panel | subtitle |
|---|---|
| **GPU 0 / GPU 1** | `<name> · <bus>` — **both raw**: `Tesla PG500-216 · 00000000:17:00.0` |
| **CPU** | `<cpuModel> · <cores>C / <threads>T` |
| cooling · memory · serving · safety · storage | a fixed source label |

⚠ **The GPU name is the driver's string and is NOT prettified**, and **the bus is the full domain
form, never trimmed to `17:00.0`.** Both are §6.6 rows. `MOCK.html` gets both wrong — it shows
`Tesla V100-PCIE-32GB`, a string this box never produces, and the short bus form.

## 5. The `dataviz` skill — load it, and where `SPEC.md` overrides it

**Load the `dataviz` skill before writing the first line of chart code.** It is
design-system-agnostic by construction: *"A design system supplies a small set of parameters …
the method consumes them unchanged."*

**`SPEC.md` §9 IS that design system. Feed it to the skill; do not let the skill replace it.**

| the skill says | §9 already fixes it |
|---|---|
| categorical hues in fixed order | **GPU 0 `#3987e5` solid · GPU 1 `#199e70` dashed · fan 5 `#d95926`** |
| run `validate_palette.js`, never eyeball | §9 records *"validated all-pairs, worst protan/deutan ΔE 9.4"* — the skill's target is ≥ 8. **Re-run the validator to CONFIRM, not to re-choose**, in `--mode dark` against the panel ground |
| **never a dual-axis chart** | §9: *"Two stacked plots on one shared x-axis. Never a dual y-axis on one plot."* **Identical rule.** |
| identity never by colour alone | §9: *"Colour **plus** dash pattern **plus** a direct end-label"* |
| status colours are reserved | §6.3's `normal`/`watch`/`alarm`. Never reuse one as a series hue |
| dark mode is *selected*, not flipped | Decision 9: **single dark theme**, background painted explicitly. There is no light variant |
| text wears text tokens, never the series colour | keep it |

⚠ **One place the skill asks for something `SPEC.md` does not mention: the hover layer.** The
skill ships crosshair+tooltip by default. This is a **single-screen wall panel** (decision 7)
that nobody hovers, and §6.2 lists exactly four controls. **Do not invent an interaction the
spec does not ask for — record it as a gap** (invariant 7) and let the owner decide.

## 6. ⚠ The twelve rules that must not leak — HANDOVER §6, reproduced

The first three are the ones a panel undoes by accident.

1. **A cell's colour is not `displayed`.** §6.4: a cell calls `lib/severity.ts` on the **current
   reading**, undebounced. Nothing debounced is a cell colour.
2. **Do not read `conditionsFrom` in a panel.** Un-deduped by design — it emits
   `unit:gpu-fan-control.service` **twice**. `state.displayed` is the panel surface.
3. **Do not infer gaps from holes in a series.** Decimation drops a `null` inside a readable
   bucket. Hatch `state.gaps`.
4. Do not tick the age off store changes — it changes once, at the crossing.
5. **Do not render `0 alarms`, and never a negative age.** ⚠ `MOCK.html` renders the literal
   string `1 warning · 0 alarms`, which §9 forbids in as many words.
6. Nothing off the snapshot on the server-rendered shell.
7. No second spelling of `/api/telemetry`, `/login`, `/api/session`, or either unit name.
8. Do not "fix" a red-cell/green-dot disagreement in a panel — it is fixed at the reduction.
9. `latestSample` and the chart's last point **are** the same sample. Do not re-derive.
10. **600 points per series, not per chart** — the stacked chart draws up to 1,800. `traceFor`
    already does this; do not add a per-chart budget.
11. Do not read `rawSeverity`, compare severities, or hold a band outside `lib/conditions.ts`.
12. **`state === null` is *before the first poll*, not missing data.** Do not render `—` for it.

## 7. `MOCK.html` is a reference, never a source

It predates several decisions. Known disagreements, all of which the **spec wins**:

- `Tesla V100-PCIE-32GB` — a string this box does not produce (§4 above).
- the short bus form `17:00.0` — §6.6 says the full domain form.
- `1 warning · 0 alarms` — §9 forbids the zero count.
- a header meta line with an IP address and the kernel — §6.2's header is **exhaustive** and has
  neither.

**Do not import from it.** Its value is showing what the thing should look like.

## 8. Three questions the spec has NOT answered — record, do not invent

Invariant 7. All three are rendering decisions that belong to the owner:

- **S11/G5** — what a panel does with an em dash that has **no** `errors[]` entry and a
  neighbour that carries no severity (`unavailable` is not one). `errorsForPanel` makes the gap
  visible; it does not close it.
- **S19** — the sentence distinguishing a *skipped* collector from a *failed* one. The message
  text carries it; §6.5 has one bucket.
- **S30** — the tone for §5.2's *"Could not reach the dashboard."* row. One word.

## 9. Rules and the evidence bar

- **`pnpm verify` exiting 0 is the only definition of green.** Never a printed summary.
- **`pnpm build` must pass** — it type-checks everything in `tsconfig`'s include and it is the
  first step that touches `app/` since step 7.
- ⚠ **Never run a harness concurrently with `verify` or another harness.** One at a time. If you
  wait in a shell loop use `pgrep -f "regressions[.]py"` **with the brackets**, or the loop
  matches its own command line and never exits. Better: background it and use the exit status.
- **Mark load-bearing tests `⚠` and back each with a mutation**, in the harness owning that
  FILE. New files under `components/` are **step 9's own harness** —
  `pipeline/steps/09-ui-primitives/regressions.py`, which you create by copying step 8's ledger
  block verbatim and changing only `LEDGER_FILES`.
- **Every boundary guard needs a fixture on both sides.**
- **No new dependency** without recording why (invariant 6). You should need none.
- Do not touch `SPEC.md`, `MOCK.html`, `PLAN.md`. **Do not commit.** Do not touch the box.

## 10. Report back

What you built and the shape of each primitive · the CSS approach and why · the palette
validator's real output · anything the spec left open that you recorded rather than invented ·
anything you found wrong but out of scope · and the real evidence output.
