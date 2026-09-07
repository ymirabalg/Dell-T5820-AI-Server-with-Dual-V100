# Step 3 — GPU & host collectors · adversarial phase

**Baseline re-established, not assumed.** `pnpm verify` → **exit 0, 807 tests, 13 files**.
`regressions.py` (step 3) → **exit 0, 51 mutations**. Step 2's → **exit 0, 38**. All three
re-run at the end of the phase, unchanged.

**No source file was edited.** Every experiment was a mutate-run-restore cycle against a
backup taken first, plus four scratch `*.test.ts` files. All are gone; §8 lists exactly
what was touched and proves the restoration.

Eleven findings. Two are high severity, and one of those is the guard the build invented.

---

## 1. Findings confirmed by execution

### ⚠ A1 (HIGH) — the `nvidia-smi` timeout does not bound a hang. It is inert in the exact case U2 invented it for.

**Claim it breaks:** build.md U2 — *"`nvidia-smi` blocks indefinitely when the driver is
wedged, and §4 samples per request, so one hung call would hang every connected tab"* —
and `io.ts`'s own doc, *"It needs one"*. §4: "Sampling is per-request".

**What was measured.** `nodeIo.run()` against a child that does not die on `SIGTERM`:

```
T1  script: #!/bin/sh  trap "" TERM  sleep 6
    nodeIo.run(script, [], 300)   ->  RESOLVED after 6295 ms      (timeout was 300 ms)
T1b control: #!/bin/sh  sleep 6
    nodeIo.run(script, [], 300)   ->  rejected after 311 ms
```

`execFile`'s `timeout` option does not abandon the call; it sets a timer that fires
`child.kill('SIGTERM')`, and the callback still runs only on the child's `close`. A child
that ignores the signal is waited on to completion — and because it then exits 0, the
promise **resolves**, so there is not even an `errors[]` entry: the poll simply took 6.3 s.

**Why this is the motivating case and not a curiosity.** A wedged NVIDIA driver leaves
`nvidia-smi` in uninterruptible sleep inside an `ioctl` on `/dev/nvidiactl`. No signal —
`SIGKILL` included — is delivered until that syscall returns. So the one failure U2 names
is precisely the one the guard cannot bound. With §4's per-request sampling and no upper
bound on the promise, `GET /api/telemetry` inherits an unbounded latency, and §6.7's
backoff never engages because nothing failed.

**Why the suite did not catch it — a lying test.** `io.test.ts` "run enforces its timeout"
uses `/bin/sleep 5`, a child that *honours* `SIGTERM`; that is the one input class where
"kill the child" and "stop waiting" are indistinguishable. `collect.test.ts` "a timeout is
reported with the driver's own text" uses the **fake** io's `runFails` string and never
exercises a timeout at all. Regression **S47** deletes the `timeout:` option, which
`/bin/sleep 5` does catch — so the harness proves the option is *present*, never that it
*bounds* anything.

Bounding it needs a deadline that settles the promise independently of the child (and a
`SIGKILL` follow-up as a courtesy, not as the mechanism). Not my call to make.

---

### ⚠ A2 (HIGH) — the CSV column guard is only tested in the "too few columns" direction. Weakening it the other way survives all 807 tests *and* all 51 mutations, and fabricates a thermal-throttle alarm.

**Claim it breaks:** `nvidia-smi.ts`'s own stated defence — *"Guessing which columns
survived would silently shift every reading one place left"* — and build.md §6's claim that
the harness covers §3.1 at S7–S12.

**The mutation, which is the wrong implementation someone would plausibly write:**

```ts
- if (cells.length !== NVIDIA_SMI_FIELDS.length) {
+ if (cells.length < NVIDIA_SMI_FIELDS.length) {
```

Result: `pnpm vitest run lib/collectors lib/format.test.ts lib/contract.test.ts` →
**8 files passed, 460 tests passed.** Nothing bites.

**Concrete failure scenario.** Input — one row, twelve cells, because one value carried a
thousands separator or a name carried a comma:

```
0, Tesla PG500-216, 00000000:17:00.0, 38, 39.25, 250.00, 26,456, 32768, 0, 1260, 0x0
```

Output, measured under the mutation:

```json
{"index":0,"tempC":38,"powerW":39.25,"powerCapW":250,
 "memUsedMiB":26,"memTotalMiB":456,"utilPct":32768,"smClockMHz":0,
 "throttleReasons":"1260"}   problems: []
```

and `decodeThrottleMask('1260')` → severity **`alarm`**, reasons
`0x20 sw thermal slowdown`, `0x40 hw thermal slowdown`, `0x200 unknown`, `0x1000 unknown`.

So a single extra column produces **26 / 456 MiB of VRAM, 32,768 % utilisation, and a
sticky §6.4 banner claiming both thermal slowdowns on a card at 38 °C** — with an empty
`problems` array, i.e. no `errors[]` entry to contradict it.

**Why the existing tests cannot see it.** Both column-count tests use rows that are
*shorter* than eleven — `NVIDIA_SMI_TRUNCATED_ROW` (7 columns) and `NVIDIA_SMI_SHORT_ROW`
(4). Regression **S8** replaces the whole condition with `if (false)`, which those short
rows catch. There is no fixture anywhere in the step with **more** than eleven columns, and
`>11` is the reachable direction: a driver adding a query field, a GPU name containing a
comma, or any cell `nvidia-smi` chooses to quote. The shipped code is correct; the *test*
for it is not.

`parseNvidiaSmiCsv` today handles all three of those inputs correctly (I checked: a
12-column row, a `"Tesla V100, PCIE"` quoted name, and `26,456` all become one
`problems` entry and no GPU). The finding is the missing guard on the guard.

---

### A3 (MEDIUM) — a rejected delta renders `—` with **no `errors[]` entry**, which §6.5 requires.

**Claim it breaks:** §6.5's table row — *"A single sensor read fails | That figure shows
`—`, **its `errors` entry is available**, the rest of the panel renders"* — and HANDOVER O7,
which chose `null` over clamping specifically so that a backwards counter would not be
mistaken for a reading.

**Measured through `collectHost`, two polls, counters going backwards (a reboot, an
interface reset, a 32-bit wrap):**

```
D3  poll 1: cpu busy/total 500/1000, rx/tx 9000000     nowMs 1000
    poll 2: cpu busy/total   1/  10, rx/tx       5     nowMs 6000
    -> host.cpuPct = null, net.rxBytesPerSec = null, net.txBytesPerSec = null
    -> errors = []              (only the unrelated coretemp entry in the fixture)
    -> renders: "—" and "—"
```

The UI is now told three figures are unreadable and given no reason, and it cannot tell
this apart from §6.7's first sample, which is the *expected* `—`. O7's rejected alternative
(clamping) was rejected because it "would convert a collector fault into a plausible
number"; the chosen alternative converts it into an **invisible** one. `deltas.ts` returns
bare `null`s and has no `problems` channel at all, so `collect.ts` has nothing to tag.

**A second shape of the same hole, also measured:**

```
D4  poll 1: /proc/stat ok        -> cpuPct null (first sample, correct)
    poll 2: /proc/stat missing   -> cpuPct null, errors ["proc-stat", "coretemp"]
    poll 3: /proc/stat ok again  -> cpuPct null, errors ["coretemp"]   <-- no explanation
```

One transient `/proc/stat` failure blanks `cpuPct` for **two** consecutive polls, and on the
second of them there is no error entry at all, because nothing failed *that* poll. Inherent
to delta semantics; the silence is not.

---

### A4 (MEDIUM) — `gpus: []` has no producer on this box. The measured "found nothing" state maps to `null`, and `[]` is instead produced by "found cards, parsed none".

**Claim it breaks:** build.md U3's *"could not be measured on a box with two working
cards"*, and `lib/types.ts`'s defence of the distinction — `[]` means "the enumeration ran
and found nothing", a "real, previously-observed state of this box".

**Measured on `ai-server`, read-only:**

```
$ nvidia-smi --query-gpu=index,name --format=csv,noheader -i 5
No devices were found
EXIT=6

$ nvidia-smi --query-gpu=index,name,pci.bus_id --format=csv,noheader,nounits -i 0,5
0, Tesla PG500-216, 00000000:17:00.0
EXIT=0
```

So the "no devices" path **is** measurable in one read-only command — `-i <nonexistent>`
reproduces the message and exit code exactly. U3's stated blocker does not hold.

`collectGpus` maps any non-zero exit to `null`. Confirmed end to end with a stand-in
binary: exit 6 + `No devices were found` → `{"gpus":null,"errors":[{"source":"nvidia-smi",
"message":"No devices were found"}]}`. The only way to reach `[]` is **exit 0 with empty
stdout**, which `nvidia-smi` does not do — with no cards it exits 6. Meanwhile a driver
that answers a *different* field list gives `[]` plus N problems (measured: a banner on
stdout with exit 0 → `{"gpus":[],"errors":[…"expected 11 columns, got 1"…]}`), i.e. `[]`
now means the opposite of what the contract says it means.

This does not change what the UI paints (§3.1 renders both as "no GPUs enumerated"), but it
does mean the `null` / `[]` split that steps 1 and 2 spent a decision on is, as
implemented, unreachable in one direction and mislabelled in the other. Worth a ruling
rather than a comment.

---

### A5 (MEDIUM-LOW) — an unreadable `coretemp` hwmon node is reported as an **absent** one.

**Claim it breaks:** §6.5 ("match an error to the figure it explains") and the principle
§3.7 states for `pwm5Present` — "the check could not be performed" is not the same fact as
"the thing is not there". §2.2: **the container runs as a non-root user**, so `EACCES` under
`/sys` is the plausible cause, not a hypothetical.

**Measured.** A directory `hwmon0/` containing `name` = `coretemp`, chmod `0o000`:

```
collectCpuTemp -> { value: null,
  errors: [{ source: 'coretemp',
             message: 'no hwmon named `coretemp` under <root>' }] }
```

`collect.ts` catches the `name` read and `continue`s ("not every hwmon node has a readable
`name`; it is simply not this one") — which is right for a node that is not coretemp and
wrong for the one that is. The reading is `null` either way, so no false number reaches the
UI; the *explanation* is false, and §6.5's whole purpose is the explanation.

---

### A6 (LOW) — the `errors[]` message for a signal-killed process is an argv dump that does not mention the signal.

**Measured**, stand-in that `kill -SEGV`s itself:

```
{"source":"nvidia-smi","message":"Command failed: /var/.../crash --query-gpu=index,name,
pci.bus_id,temperature.gpu,power.draw,power.limit,memory.used,memory.total,
utilization.gpu,clocks.sm,clocks_throttle_reasons.active --format=csv,noheader,nounits\n"}
```

`nodeIo.run` uses `stderr.trim() || error.message`, and a crash produces empty stderr, so
the fallback is `execFile`'s message — 230 characters of argv, no `signal`, no `code`. The
comment above that line explains why stderr is preferred; the fallback path was not
considered. §6.5 puts this string in front of a human. `error.signal` / `error.code` are on
the object and unused.

---

### A7 (LOW) — U7's stated mitigation is false: most collected figures have no §6.3 band, and the ones that do band a garbage value `normal`.

build.md U7: *"§6.3's bands are the place a wrong value becomes visible."* Measured:

```
severityGpuTemp(celsius(-500))  ->  'normal'      formatCelsius(-500) -> "-500 °C"
severityCpuTemp(celsius(-40))   ->  'normal'
formatPercent(percent(300))     ->  "300.0 %"
```

and §6.3 has **no row at all** for `powerW`, `smClockMHz`, `utilPct`, `cpuPct`, `loadAvg`,
`uptimeSec` or the network rates. So an out-of-range `nvidia-smi` numeric is neither
rejected, nor banded, nor errored — it renders as a confident measurement and §9's dot
cannot see it (HANDOVER O12 is the rule that says so).

Related asymmetry worth noting while U7 is open: **`cpuPct` is range-checked to 0–100
(`deltas.ts`) and `utilPct` is not**, though both are `Percent` and both come from step 3.
`0, …, -5, …` in the `utilization.gpu` column yields `percent(-5)` → `-5.0 %`, which is the
rendering O7 exists to prevent. Deciding this is a spec question (U7 stays open either
way); the inconsistency between two fields of the same brand in the same step is not.

---

### A8 (LOW) — `/proc/net/dev`'s 16-column guard has the same untested direction as A2.

```ts
- if (cols.length !== NET_COLUMNS)
+ if (cols.length < NET_COLUMNS)
```
→ **460 tests passed.** No fixture has more than sixteen columns. Same class as A2, far
smaller blast radius (the kernel's format is fixed at 16), listed for completeness because
the fix is the same one-line fixture.

---

### A9 (LOW) — a parse-failure message names a hard-coded `/proc/...` path, not the path that was read.

`CollectorPaths` is injectable and §2.2's mounts are step 11's to change, but every parser
writes its own literal path into `problems`. Measured with redirected paths:

```
{"source":"proc-loadavg","message":"/proc/loadavg: could not read all three averages"}
```
— while the file actually read was `<tmp>/stat`. Read *failures* are prefixed with the real
path by `readAndParse`; parse failures are not. Harmless today (production uses
`DEFAULT_PATHS`); it becomes a wrong error message the moment step 11 mounts `/host/proc`.

---

### A10 (LOW) — `pnpm verify` reported a type error on a byte-identical tree, and survived `pnpm build`. **Observed once; I could not reproduce it.**

After a mutate-run-restore cycle, `pnpm verify` failed with

```
lib/collectors/collect.ts(346,7): error TS2322: Type 'number | null' is not assignable to type 'GiB | null'.
```

on a tree where every one of the 51 regression anchors was verified present (I scripted the
check) and every mutated file diffed clean against its pre-mutation backup. That diagnostic
belongs to regression **S49**, which mutates `MemInfo.memUsedGiB` in `proc.ts` — a file that
was, at that moment, pristine. `pnpm build` did not clear it. **Deleting
`tsconfig.tsbuildinfo` did**, immediately: 807 tests, exit 0.

A deliberate replay — green → apply S49 → `tsc` (fails) → restore → `tsc` — came back
**exit 0**, so the incremental cache does normally invalidate. I cannot name the trigger,
and the difference may be that the failing `tsc` run in the original sequence came from
Vitest's `typecheck` block rather than the standalone compiler.

Recording it because HANDOVER §1 is entirely about "green means exit 0" and this is a new
member of that family: with `"incremental": true` and a harness whose whole method is
mutate-and-restore, `tsconfig.tsbuildinfo` can carry a **false red** across a restore. The
inverse — a stale *green* over a genuinely broken file — is the one that would matter, and I
have no evidence of it. Recovery is `rm tsconfig.tsbuildinfo`. After the final regressions
run I checked `pnpm typecheck` explicitly: exit 0.

---

### A11 (INFO) — build.md §5 misstates the throttle-field situation.

build.md §5 says the query key "still works, but the driver answers under the newer header
`clocks_event_reasons.active`", filed so "a future rename is recognised". On driver
580.173.02 both `clocks_throttle_reasons.active` and `clocks_event_reasons.active` work and
**return identical values** — it is an accepted alias, not a pending rename. Left as-is,
the note invites a later step to "fix" a field name that is correct. (Not re-litigated: the
measurement was given to me as fact and matches §3.1's own naming.)

---

## 2. The build's two findings — both confirmed, one refined

### F1 — confirmed, both halves.

- SPEC.md §3.2 line 286 says **"Three forms"** and then lists **four**: `up 2 d 02:01`,
  `up 02:01`, `up 14 min`, "**and `up <1 min` below a minute**".
- `formatUptime` implements three. Measured: `formatUptime(seconds(59))` → **`up 0 min`**;
  `formatUptime(seconds(0))` → `up 0 min`.
- Step 2 pins the three-form behaviour in **two** places, as claimed:
  `lib/format.test.ts:197` (the law table, `formatUptime(seconds(0))` → `'up 0 min'`) and
  `lib/format.test.ts:667` (`['under a minute is still a reading', seconds(11), 'up 0 min']`).

The build is right that this needs an owner's ruling and right not to have touched step 2's
file. Note the collision if `up <1 min` wins: `formatUptime(seconds(0))` currently renders
`up 0 min` as a *law-table* case for "zero renders as the numeral with its unit" (§6.6), so
the fourth branch changes a §6.6 law example, not just a §3.2 form. Whoever rules should
rule on both lines.

### F2 — confirmed, and narrower than stated.

```
import { celsius } from '@/lib/types';
→ Error: Cannot find package '@/lib/types' imported from …/zz-adv-alias.test.ts
  Test Files 1 failed (1) · Tests no tests · EXIT=1
```

Confirmed: `vitest.config.mts` has no `resolve.alias`, so `@/` does not resolve at run time.

**Refinement the review should have.** I put `import { celsius } from '@/lib/types'` in a
real `app/zz-adv/page.tsx` and ran `pnpm build`: **exit 0**, route emitted. Next resolves
`paths` from `tsconfig.json` itself. So F2 blocks step 6's and step 9's **test files**, not
their product code — and it blocks them *loudly* (exit 1, a named unresolved import), not in
the silent "lost from the count" way HANDOVER §1 warns about. That is a smaller, better-behaved
problem than "blocks steps 6 and 9", and it is still real: `pnpm verify` is the gate, and any
step-6/9 test that follows HANDOVER §6's stated import convention goes red until
`resolve.alias` is added. The one-line fix the build proposes is correct.

---

## 3. The nine underspecified items, adjudicated

| # | Verdict | Reasoning, with the section |
|---|---|---|
| **U1** idle fields for `cpuPct` | **Genuine gap** | §3.2 gives one line — "`/proc/stat` delta between polls. Aggregate" — and no formula. §6.6's "any figure on screen can be checked against the command that produced it" makes `procps` accounting the right resolution, and excluding `guest`/`guest_nice` is factually correct (the kernel already counts them inside `user`/`nice`). The captured `/proc/stat` has ten fields with both guests at 0, so the choice is untestable here from data alone. Implemented well; still a gap the spec should close. |
| **U2** no `nvidia-smi` time limit | **Genuine gap, and the mitigation does not work** — see **A1** | No document gives one, correctly reported. The invented 4000 ms is reachable in the sense that it is the default `collectGpus` passes, but it does not bound the failure it was invented for. |
| **U3** which exit codes mean `[]` | **Genuine gap; the stated blocker is not real** — see **A4** | §3.1 groups "missing or returning nothing" without mapping exit codes. But `nvidia-smi -i 5` reproduces exit 6 / `No devices were found` on this box in one read-only command, so "could not be measured" is wrong, and the measurement argues the opposite mapping. |
| **U4** `bus` carried raw | **Not a gap** — the spec answers it | §3.1 writes "e.g. `97:00.0`", an example, not a format. §6.6's governing rule ("shown in the unit its own source reports, so any figure can be checked against the command that produced it") and §9's "read at runtime, never assumed" both mandate raw. Carrying `00000000:97:00.0` is compliance, not a judgement call. Fine to drop from the open list. |
| **U5** no `ErrorSource` for `/proc/version` | **Not a gap** | §3.2 offers two sources — "`/proc/version` or `uname`" — and exactly one of them has an error vocabulary in §3.7. Choosing that one is following the spec, not filling a hole. The `os.release()`-vs-`os.hostname()` argument in `io.ts` is correct (UTS namespaces `nodename`, not `release`), and `kernel` feeds §3.6's DKMS check, which compares against `uname -r` anyway. Keeping `parseKernelRelease` tested-but-unused is the right hedge. |
| **U6** only `Package id 0` | **Not a gap** | §3.2 names the sensor exactly: "`coretemp` hwmon, `Package id 0`". A second socket would be a spec change, not an ambiguity. Verified the implementation is not accidentally index-dependent: with `Package id 1` at `temp1` and `Package id 0` at `temp2`, `parsePackageTempC` returns **31**, not 99. |
| **U7** no range on `nvidia-smi` numerics | **Genuine gap; the rationale for deferring is wrong** — see **A7** | The gap is real (§3.1 gives no ranges). But "§6.3's bands are where a wrong value becomes visible" is false for six of the eight numeric fields, and `severityGpuTemp(-500)` is `normal`. Also inconsistent with `cpuPct`, which *is* range-checked. Needs a ruling, and the ruling should cover both `Percent` producers. |
| **U8** floor vs round for uptime | **Not a gap** | §3.2 is silent, but step 2's `formatUptime` already fixed the policy in its own doc ("Truncating rather than rounding, so the figure never claims a minute that has not elapsed"), and `parseUptime` matching it makes the double-floor a no-op. Verified the choice is load-bearing and tested: `Math.floor` → `Math.round` fails `proc.test.ts` "floored, not rounded — 59.7 s is 59 s". |
| **U9** clamp or `null` | **Not a spec gap at all** | HANDOVER O7 offers an explicit choice; taking one is a decision, not a gap, and it belongs in build.md's decisions list rather than its underspecified table. The choice itself is right (clamping forges `0.0 %`); its consequence is **A3**. |

Net: **U1, U2, U3, U7 are genuine open items**; U4, U5, U6, U8 are answered by the spec or
by an earlier step and can be closed; U9 is a decision filed in the wrong column.

---

## 4. Two spec observations, raised because invariant 7 says to raise rather than assume

- **S-a — §3.2 line 286 says "Three forms" and lists four.** This is F1's other half and
  is a defect *in the spec*, not only in the code. It also matches step 2's still-open
  gap **S2** ("§3.2's uptime forms do not cover below one minute"), which HANDOVER §7 lists
  as raised and unanswered — so the spec text appears to have been amended after step 2 ran
  without the code following. Recording the link so the owner rules once.
- **S-b — §3.7's `ErrorSource` has eighteen members and none of them names a *delta*.**
  A3 has no correct `source` value available even if someone wanted to report it:
  `proc-stat` and `proc-net-dev` name the *reads*, which succeeded. Whether a backwards
  counter is reportable under the file's own source, or needs a nineteenth name, is a spec
  question and I did not invent an answer.

---

## 5. What I attacked and found sound

Listed so the review does not repeat it. Everything here was executed, not read.

**Invariant 1 at the parse boundary — the core of the step, and it holds.**
Every one of the seven numeric `nvidia-smi` columns was fed eighteen junk values —
`''`, `' '`, `'N/A'`, `'[N/A]'`, `'Not Supported'`, `'[Not Supported]'`, `'ERR!'`,
`'Unknown Error'`, `'[Unknown Error]'`, `'[Insufficient Permissions]'`, `'1e400'`,
`'Infinity'`, `'NaN'`, `'0x10'`, `'12 MiB'`, `'1.2.3'`, `'null'`, `'-'` — **126 cases, every
one `null`.** Not one produced a `0`. `Number('')`, `Number(' ')` and `Number('\n')` are
all defused at `numbers.ts`, and `numbers.test.ts` asserts the premise itself rather than
assuming it.

**The complement holds too.** A genuine `0` survives as `0` in every path I could reach:
all nine numeric GPU columns (`0 °C`, `0.00 W`, `0 MiB`, `0 %`, `0 MHz`, `0x0` — the mask
stays `'0x0'`, not `null`), `0.00 0.00 0.00` load, `0` uptime, swap-off `SwapTotal: 0`,
zeroed `/proc/net/dev` counters, an all-zero `/proc/stat`, and both deltas end to end
(`cpuPct` `0` → `0.0 %`, rates `0` → `0 KB/s`).

**Real-world shapes.** CRLF in the CSV, in `/proc/stat`, `/proc/meminfo`, `/proc/net/dev`,
`/proc/cpuinfo` and `operstate`; trailing blank and whitespace-only lines; tab-separated
`/proc/stat`; the aggregate `cpu` line not first; `cpu` lines of 3/4/5/8/10/11 fields
(3 rejected, guest/guest_nice correctly ignored at 10 and 11); `MemAvailable` absent
(used `null`, total still read, one problem); a `MemTotal` with no unit or the wrong unit
(rejected — the `kB` check is real); `eno1` vanishing from `/proc/net/dev`; the jammed
fixed-width name column; a `coretemp` node whose `Package id 0` is not the first entry;
a label with trailing whitespace.

**A card disappearing between polls does not shift.** Two cards then one: `index` is read
from the row, so the survivor keeps its own index (`[0,1]` → `[1]` when GPU 0 is the one
that went), and `collect.test.ts` pins `after.gpus[0]` deep-equal to `before.gpus[0]`.
A card present but `[N/A]` in one column only keeps every other column of that row and both
cards in the array.

**Delta arithmetic.** First sample `null` (not `0`) directly, through `collectHost`, and as
a rendering. Counter reset → `null`. 32-bit wrap → `null`, and **per counter**: rx rejected
while tx still reports. Identical timestamps → rates `null` (no `0/0`), while `cpuPct` still
computes, which is correct because it is self-normalising and carries no time term.
Out-of-order polls → rates `null`, `cpuPct` computed. `0/0` in `cpuPct` → `null`. I also
confirmed the build's own claim that `total === 0` and `elapsedMs <= 0` are redundant with
the downstream finiteness/sign checks — breaking either alone does not change a result.

**Error attribution (§3.7) is right, including the distinction §3.7 argues at length.**
Nine sources, each owning its own message, verified against the real filesystem with a
mixture of `EISDIR`, `EACCES`, `ENOTDIR` and `ENOENT`: a failed link read is
**`net-operstate`** and a failed counter read is **`proc-net-dev`**, they fail
independently, and removing both files yields both names. `hostname` gets `hostname`, the
hwmon walk gets `coretemp`. No source is used for a figure it does not explain, and
`parseOperstate` rejects anything outside §3.7's seven values instead of passing a bare
string through.

**Invariant 5.** Nine paths removed one at a time, all nine at once, a directory where a
file was expected, a 0-perm file, a file where a directory was expected, an executable that
is a directory, a binary that crashes on a signal, a binary that exits 0 with a banner —
**nothing threw, every case was a partial snapshot plus errors**. `kernelRelease` stays
guarded even though `os.release()` cannot fail.

**Mutations that do bite.** Beyond re-running the 51: `Math.floor`→`Math.round` in
`parseUptime`, dropping the `MAX_SAFE` delta guard, removing the bracketed-placeholder
shape check, and loosening `/proc/stat`'s four-field minimum all fail the suite. The two
that survive are A2 and A8, and they are the same asymmetry.

**Not found:** any path that turns an unreadable field into a confident `0`; any path that
turns a genuine `0` into `null`; any use of `os.hostname()`; any use of `pwmN_enable` or
`fanN_target`; any `dell_smm` fallback for the CPU temperature; any collector that reads a
path §2.2 does not mount.

---

## 6. Severity summary

| # | Sev | One line |
|---|---|---|
| **A1** | **HIGH** | the `nvidia-smi` timeout does not fire on a child that ignores SIGTERM — measured 6295 ms against a 300 ms limit, and it *resolves* |
| **A2** | **HIGH** | the CSV column guard is untested in the `>11` direction; weakening it fabricates a thermal-slowdown alarm and passes all 807 tests |
| **A3** | MED | a rejected delta renders `—` with no `errors[]` entry — §6.5 requires one |
| **A4** | MED | `gpus: []` is unreachable; the measured "found nothing" maps to `null`, and `[]` now means "parsed nothing" |
| **A5** | MED-LOW | an `EACCES` `coretemp` node is reported as an absent one |
| **A6** | LOW | a signal-killed process yields a 230-char argv dump with no signal named |
| **A7** | LOW | U7's mitigation is false: most figures have no §6.3 band, `-500 °C` bands `normal`, `utilPct` is unguarded while `cpuPct` is |
| **A8** | LOW | `/proc/net/dev`'s 16-column guard has A2's untested direction |
| **A9** | LOW | parse-failure messages hard-code `/proc/...` while `CollectorPaths` is injectable |
| **A10** | LOW | a stale `tsconfig.tsbuildinfo` produced a false `pnpm verify` failure — observed once, not reproduced |
| **A11** | INFO | build.md §5 misstates `clocks_throttle_reasons.active` as a pending rename; it is an accepted alias |

---

## 7. Reasoned but not verified

Kept separate, deliberately.

- **A1's kernel mechanism.** That a wedged NVIDIA driver leaves `nvidia-smi` in
  uninterruptible sleep is from the driver's documented behaviour, not from this box —
  both V100s are healthy and I will not wedge them (invariant 2). What *is* measured is
  that `nodeIo.run` does not settle at its deadline for **any** child that ignores
  `SIGTERM`, which is the property that matters regardless of why the child ignores it.
- **A4/A6's partial-output case.** `collectGpus` discards stdout wholesale on a non-zero
  exit — measured with a stand-in that prints both cards' rows and exits 255, giving
  `gpus: null`. Whether the real `nvidia-smi` ever prints usable rows *and* exits non-zero,
  I could not establish: `-i 0,5` prints GPU 0's row and exits **0**, and a card that has
  fallen off the bus is reported as `[Unknown Error]` cells (which the parser already
  handles per-field). So the discard is a latent behaviour, not a demonstrated one.
- **No timeout on `readFile` / `readDir`, and no aggregate deadline on a poll.**
  `collectHost` issues nine concurrent reads with no bound. Irrelevant for `/proc` and
  `coretemp`; it becomes relevant at **step 4**, where the `dell_smm` hwmon reads go through
  SMM calls on a board whose EC has hung before. Flagged now because step 3 owns the
  `CollectorIo` contract that step 4 will inherit.
- **`netRatesBetween` trusts wall-clock `Date.now()`.** A backward NTP step is guarded
  (`elapsedMs <= 0` → `null`); a **forward** step is not, and silently stretches the
  interval, under-reporting the rate. A monotonic clock would be immune. Low, and it is
  step 6 that chooses what to pass as `nowMs`.
- **Very short intervals are unbounded.** 1 ms between samples with a 1 MB delta yields
  `1,000 MB/s` — eight times a 1 Gbps link. §4's 2 s cache should make it unreachable
  through the route, so this is a note for step 6's cache, not a step-3 defect.
- **Duplicate `index` values** in the CSV are not detected; two rows with `index: 0` would
  both be kept and §6.2's SERVING join would be ambiguous. No driver produces this.

---

## 8. What I ran, and the restoration

Read-only on `ai-server` (invariant 2 respected — nothing written, nothing restarted):
`nvidia-smi --query-gpu=… -i 5`, `… -i 0,5`, `head -1 /proc/stat`, `cat /proc/net/dev`,
`cat /sys/class/net/eno1/operstate`.

Locally:

| Experiment | Reverted by |
|---|---|
| 4 scratch test files under `lib/collectors/` (`zz-adv-probe`, `zz-adv-io`, `zz-adv-two-poll`, `zz-adv-alias`, plus a transient `zz-demo`) — 168 probe cases | moved to the session scratchpad, then deleted; `ls lib/collectors/` shows the 15 original files |
| `app/zz-adv/page.tsx` (F2's `next build` check) | `rm -rf app/zz-adv`; `app/` holds only `layout.tsx` and `page.tsx`; `pnpm build` re-run to regenerate `.next/types` |
| 8 source mutations across `nvidia-smi.ts`, `proc.ts`, `deltas.ts`, `numbers.ts` | backup taken before the first, `cp`-restored after each, then `diff -q` per file |
| `tsconfig.tsbuildinfo` deleted (A10) | build artifact, gitignored, regenerated by the next `tsc` |

**Final state, run in this order after everything above:**

```
pnpm verify                                          -> exit 0   807 tests, 13 files
python3 …/03-collectors-gpu-host/regressions.py      -> exit 0   All 51 regressions failed their check
python3 …/02-format-severity/regressions.py          -> exit 0   All 38 regressions failed their check
pnpm typecheck                                       -> exit 0
git status --short                                   ->  M ../.gitignore   ?? ./
```

`git status` is byte-for-byte what HANDOVER §9 records. No source file, test, fixture or
config differs from the state the build phase left. No commit was made.
