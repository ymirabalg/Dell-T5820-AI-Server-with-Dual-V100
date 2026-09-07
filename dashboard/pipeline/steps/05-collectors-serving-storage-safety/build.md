# Step 5 — build phase: serving, storage and safety collectors

Green: **`pnpm verify` → `Test Files 24 passed (24)`, `Tests 1232 passed (1232)`,
`Type Errors no errors`, `exit=0`** (run five consecutive times; see §8). `pnpm build` →
`exit=0`, `tsconfig.json` still `md5 8b6e358b0e19ad663d554dc8310c6da0`.

Step 4 closed at 1038 tests. Step 5 adds **194**.

---

## 1. What was built

Nine new source modules, seven new test files, no new dependency.

| File | Lines | What it is |
|---|---|---|
| `lib/collectors/dbus-wire.ts` | 458 | **Pure.** The D-Bus wire format — marshal a method call, decode a message, the SASL helpers |
| `lib/collectors/dbus.ts` | 462 | Seam + `nodeDbus` + `collectUnitStates`. Source `dbus` |
| `lib/collectors/llama.ts` | 230 | **Pure.** §3.4 — discovery, the env file, status→`HealthState`, `/v1/models` |
| `lib/collectors/http.ts` | 134 | Seam + `nodeHttp` over `node:http` |
| `lib/collectors/statvfs.ts` | 103 | Seam + `nodeStatvfs` + **pure** `filesystemFrom` |
| `lib/collectors/safety-checks.ts` | 83 | **Pure.** §3.6's `parseUfwConf` and `dkmsPresentFrom` |
| `lib/collectors/serving.ts` | 267 | Wrapper `collectServing`. Sources `llama-env`, `llama-health`, `llama-models` (+ `dbus`) |
| `lib/collectors/storage.ts` | 86 | Wrapper `collectStorage`. Source `statvfs` |
| `lib/collectors/safety.ts` | 204 | Wrapper `collectSafety`. Sources `ufw`, `dkms` (+ `dbus`) |

Tests: `dbus-wire.test.ts` 303 · `dbus.test.ts` 498 · `llama.test.ts` 282 ·
`http.test.ts` 188 · `serving.test.ts` 651 · `storage.test.ts` 210 · `safety.test.ts` 446.

### The four public collectors

```ts
collectServing({ io?, paths?, http?, dbus?, timeoutMs? })
  -> { serving: readonly ServingInstance[] | null; errors }
collectStorage({ statvfs?, paths?, timeoutMs? })
  -> { root: Filesystem; home: Filesystem; errors }
collectSafety({ io?, dbus?, paths?, timeoutMs? })
  -> { ufwEnforcing; dkmsForRunningKernel; fanServiceState; errors }
collectUnitStates({ dbus?, paths?, units, timeoutMs? })
  -> { states: ReadonlyMap<string, UnitState | null>; errors }
```

All four take an options object with `= {}` defaults (except `collectUnitStates`, whose
`units` is required — it has no sensible default and inventing one would hard-code the
instance list §3.4 forbids). Every one returns contract types, so **step 6 assembles with
no adapter**: `storage` is `{ ...collectStorage(), net: <from collectHost> }`, `safety` is
`{ ...collectSafety(), pwm5Present: <from collectCooling> }`.

`CollectorPaths` gained six members (§7 records the two earlier-step files this touched):
`etcLlamaServer` `ufwConf` `libModules` `rootMount` `homeMount` `dbusSystemSocket`.

⚠ **`rootMount`/`homeMount` default to `/host/root` and `/host/home`, not `/` and
`/home`** — §2.2 bind-mounts them there, and `statvfs('/')` inside the container measures
the container's own overlay: a plausible-looking number about the wrong filesystem, with
no error to reveal it. Asserted in `storage.test.ts` and in step 3's `DEFAULT_PATHS` test.

---

## 2. The parser / IO split

Copied from steps 3 and 4 without deviation. Parsers are pure functions of text or of a
listing, return `ParseResult<T>`, never throw, and **never know their own `ErrorSource`**.
Wrappers fetch bytes, catch, prefix the path, and tag.

That rule mattered more here than anywhere, because **this is the first collector with
several sources on one wrapper**. `collectServing` produces four of §3.7's eighteen names
and each blanks a different column:

| source | blanks | reached when |
|---|---|---|
| `llama-env` | `port`, `ctx` — and therefore `health`, `model` | the directory or an env file would not read, or a value would not parse |
| `dbus` | `unitState` | tagged inside `collectUnitStates`, never in `serving.ts` |
| `llama-health` | `health` | `/health` refused, reset, timed out, or answered other than 200/503 |
| `llama-models` | `model` | `/v1/models` answered 200 with a body that is not a model list |

Seven attribution tests assert which source explains which blank, and six mutations
(V4, V5, V8, V15, V16, V17) swap a source for a neighbouring one. All six bite.

### The three new seams are separate from `CollectorIo`

`HttpIo`, `DbusIo` and `StatvfsIo` are their own interfaces. Two reasons, the second
load-bearing: a socket, an HTTP client and a syscall are not "the contents of a path", so
one interface would be four unrelated capabilities wearing one name; and **every fake
`CollectorIo` in steps 3 and 4 is an object literal**, so widening it would have turned ten
of *their* tests red for a change with nothing to do with them.

---

## 3. Every §3.4 / §3.5 / §3.6 field, mapped

| field | parser | wrapper | tests |
|---|---|---|---|
| `serving[].instance` | `parseInstanceIndex`, `discoverInstances` | `collectServing` | `llama.test.ts` "instance discovery" (8), `serving.test.ts` third-card + tenth-card |
| `serving[].port` | `parseLlamaEnv` (`PORT=`, 1–65535) | `collectServing` → `readEnv` | `llama.test.ts` env block (12), `serving.test.ts` no-`PORT=` |
| `serving[].ctx` | `parseLlamaEnv` (`CTX=`, ≥ 1) | same | `llama.test.ts` CTX-0 boundary |
| `serving[].unitState` | `asUnitState` | `collectUnitStates` | `dbus.test.ts` six-state table + seventh-value + NoSuchUnit |
| `serving[].health` | `healthFromStatus` | `collectServing` → `probe` | `llama.test.ts` status table, `serving.test.ts` 503 / refused / 404 / not-probed |
| `serving[].model` | `parseModelsBody` | same | `llama.test.ts` `/v1/models` block (10), `serving.test.ts` non-list body |
| `storage.root` / `.home` | `filesystemFrom` | `collectStorage` | `storage.test.ts` (22), anchored to `df -B1` and `df -h` |
| `storage.net` | — | **step 3's `collectHost`** | unchanged |
| `safety.ufwEnforcing` | `parseUfwConf` | `collectSafety` → `checkUfw` | `safety.test.ts` ufw block (9) |
| `safety.dkmsForRunningKernel` | `dkmsPresentFrom` | `collectSafety` → `checkDkms` | `safety.test.ts` three-step block (7) |
| `safety.fanServiceState` | `asUnitState` | `collectSafety` → `collectUnitStates` | `safety.test.ts` string-not-boolean, O9 single-owner |
| `safety.pwm5Present` | — | **step 4's `collectCooling`** | unchanged |

---

## 4. How D-Bus is read, and why it is safe and unprivileged

### The route

§2.2 fixes it: *"`-v /run/dbus/system_bus_socket:...:ro` — query `ActiveState` over D-Bus.
Read-only and unprivileged — **no `systemctl` shelling out, no root**."* Three routes exist
and two are closed:

1. **Shell out to `systemctl`/`busctl`.** §2.2 forbids the first by name, and both are
   systemd binaries — the image is `node:24-slim`, which ships no systemd. It would work on
   the developer's box and fail in the container, with every test green.
2. **A D-Bus npm package.** Invariant 6 permits a dependency with a recorded reason, but
   the reason has to survive the comparison: the entire protocol surface used here is three
   method calls whose arguments are strings and whose replies are one string each. A
   general marshaller is two orders of magnitude more code, none of it exercised.
3. **`dbus-wire.ts`** — 458 lines of pure functions over `Uint8Array`, no IO, validated
   byte-for-byte against frames captured from this box's live system bus.

**No dependency was added.** `node:net`, `node:http` and `node:fs`'s `statfs` cover
everything.

### The conversation

Connect the unix socket → write `\0` + `AUTH EXTERNAL <hex uid>` → expect `OK` → `BEGIN` →
`Hello` → then per unit: `Manager.GetUnit(name)` → object path, `Properties.Get(Unit,
ActiveState)` → a `VARIANT` holding the state string. One connection for all units.

**Why it is unprivileged:** `EXTERNAL` proves nothing by itself. The *kernel* supplies the
peer's real uid over `SO_PEERCRED` and the bus compares it with the line we send, so the
uid is a claim the bus checks rather than a credential. There is no secret to configure.

**Why it is read-only:** only `GetUnit` and `Properties.Get` are ever called.
⚠ **`LoadUnit` is deliberately not used** even though it is what `systemctl show` calls —
it *loads* the unit into systemd's memory, which is a state change, and invariant 2 has no
"harmless write" exception. `dbus.test.ts` asserts the member names by reading them out of
the written frames (they travel as plain ASCII) and asserts nine mutating members never
appear; mutation D9 swaps `GetUnit` for `LoadUnit` and reddens it.

**Bounded (O17):** the whole conversation shares one `deadline()` — called, not
hand-rolled, per HANDOVER §6's do-not-copy #1. Two tests bound it: a bus that accepts the
socket and never answers, and one that answers with bytes that are not a D-Bus message
(which **fails fast** rather than waiting out the budget — that is why `decodeMessage` has
`incomplete` and `malformed` as separate kinds).

### ⚠ The bug the live bus found, and what it says about round-trip tests

The `SIGNATURE` header field was marshalled with a **4-byte** length prefix instead of a
**1-byte** one. The encoder and the decoder agreed with each other perfectly; the round-trip
tests were green; `tsc` was green. systemd accepted `Hello`, received the next frame, and
**closed the connection with no diagnostic at all** — the symptom arrived several calls
later as an `EPIPE`.

It was found by generating frames from this project's own encoder, replaying them over
`/run/dbus/system_bus_socket` on `ai-server` with an inline `python3 -` (nothing written to
the box), and hexdumping the replies. Those replies are now `samples.ts`'s
`CAPTURED_DBUS_*` and are the fixtures the decoder is tested against.

The general lesson is recorded at the top of `dbus-wire.test.ts`: **a round trip proves the
two halves agree, never that either is right.** Mutation W1 removes the fix and reddens
the byte-level assertion that now exists.

One thing that capture also settled, and which a hand-built fixture would never have
produced: **the bus sends its `NameAcquired` signal in the same 262-byte read as the
`Hello` reply.** A client taking "the next message" as its answer reads the signal's body
as an object path and is wrong for the rest of the connection. Mutation D3 does exactly
that and reddens three files.

---

## 5. Where each fixture came from

All captured from `ai-server` over SSH on 2026-09-06, **read-only** — `cat`, `ls`, `curl`
against `/health` and `/v1/models` (both answer without the API key by llama.cpp's design),
one `os.statvfs()` via `python3 -`, and the D-Bus replay above. Nothing was written,
started, restarted or `set-model`'d. `/v1/chat/completions` was never called.

| fixture | source |
|---|---|
| `CAPTURED_LLAMA_SERVER_ENTRIES`, `CAPTURED_LLAMA_ENV_0/1` | `ls` + `cat /etc/llama-server/*.env` |
| `CAPTURED_HEALTH_BODY`, `CAPTURED_MODELS_BODY` | `curl -s -i http://127.0.0.1:8080/{health,v1/models}` |
| `LLAMA_LOADING_503_BODY` | transcribed from `~/llama.cpp/tools/server/server-http.cpp` on the box — see §6 |
| `CAPTURED_UFW_CONF` | `cat /etc/ufw/ufw.conf` |
| `CAPTURED_LIB_MODULES`, `CAPTURED_DKMS_ENTRIES` | `ls /lib/modules`, `ls /lib/modules/$(uname -r)/updates/dkms/` |
| `CAPTURED_STATVFS_ROOT/HOME` | `python3 -c 'os.statvfs(...)'`, cross-checked against `df -B1` and `df -h` |
| `CAPTURED_DBUS_*`, `CAPTURED_DBUS_AUTH_OK` | the live-bus replay (§4) |

Built failure fixtures, each one mutation away from a captured one and named for it:
`UFW_CONF_DISABLED` · `UFW_CONF_NO_ENABLED` · `UFW_CONF_JUNK` · `UFW_CONF_COMMENTED` ·
`UFW_CONF_TWICE` · `DKMS_ENTRIES_WITHOUT_MODULE` · `DKMS_ENTRIES_UNCOMPRESSED` ·
`LLAMA_ENV_NO_PORT` · `LLAMA_ENV_JUNK_PORT` · `LLAMA_ENV_PORT_{ZERO,OVER,LOW,HIGH}` ·
`LLAMA_ENV_MESSY` · `LLAMA_SERVER_ENTRIES_{THIRD_CARD,TENTH,NOISY}` ·
`MODELS_BODY_{EMPTY_DATA,TWO_MODELS,NOT_JSON,NO_DATA,NUMERIC_ID}`.

**⚠ `ufw.conf` now reads `ENABLED=yes` on this box.** `CLAUDE.md`, §7's risk 3 and §6.4's
standing-condition example all still describe it as `no`. The check reads the file, so the
dashboard reports whichever is true on the day; the disabled form is kept as
`UFW_CONF_DISABLED` because §6.3's alarm row and §6.4's standing example both need it.

**Fixture symmetry (HANDOVER §5.1)** — every guard whose two sides differ at a panel has a
fixture on each side, and where a mutation would otherwise anchor on the comparison there
are two mutations:

| guard | below | above | mutations |
|---|---|---|---|
| `MIN_PORT` / `MAX_PORT` | `PORT=0`, `PORT=1` | `PORT=65535`, `PORT=65536` | L6, L7 |
| `CTX ≥ 1` | `CTX=0` | `CTX=1` | L8 |
| `bfree > total` | `bfree = 100 of 100` | `bfree = 101 of 100` | S4 |
| `HTTP_MAX_BODY_BYTES` | exactly at the cap | one KiB over | H4 |
| `dkms` prefix | `dell-smm-hwmon.ko` (uncompressed) | `dell-smm.ko.zst` (near miss) | F5, F6, F18 |

Deliberately **not** fixtured, per the same rule's second half: `deadline`'s `left <= 0`
(the two sides are one tick apart and indistinguishable at a panel) and `data.length > 1`
(one and two models render the same cell; the difference is the entry, which is asserted).

---

## 6. The traps, each with the evidence behind it

### O15 — `HealthState`, confirmed against the running build's own source

Read over SSH from `~/llama.cpp/tools/server/server-http.cpp`:

```cpp
auto middleware_server_state = [this](const httplib::Request & req, httplib::Response & res) {
    if (!is_ready.load()) {
        ...
        res.status = 503;
        res.set_content(... {"message", "Loading model"} ... );
```

It is a **pre-routing middleware**, so while a model loads *every* endpoint answers 503 —
`/health` and `/v1/models` included. Three consequences, all implemented and tested:

1. `503 → 'unhealthy'` **with no `errors[]` entry.** It is the normal state during a
   restart, and an entry per poll would file one every five seconds for tens of seconds.
2. **`/v1/models` is not requested unless `/health` answered 200.** During a load its body
   is `{"error":{…}}` with no `data`, and parsing it files an `llama-models` entry blaming
   the model list for a server that is merely starting. `serving.test.ts` asserts the
   request was never made; mutation V3 removes the guard and reddens it.
3. **A status is never `unreachable`.** §3.7 reserves that for refused/reset/timed out.
   A server answering 404 has been reached, and `unreachable` is §6.3's alarm — it would
   point the reader at the network instead of at the port number. `llama.test.ts` sweeps
   ten statuses asserting none maps to it.

### The safety `false` rule

> A `false` on any §3.6 check is an alarm claiming something specific is broken. It must
> never be produced by a failed read.

- **ufw** — a read failure of any kind, `ENOENT` included, is `null`. §3.6 states it: a
  missing `ufw.conf` "is not evidence that ufw is enforcing, and it is not evidence that it
  is not". No `ENABLED=` line and an unrecognised value are also `null`. Mutations F1, F2
  and F12 each turn one of those into `false`; all three bite.
- **DKMS** — the naive check is one `readDir` of `<libModules>/<release>/updates/dkms` with
  `ENOENT → false`. That is the `pwm5Present` trap in a new place: if step 11's
  `-v /lib/modules:/lib/modules:ro` is missing, *every* path under it is `ENOENT` and a
  mount typo raises §6.3's alarm. So the mount is proved first, exactly as step 4 proves the
  hwmon listing against itself:

  1. `<libModules>` must list → else `null`;
  2. the **running** kernel's directory must be in that listing → else `null` (the
     documented DKMS failure leaves `/lib/modules/<kver>/` fully populated by the
     distribution and merely lacking `updates/dkms`; an absent kernel tree says the check is
     looking in the wrong place);
  3. only then is `updates/dkms` interrogated — `ENOENT` **is** the alarm, and any other
     errno is `null`.

  `errnoCodeOf` separates step 3, on `error.code`, by exact equality. Mutations F7, F8, F9
  and F10 each break one step; all four bite, and both sides of the ENOENT/EACCES split
  have a fixture.

### `errnoCodeOf` — step 5 is the third caller, as designed

Two call sites: the DKMS `ENOENT`-vs-anything-else split above, and `probeFailure` in
`serving.ts`, which puts the code in front of the prose so an `errors[]` entry says
`ECONNREFUSED` (a stopped instance) or `ETIMEDOUT` (a wedged one) rather than leaving the
reader to find it in localised text. `serving.test.ts` proves it reads `error.code` and not
the message, using a rejection whose message says only `socket hang up`.

**A doc comment in `probe` promised this before the code did it.** That is the same
"names a property it does not check" defect in comment form, caught on re-reading; the code
was changed to match rather than the comment softened.

### `deadline()` and `boundedTimeoutMs` — called, never copied

Four things are bounded: the D-Bus conversation (2 s), the serving listing + env reads +
HTTP probes (4 s), the two `statvfs` calls (2 s), the two safety file reads (2 s). Each
uses `deadline()`. `nodeHttp` additionally destroys its own request at the bound, for the
same reason `io.ts` does it for `execFile`: the shared budget settles the *promise*, and the
socket has to be closed too.

### HTTP is not a file read

- **No redirects.** `node:http` follows none, and `http.test.ts` proves it with two real
  loopback servers — the redirect target's hit counter stays at 0. Mutation H1 adds a
  follow and reddens it.
- **No retry inside a poll.** §6.7 owns retry, as backoff *between* polls. A retry here
  multiplies the bound it sits inside and hides a flapping instance behind an average.
  `http.test.ts` counts requests; mutation H5 retries a 5xx and reddens it.
- **A capped body**, rejecting rather than truncating: truncated JSON parses as junk and
  "the model list did not parse" is a misleading way to report "this is not llama.cpp".
- **`node:http`, not `fetch`.** `fetch` buries the errno inside a `TypeError`'s `cause`, so
  `errnoCodeOf` — which is forbidden from matching message text — would need a second,
  undocumented shape. `node:http` rejects with the code on the error.
- **No credentials sent.** §3.4: both endpoints answer without the API key. Asserted.

### `null` is not `[]`, and `null` is not "placeholder"

`serving: null` is "the discovery directory could not be listed, so which instances exist is
unknown"; `serving: []` is "it listed and declares none". Mutations V1 and V13 swap them in
each direction and both bite.

`health: null` is used **only** where §3.7 means it — not probed this cycle, which on this
box is an instance whose env file gave no usable `PORT=`. It is never a placeholder for
"step 5 did not get round to it" (HANDOVER's do-not-copy #4). `serving.test.ts` asserts no
HTTP request is made for such an instance; mutation V2 reports `unreachable` instead and
reddens it, because that would band §6.3's alarm against a process that may be running
perfectly.

### O9 — one D-Bus read, one owner

`collectSafety` is the **only** place `gpu-fan-control.service` is read. `collectServing`
opens a connection of its own and deliberately asks only about `llama-server@<i>.service`.
Both are asserted, and mutations V7 (serving also asks) and F17 (safety asks about more)
bite. Step 6 writes the one value to `cooling.serviceState` through `withServiceState` and
to `safety.fanServiceState`.

### §6.4's join key

`servingUnitName(i)` derives `llama-server@<i>.service` from the index; the two are never
matched by string. Mutation V6 takes the unit state positionally and reddens the
"one instance down leaves the other unaffected" test.

---

## 7. Files outside step 5 that were touched, and why

Three, all mechanical consequences of instructions in HANDOVER or of leaving the suite
green. Listed so the review phase can judge them rather than discover them.

1. **`lib/collectors/collect.ts`** — `CollectorPaths` and `DEFAULT_PATHS` gained six
   members. HANDOVER §3 directs this explicitly: *"**Step 5 adds to it** … Add them there,
   not as literals in a wrapper."*
2. **`lib/collectors/io.test.ts`** and **`lib/collectors/collect.test.ts`** — two literals
   that enumerate `CollectorPaths` exhaustively had to gain the same six members. Neither
   test's meaning changes (`collectHost` reads none of them, and its nine-error count is
   unchanged).
3. **`lib/collectors/deadline.ts` + `deadline.test.ts` + step 4's `regressions.py`** — a
   real defect, described in full below.

### ⚠ The pre-existing flake in `deadline.ts`, and its fix

While running the suite repeatedly, step 4's
**"⚠ a wedged read in the FIRST position salvages nothing"** failed intermittently:

```
AssertionError: expected [ null, 718, 615, 1006, 1915 ] to deeply equal [ null, null, null, null, null ]
```

Four fan channels came back with real RPM values *after* the first read had already timed
out — five figures the COOLING panel would show as live readings taken past a budget it had
declared spent. **Reproduced in isolation on the pristine step-4 files at 2 failures in 8
runs**, so it is not caused by step 5; step 5's seven extra test files only made it more
frequent.

Cause: the two clocks in `deadline.ts` are not the same clock. `setTimeout` counts on
libuv's cached millisecond-resolution `uv_now`, while `const left = deadlineAt -
performance.now()` reads a finer one. They can disagree by a fraction of a millisecond, so
the timer can fire *marginally before* `deadlineAt` — leaving `left` a hair above zero for
the next operation, which then starts, and (being fast) finishes.

Fix: a latch. Once any operation has timed out the budget **is** spent, which is what the
module's own doc already promised (*"later operations are rejected without being started"*)
and what a clock comparison alone does not guarantee.

Verified: 10 consecutive clean runs of `cooling.test.ts` + `deadline.test.ts`, and five
consecutive clean `pnpm verify` runs. A deterministic test was added in
`deadline.test.ts` using fake timers with `toFake: ['setTimeout', 'clearTimeout']` — which
fakes the timer and leaves `performance.now()` real, reproducing exactly that skew.
The mutation for it (`Y1` here, `T55b` in step 4's harness) reddens it.

⚠ **Step 4's harness gained one entry** because its `LEDGER_FILES` includes
`deadline.test.ts`, so without it the new ⚠ test would be reported as inert there. Step 4's
harness now runs **72 mutations, all bite, ledger clean**. Its other 71 anchors were
unaffected — the two lines step 4 mutates (`const deadlineAt = performance.now() + budget;`
and `const left = deadlineAt - performance.now();`) are preserved verbatim.

---

## 8. Regression evidence

### `pnpm verify`

```
$ pnpm verify
 Test Files  24 passed (24)
      Tests  1232 passed (1232)
Type Errors  no errors
VERIFY exit=0
```

Run five consecutive times, `exit=0` each time (the flake in §7 is why the count matters).
`pnpm build` → `exit=0`, `tsconfig.json` byte-identical.

⚠ **HANDOVER §1's warning bit during this step, exactly as written.**
`pnpm vitest run lib/collectors/http.test.ts` printed `Tests 10 passed (10)` /
`Type Errors no errors` and exited 0, while `pnpm verify` failed on
`TS2375 exactOptionalPropertyTypes` in that same file. Per-file vitest is not the green
signal; only `pnpm verify`'s exit code is.

### All four harnesses

```
python3 pipeline/steps/02-format-severity/regressions.py                       -> exit 0, 40 mutations
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                   -> exit 0, 64 mutations
python3 pipeline/steps/04-collector-cooling/regressions.py                     -> exit 0, 72 mutations, ledger clean
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py     -> exit 0, 102 mutations, ledger clean
```

Step 5's final run:

```
Red-test ledger: 146 distinct failing tests across 102 mutations; 74 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 102 regressions failed their check, as they must.
```

Zero `ANCHOR NOT FOUND`, zero `DID NOT BITE`.

### ⚠ What the ledger found — three tests that named a property they did not check

The first full run reported three `DID NOT BITE`. Each was a **bad test**, not a bad
mutation, which is the ledger's first rule:

| mutation | the test that could not see it | why |
|---|---|---|
| `W14` UTF-8 length in characters | "UTF-8 arguments are measured in bytes" | It asserted the *body's total byte count*, which the bug does not change — only the string's own length prefix does. Fixed by decoding and comparing the value. Also gained a ⚠ |
| `S6` `NO_FILESYSTEM` becomes zeros | "a zero `bsize` is null with an entry, NOT a 0.0 / 0.0 GB filesystem" | It asserted `toEqual(NO_FILESYSTEM)` — comparing against the constant the mutation redefines, so the test agreed with the bug. Fixed by asserting literal `null`s, in two places |
| `T1` (as originally written) | — | Not a bad test: a bad *mutation*. `x as T` always type-checks, so a cast mutation can never fail `tsc`. Rewritten to assign an invented `HealthState` without a cast |

Two more were found by reading test names against their bodies rather than by the harness —
the limit §5.2 of HANDOVER calls irreducible:

- **"collectSafety / collectServing never runs a command"** asserted only that `errors` was
  empty. "No errors" is a weaker claim than the name. Both now assert against a **record of
  every command the fake was asked to run**, and mutations F14 and V18 (shelling out to
  `ufw status` / `cat`) redden them.
- **The `probeFailure` doc comment** described `errnoCodeOf` usage the code did not have.
  Fixed in the code (§6).

### Ledger-adjacent note

`deadline.test.ts` stays in **step 4's** ledger. Step 5's harness carries the one mutation
for the ⚠ test step 5 added there, and so does step 4's; duplicating step 4's other
deadline mutations would be waste.

---

## 9. ⚠ Spec gaps — recorded, not guessed (invariant 7)

Each was implemented conservatively and documented at its call site. None blocks step 6.

| # | Gap | Where |
|---|---|---|
| **S6** | ⚠ **§6.6's disk row is self-contradictory.** Its unit column says **GB** while its "checks against" column says **`df -h`, and every note in CLAUDE.md** — and both of those are powers of **1024**. `df -h` prints `233G` for this box's root filesystem where 10⁹ would render `249.8`. §6.6's stated purpose is that "any figure on screen can be checked against the command that produced it without arithmetic", so `BYTES_PER_GB = 1024 ** 3` follows the named check and the label is left as the spec writes it. **§6.3's disk band is a ratio and is unaffected either way.** The spec should say which it means | `statvfs.ts` |
| **S7** | §3.5 says `statvfs`, and `Filesystem` carries only `usedGB`/`totalGB` — so nothing says whether "used" is `blocks − bfree` (matching `df`'s **Size**/**Used**) or `blocks − bavail` (what a non-root process can actually use, 3.1 GiB lower on `/` because of the ext4 root reserve). `bfree` was chosen so both published figures match `df`; the spec should state it | `statvfs.ts` |
| **S8** | §3.4's `model` is a single `string \| null`, but `/v1/models` returns a list. A multi-model instance is a state the contract cannot express. The first entry is shown and the discrepancy is reported as an `llama-models` entry; the spec should say whether that is right | `llama.ts` |
| **S9** | ⚠ **Which D-Bus method, and what `NoSuchUnit` means.** §3.4 says `unitState` is "D-Bus `ActiveState`" without naming a method. `systemctl show -p ActiveState llama-server@7.service` prints `inactive`, because `systemctl` calls **`LoadUnit`**, which loads the unit as a side effect. Over the read-only `GetUnit` that invariant 2 leaves available, the same unit is `org.freedesktop.systemd1.NoSuchUnit`. §6.3 makes `inactive` an **alarm**, so reporting it would infer an alarm-severity claim from an answer that literally says *I have no record of this unit*. Implemented as `null` + a `dbus` entry. Verified on the box, read-only, both ways | `dbus.ts` |
| **S10** | **No bound is specified for D-Bus, `statvfs`, `/health` or `/v1/models`.** §3.1 bounds only `nvidia-smi`, at 4 s. Four numbers were chosen, not derived: `DBUS_TIMEOUT_MS` 2000, `STATVFS_TIMEOUT_MS` 2000, `SAFETY_TIMEOUT_MS` 2000, `SERVING_TIMEOUT_MS` **4000** — the last is larger because it is the only collector talking to a process under load, and a cold prefill on this box measures 14 s. This is the same gap step 4 raised as **C2** for `dell_smm`, now four times over; the spec should state a rule | `dbus.ts`, `storage.ts`, `safety.ts`, `serving.ts` |
| **S11** | Nothing says whether an instance whose `health` is not `ok` should carry an `errors[]` entry for its blank `model`. The read was **not attempted** and the `health` cell in the same row already carries the explanation in colour, so no entry is filed. §6.5's "an em dash always has an entry behind it" reading would say otherwise. Same family as step 4's **G5** | `serving.ts` |
| **S12** | ⚠ **The spec's ufw facts are out of date.** §7's risk 3 and §6.4's standing-condition example both state `ufw enforcing = no` as current. `/etc/ufw/ufw.conf` on the box read **`ENABLED=yes`** on 2026-09-06. The collector reads the file so the dashboard is correct either way, but §6.4's only worked example of a standing condition is now a condition that does not exist | `samples.ts` |
| **S13** | §3.4 says instances are "enumerated from `/etc/llama-server/*.env`" but does not say what a `.env` file whose stem is not a bare integer means. `01.env` is **rejected** rather than read as instance 1, because §6.4 fixes condition subjects as bare integers and §9 deduplicates by condition id — two filenames mapping to one subject would silently drop an instance from the header's alarm count. Reported as an `llama-env` entry | `llama.ts` |

Still open from earlier steps and untouched here: **S1, S3, S4, S5, G1, C1, C2, C3, C4, C5,
G5, G6**.

---

## 10. For step 6

- Call the four collectors alongside step 3's and step 4's. No adapters needed.
- `safety.fanServiceState` from `collectSafety` is the **one** `ActiveState` of
  `gpu-fan-control.service` (O9). Write it to `safety.fanServiceState` **and** through
  `withServiceState(cooling, state)` to `cooling.serviceState`. `lib/contract.test.ts`
  asserts they agree.
- `storage` is `{ ...collectStorage(), net }`, where `net` comes from `collectHost`.
- `safety` is `{ ...collectSafety(), pwm5Present }`, where `pwm5Present` comes from
  `collectCooling`.
- **O18 still stands and now applies to more than `nvidia-smi`:** `nodeHttp` and `nodeDbus`
  both abandon their work at the bound rather than cancelling it. Caching the in-flight
  promise is what stops a wedged instance accumulating one abandoned socket per poll per
  tab.
- Six `ErrorSource`s are now produced by step 5 (`dbus`, `llama-env`, `llama-health`,
  `llama-models`, `statvfs`, `ufw`, `dkms` — seven, in fact). All were already in the
  eighteen. **No nineteenth name was needed.**
