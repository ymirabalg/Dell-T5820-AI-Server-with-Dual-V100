# Handover — after step 7, before step 8

Steps 1 (**Scaffold & contract**), 2 (**Format & severity core**), 3 (**GPU & host
collectors**), 4 (**Cooling collector**), 5 (**Serving / storage / safety**), 6 (**Telemetry
route**) and 7 (**Auth & login**) are closed. This file is the whole inheritance: the step-8
agents get clean context and read it as fact.

**Step 8 is the client runtime** — §6.7 of `SPEC.md`, plus §4's contract and §5.2's hand-off.
Eight things:

1. **Polling** `GET /api/telemetry` on the selected cadence, default 5 s.
2. **`localStorage` preferences** — `aid.cadence`, `aid.window` — every read and write in a
   `try`/`catch`, silently falling back to defaults. A private window with storage blocked
   must render a correct dashboard.
3. **The ring buffer**: 8192 samples, keyed on `ts`, drawn against **time, not index**.
4. **Min/max decimation** above 600 rendered points, so a one-sample spike survives.
5. **Backoff** on a failed poll: 1×, 2×, 4× the cadence, capped at 30 s; recovery resets it.
6. **Visibility pause** on `document.hidden`, and the un-sampled span drawn hatched, never
   interpolated.
7. **The 10 s debounce** (§6.4) and the **event log** (500 entries, newest first).
8. **A 401 at any time → `/login`**, per §5.2 — and *not* down the failed-poll path.

**Two things step 8 must inherit rather than rediscover, and they are the two most likely
things to get wrong:**

- ⚠ **§6.7: the client keys its buffer on `ts` and ignores a snapshot whose `ts` it already
  holds.** At the 1 s cadence §4's cache serves the same sample **two or three times in a
  row**, and occasionally at 2 s, with an identical `ts`. That is correct and deliberate — it
  is what stops five tabs at 1 s forking five `nvidia-smi` a second. Appending it twice puts
  duplicate points in the ring, **flattens the min/max decimation over a bucket** and
  **double-counts an event in the log**. **A repeated `ts` is not a failed poll**: the dot
  stays green, the age counts from that `ts`, the backoff is not engaged.
- ⚠ **§4: `ts` is the instant the poll BEGAN**, stamped once, before any collector runs — not
  when it finished. So the age indicator can only ever **over-state** age, which is the
  direction every reading here must err in. Do not "correct" it against a local clock, and do
  not re-stamp on arrival.

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
| `pnpm build` | `next build` | **Run it before closing step 8** — it touches `app/` |
| `pnpm dev` / `pnpm start` | dev server / prod server | Local only — see §10 |

### ⚠ The Node pin, and the `PATH` line that quietly defeats it

```
$HOME/.local/bin/node  →  $HOME/.hermes/node/bin/node   v26.8.1
$HOME/.nvm/versions/node/v24.16.0/bin/node               v24.16.0   ← the pinned major
```

`pnpm` is corepack's `pnpm.js` behind `#!/usr/bin/env node`, so pnpm — and therefore Vitest,
`tsc` and `next build` — run on whichever `node` comes first. Putting `$HOME/.local/bin` first
selects Node 26 against a manifest that says `<25.0.0`. The export above fixes it. **Step 7
added no native module and no dependency**, so `NODE_MODULE_VERSION` no longer decides
anything — the pin now matters only for behavioural drift. `.nvmrc` and `.node-version` both
say `24`, and `lib/guardrails.test.ts` asserts the three files agree.

Toolchain: pnpm 12.3.4 (pinned by `packageManager`), TypeScript 7.0.2 (the native Go
compiler), Vitest 5.0.0, Next 16.3.4, React 19.2.8. **Eight dependencies, all pinned exactly,
and steps 1–7 added zero.** Invariant 6 still stands: no dependency without recording why in
the step's notes. Step 8 is the first step with a live candidate — **jsdom** — see §9.

### ⚠ Green means `pnpm verify` exits 0. Nothing else is evidence.

The Vitest summary lies, in three measured ways:

| what was broken | what the summary printed | real exit |
|---|---|---|
| type error in `app/page.tsx` (no test imports it) | `Test Files 3 passed (3)` · `Type Errors no errors` | **1** |
| failing type assertion at module scope in a `*.test-d.ts` | `Tests 57 passed (57)` · `Type Errors no errors` | **1** |
| **a test file that fails to compile** | `Test Files 3 passed (3)` · `Tests 57 passed (57)` | **1** |

The third is the worst: a file that fails to compile does not fail its tests, it **loses them
from the count**.

**And there is a fourth, found in step 7 and fixed in its reconciliation.** `pnpm typecheck`
exited **0** on a tree carrying a `TS2305` — a test file importing a just-deleted export —
because `tsconfig.tsbuildinfo` was stale. `pnpm test` then failed at *runtime*, and Vitest's
own typecheck block printed `Type Errors no errors`. Three attempts to reproduce the stale
state failed. Both directions have now been paid for:

- a **false failure** (step 3) costs a bisect;
- a **false pass** (step 7) **ships the bug**.

So `verify` deletes the build-info file first. `pnpm typecheck` stays incremental for
iteration and **is not the green signal**. `lib/guardrails.test.ts` asserts `verify`'s exact
text, so it cannot be quietly weakened — strengthening it deliberately, with that assertion
updated in the same change, is what it is for.

**Vitest's `typecheck` block covers only `*.test-d.ts`.** A loosened brand in `lib/` shows up
as an *unused* `@ts-expect-error` in a `.test.ts`, which `vitest run` does not see and `tsc`
does. Per-file `pnpm vitest run <file>` is **not** a substitute while iterating: steps 3, 5 and
6 each shipped a type error that only the full `tsc` caught.

### ⚠ Run the suite more than once when anything it asserts is random

Step 7 shipped a test that **failed 1 run in 16** and could not be reproduced by the phase that
wrote it. See §5.4 for the rule that came out of it. When a change touches anything that
consumes entropy or a clock, run `pnpm verify` in a loop — step 7's reconciliation ran it
**20 times** and quoted the count.

### The deliberate-regression harnesses — run all six after any change in `lib/` or `app/`

```bash
python3 pipeline/steps/02-format-severity/regressions.py                    #  40 mutations
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                #  64 mutations
python3 pipeline/steps/04-collector-cooling/regressions.py                  #  76 mutations + ledger
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py  # 127 mutations + ledger
python3 pipeline/steps/06-telemetry-route/regressions.py                    #  59 mutations + ledger
python3 pipeline/steps/07-auth-login/regressions.py                         # 113 mutations + ledger
```

**479 mutations.** Each replaces one exact string in one source file with a **plausible wrong
implementation** — the wrong thing someone would actually write, never a syntax error — runs
the affected check, and restores the file. Every one must exit 1. Step 1 has no harness.

⚠ **Do not run a harness concurrently with `pnpm verify` or with another harness.** They mutate
source files in place. Serialise.

⚠ **`ANCHOR NOT FOUND` and `DID NOT BITE` are different findings.**

- **`ANCHOR NOT FOUND`** means the implementation moved and the mutation needs **re-aiming**.
  It does not mean the test is fine. Step 7's reconciliation re-aimed thirteen.
- **`DID NOT BITE`** means the mutation applied and nothing noticed. **The first hypothesis is
  a missing or inert test, not a bad mutation.**

⚠ **A new shape of `DID NOT BITE`, found in step 7's reconciliation and worth expecting:
adding a `try`/`catch` removes a distinction.** `N2` (`export const DELETE = handleSessionDelete`)
had bitten for six phases. The moment `handleSessionDelete` wrapped its verdict in the catch
that §5's never-500 rule requires, the aliased form's throw was swallowed and **both**
implementations answered 204 — and the test asserted only the status. Every catch added for a
"never fail loudly" rule makes two implementations agree on a status that used to tell them
apart. The fix was a stronger test (assert what was *written*, not what was *returned*), not a
different mutation.

⚠ **Ledger ownership follows the FILE, not the step.** A ⚠ test added to a file already in an
earlier step's `LEDGER_FILES` needs its mutation in **that** step's harness.

---

## 2. What exists

Everything under `dashboard/`. Nothing outside it has been created or modified.

| Path | Lines | What it is |
|---|---|---|
| `lib/types.ts` | 723 | **The telemetry contract** + §3.7's closed vocabularies |
| `lib/fixtures.ts` | 266 | **Canonical snapshots**, exported for every later step |
| `lib/format.ts` | 395 | **§6.6** — every formatter, and its two laws |
| `lib/severity.ts` | 474 | **§6.3** — every threshold row |
| `lib/throttle.ts` | 173 | **§3.7** — the `clocks_throttle_reasons.active` decoder |
| `lib/conditions.ts` | 532 | **§6.4 + §9** — the condition pipeline and the aggregate |
| `lib/collectors/*.ts` | ~4400 | The six collectors, their seams, parsers and bounds — **finished** |
| `lib/telemetry/*.ts` | ~1100 | §4's cache, gate, ceiling, assembly, source and handler |
| `app/api/telemetry/route.ts` | 27 | `dynamic` + `GET`, and nothing else |
| **`lib/auth/base64url.ts`** | 57 | **NEW (step 7 reconciliation)** — the ONE canonical base64url decoder |
| **`lib/auth/scrypt.ts`** | 289 | The KDF: encode/parse, constant-time verify, the single-slot serialiser, `hashPassword` for step 11 |
| **`lib/auth/config.ts`** | 87 | The `/etc/ai-dashboard.env` contract: `PASSWORD_HASH`, `SESSION_SECRET` |
| **`lib/auth/cookie.ts`** | 94 | A total `Cookie` reader, and §5's `Set-Cookie` |
| **`lib/auth/session.ts`** | 196 | Mint and verify the signed token. **Pure crypto — imports no state** |
| **`lib/auth/revocations.ts`** | 106 | What makes `DELETE` mean something. In memory |
| **`lib/auth/rate-limit.ts`** | 159 | §5's **global** 5/min + 60 s lockout, and `Retry-After` |
| **`lib/auth/authorize.ts`** | 112 | The full verdict, and the `SessionCheck` the telemetry route runs |
| **`lib/auth/handler.ts`** | 287 | `POST`/`DELETE /api/session` as functions of a `Request` |
| **`lib/auth/login-view.ts`** | 239 | §5.2's copy, six states, `loginOutcome`, `retryAfterSeconds`, and **the two paths**. ⚠ **The only client-safe module in `lib/auth/`** |
| **`app/api/session/route.ts`** | 25 | `dynamic`, `POST`, `DELETE` |
| **`app/login/page.tsx` · `login-form.tsx`** | 128 · 211 | `/login`, and `LoginForm` (stateful) + `LoginCard` (**pure**) |
| **`proxy.ts`** | 131 | §5's gate. **`proxy.ts`, NOT `middleware.ts`** — §7 |
| `lib/types.test-d.ts` | 769 | Type-level tests (compiler-run) |
| `lib/contract.test.ts` · `lib/guardrails.test.ts` | 367 · 553 | Contract + project-wide guardrails |
| 44 test files | | **1627+ tests** |
| `package.json` · `pnpm-lock.yaml` · `tsconfig.json` · `next.config.mjs` · `vitest.config.mts` | | pinned toolchain; `strict` + seven more flags, all asserted |
| `app/layout.tsx` · `app/page.tsx` | 22 · 20 | placeholders. ⚠ **`app/page.tsx` must stay free of telemetry** — see §6 |

**Does not exist yet:** any client runtime, components, panels, charts, `Dockerfile`,
`.dockerignore`, `dashboard.sh`, the systemd unit, `README.md`, jsdom.

`pnpm build` → exit 0; route table `ƒ /api/session`, `ƒ /api/telemetry`, `ƒ /login`,
`ƒ Proxy (Middleware)`; `tsconfig.json` byte-identical (`md5 8b6e358b0e19ad663d554dc8310c6da0`).

---

## 3. The public surface step 8 builds on

### 3.1 The telemetry endpoint, as step 8 finds it

```
GET /api/telemetry
  200 → TelemetrySnapshot (§4), Cache-Control: no-store
  401 → NO BODY, Cache-Control: no-store          ← session missing, expired or revoked
```

- **2 s cache holding the IN-FLIGHT promise.** Callers arriving mid-sample join it. At 1 s you
  will receive the same `ts` two or three times in a row. See the ⚠ at the top of this file.
- **`ts` is the poll's start.**
- **A partial snapshot is a 200 with `errors[]`** — the normal case on this machine. Invariant
  5: a failed reading is never a 500.
- **`errors[]` is in the snapshot's own field order** (gpus, host, cooling, serving, storage,
  safety), and §6.5 matches by `source`. Eighteen sources, closed (§3.7).
- **`serving: null` is not `[]`**, on the wire and after any validation. `health: null` and
  `unitState: null` are not alike: one is *not probed this cycle*, the other *could not read*.

### 3.2 ⚠ The auth surface — and exactly one module of it is client-safe

```ts
// lib/auth/login-view.ts — pure strings and pure functions, NO imports at all.
export const LOGIN_PATH   = '/login';         // ← step 8 routes a 401 here
export const SESSION_PATH = '/api/session';   // ← step 10's logout calls DELETE here
export const EXPIRED_PARAM = 'expired';       // ← presence, not value
export type LoginState = { kind: 'idle' | 'submitting' | 'wrong' | 'rate-limited'
                                 | 'expired' | 'unreachable'; … };
export const loginView: (state: LoginState) => LoginView;
export const loginOutcome: (response: LoginResponse | null) => LoginState | null;
export const retryAfterSeconds: (header: string | null) => number | null;
export const LOGIN_WORDMARK · LOGIN_ADDRESS · LOGIN_SUBMIT_LABEL · PLAIN_HTTP_DISCLOSURE
export const WRONG_PASSWORD_MESSAGE · SESSION_EXPIRED_MESSAGE · UNREACHABLE_MESSAGE
export const rateLimitedMessage: (secondsRemaining: number) => string;
```

⚠ **Do not import anything else from `lib/auth/` in client code.** `handler.ts`,
`authorize.ts`, `revocations.ts`, `rate-limit.ts`, `session.ts`, `scrypt.ts`, `cookie.ts`,
`config.ts` and `base64url.ts` reach `node:crypto` and process-global state; `proxy.ts` also
imports `next/server`. Two ⚠ tests in `login-view.test.ts` hold this line: one asserts the
module has **no imports at all**, the other reads `proxy.ts` and `login-form.tsx` and refuses a
quoted `'/login'` or `'/api/session'` in either. **If step 8 writes a third spelling of either
path, that test goes red — which is the point.**

**Routing a 401 (§5.2, §6.7):** navigate to `LOGIN_PATH` with the `EXPIRED_PARAM` **set**.
Presence is the trigger, so `?expired=1` — never `?expired=0`, which also triggers it and reads
as a bug.

**Two things about a 401 that step 8 must not blur:**

1. **A 401 is not a failed poll.** §6.7's backoff, grey dot and failure banner are for a
   *server* failure. A 401 means *sign in again*. Getting this wrong produces the exact outcome
   §5 wrote the 401-never-500 rule to prevent, from the other end.
2. **A revoked cookie can still fetch the HTML shell.** The gate (`proxy.ts`) makes the
   cryptographic verdict only — signature, shape, thirty days — because Next's own docs say a
   proxy must not rely on shared modules or globals. The **revocation** check runs on every
   `/api/*` route. So `GET /` with a logged-out cookie is a 200, and its first
   `GET /api/telemetry` is the 401 that sends the user to `/login`. That is acceptable **only
   while the shell carries no telemetry and no secrets** (§6, and step 10 owns it).

### 3.3 The rest of the surface, unchanged from step 6

```ts
collectGpus · collectCpuTemp · collectHost · collectCooling · collectServing · collectStorage
collectSafety · collectUnitStates
CollectorIo · HttpIo · DbusIo · StatvfsIo   ·   nodeIo · nodeHttp · nodeDbus · nodeStatvfs
MAX_TIMEOUT_MS · boundedTimeoutMs(timeoutMs, fallbackMs) · deadline(timeoutMs, fallbackMs)
boundedReader(reader, within) · type Within
reason(e) · errnoCodeOf(e) · tag(source, messages) · ParseResult<T> · clean<T>
NO_DELTAS · advanceDeltas · cpuPctBetween · netRatesBetween · withServiceState
observePoll · conditionsFrom · DEFAULT_PATHS · FAN_CHANNELS · PWM5_FILE · …
```

Branded units — `Celsius` `Watts` `MiB` `GiB` `GB` `MHz` `Rpm` `Percent` `BytesPerSecond`
`Seconds` `Pwm` `Port` `Tokens` over `number`; `IsoTimestamp` `ThrottleMask` over `string`.
⚠ **The constructors name a unit; they do not validate one.** They are `v as T`, erased at
runtime — so **O10: no `as TelemetrySnapshot` on a `fetch` response**, and no coercion of
`serving: null` to `[]`. Validate the wire shape; do not assert it.

Closed vocabularies, switched over exhaustively: `Severity` · `UnitState` (6) · `LinkState`
(7) · `HealthState` (3, field is `| null`) · `Ch5Mode` · **`ErrorSource` (18)** ·
`ThrottleTreatment` · `ThrottleReasonName` (8). `noFallthroughCasesInSwitch` is on and
asserted. **Steps 3–7 produced all eighteen sources and no nineteenth was ever needed.** If
step 8 needs a new one, that is a spec gap to **report**, not a blank to fill.

---

## 4. Obligations, with owning steps

### Closed by step 7

| # | What it was | How it closed |
|---|---|---|
| **the session seam** | Step 6 left a deny-everything placeholder | `verifySession` in `lib/auth/authorize.ts`, wired into `productionTelemetryDeps`. `noSessionVerifierYet` is gone — an exported, tested, unused seam is its own hazard |
| **deny-by-default** | Must survive step 7 | It does, in a different shape: with no `SESSION_SECRET`, `readAuthConfig` returns `null` and every request is refused, including one carrying a cookie a correct server would accept |
| **auth before sampling** | Asserted by call count | Still asserted; the gate did **not** become a reason to relax it |

### Still open

| # | One line | Owner |
|---|---|---|
| **O1** | `Condition.severity` is the **confirmed** band from the debounce, never a raw per-poll severity. `observePoll` is the only way in. Cell colour is **not** downstream of a condition | **steps 8, 10** |
| **O2** | The dot and the alarm count are ONE reduction. A suppressed standing condition is neither red nor counted; the count is omitted when zero | step 10 |
| **O3** | One reading, one condition — dedupe by id. Channel 5's zero is carried by `fan5_absolute` and is never a `fan_stopped` subject | **steps 8, 10** |
| **O4** | `DisplayedCondition.sinceMs` is when the **confirmed** band was first observed | step 10 |
| **O5** | `logOncePerSession` was deleted; **step 8 holds the "already logged" state itself** | **step 8** |
| **O10** | No `as TelemetrySnapshot` on a `fetch` response, and **no coercion of `serving: null` to `[]`** | **step 8** |
| **O11** | `conditionsFrom(snapshot)` must be **one** function serving both the event log and the banner | **step 8** |
| **O12** | A reading with no §6.3 band is invisible to §9's dot. **Do not invent a band** — report it | step 10 |
| **O13** | `EC auto` and `unavailable` are **not** severities. `EC auto` is healthy (invariant 3) | steps 9, 10 |
| **O14** | Formatters return unit-inclusive strings; ask for a `parts` variant rather than splitting on whitespace | step 9 |
| **O19** | ⚠ **The GB → GiB rename.** §6.6 and decision 20 say **GiB**; the value already is one. The brand `GB`/`gb()`, `Filesystem.usedGB`/`totalGB` and `formatGB`'s ` GB` suffix still say GB — 98 occurrences, 10 files. **The rendered suffix is currently wrong against the spec** | **step 9** |
| **O20** | ⚠ **`dashboard.sh set-password` must emit `scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>`** — see §4.1 | **step 11** |
| **O21** | ⚠ **`SESSION_SECRET` must be written unquoted** — see §4.1 | **step 11** |
| **O22** | ⚠ **One process, one module instance.** Now a **security** obligation — see §4.1 | **steps 11, 12** |

O6, O7, O8, O9, O15, O16, O17, O18 are closed (steps 3–6).

### 4.1 ⚠ The three step-11 obligations that fail **silently**, stated in full

Step 7's review rated the first two as the loudest silent-failure traps in the project, and
they are both one line of `dashboard.sh` away from happening.

**O20 — the hash format.** The server verifies with **scrypt**, in exactly this encoding:

```
scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>      six dot-separated fields over [A-Za-z0-9._-]
```

`parseScryptHash` returns `null` for anything else — **including a perfectly correct argon2id
hash**, which is what §5.1's original wording asked for. And `null` is not an error: it is a
clean, empty **401** on every login attempt, with **nothing logged anywhere** (§5 logs nothing
about authentication, deliberately — see §7). The symptom is *a dashboard that will not open
and will not say why*: no failed unit, no error, no log line, and a password the operator knows
is correct. **Use `hashPassword()` from `lib/auth/scrypt.ts` as the producer; do not
reimplement the encoder.** `dashboard.sh check` must report a `PASSWORD_HASH` that fails
`parseScryptHash`.

**O21 — the env file's grammar is Docker's, and it does not strip quotes.** §2.5 deploys with
`docker run --env-file`, which splits on the **first** `=`, takes the rest of the line
verbatim, expands nothing, and **keeps quotes**. So `SESSION_SECRET="…32 chars…"` becomes a
34-character secret with two quote characters baked in. It **passes** the 32-character floor,
produces a working dashboard, and every session dies the moment anyone rewrites the file
without quotes. No check can cleanly catch a *quoted short* secret. Every value in that file
must be single-line, **unquoted**, with no surrounding whitespace, and must avoid `$` in case
the file is ever sourced by a shell. `dashboard.sh check` should refuse a `SESSION_SECRET`
shorter than 32 characters **or containing a quote character**, and report the file's mode and
owner.

**O22 — "one process, one cache" is now security and availability, not performance.** Three
process-global objects depend on it, and two of them fail **open** and **silently**:

| object | built at | what a second instance costs |
|---|---|---|
| `TelemetrySource` | `lib/telemetry/handler.ts` load | a second 2 s cache, a doubled `nvidia-smi` fork rate — **performance** |
| `productionRevocations` | `lib/auth/revocations.ts` load | **`DELETE` stops working** for requests that land on the other instance — a silent security regression |
| `productionRateLimiter` | `lib/auth/rate-limit.ts` load | §5's **global** limit becomes N× looser, and the KDF queue is no longer bounded — a silent availability regression |

Nothing in the suite can see any of this, because the suite runs one process by construction.
This is the exact shape of the ufw incident in the repo's own `CLAUDE.md` (`is-active` green on
a disabled firewall). **Step 11 must assert one process; step 12 must verify it on the box.**
`lib/auth/rate-limit.test.ts` pins the mechanism it rests on
(`⚠ each limiter is its own bucket, so a second instance doubles the limit`).

---

## 5. ⚠ The four structural rules — inherited by steps 8–12

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

⚠ **Apply it with judgement. The test is whether the two sides differ AT A PANEL.** Step 8's
boundaries: the 8192 cap, the 600-point decimation threshold, the 30 s backoff cap, §6.4's
10 s hold, the 500-entry log.

### 5.2 The red-test ledger — catches a test that cannot fail

> Every ⚠-marked test must appear in at least one mutation's RED set.

Copy the block verbatim from `pipeline/steps/07-auth-login/regressions.py`; `LEDGER_FILES` is
the only line that changes. Rules that come with it:

1. **A ledger failure is not "add a mutation until it goes green".** The first hypothesis is
   that the test is **inert** and needs a body matching its name, or a rename to what it
   actually checks. The second is that the property has no plausible wrong implementation, in
   which case **drop the ⚠ rather than the standard** — and record it in the harness docstring.
2. **It cannot catch a test that goes red for the WRONG reason**, and that half is irreducible.
   Keep reading each test against its own name. **Every step so far has shipped at least one
   name that over-claimed its body.** Step 7 shipped the most expensive one yet (§5.4).
3. ⚠ **A mutation whose RED set depends on a value the test drew is a *probabilistic*
   mutation, and the harness cannot tell it from a sound one.** A mutation that reddens its
   target 15 runs in 16 exits 1 and is indistinguishable in the output from one that always
   does — so the harness will report a clean ledger over a property that is almost never
   checked. The defence is reading discipline extended by one question: *would this test be red
   for **every** input, or only for most of them?*
4. **A `types`-kind mutation contributes NO red-test lines**, so it can never cover a ⚠ test.
   Ship a second mutation whose check is the vitest file.
5. **`test.each` names are matched by the prefix before the first `%`.** Put the placeholder
   later in the sentence — **and do not give two `test.each` blocks the same prefix**, or they
   become one ledger entry and either can be inert unnoticed (step 7 caught this while adding
   a second "refused with 401" table).
6. **Ledger ownership follows the file, not the step.**

### 5.3 Source-text guardrails — catches a call that should exist and does not

`lib/guardrails.test.ts` asserts, over the source text:

> Under **`lib/collectors/`, `lib/telemetry/`, `lib/auth/`, `app/api/` and `proxy.ts`**, every
> `setTimeout` delay is a `boundedTimeoutMs(…)` result, or a local whose *initialiser* is one
> (`deadline.ts` is the single exemption); nothing schedules
> `setInterval`/`setImmediate`/`queueMicrotask`; `boundedTimeoutMs` is defined **exactly once**;
> the assembler shares no budget across collectors; and neither `pwm5` projection calls the
> other. It also asserts `tsconfig`'s flags, `verify`'s exact text, no `next/image` import, and
> no raw control byte in any source file.

Four practical notes:

1. **Blank comments before scanning** (`codeOnly()`), and extract arguments **paren-balanced**
   (`lastArgumentOf()`), not by regex. These modules explain their own bugs in prose.
2. **A failure means a new unvalidated bound was added, not that the rule needs loosening.**
3. **Enumerate inputs by walking the tree, never by listing files.** A guard over a hard-coded
   file list is defeated by *adding a file* — measured in step 6, where a new module containing
   a literal `setInterval(` passed **71 of 71**. Use `sourceFiles()` / `serverSideFiles()`.
4. **A text guard is sound only over a vocabulary that cannot be aliased.** A *module-local*
   name is guardable; a **global** (`setInterval`, `fetch`, `require`) is **not guardable by
   text at all** — `globalThis.setInterval`, a destructured alias and a computed property are
   three spellings with no last one. That needs a **behavioural** test (fake timers, advance,
   assert no calls) and a **runtime** one (`process.getActiveResourcesInfo()`, or spies across a
   dynamic import). **Both**, because neither sees what the other sees — and a behavioural test
   that reads its spy **synchronously** misses a microtask.

**⚠ Step 8's timers are the first legitimate ones in this project** — polling, backoff, the
10 s debounce, the visibility pause. The rule above is scoped to server-side directories, and
**client code under `app/` other than `app/api/` is deliberately out of scope** (step 7's
`/login` countdown lives there). **Step 8 writes its own guard for its own timers; it does not
loosen this one.** What that guard has to be about is different: not "is the delay bounded"
but "is every timer cleared on unmount, and does a hidden tab schedule nothing".

### 5.4 ⚠ Determinism — new in step 7, and it is a reading rule

> **A test may consume entropy only for an assertion that holds for every value it could
> draw.** If the truth of an assertion depends on *which* value was drawn, the value is not
> entropy — it is a fixture, and it must be constructed in the test.

**Where it came from.** `session.test.ts` asserted that "flipping one character of the
signature invalidates it", flipping the last character `A`→`B`. A 32-byte HMAC is 43 base64url
characters, so the last character carries **four significant bits of six** — and when the tag
happened to end in `A`, the flip produced a *different spelling of the same bytes*, which the
verifier accepted. The test failed **1 run in 16** (measured: 6.15 % over 100 000 trials,
1 of 24 file runs), and on those runs it was demonstrating the **opposite** of its own name.
The build saw one red run, could not reproduce it, and shipped.

The rule distinguishes the two cases correctly, which is why it is not a ban: `scrypt.test.ts`
hashes a **random** 12-byte password and asserts a round-trip, which holds for every draw and
is *stronger* than a fixed vector. Step 7's fix built the alternate spelling as
`ALPHABET[index ^ 1]` — deterministic for every token — and split the test in two.

**Rejected, with reasons:** seeding (`crypto.randomBytes` is not seedable; monkey-patching
`node:crypto` is a larger mechanism than the bug); running the crypto tests N times ("re-run
until green" wearing a lab coat, and it never reaches zero); a source-text guard on
`randomBytes` (unsound by §5.3 note 4 — it is an import, it is aliasable).

**Step 8 will consume clocks rather than entropy**, and the same question applies: a test that
asserts an elapsed value must hold for every scheduling the machine could produce. The four
existing wall-clock assertions in the suite carry **30–50× margins** (a 60 ms bound asserted
`< 3000`), which is the shape to copy. Prefer `vi.useFakeTimers`.

---

## 6. ⚠ What must not leak into step 8

1. **⚠ Dedupe the ring buffer by `ts`.** §6.7, and the single most likely thing for step 8 to
   get wrong. See the top of this file. **A repeated `ts` is not a failed poll.**
2. **⚠ `ts` is the poll's start**, so age can only be over-stated. Do not re-stamp on arrival.
3. **A 401 is not a failed poll.** It routes to `/login` with `EXPIRED_PARAM` set; the backoff,
   the grey dot and the failure banner are for a *server* failure.
4. **Do not import anything from `lib/auth/` except `login-view.ts` in client code**, and do
   not write a second spelling of `/login` or `/api/session`. A ⚠ test enforces both.
5. **No `as TelemetrySnapshot` on a `fetch` response** (O10). Brands are erased at runtime, so
   a cast asserts nothing. And **`serving: null` is not `[]`**.
6. **A persistent partial snapshot is a 200, not a failed poll.** A collector that has stopped
   answering produces the same `errors[]` entries on **every** poll for as long as it does —
   the third persistent-entry case, alongside `pwm5Present: false` and the `NoSuchUnit` entry.
   **The event log records the transition, not the poll**: one entry when a collector stops
   answering and one when it resumes, never one every five seconds.
7. **A skipped call and a failed call must not read alike** (§6.7). The distinction lives in
   the `errors[]` message text, and a run of *skipped* entries is the only signal that a source
   is wedged rather than broken.
8. **`null` is not `0`** (invariant 1) and **first-sample deltas render `—`, never `0`**
   (§6.7). `cpuPct` and network rates need two samples.
9. **The client never writes to the server** (invariant 2). There is no endpoint that accepts
   it, and no `systemctl`, hwmon write or `set-model` anywhere in this project.
10. **`app/page.tsx` must stay free of telemetry and secrets.** It is the shell a revoked or
    stale session can still fetch (§3.2). Step 10 owns the assembly, but step 8 must not
    undermine it by rendering a first snapshot server-side.
11. **Step 8 writes its own timer guard** (§5.3); it does not loosen the server-side one.
12. **The box is not needed for step 8 at all.** Everything is testable in-process with fake
    timers. If you want a live reading, ask what contract is missing first.

---

## 7. Decisions taken, so no step re-litigates them

### Contract and formatting (steps 1–2)

- **`gpus` and `serving` stay `T[] | null`, and `null` is not `[]`.**
- **`Cooling` is a three-variant discriminated union.** Two members sharing the discriminant
  `'manual'` narrow to the same `Pwm | null`, so a "fourth variant" and a "nullable `ch5Pwm`"
  are **the same type**.
- **`pwmN_enable` and `fanN_target` are not in the contract and must not be added.**
  Invariant 4.
- **No validation in the brand constructors.** They must stay erasable.
- **Type-level assertions live inside `test()` callbacks**, for attribution.

### Collectors (steps 3–5)

- **A wrapped or backward counter is `null`, not clamped**, and carries **no** `errors[]` entry.
- **Every non-zero `nvidia-smi` exit is `gpus: null`**, including exit 6.
- **§6.3's `fan5` absolute row is TWO-SIDED and unconditional**: `0` and `> 5100` both alarm.
- **`ENODATA` from `pwm5` is EC auto and healthy**, matched on `error.code` by exact equality.
- **No dependency for D-Bus.** `dbus-wire.ts` is validated byte-for-byte against frames
  captured from this box's live system bus.
- **`LoadUnit` is never called** — it *loads* the unit, which is a state change.
- **`node:http`, not `fetch`.** `fetch` buries the errno inside a `TypeError`'s `cause`.
- **`statvfs` uses `bfree`, not `bavail`** — reproduces `df` to the byte.

### The telemetry route (step 6)

- **Four modules, not one**, each with its own failure mode and its own fake.
- **`route.ts` holds `dynamic` and the handler names and nothing else**, and each handler is an
  **explicit one-parameter wrapper** — never `export const GET = handleTelemetry`, because Next
  calls `GET(request, context)` and the second parameter is the injected deps.
- **The assembler propagates a rejection rather than inventing a snapshot.** The cache
  **evicts** a rejected entry so the next request retries.
- **`Cache-Control: no-store` on 200 and 401.**
- **§4's two halves ship together:** `oneAtATime` (one outstanding call per collector) and
  `withHostCeiling` (6 s on `collectHost` alone), composed **ceiling outside gate**. Measured:
  four concurrently blocked libuv thread-pool operations block every subsequent read in the
  process **indefinitely**, and an `AbortSignal` frees nothing.

### Auth and login (step 7)

- **scrypt, not argon2id** — §5 permits either, §5.1 now names scrypt, and it kept the project
  at **zero dependencies** and zero ABI surface. `N = 2¹⁵, r = 8, p = 1`, 32-byte key, 16-byte
  salt; ~60 ms on this Mac. `SCRYPT_MAXMEM` is passed explicitly because the default `maxmem`
  is 32 MiB and `128·2¹⁵·8` is 32 MiB **exactly**, and `crypto.scrypt` throws **synchronously**
  on bad parameters.
- **The hash encoding is deliberately not PHC.** `$`, `=` and `,` are hazards in a `KEY=VALUE`
  file; the shipped alphabet is `[A-Za-z0-9._-]`.
- **One scrypt at a time, process-wide** (`exclusively()`), because `crypto.scrypt` runs on the
  same libuv pool §4 spends four paragraphs protecting.
- **The rate limit is GLOBAL, with no key at all.** §5 says why: `--network host` with no
  reverse proxy means `X-Forwarded-For` is not merely untrustworthy but *meaningless* — Next
  fills it from the socket only when the client omits it (`??=`, measured in
  `base-server.js`), so an attacker can rotate it to escape their own bucket **and** forge the
  operator's to occupy theirs, while the operator can do neither. Measured before the change:
  1 500 forged attempts cost ~1.5 s and delayed the operator's own correct login by **84.7 s**,
  one queued scrypt per forged address. One bucket bounds the KDF queue at five **by
  construction** — which is why there is no queue cap and no admission controller.
- **`POST /api/session` requires `Content-Type: application/json`, checked before the limit.**
  Without it the request is a CORS *simple request* needing no preflight, so any page the
  operator visits could spend the login budget. Checked first, so a refused grammar spends
  nothing.
- **Every refusal is 401 with no body** — wrong password, malformed body, oversized body, wrong
  content type, unconfigured server. No 400: a distinct status tells an unauthenticated caller
  which guess was better formed, and §5.2's screen has no copy for it.
- **`--api-key-file` reasoning applies to the password too**: `set-password` prompts, and step 7
  deliberately ships no CLI that could take it as an argument.
- **The token is not a JWT.** No `alg`, no self-describing header, no parser reachable before
  the MAC. Verification order is **signature → shape → expiry**, so the only JSON this process
  parses out of a cookie is JSON it wrote. Do not "simplify" that ordering.
- **`timingSafeEqual` with the length compared first**, in both `session.ts` and `scrypt.ts` —
  it *throws* on a length mismatch, which is the constant-time defence turning into the
  classic 500.
- **One canonical base64url decoder** (`base64url.ts`), because two diverged: `scrypt.ts`
  re-encoded and compared, `session.ts` did not, and the gap made 1 tag in 16 have four
  accepted spellings.
- **No `Secure` on the cookie**, and a test pins its absence — §5 chose plain HTTP, and a
  `Secure` cookie over it is a login loop with nothing in any log. `SameSite=Strict` is what
  carries CSRF protection. `Path=/` on **both** the setting and the clearing cookie.
- **Thirty days is enforced server-side against `exp`**, not left to the browser's `Max-Age`.
- **Wall clock for the cookie, monotonic clock for the limiter**, and they are not
  interchangeable.
- **The gate is `proxy.ts`.** Next 16 renamed `middleware.ts`; **a file left at the old name is
  not an error — it simply never runs.** Every route open, nothing in any log, and a test suite
  that still passes because it imported the module directly.
- **Nothing about authentication is logged**, because anything worth logging sits one edit away
  from logging a credential. The consequence is accepted and stated in §5: a login flood or an
  unparseable `PASSWORD_HASH` produces a dashboard that will not open and **no diagnostic
  anywhere**. `dashboard.sh check` (O20/O21) is the intended place to notice the second.

### ⚠ Do NOT copy — in descending order of damage

1. **A hand-rolled bound.** Five have been attempted in this tree; all are fixed once, in
   `deadline.ts`, and §5.3 enforces the call.
2. **A second `errnoCodeOf`**, or a second canonical base64url decoder. **Never match on
   message text** — Node reworded a `readFile` message between releases.
3. **A test that names a property it does not check.** Seven steps, seven occurrences.
4. **A test whose truth depends on a value it drew** (§5.4).
5. **A placeholder `null` on a field whose `null` already means something.**
6. **Deriving one three-valued field from another.** `null` is unknown and is never the alarm.
7. **A guard over a hard-coded file list, or over a global.** §5.3 notes 3 and 4.
8. **Raw control bytes in test files.** `grep`, `ripgrep` and `git grep` all reported a 533-line
   file as containing nothing.
9. **A parser that is tested, exported and unused.** Two exist, both with stated reasons.
10. **Per-file `pnpm vitest run <file>` as the green signal.** It skips `tsc`.

### Fixtures — import these, do not rebuild them

From **`lib/fixtures.ts`**: `nothingReadable` (every reading failed *because the probe could not
be performed*), `everythingZero` (everything read, many readings genuinely `0` — **a dead
fan**), `ch5Manual` / `ch5EcAuto`, `pwm5NodeAbsent` (the DKMS alarm), `pwm5Unreadable`,
`servingInstances` / `servingPopulated`, `servingIdentityOnly`. ⚠ There is **no "empty
snapshot"** — `snapshot.ts` builds six independent "could not report" collections instead.

From **`lib/collectors/samples.ts`**: raw captured text — `CAPTURED_PROC_*`,
`CAPTURED_NVIDIA_SMI`, `CAPTURED_DELL_SMM*`, `CAPTURED_LLAMA_*`, `CAPTURED_UFW_CONF`,
`CAPTURED_STATVFS_*`, `CAPTURED_DBUS_*`, `EMPTY`.

### Import convention

`@/` for cross-directory imports, relative within a directory. ⚠ **Three toolchains have to
agree about `@/` and they read three different files.** `tsc` and `next build` take it from
`tsconfig.json`'s `paths`; **Vitest does not read `paths` at all** and needs `resolve.alias` in
`vitest.config.mts`. Both are present, and the alias is proven by an actual `@/` import at the
top of `lib/guardrails.test.ts` — not by a text assertion.

---

## 8. Spec gaps — re-verified against `SPEC.md` (1219 lines) during step 7's reconciliation

⚠ This table has been **stale twice** (92 % before step 5, 100 % before step 6). Re-check it
against the spec text before trusting it.

**Open, with owners:**

| # | Gap | Owner |
|---|---|---|
| **S11 / G5** | §6.5's exception to *"an em dash always has an `errors[]` entry behind it"* applies **only when the coloured neighbour is in the same panel and carries a severity**. For channel 5 the neighbour reads **`unavailable`**, and O13 says `unavailable` is not a severity — so the exception does not reach it, and an em dash on `fan5` with `pwm5Present: true` still owes an entry no collector files | steps 9, 10 |
| **S19** | A *skipped* collector and a *failed* one are indistinguishable to §6.5's rendering rules. The message text carries the distinction; §6.5 has one bucket. Steps 9/10 will have to choose a sentence | steps 9, 10 |
| **S20** | §4's ceiling is stated for `collectHost` *because it is the only unbounded collector today*. The generalising rule: every collector either carries its own monotonic budget or is given a ceiling at the assembly, and no collector with per-subject verdicts may be given one | — |
| **S30** | **§5.2's sixth row has no tone.** *Could not reach the dashboard.* has fixed copy and a fixed submit state but no `data-sev`. `warn` was chosen (a condition of the server, like *Session expired*, not a rejected credential); `MOCK.html`'s state C predates the row | step 10 |
| **S31** | **§5 does not say whether a refused `Content-Type` counts against the rate limit.** The rationale decides it (a visited page must not spend the budget), so the check runs first — but the ordering is inferred, and it is the kind a refactor moves without noticing | — |
| **S32** | **§5.2 does not say what the login screen does while it cannot reach the dashboard.** Submit stays enabled; whether it should retry or back off is unstated. Current behaviour is one attempt per click | step 8 if it touches `/login` |
| **S33** | **§5 requires `Content-Type: application/json` but does not say whether parameters are allowed.** `application/json; charset=utf-8` is accepted; a stricter reading would refuse it and produce a login screen that works in one browser and not another | — |

**Closed by the current `SPEC.md`:** S14 (the 6 s worst case is intended), S15 (the `NoSuchUnit`
entry persists), S16 (the route's ceiling), S17 (`ts` = the poll's start), S18 (the 401 body),
S21 (the rate limit is global), S22–S29 (the login endpoint's grammar, statuses, the expired
hand-off, the argon2id/scrypt tension, the secret floor), plus S1–S13, G1–G6, C1–C5, F5 from
steps 2–5. **Declined rather than open:** S8 — `/v1/models` returning more than one model is a
state this box cannot reach.

Invariant 7 stands: **if the spec is silent, report it — do not assume.**

---

## 9. Deferred work, with owners

| Work | Owner | Status |
|---|---|---|
| **`ts`-keyed ring buffer, min/max decimation, backoff, visibility pause** | **step 8** | specified — §6.7 |
| **`conditionsFrom(snapshot)` as ONE function** (O11) | **step 8** | unblocked |
| **The once-per-session log for a suppressed standing condition** (O5) | **step 8** | unblocked |
| **Wire validation — no `as TelemetrySnapshot`** (O10) | **step 8** | open |
| **Step 8's own timer guard** | **step 8** | §5.3 |
| **jsdom, and `LoginForm`'s transitions at the DOM level** | **step 8** | see below |
| `fan_stopped` observations, ledger and banner wiring | steps 8, 10 | unblocked |
| **The GB → GiB rename** (O19) | **step 9** | open, and the spec has already moved |
| Formatter `parts` variant (O14) | step 9 | open |
| S11/G5's narrowed case | steps 9, 10 | open — §8 |
| Render "duty unreadable" vs "channel 5 absent" distinctly | step 10 | open |
| The header: dot + count + paused/stale mode (O2) | step 10 | unblocked |
| **Keep the server-rendered shell free of telemetry and secrets** | **step 10** | §3.2 — the standing condition under which the gate/route asymmetry is acceptable |
| **O20 — `dashboard.sh set-password` emits the scrypt format** | **step 11** | §4.1, **silent failure** |
| **O21 — `SESSION_SECRET` written unquoted** | **step 11** | §4.1, **silent failure** |
| **O22 — one process, one module instance** | **steps 11, 12** | §4.1, **silent failure** |
| **`dashboard.sh check`**: an unparseable `PASSWORD_HASH`; a `SESSION_SECRET` short or quoted; the env file's mode and owner | **step 11** | the only place either can be caught, because nothing is logged |
| **F7 — `LIMITS` bounds scrypt's memory but not its time** (measured 1 720 ms vs 58 ms at the worst accepted parameters). Bound the product `2^logN · r · p` | **step 11** | with `check`, which must explain a refused hash |
| **`UV_THREADPOOL_SIZE=16`** in the `docker run` line | **step 11** | §2.5 |
| **A container memory limit (`--memory`)** on `docker run` | **step 11** | raised on its own merits: a dashboard that OOMs the box whose thermal margin it watches |
| `.dockerignore` excluding `*.test.ts` | step 11 | see below |
| `node .next/standalone/server.js` + the `.next/static` copy | step 11 | open |
| Whether `dynamic` is honoured with Cache Components | step 11 | **unverified** |
| Root `CLAUDE.md` gains a pointer to `dashboard/SPEC.md` (§2.4) | step 11 | open |
| **The ufw allow rule for 8090**, added the 2026-09-04 way (`sudo ufw show added` first, from a session that stays open) and confirmed with `ufw status numbered` | **step 12** | open |
| **Verify one container process serves every request** (O22) | **step 12** | open |
| Measure channel 5's **spin-up** ramp read-only and settle §6.4's hold for `fan5_engaged` | step 12 | open — see below |
| Require the `0x` prefix in `throttle.ts`'s `HEX` | owner | open |
| **A commit point before step 11** | owner | open — §11 |
| React plugin, coverage provider, ESLint | first step that needs one | open |

**jsdom, and what step 7 deliberately did not do.** Step 7 rendered all six of §5.2's states
with `react-dom/server`'s `renderToStaticMarkup` in plain Node — no jsdom, no testing library —
by splitting `LoginCard` out as a **pure function of a `LoginView`**, and it lifted the
response→state mapping into `loginOutcome` so §5.2's outcomes are a table test. What remains
untested at the DOM level is `LoginForm`'s **transitions** (`submitting → wrong`,
`submitting → rate-limited`, countdown → idle). **Step 8 decides whether jsdom finally earns its
place**, and it is the first step with a real case: `document.hidden`, `localStorage`, and a
poller with timers. Invariant 6 applies — record what it buys and what it costs step 11's
image. Note `app/login/`'s countdown was read and is sound: `useEffect` keyed on `[state]`, one
one-shot `setTimeout` per tick, `clearTimeout` in the cleanup, zero → *Idle*, no leak on
unmount, correct restart on a fresh 429.

**`.dockerignore` and `*.test.ts`:** route tests are colocated with their routes, which is the
Next convention. Nothing imports them so they are not traced into `.next/standalone` — but
`next build` runs TypeScript over everything in `tsconfig.json`'s `include`, so a build context
carrying them also needs `vitest` resolvable. Excluding `*.test.ts` settles both.

**The channel-5 spin-up item, in full:** `pwm5` reads back the commanded duty *immediately*
while the tach climbs from EC auto's ~2210 to HIGH's 4300+, so `fan5` bands **alarm** across the
whole ramp. §6.4 does not debounce cell colour, so the cell **will** flash red on every engage —
and an engage happens whenever the GPUs cross 55 °C. Whether it also *banners* depends on
whether the ramp exceeds §6.4's 10 s hold, **never measured on this box** (`CLAUDE.md` records
only the ~50 s spin-*down*). Sample `fan5_input` across a natural engage while the cards are
hot, then choose between raising `fan5_engaged`'s hold to 30 s — matching the machine's own
`HIGH_DWELL` — and accepting the transient.

**Properties with no mutation, recorded rather than papered over:** `socket.destroy()` inside
`nodeDbus.connect`'s timer; `child.unref()` in `io.ts`; `session.ts`'s `Number.isFinite` guards
(**measured:** `JSON.stringify({ exp: Infinity })` is `{"exp":null}`, so no signed payload can
carry one); `session.ts`'s signature-length guard (behaviour-preserving because the `try`/`catch`
§5 requires swallows the same `RangeError`); *"the gate is at `proxy.ts` and there is no stale
`middleware.ts`"* (a fact about the file **tree**, and a harness mutates one file's contents);
and **"one bucket for the whole service"** (restoring a per-source key is a two-file change,
which a one-file mutation cannot express). Each is documented at its harness site. ⚠ One came
*off* this list in step 7: `login-form.tsx`'s `opaqueredirect` branch was unmutatable only
because it was buried in a component's submit handler — moving it into `loginOutcome` made it a
table test. **An untestable branch is often a placement problem rather than a testing one.**

---

## 10. Toolchain facts that cost time to learn

- **This is Next 16 and it is not the Next.js in your training data.** Read
  `dashboard/AGENTS.md` and the bundled docs at `node_modules/next/dist/docs/` before writing
  any Next code. Step 7's example: `middleware.ts` is now `proxy.ts`, and a file at the old name
  simply never runs.
- **`next build` rewrote `tsconfig.json` once**, setting `jsx: "react-jsx"` and appending
  `.next/dev/types/**/*.ts` to `include`. Absorbed; a build now leaves it byte-identical
  (`md5 8b6e358b0e19ad663d554dc8310c6da0`). All eight strictness flags survive and are asserted
  as text.
- **`pnpm start` is not the deployment path.** It prints `⚠ "next start" does not work with
  "output: standalone"` and then serves correctly anyway — from a different code path than the
  container uses. **Step 11 runs `node .next/standalone/server.js`**, after copying
  `.next/static` and `public` into `.next/standalone/.next/`; Next does not copy them.
- **`tsc` bails silently on an invalid config.** `strict: false` with
  `exactOptionalPropertyTypes: true` is `TS5052`; the compiler stops before checking anything
  and Vitest reports `Type Errors no errors`.
- **`execFile`'s callback fires on `'close'`, not `'exit'`.**
- **`setTimeout` clamps a delay outside the 32-bit signed range to 1 ms**, and `NaN` the same
  way. `boundedTimeoutMs` exists because of it. **Step 8's cadences and backoff are inside that
  range; its `Retry-After` countdown is not necessarily** — a hostile or absent header must not
  become a 1 ms timer.
- **`performance.now()` is a global from Node 16** and needs no import. `setTimeout` counts on
  libuv's cached millisecond clock while `performance.now()` is finer, so a timer can fire
  *marginally before* its deadline — `deadline.ts` carries a latch, and its test uses
  `vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout'] })` so the timer is faked and
  `performance.now()` is not.
- **`vi.advanceTimersByTimeAsync` drains microtasks between timers.** A synchronous read of a
  spy's call count does not.
- **A background tab throttles `setTimeout`**, so a countdown there runs *slower* than the
  server's clock — which is the safe direction for a lockout (it can only over-state the wait)
  and the **unsafe** direction for anything that assumes a tick happened. §6.7 pauses polling on
  `document.hidden` for this reason.
- **libuv's thread pool is four threads by default**, `readFile`/`readdir`/`statfs` all run on
  it, an in-flight one cannot be cancelled, and **four blocked operations block every subsequent
  read in the process indefinitely**. `crypto.scrypt` runs there too, which is why the KDF is
  serialised.
- **`Buffer.from(s, 'base64url')` is lenient** — it *skips* characters outside the alphabet
  rather than failing, and it accepts non-canonical spellings. `decodeExact` in
  `lib/auth/base64url.ts` is the only correct way to read one of our fields.
- **`crypto.scrypt` throws SYNCHRONOUSLY on bad parameters**, not through its callback.
- **`noUncheckedIndexedAccess` is on**, so every `split()[i]` is `string | undefined`.
- **The lockfile carries every linux/x64 variant step 12 needs** —
  `@typescript/typescript-linux-x64`, `@next/swc-linux-x64-gnu` *and* `-musl`,
  `@rolldown/binding-linux-x64-gnu`. `node:24-slim` is glibc. `pnpm install --frozen-lockfile`
  exits 0.
- **Inside `node:24-slim` the build runs as root**, so a plain `corepack enable` works.

---

## 11. Repo state, environment, and the commit point

```
$ git status --short
 M .gitignore
?? dashboard/
```

**Nothing in this project has been committed yet.** `PLAN.md` and the repo's own `CLAUDE.md`
both say commits happen only when asked, and no phase has been asked. **A commit point is needed
before step 11** — step 12 verifies the deployment survives a reboot, which is not something to
attempt from an untracked tree. It would also restore `git grep` over this tree, which currently
searches nothing here. Raise it; do not take it unasked.

`dashboard/.gitignore` covers only `*.tsbuildinfo` and `coverage/`. **`AGENTS.md` and
`CLAUDE.md` inside `dashboard/` are deliberately NOT ignored** — `next dev` rewrites them on
every run, so ignoring them means permanent untracked churn no `git status` will surface.
`AGENTS.md` is marker-delimited so project notes added outside the markers survive.

| | |
|---|---|
| Dev machine | macOS. **Node v24.16.0 (nvm) and v26.8.1 (`~/.hermes`) both installed** — §1 decides which one runs. pnpm 12.3.4 via corepack at `~/.local/bin`. **No Docker** |
| Target | `ai-server` at **192.168.4.71**, `ssh ai-server`. **Node absent, Docker absent** |
| Repo | git, branch `main`. `dashboard/` untracked |

The box is reachable over SSH and **read-only queries against it are legitimate evidence** —
step 2 settled a finding with three `nvidia-smi` queries, step 3 captured every `/proc` and
`coretemp` fixture with `cat`, step 4 measured `pwm5`'s errno with a read-only `python3 -c`, and
step 5 replayed its own D-Bus frames at the live system bus. **Invariant 2 still holds: nothing
writes to the server** — no `systemctl`, no hwmon write, no `set-model`, no `LoadUnit`, and
`/v1/chat/completions` has never been called. **Steps 6 and 7 needed the box for nothing, and
step 8 needs it for nothing either**: polling, buffers, decimation and timers are all
in-process.

The repo root's `CLAUDE.md` carries the hardware history behind every rule here — the 5-fan DKMS
module, the POST hang, the closed-loop-on-tach EC, the ufw incident that `ufwEnforcing` exists to
catch, and the SSH lockout that followed it. Read the *Serving* and *Server Administration*
sections if a decision here looks arbitrary; they are the reason these panels exist.
