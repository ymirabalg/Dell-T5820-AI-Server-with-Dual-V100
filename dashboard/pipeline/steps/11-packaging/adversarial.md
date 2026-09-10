# Step 11 — ADVERSARIAL: packaging

**Written 2026-09-10.** Branch `dashboard-frontend`, step 11 still uncommitted on `3f152b0`.
**Nothing was fixed and nothing was left edited**: every mutation below was applied, measured
and reverted from a pristine copy, and `md5 dashboard.sh Dockerfile .dockerignore
systemd/ai-dashboard.service` is byte-identical to what this phase inherited. `git status`
matches. `SPEC.md`, `MOCK.html` and `INSTALL-SPEC.md` untouched.

⚠ **There is no Docker on this Mac.** Every statement about a built image, a running
container or systemd is labelled **reasoned, not run**; everything else is **measured** and
says how.

**The headline.** The test phase found that the build's cross-check measured the *validators*
while nothing measured the `check` **rows** that call them — eight one-line edits, all green.
It closed five rows. One layer out, the same hole is still open almost everywhere:
**63 one-line edits applied, 49 kept `pnpm vitest run packaging.test.ts` green**, and the one
representative case re-run under the full suite kept **`pnpm verify` at 3092 passed, exit 0**.
Every `check` row except the five that were wired, every preflight refusal including the ufw
port-22 HARD REFUSAL, `restart`'s container-id proof, all three systemd verifications and
`install`'s own failure gate can each be disconnected with one line and nothing goes red.
`check_one_process` can be deleted from `cmd_check` outright.

Two further defects were measured rather than argued: **D8's judge is LOOSER than the browser
for twelve Unicode space characters** (the direction §1.2 of the test phase says must never
happen, one input shape over from the `awk -v` bug it fixed), and **`check` prints a whole
64-hex line — SESSION_SECRET's exact shape — to the terminal with a `…` that implies it was
truncated.**

---

# Findings

## 11-A1 · HIGH · a cross-check is only worth its call site — 49 of 63 one-line edits stay green

**Measured.** Harness: `/private/tmp/.../scratchpad/sweep.py`. Each row is one edit applied to
the tree as built, `pnpm vitest run packaging.test.ts` run against it (1.6 s per run), then the
file restored from a pristine copy and the restore asserted byte-for-byte. `packaging.test.ts`
is the **only** file in the repo that reads `dashboard.sh`, `Dockerfile`, `.dockerignore` or
`systemd/ai-dashboard.service` (grepped: the other five hits are prose in comments), so its
verdict is `pnpm verify`'s verdict for these artefacts. Confirmed once end to end: with
`restart`'s id proof disconnected (X30), **`pnpm verify` → 3092 passed, 0 type errors, exit 0**.

### 1a. `check`'s rows — every row the test phase did not wire (18 edits, 18 survived)

`check` is the only place on the box where any of §9's rows can be noticed at all. Five rows
now have a `checkRow` test. These do not:

| # | one-line edit (`dashboard.sh`) | what it costs on the box |
|---|---|---|
| X01 | `check_gate`:1400 `code="$(curl …)"` → `code=401` | the gate row always passes. `proxy.ts` left at `middleware.ts` never runs and **every route is open** — the row exists for exactly this |
| X02 | `check_one_process`:1294 `named="$(docker ps …)"` → `named=1` | O22's container count is a constant |
| X03 | :1303 `others="$(trim "$others")"` → `others=""` | the second-instance row never fires (the row `11-O1` was written to protect) |
| X04 | :1299 the `--filter ancestor=` query → `by_id=""` | half of the union the test phase added in §3 |
| X05 | :1325 `listeners="$(ss …)"` → `listeners=1` | the 8090 listener count is a constant |
| X06 | :1316 `procs="$(docker top …)"` → `procs=1` | "one process inside it" is a constant |
| X07 | :1152 `if [[ "$mode" == "600" && "$owner" == "root:root" ]]` → `if true` | a world-readable credentials file passes |
| X08 | :1174 `if [[ ! "$key" =~ ^[A-Za-z_]… ]]` → `if false` | a BOM'd or malformed key name passes |
| X09 | :1355 `row_fail "$UNIT_PATH is not installed"` → `row_ok` | no unit at all reads green |
| X10 | :1361 the wrong-`StartLimitIntervalUSec` arm `row_fail` → `row_ok` | **trap 1's runtime half**, silently |
| X11 | :1368 `report_ordering_cycles \|\| row_fail …` → `\|\| true` | **trap 2's runtime half** |
| X12 | :1367 `row_fail "the unit is ${state}"` → `row_ok` | `failed`/`inactive` reads green |
| X13 | :1387 `row_fail "NO rule covers port 22"` → `row_ok` | the row about the failure that took this box off the network |
| X14 | :1385 `r8090="$(ufw_rule_for_port "$PORT")"` → `r8090="present"` | 8090 unprotected reads green |
| X15 | :1375 `row_fail "ufw reads ENABLED=no…"` → `row_ok` | **the exact 2026-09-04 defect** — a firewall that is not enforcing, ticked |
| X16 | :1344 `row_fail "$f is missing…"` → `row_ok` | no `hash-password.py`, discovered by whoever needs it |
| X17 | :1191 `row_fail "PASSWORD_HASH is absent…"` → `row_ok` | O20's absent case |
| X18 | :1211 `row_fail "SESSION_SECRET is absent…"` → `row_ok` | O21's absent case |

And two that are worse than any single row:

| # | edit | effect |
|---|---|---|
| **X22** | `cmd_check`:1435 `  check_one_process` → `  true` | **the entire O22 section is deleted from `check`** and 31 tests stay green |
| **X21** | `cmd_check`:1441 `if (( CHECK_FAIL > 0 ))` → `> 99` | `check` **can never return 1**; `install`'s gate, `restart`'s gate and the operator's exit code all go green together |

The shape is the test phase's own finding, unchanged: `checkRow(fn, envFileBody)` exists and
works, and it is pointed at five rows out of twenty-one. Nothing asserts that `cmd_check` calls
any particular function, or that a failed row raises `CHECK_FAIL`.

### 1b. Every preflight refusal (7 edits, 7 survived)

`refuse` → `warn` in each case; the dry-run test still finds a `WOULD REFUSE` from the
remaining ones, so it never goes red.

| # | line | refusal removed |
|---|---|---|
| X24 | 599 | **the ufw port-22 HARD REFUSAL** — the one guard standing between a root run and the 2026-09-04 lockout |
| X25 | 625 | something else already listening on 8090 |
| X23 | 553 | x86_64 (the image is amd64-only) |
| X26 | 614 | `python3` missing — the only producer of a `PASSWORD_HASH` |
| X27 | 565 | `$SRC/package.json` is not `ai-dashboard` — i.e. the script is pointed at the wrong tree |
| X28 | 576 | < 10 GB free on `/var/lib` |
| X29 | 109 | `need_root()` neutered entirely |

### 1c. The loud-failure obligations the build's own §1 names as deliberate (6 edits, 6 survived)

| # | edit | what it disconnects |
|---|---|---|
| **X30** | `cmd_restart`:1054 `if [[ -n "$before" && "$before" == "$after" ]]` → `if false` | **"a `restart` that reports success and changes nothing" — named in build.md §1 and FIRST-DEPLOY §5.1 as this repo's most-repeated failure mode.** One line. `pnpm verify` 3092 passed |
| X31 | :1058 drop the trailing `cmd_check` | `restart` stops re-checking |
| X32 | `cmd_unit`:922 `check_start_limit \|\| die` → `\|\| true` | trap 1's *install-time* verification — the "ask systemd what it ended up with" half |
| X33 | `report_ordering_cycles`:960 `return 1` → `return 0` | trap 2's detector reports a cycle and returns success |
| X34 | `cmd_install`:1508 `die` → `warn` | §12.2's answered question: install no longer fails on a failed check |
| X35 | `cmd_start`:1034 `wait_for_answer \|\| die` → `true` | `start` stops proving anything answered |

### 1d. The credentials file (5 edits, 5 survived)

| # | edit | effect |
|---|---|---|
| X37 | `env_set`:451 `install -m 0600` → `-m 0644` | **the file carrying the password hash is written world-readable.** `check`'s own mode row would catch it later; nothing in the suite does |
| X38 | `backup_env`:410 `install -m 0600` → `-m 0644` | the same for every backup in `/root` |
| X36 | `env_get`:394 `\| tail -1` → `\| head -1` | Docker takes the **last** duplicate key; `check` would judge the first. A hand-edited file with two `SESSION_SECRET=` lines is then judged on the line the container never sees |
| X39 | `env_value_error`:280 drop the `$'\t'*` alternative | a tab-indented value passes; Docker keeps it |
| X45 | `cmd_set_password`:827 `if ! why="$(scrypt_hash_error …)"` → `if false` | the belt-and-braces re-check of the producer's own output, which build.md §2 justifies at length |

### 1e. Idempotence — "install over an existing install" (3 edits, 3 survived)

None of the three promises in `cmd_install`'s own header comment is measured:

| # | edit | effect |
|---|---|---|
| X42 | `cmd_configure`:850 `if env_has SESSION_SECRET && …` → `if false` | **`configure` rotates a live `SESSION_SECRET`, logging out every open session** — the property the comment calls "the same principle as `serve-llm.sh install` never repointing a live model" |
| X43 | :876 `if env_has STANDING` → `if false` | `configure` overwrites the operator's `STANDING` |
| X44 | `cmd_install`:1482 the PASSWORD_HASH guard → `if false` | `install` re-prompts for and overwrites an existing password |

### 1f. The image and the unit (10 edits, 10 survived)

| # | file:edit | effect |
|---|---|---|
| X56 | unit:78 `--env-file /etc/ai-dashboard.env` → `…env.bak` | the container reads the wrong file. Nothing asserts the path |
| X59 | unit:70 `--name ai-dashboard` → `ai-dashboard2` | the container's name drifts from the one `check`, `ExecStartPre` and `ExecStopPost` all use |
| X58 | unit:94 delete `ExecStopPost=` | the SIGKILL cleanup the build calls "one addition beyond §7's shape" |
| X47 | Dockerfile:80 `NODE_ENV=production` → `development` | nothing asserts it |
| X50 | Dockerfile:32 drop `--frozen-lockfile` | the lockfile guarantee the comment calls load-bearing |
| X51 | Dockerfile:38 narrow `COPY . .` | the build stage's copy is unasserted |
| X54 | `.dockerignore` drop `pipeline` + `SPEC.md` | the spec and the whole pipeline enter the build context |
| — | (X46, X48, X52, X53, X55, X57, X60, X61, X63, X64 were **caught**; see *What held*) | |

**One-line summary of 11-A1:** the build's instrument is a good instrument aimed at 24 % of the
surface. Two structural gaps produce all of it — nothing asserts *which functions `cmd_check`
calls*, and nothing asserts *that a guard refuses* (only that a validator's verdict is right).

---

## 11-A2 · HIGH · D8's judge is LOOSER than the browser for twelve whitespace characters

**Measured**, differential fuzz of `standing_entry_error` against `standingIdsFrom`
(scratchpad `adv-fuzz*.test.ts`, 1723 random + 153 targeted inputs).

```
LOOSER  bash accepts, browser calls unknown: "unit:\u00a0"      (and \u1680 \u2000 \u2003
LOOSER  bash accepts, browser calls unknown: "gpu_temp:\u00a0"   \u2007 \u200a \u2028 \u2029
                                                              \u202f \u205f \u3000 \ufeff)
24 of 153 targeted inputs LOOSER, 60 stricter
```

The mechanism is the one the script's own comment describes and then mis-scopes. Under
`LC_ALL=C`, `trim` strips only the ASCII set; JavaScript's `.trim()` also strips these twelve.
When the extra whitespace lands **after the colon** the two judges disagree in the dangerous
direction: bash sees a non-empty subject and **accepts**, while the browser trims it to `''`
and reports the entry **unknown**. `check` then prints
`✓ all N STANDING entries match a §6.4 condition kind or id` for an entry that suppresses
nothing — D8's entire failure mode, certified green by the only thing on the box that can see
it.

- `dashboard.sh:352-355` states the divergence as one-directional ("accepted by the browser and
  reported here as unknown — a false alarm an operator can see, never a silent pass").
- `packaging.test.ts:342` is named
  `⚠ a non-breaking space makes bash stricter than the browser, never looser` and tests only
  the **bare-kind** shape (`gpu_temp<NBSP>`), which is indeed the safe half. The second half of
  its own name is false, and ` ` is the character the test chose.
- This is the same class as the test phase's §1.2 `awk -v` finding — a judge made looser by a
  text-processing detail — one input shape away from where it was found.

Reachability: a `STANDING` value is typed or pasted into an env file by hand. `\u00a0` and the
BOM `\ufeff` are what a paste from a rendered document, a chat window or a PDF carries; the project already
accepted that premise when it wrote the NBSP test and exported `LC_ALL=C`.

`\u200b` (zero-width space) is **not** in JavaScript's trim set and produces no divergence —
the boundary is exactly `String.prototype.trim`'s WhiteSpace + LineTerminator set.

---

## 11-A3 · HIGH · `build` silently ships the previous image, and `restart` then proves a restart happened

**Reasoned from `cmd_build`:756-775 — not run (no Docker).**

```bash
sudo ./dashboard.sh build              # -> ai-dashboard:notag-20260910 + :latest
#   …fix a bug on the Mac, rsync it over, same day…
sudo ./dashboard.sh build              # image_exists "ai-dashboard:notag-20260910" -> TRUE
#   ✓ ai-dashboard:notag-20260910 already exists; not rebuilding (use --force)
sudo ./dashboard.sh restart            # container id CHANGES -> ✓ ; check -> every row passes
```

The skip is printed with `ok` — a green tick — and `:latest` is left pointing where it was, so
the new container runs the **old code** and every instrument in the project agrees it is
healthy. `restart`'s id comparison, which exists precisely to refuse a restart that changed
nothing, actively confirms it: the id *did* change.

Two entrances, both realistic:

- **no `--tag`** — the tag is `notag-<UTC date>`, so any two builds on the same day collide.
  This is the default path, and `install` takes it whenever the operator does not pass `--tag`.
- **`--tag <sha>` re-used** — iterating on a fix before committing means the same short sha.

`install` inherits it: an `install` re-run after an rsync is a no-op that ends in a green
`check`. Nothing anywhere compares the running container's image id with a freshly built one,
and `status` cannot show it either (`docker ps --format {{.Image}}` prints the *reference*,
`ai-dashboard:latest`, not the id behind it).

The one-word fix is not mine to make, but note the asymmetry the script already accepts
elsewhere: `--force` exists, and this is the only place in the script where "already present"
is treated as "already correct".

---

## 11-A4 · HIGH · `unit` and `install` change the unit file without restarting, and no row notices

**Reasoned from `cmd_unit`:894-933 and `cmd_install`:1471-1512 — not run.**

`cmd_unit` installs the file, `daemon-reload`s, `enable`s, verifies `StartLimitIntervalUSec`
and greps the journal. It never restarts. `cmd_install` then calls `cmd_start`, and
`systemctl start` on an already-active unit **returns 0 and does nothing**. So:

- a changed `ExecStart` — a new mount, a changed `--env-file`, the `--gpus all` fallback when
  it lands — is installed, reported `✓ installed`, reported `✓ enabled`, and **is not in
  force**;
- `check_unit` asks systemd for `StartLimitIntervalUSec` and `ActiveState`, both of which
  reflect the **new file** after `daemon-reload`, so every row is green while the running
  container carries the old flags.

This is the repo's own rule ("writing the config is not evidence it took") applied to the
directive and not to the container. The evidence that would settle it exists and is unused:
`docker inspect ai-dashboard --format '{{json .Config}}{{json .HostConfig}}'` versus the unit's
own `docker run` line.

`cmd_set_password` warns "the container reads this file once, at creation — run:
dashboard.sh restart" when a unit is installed. `cmd_unit` and `cmd_configure` print no such
line, and `configure` is the other subcommand that changes what the container was created with.

---

## 11-A5 · HIGH · a non-root `check` reports the credentials ABSENT — the case exit 2 was invented for

**Measured**, `ENV_FILE` pointed at a mode-000 file, run as an unprivileged user:

```
The env file (§6)
  ✗ … is ? ?, expected root:root 600 — it carries a password hash
  ? cannot read … — re-run with sudo to check its contents
O20 — the password hash
  ✗ PASSWORD_HASH is absent — every login is denied, silently
O21 — the session secret
  ✗ SESSION_SECRET is absent — readAuthConfig returns null and every session is refused
D8 — STANDING (§6.4)
  ✗ STANDING is absent. §6.4's suppression then never applies and nothing says so
```

`env_has` (`:397`) and `env_get` (`:390`) both `return 1` when the file is unreadable, and all
three rows read that as **absent** rather than **unknown**. On Ubuntu, a correct deployment
(`root:root 0600`) checked by the operator without `sudo` prints exactly these three FAILED
rows and exits **1**, not 2 — on a box where everything is right.

That is the inverse of S5's whole argument. The script's own header says exit 2 is "almost
always *re-run it with sudo*"; the most common no-root case cannot reach it, because
`check_env_file` correctly files a `row_unknown` and then three rows contradict it with a
specific, alarming, wrong diagnosis. The operator's most likely next action —
`sudo ./dashboard.sh set-password` — overwrites a working password.

(The `? ?` on the mode row is the documented BSD-`stat` artefact and does not occur on the box.
The three "absent" rows do.)

---

## 11-A6 · HIGH · `check` prints a whole 64-hex line, with an ellipsis that implies it did not

**Measured**, env file containing a bare `deadbeef…` line (64 hex characters):

```
✗ a line with no '=' (deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef…):
  Docker reads that as 'take this from the host environment'
```

`dashboard.sh:1170` prints `${line%%[!A-Za-z0-9_]*}` — the prefix up to the first character
outside `[A-Za-z0-9_]`. A `SESSION_SECRET` is **64 characters of `[0-9a-f]`**, by
`cmd_configure`'s own deliberate choice (`:853`), so it contains no such character and the
parameter expansion removes **nothing**: the entire secret is printed, followed by a `…` that
tells the reader it was truncated.

The reachable scenario is the one this row exists for — a hand-edited env file. An editor's
hard wrap on a long `SESSION_SECRET=…` line leaves the tail as a bare hex line with no `=`;
so does a paste that loses the `SESSION_SECRET=` prefix. The file's stated invariants say this
must not happen (`dashboard.sh:178-180`, build.md §1 *"Nothing is ever printed that a
credential could be recovered from"*), and two mutations — `11-H8` and `11-H12` — exist to
enforce it on the hash paths. The one row whose input is an *unstructured* line has no such
test, and the `…` makes the output look safe to paste onward, which is exactly what the
header comment warns about.

A `PASSWORD_HASH` pasted the same way is truncated at its first `.` and is safe by luck.

---

## 11-A7 · MEDIUM · `set-password --dry-run` still hides the backup into `/root` — the 11-N3 fix reached one of two callers

**Measured.** Against an existing env file, `configure --dry-run` prints the backup and
`set-password --dry-run` does not:

```
set-password --dry-run:
  · would write PASSWORD_HASH=<the hash> to …/ai-dashboard.env (0600 root:root)
      (no "would copy … -> …/ai-dashboard.env.bak.<ts> (mode 0600)" anywhere)
```

`cmd_set_password`:787-796 returns **before** `env_set`, so `backup_env`'s dry-aware branch is
unreachable from it — the identical defect the test phase found and fixed in
`cmd_configure` (test.md §5, `11-N3`). test.md's own table names the divergence as
"`configure` / `set-password` | nothing | ⚠ a timestamped 0600 copy of the credentials file
into /root"; the fix moved `backup_env` above `env_set`'s dry return, which repairs every
caller that *reaches* `env_set`, and `set-password`'s dry run does not.

`set-password` is the subcommand that rewrites a live credentials file every single time it is
run. Its printed announcement is also a second spelling: `would write PASSWORD_HASH=<the hash>`
versus `env_set`'s `would write PASSWORD_HASH=<NN characters, not printed>`.

---

## 11-A8 · MEDIUM · `ufw_rule_for_port` cannot see three legal spellings of a port-22 rule, and the HARD REFUSAL fires on them

**Measured** by running the function's own `awk` program (`:486-501`) against fabricated
`ufw status` output:

| input | found? |
|---|---|
| `22/tcp                ALLOW  192.168.4.0/22` (what this script writes) | ✓ |
| `192.168.4.71 22/tcp   ALLOW  192.168.4.0/22` (`ufw allow from LAN to <ip> port 22`) | **✗** |
| `Anywhere              ALLOW  192.168.4.0/22` (a blanket `ufw allow from LAN`) | **✗** |
| `[ 1] 22/tcp           ALLOW IN  Anywhere` (numbered, rules 1–9) | **✗** |
| `[10] 22/tcp           ALLOW IN  Anywhere` (numbered, rules 10+) | ✓ |

The first two are legal, common ufw spellings that genuinely cover port 22. On a box firewalled
either way, `preflight` (`:599`) takes its **HARD REFUSAL** and `refuse` → `die`: every root
subcommand — `deps`, `build`, `set-password`, `configure`, `unit`, `firewall`, `start`,
`install` — is blocked on a correctly configured machine. `check_firewall` prints
`✗ NO rule covers port 22` at the same time. A refusal that fires on a correct configuration is
how an operator learns to ignore the one refusal that matters.

The rows 1–9 case is a bug inside a defensive branch: the comment at `:490` says
`ufw status numbered` prefixes `[ N]`, and ufw pads single digits with a **space** (`[ 1]`), so
awk's `$1` is `[` and `$2` is `1]` — the branch takes the rule *number* as the port. It is dead
today (only plain `ufw status` is parsed) and would misfire the moment someone routed numbered
output through it.

---

## 11-A9 · MEDIUM · on this box, `install` dies at step 7 of 9 — with the unit enabled and nothing running

**Measured on the dry surface; the real-run consequence is reasoned.**

Root `CLAUDE.md` records ufw as **not enforcing** on ai-server (`sudo ufw enable` is still
outstanding). `cmd_firewall`:980 refuses on exactly that, and in a real run `refuse` is `die`.
`install`'s order is `deps → build → set-password → configure → unit → firewall → start →
check`, so the sequence on the box today is:

1. Docker + toolkit installed, `daemon.json` rewritten, **docker restarted**;
2. the image built;
3. the password prompted, hashed and written; `SESSION_SECRET` generated;
4. the unit installed, `daemon-reload`ed and **`systemctl enable`d**;
5. `✗ ufw reads ENABLED=no. This script does not enable firewalls.` → **exit 1**.

`start` and `check` never run. The unit is *enabled but never started*, so the deployment first
comes up **at the next reboot**, unattended, with no ufw rule — while the operator's last
signal was a failure. Halting is what INSTALL-SPEC §8 asks for ("if it ever does not, the
script says so and stops"); doing it seven steps in is not, and `preflight` already knows the
answer at step 0 — it prints `! ufw: NOT enforcing` as a **warning** and lets the run proceed.
The two judgements of the same condition, 380 lines apart, disagree.

Two smaller truths in the same measurement (`install --dry-run`, 190 lines):

- the closing line reads **`✗ 5 preflight refusal(s) above; a real run stops at the first one`**
  while only 3 are preflight; #4 is `cmd_firewall`'s and #5 is `cmd_start`'s `need_root`. "A
  real run stops at the first one" is true of the preflight three and badly misleading about
  the firewall one, which stops a run that has already done everything above;
- preflight's own summary says `3 refusal(s) above`, and two more appear later with no running
  total until the end.

---

## 11-A10 · MEDIUM · `uninstall` leaves a rule, a container and every copy of the secrets

**Reasoned from `cmd_uninstall`:1514-1576 — not run.**

1. **The ufw rule.** `run ufw delete allow from "$LAN" to any port "$PORT" proto tcp` matches
   the rule *textually*, including the CIDR. `--lan-cidr` is not persisted anywhere, so an
   install done with `--lan-cidr 10.0.0.0/8` and an uninstall done without it leave 8090
   allowed. ufw's own response to a non-existent rule (`Could not delete non-existent rule`) is
   either exit 0 — silent — or exit non-zero, which under `set -e` **aborts the uninstall**
   before the env-file and image steps. Neither branch is checked, and nothing re-reads
   `ufw status` afterwards. README:65 says uninstall removes "unit + container + ufw rule".
2. **A second container.** Only `docker rm -f "$CONTAINER"` runs. The very container
   `check_one_process` was widened to notice — one from an older tag, under another name — is
   left running after "uninstall", still serving the dashboard on its own port with the
   credentials it was created with, and now with no unit and no rule to remove it.
3. **`--purge` does not purge the secrets.** It deletes `/etc/ai-dashboard.env` after a typed
   `DELETE`, having told the operator "this deletes … the password hash and the session
   secret". Every `env_set` call has already written a timestamped 0600 copy of that file into
   `/root` (`backup_env`:404-412) — two per `configure`, one per `set-password`, one per
   password change, for the life of the box. Nothing prunes them and `--purge` does not mention
   them. The hash is offline-attackable and the secret forges every session; after `--purge`
   both are still on disk, in a directory nobody thinks of as holding credentials.

---

## 11-A11 · MEDIUM · the ordering-cycle detector reports ✓ when it cannot read the journal

**Reasoned from `report_ordering_cycles`:951-964.**

```bash
hits="$(journalctl -b --no-pager 2>/dev/null | grep 'ordering cycle' || true)"
if [[ -n "$hits" ]]; then … return 1; fi
ok "no ordering cycle in this boot's journal"
```

No output is read as *no cycle*. `journalctl -b` gives a user outside `adm`/`systemd-journal`
only their own journal — no system messages at all — so a non-root `check` on such an account
prints `✓ no ordering cycle in this boot's journal` having read nothing. `check` has a third
state for precisely this (`row_unknown`) and this row does not use it, on the one trap that
**can only ever be observed on a real boot** and that has already deleted start jobs on this
machine.

The account on ai-server is likely in `adm` (Ubuntu's first user), so this may never bite
there — but the row is the whole of step 12's ordering-cycle verification, and it cannot
distinguish "clean" from "could not look". A `journalctl -b -n0` exit-status probe, or
requiring root for the row, is the difference.

Related, same function: the grep is unqualified, so an ordering cycle involving **any** pair of
units on the box fails the dashboard's row and reads as the dashboard's fault.

---

## 11-A12 · MEDIUM · a failed `systemctl enable` prints a green tick, and nothing ever checks the unit is enabled

**Reasoned from `cmd_unit`:910-912.**

```bash
systemctl daemon-reload
systemctl enable "$UNIT_NAME" >/dev/null 2>&1 || warn "systemctl enable reported a problem"
ok "enabled $UNIT_NAME"
```

The `ok` is unconditional, so a failed enable prints `! systemctl enable reported a problem`
**and** `✓ enabled ai-dashboard.service`, with systemd's reason discarded by `>/dev/null 2>&1`.
That is a tick over a failure — the shape `ok_done` exists to prevent one line's worth of code
away.

The consequence is not cosmetic: **nothing in `check` asks whether the unit is enabled.**
`check_unit` reads `StartLimitIntervalUSec` and `ActiveState`; there is no
`systemctl show -p UnitFileState` anywhere in the script. A dashboard that is running now and
will not come back after a reboot passes every row. PLAN.md row 12's acceptance criterion is
literally *"survives a reboot"*, and the detector for it does not exist.

---

## 11-A13 · MEDIUM · `load_condition_rules` is loud only when it reads **nothing**

**Measured** with a copy of `lib/conditions.ts` whose `gpu_temp` row is reformatted onto four
lines (a `SRC=` pointed at a scratch tree; the project file was not touched):

```
14 rules loaded, no warning
standing_entry_error "gpu_temp"  ->  'gpu_temp' matches no condition kind
```

The `sed` at `:304` requires one exact single-line shape. Its guard (`:307`) fires only when
the result is entirely empty, so **any partial extraction is silent**: a prettier run, a
lengthened kind name that wraps, or an added field drops that kind from the vocabulary and
`check` then reports the operator's perfectly good `STANDING` entry as matching nothing. The
operator's fix is to delete a valid suppression, which un-suppresses an accepted condition —
noise in D8's own mechanism, sourced from a formatting change two directories away.

Today it is correct: 15 of 15 kinds are extracted, verified against
`grep -c "singleton:" lib/conditions.ts`. Nothing asserts the **count**, and a count is the
one assertion that would make the guard honest.

---

## 11-A14 · MEDIUM (advisory) · what a correct `--gpus all` fallback must not get wrong

INSTALL-SPEC §11.1 rules that a refused `--gpus all` must fall back rather than take the
dashboard down; it is **not implemented**, and the reconcile owns it. Reported as constraints
rather than as an absence. All of this is **reasoned, not run**.

**Where it can live.** The unit's stated invariant is that its `docker run` line is the only
copy of the container's flags. Two implementations break something:

- **two `ExecStart=` lines.** systemd accepts multiple `ExecStart=` only for `Type=oneshot`;
  on this `Type=simple` unit the file **fails to load** with *"Service has more than one
  ExecStart= setting"*. Not a fallback — a unit that will not start at all.
- **a wrapper script** re-spells the flags, which is the drift the unit was made a file to
  prevent, and moves the review surface out of the file the operator reads.

The remaining shape is a systemd variable — `ExecStart=/usr/bin/docker run $GPU_FLAGS …` with
an `EnvironmentFile=` written by an `ExecStartPre` probe. Three traps in that one line:

1. **`$GPU_FLAGS`, never `${GPU_FLAGS}`.** systemd splits the unbraced form on whitespace and
   passes the braced form as a **single argv**; `--gpus all` as one argument is rejected by
   docker. The two spellings look identical in review.
2. **`EnvironmentFile=-…` swallows its own absence.** A missing or unreadable file yields an
   empty variable — i.e. *the fallback* — with no message anywhere. That is the silently
   permanent path: the degraded mode becomes the default the first time the probe's output
   goes missing, and nothing distinguishes it from a deliberate fallback.
3. **The probe must not run the app's own image.** `docker run --rm --gpus all
   ai-dashboard:latest true` is a second container of this repository: `other_app_containers`
   matches it by repository *and* `--filter ancestor=` matches it by image id, so a `check`
   racing a start reports a false O22 failure. Probe with a trivial image, or ask
   `nvidia-ctk`/`docker info` instead.

**How `check` must tell the two apart.** Not from the unit text — it always says `--gpus all`.
Not from the telemetry: `gpus: null` is what a broken toolkit and *a box with no compute card*
both produce, and "there is no compute GPU" is this box's documented steady state, so that
inference is guaranteed wrong here at least once. The only honest source is the container
itself:
`docker inspect ai-dashboard --format '{{json .HostConfig.DeviceRequests}}'` — empty on a
fallback start, an `nvidia` entry on a healthy one.

**What must not become permanent.** The container is created once and lives until something
restarts it, and per 11-A4 nothing in the script restarts it. So a fallback taken during a
driver upgrade **survives the fix indefinitely**. `check`'s row therefore has to distinguish
three states, not two: *GPU mode*, *fallback and the toolkit is still broken*, and ***fallback
while the toolkit now works — restart to recover***. Only the third is actionable, and it is
the one a two-state row loses.

**And, per 11-A1, the new row needs a `checkRow` test of its own or it will be one line from
being disconnected like the other eighteen.**

Finally, six texts currently assert the *opposite* behaviour and none of them is measured, so
nothing will go red when they become false: `dashboard.sh:587`, `:666`, `:736-738`, `:1415-1416`,
`systemd/ai-dashboard.service:58-61`, `README.md:92-94`.

---

## 11-A15 · LOW-MEDIUM · `.dockerignore` protects credentials only at the context root

**Reasoned**, from the file's own stated semantics and the test phase's re-implementation of
moby's matcher (both agree: patterns are root-relative, `filepath.Match`).

`.dockerignore:19-21` explains that a bare `node_modules` matches only the root one, "so the
`**/` twins below are not decoration" — and then twins `node_modules`, `*.tsbuildinfo`, and
every test pattern, but **not** the section it calls the one that must never be violated:

```
.env          #  matches ./.env only
.env.*        #  matches ./.env.* only
*.apikey      #  matches ./*.apikey only
```

`app/.env.local`, `lib/.env` or `components/deploy.apikey` enter the build context, are uploaded
to the daemon, and land in the build cache on the box. Nothing exists today, which is exactly
when to add the twin. (The runtime image is unaffected — its two `COPY --from=build` lines are
what keep everything out of the finished image, as the test phase established.)

`scripts`, `pipeline`, `SPEC.md`, `MOCK.html`, `README.md` are likewise root-only, which is
correct for where those live today and silent if one ever moves.

---

## 11-A16 · LOW-MEDIUM · `Restart=on-failure` makes recovery depend on the container's exit code

**Reasoned, not run.** `docker run` exits with the container's status. Next's standalone server
handles `SIGTERM` and exits **0**, so `docker stop ai-dashboard` — the thing an operator reaches
for — leaves the unit `inactive (dead)` with `Result=success` and **systemd does not restart
it**. The wall panel goes blank and stays blank until someone notices. (`docker rm -f`, which
SIGKILLs, gives 137 and does restart.)

`check` catches the state after the fact (`the unit is inactive`), but a wall-panel service
whose whole point is being up is a `Restart=always` shape; `on-failure` is a deliberate choice
in INSTALL-SPEC §7 and worth re-reading against the exit code it actually depends on.

---

## 11-A17 · LOW · the env-file rewrite is not atomic

**Reasoned**, `env_set`:434-452. The new file is built in a `mktemp` (0600, in `/root` — right)
and then `install -m 0600 -o root -g root "$TMP" "$ENV_FILE"`. `install` **copies onto** the
destination: it truncates the live credentials file and writes it again. An interrupt, a full
`/`, or a power loss in that window leaves a truncated `/etc/ai-dashboard.env` — every login
denied with nothing logged, D8 and O21 gone at once. `mv` on the same filesystem would be
atomic; the timestamped backup is the mitigation the repo already asks for, and is what makes
this LOW rather than higher.

---

## 11-A18 · LOW · smaller things, each with its own line

| # | where | what |
|---|---|---|
| a | `packaging.test.ts:836` | `⚠ a preflight refusal under --dry-run is printed AND exits non-zero` asserts a property of **the machine running the suite** (macOS: `id != ubuntu`, `EUID != 0`). Run as root on Ubuntu with the box healthy, `install --dry-run` refuses nothing and the test fails. It measures the environment, not the artefact |
| b | `dashboard.sh:13` | `usage()`'s subcommand list is asserted to contain 13 entries; nothing asserts the **dispatch** `case` has the same 13. the existing `11-A2` mutation covers a misspelling, not an omission |
| c | `systemd/…:13` | `Documentation=file:/etc/ai-dashboard.env` points `systemctl status` at the 0600 credentials file as the unit's documentation. SPEC/README would be the documentation; the env file is the thing nobody should be invited to `cat` |
| d | preflight | never checks `curl` or `ss`, both of which it and `deps`/`start` use. `curl` missing makes `deps` die on a raw *command not found* inside a pipeline, against the script's own convention that a preflight exists so failures name their cause |
| e | `README.md:52` | the documented install line runs `git -C /path/to/repo rev-parse` **on the box**, twenty lines after the README states there is no checkout on the box. With git absent the command substitution is empty and `--tag` dies on bash's own `${2:?}` message |
| f | `cmd_deps` | still holds two spellings of four commands (the test phase recorded this). Also asymmetric: the env-file backup announces `(mode 0600)`, the `.sources` backup announces no mode |
| g | `check_session_secret` | after a non-quote failure (trailing whitespace, a backtick) the explanatory lines still talk about quotes. Recorded by the test phase as deliberate; noted again only because 11-A6 shows the same row's message construction is where the leak is |
| h | `--env-file` in general | both secrets end up in the container's environment, where `docker inspect` shows them in plaintext to every member of the `docker` group and `/proc/1/environ` shows them to root. This is INSTALL-SPEC §7's design and the repo's own `--api-key-file, never --api-key` rule is the counter-example. Owner-level observation, not a build defect |

---

# What held

Everything below was attacked and did not break.

**O20 is genuinely equal to the TypeScript.** Differential fuzz of `scrypt_hash_error` against
`parseScryptHash` over **3231 candidates** — a real `realHash()` mutated at one and two
positions, plus every structured edge (`Scrypt`/`SCRYPT`/`scryptx` tags, `logN` 0/1/20/21,
`+1`, `1e1`, `015`, `0x10`, `١٥`, `-1`, a 20-digit integer, standard-alphabet and padded salt
and key, one character short and one long, non-canonical tails, upper/lower-cased fields, an
argon2id string) — **zero divergences**. The eight `11-H*` mutations plus the four the test
phase added are aimed at the right place, and the fixture table's bounds are now symmetric.
This is the strongest thing in step 11.

**The five `check` rows the test phase wired do bite.** My sweep re-confirmed four
independently: the `SESSION_SECRET` length floor, the `STANDING`-absent row, the single-quote
arm and the `\r` arm of `env_value_error` each turned the suite red.

**The vocabulary really is read from the source of truth**: 15 of 15 kinds extracted, flags
correct, `unit` non-bare and `ufw_enforcing` singleton (spot-checked against
`lib/conditions.ts`).

**No path in this tree recreates trap 3.** `dashboard.sh` writes exactly one unit and no
drop-in; the only unit-graph command it runs is `systemctl enable` (grepped: no `.wants`, no
`/etc/systemd/system/*.d/`, no `systemctl link|add-wants`). Nothing names
`gpu-fan-control.service` or `llama-server@.service` in a `Wants=`/`After=`; `check_neighbours`
only reads `systemctl is-active`. `Wants=docker.service` (not `Requires=`) is the right
strength: `deps` restarts docker, and `Requires=` would propagate that stop.

**Secrets, on every path I could trace:**
- argv — clean. `printf` is a builtin, the password is never an argument, and the test asserts
  the spelling. `scripts/hash-password.py` reads stdin.
- the hasher's error paths — clean. Its only stderr line is `password rejected: needs …`, and a
  `UnicodeDecodeError` traceback carries the offending **byte offset**, never the input. If
  python ever printed anything else on stderr, `2>&1` folds it into `hash_out` and the
  belt-and-braces `scrypt_hash_error` turns it into a loud `die` rather than a written hash.
- temp file — `mktemp` in `/root`, 0600 from creation.
- dry-run prints — lengths only, and the test asserts the 64 characters are absent from the
  output.
- `status` — key **names** only.
- `set -x` — never enabled by the script.
- the journal and the unit file — no secret in either.
- the one leak is 11-A6, and it is in a message, not a design.

**`env_value_error` is stricter than Docker in the required direction** on every input I tried:
backtick, `$`, both quotes, `\r`, leading/trailing space and tab. A trailing space is refused
where `readAuthConfig` would trim — a false alarm an operator can see, which is the right way
round.

**The dry-run surface changes nothing**, re-confirmed across all thirteen subcommands against a
scratch `ENV_FILE`/`BACKUP_DIR`: the directory is still empty afterwards. `install --dry-run`
is 190 lines and does print the ufw refusal it will die on — at line 180 of 190.

**`.dockerignore`'s context** is as the two previous phases measured it; the runtime image is
two `COPY --from=build` lines and nothing else can reach it.

**Ten of the mutations I expected to survive were caught**, which is worth recording as
coverage that is real: `HEALTHCHECK NONE`, `ENV PORT=8090`, the `.env` pattern, the `scripts`
exclusion, the image reference in `ExecStart`, `ExecStartPre`, `--user 10001:10001`,
`Restart=`, the `--log-opt` rotation limits, and `NVIDIA_DRIVER_CAPABILITIES`.

---

# What I could not verify, and why

- **Anything that requires Docker.** No image was built, no container started, no
  `docker inspect` run. 11-A3, 11-A4, 11-A10 (parts 1–2), 11-A14 and 11-A16 are read from the
  code and from documented Docker/systemd semantics, and are labelled as such. In particular I
  could **not** confirm that `docker build` succeeds, that `pnpm install --frozen-lockfile`
  resolves the linux/x64 `sharp` variant, or what `docker run --gpus all` does when the toolkit
  is broken (the exact exit status matters to 11-A14).
- **Anything that requires systemd.** `StartLimitIntervalUSec`, `UnitFileState`, the
  ordering-cycle grep on a real boot, and the `ExecStart=`-must-be-single rule in 11-A14 are all
  from the unit file and systemd's documented behaviour, not from a running instance. **Trap 3
  can only be exercised by a real boot; step 12 still owns it**, and 11-A11 and 11-A12 say what
  step 12 must add to PLAN row 12's one line: `journalctl -b | grep "ordering cycle"` **as
  root**, `systemctl show ai-dashboard -p UnitFileState`, and a comparison of the running
  container against the unit's `docker run` line.
- **ufw.** 11-A8 was measured against the function's own `awk` program with fabricated
  `ufw status` output, which is the parser and not ufw. I did not confirm ufw's exit status
  when deleting a non-existent rule (11-A10 gives both branches).
- **`--read-only` at runtime.** Next 16's standalone server may attempt to create
  `.next/cache` for a fetch cache; with a read-only root and only `/tmp` as tmpfs, whether that
  is a warning or a failure is unknown here. Worth one look during step 12.
- **The box's own state.** Everything about ai-server in 11-A9 comes from root `CLAUDE.md`
  (ufw `ENABLED=no`, no rule for 8090 yet). I did not touch the box.
- **`pnpm verify` under mutation** was run in full **once** (X30). The other 62 were measured
  against `packaging.test.ts` alone, which is sound because it is the only file that reads
  these four artefacts — verified by grep, not assumed.
