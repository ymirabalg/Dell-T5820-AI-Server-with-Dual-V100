# 12c BUILD — named instances, and a wire that drops the row instead of the page

**Written by the build phase, 2026-09-17.** Branch `dashboard-frontend`, working dir `dashboard/`,
tree clean at `cb8a3c7` when this started. **Nothing committed, nothing staged, nothing deployed,
and this phase did not contact `192.168.4.71` at all** — no SSH, no HTTP, no D-Bus socket opened
and therefore none left open. `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are
untouched; `next-env.d.ts` is byte-identical.

---

## 1. Ruling one — the identity is a STRING, and discovery accepts a name

`discoverInstances` required a bare-integer filename, so `serving-mode.sh`'s `split.env` was
rejected outright. The cost was not a missing feature: the per-card env files **survive a mode
switch**, so a box in split mode rendered instances 0 and 1 — both inactive, both confidently
wrong — while the one process actually serving the box appeared nowhere.

### 1.1 The type change, and everything it touched

| layer | file | what changed |
|---|---|---|
| the contract | `lib/types.ts` | `ServingInstance.instance: number → string`; `TelemetryError.instance?: number → string` |
| the type census | `lib/types.test-d.ts` | two `Equals<…, number>` assertions become `string` |
| the grammar | `lib/units.ts` | **new**: `INSTANCE_ID`, `isNumericInstance`, `isInstanceId` |
| discovery | `lib/collectors/llama.ts` | `parseInstanceIndex → parseInstanceId`, returns `string \| null`; `discoverInstances` returns `string[]` |
| the export barrel | `lib/collectors/index.ts` | the renamed export |
| tagging | `lib/collectors/errors.ts` | `tag(source, messages, instance?: string)` |
| the bus | `lib/collectors/dbus.ts` | `unitInstances?: ReadonlyMap<string, string>` |
| the collector | `lib/collectors/serving.ts` | the env path, the unit list, `gpusFor`, `unitStateFor`, and the miss (§2) |
| the wire | `lib/client/wire.ts` | `instanceId`, `optionalInstanceId`, and §3's row refusal |
| the join | `lib/client/observations.ts` | `servedBy`'s fallback and its claimant rule; §6.4's subjects |
| the panels | `components/panels/serving-panel.tsx`, `gpu-panel.tsx` | labels, React key, condition lookup |
| the probe | `scripts/api.probe.ts` | the row name comes from the mapping, not a template |
| fixtures | `lib/fixtures.ts`, `components/panels/test-support.ts`, `pipeline/steps/10-…/measure-breakpoints.mjs` | string identities; three new fixtures |

**The grammar is ONE predicate, applied on both sides of the wire.** `lib/units.ts`'s
`isInstanceId` is what `parseInstanceId` asks of a filename stem and what `wire.ts`'s `instanceId`
asks of a wire value — not two rules that agree today. Two clauses:

- `INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/`. Every exclusion closes a named hole: `:` because
  §6.4 builds `kind:subject` and a colon in a subject is a second spelling of another id; `@` and
  `.` because an identity holding either can spell a unit name that is not its own; `/`,
  whitespace and empty because a path segment and a unit name are neither; a **leading** `-` or `_`
  so `-1.env` is not read as the identity `-1`.
- **A digits-only identity must be canonical.** `01.env` stays refused, and its justification
  changed: as strings `'01'` and `'1'` are already distinct, so injectivity no longer needs the
  rule — but the ORDER does (is `01` before or after `1`?), and §6.4 still says an index-shaped
  subject is *"a bare integer … no padding, no prefix"*.

⚠ **The third outcome is the wrong one and it is asserted against.** `INSTANCE_ID.test('01')` is
`true`, so a grammar check alone admits `01` as a **named** instance — where it would sort behind
`split`, spell no unit name, and sit on the panel beside `1` as an unrelated process.

**One fixture inverted, and that is the ruling rather than a regression.**
`LLAMA_SERVER_ENTRIES_NOISY` asserted `default.env` **rejected**; it is now instance `default`,
because it has exactly the shape of `split.env`. What makes that safe is §2: the mapping misses on
it, loudly. The "not an instance" half of that test now uses `01.env`, which is still refused.

### 1.2 The unit name is a MAPPING, and a miss is an `errors[]` entry

```ts
servingUnitName('0')       // 'llama-server@0.service'
servingUnitName('split')   // 'llama-split.service'      ← NOT llama-server@split.service
servingUnitName('default') // null
```

**Every wrong answer here is silent, which is why the miss is `null` and not a guess.** A unit name
that does not exist is not an error on the bus: systemd answers about it perfectly well and reports
`inactive`, which reads as *a stopped service* rather than *we asked about the wrong thing*. A
template producing `llama-server@split.service` would render a plausible, quiet, wrong page — a
dead unit for a process that is up, an em dash on both GPU cards for a `gpus` that was never asked
for, and nothing anywhere saying why.

**How the miss is made loud — four things, deliberately, not one:**

1. **The unit is not asked about at all.** `collectServing` partitions the discovered identities
   into `named` and `unnamed` before it builds the D-Bus question. Asserted through the *units
   requested* (`asked`), not through the readings: a guessed name gets an ordinary answer back, so
   asserting the readings alone cannot tell the two apart.
2. **One `errors[]` entry per poll, carrying the instance**, so §6.5 puts it on that row:
   ``no systemd unit is known for instance `default` (`default.env` in /etc/llama-server), so its
   unit state and the cards it serves were not read``.
3. **`unitState` and `gpus` are `null`** — and `gpusFor` files **no second entry**, because §6.5's
   *one fact, stated once* governs, the same way it already did for a bus-wide connect failure.
4. **No `unit:` condition is minted** (`observations.ts`). A `unit:llama-server@default.service`
   row would be a §6.3 band — and a `STANDING`-suppressible id — against a unit that never existed.
   The `health:default` condition stays, because that is a real reading of a real process.

**The source is `dbus`, and the choice is argued rather than assumed.** §3.4's table maps a source
to the columns it blanks; this failure blanks exactly `unitState` and `gpus` — `dbus`'s two — while
`port`, `ctx`, `health` and `model` are all read normally from an env file that parsed perfectly.
Filing it under `llama-env` would point the reader at the env file, which is the one thing here
that is not wrong. ⚠ **It is a stretch of §3.7 and it is recorded as a spec silence** (§6, Q3):
nothing failed *on* the bus; we never asked.

**The operator-facing strings come from the mapping too.** `servingUnitLabel` is the unit name
minus `.service`, derived rather than spelled a second time — so `0` still reads `llama-server@0`
(byte-identical to what shipped), `split` reads `llama-split`, and a miss reads as the bare
identity `default`. 12b's survey named the alternative's cost exactly: *"four operator-facing
strings would NAME A UNIT THAT DOES NOT EXIST."*

### 1.3 The ordering rule, in the code's own words

`discoverInstances` used to end in `sort((a, b) => a - b)`, and that sort was quietly doing two
jobs. One presentational — §6.2's rows *"in an order a human reads"*, which is why `10` follows `2`
— and one **load-bearing**: `serving[]`'s order is what *first claimant wins* means in §6.2's
inverted join. A numeric subtraction has no string equivalent, so replacing it with `localeCompare`
or a bare `<` would have silently changed the second job while appearing to preserve the first.

> **`compareInstances` (`lib/units.ts`): numbered instances first, ascending by VALUE; then named
> instances, ascending by code point.** So `0, 1, 2, 10, abc, split` — never `0, 1, 10, 2`.

*Why numbers before names rather than one lexical run:* the numbered instances are the arrangement
this box boots into, and a named one is an addition to it. Sorting `10` before `2` to get `split`
into a single lexical order would trade the order a human reads for a uniformity nothing asks for.

**It is a TOTAL order on distinct identities, and that is the property the join needs.** No two
different identities compare equal — the grammar admits none that is both numeric and named, two
canonical decimals differ in value, two names differ at some code point — so a **set** of
identities has exactly one ordering, independent of the order they arrived in.

### 1.4 The determinism test, and where the order stopped being load-bearing

12b wrote the join's tie-break as *"the first claimant wins, in `serving[]`'s own ascending
order"*, which was true only while the collector's own sort was the only thing that could produce
the array. **`servedBy` now picks the claimant with the smallest identity under `compareInstances`
rather than the first by position.** One `reduce`, and it buys the property the bar asks for: *the
same rows in a different order give the same answer.* A snapshot re-ordered by a proxy, a future
collector or a hand-written fixture cannot silently move a model onto another card.

⚠ Strictly `< 0`, so a tie keeps the earlier element. Two rows can only tie by carrying the same
identity, which `discoverInstances` cannot produce (it dedupes through a `Set`) and which `wire.ts`
does not police — array order is consulted in that case and **nowhere else**.

Three determinism tests, at three layers:

| layer | test |
|---|---|
| the comparator | `lib/units.test.ts` — the sorted result of three different arrivals of one set is identical; totality and antisymmetry over an 8-identity matrix |
| the collector | `lib/collectors/serving.test.ts` — three different `readDir` orders yield `['0','2','10','split']` |
| the join | `lib/client/observations.test.ts` + `gpu-panel.test.tsx` — `servingTwoClaimants` **and its reverse** give the same card the same instance, asserted on the rendered markup as well as on the function |

**The fixture arrives worst-first on purpose.** `servingTwoClaimants` lists `split` (which claims
cards 0 **and** 1) as element 0 and instance `0` (which claims card 0) as element 1, and the answer
for card 0 is `0`. A join taking the first claimant by position answers `split` — and would agree
with the rule on every other fixture in the project, because the collector sorts before the wire
ever sees them. Card **1** is claimed by `split` alone on the same fixture, so it also proves the
winner is chosen **per card**, not once per snapshot.

---

## 2. Ruling two — `wire.ts` refuses the ROW, not the snapshot

One invalid `serving[]` entry returned `null` from `parseSnapshot`, and §6.7 treats that as a
**failed poll**: no GPU temperature, no fan speed, no SAFETY panel, because one instance's
`instance` was of the wrong type. Now the row is dropped, the rest render, and an `errors[]` entry
names which row and why.

```
serving[1] was dropped: `port`, `ctx` did not validate
serving[1] was dropped: the row is not a JSON object
serving[0] was dropped: `instance` did not validate
```

**Which row is the INDEX it arrived at, never its `instance`** — the identity is one of the things
that may have been the reason for the refusal, and a refusal quoting an unusable value tells the
reader nothing they can look up. **Why is every bad field, not the first**: a row refused for
`port` alone and a row that is wholesale the wrong shape are different diagnoses for the person
deciding whether to redeploy.

### 2.1 This is invariant 5, and here is what stops it spreading

Invariant 5 — *a failed reading is a partial snapshot plus an `errors[]` entry, never a 500*.
Whole-snapshot refusal was the stricter reading of O10 and it turned a contract mismatch into a
dead dashboard. **Three properties hold of `serving[]` and of nothing else in §4**, and the
justification is written into `servingListOf`'s own doc rather than left to this file:

1. **Its members are independent subjects.** Each row is one process, discovered separately, read
   separately, rendered on its own row. `host`, `cooling`, `storage` and `safety` are *containers
   of readings about one subject* — there is no row to drop, and dropping a field would invent a
   `null`, which invariant 1 says is a reading the box could not take rather than a key we chose
   not to believe.
2. **Its length is DISCOVERED and already varies** (§3.4: *"a third card must appear without a code
   change"*), so nothing downstream is entitled to a row count.
3. **It is the one array whose element TYPE a deploy ordering can change**, which is what this loop
   just did to it.

**`gpus[]` looks identical and gets the opposite treatment, deliberately.** §9 makes a card's
absence from a `gpus[]` that was read mean **retired** — *the card has left the machine* — so
silently dropping a malformed GPU row would mint that verdict out of a validation failure. The two
arrays' opposite behaviours are asserted **in one test**, side by side, rather than left to a
comment.

**`errors[]` is an array of independent entries too and is NOT lenient**: dropping a malformed
entry would hide the report of a failure behind the report of a failure. `standing` likewise.
**`serving: null` and a non-array `serving` still refuse the snapshot** — `null` is §3.1's *"which
instances exist is unknown"*, a legal value; a string or an object is the COLLECTION being wrong
rather than a member of it, and there is no row to drop.

### 2.2 A dropped row can never be counted as healthy

`failingSourceCount` counts distinct §3.7 sources carrying an entry, and 12a's refusal repaints a
`normal` reduction as **no band** while any source is unread. So filing the entry is exactly what
makes a dropped row impossible to miss — asserted through that function, not through a comment:
a clean snapshot scores 0, a snapshot with one dropped row scores 1, and the header cannot read
`● all healthy`. The entry carries **no `instance`** (there may be no usable one), so it renders
under the rows through `PanelNotes` — the panel's existing home for a collector-wide entry — rather
than being attributed to a row that no longer exists.

**Refusals are APPENDED.** §4 pins `errors[]`'s order as the server's concatenation order and
`events.ts` reads the LAST message per source; prepending would re-order every entry the server
sent and leave the event log quoting a stale sentence.

---

## 3. The live box, and what a client sees when the server is newer

**The wire change is not additive** — `instance` went from `number` to `string` — and the frozen
`LIVE_BOX_SERVING_WIRE` spells both identities as **JSON numbers**. A string-only reader would have
dropped every row of every poll the running container makes, which is precisely the dead dashboard
§3.4's own ruling describes.

**So `instanceId` accepts a JSON number and reads it as the identity it names.** §3.4 fixes a
numeric identity as *its canonical decimal string*, so `0` and `"0"` are two spellings of one
instance and must produce one page. The admission is narrow — a non-negative **safe** integer whose
`String()` is canonical, checked through `isNumericInstance` rather than by eye, so `1.5`, `-1`,
`1e21` and `NaN` are refused like any other malformed reading. ⚠ **This is not the coercion O10
forbids**: `serving: null → []` would invent a reading the box never took; this re-spells one
identity as the same identity, and `isNumericInstance` is what makes "the same" checkable.

**The proof, quoted from `lib/client/wire.test.ts`:**

- the frozen bytes validate, two rows, six keys each and `gpus` absent (unchanged from 12b);
- the fixture's own bytes still read `"instance": 0`, `ctx: 163840`, `model: "qwen3.6-27b"` — the
  evidence assertion 12b added is untouched and still asserts a **number**;
- `instance: 0 → '0'`, `12 → '12'`, `'split' → 'split'`, each asserted;
- `gpu-panel.test.tsx`'s *ABSENT and `[N]` render BYTE-IDENTICALLY* test is unchanged and green, so
  the rendered page is the same page;
- and in a real browser, **`fixtureBox` keeps the number spelling while `fixtureDeclared`
  (measurement 19) uses the string one** — the compatibility claim is drawn on both sides rather
  than only in jsdom.

### ⚠ What a client OLDER than its server sees, and why the ruling does not help it

A client that predates 12c meets `"instance": "split"` at `integer()`, refuses the snapshot, and
shows §6.7's failed poll — the grey dot, the counting age, the frozen traces and the backoff. **No
row refusal exists in code that predates it**, and nothing this loop does can change that. Server
and client ship in **one image** (§4), so the window is a browser tab left open across a redeploy,
and it closes on reload. Ruling two's real value is forward-looking: the next non-additive change
to a `serving[]` field costs one row instead of the page.

---

## 4. The renders, quoted from real output

**Every block below is the rendered output itself**, taken from `renderToStaticMarkup` and
`parseSnapshot` on the shipped fixtures (tags stripped, text nodes joined with ` | `), not
transcribed from an assertion or reasoned about.

**A split row, with a NAMED identity** — `serving: servingSplit`:

```
serving | llama-server instances | ✓ | normal | ✓ | normal |
llama-split | :8080 · GPUs 0, 1 | gemma-4-31b · ctx 262,144 | health ok | ✓ | normal | active
```

`llama-split`, not `llama-server@split` — and the test asserts the wrong one **absent**, because
both can be true at once and the wrong one is what a template produces.

**A mapping miss beside a healthy instance** — `serving: servingUnmappedSnapshot`:

```
serving | llama-server instances | — | no severity band | ✓ | normal |
llama-server@0 | :8080 · GPU 1 | qwen3.6-27b · ctx 131,072 | health ok | ✓ | normal | active |
✓ | normal | default | :8082 · — | qwen3.6-27b · ctx 131,072 | health ok | ✓ | normal | — |
no systemd unit is known for instance `default` (`default.env` in /etc/llama-server),
so its unit state and the cards it serves were not read
```

Three things to read off that, all of them the point:

- the label is **`default`**, bare — not `llama-server@default`;
- `:8082 · —` is the `gpus` em dash, and the sentence after it is **why**, on that row and no
  other (`occurrences(...) === 1`). Without it this row is indistinguishable from a stopped
  service: two em dashes and no reason;
- the port, model, context and health are all still there — everything that did not need a unit
  name was read normally.

**Two instances claiming one card** — `gpus: [0,1]` on `split` and `[0]` on `0`, the array
arriving worst-first:

```
GPU 0 → served by instance 0 | qwen3.6-27b
GPU 1 → served jointly with GPU 0 | gemma-4-31b
```

Card 0 goes to the numbered instance (the `compareInstances` winner, **not** `serving[0]`, which
is `split`); card 1 is claimed by `split` alone and renders the joint form. The reversed array is
asserted **`toBe`** the same markup, so the two orders are the same page and not merely the same
phrase.

**A named identity reaching the card verbatim** — a `split` instance serving card 1 alone:

```
served by instance split | gemma-4-31b
```

⚠ On **card 1**, whose own index would have produced `served by instance 1` — so `String(index)`,
`Number(instance)` and a template unit name all fail here and all survive a numeric fixture.

**A row that fails validation beside two good ones** — three rows on the wire, the middle one
carrying `"port": "nope"`:

```
serving → ["0","split"]
errors  → [{"source":"llama-env",
            "message":"serving[1] was dropped: `port` did not validate"}]
```

…and `host`, `cooling`, `storage` and `safety` are all still on the snapshot, which is the whole
ruling: before this, that body returned `null` and the page went dark. ⚠ The two surviving rows
are deliberately **unlike each other** — one numbered, one named — so a reader that survived by
keeping "the first row" or "the numbered rows" is caught.

**And in a real browser** (`measure-breakpoints.mjs`, measurement 20's own `servingText`):

```
serving llama-server instances ✓normal ✓normal
llama-split :8080 · GPUs 0, 1 gemma-4-31B-it-Q4_K_M.gguf · ctx 262,144 health ok ✓normal active
```

---

## 5. 12b's lesson, carried forward — the two coincidences

12b: *a fixture where the instance id and the card index agree cannot distinguish a right
implementation from a wrong one.* This loop adds the second half: **a NUMERIC identity is the new
coincidence available to be relied on by accident.** `String(instance)`, `Number(instance)`,
`instance === index` and a template unit name all keep working on one.

So the defaults moved:

| fixture | before | now |
|---|---|---|
| `servingSplit` | `instance: 0` | **`instance: 'split'`** — what `split.env` really produces |
| `fixtureSplit` (browser, measurement 20) | `instance: 0` | **`'split'`** |
| `fixtureDeclared` (browser, measurement 19) | numeric | **string** — the redeployed contract |
| `fixtureBox` (browser) | numeric | **kept numeric** — the container running today |
| the GPU-card named-identity test | — | a named instance serving **card 1 alone**, so the card's own index would have produced `served by instance 1` |
| `servingTwoClaimants` (new) | — | listed **worst-first**, so position and rule disagree |
| `servingUnmapped` (new) | — | an identity discovery accepts and the mapping cannot name |

### 5.1 ⚠⚠ Three of this loop's OWN mutations were inert, and the ledger is what said so

Step 8's harness reported `DID NOT BITE` for `12c-OB11b`, `12c-OB12` and `12c-OB13`. All three
were written against the two rulings, all three applied cleanly, and all three left the suite
green — which means the tests beside them were passing for reasons other than their own names.
Each had a different cause and only one was a bad mutation:

| mutation | why it did not bite | what was fixed |
|---|---|---|
| **`12c-OB11b`** — the index fallback reads `serving[]` **positionally** | every fixture in the project is **dense and in order**, so `serving[index]` and `find(s => s.instance === String(index))` agree on all of them. 12b's coincidence, one layer down from the one it fixed | a **sparse** fixture: `0.env` absent, so `serving[]` carries instance `1` alone — positionally that row is index 0, by identity it is card 1's |
| **`12c-OB12`** — a `unit:` condition minted for an identity with no unit | the collector leaves an unmappable instance's `unitState` **`null`**, and O12 drops a condition with no band — so the `unit:` row was absent for a reason that has nothing to do with the mapping, and the test passed either way | the fixture carries `unitState: 'failed'`, reachable over the wire and the only shape that makes the rule observable |
| **`12c-OB13`** — the health label built from a template | **no test asserted the label at all** — the new tests asserted condition **ids**, and `health:split` is the same id under both spellings | a label assertion, on a NAMED instance: `llama-split /health` vs `llama-server@split /health`. For `0` both spellings agree, which is why a numeric fixture cannot discriminate them |

⚠ **The rule this restates, from the harness's own doc:** a failure is not "add a mutation until
it goes green" — it is a question about the test's subject. None of the three mutations was
re-aimed away; three tests were given bodies that match their names. And the shape of two of the
three is the loop's own lesson landing on the loop: **a fixture whose two candidate answers
coincide cannot tell a right implementation from a wrong one**, whether the coinciding pair is an
instance id and a card index, an identity and an array position, or a reading and the rule that
was supposed to suppress it.

### 5.2 ⚠ And one new ⚠ test had no wrong implementation to catch it — the OTHER direction

Step 8's next run came back with the ledger's other complaint: `⚠ it is ANTISYMMETRIC — swapping
the arguments flips the sign` (`lib/units.test.ts`) was reddened by **no mutation at all**. Every
mutation written against `compareInstances` — lexical numbers, names before numbers, two names
tied — happens to **preserve** antisymmetry, so the property had a test and nothing that could
falsify it.

The answer was a mutation rather than dropping the ⚠, because a plausible wrong implementation
exists and is a mistake someone actually makes: `12c-N18`, the two-branch numbered/named check
written once and never mirrored (`return aNumeric ? -1 : 1` → `return -1`), so `compare(a, b)` and
`compare(b, a)` both say *a first* and `Array.sort` gets an order that depends on which pairs it
happens to compare. ⚠ **An unstable comparator is precisely how "first claimant wins" would stop
being deterministic**, which is the property §1.4 exists to guarantee — so this was a real hole in
this loop's own headline claim, and the ledger is the only thing that found it.

### 5.3 ⚠ Two more inert mutations, one duplicate, and one prefix the guard had never seen

Step 10's harness added four more findings of the same family:

- **`12c-SP21`** (the row asks for a `unit:` condition under a **fabricated** unit name) —
  `findDisplayed` finds nothing for `unit:llama-server@default.service` either way, because
  `conditionsFrom` never mints that id, so the guessed key and the correct `undefined` are
  indistinguishable on any fixture whose `displayed` comes from our own projection. Fixed by
  supplying `displayed` **directly** with exactly that fabricated id in it: an identity with no
  unit name must show no unit-derived stale age, and a guessed lookup would show one — a *last
  read* note sourced from a unit that has never existed.
- **`12c-SP22`** (the health condition looked up by something other than the identity) — **nothing
  asserted that the `health:` note reaches the row at all**, so a key built from the port, the
  array position or a stringified anything was equivalent. Fixed with a stale `health:split`
  condition and an assertion that the note lands on the `llama-split` row. ⚠ On a NAMED instance,
  because for `0` the identity and half the plausible wrong keys still coincide.
- **`12c-GP20` was a DUPLICATE** of the existing `12b-GP7` — the same defect, whose anchor had
  merely moved when the identity stopped needing `String()`. **Deleted rather than kept**: two
  mutations for one defect inflate the count and prove nothing twice. `12b-GP7` was re-aimed.
- **The harness's own id-prefix guard** rejected all six `12c-` ids — step 10 is the only harness
  carrying that allow-list, and `12c-` was added to it the same way 12b added `12b-`.

⚠ Both inert mutations were made to bite **before** paying for another full harness run, by
applying each to the source and running that one test file: `exit 1, 1 failed | 36 passed (37)`
for each, then the file restored and the restore verified byte-for-byte.

### 5.4 ⚠⚠ A mutation in ANOTHER harness cannot cover this harness's ⚠ test

Step 10's next run reported one ⚠ test no mutation reddens: *"TWO instances claiming one card: the
card names the LOWER, in either list order"* (`gpu-panel.test.tsx`). The defect it is about
**already had a mutation** — `12c-OB10`, the claimant taken by array position — but that entry
lives in **step 8's** harness and is checked against `observations.test.ts`. Nothing in step 10's
ledger could redden the panel's own assertion, and a ledger only sees its own run.

So step 10 gained `12c-GP21`: the same source change, checked against `GPU_PANEL_TEST`. That is
not a duplicate in the sense §5.3 rejected — **ledger ownership follows the TEST file**, and the
arrangement is exactly the one `10c-GP4` already uses for the join (mutating
`lib/client/observations.ts` from step 10's harness because the GPU card's own test is what
asserts it). Verified to bite before the re-run: `exit 1, 1 failed | 55 passed (56)`.

⚠ **The general shape, worth keeping:** when a rule is stated in one module and asserted in two
test files, one mutation covers one ledger. The second ledger reports the test inert and is
right — the answer is a second entry against the same source, not a weaker ⚠.

⚠ And the browser harness is graded on it: `measurement-harness.test.ts` gains two terms
(`instance: 'split',` and `instance: String(i.instance),`) so that a fixture quietly returning to a
numeric identity is a test failure rather than a page nobody draws — 12b's *"a coincidence removed
in one harness reappears in the next one over"*, pre-empted rather than re-found.

---

## 6. Spec silences — recorded, not decided (invariant 7)

**Q1. §6.4's condition subjects say "instance index" and "a bare integer".** `health:split` is now
reachable and `health:<id>` carries a name. The table at `SPEC.md:1507` reads *"`health` | instance
index — `health:0`"*, and the rule below it says *"Subjects that are indices are written as bare
integers"*. Built as: the subject is the identity **verbatim**, which is a bare integer exactly
when the identity is numeric. **Proposed wording is the owner's**; the code and the tests say what
was built.

**Q2. §6.4 fixes the join key as `llama-server@<i>.service`.** It is now a mapping, and `split` maps
to `llama-split.service`. The same paragraph also says the SERVING panel *"derives the unit name
from the index"* — still true, with "index" reading "identity". Two sentences to amend.

**Q3. ⚠ Which `ErrorSource` a unit-name MISS belongs to.** §3.7's vocabulary is closed and names no
client- or lookup-level source. Built as **`dbus`**, because it blanks exactly `dbus`'s two columns
and no others — but nothing failed *on* the bus; we never asked. The alternative is a nineteenth
`ErrorSource`, which is a contract change a build phase should not make.

**Q4. ⚠ Which `ErrorSource` a WIRE-REFUSED row belongs to.** Same shape, one layer out, and this
one is a **client-minted** entry — the first in the project. Built as **`llama-env`**, because that
is already §3.4's source for *which instances exist*: `discoverInstances`'s own problems are tagged
with it and read *"`X` is not `<instance>.env` and was not treated as an instance"*, which is the
same sentence about a row rather than a filename; and it reaches exactly the SERVING panel. ⚠ Every
other `llama-env` entry is a claim about a file on the box; this one is a claim about the payload.

**Q5. Two instances claiming one card.** §3.4 is silent. 12b recorded it; 12c re-records it with a
stated rule (`compareInstances`, not array position) rather than an inherited one.

**Q6. Which named identities exist at all.** `lib/units.ts` knows `split` because
`SERVING-MODES.md` §2 names the unit. Any other named env file is a legal instance with no unit —
by design, loudly. If more named units are ever added, that table is the one place to extend.

**Q8. ⚠⚠ Is a client/server skew possible on this deployment at all?** §4 says *"server and client
ship in one image, so there is no version skew for an optional key to absorb"* — and 12b's
`LIVE_BOX_SERVING_WIRE` doc rests on the opposite, *"the live box rendering as it does today
across a **client-only deploy**"*. Both cannot be the whole truth, and which one holds decides
whether §3's JSON-number bridge is a compatibility requirement or belt-and-braces. **This phase
built the bridge either way**, because the cost is ten lines and the failure it prevents is every
row of every poll; but the two sentences should be reconciled, and the honest window either way is
a browser tab left open across a redeploy. It is also the question that decides how much ruling 2
actually buys on THIS deployment (§3's closing paragraph) — the ruling stands regardless, but its
motivating scenario may not be reachable here.

**Q7 (carried, NOT introduced by this loop).** `gpu-panel.tsx`'s `indexed` branch builds
`served by instance ${index}` from the **card's** own index even when `servedBy` returned no
instance, so `serving: []` and `serving: null` name instances that may not exist (12b-A10, and
12b's survey called it *"worse than the six"*). It is unchanged here — it is wrong independently of
identities, four existing tests pin the current text, and changing it is a rendering ruling. ⚠ One
new path reaches it: a snapshot whose **only** row was refused now yields `serving: []`, so a
pre-`gpus` server could print `served by instance 0` for a row just dropped. The `errors[]` entry
is on the page; the GPU card's claim is not corrected.

---

## 7. A finding that is not about either ruling — `codeOnly` desynchronises

`lib/source-text.ts`'s `codeOnly` is a small state machine, and **a template literal whose `${…}`
contains another template literal containing escaped backticks flips its string mode permanently**:
the outer literal's CLOSING backtick is read as an OPENING one, and every comment after it in the
file survives comment-stripping. The obvious spelling of the refusal message —

```ts
`${bad.map((f) => `\`${f}\``).join(', ')} did not validate`
```

— did exactly that, and `lib/client/guardrails.test.ts`'s browser-globals guard went red naming
`wire.ts`, for the word `fetch` inside a doc comment it should never have seen.

**The guard caught it, in the loud direction.** The same desync in the other direction hides real
code from a guard, and **six guards in this project read through `codeOnly`**. Fixed here by not
writing the construct (a `concat` helper, with the reason in its doc); `lib/source-text.ts` is
**unchanged** — repairing the scanner is a change with its own blast radius and belongs to a phase
that can measure it. This is HANDOVER §0.9's family: *"`codeOnly` cannot see a regex literal"*, now
with a second member. Reproduction is two lines and is in the helper's doc comment.

---

## 8. Measurements

Every figure below is quoted from the command's own output. **All FIVE harnesses were run
serially, one at a time, never two at once, and none was killed** — the handoff named three; §8.4
is how the other two were found.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/03-collectors-gpu-host/regressions.py          # §8.4
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
python3 pipeline/steps/06-telemetry-route/regressions.py              # §8.4
python3 pipeline/steps/08-client-runtime/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

### 8.1 `pnpm verify`

**exit 0 — 109 files, 3743 tests, `Type Errors no errors`** (was 108 / 3662 at `cb8a3c7`).
`lib/units.test.ts` is the 109th file.

### 8.2 The three harnesses the handoff named

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `05-collectors-serving-storage-safety` | **174** (was 167) | 278 red across 174; **171 ⚠ checked** | **exit 0** |
| `08-client-runtime` | **214** (was 192) | 371 red across 214; **272 ⚠ checked** | **exit 0**, on its THIRD run |
| `10-panels-assembly` | **350** (was 344) | 531 red across 350; **363 ⚠ checked** | **exit 0**, on its FOURTH run |

**1548 mutations across the ten harnesses, 1548 unique ids, zero cross-harness collisions** —
re-derived by importing each `regressions.py` and reading `len(REGRESSIONS)`, never by `grep -c`,
which the id-prefix guard's own literal inflates. 1513 at `cb8a3c7`, so **12c wrote 35**:

| harness | at `cb8a3c7` | now | 12c's |
|---|---|---|---|
| 02 / 03 / 04 / 06 / 07 / 09 / 11 | 66 / 73 / 94 / 63 / 158 / 153 / 203 | unchanged | 0 |
| 05 | 167 | **174** | 7 |
| 08 | 192 | **214** | 22 |
| 10 | 344 | **350** | 6 |

⚠ That total goes stale on the next item that adds one; each harness's own printed line is the
authority.

⚠ **12c/RECONCILE: the mutation COUNTS in this section are also stale** — the test phase added 6
and re-aimed 3, and this phase added 14 and re-aimed 18. Each harness's own printed line is the
authority; `12c-reconciliation.md` §6 carries the current columns.

**Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `ANCHORS MOVED`, zero `DID NOT BITE`,
zero `NO MUTATION REDDENS`, zero unmatchably-short ⚠ names, and every ⚠-marked test reddened** —
grepped from each log rather than read off an exit code.

⚠⚠ **Six harness runs returned a complaint before the set returned green, and every complaint was
the harness working.** This is the part of the measurement worth keeping:

| run | what it said | what it was |
|---|---|---|
| step 05, first | **3 ANCHORS MOVED**, exit **1** ⚠ (recorded here as exit 0 — **see the correction below**) | `05-V6`, `05-V7` and `12b-S11b` anchored on expressions this loop moved (`units.states.get(servingUnitName(i))` became `unitStateFor`; `instances.map(servingUnitName)` became `unitNames`, because the mapping can now miss). All three re-aimed at the same defects |
| step 08, first | **5 ANCHORS MOVED + 3 `DID NOT BITE`** | the same anchor drift in `wire.ts`/`observations.ts`, plus §5.1's three inert mutations of this loop's own |
| step 08, second | **1 `NO MUTATION REDDENS`**, exit 1 | §5.2 — a ⚠ test with no wrong implementation to catch it |
| step 08, third | 214 / 371 / 272, exit **0** | green |
| step 10, first | **`!!!` mutation ids must carry the creating step's prefix** | step 10 is the only harness with a prefix allow-list, and `12c-` was not in it (§5.3) |
| step 10, second | **2 ANCHORS MOVED + 2 `DID NOT BITE`** | `10c-GP4`/`12b-GP7` drift, plus §5.3's two inert mutations and one duplicate |
| step 10, third | **1 `NO MUTATION REDDENS`**, exit 1 | §5.4 — a mutation in another harness cannot cover this one's ⚠ test |
| step 10, fourth | 350 / 531 / 363, exit **0** | green |

⚠⚠ **CORRECTED 2026-09-18 by 12c/TEST §1 and re-confirmed by 12c/RECONCILE — the claim this
paragraph originally made is FALSE, and nobody should re-hunt it.** It read: *"Read the anchor
report, not the exit code. Step 5's first run printed `ANCHORS MOVED` and still exited 0 … a build
that trusted the exit code would have shipped with three mutations silently not running."*

**There is no fail-open in the tooling.** `if moved or bad or ambiguous: return 1` sits **before**
the ledger in all ten harnesses and `sys.exit(main())` is the entry point in all ten — at
`cb8a3c7` as well as now, `git show` confirms it, and 12c's diff touches no exit-path line. The
test phase settled it three ways: by reading the code in all ten, by a probe that forces the
`moved` path in all ten (`exit=1` ten times out of ten), and by reproducing the actual cause —

| how the status was read | reported |
|---|---|
| `python3 regressions.py > file; echo $?` | **1** |
| `python3 regressions.py 2>&1 \| tail -3; echo $?` | **0** ← this row's number |
| same run, `${PIPESTATUS[0]}` | **1** |
| with `set -o pipefail` | **1** |

**The run exited 1; the operator's shell reported the last stage of a pipe.** This repo's own
conventions already warn about it (`AGENTS.md`'s `grep -q` note). Three of 12c/TEST's own runs then
printed `ANCHORS MOVED` and exited 1, live, without being asked.

⚠ The *lesson* the paragraph drew survives its evidence, for a different reason: **read the anchor
report, and never read a harness's exit status through a pipe.** A moved anchor really is a
mutation that did not run — it is simply also an exit 1.

### 8.3 The browser measurements

**`measure-breakpoints.mjs` — exit 0, `102 passed, 0 failed, 0 blocked, 102 total`** (was 102 at
`cb8a3c7`: this loop changed three fixtures and added **no** record, so the count is unchanged and
that is the point — every existing record still holds with the identity as a string).

**`check-density.mjs` — `ALL PASS`**, `measure-arrangements.mjs` exit 0.

The figures the handoff named, from this run:

| claim | measured |
|---|---|
| the panel **0.8 px** from its cap at 1600 | still **0.8 px** — record 17, `closest to its cap: gpu0 by 0.8 px` |
| the tightest of all | record 11 at 1600, `cpu by 0.7 px`; record 10 at 1280, `serving by 1.3 px` |
| §6.1's no-scroll promise, every record | `spare 263 px` at 1280, `228 px` at 1600, `284 px` at 1920 |
| SERVING's own slot | **103.8–104 px** in the per-GPU records, **97 px** in split mode (one row), **76 px** at 1600 |

⚠ **Split mode makes the SERVING panel SHORTER, not taller** — one row instead of two — so the
row-4 budget this loop could have threatened is the one arrangement it relaxes. The
`llama-split` label is also two characters shorter than `llama-server@0`.

⚠ **`measure-breakpoints.mjs` failed on its FIRST run and it was not this loop's change**: the
spawned `next dev` answered its own login `POST /api/session 401` and the harness timed out
waiting for `[data-slot="gpu0"]`, which is the harness's own diagnostic for *the credentials the
shim fakes did not reach it*. Nothing under `lib/auth/` was touched by this loop, three stale
`next-server` processes from earlier sessions were present, and the immediate re-run passed
102/102. **It restored `next-env.d.ts` on both runs** (the harness says so, and `git status`
confirms the file is unmodified). Recorded rather than explained: a login that fails once and
passes on a re-run with no change between them is a flake this phase did not isolate.

### 8.4 ⚠⚠ FIVE harnesses, not three — the handoff's list was short by two

The handoff says *"you touch steps 5, 8 and 10's `LEDGER_FILES`"*. That was checked rather than
taken, by importing every `regressions.py` and intersecting its `LEDGER_FILES` with the test files
`git status` reports as modified. **Two more own a file this loop edited:**

| harness | the file | what 12c did to it |
|---|---|---|
| **03-collectors-gpu-host** | `lib/contract.test.ts` | two assertions — the identity round-trips as `'2'`, and `errors[].instance` as `'1'` |
| **06-telemetry-route** | `lib/telemetry/snapshot.test.ts` | one assertion — *"the instance order is passed through, not re-sorted"* now expects `['1','0']` |

Both were adopted into those ledgers by earlier loops (`lib/contract.test.ts` by 10c-2, step 6
owns the assembly's own tests), and **ledger ownership follows the FILE**. Both were run:

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `03-collectors-gpu-host` | **73** (unchanged) | 115 red across 73; **25 ⚠ checked** | **exit 0**, first run |
| `06-telemetry-route` | **63** (unchanged) | 88 red across 63; **56 ⚠ checked** | **exit 0**, first run |

⚠ Both are **identical to 12b's recorded columns** (73 / 115 / 25 and 63 / 88 / 56), which is the
check that says this loop's two one-line fixture edits changed no coverage in either — the same
test 10h and 12b apply when they re-run a harness they did not mean to disturb.

⚠ The lesson is the cheap one: **do not take a handoff's list of touched ledgers on trust — derive
it.** Two one-line fixture edits are exactly the shape that slips past, because neither is in a
file this loop is "about".

### 8.5 What this phase did NOT run

`pnpm build`, and the harnesses for steps 2, 4, 7, 9 and 11 — the intersection above is empty for
all five. Nothing under `dashboard.sh`, the `Dockerfile`, `.dockerignore` or `systemd/` changed,
so step 11's verdict is untouched; `git status` is the evidence. ⚠ `lib/units.ts` is the one
shared source module, and both harnesses that mutate it (05 and 08) were run.

---

## 9. Files changed

| file | what |
|---|---|
| `lib/types.ts` | `ServingInstance.instance` and `TelemetryError.instance` become strings, with the reason on the field |
| `lib/types.test-d.ts` | the two `Equals<…>` assertions |
| **`lib/units.ts`** | ⚠⚠ the module grew from two constants to a contract: `INSTANCE_ID`, `isNumericInstance`, `isInstanceId`, `compareInstances`, `NAMED_UNITS`, `servingUnitName` (now `string \| null`), `servingUnitLabel` |
| **`lib/units.test.ts`** | ⚠ **new** — 33 tests over the grammar, the mapping and the order |
| `lib/collectors/llama.ts` | `parseInstanceId`, `discoverInstances` over strings and `compareInstances` |
| `lib/collectors/llama.test.ts` | the discovery block rewritten; the acceptance table now has `split.env` in it |
| `lib/collectors/index.ts` | the renamed export |
| `lib/collectors/errors.ts` | `tag(…, instance?: string)` |
| `lib/collectors/dbus.ts` | `unitInstances?: ReadonlyMap<string, string>` |
| `lib/collectors/dbus.test.ts` | a `unitFor` helper that throws on a miss rather than spelling `'null'` into a unit name |
| **`lib/collectors/serving.ts`** | ⚠⚠ the named/unnamed partition, `unitNames`, `unitNameProblems` (the loud miss), `unitStateFor`, `gpusFor` and the env path over strings |
| `lib/collectors/serving.test.ts` | ⚠ four new tests: `split.env` end to end, the loud miss, the neighbour's independence, and the order over three listings |
| **`lib/client/wire.ts`** | ⚠⚠ `instanceId` (string grammar + the number bridge), `optionalInstanceId`, `CheckedRow`, `SERVING_FIELDS`, `quoted`, `WIRE_REFUSAL_SOURCE`, `servingListOf`, and the refusals appended to `errors[]` |
| `lib/client/wire.test.ts` | ⚠ a whole new describe for ruling 2 (14 tests), plus the `gpus[]`-vs-`serving[]` pair |
| `lib/client/observations.ts` | `servedBy`'s fallback and its `compareInstances` claimant; the `unit:` condition is conditional; the health subject and label |
| `lib/client/observations.test.ts` | ⚠ determinism, per-card winner, `health:split`, and the no-`unit:`-row case |
| `lib/contract.test.ts`, `lib/telemetry/snapshot.test.ts` | string identities in three assertions |
| `lib/fixtures.ts` | string identities; `servingSplit` becomes `'split'`; **new** `servingUnmapped`, `servingUnmappedSnapshot`, `servingTwoClaimants` |
| `components/panels/serving-panel.tsx` | the label from `servingUnitLabel`, the conditional `unit:` lookup, the health subject |
| `components/panels/serving-panel.test.tsx` | ⚠ five new tests — the split row, the miss, the miss's message, the miss's surviving readings, the key/join |
| `components/panels/gpu-panel.tsx` | the `declared` label takes the identity verbatim |
| `components/panels/gpu-panel.test.tsx` | ⚠ two new tests — a named identity on the card, and the two-claimant determinism as markup |
| `components/panels/test-support.ts` | `instanceWithNoReadings` over strings |
| `app/dashboard-shell.test.tsx`, `components/panels/cooling-panel.test.tsx`, `safety-panel.test.tsx`, `lib/client/header-status.test.ts` | one fixture literal each |
| `scripts/api.probe.ts` | the row name comes from `servingUnitLabel` |
| `measurement-harness.test.ts` | ⚠ two new graded terms, so a fixture returning to a numeric identity is a failure |
| `pipeline/steps/10-…/measure-breakpoints.mjs` | `fixtureSplit` → `'split'`; `fixtureDeclared` spells the identity as a string; `fixtureCrossPinned` likewise |
| `pipeline/steps/05-…/regressions.py` | +7 (§8), 3 re-aimed |
| `pipeline/steps/08-…/regressions.py` | +19 (§8), 1 re-aimed, `LEDGER_FILES` gains `lib/units.test.ts` |
| `pipeline/steps/10-…/regressions.py` | +6 (§8) |

⚠ `lib/source-text.ts` is deliberately **unchanged** — see §7.
⚠ `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are untouched; `next-env.d.ts`
is byte-identical; nothing is staged or committed.

---

## 10. Left on the box

**Nothing.** This phase did not contact `192.168.4.71` — no SSH, no HTTP, no D-Bus socket opened
and therefore none left open, nothing written, nothing deployed. Every claim about the live box
comes from `LIVE_BOX_SERVING_WIRE` and `lib/collectors/samples.ts`, both frozen in the repo.

**What still needs the box** (added to 12b's three, not replacing them):

1. ⚠⚠ **That `serving-mode.sh split` really leaves `/etc/llama-server/split.env` and an enabled
   `llama-split.service`.** Both were read from that script's SOURCE, never observed after a real
   switch — 12b's box-side item 2, now load-bearing for a mapping rather than for a survey.
2. **That a redeployed container's discovery sees `split.env`** and that the collector's D-Bus
   question for `llama-split.service` is answered — the mapping is exercised here only against a
   scripted bus.
3. **That no OTHER `*.env` file is sitting in `/etc/llama-server/` on the real box.** Anything
   there that is not `0`, `1` or `split` is now a row with a loud entry rather than a silent
   rejection, which is correct but is a visible change an operator meets first on the box.
