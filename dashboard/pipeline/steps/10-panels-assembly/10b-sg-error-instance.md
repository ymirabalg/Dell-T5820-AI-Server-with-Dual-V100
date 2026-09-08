# 10b-S-G — `errors[]` gains an optional `instance` (BUILD phase)

**Written by the build agent, 2026-09-08**, implementing the owner's ruling in `SPEC.md`
(search `10b-S-G`). Branch `dashboard-frontend`, working dir `dashboard/`. `SPEC.md` was
**not** edited — it is the parent's, already carrying the ruling. Nothing was committed.

---

## 1. The shape chosen, and why

`TelemetryError` gains one member:

```ts
export interface TelemetryError {
  readonly source: ErrorSource;
  readonly message: string;
  readonly instance?: number;
}
```

- **`instance?: number`, not `instance: number | null`.** Every other field in this contract
  is `T | null` — "no member is declared optional" is `lib/types.test-d.ts`'s own standing
  rule, until now. This one is the deliberate exception, because the two shapes answer
  different questions here. `T | null` says "every server sends this key; sometimes the
  reading fails." That is false for `instance`: an old server has **never heard of the
  field** and cannot be made to send `instance: null` for every entry without a code change
  of its own — which is exactly the redeploy SPEC.md's ⚠ block says is required for the
  *feature*, not for validation. `T | undefined` (i.e. `?:`) says "the key may not be sent at
  all," which is the true statement, and it is what lets `JSON.stringify` drop the key
  entirely and an old server's snapshot still validate.
- **No non-negativity check in the wire validator.** `lib/client/wire.ts`'s `integer()` (used
  for `Gpu.index` and `ServingInstance.instance` already) accepts any integer, not only
  `>= 0`. `optionalInteger` reuses it rather than adding a floor SPEC.md does not state.
  Recorded per invariant 7: the spec does not say `instance` must be non-negative; I matched
  the existing sibling fields' permissiveness rather than inventing a stricter rule.
- **`source`'s closed vocabulary is untouched** — no new `ErrorSource` member, so
  `errorsForPanel`'s exhaustive switch in `lib/client/observations.ts` needed no change.

## 2. Which sources can carry an `instance`, enumerated — invariant 7

SPEC.md names the field but does not say which of the eighteen `ErrorSource` values may
carry it. That is a judgment call, made here and recorded rather than guessed at per source
call site:

| source | can carry `instance`? | where, and why |
|---|---|---|
| `llama-env` | **Sometimes.** Per-instance env-file problems (`readEnv`, called with a known `instance`) always carry it. The directory-level `readDir` failure and `discoverInstances`' malformed-filename problems (a listed `.env` that does not parse as `<instance>.env`) **never** carry it — there is no confirmed instance to name, and inventing one from a rejected filename would be exactly the mistake this field exists to prevent |
| `llama-health` | **Always.** Only ever produced inside `probe()`, called once per instance inside `collectServing`'s per-instance closure |
| `llama-models` | **Always.** Same closure as `llama-health` |
| `dbus` | **Sometimes.** A per-unit failure inside `collectUnitStates`'s loop carries the instance `unitInstances` maps that unit name to — but only when the caller supplied that map. `collectServing` does (via `servingUnitName(i) → i`); `collectSafety` does not, because its one unit is `gpu-fan-control.service`, which has no instance. A bus-wide connect failure (before the per-unit loop even starts) **never** carries one — it explains the whole conversation, every requested unit at once, which is not one row's fact |
| the other 14 sources (`nvidia-smi`, `coretemp`, `proc-stat`, `proc-meminfo`, `proc-loadavg`, `proc-uptime`, `proc-net-dev`, `net-operstate`, `proc-cpuinfo`, `hostname`, `dell-smm`, `statvfs`, `ufw`, `dkms`) | **Never.** None of these collectors runs inside a per-`ServingInstance` closure; none has an instance number in scope at the point it files an entry |

Nothing here was guessed: each row above was checked by reading the collector that produces
that source, not inferred from the source's name.

## 3. Mechanism — how `instance` gets attached, structurally

- **`lib/collectors/errors.ts`'s `tag()`** gained an optional third parameter,
  `instance?: number`, applied to every message in one call's batch. It is the one place
  `{source, message}` objects are minted, so it is the one place that needed to learn how to
  add a third field.
- **`lib/collectors/serving.ts`**: `readEnv`'s and `probe`'s errors are merged and mapped
  through `.map((e) => ({ ...e, instance }))` inside the per-instance closure — `instance` is
  the closure's own loop variable, not re-derived from anything. `collectServing` also builds
  `unitInstances = new Map(instances.map((i) => [servingUnitName(i), i]))` and passes it to
  `collectUnitStates`, because `collectServing` is the only place that knows the pairing
  between a unit name and an instance number.
- **`lib/collectors/dbus.ts`**: `CollectUnitStatesOptions` gained
  `unitInstances?: ReadonlyMap<string, number>`. Every per-unit `errors.push` inside the
  `for (const unit of units)` loop now does `tag('dbus', [msg], unitInstances?.get(unit))` —
  looked up at the exact point the message is built, from the exact `unit` string already in
  scope, never re-parsed out of the message afterwards. The pre-loop bus-connect failure is
  unaffected and carries no instance.

  ⚠ **Design choice, recorded**: I kept `units: readonly string[]` as-is and added
  `unitInstances` as a *separate*, optional map, rather than changing `units` to
  `readonly { unit: string; instance?: number }[]`. The latter is arguably more "obviously
  correct," but it would have forced a mechanical rewrite of every one of `dbus.test.ts`'s
  ~20 existing `units: [...]` call sites for no behavioural gain — they would all have had to
  become `units: [{ unit: ... }]`. A second, optional, keyed-by-name map achieves the same
  structural (non-text) attribution with a strictly additive change to the option surface.
- **`lib/client/wire.ts`**: `optionalInteger(source, key)` returns one of three things — the
  sentinel `ABSENT` (key not present at all: valid, no `instance` field on the result),
  `undefined` (key present but not a valid integer: invalid, refuse the whole entry, same as
  every other malformed field), or the integer. `Checked<T>` could not express this on its
  own because `undefined` already means "invalid" everywhere else in that file — conflating
  "absent" and "invalid" would have let a malformed `instance` sneak through as though the
  server had simply never heard of the field, which defeats the whole point of validating it.
- **`lib/collectors/safety.ts`** needed **no code change** — it calls `collectUnitStates`
  without `unitInstances`, which is exactly the "no instance" case by omission, not by a
  special branch.

## 4. `condition-lookup.ts` — recorded, no change needed

The handoff named "the serving panel + `condition-lookup`" as the pair to check for the text
heuristic. Reading `components/panels/condition-lookup.ts` in full: it contains
`findDisplayed` (keyed on `conditionId`, which is already built from
`String(instance.instance)` or `servingUnitName(instance.instance)` — a structural join,
never touching `errors[]` at all) and `staleAgeNote`/`staleValueOr` (operate on
`DisplayedCondition`, never on a `TelemetryError`). **None of it ever matched on message
text.** The entire heuristic lived in one function, `serving-panel.tsx`'s `namesInstance`.
Recorded here per invariant 7 rather than silently doing nothing: `condition-lookup.ts` was
read and is unchanged because it had nothing to fix, not because it was skipped.

## 5. What replaced the text heuristic, and proof it is gone

`components/panels/serving-panel.tsx`'s `namesInstance` used to do three `message.includes(...)`
checks (unit name, `<i>.env` path, port). It is now:

```ts
const namesInstance = (error: TelemetryError, instance: ServingInstance): boolean =>
  error.instance === instance.instance;
```

No `.message` is read anywhere in the attribution path any more — it is only ever *displayed*.
Proof, beyond reading the diff:

- `components/panels/serving-panel.test.tsx` gained **"⚠ 10b-S-G — the join is `instance`,
  not the message: a misleading message text does not fool it"** — an entry with
  `instance: 1` and a message containing no unit name, no `.env` path, and no port still
  lands on row 1 and nowhere else. The old heuristic could not have passed this test by
  construction (it had nothing to match against).
- The mirror test, **"⚠ 10b-S-G — an entry whose MESSAGE names an instance but has no
  `instance` field is unattributed"**, uses the *exact* `servingPopulated`-style message
  (`connect ECONNREFUSED 127.0.0.1:8081`) that the old heuristic would have matched to
  instance 1 by its port, but with no `instance` field. It now renders on **neither** row —
  it falls to the panel-level `PanelNotes`, proving the port-substring path is gone, not
  merely no-longer-exercised.
- `servingPopulated`'s own fixture error now carries `instance: 1` structurally; the existing
  "shipped fixture" regression test (F2's own repro) still passes with the join reading the
  field, not the text.

## 6. Old-server behaviour

An old server's JSON simply omits the `instance` key on every `errors[]` entry it sends
(nothing in its code even knows the field exists). `lib/client/wire.ts`'s `telemetryErrorOf`
treats "key entirely absent" as valid — `optionalInteger` returns `ABSENT`, and the resulting
`TelemetryError` object has no `instance` property at all, exactly matching how a
subjectless entry already behaved. `namesInstance` then reads `undefined === instance.instance`,
which is `false` for every real instance number, so every entry falls to the panel-level
`PanelNotes` rendering — the pre-existing "an entry naming no instance is collector-wide"
path. **Nothing about this needs the redeploy**: the client change lands and behaves exactly
as it did before against an old server; it only *improves* against a new one. This matches
SPEC.md's ⚠ block precisely, and I did not find any note anywhere in the tree still claiming
a refusal for this case.

## 7. The regression F2 found — covered by a test that would fail without this change

> ### ⚠ CORRECTION — added 2026-09-08 by this item's RECONCILIATION (adversarial A9)
>
> **The section below is wrong, and it is left standing rather than edited away so the mistake
> is legible.** The test it credits — *"the shipped fixture no longer prints instance 1's
> ECONNREFUSED beside healthy instance 0"* — **does not discriminate** between the old text
> heuristic and the new structural join. `connect ECONNREFUSED 127.0.0.1:8081` contains the
> substring `:8081`, so the old three-`.includes` body routes it to instance 1 on its own
> merits: restoring that body verbatim while leaving every fixture exactly as this build left
> them keeps that test **green**.
>
> **Settled by execution, twice, independently.** The test phase reimplemented the old
> `namesInstance` in a standalone script and ran both bodies against every fixture in the
> block (`10b-sg-test.md` §2.5). The adversarial then restored the pre-S-G body verbatim in the
> real file and ran the suite (`10b-sg-adversarial.md` A9): **2 failed | 12 passed**, and the
> two failures were *"the join is `instance`, not the message"* and *"an entry whose MESSAGE
> names an instance but has no `instance` field is unattributed"* — exactly the two the test
> phase named, and no others.
>
> **What is wrong is the attribution, not the feature.** The feature is proven, by those two
> tests, which discriminate cleanly in both directions: a message that names nothing must
> attach, and a message that names everything but carries no field must not. §7's error was to
> compare against a weaker counterfactual — "had the heuristic been deleted without a
> replacement", i.e. `namesInstance` always `false` — rather than against the implementation
> that actually existed. The shipped-fixture test remains a fine regression test for F2. It is
> not the evidence for this change.
>
> ⚠ **The general lesson, because this is the third loop in a row to produce it:** a phase's own
> note claiming a mutation or a test covers a property is not evidence that it does. Read what
> the counterfactual actually is — and prefer the counterfactual that *was* the code.

`components/panels/serving-panel.test.tsx`, **"⚠ the shipped fixture no longer prints
instance 1's ECONNREFUSED beside healthy instance 0"** (kept from 10b's reconciliation, now
exercising the structural field) asserts `rowContaining(html, 'llama-server@0')` does **not**
contain `ECONNREFUSED`. Before this change (`namesInstance` reading `error.instance`, which
did not exist), every fixture lacked the field and the whole join would have degraded to
"never matches anything" had the text heuristic simply been deleted without a replacement —
i.e. this specific test is exactly the one the handoff asked for, and the newly added
misleading-message test (§5 above) strengthens it further by removing even the possibility
that a coincidental text match is doing the work.

## 8. Harnesses re-run, and why

| harness | files touched that are in its `LEDGER_FILES` | result |
|---|---|---|
| step 5 (`serving`) | `lib/collectors/dbus.test.ts`, `lib/collectors/serving.test.ts` | **Green.** 127 mutations, 98 ⚠ marks all covered. Two anchors needed re-aiming (below); after that, `All 127 regressions failed their check, as they must.` |
| step 8 (`wire`/client) | `lib/client/wire.test.ts` | **Green.** 174 mutations (173 + 1 new), 221 ⚠ marks all covered. One new ⚠ test was initially uncovered (below); after adding a mutation, `All 174 regressions failed their check, as they must.` |
| step 10 (`panels`) | `components/panels/serving-panel.test.tsx` | **Green**, no changes needed to the harness. 133 mutations, 157 ⚠ marks all covered (the pre-existing `10b-SV4` mutation — "every serving errors[] entry attaches to EVERY instance row" — happened to also redden both new ⚠ tests, since it deletes the same `namesInstance` call). `All 133 regressions failed their check, as they must.` |

Run sequentially in the foreground, `pnpm verify` run before and after (never concurrently
with a harness), `git status` checked after each for a stranded mutation (none found).

### Anchors re-aimed (step 5), and why they moved

Two pre-existing mutations' anchor text was inside code this build restructured. Both are
re-aimed to the new shape with the *same* property under test, and both are commented at the
point of the change:

- **`05-D2b`** (`lib/collectors/dbus.ts`) — the anchor was the old `problems.push(...)`
  block that files the `NoSuchUnit` entry; the accumulation became `errors.push(...tag(...))`
  so a per-unit entry can carry `instance`. Re-aimed to the new block; the mutation still
  deletes the whole entry-filing call, so the property ("an alarm nothing explains") is
  unchanged.
- **`05-V7`** (`lib/collectors/serving.ts`) — the anchor was the single-line
  `collectUnitStates({ dbus, paths, units: ..., timeoutMs: ... })` call, which is now
  multi-line with `unitInstances` added. Re-aimed to the new multi-line call; the mutation
  still widens `units` to include `'gpu-fan-control.service'`, so the property (O9's single
  read staying single) is unchanged.

### New mutation added (step 8), and why

`lib/client/wire.test.ts`'s new ⚠ test *"an errors[] entry with an instance that is %s is
refused"* was initially **uncovered** — no existing mutation in step 8's harness touched the
new `optionalInteger` validator. Added **`10b-W1`**: `integer(source[key]) : ABSENT` →
`(integer(source[key]) ?? ABSENT) : ABSENT`, which silently treats an invalid `instance` as
though the key were absent rather than refusing the entry — the exact failure mode this
field's validator exists to prevent (a real, malformed server response accepted as though it
were an old, well-formed one). Prefixed `10b-` per the id-prefix rule even though it lives in
step 8's harness file, matching ANCHOR §9: "the prefix is the creating step, not the harness
the mutation currently lives in."

### Beware-the-equivalent-mutation check

I checked whether any of my restructuring made an *existing* mutation vacuous (a new guard
subsuming an old one, credited only by accident). `05-D2` (deletes `states.set(unit,
NO_SUCH_UNIT_STATE)`) and `05-D2b` (deletes the entry-filing call, now re-aimed) sit right
next to each other in the same `if` branch and still test two independent properties — the
first the *state*, the second the *entry* — neither can subsume the other, and both still
redden their own distinct test. `10b-SV4` (step 10) still deletes the `namesInstance` call
entirely rather than merely changing its body, so it is not made vacuous by the body having
changed from a text match to a field comparison — it tests "the filter runs at all," which is
orthogonal to "what the filter compares."

## 9. ⚠ marks and mutations, summarised

**New ⚠ tests:**
- `lib/collectors/dbus.test.ts`: three, in a new `describe('⚠ 10b-S-G — unitInstances attaches
  a structural instance, never guessed from text')`.
- `lib/collectors/serving.test.ts`: two new tests plus `instance` assertions added to three
  existing ones.
- `lib/client/wire.test.ts`: a new `describe('⚠ 10b-S-G — errors[].instance is the contract's
  first OPTIONAL field')` with five tests (absent/valid/invalid×5/mixed-array).
- `lib/contract.test.ts`: one new test asserting the wire presence/absence of the key itself
  (`Object.hasOwn`), not merely the value.
- `lib/types.test-d.ts`: one new compile-time test carrying the named exception to "no
  optional members," plus updated censuses (`OptionalKeys`, `UndefinedKeys`,
  `NonNullableKeys`, and the field-type assertion for `TelemetryError['instance']`).
- `components/panels/serving-panel.test.tsx`: two new ⚠ tests (§5 above).

**New/re-aimed mutations:** `05-D2b` and `05-V7` re-aimed (step 5); `10b-W1` added (step 8,
lives in step 8's file). No mutation was added to step 10's harness — the existing `10b-SV4`
already exercises the join being bypassed and covers both new panel tests.

## 10. Scoped assertions

Every new panel-level assertion reads a specific row via the existing `rowContaining(html,
needle)` helper (never a document-wide `toContain`), following the project's own
four-times-burned rule.

## 11. Verification

```
$ pnpm verify
 Test Files  93 passed (93)
      Tests  2586 passed (2586)
Type Errors  no errors
```

```
$ git status --short
 M SPEC.md                                                              (parent's, untouched by me)
 M components/panels/serving-panel.test.tsx
 M components/panels/serving-panel.tsx
 M lib/client/wire.test.ts
 M lib/client/wire.ts
 M lib/collectors/dbus.test.ts
 M lib/collectors/dbus.ts
 M lib/collectors/errors.ts
 M lib/collectors/serving.test.ts
 M lib/collectors/serving.ts
 M lib/contract.test.ts
 M lib/fixtures.ts
 M lib/types.test-d.ts
 M lib/types.ts
 M pipeline/steps/05-collectors-serving-storage-safety/regressions.py
 M pipeline/steps/08-client-runtime/regressions.py
?? pipeline/handoffs/10b-SG-error-instance.md
```

No stranded mutation ever appeared after any of the three harness runs. Nothing was
committed. `purity.test.ts` was not touched and remains green (no hooks were added to
`components/`).
