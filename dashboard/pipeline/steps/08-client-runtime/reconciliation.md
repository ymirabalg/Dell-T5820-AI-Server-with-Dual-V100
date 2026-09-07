# Step 8 — client runtime · **reconciliation**

Twelve MUSTs and fourteen SHOULDs from `review.md`, plus the two module extractions it asked
for, are applied. Two modules were extracted, one field was added to §4's contract, one
server-side reader was written, and the harness was re-aimed and extended from 128 mutations to
**158**.

The phase ran across **three contexts**. The first two are recorded in
`reconciliation-progress.md`, which remains the detailed record of *what changed and why* —
every finding's disposition is there and is not repeated here. **This file records the
close-out**: the harness work, six defects the harness itself found while being re-aimed, and
the evidence.

| | |
|---|---|
| `pnpm verify` | **57 files · 1990 tests · no type errors · exit 0**, ten consecutive runs (§5) |
| step 8's harness | **158/158 bite**, ledger clean, 191 ⚠ tests checked |
| harnesses 2–7 | pass — see §5 for which were re-run and the argument for the rest |
| `SPEC.md` | **untouched.** Five new gaps are recorded for the owner (§4) |
| `HANDOVER.md` | **rewritten for step 9** |
| tree | `TREE IDENTICAL TO BASELINE` after every harness run |

---

## 1. What changed

See `reconciliation-progress.md` §1 for the file-by-file table and §2 for every finding's
disposition. In one paragraph: `lib/client/gaps.ts` and `lib/client/mode.ts` were extracted out
of `runtime.ts` (S1, S2); a gap now closes when a **reason** goes away rather than when a
**sample** arrives, and the predicate is over all three reasons (F1/F2/F7); §6.5's stale/retired
split moved into `observePoll`'s `displayed` (F3); `stale` became a function of the newest
reading's **age** rather than of the failure counter (F4/F11); the two clocks were separated and
written down (F5/F8); §9's dedupe takes the **worst** severity (F6); `standing` became a
required field on §4's snapshot, read per poll (S34/M9); the runtime guard grew `fetch` and
`XMLHttpRequest` and its third exemption was documented (F9); and the whole arrival path moved
inside `poll()`'s `try` (C1).

### The one thing a reader of the progress brief should re-read

**`FakeEnv`'s two fake clocks were in different years** — browser 2023, server 2026 — which was
invisible until §6.2's mode became a function of `browser now − server ts`. They are now
coupled, and **a test that wants skew has to ask for it**. Two fixtures added in this context do
ask (§3), and they are the only reason two of the clock rules have anything biting on them.

---

## 2. The harness — 128 → 158 mutations

### 2.1 Twenty anchors re-aimed

The fixes moved the code twenty mutations pointed at: `R5` (the eviction block gained a `newest`
recompute), `W5`/`W14` (the integer duty check), `O1` (`push` gained an `enumeration`
parameter), and sixteen in `runtime.ts` — the `switch` moved inside a `try`, gaps and mode moved
to their own modules, `standing` became per-poll, `refreshNow` gained a `hidden` guard, and
`fail()` became three lines calling `applyMode`.

Two were re-aimed onto a **different site** rather than a moved one, and both are recorded at
the entry:

- **`U2`** ("the runtime ignores the ring's verdict") is now a **dropped `return`** rather than
  a deleted block. The block gained a nine-line comment, and an anchor spanning prose is one
  that an edit to the prose silently breaks. Falling through is the same wrong behaviour.
- **`U8`** ("the un-sampled span starts when polling stopped") is aimed at `newestTsMs()`, which
  is where the choice now lives — `openGap` takes `fromMs` and cannot make it.

`W14` is written as `typeof duty !== 'number' || !duty` rather than the bare `!duty` the old
anchor used, because the range line below it now needs `duty` narrowed to `number`. **A mutation
that bites for a second reason is a mutation whose red set cannot be read.**

### 2.2 Thirty-one mutations added

`gaps.ts` (`G1`–`G6`), `mode.ts` (`M1`–`M4`), the two `ring.ts` selectors reconciliation moved
(`R14`, `R15`), seven more in `runtime.ts` (`U36`–`U42`), `standing`'s wire validation (`W19`,
`W20`), six in `events.ts` (`E14`–`E21`), and `enumerationsRead` (`O14`). `LEDGER_FILES` gained
`gaps.test.ts` and `mode.test.ts`.

**`G1` is the one the review named**: `observeSample`'s `anyGapReason(state) === null` mutated
to close unconditionally. It reddens eight tests across `gaps.test.ts` and the runtime fixtures,
and it is the erasure the old suite could not have caught.

**`U38`/`U39` are F9's pair, and they exist to show the two guards are not one guard.**

| | what it does | text guard | runtime guard |
|---|---|---|---|
| `U38` | `const go = fetch;` | **catches it** | blind — an alias that is never called reaches nothing |
| `U39` | ``Function('return fet' + 'ch')()('/api/telemetry')`` | blind | **catches it** |

`U39`'s literal is **split on purpose**. `codeOnly()` blanks comments but **keeps string
contents**, so a plain `'return fetch'` would be matched by the text guard and the mutation
would bite twice, demonstrating nothing. Split, the source names neither `fetch` nor
`globalThis` anywhere, and only the runtime wrapper sees it — because the call is made from
`runtime.ts`'s own frame, which is what `CLIENT_FRAME` attributes on.

### 2.3 ⚠ Nine mutation ids collided, and that is a harness defect worth naming

`E1`–`E5`, `W15`, `W16`, `U34` and `U35` were added on top of existing entries with the same
ids and different meanings. Nothing failed — but `DID NOT BITE` reports by **name**, and with a
duplicate id the reader cannot tell which entry failed without grepping. Renumbered to `E14`–
`E18`, `W19`, `W20`, `U40`, `U41`. The check is now in the harness docstring and in HANDOVER §1:

```bash
grep -oE '^ +[(]"[A-Z]+[0-9]+' regressions.py | sort | uniq -d
```

---

## 3. ⚠ What the harness found — eleven real holes, none of them a bad mutation

This is the most useful part of the phase and it is why `regressions.py` is worth its size. Six
mutations did not bite and the ledger then named six ⚠ marks with nothing behind them. **Ten of
the eleven were missing fixtures. One was a mark that had to be dropped.**

### 3.1 The six that did not bite

| id | why it did not bite | what was missing |
|---|---|---|
| **`W4`** | ⚠ **A later fix added a second, independent defence.** `W4` removes `wire.ts`'s ISO-shape guard and had bitten since the build. **F13 then added a calendar round-trip**, which independently refuses every row the test table held — so the mutation applied, the property stayed true, and the shape guard's coverage went to **zero** without a word. The round-trip compares **19 characters**, so the region only the shape guard can see is a non-canonical *spelling* of a correct instant, and §6.7's dedupe is keyed on the `ts` **string** — one instant under two spellings enters the ring twice | two rows in `wire.test.ts`: `…T14:02:11.000+00:00` and `…T14:02:11.4821Z`, both verified against `Date.parse` on this Node. `W4` was **renamed**, because its original name (`accepts '5' as a date`) described a case the round-trip had taken over |
| **`G5`** | Every fixture in `gaps.test.ts` held **at most one gap**, and in a one-element list `at(-1)` and `at(0)` are the same element | `⚠ it reads the NEWEST gap, not the first one the session opened`, with a two-gap list in both directions and the `openGap` call that consults it |
| **`U40`** | `afterGap` is tested at the unit on both sides — `gaps.test.ts` owns "was a gap open", `conditions.test.ts` owns "a gap restarts the run" — and **neither can see that the runtime joins them**. `const afterGap = false` passed both suites | `⚠ a gap restarts §6.4's pending run, so a hidden minute confirms nothing`: a pending band run, a minute hidden, and the first reading back must **not** confirm |
| **`U37`** | Every gap fixture ran a server and a browser whose clocks **agree** (this phase coupled them), so `nowMs` and the newest `ts` are the same number and the two horizons are indistinguishable | `⚠ a closed gap survives a server three hours behind the browser` — three hours is half again the two-hour longest window, so a browser-anchored horizon prunes the whole list |
| **`E16`** | Nothing in the suite retired a subject and brought it back | `⚠ a card that is retired and comes back is logged again, as a first sighting`. Without the `logged.delete`, the returning card's band equals the band still recorded against it, the `previousBand === band` early-out fires, and **a card that left at 90 °C and came back at 90 °C is logged nowhere at all** |
| **`E17`** | The existing fixture returns and settles in **two separate polls**, so the returned feed and the band loop never coincide and the `emittedIds` guard is never consulted | `⚠ a band confirmed by the very poll that ends the outage still logs one line`. `observePoll` does not touch a band hold while its subject is absent, so a pending run started **before** the outage survives it and confirms on the poll that ends it |

### 3.2 The six inert ⚠ marks the ledger then named

| mark | what was actually missing |
|---|---|
| `⚠ a second reason keeps it open after the first goes away` | a mutation dropping the **`hidden`** arm of `anyGapReason`. `G2` drops `paused`/`failed`, which every fixture reaching these tests was immune to. Added as `G6` |
| `⚠ pause → hide → resume leaves the gap open, because hidden is still in force` | ⚠ **the test's name over-claimed its body.** No poll was in flight, and on a hidden tab nothing schedules and `refreshNow` is a no-op — so **no sample arrived to close the gap either way**. It read green under an `anyGapReason` with no `hidden` arm at all. Fixed with `heldFetch`, so a poll lands *after* the resume while the tab is still hidden |
| `⚠ no gap is opened before the first accepted sample` (runtime) | the fixture started **already hidden**, so `syncHidden` returned early and `openGap` was never called. A **failed first poll** is the path that reaches it with `fromMs === null`; added as the second half of that test |
| `⚠ the age counts from the server's ts, and a repeat does not refresh it` | a mutation that **re-stamps on arrival** — the thing HANDOVER's first warning forbids. Added as `U42` |
| `⚠ the crossing and the recovery, and nothing in between` | a mutation dropping `observeStaleness`'s `previous === band` early-out. Added as `E20` |
| `⚠ a stale condition does not re-log its band on every poll` | **see §3.3** |

### 3.3 ⚠ The one mark that was dropped rather than backed

`⚠ a stale condition does not re-log its band on every poll` is **defended twice** for the
condition its fixture uses. `E19` removes the `condition.stale` short-circuit; `E21` removes the
`previousBand === band` early-out; the test is green under **each**. For a continuous metric the
band is `displaySeverity`, which is frozen while stale and therefore always equals the band
already logged — so the short-circuit is invisible there. Removing both guards at once is not an
implementation anybody would write.

HANDOVER §5.2 rule 1: where a property has no plausible wrong implementation, **drop the ⚠
rather than the standard.** The mark was dropped and the test renamed to what it checks (*a
stale condition produces no log entry on any poll, however long it lasts*), with the reason at
the test.

**And the load-bearing half was found in the process, which is the return on the whole
exercise.** For a **value-band** condition — §6.4's closed vocabularies, a unit state — the band
comes from `valueHolds`, which lives in `events.ts` and is stepped by that loop. A unit that goes
`active → failed` and becomes unreadable **five seconds into its ten-second run** carries a
pending value across the outage; without the guard the loop keeps stepping it against the
browser's clock, **confirms `failed` on the strength of time nobody sampled**, and logs a state
transition for a unit the dashboard has not been able to read since before the transition would
have been confirmed. That is §6.4's ten seconds of *sampled* time (F7) meeting §6.5's stale rule,
and it is now `⚠ a value-band condition that went stale mid-run does not confirm across the
outage`, backed by `E19`.

⚠ **Every fixture in that file used `gpu_temp`.** The general lesson, and it is new: a guard can
be invisible under one *kind* of condition and load-bearing under another, and a suite that
reaches for the same fixture shape every time cannot tell.

### 3.4 ⚠ A pre-existing 15 % flake in step 6's suite, found by the ten-run requirement

`lib/telemetry/source.test.ts` → `⚠ importing the route's modules creates no timer at module
load` failed **3 runs in 20** with `AssertionError: expected +0 to be 1`.

**It is not step 8's, and it is not a real violation.** `process.getActiveResourcesInfo()` is
**process-wide**: it counts the test runner's own pending timers as readily as ours, and the
failure is a runner timer **expiring** during the dynamic import — `after` 0, `before` 1. The
test reported a violation of a property that held.

That is HANDOVER §5.4 in a clock-shaped form, and the same species as step 8's own globals
guard, which attributes calls **by stack frame** rather than counting them for exactly this
reason. What "importing creates no timer" forbids is an **increase**, so `toBe` became
`toBeLessThanOrEqual`, with the residual stated at the test: a timer created by the import would
have to be spelled through `node:timers` (invisible to the three spies beside it) *and* be
masked by an unrelated expiry inside the same few milliseconds. **0 failures in 25 runs after
the change**, and step 6's harness re-run clean (§5).

Recorded in HANDOVER §1 as the second shape of `DID NOT BITE`'s cousin: **a measurement that is
process-wide must be attributed, not counted.**

---

## 4. Spec gaps for the owner (invariant 7)

`SPEC.md` was **not edited** and its md5 is unchanged. Five gaps, with what the code does beside
each; none was filled by assumption. They are carried in `HANDOVER.md` §8.

| # | Gap | What the code does |
|---|---|---|
| **S49** | §6.7 does not say whether the 600-point decimation budget is **per series or per chart** | Per series. §6.2's stacked chart therefore draws up to **1,800** points. **Step 9 renders this** |
| **S50** | §6.5 says a stale condition's row "names the age of the reading" but not **which clock** measures it | `lastSeenMs` is the **browser's** clock at the last poll that carried the condition — a fact about the session |
| **S51** | §6.5 does not say what a stale condition's **value** shows | The last value read, unchanged, with `stale: true` beside it. Step 9/10 decides the treatment |
| **S52** | §6.4 does not say whether `loggedStanding` survives a mid-session `STANDING` change | Not reset. It belongs to the session, not the configuration |
| **S53** | §4 does not say what a **duplicate** entry in `STANDING` means | Echoed verbatim; harmless because the client builds a `Set`. Recorded so nobody "fixes" it server-side |

---

## 5. Evidence

### `pnpm verify`, ten consecutive runs

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ cd dashboard && for i in $(seq 1 10); do pnpm verify; echo "VERIFY_EXIT=$?"; done

 Test Files  57 passed (57)
      Tests  1990 passed (1990)
Type Errors  no errors
VERIFY_EXIT=0          ← ×10
```

⚠ **The first ten-run pass was NOT clean** — run 2 exited 1. That is §3.4, and it is the whole
argument for the ten-run requirement: a 15 %-of-runs flake had been sitting in step 6's suite,
and six earlier `pnpm verify` runs had missed it. The counts above are after the fix, and were
confirmed by a further **25 consecutive `pnpm test` runs with zero failures** before the ten
`verify` runs were taken.

1867 → 1982 → **1990** tests; 55 → **57** files. The two new files are `gaps.test.ts` and
`mode.test.ts`; the further eight tests are the fixtures in §3.

### Step 8's harness, run last and alone

```
All 158 regressions failed their check, as they must.
Red-test ledger: 257 distinct failing tests across 158 mutations; 191 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
TREE IDENTICAL TO BASELINE
```

### The inherited harnesses

| harness | result | ledger |
|---|---|---|
| `02-format-severity` | **47/47**, exit 0 | **clean** — ledger retrofitted this phase; 8 ⚠ tests checked |
| `03-collectors-gpu-host` | **64/64**, exit 0 | **no ledger** — pre-dates it, and carried as an obligation |
| `04-collector-cooling` | **90/90**, exit 0 | clean, 81 ⚠ tests |
| `05-collectors-serving-storage-safety` | **127/127**, exit 0 | clean, 94 ⚠ tests |
| `06-telemetry-route` | **61/61**, exit 0 | clean, 54 ⚠ tests — **re-run in this context** after §3.4's fix |
| `07-auth-login` | **116/116**, exit 0 | clean, 104 ⚠ tests |

⚠ **Only step 6's was re-run in this context, and here is the argument for the other five.**
This context changed **no source file at all** — `git diff --name-only` over `lib/`, `app/` and
`proxy.ts` lists only test files: `lib/client/{events,gaps,runtime,wire}.test.ts` and
`lib/telemetry/source.test.ts`. The first four are step 8's own `LEDGER_FILES` and appear in no
other harness (`grep -c 'lib/client' pipeline/steps/0[2-7]-*/regressions.py` → **0** in all
six). The fifth is step 6's, which is why step 6's was re-run. An inherited harness mutates a
source file and runs vitest over **its own** test files, none of which changed. The runs in
`reconciliation-progress.md` §8 therefore still hold.

### Integrity

`TREE IDENTICAL TO BASELINE` after every harness run, checked with the manifest procedure and
cross-checked with `git status --short` now that the tree is committed. The baseline snapshot at
`manifest-baseline.txt` was refreshed at the end of the phase; the only files that moved are the
five test files above.

---

## 6. Deliberately not doing

Unchanged from `reconciliation-progress.md` §8, and repeated here because a reader of this file
should not have to open that one to find them:

- **Not weakening §6.7's `ts` dedupe.** F4 is about a *run* of repeats; the dedupe is untouched.
- **Not refusing a snapshot whose COOLING and SAFETY unit states disagree.** Partial truth beats
  no truth (§6.5). The reduction takes the worse and logs it once.
- **Not expiring a stale condition on a timer.** That is F3 reintroduced with a `setTimeout`.
- **Not preserving pre-gap accrued hold time.**
- **Not adding jsdom.** D6 records what would change it.
- **Not retrofitting the ledger to step 3's harness** — out of scope; carried as an obligation
  for whoever next touches `lib/collectors/`.
- **Not editing `SPEC.md`, `MOCK.html` or `PLAN.md`.**
- **Not committing, staging or touching git.**
- ⚠ **Not going further into `lib/telemetry/`** than §3.4's one assertion. That change was taken
  because `pnpm verify` exiting 0 is the definition of this step being done, and it was not
  reliably doing so. Nothing else in step 6's surface was touched.

---

## 7. Step 8 is closed

`HANDOVER.md` is rewritten for step 9 and carries: §0's manifest procedure, the corrected
client surface (including `samplesWithin`'s dropped parameter), Part 6's twelve
"must not leak into steps 9 and 10" rules, the four composition gaps, every open obligation with
its owning step, the three `build.md` over-claims **in their corrected form only**, S35's
measured divergence point, R3's monotonic-clock note, the five dropped ⚠ marks with the argument
for each, the `isolate: false` note, and step 9's own scope — with `MOCK.html` named as a
reference and never a source.
