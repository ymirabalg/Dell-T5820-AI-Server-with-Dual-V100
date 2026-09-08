# 10b-S-G — TEST phase

**Written by the test-phase agent, 2026-09-08.** Branch `dashboard-frontend`, working dir
`dashboard/`. Read the handoff, the build (`10b-sg-error-instance.md`), `SPEC.md`'s §3.7
`errors[].instance` block and §6.5, `ANCHOR.md` §4/§5/§8, `PLAN.md`. `SPEC.md` was not
touched. One line correction: the ⚠ `errors[].instance` block the handoff calls "§4's" is
actually in **§3.7** (line 542, inside "Closed vocabularies"), not §4 ("API surface", which
starts at line 576). Immaterial to the analysis below, noted for precision.

---

## 1. The highest-priority question, answered first

**A malformed `instance` does not lose one message. It loses the ENTIRE snapshot — every
GPU temperature, every host figure, every panel — and the client treats the poll exactly as
if the server had not answered at all (§6.7's failed-poll state: grey dot, counting age,
frozen traces, backoff).**

### What the code actually does, established with a fixture

`telemetryErrorOf` returns `undefined` for an entry with a present-but-invalid `instance`
(`lib/client/wire.ts:503-514`). That `undefined` reaches `arrayOf`
(`lib/client/wire.ts:240-249`):

```ts
const arrayOf = <T>(value: unknown, item: (v: unknown) => Checked<T>): Checked<readonly T[]> => {
  if (!Array.isArray(value)) return undefined;
  const out: T[] = [];
  for (const entry of value) {
    const checked = item(entry);
    if (checked === undefined) return undefined;   // <-- one bad entry voids the WHOLE array
    out.push(checked);
  }
  return out;
};
```

One malformed entry makes `arrayOf` return `undefined` for the **whole `errors` array**, not
just drop that entry. `parseSnapshot` then hits its own top-level check
(`lib/client/wire.ts:566-578`) — `errors === undefined` — and returns `null` for the **whole
snapshot**. Per `parseSnapshot`'s own doc comment, `null` "is a server that did not answer the
contract" and §6.7 "treats it as a **failed poll**."

I confirmed this with a throwaway fixture (not committed, deleted after use):
`everythingZero` — a fully-populated, healthy-reading snapshot — plus one extra `errors[]`
entry with `instance: 'not-a-number'`. `parseSnapshot` returned `null`. I then ran the
identical fixture with a malformed **`message`** (`42` instead of a string, a field that has
always been required) instead of a malformed `instance`: **identical result, `null`.** The
existing test at `lib/client/wire.test.ts:233-239`
(`'⚠ an errors[] entry with an instance that is %s is refused'`) already proves the same fact
for `instance` specifically — "refused" there means `parseSnapshot(...)` is `null`, not "the
entry is dropped from the array."

### Is this right?

**Yes, and it should be defended, not softened — but the handoff's framing of the stakes
understates them, and so does the build's own write-up.**

1. **It is not a new failure category invented for `instance`.** The exact same blast radius
   already existed for `TelemetryError.message` (a required field, tested at
   `wire.test.ts:192-194`, "an errors[] entry with no message is refused") and for every other
   field in the contract — a malformed `Gpu.tempC`, a `fanServiceState` outside the six unit
   states, a missing `cooling` key. `instance` adds a third field that must be well-formed to
   an object that already had two; it does not add a new way for the whole snapshot to be
   voided.
2. **The file's whole design rests on one distinction, stated in its own header**: `null` is
   "a reading this box could not take" (invariant 1) — a legitimate value, never a validation
   failure — while any field holding a value its type disallows is "a server that does not
   implement this contract," a contract violation. `instance` present-and-malformed is
   squarely the second case: no well-behaved server (old or new) ever sends
   `instance: "1"`, `instance: 1.5`, or `instance: null`. An old server omits the key
   entirely (the licensed, additive case); a current, correct server sends a real integer or
   nothing. A present-invalid value can only mean a server-side bug or corrupted transport —
   exactly the class of problem this validator exists to surface loudly rather than paper
   over.
3. **The proposed alternative — keep the entry, drop only the bad `instance`, treat it as a
   subjectless entry — would special-case exactly one field in the whole file.** `source` and
   `message` on the same struct already hard-refuse the entire snapshot on a type violation;
   softening `instance` alone would mean a reader of `wire.ts` has to remember that one
   specific optional field is "safe to partially trust" while every sibling field, on the same
   object, is not. That is precisely the kind of undocumented asymmetry O10's own docstring
   was written to prevent ("A cast tells the compiler what to believe about bytes nobody
   checked" — the point of validating once is that everything downstream can trust the result
   completely, with no per-field exceptions to remember).
4. **Loud failure is the correct response to a contract violation, here specifically.**
   Server and client "ship in one image" (per `parseSnapshot`'s own comment about why
   `standing` is required, not optional) — there is no legitimate version skew for a malformed
   *value* to absorb, only for an *absent key* (which is exactly the one exception §3.7
   deliberately carved out). If a collector bug ever emits garbage in `instance` — an
   off-by-one, a `NaN` from a bad calculation — the operator wants a visibly broken dashboard
   that gets investigated immediately, not a quietly degraded one that drops a diagnostic
   while looking otherwise healthy. A grey dot is diagnosable; a plausible-looking dashboard
   silently missing one explanation is the exact failure invariant 5 exists to prevent, just
   inverted — here it would be "a well-formed-looking snapshot silently hiding evidence that
   the contract was violated."

**Where the handoff's framing (and the build's) undersells this:** both discuss the cost as
"a malformed optional field destroys a diagnostic," implying the loss is scoped to that one
`errors[]` message. It is not — the loss is scoped to **the entire poll**, GPU temperatures
and all. That is a materially bigger claim than either write-up makes, and it strengthens
rather than weakens the case that this must be a loud, whole-snapshot failure rather than a
silent, partial one: a bug big enough to send a wire-invalid `instance` deserves the loudest
signal this file has, not the quietest. I did not change any behaviour here — the design is
sound and already uniformly applied — but flag for whoever reads this next that "refuses the
entry" in both documents undercounts the actual consequence, and a future reader relying on
the doc comment's literal words could get this wrong.

---

## 2. The rest, in the handoff's priority order

### 2.1 The enumeration (§4.1)

Verified against `ErrorSource`'s table in `lib/client/wire.ts:111-130` — 18 members, matching
`SPEC.md`'s list exactly. I read every call site of `tag(` in `lib/collectors/*.ts` (16 call
sites across `cooling.ts`, `dbus.ts`, `collect.ts`, `storage.ts`, `safety.ts`, `serving.ts`):

- **`llama-env`, `llama-health`, `llama-models`** — every call site is either inside
  `collectServing`'s per-instance closure (`serving.ts:335-347`, which does
  `.map((e) => ({ ...e, instance }))`) or the directory/malformed-filename case
  (`serving.ts:314,318`, which never passes an instance). Matches the build's table exactly.
- **`dbus`** — every per-unit `tag('dbus', [...], instance)` call in `dbus.ts`'s loop
  (lines 508-566) looks up `instance` from `unitInstances?.get(unit)` at the point of the
  call; the two pre-loop/mid-loop bus-wide failures (`dbus.ts:481,571`) never pass a third
  argument.
- **The other 14 sources** — I confirmed every one of their `tag(...)` call sites
  (`nvidia-smi`, `coretemp`, `proc-*` and `hostname` via the shared `readAndParse` helper in
  `collect.ts:163-183`, which takes no `instance` parameter at all; `statvfs` in
  `storage.ts:88,91`; `ufw`/`dkms` in `safety.ts`; `dell-smm` in `cooling.ts:123`) — none is
  reachable with a third argument. None of the 14 has any code path where an instance number
  is even in scope.

**No source that could name an instance is missing from the 4, and no source that cannot is
reachable with one by accident.** Enumeration confirmed correct and complete.

### 2.2 `collectSafety`'s omission of `unitInstances` — was enforced only by memory, now has a test

Confirmed: `safety.ts:221` calls `collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT],
timeoutMs })` — no `unitInstances`. I grepped `safety.test.ts` before touching anything: **zero
mentions of `.instance` anywhere in the file.** No test read that field on a SAFETY error.
`dbus.test.ts`'s own `unitInstances` tests (lines 459-513) exercise `collectUnitStates` as a
generic function with various maps — including one where the fan unit is absent from the map
— but none of them touch the actual production call site in `safety.ts`. Since the harness
mutates existing source text, and `safety.ts`'s call never had a `unitInstances` argument to
begin with, there was no mutation that could represent "a future edit adds one by mistake." So
the answer to the handoff's question — "is there a test that fails if a future edit passes the
map?" — was **no.**

**Fixed.** Added:

- `lib/collectors/safety.test.ts`, new test `'⚠ 10b-S-G — a per-unit dbus failure for the fan
  service never carries an instance'`. It drives a genuine **per-unit** dbus failure through
  the real `collectSafety` call site — `fakeDbus('zombie')` returns an `ActiveState` outside
  `UnitState`'s six values, which `dbus.ts` treats as its own per-unit error
  (`asUnitState(raw) === null`, line 545-559) — and asserts the resulting `dbus` error carries
  no `instance` (`Object.hasOwn(...) === false`, not just `.instance === undefined`, since a
  present-but-`undefined` value would also read that way). A bus-wide connect failure (the
  scenario the pre-existing `'⚠ an unreachable bus leaves the two file checks intact'` test
  uses) would **not** have caught a wrongly-added `unitInstances`, because `dbus.ts`'s
  connect-failure branch never reads `unitInstances` regardless of what is passed — only the
  per-unit loop does. That is why a new, per-unit-failure test was needed rather than
  strengthening the existing one.
- `pipeline/steps/05-collectors-serving-storage-safety/regressions.py`, new mutation
  **`10b-SF1`**: `collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT], timeoutMs })` →
  the same call with `unitInstances: new Map([[FAN_SERVICE_UNIT, 0]])` added. This is exactly
  the wrong edit the omission is meant to prevent. Ran step 5's harness after adding it: green,
  the new ⚠ test reddens under `10b-SF1` and nothing else needed to change.

### 2.3 Both sides of `optionalInteger` (§4.2)

All three outcomes are fixtured in `lib/client/wire.test.ts:197-253`:
`ABSENT` (203-209), valid (213-218), and invalid — five separate values in one
`test.each` (225-239: a string, a float, `-Infinity`, `NaN`, and `null` specifically called out
as "a third, illegal spelling" distinct from absent-key). Plus a mixed-array test (241-252)
proving the two shapes coexist in one `errors[]` without contaminating each other. All three
sides, plus the boundary between "optional" and "nullable" that a lesser test would have
missed. No gap found here.

### 2.4 The old-server case (§4.3)

**Tested via composition of two layers, not narratively labelled "old server" in either, but
behaviourally exactly that case.** `wire.test.ts:203-209` proves the wire half: a snapshot
whose `errors[]` entry omits `instance` entirely still validates, with the resulting object
missing the property (`Object.hasOwn(...) === false`). `serving-panel.test.tsx:129-139`
("an entry naming no instance is collector-wide and renders once, under the rows") proves the
render half using exactly that shape. Composed, these two tests are an end-to-end proof of
"an old server's payload still validates and falls back to panel-level rendering" — I did not
find a single test that goes from raw pre-redeploy JSON bytes through to the rendered panel in
one assertion, but the claim is genuinely exercised at both boundaries it crosses, not merely
asserted in a doc comment. I do not consider this a gap worth adding a redundant integration
test for.

### 2.5 F2's regression coverage (§4.4) — a real finding: the credited test does not discriminate

The handoff asked: would the "shipped fixture" test fail without this change? I checked this
directly rather than trusting the build's §7 claim, by reimplementing the OLD `namesInstance`
verbatim from `git diff HEAD -- components/panels/serving-panel.tsx` (three `.includes` checks
on unit name / `<i>.env` path / port) in a standalone script and running both the old and new
logic against every fixture the `describe('⚠ §6.5 …')` block in `serving-panel.test.tsx` uses:

| fixture message | instance field | OLD heuristic routes to | NEW structural routes to | same? |
|---|---|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:8081` (the shipped `servingPopulated` fixture, F2's original repro) | `1` | instance 1 | instance 1 | **yes** |
| `the model failed to answer in time` | `1` | *(none)* | instance 1 | no |
| `connect ECONNREFUSED 127.0.0.1:8081` | *(absent)* | instance 1 | *(none)* | no |

**Finding: the "shipped fixture" test (`serving-panel.test.tsx:85-93`) is not a discriminator
between the old text heuristic and the new structural join, and the build's claim that it "is
exactly the one the handoff asked for" is overstated.** The message genuinely contains the
substring `:8081`, which the old heuristic matches on its own merits — reverting *only*
`namesInstance` to the old three-`.includes` body, while keeping every fixture exactly as this
build left it, would leave that specific test **green**, not red. The build's own reasoning in
§7 compares against a different, weaker counterfactual ("had the text heuristic simply been
deleted without a replacement," i.e. `namesInstance` always returning `false`) rather than
against the actual prior implementation, which is why the claim doesn't hold up.

**This is not a functional gap, because the other two tests the build added in the same
`describe` block are exactly the differentiators the handoff asked me to construct**, and my
table above confirms both discriminate correctly:

- `'⚠ 10b-S-G — the join is instance, not the message…'` (lines 95-108) uses a message that
  names *nothing* about any instance; the old heuristic would have matched neither row (a false
  negative), while the new join correctly attaches it via the structural field.
- `'⚠ 10b-S-G — an entry whose MESSAGE names an instance but has no instance field is
  unattributed'` (lines 141-153) is the literal answer to "construct a message that would have
  fooled the old heuristic": it reuses the exact ECONNREFUSED/8081 text, which the old
  heuristic would have (correctly, in that one case, but by luck of substring) routed to
  instance 1, and confirms the new code declines to attribute it anywhere since no real source
  would ever emit this exact shape.

**Net:** the feature is genuinely proven not to read message text for attribution — just not
by the test credited for it. I made no code change here (the test suite as a whole covers the
property; the individual test's self-description in the build's write-up is the only thing
that's wrong), but it is worth the next reader knowing which test actually does the work.

### 2.6 The two re-aimed step-5 anchors (§4.5) — checked, not narrowed

- **`05-D2b`** (`dbus.ts`, "the NoSuchUnit state is minted with no entry"): the mutation
  deletes the entire `errors.push(...tag('dbus', [...], instance), ...)` block (all 7 lines),
  identical in scope to the old single-line `problems.push(...)` deletion it replaced. The test
  it must redden — `dbus.test.ts:386-418`, `'⚠ NoSuchUnit reads inactive WITH an entry'` —
  asserts both `states.get(...) === NO_SUCH_UNIT_STATE` (untouched by this mutation) and
  `errors` having length 1 with the right message (broken by it). Confirmed the property under
  test ("an alarm nothing explains") is unchanged by the re-aim.
- **`05-V7`** (`serving.ts`, "collectServing also reads gpu-fan-control"): the mutation widens
  `units` to include `'gpu-fan-control.service'` inside the now-multi-line `collectUnitStates`
  call, leaving the new `unitInstances` argument untouched. The test it must redden —
  `serving.test.ts:248-259`, `'⚠ gpu-fan-control.service is NOT asked about here'` — asserts
  the exact list of units a spied `dbus` was asked about; the widened mutation adds an extra
  element, breaking both the `toEqual` and the `not.toContain(FAN_SERVICE_UNIT)` assertions.
  Confirmed O9's single-owner property is unchanged by the re-aim.

Neither anchor narrowed what it tests. Both still fail for the same reason they always did.

### 2.7 Names against bodies (§4.6)

Spot-checked every new/changed test name against its body across
`lib/client/wire.test.ts` (the `10b-S-G` describe block), `lib/collectors/dbus.test.ts`
(the `unitInstances` describe block), `lib/collectors/serving.test.ts` (the four `instance`-
asserting tests), `lib/contract.test.ts` (the wire-presence census test), `lib/types.test-d.ts`
(the optional/undefined/non-nullable censuses), and `components/panels/serving-panel.test.tsx`
(all four tests in the §6.5 describe block, including my own new one in `safety.test.ts`).
Every assertion I read scopes correctly to what its name promises; panel-level tests use the
existing `rowContaining(html, needle)` helper rather than a document-wide `toContain`. No
"names a property it does not check" instance found in the new material.

---

## 3. What I changed, and why

- `lib/collectors/safety.test.ts` — added one ⚠ test (§2.2 above). Closes the gap where
  `collectSafety`'s omission of `unitInstances` was enforced only by the author reading
  `safety.ts`, not by any assertion.
- `pipeline/steps/05-collectors-serving-storage-safety/regressions.py` — added mutation
  `10b-SF1` backing that test, per the project's red-test-ledger rule that every ⚠ test needs
  a mutation in its RED set.

Nothing else was changed. `SPEC.md` untouched. `purity.test.ts` untouched. No commit made.

---

## 4. Verification

```
$ pnpm verify
 Test Files  93 passed (93)
      Tests  2587 passed (2587)
Type Errors  no errors
```

(2587 = the build's 2586 plus the one new test added in this phase.)

**Harness re-run: step 5 only** (`lib/collectors/safety.test.ts` and
`pipeline/steps/05-collectors-serving-storage-safety/regressions.py` are the only files this
phase touched, and both are step 5's `LEDGER_FILES`/harness). Not re-run: step 8
(`lib/client/wire.test.ts`, read only, not edited) and step 10
(`components/panels/serving-panel.test.tsx`, read only, not edited).

```
$ python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
Red-test ledger: 189 distinct failing tests across 128 mutations; 99 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 128 regressions failed their check, as they must.
[exited with code 0]
```

(128 mutations = the build's 127 plus `10b-SF1`; 99 ⚠ marks = the build's 98 plus the new
safety test.)

```
$ git status --short
 M SPEC.md                                                              (parent's, untouched)
 M components/panels/serving-panel.test.tsx                             (S-G build)
 M components/panels/serving-panel.tsx                                  (S-G build)
 M lib/client/wire.test.ts                                              (S-G build)
 M lib/client/wire.ts                                                   (S-G build)
 M lib/collectors/dbus.test.ts                                          (S-G build)
 M lib/collectors/dbus.ts                                               (S-G build)
 M lib/collectors/errors.ts                                             (S-G build)
 M lib/collectors/safety.test.ts                                        (THIS PHASE)
 M lib/collectors/serving.test.ts                                       (S-G build)
 M lib/collectors/serving.ts                                            (S-G build)
 M lib/contract.test.ts                                                 (S-G build)
 M lib/fixtures.ts                                                      (S-G build)
 M lib/types.test-d.ts                                                  (S-G build)
 M lib/types.ts                                                         (S-G build)
 M pipeline/steps/05-collectors-serving-storage-safety/regressions.py   (S-G build + THIS PHASE)
 M pipeline/steps/08-client-runtime/regressions.py                      (S-G build)
?? pipeline/handoffs/10b-SG-error-instance.md
?? pipeline/handoffs/10b-SG-test-phase.md
?? pipeline/steps/10-panels-assembly/10b-sg-error-instance.md
```

No stranded mutation appeared in `git status` after the step-5 harness run (checked
immediately after; the diff is exactly the two files listed above as "THIS PHASE"). Nothing
committed.

---

## 5. Summary for the next phase

1. **The malformed-`instance` question: the current behaviour is right, defended above, and
   consistent with how every other field in `wire.ts` already works — but its actual blast
   radius (the whole snapshot, not the one entry) is bigger than either the handoff or the
   build's write-up states. Worth a sharper sentence in `wire.ts`'s doc comment if anyone
   revisits it; not a behaviour change.**
2. The source enumeration is correct and complete (verified against every `tag(` call site).
3. `collectSafety`'s `unitInstances` omission was previously unenforced by any test — fixed,
   one new ⚠ test plus one new mutation (`10b-SF1`), step 5's harness re-run green.
4. `optionalInteger`'s three sides are all fixtured.
5. The old-server fallback is genuinely tested, across two layers, though not narratively
   labelled as such.
6. **Finding:** the test the build credits with covering F2's regression
   (`serving-panel.test.tsx:85-93`) does not actually discriminate old-heuristic from
   new-structural behaviour for that fixture — verified empirically. The feature is still
   soundly proven, by the two *other* 10b-S-G tests in the same block, which are the genuine
   "message that would have fooled the old heuristic" cases.
7. Both re-aimed step-5 anchors (`05-D2b`, `05-V7`) still test their original property; neither
   was narrowed.
8. No name-vs-body mismatches found in the new test material.
