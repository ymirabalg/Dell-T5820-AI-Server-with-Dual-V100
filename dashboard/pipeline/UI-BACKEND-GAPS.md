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

### 2.1 ⚠ `formatGB` renders ` GB` and §6.6 says **GiB** — the only wrong figure on screen

**O19**, and it is the only item here that makes the dashboard *print something false*. The
value is already a GiB (`1024³`, matching `df -h`, measured in step 5); only the brand, the
field names and the suffix say GB. **98 occurrences across 10 files**: the `GB` brand and `gb()`,
`Filesystem.usedGB`/`totalGB`, `formatGB`.

Do it **first and mechanically**, before any component reads those names, and in one commit —
it is a rename, it is compiler-checked end to end, and it gets more expensive with every file
that touches storage.

### 2.2 There is no `ErrorSource → panel` selector

**D4.** §6.5 requires every em dash to be traceable to the `errors[]` entry that explains it, and
§6.5's one exception depends on *which panel* a neighbour is in. `conditionSource` maps
`ConditionKind → panel` (`cooling`, `host`, `safety`, `serving`, `storage`, `gpu N`) and there is
**no equivalent for `ErrorSource`** — verified: nothing outside `types.ts`, `wire.ts` and
`events.ts` mentions the type at all.

Eighteen sources, closed vocabulary, so it is one exhaustive `switch`. **Write it once, beside
`conditionSource`** — a second mapping of a join that already exists is second on HANDOVER's
do-not-copy list, and both step 5's and step 6's reviews flagged it.

### 2.3 The trace incantation is three calls whose order is silently load-bearing

**D5.** `samplesWithin(ring, windowMs)` → `seriesFrom(samples, pick)` → `decimateSeries(points)`.
Decimating *before* windowing spends the 600-point budget on data that is not drawn and produces
a chart that is **subtly wrong rather than obviously broken** — the worst failure shape this
project has. Every panel with a trace repeats it: two GPU cards, CPU, and COOLING's stacked
chart.

**One `traceFor(state, pick)`.** ⚠ And note `samplesWithin` takes **no `nowMs`** — it is anchored
on the newest sample's `ts`. A call written from an older note will not compile, which is the
safe direction, but do not re-add the parameter.

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
