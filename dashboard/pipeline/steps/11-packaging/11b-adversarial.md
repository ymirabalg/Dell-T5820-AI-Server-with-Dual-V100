# 11b ADVERSARIAL — the differential that was built to close the check-vs-server hole is itself a hand-written table, and eleven files still get a green `check` and a container that will not boot

**Written 2026-09-11 by the 11b adversarial phase.** **Nothing was fixed and nothing in the tree
was edited** — `git status` at the end is byte-for-byte what was inherited plus this file. No
`SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md` edit. No commit. No `.env`. No harness was run at all
(deliberately — see §3), so no mutation can have been stranded. The parent's demo server on
:39174/:39175 was not touched.

Docker and systemd are still absent from this Mac. Every claim below is labelled **measured** or
**reasoned, not run**. Throwaway scripts live in the session scratchpad.

---

## 0. Headline

| | |
|---|---|
| **The test phase's own lesson was not applied to what the test phase built** | It fixed P1 by **generating** shapes, wrote *"a hand-written table cannot falsify its own property"* — and in the same document closed the check-vs-server hole with a **21-row hand-written list** (`packaging.test.ts:520`). A generated sweep of 45 files finds **11** where every `check` row is green and `lib/auth/secret-file.ts` refuses to start. **11b-A1 / 11b-A2** |
| **The startup guarantee is bypassed after boot, silently** | Measured with three independent sources over one path: startup validates and the server goes ready; an **in-place** append then makes the gate's and the routes' copies read a refused file, both return an **empty `Environment`**, every login is 401, **nothing is logged**, the process never exits so `Restart=always` never fires. **11b-A3** |
| **`env_set` renames onto the bind-mount source** | `mv -f "$TMP" "$ENV_FILE"` (`dashboard.sh:638`) replaces the inode. A bind-mounted *file* pins the inode, so `set-password` can never reach a running container, `check` reads the new file and the container holds the old one, and no drift row compares them. **11b-A4** |
| **A green tick on a file `check` could not read at all** | `$ENV_FILE` a **directory** — which is what Docker creates when a bind-mount source is missing — prints a raw bash arithmetic syntax error, a `read error`, and then `✓ every line is a single-line, unquoted KEY=VALUE`. The test phase's §5.1 sweep examined this exact row and pronounced it *"Sound"*. **11b-A5** |
| **Two producers for the one number this loop turns on** | `container_gid` reads the **repo's** unit; every `check_drift` expectation reads the **installed** unit. Measured to disagree. **11b-A6** |
| **The Docker model is one byte LOOSER than Docker** | at exactly the boundary that was last loop's headline. `bufio` errors at `len(buf) >= maxTokenSize`, i.e. line length **≥ 65536**; the model refuses at `> 65536`. **11b-A10** |

---

## 1. Findings

### 11b-A1 ⚠⚠ `check_env_file` is missing three whole-file rules the reader has — 11 of 45 generated files: every `check` row green, the container refuses to start

**Severity: HIGH.** **Measured.**

Method: generated 45 files, ran the **full** operator-facing row set against each
(`check_env_file` + `check_password_hash` + `check_session_secret` + `check_standing`, with
`env_file_stat` stubbed to the correct mode so only the grammar is under test), and ran the real
`parseSecretEnvFile` over the same bytes. `check` green / server `REFUSE`:

```
!!! CR INSIDE a comment line                      !!! BOM INSIDE a comment line
!!! CR at the END of a comment line               !!! BOM at the END of a comment line
!!! CR inside an INDENTED comment                 !!! BOM inside an INDENTED comment
!!! a 70000-byte comment (plain)                  !!! BOM inside a NON-secret key's value
!!! a 70000-byte INDENTED comment                 !!! a 40000-char multibyte comment (120000 bytes)
!!! a 70000-byte WHITESPACE-only line
--- 11 of 45 shapes: every check row green, the server refuses to start
```

Three independent causes, all in `check_env_file` (`dashboard.sh:1520`–`1630`):

1. **No whole-file `\r` rule.** `lib/auth/secret-file.ts:229` refuses a `\r` **anywhere in the
   file**. `check` only sees a `\r` when it survives into a *value* (`env_value_error`'s
   `*$'\r'*`). A `\r` on a comment line is `continue`d at `dashboard.sh:1584` before any rule
   runs. One Windows-pasted comment line in an otherwise-LF file is enough.
2. **No whole-file BOM rule.** `secret-file.ts:224` refuses U+FEFF anywhere. `env_value_error`
   has no non-ASCII rule at all — only `secret_value_error` does, and it is applied only to the
   two secrets. So a BOM in a comment, or in *any* non-secret value except `STANDING`, is green.
   (A BOM inside `STANDING` **is** caught, by `check_standing`'s non-ASCII rule — verified.)
3. ⚠⚠ **The 64 KiB line bound is checked AFTER the skip.** `dashboard.sh`:

   ```
   1584:    case "$stripped" in ''|'#'*) continue ;; esac
   1585:    if (( ${#line} >= MAX_ENV_LINE_BYTES )); then
   ```

   The reader's byte scan (`secret-file.ts:204`–`213`) runs over **every** line including
   comments and blank lines. So a comment or a whitespace-only line past 64 KiB is refused by
   the server and never measured by `check`. **This is one of the three shapes the test phase's
   own §1.2 named** — *"a very long COMMENT line (70000 bytes) :: docker refuses"* — fixed in the
   reader and reintroduced in the row that is supposed to mirror it.

`${#line}` counting is **not** a defect: `export LC_ALL=C` (`dashboard.sh:49`) makes bash count
bytes (verified: `LC_ALL=C ${#"ééé"}` = 6, UTF-8 = 3), so the multibyte case above fails only
because the line is a comment.

Consequence is the one the ruling exists to remove, wearing `check`'s name: a green
pre-restart check, then `exit 1` five times and a unit sitting in `failed` long after whoever
ran `check` has gone.

### 11b-A2 ⚠⚠ The differential that closes A1's class is a hand-written table — the exact defect the same phase's headline is about

**Severity: HIGH (structural).** **Measured** (read + the sweep above).

`packaging.test.ts:520`–`542`: `FILES` is 21 literal entries. The test phase's §1.4 wrote:

> *"A hand-written table cannot falsify its own property: it only ever asks about the cases
> whoever wrote it already thought of, and all 26 of its rows were green while this was true."*

…and then closed §2.3's newly-found hole with a table of exactly the cases it had thought of.
Every one of the 21 varies a **secret line** or appends **one** extra line; the constant first
line `# /etc/ai-dashboard.env` is never perturbed, and nothing is ever placed in a comment or in
a non-secret value. Those are precisely the two regions `check` does not look at. 45 generated
files were enough to find 11 disagreements.

The generator is cheap: the reader and `check_env_file` are both already drivable from
`packaging.test.ts` (`checkFileRows`), so the corpus can be built the way `GENERATED` is.

### 11b-A3 ⚠⚠ The startup guarantee does not survive the first in-place write, and the failure is completely silent

**Severity: HIGH.** **Measured** for the reader; the container half **reasoned, not run**.

The test phase recorded that the reader is bundled three times and left the consequence to the
owner. Measured here with three independent `makeSecretSource` instances over one path — which
is what three bundle copies are:

```
startup (chunk A) refusal: null  -> register() returns 0, server READY
   <in-place append of a duplicate SESSION_SECRET line — same inode>
gate    (chunk B) env keys after the append: []
routes  (chunk C) env keys after the append: []
startup (chunk A) env keys, memoised     : ["PASSWORD_HASH","SESSION_SECRET"]
anything logged by the request path?     : NOTHING
```

So: the startup arm passes and exits 0, the server is ready, and both request-path copies then
memoise an **empty** `Environment` — `readAuthConfig({})` is `null`, every login and every
cookie is denied. Nothing is logged, because `runStartup` is the only thing that ever consults
`refusal()` and it has already run. The process does not exit, so `Restart=always` never fires
and `StartLimitBurst` never counts. **This is the O20/O21 failure — a dashboard that denies
everything and says nothing — reached *through* the guard that was built to remove it.**

⚠ The trigger has to be an **in-place** write (`>>`, `tee -a`, an editor with
`backupcopy=yes`, a config-management tool), because a bind-mounted file pins the inode — see
11b-A4. `dashboard.sh` itself always renames, so it cannot cause this; anything else can.

The three memos also mean the documented reason for the memo (*"a file rewritten mid-flight by
`set-password` would change the answer between the gate and the route"*, `secret-file.ts:334`)
is not delivered: the gate and the route hold **separate** memos and can straddle the rewrite.

### 11b-A4 ⚠ `env_set` renames onto the bind-mount source, so `set-password` can never reach a running container — and nothing compares the two

**Severity: MEDIUM-HIGH.** **Reasoned, not run** (no Docker); the `mv` is measured.

`dashboard.sh:638` — `mv -f "$TMP" "$ENV_FILE"`. The comment above it justifies the rename
against truncation, correctly, and was written before the file became a **bind-mount source**.
Docker binds the *inode*: after the rename the host path is a new inode and the container's
`/etc/ai-dashboard.env` still refers to the old one, for the life of the container.

Consequences:

- `set-password` warns *"the container reads this file once, at creation — run: dashboard.sh
  restart"* (`dashboard.sh:1129`) — which is the right advice, but it fires only
  `if unit_installed`, and it is the **only** thing standing between the operator and a
  dashboard that 401s the new password.
- `check` reads the **new** inode. Every row is green while the container holds the old one.
  `check_drift` compares `-v` **strings**, so the mount row matches too. There is no row anywhere
  that asks whether the file the container has open is the file on the host.
- The same mechanism inverts 11b-A3 for `dashboard.sh`'s own writes: a bad file written by
  `configure`/`set-password` can never reach a running container either. That is luck, not
  design, and it is not written down.
- ⚠ It also means the **mode fix in 11b-A7 does not reach a running container**: a `chown`/`chmod`
  applied by a later `env_set` lands on a new inode the container never sees.

### 11b-A5 ⚠⚠ `check_env_file` prints a green tick on a file it could not read — and the sweep that was supposed to find this declared the row *"Sound"*

**Severity: MEDIUM-HIGH.** **Measured.**

`ENV_FILE` pointing at a **directory**:

```
The env file (§6)
wc: stdin: read: Is a directory
tr: Is a directory
./dashboard.sh: line 1571: ((: !=        0 : syntax error: operand expected (error token is "!=        0 ")
./dashboard.sh: line 1577: read: read error: 0: Is a directory
  ✓ every line is a single-line, unquoted KEY=VALUE
```

Two unjudged reads and one bash syntax error on the operator's terminal, then the pass condition
— `(( bad )) || row_ok` at `dashboard.sh:1628` — ticks because nothing set `bad`:

- `dashboard.sh:1571`, the NUL row: `(( $(wc -c <"$ENV_FILE") != $(tr -d '\0' <"$ENV_FILE" | wc -c) ))`
  — both substitutions are empty, so the arithmetic is a **syntax error**, not a comparison, and
  its failure is not judged.
- `dashboard.sh:1577`, `while IFS= read -r line ... done < "$ENV_FILE"` — the redirection fails,
  the loop body never runs, and that failure is not judged either.

The test phase's §5.1 swept for exactly this shape and wrote:

> | `check_env_file`'s `(( bad )) \|\| row_ok` | pass condition is "nothing found", but every path
> that could fail sets `bad`; a read failure is caught by `env_readable` above it. **Sound** |

`env_readable` is `[[ -r "$ENV_FILE" ]]`, which is **true for a readable directory**. The
reasoning is measured false.

⚠ Reachability is not theoretical: `docker run -v /etc/ai-dashboard.env:...` **creates the host
path as a directory** when it does not exist (*reasoned, not run*). An operator who runs `unit`
and `start` before `configure` gets exactly this file type, and then a `check` whose grammar row
ticks. (The mode row does fail on a directory, so the run is not silent — but the row that is
supposed to say *what is wrong with the file* says the file is fine.)

### 11b-A6 ⚠⚠ The gid the mode row expects comes from the REPO's unit; every drift expectation comes from the INSTALLED unit

**Severity: MEDIUM-HIGH.** **Measured.**

`container_user` (`dashboard.sh:541`–`549`) reads `$SRC/systemd/ai-dashboard.service`. Every
expectation in `check_drift` reads `$UNIT_PATH` (`/etc/systemd/system/ai-dashboard.service`).
Measured with an installed unit edited to `--user 10002:10002`:

```
SRC-derived gid                                   : 10001
with UNIT_PATH = the changed installed unit       : 10001   <-- unchanged
```

So in one `check` run, the file-mode row judges the credentials file against the **repo's** gid
while the drift rows judge the container against the **installed** unit. If the two differ — a
hand-edited installed unit, or simply a checkout at a different commit from the one that
installed the unit — `check` prints *"is root:10001 0640 — mounted, and readable by the container
only"* about a file the container cannot open, which is the same clean, unlogged 401 O20 is
about. `env_set`'s `chown` uses the same repo-derived gid, so `configure` writes the wrong group
too.

The build's own rule — *"the gid is read out of the unit's own `--user`, never retyped"* — is
satisfied textually and defeated in substance: there are two units, and this reads the one
systemd does not run. Related: **nothing anywhere in `check` compares the installed unit with the
repo's copy**, so a hand-edited installed unit is invisible to every row (see 11b-A8).

### 11b-A7 ⚠ `configure` never repairs the mode of an existing file, so an upgrading box installs into a container that cannot read its credentials

**Severity: MEDIUM.** **Measured** (the no-op); the container half **reasoned, not run**.

A pre-ruling box has `/etc/ai-dashboard.env` at `0600 root:root` — which is still what `SPEC.md`
§5/§5.1 and `INSTALL-SPEC.md` §6 say. Measured, running `cmd_configure` against such a file:

```
before: 100600 501:0
  ✓ SESSION_SECRET already present — keeping it (rotating it logs out every session)
  ✓ STANDING already present — leaving it alone (it is the operator's)
after:  100600 501:0
```

Three green lines, `env_set` never called, `chmod 0640`/`chown root:<gid>` never reached
(`dashboard.sh:1135`–`1176`; `PASSWORD_HASH` present means even the warn arm is skipped). The
mode is fixed **only** as a side effect of writing a value. `dashboard.sh` has no subcommand
whose job is the mode.

`install` does then run `cmd_check` and dies on the failing mode row, so the operator is not left
in silence — but the failing row is the only row in `check_env_file` with **no `Fix:` line**
(`dashboard.sh:1539`–`1542`), on the one condition this loop introduced, and the obvious remedy
(`configure`) is measured not to work.

⚠ The other modes, for completeness: `0644` → the container reads it and the row correctly fails
(*"0644 would publish the hash"*); `0640 root:root` (right mode, wrong group) → `readFileSync`
throws `EACCES`, which `makeSecretSource` catches into *"could not be read (EACCES)"* → `exit 1`,
loud. `root:<gid>` where the gid names no account is the intended state and is fine — the row
compares `%u:%g` numerically, which is right. SELinux would relabel this into `EACCES` (loud) for
want of `:z`; Ubuntu's `docker-default` AppArmor profile does not restrict bind-mount reads, so it
does not apply on this box. *All reasoned, not run.*

### 11b-A8 ⚠ `check_drift` compares six of the unit's flags, and the document says "the whole flag set"

**Severity: MEDIUM.** **Measured by reading** (`dashboard.sh:2028`–`2168`, `systemd/ai-dashboard.service`).

11b-build.md's title says *"`check` now compares the whole flag set against the unit's own
line"*. The rows are: the Env leak, `--name`, `--network`, `--restart`, `-p`, `-v`, and the `-e`
key set. The unit's `docker run` also carries **`--read-only`, `--user 10001:10001`, `--pid host`,
`--tmpfs /tmp`, `--rm`, `--log-driver`, `--log-opt ×2`** — none of which is compared. A container
started by hand, or by a drifted installed unit, **without `--read-only` or without
`--user 10001:10001` passes every row** — and `--user` is the number 11b-A6's mode row hangs on,
while `--read-only` is a §2.5 hard requirement that one of the test phase's nine stranded
mutations deleted. (The image *is* covered, by `check_container`.)

Second-order: the two rows whose labels state an absolute — *"the Docker restart policy (systemd
owns restarts)"* and *"published ports (§2.1: NONE — publishing bypasses ufw)"* — derive their
expectation from the unit, so a unit that **gains** `--restart always` or `-p 8090:8090` makes both
sides agree and both rows tick. The absolutes are held by `packaging.test.ts:2091`/`:2143`
against the **repo's** unit; the test suite does not run on the box, and nothing on the box holds
the installed unit to the repo's. So the row's label promises more than `check` can deliver.

### 11b-A9 ⚠ `SecretSource.require()` — the documented startup entrance — has no production caller

**Severity: MEDIUM (a certificate for the wrong thing).** **Measured** (`grep` over the tree).

11b-build.md §1.3:

> | entrance | used by | on a refusal |
> | `require()` | `instrumentation.ts`, at startup | **throws** the refusal report |

The real path is `instrumentation.ts` → `startup.ts:128` → `productionSecrets.refusal()`.
`require()` is called in exactly four places, all of them assertions in
`lib/auth/secret-file.test.ts` (`:619`, `:629`, `:642`, `:652`). Nothing in production calls it.

So the interface has **three** entrances (`require`, `environment`, `refusal`) documented as two;
the one the document calls the loud startup path is dead; and the one the ruling actually turns
on — `refusal()` — is the one with no dedicated test of its own. A future edit that breaks
`require()` breaks four tests and no behaviour; a future edit that breaks `refusal()` is the
whole feature.

### 11b-A10 ⚠⚠ The Docker line-length model is one byte LOOSER than Docker, at exactly the boundary that was last loop's headline

**Severity: MEDIUM.** **Measured** against `golang/go`'s own `bufio/scan.go`.

Fetched `src/bufio/scan.go`:

```
if len(s.buf) >= s.maxTokenSize || len(s.buf) > maxInt/2 { s.setErr(ErrTooLong); return false }
...
newSize = min(newSize, s.maxTokenSize)
```

The buffer is capped at exactly `maxTokenSize` (65536) and the give-up test is `>=`, so the
boundary is **determinate**: a line of length **≥ 65536** makes `parseKeyValueFile` return
`scanner.Err()` and `Parse` refuse the whole file. 65535 + `\n` fits and is fine.

Two written statements are therefore wrong, both in the safe direction today:

- `lib/auth/secret-file.ts:89`–`91`: *"Compared with `>=`, not `>`: `bufio`'s exact boundary
  depends on how its buffer grows, so the bound is taken one byte tighter than the most
  permissive reading of it."* It does not depend on how the buffer grows, and the reader is not
  one byte tighter — it is **exactly** Docker.
- `lib/auth/secret-file.test.ts:78`–`82`: the model refuses at `> MAX_SCAN_TOKEN_SIZE`, described
  as *"the most permissive reading"*. It is one byte **more permissive than the real thing**.

That matters because the model is the guard: a line of exactly 65536 bytes is *"Docker takes /
we refuse"* to the model and *"both refuse"* in reality. If `MAX_LINE_BYTES` is ever relaxed from
`>=` to `>`, the implication test would still pass while the reader accepted a file Docker
refuses — the P1 falsification, in the one place the last loop hardened.

### 11b-A11 ⚠ The dry run — the review surface — announces the OLD mode, and a `check` row tells the operator the old mode is correct

**Severity: MEDIUM.** **Measured** (text).

- `dashboard.sh:1085` — `cmd_set_password --dry-run` prints
  `would write PASSWORD_HASH=<the hash, not printed> to $ENV_FILE (0600 root:root)`.
  The real write is `0640 root:$(container_gid)`. `env_set`'s own dry-run arms (`:600`, `:602`)
  were updated; this one returns **before** `env_set`, so it was missed — the same
  "the fix reached one of two callers" shape as 11-A7, in the same function.
- `dashboard.sh:1637` — `env_unreadable_row` tells the reader *"a correct deployment is root:root
  0600"*. Since this loop a correct deployment is `root:<gid> 0640`, and `0600 root:root` is the
  one mode that produces the silent-401 failure the loop exists to remove.

`INSTALL-SPEC.md` §1 asks that a dry run be a complete account of what the real run does. On the
single most contested item of this loop (11b-build.md §9 row 1), it is an account of the opposite.

### 11b-A12 ⚠ A refusal can print up to 32 characters of a secret — the module's own absolute is not literally true

**Severity: LOW-MEDIUM.** **Measured.**

`secret-file.ts:59`–`66`: *"Not the value, not the line, not a prefix of either, and not a
character of either."* `namedKey` (`:186`) prints any key of 1–32 printable-ASCII characters.
A hard-wrapped secret whose tail carries an `=` puts a fragment of the value in key position:

```
PASSWORD_HASH=<hash>
SESSION_SECRET=abcd
secretf-rag=ment
```
```
REFUSE
   the file (line 3): 'secretf-rag' is not a usable environment-variable name
```

`check_env_file:1608` prints the identical string (the test phase deliberately made the two
agree). 32 characters is exactly `MIN_SESSION_SECRET_CHARS` — a whole minimum-length session
secret. The test phase judged this unreachable *today* because the scrypt encoding is unpadded
base64url and carries no `=`; that is a property of the **producer**, not of the rule, and the
32-character bound is not a bound on "cannot be printing something else" for a 32-character
secret. Either the bound or the sentence should change; recorded, not fixed.

### 11b-A13 ⚠ A read that blocks makes `register()` never return — no exit, no restart, no start limit

**Severity: LOW.** Blocking **measured**; the systemd consequence **reasoned, not run**.

`readFileSync` on a FIFO at the path blocks until a writer appears. Measured: `refusal()` printed
nothing and the process was still alive after 6 s and had to be killed. `register()` therefore
never resolves, `NextNodeServer.prepareImpl()` awaits it forever, and the process neither serves
nor exits — so `Restart=always` never fires and `StartLimitBurst=5` never counts. `Type=simple`
means systemd reports the unit `active (running)` throughout, and `check`'s `ActiveState` row
agrees. Only `check_gate` notices, as *"nothing answered on 8090"*.

A FIFO is unlikely; the class — any read that can block (a hung NFS/fuse mount, a device node) —
is unbounded, and `runStartup` has no timeout. Everything else in this family is handled
correctly: a directory, `EACCES`, `ENOENT` and a >2 GiB file all throw and are caught into a
refusal; a 0-byte file yields *"PASSWORD_HASH: is absent / SESSION_SECRET: is absent"* (measured).

### 11b-A14 The model's `os.LookupEnv` branch is never exercised

**Severity: LOW.** **Measured** (read).

`dockerEnvFile(bytes, hostEnv = {})` implements Docker's *"a bare `KEY` is taken from the host's
environment"* rule, and **every** call site passes the default `{}`. So the branch is dead in the
comparison. It is harmless for the implication (this reader refuses every bare line, so it can
never be the more permissive side there), but it means step 12's planned confirmation —
`docker run --env-file … env` per shape — will give **different answers depending on the invoking
shell's environment** for the bare-line shapes, and nothing says so.

---

## 2. What held

Attacked and found sound:

- **The upstream grammar model.** `pkg/kvfile/kvfile.go` and `opts/parse.go` were fetched and
  read line by line. `--env-file` is `ReadKVEnvStrings` → `kvfile.Parse(file, os.LookupEnv)` →
  `parseKeyValueFile`, with **no** further validation of env-file entries anywhere in the CLI
  (`-e` overrides are merely appended after). Every rule in `secret-file.test.ts`'s model matches
  the source: per-line `utf8.Valid` **before** the BOM trim, BOM on line 1 only via `TrimPrefix`,
  `TrimLeftFunc(unicode.IsSpace)`, skip on empty-or-`#`, `strings.Cut` on the first `=`, empty key
  → **whole file refused**, `ContainsAny(key, " \t")` → **whole file refused**, value verbatim.
  `GO_SPACE` is the complete `unicode.White_Space` set (09–0D, 20, 85, A0, 1680, 2000–200A, 2028,
  2029, 202F, 205F, 3000) — checked element by element. The one thing it gets wrong is the
  line-length boundary, 11b-A10.
- **Per-line UTF-8 vs whole-buffer UTF-8.** `0x0a` cannot occur inside a multi-byte UTF-8
  sequence, so Docker's per-line `utf8.Valid` and this reader's whole-buffer strict decode are
  exactly equivalent. Not a hole.
- **The skip sets nest the right way.** `check`/the reader strip `[ \t]` for the skip decision;
  Docker strips the whole Go space set. Every line this reader skips, Docker skips; every line
  this reader accepts has no leading whitespace at all (the key regex forbids it) and is accepted
  by Docker identically. So the trim difference cannot make this reader looser.
- **`${#line}` is bytes.** `export LC_ALL=C` at `dashboard.sh:49` makes bash count bytes —
  verified on this bash (3.2.57): `LC_ALL=C` → 6, UTF-8 → 3 for `"ééé"`. `MAX_ENV_LINE_BYTES`
  really is a byte bound in `check`, matching the reader's undecoded-byte scan.
- **`drift_unknown` / `container_field`.** The test phase's fix is real: all six flag reads and
  the image read are judged, and the two empty-expectation rows (`--restart`, `-p`) can no longer
  tick on a failed read.
- **The secret never reaches a refusal message by its own content.** Constructed values whose
  *content* is what makes the line malformed — `=`, `#`, a quote, a backtick, a `$`, a newline, a
  NUL, a 0x7f, a BOM — and no refusal carried the value, a prefix of it, or a character of it,
  on either side. The single exception is 11b-A12's key-position fragment. `env_set`'s `--dry-run`
  prints `<N characters, not printed>` for both secret keys and the value only for `STANDING`,
  which is configuration; `die "refusing to write ${key}: the value ${why}"` interpolates the
  *reason*, never the value. No `set -x` anywhere in `dashboard.sh`.
- **The request path never throws.** An unreadable, refused or absent file yields an empty frozen
  `Environment` on every entrance except `require()` — so a 401, never a 500. (That this is a
  *silent* 401 after startup is 11b-A3; the promise itself is kept.)
- **`unit_exec_start`.** Re-read against comments, `;`-comments, a second `ExecStart=`, the reset
  form, and continuations. No fail-open beyond the drop-in gap the test phase already recorded
  (`check_drift` reads `$UNIT_PATH` textually, not `systemctl show -p ExecStart`; that direction
  is fail-closed, so it is a false alarm, and it is confirmed here rather than re-litigated).
- **The other "nothing found" rows.** Swept `cmd_check`'s twelve rows for the A5 shape:
  `check_standing`'s `(( bad == 0 ))`, `check_firewall`'s empty-rule tests, `check_gate`'s
  `""|000` arm, `check_unit`'s three `""` → `row_unknown` arms and `report_ordering_cycles`'s
  exit-status arm, `check_one_process`'s `wc -l` counters (a failed read yields `0`, which
  fails **closed**) and `check_container`'s `-z` arm are all sound. `check_one_process`'s
  `others` block is the only other "absence is the pass condition" — it prints **no row at all**
  rather than a tick, so it is silence, not a false pass, but a negative result there is never
  reported either.

---

## 3. What this phase could NOT verify, and why

| | why |
|---|---|
| Every container and systemd claim above | **No Docker and no systemd on this Mac.** 11b-A4's inode pinning, 11b-A5's "Docker creates the bind-mount source as a directory", 11b-A7's `EACCES` path, and 11b-A13's `Restart=always`/`StartLimit` consequences are all **reasoned, not run**. Step 12 owns them |
| That the reader really is bundled three times | Not re-measured here: a `next build` needs an isolated copy and the parent's `next dev` owns `.next/`. 11b-A3 **simulates** the measured bundling with three sources over one path and measures the consequence; the bundling itself is the test phase's measurement, not this one's |
| That step 11's and step 07's harnesses still bite after these observations | **Neither harness was run, deliberately.** The rules forbid running two at once or killing one, and the test phase paid for that once with nine stranded mutations; nothing in this phase needed a harness, and running one was the riskiest thing available. Nothing in the tree was edited, so both ledgers are exactly as the test phase left them |
| `docker run --env-file` against the 45 generated shapes | Needs the box. The first shapes to try are the eleven in 11b-A1 and a line of **exactly 65536 bytes** (11b-A10), which real `bufio` refuses and the test's model takes |
| Whether the mode ruling survives | `SPEC.md` §5/§5.1 and `INSTALL-SPEC.md` §6 still say `0600 root:root`, and 11b-A6/A7/A11 all sit on top of the unresolved amendment. Not touched here |

---

## 4. Suggested order, if any of this is taken up

1. **11b-A1 + 11b-A2 together.** Fixing the three missing rules without generating the corpus
   repeats the mistake: generate the files, then add the rules the generator finds missing.
2. **11b-A5**, because it is two unjudged reads and one line, and because the sweep that was
   supposed to catch it is on record as having cleared it.
3. **11b-A6 and 11b-A11**, one line each, both on the mode — which is the item the spec
   amendment is still pending on.
4. **11b-A3** is the owner's call the test phase named, now with the consequence measured rather
   than reasoned. A process-wide memo closes the divergence; it does **not** close the "the file
   changed after startup and nobody said so" half, which needs a decision of its own.
