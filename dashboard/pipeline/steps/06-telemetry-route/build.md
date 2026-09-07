# Step 6 — `GET /api/telemetry` — build phase

`GET /api/telemetry` exists, assembles §4's snapshot from the six step-3/4/5 collectors, caches
the **in-flight promise** for 2 s, owns `previous` across a failed read, and never returns 500
for a collector failure.

**`pnpm verify` → 1329 tests, 29 files, exit 0.** `pnpm build` → exit 0, `/api/telemetry`
listed as `ƒ (Dynamic)`. 44 new mutations, all biting, ledger clean. No dependency added
(invariant 6). Nothing outside `dashboard/` touched; nothing in `lib/collectors/`, `lib/types.ts`
or any earlier step's file modified.

---

## 1. What was built

| Path | Lines | What it is |
|---|---|---|
| `lib/telemetry/cache.ts` | 143 | §4's cache. Generic in `T`, holds the **in-flight promise**, no timer |
| `lib/telemetry/snapshot.ts` | 404 | §4's assembly. Stateless: `previous` in, next `previous` out |
| `lib/telemetry/source.ts` | 159 | The one stateful object: the cache **and** `previous` (O18 + O16) |
| `lib/telemetry/handler.ts` | 120 | `GET /api/telemetry` as a function of a `Request`. 401/200 |
| `app/api/telemetry/route.ts` | 27 | The Next route: `dynamic` and `GET`, and nothing else |
| `lib/telemetry/cache.test.ts` | 10 tests, 6 ⚠ | O18, proved by call count |
| `lib/telemetry/snapshot.test.ts` | 23 tests, 12 ⚠ | assembly, the key census, six throwing collectors |
| `lib/telemetry/source.test.ts` | 14 tests, 10 ⚠ | O16's retention, the two clocks, no background work |
| `lib/telemetry/handler.test.ts` | 9 tests, 5 ⚠ | 401 before the sample; 200 with `errors[]` |
| `app/api/telemetry/route.test.ts` | 4 tests, 3 ⚠ | `force-dynamic`, fail-closed, Next's second argument |
| `pipeline/steps/06-telemetry-route/regressions.py` | 44 mutations + ledger | |

**Why four modules and not one.** Each owns one property that has its own failure mode, and
each is proved against its own fake: the cache against a counter (the O18 property is *N callers,
one sample* — nothing to do with telemetry), the assembly against six fake collectors, the source
against a driven clock, the handler against a fake source. A single `lib/telemetry.ts` would have
mixed a generic cache, the assembly, mutable state and HTTP in one file, and the state would have
had no obvious owner — which is the thing O16 is about.

### The route is four lines, deliberately

A `route.ts` may only export the names Next recognises, so the two seams the tests need — the
session check and the telemetry source — cannot be exported from there. Everything testable is in
`lib/telemetry/handler.ts`; `route.ts` holds `dynamic` and `GET`, and `route.test.ts` asserts
exactly that (`^export const …` census).

**`force-dynamic` is load-bearing.** Without it a `GET` handler that touches no request-time API
is a prerender candidate, and `next build` would run the collectors *on the build machine* and
bake the result — a snapshot of this Mac, `nvidia-smi` absent and `/proc/stat` unreadable, served
to the browser as the box's telemetry. `pnpm build` now prints `ƒ /api/telemetry`, which is the
observable form of the same fact. (`dynamic` survives in Next 16 while Cache Components is off;
the segment-config table moved it to `caching-without-cache-components.md`, which was read before
using it.)

> **⚠ CORRECTED IN RECONCILIATION (F5).** Three claims in that paragraph are wrong on this
> toolchain, and the correction is recorded rather than the text rewritten. **(a)** `force-dynamic`
> is *not* what prevents prerendering today: with `export const dynamic = 'auto'` — the default —
> `pnpm build` still prints `ƒ /api/telemetry`, measured. **(b)** So the build output observes
> Next's default, not the export: Next 16's bundled docs
> (`01-app/01-getting-started/15-route-handlers.md:51`) say *"Route Handlers are **not cached by
> default** … To cache a `GET` method, use … `export const dynamic = 'force-static'`."* **(c)**
> Mutation `N1` is therefore **behaviour-preserving**, which makes §6's "`A9` is the only
> behaviour-preserving mutation" wrong by one. **The export is kept** — it is correct defence
> against a future default and against Cache Components, under which the same docs say a `GET`
> handler *can* be prerendered — and only the claim changed. The ⚠ test is renamed to *"the route
> declares `dynamic = force-dynamic`"*, which is what it checks. ⚠ Still unverified, and step 11's
> to answer before it turns Cache Components on: whether `dynamic` is honoured **with** Cache
> Components enabled, since the guide documenting it opens *"This guide assumes you are **not**
> using Cache Components"*.

**`GET` is an explicit one-parameter wrapper, not `export const GET = handleTelemetry`.** Next
calls `GET(request, context)`, and `handleTelemetry`'s second parameter is its injected deps — the
alias would hand `{ params }` in as the session check and the source. One character shorter and
completely broken; `route.test.ts` calls `GET` through a two-argument cast to pin it.

---

## 2. The in-flight cache, and how the tests prove it joins rather than re-samples

`createInFlightCache({ sample, ttlMs, monotonicMs })` keeps one entry: `{ startedMs, flight,
promise }`. A caller is served the held promise when

```ts
held !== null && (held.flight.inFlight || nowMs - held.startedMs < ttlMs)
```

**`inFlight` is first and it is not an optimisation.** §6.7 states that `collectServing`'s worst
case is 2 s discovery + 4 s probe = **6 s**, above the 5 s cadence, *"and that is not a fault …
Overlapping polls must never become overlapping samples."* A cache that asked only "is the last
result younger than 2 s?" answers **no** two seconds into a six-second sample and forks a second
one — O18's accumulation arriving through the freshness check rather than through the absence of a
cache. The two rules are independent and both are tested.

Three structural details, each with a test:

- **The decision and the store are one synchronous run.** `get()` is not `async`; two callers in
  the same tick cannot both find the cache empty. (An `async` body would in fact be safe here too,
  because it runs synchronously to the first `await` — but that is a property of where the `await`
  happens to sit, and it should not need re-checking after an edit.)
- **The window is stamped at the sample's START**, and the same reading of the clock is handed to
  `sample()`, so the freshness window and the delta interval cannot drift apart. Measured from
  completion, a 6 s poll's snapshot would be served until it was 8 s old under a cache that calls
  itself 2 s — and §6.7's age indicator, the thing that tells a reader the page is behind, would be
  reporting an age the server had decided to ignore.
- **A rejected sample is evicted**, identity-checked so a late rejection cannot evict a successor.
  A rejection is a bug in the assembler, never a failed reading; holding it would turn one bug into
  a two-second stall for every caller.

### How the tests prove *joining*, not merely *equal answers*

Every cache test counts calls to the sample function, because O18's damage is **a second
`nvidia-smi`**, not a second snapshot object. PLAN asks for exactly this ("cache proven by call
count"). The four that carry the argument:

| test | setup | proves |
|---|---|---|
| ⚠ concurrent callers join one sample | three `get()`s in one tick, sample held open | one call, one value |
| ⚠ a caller arriving mid-sample joins it **even long after the window has elapsed** | clock advanced 6000 ms *while in flight* | the window does not overtake an unfinished sample |
| ⚠ a wedged sample is never re-forked | 13 polls at the 5 s cadence against a sample that never settles | **one** call, and all 13 callers hold the *same promise object* (`new Set(joined).size === 1`) |
| ⚠ the window is measured from the start | lands at t=1500, next caller at t=2500 | 2 calls — completion-stamping would give 1 |

No fake timers anywhere: the clock is injected and the samples are hand-resolved deferreds, so a
"6 s poll" costs no wall-clock time and nothing can go flaky on a busy machine. Nothing in
`cache.ts` calls `setTimeout` — which is the property being preserved, and is asserted separately.

At the source level the same property is re-proved through the real assembly: *⚠ ten callers
inside the window cost exactly one sample*, and *⚠ a caller arriving mid-sample joins it and
starts no second poll* (clock advanced 6000 ms mid-flight, `calls.host` stays 1).

---

## 3. How `previous` is owned

`createTelemetrySource` holds `let previous: DeltaSample | null`, read when a sample starts and
written when it settles. **The cache is what makes that safe**: it never lets a second sample start
while one is in flight, so there is exactly one writer. O18 and O16 are one mechanism seen twice,
which is why they live in one file.

The retention rule is `mergePrevious(prev, next)`, and it is **per counter**:

```ts
atMs: next.net !== null ? next.atMs : (prev?.atMs ?? next.atMs),
cpu:  next.cpu ?? prev?.cpu ?? null,
net:  next.net ?? prev?.net ?? null,
```

**Why per counter and not per sample.** §6.7 says "keep the last successful sample and its
timestamp", and a `DeltaSample` is two counters that fail independently. Retaining the whole sample
only when *both* read satisfies the sentence and defeats its stated purpose: if `/proc/net/dev`
stopped parsing permanently — the interface renamed, say — the CPU baseline would freeze at the
last poll where both worked, and `cpuPct` would drift from a 5 s figure into a lifetime average.
§6.7's own reason is "one transient failure costs two polls of **every** delta", which is a
per-delta statement.

**⚠ `atMs` belongs to `net`.** One timestamp, two counters, and only one of them is ever paired
with a clock: `netRatesBetween` divides by `next.atMs - prev.atMs`, while `cpuPctBetween` is
self-normalising (`busy/total`, both deltas) and never reads the field. So the timestamp advances
exactly when the network counters do. Advancing it whenever *anything* succeeded would divide a
two-poll counter delta by a one-poll interval and report **double** the real throughput — a
plausible-looking number, which is the failure mode this project is organised against.

That is pinned by a test that runs three polls through the **real `advanceDeltas`**, with the
network read failing in the middle:

| poll | `atMs` | cpu | net | what the poll reports |
|---|---|---|---|---|
| 1 | 1000 | 0/1000 | 1000/2000 | first sample — `null` |
| 2 | 6000 | 100/2000 | **failed** | rates `null`; `cpuPct` 10 % |
| 3 | 11000 | 600/3000 | 11000/22000 | **1000 B/s** across the full 10 s, `cpuPct` **50 %** |

Poll 3's rate uses poll 1's counters with poll 1's timestamp (10 000 bytes / 10 s), while its
`cpuPct` uses poll 2's *retained* counters (500/1000), not poll 1's (600/2000 = 30 %). Both halves
of the rule are visible in one assertion set, and the bug it excludes renders perfectly at 2000 B/s.

**A crashed host collector participates in this correctly**: its fallback sample is
`{ atMs: nowMs, cpu: null, net: null }`, so the merge keeps the last good counters. A fallback that
invented zeroes would make the next poll's deltas fiction; that has its own mutation (`A12`).

**The other five collectors are stateless and step 6 invents no history for them** (HANDOVER §6
item 3). A `health` that was `ok` last poll and is `null` this poll renders `—`.

---

## 4. The assembly shape, and how `errors` stays off the wire

```ts
const filesystems: Filesystems = storage.filesystems;   // destructured
const checks: SafetyChecks     = safety.checks;         // destructured

const assembledStorage: Storage = { ...filesystems, net: host.net };
const assembledSafety:  Safety  = { ...checks, pwm5Present: cooling.pwm5Present };
const assembledCooling: Cooling = withServiceState(cooling.cooling, checks.fanServiceState);
```

Both spreads are **total**: `Filesystems` *is* `Omit<Storage, 'net'>` and `SafetyChecks` *is*
`Omit<Safety, 'pwm5Present'>`, so neither can carry an extra key. That is the type half; step 5
measured that the flat version *typechecks at exit 0*, so there is a runtime half as well — a key
census over the **assembled** snapshot (HANDOVER §3.2's outstanding obligation), asserted three
ways:

1. `Object.keys(snapshot.storage)` is exactly `root, home, net`; `Object.keys(snapshot.safety)` is
   exactly the four §3.7 names; `'errors' in …` and `'filesystems'/'checks' in …` are all `false`.
2. The top-level key set is exactly §4's nine.
3. **The same census after `JSON.stringify` → `JSON.parse`**, which is what the route actually
   sends. `undefined` is the specific thing serialisation drops, so a key present in the object and
   absent on the wire would pass (1) and still reach the client missing.

Mutations `A1`/`A2` restore the historical mistake (`{ ...storage, net }`) and redden the census
under vitest; `T1`/`T2` are the same edit checked with `tsc`, where they are `TS2739` — *missing
the following properties from type 'Storage': root, home*. (⚠ The harness prints only the first
`error TS` line, which for `T1` is the incidental `TS6133` unused-local; `TS2739` is the second
line and was checked by hand. Worth a nicer tally line in a later harness.)

**O9 — one D-Bus read, two panels.** `collectSafety` is the only reader of
`gpu-fan-control.service`; its answer reaches `safety.fanServiceState` through the spread and
`cooling.serviceState` through `withServiceState`, on adjacent lines. Tested across all six
`UnitState` values **and `null`**, plus the converse (a `serviceState` a cooling collector wrongly
carried is overwritten).

**`pwm5Present` comes from `collectCooling`'s single three-valued probe**, tested for `true`,
`false` and `null`. Mutation `A5` derives it from `ch5Mode` — §3.7's stated worst inversion — and
goes red on two tests.

**`errors[]` order** is the snapshot's own field order: gpus, host, cooling, serving, storage,
safety. §4 fixes no order and §6.5 matches an entry to a figure by `source`, so any order conforms;
this one is stable and needs no rule to remember. Recorded in §7 below as a chosen convention.

### A collector that throws — PLAN's green criterion

Each of the six calls goes through `attempt(run, onThrow)`. Every collector is documented and
tested as never throwing, so this is defence in depth against a **bug** — but without it one
rejection inside `Promise.all` loses the whole snapshot including the five collections that
succeeded, and returns 500 to a dashboard whose purpose is to keep rendering.

The fallback is the collection that collector produces when it learns nothing, plus **one
`errors[]` entry per §3.7 source that collector can file**:

| collector | fallback | sources filed | why |
|---|---|---|---|
| `collectGpus` | `gpus: null` | `nvidia-smi` | its only source |
| `collectHost` | every reading `null`, counters `null` | **nine**: `proc-stat`, `proc-meminfo`, `proc-loadavg`, `proc-uptime`, `proc-net-dev`, `net-operstate`, `proc-cpuinfo`, `hostname`, `coretemp` | it blanks nine figures across three panels and §6.5 wants an error per figure |
| `collectCooling` | `coolingFrom(NO_FANS, {outcome:'unlocated'}, null)`, `pwm5Present` from the **same probe** | `dell-smm` | `unlocated` → `null`; `absent` would be §3.6's alarm minted from a crash |
| `collectServing` | `serving: null` | `llama-env` | its other three name **per-instance** figures and there are no instances to attribute them to; this is what its own failed-`readDir` path does |
| `collectStorage` | both mounts `null` | `statvfs` | its only source |
| `collectSafety` | all three checks `null`, never `false` | `ufw`, `dkms`, `dbus` | three figures, three entries, as `collectStorage` does for two mounts |

`lib/fixtures.ts` is deliberately **not** used for any of this — it says so itself ("there is no
'empty snapshot' the route may return when a collector fails"). These are six independent "could
not report" collections, each carrying its own explanation, which is §6.5 rather than an empty
snapshot.

### ⚠ There is no shared budget, and that is asserted structurally

> **⚠ CORRECTED IN RECONCILIATION (F1, M2).** The guard described below read **one regex over one
> import specifier**, and the adversarial defeated it with `import { deadline } from
> '@/lib/collectors/deadline'` — a real module, what an editor's auto-import offers, and 60 of 60
> green under the mistake the guard exists to catch. The rule now lives in
> `lib/guardrails.test.ts` as *⚠ the assembler shares no budget across collectors*, bans
> `@/lib/collectors/` by **path prefix** and namespace imports as well as the brace block, and runs
> over comment-blanked source. `A9` still demonstrates it, now pointed at its new home; `T68` in
> **step 4's** harness covers the deep-specifier form, because ledger ownership follows the file.

HANDOVER §6 item 1 — "the single most important line in this section" — forbids one `deadline()`
across the collectors. The six run concurrently, each keeping its own budget, so the poll's ceiling
is the **largest** of them (§6.7's intended 6 s), not their sum.

A shared budget is **behaviour-preserving on every healthy poll**. No fixture distinguishes it, no
mutation of a comparison reaches it, and it shows itself only on the poll where a collector is slow
— by minting a *failure* verdict from a bound that applied to five other subjects. So it is a
source-text guard (HANDOVER §5.3's shape): *⚠ the assembler imports no bound and opens no budget of
its own*, asserted on the import list (a bound would have to be imported; it is not a global) plus
`setTimeout(`/`setInterval(`. Asserting on the imports rather than on a substring is what makes it
safe against the module's own prose, which discusses `deadline()` at length — no comment stripper
needed.

**Mutation `A9` is the demonstration.** It imports `deadline`, opens `deadline(6000, 6000)` and
wraps a collector in it: **22 behavioural tests stay green and exactly one test goes red** — the
structural guard. That is HANDOVER §5.3's argument reproduced on new code.

---

## 5. 401, and what step 6 honestly builds of it

§4 requires 401 without a valid session; §5 fixes the mechanism (httpOnly, SameSite=Strict, 30-day
cookie signed with `SESSION_SECRET`) and **step 7 owns it**. Step 6 owns the shape:

```ts
export type SessionCheck = (request: Request) => boolean | Promise<boolean>;
export const noSessionVerifierYet: SessionCheck = () => false;
```

**The default denies — fail closed.** §5.2 says the login screen is the only route reachable
unauthenticated, and the asymmetry decides it: a permissive placeholder step 7 forgot to replace is
an unauthenticated telemetry endpoint on a LAN box — the same shape as `serve-llm.sh` writing a ufw
rule into a firewall that was never enabled, which left 8080/8081 open for a week. A deny-by-default
placeholder step 7 forgets is a dashboard that will not open: loud, immediate, harmless.

It has a second benefit: `route.test.ts` can call the **real** `GET` safely, because 401 means
nothing spawns `nvidia-smi` or opens a socket in the test suite.

**⚠ Authorisation happens before the sample**, asserted by call count (*⚠ an unauthorised request
never reaches the telemetry source*). An unauthenticated request must not be able to make this box
run `nvidia-smi`, open two D-Bus connections and probe both `llama-server` instances.

**The 401 carries no body.** §4 and §5 specify the status and nothing else, and §5.2's client
behaviour needs only the status; an invented error envelope would be a second, unspecified contract
for step 8 to depend on. Recorded as a gap in §7.

**Both responses carry `Cache-Control: no-store`** — chosen, not spec'd, and recorded below.

---

## 6. Regression evidence

```
python3 pipeline/steps/06-telemetry-route/regressions.py
…
Red-test ledger: 49 distinct failing tests across 44 mutations; 36 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 44 regressions failed their check, as they must.
```

40 `test`-kind mutations and 4 `types`-kind. **No mutation failed to bite and no ⚠ test was
inert.** The ledger shaped the tests while they were being written rather than catching them
afterwards: the boundary tests (*a settled sample inside the window is reused* / *at exactly the
window a new sample is taken*) exist because the three cache-freshness mutations needed somewhere
to land, and *⚠ the top-level key set is exactly §4's* gained mutation `A3` — dropping `hostname`
from the top level, which is what §3.2's table would suggest — rather than being left covered by
nothing.

### The other half: reading each test against its own name

HANDOVER is explicit that the ledger is only the mechanical half, and that a test naming a property
it does not check has appeared in **every** step so far. A deliberate pass over the 34 ⚠ names
found three, all fixed before this note was written:

| test | what was wrong | fix |
|---|---|---|
| *⚠ the sample receives the clock reading the entry was stamped with* | the body proved the value came from *the clock*, not that it was *the entry's* stamp — the two are the same reading only if you already believe the implementation | added a third `get()` 1999 ms after the second sample: the window that follows is measured from the value handed to `sample`, which ties them together |
| *⚠ pwm5Present comes from the cooling probe, **not from the safety collector*** | only the first clause was checked; the second was left to `Omit<Safety, 'pwm5Present'>` | added a case that varies everything the safety collector *can* say — `ufwEnforcing: false`, `dkmsForRunningKernel: false`, `fanServiceState: 'failed'`, an entry — and asserts the value stays where the probe put it |
| *⚠ a throwing host collector returns null counters **so previous is retained*** | the retention half is proved in `source.test.ts`, not here; the name claimed both | renamed to *⚠ a throwing host collector returns null counters, not invented zeroes*, which is what the body checks |

Two of the three were **over-claiming names on correct bodies** and one was a genuinely weak body.
None would have been caught by the ledger, which is the point HANDOVER §5.2 makes about the limit
being irreducible.

**Fixture symmetry** (HANDOVER §5.1) on the one boundary this step adds — `now - startedMs < ttlMs`
— is a fixture on each side (`ttlMs - 1` reuses, `ttlMs` re-samples) plus **three** mutations on
that line, because a single mutation there can only prove that *a* freshness check exists:

| mutation | wrong implementation |
|---|---|
| `C2` | drops the in-flight disjunct → a 6 s poll is overtaken at 2 s |
| `C3` | joins only in flight, never reuses a result → every poll samples |
| `C4` | `<` becomes `<=` → one poll too many served from the cache |

The two sides differ in what the box actually does — one poll costs zero `nvidia-smi` calls, the
other costs one — so this is the "fixture it" case rather than the "buys bookkeeping" case.

**The four inherited harnesses** were re-run unchanged after this step's work:

```
02-format-severity                    40 mutations   All 40 regressions failed their check
03-collectors-gpu-host                64 mutations   All 64 regressions failed their check
04-collector-cooling                  74 mutations   All 74 · ledger: 161 red across 74, 64 ⚠ covered
05-collectors-serving-storage-safety 127 mutations   All 127 · ledger: 183 red across 127, 94 ⚠ covered
```

⚠ **Do not run them concurrently with `pnpm verify`.** They mutate source files in place, so a test
run started alongside one reads a half-mutated tree — 39 spurious failures were produced exactly
that way while writing this step, and the tree was fine. Serialise, or wait for the harness to exit.

(No file under `lib/collectors/`, `lib/types.ts`, `lib/format.ts`, `lib/severity.ts`,
`lib/conditions.ts`, `lib/throttle.ts` or `lib/fixtures.ts` was modified, so nothing needed
re-aiming; the run confirms it rather than discovering it.)

### The real `pnpm verify`

```
$ export PATH="$HOME/.local/bin:$PATH"; cd dashboard && pnpm verify
$ tsc --noEmit && vitest run
 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard

 Test Files  29 passed (29)
      Tests  1329 passed (1329)
Type Errors  no errors
   Duration  3.09s
exit=0
```

`pnpm build` → exit 0, `.next/standalone/server.js` emitted, `tsconfig.json` still
`md5 8b6e358b0e19ad663d554dc8310c6da0`, and the route table reads:

```
Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/telemetry          ← ƒ (Dynamic) server-rendered on demand
```

`git status --short` shows `M ../.gitignore` (pre-existing) and `?? ./` only.

---

## 7. Underspecified — recorded, not guessed (invariant 7)

### ⚠ S16 — the route can name no `ErrorSource` for a poll it abandons, so it has no ceiling

HANDOVER §9 lists *"An aggregate poll deadline — per-collector ceiling, never one shared budget"*
as step 6's, open. **Step 6 shipped no route-level ceiling, and this is the reasoning, offered for
the spec to confirm or replace:**

- Five of the six collectors carry a monotonic budget of their own and are guaranteed to settle.
  `collectHost` does not — O17 exempts `readFile`/`readDir` because "procfs does not block" — so a
  ceiling would exist to bound **that one collector**.
- §6.7 requires an abandoned verdict to be `null` *"and its `errors[]` entry names the budget"*.
  `collectHost` owns **nine** sources. An entry saying "the route gave up" would have to pick one of
  nine figures, or file all nine as though each read had failed. §3.7's vocabulary has no `route` or
  `assembly` member, and inventing a nineteenth is forbidden.
- The poll's ceiling is therefore `max(per-collector budgets)` = **6 s**, which §6.7 blesses.

**The consequence the spec does not address:** O18's cache holds the in-flight promise, so *if a
collector ever failed to settle, every subsequent request would join a permanently wedged sample and
the endpoint would be dead until the container restarted.* That is a new failure mode created by the
cache, and it is the strongest argument for a ceiling. One sentence in §4 or §6.7 would close it,
either way:

> either **(a)** "the route needs no aggregate bound: every collector settles, and `collectHost`'s
> `/proc` and `/sys` reads are exempt under O17" — making the exemption explicit where it now has to
> be inferred; or **(b)** what an abandoned poll returns and under which `ErrorSource`.

This also subsumes HANDOVER's **S14** (the 6 s ceiling above the 5 s cadence), which step 6 has now
implemented against and which still wants its sentence.

### ⚠ S17 — is `ts` the start of the poll or its end?

Step 6 stamps `ts` at the **start**, because `collectHost`'s counters are read then and `ts` has to
describe the readings rather than the response. §6.7 reads consistently with it ("the page shows the
older `ts` and the age indicator counts up"), but on a 6 s poll the difference is 6 seconds of the
age indicator and §4 does not say. One clause in §4's `ts` row.

### S18 — the 401 body

§4 and §5 fix the status and nothing else. Step 6 sends **no body**. §5.2's "Session expired — sign
in again" is driven by the client knowing it arrived at `/login` from an expired session, so nothing
appears to need a body — but if step 7 or 8 wants the server to distinguish *expired* from *never
authenticated*, it has nothing to read, and that should be decided in the spec rather than at the
first place someone wants it.

### Chosen, not specified — each recorded here so a later step need not re-derive it

| choice | why |
|---|---|
| `Cache-Control: no-store` on 200 and 401 | §4 samples per request and §6.7 polls; an intermediary or heuristic browser cache holding a telemetry response would freeze the dashboard on a stale snapshot while the age indicator kept counting |
| `errors[]` in the snapshot's own field order | §4 fixes none; §6.5 matches by `source`. Stable and needs no rule |
| One `TelemetrySource` per process, built at module load | the 2 s cache and the carried counters are only meaningful if every request meets the same one. Constructing one samples nothing |
| `handleTelemetry` split out of `route.ts` | a `route.ts` may only export what Next recognises |
| The assembler propagates a rejection rather than inventing a snapshot | a bug in the assembler is not "a failed reading"; invariant 5's 500 prohibition is about readings, and there is no `ErrorSource` for "we crashed". The cache **evicts** a rejected entry so the next request retries |

### Two things for other steps

- **⚠ `lib/collectors/deltas.ts`'s `DeltaSample.atMs` doc comment now under-describes the field.**
  It says "`Date.now()` at the moment the counters were read"; step 6 passes **`performance.now()`**,
  which is what HANDOVER §9's "`netRatesBetween` and a monotonic `nowMs`" asked step 6 to resolve.
  The field never leaves the process and is only ever compared with itself, so the change is safe —
  but the comment should be corrected. **Not edited here**: `deltas.ts` is step 3's file and outside
  this step's scope. Flagged for reconciliation; the call site in `snapshot.ts` carries the same note.
- **Step 11's `.dockerignore` should exclude `*.test.ts`.** `app/api/telemetry/route.test.ts` is
  colocated with the route, which is the Next convention and keeps the alias exercised from `app/`.
  Nothing imports it so it is not traced into `.next/standalone` — but `next build` runs TypeScript
  over everything in `tsconfig.json`'s `include`, so a build context that carries the file also
  needs `vitest` resolvable. Excluding `*.test.ts` from the image context settles both, and is the
  reason to do it rather than tidiness.
- **The 2 s cache and `previous` are per **process**.** `node .next/standalone/server.js` is a single
  process today, so there is one of each. If step 11 or 12 ever runs Next with workers, each worker
  gets its own cache and its own `previous` — N samples per poll instead of one, and a first-sample
  `—` on every worker rotation. Worth one line in the deployment notes.
- **⚠ CORRECTED IN RECONCILIATION (F2, M3).** The decision below — to leave the timer guard
  scoped to five hard-coded files — did not survive. Three measured evasions: an aliased
  `globalThis.setInterval`, a warm-up queued as a **microtask** (which also fooled the behavioural
  test, because it read `spy.calls` synchronously), and a literal `setInterval(` in a **new file**
  under `lib/telemetry/`, which passed 71 of 71. The text rule now walks the tree over
  `lib/collectors/`, `lib/telemetry/` and `app/api/` in `lib/guardrails.test.ts`; the property
  itself is carried by two behavioural tests in `source.test.ts`, because `setInterval` is a global
  and no text rule over a global can be sound. Step 8's client timers stay out of scope, by name.
- **The `setTimeout` guardrail in `lib/guardrails.test.ts` scans `lib/collectors/` only**, and was
  deliberately **not** widened: step 8's client polling and backoff are the next timers, and whether
  they route through `boundedTimeoutMs` is step 8's decision to take with its own tests. Step 6 adds
  no timer at all, and asserts that fact over its own five files (*⚠ nothing in the telemetry route
  schedules a timer or an interval* — `setTimeout(`, `setInterval(`, `setImmediate(`,
  `queueMicrotask(`).

### Untouched from HANDOVER §8

**S11/G5** (the em dash with no `errors[]` entry when a coloured neighbour explains it) and **S15**
(whether a `NoSuchUnit` entry persists) are rendering and collector questions; step 6 neither needs
nor answers them. The assembled `errors[]` carries whatever the collectors produced, unfiltered —
which is the behaviour both gaps are about.
