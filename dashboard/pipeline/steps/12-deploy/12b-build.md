# 12b BUILD — **the join is inverted: an instance declares the cards it serves, and a card asks which instance lists it.**

**Written by the build phase, 2026-09-17.** Branch `dashboard-frontend`, working dir `dashboard/`.
Nothing committed, nothing deployed, nothing written to the box.

**The one-line answer:** `serving[].gpus` is on the wire, read from each unit's own
`CUDA_VISIBLE_DEVICES` over the read-only D-Bus socket §2.2 already mounts; the GPU card and the
SERVING row both read it; all four of §3.4's shapes are rendered and quoted below; and the live
box's own snapshot — which carries no `gpus` at all — validates and renders **byte-identically**
to what it renders today, proven against bytes produced by the pre-change collector rather than
against a fixture written to match the change.

---

## 1. The wire change, and what validates it

### 1.1 `lib/types.ts` — the contract's SECOND optional member

```ts
readonly gpus?: readonly number[] | null;
```

`?:`, not `| null` alone, and that is the whole additivity argument: an older **server** omits the
key, and the key's own *absence* — never a `null` — is what lets its snapshot validate under a
client that knows about the field. A required-but-nullable spelling would refuse **every poll the
running container makes**.

`lib/types.test-d.ts`'s optional census moved `ServingInstance` out of the "nothing is optional"
list and into a **named exception of its own**, written as an exact set
(`OptionalKeys<ServingInstance> === 'gpus'`), so the protection the census gave that type is not
lost: a future `model?:` still fails on that line. The field census asserts
`readonly number[] | null | undefined` — including the `| undefined`, because an assertion of
`readonly number[] | null` alone passes with the `?` deleted, which is the one edit that breaks the
box.

### 1.2 Where the value comes from — ⚠ **the mechanism is a spec silence, and this is the choice**

§3.4 names the *source* (*"the unit's own `CUDA_VISIBLE_DEVICES`"*) and the auth (*none*). It does
not name the transport, and the transport is not free:

| candidate | why it is closed |
|---|---|
| `/etc/llama-server/<i>.env` | carries `PORT`, `MODEL`, `ALIAS`, `CTX`, `FA`, `SPEC` and **no device** — §3.4 says so itself. Confirmed on the box 2026-09-17 |
| the unit file on disk | §2.2 mounts **no unit files**, and adding a mount is an INSTALL-SPEC change this phase may not make |
| `systemctl show` | §2.2 forbids shelling out by name, and the image is `node:24-slim` with no systemd in it |
| **`org.freedesktop.systemd1.Service`'s `Environment` property** | **chosen.** The read-only system-bus socket §2.2 already mounts, the same `GetUnit` + `Properties.Get` pair, one more property on the same object path, on the same connection |

**Verified read-only on the live box, 2026-09-17**, by a bounded script over SSH that speaks D-Bus
directly (`GetUnit` then `Properties.Get`; **never** `LoadUnit`):

```
llama-server@0.service  ->  /org/freedesktop/systemd1/unit/llama_2dserver_400_2eservice
                        ->  v(as) ["CUDA_VISIBLE_DEVICES=0"]
llama-server@1.service  ->  v(as) ["CUDA_VISIBLE_DEVICES=1"]
gpu-fan-control.service ->  v(as) []
```

**systemd has already expanded the template's `%i`.** That is the fact the whole inversion rests on
and it is now on the wire rather than in our arithmetic. All three frames are kept verbatim in
`lib/collectors/samples.ts` as `CAPTURED_DBUS_ENVIRONMENT_REPLY`,
`CAPTURED_DBUS_ENVIRONMENT_REPLY_INSTANCE_1` and `CAPTURED_DBUS_EMPTY_ENVIRONMENT_REPLY`, and
`dbus-wire.test.ts` decodes them — this project's own standard for that file.

⚠ **Both instances' frames are kept, not one.** HANDOVER §0.6: a fixture whose two subjects are
identical cannot discriminate between them. With only instance 0's frame, a reader that answered
every unit from the first reply it saw would score green on the one arrangement this box runs.

### 1.3 `dbus-wire.ts` — the first CONTAINER this codec has ever decoded

`Environment` is a `v` wrapping an `as`, and the decoder's own module doc said containers are *"not
implemented"*. It now decodes `a` followed by **one basic type** and nothing wider: `a(`, `a{` and
`aa` still return `malformed`. Four rules, each with a test:

- the length field is a count of **bytes**, not of elements (the captured frame settles it: `1b000000` = 27 for one 22-character string);
- the element alignment is applied **after** the length **even for an empty array** — the `gpu-fan-control` frame is exactly that shape, and a `t`-element test is the only signature that can tell the padding is there at all;
- an array claiming more bytes than the message holds is **malformed, never `incomplete`** — `decodeMessage` has already established the whole message is present, and saying "read more" is the documented failure where a peer that answered in 1 ms produces a `dbus` entry saying *"timed out"*;
- elements that overrun the declared length are refused rather than returned as data.

The body loop changed from `for (const sig of signature)` — one **character** at a time — to
`completeTypes(signature)`. That loop was only correct while every type was one character.

⚠ **This widening made a pre-existing mutation inert, and the harness caught it.** `05-W4`
("an unsupported type is skipped instead of reported") stopped biting, because every container
signature is now intercepted by `completeTypes`/`alignmentOf` before `Reader.basic`'s `default` is
reached. A new test (a body signature of `z`, which is not a D-Bus type at all) restores it.

### 1.4 `dbus.ts` — the second property, opt-in

`collectUnitStates` gained `environmentUnits` (a list, **intersected with `units`**) and returns
`environments: ReadonlyMap<string, readonly string[] | null>` — **every requested unit is a key,
always**, the same promise `states` makes and for the same reason: a caller must not have to tell
*not asked for* from *asked for and unknown*, because §3.4 renders those differently.

`collectSafety` passes nothing, so the fan service's conversation is **byte-for-byte the one this
file has always had**. `collectServing` passes its own units.

- `[]` is a value, not a failure (`firstStringArray` keeps `Array.isArray` and the per-element
  string check apart — a `v` holding `au` is a list and is *not* an environment);
- an ERROR reply is `null` + **one** `dbus` entry carrying the instance, and does not disturb
  `ActiveState`;
- a unit systemd never loaded gets **no second entry** — `NoSuchUnit` already filed one, and there
  is no object path to read a property from.

### 1.5 `llama.ts` — `parseVisibleDevices`

Pure, total, and the last assignment wins (systemd's own rule for repeated `Environment=` lines,
and the rule `parseLlamaEnv` already applies to the env file).

| input | value | entry |
|---|---|---|
| `CUDA_VISIBLE_DEVICES=0` | `[0]` | — |
| `CUDA_VISIBLE_DEVICES=0,1` | `[0, 1]` | — |
| `CUDA_VISIBLE_DEVICES=1,0` | `[0, 1]` | — (sorted; order only remaps device numbers inside the process) |
| `CUDA_VISIBLE_DEVICES=` | `[]` | — |
| no such key | `null` | **yes** |
| `GPU-3f2b…`, `MIG-…`, `0,GPU-3f2b`, `01`, `+1`, `-1`, `0.5` | `null` | **yes** |

⚠ **An unparseable member makes the WHOLE list `null`, never a partial one.** The UUID and MIG forms
are legal for CUDA and neither is a card index we can join on; returning the indices we *did*
understand would put a card under *served by instance N* on the strength of a list we admit we could
not read.

⚠ **The key is matched by equality, not containment** — `MY_CUDA_VISIBLE_DEVICES_BACKUP=0,1` must
not decide it. `01`/`+1` follow `parseInstanceIndex`: two spellings of one card would be two answers
to *"which instance lists me"*.

### 1.6 `wire.ts` — four outcomes, kept apart

`optionalCardList` answers `ABSENT` / `null` / the array / `undefined` (refuse), and
`servingInstanceOf` **omits the key** rather than setting it to `undefined`, because
`Object.hasOwn` is what the join reads. The two one-character mistakes this is written against are
both tested: `field(value,'gpus') ?? null` (an older server reported as a failed read) and
`{ ...row, gpus }` unconditionally (absence stops being expressible).

A `gpus` that is a string, a number, an object, or an array with a non-integer, fractional, negative
or `null` member **refuses the snapshot** — a card silently missing from an otherwise plausible list
would read as *"no instance serves this card"*, which is a claim rather than a gap.

---

## 2. Where the join now lives

`lib/client/observations.ts`, as two pure functions beside §6.5's `errorsForPanel`:

```ts
export const servedBy   = (serving, index) => ServedBy   // 'declared' | 'indexed' | 'unknown' | 'unserved'
export const servedCards = (gpus) => string | null       // 'GPU 0' | 'GPUs 0, 1' | 'no GPUs' | '—' | null
```

`components/` stays hook-free: both are pure, and `gpu-panel.tsx`'s `servedItem` is a module-level
function of a snapshot.

Three rules that are load-bearing and each have a test and a mutation:

1. ⚠ **The fallback is chosen by the SNAPSHOT, not by the row.** `indexed` is returned only when
   *no* instance carries the key. Deciding per row would let one unreadable unit silently re-enable
   the index join for its own card — the coincidence this change exists to stop relying on.
2. ⚠ **`declaresGpus` is `Object.hasOwn`, never `instance.gpus !== undefined`.** The two differ the
   moment anything spreads a row, and `wire.ts` omits the key for exactly that reason.
3. ⚠ **`unknown` and `unserved` are different answers.** Every list read and none naming this card
   is *an answer* (§6.5's *"absent from a collection that was read … the subject has left, and that
   is an answer"*, one level down). A list that could not be read is invariant 1.

⚠ **`panelsForSource` is UNCHANGED, deliberately.** A `gpus: null` puts an em dash on the GPU card
whose `dbus` explanation renders on the SERVING panel, beside the row it names. That is not a new
compromise: `llama-env` has never reached the GPU card either, so the card's served-by cell has
**always** borrowed its explanation from SERVING when `serving: null`. Widening `dbus`'s fan-out to
`'gpu'` was rejected because it would change **today's** rendering on the live box the moment any
unrelated `dbus` entry exists (the box has produced undiagnosed `ECONNRESET` entries before) — and
because a fan-service failure blanks nothing on a GPU card, so it would be one fact stated twice.

---

## 3. The four shapes, on both panels, quoted from a real render

Captured from `renderToStaticMarkup` on 2026-09-17 (the same renders the tests assert; the strip's
`k`/`dd` pair and the SERVING row's name/secondary-label pair, verbatim).

### 3.1 GPU card — the `served by` strip item

| `gpus` | card | rendered `k` | rendered value |
|---|---|---|---|
| **`[N]`** | GPU 0 | `served by instance 0` | `qwen3.6-27b` |
| **`[N]`** | GPU 1 | `served by instance 1` | `—` (that fixture's instance 1 has no model) |
| **`[0, 1]`** | GPU 0 | `served jointly with GPU 1` | `gemma-4-31b` |
| **`[0, 1]`** | GPU 1 | `served jointly with GPU 0` | `gemma-4-31b` |
| **`null`** | GPU 0 / GPU 1 | `served by` | `—` |
| **absent** | GPU 0 | `served by instance 0` | `qwen3.6-27b` |
| **absent** | GPU 1 | `served by instance 1` | `—` |
| read, **unclaimed** | GPU 1 | `served by` | `no instance` |

⚠ **The label takes the INSTANCE's number in the `declared` case, not the card's.** They coincide in
per-GPU mode — which is why the absent and `[N]` rows above are identical — and they come apart
exactly when the deployment is not what the old join assumed. Rendered, with instance 0 pinned to
card 1:

```
GPU 1   served by instance 0   qwen3.6-27b
GPU 0   served by              no instance
```

That is §6.2's own named failure mode (*"getting it wrong prints the wrong model on a card rather
than failing visibly"*) turned the right way up.

⚠ **No em dash in the joint case**, and it is asserted as a negative as well as a positive: the
`served jointly with GPU 0` row on GPU 1 contains `gemma-4-31b` and does **not** contain `—`.

The joint case keeps its `title` (`title="gemma-4-31b"`, and a path-valued model keeps the whole
path); the `unknown` and `unserved` cases carry **no `title` attribute at all** — 10f's rule that an
optional prop is an untested one, and `title="undefined"` is the shape that ships unnoticed.

### 3.2 SERVING panel — the row's secondary label

| `gpus` | rendered |
|---|---|
| **`[N]`** | `llama-server@0` `:8080 · GPU 0` and `llama-server@1` `:8081 · GPU 1` |
| **`[0, 1]`** | `llama-server@0` `:8080 · GPUs 0, 1` — **one row**, both cards |
| **`null`** | `llama-server@0` `:8080 · —`, with `…AccessDenied` on the row's own detail line |
| **absent** | `llama-server@0` `:8080` and `llama-server@1` `:8081` — nothing extra at all |
| `[]` | `llama-server@0` `:8080 · no GPUs` |

⚠ **The mode is never inferred from the row count**, and that is asserted directly: a snapshot with
one row because the other card's service failed renders `GPU 0`, not `GPUs 0, 1`.

The cards go in `secondaryLabel`, beside the port, because both answer *where is this process* —
identity, not measurement — and because that slot wraps with the row rather than forcing a line of
its own (10e §2.7). **Which slot, and the words themselves, are a spec silence** (§7.7).

---

## 4. The older-server fallback, and how it was proved not to regress

### 4.1 The evidence is the DEPLOYED server's own output, not a fixture

`lib/fixtures.ts` carries `LIVE_BOX_SERVING_WIRE`: the `serving[]` produced by **`collectServing`
as it stood before this change**, run on 2026-09-17 against the live box's own inputs —
`/etc/llama-server/0.env` and `1.env` read over SSH, and the real `/v1/models` bodies from
`127.0.0.1:8080` and `:8081` — then `JSON.stringify`d and frozen as **unparsed bytes**:

```json
[ { "instance": 0, "port": 8080, "unitState": null, "model": "qwen3.6-27b", "ctx": 163840, "health": "ok" },
  { "instance": 1, "port": 8081, "unitState": null, "model": "qwen3.6-27b", "ctx": 163840, "health": "ok" } ]
```

Six keys per instance, and `gpus` is not among them. (The context is 163840 and not this repo's
older 131072 fixtures because that is the box's value on the day. `unitState` is `null` because the
capture script had no bus to ask systemd — it changes nothing about the key set, which is what the
asset exists to pin.) It is a **string**, not an object literal: it has to enter `parseSnapshot` as
bytes nobody checked.

### 4.2 Three assertions on it, in three different files

1. **`lib/client/wire.test.ts`** — it validates, and the validated rows' key set is exactly those
   six. A second test asserts `Object.hasOwn(row, 'gpus') === false` and `row.gpus === undefined`,
   which is the pair that catches the `?? null` and the always-spread mistakes.
2. **`components/panels/gpu-panel.test.tsx`** — those same bytes, through `parseSnapshot`, rendered:
   `served by instance 1` / `qwen3.6-27b`, no `no instance`, no em dash in that row.
3. **`components/panels/serving-panel.test.tsx`** — the rows carry `:8080` and `:8081` with
   **nothing after them**, asserted as `not.toContain(':8080 · ')` rather than as the absence of
   every em dash on the panel (the row's *value* column legitimately shows one, for `unitState`).

### 4.3 And the byte-identity test

`servingInstances` (absent) and `servingPerGpu` (the same two instances plus `gpus: [0]`/`[1]`)
differ in exactly one key — asserted in `lib/collectors/serving.test.ts`, so the pair cannot drift —
and on the GPU card they render **byte-identically**:

```ts
for (const panelId of ['gpu0', 'gpu1'] as const) {
  expect(render(servingPerGpu, panelId)).toBe(render(servingInstances, panelId));
}
```

On the SERVING panel they differ **only** where the cards are shown:
`declared.replace(' · GPU 0', '').replace(' · GPU 1', '') === older`.

### 4.4 And the negative evidence that costs nothing to state

`pnpm verify` went from 3501 to 3603 tests with **no existing panel, shell, route, client or
condition test changed**. The only pre-existing tests this loop had to edit were seven in
`lib/collectors/serving.test.ts` — all of them exact-object comparisons of the collector's own
output, which now legitimately carries `gpus`. Nothing that renders a snapshot changed.

---

## 5. The measurements

All run on the reconciled tree, serially, nothing beside a harness.

### 5.1 `pnpm verify`

**exit 0 — 108 files, 3603 tests, no type errors** (was 108 / 3501).

### 5.2 Browser — `measure-breakpoints.mjs`

**exit 0 — 95 passed, 0 failed, 0 blocked** (was 81 passed). Two graded pages are new:

- **Measurement 19 — the page this box becomes the day it is REDEPLOYED.** Every instance declares
  its card. The GPU strip is unchanged (§3.4's fallback makes absent and `[N]` the same strip) and
  the SERVING row grows `· GPU 0` after its port.
- **Measurement 20 — SPLIT MODE.** One process across both cards: each card reads *served jointly
  with GPU M* — the **longest** served-by label the panel can produce, 25 characters against the
  ordinary 20, on the row that sets §6.1's first term — and one SERVING row names both cards.

Both pass at all three viewports, with their own numbers:

| page | 1280×1024 spare | 1600×1024 spare | 1920×1080 spare | `serving` slot | tightest cap margin |
|---|---|---|---|---|---|
| 19 (redeployed) | 263 px | 228 px | 284 px | **103.8 px** | 23.7 px (cpu, at 1600) |
| 20 (split) | 263 px | 228 px | 284 px | **97 / 76 px** | 23.7 px (cpu, at 1600) |

⚠ **The extra text costs nothing in height.** The healthy box page's `serving` slot is 103.8 px
(`check-density.mjs`, unchanged) and measurement 19's is **103.8 px** — `· GPU 0` does not wrap the
row. The split page's SERVING panel is *shorter* (one row instead of two). Neither GPU card grew:
164.5 px on both new pages, against the 164/176 the existing records report.

⚠ **Measurement 17's 0.8 px at 1600 is untouched** — it renders the absent shape, which this loop
does not change, and it still reports `gpu0 by 0.8 px`. The tightest margin anywhere in the run is
0.7 px (cpu), also pre-existing.

⚠ Both new records assert their **precondition** first, on both cards and on the SERVING panel: a
fixture that failed to take renders §3.4's fallback, which would satisfy "no panel clips" vacuously
while measuring the page this loop did not change. `gpu0NotBlank`/`gpu1NotBlank` are terms of their
own, because §6.2's *"an em dash there would be a lie"* is a failure a fit measurement **cannot**
see: a blank strip makes the page shorter, not taller.

The five terms that keep those records honest are in `measurement-harness.test.ts`, and
`12b-MH12`…`12b-MH16` each delete one and redden it.

### 5.3 Browser — density

`measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture` → exit 0;
`check-density.mjs /tmp/density.json` → **ALL PASS**, every slot within 3 % of target, `serving`
103.8 vs 104.4 target, page overflow 0 at 1920×1080 and with the §6.4 banner pinned (band 101.8).
Unchanged: that fixture sends no `gpus`.

### 5.4 Harness totals — **all three exit 0**

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `05-collectors-serving-storage-safety` | **158** (was 130) | 240 red across 158; **140 ⚠ checked** (was 100) | **exit 0** |
| `08-client-runtime` | **189** (was 174) | 317 red across 189; **239 ⚠ checked** (was 221) | **exit 0** |
| `10-panels-assembly` | **341** (was 325) | 519 red across 341; **351 ⚠ checked** (was 335) | **exit 0** |

**Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, and every ⚠ mark reddened
in all three.** 12b adds **28 + 15 + 16 = 59** mutations, all `12b-`-prefixed and unique across the
ten harnesses.

⚠ **The first run of all three returned 1, and every one of those failures was the ledger doing its
job.** They are recorded here because each is a finding, not a chore:

| finding | what it was |
|---|---|
| **Five pre-existing anchors moved or went ambiguous** | `05-W3` (the variant branch now goes through `value`), `05-D6`/`05-D8` (two returns gained `environments`), `05-V7` (the options object gained `environmentUnits`), and `10c-GP4`/`10h-GP1`/`GP2`/`GP3` (the strip item moved into `servedItem`). All re-aimed. `10c-GP4`'s **subject moved files**: `gpu-panel.tsx` no longer looks an instance up at all, so the positional-lookup defect now lives in `servedBy`, and the mutation points there with the GPU card's test still as its ledger file |
| ⚠ **`05-L2` became AMBIGUOUS — two functions ended in the same line** | `parseVisibleDevices` ended `return { value: [...found].sort((a, b) => a - b), problems };`, which is `discoverInstances`'s last line verbatim. An anchor that matches twice is a mutation that silently tests whichever site comes first. Fixed in the PRODUCTION file by naming the second set `cards`, not by making the anchor longer |
| ⚠ **`05-W4` DID NOT BITE — the widening made a shipped mutation inert** | The container-signature test now fails in `completeTypes` before `Reader.basic`'s `default` is reached. A new `z`-signature test restores the mutation's subject |
| ⚠⚠ **`12b-D9` DID NOT BITE — the expectation interpolated the constant under test** | `expect(bus.properties).toEqual([\`${SYSTEMD_SERVICE_IFACE}/…\`])` changes with the constant, so pointing `Environment` at the generic `Unit` interface passed. The interface names are written out as literals now, with one separate assertion that the constants really are those strings |
| ⚠ **`12b-S10` DID NOT BITE — my own mutation was wrong** | It returned the parse result and pushed no entry, so the "second entry" it was named for was never filed. Rewritten to file one |
| ⚠ **Five ⚠ tests no mutation could redden — all HAPPY-PATH properties** | The edge-case mutations could not reach them. `12b-D15`, `12b-L19` (the key is never stripped from the `KEY=VALUE` entry) and `12b-L20` (a member is parsed untrimmed) cover all five |
| ⚠⚠ **One more, and it is this loop's own lesson repeating** | `⚠ SHAPE 1 of 4 — gpus: [N]` was inert because `12b-SP3`, `SP4` **and** `SP5` all render `GPU 0` for instance 0 — **the coincidence the whole loop is about, reappearing inside the mutations meant to test it**. `12b-SP6` (render `GPUs 0` for one card) is the one that can tell them apart |
| ⚠ **One unmatchable ledger key** | `test.each(...)('⚠ %s renders as %s')` has a matchable prefix of one character. Three of my `test.each` names had a leading `%`; all three moved the placeholder later |

---

## 6. Files changed

| file | what |
|---|---|
| `lib/types.ts` | `ServingInstance.gpus`, and `Gpu.index`'s doc corrected — it is what `gpus` names now |
| `lib/types.test-d.ts` | the optional census: a second named exception, as an exact set |
| `lib/collectors/dbus-wire.ts` | `Reader.value`/`array`, `alignmentOf`, `completeTypes`, `DBUS_MAX_ARRAY_BYTES` |
| `lib/collectors/dbus.ts` | `SYSTEMD_SERVICE_IFACE`, `ENVIRONMENT_PROPERTY`, `environmentUnits`, `environments`, `firstStringArray` |
| `lib/collectors/llama.ts` | `CUDA_VISIBLE_DEVICES`, `parseVisibleDevices` |
| `lib/collectors/serving.ts` | `environmentUnits` passed; `gpusFor`; `gpuProblems` appended after the `dbus` family |
| `lib/collectors/samples.ts` | three captured `Environment` frames |
| `lib/client/wire.ts` | `cardIndex`, `optionalCardList`, the key omitted rather than set |
| `lib/client/observations.ts` | `ServedBy`, `servedBy`, `servedCards`, `declaresGpus` |
| `components/panels/gpu-panel.tsx` | `servedItem`; `servingFor` deleted |
| `components/panels/serving-panel.tsx` | `servedCards(instance.gpus)` into `secondaryLabel` |
| `lib/fixtures.ts` | `LIVE_BOX_SERVING_WIRE`, `servingPerGpu`, `servingSplit`, `servingGpusUnreadable(+Snapshot)`; `servingIdentityOnly` gains `gpus: null` |
| the five test files above, `measurement-harness.test.ts`, `measure-breakpoints.mjs`, three `regressions.py` | tests, terms, records, mutations |

`next-env.d.ts` is byte-identical (`git diff --stat` empty; `measure-breakpoints.mjs` restores it
itself). `SPEC.md`'s only modification is the parent's own §3.4 edit. No `.env`. Nothing committed.

---

## 7. Spec silences — ⚠ **nine, and §7.9 is the one that matters most**

Invariant 7: none of these was assumed quietly. Each records what was chosen and why.

**7.1 — The MECHANISM for reading `CUDA_VISIBLE_DEVICES` is unspecified.** §3.4 names the source and
the auth, not the transport. §2.2's mount table has no unit-file row and the env files carry no
device, so the read-only D-Bus socket is the only container-reachable source; the property is
`org.freedesktop.systemd1.Service`'s `Environment`. **Two sentences are owed:** §2.2's *systemd unit
state* row should say the socket is now also read for `Environment` (its own "Notes" cell still says
*"Query `ActiveState`"*), and §3.4's `gpus` row should name the property so the next reader does not
have to re-derive the argument above.

**7.2 — `gpus: []` is a FOURTH value §3.4's table does not have.** `CUDA_VISIBLE_DEVICES=` is legal
and means *no device is visible*. Chosen: `[]` — a value, not a failure (§3.1's `null` ≠ `[]`, one
level down) — rendered `no GPUs` on the SERVING row, and a card nobody claims reads `no instance`.

**7.3 — A unit that declares no `CUDA_VISIBLE_DEVICES` at all.** Not in the table. Chosen: `null`
plus a `dbus` entry naming the unit, because the unit exists and what it pins cannot be read from
it. `[]` was rejected: it would claim the instance serves no card, which is a different statement.

**7.4 — A `CUDA_VISIBLE_DEVICES` that is legal for CUDA but is not a list of indices** (`GPU-<uuid>`,
`MIG-…`). Chosen: the whole list `null` plus an entry naming the offending member. A partial list
is the failure §3.4's `null` exists for.

**7.5 — What a GPU card renders when every list was READ and none names it.** §6.2 rules `[N]`,
`[0,1]` and `null` and is silent here. Chosen: label `served by`, value **`no instance`**. An em
dash was rejected on §6.5's own grounds — *absent from a collection that was read* is an answer —
and the wording follows the house vocabulary (`card not enumerated`, `no llama-server instances
discovered`).

**7.6 — The LABEL loses its instance number in the `unknown` and `unserved` cases** (`served by`
rather than `served by instance N`), because there is no instance to name. §6.2 does not discuss it.

**7.7 — Which slot on the SERVING row the cards go in, and the words.** §6.2 says only *"naming the
cards it spans"*. Chosen: appended to `secondaryLabel` after the port (`:8080 · GPU 0`), singular
`GPU 0` / plural `GPUs 0, 1`. The singular/plural split is not decoration: it is what makes the
joint arrangement legible across a room, which is §6.1's premise.

**7.8 — Two instances listing the same card.** A real state during a bad mode switch (systemd's
`Conflicts=` is what normally prevents it). §3.4 is silent. Chosen: the first claimant in
`serving[]`'s ascending order; **nothing on screen names the conflict.** Worth an owner ruling — two
processes on one card is an OOM waiting to happen, and the dashboard can now see it and says
nothing.

**7.9 — ⚠⚠ SPLIT MODE'S OWN INSTANCE IS NOT DISCOVERABLE, AND THIS LOOP DOES NOT CLOSE IT.**
§3.4 enumerates `/etc/llama-server/*.env` and requires the filename to parse as **a bare
non-negative integer**. `serving-mode.sh` writes `/etc/llama-server/split.env` and installs
`llama-split.service` — so `split.env` is **rejected by discovery** and files an `llama-env`
problem, and the split process is invisible to the dashboard. In real split mode the panel would
show instances 0 and 1 (their env files are not deleted), both inactive, each `gpus: null` if
systemd has unloaded them — honest, but the process actually serving the box appears nowhere.

**The join is now correct in both modes and the split arrangement still cannot be rendered on this
box.** `serving-mode.sh`'s `dashboard_caveat()` says *"the day GPU 1 reads 'served jointly with
GPU 0', this caveat is false — delete it from this script"*: that day has not arrived, because
nothing puts a `gpus: [0, 1]` instance into `serving[]` on the real box. Closing it needs a §3.4
ruling on how a non-numeric instance is discovered and what its `instance` identity is (§6.4's
condition ids are *bare integers* — `unit:llama-server@<i>.service` and `health:<i>` — and
`llama-split.service` is neither). **Owner.** Until then the caveat in `serving-mode.sh` stays
true and should not be deleted.

---

## 8. What a later phase must not undo

1. **`wire.ts` omits the `gpus` key rather than setting it.** `Object.hasOwn` is the join's only
   test for "older server", and a present-but-`undefined` key answers `true`.
2. **`servedBy`'s fallback is `!serving.some(declaresGpus)`, not per row.** Per row lets one
   unreadable unit restore the index join for its own card.
3. **`LIVE_BOX_SERVING_WIRE` is a frozen STRING produced by the pre-change collector.** Retyping it
   as an object literal, or regenerating it from the current collector, destroys the only evidence
   in the tree that the wire change is additive.
4. **`panelsForSource` was left alone on purpose** (§2's last paragraph). Adding `'gpu'` to `dbus`
   changes today's rendering on the live box.
5. **`12b-SP6` exists because three other mutations all rendered `GPU 0` for instance 0.** Any future
   mutation of the SERVING row's cards must be checked against instance ≠ card, or it is testing the
   coincidence again.
6. **Measurements 19 and 20 assert their preconditions.** Without them both records grade the
   fallback page and pass while measuring nothing this loop changed.

---

## 9. Left on the box — ⚠ one stray process, mine

`pid 3428860`, `python3 - llama-server@0.service`, on `ai-server`. It is the first (unbounded)
attempt at the read-only D-Bus capture: it is blocked in `recv()` on a unix socket, uses no CPU, and
holds one system-bus connection. The later capture script is hard-bounded (`SIGALRM` at 20 s plus a
5 s socket timeout) and left nothing behind.

**It needs `kill 3428860` on the box.** This phase could not do it: the sandbox's classifier refused
`kill`/`pkill` over SSH, which is the correct default for a live production machine, and working
around it was not attempted. Nothing else was left on the box; nothing was written to it.
