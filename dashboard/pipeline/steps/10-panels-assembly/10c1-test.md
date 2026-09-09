# 10c1-test — the composition claim, attacked

**Run 2026-09-08.** Fresh agent, TEST phase of 10c1. Scope per the handoff: attack the build's
"no SVG-id, no CSS-module, no overflow bug" claim; audit the toggle; check for stale
`PanelPlaceholder` references, other single-GPU fixtures, and unmutated new branches. Fixing was
in scope and one gap was fixed (§4).

---

## 1. §3's answer, first

**The "no bug" claim survives on IDs, is unfalsifiable-as-stated on CSS, and was already the
honest limit on overflow. One real, unmutated gap was found and fixed: COOLING's GPU 1 trace had
never been rendered against a real second GPU by any fixture in the project.**

### 1.1 Duplicate DOM ids — checked, genuinely clean

Grepped every `.tsx` under `components/` for every place an `id`, `aria-labelledby`, or `htmlFor`
is minted (not consumed). Result: **exactly one call site in the whole tree mints an `id` at
all** — `stacked-time-series-chart.tsx:669`, `` const hatchId = `${id}-hatch` ``, used once at
`687` for one `<pattern>`. Every caller passes a `panelId`-prefixed `id`:
`gpu-panel.tsx` → `` `${panelId}-temp-chart` `` (×2, for `gpu0`/`gpu1`), `cooling-panel.tsx` →
`` `${panelId}-chart` ``. `Sparkline` (the other chart primitive, used by GPU's sparkline and both
of CPU's) mints **no** id at all — grepped and confirmed empty. `ChartViewToggle`'s button also
mints no id. So the "SVG-id namespace" `panel-props.ts` documents as an obligation has exactly one
thing to protect, and `dashboard-shell.test.tsx`'s new F16 tests assert it directly
(`id="gpu0-temp-chart-hatch"` present in the `gpu0` cell, absent from `gpu1`'s, and vice versa,
plus `cooling-chart-hatch`) — confirmed by rendering `stateOfTwoGpus()` and reading the actual
cells, not by trusting the build note. **This claim is correct, and it is correct because there is
almost nothing that could go wrong, not because nothing was checked.**

### 1.2 CSS module collisions — ⚠ **THIS SECTION IS WRONG. Corrected 2026-09-08 by 10c1's reconciliation; the original text is kept below, struck.**

> ⚠ **CORRECTION — read this before the struck text.** The diagnosis below is inverted. A
> `.module.css` import under Vitest resolves to a **Proxy**, not to `{}`. `Object.keys(styles)`
> is `[]` — which is the whole reason `console.log` printed `{}`, and the trap this phase fell
> into — but **property access returns a real, per-file-hashed class name**:
>
> ```
> Object.keys(grid) = []                    <- why console.log prints {}
> grid.gpu0         = "_gpu0_e75739"
> cooling.chart     = "_chart_a88580"       toggle.chart = "_chart_7a74fe"   (distinct)
> ```
>
> Verified independently by the adversarial phase (`10c1-adversarial.md` §7, `10c1-A7`) **and by
> the parent** before the reconcile handoff was written. Three consequences, and the first is why
> this is a marked correction rather than a deletion:
>
> 1. ⚠ **`grid.test.tsx`'s tier-2 placement guard and `dashboard-shell.test.tsx`'s sticky-band
>    assertion are LIVE, not vacuous.** They assert
>    `` `class="${styles[cssKey]}" data-slot="${slot}">` `` and
>    `expect(band?.className).toBe(shellStyles.stickyBand)`. If this section were true they would
>    be comparing `"undefined"`/`''` against markup carrying no class attribute and would **fail**;
>    they pass. A green suite refutes the claim. Acting on this section as written would have
>    weakened the exact guard 10a added to close its own F1 — the one that caught COOLING painting
>    in the event log's grid cell.
> 2. A **cross-file class collision IS observable today** — `cooling.chart !== toggle.chart` is a
>    runnable assertion. "Unfalsifiable" is the wrong word for it.
> 3. The real void is the **opposite** one, and it had a live instance: **every key resolves,
>    including keys with no rule.** `styles.zzzNoSuchRule` → `_zzzNoSuchRule_e75739`, and the
>    module's type is an index signature, so `tsc` is silent too. `alarm-banner.tsx` used
>    `styles.item` against a stylesheet declaring no `.item` (`10c1-A8`). That reference is
>    removed by this reconciliation; the mechanical audit for the shape is **10c-2's**.
>
> **Method note, the transferable part:** `console.log(styles)` on a Proxy prints `{}` and looks
> conclusive. Probe a **property access**, never the object.
>
> ⚠ §1's headline sentence — *"unfalsifiable-as-stated on CSS"* — is withdrawn on the same
> grounds. Binding is observable in jsdom today; a dangling reference is statically checkable with
> no runtime at all; only **paint** needs a browser (`10c1-A9`'s three tiers, which is what
> sharpens 10c-3's scope rather than expanding this loop's).

**The original section follows, struck rather than deleted — the wrong diagnosis is the part
worth keeping, because `console.log` on a Proxy will look this convincing again.**

~~Verified empirically rather than by reading `vitest.config.mts` and guessing: a probe test
importing two different `.module.css` files under Vitest 5's default config (no `test.css`
override anywhere in this project) printed~~

```
TOGGLE STYLES: {}          <-- Object.keys() is [], NOT the object's contents
COOLING STYLES: {}
```

~~**Every `.module.css` import resolves to an empty object in every test in this suite.**
`className={styles.chart}` renders as `className={undefined}` — React drops the attribute
entirely — in every panel, every test, every file. This is not new to 10c1; it is true of the
whole project and always has been. It means **no test anywhere, past or future, can observe a
CSS-module class name at all, let alone a collision between two files' classes.** A real collision
(two `.module.css` files that both, say, disabled CSS Modules' scoping by accident) would be
invisible to `pnpm verify` in exactly the same way it is invisible today with zero collisions.
Production is safe here for a structural reason — Next's build hashes every `.module.css` class
per-file, so two files using the class name `.chart` (several panels do) get distinct hashed names
by construction — but that is a guarantee from the *build tool*, not from anything this test
suite checks. **The honest answer to "what would have shown a CSS collision" is: nothing in this
suite, ever, for any file. Not a 10c1 gap — a standing, total blind spot worth recording once
here rather than re-discovering per step.**~~

### 1.3 Overflow — no new information, the existing limit still applies

jsdom has no layout engine (already established repeatedly in this project's own notes). Nothing
new to add: the live-Chrome check in §3.1 of `10c1-build.md` visually confirmed no overflow at the
900–1279px breakpoint by screenshot, which is the only way this class of claim can be checked at
all here.

### 1.4 The one real gap: COOLING's GPU 1 trace, never exercised against a real second card — FOUND AND FIXED

`cooling-panel.tsx` (written in 10b, unchanged by 10c1's diff) computes:

```ts
const gpu0Trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 0)?.tempC ?? null);
const gpu1Trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 1)?.tempC ?? null);
```

**Every fixture in `lib/fixtures.ts` — `everythingZero` and everything spread from it
(`pwm5NodeAbsent`, `pwm5Unreadable`, `servingPopulated`, all of them) — enumerates exactly one
GPU, at index 0.** `cooling-panel.test.tsx`'s one existing test for this
(`'the shared-time chart draws both GPU cards and fan 5...'`) only asserted the literal string
`'GPU 1'` appears — which is a **hard-coded legend label**, not data, and renders regardless of
whether `gpu1Trace` holds anything. No mutation in `regressions.py` touched the `g.index === 1`
line either. I mutated it by hand (`g.index === 1` → `g.index === 0`, so GPU 1's line silently
duplicates GPU 0's) and confirmed **the entire suite stayed green** — this was a real, invisible
gap, exactly the shape the handoff asked to hunt for.

**Fixed:** added a test to `components/panels/cooling-panel.test.tsx` that builds a genuine
two-GPU snapshot (tempC 66 vs 55) and renders the panel in table view, asserting the temperature
table's row reads `<td>66 °C</td><td>55 °C</td>` — GPU 1's own column, not GPU 0's value repeated.
Added the paired mutation `10c-CO4` to `regressions.py` (targets the exact line above). Verified:
the new test fails without the fix reverted (confirmed by hand-mutating and re-running before
wiring the harness entry) and the harness now reddens it correctly (`159` mutations, `187` ⚠
marks, exit 0 — see §6).

`gpu-panel.test.tsx`, by contrast, already builds its own local two-GPU snapshot (line ~113,
predating 10c1) and is not affected by this gap — its per-card index derivation is exercised
against real per-card data. `dashboard-shell.test.tsx`'s new `stateOfTwoGpus()` (10c1's own
addition) is a second, independent two-GPU fixture, local to that file. **No other panel reads
`snapshot.gpus` by index or by array position** (grepped `\.gpus` across `lib/` and `components/`)
— SAFETY, SERVING, STORAGE, MEMORY, SESSION EVENT LOG do not care about GPU count, so the
single-GPU assumption in `lib/fixtures.ts` has exactly one other blind spot, and it is now closed.

---

## 2. The toggle's own risks

All confirmed by direct code inspection plus the existing/added tests, not assumed:

- **Cross-panel independence.** `toggleChartView` does `setChartViews((prev) => ({ ...prev, [id]:
  ... }))` — a spread of `prev`, never of `INITIAL_CHART_VIEWS`. `dashboard-shell.test.tsx` has an
  explicit adversarial-shaped test for the failure mode that spreading the wrong object would
  cause ("toggling GPU 0 then CPU leaves GPU 0 STILL in table view"), and the paired mutation
  `10c-DS2` (spreads `INITIAL_CHART_VIEWS` instead of `prev`) reddens it. Confirmed correct.
- **Survives a poll.** Not exercised by a dynamic "poll then check" test, but verified sound by
  inspection rather than left as an assumption: `chartViews` is a plain, independent `useState` in
  `DashboardShell`; nothing re-keys or remounts the component on a new snapshot (`page.tsx` renders
  `<DashboardShell />` with no `key`, and nothing inside conditionally remounts it), so React's own
  guarantee that local state survives a re-render is what protects this, not application logic
  that could regress silently. The only way to break it would be to derive `chartViews` FROM
  `state` (e.g. `useState(() => ...state...)`) or introduce a `key` tied to the snapshot — neither
  exists. Recording this as "proven by inspection, not by a dedicated test" rather than silently
  treating it as tested, per the handoff's instruction to say so when jsdom (or, here, the test
  suite generally) can't be the one proving it.
- **No chart, no toggle.** `MemoryPanel`, `SafetyPanel`, `ServingPanel`, `StorageNetworkPanel`, and
  `SessionEventLogPanel` are typed against plain `PanelProps` — `view`/`onToggleView` do not exist
  on their prop types at all, and `dashboard-shell.tsx` does not pass them. This is a **type-level**
  guarantee, stronger than a runtime absence check: a future edit that tried to wire a toggle into
  one of these would fail `tsc` before it could ever render a stray button.
- **Invariant 2 — read-only, confirmed.** `ChartViewToggle`'s `onClick` calls only the caller's
  `onToggle`, which in `dashboard-shell.tsx` is `() => toggleChartView(id)` — a local `setState`
  call and nothing else. No `fetch`, no `runtime.*` call, no import of anything network-shaped
  anywhere in `chart-view-toggle.tsx` or the toggle wiring. Confirmed by reading the full file
  (62 lines) rather than by trusting the module doc's claim.

## 3. Invariant-7 granularity recording — assessed as honest

Re-read SPEC §6.2's chart/table language in full. It establishes THAT a table view exists as a
default and specifies its container behaviour (`max-height` + `overflow-y`, page-scroll promise
unaffected) but never addresses a panel with more than one chart — CPU's two independent
sparklines are the only case in the nine panels, and §6.2 doesn't mention CPU's charts at this
level of granularity at all. "A table view of the series" reads generically, not as a per-series
mandate. **The recording is honest: this is a genuine spec silence, not a constraint the build
worked around.** The reasoning given (one panel = one set of numbers a reader wants together; a
second button doubles CPU's control surface; GPU's own promotion mechanism already shows exactly
one of two chart elements by CSS) is a real argument, not a placeholder for "didn't think about
it."

## 4. `PanelPlaceholder` — no stray string references

Grepped for `PanelPlaceholder`/`panel-placeholder` across the whole repo excluding pipeline
history docs (which are expected to mention it as a closed decision). All production-code hits are
prose in module doc comments correctly describing it in the past tense
(`dashboard-shell.tsx`, `panel-props.ts`, `grid.tsx`, `components/panels/test-support.ts`) — no
import, no string literal a test or a harness mutation anchor depends on. `regressions.py`'s
`LEDGER_FILES` no longer lists `panel-placeholder.test.tsx` (it was removed with the file), and its
old mutations `10a-PP1`/`10a-PP2` are gone from `REGRESSIONS` — confirmed by grep, not just by
reading the build note's claim.

## 5. New branches and their mutations

- **The toggle**: fully covered — `10c-DS1..4`, `10c-CVT1..3`, `10c-GP1..3`, `10c-CP1..3`,
  `10c-CO1..3` (now `..4`, see §1.4) each target a real line and each is backed by a test that
  actually reddens under it (re-verified in §6, not re-derived from the build's own count).
- **The escape hatch's PURE function** (`force-alarm.ts`): fully covered, `10c-FA1..6`, and I read
  every one of `force-alarm.test.ts`'s 10 tests against its mutation and its own body — names
  match bodies in every case, including the deliberately unmarked `gpus: []` test (a second,
  independent guard defends that shape, so no single-line mutation can distinguish "correct" from
  "broken" there — verified by reading the second guard myself, not by trusting the comment).
- ⚠ **The escape hatch's WIRING into `use-telemetry.ts` has zero test coverage and zero mutation
  coverage — a real, unmutated new branch, distinct from the well-tested pure function it calls.**
  The new code is:
  ```ts
  fetchTelemetry: async () => {
    const response = await browserEnv.fetchTelemetry();
    if (response.kind !== 'ok') return response;
    return { kind: 'ok', body: forceAlarmForTesting(response.body, window.location.search, process.env.NODE_ENV) };
  },
  ```
  `use-telemetry.test.tsx` (pre-existing, from 10a's D6 work) tests `stop()`/`start()` lifecycle
  only — nothing in it references `forceAlarm`, `NODE_ENV`, or `location.search`.

  > ⚠ **CORRECTION, 2026-09-08 — the FINDING is right and the DEMONSTRATION below is wrong.**
  > Flipping `!==` to `===` does **not** compile: `TS2339: Property 'body' does not exist on type
  > '{ kind: "unauthorized" } | { kind: "error"; detail: string }'` (adversarial §5, run and
  > pasted). The discriminated union defends the `kind` check on its own, so the specific
  > 401→fake-ok scenario described here can never ship. The gap itself was real — the wiring had
  > zero test and zero mutation coverage — and it is now closed by
  > `lib/client/use-telemetry.force-alarm.test.tsx` with `10c-UT1..3`, which is also what closes
  > `10c1-A5` and `10c1-A6`. Recorded both ways per HANDOVER §0.5: *compare against the
  > counterfactual that was the code.*

  Concretely
  unguarded: flipping `!==` to `===` (so an `'unauthorized'`/`'error'` response gets fed to
  `forceAlarmForTesting` as if it were `'ok'`, and any genuinely-`'ok'` response is instead passed
  through untouched) would compile, and nothing in `pnpm verify` or `regressions.py` would catch
  it — worth noting because the failure mode is not cosmetic: on an unauthorized response,
  `response.body` doesn't exist, so `forceAlarmForTesting(undefined, ...)` returns `undefined`
  unchanged (the `typeof body !== 'object'` guard), and the wrapper would then hand back `{ kind:
  'ok', body: undefined }` — silently turning a 401 into a fake "ok" response with no body,
  which `wire.ts` would then reject as a validation failure rather than the session-handling path
  the real `'unauthorized'` kind would have triggered. **Not fixed** — it sits in `app/`-adjacent
  glue that would need either a jsdom-level integration test driving `useTelemetry` end to end
  with a mocked `env`, or a refactor pulling the wrapping into a small, directly-testable function
  the way `force-alarm.ts` itself already is. Flagging rather than patching, since the handoff's
  fixing budget was better spent on §1.4's silent, currently-untestable-without-a-fixture gap; this
  one has an obvious two testable shapes (mock `browserEnv.fetchTelemetry` to return each of the
  three `kind`s and assert the wrapper's output) for whoever picks it up.
- **`servingPanel`/`namesInstance`-class "used twice, mutated once" bug**: checked whether 10c1
  introduced anything with that shape (a helper called more than once, only one call site
  mutated). `ChartViewToggle`, `forceAlarmForTesting`, and `toggleChartView` are each called from
  exactly the call sites their own mutations exercise — no second, unmutated call site found.

## 6. Verification

```
$ pnpm verify
 Test Files  94 passed (94)
      Tests  2617 passed (2617)
Type Errors  no errors
```

(2617 = the build's 2616 plus the one test added in §1.4.)

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 206 distinct failing tests across 159 mutations; 187 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 159 regressions failed their check, as they must.
```

(159 = the build's 158 plus `10c-CO4`; 187 ⚠ marks = the build's 186 plus the new test. Both run
sequentially, never concurrently, per ANCHOR §4/the handoff.)

```
$ git status --short
 M app/dashboard-shell.test.tsx
 M app/dashboard-shell.tsx
 M components/grid.tsx
 D components/panel-placeholder.module.css
 D components/panel-placeholder.test.tsx
 D components/panel-placeholder.tsx
 M components/panel-props.ts
 M components/panels/cooling-panel.test.tsx      <- +1 test (§1.4), by this phase
 M components/panels/cooling-panel.tsx
 M components/panels/cpu-panel.test.tsx
 M components/panels/cpu-panel.tsx
 M components/panels/gpu-panel.test.tsx
 M components/panels/gpu-panel.tsx
 M lib/client/use-telemetry.ts
 M pipeline/steps/10-panels-assembly/regressions.py   <- +1 mutation (10c-CO4), by this phase
?? components/panels/chart-view-toggle.module.css
?? components/panels/chart-view-toggle.test.tsx
?? components/panels/chart-view-toggle.tsx
?? lib/client/force-alarm.test.ts
?? lib/client/force-alarm.ts
```

No stranded mutation from the harness run (confirmed after both runs); no dev server was started
by this phase; no `.env` file exists. Not committed.
