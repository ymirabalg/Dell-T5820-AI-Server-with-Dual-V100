# Step 10a — the shell: ADVERSARIAL phase

Fresh agent, no memory of this project. Read `pipeline/handoffs/10a-adversarial.md`,
`10a-build.md`, `10a-test.md`, `SCOPE.md`, `SPEC.md` §6.1/§6.2/§6.4/§6.5/§9, `ANCHOR.md`
§4/§5/§8/§9 and `PLAN.md` before writing anything below.

**I fixed nothing, committed nothing, and edited neither `SPEC.md` nor `purity.test.ts`.** Every
experiment was reverted and the tree confirmed byte-identical to as-found (§Integrity at the end).

Each finding is marked **EXECUTED** (I ran it and report the observed output) or **REASONED**
(argued from the code, with the exact lines). Layout largely cannot be executed in jsdom, so the
CSS findings are reasoned by construction — but the two that *can* be executed, are.

---

## Summary — what actually matters

The parent's strongest lead was right, and it is worse than "the browser check is manual". There
are **two** unprotected layers under §6.1, not one, and the inner one is a plain TypeScript edit
that `pnpm verify` cannot see (F1). Beyond that, the single largest hole in 10a is not the CSS at
all: **`app/dashboard-shell.tsx`'s non-null branch has no test of any kind**, so the wiring that
`PLAN.md`'s own green criterion names — *"paused shows mode **and** alarm count"* — can be
hard-coded to `mode={'live'} alarms={0}` and `pnpm verify` still exits 0 (F7). Both halves of the
green criterion are, today, verified only by things that are not the green criterion.

| # | Finding | Kind |
|---|---|---|
| F1 | A slot's layout binding is `className`, and **nothing asserts it** — COOLING can be wired to the log's grid area, 19/19 green | EXECUTED |
| F2 | `grid.module.css`'s three area maps and both breakpoints have **zero** coverage of any kind | REASONED |
| F3 | `grid.test.tsx`'s describe names a property it does not check (`data-slot` is not what the CSS keys on) | EXECUTED |
| F4 | Nothing in the pipeline runs a browser — a *pipeline* finding, with a concrete proposal | REASONED |
| F5 | **`● all healthy` before the first poll**, beside a grey dot: the dot and the text are not one reduction (O2) | EXECUTED |
| F6 | `severity === null` has **no fixture in either direction**; `?? 'none'` → `?? 'normal'` ships green | EXECUTED |
| F7 | **The entire non-null branch of `dashboard-shell.tsx` is untested** — `mode`/`alarms`/pause/cadence all mutable to green | EXECUTED |
| F8 | D2: deleting `useNowTick` and using `Date.now()` at render ships green — the age freezes forever | EXECUTED |
| F9 | 2.5a's guard is unreachable in a browser; the real before-first-poll state renders five em dashes | EXECUTED |
| F10 | **A stale alarm holds the banner with no age and a stale value** — §6.5/§9 require the banner to name the age | REASONED |
| F11 | `sinceText` emits no timezone; two doc comments claim it does | EXECUTED |
| F12 | The banner's "since" carries no date — on a multi-day wall panel, Saturday 03:00 reads as today 03:00 | REASONED |
| F13 | **The sticky banner is fully occluded by the sticky header** the moment the page scrolls | REASONED |
| F14 | `AlarmBanner` trusts `count` independently of `lead`/`rest` | REASONED |
| F15 | **Logout may not log you out**: the `DELETE` can be aborted at unload and the httpOnly cookie is never cleared; the code comment claims the opposite | REASONED |
| F16 | `PanelProps` is prose; nothing 10b writes can be compiler-checked against it, and the build's "already wired end to end" claim is false | EXECUTED |
| F17 | A ⚠-marked test elsewhere in the suite is **wall-clock flaky** — reproduced; it corrupts any harness ledger | EXECUTED |
| F18 | `app/page.tsx` has no test; `app/layout.tsx` hard-codes ground colours that diverge from `tokens.css` | EXECUTED |

---

## F1 — the grid's layout binding is `className`, and no test asserts it (EXECUTED)

**This is the answer to the handoff's "what edit silently violates §6.1 and ships green?".** It is
not a CSS edit. It is a one-token TypeScript edit.

`components/grid.tsx` binds each cell's placement with `className={styles.<name>}` — that is what
carries `grid-area` — while `data-slot="<name>"` is a **test-only hook that no stylesheet reads**.
`components/grid.test.tsx` asserts, exclusively, that each marker sits inside the element with the
matching `data-slot`. The two are completely decoupled.

**Failure scenario, run:** change one line so COOLING is placed in the SESSION EVENT LOG's grid
area while keeping its `data-slot` correct —

```diff
- <div className={styles.cooling} data-slot="cooling">
+ <div className={styles.log} data-slot="cooling">
```

```
$ pnpm vitest run components/grid.test.tsx
 Test Files  1 passed (1)
      Tests  19 passed (19)
Type Errors  no errors
```

Green. At ≥1280px the browser now paints COOLING in the bottom-right half-width cell and leaves
COOLING's two-row column-1–2 block empty — the exact placement §6.1 calls settled-and-previously-
wrong, and the exact thing the test phase measured in Chrome. **Nothing in `pnpm verify`, nothing
in `regressions.py`, and nothing in `styles.test.ts` notices.** `10a-GR1` is the only grid
mutation and it swaps *content* between slots, which the `data-slot` regex does catch — so the
harness's one grid mutation is aimed at the one grid bug the tests already see.

**The honest proxy exists and is cheap.** Asserting the rendered element's `className` equals the
imported `styles.<name>` is *not* a source-text test dressed up as a layout test: CSS modules
resolve `styles.cooling` to a real generated identifier (`_cooling_e75739`), distinct from
`styles.log`, so the assertion says "the node holding the COOLING panel carries the class the
stylesheet gives `grid-area: cooling`". That is a true statement about the DOM, it closes exactly
this mutation, and it must be *named* as that claim and not as "COOLING spans rows 2–3".

## F2 — `grid.module.css` itself has zero coverage of any kind (REASONED)

The outer layer. Nothing anywhere reads `grid.module.css`'s text:

- `components/styles.test.ts` walks every `.css` under `components/` but checks exactly one rule
  (`flex-basis: 100%` outside a `flex-wrap: wrap` container). It is documented as such.
- jsdom injects no stylesheet, has no `matchMedia` and no layout engine — re-derived
  independently by the test phase, three ways, and I did not re-litigate it.
- `regressions.py` has no CSS mutation.

**Failure scenarios, none of which any check can see:**

| edit | what ships |
|---|---|
| `@media (min-width: 900px)` → `950px` | the 2-column band starts 50px late; a 920px display gets the 1-column stack. The test phase measured this boundary *at the pixel*; nothing re-measures it |
| delete one `'cooling cooling …'` row from the ≥1280px `grid-template-areas` | COOLING stops spanning rows 2–3 — the settled correction — and auto-placement restores the "column of dead ground" §6.1 says the span exists to remove |
| reorder the base (<900px) area list | §6.1's priority order (`GPUs → cooling → safety → serving → host → storage`) silently changes |
| rename `.storage` → `.storageAndNetwork` in the CSS without touching `grid.tsx` | `styles.storage` becomes `undefined`, the cell gets `class="undefined"`, and it falls out of the area map entirely — **and `renderToStaticMarkup` still emits a `data-slot="storage-and-network"` wrapper, so `grid.test.tsx` stays green** |

That last row is worth flagging on its own: a CSS-module miss degrades to `undefined`, not to a
compile error, and F1's `data-slot`-only assertions cannot see it either.

**Honest proxy:** parse the three `grid-template-areas` declarations and the two `min-width`
values out of the file and assert them against §6.1's matrix. This is a *source-text* test and
must be named as one — "the stylesheet declares §6.1's area map", never "the grid matches §6.1
placement". It would catch every row of the table above. It would not catch a browser that
refuses to honour the declaration, which is F4's job.

## F3 — a test that names a property it does not check (EXECUTED)

`components/grid.test.tsx`:

```ts
describe('⚠ each slot carries the data-slot the layout CSS keys on', () => {
```

**The layout CSS does not key on `data-slot`.** `grid.module.css` contains no attribute selector
at all; every placement rule is `.gpu0 { grid-area: gpu0 }` etc. `data-slot` exists solely so this
test can find the element. The describe asserts a relationship between the attribute and the
stylesheet that does not exist, and F1 is precisely the bug that relationship would have excluded.
This is the failure mode ANCHOR §5 says has appeared in every single step.

The fix is either to rename the describe to what it checks ("each slot's content lands under its
own marker attribute") or — better — to make the name true by adding F1's `className` assertion.

## F4 — nothing in the pipeline runs a browser (REASONED, *pipeline* finding)

The test phase's Chrome session is the only evidence for half of `PLAN.md`'s step-10 green
criterion, and it was a manual act. It is not in `pnpm verify`, not in `regressions.py`, and not
in the loop's phase table (`ANCHOR.md` §8) — so **no future phase is obliged to repeat it**, and
10b lands nine real panel bodies into these nine cells, 10c changes `--table-scroll-max` to
`max-height: 100%` (SCOPE 2.5f), and either can move a row height or a breakpoint with no signal.

F1 and F2 give an honest automated floor at two tiers (the class binding; the stylesheet's own
declarations). Neither is a substitute for paint. The remaining gap is real and belongs to the
pipeline, not to this code:

**Proposal for reconcile to adjudicate** — record a browser step against **10c**, not 10a: 10c is
already the loop that owns the cross-harness runner (F4/Q1) and the `max-height` change, and it is
the first point at which real panel bodies exist to measure. Its shape is the test phase's own
seven measurements re-run headlessly (`getBoundingClientRect` at 820/899/900/1150/1279/1280/1920,
asserting COOLING's `y`/`height`/`x` span and the <900 `y` order). Doing it in 10a would measure
placeholders.

---

## F5 — `● all healthy` before a single reading has arrived, beside a grey dot (EXECUTED)

`lib/client/header-status.ts`'s `aggregateStatus(mode, alarms)` **never receives `severity`**. The
header's dot colour comes from `data-severity={severity ?? 'none'}`; the text beside it comes from
a reduction over `alarms` alone. They are two reductions, and they disagree in exactly the state
§9 wrote its rule for.

**Failure scenario, run.** `TelemetryRuntime`'s initial state is `mode: 'live'`, `displayed: []`,
`severity: null`, `alarms: 0` (`lib/client/runtime.ts:179–190`), so this is every page load
between hydration and the first poll landing — and every poll that produces no banded reading at
all. Rendering `Header` with exactly the props `dashboard-shell.tsx` computes in that state:

```
data-mode="live" data-severity="none">●</span>
<span class="_statusText_…">all healthy</span>
<span class="_time_…">— — · — ago</span>
```

The dot is correctly grey (`--ink-muted`, `header.module.css`'s `[data-severity='none']`). The
words beside it say **all healthy**. §9, verbatim: *"`null` when there are no conditions at all —
**not `'normal'`, which would claim health for a poll that produced nothing**"*, and *"Reducing
over `displaySeverity` is what keeps the dot, the count and the banner from ever disagreeing."*
Here the dot says "no band" and the text says "healthy", on the same line, three pixels apart.

This is HANDOVER's **O2** ("the dot and the alarm count are ONE reduction") violated at the seam:
`aggregateStatus`'s signature makes the violation structural — it cannot honour `severity === null`
because it is never told. `lib/client/header-status.test.ts` is thorough about every *other* axis
and has no case for it, because the function has no parameter for it.

The right wording is a spec question (invariant 7 — §6.2 gives no literal for "no band yet"), but
the *defect* is not: the text must not say "all healthy" while the dot says "no band". `● —` or
`● no readings yet` are candidates; picking one is the owner's.

## F6 — `severity === null` is a boundary guard with a fixture on one side only (EXECUTED)

`HeaderProps.severity` is `Severity | null` and its own doc says `null` is *"rendered as the
chip's own 'no band' treatment, **never green**"*. Every fixture in `components/header.test.tsx`
passes a non-null severity (`BASE` is `'normal'`; two tests pass `'alarm'`). Nothing passes `null`.

**Failure scenario, run:**

```diff
- data-severity={severity ?? 'none'}
+ data-severity={severity ?? 'normal'}
```

```
$ pnpm vitest run components/header.test.tsx
 Test Files  1 passed (1)
      Tests  17 passed (17)
Type Errors  no errors
```

Green. The dot is now `--status-good` — **green** — before any reading has confirmed a band, which
is the one thing the prop's doc forbids in as many words. `10a-H12` mutates this same expression
but only its `mode` interaction, so the null branch has neither a fixture nor a mutation.

ANCHOR §5: *"Every boundary guard needs a fixture on both sides. Three steps shipped a guard tested
in one direction only."* This is the fourth.

## F7 — the whole non-null branch of `dashboard-shell.tsx` is untested, and it holds the green criterion (EXECUTED)

`app/dashboard-shell.ssr.test.tsx` covers **only** the server render, where the guard returns
`ConnectingShell` before any wiring executes. Every prop the shell computes and threads —
`mode`, `alarms`, `severity`, `ageText`, `paused`, all five callbacks, the whole
`bannerView`→`toBannerItem` mapping — is executed by nothing. The test phase named this as an open
gap; it is worse than "a gap", because `PLAN.md`'s green criterion lives inside it.

**Failure scenario, run.** Four simultaneous mutations, each a plausible wrong edit:

```diff
-        mode={state.mode}
+        mode={'live'}
-        alarms={state.alarms}
+        alarms={0}
-        onPauseResume={() => (state.paused ? runtime.resume() : runtime.pause())}
+        onPauseResume={() => (state.paused ? runtime.pause() : runtime.resume())}
-        onSetCadence={(seconds) => runtime.setCadence(seconds)}
+        onSetCadence={() => undefined}
```

```
$ pnpm verify
 Test Files  77 passed (77)
      Tests  2343 passed (2343)
Type Errors  no errors
exit=0
```

With that diff shipped: **the header can never say "paused" or "stale"** (mode is a constant),
**the alarm count is permanently zero** so a box on six alarms reads `● all healthy`, the
pause button toggles the wrong way and can never be un-stuck, and the cadence selector is dead.
`PLAN.md`: step 10 is green when *"grid matches §6.1 placement; paused shows mode **and** alarm
count"* — and `pnpm verify` exits 0 on a build where neither holds.

`lib/client/header-status.ts` and `components/header.tsx` are each tested well **in isolation**;
what is untested is that the two are ever handed the real values. Q1's own lesson applies: a
mutation harness over the parts does not cover the join.

The build's stated reason for not covering it (needs jsdom + fake timers + a mocked `fetch`) is
overstated for the cheapest version of the fix: `DashboardShell` is the only thing that needs the
runtime — a test can render `<Header>` with props derived from a hand-built `RuntimeState` and
still not close the join. The join specifically needs `dashboard-shell.tsx` rendered with a
non-null state, which needs `useTelemetry` to return one. Whether that is worth jsdom+fetch is
reconcile's call; **that it is currently uncovered, and that it is the green criterion, is not a
judgment call.**

## F8 — D2's tick can be deleted outright and the suite stays green (EXECUTED)

The handoff asks: *"Would any test notice if `useNowTick` were rewired to the store? Would any
notice if its interval were 60 s instead of 1 s?"* The answer is stronger than "no": nothing
notices if the hook is **removed entirely**.

**Failure scenario, run.** Delete the import, delete `AGE_TICK_MS`, and replace the call with a
render-time clock read — the single most plausible "simplification" anyone would make:

```diff
-import { useNowTick } from './use-now-tick';
-const AGE_TICK_MS = 1000;
-  const nowMs = useNowTick(AGE_TICK_MS);
+  const nowMs = Date.now();
```

```
$ pnpm vitest run
      Tests  2343 passed (2343)
Type Errors  no errors
```

Green, and `tsc` clean. The behaviour: `nowMs` is now read only when React re-renders, which after
this change happens only when `useTelemetry`'s store changes — **exactly the store-driven tick
SCOPE §2.5b calls "worse than never"**, arrived at by deletion rather than by rewiring. The age
indicator looks perfect at a 1 s cadence and freezes solid the moment polling stops, which is the
one failure it exists to catch.

`app/use-now-tick.test.tsx` is a good test of the hook and covers `10a-NT1`/`NT2`. It cannot cover
this, because this bug is in the *caller*. `AGE_TICK_MS = 1000` likewise has no coverage —
changing it to 60 s or 24 h reddens nothing (the hook's test passes its own literal `1000`).

Same family as F7: the parts are tested, the join is not.

## F9 — 2.5a's guard never fires in a browser, and the state it exists for renders five em dashes (EXECUTED)

SCOPE §2.5a: *"`state === null` is **before the first poll**, not missing data … **Must not render
`—`**."*

`useTelemetry` returns `{state: null, runtime: null}` **only when `window` is undefined**
(`lib/client/use-telemetry.ts`) — the test phase confirmed empirically that the live dashboard never
showed "connecting…", not for one frame. So `ConnectingShell` is a server-render artefact. The
state SCOPE 2.5a is actually about — *the browser, after hydration, before the first poll lands* —
has `state !== null` and falls straight through the guard.

**What it renders, run** (`Header` with exactly `dashboard-shell.tsx`'s expressions on the initial
`RuntimeState`): **5 em dashes.** Hostname `—`, uptime `—`, and the status line
`— — · — ago` (snapshot time, zone abbreviation, age).

Two things for reconcile, and they are different questions:

1. **Is this a violation or is it invariant 1 working correctly?** Every one of those fields *is*
   `null`, and §6.6's law says `null` renders `—`. The build reads it that way (build §2.1). SCOPE
   §2.5a reads the opposite way. **The spec is silent on which reading governs the browser's
   pre-first-poll frame, and invariant 7 says record it rather than let two documents disagree.**
2. Regardless of (1): `— — · — ago` renders an em dash with a *unit word attached to it*, which no
   other formatter output in this project does. §6.6's law is about a reading rendering as `—`, not
   about `— ago`. Worth a wording call at the same time.

Note this also means `10a-DS1` — the only mutation on `dashboard-shell.tsx` — proves the guard
against a condition the browser never reaches. That is not wrong (the SSR frame is real HTML the
user is served), but it should not be read as covering 2.5a's stated purpose.

---

## F10 — a STALE alarm pins the banner with a stale value and no age (REASONED)

§6.5, for a condition whose subject stopped being reported: *"**Stale.** It keeps its last confirmed
band and its 'since', still counts (§9), and **its row and the banner name the age of the
reading**."* §9 repeats it: *"shows the age of the reading behind it."* `lib/conditions.ts`'s own
doc on `DisplayedCondition.lastSeenMs` points the requirement directly at this consumer:

```ts
  /**
   * The browser wall clock at which a poll last carried this condition.
   *
   * §6.5 requires a stale condition's "row and the banner to name the age of the reading" …
   */
  readonly lastSeenMs: number;
```

**Neither `lib/client/banner.ts`'s `BannerCondition` nor `components/alarm-banner.tsx`'s
`AlarmBannerItem` carries `stale` or `lastSeenMs`.** Both drop them in the `toBannerCondition` /
`toBannerItem` maps.

A stale condition still reaches the banner — `observePoll` sets `banner: displaySeverity ===
'alarm'` (`lib/conditions.ts:717`) and staleness "never raises a severity and never lowers one", so
a stale alarm keeps `banner: true`.

**Concrete failure scenario.** `gpu_temp:0` is confirmed at `alarm`, value `82 °C`, since 14:02:10.
`nvidia-smi` then dies (`gpus: null` — §6.5's headline degraded state, and the archetype this
dashboard exists for). Six minutes later the banner still reads:

```
✕  1 active alarm   GPU 0 temperature 82 °C   since 14:02:10
```

Nothing on that banner says the 82 °C is six minutes old and that nobody has been able to look
since. §6.5's own closing rule — *"A reading that stopped and a subject that left must never look
alike … **We stopped being able to look** is not **it got better**"* — is about the aggregate, but
its sibling rule here is the one broken: a stale reading in the banner is presented identically to
a live one. The header does *not* rescue this: `mode` goes `stale` only when the **poll** fails
(`modeOf`/`isStale`), and in this scenario polls keep succeeding — the GPU collection is what
stopped.

**Fixture symmetry.** `lib/client/banner.test.ts`'s `condition()` factory hard-codes
`stale: false, lastSeenMs: 1_000` and **no test overrides either**. This is the handoff's §3.4
warning landing exactly where it said it would: standing/stale behaviour exists only as fixtures,
and the untested branch is the one nobody wrote a fixture for.

I checked the two adjacent §6.4 obligations and they are **sound**, so this is the only one:
`bannerConditions` is the same filter `alarmCount` uses (O2 satisfied structurally — the header's
count and the banner's count cannot disagree); a suppressed standing condition has
`banner: false` and `bannerView` trusts the flag rather than re-deriving suppression, with a fixture
proving it; `sinceMs` is documented and consumed as the confirmed band's first observation (O4).

## F11 — `sinceText` emits no timezone, and two doc comments say it does (EXECUTED)

`app/dashboard-shell.tsx`:

```ts
/** A wall-clock ms → `'since HH:MM:SS ZZZ'`, for §6.4's banner. … */
const sinceText = (ms: number): string => `since ${formatTimeOfDay(isoTimestamp(new Date(ms).toISOString()))}`;
```

and `components/alarm-banner.tsx`:

```ts
  /** Pre-formatted — `'since 15:10:40 EDT'`. */
  readonly since: string;
```

`formatTimeOfDay`'s options carry no `timeZoneName` (`lib/format.ts`'s `TIME_OF_DAY_OPTIONS`), and
`lib/format.test.ts:924` asserts `toMatch(/^\d{2}:\d{2}:\d{2}$/)`. Executed:

```
SINCE_TEXT "since 15:10:40"
```

The zone abbreviation is a **separate** formatter (`formatZoneAbbreviation`) and is not called.
`alarm-banner.test.tsx`'s own fixture says `since: 'since 15:10:40'` — so the tests agree with the
code and only the two docs are wrong.

Low severity as a rendering call (§6.2 puts the zone "once beside the clock", in the header), but
it is a documented contract that the code does not honour, and it is what a reconcile or 10b agent
would build against. Either the doc is corrected or the zone is added — the choice is a
one-line decision, but it must be made rather than left contradictory in two files.

## F12 — the banner's "since" has no date; the deployment is a panel left open for days (REASONED)

`since 03:00:14` is a time of day with no date and no elapsed measure. §6.4's justifying example
stays inside one day (*"a 03:00 excursion is still on screen at 09:00"*) — but decision 7 makes
this a **wall panel**, and §6.4 also says a session's event log "is lost on reload, by design",
which is what makes a multi-day page load the expected case rather than the exception.

**Failure scenario.** The panel has been open since Friday. A `disk_free:home` alarm confirmed
Saturday 03:00. It is now Monday 09:00. The banner reads `since 03:00:14` — indistinguishable from
an alarm that started six hours ago, and the operator has no way to tell a two-day-old problem
from this morning's. `sinceMs` carries the full instant; only the formatting throws the date away.

§6.4 is silent on the >24 h case, so **invariant 7 applies: record, do not invent.** Candidate
resolutions for the owner: an elapsed form (`for 2 d 06:00`, which `formatUptime`/`formatAge`
already have vocabulary for), or a date prefix when the instant is not today. Note the first is
also what makes F10's staleness expressible without a new formatter.

## F13 — the sticky banner is fully occluded by the sticky header (REASONED, high confidence)

```css
/* header.module.css */          /* alarm-banner.module.css */
.header { position: sticky;      .banner { position: sticky;
          top: 0;                          top: 0;
          z-index: 10;                     z-index: 9;
          background: var(--surface-1); }   background: color-mix(…); }
```

`Header` and `AlarmBanner` are rendered as **siblings** (`dashboard-shell.tsx` returns a fragment
of `<Header/>`, `<AlarmBanner/>`, `<Grid/>`), both direct children of `<body>`, and `<body>`'s box
spans the whole document — so both stick for the entire scroll. Both pin to **`top: 0`**, i.e. the
same rectangle of the viewport. The header is opaque and has the higher `z-index`. Therefore, at
any scroll offset past the banner's natural position, **the banner is painted entirely behind the
header and is invisible.**

The banner's own doc comment states the wrong mechanism: *"this sits at the same stacking context
immediately below it in document order, so no z-index is needed here for correct paint order"* —
document order governs paint order for *overlapping* boxes, which is precisely the problem, not
the solution. The correct pattern is `top: <header height>` on the second sticky element, or one
sticky wrapper containing both.

**Failure scenario.** Any width below 1280px (§6.1: *"Scrolling begins here and that is
accepted"*), any alarm-level condition standing, scroll down one panel. The header stays pinned;
§6.4's *"pins a banner to the top … It stays until the condition clears"* silently stops holding.
At scroll 0 — every screenshot, and every state the test phase's browser session could reach — it
looks perfect.

**Why the manual browser pass could not catch it, and this is the point:** `10a-test.md` §1.2 says
so itself — *"I could not exercise the banner's sticky behaviour: this dev session has no real
hardware behind it, so every condition is healthy and the banner never mounts."* The one element
whose stickiness §6.4 makes normative is the one element the browser check could not see. That
strengthens F4: a browser step that cannot inject a fixture state is a browser step that will keep
missing exactly this class of bug.

I did not run a browser to confirm (no alarm subject exists, per SCOPE §2.3), so this is reasoned
from the CSS. Confirming it takes two minutes with a hand-built fixture and is worth doing before
adjudicating.

## F14 — `AlarmBanner` trusts `count` independently of `lead`/`rest` (REASONED)

`AlarmBannerProps` carries `count`, `lead` and `rest` as three independent inputs; the component
renders `{count} active alarm{s}` from `count` and the items from `lead`/`rest`, and only guards
`count === 0 || lead === null`. `bannerView` always produces `count === 1 + rest.length`, so today
they agree — but nothing enforces it at the seam, and `alarm-banner.test.tsx` passes `count={3}`
with a lead plus two rest items without ever asserting the relation.

**Failure scenario:** a future caller (10b's SAFETY panel wanting a per-panel banner, or a
reconcile that filters `rest` for length) passes `count={7}` with one lead and two rest items. The
banner announces *7 active alarms* and names three. §6.4's whole point is that the count is the
honest total; a count that can drift from the list is a lying banner with no guard.

Cheap and honest fix if reconcile accepts it: derive the count (`1 + rest.length`) and drop the
prop, or assert the relation. Not urgent — filed because it is a contract with no enforcement, in
a component whose entire job is a count.

---

## F15 — logout may not log you out, and the comment explaining why it is safe is false (REASONED)

```ts
const onLogout = (): void => {
  void fetch(SESSION_PATH, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {
    // Best-effort. A session that fails to delete server-side is still abandoned client-side
    // by the navigation below, and the next authenticated request elsewhere would 401 anyway.
  });
  window.location.assign(LOGIN_PATH);
};
```

Three problems, compounding:

1. **The `fetch` has no `keepalive: true`** and the navigation is started synchronously on the next
   line. A non-keepalive fetch is terminated when its document unloads. So the `DELETE` is racing
   the navigation and may never reach the server.
2. **The comment's premise is wrong.** Nothing is "abandoned client-side": the session cookie is
   `httpOnly` (§5), so the only thing that can clear it is the server's `Set-Cookie` on the
   `DELETE` response (`lib/auth/handler.ts` → `clearedCookieHeader()`). If the request never lands,
   the browser keeps a fully valid cookie. And `proxy.ts:111` lets `/login` through unconditionally,
   so the user sees a login screen while still holding a live session — the appearance of logout
   with none of it.
3. **The revocation never happens either.** §5: *"`DELETE /api/session` invalidates the session on
   the server, not only in the browser … logout records the session id in memory and every `/api/*`
   check consults it."* A dropped `DELETE` leaves the cookie live for its full 30 days, and §5's own
   next paragraph notes there is **no other way to invalidate a session you do not hold** short of
   rotating `SESSION_SECRET` by hand.

**Failure scenario.** Operator clicks `⏻ logout` on the wall panel and walks away. The browser
tears the document down before the `DELETE` flushes. The login screen is showing, so the machine
looks locked. Anyone who then presses Back, or types the bare host, is on the live dashboard —
authenticated, with a cookie good for a month, and no in-product way to revoke it.

Also untested: `onLogout` is inside `dashboard-shell.tsx`'s non-null branch (F7), so nothing
exercises it at all.

Two standard remedies, both one line: `keepalive: true` on the fetch, or `await` the response
before navigating (with a timeout, since §5.2's "could not reach the dashboard" tone rules already
exist for the login side). Which one is reconcile's call; that the current form can silently fail
open is not.

## F16 — `PanelProps` is prose, and the build's "already wired end to end" is false (EXECUTED)

The test phase flagged the missing type; I checked what the compiler actually permits, which is the
half that was left open.

- There is **no `PanelProps` type anywhere in the repo** (`grep -rn "PanelProps" --include=*.ts*`
  returns only `PanelPlaceholderProps`).
- `PanelPlaceholder`'s real props are `{ title: string }`. It takes no `state`, no `nowMs`, no id
  discriminator.
- `GridProps`'s nine slots are `ReactNode`, so **any** element satisfies them. Nothing in the type
  system requires a panel to accept `state`/`nowMs`, and nothing names the SVG-id discriminator.

**What the compiler permits that the prose forbids:** nine panels each choosing a different name
and shape — `<GpuPanel state nowMs panelId>`, `<CpuPanel snapshot now idPrefix>`,
`<CoolingPanel state nowMs slot>` — all nine typecheck, all nine mount, and §2.4's "the grid slot's
own name" convention holds in none of them. The collision L4 exists to prevent (two `<GpuPanel>`
instances minting the same SVG id) is invisible to `tsc` and would surface as a chart rendering
with the wrong gradient/clip-path, which is exactly the kind of bug that looks like a styling
accident.

**And the build's own claim overstates the code**, which is what makes this a code gap rather than
a documentation one. `panel-placeholder.tsx`'s doc:

> What this buys 10b: the grid slot, the panel-head chrome, and **the exact prop shape
> (`RuntimeState`, `nowMs`) are already wired end to end from the telemetry hook down.**

They are not wired at all. `state` and `nowMs` are local `const`s in `dashboard-shell.tsx` that are
never passed to any slot; F7's mutation shows the shell can be rewired freely without any test
noticing. The "one-line swap" promised to 10b is a one-line swap **plus** inventing a prop name
nine times.

Reconcile's choice, and it should be explicit rather than implied: either export a real
`PanelProps` (and thread `panelId` through `PanelPlaceholder` so the convention has a
compiler-checked precedent), or write down plainly that 10b picks the names — but the current doc
says a third thing that is not true.

---

## F17 — a ⚠-marked test elsewhere in the suite is wall-clock flaky (EXECUTED)

Not 10a's code, but it fired during a 10a-scoped `pnpm verify` and it undermines every harness in
the project, including this one.

`lib/collectors/serving.test.ts:592` — `⚠ a slow discovery cannot band an alarm on a healthy
instance` — uses **real wall-clock timing**: a `setTimeout(95)` inside `discoveryTimeoutMs: 100`,
plus 20 ms HTTP fakes. Under CPU contention the 95 ms sleep overruns the 100 ms budget and the
collector legitimately reports the degraded path.

**Observed and reproduced:**

```
$ pnpm verify                        # first observation, unloaded machine
 Test Files  1 failed | 76 passed (77)
      Tests  1 failed | 2342 passed (2343)

$ (20 CPU hogs on a 10-core box) ; pnpm vitest run   ×6
 FAIL  lib/collectors/serving.test.ts > … > ⚠ a slow discovery cannot band an alarm on a healthy instance
 AssertionError: expected [ null, null ] to deeply equal [ 'ok', 'ok' ]
   at lib/collectors/serving.test.ts:619:43
```

2 failures in those 6 runs; 0 in 10 unloaded runs; 1 in the first `pnpm verify`. So it is
load-dependent, not deterministic.

**Why it matters here specifically.** ANCHOR §5: *"A mutation that reddens probabilistically is
worse than none — the ledger cannot tell it from a sound one."* The mirror case is a **test** that
reddens probabilistically, and it is worse: `regressions.py` unions every red test name across all
mutations into `covered`, then checks every ⚠ test appears there. A contention-driven red on this
test during any mutation run credits it as covered by a mutation that never touched it — and
because it *is* ⚠-marked, that credit is exactly what the ledger is checking. It also means
`pnpm verify`'s green, the project's only definition of green, is not deterministic, and a phase
that hits the flake will spend its budget hunting a bug it did not cause.

10a raised the file count 76→77 and added four jsdom environments, which increases per-run worker
contention — plausibly making an existing latent flake more likely rather than creating it.

Fix belongs to whoever owns step 5's harness (10c is already the loop for cross-harness work): the
test needs an injected clock rather than `setTimeout`, or a margin large enough to hold under load.

**Operational note, unrelated to the tree:** while checking for stray processes I found a live
`until … sleep 5; done` wait-loop from a *different* session
(`…/c3743f5a-…/tasks/bpwiyo9lw.output`) still spinning — the exact ANCHOR §9 pattern that cost five
hours. It is not mine and I did not touch it, but it is burning a core and is a plausible
contributor to the timing above. The parent may want to kill it.

## F18 — `app/page.tsx` has no test; `app/layout.tsx` is still step 1's placeholder (EXECUTED)

Two small ones, both in `app/`, both untouched by 10a's harness.

**`app/page.tsx` is untested.** `grep` over every `.test.ts(x)` finds an import of
`app/login/page.tsx` and none of `app/page.tsx`. Mutating it to `return null` reddens nothing and
ships a blank dashboard. It is four lines, but it is the entry point, and `10a-DS1` proves the
shell's guard through a direct import rather than through the page.

**`app/layout.tsx` hard-codes ground colours that diverge from the token palette:**

```tsx
<body style={{ margin: 0, background: '#0b0d10', color: '#c8cdd4' }}>
```

against `components/tokens.css`'s `--surface-0: #0d0d0d` and `--ink-secondary: #c3c2b7`. Different
values — the body is blue-tinted, the tokens are neutral — so the ground behind the grid's
`0.75rem` gap and padding is a colour no panel uses, and a future change to `--surface-0` will not
follow. `ConnectingShell` in `dashboard-shell.tsx` likewise inlines `#7c848e` and its own font
stack rather than `--ink-muted`/`--font-mono`, and it is the *only* thing a user sees during the
server-rendered frame.

The file's own doc still reads *"Placeholder shell. The real chrome — header, grid, panels — is
steps 9 and 10."* 10a is that step; reconciling the layout with the token palette was nobody's
explicit deliverable and so did not happen. Low severity, but §9's *"Theme: single dark theme,
background painted explicitly"* now has two sources of truth for the same ground.

---

## What I attacked and could NOT break

Recorded so reconcile does not re-spend budget here.

1. **`lib/client/header-status.ts` itself.** Seven mutations, an exhaustive `Record<RuntimeMode,…>`
   that makes a fifth mode a compile error, and a test file where every case is `toBe` on the exact
   literal. I tried to find a mode/count combination the tests miss: `live/0`, `live/1`, `live/6`,
   `paused/0`, `paused/1`, `paused/6`, `stale/0`, `stale/6`, `expired/6` are all covered, the
   glyph is asserted per mode at both `0` and `6`, and `not.toContain('0')` guards the
   zero-omission rule from the other side. The zero-omission rule and the mode-alongside-severity
   rule are genuinely solid **as a function of `(mode, alarms)`**. F5 is not a defect in this file;
   it is a defect in the file's *signature*.
2. **`bannerView`'s ordering and filter.** Oldest-leads, the `id` tie-break, the watch exclusion,
   the shared `EMPTY_BANNER` identity and the off-by-one are each covered by a mutation and by a
   fixture that is not a restatement of the implementation. The mixed watch+alarm case is present.
   I could not construct an input where `bannerView` disagrees with `alarmCount` — they are built
   on the same `bannerConditions` export, which is O2 satisfied by construction and the right way
   to do it. The only hole is the `stale` axis (F10).
3. **The `useSyncExternalStore` mutation — I concur with both earlier phases, with a sharper
   reason, and I deliberately did not re-run it.** The handoff asks whether a *different* mutation
   could redden the same property cleanly. I believe the answer is **no, for this code as
   written**, and the argument is structural rather than empirical: the test observes "built once"
   through `start()`'s call count; any mutation that rebuilds the runtime necessarily gives
   `getSnapshot` (which *is* `runtime.getState`) a new returned-object identity every render, which
   is what trips React's `forceStoreRerender` loop. The pathology and the violation are the same
   event. The only escape — also neutralising the effect so each loop iteration is cheap — makes
   `start()` uncallable and therefore reddens the test **for the wrong reason**, which the ledger
   cannot distinguish and which is the failure mode the ⚠ system exists to prevent. So the honest
   statement stands, and the test phase's phrasing is the right one: *"no mutation of this exact
   code, tested this way, is safe to attempt twice."* Changing that needs the refactor
   `use-telemetry.ts`'s own doc argues against, and that is a decision, not an oversight. I did not
   re-trigger the 506 s/OOM run; three phases declining to reproduce a measured catastrophic
   failure is the right call, not a gap.
4. **`purity.test.ts` and the hook boundary.** The guard matches `\buse(?:[A-Z]\w*)?\s*\(` over
   every non-test `.tsx` under `components/`, recursively, so `components/panels/` is covered the
   moment it exists. I looked for a way to smuggle state into `components/` past it — a hook
   aliased through a non-`use` name, a hook called via a member expression, a `.ts` file re-exported
   into a `.tsx` — and every route that actually works still leaves a `use…(` call site in a
   `components/**.tsx` file, which the pattern catches. `components/` really is hook-free and the
   boundary really is enforced.
5. **The `@vitest-environment` docblock trap.** Re-grepped: three files contain the string, all
   three legitimately, and the two that need it carry a real pragma. No fourth file at risk.
6. **jsdom's blast radius.** `package.json`'s runtime `dependencies` are exactly
   `next`/`react`/`react-dom`; `jsdom@30.0.1` is the only added devDependency. I did not re-run
   `pnpm build` (the parent verified the standalone trace), and found no import of `jsdom` from any
   non-test file.
7. **The `⟳ refresh` / `paused · 6 alarms` inert-assertion family.** I re-checked every
   `toContain(...)` in 10a's ten test files against the rendered markup for a literal that is also
   satisfied by an unrelated attribute or label. `'logout'`, `'pause'`, `'resume'`, `'all healthy'`,
   `'stale · 6 alarms'`, `'3 active alarms'`, `'assembled in step 10b'`, `'connecting'` and
   `'>—<'` are each unique to their own control in the emitted HTML. The test phase's sweep was
   correct; I found no third instance.
8. **`sinceText`'s robustness.** `new Date(ms).toISOString()` throws on a non-finite or
   out-of-range `ms`. I traced `sinceMs` back to `env.now()` → `Date.now()` in `runtime.ts`; it is
   always finite and always in range. Not a real path — recorded so nobody re-derives it.
9. **The mutation-count grep discrepancy.** The test phase's explanation (`("10a-` also matches the
   literal inside `startswith("10a-")` in `_assert_unique_ids`) is correct — I re-read the guard.
   `len(REGRESSIONS)` is the number, and it is 34.
10. **§6.1's measured placement itself.** I did not re-open a browser and I have no evidence
    against the test phase's seven measurements. F1–F4 are about what protects them going forward,
    not about whether they were right.

---

## Integrity — the tree is exactly as I found it

```
$ diff /tmp/grid.tsx.bak components/grid.tsx        → grid OK
$ diff /tmp/header.tsx.bak components/header.tsx    → header OK
$ diff /tmp/ds.bak  app/dashboard-shell.tsx         → OK
$ diff /tmp/ds2.bak app/dashboard-shell.tsx         → OK
$ git status --short | wc -l                        → 31   (identical to as-found)
$ git diff --stat                                   → app/page.tsx, package.json, pnpm-lock.yaml only
$ ls -a | grep '^\.env'                             → nothing
$ pgrep -fl "next dev"                              → nothing
```

Every experiment was a backup-mutate-run-restore cycle on one file at a time. The one throwaway
test file I created (`components/zz-adv-probe.test.tsx`, to print what the header renders before
the first poll) was deleted; it appears in no listing above. No dev server was started, no `.env`
was written, no secret was generated. `purity.test.ts` and `SPEC.md` are untouched.
`pnpm verify` was never run concurrently with a harness — **I did not run `regressions.py` at
all**, so nothing I did can have stranded a mutation from it. No `pgrep` wait loop was used;
every command was plain and sequential.

Final state, on the restored tree:

```
$ pnpm verify
 Test Files  77 passed (77)
      Tests  2343 passed (2343)
Type Errors  no errors
```

(subject to F17's flake, which reproduces only under heavy CPU contention).
