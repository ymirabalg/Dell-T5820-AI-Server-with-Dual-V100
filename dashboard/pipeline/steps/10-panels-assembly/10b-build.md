# Step 10b — the nine panel bodies (BUILD phase)

**Written by the build agent, 2026-09-08.** Branch `dashboard-frontend`, started from a clean
tree at `f12c3ef`. Scope followed exactly as the handoff states it: `components/panels/` (new),
`components/`, and step 10's harness (`pipeline/steps/10-panels-assembly/regressions.py`).
**Nothing under `app/` or `lib/` was touched.**

`dataviz` was loaded before writing this note (see §7) — the finding is that 10b's job was
composing already-validated, already-compliant primitives (`Sparkline`, `StackedTimeSeriesChart`,
`Meter`, `Chip`, `components/palette.ts`'s §9-resolved hues) rather than designing new chart
mechanics, so the skill's procedure (form → color → validate → marks → hover → accessibility)
was already discharged by steps 9/Q2 for the primitives themselves; 10b's obligation was to call
them correctly, which §2 below covers panel by panel.

---

## 1. What was built

Nine new files under `components/panels/`, each `<Name>Panel(props: PanelProps)` (GPU also takes
`index: 0 | 1`), plus shared support:

| File | Role |
|---|---|
| `gpu-panel.tsx` | `GpuPanel` — mounted twice, at `gpu0`/`gpu1` |
| `cpu-panel.tsx` | `CpuPanel` |
| `memory-panel.tsx` | `MemoryPanel` |
| `cooling-panel.tsx` | `CoolingPanel` |
| `serving-panel.tsx` | `ServingPanel` |
| `storage-network-panel.tsx` | `StorageNetworkPanel` |
| `safety-panel.tsx` | `SafetyPanel` |
| `session-event-log-panel.tsx` | `SessionEventLogPanel` |
| `status-row.tsx` | A `Row`-shaped line that can colour its trailing note `--status-watch` (S-B) without editing step 9's `row.tsx`/`row.module.css`, which this harness does not own |
| `condition-lookup.ts` | `findDisplayed` / `staleAgeNote` — reproduces `app/dashboard-shell.tsx`'s stale-age wording byte-for-byte, per S-B ("the banner and the row use the same words") |
| `panel-chart.ts` | `chartDomainOf` / `formatTimeOfDayMs` — the two pieces of glue GPU×2, CPU and COOLING all repeat |
| `event-sentence.ts` | `describeEvent(LogEntry): string` — the sentence `lib/client/events.ts`'s own doc explicitly defers to "the phase that owns the panel" |
| `test-support.ts` | Shared `RuntimeState` builders for the test files (not itself a test) |

Every file is a pure function of `PanelProps`, zero React hooks — `purity.test.ts`'s recursive
walk covers `components/panels/` and it is green (checked explicitly, see §6).

**Every panel reads its current values from `latestSample(state)?.snapshot`** (the raw
`TelemetrySnapshot`), colours them with `lib/severity.ts` directly (HANDOVER rule 1: undebounced,
never `state.displayed`), and consults `state.displayed` only for `condition-lookup.ts`'s stale
lookup — never for the current reading or its colour. `state === null` never occurs here
(`app/`'s one guard); `latestSample(state) === null` (before the first accepted poll) is the
ordinary "no reading" case and every formatter already renders `—` for it (verified by a
dedicated test per panel).

## 2. What each panel renders, and why

### GPU 0 / GPU 1 (`gpu-panel.tsx`)

Temperature (dominant, 30-min trace), power vs the 250 W cap, VRAM as a `Meter`, utilisation, SM
clock, throttle (conditional), and "served by instance N".

- **Name/bus are `formatText` verbatim** — no lookup table, no trimming beyond whitespace. Bus
  renders in full domain form (`00000000:17:00.0`). Backed by `10b-GP1`.
- **Throttle row appears only when `decodeThrottleMask(...).notable`** — a mask of `0` or `0x4`
  alone renders no row at all (not a row styled `normal`). No dedicated mutation was needed
  beyond the existing test suite (this is exercised directly; see §4 on why no `⚠` there — it's
  already proven by three fixtures with no plausible one-line wrong implementation distinct from
  the `decode.notable` boundary itself, which is `lib/throttle.ts`'s, not this panel's, to mutate).
- **Join is `gpu.index === serving.instance`**, literally `snapshot?.serving?.find(s =>
  s.instance === index)`. Label is `served by instance N`, never "on this card". Backed by a
  general test (no dedicated mutation: the join is one `.find` with no alternate wrong spelling
  that isn't already what `10b-GP1`-style anchors would catch more directly).
- **`gpus: null` takes the whole body over** with "no GPUs enumerated" plus
  `errorsForPanel(snapshot, 'gpu')`'s message(s) — §6.5's rule, and the one place this panel
  differs from every other: `nothingReadable`'s `dell-smm` error must NOT leak into the GPU
  panel, proving the per-panel filter is real (tested).
- **≥1600px promotion**: both a `Sparkline` and a single-plot `StackedTimeSeriesChart` are always
  in the DOM; `gpu-panel.module.css`'s `min-width: 1600px` media query shows one and hides the
  other (`grid.tsx`'s own recommended, not mandated, mechanism — no viewport state crosses the
  hook boundary). **Size, recorded as a decision**: 480×140 — 480 to match `CHART_SIZE.cooling`'s
  width (a "big" chart is the same width everywhere on this page), 140 because this promotion
  draws one plot where COOLING draws two at 210. L9's canonical value is still 10c's; this is the
  defensible default the handoff asked for.
- CSS media-query behaviour is **not observable from `renderToStaticMarkup`** — recorded rather
  than asserted; the test proves both elements render with correct content, not that the
  breakpoint paints.

### CPU (`cpu-panel.tsx`)

Package temperature (dominant + trace), utilisation (its own trace), load average. Model and
core/thread count are the **subtitle**, not body rows, per §6.2.

- `formatCpuModel` does the §3.2 trim; `cores`/`threads` are plain numbers (not a branded unit)
  so they get a local `EM_DASH`-on-`null` fallback rather than a `lib/format.ts` call — there is
  no formatter for a bare count, and none was invented.
- **Two traces, one reused colour pair**: `SERIES_COLORS.gpu0` for temperature,
  `SERIES_COLORS.gpu1` for utilisation. Recorded reasoning: `components/palette.ts` reserves its
  three hexes for series that share ONE frame and explicitly forbids adding a fourth "without a
  design decision" — CPU's two traces never share a frame with each other or with GPU/fan5, so
  reuse costs nothing and needed no new hex.
- No ≥1600px promotion — §6.1 names that rule for the GPU card only.

### MEMORY (`memory-panel.tsx`)

RAM as a `Meter` (61 GiB), swap on its own row (§6.6: 2 dp, "small values must not round to
0.0"). Subtitle fixed: `/proc/meminfo`.

- ⚠ **Invariant-7 gap, recorded**: `lib/format.ts` has no `formatGiBPair`. §6.6 only specifies a
  compact joint form (`26,452 / 32,768 MiB`, one suffix) for the VRAM **MiB** pair; it does not
  say a GiB pair shares that shape, and building one here would be writing a formatting law
  `lib/format.ts` doesn't state (L11/O14: use the canonical formatters, don't hand-roll a unit
  string). The panel composes the pair from two `formatGiB` calls (`24.3 GiB / 61.0 GiB` — a
  repeated suffix, not a fabricated rule). **For the owner**: either bless this shape or ask for
  `formatGiBPair` in `lib/format.ts` (out of this loop's file scope).
- The panel's own **head chip** is `severityMemory(host)` (RAM% and swap combined); the RAM
  `Meter`'s own fill is `severityRam` alone, so the bar's colour matches exactly what it is a bar
  *of*, and the swap trigger is visible on its own row instead of silently colouring an unrelated
  bar.

### COOLING (`cooling-panel.tsx`)

`fan5` headline (StatusRow, stale-capable), derived mode, fan service (StatusRow, stale-capable),
the shared-time chart, `fan1`–`fan4` smaller.

- ⚠ **Invariant 3, by construction**: the mode row (`formatCh5Pwm`) never carries a `severity`
  prop — `EC auto`/`unavailable` are not §6.3 bands (O13). Backed by `10b-CO1`.
- ~~⚠ **Invariant 1, on fan5 and on fan1–4**: `0` alarms, `null` renders `—` with no colour.
  Backed by `10b-CO2`/`10b-CO3`.~~
  > ⚠ **CORRECTION — 10b's reconciliation, 2026-09-08 (adversarial F1d). The sentence above was
  > false in its second half and this panel was the WORST case on the page, not the best.**
  > `10b-CO2` is `severity={fan5Severity}` → `severity={null}` and `10b-CO3` is
  > `severity={severityFanStopped(cooling?.fan2Rpm ?? null)}` → `severity={null}`. Both delete a
  > **band**, which is the **zero** side — *"a 0 reading no longer alarms"*. Neither touches a
  > `?? null` fallback, so **neither backed the null side at all**, and `?? rpm(0)` on the fan5
  > headline passed the whole suite while printing `fan 5  0 RPM` for a `dell_smm` that loaded
  > and could not read the tach (F1a, reproduced by the parent). fan1–4 had **no null fixture
  > anywhere** (F1b). The null side is now backed by `10b-CO6` (fan5 value) and `10b-CO7` (fan 2
  > value **and** severity), plus a panel-wide value-cell guard; see `10b-reconciliation.md` §1.
- ⚠ **Invariant 4**: only `fanN_input` (via `formatRpm`) is read anywhere in this file. No
  `pwmN_enable`, no `fanN_target` — neither is in `lib/types.ts`'s contract, so neither can be
  reached by accident.
- **The shared-time chart draws BOTH GPU cards' temperature traces plus fan5's RPM**, as two
  stacked plots (never a dual y-axis — `StackedTimeSeriesChart`'s own guarantee). ⚠ **Recorded
  decision, invariant 7**: §6.2's prose says "the GPU temperature trace" (singular); this box has
  two cards and no field says which one drives the fan curve, so drawing both is the conservative
  reading. Cost is negligible (§6.7: 600 pts/series, so 1,800 total here, matching the earlier
  cooling-chart precedent already priced into the spec).
- **Fan service row is the one place in this panel §6.5's stale rule is structurally reachable**
  (`severityUnitState` returns `null` for an unreadable input, unlike `severityFan5*`'s absolute
  row on a `dell-smm` outage — see `condition-lookup.ts`'s doc for the full argument). Backed by
  `10b-CO4`.
- ⚠ **S11/G5, settled mid-build (2026-09-08) — see §5.** A `fan5` em dash beside the "unavailable"
  mode neighbour gets no entry of its own: no fallback sentence, no expectation of an `errors[]`
  message the collector deliberately never files for this documented-normal state. Already true
  by construction (`note={fan5Age ?? dellSmmError}`, nothing appended); backed with a dedicated
  fixture and `10b-CO5`, which reintroduces exactly the rejected "fallback sentence" alternative.
- Unique SVG id: `${panelId}-chart` (L4's obligation, satisfied and tested).

### SERVING (`serving-panel.tsx`)

One compact `StatusRow` per discovered instance: unit-state dot, port, model, context, `/health`.
**No token rates** (decision 13) — nothing in this file computes or renders one.

- Compacted into one row per instance rather than five, matching §6.2's own phrasing and
  SAFETY's "compact list" sibling design.
- The row's chip is `worstSeverity(unitSeverity, healthSeverity)` — the worse of the two §6.3
  rows, never one silently dropped.
- `serving: null` ("which instances exist is unknown") and `serving: []` (enumerated, nothing
  there) render **different** explanatory text — tested explicitly, since collapsing the two
  would be exactly the `null`-vs-`[]` conflation §3.1 spends a paragraph warning against.
- ⚠ Backed: `10b-SV1` (decision 13's negative requirement — a token rate must never leak back
  in), `10b-SV2` (the null-check on the takeover branch), `10b-SV3` (the stale-age wiring).

### STORAGE & NETWORK (`storage-network-panel.tsx`)

`/` and `/home` as `Meter`s, `eno1` rx/tx (unbanded — §6.3 has no rate row), link state
(`StatusRow`, stale-capable).

- **Disk is banded on free space**, via `severityDiskFree` directly (tested; no dedicated
  mutation needed distinct from `10b-SN1`, since the free-vs-used boundary itself is
  `lib/severity.ts`'s, already covered there).
- ⚠ **`10b-SN1`**: the two `Meter`s' severities are wired straight through (`rootSeverity` →
  `/`, `homeSeverity` → `/home`) rather than a `[value, value]` array a future edit could
  transpose; backed with a two-anchor mutation (see §4's note on why a naive one-line swap of
  `severity={rootSeverity}`/`severity={homeSeverity}` would have been a no-op mutation).
- ⚠ **`10b-SN2`**: the link row's stale-age wiring.

### SAFETY (`safety-panel.tsx`)

§3.6's four checks as a compact list. *"The panel that earns the dashboard's existence."*

- ⚠ **Each row's `errors[]` explanation comes from `errorsForPanel(snapshot, 'safety')`,
  filtered by source (`ufw`/`dell-smm`/`dkms`/`dbus`) — never copy written here.** The DKMS
  row's explanation is where the running kernel release actually appears; the collector
  (`lib/collectors/safety.ts`'s `checkDkms`) already bakes it into the message text, so this
  file only has to show the message.
- ⚠ **A stale row uses S-B's exact words**, watch-toned. Structurally this can only fire on the
  fan-service row — the other three checks call TOTAL §6.3 functions that never return `null`,
  so `conditionsFrom` observes them every poll and they can never be confirmed absent long
  enough to go stale (full argument in `condition-lookup.ts`'s module doc). Backed: `10b-SP4`.
- ⚠ **D3 — `unknownStanding` renders here**, one row per malformed `STANDING` entry, worded
  `unknown STANDING entry: <id>`, with `severity={null}` (O12's **explicit** no-band chip, not
  an omitted one) so it is visually distinct without inventing a colour, and **not** folded into
  this panel's own head chip. Backed: `10b-SP3`.
- ⚠ Booleans render `yes`/`no`/`—`, never `true`/`false`. Backed: `10b-SP1`.
- ⚠ `pwm5Present: null` is WATCH, never the alarm (§6.3's three-valued row). Backed: `10b-SP2`
  (a copy-paste-shaped mutation — the pwm5 row wired to `ufw`'s severity — since
  `severityPwm5Present` itself has no panel-level wrong implementation distinct from that).
- **Subtitle, recorded decision (invariant 7)**: §6.2's fixed-label table gives examples for
  MEMORY and STORAGE & NETWORK only; SAFETY has none. Chose `ufw · pwm5 · dkms · fan service` —
  identity (which four checks), not measurement.

### SESSION EVENT LOG (`session-event-log-panel.tsx`)

A scrolling `<ul>` of `state.events.entries` (already newest-first, capped at 500 by
`lib/client/events.ts`), each line built by `event-sentence.ts`'s `describeEvent`.

- ⚠ **§6.1's no-scroll promise governs the page, not this component** (clarified 2026-09-08,
  matching §6.2's own COOLING-table-view ruling). `.scroll` reuses `--table-scroll-max`
  (`tokens.css`) — the same stopgap the chart primitives' table views use; SCOPE 2.5f's
  `max-height: 100%` replacement is 10c's, once a panel body has a real bounded height, per
  `HANDOVER.md`.
- ⚠ **Entries render exactly in the order `state.events.entries` is already in** (newest-first)
  — this file does not re-sort. Backed: `10b-SE1`.
- ⚠ **Chip is `entry.severity`** (the fact each log line already carries), never a suppressed or
  re-derived one. The **panel head**'s own chip is `null` — the explicit no-band state, since a
  log has no §6.3 reading of its own to band. Backed: `10b-SE2`.
- **Recorded decisions (invariant 7)**: (1) subtitle `state transitions since page load` — §6.2's
  table doesn't name this panel at all; (2) `describeEvent`'s wording is this loop's, per
  `lib/client/events.ts`'s own doc ("step 10 writes the sentence … inventing copy here would put
  it out of reach of the phase that owns the panel").

## 3. `event-sentence.ts` — the copy `lib/client/events.ts` deferred to this loop

One function, exhaustive `switch` over `LogEntryKind` (`noFallthroughCasesInSwitch` makes a new
kind a compile error here, not a silent blank line). Six `⚠` tests, six mutations
(`10b-ES1`–`10b-ES6`), one per branch this loop holds a property of: the arrow appears only on a
real transition and in the right order, `standing` keeps `band`'s shape plus a visible marker,
`source-lost`/`mode-stale` never leave a dangling `" — "` when there is no detail, and a
never-confirmed retirement omits its parenthetical.

## 4. Where a naive mutation would have been a no-op — recorded so the pattern isn't repeated

**`storage-network-panel.tsx`'s root/home severities.** The obvious single mutation —
`severity={rootSeverity}` ↔ `severity={homeSeverity}`, two 1-line replacements — is a **no-op**:
applying the first replacement turns root's line into a second copy of home's exact text, so the
second replacement's `.replace(old, new, 1)` (first-match-wins) immediately undoes the first
mutation instead of touching home's real line, leaving the file byte-identical to the original.
`10b-SN1` instead anchors each replacement on a larger, mutually-exclusive block (each including
its own `root.totalGiB`/`home.totalGiB` context), so the two `old` strings can never collide
post-mutation. Recorded here rather than only in the harness comment, since HANDOVER's own
"beware the equivalent mutation" warning is exactly this failure shape one level earlier — before
a mutation ever ran, not after.

**Row-level assertions must be scoped to the row, not the document.** Three ⚠ tests
(`cooling-panel.test.tsx`'s EC-auto and invariant-1 tests) were written first as whole-document
`toContain('data-severity="alarm"')` checks and reported `DID NOT BITE` for `10b-CO1`/`CO2`/`CO3`
on the first harness run — not because the mutations were harmless, but because the **panel
head**'s own chip is computed from the same underlying severity variable through a *different*
code path (`worstSeverity(fan5Severity, …)`), so an alarm shown correctly at the head masked a
bug injected only into the row. Fixed with a `rowContaining(html, needle)` helper (bracket to the
nearest `<div>` around the text, chip included since it precedes the label in DOM order) in both
`cooling-panel.test.tsx` and `safety-panel.test.tsx`. Recorded because it is the same lesson as
the harness's own "a test that names a property it does not check" — these tests named "the row"
but checked "the document."

## 5. Open items from the handoff's §5, and how each was discharged

| Item | Disposition |
|---|---|
| **D1** — SESSION EVENT LOG's third feed (a closed-vocabulary, no-band field like `ch5Mode`) | **Not implemented.** The mechanism belongs in `lib/client/events.ts` (`LogEntryKind` needs a new member, `observeEvents` a new fold) — outside this loop's file scope (`components/panels/`, `components/`, step 10's harness; not `lib/client/`). `event-sentence.ts`'s exhaustive switch over `LogEntryKind` means the moment that kind is added, `tsc` forces a new `case` here — the panel is future-proofed for it, but the backend half is undone. Recorded for 10c/owner. |
| **D3** — `unknownStanding` in SAFETY | **Done.** See §2's SAFETY section. |
| **S11/G5's panel half** | **Settled mid-build (2026-09-08) and implemented.** The owner widened §6.5's "no second explanation" exception to cover a neighbour that names a *documented absent state* (`unavailable`, O13), not only one that carries a severity — closing the hole where `fan5` reads `—` with `pwm5Present: true` and `ch5Mode: null`/`fan5Rpm: null`. `cooling-panel.tsx`'s fan5 row already discharged this **by construction** — it only ever shows a stale-age note or a real `errors[]` message, never invented copy — so no code change was needed; a dedicated ⚠ test and mutation (`10b-CO5`) were added to prove and guard it (§4/§6). SAFETY was reviewed against the same ruling and needed no change: its rows' own severities (not a neighbouring "unavailable") are what explain them. |
| **O12** (no invented band) | Satisfied throughout — every "no severity" case uses `severity={null}` (explicit) or omits the prop (no chip at all), never a fallback to `'normal'`. |
| **O13** (`EC auto`/`unavailable` not severities) | Satisfied — COOLING's mode row carries no `severity` prop. |
| **O14** (formatter `parts` variant) | **Not needed.** No panel splits a formatted string on whitespace; every unit-bearing string comes whole from `lib/format.ts` or is composed by concatenating two whole, already-unit-bearing strings (the GiB pairs — see §2's MEMORY note). |
| **Q2-F9's deferred half** (clamp vs drop for an out-of-domain instant) | **Sidestepped, not resolved.** `panel-chart.ts`'s `chartDomainOf` computes the *same* window `traceFor` uses internally (`samplesWithin` + `windowMs`, anchored on the newest sample's `ts`), so every domain this loop passes to `StackedTimeSeriesChart` is self-consistent with the trace drawn against it — no panel in this loop can feed the chart an out-of-domain instant by construction. The chart primitive's own clamp behaviour is unchanged; the rendering *decision* (clamp vs drop) that Q2-F9 named is still the owner's, for whenever a future caller doesn't have this property. |
| **Q2-S2's table view** | **Still unreachable, for a structural reason recorded here.** The chart/table toggle's state (`view: 'chart' \| 'table'`) cannot live in `components/panels/` — `purity.test.ts` forbids the hook a self-toggling leaf would need, and HANDOVER §3.5 rule 1 says the caller (step 10) holds it. But every panel in **this** loop is itself hook-free, so the toggle has nowhere to live except a stateful `app/` shell, which is explicitly out of this loop's scope. Every panel therefore renders the chart primitives' own `'chart'` default and never sets `view`. Consequence: Q2-S2's height-bound question is **not yet live** — there is no UI path that reaches the table view. When a future loop adds the toggle control (in `app/`), Q2-S2's guidance (cap, decimate again, or scroll — the last already the session-log's own choice) applies immediately. |

## 6. Verification

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
pnpm verify
```

**Exit 0.** 91 test files, **2512 tests passed**, 0 type errors (cold `tsc`,
`tsconfig.tsbuildinfo` deleted first, matching `verify`'s own definition). Run three times across
this build (once before the S11/G5 mid-build ruling landed, twice after); every run green. The
known `lib/collectors/serving.test.ts` wall-clock-flaky ⚠ test (HANDOVER §0.3) did not fire in any
run — and per the coordinator, the owner is fixing it directly rather than deferring to 10c;
`lib/collectors/serving.test.ts` itself was not touched by this phase either way.

```
python3 pipeline/steps/10-panels-assembly/regressions.py
```

**Exit 0. `All 101 regressions failed their check, as they must.`** 101 mutations total — the 71
already in the file from 10a, plus **30 new `10b-` mutations** (one per ⚠ mark below, plus
`10b-CO5` added mid-build for S11/G5's settled ruling — see §5), covering **all 117 ⚠-marked
tests the ledger can see**. `git status --short` after the final harness run:

```
 M SPEC.md
 M pipeline/steps/10-panels-assembly/regressions.py
?? components/panels/
?? pipeline/handoffs/10b-panels.md
?? pipeline/steps/10-panels-assembly/10b-build.md
```

`SPEC.md`'s modification is the coordinator's own edit (§6.5's S11/G5 widening, mid-build) — not
this phase's; the parent owns the spec and this phase did not touch it, per the rules.

No stranded mutation (`pipeline/steps/10-panels-assembly/regressions.py`'s own diff is the
harness's permanent additions, not a leftover — verified by running `pnpm verify` clean
immediately after the harness). `pipeline/handoffs/10b-panels.md` predates this build (the
handoff itself) and was not created or edited by this phase.

**`purity.test.ts` and `styles.test.ts` were run standalone first**, before the full suite, and
both were green against every new file (`components/panels/*.tsx` carries no hook call by shape;
no `flex-basis: 100%` in a new stylesheet lacks a `flex-wrap: wrap` container in the same file).

⚠ **One ledger trap paid for during this build, recorded so it isn't repeated**: three ⚠ test
names used an escaped apostrophe inside a single-quoted string (`'…S-B\'s…'`). The ⚠-scanner's
`FIRST_STRING` regex captures the raw string content **including the backslash**, while Vitest's
actual printed test name (and therefore the `FAIL` line the ledger unions against) has the
backslash stripped by the JS runtime — so the scanner's extracted prefix could never match a real
`FAIL` line, and all three would have shipped as **silently uncovered marks** (caught only because
the harness's own "NO MUTATION REDDENS THESE" list flagged them, even though the mutations
visibly reddened the right tests in the per-mutation log above it). Fixed by switching those three
test names to double-quoted strings, which need no escaping. **Do not use `\'` inside a
single-quoted `test(...)` name in this codebase; use double quotes instead.**

## 7. `dataviz` and this loop's scope

Loaded per the handoff's instruction before finalising this note. Cross-checked against the
skill's non-negotiables: categorical hues used only from the fixed `SERIES_COLORS` set (never
generated); COOLING's chart is two stacked single-scale plots, never a dual y-axis (the
primitive's own guarantee); every severity-carrying element goes through `Chip`, which already
pairs colour with a glyph and an `sr-only` word; no panel hardcodes an inline colour for text.
The skill's own procedure (form → color → validate → marks → hover → accessibility) was already
discharged for the underlying primitives by step 9 and Q2; this loop's job was calling them
correctly, not re-deriving their design.

## 8. What was NOT done, on purpose

- **`app/dashboard-shell.tsx` was not touched.** `components/panel-props.ts`'s own doc comment
  describes the eventual swap (`<PanelPlaceholder .../>` → `<GpuPanel .../>`) as "10b's", but the
  handoff's operational rules are explicit and more specific: *"Scope: `components/panels/`
  (new), `components/`, and step 10's harness — **NOT `app/`**."* Followed the explicit rule.
  **Consequence, recorded for the owner/10c**: the nine panels exist, typecheck against
  `PanelProps`, and are fully tested, but there is still **no production call site** —
  `dashboard-shell.tsx` still renders nine `PanelPlaceholder`s. Wiring them in is a small,
  mechanical diff (exactly the one-line-per-slot swap `panel-props.ts` describes) but it is an
  `app/` change and was left for whichever phase owns that scope next.
- **`lib/format.ts`, `lib/severity.ts`, `lib/conditions.ts`, `lib/client/*` were not touched.**
  Every gap that would have wanted a change there (a `formatGiBPair`, D1's event feed) is
  recorded in §2/§5 instead of implemented, per the file-scope boundary above.
- **No fourth chart colour was added**, no `formatGiBPair` was added, no Q2-S2 toggle was built —
  each is a recorded decision or gap above, not a silent omission.
