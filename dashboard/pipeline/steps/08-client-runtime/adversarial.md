# Step 8 — client runtime · **adversarial**

Nothing was fixed and no source file was edited. Five temporary probe files
(`zz-adv-probe*.test.ts`) were written at the project root, run, and deleted.

**Revert evidence.** `git status --short` cannot help here — `dashboard/` is *untracked*, so
git collapses the whole tree to `?? ./` and would not show a mutated source file at all.
**That is itself worth knowing: the build's operational warning "check `git status` before you
trust any measurement" does not work in this repo yet.** So an md5 manifest of all 119 files
under `lib/`, `app/` and `proxy.ts` was taken before anything ran and diffed after every phase:

| after | result |
|---|---|
| the four probe batches | `TREE IDENTICAL TO BASELINE` |
| `regressions.py` (128 mutations) | `TREE IDENTICAL TO BASELINE` |
| the fifth probe batch | `TREE IDENTICAL TO BASELINE` |

`pnpm verify` → **`Test Files 55 passed · Tests 1865 passed · Type Errors no errors`, exit 0**,
before and after. `python3 pipeline/steps/08-client-runtime/regressions.py` → exit 0,
`128/128`, ledger clean, `0` occurrences of `DID NOT BITE` or `ANCHOR NOT FOUND`. Harnesses and
`verify` were run strictly serially.

---

## Summary

Nine findings I would not ship, ranked. Three are §6.7 violations with a measured wrong output;
one is a §9 violation that turns the header **green** while a card is at 90 °C. The `ts` dedupe
itself — the rule HANDOVER puts first — is **correct and correctly tested**; every attack on it
landed on the *edges* §6.7 does not cover, and the build's S36 entry names only the least
damaging of three consequences.

| # | Severity | One line |
|---|---|---|
| **F1** | **high** | A poll that lands after the tab is hidden **erases the hidden gap**; an hour-long hidden span is then a straight interpolated line |
| **F2** | **high** | Same erasure for `pause()`, and for `refreshNow()` while paused |
| **F3** | **high** | A GPU that stops being enumerated takes its alarm off the dot with **no log line**: 90 °C → `nvidia-smi` fails → header goes green |
| **F4** | **high** | S36: a backwards server clock freezes the dashboard, **green**, for the size of the step, and `getState()` never changes so nothing re-renders |
| **F5** | med-high | `latestSample()` is newest-*by-arrival*: one backwards `ts` makes every cell and the dot render the older snapshot while the chart draws the newer one last |
| **F6** | med-high | COOLING and SAFETY may disagree about `gpu-fan-control.service`; the id dedupe silently keeps COOLING's verdict and discards SAFETY's alarm |
| **F7** | medium | §6.4's 10 s debounce **counts un-sampled time**: one sample after an hour-long gap confirms a band and dates it to before the gap |
| **F8** | medium | S42: `samplesWithin` compares a **server** `ts` to a **browser** `now` — 31 min of skew with a 30 min window blanks every chart while the mode stays `live` |
| **F9** | medium | `fetch` is guarded only by a text rule an alias defeats, and the runtime guard does not wrap it; `const go = fetch` passes all three of step 8's guards |

Four lower findings (F10–F13) and the S34–S44 adjudication follow.

---

# Part A — confirmed by execution

## F1 — a poll landing after the tab goes hidden erases the hidden gap · **high**

§6.7: *"The un-sampled span is drawn with the same hatched 'no reading' treatment a lost
channel gets — the data genuinely is absent, and **it must not be interpolated across**."*

`onVisibilityChange` opens the gap. The poll that was already in flight then resolves,
`accept()` runs unconditionally, and `closeGap(wire.tsMs, nowMs)` **closes that gap** at the
arriving sample's `ts`. Nothing reopens it: `syncHidden()` only opens a gap on the *transition*
to hidden, and that transition has already happened.

**Input** (measured, `FakeEnv` + a fetch seam held open):

```
t=0     poll 1 lands, sample ts 14:00:00
t=5s    poll 2 starts (in flight)
t=5s+   document.hidden = true   → gaps = [{from: 14:00:00, to: null, hidden}]   ← correct
t=5s++  poll 2 lands, sample ts 14:00:05
        → gaps = [{from: 14:00:00, to: 14:00:05, hidden}]                        ← closed
t+1h    document.hidden = false, poll 3 lands, sample ts 15:00:05
```

**Wrong output:**

```
gaps    = [{"fromMs":…14:00:00,"toMs":…14:00:05,"reason":"hidden"}]      ← a 5-second gap
samples = 14:00:00, 14:00:05, 15:00:05
series  = [{t:14:00:00,v:0},{t:14:00:05,v:0},{t:15:00:05,v:0}]
```

A **one-hour** hidden span is recorded as a five-second one. The chart joins the last two points
with a straight line across 3600 s of ground nobody measured — precisely the lie §6.7 wrote the
sentence to prevent. `state.gaps` is what the build tells step 9 to hatch ("**Hatch
`state.gaps`, and do not infer gaps from nulls**"), so nothing downstream can recover it.

**This is not a corner case on this box.** §6.7 itself says a poll may legitimately take longer
than the cadence and that `collectServing`'s worst case is 6 s against a 5 s default — so a poll
is in flight a large fraction of every cadence, and it is *most* often in flight exactly when
someone backgrounds a slow-looking dashboard.

**Why the suite misses it.** `⚠ the un-sampled span is recorded, from the last reading to the
one that resumes` (`runtime.test.ts:418`) hides the tab with **no poll in flight**. `U5`'s
"in-flight fixture", added when the ledger found the hole, asserts *fetch counts*, not gaps.

**Shape of a fix (not applied):** re-open the gap when a sample is accepted while
`state.hidden || state.paused` — or refuse to close a gap whose reason is still in force.

## F2 — the same erasure for `pause()` and for `refreshNow()` while paused · **high**

Two measured paths, same mechanism:

```
pause() with a poll in flight:
  gaps on pause      = [{from:14:00:00, to:null, paused}]
  after it lands     = [{from:14:00:00, to:14:00:05, paused}]   paused = true, pending = []

refreshNow() while paused:
  fetches 1 → 2, paused = true, mode = paused, samples = 2
  gaps               = [{from:14:00:00, to:14:00:05, paused}]
```

In both, the dashboard stays paused with **no open gap**, so however long the operator leaves it
paused, nothing marks the span. §6.2 does at least announce paused as a mode, which is why this
ranks below F1 rather than beside it — but the runtime invented `reason: 'paused'` precisely
because it intended to hatch it, and now does not.

`resume()` after a plain `pause()` is **sound** — measured `gaps = [{from:14:00:00,
to:14:00:05, paused}]`, correctly spanning the paused period.

## F3 — a subject that stops appearing takes its alarm off the dot, silently · **high**

`observePoll` builds `displayed` **only from this poll's observations**; `severity` and `alarms`
are `aggregateSeverity(poll.displayed)` / `alarmCount(poll.displayed)`. A condition that
disappears therefore leaves the reduction without leaving a trace.

**Input:** GPU 0 at 90 °C (confirmed `alarm`), then `nvidia-smi` starts failing so `gpus: null`
and `errors[]` carries `nvidia-smi`. Everything else healthy. Measured:

```
with the card hot   : dot = alarm   alarms = 1
after gpus: null    : dot = normal  alarms = 0
log lines           : [80000,"source-lost","watch","nvidia-smi","answering","lost"]
                      [20000,"band","alarm","GPU 0 temperature",null,"alarm"]
                      [0,"page-loaded", …]
ledger still holds  : gpu_temp:0 = {firstSeverity:"alarm", lastSeverity:"alarm", changed:false}
```

**Wrong output:** the header goes from `● 1 alarm` to `● all healthy` while a card that was at
90 °C is now simply unreadable. The only counter-signal is a `watch`-toned `source-lost` line
arriving 10 s later — and §6.5 says an absent `nvidia-smi` means "GPU panels show 'no GPUs
enumerated'; **nothing else is affected**". The dot is something else, and it moved in the
reassuring direction.

This generalises: a serving instance that disappears from `serving[]`, a channel that stops
enumerating, `serving: null`. It is the same hole as **S40** seen from §9's end, and S40 does
not mention it. `conditions.ts` deliberately *keeps* the holds and the ledger for vanished ids
("a GPU that drops out of enumeration has not returned to health") — that intent is right and
the reduction contradicts it.

## F4 — S36: a backwards server clock freezes the dashboard, green · **high**

§6.7's dedupe is *"ignores a snapshot whose `ts` it already holds"*, and the ring holds 8192 of
them. A backwards wall-clock step on the server therefore makes **every** subsequent snapshot a
"repeat" until the clock catches up — and a repeat is, correctly per §6.7, *not a failed poll*.

**Input:** 30 polls at the 1 s cadence (ts 0…29), then the server clock steps back 30 s and the
next 30 polls carry ts 0…29 again.

**Wrong output (measured):**

```
samples after 30 repeated polls = 30      newest = 14:00:29
mode = live      consecutiveFailures = 0      severity unchanged
getState() === the state object from 30 seconds earlier   →  true
```

For thirty seconds the client polls once a second, is answered correctly every time, and puts
**nothing** on screen. `patch()`'s identity return — a good optimisation — means
`useSyncExternalStore` never even fires, so a step-10 re-render driven by the store cannot tick
the age either. Combined with **S41** (the runtime deliberately does not tick a clock into its
state, so step 10 must drive its own), the *entire page* is frozen and the dot is green.

**Is a clock step plausible here?** The repo's own `CLAUDE.md` is emphatic that it is: §3.3's
budget rule exists because *"a backward NTP step extends a wall-clock bound by the size of the
step, and a one-hour correction was measured turning a 50 ms budget into a request for a
3,600,050 ms timer"*. The same event on the same box produces this.

**Distinguishability — the question asked.** Of the six `ts` anomalies, only three are
distinguishable by the code as written:

| anomaly | what the code does | distinguishable? |
|---|---|---|
| legitimate repeat (§4's cache, 2–3 in a row) | dropped, green, no backoff | — the correct branch |
| **`ts` steps backwards onto a held value** | **identical** — dropped, green, no backoff | **no.** Nothing counts consecutive repeats |
| two different snapshots, one `ts` | second dropped silently (measured: ring length stays 1) | no — and §6.7 asks for exactly this |
| repeat after an intervening different `ts` | dropped (measured) | n/a — §6.7's literal rule |
| malformed / missing `ts` | `parseSnapshot` → `null` → failed poll | **yes**, correct branch |
| `ts` far in the future | accepted; age goes **negative**; the key poisons `heldTs` | **no** — see F11 |

The wrong branch fires for the backwards step, and there is no signal that separates it from the
normal case. **§6.7 is silent on a run of repeats** — invariant 7 says report it. The cheapest
honest fix is a consecutive-repeat counter: a repeat is normal at 2–3 and is evidence of a
*wedged or re-stamped* server past that, which §6.2 already has a mode for (`stale`).

## F5 — `latestSample()` is newest-by-arrival, not newest-by-time · med-high

`newestSample(ring)` is `ring.samples[length - 1]`. `samplesWithin` sorts by `ts` (build.md §3
calls that "the one place a backwards server clock is handled"), but `latestSample` — the
exported accessor the build's §10 tells step 10 to colour every cell from ("a cell calls
`lib/severity.ts` directly on `latestSample(state)`") — does not.

**Input:** poll 1 lands `ts 14:01:40` with GPU 0 at **84 °C**; the server clock steps back and
poll 2 lands `ts 14:00:50` with GPU 0 at 0 °C.

**Wrong output (measured):**

```
latestSample().ts                 = 2026-09-06T14:00:50.000Z    ← the older reading
tempC rendered from it            = 0
samplesWithin(...) in ts order    = [{t:14:00:50, v:0}, {t:14:01:40, v:84}]
ageMs                             = 51000   (truth: 1000)
```

Every cell, §9's dot input and §6.4's banner value read `0 °C`, while the chart's last point is
84 °C. §6.4: *"a colour that disagreed with its own figure would be a worse lie than a colour
that flickers"* — here the figure and the chart disagree instead. `ageMs` over-states, which is
the safe direction, so that half is fine.

Self-heals on the next poll, so the exposure is one cadence — unless the step lands on held `ts`
values, in which case F4 applies instead and it lasts for the size of the step.

## F6 — COOLING and SAFETY may disagree, and the dedupe picks a winner silently · med-high

`conditionsFrom` emits `unit:gpu-fan-control.service` **twice** (once from `cooling.serviceState`,
once from `safety.fanServiceState`) and relies on `observePoll`'s first-wins dedupe. The build
justifies this with *"O9 makes those two fields one D-Bus read written to both, so they cannot
disagree"* — an **assertion about the server made inside the client**, which is the exact posture
O10 exists to forbid. `parseSnapshot` validates each field against `UnitState` and never compares
them.

**Input:** a wire body with `cooling.serviceState: "active"` and `safety.fanServiceState: "failed"`.

**Wrong output (measured):**

```
wire accepted a disagreeing pair?  true
observations for that id:          [["active","normal"], ["failed","alarm"]]
kept by observePoll:               ["active","normal"]
```

The `alarm` is discarded because COOLING is pushed first. §6.4 does not debounce cell colour, so
the SAFETY panel still renders `failed` in red **from the raw field** while the dot, the count
and the banner say normal. §9's own words: *"Reducing over `displaySeverity` is what keeps the
dot, the count and the banner from ever disagreeing"* — a red cell with a green dot is that
disagreement, arrived at from the one direction §9 did not consider.

The dedupe order is also load-bearing and undocumented as such: reversing the two `push` calls in
`conditionsFrom` would change which verdict survives, and no test pins it.

## F7 — the 10 s debounce counts un-sampled time · medium

§6.4: *"A metric must hold a new band for 10 seconds of **wall time** … not for a number of
polls"*, and it blesses the 30 s cadence case ("the condition genuinely has held for 30 s").
`stepBandHold` therefore compares `nowMs − pendingSinceMs`. But `observePoll` is only called on
an *accepted* sample, so a hidden tab, a paused dashboard and a run of failed polls all
accumulate hold time with **no readings behind it**.

**Input:** GPU 0 at 60 °C confirmed normal at t=0; one poll at 84 °C at t=1 s (alarm now
*pending*); the tab is hidden for an hour; one poll at 84 °C at t=3601 s.

**Wrong output (measured):**

```
at t = 1 s                              severity = "normal"     (correct — not yet held)
after a 1 h un-sampled span, one sample severity = "alarm", sinceMs = 1000
```

The banner's *"when it started"* names **t = 1 s**, an hour before the only other evidence, and
§6.4 fixes that field as "the first observation of the CONFIRMED band". Two samples an hour apart
have confirmed a band across 3 600 s nobody looked at. The mirror case is worse in principle: a
band that intervening readings would have *rejected* is confirmed instead, because there were no
intervening readings.

The runtime already knows exactly when it was not sampling — it records `gaps` — and does not
feed that to the debounce. **§6.4 does not address an un-sampled span at all.** Reported as a new
gap (**S46** below), not filled in.

## F8 — S42's clock choice blanks every chart under skew · medium

`samplesWithin(ring, windowMs, nowMs)` filters `sample.tsMs >= nowMs − windowMs`, comparing a
**server** stamp against a **browser** clock. The build recorded the choice (S42, "the browser's
`now`, matching the assumption the age indicator already makes") but not its failure mode.

**Input:** a full ring of 60 samples 10 s apart, a 30 min window, and a server clock behind the
browser's:

```
server  0 min behind → 60 points
server  5 min behind → 60 points
server 29 min behind →  7 points
server 31 min behind →  0 points      ← every trace blank
server 40 min behind →  0 points
```

**Wrong output:** at 31 minutes of skew every chart is empty, `mode` is `live`, the dot is
whatever the conditions say, and the ring is full of perfectly good data. Anchoring the window on
the newest `ts` instead would degrade gracefully (the traces would simply be labelled with the
server's times, which is what the axis already is).

Same class, same file: `closeGap`'s prune is `gap.toMs >= nowMs − LONGEST_WINDOW_MS` —
`gap.toMs` is a **server** `ts` and `nowMs` is the **browser's**. A server more than 2 h behind
prunes **every** closed gap on the first successful poll, so all hatching disappears. This is the
mistake HANDOVER's own decision list warns about in another place: *"Wall clock for the cookie,
monotonic clock for the limiter, and they are not interchangeable."*

## F9 — `fetch` escapes all three of step 8's guards · medium

`lib/client/guardrails.test.ts` carries the text guard, the runtime guard and the behavioural
guard, and build.md's table says the runtime guard catches "**any spelling at all**". It wraps
`setTimeout`, `setInterval`, `setImmediate` and `queueMicrotask` — **and nothing else**. So
`fetch` is protected by the text rule alone, and that rule matches only a *call*:
`(?<![.\w$])fetch\s*\(`, where the scheduler rule matches a bare identifier.

Measured against the three guards:

| source | scheduler guard | globals guard | `/api/telemetry` path guard |
|---|---|---|---|
| `await fetch("/api/telemetry")` | passes | **TRIPS** | **TRIPS** |
| `const go = fetch;` … `go(TELEMETRY_PATH)` | passes | **passes** | **passes** |
| `const go = fetch.bind(null); go("/x")` | passes | **passes** | passes |
| `Reflect.get(globalThis, "set"+"Timeout")` | passes | **TRIPS** (`globalThis`) | — |

**Wrong output:** a new module under `lib/client/` reaching the network outside the `RuntimeEnv`
seam — no visibility pause, no backoff, no 401 hand-off, no `parseSnapshot` — and the whole
suite green. `U25` demonstrates §5.3 note 4 for schedulers; the same note applies verbatim to
`fetch` and no guard was written for it. Wrapping `globalThis.fetch` in the existing runtime
guard costs four lines.

## F10 — `ch5Pwm` out of range is accepted, contradicting §6.7's own rendering rule · med-low

§6.7: *"A `pwm5` of `999` … leaves the mode undetermined, so the cooling cell reads
**`unavailable`** rather than `—`."* `coolingOf` refuses `{manual, null}` and accepts any finite
number otherwise. Measured through `formatCh5Pwm`:

| wire | accepted? | renders |
|---|---|---|
| `{manual, 255}` | yes | `HIGH pwm 255` |
| `{manual, 999}` | **yes** | `—` — §6.7 says `unavailable` |
| `{manual, -5}` | **yes** | `—` |
| `{manual, 12.7}` | **yes** | **`OFF pwm 13`** — an integer fabricated from a non-integer reading |
| `{manual, null}` / `{ec-auto, 255}` / `{null, 255}` / `{manual, "255"}` | no | — |

The `12.7` row is the one that matters: it renders a duty the machine never reported. wire.ts's
own comment calls this union check "the validation a cast could never do" and cites §6.6's
"a duty that is not a reading leaves the **mode** undetermined" — an out-of-range duty is not a
reading either, and it is the case §6.7 spells out by number.

## F11 — a future `ts` gives a negative age and poisons the dedupe · low

Accepted by `parseSnapshot` (the format is legal). Measured: `ageMs` = **−2 370 908 800 000** for
a `2099` stamp, and a later, legitimate poll carrying that same instant is dropped as a repeat
while `mode` stays `live`. §6.2's age indicator has no rendering for a negative age and §6.7 has
no rule for a `ts` ahead of the browser. Low because nothing on this box produces one; recorded
because it is the same key set F4 abuses.

## F12 — `refreshNow()` polls while `document.hidden` · low

Measured: `fetches 1 → 2` with `document.hidden = true`. The `force` flag bypasses the
paused/hidden guard by design (build.md states it), and it is the only path that breaks §6.7's
"pause polling on `document.hidden`". A forced poll that *fails* while hidden also leaves
`mode: 'stale'` on a tab nobody is looking at. Realistically unreachable by a click; reachable by
any programmatic caller step 10 writes.

## F13 — `Date.parse` accepts an impossible date and rolls it forward · low

wire.ts's comment: *"`Date.parse` afterwards only rejects an impossible date such as
`2026-13-01T00:00:00Z`."* Month 13 is indeed rejected. Measured:

```
ts = "2026-02-30T00:00:00.000Z"  →  ACCEPTED, tsMs = 1772409600000  (= 2026-03-02)
```

The sample is placed on the axis **two days** from where it says it is. Every other malformed
`ts` I tried was rejected (`5`, `"5"`, `"ai-server"`, a trailing space, `+00:00`, a space instead
of `T`, `2026-13-01`, missing, `null`). The defect is a comment that over-claims, in the family
HANDOVER names third on the do-not-copy list.

---

# Part B — attacked and found sound

Each of these was executed, not merely read.

**The `ts` dedupe itself.** A repeat returns the ring by identity; the runtime treats it as a
*successful* poll (`consecutiveFailures → 0`, `lastFailure → null`, `mode` stays `live`, the next
poll is one cadence away, not a backed-off one); the age keeps counting from that `ts`;
`observePoll`/`observeEvents`/`closeGap` never run; and `patch()` returns the *same state object*
so no listener fires. Confirmed by identity, not by equality. A repeat arriving while a failed
gap is open correctly returns `mode` to `live` and leaves the gap open — no new reading has
arrived, so the hatch is still true.

**The ring at the cap.** 8192 held, `heldTs.size` 8192; the 8193rd evicts exactly one from the
front and removes exactly its key. 9000 polls at 1 s with a 2 h window selected returns **7201**
points — the full window, from a ring that has already evicted 808 samples. Eviction is
oldest-first over 50 appends past the cap. (An *evicted* `ts` is no longer deduped and would be
re-appended — correct for a ring, and the ⚠ test name says "the whole ring", not "the whole
session".)

**Cadence and window changes mid-session.** 1 s → 30 s → 1 s: the ring is not cleared, the
existing timestamps are byte-identical prefixes, and only the density changes. `setCadence`
mid-backoff recomputes against the new cadence (measured `[10000] → [30000]`); while hidden or
paused it schedules nothing. `setWindow` touches no timer. Both write `localStorage`
(`[["aid.cadence","30"],["aid.window","120"]]`).

**Decimation.** Every awkward spike position survives with its **own** `tMs` and `v`: first
sample of a bucket, last sample of a bucket, mid-bucket, the very first and the very last sample
of the series — as a maximum **and** as a minimum. A lone reading among 23 nulls survives. A
spike adjacent to a gap emits `[{110000,92},{111000,60}]` — the spike *and* the bucket's min,
both real points. A wholly-null bucket emits one `null`, never `0`. `decimateSeries` is
deterministic and returns its input **by identity** at ≤ 600.

**Backoff.** The measured sequence per cadence:

```
1 s  → 1000,1000,2000,4000,8000,16000,30000,30000
2 s  → 2000,2000,4000,8000,16000,30000,…
5 s  → 5000,5000,10000,20000,30000,…
10 s → 10000,10000,20000,30000,…
30 s → 30000 throughout
```

Every cadence × every failure count from 0 to `MAX_SAFE_INTEGER` stays inside `[1000, 30000]` and
finite — `setTimeout`'s 1 ms clamp cannot be reached.

**Timers.** I could not construct a path that leaves two timers or that leaves none while live.
`reschedule()` cancels first and refuses while `paused`, `hidden`, `inFlight`, `expired` or
stopped; `poll()` cancels on entry; the timer callback nulls the handle before polling. Measured:
hidden → `pending = []` and a 10-minute advance issues nothing; visible → exactly one immediate
poll then `[5000]`; hidden↔visible flipped while a poll is in flight → no extra fetch, one timer
after it lands; `refreshNow()` while paused → `pending = []`; `stop()` mid-flight → the landing
poll cannot write (`samples` stays 1), `pending = []`, subscribes = unsubscribes; `start()`
afterwards works and re-subscribes.

**401.** Mid-backoff it wins over the failure state: `mode = expired`, `navigations =
["/login?expired=1"]`, `pending = []`. Afterwards `refreshNow()`, a hide/show cycle, `resume()`
and `setCadence()` all fail to restart polling and produce no second navigation.

**`parseSnapshot`.** Rejected: every non-object top level (`null`, `5`, `"x"`, `true`, `[]`,
`[1]`); `null` for `host`/`cooling`/`storage`/`safety`/`errors`/`storage.root`; a **missing** key
at either level (`hostname`, `gpus`, `serving`, `errors`, `host`, `cooling`,
`host.cpuTempC`, `safety.ufwEnforcing`) — invariant 1's live-or-die case, and it holds;
`Infinity` (as `1e999`); a string where a number belongs and a number where a string belongs;
`loadAvg` of length 2 or 4 or of strings; a non-integer or `null` GPU index; `gpus: [null]`;
`gpus: {}`; every mismatched cooling discriminant; every out-of-vocabulary `UnitState`,
`LinkState`, `HealthState` and `ErrorSource`; `errors[]` entries missing `message` or carrying
`message: null`. Accepted and preserved: `serving: null` **stays `null`**; unknown extra keys are
ignored; `storage.root.usedGB: null`; an extra key inside an `errors[]` entry.

**`__proto__`.** A `JSON.parse`'d `__proto__` key is ignored (`Object.hasOwn` + explicit field
reads) and `Object.prototype` is not polluted. `"__proto__"`, `"constructor"`, `"toString"` and
`"hasOwnProperty"` as vocabulary *values* are all rejected — `Object.hasOwn` on the
`Record<T,true>` tables, not `in`.

**`-0`.** Accepted and preserved as `-0` through the wire (correct — §3.3 says `-0` **is** a
stopped fan). `severityFanStopped` uses `===` so it alarms, and `formatRpm(-0)` renders
`"0 RPM"`, not `"-0 RPM"`. Invariant 1 holds end to end.

**The event log.** Capped at exactly 500 with a `.slice(0, MAX_EVENTS)` — starting from 498, 499
or 500 pre-existing entries all land on exactly 500, newest first, `seq` strictly descending, and
`page loaded` is the first thing discarded on overflow (the suite pins that). A condition
flapping every 5 s for 60 s logs **nothing** (measured 0 entries). The 10 s boundary is fixtured
on both sides: 9 999 ms logs nothing, 10 000 ms exactly logs the transition. Two entries in the
same millisecond keep their order by `seq`. O5's once-per-session standing entry behaves exactly
as §6.4 requires — measured `[[0,"standing","watch",null,"no"], [60000,"band","normal","no","yes"],
[100000,"band","alarm","yes","no"]]`: logged once while suppressed, logged when it clears, and
logged at **full alarm** when it regresses.

**O3.** `observePoll` deduplicates by id (18 observations → 17 displayed), and `fan_stopped` is
subscripted 1–4 only. Channel 5's zero is `fan5_absolute`. Confirmed.

**Preferences.** `readOption` refuses `' 5'`, `'+5'`, `'5.0'`, `'0x5'`, `'-1'` and anything
outside the closed list; `storage === null`, a throwing getter and a throwing `setItem` all land
silently on the defaults.

**Step 8's own harness.** 128/128, ledger clean, `146 ⚠-marked tests checked`, zero
`DID NOT BITE`, zero `ANCHOR NOT FOUND`, source tree byte-identical afterwards.

---

# Part C — reasoned but not executed

**C1 — a throw anywhere on the arrival path after the `await` wedges the client permanently.**
`poll()`'s `try`/`catch` covers `env.fetchTelemetry()` only. Everything after it —
`parseSnapshot`, `appendSample`, `conditionsFrom`, `observePoll`, `observeEvents`, `closeGap` —
runs outside it, and `this.reschedule()` is the **last** statement. A throw there leaves
`inFlight` already `false`, **no timer pending**, `running` true and `mode` still `live`: the
exact silent stop the build wrote its one defensive catch to prevent, one line further down. I
looked for a reachable throw and did not find one — `parseThrottleMask` returns `null` rather
than throwing on a non-hex mask (I confirmed `throttleReasons: "not-hex"` and `""` are accepted
and render `—`), and every `severity*` is total. So this is a structural exposure, not a live
bug. Extending the `try` to the whole body is one edit.

**C2 — `use-telemetry.ts` is the only genuinely unguarded thing in the step.** It has no test
(the build says so), *and* it is a second exemption from the globals text guard alongside
`env.ts` — build.md's table names only `env.ts` and `fake-env.ts`. So the one file that touches
`window` outside the seam is both untested and un-text-guarded. Nothing asserts that the effect's
cleanup calls `stop()`; if it were dropped, a route change would leave a runtime polling for the
life of the tab and the suite would stay green. Reading it, it is correct: the ref-held instance,
the stable `subscribe`/`getState` class properties, `getServerSnapshot` returning `null` so
hydration cannot mismatch, and `stop()` in the cleanup. `options` is read once and is not in the
effect deps — a `standing` list changing later has no effect, which matters once S34 is closed.

**C3 — a secondary spike inside one bucket is lost, and the build does not say so.** Measured
`92 kept? true / 91 kept? false` for two spikes in one 24-sample bucket. That *is* min/max
decimation working as specified, so it is not a defect — but build.md states only one limitation
("a `null` inside an otherwise readable bucket is dropped") and this one belongs beside it:
**only the extremes of a bucket survive, so a 24 s bucket can hide a second excursion.**

**C4 — bucket boundaries are unstable under append.** Measured: appending one sample to a
1 201-point series moved the `tMs` of **215 of 600** emitted points. At the 1 s cadence with a
2 h window that happens every second, so a third of the drawn polyline shifts on every poll.
Correctness is unaffected (the extremes are still real points), but step 9 inherits a line that
shimmers. §6.7 does not require stability; worth stating so step 9 does not rediscover it as a
rendering bug.

**C5 — `conditionsFrom` is exported un-deduped.** Measured: 18 observations, 17 unique,
`unit:gpu-fan-control.service` twice. build.md's §10 hands it to steps 9/10 as "**O11** — if a
panel needs conditions, it is this one" with no warning. A panel that maps it to rows renders
`gpu-fan-control.service` twice and counts two alarms for one fault — the precise outcome §9
forbids. The safe surface for a panel is `state.displayed`.

**C6 — a repeated `errors[]` source in one poll keeps only the first message.**
`if (!present.has(error.source)) present.set(...)`. §6.7 says the *skipped* / *failed*
distinction "lives in the `errors[]` message text"; if a collector ever files both for one source
in one poll, the log's `detail` carries whichever came first. Narrow, and the collectors do not
do it today.

---

# Part D — adjudication of S34–S44

## S34 — **confirmed dead in production, end to end**

Verified three ways:

1. `parseSnapshot` returns a snapshot with exactly nine keys —
   `["ts","hostname","gpus","host","cooling","serving","storage","safety","errors"]`. A wire body
   carrying an extra `standing` field is accepted and the field is **dropped** (`'standing' in
   snapshot` → `false`), because unknown keys are ignored by design.
2. §4 has three endpoints, and there is no other. `TELEMETRY_PATH` is the only path
   `lib/client/env.ts` names, and a guard asserts nothing else spells it.
3. `TelemetryRuntime`'s `standing` defaults to `parseStandingIds(null)` → **`ids = []`,
   `unknown = []`** (measured). Nothing constructs it with anything else outside tests.

So on a real deployment `declaredStanding` is false for every condition, `suppressed` is never
true, `loggedStanding` is never populated, and §6.4's *"reported as unknown at startup"* can
never fire. **The mechanism is fully built, fully tested by fixture, and unreachable.** There is
no path the build missed. It is the safe direction — a missing list can only make the dashboard
louder — and it means §6.4's suppression, which exists so that a permanently-true `ufw enforcing
= no` does not nail the banner open, will not work the day it is next needed.

### What the delivery channel should be

**Recommendation: a field on §4's snapshot.** It is the one authenticated, cached, per-poll
payload; the client already validates it with `parseSnapshot`, so the whole cost is one validator
clause and one `RuntimeOptions` line; it inherits §4's 2 s cache so it costs no extra work on the
box; and an operator who edits `/etc/ai-dashboard.env` and restarts the container sees the change
without a reload path being invented. Shape: `"standing": ["ufw_enforcing", "unit:llama-server@1.service"]`
— a `string[]`, **not** parsed server-side, so the browser keeps `parseStandingIds` and §6.4's
"reported as unknown" stays a client-side fact.

**Rejected, with reasons.**

- *A prop from the server-rendered shell.* §3.2 makes `/` reachable with a **revoked** cookie —
  that is the standing condition under which the gate/route asymmetry was accepted — so this
  hands the list of alarms the operator has chosen to silence to a signed-out session, and it
  needs a reload to change.
- *A second endpoint.* A fourth route, a second auth check and a second failure mode, for a value
  that is a handful of bytes and changes only on restart. §4 says "Three endpoints. That is the
  whole server."
- *A build-time constant.* It is deployment configuration; §6.4 puts it in the env file precisely
  so it is auditable without a rebuild.

Whoever closes it must also decide **whether the client honours a mid-session change** (I would
say yes, since it rides the snapshot, and `standing` should then move from a constructor option
into per-poll state) and note that `unknownStanding` becomes reachable for the first time, so
step 10 needs somewhere to render it.

## S35 — real ambiguity, resolved reasonably, **verified**

Both readings of *"1×, 2×, 4× the cadence, capped at 30 s"* agree on every delay §6.7 writes
down. Measured divergence is from the **fourth** consecutive failure at cadences below 8 s
(1 s: 8000 vs 4000; 2 s: 16000 vs 8000; 5 s: 30000 vs 20000) and nowhere at 10 s or 30 s, where
the cap swallows it — exactly as build.md claims. Doubling-to-the-cap is the standard idiom and
is pinned by an explicit sequence assertion. **Sound; no change needed.**

## S36 — **under-resolved.** See F4 and F5

The build's answer covers one of three consequences (the axis, via `samplesWithin`'s sort) and
calls the other two out of scope. The two it does not cover are the damaging ones: a frozen green
dashboard for the size of the step (F4), and `latestSample()` returning the older reading (F5).
The entry should be rewritten to name all three, and the eviction argument's stated assumption
("still assumes monotonicity") should say what breaks: an evicted-then-repeated `ts` is
re-appended out of order.

## S37 — **verified sound**, with one consequence to add

`refreshNow()` while paused polls, stays paused (`mode = paused`), and leaves **no** timer —
exactly as described. Add: it also **closes the open paused gap** (F2).

## S38 — **verified sound**, with one undocumented case

Becoming visible polls immediately and the cadence resumes (`pending = [5000]`). Undocumented:
if a poll is already in flight, the immediate poll is silently skipped by the `inFlight` guard.
Harmless — an answer is on its way — but it is the same code path as F1, and F1 is not harmless.

## S39 — **sound.** Facts not sentences; step 10 writes the copy. The `watch`-when-lost tone
choice is defensible, and F3 shows why it matters: it is currently the *only* signal that a
panel's alarms went away.

## S40 — **real, correctly reported, and understated.** It should also carry F3: the same
mechanism (a condition that simply stops appearing) does not merely fail to log — it silently
removes an alarm from §9's dot and count.

## S41 — **real, and F4 makes it sharper.** A step-10 tick driven off store changes will not fire
during a backwards-clock freeze, because `getState()` is identical by identity throughout. The
tick must be an independent interval, and the note should say so.

## S42 — **real, and its failure mode is missing.** See F8: 31 min of skew with a 30 min window
blanks every chart, and `closeGap`'s prune mixes the two clocks outright.

## S43 — **sound.** Nothing outside the browser observes the encoding, the parse is exact, and
the fallback is silent as §6.7 requires. The `P5` re-aim (every invalid row is now a near-miss of
a *non-default* option) fixed the one thing that would have made the table inert.

## S44 — **sound**, and the choice to route every value through `lib/format.ts` is right.

### Gaps the build did not report

| # | Gap |
|---|---|
| **S45** | §6.7's *"above 600 rendered points"* does not say **per series or per chart**. `decimateSeries` is per series, so §6.2's stacked GPU 0 + GPU 1 + fan 5 chart draws up to 1 800 points on one frame |
| **S46** | §6.4's 10 s hold is silent about an **un-sampled span**. A hidden, paused or failing stretch currently counts toward it (F7) |
| **S47** | Which clock stamps an event-log line and the banner's "since"? Both are `env.nowMs()` (the **browser**) while the reading is stamped by the **server** (§4). §6.4's example shows wall-clock times; the two can disagree by the skew |
| **S48** | §6.7 says what a repeated `ts` means but nothing about a **run** of them, which is the only signal a backwards clock produces (F4) |
| **S32** | Still open. §5.2's "cannot reach the dashboard" retry behaviour — HANDOVER assigns it to "step 8 if it touches `/login`". Step 8 did not, so it stays open and the build should have said so |

---

# Part E — the five dropped ⚠ marks

**Verdict: all five were dropped soundly. No property is unguarded as a result.** Each still has
a live test; only the ledger claim was withdrawn, which is what HANDOVER §5.2 rule 1 prescribes.

| dropped ⚠ | claim | my adjudication |
|---|---|---|
| `writing with no storage at all` | compiler-enforced | **Sound, and for a second reason the build states but does not develop.** `readOption` is `if (storage === null) return fallback;` followed by `try { storage.getItem(key) } catch { return fallback }`. Removing the guard makes `null.getItem` throw a `TypeError` **inside the try**, which returns the same fallback — the two implementations are behaviourally identical, so no behavioural mutation can exist. `writeOption` is the same shape. Covered by the `types` mutation `P9` |
| `no storage object at all yields the defaults` | compiler-enforced | Same argument, `P12`. **Sound** |
| `gpus: null produces no GPU conditions` | defended at the wire | **Sound.** `snapshot.gpus ?? []` has no plausible wrong single-file spelling; the distinction that can actually be got wrong is `null` → `[]`, and that is at the wire where `W2`/`W11` bite. Residual: a caller that hand-builds a snapshot bypasses the wire's defence — fixtures do exactly that, so keep the projection test (it is kept) |
| `serving: null produces no instance conditions` | same | **Sound**, same reasoning |
| `every §6.4 kind has a decision about whether its value is itself a band` | `Record<ConditionKind, boolean>` | **Sound.** *Completeness* is a compile error (`T4` proves it: removing `link` fails at `observations.ts(77,14)`). The *values* are separately covered by `O6`/`E7`, which mutate the band choice in each direction. The ⚠ claimed only completeness |
| `a repeat does not double-count an event in the log` | defended twice | **Sound, and I confirmed the second defence is real.** With the ring dedupe removed (`R2`), `observeEvents` still logs nothing for a repeat, because every band is unchanged and the `previousBand === band` early-out fires — and the wall-clock holds cannot be accelerated by an extra call at the same `nowMs`. So the property is true independently of the rule it appears to test, and the ⚠ would have been a claim the ledger could not back. The residual is the already-documented structural limit: a **two-file** change removing both defences is invisible to a one-file harness |

**The property that *is* unguarded in this step is not on that list: `use-telemetry.ts`.** No
test, and a second text-guard exemption nobody wrote down (C2). If step 9 or 10 adds jsdom, the
first assertion to write is that unmounting the hook calls `stop()`.

---

# Part F — process notes

- **`git status` is not a revert check in this repo.** `dashboard/` is untracked, so git prints
  `?? ./` whatever happens inside it. A harness killed mid-mutation would leave the file mutated
  and `git status` would say nothing. Until the commit point HANDOVER §11 raises, the only
  workable check is a checksum manifest — `find lib app proxy.ts -type f | sort | xargs md5`
  before and after. The build's own warning should be amended to say so.
- Everything above was reproduced with `pnpm vitest run <probe file>` and
  `--reporter=verbose --silent=false`; the default reporter swallows `console.log` entirely,
  which is worth knowing for anyone re-running these.
- No harness ran concurrently with `pnpm verify` or with another harness.
