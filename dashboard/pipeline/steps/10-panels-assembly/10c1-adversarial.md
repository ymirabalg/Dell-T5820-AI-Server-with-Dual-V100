# 10c1-adversarial — the composed render, attacked

**Run 2026-09-08.** Fresh agent, ADVERSARIAL phase of 10c1. Fixed nothing, committed nothing,
edited no `SPEC.md`, weakened no `purity.test.ts`. Every experiment was reverted and the tree
was confirmed byte-identical to the state I found it in (§ *Tree state*, last).

**Headline: four wrong edits applied at once left `pnpm verify` at exit 0, 94 files / 2617
tests** — the same shape as 10a-F7/F8, in the same file, one loop later. Three of the four are
about the second GPU; the fourth defeats the escape hatch's production gate and I proved it
survives into a real `pnpm build` bundle.

**Second headline: the test phase's central CSS claim is false.** `.module.css` imports do not
resolve to `{}`. They resolve to a **Proxy** whose property access returns a real per-file
hashed class name. Two live guards that the claim would make vacuous are in fact load-bearing
— and would *fail* if the claim were true, which is how a green suite refutes it.

Findings are numbered `10c1-A*`, each marked **EXECUTED** or **REASONED**, each with a concrete
failure scenario. Nothing here is fixed.

---

## The one experiment that carries three findings

Four edits applied **simultaneously** to the tree as the test phase left it:

| # | file | edit |
|---|---|---|
| 1 | `components/panels/gpu-panel.tsx` | `servingFor`: `serving.find(s => s.instance === index)` → `serving[index]` |
| 2 | `app/dashboard-shell.tsx` | GPU 1 slot: `view={chartViews.gpu0}` and `onToggleView={() => toggleChartView('gpu0')}` |
| 3 | `lib/client/use-telemetry.ts` | `process.env.NODE_ENV` → the literal `'development'` |
| 4 | `components/panels/gpu-panel.tsx` | trace lambda: `g.index === index` → `g.index === 0` |

```
$ pnpm verify
 Test Files  94 passed (94)
      Tests  2617 passed (2617)
Type Errors  no errors
```

That build serves GPU 0's model name and GPU 0's temperature history on GPU 1's card, sends GPU
1's table-view button to GPU 0, and ships an alarm-forcing escape hatch that any visitor can
trigger in production. `regressions.py` cannot see any of it either: the harness mutates a clean
tree with its own 159 anchors, and none of these four lines is one of them.

---

## 1. `10c1-A1` — the §6.2 GPU↔instance join can be replaced by array-position indexing, whole suite green — **EXECUTED**

`gpu-panel.tsx:105`:

```ts
const servingFor = (snapshot, index) => snapshot?.serving?.find((s) => s.instance === index) ?? null;
```

Replaced with `snapshot?.serving?.[index] ?? null`. Targeted run first
(`gpu-panel.test.tsx` + `dashboard-shell.test.tsx` + `serving-panel.test.tsx`, 61 tests, green),
then the full `pnpm verify` above.

**Why every existing test passes it.** `gpu-panel.test.tsx` has three join tests and positional
indexing satisfies all three:

- *"served by instance 0 / qwen3.6-27b"* — `serving[0]` **is** instance 0 in `servingInstances`.
- *"index 1, no serving[1], shows an em dash"* — `serving[1]` is `undefined`, so the em dash
  appears for the wrong reason. This test does catch a hard-coded `instance === 0`; it cannot
  catch positional lookup.
- The absent-card test never reaches `servingFor` at all.

**There is no test anywhere that renders GPU 1 with instance 1 present and asserts instance 1's
own model appears.** The positive direction of the join, for the card the join exists to
distinguish, is unasserted.

**The concrete failure, and it is not hypothetical — the collector documents it.**
`lib/collectors/llama.ts:61 discoverInstances()` returns `[...found].sort()` — the **set of
instance indices whose `<i>.env` file was found**, not a dense array from zero. If
`/etc/llama-server/0.env` is missing, unreadable, or renamed (a `set-model` rollback mid-write,
a `.bak` left behind — this repo's own CLAUDE.md has an entry about backups inside scanned
directories), the snapshot carries `serving: [{ instance: 1, model: 'gemma-4-12b', … }]`. Under
positional lookup **GPU 0's card prints `served by instance 0  gemma-4-12b`** — instance 1's
model, on the wrong card, with an honest-looking label. That is SPEC §6.2's own named failure
verbatim: *"getting it wrong prints the wrong model on a card rather than failing visibly."*

The same holds for a third instance: `serving = [0, 1, 2]` is fine positionally, but any gap
shifts every card.

**What would close it:** a fixture with a sparse or reordered `serving` array (`[instance 1]`
alone, or `[1, 0]`) rendered into `panelId="gpu0"`, asserting the em dash and *not* instance 1's
model — plus a mutation on that line. `servingIdentityOnly` (`instance: 2`) already exists in
`lib/fixtures.ts` and is composed into no snapshot.

## 2. `10c1-A2` — the card lookup itself has the identical hole — **EXECUTED**

`gpu-panel.tsx:102 gpuAt` → `snapshot?.gpus?.[index] ?? null`. Full `pnpm verify`, run
separately from the four-edit run: **exit 0, 94 files / 2617 tests.**

Note the asymmetry, because it explains why this survived: mutating `gpuAt` to a hard-coded
`g.index === 0` **is** caught (the *"card ABSENT from a gpus[] that WAS read"* test reddens).
Only the positional variant escapes, and it escapes because every fixture in the project that
has two cards has them dense and in order.

**Concrete failure:** `lib/collectors/nvidia-smi.ts:147` states it in its own doc — *"A row
whose `index` will not parse is a `problems` entry and not a GPU"* — and line 171 implements it,
pushing `row with unreadable index skipped`. So `gpus: [{ index: 1, … }]` is a shape the
collector is designed to produce. Under positional lookup GPU 0's panel renders GPU 1's card,
titled **GPU 0**, with GPU 1's temperature, VRAM and throttle mask; GPU 1's panel reads *"card
not enumerated"*. An operator watching the wall panel during a thermal event would be reading
the wrong die. `severityGpuTemp` bands it, the chip colours it, and the aggregate counts it —
all correctly, for the wrong card.

A1 and A2 are one class and should probably be adjudicated together: **`components/panels/`
assumes `gpus` and `serving` are dense arrays indexed from zero, and both collectors document
that they are not.**

## 3. `10c1-A3` — GPU 1's toggle wiring in the shell has zero coverage, because the two tests that would cover it use a one-GPU state — **EXECUTED**

Edit 2 above: GPU 1's slot fed `view={chartViews.gpu0}` and `onToggleView={() => toggleChartView('gpu0')}`.
Full verify green.

**The mechanism, measured rather than argued.** Both toggle-interaction tests in
`dashboard-shell.test.tsx` (*"toggling GPU 0 to table view does NOT flip GPU 1, CPU or COOLING"*
and *"toggling GPU 0 then CPU…"*) drive `stateOf()`, whose ring holds `everythingZero` — **one
card, index 0**. I mounted the shell with exactly that state and read the `gpu1` cell:

```
gpu1 cell contains "card not enumerated": true
gpu1 cell contains any <svg>:            false
gpu1 cell contains "table view" button:  false
gpu1 cell contains data-role="table-view": false
```

So `expect(cellFor(html, 'gpu1')).not.toContain('data-role="table-view"')` **cannot fail under
any mutation of the shell.** GPU 1 renders §6.5's takeover branch: no chart, no toggle, nothing
to be in table view. The assertion reads as independence and asserts the fixture.

The file *has* a two-GPU state — `stateOfTwoGpus()`, added by this very build — and uses it for
the hatch-id test and the *"starts in chart view"* test. Neither clicks anything.

**Concrete failure:** on the real box, an operator clicks GPU 1's `table view` button; GPU 0's
chart turns into a table and GPU 1's does not. The button appears not to work, and the card the
operator was actually reading changed underneath them. Ships green, and `10c-DS1..4` do not
cover it — `10c-DS2/3/4` mutate `toggleChartView`/`INITIAL_CHART_VIEWS`, which are the shared
mechanism, not the four per-slot wirings.

## 4. `10c1-A4` — COOLING's toggle wiring is unasserted for the same reason — **EXECUTED**

`view={chartViews.cooling}` → `chartViews.cpu`, `toggleChartView('cooling')` → `'cpu'`.
`dashboard-shell.test.tsx` + `cooling-panel.test.tsx`: **2 files, 48 tests, green.**

Only two of the four call sites of `toggleChartView` are ever clicked (`gpu0`, `cpu`). This is
HANDOVER §0.5's *"a function used more than once, mutated once"* rule at a fourth site: the
mechanism is covered, the wiring is not. The independence test's `cooling` assertion is not
vacuous the way `gpu1`'s is (COOLING does render a chart), but it only ever checks the negative
after a *different* panel is clicked, and nothing clicks COOLING's own button.

## 5. `10c1-A5` — the escape hatch's production gate rests on one untested argument, and defeating it survives into the real bundle — **EXECUTED, end to end**

`use-telemetry.ts:83`. Replaced `process.env.NODE_ENV` with the literal `'development'`:

```
$ pnpm verify     →  94 files / 2617 tests, exit 0
$ pnpm build      →  exit 0
$ grep -roh 'location.search,"[a-z]*"' .next/static/chunks/*.js
location.search,"development"
```

The parent's settled fact — *"the call compiles to a baked `"production"` string literal"* — is
true of the tree as written and **is a property of one token that no test, no type and no
mutation defends**. `forceAlarmForTesting`'s own doc rests the entire unreachability argument on
it (*"no input from the browser can ever make that argument anything but `"production"`"*), and
that argument is only as strong as the token.

**Concrete failure:** anyone editing this call site — extracting a `const nodeEnv`, moving the
read into `env.ts`, destructuring `const { NODE_ENV } = process.env` (which Next's define
substitution does not rewrite the way it rewrites a full `process.env.NODE_ENV` member read) —
ships a dashboard where `https://…:8090/?forceAlarmForTesting=1` pins a red 95 °C alarm banner
on the wall panel, on a page whose whole purpose is to be believed about temperature. `pnpm
verify` stays green, `regressions.py` stays green (`10c-FA1..6` all mutate `force-alarm.ts`; not
one touches the call site), and the only thing that would catch it is someone re-running the
parent's grep by hand.

**Correction to the test phase, §5.** Its proposed demonstration — *"flipping `!==` to `===`
would compile"* — is **wrong, and I ran it**:

```
lib/client/use-telemetry.ts(83,47): error TS2339: Property 'body' does not exist on type
  '{ readonly kind: "unauthorized"; } | { readonly kind: "error"; readonly detail: string; }'.
```

`tsc` rejects it, so the specific 401→fake-ok scenario the test phase describes cannot ship.
The discriminated union defends the `kind` check. It defends nothing else about this call site,
which is where A5 lives. Worth recording because the finding is real and its stated
justification was not — HANDOVER §0.5's *"compare against the counterfactual that was the code"*.

## 6. `10c1-A6` — the escape hatch's development path has never been shown to work — **REASONED**

`10c1-build.md` §3.1 records the one live trial: `?forceAlarmForTesting=1` on this Mac, *"no
banner appeared and the header stayed at `● no readings`"*, and correctly explains that this is
the right behaviour for a snapshot with no enumerated GPU. **That trial cannot distinguish a
working escape hatch from a completely broken one**, because a broken one produces exactly the
same output on that machine.

Concretely, each of these typechecks, ships green, and is indistinguishable from correct on the
machine the tool was tried on:

- `window.location.search` → `window.location.hash` (the gate never opens; `URLSearchParams('')`
  has nothing);
- dropping the wrapper and returning `response` unchanged;
- `forceAlarmForTesting(response, …)` instead of `response.body` — `body: unknown` accepts it,
  and the hatch then returns the whole response object as the body, so **every poll** fails
  `wire.ts` validation and the dashboard goes permanently stale (this one is not silent, but
  nothing in the suite says so).

The tool exists so 10a's z-index class of bug is visible at all. A tool for finding bugs that is
itself unverified is worth recording as a gap, not as a deliverable. The two testable shapes the
test phase named (mock `browserEnv.fetchTelemetry` across the three `kind`s) would also close
A5 and A6 together.

## 7. `10c1-A7` — **the CSS blind spot is not total: `.module.css` resolves to a Proxy, not `{}`, and two live guards depend on it** — **EXECUTED**

`10c1-test.md` §1.2 states, as the honest limit of the phase: *"Every `.module.css` import
resolves to an empty object in every test in this suite … `className={styles.chart}` renders as
`className={undefined}` — React drops the attribute entirely — in every panel, every test, every
file … no test anywhere, past or future, can observe a CSS-module class name at all."*

I ran the probe again and printed **property accesses**, not the object:

```
typeof grid       = object
Object.keys(grid) = []                      <- why console.log prints {}
grid.gpu0         = "_gpu0_e75739"
grid.cooling      = "_cooling_e75739"
grid.NOT_A_CLASS  = "_NOT_A_CLASS_e75739"
cooling.chart     = "_chart_a88580"
toggle.chart      = "_chart_7a74fe"
collide?          = false
```

It is Vitest's CSS-modules **Proxy** (it also threw `TypeError: Cannot convert a Symbol value to
a string` from its own `get` trap on my first attempt, which is the giveaway). `Object.keys` is
`[]`, so printing it shows `{}` — the diagnosis method is the trap. **Property access returns a
real, per-file-hashed class name**, class attributes *are* rendered, and two files' identical
`.chart` are distinct strings in tests exactly as they are in production.

Consequences the reconcile phase needs:

1. **`grid.test.tsx`'s tier 2 is live, not vacuous.** It asserts
   `` `class="${styles[cssKey]}" data-slot="${slot}">${marker}<` ``. If the claim were true this
   would assert `class="undefined" …` against markup with no class attribute and **fail**. It
   passes; so does its companion *"the nine slot classes are nine distinct identifiers"*, which
   would collapse to `Set.size === 1` under a `{}`. **A green suite refutes the claim.** 10a's
   grid-placement guard — the one that caught COOLING painting in the log's cell — is intact.
2. `app/dashboard-shell.test.tsx:337`, `expect(band?.className).toBe(shellStyles.stickyBand)`,
   is live for the same reason; under `{}` it would compare `''` to `undefined` and fail.
3. A **cross-file class-name collision is observable today** — `cooling.chart !== toggle.chart`
   is a runnable assertion. Whether it is worth asserting is another matter (Next hashes
   per-file too), but *"unfalsifiable"* is not the right word for it.

I am not proposing a fix; I am flagging that a reconcile phase acting on §1.2 as written could
reasonably conclude those guards are theatre and weaken them. They are not.

## 8. `10c1-A8` — what the Proxy *actually* voids, with a live instance in the tree — **EXECUTED**

The real hole is the opposite of the one recorded: **every key resolves, including ones with no
rule.** `styles.NOT_A_CLASS` → `_NOT_A_CLASS_e75739`. A typo'd or deleted class renders a
plausible class attribute that styles nothing, and neither the type system (the module is typed
as an index signature) nor any test can see it.

I audited the whole tree for it — for each `.tsx`, compare every `styles.X` used against the
selectors declared in its own sibling `.module.css` — and there is exactly one live instance:

```
UNDECLARED  alarm-banner.tsx: styles.item  (not in alarm-banner.module.css)
```

`alarm-banner.tsx:80` renders each secondary condition as `<span className={styles.item}>`, and
`alarm-banner.module.css` declares `.banner .glyph .body .head .count .lead b .since .rest
.itemSince .stale` — **no `.item`**. Today it is benign: the parent `.rest` is
`display:flex; flex-wrap:wrap; gap:.4em 1em`, so the items lay out on the parent's gap. It is
benign by luck, not by design — the same reference with a `white-space: nowrap` or a separator
rule intended and never written would wrap a multi-condition banner mid-condition on the wall
panel, and nothing anywhere would say so. Pre-existing (10a), not 10c1's; recorded here because
the audit that finds it is ~15 lines and needs no browser.

## 9. `10c1-A9` — is the browser the only answer? No, and the scope argument should say so — **REASONED**

The handoff asks whether this is really an argument about 10c-3's scope. It is three separate
things and only the third is 10c-3's:

| tier | risk | observable where |
|---|---|---|
| binding | which element carries which class; `data-*` style hooks | **jsdom, today** — `grid.test.tsx` tier 2 does it; `data-severity` is asserted in chip/meter/header tests and every one of its four values has a CSS rule (checked) |
| reference | `styles.X` naming a rule that does not exist; a class renamed in the CSS alone | **a static check**, no runtime — A8's audit; `grid.test.tsx`'s tier 3 already does the CSS-side half for the nine grid classes |
| paint | cascade, specificity, media queries, `display:none` at ≥1600px, overflow, stacking | **a real browser** — genuinely 10c-3 |

So the honest framing for 10c-3's scope: the browser step owns *paint*, and it is the only thing
that can. It should not be asked to carry the other two tiers, which are cheaper and already
partly done.

## 10. `10c1-A10` — the two-GPU fixture that exists is indistinguishable from one card — **EXECUTED**

`stateOfTwoGpus()` builds the second card as `{ ...gpu0, index: 1 }` — same `name`, same `bus`,
same `tempC` (0), same VRAM, same everything but `index`. The only per-card fact any shell test
can observe is the hatch id, which is derived from `panelId`, not from the data. So even the
tests that *do* use a two-GPU state cannot see a per-card data mix-up.

I mounted the shell with a two-GPU state carrying **distinct** temperatures (66 / 55) and
confirmed the composition is correct today:

```
gpu0 cell has 66: true   has 55: false
gpu1 cell has 55: true   has 66: false
```

So this is not a bug report — it is why A1/A2/A11 could all ship green through a file that
already has a two-GPU helper. A fixture whose two members differ in the fields the panel renders
would have caught three of the four edits in the headline experiment.

## 11. `10c1-A11` — GPU 1's temperature *trace* reads GPU 0's card, whole suite green — **EXECUTED**

`gpu-panel.tsx:136`:

```ts
const trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === index)?.tempC ?? null);
```

`index` → `0`. Part of the four-edit run; green. **This is `10c-CO4`'s exact twin, in the other
file.** The test phase found the cooling panel's `g.index === 1` had never been exercised, fixed
that one, and stopped — precisely the 10b invariant-1 shape the handoff predicted ("four of nine
panels were wrong and the sweep had stopped at four").

**Concrete failure:** GPU 1's card draws GPU 0's temperature history, in GPU 1's colour, under
the label *"GPU 1 temperature over the selected window"* — in the sparkline, in the ≥1600px
promoted chart, and in the table view. The headline number above it is GPU 1's own current
reading, so the number and the trace beneath it describe different cards. On this machine that
is the difference between the 65 °C split-mode plateau and the 74 °C single-GPU one.

`gpu-panel.test.tsx` never asserts on trace *content* at any index, and the shell's two-GPU
fixture has identical temperatures (A10), so nothing reddens.

## 12. `10c1-A12` — `regressions.py` cites mutation ids that do not exist — **EXECUTED (grep)**

`pipeline/steps/10-panels-assembly/regressions.py:437`:

> *"10a-PP2's job — proving `panelId` reaches each slot correctly — is now covered by the
> **10c-DS-WIRE\*** mutations below"*

There is no `10c-DS-WIRE` anything. The mutations are `10c-DS1..4`, and only `10c-DS1` does that
job. Low severity, but it is HANDOVER §0.5's *"a document contradicting the code it shipped
with"*, fifth loop running, written by the phase that also wrote the correct code. Worth one
line of a fix because the comment is the only place a future reader is told where 10a-PP2's
coverage went.

---

## What I attacked and could NOT break

Each of these I tried to break and failed, or checked and found genuinely covered. They are
listed so the reconcile phase does not spend budget re-deriving them.

1. **The toggle surviving a poll — dynamically tested, and it survives.** The build and test
   phases both recorded this as "sound by React semantics, not dynamically tested". I mounted
   the shell with a two-GPU state, clicked GPU 0's toggle, then replaced `handle.state` with a
   **brand-new `RuntimeState` object carrying a newer sample** (66/55 → 70/60) and re-rendered.
   Result: GPU 0 still in table view, and the new value `70 °C` present in the markup — the poll
   landed and the view held. The claim is now measured, not inferred.
2. **`gpuAt` hard-coded to `g.index === 0`** — caught. The *"card ABSENT from a `gpus[]` that
   WAS read"* test reddens. Only the positional variant (A2) escapes.
3. **A hard-coded `servingFor(…, 0)`** — caught, by the *"index 1, no serving[1]"* test. Only
   positional escapes (A1).
4. **Both chart elements flipping together.** `gpu-panel.test.tsx` and `cpu-panel.test.tsx` both
   assert `html.split('data-role="table-view"').length - 1` **`.toBe(2)`** — an exact count, not
   `toContain`. Pinning *either* of CPU's two sparklines, or either of GPU's two chart elements,
   reddens. This is the `toContain`-cannot-see-a-duplicate rule applied correctly.
5. **Conditions and the event log with two GPU subjects — genuinely covered, at the lib layer.**
   `lib/client/observations.test.ts` has a real two-card `loaded` fixture and asserts the six ids
   `gpu_temp/throttle/vram:{0,1}`; `lib/conditions.test.ts` asserts `gpu_temp:1` retired while
   `gpu_temp:0` stays displayed, and that the ledger and holds are dropped for the retired one;
   `lib/client/events.test.ts` logs two cards alarming in one poll and asserts their ordering,
   and has a "one fewer card" fixture. `conditionsFrom` iterates `snapshot.gpus` and subscripts
   by `String(gpu.index)` — no positional assumption anywhere. **The single-GPU-fixture problem
   does not reach the conditions/event/aggregate layer.** It is confined to
   `components/panels/` and `app/`.
6. **The header aggregate and the alarm count over two cards.** The shell forwards
   `state.severity`/`state.alarms`/`state.mode` and `dashboard-shell.test.tsx` asserts each with
   distinctive values (`paused · 6 alarms`, `stale · 2 alarms`, `all healthy` with `not.toContain('0 alarm')`,
   `severity: null` → `no readings`). The two-card reduction behind those numbers is item 5's.
   I could not construct a wrong wiring here that survives.
7. **The grid with both slots occupied.** All three of `grid.test.tsx`'s tiers are live —
   including tier 2, which A7 shows is *more* live than the test phase believed. The shell's
   `SLOT_TITLE` check covers all nine slots and would catch a swapped component or a wrong
   `panelId` literal. `10a-GR1` covers the grid's own copy-paste.
8. **Duplicate SVG ids.** Re-checked independently: `stacked-time-series-chart.tsx:669` is the
   only site that mints an id, both callers prefix with `panelId`, `Sparkline` and
   `ChartViewToggle` mint none, and the shell asserts `gpu0-temp-chart-hatch` /
   `gpu1-temp-chart-hatch` are present in their own cell and absent from the other's. Settled,
   and it holds.
9. **§6.2's exhaustive header.** No toggle, no extra control, reached `Header`; `ChartViewToggle`
   is imported only by the three chart-bearing panels. Placement matches the amended §6.2.
10. **Invariant 2 on the new code.** `chart-view-toggle.tsx` is 62 lines, imports one stylesheet,
    and calls only its caller's `onToggle`. `force-alarm.ts` never builds a request. Nothing new
    writes to the box.
11. **The harness's own anchoring.** `regressions.py` already refuses a mutation whose anchor is
    missing (`ANCHOR NOT FOUND`) or matches more than once (`ANCHOR AMBIGUOUS`, naming the count
    and the `replace(…, 1)` hazard). I could not find a 10c mutation with a non-unique anchor.
12. **`data-*` as a style hook.** `data-severity` is the only one CSS reads
    (`chip`/`meter`/`header`/`panel-shell`), it *is* asserted in the DOM by the panel tests, and
    all four of its values have rules in each stylesheet that keys on it. `data-slot` and
    `data-role` are read by no stylesheet, which their own comments already say.

**Not re-opened, per the handoff:** the green run's counts, `pnpm build`, the escape hatch's
deadness *as the file is currently written*, duplicate DOM ids, and the absence of `.env`/dev
server. A5 is not a contradiction of the third of those — it is the observation that the
property is undefended, not that it is currently false.

**Not done, and stated rather than implied:** I did not re-run `regressions.py` (159 mutations,
~6 min, and the parent re-runs the ledger at review); I did not open a browser; and I did not
attempt to distinguish the ledger's genuine coverage from credit accidentally granted by
HANDOVER §0.3's contention flake, which needs repeated runs.

---

## Tree state

Every experiment reverted from a backup and diffed. `.next/` (created by the A5 build) removed.
No dev server started, no `.env` written, nothing committed, nothing staged.

```
$ pnpm verify
 Test Files  94 passed (94)
      Tests  2617 passed (2617)
Type Errors  no errors
   VERIFY EXIT=0

$ git status --short          # identical to the state handed to this phase
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
?? pipeline/handoffs/…            (three handoffs)
?? pipeline/steps/10-panels-assembly/10c1-build.md, 10c1-test.md
```

(This file is the twelfth `??` entry once written.)
