# Handoff — Q2, ADVERSARIAL phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/Q2-hover-and-table/build.md` and `test.md`, then `SPEC.md` §6.2 (~line 953) and §9's
chart-interaction row, then `ANCHOR.md` §4/§5/§8 and `PLAN.md`.

Branch `dashboard-frontend`, working directory `dashboard/`. Tree intentionally dirty.

## ⚠ You fix NOTHING

Findings only. A reconcile phase adjudicates each ACCEPTED / REJECTED / DEFERRED, and a finding
you fix yourself is a finding nobody adjudicates. Every finding needs a **concrete failure
scenario**: the input or state, and the wrong output or missed detection. "This is fragile" is
not a finding.

---

## 1. What Q2 built

§6.2 requires charts to carry a hover layer and a table view as **defaults**, and calls the table
view an **accessibility floor**. `stacked-time-series-chart.tsx` and `sparkline.tsx` gained:

- `view: 'chart' | 'table'` (default `'chart'`), **caller-owned** — `purity.test.ts` forbids every
  React hook in `components/` by shape-match, so a primitive cannot hold its own toggle;
- a **CSS-only crosshair**: a transparent full-height `<rect class="hoverZone">` per hover
  instant, revealing its **immediately-following sibling** `<g class="crosshairGroup">` via
  `.hoverZone:hover + .crosshairGroup`;
- native SVG `<title>` tooltips, exact-instant lookup (never a fabricated nearest-neighbour or
  cross-series value);
- a table view — `EM_DASH` for null, formatted numeral for zero;
- `Sparkline` gained **required** `formatValue`/`formatTime`;
- **18** `Q2-` mutations in `steps/09-ui-primitives/regressions.py` (16 from build, 2 from test).

## 2. Already verified — attack these only with evidence

| | |
|---|---|
| `pnpm verify` exit **0**, 67 files, **2237** tests, no type errors | parent, on this tree, no harness running |
| step 9 harness: **79 mutations, 85 ⚠ marks, all bite, exit 0** | test phase, run serially |
| `purity.test.ts` **untouched** | `git diff --stat` empty — the guard was not weakened to fit |
| The hover tests are **not** source-text theatre | test phase: no `Q2-` mutation edits a `.module.css`; all edit real `.tsx` logic; every hover test asserts `renderToStaticMarkup` output, not a CSS grep |
| **`pointer-events` is handled** | **parent checked**: `.hoverZone { fill: transparent; pointer-events: all; }`. A transparent rect with the default `pointer-events` would never fire `:hover` and the entire feature would be silently inert in a real browser while every test passed. It is not that bug — do not re-file it |
| DOM adjacency is now guarded | test phase found nothing verified that `.hoverZone` and `.crosshairGroup` are *immediately adjacent* siblings — the precondition `+` needs. Closed with `Q2-H6` / `Q2-SP7` |

## 3. Where I would look

### 3.1 The rest of the browser-reality surface

`pointer-events` on the zone is right. **The other half is not checked**: what does
`.crosshairGroup` itself carry? If a `<title>` lives inside an element that is `opacity: 0`,
`visibility: hidden`, `display: none` or `pointer-events: none`, does the native tooltip still
appear? Those four differ from each other in exactly this respect, and the reveal is done with
`opacity`. Work out — from the CSS as written — whether the `<title>` tooltips actually reach a
user, and whether an `opacity: 0` crosshair still intercepts the pointer and blocks the *next*
zone. jsdom cannot answer this; reason from the specs and say what you are inferring.

### 3.2 The table view as an *accessibility floor*, which is what §6.2 calls it

That is a strong claim and it is the justification the owner accepted. Does the markup earn it?
Real `<table>` semantics, a caption or accessible name, `<th>` with `scope`, a row header per
time instant, units in the header rather than repeated per cell — and does the chart's
`ariaLabel` survive into the table view, or does toggling silently drop the accessible name? A
table view that is merely *present* does not meet a floor; §9 forbids identity resting on colour
alone, and this is what discharges it.

### 3.3 The Voronoi/hover-instant maths at the edges

Empty series; a single point; two points at the same instant; every point `null`; series whose
instants do not intersect at all; a gap spanning the whole domain. What does
`hoverInstantsFor` produce, and does any of it divide by a zero-width span or emit a zero-width
or negative-width rect? Step 9 already shipped an isolated-point defect where a one-vertex
polyline paints nothing, in **two** places — the sibling case was missed the first time. Check
whether the hover layer has its own version of that.

### 3.4 Invariant 1, and the gaps

`null` renders `—`; zero renders the numeral **with its unit**. The table is the easy place to
break it, and the test phase checked both directions — so look instead at the **interaction**:
what does the *tooltip* render for a null? For a gap? The chart models `gaps` explicitly, and a
tooltip that says `0` — or blank, or `NaN` — inside a gap is a wrong reading presented as a
measurement, which is worse than no tooltip.

### 3.5 Cost, and §6.7

The build claims ~600 hover columns realistically and 600×N adversarially. Each column is a rect
**plus** a crosshair group. State the real DOM node count for a plausible dashboard, and whether
§6.1's no-scroll promise or §6.7's per-series budget is threatened. The test phase checked the
arithmetic; check the *consequence*.

### 3.6 Free hunting

The above is where I would look; a finding I did not anticipate is worth more than a confirmation
of one I did. The build recorded a spec gap — §6.2's "per-mark tooltip on bars and dots" has no
bar/dot primitive to attach to — and the test phase re-verified it as accurately stated. If you
think that framing is wrong, say so.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0
python3 pipeline/steps/09-ui-primitives/regressions.py
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never run `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness.** A `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran the harness matches its own command line and spins forever — five hours lost on
  2026-09-08 (ANCHOR §9). Use plain sequential foreground commands.
- Experiments are fine; **revert them** and leave the tree exactly as you found it, so reconcile
  knows what build and test actually left. `git status` to confirm.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 5. Deliverable

`steps/Q2-hover-and-table/adversarial.md`: numbered findings, each with a concrete failure
scenario and what you actually ran or reasoned from — and mark clearly which findings are
**reasoned from spec** rather than executed, since much of §3.1 cannot be run in jsdom. Include
**"what I attacked and could NOT break"**; that section is load-bearing here and tells reconcile
where not to spend budget.

Report back a short summary. The parent will not read your transcript.
