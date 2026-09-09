# 10e TEST — the deliverable

**Written by the TEST phase, 2026-09-09.** Fixing was in scope and 21 fixes were applied; every one
is named below with the measurement that justified it. Nothing was committed. `SPEC.md` and
`MOCK.html` are untouched; so are `purity.test.ts`, `styles.test.ts`, `dangling-css-class.test.ts`,
`tocontain-scope.test.ts`, `unit-suffix.test.ts` and `cross-harness-ledger.test.ts` — all six are
**byte-identical to HEAD**, so nothing was weakened to pass.

---

## §3 — the eight priorities, in order

### 1. The re-aimed and retired mutations

**35 re-aims read against the property each was written to catch: 34 sound, 1 renamed.** The one
that failed is `10e-SR2`, below. The 29 pre-existing step-10 re-aims (`10a-H3/H4/H5/H6/H9`,
`10b-GP2/GP3`, `10b-CP3/CP4/CP6`, `10b-MP1/MP2/MP6`, `10b-SN2/SN4/SN6`,
`10b-CO1/CO3/CO4/CO6/CO7`, `10c-CO2`, `10b-SV1`, `10b-SP2/SP4`, `10b-SE2`, `10c-CVT2/CVT3`,
`10c-G2/G4`, `10c-P1/P2/P3`, `10c-GP2/GP3`, `10c-CP2/CP3`), plus `02-R5` and
`09-C2`/`09-PU1`/`09-PU2`/`09-SP5`/`09-CS1`/`Q2-SP1`, all preserve their property against the new
source text. Two carry a caveat worth recording:

- **`10a-H5` is narrowed and it is acceptable.** It used to mutate `{paused ? '▶ resume' : '❙❙
  pause'}` — a single expression that was BOTH the visible text and the announced name. 10e split
  those: `header.tsx:183` computes `aria-label={paused ? 'Resume polling' : 'Pause polling'}`
  independently of `:187`'s glyph, and H5 now mutates the glyph only. The ⚠ test it backs asserts
  both halves deliberately, so the mark stays honestly covered — but **the aria ternary itself had
  no mutation anywhere in the project**. Fixed: `10e-HD2`.
- **`10c-CP3`/`10c-GP3` pin `view={view}` at one of four (CPU) and one of two (GPU) mounts**, where
  `10c-P1/P2/P3` were widened to all of them for `gaps`. That asymmetry is **not** a hole:
  `Sparkline`'s `view` defaults to `'chart'`, so pinning any single mount takes
  `cpu-panel.test.tsx`'s `data-role="table-view"` count from 4 to 3. `gaps` needed widening for
  anchor *uniqueness*, not coverage. Recorded so it is not later read as an oversight.
- **`09-CS1` was widened because a CSS file changed, not because a guard was weakened.**
  `components/styles.test.ts` is byte-identical to HEAD. `row.module.css` gained a second
  `flex-wrap: wrap` (on `.end`, 10e's F5 fix) and the guard asks *"does this FILE contain
  `flex-wrap: wrap` anywhere"* rather than *"does the rule carrying `flex-basis: 100%` wrap"* — so
  removing one copy stopped biting. The widened two-edit mutation is the honest handling; the
  underlying weakness is the guard's file-wide scope, and fixing that is a `styles.test.ts` change,
  outside 10e. **Carried forward, not closed.**

**The three retirements, each adjudicated.**

| retired | verdict | why |
|---|---|---|
| `10a-H13` | **UPHELD** | Its premise was *"the refresh button loses its visible text `⟳ refresh`"*. 10e §4 makes every header button glyph-only by design; there is no visible text left to remove. `10e-HD1`'s anchor matches `header.tsx:176` verbatim and removing `aria-label` reddens two ⚠ tests. |
| `10b-CP5` | **UPHELD, but it was undocumented** | Its anchor was a PER-ROW `note={messageFor('coretemp')}` that 10e deleted (hero/meter/strip have no note slot), so all four CPU sources now render through one `<PanelNotes messages={cpuErrors} />` and `10b-CP6` was re-aimed onto that line. Two mutations on one source line would be redundant. **The reason is now written in place**, together with what CP5 no longer covers: *which* sources feed `cpuErrors` is `errorsForPanel`'s business, guarded by step 8's `observations.test.ts` and by nothing in this harness. |
| `10b-CO5` | **REJECTED — restored, re-aimed** | See below. |

**⚠ `10b-CO5`'s retirement left a ⚠ mark half-inert, and the ledger could not say so.** The
retirement note said the premise was "structurally superseded". The *anchor* was
(`note={fan5Age} … detail={dellSmmError}` on a fan5 `Row`, gone with the `Hero` rewrite) — but the
*property* was not. The `errors[]` text for channel 5 simply moved down the same file into
`PanelNotes`, and writing `dellSmmError ?? '<a sentence>'` there is exactly the alternative §3.7
and the S11/G5 ruling reject. The ⚠ test
`⚠ S11/G5 … a fan5 em dash beside "unavailable" needs NO entry of its own` has three assertions;
after the retirement it was reddened only by `10b-CO6`, which breaks its **em-dash** assertion. Its
`expect(html).not.toMatch(/class="_note/)` half — the half the ruling is actually about — was
backed by nothing. This is HANDOVER §5.2 rule 2 exactly: *the ledger cannot tell a mark reddened
for the right reason from one reddened for another.* `10b-CO5` is restored with the anchor at the
`PanelNotes` line and the retirement reasoning is written in place beside the S11/G5 comment that
had been left dangling above nothing.

**⚠ `10e-SR2` described the shipped code, not a wrong implementation — and the ⚠ test it backs
stated the opposite of its own body.** The mutation read *"inline is suppressed the same way
note/detail are (null/empty), inventing a policy it must not have"*. But `status-row.tsx:133`
already uses the same `shown()` helper `note` (`:142`) and `detail` (`:145`) use — that policy IS
the code. And the body does something else again: it drops `inline` entirely. The ⚠ test,
`⚠ inline renders … without being null/empty-suppressed like note`, then asserted
`expect(nullInline).toBe(omitted)` — i.e. that it *is* suppressed. Both are renamed to what they
check. (HANDOVER §0.4's *"read what a mutation REPLACES"* plus §0.5's *"a document contradicting
the code it shipped with"*, in one place.)

**Harness hygiene, from the same three edits:** the S11/G5 comment block was left describing a
mutation that no longer existed; a whitespace-only line (`regressions.py:889`) survived `10b-CO5`'s
deletion; and `10b-MP5` was left indented eight spaces instead of four by `10b-CP5`'s. All three
fixed.

**⚠ One cross-harness id collision, now closed.** `10e-H1` named two different mutations —
`components/hero.tsx`'s unavailable form in step 9's harness, and the header's refresh `aria-label`
in step 10's. Each harness's `_assert_unique_ids` is per file, so neither caught it, and a step
note saying "10e-H1" was ambiguous — the exact collision ANCHOR §9's prefix rule exists to prevent,
one level in. Step 10's three header mutations are `10e-HD1`/`HD2`/`HD3`. **Measured after the
rename: 1033 mutation ids across the nine harnesses, zero cross-harness collisions, zero
within-file duplicates.**

**No probabilistic mutation was found.** Every 10e mutation's RED set is a deterministic markup or
arithmetic consequence; none depends on a value a test drew.

### 2. Files owned by more than one harness

Enumerated mechanically (AST-parsing every `LEDGER_FILES` in all nine harnesses and resolving the
constants). **Exactly two files have two owners:**

| file | owners | 10e ⚠ marks | backed in both? |
|---|---|---|---|
| `lib/severity.test.ts` | 02, 04 | 2 | **yes** — 02: `10e-S1`/`S2`; 04: `10e-S3`/`S4` |
| `lib/collectors/io.test.ts` | 03, 05 | 0 (untouched by 10e) | n/a |

The two pairs are genuinely different rather than copies, and each backs a *different* mark —
verified in both runs' RED sets, not inferred: `10e-S1` (WATCH drifts) and `10e-S3` (ALARM drifts)
redden only `⚠ GPU_TEMP_WATCH_C is 70 and GPU_TEMP_ALARM_C is 80`; `10e-S2` (`>=`→`>`) and
`10e-S4` (a drifted second copy) redden only `⚠ severityGpuTemp bands the WATCH floor from the
exported constant`. The builder's fix is correct and complete.

Also checked: the three new leaf test files are adopted — `hero.test.tsx`/`strip.test.tsx` into
09's `LEDGER_FILES`, `caption.test.tsx` into 10's — so `cross-harness-ledger.test.ts` has no
orphan. And the ledger machinery block is byte-identical across eight of the nine harnesses; step
10's differs only in comment text, which predates this loop.

**⚠ NEW FINDING, and it is the most consequential thing in this section: step 2's red-test ledger
has not run since `formatUptime` gained its `prefix` parameter.** `regressions.py:635` is
`if moved or bad or ambiguous: return 1`, and it sits **before** the ledger. The three pre-existing
`ANCHOR NOT FOUND`s (`02-R20`/`R30`/`R31`) therefore make the whole of step 2's ⚠ check dark on
every run. Consequences:

- `lib/format.test.ts` has **no second owner**, so its ⚠ marks — including the **seven** 10e added
  for the `format*Parts` variants — are currently checked by nothing that runs.
- `lib/severity.test.ts` is saved only by the accident that step 4 also owns it.
- The builder's claim *"every 10e ⚠ test in this harness is covered"* was inferred from RED sets,
  not machine-checked; the printed RED sets are truncated to three lines per mutation, so it cannot
  be reconstructed from the log either.

The three orphans are HANDOVER §1's and the handoff says they are not this loop's, so they are left
alone. **The measurement of what they cost is below** (§"Measurements").

### 3. `PanelShell`'s three-state `chip`

**Clean, and fixtured on every side with COUNTS rather than `toContain`.** `panel-shell.tsx:89` is
`{chip === undefined ? null : <Chip severity={chip} />}`; omitted asserts `data-severity="none"`
occurs exactly **1×** (the `<section>`'s own attribute), `chip={null}` exactly **2×** (section +
`Chip`), and a real band has its own fixture. The 1-vs-2 count is the only thing in the DOM that
separates omitted from null, and both sides assert it exactly. `10e-PS4` (always render) and
`10e-PS5` (`headControl` dropped) back them in step 9's harness; `10b-SE2` was re-aimed onto the
new call-site text.

**No panel silently lost its chip.** All eight production `<PanelShell` call sites were diffed
against `git show HEAD:`; the only change is the session event log going `chip={null}` → omitted,
which is OQ-4. Every other panel still passes `chip={chip}`.

NIT: `10e-build.md`'s list of the 09 mutations it added omits `10e-PS4` and `10e-PS5`. The
mutations exist and are correct; the note is what is incomplete.

### 4. `Sparkline` — the "byte-identical" claim, the table view, the domain clamp

**⚠ The claim is false, on three independent counts, and it was written twice in the source.**
`sparkline.tsx` said a caller passing none of the three props *"renders byte-for-byte what it
always did"* and, at `yFor`, *"this is byte-identical to the pre-10e behaviour"*. Re-derived:

1. `<path data-role="area">` is emitted **per run, unconditionally** — not gated on any prop.
2. The end dot went `r=2.5`/`stroke-width 1` → `r=4.5`/`2`, also unconditional.
3. `yFor` was rewritten from `height - ((v-min)/(max-min))*height` to the `padT`/`padB` form.
   Algebraically equal at `padT=padB=0`, **not** bit-equal in IEEE754: `h=38, min=30, max=90, v=66`
   gives `15.2` before and `15.200000000000001` after, and those digits land in the emitted
   `points=` attribute.

The spec (10e §3.2) itself asks for (1) and (2) explicitly, so the *code* is right; the *comment*
over-claimed. Both comments are corrected, and so is the test that carried the same words —
`describe('⚠ 10e — none of the three given: byte-identical to today's output')` asserted no such
thing, and its ⚠ sat on the **describe**, where no ledger in the project can see it (HANDOVER
§5.3). Renamed to what the body proves. The true and useful claim is: **omitting the three props
leaves the scale autoscaled and emits neither optional group.**

**The table view gains nothing from the three props — confirmed structurally, not by inspection of
output.** `Sparkline` returns from the `view === 'table'` branch *before* `domain`/`refs`/
`timeLabels` are read, and `SparklineTableView`'s props are a `Pick<>` that does not include them,
so the three are unreachable from the table. Rows come from `tableRowsFor(points, gaps)` →
`gapSpansFor`, the same single derivation `gapMarksFor` consumes — HANDOVER §0.8's one-derivation
rule survives. The area fill is emitted inside the same `runs.map`, so it breaks exactly where the
line does.

**No X-drop.** Nothing filters `points` by `domain`; `runsOf` breaks only on unreadable values and
`gaps`; the clamp is on the Y magnitude only and the table still prints the real `95`. Q2-F9's
rejected behaviour is not reintroduced.

**⚠ GAP FOUND AND FIXED — the clamp has two rails and only one had a fixture.** Every `domain`
fixture in `sparkline.test.tsx` sat *above* the max (95 against 90); nothing anywhere sat below the
min, and `10e-SP6` removes **both** rails at once, so a one-sided `Math.min(domainMax, v)` passed
the entire suite and both harnesses. It is not hypothetical: `gpu-panel.tsx`'s `TEMP_DOMAIN.min` is
30 °C, ambient here is ~25, and a cold power-on with no lower clamp puts the vertex at `y > height`
— the trace leaves the viewBox. Added a below-min fixture and split the coverage into
`10e-SP12`/`10e-SP13`, one rail each (HANDOVER §5.1: *ship two mutations per guard*).

`10e-SP7`..`SP11`, `09-SP5` and `Q2-SP1` were each read against their property and are sound;
`10e-SP9` is a genuine boundary with fixtures on both sides (`refs={[]}` vs two entries) and its
`withEmpty === withoutProp` form is the strongest assertion in the new block.

### 5. `Row` / `StatusRow` render a `Chip` pill when `severity` is given

**⚠ The headline finding is that `Row` is now production-dead.** `grep -rn '<Row' components app`
returns only `row.test.tsx`. At HEAD there were **seven** call sites (COOLING's mode, four on the
GPU card, MEMORY's swap, STORAGE's tx); 10e converted every one to `Hero`/`Meter`/`Strip`/
`StatusRow`, which its own §6 table intends. Three consequences nobody recorded:

- 10e added the pill branch to `Row` (`row.tsx:62–74`) and two mutations (`10e-R1`/`R2`) for
  callers that do not exist, and widened `09-CS1` over `row.module.css` — a stylesheet no page
  loads. All of it is green and none of it defends a shipped rendering.
- `status-row.tsx`'s own module doc cites *"SERVING's composite row"* as the reason `Row` needed
  the change; SERVING uses `StatusRow`.
- **The live component had the weaker coverage.** `StatusRow`'s `md` pill has its own ternary at
  `:136`, independent of the `Chip sm` guard `10b-SR2` governs, and no mutation touched it. Fixed:
  `10e-SR4`/`10e-SR5`, mirroring `Row`'s pair, both directions.

Whether to delete `Row` is a later loop's call and is **recorded, not taken**. What must not stand
is the docs claiming a caller it does not have.

**Call-site adjudication against §6.2/§6.3/§6.5: no pill takes a prose value.** The six sites are
SAFETY ×4 (`yes`/`no`/`—` and a unit state), COOLING ×1 (a unit state) and SERVING ×1
(`formatText(instance.unitState)`). The prose-shaped strings — `last read 6:12 ago` and the
`errors[]` message — stay in `note`/`detail`, outside the pill. F5's overflowing composite string
was correctly split into `secondaryLabel`/`inline`/`endPrefix` rather than stuffed into a pill.

**One §6.2 question for the owner, not ruled here.** SERVING's row severity is
`worstSeverity(unitSeverity, healthSeverity)` and the pill's *label* is `unitState`, while the
`/health` verdict sits outside the pill as muted `endPrefix` text. So an instance whose unit is
`active` but whose `/health` is `unreachable` paints the word **`active`** alarm-red. No rule is
broken — the same single severity governed the old hand-joined string, and §6.3 bands the two
readings separately without saying how one row renders both — but the colour now visually attaches
to the healthier of the two facts. Recorded with a measurement, not decided.

Two smaller notes: the `severity={null}` occurrence count of **3** (row div + `Chip sm` +
`Chip md`) is correct and the fix landed in **both** `row.test.tsx` and `status-row.test.tsx`,
verified against the markup rather than the comment. And a severity-bearing row now announces its
band **twice** to a screen reader, because `chip.tsx` puts an `sr-only` word in both chips — a form
question for the owner, not a rule violation.

### 6. `header.test.tsx` — visible words to accessible names

**The migration strengthened the tests; it did not degrade to "a label string is present".** Every
control is found with `container.querySelector('button[aria-label="…"]')` guarded by an explicit
`expect(…).not.toBeNull()` before a real DOM event is dispatched — which closes the old
`[...querySelectorAll].find(b => b.textContent?.includes(…))` shape that would have returned
`undefined` and clicked nothing. Both selects still change through a real `change` event with
`toHaveBeenCalledWith` on the numeric value.

**Two things nothing guarded, both fixed:**

- **The pause/resume accessible name.** `10a-H5` reaches only the glyph now (§3.1 above). A wrong
  implementation pinning `aria-label="Pause polling"` ships a paused dashboard whose only
  announcement to a screen-reader user still says "Pause" — §6.2's *"a paused dashboard must
  announce it loudly"*, defeated for exactly the reader who cannot see the glyph. `10e-HD2` backs
  the existing ⚠ test that already asserts it.
- **The `refresh` → `cadence` rename (10e §4).** Unasserted anywhere. That rename is what makes
  `10a-H13` retirable — `10a-H13`'s own comment records that the cadence control's visible
  `<span>refresh</span>` is what made `toContain('refresh')` inert in 10a. A later loop could
  restore the word and silently re-arm the ambiguity. Added one test and `10e-HD3`.

### 7. CPU's four `Sparkline` mounts

**The promotion CSS is correct and structurally identical to GPU's.** `cpu-panel.module.css:5–24`
sets both wrappers `display: flex`, then `.fullChartWrap { display: none }` (later, same
specificity, so it wins), then flips both inside `@media (min-width: 1600px)` — SPEC §6.1's exact
breakpoint. `display: none` means the hidden pair paints 0 px and is not tabbable.
`gpu-panel.module.css:29–41` is the same shape.

**⚠ `measure-breakpoints.mjs` 7 and 8 do NOT cover CPU.** They query only
`[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]` / `gpu-full-chart-wrap`. A repo-wide grep
shows `cpu-sparkline-wrap` and `cpu-full-chart-wrap` are referenced by **no test and no
measurement** — renaming or deleting either attribute is invisible everywhere. CPU's promotion *is*
graded, but by `check-density.mjs`'s anatomy svg-height scan (`[38,38,0,0]` → `[0,0,50,50]`) — a
different tool, and the very code path found defective this loop. The selectors that would close it
are `[data-slot="cpu"] [data-role="cpu-sparkline-wrap"]` and `…cpu-full-chart-wrap`, as a
`promotionAt()`-shaped twin of 7/8. **Not added**, because `measure-breakpoints.mjs` cannot be run
at all in this environment (see §"Measurements") and a measurement nobody can execute is worse than
a named gap.

The CPU tests count `data-role` occurrences document-wide (4× table-view, 4× gap, 4× gap-row), so
they cannot say *which* wrapper a mount sits in — a copy-paste putting two temperature traces in
one wrapper keeps every count at 4. They do catch any single mount losing a prop, which is what the
mutations aim at.

**⚠ The real hole this priority uncovered is on the GPU card, and it was the biggest finding of the
phase.** `gpu-panel.tsx` wires `domain` (both mounts), `refs` and `timeLabels` (promoted mount),
and **not one of the three was asserted outside `sparkline.test.tsx` or mutated anywhere**. In the
harnesses `TEMP_REFS`/`TEMP_DOMAIN`/`timeLabels` appear only as inert surrounding context inside
`10c-P1/P2/P3`'s anchor strings. Measured by hand before writing anything:

| wrong implementation | before | after |
|---|---|---|
| delete `refs={TEMP_REFS}` | 28/28 green | 2 tests fail |
| delete `timeLabels` | 28/28 green | 1 test fails |
| add `refs` to the 1280 mount too | 28/28 green | 1 test fails |
| delete `domain` from both mounts | 28/28 green | 1 test fails |

What shipped green was the ≥1600 px GPU chart silently losing §6.3's 70/80 threshold lines and its
time axis — **the thing SPEC §6.1's OQ-6 ruling requires to be drawn**, and the only consumer of
the `GPU_TEMP_WATCH_C`/`GPU_TEMP_ALARM_C` constants that four mutations across two harnesses
defend. `check-density.mjs` cannot see it either: neither prop changes the svg's `height`
attribute, which is all the anatomy scan reads. This is HANDOVER §0.8's rule — *wiring a prop is a
property, and an optional prop makes it an untested one* — at three new call sites in the same loop
that rule was carried into. Fixed: four ⚠ tests in `gpu-panel.test.tsx` (scoped to each wrapper by
its own `data-role`, never to the document) and five mutations `10e-GP1`..`10e-GP5`, including both
sides of the "which mount gets the refs" boundary and one per mount for `domain`.

### 8. The six recorded spec silences

| # | subject | verdict |
|---|---|---|
| 1 | `formatXParts(null)` breaks the literal concatenation identity | **A real silence — and an internal contradiction in the builder spec.** 10e §2.0 states the null shape explicitly (`{ value: '—', unit: '°C' }`) *and* demands `` `${parts.value} ${parts.unit}` === formatX(v) `` "including 0 and null". Those cannot both hold: `formatCelsius(null)` is `—` with no unit. The resolution (identity over readable fixtures, the null shape asserted separately) is the only consistent reading. |
| 2 | `Hero` + `staleValueOr` have no clean composition | **A real silence, and the resolution is sound.** Checked that it re-derives the SAME condition rather than a second implementation: `renderParts` sets `value` to `EM_DASH` exactly when `!readable(v)`, which is exactly when `formatRpm` returns `EM_DASH`, so `fan5Parts.value === EM_DASH` is `staleValueOr`'s own `current === EM_DASH` at the parts level. Degraded-only, 0 px healthy. |
| 3 | `02-R20`/`R30`/`R31` | **Not a spec silence at all** — a pre-existing harness failure, correctly left alone but filed under invariant 7, where it does not belong. Its real cost is measured in §3.2 above. |
| 4 | STORAGE's stale-age tone has no shared component | **Not a silence — a choice, correctly implemented and mislabelled.** §6.5/S-B is not silent: it requires the age to read `--status-watch`, and the build delivers that. What the builder actually decided was *where to put a `tone` prop on a leaf it had just created itself*. Honest to record; it is a design note, not an invariant-7 stop. |
| 5 | `errors[]` notes have no height bound | **A real silence and a genuine owner question** — §2.11 costs a source's message at one 14.2 px line and nothing caps a `PanelNotes` block or a `StatusRow` `detail`. ⚠ **The builder's numbers could not be confirmed: the tool that produces them cannot be run in this environment (see §"Measurements"). Not ruled on, and nothing was changed.** |
| 6 | `MOCK.html` is globally `border-box`, the app is not | **A real silence, well handled.** The two graded boxes were fixed; the swept exception (`header.module.css`'s `.controls button`, which paints 25 not 23) is left alone with a measured reason — the band it sits in measures the 43 px §4 quotes and `check-density.mjs`'s `BAND` constant assumes. Changing it would move a number that is on target to satisfy an arithmetic nothing checks. |

---

## The rest

**⚠ The tenth instance of HANDOVER §0.4's shape — found, in a file 10e created.**
`components/hero.test.tsx`, `Figure — value, unit and an optional caption all render verbatim`:
`expect(html).toContain('W')`, where `W` occurs **twice** in the 206-character subject because the
caption is `cap 250.0 W`. Deleting `<span className={styles.figureUnit}>{unit}</span>` from
`hero.tsx` left the test green while its name claims the unit renders. Measured by overriding
`toContain` in a scratch vitest setup (601 string-subject calls across `components/`, 63 with a
needle occurring more than once — 10.5 %, consistent with §0.7's 9.5 %), then adjudicated by
reading. Fixed to `>W<`/`>231.0<`, the `>0<`/`>55<` form the rest of this loop adopted. Note
`lib/tocontain-scope.test.ts` cannot reach this: it is scoped to `components/panels/*.test.tsx`
that import `PanelShell`, and to the `data-severity`/em-dash vocabulary only.

**Four more names that over-claimed their bodies, all fixed:**

- `row.test.tsx` — *"the value renders as a chip pill (uppercase text-transform hook)"*: nothing
  checks any text-transform, and `styles.test.ts` does not either. `data-size="md"` is the real
  claim; the name says that now.
- `strip.test.tsx` — *"each key a `<dt>` and each value a `<dd>`"* rendered **one** item and
  asserted only that the strings `<dt` and `<dd` occur, so it could not tell the correct markup
  from the **swapped** `<dt>{v}</dt><dd>{k}</dd>`. Now two items with an adjacency regex per pair.
- `status-row.test.tsx` — *"endPrefix renders inside `.end`"* asserted only
  `indexOf('health ok') < indexOf('active')`, which an implementation emitting it at the *start* of
  the row also satisfies. Now sliced to the `.end` span and asserted to exclude the label.
- `gpu-panel.test.tsx` — *"the promoted chart hatches the same one"* names a hatch 10e removed when
  it replaced the promoted `StackedTimeSeriesChart` with a second `Sparkline`; the body's own
  comment said so while the name did not.

**`test-support.ts`'s widened `valueCells` — verified empirically, by rendering each shape**, not
by reading the regex: `Row` pill → `["0 RPM"]`, `Row` plain → `["up"]`, `Strip` →
`["97.0 %","1,290 MHz"]`, `Hero` → `["66"]`. Never vacuous, so the *"no value cell prints a
numeral"* sweeps still bite. It is blind to `StatusRow`'s three new slots and to `Figure`'s
`.figureValue` class — **both already compensated** by dedicated fixtures the builder added
(`serving-panel.test.tsx`'s direct `not.toMatch(/ctx [0-9]/)` and the `.figureValue`-scoped check
in `gpu-panel.test.tsx`). Residual: SERVING's `secondaryLabel` port has no digit guard, only the
positive `:—`.

**The two-GPU fixture could still not tell the cards apart on seven of eleven rendered fields**
(HANDOVER §0.6's own rule, applied to `index`/`name`/`bus`/`tempC` and stopping there;
`powerW`, `memUsedMiB`, `utilPct`, `smClockMHz` and the rest were identical zeros from
`everythingZero`). Widened, with values chosen so card 1's §6.3 bands stay equal to card 0's
(VRAM 16,384/32,768 = 50 %, normal) and no chip, dot or alarm count can move; the shell test now
asserts `231.0`, `1,290 MHz` and `16,384` per cell. Also added `>66<`/`>55<` beside the existing
`66 °C`/`55 °C` assertions there — since `Hero` split value from unit, the concatenated form is
reachable only through the chart tooltip, so those four lines had quietly stopped discriminating
the headline figure.

**The 26 rows of 10e §6 — 9 confirmed by grep, 0 violated, the rest not statically checkable.**
Confirmed: no `V100` string anywhere in `components/`/`app/` (`formatText(gpu?.name)`, no lookup);
the bus is `formatText(gpu?.bus)` untrimmed; no ` GB` literal in `components/` or `lib/format.ts`;
`0 RPM` takes `.valueZero { color: var(--status-alarm-ink) }` while `null` takes `.valueUnknown`,
fixtured both ways; `served by instance N` asserted per index; `formatUptime(v, prefix)` carries
the `for` arm; the throttle line is gated on `.notable`; `formatCh5Pwm` is one string with
`severity={null}` unconditionally; and `TEMP_REFS` appears **only** on the ≥1600 mount, never on
the small one and never on the cooling chart — OQ-6, now with a test behind it. The remainder are
absence-of-a-feature or header-composition rows already pinned by `10a-H10`/`H11`/`HS1`–`HS9`.

**The six mechanical guards are byte-identical to HEAD** — `dangling-css-class.test.ts`,
`styles.test.ts`, `purity.test.ts`, `tocontain-scope.test.ts`, `unit-suffix.test.ts`,
`cross-harness-ledger.test.ts`. Nothing was weakened to make 10e pass.

---

## Fixes applied — 11 files touched, plus this note

Nothing was committed. `SPEC.md` and `MOCK.html` are untouched.

**Source (1 file, comments only — no component's behaviour was changed by this phase):**

| file | change |
|---|---|
| `components/sparkline.tsx` | the two "byte-identical to pre-10e" over-claims corrected, with the three reasons byte-identity is false and the true claim in their place; the `yFor` comment now names the two rails and the fixture each needs |

**Tests (7 files):**

| file | change |
|---|---|
| `components/panels/gpu-panel.test.tsx` | **+4 ⚠ tests** for the promoted chart's `refs` / `timeLabels` / `domain`, each scoped to a wrapper by its own `data-role`; one ⚠ rename (the hatch that no longer exists); the absent-card negative assertion gains `>55<` beside `55 °C` |
| `components/sparkline.test.tsx` | **+1 ⚠ test** — a reading BELOW the domain min, the rail that had no fixture; the mis-named `byte-identical` describe renamed (and its decorative ⚠, which sat on a `describe` where no ledger can see it, dropped) |
| `components/header.test.tsx` | **+1 ⚠ test** — the cadence control is labelled `cadence`, not `refresh` |
| `components/panels/status-row.test.tsx` | the `inline` ⚠ test renamed (it stated the opposite of its own body); the `endPrefix` test scoped to the `.end` span instead of asserting document order |
| `components/hero.test.tsx` | `toContain('W')` → `>W<` (the tenth `toContain` instance) |
| `components/row.test.tsx` | ⚠ rename — the name claimed a text-transform hook nothing checks |
| `components/strip.test.tsx` | ⚠ test strengthened — two items and an adjacency regex, so a swapped `dt`/`dd` is now visible |
| `app/dashboard-shell.test.tsx` | the two-GPU fixture differs in four more rendered fields, asserted per cell; `>66<`/`>55<` added |

**Harnesses (2 files, +12 mutations net):**

| harness | change |
|---|---|
| `09-ui-primitives` | **+`10e-SP12`/`10e-SP13`** — one clamp rail each (`10e-SP6` removes both at once and could not see a one-sided clamp) |
| `10-panels-assembly` | **`10b-CO5` restored, re-aimed** at the `PanelNotes` line; **+`10e-GP1`..`GP5`** (the promoted chart's three props, both sides of the refs boundary, one `domain` per mount); **+`10e-SR4`/`SR5`** (`StatusRow`'s pill branch, both directions); **+`10e-HD2`/`HD3`** (the pause control's accessible name; the `refresh`→`cadence` rename); `10e-SR2` renamed; `10e-H1`→`10e-HD1` to close the cross-harness id collision; `10b-CP5`'s and `10a-H13`'s retirements documented in place; the dangling S11/G5 comment, the stray whitespace line and `10b-MP5`'s indentation fixed |

**Deliberately NOT fixed, recorded instead:** deleting the now-dead `Row` primitive and its
mutations; adding a CPU twin of `measure-breakpoints.mjs` 7/8 (the script cannot be run here);
re-aiming `02-R20`/`R30`/`R31` (HANDOVER §1 says they are not this loop's); rule-scoping
`styles.test.ts`'s `flex-wrap` guard; the SERVING pill/health question; the doubled screen-reader
announcement on a severity-bearing row.

---

## Measurements

### `pnpm verify`

| when | result |
|---|---|
| before any edit of mine (baseline) | **exit 0** — 102 files, **2886** tests, no type errors |
| after all edits, before the harnesses | **exit 0** — 102 files, **2892** tests |
| after the harnesses (final) | **exit 0** — 102 files, **2892** tests, no type errors |

### The four harnesses — run serially, one call, nothing else running

| harness | mutations | ledger | result |
|---|---|---|---|
| `02-format-severity` | 60 (57 ran) | **not printed** | ⚠ **exit 1 — the three PRE-EXISTING orphans only**: `02-R20`/`R30`/`R31`, `ANCHOR NOT FOUND in lib/format.ts`. Every other mutation bit, `10e-F1`/`F2`/`F3`/`S1`/`S2` included |
| `04-collector-cooling` | 94 | 188 red across 94; **85 ⚠ checked, all reddened** | **exit 0** |
| `09-ui-primitives` | **122** (was 120) | 181 red across 122; **134 ⚠ checked, all reddened** | **exit 0** |
| `10-panels-assembly` | **191** (was 181) | 236 red across 191; **215 ⚠ checked, all reddened** | **exit 0** |

No `DID NOT BITE`, no `ANCHOR AMBIGUOUS`, no `ANCHOR NOT FOUND` outside those three. Every one of
the 12 mutations added or restored above bites, and each reddens the test it was aimed at — checked
against the RED sets, not assumed.

### ⚠ Step 2's ledger, run for the first time since the orphans appeared

`regressions.py:635` returns before the ledger whenever an anchor has moved, so the three orphans
have kept step 2's ⚠ check dark. Run diagnostically with only those three excluded (a scratch
driver that imports the harness and filters `REGRESSIONS`; the file itself was not edited):

```
Red-test ledger: 261 distinct failing tests across 57 mutations; 22 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 57 regressions failed their check, as they must.
```

**So the coverage is in fact complete — including 10e's seven new `lib/format.test.ts` marks — but
nothing was checking it.** `lib/format.test.ts` has no second owner, so until those three anchors
are re-aimed its marks are guarded by a check that cannot reach them. Worth doing in the next loop;
it is one `formatUptime` signature away.

### The browser measurements — BLOCKED, and diagnosed

`measure-breakpoints.mjs` failed twice with `server did not come up at http://localhost:39173/login
within 60000ms`. Running its `next dev` by hand prints the cause:

```
⨯ Another next dev server is already running.
- Local:  http://localhost:39174
- PID:    16908
- Dir:    /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
```

**Next.js 16.3.4 refuses a second `next dev` in the same directory**, and the parent's demo server
holds it. So measurement 9's 27 / 49 px overflow, and every number behind spec silence #5, are
**unverified by this phase**. `check-density.mjs`'s ALL PASS is likewise unverified: it consumes
`measure-arrangements.mjs`'s JSON and the handoff forbids running that (port 39174).

**To close both**: stop the demo server (or run the scripts from a separate git worktree of this
branch) and re-run

```bash
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs \
     --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

Reading the two tool diffs instead: both fixes are correct and both make a previously
unsatisfiable check satisfiable — `anatomy()` now lists every `<svg>` in a part (the GPU card's two
promotion wrappers live in one child, so the first svg was always the hidden one at ≥1600), and the
spare check measures from `grid.bottom` rather than from `documentElement.scrollHeight`, which is
defined as at least the viewport height and was therefore 0 by construction on any page that fits.
The `check-density.mjs` target change (`cpu` gains a second sparkline) is OQ-7, which SPEC §6.1
carries. ⚠ One thing to note when re-running: a missing `grid.bottom` now reports **FAIL**, not a
silent skip — that is the 10c-2 rule applied correctly.

### Housekeeping

- **`git status`: 79 entries, all `M` or `??`, no stranded mutation** — the same 79 the phase
  started with (every edit above was to an already-modified file; the only new path is this note,
  which is the 80th and is listed below).
- ⚠ `next-env.d.ts` is modified in the tree (`./.next/types/…` → `./.next/dev/types/…`). That is
  **the parent's running `next dev` rewriting it**, not the builder and not this phase. The
  builder's claim that it was byte-identical was true when written.
- No browser was launched by this phase beyond the two failed `measure-breakpoints.mjs` runs, which
  never reached `chromium.launch()`. No `next dev` left running (`:39173` free, verified). No
  `.env` written.
