# What steps 9 and 10 need that the backend does not provide

**Written 2026-09-07**, after the steps 1–8 sweep, by reading §6.1 and §6.2's panel list
against `lib/`. Every row was checked against the code, not against a handover.

**The headline: the data is all there. What is missing is a thin seam layer** — five small
modules and one rename — plus three sentences the spec still owes. **Nothing here is blocked on
a collector, a contract change, or the box.**

---

## 1. What already exists, so step 9 does not go looking

| §6.2 needs | provided by |
|---|---|
| Every reading on every panel | §4's snapshot — all of it, validated client-side by `wire.ts` |
| Cell colour, undebounced | `lib/severity.ts` — a function for **all fifteen** of §6.3's rows |
| The banner, the log, §9's dot and count | `state.displayed`, `state.events`, `state.severity`, `state.alarms` |
| Traces | `samplesWithin` → `seriesFrom` → `decimateSeries` |
| Hatched gaps | `state.gaps`, with real endpoints |
| Header mode and age | `state.mode`, `ageMs(state, nowMs)`, `formatAge` |
| Cadence / window / pause / refresh | `runtime.setCadence` · `setWindow` · `pause` · `resume` · `refreshNow` |
| Logout | `SESSION_PATH` + `DELETE /api/session` |
| Throttle rendering | `decodeThrottleMask` — code + name per bit, unknown bits at `watch` |
| Uptime, load average, CPU model, ports, PWM state | `formatUptime`, `formatLoadAverage`, `formatCpuModel`, `formatPort`, `formatCh5Pwm` |

⚠ **`formatUptime` and `formatCpuModel` exist** — earlier handovers listed both as owed. §3.2's
four uptime forms including `up <1 min`, and its *"trimmed to `Xeon W-2135` for display"*, are
both implemented.

---

## 2. The gaps, in the order step 9 will hit them

### 2.1 ~~`formatGB` renders ` GB`~~ — **closed 2026-09-07**

**O19 is done.** It turned out to be a **deletion, not a rename**: `GiB` already existed as a
brand for RAM and swap, and `formatGiB` was byte-identical to `formatGB` but for the suffix — so
a literal rename would have collided with the existing type. `GB`, `gb()` and `formatGB` are
gone and disk uses `GiB`.

⚠ **`Filesystem.usedGB`/`totalGB` were WIRE field names**, so this was a §4 contract change:
`wire.ts`'s validator, the fixtures and the assembly tests all moved together. An old server
against this client yields a snapshot the browser refuses, and a failed poll with no field
saying why — which is why the box was redeployed in the same change.

**The dashboard now prints nothing false.** The live box reads `/ 20.7 GiB / 232.6 GiB`,
matching §6.6's own *"`/` is 232.6 GiB, not 249.8 GB"*.

### 2.2 ~~There is no `ErrorSource → panel` selector~~ — **closed 2026-09-07**

`errorsForPanel(snapshot, panel)` sits beside `conditionSource` in `lib/client/observations.ts`,
with a closed `Panel` union — `header · gpu · cpu · memory · cooling · serving · storage ·
safety` — and an exhaustive `switch` over §3.7's eighteen sources.

⚠ **It is a SEPARATE vocabulary from `conditionSource`, deliberately, and the argument is
structural rather than aesthetic.** They are two different joins and neither key set is a subset
of the other: `conditionSource` maps `ConditionKind` + subject to a **label** (`string`, with
the subject interpolated — `gpu 0`) for §6.4's log column; `errorsForPanel` maps `ErrorSource`
to a **closed set of places** for §6.5's em-dash join. Unifying them is not possible without
inventing something: a `string` codomain cannot be switched exhaustively, so a nineteenth source
would map to a silent blank; CPU and MEMORY are two panels in §6.1 and one `'host'` in the log;
and the header is not in §6.1's grid at all.

⚠ **Three sources fan out, and two of them were wrong in this document's first draft:**

| source | panels | why |
|---|---|---|
| **`dbus`** | `cooling` + `serving` + **`safety`** | Filed by two collectors, and `collectSafety` calls `collectUnitStates` for the fan service — so `safety.fanServiceState` is behind it too |
| **`dell-smm`** | `cooling` + **`safety`** | ⚠ `snapshot.ts` assembles `assembledSafety.pwm5Present = cooling.pwm5Present`. The cooling probe stands behind §3.6's `pwm5 present` row — **the most safety-critical row on the panel that earns this dashboard's existence** — and `dell-smm` is the only source that can explain its em dash |
| **`nvidia-smi`** | `gpu` only | Looks like a fan-out because §6.2's COOLING chart draws the GPU temperature trace. §6.5 settles it: when `nvidia-smi` is absent *"no other panel is affected"* |

Both wrong answers are mutations (`O15`, `O17`, `O18`), so the table cannot quietly drift back.

⚠ **What it does NOT do:** it answers *which entries exist for this panel*, not *which em dash
each one belongs to*. §3.7's granularity is per source, so one `dell-smm` entry stands behind
five fan channels and the mode. That is the finest §4 offers, and step 9's rendering has to live
with it. **It also does not close S11/G5** — `errorsForPanel(snapshot, 'cooling')` still returns
nothing for a `fan5` em dash with `pwm5Present: true`, because no collector files one. The
selector makes that gap visible rather than closing it.

### 2.3 ~~The trace incantation is three calls whose order is silently load-bearing~~ — **closed 2026-09-07**

**D5 is done.** `traceFor(state, pick)` sits in `lib/client/series.ts` beside the decimation it
closes over, and is the whole of what a panel calls:

```ts
decimateSeries(seriesFrom(samplesWithin(state.ring, windowMs(state.preferences.windowMinutes)), pick))
```

The width comes from `state.preferences.windowMinutes` and there is **no window parameter** — a
caller that passes its own window is a caller that can disagree with §6.2's selector. It takes
no gaps and returns none (HANDOVER §6 rule 3), and it passes `decimateSeries` its own default,
so the budget stays **600 per series** and §6.2's stacked chart draws up to 1,800 (rule 10).

⚠ **The order IS measurably load-bearing — this was proved, not assumed.** `S9` in step 8's
harness replaces the body with the composition a panel would write if it reached for
`decimateSeries` first (decimate the whole ring, then clip the drawn points to the window), and
**four tests go red**. Measured under it, on §6.7's own worst case — a full 2 h ring at 1 s with
§6.2's default 30-minute window:

| | window → decimate | decimate → window |
|---|---|---|
| points drawn | **600** | **151** |
| widest gap between drawn points | ~6 s | **23 s** |
| a 70 °C excursion inside the window | drawn | **absorbed** by a 24-sample bucket holding a 90 °C sample |

That last row is the failure shape in one reading: not an empty chart, a *slightly wrong* one.

⚠ And note `samplesWithin` takes **no `nowMs`** — it is anchored on the newest sample's `ts`. A
call written from an older note will not compile, which is the safe direction, but do not
re-add the parameter.

### 2.4 No time-of-day or timezone formatter

§6.2's header reads `14:47:31 EDT · 2 s ago`, and §6.6 says *"times are rendered in the
browser's local timezone, with the zone abbreviation shown once in the header."* `formatAge`
covers the second half. **Nothing renders the first.**

It belongs in `lib/format.ts` with every other §6.6 rule — the locale is pinned `en-US` there
once, and a component reaching for `toLocaleTimeString` directly would be the fourth place this
project has had to fix a locale.

### 2.5 `state === null` is *before the first poll*, and it is nine branches or one wrapper

**Composition gap (d).** `useTelemetry()` returns `{ state: null }` until the first client
render. That is not missing data and must not render as `—`. Write the wrapper **once**, in
step 10's assembly, rather than nine `if (state === null)` in nine panels.

### 2.6 The age indicator needs its own interval

**D2.** ⚠ **Do not tick the age off store changes.** Under §6.2's mode rule the store changes
exactly once at the `live → stale` crossing — which is **worse than never**, because a
store-driven tick will *appear* to work in a fixture with a fast cadence and then freeze on a
real failure, which is the one thing the age indicator exists to prevent.

### 2.7 `unknownStanding` is on `RuntimeState` and nothing renders it

**D3.** §6.4: *"An id that matches no kind is reported as unknown. Silence is not acceptable for
a mechanism whose whole job is suppressing alarms."* The client computes the list; SAFETY should
show it. ⚠ **If step 10 decides not to render it, take it off `RuntimeState`** rather than leave
a field implying a mechanism that cannot fire — HANDOVER's do-not-copy #9.

### 2.8 The formatter `parts` variant, if a panel wants a styled unit

**O14.** Formatters return unit-inclusive strings (`26,452 / 32,768 MiB`). If a panel wants the
numeral and the unit styled differently, **ask for a `parts` variant — do not split on
whitespace.** Only needed if the design calls for it.

### 2.9 jsdom, and the first assertion it buys

**D6.** `use-telemetry.ts` is the one file in step 8 with **no test and no mutation** — twelve
lines of React wiring behind the `RuntimeEnv` seam, and the guard's third text exemption. The
first assertion to write is that unmounting the hook calls `stop()`. Invariant 6 applies: record
what jsdom buys and what it costs step 11's image.

---

## 3. Three sentences the spec still owes steps 9 and 10

| # | Gap | Why it blocks a rendering decision |
|---|---|---|
| **S11 / G5** | §6.5's exception to *"an em dash always has an `errors[]` entry behind it"* applies **only when the coloured neighbour is in the same panel and carries a severity**. For channel 5 the neighbour reads `unavailable`, and O13 says `unavailable` is **not** a severity — so the exception does not reach it, and an em dash on `fan5` with `pwm5Present: true` still owes an entry no collector files | The collector's side was closed on 2026-09-07 (a channel missing from the listing now files an entry); what is left is what the **panel** does with an em dash that has no entry and a neighbour that is not coloured |
| **S19** | A *skipped* collector and a *failed* one are indistinguishable to §6.5's rendering rules. The message text carries the distinction — *"the only signal that a source is wedged rather than merely broken"* — and §6.5 has one bucket | Steps 9/10 must choose a sentence, and it is the difference between "reach for the container" and "wait" |
| **S30** | §5.2's sixth row, *Could not reach the dashboard.*, has fixed copy and a fixed submit state but **no tone**. `warn` was implemented (a condition of the *server*, like *session expired*, not a rejected credential) and `MOCK.html`'s state C predates the row | One word |

---

## 4. ⚠ Twelve rules that must not leak into steps 9 and 10

Reproduced from `HANDOVER.md` §6 because this is the document step 9 will actually open. The
first three are the ones a panel undoes by accident.

1. **A cell's colour is not `displayed`** — §6.4: a cell calls `lib/severity.ts` on the current
   reading. Nothing debounced is a cell colour.
2. **Do not read `conditionsFrom` in a panel.** It is un-deduped by design and emits
   `unit:gpu-fan-control.service` **twice**. `state.displayed` is the panel surface.
3. **Do not infer gaps from holes in a series.** Decimation drops a `null` inside a readable
   bucket, so a hole is not evidence of anything. Hatch `state.gaps`.
4. Do not tick the age off store changes (§2.6).
5. Do not render `0 alarms`, and do not render a negative age.
6. Do not put `standing` — or anything off the snapshot — on the server-rendered shell.
7. Do not add a second spelling of `/api/telemetry`, `/login`, `/api/session`, or either unit name.
8. Do not "fix" a red-cell/green-dot disagreement in a panel — it is fixed once, at the reduction.
9. `latestSample` and the chart's last point **are** the same sample, both newest by `ts`.
10. **600 points per series, not per chart** — §6.7 now says so; the stacked chart draws up to 1,800.
11. Do not read `rawSeverity`, compare severities, or hold a band outside `lib/conditions.ts`.
12. Do not treat `state === null` as missing data (§2.5).

**And `MOCK.html` is a reference, never a source.** It predates several spec decisions — S30's
sixth login row is the recorded example — and where it disagrees with `SPEC.md`, the spec wins.


---

# 5. ⚠ The contract-vs-spec alignment, done 2026-09-07

The gaps above are **missing seam helpers**. This section is a different question, asked and
answered separately: **does §4's snapshot carry everything §6.1 and §6.2 say to render, and does
§6.2 place everything §4 carries?** Checked field by field, both directions.

## 5.1 One gap in each direction, and a structural one underneath

**§6.2 → §4 — one item.** The GPU card shows *"the model currently served on that card (joined
from the serving data by instance index)"*, and **nothing in the snapshot expresses that join**.
Settled read-only on the box — `llama-server@.service` carries `Environment=CUDA_VISIBLE_DEVICES=%i`,
so instance N *is* GPU N — and written into §6.2 with what would break it. The dashboard reads
`<i>.env`, which carries no device, so it cannot verify the join and must not pretend to.

**§4 → §6.2 — four fields with nowhere to go:** `gpus[].name`, `gpus[].bus`, `host.cpuModel`,
`host.kernel`. §3.1 insists the first two be carried raw and §3.2 says `cpuModel` is trimmed
*"for display"* — while §6.2's panel list named none of them.

**The structural cause: §6.2 described only panel BODIES.** `MOCK.html` gives every panel a
`panelHead(title, subtitle, chip)` and three subtitles are live telemetry — and §6.2 never
mentioned a subtitle at all. Step 9 building the shell from §6.2 alone would have produced a
panel with no subtitle slot and then found four fields with nowhere to put them.

## 5.2 What §6.2 and §6.6 now say

| decision | |
|---|---|
| **The panel head is `title · subtitle · chip`** | The subtitle is **identity, never measurement** — it answers *what am I looking at*, so it must not move on a poll. GPU takes `<name> · <bus>`, CPU takes `<cpuModel> · <cores>C / <threads>T`, the rest take a fixed source label |
| **The GPU name is the driver's string, raw** | `Tesla PG500-216` — the board code, not the marketing name. No lookup table, so the panel cannot go stale against an unknown card and an unexpected driver report stays visible. ⚠ `MOCK.html` shows `Tesla V100-PCIE-32GB`, **a string this box never produces** |
| **The bus id renders raw, full domain form** | `00000000:17:00.0`, never `17:00.0`. §3.1 forbade trimming on the wire; §6.6 now forbids it in the rendering too, so the figure can be compared against `nvidia-smi` and `lspci` without arithmetic. ⚠ `MOCK.html` renders the short form |
| **The header is exhaustive**, and carries `uptimeSec` | hostname · uptime · dot · time+zone · age · four controls · logout. **No IP address, no kernel.** Four sources described this header and none agreed; §6.1's ASCII now matches §6.2's prose and §3.2's promise |
| **SAFETY rows carry their `errors[]` explanation** | §3.7 already required it — *"an alarm with no explanation beside it is not actionable"* — and the DKMS entry **names the running kernel**, which is where that string belongs |

## 5.3 ⚠ `host.kernel` is carried and rendered nowhere, on purpose

It is the **only** field with that status. Nothing reads it — the DKMS collector reads the
running release itself, and its `errors[]` entry already names it. The justification is §1's own
sentence: long-term trending is *"Prometheus scraping the same JSON endpoint, not a feature
bolted onto this"*, so §4's snapshot is a contract for consumers beyond this UI and provenance
in a raw response is worth one string.

**A second such field is a defect, not a precedent.** Do-not-copy #9 is about exactly this.

## 5.4 ⚠ Two traps `MOCK.html` sets for step 9

The mock is a **reference, never a source**, and it disagrees with the spec in three places now
recorded above. One more is worth stating on its own:

**The mock's header renders `1 warning · 0 alarms`. §9 forbids that string in as many words** —
*"the count is omitted when zero, so the header reads `● all healthy`, never `● 0 alarms`"*.
The mock contains the literal string the spec rules out. Where they disagree, the spec wins.

**No code changed for any of this.** The contract already carried every field raw, and
`formatCpuModel` already implements §3.2's trim, tested. The defect was entirely in what §6.2
failed to say.
