# Step 11 — TEST: packaging

**Written 2026-09-10.** Branch `dashboard-frontend`, step 11 still uncommitted on `3f152b0`.
Nothing committed, nothing staged, `SPEC.md` / `MOCK.html` / `INSTALL-SPEC.md` untouched.

`pnpm verify` **exit 0 — 102 files, 3092 tests** (was 102 / 3085: this phase adds 7 tests).
Run **twice**, identical both times, because `realHash()` is random.
`shellcheck dashboard.sh` **clean** at 0.11.0.
`python3 pipeline/steps/11-packaging/regressions.py` **exit 0 — 52 mutations, all bit,
31 of 31 ⚠ tests reddened, zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`** (was 37 / 24).

⚠ **There is no Docker on this Mac** (`command -v docker` is empty). Nothing below is a claim
about a built image or a running container; every image statement is about the build context,
`.next/standalone`, or the Dockerfile's own `COPY` lines, and says which.

**The headline.** The build's instrument — sourcing `dashboard.sh` and comparing its verdicts
with the TypeScript over fixture tables — is real and it works. But it measured the
**validators** and nothing measured the **rows that call them**, and that gap was wide enough
to drive every one of the four obligations through. Measured, not argued: **eight ways to
break the shell half with all 24 tests still green**, listed in §1. Seven new ⚠ tests and
fifteen new mutations close them.

---

## 1. Priority 1 — the four obligations, and the instrument that holds them

### 1.1 ⚠ THE FINDING — the shell half could be broken eight ways with the table still green

Each row is one edit to `dashboard.sh`, applied to the tree as built, with
`pnpm vitest run packaging.test.ts` run against it:

| # | the edit | what it costs on the box | verdict |
|---|---|---|---|
| 1 | `HASH_SALT_RE` keeps `{22}` and drops `[AQgw]` | `check` approves a salt spelled a way the server refuses | **24 passed** |
| 2 | `check_session_secret` stops calling `env_value_error` | O21's row goes blind — quoted secret passes | **24 passed** |
| 3 | `check_password_hash` stops calling `scrypt_hash_error` | O20's row goes blind — argon2id passes | **24 passed** |
| 4 | `env_set` stops refusing a bad value | the script itself writes a quoted secret | **24 passed** |
| 5 | `check_standing` stops calling `standing_entry_error` | D8's row goes blind — a typo passes | **24 passed** |
| 6 | the "line with no `=`" row is deleted | Docker's inherit-from-host case unnoticed | **24 passed** |
| 7 | `HASH_P_MAX` 16 → 99 | a `p` the server refuses is approved | **24 passed** |
| 8 | `HASH_R_MIN` 1 → 0 | an `r` the server refuses is approved | **24 passed** |

Two different defects are in that table and they need different fixes.

**Rows 2–6 are the important one: `validate()` measures a validator, and a row is where the
wiring comes undone.** `check` is the only place on the box where O20, O21, O22 or D8 can be
noticed at all — so a row that stopped asking is the same silence, one level up, and the file
whose whole subject is silent failure had no assertion that any row asks anything. Closed by a
second harness in `packaging.test.ts`, `checkRow(fn, envFileBody)`: it sources the script,
points `ENV_FILE` at a fixture, runs the row and returns its output **and** its `CHECK_FAIL`
count. Five ⚠ tests, five mutations `11-R1`…`11-R5`, all five now red.

**Rows 1, 7 and 8 are fixture symmetry (HANDOVER §5.1), and row 1 is worth reading twice.**
The build's own comment names the trailing character class as *"the part that is easy to get
wrong and impossible to notice"*, and the fixture written for it does not exercise it:

```
'A'.repeat(21) + 'Ag'   is 23 characters — refused for its LENGTH by both sides
'A'.repeat(21) + 'B'    is 22 characters — refused only by the trailing class
```

The **key** side had the right shape (`'A'.repeat(42) + 'B'`, 43 characters). The **salt** side
had a length fixture wearing a canonicality label, so `HASH_SALT_RE` could be reduced to
`{22}$` — the exact defect the comment describes — with everything green. Fixed: the
22-character spelling is now a fixture, the 23-character one is relabelled as what it is, and
`11-H9` proves the difference. `r`'s floor and `p`'s two bounds had no fixture on the far side
at all; `scrypt.15.0.1.…`, `scrypt.15.8.0.…` and `scrypt.15.8.17.…` are now in the table, with
`11-H10` and `11-H11`.

### 1.2 ⚠ THE OTHER FINDING — `awk -v` made this judge LOOSER than the browser

`condition_rule` looked the kind up with `awk -v k="$1"`. **`-v` processes escape sequences in
the value it is handed**, so:

```
STANDING=gpu_te\mp     →  awk sees `gpu_temp`  →  dashboard.sh: ACCEPTED
                       →  standingIdsFrom:      unknown
```

Measured with BSD awk on this Mac; POSIX leaves an *undefined* escape undefined, so gawk and
mawk are free to differ from each other as well — which is its own reason not to route a
user-typed string through it. The direction is what matters: `packaging.test.ts` carries a test
named *"a non-breaking space makes bash stricter than the browser, **never looser**"*, and a
single backslash falsified the second half of that name. `check`'s one job in D8 is to notice a
mistyped id; here it certified one.

Fixed by reading the kind out of `ENVIRON`, which is byte-exact everywhere. `gpu_te\mp` and
`gpu_temp\` are now fixtures in the equality table, and `11-S7` puts `-v` back. ⚠ `11-S7` bites
exactly where the defect is real: an awk that kept `\m` verbatim would make the mutation inert
and would also not have the bug.

### 1.3 Are the fixtures reachable, and what did the table still omit?

Reachable: yes. Every O20 fixture is something an operator can paste into
`/etc/ai-dashboard.env` (`realHash()` is the project's own producer run for real); every O21
fixture is a value `configure`, `set-password` or a hand edit can produce; every D8 fixture is
something typeable. Nothing in the tables is unreachable, and nothing reachable that I could
construct was missing except the following, all of which I measured rather than reasoned
about:

| input | what happens | verdict |
|---|---|---|
| value with a **trailing space** | `check` FAILS the row (`has trailing whitespace`) — while `readAuthConfig` **trims**, so the server would have worked | **stricter than the server, the safe direction.** Kept |
| **CRLF** file | `read -r` leaves the `\r` on the value → *"contains a line break"*. Docker's own reader drops a terminal `\r` (`bufio.ScanLines`), so this too is stricter than the runtime | Kept |
| **UTF-8 BOM** on line 1 | the key is `﻿PASSWORD_HASH` → *"is not a usable environment-variable name"*, **and** the O20 row then says `PASSWORD_HASH is absent`. Two loud rows | Correct |
| **no trailing newline** | last line still read (`|| [[ -n "$line" ]]`) | Correct |
| hash with a **trailing newline** | cannot exist — one line per key, and `$( )` strips it | n/a |
| `STANDING` with an **unknown id** | `'gpu_fan_speed' matches no condition kind` | Correct |
| value containing a **backtick** | **was accepted.** The stated reason for refusing `$` is *"a shell that ever sourced this file would expand it"* — a backtick is the same hazard and a shell **executes** it | **FIXED** — refused, fixtured, `11-E4` |
| `STANDING` entry containing `*` | not glob-expanded (read line by line, quoted) — as the build claims | Correct |

---

## 2. Priority 2 — O21: proving `check` fails on a value that WORKS

The build proved `readAuthConfig` accepts `SESSION_SECRET="…32 a's…"` and that
`env_value_error` refuses it. It did not prove that anything on the box ever *asks*
`env_value_error` about it — finding 1.1 row 2. Now measured, in
`⚠ the O21 row FAILS on the quoted secret readAuthConfig cannot see, and on padding`:

| env file | `check_session_secret` |
|---|---|
| `SESSION_SECRET="<64 hex>"` | **FAILS**, *"contains a double quote. --env-file does not strip quotes"* |
| `SESSION_SECRET=<64 hex><space>` | **FAILS**, *"has trailing whitespace, which Docker keeps"* |
| `SESSION_SECRET= <64 hex>` | **FAILS**, *"has leading whitespace"* |
| `SESSION_SECRET=tooshort` | **FAILS**, below the 32-character floor |
| `SESSION_SECRET=<64 hex>` | **0 rows failed** |

And `check_env_file` reaches the same verdict over **every** line, which is the row that
catches a quoted `PASSWORD_HASH` or a quoted `STANDING` as well.

**`configure` cannot write one**, and that is now two properties rather than one:

- `env_set` **dies before the file is created** on a quoted value (asserted: exit non-zero,
  message `refusing to write SESSION_SECRET`, `existsSync(file) === false`);
- ⚠ the refusal is **before** the `--dry-run` early return, so a dry run cannot print
  `would write` for a value the real run would refuse. A review surface that promises a write
  that cannot happen is the same defect as a tick over one that did not.

`11-R1` and `11-R5` redden these. The value itself is never printed — the dry run says
`would write SESSION_SECRET=<64 characters, not printed>` and the test asserts the 64
characters are **not** in the output.

⚠ **One cosmetic imprecision, left alone deliberately.** `check_session_secret`'s explanatory
lines after a failure always talk about *quotes*, even when the primary message was
*"has trailing whitespace"*. The first line — the one that names the defect — is always
correct; the prose under it is the general O21 warning. Changing it is churn on a review
surface that is otherwise right, and it is recorded here rather than edited.

---

## 3. Priority 3 — O22: three mechanisms, attacked one at a time

| attack | result |
|---|---|
| **two `docker run`s, different `--name`s, same image** | `--name` does not stop it. `--network host` on a fixed 8090 does: the second `next-server` cannot bind and the container exits. `check` also sees it (below) |
| **a second instance on a DIFFERENT port** (`-e PORT=8091`) | binds fine, and is a full second instance: a second `TelemetrySource`, a second `productionRevocations`, a second `productionRateLimiter`. Neither the name nor the listener count sees it |
| **…started from an OLDER tag** (`ai-dashboard:notag-20260901`) | ⚠ **`--filter ancestor=ai-dashboard:latest` resolves that reference to ONE image id**, so a container from a previous build's tag was invisible to all three of `check`'s counts. **FIXED** |
| **the unit started while a manual container is up** | `ExecStartPre=-/usr/bin/docker rm -f ai-dashboard` removes it; the unit wins, which is the right direction |
| **`docker rm -f` racing a live unit** | the `docker run` client exits non-zero → `Restart=on-failure` → `ExecStartPre` cleans up → one container. The `-` prefixes are what stop a clean start being turned into a failure |
| **restart racing `ExecStopPost`** | both cleanups are `-`-prefixed `rm -f`; a doubled removal is a no-op, and `--rm` not firing (a killed *client*) is exactly what `ExecStopPost` covers |

**What `check` actually counts**, verified against the code rather than the build's prose:
containers named `^ai-dashboard$` (`docker ps --filter name=`, must be 1) · other containers
running this app (was `ancestor=…:latest`; **now every tag of the repository, plus the ancestor
question, unioned**) · processes inside it (`docker top … | tail -n +2 | wc -l`, must be 1) ·
listeners on 8090 (`ss -H -ltn`, must be 1).

The fix is a pure function so it can be tested on a machine with no Docker:
`other_app_containers` reads `docker ps --format '{{.Names}} {{.Image}}'` on **stdin** and
prints the names that are this app and are not ours. Fixtures cover `ai-dashboard:latest`
(ours), an older tag, an implicit-latest bare reference, a same-named image from another
registry (not ours), and an unrelated image. `11-O1` narrows it back to `:latest` and the test
goes red.

⚠ **Still invisible, and named rather than implied**: an instance built under a *different
repository name*, and anything not run under Docker at all. `docker ps` cannot be asked about
either by name. **Step 12 owns the box-side verification** — `ss -ltnp` across all ports and
`docker ps -a` by hand, once, on the real deployment.

---

## 4. Priority 4 — the unit, and what only a boot can decide

**Trap 1 is verified three ways and one of them is not text.** `packaging.test.ts` parses the
file into sections and asserts the directive's section is `Unit` (a `toContain` would pass with
it in `[Service]`); `cmd_unit` runs `systemctl show … -p StartLimitIntervalUSec` after
installing and **dies** if it is not `5min`; `check` repeats the row. `11-U1` moves both keys
to `[Service]` and the test goes red. That is the repo's rule kept properly: writing the config
is not evidence it took.

**Trap 2: no `Wants=`/`After=` in this tree can re-create the cycle.** The unit's complete
ordering surface is `Wants=docker.service`, `After=docker.service sysinit.target`,
`WantedBy=multi-user.target` — asserted by **equality**, not by absence, so a third target
added later fails the test. Nothing else in the repo names `ai-dashboard.service` in a `Wants=`
or `After=` (grepped), and `dashboard.sh` writes no drop-in and no second unit. `docker.service`
on Ubuntu is not `After=multi-user.target`, so the `docker.service` edge introduces no path
back to the target either.

⚠ **Trap 3 cannot be exercised here and is not claimed to be.** An ordering cycle exists only
while the target is doing the starting; `systemctl restart` can never reproduce it. What this
step leaves for step 12, and where it is written down:

| left to step 12 | written in |
|---|---|
| `journalctl -b \| grep "ordering cycle"` **after a real reboot** | `PLAN.md` row 12 ("no ordering cycle; survives a reboot"), build.md §3 and §10 |
| `systemctl show ai-dashboard -p StartLimitIntervalUSec` on the box | build.md §10 ("implemented and unexercised") |
| one container, one process, one listener, on the real deployment | build.md §10, and §3 above for what `docker ps` structurally cannot answer |

All three are implemented in `dashboard.sh` (`check_unit`, `report_ordering_cycles`,
`check_one_process`) and all three are unexercised against systemd. That is correctly recorded;
no change needed beyond §3's widening.

---

## 5. Priority 5 — `--dry-run` on thirteen subcommands

**Writes nothing.** All thirteen run with `--dry-run` against an `ENV_FILE`, `UNIT_PATH` and
`BACKUP_DIR` pointed at an empty scratch directory: the directory is **still empty
afterwards**, and `/etc/ai-dashboard.env` and `/etc/systemd/system/ai-dashboard.service` still
do not exist. `install --dry-run` is 191 lines.

**⚠ The subcommand list in the test was twelve, not thirteen — `install` was missing**, and
`install` is precisely the one whose dry run has to be a complete account. Fixed: the array is
thirteen, is asserted to be thirteen, and every entry is now also asserted to appear in
`usage()`'s own list, so the two cannot drift apart silently.

**Intent versus execution.** Every command routed through `run()` is the same string in both
modes by construction. The risk is the *hand-written* `would …` lines, which are a second
spelling of a command written elsewhere. Diffing each against its real branch found three
divergences, all fixed:

| | printed | actually run |
|---|---|---|
| `deps` | `gpg --dearmor` | `gpg --batch --yes --dearmor` — i.e. **overwrites an existing keyring without asking**, which the review surface did not say |
| `deps` | nothing | a timestamped backup of an existing `.sources` into `/root`, and a `chmod 0644` on the keyring |
| `configure` / `set-password` | nothing | ⚠ **a timestamped 0600 copy of the credentials file into `/root`** |

The third is the one that matters. `backup_env` has its own dry-run branch — and it was
**unreachable**, because `env_set` returned on `(( DRY ))` *before* calling it. INSTALL-SPEC §6
requires that backup and §1 requires the dry run to be a complete account of the real run; a
write into `/root` went unmentioned on the surface an operator reads before handing a script
root. `backup_env` now runs before the dry-run return (it is itself dry-aware), and
`configure`'s `SESSION_SECRET` branch — the one branch that rewrites a live credentials file —
now goes **through `env_set`** with a placeholder of the right length instead of printing one
sentence and skipping the writer. A dry run against an existing env file now prints:

```
· would generate 32 random bytes as 64 hex characters and write SESSION_SECRET
· would copy /etc/ai-dashboard.env -> /root/ai-dashboard.env.bak.<ts> (mode 0600)
· would write SESSION_SECRET=<64 characters, not printed> to /etc/ai-dashboard.env (0600 root:root)
```

`11-N3` reddens the new test. ⚠ **Residual, recorded not fixed:** `cmd_deps` still holds two
spellings of four commands (the `if (( DRY ))` block and the real block), and nothing but
reading holds them equal. Every other subcommand's intent comes from `run()` and cannot drift.

---

## 6. Priority 6 — what lands in the image

⚠ **No Docker on this Mac. Nothing here is a claim about a built image.** Precisely what was
checked, and how:

**The build context, re-derived independently.** Not by reading `.dockerignore` — by
implementing moby's `patternmatcher` (`**` → `((.*/)|([^/]*))`, `*` not crossing `/`,
root-relative, parent-directory pruning) and walking the tree with it. Result: **130 files,
1215 KiB**, matching build.md's 130 / 1216 exactly (the KiB differ by truncation-vs-rounding).
Top level is `.node-version .nvmrc next-env.d.ts next.config.mjs package.json pnpm-lock.yaml
proxy.ts tsconfig.json`; directories are `app components lib`; and the context contains **zero**
`*.test.*`, zero files under `pipeline/` or `scripts/`, zero `.md` files at all (so no
`SPEC.md`, no `README.md`), no `MOCK.html`, and nothing matching `env|secret|key|password`
except `lib/client/env.ts`, `lib/client/fake-env.ts` and `next-env.d.ts` — three ordinary
modules, none carrying a credential.

**⚠ The precise statement about the image, which is not the same statement.** The runtime stage
has exactly two `COPY` lines, both `--from=build`: `/app/.next/standalone` and
`/app/.next/static`. So the finished image is `node:24-slim` plus those two trees, and
`SPEC.md`, `MOCK.html`, `pipeline/` and the test files could not reach it *even if*
`.dockerignore` let them in — they would sit in the discarded build stage. `.dockerignore`'s
real jobs here are the daemon upload, the build cache on the box, and making `next build`'s
type-check cover exactly the code that ships. (The `.dockerignore` header says *"every ADD/COPY
layer is readable in the finished image"*, which is true of a single-stage build and overstated
for this one. Recorded, not edited — the conclusion it draws is right.)

**`.next/standalone`, measured on this tree**: 39 MB, `.next/static` 688 KB, `node_modules/.pnpm`
holds **14** entries, `find -name '*.test.*'` is empty, no `.md` and no `SPEC*` anywhere in it.

**⚠ The honest jsdom/playwright statement, in 10c-3's terms, re-measured — and the count
depends on which string you grep for, which is the whole lesson.** There is no package
directory for `jsdom`, `playwright-core` or `vitest` anywhere in the standalone tree. The
strings:

| grep | files in `.next/standalone` |
|---|---|
| `jsdom` | 2 — `package.json`, `next/dist/lib/server-external-packages.jsonc` |
| `playwright-core` | 2 — the same two |
| `playwright` | **4** — those two, plus `next/dist/cli/next-test.js` **and `next`'s own `package.json`** |

build.md names three files; on this tree it is two or four depending on the string, and the
fourth (`next/package.json`) is not in its list. Immaterial to the conclusion and corrected for
precision — the conclusion stands: no package directory, no code, and
`.next/standalone/package.json` is **byte-identical to ours, `devDependencies` and all**
(`diff` confirms). Nothing installs from that manifest, but *"the string is absent from the
image"* would be false.

`sharp` **is** traced in by Next's own tracing and is ~30 MB of the 39; on the box it will be
`@img/sharp-linux-x64` rather than this Mac's `-darwin-arm64`, which is §2.3's whole reason for
building there.

**Not verifiable here, and left for step 12:** that `docker build` succeeds, that the image runs,
and that `pnpm install --frozen-lockfile` resolves the linux/x64 variants.

---

## 7. Priority 7 — names against bodies

**24 ⚠ tests read against their own bodies; 31 now.** Findings:

**⚠ A twelfth instance of §0.4's shape, and it was measured, not spotted.**
`--shell /usr/sbin/nologin` appears **twice** in the Dockerfile — once in the `useradd` and once
in the comment explaining why it is there — and `expect(DOCKERFILE).toContain(...)` cannot tell
them apart. Deleting it from the `useradd` line left **all 31 tests green**: §2.5's *"no shell"*
half was certified by prose. The unit already had `unitCode()` for exactly this; the Dockerfile
did not. Fixed with `dockerfileCode()` (same comment-stripping shape), applied to all ten
Dockerfile assertions, with `11-D5` as the proof.

**`⚠ no rejection message repeats the hash it was handed`** checked one of the two message paths
(the key's). The salt has its own line and its own `${#salt}`; the body now checks both, and
`11-H12` covers the salt path the way `11-H8` covers the key's.

**`toContain` census: 60 total, 22 against a whole document.** Of the 22, the Dockerfile's ten
now read comment-stripped source, and the unit's seven already did (`unitCode()`). The five
against `DASHBOARD_SH` were each checked by hand for a comment that could answer for code:
`CONDITION_KIND_RULES` occurs once, inside a `die` message — real code, though the assertion
that carries the weight in that test is the `sed` pattern beside it; the other four
(`systemctl show …`, `IFS= read -rs PW1`, `printf '%s' "$PW1" | python3`, and the two negative
matches) occur only as code. No further comment-satisfied assertion exists in this file today.

**Entropy and timers.** No timers, no `Date`, no `Math.random`. The one random input is
`realHash()`, whose salt and key vary per run — and both judges accept every canonical
spelling, so the fixture cannot flake. `pnpm verify` was run **twice** anyway (HANDOVER §1's
rule for a suite that asserts anything random): 3092 passed both times.

**⚠ Matchable prefixes.** All 31 names are ≥ 12 characters and the harness's `UNMATCHABLE` list
is empty. One new name was **renamed before it shipped**: it contained an escaped apostrophe
(`producer\'s`), and the ledger reads the name from the *source* and matches it against
vitest's FAIL line, where `\'` has become `'` — the mark would have scored uncovered for a
reason unrelated to any mutation. Worth knowing generally: **no `\'` in a ⚠ test name.**

---

## 8. Priority 8 — the eleven spec silences

`S1` (INSTALL-SPEC §9's O20 row) and `S7` (`--gpus all` unconditional) are already flagged for
the owner and are **not** re-litigated here. The other nine, each judged as *a real silence* or
*a choice the builder made and then labelled*:

| # | verdict |
|---|---|
| **S2** | ⚠ **Real, and independently confirmed.** INSTALL-SPEC §7 says *"the ten `-v … :ro` mounts"* and then enumerates eight. I counted SPEC §2.2 myself: **eight** `-v` clauses (`/sys`, `/`, `/home`, the D-Bus socket, `/etc/llama-server`, `/etc/ufw/ufw.conf`, `/lib/modules`, `/etc/hostname`). The unit has exactly 8, all `:ro`, asserted by count. The spec's prose is wrong; the list is right |
| **S3** | Real silence, resolved the only way it can be. §1 lists nine subcommands, §0 names four more as refusable install *steps*. Thirteen, with `install` calling the same functions in §0's order — one implementation each. Now also asserted to be thirteen |
| **S4** | Real silence (§12.4 is still open), and the choice is the repo's own hard-won one: `$HOME` is not stable across `sudo`. `SRC=$(dirname "$0")` resolves to `~/ai-dashboard-src` in the documented flow and to something true in every other. If §12.4 answers `/opt/…`, nothing changes |
| **S5** | Real silence. INSTALL-SPEC §9 says `check` exits non-zero on a failed row and says nothing about a row that *could not be evaluated*. Exit **2** is right and is the ufw lesson applied. ⚠ Consequence worth naming: `install` treats any non-zero `check` as failure, so an unevaluable row fails an install — but `install` runs as root and reaches no unknown row, so this is theory, not a live hazard |
| **S6** | ⚠ **Real, and the more dangerous half is the one the spec does not mention at all.** Docker skips comments and blanks (so the header `configure` writes is legal), and a line with **no `=`** is not an error — it means *take this variable from the host environment*, which is empty, and denies every login with nothing logged. `check` refuses it, and that row now has a test and `11-R4` |
| **S8** | Not a silence — the spec specifies `max-size=10m max-file=3` and asks whether it is redundant. Built as specified. Owner's call, no cost either way |
| **S9** | Not a silence — a deploy-time confirmation, correctly flagged, and `--lan-cidr` overrides it. ⚠ The box's address has drifted once already (root `CLAUDE.md`); `192.168.4.0/22` still covers both `.31` and `.71` |
| **S10** | ⚠ **Real conflict, correctly left alone.** HANDOVER §9 asks for a pointer in the root `CLAUDE.md`; ANCHOR §9 says *"nothing outside `dashboard/` should change, except the root `.gitignore`"*. I confirmed both texts. It is a two-line edit for whoever owns that file, and this phase did not make it either |
| **S11** | Not a silence — the spec quotes neither form. A literal `…/stable/deb/amd64` is right because preflight hard-refuses anything but x86_64, and `$(ARCH)` would only matter on a machine the script refuses to run on |

---

## 9. What changed in this phase

| file | change |
|---|---|
| `dashboard.sh` | 1566 → 1630 lines. `condition_rule` reads the kind from `ENVIRON` (§1.2) · `env_set` backs up **before** the dry-run return (§5) · `configure`'s `SESSION_SECRET` branch goes through `env_set` under `--dry-run` (§5) · `deps`'s dry-run text is the commands it actually runs (§5) · `other_app_containers`, and `check_one_process` asks by repository **and** by ancestor (§3) · `env_value_error` refuses a backtick (§1.3) |
| `packaging.test.ts` | 593 → 858 lines, 24 → 31 ⚠ tests. `checkRow` and `sourced` harnesses · six new tests for `check`'s rows, `env_set`'s refusal and O22's counting · one new test for the dry run's backup announcement · `dockerfileCode()` · fixtures for the salt's canonical tail, `r`/`p` bounds, a backslash in `STANDING`, and a backtick · `install` added to the dry-run sweep · the source-guard now sees `${ENV_FILE}` |
| `pipeline/steps/11-packaging/regressions.py` | 592 → 675 lines, 37 → **52** mutations. New: `11-H9`…`11-H12`, `11-S7`, `11-R1`…`11-R5`, `11-O1`, `11-N3`, `11-C3`, `11-D5`, `11-E4` |

Nothing else was touched. `Dockerfile`, `.dockerignore`, `systemd/ai-dashboard.service`,
`README.md` and every file outside step 11 are byte-for-byte as the build left them;
`next-env.d.ts` is byte-identical (md5 checked before and after `pnpm verify`).

## 10. Left open

- ⚠ **Step 12 owns every box-side verification**, and three of them can be done nowhere else:
  the ordering cycle after a **real boot**, `StartLimitIntervalUSec` from systemd itself, and
  one container / one process / one listener on the real deployment.
- ⚠ **`check`'s env-file mode row uses `stat -c`, which is GNU.** On the box that is correct.
  On a BSD `stat` it silently produces an empty mode and the row **FAILS** rather than
  reporting *unknown* — the wrong one of `check`'s three states for "could not evaluate".
  It cannot bite on Ubuntu; recorded because the tests run on macOS and a future reader will
  see that row red there.
- **`cmd_deps` keeps two spellings of four commands** (§5). They agree today.
- **O22 cannot see an instance under a different repository name, or one not run by Docker**
  (§3). Named in the script's own comment now.
- The two items already before the owner are unchanged: INSTALL-SPEC §9's O20 row (`S1`) and
  `--gpus all` being unconditional (`S7`).
