# Handover — after step 8, before step 9

Steps 1 (**Scaffold & contract**), 2 (**Format & severity core**), 3 (**GPU & host
collectors**), 4 (**Cooling collector**), 5 (**Serving / storage / safety**), 6 (**Telemetry
route**), 7 (**Auth & login**) and 8 (**Client runtime**) are closed. This file is the whole
inheritance: the step-9 agents get clean context and read it as fact.

**Step 9 is UI primitives and charts** — panel shell, chips, meters, rows, sparkline, and
§6.2's stacked cooling chart. Green when render tests distinguish `null` → `—` from `0 RPM`,
and the cooling chart is **two stacked plots, never a dual axis**.

⚠ **`MOCK.html` is a reference, never a source.** It shows four states and it predates several
spec decisions (S30's sixth login row is the recorded example). Do not import from it, do not
copy a number out of it, and where it disagrees with `SPEC.md`, the spec wins. Its value is
that it shows what the thing is meant to *look* like.

**Three things step 9 must inherit rather than rediscover:**

- ⚠ **A cell's colour is NOT a condition.** §6.4: a cell calls `lib/severity.ts` on the
  **current reading**, undebounced. `state.displayed` is the banner's and the log's input, and
  a cell that took its colour from there would lag the figure printed inside it by ten seconds.
- ⚠ **`null` renders `—`; `0` renders `0 RPM`** (invariant 1). Every formatter in
  `lib/format.ts` already applies this law once. Do not re-implement it in a component, and do
  not split a formatter's output on whitespace — ask for a `parts` variant (O14).
- ⚠ **A gap is drawn from `state.gaps`, never inferred from holes in a series.** Decimation
  drops a `null` inside an otherwise readable bucket, so a hole in a trace is not evidence of
  anything. The gap list carries real endpoints and survives every rendering.

---

## 0. ⚠ The revert check — `git status`, and the manifest that preceded it

**`dashboard/` is now committed** (`71a2f7d`, branch `dashboard-backend`), so `git status
--short` and `git diff --stat` finally work as a revert check and are the primary one. That is
new in step 8: before the commit an untracked `dashboard/` collapsed to `?? ./`, and a source
file left mutated by a killed harness was invisible.

**The manifest procedure still works and is still the one to use inside a phase**, because it
is cheap enough to run after **every** harness rather than once at the end (M12):

```bash
cd dashboard
find lib app proxy.ts -type f | sort | xargs md5 > /tmp/manifest.before
# …one harness, or one `pnpm verify`. NEVER two at once. …
find lib app proxy.ts -type f | sort | xargs md5 | diff /tmp/manifest.before - \
  && echo "TREE IDENTICAL TO BASELINE"
```

A current snapshot lives at `pipeline/steps/08-client-runtime/manifest-baseline.txt`.
**A harness killed mid-mutation leaves the file mutated on disk** — the `finally` that restores
it never runs — so the check is not ceremony.

⚠ **`build.md`'s advice to "check `git status` before believing it" was wrong when written**
and is recorded here in its corrected form only. Two other `build.md` claims are corrected in
§5.3; none of the three may be repeated as originally written.

---

## 1. How to run anything

`pnpm` is installed through corepack into a directory that is **not** on this machine's
`PATH`, and this Mac has two Nodes. Every command starts with the export:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
node -v            # v24.16.0   ← the pinned major
pnpm verify
```

| Script | What it is | Use it for |
|---|---|---|
| **`pnpm verify`** | `rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run` | **The only definition of green.** |
| `pnpm test` | `vitest run` | Iterating. Not authoritative on its own |
| `pnpm typecheck` | `tsc --noEmit` | Iterating — incremental, and see below |
| `pnpm build` | `next build` | **Run it before closing step 9** — it touches `app/` |
| `pnpm dev` / `pnpm start` | dev server / prod server | Local only — see §10 |

### ⚠ The Node pin, and the `PATH` line that quietly defeats it

```
$HOME/.local/bin/node  →  $HOME/.hermes/node/bin/node   v26.8.1
$HOME/.nvm/versions/node/v24.16.0/bin/node               v24.16.0   ← the pinned major
```

`pnpm` is corepack's `pnpm.js` behind `#!/usr/bin/env node`, so pnpm — and therefore Vitest,
`tsc` and `next build` — run on whichever `node` comes first. Putting `$HOME/.local/bin` first
selects Node 26 against a manifest that says `<25.0.0`. The export above fixes it. **Steps 7
and 8 added no native module and no dependency**, so `NODE_MODULE_VERSION` no longer decides
anything — the pin now matters only for behavioural drift. `.nvmrc` and `.node-version` both
say `24`, and `lib/guardrails.test.ts` asserts the three files agree.

Toolchain: pnpm 12.3.4 (pinned by `packageManager`), TypeScript 7.0.2 (the native Go
compiler), Vitest 5.0.0, Next 16.3.4, React 19.2.8. **Eight dependencies, all pinned exactly,
and steps 1–8 added zero.** Invariant 6 still stands: no dependency without recording why in
the step's notes. **Step 8 considered jsdom and declined it** — see §9; step 9 is the next
place it has a case, and D6 records the first assertion it would buy.

### ⚠ Green means `pnpm verify` exits 0. Nothing else is evidence.

The Vitest summary lies, in three measured ways:

| what was broken | what the summary printed | real exit |
|---|---|---|
| type error in `app/page.tsx` (no test imports it) | `Test Files 3 passed (3)` · `Type Errors no errors` | **1** |
| failing type assertion at module scope in a `*.test-d.ts` | `Tests 57 passed (57)` · `Type Errors no errors` | **1** |
| **a test file that fails to compile** | `Test Files 3 passed (3)` · `Tests 57 passed (57)` | **1** |

The third is the worst: a file that fails to compile does not fail its tests, it **loses them
from the count**.

**And there is a fourth, found in step 7.** `pnpm typecheck` exited **0** on a tree carrying a
`TS2305` — a test file importing a just-deleted export — because `tsconfig.tsbuildinfo` was
stale. `pnpm test` then failed at *runtime*, and Vitest's own typecheck block printed
`Type Errors no errors`. Both directions have now been paid for:

- a **false failure** (step 3) costs a bisect;
- a **false pass** (step 7) **ships the bug**.

So `verify` deletes the build-info file first. `pnpm typecheck` stays incremental for
iteration and **is not the green signal**. `lib/guardrails.test.ts` asserts `verify`'s exact
text, so it cannot be quietly weakened.

**Vitest's `typecheck` block covers only `*.test-d.ts`.** A loosened brand in `lib/` shows up
as an *unused* `@ts-expect-error` in a `.test.ts`, which `vitest run` does not see and `tsc`
does. Per-file `pnpm vitest run <file>` is **not** a substitute while iterating: steps 3, 5 and
6 each shipped a type error that only the full `tsc` caught.

### ⚠ Run the suite more than once when anything it asserts is random

Step 7 shipped a test that **failed 1 run in 16** and could not be reproduced by the phase that
wrote it. See §5.4. When a change touches anything that consumes entropy or a clock, run
`pnpm verify` in a loop — step 7's reconciliation ran it **20 times**, step 8's **10**.

### The deliberate-regression harnesses — run all seven after any change in `lib/` or `app/`

```bash
python3 pipeline/steps/02-format-severity/regressions.py                    #  47 mutations + ledger
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                #  68 mutations + ledger
python3 pipeline/steps/04-collector-cooling/regressions.py                  #  91 mutations + ledger
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py  # 127 mutations + ledger
python3 pipeline/steps/06-telemetry-route/regressions.py                    #  63 mutations + ledger
python3 pipeline/steps/07-auth-login/regressions.py                         # 116 mutations + ledger
python3 pipeline/steps/08-client-runtime/regressions.py                     # 158 mutations + ledger
```

**679 mutations.** Each replaces one exact string in one source file with a **plausible wrong
implementation** — the wrong thing someone would actually write, never a syntax error — runs
the affected check, and restores the file. Every one must exit 1. Step 1 has no harness.

⚠ **Do not run a harness concurrently with `pnpm verify` or with another harness.** They mutate
source files in place. Concurrency produces a plausible false `TS6133` **and** a ledger that
falsely reports ⚠ tests as uncovered — both quotable rather than obviously broken. Serialise.
Steps 4, 5, 7 and 8 each take several minutes, and **a harness writes nothing to stdout until
it exits** (Python block-buffers to a file), so run it in the background and wait on
`until ! pgrep -f regressions.py; do sleep 3; done`.

⚠ **`ANCHOR NOT FOUND` and `DID NOT BITE` are different findings.**

- **`ANCHOR NOT FOUND`** means the implementation moved and the mutation needs **re-aiming**.
  It does not mean the test is fine. Step 7 re-aimed thirteen; step 8's reconciliation re-aimed
  **twenty**, after its own fixes moved the code the mutations pointed at.
- **`DID NOT BITE`** means the mutation applied and nothing noticed. **The first hypothesis is
  a missing or inert test, not a bad mutation.** Step 8's reconciliation found six, and all six
  were missing fixtures.

⚠ **Two shapes of `DID NOT BITE` that are not a bad mutation, and both have now happened:**

1. **Adding a `try`/`catch` removes a distinction** (step 7). `N2` had bitten for six phases;
   the moment the handler wrapped its verdict in the catch §5 requires, both implementations
   answered 204 and the test asserted only the status. The fix was a stronger test — assert
   what was *written*, not what was *returned*.
2. ⚠ **Adding a second, independent defence makes the first one's mutation inert** (step 8).
   `W4` removed `wire.ts`'s ISO-shape guard and had bitten since step 8's build. F13 then added
   a calendar round-trip, which independently refuses every row the test table held — so the
   mutation applied, the property stayed true, and the guard's own coverage silently went to
   zero. **The fix is a fixture in the region only the first guard can see**: the round-trip
   compares 19 characters, so a non-canonical *spelling* of a correct instant
   (`…T14:02:11.000+00:00`, `…T14:02:11.4821Z`) passes it. That is not cosmetic — §6.7's dedupe
   is keyed on the `ts` **string**, so one instant under two spellings enters the ring twice.
   **Whenever a fix adds a defence, re-run the harness and read what stopped biting.**

⚠ **`ANCHORS MOVED` and `DID NOT BITE` are now printed as separate summary lines.** Until
2026-09-07 all seven harnesses appended an anchor miss to the same list and reported it under
`DID NOT BITE` — the more alarming of the two labels, sending a reader to hunt for a missing
test that is not missing. Found when an edit to `cooling.ts` moved step 4's `T31`.

⚠ **Ledger ownership follows the FILE, not the step.** A ⚠ test added to a file already in an
earlier step's `LEDGER_FILES` needs its mutation in **that** step's harness. Step 8 added ⚠
marks to `lib/conditions.ts` and `lib/format.ts`, so the ledger was **retrofitted to step 2's
harness** — and immediately found **six pre-existing ⚠ marks with no mutation behind them**,
five of them on `severity.ts`'s fan-stopped rows, including the `-0` / `Object.is` trap. All
six are now backed (`R51`–`R55`, and `T51` in step 4). ⚠ **Step 3's harness gained its ledger on
2026-09-07, and all seven now have one.** That retrofit found **four ⚠ marks with no mutation
behind them** — a temperature that must not gain a plausibility range, the *total* half of O7's
backwards-counter guard (fixture symmetry: only the *busy* half had a mutation), and `gpus: []`
collapsing to `null`. The fourth had its ⚠ dropped: it depends on nothing under
`lib/collectors/`, so no step-3 mutation can reach it.

⚠ **A ⚠ mark with two owners is a mark neither owner has to back.** `lib/conditions.test.ts`
was in step 4's `LEDGER_FILES` *and* was about to be added to step 2's. Step 2's ledger was
scoped to `format.test.ts` + `severity.test.ts` instead, and the conditions mutations went into
step 4 as `T70`–`T83`.

⚠ **The harness prints only the first three FAIL lines per mutation.** Reading coverage off the
printed log is therefore wrong; the ledger unions *all* of them. This cost one wrong conclusion
in step 8. **Trust the ledger's verdict, never the printed excerpt.**

⚠ **A `test.each` name whose first `%` falls early is unmatchable by the ledger**, and the
harness now warns (`⚠ test name is unmatchably short`).

⚠ **Mutation ids must be unique within a harness.** Step 8's reconciliation added nine that
collided with existing ids (`E1`–`E5`, `W15`, `W16`, `U34`, `U35`), which makes the
`DID NOT BITE` list ambiguous about which entry failed. Check before adding:
`grep -oE '^    \("[A-Z]+[0-9]+' regressions.py | sort | uniq -d`.

---

## 2. What exists

Everything under `dashboard/`. Nothing outside it has been created or modified except the root
`.gitignore`.

| Path | What it is |
|---|---|
| `lib/types.ts` | **The telemetry contract** + §3.7's closed vocabularies. ⚠ `standing: readonly string[]` is new in step 8 — **required, never `null`** |
| `lib/fixtures.ts` | **Canonical snapshots**, exported for every later step. Both roots carry `standing: []` |
| `lib/format.ts` | **§6.6** — every formatter, its two laws, and `formatAge` |
| `lib/severity.ts` | **§6.3** — every threshold row |
| `lib/throttle.ts` | **§3.7** — the `clocks_throttle_reasons.active` decoder |
| `lib/conditions.ts` | **§6.4 + §9** — `observePoll`, the ten-second hold, the ledger, standing, §6.5's stale/retired edges, §9's worst-wins dedupe |
| `lib/units.ts` | **New in step 8.** `FAN_SERVICE_UNIT`, `servingUnitName` — moved out of `lib/collectors/dbus.ts` so §6.4's ids can be built in a browser without dragging `node:net` into the bundle. ⚠ **It imports nothing, and a test holds that line** |
| `lib/source-text.ts` | `codeOnly`, `sourceFiles`, `projectRoot` — the guardrails' inputs |
| `lib/collectors/*.ts` | The six collectors, their seams, parsers and bounds — **finished** |
| `lib/telemetry/*.ts` | §4's cache, gate, ceiling, assembly, source and handler |
| `lib/auth/*.ts` | scrypt, base64url, config, cookie, session, revocations, rate-limit, authorize, handler, login-view |
| **`lib/client/*.ts`** | **New in step 8** — see §3 |
| `app/api/telemetry/route.ts` · `app/api/session/route.ts` | `dynamic` + the handler names, and nothing else |
| `app/login/page.tsx` · `login-form.tsx` | `/login`, and `LoginForm` (stateful) + `LoginCard` (**pure**) |
| `proxy.ts` | §5's gate. **`proxy.ts`, NOT `middleware.ts`** — §7 |
| 57 test files | **1982+ tests** |
| `package.json` · `pnpm-lock.yaml` · `tsconfig.json` · `next.config.mjs` · `vitest.config.mts` | pinned toolchain; `strict` + seven more flags, all asserted |
| `app/layout.tsx` · `app/page.tsx` | placeholders. ⚠ **`app/page.tsx` must stay free of telemetry** — see §6 |

**Does not exist yet:** any component, panel or chart; `Dockerfile`, `.dockerignore`,
`dashboard.sh`, the systemd unit, `README.md`, jsdom.

---

## 3. The public surface step 9 builds on

### 3.1 ⚠ The client runtime (step 8) — this is the corrected surface, not `build.md`'s

```ts
useTelemetry(): { state: RuntimeState | null; runtime: TelemetryRuntime | null }   // NO options

new TelemetryRuntime(env)   ·   start() · stop()
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

DisplayedCondition gains:  stale: boolean · lastSeenMs: number · enumeration: string | null

ageMs(state, nowMs): number | null   ·   latestSample(state): Sample | null   // newest by ts
samplesWithin(ring, windowMs)        // ⚠ NO nowMs parameter — anchored on the newest sample's ts
seriesFrom(samples, pick) · decimateSeries(points)   // 600 points PER SERIES
formatAge(ms)                        // a negative age never renders as a negative number
anyGapReason(state) · gapIsOpen(gaps) · modeOf(input) · isStale(input) · staleAfterMs(cadenceMs)
MAX_SAMPLES · MAX_RENDERED_POINTS · MAX_EVENTS · BACKOFF_CAP_MS · LONGEST_WINDOW_MS
CADENCE_SECONDS · WINDOW_MINUTES · DEFAULT_PREFERENCES · cadenceMs() · windowMs()
```

⚠ **`samplesWithin` lost its `nowMs` parameter in step 8's reconciliation.** Any call written
from an older note will not compile, which is the safe direction — but do not re-add it. The
window is `[newest.tsMs − windowMs, ∞)`, anchored on the data (§6.7). Anchored on the browser's
clock instead, a server 31 minutes behind empties a 30-minute chart **while the ring is full of
good data and the header still reads `live`**.

⚠ **`conditionsFrom` is NOT a panel surface.** It is deliberately un-deduplicated —
`unit:gpu-fan-control.service` comes out **twice**, once from COOLING and once from SAFETY —
and §9's reduction is what collapses them. A panel that mapped it to rows would render the fan
service twice and count two alarms for one fault, which is the outcome §9 forbids by name.
**Use `state.displayed`.**

### 3.2 The telemetry endpoint

```
GET /api/telemetry
  200 → TelemetrySnapshot (§4), Cache-Control: no-store
  401 → NO BODY, Cache-Control: no-store          ← session missing, expired or revoked
```

- **2 s cache holding the IN-FLIGHT promise.** At 1 s you receive the same `ts` two or three
  times in a row. **A repeated `ts` is not a failed poll** — step 8 handles it; step 9 sees
  only that the state object is returned by identity.
- **`ts` is the poll's start**, so an age computed from it can only over-state.
- **A partial snapshot is a 200 with `errors[]`** — the normal case on this machine
  (invariant 5).
- ⚠ **`errors[]` is in the snapshot's own field order** (gpus, host, cooling, serving,
  storage, safety) — but that is **this project's decision, pinned by a test, not §4's
  contract.** `grep -n "field order" SPEC.md` is empty. The earlier handovers stated it as
  contract; it is stated correctly here. It is load-bearing anyway, and that is why it is
  pinned: **`dbus` is filed by two collectors** (`collectSafety` for the fan service,
  `collectServing` for the llama units), and §6.7's client rule shows the **last** message
  per source, so the order decides which D-Bus sentence an operator reads. `snapshot.ts`
  states the reason, `snapshot.test.ts` pins it, and step 6's `A19` mutation backs it.
  §6.5 matches an entry to a figure by `source`. Eighteen sources, closed (§3.7).
- **`serving: null` is not `[]`**, on the wire and after any validation.
- ⚠ **`standing: string[]` is required and echoed verbatim** (S34). It is configuration, not a
  reading, so `null` is not one of its values, and the **client** reads it from every accepted
  sample. ⚠ **The SERVER does not.** `createTelemetrySource` captures it **once, at
  construction**: in production the value reaches `process.env` through Docker's `--env-file`,
  which reads `/etc/ai-dashboard.env` at `docker run` and never again, so a per-sample re-read
  answered the same value every time while implying it might not. **Changing `STANDING`
  requires a container restart.** §4 still says *"a change takes effect on the next poll"* and
  is owed a correction (§8). Settled by the owner 2026-09-07; `source.test.ts` pins it and step
  6's `A20` backs it.

### 3.3 ⚠ The auth surface — exactly one module of it is client-safe

```ts
// lib/auth/login-view.ts — pure strings and pure functions, NO imports at all.
export const LOGIN_PATH   = '/login';         // step 8 routes a 401 here
export const SESSION_PATH = '/api/session';   // ← step 10's logout calls DELETE here
export const EXPIRED_PARAM = 'expired';       // presence, not value
export const loginView · loginOutcome · retryAfterSeconds · LOGIN_WORDMARK · …
```

⚠ **Do not import anything else from `lib/auth/` in client code.** Everything else reaches
`node:crypto` and process-global state. Two ⚠ tests hold the line: one asserts the module has
**no imports at all**, the other refuses a quoted `'/login'` or `'/api/session'` anywhere else.
**A third spelling of either path turns that test red, which is the point.**

**A revoked cookie can still fetch the HTML shell.** The gate (`proxy.ts`) makes the
cryptographic verdict only; the **revocation** check runs on every `/api/*` route. So `GET /`
with a logged-out cookie is a 200, and its first `GET /api/telemetry` is the 401 that sends the
user to `/login`. That is acceptable **only while the shell carries no telemetry and no
secrets** (§6) — **including `standing`**, which is why S34 put it on the snapshot rather than
on a server-rendered prop.

### 3.4 The rest, unchanged from step 6

```ts
collectGpus · collectCpuTemp · collectHost · collectCooling · collectServing · collectStorage
collectSafety · collectUnitStates   ·   CollectorIo · HttpIo · DbusIo · StatvfsIo
MAX_TIMEOUT_MS · boundedTimeoutMs · deadline · boundedReader
reason · errnoCodeOf · tag · ParseResult<T> · clean<T>
NO_DELTAS · advanceDeltas · cpuPctBetween · netRatesBetween · withServiceState
observePoll · conditionsFrom · DEFAULT_PATHS · FAN_CHANNELS · PWM5_FILE · …
```

Branded units — `Celsius` `Watts` `MiB` `GiB` `GB` `MHz` `Rpm` `Percent` `BytesPerSecond`
`Seconds` `Pwm` `Port` `Tokens` over `number`; `IsoTimestamp` `ThrottleMask` over `string`.
⚠ **The constructors name a unit; they do not validate one.** They are `v as T`, erased at
runtime — so **O10: no `as TelemetrySnapshot` on a `fetch` response**. Validate the wire shape;
do not assert it.

Closed vocabularies, switched over exhaustively: `Severity` · `UnitState` (6) · `LinkState`
(7) · `HealthState` (3, field is `| null`) · `Ch5Mode` · **`ErrorSource` (18)** ·
`ThrottleTreatment` · `ThrottleReasonName` (8). `noFallthroughCasesInSwitch` is on and
asserted. **Steps 3–8 produced all eighteen sources and no nineteenth was ever needed.** If
step 9 needs a new one, that is a spec gap to **report**, not a blank to fill.

---

## 4. Obligations, with owning steps

### Closed by step 8

| # | What it was | How it closed |
|---|---|---|
| **O5** | Step 8 holds the "already logged" state for a standing condition | `loggedStanding` in `events.ts`. ⚠ It is **not reset** when `STANDING` changes mid-session: it belongs to the session, not the configuration (S52) |
| **O10** | No `as TelemetrySnapshot` on a `fetch` response | `wire.ts` validates every field. A ⚠ type test proves the cast is impossible |
| **O11** | `conditionsFrom(snapshot)` is ONE function serving the log and the banner | It is — and §3.1's warning is the other half of it |
| **step 8's own timer guard** | §5.3 required one | `lib/client/guardrails.test.ts`: a text guard, a behavioural guard, and a runtime globals guard, and they see different things |

### Still open

| # | One line | Owner |
|---|---|---|
| **O1** | `Condition.severity` is the **confirmed** band, never a raw per-poll severity. Cell colour is **not** downstream of a condition | **steps 9, 10** |
| **O2** | The dot and the alarm count are ONE reduction. A suppressed standing condition is neither red nor counted; the count is **omitted when zero** | step 10 |
| **O3** | One reading, one condition — dedupe by id. Channel 5's zero is carried by `fan5_absolute` and is never a `fan_stopped` subject | step 10 |
| **O4** | `DisplayedCondition.sinceMs` is when the **confirmed** band was first observed | step 10 |
| **O12** | A reading with no §6.3 band is invisible to §9's dot. **Do not invent a band** — report it | step 10 |
| **O13** | `EC auto` and `unavailable` are **not** severities. `EC auto` is healthy (invariant 3) | **steps 9, 10** |
| **O14** | Formatters return unit-inclusive strings; ask for a `parts` variant rather than splitting on whitespace | **step 9** |
| **O19** | ⚠ **The GB → GiB rename.** §6.6 and decision 20 say **GiB**; the value already is one. The brand `GB`/`gb()`, `Filesystem.usedGB`/`totalGB` and `formatGB`'s ` GB` suffix still say GB — 98 occurrences, 10 files. **The rendered suffix is currently wrong against the spec** | **step 9** |
| **O20** | ⚠ `dashboard.sh set-password` must emit `scrypt.<log2N>.<r>.<p>.<salt>.<key>` — §4.1 | **step 11** |
| **O21** | ⚠ `SESSION_SECRET` must be written unquoted — §4.1 | **step 11** |
| **O22** | ⚠ **One process, one module instance.** A **security** obligation — §4.1 | **steps 11, 12** |
| ~~O23~~ | **Closed 2026-09-07** — the hasher moved to `scripts/hash-password.py` on the host. See §4.1 for what it cost and how that is paid | closed |

O6–O9, O15–O18 are closed (steps 3–6).

### ⚠ Step 8's DEFER list, verbatim, with owners

| # | What | Owner |
|---|---|---|
| **D1** | **S40.** §6.4's event log gains a third feed — state fields with a closed vocabulary and no §6.3 band (`ch5Mode`). Spec clarification now; code later | **step 10** |
| **D2** | **S41.** The age tick is an **independent** interval, **not** driven off store changes — see §6 rule 4 | **step 10** |
| **D3** | `unknownStanding` is rendered, or removed from `RuntimeState` | **step 10** |
| **D4** | `errorsForPanel(snapshot, panel)` written **once**, beside `conditionSource` | **step 9** |
| **D5** | `traceFor(state, pick)` so no panel spells the window→series→decimate order itself | **step 9** |
| **D6** | jsdom, and the first assertion it buys: unmounting `useTelemetry` calls `stop()` | **step 9 or 10**, whichever first needs an interaction test |
| **D7** | S11/G5, S19, S30 — inherited and untouched by step 8 | **steps 9, 10** |
| **D8** | The `STANDING` env plumbing, and its place on §4.1's silent-failure list | **step 11**, verified **step 12** |
| — | ~~The red-test ledger retrofit for step 3's harness~~ — **done 2026-09-07.** All seven harnesses now carry a ledger | closed |
| — | **A commit point** — `71a2f7d` was taken before step 9. The next is the owner's call | **owner** |

### 4.1 ⚠ The three step-11 obligations that fail **silently**, stated in full

**O20 — the hash format.** The server verifies with **scrypt**, in exactly this encoding:

```
scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>      six dot-separated fields over [A-Za-z0-9._-]
```

`parseScryptHash` returns `null` for anything else — **including a perfectly correct argon2id
hash**. And `null` is not an error: it is a clean, empty **401** on every login attempt, with
**nothing logged anywhere** (§5 logs nothing about authentication, deliberately). The symptom is
*a dashboard that will not open and will not say why*. **Use `hashPassword()` from
`lib/auth/scrypt.ts`; do not reimplement the encoder.**

**O21 — the env file's grammar is Docker's, and it does not strip quotes.** `--env-file` splits
on the **first** `=`, takes the rest verbatim, expands nothing, and **keeps quotes**. So
`SESSION_SECRET="…32 chars…"` becomes a 34-character secret with two quote characters baked in.
It **passes** the 32-character floor, produces a working dashboard, and every session dies the
moment anyone rewrites the file without quotes. Every value must be single-line, **unquoted**,
with no surrounding whitespace, and must avoid `$`.

**O22 — "one process, one cache" is now security and availability, not performance.**

| object | built at | what a second instance costs |
|---|---|---|
| `TelemetrySource` | `lib/telemetry/handler.ts` load | a second 2 s cache, a doubled `nvidia-smi` fork rate — **performance** |
| `productionRevocations` | `lib/auth/revocations.ts` load | **`DELETE` stops working** for requests landing on the other instance — a silent security regression |
| `productionRateLimiter` | `lib/auth/rate-limit.ts` load | §5's **global** limit becomes N× looser, and the KDF queue is no longer bounded |

Nothing in the suite can see any of this, because the suite runs one process by construction.
This is the shape of the ufw incident in the repo's own `CLAUDE.md` (`is-active` green on a
disabled firewall). **Step 11 must assert one process; step 12 must verify it on the box.**

### ~~O23~~ — closed 2026-09-07 by moving the hasher to the host

**It was:** the box has **no Node** (measured), so `dashboard.sh set-password` had to run
`hashPassword()` inside the image — which forced `set-password` to happen after `build`, and
which would probably have failed anyway, because `output: 'standalone'` traces only what the app
imports and **`hashPassword` is imported by nothing**.

**It is now:** `scripts/hash-password.py`, run on the host with the password on **stdin**. The
ordering constraint and the tracing dependency are both gone.

⚠ **The cost, and it is the one thing to keep an eye on:** that is a **second producer of a
format whose only failure mode is a silent 401**, which is on the do-not-copy list for a reason
— this project shipped it once when two base64url decoders diverged. **It is paid for by
measurement, not by a comment.** `lib/auth/hash-password-script.test.ts` runs the real file and
asserts the server's own `verifyPassword` accepts what it wrote, reads the parameters back out
of the encoded form (a weaker `logN` parses, verifies, and is simply wrong), and pins §5.1's
policy on both sides of each boundary. **Nine mutations back it — `Y1`–`Y9` in step 7's
harness.** The two implementations share six constants and nothing in either language holds them
equal; that test does. **If `scripts/hash-password.py` is ever edited, it is the thing that must
stay green.**

⚠ **`python3` is now a hard requirement of the test suite**, deliberately un-skipped: a skipped
test is the inert test the ledger exists to catch, and a host without python3 cannot deploy this
anyway.

⚠ **D8 belongs on this list too.** With `STANDING` absent or misspelled in
`/etc/ai-dashboard.env`, nothing is suppressed and the banner is nailed open by a condition the
operator has already accepted — with no error anywhere. `dashboard.sh check` should report a
`STANDING` entry that matches no condition id or kind; the client already computes exactly that
list as `state.unknownStanding` (D3).

---

## 5. ⚠ The four structural rules — inherited by steps 9–12

They catch four different things and none subsumes another.

### 5.1 Fixture symmetry — catches a boundary tested from one side

> **Every boundary guard needs a fixture on both sides of its boundary.** For any `x !== N`,
> `x < N` or `x > N` in a parser, the fixture set carries one case below and one above. And a
> regression that mutates a comparison **must not anchor on the comparison** — anchor on the
> surrounding block, or ship two mutations per guard.

It is a rule rather than a test because **the harness cannot supply it.** Step 3's `nvidia-smi`
column guard was mutated by a regression anchored on the literal `if (cells.length !== …) {`.
That proves *a guard exists there*; it can never prove the guard is an **equality**. Weakening
`!==` to `<` passed **all 807 tests and all 51 mutations**, and fabricated a thermal throttle
alarm on a card at 38 °C.

⚠ **Apply it with judgement. The test is whether the two sides differ AT A PANEL.** Step 9's
boundaries are rendering ones: the 600-point decimation threshold (`MAX_RENDERED_POINTS`), the
window bounds, and every `null`/`0` pair invariant 1 governs.

### 5.2 The red-test ledger — catches a test that cannot fail

> Every ⚠-marked test must appear in at least one mutation's RED set.

Copy the block verbatim from `pipeline/steps/08-client-runtime/regressions.py`; `LEDGER_FILES`
is the only line that changes. Rules that come with it:

1. **A ledger failure is not "add a mutation until it goes green".** The first hypothesis is
   that the test is **inert** and needs a body matching its name, or a rename to what it
   actually checks. The second is that the property has no plausible wrong implementation, in
   which case **drop the ⚠ rather than the standard** — and record it in the harness docstring.
2. **It cannot catch a test that goes red for the WRONG reason**, and that half is irreducible.
   Keep reading each test against its own name. **Every step so far has shipped at least one
   name that over-claimed its body.**
3. ⚠ **A mutation whose RED set depends on a value the test drew is a *probabilistic*
   mutation, and the harness cannot tell it from a sound one.** The defence is one extra
   question while reading: *would this test be red for **every** input, or only for most?*
4. **A `types`-kind mutation contributes NO red-test lines**, so it can never cover a ⚠ test.
   Ship a second mutation whose check is the vitest file.
5. **`test.each` names are matched by the prefix before the first `%`.** Put the placeholder
   later in the sentence, and do not give two `test.each` blocks the same prefix.
6. **Ledger ownership follows the file, not the step.**
7. ⚠ **A ⚠ mark the ledger cannot back is usually a MISSING FIXTURE, not a bad mark.** Step 8's
   reconciliation had six, and every one turned out to be a real hole:

   | inert mark | what was actually missing |
   |---|---|
   | `⚠ a second reason keeps it open after the first goes away` · `⚠ pause → hide → resume leaves the gap open` | a mutation dropping the **`hidden`** arm of `anyGapReason`. The one that existed dropped `paused`/`failed`, which every fixture reaching those tests was immune to |
   | `⚠ no gap is opened before the first accepted sample` (runtime) | the fixture started **already hidden**, so `syncHidden` returned early and `openGap` was never called at all. A **failed** first poll is the path that reaches it |
   | `⚠ the age counts from the server's ts, and a repeat does not refresh it` | a mutation that **re-stamps on arrival** — the exact thing this file's first warning forbids |
   | `⚠ the crossing and the recovery, and nothing in between` | a mutation dropping `observeStaleness`'s early-out |
   | `⚠ a stale condition does not re-log its band on every poll` | **the most valuable of the six.** For a continuous metric the guard is invisible: the frozen band always equals the logged one, so the `previousBand === band` early-out defends it a second time. It is load-bearing only for a **value-band** condition — a unit that goes `active → failed` and becomes unreadable five seconds into its ten-second run carries a pending value across the outage, and an unguarded loop confirms it on the strength of time nobody sampled. Every fixture in that file used `gpu_temp` |

### 5.3 Source-text guardrails — catches a call that should exist and does not

`lib/guardrails.test.ts` asserts, over the source text: under **`lib/collectors/`,
`lib/telemetry/`, `lib/auth/`, `app/api/` and `proxy.ts`**, every `setTimeout` delay is a
`boundedTimeoutMs(…)` result (`deadline.ts` is the single exemption); nothing schedules
`setInterval`/`setImmediate`/`queueMicrotask`; `boundedTimeoutMs` is defined **exactly once**;
the assembler shares no budget across collectors; and neither `pwm5` projection calls the
other. It also asserts `tsconfig`'s flags, `verify`'s exact text, no `next/image` import, and
no raw control byte in any source file.

Four practical notes:

1. **Blank comments before scanning** (`codeOnly()`), and extract arguments **paren-balanced**
   (`lastArgumentOf()`), not by regex. ⚠ **`codeOnly` blanks comments but KEEPS string
   contents**, so a literal `'fetch'` inside a string is still visible to a text guard — and
   `'fet' + 'ch'` is not. Step 8's `U39` exists to demonstrate exactly that.
2. **A failure means a new unvalidated bound was added, not that the rule needs loosening.**
3. **Enumerate inputs by walking the tree, never by listing files.** A guard over a hard-coded
   file list is defeated by *adding a file* — measured in step 6, where a new module containing
   a literal `setInterval(` passed **71 of 71**. Use `sourceFiles()` / `serverSideFiles()`.
4. **A text guard is sound only over a vocabulary that cannot be aliased.** A *module-local*
   name is guardable; a **global** (`setInterval`, `fetch`, `require`) is **not guardable by
   text at all**. That needs a **behavioural** test and a **runtime** one, **both**, because
   neither sees what the other sees.

#### ⚠ Step 8's three client guards, and the corrected claims about them

`lib/client/guardrails.test.ts` carries all three. **These are `build.md`'s three over-claims in
their corrected form, and they must never be repeated as originally written:**

| claimed in `build.md` | the truth |
|---|---|
| *"runtime — catches any spelling at all"* | It catches **any spelling of a global it wraps**. It wrapped four schedulers and `fetch` was **not** one of them, so `const go = fetch;` walked past both guards. `fetch` and `XMLHttpRequest` are now wrapped |
| *"The exemptions are `env.ts` and `fake-env.ts`, both explicit."* | There is a **third**: `use-telemetry.ts` — the hook must reach `window`. It is now named in the guard, in its table, and in an `exempt` list rather than an inline `&&`. It exempts **the one file in step 8 with no test** |
| *"check `git status` … before believing it"* | `git status` could not do this in an untracked tree. §0's manifest procedure is the check |

⚠ **The runtime globals guard voids itself under `isolate: false`.** It patches
`globalThis.setTimeout` and friends for the length of one session and asserts zero calls from a
`lib/client/` stack frame. `vitest.config.mts` sets no `pool` or `isolate`, so one file per
worker holds today — but **this run's own reporter recommends `isolate: false` on every
invocation** ("~408ms faster … reuses workers across files"), and step 11 will want it when it
starts caring about CI time. Under it another file's patch-and-restore can interleave and leave
the globals un-wrapped for part of the window: the calls would go unrecorded and the guard would
still pass. The window therefore **ends by asserting the globals are still the wrappers this
test installed**, so the configuration change turns it red rather than hollow. Same family as
"do not run a harness concurrently with `verify`": a measurement that can be silently voided
must be made to say so.

⚠ **Client code under `app/` other than `app/api/` is out of the server-side timer rule's
scope** (step 7's `/login` countdown lives there). **Step 9 does not loosen either guard.**

### 5.4 ⚠ Determinism — a reading rule

> **A test may consume entropy only for an assertion that holds for every value it could
> draw.** If the truth of an assertion depends on *which* value was drawn, the value is not
> entropy — it is a fixture, and it must be constructed in the test.

**Where it came from.** `session.test.ts` asserted that flipping the last character of a
signature invalidates it. A 32-byte HMAC is 43 base64url characters, so the last character
carries **four significant bits of six** — when the tag happened to end in `A`, the flip
produced a *different spelling of the same bytes*, which the verifier accepted. The test failed
**1 run in 16** (measured: 6.15 % over 100 000 trials), and on those runs it demonstrated the
**opposite** of its own name.

**Steps 8–10 consume clocks rather than entropy**, and the same question applies. Two
clock-shaped traps step 8 paid for:

- ⚠ **`FakeEnv`'s two fake clocks were in different years** — browser 2023, server 2026 —
  invisible until §6.2's mode became a function of `browser now − server ts`, at which point
  every fixture read `stale`. `FakeEnv.now` is now `Date.parse(tsAt(0))`: a browser and a server
  that **agree**. **A test that wants skew has to ask for it**, which is the right way round —
  and two step-8 fixtures do ask, precisely so the clock rules have something to bite on.
- ⚠ **`FakeEnv` repeats its last answer once the response queue runs dry**, and that answer
  carries a `ts` the ring already holds. A fixture that resumes polling without queueing a fresh
  snapshot therefore takes the **repeat** branch, which returns early — so an assertion written
  after it can pass under both implementations. Queue the reply *before* the event that polls.

---

## 6. ⚠ What must not leak into steps 9 and 10

**Twelve rules, from step 8's review. They are the ones a panel is most likely to undo.**

1. **A cell's colour is not `displayed`.** §6.4: a cell calls `lib/severity.ts` on the current
   reading. **Nothing debounced is a cell colour.**
2. **Do not read `conditionsFrom` in a panel.** It is un-deduped by design.
   **`state.displayed` is the panel surface.**
3. **Do not infer gaps from holes in a series.** Hatch `state.gaps`; they carry real endpoints
   and survive decimation.
4. **Do not tick the age off store changes.** Under §6.2's mode rule the store changes exactly
   once at the `live → stale` crossing — which is *worse* than never, because a store-driven
   tick will appear to work. **The tick is an independent interval** (D2).
5. **Do not render `0 alarms`, and do not render a negative age.** `formatAge` clamps; the zero
   count is omitted in the **rendering**, not in `RuntimeState`.
6. **Do not put `standing` — or anything else off the snapshot — on the server-rendered shell.**
   §5's revoked-cookie asymmetry is the standing condition under which the whole gate design
   was accepted (§3.3).
7. **Do not add a second spelling of `/api/telemetry`, `/login`, `/api/session`, or either unit
   name.** The guards walk the tree, so adding a file does not escape them.
8. **Do not "fix" a red-cell/green-dot disagreement in a panel.** It is fixed once, at the
   reduction: §9's dedupe takes the **worst** severity among colliding observations and logs a
   `conflict` line once per session. A panel that patches it locally makes two places that must
   agree.
9. **`latestSample` and the chart's last point are the same sample**, and now provably so —
   both are newest **by `ts`**. Do not re-derive it.
10. **Do not add a per-chart decimation budget.** 600 points **per series** — so §6.2's stacked
    chart draws up to 1,800 (S49; the sentence is still not in `SPEC.md`).
11. **Do not read `rawSeverity`, compare severities, or hold a band outside `lib/conditions.ts`.**
    It is the easiest thing to undo by accident in a panel.
12. **Do not treat `state === null` as missing data.** It is *before the first poll*.

### ⚠ Four places steps 9 and 10 will NOT compose without an adapter

- **(a) `conditionsFrom` is un-deduped** — rule 2 above, and the reason it is stated twice.
- **(b) There is no `ErrorSource → panel` selector.** §6.5's "an em dash always has an
  `errors[]` entry behind it" needs one, and `conditionSource` maps `ConditionKind → panel`,
  not `ErrorSource`. **Write `errorsForPanel(snapshot, panel)` once, beside `conditionSource`**
  (D4) — a second mapping of a join that already exists is second on §7's do-not-copy list.
- **(c) `samplesWithin` → `seriesFrom` → `decimateSeries` is a three-call incantation whose
  order is silently load-bearing.** Decimating before windowing spends the point budget on data
  that is not drawn and produces a chart that is **subtly wrong rather than obviously broken**.
  One `traceFor(state, pick)` closes it (D5).
- **(d) `state` is `null` until the first client render** — nine `if (state === null)` branches,
  or one wrapper written once in step 10's assembly.

⚠ **One composition fact nobody should over-read:** `patch()` compares only the keys in the
patch, and `observeEvents` returns a fresh object on every accepted poll even when nothing was
logged. So `accept()` always notifies. That is correct — a new sample *is* a change — but the
identity optimisation covers **repeats only**, not steady state. **Do not build memoisation on
the assumption that a quiet poll is free.**

### Inherited, and still true

13. **⚠ `null` is not `0`** (invariant 1) and **first-sample deltas render `—`, never `0`**.
14. **A skipped call and a failed call must not read alike** (§6.7). The distinction lives in
    the `errors[]` message text — S19 is the open question of what sentence step 9/10 writes.
15. **The client never writes to the server** (invariant 2).
16. **`app/page.tsx` must stay free of telemetry and secrets** — see §3.3.
17. **`EC auto` and `unavailable` are not severities**, and `ENODATA` from `pwm5` is **healthy**
    (invariant 3).
18. **`fanN_input` is the only trustworthy fan telemetry** (invariant 4). `pwmN_enable` and
    `fanN_target` are not in the contract and must not be added.

---

## 7. Decisions taken, so no step re-litigates them

### Contract and formatting (steps 1–2)

- **`gpus` and `serving` stay `T[] | null`, and `null` is not `[]`.**
- **`Cooling` is a three-variant discriminated union.**
- **No validation in the brand constructors.** They must stay erasable.
- **Type-level assertions live inside `test()` callbacks**, for attribution.

### Collectors (steps 3–5)

- **A wrapped or backward counter is `null`, not clamped**, and carries **no** `errors[]` entry.
- **Every non-zero `nvidia-smi` exit is `gpus: null`**, including exit 6.
- **§6.3's `fan5` absolute row is TWO-SIDED and unconditional**: `0` and `> 5100` both alarm.
- ⚠ **`-0` is a stopped fan** — the comparison is `===`, never `Object.is`. (One of the five
  unbacked ⚠ marks step 2's ledger retrofit found; now backed by `R53`.)
- **`ENODATA` from `pwm5` is EC auto and healthy**, matched on `error.code` by exact equality.
- **No dependency for D-Bus**, and **`LoadUnit` is never called** — it *loads* the unit.
- **`node:http`, not `fetch`**, and **`statvfs` uses `bfree`, not `bavail`**.
- ⚠ **`lib/throttle.ts` REQUIRES the `0x` prefix** (2026-09-07). It used to be optional, which
  made a decimal reading *fabricate an alarm*: a bare `8` parsed as `0x8`, HW slowdown. Measured
  read-only before requiring it — driver 580.173.02 emits `0x0000000000000000` on both cards.
  The trade is a lost reading (`—` plus an entry) on a hypothetical driver that omits it against
  a fabricated alarm on the real one, and §6.3's posture is that the fabricated alarm is worse.
- ⚠ **`errors[]`'s concatenation order is a decision, pinned by a test**, because `dbus` is
  filed by two collectors and §6.7's client rule reads the **last** message per source. See §3.2.
- ⚠ **A fan channel 1–4 missing from the hwmon listing files an `errors[]` entry**; channel 5
  does not, because it has a documented absent state and `pwm5Present: false` explains it. §6.3's
  *"an em dash on channels 1–4 always has an entry behind it"* is true because of this branch,
  not because the board happens to enumerate them.

### The telemetry route (step 6)

- **Four modules, not one**, each with its own failure mode and its own fake.
- **`route.ts` holds `dynamic` and the handler names and nothing else**, and each handler is an
  **explicit one-parameter wrapper** — never `export const GET = handleTelemetry`.
- **The assembler propagates a rejection rather than inventing a snapshot**, and the cache
  **evicts** a rejected entry.
- **`Cache-Control: no-store` on 200 and 401.**
- **§4's two halves ship together:** `oneAtATime` and `withHostCeiling`, composed **ceiling
  outside gate**.

### Auth and login (step 7)

- **scrypt, not argon2id** — zero dependencies, zero ABI surface. `N = 2¹⁵, r = 8, p = 1`.
- **The hash encoding is deliberately not PHC**; the alphabet is `[A-Za-z0-9._-]`.
- **One scrypt at a time, process-wide**, because `crypto.scrypt` runs on libuv's pool.
- **The rate limit is GLOBAL, with no key at all** — `X-Forwarded-For` is *meaningless* behind
  `--network host`, and one bucket bounds the KDF queue at five by construction.
- **`POST /api/session` requires `Content-Type: application/json`, checked before the limit.**
- **Every refusal is 401 with no body.** No 400.
- **The token is not a JWT**, and verification order is **signature → shape → expiry**.
- **`timingSafeEqual` with the length compared first** — it *throws* on a length mismatch.
- **One canonical base64url decoder** (`base64url.ts`).
- **No `Secure` on the cookie**, and a test pins its absence. `SameSite=Strict` carries CSRF.
- **The gate is `proxy.ts`.** A file left at `middleware.ts` **simply never runs**.
- **Nothing about authentication is logged.**

### The client runtime (step 8)

- ⚠ **`stale` is a function of the newest reading's AGE, not of the failure counter.** Failed,
  **or** age > 3 cadences (floored at 10 s), **or** a negative age. The narrow fix — count
  consecutive repeats — covers one cause; this covers four with a number the page already has.
  Measured before it: thirty polls, thirty correct answers, **nothing on screen**, mode `live`,
  and `getState()` identical by identity throughout.
- ⚠ **A gap closes when a REASON goes away, not when a SAMPLE arrives**, and the predicate is
  over **all three** reasons. `pause() → hide → resume()` keeps it open. A reading may land
  inside a gap and neither closes nor splits it — it is real data and belongs in the ring.
- ⚠ **The two clocks.** Server `ts` positions readings (ring key, window bounds, gap endpoints,
  prune horizon); the browser's clock measures the session (§6.4's hold, log times, "since").
  **The age indicator is the one place they meet, and that is its whole job.**
- ⚠ **§9's id dedupe takes the WORST severity**, not the first, and `isWorse` is expressed
  through `worstSeverity` so §6.3's ordering has **one** definition.
- ⚠ **§6.5's stale/retired split lives in `observePoll`'s `displayed`**, not in `runtime.ts`
  reducing over two lists. A condition leaves only when *retired* — its enumeration was read and
  its subject was not in it. **`gpus: null` retires nothing.**
- ⚠ **A repeated `ts` is a SUCCESSFUL poll.** The counter resets, the dot stays green, and none
  of the condition, event or gap machinery runs — but `applyMode` still runs, because a repeat
  is exactly the poll during which the age can cross into `stale`.
- **`refreshNow()` polls while paused and does NOT resume** (§6.2 is silent; recorded as a
  silence). **It is a no-op while hidden.**
- **`STANDING` rides §4's snapshot** and is read from **every** accepted sample, so an
  operator's edit to `/etc/ai-dashboard.env` lands on the next poll with no reload path invented
  for it. Not a constructor option, not a build-time constant, and **not a server-shell prop** —
  the last on **security** grounds, not ergonomics.
- **The whole arrival path is inside `poll()`'s `try`.** `reschedule()` is the last statement,
  so a throw anywhere in there would leave `inFlight` false, no timer pending and the mode still
  `live`: polling stops **silently**, the one failure §6.2's age indicator cannot describe.
- **`patch()` compares the patch's own keys**, which is what makes "a repeated `ts` changes
  nothing" observable with `===` rather than merely true in principle — `useSyncExternalStore`
  re-renders whenever `getState()` returns a different object.

### ⚠ Do NOT copy — in descending order of damage

1. **A hand-rolled bound.** Five attempted; all are fixed once, in `deadline.ts`.
2. **A second `errnoCodeOf`**, or a second canonical base64url decoder. **Never match on
   message text.**
3. **A test that names a property it does not check.** Eight steps, eight occurrences.
4. **A test whose truth depends on a value it drew** (§5.4).
5. **A placeholder `null` on a field whose `null` already means something.**
6. **Deriving one three-valued field from another.** `null` is unknown and is never the alarm.
7. **A guard over a hard-coded file list, or over a global.** §5.3 notes 3 and 4.
8. **Raw control bytes in test files.**
9. **A parser that is tested, exported and unused.** Three exist, all with stated reasons —
   `unknownStanding` is the newest and is justified **only if** D3 renders it.
10. **Per-file `pnpm vitest run <file>` as the green signal.** It skips `tsc`.
11. ⚠ **A documentation claim that names a property the code does not have.** New in step 8
    (§5.3's table) — the same species as #3, in prose, and it reached `build.md` three times.

### Fixtures — import these, do not rebuild them

From **`lib/fixtures.ts`**: `nothingReadable` (every reading failed *because the probe could not
be performed*), `everythingZero` (everything read, many readings genuinely `0` — **a dead
fan**), `ch5Manual` / `ch5EcAuto`, `pwm5NodeAbsent`, `pwm5Unreadable`, `servingInstances` /
`servingPopulated`, `servingIdentityOnly`. ⚠ There is **no "empty snapshot"**.

From **`lib/client/fake-env.ts`**: `FakeEnv`, `MemoryStorage`, `ThrowingStorage`, `atTs`,
`tsAt`, `wireBodyOf`. ⚠ See §5.4 for its two clock traps.

From **`lib/collectors/samples.ts`**: raw captured text — `CAPTURED_*`, `EMPTY`.

### Import convention

`@/` for cross-directory imports, relative within a directory. ⚠ **Three toolchains have to
agree about `@/` and they read three different files.** `tsc` and `next build` take it from
`tsconfig.json`'s `paths`; **Vitest does not read `paths` at all** and needs `resolve.alias` in
`vitest.config.mts`. Both are present, and the alias is proven by an actual `@/` import at the
top of `lib/guardrails.test.ts` — not by a text assertion.

---

## 8. Spec gaps — re-verified against `SPEC.md` during step 8

⚠ This table has been **stale three times** (92 % before step 5, 100 % before step 6, and again
before step 7). **Re-check every entry against the spec text before trusting it.** Invariant 7
stands: if the spec is silent, **report it — do not assume**.

**Open, with owners:**

| # | Gap | Owner |
|---|---|---|
| **S11 / G5** | §6.5's exception to *"an em dash always has an `errors[]` entry behind it"* applies **only when the coloured neighbour is in the same panel and carries a severity**. For channel 5 the neighbour reads **`unavailable`**, and O13 says `unavailable` is not a severity — so the exception does not reach it, and an em dash on `fan5` with `pwm5Present: true` still owes an entry no collector files | **steps 9, 10** |
| **S19** | A *skipped* collector and a *failed* one are indistinguishable to §6.5's rendering rules. The message text carries the distinction; §6.5 has one bucket. **Steps 9/10 must choose a sentence** | **steps 9, 10** |
| **S30** | **§5.2's sixth row has no tone.** *Could not reach the dashboard.* has fixed copy and a fixed submit state but no `data-sev`. `warn` was chosen; `MOCK.html`'s state C predates the row | step 10 |

⚠ **S20, S31, S32 and S33 were on this table when step 8 closed and are NOT open** — all four
are answered by the current spec text (§4's *"a rule, not a census"*; §5's *"This check runs
FIRST, before the rate limit"*; §5.2's *"The screen never retries on its own"*; §5's *"compared
ignoring parameters and case"*). Removed 2026-09-07 after re-reading each against `SPEC.md`.
**That is the fourth time this table has been stale in the safe direction. Re-verify before
trusting any row.** Also closed and no longer worth raising: step 2's DEFER 15 and 16 —
`lib/severity.ts` exports a function for all fifteen of §6.3's rows, and `lib/conditions.ts`
carries `singleton` and `bareKindAllowedInStanding` per kind.

**⚠ New in step 8, and the owner has not yet put any of them into `SPEC.md`.** The code's
current choice is recorded beside each; **none was filled by assumption**, and a step that
disagrees should raise it rather than change it:

| # | Gap | What the code does |
|---|---|---|
| **S49** | **§6.7 does not say whether the 600-point decimation budget is per series or per chart.** The review ruled **per series**; the sentence never reached the spec | Per series. `decimateSeries` is called per trace, so §6.2's stacked chart draws up to **1,800** points. **Step 9 renders this** — see §6 rule 10 |
| **S50** | **§6.5 says a stale condition's row "names the age of the reading" but not WHICH CLOCK measures it.** §6.7 splits server `ts` from browser `now`, and "the age of a reading we did not take" is cleanly neither | `DisplayedCondition.lastSeenMs` is the **browser's** clock at the last poll that carried the condition — a fact about the session, matching `sinceMs` and an event-log line |
| **S51** | **§6.5 does not say what a stale condition's VALUE shows.** §6.6's "`null` renders `—`" could be misread as requiring the figure to blank | The last value read, unchanged, with `stale: true` beside it. **Step 9/10 decides the treatment** |
| **S52** | **§6.4 does not say whether `loggedStanding` survives a mid-session `STANDING` change** | Not reset. It belongs to the session, not to the configuration |
| **S53** | **§4 does not say what a duplicate entry in `STANDING` means** | Echoed verbatim; harmless because the client builds a `Set`. Recorded so nobody "fixes" it server-side |

**Closed by the current `SPEC.md`:** S14–S18, S21–S29, S34 (`standing` on §4's snapshot),
S35, S40–S48, plus S1–S13, G1–G6, C1–C5, F5 from steps 2–5. **Declined rather than open:** S8 —
`/v1/models` returning more than one model is a state this box cannot reach.

### ⚠ Three step-8 measurements recorded so nobody re-litigates them

- **S35 — the backoff's divergence point.** Doubling-to-the-cap and the written 1×/2×/4×
  sequence diverge **from the fourth failure, and only below an 8 s cadence** — nowhere at 10 s
  or 30 s. The build's claim was confirmed exactly; no change was made.
- **R3 — §6.4's ten seconds wants a monotonic clock, and does not get one.**
  `performance.now()` is not in the `RuntimeEnv` seam. A backward wall step only *delays* a
  confirmation, and `stepBandHold` already restarts a pending run when `nowMs <
  pendingSinceMs` — **the safe direction**. Recorded; do not build it.
- **The five ⚠ marks step 8 dropped, and why each was right.** `writing with no storage at
  all` and `no storage object at all yields the defaults` are **compiler-enforced**: removing
  the `null` guard makes `null.getItem` throw a `TypeError` *inside* the `try` §6.7 mandates,
  which returns the same fallback — the two implementations are behaviourally identical, so no
  behavioural mutation can exist (covered by the `types` mutations `P9`/`P12`). `gpus: null
  produces no GPU conditions` and its `serving` twin are defended at the wire (`W2`/`W11`).
  `every §6.4 kind has a decision about whether its value is itself a band` claimed only
  *completeness*, which is a compile error (`T4`). ⚠ **This is HANDOVER's own "every catch added
  for a never-throw rule removes a distinction", found by the ledger rather than by hindsight.**

---

## 9. Deferred work, with owners

⚠ **Two new documents, both 2026-09-07:**

- **`pipeline/WORK-ITEMS.md`** — the steps 1–8 sweep: what it found, an adversarial review of
  its own findings, the execution log, and §9's record of the **ten `SPEC.md` edits taken**.
  ⚠ **`SPEC.md` was edited for the first time in this project's history** (1290 → 1362 lines),
  by the owner's delegation. Every gap listed as "awaiting the owner's wording" in earlier
  handovers is now **in the spec**; §8's table below is the residue, not the whole story.
- **`pipeline/INSTALL-SPEC.md`** — ⚠ **step 11's `dashboard.sh`, specified before it is
  written**, with the four decisions the owner took on 2026-09-07 (NVIDIA's apt repo in; rsync
  for source delivery; the script adds the ufw rule defensively; subcommands with `install`
  orchestrating). It carries every system change the script makes, the `docker run` line flag
  by flag, the unit with its three traps, and `check` as the silent-failure detector for
  O20–O23 and D8. **It also names two prerequisites on the dashboard code** — a
  `dashboard-cli.js` kept in the standalone output, and `.dockerignore` — without which
  `set-password` cannot work at all.
- **`pipeline/UI-BACKEND-GAPS.md`** — ⚠ **read this before starting step 9.** §6.1 and §6.2's
  panel list checked against `lib/`, row by row. The finding is that **the data is all there**
  and what is missing is a thin seam layer: the GB→GiB rename first and mechanically, an
  `ErrorSource → panel` selector, `traceFor`, a time-of-day formatter, a `state === null`
  wrapper, and the age tick. It also carries the twelve do-not-leak rules, because that is the
  document step 9 will actually open.

| Work | Owner | Status |
|---|---|---|
| **Panel shell, chips, meters, rows, sparkline, stacked cooling chart** | **step 9** | specified — §6.1, §6.2, §6.6 |
| **`errorsForPanel(snapshot, panel)`** (D4) | **step 9** | §6's composition gap (b) |
| **`traceFor(state, pick)`** (D5) | **step 9** | §6's composition gap (c) |
| **The GB → GiB rename** (O19) | **step 9** | open, and the spec has already moved |
| **Formatter `parts` variant** (O14) | **step 9** | open |
| **jsdom** (D6) | **step 9 or 10** | see below |
| S11/G5's narrowed case · S19's sentence | steps 9, 10 | open — §8 |
| **S40's third event-log feed** (D1) · **the independent age tick** (D2) · **render `unknownStanding`** (D3) | **step 10** | open |
| The header: dot + count + paused/stale mode (O2) | step 10 | unblocked |
| A `state === null` wrapper written once (composition gap (d)) | step 10 | open |
| Render "duty unreadable" vs "channel 5 absent" distinctly | step 10 | open |
| **Keep the server-rendered shell free of telemetry and secrets** | **step 10** | §3.3 — the standing condition under which the gate asymmetry is acceptable |
| ~~The red-test ledger retrofit for step 3's harness~~ | — | **closed 2026-09-07** — all seven carry one |
| **O20 · O21 · O22 · D8** — the four silent-failure obligations | **step 11** | §4.1 |
| **`dashboard.sh check`**: an unparseable `PASSWORD_HASH`; a `SESSION_SECRET` short or quoted; a `STANDING` entry matching nothing; the env file's mode and owner | **step 11** | the only place any of them can be caught, because nothing is logged |
| **F7 — `LIMITS` bounds scrypt's memory but not its time** (measured 1 720 ms vs 58 ms at the worst accepted parameters) | **step 11** | with `check` |
| **`UV_THREADPOOL_SIZE=16`** and a container memory limit on `docker run` | **step 11** | §2.5 |
| `.dockerignore` excluding `*.test.ts` · `node .next/standalone/server.js` + the `.next/static` copy · whether `dynamic` is honoured with Cache Components | step 11 | open |
| Root `CLAUDE.md` gains a pointer to `dashboard/SPEC.md` (§2.4) | step 11 | open |
| **The ufw allow rule for 8090**, added the 2026-09-04 way (`sudo ufw show added` first, from a session that stays open) and confirmed with `ufw status numbered` | **step 12** | open |
| **Verify one container process serves every request** (O22) | **step 12** | open |
| Measure channel 5's **spin-up** ramp read-only and settle §6.4's hold for `fan5_engaged` | step 12 | open — see below |
| Require the `0x` prefix in `throttle.ts`'s `HEX` | owner | open |
| React plugin, coverage provider, ESLint | first step that needs one | open |

**jsdom, and what step 8 deliberately did not do.** Step 8 declined it: every rule lives in
`runtime.ts` behind the `RuntimeEnv` seam, and what jsdom would buy is the twelve lines of React
wiring in `use-telemetry.ts`. That file therefore has **no test and no mutation** — it is the
one such file in the step, and it is also the guard's **third, previously undocumented text
exemption**. What it *rests* on is asserted: `client.test-d.ts` proves the real `Window`
satisfies `BrowserWindow`, so the un-run line `createBrowserEnv(window)` is at least
type-correct and needs no cast. **D6: the first assertion jsdom buys is that unmounting
`useTelemetry` calls `stop()`.** Invariant 6 applies — record what it buys and what it costs
step 11's image. ⚠ And step 7's lesson: `login-form.tsx`'s `opaqueredirect` branch was
unmutatable only because it was buried in a submit handler; moving it into `loginOutcome` made
it a table test. **An untestable branch is often a placement problem rather than a testing one.**

**The channel-5 spin-up item, in full:** `pwm5` reads back the commanded duty *immediately*
while the tach climbs from EC auto's ~2210 to HIGH's 4300+, so `fan5` bands **alarm** across the
whole ramp. §6.4 does not debounce cell colour, so the cell **will** flash red on every engage —
and an engage happens whenever the GPUs cross 55 °C. Whether it also *banners* depends on
whether the ramp exceeds §6.4's 10 s hold, **never measured on this box** (`CLAUDE.md` records
only the ~50 s spin-*down*). Sample `fan5_input` across a natural engage while the cards are
hot, then choose between raising `fan5_engaged`'s hold to 30 s — matching the machine's own
`HIGH_DWELL` — and accepting the transient.

**Properties with no mutation, recorded rather than papered over.** `socket.destroy()` inside
`nodeDbus.connect`'s timer; `child.unref()` in `io.ts`; `session.ts`'s `Number.isFinite` guards
and its signature-length guard; *"the gate is at `proxy.ts` and there is no stale
`middleware.ts`"* (a fact about the file **tree**, and a harness mutates one file's contents);
"one bucket for the whole service" (a two-file change). **New in step 8:** `use-telemetry.ts`
(above); *"the debounce is driven by one wall clock rather than by the sample's `ts`"* — the two
are the same numbers under every fixture in the suite, and distinguishing them needs a server
and a browser that disagree; *"the repeat is detected by identity rather than by sample count"*
— the two differ **only at the 8192 cap**, which no runtime fixture reaches; and *"the client
never writes to the server"*, where a mutation that **added** a write would test that a test
exists rather than that the code is right. Each is documented at its harness site.

⚠ **One came *off* this list in step 8, and it is the pattern to expect.** *"A stale condition
does not re-log its band on every poll"* looked unmutatable and was not: it is invisible for a
continuous metric and **load-bearing for a value-band one**. The list is a record of
*current* knowledge, not a proof. Re-read it when a step adds a fixture of a new shape.

---

## 10. Toolchain facts that cost time to learn

- **This is Next 16 and it is not the Next.js in your training data.** Read
  `dashboard/AGENTS.md` and the bundled docs at `node_modules/next/dist/docs/` before writing
  any Next code. `middleware.ts` is now `proxy.ts`, and a file at the old name **never runs**.
- **`next build` rewrote `tsconfig.json` once**, setting `jsx: "react-jsx"` and appending
  `.next/dev/types/**/*.ts` to `include`. Absorbed; a build now leaves it byte-identical. All
  eight strictness flags survive and are asserted as text.
- **`pnpm start` is not the deployment path.** It prints `⚠ "next start" does not work with
  "output: standalone"` and then serves correctly anyway — from a different code path than the
  container uses. **Step 11 runs `node .next/standalone/server.js`**, after copying
  `.next/static` and `public` into `.next/standalone/.next/`; Next does not copy them.
- **`tsc` bails silently on an invalid config.** `strict: false` with
  `exactOptionalPropertyTypes: true` is `TS5052`; the compiler stops before checking anything
  and Vitest reports `Type Errors no errors`.
- **`execFile`'s callback fires on `'close'`, not `'exit'`.**
- **`setTimeout` clamps a delay outside the 32-bit signed range to 1 ms**, and `NaN` the same
  way. Step 8's cadences and backoff are inside that range; `/login`'s `Retry-After` countdown
  is not necessarily.
- **`performance.now()` is a global from Node 16** and needs no import. `setTimeout` counts on
  libuv's cached millisecond clock while `performance.now()` is finer, so a timer can fire
  *marginally before* its deadline.
- **`vi.advanceTimersByTimeAsync` drains microtasks between timers.** A synchronous read of a
  spy's call count does not. ⚠ Step 8 uses **`FakeEnv`'s own clock, not `vi.useFakeTimers`** —
  the runtime takes its scheduler as a parameter, so a test can *read* the pending timers rather
  than infer them, and `setImmediate` stays available to drain the poll's own `await`.
- **A background tab throttles `setTimeout`**, so a countdown there runs *slower* than the
  server's clock — the safe direction for a lockout, the **unsafe** direction for anything that
  assumes a tick happened. §6.7 pauses polling on `document.hidden` for this reason.
- **libuv's thread pool is four threads by default**, an in-flight operation cannot be
  cancelled, and **four blocked operations block every subsequent read in the process
  indefinitely**. `crypto.scrypt` runs there too, which is why the KDF is serialised.
- **`Buffer.from(s, 'base64url')` is lenient** — it *skips* characters outside the alphabet and
  accepts non-canonical spellings. `decodeExact` in `lib/auth/base64url.ts` is the only correct
  way to read one of our fields.
- ⚠ **`Date.parse` is lenient in the same family**, and step 8 paid for it twice: it **rolls an
  impossible date forward** (`2026-02-30…` lands on 2026-03-02), and it accepts non-canonical
  *spellings* of a correct instant (`…+00:00`, a fourth fractional digit). `wire.ts` needs
  **both** an ISO-shape guard and a 19-character calendar round-trip; neither subsumes the
  other, and the second one silently voided the first one's mutation (§1).
- **`crypto.scrypt` throws SYNCHRONOUSLY on bad parameters**, not through its callback.
- **`noUncheckedIndexedAccess` is on**, so every `split()[i]` is `string | undefined`.
- **The lockfile carries every linux/x64 variant step 12 needs.** `node:24-slim` is glibc.
  `pnpm install --frozen-lockfile` exits 0.
- **Inside `node:24-slim` the build runs as root**, so a plain `corepack enable` works.

---

## 11. Repo state, environment, and the commit point

```
branch   dashboard-backend      (branched from main; main is untouched)
commit   71a2f7d                183 files — the commit that brought `dashboard/` under git
HEAD     e852631                 later commits touch `pipeline/` documents only
```

**`dashboard/` is committed as of step 8**, on `dashboard-backend`. Nothing has been pushed.
That was the owner's call, taken on step 8's review recommendation (S14): a commit point
*before step 9* rather than before step 11, with **revert integrity** as the stated reason —
`git status` could not previously see a source file a killed harness left mutated. It also
restored `git grep` over this tree. **The next commit point is the owner's call**; `PLAN.md`
and the repo's own `CLAUDE.md` both say commits happen only when asked.

`dashboard/.gitignore` covers `*.tsbuildinfo` and `coverage/`. **`AGENTS.md` and `CLAUDE.md`
inside `dashboard/` are deliberately NOT ignored** — `next dev` rewrites them on every run, so
ignoring them means permanent untracked churn no `git status` will surface. `AGENTS.md` is
marker-delimited so project notes added outside the markers survive.

| | |
|---|---|
| Dev machine | macOS. **Node v24.16.0 (nvm) and v26.8.1 (`~/.hermes`) both installed** — §1 decides which one runs. pnpm 12.3.4 via corepack at `~/.local/bin`. **No Docker** |
| Target | `ai-server` at **192.168.4.71**, `ssh ai-server`. **Node absent, Docker absent** |

The box is reachable over SSH and **read-only queries against it are legitimate evidence** —
step 2 settled a finding with three `nvidia-smi` queries, step 3 captured every `/proc` and
`coretemp` fixture with `cat`, step 4 measured `pwm5`'s errno with a read-only `python3 -c`, and
step 5 replayed its own D-Bus frames at the live system bus. **Invariant 2 still holds: nothing
writes to the server** — no `systemctl`, no hwmon write, no `set-model`, no `LoadUnit`, and
`/v1/chat/completions` has never been called. **Steps 6, 7 and 8 needed the box for nothing, and
step 9 needs it for nothing either**: every primitive is a pure function of a snapshot.

⚠ **`ufw` now enforces on the box** (`ENABLED=yes`, verified 2026-09-06). **Port 8090 has no
allow rule**, so the dashboard will be unreachable until step 12 adds one. **Do not add it now**,
and when the time comes, add it the 2026-09-04 way: `sudo ufw show added` first, from a session
that stays open, because enabling ufw without a rule for port 22 locked this box out once
already and a Precision 5820 has no BMC.

The repo root's `CLAUDE.md` carries the hardware history behind every rule here — the 5-fan DKMS
module, the POST hang, the closed-loop-on-tach EC, the ufw incident that `ufwEnforcing` exists to
catch, and the SSH lockout that followed it. Read the *Serving* and *Server Administration*
sections if a decision here looks arbitrary; they are the reason these panels exist.
