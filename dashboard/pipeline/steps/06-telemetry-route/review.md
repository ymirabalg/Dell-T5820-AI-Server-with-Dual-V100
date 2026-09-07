# Step 6 — `GET /api/telemetry` — review phase

**Baseline verified independently before anything else.** `pnpm verify` → **29 files, 1329 tests,
Type Errors no errors, exit=0**. `lib/telemetry/` contains exactly the eight files the build
shipped; `find` for `zzz*` returns nothing; `git status --short` is ` M ../.gitignore` and
`?? dashboard/` only. The adversarial's revert is clean.

**Nothing was edited. My own experiments were four Node scripts run entirely inside the
scratchpad directory** (`pool.js`, `abort.js` and two FIFO directories, all deleted afterwards).
No project file, test, config or spec was touched, and no `pnpm` command other than `verify` was
run.

**Verdict on the build: sound, and better than it needed to be on the two things it was warned
about.** O18's in-flight join, O16's per-counter retention and O9's single D-Bus read are all
correctly built, correctly argued and — the adversarial checked this harder than I would have —
correctly tested. The four-module split is weight, not ceremony (§7 below). What the build got
wrong is one *omission* it correctly identified and then wrongly resolved (S16 → F3), and four
tests whose names promise more than their bodies deliver.

**Verdict on the adversarial: the strongest of the five so far, and one of its two headline
mechanisms is wrong in a way that matters.** F1–F7 are all real. F3's *conclusion* is right and
its central measurement reproduces exactly on this machine — but its second hardware path
("**six** threadpool threads in one poll") is false, because `cooling.ts` reads sequentially and
says in its own module doc that it does so for precisely this reason. Correct that number before
it propagates; see §2.3.

---

# 1. What I re-derived rather than took on trust

Four measurements, run here, Node v26.8.1, default pool:

| probe | result |
|---|---|
| N concurrently blocked `readFile`s on FIFOs, then a plain `readFile` 200 ms later | N=3 → **RESOLVED at 205 ms**; N=4, 5, 6 → **still blocked at 2.5 s** |
| the same with `UV_THREADPOOL_SIZE=16` | N=6 → **RESOLVED at 206 ms**; N=16 → **still blocked at 2.5 s** |
| four blocked reads, `AbortController.abort()` on all four at t=300 ms, plain `readFile` at t=600 ms | **no abandoned read settled at all** (not even with `AbortError`), and the plain read was **still blocked at 2.5 s** |
| do timers still fire while the pool is starved? | **yes** — the probe's own `setTimeout` fired and `process.kill(SIGKILL)` ran |

Three consequences, and each one decides part of the F3 ruling:

1. **F3's core measurement is real.** Four blocked pool operations kill every subsequent
   `readFile`/`readdir`/`statfs` in the process, indefinitely.
2. **Raising `UV_THREADPOOL_SIZE` moves the threshold and does not remove it.** N ≥ size still
   saturates. It is arithmetic, not a fix.
3. **`AbortSignal` is worse than the adversarial said.** It does not merely fail to free the
   worker — the abandoned read's *own promise never settles*. So there is no "correct" cancellation
   to reach for: **any ceiling must be a `Promise.race` against a timer, never an abort handed into
   a collector.** Write that down before someone spends a day discovering it.
4. Timers are on the event loop, not the pool, so **a ceiling is implementable while the pool is
   starved.** Without this the whole proposal would be circular.

I also confirmed the exposure surface, because the fix's size depends on it: only the `fs` family
touches the pool. `nodeHttp.get` probes `127.0.0.1` by literal IP (`LLAMA_PROBE_HOST`), so no
`getaddrinfo`; D-Bus is a unix socket; `spawn` is not a pool operation. **The pool exposure is
exactly `collectHost` (9 concurrent), `collectCooling` (≤ 11, sequential), `collectStorage` (2
concurrent `statfs`), `collectSafety` and `collectServing` (a few file reads each).**

---

# 2. F3 — the ruling

**Upheld in full, promoted to the step's blocking finding, and the build's option (a) is dead.**
But the adversarial's proposed remedy is also insufficient, and a route ceiling on its own is a
**net harm**. Taking the user's four questions in order.

## 2.1 Is an aggregate route ceiling sufficient? No — and alone it is worse than nothing

A ceiling cannot reclaim a worker (measurement 3 above), so the pool stays exactly as starved as
it was. That is the "merely quieter" half of the question, and it is real. But the honest answer
has a second half the framing misses, and it is the reason I am rejecting the ceiling-only fix:

**Today, the in-flight cache is acting as an accidental fail-stop.** Once `collectHost` fails to
settle, the sample never settles; the cache holds that promise forever; **no further collector
call is ever issued**. Blocked operations freeze at whatever number saturated the pool. The
endpoint is dead — but nothing accumulates, and the box takes no further damage.

**A ceiling removes that back-pressure.** With a ceiling and nothing else, every poll settles,
every poll re-issues, and every poll leaves one more permanently-blocked worker, one more orphaned
`nvidia-smi`, one more abandoned socket — for as long as the container runs, on a box whose
thermal margin is the thing being watched. The ceiling converts a dead endpoint into an unbounded
leak that *looks* healthy.

So: **a ceiling is right for what it reports and wrong for what it costs, and it must not ship
alone.** What it buys is not nothing — it is exactly §6.5's design ("a partial snapshot is the
normal case"), and it is the difference between a dashboard that says *the EC stopped answering*
and one that shows §6.7's grey dot and a banner naming a *server* failure, which is the least
informative possible outcome on the one occasion the machine most needs this dashboard. But it
buys that only if paired with the next item.

## 2.2 Is the real fix to stop issuing reads to a source that has already timed out? Yes — this is the load-bearing half

**Ruled: at most one call per collector may be outstanding at a time.** While one is, a new poll
does not issue a second; it uses that collector's "could not report" collection for this poll.

Why this exact rule rather than a cool-down or a failure-count breaker:

- **It needs no constant and no timer.** No cool-down to tune, no half-open state, nothing to get
  wrong at 3 a.m. It self-heals the instant the underlying call returns.
- **It bounds the damage at one call's worth of workers, permanently**, instead of one more per
  poll. Against the realistic single-source wedge — an EC that stops answering an SMI, a `/home`
  in D-state — that is 1–2 workers out of 4, and every other panel keeps rendering correctly.
- **It is the in-flight join, applied one level down.** The project already has this idea, tested
  and proved by call count; this is the same property per collector instead of per snapshot.
- **It finally closes §3.1's own stated accumulation, which the cache does not** — see §2.5, and
  this is the argument that moves the fix from speculative to presently justified.

**Correction to the adversarial's arithmetic (F3, reachability path 2).** `collectCooling` does
**not** put six threads into uninterruptible sleep in one poll. `lib/collectors/cooling.ts`'s
module doc, written in step 4:

> **The reads are SEQUENTIAL**, unlike `collectHost`'s nine concurrent ones. Two independent
> reasons, either sufficient: `dell-smm-hwmon` serialises every SMM call behind one mutex … and
> `fs.readFile` runs on libuv's thread pool, **four threads by default**, so eleven concurrent
> blocked SMM reads would starve every other `fs` and DNS operation in the process.

Step 4 already knew about the pool and designed against it. An unresponsive EC costs **one** worker
per poll, so the EC path saturates in **four polls (~20 s)**, not one. `collectStorage`'s two
concurrent `statfs` do saturate in two polls, as F3 says. **The conclusion is unchanged and the
number must be corrected**, because a wrong number in a note this project trusts is how the next
step reasons wrongly.

## 2.3 Should `UV_THREADPOOL_SIZE` be raised in the container? Yes — but only as margin behind the rule, and §2.5 must say which it is

Measured (§1): it moves the threshold linearly. **Alone it is a fig leaf** — it turns "dead after
two polls" into "dead after eight". **With the outstanding-call rule it is genuine margin**,
because the rule caps outstanding operations at a number the pool must merely exceed, and the
default of 4 is *below `collectHost`'s own nine concurrent reads on a perfectly healthy poll*.
That last fact is the one that justifies the row on its own merits: the shipped configuration
queues host reads behind each other every single poll.

Recommend **16**, passed as `docker run -e`, with the reason stated in §2.5 so nobody later reads
it as the fix.

## 2.4 What `errors[].source` would a route ceiling name? **None. No nineteenth source, and the build was right to refuse to invent one**

This is the cleanest part of the ruling. **The ceiling must not be a route-level verdict at all.**
A ceiling or a skipped call yields *that collector's own* "could not report" collection — which
`snapshot.ts` already builds, with that collector's own §3.7 sources and a message naming the
bound, exactly as §6.7 requires ("its `errors[]` entry names the budget rather than the subject").
`collectHost` blanked by a ceiling files its nine; a skipped `collectCooling` files `dell-smm`.
§3.7 stays closed. §6.7's *"a bound that applied to that subject and to nothing else"* holds
because the bound is per collector.

**And the implementation needs no new fallbacks either.** `attempt(run, onThrow)` already turns a
rejection into precisely that collection. A gate that rejects with *"the previous call has not
returned"*, and a ceiling that rejects with *"timed out after 6000 ms"*, both land in the existing
path and produce the existing, already-tested shape. That is the whole reason this fix is small.

Two constraints the wording must honour, because both sit within a hair of something §6.5 forbids:

- **The ceiling goes on `collectHost` and nowhere else.** §6.5: *"no collector-wide bound may blank
  a per-instance verdict."* `collectServing` is the collector with per-instance verdicts and it
  already carries its own bounds; a ceiling over it is the forbidden thing. `collectHost` has no
  per-instance verdicts and is the only collector with no budget of its own — which is the build's
  own analysis, and it survives intact.
- **The ceiling must be generous, not tight.** 6 s, equal to the poll's existing blessed worst
  case. A 2 s ceiling would fire during pool contention *caused by another collector* and mint nine
  host failure verdicts from another subject's problem — F1's harm in miniature, and §6.7 forbids
  it in as many words.

## 2.5 The finding neither phase made: **§4's cache does not close §3.1's own accumulation**, and the same rule does

§3.1 says, of a wedged `nvidia-smi`:

> At a 5 s cadence against a wedged driver, every poll would fork another `nvidia-smi` that never
> exits. **§4's cache must therefore hold the in-flight promise** — concurrent and successive
> callers **within the window** join the existing call instead of starting a new one.

Trace it against what was actually built. A wedged `nvidia-smi` does not keep the sample in
flight: `collectGpus` **settles at its own 4 s bound**, so the snapshot settles, so the cache
entry settles. The window is 2 s measured from the start, so at t=4 s the held result is already
stale, and the next poll at t=5 s **forks a second `nvidia-smi`**. The one after that forks a
third. §3.1 states these never exit — *"uninterruptible sleep, where no signal is delivered at
all"* — and with `--pid host` they accumulate in the host's PID namespace, on the box.

So the in-flight cache closes the **concurrent** case (ten tabs, one sample — which is what §4's
own sentence is about) and does **not** close the **successive** case §3.1 raises. That gap has
been latent since step 3, is not hypothetical, and is present in the shipped code today.

**The outstanding-call rule closes it exactly**, and this is what converts the whole fix from
"defence against a hardware failure nobody has seen" to "the thing §3.1 has been asking for since
step 3". It is also why the rule must cover all six collectors and not only the `fs` ones.

## 2.6 Design shape, so the reconciliation does not have to invent one

Two decorators over `SnapshotCollectors`, composed in `source.ts` where the other cross-poll state
already lives. `snapshot.ts` does not change and its structural guard stays true and stays
meaningful.

```
lib/telemetry/gate.ts      oneAtATime(collectors)      — no timer; rejects if a call is outstanding
lib/telemetry/ceiling.ts   withHostCeiling(collectors, ms) — Promise.race against a bounded timer,
                                                             collectHost only
source.ts                  createInFlightCache({ … sample: … oneAtATime(withHostCeiling(c)) … })
```

`gate.ts` is provable against a counter the way `cache.ts` is, with no telemetry in it at all —
the same idiom, for the same reason. `ceiling.ts` is the only new file that touches a bound; it
imports `deadline`/`boundedTimeoutMs` from `@/lib/collectors/deadline`, which is correct and is
**not** a violation of F1's guard, because F1's guard is about the *assembler* sharing one budget
across collectors. Restate that guard's name accordingly (§3.1 below).

**If only one half can be taken, take the gate.** It is presently justified (§2.5), it is the
smaller change, and it needs no ceiling to be correct. The `collectHost` ceiling is the more
speculative half.

---

# 3. Adjudication of the rest

## 3.1 F1 — the import-specifier evasion. **Real. Fixable by text, and this is the case where text guards do work**

Upheld: `import { deadline } from '@/lib/collectors/deadline'` is 60/60 green, typechecks, and is
what an editor's auto-import offers. The failure scenario the adversarial gives is HANDOVER §6
item 1 verbatim.

**Can source-text guards be made robust here? For this property, yes — and the reason it works here
and not in F2 is the whole ruling on the guard class.** The forbidden thing is a call to one of
four *module-local* names, each proved to be defined exactly once, and none of them a global.
There is no way to reach `deadline` in this file except (a) the barrel's brace block, (b) a deeper
`@/lib/collectors/...` specifier, (c) a namespace import (`import * as C` … `C.deadline(…)`), or
(d) hand-rolling a timer. All four are closable:

> Over `snapshot.ts`, with comments blanked: no import specifier begins `@/lib/collectors/`
> (the barrel is the only permitted door and deep imports are banned by **path prefix**, not by
> name); no namespace import of the barrel; the barrel's brace block contains none of `deadline`,
> `boundedTimeoutMs`, `boundedReader`, `MAX_TIMEOUT_MS`; and the code contains no `setTimeout(` /
> `setInterval(`.

`guardrails.test.ts` already has `codeOnly()` and `lastArgumentOf()` for exactly this. **Rename the
test while fixing it**: its property is *"the assembler shares no budget across collectors"*, not
*"the assembler imports no bound"* — and after §2.6 lands, a bound will legitimately exist one
module away.

## 3.2 F2 — "no work with no clients". **Real, all three evasions. Scope is wrong, and the text guard here is unfixable in principle**

Upheld. And the two halves need opposite answers:

**Scope: wrong, and wrong in the way that will actually bite.** A hard-coded five-file list cannot
see a *new file*, and step 8's polling and backoff are the next timers in this project. The rule
must walk the tree, as `guardrails.test.ts`'s own `sourceFiles()` already does. Correct scope:
**`lib/telemetry/**` and `app/api/**`** — everything that runs in the server process on behalf of
a request. Client code under `app/` other than `api/` is explicitly out, because step 8's timers
are legitimate; that boundary must be stated, or step 8 will "fix" the rule by loosening it, which
is the exact analogue of adding a mutation until the ledger goes green.

Note the rule also has to *change shape* once §2.6's ceiling lands: it becomes **"no `setInterval`
or `setImmediate` at all under those directories, and every `setTimeout` delay is a
`boundedTimeoutMs()` result"** — which is `guardrails.test.ts`'s existing `lib/collectors/` rule
with a wider directory list. That unification is a strict improvement and should be made in
`guardrails.test.ts`, not duplicated in `source.test.ts`.

**Mechanism: a text guard on `setInterval` cannot be made sound, and no amount of regex will change
that.** `setInterval` is a *global*. `globalThis.setInterval`, `const {setInterval: every} =
globalThis`, `globalThis['set'+'Interval']` — the spellings are unbounded. This is categorically
different from F1, where the name is module-local and its single definition is itself asserted.

**So F2's property needs a behavioural test, and it can be made sound.** Two tests, because they
catch different things and neither subsumes the other:

1. **Constructed-source work**: `vi.useFakeTimers()`, construct a source with spy collectors,
   advance 60 000 ms, assert every call count is still 0. Spelling-independent; catches (a), (b)
   and (c) at once.
2. **Module-load-time work**: after importing the server modules, assert
   `process.getActiveResourcesInfo()` contains no `Timeout` attributable to us. The adversarial
   already demonstrated this technique against the real collectors; it is the only thing that sees
   a timer created at import rather than at construction, which fake timers cannot reliably reach
   through Vitest's module cache.

**And the existing behavioural test is unsound as written** — F2(b) is right. `expect(spy.calls)`
reads synchronously, and a microtask queued during construction has not run. Fix: assert again
after `await Promise.resolve()`. One line.

One correction to the adversarial's framing: `productionTelemetryDeps` is built at module load of
`handler.ts`, which under Next's lazy route loading is **first request**, not server start. It does
not reduce the severity — an unauthenticated 401 request would trigger it — but the note should be
accurate.

## 3.3 F4 — `HOST_SOURCES` membership unpinned. **Real. Cheapest MUST in the list**

`expect(sourcesOf(snapshot.errors)).toEqual([...HOST_SOURCES])` compares the implementation with
itself. The two sibling tests in the same file do it correctly with literals. Swapping `coretemp`
for `dell-smm` is 60/60 green and breaks §6.5 in **both** directions at once: a `—` with no entry
behind it, and an entry pointing at a panel that read perfectly. Fix is one literal array, and it
is the same shape as the assertions already sitting three lines away.

## 3.4 F5 — `force-dynamic`. **Real. Keep the export, correct three claims**

Confirmed independently in the bundled docs (`15-route-handlers.md:51`): *"Route Handlers are not
cached by default … To cache a `GET` method, use … `export const dynamic = 'force-static'`."* So
`ƒ /api/telemetry` observes Next's default, not the constant, and build.md's evidence sentence does
not support its claim. The adversarial's own recommendation is right and I endorse it: **do not
delete the export** — it is explicit, and under Cache Components the hazard is real and this
lever's status there is unverified. Correct instead:

- build.md's *"which is the observable form of the same fact"* → it is not.
- the ⚠ test name → *"the route declares `dynamic = 'force-dynamic'`"*, which is what it checks.
- `regressions.py`'s docstring claim that `A9` is the **only** behaviour-preserving mutation →
  `N1` is a second.

## 3.5 F6 — a throwing `SessionCheck` is a 500. **Real, it is step 6's, and it lands on the very next step**

Upheld, and I want to sharpen why it is not step 7's problem to discover. Step 7's `authorize` is
cookie read → decode → HMAC verify. **Every one of those throws on malformed input, and a
malformed cookie is the ordinary way a tampered or truncated session arrives** — this is not an
exotic path, it is the *routine* one. The failure is worse than a wrong status: §5.2 sends a 401 to
`/login`, while a 500 puts the client on §6.7's failed-poll path — grey dot, frozen traces, backoff
to 30 s, a banner naming a server failure — and the user is never told to sign in and never
recovers without clearing the cookie by hand. **The 401 fails closed; the throw fails open into the
wrong UI state.**

Fix: one `try/catch` at the seam that denies, and one test. This is the seam's own stated principle
(*"the safe direction to be wrong in"*) applied to its own failure mode, and it costs a line now
against a debugging session in step 7.

## 3.6 F7 — census depth. **Half taken, half rejected**

The `Filesystem`-level `errors` case is real and is exactly the mistake the census exists to catch,
one level down. The `toJSON` case is real but requires a deliberate cast.

**Reject** a deeper or recursive key census: it would grow with every field, and the mistake it
guards is already a compile error at two levels plus the existing census.

**Take** one targeted assertion instead, which is depth-independent and costs three lines: **walk
the serialised snapshot and assert the key `errors` occurs exactly once, at the root.** That covers
both live shapes the adversarial found, and it is stated as the property that actually matters —
the collectors' entries belong in one place — rather than as a shape enumeration.

Also add one sentence to the census test's own doc naming its depth, so a later step does not
believe it covers what it does not.

## 3.7 F8, F9, F10

- **F8** (backward clock) — no live defect; `performance.now()` is correct. **Take the mutation
  only**: one `R`-series entry replacing `source.ts`'s `monotonicMs: () => performance.now()` with
  `Date.now()`. If nothing goes red, that is a finding, and it is the cheapest way to learn it.
- **F9** (a synchronous throw escapes `get(): Promise<T>`) — **reject** the behaviour change.
  Unreachable while `sample` is `async`, and after §2.6 it still is. **One line at the interface**
  saying `sample` must be `async`, so the constraint is stated where it is relied on.
- **F10** (a collector returning `undefined` is a 500) — **reject**. The decision is right. Add one
  line to §7's table so the decision is recorded as governing the returning-garbage case too, which
  it silently does.

---

# 4. S17, S18, and the stale clock comments

## 4.1 S17 — `ts` is the poll's **start**. Upheld, and the build's justification is wrong

The adversarial is right that the reason given is approximate: `atMs` is stamped at the top of the
poll, before nine concurrent reads are issued, so it describes when the poll *began*, not when the
counters were read. But the conclusion is right for a better reason than either phase gave, and the
spec clause should carry that reason rather than the approximate one:

**Start-stamping can only over-state the data's age; end-stamping can only under-state it.** On a
6 s poll, an end-stamped `ts` makes the snapshot look up to 6 s fresher than its readings are. On a
dashboard whose entire discipline is that a reading must never look better-known than it is —
§6.5's *"zero and unknown must never look alike"*, §6.6's `null` → `—` — under-stating age is the
forbidden direction. Start-stamping is the conservative one.

Second, independent reason: the same clock reading times §4's 2 s cache window and is handed to
`collectHost`. Stamping `ts` separately at the end would introduce a *second* reading with no
consumer, and the age indicator §6.2 shows would disagree with the window the server is serving
from.

## 4.2 S18 — the 401 body. Upheld, and F6 folds into it

No body is right. The question *"expired vs never authenticated"* and the question *"the cookie did
not parse"* are the same question, and the spec should answer both in one place before step 7
answers one of them by accident. Wording in §5 below.

## 4.3 The stale clock comments — **yes, the `types.ts` rule extends to them, and it always did**

HANDOVER §7 states the rule with its reason attached: *"it **describes; it does not direct** — a
wrong descriptive comment misinforms, while a wrong directive gets obeyed."* That reason is a
property of descriptive comments, not of `types.ts`. Both of these describe a clock this project
does not use:

- `lib/collectors/deltas.ts:47` — `DeltaSample.atMs`: *"`Date.now()` at the moment the counters
  were read."* **Both halves wrong.**
- `lib/collectors/collect.ts:345` — `CollectHostOptions.nowMs`: *"`Date.now()` at the top of the
  poll."* Clock wrong, timing right.

I checked the harnesses: **no regression in any of the five anchors on either comment line**
(`grep 'Date.now()' pipeline/steps/0*/regressions.py` hits only step 6's `C6`/`R9`, which anchor on
`cache.ts` and `source.ts` code). Correcting both is a zero-risk comment edit and the reconciliation
should make it. Suggested text:

```
/** ⚠ MONOTONIC — `performance.now()`, stamped at the top of the poll, before the counters
 *  are read. Never `Date.now()`: a backward NTP step makes a rate negative, a forward one
 *  halves it. It never leaves the process and is only ever subtracted from another reading
 *  of the same clock; §4's `ts` is the wall clock on the wire. */
```

And one addition, because it is the invariant `mergePrevious` actually rests on and it currently
has **three homes, one of them wrong**: `deltas.ts` owns `netRatesBetween`, so it should be the
file that states *"`atMs` and `net` are one pair — `netRatesBetween` divides by the difference of
two `atMs`, and `cpuPctBetween` never reads the field."*

---

# 5. Consolidated spec gaps — Take / Decline, with exact wording

Everything here is paste-ready. **Nothing was written to `SPEC.md`.**

## TAKE 1 — §4, new paragraphs after *"Sampling is per-request, not a background loop…"*. Closes S16/F3

> **The poll's ceiling is per collector, and a collector that has not answered is not asked
> again.** Five of the six collectors carry a monotonic budget of their own (§6.7) and are
> guaranteed to settle. `collectHost` does not — its `/proc` and `/sys` reads carry no bound — so
> it alone carries a **6 s ceiling at the assembly**, equal to the poll's existing blessed worst
> case, so that it can neither shorten a healthy poll nor pre-empt a collector that is merely
> slow. A tighter ceiling would fire during thread-pool contention *caused by another collector*
> and blank nine host figures on another subject's account, which §6.7 forbids.
>
> **A ceiling settles the request; it does not reclaim the work.** `readFile`, `readdir` and
> `statfs` run on libuv's thread pool, and an in-flight one cannot be cancelled: measured on this
> project, an `AbortSignal` neither frees the worker nor settles the read's own promise, and
> **four concurrently blocked pool operations block every subsequent read in the process
> indefinitely**. The ceiling must therefore be paired with the rule that makes it safe: **at most
> one call to a given collector may be outstanding at a time.** A poll that finds one outstanding
> does not issue a second — it uses that collector's "could not report" collection for this poll.
> A source that stops answering costs a bounded number of workers, once, instead of one more on
> every poll for as long as the container runs, and it recovers on the first poll after the call
> returns.
>
> **Neither half ships without the other.** With neither, a wedged collector wedges the whole
> snapshot and the in-flight cache then stops all further work: the endpoint dies, but nothing
> accumulates. A ceiling alone would restart the polling and let blocked reads, orphaned
> `nvidia-smi` processes and abandoned sockets accumulate without limit. This is the stated cost
> of caching the in-flight promise, and it is paid here rather than by giving that up.
>
> **The outstanding-call rule is also what closes §3.1's accumulation.** The in-flight cache stops
> ten tabs from forking ten `nvidia-smi`; it does not stop *successive* polls from doing so,
> because a wedged `nvidia-smi` is abandoned at its own 4 s bound, the sample settles, the 2 s
> window has already elapsed, and the next poll forks another. One outstanding call per collector
> is what makes §3.1's sentence true.
>
> **A ceiling and a skipped call are reported as that collector's own failure, never as the
> route's.** Both yield the collection that collector produces when it learns nothing — every
> reading `null`, and one `errors[]` entry per §3.7 source that collector can file, with a message
> naming the bound (§6.7). **No nineteenth `errors[].source` is introduced**; §3.7's list stays
> closed, and §6.7's *"a bound that applied to that subject and to nothing else"* holds because
> the bound is per collector. A skipped call mints no verdict of failure: `serving: null` remains
> *"which instances exist is unknown"*, and no instance is marked `unreachable` or `inactive` by a
> call that was not made — so §6.5's prohibition on a collector-wide bound blanking a per-instance
> verdict is honoured, because nothing per instance is minted at all.

## TAKE 2 — §2.5, one new row in the runtime-contract table

> | libuv thread pool | **`UV_THREADPOOL_SIZE=16`**, passed as `docker run -e` | `readFile`, `readdir` and `statfs` all run on it and an in-flight one cannot be cancelled; the default of **4** is below `collectHost`'s own nine concurrent reads on a healthy poll. **This is margin behind §4's outstanding-call rule, not a substitute for it** — measured, raising the size moves the saturation threshold and does not remove it. Sockets are unaffected: the D-Bus and `llama-server` probes are event-loop work, and `llama-server` is probed by literal IP so no DNS resolution is involved |

## TAKE 3 — §4, one clause on `ts`. Closes S17

> **`ts` is the instant the poll began** — not the instant it finished, and not the instant any
> particular counter was read. It is stamped once, at the start, and the same reading times §4's
> 2 s cache window, so the age indicator and the window the server serves from cannot disagree.
> Stamping at the end would make a 6 s poll's snapshot look up to 6 s fresher than its readings
> are; start-stamping can only over-state age, never under-state it, which is the direction every
> other reading on this dashboard is required to err in.

## TAKE 4 — §5, one paragraph. Closes S18 and F6

> **A session check that cannot reach a verdict denies.** A cookie that is missing, malformed,
> truncated, or whose signature cannot be verified — **and any error raised while deciding** — is
> **401**, never 500. §5.2 routes a 401 to `/login`; a 500 puts the client on §6.7's failed-poll
> path instead, where it backs off, greys the header dot and names a server failure, and the user
> is never sent to sign in and never recovers without clearing the cookie by hand. The 401 carries
> **no body**: the status is the whole contract, and the client distinguishes *expired* from
> *never authenticated* from its own state, not from the response.

## TAKE 5 — §4 and §6.7, the repeated-snapshot consequence. **My own finding — see §6.1**

Amend §4's existing sentence, which is false at two of the five cadences §6.2 offers:

> ~~The cache floor is below the 5 s default cadence, so a single client never sees stale data,
> while ten clients still cost one sample.~~
>
> The cache floor is below the 5 s **default** cadence, so a client at the default or slower never
> receives a repeated snapshot, while ten clients still cost one sample. **At the 1 s selection a
> client will always receive the same snapshot two or three times in a row, and at 2 s it will
> occasionally**, with an identical `ts` — which is correct, and is exactly what stops five tabs
> at 1 s from forking five `nvidia-smi` a second.

And one bullet in §6.7, next to *"Buffer is a ring capped at 8192 samples"*:

> - **The client keys its buffer on `ts` and ignores a snapshot whose `ts` it already holds.** At
>   the 1 s and 2 s cadences §4's cache serves the same sample more than once; appending it twice
>   would put duplicate points in the ring, flatten the min/max decimation over a bucket, and
>   double-count an event in the log. **A repeated `ts` is not a failed poll** — the header dot
>   stays green, the age indicator counts from that `ts`, and the backoff is not engaged.

## TAKE 6 — §6.7, one clause on the persistent partial snapshot. **Consequence of Take 1**

> A collector that has stopped answering produces the same `errors[]` entries on **every** poll for
> as long as it does. That is the third persistent-entry case, on the same terms as
> `pwm5Present: false` (§3.6) and the `NoSuchUnit` `dbus` entry (§3.7): the explanation must stand
> beside the blank for as long as the blank does. **The event log records the transition, not the
> poll** — one entry when a collector stops answering and one when it resumes, never one every five
> seconds.

## DECLINE 1 — a nineteenth `ErrorSource`

Not needed under Take 1, and §3.7's closedness is load-bearing for §6.5. The route never mints a
verdict of its own; every ceiling and every skip is reported as the collector's own failure.

## DECLINE 2 — a shared route-level `deadline()`

Rejected outright, permanently. HANDOVER §6 item 1 stands unchanged and F1's failure scenario is
its proof: 60/60 green while both GPU panels blank because `llama-server` was slow.

## DECLINE 3 — a deeper or recursive key census (F7)

Replaced by the single `errors`-occurs-once assertion in §3.6 above.

## NOT A GAP — three HANDOVER §8 entries that the current `SPEC.md` already answers

HANDOVER §8 warns that its own table was 92 % stale before step 5 and says *"re-check it against
the spec before trusting it."* I did. **All three remaining entries are answered:**

| # | Where it is answered |
|---|---|
| **S14** (is the 6 s ceiling intended?) | §6.7, verbatim: *"A poll may legitimately take longer than the cadence, and that is not a fault … `collectServing`'s worst case is 2 s + 4 s = **6 s**, above the 5 s default cadence. This is intended and needs no shorter collector-wide bound."* **CLOSED.** |
| **S15** (does the `NoSuchUnit` entry persist?) | §3.7: *"That entry **persists** for as long as the condition does, on the same terms as `pwm5Present: false`."* **CLOSED.** |
| **S11 / G5** (an em dash explained by a coloured neighbour) | §6.5's last row states the exception in full. **CLOSED for the `model`-when-`health ≠ ok` case.** |

**But S11/G5's second case is narrowed, not closed, and the narrowing is new.** §6.5's exception
requires the neighbour to **carry a severity**. For step 4's live case — `fan5` reading `—` while
`pwm5Present: true` — the neighbour is the channel-5 cell reading `unavailable`, and **O13 states
that `unavailable` is not a severity**. So the exception does not reach it and the em dash still
owes an entry that no collector files. That is one precise remaining question for **steps 9/10**,
not the blanket gap HANDOVER records. Rewrite the entry to say exactly that.

---

# 6. My own findings

## 6.1 ⚠ A 1 s cadence receives the same snapshot two or three times, and nothing anywhere says so

§6.2 offers a cadence selector of **1 / 2 / 5 / 10 / 30 s**. §4's cache serves a settled sample for
2 s measured from its start. So at 1 s the client provably receives the *identical snapshot*, same
`ts`, two or three polls running; at 2 s it does whenever jitter puts an interval under 2000 ms
(the comparison is `<`).

The server is right and should not change. **The client is what has to know**, and step 8 is about
to build a ring buffer, min/max decimation and an event log on top of a stream it will assume is
one-sample-per-poll. Duplicates put duplicate points in the ring, flatten a decimation bucket, and
would double-count an event. §4's own sentence — *"a single client never sees stale data"* — is
false at two of its five cadences.

Wording is Take 5. **This is the finding I would most regret leaving to step 8 to discover.**

## 6.2 ⚠ §3.1's accumulation is not closed by the mechanism §3.1 nominates

Written up as §2.5 above and folded into Take 1. Present in the shipped code, not hypothetical, and
neither the build nor the adversarial traced the sentence against what was built.

## 6.3 The in-flight cache is an accidental fail-stop, and a ceiling removes it

§2.1. This is the reason the two halves of Take 1 are inseparable, and it is not in either phase's
notes.

## 6.4 Weight, not ceremony — four modules is right, and the split lines are property lines

Judged against the alternative rather than against a line count. `cache.ts` is generic in `T` and
its O18 property (*N callers, one sample*) is proved against a counter with no telemetry in scope —
that is a genuinely different property with a genuinely different failure mode, and merging it into
the assembly would have made the strongest test in the step weaker. `handler.ts` exists because a
`route.ts` may only export what Next recognises, which is a framework fact, not a preference.
`source.ts` is the only mutable state in the server and it is worth being able to point at it.

The 27-line route is right for the same reason. The `GET` wrapper rather than
`export const GET = handleTelemetry` is a real bug avoided, correctly reasoned and pinned.

One criticism: **`snapshot.ts` at 404 lines is doing two jobs** — a *catalogue* (six fallback
collections and six `*_SOURCES` tables, ~120 lines) and the *assembly* (~90 lines). They are
currently in one file because they have one consumer. Under Take 1 they gain a second (the gate's
skip path), at which point splitting the catalogue into `lib/telemetry/could-not-report.ts` becomes
worth it. **Only if Take 1 lands** — otherwise leave it.

## 6.5 `source.ts` holding both the cache and `previous` — correct, and the argument is stronger than the build states

The build says the cache serialises samples so there is one writer. The adversarial found the
stronger version and it should be the one recorded: `previous` is *read* synchronously before the
`await` and *written* after it, while the cache's `flight.inFlight` flips only in a `.then` that
runs later — so there is no microtask window in which a second sample could start and read a
half-written `previous`. Co-locating them is right, and the two mechanisms genuinely are one.

**Where it is awkward:** `mergePrevious` is a pure function — §6.7's retention rule — living in the
stateful module, and its correctness rests entirely on the `(atMs, net)` pairing invariant. That
invariant is currently documented in three files and is **wrong in the one that owns the arithmetic**
(§4.3). I checked the merge for the pairing hazard and it holds: `atMs` advances only when
`next.net !== null`, in which case `net` is also `next`'s, so the two can never come from different
polls. But that is enforced *coincidentally*, by two independent ternaries that happen to agree.

Two options, and I recommend the first: **(a)** correct `deltas.ts` to state the pairing and leave
the code alone; **(b)** additionally express `(atMs, net)` as one choice so the pairing is
structural. (b) touches green, tested code for a property that currently holds — take it only if
the reconciliation is already in `source.ts` for Take 1.

## 6.6 Step 7 will be able to replace the 401 cleanly — with one blocker

The seam is right: `productionTelemetryDeps.authorize` is one line, `SessionCheck` takes the whole
`Request` so step 7 may use either the request or `next/headers`, and ordering-before-sampling is
asserted by call count. Deny-by-default is the correct direction and its argument (the `serve-llm.sh`
ufw precedent) is the right one for this box.

**The blocker is F6.** Step 7's cookie parse throws on the routine malformed input, and today that
is a 500 into the wrong UI state. Close it in step 6, where it costs one `try/catch` and one test.

Second, smaller: `SessionCheck` returns `boolean | Promise<boolean>` and cannot express *why*. Take
4 makes that deliberate rather than accidental, which is the right resolution — do not widen the
type.

## 6.7 Two smaller notes

- `route.test.ts`'s export census matches `^export (?:const|function|async function) (\w+)` and
  misses `export { X }`, `export default`, `export let/var`. Narrower than its name. Low priority;
  rename or widen.
- `SERVING_SOURCES = ['llama-env']` tells the right story for a crash before discovery and the
  wrong one for a crash during a probe. The adversarial is right that there is no better
  `ErrorSource`; the *message* can distinguish them and should. Cosmetic.

---

# 7. What must not leak into step 7 and step 8

**Into step 7:**

1. **Deny-by-default must survive.** `noSessionVerifierYet` is replaced by a real verifier, never
   by a permissive placeholder "until the cookie work lands". The asymmetry in `handler.ts`'s doc
   is the reason and it is the `serve-llm.sh` ufw incident in miniature.
2. **Every unverifiable session is 401, including one that throws** (Take 4). Step 7's cookie
   parsing is where this arrives, routinely.
3. **Authorisation stays before the sample.** An unauthenticated request must never make this box
   fork `nvidia-smi`, open two D-Bus connections and probe both `llama-server` instances. If step 7
   adds middleware, the route-level check stays as well — middleware is not a reason to relax the
   ordering the call-count test pins.
4. **Node 24 for argon2id.** HANDOVER §1: this Mac runs v26.8.1 against a `24` pin, and
   `NODE_MODULE_VERSION` differs. Build and test the native module under 24.

**Into step 8:**

5. **Dedupe by `ts`** (§6.1 / Take 5). The single most likely thing to be got wrong.
6. **A persistent partial snapshot is a 200, not a failed poll.** Under Take 1, a wedged sensor
   produces the same `errors[]` entries on every poll indefinitely. The header dot must not go
   grey, the backoff must not engage, and the event log must record the *transition*, not the poll
   (Take 6). Without this the log fills at one entry per five seconds.
7. **No `as TelemetrySnapshot` on a `fetch` response** (O10), and **no coercion of `serving: null`
   to `[]`** — that turns "could not enumerate" into "none configured" on a box whose
   `/etc/llama-server` mount failed.
8. **`health: null` and `unitState: null` are not alike** (§3.5). One is "not probed this cycle";
   the other is "could not read".
9. **Step 8's timers are the first legitimate ones in this project.** The server-side no-timer rule
   is scoped `lib/telemetry/**` + `app/api/**` (§3.2) and step 8 must write its *own* guard for its
   own timers rather than loosening that one.
10. **The cache and `previous` are per process.** No Next workers in step 11 without revisiting
    both.

---

# 8. The guard rules — three-for-three, and my ruling on the class

**Keep them. Narrow the claim. Add one rule about when a text guard is allowed at all.**

The three defeats are not three instances of one failure, and treating them as one is what would
lead to throwing out something that works:

| guard | shape | defeated by | fixable by text? |
|---|---|---|---|
| `guardrails.test.ts`'s `setTimeout`-under-`lib/collectors/` | **walks the tree**, blanks comments, paren-balanced argument extraction, backed by *"`boundedTimeoutMs` is defined exactly once"* | **not defeated** — the adversarial attacked the class, not this instance | n/a |
| step 6's *"the assembler imports no bound"* | one regex, one import specifier | a deeper specifier (F1) | **yes** — the names are module-local, not globals, and their single definition is itself asserted |
| step 6's *"nothing schedules a timer"* | substring, **hard-coded five-file list** | an aliased global, a microtask, a new file (F2) | **no** — `setInterval` is a global and its spellings are unbounded |

So the class is not the problem; **step 6 copied the idea without copying the discipline HANDOVER
§5.3 already wrote down.** §5.3 explicitly says to blank comments and extract arguments
paren-balanced. It does not say "enumerate by walking, never by listing" or "never guard a global",
and it should — those are the two rules the step-6 guards each broke.

**Proposed addition to HANDOVER §5.3, as the third and fourth practical notes:**

> 3. **Enumerate inputs by walking the tree, never by listing files.** A guard over a hard-coded
>    file list is defeated by *adding a file* — measured in step 6, where a new module under
>    `lib/telemetry/` containing a literal `setInterval(` passed 71/71. `sourceFiles()` already
>    exists; use it and filter by directory prefix.
> 4. **A text guard is sound only over a vocabulary that cannot be aliased.** A *module-local* name
>    (`deadline`, `boundedTimeoutMs`) is guardable, provided deep import paths are banned by prefix
>    as well as the barrel's brace block being name-checked, and provided the name is proved to be
>    defined exactly once. A **global** (`setInterval`, `fetch`, `require`) is **not** guardable by
>    text at all — `globalThis.setInterval`, a destructured alias and a computed property are three
>    spellings and there is no last one. That property needs a *behavioural* test (fake timers,
>    advance, assert no calls) for construction-time work and a *runtime* one
>    (`process.getActiveResourcesInfo()`) for module-load-time work. Both, because neither sees what
>    the other sees.

**And the ceiling to accept and write down once, so it is not rediscovered as a scandal in step 8:**

> A source-text guard catches the mistake someone makes **by accident** — an auto-import, a
> copy-paste, a plausible-looking local. It does not catch the mistake someone makes **on purpose**,
> and every evasion found in step 6 was constructed adversarially. That is not a reason to drop the
> rule; it is the reason the rule is stated as *necessary, never sufficient*, and the reason each
> guard's ⚠ name must say what it actually checks. Three of step 6's four over-claiming test names
> were guard names.

Note that all four over-claiming names the adversarial found are in this family, against the three
the build found and fixed by hand — consistent with HANDOVER §5.2's statement that reading each
test against its own name is irreducible, and evidence that **guard tests are where the naming
discipline slips most**, because their subject is a mechanism rather than a value.

---

# 9. Priority list

## MUST — before step 6 closes

| # | What | Why |
|---|---|---|
| **M1** | **Get Take 1 into `SPEC.md`, then implement it**: the per-collector outstanding-call rule (all six) and the 6 s `collectHost` ceiling, as the two decorators of §2.6. `snapshot.ts` unchanged; both rejections land in the existing `attempt` path, so **no new fallbacks and no nineteenth `ErrorSource`** | F3 + §2.5. Today a wedged sensor kills the endpoint permanently; a ceiling alone would leak without limit. Invariant 7: the spec sentence is the gate — **if the owner declines the wording, do not change the code** |
| **M2** | Fix F1's guard: ban `@/lib/collectors/` deep specifiers and namespace imports by **path prefix**, keep the brace-block name check, and **rename the test** to *"the assembler shares no budget across collectors"* | The guard that protects HANDOVER's "single most important line" is 60/60 green under the mistake it exists to catch |
| **M3** | Fix F2: move the no-timer rule into `guardrails.test.ts`, **walk the tree** over `lib/telemetry/**` + `app/api/**`, and make it the same rule as the `lib/collectors/` one (no `setInterval`/`setImmediate`; every `setTimeout` takes `boundedTimeoutMs()`). Add the fake-timer behavioural test and fix the existing one to assert after `await Promise.resolve()` | Three measured evasions, one of which also fools the behavioural test. Step 8's timers land next |
| **M4** | Fix F4: assert `HOST_SOURCES` against a **literal** array, as the two sibling tests already do | Breaks §6.5 in both directions; one line |
| **M5** | Fix F6: `try/catch` at the `SessionCheck` seam, denying, plus a test | Step 7's cookie parse throws routinely; a 500 puts the user on the wrong UI path with no recovery |
| **M6** | Correct the two stale clock comments in `deltas.ts` and `collect.ts`, and add the `(atMs, net)` pairing sentence to `deltas.ts` | HANDOVER §7's rule applies to any descriptive comment; no harness anchors on either line |
| **M7** | Correct build.md's three `force-dynamic` claims and `regressions.py`'s "only behaviour-preserving mutation" docstring. **Keep the export** | The evidence does not support the claim; `N1` is a second behaviour-preserving mutation |
| **M8** | Correct the adversarial's "six threadpool threads in one poll" to **one** — `cooling.ts` reads sequentially and says why | A wrong number in a note this project treats as fact |
| **M9** | Update HANDOVER §8: **close S14, S15 and S11/G5's first case**; rewrite S11/G5 as the narrow remaining question (`unavailable` is not a severity, so §6.5's exception does not reach `fan5`) | The table is stale again, at 100 % this time |
| **M10** | Re-run all five harnesses **serialised**, plus `pnpm verify` and `pnpm build`, and quote `exit=0` | The step touches `app/` |

## SHOULD

| # | What |
|---|---|
| **S1** | Take 5 (`ts` dedupe) into the spec **now**, not in step 8 — it changes what step 8 builds |
| **S2** | F7's replacement assertion: `errors` occurs exactly once in the serialised snapshot, at the root; plus one sentence naming the census's depth |
| **S3** | F8's mutation: `performance.now()` → `Date.now()` in `source.ts`'s `systemClock`. If nothing reddens, that is the finding |
| **S4** | Take 3 (`ts` is the poll's start) and Take 4 (401 on a throw, no body) into `SPEC.md` |
| **S5** | Take 6 (the persistent partial snapshot; the log records the transition) into §6.7 — step 8 needs it |
| **S6** | Add §5.3's two new practical notes (§8 above) to HANDOVER |
| **S7** | Split the "could not report" catalogue out of `snapshot.ts` — **only if M1 lands** |
| **S8** | F9's one-line interface note (`sample` must be `async`); F10's one line in §7's table |

## DEFER

| to | what |
|---|---|
| **step 7** | argon2id under Node 24; the real `authorize`, replacing the denying default; middleware without relaxing the route-level ordering |
| **step 8** | `ts` dedupe in the ring; a persistent partial snapshot is not a failed poll; the transition-only event log; O10 wire validation; step 8's own timer guard |
| **steps 9/10** | S11/G5's narrowed case — an em dash on `fan5` with `pwm5Present: true`, whose neighbour reads `unavailable`, which O13 says is **not** a severity, so §6.5's exception does not apply |
| **step 11** | `UV_THREADPOOL_SIZE=16` in the unit/`docker run`; `.dockerignore` excluding `*.test.ts`; one process, one cache, one `previous` — no workers |
| **owner** | the commit point before step 11 |

## EXPLICITLY NOT DOING

| what | why |
|---|---|
| A nineteenth `ErrorSource` for the route | Take 1 reports every ceiling and every skip as the collector's own failure. §3.7 stays closed |
| A shared route-level `deadline()` | HANDOVER §6 item 1, and F1 is its proof |
| A deeper or recursive key census | Replaced by the single `errors`-occurs-once assertion |
| Deleting `export const dynamic = 'force-dynamic'` | It is correct defence against Cache Components and against a future default; only the *claim* was wrong |
| Making `InFlightCache.get()` async, or catching a synchronous `sample` throw | Unreachable while `sample` is `async`, and `get()` being synchronous is a deliberate, argued property |
| Widening `SessionCheck` to carry *why* | Take 4 makes "the status is the whole contract" deliberate |
| Re-litigating per-counter `previous` retention, the `-sm`/O9/O18 decisions, or the four-module split | All three were attacked and all three held |
