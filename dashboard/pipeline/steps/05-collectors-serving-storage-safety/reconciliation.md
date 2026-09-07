# Step 5 — reconciliation: serving, storage and safety collectors

**Green, by exit code.** Real output in §6. The step is closed.

```
pnpm verify   ->  Test Files 24 passed (24) · Tests 1269 passed (1269) · Type Errors no errors · exit=0
```

The review's verdict — *"the step is sound and must not be redone"* — was adopted. Its MUST
list was executed in full, then its SHOULD list. **One deviation and three ledger judgements
are argued below**; everything else follows the review as the plan of record.

Step 5 closed the build at 1232 tests; this phase leaves **1269** and **127 + 74 + 64 + 40
mutations** across four harnesses, all biting, both ledgers clean.

---

## 1. What changed, and why

### F1 — two budgets, one of them minted PER INSTANCE (`serving.ts`)

The whole of §3.4 shared one `deadline(4000)` across the listing, every env `readFile` and
every HTTP probe, and `probe`'s catch mapped **any** rejection — including the shared
deadline's own — to `health: 'unreachable'`, which `severityHealth` bands **alarm**.

§6.7 now forbids it in as many words: *"A collector's budget bounds the collector's wall
clock; it is never evidence about a subject… A verdict of failure — `unreachable`, `false`,
`inactive` — may be minted only from an answer, or from a bound that applied to that subject
**and to nothing else**."*

`CollectServingOptions` now carries **three named bounds** and `SERVING_TIMEOUT_MS` is gone:

| option | default | covers | a failure means |
|---|---|---|---|
| `discoveryTimeoutMs` | `SERVING_DISCOVERY_TIMEOUT_MS` 2000 | the `readDir` and every env `readFile` | `port`/`ctx` `null` + `llama-env`, and therefore `health: null` down the **existing** `env.port === null` path |
| `probeTimeoutMs` | `SERVING_PROBE_TIMEOUT_MS` 4000 | **one instance's** `/health` then `/v1/models` | `unreachable` + `llama-health` — correct, and §3.7 names it |
| `dbusTimeoutMs` | `DBUS_TIMEOUT_MS` 2000 | the `llama-server@<i>` conversation | `unitState: null` + `dbus` |

The per-instance budget is opened **inside `instances.map`**, one line:

```ts
const probed = await probe(http, deadline(probeBudget, SERVING_PROBE_TIMEOUT_MS), env, probeBudget);
```

Three consequences, and none of them is a value someone has to remember to return:

1. **The pathological mapping is unreachable, not caught.** No new `health` value, no new
   branch in `probe`, no change to `deadline.ts`.
2. **`health: null` is still minted only where §3.7 means it** — the existing `env.port ===
   null` guard. HANDOVER's do-not-copy #4 holds: it is not a placeholder for a budget.
3. **§6.5's "the other instance is unaffected" is structural.** It held before only because
   `Promise.all` runs instances concurrently — a scheduling choice, not a guarantee.

**I took the review's structural fix and rejected the adversarial's cheaper one**, and its own
log is the evidence: with ~5 ms left both probes were *started* (`A2 http calls actually made:
["…:8080/health","…:8081/health"]`), so a "rejected without being started" discriminator would
have classified both as *started and timed out* and reported `unreachable` again.

⚠ **Wall-clock ceiling is now `discovery + max(per-instance)` = 6 s, not 4 s**, because
discovery is necessarily sequenced before the probes. Reached only when both halves wedge.
Stated at the module doc and in HANDOVER, **not** hidden by shrinking the probe budget — 4 s
is the one number here derived from a measurement (a 14 s cold prefill answers `/health` from
the same thread).

Tests: three new ones under `the budget is never evidence about a subject (§6.7)`, plus the
late-start discriminator. Mutations **V19, V20, V21, V22, V23**.

### F2 + R1 — the class was 0-for-2. Both seams closed, and a third rule added

`boundedTimeoutMs` was called from **exactly one place in the whole tree** (`deadline.ts:89`).
`http.ts:120` and `io.ts:191` were both bare `setTimeout(…, timeoutMs)`.

- **`http.ts`** gains `HTTP_TIMEOUT_MS = 4000` and computes `bound` once, for **both** the
  delay and the message.
- **`io.ts`** gets the identical treatment against `NVIDIA_SMI_TIMEOUT_MS`.
- **`dbus.ts`** — R3's new connect timer uses it too, so all three seams are validated.

The reframing the review made is the important half and is recorded at `io.ts`: this is **not**
"step 5 copied a forbidden pattern from step 4". The pattern was in the seam layer from step 3,
`deadline.ts` was hoisted in step 4 to fix the *collector* sites, nobody went back to the seams,
and step 5 added a second instance of the untouched original.

**The third guard rule** (`lib/guardrails.test.ts`), stated as a property rather than a file
allowlist:

> Under `lib/collectors/`, every `setTimeout` delay is a `boundedTimeoutMs(…)` result, or a
> local whose *initialiser* is one. `deadline.ts` is the single exemption.

⚠ **Deviation from the review's exact wording, argued.** The review proposed an allowlist —
*"`setTimeout(` appears only in `deadline.ts`, `io.ts` and `http.ts`"*. I implemented the
underlying property instead, because R3 adds a fourth legitimate `setTimeout` (in `dbus.ts`)
and an allowlist would have had to be *extended* to accept it — which is precisely the move the
review's own rule 1 forbids by analogy with "add a mutation until the ledger goes green". The
property is strictly stronger: a new file with a validated bound passes, a new file with an
unvalidated one fails, and there is nothing to extend. Both accompanying rules the review asked
for are written at the test, including that it is a **necessary condition only**.

Two supports the property needs and now has: comments are blanked before scanning (these
modules *explain* the bug in prose, and a scanner that read a doc comment as a call would fail
on the file documenting the fix), and the argument is extracted paren-balanced rather than by
regex. A companion test asserts `boundedTimeoutMs` is defined exactly **once** — an allowlist is
worthless if a seam can define its own weaker copy.

Mutations: **H8** (http delay), **I1** (io delay), **D11** (dbus delay), plus **T56/T57** added
to *step 4's* harness because its `LEDGER_FILES` owns `guardrails.test.ts`.

### F9 — the test that proved nothing, repointed (one finding with F2)

`serving.test.ts:628` passed `timeoutMs: NaN` to a fake `HttpIo` that never looked at it. The
fake now **records** the number, and the assertion is that all four requests were handed
`SERVING_PROBE_TIMEOUT_MS` — a test that can see what F2 broke. Mutation **V21**.

`http.test.ts` and `io.test.ts` gained the behavioural half: a five-row table asserting that
`Infinity`, `NaN`, `-1`, `2**31` and `0` all **complete** against a server/child that answers
*later than 1 ms*. ⚠ The assertion is that the call completes, not that it rejects — the broken
implementation rejects too, 1 ms in, which is the shape that let this ship.

### F4 / S9 — `NoSuchUnit` reads `inactive`, with a `dbus` entry

§3.7 now states it, so this stopped being an owner question and became conformance. `dbus.ts`
gains `NO_SUCH_UNIT_STATE: UnitState = 'inactive'` and the branch sets the state **and** pushes
a problem naming the unit and the reply.

The decisive argument, recorded at the constant: *this dashboard never asks about a unit
speculatively* — only `gpu-fan-control.service`, which §3.6 names, and one unit per `<i>.env`
the box's own configuration declares. "systemd has no record of it" about such a unit **is** the
news. The build's caution cost the opposite failure and the worse one: `severityUnitState(null)`
is `null`, §6.3's "Any unit" row has no `null` column, so SAFETY's *"Fan service active"* row
rendered an **uncoloured em dash** for a service installed and never started — this box's own
state from 2026-08-15 to 2026-08-27.

`unitState: null` is now reserved for §3.7's four "could not read" routes, asserted by a new
test. Two existing tests changed their expectation and say why at the assertion; the serving one
is the third-card case (`2.env` exists, unit never enabled) now colouring **alarm**. Mutations
**D2** (state dropped), **D2b** (state minted with no entry), **D2c** (`failed` instead).

### R2 — the assembly shape, made impossible rather than documented

Measured by the review: `const storage: Storage = { ...await collectStorage(), net }`
**typechecks at exit 0**, because excess-property checking does not fire through a spread, so
the collector's `errors` array rides into `snapshot.storage` while the top-level `errors[]`
already carries the same entries.

⚠ **I did more than the review's cheapest option.** It offered "correct build.md §10 and
HANDOVER to destructure" as fix 1; the parent asked for the shape to be fixed so the mistake is
*impossible*. Both collections now nest their readings, typed from the contract:

```ts
export type Filesystems = Omit<Storage, 'net'>;      // collectStorage -> { filesystems, errors }
export type SafetyChecks = Omit<Safety, 'pwm5Present'>; // collectSafety  -> { checks, errors }
```

`Omit` rather than a hand-written shape, so a contract that gains a disk field or a safety check
is a compile error in the collector instead of a silently missing key at the route. Step 6 writes
`{ ...filesystems, net }` and `{ ...checks, pwm5Present }` — spreads of a type that **is** the
contract minus one key, total and unable to carry anything extra.

Locked in both directions by a `@ts-expect-error` in each test file: it fails if the collection
becomes spreadable again, and — because an *unused* `@ts-expect-error` is itself a compile error
— it also fails if the nesting is flattened back. `vitest run` sees neither; `tsc` does, which is
why `verify` runs it first. Mutations **S11/S11b**, **F19/F19b**.

This also restores the shape steps 3 and 4 already had (`{ gpus, errors }`, `{ cooling,
pwm5Present, errors }`), where a spread was never the composition.

### F3 — one message-size ceiling at the top of `decodeMessage`

`DBUS_MAX_MESSAGE_BYTES = 2 ** 27` and `DBUS_MAX_FIELDS_BYTES = 2 ** 26`, the protocol's own
limits, checked **before** the `bytes.length < byteLength` test. That ordering is the whole
point: an over-long declared length must be *"this is not D-Bus"*, never *"read more"*.

One check covers the two sites the adversarial listed separately — `Reader.string()`'s
four-billion-byte length and `Reader.signature()`'s 255-byte one both reach `need()` only after
`decodeMessage` has returned `malformed`, and the body reader is built on
`bytes.subarray(0, byteLength)`.

Both sides of both boundaries are fixtured per HANDOVER §5.1, and they differ at a panel: one is
a decoded message, the other a 2 s blank. Mutations **W15**, **W16**, **W17** (the *ordering*),
**W18** (`>=` instead of `>`). A `collectUnitStates` test asserts the fail-fast **elapsed time**,
not the entry count — the broken implementation also produces exactly one entry, 400 ms later
and blaming the clock.

### S6's code consequence — `BYTES_PER_GB` → `BYTES_PER_GIB`

Renamed now, as ruled. Its own doc had read *"⚠ `1024³`, despite the name"* — this project's
recurring defect written as an identifier.

⚠ **The rest is DEFERRED to step 9 and carried as an obligation, not silently.** The brand
`GB`/`gb()`, `Filesystem.usedGB`/`totalGB` and **`formatGB`'s ` GB` suffix** all still say GB
while holding and printing GiB — 98 occurrences across 10 files. §6.6's disk row and §1's
decision 20 now both say GiB, so **the displayed suffix is currently wrong against the spec**;
the value is right. That is stated at `formatGB` itself, at `statvfs.ts`, in `storage.test.ts`
and in HANDOVER's obligation table, so step 9 cannot miss it.

### The SHOULDs

| # | Done |
|---|---|
| **F7** | `nodeHttp`'s two own messages no longer name the URL. `probeFailure` prefixes it, so entries read `http://…/health: timed out after 4000 ms` instead of naming it twice. Restores the project's own "the wrapper prefixes the path" rule at a new seam. Mutation **H10** |
| **F6** | `parseUfwConf`'s doc narrowed to *the exact form `ufw` itself writes*. Four fixtures added (`UFW_CONF_QUOTED_NO`, `…_SINGLE_QUOTED_NO`, `…_TRAILING_COMMENT_NO`, `…_EXPORTED_NO`) and a ⚠ table test asserting all four are `null`/watch, never `false`. Behaviour unchanged — the direction is safe and the two `KEY=VALUE` grammars genuinely differ. Mutation **F20** adds the quote-stripping the old doc promised |
| **F8** | `⚠ the live root filesystem reproduces `df -B1` exactly` now asserts `totalGB`/`usedGB` against the literals `232.6371`/`20.6323` GiB. The old body multiplied by the divisor it divided by and was true for **any** divisor |
| **F11** | `data: [null]` reports ``` `data[0]` is not an object ```; `data: []` still reports ``` `data` is empty ```. Mutation **L15** |
| **F10** | DKMS docstring narrowed to what the code proves — *a name in the parent listing, not a populated tree* — with the reason the extra `readDir` is declined. **No code change**, as ruled |
| **R3** | `DbusIo.connect(path, timeoutMs)` now bounds itself and **destroys its socket**, matching the other two seams. It was the only bounded seam that abandoned without cleanup: in the exact case the bound exists for, one open handle per poll per tab. Mutations **D10**, **D11**, **D12 declined — see §4** |
| **R5** | Three named bounds (above). `DBUS_TIMEOUT_MS` is now the **real** default at both call sites, with a ⚠ test asserting it at the seam; its doc previously argued for 2 s while `collectServing` handed the conversation 4 s. Mutation **V23** |
| **R6** | `types.ts` corrected: `ufwEnforcing` no longer says *"Currently `no` on this box"*, `Storage.root`/`.home` name the **filesystem** sizes (232.6 / 915.8 GiB) rather than the device sizes, and `UnitState` gains §3.7's four routes to `null` |
| **R7** | `dbus-wire.ts`'s "~250 lines … and no more" replaced with the real count and the real reason the nine unreachable `basic()` branches are kept: a header field of an unexpected basic type would otherwise throw `Malformed`, which ends the **whole conversation** and blanks every unit rather than one field |

Also: `nodeDbus` now has tests at all — four, against a real unix socket. Nothing exercised the
seam before, which is how it came to be the one that never released its handle.

---

## 2. Every finding, with its disposition

### The adversarial's eleven

| # | Disposition |
|---|---|
| **F1** | **Taken, structurally.** Two budgets, one per instance. The adversarial's own preferred fix was rejected on its own measurement — see §1 |
| **F2** | **Taken**, and widened to R1's second site plus the source-text guard |
| **F3** | **Taken.** One ceiling at the top of `decodeMessage`, both boundaries fixtured, four mutations |
| **F4** | **Taken**, in the direction the review argued and §3.7 now states: `inactive` + entry |
| **F5** | **Confirmed closed by the spec.** §2.2 now carries the `-v /etc/llama-server:/etc/llama-server:ro` row. No code change. The *related* half — §3.4's "or the unit's env" — is also gone from §3.4, which now reads *"**the file only**; the unit's `EnvironmentFile` *is* that file on this box"*. The build's implementation was already right |
| **F6** | **Doc half taken, code unchanged**, with four fixtures and a mutation. §1 |
| **F7** | **Taken** |
| **F8** | **Taken.** Correctly classed irreducible and cheaply fixable, so fixed |
| **F9** | **Taken**, as one finding with F2 |
| **F10** | **Doc taken, code declined**, as ruled: the two sides are indistinguishable at a panel in any reachable state, so the extra `readDir` buys bookkeeping and one more failure mode |
| **F11** | **Taken** |

### The build's eight gaps

| # | Disposition |
|---|---|
| **S6** | **Answered by the spec** (§6.6 and decision 20 both say GiB) and half-implemented: `BYTES_PER_GIB` renamed now, brand/field/suffix deferred to **step 9** as an explicit obligation |
| **S7** | **Answered by the spec.** §3.5 now states `total = blocks × bsize`, `used = (blocks − bfree) × bsize`, and that `bavail` is deliberately not used. The build chose correctly; the module doc now quotes the spec instead of raising the gap |
| **S8** | **Declined, as the review ruled.** The contract holds one `model` and `serve-llm.sh` has no route to more than one per port. `data[0]` plus an `llama-models` entry is the honest report. Recorded as a known truncation at `parseModelsBody` |
| **S9** | **Answered by the spec and implemented** — see F4 |
| **S10** | **Answered by the spec.** §6.7 now carries the one rule and the per-source table, including *"**each instance's** `/health` + `/v1/models` 4 s"*. The four numbers are the ones the code uses |
| **S11** | **Still open, and it is one question with step 4's G5.** No entry is filed for a blank `model` when `health ≠ ok`: the read was not attempted and the coloured `health` cell in the same row carries the explanation. §6.5's "an em dash always has an entry behind it" needs a stated exception for a blank fully explained by a coloured neighbour. Carried to the owner, before step 9 |
| **S12** | **Answered by the spec, and the risk has reversed.** §2.1, §6.3, §6.4, §7.3 and §8.4 all now say `ENABLED=yes` and name the mirror-image risk: 8090 silently *unreachable*. `types.ts:578` was still saying `no` and is corrected (R6) |
| **S13** | **Answered by the spec.** §3.4 now states the bare-integer filename rule. The build's implementation was already right |

### The review's eight own findings

| # | Disposition |
|---|---|
| **R1** | **Taken.** `io.ts` closed alongside `http.ts`, plus the structural guard that sees both |
| **R2** | **Taken, and made impossible** rather than documented — nested collections, `Omit`-derived, with a `@ts-expect-error` locking both directions |
| **R3** | **Taken.** `connect` bounds and destroys. ⚠ Its timeout *branch* has no test — see §4 |
| **R4** | **Taken.** HANDOVER §8's table is rewritten; twelve of thirteen entries were answered |
| **R5** | **Taken.** Three named bounds; `DBUS_TIMEOUT_MS` is the real default and is asserted |
| **R6** | **Taken.** Three corrections in `types.ts` |
| **R7** | **Taken.** Line count corrected and the real reason given |
| **R8** | **Noted, not acted on**, as the review explicitly asked. varlink would replace ~920 lines of hand-written codec, but the codec is written, tested and validated frame-by-frame against the live bus, and varlink's answer for an *unloaded* unit is unverified — it may have the identical `NoSuchUnit` shape. Recorded in HANDOVER as a decision, not an omission |

---

## 3. The review's MUST list, item by item

| | Status |
|---|---|
| **F1** — split the budget, per instance | done, with the "not started" variant rejected on the adversarial's own log |
| **F2 + R1** — both seam timers through `boundedTimeoutMs` | done, plus `dbus.ts`'s new one |
| **F9** — repoint the timeout test | done, at a fake that records the number |
| **§5's structural guard** | done, implemented as the property rather than the file allowlist — argued in §1 |
| **R2** — destructure, not spread | done, and made a compile error |
| **F3** — the 2²⁷ / 2²⁶ ceiling | done, both sides fixtured, four mutations |
| **R4** — rewrite HANDOVER §8 | done |
| **F4 / S9** | done — the spec answered it while this step was in flight |

---

## 4. Three ledger judgements, stated rather than buried

The ledger's own first rule is that a `DID NOT BITE` means the **test** is inert. Four mutations
did not bite on the first full run. Three were bad tests and were fixed; the fourth was a bad
mutation. All are recorded because a silently-dropped mutation is the same defect the ledger
exists to prevent.

1. **V20** (*the probes spend the discovery budget*) did not bite because my new
   slow-discovery test used an **instant** HTTP fake: a probe handed the ~5 ms left of the
   discovery budget still *won the race*. The adversarial's own reproduction used a 20 ms fake
   for exactly this reason. The test now delays its answers by 20 ms and the mutation bites.
2. **V22** (*one option sets all three bounds*) did not bite because the test asserted only the
   HTTP number while its **name promised three budgets** — the project's recurring defect. The
   D-Bus bound is observable at the seam now that `connect` takes a `timeoutMs`, so the test
   records it, and a second test asserts `DBUS_TIMEOUT_MS` is the real default.
3. **I2** (a re-aimed copy of step 3's `S47`) did not bite as first written: leaving
   `signal: ac.signal` in place means `ac.abort()` still SIGKILLs the stubborn child. Re-aimed
   to step 3's two-part shape.
4. **H9** (*the message names the raw argument*) was a **bad mutation** and was dropped. The
   bound and the argument differ only when the argument is invalid, and an invalid argument
   means the 4 s fallback — so observing the difference costs a four-second wall-clock test,
   re-run once per mutation, in a suite that runs in three. **Both message tests were renamed
   to what they check** (`the timeout message is a millisecond figure…`) rather than left
   over-claiming, and the half that reaches a panel — a 1 ms bound and an `unreachable` alarm —
   is covered by the five-row tables.

### Two properties with no mutation, recorded rather than papered over

- **`socket.destroy()` inside the connect timer** (R3). Reaching it needs a unix connect that
  *blocks*, which no test in this process can produce: Node's `net.Server` accepts eagerly, a
  missing path is `ENOENT` and an unlistened path `ECONNREFUSED`, both immediate. **D10 covers
  the reachable half** — the timer must not fire on a live socket, which is the guard a naive
  implementation gets wrong. The destroy itself is unmutated and the harness says so in a
  comment.
- **`child.unref()` alone** (`io.ts`). Its property is *"the process exits sooner"* (9021 ms →
  649 ms, measured in step 3), which nothing inside that process can assert. Step 3's harness
  does not mutate it in isolation either — it only appears inside larger anchors.

### A test de-marked rather than left inert

`nodeDbus`'s *"a nonsense timeout still connects"* lost its ⚠. A unix connect settles in well
under a millisecond, so `clearTimeout` beats the 1 ms clamp and the test passes under a bound
that skips `boundedTimeoutMs`. It is a smoke test, not a proof — and the property it was
reaching for is *a statement about a call*, which is exactly what the new source-text rule
exists for and what mutation **D11** reddens. Dropping the marker rather than the standard is
the ledger's own rule 1.

### Ledger ownership

`LEDGER_FILES` gained **`io.test.ts`** and deliberately did **not** gain
`guardrails.test.ts`:

- `io.test.ts` is ledgered by nothing — step 3's harness predates the mechanism and step 4's
  list omits it — so step 5's ⚠ additions there would have gone unchecked. Three of step 3's
  `nodeIo.run` mutations are re-aimed into this harness for its pre-existing ⚠ tests. That is
  duplication bought for real coverage, a different case from `deadline.test.ts`, where step
  4's ledger already covered them.
- `guardrails.test.ts` is already in **step 4's** `LEDGER_FILES`, so the two ⚠ tests step 5
  added there are covered by **T56/T57 added to step 4's harness** — exactly what step 5's build
  did when it added a ⚠ test to `deadline.test.ts`.

---

## 5. Fixture symmetry (HANDOVER §5.1) for what this phase added

| guard | below | above | mutations |
|---|---|---|---|
| `byteLength > DBUS_MAX_MESSAGE_BYTES` | a frame declaring exactly 2²⁷ → `incomplete` | one byte over → `malformed` | W15, W18 |
| `fieldsLength > DBUS_MAX_FIELDS_BYTES` | exactly 2²⁶ | 2²⁶+1 | W16 |
| the ceiling's **position** relative to the incomplete test | — | — | W17 (there is no "other side": the two orderings differ at a panel by 2 s) |
| `boundedTimeoutMs` at three seams | a valid delay (60, 300, 900) | `Infinity`, `NaN`, `-1`, `2³¹`, `0` | H8, I1, D11 |
| per-instance vs shared probe budget | an instance probing at t≈0 | an instance probing at t≈200 ms | V19, V20 |

Deliberately **not** fixtured, per the rule's second half: `boundedTimeoutMs`'s own `≤ 2³¹−1`
ceiling (already fixtured in `deadline.test.ts`, and HANDOVER §5.1 names it as the worked
example), and the connect timer's `bound` (its two sides are indistinguishable at a panel for
any reachable delay).

---

## 6. Green, pasted

```
$ pnpm verify
 Test Files  24 passed (24)
      Tests  1269 passed (1269)
Type Errors  no errors
   Duration  3.08s
exit=0
```

Run **three consecutive times, `exit=0` each time.**

```
$ pnpm build          -> exit=0, emits .next/standalone/server.js
$ md5 -q tsconfig.json -> 8b6e358b0e19ad663d554dc8310c6da0   (unchanged, before and after)
```

All four harnesses:

```
python3 pipeline/steps/02-format-severity/regressions.py                    -> exit 0, 40 mutations
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                -> exit 0, 64 mutations
python3 pipeline/steps/04-collector-cooling/regressions.py                  -> exit 0, 74 mutations, ledger clean
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py  -> exit 0, 127 mutations, ledger clean
```

```
Red-test ledger: 161 distinct failing tests across 74 mutations; 64 ⚠-marked tests checked.   (step 4)
Red-test ledger: 183 distinct failing tests across 127 mutations; 94 ⚠-marked tests checked.  (step 5)
Every ⚠-marked test went red under at least one mutation.
```

⚠ The step-5 *distinct-failure* count moves by one or two between runs (183–184 observed) — a
few of these tests measure elapsed time, so a mutation can collaterally redden a neighbouring
timing assertion or not. **The count is not the assertion; the coverage line is**, and that has
been stable across every run.

Zero `ANCHOR NOT FOUND`, zero `DID NOT BITE` in any of the four. `git status --short` is
`M .gitignore` / `?? dashboard/` — nothing outside `dashboard/` was touched, and nothing on
`ai-server` was read or written during this phase.

**Eight anchors were re-aimed** after the source moved (D2, H2, S1, S2, S8, F16, V7, T3). Per
HANDOVER §1, an `ANCHOR NOT FOUND` means the mutation needs re-aiming, not that the test is
fine — every one still bites at its new home, and **D2 was re-aimed by inversion**: it used to
mutate `inactive` *into* the tree, and §3.7 now makes `inactive` correct, so the plausible wrong
implementation is the build's original.

---

## 7. New spec gaps for the owner

Only two are new. Everything else this step raised has been answered by the current `SPEC.md`.

| # | Gap | Where |
|---|---|---|
| **S14** | ⚠ **§6.7's per-source budget table now conflicts with §6.5's "no collector-wide bound may blank a per-instance verdict" on the collector's own ceiling.** §6.7 lists *"`/etc/llama-server` discovery 2 s, and **each instance's** `/health` + `/v1/models` 4 s"* — which are sequential, so `collectServing`'s worst-case wall clock is **6 s**, above §6.7's own 5 s default cadence. The spec should either say the 6 s ceiling is intended (a wedged poll costs one skipped cadence, which is what the backoff is for) or give the collector a stated total. Implemented as 6 s and documented at `serving.ts` | `serving.ts` |
| **S15** | §3.7 says a `NoSuchUnit` reply carries *"a `dbus` entry naming the unit and the `NoSuchUnit` reply"*, and §6.3 bands the resulting `inactive` as **alarm** — so on a box with a `2.env` whose unit is not enabled, that entry is filed **on every poll, indefinitely**, exactly as `pwm5Present: false` does (§3.7 says so explicitly for that case). It is presumably the same rule, but §3.7 states persistence for `pwm5Present` and not for this. Worth one sentence, since the two are now the only persistent-entry cases in the contract | `dbus.ts` |

**Still open from earlier steps:** **S11** (with step 4's **G5**, to be answered once, before
step 9). Everything else previously listed — S1, S3, S4, S5, G1, C1, C2, C3, C4, C5, G6, S6,
S7, S9, S10, S12, S13, F5 — is **answered** by the current `SPEC.md`; the evidence is in
HANDOVER §8.

Two non-spec items for the owner, both unchanged from earlier steps and both now more urgent:

- **A commit point before step 11.** Nothing in this project is committed. Step 12 verifies a
  deployment survives a reboot, which is not a thing to attempt from an untracked tree, and
  `git grep` currently searches nothing here.
- **The GB → GiB rename** (§1). The spec has moved; the identifiers and the rendered suffix have
  not. Step 9 owns it and HANDOVER carries it.

---

## 8. What step 6 inherits

Written out in full in `HANDOVER.md`, which was rewritten for a cold read. The four things that
would hurt most if they leaked:

1. **The aggregate poll deadline must NOT be one `deadline()` shared across collectors.** That
   reproduces F1 at the route level, where a slow `nvidia-smi` would blank SERVING and a slow
   `statvfs` would band an alarm on a healthy `llama-server`.
2. **`errors` is destructured, never spread**, into `Storage` and `Safety` — and the shape now
   makes the alternative a compile error.
3. **`unitState: null` means "could not read" and nothing else.** A unit that is not running is
   never `null`.
4. **O18's in-flight cache now covers three seams**, not one: `nodeIo.run`, `nodeHttp.get` and
   `nodeDbus.connect` all abandon at the bound.
