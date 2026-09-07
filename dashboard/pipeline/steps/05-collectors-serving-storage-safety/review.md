# Step 5 — review phase: serving, storage and safety collectors

**Verdict: the step is sound and must not be redone.** The parser/wrapper split, the
`false`-never-from-a-failed-read rule, `null ≠ []`, the closed vocabularies, the statvfs
arithmetic and the live-bus validation of the codec all survived the adversarial's direct
attack and my own reading. **Three things must be fixed before step 6 wires these into a
route** — F1, F2 (which is wider than reported: see R1), and R2 — and one spec question
must be answered by the owner rather than by a collector (F4).

I edited no source, no test, no config and no spec.

---

## 0. Baseline, and the two experiments I ran and reverted

```
pnpm verify   ->  Test Files 24 passed (24) · Tests 1232 passed (1232) · Type Errors no errors · exit=0
```

Run three times across this review, `exit=0` each time. `git status --short` is back to
`M .gitignore` / `?? dashboard/` and `ls lib | grep zz` is empty.

**Experiment 1 — `lib/collectors/zz-rev-probe.test.ts`, created, run, deleted.** Drove
`collectGpus({ timeoutMs: Infinity, paths: {…, nvidiaSmi: '/bin/sleep'} })` against the real
`nodeIo`:

```
(node:97169) TimeoutOverflowWarning: Infinity does not fit into a 32-bit signed integer.
             Timeout duration was set to 1.
EXPERIMENT gpus= null  errors= [{"source":"nvidia-smi","message":"/bin/sleep: timed out after Infinity ms"}]  elapsed= 4
CONTROL    gpus= null  errors= [{"source":"nvidia-smi","message":"/bin/sleep: illegal option -- - …"}]        elapsed= 2
```

The control reached the command in 2 ms and got its real stderr; the `Infinity` run never
got there. **See R1.**

**Experiment 2 — `lib/zz-rev-spread.ts`, created, typechecked, deleted.** Wrote verbatim the
two lines build.md §10 tells step 6 to write. `pnpm typecheck` → **exit 0, no errors.**
**See R2.**

**On the box, read-only** (`cat`, `ls`, `ss -ltn`, `systemctl --version`, one
`varlinkctl introspect`). Nothing written, no `LoadUnit`, no mutating method, no
`/v1/chat/completions`. Independently confirmed `ENABLED=yes`, `uname -r` =
`7.0.0-30-generic`, `/etc/ufw/user.rules` is `Permission denied` to `yorman`, and nothing is
listening on 8090.

---

## 1. The four load-bearing calls

### F1 — REAL, HIGH. The bound structure is wrong, and the adversarial's own suggested fix does not fix it

**Confirmed by reading.** `collectServing` opens one `deadline(timeoutMs, 4000)` and spends
it on the `readDir`, every env `readFile`, and both HTTP probes of every instance
(`serving.ts:229,234,247,248`). `probe`'s catch maps *any* rejection — including
`deadline`'s own `overdue()` — to `health: 'unreachable'`, which `severityHealth` bands
**alarm** (`severity.ts:410`).

#### The proposed cheap fix is wrong, and its own measurement says so

The adversarial offers two resolutions and calls the second "the smaller change": make
`deadline()` distinguish *rejected without being started* from *started and timed out*.
**That discriminator does not cover case A2.** Trace it: the `readDir` consumes 95 ms of
100; `readEnv`'s `readFile` starts with ~5 ms left and (being a fake) resolves; `probe`
then calls `within(() => http.get(...))` with `left` still ≈ 5 ms, so **`left > 0` and the
request is started** — which is exactly why the adversarial's own log line reads
`A2 http calls actually made: ["…:8080/health","…:8081/health"]`. Both probes were started
and killed 5 ms in. A "not started" flag would classify both as *started and timed out* and
report `unreachable` again.

The discriminator that actually matters is not *started vs not started*. It is **whose
budget ran out.** A probe that gets its own full bound and exceeds it is `unreachable` and
§3.7 says so in as many words ("connection refused, reset, **or timed out**"). A probe
truncated by a budget something else spent is not evidence about the server at all.

#### The bound structure I rule for

`collectServing` takes **two budgets, and one of them is minted per instance**:

| budget | covers | default | a failure means |
|---|---|---|---|
| `discoveryTimeoutMs` | the `readDir` and every env `readFile` | 2000 | `port`/`ctx` `null` + `llama-env` entry — and therefore `health: null` down the **existing** `env.port === null` path |
| `probeTimeoutMs` | **one instance's** `/health` then `/v1/models`, minted fresh inside `instances.map` | 4000 | `health: 'unreachable'` + `llama-health` entry — correct, and §3.7 names it |

Three properties fall out, and none of them is a value someone has to remember to return:

1. **The pathological mapping becomes unreachable** rather than caught. No new `health`
   value, no new branch in `probe`, no change to `deadline.ts`.
2. **The discovery path already does the right thing.** The adversarial's case A2b — the
   listing itself outruns the budget → `serving: null`, one `llama-env` entry, zero HTTP
   calls — is already correct, and stays correct.
3. `serving.test.ts:569` (`⚠ a server that answers nothing is bounded, not a hang`) **stays
   valid and stays green**: a wedged `HttpIo` against a per-instance budget times out on its
   own budget, so `unreachable` and `source === 'llama-health'` are both right there. The
   test only enshrines the bug under the *current* structure.

Cost: the collector's wall-clock ceiling becomes `discovery + max(per-instance)` = 6 s
rather than 4 s, because discovery is necessarily sequenced before the probes. That is a
ceiling, not a cost — it is reached only when both halves wedge — and the aggregate poll
deadline is step 6's item on HANDOVER §8. Say it in the notes; do not shrink the probe
budget to hide it, because 4 s is the one number here derived from a measurement (a 14 s
cold prefill answers `/health` from the same thread).

#### On `health: null` — confirmed, with a qualification

**Yes, `health: null` is the right value for a probe that was not performed**, and
HANDOVER's do-not-copy #4 is exactly on point. But note that under the structure above it is
never *minted by a budget* — it is minted only where §3.7 means it, by the existing
`env.port === null` guard. If reconciliation takes the cheaper path (keep one budget, map
its exhaustion to `health: null`), that is **not wrong**, but it leaves the property below
still incidental, and it needs a new mint site plus an entry whose message names the budget
rather than the URL. I prefer the structural fix; the cheap one is acceptable if the notes
say which property it does not buy.

#### §6.5's "the other instance is unaffected" — yes, structural, not incidental

The parent asks whether this must be a structural property. **It must.**

- Today it holds only because `Promise.all` runs the instances concurrently. That is a
  scheduling choice, not a guarantee. Replace it with a sequential loop — a plausible
  refactor for "do not open N sockets at once against a box whose thermal margin is the
  thing being watched" — and instance 0 wedged blanks instances 1..N with no test failing.
- §6.5 lists this among "the normal operating states of this machine, **not** edge cases",
  and the state it describes is precisely the one that breaks it: an instance being *down*
  is what makes its probe expensive.
- Per-instance budgets make the property hold under any scheduling, which is what "the other
  instance is unaffected" has to mean if it is a promise rather than an observation.

**Spec wording — §6.5, replacing the `llama-server` row:**

> | An `llama-server` instance is down | Its row shows the unit state and the reason; **the other instance is unaffected, and that is a structural requirement, not an observation about the current scheduling.** No instance's probe may spend another's budget, and no collector-wide bound may blank a per-instance verdict. Concurrency alone does not deliver this — it holds only for the ordering the collector happens to use today |

---

### F2 — REAL, HIGH, and **wider than reported**. See R1

Confirmed at `http.ts:120`: a bare `setTimeout(…, timeoutMs)` that never calls
`boundedTimeoutMs`, fed the caller's raw option by `serving.ts:161,177` while
`deadline(timeoutMs, SERVING_TIMEOUT_MS)` sanitises the same number. Grep across `lib/`
confirms `boundedTimeoutMs` is called from exactly one place: `deadline.ts:89`.

**The fix**, in three parts, and the third is the one that stops a fourth instance:

1. `http.ts` gains a module default (`HTTP_TIMEOUT_MS`, and the value is a step-5 choice to
   fold into S10) and computes `const bound = boundedTimeoutMs(timeoutMs, HTTP_TIMEOUT_MS)`
   once, using it for **both** the `setTimeout` delay and the message. That also kills the
   `timed out after Infinity ms` message, which is the same lie the bound is.
2. `io.ts` gets the identical treatment against `NVIDIA_SMI_TIMEOUT_MS` — **R1**.
3. The structural guard below.

`serving.test.ts:628` must be repointed at something that can see the number: either the
real `nodeHttp` against a loopback server (which `http.test.ts` already stands up) or an
`HttpIo` fake that **records** the `timeoutMs` it was handed. And two mutations are owed —
one per `setTimeout` delay — so the ledger stops being silent about both sites.

#### Why the guard rule did not prevent it

It did not prevent it because **no guard rule in this project is about call sites.** The
full answer is §4; the short version is that both existing rules take as input a thing
somebody already wrote down (a ⚠-marked test; a comparison a mutation aims at), and a
missing call is neither.

---

### F4 — REAL, MEDIUM, and the build chose the losing side. Exact wording below

**Adjudicated against the facts, not between the two phases.** The adversarial verified on
the live bus that `GetUnit` answers `org.freedesktop.systemd1.NoSuchUnit` where
`systemctl show` prints `inactive`, and that `systemctl` prints it only because it calls
the mutating `LoadUnit`. I confirmed the template
`/etc/systemd/system/llama-server@.service` exists on disk (`-rw-r--r-- 1 root root 1491`),
so this is genuinely the installed-but-not-loaded case. `severityUnitState(null)` returns
`null` (`severity.ts:450`) and §6.3's "Any unit" row has no `null` column, so the cell is
uncoloured.

The build's caution — *"reporting `inactive` would infer an alarm-severity claim from an
answer that says I have no record of this unit"* — has an answer neither phase made, and it
is decisive:

> **This dashboard never asks about a unit speculatively.** It asks about
> `gpu-fan-control.service`, which §3.6 names, and about exactly one unit per `<i>.env` the
> box's own configuration declares. "systemd has no record of it" about a unit this box
> declares *is itself the finding*. There is no route by which a healthy configuration
> produces `NoSuchUnit`.

Add the adversarial's point, which is also right: an unloaded unit has no `ActiveState`
because it has no object, not because its state is unknown; `LoadUnit` materialises the
object and the state it then reports is the state that was already true. So `inactive` is a
definition, not an inference.

**Ruling: `NoSuchUnit` → `inactive`, with a `dbus` entry naming the reply. `null` is
reserved for "the state could not be read".** This keeps §3.7's vocabulary closed at six,
matches what `systemctl` prints, and un-hides the case the SAFETY row exists for. The cost
is that "unit file absent" and "unit file present, never loaded" both read `inactive`; both
mean *not running*, which is what the row asks, and the difference belongs in the message.

`Manager.GetUnitFileState` (the adversarial's third option) becomes **optional message
enrichment**, not a discriminator the contract needs — and before anyone uses it, its
read-only-ness must be established on the box the same way `GetUnit`'s was, rather than
assumed from its name.

#### Exact §3.7 wording — append to the `unitState` block, after the six-value table

> **A unit systemd has not loaded reads `inactive`, not `null`.** The dashboard reads
> `ActiveState` over the read-only `Manager.GetUnit`. `systemctl show` uses
> `Manager.LoadUnit`, which *loads* the unit as a side effect and is therefore closed to
> this project by decision 3. For a unit that exists but has never been loaded —
> `gpu-fan-control.service` on a box where it was installed and left disabled, which is this
> box's documented state from 2026-08-15 to 2026-08-27, or `llama-server@2.service` for a
> `2.env` nobody enabled — `GetUnit` answers `org.freedesktop.systemd1.NoSuchUnit` where
> `LoadUnit` would answer `inactive`. **Report `inactive`, and carry a `dbus` entry naming
> the unit and the `NoSuchUnit` reply.**
>
> This is not inferring a state from an absence. An unloaded unit has no `ActiveState`
> because it has no object; `inactive` is the state that loading it would report, and
> loading is what creates the object, not what sets the state. And the dashboard never asks
> speculatively — it asks about `gpu-fan-control.service` and about one unit per discovered
> `<i>.env` — so "systemd has no record of this unit" about a unit this box's own
> configuration declares is itself the news. A unit file that is absent altogether reads
> `inactive` too: both mean *not running*, which is the question the row asks, and the
> difference belongs in the entry. `Manager.GetUnitFileState` is read-only and can name
> which of the two it was, if a later step wants the message sharper.
>
> **`unitState: null` means the state could not be read, and nothing else.** The only routes
> to it are: the bus socket was unreachable, the conversation failed or was cut short by its
> bound, the reply was not a D-Bus message, or `ActiveState` came back as a seventh value
> outside these six. It carries **no severity** (§6.3), renders `—`, and always has a `dbus`
> entry beside it. **A unit that is not running is never `null`.**

#### Exact §6.3 wording — replace the "Any unit" row and add the note beneath the table

> | Any unit | `active`, `reloading` | `activating`, `deactivating` | `failed`, `inactive` — **including a unit systemd has not loaded, which reads `inactive` (§3.7)** | All six `ActiveState` values mapped in §3.7. `null` is **not a band**: it means the state could not be read, carries no severity, and always has a `dbus` entry |

> **⚠ `null` on a unit row is "could not ask", never "not running".** §3.7 fixes the four
> routes to it, and none of them is a unit that exists and is stopped. Without that rule the
> SAFETY panel's *"Fan service active"* row renders an **uncoloured em dash** for a
> `gpu-fan-control.service` that was installed and never started — the box's own state for
> twelve days in August — and §6.2's *"the panel that earns the dashboard's existence"* says
> nothing about the one thing it exists to say. The same rule keeps a third card whose
> `2.env` exists but whose unit was never enabled from rendering a colourless row instead of
> the alarm it is.

---

### F3 — REAL, MEDIUM. Take it; one check at the top of `decodeMessage` covers all three sites

Confirmed by reading `dbus-wire.ts:377–382`: `bodyLength` and `fieldsLength` are raw
uint32s, `byteLength = alignUp(16 + fieldsLength, 8) + bodyLength`, and the only
consequence of a huge value is `bytes.length < byteLength → incomplete` — which
`Conversation.message()` answers by pulling more bytes until the deadline. The entry then
says "timed out" about a peer that answered in 1 ms, which is verbatim the failure the
module's own doc says the `incomplete`/`malformed` split exists to prevent.

Place the ceiling **before** the `bytes.length < byteLength` test, and use the protocol's
own limits rather than an invented one: a D-Bus message is capped at 2²⁷ bytes and the
header field array at 2²⁶. A single check there also closes the two sites the adversarial
lists separately — `Reader.string()`'s 4-billion-byte length and `Reader.signature()`'s
255-byte one both reach `need()` only after `decodeMessage` has already returned
`malformed`, and the body reader is constructed on `bytes.subarray(0, byteLength)`. No
legitimate systemd reply can exceed either limit; the specification forbids it.

Both sides of the new boundary need a fixture (a frame exactly at 2²⁷ and one a byte over)
and a mutation, per HANDOVER §5.1 — the two sides differ at a panel, since one is a decoded
message and the other is a 2 s blank.

---

## 2. The rest of the adversarial's list

| # | Verdict |
|---|---|
| **F5** | **Real. Take.** §2.2's nine rows contain no `/etc/llama-server`; row given in §3 below |
| **F6** | **Real, and sharper than stated. Take the doc half, take one fixture.** The finding is not "add quote stripping" — the two `KEY=VALUE` grammars *should* differ, because systemd's `EnvironmentFile` and a shell-sourced `ufw.conf` are different languages. The defect is that `parseUfwConf`'s own doc claims the shell reading (*"`ufw` sources this file as shell, so a second `ENABLED=` line is what the tool itself would obey"*) and then implements a stricter subset, so all four missed forms — `ENABLED="no"`, `'no'`, `no # comment`, `export ENABLED=no` — are forms shell honours and `ufw` obeys. **Same class as the `probeFailure` doc comment the build caught itself.** Either implement the subset the doc names or narrow the doc to *"the exact form `ufw` itself writes, and nothing else"*. `ENABLED="no"` deserves a fixture either way. Direction is safe (every miss lands on watch), so SHOULD, not MUST |
| **F7** | **Real. Take, and the fix restores an existing rule.** The project's own convention is *"the wrapper prefixes the path; parsers hold no literal paths"*. `nodeHttp` breaks it at a new seam by prefixing `${url}` into the two messages it constructs itself. Drop the prefix from those two; Node's own connection errors keep theirs and `probeFailure` supplies the rest |
| **F8** | **Real, correctly classed irreducible — but cheaply fixable, so fix it.** `expect((totalGB ?? 0) * BYTES_PER_GB).toBe(249792131072)` cancels the divisor. Assert `totalGB` against the literal `232.63…` instead. The ⚠ marker and the name both claim a divisor-sensitive property; the neighbouring `df -h` test genuinely has it |
| **F9** | **Real. MUST, and it is one finding with F2, not two.** The test is not ⚠-marked, so the ledger never asked for it; ⚠-marking it would have demanded a mutation, and the only mutation that could redden it lives at the site F2 says is missing. Fix together |
| **F10** | **Real, and I decline the code change.** Take the doc fix only. The docstring claims a populated tree and the code proves a name in the parent listing; narrow the docstring. Adding a `readDir` of `<libModules>/<release>` buys a case that is unreachable in practice — a *running* kernel's module tree is populated by the distribution, and the mount-typo scenario the check exists for already fails at step 1 with an empty or unreadable `/lib/modules`. This is HANDOVER §5.1's second half applied to a check rather than a fixture: **the two sides are not distinguishable at a panel in any reachable state**, so the extra read buys bookkeeping and one more failure mode |
| **F11** | **Real, trivial. Take.** `data: [null]` should say "`data[0]` is not an object", not "`data` is empty" |

**Nothing in the list justifies redoing the step**, and I agree with the adversarial that F1
and F2 are the two that put an alarm-severity value on a healthy machine.

---

## 3. Consolidated spec gaps — Take / Decline

### ⚠ First: HANDOVER §8's "raised and not yet answered" table is stale

I checked every entry against the current `SPEC.md`. **Twelve of the thirteen are answered.**
Step 6 reading HANDOVER as fact would re-raise settled questions and, worse, keep
implementing conservatively around gaps the owner has already closed.

| # | Where it is now answered |
|---|---|
| S1 | §6.6 line 920 — the TCP port row exists |
| S3 | §6.4 lines 856, 875 — `unit`'s subject is the unit name; the join key is derived from the index |
| S4 | §6.3 line 747 — "unconditional … **and including when the duty is unreadable**" |
| S5 | §6.2 line 689 — "The count is omitted when it is zero (§9)" |
| G1 | §3.1 lines 252–263 — "**An `AbortSignal` alone is not sufficient either**", with the four things the deadline must do |
| C1 | §6.6 line 921 and §6.7 line 957 — the mode is undetermined, the cell reads `unavailable` |
| C2 | §3.3 line 362 — "**ONE 2 s budget, measured on a MONOTONIC clock**" (for `dell_smm`; the general rule is S10) |
| C3 | §3.7 lines 434–442 — both the junk-text and the `ENOENT`-after-listing rows |
| C4 | §3.7 line 444 — `pwm5Present: false` carries an entry and it persists |
| C5 | §3.3 line 369 — `-0` is a stopped fan; `-1` and below is `null` with no entry |
| G5 | §6.3 line 745 — "an em dash on channels 1–4 always has an `errors[]` entry behind it" |
| G6 | §6.4 lines 857, 869 — `fan_stopped:3`, bare integers, one `STANDING` namespace |

**Only S10 is genuinely still open** — and §3.3's new sentence is now the worked example to
generalise from.

### TAKE

| # | Section | The edit, in one line |
|---|---|---|
| **F5** | §2.2 | Add the missing bind mount — row below |
| **S6** | §1 d.20, §3.5, §6.6 | The disk unit is **GiB**, not GB; the value `1024³` is right and the label is wrong — sites below |
| **S7** | §3.5 | State `total = blocks × bsize`, `used = (blocks − bfree) × bsize`; `bavail` is deliberately not used |
| **S9** | §3.7, §6.3 | `NoSuchUnit` reads `inactive`; `unitState: null` means only "could not read" — full wording in §1 |
| **S10** | §6.7 | One rule for every collector that leaves the process — wording below |
| **S12** | §1 d.22, §2.1, §6.3, §6.4, §7.3, §8.4 | ufw now enforces; the risk has **reversed** — wording below |
| **S13** | §3.4 | `01.env` / `+1.env` are rejected, not read as instance 1 — state it, since §6.4's bare-integer subject is what forces it |
| **F5b** | §3.4 | Either implement "or the unit's env" or strike it; only the file is read, and on this box the unit's `EnvironmentFile` *is* that file |

**F5's row for §2.2** — insert between `systemd unit state` and `ufw enforcement`, since both
serve §3.4:

> | Serving instances | `-v /etc/llama-server:/etc/llama-server:ro` | §3.4 enumerates `<i>.env` for `PORT=` and `CTX=`. Without it every poll yields `serving: null` plus one `llama-env` entry, and the SERVING panel reads *"could not enumerate instances"* on a perfectly healthy box — a failure step 12 would find, four steps after step 11 wrote the `docker run` line from this table |

**S6 — confirmed numerically, and here is every place that changes.** `/` is
60984407 × 4096 = 249,792,131,072 B: ÷1024³ = **232.63**, ÷10⁹ = 249.79, and `df -h` prints
**233G**. `/home` is 240,075,268 × 4096 = 983,348,297,728 B: 915.8 vs 983.3, `df -h` prints
**916G**. The code is right; the label is wrong.

1. **§1, decision 20** — "VRAM MiB, RAM GiB, disk **GB**, net MB/s" → **`disk GiB`**.
2. **§6.6, the Disk row** — unit column `GB` → **`GiB`**; keep "Checks against `df -h`"; add
   *"powers of 1024, which is what `df -h` and `lsblk` print"*.
3. **§3.5, both rows** — "238.5 GB NVMe" and "931.5 GB Crucial" are `lsblk`'s **device**
   sizes in GiB, and neither is the figure `statvfs` returns. Replace with *"the 232.6 GiB
   root filesystem on the 238.5 GiB NVMe"* and *"the 915.8 GiB `/home` filesystem on the
   931.5 GiB Crucial"*. Conflating a device with a filesystem is how a correct reading gets
   called wrong.
4. **§6.3, the Disk-free row** — **no change**, and say so: it is `freePercent`, a ratio, and
   the divisor cancels. The adversarial and the build both say this and both are right.
5. **Code consequence, and it is not free.** `Filesystem.usedGB`/`totalGB`, the brand
   `GB`/`gb()`, `formatGB`, and `BYTES_PER_GB` all keep a name that says one thing while the
   value is another — the exact defect this project keeps chasing, expressed as an
   identifier. **98 occurrences across 10 files** (`types.ts`, `format.ts`, `fixtures.ts`,
   `statvfs.ts`, `collectors/index.ts`, plus five test files). My ruling: **rename
   `BYTES_PER_GB` → `BYTES_PER_GIB` now** (one source file, one test, one mutation anchor —
   it removes the lie at its source, and its own doc currently reads *"⚠ `1024³`, despite the
   name"*), and **defer the brand/field rename to step 9**, which is the first step that
   renders the label and the last cheap moment to do it. Do not leave `usedGB` holding GiB
   silently in either case.

**S10 — the one rule, for §6.7.** This sentence subsumes F1, F4, the ufw/dkms `false` rule
and step 4's `pwm5` rule, so it is worth the space:

> **A collector's budget bounds the collector's wall clock; it is never evidence about a
> subject.** Any per-subject verdict a collector could not afford to obtain is `null` — *not
> read this cycle* — and its `errors[]` entry names the budget rather than the subject. A
> verdict of *failure* — `unreachable`, `false`, `inactive` — may be minted only from an
> answer, or from a bound that applied to that subject and to nothing else. Every collector
> that leaves the process carries one monotonic budget, stated here per source:
> `nvidia-smi` 4 s (§3.1), the whole `dell_smm` probe 2 s (§3.3), the D-Bus conversation
> 2 s, both `statvfs` calls 2 s, the two safety file reads 2 s, `/etc/llama-server`
> discovery 2 s, and **each instance's** `/health` + `/v1/models` 4 s — the last is larger
> because it is the only probe against a process under load, and a cold prefill on this box
> measures 14 s.

**S12 — the spec's ufw facts have not merely gone stale, the risk has reversed.** I re-read
`/etc/ufw/ufw.conf` on the box today: `ENABLED=yes`. SSH works. Five replacements plus one
new obligation:

- **§2.1, the "Consequence to write down" paragraph:**

  > Consequence to write down, and it has **reversed** since this spec was drafted:
  > `/etc/ufw/ufw.conf` now reads `ENABLED=yes` (verified 2026-09-06, and SSH survived), so
  > ufw *is* enforcing. The risk is no longer that 8090 is silently open — it is that
  > **8090 is silently unreachable.** `--network host` puts the listener on `INPUT`, where a
  > firewall with no rule for it drops the connection, and the container will start, bind,
  > log nothing and answer nobody. Note also the limit of what the dashboard can say about
  > this: `ufw.conf` is world-readable and `/etc/ufw/user.rules` is root-only, so the SAFETY
  > row answers *"is the firewall on"* and never *"is this port allowed"*. It reports the
  > box's posture — which is what 8080/8081 need — not its own reachability, and a dashboard
  > you can load is already evidence of the latter.

- **§6.3, the ufw row:**

  > | ufw enforcing | `yes` | `null` — `ufw.conf` unreadable | `no` | Alarm severity. **`no` is not this box's state today** — `ufw.conf` reads `ENABLED=yes` as of 2026-09-06 — so this row bands normal and §6.4's standing machinery has no live subject. It is *displayed* at watch if and only if `ufw_enforcing` is declared in `STANDING`. `null` is watch, matching `pwm5Present` — both are three-valued safety checks and must behave alike. ⚠ The check reads `ENABLED=` only; `user.rules` is root-only, so `yes` means the firewall is on and says nothing about which ports it allows |

- **§6.4, the standing-conditions paragraph** (replacing *"`ufw enforcing = no` is exactly
  this today: true, serious, and unchanged since 2026-09-04"*):

  > The archetype is `ufw enforcing = no`, which was exactly this between 2026-09-04 and
  > 2026-09-06: true, serious, and unchanged. **It no longer holds, so this mechanism
  > currently has no live subject.** That is worth stating rather than leaving as a stale
  > example: steps 8 and 10 implement `STANDING` — the ledger, the suppression, the
  > once-per-session log, and the "returns to full alarm the moment it changes" rule —
  > against a condition that does not presently occur. They must be proved by fixture
  > (`UFW_CONF_DISABLED` exists for this) and cannot be confirmed against the running box.

- **§1, decision 22:**

  > | 22 | Standing conditions | Declared in `/etc/ai-dashboard.env`. **None is live today** — `ufw` was the only candidate and it now reads `ENABLED=yes`. The mechanism ships with `ufw_enforcing` as its documented example and no current subject |

- **§7, risk 3:**

  > 3. **ufw is enforcing, and 8090 has no rule yet.** `ENABLED=yes` as of 2026-09-06, so
  >    the exposure this entry originally recorded is closed. The live risk is its mirror
  >    image: the dashboard binds 8090 in the host namespace and is **unreachable from the
  >    LAN until an allow rule exists** (§2.1). Add it from a session that stays open, and
  >    run `sudo ufw show added` first — `ufw enable` without a port-22 rule is what took
  >    this box off the network on 2026-09-04, and `show added` lists rules without
  >    activating anything.

- **§8, item 4 — the new obligation the parent asked me to note:**

  > 4. **Verification on a real boot** — check the ordering cycle, **add and confirm the ufw
  >    rule for 8090** (`sudo ufw allow from 192.168.4.0/22 to any port 8090 proto tcp`,
  >    then `sudo ufw status numbered`), confirm the container survives a reboot and a
  >    `docker` restart. Without the rule the container comes up healthy and answers nobody,
  >    which looks exactly like a broken build.

### DECLINE

| # | Why |
|---|---|
| **S8** — multi-model `model` | The contract holds one `model` and `serve-llm.sh` has no route to more than one per port. `data[0]` plus an `llama-models` entry is right. **Do not widen the contract for a state this box cannot reach**; the entry is the honest report. Note it in §3.4 as a known truncation and move on |
| **S11** — no entry for a blank `model` when health ≠ ok | Agree with the build. The read was not attempted and the `health` cell in the same row carries the explanation *in colour*. An entry per non-ok instance per poll is one line every five seconds restating a coloured cell. **But it is the same question as step 4's G5 and it should be answered once, for both**: §6.5's "an em dash always has an entry behind it" needs a stated exception for a figure whose blank is fully explained by a coloured neighbour in the same row |
| **F10**'s code change | Above — the two sides are indistinguishable at a panel in any reachable state |
| **F6**'s "one shared `KEY=VALUE` parser" | The two grammars genuinely differ (systemd's `EnvironmentFile` has no `export` and no trailing comment; shell has both). A shared parser would be wrong for one of them. Fix the doc, not the sharing |

---

## 4. My own findings

### R1 (HIGH) — `io.ts` has F2's defect too, so the class is 0-for-2 and closing `http.ts` alone leaves it open

**Measured** (experiment 1, reverted). `io.ts:191` is a bare `setTimeout(…, timeoutMs)` with
no `boundedTimeoutMs`, exactly like `http.ts:120`. `collectGpus({ timeoutMs: Infinity })`
produced `TimeoutOverflowWarning … Timeout duration was set to 1`, `gpus: null`, and the
entry `"/bin/sleep: timed out after Infinity ms"` at 4 ms, while the 400 ms control reached
the command at 2 ms.

This reframes F2. It is **not** "step 5 copied a forbidden pattern from step 4". It is: the
pattern was in the seam layer from step 3, `deadline.ts` was hoisted in step 4 to fix the
*collector* sites and nobody went back to the seams, and step 5 added a second instance of
the untouched original. `grep` across `lib/` finds `boundedTimeoutMs` called from exactly
one place. Consequence for reconciliation: **fix both files in one change, or the next
seam repeats it.**

The two are not equally damaging — `io.ts`'s 1 ms clamp yields `gpus: null` (a blank, with
an entry), while `http.ts`'s yields `health: 'unreachable'` (an alarm on a working server) —
but they are the same site-shaped hole, and only the structural check in §5 sees both.

### R2 (HIGH) — build.md §10's assembly instruction leaks `errors` onto the wire, and `tsc` does not object

**Measured** (experiment 2, reverted): the two lines build.md §10 tells step 6 to write —

```ts
const storage: Storage = { ...await collectStorage(), net };
const safety:  Safety  = { ...await collectSafety(),  pwm5Present };
```

— **typecheck at exit 0**. TypeScript's excess-property check does not fire through a
spread, so both objects carry the collector's `errors` array into the snapshot. §4 shows
three keys under `storage` and four under `safety`, and the top-level `errors[]` already
carries the same entries. `contract.test.ts`'s key census runs over `lib/fixtures.ts`
values, not over a step-6 assembly, so nothing today would catch it.

This is step 5's shape, not step 6's mistake waiting to happen: **steps 3 and 4 returned a
named value field** (`{ gpus, errors }`, `{ cooling, pwm5Present, errors }`) so a spread was
never the composition. Step 5 flattened `StorageCollection` and `SafetyCollection` and then
wrote the spread down as the instruction.

Fix, cheapest first:

1. **Correct build.md §10 and HANDOVER** to destructure:
   `const { root, home } = await collectStorage(); const storage: Storage = { root, home, net };`
   — one line, and the hazard is gone.
2. **Step 6 owns a key census over the assembled snapshot**, not only over the fixtures.
   That is the mechanical half, and it belongs in step 6's scope.

### R3 (MEDIUM) — `nodeDbus.connect` is the only bounded seam with no self-destruct

`io.ts` aborts, destroys both pipes and `unref()`s the child. `nodeHttp` destroys its `req`
at its own timer. **`nodeDbus.connect` creates the socket inside a promise the deadline
abandons and nothing ever calls `destroy()`** (`dbus.ts:215–223`; the `finally { stream.close() }`
at `:458` only runs once a stream *exists*, and the failure path at `:394` returns without
one). In the exact case the bound exists for — a socket path that exists but whose peer
never accepts — the handle stays open for the life of the process, one per poll per tab.

build.md §10 says *"`nodeHttp` and `nodeDbus` both abandon their work at the bound"*, which
understates the asymmetry: `nodeHttp` abandons and then cleans up; `nodeDbus` only abandons.
Either give `connect` its own `boundedTimeoutMs` timer that calls `socket.destroy()`, or
state plainly in HANDOVER that O18's in-flight cache is the *only* thing standing between a
wedged bus and unbounded socket accumulation.

### R4 (MEDIUM) — HANDOVER §8's spec-gap table is stale

Twelve of thirteen answered; table in §3 above. Reconciliation must rewrite it, or step 6
inherits thirteen open questions of which one is real.

### R5 (LOW-MED) — `DBUS_TIMEOUT_MS` is never the D-Bus budget in production, and one `timeoutMs` means three things

Both callers pass their own number straight through: `collectServing` gives the conversation
**4000** (`serving.ts:244`) and `collectSafety` gives it 2000 (`safety.ts:196`). So
`DBUS_TIMEOUT_MS`'s doc argues at length for 2 s *"because a local socket that outlasts a
process spawn is already pathological"* and then serving hands it 4 s. The constant is live
only as a fallback.

More generally, `collectServing`'s single `timeoutMs` option sets **three** different
bounds: the collector's shared deadline, the D-Bus conversation's independent deadline, and
the per-request HTTP bound. A step-6 caller writing `timeoutMs: 3000` to tighten one
tightens all three, including the one it did not know existed. F1's fix should split them by
name; if it does not, the overloading must be documented at the option.

### R6 (LOW) — two facts in `lib/types.ts` are now false, and HANDOVER §7 says that file must not misinform

- `types.ts:578` — `ufwEnforcing`'s doc: *"Currently `no` on this box."* It reads
  `ENABLED=yes`. HANDOVER §7 is explicit that `types.ts` *"describes; it does not direct — a
  wrong descriptive comment misinforms"*. Same family as S12, and not on the build's list.
- `types.ts:556,558` — *"`/` — the 238.5 GB NVMe"* and *"`/home` — the 931.5 GB Crucial"*.
  Both are GiB mislabelled (S6) **and** both are device sizes describing a `statvfs` reading
  of a filesystem (232.6 and 915.8 GiB).

### R7 (LOW) — `dbus-wire.ts`'s module doc claims a narrowness the file does not have

It says *"~250 lines of pure functions"* (it is **458**) and *"as much of it as §2.2's one
requirement needs and no more"*. Nine of `basic()`'s fourteen branches — `y b n q i h x t d`
— are unreachable for the three calls this client makes; only `u s o g v` occur.

**The generality is defensible and I am not asking for its removal:** a header field
carrying an unexpected basic type would otherwise throw `Malformed`, which aborts the whole
conversation and blanks every unit rather than one field. That is a good reason and the doc
should give it, instead of claiming a minimality the code does not have. Note also that
these nine branches are the second instance of HANDOVER §6's do-not-copy #8 (tested,
exported, unreachable) after `parseKernelRelease` — *"one hedge is a hedge; three are
drift"*. Two, with reasons, is still fine; a third needs a rule.

### R8 (note, not a defect) — a fourth D-Bus route exists and was never considered

I confirmed on the box, read-only: systemd **259**, `/run/systemd/io.systemd.Manager` present
and mode `srw-rw-rw-`, and `varlinkctl introspect` shows an `io.systemd.Unit` interface.
Varlink is line-delimited JSON; it would replace ~920 lines of hand-written wire codec
(`dbus-wire.ts` 458 + `dbus.ts` 462, plus 801 lines of test) with a socket and
`JSON.parse`.

**This is recorded so the choice is a decision rather than an omission, and I am explicitly
not recommending it.** §2.2 names the D-Bus socket as the mount; the codec is written,
tested and validated frame-by-frame against the live bus; and I have **not** verified that
varlink answers `ActiveState` for an unloaded unit any better than `GetUnit` does — it may
have the identical `NoSuchUnit` problem. Switching transports at step 5's close would trade
a proven thing for an unproven one. Revisit only if the codec becomes a maintenance burden.

---

## 5. Judging the step as a unit

**Nine modules for seven sources — weight, not ceremony.** The shape is the one steps 3 and
4 established, applied three times: pure parser + injectable seam + IO wrapper
(`llama`/`http`+`dbus`/`serving`; `statvfs`/`storage`; `safety-checks`/`safety`). Two
deviations, and both are *good* judgement rather than drift: `statvfs.ts` keeps the seam and
its 15-line pure `filesystemFrom` in one file where splitting would be ceremony, and
`safety-checks.ts` holds two unrelated pure functions rather than becoming `ufw.ts` +
`dkms.ts`.

**The three separate seams are correct and I verified the load-bearing reason.** `CollectorIo`
is implemented by object literals in every step-3 and step-4 fake, so widening it is a
structural-typing break that reddens ten unrelated tests. That argument holds.

**`dbus-wire.ts` is not a general codec, but it is not as narrow as it says.** See R7. The
proportion is startling — ~1720 of ~3600 new lines are D-Bus, for one string per unit — but
the alternatives were genuinely closed (§2.2 forbids `systemctl`; `node:24-slim` has no
systemd binary; a marshaller dependency is an order of magnitude more unexercised code) and
the fourth alternative (R8) was not visible from where the build stood. **Justified.**

**Step 6 composes without adapters — with one exception, and it is R2.** All four collectors
return contract types. `collectServing` yields `readonly ServingInstance[] | null` straight
into §4's `serving`. But the two flattened collections invite a spread that ships `errors`
onto the wire and typechecks clean. Destructure, and the property holds.

**Spec conformance: conformant on every field §3.4/§3.5/§3.6 names, with two exceptions and
one under-specification.**

- `health: 'unreachable'` is minted from a collector-budget failure (F1). §3.7 reserves it
  for facts about the subject.
- `unitState: null` for `NoSuchUnit` (F4). §3.7 never defines `null` for `unitState`, so the
  build assigned it a meaning the spec does not give it — and the meaning it assigned makes
  the SAFETY row uncoloured for the case the row exists for.
- §2.2 lacks the mount §3.4 requires (F5), and §3.4's "or the unit's env" half is
  unimplemented (harmless — it is an "or", and on this box the unit's `EnvironmentFile` *is*
  that file).

Everything else conforms and was independently attacked: `false` is never minted by a failed
read on either three-valued check, `null ≠ []` in both directions, every `errors[].source` is
one of the eighteen with no nineteenth needed, `-0` and out-of-range handling follow §6.7,
and §6.5's "one error per figure" is honoured (two `statvfs` entries, not one).

---

## 6. What must not leak into step 6

Step 6 owns snapshot assembly, the 2 s **in-flight-promise** cache, and `previous` across a
failed read. These collectors leave ten contracts implicit. Named in the order that would
hurt most.

1. **⚠ The aggregate poll deadline must NOT be one `deadline()` shared across collectors.**
   HANDOVER §8 lists it as step 6's open item, and the obvious implementation — one budget
   for the whole snapshot — **reproduces F1 at the route level**, where a slow `nvidia-smi`
   would blank SERVING and a slow `statvfs` would band an alarm on a healthy `llama-server`.
   Each collector keeps its own budget; the route's ceiling is a wrapper that returns the
   partial snapshot it has, never one that poisons a per-subject verdict. F1's lesson
   generalises exactly to the work step 6 is about to do, and it is the single most
   important line in this section.
2. **`errors` must be destructured, not spread, into `Storage` and `Safety`** (R2), and the
   assembled snapshot needs its own key census.
3. **These four collectors are stateless.** None holds `previous`; §6.7's "the collector owns
   `previous` across a failed read" is `collectHost`'s alone. Step 6 must not invent
   per-instance history: a `health` that was `ok` last poll and is `null` this poll renders
   `—`, never a stale `ok`.
4. **Two D-Bus connections per poll, and the second one *is* the O9 ownership statement.**
   `collectSafety` is the only reader of `gpu-fan-control.service`; `collectServing` opens
   its own and deliberately asks only about `llama-server@<i>`. If step 6 merges them to save
   a handshake, O9 is still satisfied (one *reading*) but the ownership rule has nowhere to
   live — it must move into the merged call explicitly, with the test that currently guards
   it moved too.
5. **`timeoutMs` is overloaded threefold in `collectServing`** (R5). Pass three budgets or
   accept that one number sets all three.
6. **`serving` order is numeric ascending and must not be re-sorted.** §6.2 renders one row
   per instance in the order `discoverInstances` produced.
7. **`serving: null` vs `[]` must survive the wire.** O10's "no `as TelemetrySnapshot`"
   applies with force here: a validator that coerces `null → []` turns *"could not enumerate
   instances"* into *"none configured"* on a box whose `/etc/llama-server` failed to mount.
8. **`health: null` is a legitimate value; `unitState: null` currently is not.** Until F4 is
   settled they must not be treated alike, and after F4 is settled `unitState: null` means
   only "could not read".
9. **O18's in-flight cache is currently the only thing bounding `nodeDbus`'s socket
   accumulation** (R3), and it now covers three seams, not one.
10. **`collectUnitStates` cannot be hoisted.** It has no default `units` by design, and the
    instance list only exists after `collectServing`'s discovery. Step 6 cannot pre-call it.

---

## 7. The guard rules are not 0-for-1. They are 0-for-1 on a class neither of them is about

The parent's framing is generous to me and I will not take it. Both rules did their jobs.

- **The ledger's input is ⚠-marked *tests*.** It proves each one can be reddened by some
  mutation. `http.ts:120` has no mutation among the 102 and no ⚠ test, so it never entered
  the ledger's input at all. **The ledger detects an inert test; it cannot detect an absent
  one.**
- **Fixture symmetry's input is a *comparison a parser already contains*.**
  `boundedTimeoutMs`'s `≤ 2³¹−1` boundary is fixtured on both sides, correctly, in
  `deadline.test.ts` — HANDOVER §5.1 even names it as the worked example. The rule cannot
  say *"and every seam that accepts a `timeoutMs` must route it through that function"*,
  because that is a statement about a call graph, not about a boundary.
- **F9 is not a third failure of the ledger; it is the same failure seen from the other
  side.** It is unmarked, so nothing asked for it; marking it ⚠ would have demanded a
  mutation, and the only mutation that could redden it lives at the site F2 says is missing.
  One hole, two symptoms.
- **F8 *is* the irreducible residue** and is correctly classified as such: a test whose name
  over-claims while its body is genuinely covered by a mutation, red for a real reason that
  is not the reason the name implies. HANDOVER §5.2 predicted exactly this and the only
  defence is reading each test against its own name, which the adversarial did.

So: **the mechanisable half was mechanisable, and the mechanism was missing.** The class is
*a call site that should exist and does not*, and the project already owns the right
instrument for it — `guardrails.test.ts`'s source-text assertions, which exist for precisely
this, and whose O8 test (`⚠ neither pwm5 projection calls the other`) carries the argument
verbatim: *"a **behaviour-preserving** coupling … passes the entire suite and every mutation
in step 4's harness."*

**The check to add** — a third rule, alongside the two:

> Under `lib/collectors/`, `setTimeout(` appears only in `deadline.ts`, `io.ts` and
> `http.ts`, and in the latter two the delay argument is the result of a
> `boundedTimeoutMs(…)` call.

Two rules must come with it, mirroring the ledger's own two:

1. **A failure means a new unvalidated bound was added, not that the allowlist needs
   extending.** Extending the allowlist is the exact analogue of "add a mutation until the
   ledger goes green" — which HANDOVER §1 already forbids.
2. **It is a necessary condition only.** It cannot see a bound that is validated and then
   used wrongly, and it cannot see the *next* structural hole, which will be a different
   shape. Keep reading each seam against its own doc comment; that half stays irreducible.

Generalising one step further, because this is the last collector step and the rule should
outlive it: the project now has three kinds of guard, and they catch three different things
— **the ledger** catches a test that cannot fail, **fixture symmetry** catches a boundary
tested from one side, and **the source-text guardrails** catch a call that should exist and
does not. Steps 6–12 should reach for the third whenever a rule is stated as prose in
HANDOVER's do-not-copy list, because that list is now 2-for-3 at preventing its own items.

---

## 8. Priority

### MUST — before step 6 wires any of this into a route

| | |
|---|---|
| **F1** | Split `collectServing`'s budget: one for discovery + env reads, one **minted per instance** for that instance's two probes. A budget exhaustion may not mint `unreachable`. **Reject the "rejected without being started" variant** — the adversarial's own case A2 started both probes |
| **F2 + R1** | Route both seam timers through `boundedTimeoutMs` — `http.ts:120` **and** `io.ts:191`. Fixing one leaves the class open |
| **F9** | Repoint `serving.test.ts:628` at something that can see the number (real `nodeHttp`, or a fake that records `timeoutMs`). Add one mutation per `setTimeout` delay |
| **§5's structural guard** | The `setTimeout` allowlist in `guardrails.test.ts`, with its two accompanying rules |
| **R2** | Correct build.md §10 and HANDOVER to destructure rather than spread. Step 6 adds a key census over the assembled snapshot |
| **F3** | The 2²⁷ / 2²⁶ ceiling at the top of `decodeMessage`, both sides fixtured, one mutation |
| **R4** | Rewrite HANDOVER §8's spec-gap table — twelve of thirteen are answered |
| **F4 / S9** | Owner decides. My recommendation and exact §3.7 / §6.3 wording are in §1; the code change (`NoSuchUnit` → `inactive` + entry) is small and its test is the SAFETY row going red |

### SHOULD — this step, cheap, and each removes a lie

- **F7** — drop `${url}: ` from the two messages `nodeHttp` constructs itself; the wrapper
  already prefixes. Restores the project's own path-prefixing rule at a new seam.
- **F6** — narrow `parseUfwConf`'s doc to the form it actually accepts, **or** implement the
  shell subset it names. Add an `ENABLED="no"` fixture either way.
- **F8** — assert `totalGB` against the literal, not against `× BYTES_PER_GB`.
- **F11** — `data: [null]` should say `data[0]` is not an object.
- **F10** — narrow the DKMS docstring to what the code proves. **No extra `readDir`.**
- **R3** — give `nodeDbus.connect` its own bounded `socket.destroy()`, or state in HANDOVER
  that O18 is the only thing holding it.
- **R5** — split `collectServing`'s three bounds by name (falls out of F1's fix), and make
  `DBUS_TIMEOUT_MS` either the real default or honestly a fallback.
- **R6** — correct `types.ts:556,558,578`.
- **R7** — correct `dbus-wire.ts`'s "~250 lines" and state the real reason the numeric
  branches are kept.
- **S6, partial** — rename `BYTES_PER_GB` → `BYTES_PER_GIB` now (one source, one test, one
  anchor). Its own doc currently reads *"⚠ `1024³`, despite the name"*.

### DEFER, to a named step

| Work | Step |
|---|---|
| The **brand and field rename** `GB`/`gb()`/`usedGB`/`totalGB`/`formatGB` → `GiB`, once the owner has taken S6 — 98 occurrences, 10 files | **9**, the first step that renders the label and the last cheap moment |
| The **aggregate poll deadline**, built as a per-collector ceiling and never as one shared budget (§6 item 1) | **6** |
| **Snapshot key census** over the assembled `storage` / `safety` (R2) | **6** |
| Deciding whether the two `collectUnitStates` calls merge, and where O9's ownership then lives (§6 item 4) | **6** |
| **`Manager.GetUnitFileState`** as message enrichment for F4 — and verifying its read-only-ness on the box before use | **12**, with the other on-box verification |
| The **8090 ufw allow rule**, added the 2026-09-04 way, and confirmed with `ufw status numbered` | **12** |
| §6.5's *"an em dash always has an entry behind it"* exception for a blank explained by a coloured neighbour — S11 **and** step 4's G5, answered once | owner, before **9** |

### EXPLICITLY NOT DOING

- **Not redoing the step.** Everything the adversarial attacked and could not break held,
  and the two high findings are localised.
- **Not adopting `deadline()`'s "rejected without being started" discriminator.** Measured
  not to cover the case it was proposed for.
- **Not adding the extra DKMS `readDir`** (F10). Unreachable in practice; buys bookkeeping
  and one more failure mode.
- **Not merging the two `KEY=VALUE` parsers** (F6). The grammars genuinely differ.
- **Not widening `ServingInstance.model` to a list** (S8). This box cannot reach the state.
- **Not moving D-Bus to varlink** (R8), despite the socket being present and the saving
  being ~920 lines. Recorded as a decision, not left as an omission.
- **Not removing `dbus-wire.ts`'s unreachable numeric branches** (R7). They stop one
  unexpected header field from aborting an entire conversation.
- **Not asserting `process.versions.node`** or anything else that would redden the suite
  today — green is this project's only signal, and HANDOVER §1 already settled it.
