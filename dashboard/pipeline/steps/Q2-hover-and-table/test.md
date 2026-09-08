# Test phase — Q2: the chart hover layer and table view

Fresh agent, no memory of prior sessions. Read the handoff, `build.md`, `SPEC.md` §6.2/§9,
`ANCHOR.md` §4/§5/§8, and `PLAN.md`. Did not load `dataviz` (nothing here is new chart design).

## 1. Verdict up front

**Clean, with one real gap found and fixed.** All 16 of the build's Q2 mutations are sound,
deterministic, and back-check the correctly-named test. Neither re-anchored pre-existing
mutation (`09-T13`, `09-T1`) was weakened. Invariant 1 is tested on both sides, in both
components. No production call site was broken by the two new required `Sparkline` props. The
600×N cost claim's arithmetic checks out against the actual decimation code.

The one substantive finding: **none of the 16 hover tests (nor any pre-existing test) verified
the one DOM property the CSS-only crosshair mechanism actually depends on** — that each hover
zone is the *immediately following-sibling's* precondition, i.e. `.hoverZone` and its
`.crosshairGroup` must be adjacent DOM siblings for `:hover + ` to ever match anything. A
plausible, easy-to-write refactor (split the paired render into "all zones, then all groups" —
arguably *more* readable) would leave every hoverZoneCount/crosshairCount/tooltip-content
assertion unchanged while permanently disabling the crosshair in every real browser. I added one
test plus one backing mutation per component to close this (§3 below); everything else in this
report is audit, not fixes.

## 2. §3.1 — Can the hover tests actually fail, and for the right reason?

Went through every Q2 hover-layer test asking "what would have to break for this to go red."
None of them assert source text (no test reads a `.module.css` file, and none of the 16
mutations touch a `.module.css` file — see §4). Concretely, for each:

| Test | What actually has to break |
|---|---|
| `⚠ three series sharing ONE sample clock produce as many hover columns as one series has points, not the sum` | `hoverInstantsFor`'s dedup (the `Set`) — a real computation over real render output (`hoverZoneCount`/`crosshairCount` count actual `<rect>`/`<g>` nodes in the string `renderToStaticMarkup` produced) |
| `⚠ a series with no point at a shared instant renders the em dash there, never a neighbour's value` | `hoverTooltipFor`'s `undefined`-vs-`null` branching — the literal `<title>` text the component emits |
| `⚠ a null reading at a shared instant renders the em dash, not the numeral 0` | same function, the `null` half |
| `⚠ a lone-point run carries a native title…` / `⚠ an end dot carries a native title…` | the literal `<title>` string built at the mark |
| `⚠ table view draws no <svg>…` / `one table PER PLOT` / invariant-1 pair / gap row | the `view === 'table'` branch and `tableRowsFor`/`ChartTableView` — real conditional rendering, real cell content |
| sparkline's SP1–SP6 | the mirror set on `Sparkline`'s own `hoverColumnsFor`/table branch |

All of these are genuine assertions against markup the real render function produced — they are
not "grep the file for a selector string." They are honestly *not* testing that `:hover` fires
in a browser (that really is unobservable in jsdom, as the handoff says, and no test or module
comment here claims otherwise — the module doc is careful to describe the CSS mechanism in
prose, never as a tested claim). What they test is everything jsdom *can* see: the geometry
(column boundaries and counts), the tooltip content, and the table's conditional structure.

**The gap that was real:** the adjacency between a `.hoverZone` and its `.crosshairGroup`
sibling is *also* something jsdom can see (it's DOM structure, not a pseudo-class), and nothing
checked it. I added:

- `components/stacked-time-series-chart.test.tsx`: `⚠ every hover-zone rect is immediately
  followed by its OWN crosshair group, with nothing between` (new describe block `Q2 — the
  hover zone and its crosshair must be adjacent DOM siblings, not merely equal in count`).
- `components/sparkline.test.tsx`: the identical test, adapted to the sparkline's fixture.
- Backing mutations `Q2-H6` (chart) and `Q2-SP7` (sparkline) in
  `pipeline/steps/09-ui-primitives/regressions.py`: each splits the single paired
  `.map()` into two separate `.map()` calls — same hoverZoneCount, same crosshairCount, same
  tooltip text, only the DOM order changes. Verified both bite (`red=1` each) and redden
  *only* the new test — nothing else in either file's suite is disturbed by this refactor,
  which is exactly the point: it is invisible to every other Q2 assertion.

I verified the fixed markup by hand first (`renderToStaticMarkup`, no assertions, dumped to a
scratch file) before writing the regex, rather than guessing at React's Fragment-flattening
behaviour: a `<Fragment>` wrapping `<rect>…</rect><g>…</g>` per array item does flatten to
`<rect/><g/><rect/><g/>…` at the parent, which is what makes the existing (correct)
implementation's adjacency hold today — and exactly what the split-loop mutation breaks.

## 3. §3.2 — The 16 original mutations: sound, and no CSS-mutation theatre

**None of the 16 touch a `.module.css` file.** `grep -n "module.css" regressions.py` finds
exactly one CSS-targeting mutation in the whole harness (`components/row.module.css`, a
pre-existing, non-Q2 entry backing `styles.test.ts`). All 16 Q2 mutations edit
`CHART_SRC`/`SPARKLINE_SRC` (the `.tsx` files) — real logic: a dropped null-check, a `.slice(0,
1)`, a swapped conditional string, a removed `.map()`. The feared closed loop (edit the CSS
string, redden a test that greps the same string) does not occur anywhere in this harness.

For each, I confirmed (a) it is a plausible wrong implementation, (b) it reddens
deterministically (no entropy, no timing), and (c) it reddens the test whose name claims the
property — verified against the harness's own per-mutation FAIL output, not assumed from the
table in `build.md`:

- **Q2-H1** (drops the `Set` dedup) → reddens exactly the "produce as many hover columns as one
  series has points, not the sum" test. Sound: a `Set`→array-with-duplicates change is a real
  category of bug (someone "simplifying" away a dedup they didn't understand the purpose of).
- **Q2-H2** vs **Q2-H3** — I checked these are *not* redundant with each other, despite looking
  similar. H2 drops the `undefined` half of the guard (bites when a series has **no key** for
  the instant — `Map.get` returns `undefined`); H3 drops the `null` half (bites when the series
  **has** a point there but its `v` is `null`). These are genuinely different runtime states
  (`Map.get` returning `undefined` vs `null`) and each fixture in the test file exercises
  exactly one of them.
- **Q2-H4/H5** — tooltip content drops. I checked `H5`'s test specifically because `build.md`
  flagged it as tightened during the build's own review: the current assertion requires BOTH
  `GPU 0` and `69 °C` present together, not an `.toMatch(/A|B/)` that a single-half title would
  still satisfy. Confirmed in the current file — it's two `expect(...).toContain(...)` calls,
  not a disjunctive regex.
- **Q2-TV1/SP4** (`'table'` → `'chart-x'`) — a string-literal typo mutation, same style as
  several pre-existing `09-*` mutations (e.g. `09-T13`'s hardcoded aria-label). Fine: plausible
  as a rename-gone-wrong, deterministic, and reddens every table-view test at once (expected,
  since the whole branch stops firing).
- **Q2-TV2** (`.slice(0, 1)`) — reddens both the "one table PER PLOT" test and the "series
  labels become column headers" test, since dropping the second plot drops GPU 1's `<th>` too.
  Correct: this is one bug with two visible symptoms, not two mutations pretending to be one.
- **Q2-TV3** vs **Q2-TV4**, and the sparkline's **SP5** vs **SP6** — same non-redundant pairing
  as H2/H3: TV3/SP5 drop the `null` branch of the check entirely (formatter reached on `null`);
  TV4/SP6 replace the check with a **falsy** test (`!v`), which is invariant 1's classic
  mistake — zero is falsy, so a real `0` reading gets blanked. Distinct fault classes, both
  worth having.
- **Q2-SP1** (`readable.length` instead of `n`) — correctly narrower than the fix it's testing
  for: with a null point present, `readable.length < n`, so the hover-zone count silently
  drops. Confirmed the test fixture actually contains a null (it does).
- **Q2-SP2/SP3** — straightforward, confirmed deterministic and correctly targeted.

**Full harness run** (`python3 pipeline/steps/09-ui-primitives/regressions.py`, sequential,
never alongside `pnpm verify`): every mutation printed `red=N ≥ 1` against the exact test its
own name claims; no mutation produced `exit=1 Tests no tests` (the compile-error failure shape
that would mean an anchor is silently mis-aimed); no mutation was reported `ANCHOR AMBIGUOUS` or
`ANCHOR MOVED`.

## 4. §3.3 — The two re-anchored pre-existing mutations: not weakened

**`09-T13`** ("every chart announces itself as the COOLING chart"). Its bare
`aria-label={ariaLabel}` anchor became genuinely ambiguous once Q2's table view added a second,
textually-identical `aria-label={ariaLabel}` on its wrapper `<div>`. Verified by grep that the
**new** anchor — the two-line block `      role="img"\n      aria-label={ariaLabel}` — occurs
**exactly once** in the file (the empty-state branch's `aria-label` is a template literal with
different text, so it doesn't collide). I made an initial testing mistake here worth recording:
I first re-applied only half of this mutation's two substitutions by hand and got confused when
only one of the two expected tests reddened — the mutation entry is actually a **pair** of
substitutions (the empty-state's hardcoded string *and* the main chart's), both needed together
to reproduce the original two-test failure. Re-ran with both substitutions applied and got the
harness's own reported `red=2`, matching both halves of the `H1` describe block. The re-anchor
is sound and testing exactly what it tested before: the aria-label is the caller's, in both the
populated and empty-state branches.

**`09-T1`** ("the x-axis is rendered once PER PLOT instead of once, shared"). The old anchor
(`))}\n</g>\n</svg>`) silently re-aimed onto the hover layer's own closing, which now happens to
end the file with an identical three-line pattern — still a single match throughout, so
`ANCHOR AMBIGUOUS` never fired; the only symptom was a compile error. Verified: the **old**
anchor text is still unique in the current file (matches only the hover layer's closing, at the
very end) and the **new** anchor (`{formatTime(t)}\n</text>\n))}\n</g>`, unique to the x-axis
tick loop) also occurs exactly once, at the x-axis's own closing — which is *not* immediately
followed by `</svg>` (a comment and the hover `<g>` sit between them), so it can never collide
with the file's true end. Traced both substitutions together and confirmed they wrap exactly
the x-axis's own `<g data-role="x-axis">…</g>` block in a `plots.map()` — nothing of the hover
layer is included. This reddens `⚠ exactly one x-axis group with two plots` as before, one test,
not narrowed.

## 5. §3.4 — Invariant 1 in the table view, both directions, both components

Confirmed with fixtures on both sides, in both files:

- Stacked chart: `Q2-TV3`'s test uses `v: null` → expects `EM_DASH`, rejects `<td>TICK(0)</td>`.
  `Q2-TV4`'s test uses `v: 0` → expects `<td>TICK(0)</td>`, rejects `<td>EM_DASH</td>`.
- Sparkline: `Q2-SP5`'s test uses `v: null` → expects `EM_DASH`. `Q2-SP6`'s test uses `v: 0` →
  expects `<td>0 u</td>` (i.e. **the numeral with its unit**, not a bare `0` — the test's own
  `formatValue` appends `" u"`, and the assertion checks for the full formatted string).

No hard-coded unit string exists anywhere in either component's table code — the only literal
this code contributes is `EM_DASH` (imported from `lib/format.ts`); every value-bearing cell
goes through the caller's `formatTick`/`formatValue`, confirmed by reading both `tableRowsFor`
and `SparklineTableView` end to end.

## 6. §3.5 — The two new required props on `Sparkline`

`grep -rn "<Sparkline"` across the repo (excluding `sparkline.tsx`/`sparkline.test.tsx`
themselves) finds **no production call site** — step 10 has not built panels yet, matching
`build.md`'s own claim. `grep -rn "<StackedTimeSeriesChart"` likewise finds only the test file.

No dedicated type-level test surface (`*.test-d.ts`) exists for either component — but this is
not a Q2 regression: `components/` has never had one (the project's `*.test-d.ts` convention
lives only in `lib/`, e.g. `lib/types.test-d.ts`, `lib/client/client.test-d.ts`). Making
`formatValue`/`formatTime` required is enforced structurally by `tsc --noEmit` (part of `pnpm
verify`) regardless; a `.test-d.ts` with `@ts-expect-error` would be a nice-to-have precedent
for `components/` generally, not something Q2 broke or owes.

## 7. §3.6 — The 600×N cost claim

Checked against the actual mechanism, not just the prose:

- `hoverInstantsFor` unions **every series across every plot in the whole chart** into one
  `Set<number>` (confirmed by reading the function) — so "N" in "600×N" is the chart's total
  series count, not per-plot. For the COOLING chart today (temp plot: GPU 0 + GPU 1; fan plot:
  fan 5) that's N = 3, matching `build.md`'s "2–3 series per chart."
- `lib/client/series.ts`'s `MAX_RENDERED_POINTS = 600` and `decimateSeries` confirmed: min/max
  per bucket, `bucketCount = floor(cap/2)`, bucket boundaries computed from **array index**
  (`Math.floor((bucket * points.length) / bucketCount)`). Series drawn from the same window of
  the same ring (identical `points.length`, identical bucket count) get identical bucket
  *boundaries*; a bucket's **selected extremum** can still differ by value between series
  (documented in `series.ts` itself: "bucket boundaries move on every append" refers to a
  *different* effect — the boundaries shifting as new samples land — but the min/max-per-bucket
  selection is genuinely per-series-value, so two series sharing bucket boundaries can still
  diverge on which exact instant is retained). This is the real mechanism behind both the
  "collapses to ~600 in the common case" claim (shared clock ⇒ heavy but not certain overlap)
  and the honestly-stated "600×N adversarial upper bound" (no overlap at all). The arithmetic
  1,800 = 600 × 3 is correct for the stated N. Test fixture `gpuPlot()`+`fanPlot()` (3 series,
  literally the same 10 `tMs` values by construction) demonstrates the collapsed case exactly:
  `hoverZoneCount === 10`, not 30 — verified by rerunning the suite, not merely reading the
  assertion.

The trade-off argument (exact-instant matching over pixel-bucketing, to avoid ever fabricating a
cross-series reading) is a preference the handoff said not to re-litigate, and I didn't.

## 8. Invariant 7 — the recorded spec gap, re-assessed

`build.md` records: §6.2 asks for "a per-mark tooltip on bars and dots," but `components/` has
no bar-chart or dot/scatter TIME-SERIES primitive to attach that half to; `Meter` was excluded
because its value is already permanent visible text with no hidden-behind-pixels ambiguity, not
by oversight.

**Confirmed accurate.** Full inventory of `components/*.tsx`: `chip`, `meter`, `panel-shell`,
`row`, `sparkline`, `stacked-time-series-chart` — no other chart-shaped primitive exists.
Read `meter.tsx` directly: it renders one bar per call with `formattedValue` as adjacent visible
text and the bar itself `aria-hidden` (a deliberate anti-double-announcement decision from an
earlier step), so there genuinely is no hidden numeral a tooltip would reveal. The gap is
correctly scoped and correctly reasoned; nothing here should be inherited or reworded.

## 9. What was changed, and why (fixing was in scope)

Two additions only, both to close the one real gap in §3.1/§2:

1. `components/stacked-time-series-chart.test.tsx` — new test `⚠ every hover-zone rect is
   immediately followed by its OWN crosshair group, with nothing between`.
2. `components/sparkline.test.tsx` — the same test, adapted.
3. `pipeline/steps/09-ui-primitives/regressions.py` — two new backing mutations, `Q2-H6` and
   `Q2-SP7`, each splitting the paired hover-zone/crosshair render into two separate `.map()`
   calls (a plausible refactor that preserves every existing count/content assertion while
   breaking the CSS adjacent-sibling selector the whole mechanism depends on). Both verified to
   bite deterministically and to redden only the new test.

Nothing else was changed. No re-anchoring was touched, no existing mutation was altered, no
production component logic was modified — this phase found the existing implementation correct
everywhere except for the one untested DOM-structure property.

## 10. Verification (run by this phase)

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard
pnpm verify
# EXIT 0 — 67 files, 2237 tests (2235 + 2 new), no type errors

python3 pipeline/steps/09-ui-primitives/regressions.py
# EXIT 0 — 79 mutations (77 + 2 new), all bite; 85 ⚠-marked tests (83 + 2 new) checked;
# every ⚠-marked test went red under at least one mutation

git status --short
#  M components/sparkline.module.css
#  M components/sparkline.test.tsx
#  M components/sparkline.tsx
#  M components/stacked-time-series-chart.module.css
#  M components/stacked-time-series-chart.test.tsx
#  M components/stacked-time-series-chart.tsx
#  M pipeline/steps/09-ui-primitives/regressions.py
# ?? pipeline/handoffs/Q2-test-phase.md
# ?? pipeline/steps/Q2-hover-and-table/
# (no stranded mutation — ran verify and the harness strictly sequentially, never together)
```

Not committed, per the handoff's rules for this phase.
