# 11b TEST — the headline property was falsified a third time, and two more rows were failing open

**Written 2026-09-11 by the 11b test phase.** Nothing committed, nothing staged. `SPEC.md`,
`MOCK.html` and `INSTALL-SPEC.md` not edited by this phase (`SPEC.md` and `INSTALL-SPEC.md`
already carry the parent's file-mode correction, which is not re-litigated here). No Docker and no systemd on this Mac: every
statement about a running container is labelled *reasoned, not run*; the statements about
`next build`, `register()`, `bash` and the reader are **measured here**.

Fixing was in scope and was used: **nine defects found, nine fixed** — each with the
measurement that found it and a mutation that keeps it found — and **one recorded rather than
fixed**, because the fix contradicts a design statement and is the owner's call (§3.1).

`pnpm verify` **exit 0, 104 files, 3149 tests**, run twice. `shellcheck` clean. Step 11's
harness **exit 0, 165 mutations, all bit**; step 07's **exit 0, 153 mutations, all bit**; both
ledgers green.

---

## 0. The headline

| | |
|---|---|
| **P1 — stricter than Docker, never looser** | ⚠⚠ **FALSIFIED a third time.** 844 generated shapes, one of them ours-more-permissive: a line past 64 KiB. Docker's own package comment documents the bound; nothing here bounded a line at all. FIXED (`MAX_LINE_BYTES`), and the property is now measured over **generated** shapes, not 26 listed ones |
| **P2 — the two spellings agree** | ⚠⚠ **Yes, one can be edited so they diverge while the table passes — two ways, both measured green.** FIXED by generating the corpus (249 values). ⚠ And one layer down again: the per-VALUE rule was held equal while the per-FILE grammar was not compared at all — **five disagreements over twenty hand-edited files, three of them `check` green / container refuses to start**. FIXED |
| **P3 — startup vs request path** | Both proved, in a real node process running the real `register()`: absent file ⇒ exit 1 and the ready line is never reached; dev ⇒ warn and carries on. ⚠ But **"the process's one read" is false in the standalone build** — the reader is bundled **three times** |
| **P4 — no secret in any output** | Held over all 986 generated shapes plus every refusal path. One residual found and fixed: `check`'s bad-key row printed the key unguarded where `namedKey` bounds it |
| **P5 — `check_drift`'s expectations** | ⚠⚠ **Two more rows failing open**, measured with the inspect call failing outright: `--restart` and `-p` have EMPTY expectations by design, so `"" == ""` printed a tick. FIXED for all six reads |
| **P6 — `11-R2`’s re-aim** | It bites, but it **no longer catches the property its name claims**. Re-named, and `11b-R6` added for the call the old name was about. Anchor ambiguity is already mechanically detected; the sweep found none |
| **P7 — `instrumentation.ts`** | Re-measured by a real `next build`: emitted, traced into `.next/standalone`, edge copy carries **zero `node:fs`**. Runs once, before requests — from Next's own shipped code. ⚠ `NODE_ENV` is **compiled in**, not read at runtime |
| **P8 — names, `toContain`, prefixes, clocks** | One stale mutation name (P6). No clocks and no entropy in the new files beyond the pre-existing `realHash()` |

---

## 1. ⚠⚠ P1 — the third falsification, and it was found by generating rather than listing

### 1.1 The model was checked against the real upstream, not against memory

The build's Docker model is transcribed in `secret-file.test.ts` and labelled *reasoned, not
run*, with the note that **if the model is wrong the whole comparison is wrong with it**. So
the first thing this phase did was fetch the real thing rather than re-reason about it:

```
https://raw.githubusercontent.com/docker/cli/master/pkg/kvfile/kvfile.go
https://raw.githubusercontent.com/docker/cli/master/opts/parse.go
```

`--env-file` reaches `opts.ReadKVEnvStrings` → `kvfile.Parse(file, os.LookupEnv)` →
`parseKeyValueFile`. Every rule the build transcribed is correct — the per-line UTF-8 check,
the BOM stripped from line 1 only, `TrimLeftFunc(unicode.IsSpace)` (so Go's 25-code-point
space set, not `[ \t]`), the `#` skip, `strings.Cut` on the first `=`, the empty-key refusal,
`ContainsAny(key, " \t")`, the verbatim value, and `os.LookupEnv` for a bare line.

**One rule was missing, and it is stated in the package's own doc comment:**

> *"Maximum line-length is limited to [bufio.MaxScanTokenSize]."*

`parseKeyValueFile` ends `return lines, scanner.Err()`, and `Parse` turns any error into
*"invalid env file (…)"*. A line past 64 KiB therefore makes `docker run --env-file` **refuse
the whole file**.

### 1.2 The measurement

844 shapes were generated — every ASCII code point and 31 Unicode space/format characters in
each of five positions (inside a value, at the end of one, inside a key, at the head of a line,
alone on a line), plus 50 structural shapes — and driven through `parseSecretEnvFile` and an
independently written model of the fetched source:

```
{"total":844,"bothTake":256,"weRefuseTheyTake":558,"bothRefuse":27,"weTakeTheyRefuse":3}

a very long SESSION_SECRET line (65600 bytes) :: docker refuses (bufio.Scanner: token too long)
a very long COMMENT line (70000 bytes)        :: docker refuses (bufio.Scanner: token too long)
a very long STANDING line (70000 bytes)       :: docker refuses (bufio.Scanner: token too long)
```

**Three shapes, one cause, and the reader was the more permissive on all three.** Note the
second and third: the line that does it need not be a secret at all — a pasted comment or a
long `STANDING` list refuses the file just as hard, and no row anywhere said so.

Everything else held. 558 shapes are "Docker takes it, we refuse" — the gap the ruling exists
for — and the 256 both take yield identical values on both sides.

### 1.3 The fix, and why the bound is `>=`

`MAX_LINE_BYTES = 64 * 1024` in `lib/auth/secret-file.ts`, applied to the **undecoded bytes**
before anything becomes a string, because `bufio` counts bytes. Refused at `>=`, while the test
model refuses at `>`: `bufio`'s exact boundary depends on how its buffer grows, so the reader
takes the bound one byte tighter and the implication holds under the most demanding reading of
Docker rather than the most convenient one. Verified to bite: disabling the comparison turns
three tests red.

### 1.4 ⚠⚠ The structural fix — the property is now GENERATED, and that is the point

A hand-written table cannot falsify its own property: it only ever asks about the cases whoever
wrote it already thought of, and all **26** of its rows were green while this was true. The
implication test now runs over `GENERATED` as well as `SHAPES` — **986** built shapes, asserted
non-vacuous in both directions — and the refusal-leak test runs over it too.

The table is kept, because each row carries the sentence that says *why* the difference is the
right way round, which a generator cannot write. Three rows were added to it for the line
bound, one of them a 60 KiB line that both sides still take, so the bound has a case on each
side of it.

### 1.5 What was asked for and came back clean

| generated shape | Docker | ours | direction |
|---|---|---|---|
| every ASCII control character in a value | takes | refuses (outside printable ASCII) | stricter |
| every Go `unicode.IsSpace` code point, leading a line | skips / trims | refuses or skips with it | stricter or equal |
| `U+200B`, `U+200C`, `U+FEFF`, `U+00AD`, `U+202E` in a value | takes | refuses | stricter |
| `=` inside the value | takes (splits on the FIRST `=`) | takes, **same value** | equal |
| an empty value for either secret | takes | refuses | stricter |
| `export KEY=v` | **refuses** (space in the key) | refuses | equal |
| `export KEY` | **refuses** | refuses | equal |
| a NUL byte in a value | takes | refuses | stricter |
| no trailing newline | takes | takes, same values | equal |
| exactly the 32-character floor | takes | takes | equal |
| a duplicate key whose **second** spelling is valid | takes the last, silently | refuses | stricter |
| a line ≥ 64 KiB | **refuses** | **refuses** (as of this phase) | equal |

---

## 2. ⚠⚠ P2 — yes, they can be made to diverge while the table passes. Twice, measured

### 2.1 Two one-line edits, whole suite green

| edit to `secretValueError` | effect | suite |
|---|---|---|
| `cp > 0x7e` → `cp > 0x7f` | TypeScript accepts **DEL**; bash's `!-~` under `LC_ALL=C` still refuses it | **78/78 green** |
| swap the backslash rule and the `#` rule | a value carrying **both** gets a different *reason* from each side | **78/78 green** |

The second is the sharper one, because `secretValueError`'s own header says *"the order of the
tests below is part of the contract"* — and nothing measured the order. The 22 listed values
carried each special character but never two at once, and never a 0x7f.

### 2.2 The fix: generate the corpus

The cross-check now runs **249** values in one bash process: the 22 named ones, **every ASCII
code point except NUL** in the middle of a value (which pins both boundaries of the printable
range), and **every ordered pair of the ten characters that have a rule** (which pins the
order). Both mutations above now go red; both are entered as `11b-S17` and `11b-S18`.

⚠ **NUL is the one byte that cannot be in this table and it is not an oversight.** `execve`
takes NUL-terminated arguments and a bash variable cannot hold one, so no value containing a
NUL can reach `secret_value_error` at all. The two implementations genuinely disagree on it —
and that had to be closed at the FILE level instead, below.

### 2.3 ⚠⚠ The hole one layer down — the FILE grammar was never compared at all

`secret_value_error` ≡ `secretValueError` is the per-**value** rule. The file has a grammar of
its own — which lines are skipped, whether a key may appear twice, how long a line may be, what
a byte bash cannot hold does — and **none of it was compared.** The build's own sentence,
*"the row an operator runs before restarting says the same thing the container will"*, was not
true. Measured over twenty hand-edited files:

| file | `check` said | the container did |
|---|---|---|
| duplicate `SESSION_SECRET`, both spellings valid | **every row green** | REFUSED TO START |
| duplicate `STANDING` | **every row green** | REFUSED TO START |
| a NUL inside the secret | **"SESSION_SECRET is 64 characters, and printable-ASCII"** | REFUSED TO START |
| an INDENTED comment | line 1 has no '=' | started, correctly |
| a whitespace-only line | line 4 has no '=' | started, correctly |

The first three are the dangerous direction: a green `check`, then a container that exits 1 five
times and sits in `failed`, long after whoever ran `check` has gone. The last two are the other
one, and this project's own rule is that a refusal firing on a correct configuration teaches an
operator to ignore the one that matters.

The NUL row is the best of them: bash's `read` dropped the byte silently, so the row counted
**63** characters, called them printable ASCII, and printed a tick.

### 2.4 The fix

`check_env_file` grew the file grammar it was missing, mirroring the reader line for line:

- leading whitespace is stripped **for the skip decision only**, so an indented comment and a
  whitespace-only line are skipped (an indented *assignment* still falls through to the key
  rule, which refuses it — stricter, deliberately);
- a **duplicate key** is a failing row, naming the second line;
- a line at or past `MAX_ENV_LINE_BYTES` is a failing row;
- a **NUL anywhere in the file** is a failing row, found by comparing `wc -c` with
  `tr -d '\0' | wc -c`, because no row that reads lines can ever see it. The message says so.

`MAX_ENV_LINE_BYTES=65536` is a second spelling of a number, so it is **asserted equal** to
`MAX_LINE_BYTES` by reading both (`11b-E15` makes them drift and goes red).

**Re-measured: 20 of 20 files now get the same verdict from `check` and from the server**, and
that differential is now a test (`packaging.test.ts`) rather than a thing this phase ran once.

### 2.5 The call sites, which is what the priority actually asked about

| call site | wired? | how it is held wired |
|---|---|---|
| `env_set` → `secret_value_error` | yes | `functionBody('env_set')` text assertion + `11b-E9` |
| `check_session_secret` → `secret_value_error` | yes | a guard row drives an interior NBSP and requires *"outside printable ASCII"* — behavioural, not textual |
| `check_password_hash` → `secret_value_error` | yes | a guard row drives a quoted real hash and requires *"REFUSES this at startup"* |
| `check_password_hash` → `scrypt_hash_error` (both calls) | yes | see §6 |
| `check_env_file` → `env_value_error` | yes | `11-R1`, and the new file differential |
| `cmd_check` → `check_drift` | yes | `CHECK_ROWS` + `11b-K5` |

---

## 3. P3 — startup and request path, both proved in a real process

`instrumentation.ts` was loaded and its real `register()` called in a real `node` process, with
the real `lib/auth/secrets.ts` reading the real `/etc/ai-dashboard.env` path (absent on this
Mac, which is an honest refusal), and a line printed after `register()` returns that says the
server would now accept requests:

| environment | printed | reached "ready" | exit |
|---|---|---|---|
| `NODE_ENV=production NEXT_RUNTIME=nodejs` | the refusal, naming ENOENT | **no** | **1** |
| `NODE_ENV=development NEXT_RUNTIME=nodejs` | the refusal | yes | 0 |
| `NEXT_RUNTIME=edge` | nothing | yes | 0 |
| `NEXT_PHASE=phase-production-build` | nothing | yes | 0 |

So a malformed file at boot does not start the server, and the three skip/warn arms do not.

**The request path never throws.** A refused or unreadable file yields an empty `Environment`;
`readAuthConfig({})` is `null`; every login and every cookie is denied — a 401, not a 500. That
is asserted directly, and `11b-S13` is the mutation that turns it into a 500.

**It does not re-read per request**: the memo is measured with a counting reader — three calls
across both entrances, one read — and `11b-S11` breaks the memo.

### 3.1 ⚠ …but "the process's one read" is FALSE in the standalone build

Measured from a real `next build` (own isolated copy, §7). `lib/auth/secrets.ts` appears in
**three** server chunks, and all three ship in `.next/standalone`:

| chunk | what else is in it | who it is |
|---|---|---|
| `[root-of-the-server]__0qt04du._.js` | `lib/auth/startup.ts` | the **instrumentation** entry |
| `[root-of-the-server]__01rl4rh._.js` | `proxy.ts`, `session.ts`, `cookie.ts` | the **gate** |
| `[root-of-the-server]__1p4z_s-._.js` | `authorize.ts`, `revocations.ts` | the **route handlers** |

Each carries its own inlined copy of the parser, the rule table and the memo — the
instrumentation chunk's tail is literally `refusal:()=>s.refusal()` over a private `s`. So in
the container the file is read up to **three times**, with **three independent memos**, filled
at three different moments.

Three consequences, all *reasoned from the measured bundling*:

1. "Read once" is true **per module instance**, not per process. The doc's sentence overstates.
2. The memo's stated purpose — *"a file rewritten mid-flight by `set-password` would change the
   answer between the gate and the route"* — is **not delivered**: the gate and the route hold
   separate memos and can straddle the rewrite. `set-secret` already tells the operator to
   restart, so the practical cost is bounded, but the reason given for the memo is not the
   reason it holds.
3. More sharply: **the startup guarantee does not extend to the request-path copies.** If the
   file is replaced with a bad one after `register()` and before the first request, startup has
   already passed and the request path quietly falls to an empty environment — 401 everywhere
   with nothing logged, which is the failure this ruling exists to remove.

**Not fixed here, deliberately.** The fix is a process-wide memo (a `globalThis`-keyed cell), and
it contradicts an explicit design statement in the build document — that is the owner's call,
not a test phase's. It belongs on §6's "could not verify" list and in the next handoff.

### 3.2 ⚠ `NODE_ENV` is compiled in, not read at runtime

The same chunk shows `env:{nodeEnv:"production",nextRuntime:"nodejs",nextPhase:process.env.NEXT_PHASE}`
— Next inlines `process.env.NODE_ENV` and `NEXT_RUNTIME` at build time. Two consequences: the
container's exit arm **cannot be defeated by unsetting `NODE_ENV`**, which is stronger than the
build claims; and the Dockerfile's `ENV NODE_ENV=production` is belt-and-braces rather than the
thing that makes it true. `NEXT_PHASE` stays dynamic, which is why the build-phase arm still has
to exist.

### 3.3 ⚠ The warn arm said "REFUSING TO START" on a server that then served requests

Visible in the table above: the development row prints `ai-dashboard: REFUSING TO START — …`
and then reaches the ready line. A message announcing a refusal that does not happen is
11-A18g's shape — a true sentence about the wrong thing — and the fastest way to teach a reader
that this particular message can be ignored. **Fixed**: the warn arm appends *"NODE_ENV is not
'production', so this is a WARNING and the server is starting anyway. In the container this is
exit 1"*. The container's copy is unchanged and is still asserted to be the refusal and nothing
else. `11b-T5` is the mutation.

---

## 4. P4 — nothing printed a secret, with one residual that is now closed

The leak assertion was re-run over **all 986 generated shapes**, including every shape where the
value is what makes the line malformed: whole secret, first 16 characters, last 16 characters,
for both the hash and the session secret. **No leak.** That test is now part of the suite.

**The residual, found by reading rather than by a shape.** `lib/auth/secret-file.ts` guards the
one place a fragment of a value can reach a message — `namedKey`, which prints a bad key only
when it is 1–32 printable-ASCII characters and otherwise says *"a N-character key (not
printed)"*. `check_env_file`'s twin row printed `'${key}'` **unguarded**. An editor's hard wrap
only has to leave one `=` in the tail for a fragment of a value to arrive in key position; the
scrypt encoding uses base64url and carries no `=`, which is why this was not reachable *today*,
but the rule the build states is "not the value, not the line, not a prefix of either". Now
guarded identically, with `11b-E14` to keep it so.

`--dry-run` was re-read: `env_set` prints `<N characters, not printed>` for the two secret keys
and the value only for the others (`STANDING`, which is configuration). Unchanged and correct.

---

## 5. ⚠⚠ P5 — two more rows were failing open, and the reasoning that missed them is recorded

The build found the leak row failing open and wrote: *"Every other drift row compares two
values, so a failed read makes them differ: those fail closed."* **Measured false for two of
six.** Driving `check_drift` with the relevant `docker inspect` failing outright:

| row | expectation derived from the unit | unreadable `docker inspect` |
|---|---|---|
| `--name` | `ai-dashboard` | DRIFTED — fails closed ✓ |
| `--network` | `host` | DRIFTED — fails closed ✓ |
| the mounts | nine binds | DRIFTED — fails closed ✓ |
| **the Docker restart policy** | **empty** (the unit carries no `--restart`, deliberately) | **✓ tick** |
| **published ports** | **empty** (§2.1 publishes nothing, deliberately) | **✓ tick** |
| the env keys | derived | fails closed, but see below |

The two that fail open are exactly the two whose expectation is the empty string **because the
unit deliberately omits the flag** — so the property the row exists to defend is the property
that makes it fail open. `"" == ""` is a tick.

A seventh read had the mirror-image defect: `docker image inspect` supplies the set that is
**subtracted** from the container's environment, and its failure was swallowed by `|| true`, so
an unreadable image reported **drift on a correct box** — a false alarm rather than a false
tick, but the same "a row nobody could evaluate is not a row that decided anything".

**Fixed for all six reads, not for the two that need it today**: `container_field` performs the
read and each row files `row_unknown` when it fails. Seven guard-table cases were added — one
per read, including the three that already failed closed, so a future edit cannot quietly turn
one kind into the other — and the stubs that could not fail were given a failure gate, because
*a stub that cannot fail certifies nothing about the row that reads it*. `11b-D13`…`11b-D16`.

### 5.1 The same shape, swept for elsewhere

| candidate | verdict |
|---|---|
| `check_env_file`'s `(( bad )) \|\| row_ok` | pass condition is "nothing found", but every path that could fail sets `bad`; a read failure is caught by `env_readable` above it. **Sound** |
| `check_standing`'s `(( bad == 0 ))` | same shape, same reasoning. **Sound** |
| `unit_exec_start` returning empty | already a `row_unknown`, and it returns before the comparison. **Sound** |
| the leak row | fixed by the build. **Sound** |
| the two above | **were failing open.** Fixed |

### 5.2 ⚠ `check_drift` cannot be fooled by a comment or a continuation — but a DROP-IN defeats its premise

`unit_exec_start` was read against the ways a unit file can lie:

- **a comment** — only a `#` in column 0 is skipped, which matches systemd for the ordinary
  case. A `;` comment line inside the continuation would be taken as part of the command;
  systemd would too, at a different layer. No fail-open.
- **a line continuation** — joined correctly, and the loop stops at the first line that does not
  end in `\`.
- **a second `ExecStart=`** — for a non-oneshot service systemd refuses more than one, and an
  *empty* `ExecStart=` (the reset form) makes `unit_exec_start` return empty, which is already a
  `row_unknown`. No fail-open.
- **a drop-in** (`…/ai-dashboard.service.d/*.conf`) — ⚠ **not read at all.** A drop-in that
  resets and re-declares `ExecStart=` is what systemd actually runs, and `check_drift` would
  compare the container against the *main* unit. That direction is fail-**closed** (it reports
  drift on a box that is correct), so it is a false alarm rather than a false tick — but the
  claim *"the INSTALLED unit, which is what systemd actually runs"* is not exact while a drop-in
  can exist. `systemctl show -p ExecStart` is the truthful source, and it needs the box.
  **Recorded, not fixed**: the fix has to be measured against a real systemd.
- **a path containing a space** in a `-v` — `tr -s ' \t' ' '` and `read -ra` would split it.
  Fail-closed, and no mount on this box has one.

---

## 6. P6 — `11-R2` bites, and no longer means what its name says

The re-aim is sound: the anchor `if why="$(scrypt_hash_error "$h")"` is unique (the first call
is spelled `if ! shape=…`), and replacing it turns the malformed-hash assertion red.

**But the name is now false.** It reads *"…and an argon2id hash passes"*, and under the mutation
an argon2id hash does **not** pass: §1.5's message fix added a first `scrypt_hash_error` call
that answers the argon2id case before this one is reached. A mutation whose name is not the
property it certifies is a certificate for the wrong thing — which is the same defect one level
up as the one that made the mutation stop biting in the first place.

Fixed two ways: `11-R2` is re-named to the property it now certifies (*"stops asking
`scrypt_hash_error` for the ENCODING"*), and **`11b-R6`** is added for the call the old name was
about — the first one, whose loss makes an argon2id hash be diagnosed as a quoting problem.

**The ambiguity sweep the priority asks for is already mechanical.** `main()` counts each
anchor's occurrences and refuses to run a mutation whose anchor matches more than once
(*"replace(…, 1) would take whichever comes first"*). Every anchor in both harnesses was checked
against the current tree: **318 anchors, all unique, none missing** — and both harnesses then
ran to green, which is the same fact measured a second way.

⚠ One anchor had to be **re-aimed because this phase edited the line under it**: `11b-T3`'s
anchor included `deps.log(refusal as string);`, which §3.3 rewrote. It is now aimed at the
`if` alone. That is the ordinary cost of editing an implementation a mutation points at, and
the harness names it as `ANCHOR NOT FOUND` rather than passing quietly.

---

## 7. P7 — `instrumentation.ts`, measured against a real build and against Next's own code

A real `next build` was run in an isolated copy outside the repo (the parent's `next dev` owns
`.next/`; a symlinked `node_modules` fails Turbopack with *"points out of the filesystem root"*,
so the tree was cloned with `cp -Rc`). **Exit 0**, three static pages, TypeScript clean.

| question | answer | how |
|---|---|---|
| is `instrumentation.js` emitted? | yes | `.next/server/instrumentation.js` |
| is it traced into `.next/standalone`? | **yes** | `.next/standalone/.next/server/instrumentation.js` |
| does the edge copy avoid `node:fs`? | **yes — zero occurrences** | `.next/server/edge/chunks/_04tzagk._.js`, whose only non-vendor source is `instrumentation.ts`. The dynamic-import guard inlines to `"edge" !== "nodejs"` and the import is eliminated. **This is the line the build says no test can reach, and a real build reaches it** |
| does `register()` run once? | yes | `ensureInstrumentationRegistered` memoises `registerInstrumentationPromise` |
| before requests? | yes | `NextNodeServer.prepareImpl()` awaits `runInstrumentationHookIfAvailable()` |
| what if it throws? | Next **rethrows** out of `prepareImpl` as *"An error occurred while loading instrumentation hook: …"* | shipped `instrumentation-globals.external.js`. So a throw would also stop startup — `process.exit(1)` is still the unambiguous choice, and the build's "the documentation does not say" can now be answered from the code |
| is the build-phase skip needed? | it is a **second lock** | `registerInstrumentation` itself returns early on `NEXT_PHASE === 'phase-production-build'`. Belt and braces, not wrong |

⚠ Not measured: that the container's systemd side does five retries and then `failed`. No
systemd here; step 12 still owns it.

---

## 8. P8 — names, `toContain`, prefixes, clocks

- **Names against bodies.** The new tests in `lib/auth/secret-file.test.ts`,
  `lib/auth/startup.test.ts` and `packaging.test.ts` were read against what they assert; the one
  mismatch found anywhere was the mutation name in §6.
- **`toContain`.** The hazard is 11-A1/X59 — `--name ai-dashboard` matching `ai-dashboard2`.
  The new assertions were checked for prefix-collisions: `'160-character key (not printed)'` is
  not a prefix of the 1600-character form, and the verdict comparisons are `toEqual` over whole
  rows rather than substrings.
- **⚠ prefixes.** Every new ⚠ name is ≥ 12 matchable characters and distinctive; the harnesses'
  own scanner reports an unmatchably short name as a hard failure and reported none.
- **Clocks and entropy.** No `Date.now`, `new Date` or `Math.random` in any of the new files.
  The one non-determinism is the pre-existing `realHash()`, which spawns the real producer and
  is random by design; the suite was run repeatedly with identical results.

---

## 9. What changed in the tree

| file | change |
|---|---|
| `lib/auth/secret-file.ts` | `MAX_LINE_BYTES` and the byte-level line-length refusal; the header records the third falsification |
| `lib/auth/secret-file.test.ts` | the Docker model re-derived from the fetched upstream + its scanner bound; three table rows; `GENERATED` (662 shapes); the implication and leak tests run over it |
| `lib/auth/startup.ts` | the warn arm says it is the warn arm |
| `lib/auth/startup.test.ts` | asserts both halves of that |
| `dashboard.sh` | `MAX_ENV_LINE_BYTES`; `container_field` + `drift_unknown` and seven judged reads in `check_drift`; `check_env_file` gains the file grammar (indent-aware skip, duplicates, line bound, NUL) and the `namedKey` guard on a bad key |
| `packaging.test.ts` | the cross-check corpus is generated (249 values); the `check`-vs-server FILE differential; the shared-bound assertion; the bad-key test; seven drift guard cases; failure gates on the docker stubs |
| `pipeline/steps/11-packaging/regressions.py` | +12 (`11b-D13`…`D16`, `E10`…`E15`, `S17`, `S18`, `R6`); `11-R2` re-named |
| `pipeline/steps/07-auth-login/regressions.py` | +2 (`11b-S16`, `11b-T5`); `11b-T3` re-aimed onto the edited line |

Not edited by this phase: `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md`, `next-env.d.ts`
(`8195d2c60ce847a459ae9d308d6a5724`, unchanged). No `.env`. Nothing committed, nothing staged.

### Run log — exit codes, pasted rather than described

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"

pnpm verify                                             exit 0
  Test Files  104 passed (104)
  Tests       3149 passed (3149)      (was 104 / 3144 — +5)
  Type Errors no errors
  ⚠ run TWICE after the final state, identical both times

shellcheck dashboard.sh                                 exit 0   (0.11.0, no output)

python3 pipeline/steps/11-packaging/regressions.py       exit 0
  All 165 regressions failed their check, as they must.      (130 → 152 → 165, +13 here)
  Red-test ledger: 71 distinct failing tests across 165 mutations; 71 ⚠-marked tests checked.
  Every ⚠-marked test went red under at least one mutation.

python3 pipeline/steps/07-auth-login/regressions.py      exit 0
  All 153 regressions failed their check, as they must.      (151 → 153, +2 here)
  Red-test ledger: 223 distinct failing tests across 153 mutations; 149 ⚠-marked tests checked.
  Every ⚠-marked test went red under at least one mutation.

next build (in an isolated copy outside the repo)        exit 0
  ✓ Compiled successfully · Finished TypeScript · 3 static pages
  instrumentation.js emitted, traced into .next/standalone, edge copy free of node:fs
```

⚠ Step 06's harness was **not** re-run: this phase changed nothing in `lib/telemetry/`.

---

## 10. ⚠ An operational finding, paid for once: a KILLED harness leaves its mutation applied

Two harness runs were started against the same tree by mistake, and one of them was then killed
with `SIGKILL`. Both facts matter for anyone running these again:

- **Two harnesses must never run at once.** They mutate and restore the same files, so each
  sees the other's mutation as its own anchor going missing. The run printed seven
  `ANCHOR NOT FOUND` lines for anchors that were perfectly present — including on `Dockerfile`
  and the unit, which this phase never touched. The finding looks exactly like "the
  implementation moved", and it is not.
- **`path.write_text(original)` lives in a `finally`, which `SIGKILL` skips.** Nine mutations
  were left applied across `dashboard.sh`, `Dockerfile`, `systemd/ai-dashboard.service`,
  `lib/auth/handler.ts` and `proxy.ts` — including `--read-only` deleted from the unit and the
  runtime image silently moved to `node:26-slim`.

`pnpm verify` caught it (10 red tests) and every one was reversed by reading the harness's own
`(old, new)` pairs back out and applying them in reverse — the same table that applied them.
The tree was then re-verified green, **twice**, and both harnesses re-run from scratch. Worth a
line in HANDOVER: after any interrupted harness run, re-run `pnpm verify` before believing the
tree, because a stranded mutation is a silent, plausible-looking edit.

---

## 11. What the next phase inherits

1. ⚠⚠ **The reader is bundled three times in `.next/standalone`** (§3.1). "One read per
   process" is false, the memo's stated purpose is not delivered, and the startup guarantee
   does not cover the request-path copies. A process-wide memo is the fix and it is the owner's
   call. **Step 12 can confirm it in one command**: start the container, then
   `docker exec … cat /proc/1/io` or strace the opens of `/etc/ai-dashboard.env`.
2. **§1.1's model is now sourced rather than remembered**, and the one rule it was missing has
   been found and fixed. Step 12's confirmation (`docker run --env-file … env` per shape) is
   still worth running, and the 64 KiB line is now the first shape to try.
3. **`check_drift` does not read drop-ins** (§5.2). Fail-closed, so not urgent, but the claim
   "the unit systemd actually runs" needs `systemctl show -p ExecStart` to be exact.
4. The build's §9 spec-silence list is unchanged by this phase and still needs the owner:
   the `0640 root:<gid>` mode above all.
