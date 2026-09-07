# Step 4 — the cooling collector — RECONCILIATION

```
$ pnpm verify
$ tsc --noEmit && vitest run
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard


 Test Files  17 passed (17)
      Tests  1038 passed (1038)
Type Errors  no errors
   Start at  21:25:35
   Duration  1.80s (tests 60%, transform 27%, import 8%, typecheck 4%, worker 1%)

exit=0
```

`pnpm build` → exit 0, and `md5 -q tsconfig.json` is `8b6e358b0e19ad663d554dc8310c6da0`
before and after, so Next did not rewrite it.

All three regression harnesses bite, and step 4's now carries a ledger:

```
python3 pipeline/steps/02-format-severity/regressions.py     → All 40 …, as they must.   exit=0
python3 pipeline/steps/03-collectors-gpu-host/regressions.py → All 64 …, as they must.   exit=0
python3 pipeline/steps/04-collector-cooling/regressions.py   → All 71 …, as they must.   exit=0
    Red-test ledger: 158 distinct failing tests across 71 mutations; 61 ⚠-marked tests checked.
    Every ⚠-marked test went red under at least one mutation.
```

Baseline entering this phase: 967 tests / 16 files, 46 mutations. Now **1038 / 17 / 71**.
**There is no step-1 `regressions.py`** — steps 2, 3 and 4 have one each; step 1 shipped
none, so "all four harnesses" is three.

---

# 1. The headline — §6.3's zero clause is implemented

`SPEC.md` gained the review's ruling verbatim before this phase started (the two-sided
`fan5 absolute` row, the new `fan1`–`fan4` stopped row, four ⚠ paragraphs, and §6.4's
`fan_stopped` kind). This phase made the code agree with it.

### `lib/severity.ts` — step 2's file, edited deliberately

```ts
// before
return value > 5100 ? 'alarm' : 'normal';
// after
return value > 5100 || value === 0 ? 'alarm' : 'normal';
```

plus a new total function:

```ts
export const severityFanStopped = (value: Rpm | null): Severity | null => {
  if (value === null || !Number.isFinite(value)) return null;
  return value === 0 ? 'alarm' : 'normal';
};
```

`severityFan5` needed no change — its `ch5Engagement === 'unknown'` branch already
propagates an absolute alarm, which is precisely why **one comparison fixes all seven**
of the review's green rows rather than the two a fourth `Cooling` variant would have
reached.

`===`, never `Object.is`, at both sites, with the reason stated at each: `-0 === 0` is
`true` and a corrupt `-0` is a stopped fan; `Object.is(-0, 0)` is `false` and would let it
band `normal`. **T46** mutates exactly that and goes red.

### `lib/conditions.ts` — `fan_stopped`

Added to `ConditionKind` and to `CONDITION_KIND_RULES` as `{ singleton: false,
bareKindAllowedInStanding: true }`. The doc states the two rules §6.4 attaches to it:
subscripted by **channel index**, covering channels 1–4 only, because **channel 5's zero is
carried by `fan5_absolute`** — one tach must never produce two conditions (O3). A bare
`fan_stopped` in `STANDING` is allowed, unlike `unit`: these four headers are homogeneous
and none of them is the GPU cooling path.

`CONDITION_KINDS` is now 15.

### The fixture is a test, as asked

`lib/severity.test.ts` gained
`describe('⚠ the `everythingZero` fixture — "a dead fan", and it must not band green')`,
asserting all five channels read `0` and all five band **alarm**, with its paired opposite
`nothingReadable` asserting all five read `null` and colour **nothing**. That pair is
invariant 1 in one place, and it is the cleanest demonstration that this was a §6.3 hole
rather than a step-4 defect: neither fixture goes near a collector.

### Four existing tests changed their expectations, and each got better

| test | was | now |
|---|---|---|
| `%s: even 0 RPM is not the engaged band` | asserted `severityFan5 → 'normal'` | split: the *engaged* row is still `null`, the *absolute* row is `alarm` |
| `manual, duty %s, fan STOPPED: the band has no severity` | asserted `null` | **renamed and inverted** — it is the headline state and it is now `alarm`; a new sibling keeps §6.6's property with a *healthy* tach |
| `a readable duty in the same shape still bands normally` | `stalled(0) → 'normal'` | `→ 'alarm'` (OFF duty, but the tach is 0), plus a LOW-at-989 case that is still `normal` |
| `every kind in §6.4 s table, and nothing else` | 14 kinds | 15 |

Two new companions were added at the same time so the change is fixtured on both sides:
`%s: the EC-auto floor of 1900 RPM is still normal` (1 / 604 / 1900 all normal — `0` is the
**only** low reading that alarms) and `%s: a `null` tach still carries no severity at all`.

**Mutation T45 is the one that would have caught the original hole**: it removes
`|| value === 0` and the suite goes red on the fixture test and on the every-mode table.

---

# 2. Every finding, with its disposition

## 2.1 The adversarial's ten

| # | Verdict | What was done |
|---|---|---|
| **A1** | Real, and a strict subset of G4 | Fixed **by the zero clause**, not by the recommended fourth variant. The variant is declined — see C1 below and `lib/types.ts`'s union comment |
| **A2** | Real, step-4 regression | **Fixed.** `Date.now()` → `performance.now()`, and the whole bound hoisted into `lib/collectors/deadline.ts`. **T52** |
| **A3** | Real, worse than reported | **Fixed** — one character, `ok('\x00')` as an escape. `grep -c classifyPwm5Read dell-smm.test.ts` now returns 18 where it returned nothing. Made permanent by a `guardrails.test.ts` rule and **T60** |
| **A4** | Real | **Fixed** with the `!listed.has('name')` form the review specified, fixtured on both sides. **T56** |
| **A5** | Real (the test, not the behaviour) | **Fixed** — a hang injected at `fan1_input`, asserting five `null`s and six `errors[]` entries. Secondary point **declined**: the six entries stay, §6.5 wants one per blanked figure. **T57** |
| **A6** | Real | **Fixed both halves.** The test is renamed to what it checks and its false comment deleted; the structural rule now lives as a source-text assertion in `guardrails.test.ts`. **T59** is the behaviour-preserving coupling that passed everything before |
| **A7** | Real | **Fixed**, folded into A2. `boundedTimeoutMs` validates finite / `> 0` / `≤ 2³¹−1` and falls back to `DELL_SMM_TIMEOUT_MS`. Fixtured on both sides of both edges. **T53**, **T54** |
| **A8a** (`left <= 0`) | **Declined**, as the review ruled | Recorded below as the first worked example of applying HANDOVER §5 with judgement |
| **A8b** (`-0`) | Real | Folded into the zero clause as an implementation note at `fanRpm`, `severityFan5Absolute` and `severityFanStopped`, plus two `-0` test cases. **T46** |
| **A8c** (`ENODATA` near-miss) | Real | **Fixed** — six near-miss codes (`enodata`, `EnoData`, `ENODATA `, ` ENODATA`, `ENODATA2`, `NODATA`) in a new ⚠ test. **T58** |
| **A9** | Comment wrong, code right | **Comment fixed** at `fanRpm` and at the call site; the behaviour change is declined (unreachable on this board). Rendering half deferred to steps 9/10 |
| **A10** | Correct as implemented | Documented in `classifyPwm5Read`'s table alongside C3; no code change. **Spec clause still owed** |

## 2.2 The build's C1–C5

| # | Verdict | What was done |
|---|---|---|
| **C1** | Real | Resolved **the review's way**: no fourth variant, no nullable `ch5Pwm`. `lib/types.ts`'s `Cooling` union gained the four-part argument for keeping three variants and the statement that `ch5Engagement: 'unknown'` and `formatCh5Pwm`'s em-dash branch survive as **wire defences** (O10), not dead code. **§6.6/§6.7 are still unamended — a spec gap, listed in §5** |
| **C2** | Real | The 2 s bound is documented at the constant and `deadline.ts` states the monotonic requirement. **Spec clause still owed** |
| **C3** | Real | Behaviour unchanged and correct; `classifyPwm5Read`'s doc now states both halves (junk carries an entry, out-of-register does not). **Spec clause still owed** |
| **C4** | Real, low | Behaviour kept. **Spec clause still owed** |
| **C5** | Real, low | The `-0` sentence folded in at `fanRpm`. **Spec clause still owed** |
| **G4** | The headline | §1 |

## 2.3 The review's own

| # | Verdict | What was done |
|---|---|---|
| §1 zero clause | MUST | Done — §1 |
| §2 decline the fourth variant | MUST | Done — C1 above |
| §3 A2 + A7 as one repair | MUST | Done — one module, `deadline.ts` |
| §4 A6 + the ledger | MUST | Done — §3 |
| §5 A3 | MUST | Done |
| §6 A4, A5, A8c, A9 | SHOULD | Done |
| §7 Node pin | SHOULD | `.nvmrc` + `.node-version` (both `24`) + a config-consistency guardrail. **No `engine-strict`, no running-version assertion**, exactly as ruled. **T61** |
| §10.1 hoist `boundedReader` | Must-not-leak | Done — `lib/collectors/deadline.ts`, generic over any promise |
| §10.2 hoist `errnoCodeOf` **now** | Must-not-leak | Done — moved to `errors.ts` and re-exported from `dell-smm.ts` so step 4's public surface is unchanged. **T26 re-aimed** |
| §10.4 adopt `findHwmonNode` in `collectCpuTemp` | Must-not-leak | Done. **No assertion in `collect.test.ts` changed**, as build.md predicted; three step-3 mutations were re-aimed (§4) |
| §9.1 the four subsumed trap tests | Keep | Kept, and now defensible: the ledger proves each goes red under **T62**/**T63**/**T67** rather than only under the set-equality test |
| §9.3 n1 — is the three-branch switch load-bearing? | **Measured: no** | §2.4 |
| §9.3 n2 — the seam is invisible to the type system | Accepted | Left as an obligation on step 6, carried in HANDOVER |
| §9.3 n3 — placeholder `null` vs `health: null` | Accepted | Carried to step 5 in HANDOVER, marked as the subtlest item |

### 2.4 §9.3 note 1, settled by measurement

The review asked whether `withServiceState`'s three identical `switch` branches were
load-bearing ("a bare spread over the union does not reliably preserve the discriminated
correlation") or three lines of ceremony with a doc giving the wrong reason.

**Measured.** A probe file containing exactly

```ts
export const bare = (cooling: Cooling, serviceState: UnitState | null): Cooling => ({
  ...cooling,
  serviceState,
});
```

compiles clean under this project's `strict` + `exactOptionalPropertyTypes` config. TypeScript
distributes an object spread across the union, so the correlation survives. **The switch was
ceremony.** It is now one line, with the measurement recorded at the function and the note
that exhaustiveness is not lost with it — it was never enforced there, because every
`Cooling` in the project is *constructed* by `coolingFrom`, whose switch is exhaustive.
**T25 re-aimed** to drop the state the function exists to write.

---

# 3. A6's meta-fix — the per-mutation red-test ledger

`regressions.py` now records **which test names went red** for each mutation, unions those
sets, and fails if any ⚠-marked test never appears. `LEDGER_FILES` is the only line steps
5–12 need to change; the block carries its own rationale and its own limits.

**It paid for itself on the first run.** Eight ⚠-marked tests across three files were
covered by no mutation at all:

| file | inert ⚠ test | now caught by |
|---|---|---|
| `dell-smm.test.ts` | trap 1 — the fan files are `fanN_input` | **T62** (`fanN_target`) |
| `dell-smm.test.ts` | trap 2 — the duty file is `pwm5`, not `pwm5_enable` | **T63** |
| `dell-smm.test.ts` | O6 low side — `0` is a READING | **T64** (`if (!value)`, the falsy-zero bug) |
| `dell-smm.test.ts` | a rejection with no code is never EC auto | **T65** |
| `dell-smm.test.ts` | the one implication that holds | **T66** (`ec-auto` → `pwm5Present: null`) |
| `cooling.test.ts` | `dell_smm`'s `tempN_input` are never read | **T67** |
| `cooling.test.ts` | `readDir` really returns names | **T68** (`withFileTypes: true`) |
| `severity.test.ts` | `null` alarms in NO mode | **T69** |

None was renamed and none had its ⚠ demoted — every one named a property with a plausible
wrong version, which is the answer the ledger is supposed to force.

**And it caught a weak test of my own.** T52 (wall clock restored) **did not bite** on the
first run: my monotonic-clock test moved `Date.now` by a *constant* offset, so both reads
shifted equally and the subtraction cancelled. Per HANDOVER §5 — *"if a mutation does not
bite, the first hypothesis is a missing test"* — the test was rewritten to step the clock
**between** opening the budget and spending it, which is where the real hazard lives. It
bites now, and the reason is recorded in the test.

**The limit is stated in the harness and is irreducible:** a ledger cannot tell "red because
the property broke" from "red". Two step-4 mutations that bit for the wrong reason were
found by hand; a ledger would have scored both as covered.

---

# 4. Regression harness — re-aimed anchors

Seven mutations across two steps needed re-aiming because code moved. Every one was
verified to still bite; none was deleted.

| # | Harness | Why |
|---|---|---|
| **T25** | 04 | `withServiceState` collapsed to one line (§2.4) |
| **T26** | 04 | `errnoCodeOf` hoisted to `errors.ts` |
| **T32/T33/T34** | 04 | the bound hoisted to `deadline.ts`; T33 now also runs `cooling.test.ts` |
| **T37** | 04 | `name` became `HWMON_NAME_FILE` |
| **S41/S42/S55** | 03 | `collectCpuTemp` adopted `findHwmonNode`; they attack the same three properties at their new sites and still run step 3's own `collect.test.ts`, which is what makes them evidence the adoption preserved step 3's protection |
| **S57** | 03 | one indentation level, from the de-nesting |

⚠ **Three of those printed `ANCHOR NOT FOUND`, not `DID NOT BITE`.** That distinction is
HANDOVER §1's and it held: a moved implementation announces itself differently from a dead
test. Do not read one as the other.

---

# 5. Spec gaps for the owner

`SPEC.md` was not edited (nor `MOCK.html`, nor `PLAN.md`). §6.3 and §6.4 already carry the
fan-zero ruling. **Nine clauses from the review's TAKE table remain unwritten**, and the
code is implemented conservatively against each with the reasoning at its call site.

| § | Still owed | Where the code states its choice |
|---|---|---|
| **§6.6** | The channel-5 PWM row still says *"when the mode is `manual` but the duty is not a reading, render `—`"*. **The contract cannot express that state**, and the review declined the fourth variant that would make it expressible. Replace with: a duty that is not a reading leaves the **mode** undetermined, not just the duty — `ch5Mode: null`, rendered `unavailable` | `lib/types.ts` at `Cooling`; `dell-smm.ts` at `classifyPwm5Read` |
| **§6.7** | *"a `pwm5` of `999` … becomes `null` and renders `—`"* → renders **`unavailable`**, for the same reason | same |
| **§3.7** | Two probe-table rows: (i) read succeeded, text is not an integer in 0–255 → `pwm5Present: true`, `ch5Mode: null`, **junk carries an `errors[]` entry, an out-of-register value does not**; (ii) `ENOENT` on the read after a listing that had `pwm5` → folded into "read failed some other way", one stale poll | `classifyPwm5Read`'s doc table |
| **§3.3** | A bound sentence: the whole probe shares **one 2 s budget**, and it **must be measured on a monotonic clock** — `Date.now()` extends the bound by the size of a backward NTP step | `cooling.ts` at `DELL_SMM_TIMEOUT_MS`; `deadline.ts`'s module doc |
| **§3.6 / §6.5** | `pwm5Present: false` carries an `errors[]` entry naming the missing node, and it persists while the module is missing | `cooling.ts`, step 4 of `collectCooling`'s doc |
| **§3.3 or §6.6** | `fanN_input` is an unsigned revolution count: `-0` compares equal to `0` and is a stopped fan; `-1` and below is a corrupt read → `null` with **no** entry | `fanRpm`'s doc |

**Two new gaps found in this phase:**

- **G5 — §6.3's `fan1`–`fan4` row has no `errors[]` or rendering guidance for the case
  the row cannot see.** The row judges `0`; `null` carries no severity. But on the stock
  4-fan driver `fan5Rpm` is `null` *and explained* (by `pwm5Present: false`), whereas a
  `fan1`–`fan4` that fails to read is `null` with an entry. Steps 9/10 need to know that an
  em dash on channels 1–4 always has an entry behind it and an em dash on channel 5 may not
  (A9's rendering half). Not blocking; it is a §6.5 sentence.
- **G6 — §6.4 does not say what a `fan_stopped` condition's *subject string* is.** The
  table gives the example `fan_stopped:3`, so the channel index as a bare decimal is the
  obvious reading and is what `conditions.ts` documents — but `health` is subscripted by
  *instance* index and `gpu_temp` by *GPU* index, and all three are bare integers in the
  same `STANDING` namespace. `fan_stopped:1` and `gpu_temp:1` are different subjects with
  the same shape; nothing says they must be, only that they happen to be. Worth one
  sentence before step 8 wires the ledger.

**Two of step 3's open gaps are now closed by the current `SPEC.md`** and HANDOVER has been
updated: **G2** (§6.7 states the out-of-range/no-entry rule generally and names `pwm5` of
`999`) and **G3 / O16** (§6.7 states that the collector owns `previous` across a failed
read).

---

# 6. Declined, with reasons, so none is silently dropped

| Not taken | Why |
|---|---|
| A fourth `Cooling` variant, or a nullable `ch5Pwm` | The review's four grounds, now recorded at the union in `lib/types.ts`. The decisive one: two members sharing the discriminant `'manual'` narrow to the same `Pwm \| null`, so the "better" option and the "worse" one are **the same type** |
| A low-but-nonzero `fan5` or `fan1`–`fan4` band | No measured basis between `0` and the engaged floor. The only candidate number is a field-replaceable part's datasheet minimum (Arctic P8 Max, 500 RPM), which makes the spec wrong the day it is swapped. Tested from the other side: 1 / 604 / 989 / 1900 all band `normal` |
| An upper RPM bound in the collector | Would replace §6.3's `> 5100` alarm with an em dash. **T20** still guards it |
| An upper row on `fan1`–`fan4` | The EC does not modulate them under load and no nominal is documented. **T50** mutates one in and goes red |
| Collapsing the six timeout `errors[]` entries | §6.5 wants an error per blanked figure. **T57** |
| A fixture at `left === 0` (A8a) | ⚠ **The first worked example of applying HANDOVER §5 with judgement.** At `left === 0` exactly, `<= 0` rejects now and `< 0` rejects on a 0 ms timer — *the same observable outcome, one tick apart*. The rule exists because a wrong side of a boundary reaches a panel; here neither side is distinguishable at a panel, so a fixture buys bookkeeping. Contrast the 2³¹−1 boundary, which **is** fixtured on both sides because the two sides are a 25-day budget and a 1 ms one |
| An `errors[]` entry for `pwm5` present + `fan5_input` absent (A9) | Unreachable on this board — the DKMS patch adds both together. Hedging an impossible state is how drift starts. The false *premise* in the comment was fixed instead |
| `engine-strict=true` | Would make `pnpm install` refuse on this Mac today, blocking every remaining step |
| A guardrail on the **running** Node major | Would turn the suite red now, and green is this project's only signal |
| A "flag a test whose body does not reference its title" lint | The review's own rejection: a lint over prose, high false-positive rate, trains people to ignore it |

---

# 7. What changed, by file

| File | Change |
|---|---|
| `lib/severity.ts` | **step 2's.** Zero clause on `severityFan5Absolute`; new `severityFanStopped`; three doc blocks |
| `lib/conditions.ts` | **step 2's.** `fan_stopped` kind + rule + doc |
| `lib/types.ts` | **step 1's.** Doc only — the `Cooling` union's no-fourth-variant argument (C1), the wire-defence note (O10), and `fan5Rpm`'s two-sided band |
| `lib/collectors/deadline.ts` | **new**, 130 lines. `MAX_TIMEOUT_MS` `boundedTimeoutMs` `deadline` `boundedReader`, type `Within` |
| `lib/collectors/deadline.test.ts` | **new**, 28 tests |
| `lib/collectors/cooling.ts` | Deadline hoisted out; A4's sanity floor; doc updates |
| `lib/collectors/dell-smm.ts` | `errnoCodeOf` moved out and re-exported; `withServiceState` collapsed; A9/A10/C3/C5 doc |
| `lib/collectors/errors.ts` | Gained `errnoCodeOf` |
| `lib/collectors/hwmon.ts` | `HWMON_NAME_FILE` exported and used; adoption note rewritten |
| `lib/collectors/collect.ts` | **step 3's.** `collectCpuTemp` adopted `findHwmonNode` — 45 lines to 12, no assertion changed |
| `lib/collectors/index.ts` | `deadline` exports, `HWMON_NAME_FILE`, `errnoCodeOf` re-homed |
| `lib/guardrails.test.ts` | Three new rules: the Node pin, no raw control bytes, and §3.7's structural "never from each other" |
| `lib/severity.test.ts` · `conditions.test.ts` · `cooling.test.ts` · `dell-smm.test.ts` | Expectations updated + 12 new tests |
| `.nvmrc` · `.node-version` | **new**, `24` |
| `pipeline/steps/04-…/regressions.py` | 46 → **71** mutations, 7 re-aimed, plus the ledger |
| `pipeline/steps/03-…/regressions.py` | 4 re-aimed |

**No dependency added** (invariant 6). Nothing written to the server (invariant 2) — this
phase made no SSH call at all.

---

# 8. Invariants

1. **`null` is not `0`** — strengthened, and this is the step's whole point. `0` now
   *colours* where it used to sit silent, and every place that changed has a paired `null`
   test asserting the opposite. `everythingZero` / `nothingReadable` are asserted together.
2. **Read-only** — held; no SSH, no writes.
3. **`ENODATA` is healthy** — held, and hardened: six near-miss codes now prove the
   comparison is exact equality.
4. **`fanN_input` is the only trustworthy telemetry** — held; **T62**/**T63**/**T67** now
   make each trap a mutation, not only a set-equality assertion.
5. **A partial snapshot, never a 500** — held; `boundedTimeoutMs` *falls back* rather than
   throwing, deliberately.
6. **No dependency** — held.
7. **Report gaps, do not fill them** — held: nine clauses still owed, two new gaps raised,
   `SPEC.md` untouched.
