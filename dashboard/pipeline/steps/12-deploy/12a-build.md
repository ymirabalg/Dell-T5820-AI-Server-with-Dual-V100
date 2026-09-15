# 12a — BUILD. **The first production failure, closed: every takeover branch says why, and the header stops claiming health over a blind collector.**

**Written by the BUILD phase, 2026-09-14.** Branch `dashboard-frontend`, working dir `dashboard/`.
Nothing committed. `SPEC.md`, `MOCK.html` and `INSTALL-SPEC.md` untouched (the parent's edits to the
first and third are the brief this loop built to). Nothing deployed to the box.

⚠ **Two things in this file are findings rather than work**, and they are the ones to read first if
you read nothing else: **§6** (the D-Bus diagnosis, measured on the live bus) and **§7.1** (the
browser measurement harness has been unrunnable since 11b, and that is why §6.1's numbers below are
derived from a standalone paint measurement rather than from `measure-breakpoints.mjs`).

---

## 1. What was built

| # | The ruling | Where | State |
|---|---|---|---|
| 1 | Every takeover branch renders its `errors[]` | `components/panels/gpu-panel.tsx` | **built**, and the sweep that finds siblings is generated |
| 2 | The header may not read healthy while any collector is failing | `lib/client/header-status.ts`, `components/header.tsx`, `app/dashboard-shell.tsx` | **built**; wording and the dot are `12a-Q1`/`12a-Q2` |
| 3 | `check` gains an in-container `nvidia-smi` row that judges its own failure | `dashboard.sh` (`check_container_gpu_access`) | **built**, reasoned-not-run (no Docker on this Mac) |
| 4 | Unit-installing scripts restart `ai-dashboard` after reloading systemd | `dashboard.sh`, `../gpu-fan-control.sh`, `../serve-llm.sh` | **built**, guarded three ways |
| 5 | Diagnose the D-Bus `ECONNRESET` entries before choosing a fix | — | **diagnosed, not fixed** — §6 |

---

## 2. Item 1 — every takeover branch renders its `errors[]`

### 2.1 The one branch that did not, before and after

`components/panels/gpu-panel.tsx`, the `absent` branch — §6.5's *retired* case, a card missing from
a `gpus[]` that **was** read:

```
before                                    after
┌──────────────────────────┐              ┌──────────────────────────┐
│ GPU 1   — · —         ▒  │              │ GPU 1   — · —         ▒  │
│                          │              │                          │
│ card not enumerated      │              │ card not enumerated      │
│                          │              │ ┌──────────────────────┐ │
└──────────────────────────┘              │ │ nvidia-smi: exited…  │ │  ← PanelNotes, bound="roomy"
                                          │ └──────────────────────┘ │
                                          └──────────────────────────┘
```

One `PanelNotes` call, through the same bounded well every other block uses. `bound="roomy"`, for the same reason the
`gpus: null` branch below takes it and by the same arithmetic: **row 1 is `max(gpu0, gpu1)`, this branch
draws no chart**, and a takeover card sits far under the 176 px the healthy card sets row 1 to. In
the *retired* case at least one card is normally still enumerated and sets the row on its own.

### 2.2 The sweep — generated, and it found its own exclusion

`app/collector-visibility.test.tsx` (new). It does not list branches. It takes the product of

- **every §3.7 source**, read from `lib/client/wire.ts`'s `ERROR_SOURCES` — now exported, because it
  is the project's only runtime enumeration of the closed union, and a nineteenth source added to
  `lib/types.ts` then reaches the sweep with nobody editing the test; and
- **seven snapshot shapes**, which are exactly §9's two enumerated collections' membership axis:
  `healthy`, `gpus: null`, `gpus: []`, one card absent, `serving: null`, `serving: []`, nothing read

…and renders **the real `DashboardShell`**, not a panel in isolation — because the 2026-09-14 failure
was only visible in the assembly (both GPU branches were tested, `aggregateStatus` was tested, and
the page still said nothing). **126 cases**, two properties each, plus a vacuity assertion on the
generator itself (18 × 7 = 126) and the healthy-page control.

| property | holds for | exclusions |
|---|---|---|
| the collector's own message reaches the page | every (source, shape) | **`hostname`, `proc-uptime`** — asserted in the NEGATIVE, so the list stays honest |
| the header does not read `all healthy` | every (source, shape) | **none** |

**The exclusion is a real finding, not a convenience.** `panelsForSource` sends those two to §6.2's
header, and the header's height is `--band-reserve: 102px`, a measured constant §6.1's row
arithmetic subtracts from `100vh` before dividing what is left. There is nowhere bounded to put a
message there, and inventing one is a §6.1 decision. `12a-Q3`. What they do get is item 2's count.

### 2.3 ⚠ It was falsified, not just run

With the four added lines removed from `gpu-panel.tsx` and nothing else changed:

```
× ⚠ the collector message reaches the page — shape gpusEmpty, source nvidia-smi
× ⚠ gpus: [] — the RETIRED branch, which drew "card not enumerated" and nothing else
× ⚠ one card enumerated and one not — the takeover and a live card on one page
Tests  3 failed | 254 passed (257)
```

Note which case the **generated** row caught and which it did not: `gpusEmpty` went red, and
`absentCard` did **not** — with one card still enumerated, GPU 0's own non-takeover notes block
renders the same `nvidia-smi` message, so "the message reaches the page" is satisfied by the other
card. That is the honest reading of the property, and it is why §3's named acceptance test — which
counts **two** occurrences, one per card — earns its place beside the generator rather than being
folded into it.

### 2.4 The sibling sweep's result — what else was checked, and what it found

Every other panel already renders its sources, and the sweep says so rather than my having read
them: SERVING's two empty states (`null` and `[]`) route `servingErrors` through `PanelNotes`;
COOLING splits `dell-smm` into the notes well and `dbus` into the fan-service row's `detail`; SAFETY
gives each of its four sources a row; CPU, MEMORY and STORAGE render theirs unconditionally. **No
second takeover branch was hiding anything.** The only hole the product found is the header's, above.

⚠ One qualification the property is deliberately stated around: a panel renders **the last message
per source**, not every entry (`errorFor`/`findLast`, and `S-G-Q1` is open on exactly that). The
sweep files one entry per case, so it measures the join, not the fold.

---

## 3. Item 2 — the header, and the two decisions inside it

### 3.1 The rule

`aggregateStatus` takes a **fourth** input: `failingSourceCount(snapshot)` — how many distinct §3.7
**sources** filed an `errors[]` entry on the latest snapshot.

| mode / alarms / severity / failing | before | after |
|---|---|---|
| live · 0 · `normal` · 0 | `● all healthy` | `● all healthy` (unchanged) |
| **live · 0 · `normal` · 1** | **`● all healthy`** | **`● 1 source unread`** |
| live · 0 · `normal` · 2 | `● all healthy` | `● 2 sources unread` |
| live · 6 · `alarm` · 2 | `● 6 alarms` | `● 6 alarms · 2 sources unread` |
| paused · 0 · `normal` · 1 | `❙❙ paused` | `❙❙ paused · 1 source unread` |
| live · 0 · `null` · 2 | `● no readings` | `● no readings · 2 sources unread` |
| expired · any | `⊘ signed out` | unchanged |

Row 2 is the production case: on 2026-09-14 every **other** collector read fine, so `severity` was a
confirmed `normal` and `alarms` was `0` — the three inputs of a perfectly healthy machine. That is
why the fixture in every new test pins `severity: 'normal'`, and not `null`: a null-severity fixture
would pass the property for the wrong reason (`no readings` already claims nothing).

### 3.2 The three wording decisions, recorded (invariant 7) — `12a-Q1`

§6.2's ruling fixes the **rule** and gives no literal for the partial case, so:

1. **The unit is the SOURCE, not the entry.** §3.7's granularity is per source
   (`errorsForPanel`'s own doc), and `collectCooling` routinely files several messages under one
   `dell-smm`. Counting entries would make one wedged collector read as five faults.
2. **The word is `unread`, and it is a count** — the same omit-at-zero collapsing rule §9 already
   applies to the alarm count. It claims nothing, invents no severity word, is distinct from every
   other literal, and pairs with §6.2's existing `no readings`, which is the *total* case of the
   same fact. Rejected: `partial` and `degraded` (severity words §6.3 does not define) and
   `N collectors failing` (§3.7 has no "collector" — `collectHost` files nine sources).
3. **`all healthy` is REPLACED; every other text is SUFFIXED.** `all healthy · 2 sources unread` is
   the one shape the ruling forbids in as many words. The others make no health claim, so they keep
   their own words — losing `paused` would be `10a-HS4` by another route.

### 3.3 ⚠ The dot moves with the words — `12a-Q2`, and it is a decision

§6.2's ruling governs what the header **says** and is silent on what it **paints**. Left alone, a
green `✓` would sit three pixels from the words `2 sources unread` — which is precisely the
disagreement §6.2 rejected `all healthy` for in the `severity === null` case, and precisely what
`10a-F5` fixed by giving this function `severity` at all.

So `AggregateStatus` now carries **the severity the caller paints**, and `header.tsx` renders
`status.severity`, not the raw prop. A `normal` reduction with any failing source is downgraded to
**no band**; `watch` and `alarm` are untouched. That is `10b-S-F`'s panel-head ruling — *"a panel
that would read `normal` while any of its own readings is `—` shows no band instead … it
deliberately does NOT drop to no-band for `warn` or `alarm`"* — applied one level up, to the summary
§9 says an operator reads from across the room. **Recorded for the owner rather than assumed
settled.**

### 3.4 ⚠ The status text is an unbounded string in a band whose height is a constant — MEASURED

`.status` in `header.module.css` is `white-space: nowrap` with no `max-width`. It is the same class
of hazard as the hostname 10h had to truncate, and **12a makes the string longer**, so it was
measured in real headless Chrome at **1280×1024** — the tightest viewport §6.1 names — against this
project's own `tokens.css` + `header.module.css` and the real rendered header markup:

| `.statusText` | width | header height |
|---|---:|---:|
| `all healthy` (today, healthy) | 76.5 px | **43.0** |
| `6 alarms` (today, worst) | 55.6 px | **43.0** |
| `1 source unread` (12a) | 104.3 px | **43.0** |
| **`paused · 6 alarms · 18 sources unread` (12a's ceiling)** | **257.3 px** | **43.0** |
| the wrap threshold at 1280 | 500.6 px | 43.0 |
| one character past it | 507.5 px | **71.8** ← the band breaks |

18 is **every** §3.7 source failing at once, so that row is a ceiling, not an estimate. **243 px and
36 characters of margin** at 1280; at 1600 and 1920 the header does not wrap within 60 extra
characters at all. 43 px is the number `--band-reserve: 102px` is built on (43 header + 58.8 banner),
so the constant is untouched.

Method, since `measure-breakpoints.mjs` could not be used (§7.1): the real `<Header>` was rendered to
markup, the CSS-module hashes stripped, and the result painted in the same headless Chrome with the
project's own stylesheets. **The harness was calibrated to detect the failure it is looking for** — a
deliberately absurd status string takes the header to 71.8 px. `header-status.test.ts` carries the
table and a character budget as a cheap standing proxy (deliberately **not** ⚠-marked: a text-length
assertion cannot see a font or CSS change, and marking it would claim more than it measures).

---

## 4. Item 3 — `check`'s in-container `nvidia-smi` row

`dashboard.sh`: `check_container_gpu_access`, wired into `cmd_check` between `check_container` and
`check_drift`, and into `packaging.test.ts`'s `CHECK_ROWS` (which asserts both the source-text call
graph and that each row can reach the exit code).

**Why it had to be a new row rather than a widening of `check_container`:** on 2026-09-14 the GPU-mode
row *passed*. `.HostConfig.DeviceRequests` still named the device request, because the request is
what the container was **created** with and the cgroup is what the reload rewrote underneath it. Host
side proved nothing; that is the whole lesson.

**How it judges its own failure.** `docker exec`'s exit status conflates *the command inside failed*
with *the exec never happened*, so the verdict is taken from a **marker the inner shell prints**:

```sh
docker exec "$CONTAINER" sh -c 'nvidia-smi -L >/dev/null 2>&1; echo "RC=$?"'
```

No `RC=` in the output ⇒ `noexec` ⇒ **`unknown`**, never a tick and never a failure — a wrong
diagnosis here sends an operator to restart a container whose devices are fine.

| declared mode | inner exit | verdict | why |
|---|---|---|---|
| `gpu` | 0 | **pass** | measured: the container read the cards |
| `gpu` | non-zero | **FAIL** | the 2026-09-14 shape, named in the message, with `restart` as the fix |
| `fallback` | non-zero | **pass** | measured *agreement* with INSTALL-SPEC §11.1's documented fallback |
| `fallback` | 0 | **FAIL** | the mode reported and the access measured disagree |
| unreadable mode | any | **unknown** | nothing to judge the exit status against |
| exec produced no marker | — | **unknown** | *nobody looked* |
| no container / no docker / no daemon | — | **unknown** | — |

⚠ **The `fallback`-and-failing row is a `pass` on purpose, and it is not an unmeasured tick**: the
command *was* run and its failure is exactly what §11.1's fallback predicts. `row_unknown` there
would make a box in the documented fallback state exit 2 for ever — and `install` FAILS on a non-zero
`check` (INSTALL-SPEC §12.2), so a legitimately-fallback box could never be installed onto.

**Seven rows added to `packaging.test.ts`'s guard-refusal table**, one per arm, including the two
that distinguish *unknown* from *fail*. The `docker exec` stub can produce **nothing**, deliberately:
a stub that always emitted a marker could not tell those two arms apart.

⚠ **Reasoned, not run.** Docker is not installed on this Mac. What is measured is the row's logic
against a stubbed `docker`; what is **not** measured is that `docker exec` on a `--read-only`,
`--user 10001:10001` container with `NVIDIA_DRIVER_CAPABILITIES=utility` can run `nvidia-smi -L` at
all. The collector already spawns `nvidia-smi` inside that container every poll, so the binary is
present by the same evidence — but "the exec succeeds as root from the host" is a box-side check for
the parent. See §8.

---

## 5. Item 4 — restart after a `daemon-reload`

`restart_after_daemon_reload()` in `dashboard.sh`, called from `cmd_unit` **after** `daemon-reload`
(and the order is asserted, not just the presence — a restart before the reload restores nothing).
It **replaced** the old warning, which was true and not enough: by the time it printed, the running
container's device access was already gone.

Three guards, each of which is a way this could otherwise fail a run it has no business failing:

| guard | why |
|---|---|
| not installed ⇒ `info`, exit 0 | `systemctl restart` on an absent unit exits non-zero; under `set -e` that aborts `unit`, and from `install` at the step after the unit was enabled |
| installed but **not active** ⇒ left alone | `restart` would **start** it — during `install`, before `cmd_firewall` writes its rule, the ordering `11-A9` moved the ufw refusal to step 0 to protect. Nothing that is not running has lost its devices |
| a failed restart is **reported**, never swallowed | the reload already happened, so silence means a container running without device access that nobody knows about (`11-A12`) |

The siblings — `../gpu-fan-control.sh` and `../serve-llm.sh` — each gained the same guarded
`restart_ai_dashboard`, after **both** of their `daemon-reload` sites (`install` and `uninstall`).
They are written in each script's own idiom and return 0 for a box that has never installed the
dashboard, which is the ordinary case. `shellcheck` is clean on `dashboard.sh` and
`gpu-fan-control.sh`; `serve-llm.sh` has **6 pre-existing SC2015 info notices, 6 before and 6 after**
this change (verified against `git show HEAD:serve-llm.sh`).

Four ⚠ tests in `packaging.test.ts` cover the restart, three of them about **not** restarting.

---

## 6. ⚠⚠ Item 5 — the D-Bus `ECONNRESET`, diagnosed with evidence

Read-only measurements on the live box (`ssh ai-server`), 2026-09-14. **Nothing was written, no unit
was touched, no `daemon-reload` was run** — the trigger is the one thing that could not be
reproduced, because reproducing it revokes the live container's GPU access again (§6.4).

⚠ **One probe had a side effect and it is disclosed here rather than left out.** The
connection-limit experiment opened 64 connections that had authenticated but not sent `BEGIN`,
which is what dbus counts as *incomplete* — so for **~3 seconds** the bus's global
`max_incomplete_connections` pool (64) was full and a new client would have had to wait. All 64
were closed immediately, the journal shows nothing disturbed, and the probe was **not** repeated.
The intended design (authenticate each connection so only the per-**user** limit is exercised) was
wrong about where auth ends; that mistake is itself one of the measurements below.

### 6.1 What the entry's own text proves

The message is `` `${socket}: ${reason(e)}` `` — `/run/dbus/system_bus_socket: read ECONNRESET`.
`read` is Node's `syscall` field. A **connect** failure reads `connect ECONNREFUSED` / `connect
ENOENT` / `connect EACCES`. So:

> **the socket was ESTABLISHED, we wrote to it, and the bus closed the connection with our bytes
> still unread.** On AF_UNIX that is `unix_release_sock`'s rule — a peer that closes while data sits
> unread in its receive queue sets `ECONNRESET` on the other end; a peer that has drained us gives a
> clean EOF, which this code would have reported as *"the system bus closed the connection"*.

**Two entries in one response is structural, not two symptoms.** `collectUnitStates` has exactly two
callers — `collectSafety` (`FAN_SERVICE_UNIT`) and `collectServing` (the `llama-server@<i>` units) —
and each opens its **own** connection per poll. One bus-side event yields exactly two identically
worded entries.

### 6.2 What was reproduced on this box

A read-only probe (`GetUnit`/`Properties.Get` only; `LoadUnit` is never used) run as uid 1000
against the live system bus:

| case | what the client saw |
|---|---|
| correct handshake + `Hello` | `OK`, 262-byte reply — **the client is protocol-correct** |
| **no leading NUL** (the bus drops it at the first byte) | **`errno 104` = ECONNRESET on the first read** ← the fingerprint, reproduced |
| `AUTH EXTERNAL` claiming uid 0 while being uid 1000 | clean `REJECTED EXTERNAL`, connection held — **never a reset** |
| garbage after `OK` | an `ERROR` reply, connection held — **never a reset** |
| the bus's incomplete-connection pool saturated (64) | the next client **hangs** — **never a reset** |

**So the only condition that produces this fingerprint is a drop at connection SETUP**, and none of
the auth-level or protocol-level misbehaviours does.

### 6.3 What is excluded, by measurement

| hypothesis | excluded by |
|---|---|
| the bus restarted and the bind-mounted socket inode went stale (11b-A4's inode rule applied to `/run/dbus/system_bus_socket`) | `systemctl show dbus`: **`NRestarts=0`**, main PID 1257, started **2026-09-13 00:06:12** — boot. `/run/dbus/system_bus_socket` still carries its **boot-time mtime**. The mount was never stale, and a stale one gives `ECONNREFUSED`, not a reset |
| our client is misbehaving on the wire | case 1 above, and the fact that unit states render normally |
| a wrong/absent uid for `--user 10001:10001` | a lying uid gives `REJECTED`, measured. ⚠ Noted for completeness: **uid 10001 has no `/etc/passwd` entry on this box** (`getent passwd 10001` → nothing), which affects only `<policy group=…>` evaluation and cannot be intermittent |
| a leaked connection exhausting `max_connections_per_user` (256) | ⚠ **weakened, and said so**: `ss -x \| grep -c system_bus_socket` → **11** system-wide today, all of them other daemons, so nothing is leaking **now**. That is a measurement of the present, not of 21:00:34 — and `12a-Q6` names the one code path that could ever produce such a leak |

### 6.4 ⚠ Why no more can be established, and it is not for want of looking

**A bus-side drop is SILENT.** None of the four provoked drops produced a single line from
`dbus-daemon[1257]`, and `journalctl` for 2026-09-14 carries **nothing** from it but two unrelated
PackageKit activations. So *"there is nothing in the journal"* is **not** evidence against a bus-side
drop, and no retrospective evidence for 21:00:34 exists or can be recovered.

The trigger window is established from the journal: `systemd[1]: Reloading...` → `Reloading finished
in 238 ms` at **21:00:34**, from `sudo /home/yorman/gpu-fan-control.sh install`, followed immediately
by a stop/start of `gpu-fan-control.service`. The one experiment that would close this — a
`daemon-reload` with a client-side trace running — **is the very action that revokes the live
container's GPU access**, so it was not run. It needs a maintenance window and the owner.

### 6.5 Is it benign? **No — and here is the proof it is not**

A `dbus` failure sets `unitState: null` for **every** unit it was asked about, so:

- COOLING's `fan service` row, SAFETY's `fan service` row and **every** SERVING row lose their state
  — `panelsForSource('dbus')` reaches all three panels, checked against `S-G` and `S-H` as the
  handoff required rather than assumed;
- `severityUnitState(null)` is `null`, so **O12 mints no condition at all** for any of them: those
  rows contribute nothing to §9's aggregate.

That is item 2's defect exactly, on three panels at once. **It must stay visible, and after this loop
it is**: the entries render on all three panels as before, and the header now says `1 source unread`
instead of `all healthy` while they exist. **Nothing was suppressed.**

### 6.6 Two defects found while reading the path — recorded, not fixed

- ⚠ **`12a-Q5` — the entry cannot say where it came from.** `` `${socket}: ${reason(e)}` `` is
  written in **two** places in `collectUnitStates`: the connect failure, and the catch around the
  whole conversation (auth + `Hello`). An operator cannot tell *"the bus refused the connection"*
  from *"the bus dropped us mid-handshake"*, and neither could this loop. Not changed: the handoff
  forbids choosing a fix before the cause is known, and §3.7 makes the message the collector's own
  copy.
- ⚠ **`12a-Q6` — an abandoned `connect` leaks its socket.** If the shared 2 s deadline expires in the
  same tick `dbus.connect` resolves, `within` rejects, the resolved `DbusStream` is dropped **with
  its socket open**, and `nodeDbus.connect`'s own timer has already been cleared. One leaked fd per
  occurrence, for the life of the process. Step 5's reconciliation fixed the *other* half of this
  exact hazard (*"nothing ever called `destroy()`"*); this half needs `connect` to take ≈2 s, so it
  is narrow — but it is the only mechanism in this code that could ever reach a per-user connection
  limit, which is the one setup-time drop this deployment could plausibly cause.

---

## 7. Measurements, and one that could not be taken

### 7.1 ⚠⚠ THE BROWSER MEASUREMENT HARNESS HAS BEEN UNRUNNABLE SINCE 11b

Both `measure-breakpoints.mjs` and `mocks/measure-arrangements.mjs` **fail before they measure
anything**, on this tree and on `HEAD`:

```
page.waitForSelector: Timeout 15000ms exceeded.
  - waiting for locator('[data-slot="gpu0"]') to be visible
```

**The cause, measured.** Both scripts spawn `next dev` with a generated credential pair in
`PASSWORD_HASH` / `SESSION_SECRET` **environment variables**. `SPEC.md` §5.1's ruling of 2026-09-11
(11-Q2) took both secrets *out* of the environment: `lib/auth/secrets.ts` reads
`/etc/ai-dashboard.env` and **nothing in the auth path reads `process.env` any more**. On this Mac
that file does not exist, so the server prints

```
ai-dashboard: REFUSING TO START — /etc/ai-dashboard.env is not readable as §5.1 requires
  (NODE_ENV is not 'production', so this is a WARNING and the server is starting anyway…)
```

…and then `POST /api/session` answers **401** to the script's own password (reproduced directly with
Playwright: *"Password not recognised."*). §5 is behaving correctly — *no `PASSWORD_HASH` is a
denial, not a bypass* — and the harness simply cannot get past the login screen any more.

**It is pre-existing, and the dates say so without my having to argue it:** `lib/auth/secrets.ts`
landed **2026-09-11 09:36**; `measure-breakpoints.mjs` was last touched — and last run, per 10h's
notes — on **2026-09-10 14:48**. 11b's own run log (§0.0) lists `pnpm verify`, `shellcheck` and two
mutation harnesses, and **no browser run**. Nobody has run these since the ruling that broke them.
`SECRET_ENV_FILE` is a hard-coded `/etc/ai-dashboard.env` with no override, so there is no way to run
them on this Mac without either writing a credentials file into `/etc` (sudo, on a developer
machine) or adding a path override to the module 11b spent a whole loop hardening. **Both are
decisions, not repairs — `12a-Q4`, recorded rather than taken.** Two candidate repairs are named
there.

### 7.2 What this loop's rendering change does to the graded pages — derived, and the derivation is checkable

**Zero.** The GPU change adds height on the `absent` branch **only**, and **no graded fixture can
reach it**: every fixture in both scripts enumerates cards 0 and 1 (`measure-breakpoints.mjs:575`,
`:666`, `:711`, `:846`, `mocks/measure-arrangements.mjs:142`, `:205`), and the hostile one adds more.
⚠ **That is also why `10e-Q4` was never caught by a browser measurement in the first place: no page
this project has ever measured renders `gpus: []`.** The same sentence 10g had to write about the
throttle line.

The header change is the one that *could* have moved a graded number, and it is the one §3.4
measured directly in the same headless Chrome, with the harness calibrated to detect the wrap it is
looking for: **43.0 px at 12a's ceiling, against a 500.6 px threshold and 257.3 px of text.**

### 7.3 The suite

| command | result |
|---|---|
| `pnpm verify` | **exit 0 — 106 files, 3447 tests, no type errors** (was 105 files / 3441 tests at the start of this loop) |
| `shellcheck dashboard.sh` | **clean** |
| `shellcheck ../gpu-fan-control.sh` | **clean** |
| `shellcheck ../serve-llm.sh` | 6 SC2015 *info* notices — **6 before this change and 6 after** |
| `pipeline/steps/10-panels-assembly/regressions.py` | **exit 0 — 319 mutations, all bit; every ⚠ mark reddened** |
| `pipeline/steps/11-packaging/regressions.py` | **exit 0 — 189 mutations, all bit; 82 ⚠-marked tests checked, every one reddened** |
| `measure-breakpoints.mjs` | ⚠ **could not run — §7.1**, and not because of this change |
| `measure-arrangements.mjs` / `check-density.mjs` | ⚠ **could not run — §7.1**, same cause |

Harnesses were run **serially, in the foreground, one at a time**, never beside `pnpm verify`.

### 7.4 Mutations added

**Step 10 (13 mutations, `12a-` prefix, allowlist widened):** `12a-GP1` (the retired takeover loses
its notes — the production failure verbatim), `12a-GP2` (it explains the wrong panel), `12a-GP3`
(its well loses the `roomy` bound — 10f-GP1's property on the other branch), `12a-HS1`
(the header claims health again), `12a-HS2` (`all healthy` suffixed instead of replaced), `12a-HS3`
(the clause eats every mode's own words), `12a-HS4` (the dot stays green), `12a-HS5` (an unrelated
failure greys out a red dashboard), `12a-HS6` (the count is of entries), `12a-H1` (the header paints
the raw prop), `12a-DS1` (the shell hard-codes a healthy count), and — added by the ledger rather than by the
build, see §7.6 — `12a-HS7` (a snapshot that has not landed yet counts as a failing collector) and
`12a-HS8` (the clause stops being omitted at zero, so a healthy page reads `0 sources unread`).

**Step 11 (8 mutations):** `12a-SH1` (the row is deleted from `cmd_check`), `12a-SH2` (an exec that
never ran scores as a pass), `12a-SH3` (…scores as a failure), `12a-SH4` (the row reads the exit
status alone, so a fallback box can never be installed onto), `12a-SH5` (`unit` goes back to warning
instead of restarting), `12a-SH6` (the installed guard drops), `12a-SH7` (an inactive unit is
started), `12a-SH8` (a failed restart is swallowed).

### 7.5 ⚠ Five existing mutations had to be re-aimed, and the harnesses are what found them

Both harnesses' **first** runs returned 1 — neither on a mutation that failed to bite, but on the
structural checks this change tripped:

- **ANCHORS MOVED — `10a-H12`, `10a-H14`, `10a-H15`.** All three aim at the header's severity: two
  at `data-severity={severity ?? 'none'}`, which is now `status.severity` (§3.3), and one at
  `aggregateStatus(mode, alarms, severity)`, which now takes four arguments. **Re-aimed onto the new
  text; every property is unchanged**, and each carries a dated note saying what moved.
- **ANCHOR NOT FOUND — `11b-K5`,** in the step-11 harness, and for the same reason one level
  down: its anchor is the two adjacent lines `check_container` / `check_drift`, and item 3's new
  row now sits between them. Re-aimed onto the new neighbour; the property — *`check_drift` is
  dropped from `cmd_check` and 11-Q3's whole comparison goes with it* — is unchanged.
- ⚠ **ANCHOR AMBIGUOUS — `10f-GP1`.** Its anchor is the takeover's `PanelNotes` call *as bare text*,
  and item 1 gave the **absent** branch the same call — so it matched **twice**, and
  `replace(…, 1)` would have taken whichever came first. Pinned to the `gpus: null` branch by its
  trailing `) : (`, and **`12a-GP3` is the same property on the other branch**, with a ⚠ test of its
  own. That is the harness's own rule working: *"pin it to one site"*, rather than a mutation
  quietly moving to a branch nobody chose.

Worth stating because it is the third time this project has had a harness catch a change the suite
could not see: neither failure is a wrong implementation, and both would have left a mutation
silently testing something other than what its name says.

### 7.6 ⚠ The red-test ledger found FOUR inert ⚠ tests of this loop's own, and two of them were fixtures

The step-10 harness's second run bit every one of its 310 mutations and then returned 1 on the
ledger: four ⚠-marked tests **no mutation could redden**. Per the harness's own rule the first
hypothesis is *"the test asserts less than its name"*, not *"add a mutation"* — and for two of them
that was exactly right:

| the inert ⚠ test | why no mutation could redden it | what changed |
|---|---|---|
| `⚠ entries from different sources each count once…` | three entries, three sources — so the answer is **also** `errors.length`, and `12a-HS6` (*the count becomes a count of entries*) produced the identical number. **The fixture could not tell the property from its most likely wrong implementation** | a fourth entry, a second `dbus` line — which is the real shape anyway, since `collectUnitStates` files one per unit |
| `⚠ the production snapshot counts the source that blanked the GPUs` | the same defect, same cause | a second `dell-smm` entry: three entries, two sources |
| `⚠ a healthy snapshot is 0, and so is a snapshot that has not landed yet` | a genuine property with no wrong implementation yet written | **`12a-HS7`** — `null` counts as one failing collector, so the pre-first-poll header accuses a machine it has not read |
| `⚠ and the healthy page still says all healthy…` | the sweep's own anti-vacuity control | **`12a-HS8`** — the clause stops being omitted at zero and a healthy page reads `0 sources unread`, which is §9's rule the alarm count already has |

All four are reddened now, each verified against its own mutation before the harness was re-run.
⚠ **Note which direction this went**: two of the four were repaired by making a FIXTURE
discriminating, not by adding a mutation to chase them green — the distinction HANDOVER §0.14 is
about, applied to this loop's own tests rather than to the code they cover.

### 7.7 One harness bound raised, and it is not a guard

`packaging.test.ts`'s guard-refusal table sources `dashboard.sh` once per row in a real bash
subprocess; §11.4's seven new rows took it past vitest's 5 s default (5 692 ms before them). It now
carries an explicit `30_000`. The number bounds the **harness**, not anything the script does —
leaving it to time out would have retired the whole table's verdict, sixty-odd refusals, for an
unrelated reason.

---

## 8. Reasoned-not-run — what the parent must check on the box

Docker is not installed on this Mac, and the box is live.

1. **`sudo ./dashboard.sh check`** — the new row's first real run. Specifically that
   `docker exec ai-dashboard sh -c 'nvidia-smi -L …'` **can run at all** on a `--read-only`,
   `--user 10001:10001` container with `NVIDIA_DRIVER_CAPABILITIES=utility`. If it cannot, the row
   answers `unknown`, which is the correct-but-useless outcome and would need a different probe.
2. **That the row FAILS in the real failure state** — the honest way to see it is the next time a
   `daemon-reload` happens, not by causing one.
3. **`cmd_unit`'s restart on a real systemd** — that `systemctl show -p ActiveState --value` answers
   `active` and the restart lands, and that an uninstalled box prints the `info` line and exits 0.
4. **The sibling scripts' `restart_ai_dashboard`** — on a box where `gpu-fan-control.sh install` is
   the thing that started this.
5. **§7.1** — whichever repair the owner rules for the browser harness.

---

## 9. Spec silences and owner questions

Recorded rather than chosen (invariant 7).

| # | Question | What stands today | Owner |
|---|---|---|---|
| **12a-Q1** | **What does the header SAY in the partial case?** §6.2's ruling of 2026-09-14 fixes the rule (*"if any `errors[]` entry exists, the header says so"*) and gives no literal; §6.2's own vocabulary covers only the total case (`no readings`) | `N sources unread` / `1 source unread`, counted per **source**, appended to every mode's text and **replacing** `all healthy`. The three alternatives and why they were rejected are in §3.2 and in `header-status.ts`'s module doc | **owner** |
| **12a-Q2** ⚠ | **Does the DOT move with the words?** The ruling governs what the header says and is silent on what it paints; leaving the dot alone puts a green ✓ three pixels from `2 sources unread` | It moves: a `normal` reduction with any failing source shows **no band**; `watch`/`alarm` untouched. 10b-S-F's panel rule applied to §9's aggregate | **owner** |
| **12a-Q3** ⚠ | **`hostname` and `proc-uptime` have NO message surface.** They land on §6.2's header, whose height is `--band-reserve: 102px`, a constant §6.1's arithmetic depends on. Their `errors[]` text reaches no pixel; only 12a's count does | Excluded from the sweep's first property, asserted in the negative so the list cannot silently grow. Options: a `title` on the truncated item, a header-level well inside the reserve, or accept the count as sufficient | **owner** |
| **12a-Q4** ⚠⚠ | **How should the browser measurement harness authenticate under §5.1?** Both scripts have been unable to log in since 2026-09-11 and nobody noticed for three days (§7.1) | Nothing. Candidates: (a) a `NODE_OPTIONS=--require` shim in the **harness only**, faking the one `readFileSync`/`statSync` of `/etc/ai-dashboard.env` — no production change, the same spirit as `installGpuFabrication`; (b) a path override in `lib/auth/secret-file.ts`, which is a new entrance into the module 11b hardened and which `11b`'s own rule 2 argues against. ⚠ Until one is taken, **§6.1's bound is unmeasurable on any change** | **owner**, then whoever owns §5.1 |
| **12a-Q5** ⚠ | **A `dbus` entry cannot say whether the bus REFUSED the connection or DROPPED us mid-handshake.** Two code paths in `collectUnitStates` write the identical `` `${socket}: ${reason}` `` | Unchanged — the handoff forbids choosing a fix before the cause is known, and §3.7 makes the text the collector's own. A second, distinguishable message is one line | **owner**, then whoever owns §3.7 |
| **12a-Q6** ⚠ | **An abandoned `connect` leaks its socket** (§6.6). Narrow — it needs `connect` to take ≈2 s — but it is the only mechanism here that could reach a per-user connection limit | Unfixed. The fix means deciding what `deadline` owes an abandoned operation that RESOLVED, which is a `lib/collectors/deadline.ts` contract change, not a one-liner | **owner**, then whoever owns O17 |
| **12a-Q7** | **The D-Bus reset's own cause is still open**, and the one experiment that would close it is a `daemon-reload` with a client-side trace — the action that revokes the live container's GPU access | §6 narrows it to *a drop at connection setup, silent in the journal*. Needs a maintenance window | **owner** |

Also unchanged and worth re-stating, because 12a's sweep measures around it: **`S-G-Q1`** — a panel
renders the **last** message per source, not every entry — so *"every takeover branch renders its
`errors[]`"* is true per source, which is the finest join §4 offers.
