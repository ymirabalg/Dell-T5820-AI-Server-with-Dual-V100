# 12b TEST — **the widening was sound; the codec around it was not, on the one path the build did not touch.**

**Written by the test phase, 2026-09-17.** Branch `dashboard-frontend`, working dir `dashboard/`.
Nothing committed, nothing deployed, nothing written to the box.

**The one-line answer:** the array reader survives everything thrown at it — 1,545 decodes of
deliberately corrupted frames, every container form, every overflowing length, nesting past the
stack — but the *rule it was given* (`decodeMessage` has already proved the message is present, so
a length pointing past it is a lie and never "read more") was **not applied to the string, the
signature or the alignment beside it**, and the module doc claimed it was. That is fixed, with a
mutation in each direction. The coincidence sweep found the shape in two more places and both
now default to a fixture where the instance number and the card number disagree. And the absent
case is byte-identical to today's render — measured against `f6f3101`'s own components, not
against the new code's other branch.

---

## 1. ⚠⚠ Priority one — the D-Bus codec, fuzzed

### 1.1 The instrument

A differential/exhaustive probe, not a sampler: every byte of each of the three captured
`Environment` frames replaced by each of `0x00 0x01 0x7f 0xff 0x61` (the last is `a`, D-Bus's
array character), plus every truncation of each, plus 40 hand-built frames covering the shapes the
handoff named. **Deterministic — no entropy, no clock.** It lives in `dbus-wire.test.ts` as
`⚠⚠ 12b-TEST — every single-byte corruption of the captured `Environment` frame`, and it asserts
two properties, one of which is not about the array at all:

1. `decodeMessage` is **total** — it never throws, whatever the bytes say;
2. it never answers **`incomplete`** about a buffer that already holds every byte the message's own
   header declared. The test **recomputes the declared length itself** from the corrupted bytes
   rather than trusting the decoder's own arithmetic.

### 1.2 ⚠⚠ FINDING 1 — `incomplete` was returned for a message that was entirely present

**Measured before the fix.** A 46-byte `METHOD_RETURN` whose body `STRING` declares 4096 bytes:

| frame | before | after |
|---|---|---|
| body `s`, length 4096 in a 6-byte body | **`incomplete`** | `malformed` |
| body `s`, length `0xFFFFFFFF` | **`incomplete`** | `malformed` |
| body `g`, length 200 in a 3-byte body | **`incomplete`** | `malformed` |
| body `yt` — no length lies, the 8-byte ALIGNMENT runs off the end | **`incomplete`** | `malformed` |

`Conversation.message()` answers `incomplete` by pulling bytes until the deadline, so each of those
is **one `dbus` entry saying "timed out after 2 s" about a peer that answered in a millisecond** —
verbatim the failure `DBUS_MAX_MESSAGE_BYTES` was added for and verbatim the failure `Reader.array`
was given its own `past the end of the message` guard for in 12b. The array had the guard; the
string next to it did not.

⚠ **And the module doc asserted the opposite**, in as many words: *"One check here also covers the
two sites a reader would otherwise want their own guards on — `Reader.string()`'s
four-billion-byte length and `Reader.signature()`'s 255-byte one both reach `need()` only after this
function has already returned `malformed`."* It does not: the ceiling bounds the *message*, and
none of the four rows above exceeds it. That sentence is why the gap survived — it is the same
class as this box's `ufw` `is-active`, a written claim standing in for a measurement.

**The fix is one place, not four.** Every genuinely-short buffer is already answered before the
`try` (`bytes.length < DBUS_HEADER_BYTES`, then `bytes.length < byteLength`), so an `Incomplete`
raised *after* those can only mean a length field inside a fully-received message points past that
message's own end. The `catch` now converts it:

```ts
if (e instanceof Incomplete) {
  return { kind: 'malformed', problem: 'a value runs past the end of the message that declared it' };
}
```

⚠ **The other direction is intact and is tested**: every prefix of the captured `Environment` frame
is still `incomplete`, and a header declaring 4096 bytes of body with none received is still
`incomplete`. `05-W5` (collapse `incomplete` into `malformed`) still bites, red=5.

### 1.3 ⚠⚠ FINDING 2 — the header-field reader could read the NEXT message

`decodeMessage` built the **body** reader on `bytes.subarray(0, byteLength)` and the
**header-field** reader on the whole buffer. A stream buffer normally holds more than one message —
the captured `Hello` reply is two in one 262-byte read — so a field declaring more bytes than the
field array holds read on into the next message's bytes. Measured differentially against a copy of
the module with the old construction:

| corruption of message one, in a 2-message buffer | whole-buffer reader | frame reader |
|---|---|---|
| `REPLY_SERIAL`'s variant retyped `u`→`s`, its uint32 → a 20-byte string length | **`message`**, `signature: ''`, body `[]` — a well-formed reply assembled from bytes that are not message one's | `malformed` |
| body `STRING`'s length 3 → 20 | **`message`**, body = `"one"` followed by the literal bytes of message two's header | `malformed` |

Both are decoded messages a caller cannot tell from data. Both readers are now built on
`frame = bytes.subarray(0, byteLength)`. With Finding 1's conversion in place the overrun is
`malformed` rather than a silent cross-frame read.

### 1.4 Everything the handoff named, and what it does

| case | result |
|---|---|
| declared length exceeds the frame | `malformed` — *"past the end of the message"* |
| length `0`, `as` | `[]`, a value (the captured `gpu-fan-control` frame) |
| length `0`, `at` — 8-aligned element, padding **present** | `[]` |
| length `0`, `at` — padding **missing** | `malformed`. ⚠ Invisible on `as`, the only array read here: a 4-aligned element needs no padding after a 4-byte length |
| array of arrays `aas` | `malformed` — `unsupported D-Bus type \`a\`` |
| `a(ii)` / `a{sv}` / `a(` / `a{` | `malformed`, in `alignmentOf`, **before one element byte is read** |
| `a` alone, `sa` | `malformed` — *"signature ends with a bare `a`"* |
| `az` (a type that does not exist) | `malformed` |
| `z` in the body signature | `malformed` — reaches `Reader.basic`'s `default`, which is what restores `05-W4` |
| length `0xFFFFFFFF` | `malformed`, refused by `DBUS_MAX_ARRAY_BYTES` |
| length exactly `2^26` / `2^26 + 1` | end-check / ceiling — two different messages, both `malformed` |
| elements overrunning the declared length | `malformed` — *"overran"* |
| non-zero padding bytes | **accepted.** The spec requires padding to be zero; this codec does not check. Harmless (the bytes are skipped, never read as a value) and recorded here rather than changed |
| variant inside a struct inside a variant | `malformed` — structs are refused at the signature |
| **variant nested 20,000 deep** | `malformed` (`Maximum call stack size exceeded`, caught). ⚠ It does not throw, which is the requirement: a throw ends the **whole conversation** in `Conversation.message()` |

### 1.5 ⚠⚠ Where the widening really stops — the module doc is narrower than the code

`av` **decodes**, and each variant inside carries its own signature, which may be `as`. So an array
of arrays *is* reachable — through a variant — while `aas` is refused. Both are correct: `aas` must
be refused because the element type would have to be guessed and a wrong guess desynchronises the
reader; a variant states its type on the wire, so nothing is guessed. The doc says the widening is
`a` plus "ONE basic type", and `v` is a container. Pinned in a test (`⚠⚠ `av` DECODES, and an array
of arrays is therefore reachable — through a VARIANT`) so a later reader meeting `av` does not
"fix" it into a throw, and so the doc's claim is not mistaken for the code's.

### 1.6 Three mutations, each measured biting

| id | what it restores | red |
|---|---|---|
| `12b-W23` | the `Incomplete` → `incomplete` return — **the code as it shipped** | 9 |
| `12b-W24` | the header-field reader on the whole buffer — **the reader as it shipped** | 1 |
| `12b-W25` | the body reader on the whole buffer | 1 |

⚠ The doc's stale claim about `need()` is rewritten, and so is the one two paragraphs above it that
said the file "is 458 lines" (it was already longer). **A number in a comment is a claim that goes
stale in silence** — the same failure as the `need()` sentence, in a cheaper place.

---

## 2. Priority two — is `LIVE_BOX_SERVING_WIRE` honest?

**Yes, on all three questions, and one of them was checked against the box rather than reasoned.**

| question | answer |
|---|---|
| Is it really the pre-change output — six keys, no `gpus`? | Yes, and it is **self-guarding**: `wire.test.ts` asserts `Object.keys(row).sort()` is exactly the six, so a future regeneration from the current collector fails that line rather than passing quietly |
| Captured from the box, or written by hand? | **Captured.** Read-only over SSH 2026-09-17: `/etc/llama-server/0.env` says `PORT=8080`, `ALIAS=qwen3.6-27b`, **`CTX=163840`**, and `:8080/v1/models` answers `data[0].id = "qwen3.6-27b"`. A hand-written fixture would have carried this repo's own 131072 — the mismatch with every other fixture in the tree is the evidence |
| Does anything in the test path mutate it? | **It cannot.** It is a template-literal `string`, and strings are immutable; every use is a fresh `JSON.parse`, so no parsed object is shared between tests |

⚠ Also verified read-only, independently of the build's own capture and **without opening a D-Bus
connection** (`systemctl show -p Environment`, the box's own tool, on units that are already
loaded): `llama-server@0.service` → `Environment=CUDA_VISIBLE_DEVICES=0`, `@1` → `=1`,
`gpu-fan-control.service` → empty. The three captured frames say exactly that. The stray
`pid 3428860` the build left is **gone**; four services active
(`ai-dashboard`, `gpu-fan-control`, `llama-server@0`, `llama-server@1`).

---

## 3. ⚠⚠ Priority three — the coincidence, swept

The build found `⚠ SHAPE 1 of 4` on the SERVING panel inert because `12b-SP3`, `SP4` **and** `SP5`
all render `GPU 0` for instance 0, and answered it with a fourth mutation. **A mutation is the
narrow fix; the fixture is the general one.** `lib/fixtures.ts` gains:

```ts
export const servingCrossPinned = [ {…instance 0, gpus: [1]}, {…instance 1, gpus: [0]} ];
```

— instance 0 serves card **1**, instance 1 serves card **0**. It is a real state (a mis-`%i`'d
template, a hand-edited drop-in), and it is the state §6.2's complaint is about.

**It is now the DEFAULT subject of both SHAPE 1 tests, with the per-GPU arrangement asserted
second** because that is the one the box is in. Measured effect, from step 10's ledger:

| ⚠ test | reddened by, before | reddened by, now |
|---|---|---|
| SERVING `⚠ SHAPE 1 of 4` | `12b-SP6` only (added for exactly this) | **`12b-SP5`** (cards from the instance number) **and `12b-SP6`** |
| GPU card `⚠ SHAPE 1 of 4` | nothing — the mis-pinned test carried `12b-GP7` alone | **`12b-GP7`** (the label takes the card's index) |

The GPU card's version asserts both halves, because a label-only assertion would miss the other
one: card 1 names **instance 0** *and* carries instance 0's model; card 0 names instance 1, whose
unit is down, and therefore does **not** carry that model.

**Swept everywhere else, and these did not need changing:**

- `lib/client/observations.test.ts` — `⚠ a MIS-PINNED instance names the card it really serves` is
  a full sibling of the per-GPU test and is what reddens `12b-OB10` (the claimant found by instance
  number again). Verified in the ledger.
- `lib/collectors/serving.test.ts` — `⚠ the cards are read from the UNIT, not from the instance
  number` scripts `llama-server@0.service` answering `CUDA_VISIBLE_DEVICES=1`. Disagreement present.
- `components/panels/gpu-panel.test.tsx` — the pre-existing `⚠ the join is by instance NUMBER,
  never by array POSITION` uses a sparse `serving: [{instance: 1}]`, so position 0 ≠ instance 1.
  That is what reddens `10c-GP4` after its move into `observations.ts`, and it still does.
- `measure-breakpoints.mjs` measurement 19 uses `gpus: [i.instance]` — the coincidence — but it is a
  **pixel** record of the page the box becomes, and measurement 20 (split) has GPU 1 named by
  instance 0. Left alone deliberately.

---

## 4. Priority four — four shapes, both panels, and BYTE IDENTITY actually measured

### 4.1 `null` and absent are different in the DOM **and in the text**

A difference carried only by an attribute is not one a screen reader conveys, so both panels gained
a test that strips every tag and compares the remaining text — what the accessibility tree holds:

| panel | assertion |
|---|---|
| SERVING | `[0]`, `[0,1]`, `null`, absent produce **4 distinct texts**; `null` → `:8080 · —`, absent → nothing after `:8080` (scoped to the port, because the row's *value* column legitimately carries both a `·` and an em dash) |
| GPU card | `declared`, `joint`, `unknown`, `unserved` produce **4 distinct texts** — `served by instance 0 qwen3.6-27b` / `served jointly with GPU 1` / `served by —` / `served by no instance` — **and `absent` is the same text as `declared`**, which is §3.4's fallback at the level a person reads |

### 4.2 ⚠⚠ Byte-identical to today's render — against `f6f3101`, not against the new code

The build's byte-identity test compares `[N]` against absent *within the changed components*. That
is a good test of the fallback and it is **not** the claim "the absent case renders as it does
today". So that claim was measured directly: `git show f6f3101:` the two pre-change panel
components into the tree under new names, render both old and new from the same snapshot, compare.

**6 of 6 identical**, then the scratch files were deleted (`git status` below is clean of them):

| subject | result |
|---|---|
| GPU 0, GPU 1, SERVING — `servingInstances` (absent `gpus`) | byte-identical |
| GPU 0, SERVING — `serving: null` | byte-identical |
| GPU 0, GPU 1, SERVING — **`LIVE_BOX_SERVING_WIRE` through `parseSnapshot`** | byte-identical |

That is the additivity bar met against the code that is deployed, rather than against a branch of
the code that replaced it.

### 4.3 Rendered, in a browser

Measurement 19 and 20 both pass at all three viewports with their preconditions asserted first; the
`serving` slot on the redeployed page is **103.8 px**, the same as the healthy-box page, so `· GPU 0`
does not wrap. Numbers in §8.

---

## 5. Priority five — the five moved anchors, read against the properties they name

All confirmed by the harnesses (zero `ANCHOR NOT FOUND`, zero `AMBIGUOUS`, zero `DID NOT BITE`
across 691 mutations) and each read by hand:

| anchor | verdict |
|---|---|
| `05-W3` (a VARIANT decodes to its own type name) | Anchor moved to `return this.value(this.signature());`. **Same defect, and `12b-W15` shares the anchor with a different replacement** — legal, and the string is unique in the file. red=92 |
| `05-D6` / `05-D8` | Anchors gained `environments` in the returned object. The defect is unchanged in both |
| `05-V7` (`collectServing` also reads the fan service) | The anchor is `units: …\n unitInstances,`, and the new `environmentUnits: instances.map(servingUnitName),` line does **not** collide: the six-space + `units:` prefix does not occur in `environmentUnits:`, and the following line differs. The harness's ambiguity check agrees |
| `10c-GP4` | Subject genuinely moved files — the positional-lookup defect now lives in `servedBy` — and the ledger file stayed the GPU card's test, which is correct: that is where it is asserted, by the sparse-`serving` test described in §3 |
| `10h-GP1/GP2/GP3` | Re-aimed at `servedItem`'s lines. Bite |
| ⚠ `05-L2` went AMBIGUOUS | Fixed in the **production** file by naming `parseVisibleDevices`'s set `cards`, not by lengthening the anchor. Correct choice: a longer anchor would have left two functions ending in one line of code, which is the condition that produced the ambiguity |
| ⚠ `05-W4` went inert | **Restored, and verified: red=1, reddened by the new `z`-signature test and nothing else.** The coverage loss was real — the widening intercepts every container signature in `completeTypes`/`alignmentOf` before `Reader.basic`'s `default` — and `z` is the only remaining route to that branch, because it is not a D-Bus type at all |
| ⚠⚠ `12b-D9` could not bite | The fix (interface names written as literals, with one separate assertion that the constants really are those strings) is right and is the general lesson: **an expectation interpolated from the constant under test holds for every value of it** |

---

## 6. ⚠⚠ Priority six — §7.9: what discovery accepts and rejects TODAY

**Not fixed, as instructed.** Established with tests, so the ruling has facts under it.

**The mechanism.** `parseInstanceIndex(filename)` requires the name to end `.env` and its stem to
be a **bare canonical non-negative decimal integer** (`parseIntegerStrict`, then
`String(value) === stem`). `discoverInstances` ignores non-`.env` entries **silently** and reports
every `.env` whose stem fails, because it sits in the directory §3.4 says holds instances.

**What `serving-mode.sh` writes** (read from the script, 2026-09-17): `/etc/llama-server/split.env`
and the unit `llama-split.service`.

| input | discovery | pinned by |
|---|---|---|
| `0.env`, `1.env`, `7.env`, `123.env` | accepted → 0, 1, 7, 123 | table test |
| **`split.env`** | **rejected, and REPORTED** — `value` is `[0, 1]`, `problems` has exactly one entry naming `split.env` | `⚠ §7.9 — `split.env`, the file `serving-mode.sh` writes, is REJECTED and REPORTED` |
| `SPLIT.env`, `split.ENV`, `llama-split.env`, `0-split.env`, `split0.env`, `0.split.env` | all rejected | table test |
| `01.env`, `+1.env`, `-1.env`, `1.ENV`, `1env`, `1.env.bak`, `x.env`, `1 .env`, `1.0.env` | all rejected (pre-existing) | pre-existing table |

**So in real split mode the panel shows instances 0 and 1** — their env files are not deleted by a
mode switch — **both inactive, and the process actually serving the box appears nowhere**, with one
`llama-env` problem naming `split.env`. Confirmed the box is at the accepting case today:
`/etc/llama-server/` holds `0.env` and `1.env` and nothing else.

**What the ruling has to settle, stated as facts rather than as opinion:** §3.4 fixes the filename
form, and §6.4 fixes condition subjects as **bare integers** — `unit:llama-server@<i>.service` and
`health:<i>`. `llama-split.service` is neither. Any ruling that admits `split.env` has to give the
split instance an `instance` identity those two forms can carry, or change both.

⚠ **The `test.each` acceptance table is deliberately NOT ⚠-marked**, and the ledger is why: it
reported the mark inert on the first run, and the harness's own rule says the answer is to drop the
mark rather than invent a mutation for it. There is no plausible wrong implementation that reads
`split` as an integer stem; the guard is `05-L1` plus the `split.env` test above, both of which
bite. A second test that only restated the first was deleted for the same reason.

---

## 7. Priority seven — names against bodies, and the rest

- **Names against bodies, every changed file:** read. The one mismatch is recorded in §1.2 — it was
  in a *doc comment* rather than a test name, and it was load-bearing.
- **⚠ A name with an unmatchable prefix — mine.** The harness rejected
  `'⚠ the %s frame survives…'` (ledger key `⚠ the`, 5 chars) on my first run. Renamed to
  `'⚠ every one-byte corruption of the %s frame is total, and never asks to wait'`. The build's
  three `test.each` names are clean.
- **Entropy or clocks:** none in anything 12b added or I added. The corruption sweep is exhaustive
  and deterministic for exactly this reason.
- **`toContain` scope:** my four-shapes assertions are on stripped text or scoped to `:8080`; one
  draft assertion (`not.toContain('·')` over a whole panel) failed immediately because the row's
  *value* column legitimately carries a `·`, and was narrowed rather than deleted.
- **⚠ A guard whose pass condition is "nothing found", judging its own failure:** the build's
  `⚠ the joint and unknown branches carry NO title` asserted `not.toContain('title=')` on a render it
  never checked was the right render — it would pass on an empty string. It now asserts the render
  contains `served by` first, and that it contains no `undefined`.
- **⚠ Invariant 1 across panels, pinned.** `servedBy`'s new `unknown` renders an em dash on the GPU
  card whose explanation is on **SERVING** — `panelsForSource('dbus')` is
  `['cooling','serving','safety']`, which 12b deliberately left alone. The build argued it; nothing
  asserted it. A test now pins both halves (`errorsForPanel(snapshot,'gpu')` is empty,
  `…,'serving'` carries the entry), so widening the fan-out becomes a visible change to a test
  rather than a silent one. **This remains a real compromise and the build's reason for it is
  sound**: adding `'gpu'` to `dbus` would change what the live box renders today.
- **A control character in a source file:** `lib/guardrails.test.ts` caught two raw bytes I had
  pasted from probe output into a comment. Its own demonstration that it works.
- **⚠ Non-zero D-Bus padding is accepted** (§1.4). The spec requires padding to be zero. Recorded,
  not changed: the bytes are skipped rather than read as a value, so nothing is misparsed, and a
  check would be new refusal surface on the one path that reads a privileged bus.

---

## 8. The measurements

All run on the reconciled tree, serially, nothing beside a harness.

### 8.1 `pnpm verify` — **exit 0**

**108 files, 3634 tests, no type errors.** Was 108 / 3603 at the end of the build; **+31**.

### 8.2 The three harnesses — **all exit 0**

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `05-collectors-serving-storage-safety` | **161** (build: 158) | 256 red across 161; **156 ⚠ checked** | **exit 0** |
| `08-client-runtime` | **189** | 318 red across 189; **240 ⚠ checked** (build: 317 / 239) | **exit 0** |
| `10-panels-assembly` | **341** | 521 red across 341; **353 ⚠ checked** (build: 519 / 351) | **exit 0** |

**Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, zero unmatchable ledger
keys, and every ⚠ mark reddened in all three.** The three mutations this phase adds are
`12b-W23`/`W24`/`W25`, all in step 5, all `12b-`-prefixed and unique across the ten harnesses.

⚠ **The first run of step 5 returned 1 twice, and both were the harness doing its job** — once for
my unmatchable test name, once for two ⚠ tests no mutation could redden (§6). Neither was papered
over with a new mutation.

### 8.3 Browser — `measure-breakpoints.mjs` — **exit 0**

**95 passed, 0 failed, 0 blocked** — the build's figure, reproduced.

| page | 1280×1024 spare | 1600×1024 spare | 1920×1080 spare | `serving` slot | gpu card | tightest cap margin |
|---|---|---|---|---|---|---|
| 19 (redeployed) | 263 px | 228 px | 284 px | **103.8 px** | 164.5 px | 23.7 px (cpu, at 1600) |
| 20 (split) | 263 px | 228 px | 284 px | **97 / 76 px** | 164.5 px | 23.7 px (cpu, at 1600) |

Measurement 19's `serving` slot is 103.8 px — identical to the healthy-box page, so `· GPU 0` costs
no height. ⚠ Measurement 17's 0.8 px at 1600 is **unchanged**, and the tightest margin anywhere in
the run is still 0.7 px (cpu), both pre-existing.

### 8.4 Byte identity against `f6f3101` — **6 of 6**

§4.2. Measured with the pre-change components rendered side by side, then removed from the tree.

### 8.5 The box — read only, nothing written, no D-Bus connection opened

Four services active. `0.env` `CTX=163840` / `ALIAS=qwen3.6-27b`; `:8080/v1/models` →
`qwen3.6-27b`; `Environment` on the two instances → `CUDA_VISIBLE_DEVICES=0` / `=1`, on
`gpu-fan-control.service` → empty; `/etc/llama-server/` holds `0.env` and `1.env`. The build's stray
`pid 3428860` is gone.

---

## 9. Files this phase changed

| file | what |
|---|---|
| `lib/collectors/dbus-wire.ts` | ⚠⚠ `Incomplete` after the completeness test is `malformed`; **both** readers built on the frame; two stale doc claims corrected |
| `lib/collectors/dbus-wire.test.ts` | the fuzz: 4 describes, 17 tests — the exhaustive corruption sweep, the two cross-frame cases, the neighbouring `malformed`/`incomplete` cases, where the widening really stops |
| `lib/fixtures.ts` | `servingCrossPinned` — instance and card disagree |
| `components/panels/gpu-panel.test.tsx` | SHAPE 1 defaults to the cross-pinned fixture; four-shapes text test; the title guard judges its own failure |
| `components/panels/serving-panel.test.tsx` | SHAPE 1 defaults to the cross-pinned fixture; four-shapes text test |
| `lib/client/observations.test.ts` | the `unknown` em dash is explained on SERVING and not on the GPU card, pinned |
| `lib/collectors/llama.test.ts` | §7.9's accept/reject facts; one duplicate test removed; one ⚠ dropped per the ledger's rule |
| `pipeline/steps/05-…/regressions.py` | `12b-W23`, `12b-W24`, `12b-W25` |

`SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md`, `SERVING-MODES.md` untouched by this phase.
`next-env.d.ts` byte-identical. Nothing committed, nothing deployed.

---

## 10. For the parent

1. **§7.9 is unchanged and now has facts under it** (§6). The ruling needs two things: how a
   non-numeric instance is discovered, and what `instance` identity it gets that §6.4's bare-integer
   condition ids can carry.
2. **§7.1's two owed sentences are still owed** — §2.2's mount table still says the socket is for
   `ActiveState` alone, and §3.4's `gpus` row does not name the `Environment` property. This phase
   may not edit `SPEC.md`.
3. **§7.8 — two instances listing the same card is still silent on screen.** The build recorded it;
   nothing in this phase changes it. Two processes on one card is an OOM waiting to happen and the
   dashboard can now see it.
4. **The GPU card's `unknown` em dash is explained on another panel** (§7). Now pinned by a test
   rather than by prose, but still a compromise the owner may want to rule on.
5. **Non-zero D-Bus padding is accepted** (§1.4). Harmless today; stated so nobody discovers it as a
   surprise.

## 11. Left on the box

**Nothing.** Read-only throughout: `ls`, `cat`, `curl` on loopback, `systemctl is-active`,
`systemctl show -p Environment`, `ps`. No D-Bus socket was opened by this phase, so none was left
open. The build's stray process is confirmed gone.
