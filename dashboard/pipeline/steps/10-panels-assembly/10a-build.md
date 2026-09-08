# Step 10a — the shell: BUILD notes

> ⚠ **CORRECTED 2026-09-08 by 10a's reconciliation.** Five statements below were overstated or
> have been superseded; each is marked inline with a **`CORRECTION`** block rather than edited
> away, because what a phase believed at the time is evidence too. In summary:
> §2.2's `PanelProps` was **prose only** and is now a real exported type (`components/panel-props.ts`);
> §2.6's age indicator no longer appends ` ago` inside `Header`;
> §3's two `lib/client/` modules survive, but `aggregateStatus`'s **signature** changed;
> §4.2's banner drops neither `stale` nor `lastSeenMs` any more;
> §7's "what this suite cannot prove" list was **incomplete** — it named CSS and sticky positioning
> and did not name the one that mattered, that the whole non-null branch of `dashboard-shell.tsx`
> was executed by nothing. See `10a-reconciliation.md` §2.

Fresh agent, no memory of this project. Read the handoff, `SCOPE.md`, `SPEC.md` §6.1/6.2/6.4/6.5,
`ANCHOR.md` §4/5/8/9, `PLAN.md`, `HANDOVER.md` §3.5, `UI-BACKEND-GAPS.md` §2.5–2.9/§4, and the
`dataviz` skill, before writing anything. This document is written for 10b, which writes the
nine panel bodies against exactly what is decided here.

---

## 1. ⚠ THE DECISION — where state lives, and what a panel receives

**Decision: `components/` (including `components/panels/`, once 10b creates it) stays 100%
hook-free. Exactly two hooks exist in this project outside `components/`, both under `app/`:
`useTelemetry()` and a new `useNowTick()`. `app/dashboard-shell.tsx` is the ONE caller of both,
and the sole owner of state.**

### Why, beyond "the precedent said so"

The handoff already names the precedent (Q2's chart/table toggle, L9's sparkline sizing, L4's
SVG ids, all pointing at step 10 as the stateful caller) and `purity.test.ts`'s own doc says the
walk was made recursive *specifically* so `components/panels/*.tsx` would be covered. I verified
the guard actually enforces this rather than trusting the doc comment: `components/purity.test.ts`
matches `\buse(?:[A-Z]\w*)?\s*\(` — every shape React's own naming convention allows, including
`useSyncExternalStore` — over every non-test `.tsx` under `components/`, recursively. There is no
carve-out for a "thin" hook. So the only way to put ANY hook-driven state under `components/`
would be to weaken that guard, which the handoff explicitly forbids and I did not do.

That leaves exactly one place hooks can live: `app/`. Two hooks exist there, for two different
reasons:

1. **`useTelemetry()`** (step 8) — the poll loop, already built, unchanged.
2. **`app/use-now-tick.ts`'s `useNowTick(intervalMs)`** — new in 10a, for D2/2.5b. It is a plain
   `setInterval` wrapped in `useState`/`useEffect`, wholly independent of `useTelemetry`'s store.
   This is the seam that makes the age indicator's "own interval" rule real rather than aspirational:
   if the age text were derived only from `RuntimeState`, it would update once at the `live→stale`
   crossing (the store's own `applyMode` folds mode into the same patch as everything else) and
   then sit frozen between polls — correct-looking in a fast fixture, silently wrong the moment a
   real failure needs the number to keep moving. `app/use-now-tick.test.tsx` proves the tick
   advances with **no other input changing at all** (§2.6 below).

Both hooks live in files under `app/`, never `components/` — matching the one other hook-bearing
file this project already has outside `components/`, `app/login/login-form.tsx` (step 7, using
`useState`/`useEffect` for its own submit-state machine). That was already the established shape;
10a's contribution is applying it to the dashboard shell rather than discovering it.

### What this means concretely

`app/dashboard-shell.tsx` (`'use client'`) is the entire stateful surface of the dashboard:

```ts
const { state, runtime } = useTelemetry();   // one call
const nowMs = useNowTick(1000);               // one call, unconditional, before any early return
if (state === null || runtime === null) return <ConnectingShell />;   // 2.5a, the ONE wrapper
// everything below here sees a real, non-null RuntimeState
```

Everything under `<Header>`, `<AlarmBanner>` and `<Grid>` — and, once 10b writes them, every one
of the nine panels — is a pure function of props. No panel calls `useTelemetry`, no panel starts
its own timer, no panel holds a band or a previous reading to compare against.

## 2. The props contract 10b writes against — precisely

### 2.1 The null-before-first-poll wrapper (2.5a) — what it hands down

The check above is the **only** `state === null` guard in the whole assembly. Below it:

- `state: RuntimeState` is real and non-null, but its **contents** can still be "no reading yet"
  in the ordinary sense — `latestSample(state)` is `null` before the first sample lands, and every
  field a formatter reads from it renders `—` exactly as invariant 1 already requires. **A panel
  never needs to ask "has the hook mounted yet" — only "is this particular field null," which is
  the same question it would ask on poll 400 as on poll 1.**
- `runtime: TelemetryRuntime` is real and non-null, and is `app/`'s only handle on the four §6.2
  controls (`setCadence`, `setWindow`, `pause`/`resume`, `refreshNow`). **10b's panels never see
  `runtime` at all** — no panel needs to change cadence, window, or pause state, and none is
  passed a reference to it. (If a future panel genuinely needs a control — e.g., a per-panel
  retry — that is a new decision, not an extension of this one.)

### 2.2 What a panel component receives

**Every one of the nine panels is a pure function of exactly two required inputs, plus whatever
narrow, panel-specific props its own head (`title`/`subtitle`/`chip`) needs on top:**

```ts
interface PanelProps {
  readonly state: RuntimeState;   // the full, non-null state — see below for why "full"
  readonly nowMs: number;         // this tick's wall-clock ms, from useNowTick
  // + panel-specific props, e.g. a GPU panel additionally takes `index: 0 | 1`,
  //   a unique id-prefix (see 2.4), and whatever `CHART_SIZE` entry it wants (see 2.5)
}
```

> **CORRECTION (reconciliation, adversarial F16).** This block was **prose with no code behind
> it**: no `PanelProps` existed anywhere in the repo, `PanelPlaceholder` took `{ title }` alone,
> and `GridProps`'s nine slots are `ReactNode`, which any element satisfies — so nine panels could
> each have invented a different prop name and shape and every one would have typechecked. It is
> now real: **`components/panel-props.ts`** exports `PanelProps` (`state`, `nowMs`, `panelId`) and
> `PanelId`, `PanelPlaceholder` implements it, and `dashboard-shell.tsx` really passes all three
> to all nine slots. The id-discriminator's **name** is `panelId` and its value is the grid slot's
> own name — decided here rather than left for nine panels to each guess (§2.4 below).

**Why the FULL `RuntimeState`, not a pre-sliced subset.** I considered handing each panel a
narrower, panel-specific slice computed in `dashboard-shell.tsx` (e.g. a `GpuPanelProps` with
just `gpu: Gpu`, `servingInstance: ServingInstance | null`, `conditions: DisplayedCondition[]`)
and rejected it: computing that slice IS the panel body's domain logic — the GPU↔instance join
(`gpu.index === serving.instance`, "correct on this deployment and not derivable from the
snapshot"), COOLING's channel-5 reasoning, SAFETY's `errorsForPanel` join — all of it belongs to
10b, which SCOPE.md explicitly keeps out of 10a's hands ("the nine panel bodies… against a guess
about what each panel needs rather than what its body actually turns out to need" is exactly the
failure mode SCOPE names for doing 10b's job early). Handing over the whole `state` and `nowMs`
gives 10b everything it needs and nothing it has to ask `app/` to add later. The panel-body rules
already on the books (HANDOVER §6, reproduced in `UI-BACKEND-GAPS.md` §4) bind unchanged:

- **Read `state.displayed`, never `conditionsFrom`.** `conditionsFrom` is un-deduplicated by
  design; `state.displayed` is `observePoll`'s already-deduplicated, already-debounced output.
- **A cell's colour is `lib/severity.ts` on the current reading, never `state.displayed`'s
  (debounced) severity.** The chip on a panel's own head, per `PanelShell`'s doc, is "the panel's
  own severity, from §6.3 on the current reading" — undebounced, on purpose.
- **Hatch `state.gaps`, never infer a gap from a hole in a series.**
- **600 points per series** (`decimateSeries`), not per chart.

### 2.3 The nine grid slots, exact names

`components/grid.tsx`'s `GridProps` — this is the literal, load-bearing vocabulary 10b's panel
files plug into from `dashboard-shell.tsx`:

```ts
interface GridProps {
  readonly gpu0: ReactNode;
  readonly gpu1: ReactNode;
  readonly cpu: ReactNode;
  readonly memory: ReactNode;
  readonly cooling: ReactNode;
  readonly safety: ReactNode;
  readonly storageAndNetwork: ReactNode;
  readonly serving: ReactNode;
  readonly sessionEventLog: ReactNode;
}
```

10b's job is to replace, one at a time, each `<PanelPlaceholder title="…" />` currently sitting
in these nine slots (in `dashboard-shell.tsx`) with a real panel component — the grid wiring, the
CSS classes, and the slot names do not change. See §5 for the placeholder decision itself.

### 2.4 Unique SVG ids (2.5d, L4) — who owns what

L4 assigns this to "the caller" of the chart primitives, which is the panel body, not `app/` —
but a panel body cannot know **on its own** that it is the GPU-0 instance rather than the GPU-1
instance unless something upstream tells it, because 10b will almost certainly write ONE `GpuPanel`
component function and mount it twice (`<GpuPanel index={0} .../>`, `<GpuPanel index={1} .../>`),
not two separately-named components. Two mounted instances of the same component, each rendering
an SVG chart, will produce colliding ids unless something disambiguates them.

**Decision: `dashboard-shell.tsx` passes each panel a stable, unique string discriminator — the
grid slot's own name (`'gpu0'`, `'cooling'`, …) — and the panel prefixes every SVG id it mints
with it** (e.g. `` `${panelId}-temp-trace` ``). This keeps the actual string-building at the
call site that has the concrete chart (10b's job, since only it knows how many charts one panel
mounts and what to call them), while the one fact that has to come from outside the panel — "which
instance am I" — comes from the one place that already enumerates every panel by name. No chart
is mounted yet in 10a (every slot is a `PanelPlaceholder` with no chart), so this is a recorded
decision for 10b to build against, not something exercised by a test today.

### 2.5 Chart/sparkline sizing (2.5e, L9) — the grid's decision, exported

`components/grid.tsx` exports:

```ts
export const CHART_SIZE = {
  sparkline: { width: 220, height: 44 },
  cooling: { width: 480, height: 210 },
} as const;
```

`sparkline` is the default size for the small in-card trace every panel but COOLING uses.
`cooling` is taller because COOLING's own shared-time chart spans two grid rows (§6.1) and needs
the height; a plain sparkline-sized box there would leave the extra row height unused, which is
the exact "dead ground" §6.1 says spanning COOLING is for.

⚠ **The ≥1600px "sparklines promoted to full line charts" rule is deliberately left to 10b, and
is NOT a size decided here.** §6.1 changes which chart COMPONENT a GPU card uses at that width
(`Sparkline` → `StackedTimeSeriesChart`), not merely a number — that is panel-body work. The
recommendation recorded for 10b (not mandated): render both variants and let a
`min-width: 1600px` media query in the panel's own CSS module show one and hide the other, so no
new viewport-tracking hook has to be invented on either side of the hook boundary in §1. If 10b
wants `app/` to track viewport width as JS state instead, that is a new decision to make there,
not an extension of this one.

### 2.6 The age indicator (D2/2.5b), concretely

`Header` takes `ageText: string`, already formatted — it has no clock of its own. The formatting
happens in `dashboard-shell.tsx`, on every render, from the tick:

> **CORRECTION (reconciliation, adversarial F9).** `Header` used to render `{ageText} ago`, so
> `formatAge(null)` — which is `—` — came out as **`— ago`**, an em dash wearing a unit word, a
> shape no other formatter output in this project produces. The trailing word is now composed by
> `dashboard-shell.tsx` and `ageText` is documented as complete, `'2 s ago'` or a bare `—`.
> **Also corrected: the claim that this hook's independence was proved.** `use-now-tick.test.tsx`
> proves the HOOK; nothing proved the CALLER, and deleting `useNowTick` outright in favour of
> `Date.now()` at render shipped green (F8). `app/dashboard-shell.test.tsx` now advances fake
> timers with the state object referentially unchanged and asserts the age moves.

```ts
const nowMs = useNowTick(1000);
// … later, inside the render that follows the 2.5a guard:
ageText={formatAge(ageMs(state, nowMs))}
```

`useNowTick` never reads `state`. `dashboard-shell.tsx` is a single function component, so React
re-renders the whole tree (including the `ageText` computation) on every tick regardless of
whether `useTelemetry`'s store changed — which is the property that makes the indicator honest:
it moves because time passed, not because a poll happened to land.

`app/use-now-tick.test.tsx` proves this in isolation, without `useTelemetry` in the picture at
all: three interval advances produce three distinct, increasing values with **no prop change and
no external store**, and unmounting clears the timer (⚠, `10a-NT1`/`10a-NT2`).

---

## 3. ⚠ Scope: two files outside `app/`, `components/` and the harness

The handoff scoped this loop to `app/`, `components/`, and step 10's harness. I added two files
under `lib/client/`: `header-status.ts` and `banner.ts`. Stating the reasoning rather than
quietly stepping over the line:

**What they are.** Both are pure, hook-free reduction functions with zero React in them:

- `lib/client/header-status.ts` exports `aggregateStatus(mode: RuntimeMode, alarms: number,
  severity: Severity | null): { glyph: string; text: string }` — §6.2/§9's rule that "paused shows
  mode **and** alarm count,"
  the count omitted at zero in every mode. This is **half of `PLAN.md`'s green criterion for step
  10**, named in the handoff as needing its own ⚠ test and mutation.
- `lib/client/banner.ts` exports `bannerView(displayed: readonly DisplayedCondition[]):
  { count: number; lead: BannerCondition | null; rest: readonly BannerCondition[] }` — §6.4's
  "multiple conditions collapse into one banner with a count," plus the ordering decision §6.4
  leaves silent (§5 below). It is built directly on `lib/conditions.ts`'s existing
  `bannerConditions` export, adding only the ordering `lib/conditions.ts` does not decide.

**Why not inline them in `header.tsx`/`alarm-banner.tsx`.** Nothing in `purity.test.ts` would
have stopped that — the guard is about hooks, not about where logic lives. But every other piece
of non-trivial reduction logic downstream of the wire contract in this project lives in `lib/`,
tested in plain Node with no DOM (`lib/conditions.ts`'s `aggregateSeverity`/`alarmCount`,
`lib/client/observations.ts`'s `errorsForPanel`, `lib/client/series.ts`'s `traceFor`) — `lib/`
holds the pure domain logic, `components/` lays it out. Folding `aggregateStatus`/`bannerView`
into a `.tsx` file would have been the first departure from that split, and would have made two
things worse: the ⚠-marked, load-bearing logic the handoff specifically called out would only be
testable through `renderToStaticMarkup` instead of a plain `expect(fn(...)).toBe(...)`, and
nothing else could ever reach the same reduction without importing a React component.

> **CORRECTION (reconciliation, adversarial F5).** The **scope** call above stands — both modules
> stay in `lib/client/` — but the signature quoted was the defect. `aggregateStatus` took no
> `severity`, which made §9's "the dot **and** the count are ONE reduction" structurally
> impossible to honour: the dot's colour came from `RuntimeState.severity` and the words came from
> `alarms` alone, so `● all healthy` rendered beside a grey "no band" dot on every page load before
> the first poll. It now takes `severity` and renders `no readings` in that state. The literal is
> **spec question S-A**.

**Where I land.** I believe the scope line was drawn assuming 10a is pure assembly with no new
*logic* modules — a reasonable default, since steps 1–9 own `lib/`. But the header's zero-omission
rule and the banner's ordering are exactly the shape of thing this project has repeatedly pulled
out of a rendering file and into `lib/client/` (D4, D5 are the direct precedent, both explicitly
serving step 9/10's needs). I made the call that these two belong beside them rather than inline.
**If the owner disagrees, the fix is mechanical**: inline both functions into `header.tsx` and
`alarm-banner.tsx` respectively, delete the two `lib/client/*.test.ts` files, and fold their
assertions into `header.test.tsx`/`alarm-banner.test.tsx` via `renderToStaticMarkup`. Their public
surface — the two function signatures above — would not need to change either way, so 10b's
handoff (§2) is unaffected regardless of which way this is resolved.

---

## 4. What was built

| Area | Files |
|---|---|
| **Header** (§6.2, exhaustive control set) | `components/header.tsx` + `.module.css` + `.test.tsx`; `lib/client/header-status.ts` + `.test.ts` |
| **Sticky alarm banner** (§6.4) | `components/alarm-banner.tsx` + `.module.css` + `.test.tsx`; `lib/client/banner.ts` + `.test.ts` |
| **Grid + 4 breakpoints** (§6.1) | `components/grid.tsx` + `.module.css` + `.test.tsx` |
| **The 10a/10b seam** | `components/panel-placeholder.tsx` + `.module.css` + `.test.tsx` (§5) |
| **`app/` wiring, one `useTelemetry()`** | `app/dashboard-shell.tsx`, `app/page.tsx` (now renders it) |
| **D2/2.5b's own interval** | `app/use-now-tick.ts` + `.test.tsx` |
| **D6** | `lib/client/use-telemetry.test.tsx` (jsdom) + `.ssr.test.tsx` (plain node) |
| **Step 10's harness** | `pipeline/steps/10-panels-assembly/regressions.py` — copied from step 9's, 32 mutations, `10a-` prefixed |

`app/page.tsx` is now four lines: it renders `<DashboardShell />` and nothing else, keeping the
rule from HANDOVER §3.3/§6 rule 6 ("`app/page.tsx` must stay free of telemetry and secrets") true
by construction — there is no prop, no snapshot, nothing for a server render to embed.

### 4.1 Header (§6.2) — the exhaustive list, and the two things that had already bitten a draft

All ten items render: hostname, `uptimeSec`, the aggregate dot, the snapshot timestamp + zone,
the age of the last successful snapshot, cadence, window, refresh now, pause/resume, and a
visually-separated logout. **No IP address, no kernel release** — both are guarded by a ⚠ test
that fails if either literal ever reappears (`10a-H10`/`10a-H11` reintroduce them as mutations,
matching the exact regression `SPEC.md` names as having already happened once).

**Paused/stale shown alongside severity, never instead of it**, and **the count omitted at
zero**, is `lib/client/header-status.ts`'s whole job — see §6 for its 7 dedicated mutations.
⚠ **One real defect this surfaced in my OWN test, not the implementation**: my first version of
`components/header.test.tsx`'s "paused with alarms" test asserted `toContain('paused')` and
`toContain('6 alarm')` separately. `data-mode="paused"` is *also* in the markup whenever
`mode === 'paused'`, independent of what `aggregateStatus` returns — so the loose assertion passed
even under a mutation that dropped the word "paused" from the visible status text entirely. The
harness caught this (mutation `10a-HS4` reddened `header-status.test.ts` but not `header.test.tsx`,
which should have been impossible if the test meant what its name said). Fixed by asserting the
literal joined string (`'paused · 6 alarms'`) instead of two independently-satisfiable substrings.
Recorded because it is exactly the "a test that names a property it does not check" failure mode
this project has found in every step — this time the harness itself is what caught it in review,
before this document was written, rather than after.

### 4.2 Sticky alarm banner (§6.4)

Renders nothing when nothing is alarm-level (`count === 0`) — no empty `role="alert"` landmark
sitting in the DOM. `lib/client/banner.ts`'s `bannerView` reads `state.displayed` (never
`conditionsFrom`), reuses `lib/conditions.ts`'s existing `bannerConditions` filter, and adds only
the ordering decision (§5).

> **CORRECTION (reconciliation, adversarial F10/F14/F11).** Three things here were wrong.
> **(1)** The reduction **dropped `stale` and `lastSeenMs`**, so a GPU confirmed at 82 °C whose
> `nvidia-smi` then died kept pinning the banner with a six-minute-old value presented exactly like
> a live one — against §6.5's normative *"its row and the banner name the age of the reading"* and
> its closing rule that *"a reading that stopped and a subject that left must never look alike"*.
> Both fields are now carried, and a stale item renders `last read 6:12 ago` (**spec question
> S-B**). **(2)** `count` was a third independent prop, so a caller could announce seven alarms
> while naming three; `AlarmBanner` now derives it from the list it renders. **(3)** Two doc
> comments claimed `since` carried a timezone (`'since 15:10:40 EDT'`); `formatTimeOfDay` carries
> none and never did — the docs were corrected, not the code.

### 4.3 Grid (§6.1)

Three `grid-template-areas` configurations, not four — ≥1600px and 1280–1599px share one, since
the only thing that changes at 1600px is a chart component inside a GPU card (10b's job), not the
grid's own layout. COOLING spans rows 2–3 in columns 1–2 at ≥1280px, matching the settled
correction. The 900–1279px and <900px configurations required two explicit decisions where §6.1
is silent — see §5.

### 4.4 The 10a/10b seam — what sits in the nine grid cells today

**Decision: `PanelShell` used directly, with a fixed placeholder body, never a bare stub and
never real telemetry.** `components/panel-placeholder.tsx`'s own doc comment carries the full
argument; the short version: a bare `<div>` would make 10b re-derive `PanelShell`'s head
convention nine times, and a *real* subtitle/chip would mean 10a guessing at each panel's own
domain logic (the GPU↔instance join, COOLING's channel-5 reasoning) rather than 10b deciding it.
So every slot today renders `<PanelPlaceholder title="…" />`: the real §6.2 title (casing
included — `GPU 0`/`GPU 1` keep their capitals, the rest are lower case per `PanelShell`'s own
documented reading of §6.2's self-contradictory prose), a literal placeholder subtitle
(`'assembled in step 10b'`, never mistakable for a reading), and `chip={null}` (§6.3's "no band"
state — `10a-PP1`'s mutation proves a `'normal'` default would slip past unnoticed if it were
ever written). Replacing one placeholder with a real panel component is a one-line swap in
`dashboard-shell.tsx`, not a rewire.

### 4.5 D6 — `use-telemetry.ts`, jsdom, and invariant 6

**jsdom was added** (`jsdom@30.0.1`, devDependency only). What it buys: `use-telemetry.ts`'s own
doc named the two things step 8 declined to test without it — "unmounting calls `stop()`" and,
implicitly, that the runtime is held once rather than rebuilt. Both are now asserted, plus a
matching pair of tests that need NO jsdom at all (`use-telemetry.ssr.test.tsx`, plain `node`
environment — `typeof window` is genuinely `undefined` there, and the hook correctly returns
`{ state: null, runtime: null }` without constructing anything). Splitting the two halves by
environment rather than forcing everything into one jsdom file was deliberate: only the
mount/unmount half genuinely needs a DOM.

⚠ **What jsdom costs step 11's image — VERIFIED, not asserted.** `next.config.mjs` already
requires `output: 'standalone'`. I ran `pnpm build` and inspected `.next/standalone` directly:

```
find .next/standalone -iname "*jsdom*"        →  no matches
find .next/standalone/node_modules/.pnpm -maxdepth 1 -type d   →  15 directories:
  next, react, react-dom, sharp (+ its platform binary and libvips), semver,
  detect-libc, client-only, and their transitive deps — no jsdom, no vitest, no test tooling
```

Next's own dependency tracer (`@vercel/nft`) excludes anything the traced server bundle does not
import, and nothing under `app/`, `lib/` (non-test), `components/` (non-test) or `proxy.ts`
imports `jsdom` — only test files do, and `next build` never touches them. The copied
`.next/standalone/package.json` still *lists* `jsdom` under `devDependencies` (an inert metadata
copy of the root manifest), but the package's files are not present in `node_modules` at all. So:
**jsdom does not reach the artifact step 11's own `next.config.mjs` comment says the container
ships.** This is the actual verification invariant 6 asks for, not a guess extrapolated from "it's
a devDependency, so it should be fine" — step 11 should re-check this once its Dockerfile exists
(a build-stage/runtime-stage split could still copy the wrong thing), but the trace-based
evidence today is as strong as it can be before that file exists.

### 4.6 A genuine finding this step's own harness produced, and a mutation I chose NOT to keep

While proving "the runtime instance is stable — built once, not rebuilt on every render," I
wrote the plausible wrong implementation (dropping the `held.current === null &&` half of the
guard in `use-telemetry.ts`, keeping only the `typeof window !== 'undefined'` check) and ran it
as a mutation. It does not fail cleanly. It feeds `useSyncExternalStore` a `getSnapshot` whose
return value has a new identity on every call — because a **fresh `TelemetryRuntime`** (fresh
`state` object) is constructed on every render — which trips React's own tearing-detection retry
mechanism. Measured: **506 seconds, then a `SIGABRT` from a JS heap out-of-memory**, not a red
test. That is worse than no mutation: `10a-build.md`'s own bar (and HANDOVER's "a mutation that
reddens probabilistically is worse than none") both point at "fails fast and deterministically" as
the requirement, and a multi-minute OOM crash is neither fast nor a clean signal. **I removed the
mutation and left the test it would have covered deliberately UNMARKED**, with the full account
written into both `use-telemetry.test.tsx` (beside the test) and `regressions.py` (beside where
the mutation would have gone), so nobody re-adds it as a "missing" mutation later without reading
why. The property itself is real and still tested — its actual violation is just caught by React
itself, more slowly and more destructively than this harness safely can.

---

## 5. Design decisions where the spec was silent (invariant 7)

1. **The banner's ordering when more than one condition collapses into it.** §6.4 says "collapse
   into one banner with a count" and nothing about which leads. Decided: order by `sinceMs`
   ascending (the longest-standing alarm leads), tie-broken by `id`. Reasoning and the rejected
   alternative (first-in-array, which `MOCK.html`'s own `renderBanner` uses but which is not a
   deterministic property of the data) are in `lib/client/banner.ts`'s doc comment.
2. **The exact header wording for a paused/stale dashboard with zero alarms.** §6.2 gives three
   literal strings (`● all healthy`, `❙❙ paused · 6 alarms`, `⊘ stale · 6 alarms`) and none for
   the paused/stale-and-healthy case. Decided: the same zero-omission rule applies uniformly —
   `❙❙ paused` and `⊘ stale` stand alone, never claiming `· 0 alarms`. `lib/client/header-status.ts`'s
   doc argues this is the conservative reading rather than an invention.
3. **The word "alarm(s)," never "warning."** §6.1's own ASCII sketch shows `● 1 warning` at the
   top of the file, which would imply a *second*, watch-level count nothing in `RuntimeState`
   carries. Read as the same kind of illustrative shorthand `MOCK.html` is elsewhere shown to be
   (§6.2's normative prose uses "alarms" in every one of its three literal examples), not as a
   second wording to support. Recorded so nobody "fixes" `header-status.ts` to match the sketch.
4. **900–1279px and <900px panel placement.** §6.1 describes the 900–1279px band loosely ("GPU
   cards stack side by side, the four small panels become 2×2, storage and safety stack below")
   and never mentions where COOLING, SERVING or SESSION EVENT LOG land in either narrower
   breakpoint, nor where SESSION EVENT LOG sits in the <900px priority list (six named stops for
   nine panels). Decided and written into `grid.module.css`'s own doc comment: COOLING stays
   prominent (full width, second after the GPUs, matching its rank in the <900px list) at
   900–1279px; SESSION EVENT LOG goes last at both breakpoints, being the one panel whose content
   (a scrolling log) is least useful for at-a-glance triage on a small screen.
5. **`unknownStanding` (D3/2.5c) — render in SAFETY, keep the field.** Not rendered by any code in
   10a (SAFETY's body is 10b's), but the choice itself is made rather than left for 10b to
   rediscover: keep `unknownStanding` on `RuntimeState` (removing it is a step-8 contract change,
   and D3 was scoped to step 10 to decide the *rendering*, not to re-litigate the field), and hand
   10b the seam — SAFETY should render each string in `state.unknownStanding` as its own row,
   worded as a configuration defect ("unknown `STANDING` entry: `<id>`"), **not** counted in §9's
   dot/count (O12: a reading with no §6.3 band is invisible to the dot) but visually distinct from
   a normal reading, since "silence is not acceptable for a mechanism whose whole job is
   suppressing alarms." No code changes this in 10a; this is the recorded decision 10b builds the
   SAFETY body against.
6. **The `PanelPlaceholder` decision itself** — §4.4 above and the component's own doc comment.
7. **The scope of `lib/client/header-status.ts`/`banner.ts`** — §3 above.
8. **SVG id ownership and chart sizing, concretely** — §2.4/§2.5 above.

**Left genuinely open, for 10b or later:**

- **S11/G5's panel half** (SCOPE §4.1) — untouched. It is specifically about what a PANEL BODY
  renders for an em dash with no `errors[]` entry; nothing in 10a renders a real panel body.
- **D1** (S40's third event-log feed) — not built. `state.events` already exists from step 8;
  nothing in 10a's assembly reads or renders the event log, since SESSION EVENT LOG's body is
  10b's.
- **Q2 F9's deferred half** (clamp-vs-drop rendering for an out-of-domain instant) — untouched;
  no chart is mounted yet to have this problem.

---

## 6. ⚠ Marks and their mutations

38 ⚠-marked tests across 9 new test files, all covered by the 32 mutations in
`pipeline/steps/10-panels-assembly/regressions.py` (`10a-` prefixed, per ANCHOR §9). One test
(§4.6) is deliberately left unmarked with its reasoning written down beside it, per the same
standard this project applies to `purity.test.ts`'s own "the guard is not vacuous" checks.

| Source | Mutations | What they prove |
|---|---|---|
| `lib/client/header-status.ts` | `10a-HS1`–`HS7` | §9's zero-omission rule in every mode; paused/stale never lose their mode word; the glyph names the mode, not the severity; `expired` never leaks a count |
| `lib/client/banner.ts` | `10a-BN1`–`BN4` | oldest-leads ordering; the banner-worthy filter is not bypassable; the shared `EMPTY_BANNER` identity; the count is not off-by-one |
| `components/header.tsx` | `10a-H1`–`H12` | every control's `onChange`/`onClick` is actually wired; the exhaustive cadence/window option lists; the visual separator before logout; **no IP, no kernel** (the exact regression `SPEC.md` names); a paused dashboard keeps its severity colour |
| `components/alarm-banner.tsx` | `10a-AB1`–`AB3` | pluralisation; the "rest" list actually renders; the empty-banner guard actually guards |
| `components/grid.tsx` | `10a-GR1` | each of the nine slots renders its OWN content, not a neighbour's (a copy-paste join bug) |
| `components/panel-placeholder.tsx` | `10a-PP1` | the placeholder chip never claims an unearned severity |
| `lib/client/use-telemetry.ts` | `10a-UT1`, `10a-UT3` | unmount calls `stop()`; the SSR guard is not droppable (§4.6 for the mutation NOT kept) |
| `app/use-now-tick.ts` | `10a-NT1`, `10a-NT2` | the tick's clock is re-read every interval, not captured once; unmount clears the timer |

---

## 7. ⚠ What this suite CANNOT prove — named plainly, not implied

> **CORRECTION (reconciliation).** This section was honest about CSS and **incomplete about
> everything else** — it did not name the largest hole in the step. The whole non-null branch of
> `app/dashboard-shell.tsx` was executed by nothing, so `mode`, `alarms`, every control callback,
> the banner mapping and `onLogout` could all be rewired freely with `pnpm verify` at exit 0 —
> including a build that can never say "paused" and reads `● all healthy` on six alarms, which is
> `PLAN.md`'s own green criterion for this step. `app/dashboard-shell.test.tsx` closes it.
> Two further items belong on this list and were not on it: `app/page.tsx` had **no test of any
> kind** (mutating it to `return null` shipped a blank dashboard), and `grid.module.css` had **no
> coverage of any kind** while `grid.test.tsx` asserted only `data-slot`, which no stylesheet
> reads — so rewiring COOLING into the log's grid area was 19/19 green.
>
> The sticky claim below is now actively wrong in a useful way: the header and the banner **were**
> both `position: sticky; top: 0` as siblings, which does not stack — the opaque higher-z header
> painted over the banner completely from the first scroll. One sticky band now wraps both.

**No test in this step asserts a stylesheet's content as evidence of behaviour**, and none of
`header.test.tsx`/`alarm-banner.test.tsx`/`grid.test.tsx`/`panel-placeholder.test.tsx` is named as
though it does. What is genuinely unverified by the automated suite, stated once here rather than
scattered:

- **§6.1's actual grid placement** — `grid-template-areas`, the three breakpoint configurations,
  COOLING's row span. `components/grid.test.tsx`'s own doc comment says this outright: its tests
  prove each named prop lands under the matching `data-slot`, never that the CSS paints it where
  §6.1 says to. `grid.module.css`'s correctness is argued by authorship against the ASCII layout
  and against the two recorded decisions in §5, not measured.
- **Sticky positioning** for the header and the banner (`position: sticky`), and the header's
  `data-severity`/`data-mode` colour mapping in `header.module.css`.
- **The responsive controls layout** (`flex-wrap` at narrow widths).

⚠ **A real browser was NOT opened during this build**, despite the handoff naming it as the
honest option for exactly this class of claim (following Q2-S2's precedent). This is a time-boxed
choice, not an oversight, and I am recording it rather than letting the suite's green imply more
than it does. What a follow-up check should do, concretely: load the dashboard at 1920×1080,
1280×900, 1100×700 and 800×900, and confirm — by eye — that COOLING spans the two rows §6.1
claims, that the 900px and 1280px breakpoints actually retarget at those widths and not some
nearby number, and that the header and banner stay pinned while the grid scrolls beneath them
below 1280px.

`components/styles.test.ts` (step 9's, unmodified, walks all of `components/` recursively) does
apply to every new `.module.css` file here and passes — but it only guards one specific class of
mistake (`flex-basis: 100%` outside a `flex-wrap: wrap` container), not general correctness.

---

## 8. Results

> **SUPERSEDED.** The numbers below were true when written (76 files / 2340 tests / 32 mutations).
> After the test phase and the reconciliation: **79 files · 2399 tests · 70 mutations · 86 ⚠ marks**,
> both `pnpm verify` and `regressions.py` at exit 0. See `10a-reconciliation.md` §1.

```
$ pnpm verify
 Test Files  76 passed (76)
      Tests  2340 passed (2340)
Type Errors  no errors
```

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 42 distinct failing tests across 32 mutations; 38 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 32 regressions failed their check, as they must.
[exit 0]
```

```
$ git status --short
 M app/page.tsx
 M package.json
 M pnpm-lock.yaml
?? app/dashboard-shell.tsx
?? app/use-now-tick.test.tsx
?? app/use-now-tick.ts
?? components/alarm-banner.module.css
?? components/alarm-banner.test.tsx
?? components/alarm-banner.tsx
?? components/grid.module.css
?? components/grid.test.tsx
?? components/grid.tsx
?? components/header.module.css
?? components/header.test.tsx
?? components/header.tsx
?? components/panel-placeholder.module.css
?? components/panel-placeholder.test.tsx
?? components/panel-placeholder.tsx
?? lib/client/banner.test.ts
?? lib/client/banner.ts
?? lib/client/header-status.test.ts
?? lib/client/header-status.ts
?? lib/client/use-telemetry.ssr.test.tsx
?? lib/client/use-telemetry.test.tsx
?? pipeline/handoffs/10a-shell.md
?? pipeline/steps/10-panels-assembly/10a-build.md
?? pipeline/steps/10-panels-assembly/regressions.py
```

No stranded mutation (verified after both harness runs — the first run's `10a-` prefix
double-check in `_assert_unique_ids()` also guards against an id created by a different step
leaking in here). Nothing committed, per the rules. `package.json`/`pnpm-lock.yaml` carry exactly
one new devDependency, `jsdom@30.0.1` — reasoned and verified in §4.5.
