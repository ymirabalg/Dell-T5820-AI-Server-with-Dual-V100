# Step 2 — Format & severity core — REVIEW

I edited no source, no test, no config and no spec. Two experiments touched the tree and
both were reverted:

1. `lib/__review_probe.test.ts` — a temporary probe file, run and **deleted**.
2. `lib/conditions.ts` — the sticky-`changed` fold replaced with the non-sticky one, suite
   run, file restored.

```
$ md5 -q lib/*.ts | diff - md5.before
STEP-1+2 SOURCES IDENTICAL
$ ls lib/                       # no __review_probe.test.ts
$ pnpm verify
 Test Files  7 passed (7)
      Tests  484 passed (484)
Type Errors  no errors
VERIFY_EXIT=0
```

I also ran three read-only `nvidia-smi` queries over SSH against `ai-server` (no writes;
invariant 2 intact). They settle **A8**.

---

# 1. Adjudication

Verdicts are **UPHELD** (real, act on it), **OVERSTATED** (real but smaller or differently
shaped than claimed), **REJECTED** (not a defect).

## The four the prompt flagged

### A1 · UPHELD — verified independently, and the divergence is exactly where claimed

I reproduced the four-observation divergence from first principles rather than from the
write-up:

```
sticky      : alarm:changed=false  normal:changed=true  alarm:changed=true  alarm:changed=true
non-sticky  : alarm:changed=false  normal:changed=true  alarm:changed=true  alarm:changed=false
3-obs sticky final: changed=true      <- the sequence the suite actually uses
```

The two implementations agree on observations 1–3 and diverge only on the fourth. Then I
ran the mutation myself:

```
$ # conditions.ts: "prev.changed || prev.lastSeverity !== severity" -> "prev.lastSeverity !== severity"
$ pnpm vitest run lib/conditions.test.ts
 Tests  43 passed (43)      exit 0
$ # restored; md5 matches the pre-mutation snapshot
```

The longest ledger sequence in `conditions.test.ts` is four observations — but all four are
`alarm` (line 204, "nothing becomes standing implicitly"), so it never crosses the
divergence. The regression sequence at line 229 is three. **The shipped code is right and
nothing pins it.** This is the same class as step 1's "assertions about aliases rather than
fields": a test whose name claims a property it does not exercise.

R12 is correctly called a straw man. Do not defend it — replace it. The missing test is one
line and the missing regression (`R12b`, dropping `prev.changed ||`) is two.

**A1 and A2 are the same seam from two sides, and the order of fixing matters.** Do not
"resolve" A2 by weakening stickiness — that reintroduces exactly the case §6.4 names
verbatim. Fix A2's *input*; keep the sticky fold.

---

### A2 · UPHELD — and it is **both** a code defect and a spec gap. This is the ruling that matters.

Reproduced. `STANDING=gpu_temp:0`, 1 s cadence, severities `alarm alarm watch alarm alarm alarm`,
the ledger fed the **raw** per-poll severity — which is what `conditions.test.ts` models:

```
t=0    raw=alarm  confirmed=alarm  changed=false  suppressed=true   banner=false
t=1000 raw=alarm  confirmed=alarm  changed=false  suppressed=true   banner=false
t=2000 raw=watch  confirmed=alarm  changed=true   suppressed=false  banner=false
t=3000 raw=alarm  confirmed=alarm  changed=true   suppressed=false  banner=TRUE
t=4000 raw=alarm  confirmed=alarm  changed=true   suppressed=false  banner=TRUE
t=5000 raw=alarm  confirmed=alarm  changed=true   suppressed=false  banner=TRUE
```

and the same sequence with the ledger fed the **confirmed** band:

```
t=0..5000  fed=alarm  suppressed=true  banner=false      <- quiet throughout, correct
```

One poll of `watch` permanently destroys the standing suppression, because `changed` is
sticky (correctly). For `ufw_enforcing` — the one id §6.4 names, and the one this box will
actually declare — the resulting banner is literally permanent for the session. The
debounce machine sitting in the same file reaches the opposite conclusion about the same
event and nothing connects them.

**Verdict: both.**

- **Spec gap.** §6.4 states the debounce as "before it **logs or banners**" in one
  paragraph and the standing rule's "the moment it *changes*" in another, and never says
  the second reads the first. A careful reader can infer it from the 79→80→79 sentence;
  that is inference, and invariant 7 exists so nobody has to make it.
- **Code defect, and the more urgent half.** `observeConditions` and `applyStanding` accept
  a `Condition` whose `severity` field has no stated provenance, and step 2's own tests
  supply the wrong one. A seam this step can close and did not is a step-2 defect, not
  merely a spec omission. The evidence that it will be got wrong is that it already was —
  by the phase that built both halves.

**What the composition must be, precisely:**

> `Condition.severity` is the **confirmed** band from `stepBandHold`, never a raw per-poll
> severity. One `BandHold<Severity>` per `Condition.id`, seeded on first sight and stepped
> once per poll from the raw §6.3 severity. Everything downstream of `Condition` — the
> ledger, `displaySeverity`, `banner`, the event log, §9's dot and its alarm count — is
> therefore debounced. **Cell colour is not downstream of `Condition`**: step 9 calls
> `severityGpuTemp(...)` and friends directly on the current reading, so a cell tracks the
> live band with no lag while nothing logs or banners until the band holds 10 s.

That split is what §6.4 actually says — it scopes the debounce to "logs or banners", and it
separately establishes that colouring and bannering are independent ("watch-level
conditions colour their cell but never raise a banner"). It also keeps `banner ===
(displaySeverity === 'alarm')` true, which section A4 below depends on.

**Do not settle this with a doc comment.** The three things that must change together:

1. A composed entry point in `conditions.ts` that owns the `BandHold` map — something of
   the shape `observePoll(state, rawConditions, nowMs) -> { state, displayed }`, pure, with
   `nowMs` an argument. Step 8 then cannot wire it wrong because there is nothing to wire.
   This is inside step 2's scope: both mechanisms are §6.4 and the step already owns both.
2. `conditions.test.ts`'s composed tests re-expressed against confirmed bands, plus a test
   that a single-poll flicker at a 1 s cadence leaves a standing condition suppressed.
3. A `regressions.py` entry that feeds raw severities and fails.

---

### A3 · UPHELD — confirmed, safety-relevant, and the fix belongs in **neither** place the prompt offers

Reproduced across the whole PWM range, with `fan5Rpm = 0` throughout:

```
pwm=NaN        render="OFF pwm NaN"     engaged=false  severityFan5(0 RPM)=normal
pwm=Infinity   render="HIGH pwm ∞"      engaged=true   severityFan5(0 RPM)=alarm
pwm=-Infinity  render="OFF pwm -∞"      engaged=false  severityFan5(0 RPM)=normal
pwm=-0         render="OFF pwm -0"      engaged=false  severityFan5(0 RPM)=normal
pwm=1000       render="HIGH pwm 1,000"  engaged=true   severityFan5(0 RPM)=alarm
```

Three separate defects in one function pair: the non-finite hole (a stalled fan at HIGH
reads `normal`), the `-0` hole (build.md §10 claims module-wide normalisation and this is
the one row without it), and an out-of-range duty rendered as if plausible — `pwm 1,000` on
a 0–255 register.

**Where the fix belongs:**

- **NOT the brand constructor.** HANDOVER §3 and §5 both rule this out and the reason is
  load-bearing: the constructors are `v as T`, erased at runtime so the JSON stays plain.
  Reject this option outright and record the rejection, because it is the option a fresh
  agent reaches for first.
- **NOT "the formatter" or "the severity function" — the *shared quantisation*.** The `≥ 192`
  boundary is written **twice**, once in each module:

  ```
  lib/format.ts:217    v >= 192 ? 'HIGH' : v >= 64 ? 'LOW' : 'OFF'
  lib/severity.ts:178  cooling.ch5Mode === 'manual' && cooling.ch5Pwm >= 192
  ```

  One hardware fact, two definitions, nothing pinning them together. Make `pwmStateName`
  the single definition and have `isCh5Engaged` read `pwmStateName(ch5Pwm) === 'HIGH'`.
  Then widen it to `pwmStateName(v: Pwm): PwmStateName | null`, returning `null` for a
  non-finite or out-of-0–255 duty, and **both** defects close at one site:
  - `formatCh5Pwm` renders `—` when the state is `null` (law 1 — the duty is not a reading);
  - `isCh5Engaged` is `false`, and — this is the safety half — **`severityFan5` returns
    `null`, not `normal`**, when `ch5Mode === 'manual'` and the duty is unreadable. A
    severity that cannot be computed is `null`. Returning `normal` asserts health from a
    parse failure; returning `alarm` manufactures a hardware fault from one, which is the
    inversion O1 exists to prevent. `null` is the only answer consistent with invariant 1.

  This adds a `severity.ts → format.ts` import. That is the right edge and creates no
  cycle (`format.ts` imports only `./types`, and `severity.ts` already imports `./throttle`).

- **And a step-4 obligation, because no formatter can catch the finite case.** `Number('')`
  is `0`, so a truncated `pwm5` read yields a *finite* `0` that disengages the band and
  renders the entirely plausible `OFF pwm 0`. Step 4 must range-check `pwm5` to 0–255 and
  send `null` otherwise. Put it in HANDOVER as a named obligation, not in a comment.

The display string for "manual, duty unreadable" is a §6.6 gap — see the spec list.

---

### A4 · OVERSTATED as a build defect, UPHELD as a spec gap. The count is **not missing**; the *rule* is.

Reproduced today's configuration — ufw not enforcing, declared standing:

```
banner count       : 0
true-alarm count   : 1
worst(display)     : watch
worst(true)        : alarm
```

The adversarial's framing — "§9's aggregate is half-built and the missing half is the
count" — is wrong in a way worth correcting, because it points reconciliation at building
something that already exists. `banner` is `displaySeverity === 'alarm'` (conditions.ts:254),
so `bannerConditions(displayed).length` **is** the alarm count under any reduction that
uses `displaySeverity`. Nothing needs building. What is missing is the ruling on which
severity the reduction reads, and that is a genuine gap: §9 and §6.2 do not say.

**Whose count is it?** Split it:

- **The rule is step 2's**, because `conditions.ts` is the only module that knows the
  difference between `severity` and `displaySeverity`, and because the dot and the count
  are one reduction — if step 10 picks, step 10 picks twice and may pick differently.
- **The rendering is step 10's** (`❙❙ paused · 6 alarms`).

**What §9 must say**, and my recommendation for it:

> The aggregate dot and the alarm count are one reduction over the same list, both read
> `displaySeverity` and both read the **debounced** band (per §6.4). A condition declared
> standing is therefore neither red nor counted while it is suppressed — its real severity
> is named in its SAFETY row, which is where §6.4 puts the truth. The count is omitted
> when it is zero, so a fully-suppressed box reads `❙❙ paused` and never `paused · 0 alarms`.

That closes the adversarial's failure scenario without the alternative it feared: the
header does not read "0 alarms" beside a live alarm, because it renders no count at all,
and the dot is amber rather than green because the standing condition still displays at
watch. Reading §9's "a mode that hid the alarm count would be a lying dashboard" as an
objection to §6.4's own concession is a misread — §9 is about the **pause/stale mode**
hiding the count, not about standing.

**One further consequence, which nobody has recorded and which is bigger than the count:**
§9 says "worst severity across every panel", but three readings the panels display have no
§6.3 band at all — DKMS (G1), `/health` (G2) and link state (G3). They cannot become
`Condition`s, so they are structurally invisible to the dot. **The aggregate dot cannot be
correct until G1–G3 close.** That is not a step-2 defect — refusing to invent the bands is
invariant 7 working — but it must be stated, or step 10 will either invent them or ship a
dot that cannot go red on a failed DKMS build.

---

## The rest of the adversarial findings

| # | Verdict | Judgement |
|---|---|---|
| **A5** | **UPHELD** | Confirmed both halves myself; see §2 below for the ownership ruling. |
| **A6** swap 2 dp | **OVERSTATED — decline** | The code does exactly what §6.6 says. 0.004 GiB = 4 MiB of swap is *normal background* on Linux (pages evicted at boot and never returned), `severitySwap` bands it `normal` at any rendering, and §6.3 gives swap no watch band. The rule fixed the case it was written for (40 MiB reads `0.04`, not `0.0`). Adding a third rendering to a formatter whose entire point is that it has exactly two would cost more than it buys. |
| **A7** `-0` guard | **UPHELD (LOW), but reject the proposed fix** | Confirmed: `formatPercent(-0.04)` → `-0.0 %`. The defect is the **comment**, which claims a class it does not handle — precisely what HANDOVER §4 warns about. But do **not** normalise the rounded value: a genuinely negative `cpuPct` delta is a collector bug, and rendering it as `0.0 %` hides it. Fix the comment to say it catches exact `-0` only, and put "clamp `cpuPct` and network rates to ≥ 0, or send `null`" on step 3. |
| **A8** idle bit | **REJECTED — measured on the box** | Three samples, both cards idle (0 % util, P0, 39 W, 39 °C — the exact state A8 describes): `clocks_throttle_reasons.active = 0x0000000000000000` on every sample. `gpu_idle` is not set here. Two notes: `clocks_throttle_reasons.supported = 0x1FF`, so **`0x10` is a bit this driver can genuinely set** and the unknown-bit path is not hypothetical — keep it and keep its tests. And even had the premise held, the failure would have been cosmetic: a neutral bit decodes to severity `normal`, so §6.2's actual prohibition ("must not be styled as a warning") is not breached. `notable = (mask & ~0x4) !== 0n` is a correct transcription of §6.2; leave it. |
| **A9** bogus subject | **UPHELD** | Confirmed: `ufw_enforcing:yes`, `gpu_temp:`, `unit:` all enter `ids` with `unknown` empty; `ufw_enforcing:yes` then suppresses nothing. **This cannot be fixed by typing**, which is worth knowing: `ConditionId = ConditionKind \| \`${ConditionKind}:${string}\`` makes `ufw_enforcing:yes` a *valid* `ConditionId`. It needs a rule — which kinds are singletons — and that is a spec question. Split the fix: the empty-subject forms (`gpu_temp:`, `unit:`) are unambiguously malformed and can be reported as `unknown` now; the singleton rule waits on ratification. |
| **A10** bare `unit` | **UPHELD** | Confirmed: `STANDING=unit` suppresses `unit:gpu-fan-control.service`. The hazard G11 was written to prevent, reintroduced by the kind-level match kept alongside it. Note the asymmetry that makes this hard: kind-level matching is *right* for `gpu_temp` (two identical cards, and a test asserts it) and *wrong* for `unit` (heterogeneous subjects, one of them safety-critical). The minimal rule is "`unit` requires a subject in `STANDING`"; the cleaner one is a separate `fan_service` kind. Owner's call — spec row. |
| **A11** throttle normal column | **UPHELD (LOW)** | Real ambiguity, one clause closes it, and it is cheap. Implementation already gives the only sane answer. |
| **A12** `logOncePerSession` | **UPHELD — and go further than a rename** | The field is `suppressed` under a second name, recomputed every poll, with no state. Do not rename it; **delete it**. The policy belongs in the step-8 obligation, and a field that a step-8 implementer can write `if (d.logOncePerSession) log(d)` against is a trap whatever it is called. |
| **A13** dead branch | **UPHELD (LOW)** | Confirmed by inspection: both arguments are non-`null` `Severity`, so `?? 'normal'` cannot fire. Cheapest removal is to restructure rather than add a combinator: `if (!engaged) return absolute; if (absolute === 'alarm') return 'alarm'; return value < 3000 ? …`. |
| **A14** identity on a backwards clock | **UPHELD (LOW)** | Confirmed `false`. One-line fix: in the clock-backwards branch return `state` when `pending` and `confirmed` are already the same, since there is no pending run to restart. |
| **A15** SERVING omitted from the sweep | **UPHELD** | Real coverage gap and the best value-per-line on this list. `servingIdentityOnly` — the fixture step 1 built specifically for "every field `null`" — is imported by no step-2 test. Add `formatTokens(ctx)`, `formatText(model)` and the port to the sweep. |
| **A16** `0.00040 KB/s` | **REJECTED — decline** | Spec-conformant, cosmetic, and a floor string is a third rendering in a two-law module. |
| **A17** integer bands, real reading | **REJECTED — decline** | `fanN_input` is an integer from sysfs. Unreachable. |

## Re-adjudicating two of the build's own gaps

**G16 · REJECTED. Both prior phases got this one wrong, on a truncated quote.** build.md
says the comment "says *The bits §6.3's alarm row means*" and the adversarial upheld it as
"worse than a comment fix — a later agent wiring the banner off that constant drops `0x80`".
The full text at `lib/types.ts:280-286` is:

```
 * The bits §6.3's alarm row means by "thermal throttle": `0x8`, `0x20`, `0x40` (§3.7).
 *
 * `0x80` (HW power brake) is an alarm in its own right but is not thermal, so it is not
 * in this mask — the two questions are asked separately.
```

The second paragraph says exactly what the finding claims is missing. The comment is
mildly imprecise in its first clause (§6.3's alarm row is four bits; "thermal throttle" is
the *Basis* column's phrase) but it cannot mislead anyone who reads to the end of it.
**Decline the edit.** Related and also declined: `THROTTLE_ALARM_BITS` is consumed by no
source file, only by tests — leave it, and note here so a later agent does not "unify" the
two constants that deliberately answer different questions.

**G9 · No spec row needed.** §3.7's own argument and §4's "a failed reading is `null` plus
an `errors[]` entry" already force the answer. The code is right. Decline.

**G4 · Agreed with the adversarial** — §6.6's locale bullet governs separators and is
unconditional; the row's "integer" governs precision. Not in tension. Still worth one word
in §6.6 because SM clock is the one figure the reading changes, and a later agent will
re-litigate it otherwise.

---

# 2. A5's ownership — confirmed, with the full artefact set

Verified both halves myself:

- `lib/types.ts:211-228` lists **17** `ErrorSource` members; `net-operstate` is absent.
  `SPEC.md:433` lists **18** and `SPEC.md:437` spends a paragraph on why this one must be
  separate.
- `lib/types.test-d.ts:505-526` pins the union with `Assert<Equals<ErrorSource, …>>` over
  the 17-member list, so a one-line fix to `types.ts` alone fails `tsc`.
- `HANDOVER.md` §3's vocabulary table reads `` `ErrorSource` | the 17 names in §3.7 ``.

**Step 2's reconciliation is the right owner.** PLAN forbids reconciliation from *adding
scope*; applying a finding the adversarial phase was ordered to produce is not adding
scope, it is the phase's job. Splitting it to step 6 means step 6's agent edits the wire
contract and its type test with strictly less context than the agents who found the drift,
and it blocks step 6 in the meantime — the first failed `operstate` read leaves step 6
choosing between the misattribution §3.7 forbids by name and a file that will not compile.

**Every artefact that must change in the same pass:**

| # | File | Change |
|---|---|---|
| 1 | `dashboard/lib/types.ts` | add `\| 'net-operstate'` to `ErrorSource`, positioned after `'proc-net-dev'` to match §3.7's order |
| 2 | `dashboard/lib/types.test-d.ts` (~line 512) | add the same member to the `Equals<ErrorSource, …>` pin |
| 3 | `dashboard/pipeline/HANDOVER.md` §3 | "the 17 names in §3.7" → "the 18 names in §3.7" |
| 4 | `dashboard/pipeline/HANDOVER.md` §5 or §9 | record the drift as **closed**, so step 6 does not re-report it and no later agent "corrects" the union back |

The adversarial's caveat is right and is the more dangerous half: later agents read
HANDOVER as fact, so a code-only fix would be reverted by the first agent who checks the
contract against the handover.

**Artefacts that do NOT need touching**, so the owner does not pay for them: `lib/fixtures.ts`
(no fixture uses the source), `lib/contract.test.ts` (no count assertion — I grepped), and
`pipeline/steps/01-scaffold/*.md` (a historical record of a closed step; PLAN feeds later
agents only PLAN, SPEC, HANDOVER and the current step's notes).

**Do not open `SPEC.md` for this.** §3.7 is already correct. This is a code-vs-spec drift,
not a spec gap, and it is the only row on this review that is not.

---

# 3. My own findings

### The step as a unit

**Spec conformance is high.** Every row of §6.6 and every row of §6.3 has a function and an
edge-tested band; §3.7's decoder is complete and carries `bigint` end to end; §6.4's two
mechanisms both exist. The departures are the three above (A3's non-finite hole, A7's
comment, A2's uncomposed seam) plus the gaps the step correctly refused to fill. The
refusals are the best thing about the step: G1–G3 and G7 are four places where inventing a
band or a format would have been easy and invisible, and invariant 7 was honoured at each.

**The tests are carrying weight, not ceremony.** 1,645 test lines to 1,065 source lines
(1.55:1) is unremarkable for a module whose entire contract is a table of edges, and the
tests are shaped correctly: every band names the last value of one band and the first of
the next; the two laws are swept over 27 real field paths of two fixtures rather than over
the formatters in the abstract; locale is proven under a hostile host locale; and sixteen
mutations all bite. Two places where the tests only look like coverage: the ledger group
(A1) and the omitted SERVING sweep (A15). That is a low defect density for this volume.

**No over-abstraction.** No classes, no config objects, no strategy indirection, no
premature generics — with one candidate worth explicitly clearing: `BandHold<T>` is generic
and tested on a non-severity band. That generic is earned, because §6.4's own event-log
example is a non-severity transition (`fan5 EC auto → HIGH`), which step 8 will want to
debounce with the same machine.

**The four-file split is right.** The dependency graph is `types ← format`,
`types ← throttle ← severity`, `types ← conditions`; no cycles, and `conditions.ts` correctly
imports no formatter. The one edge I am recommending adding (`severity → format`, for the
shared PWM quantisation, R2 below) preserves that.

**No duplication of `types.ts`.** `ConditionKind`, `PwmStateName`, `BandHold` and the decode
types all stayed out of the contract file, per HANDOVER §3's boundary. The near-duplicate is
`THROTTLE_ALARM_BITS` vs `THERMAL_THROTTLE_BITS`, and that pair is deliberate and now pinned
by a test that asserts they differ.

### New findings

**R1 · `usedPercent` / `freePercent` take bare `number`, dropping the brand discipline.**
`severity.ts:78,85`. `usedPercent(mib(1), gib(2))` compiles. Every other function in the
module is branded at its boundary; these two are the hole, and they are exported, so step 9
can reach them. Make them generic over one brand: `<T extends number>(used: T | null, total:
T | null): Percent | null`. This is the only place step 2 undoes what `lib/types.ts` exists
to guarantee. **SHOULD.**

**R2 · The `≥ 192` HIGH boundary is defined twice** (`format.ts:217`, `severity.ts:178`) for
one hardware fact, with nothing pinning them together. Collapsing them is also where A3's
fix lands — see A3 above. **MUST** (as part of A3).

**R3 · `DisplayedCondition.logOncePerSession` is `suppressed` renamed.** Delete rather than
rename (strengthens A12). **SHOULD.**

**R4 · §6.4's banner must name "when it started", and there is no join to the timestamp.**
`confirmedSinceMs` lives on `BandHold<T>`; `DisplayedCondition` has no timestamp field.
Step 10 therefore has to key a *separate* `BandHold` map by `Condition.id` and look the
value up — an undocumented cross-module join, the same family as A2 and A4. If the composed
`observePoll` recommended under A2 is built, it should return the start timestamp on the
`DisplayedCondition` and this closes for free. **MUST** — it is one of the "built but its use
is unspecified" cases, and nobody has named it.

**R5 · One reading, two panels, one condition — the fan service will otherwise be counted
twice.** HANDOVER O2: `cooling.serviceState` and `safety.fanServiceState` are the *same*
D-Bus read rendered in COOLING and in SAFETY. If step 10 builds one `Condition` per rendered
row, a failed `gpu-fan-control.service` produces two conditions with the same id but two
list entries, and the header reads `2 alarms` for one fault. State the rule: conditions are
keyed by **reading**, not by cell, and `Condition[]` is deduplicated by `id` before it
reaches the ledger, the banner or the count. **MUST** (leak-prevention).

**R6 · The aggregate dot is structurally incomplete until G1–G3 close.** See A4 above.
**MUST** record; the code fix waits on the spec rows.

**R7 · The public surface is usable by steps 8 and 10 without adapters, with two named
exceptions.** Formatters take branded scalars and return complete strings; severity
functions take scalars or the `Cooling`/`Host` aggregate that guarantees their invariant.
The exceptions: (a) there is no `conditionsFrom(snapshot)` — correctly not built, but its
owner must be named or steps 8 and 10 will each write one; (b) formatters return
unit-inclusive strings, so step 9 cannot get a separately-styled unit without a `parts`
variant. Do not build the `parts` variant now, but record that **splitting on whitespace is
not a workaround** — `26,452 / 32,768 MiB` and `1.24 / 1.08 / 0.91` both contain spaces that
are not the unit separator.

---

# 4. What step 2 must not leak into later steps

Every item here is a mechanism that exists with an unspecified use. Each needs a sentence in
`HANDOVER.md`, not a comment in the module.

1. **A2 — which severity feeds a `Condition`.** The ruling above, verbatim: `Condition.severity`
   is the confirmed band; cell colour comes from calling `severityX()` directly. The strongest
   form is the composed `observePoll`, which removes the choice.
2. **A4 — the dot and the count are one reduction, over `displaySeverity`, over the debounced
   band, and the count is omitted at zero.**
3. **R4 — the banner's start timestamp.** Which value it is (first sighting of the confirmed
   band, i.e. `confirmedSinceMs`, not the confirmation instant) and how step 10 reaches it.
4. **R5 — one reading, one condition.** Dedupe by `id`.
5. **A12/R3 — `logOncePerSession` is a policy label, not a trigger.** Deleting the field is
   the fix; the obligation ("emit one log line per condition per session while suppressed")
   moves to step 8.
6. **`conditionsFrom(snapshot)` — name step 8 as the owner, and require it to be ONE
   function.** Step 8 needs `Condition[]` for the event log and step 10 needs the same list
   for the banner, dot and count; two constructions would be two vocabularies.
7. **G1–G3 — step 10 must not invent bands for DKMS, `/health` or link state.** If the §6.3
   rows do not land, those rows render with no colour and the dot cannot see them. Say which,
   loudly, rather than letting step 10 pick amber.
8. **Invariant 3 in the display strings.** `formatCh5Pwm` returns `EC auto` and `unavailable`;
   neither is a severity. Step 10 must not style `EC auto` as degraded — it is the healthy
   `ENODATA` case, and it is the single most likely place in the UI for invariant 3 to be
   broken.
9. **Step 4's obligation from A3** — `pwm5` must be range-checked to 0–255 and sent as `null`
   otherwise, because the finite-but-wrong case (`Number('')` → `0`) reaches no formatter
   guard.

---

# 5. Consolidated spec gaps — one row per edit

Section, then one line of what it should say. **Take** = worth the edit; **Decline** = my
recommendation to leave the spec alone, with the reason.

| # | Section | What it should say | |
|---|---|---|---|
| 1 | **§6.4** | The debounce gates the ledger, the banner, the event log **and** §9's dot and count; a cell's colour tracks the current band with no debounce. *(A2 — the most important row on this list.)* | Take |
| 2 | **§9** | The dot and the alarm count are one reduction over `displaySeverity`; a suppressed standing condition is neither red nor counted, and the count is omitted when zero. *(A4.)* | Take |
| 3 | **§6.3** | Add a `dkmsForRunningKernel` row — `true` normal / `null` watch / `false` alarm, mirroring the `pwm5 present` row. *(G1; blocks the SAFETY panel and the dot.)* | Take |
| 4 | **§6.3** | Add a `health` row — `ok` normal / `unhealthy` watch / `unreachable` alarm / `null` no severity. *(G2.)* | Take |
| 5 | **§6.3** | Add an `eno1` link-state row over the seven `LinkState` values. *(G3.)* | Take |
| 6 | **§6.3** | One line: where a boundary is named by two bands (`≤ X normal / X–Y watch`), the less-severe clause wins; strict inequalities are exact. *(G14; pins VRAM 90, RAM 85, disk-free 15 in one sentence.)* | Take |
| 7 | **§6.3** | ufw's `null`: say whether an unreadable `ufw.conf` is watch (as `pwm5Present: null` is) or has no severity. *(G12; the two three-valued safety checks currently differ only because the spec differs.)* | Take |
| 8 | **§6.3** | Throttle normal column: "no bit whose §3.7 treatment is `alarm`, and no unlisted bit" — so `0x1`/`0x2`/`0x100` alone are covered. *(A11.)* | Take |
| 9 | **§6.4** | Ratify the condition-id vocabulary: the ten kinds, the `kind:subject` form, which kinds are singletons (a subject on a singleton is a malformed entry), and that `unit` requires a subject in `STANDING`. *(G10, G11, A9, A10 — one ratification, four findings.)* | Take |
| 10 | **§6.4** | The banner's "when it started" is the first observation of the **confirmed** band. *(R4.)* | Take |
| 11 | **§6.6** | Channel-5 PWM: name the state strings `OFF`/`LOW`/`HIGH` and the 64/192 boundaries, and say what renders when the mode is `manual` and the duty is not a reading. *(G5 + A3.)* | Take |
| 12 | **§6.6** | SM clock: "integer, thousands separated", matching the VRAM and fan rows. *(G4; one word, and it is the only figure the reading changes.)* | Take |
| 13 | **§3.2** | The uptime forms below one day (`up 02:01`, and below one hour). *(G7; step 10 is blocked without it.)* | Take |
| 14 | **§6.2 or §9** | One reading rendered in two panels is one condition and is counted once. *(R5, O2's fan service.)* | Take |
| 15 | §6.6 | VRAM pair with one side `null` renders per figure — `26,452 / — MiB`. *(G8.)* | **Decline** — law 1 applied per figure is the only rendering that does not lose which half is missing; step 2's note records it and nothing else is reachable. Take it only if you are already editing §6.6. |
| 16 | §6.5 | The literal cell string `unavailable`. *(G6.)* | **Decline** — §6.5 already uses the concept and the word. |
| 17 | §6.6 | "Any non-zero swap renders distinguishably from zero." *(A6.)* | **Decline** — see A6: 4 MiB of resident swap is Linux background noise, it is `normal` at any rendering, and this would add a third case to a two-law module. |
| 18 | §3.7 / §6.2 | Restrict `notable` to non-neutral bits. *(A8.)* | **Decline** — measured `0x0` on both idle cards; and a neutral bit renders neutral even if it appeared. |
| 19 | §3.7 | `THERMAL_THROTTLE_BITS` / the `0x80` distinction. *(G16.)* | **Decline** — the comment already says it; see the G16 re-adjudication. |
| 20 | §6.6 | A floor for sub-KB/s throughput. *(A16.)* | **Decline** — cosmetic and spec-conformant. |
| 21 | §6.3 | Real-valued fan5 band boundaries. *(A17.)* | **Decline** — `fanN_input` is an integer; unreachable. |
| 22 | §6.6 | Timestamp/timezone rendering. *(G15.)* | **Decline** — not a gap; §6.6's bullet is complete and this is a scope boundary. |
| 23 | §3.7 | `net-operstate`. *(G13/A5.)* | **No spec edit** — §3.7 is already correct; the code is wrong. See §2. |

Fourteen edits to take, nine declined. If you want to trim further, rows 12 and 15 are the
two whose absence costs least.

---

# 6. Priority-ordered work list for reconciliation

### MUST

1. **A2 — compose the two §6.4 mechanisms.** Add the composed entry point that owns the
   `BandHold` map and returns `DisplayedCondition[]` (with the start timestamp, R4);
   re-express `conditions.test.ts`'s composed tests against confirmed bands; add a test that
   a single-poll flicker at 1 s leaves a standing condition suppressed; add the matching
   `regressions.py` entry. Write the contract into `HANDOVER.md`.
2. **A1 — pin the sticky rule.** The four-observation test and the `R12b` regression that
   drops `prev.changed ||`. Record in the notes that R12 was a straw man; do not defend it.
3. **A3 + R2 — the channel-5 quantisation.** One definition of the `≥ 192` boundary;
   `pwmStateName` returns `null` for a non-finite or out-of-range duty; `formatCh5Pwm`
   renders `—` for it; **`severityFan5` returns `null`, not `normal`, when the mode is
   `manual` and the duty is unreadable.** Tests for each, and a regression for the
   `normal`-on-a-stalled-fan case. Put the 0–255 range check on step 4 in `HANDOVER.md`.
4. **A5 — `net-operstate`, all four artefacts in one pass** (§2 above). Nothing else in this
   list touches step 1's files, so do this one atomically and say so in the notes.
5. **A4 — the reduction.** Document that `bannerConditions(...).length` is the alarm count
   and that the dot reduces `displaySeverity`; export an `alarmCount` alias only if it stops
   step 10 writing its own.
6. **R5 — dedupe conditions by `id`**, and write the "one reading, one condition" rule into
   `HANDOVER.md` before step 10 builds panels.
7. **Hand the owner the fourteen spec rows in §5**, and record that steps 3, 4, 8, 9 and 10
   have obligations named in §4 of this document.

### SHOULD

8. **A15** — extend the two-law fixture sweep to the SERVING panel, using `servingIdentityOnly`.
9. **A9 (safe half)** — report an entry with an empty subject (`gpu_temp:`, `unit:`) as
   `unknown`. The singleton rule waits on spec row 9.
10. **R3/A12** — delete `logOncePerSession`; move the policy to step 8's obligations.
11. **R1** — make `usedPercent`/`freePercent` generic over one brand.
12. **A13** — remove the dead `?? 'normal'` by restructuring `severityFan5`.
13. **A14** — return `state` from the clock-backwards branch when `pending === confirmed`.
14. **A7** — correct the `-0` comment to say what the guard does, and put "clamp `cpuPct` and
    network rates, or send `null`" on step 3.

### DEFER, to a named step

15. **G1/G2/G3 severity functions** → **step 2's reconciliation if spec rows 3–5 land first**;
    otherwise **step 10**, which cannot render SAFETY or SERVING completely without them.
    Whoever takes them must not invent the bands (invariant 7).
16. **A9/A10 singleton and bare-`unit` rules** → **step 2 after spec row 9 is ratified**;
    unratified, implementing them is step 2 deciding a spec question.
17. **`conditionsFrom(snapshot)`** → **step 8**, as one function.
18. **`formatUptime`** → **step 10**, after spec row 13.
19. **Formatter `parts` variant** → **step 9**, if it wants a separately-styled unit.
20. **Timestamp / timezone rendering** → **step 8/10**. Not a gap; a scope boundary.

### EXPLICITLY NOT DOING

21. **A8** — rejected on measurement (`0x0` on both idle cards, three samples). `notable`
    stays `(mask & ~0x4) !== 0n`. Keep the unknown-bit path and its tests: `0x10` is in this
    driver's supported mask.
22. **G16** — rejected on the full comment text. No edit to `lib/types.ts`'s
    `THERMAL_THROTTLE_BITS` comment, and no unification with `THROTTLE_ALARM_BITS`; the two
    answer different questions and a test now pins the difference.
23. **A6, A16, A17, G6, G9, G15** — declined; reasons in §5.
24. **A7's proposed "normalise the rounded value"** — rejected. It would render a genuinely
    negative delta as `0.0 %` and hide a collector bug.
25. **Validation in the brand constructors** — rejected, and worth re-stating because it is
    the first thing a fresh agent will reach for when it reads A3. HANDOVER §3 and §5 both
    forbid it; the constructors must stay erasable.
26. **Removing `THROTTLE_ALARM_BITS`** — declined. Unused by source, but it is the recorded
    answer to HANDOVER §6's first open question and it is asserted by tests.
