# 12d RECONCILE — 12d as handed over was NOT an improvement on 12c, and the measurement says so; the membership clause is what makes it one

**Written by the RECONCILIATION phase, 2026-09-22.** Branch `dashboard-frontend`, working dir
`dashboard/`, on `9fcff77`. **Nothing was committed, nothing was staged, no `git checkout --` was
run, no spec file was edited, nothing was deployed, and this phase did not contact `192.168.4.71` at
all** — no SSH, no HTTP, no D-Bus socket opened.

**Course taken: (a) — Finding 1 is fixed inside 12d.** The reason is in §2, and it is a measurement
rather than a preference: as handed over, 12d closed one way of deleting a live alarm and opened
another, so *better or worse than 12c* had no answer. With the fix it has one, in every direction.

---

## 1. The adjudication — all ten

| # | severity | verdict | the checkable reason |
|---|---|---|---|
| **1** — `observePoll` retires a subject still in the collection, because its reading went `null` | HIGH, pre-existing | ⚠⚠ **ACCEPTED — fixed** | Not a design question: §9 row 2 states retirement as *"the collection that would have contained it was read successfully **and it was not in it**"*, with `gpus: [{index:0}]` for GPU 1 as its own worked example. The code tested no membership at all. **This is a conformance fix, not scope growth** — the spec is not silent, the code disagreed with it. Measured before: `gpus` carried `[0,1]` on every poll, card 1's `tempC` went `null`, `gpu_temp:1` retired at poll 5, alarms **7 → 6**. Measured after: `retired=[]`, alarms **7** throughout. §2's table, and `wire.test.ts` ⚠⚠ *a card STILL ENUMERATED whose `tempC` goes null KEEPS its alarm* with its twin |
| **2** — 12d makes Finding 1 fire during a partial read, where 12c's global freeze blocked it | HIGH, 12d's own | ⚠⚠ **ACCEPTED — fixed by the same clause** | Reproduced on the same wire bytes the adversarial used: instance `'7'` present in `serving[]` on every poll, row `'0'` refused by name. 12c: alarms **8**, nothing retired. 12d/build: **8 → 6** at poll 5. 12d/reconcile: **8**, `retired=[]`, all four subjects named stale. Pinned end to end by `wire.test.ts` ⚠⚠ *a row STILL IN `serving[]` that stops reporting keeps its alarms, even while another row is refused*, which asserts **both** halves of the wire (`serving` still lists `'7'`; `refused: ['0']`) so it cannot pass on a clean read |
| **3** — a fabricated quotation of §3.4 in production source | MEDIUM | ✅ **ACCEPTED — fixed in all five places** | Verified independently against `SPEC.md`: `grep -in` finds **no** *"keep it short"*, **no** *"value slot"*, **no** *"explanatory prose"*; the one hit for *"carries prose"* is line 1572, whose sentence is about **repeating an explanation across cells**. The words came from the parent's own build handoff (`handoffs/12d-partial-reads.md` §2), and the section number was changed §3.7 → §6.4. Corrected in `gpu-panel.tsx` (the comment now quotes §3.4 and §6.4 **verbatim** and names the handoff as the source of *keep it short*), in `12d-build.md` §1.2, and in `12d-Q2` and `12d-Q3`. ⚠ **The four-word form survives on its own merits** — §3.4's real sentence, *"the card says only that it cannot answer and why the question is open"*, licenses it without the invented half; `12d-Q3`'s reason is rewritten to rest on that |
| **4** — §3.4 is less silent than `12d-Q1` claims; the build **overrode** a table row | MEDIUM | ✅ **ACCEPTED — re-classified, behaviour unchanged** | Checked in the spec itself: §3.4's `gpus` table assigns `null` → *"invariant 1: an em dash, and the `errors[]` entry says why"*, **unconditionally**. §6.2 is silent; §3.4 is not. So `incomplete`-wins is an **override of an explicit table row**, not a silence, and invariant 7's *record a silence* is the wrong bucket. `12d-Q1` is re-worded to say what happened and now carries the adversarial's correction that the argument is about **proximity**, not presence — both explanations do reach SERVING. ⚠ It goes to the owner as an override (`HANDOVER.md` §8, `12d-Q1`) |
| **5** — the two panels contradict each other in prose when every row is refused | MEDIUM | ✅ **ACCEPTED as a finding; the copy change DEFERRED to the owner as `12d-Q6`** | The finding is right and `12c-Q5`'s *"unchanged"* is wrong: before 12d the cards rendered `—` and made no claim, so the page did not contradict itself; the ruling created the contradiction. ⚠ **The fix is not mine to make**: the replacement headline is panel copy, `SPEC.md`/`MOCK.html` are the source for it, and this phase may not edit either — invariant 7, the same rule that kept the build from inventing it. Recorded with its rendered evidence in `12d-build.md` §5 as `12d-Q6`, superseding the *"carried, unchanged"* row, and mirrored into `HANDOVER.md` §8 |
| **6** — the ruling's mirror failure is unbounded and nobody recorded it | LOW-MED | ✅ **ACCEPTED as the adversarial framed it — recorded, not changed**, as `12d-Q7` | Re-derived: `grep -n remembered lib/conditions.ts` — `state.remembered` is rebuilt every poll and the **only** deletion is inside the retire branch, so nothing ages a stale condition out. It is a **spec consequence**: §9 says a protected subject goes *stale, never retired*, and `lib/conditions.ts` carries the reason (*"An expiry would be a clock that silently turns an alarm green"*). ⚠⚠ **And this phase WIDENS it** — a row that stays in `serving[]` reporting `health: null` for ever now keeps its last alarm for ever, where before it was deleted. That is the spec's own preference (*"An unobservable alarm is unknown, not resolved"*) chosen over deleting a live alarm, and it is stated in `12d-Q7` rather than buried |
| **7** — `{read:'partial', refused: []}` unreachable but expressible | LOW | ✅ **ACCEPTED — fixed** | `refused` is now `readonly [string \| null, ...(string \| null)[]]`. ⚠ It cost more than one token and the cost is worth recording: `refused.length > 0` does **not** narrow an array to a non-empty tuple, so the constructor was restructured to destructure (`const [first, ...rest]`) rather than cast — a cast would have been the unchecked assertion the tuple exists to remove. Pinned at run time by the compiler: `client.test-d.ts` ⚠⚠ *a PARTIAL read cannot be written with an EMPTY `refused`*, whose `@ts-expect-error` fails the build if the type ever stops forbidding it, with the twin (`['0']` and `[null]` both compile) so it is not *"`partial` never type-checks"* |
| **8** — the GPU `member` is inert; the pinning test documents intent | LOW | ⚠ **ACCEPTED, and OVERTAKEN by Finding 1's fix** | The finding was correct about the tree it was written against: `gpus` could only ever set `NOTHING_HELD_BACK`, so no `member` value changed behaviour. **The membership clause makes it live** — `gpu_temp:1`'s member `'1'` is now compared against the `gpus` membership every poll, and `12d-O7` (GPU membership read off the SERVING rows) **bites, red=2**. So the adversarial's *"no mutation should be added"* was right then and is wrong now, and the honest sentence is no longer *"nothing checks it"*. ⚠ The fixture had to be built to say so: `loaded`'s cards are `0,1` and its instances `'0','1'`, the coincidence trap, so the new `observations.test.ts` test crosses them (one instance called `'7'`) |
| **9** — `12d-Q2`'s cost estimate is wrong by an order of magnitude | LOW | ✅ **ACCEPTED — corrected** | Re-counted independently outside the phase reports: `gpu-panel.tsx` 2, `gpu-panel.test.tsx` 10, `serving-panel.test.tsx` 2, and `pipeline/steps/10-panels-assembly/regressions.py` **2** — `12d-GP1` and `12d-GP2` anchor on the literal. `12d-Q2` now says the real cost: two mutations re-aimed, an anchor census, and a 359-mutation harness run |
| **10** — the adversarial's own "could not break" list | — | ✅ **SPOT-CHECKED, three of seven, all confirmed** | (a) **identity grammar**, through the real `parseSnapshot`: `''`, `'01'`, `' 0'`, `'a b'`, `1.5` and a non-safe integer **all** arrive as `refused: [null]` — the frozen branch, the safe direction; `-0`, `0` and `7` arrive as `'0'`, `'0'`, `'7'`. (b) **the dedupe**: across `everythingZero`, `servingPopulated` and `nothingReadable` the only id emitted twice is `unit:gpu-fan-control.service`, and **both** of its observations carry `enumeration: null`, so `chosen.enumeration` cannot pick a wrong membership — ⚠ this matters **more** now, because that one value feeds both clauses. (c) **`NAMED_UNITS`** holds exactly one entry (`split → llama-split.service`), read at `lib/units.ts:171`, so no serving instance can collide with another unit name. The two partial renders' equality and the `size === 4` census were not re-derived; they are non-vacuous **by measurement** (`12d-GP1` red=5, `12d-GP2` red=4) |

**Nothing was rejected.** Two findings (5, 6) are accepted as findings and **deferred as owner
questions**, with the reason stated in their rows: in both cases what survives adjudication is a
`SPEC.md`/`MOCK.html` change this phase may not make, and inventing it is the precise thing
invariant 7 forbids.

---

## 2. ⚠⚠ Findings 1 and 2 — better or worse than 12c, answered with a measurement

### 2.1 The question, and why it had no answer as handed over

12d fixes an unbounded stuck alarm (an instance that genuinely left keeps its alarm for ever while
one unrelated row is refused) and widens a path that deletes a live one (a subject still in the list
that has merely gone quiet). **Those are not comparable by assertion**, and the parent was right to
refuse an assertion.

They are comparable by enumerating the states and measuring each. Four sequences, nine polls each,
5 s apart, through the **real** `parseSnapshot → conditionsFrom → enumerationsRead → observePoll` —
identical wire bytes for all three rules, the only difference being which `EnumerationsRead` the
poll is handed. `12c` is re-implemented in the probe as *serving key only when `read === 'all'`, and
no membership*; `12d/build` is the real `enumerationsRead` with the membership stripped back out.

### 2.2 The measurement

| sequence | what the wire says | **12c** | **12d as handed over** | **12d as this phase leaves it** |
|---|---|---|---|---|
| **S-A** card 1 stays in `gpus[]` on every poll; its `tempC` goes `null` | the card is still there | `gpu_temp:1` **retired** p5 · alarms **7 → 6** | `gpu_temp:1` **retired** p5 · **7 → 6** | `retired=[]` · alarms **7** ✅ |
| **S-B** instance `'7'` stays in `serving[]`; `health`/`unitState` go `null`; **clean read** | the row is still there | 2 alarms **retired** p5 · **8 → 6** | 2 alarms **retired** p5 · **8 → 6** | `retired=[]` · alarms **8** ✅ |
| **S-C** the same, **plus row `'0'` refused by name** (Finding 2's wire) | the row is still there | `retired=[]` · **8** | 2 alarms **retired** p5 · **8 → 6** ⚠ | `retired=[]` · alarms **8** ✅ |
| **S-D** row `'0'` refused by name, instance `'7'` **genuinely leaves** | the row is gone | `retired=[]` · **8, for ever** ⚠ | 2 alarms **retired** p5 · **8 → 6** ✅ | 2 alarms **retired** p5 · **8 → 6** ✅ |

### 2.3 The answer

> **As handed over, 12d was not an improvement on 12c. It was a trade, and an unquantified one.**
> S-D is strictly better and **S-C is strictly worse** — on S-C the same wire that 12c rendered
> honestly deletes two live `alarm`s under 12d. S-A and S-B are identical and wrong under both.
> There is no ordering between "deletes a live alarm in state S-C" and "pins a dead alarm in state
> S-D" that does not rest on a claim about how often each state occurs on this box, and **nobody
> has that number** — `HANDOVER.md` §0.0's *"What 12c adds to the box-side list"* item 1 (*is
> client/server skew possible on this deployment at all?*, `12c-build.md` §6 Q8) is still the
> owner's, so we do not even know that a refused row is reachable in production at all.
>
> **With the membership clause, the trade disappears.** 12d/reconcile is better than 12c in S-A,
> S-B, S-C **and** S-D, and better than 12d/build in S-A, S-B and S-C with S-D unchanged. It is the
> only one of the three that never deletes an alarm belonging to a subject the server is still
> reporting, which is the sentence §9 row 2 was ratified to make true.

That is why course (b) was refused: it is the smallest diff, and the thing it would have shipped is
a regression on a live page with an owner question attached instead of a fix. Course (c) was
refused because the finding is **not** a spec question — §9 row 2 already says *"and it was not in
it"*, and no ruling is needed to make code match a sentence the owner has already ratified.

### 2.4 ⚠ What the fix costs, stated rather than discovered

A subject that stays in a collection while its readings stay `null` now keeps its last confirmed
band **for ever**. That is Finding 6's unboundedness, widened, and it is recorded as `12d-Q7` rather
than hidden: §9 chose that direction in as many words (*"An unobservable alarm is **unknown**, not
resolved"*), and §6.5's stale mode shows the age of the reading behind it. **Whether staleness needs
a horizon is a §9 ruling and it is the owner's.**

### 2.5 ⚠ The per-subject rulings still ship exactly as ruled

The handoff's warning — *a Finding-1 fix that quietly re-freezes everything has undone the loop* —
is answered by S-D, which is unchanged: a named refusal still reports the enumeration READ, holds
back exactly the refused identity, and lets a departed instance retire on that poll. Both §9
branches keep their tests and their mutations, and `12d-O1` (the frozen branch optimised away) still
reddens 5.

---

## 3. What was applied

### 3.1 The shape, and why the two facts are not one set

`EnumerationsRead`'s value stops being a bare exclusion set and becomes a pair:

```ts
export interface EnumerationRead {
  readonly members: ReadonlySet<string>;  // §9: "…and it was NOT IN IT"
  readonly held: ReadonlySet<string>;     // 12d: "…and its row was not one we refused"
}
export type EnumerationsRead = ReadonlyMap<string, EnumerationRead>;
```

and `observePoll` asks §9 row 2's sentence in the order it is written:

```ts
const entry = membership === null ? undefined : enumerationsRead.get(membership.name);
const enumerated =
  membership !== null &&
  entry !== undefined &&
  !entry.members.has(membership.member) &&
  !entry.held.has(membership.member);
```

⚠⚠ **Folding `members` into `held` was tried first and rejected, and the reason is a test rather
than an aesthetic.** A single set is a smaller diff — the type never changes, and none of
`conditions.test.ts`'s 32 call sites move. But `observations.test.ts`'s anti-vacuity line is
*"`gpus` was read too, and NOTHING is held back there — a fix that held everything back everywhere
would satisfy the line above and retire nothing at all"*, and under a union the `gpus` set
legitimately contains every card. **The assertion stops being able to discriminate.** That is this
project's own §0.17 rule one level in: two different facts must not render as one value, and the
first place the collapse shows is a test that can no longer tell them apart.

⚠ The membership is read off **`snapshot.gpus` and `snapshot.serving`** — the same arrays
`conditionsFrom` walks — with the same expressions it passes as the member (`String(gpu.index)`,
`instance.instance`). The comparison is only meaningful while the two spellings agree, and reading
them off one array makes that structural rather than a convention two files have to keep.

### 3.2 Files changed by this phase

| file | what |
|---|---|
| **`lib/conditions.ts`** | ⚠⚠ `EnumerationRead`; `EnumerationsRead` is a map to the pair; `observePoll`'s membership clause, with §9 row 2's own "Because" quoted beside it |
| **`lib/client/observations.ts`** | ⚠⚠ `gpuMembersOf` / `servingMembersOf`; all three `read.set` sites carry the pair |
| **`lib/client/wire.ts`** | `ServingEnumeration`'s `refused` is a NON-EMPTY tuple; `servingEnumeration` destructures rather than length-tests (finding 7) |
| **`components/panels/gpu-panel.tsx`** | the fabricated citation replaced with the two verbatim spec sentences and the handoff attribution (finding 3). **Comment only — no rendered byte changes** |
| `lib/conditions.test.ts` | `readSaw(members, held)`; 7 call sites migrated; **+4 tests** for the membership clause |
| `lib/client/wire.test.ts` | `retireSequence` helper; **+3 tests** — the GPU scenario, its departure twin, and Finding 2's exact wire; `.held`/`.members` split in 3 existing ⚠ tests |
| `lib/client/observations.test.ts` | **+1 test** — each collection reports its own membership, on a fixture where cards and instances **disagree**; `.held`/`.members` split in 3 existing ⚠ tests |
| `lib/client/client.test-d.ts` | **+1 type test** — `{read:'partial', refused: []}` no longer compiles, with its twin |
| `pipeline/steps/04/regressions.py` | `12d-C1`/`C2`/`C3` and `04-T72` **re-aimed** onto the new expression, names unchanged and still exact; **+`12d-C4`/`12d-C5`** |
| `pipeline/steps/08/regressions.py` | `08-O14`, `12c-T03`, `12c-T04`, `12d-O1`, `12d-O2` **re-aimed**; **+`12d-O7`/`12d-O8`** |
| `pipeline/steps/12-deploy/12d-build.md` | the citation correction, the supersede banners, `12d-Q1`/`Q2`/`Q3` rewritten, `12d-Q6`/`Q7` added |

**`lib/client/runtime.ts`, `lib/client/events.ts`, `serving-panel.tsx`, `components/strip.tsx`,
`lib/units.ts`, `proxy.ts`, `next.config.mjs` and everything under `app/` are untouched.** No
`.env`; `next-env.d.ts` byte-identical (restored by `measure-breakpoints.mjs`, and `git status` was
taken after the last run finished).

### 3.3 The four new mutations — wrong implementations, in pairs, one per direction

| id | the wrong implementation | red |
|---|---|---|
| `12d-C4` | membership is matched against the condition's own **subject**, so a subject still in the collection is retired anyway — the same conflation `12d-C1` covers for `held`, one clause over | **3** |
| `12d-C5` | the membership clause is **inverted**, so the only subject that retires is one the collection still lists | **9** |
| `12d-O7` | the GPU membership is read off the **serving** rows, so a card still enumerated is not recognised as present | **2** |
| `12d-O8` | the serving membership is the rows' **array position** rather than their identity, so a named instance is never recognised as present | **3** |

⚠ `C4`/`C5` and `O7`/`O8` are pairs. A single mutation of a clause can only prove that *a* clause is
there, never that it points the right way (HANDOVER §5). ⚠ `O7`/`O8` exist because the coincidence
is real and everywhere: on every other fixture in this tree the card indices and the instance
identities are the same strings, so a membership read off the wrong collection is byte-identical to
the right one — the new `observations.test.ts` fixture crosses them deliberately (one instance
called `'7'`, which is no card index and no row position).

---

## 4. Measurements — every figure quoted from the command's own output

### 4.1 `pnpm verify` — **exit 0**, twice

```
Test Files  109 passed (109)
      Tests  3849 passed (3849)
Type Errors  no errors
```

Baseline re-run on the tree as handed over first: **3840**, exit 0. **3849 after this phase** — nine
tests added (4 in `conditions.test.ts`, 3 in `wire.test.ts`, 1 in `observations.test.ts`, 1 type
test), **no new test file**. The second run above is on exactly the tree this phase leaves, after
every harness and both browser scripts had finished.

### 4.2 The exposed harnesses — **re-derived, and there are SIX, not four**

Derived by intersecting each `regressions.py`'s `LEDGER_FILES`, its mutated **source** files and its
mutations' **check** files with `git status`'s dirty list — all three, not the ledger alone:

| harness | ledger files dirty | mutates | checks |
|---|---|---|---|
| `02-format-severity` | — | `lib/conditions.ts` | `lib/conditions.test.ts` |
| `03-collectors-gpu-host` | — | `lib/fixtures.ts` | — |
| `04-collector-cooling` | `lib/conditions.test.ts` | `lib/conditions.ts` | `lib/conditions.test.ts` |
| `05-collectors-serving-storage-safety` | — | `lib/fixtures.ts` | — |
| `08-client-runtime` | `wire/observations/events.test.ts` | `observations.ts`, `wire.ts`, `fixtures.ts` | the same three |
| `10-panels-assembly` | `gpu-panel/serving-panel.test.tsx` | `gpu-panel.tsx`, `test-support.ts`, `observations.ts` | the two |

⚠ **This is 02/03/04/05/08/10, and the handoff named four.** 03 and 05 each carry one mutation of
`lib/fixtures.ts`, which is dirty from the build phase — the test phase argued them away on the
strength of their anchors, and this phase **ran them instead**, because this phase changed a type
that `lib/fixtures.ts` constructs (`ServingEnumeration`) and an argument about anchors is not an
argument about what a mutation's check now does. Both are clean.

**All six were run SERIALLY, one at a time, never two at once, none killed, `pnpm verify` never
beside one, nothing polled with `pgrep`, and no exit status was taken through a pipe** — one
foreground command each, `$?` written straight to its own status file, and the ANCHOR report read
from the log.

| harness | exit | mutations | distinct red tests | ⚠ checked | report |
|---|---|---|---|---|---|
| `02-format-severity` | **0** | **66** | 291 | 30 | *"All 66 regressions failed their check, as they must."* |
| `03-collectors-gpu-host` | **0** | **73** | 115 | 25 | *"All 73 regressions failed their check, as they must."* |
| `04-collector-cooling` | **0** | **99** | 197 | 94 | *"All 99 regressions failed their check, as they must."* |
| `05-collectors-serving-storage-safety` | **0** | **174** | 281 | 173 | *"All 174 regressions failed their check, as they must."* |
| `08-client-runtime` | **0** | **240** | 434 | 320 | *"All 240 regressions failed their check, as they must."* |
| `10-panels-assembly` | **0** | **359** | 554 | 386 | *"All 359 regressions failed their check, as they must."* |

**Zero `ANCHOR NOT FOUND` / `ANCHORS MOVED` / `ANCHORS AMBIGUOUS` / `DID NOT BITE` /
`NO MUTATION REDDENS` / `UNMATCHABLE LEDGER KEYS` on all six**, grepped from each log rather than
read off an exit code, and **every ⚠-marked test went red under at least one mutation** on all six.
All six passed on the **first** run.

⚠ **Five `!!!` lines in step 03, and they are NOT this loop's.** They read *"a test/it call the
⚠-scanner cannot read"* against `lib/collectors/numbers.test.ts` (4) and `lib/collectors/proc.test.ts`
(1) — template-literal test names. Both files are **clean in `git status`**; no phase of 12d touched
them, and step 03 reported exit 0 at 73 mutations in 12c as well. Stated so the parent does not
re-hunt it, and so it is not read as a regression of this loop.

### 4.3 The 12d mutation set, on the tree this phase leaves

| id | build | test | **now** | id | build | test | **now** |
|---|---|---|---|---|---|---|---|
| `12d-C1` | 2 | 2 | **2** | `12d-O3` | 3 | 4 | **5** |
| `12d-C2` | 2 | 2 | **2** | `12d-O4` | 4 | 5 | **5** |
| `12d-C3` | 5 | 5 | **8** | `12d-O5` | 2 | 2 | **2** |
| ⚠ `12d-C4` | — | — | **3** NEW | `12d-O6` | 1 | 2 | **2** |
| ⚠ `12d-C5` | — | — | **9** NEW | ⚠ `12d-O7` | — | — | **2** NEW |
| `12d-W1` | 5 | 7 | **8** | ⚠ `12d-O8` | — | — | **3** NEW |
| `12d-W2` | 4 | 4 | **4** | `12d-GP1` | 5 | 5 | **5** |
| `12d-O1` | 4 | 5 | **5** | `12d-GP2` | 4 | 4 | **4** |
| `12d-O2` | 6 | 7 | **8** | | | | |

The re-aimed inherited ones: `04-T72` red=7, `08-O14` red=5, `12c-T03` red=3, `12c-T04` red=3 —
each still removes exactly what its name says, checked against what it now **replaces** (HANDOVER
§0.4): `04-T72` still forces `enumerated = true`; `08-O14` still drops both `null` guards;
`12c-T03`/`T04` still change only the condition on the `read === 'all'` branch.

### 4.4 The anchor census — all ten ledgers, on the tree this phase leaves

```
mutations across the ten harnesses: 1588      (1584 at the test phase, +4)
unique ids:                         1588
duplicate ids:                      none
string anchors not matching exactly once: 0
```

(57 multi-edit list anchors are not checkable by that one-line census and are checked by the
harnesses themselves, all six of which reported zero anchor faults.)

### 4.5 The browser measurements — **neither moved, and neither should have**

**`measure-breakpoints.mjs` — exit 0, `102 passed, 0 failed, 0 blocked by this environment, 102
total`.** First run; it printed `Restored next-env.d.ts (rewritten by 'next dev')`, and `git status`
taken afterwards agrees the file is byte-identical.

**`measure-arrangements.mjs` exit 0; `check-density.mjs` exit 0, `ALL PASS`.**

| claim | measured here |
|---|---|
| one panel **0.8 px** from its cap at 1600 | record **17**, `1600x1024`: `closest to its cap: gpu0 by 0.8 px` |
| the other tight ones | `cpu by 0.7 px`, `gpu0 by 1 px`, `serving by 1.3 px`, `safety by 2.9 px` |
| §6.1's no-scroll promise | `scrollHeight 1080 vs viewport 1080 → overflow 0 (band 43)`; `overflow 0` with the §6.4 banner pinned (`band 101.8`) |
| the healthy page's spare | **`283.6 px`** (content bottom 796.4, viewport 1080) |

This phase changed one **comment** in one component and nothing else that renders; every other edit
is in `lib/`, a `*.test.ts(x)` file or a ledger. Both scripts ran **after** the last harness had
finished, never beside one.

### 4.6 `git status`

**24 entries: 17 modified, 7 untracked. Nothing is staged and nothing is committed.** `next-env.d.ts`
is **not** in the list, and the listing was taken after the last measurement finished — the only
time that means anything. **No source file is left mutated**: every harness restored what it
touched, and the §4.4 census was re-run against the tree afterwards.

```
 M components/panels/gpu-panel.test.tsx      M lib/client/wire.test.ts
 M components/panels/gpu-panel.tsx           M lib/client/wire.ts
 M components/panels/serving-panel.test.tsx  M lib/conditions.test.ts
 M components/panels/test-support.ts         M lib/conditions.ts
 M lib/client/client.test-d.ts               M lib/fixtures.ts
 M lib/client/events.test.ts                 M pipeline/steps/04-collector-cooling/regressions.py
 M lib/client/observations.test.ts           M pipeline/steps/08-client-runtime/regressions.py
 M lib/client/observations.ts                M pipeline/steps/10-panels-assembly/regressions.py
 M pipeline/HANDOVER.md                       (§8 — the seven owner questions)
?? pipeline/handoffs/12d-{adversarial,reconcile,test-phase}.md
?? pipeline/steps/12-deploy/12d-{adversarial,build,reconciliation,test}.md
```

⚠ `lib/client/client.test-d.ts` is new to the dirty list and is **not** in any harness's
`LEDGER_FILES` or check set — it is checked by `vitest`'s `typecheck` block, which `pnpm verify`
runs, and its `@ts-expect-error` is what fails if the tuple type is ever loosened.

---

## 5. Owner questions — every one mirrored into `HANDOVER.md` §8

| id | one line | where the full statement is |
|---|---|---|
| **`12d-Q1`** ⚠⚠ | **Re-classified from a silence to an OVERRIDE.** §3.4's table gives `gpus: null` the em dash unconditionally, and a cut list is rendered instead when both are true | `12d-build.md` §5 |
| **`12d-Q2`** ⚠⚠ | §3.4 names no string for the third form; `list not fully read` was chosen, and the cost of changing it is two mutations plus a 359-mutation run | `12d-build.md` §5 |
| **`12d-Q3`** | Should the card name how many rows were refused? Recorded reason rewritten — the old one rested on a sentence nobody wrote | `12d-build.md` §5 |
| **`12d-Q4`** | Should a list read in part produce an event-log line? Unchanged | `12d-build.md` §5 |
| **`12d-Q5`** | A refused row may name an identity that also appears on a row we read; held back anyway | `12d-build.md` §5 |
| **`12d-Q6`** ⚠ NEW | **The two panels contradict each other in prose when every row is refused**, and 12d created the contradiction. Needs panel copy | `12d-build.md` §5, §1 row 5 above |
| **`12d-Q7`** ⚠ NEW | **Staleness is unbounded and this phase widened it.** Does §9 need a horizon? | `12d-build.md` §5, §2.4 above |

---

## 6. Rules observed

- **Nothing was committed and nothing was staged.** No `git add`, no `git checkout --`, no push.
- **No spec file was edited.** `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are
  untouched; every wording this phase wants is an owner question in §5.
- **No harness ran beside another**, none was killed, `pnpm verify` never ran beside one, no
  `pgrep`, and no exit status was taken through a pipe — each `$?` went straight to its own file and
  every verdict was read from the printed ANCHOR report.
- **The box was not contacted.** No SSH, no HTTP to `192.168.4.71`, no D-Bus socket opened.
- Nothing was deployed; `next-env.d.ts` is byte-identical; there is no `.env`.
- Every probe is a throwaway `*.recon.ts` under the session scratchpad, run through a separate
  vitest config that aliases `@` at the repo. **Nothing was written inside the repo by a probe.**

## 7. ⚠ This is a RECONCILE phase only

**Parent review is still to run**, and it re-runs `pnpm verify` itself and audits this adjudication
— rejections and deferrals first — before any commit. ⚠ The two rows to audit hardest are
**Finding 5** and **Finding 6**, the only two not applied: both are deferred on the ground that the
surviving fix is a `SPEC.md`/`MOCK.html` change this phase may not make, and if the parent disagrees
with that ground, both become one-line changes with an owner ruling behind them.
