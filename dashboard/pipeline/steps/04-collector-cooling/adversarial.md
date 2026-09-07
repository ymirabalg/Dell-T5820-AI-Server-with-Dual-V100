# Step 4 — the cooling collector — ADVERSARIAL

## Baseline I established before touching anything

```
pnpm verify                                              → 967 tests, 16 files, exit=0
python3 pipeline/steps/02-format-severity/regressions.py  → All 40 …, as they must.  exit=0
python3 pipeline/steps/03-collectors-gpu-host/regressions.py → All 64 …, as they must. exit=0
python3 pipeline/steps/04-collector-cooling/regressions.py   → All 46 …, as they must. exit=0
```

**Every experiment below was reverted.** Method: `md5 -q` snapshot of all 22
`lib/collectors/*.ts` plus `lib/types.ts` / `lib/format.ts` before starting; each mutation
applied by script from a `.bak`, restored from the same `.bak`, and `diff` confirmed empty.
A temporary probe file `lib/collectors/zzadv.test.ts` was created and **deleted**. Final
state re-verified: the same 22 hashes, `pnpm verify` → 967 / exit=0, step 4's harness →
46/46. `git status --short` is unchanged (` M .gitignore`, `?? dashboard/`).

One thing to know while reading a step-4 phase's transcript: **the harness mutates source
files in place while it runs.** Mid-run I received a "file changed on disk" notice for
`cooling.ts` showing a bare-`Promise.race` body — that was T34 in flight, not a real edit.
Do not react to it.

---

# CONFIRMED BY EXECUTION

## A1 — HIGH — C1's resolution paints a dead GPU fan **green**, re-creating the exact defect step 2's adversarial phase found and fixed

**Claim it breaks.** build.md §11 C1 states the cost of taking `CoolingUnavailable` for an
unreadable duty as one clause: *"under the implementable form it gets the absolute row
alone, so a stalled fan on a channel that had been driven HIGH bands `normal`."* That is
true and it is buried. What it does not say is that `lib/severity.ts` already carries this,
verbatim, at `ch5Engagement`:

> ⚠ The third outcome is why this is not a boolean. A `boolean` has to fold "the duty did
> not parse" into `false` … so a stopped fan on a channel being driven HIGH bands `normal`.
> **That was a real defect in this module, found by the step-2 adversarial phase.**

Step 2 built the `'unknown'` engagement and the `severityFan5` branch that returns `null`
for it *specifically to stop this outcome*. Step 4's collector makes both unreachable and
restores the outcome by a different route. The regression is invisible to the suite because
step 2's tests feed `severityFan5` a hand-built `Cooling`, and step 4's tests never join the
collector to the severity band.

**Failure scenario — input.** `gpu-fan-control` has channel 5 at HIGH (GPU ≥ 55 °C, service
active). The hub's control lead comes off, or a shroud fan dies: `fan5_input` reads `0`.
In the same poll the `pwm5` read fails with `EIO` from the SMM call — this board's EC has
hung before and §3.3 is written around that — or returns text outside 0–255.

**Wrong output**, measured through `collectCooling` → `lib/format` → `lib/severity`:

| input | `pwm5Present` | `ch5Mode` | duty renders | fan5 renders | **cell colour** |
|---|---|---|---|---|---|
| duty 255, fan 0 (the state the guard is for) | true | manual | `HIGH pwm 255` | `0 RPM` | **alarm** ✓ |
| **duty `EIO`, fan 0** | true | null | `unavailable` | `0 RPM` | **`normal`** ✗ |
| **duty `EACCES`, fan 0** | true | null | `unavailable` | `0 RPM` | **`normal`** ✗ |
| **duty `999`, fan 0** | true | null | `unavailable` | `0 RPM` | **`normal`** ✗ |
| **duty empty, fan 0** | true | null | `unavailable` | `0 RPM` | **`normal`** ✗ |
| duty `ENODATA`, fan 0 | true | ec-auto | `EC auto` | `0 RPM` | `normal` (see G4) |
| §6.6/§6.7 as written (manual + duty `null`) | — | manual | `—` | `0 RPM` | **`null`** — uncoloured |

SAFETY says `pwm5Present: true` = pass. COOLING says green. §9's dot stays green. **A dead
fan on a channel commanded HIGH, on a box with two passively-cooled 250 W cards, produces
no colour anywhere except an affirmative green.** The difference between the shipped
`'normal'` and the spec's `null` is exactly the difference between an instrument asserting
health and an instrument declining to say — which is the distinction this whole project is
built on.

**C1's premise is real, and narrower than build.md draws it.** Confirmed structurally:
`CoolingManual.ch5Pwm` is `Pwm`, not `Pwm | null` (`lib/types.ts:415`), so
`{ ch5Mode: 'manual', ch5Pwm: null }` does not typecheck. But the `EIO`/`EACCES` rows above
are **§3.7-correct** — row 5 says a read that failed some other way is `ch5Mode: null`.
The contradiction is only for **`pwm5` read succeeded, text is not a 0–255 integer**
(`999`, `''`, `abc`, `1.5`, `-1`, `256`): §6.6 and §6.7 both say `manual` + `—` + no
severity, and the contract cannot hold it.

Also confirmed: the engagement values reachable from `collectCooling` are exactly
`{'not-engaged', 'engaged'}` — `'unknown'` is dead, as build.md says.

**What I ran.** A probe test driving `collectCooling` against a fake node over ten
duty/tach combinations, then `formatCh5Pwm` / `ch5Engagement` / `severityFan5Absolute` /
`severityFan5Engaged` / `severityFan5` on each result. Full matrix reproduced above.

**Which fix.** **A fourth `Cooling` variant, `{ ch5Mode: 'manual'; ch5Pwm: null }`** — not a
nullable field, not a spec amendment.

- It makes §6.6 and §6.7 implementable **verbatim**, which is what they plainly assume.
- It revives `ch5Engagement`'s `'unknown'` and `severityFan5`'s `null` branch — code that is
  already written, already tested, and was written for precisely this state. A spec
  amendment would instead delete a defensive branch that a prior adversarial phase earned.
- It preserves O6 (the duty that did not parse is `null`, never a minted `Pwm`).
- Nullable-`ch5Pwm`-on-`CoolingManual` is worse: it destroys the union's guarantee that
  `formatCh5Pwm` relies on and re-opens `{ ch5Mode: 'ec-auto', ch5Pwm: 255 }` by symmetry.

Scope note: `lib/types.ts` is step 1's file and this is a contract change, so it is the
owner's call, not reconciliation's — but the *severity* consequence above should be part of
the decision, and it is not in build.md.

---

## A2 — MEDIUM — O17's 2 s bound is computed from the **wall clock**, so an NTP step un-bounds it

**Claim it breaks.** `cooling.ts`'s module doc: *"One deadline for the whole probe, enforced
per read against the time remaining"*, and build.md §7's *"what the deadline guarantees is
that the request settles."* It guarantees that only while `Date.now()` is monotonic.

```ts
const deadlineAt = Date.now() + timeoutMs;      // cooling.ts:116
const left = deadlineAt - Date.now();           // cooling.ts:120
setTimeout(..., left)                           // cooling.ts:124  ← monotonic
```

`Date.now()` is wall-clock and steppable; `setTimeout` is monotonic. The deadline mixes the
two.

**Failure scenario — input.** `systemd-timesyncd` steps the clock **backward** during a
poll (first sync after boot, a VM/container resume, a leap smear ending). The probe is
mid-walk.

**Wrong output.** `left` becomes `timeoutMs + step`, and `setTimeout` is asked for it. I
instrumented `globalThis.setTimeout` and moved `Date.now` back by one hour after the first
fan read, with `timeoutMs: 50`:

```
A8 setTimeout delays requested: 50, 50, 50, 50, 50, 50, 50, 3600050, 3600050, 3600050, 3600050, 3600050
```

**A probe advertised as bounded at 2 s becomes bounded at one hour**, on a per-request route
(§4), against an EC that has hung before. This is precisely HANDOVER's *"a bounded call that
is not bounded is worse than an unbounded one, because it stops anyone asking the question."*

A **forward** step is the safe direction — `left` goes hugely negative, every read rejects
instantly, and the poll returns `pwm5Present: null` with a blank COOLING panel, self-healing
on the next poll. So the damage is asymmetric, not absent.

**This is a step-4 regression against step 3's own precedent.** `nodeIo.run` bounds with a
bare `setTimeout(timeoutMs)` and never reads a clock, so it has no such hole. Step 4
introduced the wall-clock dependency. HANDOVER already lists "a monotonic `nowMs`" as an
open item for step 6 (`netRatesBetween` and a forward NTP step); this is a second instance
of the same hazard, in the one place the spec asked for a bound.

**Fix, verified.** Replace both `Date.now()` with `performance.now()` (monotonic since
process start, `ms` resolution, no import needed). I applied it and ran
`cooling.test.ts`: **51/51 pass, no test churn.** Two-line change.

**What I ran.** A probe test that swaps `Date.now` and records every `setTimeout` delay
across a `collectCooling` call; then the `performance.now()` variant against the existing
suite. Both reverted.

---

## A3 — MEDIUM — a raw NUL byte in `dell-smm.test.ts` makes the file invisible to `grep -r` and `ripgrep`

**Claim it breaks.** Not a code claim — a claim the *method* depends on. HANDOVER §1:
*"An `ANCHOR NOT FOUND` line means the implementation moved and the mutation needs
re-aiming — it does not mean the test is fine."* The whole pipeline is anchor-on-exact-string
and every phase agent greps.

`lib/collectors/dell-smm.test.ts:338` is `ok('\x00')` written as a **raw 0x00 byte** inside
the string literal rather than the two-character escape. It is the only such byte in `lib/`
(I scanned all 24 files).

**Failure scenario — input.** A later phase asks "is `classifyPwm5Read` covered?" and runs
`grep -rn classifyPwm5Read lib/collectors/`.

**Wrong output**, measured:

| tool | result |
|---|---|
| `grep -n "classifyPwm5Read" lib/collectors/dell-smm.test.ts` | **no output, exit 1** — for 18 real occurrences |
| `grep -rn … lib/collectors/` | lists `cooling.ts`, `dell-smm.ts`, `index.ts` — **the test file is absent** |
| `rg -n … lib/collectors/` | same three files — **absent** (ripgrep skips binary silently) |
| `git grep` | finds it |
| `git diff` | **unaffected** — git's binary heuristic scans only the first 8 KB and the NUL is at offset 14022 |
| `regressions.py` | unaffected — Python `read_text()` handles it, and no mutation anchors in a test file |

So the two tools most likely to be used report the file as containing nothing, with no
"Binary file matches" note on BSD grep. A reasonable agent concludes the probe classifier is
untested. Every `describe`/`test` name in that 533-line file is equally invisible — I had to
switch to `grep -a` to read the test list at all.

**Fix.** One character: write `'\x00'` as an escape. Behaviour identical.

---

## A4 — MEDIUM-LOW — the presence oracle has no sanity floor: a successful **empty** listing produces `pwm5Present: false`, the alarm

**Claim it breaks.** build.md §5: *"`false` is produced at exactly one place, and only after
the node has been found and its directory listed"*, and *"the directory listing is the
presence oracle."* The oracle is one-sided: it accepts "not in the listing" as positive
evidence of absence, with no check that the listing said anything at all.

**Failure scenario — input.** `readDir` on the `dell_smm` node resolves with `[]` (or with
any listing that lost `pwm5` for a reason other than the module not loading).

**Wrong output**, measured:

```
A4 empty-listing  pwm5Present=false  ch5Mode=null  fan5=null  errs=1
   msg: /sys/class/hwmon/hwmon3: no `pwm5` node — the DKMS 5-fan module did not load,
        so channel 5 is uncontrollable
```

SAFETY raises **the** alarm — "GPU fan control is gone" — from a listing that told us
nothing, and COOLING shows all five fans as `—` with no error explaining any of them. §3.7
defines `false` as *"`dell_smm` was read, `pwm5` is absent"*; here nothing was read.

**Honest severity.** On a coherent filesystem this exact state is unreachable: the walk just
read `${dir}/name` from that directory, so it cannot be empty. That is why this is
MEDIUM-LOW and not the headline. But it is the *only* place §3.7's worst value is produced,
the guard costs one line, and the invariant it would encode is free: **the listing must
contain the file we already read from it.** `if (!listed.has('name')) → unlocated`, or
simply `entries.length === 0 → unlocated`. Without it, any future reader that returns a
short or filtered listing — a step-5/6 fake, a hardened runtime's synthetic `/sys` — becomes
this alarm silently.

**Related, also measured, also low:** if `pwm5` is missing from the listing but readable
(the DKMS module loading between the listing and the read), the poll reports
`pwm5Present: false`. One spurious poll, self-healing.

---

## A5 — MEDIUM-LOW — the graceful-degradation claim is tested only in its most favourable position

**Claim it breaks.** build.md §7: *"A test also proves the deadline degrades gracefully:
with a hang injected at `fan5_input`, `fan1Rpm` is still `1028`, `fan5Rpm` is `null`, and
`pwm5Present` is still `true`."* The test injects the hang at the **last** of the six file
reads — the position where the maximum is salvaged.

**Failure scenario — input.** The EC wedges on the **first** fan read instead of the last:
`fan1_input` blocks past the budget. (There is no reason the EC would prefer channel 5;
`dell-smm-hwmon` serialises all of them behind one mutex.)

**Wrong output** — nothing is salvaged, and the claim buys zero:

```
A7 present=true mode=null
   cooling = {fan1Rpm:null, fan2Rpm:null, fan3Rpm:null, fan4Rpm:null, fan5Rpm:null,
              serviceState:null, ch5Mode:null, ch5Pwm:null}   errs=6
A7 messages: …/fan1_input: timed out after 40 ms | …/fan2_input: timed out after 40 ms
           | …/fan3_input: … | …/fan4_input: … | …/fan5_input: … | …/pwm5: timed out after 40 ms
```

The behaviour is *correct* — `pwm5Present: true` is right, because the listing had already
answered — but the property being advertised is untested in the half where it does not hold.
This is HANDOVER §5's fixture-symmetry rule applied to a behavioural claim rather than a
comparison: one fixture, one side.

Secondary, low: while the EC is wedged this emits **six** near-identical `errors[]` entries
every poll, forever. §6.5 wants an error matched to the figure it explains, so six figures
arguably justify six entries — but it is worth a decision rather than a side effect.

---

## A6 — LOW — the test named "neither function can see the other's answer" asserts **arity**, and passes under the exact biconditional §3.7 forbids

**Claim it breaks.** build.md §5 sells three proof tests, the third being
*"⚠ neither function can see the other's answer — they take only the probe"*. Its body is:

```ts
expect(pwm5PresentFrom.length).toBe(1);
expect(ch5ModeFrom.length).toBe(1);
```

A function that takes one argument can call anything it likes inside. Measured:

1. I replaced `pwm5PresentFrom` with T1's forbidden biconditional
   (`return ch5ModeFrom(probe) !== null;`) and ran **only** this test:
   `Tests 1 passed | 61 skipped`. **It passes on the mutation it is named for.**
   (The suite as a whole does go red — 24 tests — but on the *counter-example* tests, which
   are the real protection. This one contributes nothing.)
2. Worse: I then wrote a **behaviour-preserving coupling** —
   `if (ch5ModeFrom(probe) !== null) return true; …` — which literally makes `pwm5Present`
   read `ch5Mode`'s answer while producing the identical total function. **The entire suite
   passed (941/941 with typecheck off)**, and the 46 regressions would too, since behaviour
   is unchanged.

So §3.7's structural rule — *"never from each other"* — is **unenforced**; only its
extensional consequence is. That matters because the coupling is invisible today and becomes
live the moment `ch5ModeFrom` changes, which A1 recommends doing (a fourth variant adds an
outcome). A test that cannot fail for any single-argument implementation should either be
deleted or given a body that matches its name (e.g. asserting the function source contains
no call to the other, which is ugly, or simply renaming it to "both are unary" and dropping
the claim).

Not a defect in shipped behaviour — the independence *is* correct as written. A lying test
name, which on this project is the recurring finding of three consecutive steps.

---

## A7 — LOW — `timeoutMs` above 2³¹−1, `Infinity`, or `NaN` silently becomes a **1 ms** budget

`setTimeout` clamps a delay outside the 32-bit signed range to 1 ms and prints
`TimeoutOverflowWarning` / `TimeoutNaNWarning` to stderr. `within()` guards `left <= 0` but
nothing guards the top.

**Scenario.** Step 6, or an operator debugging a wedged EC, passes
`timeoutMs: Number.POSITIVE_INFINITY` meaning "do not bound this".

**Wrong output**, measured:

```
A6 timeoutMs=2147483648   elapsed=1ms  present=null mode=null errs=1
A6 timeoutMs=2147483649   elapsed=1ms  present=null mode=null errs=1
A6 timeoutMs=Infinity     elapsed=1ms  present=null mode=null errs=1
A6 timeoutMs=NaN          elapsed=2ms  present=null mode=null errs=1
```

The opposite of the intent: the whole probe times out, COOLING goes permanently blank and
SAFETY reports `pwm5Present: null` on every poll. The direction is safe (unknown, never the
alarm) and Node does warn on stderr, but nothing in the code or the tests says so, and there
is **no fixture on either side of 2³¹−1**. `DELL_SMM_TIMEOUT_MS = 2000` is nowhere near it,
so this is only a hazard for a caller who overrides.

---

## A8 — LOW — two guards with no fixture on one or both sides (fixture-symmetry sweep)

I enumerated every comparison in `hwmon.ts`, `dell-smm.ts`, `cooling.ts`, `errors.ts` and
checked each for a fixture on both sides. **The sweep is overwhelmingly clean** — see the
"found sound" section. Three exceptions:

| guard | file:line | below | above | verdict |
|---|---|---|---|---|
| `left <= 0` | `cooling.ts:121` | — | — | **neither side fixtured.** No test drives the remaining budget to exactly 0. T33 mutates the *expression*, not the comparison, so `<= 0` → `< 0` passes everything. Behaviourally near-identical; bookkeeping only |
| `value < 0` | `dell-smm.ts:131` | `-1` ✓ | `0` ✓ | both sides present, but **`-0` is untested** and takes the *readable* branch |
| `read.code === PWM5_EC_AUTO_ERRNO` | `dell-smm.ts:250` | ✓ | ✓ | exact-equality untested against a near-miss code. A mutation to `.includes()` / case-insensitive compare would pass everything |

The `-0` behaviour, measured: `pwm5` reading `'-0'` classifies as `manual` and renders
**`OFF pwm -0`**; `fanN_input` reading `'-0'` yields `rpm(-0)` and renders `0 RPM`
(harmless — `Intl` drops the sign). `dell-smm-hwmon` prints these with `%d` and never emits
`-0`, so this is not reachable from the driver. Recorded because it is exactly the value
that sits *on* a `< 0` boundary and JS treats specially.

---

## A9 — LOW — `pwm5` present with `fan5_input` absent loses a channel with **no** `errors[]` entry

Measured: `A4 pwm5-no-fan5  present=true  mode=ec-auto  fan5=—  errs=0`.

`fanRpm` returns `null` with no problem when the file is absent, justified at the call site
as *"on the stock 4-fan driver there is no `fan5_input`, and that state is already reported
once, by `pwm5Present: false`."* In this combination `pwm5Present` is `true`, so it is
**not** reported anywhere: channel 5 shows `—` with no explanation, which §6.5 says a failed
figure must never do (*"its `errors` entry is available"*).

Unreachable on this board — the DKMS patch raises `DELL_SMM_NO_FANS` to 5, adding
`fan5_input` and `pwm5` together — so the risk is that steps 9/10 render an unexplained em
dash if a future driver ever splits them. The comment's premise, not its conclusion, is what
is wrong.

---

## A10 — LOW — `pwm5` vanishing between the listing and the read reports `pwm5Present: true`

Measured: `A4 pwm5-ENOENT-on-read  present=true  mode=null`. §3.7's table has no row for
`ENOENT` on the read. Folding it into `unreadable` is the safe direction (a missed alarm for
one poll, not a false one) and self-heals on the next listing. Worth a clause alongside C3
rather than a change.

---

# ATTACKED AND FOUND SOUND

State this plainly, because it is the most important result: **I could not construct any
input that produces `pwm5Present: false` from something merely unreadable.** Invariant 1
inverted on the SAFETY panel is not present.

**Errno enumeration through `collectCooling`** — `ENODATA`, `EACCES`, `EIO`, `EBUSY`,
`ENOENT`, `EINVAL`, `ENXIO`, `EOPNOTSUPP`, `EPERM`, `ETIMEDOUT`, a rejection with **no**
`code`, a rejection that is not an `Error`, plus the near-misses `'enodata'` and
`'ENODATA '`: every one yields `pwm5Present: true`. Only exact `'ENODATA'` yields
`ch5Mode: 'ec-auto'` with **zero** `errors[]` entries (invariant 3); every other yields
`ch5Mode: null` with exactly one entry. `ENODATA` on `open()` rather than `read()` is
indistinguishable through `readFile` and lands on the same branch either way, so the
distinction is immaterial.

**`pwm5` text values** — `0` and `255` are readings (`OFF pwm 0`, `HIGH pwm 255`); `-1`,
`256`, `999` are `unreadable` with **no** entry (§6.7); `''`, `'   '`, `'auto'`, `'1.5'`,
`'0xff'`, and a 20-digit integer are `unreadable` **with** an entry (C3). `'+255'` and
`'007'` parse. All → `pwm5Present: true`.

**Fan parsing.** `0` survives as `rpm(0)` → `0 RPM`, no entry. Unreadable (`''`, `'   '`,
`'abc'`) → `null` **with** an entry. Negative → `null`, **no** entry. `5100` → `normal`,
`5101` → `alarm`, and **`14451` reaches §6.3's absolute alarm end to end** — including when
the duty is unreadable (`abs=alarm`, `CELL=alarm`), which is the unconditional-row
requirement holding.

**The hwmon walk.** Exact match on `name`; trailing newline and trailing space both trimmed
and matched; `dell_smm_hwmon`, `dell_sm`, `DELL_SMM`, `dell_smm\nextra` and an empty `name`
all correctly non-matching → `pwm5Present: null`. Root ENOENT, root EACCES, root empty, and
**every `name` unreadable** → all `null`, never `false`, with three distinguishable §6.5
messages. Two nodes named `dell_smm`: the first wins (note `fs.readdir` order is not sorted,
so "deterministically" is true of the fake rather than of sysfs — immaterial, only one
`dell_smm` exists).

**The container-mount case is the one that matters and it holds.** Verified read-only on
`ai-server`: every entry in `/sys/class/hwmon` is a **symlink** into `/sys/devices/...`. So
a step-11 `-v` that binds only `/sys/class/hwmon` instead of `/sys` gives a successful
`readDir` and four dangling symlinks — which is exactly my "all names unreadable" case:
`indeterminate` → `unlocated` → **`pwm5Present: null`**, with the message *"…and 4 of 4
node(s) could not be identified"*. That is the scenario §3.7 was written to protect and it
is correct.

**The task's premise about missing-vs-empty `/sys/class/hwmon` is not right.** §3.7 lists
*"`/sys` not mounted, no `dell_smm` hwmon, `EACCES`"* **together** under `null`. Missing root
→ `root-unreadable`; present-but-empty → `absent` (`scanned: 0`); both → `pwm5Present: null`
with different §6.5 messages. Same value, different prose — which is what `hwmon.ts`'s own
doc table says, and it is correct.

**The bounding tests genuinely bite** — I checked each by applying its mutation and running
the single named test:

| test | mutation | result |
|---|---|---|
| "an abandoned read that rejects later is not an unhandled rejection" | bare race, loser unsubscribed | **red** — the listener sees `the EC finally gave up` |
| "the reads are SEQUENTIAL — one SMM call in flight at a time" | fan loop → `Promise.all` | **red** |
| "the budget is shared, not per-read" | `deadlineAt - Date.now()` → `timeoutMs` | **red** |

So build.md §7's three bounding claims are all backed by tests capable of failing. Step 3's
"a timeout that never bounds anything" pattern is **not** repeated here — the deadline is
real (A2 is about *which clock*, not about whether it fires).

**Item 8 — the two rewritten regressions bite on real assertions.** Confirmed from the
harness output:

- **T40** now fails two genuine `describeHwmonMiss` assertions
  (`Tests 2 failed | 15 passed`, `FAIL … ⚠ absence and indeterminacy read differently`) —
  not a compile error.
- The four replacements for T41/T43 all produce **real assignability errors**, not `TS6196`:
  `T41b → TS2322 Type 'string' is not assignable to 'boolean | null'`;
  `T42 → TS2322` on `FanReadings`; `T43 → TS2322 Type 'number' is not assignable to 'Rpm'`;
  `T43b → TS2345 '"running"' is not assignable to 'UnitState | null'`;
  `T44 → TS2322` on the `CoolingEcAuto` variant. Plus the runtime `T41` (`?? false`) turning
  11 tests red. The claim is verified.

**Item 7 — Node 26 vs the declared 24, judged.** `~/.local/bin/node` is **v26.8.1** and
shadows nvm's v24.16.0 under the standard `PATH` export; `engines` says `>=24.0.0 <25.0.0`.
**Nothing enforces it**: no `.npmrc` in the project, no `engine-strict`, no `.nvmrc` or
`.node-version`, and `packageManager` pins pnpm only. So every step so far was tested on a
Node the manifest forbids, and step 11's `node:24-slim` is the *only* thing keeping the
declaration honest.

I checked the one place it could have bitten step 4 — the single most load-bearing runtime
assumption in this step, that Linux errno 61 surfaces as `code: 'ENODATA'` and not
`'UNKNOWN'`, which build.md verified only against "libuv 1.52 (this toolchain)" on Node 26:

```
node v26.8.1  uv 1.52.1   ENODATA entries: [[-96,["ENODATA","no data available"]]]
node v24.16.0 uv 1.52.1   ENODATA entries: [[-96,["ENODATA","no data available"]]]
```

**Both ship libuv 1.52.1 and both map `ENODATA`**, so the assumption holds on the deployment
Node. Risk judged **low but real**: the exposure is not this step, it is that the shadowing
is silent and permanent, so a genuine 24-vs-26 divergence in a later step (step 7's argon2id
native build, step 11's container) would be found in the container rather than on the desk.
Cheapest fixes, in order: add `.nvmrc`/`.node-version` with `24`; set `engine-strict=true`
in a project `.npmrc` so `pnpm install` refuses; or widen `engines` and say so.

---

# SPEC GAPS (invariant 7) — adjudicating C2–C5, plus one new

| # | Verdict |
|---|---|
| **C1** | **Real, and understated.** See A1. §6.6/§6.7 describe a state `Cooling` cannot hold. Recommend the **fourth variant**, not a spec amendment — the amendment would delete a branch step 2's adversarial phase earned |
| **C2** | **Real.** §3.1 bounds `nvidia-smi` at 4 s and argues it; §3.3 says nothing while O17 requires a bound. `DELL_SMM_TIMEOUT_MS = 2000` is chosen and documented. **A2 sharpens the ask:** the sentence §3.3 gains should require the bound to be **monotonic**, not merely to exist |
| **C3** | **Real.** §3.7 rows 3–5 do not cover "read succeeded, text is not a number". `unreadable` + an `errors[]` entry is right (the `parsePackageTempC` precedent, and §6.7 reserves "no entry" for a *successful read of an impossible value* — junk is not that). A10 adds a second missing clause: `ENOENT` on the read after a listing that had `pwm5` |
| **C4** | **Real, low.** `pwm5NodeAbsent` already decided it by fixture. The noted cost — one permanent `errors[]` entry per poll while the module is missing — is correct and acceptable; §6.4's standing-condition machinery governs *conditions*, and this is the only signal the panel has for "why is fan5 blank" |
| **C5** | **Real, low.** Rejecting a negative RPM is the direction that protects invariant 1 and it carries no entry per §6.7. Add `-0` to the note (A8) |
| **G4 — NEW** | **§6.3 gives `fan5Rpm: 0` the band `normal` in every mode except engaged-manual.** Measured: with `ch5Mode: 'ec-auto'` — **the box's normal state below `AUTO_BELOW=55`** — a fan reading `0` renders `0 RPM` and bands `normal`. §6.3 says so deliberately (*"In `ec-auto`, and whenever `ch5Mode` is `null`, the only rule that applies is the absolute one"*), because the engaged band's 3000 RPM floor would permanently alarm at EC auto's healthy ~2210. But `0` specifically is unambiguous on a channel with a fan attached. Together with A1 this means **a dead channel-5 fan is only ever red while the channel is engaged.** Not step 4's to fix — `lib/severity.ts` is step 2's and the threshold is the spec's — but it is the same class as C1 and the two should be decided together. A `fan5 == 0` clause on the absolute row would close both |

**Two of step 3's items that build.md says are now answered — I agree.** §6.7 as it stands
does state the out-of-range/no-entry rule generally and does name `pwm5` of `999`
(closing **G2**), and does say the collector owns `previous` across a failed read
(closing **O16/G3**). HANDOVER should be updated rather than carrying them as open.

---

# Ranked summary

| # | Severity | One line |
|---|---|---|
| **A1** | **HIGH** | C1's resolution bands a dead GPU fan `normal` (green), re-creating the defect step 2's adversarial phase fixed. Fix: a fourth `Cooling` variant |
| **A2** | MEDIUM | O17's deadline is wall-clock, so a backward NTP step turns a 2 s bound into an hour. Fix verified: `performance.now()`, 51/51 unchanged |
| **A3** | MEDIUM | A raw NUL byte at `dell-smm.test.ts:338` hides the file from `grep -r` and `rg` entirely. One-character fix |
| **A4** | MED-LOW | The presence oracle has no sanity floor — a successful empty listing produces the "GPU fan control is gone" alarm |
| **A5** | MED-LOW | The graceful-degradation claim is tested only with the hang in the last position; in the first position it salvages nothing |
| **A6** | LOW | "neither function can see the other's answer" asserts arity and passes under the forbidden biconditional; a behaviour-preserving coupling passes the whole suite |
| **A7** | LOW | `timeoutMs` ≥ 2³¹ / `Infinity` / `NaN` silently becomes a 1 ms budget |
| **A8** | LOW | `left <= 0` unfixtured on both sides; `-0` unfixtured on the RPM floor; the `ENODATA` equality untested against a near-miss code |
| **A9** | LOW | `pwm5` present + `fan5_input` absent loses a channel with no `errors[]` entry; the comment's premise fails in that combination |
| **A10** | LOW | `ENOENT` on the `pwm5` read, after a listing that had it, reports `pwm5Present: true`; no §3.7 row |

**Nothing was fixed and no source file was edited.** All experiments reverted and
re-verified: 22 collector-file hashes unchanged, `pnpm verify` → 967 / exit=0, harnesses
40 / 64 / 46 all biting, `git status --short` unchanged.
