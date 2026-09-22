# 12d TEST — the harness the build skipped is clean, and the precedence was pinned in one place only

**Written by the TEST phase, 2026-09-22.** Branch `dashboard-frontend`, working dir `dashboard/`,
12d's build uncommitted on `9fcff77`. **Nothing was committed, nothing was staged, no
`git checkout --` was run, no spec file was edited, nothing was deployed, and this phase did not
contact `192.168.4.71` at all** — no SSH, no HTTP, no D-Bus socket opened and therefore none left
open.

Five test additions, all strengthening: **two new tests and four assertion additions inside
existing ⚠ tests.** No assertion was weakened, no fixture was loosened, no source file changed.

---

## 1. ⚠⚠ PRIORITY 1 — the harnesses the build did not run. **SETTLED: one was missing, and it is
clean.**

### 1.1 The census the handoff asked for, done by MUTATION rather than by ledger file

The build derived 04/08/10 by intersecting each `regressions.py`'s `LEDGER_FILES` with the dirty
files. The handoff's worry is right in principle — *an anchor that still matches is not a mutation
that still bites* — so this phase re-derived the set two other ways: **which harnesses MUTATE a
file 12d changed**, and **which harnesses RUN a test file 12d changed as a mutation's check**.
Both were computed by importing all ten `regressions.py` modules and reading `REGRESSIONS`
directly, not by grepping.

| harness | mutations aimed at a 12d source file | mutations whose CHECK is a 12d test file | run? |
|---|---|---|---|
| `02-format-severity` | **13** → `lib/conditions.ts` | **13** → `lib/conditions.test.ts` | ⚠ **NOT run by the build — run here** |
| `03-collectors-gpu-host` | 0 | 0 | not needed (see 1.3) |
| `04-collector-cooling` | 18 → `lib/conditions.ts` | 18 → `lib/conditions.test.ts` | ✅ re-run here |
| `05-collectors-serving-storage-safety` | 0 | 0 | not needed (see 1.3) |
| `06-telemetry-route` | 0 | 0 | not needed |
| `07-auth-login` | 0 | 0 | not needed |
| `08-client-runtime` | 93 → `wire.ts`, `observations.ts` | 138 → `wire`/`observations`/`events.test.ts` | ✅ re-run here |
| `09-ui-primitives` | 0 | 0 | not needed |
| `10-panels-assembly` | 47 → `gpu-panel.tsx`, `observations.ts` | 68 → `gpu-panel`/`serving-panel.test.tsx` | ✅ re-run here |
| `11-packaging` | 0 | 0 | not needed |

**So the build's 04/08/10 was right about what it included and wrong about what it left out: step
02 owns thirteen mutations of `lib/conditions.ts`, and all thirteen run `lib/conditions.test.ts`
— a file this loop rewrote thirty-odd call sites of.** The build's reason for skipping it (its
ledger files are clean) is exactly the reasoning the handoff flagged as insufficient.

### 1.2 ⚠ The answer, and it is a plain one: **step 02 is clean, and its thirteen anchors were
never near 12d's change.**

Every one of the thirteen anchors was read against the current source before the run. **None of
them anchors on the enumeration line at all** — they anchor on the debounce, the dedupe, the
standing suppression, the aggregate reduction and the `STANDING` id parser:

| id | what it anchors on | is it near 12d's edit? |
|---|---|---|
| `02-R12` / `02-R12b` | `changed: prev.changed \|\| prev.lastSeverity !== severity,` | no |
| `02-R25` | `observeSeverity(ledger.get(id), severity)` | no |
| `02-R26` | `const severity = hold.confirmed;` | no |
| `02-R13` | `severity,\n      displaySeverity,` | no |
| `02-R14` | `if (nowMs - state.pendingSinceMs < holdMs) return state;` | no |
| `02-R27` | `sinceMs: hold.confirmedSinceMs,` | no |
| `02-R28` | the `grouped` dedupe | no |
| `02-R29` | `worstSeverity(...displayed.map((d) => d.displaySeverity))` | no |
| `02-R37` | `return settled ? state : { ...state, pendingSinceMs: nowMs };` | no |
| `02-R38` / `02-R32` / `02-R33` | the `STANDING` id parser | no |

The specific failure the handoff named — *"a step-02 mutation aimed at the old single line can
match, apply, and be caught by nothing"* — **cannot happen, because no step-02 mutation was ever
aimed at that line.** The one mutation of this project that IS aimed there is step 04's `04-T72`,
and 12d re-aimed it correctly (§4.2 below). But that is an argument, and the handoff asked for a
run, so **step 02 was run in full.**

```
02-format-severity   exit 0   66 mutations   287 distinct red tests   30 ⚠ checked
    "All 66 regressions failed their check, as they must."
    zero ANCHOR NOT FOUND / ANCHORS AMBIGUOUS / ANCHORS MOVED / DID NOT BITE /
    NO MUTATION REDDENS / UNMATCHABLE LEDGER KEYS / `!!!` lines
```

All thirteen bit, with their red counts against `lib/conditions.test.ts` as 12d left it:

| `02-R12` 4 · `02-R12b` 3 · `02-R25` 1 · `02-R26` 46 · `02-R13` 5 · `02-R14` 4 · `02-R27` 3 |
| `02-R28` 8 · `02-R29` 1 · `02-R37` 1 · `02-R38` 2 · `02-R32` 5 · `02-R33` 2 |

**Nobody needs to re-hunt this.** Steps 02, 04, 08 and 10 are the complete set of harnesses with
any exposure to 12d, and all four are green on this tree.

### 1.3 Why 03, 05, 06, 07, 09 and 11 are genuinely not exposed — stated so it is checkable

03 and 05 each carry **one** mutation of `lib/fixtures.ts`, which 12d did change. Neither is
exposed, and the reason is not "the ledger is clean":

| id | its anchor | 12d touched it? | its check |
|---|---|---|---|
| `10c-G1` (step 03) | `errors: [{ source: 'dell-smm', … }],` | no | `lib/contract.test.ts` — clean |
| `05-X1` (step 05) | `  serving: servingInstances,` | no | `lib/collectors/serving.test.ts` — clean |

12d's `fixtures.ts` edit is confined to `wireRead`/`wireRefused`'s signatures, forty lines below
either anchor, and neither check file changed — so the mutation applies to the same text and is
judged by the same tests as before. **Both anchors still match exactly once** (§4.1's census).
06, 07, 09 and 11 mutate none of the twelve files this loop touched and run none of them.

---

## 2. ⚠⚠ The member-vs-subject conflation — the disagreement is real, load-bearing, and complete
at every `push` site

### 2.1 The fixture, read rather than taken from its name

`lib/conditions.test.ts`'s new `servingUnit(member, …)` mints subject `llama-server@${member}.service`
with `enumeration: { name: 'serving', member }`. For member `'0'` that is **subject
`llama-server@0.service` against member `'0'`** — two different strings, in the one place the
project's real code also makes them differ. The disagreement is not cosmetic: `12d-C1` (compare
against `previous.subject`) **reddens 2 tests** and `12d-C3` (invert the exclusion) reddens 5.

The test does more than assert the right answer — it asserts the WRONG spelling produces the
wrong answer, in the same body:

```ts
const bySubject = goBlind(twoInstances(), new Map([[SERVING, new Set(['llama-server@0.service'])]]));
expect(bySubject.retired).toContain('unit:llama-server@0.service');
expect(bySubject.retired).toContain('health:0');
```

That is the half that makes the first half mean something: an exclusion keyed the wrong way
protects nothing, and the test says so rather than leaving it to a mutation.

### 2.2 Every enumerated `push` site, checked against the identity a refusal can name

Five sites, and they are all of them (`grep -n 'ENUMERATION' lib/client/observations.ts`):

| condition | subject | member | right? |
|---|---|---|---|
| `gpu_temp` / `gpu_throttle` / `gpu_vram` | `String(gpu.index)` | `String(gpu.index)` | ✅ (subject == member here, legitimately) |
| `unit:llama-server@N.service` | `servingUnitName(instance.instance)` | **`instance.instance`** | ✅ the identity, not the unit name |
| `health:N` | `instance.instance` | `instance.instance` | ✅ |

No other `push` passes an `enumeration`, and the ones that do not (`cpu_temp`, `ram`, the four
fans, `fan5_*`, `unit:gpu-fan-control.service`, `disk_free`, the SAFETY rows) are exactly the
subjects nothing enumerates.

⚠ **One id in this project is emitted twice in a poll — `unit:gpu-fan-control.service`, from
COOLING and from SAFETY — and `observePoll` carries `chosen.enumeration` from the WORSE-severity
observation.** Checked at `HEAD` and in the working tree: both pushes omit `enumeration`, so the
two can never disagree and the dedupe cannot pick a wrong membership. If a future loop enumerates
one of a duplicated pair and not the other, that is where it will break.

### 2.3 GPU retirement still works — proved end to end, not argued

The handoff's concern (*"a wrong member on the `gpus` enumeration freezes or retires GPU
conditions and no `12d-` mutation is aimed there"*) has a structural answer and an empirical one.

- **Structural.** `enumerationsRead` sets `gpus → NOTHING_HELD_BACK`, an empty set, on every poll
  where `snapshot.gpus !== null`. `held.has(member)` is therefore false for *any* member string,
  so the GPU member's VALUE cannot change behaviour. What is load-bearing is that
  `enumeration !== null` and `name === 'gpus'`, and both are pinned by
  `observations.test.ts`'s `expect(find(loaded,'gpu_temp:0')?.enumeration).toEqual({name:'gpus',member:'0'})`.
- **Empirical.** `lib/client/events.test.ts:414` and `:493` retire `gpu_temp:0` end to end through
  the real `conditionsFrom` + `enumerationsRead` + `observePoll`, and `lib/conditions.test.ts:900`
  retires `gpu_temp:1` at the `observePoll` layer. Both still pass.

⚠ **Recorded rather than fixed: the GPU member is inert by construction.** A mutation changing it
would be a `DID NOT BITE`, so **no mutation should be added for it** — the honest statement is
that `gpus` has no row-level refusal, so it has nothing to hold back. The day `gpus[]` becomes
row-lenient the way `serving[]` is, this becomes live and needs one.

---

## 3. ⚠ The frozen branch, attacked — the fifth way, and the one that was actually reachable

Five wrong implementations were constructed against the four tests that pin `§9`'s frozen branch.
Four are already caught; the fifth was **not tested at all** and now is.

| # | wrong implementation | caught by | verdict |
|---|---|---|---|
| 1 | `anonymous` read from the FIRST refusal only (`refused[0] === null`) | `observations.test.ts` — *one anonymous row among named ones is enough*, which asserts `['7', null]` AND `[null, '7']` | already caught |
| 2 | freeze only when EVERY refusal is anonymous (`refused.every(x => x === null)`) | same test, `['7', null]` | already caught |
| 3 | `servingEnumeration` filtering nulls out of `refused`, so one anonymous refusal reads as `read: 'all'` | `wire.test.ts` — `expect(parseSnapshot(withAnonymousRows(1))?.serving).toMatchObject({read:'partial',refused:[null]})` | already caught |
| 4 | `observePoll` treating a MISSING key as an empty set (`… ?? new Set()`) | `conditions.test.ts` — *a MISSING key still retires nothing at all* | already caught (and is `12d-C2`) |
| **5** | ⚠⚠ **an identity that is the EMPTY STRING taking the named branch** — `if (!identity)` instead of `identity === null`, or an `instanceId` that admits `''` | **nothing** | ⚠ **FIXED HERE** |

### 3.1 `''` and `null`, and why the code is right but was unfixtured

The code distinguishes them correctly — `wire.ts:627` is `identity: instance ?? null`,
`observations.ts:179` is `if (identity === null)`, `conditions.ts:810` is `membership === null`.
**There is no truthiness test on an identity anywhere in the four files** (`grep -n 'identity'`,
all eight live lines read). And `''` cannot reach the exclusion set today, because
`lib/units.ts`'s `INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/` requires at least one character, so
`instanceId('')` is `undefined` and `undefined ?? null` is `null`.

⚠ **But nothing asserted any of that**, and it is one character of source away from being false.
Added to `wire.test.ts`'s existing ⚠ test *a row refused for its `instance` reports NO identity*,
which `12d-W2` already reddens:

```ts
for (const rubbish of ['', '01', ' 0', 'a b']) {
  … expect(parsed!.serving.refused).toEqual([null]);
  … expect([...enumerationsRead(parsed!.snapshot, parsed!.serving).keys()]).toEqual([GPU_ENUMERATION]);
}
```

Four spellings on both sides of the grammar: the empty string, the non-canonical decimal `01`
(§3.4's own named refusal), a leading space, and an interior space. All four must arrive as
`null` and freeze the enumeration; if any ever arrives as an identity it enters the exclusion
set, **matches no condition, and silently protects nothing while claiming to** — a failure in the
dangerous direction that the frozen branch exists to prevent.

### 3.2 The two other routes the handoff named, checked and found safe

- **An anonymous refusal arriving AFTER the enumeration was read clean.** `observePoll` reads
  `options.enumerationsRead` per call and `ConditionState` stores no enumeration memory, so a
  clean poll leaves no residue a later anonymous poll can ride. The absence hold keeps running
  across the frozen polls and the retirement fires on the first poll where the key returns, which
  is §9's own answer.
- **A `partial` arm with `refused: []`.** Unreachable through the constructor
  (`refused.length > 0 ? partial : all`), but `ServingEnumeration` is an exported structural type
  and a hand-written `{read:'partial', rows, refused: []}` would tell `enumerationsRead` *read,
  nothing held back* while telling `servedBy` *incomplete*. **Recorded as a latent inconsistency,
  not fixed** — closing it means a branded type or a runtime assert, which is a design change and
  not this phase's. No call site in the tree constructs one; `servingEnumeration` is the only
  producer.

---

## 4. ⚠ `12d-O6` was under-tested, and a second honest assertion existed

The build flagged it itself: `12d-O6` reddened **exactly one** test — `observations.test.ts`'s
*when the list was cut AND a row we did read has an unreadable `gpus`*. That test is honest and
carries its twin. But `12d-Q1` is a **spec silence**, the one class of decision this project most
wants pinned in more than one place, and it was pinned at one layer only: a hand-built
`ServingEnumeration` handed straight to `servedBy`.

**Added: the same precedence end to end from raw wire bytes** (`lib/client/wire.test.ts`,
⚠⚠ *12d/TEST — a cut list OUTRANKS an unreadable `gpus`, end to end from real wire bytes*). Row
`0` is present with `gpus: null`; row `7` is refused for its `port`:

```ts
expect(cut!.serving).toMatchObject({ read: 'partial', refused: ['7'] });
expect(servedBy(cut!.serving, 0)).toEqual({ kind: 'incomplete' });
```

with the twin differing in exactly one field — row `7`'s port made valid — asserting `unknown`,
so it cannot pass for an implementation that answers `incomplete` everywhere.

**Measured: `12d-O6` red=1 → red=2**, at two layers, in two files:

```
--- 12d-O6 …
    exit=1  Tests  2 failed | 243 passed (245)  red=2
      FAIL lib/client/observations.test.ts > … > ⚠ when the list was cut AND a row we …
      FAIL lib/client/wire.test.ts        > … > ⚠⚠ 12d/TEST — a cut list OUTRANKS an unr…
```

**Verdict: it was under-tested, not narrow-by-construction.** The precedence really does change
nothing except which of two non-answers a card shows — but that is an argument for one mutation,
not for one test, and a silence pinned once is a silence one edit from being unpinned.

### 4.1 The final anchor census — all ten harnesses, on the tree this phase leaves

```
mutations across the ten harnesses: 1584
unique ids:                         1584
duplicate ids:                      none
anchors not matching exactly once:  none
```

### 4.2 The re-aimed mutations, read against what they REPLACE (HANDOVER §0.4)

Every re-aim in the diff was checked for the failure mode that rule names — a mutation credited
with a property it no longer removes. **None was weakened.** The four worth naming:

- `04-T72` — re-aimed onto the three-line enumeration check, still `enumerated = true`. Name
  (*an unread collection retires its subjects*) still exact.
- `12c-GP22` / `12c-R3` — re-aimed onto the two-line `if (!complete) … return rows.some(…)`, and
  both now delete the `incomplete` line so a refused list falls through to `unserved`. That is
  still *the CARD claims `no instance`*. Exact.
- `12b-OB2` / `12b-OB3` — re-aimed onto the shortened final `return`, so they now mutate only the
  complete-list branch. Both names are about `unserved`/`unknown` on a complete list. Exact.
- `12c-T02` — the build corrected its own name from *the COUNT of wire-refused rows* to *the
  wire-refused rows*. Correct: it now throws away the identities, not a number.

---

## 5. The five renders are the validator's own output — confirmed, with one wording correction

`components/panels/test-support.ts`'s `servingReadCases()` was read in full. **There is no fixture
shortcut**: it builds five raw JSON bodies, calls the real `parseSnapshot` on each, and throws
rather than asserting non-null if one ever stops validating. `stateFromWire` puts the returned
`WireSnapshot` — snapshot, `errors[]` and `ServingEnumeration` together — straight into the ring.

| case | the one difference from `complete` |
|---|---|
| `refusedNamed` | row 7's `port` is `'nope'` |
| `refusedAnonymous` | row 7's `instance` is `1.5` |
| `gpusUnreadable` | row 7's `gpus` is `null` |
| `gpusAbsent` | the `gpus` KEY is dropped — ⚠ from **both** rows |

⚠ **Correction to the build's §2: `gpusAbsent` differs in one FIELD but in two ROWS.** That is
correct as built and the reason is worth stating, because a future reader will otherwise "fix" it:
§3.4 defines an absent `gpus` as *"the SERVER predates this field"*, which is a property of the
server and not of a row. Dropping it from one row only would be a wire no deployment can produce.
The build's sentence *"differ from `complete` in exactly one field each"* is true of the field and
misleading about the row.

### 5.1 The two partial renders being EQUAL — examined, and it pins the ruling

This is the assertion the handoff called most able to hide a defect, so it was taken apart.

- **What it pins.** §3.4's ruling is about the LIST; §9's is about RETIREMENT. `refusedNamed` and
  `refusedAnonymous` fall into opposite branches of §9 — one holds back `'7'` and lets everything
  else retire, the other freezes the whole enumeration — and the card renders them identically
  because the card's claim (*we did not read the whole list*) is equally true in each. The
  equality assertion is what stops a later loop leaking §9's distinction onto a panel with no
  standing to make it. **It would fail if someone made `servedBy` distinguish them.**
- **Do they arrive by different code paths?** ⚠ **Inside `servedBy`, no — and the build should not
  be read as claiming they do.** Both are `read: 'partial'` with `rows: [rowZero]`, and both take
  the same two branches to `if (!complete) return { kind: 'incomplete' }`. What differs is the
  `refused` array, which `servedBy` never reads and `enumerationsRead` reads for everything.
- **Is the branch vacuous?** No. The census test asserts **four distinct strips from five reads**,
  and the only coinciding pair is the two partials. `12d-GP1` (red=5) and `12d-GP2` (red=4) both
  bite on that cell, so the strip is not a value nothing produces.

### 5.2 One claim of the build's that was only half-asserted, now whole

The build says *"GPU 0 is byte-identical in all five"*. Only two of the four non-complete reads
asserted it. Checked by reading `servedItem`: on card 0, `complete` and `gpusUnreadable` both take
`declared` with `alongside: []`, and `gpusAbsent` takes `indexed` with a match — all three produce
`k = 'served by instance 0'`, `v = formatModelName(model)`, `title = model`, so the equality is
real. **Added the two missing assertions** inside the existing ⚠ RENDER 4 and RENDER 5 tests.

---

## 6. The em dash and the new form — announced, and not ambient

The build added no `data-` attribute and argued the announced text IS the distinction. **The
argument holds and the test now tests it as stated.**

- `RENDER 4` already asserts on `valueCells(...)` — the extracted value-cell TEXT, which is what a
  reader announces — not on an attribute and not on the whole document.
- ⚠ **What was missing: nothing said the literal appears only where it should.** `strip()` is
  row-scoped (correctly — HANDOVER §0.4), so it structurally cannot see a second cell printing the
  same sentence. Added to the existing ⚠ RENDER 2 test:

```ts
expect(render(cases.refusedNamed, 'gpu1').split('list not fully read').length - 1).toBe(1);
expect(render(cases.refusedNamed, 'gpu0')).not.toContain('list not fully read');
```

and to `serving-panel.test.tsx`'s ⚠ *every refusal reaches THIS panel*, inside the loop that
already asserts the panel DOES carry the full reason — so the negative is paired with a positive
and cannot pass vacuously:

```ts
expect(html).not.toContain('list not fully read');
```

`grep -rn 'list not fully read'` over the tree: **one production site**, `gpu-panel.tsx:201`.

⚠ **Recorded, not fixed — a mis-citation, three times over.** The build justifies the four-word
form with *"§3.4 says keep it short"* and *"§6.4 forbids prose in a value slot"*, and
`gpu-panel.tsx`'s own comment repeats the first as a quotation of §3.4. **Neither phrase is in
`SPEC.md`.** `grep` finds no *"keep it short"*, no *"value slot"* and no *"forbids explanatory
prose"* anywhere in it; both come from the parent's build handoff
(`handoffs/12d-partial-reads.md` §2), and the nearest spec sentence is §6.4's ruling at line 1571
that *"§3.7 exists so an alarm is actionable, not so every cell carries prose"* — which is about
repeating one explanation in six cells, not about length. The **constraint is legitimate** (the
owner's brief said it); the **attribution is not**. Not edited here because it is a prose citation
in one comment and one report, and changing `gpu-panel.tsx` would invalidate a 359-mutation
harness run for no behavioural change. The reconcile phase should correct both to cite the
handoff, or the parent should put the sentence in §3.4.

---

## 7. `EnumerationsRead`'s three states — fixtured in both directions, at both layers

| state | what it means | producer (`enumerationsRead`) | consumer (`observePoll`) |
|---|---|---|---|
| **key absent** | the collection was not read | `wire.test.ts` — anonymous refusal → `keys()` is `[GPU]`; `observations.test.ts` — `servingEnumeration(null, [])` → `has()` false AND `get()` undefined | `conditions.test.ts` — *a MISSING key still retires nothing at all*, with all four subjects named in the stale list |
| **empty set** | read, nothing held back | `observations.test.ts` — *a complete read holds nothing back, which is not the same as not being read*; `wire.test.ts` — `cleanRead.get(SERVING)` is `[]` | `conditions.test.ts` — *an EMPTY exclusion set retires everything absent*, all four ids named |
| **member held** | read, this one may not be shown absent | `observations.test.ts` — `['7']` held, and `gpus` asserted empty in the same breath | `conditions.test.ts` — the held member goes stale while the other retires |

**No call site treats a missing key as an empty one.** There is exactly one production call site
(`lib/client/runtime.ts:533`), it passes `wire.snapshot` and `wire.serving` together so the two
halves cannot be told different things, and `PollOptions.enumerationsRead` defaults to
`EMPTY_ENUMERATIONS` — an empty **Map**, i.e. *nothing was read*, which retires nothing. The
default still fails in the loud direction.

---

## 8. `12d-Q5`, the duplicate identity — **it was a decision with no test. It has one now.**

The build chose *held back anyway* for a server that sends instance `0` twice, one valid and one
refused, and recorded why. Nothing fixtured it, and the handoff is right that it bites only on the
poll after the good row disappears — while the good row is present nothing is absent and every
implementation agrees.

Added (`lib/client/wire.test.ts`, ⚠⚠ *12d/TEST — a DUPLICATE identity is held back anyway, on the
poll after the good row leaves*):

```
poll 1-4   serving: [ '0' valid, '7' valid, '0' refused for its port ]
             → snapshot.serving = ['0','7'],  refused = ['0']
poll 5-8   serving: [ '0' refused for its port ]
             → snapshot.serving = [],          refused = ['0']

retired = ['health:7', 'unit:llama-server@7.service']
stale   = ['health:0', 'unit:llama-server@0.service']
```

**The conservative direction is what actually happens**, and the departed instance `7` is what
says the sequence really ran rather than `retired` being empty for want of a poll. Instance `'7'`
is deliberately not a card index, so *the subject that retires* and *a card index* cannot coincide.

Measured: the new test reddens under `12d-W1` (every refusal anonymous → nothing retires) and
`12d-O2` (a named refusal holds nothing back → `0` retires too). **`12d-W1` red 5 → 7,
`12d-O2` red 6 → 7.**

---

## 9. The sweep for inert mutations, and the anti-coincidence measure

**The build's measure — instance `'7'` serves card 1 — holds where it was claimed** (`servingReadCases`,
so identity ≠ card index ≠ row position) **and in `lib/conditions.test.ts`**, where members are
`'0'`/`'7'` against subjects `llama-server@0.service`/`llama-server@7.service`.

⚠ **It does NOT hold in `wire.test.ts`'s retirement sequences**, which use `servingPopulated`'s
identities `'0'` and `'1'` — the same strings as the card indices. **Examined and found not
exploitable**: the conditions in those sequences are `unit:` and `health:`, neither derived from a
card index, and the `gpus` key in the same map carries an empty exclusion — so an implementation
that looked the exclusion up under the wrong collection retires everything and goes red anyway
(that is `12d-C2`'s shape). The `unit:` subject still disagrees with its member there, which is
the coincidence that actually matters. My own added test uses `'0'`/`'7'` regardless.

**Every `retired === []` is paired with a `stale` list named in full** — checked in all four
places it occurs (`conditions.test.ts`'s missing-key test; `wire.test.ts`'s anonymous test; and
both of my additions state both lists). **Every "nothing found" guard has a positive control**:
`not.toContain('was dropped')` against the loop that asserts the two partials DO carry it;
`not.toContain('—')` against RENDER 4 asserting the em dash IS there; `not.toContain('gemma-4-31b')`
against RENDER 1; my `not.toContain('list not fully read')` on gpu0 against the gpu1 assertion in
the same body, and on SERVING against `toContain('was dropped')` one line above.

**Entropy and clocks:** every new test uses fixed millisecond literals and fixed fixtures; nothing
reads `Date.now()`, `Math.random()` or a real timer. **⚠ names:** the four harnesses report no
`UNMATCHABLE LEDGER KEYS` and no `!!!` lines, so every ⚠ name in play has a matchable prefix ≥12
characters and the scanner could read every `test`/`it` call.

---

## 10. Measurements — every figure quoted from the command's own output

### `pnpm verify` — **exit 0**

```
Test Files  109 passed (109)
      Tests  3840 passed (3840)
Type Errors  no errors
```

The build's tree was re-run first and reproduced **3838** exactly. **3840 after this phase's two
new tests**; no new test file, no source change.

### The four harnesses — run SERIALLY, one at a time

**One shell, four foreground commands, each `$?` written straight to its own status file with
`echo $? > file` and every ANCHOR report read from the log. No two ran at once, none was killed,
`pnpm verify` never ran beside one, nothing polled with `pgrep`, and no exit status was taken
through a pipe.** The browser scripts ran only after the last harness had finished.

| harness | exit | mutations | distinct red tests | ⚠ checked | report |
|---|---|---|---|---|---|
| `02-format-severity` | **0** | **66** | 287 | 30 | *"All 66 regressions failed their check, as they must."* |
| `04-collector-cooling` | **0** | **97** | 193 | 90 | *"All 97 regressions failed their check, as they must."* |
| `08-client-runtime` | **0** | **238** | 430 | 316 | *"All 238 regressions failed their check, as they must."* |
| `10-panels-assembly` | **0** | **359** | 554 | 386 | *"All 359 regressions failed their check, as they must."* |

**Zero `ANCHOR NOT FOUND` / `ANCHORS AMBIGUOUS` / `ANCHORS MOVED` / `DID NOT BITE` /
`NO MUTATION REDDENS` / `UNMATCHABLE LEDGER KEYS` / `!!!` on every run**, grepped from each log,
and every ⚠-marked test went red under at least one mutation. **All four passed on the first run.**

08 and 10 moved from the build's figures because of this phase's additions: 428 → **430** distinct
red and 314 → **316** ⚠ checked on step 08 (the two new ⚠ test names); step 10 and step 04 are
unchanged at 554/386 and 193/90.

### The thirteen `12d-` mutations, on the tree this phase leaves

| id | build | **now** | id | build | **now** |
|---|---|---|---|---|---|
| `12d-C1` | 2 | **2** | `12d-O2` | 6 | **7** |
| `12d-C2` | 2 | **2** | `12d-O3` | 3 | **4** |
| `12d-C3` | 5 | **5** | `12d-O4` | 4 | **5** |
| `12d-W1` | 5 | **7** | `12d-O5` | 2 | **2** |
| `12d-W2` | 4 | **4** | ⚠ `12d-O6` | **1** | **2** |
| `12d-O1` | 4 | **5** | `12d-GP1` | 5 | **5** |
| | | | `12d-GP2` | 4 | **4** |

⚠ **`12d-O6` is no longer the odd one out** — it is now the only mutation whose red set spans two
files, which is what a precedence decision deserves.

### The browser measurements

**`measure-breakpoints.mjs` — exit 0, `102 passed, 0 failed, 0 blocked by this environment, 102
total`.** First run, and it printed `Restored next-env.d.ts (rewritten by 'next dev')`; `git status`
taken afterwards agrees the file is byte-identical.

**`measure-arrangements.mjs` exit 0; `check-density.mjs` exit 0, `ALL PASS`.**

| claim | measured here |
|---|---|
| one panel **0.8 px** from its cap at 1600 | record 17, `1600x1024`: **`closest to its cap: gpu0 by 0.8 px`** |
| the other tight ones | `cpu by 0.7 px`, `gpu0 by 1 px`, `serving by 1.3 px`, `safety by 2.9 px` |
| §6.1's no-scroll promise | `spare 284 px` at 1920; `band … 1920x1080: 101.8 of 102` |
| the healthy page's spare | **`283.6 px`** (content bottom 796.4, viewport 1080); `overflow 0` with the §6.4 banner pinned (band 101.8) |

⚠ **Neither number moved and neither should have.** This phase added no element to any panel and
changed no component; every edit is in a `*.test.ts(x)` file.

### `git status`

**18 entries: 15 modified, 3 untracked. Nothing is staged and nothing is committed.**

```
untracked: pipeline/handoffs/12d-test-phase.md      (the parent's own handoff)
untracked: pipeline/steps/12-deploy/12d-build.md
untracked: pipeline/steps/12-deploy/12d-test.md     (this file)
```

`next-env.d.ts` is **not** in the list; the listing was taken after the last measurement finished.
**No source file is left mutated** — every harness restored what it touched, and the census in
§4.1 (1584 for 1584, zero anchors off) was re-run against the tree afterwards.

---

## 11. What this phase changed

| file | what | why |
|---|---|---|
| `lib/client/wire.test.ts` | **+2 tests**, +1 assertion block | the duplicate identity (§8), the precedence at a second layer (§4), and `''` ≠ `null` (§3.1) |
| `components/panels/gpu-panel.test.tsx` | +4 assertions in 3 existing ⚠ tests | the literal appears once and nowhere else (§6); GPU 0 byte-identical in all five (§5.2) |
| `components/panels/serving-panel.test.tsx` | +1 assertion in an existing ⚠ test | the card's four words do not leak onto the panel that carries the full reason (§6) |

**No source file, no fixture and no assertion was weakened; no `SPEC.md`, `MOCK.html`,
`INSTALL-SPEC.md` or `SERVING-MODES.md` edit; no mutation added, removed or re-aimed.**

## 12. Open, for the adversarial and the reconcile

1. ⚠ **The `keep it short` / `value slot` mis-citation** (§6). Prose only, in `12d-build.md` §1.2,
   §5 Q2, §5 Q3 and `gpu-panel.tsx`'s `incomplete` comment. Constraint real, attribution wrong.
2. ⚠ **A hand-built `{read:'partial', refused: []}`** tells the ledger and the card contradictory
   things (§3.2). Unreachable through the constructor; the type does not forbid it.
3. **The GPU enumeration's `member` is inert by construction** (§2.3) — deliberately untested and
   deliberately unmutated. It becomes live if `gpus[]` ever becomes row-lenient.
4. **`12c-Q5` is carried and untouched**: the SERVING headline still reads *"no llama-server
   instances discovered"* when every row was refused. Panel copy, nobody has ruled.
5. **Nothing in this loop ran against a container, a unit or a real GPU.** Every render is jsdom;
   every browser figure is the headless harness.

## 13. ⚠ This is a TEST phase only

`12d` is not done. **adversarial → reconcile → parent review** each run as a fresh agent with a
written handoff, and the parent re-runs `pnpm verify` itself and audits the adjudication —
rejections and deferrals first — before any commit.
