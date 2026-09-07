# Step 6 — `GET /api/telemetry` — adversarial phase

**Baseline reproduced before anything was touched.** `pnpm verify` → **1329 tests, 29 files,
Type Errors no errors, exit=0**. All five harnesses re-run from the same tree, serialised:

```
02-format-severity                     40 mutations   All 40 failed their check    exit=0
03-collectors-gpu-host                 64 mutations   All 64 failed their check    exit=0
04-collector-cooling                   74 mutations   ledger 161 red / 64 ⚠        exit=0
05-collectors-serving-storage-safety  127 mutations   ledger 183 red / 94 ⚠        exit=0
06-telemetry-route                     44 mutations   ledger  49 red / 36 ⚠        exit=0
```

`pnpm build` → exit 0, route table `ƒ /api/telemetry`, `tsconfig.json` still
`md5 8b6e358b0e19ad663d554dc8310c6da0`. Every number in build.md §6 is correct.

**Ten findings, five of them measured breakages.** Three defeat a guard the build relies on; one
is S16 promoted from *"a new failure mode created by the cache"* to *"a failure mode with two
hardware paths documented in this repo's own `CLAUDE.md`"*.

---

## What was edited, and the revert

**Nothing was fixed.** Every experiment was applied, run, and restored in the same command.

| File | What was done | Restored |
|---|---|---|
| `lib/telemetry/snapshot.ts` | 3 mutations (A9 as shipped; A9 via a deeper import specifier; `HOST_SOURCES` membership) | driver asserts `read_text() == original` after each |
| `lib/telemetry/source.ts` | 3 mutations (aliased `setInterval`; microtask warm-up; a `keepWarm` import) | byte-compared against a saved copy |
| `app/api/telemetry/route.ts` | 2 mutations (`dynamic: 'auto'`; the export deleted) | byte-compared against a saved copy |
| `lib/telemetry/zzz-adv-probe{,2,3,4}.test.ts`, `lib/telemetry/zzz-warmup.ts` | created as probes | deleted |

After the last experiment: `pnpm verify` → **1329 tests, exit=0**; `find` for stray probe files
returns only the five steps' own `adversarial.md`; `grep` confirms `'coretemp'` is back at
`snapshot.ts:207`, `force-dynamic` is back at `route.ts:25`, and `source.ts` contains no
`setInterval` and no `globalThis`. `pnpm build` regenerated `.next/` (which already existed) and
left `tsconfig.json` byte-identical.

---

# CONFIRMED BY EXECUTION

## F1 — HIGH. The one guard that catches HANDOVER's "single most important" mistake is defeated by changing an import specifier

`⚠ the assembler imports no bound and opens no budget of its own` reads exactly one thing:

```ts
const imported = /import \{([^}]*)\} from '@\/lib\/collectors';/.exec(src)?.[1] ?? '';
```

**Measured, both against all five step-6 test files plus `pnpm typecheck`:**

| mutation | result |
|---|---|
| `A9` exactly as shipped in `regressions.py` | vitest exit=1, **1 failed / 59 passed**, the red one is the structural guard. typecheck clean |
| the identical mistake, `import { deadline } from '@/lib/collectors/deadline';` | vitest exit=0, **60 passed / 0 failed**, typecheck clean |

The first row *verifies build.md's claim* — the guard is load-bearing, and A9 is behaviour-preserving
across 59 tests. (build.md's "22 behavioural tests" is `snapshot.test.ts`'s own count; 22 + 1 = its 23.)

The second row is the finding. `@/lib/collectors/deadline` is a real module and `deadline` is
exported from it, so the deeper specifier is not a contrivance — it is what an editor's
auto-import offers when the barrel is not already open in the file.

**Concrete failure scenario.** `const within = deadline(6000, 6000)` wrapping the six collectors.
On the poll §6.7 explicitly blesses — `collectServing` taking 2 s discovery + 4 s probe = 6 s —
the shared budget expires while `collectGpus` is still reading, `collectGpus` rejects with
`timed out after 6000 ms`, `attempt` catches it, and the snapshot ships **`gpus: null` plus an
`nvidia-smi` entry** for two cards that were answering normally. §6.7: *"a verdict of failure …
may be minted only from an answer, or from a bound that applied to that subject **and to nothing
else**."* Both GPU panels go blank because `llama-server` was slow. This is HANDOVER §6 item 1
verbatim, and nothing in the tree sees it.

**Direction (not a fix, for the reconciliation to judge).** Scan the whole file for
`\bdeadline\s*\(`, `\bboundedReader\s*\(`, `\bboundedTimeoutMs\s*\(` and for *any* import whose
specifier begins `@/lib/collectors`, rather than one specifier's brace block. `guardrails.test.ts`
already blanks comments and extracts arguments paren-balanced for the `lib/collectors/` rule
(HANDOVER §5.3's own practical note), so the machinery exists.

---

## F2 — HIGH. §4's "no work with no clients" is guarded by a substring, and three plausible spellings evade it

The guard is `text.includes('setTimeout(' | 'setInterval(' | 'setImmediate(' | 'queueMicrotask(')`
over a **hard-coded five-path list**. Three measured evasions, each run against all five step-6
files (and the third also against `lib/guardrails.test.ts`):

| # | edit | result |
|---|---|---|
| (a) | in `source.ts`: `const every = globalThis.setInterval;` then `every(() => { void cache.get(); }, 5000).unref();` | **60 passed, 0 failed**, typecheck clean |
| (b) | in `createTelemetrySource`: `void Promise.resolve().then(() => cache.get());` | **60 passed, 0 failed**, typecheck clean |
| (c) | a new file `lib/telemetry/zzz-warmup.ts` containing a literal `setInterval(…, 5000).unref()`, imported and called by `source.ts` | **71 passed, 0 failed** across the five files **plus `lib/guardrails.test.ts`** |

(a) and (c) are the same wrong implementation as mutation `R7`, which the harness proves *does*
bite when spelled `setInterval(` in one of the five listed files. So the property is guarded only
against one spelling in one file set.

(c) is the cheapest to close and the most likely to happen: `guardrails.test.ts` has a
`sourceFiles()` walker that already covers the whole project, and its own `setTimeout` rule
deliberately scans `lib/collectors/` only — so **no test in the project looks at a new file under
`lib/telemetry/` or `app/`**, which is precisely where step 8's polling and backoff will land.

(b) is the interesting one, because it defeats the *behavioural* test too. `⚠ constructing a
source runs no collector until a snapshot is asked for` reads `spy.calls` **synchronously** after
`createTelemetrySource` returns, and a microtask queued during construction has not run yet; by
the time the test `await`s `snapshot()`, the joined counts are `1` either way. So the test passes
while the source samples the box at construction — and `productionTelemetryDeps` is constructed
at **module load of `handler.ts`**, i.e. at server start.

**Concrete failure scenario.** With (a) or (c): the container forks `nvidia-smi`, opens two D-Bus
connections and probes both `llama-server` `/health` + `/v1/models` endpoints **every five seconds
for as long as it runs, with no browser open**. §4: *"With no clients connected the container does
no work at all — it must never itself become load on a box whose thermal margin is the thing being
watched."* With (b): the same six collectors run once at server start, before any request.

**Direction.** A behavioural test catches all three spellings at once and does not care how the
timer is written: `vi.useFakeTimers()`, construct a source with spy collectors, advance 60 000 ms,
assert every call count is still 0. Pair it with widening the text guard to walk `lib/telemetry/`
and `app/` rather than naming five files. Note that (b) additionally argues the *existing*
behavioural test should assert after `await Promise.resolve()`, not only synchronously.

---

## F3 — HIGH. S16 is real, its wedge is permanent, and it has two hardware paths on this box

### The wedge, end to end (probe `zzz-adv-probe4.test.ts`, all three green)

| probe | setup | result |
|---|---|---|
| W1 | the **real** `collectHost({ nowMs, io })` with an `io` whose `readFile`/`readDir` never settle | **never settles** (raced against 300 ms) |
| W2 | the **real** `collectCooling({ io, timeoutMs: 200 })` with the same `io` | **settles**, as its budget requires |
| W3 | the real `createTelemetrySource` + the real `handleTelemetry`, `host` wrapped to use that `io` | first request never settles; **720 further requests** at a simulated 5 s cadence over a simulated hour **all join the same pending promise and none answers** |

W1/W2 together confirm the build's reasoning that `collectHost` is the *unique* candidate: it is
the only collector exempted from a bound by O17. W3 confirms the consequence the build raised —
`GET /api/telemetry` is dead until the container restarts.

### Reachability — the part build.md left as a question, now answered

The build asks whether a wedged `/proc` read is reachable "in practice". Measured on this machine
(Node v26.8.1, default `UV_THREADPOOL_SIZE=4`), with N FIFOs opened concurrently by
`fs.promises.readFile` and then one ordinary `readFile` issued 200 ms later:

```
RESULT N=3: plain readFile RESOLVED at 203ms
RESULT N=4: plain readFile STILL BLOCKED after 2503ms
RESULT N=5: plain readFile STILL BLOCKED after 2503ms
```

**Four concurrently-blocked libuv threadpool operations block every subsequent `readFile` in the
process, indefinitely.** `readFile`, `readdir` and `statfs` all use that pool. Two independent
routes to four, both grounded in this repo's own hardware notes:

1. **`statfs` on a hung mount.** `collectStorage` issues two `statfs` per poll against
   `/host/root` and `/host/home` (§2.2's bind mounts). A backing store in D-state — a failing
   NVMe, or `/home` ever moved to a network filesystem — blocks both. **`collectStorage`'s 2 s
   `deadline` rejects the promise but does not free the thread**: `deadline` settles *its*
   promise, `statfs` keeps the worker. Two polls at the 5 s cadence saturate the pool; the third
   poll's `collectHost` never settles and the endpoint is gone.
2. **`dell_smm` and the EC.** ⚠ **CORRECTED IN RECONCILIATION (M8): the number below is wrong —
   it is ONE thread per poll, not six.** `lib/collectors/cooling.ts` reads **sequentially**, and
   its module doc says why in step 4's own words: *"`fs.readFile` runs on libuv's thread pool,
   four threads by default, so eleven concurrent blocked SMM reads would starve every other `fs`
   and DNS operation in the process."* Step 4 already designed against this. So an unresponsive EC
   saturates the pool in **four polls (~20 s)**, not one; `collectStorage`'s two concurrent
   `statfs` do saturate in two polls, as written. The conclusion is unchanged and the finding
   stands. `collectCooling` reads `fan1_input`–`fan5_input` and `pwm5`. On this
   board every one of those is an **SMM BIOS call** — `CLAUDE.md`: *"Dell exposes no
   memory-mapped or port-I/O fan registers … Control goes through SMM BIOS calls."* §3.1 already
   documents the identical class for `nvidia-smi`: *"a wedged NVIDIA driver leaves `nvidia-smi` in
   uninterruptible sleep, where no signal is delivered at all."* An EC that stops answering an SMI
   puts **six** threadpool threads into that state **in one poll**, and its 2 s budget again frees
   only the promise.

A third data point, found by accident: my first probe process **could not be terminated by
`process.exit(0)`** while three threadpool threads sat blocked in `open()`. So the wedge is not
reliably recoverable by a graceful stop either — it needs `SIGKILL`.

### Why this changes the adjudication rather than just supporting it

The build offers the spec two options, (a) "no bound is needed, `collectHost` is exempt under
O17" and (b) "say what an abandoned poll returns". **Option (a) is no longer defensible**, because
the exemption's premise — *"procfs does not block"* — is not the failure mode. `collectHost`'s
reads do not block *on procfs*; they never start, because a *different* collector's abandoned work
has taken the thread pool. O17 exempts `readFile` from carrying a bound; it does not and cannot
exempt it from the pool.

Note also that **O18 and S16 trade against each other**, which the spec sentence should
acknowledge: without the in-flight cache each poll would fork a fresh sample and a later one could
succeed once the pool drained. The cache is right and this is its stated cost.

**Direction.** Whatever the spec says, the cheapest observable mitigation is not a route-level
`deadline()` (which reintroduces F1's shared-budget problem) but the same shape `deadline` already
uses on the promise: a per-*collector* wrapper that settles `collectHost`'s promise with its own
"could not report" collection — which already exists in `snapshot.ts` and already files the right
nine sources. That keeps the bound applying to one subject and to nothing else. It is the
reconciliation's call whether that is in scope; the spec sentence is needed either way.

---

## F4 — MEDIUM. `⚠ a throwing host collector files an entry for each of its nine sources` checks the count, not the names

The body asserts `toEqual([...HOST_SOURCES])` — against the implementation's own constant — plus
`toHaveLength(9)` and `new Set(HOST_SOURCES).size === 9`. Nothing pins *which* nine.

**Measured:** replacing `'coretemp'` with `'dell-smm'` in `HOST_SOURCES` →
**60 passed, 0 failed, typecheck clean** (both are valid `ErrorSource` members).

**Concrete failure scenario.** `collectHost` crashes. `host.cpuTempC` renders `—` with **no entry
behind it**, which §6.5 forbids in as many words (*"that figure shows `—`, its `errors` entry is
available"*), while a `dell-smm` entry appears beside a COOLING panel that read all five channels
perfectly. §6.5's *"match an error to the figure it explains"* is broken in **both** directions at
once, and §3.7's whole reason for eighteen names rather than free text is defeated.

The two sibling tests in the same file do it correctly —
`expect(SAFETY_SOURCES).toEqual(['ufw','dkms','dbus'])` and
`expect(SERVING_SOURCES).toEqual(['llama-env'])`. `HOST_SOURCES` is the one asserted only by
cardinality. This is a name over-claiming a body (HANDOVER §7's do-not-copy item 3), and the ledger
cannot see it: `A11` reddens the test by changing the *length*, so the ⚠ is covered while the
membership half of its name is unchecked.

---

## F5 — MEDIUM. `force-dynamic` is not load-bearing on this toolchain, and the ⚠ test's name claims a consequence the constant does not deliver

**Measured:** with `export const dynamic = 'auto'` — the default — `pnpm build` still prints:

```
└ ƒ /api/telemetry        ƒ  (Dynamic)  server-rendered on demand
```

Next 16.3.4's own bundled documentation
(`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:51`) says why:

> "Route Handlers are **not cached by default**. You can, however, opt into caching for `GET`
> methods… To cache a `GET` method, use a route config option such as
> `export const dynamic = 'force-static'` in your Route Handler file."

(The fully-absent case cannot be measured directly: deleting the export fails `tsc` because
`route.test.ts` imports `dynamic`. `'auto'` is the default and is the decisive comparison.)

Three consequences:

1. **`N1` is a behaviour-preserving mutation.** It reddens only because a test asserts the literal
   string. That is exactly the `A9` shape, and `regressions.py`'s own docstring says *"Note the
   shape of `A9`. It is the **only** mutation here that is behaviour-preserving"* — which is now
   wrong by one.
2. **build.md's evidence sentence does not support its claim.** *"`pnpm build` now prints
   `ƒ /api/telemetry`, which is the observable form of the same fact"* — the same line appears with
   `auto`, so it observes Next's default, not the export.
3. **The ⚠ test name over-claims.** *"the route is forced dynamic **so the snapshot is never
   prerendered**"* names a consequence delivered by the framework default, not by the constant.

**This is not a request to delete the export.** Keeping it is right: it is explicit, and the same
docs say that **with Cache Components enabled** *"`GET` Route Handlers … can be prerendered when
they don't access uncached or runtime data"* — the exact hazard build.md describes. What should
change is the claim: record `force-dynamic` as defence against a future default and against
`cacheComponents`, not as the thing preventing prerendering today.

⚠ **And there is a live gap underneath it.** `dynamic` is documented in
`02-guides/caching-without-cache-components.md`, which opens *"This guide assumes you are **not**
using Cache Components"*. So in the one configuration where the hazard is real, this lever's status
is **unverified**. That is a sentence step 11 needs before it ever considers `cacheComponents`.

---

## F6 — MEDIUM. A `SessionCheck` that throws is a 500, not a 401, and nothing tests it

**Measured**, through the real `handleTelemetry`:

| deps | result |
|---|---|
| `authorize: () => { throw new Error('malformed cookie') }` | the handler **rejects** |
| `authorize: () => Promise.reject(new Error('crypto failed'))` | the handler **rejects** |

Under Next a rejected route handler is a 500. `handler.test.ts` has five `authorize` cases —
`false`, `true`, an async `true`, the shipped default, and one that records its argument — and
none throws.

**Why this is step 6's, not step 7's.** Step 6 owns the seam and its ordering, and build.md §5
argues at length for the *direction* of the default. The direction of the *error* is the same
question and is not answered. Step 7 will implement `authorize` as cookie read → base64/JSON
decode → HMAC verify against `SESSION_SECRET`. Every one of those throws on malformed input, and a
malformed cookie is the ordinary way a tampered or truncated session arrives.

**Concrete failure scenario.** A user's cookie is truncated by a proxy. `authorize` throws.
`/api/telemetry` answers 500. §5.2 says *"every `/api/*` returns 401, and the client routes to
`/login` with the expired message"* — but §6.7's **failed-poll** path runs instead: header dot
grey, age counting up, traces frozen, exponential backoff to 30 s, a banner naming a server
failure. The user is never sent to `/login` and sits on a dashboard that will never recover until
they clear the cookie by hand. The 401 fails closed today; the *throw* fails **open into the wrong
UI state**.

**Direction.** Either wrap the check (`try { … } catch { /* deny */ }`), which is this seam's own
stated principle applied to its own failure, or state in `SessionCheck`'s contract that it must not
throw. Either way it needs a test now, while it costs one.

---

## F7 — MEDIUM-LOW. The key census is exactly two objects deep; `errors` one level deeper reaches the wire

Asked to find a shape that defeats **both** censuses. Five shapes measured against the real
assembly, using the same three assertions the shipped tests make (object keys, `'errors' in …`, and
the same keys after `JSON.stringify`→`JSON.parse`):

| shape | object census | wire census | reaches the client? |
|---|---|---|---|
| `errors` on a **`Filesystem`** (one level deeper) | **passes** | **passes** | **yes — `storage.root.errors`** |
| `toJSON` on an **un-censused sub-object** (`Host`) | **passes** | **passes** | **yes — rewrites `snapshot.host` wholesale** |
| symbol key on `filesystems` | passes | passes | no — `JSON.stringify` drops it |
| getter on `filesystems` | **caught** | — | no |
| prototype property on `filesystems` | passes | passes | no — spread copies own enumerables only |
| `toJSON` on `filesystems` itself | **caught** (becomes an own key) | — | no |

The first two are real. The `Filesystem` case is exactly the mistake the census exists to catch,
one level down: `{ usedGB, totalGB, errors: [...] }` is what a spread-built `filesystemFrom` would
produce, and it ships the collector's entries inside `storage.root` while the top-level `errors[]`
already carries them.

The `toJSON` case is the census's scope showing: it covers `storage`, `safety` and the top level.
`snapshot.host`, `snapshot.cooling`, `snapshot.gpus[]` and `snapshot.serving[]` are passed through
**by reference** (`expect(snapshot.host).toBe(everythingZero.host)`) and are never censused at any
depth. Measured: a `Host` carrying `toJSON: () => ({ errors: [...], cpuPct: 999 })` passes both
censuses and arrives on the wire as exactly `{cpuPct: 999, errors: [...]}`.

Severity is bounded — all five need a cast or a non-literal to compile, so the type system is doing
most of the work. But the census exists *because* step 5 measured that the type system did **not**
catch the flat spread, so "the types would stop it" is the argument that already failed here once.

---

## F8 — LOW (confirmed, no live defect). A backward clock holds a stale snapshot for the length of the step

**Measured:** with an injected clock that steps back 60 s, `nowMs - held.startedMs` is negative,
`negative < ttlMs` is true, and the cache serves the same snapshot for the whole minute — three
`get()`s, one sample.

`cache.ts` documents this precisely and mitigates it by using `performance.now()`, which is
monotonic. **There is no live defect.** What there is: the property is asserted nowhere.
`source.test.ts`'s *"the system clock is monotonic"* checks `b >= a` on two adjacent readings —
which a `Date.now()`-based `monotonicMs` also passes on any run where the wall clock does not step.
Mutation `C6` covers the *cache* level (`sample(Date.now())`); `source.ts`'s
`monotonicMs: () => performance.now()` has no equivalent. One `R`-series mutation replacing it with
`Date.now()` would tell you whether anything notices.

---

## F9 — LOW (confirmed, unreachable in production). A synchronously-throwing sample escapes `get()`'s declared type

**Measured:** `createInFlightCache({ sample: () => { throw new Error(…) } }).get()` throws
**synchronously**, though `InFlightCache<T>.get()` is declared `(): Promise<T>`; the stale `entry`
is also left in place rather than replaced.

Unreachable today — `source.ts`'s `sample` is `async`, so it can only reject. Recorded because the
file argues at length that `get` is deliberately **not** `async` ("two callers in the same tick
cannot both find the cache empty"), and *not* being `async` is exactly what lets a synchronous
throw escape the promise contract. A one-line note at the interface, or wrapping the call, closes
it; it is not worth a behaviour change on its own.

---

## F10 — LOW (confirmed, types prevent it). A collector that returns `undefined` is a 500

**Measured:** `storage: (async () => undefined) as unknown as typeof collectStorage` makes
`sampleSnapshot` **reject** — `attempt()` guards the *call*, and the destructuring after
`Promise.all` (`storage.filesystems`) is unguarded.

I agree with build.md's decision that *"the assembler propagates a rejection rather than inventing
a snapshot"*, and there is no `ErrorSource` for "we crashed". The note is only that the decision is
written for the *throwing* case and silently also governs the *returning-garbage* case, which is
one line in §7's table. `JSON.stringify` throwing (a BigInt or a cycle reaching the snapshot) is
the same class at the handler.

---

# ATTACKED AND FOUND SOUND

Listed with the evidence, because a clean result is only useful if the attack is stated.

**The in-flight cache.**

- The 13-poll claim reproduced exactly: one call, `new Set(joined).size === 1`. Extended to a
  simulated hour (720 further polls): still one call, still the same promise object.
- **A rejection after the TTL still releases the slot** — measured: reject at t=9000 against
  `ttlMs=2000`, next caller re-samples, `calls === 2`. Not poisoned.
- Every joiner on a rejected sample sees the same rejection. The eviction is identity-checked, and
  I could not construct a case where a late rejection evicts a successor: a successor exists only
  after the entry was already evicted or expired, and the two `flight` objects are distinct.
- **The first call, the exact boundary (`ttlMs-1` vs `ttlMs`), two callers in one tick, and a
  caller arriving between settle and the next poll** are all correct. The boundary is fixtured on
  both sides *and* carries three mutations (`C2`/`C3`/`C4`), which is HANDOVER §5.1 applied
  properly rather than nominally.
- No `unhandledRejection` path: `get()` always returns the derived promise to a caller and
  `handleTelemetry` always awaits it.

**`previous` and the delta arithmetic — the build's sharpest claim, and it holds.**

- **A cache hit does not advance `previous`.** Measured: poll / cache-hit / poll gives
  `seenPrevious === [null, sample1]` and exactly two host calls.
- `/proc/net/dev` succeeding while `/proc/stat` fails: `atMs` advances with `net`, `cpu` is
  retained, and the following poll's `cpuPct` is correct **across the two-poll span** — measured
  50 %, where using the wrong baseline gives 25 %.
- An interface that vanishes and returns with **reset** counters yields exactly one `null` rate
  and heals on the next poll; the retained low counter is replaced rather than kept, so it
  self-heals in one poll and never fabricates a rate. Counter reset between retained samples is
  the same.
- **Three polls where the middle is served from cache**: `nowMs` reaches the collector as
  `[0, 10000]` and the delta is computed across the full 10 s that the counters actually span.
- **The single-writer argument is sound, and for a reason worth writing down.** `source.ts`
  assigns `previous` *before* its async `sample` resolves; the cache flips `flight.inFlight` only
  in the `.then` that runs afterwards. So there is no microtask window in which a second sample
  could start and read a half-written `previous` — the ordering is stronger than "the cache
  serialises samples", which is the argument build.md gives.
- **A rejected assembly does not lose the counters**: the assignment sits after the `await`, so a
  crash leaves the last good sample in place and the cache retries.

**Invariant 5 at the route.** Six collectors throwing one at a time and all six at once; a
collector returning a *rejected promise* rather than throwing; a non-`Error` throw; `throw null`
(→ `unknown failure`, not `[object Object]`); a throw after another collector has already resolved.
All 200, all partial, no successful collection lost, `errors[]` in field order. **No nineteenth
`ErrorSource` is constructible** — `ErrorSource` is type-only with no runtime array, so one cannot
compile. (The one caveat is F4: the *names* in `HOST_SOURCES` are unpinned.)

**Per-request sampling and handles.** `process.getActiveResourcesInfo()` across ten real polls
against the real `DEFAULT_COLLECTORS` with `ttlMs: 0`:

```
start   {"PipeWrap":3,"Timeout":1}          <- vitest's own
poll 0  {"FSReqPromise":1,"PipeWrap":3,"Timeout":1}
…       (identical for polls 1-9 — no accumulation)
settle  {"PipeWrap":3}
```

**No timer, no interval, no accumulating handle from step 6.** The single outstanding
`FSReqPromise` appears for every file-touching collector (host, cooling, serving, storage, safety)
and drains; it is a completed-but-not-yet-reaped request, not an abandoned read.
`createTelemetrySource()` adds nothing to the resource list, confirming *"constructing a source
samples nothing"* by observation and not only by call count.

**The 401.** No route around it found.

- `noSessionVerifierYet` is unconditional; nothing reads a header, a query parameter or a cookie
  before it, because nothing reads them at all.
- `productionTelemetryDeps` is built at module load and samples nothing (measured above).
- Next 16 auto-implements only `OPTIONS` (docs, `route.md:39`) and `OPTIONS` does not call `GET`;
  `HEAD` is **not** auto-implemented, so a `HEAD` with no export is a 405. Neither reaches the
  sampler.
- The ordering is proved by call count, and `⚠ an unauthorised request never reaches the telemetry
  source` does check what it says.

**The ledger and the three guard rules.** All 36 ⚠ tests are covered by at least one mutation, and
`A9`'s red set is exactly the structural guard (verified independently of the harness). Fixture
symmetry is honoured on the one boundary step 6 adds. The gaps found are all in the *third* rule —
which HANDOVER §5.3 states is "a NECESSARY condition only", and F1/F2/F5 are three instances of
that limit rather than three violations of it.

---

# ADJUDICATION — S16, S17, S18, and the `deltas.ts` note

## S16 — **uphold, and option (a) is no longer available**

The gap is real and the build states it correctly. What the measurements change is the menu.
Option (a) — *"the route needs no aggregate bound: every collector settles, and `collectHost`'s
`/proc` and `/sys` reads are exempt under O17"* — rests on *"procfs does not block"*. F3 shows the
wedge does not require procfs to block: it requires **four threadpool workers to be busy**, which
`collectStorage` reaches in two polls against a hung mount and `collectCooling` reaches in one poll
against an unresponsive EC. O17 exempts a read from carrying a bound; it cannot exempt it from the
pool. So the spec needs option (b), or a third: state that `collectHost` is wrapped so that it
settles with its "could not report" collection — which already exists in `snapshot.ts` and already
files the right nine sources, so no nineteenth `ErrorSource` is needed and §6.7's "a bound that
applied to that subject and to nothing else" is satisfied.

Add to the gap, because the spec should say it: **O18 and S16 trade against each other.** Without
the in-flight cache a wedged sample costs one poll; with it, it costs the endpoint. The cache is
still right; the cost belongs in the sentence.

## S17 — **uphold, and the stated justification is approximate**

Start-stamping is the right choice and §6.7 reads consistently with it. But the reason given —
*"`collectHost`'s counters are read then"* — is not quite true. The cache stamps `nowMs` and hands
it to `sampleSnapshot`, which hands it to `collectHost`, which writes it into `sample.atMs`
**before** issuing nine concurrent reads. `atMs` therefore describes the instant the poll began,
not the instant the counters were read. Sub-millisecond on a healthy poll; on a contended pool it
is the whole read latency, and the network rate is then divided by an interval wrong by the
*difference* in read latency between two polls. It does not change the answer — start-stamping is
still right — but the spec clause should read *"`ts` is the instant the poll began"* and say
nothing about when the counters were read.

## S18 — **uphold, unchanged, with one addition**

No body is right for step 6, and the reasoning is sound. Add F6 to the same gap: *"expired vs never
authenticated"* and *"the cookie did not parse"* are the same question asked twice, and step 7
should not answer one without the other.

## The `deltas.ts` doc note — **correct, and there are two more of the same drift**

1. `lib/collectors/deltas.ts:48` — `DeltaSample.atMs`: *"`Date.now()` at the moment the counters
   were read."* **Both halves are now wrong**: it is `performance.now()`, and it is stamped at the
   top of the poll, before the reads. build.md flagged the first half only.
2. `lib/collectors/collect.ts` — `CollectHostOptions.nowMs`: *"`Date.now()` at the top of the
   poll."* Same clock drift, **not flagged by build.md**. (Its "top of the poll" half is accurate,
   and is what shows (1)'s second half to be wrong.)

Both are step 3's files, so "not edited here" is right. The reconciliation should correct **both**,
and HANDOVER §7's rule applies with force: *"`lib/types.ts` describes; it does not direct — a wrong
descriptive comment misinforms."* Two files now describe a clock this project does not use.

---

# Also recorded, lower priority

- **`route.test.ts`'s export census** matches `^export (?:const|function|async function) (\w+)`. It
  misses `export { X }`, `export default`, `export let/var` and `export async function*`. Good
  check, narrower than its name.
- **`SERVING_SOURCES = ['llama-env']`** tells the right story for a crash *before* discovery and
  the wrong one for a crash *during* an instance probe: the enumeration succeeded, but
  `serving: null` plus `llama-env` reports that it did not. build.md's reasoning for the choice is
  sound and there is no better `ErrorSource` — recorded so the reconciliation can decide whether
  the message text should distinguish them. Reasoned, not measured.
- **The cache and `previous` are per process.** build.md records this for step 11. Confirmed that
  `next build` still emits a single `.next/standalone/server.js` and the route table shows one
  dynamic entry, so it is a future risk, not a current one.
- **`⚠ nothing in the telemetry route schedules a timer or an interval`** and **`⚠ the assembler
  imports no bound and opens no budget of its own`** are the two ⚠ names that over-claim (F2c,
  F1); **`⚠ a throwing host collector files an entry for each of its nine sources`** is the third
  (F4); **`⚠ the route is forced dynamic so the snapshot is never prerendered`** is the fourth
  (F5). Four, against the three build.md found and fixed by hand — consistent with HANDOVER §5.2's
  statement that this half is irreducible and has appeared in every step.

---

# Severity summary

| # | Severity | One line | Evidence |
|---|---|---|---|
| F1 | **HIGH** | the shared-budget guard is defeated by a deeper import specifier | 60/60 green under the same mistake |
| F2 | **HIGH** | "no work with no clients" evaded by an aliased timer, a microtask, or a new file | 60/60 and 71/71 green |
| F3 | **HIGH** | S16's wedge is permanent and reachable via threadpool saturation | W1–W3 + N=4 measurement |
| F4 | MEDIUM | `HOST_SOURCES` membership unpinned — wrong nine passes | 60/60 green |
| F5 | MEDIUM | `force-dynamic` is a no-op here; `N1` is behaviour-preserving | `auto` still builds `ƒ` + Next docs |
| F6 | MEDIUM | a throwing `SessionCheck` is a 500, not a 401; untested | handler rejects, measured |
| F7 | MEDIUM-LOW | census is two objects deep; `errors` below that reaches the wire | 2 of 6 shapes defeat both |
| F8 | LOW | backward clock serves stale; mitigated but unasserted | measured, no live defect |
| F9 | LOW | a synchronous throw escapes `get(): Promise<T>` | measured, unreachable today |
| F10 | LOW | a collector returning `undefined` is a 500 | measured, types prevent it |

**Nothing was fixed and no source file was left changed.** Final state: `pnpm verify` → 1329 tests,
29 files, Type Errors no errors, **exit=0**.
