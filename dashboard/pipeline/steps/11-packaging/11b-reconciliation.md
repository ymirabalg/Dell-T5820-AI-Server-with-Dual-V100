# 11b RECONCILIATION — **the guard built to make O21 loud had a silent failure of its own, and the table built to close the check-vs-server hole was a hand-written list. Both are closed at the cause: one read shared by the whole process, and a generated corpus of 276 files.**

**Written 2026-09-11 by the 11b reconcile phase.** Nothing committed, nothing staged. `SPEC.md`,
`MOCK.html` and `INSTALL-SPEC.md` **not edited** — §7 records the wording they still need. No
`.env`; `next-env.d.ts` byte-identical. **No guard weakened**: every change below adds a refusal,
adds a row, tightens a bound or makes a read judged.

**There is no Docker and no systemd on this Mac.** Every claim about a running container, a bind
mount or a real boot is labelled **reasoned, not run**; everything about `bash`, `awk`, the reader
and the corpus is **measured here**.

---

## 1. The adjudication — all fourteen findings

| # | Verdict | What was done, and the checkable reason |
|---|---|---|
| **11b-A1** — `check_env_file` is missing whole-file rules the reader has; 11 of 45 generated files are a green `check` and a container that will not start | ⚠⚠ **ACCEPTED — fixed, and the corpus found a FOURTH cause the finding did not name** | All three named causes are closed in `check_env_file`, plus one more that only a generated sweep could have found. (1) a **`\r` anywhere in the file**, not only one that survives into a value; (2) a **BOM anywhere**, not only inside `STANDING`; (3) the **64 KiB line bound moved ABOVE the comment/blank skip**, so a large comment or whitespace-only line is measured — it was the shape the test phase's own §1.2 named and fixed in the reader while reintroducing it one table over; and (4) ⚠⚠ **invalid UTF-8**, which no finding named: the reader decodes with `TextDecoder(…, {fatal:true})` and Docker calls `utf8.Valid` per line, and one latin-1 comment was a green `check` and a container that refuses to start. **Measured: 21 of 276 generated files violated the property before, 0 after.** §2 |
| **11b-A2** — the differential that closes A1's class is itself a 21-row hand-written table | ⚠⚠ **ACCEPTED — the priority of the loop, and closed at the CAUSE rather than by adding rows** | The 21 rows are kept (each carries the sentence that says *why* the difference is the right way round, which a generator cannot write) and the property is now carried by **`GENERATED`: 19 payloads × 13 positions + 29 structural shapes = 276 files**, run through the real `check` rows and the real `parseSecretEnvFile`. ⚠ And the property is restated as an **implication** rather than as an equality, because a two-way equality *cannot* be generated here: `check` is stricter on purpose in places (a quoted `STANDING` is refused by `check` and accepted by the reader, and must be — systemd's `EnvironmentFile` strips quotes where Docker keeps them). The direction that costs an operator anything is **"if every `check` row is green, the container starts"**. §2 |
| **11b-A3** — the startup guarantee does not survive the first in-place write, and the failure is completely silent | ⚠⚠ **ACCEPTED — the finding that governed this loop. Fixed, shape chosen and justified.** | **One read, shared** (`lib/auth/secrets.ts`): the source lives in a `Symbol.for`-keyed cell on `globalThis`, so the three bundled copies of that module resolve **one** source and the file is read once for the process, by whichever entrance is first. A post-boot edit then cannot change behaviour at all — §4's own precedent, and what `set-password`'s *"run `dashboard.sh restart`"* has always promised. **⚠ And the property TESTED is "never silently degrades", not "reads once"**: `makeSecretSource` takes an `onDegraded` reporter, called at most once and **only when `environment()` — a request path — is the entrance that performed the read and the read was refused**, so the claim holds in every ordering including the one where `register()` never ran. §3 |
| **11b-A4** — `env_set`'s `mv` renames onto the bind-mount source, so `set-password` can never reach a running container, and nothing compares the two inodes | ⚠ **ACCEPTED IN PART — the reachable half fixed; the inode COMPARISON deferred to step 12, with the reason** | The `mv` itself is **not** undone and must not be: `install` copies onto the destination and an interrupt in that window leaves a truncated credentials file (11-A17). What was wrong was **where the warning lived** — two callers printed it and `env_set`, the one function that writes this file, printed nothing, so any third writer got silence. It is now inside `env_set`, it fires when a container is **actually running** rather than when a unit is merely installed, and it names the mechanism (*"a bind mount pins the INODE … `check` reads the new file, so every row will be green while the container denies the new password"*). **Deferred:** a row that compares the file the container has open with the file on the host. It needs Docker, and the only readings available (`docker exec … stat -c %i`) cannot be written or measured here. Step 12, §6 |
| **11b-A5** — `check_env_file` prints a green tick on a file it could not read at all | ⚠⚠ **ACCEPTED — fixed, and the sweep that cleared it is on record as having done so** | Three changes. (a) `check_env_file` now refuses a **directory** by name — *"docker run -v creates the host path as a directory when it is missing, so this is what a 'start' before a 'configure' leaves behind"* — and any other non-regular file, before it reads a byte. (b) The NUL row's two command substitutions are **captured and defaulted** (`${total:-0}`), so a failed read can no longer turn the comparison into a bash **syntax error** whose failure nothing judged. (c) `env_readable` is `[[ -f && -r ]]`: `[[ -r ]]` alone is **true for a readable directory**, which is why the test phase's §5.1 reasoning — *"a read failure is caught by `env_readable` above it"* — was measured false. `env_unreadable_row` now distinguishes the two causes rather than telling an operator to re-run with `sudo` on a path that is not a file at all |
| **11b-A6** — the gid the mode row expects comes from the REPO's unit; every drift expectation comes from the INSTALLED one | ⚠⚠ **ACCEPTED — fixed on both sides** | `container_user` reads **`$UNIT_PATH` first** and falls back to the repo's copy (the ordinary pre-`unit` state, since `configure` legitimately runs before anything is installed) — the container systemd starts has the installed unit's uid, so that is the number the mode of a file it must *read* has to come from. **And a new `check_unit` row compares the installed unit's `ExecStart=` with the repo's**, which nothing anywhere did: that closes A6's *"there are two units and this reads the one systemd does not run"* and A8's second-order half at the same time (see below). Measured: `container_gid` is 10001 against the repo's unit and 10002 against an installed one carrying `--user 10002:10002` |
| **11b-A7** — `configure` never repairs an existing file's mode | ⚠ **ACCEPTED — fixed, and the failing row now has the `Fix:` line it lacked** | `env_repair_mode` is a step of `cmd_configure` in its own right rather than a side effect of writing a value. Measured: against a pre-ruling `0600 root:root` file with every value already present, `cmd_configure` printed three green *"already present"* lines, never called `env_set`, and left the mode alone; it now moves the file to `0640` and says what it was. Dry-run announces it and changes nothing. The mode row in `check_env_file` — the only failing row in that function with no `Fix:` line, on the one condition this loop introduced — now names `configure`, which is now measured to work |
| **11b-A8** — `check_drift` compares six of the unit's ~14 flags and the document says "the whole flag set" | ⚠ **ACCEPTED — six more rows, and the two the finding names by name are among them** | Added, each with its expectation derived from the unit and its read judged: **`--read-only`**, **`--user`**, **`--pid`**, **`--tmpfs`**, **`--rm`** and **`--log-driver`**. `unit_has_flag` is new, because `unit_flag_value` prints the token *after* a flag and for `--read-only` that is `--tmpfs`. ⚠ **The second-order half is closed differently and more completely**: the two rows whose labels state an absolute (*"systemd owns restarts"*, *"§2.1: NONE"*) still derive their expectation from the installed unit — that is correct, because it is what systemd runs — and what was missing was anything holding the **installed** unit to the reviewed one. A6's new row does that. **Not added:** the `--log-opt` **map** comparison. `.HostConfig.LogConfig.Config` is a map whose normalisation cannot be written against a real `docker inspect` here, and the driver row already catches the change that matters. Recorded, §6 |
| **11b-A9** — `SecretSource.require()`, the documented startup entrance, has no production caller | ⚠ **ACCEPTED — and it is DELETED, not wired. The reason is the build's own.** | Wiring it would have meant **changing the startup contract to a throw**, and `startup.ts` states in full why it is an explicit `process.exit(1)` instead: *"Next's documentation does not say what happens when `register` rejects, and a startup refusal that left the server running would be the silent failure this ruling exists to remove"* — and the test phase then confirmed from Next's shipped code that a throw is rethrown out of `prepareImpl` wrapped in *"An error occurred while loading instrumentation hook"*, which is a worse message for the same effect. So the dead entrance is gone, the interface is the two live ones, and **`refusal()` — the entrance the whole ruling turns on and which had no test of its own — now has five**. An exported seam nothing uses is the hazard step 7 already removed once (`noSessionVerifierYet`) |
| **11b-A10** — the Docker line-length model is one byte LOOSER than Docker | ⚠⚠ **ACCEPTED — fixed, and INDEPENDENTLY RE-VERIFIED by this phase** | `src/bufio/scan.go` was re-fetched rather than taken on the finding's word: `if len(s.buf) >= s.maxTokenSize \|\| len(s.buf) > maxInt/2` with `newSize = min(newSize, s.maxTokenSize)` and `MaxScanTokenSize = 64 * 1024`. The buffer is capped at exactly the bound and the give-up test is `>=`, so **a line of 65536 bytes or more is `ErrTooLong` and 65535 + `\n` is fine** — determinate, not buffer-growth-dependent. The test's model now refuses at `>=`; the two sentences that claimed otherwise (in `secret-file.ts` and in the test) are corrected to what `scan.go` says. ⚠ The reader's own bound was **already exact** and did not move |
| **11b-A11** — the dry run announces the OLD mode, and a `check` row tells the operator the old mode is correct | ⚠ **ACCEPTED — both halves fixed** | `cmd_set_password --dry-run` now prints `(0640 root:$(container_gid))`, `env_set`'s own spelling rather than a second one — it returned *before* `env_set`, so the fix that reached `env_set`'s two dry-run arms missed it, the same "one of two callers" shape as 11-A7 in the same function. `env_unreadable_row` no longer tells its reader that *"a correct deployment is root:root 0600"*, which since the ruling is the one mode that produces the silent 401 the ruling exists to remove |
| **11b-A12** — a refusal can print up to 32 characters of a secret; the module's own absolute is not literally true | ⚠ **ACCEPTED — the bound moved AND the sentence changed; the finding asked for either** | `MAX_NAMED_KEY_CHARS = MIN_SESSION_SECRET_CHARS - 1`, **derived from the floor in both spellings** (`(( ${#key} < MIN_SECRET_CHARS ))` in bash) rather than retyped, so **a printed key can never be a whole secret of this build's** — the old bound was 32, which *is* the floor. And the module header's absolute is now the true one: never the value and never the line, and a bad key only within a bound that is stated, with the residual (a *fragment* of a longer secret) named rather than claimed away. Both sides of the bound are fixtured, in both spellings |
| **11b-A13** — a read that blocks makes `register()` never return | ⚠ **ACCEPTED IN PART — the reachable class closed; the rest recorded as irreducible without a timeout** | `lib/auth/secrets.ts` now `statSync`s before it reads and refuses a path that is not a regular file: a `stat` does not open the file, so it cannot block on a FIFO, and a directory/`EACCES`/`ENOENT` already threw and were already caught into a refusal. `check` gained the mirror rule in the same loop (A5), so the two agree. ⚠ **Not closed:** a read that blocks on a hung NFS or fuse mount blocks in `stat` too, and `runStartup` has no timeout. Adding one means deciding what a *timed-out* credentials read should do, which is a §5 question and not this phase's. Recorded in the module and in §6 |
| **11b-A14** — the model's `os.LookupEnv` branch is never exercised | **ACCEPTED — fixed, and the step-12 consequence is the point** | A test now drives a bare line with and without the variable set in `hostEnv`: with it, Docker builds a **complete, working** container from a file this reader refuses; without it the key is simply absent. That makes the branch measured, and — the part that matters — it writes down that step 12's planned `docker run --env-file … env` confirmation **gives different answers depending on the invoking shell's environment** for the bare-line shapes |

**Counts — 14 findings, 14 rows:**

| verdict | rows | which |
|---|---|---|
| ⚠ **ACCEPTED and fixed in this loop** | **12** | A1, A2, A3, A5, A6, A7, A8, A9, A10, A11, A12, A14 |
| ACCEPTED IN PART, the remainder DEFERRED to step 12 with a named reason | **2** | A4 (the inode comparison), A13 (a read that blocks in `stat`) |
| REJECTED | **0** | — |
| | **14** | |

⚠ **A8 is counted once, in the first row.** Its six flag comparisons are built; its one
deliberately-not-done sub-item (`--log-opt`'s map, which cannot be normalised without a real
`docker inspect`) is recorded in §6 rather than making the whole finding a partial.

⚠ **Zero rejections is the shape a rubber stamp makes, so here is what was actually checked.**
Every one of the fourteen was re-derived against the tree before being accepted, and two claims
were **re-measured rather than inherited**: A10's reading of `bufio` (re-fetched from
`golang/go`, quoted above) and A1's count (this phase's own corpus found **21 of 276**, against
the finding's 11 of 45 — the same defect, measured over a wider sweep). One scope correction is
recorded in §2.3 rather than as a rejection, because it makes this loop's test *stricter* than
the finding's method rather than weaker.

---

## 2. ⚠⚠ 11b-A1 / 11b-A2 — the corpus, and what it found

### 2.1 The method

`packaging.test.ts` gained `checkFileVerdicts`, which writes N files and runs the real `check`
rows over all of them in **one** `bash` process — `validate`'s shape, applied to files instead of
to values. The corpus is built rather than listed:

| | |
|---|---|
| **payloads (19)** | `\r`, a BOM, a NUL, U+00A0, U+200B, `"`, `'`, `$`, a backtick, `\`, `#`, a space, a tab, DEL, a C0 control, `=`, a plain letter (the control), a **70000-byte run**, a **40000-character multibyte run** |
| **positions (13)** | inside a comment · at the end of one · inside an **indented** comment · alone on a line · on an otherwise blank line · inside `SESSION_SECRET` · at the end of it · inside `STANDING` · inside a **non-secret key's value** · inside a **key** · at the head of a line · **on line 1, before everything** · on a trailing line with no newline |
| **structural (29)** | an empty file, comments only, the 64 KiB bound **on both sides and in three regions**, duplicates, a leading-digit key, a key with a space, an **empty key**, an indented empty key, a lone `#`, a whole-file CRLF, a lone CR at the very end, each secret absent, an empty secret, `export KEY=`, a bare tail line, a wrapped tail that puts a fragment in **key position**, and four **byte-level** shapes that cannot be written as a JavaScript string at all — a lone `0x80`, a truncated two-byte sequence, an overlong `/`, a lone `0xff` |
| **total** | **276 files** |

⚠ **The interior of `PASSWORD_HASH` is deliberately not a position**, and the exclusion is not
squeamishness: `check_password_hash` judges the **scrypt encoding**, which the server cannot judge
at all (§5 makes a bad hash and a wrong password the same 401), so `check` is stricter there by
design and that region is measured by the O20 table instead.

### 2.2 The result

```
BEFORE — 21 of 276: every check row green, lib/auth/secret-file.ts REFUSES TO START
  a CR / a BOM / a 70000-byte run / a 40000-character multibyte run   inside a comment
  the same four                                                       at the END of a comment
  the same four                                                       inside an INDENTED comment
  a BOM inside STANDING          a BOM inside a NON-secret key's value
  a comment line exactly AT the bound        a comment line one byte OVER the bound
  a blank line exactly AT the bound          a final line AT the bound with no newline
  a lone 0x80 in a comment                   a truncated 2-byte sequence in a non-secret value
  an overlong encoding of "/" in a comment

AFTER — 0 of 276.
```

Four causes, not the three the finding named — the fourth is **invalid UTF-8**, which is in the
list above three times and which no hand-written table had asked about on either side.

### 2.3 ⚠ The scope of the comparison, stated precisely

`checkFileVerdicts` runs **`check_env_file` + `check_password_hash` + `check_session_secret`**, and
deliberately **not** `check_standing`, which `cmd_check` also runs. That makes the demand
**stricter** than the operator's real run — a fourth row can only add refusals, never remove them
— and it is why one of the 21 above (`a BOM inside STANDING`) is a file the full `cmd_check` would
independently have caught through `check_standing`'s non-ASCII rule. The other twenty were green
everywhere.

### 2.4 The fix, rule by rule

| rule | where | what it mirrors |
|---|---|---|
| a `\r` **anywhere in the file** | `check_env_file`, `grep -q $'\r'` | `secret-file.ts`'s `text.includes('\r')` |
| a **BOM anywhere** | `check_env_file`, `grep -q $'\xef\xbb\xbf'` | `text.includes('﻿')` |
| the 64 KiB bound **before the skip** | the line loop | the reader's byte scan, which runs over every line |
| **valid UTF-8** | `file_is_utf8` | `TextDecoder('utf-8', { fatal: true })` |

⚠ **`file_is_utf8` is `awk`, not `iconv`, and that was measured rather than preferred.** macOS's
`iconv` **accepts** `\xf5…` and `\xf4\x90…`, both of which encode past U+10FFFF and both of which
the reader refuses — so an `iconv`-based row would have been *looser than the server on the
machine this suite runs on*, which is the whole defect this loop is about. The `awk` validator is
Go's and `TextDecoder`'s rule exactly (overlong, surrogate, past U+10FFFF and truncated are all
invalid) and was checked against `TextDecoder` over **thirteen** edge cases here **and against
gawk on ai-server** — identical verdicts on every one, on the machine that will actually run it.
It is gated behind `grep -q $'[\x80-\xff]'`, so a pure-ASCII file pays one `grep`.

### 2.5 ⚠ A performance defect found by building the corpus, and it was reachable on the box

The leading-whitespace strip in `check_env_file` was
`while [[ "$stripped" == ' '* ]]; do stripped="${stripped#?}"; done` — **quadratic**, one whole-line
copy per leading blank. A 65 535-byte whitespace-only line (one byte under the bound, so a line
`check` must still read) made that row copy about four gigabytes. It is now one expansion,
`${line#"${line%%$ENV_INDENT_RUN}"}`, which is O(n). Measured: the corpus sweep went from **34 s to
~15 s** on that change alone. This was not in any finding; it was found by generating files large
enough to make it visible, which is the second thing the corpus bought.

---

## 3. ⚠⚠ 11b-A3 — the shape chosen, and why

### 3.1 What was measured, restated

Three independent `makeSecretSource` instances over one path — which is what three bundle copies
are — gave: startup validates, `register()` returns 0, the server is ready; an **in-place** append
follows; the gate's and the routes' copies each memoise an **empty** `Environment`; every login is
a 401; **nothing is logged**, because `runStartup` is the only thing that ever consults `refusal()`
and it has already run; and the process never exits, so `Restart=always` never fires and
`StartLimitBurst` never counts. O20's symptom, through O21's guard.

### 3.2 The choice: **one read, shared** — and why not the other shape

The handoff named two honest shapes. This is the first.

`lib/auth/secrets.ts` keeps the source in a cell keyed by `Symbol.for('ai-dashboard.credentials.2026-09-11')`
on `globalThis`. The global symbol registry is shared across every realm of the agent and
`globalThis` is shared by every Node-runtime chunk of one server process, so the three bundled
copies of that module resolve **one** source. The file is read once for the process, by whichever
entrance is first.

**Why this and not "re-read, but never silently degrade":**

1. **A post-boot edit then cannot change behaviour at all**, which is §4's own precedent — *a
   `STANDING` change takes effect on the next container restart* — and exactly what
   `set-password`'s and `configure`'s *"run `dashboard.sh restart`"* warnings already promise. The
   re-reading shape would make those warnings false in one direction and true in another.
2. **It delivers the memo's stated purpose**, which the per-bundle memo did not: *"a file rewritten
   mid-flight by `set-password` would change the answer between the gate and the route"*
   (`secret-file.ts`). With three memos the gate and the route could straddle the rewrite; with one
   source they cannot, and there is a test that says so.
3. **A re-reading request path turns an unreadable file into a `readFileSync` per request**, which
   is a new failure mode on the path §5 requires to be total.
4. It is the shape that matches what the deployment actually is: a container whose credentials file
   is **bind-mounted by inode** (11b-A4), where an external in-place edit is the *only* way the
   bytes can change under a running process at all.

### 3.3 ⚠⚠ …and sharing is NOT what the property is tested on

Sharing makes the ordinary case correct. It is not what makes the failure safe, and a guarantee
that rests on `globalThis` being shared is a guarantee that rests on a bundling detail this phase
cannot measure without a `next build`. So the tested property is the handoff's:

> **`credentialEnvironment()` never returns an empty environment without a refusal having been
> written to stderr** — by the startup check that read the file, or by the request path itself.

`makeSecretSource(readBytes, path, onDegraded)` calls `onDegraded` **at most once per source**, and
**only when `environment()` is the entrance that performed the read and the read was refused**.
That is exactly once in every ordering:

| who reads first | what happens |
|---|---|
| `instrumentation.ts` → `startup.ts` → `refusal()` | prints the refusal and `exit(1)` in the container, or warns in development. `onDegraded` is not called — reporting there too would print one refusal twice on the path that is already loud |
| a request path → `environment()` | prints the refusal itself, **once**, then returns the empty environment. §5's 401-never-500 is untouched: it reports, it does not throw |
| a request path after startup | the cell already holds the answer; nothing is reported again, because startup already said it |

⚠ **The headline of the request-path message is its own sentence, not the startup one.** It says
*"the server is RUNNING and EVERY login and every session is now denied with a 401"*, because a
message announcing *"REFUSING TO START"* from a process that then serves requests is 11-A18g's
defect — a true sentence about the wrong thing — and the test phase paid for exactly that shape
once already in `startup.ts`'s warn arm. There is a test that the two do not borrow each other's.

⚠ **A refusal on stderr is not §5's *"nothing is logged about authentication"***. It names keys and
reasons, never a value, never a request and never an attempt; it is a statement about a
configuration file, written at most once per process, and it is the same thing `startup.ts` has
been writing since the ruling.

### 3.4 How it is measured without a container

`lib/auth/secrets.test.ts` is new. A bundle boundary and `vi.resetModules()` produce **the same
thing** — a second, independent instance of one module graph in one process — so every test there
imports the module **twice** and treats the two copies as the gate and the route, with `node:fs`
mocked so that *how many times the file is read, and by whom* is askable at all. The A3 scenario is
a test by name: read a good file, append in place, load two more instances, and require that both
still answer with the good values and that the disk was read **once**.

### 3.5 11b-A9 is part of this fix: `require()` is **deleted**

Stated plainly because the handoff asked which: **deleted, not wired.** Wiring it would have meant
changing the startup contract from `process.exit(1)` to a throw — the option the build weighed and
rejected in writing, and which the test phase then measured produces Next's own *"An error occurred
while loading instrumentation hook"* wrapper. The interface is now its two live entrances, the four
assertions that existed only about `require()` are gone, and `refusal()` — the entrance the ruling
turns on, which had no test of its own — has five.

---

## 4. What else changed, and where

| file | change |
|---|---|
| `lib/auth/secret-file.ts` | `require()` deleted; the memo holds **refusals** rather than rendered text, so one read can be rendered under two headlines; `onDegraded`; `refusalHeadline` / `degradedHeadline`; `MAX_NAMED_KEY_CHARS`; the `bufio` paragraph corrected against `scan.go`; the "never a character of either" absolute corrected to the true one |
| `lib/auth/secrets.ts` | the `Symbol.for` cell; `statSync` before the read; the whole 11b-A3 account |
| `lib/auth/secrets.test.ts` | **new** — two module instances as the gate and the route, the in-place-rewrite scenario, the never-silently-degrade property, the FIFO gate. Added to **step 07's** `LEDGER_FILES` (ownership follows the file) |
| `lib/auth/secret-file.test.ts` | the source tests rewritten for the two-entrance contract and the report; the `bufio` model refuses at `>=`; the `os.LookupEnv` branch exercised |
| `dashboard.sh` | the four whole-file rules and `file_is_utf8`; the directory / non-regular-file rows; `env_readable` gains `-f`; `env_unreadable_row` distinguishes its two causes and names the right mode; the line bound moved above the skip; the O(n) indent strip; the printed-key bound derived from `MIN_SECRET_CHARS`; `container_user` reads the installed unit first; `check_unit` compares the installed unit with the repo's; `env_repair_mode` + `configure` calling it; `env_set`'s inode warning; `set-password --dry-run`'s mode; `unit_has_flag` and **six** more `check_drift` rows |
| `packaging.test.ts` | `checkFileVerdicts` and the 276-file generated corpus; the implication test; the printed-key bound on both sides in both spellings; the not-a-regular-file diagnosis; `configure` repairing a mode; `env_set`'s warning in both directions; `container_gid`'s provenance; six new `docker inspect` stubs (each of them failable, because *a stub that cannot fail certifies nothing about the row that reads it*) and fifteen new guard cases |
| `README.md` | the read-once paragraph rewritten to say *once for the process*, and the inode paragraph added |
| both harnesses | §5 |

---

## 5. Run log — exit codes, pasted rather than described

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"

pnpm verify (cold)                                       exit 0
  Test Files  105 passed (105)          (was 104)
  Tests       3171 passed (3171)        (was 3149 — +22)
  Type Errors no errors

shellcheck dashboard.sh                                  exit 0   (0.11.0, no output)

python3 pipeline/steps/11-packaging/regressions.py       exit 0
  All 181 regressions failed their check, as they must.          (165 -> 181, +16)
  Red-test ledger: 78 distinct failing tests across 181 mutations; 78 ⚠-marked tests checked.
  Every ⚠-marked test went red under at least one mutation.

python3 pipeline/steps/07-auth-login/regressions.py      exit 0
  All 158 regressions failed their check, as they must.          (153 -> 158, +5 and -1)
  Red-test ledger: 237 distinct failing tests across 158 mutations; 163 ⚠-marked tests checked.
  Every ⚠-marked test went red under at least one mutation.

  zero ANCHOR NOT FOUND, zero ANCHOR AMBIGUOUS, zero DID NOT BITE across both

git status                                               inherited modifications + this loop's,
  nothing committed, nothing staged, no .env, no stranded mutation
  (Dockerfile and .dockerignore are absent from it, as they must be — 11b touched neither)

pnpm verify (cold, re-run AFTER both harnesses)          exit 0
  Test Files  105 passed (105) · Tests 3171 passed (3171) · no type errors
shellcheck dashboard.sh (re-run after both harnesses)    exit 0
next-env.d.ts  8195d2c60ce847a459ae9d308d6a5724          unchanged
```

⚠ **Both harnesses were run SERIALLY, in one command, and neither was interrupted** — the test
phase stranded nine mutations by killing one, and the restore lives in a `finally` that `SIGKILL`
skips. `pnpm verify` was not run alongside either.

⚠ **The step-11 harness is now materially slower, and step 12 inherits that.** The generated
corpus adds ~15 s to every `pnpm vitest run packaging.test.ts`, and the harness runs one per
mutation. If it becomes a problem the cheapest saving is to collapse `check_env_file`'s four
whole-file scans (`wc`, `tr`, two `grep`s and the `awk`) into **one** pass over the file; that is
~2.5 forks per file out of about ten. It was not done here because it is an optimisation made
under time pressure to a function this loop had just rewritten.

### 5.1 ⚠⚠ The first step-11 run returned **1**, and the harness was right

The red-test ledger reported one ⚠ test as **never reddened by any mutation** — while the same
run's own log showed it going red under `11b-U1`, three hundred lines above. Both statements were
true, and the reason is a rule worth carrying:

> **An ESCAPED quote in a ⚠ test's name makes the ledger's key unmatchable.**

The name was written `test('… not from the repo\'s copy', …)`. The ledger reads a test's name out
of the **source literal**, where it is `repo\'s`; Vitest reports the name it *runs*, which is
`repo's`. The two never matched, so the ledger could never credit the mutation that reddens it —
and the failure mode is the good one: it reported the test **inert** rather than covered. Fixed by
double-quoting the literal, which is also what this repo's lint rule prefers for a string
containing an apostrophe. ⚠ **Swept: it is the only escaped quote in a ⚠ name anywhere in the
suite** (`grep` over every `*.test.ts`/`*.test.tsx`), so nothing else is mis-keyed today.

**And step 07's first run returned 1 for a different reason, which is the ledger doing its other
job.** `⚠ a bare line is Docker reading the HOST environment, and this reader refuses it either
way` (11b-A14's new test) was reported inert, correctly: every assertion that distinguished it was
about `dockerEnvFile`, which is the **model** and lives in the test file, and its one production
assertion (`parseSecretEnvFile(bare).ok === false`) still held under `11b-S6`, the mutation that
disables the bare-line rule — because with `at < 0` un-handled, `line.slice(0, -1)` leaves a key one
character short and `SESSION_SECRET` is then *absent*. **A true refusal for the wrong reason**,
which is 11-A18g and which sends an operator to the wrong line. Fixed by asserting the **sentence**
rather than the verdict, and probed by hand: `11b-S6` applied, the test goes red; restored, green.

Both harnesses were then re-run **from scratch, serially, on the corrected tree**, and the numbers
in §5 are that second run's.

---

## 6. What this phase could NOT verify, and who owns it

| | why | owner |
|---|---|---|
| Every container and systemd claim | **No Docker and no systemd on this Mac.** The inode pinning, *"docker run -v creates the source as a directory"*, the `EACCES` path and the `Restart=always` / `StartLimit` consequences are all **reasoned, not run** | step 12 |
| That the three bundled copies really do share one cell | Needs a `next build` in an isolated copy and a running container. **The mechanism is measured** (two module instances share the cell and read once); that `next build` produces exactly three Node-runtime chunks in one realm is the test phase's measurement, not this one's. ⚠ The `onDegraded` guarantee is what does **not** depend on it | step 12 |
| A row comparing the container's open inode with the host's file (11b-A4) | Needs Docker to write against. ⚠ **And never `docker exec … cat`**: the only safe reading is an inode or a digest, never the contents | step 12 |
| A read that blocks in `stat` (11b-A13) | A hung NFS/fuse mount blocks `statSync` too. A timeout means deciding what a *timed-out* credentials read should do, which is a §5 question | owner, §7 |
| ⚠ **The exact `docker inspect` shape of the six NEW drift fields** | `.HostConfig.ReadonlyRootfs`, `.Config.User`, `.HostConfig.PidMode`, `.HostConfig.Tmpfs`, `.HostConfig.AutoRemove`, `.HostConfig.LogConfig.Type` — all **reasoned, not run**, like the six the build added. The two worth watching are **`.Config.User`** (does docker echo `10001:10001` verbatim, or normalise it?) and **`.HostConfig.Tmpfs`** (a map whose key should be `/tmp`). If either is spelled differently the row reports drift **on a correct box**, which is a false alarm rather than a false tick — but it is the shape that teaches an operator to ignore the row that matters, so it is the first thing to look at | step 12 |
| `--log-opt`'s map in `check_drift` (11b-A8) | `.HostConfig.LogConfig.Config` normalisation cannot be written against a real `docker inspect` here; the driver row catches the change that matters | step 12 |
| `docker run --env-file` against the 276 shapes | Needs the box. ⚠ First shapes to try: a line of **exactly 65536 bytes**, an **invalid UTF-8 comment**, and — per 11b-A14 — a **bare line**, whose answer depends on the invoking shell's own environment | step 12 |

---

## 7. Spec silences and wording still owed — recorded, not improvised (invariant 7)

⚠ `SPEC.md` §5 and `INSTALL-SPEC.md` §11.3 **already carry the parent's file-mode correction**, so
11b-build.md §9 row 1 is closed. What is still owed:

| # | what it says now | what this loop makes true | why |
|---|---|---|---|
| **1** ⚠ | `INSTALL-SPEC.md` §6 (line 239) and §7's table (line 278) and §9's row (line 371) still say **`root:root` 0600** and *"read by the **client**, as root, on the host — which is why 0600 root:root is correct and **the container never sees the file**"* | `root:<the unit's --user gid>` 0640, and the container is handed the file | §11.3 corrects §6 and §11.2 by reference, but the three earlier sentences still read as the rule, and §7's is now **exactly inverted**. Worth rewriting them rather than leaving a document that contradicts its own appendix |
| **2** ⚠⚠ | `SPEC.md` §5.1: *"the server reads `PASSWORD_HASH` and `SESSION_SECRET` from it **at startup**"* | one read **for the process**, by whichever entrance is first, shared across the bundled copies — and a request path that is the first reader **reports** the refusal rather than denying in silence | The spec's sentence is satisfied, but the property the deployment actually rests on is the stronger one, and it is what 11b-A3 cost to learn. One sentence in §5.1 would make the next loop's reader unable to reintroduce a per-bundle memo by accident |
| **3** ⚠ | Nothing in either spec says what a running container does when the credentials file is **rewritten** | a bind mount pins the inode: `dashboard.sh`'s writes can never reach it, and `check` reads the new file while the container holds the old | §5.1 says the file is read at startup; it does not say that the *file itself* is frozen for the container. The operator-visible consequence — *a green `check` and a dashboard that denies the new password* — deserves a line |
| **4** | `SPEC.md` §5: *"any error raised while deciding … is 401, never 500"* | unchanged, and now also *"and never silent"* | Recorded so the stderr report is not read as a contradiction of §5's *"nothing is logged about authentication"*. It logs about the **file**, once |
| **5** ⚠ | `11b-build.md` §1.3's table names `require()` as the startup entrance | `require()` is deleted; the startup entrance is `refusal()` | A phase document is a record and is not edited. Named here so the next reader does not go looking for it |

---

## 8. What step 12 inherits

1. **Everything in §6**, in that order. The first three need the box.
2. ⚠ **The check-vs-server differential is now generated, and the generator is the thing to
   extend** — a new rule in the reader means a new payload or position here, never a new row in the
   21-entry table. The table is kept only for the sentences.
3. ⚠ **`file_is_utf8` is the one new dependency on `awk`'s byte behaviour.** It was verified against
   gawk on ai-server and against `TextDecoder` here; if `check` is ever run somewhere else, that is
   the line to re-check.
4. **The step-11 harness takes materially longer** (§5), and the saving is named if it matters.
5. ⚠ **The rule this loop earned, twice:** *a hand-written table cannot falsify its own property;
   generate the corpus.* It was written down by the test phase, in the same document that then
   closed a new hole with a 21-row list. Generating it here found **four** causes where three were
   named, and a quadratic loop nobody was looking for.
