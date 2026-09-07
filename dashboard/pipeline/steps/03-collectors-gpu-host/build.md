# Step 3 — GPU & host collectors · build phase

**Green: `pnpm verify` → exit 0, 807 tests, 13 files.** Was 597 across 7 files after step 2,
so step 3 adds **210 tests in 6 files**. `python3 pipeline/steps/03-collectors-gpu-host/regressions.py`
→ **exit 0, 51 mutations, every one bites.** Step 2's harness still exits 0 at 38.

Two things are reported and **not fixed**, per invariant 7 and the phase boundary — see §7.

---

## 1. What was built, and where

Everything is new and everything is under `dashboard/lib/collectors/`. **No file outside
that directory was created or modified.**

| File | Lines | What it is |
|---|---|---|
| `numbers.ts` | 141 | **Invariant 1 at parse time.** Strict text→number primitives. Pure |
| `result.ts` | 27 | `ParseResult<T>` — the seam between a parser and its wrapper |
| `nvidia-smi.ts` | 165 | §3.1 — the CSV parser, the field list, the argv. Pure |
| `proc.ts` | 482 | §3.2/§3.5 — `/proc/*`, hostname, kernel, operstate, `coretemp`. Pure |
| `deltas.ts` | 157 | §6.7 + O7 — `cpuPct` and the network rates. Pure |
| `io.ts` | 85 | `CollectorIo` + `nodeIo`. **The only file importing `node:*`** |
| `collect.ts` | 374 | The thin wrappers: `collectGpus`, `collectCpuTemp`, `collectHost` |
| `index.ts` | 60 | The barrel step 6 imports |
| `fixtures.ts` | 745 | Captured text from the box + the hand-built failure cases |
| `numbers.test.ts` · `nvidia-smi.test.ts` · `proc.test.ts` · `deltas.test.ts` · `collect.test.ts` · `io.test.ts` | 193 · 256 · 485 · 210 · 500 · 214 | the tests |

**Not built, deliberately:** `dell_smm` / channel 5 (step 4), `statvfs`, D-Bus, `/health`,
ufw, DKMS (step 5), the route and its 2 s cache (step 6). `Storage.root` / `Storage.home`
are step 5's; step 3 produces `Storage.net` only.

**No dependency was added** (invariant 6). Everything uses `node:fs/promises`,
`node:child_process` and `node:os`, which ship with Node 24.

---

## 2. The parser / IO split

The step's design constraint, stated as a rule the type system holds up:

```
                    pure, no IO, no /proc, no GPU, no root
   text  ──────────────────────────────────────────────────────►  ParseResult<T>
                 numbers.ts · nvidia-smi.ts · proc.ts · deltas.ts
                                      ▲
                                      │ hands bytes over
                    collect.ts ───────┘   catches every failure
                         │
                         └── CollectorIo ──► io.ts ──► node:fs, node:child_process, node:os
```

- **`numbers.ts`, `nvidia-smi.ts`, `proc.ts`, `deltas.ts` import nothing from `node:`.**
  They are functions of a string (or of two counter samples). Nothing in them throws, and
  `proc.test.ts` asserts that against six kinds of junk including the wrong file entirely.
- **`collect.ts` does no parsing.** Every function there is a `try`, a call into a parser,
  and the tagging of that parser's `problems` with a §3.7 `ErrorSource`.
- **`io.ts` is the only file that touches the world**, and it is injectable, so the
  wrappers are testable with a fake box (`collect.test.ts`) *and* against real files and a
  real subprocess (`io.test.ts`).

### Why `ParseResult<T>` carries `problems: string[]` and not `TelemetryError[]`

A parser does not know its own `ErrorSource` — `parsePackageTempC` serves `coretemp` today
and would serve any hwmon node — and only the wrapper knows *which path* it just failed to
read. Putting a §3.7 vocabulary value inside a pure parser would also put it somewhere no
test of the wrapper can see it drift.

### `io.test.ts` exists because a fake cannot catch a bug in `nodeIo`

`nodeIo` is what runs in the container, and every other test in the step replaces it. A
`readFile` missing its `'utf8'`, a `readdir` returning `Dirent`s, an `exec` that swallows
stderr, a `timeout` option dropped — all pass every fake and fail on the box. So
`io.test.ts` writes the captured fixtures into a temp directory laid out the way §2.2's
bind mounts present the host, stands a real executable in for `nvidia-smi`, and runs the
collectors through the real `nodeIo`. Regressions S45–S47 are the three that only that file
catches. Writes go to `os.tmpdir()` and nowhere else; invariant 2 concerns the server.

---

## 3. Every §3.1 and §3.2 field, mapped

### §3.1 GPUs — `parseNvidiaSmiCsv` / `collectGpus`

Query: `--query-gpu=index,name,pci.bus_id,temperature.gpu,power.draw,power.limit,memory.used,memory.total,utilization.gpu,clocks.sm,clocks_throttle_reasons.active --format=csv,noheader,nounits`

| Field | Column | Produced as | Test |
|---|---|---|---|
| `index` | 0, strict integer | `number`, the only non-null | `nvidia-smi.test.ts` "every column of GPU 0"; "a row whose index will not parse is an errors[] entry" |
| `name` | 1, raw text | `string \| null` | "every column of GPU 0" |
| `bus` | 2, raw text | `string \| null` | "bus is the full domain form the driver actually prints" |
| `tempC` | 3 | `celsius()` | "every column"; invariant-1 pair |
| `powerW` | 4 | `watts()` | ditto |
| `powerCapW` | 5 | `watts()` | ditto |
| `memUsedMiB` | 6 | `mib()` | ditto |
| `memTotalMiB` | 7 | `mib()` | ditto |
| `utilPct` | 8 | `percent()` | "utilPct 0 is a reading, not an absence" |
| `smClockMHz` | 9 | `mhz()` | invariant-1 pair |
| `throttleReasons` | 10, validated through `lib/throttle.ts`'s own `parseThrottleMask` | `throttleMask()` | "the throttle mask is carried raw and decodes"; "a mask that is not a mask is null, never 0" |

`gpus: null` vs `gpus: []` is decided in `collectGpus` and tested three ways in
`collect.test.ts` ("nvidia-smi absent is `gpus: null`", "it ran and printed nothing is
`gpus: []`", "null and [] are genuinely distinguishable at the call site").

### §3.2 Host — `collectHost`

| Field | Source | Parser | Test |
|---|---|---|---|
| `cpuPct` | `/proc/stat` delta | `parseProcStat` + `cpuPctBetween` | `deltas.test.ts` (11 cases); `collect.test.ts` "the second poll computes deltas" |
| `loadAvg` | `/proc/loadavg` | `parseLoadavg` | `proc.test.ts` "the first three fields"; "all-or-nothing" |
| `cpuTempC` | `coretemp` `Package id 0` | `parsePackageTempC` + `collectCpuTemp` | `proc.test.ts` "found by LABEL, not by index"; `collect.test.ts` "never falls back to dell_smm" |
| `memUsedGiB` / `memTotalGiB` | `/proc/meminfo` | `parseMeminfo` | "memUsed is MemTotal - MemAvailable, not MemTotal - MemFree" |
| `swapUsedGiB` / `swapTotalGiB` | `/proc/meminfo` | `parseMeminfo` | "swapUsed survives §6.6's 2 dp — 22356 kB must not round to 0.0" |
| `uptimeSec` | `/proc/uptime` | `parseUptime` | "floored, not rounded"; "a machine 0 seconds old reads 0" |
| `kernel` | `uname` (§3.2 permits `/proc/version` **or** `uname`) | `io.unameRelease()`, guarded | `collect.test.ts` "a blank uname release is null"; "a throwing uname leaves the kernel null" |
| `cpuModel` | `/proc/cpuinfo`, **raw** | `parseCpuinfo` | "cpuModel is carried RAW — the §3.2 trim is the formatter's job" |
| `cores` | distinct `physical id`+`core id` pairs | `parseCpuinfo` | "12 threads and 6 cores"; "cores counts distinct pairs, not `cpu cores`" (a 2-socket fixture where `cpu cores` says 2 and the answer is 4) |
| `threads` | `processor` count | `parseCpuinfo` | "12 threads and 6 cores" |
| `hostname` (top level, §4) | `/etc/hostname` | `parseHostname` | "an empty file is null, not the empty string" |

### §3.5 network half

| Field | Source | Parser | `ErrorSource` |
|---|---|---|---|
| `net.rxBytesPerSec` / `txBytesPerSec` | `/proc/net/dev` delta | `parseNetDev` + `netRatesBetween` | `proc-net-dev` |
| `net.link` | `/sys/class/net/eno1/operstate` | `parseOperstate` | **`net-operstate`** |

`collect.test.ts` pins the split in three tests, including one that removes both files and
asserts both names appear.

---

## 4. The rules this step was told it would break

### Invariant 1 / O6 — `Number('')` is `0`

`numbers.ts` is the whole defence, and `numbers.test.ts` opens by asserting the *premise*
(`Number('') === 0`) so the guards are not taken on faith. Every parser routes through
`parseIntegerStrict` / `parseDecimalStrict` / `parseCounter` / `parseText`, none of which
accept an empty, whitespace-only or absent cell. Alongside every one of those, the matching
**genuine zero** is asserted to survive: `utilPct 0`, `0 RPM`-class fan values are step 4's
but `0 °C`, `0` swap, `0.00 0.00 0.00` load, `0` uptime, `0` bytes and an all-zero
`/proc/stat` are all pinned here.

The paired fixtures `NVIDIA_SMI_NA_COLUMNS` / `NVIDIA_SMI_ALL_ZERO` are this step's
`nothingReadable` / `everythingZero`: identical shape, one all-`null`, one none-`null`.

### O7 — clamp `cpuPct` and the network rates, or send `null`

**`null` was chosen, and it is not clamped.** Both are permitted. The argument, recorded at
`deltas.ts`'s module doc and pinned by the test "null, not clamped to 0 — clamping would
forge an idle CPU out of a bad read":

> Clamping produces `0.0 %` / `0 B/s`, and invariant 1 says those are *readings* — an idle
> CPU and a silent link. A backwards counter is not a reading; it is evidence that
> something wrapped, was reset, or is being read wrongly, and §6.6 has a rendering for
> exactly that. Clamping converts a collector fault into a plausible number.

Rejected, each with a test: a negative busy delta, a negative total delta, a total that did
not advance (`0/0` is `NaN`, and `percent(NaN)` type-checks), a result outside 0–100, a
wrapped network counter, a zero-length interval, and a backwards clock.

### §6.7 — the first sample is `null`, never `0`

`advanceDeltas(null, sample)` returns `NO_DELTAS`, three nulls. Tested directly, tested
through `collectHost` on a first poll, and tested as a rendering
(`formatPercent(null) === '—'`). Regressions S30 and S31 are the two "return 0 instead"
mutations.

### §3.2 — never `os.hostname()`

`/etc/hostname` is read through `paths.etcHostname`, and `os.hostname()` appears nowhere in
`lib/collectors/`. `os.release()` **is** used for `kernel`, and the distinction is argued at
`CollectorIo.unameRelease`: `uname()`'s *nodename* is UTS-namespaced, which is what makes
`os.hostname()` wrong inside the container; its *release* is not — it names the one kernel
every namespace on the box runs. §3.2 permits `uname` explicitly. See U5 for the second
reason.

### Invariant 5 — a partial snapshot, never a throw

Every read in `collect.ts` is wrapped, including the parse call and `unameRelease()`.
Tested with: each of nine paths removed one at a time; every path removed at once; an IO
layer that throws *synchronously* rather than rejecting; and a `uname` that throws.
Regressions S39, S50, S51.

### §3.7 — the closed vocabularies, spelled exactly

`ErrorSource` is used at nine call sites and asserted by name in "every source that can
fail uses its own §3.7 name". `parseOperstate` validates against the seven `LinkState`
values and returns `null` for anything else rather than passing a bare string through
(S25). `throttleReasons` is validated through `lib/throttle.ts` rather than a second regex.

---

## 5. Fixtures — where each one came from

`lib/collectors/fixtures.ts`. **Distinct from `lib/fixtures.ts`**, which holds canonical
snapshots; HANDOVER §6 asked step 3 to extend the set "with real `nvidia-smi` and `/proc`
**text**, not with more snapshots".

### Captured from `ai-server` over SSH, 2026-09-06 — read-only commands only

`cat` on the §2.2 paths and one `nvidia-smi --query-gpu`. Nothing was reformatted.

| Constant | Command | Why it had to be real |
|---|---|---|
| `CAPTURED_PROC_STAT` | `cat /proc/stat` | the two-space gap after `cpu`, the twelve `cpuN` lines that start with the same three characters, and ~2 KB of `intr` noise after them |
| `CAPTURED_PROC_MEMINFO` | `cat /proc/meminfo` | the real 64197644 kB / 8388604 kB, and a resting swap of 22356 kB — the value §6.6's 2 dp exists for |
| `CAPTURED_PROC_LOADAVG` | `cat /proc/loadavg` | the trailing `1/304 724578` fields a naive split would pick up |
| `CAPTURED_PROC_UPTIME` | `cat /proc/uptime` | the second (idle) field, and a fractional first field |
| `CAPTURED_PROC_NET_DEV` | `cat /proc/net/dev` | the fixed-width right-aligned name column — the trap the parser is written against |
| `CAPTURED_PROC_CPUINFO` | `cat /proc/cpuinfo` | **all twelve blocks, flags included.** The counts are the point: a truncated fixture would assert 6/12 against a file that cannot produce them |
| `CAPTURED_PROC_VERSION` | `cat /proc/version` | evidence of the format, for `parseKernelRelease` |
| `CAPTURED_ETC_HOSTNAME` | `cat /etc/hostname` | |
| `CAPTURED_OPERSTATE` | `cat /sys/class/net/eno1/operstate` | |
| `CAPTURED_NVIDIA_SMI` | the §3.1 query, both V100s idle | see below |
| `CAPTURED_CORETEMP` | every `temp*_label` / `temp*_input` under the `coretemp` hwmon | proves the package is found by label, and that `coretemp` is `hwmon2` — between two `nvme` nodes and `dell_smm` |

**Three things the real `nvidia-smi` output disagrees with §3.1 about**, all the driver's
doing (NVIDIA-SMI 580.173.02), all carried raw rather than "corrected":

- `pci.bus_id` is `00000000:97:00.0`, not §3.1's `97:00.0` → U4.
- `name` is `Tesla PG500-216`, the board id, not `Tesla V100-PCIE-32GB`. §9 says the card's
  identity is read at runtime and never assumed; this is why.
- the query key `clocks_throttle_reasons.active` still works, but the driver answers under
  the newer header `clocks_event_reasons.active`. Invisible with `noheader`; recorded so a
  future rename is recognised rather than debugged.

Also measured on the box and used to shape the parser: `[N/A]` is the literal placeholder
(`nvidia-smi --query-gpu=fan.speed` on a passively-cooled V100), and an invalid field name
exits **2** with a message on stderr.

### Hand-built, because a healthy box cannot produce them

Each is the captured text with **one named mutation**, so it differs from reality in
exactly the way its name says: `EMPTY`, `NVIDIA_SMI_ONE_CARD` (a card that disappears
mid-session — GPU 0's row is byte-identical), `NVIDIA_SMI_NA_COLUMNS`,
`NVIDIA_SMI_ALL_ZERO`, `NVIDIA_SMI_TRUNCATED_ROW`, `NVIDIA_SMI_SHORT_ROW`,
`NVIDIA_SMI_BAD_INDEX`, `NVIDIA_SMI_WITH_BANNER`, `PROC_STAT_TRUNCATED`,
`PROC_STAT_CORRUPT`, `PROC_STAT_NO_AGGREGATE`, `PROC_MEMINFO_NO_MEMAVAILABLE`,
`PROC_MEMINFO_BAD_VALUES`, `PROC_NET_DEV_NO_ENO1`, `PROC_NET_DEV_JAMMED`,
`PROC_CPUINFO_NO_TOPOLOGY`, `CORETEMP_EMPTY_INPUT`, `CORETEMP_NO_PACKAGE`.

**`nvidia-smi` absent is not a text fixture** — it is a process failure, so it lives in the
fake `CollectorIo` (`runFails: 'spawn nvidia-smi ENOENT'`) and, in `io.test.ts`, as a path
that genuinely does not exist.

---

## 6. Deliberate-regression evidence

`pipeline/steps/03-collectors-gpu-host/regressions.py`, modelled on step 2's.
**51 mutations, exit 0, every one bites.** Each replaces one exact string with the *wrong
implementation someone would plausibly write*, runs the affected check, and restores the
file.

Coverage by area: invariant 1 at parse time (S1–S6), §3.1 (S7–S12), §3.2 `/proc` and
`coretemp` (S13–S29), §6.7/O7 deltas (S30–S36), invariant 5 and §3.7's `ErrorSource`
(S37–S44, S50–S51), the real `nodeIo` (S45–S47), type-level (S48–S49).

### Five did not bite on the first run, and all five were real

This is the step-2 lesson landing exactly as warned — a test can look like coverage and not
be.

| # | Why it did not bite | What was done |
|---|---|---|
| **S40** one failed read blanks the whole host object | Every per-source test removed one file and checked *its own* figures went null. **None checked the complement**, which is where cross-contamination hides | Added `collect.test.ts` "⚠ a failure in ONE source leaves every OTHER source's figures intact" — nine paths × nine representative fields |
| **S46** `nodeIo.run` drops stderr | `execFile`'s own `error.message` **embeds** stderr, so `toThrow('No devices were found')` passed on both implementations | Rewritten to assert the message **equals** the stderr text and does not contain `Command failed` |
| **S14** guest/guest_nice double-counted | The mutation widened `CPU_BUSY_FIELDS` but not `CPU_FIELD_ORDER`, so the extra names were never read — the mutation was inert, not the test | Mutation re-aimed to widen both. The test (a fixture with guest=500, guest_nice=500) was already correct |
| **S34** `0/0` | Guarded **twice**: by `total === 0` and by the finiteness check. Breaking one leaves the other | Harness extended to apply a *list* of edits; both guards now broken together |
| **S35** backwards clock | Guarded twice: by `elapsedMs <= 0` and by `r >= 0` | Same |

`total === 0` and `elapsedMs <= 0` are therefore **redundant** with the finiteness and
sign checks downstream. They are kept because they state the intent at the point the
decision is made, and the regressions now prove the *hazard* is covered rather than
implying each line is load-bearing.

Running the harness also re-ran step 2's: `python3 pipeline/steps/02-format-severity/regressions.py`
→ **exit 0, 38 mutations**, unaffected.

---

## 7. Reported and not fixed

### ⚠ F1 — §3.2's uptime forms: the spec contradicts itself, and the code implements the smaller half

SPEC.md §3.2 (line 286): *"**Three forms**, so a freshly rebooted box is not shown as
`up 0 d 00:14`: `up 2 d 02:01` at a day or more, `up 02:01` between an hour and a day,
`up 14 min` below an hour, **and `up <1 min` below a minute**."*

That sentence says three and lists **four**. `lib/format.ts`'s `formatUptime` implements
three, and `lib/format.test.ts` pins the consequence as correct in two places — the law
table at line ~196 (`formatUptime(seconds(0))` → `'up 0 min'`) and a case named "under a
minute is still a reading" (`seconds(11)` → `'up 0 min'`).

Measured: `formatUptime(seconds(59))` → `'up 0 min'`, where §3.2's fourth clause says
`up <1 min`. This is step 2's file and step 2's test, so **it was not touched.** It was
found because step 3's `/proc/uptime` fixture is a real one and the obvious assertion is
the rendering. `proc.test.ts`'s uptime test now asserts only the floor, with the finding
named at the call site. This is very likely step 2's open gap **S2** — "§3.2's uptime forms
do not cover below one minute" — which was closed *in the spec* after step 2's phases ran
and never propagated to the code.

**Needs a decision from the owner before it is fixed**, because the spec's own prose is
inconsistent: either "Three forms" is stale and `formatUptime` gains a fourth branch, or
the `up <1 min` clause is.

### ⚠ F2 — the `@/` path alias does not resolve under Vitest

`tsconfig.json` maps `@/*` → `./*` and HANDOVER §6 states `@/` as the convention for
cross-directory imports. **`vitest.config.mts` has no `resolve.alias`**, so `import … from
'@/lib/types'` type-checks and then fails at run time with
`Error: Cannot find package '@/lib/types'`. It has not bitten until now only because steps
1 and 2 lived entirely inside `lib/` and used relative imports.

Step 3 hit it immediately and used relative imports (`../types`, `../throttle`) — defensible,
since `lib/collectors/` is inside `lib/`, and the minimal change. **`vitest.config.mts` is
step 1's file and was not touched.**

**This blocks step 6 (`app/api/telemetry/`) and step 9 (`components/`)**, which cannot reach
`lib/` relatively without `../../`. Whoever owns that step must add:

```ts
resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
```

or the equivalent, to `vitest.config.mts`.

### Underspecified — recorded, not invented around

Each is implemented conservatively and documented at its call site.

| # | Gap | What was done |
|---|---|---|
| **U1** | §3.2 says only "`/proc/stat` delta between polls. Aggregate" — it does not say **which fields count as idle**, nor that `guest`/`guest_nice` are already inside `user`/`nice` | `idle + iowait` as idle; `guest`/`guest_nice` excluded. This is `procps`' accounting, so a figure here can be checked against `top`/`htop`/`mpstat` — which §6.6 states as the goal for every unit on screen. Documented at `CPU_IDLE_FIELDS` |
| **U2** | **No document gives `nvidia-smi` a time limit.** It needs one: the call blocks indefinitely when the driver is wedged and §4 samples per request, so one hung call hangs every tab | `NVIDIA_SMI_TIMEOUT_MS = 4000` — under §6.7's 5 s default cadence, well above the ~250 ms the call takes here. **An invented number.** A test asserts only the relation to the cadence, not the value |
| **U3** | Which `nvidia-smi` **exit codes** mean "ran and found nothing" (`[]`) vs "could not be performed" (`null`). With no cards it prints `No devices were found` and exits **6**, which is arguably `[]` | Any non-zero exit → `null` + an error carrying the driver's own text. Could not be measured on a box with two working cards. Both render as "no GPUs enumerated" (§3.1), so the blast radius is the `errors[]` entry alone |
| **U4** | §3.1's `bus` example is `97:00.0`; the driver prints `00000000:97:00.0`. No trimming rule is stated (unlike `cpuModel`, where §3.2 says "trimmed … for display") | Carried raw. Trimming would invent a rule; §9 says the id is read at runtime |
| **U5** | §3.7's `ErrorSource` is closed at eighteen names and **has no member for `/proc/version`**, so a failed read of it could not be reported without inventing one | `kernel` comes from `uname` (`os.release()`), which §3.2 permits and which cannot fail. `parseKernelRelease` exists and is tested against the captured file should a later step want the file instead |
| **U6** | §3.2 names `Package id 0` only. A multi-socket board also has `Package id 1` | Only `Package id 0` is read. Single-socket here (W-2135), so nothing is lost today |
| **U7** | No **range** is stated for any `nvidia-smi` numeric — a `temperature.gpu` of `-500` or a `utilization.gpu` of `300` would pass | Only finiteness is enforced. Inventing ranges would risk discarding a real reading; §6.3's bands are the place a wrong value becomes visible |
| **U8** | `Seconds` is documented as whole seconds; §3.2 does not say floor or round | Floored, so the figure never claims a minute that has not elapsed. Matches `formatUptime`'s own stated policy |
| **U9** | O7 offers a **choice** — clamp or `null` | `null`. Argued in §4 above and pinned by a test named for the choice |

### Not a gap, recorded to save the next reader the lookup

- `lib/collectors/fixtures.ts` is 745 lines mostly because `/proc/cpuinfo` is kept whole.
  That is deliberate (§5) and it is test data — nothing under `app/` imports it, and
  `pnpm build` (exit 0) does not bundle it.
- `formatBytesPerSecond(0)` renders `0 KB/s`, not `0 B/s`. Step 2's scaling choice; the
  delta tests assert the numeral-plus-unit, not the unit.

---

## 8. The evidence, verbatim

```
$ export PATH="$HOME/.local/bin:$PATH"
$ cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
$ pnpm verify
$ tsc --noEmit && vitest run
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard


 Test Files  13 passed (13)
      Tests  807 passed (807)
Type Errors  no errors
   Start at  18:25:03
   Duration  725ms (transform 50%, tests 26%, import 14%, typecheck 9%, worker 2%)

verify exit=0
```

```
$ python3 pipeline/steps/03-collectors-gpu-host/regressions.py
…
All 51 regressions failed their check, as they must.
exit=0

$ python3 pipeline/steps/02-format-severity/regressions.py
…
All 38 regressions failed their check, as they must.
exit=0

$ pnpm build
build exit=0
```

`git status --short` is unchanged from the state HANDOVER §9 records — ` M .gitignore`,
`?? dashboard/`. **No commit was made** (PLAN.md; commits only when asked).
