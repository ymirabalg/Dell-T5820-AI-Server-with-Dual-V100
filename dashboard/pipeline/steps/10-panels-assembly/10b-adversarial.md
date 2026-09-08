# Step 10b — the nine panel bodies (ADVERSARIAL phase)

**Written by the adversarial agent, 2026-09-08.** Branch `dashboard-frontend`, working dir
`dashboard/`. Nothing was fixed. Every experiment was reverted; `git status --short` at the end
is byte-for-byte the state I was handed, and `pnpm verify` re-run afterwards: **exit 0, 91 files,
2520 tests, no type errors.**

Method: read all nine panels, their tests, `condition-lookup.ts` / `panel-chart.ts` /
`event-sentence.ts` / `status-row.ts`, the 30 `10b-` mutations, `lib/client/observations.ts`,
`lib/severity.ts`, `lib/fixtures.ts` and `app/dashboard-shell.tsx` / `components/alarm-banner.tsx`;
then rendered ~20 fixture scenarios through `renderToStaticMarkup` and ran **9 hand-written
mutations** against the real suite. Each finding below says **EXECUTED** (I ran it and read the
output) or **REASONED**.

---

## 0. The answer to the handoff's highest-value question, stated first

> *For COOLING, SERVING, SAFETY, SESSION EVENT LOG and the ninth: does each have a fixture
> isolating a null field from a zero reading of that same field?*

| panel | verdict |
|---|---|
| **COOLING** | **NO — and it is the worst case on the page.** The fan5 fixture pair exists but its null-side assertion is inert (F1a); fan1–4 have **no null fixture at all** (F1b). Both proven by mutation |
| **SERVING** | **N/A, cleanly.** No §6.3-banded numeric reading. `port`/`ctx` are identity, not sensors; a `port(0)`/`ctx 0` render was checked and is honest (`:0 · x · ctx 0`). The `null`-vs-`[]` enumeration pair *is* rigorous (`10b-SV2`) |
| **SAFETY** | **YES.** The three-valued checks are the boolean analogue and are tested `true`/`false`/`null` distinctly with separate fixtures. `fanServiceState` is a string, not a number |
| **SESSION EVENT LOG** | **N/A, cleanly.** No reading of its own; the chip is the entry's carried severity or the explicit no-band state, both tested |
| **the ninth (GPU 1)** | Same component as GPU 0. `tempC` is covered by `10b-GP2`; **every other reading is not** (F1c) |

And the sweep the test phase reported as *fixed* in four panels is **fixed on one field each**:
GPU power, CPU utilisation, MEMORY swap and STORAGE `eno1 rx` each still take a
`?? <zero-of-unit>` mutation with the whole suite green (F1c). So the honest count today is
**invariant 1 is guarded on 5 fields out of ~30 readable fields across the nine panels**, and the
one panel `PLAN.md` uses as invariant 1's own example is guarded on none of them.

---

## 1. F1 — COOLING conflates `null` with `0` on **every fan row**, undetected. EXECUTED

`PLAN.md` invariant 1: *"a fan reading 0 is a dead fan; a fan reading nothing is a driver that did
not load. Conflating them is the single worst bug this project can ship."*

### F1a — the fan5 headline. The null-side assertion is satisfied by a chip glyph, not the value

**Mutation applied** (`cooling-panel.tsx:105`):

```diff
-value={formatRpm(cooling?.fan5Rpm ?? null)}
+value={formatRpm(cooling?.fan5Rpm ?? rpm(0))}
```

**Result: `components/panels/cooling-panel.test.tsx` — 11 passed, 11 total. Green.**

The `⚠ invariant 1 — fan5 reading 0 RPM alarms; fan5 reading null does not` test does have both
fixtures. Its null-side check is:

```ts
expect(unreadHtml).toContain('—');
expect(unreadHtml.slice(0, unreadHtml.indexOf('</header>'))).not.toContain('data-severity="alarm"');
```

Both survive the mutation. `toContain('—')` is **document-wide**, and `Chip`'s own no-band glyph is
literally `—` (`<span aria-hidden="true" class="_glyph">—</span>`, rendered whenever
`severity={null}`), so the assertion is satisfied by the chip beside the row no matter what the
value cell says. The head-chip check also survives, because `fan5Severity` is computed from
`severityFan5(cooling)` — the *object*, not the mutated expression — so it is still `null`.

**Concrete failure this ships:** `dell_smm` loads but `fan5_input` cannot be read
(`pwm5Present: true`, `fan5Rpm: null` — a live fixture, `pwm5Unreadable`'s shape). The headline
reads **`fan 5   0 RPM`** with a no-band chip. An operator looking at a box with two passively
cooled 250 W cards reads *the GPU fan has stopped*; the truth is *nobody read the tach*. This is
the exact sentence in invariant 1, in the panel invariant 1 names.

### F1b — fan1–4 have no null fixture at all

**Mutation applied** (`cooling-panel.tsx:157-158`, the fan 2 row, value **and** severity):

```diff
-value={formatRpm(cooling?.fan2Rpm ?? null)}
-severity={severityFanStopped(cooling?.fan2Rpm ?? null)}
+value={formatRpm(cooling?.fan2Rpm ?? rpm(0))}
+severity={severityFanStopped(cooling?.fan2Rpm ?? rpm(0))}
```

**Result: all of `components/panels` — 105 passed, 105 total. Green.** (Confirmed by grep that
`cooling-panel.tsx` has exactly one importer outside its own test.)

No fixture anywhere sets `fan2Rpm: null` with the rest of the snapshot present. The only null-side
coverage is `emptyState()` (`cooling === null`), which takes a *different* branch and still leaves
an `—` in the document via the mode row. Under the mutation, a chassis fan whose tach is
unreadable reads **`fan 2  0 RPM` with a red alarm chip** — a fabricated alarm, the mirror failure.

### F1c — the four panels the test phase "fixed" are fixed on one field each

**Four mutations applied simultaneously**, one per panel, each the same `?? <zero-of-its-unit>`
shape the test phase used:

| panel | field mutated | rendered under mutation |
|---|---|---|
| GPU | `gpu?.powerW ?? watts(0)` | `0.0 W of 250.0 W cap` |
| CPU | `host?.cpuPct ?? percent(0)` | `0.0 %` |
| MEMORY | `host?.swapUsedGiB ?? gib(0)` | `0.00 GiB` |
| STORAGE & NETWORK | `net.rxBytesPerSec ?? bytesPerSecond(0)` | `0 KB/s` |

**Result: 105 passed, 105 total. Green.** GPU `utilPct`/`smClockMHz`/`memUsedMiB`, CPU `loadAvg`,
MEMORY `memTotalGiB`, STORAGE `home.usedGiB`/`txBytesPerSec` are the same shape and untested on
the null side for the same reason.

### F1d — the notes claim coverage that does not exist

`10b-build.md` §2 (COOLING): *"⚠ Invariant 1, on fan5 and on fan1–4: 0 alarms, null renders `—`
with no colour. **Backed by `10b-CO2`/`10b-CO3`**."* `10b-test.md` §3: *"COOLING — `10b-CO2`/
`10b-CO3` are exactly this, on `fan5` and `fan1`–`4`, each with a same-`describe`-block
null-vs-zero pair."*

Both mutations, read from `regressions.py`, are `severity={…} → severity={null}` — they delete a
*band*, which is the **zero** side. Neither touches a `?? null` fallback. The COOLING panel is
recorded as the one that already did this rigorously, and it is the one that does not.

---

## 2. F2 — SERVING prints one instance's failure beside another instance's healthy row. EXECUTED

`serving-panel.tsx:83,65`:

```ts
const errorMessage = servingErrors[0]?.message ?? null;   // first entry, any serving source
…
note={age ?? errorMessage}                                 // on EVERY instance row
```

**Rendered from the shipped fixture `servingPopulated`** (instance 0 `active`/`ok`, instance 1
`failed`/`unreachable`, one `llama-health` entry):

```html
<span class="_label">llama-server@0</span>
<span class="_value">:8080 · qwen3.6-27b · ctx 131,072 · health ok</span>
<span class="_note">connect ECONNREFUSED 127.0.0.1:8081</span>   <!-- instance 1's port -->
```

Second render, two errors (`dbus` first, `llama-health` second) — **both** rows print
`dbus: NoSuchUnit llama-server@1.service`, and the `llama-health` message that actually explains
instance 1's `unreachable` is **never rendered at all**.

§6.5: *"An `llama-server` instance is down → its row shows the unit state and **the reason**; the
other instance is unaffected."* §3.7/§6.2: the explanation belongs *beside the row it explains*.
Here the reason is shown beside the wrong row, names the wrong port, and the right one is dropped.
Nothing in `serving-panel.test.tsx` asserts anything about which row carries which note; `10b-SV3`
only checks that `age` wins over `errorMessage`.

A per-instance filter is available and is what SAFETY already does: `llama-health`/`llama-env`
messages could be matched on the instance's own port/unit name, or at minimum an entry naming
`llama-server@N` should not attach to row `M ≠ N`.

---

## 3. F3 — a stale row silently discards the `errors[]` explanation, exactly when there is one. EXECUTED

Four rows are written `note={<staleAge> ?? <errorsMessage>}` (`cooling-panel.tsx:107,116`,
`safety-panel.tsx:71,78,85,96`, `storage-network-panel.tsx:64`, `serving-panel.tsx:65`). The
`??` makes the age **displace** the explanation, and the two co-occur precisely in the case that
matters: a source stops answering, so `errors[]` gains an entry *and* the conditions it fed go
stale.

**Rendered**: COOLING with `errors: [{source:'dell-smm', message:'no hwmon named dell_smm'}]` and
the `fan5_absolute` condition `stale: true`:

```html
<span class="_label">fan 5</span>
<span class="_value">—</span>
<span class="_noteWatch">last read 6:12 ago</span>
```

`no hwmon named dell_smm` appears **nowhere on the panel**. The identical snapshot without the
stale condition renders the message correctly (verified). So the panel is most silent about the
cause at the moment the cause exists — §3.7's *"an alarm with no explanation beside it is not
actionable"*, inverted by an operator-precedence choice. Both facts fit on the row (`Row`/
`StatusRow` already tolerate a long note with `flex-basis: 100%`).

`10b-CO4`/`10b-SP4`/`10b-SN2`/`10b-SV3` all mutate this expression to `note={<error>}` — i.e. they
guard that the age is *not* dropped, and are blind to the message being dropped.

---

## 4. F4 — a stale row blanks the value §6.5 says must stand, and disagrees with the banner. EXECUTED

§6.5, quoted in full: *"**⚠ A stale condition shows its LAST VALUE, unchanged — not an em dash.**
§6.6's law that `null` renders `—` governs a reading that is *absent*; a stale condition's reading
is not absent, it is **old**, and blanking it would throw away the only number an operator has."*

Every panel row renders the **current snapshot reading**, so a stale condition renders `—`
(rendered above: `fan 5  —  last read 6:12 ago`). `DisplayedCondition.value` — the last confirmed
value, e.g. `'4,308 RPM'` — is in `state.displayed`, is what `condition-lookup.ts` already looks
up, and is unused.

`components/alarm-banner.tsx:71,81` renders `lead.value` beside `lead.age`, fed from
`app/dashboard-shell.tsx:104` (`value: c.value`). So for one stale condition in one frame the
banner says **`fan 5 4,308 RPM · last read 6:12 ago`** and the COOLING row says **`fan 5 — · last
read 6:12 ago`**. S-B's whole point was that the banner and the row use the same words; they now
use the same words around two different numbers.

Scope note for reconcile: `condition-lookup.ts` returns only the age today, so this is a
one-function change in 10b's own file plus a decision about which rows opt in (only the four
stale-capable ones can reach it).

---

## 5. F5 — §6.5's em-dash → `errors[]` join is rendered on 4 panels of 9, and on some rows only. EXECUTED

Answering the handoff's §3.4 directly, plus what the sweep turned up around it. Rendered each case:

| panel | calls `errorsForPanel`? | what actually happens |
|---|---|---|
| **CPU** | **never** | `coretemp` fails → temperature `—`, trace empty, **no message anywhere**. Same for `proc-stat`, `proc-loadavg`, `proc-cpuinfo` (which `observations.ts` routes here *specifically* so the subtitle's `—` is explained) |
| **MEMORY** | **never** | `proc-meminfo` fails → `RAM  — / —`, **no message anywhere** |
| **STORAGE & NETWORK** | link row only | `statvfs` fails → `/` and `/home` both read `— / —` with **no message**; `proc-net-dev` fails → rx/tx `—` with **no message**. Only `net-operstate` is rendered |
| **GPU** | takeover branch only | a card **enumerated** whose readings are `null` plus an `nvidia-smi` entry → four em dashes, **no message**. `errorsForPanel` is only reachable when `gpus === null` |
| **COOLING** | fan5 + fan service | one `dell-smm` entry attaches to **fan 5 only**. `nothingReadable` rendered: fan 1–4 and the mode all read `—` with nothing beside them, the message sits on fan 5 |
| **SERVING** | yes, but see F2 | |
| **SAFETY** | all four rows | correct, and the only panel that does this fully |

Eight of the eighteen `ErrorSource` members (`coretemp`, `proc-stat`, `proc-loadavg`,
`proc-cpuinfo`, `proc-meminfo`, `statvfs`, `proc-net-dev`, and `nvidia-smi` outside the takeover)
have **no rendering path to the screen at all**. §6.5's row is *"its `errors` entry is available"*
and `errorsForPanel`'s doc calls itself "the *is available* half", so a reconciler could rule this
by design — but §6.2 says the DKMS entry is *"where that string belongs"* and §3.7 says an
unexplained alarm is not actionable, and `10b-build.md` records **no decision** on why CPU and
MEMORY differ from SAFETY. Invariant 7 says that is a gap to record, and it was not recorded.

On the sub-question *"does COOLING repeat the sentence five times, attach it once, or drop it?"* —
**attach once, to fan 5**, which is defensible; but `mode` is the neighbour S11/G5 relies on and
fan 1–4 are simply silent.

---

## 6. F6 — 10b-CO5 guards the mutation's literal, not the ruling. EXECUTED

The handoff asks whether `10b-CO5` guards the S11/G5 *ruling* or the current code shape. Neither —
it guards three substrings.

**Mutation applied** (a fallback sentence with different words):

```diff
-note={fan5Age ?? dellSmmError}
+note={fan5Age ?? dellSmmError ?? 'channel 5 is not reporting a tach'}
```

**Result: `cooling-panel.test.tsx` — 11 passed. Green.** The ⚠ test asserts
`not.toContain('no reading')` / `'no pwm5'` / `'EACCES'`, which are the words `10b-CO5` happens to
inject. The ruling is *no fallback sentence written in the panel, at all*. A guard that expresses
the ruling would assert the fan5 row's shape — e.g. that the row contains no note element when
`fan5Age` and `dellSmmError` are both `null` — and would then hold against any invented wording.

---

## 7. F7 — GPU 1 prints a served model for a card the enumeration says is not there. EXECUTED

`servingFor()` joins on `s.instance === index` with **no check that the card exists**. Rendered
`gpus: [card0]`, `serving: [instance0, instance1{model:'gemma-4-12b', active, ok}]`, mounted at
`panelId="gpu1" index={1}`:

```
GPU 1        subtitle: — · —        chip: no-band
temperature —   power — of — cap   VRAM —   utilisation —   SM clock —
served by instance 1     gemma-4-12b
```

Every reading is an em dash and the panel still asserts a model. §6.2 names this failure mode by
name — *"getting it wrong prints the wrong model on a card rather than failing visibly"* — and the
existing test (`a card with no matching instance…`) only exercises the **inverse** direction, with
`servingInstances[1].model === null`, so it cannot see this.

**Second half, same experiment:** `gpus: [card0]` (GPU 1 absent from a *successfully read*
enumeration) renders **byte-identically** to `gpus: [card0, card1-with-every-field-null]` (GPU 1
present, every reading failed) — `a === b` was `true`. Those are the two facts §3.1/§9 spend
paragraphs keeping apart at the enumeration level (`retired` vs `stale`), collapsed at the panel.
§6.2/§6.5 are silent on what a panel renders for a card missing from a non-null `gpus[]` —
invariant 7, and it is unrecorded.

---

## 8. F8 — before the first poll the promoted GPU/COOLING chart draws a fictitious axis. EXECUTED

`panel-chart.ts`'s own doc: *"Before the first accepted poll … this returns a domain ending at
epoch 0. **That is never wrong to look at**: `traceFor` returns no points for an empty ring either,
so a chart fed this domain draws **an empty axis** rather than a mispositioned one."*

Rendered `GpuPanel` with `emptyState()`. The `Sparkline` behaves as claimed
(`data-empty="true"`, *"no readings in the selected window"*). The `StackedTimeSeriesChart` does
not — its tick labels are:

```
["0 °C","1 °C","18:30:00","18:37:30","18:45:00","18:52:30","19:00:00"]
```

i.e. a fully drawn, plausible-looking half-hour window ending at **epoch 0 rendered in the
browser's local zone** (1969-12-31 19:00 EST here), with a fabricated 0–1 °C y-scale. COOLING's
chart is identical plus `"0 RPM","1 RPM"`. On a ≥1600px wall panel this is the first thing on
screen after a reload, and it looks like real data from a real half hour.

The documented claim is false as rendered, which is the project's own *"writing the config is not
evidence it took"* pattern. Cheapest honest fix is in 10b's file scope: don't mount the chart when
`newestSample(state.ring) === null`, or give the primitive the same empty state the sparkline has.

---

## 9. F9 — the S-B wording drift is real, undetected, and cheap to guard. EXECUTED

The test phase recorded that nothing keeps `condition-lookup.ts` and `app/dashboard-shell.tsx` in
sync. I ran the drift a maintainer would actually run: changed `condition-lookup.ts`'s template to
`last seen …` **and** updated the six panel-side tests that assert the literal — exactly the diff
someone rewording S-B inside 10b's file scope would produce.

**Result: the entire suite — 2483 passed, 0 failed** (typecheck disabled; 2520 with it), with the
panels saying **`last seen 6:12 ago`** and the banner still saying **`last read 6:12 ago`**, live,
on the same page, for the same condition. Reverted.

A guard is warranted and is one line: export the sentence from one module, or add a test that
asserts `condition-lookup.ts`'s output equals `dashboard-shell.tsx`'s `staleAgeText` for one
input. It is a 10c item only because `app/` is out of 10b's scope; the *finding* is 10b's, since
10b is the file that created the second copy.

---

## 10. F10 — panels read the FIRST `errors[]` entry per source; the event log reads the LAST. EXECUTED

- `cooling-panel.tsx:92-93`, `safety-panel.tsx:60`, `storage-network-panel.tsx:40`:
  `.find((e) => e.source === …)` → **first**.
- `lib/client/events.ts:400`: `for (const error of errors) present.set(error.source, error.message);`
  → a `Map` set, so **last** wins.

`errorsForPanel`'s own doc already names the hazard (*"`events.ts` reads the **last** message per
source — so a panel that re-sorted would show a different D-Bus sentence than the event log"*) —
and the panels do not re-sort, they truncate, which produces the same divergence.

**Multiple entries per source is routine, not hypothetical.** `tag(source, messages)` maps an
array; `collectStorage` concatenates root's and home's `statvfs` entries today
(`lib/collectors/storage.ts:114`), and `collectCooling` accumulates a `problems: string[]` into
`tag('dell-smm', problems)` (`cooling.ts:158-255`).

**Rendered:** COOLING with `errors: [{dell-smm,'FIRST…'},{dell-smm,'LAST…'}]` → panel shows
`FIRST`, log would show `LAST`. Two different sentences for one fault in one session, which is the
`since 15:10:40` / `since 15:10:40 EDT` failure (HANDOVER §0.3) in a new place.

---

## 11. F11 — MEMORY, STORAGE and COOLING show a green ✓ while their primary reading is `—`. EXECUTED

`worstSeverity` skips `null`s, so a panel chip built from a mixture reports the healthy members
only:

| panel | state rendered | head chip |
|---|---|---|
| MEMORY | `RAM — / —`, `swap 0.00 GiB` | **`normal` ✓** (`severityMemory` = worst(ram=null, swap=normal)) |
| STORAGE | `/ — / —`, `/home — / —`, link `up` | **`normal` ✓** |
| COOLING | `fan 5 —`, mode `unavailable`, service `active` | **`normal` ✓** |
| CPU / GPU | temperature `—` | `none` (no-band) — the honest one |

§9's principle is *"a dashboard that goes green because it stopped being able to look is the one
failure this row must never cause."* That sentence is written about the aggregate, and each panel's
chip choice here is 10b's (`severityMemory(host)` vs `severityCpuTemp` vs a `worstSeverity` of
three). The inconsistency across panels is not recorded anywhere, and the visual result on a wall
panel is a green tick over two em dashes. Flagging for adjudication rather than asserting a bug:
the alternative (a panel whose chip goes no-band whenever any input is unreadable) has its own
cost, and this may be a spec question rather than a defect.

---

## 12. F12 — `GpuPanel`'s `index` and `panelId` are independent, and nothing ties them. REASONED

`panel-props.ts` exists precisely so *"the one fact a panel cannot derive for itself (§2.4/L4:
which instance am I)"* is typed. `GpuPanelProps` then adds a **second** copy of that fact, and
`<GpuPanel panelId="gpu1" index={0} />` typechecks and renders GPU 0's card, titled `GPU 0`, into
the `gpu1` grid slot — with correct, unique SVG ids, so nothing collides and nothing goes red. The
wiring diff `10b-build.md` §8 describes for 10c is exactly where this is mis-typed.

`index` is derivable (`panelId === 'gpu0' ? 0 : 1`), or a `PanelId`-keyed map would make the pair
unrepresentable. Cost of the finding is one line; cost of the bug is "GPU 1's card under GPU 0's
heading", which reads as a wiring accident and not as a bug.

---

## 13. F13 — the session log's accessible name stutters. EXECUTED

`session-event-log-panel.tsx:43`: `aria-label={`${panelId} session event log`}` renders
**`session-event-log session event log`** — the slot id, hyphens and all, prefixed to a name that
already says the same thing. Its own test asserts that exact string, so it is locked in.
`panelId` is the **SVG-id namespace** (`panel-props.ts`); it is not a display string, and no other
panel puts it in user-visible text. A screen-reader user hears the stutter; `Sparkline`'s module
doc is explicit that an accessible name naming every instance identically is the problem to avoid,
which this over-corrects into noise. Low severity, one-line fix, but it is copy nobody chose.

---

## 14. F14 — low confidence, recorded for completeness

- **SERVING composes one row value from four formatter outputs**, so an identity-only instance
  renders `:— · — · ctx — · health —` (rendered). `Row`'s contract is *"pre-formatted by
  `lib/format.ts`, rendered verbatim"*; `:${formatPort(null)}` prefixes a punctuation mark onto an
  em dash. Not a §6.6 violation I can point at, but it is the closest thing in the nine panels to
  hand-composing a unit string, and O14 says do not split a formatter's output — the mirror
  operation is unaddressed.
- **At 1280–1599px (the design target) the GPU and CPU traces cannot hatch a gap.** `Sparkline`
  takes no `gaps` prop by design and breaks its polyline on `null`s; only the ≥1600px promoted
  chart receives `state.gaps`. So HANDOVER's *"hatch `state.gaps`, never a hole in a series"* is
  satisfied only above 1600px. This is step 9's primitive, not 10b's code — but the choice to use
  `Sparkline` at the design breakpoint is 10b's, and it is not recorded.
- **`describeEvent`'s `'stale'` branch** interpolates `detail` unguarded (`… stale — last value
  ${detail}`), unlike `'source-lost'`/`'mode-stale'` which guard `detail === ''`. If the log ever
  emits a stale entry with an empty detail the line ends `last value ` with a trailing space. I
  could not construct that from `events.ts`, so this is a shape observation, not a live defect.

---

## What I attacked and could NOT break

Spend no reconcile budget here; each was checked against rendered output or executed code, not
against the build notes.

1. **SVG id collisions and duplicate DOM ids across the whole page.** Rendered **all nine panels
   together** and extracted every `id="…"`: exactly three — `gpu0-temp-chart-hatch`,
   `gpu1-temp-chart-hatch`, `cooling-chart-hatch`. **Zero duplicates.** `Sparkline` mints no ids at
   all; `StackedTimeSeriesChart` mints exactly one (`${id}-hatch`) and both call sites prefix
   `panelId`. `Meter`, `Chip`, `Row`, `StatusRow`, `PanelShell` mint none. The `panelId` namespace
   **is** used everywhere an id is minted.
2. **Duplicate accessible names from the ≥1600px promotion.** Both the `Sparkline` and the promoted
   chart carry `GPU 0 temperature over the selected window` and both are in the DOM — but
   `gpu-panel.module.css` toggles them with `display: none` in both directions, which removes the
   hidden one from the accessibility tree. Not a defect.
3. **CSS module class collisions.** Every panel stylesheet is a `.module.css` with hashed class
   names (`_row_427765` vs `_row_7cae34` in one render); collision is not expressible.
4. **Invariant 4.** `grep` over `components/panels/` for `pwm._enable` and `fan._target`: **zero
   hits** outside a comment saying so. Only `formatRpm(fanN_input)` is read.
5. **Invariant 3.** The mode row carries no `severity` prop; `EC auto` and `unavailable` render as
   identity text. Confirmed in three renders and backed by `10b-CO1`.
6. **Decision 13.** No token rate anywhere; `10b-SV1`'s negative guard is real.
7. **The GPU name/bus traps.** `formatText` verbatim; the bus test checks the character *preceding*
   the id, so a trimming bug cannot hide inside a substring match. Genuinely well done.
8. **Throttle gating.** `decode.notable` only; `0x0` and `0x4` render no row at all (not a `normal`
   row), verified against three fixtures.
9. **`serving: null` vs `serving: []`.** Different text, different markup, tested, `10b-SV2` real.
10. **`gpus: null` takeover and its panel-scoped error filter.** Rendered: an `nvidia-smi` entry
    shows, a `dell-smm` entry does not.
11. **Purity / clocks / entropy.** `grep` over `components/panels/`: no `useState`/`useEffect`/
    `useMemo`/`useRef`, no `Date.now()`, no `Math.random`, no timers. Every panel is a pure
    `renderToStaticMarkup` of static fixtures, so no mutation here can redden probabilistically.
12. **`describeEvent` totality.** Exhaustive `switch` over `LogEntryKind` with
    `noFallthroughCasesInSwitch`; `to` is non-nullable on `LogEntry`, so no `null` can leak into a
    sentence. Six branches, six mutations, one test each.
13. **SAFETY's four rows.** The only panel that renders every row's own source-matched explanation,
    with `unknownStanding` correctly at `severity={null}` and out of the head chip. The `rowContaining`
    scoping fix the build made is correct and is what makes `10b-SP2` bite.
14. **Session log ordering and cap.** Renders `state.events.entries` in place, no re-sort, no second
    cap, `key={entry.seq}`. `10b-SE1` is real.
15. **The escaped-quote scanner question.** Not re-litigated, per the handoff.

**Tree state on exit:** `git status --short` is identical to the state I was handed
(`M SPEC.md`, `M pipeline/steps/10-panels-assembly/regressions.py`, plus the untracked
`components/panels/` and the pipeline notes). `pnpm verify` → **exit 0, 91 files, 2520 tests, no
type errors.** No dev server was started; no `.env` was written.
