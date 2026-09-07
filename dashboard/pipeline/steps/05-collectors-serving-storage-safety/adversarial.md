# Step 5 — adversarial phase: serving, storage and safety collectors

**Baseline reproduced before anything else was touched.**

```
pnpm verify                                                                 -> Test Files 24, Tests 1232, Type Errors no errors, exit=0
python3 pipeline/steps/02-format-severity/regressions.py                    -> exit 0, 40 mutations, all bite
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                -> exit 0, 64 mutations, all bite
python3 pipeline/steps/04-collector-cooling/regressions.py                  -> exit 0, 72 mutations, ledger clean
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py  -> exit 0, 102 mutations, ledger clean
   "Red-test ledger: 146 distinct failing tests across 102 mutations; 74 ⚠-marked tests checked."
```

Zero `ANCHOR NOT FOUND`, zero `DID NOT BITE` in any of the four. The build's claims in §8
are accurate.

**Experiments, all reverted.** Three temporary test files were created under
`lib/collectors/` (`zz-adv-live.test.ts`, `zz-adv-attack.test.ts`, `zz-adv-attack2.test.ts`),
run, and **deleted**. `git status --short` is back to `M .gitignore` / `?? dashboard/`, and
`ls lib/collectors/ | grep zz` is empty. **No source file was edited.** Logs live in the
session scratchpad, not in the repo. Everything on the box was read-only: `cat`, `ls`,
`df`, `curl` against `/health` and `/v1/models`, `python3 -c 'os.statvfs(...)'`,
`busctl call … GetUnit`, `gdbus call … GetUnit`, `dbus-send … GetUnit`, and an inline
`python3 -c` socket bridge. **`LoadUnit` was never called, no mutating method was called,
`/v1/chat/completions` was never touched, and nothing was written.**

---

## Part 1 — Confirmed by execution

### ⚠ F1 (HIGH) — a slow `/etc/llama-server` becomes an `unreachable` ALARM on healthy instances

`collectServing` puts the directory listing, every env-file read **and** every HTTP probe
inside **one** `deadline(4000)`. `probe`'s catch maps *any* rejection — including one
raised by the shared budget rather than by the socket — to `health: 'unreachable'`, which
`severityHealth` bands **alarm** (`lib/severity.ts:410`).

Measured (`zz-adv-attack2.test.ts`, case A2): a `readDir` of `/etc/llama-server` that takes
95 ms of a 100 ms budget, two env files that parse perfectly, and an HTTP fake that answers
every request in 20 ms:

```
A2 http calls actually made: ["…:8080/health","…:8081/health"]
A2 serving [{"instance":0,…,"health":"unreachable"},{"instance":1,…,"health":"unreachable"}]
A2 errors  [{"source":"llama-health","message":"http://127.0.0.1:8080/health: timed out after 100 ms"},
            {"source":"llama-health","message":"http://127.0.0.1:8081/health: timed out after 100 ms"}, …]
```

Two healthy `llama-server` instances are reported **unreachable**. Three separate rules break
at once:

1. **§6.5**: *"An `llama-server` instance is down … the other instance is unaffected."* Here
   neither is down and **both** are reported down, because a third thing was slow.
2. **§6.5's "matching an error to the figure it explains"**: both entries are filed against
   `llama-health`, blaming the servers. **Nothing anywhere names the slow directory** — the
   listing succeeded, so no `llama-env` entry is filed. The reader is pointed at the network.
3. **§3.7 already has the right value.** `health: null` is *"not probed this cycle"*, and
   HANDOVER's do-not-copy #4 is explicit: *"If an instance was not probed, say so because it
   was not probed."* A probe the collector could not afford is exactly that.

This is the same shape as the bug step 4 nearly shipped, moved one field over: an
alarm-severity value minted by a failed *collector* rather than by a failed *subject*. Step 4
resolved the analogous `dell_smm` case by blanking the readings to `null` with six entries —
it never invented a value that carries a colour.

The build's own boundedness test **enshrines the behaviour**: `serving.test.ts:569`
(`⚠ a server that answers nothing is bounded, not a hang`) asserts
`serving?.every((s) => s.health === 'unreachable')`. That is right when the *HTTP* is wedged
and wrong when the budget was spent on the filesystem, and the test cannot tell the two apart
because `deadline()` throws the same `overdue()` Error in both branches.

The `spent` latch added this step makes it *more* reachable, not less: after the first
timeout every later operation in that budget is rejected without being started, and each one
becomes another `unreachable`.

The good half, for contrast (case A2b): when the listing itself outruns the budget the result
is `serving: null` + one `llama-env` entry and **no HTTP calls at all** — correct.

**Suggested resolution** (reconciliation's call): either give the probes a budget of their
own so filesystem slowness cannot alarm a network row, or make `deadline()` distinguish
"rejected without being started" from "started and timed out" so `probe` can return
`health: null` for the former. The second is the smaller change and reuses a value the
contract already has.

---

### ⚠ F2 (HIGH) — `nodeHttp` hand-rolls a bound and does not validate it; `serving.ts` feeds it the raw option

`http.ts:120` is a bare `setTimeout(…, timeoutMs)`. It never calls `boundedTimeoutMs`.
`serving.ts:161` and `:177` pass the caller's `timeoutMs` **option** straight through
(`http.get(health, timeoutMs)`), while `deadline(timeoutMs, SERVING_TIMEOUT_MS)` sanitises
the same number. The two bounds therefore disagree silently.

Measured directly against `nodeHttp` and a real loopback server:

```
B timeoutMs Infinity   -> REJECTED  …timed out after Infinity ms      (Node: "Timeout duration was set to 1")
B timeoutMs NaN        -> REJECTED  …timed out after NaN ms           (TimeoutNaNWarning)
B timeoutMs 2147483648 -> REJECTED  …timed out after 2147483648 ms    (TimeoutOverflowWarning)
B timeoutMs -1         -> REJECTED  …timed out after -1 ms            (TimeoutNegativeWarning)
B control 2000 ms      -> resolved 200 {"data":[{"id":"live"}]}
```

End to end against a healthy server answering in 5 ms:

```
B2 timeoutMs=4000     -> [{…,"model":"qwen3.6-27b","health":"ok"}]            errors: none
B2 timeoutMs=Infinity -> [{…,"model":null,"health":"unreachable"}]
   errors: llama-health  "http://127.0.0.1:8080/health: http://127.0.0.1:8080/health: timed out after Infinity ms"
```

`timeoutMs: Infinity` — HANDOVER names it as *"the obvious way to write 'do not bound
this'"* — produces a **1 ms** bound and bands an **alarm** on a working instance, while the
deadline believes it has 4 s. This is do-not-copy #1 verbatim, in the one file that has no
test for it:

- `storage.test.ts:180` has `a nonsense timeout falls back to the module default rather than
  clamping to 1 ms`, and it is sound there because `collectStorage` never hands the number to
  its seam.
- `serving.test.ts:628` has the same-named test — see **F9**; it proves nothing, because the
  fake `HttpIo` ignores the argument.
- No mutation in the 102 touches `http.ts`'s `setTimeout` argument, so the ledger is silent.

Note also the doubled URL in the entry (**F7**).

---

### ⚠ F3 (MEDIUM) — the D-Bus decoder has no maximum message size, so a 16-byte lie is a 2 s hang

`decodeMessage` reads `bodyLength` and `fieldsLength` as raw uint32s and returns `incomplete`
whenever the buffer is shorter than their sum. There is no ceiling. D-Bus caps a message at
2²⁷ bytes (134217728); nothing checks it.

Measured against `collectUnitStates` with a scripted stream (`OK` then 16 bytes):

```
C2 huge-length rubbish -> [{"source":"dbus","message":"…: timed out after 400 ms"}]  after 401 ms
C2 non-dbus bytes      -> [{"source":"dbus","message":"…: not a D-Bus message: unknown endianness byte 0x48"}]  after 1 ms
```

That first line is precisely the failure the module's own doc says the two decode kinds exist
to prevent: *"the resulting `errors[]` entry would then say 'timed out' about a peer that
answered immediately with rubbish."* The peer answered in 1 ms; the entry says 2 s (400 ms
here) and blames the clock.

The ⚠ test `dbus.test.ts:433` — *"bytes that are not a D-Bus message fail fast rather than
waiting for the deadline"* — **does** assert `< 500 ms` against a 1500 ms budget, so it is
not an inert test. Its input is endian-invalid, which is caught at byte 0. The length-field
class of garbage is simply not covered, by any test or mutation.

A one-line ceiling (`byteLength > 2 ** 27 → malformed`) closes it. Two more callers of the
same shape are unbounded for the same reason: `Reader.string()` accepts a 4-billion-byte
length and `Reader.signature()` a 255-byte one, both reaching `need()` → `Incomplete`.

---

### ⚠ F4 (MEDIUM) — S9 is sharper than reported: a never-loaded unit is `—` with NO severity

**Verified against the live system bus on `ai-server`, read-only**, by driving the project's
own `collectUnitStates` over an inline `python3 -c` socket bridge:

```
STATES [["gpu-fan-control.service","active"],["llama-server@0.service","active"],
        ["llama-server@1.service","active"],["llama-server@7.service",null]]
ERRORS [{"source":"dbus","message":"llama-server@7.service: org.freedesktop.systemd1.NoSuchUnit: Unit llama-server@7.service not loaded."}]
```

`gdbus`/`dbus-send` confirm the error name is exactly `org.freedesktop.systemd1.NoSuchUnit`,
so `NO_SUCH_UNIT_ERROR` is correct. `busctl call … GetUnit` reproduces it. The template
`/etc/systemd/system/llama-server@.service` exists on disk, so this **is** the
installed-but-not-loaded case.

The build's answer is `unitState: null`. `severityUnitState(null)` returns **`null` — no
severity at all** (`lib/severity.ts:450`). §6.3's "Any unit" row has no `null` column, so the
cell is uncoloured. Consequences:

| case | today | if it happened |
|---|---|---|
| `gpu-fan-control.service` disabled and never started — **its documented state 2026-08-15 → 2026-08-27** | loaded, `active` | SAFETY's *"Fan service active"* row renders `—`, **uncoloured**. §3.6: *"Cards are on the EC's curve, which ignores GPU temperature entirely."* The panel that earns this dashboard's existence says nothing |
| a third card: `2.env` created, `llama-server@2` never enabled | n/a | SERVING row shows port and ctx, `unitState` `—` uncoloured. If the env file also lacks `PORT=`, `health` is `null` too and the whole row for a dead instance is colourless |

So the build's S9 chose "fabricate no alarm" and paid for it with "hide a dead service" — the
two failure modes the task names, and it landed on the second.

**The argument the build did not make, and it cuts the other way:** systemd has no state
other than `inactive` for a unit it has not loaded. `systemctl show` does not print
`inactive` *because* `LoadUnit` changed something — `LoadUnit` materialises the object and
the state it then reports is the state that was already true. Treating `NoSuchUnit` as
`inactive` is therefore not "inferring an alarm from an answer that says I have no record";
it is reading systemd's own semantics. The build's caution is defensible but it is a choice,
not a deduction, and it is the choice that loses information.

**A read-only third option exists and was not considered:**
`Manager.GetUnitFileState(name)` and `Manager.ListUnitFiles` are read-only and answer
"enabled / disabled / not-found" for a unit that is not loaded. `NoSuchUnit` + a unit file
that exists is *definitively* "installed, not running"; `NoSuchUnit` + no unit file is
"there is no such unit". That distinguishes the two cases inside invariant 2, and is worth
raising with the spec question rather than leaving `null` to mean both.

**Also confirmed:** `NoSuchUnit` and "the bus is unreachable" are **indistinguishable at the
contract level** — both are `unitState: null`. They differ only in `errors[]` prose (one
entry naming the unit vs one entry naming the socket). §6.5 makes the entry available, so
this is defensible, but it should be stated rather than discovered.

---

### ⚠ F5 (MEDIUM) — §2.2 has no bind mount for `/etc/llama-server`. New spec gap, not on the build's list

§3.4 requires *"enumerate `/etc/llama-server/*.env`"* and `DEFAULT_PATHS.etcLlamaServer` is
`/etc/llama-server`. §2.2's container-access table has **nine rows and none of them is
`/etc/llama-server`** (verified by reading the table: GPU, fans, `/proc`, coretemp, disk,
D-Bus, ufw, DKMS, hostname).

Step 11 writing the `docker run` line from §2.2 — which is what §2.2 is for — ships a
container in which every poll yields `serving: null` plus one `llama-env` entry, and the
SERVING panel says *"could not enumerate instances"* on a perfectly healthy box. Step 12's
"install on the box, run, verify" is where it would be found, four steps later.

Invariant 7: report, do not fill. The obvious row is
`-v /etc/llama-server:/etc/llama-server:ro`, but the spec should say so.

Related and smaller: **§3.4 names two sources for `port`/`ctx`** — *"`/etc/llama-server/<i>.env`
(`PORT=`) **or the unit's env**"*. Only the file is implemented, and the alternative is not
mentioned in the build's gap list. The unit's `Environment` property is readable over the same
read-only D-Bus connection this step already opens.

---

### F6 (LOW-MED) — the two `KEY=VALUE` parsers in this step disagree, and ufw's is the lenient-losing one

`llama.ts`'s `assignments()` strips surrounding quotes ("matching systemd").
`safety-checks.ts`'s `parseUfwConf` does not. Full sweep, measured:

| `ufw.conf` line | result | truth |
|---|---|---|
| `ENABLED=no` | `false` ✓ | not enforcing |
| `ENABLED=NO` | `false` ✓ | case-insensitive, good |
| `ENABLED=no` with CRLF / leading spaces / `ENABLED=\tno` | `false` ✓ | |
| `#ENABLED=yes` then `ENABLED=no` | `false` ✓ | comment correctly skipped |
| `ENABLED=yes` then `ENABLED=no` | `false` ✓ | last wins, matches `sed … \| tail -1` in `serve-llm.sh` |
| **`ENABLED="no"`** | **`null`** | not enforcing — **§6.3's alarm does not fire** |
| **`ENABLED='no'`** | **`null`** | ditto |
| **`ENABLED=no # off for now`** | **`null`** | ditto |
| **`export ENABLED=no`** | **`null`** | ditto |
| `ENABLED=` / empty file / whitespace-only / `ENABLED_EXTRA=no` / `#ENABLED=no` | `null` ✓ | correctly unknown |

The direction is safe — every miss lands on *watch*, never on a false *alarm* — so this is
not an invariant-1 inversion. But all four forms are things bash would source and `ufw` would
honour, and on each of them the dashboard says "could not check" about a firewall that is
demonstrably off. Given that this panel exists because of the 2026-09-04 incident, missing a
real `no` is worth a line in the notes even though the failure is quiet rather than loud.

`serve-llm.sh`'s own non-root check (`sed -n 's/^ENABLED=//p' | tail -1` = `yes`) has the same
blind spot, so the collector is at least no worse than the tool it was modelled on.

---

### F7 (LOW) — every HTTP `errors[]` entry names its URL twice

`nodeHttp` builds its messages as `` `${url}: …` `` and `probeFailure` prefixes `${url}: `
again. Measured:

```
"http://127.0.0.1:8080/health: http://127.0.0.1:8080/health: timed out after Infinity ms"
```

Same for the body-cap rejection. §6.5 makes these entries something a human reads.

---

### F8 (LOW) — `storage.test.ts`'s `df -B1` test cannot see a wrong `BYTES_PER_GB`

```ts
expect((parsed.value.totalGB ?? 0) * BYTES_PER_GB).toBe(249792131072);
```

`totalGB` is `blocks * bsize / BYTES_PER_GB`, so multiplying by `BYTES_PER_GB` cancels it.
The assertion is `blocks * bsize === 249792131072` — true for **any** divisor. The test is
⚠-marked and named *"the live root filesystem reproduces `df -B1` exactly"*, which reads as a
claim about the published figure; what it actually proves is the block arithmetic.

It is not inert — mutation S2 (`used` from free blocks) reddens it, so the ledger is
satisfied — and the ⚠ test beside it (`the figures match what `df -h` prints`) *is* divisor-
sensitive and catches S1. So coverage is fine and only the name over-claims. This is exactly
the class §5.2 of HANDOVER calls irreducible: red for a reason other than the one the name
implies.

---

### F9 (LOW) — `serving.test.ts`'s "a nonsense timeout falls back to the module default" proves nothing

```ts
const { serving } = await collectServing({ …, http: liveBox.http(), timeoutMs: Number.NaN });
expect(serving).toHaveLength(2);
```

The fake `HttpIo` never looks at its `timeoutMs`, so the only thing under test is
`deadline()`'s fallback — which `deadline.test.ts` already covers directly. The path that
actually carries the number (`nodeHttp`'s `setTimeout`) is untouched, and **F2** shows it is
broken there. A test that names a property it does not check; not ⚠-marked, so the ledger
never asked for it. `storage.test.ts`'s identically-named test is sound because
`collectStorage` genuinely never forwards the number.

---

### F10 (LOW) — the DKMS mount oracle checks a name, not a tree

`checkDkms` step 2 requires `release ∈ readDir(libModules)`. The doc justifies it with *"the
documented DKMS failure leaves `/lib/modules/<kver>/` fully populated by the distribution"* —
but the code only proves the **name appears in the parent listing**. Measured: a listing that
contains `7.0.0-30-generic` while `…/updates/dkms` gives `ENOENT` yields **`false`**, the
alarm, whether the tree is populated or an empty stub.

Everything else in the three-step check behaves exactly as documented, measured:

```
ENOENT on updates/dkms        -> false   (the alarm, correct)
EACCES / ENOTDIR / ELOOP      -> null    (correct)
empty updates/dkms            -> false   (correct: built nothing of ours)
module present                -> true
/lib/modules empty            -> null    (mount-typo protection works)
/lib/modules EACCES           -> null
unameRelease "" / "  " / "\n" -> null
unameRelease throws           -> null
```

Low severity: for a *running* kernel the tree is always populated by the distribution. Listing
`<libModules>/<release>` and requiring it non-empty would make the oracle match its own
docstring, at the cost of one more `readDir`.

---

### F11 (LOW) — misleading message on `data: [null]`

`parseModelsBody('{"data":[null]}')` reports `` `data` is empty ``. The array is not empty;
its first element is `null`. Value is correctly `null`.

---

## Part 2 — Attacked and found sound

Everything below was executed, not reasoned.

**The safety-check trap (attack 1) — the invariant holds.** No read failure of any kind
produces `false` on either three-valued check. Swept `ENOENT EACCES EIO EISDIR ENOTDIR ELOOP
EBUSY` through `checkUfw` (all `null`), plus empty file, whitespace-only file, no `ENABLED=`
line, a commented-out `ENABLED`, an unrecognised value, a prefix key, and a value that is
whitespace — all `null` with an entry. `readFile` on a directory rejects (`EISDIR`) so it can
never be parsed as text. The only routes to `false` are a literal `ENABLED=no`/`ENABLED=NO`
line and a `readDir` of `updates/dkms` that succeeded (empty listing) or answered `ENOENT`
after the parent listing proved the kernel directory. **`false` is never minted by a failed
read** — the one thing this step most had to get right. F6 and F10 are the only smudges and
both fall on the safe side or need a broken mount to reach.

**The D-Bus wire codec (attack 2) — validated against the live bus, not against itself.**
The project's own `collectUnitStates` was driven over a socket bridge to
`/run/dbus/system_bus_socket` on `ai-server` and returned correct `ActiveState` for three
loaded units and `NoSuchUnit` for an unloaded one. Along the way it exercised, for real:

- the SASL `EXTERNAL` handshake and `BEGIN` (37-byte reply read);
- **two messages in one read** — the 262-byte read is the `Hello` reply plus the
  `NameAcquired` signal, exactly as the build documented, and the serial-matching loop
  skipped the signal;
- **an unexpected message type** (that signal) and **an error reply where a method return was
  expected** (`NoSuchUnit`, decoded with its `ERROR_NAME`);
- frames split across reads and 5 further round trips at varying sizes (79/128/129/156 bytes).

Locally, additionally verified: **big-endian decode** produces byte-identical results to the
little-endian original of the same message (`{type 2, serial 7, replySerial 7, signature "v",
body ["active"], byteLength 47}` both ways); **two identical frames concatenated** decode as
two messages via `byteLength`; every truncation is `incomplete`; a container in a body
signature is `malformed`; a bad endian byte and a bad protocol version are `malformed`.
`dbus.test.ts` asserts the member names by reading them out of the written frames and lists
nine mutating members that must not appear — a real wire assertion, not a mock. The
`SIGNATURE`-as-`g` fix is asserted byte-for-byte. **F3 is the only hole.**

**The HTTP probes (attack 4) — the bound is real and a 503 body is never parsed.** Measured
against real loopback servers:

| input | outcome |
|---|---|
| 302 redirect | `status 302`, **not followed**, → `unhealthy` + entry |
| accept-then-silence, 300 ms bound | rejected at **304 ms** — the bound fires |
| chunked, truncated mid-body | rejected, `code=ECONNRESET` |
| reset before any response | rejected, `code=ECONNREFUSED`/`ECONNRESET` |
| connection refused | rejected, `code=ECONNREFUSED` (read off `error.code`) |
| body 70000 B against a 65536 B cap | **rejected**, never truncated |
| body exactly at the cap | returned whole (both sides fixtured) |
| non-JSON 200 (`<html>`) | `health: ok`, `llama-models` entry "not JSON", `model: null` |
| JSON 200 of the wrong shape (`{"models":[…]}` with no `data`) | `llama-models` entry "no `data` array" |
| 503 with `{"error":…}` | `unhealthy`, **no entry**, `/v1/models` **not requested** |
| 401 — llama.cpp's real answer for an unknown path on this box | `unhealthy` + entry, never `unreachable` |

DNS failure is unreachable by construction: `LLAMA_PROBE_HOST` is the literal `127.0.0.1`.
Confirmed on the box that both endpoints answer 200 without the API key, and that an unknown
path answers **401** (not 404) — `healthFromStatus` handles it correctly.

**Instance discovery (attack 5) — the derivation, not a string match.** `unitState` comes from
`units.states.get(servingUnitName(instance))`, and `servingUnitName` builds
`llama-server@<i>.service` from the index (§6.4). Swept: `01.env +1.env -1.env .env env a.env
0.env.bak 0.ENV " 0.env" "0 .env" 1e3.env 0x1.env` → all `null`; `0.env 1.env 10.env` → 0, 1,
10 sorted numerically. Duplicate indices are impossible because only canonical decimal is
accepted. Zero instances → `[]` (a reading) and no D-Bus connection is opened; an unlistable
directory → `null`. A third instance appears with no code change (fixtured). An unreadable
env file among readable ones blanks only its own row. A **subdirectory** named `2.env` is
treated as instance 2 and then fails `readFile` with `EISDIR` → `llama-env` entry, `port
null`, `health null` — a correct degradation, though it is not fixtured.

**`statvfs` (attack 6) — arithmetic verified against the real box.**

```
/      f_bsize 4096  f_blocks 60984407   f_bfree 55575773
/home  f_bsize 4096  f_blocks 240075268  f_bfree 206773235
df -B1:  249792131072 total / 22153764864 used  ·  983348297728 total / 136405127168 used
```

`blocks × bsize` = 249792131072 **exactly** and `(blocks − bfree) × bsize` = 22153764864
**exactly** — `df`'s Size and Used to the byte, on both filesystems. `bfree` is the right
choice and `bavail` would not reproduce either column. **0 bytes free** yields `used ===
total`, a reading (and `severityDiskFree` alarms); an **unreadable mount** yields
`{usedGB: null, totalGB: null}` plus one `statvfs` entry **per mount**, never zeros.
`bsize: 0`, negative, fractional, `NaN`, `Infinity` and past-safe-integer all yield the
all-`null` value with an entry.

**The deadline flake (attack 8) — the fix is sound and the test is deterministic, not lucky.**
`pnpm verify` run **15 consecutive times: exit 0 and 1232 passed every time** (the build
reported 2 failures in 8 on pristine step-4 files, so 15/15 is a meaningful sample).

The mechanism is right: `setTimeout` counts on libuv's cached millisecond clock and the
arithmetic reads `performance.now()`, so the timer can fire while `left` is still positive;
`spent` closes that. The new test is deterministic by construction, not by timing —
`vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout'] })` fakes only the timer and leaves
`performance.now()` real, so after `advanceTimersByTime(1000)` the arithmetic still believes
almost the whole budget remains and **the latch is the only thing that can reject the second
operation**. It asserts `started` is `['first']`, i.e. *rejected without being started*, which
is the module's own stated promise rather than a proxy for it. The other side of the boundary
is fixtured immediately below (`a budget that has not expired still admits operations`), so
the latch cannot close early undetected. Step 4's harness carries the mutation and reddens it.

**Fixture symmetry (attack 7, first inherited rule) — sound.** Every guard whose two sides
differ at a panel has a fixture on each side and, where a mutation would otherwise anchor on
the comparison, two mutations:

| guard | below | above | mutations |
|---|---|---|---|
| `MIN_PORT`/`MAX_PORT` | `PORT=0`, `PORT=1` | `PORT=65535`, `PORT=65536` | L6, L7 |
| `CTX ≥ 1` | `CTX=0` | `CTX=1` | L8 |
| `parseInstanceIndex`'s `value < 0` | `-1.env` | `0.env` | L1 |
| `bfree > total` | 100 of 100 | 101 of 100 | S4 |
| `bsize === 0` | `0` | live values | S3 |
| `sane()` | negative, fractional | safe integers | S5 |
| `size > HTTP_MAX_BODY_BYTES` | exactly at cap | cap + 1024 | H4 |
| dkms prefix | `dell-smm-hwmon.ko` uncompressed | `dell-smm.ko.zst` near-miss | F5, F6, F18 |
| `kernels.includes(release)` | absent | present | F8 |
| `units.length === 0` | `[]` | one unit | D8 |
| decoder truncation | every cut 0…len−1 | the whole frame | W5 |
| `deadline`'s latch | expired | not expired | Y1 |

Correctly **not** fixtured, per the rule's second half: `deadline`'s `left <= 0` (one tick
apart, indistinguishable at a panel), `data.length > 1` (one and two models render the same
cell), and `assignments()`'s `at <= 0` — a line beginning with `=` produces a key nobody looks
up under either side of the comparison, so neither side reaches a panel.

**The red-test ledger (attack 7, second inherited rule).** All 74 ⚠-marked tests go red under
at least one mutation. I read each ⚠ test name against its body looking for the half the
ledger cannot mechanise; **F8 and F9 are the two I found**, and F9 is the more serious because
the property it names is genuinely broken (F2). The two the build repaired on its own first
run (`W14` UTF-8 length, `S6` `toEqual(NO_FILESYSTEM)`) are now correct: `W14` decodes and
compares the value, `S6` asserts literal `null`s. The `LoadUnit` test reads the written frames
rather than a mock and is sound. The three boundedness tests (`dbus`, `http`, `storage`,
`serving`) all measure elapsed time against the declared budget and are real.

**Other checks that came back clean.** `parseModelsBody` never throws on hostile input
(numeric `id`, `null` element, top-level array, `null`, HTML, a `__proto__` key — no
prototype pollution). `collectSafety` reads `gpu-fan-control.service` and nothing else (O9),
and `collectServing` deliberately does not. Every step-5 `errors[].source` is one of the
eighteen; no nineteenth name is needed. `serving: null` and `serving: []` are distinct and
both tested. `health: null` is minted only where §3.7 means it. Neither collector runs a
subprocess, asserted against a record of every command the fake was asked to run.

---

## Part 3 — Reasoned, not verified against a live failure

- **`Writer.signature` truncates silently.** `w.byte(bytes.length)` masks with `& 0xff`, so a
  signature of exactly 256 characters encodes length 0. Confirmed locally that a 256-argument
  call produces a frame the project's own decoder calls `malformed`. **Unreachable** — this
  client sends at most two arguments and header signatures of one character — but it is the
  only place the encoder can emit an invalid frame, and `Writer.byte` masking rather than
  rejecting is what allows it.
- **The header-field reader is bounded by the whole buffer, not by `fieldsEnd`.** A field
  whose string length overruns the declared field array reads into the body (or into the next
  message in the same read) without tripping `need()`. The loop then exits because
  `reader.pos >= fieldsEnd`. Blast radius is bounded — `byteLength` still comes from the
  header, so the stream cannot desynchronise, and a garbage `ActiveState` becomes `null` plus
  an entry — but it is a real slackness against a peer that is not systemd.
- **Deeply nested variants** (`v` inside `v` inside …) recurse once per two bytes, so a 64 KB
  frame could overflow the stack. The generic `catch` in `decodeMessage` turns a `RangeError`
  into `malformed`, so it degrades correctly rather than crashing the route.
- **Two D-Bus connections per poll.** `collectServing` and `collectSafety` each open one, so
  the SASL handshake and `Hello` happen twice per cycle. O9 is still satisfied (one *reading*
  of `gpu-fan-control.service`); this is cost, not correctness, and step 6 may want to know.
- **Container uid and `EXTERNAL`.** §2.2 says the container runs as a non-root user;
  `nodeDbus.uid()` sends `process.getuid()`, which under default Docker (no userns-remap) is
  the same number the host kernel reports over `SO_PEERCRED`. Correct as written, and it would
  break loudly (`REJECTED`, one entry) rather than silently if userns-remap were ever enabled.

---

## Part 4 — Adjudicating the build's eight recorded gaps

| # | Verdict |
|---|---|
| **S6** — disk unit | **Real, and now settled numerically.** `df -h` prints `233G` for `/` and `916G` for `/home`; `1024³` gives 232.6 and 915.8, `10⁹` gives 249.8 and 983.3. `CLAUDE.md`'s "238.5 GB"/"931.5 GB" are `lsblk`'s GiB. The build's **value is right**; the **label is wrong**. §6.6's own premise is that a figure can be checked against the command that produced it — a screen reading `232.6 GB` for 232.6 **GiB** fails that premise in the other direction. **Recommend the spec say GiB** and the formatter's suffix follow. §6.3's band is a ratio and is unaffected either way, as the build says. Note F8: the test that appears to pin this cannot see the divisor |
| **S7** — `bfree` vs `bavail` | **Real, and the build chose correctly.** Verified to the byte: `(blocks − bfree) × bsize` reproduces `df`'s **Used** on both filesystems; `bavail` reproduces neither published column (it is 3.1 GiB lower on `/` because of the ext4 root reserve). Spec should state `blocks − bfree` |
| **S8** — multi-model | **Real but low-impact.** The contract holds one `model`; showing `data[0]` and filing an entry is the right conservative reading. This box serves one model per port and `serve-llm.sh` has no route to more |
| **S9** — `GetUnit` vs `LoadUnit` | **Real and the most important of the eight — see F4.** The build's `null` is defensible but chooses "hide a dead service" over "fabricate an alarm", and `severityUnitState(null)` gives the SAFETY row **no colour at all**. Escalate: the spec must answer, and `GetUnitFileState` is a read-only way to separate "installed, not running" from "no such unit" that was not considered |
| **S10** — no bound specified | **Real, and it is now the fifth instance** (step 4's C2 plus four here). Four numbers chosen by analogy. Recommend a single §6.7 sentence: every collector that leaves the process gets one monotonic budget, stated per source. **F2 shows the cost of leaving it implicit**: two mechanisms bound the same call and only one validates its argument |
| **S11** — no entry for a blank `model` when health ≠ ok | **Agree with the build.** The read was not attempted and the `health` cell in the same row carries the colour; an entry per non-ok instance per poll is noise. Note the tension with §6.5's "an em dash always has an entry behind it" is the same shape as step 4's G5 and should be answered once, for both |
| **S12** — stale ufw facts | **Confirmed on the box today:** `/etc/ufw/ufw.conf` reads `ENABLED=yes`. The build is right that the collector reads the file so the dashboard is correct either way. The consequence worth flagging forward: **§6.4's only worked example of a standing condition is now a condition that does not exist**, and steps 8/10 have to implement `STANDING` with no live example to test against |
| **S13** — `01.env` rejected | **Agree, and well-reasoned.** §6.4 fixes subjects as bare integers and §9 dedupes by condition id, so two filenames mapping to one subject would drop an instance from the header count. Both sides fixtured (`-1.env`, `+1.env`, `01.env` rejected; `0/1/10.env` accepted) |

**One gap the build did not record: F5** (§2.2 has no `/etc/llama-server` mount), plus the
unimplemented "or the unit's env" half of §3.4's `port`/`ctx` row.

---

## Part 5 — Ranked summary for the review phase

| # | Severity | Finding |
|---|---|---|
| **F1** | **High** | A slow `/etc/llama-server` listing spends the shared budget and both healthy instances are reported `health: 'unreachable'` — §6.3 **alarm** — with entries blaming `llama-health` and nothing naming the real cause. §3.7's `health: null` is the honest value |
| **F2** | **High** | `nodeHttp` hand-rolls a bound and never calls `boundedTimeoutMs`; `serving.ts` passes the raw option. `timeoutMs: Infinity` → a **1 ms** bound and an `unreachable` alarm on a healthy server, while `deadline()` believes it has 4 s. HANDOVER do-not-copy #1, in the one file with no test |
| **F3** | Medium | The D-Bus decoder has no maximum message size: 16 bytes of rubbish burn the whole budget and the entry says "timed out" about a peer that answered in 1 ms — the exact failure the `incomplete`/`malformed` split exists to prevent |
| **F4** | Medium | S9 sharpened: `NoSuchUnit` → `unitState: null` → **no severity**. A never-started `gpu-fan-control.service` renders `—`, uncoloured, on the SAFETY row that exists to catch it. Verified live |
| **F5** | Medium | §2.2 has no bind mount for `/etc/llama-server`; a step-11 container built from that table cannot enumerate instances at all. New spec gap |
| **F6** | Low-Med | `ENABLED="no"`, `'no'`, `no # comment` and `export ENABLED=no` all read as `null`, so §6.3's ufw alarm quietly does not fire. Safe direction, but the two `KEY=VALUE` parsers in one step disagree about quoting |
| **F7** | Low | Every HTTP `errors[]` entry names its URL twice |
| **F8** | Low | `storage.test.ts`'s ⚠ `df -B1` test multiplies by the divisor it divided by; it cannot see a wrong `BYTES_PER_GB` |
| **F9** | Low | `serving.test.ts`'s "a nonsense timeout falls back to the module default" proves nothing — the fake ignores the number, and the real path (F2) is broken |
| **F10** | Low | The DKMS mount oracle proves a *name* in the parent listing, not a populated tree, so a stub kernel directory yields the alarm |
| **F11** | Low | `data: [null]` is reported as "`data` is empty" |

Nothing here is a reason to reject the step: the parser/wrapper split, the `false`-never-from-
a-failed-read rule, the `null`-is-not-`[]` rule, the live-bus validation of the codec, the
statvfs arithmetic and the deadline latch all survived direct attack. **F1 and F2 are the two
that put an alarm-severity value on a healthy machine, and they are the two worth fixing
before step 6 wires these collectors into a route.**
