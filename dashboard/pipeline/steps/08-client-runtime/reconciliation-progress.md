# Step 8 — reconciliation · **progress brief for a fresh context**

The reconciliation was split across two contexts. **Everything below is done and green**; the
remaining work is listed in §9 and is precise enough to execute cold.

**Read this file, then `SPEC.md`, then `review.md`. `build.md` and `adversarial.md` are only
needed for a finding's original wording — every disposition is recorded here.**

---

## 0. State right now

| | |
|---|---|
| `pnpm verify` | `Test Files 57 passed (57)` · `Tests 1982 passed (1982)` · `Type Errors no errors` · **exit 0** |
| harnesses 2–7 | all pass, ledgers clean — see §8 |
| harness 8 | **not yet re-aimed.** 20 of its 128 anchors have moved (§9.1) |
| `SPEC.md` | untouched (md5 unchanged) |
| `HANDOVER.md` | untouched — **still describes the pre-fix world.** Rewriting it is remaining work |
| manifest baseline | `pipeline/steps/08-client-runtime/manifest-baseline.txt`, 123 files, matches the tree |

Toolchain: `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`,
Node v24.16.0, run from `dashboard/`.

### ⚠ The integrity procedure — use it, `git status` cannot

`dashboard/` is untracked, so `git status --short` collapses the tree to `?? ./` and would not
show a source file left mutated by a killed harness. Take the manifest **before** the phase and
diff it **after every harness run**, not once at the end:

```bash
cd dashboard
find lib app proxy.ts -type f | sort | xargs md5 > /tmp/manifest-before.txt   # 123 files today
# …one harness, or one `pnpm verify`. NEVER two at once. …
find lib app proxy.ts -type f | sort | xargs md5 | diff /tmp/manifest-before.txt - \
  && echo "TREE IDENTICAL TO BASELINE"
```

`pipeline/steps/08-client-runtime/manifest-baseline.txt` is a current snapshot to diff against.
**Run harnesses and `pnpm verify` strictly serially** — concurrency produces a false `TS6133`
and a ledger that falsely reports ⚠ tests as uncovered, and both failures are quotable rather
than obviously broken. A harness killed mid-mutation leaves the file mutated on disk; the
`finally` that restores it never runs.

Harness runs write nothing to stdout until they exit (Python block-buffers to a file), and step
4/5/7 each take several minutes. Run them in the background and wait on
`until ! pgrep -f regressions.py; do sleep 3; done`.

---

## 1. What changed, and why

Twelve MUSTs and fourteen SHOULDs from `review.md`, plus the two module extractions it asked
for. Two new source modules, one new server-side reader, and one new field on §4's contract.

### New files

| file | what |
|---|---|
| `lib/client/gaps.ts` + `gaps.test.ts` | **S1.** §6.7's un-sampled spans, extracted out of `runtime.ts`. A gap closes when a **reason** goes away, not when a **sample** arrives (M2/F1/F2) |
| `lib/client/mode.ts` + `mode.test.ts` | **S2.** §6.2's mode. `stale` is a function of the newest reading's **age**, not of the failure counter (M5/F4/F11) |

### Changed source

| file | change |
|---|---|
| `lib/types.ts` | `TelemetrySnapshot.standing: readonly string[]` — required, never `null` (**M9/S34**) |
| `lib/auth/config.ts` | `STANDING_KEY`, `STANDING_SEPARATOR`, `readStandingList(env)` — splits on `,` and does **nothing else** |
| `lib/telemetry/snapshot.ts` | `SampleSnapshotOptions.standing`, echoed onto the wire verbatim |
| `lib/telemetry/source.ts` | `env` option (default `process.env`); `readStandingList(env)` **per sample**, so an operator's edit lands on the next poll |
| `lib/conditions.ts` | `observePoll` rewritten: worst-severity dedupe (**M7/F6**), stale/retired (**M1/F3**), `afterGap` (**M3/F7**), `standingIdsFrom` replaces `parseStandingIds`, `restartPendingRuns`, `NOTHING_STANDING` |
| `lib/client/observations.ts` | `enumerationsRead(snapshot)`, `GPU_ENUMERATION`, `SERVING_ENUMERATION`; every observation carries its `enumeration`; **M11** doc note that this is not a panel surface |
| `lib/client/ring.ts` | `newestSample` is newest **by `ts`** (**M6/F5**); `samplesWithin(ring, windowMs)` anchors on the newest `ts` and no longer takes `nowMs` (**M4/F8**) |
| `lib/client/events.ts` | takes the whole `PollResult`; new feeds for stale / retired / reading-returned / conflict; `observeStaleness`; **last** `errors[]` message per source wins (**S11**) |
| `lib/client/runtime.ts` | `applyMode` is the only writer; gaps and mode delegated; `standing` per-poll; `refreshNow` no-ops while hidden (**S5/F12**); the whole arrival path is inside the `try` (**S7/C1**) |
| `lib/client/wire.ts` | `standing` validated as a required `string[]`; `manual` duty must be an integer in 0–255 (**S3/F10**); `ts` round-tripped against the calendar (**S4/F13**) |
| `lib/client/use-telemetry.ts` | takes no options — `STANDING` rides the snapshot |
| `lib/format.ts` | `formatAge` — **a negative age never renders as a negative number** (**S6/F11**) |
| `lib/client/guardrails.test.ts` | wraps `globalThis.fetch` and `XMLHttpRequest` (**M8/F9**); the text guard matches `fetch` as an identifier; the guard **verifies its own wrappers are still installed** (**S10**) |
| `lib/client/series.ts` | doc only: C3, C4 and the per-series budget (**S12/S45**) |
| `lib/fixtures.ts` | `standing: []` on both roots |

### The four load-bearing fixes, in one line each

- **F3 — stale vs retired.** `observePoll`'s `displayed` now carries **every condition the
  session has confirmed**, each marked `stale`, with `lastSeenMs`. A condition leaves only when
  *retired* — its enumeration was read and its subject was not in it. `gpus: null` retires
  nothing. Both edges are confirmed over the same ten seconds of *sampled* wall time. Exactly
  where the review said to put it: in `observePoll`'s result, **not** in `runtime.ts` reducing
  over two lists.
- **F1/F2/F7 — gaps.** `anyGapReason(state)` is a predicate over **all three** reasons, so
  `pause() → hide → resume()` keeps the gap open. A reading may land inside a gap and neither
  closes nor splits it. `observePoll`/`observeEvents` take `afterGap`, which restarts every
  pending run.
- **F4/F5/F8/F11 — the clocks.** Server `ts` positions readings (ring key, window bounds, gap
  endpoints, prune horizon); the browser's clock measures the session (§6.4's hold, log times,
  "since"); the age indicator is the only place they meet. `stale` = failed, **or** age > 3
  cadences (floor 10 s), **or** negative age.
- **F6 — dedupe.** `isWorse` is expressed through `worstSeverity`, so §6.3's ordering has one
  definition. The push order in `conditionsFrom` is no longer load-bearing.

### ⚠ One harness-visible change to the test scaffolding

`FakeEnv.now` used to start at `1_700_000_000_000` (2023) while `tsAt(0)` is 2026-09-06 — two
fake clocks in different **years**. That was invisible until §6.2's mode became a function of
`browser now − server ts`, at which point every fixture read `stale`. `FakeEnv.now` is now
`Date.parse(tsAt(0))`: a browser and a server that agree. **A test that wants skew has to ask
for it**, which is the right way round. Five runtime fixtures were adjusted to stamp their
snapshots where the fake clock actually is; each carries a comment saying so.

---

## 2. Every finding, with its disposition

### The adversarial's thirteen — all upheld by the review, all taken

| # | Disposition |
|---|---|
| **F1** in-flight poll erases the hidden gap | **Fixed.** `gaps.ts`; `⚠ a poll landing after the tab went hidden does not close the gap` (unit) + `⚠ a poll landing after the tab went hidden does not close the hidden gap` (runtime) |
| **F2** same for `pause()` and `refreshNow()` while paused | **Fixed**, same mechanism; two unit tests and two runtime tests |
| **F3** vanished subject takes its alarm off the dot | **Fixed** in `observePoll`. Six unit tests, two runtime tests, four event-log tests |
| **F4** backwards clock freezes the dashboard green | **Fixed** by `mode.ts`'s age rule + one event-log line at the crossing |
| **F5** `latestSample` is newest-by-arrival | **Fixed**; `ring.ts` tracks the max `ts` on append |
| **F6** COOLING/SAFETY disagreement resolved by push order | **Fixed**; worst severity wins, and the disagreement is logged once per session (**S9**) |
| **F7** the 10 s debounce counts un-sampled time | **Fixed** by `afterGap`; a confirmed band is undisturbed |
| **F8** window compares server `ts` to browser `now` | **Fixed**; `samplesWithin` lost its `nowMs` parameter, and the prune horizon moved with it |
| **F9** `fetch` escapes all three guards | **Fixed**; runtime guard wraps it, text guard matches the identifier |
| **F10** out-of-range `ch5Pwm` accepted | **Fixed**; `Number.isInteger` and 0–255 |
| **F11** future `ts` → negative age, poisoned dedupe | **Fixed**; `formatAge` clamps, `isStale` treats it as not-current. The dedupe is unchanged, deliberately |
| **F12** `refreshNow()` polls while hidden | **Fixed**; the `paused` bypass survives (S37) |
| **F13** `Date.parse` rolls `2026-02-30` forward | **Fixed** with the round-trip, not with a comment |

### The review's own — Part 3 and Part 4

| # | Disposition |
|---|---|
| **C1** a throw after the `await` wedges the client | **Taken (S7)**; whole arrival path inside the `try`, tested with a `Proxy` body that throws |
| **C2** `use-telemetry.ts` untested and un-text-guarded | **Named**, and the exemption is now written into the guard and its table. jsdom still declined (**D6**) |
| **C3/C4** bucket extremes only; boundaries shift on append | **Recorded** in `series.ts` (S12) |
| **C5** `conditionsFrom` exported un-deduped | **Taken (M11)**; documented in `observations.ts` and carried to HANDOVER |
| **C6** first `errors[]` message per source wins | **Taken (S11)**; the **last** wins, with the reason written down |
| **4.1** eleven modules is right | No change |
| **4.2** `runtime.ts` one module too big | **Taken**; `gaps.ts` and `mode.ts` extracted in the same change as the fixes |
| **4.5** globals guard voids itself under `isolate: false` | **Fixed, not merely noted** — the brief overrode the review here. The guard asserts its own wrappers are still installed and attributes calls by stack frame |
| **4.6** three over-claims in `build.md` | **Corrected in the code's own comments** (see §5); `build.md` is left as the historical record of that phase |
| **4.7** `errors[]` message chosen by array order | = C6 above |
| **Part 5** commit before step 9 | **Recommendation only** (S14). `CLAUDE.md` says commit only when asked; nothing was staged or committed |

### S34–S48

| # | Disposition |
|---|---|
| **S34** | **Closed end to end.** `standing` on §4's snapshot, required, echoed verbatim, never on the shell, per-poll state. Server half in `lib/auth/config.ts` + `snapshot.ts` + `source.ts`; client half in `wire.ts` + `runtime.ts`. Step 11 still owes the env-file plumbing (**D8**), step 12 the on-box verification |
| **S35** | Sound; doubling to the cap. Divergence measured from the 4th failure below an 8 s cadence — carried to HANDOVER so it is not re-litigated |
| **S36** | Rewritten in `ring.ts`'s own doc: the eviction argument's assumption is named, and what breaks is stated |
| **S37** | Sound, and *refresh now* while paused now leaves the paused gap open |
| **S38** | Sound; the in-flight skip is harmless **because** F1 is fixed |
| **S39** | Sound; tones kept. `stale` is `watch`, `retired` is `normal` |
| **S40** | Real, **not** closed. §6.4's event log needs a third feed for state fields with no §6.3 band (`ch5Mode`) — **D1, step 10** |
| **S41** | Real. The age tick must be an **independent interval** — **D2, step 10**. Under the new mode rule the store changes once at the crossing, which is worse than never because it looks like it works |
| **S42** | **Overruled**; anchor on the newest `ts` |
| **S43/S44** | Sound, unchanged |
| **S45** | Per **series**. Implemented that way; the code says so. §6.7 does not carry the sentence — **new spec gap, §7 below** |
| **S46/S47/S48** | Answered by the gap rule, the clock rule and the age rule respectively |
| **S32** | **Closed by the current `SPEC.md`**, per the review overruling the adversarial. §5.2's sixth row answers it |

### The build's own S34–S48 numbering

`build.md` §8 lists S34–S44; the adversarial added S45–S48 and re-raised S32. All are above.
None was dropped.

---

## 3. Findings from this phase that were NOT in any earlier list

1. **Steps 2 and 3 have no red-test ledger.** Only steps 4–8 carry it. Step 8 added ⚠ marks to
   `lib/conditions.ts` and `lib/format.ts`, so the ledger was **retrofitted to step 2's
   harness** — and it immediately found **six pre-existing ⚠ marks with no mutation behind
   them**, five of them on the most safety-critical row in the project:
   - `⚠ 0 alarms in EVERY mode` and `⚠ null alarms in NO mode` (`severityFan5Absolute`)
   - ``⚠ `-0` is a stopped fan — the comparison is `===`, never `Object.is` ``
   - `⚠ there is deliberately no upper row on these four channels`
   - `⚠ the sub-minute form is a READING and is not the em dash`
   - ``⚠ `fan_stopped` is subscripted by channel…`` (covered by step 4's T51 once ownership was
     settled)

   All six are now backed (`R51`–`R55` in step 2, `T51` already in step 4). **Step 3's harness
   still has no ledger** — carried as an obligation.
2. **`lib/conditions.test.ts` had two would-be ledger owners.** Step 4's `LEDGER_FILES` already
   contained it. Step 2's ledger was therefore scoped to `format.test.ts` + `severity.test.ts`,
   and the twelve conditions mutations were moved into step 4's harness as `T70`–`T83`. A ⚠
   mark with two owners is a mark neither owner has to back.
3. **The harness prints only the first three FAIL lines per mutation.** Reading coverage off the
   printed log is therefore wrong; the ledger unions *all* of them. This cost one wrong
   conclusion here. Step 2's print width was widened to 260 chars, but the lesson is to trust
   the ledger's own verdict, never the printed excerpt.
4. **A `test.each` name whose first `%` falls early is unmatchable by the ledger.** The harness
   warns (`⚠ test name is unmatchably short`) — one test was renamed for it.

---

## 4. New spec gaps for the owner (invariant 7)

`SPEC.md` was not edited. These are gaps found in this phase; none was filled by assumption.

| # | Gap | What the code does |
|---|---|---|
| **S49** | **§6.7 does not say whether the 600-point budget is per series or per chart.** The review ruled per series (S45) but the sentence is not in `SPEC.md` | Per series. `decimateSeries` is called per trace, and §6.2's stacked chart therefore draws up to 1,800 points |
| **S50** | **§6.5 says a stale condition's row "names the age of the reading" but not which clock measures it.** §6.7's rule says the session is the browser's clock and a reading's position is the server's; "the age of a reading we did not take" is neither cleanly | `DisplayedCondition.lastSeenMs` is the **browser's** clock at the last poll that carried the condition — a fact about the session, matching `sinceMs` and an event-log line |
| **S51** | **§6.5 does not say what a stale condition's *value* shows.** It keeps the last reading, which is the only honest option, but §6.6's "`null` renders `—`" could be read as requiring the figure to blank | The last value read, unchanged, with `stale: true` beside it. Step 9/10 decides the treatment |
| **S52** | **§6.4 does not say whether `loggedStanding` survives a mid-session `STANDING` change.** The review answered it (it must not reset) but the spec does not | Not reset. It belongs to the session, not to the configuration |
| **S53** | **§4 does not say what a *duplicate* entry in `STANDING` means.** Echoed verbatim, so the client sees it twice | Harmless — `standingIdsFrom` builds a `Set`. Recorded so nobody "fixes" it on the server |

---

## 5. `build.md`'s three over-claims — corrected, and where

The review (M10) requires these not to enter `HANDOVER.md` as fact. `build.md` is left as the
historical record of that phase; the corrections live in the code's own comments, and must be
carried into `HANDOVER.md` in the corrected form:

1. **"runtime — catches any spelling at all."** It wrapped four schedulers and `fetch` was not
   one. Corrected in `guardrails.test.ts`'s own table to *any spelling of a global it wraps*,
   and `fetch`/`XMLHttpRequest` are now wrapped.
2. **"The exemptions are `env.ts` and `fake-env.ts`, both explicit."** There is a **third**:
   `use-telemetry.ts`. Now named in the guard, in its table, and in an `exempt` list rather than
   an inline `&&`.
3. **"check `git status` … before believing it."** `git status` cannot do this in an untracked
   tree. The manifest procedure at the top of this file replaces it.

---

## 6. The surface steps 9 and 10 build on

```ts
useTelemetry(): { state: RuntimeState | null; runtime: TelemetryRuntime | null }   // no options

new TelemetryRuntime(env)   ·   start() · stop()
setCadence(1|2|5|10|30) · setWindow(10|30|120) · pause() · resume() · refreshNow()
subscribe(listener) => unsubscribe   ·   getState(): RuntimeState

RuntimeState = {
  preferences, ring, conditions, displayed, events, gaps,
  paused, hidden, consecutiveFailures, lastFailure,
  mode: 'live' | 'paused' | 'stale' | 'expired',
  severity: Severity | null,        // §9's dot
  alarms: number,                   // §9's count — omit it at zero, in the RENDERING
  unknownStanding: readonly string[],   // reachable in production since S34 closed
}

DisplayedCondition gains:  stale: boolean · lastSeenMs: number · enumeration: string | null

ageMs(state, nowMs): number | null   ·   latestSample(state): Sample | null   // newest by ts
samplesWithin(ring, windowMs)        // ⚠ no nowMs — anchored on the newest sample's ts
seriesFrom(samples, pick) · decimateSeries(points)   // 600 points PER SERIES
formatAge(ms)                        // clamps a negative age to `0 s`
MAX_SAMPLES · MAX_RENDERED_POINTS · MAX_EVENTS · BACKOFF_CAP_MS · LONGEST_WINDOW_MS
CADENCE_SECONDS · WINDOW_MINUTES · DEFAULT_PREFERENCES · cadenceMs() · windowMs()
staleAfterMs(cadenceMs) · modeOf(input) · isStale(input)
anyGapReason(state) · gapIsOpen(gaps)
```

**Not a panel surface:** `conditionsFrom` (un-deduped by design — `unit:gpu-fan-control.service`
comes out twice). Use `state.displayed`.

---

## 7. Evidence gathered so far

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ cd dashboard && pnpm verify
 Test Files  57 passed (57)
      Tests  1982 passed (1982)
Type Errors  no errors
VERIFY_EXIT=0
TREE IDENTICAL TO BASELINE
```

1867 → 1982 tests; 55 → 57 files. The two new files are `gaps.test.ts` and `mode.test.ts`.

### The six inherited harnesses, each run alone, manifest diffed after each

| harness | result | ledger |
|---|---|---|
| `02-format-severity` | **47/47**, exit 0 | **clean** — ledger retrofitted this phase; 8 ⚠ tests checked |
| `03-collectors-gpu-host` | **64/64**, exit 0 | no ledger (pre-dates it) |
| `04-collector-cooling` | **90/90**, exit 0 | clean, 81 ⚠ tests |
| `05-collectors-serving-storage-safety` | **127/127**, exit 0 | clean, 94 ⚠ tests |
| `06-telemetry-route` | **61/61**, exit 0 | clean, 54 ⚠ tests |
| `07-auth-login` | **116/116**, exit 0 | clean, 104 ⚠ tests |

Every run reported `TREE IDENTICAL TO BASELINE` afterwards.

New mutations added to inherited harnesses this phase, all biting:

- **step 2** `R49`, `R50` (negative age, absent age), `R51`–`R55` (the five unbacked
  safety-critical marks); `R25` and `R28` **re-aimed** onto the rewritten `observePoll`.
- **step 4** `T70`–`T83` — stale/retired, the worst-severity dedupe, the conflict report, and
  the gap rule, all against `lib/conditions.ts`.
- **step 6** `A17`, `A18` — the server tidying or dropping `STANDING`.
- **step 7** `C10`, `C11`, `C12` — the same, in `readStandingList`.

---

## 8. Deliberately not doing

- **Not weakening §6.7's `ts` dedupe.** F4 is about a *run* of repeats. The dedupe is untouched.
- **Not refusing a snapshot whose COOLING and SAFETY unit states disagree.** Partial truth beats
  no truth (§6.5). The reduction takes the worse and logs it once.
- **Not expiring a stale condition on a timer.** That is F3 reintroduced with a `setTimeout`.
- **Not preserving pre-gap accrued hold time.**
- **Not adding jsdom** (D6 records what would change it).
- **Not committing, staging or touching git.**
- **Not editing `SPEC.md`, `MOCK.html` or `PLAN.md`.**
- **Not retrofitting the ledger to step 3's harness** — out of this step's scope; carried as an
  obligation for whoever next touches `lib/collectors/`.

---

## 9. What is left

### 9.1 Re-aim step 8's harness — `pipeline/steps/08-client-runtime/regressions.py`

`python3 pipeline/steps/08-client-runtime/regressions.py` will report **20 ANCHOR NOT FOUND**
until this is done. A script that lists them without running vitest:

```python
# save as /tmp/anchors8.py, run from dashboard/
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location("r8", "pipeline/steps/08-client-runtime/regressions.py")
mod = importlib.util.module_from_spec(spec); sys.modules["r8"] = mod; spec.loader.exec_module(mod)
for entry in mod.REGRESSIONS:
    name, src, pairs, check = (entry[0], entry[1], [(entry[2], entry[3])], entry[4]) if len(entry) == 5 else entry
    text = pathlib.Path(src).read_text()
    if [o for o, _ in pairs if o not in text]:
        print(f"{name.split()[0]:5s} {src:32s} {name}")
```

The twenty, and where each property now lives:

| id | now aim at |
|---|---|
| `R5` | `ring.ts`'s eviction block — it gained a `newest` recompute and a `samples` local |
| `W5`, `W14` | `wire.ts`: `if (typeof duty !== 'number' \|\| !Number.isInteger(duty)) return undefined;` and the new range line |
| `O1` | `observations.ts`'s `push` — it gained an `enumeration` parameter |
| `U1`, `U2` | `runtime.ts`'s repeat branch: `this.applyMode({ consecutiveFailures: 0, lastFailure: null });` inside `if (ring === this.state.ring)` |
| `U3`, `U21`, `U32` | the `switch` moved inside a `try`; the case bodies are indented one level further |
| `U8`, `U9`, `U10` | gaps moved to `gaps.ts`. `U8` → `openGap`'s `fromMs`; `U9` → `observeSample`'s `toMs: atMs`; `U10` → `runtime.ts`'s `consecutiveFailures: 0` in `accept` |
| `U15`, `U16` | `refreshNow()` gained the `hidden` guard |
| `U17` | `setCadence` calls `applyMode`, not `patch` |
| `U18`, `U22` | `standing` is per-poll: `const standing = standingIdsFrom(wire.snapshot.standing);` and `unknownStanding: standing.unknown` |
| `U19`, `U20` | `modeOf` moved to `mode.ts`; aim at its precedence chain there |
| `U33` | `fail()` is now three lines calling `applyMode` |

### 9.2 New step-8 mutations to add

`LEDGER_FILES` must gain `lib/client/gaps.test.ts` and `lib/client/mode.test.ts`; the ledger
will then name every new ⚠ test that still needs one. At minimum:

- **the hidden-gap erasure the old suite missed** — the review names this explicitly. Mutate
  `observeSample`'s `anyGapReason(state) === null` to `true` (close unconditionally); it must
  redden `⚠ a poll landing after the tab went hidden does not close the gap` in `gaps.test.ts`
  **and** the runtime fixture of the same name.
- `anyGapReason` returning only the reason that opened the gap (drop the `paused`/`failed` arms).
- `openGap` falling back to a browser clock when the ring is empty.
- the prune horizon taking `nowMs` instead of the newest `ts`.
- `afterGap` never being computed (`const afterGap = false`) — F7 end to end.
- `modeOf` losing its age term; `isStale` losing the negative-age clause; `staleAfterMs` losing
  its floor.
- `newestSample` returning `ring.samples.at(-1)`; `samplesWithin` anchoring on a browser clock.
- `refreshNow` losing the `hidden` guard.
- the arrival-path `try` removed (C1).
- **F9's pair**: one plain `const go = fetch;` in a client module (text guard), and one
  `Function('return fetch')()` call (runtime guard only — it names neither `fetch` nor
  `globalThis`, so it is the `U25` demonstration for the network).
- `wire.ts` dropping `standing`, coercing it to `[]`, or validating the ids.
- `events.ts` dropping the stale/retired/returned/conflict feeds, or keeping the **first**
  `errors[]` message.
- `observations.ts`'s `enumerationsRead` treating `null` as `[]`.

### 9.3 Write `reconciliation.md`

This file is most of it. It needs: the final harness numbers from §9.1–9.2, the ten `pnpm
verify` runs, and the real pasted output.

### 9.4 Rewrite `pipeline/HANDOVER.md` for step 9

Currently 56 KB and describes the pre-fix world. It must carry, at minimum:

- the manifest procedure (§0 above) as the standing revert check — **M12**;
- the corrected surface (§6 above), including `samplesWithin`'s dropped parameter;
- every open obligation with its owning step: **D1** S40's third event-log feed (10),
  **D2** the independent age tick (10), **D3** render `unknownStanding` (10),
  **D4** `errorsForPanel(snapshot, panel)` (9), **D5** `traceFor(state, pick)` (9),
  **D6** jsdom + `useTelemetry` unmount (9 or 10), **D7** S11/G5, S19, S30 (9, 10),
  **D8** `STANDING` env plumbing (11) verified (12), **O19** the GB→GiB brand rename (9),
  the ledger retrofit for step 3, and the commit point (owner);
- the three corrected over-claims (§5) — **never in their original form**;
- the four composition gaps for 9/10: `conditionsFrom` is un-deduped; there is no
  `ErrorSource → panel` selector; `samplesWithin → seriesFrom → decimateSeries` is a
  three-call incantation whose order is silently load-bearing; `state === null` is *before the
  first poll*, not missing data;
- Part 6's twelve "must not leak into steps 9 and 10" rules from `review.md`;
- S35's measured divergence point, R3's monotonic-clock note, and the five dropped ⚠ marks;
- the `isolate: false` note, alongside "do not run a harness concurrently with `verify`";
- step 9's own scope: panel shell, chips, meters, rows, sparkline, stacked cooling chart;
  `MOCK.html` is a **reference, never a source**.

### 9.5 Evidence

Run `pnpm verify` **at least ten times**, serially, and paste real output. Re-run step 8's
harness last, alone, and diff the manifest after it.
