# Step 2 — Format & severity core — RECONCILIATION

`pnpm verify` → **exit 0, 597 tests, 7 files.** Full output in §5.
`python3 pipeline/steps/02-format-severity/regressions.py` → **exit 0, all 38 bite.**

I worked the review's §6 list in its order (MUST, then SHOULD, then the DEFER list), and
then implemented what the amended `SPEC.md` requires of this step. `SPEC.md`, `MOCK.html`
and `PLAN.md` were not edited. Nothing was committed.

**The spec moved under this step.** `SPEC.md` is now 907 lines and carries the review's
fourteen accepted rows plus row 15. Nine of those rows *are* step-2 work, so a large part
of this pass is not "apply a finding" but "implement a section that did not exist when the
build phase ran": three new §6.3 bands, the ratified §6.4 condition-id vocabulary with its
malformedness rules, §6.6's PWM state strings and unreadable-duty case, §3.2's three
uptime forms, and §9's dot/count/dedupe rule.

---

## 1. What changed, and why

| File | was | now | What moved |
|---|---|---|---|
| `lib/types.ts` | 656 | 662 | `ErrorSource` gains `net-operstate` (A5) |
| `lib/types.test-d.ts` | 768 | 769 | the equality pin follows it (A5) |
| `lib/format.ts` | 284 | 362 | one PWM quantisation, widened to `null`; `formatUptime`; `formatPort` |
| `lib/severity.ts` | 272 | 413 | three-valued engagement; fan5 split in two; `severityDkms`/`severityHealth`/`severityLink`; `severityUfw` total; branded percentages |
| `lib/conditions.ts` | 336 | 524 | **rewritten**: the composed `observePoll`, §6.4's ratified vocabulary, §9's aggregate |
| `lib/format.test.ts` | 596 | 750 | the unreadable duty, uptime, port, the SERVING sweep |
| `lib/severity.test.ts` | 444 | 662 | the new rows, the unknown-engagement matrix, brand assertions |
| `lib/conditions.test.ts` | 389 | 726 | **rewritten** against the composed pipeline |
| `regressions.py` | 15 | **38** | new mutations for every defect fixed, incl. three type-level ones |

No dependency was added (invariant 6). Nothing under `app/` was touched, so `pnpm build`
was not re-run.

### The four that carried the most weight

**A2 — the composed entry point.** `conditions.ts` no longer exports the two halves that
could be wired together wrongly. `observeConditions` and `applyStanding` are gone; in
their place is one function:

```ts
observePoll(state, observations, standing, nowMs) -> { state, displayed }
```

It owns the `BandHold<Severity>` map **and** the ledger, and it applies §6.4 in the only
order that satisfies it: **dedupe by id → debounce → ledger → standing**. The input type is
`ConditionObservation`, whose severity field is named `rawSeverity`, and the output type is
`DisplayedCondition`, whose `severity` is the **confirmed** band. There is no longer a type
in this module called `Condition` whose severity has no stated provenance — which was the
actual defect. The `severity` field on the output is the truth §6.4 names in the row and
standing never overwrites it.

`conditions.test.ts` was rewritten because it modelled the wrong composition. It now drives
everything through `observePoll`, and one test is §6.4's own example: `STANDING=gpu_temp:0`,
1 s cadence, `alarm alarm watch alarm alarm alarm` — the condition stays suppressed for all
six polls and never banners. Regression **R25** (feed the ledger `o.rawSeverity`) and
**R26** (display the raw band) both bite.

`observePoll` also takes `StandingIds` rather than a bare `Set<string>`, so
`parseStandingIds` is the only door into the standing mechanism — which is what §6.4's
"configured, never inferred" means, and it is what makes A9's and A10's rules unbypassable.

**A1 — the sticky rule is pinned, with a fourth observation.** Three tests, at three
altitudes: the fold itself over four observations; `observePoll` over four confirmed bands
asserting `banner === [false, false, true, true]`; and a six-band run asserting every poll
after the regression still banners. R12 is retained *and* the straw-man it was is recorded:
**R12b** drops `prev.changed ||`, which is the natural wrong implementation, and it now
fails. I did not weaken stickiness to resolve A2 — A2 was fixed at its input, as the review
required.

**A3 + R2 — one definition of `≥ 192`.** `pwmStateName` is now the only place the boundary
is written, and `ch5Engagement` reads engagement from it (a test asserts the two agree
across `0, 63, 64, 191, 192, 255`, so they cannot drift). `pwmStateName` returns
`PwmStateName | null`, with `null` for a non-finite duty **or one outside the 0–255
register**; `formatCh5Pwm` renders `—` for it, per §6.6. Brand-constructor validation was
not added — see §3.

**A5 — `net-operstate`, four artefacts in one pass.** `lib/types.ts`, the equality pin in
`lib/types.test-d.ts`, HANDOVER §3's "the 18 names in §3.7", and HANDOVER §9's closed-drift
row so step 6 does not re-report it and nobody "corrects" the union back. §3.7 needed no
edit — it was already right. A one-line doc note in `types.ts` records *why* the source is
separate, which is the fact a later simplification would destroy. **R36** re-removes the
member and `tsc` fails.

### One deliberate deviation from the review, argued

**`severityFan5` returns `null` for an unreadable duty — except when the absolute row
fires.** The review's MUST reads "`severityFan5` returns `null`, not `normal`, when the
mode is `manual` and the duty is unreadable". Taken literally that also discards §6.3's
*absolute* row, which is written unconditionally and whose basis is "**14451 RPM once hung
POST** — an implausible tach is the early warning, not a cosmetic glitch". Losing a real
hardware alarm because an *unrelated* field failed to parse is a worse outcome than the one
being fixed, and it is not what the review was arguing for: its stated principle is that
returning `normal` "asserts health from a parse failure", and returning `alarm` asserts no
such thing.

So: unknown engagement yields `null` when the absolute row says `normal`, and `alarm` when
it says `alarm`. Every case the review's evidence names (`pwm NaN` + `0 RPM` → was
`normal`) now returns `null`. Tested both ways, and **R18** (return `absolute` instead)
bites on the stalled-fan cases.

The two §6.3 fan5 rows are also now separately addressable — `severityFan5Absolute` and
`severityFan5Engaged` — because §6.4's ratified vocabulary gives them **two** condition ids
(`fan5_absolute`, `fan5_engaged`) where the build had one kind called `fan5`.
`severityFan5` remains, as the colour of the COOLING panel's single RPM figure.

### What the amended spec required, beyond the findings

| §6.3 / §6.4 / §6.6 / §3.2 / §9 row | Implemented as |
|---|---|
| `dkmsForRunningKernel` band | `severityDkms` — **total**, `null` → watch, mirroring `pwm5Present` |
| `/health` band | `severityHealth` — `ok`/`unhealthy`/`unreachable`/`null` → normal/watch/alarm/**no severity** |
| `eno1` link band | `severityLink` — all seven `LinkState` values, exhaustive switch |
| ufw's `null` column | `severityUfw` is now **total**; `null` → watch. A test asserts the three three-valued safety checks agree with each other at every value |
| boundary convention | already correct; the doc comment now cites §6.3 instead of "the step-2 notes" |
| throttle normal column | already correct; comment quotes §6.3's new wording |
| condition-id vocabulary | 14 kinds in `CONDITION_KIND_RULES`, a `Record<ConditionKind, …>` so a new kind cannot be added without deciding whether it is a singleton |
| singleton / `unit` / empty-subject rules | all four enforced in `parseStandingIds`; **R31/R32/R33** |
| PWM state strings + unreadable duty | `pwmStateName` / `formatCh5Pwm`, above |
| SM clock separator | already grouped; comment now quotes §6.6 |
| VRAM split-null | already per-figure; comment now quotes §6.6 |
| three uptime forms | `formatUptime` — `up 2 d 02:01` / `up 02:01` / `up 14 min`, `—` for `null` |
| §9's dot, count and dedupe | `aggregateSeverity` + `alarmCount` over `displaySeverity`; dedupe by id inside `observePoll` |

---

## 2. Every finding, with its disposition

### The adversarial's findings

| # | Disposition |
|---|---|
| **A1** sticky rule untested | **Applied.** Three tests + R12b. R12 was a straw man and is recorded as one; it is kept because it still bites a *different* wrong fold. |
| **A2** ledger fed raw severities | **Applied**, as the composed `observePoll`. Both halves of the seam are now unreachable separately. |
| **A3** non-finite / out-of-range PWM | **Applied**, at the shared quantisation, with the deviation argued above. |
| **A4** §9's count and the `severity`-vs-`displaySeverity` ruling | **Applied as the review reshaped it.** The count was not missing — `bannerConditions().length` was always it. What was missing was the *rule*, and §9 now states it. `alarmCount` and `aggregateSeverity` are exported so step 10 does not write its own; both read `displaySeverity`, so the dot, the count and the banner cannot disagree. **R29** bites. |
| **A5** `ErrorSource` drift | **Applied**, four artefacts, atomically. |
| **A6** swap 2 dp vs its stated purpose | **Rejected**, per the review: the code does exactly what §6.6 says, 4 MiB of resident swap is Linux background noise, `severitySwap` bands it `normal` at any rendering, and a third case in a two-law module costs more than it buys. Spec row declined by the owner. |
| **A7** the `-0` guard's comment overstates it | **Applied as a comment fix only.** The proposed "normalise the rounded value" is **rejected** — it would render a genuinely negative `cpuPct` delta as `0.0 %` and hide a collector bug. The clamp obligation is on step 3, in HANDOVER §5. |
| **A8** `notable` on an idle card | **Rejected on measurement.** The review queried the box: `clocks_throttle_reasons.active = 0x0` on both idle cards, three samples. `notable` is unchanged. Its second finding is kept and is load-bearing: `clocks_throttle_reasons.supported = 0x1FF`, so `0x10` **is** a bit this driver can set — the unknown-bit path is not hypothetical and its tests stay. |
| **A9** bogus subject silently accepted | **Applied in full**, not only the safe half, because spec row 9 landed and ratified the singleton rule. `ufw_enforcing:yes`, `gpu_temp:` and `unit:` are all reported as unknown. |
| **A10** bare `unit` silences the fan service | **Applied.** `unit` requires a subject; a bare `unit` is malformed. A test builds the exact scenario — `STANDING=unit`, `gpu-fan-control.service` failed — and asserts it still banners. |
| **A11** §6.3's throttle normal column | **Applied as a spec row** (the owner took it); implementation already gave the only sane answer, and the comment now quotes the new text. |
| **A12** `logOncePerSession` | **Applied as the review's stronger form: deleted**, not renamed. It was `suppressed` under a second name with no state, and a field a step-8 implementer can write `if (d.logOncePerSession) log(d)` against is a trap whatever it is called. The obligation moves to step 8 (HANDOVER §4). |
| **A13** dead `?? 'normal'` | **Applied.** `severityFan5` was restructured; the `??` is gone and `grep` confirms none remains in `lib/`. |
| **A14** identity on a backwards clock | **Applied.** The clock-backwards branch returns `state` when there is no pending run. **R30** bites. |
| **A15** SERVING omitted from the sweep | **Applied.** `servingIdentityOnly` and `servingInstances` are now swept for `port`, `ctx` and `model`, including the stopped-instance case where the env file parsed and the process did not answer. |
| **A16** `0.00040 KB/s` | **Rejected**, per the review: spec-conformant and cosmetic; a floor string is a third rendering in a two-law module. |
| **A17** integer bands on a real reading | **Rejected**, per the review: `fanN_input` is an integer from sysfs. Unreachable. |

### The build's own gaps

| # | Disposition |
|---|---|
| **G1** no `severityDkms` | **Closed** — spec row 3 landed; `severityDkms` written. |
| **G2** no `HealthState` severity | **Closed** — spec row 4 landed; `severityHealth` written. |
| **G3** no `LinkState` severity | **Closed** — spec row 5 landed; `severityLink` written. |
| **G4** SM clock separators | **Closed** — spec row 12 landed; implementation unchanged, comment now quotes it. |
| **G5** `OFF`/`LOW` state names | **Closed** — spec row 11 landed and names the strings and both boundaries. |
| **G6** the word "unavailable" | **Rejected** (spec row declined). §6.5 already uses the concept and the word; only the literal cell string was step 2's, and it stays. |
| **G7** `formatUptime` | **Closed** — spec row 13 landed; written here rather than deferred to step 10, since the forms are now pinned. |
| **G8** half-`null` VRAM pair | **Closed** — spec row 15 landed and matches what was implemented. |
| **G9** unparseable `ThrottleMask` | **Rejected** as a spec row, per the review: §3.7's own argument and §4 already force `null`. Code unchanged. |
| **G10** condition-id vocabulary | **Closed** — spec row 9 landed. The implemented vocabulary changed to match: `fan5` became `fan5_engaged` + `fan5_absolute`, and `health`, `dkms_for_running_kernel` and `link` were added. 10 kinds → **14**. |
| **G11** `kind:subject` ids | **Closed** — ratified, with both halves (A9, A10). |
| **G12** `severityUfw(null)` | **Closed** — spec row 7 landed and made it watch; `severityUfw` is now total. |
| **G13** `ErrorSource` drift | **Closed** — see A5. |
| **G14** shared-boundary convention | **Closed** — spec row 6 landed; implementation unchanged. |
| **G15** timestamps | **Not a gap** — a scope boundary. Still step 8/10's; recorded in HANDOVER. |
| **G16** `THERMAL_THROTTLE_BITS` comment | **Rejected**, per the review's re-adjudication on the full comment text: its second paragraph already says exactly what the finding claimed was missing. No edit to `lib/types.ts`'s constant or its comment, and `THROTTLE_ALARM_BITS` is **not** unified with it — the two answer different questions and a test pins the difference. |

### The review's own findings

| # | Disposition |
|---|---|
| **R1** unbranded `usedPercent`/`freePercent` | **Applied.** Both are now `<T extends number>(used: T \| null, total: NoInfer<T> \| null)`. `usedPercent(mib(26452), gib(61))` and `usedPercent(26452, 32768)` are both compile errors, asserted with `@ts-expect-error`; **R35** makes the directive unused and `tsc` fails. |
| **R2** `≥ 192` written twice | **Applied** as part of A3. |
| **R3** delete `logOncePerSession` | **Applied** — see A12. |
| **R4** no join to the banner's start timestamp | **Applied.** `DisplayedCondition.sinceMs` is `hold.confirmedSinceMs` — the first sighting of the confirmed band, not the confirmation instant. **R27** bites. No separate `BandHold` map for step 10 to key by hand. |
| **R5** one reading, two panels, two conditions | **Applied.** `observePoll` dedupes by id, first observation wins. The test uses the real case: `cooling.serviceState` and `safety.fanServiceState` as two observations of `unit:gpu-fan-control.service` → one condition, `alarmCount` 1. **R28** bites. |
| **R6** the dot is incomplete until G1–G3 close | **Closed** — G1–G3 closed, so the reduction now sees every §6.3 row. Recorded in `aggregateSeverity`'s doc and in HANDOVER, with the standing rule: a panel reading with no §6.3 band is invisible to the dot. |
| **R7** public surface usable without adapters | **Recorded.** `conditionsFrom(snapshot)` is still not built and is step 8's, as **one** function; the formatter `parts` variant is still step 9's. HANDOVER §4 carries both, including that splitting a formatted string on whitespace is not a workaround. |

### Explicitly not done

Everything in the review's "EXPLICITLY NOT DOING" list was honoured: A8, G16, A6/A16/A17/
G6/G9/G15, A7's proposed fix, brand-constructor validation, and removing
`THROTTLE_ALARM_BITS`. Nothing on any list was silently dropped.

---

## 3. Brand-constructor validation — restated, because it is the first thing a fresh agent reaches for

A3's fix is about a `Pwm` that is `NaN` or `1000`. The obvious fix is to make `pwm()`
reject it. **Do not.** HANDOVER §3 and §5 both forbid it and the reason is load-bearing:
the constructors are `v as T`, erased at runtime so the JSON stays plain numbers. A
validating constructor is either a lie (erased anyway) or a runtime cost on every field of
every poll, and it would put the parse decision somewhere the collector cannot see it. The
defence lives in the formatter and the severity band, and the *range check* is step 4's —
because `Number('')` is `0`, a finite value no formatter guard can catch.

---

## 4. New spec gaps for the owner — invariant 7

Small, and none blocks a later step, but they are recorded rather than assumed.

**S1 · §6.6 has no row for a TCP port.** §6.2 puts it in the SERVING row and `MOCK.html`
renders `":" + port`. Law 1 still applies — `servingIdentityOnly` has `port: null` and it
must render `—`, not a blank — so `formatPort` exists and renders the bare integer
**ungrouped** (`8080`, never `8,080`), on the reasoning that a port is an identifier and not
a measured quantity, so §6.6's locale bullet does not govern it. One line in §6.6's table
would settle it. The colon in `:8080` is treated as the panel's layout, not part of the
figure.

**S2 · §3.2's uptime forms do not say what happens below one minute.** `up 14 min` is
pinned; a box up for eleven seconds is not. Implemented as `up 0 min` (law 2 — it is a
reading), truncating rather than rounding so the figure never claims a minute that has not
elapsed. Also unstated, and implemented conservatively: the day count is **not**
thousands-separated (`up 1234 d`), for the same reason as S1.

**S3 · §6.4's condition-id table gives `health` the subject "instance index", while §6.4's
own `unit` example uses a full unit name (`unit:llama-server@1.service`).** So a failed
`llama-server@1` produces `unit:llama-server@1.service` *and* `health:1`, keyed differently
for the same card. That is defensible — they are two different readings — but §6.2 joins
serving data to a GPU card by instance index, and step 10 will want one join key. Worth one
line saying whether `unit`'s subject is the unit name (as §6.4 shows) or the instance.

**S4 · §6.3's `fan5` absolute row and §6.6's "manual, duty not a reading" case interact,
and neither names the other.** §6.6 says give the band no severity; §6.3's absolute row is
written unconditionally. I resolved it as "no severity unless the absolute row alarms" and
argued it in §1; a clause in either place would make it not a judgement call.

**S5 · §9's "the count is omitted when zero" is a rendering rule with no home in §6.2.**
§6.2 spells `❙❙ paused · 6 alarms` but not the zero form. §9 covers it, so this is only a
cross-reference; noting it because step 10 reads §6.2 for the header.

---

## 5. `pnpm verify` — the real output, with its exit code

```
$ export PATH="$HOME/.local/bin:$PATH"
$ cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
$ pnpm verify
$ tsc --noEmit && vitest run
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard


 Test Files  7 passed (7)
      Tests  597 passed (597)
Type Errors  no errors
   Start at  17:51:09
   Duration  324ms (transform 53%, typecheck 21%, import 17%, tests 7%, worker 2%)

exit=0
```

**`exit=0` is the claim.** 597 = step 1's 57 + 234 (format) + 192 (severity) + 46
(throttle) + 68 (conditions). Every test file compiles, so the arithmetic is checked rather
than assumed — HANDOVER §1's third trap is a file that fails to compile and *loses* its
tests from the count.

`pnpm build` was not run: nothing under `app/` was touched.

### The regressions

```
$ python3 pipeline/steps/02-format-severity/regressions.py
... 38 entries, every one exit=1 ...
All 38 regressions failed their check, as they must.
exit=0
```

`regressions.py` gained a fourth check kind: an entry whose check is `types` runs
`pnpm typecheck` instead of `pnpm vitest run`, because Vitest's `typecheck` block covers
only `*.test-d.ts` — a loosened brand shows up as an **unused** `@ts-expect-error` in a
`.test.ts` and only `tsc` sees it. R34/R35/R36 use it.

New entries, each pinning a defect fixed in this pass: **R12b** (sticky `changed`, the
four-observation divergence), **R16/R17** (an unreadable or out-of-range PWM duty given a
state), **R18** (a stalled fan at HIGH banded `normal`), **R19** (three-valued engagement
folded back to a boolean), **R20** (uptime always in the day form), **R21/R22/R23/R24**
(the four new/changed §6.3 bands), **R25/R26** (the ledger or the display fed the raw
per-poll severity), **R27** (banner timestamp), **R28** (no dedupe), **R29** (the aggregate
reducing the true severity), **R30** (backwards-clock identity), **R31/R32/R33** (the three
`STANDING` malformedness rules), **R34/R35/R36** (type-level: brands and `ErrorSource`).
Existing entries R4, R6 and R7 had their anchors updated to the restructured code and still
bite.
