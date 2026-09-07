# Work items — the steps 1–8 backend surface

**Draft 1, 2026-09-07.** Produced by the owner's plan item (3) — a sweep of `SPEC.md` §1–§5,
§6.3, §6.4, §6.6, §6.7, §9 and §3.x against the code — plus item (4), which folds in every
open finding and obligation recorded by the adversarial and review phases of steps 1–8.

**This draft has not been adversarially reviewed.** Item (5) does that next.

## Scope

**Backend only.** Nothing here builds UI primitives, panels, charts, packaging or deployment.
Where a finding's *fix* belongs to steps 9–12 it is listed in §4 as deferred, not as work.

---

## 1. What the sweep found that was NOT already recorded

Five, and the first is the one worth the exercise.

### ⚠ A1 — `STANDING` cannot change without a container restart, and three places say it can

**Severity: the highest here.** §4 promises *"A change takes effect on the next poll."*
`lib/telemetry/source.ts` implements it — `readStandingList(env)` runs **inside the sample**
rather than being captured at construction — and its own doc says so:

> ⚠ It is read **inside the sample**, not captured here, so an operator who edits the env file
> and restarts the container is not the only way to change it — §4: "A change takes effect on
> the next poll." The 2 s cache is the only delay.

**That is false under the deployed mechanism.** `process.env` is filled by Docker's
`--env-file`, which reads `/etc/ai-dashboard.env` **once, at `docker run`**, and copies the
values into the container's environment. Editing the host file afterwards changes nothing a
running process can see. A restart is precisely and only the way to change `STANDING`.

So: §4 states a behaviour the deployment cannot deliver; step 6's machinery to deliver it is
inert in production; and step 8's reconciliation extended and documented that machinery on the
strength of the same sentence. Nothing is *broken* — the suppression works, it just cannot be
changed live — which is why six phases passed over it. It is the repo's own standing rule in a
new place: **writing the config is not evidence it took.**

There is a second, quieter half. §5 says the env file is *"bind-mounted read-only"*; §2.5's
runtime contract names no `--env-file`; and §2.2's container-access table — which opens *"Every
one of these is read-only"* and enumerates ten mounts — **has no row for the env file at all.**
So the spec describes a bind mount, the code assumes `--env-file`, and step 11 has no
instruction either way.

**One decision settles both.** Either:

| | mechanism | consequence |
|---|---|---|
| **(a)** | `--env-file`, as built | §4's sentence is wrong and must be amended to "on the next container restart". `source.ts`'s per-sample read becomes honest-but-pointless and its comment must stop claiming otherwise. §2.2/§2.5 gain a row naming `--env-file`. Cheapest, and matches every line of code today |
| **(b)** | bind-mount `/etc/ai-dashboard.env` and read `STANDING` from the **file** per sample | §4's sentence becomes true. Costs a file read per poll on libuv's pool — which §4 spends four paragraphs protecting — so it needs a monotonic budget and a place in the outstanding-call rule, and `readStandingList` grows a second reader §5's *"a third parser is not written"* was written to prevent |
| **(c)** | `--env-file` for the secrets, bind-mount for `STANDING` only | Splits one file across two mechanisms. Mentioned for completeness; the seam is worse than either half |

**Owner's decision (invariant 7).** My recommendation is **(a)**: nothing on this box changes
`STANDING` often — §6.4 records that the mechanism *has no live subject at all today* — and a
restart of a read-only dashboard costs nothing, while (b) puts a file read inside the poll path
that §4 is organised around protecting.

**Done when:** §4's sentence matches reality; §2.2 or §2.5 names how the values reach the
container; `source.ts`'s comment states what is true; and, under (a), whether the per-sample
read is kept (harmless, and correct if the mechanism ever changes) is stated rather than left
as an accident.

### A2 — §5.1 tells the install script to write an argon2id hash the server cannot read

§5 permits *"a scrypt or argon2id hash"*. §5.1 is narrower and is the instruction step 11 will
implement:

> `dashboard.sh set-password` **prompts** …, **hashes with argon2id**, and writes the hash to
> `/etc/ai-dashboard.env`.

Step 7 shipped **scrypt**, and `parseScryptHash` returns `null` for anything else — *including
a perfectly correct argon2id hash*. `null` is not an error: it is a clean, empty 401 on every
login, with nothing logged anywhere (§5 logs nothing about authentication, deliberately). The
symptom is a dashboard that will not open and will not say why.

This is **O20's silent failure with the spec pointing straight at it.** HANDOVER §4.1 already
warns step 11; the warning is undermined by §5.1 instructing the opposite.

**Done when:** §5.1 names scrypt and points at `hashPassword()` in `lib/auth/scrypt.ts` as the
producer, or §5.1 is amended to whatever the owner actually wants. **Spec-only; no code.**

### A3 — a fan channel absent from the hwmon listing files no `errors[]` entry

`lib/collectors/cooling.ts`:

```ts
for (const channel of FAN_CHANNELS) {
  const file = fanInputFile(channel);
  if (!listed.has(file)) continue;      // ← no problem pushed
  …
}
```

A channel whose `fanN_input` is missing from the directory listing yields `fanNRpm: null` with
**no entry**. For channel 5 that is correct and documented — the stock 4-fan driver has no
`fan5_input`, and `pwm5Present: false` explains it. For channels 1–4 §6.3 says the opposite:

> **An em dash on channels 1–4 always has an `errors[]` entry behind it**; one on channel 5 may
> not, because channel 5 has a documented absent state and these do not.

It is unreachable on this board — `dell_smm` exposes `fan1`–`fan4` unconditionally — so this is
a latent hole rather than a live bug, and it is **exactly S11/G5's narrowed case seen from the
collector's side**: an em dash whose only possible explanation is a neighbour that carries no
severity, so §6.5's one exception does not reach it and nobody files the entry it owes.

**Done when:** a channel in the listing-miss path files an entry naming the missing node, or
the spec says channels 1–4 may be silently absent. Note the two are not symmetric: channel 5's
absence must stay entry-free on the stock driver, so the fix is per channel, not global.

### A4 — §9's decision table is mis-rowed, and a rationale is attached to the wrong decision

The row *"A condition whose subject stops being reported"* carries **four** cells in a
three-column table. Its last cell —

> `gpu-fan-control.service` appears in both COOLING and SAFETY; it is one fact about the
> machine and must not inflate the header count to two

— is the **Because** for *"One reading shown in two panels"*, which is left with two cells and
no rationale. A phase reading §9 cold attributes the dedupe argument to the staleness rule.

**Done when:** the two rows carry their own reasons. **Documentation only, and cheap.**

### A5 — a comment that describes a correction as still owed, after it was made

`lib/telemetry/snapshot.ts` says:

> ⚠ `DeltaSample.atMs`'s own doc comment in `lib/collectors/deltas.ts` still says `Date.now()`
> and now under-describes it … the comment should be corrected. Recorded in this step's notes
> rather than edited here, since `deltas.ts` is step 3's file.

`deltas.ts` now reads *"Never `Date.now()`"* — the correction was made. The note is stale, and
it is the species step 8 named and that this project has now shipped in prose four times:
**a documentation claim that describes a property the code does not have.**

**Done when:** the paragraph states what is true. **One edit.**

---

## 2. Already recorded, still open, and in this scope

### A6 — the red-test ledger retrofit for step 3's harness

`03-collectors-gpu-host` is the **only one of the seven harnesses without a ledger**. When the
same retrofit was done to step 2's during step 8, it immediately found **six ⚠ marks with no
mutation behind them**, five of them on `severity.ts`'s fan-stopped rows — the most
safety-critical table in the project — including the `-0` / `Object.is` trap.

Step 3 owns `nvidia-smi`, `coretemp` and every `/proc` parser. It is the largest untested-for-
inertness surface left.

**Done when:** step 3's harness carries `LEDGER_FILES`, the ledger passes, and every mark it
cannot back has either a mutation or a recorded reason for dropping the ⚠.

### A7 — require the `0x` prefix in `lib/throttle.ts`'s `HEX`

`const HEX = /^\s*(?:0[xX])?([0-9a-fA-F]+)\s*$/;` — the prefix is **optional**, so a decimal
`8` parses as `0x8` and fabricates a *HW slowdown* alarm. Step 3's review deferred it to the
owner: it deletes the alarm-fabricating half of A2's blast radius, but needs evidence that no
driver in scope omits the prefix.

**The evidence is cheap and read-only** — `nvidia-smi --query-gpu=clocks_throttle_reasons.active`
on the box, which steps 2 and 3 already ran for other findings.

**Done when:** the prefix is required and a fixture pins both sides, or the measurement shows a
driver that omits it and the decision is recorded.

### A8–A12 — the five spec gaps step 8 recorded, still awaiting the owner's wording

`SPEC.md` was not edited by step 8. Each is one or two sentences; the code's current choice is
recorded beside it and is not in doubt — what is missing is the spec saying so.

| # | Gap | Code's choice | Note |
|---|---|---|---|
| **A8** | **S49.** §6.7 does not say whether the 600-point decimation budget is per **series** or per **chart** | Per series — §6.2's stacked chart draws up to 1,800 points | Step 9 renders it; the sentence is cheap now |
| **A9** | **S50.** §6.5 says a stale condition's row "names the age of the reading", not **which clock** measures it | The **browser's** clock at the last poll that carried it — a fact about the session | §6.7's clock rule leaves "the age of a reading we did not take" cleanly neither |
| **A10** | **S51.** §6.5 does not say what a stale condition's **value** shows | The last value read, unchanged, with `stale: true` beside it | Rendering half is step 9/10 |
| **A11** | **S52.** §6.4 does not say whether `loggedStanding` survives a mid-session `STANDING` change | Not reset — it belongs to the session, not the configuration | ⚠ **Interacts with A1:** under (a) a mid-session change cannot happen at all, which makes this moot until the mechanism changes |
| **A12** | **S53.** §4 does not say what a **duplicate** entry in `STANDING` means | Echoed verbatim; harmless because the client builds a `Set` | Recorded so nobody "fixes" it server-side |

---

## 3. Confirmed closed by the current `SPEC.md` — do not re-raise

HANDOVER warns this table has been stale in the *safe* direction three times. It was stale
again. Re-verified against the spec text on 2026-09-07:

| was | now |
|---|---|
| step 1's five gaps (`0x80` alarm set · unlisted-bit rule · `net-operstate` · `hostname` at top level · fan5's engagement signal) | **all five closed** — §3.7, §6.3 and §3.2 carry each one |
| step 2's S1–S4 (port format · uptime below a minute · the `unit`/`health` join key · fan5 absolute vs an unreadable duty) | **all four closed**, and `formatUptime` already implements §3.2's `up <1 min` rather than step 2's `up 0 min` |
| step 3's G1–G3 (the `AbortSignal` sentence · an out-of-range reading's entry · who owns `previous`) | **all three closed** — §3.1 was rewritten, §6.7 states both rules |
| step 3's DEFER 18 (`netRatesBetween` and a forward NTP step) | **closed** by step 6 — `sampleSnapshot` takes a monotonic `nowMs`. Only the comment in A5 was left behind |
| step 4's six owed clauses and G5, G6 | **all closed** — §3.3, §3.7, §6.3 and §6.6 carry each |
| step 5's S14, S15 (`collectServing`'s 6 s · the persistent `NoSuchUnit` entry) | **both closed** — §6.7 and §3.7 |
| step 6's S20 (the generalising ceiling rule) | **closed** — §4 now says "a rule, not a census" |
| step 7's S31, S32, S33 (`Content-Type` before the limit · the login screen never retries · media-type parameters) | **all three closed** — §5 and §5.2 |
| §3.7's 18 `errors[].source` values | **match `lib/types.ts` exactly** |
| §5's "exempt all three, and nothing else" | **matches `proxy.ts`'s matcher** |
| §6.6's VRAM pair rule | **matches `formatMiBPair`** |

**HANDOVER §8's open table should be corrected**: it still lists S31, S32, S33 and S20 as open.

---

## 4. Out of scope — recorded so nothing is lost

**Steps 9–12.** None of these is work here.

- **Step 9:** D4 `errorsForPanel` · D5 `traceFor` · ~~O19~~ **closed 2026-09-07** (was 98 occurrences,
  10 files; the rendered suffix is currently wrong against §6.6) · O14 the formatter `parts`
  variant · §3.2's *"trimmed to `Xeon W-2135` for display"*, which has no §6.6 row and no
  formatter.
- **Step 10:** D1 S40's third event-log feed · D2 the independent age tick · D3 rendering
  `unknownStanding` · O2, O3, O4, O12 · **S30** §5.2's sixth row has no tone.
- **Steps 9/10 jointly:** **S11/G5's rendering half** and **S19**'s sentence for *skipped* vs
  *failed*. A3 above closes the collector's side of S11/G5; the rendering question stays.
- **Step 9 or 10:** D6 jsdom, and the first assertion it buys — unmounting `useTelemetry` calls
  `stop()`.
- **Step 11:** O20, O21, O22, **D8** (`STANDING` env plumbing — **blocked on A1**) · F7's
  product bound on the scrypt parameters · `UV_THREADPOOL_SIZE=16` · a container memory limit ·
  `.dockerignore` · the standalone server invocation · whether `dynamic` survives Cache
  Components · the root `CLAUDE.md` pointer.
- **Step 12:** the ufw allow rule for 8090 · one-process verification · channel 5's spin-up ramp
  and §6.4's hold for `fan5_engaged`.
- **Owner:** the next commit point.

---

## 5. The list, in the order I would take it

| # | Item | Kind | Blocks |
|---|---|---|---|
| **A1** | `STANDING` cannot change live; three places say it can | **owner decision**, then spec + code | D8 (step 11), A11 |
| **A2** | §5.1 says argon2id; the server reads scrypt | spec | O20 (step 11) |
| **A6** | The red-test ledger retrofit for step 3's harness | **code + harness** | — |
| **A3** | A missing fan channel files no `errors[]` entry | code | S11/G5's rendering half |
| **A7** | Require `0x` in `throttle.ts`'s `HEX` | **measurement**, then code | — |
| **A5** | A stale comment claiming a correction is still owed | doc | — |
| **A4** | §9's mis-rowed decision table | doc | — |
| **A8–A12** | The five spec gaps step 8 recorded | spec | A11 waits on A1 |
| — | Correct HANDOVER §8's open table (§3 above) | doc | — |

---

# 6. Adversarial review of the list above — plan item (5)

Run against draft 1 on 2026-09-07, in the same posture the pipeline's adversarial phases use:
try to break it, fix nothing. **Seven findings; two are new work items, one is a defect in the
list's own reasoning, and one is a defect in the `HANDOVER.md` this session wrote.**

### ⚠ AR1 — the list carries an over-claim into `HANDOVER.md`, of the species it warns about

`HANDOVER.md` §3.2 states, as a fact about §4's contract:

> **`errors[]` is in the snapshot's own field order** (gpus, host, cooling, serving, storage,
> safety), and §6.5 matches by `source`.

**`SPEC.md` never says this.** `grep -n "field order" SPEC.md` is empty, and
`lib/telemetry/snapshot.ts` documents the opposite at the line that does the concatenation:

> Concatenated in the snapshot's own field order. **§4 fixes no order for `errors[]`** and §6.5
> matches an entry to a figure by `source`, so any order satisfies the spec; this one is stable
> and needs no rule of its own to remember.

So HANDOVER asserts as contract what the code documents as arbitrary. It was inherited from the
step-7 HANDOVER and **carried forward unchecked by this session's rewrite** — which is precisely
do-not-copy #11, the species step 8 named, in the document that names it. Recorded as a finding
against my own work rather than quietly fixed.

**And it is load-bearing, which is what makes it more than a wording defect.** Step 8 chose
*"the LAST `errors[]` message per source wins"* (S11) and justified it as *"the assembly appends
after the collector, so the last entry is the outer, more recent verdict."* For **`dbus`** that
reasoning runs through the concatenation: `dbus` entries are filed by **both** `collectCooling`
(the fan service unit) **and** `collectServing` (the llama units), so which one is "last" is
decided by the order of the six blocks — an order the code says nothing may depend on.

**⚠ Corrected during execution — my failure scenario was wrong.** I wrote *"nothing goes red"*.
It does: `snapshot.test.ts` carries `⚠ entries from all six collectors reach the snapshot, in
field order`, which asserts the exact array, so a reorder **is** caught. Two narrower things are
true, and they are what A13 actually fixes:

1. **No mutation proves the order clause.** The two mutations that redden that test (`A7`, `A8`)
   both *drop* a collector's entries; neither reorders. So the ledger was satisfied by the
   "all six reach it" half while the "in field order" half of the test's own name went unbacked
   — the same species the ledger exists to catch, one level up.
2. **No fixture has one source filing from two collectors**, so "last message per source wins"
   was a client-side choice resting on a server-side order nothing exercised. The two halves
   were each tested and the seam between them was not.

And `events.test.ts`'s justification was wrong in a way worth keeping: it said keeping the
*first* message "inherited a concatenation order §4 declines to fix" — but **last inherits it
exactly as much**. Neither is more principled unless the order is fixed somewhere.

**New item, A13**, with the severity corrected: a documentation over-claim plus two missing
pieces of evidence, not a silent-failure path.

### AR2 — A3's justification is narrower than the list states, and its rank is wrong

The list ranks A3 fourth and calls it "latent". Attacking it found the surviving case is
narrower still. When the hwmon listing is empty or short, `collectCooling` still pushes the
`no pwm5 node` problem and yields `pwm5Present: false`, which §6.3 bands **alarm** — so the fan
em dashes sit beside a coloured neighbour in the same panel that carries a severity, and §6.5's
one exception *does* cover them.

The case that survives is only: **`pwm5` present in the listing while `fanN_input` for a
channel in 1–4 is not.** Nothing on this board produces that, and no measurement suggests any
board does.

**Not a rejection.** Filing an entry costs nothing, fabricates no alarm, and closes the gap
between §6.3's *"always has an entry behind it"* and the code. But it is speculative hardening
for an unreachable state, it must not be ranked above two items that close live defects, and
the list must say the reachable case is already covered.

### AR3 — A7 was written as a decision needing evidence; the evidence has since been taken

Draft 1 says the `0x`-prefix question "needs evidence that no driver in scope omits the prefix"
and calls it the owner's call. That evidence was taken during this review, read-only on the box:

```
$ ssh ai-server 'nvidia-smi --query-gpu=index,clocks_throttle_reasons.active --format=csv,noheader'
0, 0x0000000000000000
1, 0x0000000000000000
$ ssh ai-server 'nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1'
580.173.02
```

The only driver in scope emits the prefix. Both callers were traced:
`nvidia-smi.ts:126` treats an unparseable cell as `null` (→ `—` plus an entry), and
`decodeThrottleMask` only ever sees strings the server produced. So requiring the prefix trades
a **fabricated alarm** — a decimal `8` currently decodes as `0x8` *HW slowdown* — for a lost
reading on a hypothetical driver, and §6.3's whole posture is that the fabricated alarm is
worse. Step 3's A2 is the precedent: it fabricated a thermal alarm on a card at 38 °C.

**A7 stops being a decision and becomes a code item.**

### AR4 — the list mixes work I can execute with decisions only the owner can take

§5's table lists A1, A2 and A8–A12 beside A3, A5, A6 and A7 as though they were one queue. They
are not. **A2 and A8–A12 are `SPEC.md` edits, and `PLAN.md` says the parent owns `SPEC.md`;
phases record gaps and never edit it.** A1 is a decision *plus* whatever follows from it.

Presenting them in one ranked list invites the executing loop to "do" a spec item by writing a
sentence into `SPEC.md`, which is exactly the boundary the pipeline is built on.

**The list must be split into three queues:** executable now · blocked on an owner decision ·
spec wording for the owner.

### AR5 — A1's recommended option has a consequence the list does not state

Under **(a)** — keep `--env-file` and amend §4 — `source.ts`'s `env` option and the per-sample
`readStandingList` call become **machinery that is tested, exported and cannot fire in
production**. That is do-not-copy #9. It is still the right call, but the list must say so and
say why keeping it is preferable to deleting it: it is three lines, it is correct the moment the
mechanism changes, and deleting it would put the seam back the day (b) is chosen.

### AR6 — two completeness gaps in the "confirmed closed" table

Attacking the list for things it should have checked and did not:

- **Step 2's DEFER 15 and 16** — the `G1/G2/G3` severity functions, and the singleton /
  bare-`unit` `STANDING` rules — are **not mentioned anywhere in the list**. Both are now
  **implemented**: `lib/severity.ts` exports a function for all fifteen of §6.3's rows, and
  `lib/conditions.ts` carries `singleton` and `bareKindAllowedInStanding` per kind. They belong
  in §3 so no later phase re-raises them.
- The list asserts §3.7's eighteen sources, `proxy.ts`'s matcher and `formatMiBPair` match the
  spec, but **does not say what it did not check.** A sweep that does not state its own
  coverage invites the next reader to treat it as exhaustive. It is not: it verified the
  sentences it found ambiguous plus a handful of spot checks, and the eight steps' adversarial
  phases remain the systematic pass.

### AR7 — one item on the list is not work at all

*"Correct HANDOVER §8's open table"* appears as an unnumbered dash row. It is a real edit with a
real consequence — a later phase re-raising S31/S32/S33/S20 — and it should carry an id like
everything else so it can be closed. **Now A14.**

### What I attacked and could NOT break

- **A1's core claim.** `docker run --env-file` reads the file at container creation and copies
  the values into the environment; `process.env` in a running Node process does not track the
  host file. Re-checked against `lib/auth/config.ts`'s own doc, which states the mechanism
  plainly. §4's sentence cannot be true as built.
- **A2.** §5.1 says argon2id in the imperative, §5 permits either, `parseScryptHash` refuses
  argon2id, and §5 logs nothing. The chain holds.
- **A6.** Step 3's harness genuinely has no `LEDGER_FILES`, and step 2's retrofit genuinely
  found six unbacked marks.
- **The closed table.** Every row was re-read against the current spec text rather than trusted.

---

# 7. Reconciled list — plan item (6)

Draft 1 plus the review, in three queues. **This is the list item (7) executes.**

## 7.1 Executable now — backend, no decision needed

| # | Item | Why it is first/last |
|---|---|---|
| **A6** | **The red-test ledger retrofit for step 3's harness.** The only one of seven without a ledger; the same retrofit on step 2 found six unbacked ⚠ marks on the project's most safety-critical table | Largest untested-for-inertness surface left, and it is pure evidence-gathering: it can only find things |
| **A13** | **`errors[]` has no specified order, and two places depend on one.** Fix `HANDOVER.md`'s over-claim; decide and pin what `dbus`'s "last message wins" actually rests on, with a fixture where one source files from two collectors | Live: a blessed refactor silently changes what an operator reads |
| **A7** | **Require the `0x` prefix in `throttle.ts`'s `HEX`**, with a fixture on both sides. Evidence taken (AR3) | Closes a fabricated-alarm path |
| **A5** | **`snapshot.ts` claims a correction to `deltas.ts` is still owed; it was made.** One paragraph | Trivial, and it is the species the project keeps shipping |
| **A14** | **Correct `HANDOVER.md` §8's open table** — S31, S32, S33 and S20 are closed by the current spec, and step 2's DEFER 15/16 are implemented (AR6) | Stops a later phase re-raising four settled questions |
| **A3** | **A fan channel absent from the listing files no `errors[]` entry**, against §6.3's *"always has an entry behind it"* for channels 1–4 | **Last.** Unreachable on this board; the realistic case is already covered by `pwm5Present: false` (AR2) |

## 7.2 Blocked on an owner decision

| # | Item | The decision |
|---|---|---|
| **A1** | `STANDING` cannot change without a container restart, and §4, `source.ts` and §5 all say or imply it can | **(a)** keep `--env-file`, amend §4, keep the per-sample read and say why (AR5) · **(b)** bind-mount and read the file per sample, with a budget · **(c)** split the file. **Recommend (a)** |

Blocks **D8** (step 11's env plumbing) and moots **A11/S52** until the mechanism changes.

## 7.3 `SPEC.md` wording — the owner's, never a phase's

`PLAN.md`: *"The parent owns `SPEC.md`. Phases record gaps; they never edit the spec."*

| # | Gap | One-line answer the code already implements |
|---|---|---|
| **A2** | §5.1 tells `set-password` to write **argon2id**; the server reads **scrypt** and returns a silent 401 for anything else | Name scrypt, and point at `hashPassword()` as the producer |
| **A4** | §9's decision table is mis-rowed — the dedupe rationale sits on the staleness row | Give each row its own reason |
| **A8** | **S49.** 600 rendered points — per series or per chart? | Per series; the stacked chart draws up to 1,800 |
| **A9** | **S50.** Which clock measures a stale condition's age? | The browser's, at the last poll that carried it |
| **A10** | **S51.** What does a stale condition's value show? | The last value read, with `stale: true` beside it |
| **A11** | **S52.** Does `loggedStanding` survive a mid-session `STANDING` change? | Not reset. ⚠ Moot under A1(a) |
| **A12** | **S53.** What does a duplicate entry in `STANDING` mean? | Nothing — the client builds a `Set` |

## 7.4 ⚠ What this sweep did NOT do

Stated so the next reader does not treat it as exhaustive. It read §1–§5, §6.3, §6.4, §6.6,
§6.7, §9 and §3.x looking for sentences that are **ambiguous, self-contradictory, or contradicted
by the code**, and spot-checked roughly a dozen contract claims against the implementation. It did
**not** re-verify every spec sentence against every collector — that is what the eight steps'
adversarial phases did, and their findings are folded in above rather than repeated.

---

# 8. Execution log — plan item (7)

Each item run as build → test → adversarial pass → reconcile, in one context rather than
several. **Six of the seven executable items are done. A1 is with the owner.**

| # | State | Evidence |
|---|---|---|
| **A6** | **done** | Step 3's harness has a ledger: **67 mutations, all bite; 19 ⚠ marks, all backed** |
| **A13** | **done** | `A19` added to step 6's harness; a two-collector `dbus` fixture added; three comments corrected |
| **A7** | **done** | `0x` required; both sides of the boundary in `throttle.test.ts` |
| **A5** | **done** | The stale note in `snapshot.ts` replaced by what is true |
| **A14** | **done** | `HANDOVER.md` §8 no longer lists four settled questions as open |
| **A3** | **done** | `T84` added to step 4's harness; the fixture asserts both halves of §6.3's asymmetry |
| **A1** | **done** — owner chose *"keep `--env-file`, delete the per-poll read"* | `A20` added to step 6's harness; `source.test.ts` pins capture-once |
| **T31** | **re-aimed** — collateral from A3 | §8.5 |
| — | **A harness defect found by breaking that anchor** | §8.6 |

## 8.1 What A6 found — the retrofit paid for itself, as the precedent said it would

Step 3's harness had **64 mutations and no ledger**. Adding one found **four ⚠-marked tests
that no mutation could redden**, which is the same result step 2's retrofit produced during
step 8 (six). Three were missing mutations; one was a mark that had to go.

| inert mark | resolution |
|---|---|
| `⚠ no OTHER numeric gains a range — an implausible temperature is still carried` | **`S65`**: give `tempC` a plausibility range. This is the wrong move a later reader makes on seeing `utilPct`'s range and generalising it, and step 3's review (A7) decided against it explicitly — *"a wrong bound silently discards a real reading"* |
| `⚠ O7 — a backwards total counter is null too` | **`S66`**, and the obvious mutation does **not** work. Dropping `total === null` still yields `null`, because `busy / null` is `Infinity` and the `Number.isFinite` guard catches it. The distinguishing wrong implementation is `Math.abs` on the delta — the clamping O7 exists to forbid. **Fixture symmetry: the guard has two halves and only the `busy` half had a mutation** |
| `⚠ it ran and printed nothing is \`gpus: []\` — a different state, and not null` | **`S67`**: collapse an empty parse to `null`. The wrong implementation someone writes on "no rows means no cards means null", which destroys the distinction steps 1 and 2 spent a decision on |
| `⚠ and the shift it prevents is what would have been reported` | **⚠ dropped.** It asserts properties of the *fixture* plus one fact about `lib/throttle.ts`, which is step 2's file — it depends on nothing under `lib/collectors/`, so no step-3 mutation can reach it. HANDOVER §5.2 rule 1. The body stays; the guard it documents is the test above it, which is backed |

## 8.2 A7 turned out to close more than it was filed for

Requiring the `0x` prefix made **two** existing tests fail, and the second is the interesting one.

`nvidia-smi.test.ts`'s shift demonstration asserted that a twelve-column row, parsed under a
weakened column guard, yields *"a card at 38 °C whose throttle mask decodes to `0x20 sw thermal
slowdown | 0x40 hw thermal slowdown` — an alarm, fabricated from a clock reading."* That
fabrication was only possible **because the prefix was optional**: the SM clock `1260` read as
`0x1260`.

With the prefix required, a shifted clock **is not a mask**. The column reads `—` with an
`errors[]` entry instead of an alarm nobody can explain. The test now asserts both — that
`'1260'` is refused, and that `'0x1260'` would still have been the fabricated alarm, so the
column-count guard stays visibly the primary defence and this is the belt behind it.

That is step 3's review sentence coming true verbatim: *"it deletes the alarm-fabricating half
of A2's blast radius."*

## 8.3 A3's justification, restated honestly after the adversarial pass

The adversarial review (AR2) was right that the reachable case is already covered: when the
hwmon listing is short, `pwm5Present: false` files an alarm-severity entry in the same panel, so
§6.5's exception applies. The case A3 closes is **`pwm5` present while a `fan1`–`fan4` node is
not**, which nothing on this board produces.

It was taken anyway, and the reasoning is in the code and the fixture: an `errors[]` entry
**mints no verdict and no severity** — it can only ever say *why* a figure is blank — so the
cost of being wrong about reachability is one line of text, and the cost of being right is a
silent dead fan on a box with two passively cooled 250 W cards. It is ranked last for the same
reason.

## 8.4 ⚠ A new finding, recorded rather than fixed

**A15 — §3.1 says `gpus: []` "always carries an `errors[]` entry, so it is never silent". It
does not.** `collectGpus` with exit 0 and empty stdout yields `gpus: []` and `errors: []`, and
`collect.test.ts` asserts exactly that.

It is not reachable — step 3's adversarial measured that `nvidia-smi` exits **6** when it finds
no devices, and A4 ruled that `[]` now means "ran, parsed no rows" — so the live `[]` (a driver
answering a different field list) always does carry entries. But the spec's sentence is
unqualified and the code does not honour it in one branch.

**Deliberately not fixed inside A6.** A6 is "retrofit the ledger"; changing collector behaviour
under it would make the item non-atomic, which is what AR4 warned about. It is a spec-versus-code
conformance question with two honest answers — file an entry for the empty parse, or qualify
§3.1's sentence — and the second is the owner's. **Recorded for the next pass.**

## 8.5 A1, as taken

The owner chose **keep `--env-file`, delete the per-poll read** — option (c) in §7.2, one step
past my recommendation and the more honest of the two. `source.ts` now reads
`readStandingList(env)` **once, at construction**, and says at the option why per-sample was
*wrong* rather than merely unnecessary.

`source.test.ts` gained `⚠ STANDING is captured once — editing the environment does not reach
the next poll`, and step 6's harness gained **`A20`**, which restores the per-sample read. So
the day someone re-adds it believing §4's old sentence, the suite goes red and points at the
reason. There was **no test at that level before** — consistent with machinery that could not
fire.

⚠ **The client half is unaffected and is still per-poll.** `standing` rides every snapshot, and
`runtime.test.ts` pins that a *changed snapshot* changes the client's suppression. What changed
is only that the server cannot produce a changed snapshot without a restart.

**Still owed to the owner, and now unblocked:** §4's sentence, and a §2.2 or §2.5 row naming
`--env-file`. Both are `SPEC.md` edits — §7.3's queue.

## 8.6 ⚠ A harness defect, found by breaking an anchor

A3's edit to `cooling.ts` moved `T31`'s anchor, and step 4's harness reported:

```
--- T31 the reads go concurrent — eleven blocked SMM calls on a four-thread pool
    ANCHOR NOT FOUND in lib/collectors/cooling.ts — the implementation moved
…
DID NOT BITE: T31 the reads go concurrent — eleven blocked SMM calls on a four-thread pool
```

**Both lines are about the same entry, and the summary uses the wrong one of the two labels.**
HANDOVER §1 is explicit that these are different findings with different first hypotheses — an
anchor miss means re-aim the mutation, a non-biting mutation means look for a missing test — and
the summary line is what a reader sees first. All seven harnesses shared the defect: anchor
misses were appended to the same `bad` list.

Fixed in **all seven**: anchor misses go to their own list and print as
`ANCHORS MOVED — re-aim these, they did not run:`.

`T31` itself was re-aimed, and the first re-aim was wrong in an instructive way: wrapping one
channel's read in `Promise.all([…])` looks concurrent and is not, so the mutation applied and
nothing went red. The mutation has to make **all five** reads concurrent to be the wrong
implementation its name describes; it is now generated from the real loop text rather than
retyped.

## 8.7 Evidence

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ cd dashboard && pnpm verify        # ×5, then once more after the last edit

 Test Files  57 passed (57)
      Tests  1994 passed (1994)
Type Errors  no errors
EXIT=0
```

**All seven harnesses, run serially, every ledger clean:**

| harness | mutations | ⚠ marks checked |
|---|---|---|
| `02-format-severity` | **47/47** | 8 |
| `03-collectors-gpu-host` | **67/67** — **ledger new** | 19 |
| `04-collector-cooling` | **91/91** | 82 |
| `05-collectors-serving-storage-safety` | **127/127** | 94 |
| `06-telemetry-route` | **63/63** | 56 |
| `07-auth-login` | **116/116** | 104 |
| `08-client-runtime` | **158/158** | 191 |

**669 mutations**, up from 658, and `03` is no longer the exception. 1993 → 1994 tests
(1990 before this pass).

## 8.8 What is left

**Seven `SPEC.md` wordings, all in §7.3, all the owner's** — and A1's decision added an eighth
and a ninth: §4's *"a change takes effect on the next poll"* must become *"on the next container
restart"*, and §2.2 or §2.5 must name `--env-file` as how the values reach the container.

**A15** (§8.4) has no owner yet: §3.1's *"`gpus: []` always carries an `errors[]` entry"* is
false in one unreachable branch. File an entry, or qualify the sentence.

Everything else on the executable queue is done.


---

# 9. `SPEC.md` — the wordings, taken 2026-09-07

The owner delegated §7.3's queue. **`SPEC.md` was edited for the first time in this project's
history**; every other phase recorded gaps and left the text alone. 1290 → 1362 lines.

| # | § | What changed |
|---|---|---|
| **A2** | §5.1 | *"hashes with argon2id"* → **scrypt**, with `hashPassword()` named as the producer and the silent-401 consequence spelled out. This was O20 with the spec pointing straight at it |
| **A1a** | §4 | *"A change takes effect on the next poll"* → **on the next container restart**, with why the old sentence was unachievable, that the client half is still per-poll, and what changing the mechanism would actually require |
| **A1b** | §2.5 | A new row: **`--env-file /etc/ai-dashboard.env`**, that Docker reads it once at creation, and that its grammar keeps quotes — O21's hazard now stated where step 11 will look |
| **A8** | §6.7 | 600 rendered points **per series, not per chart**, with what a per-chart budget would silently do to a third trace |
| **A9** | §6.5 | A stale condition's age is measured by the **browser's** clock, and why that is neither of §6.7's two clocks cleanly |
| **A10** | §6.5 | A stale condition shows its **last value, unchanged** — §6.6's `null` → `—` law governs an *absent* reading, and a stale one is *old*, not absent |
| **A11** | §6.4 | *"Once per session"* belongs to the **session, not the configuration**, and is not reset when `STANDING` changes |
| **A12** | §6.4 | A **duplicate** `STANDING` entry declares what one entry declares; nobody should collapse it server-side |
| **A4** | §9 | The mis-rowed table fixed — the dedupe rationale was attached to the staleness row, which left the dedupe decision with no reason at all. Verified: every row of §9 now has exactly three cells |
| **new** | §6.2 | ⚠ **The GPU↔instance join is `gpu.index === serving.instance`, and the dashboard cannot verify it.** Found while assessing the UI gaps and settled read-only on the box: `llama-server@.service` carries `Environment=CUDA_VISIBLE_DEVICES=%i`, so instance N *is* GPU N — but the dashboard reads only `<i>.env`, which carries no device, and §2.2 mounts no unit files. Written down with what would break it |

**A15 was closed in code rather than in the spec.** §3.1 promises `gpus: []` *"always carries an
`errors[]` entry, so it is never silent"*, and the empty-parse branch carried none. The sentence
is right; the code was wrong. `collectGpus` now files an entry naming the impossible reading —
exit 0 with no output — and step 3's `S68` backs it, with `S67` re-aimed onto the new return.

**Everything in §7.3 is now done, and §7.1's queue is empty.**
