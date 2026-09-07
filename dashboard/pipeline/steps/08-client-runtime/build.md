# Step 8 — client runtime · **build**

§6.7 in full, plus §6.4's debounce and event log, §9's aggregate, §4's `ts` contract and
§5.2's 401 hand-off. Pure logic and one hook. No panels, no charts, no styling.

---

## 1. What was built

Ten new modules under `dashboard/lib/client/`, plus two small extractions above it.

| Path | Lines | What it is |
|---|---|---|
| `lib/client/prefs.ts` | 171 | §6.7's `aid.cadence` / `aid.window`, the closed option lists, and the three ways `localStorage` fails |
| `lib/client/wire.ts` | 504 | **O10** — `parseSnapshot(unknown)`. Validates §4's shape, the three-variant cooling union and all four closed vocabularies. No cast |
| `lib/client/ring.ts` | 133 | The 8192-sample ring, **keyed on `ts`**, and `samplesWithin` selecting by time |
| `lib/client/series.ts` | 130 | Min/max decimation above 600 rendered points |
| `lib/client/backoff.ts` | 54 | 1×, 2×, 4× the cadence, capped at 30 s |
| `lib/client/observations.ts` | 271 | **O11** — `conditionsFrom(snapshot)`, the ONE projection both the banner and the log read |
| `lib/client/events.ts` | 272 | §6.4's event log: 500 entries, newest first, the once-per-session standing entry (**O5**), and §6.7's collector transitions |
| `lib/client/env.ts` | 162 | `RuntimeEnv` — every global behind one seam — and `createBrowserEnv(window)` |
| `lib/client/runtime.ts` | 491 | The store: the poll loop, the dedupe, the backoff, the visibility pause, the gaps, the 401 |
| `lib/client/use-telemetry.ts` | 80 | The React hook. Twelve lines of wiring and no rule |
| `lib/client/fake-env.ts` | 206 | Test scaffolding: the fake clock, timers, storage, visibility and network |
| **`lib/units.ts`** | 30 | **Moved** — `FAN_SERVICE_UNIT` and `servingUnitName`, client-safe |
| **`lib/source-text.ts`** | 86 | **Moved** — `codeOnly` and `sourceFiles`, shared by the two guard files |

Ten new test files: `prefs` · `backoff` · `ring` · `series` · `wire` · `observations` ·
`events` · `env` · `runtime` · `guardrails`, plus `client.test-d.ts` for the compiler.

**Two files outside `lib/client/` changed, and both are moves rather than edits.**

- **`lib/collectors/dbus.ts`** lost two definitions and gained one re-export. §6.4's condition
  ids — `unit:gpu-fan-control.service`, `unit:llama-server@1.service` — are built **in the
  browser**, and `dbus.ts`'s first import is `node:net`. Importing it from client code would
  drag a unix socket into the bundle; spelling the names a second time would give §6.4's own
  **join key** two definitions, which is second on HANDOVER's do-not-copy list. So they moved
  to `lib/units.ts`, which has **no imports at all** — the same shape, and the same reason, as
  `lib/auth/login-view.ts`. Every existing server-side import path is unchanged because
  `dbus.ts` re-exports both names.
- **`lib/guardrails.test.ts`** lost its private `codeOnly` and `sourceFiles` to
  `lib/source-text.ts` and imports them instead. Step 8's own guard needs the same
  comment-stripper, and a second copy of it is a guard waiting to be defeated by prose in one
  file and not the other — every module in this tree explains its own bugs at length, and five
  of this step's guards were false-positive on their own documentation before `codeOnly` was
  wired in.

**No dependency was added.** Eight, all pinned, unchanged since step 1 — see §7 for the jsdom
decision and what it cost to decline it.

---

## 2. How the `ts` dedupe is enforced, and how it is tested

HANDOVER puts this first, so it is stated first: **§4's cache serves the same snapshot two or
three times in a row at the 1 s cadence, and occasionally at 2 s, with an identical `ts`.**

### Enforced in one place, and expressed as identity

`appendSample(ring, wire)` is the only door into the buffer, and its first line is:

```ts
if (ring.heldTs.has(wire.snapshot.ts)) return ring;
```

It returns **the same object**, not an equal one. That choice is what makes the rule
enforceable rather than merely intended, because the runtime then reads:

```ts
const ring = appendSample(this.state.ring, wire);
if (ring === this.state.ring) {
  this.patch({ consecutiveFailures: 0, lastFailure: null, mode: modeOf(false, paused, 0) });
  return;                       // ← observePoll, observeEvents and closeGap never run
}
```

So the three consequences §6.7 names are closed at their source rather than absorbed
downstream:

| §6.7's consequence | why it cannot happen |
|---|---|
| "duplicate points in the ring" | the sample is never appended |
| "flatten the min/max decimation over a bucket" | there is no second point to flatten with |
| "double-count an event in the log" | `observeEvents` is not called at all for a repeat |

**Membership is over the whole ring, not over the newest sample.** §6.7 says "a snapshot whose
`ts` it **already holds**", and the literal reading costs one `Set` lookup. `heldTs` is
maintained by `appendSample` on both sides — a key is added with its sample and deleted with
the sample eviction drops — so it cannot drift from `samples`.

### And a repeat is **not** a failed poll

The patch above is a *successful* poll: the failure count resets, `lastFailure` clears, the
mode stays `live`, and the next poll is scheduled one cadence away rather than a backed-off
one. The age keeps counting from that `ts`, because nothing re-stamps it.

If `consecutiveFailures` was already `0` and the mode already `live`, `patch` finds nothing
changed and **returns the same state object** — so `useSyncExternalStore` does not re-render
and no listener fires. That is the strongest form of "ignores", and it is asserted directly.

### Tested from six directions

| test | file | what it pins |
|---|---|---|
| `⚠ a snapshot whose ts is already held returns the ring by identity` | `ring.test.ts` | `toBe`, not `toEqual` |
| `⚠ three arrivals of one ts are one sample` | `ring.test.ts` | §4's 1 s cadence, exactly |
| `⚠ dedupe is over the whole ring, not only its newest sample` | `ring.test.ts` | the literal reading |
| `⚠ a new ts is appended` | `ring.test.ts` | the dedupe is not refusing everything |
| `⚠ three arrivals of one ts are one sample in the ring` | `runtime.test.ts` | end to end, four polls, two samples |
| `⚠ a repeat leaves the dot green, the backoff idle and the mode live` | `runtime.test.ts` | **not a failed poll** |
| `⚠ a repeat leaves the state identical by identity` | `runtime.test.ts` | zero notifications, `getState() === before` |
| `⚠ a repeat does not double-count an event in the log` | `runtime.test.ts` | §6.7's third consequence |
| `⚠ the age counts from the server’s ts, and a repeat does not refresh it` | `runtime.test.ts` | §4's start-stamp |

Five mutations aim at it: `R2` (dedupe dropped), `R3` (newest-only), `R4` (returns a new
object), `U1` (a repeat engages the backoff) and `U2` (the runtime ignores the ring's verdict).

### `ts` is the poll's start, and nothing corrects it

`parseSnapshot` derives `tsMs` from `snapshot.ts` and from nothing else; `Sample` carries it
verbatim; `ageMs(state, nowMs)` is `nowMs − newest.tsMs`. There is no `Date.now()` anywhere on
the arrival path and no adjustment for the poll's duration. §4 is explicit that this can only
**over-state** age, "which is the direction every reading here must err in".

---

## 3. The ring's eviction, and why it cannot distort the axis

The argument needs three facts, and each is a separate test.

**1. Eviction is oldest-first, and oldest-by-arrival is oldest-in-time.** `ts` is stamped once
per poll by one server clock (§4), so arrival order is time order. `appendSample` drops from
the front and deletes exactly those keys from `heldTs`:

```ts
const evicted = ring.samples.slice(0, ring.samples.length - MAX_SAMPLES + 1);
for (const gone of evicted) heldTs.delete(gone.ts);
return { samples: [...ring.samples.slice(evicted.length), sample], heldTs };
```

Pinned by `⚠ eviction is oldest-first, so the window can never lose its newest samples`
(50 appends past the cap) and by `⚠ an evicted ts leaves the dedupe key set` — without the
second, the ring would leak one key per poll for the life of the session while still looking
correct.

**2. 8192 > 7200, and the gap is the point.** §6.7 chose a cap *above* the worst case the
selectors allow — 2 h at 1 s — "so a late-landing poll on the backoff path cannot silently
evict the oldest sample while the window still needs it". `⚠ two hours at 1 s fits the window
with headroom to spare` runs it as a fixture: 7200 appends, then the full 2 h window asked for,
and all 7200 come back. `⚠ 8192 samples are all held, and the 8193rd evicts the oldest` is
§5.1's fixture symmetry at the cap, and the two sides differ at a panel — one is a complete
window plus headroom, the other has silently lost its oldest reading.

**3. The window selects by time and returns in `ts` order.**

```ts
const within = ring.samples.filter((sample) => sample.tsMs >= from);
return alreadyAscending ? within : [...within].sort((a, b) => a.tsMs - b.tsMs);
```

Because selection is a predicate over timestamps rather than a slice of indices, a **cadence
change mid-session is invisible to it**: the same wall-clock span comes back, denser in the
part that was polled faster. `⚠ a cadence change mid-session changes density and nothing else`
drives 1 s → 30 s → 1 s and asserts the span's ends and its count. `R7` mutates the filter into
`slice(-600)` and reddens it.

The sort is what makes the axis a function of the timestamps rather than of arrival order, and
it is the one place a backwards server clock is handled — see §8's open item S36.

---

## 4. The decimation proof

§6.7: *"Downsample above 600 rendered points, using min/max decimation per bucket so a
one-sample spike survives rather than being averaged away. A thermal spike that vanishes
because of rendering is a lie."*

**The algorithm.** At or below the cap the input is returned **by identity**. Above it, the
points are split into `floor(600 / 2) = 300` equal-**count** buckets, and each bucket emits the
point holding its minimum and the point holding its maximum, in time order, each with **its own
`tMs` and its own `v`** — never a bucket midpoint and never an interpolation. Result length
≤ 600 by construction.

**The proof that a one-sample spike survives** is one line: a sample that is the largest value
in the series is the maximum of whichever bucket contains it, so that bucket emits it. The same
argument runs downwards for a dip.

**The fixture** is §6.7's own worst case: 7200 points (2 h at 1 s), one of them 92 °C among
60 °C, decimated to 600.

```
expect(drawn).toContainEqual({ tMs: SPIKE_AT * 1000, v: 92 });
```

Asserted on `tMs` **and** `v`, because a spike drawn at the wrong instant is a different lie
from a spike averaged away — and a bucket-midpoint implementation would pass a value-only
assertion.

Two near-misses are asserted alongside it, because they are what the plausible wrong
implementations produce:

- **averaging** — the mean of the spike's own bucket is computed in the test and shown to be
  below 92, so the assertion is that min/max kept what a mean would have destroyed. `S2`
  mutates the emit block into a mean and reddens it.
- **every n-th point** — 4321 is not on the 12× grid the ratio would produce, so a sampling
  implementation would draw a flat 60 °C line through the excursion, *intermittently*,
  depending where the spike landed. That intermittency is why it is worse than averaging.

Nulls: buckets ignore them when choosing extremes, and a bucket with **no** reading emits one
`null` point, so a lost channel or an un-sampled stretch survives as a hole rather than closing
into a line nobody measured. `⚠ a null is never rendered as zero` pins invariant 1 inside a
chart; `S5` mutates the null point to `{ v: 0 }` and reddens it.

**The one thing decimation does lose, stated plainly:** a `null` inside an otherwise readable
bucket is dropped. That is bounded — a bucket at the worst case is 7200/300 = 24 samples ≈ 24 s
of a two-hour axis — and it is **not** the mechanism §6.7 relies on for the spans it actually
names. See §5.

---

## 5. Backoff and visibility, and how they interact

### Backoff

`backoffDelayMs(cadenceMs, consecutiveFailures)` — `0` failures is the cadence itself, so the
scheduler has one call and no branch; 1 is 1×, 2 is 2×, 3 is 4×, doubling to the 30 s cap.
`⚠ every delay this project can produce is inside setTimeout’s safe range` sweeps every cadence
against failure counts up to `MAX_SAFE_INTEGER` and asserts `1000 ≤ delay ≤ 30000` — HANDOVER's
note that `setTimeout` clamps an out-of-range delay, and `NaN`, **to 1 ms**, which would turn a
backoff into a flood.

Three things are deliberately **not** failures: a repeated `ts` (§2 above), a 401 (§6 below),
and a partial snapshot carrying `errors[]`, which is "the normal case on this machine"
(invariant 5) and is asserted as a *successful* poll.

A 200 whose body is not §4's snapshot **is** a failure — `lastFailure: 'malformed snapshot'` —
because it is a server this client cannot read, and rendering anything from it would be
inventing data.

### Visibility

§6.7's pause is **the absence of a timer**, not a timer that returns early — that is the only
version a test can prove:

- `reschedule()` returns before scheduling when `hidden`;
- `poll()` returns before fetching when `hidden` and not forced;
- `start()` returns before the first poll when the tab is already hidden;
- `onVisibilityChange` cancels the pending timer on the way in and polls **immediately** on the
  way out.

`⚠ going hidden clears the pending timer and issues no further poll` advances **ten minutes**
of fake clock and asserts the fetch count is unchanged and `env.pending` is `[]`.

### How they interact

They compose through one scheduler and one guard set, so the four cases are:

| state | timer | on the next event |
|---|---|---|
| healthy, visible | one, at the cadence | poll |
| failing, visible | one, at the backoff delay | poll; success resets the counter |
| hidden | **none** | `visibilitychange` polls at once, then the cadence resumes |
| hidden **and** failing | **none** | the same immediate poll; the failure count is *kept*, so the first delay after recovery-or-not is still the backed-off one |

That last row is the deliberate one: going hidden does not clear the backoff, because nothing
about a hidden tab is evidence the server came back. And the immediate poll on becoming visible
is what re-tests it — so a tab that was hidden through an outage does not sit on a 30 s delay
staring at a stale page.

### The un-sampled span

§6.7 requires the hidden span to be "drawn with the same hatched *no reading* treatment a lost
channel gets", and §9 extends it to a failed poll. **Both are recorded as `Gap` values from
what the runtime did**, not inferred from holes in a series:

```ts
{ fromMs: <the newest sample's ts>, toMs: null | <the ts of the sample that ended it>, reason }
```

Starting at the **last reading's `ts`** rather than at the instant polling stopped is what makes
the hatch meet the trace; closing at the resuming sample's own `ts` rather than at its arrival
time is the same rule at the other end. `U8` and `U9` mutate each and redden.

Recording them out of band is what makes §4's decimation limitation harmless: a 20 s hidden
span at the 1 s cadence inside a 2 h window is 20 of 7200 points and could be swallowed by a
mixed bucket, but the gap that describes it is three numbers and survives any rendering.
Closed gaps older than the longest selectable window are pruned, so the list is bounded by
visibility toggles inside two hours rather than by session length.

---

## 6. How `observePoll` is driven without being re-derived

`lib/conditions.ts` composes §6.4 **in the required order** — dedupe → debounce → ledger →
standing — and does not export the halves. Step 8 supplies two things and reads back one:

```ts
const poll = observePoll(this.state.conditions, conditionsFrom(wire.snapshot), this.standing, nowMs);
```

- **`conditionsFrom(snapshot)`** — O11's one function. It is the *only* projection from a
  snapshot to §6.4's conditions, and both the banner and the event log are computed from its
  output. It emits one observation per §6.3 row **that has a band**; a `severity*` function
  answering `null` produces no observation at all, which is O12 ("do not invent a band").
- **`nowMs`** — `env.nowMs()`, one wall clock for the whole pipeline. `conditions.ts` states
  that the debounce "takes wall-clock milliseconds as an *argument*; it never reads a clock",
  which is what lets the fake env drive it.

Nothing in `runtime.ts` reads `rawSeverity`, compares severities, or holds a band. `severity`
and `alarms` are `aggregateSeverity(poll.displayed)` and `alarmCount(poll.displayed)` — §9's
one reduction, read twice.

Three rules fall out of `conditionsFrom` and are each pinned:

- **§9's "one reading, two panels".** `gpu-fan-control.service` is emitted **twice** — once from
  `cooling.serviceState`, once from `safety.fanServiceState` — and `observePoll` deduplicates by
  id. O9 makes those two fields one D-Bus read written to both, so they cannot disagree.
  Emitting from both is what proves the dedupe is doing the work rather than the projection
  quietly doing it instead. `O4` removes the COOLING emission and reddens.
- **O3.** `fan_stopped` covers channels 1–4 only; channel 5's zero is `fan5_absolute`. `O2` adds
  channel 5 to the list and reddens `⚠ channel 5’s zero is fan5_absolute and is never a
  fan_stopped subject`.
- **§6.4's join key.** `unit:llama-server@<i>.service`, from `servingUnitName` in
  `lib/units.ts`. `O3` spells it locally instead and reddens both the id test and the guard.

The debounce being genuinely *driven* rather than bypassed is asserted end to end:
`⚠ a band that has not held ten seconds is not yet the condition’s severity` runs eleven polls
at the 1 s cadence with GPU 0 at 84 °C and watches `severity` stay `normal` for ten of them.

### The event log

Driven from the same `displayed`, plus §6.7's one non-condition feed. Two bands, because §6.4's
examples need both:

| feed | band | debounced |
|---|---|---|
| a continuous row (`gpu_temp`, `disk_free`, …) | its `displaySeverity` | already, by `observePoll` |
| a state-valued row (`unit`, `health`, `link`, `gpu_throttle`, the three safety checks) | its rendered value | here, 10 s |
| a collector's presence in `errors[]` | present / absent | here, 10 s |

Without the second, §6.4's own example line `llama-server@1  active` disappears: `active →
reloading` is `normal → normal`. Without the split, a continuous metric would log every poll.
`O6` and `E7` mutate each direction.

`VALUE_IS_A_BAND` is a `Record<ConditionKind, boolean>`, so a kind added to §6.4's table
without a decision is a **compile error** — the device `CONDITION_KIND_RULES` already uses.

**O5's once-per-session set** is `EventState.loggedStanding`, and it is consulted **only while
the condition is still suppressed**. `⚠ once it clears and regresses it logs again, at full
alarm severity` runs §6.4's four-observation case and asserts the regression is logged at
`alarm`, so the once-per-session rule cannot swallow it.

**Collector transitions** are seeded **answering**, not at whatever the source is doing on the
first poll. That is the one place this differs from `observePoll`, and it is deliberate: every
condition is in every poll, so `observePoll`'s "first sight is confirmed at once" means *page
load*; a source is absent from `errors[]` until it fails, so its first appearance there is a
**transition** and §6.4's ten seconds gate it. Seeding it confirmed would log a collector that
failed on one poll and recovered on the next — `⚠ a collector that fails on one poll and
recovers on the next logs nothing at all`, and `E9` reddens it.

---

## 7. Decisions

### jsdom was declined — invariant 6, and what it costs

**Not added.** The project is still at eight dependencies.

The case *for* was real and this was the first step with one: `document.hidden`,
`localStorage`, and a poller with timers. The case against won on three grounds.

1. **The seam is stronger than the emulator.** `RuntimeEnv` makes every global a parameter, so
   the tests read `env.pending` directly — "a hidden tab schedules nothing" is an assertion
   about a list of timers, not an inference from an absent effect. With jsdom and
   `vi.useFakeTimers` the same property is only observable as "no fetch happened", which is
   also what a broken fetch looks like.
2. **It follows the precedent, and the precedent worked.** Step 7 rendered all six of §5.2's
   states in plain Node by splitting `LoginCard` out as a pure function of a `LoginView`.
   `RuntimeEnv` is the same move for behaviour rather than markup, and `createBrowserEnv` is
   exercised for real against a hand-built `window` — the status mapping, the JSON failure, the
   `localStorage` **getter** that throws, the listener and its removal.
3. **Faking the global clock creates the problem the seam avoids.** HANDOVER records that a
   behavioural test reading a spy synchronously misses a microtask, and that
   `vi.advanceTimersByTimeAsync` exists because of it. Here the poll's own `await` is drained
   explicitly by the harness, and `setImmediate` still works because nothing was patched.

**What it costs, stated plainly.** `use-telemetry.ts` has **no test**. Twelve lines: a ref-held
runtime, `useSyncExternalStore` over the store's own stable `subscribe`/`getState`, and an
effect whose cleanup is `runtime.stop()`. Two things reduce the exposure and neither removes it:

- `client.test-d.ts` asserts `Window & typeof globalThis` **satisfies** `BrowserWindow`, so the
  one un-run line — `createBrowserEnv(window)` — is at least type-correct, and it needs **no
  cast**. A hand-rolled seam that had drifted from the DOM is the real risk of this approach,
  and that assertion is what watches it.
- Everything the hook delegates to is tested, including `stop()`'s three obligations.

**What would change the decision:** step 9 or 10 needing to assert a rendered panel's
interaction rather than its markup. If jsdom arrives then, this hook is the first thing to
cover with it. Recorded as a live question rather than a closed one.

### The `RuntimeEnv` seam, and step 8's timer guard

HANDOVER §5.3 scopes the server-side timer rule to server directories and tells step 8 to write
its own about a different property. `lib/client/guardrails.test.ts` carries **three** guards
because §5.3 note 4 says neither kind is sufficient:

| guard | catches | blind to |
|---|---|---|
| **text** — nothing under `lib/client/` but `env.ts` names a scheduler, or `document`/`localStorage`/`window`/`fetch` | a global written plainly in a new module | every alias of it |
| **runtime** — every global scheduler is wrapped for a whole session (start, poll, cadence change, hide, show, pause, refresh, fail, recover, stop) and must record **zero** calls | any spelling at all | a path the fixture never walks |
| **behavioural** — `stop()` empties `env.pending` and balances the visibility subscription | a timer scheduled and never cleared | a timer created outside `env` |

`U24` mutates a plain `setTimeout(` in (text guard reddens); **`U25` reaches the same global
through `Reflect.get(globalThis, 'set' + 'Timeout')`, which the text guard cannot see and the
runtime guard catches.** That pair is §5.3 note 4 demonstrated rather than quoted.

The guards are enumerated by **walking the tree**, never by listing files — §5.3 note 3, which
step 6 paid for. The exemptions are `env.ts` (one file, the whole point of the seam) and
`fake-env.ts` (test scaffolding), both explicit.

Two further guards were widened from step 7's fixed list to the whole tree: `/login` and
`/api/session` are spelled only in `lib/auth/login-view.ts`, and `/api/telemetry` only in
`lib/client/env.ts`. Step 7's version named two consumer files; this one cannot be defeated by
adding a third.

### O10 — validate, never assert

`parseSnapshot` builds a `TelemetrySnapshot` field by field from `unknown` and returns `null`
for anything that is not §4's contract. It contains no `as TelemetrySnapshot`, and a guard
asserts that no module under `lib/client/` does.

Four decisions inside it are worth naming:

- **A missing key is not a `null` reading.** `null` is a reading this box could not take
  (invariant 1); a missing key is a server that does not implement this contract. The first is
  Tuesday; the second is a failed poll.
- **`serving: null` stays `null`.** `W2` coerces it to `[]` and reddens.
- **The cooling union is discriminated properly** — `{ ch5Mode: 'manual', ch5Pwm: null }` is
  refused, because §6.6 says a duty that is not a reading leaves the **mode** undetermined and
  the contract cannot represent it. This is the validation a cast could never do.
- **`ts` is matched against ISO-8601 UTC before `Date.parse`.** `Date.parse` alone is not a
  validator: `Date.parse('5')` is a real epoch on V8. `W4` removes the regex and reddens.

The four closed vocabularies are `Record<T, true>` tables, so a member missing from one is a
compile error. The strings appear twice in this tree — `dbus.ts` and `proc.ts` hold the
server-side halves and both import `node:net` or `node:fs` — but neither copy can drift from
`lib/types.ts`, because both are checked against the union by the compiler.

### One defensive catch, and why it is not the pattern HANDOVER warns about

`poll()` wraps `await env.fetchTelemetry()` in a `try`/`catch` even though the seam is
specified never to reject and the browser adapter demonstrably does not. HANDOVER's rule is
that "every `catch` added for a *never fail loudly* rule makes two implementations agree on a
status that used to tell them apart" — and this one does not, because it does not swallow
anything into silence: it turns an escaped rejection into **§6.7's failed poll**, named in
`lastFailure`, counted into the backoff, and retried.

The failure it prevents is the one the dashboard cannot describe. Without it, a rejecting seam
leaves `inFlight` true for ever with **no timer pending**: polling stops, nothing on screen
says so, and unlike every failure §6.7 does describe, it never recovers.
`⚠ a request seam that rejects is a failed poll, not a runtime that stops for ever` asserts the
recovery as well as the failure, and `U35` removes the catch and reddens it.

### Immutability and re-render cost

Every state value is replaced, never mutated, and `patch()` compares its own keys and
**returns without notifying when nothing moved**. Without that, a 1 s dashboard would re-render
three times a second for snapshots §4 deliberately repeated. `U14` removes the comparison and
reddens the identity test.

---

## 8. What the spec does not say

Invariant 7: recorded, not filled in. **S34 is the one that needs an owner.**

| # | Gap | What was done | Owner |
|---|---|---|---|
| **S34** | ⚠ **`STANDING` has no way to reach the browser.** §6.4 puts the list in `/etc/ai-dashboard.env` and applies the suppression in the client (steps 8 and 10), but §4's snapshot carries no such field and there is no other endpoint. **As shipped, nothing is ever standing on a real deployment.** | `TelemetryRuntime` takes `standing` as a constructor option, defaulting to `parseStandingIds(null)` — the safe direction, since "a missing config file can only ever make the dashboard *louder*, never quieter". The mechanism is fully tested by fixture, as §6.4 says it must be | **steps 10/11** — decide whether it rides on the snapshot, a second endpoint, or a prop from the server-rendered shell |
| **S35** | **§6.7's backoff admits two readings.** "1×, 2×, 4× the cadence, capped at 30 s" — *keep doubling* and *stop at 4×* agree on every delay it writes down, and diverge only from the **fourth** consecutive failure at a cadence below 8 s | Doubling to the cap, which is the standard idiom and makes the cap do work at every cadence | — |
| **S36** | **A server wall clock that steps backwards.** §6.7 fixes the dedupe on held `ts` and says nothing about a `ts` older than one already held, nor about ordering | The dedupe is exactly §6.7's rule. `samplesWithin` sorts by `ts`, which is §6.7's own "against time, not index" and keeps the axis correct whatever order the ring holds. The *eviction* argument in §3 still assumes monotonicity | — |
| **S37** | **§6.2 says nothing about *refresh now* while paused.** | It polls, and does **not** resume — an explicit request for a reading is answered, and the mode the operator chose survives their own click | step 10 if it disagrees |
| **S38** | **§6.7 says "resume on visibility" without saying whether that means poll now or wait a cadence.** | Polls immediately: a background tab throttles timers, so what is on screen is older than the age indicator suggests | — |
| **S39** | **§6.4 fixes neither the wording nor the tone of an event-log line**, and `MOCK.html` is a reference rather than a source. A **collector** transition has no tone at all in §6.5, where an `errors[]` entry colours nothing | `LogEntry` carries facts, not sentences — step 10 writes the copy. A collector's tone is `watch` when lost and `normal` when recovered, chosen because it is a fact about the dashboard's ability to read rather than about the machine's health | step 10 |
| **S40** | ⚠ **§6.4's own example line `fan5  EC auto → HIGH` has no condition to hang on.** In `ec-auto`, §6.3 gives the engaged row no band and O12 forbids inventing one, so no `fan5_engaged` condition exists — and O11 requires the log to be driven by `conditionsFrom`. A mode change out of `ec-auto` therefore appears as a condition *appearing*, which this step does not log | Reported. Logging condition appearance/disappearance is a possible answer and would also cover a GPU dropping out of enumeration, but it is not a *band* change and §6.4's ten seconds do not obviously apply to it | steps 9/10 |
| **S41** | **§6.2 requires the age indicator to count up, but nothing re-renders while paused or stale.** The runtime deliberately does not tick a clock into its state — that would be background work at 1 Hz that `document.hidden` could not stop | `ageMs(state, nowMs)` is exported as a pure function. **Step 10 must drive its own tick**, or a paused dashboard shows a frozen age — the exact failure §6.2 wrote the indicator to prevent | **step 10** |
| **S42** | **Which clock anchors the rendering window** — the browser's `now` or the newest `ts` | The browser's `now`, matching the assumption the age indicator already makes | — |
| **S43** | **The stored representation of `aid.cadence` / `aid.window`.** §6.7 names the keys and nothing else | Seconds and minutes as bare decimal integer strings, parsed exactly and checked against §6.2's closed lists. Recorded as a decision rather than a gap: nothing outside the browser can observe it, and §6.7 already requires an unreadable value to fall back silently | — |
| **S44** | **§6.4 fixes condition *ids*, not their labels or rendered values.** The banner "names the condition, the value, and when it started" without saying how | Labels follow `MOCK.html`'s spelling (`fan 5`, `gpu-fan-control.service`, `llama-server@1`); every value goes through `lib/format.ts`, so invariant 1's law is applied once where it is tested | steps 9/10 may re-word |

**A limitation rather than a gap, recorded so nobody has to rediscover it:** decimation drops a
`null` that sits inside an otherwise readable bucket. Bounded at ≈24 s of a two-hour axis, and
the spans §6.7 actually names — the hidden-tab pause and the failed-poll run — are carried by
`RuntimeState.gaps` with their real start and end times, so hatching them does not depend on it.

---

## 9. Regression evidence

### `pnpm verify` — the only definition of green

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ cd dashboard && pnpm verify

> ai-dashboard@0.1.0 verify
> rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard

 Test Files  55 passed (55)
      Tests  1865 passed (1865)
Type Errors  no errors
   Duration  3.19s

VERIFY_EXIT=0
```

**1626 → 1865**, +239 in eleven new files (`lib/client/` alone runs 239 of them). 44 → 55 test
files.

**Run ten times, exit 0 every time, the same count every time.** Nothing in this step consumes
entropy: the clock is `FakeEnv`'s, the timers are `FakeEnv`'s, and the one wall-clock assertion
(`nowMs is the wall clock`) brackets `Date.now()` between two reads of it, which holds for
every scheduling. §5.4's rule — *a test may consume entropy only for an assertion that holds
for every value it could draw* — has nothing to bite on here, and that is deliberate rather
than lucky: the seam is what removed the entropy.

### `pnpm build`

```
$ pnpm build
✓ Compiled successfully in 377ms
  Finished TypeScript in 280ms
Route (app)
┌ ○ /            ├ ○ /_not-found   ├ ƒ /api/session
├ ƒ /api/telemetry                 └ ƒ /login
ƒ Proxy (Middleware)
BUILD_EXIT=0
```

`tsconfig.json` byte-identical — `md5 8b6e358b0e19ad663d554dc8310c6da0`, the value HANDOVER
records. The route table is unchanged: **step 8 added no route and nothing to `app/`**, which
is what keeps §3.2's "the shell carries no telemetry" true by construction.

### The six inherited harnesses — 479 mutations, all still biting

```
python3 pipeline/steps/02-format-severity/regressions.py                     →  40/40   exit 0
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                 →  64/64   exit 0
python3 pipeline/steps/04-collector-cooling/regressions.py                   →  76/76   exit 0   ledger clean (66 ⚠)
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py   → 127/127  exit 0   ledger clean (94 ⚠)
python3 pipeline/steps/06-telemetry-route/regressions.py                     →  59/59   exit 0   ledger clean (53 ⚠)
python3 pipeline/steps/07-auth-login/regressions.py                          → 113/113  exit 0   ledger clean (103 ⚠)
```

**One re-aim was needed and it was made in the same change**: step 5's `F15` was anchored on
`export const FAN_SERVICE_UNIT = …` in `lib/collectors/dbus.ts`, which moved to `lib/units.ts`.
It now points there, its check list is unchanged (`SAFETY`, `DBUS`), and it bites. Nothing else
moved.

Two of the inherited harnesses now redden step 8's modules from the *type* side, which is
useful evidence that the new code is wired into the same contract rather than beside it: step
2's `R36` (drop `net-operstate` from `ErrorSource`) fails in `lib/client/wire.ts` at the
exhaustive `Record`, and step 3's `S48` (`Gpu.tempC` loosened off its `Celsius` brand) fails in
`lib/client/observations.ts`.

### Step 8’s own harness — 128 mutations, ledger clean

```
python3 pipeline/steps/08-client-runtime/regressions.py

Red-test ledger: 195 distinct failing tests across 128 mutations; 146 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 128 regressions failed their check, as they must.
EXIT=0
```

**Project total: 607 mutations.**

### ⚠ What the ledger found, and it found a lot

The first full run had **seven mutations that did not bite and twelve ⚠ tests no mutation could
redden**. Every one was a defect in a *test*, not in a mutation, which is the hypothesis
HANDOVER tells you to start from. Worth listing, because five are recurrences of failures this
project has already paid for:

| finding | what was wrong | fix |
|---|---|---|
| `P5` did not bite | the invalid-cadence table used `' 5 '`, `'5.0'`, `'+5'` — **and the fallback is 5**, so a `Number()`-based parser passed a table that named it. A row that cannot distinguish the two implementations | every row is now a near-miss of a *non-default* option (`' 1 '`), plus `'0x1'` |
| `N1` did not bite | `expect(idsOf(loaded)).toContain(\`unit:${FAN_SERVICE_UNIT}\`)` — **the assertion used the constant it was checking**, so renaming it moved both sides together | assert the literal `'gpu-fan-control.service'` |
| `⚠ fan_stopped is subscripted … 1 to 4` | `expect.arrayContaining` says nothing about a **fifth** channel joining the row, which is O3's whole point | assert the exact set |
| `E4` did not bite | O5's once-per-session set only matters when a suppressed condition's **value** moves inside its band, and no fixture did that | added `failed → inactive` under `STANDING=unit:gpu-fan-control.service` |
| `U5`/`U6` did not bite | two hidden-tab paths no fixture walked: a poll **landing after** the tab went hidden, and the two belt-and-braces guards that hide each other | added the in-flight fixture; `U6` became a two-pair mutation removing both guards |
| `U29` did not bite | the path guard matched `'…'` and `"…"` but **not a template literal**, and `` `/login?${EXPIRED_PARAM}=1` `` is exactly the second spelling it exists to catch | the regex takes backticks |
| twelve ⚠ tests uncovered | mostly missing mutations — the wire validator's *acceptance* side (a legal variant refused), `Number()`/`Boolean()`/`String()` coercions, re-stamping `ts` at the parse, carrying the last sample forward on a failure, hiding the age while paused | thirteen mutations added: `W11`–`W18`, `S8`, `R10`, `O10`, `U31`–`U34`, `V10`, `E13`, `O9` |

**Five ⚠ marks were dropped rather than papered over**, each with the reason recorded at the
test and in the harness docstring:

- `writing with no storage at all` and `no storage object at all yields the defaults` — the
  null narrowing is **compiler**-enforced (`PrefStorage | null` before `.getItem`/`.setItem`),
  and at runtime the `try`/`catch` §6.7 requires would swallow the `TypeError` anyway. That is
  HANDOVER's "every catch added for a *never throw* rule removes a distinction", found by the
  ledger rather than by hindsight. Covered as `types` mutations `P9`/`P12`.
- `gpus: null produces no GPU conditions` and `serving: null produces no instance conditions` —
  the `null` / `[]` distinction is made and defended at the **wire** (`W2`, `W11`), not in the
  projection, where `?? []` has no plausible wrong single-file implementation.
- `every §6.4 kind has a decision about whether its value is itself a band` — enforced by
  `Record<ConditionKind, boolean>`; covered by the `types` mutation `T4`.
- `a repeat does not double-count an event in the log` — defended **twice**, by the ring's
  identity return *and* by the log's own band early-out, so no single-file mutation can
  distinguish either while the other stands. The end-to-end assertion is kept; the ⚠ would have
  been a claim the ledger could not back.

### ⚠ A harness lesson worth passing on

Running `pnpm verify` while a harness was mid-flight produced a **false `TS6133` in
`lib/client/ring.ts`** and a ledger listing thirteen ⚠ tests as uncovered that a clean run
covers. HANDOVER already says "do not run a harness concurrently with `pnpm verify` or with
another harness. Serialise." What it does not say, and what cost twenty minutes here, is that
the failure is **not** a crash: both produce plausible, wrong, quotable output. Worse, a harness
killed mid-mutation leaves the source file **mutated on disk** — the `finally` that restores it
never runs. If a `verify` fails for a reason that makes no sense, check `git status` and check
whether a harness is still alive before believing it.

---

## 10. The surface steps 9 and 10 build on

Everything below is client-safe: nothing under `lib/client/` imports `node:*`, `next/*`,
`lib/collectors/`, `lib/telemetry/` or any of `lib/auth/` except `login-view.ts`, and a guard
that **walks the tree** holds that line.

```ts
// the hook — one call, and §6.2's four controls hang off `runtime`
useTelemetry(options?): { state: RuntimeState | null; runtime: TelemetryRuntime | null }

// the store, if a component wants to own its lifetime
new TelemetryRuntime(env, { standing? })   ·   start() · stop()
setCadence(1|2|5|10|30) · setWindow(10|30|120) · pause() · resume() · refreshNow()
subscribe(listener) => unsubscribe   ·   getState(): RuntimeState

RuntimeState = {
  preferences, ring, conditions, displayed, events, gaps,
  paused, hidden, consecutiveFailures, lastFailure,
  mode: 'live' | 'paused' | 'stale' | 'expired',
  severity: Severity | null,        // §9's dot
  alarms: number,                   // §9's count — omit it at zero, in the RENDERING
  unknownStanding: readonly string[],
}

ageMs(state, nowMs): number | null   ·   latestSample(state): Sample | null
samplesWithin(ring, windowMs, nowMs) · seriesFrom(samples, pick) · decimateSeries(points)
conditionsFrom(snapshot)             // O11 — if a panel needs conditions, it is this one
MAX_SAMPLES · MAX_RENDERED_POINTS · MAX_EVENTS · BACKOFF_CAP_MS · LONGEST_WINDOW_MS
CADENCE_SECONDS · WINDOW_MINUTES · DEFAULT_PREFERENCES · cadenceMs() · windowMs()
```

**Five things the next steps have to do rather than inherit:**

1. ⚠ **Tick the age.** `ageMs` is pure and the runtime deliberately does not write a clock into
   its state. Nothing re-renders while paused or stale, so **step 10 must drive its own 1 s
   tick** or the age freezes — S41, and the exact failure §6.2 wrote the indicator to prevent.
2. ⚠ **Omit the alarm count at zero.** `state.alarms` is a number; §9's `● all healthy`, never
   `● 0 alarms`, is a rendering decision.
3. ⚠ **A cell's colour is not `displayed`.** §6.4: cell colour tracks the current reading,
   **undebounced**, so a cell calls `lib/severity.ts` directly on `latestSample(state)`.
   Nothing in `displayed` is a cell colour.
4. ⚠ **Hatch `state.gaps`, and do not infer gaps from nulls.** The gaps carry real start and
   end times and survive decimation; a hole in a series may not.
5. ⚠ **`state` is `null` until the first client render**, because the runtime needs a `window`.
   That is *before the first poll*, not missing data.
