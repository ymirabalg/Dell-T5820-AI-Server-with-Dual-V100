# Step 4 — the cooling collector — REVIEW

## What I verified, and what I ran

```
pnpm verify                          → 16 files, 967 tests, exit=0   (before and after)
ssh ai-server (read-only)            → dell_smm at hwmon3; fan5_input 1922; pwm5 = ENODATA;
                                       GPUs 39 °C; gpu-fan-control.service active
```

**One experiment, stated in full.** I created `pipeline/steps/04-collector-cooling/zzreview-probe.test.ts`,
drove `collectCooling` against a fake node over ten duty/tach combinations, joined each result
to `lib/format` and `lib/severity`, wrote the matrix to a scratch file, then **deleted the probe
and the scratch file**. `md5 -q` on `severity.ts`, `cooling.ts`, `dell-smm.ts`, `hwmon.ts`,
`errors.ts`, `fixtures.ts`, `format.ts` is byte-identical before and after; `pnpm verify` is
967 / exit 0; `git status --short` is unchanged (` M .gitignore`, `?? dashboard/`). **No source,
test, config or spec file was edited.**

The matrix is reproduced at A1 below. It contains two rows the adversarial did not measure, and
both change the ruling.

---

# 1. The headline — A1 and G4 are ONE defect, and the fix is neither of the two proposed

## 1.1 What I measured

Every row below is `collectCooling` → `formatCh5Pwm` / `severityFan5*`, executed:

| input | `ch5Mode` | `pwm5Present` | duty renders | fan5 renders | absolute | engaged | **CELL** |
|---|---|---|---|---|---|---|---|
| duty 255, fan 0 | `manual` | true | `HIGH pwm 255` | `0 RPM` | normal | alarm | **alarm** ✓ |
| duty `EIO`, fan 0 | `null` | true | `unavailable` | `0 RPM` | normal | — | **normal** ✗ |
| duty `EACCES`, fan 0 | `null` | true | `unavailable` | `0 RPM` | normal | — | **normal** ✗ |
| duty `999`, fan 0 | `null` | true | `unavailable` | `0 RPM` | normal | — | **normal** ✗ |
| duty empty, fan 0 | `null` | true | `unavailable` | `0 RPM` | normal | — | **normal** ✗ |
| duty `ENODATA`, fan 0 | `ec-auto` | true | `EC auto` | `0 RPM` | normal | — | **normal** ✗ |
| **duty `0`, fan 0** | `manual` | true | `OFF pwm 0` | `0 RPM` | normal | — | **normal** ✗ |
| duty 255, **fan 2210** | `manual` | true | `HIGH pwm 255` | `2,210 RPM` | normal | alarm | **alarm** ⚠ |
| duty 255, fan 14451 | `manual` | true | `HIGH pwm 255` | `14,451 RPM` | alarm | normal | **alarm** ✓ |
| `everythingZero` fixture | `manual` | true | `OFF pwm 0` | `0 RPM` | normal | — | **normal** ✗ |

Two of these are mine, and they are the ones that settle the argument.

**Row 7 (`duty 0, fan 0`) is `normal` and is reachable with `ch5Mode: 'manual'`.** A fourth
`Cooling` variant does nothing for it — the duty parsed perfectly. So the defect is not confined
to the states C1 describes.

**The last row is `lib/fixtures.ts`'s own `everythingZero`** — the fixture whose doc comment reads
*"A dead fan, an idle card"* and which HANDOVER calls one half of invariant 1. **The project's
canonical dead-fan fixture bands green.** That is the cleanest possible demonstration that this is
a §6.3 hole and not a step-4 collector defect: the fixture never went near the collector.

## 1.2 The adjudication

**G4 is real, and it is the primary defect. A1 is real but is a strict subset of it.** The
adversarial ranks A1 HIGH and G4 as a footnote in the gap table; that ordering is backwards.

- The engaged band covers exactly one of the seven `fan5 = 0` states (`manual` **and** duty ≥ 192).
- The other six band `normal`, and they include **the box's normal resting state** (`ec-auto` — the
  state the machine is in right now, GPUs at 39 °C, below `AUTO_BELOW=55`).
- §6.5 already states what `0` means, in the imperative: *"A fan reading 0 RPM is a dead fan on a
  box with two passively-cooled 250 W cards."* §6.3 simply never gave that sentence a colour.

**So this is not a threshold I am inventing.** It is §6.3 being made to agree with §6.5 — and with
`MOCK.html`, which already implements the rule I am about to specify. `MOCK.html:1563` is literally
`ch.rpm === 0 ? chip("crit", "0 rpm · stalled") : …`, applied to **every** channel, with a banner
row and an event-log line for a stalled `fan 3` (lines 971, 995, 1031) and a design note at 1555:
*"a stalled fan prints the numeral 0 and an alarm chip; an unreadable [channel prints —]"* —
invariant 1, verbatim, in the design the spec was written from. §6.3 lost it in transcription.

## 1.3 One qualification neither phase records, and it changes the wording

`fan5_input` is **the reference fan's tach on hub port 1**, not the GPU shroud fans'. The repo's
`CLAUDE.md` says so directly: the arrangement *"structurally cannot"* deliver per-fan RPM for
failure detection. Therefore:

- `fan5Rpm: 0` does **not** prove the GPUs lost airflow. It proves the one instrument watching that
  path has failed.
- `fan5Rpm: 4300` does **not** prove the GPUs have airflow.

This does not weaken the case for alarming on `0` — losing the only instrument on the GPU cooling
path is itself alarm-grade, on the same logic as §3.6's `pwm5Present: false`. But the row's *basis*
column must not claim the fan is dead, and the panel must not either. The wording below says
"stopped fan or lost tach", not "the GPU fan is dead".

## 1.4 ⚠ THE RULING — exact §6.3 wording

### (a) Replace the `fan5 absolute` row

> | `fan5` absolute | 1–5100 RPM | — | **`0` RPM, or > 5100 RPM** | Two-sided, and unconditional. Nominal max 5100; **14451 RPM once hung POST**. `0` is the other impossible end: no state this channel can be commanded into produces it — LOW is 989, EC auto measures 1900–2250, HIGH 4300–4470, and `validate_curve` refuses a curve that would write OFF |

**Keep the row's label and keep §6.4's condition id `fan5_absolute`.** "Absolute" already means
"independent of engagement", which is exactly what the new clause is; renaming the row would churn
a `STANDING` config string and a `lib/severity.ts` export for nothing.

### (b) Replace the first ⚠ paragraph under the table

> **⚠ The absolute row is unconditional — it fires in every mode, including `ec-auto` and whenever
> `ch5Mode` is `null`, and including when the duty is unreadable.** The engaged band needs `ch5Mode`
> and `ch5Pwm` and yields no severity without them; the absolute row needs only the tach. It is
> **two-sided** because the tach has two impossible ends. `> 5100 RPM` is the early warning for the
> condition that once hung POST. `0 RPM` is a stopped fan or a lost tach — §6.5 already states that
> meaning, and this row is where §6.3 gives it a colour. Discarding either because an *unrelated*
> field failed to parse would trade a real alarm for tidiness.
>
> Note what `fan5_input` actually is: the tach of the **reference fan on port 1 of the hub**, not of
> the GPU shroud fans. A `0` there says the channel's one instrument has failed, which is why it is
> an alarm; a healthy reading is not by itself evidence that the cards are getting air.

### (c) Add, immediately after it

> **⚠ `0` is a reading; `null` is not this row.** `fan5Rpm: null` is a channel that produced no
> reading: it carries **no severity at all** and renders `—` (§6.5, invariant 1). Only the numeral
> `0` alarms. In JavaScript `-0 === 0`, so a corrupt `-0` is correctly treated as a stopped fan —
> the comparison must be `===`, never `Object.is`, which would let it through.
>
> **⚠ Zero is the only low reading that alarms, and it is the only one that can be.** There is no
> band between `0` and the engaged floor. LOW (989 RPM) is a state the driver can legitimately be
> in; EC auto measures 1900–2250 rather than a stable 2210 (1922 on the box today, 1915 and 1903 in
> step 4's captures); channel 3 has been observed at 604, below its own LOW preset. Any threshold in
> that range would fire on a healthy box, and §6.3's thresholds are *"from measurements on this
> machine rather than generic defaults"*. `0` is safe because the channel never passes through it:
> an engage takes the tach **up**, from ~2210 to 4300+.

### (d) Add a row for the other four channels

> | `fan1`–`fan4` stopped | ≥ 1 RPM | — | **`0` RPM** | Every one of these headers has a fan attached, and `fan1` is the CPU heatsink fan. `0` is a stopped fan or a lost tach; `null` is a channel that did not enumerate and carries no severity. Idle readings run as low as 604, so `0` is the only value on these channels that can be judged. They have **no upper row**: the EC does not modulate them under GPU load and no nominal is documented for them |

### (e) §6.4's condition-id table gains one kind

> | `fan_stopped` | channel index — `fan_stopped:3` | no |

> **Channel 5's zero is *not* a `fan_stopped` subject.** It is carried by `fan5_absolute`, whose row
> now has two sides. One tach must never produce two conditions (O3), and `fan5_absolute` is already
> in `STANDING`'s vocabulary.

### (f) Append to the existing engaged-band ⚠ paragraph — a finding of my own

> **⚠ The engaged band alarms for the whole spin-up after an engage, and that is not a fault.**
> `pwm5` reads back the commanded duty immediately while the tach climbs from EC auto's ~2210 to
> HIGH's 4300+, so `fan5` bands **alarm** across the ramp (measured: duty 255 with the tach at 2210
> → `alarm`). §6.4 deliberately does not debounce cell colour, so the cell **will** flash red on
> every engage, and on this box an engage happens whenever the GPUs cross 55 °C. Whether it also
> *banners* depends on whether the ramp exceeds §6.4's 10 s hold — **which has never been measured
> here.** `CLAUDE.md` records only the ~50 s spin-*down* and the `2243 → 4380` transition with no
> duration; it carries **no spin-up figure at all**, so the "roughly 12 seconds" premise is not
> something the repo supports. At the 5 s default cadence one or two polls land inside the ramp
> regardless. Measure it read-only (sample `fan5_input` across a natural engage while the cards are
> hot) before choosing between raising `fan5_engaged`'s hold to 30 s — matching `HIGH_DWELL`, a
> number the machine already uses — and accepting the transient.

### (g) §6.5 needs no edit

It already says the right thing. The new rows are derived *from* it; that is the argument for them.

## 1.5 Answers to the four questions you asked

| question | ruling |
|---|---|
| Should `0` alarm whenever the channel exists at all? | **Yes**, for all five channels, at **alarm**, unconditional on mode. `null` still carries no severity. |
| Is there a low-but-nonzero band? | **No. Decline.** The only defensible non-zero number is the reference fan's own datasheet minimum (Arctic P8 Max, 500 RPM) — and baking a field-replaceable part's datasheet into §6.3 makes the spec wrong the day it is swapped. Everything between 1 and 989 is invented; everything above 989 fires on legitimate states. Record the reasoning so it is not re-litigated. |
| Extend to `fan1`–`fan4`? | **Yes, at alarm, uniform.** A blanket *watch* would under-call `fan1`, which is the CPU heatsink fan; a per-channel severity split would invent structure with no measured basis; and `MOCK.html` already treats all five alike. The cost is that a dead chassis fan holds §6.4's sticky banner — which is precisely what §6.4's **standing conditions** exist for, and `fan_stopped:<n>` is a well-formed id for one. |
| Can any of it false-alarm during spin-up? | **The zero clause: no, structurally** — the channel goes 2210 → 4300 and never passes through 0, and the fans spin from POST. That asymmetry is the whole reason `0` can be unconditional where a low-nonzero band cannot. **The existing engaged band: yes, certainly for the cell and possibly for the banner** — see (f). That is a pre-existing §6.3/§6.4 interaction the zero clause neither creates nor worsens. |

## 1.6 Consequences to expect when this lands

- `lib/severity.ts` — one line: `severityFan5Absolute` becomes `value > 5100 || value === 0 ? 'alarm' : 'normal'`.
  `severityFan5`'s existing `'unknown'` branch already propagates an absolute alarm, so it needs no change.
- `lib/fixtures.ts`'s `everythingZero` will start banding alarm on all five channels. **That is correct** —
  it is the fixture named "a dead fan" — and steps 9/10 must expect it.
- Steps 8/10 gain `fan_stopped` as a non-singleton kind.
- This is a `lib/severity.ts` edit and that is step 2's file. Take it in reconciliation anyway: the
  alternative is carrying a documented green-on-dead-fan into steps 9 and 10, which are the steps
  that put it on a screen.

---

# 2. The fourth `Cooling` variant — **DECLINE**

The adversarial's recommended fix. I reject it, on four grounds, the third of which is a correction
to the adversarial's own reasoning.

**1. It does not fix the headline scenario.** Of the seven green rows in §1.1, a fourth variant
reaches **two** (`999`, empty). `EIO` and `EACCES` are §3.7 row 5 and correctly `ch5Mode: null` —
the adversarial confirms this itself. `ec-auto` and `duty 0` it cannot touch at all. The zero clause
fixes all seven with one comparison.

**2. It would make the headline scenario *less* red, not more.** Under a fourth variant a stalled
fan on a HIGH channel with an unreadable duty gives `ch5Engagement: 'unknown'` → `severityFan5`
returns **`null`** — uncoloured. With the zero clause it returns **`alarm`**. Preferring the variant
over the clause trades an alarm for an absence of colour on the exact case the fix is for.

**3. ⚠ "A fourth variant" and "a nullable `ch5Pwm`" are the same type.** The adversarial argues the
variant is better because *"nullable-`ch5Pwm`-on-`CoolingManual` destroys the union's guarantee"*.
That is not how TypeScript narrows. Adding `{ ch5Mode: 'manual'; ch5Pwm: null }` alongside
`{ ch5Mode: 'manual'; ch5Pwm: Pwm }` gives a union whose two members share a discriminant value, so
`if (c.ch5Mode === 'manual')` narrows to *both* and `c.ch5Pwm` is `Pwm | null` — exactly the shape
the "worse" option produces. The only way to keep them apart is a **different discriminant value**,
which means a new `ch5Mode` member, which means changing §3.7's closed vocabulary and every switch
in the project. The stated advantage does not exist. (Its second fear — that a nullable duty
"re-opens `{ ch5Mode: 'ec-auto', ch5Pwm: 255 }` by symmetry" — is also unfounded: `CoolingEcAuto.ch5Pwm`
stays `null` either way.)

**4. It costs a change in step 1's file** propagating to `format.ts`, `severity.ts`, `types.test-d.ts`,
`fixtures.ts` and `contract.test.ts`, and it re-opens a decision HANDOVER §7 records as settled
(*"`Cooling` is a three-variant discriminated union"*) — for a state reachable only from junk text.

**Take instead: amend §6.6/§6.7 so the three sections agree.** The adversarial's objection to the
amendment — *"it would delete a defensive branch a prior adversarial phase earned"* — is **not
true**, and build.md §11 already says why: `ch5Engagement`'s `'unknown'` and `formatCh5Pwm`'s
`EM_DASH` branch remain reachable from **unvalidated wire data**, and O10 is still open. `pwmStateName`
guards `Number.isFinite`, so a wire payload of `{ ch5Mode: 'manual', ch5Pwm: null }` lands on
`'unknown'` at runtime today. Nothing is deleted; the branches become wire-defences, and `lib/types.ts`
should say so at the union.

**Residual loss, and it is acceptable:** with the amendment, "the duty read failed" and "channel 5
does not exist" both render `unavailable`. The information is not lost — `pwm5Present` separates them
(`true` = duty unreadable, `false` = module absent, `null` = could not look) and the `errors[]` entry
carries the reason. **Step 10 should render that difference**; noted in §8.

---

# 3. A2 — CONFIRMED, and it is a step-4 regression

Verified by reading: `cooling.ts:116` `Date.now() + timeoutMs`, `:120` `deadlineAt - Date.now()`,
`:124` `setTimeout(…, left)`. `grep -rn "Date.now()" lib --include=*.ts` outside tests returns
**exactly one hit, and it is this file.** `lib/collectors/deltas.ts` only *documents* `Date.now()` in
a comment and takes `nowMs` from its caller; `lib/conditions.ts` takes `nowMs` as a parameter;
`nodeIo.run` uses a bare `setTimeout(timeoutMs)` and reads no clock. **Step 4 introduced the only
wall-clock dependency in `lib/`.** The regression is confirmed on both counts: the hazard is real and
step 3 did not have it.

**Is `performance.now()` the whole fix?** For the clock hazard, yes — it is monotonic from process
start, needs no import (global since Node 16), returns fractional ms which `setTimeout` accepts, and
shares the monotonic base `setTimeout` itself uses. The adversarial's 51/51-unchanged result is
consistent with what I read.

**But it is not the whole fix to the deadline arithmetic.** `within()` guards `left <= 0` and nothing
guards the top, which is A7: a `timeoutMs` of `Infinity`, `NaN`, or ≥ 2³¹ silently becomes a **1 ms**
budget and blanks the whole panel. The two bugs are four lines apart and share one repair:

```
validate timeoutMs once, at the top of boundedReader — finite, > 0, ≤ 2**31-1,
else fall back to DELL_SMM_TIMEOUT_MS; then use performance.now() for both reads.
```

Fix them together, with a fixture on each side of 2³¹−1 per HANDOVER §5.

---

# 4. A6, and the structural-rule question

## 4.1 The finding is real, and worse than stated

The body is `expect(pwm5PresentFrom.length).toBe(1)`. Its **comment is also false**:

> *"A version that derived one from the other would need the other's value as an argument, which
> would not compile against these signatures."*

A unary function can call anything it likes. The comment asserts an impossibility that is not one, so
this is not merely a weak test — it is a test that *argues* for a guarantee it does not provide.

The extensional protection is real and lives in the two counter-example tests, which do go red under
T1. What is unenforced is §3.7's **structural** rule (*"never from each other"*), and the adversarial
demonstrated a behaviour-preserving coupling that passes the entire suite and all 46 mutations.

**Ruling:** rename it to what it checks (*"both are unary on `Pwm5Probe`"*) and delete the false
comment — or delete the test. Then, if the structural rule is to be enforced at all, do it the way
this project already enforces structure: a **source-text assertion in `lib/guardrails.test.ts`**,
which already asserts the `verify` script's text and `tsconfig`'s flags for exactly this reason.
Assert that `pwm5PresentFrom`'s body contains no `ch5ModeFrom(` and vice versa. Ugly, and honest.

## 4.2 Is there a structural rule for this class? — **half of it is mechanizable, and cheaply**

Four consecutive steps have shipped a test naming a property it does not check (step 2's five inert
mutations; step 3's column guard; step 3's `S47c`; now A6). The fixture-symmetry rule came out of the
third. Here is the fourth-generation rule, and it subsumes all four:

> **Every ⚠-marked test must appear in at least one mutation's red set.**
> The harness already runs each mutation and captures vitest's output. Have it record **which test
> names went red**, not merely that *something* did; union those sets across all mutations; and fail
> the harness if any test carrying the project's `⚠` marker never appears. A test that no mutation
> can distinguish is a test that cannot fail for any wrong implementation anyone was willing to write.

It is nearly free: `regressions.py` already parses `FAIL` lines, and `--reporter=json` (or the `×`
lines) gives per-test names. It catches A6 exactly — no mutation in the set of 46 changes either
function's arity, so the arity test never goes red and would be flagged. It generalises step 2's inert
mutations (the same ledger read from the other end) and step 3's `S47c` (a line whose removal reddens
nothing).

**What it cannot catch, and this part is irreducible:** a test that goes red *for the wrong reason*.
Step 4 found two of these by hand — T40 red because the file failed to compile, T41/T43 red because
`TS6196` noticed an orphaned import — and the harness scored both as passes. No ledger distinguishes
"red because the property broke" from "red". That half stays a matter of reading each test against its
own name, and build.md §10 shows the discipline already exists informally.

So: **mechanize the necessary condition; keep reading names for the sufficient one.** I would *not*
add the tempting third rule ("flag a test whose body does not reference the subject in its title") —
it is a lint over prose, it would fire on most table-driven tests, and its false-positive rate would
train people to ignore it.

---

# 5. A3 — the NUL byte. Real, and one notch worse than reported

Confirmed by scanning all 24 `lib/**/*.ts`: **exactly one NUL, in `dell-smm.test.ts`, at byte 14022** —
the `ok('\0')` literal, written raw instead of as the two-character escape. `grep -c
"classifyPwm5Read" lib/collectors/dell-smm.test.ts` returns nothing and exits 1, for 18 real
occurrences, with no "binary file" notice on BSD grep.

**The sharpening:** the adversarial says `git grep` finds it. Today it does not — `dashboard/` is
**untracked**, so plain `git grep` searches nothing in this tree at all. Only `git grep --untracked`
and `grep -a` see the file. So at this moment **no search tool anyone would reach for by default can
read that file's contents**, and ten more agent phases will search this tree. (It becomes a
`git grep`-visible file after the commit point HANDOVER §10 asks for — which is one more small reason
to take that commit point.)

Severity: MEDIUM, and it is the cheapest fix on the entire list — one character.

---

# 6. The rest, adjudicated

| # | Verdict |
|---|---|
| **A4** — no sanity floor on the presence oracle | **Real. Take.** Unreachable on a coherent filesystem (the walk just read `name` from that directory), but it is the only place §3.7's worst value is produced, and the guard encodes a free invariant. Take the **`if (!listed.has('name')) → unlocated`** form, not `entries.length === 0`: it also catches a filtered or synthetic listing that returned entries but not the one we demonstrably read. Fixture on both sides per HANDOVER §5 — a listing with `name` but no `pwm5` still yields `absent`. |
| **A5** — degradation tested only in the favourable position | **Real, and it is HANDOVER §5's rule applied to a behavioural claim.** The behaviour in the first-position case is *correct*; what is missing is the test. One more test, hang injected at `fan1_input`. **Secondary point declined:** keep the six `errors[]` entries. §6.5 requires an error matched to the figure it explains and six figures are blanked; collapsing them would make the panel show five unexplained em dashes. Record the decision so it is not re-litigated. |
| **A7** — `timeoutMs` ≥ 2³¹ / `Infinity` / `NaN` → 1 ms | **Real. Take, folded into the A2 fix.** Direction is safe (unknown, never the alarm) but the outcome — a permanently blank COOLING panel and `pwm5Present: null` every poll — is the opposite of the caller's intent, and there is no fixture on either side of 2³¹−1. |
| **A8a** — `left <= 0` unfixtured both sides | **Decline, with the reason recorded.** HANDOVER §5 exists because a wrong side of a boundary reaches a panel. At `left === 0` exactly, `<= 0` rejects now and `< 0` rejects on a 0 ms timer — **the same observable outcome, one tick apart**. The boundary is not observable, so the rule's justification does not apply. This is worth writing down as the first worked example of applying that rule with judgement rather than mechanically; step 5 will need the distinction. |
| **A8b** — `-0` on the RPM floor | **Real, and it becomes load-bearing under §1.4.** `value < 0` is false for `-0`, so `-0` → `rpm(-0)` → `0 RPM` — which is the *right* answer, and with the zero clause `-0 === 0` makes it alarm correctly. **The implementation note matters: use `===`, never `Object.is`.** No test needed; a sentence at `fanRpm` and in §6.3 (see §1.4c). |
| **A8c** — `ENODATA` equality untested against a near-miss | **Real. Take.** Verified: `dell-smm.test.ts:314` iterates `['EACCES','EIO','ENOENT','EINVAL','UNKNOWN']` — no case or whitespace variant. A mutation to `.toLowerCase()` or `.includes()` passes. The adversarial checked near-misses in its own probe; nothing in the committed suite does. Fix is two strings in an existing array: `'enodata'`, `'ENODATA '`. |
| **A9** — `pwm5` present + `fan5_input` absent, no entry | **The comment is wrong; the code is right. Fix the comment, decline the behaviour change.** The call-site justification (*"that state is already reported once, by `pwm5Present: false`"*) is false in this combination. But the combination is unreachable on this board — the DKMS patch adds `fan5_input` and `pwm5` together — and emitting an entry for it is a hedge for an impossible state, which is how `parseKernelRelease`-shaped drift starts. **Defer the rendering question to steps 9/10:** an em dash on `fan5` with `pwm5Present: true` and no `errors[]` entry is a state the panel must still render honestly. |
| **A10** — `ENOENT` on the read after a listing that had `pwm5` | **Correct as implemented. Spec clause only, no code change.** Folding it into `unreadable` is the safe direction (one stale poll, self-healing), and §3.7 should say so alongside C3. |
| **C2** — no bound specified for `dell_smm` | **Real. Take, and sharpen it as the adversarial says:** the sentence §3.3 gains must require the bound to be **monotonic**, not merely to exist. A2 is what happens when it only says "bounded". |
| **C3** — no row for "read succeeded, text is not a number" | **Real. Take.** `unreadable` + `pwm5Present: true` + `ch5Mode: null` is right, and the entry/no-entry split the build implemented is right too: junk (`''`, `auto`, `1.5`) carries an `errors[]` entry, out-of-register (`-1`, `256`, `999`) does not, per §6.7's "successful read of an impossible value". The clause should state **both halves**, because the difference is not obvious. |
| **C4** — does `pwm5Present: false` carry an entry? | **Real, low. Take the clause, keep the behaviour.** The fixture already decided it and the cost — one permanent entry per poll while the module is missing — is right: it is the only signal the COOLING panel has for why `fan5` is blank. |
| **C5** — the RPM domain | **Real, low. Take the clause**, with the `-0` sentence from A8b folded in. |
| **G4** | **Real, and it is the headline, not a footnote.** See §1. |

---

# 7. The Node skew — **pin now, but do not enforce at install**

Confirmed from HANDOVER (24.16.0 declared) against the adversarial's measurement (v26.8.1 running,
`engines` says `>=24.0.0 <25.0.0`, nothing enforces it). This step's load-bearing assumption survives:
both Nodes ship libuv 1.52.1 and both map errno −96 to `ENODATA`. **Accept step 4's result; do not
re-litigate it.**

But do not accept the drift, for one reason that is about to bite:

- **Step 7 builds argon2id.** That is the project's only native/ABI surface, and Node 24 and 26 have
  different `NODE_MODULE_VERSION`s. A prebuilt binary or a node-gyp build resolved on the desk under
  26 is not the one that runs in `node:24-slim`. Steps 11 and 12 then find it in a container, or on
  the box, where the version is not negotiable — the exact "found in the container rather than on the
  desk" failure the adversarial names.

**Take now:** `.nvmrc` **and** `.node-version` containing the pinned major (both, because nvm and
fnm/asdf read different files), plus a guardrail test asserting those files **agree with
`engines.node`**. That test is a config-consistency check and is green on any machine.

**Explicitly do not take now:** `engine-strict=true` in a project `.npmrc`. It genuinely enforces —
and it would make `pnpm install` **refuse on this Mac today**, blocking every remaining step until
someone switches Node mid-pipeline. Nor a guardrail asserting `process.versions.node`: it would turn
the suite red right now, and "green" is this project's only signal.

**Put the real gate where it belongs:** step 7 must build and test argon2id under Node 24 (nvm, or in
`node:24-slim`) before believing it, and step 11's Dockerfile is the enforcement point. Record both in
HANDOVER.

---

# 8. Consolidated spec list — **Take / Decline**, one line each

Precise, for you to paste. Exact wording for the first row is §1.4 above.

## TAKE

| § | Change |
|---|---|
| **§6.3** | Replace the `fan5 absolute` row and its ⚠ paragraph; add the two ⚠ paragraphs and the `fan1`–`fan4` row. **Exact text at §1.4 (a)–(d).** Keep the row label and the id `fan5_absolute`. |
| **§6.3** | Append the spin-up paragraph to the engaged-band ⚠ block — §1.4 (f). |
| **§6.4** | Condition-id table gains one non-singleton kind: `fan_stopped` \| channel index — `fan_stopped:3` \| no. Plus the sentence that channel 5's zero is `fan5_absolute`, never a `fan_stopped` subject (O3). |
| **§6.6** | Channel-5 PWM row: replace *"When the mode is `manual` but the duty is not a reading, render `—` …"* with: **a duty that is not a reading leaves the mode undetermined, not just the duty — it is reported as `ch5Mode: null` and renders `unavailable`, exactly like the `EACCES`/`EIO` failures §3.7 row 5 already puts there.** The contract cannot express `manual` with a null duty, and minting a `Pwm` from a value the hardware cannot produce is forbidden (O6). |
| **§6.7** | *"…a `pwm5` of `999` … becomes `null` and renders `—`"* → **"…becomes `null`. `utilization.gpu` then renders `—`; `pwm5` renders `unavailable`, because a null duty also leaves `ch5Mode` null (§6.6)."** |
| **§3.7** | Probe table gains two clauses: (i) *`pwm5` read succeeded, text is not an integer in 0–255* → `pwm5Present: true`, `ch5Mode: null`; **junk carries an `errors[]` entry, an out-of-register value does not** (§6.7). (ii) *`pwm5` vanished between the listing and the read (`ENOENT`)* → folded into "read failed some other way"; one stale poll, corrected by the next listing. |
| **§3.3** | Gains a bound sentence: the whole `dell_smm` probe — locate, list, five tachometers, `pwm5` — shares **one 2 s budget**, not one per read, because these are SMM BIOS calls into the EC and not procfs reads. **The budget must be measured on a monotonic clock (`performance.now()`), never `Date.now()`:** a backward NTP step on a wall clock extends the bound by the size of the step. |
| **§3.6 / §6.5** | `pwm5Present: false` carries an `errors[]` entry naming the missing node. The listing succeeded, so it is not a failed read — but it is the only signal the COOLING panel has for why `fan5` is blank, and it persists while the module is missing (C4). |
| **§3.3 or §6.6** | `fanN_input` is an unsigned revolution count. `-0` compares equal to `0` and is a stopped fan; `-1` and below is a corrupt read → `null` with **no** `errors[]` entry (§6.7). (C5 + A8b.) |

## DECLINE

| # | Not taken, and why |
|---|---|
| A fourth `Cooling` variant / nullable `ch5Pwm` | Does not fix five of the seven green rows, makes the headline case *less* red than the zero clause, and is the same type as the option the adversarial calls worse. §2. |
| A low-but-nonzero `fan5` band | No measured basis between `0` and the engaged floor; the only candidate number is a replaceable part's datasheet minimum. §1.5. |
| An upper RPM bound in the collector | Would replace §6.3's `> 5100` alarm with an em dash. build.md is right; do not revisit. |
| Collapsing the six timeout `errors[]` entries | §6.5 wants an error per blanked figure; six figures, six entries. A5. |
| A fixture at `left === 0` | The boundary is not observable — both sides reject, one tick apart. A8a. |
| An `errors[]` entry for `pwm5` present + `fan5_input` absent | Unreachable on this board; a hedge for an impossible state. Fix the false comment instead. A9. |
| `engine-strict=true` now | Would block `pnpm install` on the dev machine mid-pipeline. §7. |
| A guardrail asserting the running Node major | Would turn the suite red today, and green is this project's only signal. §7. |

---

# 9. My own findings

## 9.1 Four files, 794 source lines, 1,508 test lines — weight, with one pocket of ceremony

Ratio 1.9 : 1, against step 3's 1.3 : 1. Justified, on three counts: the §3.7 probe is the most
delicate contract in the project; 62 of the tests are the probe table and the O8 independence proof,
which is where the project's worst possible inversion lives; and the trap enforcement converts a
review finding into a test failure, which is strictly better.

**The one pocket of ceremony, named honestly:** `cooling.test.ts:508` already asserts *"exactly the
six files §3.3 names are read, and no others"* — a set equality. The four tests above it (`:490`
`pwmN_enable`, `:494` `fanN_target`, `:498` `fanN_label|max|min`, `:503` `tempN_input`) are each
strictly weaker and fully subsumed by it. I would **keep** them: on this project the tests are how the
three traps are remembered, and a named test is a better place for that than a comment. But call it
documentation-by-test, not coverage — four of 51.

**The genuine ceremony is one test, and it is A6's** — the only test in the step that cannot fail.

The file split itself is right. `errors.ts` at 37 lines looks like over-modularisation until you read
the reason: it exists so `collect.ts` can later adopt `hwmon.ts` without a `collect → hwmon → collect`
cycle. That is a real constraint, correctly anticipated.

## 9.2 `Pwm5Probe`'s five outcomes — right, and provably minimal

It does **not** encode the same fact twice, and there is a cleaner proof than build.md gives. Project
each outcome to the pair it determines:

```
unlocated  → (null,  null)      absent → (false, null)     unreadable → (true, null)
manual     → (true,  'manual')  ec-auto → (true,  'ec-auto')
```

**All five pairs are pairwise distinct.** So the probe is exactly the join of the two fields'
information: no outcome is redundant (removing one loses a reachable pair) and no two collapse
(merging any two loses a distinction §3.7 names). That is the strongest statement available about a
type, and it is worth putting in the doc comment — it argues from the type rather than from §3.7's
prose, so it stays true if the prose is re-worded.

Two notes: `manual` carries a `duty` payload neither projection reads — the probe serves **three**
consumers (`pwm5PresentFrom`, `ch5ModeFrom`, `coolingFrom`), which is correct and slightly
under-documented. And `unlocated` collapses `hwmon.ts`'s three miss reasons; that is right per §3.7
(all three are `null`) and the reasons survive in the `errors[]` message emitted at the same moment.

## 9.3 The `withServiceState` seam — composable, but weakly typed

Steps 5 and 6 will compose it cleanly enough. Three observations:

1. **The switch has three identical branch bodies** (`{ ...cooling, serviceState }`). That reads as
   dead ceremony but is probably load-bearing: a bare spread over the union does not reliably preserve
   the discriminated correlation, whereas per-branch spreads do. **The doc gives the wrong reason** —
   it says "so step 6 does not have to re-derive the union", not "because a bare spread loses the
   correlation". If that is why, say so; if it is not, the function is three lines too long. Worth one
   minute in reconciliation to establish which.
2. **The seam is invisible to the type system.** `withServiceState(cooling) : Cooling` has the same
   type in and out, so nothing distinguishes "serviceState filled" from "serviceState pending". A
   forgotten call ships a permanently-null field. The build's mitigation (`contract.test.ts` asserts
   the two fields agree) is real but indirect. **I decline a type-level fix** — a "pending" marker type
   would leak into steps 9/10 for one field. Instead make it an obligation with a shape: step 6's
   assembler should take the D-Bus `ActiveState` as a **required parameter** and call
   `withServiceState` internally, so there is exactly one path to a snapshot.
3. **⚠ A trap for step 5, and it is the more dangerous half of O9.** `serviceState: null` here means
   *"step 4 did not read it"*. In §3.7, `health: null` means *"not probed this cycle"* — a legitimate
   value. If step 5 copies this seam's shape, "I forgot" and "not probed" become the same `null` on a
   field where the spec assigns the second meaning a real semantics. Step 5 must not reuse a
   placeholder null on `health`.

**The scope decision itself (step 4 reads no D-Bus) is right** and matches PLAN.md; the rejected
alternative (a required `serviceState` option on `collectCooling`) would have serialised two reads
that should run concurrently. Well argued.

## 9.4 Spec-conformance, as a unit

**Conforms.** §3.3's field map is complete and each field is pinned by a named test; the three
telemetry traps are enforced by a set-equality assertion rather than by comment; §3.7's five-row probe
table is implemented as a closed union with two total unary projections; §6.5's rows all have a
behaviour; the fixture-symmetry rule was applied to `pwm5`'s 0–255 range and the RPM floor with
per-direction mutations.

**Invariants:** 1 held rigorously — this is the step's best work, and `0` vs `null` vs absent is
distinguished at three separate layers. 2 held; I re-verified read-only access to the box myself and
nothing was written. 3 held; `ENODATA` produces `ec-auto` with **zero** `errors[]` entries, verified in
code and in my probe. 4 held; the traps are never read and a test proves it. 5 held. 6 held; no
dependency. **7 held exceptionally** — five gaps reported and none silently filled, and two of them
(C1, C3) are the reason this review has anything to rule on.

**Three non-conformances, all reported rather than hidden:** §6.7's `999 → —` is not honoured (C1 —
resolve by amending §6.6/§6.7, §2 above); §6.3's zero gap (G4 — the collector is *correct* and the
spec is short, §1); and §3.3's unstated bound implemented as a chosen 2 s (C2).

**One conformance failure that is nobody's fault and needs saying:** §6.3 and `MOCK.html` disagree
about a stalled fan, and the mock is right. Steps 9 and 10 will read the mock as the visual contract.
Fixing §6.3 now is what stops that disagreement being discovered at render time.

---

# 10. What step 4 must not leak into steps 5 and 6

Step 5 writes the last collectors and will imitate this one. In descending order of damage:

1. **⚠ The wall-clock deadline.** Step 5 bounds D-Bus, two HTTP probes and `statvfs`. If it copies
   `boundedReader` before A2 is fixed, it copies `Date.now()` into four more places. **Fix A2 first,
   then hoist `boundedReader` into a shared module so there is one copy** — it is generic over
   `HwmonReader`'s two methods already and needs no `dell_smm` knowledge.
2. **⚠ `errnoCodeOf` must be hoisted now, not "if a third caller appears".** Step 5 **is** the third
   caller: `HealthState` needs 503-vs-refused off the status, and D-Bus needs the code off the
   rejection. Move it to `errors.ts` — already the shared error-shaping module — before step 5 writes
   its own. HANDOVER's warning about a second `numbers.ts` is the same hazard one layer up.
3. **⚠ A test that names a property it does not check.** Four steps, four instances. Step 5 will write
   independence and exhaustiveness tests for five `ErrorSource`s on one collector — the same shape.
   Ship §4.2's per-mutation red-test ledger with step 4's reconciliation so step 5 inherits it.
4. **Two hwmon walks.** `collect.ts` still carries its own. build.md says adoption is mechanical and
   message-identical byte for byte. **Take it in reconciliation.** Two copies is how a third appears,
   and step 5 has no hwmon node of its own to make the case for it.
5. **A placeholder `null` on a field whose `null` already means something.** §9.3 note 3. This is the
   subtlest item on the list and the one most likely to be copied without thought.
6. **Raw control bytes in test files.** A3. One character today; ten agent phases of invisible file
   tomorrow.
7. **Applying HANDOVER §5 mechanically.** A8a is the first case where a boundary is genuinely
   unobservable and a fixture buys nothing. Record the distinction — *a boundary needs fixtures on both
   sides when the two sides are distinguishable at a panel* — or step 5 will write fixtures for
   bookkeeping comparisons and dilute the rule.
8. **The Node skew.** Step 7 is the step it bites. §7.

---

# 11. Priority

## MUST — before step 5 starts

1. **§6.3's zero clause** (§1.4 (a)–(e)), plus the one-line `severityFan5Absolute` change and updated
   `everythingZero` expectations. This is the finding; everything else is hygiene.
2. **A2 + A7 together** — `performance.now()` and a validated `timeoutMs`, with fixtures either side
   of 2³¹−1. Do this *before* the bounded reader is hoisted or copied.
3. **A3** — the NUL byte. One character.
4. **A6** — rename the test to what it checks and delete its false comment.
5. **§6.6 / §6.7 amended** per §8, resolving C1 without a contract change; and `lib/types.ts`'s union
   comment stating that `ch5Engagement: 'unknown'` survives as a **wire** defence (O10), not dead code.

## SHOULD — in step 4's reconciliation

6. A4's `!listed.has('name')` guard, fixtures both sides.
7. A8c — two near-miss codes added to the errno array.
8. A5 — the hang-in-first-position test.
9. A9 — correct the false premise in `fanRpm`'s comment.
10. Hoist `errnoCodeOf` into `errors.ts`; hoist `boundedReader` **after** item 2.
11. Adopt `findHwmonNode` in `collectCpuTemp` — build.md says it changes no assertion.
12. §3.3, §3.7, §3.6, §6.5 clauses per §8 (C2–C5, A10).
13. `.nvmrc` + `.node-version` + the config-consistency guardrail test.
14. The per-mutation red-test ledger in `regressions.py` (§4.2).
15. Fold `-0` and the `===`-not-`Object.is` note into the zero clause's implementation comment.

## DEFER — to a named step

| Work | Step |
|---|---|
| `fan_stopped` condition kind, ledger and banner wiring | **8, 10** |
| Render "duty unreadable" vs "channel absent" distinctly — both are `unavailable` today; `pwm5Present` separates them | **10** |
| An em dash on `fan5` with `pwm5Present: true` and no `errors[]` entry (A9's rendering half) | **9, 10** |
| Call `withServiceState`, from an assembler that takes `ActiveState` as a **required** parameter (O9) | **6** |
| Do not reuse a placeholder `null` on `health`, whose `null` means "not probed" (§9.3 n3) | **5** |
| Build and test argon2id under Node 24, not 26 | **7** |
| `engine-strict` / the enforcement point | **11** |
| Measure channel 5's spin-up ramp read-only, and settle §6.4's hold for `fan5_engaged` | **12** |
| The commit point HANDOVER §10 asks for — it also restores `git grep` over this tree | **owner, before 11** |

## EXPLICITLY NOT DOING

- A fourth `Cooling` variant, or a nullable `ch5Pwm` on `CoolingManual`. §2.
- Any low-but-nonzero `fan5` or `fan1`–`fan4` band. §1.5.
- An upper RPM bound in the collector.
- Collapsing the six timeout `errors[]` entries into one.
- A fixture at `left === 0`.
- An `errors[]` entry for `pwm5` present with `fan5_input` absent.
- Rejecting `-0` as a fan reading — it is `0`, and `0` now alarms.
- `engine-strict=true` now, or any guardrail that reddens the suite on the running Node major.
- Anything at all in this phase: **no source, test, config or spec file was edited, and the one
  experiment was reverted and re-verified** (§ top).
