# 12d ADVERSARIAL — the alarm can still be deleted, and 12d widened the door it goes through

**Written by the ADVERSARIAL phase, 2026-09-22.** Branch `dashboard-frontend`, working dir
`dashboard/`, 12d's build + test uncommitted on `9fcff77`. **Nothing was fixed.** No source file,
no test, no fixture, no spec, no mutation ledger was edited. Nothing was committed or staged, no
`git checkout --` was run, nothing was deployed, and `192.168.4.71` was not contacted at all — no
SSH, no HTTP, no D-Bus socket opened.

`git status` at the end is byte-for-byte what it was at the start: **15 modified, 3 untracked**
(plus this file, which is the deliverable). `next-env.d.ts` is not in it.

**Tree state as handed over, verified once:** `pnpm verify` **exit 0**, `Test Files 109 passed
(109)`, `Tests 3840 passed (3840)`, `Type Errors no errors`. **No regression harness was run by
this phase** — the build ran 04/08/10 and the test phase ran 02/04/08/10, all green on the first
run, and re-running them would have proved nothing this phase needed. Nothing ran in parallel;
no exit status was taken through a pipe.

All probes are throwaway `*.adv.ts(x)` files under the session scratchpad, run through a separate
vitest config that aliases `@` at the repo and includes only that directory. Nothing was written
inside the repo.

---

## 0. The short version

**The headline question — *can a genuine `alarm` still be deleted from the ledger, the dot and the
count?* — is answered YES, with a measurement, and the deletion is reachable in a state 12c
blocked.** It does **not** come from the exclusion set being wrong: the per-subject exclusion is
correct at every layer I could attack it, and every identity-parsing attack the handoff named is
closed. It comes from one layer up — `observePoll` decides retirement from *"was a condition
observed this poll"*, never from *"is this subject in the collection"* — and 12d, by making a
partially-read `serving[]` count as **read**, removed the thing that used to stop that path
firing during a refusal.

§2's three open items: **(1) mis-citation CONFIRMED and worse than reported** — the build did not
merely lose a citation, it put a **fabricated quotation** in `gpu-panel.tsx` and changed the
section number the handoff gave. **(2) `{read:'partial', refused: []}` CONFIRMED unreachable**;
the type should still forbid it, and I measured what it does if forged. **(3) the GPU `member`
CONFIRMED inert** by measurement, not by argument — with one honest correction to how the pinning
test should be described.

Ten findings. Findings 1 and 2 are the ones that matter; 3–5 are real and cheap; 6–9 are small;
10 is what I tried and could not break.

---

## 1. ⚠⚠ HIGH — an `alarm` is RETIRED while its subject is still in the collection, because the reading went `null`

**Severity: high.** It deletes a live `alarm` from the ledger, the dot and the count. It is
**pre-existing** — not introduced by 12d — but it is exactly the property §9 row 2 exists to
protect, it is what this phase was told to attack, and Finding 2 is 12d making it reachable in a
new state.

### The mechanism

`conditionsFrom`'s `push` is O12: *no band, no condition.*

```ts
if (rawSeverity === null) return;
```

`severityGpuTemp(null)` is `null`. `severityHealth(null)` is `null`. `severityUnitState(null)` is
`null`. So a subject that is **still enumerated** but whose reading went `null` emits no
observation at all — and `observePoll`'s step 3 cannot tell that apart from the subject having
left:

```ts
for (const [id, previous] of state.remembered) {
  if (current.has(id)) continue;          // <- "was a CONDITION observed", not "is the SUBJECT there"
  ...
  const enumerated = membership !== null && held !== undefined && !held.has(membership.member);
  if (confirmedAbsent && enumerated) { retired.push(previous); ... }
```

§9 row 2 licenses retirement only when *"the collection that would have contained it was read
successfully and it was **not in it**"*. Here it **is** in it.

### Proof — GPU, measured (`c.adv.ts`)

Nine polls, 5 s apart, through the real `parseSnapshot` → `conditionsFrom` → `enumerationsRead` →
`observePoll`. `gpus` carries card 0 and card 1 on every poll; card 1 is at 95 °C for four polls,
then its `tempC` goes `null` and everything else about the row stays valid.

```
p0 snapshot.gpus indices=[0,1] tempC[1]=95   retired=[]            gpu conditions=[... gpu_temp:1=alarm, gpu_throttle:1=normal, gpu_vram:1=normal] alarms=7
p3 snapshot.gpus indices=[0,1] tempC[1]=95   retired=[]            gpu conditions=[... gpu_temp:1=alarm, ...]                                       alarms=7
p4 snapshot.gpus indices=[0,1] tempC[1]=null retired=[]            gpu conditions=[... gpu_temp:1=alarm*, ...]                                      alarms=7
p6 snapshot.gpus indices=[0,1] tempC[1]=null retired=["gpu_temp:1"] gpu conditions=[... gpu_throttle:1=normal, gpu_vram:1=normal]                   alarms=6
p8 snapshot.gpus indices=[0,1] tempC[1]=null retired=[]            gpu conditions=[... gpu_throttle:1=normal, gpu_vram:1=normal]                    alarms=6
```

`snapshot.gpus indices=[0,1]` on **every** poll, and `gpu_throttle:1` / `gpu_vram:1` stay live for
that same card throughout — so this is not a card that left, and the snapshot proves it in the same
line as the retirement. `gpu_temp:1`'s **alarm leaves the reduction at p6** and the count drops
7 → 6.

That is §9 row 2's own "Because" column, verbatim:

> *"a card at 90 °C whose `nvidia-smi` then fails takes the header from `● 1 alarm` to
> `● all healthy` with no log line — the dashboard turns green at the moment it loses the ability
> to look."*

The spec reads that as the whole-collector failure (`gpus: null`), which **is** handled — the key
is absent and nothing retires. A *per-field* failure on a card that is still enumerated takes the
same outcome through a door the spec did not look at.

### Proof — serving, measured (`a.adv.ts`, S4)

The same shape on the other enumeration, and this one has a fixture in the tree already:
`lib/fixtures.ts`'s `servingIdentityOnly` is `{"instance":"2","port":null,"unitState":null,
"model":null,"ctx":null,"health":null,"gpus":null}` — a row that is present and reports nothing.

Instance `7` alarms (`health: 'unreachable'`, `unitState: 'failed'`) for four polls, then the same
row arrives with `health: null, unitState: null` and stays in `serving[]`:

```
p3 retired=[]                                            live=[... unit:llama-server@7.service=alarm, health:7=alarm] alarms=8
p6 retired=["unit:llama-server@7.service","health:7"]     live=["unit:llama-server@0.service=normal","health:0=normal"] alarms=6
```

Two alarms deleted for an instance the server is still reporting.

### Mitigation that exists

`lib/client/events.ts:336` does emit a `retired` event-log line, so it is not *silent*. The line
says the subject left, which is false. The dot and the count still lose the alarm.

### Not fixed, and the shape of a fix (for the reconcile to consider, not for me to apply)

The comparison that decides retirement should be against the **collection's membership this poll**
— *is `membership.member` in the collection we just read?* — rather than against *was a condition
emitted*. `enumerationsRead` already has the snapshot in hand and could carry the members it saw;
`held` would then be a second, narrower exclusion on top. That is a design change and squarely a
reconcile/parent decision.

---

## 2. ⚠⚠ HIGH — 12d makes Finding 1 fire during a partial read, where 12c froze it

**Severity: high. This one IS 12d's.** Same wire bytes, two rules, opposite answers.

A **named** refusal of one row now reports the serving enumeration as READ. Every subject not in
the exclusion set therefore becomes retirable on that poll — including a subject that is **still in
`serving[]`** and has merely stopped reporting a band (Finding 1). Under 12c any refusal froze the
whole enumeration, so the same wire could not delete anything.

### Proof (`b.adv.ts`, S6)

Nine polls. Polls 0–3: `serving: [row 0 valid, row 7 alarming]`. Polls 4–8: `serving: [row 0 with
port 'nope' (refused, identity `'0'`), row 7 present and valid with health: null, unitState:
null]`. Row 7 is in `serving[]` on **every poll of the sequence**.

```
--- S6 under 12d
  p3 retired=[]                                        live=[... unit:llama-server@7.service=alarm, health:7=alarm]  alarms=8
  p6 retired=["unit:llama-server@7.service","health:7"] live=["unit:llama-server@0.service=normal*","health:0=normal*"] alarms=6
  p8 retired=[]                                        live=["unit:llama-server@0.service=normal*","health:0=normal*"] alarms=6

--- S6 under the 12c rule (same wire)
  p6 retired=[]                                        live=[... unit:llama-server@7.service=alarm*, health:7=alarm*] alarms=8
  p8 retired=[]                                        live=[... unit:llama-server@7.service=alarm*, health:7=alarm*] alarms=8
```

The 12c rule was re-implemented in the probe as *serving key only when `read === 'all'`* and fed
the identical parsed wire, so nothing but the rule differs.

**So the answer to the parent's headline question is yes**, and it is not a hypothetical: the
protected identity here is `'0'`, which is exactly what §9's ruling intends to protect, and the
alarm that dies belongs to `'7'`, which the server is still reporting.

### What this does NOT mean

The exclusion machinery is right. I could not get a wrong subject into or out of `held` by any
route (see Finding 10). The defect is at the seam between "the collection was read" and "this
condition was not observed", and 12d is the change that made the first half true more often.

---

## 3. ⚠ MEDIUM — a FABRICATED quotation attributed to §3.4, in production source

**Severity: medium** (a comment, but this project's whole method is citations a later reader can
check). **CONFIRMS §2 item 1 of the handoff and extends it in two directions the test phase did not
report.**

Verified independently, `grep -in` over `SPEC.md`:

| searched | hits in `SPEC.md` |
|---|---|
| `keep it short` | **none** |
| `value slot` | **none** |
| `explanatory prose` | **none** |
| `carries prose` | one, line 1572 |

`components/panels/gpu-panel.tsx:196-197`:

```
// ⚠ Four words, no count and no reason: §6.4's own ruling that an alarm panel must not
// carry prose in a value slot, and §3.4's *"keep it short — the full reason stays on
// SERVING beside the refused row"*.
```

Two separate faults, not one:

1. **The quotation marks are around a sentence §3.4 does not contain.** §3.4's actual closing
   sentence is *"The full reason stays on SERVING beside the refused row; the card says only that
   it cannot answer and why the question is open."* The words **"keep it short —"** were glued in
   front of a real half-sentence **inside the quotation marks**. That is not a lost citation, it is
   an invented one, and it is in the file a future loop will read first.
2. **The section number was changed from the one the handoff gave.** The parent's build handoff
   (`handoffs/12d-partial-reads.md` §2) says *"Keep it short; **§3.7** forbids explanatory prose in
   a value slot."* The build re-attributed it to **§6.4**. §6.4's nearest sentence is line 1571-72
   — *"Repeating the same sentence six times in one panel was rejected … §3.7 exists so an alarm is
   actionable, not so every cell carries prose"* — which is about **repetition across cells**, not
   about length and not about value slots. §3.7 carries no such sentence either.

Contamination, full extent: `gpu-panel.tsx`'s `incomplete` comment, `12d-build.md` §1.2, §5 `12d-Q2`
and §5 `12d-Q3`.

**Does the constraint survive without the citation?** Yes, but not everywhere it was used. The
owner's brief said *keep it short*, and §3.4's own *"the card says only that it cannot answer and
why the question is open"* independently bars a long explanation — so the **four-word form is
defensible**. What does **not** survive is `12d-Q3`: its recorded reason is *"§3.4 says keep it
short and is otherwise silent"*, and the first half of that is a sentence nobody wrote. The
decision to omit a count is currently justified by nothing checkable.

---

## 4. ⚠ MEDIUM — the precedence choice makes the card name the wrong blocker, and §3.4 is less silent than `12d-Q1` says

**Severity: medium.** The handoff asked me to argue the other side of `12d-Q1` properly. Here it is,
with a render.

### Proof (`d.adv.tsx`)

`serving: [{instance '0', gpus: null}, {instance '7', port: 'nope'}]` — one row we DID read whose
`gpus` is explicitly unreadable, one row refused.

```
serving enum = {"read":"partial","rows":[{"instance":"0",...,"gpus":null}],"refused":["7"]}
servedBy(card 0) = {"kind":"incomplete"}
  gpu0: <dt>served by</dt><dd>list not fully read</dd>
```

Control — the identical two rows with row 7's `port` made valid:

```
servedBy(card 0) = {"kind":"unknown"}
  gpu0: <dt>served by</dt><dd>—</dd>
```

### The argument the build did not make against itself

1. **`incomplete` promises a fix that would not fix it.** The card tells the operator the question
   is open because the list was cut. Clear the refusal and card 0 still cannot answer — it drops to
   `—`, because the row it *did* read reports `gpus: null`. The card names the blocker that is
   easiest to clear and stays silent about the one that actually holds.
2. **§3.4 is not silent about `gpus: null`.** Its own table assigns that value a render
   unconditionally: *`null` → "invariant 1: an em dash, and the `errors[]` entry says why"*. The
   build recorded `12d-Q1` as *"§6.2/§3.4 do not say which form wins"*. §6.2 is silent; §3.4 states
   a render for one of the two facts and the build's precedence overrides it. Calling the whole
   thing a silence is a slightly generous reading of invariant 7.
3. **The build's own reason is weaker than stated.** It argues *"a refused row has no row on SERVING
   to sit beside, whereas an unreadable `gpus` already carries its `dbus` entry on the row it belongs
   to"*. Both explanations do reach SERVING — one on the row, one under the rows through
   `PanelNotes`. The argument is about **proximity**, not about presence, and proximity is a weaker
   basis for overriding an explicit table row than the build presents.

**My call: a spec question, not a defect.** The built side is defensible and it is pinned twice
(the test phase added the second layer). But `12d-Q1` should be re-worded from *"the spec does not
say"* to *"§3.4 assigns `gpus: null` the em dash and we are overriding it when a refusal is also in
play"*, so the owner is ruling on what actually happened.

---

## 5. ⚠ MEDIUM — the two panels now contradict each other in words when every row is refused

**Severity: medium.** `12c-Q5` was carried as *"unchanged"*. It is not unchanged: 12d gave the card
words, and the words now disagree with the panel §3.4 sends the reader to.

### Proof (`e.adv.tsx`)

`serving: [row '0' with port 'nope', row '7' with port 'nope']` — both refused, both identities
parsed.

```
enum = {"read":"partial","rows":[],"refused":["0","7"]}
SERVING text:  serving | llama-server instances | — | no severity band
               | no llama-server instances discovered
               | serving[0] was dropped: `port` did not validate
               | serving[1] was dropped: `port` did not validate
  gpu0: <dt>served by</dt><dd>list not fully read</dd>
  gpu1: <dt>served by</dt><dd>list not fully read</dd>
```

The SERVING headline states **"no llama-server instances discovered"** — a positive claim about the
machine — directly above two sentences saying the client threw away both rows it was sent, and one
panel away from two cards saying the list was not fully read.

Before 12d the cards rendered `—` and made no claim, so the page did not contradict itself in
prose. **The ruling created this**, which makes it more than a carried silence: it is the same
collapse §3.4 was written to stop (*a positive claim standing in for a failure to read*), now on
the panel that is supposed to be the authority.

One line changes it (`state.serving.read === 'partial'`), and the build says so. What the build got
wrong is the word "unchanged".

---

## 6. ⚠ LOW-MEDIUM (spec question) — the opposite failure is genuinely unbounded, and nobody recorded it

The handoff asked me to establish whether the ruling's mirror image is bounded anywhere. **It is
not.**

`grep -n remembered lib/conditions.ts`: `state.remembered` is rebuilt every poll and the **only**
deletion is inside the retire branch. Nothing ages a stale condition out, nothing caps how long a
protected subject may stay in the count, and `presence`/`holds` are deleted only there too.

So: a row the server never fixes — a permanently bad `port` for instance 7 — keeps `health:7`'s
alarm in the ledger, the dot and the count **forever**, which is precisely the defect §9's ruling
was written to remove (*"kept its alarm in the count indefinitely — measured still there at 20
minutes. Safe, and unbounded."*), reproduced for one subject by design. A permanently **anonymous**
refusal does it for the whole serving enumeration, exactly as 12c did.

**My call: a spec consequence, not a defect.** §9 says in as many words that a protected subject
goes *stale, never retired*, and §6.5's stale mode shows the age of the reading behind it, which is
the only signal the operator gets. But **the build's §5 silence table does not record it at all**,
and it is the single most predictable cost of the ruling. It belongs in `12d-build.md` §5 as a
recorded consequence so the owner can decide whether staleness needs a horizon.

---

## 7. LOW — `{read:'partial', refused: []}` is unreachable, and the type should still forbid it

**CONFIRMS §2 item 2**, and adds the measurement the test phase did not take.

Unreachable: `servingEnumeration` is `refused.length > 0 ? partial : all`, and it is the only
producer (`grep` over the tree: `parseSnapshot` and `lib/fixtures.ts` are the only callers).
Verified: `servingEnumeration([], [])` is `{ read: 'all', rows: [] }`.

Forged by hand, measured (`b.adv.ts`, S8):

```
forged {read:'partial', rows: [], refused: []} -> enumerationsRead = ["gpus:[]","serving:[]"]
```

— the ledger is told *serving was read, nothing held back*, while `servedBy` on the same value
answers `incomplete`. One value, two contradictory readings, and the ledger's is the permissive
one.

**Should the type forbid it? Yes, and it is one token:** `refused: readonly [string | null,
...(string | null)[]]`. `ServingEnumeration` is exported and structural, the whole reason `refused`
stopped being a count was that an under-specified value travelled, and a non-empty tuple costs
nothing at run time. Not fixed here.

---

## 8. LOW — the GPU `member` is inert, confirmed by measurement; but say what the pinning test actually proves

**CONFIRMS §2 item 3**, by measurement rather than by argument, with one correction.

Measured (`b.adv.ts`, S9) — `gpu_temp:1` confirmed at `alarm`, then four blind polls with
`gpus → ∅`:

```
gpus member="1"                         -> retired=["gpu_temp:1"]
gpus member="wrong"                     -> retired=["gpu_temp:1"]
gpus member=""                          -> retired=["gpu_temp:1"]
gpus member="llama-server@1.service"    -> retired=["gpu_temp:1"]
```

Identical in all four. The structural reason is stronger than "gpus holds nothing back": `gpus[]`
**cannot** hold anything back, because `wire.ts:969` is `arrayOrNull(field(value, 'gpus'), gpuOf)` —
one bad element refuses the **whole snapshot**, so `snapshot.gpus` is either `null` or completely
read, and `enumerationsRead` can only ever set `gpus → NOTHING_HELD_BACK`. The test phase's
conclusion — **no mutation should be added** — is right; a mutation on that member would be a
`DID NOT BITE`.

**The correction:** `observations.test.ts`'s
`expect(find(loaded,'gpu_temp:0')?.enumeration).toEqual({name:'gpus',member:'0'})` is therefore a
**specification** assertion with no behaviour behind its `member` half — structurally, "a fixture
whose two candidate answers coincide", which is one of this project's named traps. That is fine as
long as it is labelled. What is load-bearing and IS protected: `name`, and `enumeration !== null`.
The day `gpus[]` becomes row-lenient the way `serving[]` is, the `member` becomes live and needs a
mutation; until then the honest sentence is *"this assertion documents the intent; nothing checks
it"*, not *"this pins the member"*.

---

## 9. LOW — `12d-Q2`'s cost estimate for changing the copy is wrong by an order of magnitude

`12d-Q2` records: *"The tests key on the literal, so a change is a one-line edit plus fixtures."*
`grep -rn 'list not fully read'` over the tree, excluding the three phase reports:

| where | sites |
|---|---|
| `components/panels/gpu-panel.tsx` | **2** (one comment table, one production return) |
| `components/panels/gpu-panel.test.tsx` | 10 |
| `components/panels/serving-panel.test.tsx` | 2 |
| **`pipeline/steps/10-panels-assembly/regressions.py`** | **2** — `12d-GP1` and `12d-GP2` anchor on the literal |

Changing the copy re-aims **two mutations**, and therefore costs an anchor census plus a
359-mutation harness run. Not a defect; the estimate is what a future loop will budget against, and
it is off.

---

## 10. What I tried and could NOT break

Stated so nobody re-hunts it.

- **An identity that parses to a different string on the two sides of the comparison.** Closed.
  `instanceId` is the single spelling used both for a valid row's `instance` (which becomes the
  condition's `member`) and for a refused row's `identity`, and it normalises numbers through
  `String(value)` on both sides — so any one wire value produces the same string in both roles.
  Measured through `parseSnapshot`: `''`, `'01'`, `' 0'`, `'a b'`, `1.5` and a non-safe-integer all
  arrive as `null` (the frozen branch, the safe direction); `-0` and `0` both arrive as `'0'`, which
  is consistent rather than divergent.
- **A refusal whose identity matches nothing.** It retires every *other* absent subject, which is
  the ruling. It cannot un-protect a subject whose own row was refused in the same poll.
- **Clean → partial → clean.** Measured (`a.adv.ts`, S3, and S1/S2): a subject held back on poll N
  retires on the first poll where the enumeration is read without holding it back, with no fresh
  debounce — but that is the ruling's own answer and the subject genuinely is not in the server's
  list on that poll. No deletion of a subject the server is still reporting **by this route**.
  (Finding 1/2's route is different: the subject *is* reported.)
- **A subject appearing in two enumerations / a dedupe picking a wrong membership.** Measured
  (`f.adv.ts`): across `everythingZero`, `servingPopulated` and `nothingReadable`, the only
  condition id emitted twice in a poll is `unit:gpu-fan-control.service`, and **both** of its
  observations carry `enumeration: null` — so `observePoll`'s `chosen.enumeration` (taken from the
  worse-severity observation) cannot pick a wrong membership today. Confirms the test phase's §2.2.
  `NAMED_UNITS` holds one entry (`split → llama-split.service`), so no serving instance can collide
  with `gpu-fan-control.service` or with another instance's unit name.
- **The two partial renders being asserted EQUAL.** I could not construct a case where they must
  differ. `servedBy` never reads `refused`, both take the same two branches, and §9's distinction
  is about the ledger. The equality is a correct pin. The `gpu-panel.test.tsx` census
  (`new Set(...).size === 4`) is not vacuous — it is exactly the assertion `12c-Q1` would have
  failed.
- **The Set→Map migration in `lib/conditions.test.ts`.** 29 → 31 `enumerationsRead:` call sites, and
  every migrated one goes through one of **two named constants** (`GPUS` = `new Map([['gpus', new
  Set()]])`, `NOTHING_READ` = `new Map()`), both of which preserve the old meaning exactly. I read
  every one and found no site whose assertion weakened. The one genuine narrowing —
  `observations.test.ts`'s *"a REFUSED row is not a read enumeration"* becoming *"a row refused for
  its own IDENTITY…"* with `partlyRead(rows, [null])` — is the intended behaviour change and the
  named case is asserted in three other places. `partlyRead`'s new default of `[null]` defaults to
  the conservative branch, which is the right direction.
- **The test phase's own three additions.** Read in full. The duplicate-identity test, the
  second-layer precedence test and the `''`-vs-`null` loop all carry twins, all name both lists in
  full, and none of them can pass vacuously. No finding.

---

## 11. ⚠ This is an ADVERSARIAL phase only

Nothing here was fixed. **reconcile → parent review** still to run, each a fresh agent with a
written handoff; the parent re-runs `pnpm verify` itself and audits the adjudication — rejections
and deferrals first — before any commit.

⚠ **Findings 1 and 2 are the ones to adjudicate first, and they are a design question, not a
patch.** Finding 1 is pre-existing and touches `observePoll`'s contract; Finding 2 is 12d's and is
the reason the pre-existing hole now matters. Deferring both is a defensible answer — but
deferring them *silently*, on a loop whose stated purpose was to stop an alarm being deleted, is
not.
