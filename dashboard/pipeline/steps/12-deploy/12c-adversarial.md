# 12c ADVERSARIAL — the fix stopped at the ledger, and the card kept saying "no instance"

**Written by the ADVERSARIAL phase, 2026-09-18.** Branch `dashboard-frontend`, working dir
`dashboard/`, 12c's build + test uncommitted on `cb8a3c7`. **Nothing was fixed, nothing was
staged, nothing was committed, nothing was deployed, and no spec file was edited.** This phase did
not contact `192.168.4.71` — no SSH, no HTTP, no D-Bus socket opened and therefore none left open.
Every measurement was taken against a **byte copy of the tree in the scratchpad**, never against
the tree itself; the working tree was never written to.

⚠ **`SPEC.md` and `pipeline/WORK-ITEMS.md` changed underneath this run, at 02:29:55, and not by
this phase** — the owner ratified the test phase's §9 finding while it was in progress. Both are
now in `git status` and were not in the list this phase inherited. §7 records the exact state.
The ratified sentence matters to finding A1 and is quoted there.

---

## 1. Findings

### ⚠⚠ 12c-A1 — a wire-refused row makes the GPU card say **`no instance`**: the loop's own defect, on the panel the fix does not reach. **HIGH.**

`servingRowsRefused` routes to `enumerationsRead`, which is §9's ledger. **§6.2's join reads the
same shortened array and nothing tells it either.** `servedBy` is handed `snapshot.serving`
directly and has no idea rows were dropped:

```ts
// lib/client/observations.ts:469-506
export const servedBy = (serving: readonly ServingInstance[] | null, index: number): ServedBy => {
  …
  return serving.some((s) => declaresGpus(s) && s.gpus === null)
    ? { kind: 'unknown' }      // invariant 1 — an em dash
    : { kind: 'unserved' };    // "every list was READ and none of them names this card"
```

`unserved` is a **positive claim**, and `gpu-panel.tsx:172-175` says so in its own comment: *"Not
an em dash: every list was READ and none of them names this card … we looked, and nobody claims
it."*

**Measured** (three rendered pages, two cards enumerated, `parseSnapshot` → `GpuPanel`, tags
stripped — the only thing varying is row 1's `port`):

| snapshot | GPU 1's served-by strip |
|---|---|
| both rows valid | `served by instance 1 \| gemma-4-31b` |
| **row 1 refused for `"port": "nope"`** | **`served by \| no instance`** |
| instance 1 genuinely left the machine | `served by \| no instance` ← **byte-identical** |
| instance 1 present, `gpus: null` (unreadable) | `served by \| —` |

So a validation failure is rendered as *nobody serves this card* and is **indistinguishable from
the instance having left**, while the honest answer for "we could not read it" — the em dash —
already exists one branch away and is not taken.

**And no entry can ever explain it.** Measured on the same snapshot:

```
errorsForPanel(snapshot, 'gpu')     -> []
errorsForPanel(snapshot, 'serving') -> [llama-env: serving[1] was dropped: `port` did not validate]
```

`panelsForSource('llama-env')` is `['serving']`, so §6.5's join **structurally cannot** put the
refusal beside the card that changed its mind. The refusal's source choice is what guarantees it
(and see A4: that choice is untested).

⚠ **This is now a direct contradiction of a ratified spec sentence.** `SPEC.md` §9 row 2, written
at 02:29:55 today: *"**The collection was read successfully and the client discarded part of it,
which is not the same as the server not reporting it.**"* `servedBy`'s `unserved` is defined as
*every list was read*; after a refusal they were not.

⚠ **`servedBy` is also the one place `servingRowsRefused` would be cheap to reach** — it already
takes the array from the same `WireSnapshot` the count rides on, one call site up
(`gpu-panel.tsx:149`).

*Proven: measured* — `scratchpad/a12c/a1-unserved.adv.test.ts` (5 assertions),
`a3-gpu1.adv.test.tsx` (4 renders).

---

### ⚠⚠ 12c-A2 — a permanently-present `errors[]` entry **absorbs the next real failure of the same source**: the header cannot escalate and the event log never logs the outage. **HIGH.**

This is the *seventh* consequence of the unit-name miss the handoff asked for, and it is also a
second-order consequence of ruling 2 — the two rulings produce the same shape one source apart.

Both new entries are **filed on every poll, indefinitely**: the miss (`dbus`) for as long as an
unrecognised `*.env` exists, the refusal (`llama-env`) for as long as a row stays malformed. Two
mechanisms key on **presence of a source**, not on the message:

1. `failingSourceCount` counts **distinct sources** (`header-status.ts:139`).
2. `events.ts:399-432` debounces **presence per source** and emits `source-lost` /
   `source-recovered` only on the **edge** (`if (previousBand === band) continue;`).

**Measured, header:**

| snapshot | `failingSourceCount` | header text | dot |
|---|---|---|---|
| one unrecognised `backup.env` | 1 | `1 source unread` | no band |
| the D-Bus socket is gone | 1 | `1 source unread` | no band |
| **both at once** | **1** | **`1 source unread`** | no band |

**Measured, event log** (four quiet polls, then the bus dies, 5 s cadence):

```
quiet box, bus dies   -> ["30000 source-lost dbus"]
stray .env, bus dies  -> ["10000 source-lost dbus"]        <- the MISS's edge, at t=10s
                                                              the outage at t=20s logs NOTHING
```

So the answer to the handoff's question — *is the sixth consequence correct or a denial-of-service
on the header?* — is **both**. It is correct (the dashboard really did fail to read something) and
it is a denial of service on **escalation**: while it stands, a genuine D-Bus outage changes no
number, no word, no colour and writes no line. The same holds for `llama-env` and a permanently
refused row: a real `/etc/llama-server` failure arrives with `llama-env` already lost.

*Proven: measured* — `scratchpad/a12c/a8-masking.adv.test.ts`.

---

### ⚠⚠ 12c-A3 — the load-dependent ledger is **not step 05's alone**, and `pnpm verify` itself is load-dependent. **HIGH — evidence integrity.**

The test phase found `05-I2` reddening 2 tests on one run and 3 on another and called the recorded
green a lucky run. Three things establish the blast radius, and the third was reproduced twice by
accident and once on purpose **during this run**.

**(a) `io.test.ts` is owned by TWO ledgers, and both carry the same mutation.** Derived by
importing every `regressions.py` and reading `LEDGER_FILES`: `lib/collectors/io.test.ts` is in
**step 03's** list as well as step 05's, and step 03 carries `03-S47` — *"nodeIo.run goes back to
execFile's own `timeout:` — inert against a child that ignores SIGTERM"*, the same defect as
`05-I2`. All ten harnesses have the `NO MUTATION REDDENS` check. **So step 03's recorded
`73 / 115 / 25, exit 0` shares the exact mechanism**, and the "identical to 12b's columns" check
the test phase used for steps 03 and 06 to conclude *this loop changed no coverage* rests on a
load-dependent number.

**(b) A census of ⚠ marks whose verdict IS a wall-clock measurement** (a real-clock delta plus a
bound, or a real sleep), across all ten ledgers:

| harness | ⚠ marks | files |
|---|---|---|
| 03-collectors-gpu-host | 3 | `io.test.ts` |
| 04-collector-cooling | 5 | `cooling.test.ts`, `deadline.test.ts` |
| **05-collectors-serving-storage-safety** | **12** | `dbus.test.ts`, `http.test.ts`, `io.test.ts`, `serving.test.ts`, `storage.test.ts` |
| 06-telemetry-route | 2 | `source.test.ts` |
| 07-auth-login | 2 | `handler.test.ts`, `scrypt.test.ts` |

**24 ⚠ marks, five harnesses.** (`scratchpad/a12c/timing_scan2.py`.)

**(c) ⚠⚠ And a family the census cannot see: tests that are simply slow enough to hit vitest's
default 5 s `testTimeout`.** These carry no clock assertion at all, so nothing marks them as
timing-sensitive — and they are in **step 08's** ledger, the harness this loop changed most.

| `lib/client/ring.test.ts` / `series.test.ts` ⚠ test | idle | under 2x CPU oversubscription |
|---|---|---|
| ⚠ 8192 samples are all held, and the 8193rd evicts the oldest | 4253 ms | **16895 ms — FAIL** |
| ⚠ an evicted ts leaves the dedupe key set… | 3238 ms | **16480 ms — FAIL** |
| ⚠ eviction is oldest-first… | 3266 ms | **6201 ms — FAIL** |
| ⚠ an excursion inside the window is drawn… | 2725 ms | **13916 ms — FAIL** |
| ⚠ two hours at 1 s fits the window with headroom to spare | 2327 ms | 4055 ms |

**Unmutated source. Same tree, same command.** The worst has **0.75 s of headroom** in a 5 s
budget at idle. This phase hit it twice without trying (two mirror runs that happened to be busy),
then reproduced it deliberately — and the same one-line revert (`G3`) came back **red on the busy
run and green on the idle one**, which is the whole finding in one line.

**(d) The direction matters, and it is the silent one.** The unmutated `io` bound is *robust*:
305 ms idle → 308 ms under 3x oversubscription. So the flake lives in the **mutant**, and a
timeout-driven red **certifies a ⚠ mark for a reason that has nothing to do with the source under
mutation**. A `NO MUTATION REDDENS` complaint is loud; a ⚠ mark certified by a timeout is not.

*Proven: measured* (b is a static census; a, c, d are measured).

---

### ⚠ 12c-A4 — the refused row's `ErrorSource` — the one decision recorded as a spec silence — has **no test at all**. **MEDIUM-HIGH.**

`lib/client/wire.ts:626`, `const WIRE_REFUSAL_SOURCE: ErrorSource = 'llama-env';`, argued at length
in the file and again as `12c-build.md` §6 Q4. Changed in a byte copy of the tree and the **whole
suite re-run**:

| value | reaches | result |
|---|---|---|
| `'llama-models'` | `['serving']` | **108 files / 3686 tests pass, exit 0** |
| `'dbus'` | `['cooling', 'serving', 'safety']` | **exit 0** |
| **`'ufw'`** | **`['safety']`** | **exit 0** |

With `'ufw'` the refusal note **leaves the SERVING panel entirely** and renders under SAFETY: a row
vanishes from the serving list with no explanation anywhere near it, and 3686 tests do not notice.

**Why the existing tests miss it:** they assert that a dropped row cannot read healthy, through
`failingSourceCount` — which counts *a* source and is true for any of the eighteen. The claim that
was argued (*"it reaches exactly the SERVING panel, which is the panel a missing row is missing
from"*) is the claim nothing asserts.

*Proven: measured* — six full-suite runs, `scratchpad/a12c/revertlogs/R15,R16,R17`.

---

### ⚠ 12c-A5 — the fix's own parameter defaults the **unsafe** way, and its doc says the opposite. **MEDIUM-HIGH.**

```ts
// lib/client/observations.ts:105-135
export const enumerationsRead = (snapshot: TelemetrySnapshot, servingRowsRefused = 0) => …
```

Its doc: *"⚠ Defaults to `0`, matching `PollOptions.enumerationsRead`'s own rule — 'a caller that
supplies nothing can only make the dashboard louder' — so a caller that has not been updated
**retires nothing it should not, and never the reverse**."*

**The analogy is inverted.** `PollOptions.enumerationsRead` defaults to the **empty set**, which
retires nothing. This parameter defaults to `0`, which means *the enumeration WAS read* — the
loudest-possible default would be a non-zero one. Measured:

```
with the count : ["gpus"]
defaulted      : ["gpus","serving"]

count passed  -> retired: []
count omitted -> retired: ["unit:llama-server@1.service/alarm", "health:1/alarm"]
```

A call site that forgets the argument reproduces **exactly the defect this loop fixed**, and it is
the one that reads as "a caller that has not been updated". It is also inconsistent with the same
fix's other half: `WireSnapshot.servingRowsRefused` was made **required** on HANDOVER §0.8's
grounds (*an optional prop is an untested one*) while the function consuming it made the same value
optional with the unsafe default. There is one call site today (`runtime.ts:529`), so this is
latent, not live.

*Proven: measured* — `scratchpad/a12c/a7-default.adv.test.ts`.

---

### ⚠ 12c-A6 — one permanently refused row freezes retirement for **every other instance, forever**. **MEDIUM.**

"One refusal suppresses the whole enumeration" is stated in the fix's doc and justified. Its
consequence is not: while any row is refused, an instance that **genuinely left the machine** can
never retire, and if its last band was `alarm` it keeps pinning the banner and the count
indefinitely — with no row on the SERVING panel and only a note about a *different* row nearby.

Measured — instances 0 and 1 healthy for five polls (instance 1 `failed` + `unreachable`, a live
alarm), then `1.env` is removed from the box and a third row arrives malformed on every poll:

```
t=25000  refused=1  ["…@0/normal","health:0/normal","…@1/alarm/STALE","health:1/alarm/STALE"]  retired=[]
t=35000  refused=1  …same…  retired=[]  wentStale=["unit:llama-server@1.service","health:1"]
t=600000 refused=1  …same…  retired=[]
t=1200000 (20 min) health:1 still displayed, alarmCount still > 0
CONTROL (no refused row): health:1 is gone from displayed by t=40000
```

A malformed row is not self-healing — it comes from contract skew or a server defect — so "for as
long as it lasts" is "until someone notices". The conservative direction is the right one; **the
cost is undocumented and unbounded**, and nothing on the page says *the serving enumeration is not
being read*.

*Proven: measured* — `scratchpad/a12c/a4-stale-forever.adv.test.ts`.

---

### ⚠ 12c-A7 — both new browser-harness guards are **ungraded**, and `assertPortFree` fails open on the most likely occupant. **MEDIUM.**

**(a) The fail-open, measured.** `assertPortFree` fetches `/login` with `AbortSignal.timeout(2000)`
and **`catch { return; }`** — it treats *any* fetch rejection as "nothing is listening". The
harness's own `waitForServer` allows **60 000 ms** for the same URL, because a `next dev` that has
just started takes many seconds to compile `/login`. A standalone probe against the real
`server-log.mjs`:

```
nothing listening      : assertPortFree RETURNED  -> the harness would spawn and proceed
bound, answers at once : assertPortFree THREW     -> port 39173 is ALREADY answering (HTTP 200)
bound, answers in 8 s  : assertPortFree RETURNED  -> the harness would spawn and proceed
   a competing bind while the guard said free: EADDRINUSE
```

The port was **held throughout** — a competing `listen()` got `EADDRINUSE` at the moment the guard
declared it free. The occupant the guard exists to catch is, per the test phase's own §7, *a
`next dev` leaked by a crashed previous run* — i.e. one that is starting up, i.e. exactly the
case that defeats it. The guard's own error message names the authoritative check (`lsof`); the
code does not use it. `assertServerAlive` is the second line and does cover this particular
sequence, but only because the occupant is slow, and it is a single instantaneous check of
`server.exitCode` on a `pnpm exec next dev` whose child is the process that actually dies.

**(b) Neither guard has a behavioural test.** Short-circuiting each function's body to a no-op, in
a byte copy of the tree, with the whole suite re-run:

| gutted | result |
|---|---|
| `assertPortFree`'s body | **108 files / 3686 tests pass, exit 0** |
| `assertServerAlive`'s body | **exit 0** (re-run idle; an earlier busy run's red was A3's flake, not coverage) |

`measurement-harness.test.ts` grades the **call sites** (`await assertPortFree(PORT);`) and the
`server-log.mjs` module only for `lines.shift()`. The bodies are unreachable by any test. **The
comparison that makes this a finding rather than a nit:** the `route.fetch` wrap from the same
phase *is* graded properly — moving the call out of its try/catch while keeping the graded line
verbatim goes red on `measurement-harness.test.ts`'s own term.

*Proven: measured* — `scratchpad/a12c/portguard.mjs`, `revertlogs/G1,G2,G3b`.

---

### ⚠ 12c-A8 — `compareInstances` is **not a total order**, and the join falls back to array position. **MEDIUM (unreachable on this box, but the docs assert the opposite twice).**

`isInstanceId` admits any canonical decimal of any length; `compareInstances` compares numbers with
`Number(a) - Number(b)`. Measured:

```
compare('9007199254740993','9007199254740992') = 0     <- two DISTINCT identities, EQUAL
compare('111…1' (400 digits), '222…2')         = NaN   <- Infinity - Infinity
parseInstanceId('9007199254740993.env')        = '9007199254740993'   (both sides admit it)

discoverInstances(['…993.env','…992.env']) -> ["…993","…992"]
discoverInstances(['…992.env','…993.env']) -> ["…992","…993"]   <- the listing order again
servedBy(card 0), rows forward  -> instance …993, model "A"
servedBy(card 0), rows reversed -> instance …992, model "B"   <- the wrong model on the card
```

This falsifies, end to end through `parseSnapshot`, three claims made in the code itself:

- `lib/units.ts`: *"Two different identities never compare equal … a set of identities has exactly
  one ordering under this comparator, **independent of the order they arrived in**."*
- `observations.ts:495`: *"Two rows can only tie by carrying the same identity, which
  `discoverInstances` cannot produce."*
- `12c-build.md` §1.3: *"It is a TOTAL order on distinct identities, and that is the property the
  join needs."*

A NaN comparator additionally leaves `Array.prototype.sort` implementation-defined — the exact
non-determinism §1.4 exists to remove. **The 24-permutation proof cannot see any of it**: a set of
round numbers and word-shaped names can produce neither a tie nor a NaN. Reachability is a
16-plus-digit `.env` filename, which is why this is MEDIUM and not HIGH — but the grammar admits
it, both sides admit it, and the tie rule it exercises is itself untested (see A11).

*Proven: measured* — `scratchpad/a12c/a5-order.adv.test.ts` (7 tests).

**The rest of the comparator held**: `01`, `''`, `_1`, `-1` refused; `1_0` a name; `9 < 10`;
numbers before names; `1` before `10`; `a` before `ab`; `Split` before `split` by code point;
`NAMED_UNITS` unreachable through `constructor` / `toString` / `__proto__`.

---

### 12c-A9 — the number bridge lets **one identity arrive in two spellings in one array**. **LOW.**

`[{ "instance": 0, "port": 8080 }, { "instance": "0", "port": 8081 }]` validates with
`servingRowsRefused === 0` and yields `serving[].instance === ['0','0']`. Measured consequences:

- **two SERVING rows under one React key** (`key={instance.instance}`, `serving-panel.tsx:122`) —
  both render (`:8080`, `:8081`); SSR does not warn, the browser would;
- **one `health:0` condition for two processes**, with `observePoll` reporting the conflict:
  `{"id":"health:0","kept":"unhealthy","others":["ok"]}` — the dedupe takes the worse, which is
  right, but the two ports are now one subject.

Before 12c the `"0"` row was refused by `integer()`, so this pair was not expressible. ⚠ Also
asymmetric: `"9007199254740993"` is accepted as a **string** and refused as a **number**
(`Number.isSafeInteger`), so one identity's two spellings do not agree at the boundary.

⚠ **What held:** a spelling change **across a poll boundary** is one continuous identity —
`conditionsFrom` produces the same ids for `0` and `"0"` — so the compatibility claim itself is
sound.

*Proven: measured* — `scratchpad/a12c/a6-bridge.adv.test.tsx`.

---

### 12c-A10 — every row refused reads as **"no llama-server instances discovered"**. **LOW.**

The SERVING panel branches on `instances.length === 0` (`serving-panel.tsx:190`). Rendered:

```
all rows refused : serving | llama-server instances | — | no severity band |
                   no llama-server instances discovered |
                   serving[0] was dropped: `port` did not validate |
                   serving[1] was dropped: `port` did not validate
genuinely empty  : serving | llama-server instances | — | no severity band |
                   no llama-server instances discovered
```

The headline sentence is the same positive claim in both, and the panel head loses its band. The
refusal notes are underneath, so this is not silent — but *discovered* is the server's word for
something the server did do, and here it did. The GPU cards on that snapshot fall back to
`indexed` and print `served by instance 0 | —` (`12c-build.md` §6 Q7's new path, carried, confirmed
still present).

*Proven: measured* — `scratchpad/a12c/a2-render.adv.test.tsx`.

---

### 12c-A11 — one-line reverts of the 12c diff that stay green: **6**. **LOW, but they are what the ledger cannot see.**

Each applied to a byte copy of the tree, whole suite (`tsc` + 108 files / 3686 tests) re-run,
source restored and the restore verified by SHA-256.

| # | file | the line | verdict |
|---|---|---|---|
| 1 | `lib/client/wire.ts` | `if (!Number.isSafeInteger(value) \|\| value < 0)` → drop `\|\| value < 0` | **green** |
| 2 | `lib/units.ts` | `unit.endsWith(UNIT_SUFFIX) ? unit.slice(…) : unit` → `unit.slice(…)` | **green** |
| 3 | `lib/client/observations.ts` | the claimant reduce's `< 0` → `<= 0` | **green** |
| 4 | `lib/client/wire.ts` | `WIRE_REFUSAL_SOURCE` → `'llama-models'` / `'dbus'` / `'ufw'` | **green** (A4) |
| 5 | `server-log.mjs` | `assertPortFree`'s body short-circuited | **green** (A7) |
| 6 | `server-log.mjs` | `assertServerAlive`'s body short-circuited | **green** (A7) |

⚠ 1 and 2 are **provably dead** rather than untested: `isNumericInstance(String(n))` is already
false for every `n < 0` (`String` prefixes `-`), and every value `NAMED_UNITS` and the numeric
template produce ends in `.service`. They are guards that cannot fail, and #1 sits under a doc
naming `-1` as one of the four values the narrow admission refuses — it does not.
⚠ **3 is the tie rule, and it is reachable** — A8 produces the tie the fixtures cannot.

**Reverts that went red, i.e. real coverage**: the refusal message's field ORDER (`SERVING_FIELDS`
reordered → 20 tests); the `health:` condition's `SERVING_ENUMERATION` tag (2 tests, one in each
direction); `servedBy`'s `unknown`-vs-`unserved` split (6 tests); the `route.fetch` try/catch
(`measurement-harness.test.ts`'s own term).

*Proven: measured* — `scratchpad/a12c/reverts.py`, ten full-suite runs.

---

## 2. What held

- **`serving[]` has no other reader.** Every consumer of `snapshot.serving` in the tree was
  enumerated: `servedBy` (A1), `conditionsFrom`, `enumerationsRead`, `ServingPanel`. **There is no
  "N of M up" count, no hover layer and no table view that reads it** — the handoff's remaining
  three candidates do not exist in code, so `M` cannot silently shrink where nothing counts it.
- **`observePoll` has exactly one call site** (`runtime.ts:519`), so the fix reaches every poll
  that exists today. (A5 is about the next one.)
- **The grammar really is one predicate on both sides** for string identities: `parseInstanceId`
  and `wire.ts`'s `instanceId` both go through `isInstanceId`, and a server cannot send a *string*
  identity this client's own discovery would refuse. The number path is the client's alone (A9).
- **`TelemetryError.instance` cannot kill a snapshot.** Every server-side `tag(..., instance)` call
  passes an id that came out of `discoverInstances`, and discovery's own problems
  (`` `01.env` is not `<instance>.env` ``) are filed **untagged** — so the one array that is
  deliberately not row-lenient is never handed an identity `optionalInstanceId` would refuse.
- **`failingSourceCount` does see a refusal**, so a dropped row can never read `● all healthy` —
  measured. (A2 is that it cannot read anything *worse* either.)
- **A spelling change across a poll boundary is continuous** — `0` then `"0"` gives identical
  condition ids, so the compatibility bridge does not break the ledger.
- **The unknown-vs-unserved split, the refusal message's field order, the `health:` enumeration
  tag and the `route.fetch` wrap are all genuinely covered** (A11's red column).
- **`NAMED_UNITS` is prototype-safe**, and `servingUnitName` is case-sensitive in the one direction
  that matters (a mis-cased `Split.env` is a loud miss, not a wrong unit).
- **`12c-build.md` §8.2 was not re-hunted**, per the handoff.

---

## 3. What could not be verified, and why

- **Whether step 03's, 04's, 06's or 07's recorded greens were themselves lucky runs.** Establishing
  it needs each harness re-run several times (625 s each for step 05 alone), and this phase runs no
  harness. A3 establishes the *mechanism* and the *census*; it does not re-certify any past run.
- **The `05-I2` flake itself was not re-reproduced.** The mutation lives in step 05's harness and
  reproducing it means mutating `lib/collectors/io.ts` and running a harness. What was measured
  instead is more general and needed no mutation: the unmutated `io` bound is robust under load
  (305 → 308 ms), so the load-dependence is in the **mutant**; and five *other* ⚠ tests in step 08's
  ledger fail under load with no mutation at all.
- **Whether a duplicate React key actually misrenders in a browser** (A9) — `renderToStaticMarkup`
  does not check keys, and this phase ran no browser harness.
- **Whether `assertServerAlive` catches a fast-binding foreign server** — it depends on whether
  `pnpm`'s exit has propagated to `server.exitCode` at the instant `waitForServer` returns, which
  needs two real `next dev` processes on one port. A7(a) bounds the *other* half instead, which is
  the one that admits a measurement without a harness run. **Reasoned, not run.**
- **Whether anything on the live box would produce a refused row today.** Untestable from here, and
  `12c-build.md` §6 Q8 (does skew exist on this deployment at all?) is still the owner's.
- **A8's reachability.** The comparator's failure is real and measured; whether a 16-plus-digit
  `.env` filename can occur is a question about the box, not about the code.

---

## 4. Rules observed

- **Nothing was fixed.** No source, test, spec, handoff or harness file in the working tree was
  edited. Every mutation and revert was applied to a byte copy at
  `scratchpad/a12c/mirror` (`tar` of the tree, `node_modules` symlinked), restored, and the restore
  verified by SHA-256.
- **No harness was run**, so none was run beside another and none was killed. No `pgrep`. No
  `pnpm verify` in the working tree. **No exit status was read through a pipe** — every run was
  `> log 2>&1` with `$?` taken directly, or `subprocess.run(...).returncode`.
- **The box was not contacted.** No SSH, no HTTP to `192.168.4.71`, no D-Bus socket opened.
- Nothing staged, nothing committed, no `git checkout --`, nothing deployed.

---

## 5. Measurements, and where they live

All under
`/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad/a12c/`:

| file | what it measures |
|---|---|
| `vitest.adv.mts` | a config whose `root` is the dashboard and whose `include` is the scratchpad — probes import the real modules and live outside the tree |
| `a1-unserved.adv.test.ts` | A1 — `unserved` from a refused row, and that no entry reaches the GPU panel |
| `a2-render.adv.test.tsx`, `a3-gpu1.adv.test.tsx` | A1/A10 — the four rendered served-by strips and the two SERVING panels |
| `a4-stale-forever.adv.test.ts` | A6 — twelve polls to 20 minutes, with a control |
| `a5-order.adv.test.ts` | A8 — the tie, the NaN, the listing order, the wrong model on the card |
| `a6-bridge.adv.test.tsx` | A9 — two spellings, one key, one condition |
| `a7-default.adv.test.ts` | A5 — the defaulted caller retires the alarm |
| `a8-masking.adv.test.ts` | A2 — the header cannot escalate; the event log logs nothing |
| `portguard.mjs` | A7(a) — `assertPortFree` against a bound-but-slow port, with a competing bind as the control |
| `timing_scan2.py` | A3(b) — the wall-clock-verdict census over all ten ledgers |
| `reverts.py`, `revertlogs/` | A4, A7(b), A11 — ten full-suite runs, each restored and SHA-verified |
| `mirror-base2.log`, `ring-idle.log`, `ring-load.log`, `io-idle.log`, `io-load.log` | A3(c)/(d) — the baseline and the load pairs |

**Mirror baseline: `108 files / 3686 tests passed, Type Errors no errors, exit 0.**
`packaging.test.ts` is excluded from the mirror (its ten tests reach the sibling scripts one
directory above `dashboard/`, which a copied tree does not have); it is the only file excluded, and
nothing this phase examined touches it.

---

## 6. `git status`

48 entries at the end: **42 modified, 6 untracked**, plus this file as the 7th untracked entry.

⚠ **Two of the 42 are not this phase's and were not in the inherited list**: `dashboard/SPEC.md`
and `dashboard/pipeline/WORK-ITEMS.md`, both stamped **02:29:55**, mid-run. They are the owner
ratifying the test phase's §9 finding (SPEC §9 row 2 gains *"NOR DOES A ROW WE OURSELVES
DROPPED"*; WORK-ITEMS gains the matching ruling). This phase did not write them, has not touched
them, and quotes the new sentence only as evidence in A1. **Everything else is byte-identical to
what this phase inherited** — no source file is left mutated, `next-env.d.ts` is not in the list,
and the only file this phase created inside the repo is this one.
