# Step 2 — Format & severity core — ADVERSARIAL

I edited no source. Three experiments mutated a file, ran a suite, and restored it; each is
named at its finding and each restoration is verified below. One temporary probe file,
`lib/__adv_probe.test.ts`, was created, run, and **deleted**.

**State of the tree when I finished:**

```
$ md5 -q lib/format.ts lib/severity.ts lib/throttle.ts lib/conditions.ts | diff - md5.before
STEP-2 SOURCES IDENTICAL
$ ls lib/          # no __adv_probe.test.ts
$ pnpm verify
 Test Files  7 passed (7)
      Tests  484 passed (484)
Type Errors  no errors
VERIFY_EXIT=0
```

`lib/types.ts` was mutated once (finding **A5**) and the mutating script asserted
`p.read_text() == orig` → `True` on restore.

**Baseline re-run.** `python3 pipeline/steps/02-format-severity/regressions.py` → exit 0,
"All 16 regressions failed the suite, as they must." Every R1–R15 bit, with the tallies
build.md §8 records. That baseline is what let me find **A1**: R12 does not test what it
claims to.

---

# Confirmed by execution

## A1 · HIGH — the sticky `changed` rule, this step's flagship §6.4 claim, is pinned by no test. R12 is a straw man.

**Claim it breaks.** build.md §6: "`changed` is **sticky**: `alarm → normal → alarm` sets
it, so the regression banners… that is regression R12 below." And §8's R12 row: "`changed`
compared with the first severity instead of sticky → 1 failed | 42 passed".

**What I ran.** Replaced the sticky fold with the *non-sticky* one — the natural wrong
implementation, "differs from the previous poll" — and ran the suite:

```python
old = "        changed: prev.changed || prev.lastSeverity !== severity,"
new = "        changed: prev.lastSeverity !== severity,"
```

```
conditions.test.ts exit = 0    Tests  43 passed (43)
conditions.ts restored identical: True
```

**All 43 tests pass with stickiness removed.** R12's mutation (`prev.firstSeverity !==
severity`) is a *different* error, and the one test that catches it — "§6.4 verbatim: it
clears and later REGRESSES", the only test that bites R12 at all — uses the sequence
`['alarm','normal','alarm']`, whose final step compares `normal` against `alarm` and so
reports `changed === true` under **both** implementations. The suite never observes a
fourth poll, which is the only place the two differ.

**Concrete failure scenario.** `STANDING=ufw_enforcing`. ufw is fixed (`alarm → normal`),
then regresses (`normal → alarm`) — §6.4's named case. Polls, with the non-sticky
implementation the suite accepts, measured from the probe:

| poll | severity | `changed` | `banner` |
|---|---|---|---|
| 1 | alarm | false | false (suppressed — correct) |
| 2 | normal | true | — |
| 3 | alarm | true | **true** — banner fires, correct |
| 4 | alarm | **false** | **false** — banner vanishes |

```
after alarm,normal,alarm,alarm  changed = false
  suppressed = true  banner = false
```

Against the shipped implementation the same sequence gives `changed = true`,
`suppressed = false`, `banner = true`. So the shipped code is right; **the suite does not
know it.** At a 5 s cadence the regression banner would be on screen for five seconds and
then be silently re-suppressed for the rest of the session, on the one condition §6.4 calls
out by name. Green throughout.

**The missing test, in one line:**
`expect(ledgerWith('ufw_enforcing', ['alarm','normal','alarm','alarm']).get('ufw_enforcing')?.changed).toBe(true)`
— and the matching regression `R12b` in `regressions.py` dropping `prev.changed ||`.

---

## A2 · HIGH — the ledger is fed undebounced severities, so a one-poll flicker permanently converts a standing condition into a permanent banner. §6.4's two mechanisms are built but not composed.

**Claim it breaks.** §6.4: "A metric must hold a new band for **10 seconds of wall time**
before it **logs or banners** — not for a number of polls… while a 79→80→79 flicker stays
quiet." Un-suppressing a standing condition *is* banner behaviour, and `observeSeverity`
reads a raw per-poll severity with no reference to `BandHold` at all.

**What I ran.** Probe test H drove both machines over the identical severity sequence
`alarm, alarm, watch, alarm, alarm, alarm` at a 1 s cadence, with
`STANDING=gpu_temp:0`:

```
poll 0 sev=alarm  changed=false suppressed=true  display=watch  banner=false
poll 1 sev=alarm  changed=false suppressed=true  display=watch  banner=false
poll 2 sev=watch  changed=true  suppressed=false display=watch  banner=false
poll 3 sev=alarm  changed=true  suppressed=false display=alarm  banner=true
poll 4 sev=alarm  changed=true  suppressed=false display=alarm  banner=true
poll 5 sev=alarm  changed=true  suppressed=false display=alarm  banner=true

-- the debounce machine on the same sequence --
poll 2 sev=watch  confirmed=alarm      <- never leaves the confirmed band
poll 5 sev=alarm  confirmed=alarm
```

The two mechanisms in the same 336-line module reach **opposite conclusions about the same
single-poll event**, and nothing in `conditions.ts`, in build.md, or in the tests says which
one step 8 must feed the ledger from. `conditions.test.ts`'s own
`observeConditions(ledger, [gpuTemp('0','alarm'), gpuTemp('1','normal')])` models the
undebounced composition, so the tests endorse the wrong one.

**Concrete failure scenario.** GPU 0 sitting at the 79/80 °C knee — the exact reading §6.4
uses as its example, and a plausible one here (measured worst case 75.3 °C, single-GPU
plateau 74.2 °C, and §6.3's watch/alarm edge is 80). Declare `gpu_temp:0` standing during a
known hot run. One poll reads 79 °C. From that poll to the end of the session the condition
is un-suppressed and pins the banner permanently — which is precisely "a banner that is
always there is a banner nobody reads", the failure §6.4's standing mechanism exists to
prevent, produced *by* the standing mechanism.

The fix is a contract, not code in this step: `observeConditions` must be documented (and,
better, typed) to take **confirmed** bands out of `stepBandHold`, never raw per-poll
severities — and the test that models the raw composition should be changed. Whichever way
the reviewer rules, it must be written down before step 8 assembles `Condition[]`.

---

## A3 · MEDIUM-HIGH — `formatCh5Pwm` and `isCh5Engaged` bypass the module's non-finite backstop. A stalled fan at HIGH reads `normal`, and the panel labels it `OFF`.

**Claim it breaks.** build.md §10, stated as module-wide: "**Non-finite readings render
`—`.** … `readable()` requires `Number.isFinite`, so `NaN`/`±Infinity` render like `null`."
And: "**`-0` is normalised to `0`.**" `formatCh5Pwm` calls `INTEGER.format(cooling.ch5Pwm)`
directly, never through `render()`, and `isCh5Engaged` has no finite guard on the PWM even
though `severityFan5` has one on the RPM.

**What I ran** (probe B and the fan5 matrix, probe A):

```
pwm      NaN -> state OFF  render "OFF pwm NaN"
pwm Infinity -> state HIGH render "HIGH pwm ∞"
pwm -Infinity -> state OFF render "OFF pwm -∞"
pwm        0 -> state OFF  render "OFF pwm -0"      <- -0 not normalised here
pwm     1000 -> state HIGH render "HIGH pwm 1,000"  <- out of the 0–255 range

mode              engaged |       0    2210    3000    3499    3500    5100    5101   14451
manual pwm 192   true   |   alarm   alarm   watch   watch  normal  normal   alarm   alarm
manual pwm NaN  false   |  normal  normal  normal  normal  normal  normal   alarm   alarm
manual pwm Inf   true   |   alarm   alarm   watch   watch  normal  normal   alarm   alarm
```

**Concrete failure scenario.** Step 4's collector reads `pwm5`, the value fails to parse to
a finite number (a truncated sysfs read, a `Number()` on unexpected text), and it is handed
on as `pwm(NaN)` rather than as `null` — which the contract permits: HANDOVER §3 states in
bold that "the constructors name a unit; they do not validate one", and `CoolingManual`
requires the `Pwm` to be non-`null`, not finite. The service is driving channel 5 HIGH; the
fan hub has failed and `fan5_input` reads **0 RPM**.

- COOLING panel prints **`OFF pwm NaN`** — asserting the channel is off when it is at HIGH.
- `severityFan5` returns **`normal`** — because `isCh5Engaged` is false, so §6.3's engaged
  band is skipped and only the absolute rule (`> 5100`) applies to a stopped fan.

That is the failure the prompt names: a genuinely stalled fan during engagement producing
`normal`, on a box with two passively-cooled 250 W cards. The mirror-image case is present
too: `pwm(Infinity)` is engaged and renders `HIGH pwm ∞`.

Note this is not purely hypothetical-input territory: `Number('')` is `0`, so a collector
that reads an empty `pwm5` and does not guard produces `ch5Pwm: 0` — a *finite* value that
disengages the band identically and renders the plausible-looking `OFF pwm 0`. The engaged
band's whole correctness rests on one unvalidated number, and that number is the only field
in this step that reaches `Intl.NumberFormat` without passing `readable()`.

---

## A4 · MEDIUM-HIGH — §9's aggregate is half-built, and the missing half is the alarm **count**. Unrecorded.

**Claim it breaks.** build.md §4's row "Aggregate (§9) | `worstSeverity`, `SEVERITY_RANK`",
and §2's "`worstSeverity(...)` … §9's dot". §9 actually says: "Worst severity across every
panel, **alarms counted before warnings**. Paused/stale is a mode shown alongside it, never
instead of it", because "a mode that hid the alarm count would be a lying dashboard". §6.2
spells the rendering: `❙❙ paused · 6 alarms` and `⊘ stale · 6 alarms`.

`worstSeverity` computes the maximum. **There is no count anywhere in step 2**, and the only
candidate, `bannerConditions(...).length`, deliberately excludes suppressed standing alarms.
Nor is there a ruling on whether the dot reduces `severity` or `displaySeverity`.

**What I ran** (probe G), one standing `ufw_enforcing` alarm — today's real configuration:

```
one standing alarm -> worst of DISPLAY severities: watch
one standing alarm -> worst of TRUE severities   : alarm
banner count                                     : 0
```

**Concrete failure scenario.** The box as it is today: ufw not enforcing, declared standing.
A step-10 implementer wires the header to `bannerConditions().length` (the only counting
function step 2 exports) and to `displaySeverity` (the only severity marked "what to
display"). The user pauses the dashboard and the header reads **`❙❙ paused · 0 alarms`**
with a watch-coloured dot, while an alarm-severity condition is live and named as such three
panels down in SAFETY. That is §9's own definition of a lying dashboard, produced by
following step 2's API.

The other choice — count `severity === 'alarm'` — makes the header read `1 alarm`
permanently, which is the banner-nobody-reads failure moved to the header.

**§6.4 and §9 genuinely do not settle this**, so invariant 7 applies: it is a gap to record,
and build.md §9 does not record it. It also has to be settled *here*, because the count and
the dot are the same reduction and step 10 will otherwise pick one silently.

---

## A5 · MEDIUM-HIGH — G13 confirmed, blocking, and the stale count is repeated in HANDOVER §3 as fact.

**Confirmed both halves.**

- §3.7 lists **18** `errors[].source` names. `lib/types.ts:211-228` has **17**;
  `net-operstate` is absent. §3.7 spends a paragraph on why it must be separate: folding it
  into `proc-net-dev` "would attribute a failed link read to the byte counters and point the
  UI at the wrong figure".
- `lib/types.test-d.ts:505-526` pins the union with `Assert<Equals<ErrorSource, …>>` over
  the 17-member list.

**What I ran** — added `| 'net-operstate'` to `lib/types.ts` **only**:

```
G13 experiment: adding net-operstate to types.ts ONLY -> pnpm verify exit = 1
    lib/types.test-d.ts(506,9): error TS2344: Type 'false' does not satisfy the constraint 'true'.
types.ts restored identical: True
```

**Adjudication: genuine, and it blocks step 6.** §3.5 collects `eno1`'s operstate from
sysfs; step 5 reads it; step 6 populates `errors[].source` from the closed set. The first
failed operstate read leaves step 6 with two options, both defects: spell it `proc-net-dev`
(the misattribution §3.7 forbids by name) or fail to compile. It is not merely cosmetic.

**Is step 2's reconciliation the right owner?** Yes, with one caveat.

- The change is two coordinated lines in two step-1 files. Splitting it across steps means
  step 6's agent editing the contract and its type test with less context than the agent who
  found the drift.
- PLAN's reconciliation row forbids *adding scope*, not applying a finding; this is a
  spec-conformance defect the adversarial phase raised, which is exactly what that phase is
  ordered to produce.
- **The caveat is the more dangerous half and build.md does not mention it.** HANDOVER §3's
  vocabulary table states `ErrorSource` as "the 17 names in §3.7". Every later agent reads
  HANDOVER as fact. If the reconciliation fixes the code and leaves that row, the next agent
  to check the contract against the handover will "correct" it back. The reconciliation must
  update `HANDOVER.md` §3 in the same pass, or the fix does not stick.

---

## A6 · MEDIUM — swap's 2 dp defeats the purpose §6.6 states for it. Unrecorded gap.

**Claim it breaks.** §6.6, swap row: "2 dp — **small values must not round to `0.0`**". That
parenthetical is the spec stating its own aim, and §3.2 backs it: "Any swap in use is
notable on this box."

**What I ran** (probe C):

```
swap       0 GiB -> "0.00 GiB"
swap  0.0001 GiB -> "0.00 GiB"
swap   0.004 GiB -> "0.00 GiB"
swap   0.005 GiB -> "0.01 GiB"
0.004 GiB == 4.1 MiB of swap in use; identical string to zero swap? true
```

**Concrete failure scenario.** 4 MiB of swap is in use — a real, notable event on a box
configured with 2 × 12 GiB of host RAM prompt cache and 8 GiB of swap. The RAM panel prints
**`0.00 GiB`**, character-for-character identical to a box with no swap in use at all, and
`severitySwap(gib(0.004))` returns `normal`. The rule fixed the 1 dp version of this problem
and moved the cliff from 0.05 GiB to 0.005 GiB rather than removing it.

This is not an implementation defect — the code does exactly what §6.6 says. It is the
class the prompt asked for: **the spec's wording is satisfied while the purpose the spec
states for that wording is defeated**, which invariant 7 makes a defect to report. build.md
§9 records fifteen other gaps and not this one, and the two-laws test suite pins
`formatSwapGiB(gib(0.02)) !== formatSwapGiB(gib(0))` — one order of magnitude above the
cliff — which reads as coverage of exactly the property that fails.

Options for the reviewer, none of which step 2 may take unasked: a significant-figures
format for swap; a `< 0.01 GiB` floor string; or §6.6 gaining "and any non-zero swap renders
distinguishably from zero".

---

## A7 · MEDIUM — the `-0` normalisation does not do what its comment says. Any small negative renders `-0.0`.

**Claim it breaks.** `format.ts:78` and build.md §10: "`-0` is normalised to `0`:
`Intl.NumberFormat` renders negative zero as `-0`, and a fan reading `-0 RPM` looks like a
different fault from one reading `0 RPM`." The guard is `v === 0 ? 0 : v`, which catches only
an *exact* `-0` and runs **before** rounding.

**What I ran** (probe D):

```
formatCelsius(-0.4)    -0 °C
formatWatts(-0.04)     -0.0 W
formatGiB(-0.04)       -0.0 GiB
formatSwapGiB(-0.004)  -0.00 GiB
formatPercent(-0.04)   -0.0 %
formatRpm(-0)           0 RPM       <- the only case the guard actually catches
```

**Concrete failure scenario.** §6.7: "`cpuPct` and network rates are deltas and need two
samples." A `/proc/stat` delta that comes out fractionally negative — jiffy accounting across
a counter update, an NTP step, a CPU hot-unplug — produces `percent(-0.04)`, and the CPU
panel prints **`-0.0 %`**. A reader sees a negative utilisation and cannot tell whether the
figure is a rounding artefact or a broken collector; §6.6 contemplates two renderings for a
number and this is neither. The value the guard *was written for* (`-0` exactly) is the least
likely of the family to arrive; every arithmetic path that can produce `-0` can more easily
produce `-1e-9`.

Cheapest correct form is to normalise the **rounded** value rather than the input, or to
have the collector clamp. Either way the current guard's comment overstates what it does,
and a later agent reading it will believe the class is handled.

---

## A9 · LOW-MEDIUM — a `STANDING` entry with a valid kind and a bogus subject is silently accepted, matches nothing, and is **not** reported as unknown.

**Claim it breaks.** `conditions.ts:119-125`, on `StandingIds.unknown`: "a mistyped id
silently suppressing nothing is the *safe* failure, but it must still be visible, or an
operator believes a condition is standing when it is not." `parseStandingIds` validates only
the part before the first `:`.

**What I ran** (probe J):

```
STANDING="ufw_enforcing:yes"   -> ids=["ufw_enforcing:yes"]  unknown=[]
STANDING="ufw_enforcing:"      -> ids=["ufw_enforcing:"]     unknown=[]
STANDING="pwm5_present:true"   -> ids=["pwm5_present:true"]  unknown=[]
ufw declared as "ufw_enforcing:yes" -> declaredStanding=false banner=true (unknown=[])
```

**Concrete failure scenario.** An operator writes `STANDING=ufw_enforcing:yes` in
`/etc/ai-dashboard.env` — a natural mistake, since every other line of an env file is
`KEY=value` and `ufw_enforcing` reads like a key. `ufw_enforcing` is a singleton condition
whose id has no subject, so nothing matches, the ufw alarm banners permanently, and
`unknown` is **empty** so no UI surface can tell the operator why. The one guard rail built
against this exact mistake does not fire, because the typo is in the half of the id the
parser never checks.

Two `ConditionKind`s are singletons today (`ufw_enforcing`, `pwm5_present`) and are exactly
the ones an operator will type.

---

## A10 · LOW-MEDIUM — `STANDING=unit` silences `gpu-fan-control.service`, the hazard G11 exists to prevent.

**Claim it breaks.** G10/G11: the `kind:subject` extension was introduced because "§6.3's
single 'Any unit' row means declaring a known-dead `llama-server@1` standing would also
silence `gpu-fan-control.service` — the one unit whose failure puts the cards on the EC's
curve." `applyStanding` then matches `standing.has(c.id) || standing.has(c.kind)`, so the
bare kind is still a legal, silently-accepted entry.

**What I ran** (probe J):

```
STANDING="unit" silences gpu-fan-control too -> suppressed=true banner=false
```

**Concrete failure scenario.** `STANDING=unit` in `/etc/ai-dashboard.env`, written by
someone who wanted `llama-server@1` quiet and read `unit` as the id for it (§6.4 gives one
example id and it is a bare kind, so a bare kind looks like the normal form).
`gpu-fan-control.service` then fails after a kernel upgrade — the documented DKMS failure —
and the SAFETY row shows watch with no banner, on the panel §6.2 calls "the panel that earns
the dashboard's existence", while both V100s sit on an EC curve measured to ignore GPU
temperature entirely.

Kind-level matching is a reasonable feature for `gpu_temp`; it is not obviously reasonable
for `unit`. Whatever ratification G10/G11 gets must cover *both* halves, and the safe form is
probably to reject a bare `unit` and require a subject.

---

## A12 · LOW — `logOncePerSession` is a policy label that reads like an instruction, and it is `true` on every poll.

`DisplayedCondition.logOncePerSession` is `=== suppressed`, recomputed each call, with no
state saying whether the log has happened. §6.4's requirement — "logs once per session" — is
therefore entirely step 8's to implement, while the field name suggests step 2 handles it. A
step-8 implementer writing `if (d.logOncePerSession) log(d)` on each snapshot produces a log
line every poll: the exact inverse of the rule. Rename to `logPolicy: 'once-per-session'`, or
document the field as a policy and not a trigger.

## A13 · LOW — dead branch. `severity.ts:202`, `worstSeverity(absolute, engaged) ?? 'normal'`: both arguments are non-`null` `Severity`, so the `??` can never fire. It reads as a defended case and is not one.

## A14 · LOW — `stepBandHold` breaks its own identity contract on a backwards clock. Probe L: `stepBandHold(startBandHold('normal', 100_000), 'normal', 50_000) === hold` is **false**, because the clock-backwards branch is tested before `Object.is(pending, confirmed)` and returns a fresh object though nothing moved. The doc promises "returned **unchanged by identity** when nothing moved, so step 8 and step 10 can compare with `===`". Consequence is a spurious re-render, not a wrong band.

## A15 · LOW — the two-law fixture sweep, described as "the strongest single test in the step", omits the SERVING panel. The 24 numeric + 3 text figures cover GPU, host, cooling, storage and network but no `serving` field: `formatTokens(ctx)`, `formatText(model)`, and `port` are never swept, and `servingIdentityOnly` — the fixture step 1 built for "known only by its env filename; every other field `null`" — is imported by neither `format.test.ts` nor `severity.test.ts`. It is the single best law-1 fixture in the project and no step-2 test uses it.

## A16 · LOW — `formatBytesPerSecond(bytesPerSecond(0.4))` → `0.00040 KB/s`. Two significant figures as specified, five characters of them. Cosmetic; a `< 0.01 KB/s` floor or a bytes-per-second unit below 1 KB/s would read better. Not a defect against §6.6.

---

# Reasoned, not verified against hardware

## A8 · MEDIUM — `notable` will put a permanent throttle chip on an idle GPU card.

`ThrottleDecode.notable` is `(mask & ~0x4) !== 0n`, a literal transcription of §6.2
("Throttle reasons appear only when something other than `0x4` is active"). But §3.7's table
marks **four** bits neutral — `0x1 gpu idle`, `0x2 applications clocks setting`, `0x4 sw
power cap`, `0x100 display clock setting` — and only `0x4` is excluded.

Measured behaviour (probe F): `decode('0x1')` → `notable: true`, severity `normal`, no note.

`clocks_throttle_reasons.gpu_idle` is set by NVML whenever the card is idle, which is the
dashboard's *default* state: two `llama-server` instances holding weights resident and
generating nothing between requests. If that bit is set at idle here, the GPU panel carries
`0x1 gpu idle` as a throttle reason on essentially every poll of a healthy box — the same
cry-wolf failure §6.2's rule was written to stop, one bit over.

**Not verified**, because this step is pure functions and the answer lives on the box. One
command settles it, and it costs nothing:

```bash
ssh ai-server 'nvidia-smi --query-gpu=clocks_throttle_reasons.active --format=csv,noheader'
```

If `0x1` (or `0x5`) comes back on an idle card, `notable` should be
`(mask & ~NEUTRAL_BITS) !== 0n` and §6.2's sentence needs one word.

## A11 · LOW — §6.3's GPU-throttle *normal* column has no answer for `0x1`, `0x2` or `0x100`. Unrecorded.

§6.3 gives three columns: normal = "`0x4` or none", watch = "any bit not in §3.7's table",
alarm = the four. A mask of `0x1` alone is in §3.7's table (so not watch), is not an alarm
bit, and is neither `0x4` nor none — **no column covers it**. The implementation reads
through to §3.7's `treatment` column and returns `normal`, which is plainly the right answer
and the only one consistent with `THROTTLE_REASONS`. But it is a case where §6.3's own
wording is satisfiable two ways, it is the kind of thing invariant 7 exists to catch, and
build.md's sixteen gaps do not include it. One line in §6.3 — "normal = no bit whose §3.7
treatment is `alarm` and no unlisted bit" — closes it.

## A17 · LOW — §6.3's fan5 engaged band is written for integers and applied to a real number.

`≥ 3500 / 3000–3499 / < 3000`. A reading of `3499.5` is in none of the three written bands;
the implementation gives `watch` (`< 3500`), which is the sane reading. `fanN_input` is an
integer so nothing can hit it today. Noted only because §6.3's other rows use `≤`/`>`
consistently and this one does not.

---

# Adjudication of the sixteen recorded gaps

| # | Verdict |
|---|---|
| **G1** `severityDkms` | **Genuine.** §3.6 names DKMS as one of the four SAFETY checks and gives its failure meaning; §6.3's table has rows for ufw, `pwm5` and "any unit" only. Correctly not invented (invariant 7). Blocks step 10's SAFETY panel, as stated. |
| **G2** `HealthState` severity | **Genuine.** §3.4, §3.7 and §6.2 all put `/health` in the SERVING row; §6.3 bands `unitState` only. `active` + `unreachable` really has no severity. |
| **G3** `LinkState` severity | **Genuine**, same shape. §3.5 collects it, §6.2 displays it, §6.3 has no row. |
| **G4** SM clock separators | **Genuine but already answered.** §6.6's locale bullet is unconditional and governs *separators*; the row's word "integer" governs *precision*. The two are not in tension and grouping is right. Record it, do not treat it as open. |
| **G5** `OFF`/`LOW` state names | **Genuine.** §6.3 pins only `≥ 192`; the 64 boundary and the words `OFF`/`LOW` come from the repo's `CLAUDE.md`, which is authoritative about the driver but is not SPEC.md. See **A3** — this row is also where the non-finite hole lives. |
| **G6** the word "unavailable" | **Genuine but minor.** §6.5 uses the concept and the word; only the literal cell string is step 2's. |
| **G7** `formatUptime` | **Genuine.** §3.2 pins `up 2 d 02:01` and no sub-day form. Correctly deferred rather than guessed. |
| **G8** half-`null` VRAM pair | **Genuine**, and the resolution is forced: law 1 applied per figure is the only rendering that does not lose which half is missing. |
| **G9** unparseable `ThrottleMask` | **Genuine**, resolution forced by §3.7's own argument ("silently dropping an unrecognised bit… would report a throttling card as unthrottled"). `null`, never `0`. Verified: `'  '`, `'[N/A]'`, `'Not Supported'` all decode to `null`. |
| **G10** condition-id vocabulary | **Genuine and the largest.** §6.4 names one id. The proposed rule (one kind per §6.3 row) is principled, but ratification must also settle **A4** (does the aggregate count `severity` or `displaySeverity`) and **A11**, which the proposal does not touch. |
| **G11** `kind:subject` ids | **Genuine and necessary** — but incomplete. See **A10**: kind-level matching was kept alongside it and reintroduces the exact hazard G11 cites. Ratify both halves or neither. |
| **G12** `severityUfw(null)` | **Genuine, and correctly implemented as-specified** — §6.3 gives the ufw row no `null` column and the `pwm5` row directly below it one. Worth adding the display consequence when it is raised: a `null` ufw row renders `—` with no colour, on the check that has already been wrong on this box since 2026-09-04. |
| **G13** `ErrorSource` drift | **Confirmed and blocking.** See **A5** for the experiment and for the HANDOVER §3 half that build.md misses. |
| **G14** shared-boundary convention | **Confirmed consistent across all eleven rows.** At every doubly-named boundary the *less severe* clause wins: VRAM 90 → normal, RAM 85 → normal, disk-free 15 → normal and 5 → watch. Rows written with strict inequalities (`> 95`, `< 5`, `> 5100`) are honoured exactly (95 → watch, 5100 → normal). The temperature rows and both fan5 rows are disjoint as written and need no convention. Verified against the fan5 matrix and probe I, including realistic disk figures (`791.775/931.5` → normal, `886.925/931.5` → alarm; no floating-point flip at either edge). The convention is step 2's, not spec text — §6.3 should gain the one line. |
| **G15** timestamps | **Not a gap.** Correctly labelled a scope boundary; §6.6's bullet is complete and needs ambient timezone state this step excludes. Agreed. |
| **G16** `THERMAL_THROTTLE_BITS` comment | **Genuine, and worse than "a comment fix".** HANDOVER §4 makes the point that "a wrong descriptive comment misinforms; a wrong **directive** gets obeyed", and this comment reads as one: "The bits §6.3's alarm row means". §6.3's alarm row is now four bits. A later agent wiring the banner off that constant drops `0x80` — an external electrical fault — from §6.4's banner set. Fix the comment in the same pass as G13, since both are one-line edits to `lib/types.ts`. |

**Unrecorded gaps** — invariant 7 says these are defects to report, and build.md §9 does not
have them: **A4** (§9's alarm count and the `severity`-vs-`displaySeverity` ruling), **A6**
(swap 2 dp vs its own stated purpose), **A11** (§6.3's throttle normal column), **A17**
(integer bands on a real-valued reading). **A2** is not a spec gap but an undocumented
composition contract that must be written down before step 8.

---

# Attacked and found sound

A short honest list. These are the things I tried hardest to break and could not.

- **§6.6 law 1 and law 2 across all sixteen formatter rows**, and across the 27 field paths
  of `nothingReadable` / `everythingZero`. No falsy check swallows zero anywhere;
  `readable()` is the single choke point and `0` passes it. `formatMiBPair` and
  `formatLoadAverage` re-implement the guard correctly rather than skipping it. The one
  formatter that does not go through it is `formatCh5Pwm` — **A3**.
- **`en-US` is genuinely pinned, proven under a hostile host locale.** There is exactly one
  `Intl.NumberFormat` construction site and it passes `'en-US'`; no `toLocaleString` appears
  anywhere in `lib/`. Verified by running the suite with `LC_ALL=de_DE.UTF-8
  LANG=de_DE.UTF-8 TZ=Asia/Kolkata`, in an environment where
  `new Intl.NumberFormat().resolvedOptions().locale` really is `de-DE` and
  `(14451).toLocaleString()` really is `14.451` — the exact output §6.6 forbids. 195/195
  passed unchanged.
- **All eleven §6.3 rows at both sides of every edge**, plus the G14 convention (above).
  I found no row where an edge value lands in the wrong band.
- **`fan5` engagement, exhaustively**: 9 mode/PWM states × 8 RPM values, plus `null`, `NaN`
  and negative RPM. EC auto's healthy 2210 RPM is `normal` in `ec-auto`, in `unavailable`,
  and in manual below the HIGH band; the same reading is `alarm` once engaged; `5101` and
  `14451` are alarms in every state; `5100` is not; `null` RPM has no severity in any state;
  `pwm5NodeAbsent` (fan5 `null`) yields `null`, not `0`-shaped. The only defect is the
  non-finite PWM row — **A3**.
- **`pwm5Present === null` never becomes the alarm anywhere I could reach it.**
  `severityPwm5Present(null)` → `watch`, and stays `watch` through `nothingReadable`, through
  `worstSeverity` over a whole SAFETY panel (aggregate `watch`, while `pwm5NodeAbsent`
  correctly aggregates `alarm`), and through `applyStanding` even when `pwm5_present` is
  declared standing — suppression requires `severity === 'alarm'`, so a `watch` unknown is
  not suppressed and does not banner. The three values are three distinct severities and the
  function is total, so no caller can turn an absent probe into a blank row and then into a
  default. Invariant 1's worst inversion is not reachable from step 2's code.
- **The throttle decoder.** `0`, `0x4` alone, each of the four alarm bits alone, an unlisted
  bit alone (`0x10`, `0x200`, `0x1000000000000000`), unlisted + `0x4`, all 64 bits set (64
  reasons, `alarm`, correct labels at both ends), and an 80-bit mask (80 reasons, no
  truncation). `bigint` is carried end to end — `.mask` is `bigint`, `.bit` is `bigint`,
  `codeOf` renders from the `bigint`, and `0x8000000000000000` keeps its exact code where
  `Number` would collide. Nothing narrows. An unlisted bit is never dropped and never
  outranks a known alarm bit. The note attaches to `0` and `0x4` only.
- **`worstSeverity` as a maximum**: `[]` → `null`, `[null]` → `null`, `['normal']` →
  `'normal'`, `[null,'watch']` → `'watch'`, alarm beats watch beats normal in both argument
  orders. An all-`null` panel is not `'normal'`. Correct — the gap is the missing *count*
  (**A4**), not the maximum.
- **The debounce state machine.** 9,999 ms vs 10,000 ms; one confirming sample at 30 s and
  ten at 1 s; a flicker back to the confirmed band resetting the pending run; a backwards
  clock neither confirming early nor stranding a band; `confirmedSinceMs` carrying the first
  sighting rather than the confirmation instant. Only **A14**'s identity nit.
- **The standing suppression rule itself.** All three conditions are required, the real
  `severity` is never overwritten, watch and normal pass through untouched, a first
  observation is not a change, an unparseable id suppresses nothing, and a standing
  condition that is *healthy* is simply not suppressed. The rule is right; **A1** is that the
  suite does not prove one half of it and **A2** is that its input is undefined.
- **All 16 recorded regressions still bite**, with the tallies build.md §8 claims.
