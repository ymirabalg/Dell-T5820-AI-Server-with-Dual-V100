# 12b RECONCILE — **a bounds check that is not stated as an invariant will be re-found as a symptom, once per phase.**

**Written by the reconciliation phase, 2026-09-17.** Branch `dashboard-frontend`, working dir
`dashboard/`. Nothing committed, nothing deployed, **nothing written to the box and no D-Bus
connection opened** — this phase did not touch `192.168.4.71` at all. No spec file edited.

**The one-line answer:** `Reader.array` was the only thing in the codec that knew a declared
length is a *region* — that its values must account for exactly its bytes — and it knew it
privately. The message did not, so one flipped byte at offset 4 of a real captured reply produced
a well-formed message declaring 191 bytes instead of 96 and ate 95 bytes of the next one. The rule
now has **one statement**, `Reader.region` (`lib/collectors/dbus-wire.ts`), and **three callers**:
the array, the header field array, and the message body. Two of the three bounds checks that stood
beside it are gone — absorbed, not added to.

---

## 1. Adjudication

| finding | verdict | what was done |
|---|---|---|
| **12b-A1** `byteLength` trusted, never reconciled | **ACCEPTED — the governing finding** | `Reader.region`: rule 3 (*the values must account for exactly the declared bytes*) now covers the message body as well as the array. §2 |
| **12b-A2** a header field reads out of the field array | **ACCEPTED — same fix** | the field loop is a region; `need()` bounds on the region, not the frame (rule 2). No second check was added |
| **12b-A3** `DBUS_MAX_MESSAGE_BYTES`'s doc overstates what it closes | **ACCEPTED (documentation)** | corrected at the source, with both measured numbers (`2**27` → 303 ms; `2**27 + 1` → 7 ms) |
| **12b-A4** no message-TYPE check on a reply | **ACCEPTED** | `Conversation.call` refuses a non-reply carrying our `REPLY_SERIAL`, loudly. §4 |
| **12b-A5** five one-line reverts keep the suite green | **ACCEPTED — all five closed** | one test each (two of them one test for two reverts), five mutations. §3 |
| **12b-A6** the frozen fixture's authenticity is asserted nowhere | **ACCEPTED** | a test over the fixture's OWN parsed bytes, plus mutation `12b-WR7` |
| **12b-A7** measurement 19 cannot tell the two joins apart | **ACCEPTED** | measurement **21**, a cross-pinned page; 19 left alone as the pixel record. §5 |
| **12b-A8** `instanceWithNoReadings` never got `gpus: null` | **ACCEPTED** | fixed, with the test that the card now claims nothing |
| **12b-A9** `unserved` minted from an absent key | **DEFERRED — the parent's ruling** | not touched. It is a §6.5 judgement pinned by a test that argues it; the third option the adversarial names (`unknown`) is a rendering change on a live page |
| **12b-A10** `serving: []` names instances that do not exist | **DEFERRED — the parent's ruling** | not touched, same class, and byte-identical to what `f6f3101` renders |
| **12b-A11** `gpus` shapes the collector cannot make | **RECORDED** | §7.8 is already an open spec item; the wire refuses nothing new here without a ruling |
| **12b-A12** `SPEC.md:1196` states the retired join as the rule | **REPORTED, not edited** | replacement sentence in §8 |
| **12b-A13** stale names elsewhere that teach the retired rule | **PARTLY FIXED** | three prose/name sites corrected; `scripts/api.probe.ts` half-fixed. §6 |
| **12b-A14** §7.9's cost, enumerated | **CONFIRMED AND EXTENDED** | §9 — surveyed independently, and the adversarial's six sites are right |
| A14's two minor notes (unbounded buffer, O(n²) `pull`) | **RECORDED** | both bounded by the deadline; not touched |

**Counts: 8 accepted and fixed, 2 deferred to the parent as rulings, 2 recorded, 1 reported as a
spec edit, 1 partly fixed, 1 confirmed.**

---

## 2. ⚠⚠ 12b-A1 and 12b-A2 — where the invariant lives now

**One statement, three callers, and two checks DELETED rather than a third added.**

`Reader.region(what, declared, read)` (`lib/collectors/dbus-wire.ts`) says the whole rule:

> **A declared length is a region.** (1) A region must FIT the region that declared it. (2) Nothing
> inside it may read past its end. (3) Its values must account for EXACTLY its bytes — stopping
> short is the same lie as running over, told in the other direction.

| caller | region | what it used to have |
|---|---|---|
| `Reader.array` | the array's own byte count | its own copies of rules 1 and 3, and nothing for rule 2 — **both now deleted** |
| `decodeMessage`, header fields | `fieldsLength` | nothing. Bounded by the frame, which is not the boundary that applies (12b-A2) |
| `decodeMessage`, the body | `bodyLength` | nothing at all (12b-A1) |

Rule 2 is `Reader.need`'s bound: `this.limit`, the innermost region, not `this.bytes.length`. Rule 1
and rule 3 are `region`'s two throws. The `Incomplete` `need` raises carries the sentence naming its
region, and the ONE conversion at `decodeMessage`'s `catch` turns it into `malformed` — the same
boundary the test phase established, now carrying a diagnosis instead of a fixed string.

**The frame stays**, and it is not a fourth check: `Reader` takes its initial `limit` from the
buffer it is handed, so cutting the buffer to `byteLength` is what makes *the message* a region
like any other. The three regions nest inside it.

### What it costs the attacker, measured

| input | before | after |
|---|---|---|
| two real messages, the first's `bodyLength` inflated by the second's length | `kind: 'message'`, right serial, right body, `byteLength` covering BOTH; message two discarded unread | **`malformed`** — *"the message body declared N bytes and its values account for M"* |
| `CAPTURED_DBUS_GET_UNIT_REPLY[4] = 0x7f`, padded so the bytes exist | `kind: 'message'`, `byteLength: 191` for a 96-byte reply | **`malformed`** |
| `ERROR_NAME` declaring 16 or 24 bytes in an honest 24-byte field array | `kind: 'message'` with `errorName` made of the BODY's bytes | **`malformed`** — *"a value in the header field array overran its declared length"*, and nothing from the body is in the sentence |
| a `bodyLength` with no `SIGNATURE` field to read it | `kind: 'message'`, empty body, the declared bytes skipped | **`malformed`** |
| end to end, through the real `Conversation`: `GetUnit` answered honestly in the same read as the next reply, first length inflated | `unitState: null`, **"timed out after 300 ms"**, 301 ms | **one named `dbus` entry in <500 ms**, no "timed out" |

⚠ **The two rules overlap, and the difference between them is the diagnosis.** With rule 2 reverted
(reads bounded by the frame again) the header-field attack is still *refused* — by rule 3, because
the cursor ends past `fieldsEnd`. What changes is that the body's bytes are decoded into `errorName`
first and only the cursor's final position gives it away. Rule 2 refuses the read; rule 3 notices
afterwards. Both are asserted, and which one fires is what the two tests pin.

### ⚠⚠ What the fix REVOKED — three ⚠ tests whose only reddening mutation was unrelated to them

**This is the loop's second-best finding and it came from the harness, on the first run after the
fix.** Rule 3 refuses a body whose values do not account for its declared bytes — and *several
existing mutations used to produce exactly such bodies*. `05-W3` (*a VARIANT decodes to its own
type name*) corrupts the **SIGNATURE header field**; the body was then read under the wrong
signature, decoded to something, and returned `kind: 'message'`. Three ⚠ tests in
`dbus-wire.test.ts` had been scoring **covered** on mutations of that class: *"the widening is ONE
level deep"*, *"a signature ending in a bare `a`"* and *"a VARIANT nested thousands deep"*. None of
them is about header fields. ⚠ **Measured** rather than inferred: with `05-W3` applied to the
reconciled tree, 31 tests redden and **none of those three is among them** — rule 3 makes those
bodies `malformed`, which is what the three tests assert, so they pass. The ledger then reported
all three as having **no mutation at all**, and that report is the only reason any of it was seen.

| test | resolution |
|---|---|
| *a signature ending in a bare `a` is malformed rather than silently dropped* | **`12b-W29`** — `completeTypes`'s throw becomes `break`, which is the *silently dropped* the name warns about. red=1, and it is that test |
| *a VARIANT nested thousands deep is refused rather than thrown* | **`12b-W30`** — `decodeMessage`'s generic `catch` rethrows, which is the *thrown* the name warns about (and `Conversation.message()` turns a throw into the end of the whole conversation). red=1 |
| *the widening is ONE level deep — `a(ii)`/`a{sv}`/`aas`* | ⚠ **the ⚠ was DROPPED**, per the harness's own second hypothesis. Three candidate wrong implementations were written and measured — `alignmentOf`'s `default` → `1`, `value`'s `length === 2` → `>= 2`, `completeTypes` swallowing the rest of the signature — and each reddened a different test or none: those three signatures are refused by **two independent guards** and the frames are too short for either container to complete under any of them. The test stays; the certification it could not earn does not |

### ⚠⚠ And it happened a SECOND time, in another harness, from the other fixture change

Step 10's first run returned 1 for the same reason in a different place:
**`⚠ absent-from-the-enumeration and present-with-every-reading-null do not render alike`** lost
`10b-GP4` (*an absent card renders identically to a present card whose readings all failed*). The
test rendered **two different snapshots** — `rawGpuSnapshot()` against `allReadingsNull` — and when
`allReadingsNull` gained §3.4's `gpus: null` (12b-A8), the two renders began differing in the
**served-by strip** as well as in the enumeration. Under the mutation they were no longer identical,
so the test passed for a reason that has nothing to do with its name.

Repaired by making both snapshots **one base varied in one field** — `allReadingsNull`, and
`allReadingsNull` with card 1 dropped from `gpus[]` — so the enumeration is the only difference on
offer. `10b-GP4` reddens it again (measured), and the test now also asserts that the absent render
really is the *card not enumerated* takeover, which it never checked.

⚠ **Two fixtures, two harnesses, one shape: a test that compares two DIFFERENT fixtures is a test
whose subject is whatever happens to differ.**

⚠ **The general lesson, and it is the ledger's own documented limit made concrete:** a ⚠ mark says
*some* mutation reddens this test, never *the right one*. Strengthening the decoder deleted three
accidental ledger entries at once, and the only reason anyone saw it is that the harness re-runs
every mutation against every ledger file. **Expect a correctness fix to cost coverage somewhere,
and read the ledger's complaint as a question about the TEST's own subject rather than as a
missing mutation.**

---

## 3. 12b-A5 — the five reverts, closed, and what reaches them now

### The sweep, before and after

| arm | before | after |
|---|---|---|
| single-byte substitutions, frame alone | **1218 decodes** (99 + 99 + 72 bytes × 5 replacement values, minus the byte-already-equal skips) | 1218, unchanged |
| **the same corruptions with an honest COPY of the frame behind them** | — | **1218 more, and they are the arm that reaches 12b-A1** |
| every truncation of each frame (a separate ⚠ test) | 270 prefixes | 270, unchanged |
| **total decodes inside the sweep test** | **1218** | **2436** |

The second arm asserts a property the first structurally cannot: **if a corrupted frame still
decodes, advancing by the `byteLength` it reports must leave the next message intact.** Verified to
bite by removing rule 3 — it fails at `byte 4 = 127`, which is the adversarial's own measurement,
plus `byte 12 = 0` (the `fieldsLength` low byte) and the whole class behind them.

⚠ **Why the sweep could not.** The exhaustive corruption sweep tests `decodeMessage`'s *prologue*,
not `Reader`: every truncation it builds is SHORTER than `byteLength`, so it is answered
`incomplete` at `bytes.length < byteLength` before a reader is entered, and its byte-substitution
arm keeps the length fields honest except where it inflates them (which was 12b-A1). Nothing in it
can put a cursor one byte past a region's end. That needs a frame built to land there, which is
what the tests below are.

| revert | closed by | mutation |
|---|---|---|
| **R1** `declaresGpus`'s `Object.hasOwn` → `!== undefined` | `observations.test.ts` — a row SPREAD with `gpus: undefined` still declares; the ABSENT row beside it still takes the index join | `12b-OB11` |
| **R2** `optionalCardList`'s `Object.hasOwn` → `source[key] === undefined` | `wire.test.ts` — a present `gpus: undefined` REFUSES the row; the same rows without the key validate | `12b-WR6` |
| **R33** `alignmentOf`'s `case 'v'` 1 → 4 | `dbus-wire.test.ts` — the alignment table asserted AS A TABLE, all fourteen rows | `12b-W26` |
| **R40** `Reader.signature`'s `need(length + 1)` → `need(length)` | `dbus-wire.test.ts` — a SIGNATURE whose NUL falls outside the region is refused BEFORE the read (*"overran"*), not after (*"account for"*) | `12b-W28` |
| **R41** `Reader.string`'s `need(length + 1)` → `need(length)` | the same test for a STRING | `12b-W27` |

⚠ **Two of the five needed a different kind of assertion, and saying which is the point.**

- **R33 is unobservable through a decode, and that is a property of the code rather than a missing
  frame.** `alignmentOf` is reached from one place — the padding after an array's length — and the
  cursor there is always 4-aligned already, because the length is a `uint32` that aligns itself. So
  `v`'s 1 and `s`'s 4 produce identical bytes for *every frame this codec can be handed*. A table
  whose rows cannot be observed one at a time has to be asserted as a table; `alignmentOf` is now
  exported for exactly that, with the reason in its doc.
- **R40/R41 stopped being silent misparses the moment rule 3 existed.** Without the `+ 1` the
  cursor lands one past the region, and rule 3 refuses the message — so the revert is no longer a
  *wrong value*, only a *different diagnosis*. The test pins which rule fires, which is the sentence
  a person reads in an `errors[]` entry. ⚠ That is the invariant subsuming a symptom: the `+ 1` is
  worth keeping because refusing a read beats noticing afterwards, not because it is the only thing
  standing between the peer and a lie.

⚠ **And R1 is narrower than its own doc claims.** `exactOptionalPropertyTypes` is on, so
`{ ...instance, gpus: undefined }` **does not compile** against `gpus?: readonly number[] | null` —
the shape cannot be written in typed code in this tree (the test casts to produce it). Its live
route is the wire, where `parseSnapshot` takes `unknown`, and that is R2's site. R1 is the second
line; both are now asserted, and the ordering between them is recorded in both tests.

---

## 4. 12b-A4 — a reply is a TYPE, not just a serial

`Conversation.call` now refuses a message that carries our `REPLY_SERIAL` and is neither
`METHOD_RETURN` nor `ERROR`. **Refused, not skipped**: `REPLY_SERIAL` on a call or a signal is not
legal D-Bus, and skipping it would burn the budget and end in *"timed out"* about a bus that
answered — the failure this file's own `malformed`-throws-rather-than-waits reasoning is about.

Measured through the scripted bus: a `SIGNAL` carrying the serial used to produce
`unitState: active` with **`errors: []`**; it now produces `unitState: null` and one entry saying
the bus answered with a message that is not a reply.

⚠ **Still not established, and it was not established by the adversarial either**: whether
`dbus-daemon`'s default system policy lets an unprivileged peer deliver such a message to this
client at all. That would need traffic on the live box. The client-side gap was measured and is
closed; the delivery path is unproven in both directions.

---

## 5. The two join gaps the cross-pinned fixture did not reach

**`components/panels/test-support.ts` (12b-A8).** `instanceWithNoReadings` gained `gpus: null`, so
`allReadingsNull` — the panel suite's *"current server, nothing readable"* snapshot — stopped being
an **older-server** snapshot. Before: every GPU card built on it rendered *served by instance 0*, a
positive claim about who serves the card, from a fixture whose name says nothing about this instance
could be read. The sweep beside it could not notice, and the reason is worth keeping: it asserts
that no VALUE CELL prints a numeral, and `served by instance 0` is a `Strip`'s **label** — the
numeral is in the name of the reading, not in the reading. §6.5 is about claims, not about cells.
Pinned by a test of its own; mutation `12b-GP14`.

**`measure-breakpoints.mjs` (12b-A7).** Measurement 19 keeps `gpus: [i.instance]` and stays the
pixel record of the page the box becomes — that defence is sound for pixels. **Measurement 21 is
new**: a cross-pinned page where instance 0 serves card 1 with a different model on each, so
- naming the card from the instance number renders `served by instance 0` on card 0 → fail;
- naming it from `gpus` but taking the model from the row's position renders the wrong model → fail
  (the `gpu0Lacks`/`gpu1Lacks` terms, which is §6.2's actual complaint: *the wrong model on a card
  rather than a missing one*).

Both new terms are guarded by `measurement-harness.test.ts`'s exact-count sweep and by mutations
`12b-MH17`/`12b-MH18`.

⚠ **`measurement-harness.test.ts` caught my own edit twice** — once for reformatting the
`gpu0NotBlank`/`gpu1NotBlank` conjunction across lines, and once for QUOTING it in the comment I
added to explain why it must stay on one line, which made the exact count 2. That guard is doing
precisely what it was written for.

---

## 6. 12b-A13 — the names that still teach the retired rule

| site | before | now |
|---|---|---|
| `components/panel-props.ts:22` | ``the GPU↔instance join (`gpu.index === serving.instance`)`` | names `servedBy` and §3.4's `gpus`, with the fallback called a fallback |
| `components/panels/gpu-panel.test.tsx:29` | ``the served-model row is joined by `gpu.index === serving.instance``` | the same correction |
| `components/panels/gpu-panel.test.tsx:240` | `describe('⚠ the GPU↔instance join is gpu.index === serving.instance')` | renamed to name §3.4's FALLBACK, which is what the tests inside legitimately exercise (they use `servingInstances`, which carries no `gpus`). ⚠ Safe for the ledger: the ⚠-scanner reads `test(`/`it(` names, never `describe(` |
| `scripts/api.probe.ts:132` | `head('serving', 'one instance per GPU · /health + /v1/models')` — a hard-coded claim about the arrangement | the head no longer asserts an arrangement, and each row prints its own cards through `servedCards` — the same function the panel uses, not a second implementation |

⚠ **Left undone, deliberately:** the probe still prints no served model on its GPU blocks. Doing
that means running `servedBy` per card inside a script nothing tests and that cannot be exercised
without the live box. Recorded rather than half-done.

---

## 7. The measurements

All run on the reconciled tree, **serially, one at a time, nothing beside a harness**, with
`PATH` starting at `$HOME/.nvm/versions/node/v24.16.0/bin`.

### 7.1 `pnpm verify` — **exit 0**

**108 files, 3662 tests, no type errors.** Was 108 / 3634 at the end of the test phase; **+28**.
Run cold (`rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run`), with no harness beside it —
and **run a second time, last of everything**, because two files were mutated and restored after the
first one (the browser probe below, and `gpu-panel.tsx` for the `10b-GP4` check). Both runs are
identical and the second is the state of the tree as it stands. ⚠ A restoration verified only by a
diff is a restoration nobody executed.

### 7.2 The three harnesses — **all exit 0**, and three of the six runs returned 1 first

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `05-collectors-serving-storage-safety` | **167** (test phase: 161) | 265 red across 167; **164 ⚠ checked** | **exit 0** |
| `08-client-runtime` | **192** (189) | 321 red across 192; **243 ⚠ checked** | **exit 0** |
| `10-panels-assembly` | **344** (341) | 522 red across 344; **354 ⚠ checked** | **exit 0** |

**Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, zero unmatchable ledger
keys, and every ⚠ mark reddened in all three.** 1513 mutation ids across the ten harnesses, 1513
unique, zero cross-harness collisions (re-derived by importing each `regressions.py`).

⚠ **Three runs returned 1 before these, and every one of them was the harness doing its job:**

| run | returned | why |
|---|---|---|
| 05, first | **1** | `ANCHORS MOVED — 05-D3`. `Conversation.call`'s loop body changed when it gained the type check (12b-A4), so the serial test is one line of three. Re-aimed; the defect is unchanged |
| 05, second | **1** | the ledger: **three ⚠ tests with no mutation at all** — §2's revoked coverage. Two got a mutation of their own, one lost its ⚠ |
| 10, first | **1** | the ledger again, one test, the same shape from the other fixture change — §2 |

**Neither was papered over with a mutation invented to make the complaint go away**, which is the
rule the harness's own comment states: *the first hypothesis is that the test is inert.*

### 7.3 Browser — `measure-breakpoints.mjs` — **exit 0**

**102 passed, 0 failed, 0 blocked** (the test phase's figure was 95; **measurement 21 adds 7
records**).

| page | 1280 spare | `serving` slot | gpu card | what it shows |
|---|---|---|---|---|
| 19 (redeployed) | 263 px | **103.8 px** | 164.5 px | `served by instance 0 qwen3.6-27b`, `:8080 · GPU 0` |
| 20 (split) | 263 px | 97 px | 164.5 px | `served jointly with GPU 1`, `:8080 · GPUs 0, 1` |
| **21 (cross-pinned)** | 263 px | **103.8 px** | 164.5 px | **`served by instance 1 gemma-4-12b` on GPU 0**, `:8080 · GPU 1` |

⚠ **Measurement 21 was PROBED BY BREAKING IT before being trusted** — HANDOVER §0.11's process
rule. Its three expectations were flipped to the per-GPU wording (`served by instance 0` on card 0)
and the run returned **exit 1, `FAIL 21`, 101 passed / 1 failed**; the file was then restored and
the passing run above is the restored one. A measurement nobody has seen fail is a measurement
nobody has seen.

### 7.4 The density pair — both **exit 0**

`measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture` → exit 0, overflow 0
at all three viewports; `check-density.mjs` → **ALL PASS** (page overflow 0, spare 283.6 px,
banner-pinned overflow 0).

### 7.5 `git status`

Matches the list inherited from the adversarial phase plus this phase's own files and
`steps/12-deploy/12b-reconciliation.md`. **`next-env.d.ts` is byte-identical** (`git diff` empty),
there is no `.env`, and nothing was committed, staged, `git add`ed or `git checkout --`'d.
⚠ `SPEC.md` shows as modified because the PARENT edited it before this loop began; this phase did
not touch it.

---

## 8. For the parent — the spec wordings this phase may not write

### 8.1 `SPEC.md:1196` — §6.2's GPU-card bullet (12b-A12)

It sits ABOVE the `⚠⚠ THE JOIN IS INVERTED` marker at `:1217`, so the marker does not cover it, and
a reader taking the bullets at face value reads the retired rule as current. Replace

> …utilisation, SM clock, and the model currently served on that card (**joined from the serving
> data by instance index**).

with

> …utilisation, SM clock, and the model currently served on that card — **found by asking which
> `serving[]` instance lists this card in its own `gpus` (§3.4), never by matching the card's index
> against the instance number; see the inverted-join ruling below, whose fallback is the only case
> in which the index is still read.**

### 8.2 §7.1's two owed sentences, still owed (carried from `12b-test.md` §10.2)

- **`SPEC.md:124`**, §2.2's mount table, still says the socket is for `ActiveState` alone:
  > | systemd unit state | `-v /run/dbus/…:ro` | Query `ActiveState` **and `Service.Environment`** over D-Bus — §3.4's `gpus` is read on the same connection and the same object path. Read-only and unprivileged — no `systemctl` shelling out, no root |
- **`SPEC.md:405`**, §3.4's `gpus` row, still does not name where the value comes from:
  > | `gpus` | ⚠ **NEW 2026-09-15** — the unit's own `CUDA_VISIBLE_DEVICES`, read from
  > **`org.freedesktop.systemd1.Service`'s `Environment` property over the §2.2 socket** and parsed
  > to indices: `%i` → `[N]`, the split unit → `[0, 1]`. `readonly number[] \| null` | none |

Both are statements of fact about code that exists and is tested; neither is a ruling.

---

## 9. §7.9 — what a non-integer instance identity costs, surveyed independently

**Not fixed, as instructed.** `serving-mode.sh` writes `/etc/llama-server/split.env` and the unit
`llama-split.service`; discovery rejects the first and would never build the second. The
adversarial's six sites (12b-A14) are all real; the survey below found **seven layers, of which
exactly two are free**, and two design decisions the ruling cannot avoid.

| layer | sites | cost |
|---|---|---|
| **The type** | `lib/types.ts:536` `ServingInstance.instance: number`; `:755` `TelemetryError.instance?: number`; `lib/collectors/errors.ts:47` `tag(…, instance?: number)`; four `Equals<…, number>` assertions in `lib/types.test-d.ts` (`:239`, `:254`, `:404`, `:470`) | mechanical — three declarations and ~20 inferred sites |
| **The wire** | `lib/client/wire.ts:487` `integer(field(value,'instance'))`, `:495` the refusal, `:571` `optionalInteger` for `errors[].instance`, and `:225` `integer` itself — **shared with `Gpu.index`, which must stay numeric** | ⚠ **a hard fail, not a degradation**: one `"instance": "split"` refuses the WHOLE snapshot, so a split-mode server going live before the client is redeployed blanks the dashboard. No previous contract change has had a deploy-ordering constraint |
| **The unit name** | `lib/units.ts:30` `servingUnitName = (i) => \`llama-server@${i}.service\`` and its 8 consumers (`serving.ts:326/332/337/375/384`, `observations.ts:592`, `serving-panel.tsx:104`, `dbus.ts:605`) | ⚠ **`servingUnitName` stops being a template and becomes a MAPPING.** `serving-mode.sh` writes `llama-split.service`, not `llama-server@split.service`, so §6.4's join key is simply false for the new identity — and every consequence of a wrong unit name is silent: `unitState: null`, `gpus: null`, an em dash on both GPU cards, and a `dbus` entry every poll naming a unit that was never there |
| **Discovery** | `lib/collectors/llama.ts:44` `parseInstanceIndex`, `:61` `discoverInstances`, `:73` `sort((a,b) => a-b)`, `serving.ts:162` re-deriving the filename from the identity | ⚠ **the numeric sort has no string equivalent that keeps `0,1,2,10` ascending**, and the order is load-bearing: `serving[]`'s order is what `servedBy` means by *"the first claimant wins"*. And `parseInstanceIndex`'s canonicality check exists to guarantee filename↔condition-subject **injectivity** — any string rule must re-establish it explicitly (reject `@`, `:`, whitespace, empty; decide case) or `health:<x>` ids and React keys can collide and an instance silently vanishes from the header count |
| **The condition ledger** | `lib/conditions.ts:157` `ConditionId = kind \| \`${kind}:${string}\`` | **free** — already string-keyed, and `observations.ts:603` / `serving-panel.tsx:105` already `String()` the subject. `health:split` costs nothing but a spec amendment (`SPEC.md:1507` says *"instance index — `health:0`"*) |
| **Rendering** | `serving-panel.tsx:88` (`error.instance === instance.instance`), `:111` `key={instance.instance}`, `:112` `llama-server@${…}` as the row LABEL, `observations.ts:604` the same string as the event-log label, `gpu-panel.tsx:161`, `api.probe.ts:135` | works with strings; the cost is that four operator-facing strings would NAME A UNIT THAT DOES NOT EXIST |
| **The event log** | — | **free.** `lib/client/events.ts` never touches `instance`; it consumes `ConditionId`, `label` and `conditionSource`, all `string` |

⚠⚠ **One site the adversarial did not name, and it is worse than the six that it did.**
`components/panels/gpu-panel.tsx:153` builds its label from the CARD's own index:

```ts
k: `served by instance ${String(index)}`,   // `index` is 0 | 1, derived from panelId
```

That is the `indexed` branch, and it does not consult `serving[]` at all — `servedBy` may have
returned `instance: null` and the card still prints *served by instance 0*. So on a split-mode box
whose single instance does NOT publish `gpus` (an older server, or the read failed), **both cards
name instances that do not exist**. It is invisible to any change of `ServingInstance.instance`'s
type: it will keep compiling and keep saying it. This is also the mechanism under 12b-A10
(`serving: []` naming instance 0 and instance 1) — same line, different input.

**The cheapest path that avoids all of the above** is to keep the wire identity numeric and give the
split process a reserved index — which trades a correctness problem for a naming lie in the four
rendering sites above. It is a ruling either way, which is why this phase did not make it.

**Test cost**, one line as instructed: about a dozen files carry instance fixtures or assertions
that would need new cases rather than edits, and one of them **inverts** — `lib/collectors/samples.ts`'s
`LLAMA_SERVER_ENTRIES_NOISY` asserts that `default.env` (the exact shape of `split.env`) is rejected.

---

## 10. What this phase could NOT verify, and why

- **Nothing was run against the box.** No D-Bus connection was opened, nothing was written, nothing
  was deployed. Every D-Bus measurement here is against captured frames (`samples.ts`) or the
  scripted bus in `dbus.test.ts`.
- **12b-A4's reachability is still unestablished** — whether `dbus-daemon`'s default system policy
  lets a foreign peer deliver a `METHOD_CALL` or a directed `SIGNAL` carrying our `REPLY_SERIAL`.
  The client-side gap is measured and closed; the delivery path would need traffic on the live box.
- **12b-A1's and 12b-A2's severity still rests on a peer that lies**, and the peer is `systemd`.
  What 12b-A1 needs is one corrupted byte, not a hostile peer, which is why it was treated as the
  governing finding rather than as a threat model.
- **The `av` recursion depth inside the catch handler** was not explored, as in the adversarial.
- **`scripts/api.probe.ts` was not RUN** — it needs the live box. Its edit is text-only and was
  typechecked, not executed.
- **The container, the unit and a real GPU** remain unexercised, as they have been since step 11:
  there is no Docker and no systemd on this Mac. The box-side list in `HANDOVER.md` §0.0 is
  unchanged by this loop.

---

## 11. Files this phase changed

| file | what |
|---|---|
| `lib/collectors/dbus-wire.ts` | ⚠⚠ **`Reader.region`** — the invariant, stated once; `need` bounds on the region; `Reader.array` rewritten on top of it (two checks deleted); the header field array and the body are regions; `alignmentOf` exported for its table test; `DBUS_MAX_MESSAGE_BYTES`'s doc corrected (12b-A3); `decodeMessage`'s doc records the third layer |
| `lib/collectors/dbus-wire.test.ts` | the 12b-RECONCILE describe — 8 tests including the 14-row alignment table, one ⚠ dropped with its reason — and **the corruption sweep's second arm** (every corruption with an honest copy behind it) |
| `lib/collectors/dbus.ts` | `Conversation.call` refuses a non-reply carrying our `REPLY_SERIAL` (12b-A4) |
| `lib/collectors/dbus.test.ts` | two fake-bus options (`replyAsSignal`, `inflatedReplyLength`) and the two end-to-end tests they script |
| `lib/client/observations.test.ts` | R1 — a row spread with `gpus: undefined` still declares |
| `lib/client/wire.test.ts` | 12b-A6 — the fixture's own bytes; R2 — a present `gpus: undefined` refuses the row |
| `components/panels/test-support.ts` | `instanceWithNoReadings` gains `gpus: null` (12b-A8) |
| `components/panels/gpu-panel.test.tsx` | the nothing-readable card claims nothing; two stale join names corrected (12b-A13) |
| `components/panel-props.ts` | the stale join name in the props doc (12b-A13) |
| `scripts/api.probe.ts` | the serving head stops asserting an arrangement; each row prints its own cards through `servedCards` (12b-A13) |
| `measurement-harness.test.ts` | two new graded terms for measurement 21 |
| `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` | `fixtureCrossPinned`, the `cross-pinned` mode, the two `Lacks` terms, **measurement 21** |
| `pipeline/steps/05-…/regressions.py` | **+6** (`12b-W26`/`W27`/`W28`/`W29`/`W30`, `12b-D16`); **seven re-aimed** (`05-D3`, `12b-W17`/`W18`/`W20`/`W23`/`W24`/`W25`) |
| `pipeline/steps/08-client-runtime/regressions.py` | +3 (`12b-OB11`, `12b-WR6`, `12b-WR7`) and a `FIXTURES_SRC` constant |
| `pipeline/steps/10-panels-assembly/regressions.py` | +3 (`12b-MH17`, `12b-MH18`, `12b-GP14`) |
| `pipeline/HANDOVER.md` | rewritten per the handoff: §0.0 (12b), 12a's demoted to §0.0.4, **§0.16** (eight rules), §8's six new rows, §1's harness totals re-derived |

**`SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are untouched by this phase**,
and `next-env.d.ts` is byte-identical. Nothing committed, nothing staged, nothing deployed.

---

## 12. Left on the box

**Nothing.** This phase did not contact `192.168.4.71` at all — no SSH, no HTTP, no D-Bus socket
opened and therefore none left open. Every frame it decoded was already in `lib/collectors/samples.ts`.
