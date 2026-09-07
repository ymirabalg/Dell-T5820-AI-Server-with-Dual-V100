# Step 3 — GPU & host collectors · review phase

**Baseline re-established independently.** `pnpm verify` → **exit 0, 807 tests, 13 files**.
`git status --short` → ` M .gitignore` / `?? dashboard/`, byte-for-byte what HANDOVER §9
records. Every experiment below was mutate-run-restore or scratchpad-only; §9 lists them
and proves the restoration by checksum.

**Eleven adversarial findings adjudicated, two build findings ruled, six of my own added.**
Three findings did not survive: **A3 rejected as a defect**, **A8 overstated**, **A10
rejected as a finding**. A2's severity is downgraded from HIGH; its *rule* is promoted.

---

## 1. The four load-bearing findings

### A1 — **UPHELD**, and the mechanism is sharper than reported

I reproduced it independently, on a 9-second child rather than a 6-second one:

```
execFile(cmd, [], { timeout: 300 })  against  #!/bin/sh  trap "" TERM; sleep 9
   -> settled after 9015 ms, and the promise RESOLVED (no error at all)
control: #!/bin/sh  sleep 9
   -> rejected after 309 ms
```

Thirty times the stated bound, and it comes back as a **success**. There is not even an
`errors[]` entry to explain the latency — §6.7's backoff never engages, because nothing
failed. With §4's per-request sampling that is the whole telemetry route, and every browser
polling it, held on one wedged call. The finding is correct and it is the most consequential
thing in the step.

**The precise mechanism**, which neither build.md nor adversarial.md states and which
determines the fix: `execFile`'s callback fires on the ChildProcess **`'close'`** event,
which requires *both* that the process has exited *and* that its stdio has closed. The
`timeout` option does two things — destroys the stdout/stderr streams, and sends
`killSignal` (default `SIGTERM`). It does **not** settle the promise. So if the process does
not die, nothing settles, and the deadline is decoration.

**Which option actually bounds it.** Measured, same 300 ms deadline, same SIGTERM-ignoring
child:

| candidate fix | bounds a SIGTERM-ignoring child | bounds **uninterruptible sleep** | measured |
|---|---|---|---|
| `killSignal: 'SIGKILL'` alone | **yes** — rejected at 307 ms | **NO** | ✅ |
| `signal:` an `AbortSignal` | **yes** — rejected at 305 ms | **yes** | ✅ |
| `Promise.race` against a timer | yes — rejected at 304 ms | yes | ✅ |

**`killSignal: 'SIGKILL'` is the option that does not work**, and it is the one a reader
will reach for first because it looks like the obvious escalation. It bounds the *measurable*
case only because that child was killable. A task in `TASK_UNINTERRUPTIBLE` inside an
`ioctl` on `/dev/nvidiactl` is not delivered *any* signal, `SIGKILL` included, until the
syscall returns — so the process never exits, `'close'` never fires, and the callback still
waits. Escalating the signal makes the guard *look* stronger while leaving the exact failure
U2 was invented for untouched.

**The distinguishing property, and how I proved it without wedging a driver** (invariant 2 —
both V100s are healthy and I will not touch them): the requirement is that the promise settle
*independently of the child*. That is directly observable. With `signal:` and
`killSignal: 'SIGTERM'` against a child that ignores TERM:

```
settled at 307 ms :: "timed out after 300 ms"
400 ms later:  46657 /bin/sh ./marker.sh      <-- child STILL RUNNING
```

The promise settled while the child was alive. No kill-based mechanism can claim that, and
it is exactly the property uninterruptible sleep requires. `Promise.race` has it too.

**Recommended shape** — `AbortSignal` over a hand-rolled race, for a reason I measured:

```ts
run: (command, args, timeoutMs) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  return new Promise<string>((resolve, reject) => {
    execFile(command, [...args],
      { encoding: 'utf8', windowsHide: true, signal: ac.signal, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(error.name === 'AbortError'
            ? `timed out after ${timeoutMs} ms`
            : (stderr.trim() || describe(error))));   // see A6 for `describe`
          return;
        }
        resolve(stdout);
      });
  }).finally(() => clearTimeout(timer));
}
```

`signal` gives the bound; `SIGKILL` is the reaping courtesy for children that *can* be
killed, not the mechanism. Both are needed and neither substitutes for the other.

**Why `signal` and not `Promise.race`.** I found a second unbounded path while testing, and
it decides between them. A child that exits *immediately* but leaves a descendant holding
the inherited stdout pipe does not settle until that descendant exits — measured
**8019 ms with no timeout set**. The `timeout` option currently masks this, because its
`kill()` destroys the pipes. A pure `Promise.race` that abandons the promise without
touching the streams would leave that path open and leak the pipe. Node's abort path calls
the same `kill()`, so `signal` bounds the promise *and* destroys the pipes. It is the only
one of the three that closes both holes.

**The residual, which is step 6's and must be written down.** Bounding the promise
*abandons* the process. §4 samples per request; at a 5 s cadence against a wedged driver,
every poll forks another `nvidia-smi` that never exits. The 2 s cache does not help across a
hang longer than 2 s **unless step 6 caches the in-flight promise, not just the result.**
That is a new obligation, not a step-3 defect.

**The two tests must change with the fix** — see R6. Fixing `io.ts` and leaving
`/bin/sleep 5` in place would re-establish the same blind spot against the new
implementation.

---

### A2 — **UPHELD as a test-coverage defect. Severity OVERSTATED as HIGH.** The fix is a rule, not a test.

Both halves reproduce. Applying the two weakenings together —

```
lib/collectors/nvidia-smi.ts:  cells.length !== NVIDIA_SMI_FIELDS.length  ->  <
lib/collectors/proc.ts:        cols.length  !== NET_COLUMNS               ->  <
```

— gives `pnpm verify` → **exit 0, 807 tests, 13 files**. Nothing bites. And the fabricated
alarm is exactly as described: a twelve-cell row on a card at 38 °C yields

```
memUsedMiB 26 · memTotalMiB 456 · utilPct 32768 · throttleReasons "1260"   problems: []
decodeThrottleMask("1260") -> severity alarm
   0x20 sw thermal slowdown | 0x40 hw thermal slowdown | 0x200 unknown | 0x1000 unknown
```

**Worse than reported in one direction.** The adversarial's twelve-column example inserts the
extra comma inside `memory.used`. I also tried a quoted name, and it is uglier — *every*
field shifts one place left, with `problems: []`:

```
0, "Tesla V100, PCIE", 00000000:17:00.0, 38, 39.25, 250.00, 26456, 32768, 0, 1260, 0x0
 -> name "\"Tesla V100"  bus "PCIE\""  tempC null  powerW 38  powerCapW 39.25
    memUsedMiB 250  memTotalMiB 26456  utilPct 32768
```

`powerW 38` is the temperature. `memTotalMiB 26456` is the *used* figure on a 32,768 MiB
card. This is verbatim the failure `nvidia-smi.ts`'s own doc comment says the guard exists to
prevent — "Guessing which columns survived would silently shift every reading one place left."

**Better than reported in the other, and this is why HIGH is wrong.** The adversarial names
three triggers: a driver adding a query field, a comma in a GPU name, a thousands separator.
Only the last two shift anything — an appended twelfth column leaves `cells[0..10]` correct
and is harmless. And `--format=csv,nounits` emits no thousands separators, nvidia-smi does not
quote or escape, and no NVIDIA board name carries a comma. **The shipped code is correct and
there is no live bug.** The threat model is a future refactor, not this driver.

**Answer to "one test or a rule": a rule, because the harness cannot supply the test either.**
Regression **S8** anchors on the literal string `if (cells.length !== NVIDIA_SMI_FIELDS.length) {`
and replaces it with `if (false) {`, which the short-row fixtures catch. So the harness proves
*a guard exists there*; it can never prove the guard is an **equality**, because the operator
it would have to mutate is the anchor it matches on. Both mechanisms — the suite and the
harness — are blind in the same direction, and that is the finding.

> **Rule for HANDOVER, inherited by steps 4–12: every boundary guard needs a fixture on both
> sides of its boundary.** For any `x !== N` / `x < N` / `x > N` in a parser, the fixture set
> carries one case below and one above. And a regression that mutates a comparison must not
> anchor on the comparison — anchor on the surrounding block, or ship two mutations per guard
> (`!==` → `<` **and** `!==` → `>`).

This is the third consecutive step whose worst finding is "tests look like coverage and are
not" (step 2's five inert mutations, step 3's five, now this). It has stopped being a
per-step slip and is a property of the method. Step 4 has the same shape waiting in `pwm5`'s
0–255 range check and its fan-channel enumeration.

**A contributing factor, and it is step 2's file.** `lib/throttle.ts`'s
`HEX = /^\s*(?:0[xX])?([0-9a-fA-F]+)\s*$/` makes the `0x` prefix **optional**, which is the
only reason the shifted `clocks.sm` value `1260` was accepted as a mask and decoded to an
alarm rather than rejected to `null`. This driver always prints the prefix
(`CAPTURED_NVIDIA_SMI` is `0x0000000000000000`). Requiring it would delete the
alarm-fabricating half of A2's blast radius. SHOULD, not MUST — it needs a check that no
driver in scope omits the prefix, and it is not step 3's file.

---

### A3 — **REJECTED as a defect.** A rejected delta is an ordinary absence, and the spec says so already.

§6.5's row reads "A single sensor **read** fails → that figure shows `—`, its `errors` entry
is available". In the backwards-counter case **both reads succeeded** — `/proc/stat` was
read cleanly on both polls. What failed is a derivation, which §6.5 does not govern.

And §6.7 already licenses precisely this rendering, in the same words, for the same two
figures: *"**First sample:** `cpuPct` and network rates are deltas and need two samples. They
render `—` until the second poll arrives, never `0`."* A wrapped counter produces the same
visual, the same meaning — *not enough valid information yet* — and self-heals on the next
poll. Adding an `errors[]` entry would put a line in front of a human for a 32-bit wrap that
resolves itself in five seconds.

**The adversarial's own S-b is the strongest evidence against A3, and it read it the wrong
way round.** §3.7's `ErrorSource` is closed at eighteen names and **none of them names a
delta**. `proc-stat` names a read that succeeded; attributing a delta rejection to it would
"point the UI at the wrong figure", which §3.7 forbids in that exact phrase. The absence of a
vocabulary member is evidence the spec did not intend deltas to error — not evidence of an
omission. **No nineteenth `ErrorSource` is needed, and the spec should say so** so this stops
being re-raised.

**The D4 shape is not a defect either.** One transient `/proc/stat` failure blanking `cpuPct`
for two polls, the second with no error, is the honest consequence of needing two samples:
poll 3 is structurally *the first sample since the gap*, which §6.7 renders `—` by design.

**What is real underneath it, and it is a handover gap not a defect.** Step 3 does not say
who owns `previous` across a failed read, and step 6 will guess. `collectHost` returns
`sample: { cpu: null, … }` when the read failed; step 6 can store that (poll 3 → `null`,
today's behaviour) or keep the last *good* sample (poll 3 → a delta over a 10 s span). Both
are defensible, neither is written down. Name it as a step-6 obligation.

---

### A4 — **UPHELD as a contract-prose defect. REJECTED as a behaviour defect.** The code should not move.

I reproduced the measurement independently, read-only, and got one more exit code:

```
nvidia-smi --query-gpu=index,name --format=csv,noheader -i 5    -> "No devices were found"                       EXIT=6
nvidia-smi --query-gpu=index,name --format=csv,noheader -i 99   -> "No devices were found"                       EXIT=6
nvidia-smi --query-gpu=bogusfield --format=csv,noheader         -> 'Field "bogusfield" is not a valid field…'     EXIT=2
```

So **U3's stated blocker is wrong** — "could not be measured on a box with two working
cards" is false, `-i 5` reproduces it in one read-only command. Take that correction.

But the consequence the adversarial draws does not follow. `lib/types.ts:633` claims `[]` is
"the enumeration ran and found nothing — a real, previously-observed state of this box". As
measured, that state exits 6 and maps to `null`. **The prose is false.** Two ways to close
it, and the code is not the one that should move:

- Mapping exit 6 → `[]` **discards `No devices were found`**, the single most useful string
  the UI could show, unless you keep the error entry too — at which point `[]` plus an error
  reads as a contradiction.
- Keeping non-zero → `null` means a no-GPU box always carries the driver's own explanation,
  which is strictly more informative than an empty array with nothing.
- §3.1 renders both identically ("no GPUs enumerated"), and the distinction §3.1 actually
  draws is *last successful read* vs *never read this session* — a client-side ring-buffer
  question (§6.7), not a `null`-vs-`[]` one. I grepped: nothing in `lib/` branches on
  `gpus === null` against `gpus.length === 0` outside the contract tests, so **step 10 is not
  blocked either way.**

**Ruling: keep the mapping, fix the prose, and pin the vocabulary in the spec.** `null` = the
enumeration could not be performed, *including a box with no cards*; `[]` = the command
succeeded and produced no parseable rows, which **always carries an `errors[]` entry** and so
is never silent. That preserves the property the step-1 decision was actually protecting —
that the two are not the same fact — while saying something true.

---

## 2. The remaining findings

| # | Verdict | Ruling |
|---|---|---|
| **A5** | **UPHELD (low here, load-bearing for step 4)** | Code-confirmed: `catch { continue; }` on the `name` read makes an `EACCES` node indistinguishable from "not this one", and the terminal message asserts absence. §2.2 runs the container non-root, so `EACCES` under `/sys` is the plausible case. The *value* is `null` either way — no false number reaches the UI, only §6.5's explanation is false. **The reason to fix it now is step 4**: `dell_smm` is located by the same loop, and there O8's probe *does* branch on it — a swallowed `EACCES` flips `pwm5Present` from `null` (unknown) to a **false alarm claiming GPU fan control is gone**, the worst inversion HANDOVER names. Fix before step 4 copies it. |
| **A6** | **UPHELD (low)** | `stderr.trim() \|\| error.message` yields a 230-char argv dump with no signal named; `error.code` and `error.signal` are on the object and unused. §6.5 puts this string in front of a human. Fix together with A4 — the same `describe(error)` helper supplies the exit code A4's vocabulary needs. |
| **A7** | **UPHELD; spec change DECLINED, consistency fix TAKEN** | Verified by reading `severity.ts`: `severityGpuTemp(celsius(-500))` → `'normal'` (`-500 >= 80`? no; `>= 70`? no). Verified against §6.3's table: **no row** for `powerW`, `smClockMHz`, `utilPct`, `cpuPct`, `loadAvg`, `uptimeSec` or the network rates. So U7's stated mitigation is false. But inventing ranges for temperature/power/clock risks discarding a real reading with no measured basis — decline. Take only the asymmetry: `utilization.gpu` is a percentage **by definition**, so 0–100 is its unit and not an invented range, and `cpuPct` is already checked. Two `Percent` producers in one step disagreeing is the part worth closing. |
| **A8** | **UPHELD but OVERSTATED — fold into A2's rule, not a finding** | I measured 17- and 18-column `eno1` lines under the weakened guard: `rxBytes` and `txBytes` came back **correct** (100 and 900). Both sit at fixed offsets from the *left* and extra columns append, so unlike A2 nothing shifts and nothing is fabricated. One fixture for symmetry; no independent severity. |
| **A9** | **UPHELD (low) — fix now, and not the way it is framed** | Real, and a step-11 landmine the moment `/host/proc` is mounted. But the obvious fix (thread the path into every parser) puts wrapper knowledge into pure functions and damages the seam the whole step is built on. `readAndParse` already prefixes *read* failures with the real path — have it prefix *parse* problems too and strip the literals from the parser messages. One place, five lines, seam intact. |
| **A10** | **REJECTED as a finding; recorded as a hazard** | Observed once, not reproduced, and the adversarial's own deliberate replay came back exit 0. `incremental: true` plus a mutate-and-restore harness is a plausible mechanism but unproven, and the direction that would matter — a stale *green* over a broken file — has no evidence at all. Keep the one-line recovery (`rm tsconfig.tsbuildinfo`) in HANDOVER §1's "green means exit 0" family. Do not spend time chasing it. |
| **A11** | **UPHELD (info)** | Correct build.md §5. Both keys work and return identical values on 580.173.02 — an accepted alias, not a pending rename. As written the note invites a later step to "fix" a field name that is correct. |

The adversarial's own §5 ("what I attacked and found sound") I spot-checked rather than
repeated: the invariant-1 boundary, the genuine-zero complement, `ErrorSource` attribution and
the delta arithmetic are the core of the step and they hold. That is the substance of the
build, and it is good.

---

## 3. Consolidated spec gaps — for the owner to edit `SPEC.md`

Precise, and nothing padded. **Take** = the spec should gain this; **Decline** = the spec
already answers it or should not answer it, and the item should leave the open list.

| § | What it should say | Verdict |
|---|---|---|
| **§3.1** | `nvidia-smi` is bounded at **4 s** — under §6.7's 5 s default cadence, well above the ~250 ms it takes here. **The bound must settle the request independently of the child process; sending a signal is not a bound.** | **Take** (U1/U2). §4 samples per request, so an unbounded collector hangs the route; A1 proves the signal-only guard does not bound the one failure it was written for. The sentence has to carry the semantics, not just the number, or the next implementation repeats it. |
| **§3.1** | The measured exit-code vocabulary: **0** ran; **2** invalid query field; **6** no devices (`No devices were found`). **Every non-zero exit is `gpus: null`, carrying the driver's own text.** | **Take** (U3). Measured read-only in one command; the "could not be measured" blocker was never real. Pinning it lets a later step discriminate if a panel ever needs to, without re-deriving it. |
| **§3.1 / §4** | `null` = the enumeration could not be performed, **including a box with no cards**. `[]` = the command succeeded and produced no parseable rows, and **always carries an `errors[]` entry**, so it is never silent. Both render "no GPUs enumerated". | **Take** (A4). `lib/types.ts:633`'s current claim is demonstrably false. This keeps the step-1 distinction meaningful while saying something true, and it does not move the code. |
| **§6.7** | Extend the "First sample" bullet: a delta **rejected** because a counter went backwards, wrapped or was reset renders `—` on the same terms — **no `errors[]` entry, and no nineteenth `ErrorSource`**; the read succeeded and it self-heals on the next poll. | **Take** (A3, and it closes S-b). Without it, step 9/10 will invent a "why is this blank" treatment for something the spec already treats as ordinary. §6.5 needs no change — its row governs reads. |
| **§3.2** | **"Four forms"**, not "Three". The list is already right. | **Take** (F1). See §4 below for which half moves. |
| **§3.2** | The `cpuPct` accounting: busy = `user+nice+system+irq+softirq+steal`, idle = `idle+iowait`; **`guest`/`guest_nice` are already counted inside `user`/`nice` and must not be added again**. | **Take** (U1). §6.6 promises every figure checks against the command that produced it — this one sentence is what makes `cpuPct` check against `top`/`htop`/`mpstat` rather than being one plausible convention of several. |
| **§3.1** | Ranges for `nvidia-smi` numerics generally. | **Decline** (U7). No measured basis, and a bound invented here discards real readings. |
| **§3.1** | `utilization.gpu` is range-checked to **0–100**, matching `cpuPct`. | **Take** (A7). Not an invented range — 0–100 *is* the unit. Closes the only case where two `Percent` producers in one step disagree. |
| **§3.1** | `bus` trimming. | **Decline** (U4). `e.g. 97:00.0` is an example, and §6.6's "the unit its own source reports" plus §9's "read at runtime, never assumed" both mandate raw. Drop from the open list. |
| **§3.2 / §3.7** | An `ErrorSource` for `/proc/version`. | **Decline** (U5). §3.2 offers two sources; exactly one has an error vocabulary. Choosing it is following the spec. |
| **§3.2** | `Package id 1` on a multi-socket board. | **Decline** (U6). §3.2 names the sensor exactly; a second socket is a spec change, not an ambiguity. |
| **§3.2** | Floor vs round for `uptimeSec`. | **Decline** (U8). Step 2's `formatUptime` already fixed the policy in its own doc; `parseUptime` matching it makes the double-floor a no-op. |

U9 is not a spec item at all — HANDOVER O7 offers an explicit choice and step 3 took one.
Move it out of build.md's underspecified table and into its decisions list.

---

## 4. F1 — which half to change: **the spec's count word, and the code with its two tests**

Both halves confirmed. `formatUptime(seconds(59))` → `'up 0 min'`; §3.2's sentence says
`up <1 min` below a minute; §3.2 says "Three forms" and lists four.

**The four-form list is the newer half, and the count word is the leftover.** HANDOVER §7
records step 2's open gap **S2** — *"§3.2's uptime forms do not cover below one minute"* —
as raised and unanswered. The spec now carries a clause answering exactly that gap, and step
2's code predates it. (`dashboard/` is untracked, so there is no git history to confirm; the
sequence is nonetheless unambiguous.) A spec amended to close a reported gap is the
authoritative half; the numeral in front of it was simply not updated.

So: **§3.2 "Three forms" → "Four forms"**, and `lib/format.ts` gains one branch:

```ts
if (total < 60) return 'up <1 min';
```

Two test lines move, both in `lib/format.test.ts`:

- **`:196`** — the law-table `Uptime` row's zero example, `formatUptime(seconds(0))`,
  `'up 0 min'` → `'up <1 min'`.
- **`:667`** — `['under a minute is still a reading', seconds(11), 'up 0 min']` → `'up <1 min'`.

**The §6.6 collision the adversarial flagged is real but does not block it.** §6.6's second
law is "Zero renders as the numeral with its unit — `0 RPM`, never `—`", and §6.6 states its
own purpose: it is "the §6.5 rule expressed as a formatting law", and the §6.5 rule is *"Zero
and unknown must never look alike."* `up <1 min` is neither `—` nor blank, so the purpose
holds intact. The law table already tolerates per-quantity renderings — `formatCh5Pwm(pwm(0))`
is `'OFF pwm 0'` and `formatPort(port(0))` is `'0'` with no unit at all. Change that row's
expected string; keep the row.

**Why not the other way.** Deleting the `up <1 min` clause re-opens S2 unanswered and leaves
the header printing `up 0 min` for the first sixty seconds after every reboot — on a project
whose step 12 is literally "survives a reboot", that is precisely the minute someone will be
staring at the header. And `up 0 min` is §3.2's own stated defect (`up 0 d 00:14`) one scale
down. Cost of moving the code is one branch and two lines, **now**, while `formatUptime` has
zero consumers — step 10's header is not written yet.

---

## 5. F2 — **fix it now, one line plus one guardrail. Do not drop the convention.**

The adversarial's refinement is right and materially changes the picture: `pnpm build` exits
0 with `@/` in a real `app/` page because Next resolves `paths` from `tsconfig.json` itself.
So F2 blocks steps 6 and 9's **tests**, not their product code — and it blocks them *loudly*
(exit 1, a named unresolved import), not in the silent lost-from-the-count way HANDOVER §1
warns about. I confirmed it is entirely latent: `grep -rn "from '@/"` over `lib/` and `app/`
returns nothing.

**Fix, not drop**, for three reasons:

1. HANDOVER §6 states `@/` as *the project convention*, and steps 6, 9 and 10 read HANDOVER
   as fact. Not fixing it means three future agents each write conforming imports, watch them
   typecheck, and hit the failure at test time — the same tax paid three times against one
   line paid once.
2. §2.4 puts `app/`, `components/` and `lib/` as siblings under `dashboard/`. `components/`
   would reach `lib/` at `../lib/types`, which is tolerable; `app/api/telemetry/route.ts`
   reaches it at `../../../lib/types`, which is not.
3. Dropping it means editing HANDOVER §6 and re-deciding the convention anyway. Neither
   option is zero-edit, and only one leaves the three toolchains agreeing.

**But the fix must not repeat the project's own recurring mistake.** "Writing the config is
not evidence it took" has bitten this box three times over — ufw's `is-active` gate on a
disabled firewall, `StartLimit*` silently ignored in `[Service]`, `tsc` bailing on an invalid
config while Vitest printed `no errors`. `lib/guardrails.test.ts` exists for exactly that
reason. So:

- add `resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } }` to
  `vitest.config.mts` — **`fileURLToPath`, not `.pathname`**, which percent-encodes and breaks
  on any path containing a space;
- and add **one test that actually resolves a `@/` import at run time**. A text assertion
  against `vitest.config.mts` would be the original mistake in a new place; only an import
  proves the alias took.

`vitest.config.mts` and `lib/guardrails.test.ts` are **step 1's files**. Crossing that
boundary is ruled here deliberately so reconciliation does not hesitate over it.

---

## 6. My own findings

### R1 — fifteen files is weight, not ceremony, with one exception

Eight source + six test + one fixture for three data sources reads heavy until you count what
each earns. `numbers.ts` (141) is where invariant 1 lives, and the adversarial's 126-case junk
sweep is the proof it deserves its own door. `io.ts` (85) is the seam, and it is why
`io.test.ts` catches the three bugs (S45–S47) that no fake can. `proc.ts` (482) is six parsers,
not one. `result.ts` at 27 lines is the borderline case and it **earns it**: `clean()` is
called eight times, and the alternative — defining `ParseResult` in `proc.ts` and importing it
into `nvidia-smi.ts` — creates a dependency between two parsers that should not know about
each other. Keep all eight.

The exception is **`index.ts`**. A 60-line barrel re-exporting ~30 names duplicates the export
list and will drift from it. More concretely, it exports **`parseKernelRelease`, which no
production code calls** (grep: only `proc.ts`'s definition, `io.ts`'s doc comment, and its
five tests). A tested-but-unused parser on the *public* surface invites step 5 to reach for it
and land straight on U5's missing `ErrorSource`. Either drop it from the barrel or carry the
warning there, not only in `io.ts`.

### R2 — the parser/IO split is genuinely clean, with one place it is weaker than it looks

The claim holds: `numbers.ts`, `nvidia-smi.ts`, `proc.ts` and `deltas.ts` import nothing from
`node:`, and the pure/impure boundary is real and testable.

But **`collectCpuTemp` is not a thin wrapper.** It carries a directory walk, a filename filter
(`/^temp\d+_(label|input)$/`), a per-file error policy, and a loop with two early returns and
a fall-through — roughly 45 lines of logic in the file whose own doc says "**No parsing happens
in this file** … anything clever here is in the wrong file." That is exactly where A5 hides,
and it is exactly the shape step 4 needs for `dell_smm`. This is the one place the split's
guarantee is weaker than the module doc claims, and it is the one place step 4 will copy from.

### R3 — the two `fixtures.ts` files are not duplication, but the name collision is a trap for steps 4–5

`lib/fixtures.ts` holds `TelemetrySnapshot` / `Cooling` / `ServingInstance` **values**;
`lib/collectors/fixtures.ts` holds raw **text**. Disjoint, and HANDOVER §6 asked for exactly
this ("extend the fixture set with real `nvidia-smi` and `/proc` text, not with more
snapshots"). No finding.

The hazard is the shared basename. Step 5 needs both in one file — `servingIdentityOnly` from
one and raw `*.env` text from the other — and will then carry `from './fixtures'` and
`from '../fixtures'` one character apart in the same import block, resolving to different
modules. Rename one now (`lib/collectors/samples.ts` is the smaller change) or accept it
knowingly; renaming after steps 4 and 5 have written against it costs more.

### R4 — the collectors disagree about their own calling convention

`collectGpus(io, paths, timeoutMs)` and `collectCpuTemp(io, paths)` are positional with
defaults; `collectHost({ io, paths, iface, previous, nowMs })` is an options object. Steps 4
and 5 will copy whichever they read first, and step 6 will end up calling four collectors two
ways. Pick the **options object** — it is the one that survives a new parameter, and A1's fix
adds a parameter to the GPU path immediately.

### R5 — `CollectorIo` bounds `run` and does not bound `readFile`/`readDir`, and step 4 inherits that asymmetry into the one place it matters

For `/proc` and `coretemp` an unbounded read is fine; procfs does not block. **Step 4's
`dell_smm` reads are not filesystem reads in any meaningful sense — they are SMM BIOS calls**,
on a board whose EC has hung before and whose fan header once hung POST (the repo's own
`CLAUDE.md` documents both). `collectHost` already issues nine concurrent unbounded reads;
step 4 adds five fan channels and a `pwm5` to that pattern, and step 6 puts the whole thing on
a per-request route.

Step 3 owns the `CollectorIo` contract, so the decision belongs here even though the risk lands
in step 4. Cheapest honest resolution: **write into HANDOVER that step 4 must bound its own
hwmon reads and must not assume the seam does it.** Note the interaction with A1 — once the
GPU call is genuinely bounded, the host side becomes the only unbounded path left in the route.

### R6 — the two timeout tests are the clearest instance yet of the recurring failure, and one is worse than a missing test

- `io.test.ts:142` *"run enforces its timeout"* uses `/bin/sleep 5` — a child that **honours**
  `SIGTERM`, the one input class where the weak and the correct implementation are
  indistinguishable. Regression **S47** deletes the `timeout:` option, which `/bin/sleep 5`
  does catch, so the harness proves the option is *present* and never that it *bounds*.
- `collect.test.ts:143` is named *"a timeout is reported with the driver's own text"* and
  **exercises no timeout at all** — it hands the fake io a `runFails` string.

A missing test is a visible hole. A test whose *name* claims the coverage is an invisible one:
an auditor reading test names ticks the box and moves on. Both must change with A1's fix — the
first to a SIGTERM-ignoring child with an **elapsed-time** assertion (not merely `rejects`), the
second to a name that says what it does.

### Spec-conformance as a unit — and the step-6 assembly question

**Conformant.** I checked the mappings that would be expensive to discover later: §3.1's eleven
fields in order; §3.2 sourcing `hostname` from `/etc/hostname` and never `os.hostname()`;
`coretemp` found by `name` and by **label**, never index, and never `dell_smm`'s `temp1`;
`memUsed = MemTotal - MemAvailable` with no `MemFree` fallback; `cores` from distinct
`physical id`+`core id` pairs rather than `cpu cores`; §3.7's `net-operstate` kept separate from
`proc-net-dev`; `LinkState` validated against the closed seven; §6.7's first sample `null`
everywhere it can be reached. The units are the ones §6.6 requires (VRAM MiB, RAM GiB,
throughput B/s). Nothing reads a path §2.2 does not mount.

**Step 6 can assemble a snapshot with no adapters.** `GpuCollection.gpus` is
`readonly Gpu[] | null`, identical to `TelemetrySnapshot['gpus']`; `HostCollection.net` is
`Network`, identical to `Storage['net']`; `host` is `Host`; `hostname` is `string | null`;
both collectors return `readonly TelemetryError[]` to concatenate. The only friction is that
`collectHost` returns three values bound for three different destinations (top level, `host`,
`storage.net`) — correct, since they come from one poll, and a destructure, not an adapter.

---

## 7. What step 3 must not leak into steps 4–6

Steps 4 and 5 write more collectors and will imitate whatever this step established. Naming
both lists explicitly, because the imitation is not optional — it is how the pipeline works.

**Copy, deliberately:**

- **The parser/IO split and the injectable `CollectorIo`.** It is why 126 junk-value cases ran
  without a GPU, and why `io.test.ts` catches what no fake can.
- **`numbers.ts` as the single door for text→number.** Step 4's O6 (`pwm5` 0–255) and step 5's
  `PORT=` / `CTX=` both go through it. A second strict-parse helper anywhere is a second
  definition of "null", which is invariant 1 lost by drift rather than by decision.
- **`ParseResult<T>` with `problems: string[]`, and the rule that the *wrapper* tags the
  `ErrorSource`.** Step 5 has five sources on one collector; a parser inventing its own source
  would be untestable at the wrapper, which is the only place that knows what it just read.
- **Paired all-null / all-zero fixtures per source.** `NVIDIA_SMI_NA_COLUMNS` /
  `NVIDIA_SMI_ALL_ZERO` are this step's `nothingReadable` / `everythingZero`. Step 4's fan
  channels are the highest-stakes place in the whole project for invariant 1 — `0 RPM` is a
  dead fan on a box with two passive 250 W cards.
- **Capturing fixture text from the box read-only and unreformatted.**

**Do not copy:**

- **`collectCpuTemp`'s hwmon walk as written** (R2 + A5). Step 4 locates `dell_smm` through the
  same loop, and there the swallowed `EACCES` is not cosmetic — it flips O8's three-valued probe
  from `null` (unknown) to `false`, a **sticky banner asserting GPU fan control is gone** on a
  healthy box. Fix it in step 3 so step 4 reads the fixed version.
- **`nodeIo.run`'s timeout** (A1). Step 5 probes HTTP and D-Bus and will want the same shape. A
  "bounded" call that is not bounded is worse than an unbounded one, because it stops anyone
  asking the question.
- **Boundary guards with one-sided fixtures** (A2, A8). Step 4's `pwm5` range check and its fan
  enumeration are the same shape, and step 4 is where a wrong side of a boundary reaches the
  panel that earns this dashboard's existence.
- **`collectGpus`'s positional signature** (R4).
- **Discarding `error.code` / `error.signal`** (A6). Step 5's D-Bus and `/health` probes need
  the status code — §3.7's `HealthState` distinguishes `unhealthy` (503) from `unreachable`
  precisely on it, and a prose fallback cannot carry that.
- **Parsers writing literal paths into `problems`** (A9). Step 4's paths are *discovered*
  (`/sys/class/hwmon/hwmonN/...`), not constants, so the mismatch is immediate there rather
  than deferred to step 11.
- **The `parseKernelRelease` precedent** (R1): a parser that is tested, exported and unused.
  Step 5 will be tempted to add several.

---

## 8. Priority-ordered work list for reconciliation

### MUST

1. **A1 — bound the `nvidia-smi` call for real.** `signal:` an `AbortSignal` **plus**
   `killSignal: 'SIGKILL'`, per §1's shape. `killSignal` alone is not a fix. Keep
   `NVIDIA_SMI_TIMEOUT_MS = 4000`.
2. **R6 — rewrite both timeout tests with the fix.** `io.test.ts:142` against a
   SIGTERM-ignoring child (`sh -c 'trap "" TERM; sleep N'`) asserting **elapsed time near the
   deadline**, not merely `rejects`. Rename `collect.test.ts:143` to what it actually tests.
   Add a regression that swaps `signal:` back to `timeout:` and confirm it bites.
3. **A2 + A8 — one over-wide fixture each, and the rule.** `NVIDIA_SMI_WIDE_ROW` (12 columns,
   from a comma inside a cell — use the quoted-name form, it is the worse one) and a 17-column
   `eno1` line. Re-aim regression **S8** so it cannot anchor on the operator under test, or
   ship a second mutation per guard. **Write the both-sides-of-every-boundary rule into
   HANDOVER**, where steps 4–12 will read it.
4. **A5 — stop reporting an unreadable hwmon node as an absent one.** Low in step 3, and the
   reason it is MUST is step 4: the same loop with the same swallow inverts O8.
5. **F1 — add the fourth uptime form.** `formatUptime` gains `if (total < 60) return 'up <1 min'`;
   `lib/format.test.ts:196` and `:667` move to `'up <1 min'`. **Owner edits §3.2's "Three" →
   "Four".** Step 2's files, crossed deliberately.
6. **F2 — `resolve.alias` in `vitest.config.mts` with `fileURLToPath`, plus a guardrail test
   that resolves a real `@/` import.** Step 1's files, crossed deliberately. A text assertion
   is not acceptable here.
7. **A4 + A6 — correct `lib/types.ts:633`'s prose about `[]`, and carry `error.code` /
   `error.signal` into the message.** One `describe(error)` helper serves both. **The mapping
   does not change.**
8. **HANDOVER additions** (all new obligations, none of them code changes in this step):
   step 6 must cache the **in-flight promise**, not only the result, or a wedged driver forks a
   new `nvidia-smi` every poll (A1 residue); step 6 owns who holds `previous` across a failed
   read (A3 residue); step 4 must bound its own `dell_smm` reads because `CollectorIo` does not
   (R5); the boundary-fixture rule (A2); the "do not copy" list in §7.

### SHOULD

9. **A9** — move the parse-failure path prefix into `readAndParse`; strip the literals from the
   parsers. Five lines, seam intact, and it removes a step-11 landmine now.
10. **A7's consistency half** — range-check `utilPct` to 0–100, matching `cpuPct`. Record the
    decision that no other `nvidia-smi` numeric gets a range, so it stops being re-raised.
11. **R4** — make `collectGpus` and `collectCpuTemp` take options objects, before steps 4 and 5
    copy the positional form. A1's fix touches `collectGpus`'s signature anyway.
12. **R3** — rename `lib/collectors/fixtures.ts` (`samples.ts`) before steps 4 and 5 import it.
13. **A11** — correct build.md §5's alias/rename note.
14. **R1** — drop `parseKernelRelease` from the barrel, or carry U5's warning there.

### DEFER, to a named step

15. **A2's contributing factor — require the `0x` prefix in `lib/throttle.ts`'s `HEX`.**
    **Step 2's file; owner's call.** It deletes the alarm-fabricating half of A2's blast radius,
    but it needs a check that no driver in scope omits the prefix. Not urgent while the equality
    guard is correct and now tested on both sides.
16. **R2 — extract the shared hwmon-node walk.** **Step 4**, which is the second caller and the
    only point at which the right abstraction is visible. Do A5's fix in place now; do not
    generalise a walk with one user.
17. **Aggregate poll deadline.** **Step 6**, which owns the route and the cache and is the only
    layer that can set one.
18. **`netRatesBetween` and a forward NTP step.** **Step 6**, which chooses what to pass as
    `nowMs`; a monotonic clock there is immune.

### EXPLICITLY NOT DOING

19. **A3 — no `errors[]` entry for a rejected delta, and no nineteenth `ErrorSource`.**
    §6.5 governs reads; §6.7 already renders these `—` without an error, and §3.7's vocabulary
    deliberately has no name for a delta. Take the §6.7 clarifying clause instead, so the
    decision is recorded rather than left to be re-found.
20. **A4 — do not remap exit 6 to `[]`.** It would discard `No devices were found`, the most
    useful string the UI could show, and nothing in `lib/` branches on the distinction.
21. **A7 — no invented ranges for GPU temperature, power, memory or clock.** No measured basis,
    and a wrong bound silently discards a real reading. `utilPct` alone is taken, because 0–100
    is its unit rather than a range.
22. **U4, U5, U6, U8 — closed, not open.** Each is answered by the spec or by an earlier step;
    they should leave build.md's underspecified table. **U9 is a decision, not a gap** — move it
    to the decisions list.
23. **A10 — no investigation.** One unreproduced observation, and the direction that would
    matter has no evidence. Keep the recovery line, spend nothing else.
24. **No new dependency.** The `@/` alias is one line of config, not `vite-tsconfig-paths`
    (invariant 6).

---

## 9. What I ran, and the restoration

Read-only on `ai-server` (invariant 2 — nothing written, nothing restarted): three
`nvidia-smi --query-gpu` calls (`-i 5`, `-i 99`, an invalid field name).

Locally:

| Experiment | Reverted by |
|---|---|
| Mutated `nvidia-smi.ts` (`!==` → `<`) and `proc.ts` (`!==` → `<`) for A2/A8 | `cp` from backups taken first. **Checksums re-verified identical:** `caf72d5d…` and `d26a5946…` |
| `lib/collectors/zz-rev-probe.test.ts`, twice, to observe the fabricated alarm | deleted; `ls lib/collectors \| wc -l` → **15**, the original files |
| Five scratch Node probes + four shell scripts measuring `execFile` semantics | scratchpad only; no repo file touched. Stray probe children `pkill`ed |

**No source file, test, fixture, config or spec was edited.** Final state, in this order:

```
pnpm verify              -> exit 0   807 tests, 13 files
shasum lib/collectors/nvidia-smi.ts lib/collectors/proc.ts   -> pre-mutation values
ls lib/collectors        -> 15 files
git status --short       ->  M .gitignore   ?? dashboard/
```

Byte-for-byte the state the adversarial phase left, and what HANDOVER §9 records. No commit
was made.
