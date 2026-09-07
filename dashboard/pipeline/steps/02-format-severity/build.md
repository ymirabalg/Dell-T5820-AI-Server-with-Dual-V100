# Step 2 — Format & severity core — BUILD

Pure functions only: values in, values out. No file IO, no `nvidia-smi`, no HTTP, no
React, no DOM. Nothing outside `dashboard/lib/` was touched, and no file from step 1 was
modified — `lib/types.ts`, `lib/fixtures.ts` and step 1's three test files are byte-identical.

**`pnpm verify` → exit 0. 484 tests, 7 files.** Full output in §7.

---

## 1. What was built, and where

| File | Lines | Owns |
|---|---|---|
| `lib/format.ts` | 284 | §6.6 — every row of the units-and-formatting table, and its two laws |
| `lib/severity.ts` | 272 | §6.3 — every row of the threshold table, plus `worstSeverity` for §9's dot |
| `lib/throttle.ts` | 173 | §3.7 — decoding `clocks_throttle_reasons.active` (HANDOVER's O3) |
| `lib/conditions.ts` | 336 | §6.4 — standing conditions and the 10-second debounce |
| `lib/format.test.ts` | 596 | 195 tests |
| `lib/severity.test.ts` | 444 | 143 tests |
| `lib/throttle.test.ts` | 216 | 46 tests |
| `lib/conditions.test.ts` | 389 | 43 tests |

No dependency was added (invariant 6). Nothing new was needed: `Intl.NumberFormat` and
`BigInt` are in the platform, and Vitest's `test.each` covers table-driven cases.

Imports are relative within `lib/` (`./types`), per HANDOVER §3's convention.

---

## 2. The public surface later steps import

### `lib/format.ts`

`EM_DASH` · `formatCelsius` `formatWatts` `formatMiB` `formatMiBPair` `formatMHz`
`formatGiB` `formatSwapGiB` `formatGB` `formatBytesPerSecond` `formatRpm` `formatPercent`
`formatLoadAverage` `formatTokens` `formatCh5Pwm` `formatText` `formatCpuModel`
`pwmStateName` · type `PwmStateName`

Each takes the **branded** type from `lib/types.ts`, so `formatMiB(gib(61))` is a compile
error. Each returns a complete display string **including the unit**, because §6.6 states
its laws in terms of complete strings (`0 RPM`). If step 9 wants the unit in its own
styled span it should ask for a `parts` variant rather than splitting the string.

### `lib/severity.ts`

`SEVERITY_RANK` `worstSeverity` `usedPercent` `freePercent` · `severityGpuTemp`
`severityCpuTemp` `severityVram` `severityRam` `severitySwap` `severityMemory`
`severityDiskFree` `isCh5Engaged` `severityFan5` `severityUfw` `severityPwm5Present`
`severityUnitState` `severityThrottle`

**`null` in → `null` out**, with one deliberate exception: `severityPwm5Present` is total
(`Severity`, never `null`) because §6.3 puts `null` in its **watch** column itself.

`worstSeverity(...)` returns `null` when every argument was `null` — a panel whose every
reading failed is not a panel reporting health.

### `lib/throttle.ts`

`decodeThrottleMask` `parseThrottleMask` `THROTTLE_ALARM_BITS` `NOT_A_FAULT_NOTE`
`UNKNOWN_REASON_NAME` · types `ThrottleDecode` `DecodedThrottleReason`

`ThrottleDecode` is `{ mask, reasons[], severity, note, notable }`. `notable` is §6.2's
"throttle reasons appear only when something other than `0x4` is active". Bit values are
`bigint`.

### `lib/conditions.ts`

`ConditionKind` `CONDITION_KINDS` `ConditionId` `Condition` `conditionId` `condition` ·
`parseStandingIds` `StandingIds` · `StandingEntry` `StandingLedger` `EMPTY_LEDGER`
`observeSeverity` `observeConditions` · `DisplayedCondition` `applyStanding`
`bannerConditions` · `DEBOUNCE_MS` `BandHold` `startBandHold` `stepBandHold`

Per HANDOVER §3's boundary rule, none of these vocabularies went into `lib/types.ts`.

---

## 3. §6.6 — every row mapped to its function and its test

| §6.6 row | Function | Renders | Test |
|---|---|---|---|
| GPU temp, CPU temp — integer °C | `formatCelsius` | `66 °C` | `format.test.ts` "temperature — integer °C" |
| GPU power — 1 dp W | `formatWatts` | `249.8 W` | "GPU power — 1 dp W" |
| VRAM — MiB, thousands separated | `formatMiB`, `formatMiBPair` | `26,452 / 32,768 MiB` | "VRAM — MiB, thousands separated" |
| SM clock — integer MHz | `formatMHz` | `1,380 MHz` | "SM clock — integer MHz" |
| RAM — 1 dp GiB | `formatGiB` | `24.3 GiB` | "RAM 1 dp vs swap 2 dp" |
| Swap — 2 dp GiB | `formatSwapGiB` | `0.02 GiB` | "RAM 1 dp vs swap 2 dp" |
| Disk — 1 dp GB | `formatGB` | `238.5 GB` | "disk — 1 dp GB" |
| Network — auto-scaled, 2 s.f. | `formatBytesPerSecond` | `1.2 MB/s`, `490 KB/s` | "network — auto-scaled, 2 significant figures" |
| Fan speed — integer RPM, separated | `formatRpm` | `4,308 RPM` | "fan speed — integer RPM" |
| Percentages — 1 dp | `formatPercent` | `81.3 %` | "percentages — 1 dp" |
| **Load average** — 3 × 2 dp, ` / ` | `formatLoadAverage` | `1.24 / 1.08 / 0.91` | "load average" |
| **Context length** — separated | `formatTokens` | `131,072` | "context length" |
| **Channel-5 PWM** — state then value | `formatCh5Pwm`, `pwmStateName` | `HIGH pwm 255` | "channel-5 PWM" |
| Locale `en-US` on every viewer | all of the above | `14,451 RPM`, never `14.451` | "locale is pinned to en-US" |
| `null` → `—` | all of the above | `—` | "§6.6 law 1" — swept over all 16 rows |
| Zero → numeral with unit | all of the above | `0 RPM` | "§6.6 law 2" — swept over all 16 rows |

The three rows added after step 1 are in bold. Two extra formatters are included because
they are pure display transforms the contract explicitly delegates here:

- `formatCpuModel` — `lib/types.ts` on `Host.cpuModel`: §3.2 trims
  `Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz` to `Xeon W-2135`, and "a snapshot that has
  already discarded text cannot be un-trimmed", so the trim is a formatter's job.
- `formatText` — free-text fields (model alias, kernel, hostname, GPU name/bus). `null`
  **and blank** render `—`; §6.6 forbids a blank cell as firmly as it forbids `N/A`.

**The two laws are also swept over the canonical fixtures**: 24 numeric figures and 3 text
figures reachable from a `TelemetrySnapshot`, formatted from `nothingReadable` (all must be
`—`) and from `everythingZero` (none may be). That pairing is HANDOVER §3's suggestion and
is the strongest single test in the step — it is invariant 1 tested against itself over the
same 27 paths.

---

## 4. §6.3 — every row mapped to its function and its test

| §6.3 row | Function | Edges tested (both sides) | Test |
|---|---|---|---|
| GPU temp ≤69 / 70–79 / ≥80 | `severityGpuTemp` | 69/70, 79/80 | "GPU temp — normal ≤ 69…" |
| GPU throttle | `severityThrottle` → `decodeThrottleMask` | `0x4` vs `0x8`; unknown bit | "GPU throttle severity" + all of `throttle.test.ts` |
| GPU VRAM ≤90 / 90–95 / >95 | `severityVram` | 900/901, 950/951 of 1000 | "GPU VRAM" |
| CPU temp ≤79 / 80–89 / ≥90 | `severityCpuTemp` | 79/80, 89/90 | "CPU temp" |
| RAM ≤85 / 85–95 / >95 **or swap >1 GiB** | `severityRam`, `severitySwap`, `severityMemory` | 85/85.5, 95/95.5; swap 1/1.01 | "RAM — normal ≤ 85 %…" |
| `fan5` **while engaged** ≥3500 / 3000–3499 / <3000 | `severityFan5` + `isCh5Engaged` | 3499/3500, 2999/3000 | "fan5 while engaged" |
| `fan5` absolute >5100 | `severityFan5` | 5100/5101, 14451 | "fan5 while engaged", "fan5 NOT engaged" |
| Disk free ≥15 / 5–15 / <5 | `severityDiskFree` | free 15/14.5, 5/4.5 | "disk — banded on FREE space" |
| ufw enforcing yes / — / no | `severityUfw` | true/false/null | "ufw enforcing" |
| `pwm5` present `true` / `null` / `false` | `severityPwm5Present` | all three | "pwm5 present — three-valued" |
| Any unit | `severityUnitState` | all six `ActiveState` values + `null` | "any unit — all six ActiveState values" |
| Aggregate (§9) | `worstSeverity`, `SEVERITY_RANK` | empty, all-null, mixed | "worstSeverity — §9 aggregate dot" |

### The two rules the prompt flagged, and how they are pinned

**`fan5` "while engaged"** — `isCh5Engaged(cooling)` is `ch5Mode === 'manual' && ch5Pwm >= 192`,
taken from §6.3 verbatim. `severityFan5` takes the whole `Cooling` value, not an RPM, so the
engaged band cannot be applied without the mode in hand. The engaged band is skipped in
`ec-auto`, in `unavailable`, **and in manual below the HIGH band** — the last matters because
the service hands the channel back to the EC below `AUTO_BELOW` rather than driving it LOW,
and LOW's 989 RPM is less than half the EC's own 2210. Three tests assert the EC's healthy
2210 RPM is `normal` in each of those three states, one asserts the same reading is `alarm`
once engaged, and four assert 5101/14451 are still alarms in every state.

**`pwm5Present` is three-valued** — `severityPwm5Present` returns `Severity`, not
`Severity | null`, and maps `null → 'watch'`. Tested as three distinct severities, plus
explicit `not.toBe('alarm')` and `not.toBe('normal')` on `null`.

---

## 5. §3.7 — vocabulary coverage

| Vocabulary | Where it is switched on | Test |
|---|---|---|
| `Severity` | `SEVERITY_RANK`, `worstSeverity` | rank ordering asserted |
| `UnitState` (6) | `severityUnitState`, exhaustive `switch`, no `default` | each of the six + a `@ts-expect-error` on a seventh |
| `Ch5Mode` (3) | `formatCh5Pwm`, exhaustive `switch` | all three variants |
| `ThrottleReasonName` (8) | `decodeThrottleMask` via `THROTTLE_REASONS` | each of the eight decodes to its own name and label |
| `ThrottleTreatment` | `DecodedThrottleReason.severity` | neutral→normal, alarm→alarm |
| `HealthState`, `LinkState`, `ErrorSource` | **not used by step 2** | see gaps G1–G3, G13 |

### The throttle decoder (HANDOVER O3), and the two questions it closes

§3.7 has been amended since step 1, and it now answers both open questions HANDOVER §6
listed:

1. **`0x80` is in §6.3's alarm set** — "the three thermal bits plus the power brake, which
   is an external electrical fault and no less serious. All four raise §6.4's banner." So
   `THROTTLE_ALARM_BITS` = `0x8 | 0x20 | 0x40 | 0x80`, and it is **derived from
   `THROTTLE_REASONS`'s `treatment` column** rather than written out, so it cannot drift
   from the table it summarises.
2. **An unlisted bit renders `0x<hex> unknown` and is WATCH** — now spec text, not a
   suggestion. Implemented, and it is the property tested hardest.

`types.ts`'s `THERMAL_THROTTLE_BITS` (`0x8|0x20|0x40`) is **not stale in value** — it still
correctly names the *thermal* bits — but its doc comment cites a version of §6.3 whose alarm
row was the same three bits, and that row now has four. Step 2 did not touch it (step 1's
file, and `contract.test.ts` pins it); `throttle.test.ts` asserts both constants and that
they differ, so the distinction is now recorded in a test rather than in prose. See G16.

Decoder details worth knowing downstream:

- Bits are `bigint`. `nvidia-smi`'s mask is 64 bits and `Number` loses exactness above
  2^53, so an unknown high bit would decode to the wrong code. A test asserts
  `0x8000000000000000` keeps its exact code and that `Number(0x8000000000000001n) ===
  Number(0x8000000000000000n)` — the collision the `bigint` avoids.
- `reasons` comes back in ascending bit order, known and unknown interleaved
  (`0x1f4` → `0x4, 0x10, 0x20, 0x40, 0x80, 0x100`).
- A mask string that is not a mask (`[N/A]`, `banana`, `''`) decodes to `null`, **not** to
  `0`. Decoding it to `0` would claim the card is not throttling. See G9.

---

## 6. §6.4 — the standing-condition mechanism

**Configured, never inferred.** `parseStandingIds(raw)` is the only way in; it reads
`STANDING`'s comma-separated list, returns the recognised ids and — separately — the
unrecognised ones, so a typo in `/etc/ai-dashboard.env` suppresses nothing (the safe
direction) but is still visible to the caller.

**The rule.** `applyStanding(condition, standingIds, ledger)` suppresses only when all
three hold: declared standing, severity is `alarm`, and the severity has not changed this
session. Then `displaySeverity` becomes `watch`, `banner` becomes `false` and
`logOncePerSession` becomes `true`, while **`severity` stays `alarm`** — §6.4 requires the
row to name the real severity, so nothing overwrites it.

**"Returns to full alarm the moment it changes — including when it clears and later
regresses."** The ledger tracks the **severity** per condition id, and `changed` is
**sticky**: `alarm → normal → alarm` sets it, so the regression banners. Comparing against
the *first* severity instead would call that sequence unchanged and swallow exactly the case
§6.4 calls out; that is regression R12 below.

**The debounce.** `startBandHold` / `stepBandHold` are a pure state machine over wall-clock
milliseconds supplied by the caller — step 8 drives it from its own clock or from fake
timers. A band is confirmed once it has been observed continuously for `DEBOUNCE_MS`
(10 s) of wall time **since it was first seen**. `confirmedSinceMs` carries the first
sighting, which is the timestamp §6.4's banner needs for "when it started" — not the later
confirmation instant. Reading of the spec's cadence sentence: at 30 s cadence **one further
sample** confirms (30 s ≥ 10 s), at 1 s cadence it takes ten more; both are tested. An
unchanged hold is returned **by identity**, so step 8 can compare with `===`.

---

## 7. `pnpm verify` — the real output, with its exit code

```
$ export PATH="$HOME/.local/bin:$PATH"
$ cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
$ pnpm verify
$ tsc --noEmit && vitest run
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard

 Test Files  7 passed (7)
      Tests  484 passed (484)
Type Errors  no errors
   Start at  17:00:30
   Duration  333ms (transform 57%, typecheck 22%, import 12%, tests 7%, worker 2%)

exit=0
```

**exit=0 is the claim.** 484 = step 1's 57 + 195 (format) + 143 (severity) + 46 (throttle) +
43 (conditions). Every test file compiles — HANDOVER §1's third trap is a file that fails to
compile and *loses* its tests from the count, so the arithmetic above is checked, not assumed.

`pnpm build` was not run: nothing under `app/` was touched.

---

## 8. The deliberate regressions — evidence that the tests bite

Each was applied to the implementation, the suite was run, and the file was restored. Every
one exited **1**. The exact patches are in `regressions.py` beside this file — `python3 regressions.py`
from `dashboard/` applies each break, runs the affected suite, restores the file, and
prints the table below.

| # | Break | Result | First failures |
|---|---|---|---|
| R1 | `render` uses a falsy check (`v ? … : EM_DASH`) — the classic "0 is absent" bug | `39 failed \| 156 passed` | every "§6.6 law 2" row |
| R2 | `EM_DASH = ''` (blank instead of the dash) | `17 failed \| 178 passed` | every "§6.6 law 1" row |
| R2b | `EM_DASH = 'N/A'` | `17 failed \| 178 passed` | every "§6.6 law 1" row |
| R3 | swap formatted at 1 dp like RAM | `6 failed \| 188 passed` | `swap 0.02 → 0.02 GiB` |
| R4 | HIGH band starts *above* 192 | `2 failed \| 192 passed` | `pwm 192 is HIGH` |
| R5 | GPU temp alarm at `> 80` instead of `>= 80` | `2 failed \| 141 passed` | `80 °C → alarm` |
| R6 | engaged fan5 band applied in every mode | `7 failed \| 136 passed` | `ec-auto: the EC's healthy 2210 RPM is NOT an alarm` |
| R7 | engagement inferred from `ch5Mode` alone, ignoring `ch5Pwm ≥ 192` | `5 failed \| 138 passed` | `manual pwm 191 … → engaged false` |
| R8 | `pwm5Present === null` read as the alarm | `3 failed \| 140 passed` | `null → watch` |
| R9 | unknown throttle bits silently dropped | `5 failed \| 41 passed` | `0x10 — NVML sync boost` |
| R10 | unknown throttle bit treated as alarm | `4 failed \| 42 passed` | `watch, not alarm` |
| R11 | "normal, not a fault" attached to every mask | `5 failed \| 41 passed` | `0x8 does NOT carry the note` |
| R12 | `changed` compared with the first severity instead of sticky | `1 failed \| 42 passed` | `§6.4 verbatim: it clears and later REGRESSES` |
| R13 | standing overwrites the real severity | `2 failed \| 41 passed` | `the real severity is never overwritten` |
| R14 | debounce confirms on the first poll in the new band | `3 failed \| 40 passed` | `9,999 ms is not enough and 10,000 ms is` |
| R15 | `worstSeverity` calls an all-null panel `normal` | `5 failed \| 138 passed` | `[] → null` |

**Type-level assertions bite too, and they fail at the `tsc` step before Vitest runs.**
Loosening `formatMiB(v: MiB \| null)` to `number \| null`:

```
$ pnpm typecheck
lib/format.test.ts(498,5): error TS2578: Unused '@ts-expect-error' directive.
exit=1
```

That is the mechanism HANDOVER §5 describes, and it is why the three `@ts-expect-error`
groups (brand confusion, closed `UnitState`, closed `ConditionKind`) all sit **inside
`test()` bodies** as required.

Two lessons from step 1 were applied directly:

- Step 1's tests "asserted properties of *aliases* rather than of *fields*". So
  `format.test.ts` sweeps the two laws over **27 field paths of two real fixtures**, not
  over the formatters in the abstract, and `severity.test.ts` drives `severityFan5` from
  whole `Cooling` values rather than from a loose RPM.
- Every band table names the last value of one band and the first value of the next; no
  band is tested only in its middle.

---

## 9. Underspecified — invariant 7. Recorded, not decided.

**G1 · No §6.3 severity for `dkmsForRunningKernel`.** §3.6 lists it as one of the four
SAFETY checks ("Next boot loses `pwm5`"), but §6.3's threshold table has no row for it —
it has rows for ufw, `pwm5` present and "any unit" only. **No `severityDkms` was written.**
`MOCK.html` renders `DKMS for running kernel: absent` as `crit`, which is the likely
intent, but the mock is a design artefact and §6.3 is the normative table. Step 10 cannot
render the SAFETY panel completely until this row exists.

**G2 · No severity for `HealthState`.** §3.7 fixes `ok`/`unhealthy`/`unreachable`/`null`
and §6.2 puts `/health` in the SERVING row, but §6.3 bands only `unitState`. An instance
that is `active` with `health: 'unreachable'` currently has no severity at all.

**G3 · No severity for `LinkState`.** §3.5 collects `eno1`'s operstate and §6.2 displays
it; §6.3 has no row. `down` is presumably not `normal`, but that is a guess.

**G4 · SM clock separators.** §6.6 says "integer" for SM clock, while the VRAM and fan rows
say "thousands separated" explicitly. Implemented **with** separators (`1,380 MHz`), because
§6.6's locale bullet is unconditional and `MOCK.html`'s `fmtInt` is commented "VRAM MiB, RPM,
MHz". This is the only figure the decision changes.

**G5 · Channel-5 PWM state names below the HIGH band.** §6.3 pins `≥ 192` as "the HIGH
quantisation band"; §6.6 shows `HIGH pwm 255`. Nothing in SPEC.md names the state below it.
`pwmStateName` uses the driver's own quantisation from the repo's `CLAUDE.md` — 0–63 `OFF`,
64–191 `LOW`, 192–255 `HIGH`, from `clamp(DIV_ROUND_CLOSEST(val, 128), 0, 2)`. Correct
hardware behaviour, but the *display strings* `OFF`/`LOW` are not in the spec.

**G6 · The word "unavailable".** §6.5 says the cooling panel "shows the channel as
unavailable" when `ch5Mode` is `null`; `formatCh5Pwm` returns exactly `unavailable`. The
concept is spec'd, the literal string is step 2's.

**G7 · Uptime format below one day.** §3.2 pins `up 2 d 02:01` and nothing else. **No
`formatUptime` was written** rather than guess at the `< 1 d` and `< 1 h` forms. The header
needs it at step 10.

**G8 · A VRAM pair with exactly one side `null`.** §6.6 shows only the both-present form.
Implemented as `26,452 / — MiB` (law 1 applied per figure), with both-`null` collapsing to a
single `—`.

**G9 · An unparseable `ThrottleMask`.** The brand constructors do not validate, so
`throttleMask('[N/A]')` type-checks. Implemented as "no reading" → `null` → renders `—`,
never as `0`. The collector's obligation (HANDOVER §3) is to send `null`; this is a backstop
and the spec does not name the case.

**G10 · The condition-id vocabulary.** §6.4 names exactly one id, `ufw_enforcing`. Step 2
proposes nine more on a single rule — **one `ConditionKind` per row of §6.3's threshold
table**: `gpu_temp`, `gpu_throttle`, `gpu_vram`, `cpu_temp`, `ram`, `fan5`, `disk_free`,
`ufw_enforcing`, `pwm5_present`, `unit`. Needs ratification before step 8 diffs against it.
Note the vocabulary deliberately has **no** ids for G1–G3 or for a failed poll, because
those have no §6.3 band.

**G11 · `kind:subject` ids.** §6.4 says "a comma-separated list of condition ids" and does
not say whether an id can name an instance. Implemented as an extension: an id is `kind` or
`kind:subject` (`gpu_temp:0`, `unit:llama-server@1`), matched against either. Without it,
§6.3's single "Any unit" row means declaring a known-dead `llama-server@1` standing would
also silence `gpu-fan-control.service` — the one unit whose failure puts the cards on the
EC's curve.

**G12 · `ufwEnforcing === null` has no severity.** §6.3 gives the ufw row no `null` column,
unlike the `pwm5` row directly below it, so `severityUfw(null)` returns `null` while
`severityPwm5Present(null)` returns `watch`. The two three-valued safety checks are treated
differently **only because the spec treats them differently**. Worth confirming that is
intended and not an omission.

**G13 · `lib/types.ts`'s `ErrorSource` is missing `net-operstate`.** §3.7 now lists
**18** sources and explains that one at length ("deliberately separate from
`proc-net-dev`… folding them together would attribute a failed link read to the byte
counters and point the UI at the wrong figure"). `lib/types.ts` has 17 and omits it, and
`lib/types.test-d.ts` pins the 17-member union by equality. Step 2 does not use
`ErrorSource` and did not touch step 1's files — **reported for reconciliation, and it
blocks step 6** from spelling the source §3.7 requires.

**G14 · `≤ X normal / X–Y watch` names X twice.** VRAM (90), RAM (85) and disk-free (15)
are all written that way. Implemented so the **normal clause wins at the shared boundary**
— exactly 90 % VRAM is normal, 90.1 % is watch — while strict inequalities (`> 95 %`,
`< 5 %`, `> 5100`) are honoured exactly. Consistent, and the temperature rows are disjoint
as written so they need no convention. Worth one line in §6.3 to make it explicit.

**G15 · Timestamp rendering was deliberately left out.** §6.6's bullet — browser-local
timezone, zone abbreviation once in the header, ISO-8601 UTC on the wire — is not a row of
the table and depends on ambient timezone state, which this step's "pure functions only"
scope excludes. Step 8/10 owns it; it is not a gap in the spec, only a boundary.

**G16 · `THERMAL_THROTTLE_BITS`'s doc comment is stale.** The value is right for its name;
its comment says "The bits §6.3's alarm row means" and §6.3's alarm row is now four bits.
Step 2 uses its own `THROTTLE_ALARM_BITS`, derived from the table. A comment fix in
`lib/types.ts` belongs to reconciliation.

---

## 10. Decisions taken inside step 2's scope

- **Non-finite readings render `—`.** HANDOVER §3 invited a formatter-level defence:
  `celsius(NaN)` type-checks, and `NaN °C` is neither of §6.6's two cases. `readable()`
  requires `Number.isFinite`, so `NaN`/`±Infinity` render like `null`. Severity functions
  return `null` for the same inputs, and `usedPercent` returns `null` on a `0` total rather
  than banding a `NaN`. The collector's job is still to send `null` (steps 3–5).
- **`-0` is normalised to `0`.** `Intl.NumberFormat` renders negative zero as `-0`, and a
  fan reading `-0 RPM` looks like a different fault from one reading `0 RPM`.
- **`Intl.NumberFormat('en-US')`, never `toLocaleString()`.** A dropped argument would
  silently follow the host locale, and §6.6 requires a screenshot to read the same
  everywhere.
- **Network throughput that would render `1,000 KB/s` is promoted to `1.0 MB/s`.** Four
  displayed digits contradict "2 significant figures"; the promotion threshold is therefore
  ~995,000 B/s rather than exactly 1e6. `MOCK.html`'s helper prints `1000 KB/s`; this is a
  deliberate refinement, tested at 994,000 / 999,499 / 1,000,000.
- **Rounding to 2 s.f. goes through `toPrecision`**, not through scaling by a power of ten —
  `49 / 0.1` is `489.99999999999994` in binary floating point.
- **`severityFan5` and `formatCh5Pwm` take the whole `Cooling` union**, never `(mode, pwm)`.
  The union is what guarantees a PWM exists exactly when the mode is `manual`; a loose pair
  is how the engaged band gets applied in EC auto.
- **`formatCpuModel` degrades to "too long", never to a lie.** Strip trademark marks, drop a
  trailing `CPU @ …` clause, drop a leading vendor token, collapse whitespace; if the result
  is empty, return the trimmed original.
- **Nothing new in `lib/types.ts`** (HANDOVER §3's boundary). `ConditionKind`,
  `PwmStateName`, `BandHold` and the throttle decode types live in the modules that own them.

## 11. Deliberately not built (so the next phase does not read it as an omission)

- **No snapshot → conditions aggregator.** Building `conditionsFrom(snapshot)` would need
  severities for G1–G3, so it would either be silently incomplete or invent three bands.
  Step 8/10 assembles `Condition[]` from the per-metric functions above.
- **No `severityDkms`, `severityHealth`, `severityLink`** — G1, G2, G3.
- **No `formatUptime`** — G7.
- **No timestamp/timezone formatting** — G15.
- **No changes to `lib/types.ts`, `lib/fixtures.ts` or step 1's tests**, including the
  `ErrorSource` drift (G13) and the `THERMAL_THROTTLE_BITS` comment (G16).
