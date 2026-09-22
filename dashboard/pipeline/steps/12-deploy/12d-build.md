# 12d BUILD — the card says what it does not know, and the ledger stops punishing every instance for one bad row

**Written by the BUILD phase, 2026-09-22.** Branch `dashboard-frontend`, working dir `dashboard/`,
clean at `9fcff77` when this started. **Nothing was committed, nothing was staged, nothing was
deployed, no spec file was edited, and this phase did not contact `192.168.4.71` at all** — no SSH,
no HTTP, no D-Bus socket opened and therefore none left open.

⚠⚠ **SUPERSEDED IN PART by `12d-reconciliation.md`, 2026-09-22.** The RECONCILE phase accepted
adversarial findings 1, 2, 3, 4, 5, 6, 7 and 9 and **changed the shipped code**: `EnumerationsRead`'s
value is now a PAIR (`{ members, held }`) so §9 row 2's *"and it was NOT IN IT"* is a clause in
`observePoll` rather than an inference from *no condition was emitted*. Read §3.1, §3.2 and §6's
mutation list below as **what the build shipped**, not as what the tree now holds; the
reconciliation names every line that moved. The §5 silences table and §1.2 carry their corrections
inline.

Two owner rulings of 2026-09-22, both already in `SPEC.md`:

- **§3.4 (`12c-Q1`)** — a partially-read `serving[]` gets its **own form** on the GPU card,
  distinct from the em dash and from a positive answer.
- **§9 row 2 (`12c-Q2`)** — a partial read **retires what it can**, per subject, turning on whether
  the refused row's identity parsed.

---

## 1. The card's third form, and why it reads as a statement about our knowledge

### 1.1 What it renders

```html
<div class="X"><dt class="X">served by</dt><dd class="X">list not fully read</dd>
```

against the em dash it used to be indistinguishable from:

```html
<div class="X"><dt class="X">served by</dt><dd class="X">—</dd>
```

`servedBy` gains a **fifth variant**, `{ kind: 'incomplete' }`, and `gpu-panel.tsx`'s `servedItem`
gains the case that renders it. Nothing else about the join moved: 12c's rule — *an incomplete list
may only produce a POSITIVE answer* — is unchanged, and only its two negative branches now answer
`incomplete` where they answered `unknown`.

### 1.2 Why those four words

The ruling's own sentence is the constraint: *"It is a statement about **our** knowledge, not about
the machine, and it must read that way."* Three candidate spellings were considered and two
rejected:

| candidate | rejected because |
|---|---|
| `list incomplete` | reads as a claim about **the machine's** list — that the box has an incomplete set of instances. The machine's list is fine; ours is short |
| `partial read` | a noun phrase naming a mechanism, not an answer to *who serves this card* |
| **`list not fully read`** | **taken.** The verb is ours, in the passive of an act **this client** performed; the noun is the LIST, which is the thing that was cut |

The word that does the work is **`read`**. The em dash's meaning — fixed by invariant 1 and used
everywhere on this page — is *this reading could not be taken*, which is a fact about a value. *Not
fully read* is a fact about **the act of reading a collection**, and it is the only one of the two
that the card is entitled to make after a refusal: nothing on the box failed, the client discarded
part of what the box sent. That is §9's own ratified sentence, which 12c put into the ledger and
`12c-Q1` asked the card to say: *"the collection was read successfully and the client discarded part
of it, which is not the same as the server not reporting it."*

⚠⚠ **CORRECTED 2026-09-22 by the RECONCILE phase (adversarial finding 3): the sentence that stood
here was a FABRICATED quotation of §3.4.** It read *"§3.4 says «keep it short — the full reason stays
on SERVING beside the refused row»"*. `SPEC.md` contains no *"keep it short"*, no *"value slot"* and
no *"forbids explanatory prose"* anywhere; the words were glued in front of a real half-sentence
**inside the quotation marks**, and the section number was changed from the one the parent's build
handoff gave (§3.7 → §6.4). The constraint is real — it is the **parent's brief**
(`handoffs/12d-partial-reads.md` §2: *"Keep it short; §3.7 forbids explanatory prose in a value
slot"*) — but it is not a line of the spec, and this project follows its own citations.

What the spec actually says, and it carries the four-word form on its own:

- §3.4, verbatim: *"The full reason stays on SERVING beside the refused row; the card says only that
  it cannot answer and why the question is open."*
- §6.4, verbatim (line 1572): *"§3.7 exists so an alarm is actionable, not so every cell carries
  prose"* — which is about **repeating one explanation across cells**, not about length.

Four words, no count and no reason: the card states that it cannot answer and why the question is
open, once. **The SERVING panel says which row and which field**, and §2.3 below is the render that
proves it does.

### 1.3 Distinguishable in the DOM **and** to a screen reader — and why no attribute was added

The bar was explicit, and the obvious answer was refused. A `data-state` on `Strip`'s `<dd>` would
make the two distinguishable **in the DOM** and would be **inaudible**: it is not announced, it is
not rendered, and a reader who cannot see the card would still hear "served by" followed by either a
glyph most screen readers skip or nothing at all — the same experience for two different facts.

What ships instead is that the difference **is the announced text**: four words against one glyph.
That satisfies both halves at once, with no second spelling of one fact to drift — `v` and the
answer it comes from are one `switch` on `served.kind`. It also leaves `components/strip.tsx`
untouched, so step 09's ledger is not in play.

⚠ The em dash's own poor announcement is **pre-existing and untouched** — it is what every invariant
1 cell on this page renders — and it is not this loop's to change.

### 1.4 The precedence decision, which the spec does not make

A list can be cut **and** a row that IS here can have an unreadable `gpus`. Both statements are true
and §6.2 says nothing about which the card shows. Built as: **`incomplete` wins.** The reasoning,
and it is recorded as a silence in §5 rather than presented as the spec's:

- A refused row has **no row on SERVING to sit beside** — the `llama-env` entry renders under the
  rows through `PanelNotes`, because a refusal carries no `instance` to attach it to. An unreadable
  `gpus` already has its `dbus` entry **on the row it belongs to**, through `errors[].instance`.
- So folding the refusal back into the em dash is exactly the collapse the ruling exists to stop:
  the more specific statement is the one with nowhere else to be made.

`lib/client/observations.test.ts` pins the choice with its twin (the same rows with nothing refused
still answer `unknown`), so changing it later is a deliberate act and not a tidy-up.

---

## 2. The five renders, quoted from real output

Every body below goes through the **real `parseSnapshot`** — `components/panels/test-support.ts`'s
`servingReadCases()` builds five raw JSON snapshots and `stateFromWire` renders whatever comes out,
so these are the validator's own strings and not a fixture's. The five differ from `complete` in
**exactly one field** each.

⚠ **The identities and the card indices disagree by construction**: instance `'0'` serves card 0 and
instance **`'7'`** serves card 1. A join reading the card's index, the row's position or
`String(index)` renders a different page, and *the subject we protected* (`7`) is not a card index
either — the second coincidence §9's per-subject rule could otherwise have rested on.

### 2.1 GPU 1's served-by strip, all five

| read | rendered |
|---|---|
| **complete** | `served by instance 7` · `gemma-4-31b` |
| **partial, identity parsed** (`port: "nope"`) | `served by` · **`list not fully read`** |
| **partial, identity NOT parsed** (`instance: 1.5`) | `served by` · **`list not fully read`** |
| **unreadable `gpus`** (`gpus: null`) | `served by` · `—` |
| **absent `gpus`** | `served by instance 1` · `—` |

Raw, as the two that used to be identical:

```
RAW gpu1 refusedNamed:     <dt class="X">served by</dt><dd class="X">list not fully read</dd>
RAW gpu1 refusedAnonymous: <dt class="X">served by</dt><dd class="X">list not fully read</dd>
RAW gpu1 gpusUnreadable:   <dt class="X">served by</dt><dd class="X">—</dd>
RAW gpu1 complete:         <dt class="X">served by instance 7</dt><dd class="X" title="gemma-4-31b">gemma-4-31b</dd>
RAW gpu1 gpusAbsent:       <dt class="X">served by instance 1</dt><dd class="X">—</dd>
```

**GPU 0 is byte-identical in all five** — `served by instance 0` · `qwen3.6-27b` — which is the
anti-vacuity half: a refusal elsewhere in the array must blank nothing this client read.

⚠ **The two partial rows are deliberately identical, and a test asserts their equality.** §3.4's
ruling is about the LIST and §9's is about RETIREMENT; which branch of §9 a refusal falls into
changes what the ledger does and changes nothing a card can honestly say. Pinning the equality is
what stops a later loop from leaking §9's distinction onto a panel with no standing to make it.

### 2.2 The census

Five reads produce **four distinct strips** on GPU 1, and the only pair that coincides is the two
partials. That assertion is the one `12c-Q1` would have failed: before the ruling, `refusedNamed`
and `gpusUnreadable` were equal.

### 2.3 The SERVING panel, the same five

```
SERVING complete:          … llama-server@0 | :8080 · GPU 0 | qwen3.6-27b · ctx 131,072 | health ok | active
                           … llama-server@7 | :8081 · GPU 1 | gemma-4-31b · ctx 131,072 | health ok | active
SERVING refusedNamed:      … llama-server@0 | :8080 · GPU 0 | qwen3.6-27b · ctx 131,072 | health ok | active
                           serving[1] was dropped: `port` did not validate
SERVING refusedAnonymous:  … llama-server@0 | :8080 · GPU 0 | qwen3.6-27b · ctx 131,072 | health ok | active
                           serving[1] was dropped: `instance` did not validate
SERVING gpusUnreadable:    … llama-server@0 | :8080 · GPU 0 | … | llama-server@7 | :8081 · — | … | active
SERVING gpusAbsent:        … llama-server@0 | :8080 | … | llama-server@7 | :8081 | …
```

Three things this render settles rather than assumes:

1. **The full reason really is on SERVING.** §3.4 promises it; the sentence above is the validator's
   own, quoted from the rendered markup.
2. **The two refusals differ HERE and coincide on the card.** The panel can say which field failed;
   the card cannot and must not. That asymmetry is the ruling.
3. **`was dropped` appears on exactly the two partial reads** and on none of the other three — so
   the assertion is not "the panel always says something was dropped".

`serving-panel.tsx` is **unchanged**. It already rendered the refusal through `PanelNotes`; this
loop asserts it rather than altering it.

---

## 3. Retirement: the per-subject exclusion, and the frozen branch with the test that pins it

### 3.1 The shape, and why it is a type and not a flag

Four values changed shape, each because the old one could not express the question being asked:

| | before | after |
|---|---|---|
| `ServingEnumeration`'s partial arm | `refused: number` | **`refused: readonly (string \| null)[]`** — one entry per refused row: the identity it named, or `null` |
| `CheckedRow`'s failure arm | `{ ok: false, why }` | **`{ ok: false, why, identity: string \| null }`** |
| `ConditionObservation.enumeration` | `string \| null` | **`EnumerationMembership \| null` = `{ name, member }`** |
| `PollOptions.enumerationsRead` | `ReadonlySet<string>` | **`EnumerationsRead = ReadonlyMap<string, ReadonlySet<string>>`** — key present is *read*, value is *held back* |

Three of those deserve their reason stated.

**`refused` is a list of identities, not a count plus a boolean.** A count beside a flag is two
copies of one fact, and this whole loop family exists because a fact travelled without the thing
that qualified it (12c's own rule: *a shortened array means two different things, and every reader
of one must be told which*). The count is `refused.length` and is never stored.

**`enumeration` became a PAIR so neither half can be stated without the other.** The cheaper change
— an optional `enumerationMember` beside the existing name — was refused: a §6.3 kind added to a
collection later would compile with the member missing, and the failure is silent **in the dangerous
direction**, retiring an alarm because we could not tell it was a subject we had failed to read.

⚠⚠ **The member is NOT the condition's subject, and that is the one thing a wrong implementation
gets wrong.** A `unit:` condition's subject is `llama-server@0.service`; the thing a refused
`serving[]` row can name is `'0'`. An exclusion compared against `subject` protects nothing, retires
the alarm, and **looks exactly like the correct implementation on every GPU fixture in the tree**,
where subject and member are the same string. `lib/conditions.test.ts` has a fixture whose subject
and member deliberately disagree, and `12d-C1` is the wrong implementation it catches.

**`EnumerationsRead` is a Map, so the old `Set` does not compile.** Thirty-odd call sites in
`lib/conditions.test.ts` were confronted by the compiler rather than found by hand — the same
mechanism 12c used to find `events.test.ts`'s harness silently asserting a fully-read enumeration.

### 3.2 The rule, in `enumerationsRead`

```ts
if (serving.read === 'partial') {
  const held = new Set<string>();
  let anonymous = false;
  for (const identity of serving.refused) {
    if (identity === null) anonymous = true;
    else held.add(identity);
  }
  if (!anonymous) read.set(SERVING_ENUMERATION, held);
}
```

- **Every refusal named its subject** → the enumeration counts as **read**, holding back exactly
  those identities. An instance that genuinely left the machine retires on this poll like any other.
- **Any refusal named nobody** → the key is **not added at all**, so no subject may be shown absent.

⚠⚠ **RECONCILE — the block below is the BUILD's, and it is not what ships.** `read.set(...)` now
takes `{ members: servingMembersOf(snapshot), held }`, and `observePoll` gained the membership
clause. See `12d-reconciliation.md` §2.

and in `observePoll`, three lines where there was one:

```ts
const membership = previous.enumeration;
const held = membership === null ? undefined : enumerationsRead.get(membership.name);
const enumerated = membership !== null && held !== undefined && !held.has(membership.member);
```

`undefined` is *the collection was not read* (nothing retires, as before); an **empty set** is *read,
nothing held back*; a member **in** the set is the new case. ⚠ An empty set and an absent key are
different answers — §3.1's `null` ≠ `[]`, one level further in — and both directions are asserted.

### 3.3 ⚠⚠ The frozen branch, and the tests that pin it

§9: *"that is not a special case to be optimised away, it is the honest answer to* we cannot tell who
is missing*."* Four tests hold it, at two depths, and each carries the twin that stops it passing
vacuously:

| where | test | its twin |
|---|---|---|
| `lib/client/wire.test.ts` | ⚠⚠ *a row refused for its own IDENTITY freezes retirement for the WHOLE enumeration* — `instance: 1.5`, and one anonymous refusal among named ones is enough | two **named** refusals DO report the enumeration, holding back exactly `['0','1']` |
| `lib/client/wire.test.ts` | ⚠⚠ *an ANONYMOUS refusal retires NOTHING, including the instance that really left* — end to end through `parseSnapshot` and four polls of `observePoll` | the `stale` list names **all four** subjects, so `retired === []` cannot pass on a sequence that never ran |
| `lib/conditions.test.ts` | ⚠⚠ *a MISSING key still retires nothing at all — the frozen branch survives the narrowing* | *an EMPTY exclusion set retires everything absent* |
| `lib/client/observations.test.ts` | ⚠⚠ *an ANONYMOUS refusal freezes the whole serving enumeration, and one anonymous row among named ones is enough* | two named refusals report it with both identities held |

⚠ The guard-that-passes-when-it-cannot-look trap (six instances in this project) is answered
explicitly: **every `retired === []` assertion is paired with a `stale` list named in full.** *Nothing
retired* and *nothing was ever there* are the same number and different facts.

And the wrong implementation that would erase the branch is written down: **`12d-O1`**, which drops
the `if (!anonymous)` and reports the enumeration read regardless. That is the optimisation §9
forbids, and it is a mutation rather than a deletion.

### 3.4 The measurement the ruling was made from, as a test

`lib/client/wire.test.ts`, ⚠⚠ *a PARTIAL read RETIRES WHAT IT CAN*: instance `0`'s row is refused for
its `port` (identity intact) while instance `1` has **left the machine**, so `serving[]` arrives
empty. Four polls past §6.4's debounce:

```
retired = ['health:1', 'unit:llama-server@1.service']
stale   = ['health:0', 'unit:llama-server@0.service']
```

Under 12c that first line was `[]` — one refused row froze every instance, so a departed instance's
alarm stayed in the ledger, the dot and the count indefinitely (measured still there at 20 minutes).
The two subjects **disagree by construction**, which is what makes the pair mean anything: a rule
that protected everything, or nothing, gives both the same answer.

⚠ The `unit:` half is asserted separately, because it is the half the subject/member conflation gets
wrong while the `health:` half keeps working.

---

## 4. Files changed

| file | what |
|---|---|
| **`lib/client/wire.ts`** | ⚠⚠ `CheckedRow` carries `identity`; `ServingList.refusals` becomes `RefusedRow[]`; `ServingEnumeration`'s partial arm carries the identities; `servingEnumeration`'s second argument is that list |
| **`lib/conditions.ts`** | ⚠⚠ `EnumerationMembership`, `EnumerationsRead`; `ConditionObservation.enumeration` and `DisplayedCondition.enumeration` are the pair; `observePoll`'s per-subject exclusion |
| **`lib/client/observations.ts`** | ⚠⚠ `enumerationsRead` returns the map and implements §9's two branches; `servedBy` gains `incomplete`; `conditionsFrom` states the member at every enumerated `push` |
| **`components/panels/gpu-panel.tsx`** | ⚠⚠ the third form — `served by · list not fully read` |
| `lib/fixtures.ts` | `wireRead` / `wireRefused` take the identity list |
| `components/panels/test-support.ts` | `stateFromWire`, `servingReadCases()` — the five reads as real wire bodies; `stateWithRefused`'s new argument |
| `lib/client/{wire,observations}.test.ts`, `lib/conditions.test.ts` | the new assertions and the Set→Map migration |
| `components/panels/{gpu-panel,serving-panel}.test.tsx` | the five renders, both panels |
| `lib/client/events.test.ts` | the harness's `servingEnumeration(..., [])` |
| `pipeline/steps/{04,08,10}/regressions.py` | 13 new mutations, 16 re-aimed |

**`serving-panel.tsx`, `components/strip.tsx`, `lib/client/runtime.ts`, `lib/units.ts`, `proxy.ts`,
`next.config.mjs` and everything under `app/` are untouched.** No `.env`; `next-env.d.ts`
byte-identical.

---

## 5. ⚠ Spec silences (invariant 7) — recorded, not invented

| # | the silence | what was built, and why |
|---|---|---|
| **12d-Q1** ⚠⚠ | ⚠⚠ **RECONCILE — this row was MIS-CLASSIFIED and is re-worded** (adversarial finding 4). It was recorded as *"§6.2/§3.4 do not say which form wins"*. **§6.2 is silent; §3.4 is not.** §3.4's own `gpus` table assigns the value a render **unconditionally** — *"`null` → invariant 1: an em dash, and the `errors[]` entry says why"* — so what was built is an **OVERRIDE of an explicit table row**, not a silence. Invariant 7 obliges a silence to be recorded; an override is a different and larger act, and the owner should be ruling on the one that happened. **Restated: when the list was cut AND a row we did read has an unreadable `gpus`, §3.4 says em dash and we show `list not fully read` instead** | **`incomplete` wins** (§1.4), unchanged in behaviour, and the argument is now stated at its real strength: both explanations do reach SERVING — the refusal under the rows through `PanelNotes`, the unreadable `gpus` on its own row through `errors[].instance` — so the case is about **proximity**, not about presence, which is a weaker basis for overriding an explicit table row than §1.4 presents. Pinned at two layers (`observations.test.ts`, and `wire.test.ts` end to end from raw bytes since the test phase), so reversing it is deliberate. ⚠ **Goes to the owner as an override, not as a silence** |
| **12d-Q2** ⚠⚠ | **§3.4 names no STRING for the third form.** It gives the meaning — *the list was incomplete, a statement about our knowledge, and "the card says only that it cannot answer and why the question is open"* — and leaves the copy open; the same family as `12c-Q5`. ⚠ RECONCILE: the *"keep it short"* half of this row's original wording was the fabricated quotation, and is struck | **`list not fully read`.** Three alternatives were weighed in §1.2. ⚠⚠ **RECONCILE — the cost estimate below was wrong by an order of magnitude and is corrected** (adversarial finding 9). It said *"a one-line edit plus fixtures"*. `grep -rn 'list not fully read'` outside the phase reports: `gpu-panel.tsx` **2** (one comment table, one production return), `gpu-panel.test.tsx` **10**, `serving-panel.test.tsx` **2**, and — the part the estimate missed — `pipeline/steps/10-panels-assembly/regressions.py` **2**, because `12d-GP1` and `12d-GP2` anchor on the literal. Changing the copy therefore **re-aims two mutations** and costs an anchor census plus a 359-mutation harness run |
| **12d-Q3** | **Should the card name HOW MANY rows were refused?** ⚠⚠ **RECONCILE — this row's recorded reason was struck and rewritten** (adversarial finding 3): it read *"§3.4 says keep it short and is otherwise silent"*, and the first half of that is a sentence nobody wrote. The checkable form: §3.4 says *"the card says only that it cannot answer and why the question is open"* and names no count; §6.2 names none either. A count is neither required nor forbidden | **No count**, and the reason that survives the citation: a count is a fact about **how much** we failed to read, and §3.4's own sentence licenses the card to say only **that** it cannot answer and **why the question is open** — neither of which a number answers. `refused.length` is available on the enumeration and reaches the panel, so adding it is free the day there is wording |
| **12d-Q4** | **Should a list read in part produce an EVENT-LOG line?** §6.4's vocabulary is transitions of bands and of closed-vocabulary values; a change in *completeness* is neither | **Nothing added.** The `llama-env` refusal entry already moves `failingSourceCount` and, after 12c's fix, escalates in the log when what that source says changes |
| **12d-Q5** | **A refused row may name an identity that ALSO appears on a row we read.** `12c-Q6` records that the wire does not police duplicate identities, so a server sending instance `0` twice — one valid, one refused — puts `0` into the exclusion set while a perfectly good row for `0` is on the page. It bites on the poll after the good row disappears: `0` is then held back rather than retired | **Held back anyway**, the conservative direction. §9 does not say whether a subject we read about *elsewhere in the same array* counts as accounted for, and guessing that it does is the direction that deletes an alarm |
| **12d-Q6** ⚠ | ⚠⚠ **RECONCILE — this row said "carried, unchanged" and that word is WRONG** (adversarial finding 5). 12d gave the card **words**, and the words now **contradict** the panel §3.4 sends the reader to. Rendered, both rows refused: SERVING's headline reads *"no llama-server instances discovered"* — a positive claim about the machine — directly above two *"serving[N] was dropped: `port` did not validate"* sentences, and one panel away from two cards saying *"list not fully read"*. Before 12d the cards rendered `—` and made no claim, so **the page did not contradict itself in prose; the ruling created that**, which makes this more than a carried silence: it is the same collapse §3.4 was written to stop — a positive claim standing in for a failure to read — now on the panel that is supposed to be the authority | **Not built, deliberately**, and the reason is invariant 7 rather than cost: the replacement headline is **panel copy nobody has ruled on**, and this phase may not edit `SPEC.md` or `MOCK.html`. `state.serving.read === 'partial'` is reachable from the panel, so it is one line the day there is wording. ⚠ Supersedes the *"carried, unchanged"* entry for `12c-Q5`, which is the same defect described as smaller than it is |
| **12d-Q7** ⚠ | ⚠⚠ **RECONCILE — the ruling's MIRROR failure is unbounded, and nothing recorded it** (adversarial finding 6, judged and accepted). Nothing ages a stale condition out: `state.remembered` is rebuilt every poll and the **only** deletion is inside the retire branch (`grep -n remembered lib/conditions.ts`). So a row the server never fixes — a permanently bad `port` for instance 7 — keeps `health:7`'s alarm in the ledger, the dot and the count **forever**, which is precisely the defect §9's ruling removed (*"kept its alarm in the count indefinitely — measured still there at 20 minutes. Safe, and unbounded"*), reproduced for one subject by design. A permanently **anonymous** refusal does it for the whole serving enumeration, exactly as 12c did. ⚠⚠ **And this phase's Finding-1 fix WIDENS it**: a row that stays in `serving[]` reporting `health: null` for ever now keeps its last alarm for ever, where before it was deleted | **Recorded, not changed.** §9 says in as many words that a protected subject goes *stale, never retired*, and `lib/conditions.ts` carries the reason (*"An expiry would be a clock that silently turns an alarm green"*); §6.5's stale mode shows the age of the reading behind it, which is the signal the operator gets. The widening is the **spec's own preference** — *"An unobservable alarm is unknown, not resolved"* — chosen over deleting a live alarm. ⚠ Whether staleness needs a HORIZON is a §9 ruling and is the owner's |

---

## 6. Measurements

Every figure is quoted from the command's own output.

### `pnpm verify` — **exit 0**

```
Test Files  109 passed (109)
      Tests  3838 passed (3838)
Type Errors  no errors
```

3810 at `9fcff77`, so **28 tests added**; no new test file.

### The three harnesses — derived, not inherited

Every `regressions.py` was imported and its `LEDGER_FILES` intersected with the files `git status`
reports modified. **Three own at least one:**

| harness | its ledger files that are dirty |
|---|---|
| `04-collector-cooling` | `lib/conditions.test.ts` |
| `08-client-runtime` | `lib/client/{wire,observations,events}.test.ts` |
| `10-panels-assembly` | `components/panels/{gpu-panel,serving-panel}.test.tsx` |

⚠ **This is 04/08/10, and the handoff predicted 05/08/10.** Step 05's ledger files are
`lib/collectors/*.test.ts` and none of them is touched — its `WIRE` is `lib/collectors/dbus-wire.ts`,
not `lib/client/wire.ts`. Step 04 owns `lib/conditions.test.ts`, which this loop changes heavily.
Step 02 mutates `lib/conditions.ts` but its ledger files (`lib/format.test.ts`,
`lib/severity.test.ts`) are clean, so it was not run; its anchors in that file were verified by the
census below.

**All three were run SERIALLY, one at a time, never two at once, none killed, and no exit status was
read through a pipe** — one shell, three foreground commands, each `$?` written straight to its own
status file and the ANCHOR report read from the log. `pnpm verify` never ran beside one, and nothing
polled with `pgrep`.

| harness | run | exit | mutations | distinct red tests | ⚠ checked | what the report said |
|---|---|---|---|---|---|---|
| `04-collector-cooling` | 1st | **0** | **97** | 193 | 90 | clean — *"All 97 regressions failed their check, as they must."* |
| `08-client-runtime` | 1st | **0** | **238** | 428 | 314 | clean — *"All 238 regressions failed their check, as they must."* |
| `10-panels-assembly` | 1st | **0** | **359** | 554 | 386 | clean — *"All 359 regressions failed their check, as they must."* |

**Zero `ANCHOR NOT FOUND` / `ANCHOR AMBIGUOUS` / `ANCHORS MOVED` / `DID NOT BITE` /
`NO MUTATION REDDENS` / unmatchable ledger keys on every run, and every ⚠-marked test went red under
at least one mutation** — grepped from each log, never read off an exit code, and never through a
pipe. ⚠ **All three passed on the FIRST run**, which is unusual for this project and is stated as a
fact rather than as a claim about quality: 12c needed a second run on two of its five.

**All thirteen `12d-` mutations bit**, with their red counts:

| step 04 | step 08 | step 10 |
|---|---|---|
| `12d-C1` red=2 · `12d-C2` red=2 · `12d-C3` red=5 | `12d-W1` red=5 · `12d-W2` red=4 · `12d-O1` red=4 · `12d-O2` red=6 · `12d-O3` red=3 · `12d-O4` red=4 · `12d-O5` red=2 · `12d-O6` red=1 | `12d-GP1` red=5 · `12d-GP2` red=4 |

⚠ `12d-O6` reddens **exactly one** test — the precedence test of §1.4 — which is correct and is the
point: it is the only mutation in the set that changes nothing except which of two non-answers a
card shows when both are true. A finding that it is *too* narrow is a fair one for the adversarial;
it is recorded here rather than hidden.

### The anchor census

⚠ **Before paying for any harness run, every anchor in all ten ledgers was checked to match its
source exactly once.** That is the cheap version of `ANCHORS MOVED`, and it caught **16** anchors
this loop's own edits had orphaned — four of them in files this loop was not thinking about
(`04-T72` in step 04, `12c-GP22` in step 10, and `08-O14`/`12b-OB2`/`12b-OB3` which no longer
matched because `servedBy`'s last three lines became four).

| | before | after |
|---|---|---|
| mutations across the ten harnesses | 1571 | **1584** |
| unique ids | 1571 | **1584** |
| cross-harness collisions | 0 | **0** |
| anchors not matching exactly once | 0 | **0** |

**Thirteen mutations added** — three in step 04, eight in step 08, two in step 10 — and **sixteen
re-aimed**, every one because this loop's own change moved the expression and none because a
mutation was weakened. Each still removes exactly what its name says; `12c-T02`'s name was corrected
from *"the count of wire-refused serving rows"* to *"the wire-refused serving rows"*, because the
count is no longer what it throws away.

### The thirteen new mutations

| id | the wrong implementation |
|---|---|
| `12d-C1` | the exclusion is matched against the condition's own **subject**, so a `unit:` row is never protected |
| `12d-C2` | the per-subject exclusion is ignored entirely, so a refused row's alarm retires anyway |
| `12d-C3` | the exclusion is **inverted**, so the only subject that retires is the one we could not read |
| `12d-W1` | every refused row reports an anonymous identity — retirement frozen for the whole enumeration again |
| `12d-W2` | a row refused **for** its `instance` reports the raw value as an identity, so §9 retires subjects it never read |
| ⚠⚠ `12d-O1` | an anonymous refusal still reports the enumeration READ — **the frozen branch optimised away** |
| `12d-O2` | a named refusal holds nothing back, so the refused subject retires at `normal` |
| ⚠⚠ `12d-O3` | a `unit:` condition is enumerated by its **unit name**, so a refusal's identity can never match it |
| `12d-O4` | a partial list answers the em dash again — the collapse §3.4's ruling forbids |
| `12d-O5` | the old-server index fallback answers the em dash rather than saying the list was cut |
| `12d-O6` | an unreadable `gpus` outranks the cut list, so a refusal renders as a failed reading (§1.4's precedence) |
| `12d-GP1` | the partially-read card renders the em dash — the exact pre-ruling render |
| `12d-GP2` | the partially-read card claims `no instance` — the 12c defect, through the new door |

⚠ `12d-O1`/`O2`, `12d-C2`/`C3` and `12d-W1`/`W2` are **pairs, one per direction**: a single mutation
of a clause can only prove that *a* clause is there, never that it points the right way
(HANDOVER §5).

### The browser measurements

**`measure-breakpoints.mjs` — exit 0, `102 passed, 0 failed, 0 blocked by this environment, 102
total`.** Unchanged count, first run, and it printed `Restored next-env.d.ts` — `git status` agrees
the file is byte-identical.

**`measure-arrangements.mjs` exit 0; `check-density.mjs` exit 0, `ALL PASS`.**

The figures the handoff named, from this run — both reproduce:

| claim | measured here |
|---|---|
| one panel **0.8 px** from its cap at 1600 | **`closest to its cap: gpu0 by 0.8 px`** |
| the tightest of all | `cpu by 0.7 px`; also `gpu0 by 1 px`, `serving by 1.3 px` |
| §6.1's no-scroll promise | `spare 284 px` at 1920; `overflow 0` with the §6.4 banner pinned (band 101.8) |
| the healthy page's spare | **`283.6 px`** (content bottom 796.4, viewport 1080) |

⚠ **Neither measurement should have moved and neither did.** This loop adds no element to any panel:
the third form replaces one already-present `<dd>`'s text, and three words wrap inside `Strip`'s
existing `overflow-wrap: anywhere` cell rather than adding a line. Both scripts were run **after**
every harness had finished, never beside one.

### `git status`

**16 entries: 15 modified, 1 untracked. Nothing is staged and nothing is committed.**

```
untracked: pipeline/steps/12-deploy/12d-build.md
```

⚠ **`next-env.d.ts` is NOT in the list** — `measure-breakpoints.mjs` restored it and the listing was
taken after the last run finished, which is the only time it means anything. **No source file is
left mutated:** every harness restored what it touched, and the anchor census (1584 for 1584) was
re-run against the tree afterwards. `pnpm verify` was re-run a final time on exactly this tree —
**109 files, 3838 tests, exit 0.**

---

## 7. Rules observed

- **Nothing was committed and nothing was staged.** No `git add`, no `git checkout --`, no push.
- **No spec file was edited.** `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are
  untouched; every wording this phase wants is in §5.
- **No harness ran beside another**, none was killed, and `pnpm verify` never ran beside one. No
  `pgrep`. Every exit status was written to its own file with `$?`, never read through a pipe.
- **The box was not contacted.** No SSH, no HTTP to `192.168.4.71`, no D-Bus socket opened.
- Nothing was deployed; `next-env.d.ts` is byte-identical; there is no `.env`.
- `components/` stays hook-free — this loop added no component and no hook.

## 8. ⚠ This is a BUILD phase only

`12d` is not done. **test → adversarial → reconcile → parent review** each run as a fresh agent with
a written handoff, and the parent re-runs `pnpm verify` itself and audits the adjudication —
rejections and deferrals first — before any commit.
