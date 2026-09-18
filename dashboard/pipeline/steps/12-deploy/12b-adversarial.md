# 12b ADVERSARIAL — **the frame fix bounded the reads. Nothing bounds the frame.**

**Written by the adversarial phase, 2026-09-17.** Branch `dashboard-frontend`, working dir
`dashboard/`. Nothing committed, nothing deployed, **nothing written to the box and no D-Bus
connection opened** — this phase did not touch `192.168.4.71` at all. `git status` matches what was
inherited plus this file.

**The one-line answer:** the test phase fixed *where* the readers may read — both are built on
`frame = bytes.subarray(0, byteLength)` — and I could not break that: **10,680 differential decodes
say nothing reads outside the frame.** But `byteLength` is a number the peer supplied and nothing
ever checks the message's own contents account for it. **One corrupted byte at offset 4 of the real
captured `GetUnit` reply returns a perfectly well-formed message — right serial, right object path
— with `byteLength` 191 instead of 96**, and `Conversation.message()` then discards 95 bytes of the
next message. Measured end to end: identical bytes, one inflated length field, and the result is
`unitState: null` with *"timed out after 300 ms"* about a bus that answered in 2 ms. That is
verbatim the failure `DbusDecode`'s two kinds, `DBUS_MAX_MESSAGE_BYTES` and the test phase's own
Finding 1 all exist to prevent, and it survived all three. A second boundary is missing one level
down: a header field's value is bounded by the frame but **not** by the field array that declared
it, so `errorName` decodes out of the body's bytes and the message still returns `kind: 'message'`.

Separately: **five one-line reverts keep `vitest run` completely green** — 3634/3634 and no type
errors — three of them inside the codec the test phase had just fuzzed exhaustively.

---

## 1. Findings

### ⚠⚠ 12b-A1 — `byteLength` is trusted, never reconciled: a message can eat the next one

**Severity: high. Measured**, three ways.

`decodeMessage` (`lib/collectors/dbus-wire.ts:584-615`) computes `byteLength` from the peer's own
`bodyLength`/`fieldsLength`, waits until the buffer holds that many bytes, cuts `frame` to exactly
that, reads the fields and the body — and **never checks that the values it read account for the
bytes it was told about**. `Reader.array` enforces precisely this invariant for an array
(`dbus-wire.ts:468`, *"array elements overran its declared … bytes"*); nothing enforces it for the
message.

**(a) By construction.** Two legal `METHOD_RETURN`s, the first's `bodyLength` inflated by exactly
the second's length:

```
honest msg1 = 104 bytes, msg2 = 92 bytes, stream = 196 bytes
decode 1 -> {kind:'message', signature:'s', body:['/org/…/unit/real'], byteLength:196}
bytes left for message two: 0
```

The body value is correct, the message is well formed, and message two is gone. `Conversation`
advances by `decoded.message.byteLength` (`lib/collectors/dbus.ts:376`), so the surplus is discarded
silently — no error, nothing to see.

**(b) From the real frames, with one flipped byte.** Sweeping every byte of the seven
`CAPTURED_DBUS_*` frames against twelve replacement values, 60 corruptions produce a message that
consumes bytes the frame did not hold. Examples, all `kind: 'message'` and all with correct
contents:

| corruption | decoded | real length |
|---|---|---|
| `CAPTURED_DBUS_GET_UNIT_REPLY[4] = 0x7f` | `body:['/org/freedesktop/systemd1/unit/llama_2dserver_400_2eservice']`, **`byteLength: 191`** | 96 |
| `CAPTURED_DBUS_ENVIRONMENT_REPLY[4] = 0x7f` | `body:[['CUDA_VISIBLE_DEVICES=0']]`, **`byteLength: 191`** | 112 |
| `CAPTURED_DBUS_HELLO_REPLY[4] = 0xff` | `body:[':1.102']`, **`byteLength: 335`** | 130 |

Byte 4 is the low byte of `bodyLength`. **A single-bit-class error on the wire is enough.**

**(c) End to end, through the real `Conversation`.** The bus answers `GetUnit` and, in the *same
read*, the `ActiveState` reply for the next serial — the two-messages-in-one-read shape
`CAPTURED_DBUS_HELLO_REPLY`'s own doc records as measured from this bus. Only message one's
declared length is inflated, by exactly message two's length:

| stream | result |
|---|---|
| honest lengths | `active`, **2 ms**, no errors |
| one inflated length field | **`null`**, **301 ms**, `dbus: gpu-fan-control.service: timed out after 300 ms` |

In production that is a 2 s stall, a blanked SAFETY row, and — because `collectUnitStates` `break`s
on a mid-conversation failure (`dbus.ts:700-706`) — every remaining unit `null` from one flipped
byte.

**Why the 12b work did not catch it.** The test phase asserted two properties of the corruption
sweep: totality, and *"never `incomplete` about a buffer that already holds every byte the message's
own header declared"*. Both hold here. The property it did not assert is the one `Reader.array`
already states for arrays: **the cursor must land exactly on the declared end.** The fix chose the
frame's boundary correctly and then took the frame itself on trust.

⚠ Note the asymmetry this creates: the `catch` now converts `Incomplete` to `malformed` on the
argument *"the only way `need` can fail from here is a length field INSIDE a fully-received message
pointing past that message's own end"*. That argument is sound only for lengths pointing **past**
the frame. A length pointing **short** of it is the same lie in the other direction and is not
detected at all.

---

### ⚠⚠ 12b-A2 — the second place that reads outside the region that declared it

**Severity: medium-high. Measured.** The handoff asked whether anything still reads outside `frame`.
Nothing does (§2). But the header-field reader reads outside the **header field array**, which is
the boundary that actually applies to it.

`dbus-wire.ts:595-608` builds the field reader on `frame` and loops `while (reader.pos < fieldsEnd)`
where `fieldsEnd = DBUS_HEADER_BYTES + fieldsLength` — yet `Reader.need` bounds on the *frame*, not
on `fieldsEnd`. A field whose value overruns the field array reads straight into the body, the loop
then exits because the cursor is past `fieldsEnd`, and the decode returns a message.

Measured with an `ERROR_NAME` field whose declared string length is a lie and an honest
`fieldsLength` of 28:

| `errorName` declared length | decoded |
|---|---|
| 3 (honest) | `errorName: "x.y"`, `body: ["BODY-SECRET-VALUE"]` |
| 16 | `errorName: "x.y\0\0\0\0\0\0\0\0BODY"` — **the body's own uint32 length prefix and its first four characters** |
| 24 | `errorName: "x.y\0\0\0\0\0\0\0\0BODY-SECRET-"` |
| 30 (past the frame) | `malformed` |

All of the non-30 rows return `kind: 'message'`. `errorName` is compared against
`NO_SUCH_UNIT_ERROR` (`dbus.ts:599`) and interpolated into `errors[]` strings that render on the
SAFETY and SERVING panels, so body bytes — which for `Environment` are the unit's environment
strings — reach a screen inside an error sentence. The same route reaches `signature`, which then
decides how the body is parsed.

This is Finding 2's exact shape one level down: the fix moved the boundary from *the whole buffer*
to *the message*, and the field array's own boundary was never applied.

---

### ⚠ 12b-A3 — sixteen bytes of rubbish still cost the whole budget, and the constant's doc says otherwise

**Severity: medium. Measured end to end.**

`DBUS_MAX_MESSAGE_BYTES`'s doc (`dbus-wire.ts`, the constant's comment) says: *"**Without it,
sixteen bytes of rubbish cost the whole budget.**"* The ceiling is checked with `>`
(`dbus-wire.ts:578`), and the completeness test below it (`:584`) answers `incomplete` for anything
at or under it. So the failure is not closed — only its threshold moved, from 4 GiB to 128 MiB:

| bus answers, after `BEGIN` | result |
|---|---|
| 16 bytes declaring `byteLength === 2**27` (the ceiling exactly) | **`timed out after 300 ms`**, `unitState: null` — **303 ms** |
| 16 bytes declaring `byteLength === 2**27 + 1` | `malformed`, *"above D-Bus's 134217728"* — **7 ms** |

One byte apart, 43× the cost. Every declared length from 17 bytes to 134,217,728 is still waited
for. This is not a bug in the ceiling — a stream decoder genuinely cannot tell an inflated length
from a large message *until the bytes arrive* — but the doc's claim is stronger than the code, and
it is the same failure class as the `need()` sentence the test phase corrected: a written claim
standing in for a measurement. A cheap partial check exists and is not made (a `signature` of `''`
with a non-zero `bodyLength` is a self-contradiction the header alone proves).

---

### ⚠ 12b-A4 — nothing checks the message TYPE of a reply; a signal is accepted as one

**Severity: medium. Measured end to end** (attack requires a peer that can address us, see the
caveat).

`Conversation.call` (`dbus.ts:422-425`) returns the first message whose `replySerial` matches. It
checks the serial and **nothing else** — not the type, not the sender. `collectUnitStates` then
tests only `found.type === DBUS_MESSAGE_TYPE.error` (`:597`), so anything that is not an ERROR is
treated as a method return:

| the bus sends, carrying our `REPLY_SERIAL` | `collectUnitStates` reports |
|---|---|
| `SIGNAL` (type 4) with an object path, then a variant `"active"` | **`active`**, `errors: []` |
| `METHOD_CALL` (type 1) with the same shape | **`failed`**, `errors: []` |

A fabricated unit state on the SAFETY panel, with no entry anywhere. The doc immediately above
`call` reasons explicitly about signals (*"the bus sends a `NameAcquired` signal … a client that
took 'the next message' as its answer would be wrong from then on"*) and then guards only the
serial. `REPLY_SERIAL` on a `METHOD_CALL` or `SIGNAL` is not legal D-Bus, and whether
`dbus-daemon`'s default system policy would let a foreign peer deliver one to us is **not
established** — that part is reasoned, not run. The client-side gap is measured.

---

### ⚠⚠ 12b-A5 — five one-line reverts of the 12b diff that keep everything green

**Severity: this is the coverage figure, not a defect. Measured** — each applied to a pristine copy,
full `npx vitest run` (which also typechecks), then byte-restored; the tree's `git diff` hash is
unchanged from baseline.

| id | file:line | the revert | result |
|---|---|---|---|
| **R1** | `lib/client/observations.ts:417` | `Object.hasOwn(instance, 'gpus')` → `instance.gpus !== undefined` | **3634/3634 green** |
| **R2** | `lib/client/wire.ts:284` | `if (!Object.hasOwn(source, key)) return ABSENT;` → `if (source[key] === undefined) return ABSENT;` | **3634/3634 green** |
| **R33** | `lib/collectors/dbus-wire.ts:484-485` | `alignmentOf`'s `case 'v': return 1;` → `return 4;` | **3634/3634 green** |
| **R40** | `lib/collectors/dbus-wire.ts:353` | `Reader.signature`'s `this.need(length + 1)` → `this.need(length)` | **3634/3634 green** |
| **R41** | `lib/collectors/dbus-wire.ts:345` | `Reader.string`'s `this.need(length + 1)` → `this.need(length)` | **3634/3634 green** |

What each one costs:

- **R1 and R2 are the same protection, written twice, and neither copy is tested.** Both docs argue
  it at length — *"the two differ the moment anything in this project spreads a row
  (`{ ...instance, gpus: undefined }` is a present key)"* — and `lib/collectors/serving.test.ts:400`
  does exactly that spread, in a different assertion. R1 is the one that matters: with it applied, a
  row spread with `gpus: undefined` stops declaring, and `servedBy` silently re-enables the index
  join for that snapshot. The `hasOwn` discipline for `errors[].instance` *is* pinned
  (`lib/contract.test.ts:293,300`, `serving.test.ts:918-933`); the `gpus` one is not.
- **R33 is a wire bug the widening introduced and nobody measured.** The D-Bus specification makes
  `VARIANT` 1-aligned. `alignmentOf` is new in 12b and is reached only from `Reader.array`, so this
  is the padding rule for `av` — the exact form the test phase pinned as *"where the widening really
  stops"*. The `av` test's frame happens to start 4-aligned, so the alignment claim is asserted
  nowhere. Unreachable from `Environment` today (`v` wrapping `as`, not `av`), which is why it is
  listed here rather than higher.
- **R40/R41 are not 12b-authored lines, but they are the exact two sites Finding 1's corrected doc
  names** as now covered (*"`Reader.string()`'s four-billion-byte length and `Reader.signature()`'s
  255-byte one"*). The `+ 1` is what verifies the NUL terminator is inside the frame; without it a
  final string or signature that runs to the last byte with no terminator is accepted and the cursor
  ends one past the frame. The exhaustive corruption sweep cannot reach this: **every truncation it
  builds is shorter than `byteLength`, so it returns `incomplete` before the reader is ever
  entered.** That is worth recording on its own — the sweep's truncation arm tests
  `decodeMessage`'s prologue, not `Reader`.

Reverts that **were** caught, for contrast (all measured, same method): `servedItem`'s `unserved`
→ em dash (3 red); `servedCards`'s `undefined` → `== null` (3 red); `servedBy`'s
`find(s => s.instance === index)` → `serving[index]` (1 red); `wantsEnvironment`'s
`units.includes` filter (1 red); the `fieldsLength` ceiling (1 red); the `DBUS_MAX_ARRAY_BYTES`
ceiling (1 red); `if (reader.pos >= fieldsEnd) break;` removed (3 red); `wire.ts`'s
`gpus === ABSENT ? row : …` → a present `undefined` key (4 red); `serving.ts`'s
`gpus: gpusFor(instance)` → `[instance]` (6 red); dropping `instance` from `gpuProblems`' `tag`
(1 red); and `servingCrossPinned` flipped back to per-GPU (2 red).

⚠ One candidate is an **equivalent rewrite, not a coverage gap**, and is recorded so nobody adds a
mutation for it: `dbus-wire.ts:468`'s `if (this.pos !== end)` → `if (this.pos > end)` is green
because the `while (this.pos < end)` loop above it makes `pos < end` unreachable on exit. The
array's *underrun* case does not exist; only *overrun* does, which is what the message says.

---

### ⚠ 12b-A6 — the frozen fixture's authenticity is asserted nowhere

**Severity: medium. Measured** (grep + reading the guard).

The test phase's answer to *"can the suite still edit `LIVE_BOX_SERVING_WIRE`?"* — it is a
template-literal `string`, so no test can mutate it at runtime — is correct and holds. The question
it does not answer is whether the suite can still **edit it in the file** and stay green.

Its whole claim to being *captured* rather than *written* is one number. `lib/fixtures.ts:271` says
so in as many words: *"that is why the context is 163840 … those are the box's values on the day,
not this repo's older 131072 fixtures."* `163840` occurs in exactly three places in the tree
(`lib/fixtures.ts:271`, `:294`, `:302`) — **the doc comment and the fixture itself. No test asserts
it.**

And the self-guard is narrower than it reads. `lib/client/wire.test.ts:445` asserts
`Object.keys(row).sort()` on the **parsed** row — an object `servingInstanceOf` constructs itself
(`wire.ts:508`) — so it constrains `gpus` and nothing else. Regenerate the fixture from a dev box
(`ctx: 131072`), change the model, change the ports, or add an unknown seventh key, and all 3634
tests still pass. The one asset in the tree whose value is that it is *evidence* has no assertion
protecting the evidence.

---

### ⚠ 12b-A7 — the cross-pinned default does not reach the browser harness

**Severity: medium. Reasoned from the source; the browser harness was NOT run** (it is a harness and
this phase ran none).

The cross-pinned fixture is the default subject of both SHAPE 1 tests in jsdom. The browser
measurements keep the coincidence: `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs:706`

```js
return { ...box, serving: box.serving.map((i) => ({ ...i, gpus: [i.instance] })) };
```

and measurement 19's expectations (`:2425-2427`) are `gpu0: 'served by instance 0'`,
`gpu1: 'served by instance 1'`, `serving: ':8080 · GPU 0'`. Naming the card from `gpus`, from
`instance.instance`, or from the row's position in `serving[]` all render that identical page —
which is precisely the condition `lib/fixtures.ts:322-334` says made `12b-SP3`/`SP4`/`SP5` inert.
Measurement 20 (split) has GPU 1 named by instance 0 and does discriminate, so the gap is
measurement 19's alone. The defence for leaving it — *"it is a pixel record of the page the box
becomes"* — is sound for the pixels and does not extend to the three text expectations built on it.

---

### ⚠ 12b-A8 — two copies of one fixture idea, and only one got 12b's `gpus: null`

**Severity: medium. Measured** (read, plus `servedBy` evaluated on the shape).

`lib/fixtures.ts:401-412`'s `servingIdentityOnly` gained `gpus: null` in 12b, with a ⚠ comment
saying absent and `null` must not be collapsed. Its twin,
`components/panels/test-support.ts:125-133`'s `instanceWithNoReadings`, did not:

```ts
const instanceWithNoReadings = (instance: number): ServingInstance => ({
  instance, port: null, unitState: null, model: null, ctx: null, health: null,
});
```

So `allReadingsNull` (`test-support.ts:183-188`) — the panel suite's *"current server, nothing
readable"* snapshot — is an **older-server** snapshot, and every panel test built on it renders
`servedBy`'s `indexed` fallback. `components/panels/gpu-panel.test.tsx:597`
(*"⚠ with every reading null, no value cell prints a numeral"*) therefore renders
`served by instance 0` — a positive claim about who serves the card — under a name asserting nothing
is readable. With `gpus: null` it would be `served by —`, the `unknown` branch 12b added. The
assertion it makes is about value cells and is not violated; the coverage is what is lost.

---

### ⚠ 12b-A9 — `unserved` is a definite verdict minted from an absent key

**Severity: medium. Measured; and it is a RULED decision, which is why it is here rather than
filed as a bug.**

`servedBy` decides the fallback per snapshot (`observations.ts:445`), so on a mixed snapshot — some
rows carrying `gpus`, some not — the rows without the key claim nothing, and their cards render
**`served by no instance`**:

```
MIXED: inst0 gpus:[0], inst1 key ABSENT   GPU0: declared "served by instance 0"   GPU1: unserved "served by no instance"
```

`lib/client/observations.test.ts:640` pins exactly this and argues it: per-row would let one
unreadable unit re-enable the index join. **Both horns are wrong, and there is a third.** §6.5:
*"a verdict of failure … may be minted only from an answer."* `unserved` is a verdict, and here it
is minted from a **missing key** — the dashboard states on screen that nothing serves GPU 1, about a
row that never said. The third option the build did not consider: keep the snapshot-level decision,
and let a non-declaring row make the answer **`unknown`** (an em dash) rather than `unserved`. That
neither re-enables the index join nor prints a false claim.

`wire.ts` decides per row (`:510`), so a mixed body is representable and validates; only
`collectServing`'s own discipline keeps it from happening, and that discipline is not expressible in
the type.

---

### ⚠ 12b-A10 — `serving: []` names instances the snapshot says do not exist

**Severity: low-medium. Measured.**

```
serving: []    GPU0: indexed "served by instance 0"    GPU1: indexed "served by instance 1"
```

`!serving.some(declaresGpus)` is **vacuously true** for an empty array, so an empty serving list
takes the older-server path. `lib/client/observations.test.ts:682` pins it with the reasoning *"No
instance carries the key because there is no instance, so this is the older-server path by
construction"* — which is a category error. An empty `serving[]` is not silence about instances; it
is the statement that `/etc/llama-server/` was listed and holds none. §6.5's own rule (*"absent from
a collection that was read … the subject has left, and that is an answer"*) makes `unserved` the
right answer, not a claim naming `instance 0` and `instance 1`.

It is byte-identical to what `f6f3101` renders, so it is inherited rather than introduced — but the
whole premise of 12b is that the index join is a coincidence, and this is the one input where the
coincidence is kept with no older server to justify it.

---

### ⚠ 12b-A11 — `gpus` shapes the collector cannot make, which the wire accepts and the panel renders

**Severity: low. Measured.** `optionalCardList`/`cardIndex` (`wire.ts:280-288`) enforce
non-negative integers and nothing else. `parseVisibleDevices` sorts, de-duplicates and reports a
repeat (`llama.ts:241-244`, well tested) — so these cannot come from `collectServing`, only from the
wire, which is the trust boundary the file's doc argues about at length:

| `gpus` | GPU 0 renders | GPU 1 renders |
|---|---|---|
| `[0,1,1]` on one instance | `served jointly with **GPUs 1, 1**` | `served jointly with GPU 0` |
| `[0,0]` on one instance | `served by instance 0` — indistinguishable from `[0]` | `served by no instance` |
| `[5]` on both instances | `served by no instance` | `served by no instance` |
| `[0]` on **both** instances (§7.8) | `served by instance 0` | **`served by no instance`** |

The last row is §7.8 made concrete, and it is worse than "silent": two processes sharing card 0 — an
OOM waiting to happen, which the build called out — renders as *GPU 1 is served by nobody*, a wrong
statement rather than a missing one. `[5]` naming a card that does not exist is reported nowhere at
all; the SERVING row says `GPU 5` and both real cards say `no instance`.

---

### ⚠ 12b-A12 — §6.2's own GPU-card bullet still states the retired rule as the rule

**Severity: low (documentation), but it is the spec. Cannot be edited by this phase.**

`SPEC.md:1196`: *"the model currently served on that card (**joined from the serving data by
instance index**)."* It sits **above** the `⚠⚠ THE JOIN IS INVERTED … kept for its reasoning rather
than its rule` marker at `SPEC.md:1217`, so the marker does not cover it, and it contradicts §3.4
(`:405-424`) and §6.2's own inversion paragraph (`:1224-1231`). A reader taking §6.2's bullets at
face value reads the retired rule as current. **Parent's call; flagged because §7.1 already owes two
sentences in the same file.**

---

### 12b-A13 — stale names elsewhere that teach the retired rule

**Severity: low. Measured by reading.**

| file:line | text |
|---|---|
| `components/panel-props.ts:22` | ``the GPU↔instance join (`gpu.index === serving.instance`)`` |
| `components/panels/gpu-panel.test.tsx:29` | ``the served-model row is joined by `gpu.index === serving.instance``` |
| `components/panels/gpu-panel.test.tsx:240` | `describe('⚠ the GPU↔instance join is gpu.index === serving.instance', …)` — **the tests inside are correct** (they use `servingInstances`, which carries no `gpus`, so they legitimately exercise §3.4's fallback); the title names the rule that was retired |
| `scripts/api.probe.ts:132-139` | `head('serving', 'one instance per GPU · /health + /v1/models')` — a hard-coded claim about the arrangement, and the probe prints neither `i.gpus` on the serving rows nor a served model on the GPU blocks, so on a split or cross-pinned box it shows nothing about who serves what |

---

### 12b-A14 — §7.9: what a non-integer instance identity would cost, enumerated

**Not fixed, as instructed. Reasoned from the source.** The handoff asked what else breaks if the
parent rules either way. Everything that carries an instance identity today assumes a **bare
non-negative integer**, in six places:

| site | form |
|---|---|
| `lib/types.ts` — `ServingInstance.instance`, `TelemetryError.instance` | `number` |
| `lib/client/wire.ts` — `integer(field(value,'instance'))`, `optionalInteger` | refuses anything else, refusing the whole row |
| `lib/units.ts:30` — `servingUnitName` | `llama-server@${instance}.service`; `llama-split.service` is not of this form |
| §6.4 condition ids — `observations.ts:592-608`, `serving-panel.tsx:104-105` | `unit:llama-server@<i>.service` and `health:<i>` |
| `collectUnitStates`'s `unitInstances` map and `environmentUnits` | keyed by the unit name built from the integer |
| `discoverInstances` / `parseInstanceIndex` | numeric sort, canonical decimal stem |

So admitting `split.env` is not a discovery change: it needs an `instance` identity that
`llama-server@<i>.service` and `health:<i>` can both carry, or both forms change. **Nothing else in
the tree keys a GPU card to an instance by number** — see §2.

**Minor, recorded rather than argued:** `Conversation`'s buffer grows without a cap and `pull()`
re-copies it on every chunk (`dbus.ts:343-349`), so a chatty peer costs O(n²) within the 2 s budget;
and `call`'s skip loop (`:422-425`) is bounded only by the deadline, so a peer streaming
non-matching messages holds the conversation open for its full budget. Both are bounded by the
deadline, which is why they are down here.

---

## 2. What held

- **⚠⚠ Nothing reads outside `frame`. The handoff's central question, answered by measurement.**
  A differential sweep: every byte of each of the seven `CAPTURED_DBUS_*` frames replaced by each of
  `0x00 0x01 0x02 0x04 0x08 0x10 0x7f 0xff 0x61 0x73 0x76 0x67`, each corrupted frame decoded alone
  and again with 96 trailing bytes appended, results compared. **10,680 comparisons where the
  declared message fitted the frame; ZERO divergences.** (The 60 that were excluded are A1's class —
  the corruption inflated a declared length and the padding supplied the bytes; those are reported
  as 12b-A1, and they are not out-of-frame reads.) The frame construction is correct and complete
  for reads; what it does not do is verify the frame.
- **Both of the test phase's codec fixes bite**, checked by reverting them independently: the
  whole-buffer field reader and the body reader are both caught, and so are the `fieldsLength` and
  `DBUS_MAX_ARRAY_BYTES` ceilings and the `pos >= fieldsEnd` break.
- **`parseVisibleDevices` is solid.** Sorted, de-duplicated, repeats reported, partial lists refused
  whole, UUID/MIG forms refused, `01`/`+1`/`-1`/`0.5`/`0,,1` refused, `[]` kept distinct from `null`,
  last assignment wins, a key that merely contains the name rejected — every one of those has its
  own test and `gpus: [instance]` in `collectServing` is caught by six.
- **`LIVE_BOX_SERVING_WIRE` cannot be mutated by the suite at runtime** — it is a `string`, every
  use is a fresh `JSON.parse`, no parsed object is shared. (What it *can* be is edited in the file:
  12b-A6.)
- **§6.4's condition ids are clean on a cross-pinned box.** There is no GPU-side condition carrying
  an instance and no serving-side condition carrying a card, so the two identities never meet in an
  id.
- **`servedBy` is the only join, and both panels go through it.** The one remaining
  `s.instance === index` (`observations.ts:446`) is §3.4's licensed fallback, reachable only when no
  row declares.
- **The invariant-1 compromise is genuinely pinned** (`observations.test.ts:656`) — `errorsForPanel`
  fans `dbus` to `['cooling','serving','safety']` and the test asserts both halves, so widening it
  becomes a visible test change.
- **The tree is unchanged.** `git diff | shasum` is byte-identical to the baseline taken at the
  start (`8a75f853…`), `git status --porcelain` matches the inherited list exactly, and every revert
  experiment restored from a pristine copy verified by SHA-256. Nothing was committed, staged,
  checked out or deployed. **The box was not touched and no D-Bus connection was opened.**

---

## 3. What I could not verify, and why

- **The three mutation harnesses and `measure-breakpoints.mjs` were not run.** The rules forbid two
  harnesses at once and I judged the budget better spent on the codec; 12b-A7 is therefore read from
  the source rather than measured in a browser, and I make no claim about whether the ledger's ⚠
  marks still all redden after nothing changed (they should — nothing changed).
- **`pnpm verify` was not re-run at the end**; `npx vitest run` (which reports `Type Errors no
  errors`) was run 15 times, the first as a baseline — **exit 0, 108 files, 3634 tests** — and the
  last restoration was confirmed by diff hash rather than by another run.
- **12b-A4's reachability on a real system bus is not established.** Whether `dbus-daemon`'s default
  system policy permits an unprivileged peer to deliver a `METHOD_CALL` or directed `SIGNAL` to this
  client's unique name, carrying a `REPLY_SERIAL`, was not tested — that would need traffic on the
  live box, which this phase would not do. The client-side absence of any type check is measured;
  the delivery path is not.
- **12b-A1's and 12b-A2's severity depends on a peer that lies**, and the peer is `systemd`. I claim
  no more than the test phase did for its own Findings 1 and 2, which rest on exactly the same
  assumption — and 12b-A1 needs only one corrupted byte, not a hostile peer.
- **I did not attempt to bound the `av` recursion depth beyond what the test phase measured.** Its
  result (20,000 deep → `RangeError`, caught, returned as `malformed`) reproduces the behaviour; I
  did not look for a depth that overflows the stack *inside the catch handler*, which is the only
  way that path could still throw.
- **No fix was attempted for anything above.** Every revert experiment was restored byte-for-byte
  and verified.

---

## 4. For the parent, shortest path first

1. **12b-A1 is the one to fix**: after the body loop, assert the readers consumed the frame —
   `bodyReader.pos` against `bodyStart + bodyLength`, and the field loop's cursor against
   `fieldsEnd` (which also closes 12b-A2). It is the rule `Reader.array:468` already applies to
   arrays, applied to the message.
2. **12b-A5's R1/R2** are one assertion each, and the protection is already argued in both docs.
3. **12b-A6** is one line in `wire.test.ts`: assert the fixture's own `ctx` is `163840`, so the
   evidence cannot be regenerated away silently.
4. **12b-A9 / 12b-A10** are rulings, not bugs — but both currently print a **claim** where §6.5
   would print a gap, and both are pinned by tests that would have to change with them.
5. **12b-A12** is a spec edit this phase may not make.
