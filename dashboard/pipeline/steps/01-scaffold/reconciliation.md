# Step 1 — Scaffold & contract · reconciliation notes

Written 2026-09-06. This phase applied the review's MUST list, then its SHOULD list, and
closed the step. **`SPEC.md`, `MOCK.html` and `PLAN.md` were not modified. Nothing was
staged and nothing was committed.**

The context that matters before reading anything below: **`SPEC.md` changed between the
review phase and this one.** It is now 835 lines and carries a new **§3.7 "Closed
vocabularies"**, written by the owner from the review's gap list. §3.7 is authoritative and
it closes, on its own, every one of the twelve spec gaps the review consolidated — plus it
*overrides* one of the review's MUST items (M4). Where §3.7 and an earlier phase's
reasoning disagree, §3.7 wins and the deviation is recorded here.

---

## 1. What changed

| File | Change |
|---|---|
| `package.json` | **new `verify` script**: `tsc --noEmit && vitest run` |
| `.gitignore` | `AGENTS.md` / `CLAUDE.md` **un-ignored** (Ruling 1), with the reasoning left in place |
| `lib/types.ts` | 502 → 656 lines. §3.7 vocabularies added; `Safety` renamed and retyped; `Host` gains three §3.2 fields; the wrong `pwm5Present` invariant replaced; four directive comments removed |
| `lib/fixtures.ts` | **new, 266 lines.** The canonical fixtures, exported for steps 2–10 |
| `lib/contract.test.ts` | 376 → 367 lines. Imports the fixtures; guardrails moved out; new runtime coverage for §3.4, §3.7's three-valued probe, and the throttle table |
| `lib/guardrails.test.ts` | **new, 115 lines.** The project-wide configuration guardrails, with the strictness assertion widened from five flags to eight |
| `lib/types.test-d.ts` | 417 → 768 lines. Properties A, B and C |
| `pipeline/HANDOVER.md` | rewritten for step 2 |

`app/`, `next.config.mjs`, `vitest.config.mts`, `tsconfig.json`, `next-env.d.ts` and
`pnpm-lock.yaml` are untouched. No dependency was added. Nothing outside `dashboard/` was
created or modified.

### The contract, brought into line with §3.7

| Was | Is | Source |
|---|---|---|
| `safety.dkmsBuiltForRunningKernel` | **`safety.dkmsForRunningKernel`** | §3.7 fixes the wire spelling |
| `safety.fanServiceActive: boolean \| null` | **`safety.fanServiceState: UnitState \| null`** | §3.7: "the unit's `ActiveState` string, **not** a boolean — a boolean would collapse `failed` and `inactive`" |
| `TelemetryError.source: string` | **`source: ErrorSource`** (17 values) | §3.7's closed set |
| — | **`Host.cpuModel` / `cores` / `threads`** | §3.2 gained the rows; §6.2's CPU panel needs them |
| — | **`ThrottleReason`, `ThrottleReasonName`, `ThrottleTreatment`, `THROTTLE_REASONS`, `THERMAL_THROTTLE_BITS`** | §3.7's bit table |
| `Ch5Mode = 'manual' \| 'ec-auto'` (dead) | **`Ch5Mode = Cooling['ch5Mode']`** (derived) | F11 + §3.7 |
| `pwm5Present === false ⟺ ch5Mode === null` | **`ch5Mode !== null ⟹ pwm5Present === true`**, and nothing more | §3.7, F1 |
| `HealthState` marked PROVISIONAL | confirmed, with the 503-while-loading case named | §3.7 |
| `UnitState` doc: "`reloading` and `deactivating` are unmapped" | all six mapped, per §3.7 | §3.7 |

**The wrong comment is gone.** `lib/types.ts:421-423` used to instruct a later step to
derive `pwm5Present` from `ch5Mode`. That is the sentence that would have manufactured a
"GPU fan control is gone" banner out of an unmounted `/sys`, and a *directive* comment gets
obeyed rather than merely believed. It is replaced by §3.7's one-directional rule stated as
a fact about values, plus a pointer to `HANDOVER.md` for the obligation on the collectors.
The same treatment was applied to the other three directives the review found (R1).

---

## 2. Disposition of every finding

### 2.1 The fourteen adversarial findings

| # | Disposition | Detail |
|---|---|---|
| **F1** — `pwm5Present ⟺ ch5Mode === null` is false | **APPLIED** | Comment replaced with §3.7's one-directional rule; the `nothingReadable` docstring corrected (it now says the *probe could not be performed*, which is why `pwm5Present` is `null` and not `false`); three fixtures added covering all three values of `pwm5Present` against `ch5Mode === null`; two runtime tests assert the implication and its contrapositive over every fixture. Verified: setting `nothingReadable.pwm5Present` to `false` — exactly what the biconditional would produce — now fails 2 tests |
| **F2** — vocabularies asserted as aliases, not fields | **APPLIED** (Property B) | Every field of every contract type is pinned by name. Verified: `Network['link']` → `string \| null` and `ServingInstance['unitState']` → `string \| null` each now fail by name |
| **F3** — `T \| null \| undefined` passes every gate | **APPLIED** (Property C) | `UndefinedKeys<T>` census asserts `never` for all 14 types. Verified: `memTotalGiB: GiB \| null \| undefined` now fails |
| **F4** — removing a brand is invisible | **APPLIED** (Property A) | `IsNominal<Branded, Underlying>` for all 15 brands, plus a distinctness check across the five most confusable pairs. Verified: `MiB = number` now fails |
| **F5** — the summary lies on a failing run | **APPLIED** | `pnpm verify` added; HANDOVER declares exit 0 as the definition of green and forbids grepping the summary; `lib/guardrails.test.ts` asserts the script's exact text so it cannot be quietly weakened. Re-measured — see §3 |
| **F6** — the build's stated reason for `test()`-body assertions is wrong | **APPLIED** | The comment at `types.test-d.ts` now says what is actually true: a module-scope error **does** fail `pnpm test`; what it does not do is appear in the counters. The structure is kept, for attribution and legibility. The false claim is not carried into HANDOVER |
| **F7** — §3.4 has no runtime coverage | **APPLIED** | Property B pins all six `ServingInstance` fields; `servingIdentityOnly` and `servingPopulated` fixtures added, with two tests. Verified: `port: number \| null` now fails |
| **F8** — COOLING and SAFETY can contradict | **APPLIED, but not by the review's remedy — see §2.3** | §3.7 requires `fanServiceState` on the wire, so it could not be deleted. Retyped to `UnitState \| null`, which removes the `failed`/`inactive` collapse; a runtime test asserts the two agree across every fixture; the "one D-Bus read, two panels" obligation is in HANDOVER |
| **F9a** — throttle-mask vocabulary missing from the spec | **CLOSED BY §3.7, implemented** | The bit table, the names and the neutral/alarm split now live in `lib/types.ts` as `THROTTLE_REASONS`, read from §3.7 rather than sourced from NVML. `THERMAL_THROTTLE_BITS` names §6.3's alarm set. Two runtime tests |
| **F9b** — §6.6 missing format rows | **CLOSED BY THE SPEC** | §6.6 now carries load average, context length and channel-5 PWM. Cited in the relevant doc comments; formatting is step 2's |
| **F10** — adjudication of the build's six gaps | **ACKNOWLEDGED; all six now closed by the spec** | Gap 1 → §3.2's `cores`/`threads` (field added). Gap 2 → §3.7's `health` set. Gap 3 → §3.3/§3.7 `null`. Gap 4 → §3.7's six-state severity map. Gap 5 → §3.7's `ErrorSource`. Gap 6 → §3.7's four safety names. The residual F10 raises (no last-successful timestamp on a fresh load) is closed by §3.1's "never read this session" |
| **F11** — `Ch5Mode` is dead and unasserted | **APPLIED with a deviation — see §2.3** | Not deleted: redefined as `Cooling['ch5Mode']`. Drift is now impossible, and §3.7 names the vocabulary so an importable name earns its place |
| **F12** — `gpus`/`serving` nullability | **RULING UPHELD: keep nullable** | The review's ruling stands unchanged. The `?? []` idiom is now demonstrated in a type test and recorded in HANDOVER so eleven steps do not re-litigate it |
| **F13** — no decoder; the tests model the `as` cast | **DEFERRED to steps 6 and 8** | Unchanged from the review. The instruction is in HANDOVER: no `as TelemetrySnapshot` on a `fetch` response without a decode step |
| **F14** — §2.4's root `CLAUDE.md` pointer is unowned | **DEFERRED to step 11**, recorded in HANDOVER | Still true: the repo root `CLAUDE.md` contains no reference to `dashboard/` or `SPEC.md` |

### 2.2 The review's own findings

| # | Disposition |
|---|---|
| **M1** pwm5 rule | **APPLIED** — see F1 |
| **M2** Properties A/B/C | **APPLIED** — see F2/F3/F4/F7 |
| **M3** `verify` script | **APPLIED** — see F5 |
| **M4** remove `Safety.fanServiceActive` | **REJECTED AS WRITTEN — superseded by §3.7.** See §2.3 |
| **M5** delete `Ch5Mode` | **APPLIED WITH A DEVIATION.** See §2.3 |
| **M6** correct the F6 claim | **APPLIED** |
| **M7** rewrite HANDOVER | **APPLIED** |
| **S1** export the fixtures, add two more | **APPLIED, and one further.** `lib/fixtures.ts` exports `nothingReadable`, `everythingZero`, `ch5Manual`, `ch5EcAuto`, `pwm5NodeAbsent`, `pwm5Unreadable`, `servingInstances`, `servingPopulated`, `servingIdentityOnly`. The review asked for a pair distinguishing `pwm5Present: false` from `null`; there is a **trio**, because `pwm5Present: true` with `ch5Mode: null` (a node that exists but returns `EACCES`) is the case that falsifies the biconditional in the *other* direction and §3.7 names it explicitly |
| **S2** widen the tsconfig assertion | **APPLIED** — all eight flags, `noFallthroughCasesInSwitch` included |
| **S3** un-ignore `AGENTS.md`/`CLAUDE.md` | **APPLIED.** Verified on disk: `AGENTS.md` is 678 bytes and is entirely a `BEGIN:/END:nextjs-agent-rules` block; `CLAUDE.md` is 11 bytes, `@AGENTS.md`. `git status` now lists both as untracked (i.e. trackable). **Not committed** — that is not this phase's authority. The §2.4 wording the review drafted is reproduced in §5 below for the owner to apply |
| **S4** move the four directives out of `types.ts` | **APPLIED.** All four are gone. Two became descriptive statements of fact with a pointer to HANDOVER (the pwm5 probe, the shared D-Bus read); two were work assignments (`ThrottleMask` decoding → step 2, `HealthState` confirmation → step 5) and are now HANDOVER obligations, with the type comments reduced to what the value *is* |
| **S5** declare the `@/*` convention | **APPLIED** in HANDOVER: `@/` for cross-directory imports, relative within a directory. `paths` kept, not dropped — step 9's components will import `@/lib/...` from `components/` and the alias is worth having before the first such import rather than after |
| **R1** `types.ts` carries normative directives | **APPLIED** — see S4 |
| **R2** the fixtures are private | **APPLIED** — see S1 |
| **R3** `types.ts` becoming a junk drawer | **APPLIED as a stated boundary**, in the file's own header and in HANDOVER: `lib/types.ts` is the wire contract plus §3.7's vocabularies, and nothing else. Note this step *did* add §3.7's throttle table there — argued in §2.3 |
| **R4** the brand constructors validate nothing | **APPLIED** — stated in the constructors' own comment, in HANDOVER, and as a runtime test (`constructors validate nothing, deliberately`) so the property is pinned rather than merely asserted in prose |
| **R5** split the configuration guardrails out | **APPLIED — pulled forward from DEFER.** Its stated owner is "whichever step next adds a guardrail", and M3 made this step add one. `lib/guardrails.test.ts` now holds all four; none were lost |
| **R6** five strictness flags of eight | **APPLIED** — see S2 |
| **R7** `paths` undeclared | **APPLIED** — see S5 |
| **R8** `pnpm start` is not the deployment path | **APPLIED** — recorded in HANDOVER as a step-11 fact |
| **R9** scope conformance clean | **NO ACTION** — re-checked and still true |
| **R10** the `exclude` hypothesis that did not hold | **NO ACTION** — recorded so nobody re-chases it |
| **R11** nothing committed; the `.gitignore` edit is orphaned | **RECORDED, NOT ACTED ON.** `git status` is still `M .gitignore` + `?? dashboard/`. A commit point is needed before step 11; taking one is not this phase's authority |
| **R12** brand `Gpu.index` / `ServingInstance.instance` as one `CardIndex` | **NOT DONE**, as the review recommends. Recorded in HANDOVER as an option if step 10 finds the join fragile |

### 2.3 The three places I deviated, and why

**1. M4 — `Safety.fanServiceActive` was not deleted.** The review's argument was that the
field is absent from §4's example JSON, its name is invented, and deleting it removes the
whole "fan service · failed beside Fan service active ✓" contradiction class. **§3.7 now
names `fanServiceState` on the wire and requires it to be an `ActiveState` string**, and
§4's example carries it. Deleting it would put the contract in violation of the spec, which
outranks the review.

What was actually done addresses the same failure differently, and I think better:

- retyped to `UnitState | null`, which **removes the collapse** — a boolean could not tell
  `failed` from `inactive`, and §3.7 says so explicitly;
- a runtime test asserts `safety.fanServiceState === cooling.serviceState` across every
  fixture, so a contradiction is a failing test rather than a documented obligation;
- the obligation itself ("one D-Bus read, rendered in two panels") is in HANDOVER, where
  steps 4 and 5 are required to read, rather than in a comment.

The residual is real and worth naming: the *types* still permit disagreement, and only
fixtures are tested. Making it structurally impossible needs a snapshot-wide discriminated
union, which the build considered and rejected and the review agreed with. That judgement
stands.

**2. M5 — `Ch5Mode` was redefined, not deleted.** F11's failure scenario is a step-2 or
step-9 agent importing the alias, drifting it, and switching over a union the wire never
sends. `export type Ch5Mode = Cooling['ch5Mode']` closes that completely: there is no
second place for the vocabulary to live, because the alias *is* the union. Deleting it
would have been equally safe, but §3.7 names `ch5Mode` as one of its closed vocabularies
and the other four all have importable names; leaving this one nameless invites step 9 to
write its own. A type test asserts `Equals<Ch5Mode, Cooling['ch5Mode']>` so the derivation
cannot be quietly replaced by a literal.

**3. R5 was pulled forward from DEFER.** Its trigger — "whichever step next adds a
guardrail" — fired inside this step, because M3's `verify` assertion is a guardrail. Doing
it now cost a file move; leaving it would have handed step 2 a `contract.test.ts` whose
name describes half its contents and a DEFER row with an ambiguous owner.

One thing I want to flag rather than bury: **putting §3.7's throttle table in
`lib/types.ts` sits slightly against R3's "wire contract and nothing else" boundary.** The
table is decoding data, not a wire shape. I put it there anyway because the brief directs
it and because the alternative — leaving it to step 2 — is what F9a warned about: the
names and the neutral/alarm split get sourced from NVML instead of from the spec. The
boundary I drew, and stated in the file: **`types.ts` owns the vocabulary; step 2 owns the
decoder and the rendering.** If the owner prefers it in step 2's module, it is one move.

### 2.4 Deferred work, carried into HANDOVER

Every DEFER row from the review's §5, with its status now that §3.7 exists. All of them are
in `HANDOVER.md`; none is dropped.

| Work | Owner | Status |
|---|---|---|
| Throttle-mask decode function and rendering | step 2 | **unblocked** — vocabulary now in `lib/types.ts` |
| `reloading` / `deactivating` severity | step 2 | **unblocked** — §3.7 maps all six |
| Format rules for load average, context length, PWM | step 2 | **unblocked** — §6.6 now has the rows |
| Condition-id vocabulary for §6.4's `STANDING` list | step 2 | still open; spec names only `ufw_enforcing` |
| Core/thread count **collector** | step 3 | **unblocked** — the fields exist, §3.2 names `/proc/cpuinfo` |
| The three-valued `pwm5` probe | step 4 | **unblocked** — §3.7 defines all three outcomes |
| `/health` vocabulary | step 5 | **closed** — §3.7 confirms `HealthState`; no change needed |
| `errors[].source` vocabulary | step 6 | **closed** — `ErrorSource` is now a closed union |
| No `as TelemetrySnapshot` on a `fetch` response without a decode step | steps 6, 8 | open (F13) |
| Splitting the configuration guardrails | — | **done in this step** (R5) |
| Rendering for "no successful read this session" | step 10 | **unblocked** — §3.1 now specifies it |
| Standalone server invocation, `.next/static` copy | step 11 | open (R8) |
| Root `CLAUDE.md` pointer to `SPEC.md` (§2.4) | step 11 | open (F14) |
| `jsdom`, React plugin, coverage provider, ESLint | first step that needs one | open |

### 2.5 Explicitly not done

All six of the review's NOT-DOING items were honoured: `gpus`/`serving` stay nullable; no
snapshot-wide discriminated union; `tsconfig.json` is not pinned byte-wise; the brand
constructors gained no validation; the `test()`-body layout is unchanged; nothing was
committed.

---

## 3. Verification

Every claim below was executed. Mutations ran in a throwaway sandbox (the four configs,
`lib/`, `app/`, `node_modules` symlinked) under the session scratchpad, deleted afterwards;
the real tree was never mutated. Baseline in the sandbox matched the real tree exactly
(3 files, 57 tests, exit 0).

### The five loosenings the review measured as passing at exit 0

| Mutation | Before (review's measurement) | Now |
|---|---|---|
| `Network.link` → `string \| null` | 34 passed · exit **0** | fails `every storage and network field` · exit **1** |
| `ServingInstance.unitState` → `string \| null` | 34 passed · exit **0** | fails · exit **1** |
| `Host.memTotalGiB` → `… \| undefined` | 34 passed · exit **0** | fails · exit **1** |
| `MiB` → `number` | 34 passed · exit **0** | fails `a raw primitive is not assignable to any branded unit` · exit **1** |
| `ServingInstance.port` → `number \| null` | 34 passed · exit **0** | fails · exit **1** |

### The §3.7 regressions, added because the spec now forbids them

| Mutation | Result |
|---|---|
| `Safety.fanServiceState` → `boolean \| null` | fails `every safety field, with §3.7 spelling` · exit 1 |
| `TelemetryError.source` → `string` | fails `every snapshot and error field` · exit 1 |
| `HealthState` gains a fourth member | fails `the spec-fixed vocabularies are exactly these literals` · exit 1 |
| `Gpu` gains a field with no census line | fails `every GPU field` · exit 1 |

### F1's semantics, pinned by fixture

| Mutation | Result |
|---|---|
| `nothingReadable.pwm5Present` `null` → `false` (what deriving from `ch5Mode` produces) | 2 failures, incl. `all three pwm5Present values coexist with ch5Mode === null` · exit 1 |
| `everythingZero.pwm5Present` `true` → `null` while `ch5Mode: 'manual'` | 2 failures, incl. `only the one-directional implication holds` · exit 1 |

### F5, re-measured on the current suite — and it is worse than reported

All three shapes re-measured against the final three-file suite.

A type error appended to `lib/contract.test.ts` (a test file, so its tests should have
*failed*):

```
 Test Files  3 passed (3)
      Tests  57 passed (57)
Type Errors  no errors
pnpm test EXIT=1
```

The file was not even marked failed, and its 20 tests neither passed nor failed — they were
simply not counted. `pnpm verify` names the file and line and exits 1.

A type error in `app/page.tsx`, a file no test imports:

```
 Test Files  3 passed (3)
      Tests  57 passed (57)
Type Errors  no errors
     Errors  2 errors
pnpm test EXIT=1
```

A failing type assertion at module scope in `lib/types.test-d.ts` — the shape build.md
claimed `pnpm test` could not see at all:

```
 Test Files  1 failed | 2 passed (3)
      Tests  57 passed (57)
Type Errors  no errors
pnpm test EXIT=1
```

It is seen; the run is red. It is the *counters* that stay clean, which is F6's correction.

**Three counters, all wrong, on three different red runs.** This is why HANDOVER states the
rule as *exit 0*, and why step 11 must gate the Docker build on exit status.

### `next build` no longer rewrites `tsconfig.json`

`md5` of `tsconfig.json` before and after `pnpm build`: unchanged. The rewrite the build
phase recorded was a one-time change (it set `jsx` and appended an `include` path) and has
already been absorbed. `pnpm build` exits 0 and still emits `.next/standalone/server.js`.

### The suite, green by the new definition

```
$ export PATH="$HOME/.local/bin:$PATH"
$ cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
$ pnpm verify

> ai-dashboard@0.1.0 verify
$ tsc --noEmit && vitest run
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard


 Test Files  3 passed (3)
      Tests  57 passed (57)
Type Errors  no errors
   Start at  16:29:51
   Duration  270ms (typecheck 65%, transform 23%, import 6%, tests 4%, worker 2%)

exit=0
```

34 → 57 tests: **25 added, 2 removed.** The two removed are `the declared unit of every GPU
field` and `the declared unit of every memory-ish field`, both subsumed by the field census
(which pins all 64 fields rather than the 12 those two reached). The 25 added:

| group | n |
|---|---|
| Property A — brand nominality, brand distinctness, brands-are-still-numbers | 3 |
| Property B — the field census, one test per contract type | 8 |
| Property C — the `undefined` census | 1 |
| §3.7 closed-vocabulary negatives (`ErrorSource`, `UnitState`) | 2 |
| The three-valued channel-5 probe, runtime | 4 |
| The three-valued channel-5 probe, type level | 1 |
| §3.4's runtime coverage (identity-only and populated) | 2 |
| §3.7's throttle table | 2 |
| The constructors validate nothing | 1 |
| The `verify` script's exact text | 1 |

The `?? []` idiom was folded into the existing `the GPU list is not an array until the null
is handled` test rather than added as a new one.

---

## 4. New spec gaps, for the owner

§3.7 closed all twelve gaps on the review's consolidated list. These are new, found while
implementing against it. None blocks step 2; the first two are the ones I would fix.

1. **§3.7 and §6.3 disagree about `0x80` (HW power brake slowdown).** §3.7's table marks it
   **alarm**. §6.3's "GPU throttle" row gives the alarm set as "`0x8`, `0x20`, `0x40`
   (§3.7)", which is the *thermal* set — §3.7 itself says so one paragraph later. So an
   active `0x80` is an alarm by the table and not an alarm by the threshold row, and it is
   undefined whether it raises §6.4's sticky banner. The contract encodes both readings
   (`treatment: 'alarm'` on the bit, `THERMAL_THROTTLE_BITS` excluding it) but step 2 has to
   pick one for the banner.

2. **§3.7's throttle table has no rule for an unlisted bit.** NVML also defines `0x10`
   (sync boost), and future drivers may add more. §3.7 says "Render each active bit as code
   + name"; a bit with no name has no rendering, and dropping it silently is the failure
   `ThrottleMask`'s raw-string design exists to avoid. Suggest one line: an unrecognised bit
   renders as its code alone, at neutral, and is not an alarm.

3. **No `errors[].source` covers `operstate`.** §3.5 reads `eno1`'s link state from
   `/sys/class/net/eno1/operstate`, which is sysfs, not `/proc/net/dev`. Using
   `proc-net-dev` for it would misattribute a sysfs failure to the throughput counters —
   the exact thing §6.5's error-to-figure matching is for. Either add a source name or say
   `proc-net-dev` covers the whole `eno1` reading.

4. **`hostname` is listed in §3.2's Host table but lives at the snapshot's top level in
   §4's example.** The contract follows §4 (`TelemetrySnapshot.hostname`, not
   `Host.hostname`), since §4 is the wire. One clause in §3.2 would remove the ambiguity.

5. **§6.3's `fan5` "while engaged" band has no engagement signal in the contract.** The
   band `≥ 3500 normal / 3000–3499 watch / < 3000 alarm` applies "while engaged", but
   "engaged" is not a field. `ch5Mode === 'manual'` is the obvious proxy and is probably
   right — the service only claims the channel when it drives it HIGH — but the spec does
   not say so, and reading 2210 RPM under EC auto as a `< 3000` alarm would be a false
   alarm on a healthy box. Step 2 needs the rule.

---

## 5. The §2.4 wording for `AGENTS.md` / `CLAUDE.md`

Drafted by the review, reproduced here as the brief asks. **`SPEC.md` was not edited.**

Two lines in the §2.4 tree:

```
   ├─ AGENTS.md              generated and re-added by `next dev`; committed, not ignored
   ├─ CLAUDE.md              one line, `@AGENTS.md` — points agents at the Next guidance above
```

One bullet under the boundary rules:

> **`dashboard/AGENTS.md` and `dashboard/CLAUDE.md` are generated by `next dev` and are
> committed.** Next rewrites only the text between its `BEGIN:nextjs-agent-rules` /
> `END:nextjs-agent-rules` markers, so project-specific agent notes may be added outside
> them and will survive. They are agent guidance, not design: `SPEC.md` remains the one
> document that owns the dashboard's design, and the root `CLAUDE.md` still gets only a
> pointer to it.

Verified on disk before applying the ruling: `AGENTS.md` is 678 bytes and consists entirely
of the marker block; `CLAUDE.md` is 11 bytes. No machine state, no secrets, nothing local
to this Mac.

---

## 6. Repo state at close

```
$ git status --short
 M .gitignore
?? dashboard/
```

Unchanged from the review's reading. The root `.gitignore` edit (adding
`dashboard/node_modules/`, `.next/`, `out/`, `.env*` per §2.4) is still uncommitted and
predates step 1. **A commit point is needed before step 11**, since step 12's "survives a
reboot" verification is not something to attempt from an untracked tree. Not taken here —
the repo's convention, and PLAN.md, are that commits happen only when asked.
