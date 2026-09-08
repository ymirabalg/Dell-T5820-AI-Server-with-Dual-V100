# Handoff — Q2-S2: the table view scrolls within its own container

**Written by the parent, 2026-09-08, implementing an owner ruling.** Fresh agent, no memory of
this project. Read this file, then `SPEC.md` §6.2 (the **2026-09-08 ruling** block) and §6.1's
no-scroll paragraph, then `steps/Q2-hover-and-table/reconciliation.md` (finding **F10**), then
`ANCHOR.md` §4/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree has **`SPEC.md` modified by the
parent** — that is the ruling you are implementing. **Do not edit `SPEC.md` yourself.**

## Why this is not a full four-phase loop

Q2 already ran build → test → adversarial → reconcile. F10 was **deferred to the owner**, not
rejected, because every fix traded against a different part of the spec. The owner has now ruled.
This is the implementation of a settled decision, so it is one build pass plus the parent's
review — the loop's judgement work was already done and does not need repeating.

## The finding, as measured by the adversarial phase

`.tableView` has **no `max-height` and no `overflow`**. Measured: **1,202 `<tr>`** for a 120-minute
window and **~722** for the default 30-minute one, i.e. 12,000–20,000px of table rendered into a
fixed grid cell. The build's cost analysis was correct about the chart's hover layer and never
computed the table's height.

## The ruling — implement exactly this

**The table view scrolls within its own container: `max-height` plus `overflow-y`.** §6.1's
no-scroll promise governs the **page**, not a component; the spec already specifies the session
event log as "a compact scrolling list", and §6.1 now says so explicitly.

Capping or decimating rows was **considered and rejected** — a decimated table is no longer a
complete substitute for the chart, which is the ground on which the table is an accessibility
floor and the ground on which `build.md` §3.6 declined keyboard parity. **Do not implement a row
cap**, and do not decimate.

Applies to **both** components' table views: `stacked-time-series-chart` and `sparkline`.

## What to get right

- **Keep every row in the DOM.** The scroll is the whole point: all readings stay reachable.
- **The scroll container must be reachable by keyboard.** A scrollable region that only a mouse
  can reach fails the very floor this is meant to hold up — a `tabindex="0"` on the scroll box
  is the usual answer, with an accessible name. Check what the existing `role="group"` /
  `aria-label` on the table view already provides and do not duplicate a name.
- **Sticky header if it is cheap and honest.** A scrolled table whose `<th>`s have gone is worse
  than one without a scroll. If `position: sticky` on the header row works here, use it; if it
  does not, say so rather than faking it.
- ⚠ **`max-height` must not be a magic number pretending to be layout.** §6.1 is explicit that
  sizing is the grid's decision and step 9 deferred the sparkline's sizing (L9) for exactly that
  reason. Prefer a relative bound, and **say in your notes what you chose and why** — if the true
  answer is that the grid must supply it, record that as step 10's and pick a defensible default.

## The bar this project holds

- **Mark the load-bearing test `⚠`** and add a **`Q2-`-prefixed** mutation backing it in
  `pipeline/steps/09-ui-primitives/regressions.py` (ids carry their creating step — ANCHOR §9).
  A ⚠ mark with no mutation fails the harness.
- ⚠ **Beware the equivalent mutation.** Q2's own reconciliation caught two of its mutations
  turning vacuous when a new guard subsumed an old one — they would have printed `DID NOT BITE`,
  which reads as an inert test when the truth is a vacuous mutation. Your mutation must be a
  **wrong implementation somebody would plausibly write** and must redden **deterministically**.
- ⚠ **A CSS-only property is not observable in jsdom.** If your test can only assert that a
  stylesheet contains a string, **say so plainly** and do not name the test as though it proves
  behaviour. "A test that names a property it does not check has appeared in every single step."
  Prefer asserting the rendered structure you control (the container element, its attributes)
  over grepping CSS.

## Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                # green is EXIT 0
python3 pipeline/steps/09-ui-primitives/regressions.py     # 93 mutations before your change
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness.** A `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever — five hours lost 2026-09-08
  (ANCHOR §9). Plain **sequential foreground commands**.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit.** **Do not edit `SPEC.md`.** **Do not weaken `purity.test.ts`** — no hooks.
- Scope: `components/` and step 9's harness only.

## Deliverable

`steps/Q2-hover-and-table/s2-table-scroll.md` — what you changed, the `max-height` decision and
its reasoning, keyboard reachability, whether sticky headers worked, your ⚠ test and its mutation,
and honestly whether the test observes behaviour or structure. End with `pnpm verify`, the harness
result, and `git status`. Report back briefly.
