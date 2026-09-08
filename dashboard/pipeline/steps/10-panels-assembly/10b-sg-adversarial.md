# 10b-S-G — ADVERSARIAL phase

**Written by the adversarial agent, 2026-09-08.** Branch `dashboard-frontend`, working dir
`dashboard/`. Read the handoff, `10b-sg-error-instance.md`, `10b-sg-test.md`, `SPEC.md`'s
`errors[].instance` block (§3.7, line 542 — the test phase's correction is right) and §6.5,
`ANCHOR.md` §4/§5/§8, `PLAN.md`.

**I fixed nothing.** Every experiment below was reverted; `git status` at the end is byte-identical
to the tree I was handed, and `pnpm verify` closes at **93 files / 2587 tests / no type errors**.

I did **not** re-open the settled items: the whole-snapshot void on a malformed `instance`, the
heuristic being gone rather than supplemented, `collectSafety`'s now-tested omission, or the
4-of-18 enumeration's correctness *today*.

---

## Findings

### A1 — ⚠ The `unattributed` filter is unreachable by the ledger: **deleting it entirely leaves the whole suite green** — EXECUTED

`serving-panel.tsx` calls `namesInstance` in **two** places:

```ts
const errorFor = (instance) => { … if (namesInstance(e, instance)) … };          // mutation 10b-SV4
const unattributed = servingErrors.filter(
  (e) => !(instances ?? []).some((instance) => namesInstance(e, instance)),      // NO mutation
);
```

`grep -n "namesInstance\|unattributed" pipeline/steps/10-panels-assembly/regressions.py` returns
exactly one hit: **`10b-SV4`, which mutates the `errorFor` line only.** Nothing in any of the three
harnesses touches the second call.

**Executed.** I replaced the filter with `const unattributed = servingErrors;` and ran the full
suite:

```
Test Files  93 passed (93)
     Tests  2587 passed (2587)
Type Errors  no errors
```

**Green. Not one test noticed.**

**Failure scenario.** With that one-line regression shipped, the live box renders instance 1's
`connect ECONNREFUSED 127.0.0.1:8081` **twice** — once as row 1's own `detail`, and again as a
panel-level note under both rows, where §6.5 and `PanelNotes`' own docstring say a note means
*"this entry explains the panel, not a row."* An operator reads two facts where there is one, and
the panel-level line now falsely asserts a collector-wide fault. This is the same "one fact, stated
once" rule `PanelNotes` was created (F5) to satisfy, and the rule §6.5's em-dash exception is
written around.

The asymmetry is worth naming: the **too-few** direction is covered — setting `unattributed` to
`[]` reddens *"an entry naming no instance is collector-wide and renders once, under the rows"* —
but the **too-many** direction has no assertion anywhere. No test asserts an *attributed* message
appears exactly once, or that it does **not** appear in `PanelNotes`. ANCHOR §5: *"Every boundary
guard needs a fixture on both sides."* This guard has one side.

Suggested (not applied): add `expect(html.split('ECONNREFUSED').length - 1).toBe(1)` to the shipped
fixture test, plus a step-10 mutation `unattributed = servingErrors`.

---

### A2 — ⚠ `dbus` reaches three panels; only SERVING learned the join. **A `llama-server@1` failure is printed as the explanation beside `gpu-fan-control.service` on COOLING *and* SAFETY** — EXECUTED

`panelsForSource('dbus')` returns `['cooling', 'serving', 'safety']` — `observations.ts`'s own
doc calls it "a real fan-out." S-G taught **one** of those three consumers to read `instance`.
The other two still take the last `dbus` entry of the whole array, unfiltered:

```ts
// components/panels/safety-panel.tsx:67
const messageFor = (source) => safetyErrors.findLast((e) => e.source === source)?.message ?? null;
… detail={messageFor('dbus')}          // the `fan service` row = gpu-fan-control.service

// components/panels/cooling-panel.tsx:113
const dbusError = coolingErrors.findLast((e) => e.source === 'dbus')?.message ?? null;
… detail={dbusError}                   // the same unit, the same row
```

**Executed.** Snapshot: healthy `everythingZero` (fan service `active`, severity normal) plus the
one entry `collectServing` genuinely files when systemd has no record of instance 1 — verified
against `serving.test.ts`'s own new *"a per-unit dbus failure carries ITS instance"* test:

```jsonc
errors: [{ "source": "dbus",
           "message": "llama-server@1.service: NoSuchUnit: systemd has no record",
           "instance": 1 }]
```

Rendered COOLING output, verbatim:

```html
<span class="_label_">fan service</span><span class="_value_">active</span>
<span class="_note_">llama-server@1.service: NoSuchUnit: systemd has no record</span>
```

and `safety.includes('llama-server@1.service') === true` on the SAFETY panel.

**This is F2 exactly** — a diagnostic attached to the wrong row — surviving in two panels, on a
row whose own value reads `active` and whose chip is `normal`. It is **pre-existing** (the entry
was already `source: 'dbus'` before S-G), so this is not a regression S-G introduced. But S-G is
the change that put the discriminator *into the entry* and used it in one place out of three, and
the build's own write-up enumerates `dbus` as the source that "sometimes" carries an instance
without noting that two of its three consumers cannot tell the difference. A one-line
`.filter((e) => e.instance === undefined)` on both rows would close it — with the caveat in A8.

Reachable on the real box today: mask or remove `llama-server@1.service` while `gpu-fan-control`
is healthy. The wrong sentence then sits under SAFETY's fan-service row until the unit comes back.

---

### A3 — Two entries with the same `source` **and** the same `instance`: the first disappears from the page entirely — EXECUTED

`errorFor` folds into a `Map` keyed by `source` alone:

```ts
for (const e of servingErrors) if (namesInstance(e, instance)) bySource.set(e.source, e.message);
```

so the second entry overwrites the first. The overwritten entry is **also excluded from
`unattributed`** (it *did* match an instance), so it is not rendered anywhere on the panel.

**Executed.** Two `llama-env` entries, both `instance: 1`:

```
P4 FIRST anywhere in the HTML: false | SECOND anywhere: true
```

**Failure scenario, from the real collector.** `readEnv` maps *every* problem from
`parseLlamaEnv` into its own entry — `tag('llama-env', parsed.problems.map((p) => `${path}: ${p}`))`
— and `collectServing` then stamps all of them with the same `instance`. An
`/etc/llama-server/1.env` that is missing `MODEL` **and** has an unparseable `CTX` yields two
`llama-env` entries for instance 1; **only the second is ever rendered**, on the row or anywhere
else. The operator sees one of two reasons its instance is degraded, with nothing indicating a
second exists.

Note this is **behaviourally the same as before S-G** (both messages contained `/1.env`, so the
old heuristic matched both and collapsed them identically) — so it is not a regression. What *is*
new is the documentation: `serving-panel.tsx`'s module doc now claims **"Nothing is dropped, which
the very first draft's `errors[0]` also did to every entry after the first"**, and the `errorFor`
comment claims *"Both facts survive … dropping either is what §3.7 calls not actionable."* Both
sentences are true **across** sources and false **within** one. A reader trusting them would
conclude, wrongly, that S-G closed this. Either the comments should be narrowed to "the last per
source, per instance", or `bySource` should key on `source` and join multiple messages the way it
already joins across sources.

---

### A4 — The 4-of-18 enumeration is enforced by **nothing but a table in a document** — EXECUTED

Three independent layers all decline to enforce it:

1. **The type.** `TelemetryError` is one flat interface; `instance?: number` is available to every
   one of the eighteen `source` values. Not a discriminated union.
2. **`tag()`.** Its third parameter is `instance?: number` on the *shared* minting helper.
   `tag('ufw', ['…'], 3)` compiles.
3. **`wire.ts`.** `telemetryErrorOf` validates `source` and `instance` independently and never
   asks whether that pairing is legal.

**Executed** — `parseSnapshot` on a snapshot whose one entry is `{source, message, instance: 0}`:

```
P6 ufw        -> ACCEPTED
P6 coretemp   -> ACCEPTED
P6 nvidia-smi -> ACCEPTED
P6 statvfs    -> ACCEPTED
```

All four are sources the build's own §2 table marks **"Never."** They validate silently.

Today this is inert for those fourteen: `errorsForPanel` routes them away from the SERVING panel,
so no join ever reads their `instance`. The live hole is in the four that *do* route there, and
**only one of them has a test**:

| source | the "must never carry an instance" path | test? |
|---|---|---|
| `dbus` | bus-wide connect failure | ✅ `serving.test.ts` asserts `instance` undefined |
| `dbus` | `collectSafety`'s per-unit failure | ✅ `10b-SF1` + the test phase's new test |
| `llama-env` | `readDir` failure on `/etc/llama-server` | ❌ **nothing** |
| `llama-env` | `discoverInstances`' malformed-filename problems | ❌ **nothing** |

I grepped `lib/collectors/serving.test.ts` for `.instance` on those two paths: the only
`toBeUndefined()` in the file is line 551, the **bus-wide dbus** case. No assertion anywhere reads
`.instance` on a directory-level `llama-env` entry.

**Failure scenario.** A future edit — the plausible one is someone "helpfully" attaching context
while touching `collectServing`'s first line — changes

```ts
const errors = [...tag('llama-env', found.problems.map((p) => `${dir}: ${p}`))];
```

to pass `instances[0]`. The message `` /etc/llama-server: `x.env` is not `<instance>.env` and was
not treated as an instance `` — a fact about the *directory*, describing a file that is
explicitly **not** an instance — then renders as instance 0's own reason, on instance 0's row,
beside instance 0's healthy readings. The full suite stays green: nothing asserts otherwise.

This is §3.2's question answered: **only the enumeration in a document.** `collectSafety` is now
the exception, and the pattern that closed it (a per-path assertion plus a mutation representing
the wrong edit) is the one the two `llama-env` paths still need.

---

### A5 — §3.1's orphan instance: the behaviour is **right**, and **nothing tests it** — EXECUTED

I constructed all three shapes the handoff named. None broke:

| shape | result |
|---|---|
| `serving: [0, 1]`, entry with `instance: 5` | not on row 0, not on row 1, **rendered once under the rows** via `PanelNotes` |
| `serving: null`, entry with `instance: 1` | `"serving instances unknown"` **plus the message**, in the takeover branch |
| `serving: []`, entry with `instance: 1` | same takeover branch, message rendered |

The mechanism is `unattributed`'s `.some(...)` — an entry matching no row is by construction
`!some(...)`, so it falls to the panel-level path, which is the same path a subjectless entry
takes. An orphaned instance is therefore *not* "a diagnostic attached to no row"; it degrades to
"a diagnostic attached to the panel", which §6.5 already licenses. **The lead does not land.**

But **there is no test for any of the three**, and (per A1) no mutation on the line that delivers
it. `serving-panel.test.tsx`'s new `describe` block covers: attributed, mis-attributed-by-message,
two-sources-one-instance, and no-instance. It does not cover **wrong-instance**. The three
scenarios most likely to produce one on the real box are all live:

- a `set-model`/`install` run removes `/etc/llama-server/1.env` between two polls while an entry
  about instance 1 is still in flight from the previous collection — not possible *within* one
  snapshot today, since `collectServing` builds both halves from the same `instances` array, but
  the wire does not require them to agree, and `wire.ts` does not check;
- an old row count against a new client after the scheduled redeploy;
- any server-side bug producing an index the enumeration does not contain.

The value of a test here is not that it would catch today's code — it is that A1's missing
mutation and this missing fixture are the *same* uncovered line.

---

### A6 — §3.4's value edges: refusal **is** consistent, and only the refusing side is fixtured — EXECUTED

`optionalInteger` delegates to `integer()`, which is `typeof value === 'number' && Number.isInteger(value)` —
the identical check behind `Gpu.index` and `ServingInstance.instance`. Measured through
`parseSnapshot`:

| value | result |
|---|---|
| `0` | ACCEPTED → `0` |
| `-1` | **ACCEPTED → `-1`** |
| `-0` | ACCEPTED → `0` (`-0 === 0`, so it joins row 0) |
| `1.5` | REFUSED |
| `NaN` | REFUSED |
| `Infinity` / `-Infinity` | REFUSED |
| `'1'` (numeric string) | REFUSED |
| `null` | REFUSED |
| `true` | REFUSED |
| `2**53` = 9007199254740992 | **ACCEPTED** |
| `2**53 + 2` = 9007199254740994 | **ACCEPTED** |
| `1e21` | **ACCEPTED → `1e+21`** |
| key absent | ACCEPTED, `Object.hasOwn === false` |

**Consistency: yes.** Every refusal and every acceptance matches what `wire.ts` already does to
`Gpu.index` and `ServingInstance.instance`, so a reader has one rule to remember, and the build's
recorded decision not to invent a non-negativity floor SPEC.md does not state holds up.

Two notes rather than defects:

- **Beyond safe-integer is accepted on both sides of the join**, so `9007199254740993` in an
  entry and `9007199254740992` in a row would compare `===` equal (both round to the same double)
  and the entry would land on that row. Purely theoretical — the collector's own
  `parseInstanceIndex` rejects anything non-canonical and anything `< 0` — but the guarantee is
  the *collector's*, and `wire.ts` does not re-establish it for a snapshot the client did not
  produce.
- **`wire.test.ts` fixtures five refusals and one acceptance (`1`).** There is no fixture on the
  accepted-but-nonsensical edge (`-1`, `0`, a huge integer), which is the side ANCHOR §5's
  both-sides rule would ask for if the non-negativity question is ever revisited.

---

### A7 — Duplicate `instance` values in `serving[]` validate, and the panel renders the same message twice under one React key — EXECUTED

`wire.ts` validates each `ServingInstance` independently; nothing checks the array for a unique
`instance`. **Executed** — a snapshot with two rows both `instance: 0` and one entry `instance: 0`:

```
P7 parse -> ACCEPTED duplicate instance rows
P7 DUPMSG occurrences in the rendered HTML: 2
```

`instanceRow` uses `key={instance.instance}`, so both rows carry the same React key.

`parseInstanceIndex`'s own docstring states the stake exactly: *"two filenames mapping to one
subject would make two rows share one condition id — which §9 resolves by deduplicating, so one of
the two instances would silently vanish from the header count."* The **collector** prevents this
(`discoverInstances` accumulates into a `Set`, rejects `01.env`/`+1.env`, rejects negatives). The
**client's validator does not**, and S-G has just made `instance` the sole join key, so a duplicate
now also duplicates every attributed diagnostic. Low likelihood, but the invariant is asserted in
a comment on the server side of a boundary whose whole purpose (per `wire.ts`'s own header) is not
to trust the other side.

---

### A8 — `instance: undefined` on a `dbus` entry now conflates two different facts, and the SERVING panel prints another collector's unit failure — EXECUTED

`dbus` entries with no instance are of two kinds:

1. a **bus-wide connect failure** from `collectServing` — which genuinely blanks every
   `serving[].unitState`, so SERVING must show it; and
2. `collectSafety`'s **per-unit** `gpu-fan-control.service` failure — which blanks nothing on
   SERVING at all.

Both are `{source: 'dbus'}` with the key absent, and `unattributed` cannot tell them apart.

**Executed** — `errors: [{source: 'dbus', message: 'gpu-fan-control.service: org.freedesktop.DBus.Error.AccessDenied'}]`:

```
Q1 SERVING renders the gpu-fan-control message under its rows: true
```

So the SERVING panel prints an explanation for a figure it does not render, while SAFETY prints
the same sentence correctly. This is the mirror of A2, and it is why A2's suggested one-line fix
(`.filter((e) => e.instance === undefined)` on the fan-service rows) is not sufficient on its own:
the absent-instance case is genuinely ambiguous for `dbus`, and disambiguating it needs either a
second structural field (which unit / which collector) or `collectSafety` and `collectServing`
filing under distinguishable sources. **Recorded as a gap, not a proposed change** — it is a §4
question and this phase does not own the spec.

---

### A9 — §3.5 verified: the test phase's correction is right, and the build's §7 claim is wrong — EXECUTED

I restored the pre-S-G `namesInstance` **verbatim** from `git diff` (the three `.includes` checks
on unit name, `/<i>.env`, and `:${port}`), left every fixture as S-G left it, and ran
`components/panels/serving-panel.test.tsx`:

```
Tests  2 failed | 12 passed (14)

FAIL  ⚠ 10b-S-G — the join is `instance`, not the message: a misleading message text does not fool it
      expected row `llama-server@1` to contain 'the model failed to answer in time'

FAIL  ⚠ 10b-S-G — an entry whose MESSAGE names an instance but has no `instance` field is unattributed
      expected row `llama-server@1` not to contain 'ECONNREFUSED'
```

**Exactly the two tests the test phase named, and no others.** The test credited by the build's §7
— *"the shipped fixture no longer prints instance 1's ECONNREFUSED beside healthy instance 0"* —
**stays green under the old heuristic**, because `connect ECONNREFUSED 127.0.0.1:8081` contains
`:8081` and not `:8080`. It is a fine regression test for F2; it is not a discriminator between
the two implementations, and the build's write-up says it is.

**The feature is proven.** Two tests carry it, and they discriminate cleanly in both directions
(a message that names nothing → must attach; a message that names everything but has no field →
must not). The test phase's §2.5 finding is confirmed by execution, not accepted on its say-so.

---

### A10 — The panel's own justification for last-per-source is now only half true — REASONED

`errorFor`'s comment justifies the `bySource` fold by pointing at `events.ts:400`: *"folds
`errors[]` into a `Map` keyed by source and so shows the last per source, and a panel that showed
the first … would print a different sentence for the same fault in the same session."*

After S-G the panel is last-per-source **per instance**; `events.ts:400` is still
`for (const error of errors) present.set(error.source, error.message)` — last per source across
**all** instances. So with instance 0 and instance 1 both failing their `/health` probe, the
session event log's one `llama-health` `source-lost` entry carries **instance 1's** message
(array order), while row 0 shows instance 0's. The two now differ, which is the precise outcome
the comment cites as the reason for the design.

Whether the log *should* be per-instance is a real question (a source's presence is arguably a
source-level fact, and `events.ts` has no row to hang an instance on), and I am not proposing it.
The finding is narrower: **the comment now cites as agreement something that is no longer
agreement**, and the next reader will take it at face value.

---

### A11 — `exactOptionalPropertyTypes` is off, so "the key is absent" is a runtime guarantee the type system does not carry — REASONED

`types.test-d.ts` asserts `UndefinedKeys<TelemetryError> = 'instance'` — i.e. `instance?: number`
admits `undefined` as a *value*, which is only true with `exactOptionalPropertyTypes` disabled.
So `{ source, message, instance: undefined }` typechecks as a `TelemetryError` with the key
**present**.

Today nothing produces one: `tag()` branches explicitly (`instance === undefined ? {source, message} : …`),
`serving.ts` spreads a `number` from its closure, and `JSON.stringify` drops an `undefined` value
anyway, so the wire is safe regardless. But `contract.test.ts`'s new `Object.hasOwn(...) === false`
assertion — the one that encodes "an old server omits the key entirely" — is checking a property
the compiler will not defend. A future collector writing `{...base, instance: maybeUndefined}`
compiles, and every `Object.hasOwn` check downstream flips to `true`. Worth a sentence in
`errors.ts` (whose docstring already says *"passing `undefined` explicitly is the same as omitting
it"* — true of `tag`, not true of an object literal built elsewhere).

---

## What I attacked and could NOT break

- **The orphan instance (§3.1's lead).** Instance 5 against two rows, `serving: null` with
  instance-tagged errors, `serving: []` with them — all three degrade correctly to the
  panel-level rendering. The explanation never vanishes. Only the *test* is missing (A5).
- **`unitInstances`' derivation (§3.3).** Every hazard in the lead is already closed upstream:
  `discoverInstances` collects into a `Set` (duplicates impossible), sorts numerically
  (non-contiguous `@0`/`@2` is just two map entries and works), and `parseInstanceIndex` rejects
  non-canonical spellings (`01.env`, `+1.env`) and negatives, so an unparseable name never becomes
  a key. And `collectUnitStates` **never parses a unit name** — it only does
  `unitInstances?.get(unit)` — so a non-`llama-server@<i>` unit cannot acquire an instance unless
  the caller puts it in the map, which is precisely the case `10b-SF1` now guards.
- **The bus-wide connect failure carrying an instance.** Structurally impossible: the pre-loop
  `tag('dbus', […])` has no `unit` in scope, let alone an instance, and it is asserted.
- **`optionalInteger`'s refusal consistency (§3.4).** Every accepted and refused value matches
  `integer()`'s treatment of `Gpu.index` and `ServingInstance.instance` exactly. No asymmetry.
- **The text heuristic being genuinely gone.** No `.message` read survives in the attribution
  path — only in display — and A9's experiment shows the old body changes rendered output, so the
  new one is not accidentally equivalent.
- **The type-level census.** Adding a *second* optional member to `TelemetryError`, or any
  optional member to any other contract type, is still a compile error: `TelemetryError` was moved
  out of the two blanket censuses into a dedicated `Equals<OptionalKeys<TelemetryError>, 'instance'>`,
  which pins the exception to exactly one field rather than exempting the type.
- **Invariant 2 (read-only).** S-G adds a `Map` build and a `.map()`; nothing writes.
- **Invariant 5.** A partial snapshot still carries `errors[]` and still renders; the empty and
  null takeover branches both display instance-tagged entries rather than swallowing them.
- **`pnpm verify`.** Green before and after every experiment, at the handed-over
  93 files / 2587 tests.

## Tree state

Every experiment was reverted from a backup and confirmed. Final `git status --porcelain` is
identical to the tree I was handed (17 modified, 5 untracked — the two probe test files I created
were deleted, and `git status` shows no `zz-*` file). `pnpm verify` re-run last: **exit 0,
93 files, 2587 tests, no type errors.** Nothing committed. `SPEC.md` untouched. `purity.test.ts`
untouched. No harness was run — I ran no `regressions.py`, so no stranded mutation is possible
from this phase.
