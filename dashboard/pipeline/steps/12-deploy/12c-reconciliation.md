# 12c RECONCILIATION — the ledger got the rule and the card did not, and the seam was one field wide

**Written by the RECONCILE phase, 2026-09-18.** Branch `dashboard-frontend`, working dir
`dashboard/`, 12c's build + test + adversarial uncommitted on `cb8a3c7`. **Nothing was committed,
nothing was staged, nothing was deployed, no spec file was edited, and this phase did not contact
`192.168.4.71` at all** — no SSH, no HTTP, no D-Bus socket opened and therefore none left open.

---

## 1. Adjudication

Eleven findings, **none rejected.** Seven are fixed here, two are upheld and deliberately NOT
fixed because each needs a ruling rather than an implementation, one is pinned in part, and one is
upheld in kind with its numbers corrected.

| # | finding | verdict | what happened |
|---|---|---|---|
| **A1** | a wire-refused row makes the GPU card say **`no instance`** | ⚠⚠ **UPHELD — governing** | **Fixed at the seam** (§2). `servedBy` no longer takes an array; `Sample` no longer drops the refusal count |
| **A2** | a permanently-present entry absorbs the next real failure of the same source | ⚠⚠ **UPHELD in part, and the masking is fixed** | the event log now debounces **what a lost source says**, not merely that it says something (§4). The header half is ratified behaviour — recorded as `12c-Q4`, not changed |
| **A3** | the load-dependent ledger is not step 05's alone | **UPHELD IN KIND — numbers CORRECTED** | its `ring`/`series` figures are not reproducible; re-measured under three stated loads (§7). The 24 ⚠ marks are real and are deferred with an owner |
| **A4** | the refused row's `ErrorSource` has no test at all | **UPHELD — fixed** | pinned two ways: the literal, and the PROPERTY it was argued from (§5) |
| **A5** | `enumerationsRead`'s parameter defaults the unsafe way | **UPHELD — fixed structurally** | the default is gone, and could not come back: the argument is a type now, not a number (§2) |
| **A6** | one refused row freezes retirement for every other instance, forever | **UPHELD — NOT fixed, and one fix did not close it** | §6. It is §9's own ratified unbounded staleness reached through a new door; narrowing it is a §9 ruling (`12c-Q2`) |
| **A7** | both browser guards are ungraded, and `assertPortFree` fails open | **UPHELD — fixed** | the verdict is a TCP connect now, and both bodies are run against real sockets by four tests and three mutations (§5) |
| **A8** | `compareInstances` is not a total order | **UPHELD — fixed** | the comparator has no `Number()` left in it; totality is asserted over the identities the GRAMMAR admits (§5) |
| **A9** | one identity can arrive in two spellings in one array | **UPHELD as described — the reachable half is now pinned** | the TIE it produces is a test and a mutation (`12c-R7`). Whether the wire should REFUSE a duplicate identity is `12c-Q6` |
| **A10** | every row refused reads as "no llama-server instances discovered" | **UPHELD — NOT fixed** | the headline is panel copy nobody has ruled on (`12c-Q5`). The seam makes it a one-line change the day there is wording |
| **A11** | six one-line reverts stay green | **UPHELD — all six closed** | §5. Two were provably dead guards and were **deleted**, each replaced by an asserted invariant plus a mutation |

**Counts: 11 adjudicated · 0 rejected · 7 FIXED here** (A1; A2's masking half; A4; A5; A7; A8; and
all six of A11's reverts) **· 1 pinned in part** (A9 — the tie it produces is now a test and a
mutation; whether the wire should refuse a duplicate identity is a ruling) **· 2 upheld and
deferred to a ruling** (A6, A10) **· 1 upheld in kind with its numbers corrected** (A3).

Two more things were fixed as a consequence rather than on their own account: the build's §6 Q7
*new path* (a snapshot whose only row was refused printed `served by instance 0`), and the build's
§8.2, which is **corrected in place** (§8).

---

## 2. A1, closed at the seam — the join is handed the answer to *"was this complete?"*

**The defect, in one sentence.** The build routed `servingRowsRefused` → `enumerationsRead` →
§9's ledger, and left §6.2's join reading the bare array: `servedBy(snapshot?.serving ?? null,
index)` had no way to ask whether the array had been cut, so a row dropped for a bad `port`
rendered the GPU card as **`served by · no instance`** — `unserved`, which `gpu-panel.tsx`'s own
comment defines as *"every list was READ and none of them names this card … we looked, and nobody
claims it."* That is the retirement defect the TEST phase closed, one panel over, and a direct
contradiction of the sentence the owner ratified into §9 on 2026-09-18: **"The collection was read
successfully and the client discarded part of it, which is not the same as the server not
reporting it."**

### 2.1 ⚠ Where the fact was actually being dropped, which is not where it was being read

The call site was the symptom. The fact stopped **one layer earlier**, in a type:

```
parseSnapshot  →  WireSnapshot { snapshot, tsMs, servingRowsRefused }   ← both halves here
appendSample   →  Sample       { ts, tsMs, snapshot }                   ← ⚠ the count is DROPPED
GpuPanel       →  servedBy(sample.snapshot.serving, index)              ← can only see a short array
```

`Sample` is the only thing a panel ever sees, and it carried the snapshot and nothing else. Passing
a second argument at `gpu-panel.tsx:149` would have been impossible to write honestly — the panel
does not have the number — and the version that *is* writable (thread the count through `Sample`
and pass two arguments) is the shape that took three phases to close in 12b: a rule stated at a
call site rather than in the thing being handed round.

### 2.2 What was built

**§4's `serving[]` is not handed out as an array any more.** `lib/client/wire.ts` gains

```ts
export type ServingEnumeration =
  | { read: 'none' }                                            // serving: null — nothing read
  | { read: 'partial'; rows: ServingInstance[]; refused: number }  // the server sent more
  | { read: 'all'; rows: ServingInstance[] };                   // every row is here
```

with **one constructor** (`servingEnumeration(rows, refused)`, and `refused` is required), carried
on `WireSnapshot.serving`, copied to `Sample.serving` by `appendSample` — the only place a `Sample`
is ever built — and consumed by **both** readers: `servedBy(serving, index)` and
`enumerationsRead(snapshot, serving)`.

| property | why it is the seam and not a patch |
|---|---|
| `servedBy` cannot be called with an array at all | a caller that has only the rows gets a **compile error**, not a wrong page. There is nothing to forget |
| `Sample.serving` is **required** | a `Sample` is not constructible without the answer to *was this complete?*, and `appendSample` derives it from the `WireSnapshot` that has both halves |
| the ledger and the join take the **same value** | §9 and §6.2 cannot be told different things about one array — which is exactly what happened here |
| `rows` is the **same array** as `snapshot.serving` | asserted by identity in `wire.test.ts`, so the two cannot drift apart |

**The rule, stated once, on `servedBy`:**

> **An incomplete list may only produce a POSITIVE answer.** `declared`, and an `indexed` that
> actually found its row, rest on a row this client read. `unserved` (*we looked, and nobody claims
> it*) and an `indexed` with **no** instance are claims about rows that are not here, and after a
> refusal we do not know what was in them. Both become `unknown` — §6.2's em dash, invariant 1, the
> honest branch that already existed one line away.

### 2.3 What it changes on screen, measured

| snapshot | before | after |
|---|---|---|
| both rows valid | `served by instance 1 · gemma-4-31b` | unchanged |
| **row 0 refused for `"port": "nope"`, card 0** | **`served by · no instance`** | **`served by · —`** |
| instance 1 genuinely left the machine | `served by · no instance` | unchanged — **and no longer identical to the row above** |
| an instance present with `gpus: null` | `served by · —` | unchanged |
| a snapshot whose ONLY row was refused | `served by instance 0` (build §6 Q7's new path) | `served by · —` |
| `serving: []` on a pre-`gpus` server | `served by instance 0` | unchanged — Q7's own case is `read: 'all'` |
| `serving: null` | `served by instance 0` | unchanged — `read: 'none'` is a third state, not a fourth spelling of complete |

⚠ **`unknown` now has two producers and one rendering, and that is correct rather than a
conflation.** *An instance's `gpus` could not be read* and *a row of the list was refused* are
different failures with the same honest answer, and §6.2 gives that answer one spelling. What tells
them apart is the `errors[]` entry, and **both land on the SERVING panel**, which is where this
cell's explanation has always lived. Splitting them needs a fifth variant and new panel copy —
`12c-Q1`, the owner's.

### 2.4 ⚠ The anti-vacuity half, because "always answer `unknown`" would pass every test above

A page that can never say *nobody serves this card* cannot show a **mis-pinned instance** either,
which is the property the whole inversion was built for. Every assertion added for A1 has its twin:
the same rows with nothing refused still give `unserved`; a row that IS present still wins on a
partial list and renders a strip **byte-identical** to the complete-list one; and `12c-R5` is a
mutation that returns `unknown` unconditionally, which `observations.test.ts` and
`gpu-panel.test.tsx` both redden.

---

## 3. A5, closed by the same change — a default that reintroduced a closed bug

`enumerationsRead(snapshot, servingRowsRefused = 0)` defaulted the **unsafe** way: `0` asserts *the
enumeration WAS read*, so a caller that had not been updated retired an instance for a validation
failure — the exact defect the argument exists to close. Its doc claimed the opposite by analogy
with `PollOptions.enumerationsRead`, which defaults to the **empty set** and therefore retires
nothing; the two point in opposite directions.

There is now **no default to get wrong**, and the fix was free: the second argument is a
`ServingEnumeration`, which cannot be conjured out of nothing. ⚠ **This was not theoretical** — the
compiler found a live caller the moment the default came off: `events.test.ts`'s `Session` harness
had been calling `enumerationsRead(snapshot)`, silently asserting that every snapshot it polled had
a fully-read serving enumeration.

---

## 4. A2 — the masking, fixed; the header half, ratified and recorded

**Two mechanisms key on presence-of-a-source rather than on the event.** The adversarial measured
both against the unit-name miss, which is filed under `dbus` on every poll for as long as an
unrecognised `*.env` sits in `/etc/llama-server`:

```
quiet box, the bus dies               -> ["source-lost dbus"]
a stray backup.env, then the bus dies -> ["source-lost dbus"] at the MISS's edge, t=10s
                                         the OUTAGE at t=20s logged NOTHING
```

**Fixed, in `events.ts`:** the per-source debounce now folds `errors[]` into a **set of messages**
per source and keys its `logged` mark on `band + what the source is saying`. A source that is
already lost and starts saying something new emits one more `source-lost` line, `lost → lost`,
whose `detail` names **the message that is new** rather than the one that has been there all week.
`describeEvent` renders `source-lost` as `<source> stopped answering — <detail>` and reads neither
band, so no panel copy changes.

Three details, each of which was a failing test before it was a line of code:

- **a SET, sorted** — `errors[]`'s order is §4's concatenation order, and two collectors filing for
  one source may swap without anything having changed;
- **updated only while the source is present this poll** — a source that has left `errors[]` but is
  still inside §6.4's ten seconds says nothing, and reading that as *the set changed* logs a
  spurious line on the way to a recovery;
- **the detail is what was ADDED** — the outage entry is appended *before* the miss, so the last
  message is the miss in both snapshots above and keying on it would still log nothing useful.

⚠ **This is §6.7's own requirement of that text, not a new idea:** *"A skipped call and a failed
call must not read alike … it is the only signal that a source is wedged rather than merely
broken."* A log that can never show the second sentence does not meet it.

**The header half is correct behaviour and was left alone.** `failingSourceCount` counts §3.7
*sources unread*, which is what §9's row says and what the owner ratified in 12a; a stray `.env`
plus a dead bus really is *one source we cannot read*. It is recorded as `12c-Q4` rather than
changed, and the asymmetry is now deliberate: **the log escalates, the count does not.**

---

## 5. The rest of the adversarial's list

### A4 — the refused row's source, pinned twice

`WIRE_REFUSAL_SOURCE = 'llama-env'` was argued at length and asserted nowhere: the adversarial set
it to `'llama-models'`, `'dbus'` and `'ufw'` and the whole suite stayed green each time — with
`'ufw'` the note explaining a vanished SERVING row renders under **SAFETY**.

Both halves are now asserted, because neither alone is the claim: the **literal** (which
`'llama-models'` alone would survive, since it reaches the same panel) and the **property it was
argued from** — *"it reaches exactly the SERVING panel, which is the panel a missing row is missing
from"* — asserted through `errorsForPanel` over all eight panels rather than by naming the source a
second time. The silence is now a real question rather than an unguarded guess (`12c-Q3`).

### A7 — the port guards

**(a) The fail-open.** `assertPortFree` fetched `/login` with a 2 s deadline and `catch { return; }`
— it read *any* rejection as *nothing is listening*, while the occupant it exists to catch is a
`next dev` that holds the port and does not answer for many seconds (the harness's own
`waitForServer` allows **60 000 ms** for that same URL). **The question is whether the port is
BOUND, so the check is a TCP connect** — which is what the error message has always named (`lsof`)
and what `next dev` itself races for. A listening socket completes the handshake in the kernel
however busy the process is. Both loopback families are probed, and a connect **timeout** counts as
bound.

**(b) Neither body was graded.** `TERMS` grades the CALL SITES; the bodies were reachable by no
test, and short-circuiting either left 3686 tests passing. `measurement-harness.test.ts` now runs
them **in a child node process against real sockets** — the same argument that file already makes
for the credential shim — across four cases: a free port passes (the anti-vacuity term), a
bound-but-silent port is refused, an answering port is refused with its status and `lsof` in the
message, and `assertServerAlive` passes a live child while refusing both a non-zero exit and a
signal. Three mutations (`12c-MH22`…`MH24`) are the wrong implementations they catch.

⚠ One deliberate addition: `assertPortFree(port, answerDeadlineMs)`. It changes only how long the
**failure message** waits for a status — never the verdict — and it exists so these tests assert
behaviour in milliseconds instead of spending the deadline proving that a silent occupant is still
an occupant. (`12c-A3`'s family: no assertion added by this phase is a wall-clock measurement.)

### A8 — the comparator, made total

`compareInstances` claimed in its own doc that *"two different identities never compare equal"* and
that a set has *"exactly one ordering … independent of the order they arrived in."* Both were false
as written, because `isInstanceId` admits a canonical decimal of **any length** and `Number()` does
not:

```
compare('9007199254740993', '9007199254740992') = 0    ← two DISTINCT identities, EQUAL
compare('111…1' (400 digits), '222…2')          = NaN  ← Infinity - Infinity
```

A tie sends the join to array position, so the same rows in two orders put a different model on a
card; a NaN leaves `Array.prototype.sort` implementation-defined, which is the non-determinism the
ordering rule exists to remove. **Canonical decimals compare exactly by LENGTH, then by code
point** — no leading zeros means the longer string is the larger number, and at equal length the
digits already sort by value. There is now **no `Number()` anywhere in the comparator**, and
totality is asserted over a set that straddles every branch (`compare(a,b) === 0` iff `a === b`,
plus antisymmetry, over 121 pairs).

### A11 — the six reverts, closed, and the two dead guards deleted rather than pinned

| # | the line | closed by |
|---|---|---|
| 1 | `instanceId`'s `\|\| value < 0` | **deleted.** `String()` prefixes a `-`, so canonicality already refused every negative — the clause could not fail. Three negatives are now in `wire.test.ts`'s refusal table, and `12c-R9` takes the canonicality check away |
| 2 | `servingUnitLabel`'s `endsWith(UNIT_SUFFIX) ? … : unit` | **deleted.** Every value the mapping produces ends in `.service`, so the `: unit` arm was unreachable. Replaced by an invariant asserted over the TABLE's own keys (`NAMED_INSTANCES`), with `12c-R8` listing a unit as `llama-split.socket` |
| 3 | the claimant reduce's `< 0` | **tested.** The tie is reachable through §3's number bridge — `0` and `"0"` are one identity — so two rows can carry it; `12c-R7` is `<= 0` |
| 4 | `WIRE_REFUSAL_SOURCE` | **tested** (A4 above); `12c-R13` is the `'ufw'` variant, which moves the note off SERVING and under SAFETY |
| 5 | `assertPortFree`'s body | **tested behaviourally** (A7 above); `12c-MH22` |
| 6 | `assertServerAlive`'s body | **tested behaviourally** (A7 above); `12c-MH23`, `12c-MH24` |

⚠ **A guard that cannot fail is not protection — it is an unchecked second statement of a rule**,
and it is the line a reader trusts when they ask *"are negatives handled here?"*. Both dead guards
were replaced by a **checked invariant plus a mutation**, which is strictly more than the guard
claimed and, unlike the guard, can fail.

**The revert sweep, before and after: 6 → 0.** All six now redden a test. Eleven new mutations in step
08's ledger and six in step 10's are the wrong implementations that make them so.

---

## 6. ⚠ A6 is the same seam and ONE FIX DID NOT CLOSE IT — stated, as the handoff asked

The handoff expected one fix to close A1 and A6 together. **It does not, and here is exactly why.**

A6 is: while any row is refused, `SERVING_ENUMERATION` is absent from `enumerationsRead`, so an
instance that **genuinely left the machine** can never retire — and if its last band was `alarm` it
pins the banner and the count indefinitely. The seam fix does not touch that: the rule *one refusal
suppresses the whole enumeration* is unchanged, and it is unchanged **on purpose**, because a row
may have been refused *for its `instance`* and the client then has no identity to exclude.

Two things are worth separating, and the adversarial's write-up runs them together:

- **"Forever" is §9's own ratified behaviour, reached through a new door.** `lib/conditions.ts`:
  *"Staleness is deliberately unbounded. An expiry would be a clock that silently turns an alarm
  green."* A refused row makes the serving conditions **stale**, which is what §9's amended row now
  requires in as many words. The alarm staying is the CORRECT direction; what is new is only that a
  client-side validation failure can hold it there.
- **What is genuinely missing is narrower than "it never retires".** When a refused row's own
  `instance` field validates — a bad `port`, a bad `health`, anything but the identity — the client
  **does** know which subject it failed to read, and could retire every other instance normally.
  That is a real improvement and it was NOT built, because it is a §9 semantics change: §9 says an
  enumeration is read or not, and *"read in part"* needs both a ruling and a per-subject exclusion
  in `observePoll`, whose blast radius is the whole conditions layer. It is `12c-Q2`, with proposed
  wording.

**What the seam fix does buy A6**, and it is not nothing: the state is no longer invisible. A
refused row now changes what the GPU card says (§2.3), the `llama-env` entry is on the SERVING
panel, and — after §4 — a *second* failure of that source escalates in the event log instead of
being swallowed.

---

## 7. A3, re-measured, with the load stated each time

⚠ **The adversarial's numbers are not reproducible and must not be quoted.** It reported
`ring.test.ts`/`series.test.ts` ⚠ tests at **2.3–4.3 s** against vitest's 5 s default, i.e. a
near-miss with 0.75 s of headroom. The parent could not reproduce it (1.64 s for both files
together), and neither could this phase.

**Re-measured here, three times, on this Mac (10 cores), `vitest run lib/client/ring.test.ts
lib/client/series.test.ts`, per-test durations read from vitest's own JSON reporter.** Load is
stated for every column, and it is the whole point of the table:

| | **idle** — nothing else running, no harness, no `pnpm verify` | **2× oversubscription** — 20 busy loops on 10 cores | **4× oversubscription** — 40 busy loops |
|---|---|---|---|
| `ring.test.ts`, 16 tests | **1421 ms** | 4017 ms | 7161 ms |
| `series.test.ts`, 24 tests | **343 ms** | 1002 ms | 1839 ms |
| wall clock, both files | **1878 ms** | 6054 ms | 9020 ms |
| ⚠ *8192 samples are all held, and the 8193rd evicts the oldest* | **375 ms** | 1156 ms | 1632 ms |
| ⚠ *an evicted ts leaves the dedupe key set…* | **389 ms** | 1087 ms | 2015 ms |
| ⚠ *eviction is oldest-first…* | **364 ms** | 1008 ms | 2011 ms |
| ⚠ *an excursion inside the window is drawn…* | **307 ms** | 910 ms | 1606 ms |
| ⚠ *two hours at 1 s fits the window with headroom to spare* | **286 ms** | 758 ms | 1492 ms |
| exit | **0** | **0** | **0** |

**The slowest single test is 389 ms at idle against vitest's 5 s default — a 12.8× margin — and
2015 ms at FOUR times oversubscription, still 2.5× clear.** The adversarial reported the same five
tests at 2327–4253 ms idle and 4055–16895 ms under 2× load, i.e. **an order of magnitude above
every figure here, in both columns**, and reported four of them FAILING under a load at which they
pass here with 4 s to spare. Nothing in the tree explains the gap; what is reproducible is the
shape (these tests do slow under load, roughly linearly) and not the magnitude, so **the
near-miss is withdrawn and the sensitivity is kept.**

⚠ **And the concern earned itself a fresh, unplanned instance in this phase's own runs** — see §9:
step 05's first run exited 1 on `DID NOT BITE: 05-I3`, a mutation of `lib/collectors/io.ts` this
loop never touched, and the identical command on the identical tree reddened it on the next run.
That is the same defect the adversarial describes, measured on a different mutation, without being
looked for.

**The underlying concern is real and is NOT closed here.** **24 ⚠ marks across five harnesses have
a wall-clock measurement for a verdict** (03: 3, 04: 5, 05: 12, 06: 2, 07: 2 — the adversarial's
census, which is a static count and is sound). A ledger whose verdict depends on machine load is
evidence that is sometimes not there, and step 05's `05-I2` reddening 2 tests on one run and 3 on
another is a measured instance of it. It belongs to the steps that own those bounds, it is nobody's
loop today, and it is carried in HANDOVER §9 with an owner.

⚠ **The rule this earned:** a finding about flaky evidence must not itself rest on an unrepeatable
measurement. Re-measure before quoting, and say what else was running.

---

## 8. `12c-build.md` §8.2, corrected in place

The build recorded *"step 05, first — 3 ANCHORS MOVED, exit 0"* and drew from it: *"Read the anchor
report, not the exit code … a build that trusted the exit code would have shipped with three
mutations silently not running."* **The harness cannot exit 0 with moved anchors.** The test phase
settled it three ways — by reading all ten harnesses (`if moved or bad or ambiguous: return 1`
before the ledger, `sys.exit(main())` as the entry point, at `cb8a3c7` and now), by a probe forcing
the `moved` path in all ten (`exit=1`, ten for ten), and by reproducing the cause: **the status was
read through a pipe**, which reports its last stage.

§8.2's row and the paragraph under it are corrected in the build's own file, with the four-row pipe
table as the evidence and a note that the *lesson* survives for a different reason: read the anchor
report, and **never read a harness's exit status through a pipe**. The stale mutation counts in the
same section now carry a pointer to §9 below.

---

## 9. Measurements

Every figure is quoted from the command's own output. **All five harnesses were run serially, one
at a time, never two at once, none killed, and no exit status was ever read through a pipe** — each
was `python3 …/regressions.py > log 2>&1` with `$?` written straight to a status file. `pnpm verify`
was never run beside a harness.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/03-collectors-gpu-host/regressions.py
python3 pipeline/steps/06-telemetry-route/regressions.py
python3 pipeline/steps/08-client-runtime/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

### `pnpm verify` — **exit 0**

```
Test Files  109 passed (109)
      Tests  3810 passed (3810)
Type Errors  no errors
```

**3810, up from the test phase's 3786** — 24 added here across nine files; no new test file.

### The five harnesses, with their anchor reports

| harness | run | exit | mutations | red | ⚠ checked | what the report said |
|---|---|---|---|---|---|---|
| `03-collectors-gpu-host` | 1st | **0** | 73 | 115 | 25 | clean — **identical to 12b's, the build's and the test phase's columns** |
| `06-telemetry-route` | 1st | **0** | 63 | 88 | 56 | clean — identical to the same three |
| `08-client-runtime` | 1st | **1** | 228 | 416 | 303 | `NO MUTATION REDDENS` — one ⚠ test of this phase's own (below) |
| | 2nd | **0** | 229 | 417 | 303 | clean |
| | 3rd | **0** | **230** | 417 | 303 | clean — `12c-R13` added, because §5's A11 table claimed a mutation for `12c-A4` that did not exist |
| `10-panels-assembly` | 1st | **1** | 356 | 541 | 374 | `NO MUTATION REDDENS` — one ⚠ test of this phase's own (below) |
| | 2nd | **0** | **357** | 542 | 374 | clean |
| `05-collectors-serving-storage-safety` | 1st | **1** | — | — | — | ⚠⚠ `DID NOT BITE: 05-I3` — **not this loop's, and not this loop's file** (below) |
| | 2nd | **0** | 174 | 280 | 173 | clean, same tree, nothing changed between them |

**Zero `ANCHOR NOT FOUND` / `ANCHOR AMBIGUOUS` / `ANCHORS MOVED` / `DID NOT BITE` /
`NO MUTATION REDDENS` / unmatchable keys on the final run of every harness, and every ⚠-marked test
went red under at least one mutation** — grepped from each log, never read off an exit code, and
never through a pipe.

#### ⚠⚠ Both `NO MUTATION REDDENS` complaints were the harness doing its job, and both name the SAME omission

| harness | the inert ⚠ test | why the mutations written for the finding could not reach it | what was added |
|---|---|---|---|
| 08 | *a row that IS here still wins on a partial list — the refusal blanks nothing it did read* | `12c-R3`/`R4`/`R5` all act on answers reached **after** the claimant search, so none of them can blank a row that was found | **`12c-R12`** — the over-broad fix: completeness checked at the top, `unknown` for every card |
| 10 | *a port NOTHING is listening on passes — or every case below is vacuous* | `12c-MH22` makes a held port look free; nothing made a free port look **held**, and that direction breaks every harness run | **`12c-MH25`** — a connection refusal read as an occupant |

⚠ **Both are the anti-vacuity half of this phase's own fixes**, and the pattern is worth naming:
the mutations you write for a finding are the ones that re-create the finding. The direction your
fix could over-shoot in is the one you are blind to, and the ledger is what sees it.

#### ⚠⚠ Step 05's first run is a live instance of `12c-D1`, and it was not looked for

```
--- 05-I3 the pipes are left held, so a descendant holding stdout is never bounded
    exit=0  Tests  26 passed (26)  red=0          ← run 1: DID NOT BITE, harness exits 1
    exit=1  Tests  1 failed | 25 passed (26)      ← run 2: same tree, same command, bites
```

`lib/collectors/io.ts` and `lib/collectors/io.test.ts` are **not in `git status`** — this loop has
never touched either. `05-I2` reddened **3** tests on both runs here, where the test phase saw 2 on
one and 3 on the next. So the load-dependence the adversarial described is real, it is not confined
to `05-I2`, and it produces **`DID NOT BITE` as well as `NO MUTATION REDDENS`** — the first of which
reads like a badly-written mutation rather than a timing artefact. Recorded as `12c-D1` (HANDOVER
§9) and **not fixed here**: `io.ts`'s bounds are step 5's, with their own blast radius.

### The browser measurements

**`measure-breakpoints.mjs` — exit 0, `102 passed, 0 failed, 0 blocked, 102 total`**, unchanged
count, first run, `next-env.d.ts` restored (the harness says so and `git status` agrees). ⚠ It is
also the first real exercise of the rewritten `assertPortFree`: it passed a genuinely free port
without a false refusal, which is the direction `12c-MH25` now guards.

**`measure-arrangements.mjs` exit 0; `check-density.mjs` — `ALL PASS`.**

The four figures the earlier phases named, from this run — all reproduce:

| claim | measured here |
|---|---|
| the panel 0.8 px from its cap at 1600 | **`gpu0 by 0.8 px`** |
| the tightest of all | **`cpu by 0.7 px`**; `serving by 1.3 px`, `gpu0 by 1 px` |
| §6.1's no-scroll promise in split mode | **`spare 263 px`** at 1280, **228** at 1600, **284** at 1920 |
| SERVING's own slot | **103.8–104 px** per-GPU, **97 px** split at 1280, **76 px** at 1600 |

### `git status`

**55 entries: 46 modified, 9 untracked. Nothing is staged and nothing is committed.**

```
untracked: lib/units.test.ts
           pipeline/handoffs/12c-{adversarial,named-instances,reconcile,test-phase}.md
           pipeline/steps/12-deploy/12c-{build,test,adversarial,reconciliation}.md
```

⚠ **`next-env.d.ts` is NOT in the list** — both browser harnesses restored it, and the listing was
taken after the last run finished, which is the only time it means anything.

⚠ **`SPEC.md` and `pipeline/WORK-ITEMS.md` are in the 46 and are not this phase's.** They are the
owner's 02:29:55 ratification of the test phase's §9 finding, and this phase quotes the new
sentence as evidence without touching either file. ⚠ Two of the 46 are the build's, not this
phase's, and are the reason harnesses 03 and 06 were run at all: `lib/contract.test.ts` and
`lib/telemetry/snapshot.test.ts`.

**No source file is left mutated.** Every harness restored what it touched, and the anchor census
(1571 for 1571) was re-run against the tree afterwards.

### ⚠ The five harnesses were DERIVED, not inherited

The build's §8.4 lesson, applied again: every `regressions.py` was imported and its `LEDGER_FILES`
intersected with the files `git status` reports as modified. **Five own at least one**, and the two
that would be easy to miss are there for the same reason as last loop — 03 owns `lib/contract.test.ts`
and 06 owns `lib/telemetry/snapshot.test.ts`, neither of which this phase edited, both of which the
BUILD edited and which are still dirty. Steps 02, 04, 07, 09 and 11 intersect empty and were not run.

### The mutation ledgers

**1571 mutations across the ten harnesses, 1571 unique ids, zero cross-harness collisions** —
re-derived by importing each `regressions.py` and reading `len(REGRESSIONS)`, never by `grep -c`.
1554 at the end of the TEST phase, so **this phase wrote 17 and re-aimed 18**:

| harness | test phase | now | this phase |
|---|---|---|---|
| 02 / 03 / 04 / 06 / 07 / 09 / 11 | 66 / 73 / 94 / 63 / 158 / 153 / 203 | unchanged | 0 |
| 05 | 174 | 174 | 0 |
| **08** | 219 | **230** | **11** (`12c-R3`…`R13`) |
| **10** | 351 | **357** | **6** (`12c-GP22`, `GP23`, `MH22`…`MH25`) |

**Eighteen anchors were re-aimed**, every one because this phase's own fixes moved the expression
and none because a mutation was weakened: `08-O14`, `08-E10`, `08-E14`, `12b-OB1`, `12b-OB2`,
`12b-OB3`, `12b-OB5`, `12b-OB10`, `12c-OB11b`, `12c-N10`, `12c-N12`, `12c-N15`, `12c-WR17`,
`12c-T02`, `12c-T03`, `12c-T04`, `12c-T05` in step 08, and `10c-GP4` in step 10. Each still removes
exactly what its name says — `08-E14` ("the FIRST message per source wins") is now `push` → `unshift`
on the message set, and `12c-T02` ("the refusal count is thrown away") is now the count replaced by
a literal `0` inside `servingEnumeration`.

⚠ **Before paying for any harness run, every anchor in all ten ledgers was checked to match its
source exactly once** — 1571 for 1571. That is the cheap version of `ANCHORS MOVED`, and it caught
nine anchors this phase's own edits had orphaned in files it was not thinking about.

---

## 10. Files changed by this phase

| file | what |
|---|---|
| **`lib/client/wire.ts`** | ⚠⚠ `ServingEnumeration`, `servingEnumeration`, `SERVING_NOT_POLLED`; `WireSnapshot.servingRowsRefused` → `serving`; the dead `\|\| value < 0` deleted |
| **`lib/client/observations.ts`** | ⚠⚠ `servedBy` takes the enumeration and may not answer negatively from a partial list; `enumerationsRead`'s default removed |
| **`lib/client/ring.ts`** | ⚠⚠ `Sample.serving` — the seam. `appendSample` is the one constructor |
| **`lib/client/events.ts`** | ⚠⚠ the source debounce keys on what a lost source SAYS (A2) |
| **`lib/units.ts`** | ⚠ `compareInstances` is total for every identity the grammar admits; `byCodePoint`; `NAMED_INSTANCES`; the dead `endsWith` guard deleted |
| `lib/client/runtime.ts` | passes `wire.serving` |
| `components/panels/gpu-panel.tsx` | the join is handed the SAMPLE |
| `lib/fixtures.ts` | `wireRead` / `wireRefused` — the two ways to build a `WireSnapshot`, with the completeness in the NAME |
| `components/panels/test-support.ts` | `stateWithRefused`, and `ringOf`/`ringOfSeries` through `wireRead` |
| **`pipeline/steps/10-…/server-log.mjs`** | ⚠⚠ `assertPortFree` asks whether the port is BOUND; `portHolder`; the diagnostic deadline |
| `lib/client/{wire,observations,events,ring,series}.test.ts`, `lib/units.test.ts` | the new assertions; the hand-built wire snapshots |
| `components/panels/{gpu-panel,panel-chart}.test.*`, `app/{collector-visibility,dashboard-shell}.test.tsx` | the refused-row render; the fixtures |
| `measurement-harness.test.ts` | ⚠⚠ the four behavioural port-guard tests |
| `pipeline/steps/{08,10}/regressions.py` | +14, 18 re-aimed |
| `pipeline/steps/12-deploy/12c-build.md` | §8.2 corrected |
| `pipeline/HANDOVER.md`, this file | the handover rewrite |

---

## 11. Owner questions raised by this phase

Six, carried into HANDOVER §8 with their proposed wording. **Two are ⚠⚠.**

| id | question |
|---|---|
| ⚠⚠ **`12c-Q1`** | **What does a GPU card say when the serving list was read in PART?** Built as invariant 1's em dash, because an incomplete list cannot support *nobody serves this card*. §6.2 has no wording for it, and it now renders identically to *a `gpus` we could not read* |
| ⚠⚠ **`12c-Q2`** | **May an enumeration be read in PART for §9's purposes?** Today one refused row freezes retirement for every instance for as long as it lasts (A6). When the refused row's own `instance` validates, the client knows which subject it missed and could retire the rest |
| `12c-Q3` | **Should a CLIENT-MINTED entry have its own `ErrorSource`?** `llama-env` is now pinned by a test, and A2 is what the shared slot costs: a permanently-present entry occupies a source's presence |
| `12c-Q4` | **Does §9's header count SOURCES or FAILURES?** Ratified as sources in 12a, so a stray `.env` plus a dead bus reads `1 source unread`. The event log now escalates where the header does not |
| `12c-Q5` | **The SERVING panel's headline when every row was refused** (A10) — *"no llama-server instances discovered"* is a positive claim, and *discovered* is the server's word for something the server did do |
| `12c-Q6` | **Should the wire refuse a DUPLICATE identity in one `serving[]`?** `0` and `"0"` both validate to `'0'`, giving two rows under one React key and one `health:0` condition (A9) |

---

## 12. Rules observed

- **Nothing was committed and nothing was staged.** No `git add`, no `git checkout --`, no push.
- **No spec file was edited.** `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are
  untouched; every wording this phase wants is quoted in §11 instead.
- **No harness ran beside another, none was killed, and `pnpm verify` never ran beside one.** No
  `pgrep`. Every exit status was written to its own file with `$?`, never read through a pipe.
- **The box was not contacted.** No SSH, no HTTP to `192.168.4.71`, no D-Bus socket opened.
- Nothing was deployed, and `next-env.d.ts` is byte-identical.
