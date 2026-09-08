# Q2-S2 — the table view scrolls within its own container

Implements the owner's 2026-09-08 ruling (`SPEC.md` §6.2), closing F10 from
`pipeline/steps/Q2-hover-and-table/reconciliation.md`. Scope: `components/` and step 9's
harness only. No row cap, no decimation — every row stays in the DOM, in both
`StackedTimeSeriesChart` and `Sparkline`.

## What changed

- **`components/tokens.css`** — new shared token `--table-scroll-max: 40vh`, with a comment
  explaining it is a stopgap (see "The `max-height` decision" below).
- **`components/stacked-time-series-chart.tsx`** — `ChartTableView`'s outer
  `<div role="group" aria-label={ariaLabel} data-role="table-view">` gained `tabIndex={0}`.
  Module doc gained a Q2-S2 section recording the reasoning.
- **`components/stacked-time-series-chart.module.css`** — `.tableView` gained
  `max-height: var(--table-scroll-max)` + `overflow-y: auto` + a `:focus-visible` outline.
  `.table` switched `border-collapse: collapse` → `separate` + `border-spacing: 0`. New rule
  `.table thead th { position: sticky; top: 0; background: var(--surface-1); z-index: 1; }`.
- **`components/sparkline.tsx`** — `SparklineTableView` now wraps its `<table>` in a new
  `<div className={styles.tableView} role="group" aria-label={ariaLabel} tabIndex={0}
  data-role="table-view">` (this table previously had no wrapping group at all —
  `data-role="table-view"` moved from the `<table>` to this new div). The `<caption>` is
  unchanged. Module doc gained the equivalent Q2-S2 section.
- **`components/sparkline.module.css`** — new `.tableView` block (same max-height/overflow-y/
  focus-visible as the chart's), `.table` switched to `separate`/`border-spacing: 0`, and the
  identical `.table thead th` sticky rule.
- **`components/stacked-time-series-chart.test.tsx`**, **`components/sparkline.test.tsx`** —
  one new ⚠ test each (see below).
- **`pipeline/steps/09-ui-primitives/regressions.py`** — two new mutations (`Q2-TV11`,
  `Q2-SP13`); `Q2-TV6`'s anchor and `Q2-SP10`/`Q2-SP11`/`Q2-SP12`'s anchors updated to match
  the moved/re-indented source lines (see "Anchors touched by the sparkline's new wrapper"
  below).

## Keyboard reachability

Per the handoff: check what already provides `role`/`aria-label` before adding a second name.

- **Chart**: `.tableView` already carried `role="group" aria-label={ariaLabel}` (from Q2's F3
  fix). I only added `tabIndex={0}` to that same element — no new name.
- **Sparkline**: this table had no wrapping group at all before this change (just a bare
  `<table>` with a `<caption>`). I added one wrapping `<div role="group" aria-label={ariaLabel}
  tabIndex={0}>`, reusing the component's already-required `ariaLabel` prop rather than adding
  a new prop or an `id`-based `aria-labelledby` (which would need a per-instance unique id this
  component does not have — three sparklines render on one page, and inventing an id here would
  reproduce the exact collision risk `StackedTimeSeriesChart`'s own `id` prop doc already warns
  about). The inner `<table>` keeps its own `<caption>` with the identical text. That is not a
  second, competing name — it is the documented pattern for a keyboard-scrollable table (WCAG's
  "scrollable data table" technique: a focusable wrapper plus the table's own name underneath),
  and it only exists because nothing named this container before.

Verified in a real browser (see "Manual verification" below): a single Tab reaches the group,
and the `:focus-visible` outline renders around the whole scroll box.

## The `max-height` decision

`--table-scroll-max: 40vh`, in `tokens.css`, used identically by both table views.

**Why viewport-relative, not a pixel count:** §6.1 makes real sizing the grid's decision, and
step 10 has not built the grid yet — the same reason step 9 deferred the sparkline's own sizing
(L9). `PanelShell`'s `.body` already carries `min-height: 0` in anticipation of a bounded
ancestor, but nothing above it is bounded today, so a percentage `max-height` would resolve to
"none" and do nothing until the grid exists. A literal pixel number picked today would be
exactly the "magic number pretending to be layout" the handoff warns against — it could not be
justified from any real panel dimension, because no panel has a dimension yet. `vh` at least
ties the bound to the same quantity §6.1 itself measures the no-scroll promise against ("the
panel is ~1026px tall at 1280 wide").

**Why one shared number, not two tuned per component:** I considered giving the (larger)
cooling chart and the (smaller) sparkline card different defaults, but rejected it — any split
would be exactly as guessed as a single number, and pretending otherwise by presenting two
different "reasoned" values would be worse than one honest stopgap. `--table-scroll-max` is
ONE token so step 10 has one place to change it, or to delete it once real sizing exists.

**Recorded for step 10:** once a panel body has a genuine bounded height (from CSS Grid row
sizing), `.tableView`'s `max-height` should become `max-height: 100%`, inheriting that height,
rather than staying a guessed viewport fraction forever. This is written into both components'
module docs and into `tokens.css`'s comment, per the handoff's instruction to record it as
step 10's if the grid is the true answer.

## Sticky header

`position: sticky; top: 0` on `.table thead th`, with `background: var(--surface-1)` (so
scrolled body rows don't show through) and `z-index: 1`. `.table` switched from
`border-collapse: collapse` to `separate` + `border-spacing: 0` first, because sticky
positioning on a table cell is documented as unreliable in WebKit under `collapse`; this
table has no vertical borders anywhere, so the switch changes nothing visible.

**It genuinely works — verified in a real browser, not assumed.** `renderToStaticMarkup`
produces no DOM and jsdom does no layout, so nothing in this repo's test suite could confirm
sticky behaviour; I did not want to write "should work" from CSS-spec reasoning alone, so I
built a static HTML page reusing the exact, unmodified content of `tokens.css`,
`stacked-time-series-chart.module.css` and `sparkline.module.css` (concatenated verbatim, so
every selector is the real one — `.tableView`, `.table thead th`, etc. — with none of the
project's own CSS-module hashing, which doesn't change what the selectors match), with
hand-written markup matching the two components' exact table-view output (both plots of the
cooling chart at 60 rows each, plus a 60-row sparkline table), opened in Chrome via the
`claude-in-chrome` tool. Confirmed, with screenshots and a `getComputedStyle`/
`getBoundingClientRect` check:

- The box genuinely scrolls and is genuinely bounded (`scrollHeight` 1146px vs `clientHeight`
  541px in one run) — it is not merely tall-looking content that happens to fit.
- The header row of the FIRST plot's table (`time / GPU 0 / GPU 1`) stays pinned to the top of
  `.tableView` while its own rows scroll underneath it (`rectTop === scrollBox's own
  boundingClientRect top` after scrolling 500px).
- Scrolling far enough to reach the SECOND plot's table, its own header (`time / fan 5`)
  appears and sticks in turn — each table's header is bounded to its own table's extent, not
  the whole `.tableView`, which is the correct per-plot behaviour and not something I could
  have asserted from the CSS text alone.
- The sparkline's own table view showed the identical behaviour.
- Tabbing onto the page landed focus directly on the `.tableView` `<div>` (`role="group"`,
  correct `aria-label`, `tabindex="0"`), and the `:focus-visible` outline rendered visibly
  around the box.

**Honest limits of that verification:** it is a hand-built reconstruction of the two
components' table-view markup and the real, unmodified CSS files — not a render of the actual
React tree through the actual app (the grid/pages that would host these components don't exist
yet, per step 10's scope), and not an automated, repeatable check — it was a one-time manual
visual/DOM inspection, not something this harness now guards. If a future change to either
`.module.css` file breaks the sticky rule, nothing in `pnpm verify` or the regressions harness
will catch it; that gap is real and is the same gap named in the ⚠ test note below.

## The ⚠ test and its mutation

One test per component, both named `⚠ the table view's own group is a keyboard-focusable
scroll container, not merely a styled box`, in a new `describe('⚠ Q2-S2 — the scrolling table
view is reachable by keyboard', …)` block in each `.test.tsx` file.

**What it asserts, and why this property specifically:** the `max-height`/`overflow-y`/
`position: sticky` CSS is not observable from `renderToStaticMarkup` — this suite never
constructs a DOM, so no assertion here could tell a working scroll container from a decorative
one. Per the handoff's warning against naming a test as though it proves behaviour it cannot
see, I did not write a test that claims to prove scrolling or stickiness. What IS structure,
and is the one part of the fix a wrong implementation would plausibly omit, is
`tabindex="0"` on the exact element that already carries the table view's accessible name.
The test regex-extracts that one opening tag (`/<div[^>]*data-role="table-view"[^>]*>/`) and
asserts `role="group"`, the caller's `aria-label`, and `tabindex="0"` are all on it — not
merely present somewhere in the document, which a looser `toContain` check would have allowed
even if `tabIndex` had landed on some unrelated node.

**The mutation, and why it is not equivalent to anything already in the harness:**
`Q2-TV11`/`Q2-SP13` each remove `tabIndex={0}` from the respective source line, restoring the
table view to exactly its pre-S2 shape (scrollable-looking, in fact not yet scrollable-CSS
here since these mutations don't touch the CSS, but specifically *unreachable by keyboard*).
This is the literal defect the ruling itself calls out — "a scrollable region that only a
mouse can reach fails the very floor this is meant to hold up" — and is a mistake someone
would plausibly make: add the `max-height`/`overflow-y` CSS, ship it, and forget the
accessibility half. It is not subsumed by any existing mutation: no other `Q2-TV*`/`Q2-SP*`
mutation touches `tabIndex`, and `Q2-TV6` (which removes `role`/`aria-label` from the same
line) is a different defect (name loss, not keyboard reachability) — I confirmed both stay
independently meaningful by running the full harness after the change (see below): `Q2-TV6`
reddens the F3 name test (and, as a side effect, also reddens the new Q2-S2 test, since losing
`role="group"` also breaks the "same opening tag has role+aria-label+tabindex" assertion —
expected overlap, not a sign either mutation is inert), while `Q2-TV11`/`Q2-SP13` redden ONLY
the new Q2-S2 tests.

**Anchors touched by the sparkline's new wrapper.** Wrapping the `<table>` in a new `<div>`
re-indented everything inside it by one level (2 spaces) and moved `data-role="table-view"`
off the `<table>` onto the new `<div>`. Three existing mutations in `regressions.py` had
exact-string anchors that would otherwise have gone stale (`ANCHOR NOT FOUND`, "the
implementation moved"):

- `Q2-SP10`'s `<caption>` anchor (6→8 spaces of indent).
- `Q2-SP11`'s and `Q2-SP12`'s `<th scope="row">`/`<td>` anchors (12→14 spaces of indent).

I updated all three anchors to match the new source exactly, verified via the full harness run
below (none reported `ANCHOR NOT FOUND` or `ANCHOR AMBIGUOUS`). `Q2-TV6`'s anchor was also
updated to include the newly-added `tabIndex={0}` in the "correct" line it restores from
(its `new` string — the broken variant — keeps `tabIndex` and drops only `role`/`aria-label`,
since that mutation is specifically about the name, not about keyboard reachability).

## `pnpm verify`

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
```

Run twice (before and after the harness, never concurrently with it):

```
Test Files  67 passed (67)
     Tests  2260 passed (2260)
Type Errors  no errors
```

Both runs: **EXIT 0**.

## Harness result

```
python3 pipeline/steps/09-ui-primitives/regressions.py
```

```
Red-test ledger: 136 distinct failing tests across 95 mutations; 105 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 95 regressions failed their check, as they must.
```

**EXIT 0.** 95 = the 93 the handoff named plus `Q2-TV11` and `Q2-SP13`. No `ANCHOR NOT FOUND`,
no `ANCHOR AMBIGUOUS`, no `DID NOT BITE`. Both new ⚠ tests appear in the covered set (confirmed
in the per-mutation output: `Q2-TV11` and `Q2-SP13` each report exactly the new Q2-S2 test in
their red set, and no other mutation's red set is empty).

## `git status` after the harness

```
 M dashboard/SPEC.md
 M dashboard/components/sparkline.module.css
 M dashboard/components/sparkline.test.tsx
 M dashboard/components/sparkline.tsx
 M dashboard/components/stacked-time-series-chart.module.css
 M dashboard/components/stacked-time-series-chart.test.tsx
 M dashboard/components/stacked-time-series-chart.tsx
 M dashboard/components/tokens.css
 M dashboard/pipeline/steps/09-ui-primitives/regressions.py
?? dashboard/pipeline/handoffs/Q2-S2-table-scroll.md
```

No stranded mutation (`SPEC.md`'s modification is the parent's pre-existing ruling, untouched
by me; the handoff file is the parent's own artifact). Nothing outside `components/`,
`pipeline/steps/09-ui-primitives/regressions.py`, and this deliverable changed. Not committed,
per the operational rules.
