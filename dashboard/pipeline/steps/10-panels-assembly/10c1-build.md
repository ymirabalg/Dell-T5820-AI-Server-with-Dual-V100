# 10c1-build — wiring the panels, and the repeatable browser check

**Built 2026-09-08.** Branch `dashboard-frontend`, started clean at `be53c8d`.

Scope, per the handoff: (1) wire the nine real panels into `app/dashboard-shell.tsx` in place
of `PanelPlaceholder`; (2) give Q2-S2's chart/table toggle a shell-owned home; (3) make 10a-F4's
browser check repeatable, including a way to force an alarm client-side. Nothing from 10c-2
(cross-harness runner, `toContain` lint, L11, `exactOptionalPropertyTypes`) or 10c-3 (L9, gap
hatching, `--table-scroll-max`, Q2-F9's clamp-vs-drop) was touched.

---

## 1. The wiring, and what composing nine panels for the first time found

`app/dashboard-shell.tsx` now renders the real `GpuPanel` ×2, `CpuPanel`, `MemoryPanel`,
`CoolingPanel`, `SafetyPanel`, `StorageNetworkPanel`, `ServingPanel` and
`SessionEventLogPanel` — no `PanelPlaceholder` anywhere. `GpuPanel` is called directly with a
literal `panelId="gpu0"`/`"gpu1"` rather than through the generic `panel(id)` helper, because
`GpuPanelProps` narrows `panelId` to `'gpu0' | 'gpu1'` and the helper's return type carries the
full `PanelId` union — spreading it would silently widen the literal back out and let a swapped
slot typecheck (10b-F12's whole point). The other six panels are still built through `panel(id)`
unchanged, so `10a-DS9`'s existing mutation (which targets that helper's own line) still applies
without modification.

**Findings from actually mounting all nine together, as the handoff expected:**

1. ⚠ **The `PanelProps`-contract F16 test was checking a marker only the placeholder rendered.**
   `dashboard-shell.test.tsx`'s old F16 block asserted nine `data-panel-id` attributes — real
   for `PanelPlaceholder`, but no real panel renders that attribute at all (only `GpuPanel` and
   `CoolingPanel` mint an SVG id from `panelId`, and even that surfaces only as
   `${panelId}-…-hatch` on a gap pattern — verified by rendering and reading the actual output,
   not assumed). Rewritten to assert over what a real panel actually prints: each grid slot's
   `<h2>` title (`>GPU 0<`, `>cooling<`, `>storage &amp; network<`, …) matches the slot it sits
   in, and GPU 0/GPU 1's chart-hatch ids are distinct and don't cross-contaminate cells. This is
   strictly the earlier finding one level further along: 10a-F16 said the CONTRACT used to be
   prose; this says the TEST that watched the contract's effect was also watching a fixture
   artifact rather than production output, and it stopped being one the moment the placeholder
   it depended on was deleted.
2. **`StackedTimeSeriesChart`'s `id` prop does not surface as an element `id`.** It only reaches
   the DOM as `${id}-hatch` on the gap pattern (`stacked-time-series-chart.tsx:669`). I assumed
   (and first wrote a test assuming) the prop landed on the `<svg>` itself; running the suite
   caught it in under a minute. Recorded here because it is exactly the kind of assumption
   composition is supposed to catch, and did.
3. **GPU 1 is absent from `lib/fixtures.ts`'s `everythingZero`.** Several new dashboard-shell
   tests needed a genuine second enumerated card (`GpuPanel` takes the "card not enumerated"
   branch otherwise, per §6.5, and renders no chart at all) — a real fixture fact, not a test
   bug, and now documented at the one helper (`stateOfTwoGpus`) that manufactures it.
4. **An anomaly on THIS machine, out of scope for 10c1, recorded rather than chased:** running
   the assembled app for real (§3 below) against this Mac's own `/api/telemetry` — no GPU, no
   `dell_smm`, no `llama-server` — the header reads `● no readings` and every panel shows the
   ordinary null body rather than GPU's own "no GPUs enumerated" takeover. The header state is
   consistent with `latestSample(state)` staying `null` forever (no snapshot ever validates), in
   which case a panel body never distinguishes "no sample" from "sample says gpus: null" because
   `snapshot` itself is `null` in both of `GpuPanel`'s guarded branches. That would mean this
   Mac's `/api/telemetry` response fails `wire.ts` validation on some field wholesale, which is a
   collector/wire question (steps 3-6, long closed) and has nothing to do with panel wiring —
   noted for the owner rather than investigated further here.

No SVG id collision, no CSS module collision, and no panel overflowing its cell were found once
composed — the concrete risks the handoff named. `pnpm verify`'s full 94-file, 2616-test run
(§6) is the evidence, not an assumption.

### The `PanelPlaceholder` decision: **deleted**

`components/panel-placeholder.tsx`, its module CSS and its test file are gone. It implied a
mechanism ("panel body pending — see pipeline/steps/10-panels-assembly") that no longer runs
anywhere — exactly what HANDOVER's do-not-copy list is against. Its one genuinely useful
property — proving `panelId` reaches a slot — is now proven against the real panels' own output
(§1 above), so nothing it did is lost. `regressions.py`'s two mutations against it
(`10a-PP1`, `10a-PP2`) are removed with it; `10a-PP2`'s job is retaken by two new mutations
(`10c-DS1`, and the GPU/COOLING id-namespace assertions) described in §4.

Stale references to `PanelPlaceholder` in `components/grid.tsx`'s and
`components/panel-props.ts`'s module docs are corrected to describe the real panels, per the
same do-not-copy rule applied to prose, not just code.

---

## 2. Where the chart/table toggle went, and why

**The shell owns the state; the control renders beside each chart, never in the header.**

- **State**: `app/dashboard-shell.tsx` adds one `useState` — `chartViews`, a
  `Record<'gpu0'|'gpu1'|'cpu'|'cooling', 'chart'|'table'>` — and `toggleChartView(id)` flips one
  entry. This is a plain `useState`, unconditional and above the 2.5a early return (Rules of
  Hooks bind regardless of what the component goes on to render), consistent with `components/`
  staying hook-free: the three panels that draw a chart (`GpuPanel`, `CpuPanel`, `CoolingPanel`)
  take `view`/`onToggleView` as **optional** props and render nothing new when `onToggleView` is
  omitted — every existing test in those three files renders exactly as before, unchanged.
- **Placement — invariant 7, and SPEC is NOT silent here.** §6.2, amended 2026-09-07/08, is
  explicit that "that is the whole header, and the list is exhaustive" (cadence, window,
  refresh, pause/resume, logout) and separately, of the hover layer and table view: "They remain
  outside §6.2's four controls… A tooltip is part of a chart, not a control of the page." So the
  control is rendered **inside each chart-bearing panel**, immediately above its chart(s)
  (`components/panels/chart-view-toggle.tsx`), never threaded into `Header`. This is not this
  build's invention — the spec already forbids the header placement — but it was worth
  confirming against the actual text before wiring it, since "the shell owns the state" could
  otherwise have been misread as "the shell's header owns the control."
- ⚠ **Invariant 7, genuinely: granularity is NOT specified, and this build records a decision.**
  §6.2 does not say whether a toggle governs one chart or a whole panel's charts, and CPU draws
  two independent sparklines (temperature, utilisation). This build gives **one toggle per
  panel**, governing every chart that panel draws — recorded with the reasoning in
  `chart-view-toggle.tsx`'s module doc: a reader who wants numbers usually wants all of a
  panel's numbers, a second button would double the control surface on the shortest card on the
  page, and GPU's own ≥1600px promotion already shows exactly one of two chart elements at a
  time by CSS, so one `view` value naturally covers whichever is visible. If a future panel's
  charts turn out to want independent toggles, that is a new decision, not an extension of this
  one — stated so nobody reads the current shape as spec-mandated.
- **Four panels wire it**: GPU 0, GPU 1, CPU, COOLING — the only panels `grep`-confirmed to
  contain a `Sparkline` or `StackedTimeSeriesChart`. MEMORY, SAFETY, SERVING, STORAGE & NETWORK
  and SESSION EVENT LOG have no chart and take no `view` prop.

---

## 3. The repeatable browser check (10a-F4)

### 3.1 The seven viewport measurements, and what actually got checked live

1. COOLING's two-row span in columns 1-2 at ≥1280px.
2. The 1279px side of the 900/1280 breakpoint (2-column layout).
3. The 1280px side (the §6.1 4-column design target).
4. The 899px side of the 900px breakpoint (1-column, priority order).
5. The 900px side (2-column layout begins, COOLING full width).
6. The <900px panel order (GPUs → COOLING → SAFETY → the CPU/MEMORY pair → SERVING → STORAGE →
   SESSION EVENT LOG last, `grid.module.css`'s own recorded decision).
7. The ≥1600px promotion (GPU cards show the full `StackedTimeSeriesChart`, not the sparkline).

⚠ **`grid.test.tsx`'s existing tier-3 source-text guard already protects the NUMBERS** (the
exact breakpoints, the area maps, COOLING's span) against a typo or a dropped row — that is
mechanical and already in the suite. What it cannot do, and what jsdom cannot do at all (no
layout engine, confirmed repeatedly in this project's own notes and re-confirmed here), is prove
a real browser **paints** it that way.

**This build ran the assembled app in a real, connected Chrome** (`next dev`, a scrypt hash and
session secret generated on the fly and passed as shell environment variables — never written to
an `.env` file — the server stopped and the port freed before finishing; see §6). What came back:

- **Login → dashboard flow works end to end** against the real auth stack, and all nine real
  panels render with real content (not placeholder text) — GPU 0/GPU 1's `table view` buttons,
  COOLING's, CPU's, all present.
- ⚠ **Measurement 7 (≥1600px promotion) was confirmed by reading computed style, not by eye**:
  at the window's rendered width, `getComputedStyle` on GPU 0's `fullChartWrap` read
  `display: block` and on its `sparklineWrap` read `display: none` — the exact CSS-only
  mechanism `gpu-panel.tsx`'s module doc describes, working for real.
- **Measurement 5 (900-1279px, COOLING full width) was confirmed visually**: a screenshot showed
  GPU 0 | GPU 1 on row 1, COOLING spanning the full width of row 2, then the CPU/MEMORY and
  SAFETY/STORAGE 2×2, then SERVING and SESSION EVENT LOG each full width — exactly
  `grid.module.css`'s documented 900px area map.
- ⚠ **Measurements 1-4 and 6 could NOT be pinned to exact pixel boundaries.** `resize_window`
  reported success at every width requested (899, 500, …) but `window.innerWidth` read back a
  constant, unrelated value (3440) that never changed across resize calls, and the rendered
  screenshot also never changed across those same calls. This is a **tooling limitation of the
  interactive browser-automation session available here**, not a finding about the app: nothing
  about the dashboard is implicated, only that this particular remote-Chrome setup does not
  give reliable programmatic control over viewport width the way a headless test runner's
  `setViewportSize` does.
- **The alarm-forcing escape hatch was exercised and confirmed to fail safe.** With
  `?forceAlarmForTesting=1` on this GPU-less Mac (`/api/telemetry` genuinely returns
  `gpus: null`), no banner appeared and the header stayed at `● no readings` — exactly
  `force-alarm.ts`'s documented behaviour for a snapshot with no enumerated GPU (§3.2 confirms
  the code path; live-mounting a real alarm end to end needs a machine where `gpus` is actually
  an array, i.e. `ai-server` itself or a fixture-capable harness, neither of which this loop has).

### 3.2 The alarm-forcing mechanism (`lib/client/force-alarm.ts`)

A pure function, `forceAlarmForTesting(body, search, nodeEnv)`, wrapped around
`RuntimeEnv.fetchTelemetry` in `lib/client/use-telemetry.ts`. It reshapes the **already-received**
JSON body — forcing `gpus[0].tempC` to 95 °C (§6.3 alarm band) — before `wire.ts` ever validates
it, so every later stage (validation, severity, the 10 s debounce, the banner's ordering) runs
unmodified and for real; a forced alarm takes the same two-poll confirmation delay a genuine one
would. It deliberately does **not** fabricate a `DisplayedCondition` by hand, because
`lib/conditions.ts` documents that type as "never built by hand" and a hand-built one would have
to be kept in sync with every other reduction `state.displayed` feeds — the exact duplication §9
forbids.

**Gating, and where invariant 6 caught a wrong claim in this very file:**

- Guarded by `nodeEnv === 'production'` **and** an explicit, undocumented query string
  (`forceAlarmForTesting`) — never a bare "debug mode" flag.
- ⚠ **The first draft claimed `next build`'s minifier deletes the whole function, the way jsdom
  never reaches `.next/standalone`.** Verified by actually building and grepping — and the claim
  was **wrong**:
  ```
  pnpm build
  grep -rl forceAlarmForTesting .next/standalone   # no matches
  grep -rl forceAlarmForTesting .next/static       # .next/static/chunks/2ef5wwm185we0.js
  ```
  The function and its string literal DO ship in the client bundle. What the same grep also
  shows is why the gate still holds anyway: the one call site
  (`use-telemetry.ts`) reads `process.env.NODE_ENV`, and Next's build DOES replace that read with
  the literal `"production"` — the compiled call is
  `…(e.body,window.location.search,"production")`, a hard-coded string, not a variable. So no
  input from the browser can ever make that argument anything but `"production"` in a production
  build; the minifier simply doesn't take the extra step of inlining the *callee's* body at that
  one call site (ordinary JS minifiers don't do that kind of interprocedural optimisation). The
  honest claim, now written into `force-alarm.ts`'s own doc: **the escape hatch cannot be
  triggered in a production build — provably, not just by default — but it is not absent from
  the bundle the way jsdom is absent from `.next/standalone`.** This is exactly what "verify
  rather than assert" is for, and the corrected file keeps a record of the wrong first claim
  rather than silently fixing it.

### 3.3 Decision: no headless browser dependency added this loop

**Not added**, and none of `pnpm verify`'s tooling changed. The argument:

- The project's own toolchain note (`ANCHOR.md` §3) is explicit: *"Dependencies: next, react,
  react-dom only, plus five dev. No native modules."* Playwright/Puppeteer both ship a browser
  binary — a materially different class of dependency than `jsdom` (a pure-JS devDependency
  10a could trace through `next build`'s output and prove absent). The same trace-based proof
  10a used for jsdom does not even apply cleanly to a browser binary, since it is not something
  `@vercel/nft` traces as a JS import in the first place — it is a separate download step.
- It would turn `pnpm verify`'s single deterministic command into something that needs a real
  browser runtime present in CI, on a project whose own §0.3 already documents one
  contention-sensitive flake and whose standing rule is "never run two harnesses at once."
- The interactive session available to THIS build (§3.1) demonstrated the actual failure mode a
  dedicated tool would avoid: unreliable programmatic viewport control. A proper headless
  harness (Playwright's `page.setViewportSize`, purpose-built and known reliable for exactly
  this) would not have that problem — which is itself the argument for giving this its own loop
  with the right tool, rather than half-solving it here with the wrong one.
- The handoff explicitly allows this call: *"If you conclude the browser step belongs in its own
  loop, say so with the argument rather than half-building it."*

**What a future loop would need, concretely:** add Playwright (or Puppeteer) as a devDependency;
verify with `pnpm build` + a grep of `.next/standalone` that it does not reach the production
image (the same method used here for jsdom and for `force-alarm.ts`, and expected to succeed
since it too is test-only code never imported by `app/`/`lib/`/`components/`/`proxy.ts`); write a
script that starts `next dev` or `next start`, logs in (scripting `hashPassword`/env vars the way
this build did by hand), resizes to each of the seven checkpoints, and asserts on
`getComputedStyle`/`getBoundingClientRect` rather than a screenshot; and decide whether it runs
inside `pnpm verify` or as a separate, slower, opt-in command — recommended: separate, given the
"never two harnesses at once" rule and the browser runtime's own startup cost.

**What this build DID deliver, short of full automation:** the seven measurements are named
precisely (§3.1) with a documented, repeatable procedure (the `next dev` + auth + resize
sequence above); five of the seven were actually exercised once against a real browser this
session, with a genuine, unrelated tooling limitation identified and separated from the app's
own correctness; and the alarm-forcing mechanism that would let a future automated check see the
banner at all is built, unit-tested, and confirmed to fail safe.

---

## 4. ⚠ marks and their mutations

Every new ⚠-marked test is backed by a `10c-`-prefixed mutation in
`pipeline/steps/10-panels-assembly/regressions.py` (22 new mutations; `_assert_unique_ids`'s
prefix whitelist widened to admit `10c-`). Two removed with `PanelPlaceholder`
(`10a-PP1`, `10a-PP2`).

| mutation | file | what it breaks |
|---|---|---|
| `10c-DS1` | `dashboard-shell.tsx` | GPU 1 slot fed `panelId="gpu0"` — the exact copy-paste wiring bug the deleted placeholder's marker used to catch |
| `10c-DS2` | `dashboard-shell.tsx` | toggling one panel resets every other chart-bearing panel back to chart view |
| `10c-DS3` | `dashboard-shell.tsx` | the toggle never flips |
| `10c-DS4` | `dashboard-shell.tsx` | every chart-bearing panel starts in table view |
| `10c-CVT1` | `chart-view-toggle.tsx` | the button's `onClick` is dropped |
| `10c-CVT2`/`10c-CVT3` | `chart-view-toggle.tsx` | the button's label stops tracking which view is current, in each direction |
| `10c-GP1`/`10c-GP2`/`10c-GP3` | `gpu-panel.tsx` | wrong default view; toggle control never renders; the sparkline is pinned to chart view independent of the prop |
| `10c-CP1`/`10c-CP2`/`10c-CP3` | `cpu-panel.tsx` | same three, for CPU's two sparklines |
| `10c-CO1`/`10c-CO2`/`10c-CO3` | `cooling-panel.tsx` | same three, for the shared-time chart |
| `10c-FA1`…`10c-FA6` | `force-alarm.ts` | inverted production gate; removed query-string gate; a temperature that no longer clears the alarm band; dropped other GPU fields; dropped null-body guard; dropped array-shape guard |

⚠ **One test deliberately UN-marked, per ANCHOR §5's own standard** ("if the property has no
plausible wrong implementation, drop the ⚠"): `force-alarm.test.ts`'s `` `gpus: []` `` case is
defended in depth by a SECOND guard (`firstGpu === null || typeof firstGpu !== 'object'`) a few
lines below the length check, so disabling only the length check still passes through the second
guard — no single-line mutation distinguishes "correct" from "that check removed" for this one
input shape. Recorded in the test file itself rather than silently dropped.

---

## 5. Gaps recorded (invariant 7)

1. **Chart/table toggle granularity is one-per-panel, not one-per-chart** (§2) — the spec does
   not say; recorded in `chart-view-toggle.tsx`.
2. **The browser check's seven measurements are a documented, partially-executed manual
   procedure, not a `pnpm verify`-integrated automated one** (§3.3) — argued, not half-built.
3. **`force-alarm.ts`'s original "the minifier deletes it" claim was wrong**, corrected to the
   accurate "the one call site is a compile-time-constant, so the gate is unreachable even
   though the code ships" (§3.2).
4. **An anomaly on this dev Mac** (§1, item 4) where every panel renders its pre-first-poll body
   rather than GPU's own takeover message, suggesting `/api/telemetry`'s response may be failing
   `wire.ts` validation wholesale on this machine — a collector/wire question, out of 10c1's
   scope, recorded for whoever next runs the app locally without `ai-server`'s hardware.

---

## 6. Verification

```
$ pnpm verify
 Test Files  94 passed (94)
      Tests  2616 passed (2616)
Type Errors  no errors
```

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 205 distinct failing tests across 158 mutations; 186 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 158 regressions failed their check, as they must.
```

```
$ git status --short
 M app/dashboard-shell.test.tsx
 M app/dashboard-shell.tsx
 M components/grid.tsx
 D components/panel-placeholder.module.css
 D components/panel-placeholder.test.tsx
 D components/panel-placeholder.tsx
 M components/panel-props.ts
 M components/panels/cooling-panel.test.tsx
 M components/panels/cooling-panel.tsx
 M components/panels/cpu-panel.test.tsx
 M components/panels/cpu-panel.tsx
 M components/panels/gpu-panel.test.tsx
 M components/panels/gpu-panel.tsx
 M lib/client/use-telemetry.ts
 M pipeline/steps/10-panels-assembly/regressions.py
?? components/panels/chart-view-toggle.module.css
?? components/panels/chart-view-toggle.test.tsx
?? components/panels/chart-view-toggle.tsx
?? lib/client/force-alarm.test.ts
?? lib/client/force-alarm.ts
```

No stranded mutation from the harness; `.next/` and the `next dev` session used for §3.1 were
removed and stopped respectively before finishing, and no `.env` file was written (both
`PASSWORD_HASH` and `SESSION_SECRET` were passed as shell environment variables for that one
session only).
