# 11b BUILD — the three rulings of 2026-09-11. **The secrets left the environment, `Restart=always`, and `check` now compares the whole flag set against the unit's own line.**

**Written 2026-09-11 by the 11b build phase.** Nothing committed, nothing staged. `SPEC.md`,
`MOCK.html` and `INSTALL-SPEC.md` untouched — §9 records what they must be amended to say.
There is **no Docker and no systemd on this Mac**: every statement about a running container,
a `docker inspect` field or a real boot is labelled *reasoned, not run*.

---

## 0. The headline

| | |
|---|---|
| **11-Q2 — the secrets leave the environment** | BUILT. `/etc/ai-dashboard.env` is bind-mounted read-only; `lib/auth/secret-file.ts` parses it **once, at startup**, and refuses loudly. `--env-file` is gone from the unit |
| **the reader is stricter than Docker, never looser** | Fixtured **both directions against a model of Docker's own `parseKeyValueFile`** — **26** file shapes: **20** "Docker takes it, we refuse", 4 both take, 2 both refuse |
| **11-Q1 — `Restart=always`** | BUILT, with the restart-loop question answered rather than asserted |
| **11-Q3 — container-vs-unit drift** | BUILT as `check_drift`: the ruling's own Env row plus **six flags, one row each**, and **every expectation derived from `ExecStart=` in the installed unit** |
| `pnpm verify` | **exit 0 — 104 files, 3144 tests, no type errors** (was 102 / 3121). Run twice, identical |
| `shellcheck dashboard.sh` | **clean**, 0.11.0 |
| step 11's harness | **exit 0 — 152 mutations, all bit** (130 inherited, **+22**), ledger green |
| step 07's harness | **exit 0 — 151 mutations, all bit** (128 inherited, **+23**), ledger green. `lib/auth/` is its, and this loop added two test files to its `LEDGER_FILES` |
| step 06's harness | **exit 0 — 63 mutations**, re-run because one comment in a file it owns was corrected |
| `next build` | **exit 0**, in an isolated copy — `instrumentation.js` is emitted and traced into `.next/standalone` |
| the tree | nothing committed, no `.env`, `next-env.d.ts` byte-identical, no stranded mutation |

---

## 1. 11-Q2 — where the secrets live now

### 1.1 The path a credential takes, before and after

| | before | after |
|---|---|---|
| how it reaches the container | `docker run --env-file /etc/ai-dashboard.env` | `docker run -v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro` |
| who parses it | Docker | `lib/auth/secret-file.ts` |
| where it ends up | `process.env`, **and `docker inspect` and `/proc/1/environ`** | one `Environment` object, read once, held by three composition roots |
| a quoted / padded / CRLF value | works today, kills every session the next time the file is rewritten, **nothing logged** | **the container refuses to start**, naming the key and the reason |
| `STANDING` | `--env-file` | `docker run -e STANDING`, filled by a second `ExecStartPre` that greps **that one line** |

`lib/auth/secrets.ts` is the only module in the auth path that touches the filesystem;
`proxy.ts`, `lib/auth/authorize.ts` and `lib/auth/handler.ts` each read `credentialEnvironment()`
and **none of them reads `process.env` any more.** `packaging.test.ts` asserts that as source
text over all three files, because each of the artefact tests measures one file and the wiring
between them is exactly what an edit undoes.

### 1.2 `readAuthConfig`'s signature and its `Environment` seam SURVIVED, and that was the honest design

The handoff asked for a judgement rather than an assumption. The seam survived unchanged:
`readAuthConfig(env: Environment)` is untouched, `MIN_SESSION_SECRET_CHARS` is untouched, and
the file-backed source is simply a different `Environment`. Three consequences worth stating:

- **Every step-7 test still measures the thing it measured.** `config.test.ts` did not change.
- **The strictness landed where it can be loud.** `readAuthConfig` returning `null` is a
  *silent total denial* — correct for a request path, useless as a diagnosis. The refusal had
  to live somewhere that runs once, at startup, where it can exit; that is the new module.
- **`readAuthConfig` is still the second lock and is not weakened.** A process that somehow
  reaches a request with no credentials still denies everything.

The one shape change is that `productionAuthorizeDeps.env` and `productionSessionDeps.env` are
now **getters**. A captured `env: credentialEnvironment()` would read the file at module-load
time — in a test, in a build, in whatever order the module graph settled — and a getter defers
it to first use while the memo keeps "once" true. Both are asserted: the property descriptor
must be a getter with no `value`, and a `PASSWORD_HASH` planted in `process.env` must not reach
the deps.

### 1.3 ⚠ Read ONCE — and what "once" means here

`makeSecretSource(readBytes)` memoises the first read, and both entrances share the memo:

| entrance | used by | on a refusal |
|---|---|---|
| `require()` | `instrumentation.ts`, at startup | **throws** the refusal report |
| `environment()` | every request path | returns an **empty** environment — never throws |

The split is §5's: *"a session check that cannot reach a verdict DENIES"* is a promise about a
**401, never a 500**, so a getter that threw per request would have converted the ruling into
§6.7's failed-poll path. The loud half is the startup exit; the request half stays total.
Measured: three calls across both entrances read the file **exactly once**; a second reader
handed to the factory is never consulted.

### 1.4 ⚠⚠ Stricter than Docker, never looser — and it is fixtured in both directions

Docker's `--env-file` is `parseKeyValueFile` in `docker/cli/opts/file.go`: a UTF-8 check per
line, a BOM stripped from line 1, `bufio.ScanLines` **dropping a trailing `\r`**, leading
whitespace trimmed, blank and `#` lines skipped, `SplitN(line, "=", 2)`, a key containing
whitespace refused, a line with **no** `=` meaning *take this variable from the host's
environment*, and the value kept **verbatim** — quotes, `$`, trailing spaces and all.

`lib/auth/secret-file.test.ts` carries a transcription of that (**reasoned, not run** — there
is no Docker here; step 12 owns one confirmation on the box) and drives 26 file shapes through
both. The table:

| the file carries | Docker | this reader | why the difference is the right way round |
|---|---|---|---|
| what `configure` writes | takes | **takes** | the control: a reader that refused this would be worthless |
| a **quoted** secret | takes | **refuses** | O21 itself: a 34-character secret that passes the floor and dies on the next unquoted rewrite |
| a single-quoted hash | takes | **refuses** | same |
| a **trailing space** | takes | **refuses** | Docker keeps it; no reader can see it |
| a leading tab | takes | **refuses** | same |
| a `$` | takes | **refuses** | a shell that ever sourced the file expands it away |
| a backtick | takes | **refuses** | a sourcing shell **executes** it |
| a backslash | takes | **refuses** | systemd's `EnvironmentFile` and a shell both read it as an escape |
| a `#` mid-value | takes | **refuses** | several `.env` readers take it as a comment and Docker does not |
| a **non-breaking space** inside the value | takes | **refuses** | invisible, and it is what a paste from a rendered document carries |
| a **zero-width space** | takes | **refuses** | ⚠ `.trim()` does **not** remove U+200B — it is `Cf`, not whitespace |
| **CRLF** endings | takes (drops the `\r`) | **refuses** | works until something else keeps the `\r` |
| a **BOM** | takes (strips it) | **refuses** | an editor that writes one has usually done something else too |
| a **bare line**, no `=` | takes — *from the host env* | **refuses** | the shape an editor's hard wrap leaves on a long `SESSION_SECRET=` line |
| a **duplicate** key | takes the **last**, silently | **refuses** | a file nobody can read by eye |
| a value "wrapped" onto two lines | takes (as two keys) | **refuses** | same defect, seen from the other side |
| a **short** `SESSION_SECRET` | takes | **refuses** | §5's unforgeability claim rests on the floor |
| exactly the 32-character floor | takes | **takes** | both sides of the bound, per HANDOVER §5.1 |
| an empty `PASSWORD_HASH` | takes | **refuses** | an unconfigured dashboard that says so |
| no `PASSWORD_HASH` at all | takes | **refuses** | — |
| a key name Docker itself cannot use (`1BAD=`) | takes | **refuses** | — |
| an **indented comment** | takes (it trims first) | **takes** | ⚠ refusing it would be a refusal firing on a file a person would call correct |
| a **whitespace-only line** | takes | **takes** | same |
| an **indented assignment** | takes | **refuses** | stricter, and unlike the two above it carries a key and a value |
| a key **with a space** | **refuses** | **refuses** | equal, not looser |
| **invalid UTF-8** | **refuses** | **refuses** | equal — and it is why the parser takes **bytes**, not a string |

**And the property, stated as an implication rather than as a list:** for every shape, *if we
accept it then Docker accepts it and yields the same two values*. That test is the one that
would catch a future edit making us looser, which a row-by-row table cannot — and it is what
`11b-S8` attacks: decoding UTF-8 **lossily** (`fatal: false`) makes this reader accept a file
Docker refuses, and nothing else in the file notices.

⚠ **The reason this is fixtured at all**: "stricter, never looser" has been **falsified twice
by measurement in this project** — `11-S7` (a condition kind reaching `awk` through `-v`, whose
escape processing made the bash judge looser than the browser) and `11-A2` (the twelve Unicode
spaces JavaScript trims and `[[:space:]]` under `LC_ALL=C` does not). Both were believed
stricter by the people who wrote them.

### 1.5 The rule is spelled TWICE, and the two are held equal by measurement

`dashboard.sh` **writes** this file and the server **refuses to start** on it, so the two are
two implementations of one grammar — the shape on HANDOVER's do-not-copy list.

`secret_value_error` (bash) and `secretValueError` (TypeScript) are asserted **equal message
for message** over a 21-value table, running the real bash against the real TypeScript, in
`packaging.test.ts`. Verdicts alone would not have been enough: a value refused for the wrong
*reason* sends an operator to the wrong line, which is 11-A18g exactly.

Two call-site assertions go with it, because *a cross-check is only worth the call site it is
wired into* (HANDOVER §0.13):

- `env_set` asks `secret_value_error` for `PASSWORD_HASH` and `SESSION_SECRET` — so
  `configure` **cannot write a value the server will not start on**;
- `check_password_hash` and `check_session_secret` ask it too, so the row an operator runs
  before restarting says the same thing the container will.

⚠ **`STANDING` is deliberately NOT judged by it.** It legitimately carries commas and colons,
and a rule refusing a `#` there would be a refusal firing on a correct configuration.
`standing_entry_error` still owns it.

⚠ **The order of the two judgements in `check_password_hash` is itself a diagnosis.** An
argon2id hash — which §5 permits and this build does not implement — contains three `$`, so
asking the value rule first answered *"contains a `$`, which a shell that ever sourced this
file would expand"* for a **correctly written file**. True sentence, wrong subject, and it sent
the reader hunting for a quoting problem that was not there. The argon2id case is answered
first, by name. Found by a test going red, not by review.

### 1.6 Nothing prints a value, and that is measured on every refusal path

A refusal carries a **key, a line number and a reason**. Never the value, never the line, never
a prefix of either — and even the "outside printable ASCII" reason names the *class* rather
than the code point, because one code point of a secret is still one code point of a secret.
The test drives **every** refusing shape in the table and requires the secret to be absent from
the report whole, by its first 20 characters and by its last 20. 11-A6 is the precedent: a row
that printed `${line%%[!A-Za-z0-9_]*}…` put a whole 64-character `SESSION_SECRET` on the
terminal followed by an ellipsis implying it had been truncated.

### 1.7 Where the refusal happens, and why the container is the only place it exits

`instrumentation.ts` — Next's own words: *"a `register` function that is called **once** when a
new Next.js server instance is initiated, and must complete before the server is ready to
handle requests."* That is the only hook in this framework with both properties. `proxy.ts` is
loaded on the first request, not at startup; a route module is loaded per route.

`lib/auth/startup.ts` holds everything decidable, so it can be driven from a test rather than
from a boot. Four verdicts:

| when | verdict | why |
|---|---|---|
| not the Node runtime | **skip** | Next calls `register` in every runtime and the edge copy has no `node:fs` |
| `next build`'s own phase | **skip** | ⚠ an `exit(1)` during `next build` would fail the **Docker build itself** — the one failure that would look nothing like its cause |
| the file is good | **ok** | and **nothing is logged**: §5 logs nothing about authentication, and an exception that fires on the healthy path becomes the rule |
| refused, `NODE_ENV=production` | **exit 1** | the container. Naming every key and reason |
| refused, anywhere else | **warn** | a laptop has no `/etc/ai-dashboard.env` and never will; exiting there would teach whoever hit it to delete this file — *a refusal that fires on a correct configuration teaches an operator to ignore the one that matters* |

⚠ **An explicit `process.exit(1)`, not a thrown error.** Next's documentation does not say what
happens when `register` rejects, and a startup refusal that left the server running would be
the silent failure this ruling exists to remove.

⚠ **The dynamic `await import` in `instrumentation.ts` is not a style choice** — it is Next's
own instruction for runtime-specific code, and `lib/auth/secrets.ts` imports `node:fs`. That
guard is the one line of this feature no test can reach (there is no edge runtime in this
suite), which is why `startupAction` carries the same check as a second lock and why the file's
shape is asserted as text.

**Measured, not reasoned:** a real `next build` was run against this tree (in an isolated copy,
because the parent's `next dev` owns `.next/`). It compiled, type-checked, generated the three
pages, emitted `.next/server/instrumentation.js`, and **traced it into `.next/standalone`** —
so the hook ships in the image. No refusal fired during the build.

### 1.8 ⚠⚠ The mode had to change, and SPEC still says otherwise

`--user 10001:10001` **cannot read a `root:root 0600` file.** Mounting the credentials file
without changing its mode would have produced a container that starts, denies every login and
logs nothing — precisely the failure this ruling exists to remove.

The file is now written **`root:<the container's gid>` `0640`**, which is the shape root
`CLAUDE.md` already records for `/etc/llama-server.apikey` (*"root:yorman 0640 so the
unprivileged service can read it and no other account can"*). No account on this box is in gid
10001. The `/root` backups stay **0600**: nothing mounts those, so nothing loosens them.

⚠ **The gid is read out of the unit's own `--user`, never retyped** (`container_gid`), and
`check`'s row compares **numeric** owner and group — `%u:%g`, not `%U:%G`, because `%G` would
answer from `/etc/group` for a gid no account holds, and the row would then pass or fail on
`/etc/group` rather than on the file.

**This contradicts `SPEC.md` §5/§5.1 and `INSTALL-SPEC.md` §6, which still say `root:root`
0600.** Recorded in §9 rather than improvised over; the amendment is the owner's.

---

## 2. 11-Q1 — `Restart=always`, and why it cannot spin

One line, plus the reasoning in the unit's own comment. `docker run` exits with the
**container's** status, and Next's standalone server handles `SIGTERM` and exits 0 — so
`docker stop ai-dashboard` left the unit `inactive (dead)` with `Result=success` and systemd
did **not** bring the monitor back. `systemctl stop` remains the deliberate way down, and still
is: systemd does not restart a unit it stopped itself.

⚠ **The restart-loop question, answered rather than asserted** (all three *reasoned, not run*):

1. **`StartLimitBurst=5` within `StartLimitIntervalSec=300`, in `[Unit]`**, bounds it at five
   attempts per five minutes; then the unit sits in `failed`, which `check`'s `ActiveState`
   row reports. `Restart=always` changes **which** exits are retried, never **how many times**.
2. **`ExecStartPre=-/usr/bin/docker rm -f` and `ExecStopPost=-/usr/bin/docker rm -f` are both
   `-` prefixed**, so neither can fail a start or a stop, and neither starts anything: they
   cannot feed the loop. The one thing they clear — a stale container holding the name — is
   the condition that would otherwise make every retry fail identically.
3. **A credentials file the server refuses exits 1 five times and then stops**, rather than
   restarting for ever with nothing saying so. That is the interaction between this ruling and
   11-Q2, and it is the reason the startup refusal is safe to make fatal.

`check`'s existing `StartLimitIntervalUSec` row is what proves the keys landed in `[Unit]`; the
file saying so is not evidence it took.

---

## 3. 11-Q3 — `check_drift`, and where its expectation comes from

A twelfth `check` row. It refuses to judge (**`row_unknown`**, not a tick) when docker is
absent, when no container is running, or when `ExecStart=` cannot be read from the installed
unit — *a row nobody could evaluate is not a row that passed*.

**Every expectation is derived from `ExecStart=` in `$UNIT_PATH`** — the **installed** unit,
which is what systemd actually runs — by `unit_exec_start` / `unit_flag_value` /
`unit_flag_values` / `unit_image`. A test reads `check_drift`'s body and requires that it
contains **no retyped flag**: not a mount, not the network mode, not the image, not the port.
INSTALL-SPEC §11.2 asked for exactly that, and it is the shape this project has been bitten by
repeatedly.

| row | from the unit | from the container (`docker inspect`) |
|---|---|---|
| **the two secrets are ABSENT from `Env`** | — (unconditional) | `.Config.Env`, **key names only** |
| `--name` | `--name`'s value | `.Name`, leading `/` stripped |
| `--network` | `--network`'s value | `.HostConfig.NetworkMode` |
| the Docker restart policy | `--restart` — **absent, deliberately** | `.HostConfig.RestartPolicy.Name` (`no` normalised to empty) |
| published ports | every `-p`/`--publish` — **none** | `.HostConfig.PortBindings`'s keys, sorted |
| the mounts | every `-v`/`--volume`, sorted | `.HostConfig.Binds`, sorted |
| the env keys the unit **assigns** | every `-e KEY=…` | `.Config.Env` minus the **image's** own `ENV` |

Reported **per flag**, one row each, never as one boolean.

⚠ **`.Config.Env` is the one place in this script that can be handed a credential by mistake.**
The value is dropped before anything is compared or printed: the leak row names
`PASSWORD_HASH`/`SESSION_SECRET` and nothing else, and the key-set row prints key names only.

⚠ **Two things are deliberately excluded, and both would otherwise be false alarms:**

- **`$GPU_FLAGS`.** A fallback start is *legitimate* (INSTALL-SPEC §11.1) and already has its
  own three-state row that re-probes. Reporting it as drift would be a refusal firing on a
  correct configuration.
- **A pass-through `-e KEY`** (no `=`). Docker sets it only if the variable is set in the
  client's environment, so `-e STANDING` on a box where nobody has set anything standing
  correctly produces a container with **no** `STANDING` at all. Both sides exclude
  pass-throughs; the unit-text test is what pins that `-e STANDING` is still there.

**The image's own `ENV` is subtracted by asking the image**, not by a hand-written list that
would go stale on the next Dockerfile edit.

⚠ **Sorting both sides is load-bearing**: a comparison that depended on docker preserving flag
order would fail on a correct box for a reason nobody could act on. The healthy fixture returns
the binds in a **different** order from the unit on purpose.

---

## 4. What `check` asserts about `Env`, precisely

> `PASSWORD_HASH SESSION_SECRET in the container's ENVIRONMENT — 'docker inspect' shows the
> value to every member of the docker group and /proc/1/environ shows it to root. SPEC §5.1
> (2026-09-11) mounts /etc/ai-dashboard.env read-only instead and the server parses it.
> Something put --env-file, or an -e, back into the unit`

Unconditional, inside `check_drift`, **before** the flag comparison — so it still fires when
the unit cannot be read for the comparison. The ruling's own sentence is why: *the ruling is
worthless if a later edit puts them back and nothing notices.* The guard table drives it from
both sides (a clean container, and one with both keys in `Env`).

---

## 5. The unit, line by line

```ini
ExecStartPre=/bin/sh -c 'grep -E "^STANDING=" /etc/ai-dashboard.env | tail -n 1 >/run/ai-dashboard-standing.env || true'
EnvironmentFile=-/run/ai-dashboard-standing.env
…
    -e STANDING \
…
    -v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro \
…
Restart=always
```

- **`grep` emits at most the one line**: the hash and the secret never enter this file, this
  unit's environment, or `docker inspect`.
- **`tail -n 1`** is Docker's own rule for a repeated key, kept so that lifting the value out
  cannot change which one wins — `env_get` grew a `tail -1` for the same fact.
- **`|| true`** because `grep` exits 1 on no match, and an operator with nothing standing is
  the ordinary case; without it the unit would fail to start for them.
- ⚠ **systemd's `EnvironmentFile` grammar is not Docker's** — it **strips** quotes where Docker
  keeps them. `check` already refuses a quoted value on any line of the credentials file, so
  the two cannot disagree on a file that passes `check`. Written down because the divergence is
  invisible and the check is what closes it.
- The mechanism — an `ExecStartPre` writing a `/run` file that a later `EnvironmentFile=-`
  reads — is **the GPU probe's own**, already shipped and reviewed under 11-A14. *Reasoned, not
  run* here, on the same evidence.

---

## 6. What this phase could NOT verify

| | why | who owns it |
|---|---|---|
| `docker inspect`'s exact field shapes | no Docker on this Mac | step 12 |
| that `Binds` returns `-v` strings verbatim | same — the comparison is normalised by sorting, and would report drift rather than pass if the shape differs | step 12 |
| that the model of Docker's `--env-file` grammar is right | transcribed from `docker/cli/opts/file.go`; **if the model is wrong this test is wrong with it** | step 12: write each shape and run `docker run --env-file … env` |
| that `register()` exits the container | `process.exit(1)` is unambiguous, but the systemd-side consequence (five retries, then `failed`) is reasoned | step 12 |
| that uid 10001 can read a `root:10001 0640` bind mount | ordinary POSIX, but unrun here | step 12 |
| that `EnvironmentFile=-` picks up an `ExecStartPre`'s write for `-e STANDING` | inherited from the GPU probe's shipped mechanism | step 12 |

---

## 7. Run log — exit codes, pasted rather than described

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"

pnpm verify                                             exit 0
  Test Files  104 passed (104)
  Tests       3144 passed (3144)
  Type Errors no errors
  ⚠ run TWICE, identical both times (`realHash()` is random and several tests spawn real bash)

shellcheck dashboard.sh                                 exit 0   (0.11.0, no output)

python3 pipeline/steps/11-packaging/regressions.py      exit 0
  All 152 regressions failed their check, as they must.
  Red-test ledger: 67 distinct failing tests across 152 mutations; 67 ⚠-marked tests checked.
  Every ⚠-marked test went red under at least one mutation.

python3 pipeline/steps/07-auth-login/regressions.py     exit 0
  All 151 regressions failed their check, as they must.
  Red-test ledger: 222 distinct failing tests across 151 mutations; 148 ⚠-marked tests checked.
  Every ⚠-marked test went red under at least one mutation.

python3 pipeline/steps/06-telemetry-route/regressions.py exit 0
  All 63 regressions failed their check, as they must.
  Red-test ledger: 88 distinct failing tests across 63 mutations; 56 ⚠-marked tests checked.

next build (in an isolated copy)                        exit 0
  ✓ Compiled successfully · Finished TypeScript · 3 static pages
  .next/server/instrumentation.js emitted and traced into .next/standalone
```

| harness | before | after | added |
|---|---|---|---|
| step 11 (`packaging.test.ts`) | 130 | **152** | **+22**, all `11b-` |
| step 07 (`lib/auth/`, `proxy.ts`) | 128 | **151** | **+23**, all `11b-` |
| step 06 (`lib/telemetry/`) | 63 | 63 | none — **re-run only** because one comment in `lib/telemetry/source.ts` named the old mechanism |

`pnpm verify` went 102 files / 3121 tests → **104 / 3144** (+2 files, +23 tests).

**Three harnesses, not one, and each for a stated reason.** Step 11's because `dashboard.sh`,
the unit and `packaging.test.ts` changed. Step 07's because `lib/auth/` is **its**
`LEDGER_FILES` and this loop added two test files to that list. Step 06's because a comment in
a file it owns was corrected.

### ⚠ What the harness found that review did not

**`11-R2` DID NOT BITE on the first run.** The mutation is *"`check`'s O20 row stops asking
`scrypt_hash_error`"*, and it stopped biting because §1.5's message fix added a **first**
`scrypt_hash_error` call for the argon2id case — so replacing the second one with `true` left
the only test of that row still passing. The row was still correct; the *measurement* had
gone slack, which is this project's recurring shape. Fixed by giving the second call a case
of its own: a hash the value rule has no objection to and the parser cannot read
(`scrypt.15.8.1.tooshort.tooshort`). Both `11-R2` and the new assertion now bite.

**And a fail-open row, found while writing this document rather than by a test.**
`check_drift`'s leak row treats **absence** as its pass condition, so a `docker inspect` that
could not be read at all printed a tick — 11-A11's defect, in a row added *in the same loop
that cites it*. It now reads the exit status and files `row_unknown` ("⚠ This is NOT 'they are
absent'"), with a guard-table case and `11b-D12` to keep it that way. Every other drift row
compares two values, so a failed read makes them differ: those fail **closed**.

---

## 8. The tree

New files:

| file | what |
|---|---|
| `lib/auth/secret-file.ts` | the parser, the per-value rule, the refusal report, the read-once source. **No `node:fs`** |
| `lib/auth/secrets.ts` | two lines of wiring — the only module in the auth path that touches the filesystem |
| `lib/auth/startup.ts` | the four startup verdicts, and `runStartup` |
| `instrumentation.ts` | Next's `register()` hook. Four lines, and the one runtime guard no test can reach |
| `lib/auth/secret-file.test.ts` | the Docker comparison, both directions |
| `lib/auth/startup.test.ts` | the verdicts, the exit, the logging, and `instrumentation.ts`'s shape |

Changed: `dashboard.sh`, `systemd/ai-dashboard.service`, `packaging.test.ts`,
`lib/auth/config.ts` (its header's reasoning, see §1.2), `lib/auth/authorize.ts`,
`lib/auth/handler.ts`, `proxy.ts`, `lib/telemetry/source.ts` (one comment naming the old
mechanism), their three test files, `README.md`, and the two harnesses.

⚠ **`lib/auth/secret-file.test.ts` and `lib/auth/startup.test.ts` were added to step 07's
`LEDGER_FILES`**, not step 11's: ledger ownership follows the FILE (HANDOVER §5.2 rule 6), and
`lib/auth/` is step 7's. `lib/cross-harness-ledger.test.ts` is what noticed — it failed on two
⚠-bearing orphan test files before they were listed, which is the guard doing exactly its job.

Nothing committed, nothing staged. No `.env`. `next-env.d.ts` byte-identical
(`8195d2c60ce847a459ae9d308d6a5724` before and after). `AGENTS.md` unchanged. No stranded
mutation — `git status` is clean of every harness's subject.

⚠ **The `next build` was run in an isolated copy of the tree**, because the parent's
`next dev` owns `.next/` and a concurrent build would have written into it. The copy was
removed; `.buildcheck/` does not exist.

---

## 9. Spec silences and contradictions — recorded, not improvised (invariant 7)

| # | what the spec says | what this build does | why |
|---|---|---|---|
| **1** ⚠⚠ | `SPEC.md` §5 and §5.1, `INSTALL-SPEC.md` §6: the env file is **`root:root` 0600** | **`root:<container gid>` 0640** | A container running `--user 10001:10001` **cannot read** a root-only file. 0600 + the mount = a dashboard that starts, denies every login and logs nothing — the failure the ruling exists to remove. The precedent is `/etc/llama-server.apikey`'s `root:yorman 0640`. **Needs an amendment in both documents.** |
| **2** ⚠ | `SPEC.md` §2.5's runtime-contract row: *"Credentials & config — `--env-file /etc/ai-dashboard.env`"* | a read-only bind mount, plus `-e STANDING` | The row and its whole ⚠ note are now false for the two secrets and true only for `STANDING`. **Needs rewriting.** |
| **3** ⚠ | `INSTALL-SPEC.md` §7's table: *"`--env-file` … read by the **client**, as root, on the host — which is why 0600 root:root is correct and **the container never sees the file**"* | the container is handed the file and nothing else | That sentence is now exactly inverted. **Needs rewriting**, and it is the sentence that explains row 1. |
| **4** | `INSTALL-SPEC.md` §7's unit block still shows `Restart=on-failure` | `Restart=always` | §11.2 rules it; §7's code block was not updated with it. Cosmetic, but §7 is the spec the unit is read against. |
| **5** ⚠ | `INSTALL-SPEC.md` §9's **O21** row: *"`SESSION_SECRET` is ≥ 32 chars and contains no quote character and no `$`"* | the full `secret_value_error` rule — also backtick, backslash, `#`, any whitespace, anything outside printable ASCII, CRLF, BOM, duplicates, bare lines | The row is now a *description of the server's own rule*, which is the point of the ruling. **Worth restating so the spec does not read as the weaker of the two.** |
| **6** ⚠ | Neither spec says **how `STANDING` reaches the container** once `--env-file` is gone | a second `ExecStartPre` greps that one line into `/run/ai-dashboard-standing.env`, and `docker run -e STANDING` passes it through | The ruling says only *"`STANDING` may stay an environment variable"*. The alternative — letting the server read `STANDING` from the mounted file too — was **not** taken: §4 echoes the list verbatim, `createTelemetrySource` captures it once, and a file read there would need its own monotonic budget and a place in §4's outstanding-call rule. **Recorded for the owner**; it is one line of the unit either way. |
| **7** ⚠ | SPEC §5.1 says the reader *"refuses … at startup"* without qualification | it **exits(1)** when `NODE_ENV=production`, and **warns** anywhere else | A laptop has no `/etc/ai-dashboard.env` and never will; exiting there makes the dashboard undevelopable and teaches whoever hits it to delete the check. The container is `NODE_ENV=production` by the Dockerfile's own `ENV`, which `packaging.test.ts` asserts. **Confirm or overrule.** |
| **8** | Nothing in either spec mentions `instrumentation.ts` | a new top-level file, traced into `.next/standalone` automatically | Measured by a real `next build`. Worth one line in §2.5's runtime contract so it is not mistaken for stray. |
| **9** ⚠ | — | systemd's `EnvironmentFile` **strips quotes** where Docker keeps them | So a quoted `STANDING` would now reach the container *unquoted* where it used to arrive with its quotes. `check` refuses a quoted value on any line of the file, so the two cannot disagree on a file that passes `check`. **Named because the divergence is invisible.** |
| **10** | — | the threat this closes is **exactly** `docker inspect` / `/proc/1/environ` | Root on the host still reads the file, and so does the container's own uid — necessarily. Stated so the ruling is not overclaimed. |

---

## 10. What the next phase inherits

1. **Every container claim in this document is reasoned, not run.** §6 lists the six things
   step 12 must confirm on the box, and the first of them is the model of Docker's own
   `--env-file` grammar that §1.4's whole comparison rests on.
2. **The mode change (§9 row 1) is the one thing here that a spec amendment could overturn**,
   and if it is overturned the mount cannot work as built — there is no third option that
   keeps `0600 root:root` and a non-root container.
3. **`check` now has twelve rows**, and the call-graph assertion requires the twelfth to be
   entered in `CHECK_ROWS` by hand — which is the only moment anyone asks whether a new row
   has a refusal test. It has one; so does every branch of it, including the `row_unknown`
   arms.
4. **The adversarial's first stop should be §1.4's Docker model.** If that transcription is
   wrong, the headline property of this loop is wrong with it, and nothing in this tree can
   tell.
