# Step 6 — `GET /api/telemetry` — reconciliation

**Green.** `pnpm verify` → **31 files, 1351 tests, Type Errors no errors, exit=0**. `pnpm build`
→ exit 0, route table still `ƒ /api/telemetry`, `tsconfig.json` byte-identical
(`md5 8b6e358b0e19ad663d554dc8310c6da0`). All five harnesses re-run serialised, every mutation
biting, every ledger clean — **366 mutations** in total, 15 of them new here and 2 added to step
4's harness. No dependency added (invariant 6). Nothing outside `dashboard/` touched; `SPEC.md`,
`MOCK.html` and `PLAN.md` unedited.

The review's MUST list is done (M1–M10) and its SHOULD list is done except **S7**, which is
declined with an argument (§4.3). Its two rejections (F9's behaviour change, F10) stand.

---

## 1. What changed, and why

### 1.1 M1 — §4's two halves, and the order the review's sketch got wrong

Two new modules, composed in `source.ts` where the cross-poll state already lives.

| file | lines | what it is |
|---|---|---|
| `lib/telemetry/gate.ts` | 125 | `oneAtATime(collectors)` — at most one outstanding call **per collector**. No timer |
| `lib/telemetry/ceiling.ts` | 90 | `withHostCeiling(collectors, ms)` — a 6 s `deadline()` on `collectHost` **alone** |

`snapshot.ts` is **unchanged**. Both rejections land in its existing `attempt(run, onThrow)` and
produce that collector's own "could not report" collection, so there are **no new fallbacks and
no nineteenth `ErrorSource`** — which is what makes the fix small, and is the review's §2.4.

**⚠ The one place I deviated from the review, and it is load-bearing.** §2.6 sketches
`oneAtATime(withHostCeiling(c))` — the gate **outside** the ceiling. That is backwards, and it
destroys the property the pair exists for. With the gate outside, the slot is released when the
ceiling's race settles at 6 s, **not** when the underlying read returns — so the next poll issues
a second call into the same wedged source, and the leak the review describes in §2.1 (one more
blocked worker per poll, for as long as the container runs) is reintroduced by the very
composition meant to prevent it. Shipped as `withHostCeiling(oneAtATime(collectors), ms)`, with
the argument written at both ends (`gate.ts`'s `gated` doc, `source.ts`'s module doc) and pinned
by mutation **`P5`**, which is the *only* thing in the project that tells the two orders apart:
under it, two tests go red and the other 1349 stay green.

Behaviour, end to end, from `source.test.ts`:

| poll | what happens | what the client gets |
|---|---|---|
| 1 | `collectHost` never returns; ceiling fires at its bound | 200, `host` all `null`, **nine** `errors[]` entries naming the budget, the other five collections intact |
| 2 | the gate finds the call still outstanding and issues nothing | 200, same nine entries, message *"the previous call has not returned"*; `collectGpus` has been called twice, `collectHost` once |
| 3 (after it answers) | the slot released itself when the underlying call settled | 200, `hostname: 'ai-server'`, `errors: []` |

`UV_THREADPOOL_SIZE=16` (§2.5) is **step 11's** to put in the `docker run` line; it is margin
behind this rule, not a substitute, and there is nothing for step 6 to do about it.

### 1.2 M2, M3 — the two guards, moved and re-shaped

Both step-6 guards were defeated by the adversarial and both are now in `lib/guardrails.test.ts`,
where `codeOnly()`, `lastArgumentOf()` and the tree walker already live. A new `serverSideFiles()`
walks `lib/collectors/`, `lib/telemetry/` and `app/api/`, excluding tests.

| guard | was | now |
|---|---|---|
| *⚠ the assembler shares no budget across collectors* (renamed from *"imports no bound"*) | one regex over the barrel's brace block | bans `@/lib/collectors/` by **path prefix**, bans namespace imports, keeps the brace-block name check, over comment-blanked source |
| *⚠ every setTimeout under lib/collectors, **lib/telemetry and app/api** is bounded* | `lib/collectors/` only | the three server-side directories, by walking |
| *⚠ nothing in the server process schedules a repeating or immediate timer* (new) | a substring scan over five hard-coded paths in `source.test.ts` | tree walk, plus **two behavioural tests** that carry the actual property |

**The rename matters.** After the ceiling landed, a bound legitimately exists one module away in
`ceiling.ts`, so *"imports no bound"* would have been a name that no longer described its own
subject — the fourth over-claiming name in this step if it had been left.

**And the split between text and behaviour is the ruling I took from the review, not a
compromise.** `deadline` is *module-local* and proved to be defined exactly once, so a text rule
over it can be made sound. `setInterval` is a **global**, and `globalThis.setInterval`, a
destructured alias and a computed property are three spellings with no last one — so the text rule
there is explicitly a *necessary* condition and the property is carried by:

- *⚠ constructing a source schedules no work — no timer, no interval, no microtask*: fake timers,
  `advanceTimersByTimeAsync(60_000)`, every call count still 0. It drains microtasks between
  timers, which is what fixes the measured evasion (the old test read `spy.calls` **synchronously**
  after construction, before a queued microtask had run).
- *⚠ importing the route's modules creates no timer at module load*: spies on the global
  schedulers plus a `process.getActiveResourcesInfo()` delta across a dynamic `import('./handler')`.
  Fake timers cannot reach this one; it is where `productionTelemetryDeps` is built.

Verified by hand before the harness was written: the aliased-interval and microtask evasions each
redden **both** behavioural tests, the new-file `setInterval` reddens the text rule, and the deep
import specifier reddens the assembler guard.

### 1.3 M4, M5, S2 — the three small ones

- **M4 (F4).** `HOST_SOURCES` is asserted against a **literal** nine-name array, as its two sibling
  tests already were. Comparing the implementation with itself pinned the count and nothing else.
- **M5 (F6).** `handler.ts` gained `authorized(check, request)` — a `try/catch` that denies — and
  §5's new paragraph is quoted at it. Two tests: a check that throws and one that rejects, both
  **401, no body, source never reached**. ⚠ This had a second-order effect worth reading: it made
  mutation `N2` (`export const GET = handleTelemetry`) stop biting, because the aliased handler now
  throws on `deps.authorize === undefined` and the new `catch` answers 401 *for the wrong reason*.
  The route test was strengthened to pass a context **shaped like `TelemetryHandlerDeps`** that
  would authorise; the wrapper ignores it and refuses, an alias would take it and serve. The
  harness found this, which is the "DID NOT BITE means a weak test" rule paying for itself.
- **S2 (F7).** One depth-independent assertion: **the key `errors` occurs exactly once in the
  serialised snapshot, at the root**. It walks the parsed wire object and collects paths. The
  two-deep census keeps its job and its doc now **names its depth**, so a later step does not
  believe it covers `storage.root` or `host`.

### 1.4 M6 — the stale clock comments

`DeltaSample.atMs` said *"`Date.now()` at the moment the counters were read"* — wrong in **both**
halves — and `CollectHostOptions.nowMs` said *"`Date.now()` at the top of the poll"* — wrong in
one. Both now say `performance.now()`, stamped at the top of the poll before any read is issued,
and both point at each other. `deltas.ts` also gained the sentence it should always have owned:
**`atMs` and `net` are one pair**, because `netRatesBetween` divides by the difference of two
`atMs` and `cpuPctBetween` never reads the field — which is the invariant `mergePrevious` rests on.
No harness anchors on either line (checked before and re-run after: steps 2, 3, 4 and 5 all green).

### 1.5 M7, M8 — corrections to the earlier notes

Recorded **in place, marked, and not rewritten**, so the record still shows what was believed:

- `build.md` §1 — the three `force-dynamic` claims (F5). Measured: `dynamic = 'auto'` still builds
  `ƒ /api/telemetry`, so the build output observes Next's default and `N1` is a **second**
  behaviour-preserving mutation. The export stays; the ⚠ test is renamed to *⚠ the route declares
  `dynamic = force-dynamic`*, which is what it checks.
- `build.md` §4 and §7 — the two guards, corrected to point at their new homes and shapes.
- `regressions.py`'s docstring — "the only behaviour-preserving mutation" → one of two, with the
  reason.
- `adversarial.md` F3 path 2 — **"six threadpool threads in one poll" is wrong; it is one.**
  `cooling.ts` reads sequentially and its own module doc gives this exact reason. An unresponsive
  EC saturates the default pool in **four polls (~20 s)**, not one. The finding is unchanged.

---

## 2. Every finding, with its disposition

### 2.1 The adversarial's ten

| # | Sev | Disposition |
|---|---|---|
| **F1** | HIGH | **Fixed.** Deep specifiers and namespace imports banned by path prefix; guard moved and renamed. Mutations `A9` (barrel form) and step 4's `T68` (deep-specifier form) |
| **F2** | HIGH | **Fixed, both halves.** Text rule now walks `lib/collectors/` + `lib/telemetry/` + `app/api/`; two behavioural tests carry the property; the existing test's synchronous read fixed. Mutations `R7`, `R11`, `R12`, `R13`, step 4's `T67` |
| **F3** | HIGH | **Fixed as M1** — the ceiling and the outstanding-call rule, shipped together. §4 states both; the code implements both; `P5` pins the composition order the review's own sketch got backwards |
| **F4** | MED | **Fixed.** Literal nine-name assertion. Mutation `A16` |
| **F5** | MED | **Claims corrected, export kept.** Test renamed. The Cache Components question is recorded for step 11 |
| **F6** | MED | **Fixed.** `try/catch` at the seam, denying; two tests; mutation `H7`. §5 now requires it |
| **F7** | MED-LOW | **Half taken** (the `errors`-occurs-once assertion + the depth note), **half rejected** (a deeper or recursive census, which would grow with the contract) |
| **F8** | LOW | **Mutation taken, no behaviour change.** `R14` replaces `performance.now()` with `Date.now()` in `systemClock`; it is caught by a new test, *⚠ the monotonic clock is not the wall clock*, which tells them apart by magnitude |
| **F9** | LOW | **Rejected as a behaviour change; taken as one line** on `InFlightCacheOptions.sample` saying it must be `async`, and why `get()` is deliberately not |
| **F10** | LOW | **Rejected.** The decision stands and is recorded below (§5) as governing the returning-garbage case too |

Also recorded by the adversarial and acted on: **`route.test.ts`'s export census** is still narrower
than its name (`export { X }`, `export default`, `export let/var` unmatched) — left, and noted for a
later step; **`SERVING_SOURCES = ['llama-env']`** still tells the right story before discovery and
the wrong one during a probe — left as the review ruled (cosmetic; no better `ErrorSource` exists).

### 2.2 The build's own three

| # | Disposition |
|---|---|
| **S16** | **Closed by §4**, in the form the review argued for and the adversarial's measurements forced: option (a) — "no bound is needed, `collectHost` is exempt under O17" — is dead, because the wedge does not need procfs to block, only four busy pool workers. The spec now carries the ceiling, the outstanding-call rule, "neither half ships without the other", and the §3.1 accumulation sentence. Implemented |
| **S17** | **Closed by §4's `ts` clause.** `ts` is the instant the poll began. The build's *justification* was approximate and the spec took the better one: start-stamping can only over-state age, and under-stating it is the forbidden direction on this dashboard |
| **S18** | **Closed by §5**, together with F6: a check that cannot reach a verdict is 401, never 500, and carries no body |

### 2.3 The review's own findings

| # | Disposition |
|---|---|
| **§6.1** — a 1 s cadence receives the same snapshot two or three times | **Closed in the spec** (§4's amended cache sentence, §6.7's `ts`-dedupe bullet). Nothing for step 6 to build; **step 8 must key its ring on `ts`** and this is carried into HANDOVER as the single most likely thing for step 8 to get wrong |
| **§6.2** — §3.1's accumulation is not closed by the cache | **Fixed by the gate**, which is what makes §3.1's sentence true. `gate.ts`'s module doc traces it |
| **§6.3** — the cache is an accidental fail-stop, and a ceiling removes it | **Taken as the reason the two halves are inseparable**; it is why `ceiling.ts` refuses to be described without the gate |
| **§6.4** — four modules is weight, not ceremony | Agreed; unchanged. See §4.3 for the one criticism it made |
| **§6.5** — the `(atMs, net)` pairing invariant | **Option (a) taken**: `deltas.ts` now states the pairing, and the code is left alone. Option (b) — expressing the pair as one choice — was declined: it would touch green, tested code for a property that already holds, and `R3` already reddens the mistake |
| **§6.6** — step 7 can replace the 401 cleanly, with F6 as the blocker | **Blocker removed.** `SessionCheck` is deliberately *not* widened to carry *why* |
| **§6.7** — the export census; `SERVING_SOURCES`'s message | Both left, both recorded |

### 2.4 Explicitly not done

| what | why |
|---|---|
| A nineteenth `ErrorSource` | §4 reports every ceiling and every skip as the collector's own failure. §3.7 stays closed |
| A shared route-level `deadline()` | HANDOVER §6 item 1; F1 is its proof. The guard that forbids it is now sound |
| A deeper or recursive key census | Replaced by the `errors`-occurs-once assertion |
| Deleting `export const dynamic = 'force-dynamic'` | Correct defence against Cache Components and a future default; only the claim was wrong |
| Making `InFlightCache.get()` async, or catching a synchronous `sample` throw | Unreachable while `sample` is `async`; `get()` being synchronous is argued and tested |
| Widening `SessionCheck` to carry *why* | §5 makes "the status is the whole contract" deliberate |
| **S7** — splitting the "could not report" catalogue out of `snapshot.ts` | **Declined, with the review's own condition unmet.** It said "only if M1 lands", because the catalogue would gain a second consumer in the gate's skip path. It did not: both new rejections route through the **existing** `attempt`, so the catalogue still has exactly one consumer and `snapshot.ts` is unchanged at 404 lines. Splitting it now would be a move with no property behind it |

---

## 3. The evidence

### 3.1 `pnpm verify`

```
$ export PATH="$HOME/.local/bin:$PATH"; cd dashboard && pnpm verify
$ tsc --noEmit && vitest run
 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard

 Test Files  31 passed (31)
      Tests  1351 passed (1351)
Type Errors  no errors
   Start at  03:22:13
   Duration  3.11s (tests 69%, transform 18%, import 10%, typecheck 2%, worker 1%)

exit=0
```

`pnpm build` → exit 0:

```
Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/telemetry
```

`tsconfig.json` `md5 8b6e358b0e19ad663d554dc8310c6da0` before and after. `git status --short` is
` M .gitignore` and `?? dashboard/` only.

### 3.2 ⚠ The suite is ALSO green under the pinned Node 24 — and the pin was being shadowed by
HANDOVER's own incantation

This is new, it is measured, and **step 7 needs it**:

```
$ export PATH="$HOME/.local/bin:$PATH"; node -v            → v26.8.1   ($HOME/.hermes/node)
$ node -v            (without that export)                 → v24.16.0  (nvm)
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ pnpm exec node -p "process.version"                      → v24.16.0
$ pnpm verify        → 31 files, 1351 tests, exit=0
```

`$HOME/.local/bin/node` is a symlink to `$HOME/.hermes/node/bin/node` (v26.8.1), so
**`export PATH="$HOME/.local/bin:$PATH"` — the line every phase has run — is itself what selects
Node 26 over the pinned 24.** `pnpm` is corepack's `pnpm.js` under `#!/usr/bin/env node`, so it and
Vitest run on whichever `node` is first. HANDOVER said "this Mac is running v26.8.1 and nothing
stops it"; what stops it is one PATH entry, and Node **24.16.0** — the pinned major — is installed
and runs the whole suite green.

### 3.3 The five harnesses, serialised

```
02-format-severity                     40 mutations   All 40 failed their check                       exit=0
03-collectors-gpu-host                 64 mutations   All 64 failed their check                       exit=0
04-collector-cooling                   76 mutations   ledger 163 red / 66 ⚠ covered                   exit=0
05-collectors-serving-storage-safety  127 mutations   ledger 183 red / 94 ⚠ covered                   exit=0
06-telemetry-route                     59 mutations   ledger  71 red / 53 ⚠ covered                   exit=0
```

**15 new mutations in step 6** (`G1`–`G4` the gate, `P1`–`P5` the ceiling and the composition
order, `A16`, `H7`, `R11`–`R14`), **2 in step 4** (`T67`, `T68` — because `guardrails.test.ts` is in
step 4's `LEDGER_FILES` and ledger ownership follows the file), and **two re-aimed**: `A9` now
points at `guardrails.test.ts` and `H1` at the `authorized(...)` call site.

Two entries stopped biting when the code changed, and both were findings rather than bad mutations:

| | what it turned out to be |
|---|---|
| `H1` | **`ANCHOR NOT FOUND`** — the authorisation call moved behind `authorized(...)`. Re-aimed; still bites |
| `N2` | **`DID NOT BITE`** — a genuinely weak test. The `try/catch` from M5 made the aliased-`GET` bug answer 401 for the wrong reason. Test strengthened to pass an authorising context |

One ⚠ test was reported inert on the first run — *⚠ the ceiling leaves no timer behind once the
call has settled*. It is not inert: the plausible wrong implementation is a hand-rolled race that
never clears its timer, which is exactly what `P4` writes, so `P4` now checks `ceiling.test.ts` as
well as the guardrail. The ⚠ was kept rather than dropped because the wrong version is the fifth
hand-rolled bound this tree has attracted.

### 3.4 Evasions re-run against the fixed guards

Each applied, measured, reverted, and the file byte-compared afterwards:

| evasion (all were green before) | now |
|---|---|
| `import { deadline } from '@/lib/collectors/deadline'` + a shared budget | **red** — *⚠ the assembler shares no budget across collectors* |
| a literal `setInterval(` in a new `lib/telemetry/` file | **red** — *⚠ nothing in the server process schedules a repeating or immediate timer* |
| `const every = globalThis.setInterval; every(…, 5000)` | **red** — both behavioural tests |
| `void Promise.resolve().then(() => cache.get())` | **red** — both behavioural tests |
| `HOST_SOURCES`'s `'coretemp'` → `'dell-smm'` | **red** — the literal assertion (`A16`) |
| a `SessionCheck` that throws / rejects | **401** — was a rejected handler, i.e. a 500 |

---

## 4. Notes for the owner

### 4.1 New spec gaps — none blocking, two worth a sentence

**⚠ S19 — a skipped collector and a failed one are indistinguishable to §6.5's reader.** Under §4's
outstanding-call rule the entry reads *"collectGpus failed before it could report a reading: the
previous call has not returned"*, which is honest, but §6.5 governs how the UI **renders** an
`errors[]` entry and treats all of them alike. A collector that is being *skipped* is arguably a
different banner sentence from one that *answered badly* — the first says "this reading is stale
because the source is wedged", the second "this reading failed". Steps 9/10 will have to choose,
and the spec currently gives them one bucket. One sentence in §6.5 would settle it; nothing is
blocked meanwhile, because the message text carries the distinction even if the rendering does not.

**⚠ S20 — §4's ceiling is stated for `collectHost` because it is the only unbounded collector
today; the spec does not say what happens if that stops being true.** If a later step adds a
collector without a budget, the rule "five carry their own, one has a ceiling" reads as a fact
about the current six rather than as a rule about new ones. The rule I would write is *"every
collector either carries its own monotonic budget or is given a ceiling at the assembly, and no
collector with per-subject verdicts may be given a ceiling"* — but that is a spec sentence, not
mine to add.

**Not a gap, but the one thing I could not verify:** whether `export const dynamic` is honoured
with **Cache Components** enabled. Next 16's docs put `dynamic` in a guide that opens *"This guide
assumes you are not using Cache Components"*, and that is precisely the configuration where the
prerendering hazard is real. Step 11's question before it ever turns the flag on.

### 4.2 Carried forward unchanged

**S11/G5** is narrowed, not closed, and is now HANDOVER §8's only open row: §6.5's exception
requires the neighbour to carry a **severity**, and O13 says `unavailable` is not one — so an em
dash on `fan5` with `pwm5Present: true` still owes an entry no collector files. Steps 9/10.
**S14 and S15 are CLOSED** by the current `SPEC.md`, which I re-read rather than trusted.

### 4.3 One judgement I would flag

`snapshot.ts` is still 404 lines doing two jobs (a catalogue and an assembly), and I declined to
split it (§2.4). If a later step gives the catalogue a second consumer — a UI that wants to render
"this collector could not report" from the same table, say — the split becomes worth it then, on a
real reason rather than on a line count.
