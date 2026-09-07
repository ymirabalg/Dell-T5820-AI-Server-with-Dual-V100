# Step 4 — the cooling collector — BUILD

`pnpm verify` → **967 tests, 16 files, `exit=0`**. Baseline before this step was 837/13.
`pnpm build` → exit 0, and `tsconfig.json` is byte-identical afterwards (md5 compared).
Step 2's 40 and step 3's 64 regressions still all bite; step 4's own harness is 46/46.

---

## 1. What was built

| Path | Lines | What it is |
|---|---|---|
| `lib/collectors/hwmon.ts` | 142 | **The shared hwmon node walk.** Finds a node by its `name` and returns *why* it did not |
| `lib/collectors/dell-smm.ts` | 367 | **§3.3 + §3.7, pure.** Fan parsing, the three-valued `pwm5` probe, the `Cooling` union |
| `lib/collectors/cooling.ts` | 248 | **The IO wrapper.** `collectCooling`, its deadline, its path prefixing |
| `lib/collectors/errors.ts` | 37 | `tag` + `reason`, moved out of `collect.ts` so three files share one copy |
| `lib/collectors/hwmon.test.ts` | 207 | 17 tests |
| `lib/collectors/dell-smm.test.ts` | 533 | 62 tests |
| `lib/collectors/cooling.test.ts` | 768 | 51 tests, the last 5 against the **real** filesystem through `nodeIo` |
| `pipeline/steps/04-collector-cooling/regressions.py` | | 46 deliberate regressions |

**Edited, and these are the only files outside step 4's own that changed:**

- `lib/collectors/collect.ts` — `tag` and `reason` deleted and imported from `./errors`
  instead. **No call site changed**, which is why all 64 of step 3's regression anchors
  still hit (four of them quote `reason(...)` at a call site). Behaviour identical.
- `lib/collectors/index.ts` — step 4's exports appended, and the module doc updated to say
  `collectCooling` never reads D-Bus.
- `lib/collectors/samples.ts` — the `dell_smm` fixture text appended (§4 below).

Nothing in `lib/types.ts`, `lib/format.ts`, `lib/severity.ts`, `lib/fixtures.ts`, `app/`,
`SPEC.md`, `PLAN.md` or `HANDOVER.md` was touched.

**No dependency was added** (invariant 6).

---

## 2. The parser / IO split

Exactly step 3's shape, and the seam is drawn where it has to be for §3.7 to be testable.

```
cooling.ts   fetch bytes ─ bound the clock ─ prefix paths ─ tag `dell-smm`
   │                                  ↓ hands over one Pwm5Read and one filename→contents record
dell-smm.ts  parseDellSmmFans · classifyPwm5Read · pwm5PresentFrom · ch5ModeFrom · coolingFrom
hwmon.ts     findHwmonNode (takes any {readFile, readDir}) · describeHwmonMiss
```

Two things are load-bearing about where the line falls:

- **The probe's IO fact is a *value*, not an exception.** `Pwm5Read` is
  `{kind:'ok', text} | {kind:'failed', code, message}`. The wrapper is the only layer that
  sees a rejection; it lifts `error.code` off it with `errnoCodeOf` and hands the classifier
  a plain value. That is what makes all five of §3.7's outcomes — including `ENODATA` —
  reachable in a pure unit test with no `/sys` and no Dell.
- **`findHwmonNode` takes a reader, not a `CollectorIo`.** `HwmonReader` is the two methods
  it needs, so `cooling.ts` passes it a **deadline-wrapped** reader and the walk is bounded
  without knowing anything about deadlines.

Parsers hold no literal paths; the wrapper prefixes every message. That matters more here
than in step 3 because these paths are *discovered* (`/sys/class/hwmon/hwmon3/...`), and a
test proves it by pointing `CollectorPaths.hwmonRoot` at `/host/sys/class/hwmon` and
asserting the prefix follows. **`CollectorPaths` gained no field** — `hwmonRoot` was already
there.

---

## 3. Every §3.3 field, mapped to its parser and its test

| §3.3 field | Source | Parser | Tests that pin it |
|---|---|---|---|
| `fan1Rpm` … `fan5Rpm` | `fanN_input` | `parseDellSmmFans` → `fanRpm` | `dell-smm.test.ts` "the live box: five channels, each in its own field", "no channel is mapped to another channel's field", the stalled/empty/negative/implausible quartet; `cooling.test.ts` "a fan whose file will not read", "a fan whose file reads as nothing" |
| `ch5Mode` | derived from `pwm5` | `classifyPwm5Read` → `ch5ModeFrom` | `dell-smm.test.ts` "§3.7's probe table (O8)" (5-row table); `cooling.test.ts` outcomes 1–5 |
| `ch5Pwm` | `pwm5` | `classifyPwm5Read` → `coolingFrom` | O6's four boundary tests; "a duty of 0 is a reading" |
| `serviceState` | D-Bus | **not read here** — see §6 | `coolingFrom` "serviceState is a parameter, not a reading"; `withServiceState (O9)` |
| `safety.pwm5Present` | the same probe | `pwm5PresentFrom` | the O8 independence trio, below |

### The three telemetry traps, enforced rather than commented

`cooling.test.ts` has a `describe` that runs the collector against a fake node **whose
directory contains the trap files and whose reads of them would succeed**, then asserts the
exact list of paths read:

```
hwmon0/name … hwmon3/name, fan1_input … fan5_input, pwm5      ← and nothing else
```

with separate tests for `_enable`, `_target`, `_label|max|min`, and `dell_smm`'s
`tempN_input` (§3.2 forbids those as a CPU sensor). A trap read is a *test failure*, not a
review finding — regression **T35** proves it by pointing the fan loop at `pwmN_enable` and
watching 23 tests go red.

The traps are also in the fixtures as captured evidence: `CAPTURED_DELL_SMM_TRAPS` holds
`pwm5_enable: '2\n'` and `fan5_target: '5100\n'`, **read from the live box at the same
moment `fan5_input` said 1915 and `pwm5` said `ENODATA`.** Both traps were confirmed live:
the EC reported "auto" (`2`) and the clamped HIGH nominal (`5100`) while the channel was
idling at 1915 RPM.

---

## 4. Fixtures — where each one came from

Captured from `ai-server` 2026-09-06 over SSH, **read-only** (`ls`, `cat`, `od -c`, and one
`python3 -c` doing `os.open`/`os.read` to read errnos). Nothing was written. Invariant 2
holds: writing a `pwmN` would take manual control of a fan on a box with two passively
cooled 250 W cards.

| Fixture | Origin |
|---|---|
| `CAPTURED_DELL_SMM_ENTRIES` | `ls -1 /sys/class/hwmon/hwmon3/`, verbatim, 44 entries including the traps |
| `CAPTURED_DELL_SMM` | one atomic `head -n1 fan{1..5}_input` plus `name`. `fan1 1028 · fan2 718 · fan3 615 · fan4 1006 · fan5 1915` |
| `CAPTURED_DELL_SMM_TRAPS` | `pwm5_enable`, `fan5_target`, `fan5_max`, same moment |
| `PWM5_EC_AUTO` (`'ENODATA'`) | measured: `os.read()` on `pwm5` → **errno 61, `ENODATA`, on the READ; `open()` succeeds** |

The box was in EC auto at capture time and the causal chain is worth recording, because it
makes the fixture self-explanatory: both V100s read **40 °C**, below `gpu-fan-control`'s
`AUTO_BELOW=55`, so the service had handed channel 5 back to the EC, so `pwm5` returns
`ENODATA`, so `ch5Mode` is `'ec-auto'` — healthy.

**Hand-built, because the box is healthy and cannot be put into these states** (each is the
capture with exactly one named mutation):

| Fixture | The state it encodes |
|---|---|
| `DELL_SMM_STOCK_ENTRIES` / `DELL_SMM_STOCK` | the stock in-tree driver, `DELL_SMM_NO_FANS = 4`: no `fan5_*`, no `pwm5`. §3.6's alarm |
| `DELL_SMM_FAN5_STALLED` (`0`) | a dead fan — `0 RPM`, invariant 1's live half |
| `DELL_SMM_FAN5_EMPTY` (`\n`) | a truncated SMM answer — `Number('')` is `0` |
| `DELL_SMM_FAN5_NEGATIVE` (`-1`) | the other side of the RPM floor |
| `DELL_SMM_FAN5_IMPLAUSIBLE` (`14451`) | the tach that hung POST. **Must survive as a reading** |
| `DELL_SMM_FAN5_AT_NOMINAL` / `_OVER_NOMINAL` (`5100` / `5101`) | both sides of §6.3's absolute row |
| `PWM5_OFF` / `PWM5_HIGH` / `PWM5_BELOW_RANGE` / `PWM5_ABOVE_RANGE` | O6's four, named: `0`, `255`, `-1`, `256` |
| `PWM5_FAR_ABOVE_RANGE` (`999`) | §6.7's own example value |
| `PWM5_EMPTY` (`\n`) | the truncated duty O6 is about |

`EACCES` / `EIO` / a code-less rejection are produced by the test's fake, which builds a
Node-shaped error (`Object.assign(new Error(...), { code })`) — the shape matters because
the probe reads the **code**, and one real-filesystem test proves `nodeIo` really carries it
(`rejects.toMatchObject({ code: 'EACCES' })` against a `chmod 000` directory).

**Acceptance against `lib/fixtures.ts`:** HANDOVER says the five cooling fixtures are step
4's acceptance criteria. All five are reproduced by `collectCooling` and asserted with
`toEqual`: `nothingReadable.cooling`, `pwm5NodeAbsent.cooling`, `pwm5Unreadable.cooling`,
`ch5Manual`, `ch5EcAuto` (the last four with `serviceState` supplied, per §6).

---

## 5. ⚠ The single three-valued probe (O8), and how the tests prove independence

`Pwm5Probe` is a closed set of five outcomes matching §3.7's five rows one for one:
`unlocated · absent · manual · ec-auto · unreadable`.

Both contract fields come off it through **two separate unary total functions**, each an
exhaustive `switch` on `probe.outcome`, and **neither calls the other**:

```ts
pwm5PresentFrom(probe: Pwm5Probe): boolean | null
ch5ModeFrom(probe: Pwm5Probe): Ch5Mode
```

That is the structural half. The proof half is three tests in `dell-smm.test.ts`, and they
are the reason this cannot be "fixed" back into a derivation without going red:

1. **The implication that does hold** — for every outcome, `ch5Mode !== null` implies
   `pwm5Present === true`.
2. **`pwm5Present` is not a function of `ch5Mode`** — the outcomes with `ch5Mode === null`
   produce `{null, false, true}`, three distinct values. A derivation would have to answer
   the same thing for all three.
3. **`ch5Mode` is not a function of `pwm5Present`** — the outcomes with
   `pwm5Present === true` produce `{'manual', 'ec-auto', null}`, three distinct values.

Tests 2 and 3 are the ones that matter: each exhibits a *counter-example to a function*,
which is the only way to prove non-derivability. A pair of "the table is right" tests would
pass against a derivation that happened to agree on the rows chosen.

Four regressions attack this directly and all four bite:

- **T1** rewrites `pwm5PresentFrom` as `ch5ModeFrom(probe) !== null` — §3.7's forbidden
  biconditional. Red.
- **T5** rewrites `ch5ModeFrom` in terms of `pwm5PresentFrom`. Red.
- **T27** reports a missing `dell_smm` node as `absent` instead of `unlocated` — the
  keystroke that turns "`/sys` is not mounted" into "the DKMS module did not load". 10 tests
  red.
- **T30** recomputes `pwm5Present` at the wrapper from the assembled `Cooling`. 18 red.

### The ordering that makes `false` unreachable by accident

`false` is produced at exactly one place, and only after the node has been **found and its
directory listed**:

1. locate `dell_smm` by `name` → any failure is `unlocated` (`null`, unknown);
2. `readDir` the node → any failure is `unlocated`, **not** a speculative `pwm5` read. §3.7
   row 1 names "`EACCES` on the directory", and reading `pwm5` anyway would get `EACCES`
   *from the read*, classify as `unreadable`, and assert `pwm5Present: true` on no evidence.
   T28 mutates this branch to `absent` and it goes red;
3. the **directory listing is the presence oracle** — `pwm5` absent from it is `absent`
   (`false`, the alarm). T29 deletes that branch so `pwm5` is read speculatively, and three
   tests go red because a stock 4-fan node then reports `pwm5Present: true`;
4. `pwm5` read: `ENODATA` → `ec-auto` with **no `errors[]` entry**; a number in 0–255 →
   `manual`; anything else → `unreadable`, `pwm5Present` still `true`.

A test asserts `false` is reachable from `absent` and from no other outcome.

### `ENODATA`, and why the code and not the message

`errnoCodeOf(e)` reads `e.code` when it is a non-empty string and returns `null` otherwise.
HANDOVER's "do not match on message text" is enforced by a test: an `Error` whose *message*
says `ENODATA` but which carries no `code` classifies as `unreadable`, and one whose code is
`EIO` with `ENODATA` in the message does too. **T7** mutates the classifier to match on the
message and goes red.

Verified end to end that the code survives the trip:

- on the box, `os.read()` on `pwm5` raises **errno 61 / `ENODATA`** — on the *read*, not the
  open, so `readFile` rejects after a successful `open`;
- libuv 1.52 (this toolchain) carries `ENODATA` in its error map —
  `util.getSystemErrorMap()` lists it — so Node surfaces errno 61 as `code: 'ENODATA'`
  rather than as `UNKNOWN`. Had it not, the failure mode is a **degradation** (`ec-auto`
  becomes `null`, rendering *unavailable* instead of *EC auto*) and not an inversion:
  `pwm5Present` stays `true` either way.

`ai-server` has no Node, so the two halves were measured on the two machines they live on
and are recorded here rather than asserted in a test.

---

## 6. ⚠ Scope decision: `serviceState` — step 4 does **not** read D-Bus

**Taken: HANDOVER's suggested resolution.** PLAN.md puts the D-Bus `ActiveState` read in
step 5 and §3.3 lists `serviceState` among cooling's fields; step 4 collects fans and
channel 5 only, **step 5 owns the single read, step 6 writes it to both fields** (O9).

Mechanically:

- `collectCooling` returns a `Cooling` whose `serviceState` is **always `null`**, and both
  the `CoolingCollection` doc and the barrel's module doc say so in a ⚠ block.
- `withServiceState(cooling, state): Cooling` is exported for step 6. It switches over the
  three variants and preserves each, so step 6 does not re-derive the union to add one
  field, and the two writes (`cooling.serviceState` and `safety.fanServiceState`) sit
  adjacent in step 6's code — the cheapest defence against O9's "they must never disagree".

Rejected alternative: making `serviceState` a **required option** on `collectCooling`. It
would force step 6 to have the D-Bus answer *before* calling this collector, serialising two
reads that should run concurrently. The cost of the shape chosen is that step 6 could forget
to call `withServiceState` and ship a permanently-`null` field; `lib/contract.test.ts`
already asserts the two fields agree across every fixture, so a step-6 test that sets
`safety.fanServiceState` and forgets cooling is caught there.

**Obligation on step 6, stated plainly for HANDOVER:** call `withServiceState` before the
snapshot goes on the wire, with the same value written to `safety.fanServiceState`.

---

## 7. ⚠ O17 — bounding reads the seam does not bound

`CollectorIo` bounds `run` and explicitly does not bound `readFile`/`readDir`. **These reads
are SMM BIOS calls into the Dell EC**, not procfs, so step 4 imposes its own bound.

**`DELL_SMM_TIMEOUT_MS = 2000`, for the whole probe, not per read.** The reads are issued
**sequentially**. Both decisions are deliberate:

- **One shared budget.** Ten reads each allowed the full budget is a ten-times-longer bound
  than the one written down — the classic "timeout" that is really a per-attempt timeout.
  T33 mutates `deadlineAt - Date.now()` to `timeoutMs` and the shared-budget test goes red.
- **Sequential.** Two independent reasons, either sufficient. `dell-smm-hwmon` serialises
  every SMM call behind one mutex, so concurrency buys nothing. And `fs.readFile` runs on
  libuv's thread pool — **four threads by default** — so ten concurrent *blocked* SMM reads
  would starve every other `fs` and DNS operation in the process, including the rest of the
  snapshot. `collectHost` issues nine concurrent reads; adding ten more that can block in
  the EC would have been the wrong pattern to copy. A test records the peak in-flight count
  and asserts it is **1**; T31 makes the loop a `Promise.all` and it goes red.
- **2000 ms is chosen, not measured** — see gap **C2**. Reasoning at the constant: ~3 orders
  of magnitude over the real cost, under §6.7's 5 s cadence, and deliberately *below*
  `NVIDIA_SMI_TIMEOUT_MS` because this is a sensor read rather than a process spawn.

**A bounded `readFile` is abandoned, not cancelled** — the seam takes no `AbortSignal` and
an in-flight `fs.readFile` cannot be interrupted anyway; the thread-pool slot stays occupied
until the SMM call returns. That is stated at the module, because "a bounded call that is
not bounded is worse than an unbounded one" applies to *what* is bounded as much as to
whether. What the deadline guarantees is that **the request settles**, which is §3.1's
requirement for `nvidia-smi` and the reason §4's route stays responsive.

Both handlers are attached to the abandoned promise, so its late rejection is subscribed to
and can never become an `unhandledRejection` that takes the route down. A test installs a
`process.on('unhandledRejection')` listener across a timed-out call whose reads reject 35 ms
later and asserts nothing arrives; **T34** replaces the implementation with a bare
`Promise.race` and 12 tests go red.

A test also proves the deadline degrades gracefully: with a hang injected at `fan5_input`,
`fan1Rpm` is still `1028`, `fan5Rpm` is `null`, and `pwm5Present` is still `true` — the
listing had already answered that question.

---

## 8. The hwmon walk — extracted, not yet adopted by step 3

HANDOVER: *"Step 4 is the second caller and the first point at which the right abstraction is
visible: extract it then, and make the extracted version return the reason."*

`findHwmonNode` returns a discriminated result, and the reason is a **value**, not only a
message:

| result | reached when | `pwm5Present` |
|---|---|---|
| `{found: true, dir}` | a node's `name` matched | — |
| `{found: false, why: 'root-unreadable', error}` | `/sys` not mounted, or not traversable | `null` |
| `{found: false, why: 'absent', scanned}` | every node identified itself, none matched | `null` |
| `{found: false, why: 'indeterminate', scanned, unidentified}` | a `name` would not read — **it may have been the one** | `null` |

All three misses are `null`; §3.7 lists them together as *unknown*. What the distinction buys
is §6.5's message, and the structural guarantee that "I could not look" can never reach the
branch that produces `false`.

**`collectCpuTemp` has NOT been changed.** Reasons, and the recommendation for
reconciliation:

- Editing `collect.ts`'s behaviour is outside a build phase's scope, and its three message
  strings are asserted verbatim by step 3's tests.
- So `describeHwmonMiss` reproduces those three strings **byte for byte**, and a test in
  `hwmon.test.ts` pins them against the `coretemp` wording specifically. Adoption is
  therefore mechanical: replace the ~30-line walk in `collectCpuTemp` with
  `findHwmonNode(io, paths.hwmonRoot, CORETEMP_NAME)` plus `describeHwmonMiss`, and no
  assertion in `collect.test.ts` changes.
- **Recommendation: yes, step 3 should adopt it**, at reconciliation or step 6. Until then
  there are two walks, which is the one piece of duplication this step knowingly leaves. It
  is why `reason`/`tag` were moved to `errors.ts` rather than exported from `collect.ts`:
  had `hwmon.ts` imported them from `collect.ts`, adopting the walk would create a
  `collect → hwmon → collect` cycle.

Regression coverage of the walk: **T36** (found by fixed index instead of by name), **T37**
(sysfs trailing newline not trimmed), **T38** (an unreadable `name` swallowed — step 3's
original defect), **T39** (an unreadable root reported as absence), **T40** (the two miss
messages collapsed).

---

## 9. `Number('')` is `0` — where it was stopped

Every text→number conversion goes through `numbers.ts` (`parseIntegerStrict`). **No second
strict-parse helper was written.** Three places it would have bitten, each with a fixture and
a regression:

| Site | Wrong value it would produce | Fixture | Regression |
|---|---|---|---|
| `fanN_input` empty | `0 RPM` — a dead fan on the GPU header | `DELL_SMM_FAN5_EMPTY` | T17 |
| `pwm5` empty | `OFF pwm 0` — plausible, and it disengages §6.3's band | `PWM5_EMPTY` | T11 |
| `pwm5` out of register | a `Pwm` no formatter can name | `PWM5_ABOVE_RANGE`, `PWM5_BELOW_RANGE` | T12/T13/T14 |

**Boundary guards, all with a fixture on both sides** (HANDOVER §5):

| Guard | below | above | regressions |
|---|---|---|---|
| `pwm5` 0–255 | `-1` → null, `0` → reading | `255` → reading, `256` → null | T13 (low side only) **and** T14 (high side only) — one per direction, neither anchored on a comparison |
| `fanN_input` ≥ 0 | `-1` → null | `0` → reading | T18 (`<` → `<=`, zero swallowed) **and** T19 (guard removed, `-1` accepted) |
| `fanN_input` upper | — | `5100` and `5101` and `14451` all pass through | T20 adds a plausible 5100 ceiling and goes red |

The `pwm5` range check calls **`pwmStateName`** rather than re-writing `0` and `255`. That
function is already "the only definition of the ≥ 192 boundary in this project" and it owns
the same register's bounds; a second copy could drift, and a drift would let the collector
mint a `Pwm` the formatter then refuses to name. It is the one place a collector imports
from `lib/format.ts`, and the import is a *hardware register range*, not a formatting rule.
Called out here because HANDOVER §3 says step 4 "should not need the formatters"; this is a
deliberate, argued exception, and the four boundary tests pin it from this side too.

**There is no upper bound on RPM, on purpose.** §6.3's absolute row makes `> 5100` an alarm
and names 14451 as the tach that hung POST. A collector that rejected an implausible tach
would replace red with an em dash. The floor is not a plausibility bound either: `fanN_input`
is an unsigned revolution count, so a negative is a corrupt read, and per §6.7 it carries
**no `errors[]` entry** (an out-of-range reading is "a successful read of an impossible
value"). An *unparseable* read does carry one — the distinction is stated at `fanRpm`.

---

## 10. Regression evidence

```
$ python3 pipeline/steps/04-collector-cooling/regressions.py
…
All 46 regressions failed their check, as they must.        (harness exit 0)
```

44 were written; two were rewritten after the first run because **they bit for the wrong
reason**, which is the same class of finding steps 2 and 3 reported and is worth recording
rather than quietly fixing:

- **T40** originally produced a malformed `describeHwmonMiss` and the *file failed to
  compile* — `Tests no tests`, `FAIL hwmon.test.ts [file]`. A syntax error proves nothing
  about the tests, and the harness's own docstring forbids one. Rewritten as a valid,
  plausible implementation (indeterminate returns the plain "absent" sentence); it now fails
  the two `describeHwmonMiss` assertions.
- **T41** was `CoolingCollection.pwm5Present: Safety['pwm5Present']` → `boolean`, and it bit
  as `TS6196: 'Safety' is declared but never used` — the compiler noticing an orphaned
  import, not a type being enforced. **The same weakness applied to T43.** Both were
  replaced with four mutations aimed at value sites, which produce real assignability
  errors: `pwm5Present` stringified (`TS2322 … not assignable to 'boolean | null'`), a fan
  minted from `Number()` (`TS2322 … 'number' is not assignable to 'Rpm'`), `serviceState`
  set to `'running'` (`TS2345`, §3.7's closed vocabulary), plus a runtime T41 for the very
  plausible `pwm5PresentFrom(probe) ?? false`, which normalises *unknown* into the alarm and
  turns 11 tests red.

**The prior harnesses were re-run after the `reason`/`tag` move**, since four of step 3's
anchors quote them:

```
$ python3 pipeline/steps/02-format-severity/regressions.py    → All 40 …, as they must.
$ python3 pipeline/steps/03-collectors-gpu-host/regressions.py → All 64 …, as they must.
```

---

## 11. ⚠ Invariant 7 — what the spec does not settle

### C1 — §6.7's "a `pwm5` of `999` … renders `—`" is **not reachable** in the contract

§6.6 (*"when the mode is `manual` but the duty is not a reading, render `—` and give the band
no severity"*) and §6.7 (*"a `pwm5` of `999` … becomes `null` and renders `—`"*) both
describe **`ch5Mode: 'manual'` with an unreadable duty.** `Cooling` cannot express it:
`CoolingManual.ch5Pwm` is `Pwm`, not `Pwm | null`. The only representable alternative is
minting `pwm(999)`, which HANDOVER forbids (*"a value that failed to parse is `null`, never
`rpm(NaN)`"*) and O6 forbids explicitly (*"range-check `pwm5` to 0–255 and send `null`
otherwise … −1 and 256 are `null`"*).

**Taken:** a duty that is not a reading yields `CoolingUnavailable` — `ch5Mode: null`,
`ch5Pwm: null`, `pwm5Present: true`. It is the conservative half, because the alternative
asserts a *mode* from a value the hardware cannot produce.

**Two consequences the owner should see:**

1. §6.7's stated rendering is wrong for this path: `formatCh5Pwm` returns **`unavailable`**,
   not `—`.
2. `formatCh5Pwm`'s `EM_DASH` branch, `ch5Engagement`'s `'unknown'`, and `severityFan5`'s
   `ch5Engagement === 'unknown'` branch are now **unreachable from this collector.** They
   remain reachable from unvalidated wire data (O10 is still open), so they are not dead
   code — but the state step 2 built them for is one this collector cannot produce.
   Severity-wise the two options differ: under §6.6's intent the band gets *no severity*
   (uncoloured); under the implementable form it gets the absolute row alone, so a stalled
   fan on a channel that had been driven HIGH bands **`normal`**.

**Resolution needs one of:** a fourth variant `{ ch5Mode: 'manual'; ch5Pwm: null }` on
`Cooling` (which would make §6.6 and §6.7 implementable as written, and is what they appear
to assume), **or** §6.6/§6.7 amended to say `unavailable` for an unreadable duty. Not taken
here — `lib/types.ts` is step 1's file and this is a contract change.

### C2 — no bound is specified for the `dell_smm` reads

§3.1 states 4 s for `nvidia-smi` and argues it. §3.3 says nothing, while O17 requires step 4
to impose one. `DELL_SMM_TIMEOUT_MS = 2000` is **chosen**, with the reasoning recorded at the
constant. §3.3 should gain a sentence the way §3.1 did.

### C3 — §3.7's probe table has no row for "read succeeded, text is not a number"

Rows 3–5 are "read numerically", "returned `ENODATA`", "read failed some other way". A read
that **succeeds and returns junk** (`''`, `'auto'`) is none of the three. Folded into
`unreadable` — `pwm5Present: true`, `ch5Mode: null` — **with** an `errors[]` entry, since the
file produced no reading (the `parsePackageTempC` precedent). Worth a fourth clause.

### C4 — nothing says whether `pwm5Present: false` should carry an `errors[]` entry

`lib/fixtures.ts`'s `pwm5NodeAbsent` carries one (`'no pwm5 on hwmon dell_smm'`), so the
collector emits one and matches the fixture. But §6.5's rows govern failed **reads**, and
this is a *successful* listing that found nothing — the same argument §6.7 uses to say a
rejected delta carries no entry. The practical effect: while the DKMS module is missing,
every poll's `errors[]` carries one permanent entry, which §6.4's standing-condition
machinery does not cover because that governs *conditions*, not `errors[]`.

### C5 — the RPM domain

§6.7's "an out-of-range reading carries no `errors[]` entry" is general and was applied to a
negative `fanN_input`. Whether a negative RPM should be rejected **at all** is unstated;
rejecting it is argued at `fanRpm` (an unsigned revolution count) and is the direction that
protects invariant 1. Flagged as low-risk.

### Two of step 3's open items are now ANSWERED by the current `SPEC.md`

`HANDOVER.md` was written against an older revision and still lists both as open. Whoever
rewrites it should close them:

- **G2** (*"§3.1 does not say whether an out-of-range reading carries an `errors[]` entry"*)
  — §6.7 now states it in general and **names `pwm5` of `999`** as the example. Step 3's
  conservative choice was right, and step 4 followed it.
- **O16 / G3** (*"who owns `previous` across a failed read"*) — §6.7 now says: *"The
  collector owns `previous` across a failed read … Keep the last successful sample and its
  timestamp until a newer successful sample replaces it."* That is step 6's work, and it is
  no longer a decision to be taken — it is specified.

### One toolchain drift, not a spec matter

This Mac now runs **Node v26.8.1**. `package.json` declares
`engines.node: ">=24.0.0 <25.0.0"` and HANDOVER records 24.16.0. Nothing enforces it
(`engine-strict` is off) and `pnpm verify` / `pnpm build` are both green, but the declared
range and the machine disagree. Step 11's container pins `node:24-slim`, so the deployment
target is unaffected. Raised for the owner: either widen `engines` or pin the dev Node.

---

## 12. Public surface step 5 and step 6 inherit

```ts
// The wrapper. Options object, like every other collector.
collectCooling({ io?, paths?, timeoutMs? }): Promise<CoolingCollection>
interface CoolingCollection {
  cooling: Cooling;                    // ⚠ serviceState is ALWAYS null — see §6
  pwm5Present: Safety['pwm5Present'];  // boolean | null
  errors: readonly TelemetryError[];   // every entry's source is 'dell-smm'
}
const DELL_SMM_TIMEOUT_MS = 2000;

// Pure — dell-smm.ts
DELL_SMM_NAME · FAN_CHANNELS · PWM5_FILE · PWM5_EC_AUTO_ERRNO · NO_FANS
parseDellSmmFans(files) · classifyPwm5Read(read) · errnoCodeOf(e)
pwm5PresentFrom(probe) · ch5ModeFrom(probe) · coolingFrom(fans, probe, serviceState)
withServiceState(cooling, serviceState)          // ← step 6 must call this (O9)
types: FanReadings · Pwm5Probe · Pwm5Read

// Pure — hwmon.ts, and step 5 may want it for any other node
findHwmonNode(reader, root, name) · describeHwmonMiss(miss, root, name)
types: HwmonReader · HwmonLookup · HwmonNodeFound · HwmonNodeMissing

// Moved, not new
reason(e) · tag(source, messages)                 // was private to collect.ts
```

Step 6 assembles with no adapter: `cooling` is `Cooling`, `pwm5Present` is
`Safety['pwm5Present']`, `errors` concatenates.

**Two things step 5 should reuse rather than rewrite:** `errnoCodeOf` (D-Bus and HTTP need
the same "take the code off the rejection, never the message" discipline — hoist it if a
third caller appears), and `HwmonReader` + the bounded-reader shape if any of its reads can
block.
