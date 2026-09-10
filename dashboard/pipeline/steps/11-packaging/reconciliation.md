# Step 11 — packaging (RECONCILIATION). **The two structural causes are fixed, not the 49 instances: `cmd_check`'s call graph is now asserted, and every guard is measured REFUSING. The `--gpus all` fallback is built, and its mode is read off the container.**

**Written 2026-09-10 by the reconcile phase.** Nothing committed, nothing staged. `SPEC.md`,
`MOCK.html` and `INSTALL-SPEC.md` untouched. **No guard weakened** — every change below either
adds a refusal, adds a row, or moves a refusal EARLIER. There is **no Docker and no systemd on
this Mac**: every statement about a built image, a running container or a real boot is labelled
*reasoned, not run*, and the things step 12 must confirm on the box are listed in §7.

---

## 0. The headline, before the table

| | |
|---|---|
| **the adversarial's own sweep, re-run by this phase** | **48 of 48 now CAUGHT · 0 survived** (was: 49 of 63 survived, 48 of them enumerated). Applied to this tree one at a time, `pnpm vitest run packaging.test.ts` run against each, the file restored and the restore asserted byte-for-byte. §2 |
| `pnpm verify` (cold) | **exit 0 — 102 files, 3121 tests, no type errors** (3092 inherited; **+29**). ⚠ **Run twice, identical both times**, because `realHash()` is random and several new tests spawn real `bash` processes |
| `python3 pipeline/steps/11-packaging/regressions.py` | **exit 0 — 130 mutations, all bit** (52 inherited; **+78**), zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, **60 distinct failing tests across the 130, and 60 of 60 ⚠-marked tests reddened** |
| the nine other harnesses | **not run and not needed** — nothing under `lib/`, `app/` or `components/` was touched. `git status` in §8 is the evidence |
| `shellcheck dashboard.sh` | **clean**, 0.11.0 |
| the two mechanisms | a **call-graph assertion** over `cmd_check` (source-text AND behavioural), and a **guard-refusal table** covering every `check` row, every preflight refusal and every subcommand-level guard — 38 + 12 + 14 cases, each with its bad input and its good one |
| `--gpus all` | **BUILT** per INSTALL-SPEC §11.1, honouring all four of 11-A14's traps. Mode read from `docker inspect .HostConfig.DeviceRequests`, never from the unit text and never from `gpus: null`, with a **three-state** `check` row and a **re-probe** so a fallback cannot outlive its cause |
| the tree | nothing committed, nothing staged, no `.env`, `next-env.d.ts` byte-identical, no stranded mutation |

**The sentence this loop earned, and it is §0.13 of HANDOVER:** *a cross-check is only worth the
call site it is wired into, and a guard is only worth an assertion that it REFUSES.*

---

## 1. The adjudication — all eighteen findings

| # | Verdict | What was done |
|---|---|---|
| **11-A1** — 49 of 63 one-line edits keep the suite green | ⚠⚠ **ACCEPTED — the priority of the list, and closed at the CAUSE.** Two mechanisms, not 49 patches | **(a) Nothing asserted WHICH functions `cmd_check` calls.** It now has two assertions: a **source-text** one reading `cmd_check`'s body and requiring the calls to equal an eleven-name list *in order and with nothing else*, and a **behavioural** one that stubs all eleven rows and runs `cmd_check` once per row — silent everywhere gives exit 0, `row_fail` in exactly one gives exit 1. The second can only pass if the function is really called, so one table proves the call graph AND the `CHECK_FAIL > 0 → return 1` contract for every row. **(b) Nothing asserted THAT A GUARD REFUSES.** Three tables now do: 38 `check`-row cases (each guard's own bad input, and a healthy box), 12 preflight cases (**one** flipped input at a time, requiring **exactly one** refusal), and 14 subcommand-level cases (`restart`, `start`, `unit`, `install`, `configure`, `set-password`, `env_set`, `env_get`, `report_ordering_cycles`, `load_condition_rules`). **Measured: 48 of 48 re-aimed edits now fail the suite.** §2 |
| **11-A2** — D8's judge is LOOSER than the browser for twelve Unicode spaces | ⚠ **ACCEPTED — fixed, and the fix is not a copy of `.trim()`** | Under `LC_ALL=C` these are multi-byte sequences and a byte-wise strip could split one, so `standing_entry_error` **refuses any entry containing one of the twelve** (U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF) with a message naming the cause. That is ≥ as strict as the browser on every input: where JavaScript trims and accepts, this raises a visible false alarm; where JavaScript reports unknown, the two agree. The test that carried the false half of its own name now runs **all twelve characters in four positions each** against `standingIdsFrom` and asserts the set of "bash accepts, browser does not" rows is **empty**. U+200B is confirmed outside the set and left alone. `11-W1` |
| **11-A3** — `build` skips a rebuild with a green tick, `restart` then proves the container changed, `check` passes on old code | ⚠ **ACCEPTED — fixed on both sides, and the second side is a new `check` row** | (a) `build` no longer treats "already present" as "already correct" for a tag that names a **day**: with no `--tag` the tag is `notag-<UTC date>`, every build of one day collides, and it now **rebuilds**. With an explicit `--tag` — a sha, which does identify contents — it skips, but with `warn` rather than `ok`, printing the existing image's id and creation time and saying in full that nothing compared it with `$SRC`. (b) **`check_container` compares the RUNNING container's image id with `ai-dashboard:latest`'s** and FAILS when they differ — a detector that did not exist anywhere, and one `status` cannot substitute for, because `docker ps --format {{.Image}}` prints the *reference*. ⚠ **Stated precisely, because the two halves catch different things:** the row catches *a rebuild that was never restarted into* (`:latest` moved, the container did not) — which is 11-A4's shape. It does **NOT** catch a skipped build, because a skip leaves `:latest` where it was and the container then matches it exactly. **A3's own two entrances are closed at the source instead**: the `notag-<date>` one rebuilds, and the re-used-`--tag` one still skips — deliberately, since a sha identifies its contents — but now with `warn`, the existing image's creation time, and the sentence *"nothing here compares that image with $SRC"*. **Residual, named rather than papered over: re-using an explicit `--tag` after an edit still ships the old image, loudly, and `--force` is the answer.** `11-G17`, and the README now explains the `notag-` rule |
| **11-A4** — a changed unit is installed, ticked, and not in force | ⚠ **ACCEPTED IN PART — the detectable half is built; the flag-by-flag diff is DEFERRED with a named owner** | Built: the image-id row above, the GPU-mode row below, and the two missing warnings — `unit` now says *"a container is already running: it keeps the flags it was CREATED with"* when one is, and `configure` prints the same sentence `set-password` already printed. **Not built:** a full comparison of `docker inspect .Config`/`.HostConfig` against the unit's own `docker run` line. It needs Docker to write against and a stable normalisation of every flag; the two flags whose drift actually costs something (the image and the GPU device request) are covered exactly. Recorded as `11-Q3` for the owner and as a step-12 verification |
| **11-A5** — a non-root `check` reports the credentials ABSENT on a healthy box | ⚠ **ACCEPTED — fixed, and it was the inverse of exit 2's whole argument** | `env_readable()` is one function, `env_unreadable_row` is one line, and `check_password_hash`, `check_session_secret` and `check_standing` each ask it first: an unreadable file is now **`row_unknown`** — *"this is NOT 'it is absent'"* — so a correct deployment checked without `sudo` exits **2**, which the script's own header says means *re-run it with sudo*. It used to print three specific, alarming, wrong FAILED rows and exit 1, whose most likely next action is `sudo ./dashboard.sh set-password` — overwriting a working password. Three rows of the guard table, `11-G18` |
| **11-A6** — `check` prints a whole 64-hex line with an ellipsis implying it did not | ⚠ **ACCEPTED — fixed** | The row prints the **line number and the character count**, never the line: `line 2 has no '=' (64 characters, not printed)`. `${line%%[!A-Za-z0-9_]*}` removed nothing from 64 characters of `[0-9a-f]`, which is `configure`'s own deliberate alphabet, so the whole secret reached the terminal followed by a `…` that made it look truncated. A line number is what finds the line anyway. The test asserts the hex is absent from the output — both the whole string and its first half. `11-G19` |
| **11-A7** — `set-password --dry-run` still hides the backup into `/root` | ⚠ **ACCEPTED — fixed, the second of the two callers** | `cmd_set_password` returns before `env_set`, so `backup_env`'s dry-aware branch was unreachable from the one subcommand that rewrites a live credentials file **every** time it runs. It now calls `backup_env` in its dry branch, and its announcement is `env_set`'s spelling (`<the hash, not printed>`) rather than a second one. `11-M13` |
| **11-A8** — `ufw_rule_for_port` cannot see three legal spellings, and the HARD REFUSAL fires on them | ⚠ **ACCEPTED as a LATENT hazard — fixed — and the finding's headline claim is NARROWED with the refuting line** | ⚠ **The claim "blocks every root subcommand on a correctly firewalled box" does not hold for THIS box.** Its documented rule is `ufw allow from 192.168.4.0/22 to any port 22 proto tcp`, which `ufw status` renders as `22/tcp  ALLOW  192.168.4.0/22` — `$1` **is** the port and the old matcher **did** find it (adversarial's own first table row: ✓). The real blind spot is a **destination-qualified** rule (`to <ip> port 22`, which puts the address in `$1`) and a **blanket** `ufw allow from LAN`; this box uses neither today, so the refusal was never live here. Fixed anyway, because it is one `ufw` command away from becoming live: the matcher now scans **every field before the ACTION column**, handles `[ N]` and `[N]` numbering, and accepts `Anywhere` — which is what ufw prints when a rule names no destination port, so accepting it is ufw's semantics rather than laxity. ⚠ `Anywhere (v6)` is **not** accepted: an IPv6 blanket does not keep an IPv4 SSH session alive. Eleven-row table test, `11-F1`/`11-F2`/`11-F3` |
| **11-A9** — `install` dies at step 6 of 8 with the unit enabled and nothing running | ⚠ **ACCEPTED — fixed by moving the refusal to where it was already known** | `preflight` takes a **fourth argument** — *this run reaches the firewall step* — and `install` and `firewall` pass 1. A non-enforcing ufw is then refused at **step 0**, before docker is installed and restarted, before the image is built, before the password is written and before the unit is enabled. The two judgements of one condition, 380 lines apart, now agree, and INSTALL-SPEC §8's *"the script says so and stops"* is honoured at a point where stopping costs nothing. The closing line's count is fixed too: it said *"5 preflight refusal(s)"* for three preflight refusals plus `firewall`'s and `start`'s. ⚠ **Consequence for step 12, stated plainly: `install` will now refuse on ai-server until `sudo ufw enable` has been run** — which is the state root `CLAUDE.md` records as outstanding, and which it would have failed at anyway, seven steps later. `11-Q6`, and the "does not reach the firewall step" half has its own test |
| **11-A10** — `uninstall` leaves a rule, a container and every `/root` copy of the secrets | ⚠ **ACCEPTED — all three fixed** | (1) The ufw delete's **exit status is read** (it was unchecked, and a non-zero from `Could not delete non-existent rule` would have aborted the uninstall under `set -e` before the env-file and image steps), and the rule is **re-read afterwards** rather than assumed gone, with the `--lan-cidr`-is-not-persisted hazard named in the warning. (2) Containers running an `ai-dashboard` image **under another name are listed by name** with the `docker rm -f` line to remove them — reported, not removed, because killing a container this script did not create is not its call. (3) **`--purge` now purges the backups**: it enumerates `/root/ai-dashboard.env.bak.*`, prints them, counts them in the confirmation text, and removes them with the file under the same typed `DELETE`. They carry the same offline-attackable hash and the same session-forging secret |
| **11-A11** — the ordering-cycle detector reports ✓ when it cannot read the journal | ⚠ **ACCEPTED — fixed, three states** | `journalctl -b` gives a user outside `adm` only their own journal and still exits 0, so "no output" was never evidence. `system_journal_readable()` probes `journalctl -b --system -n 1`; `report_ordering_cycles` returns **0 clean · 1 cycle · 2 could not look**, and `check_unit` files `row_unknown` for the third — on the one trap that can only be observed on a real boot and that has already deleted start jobs on this machine. The unqualified grep is kept (it is the repo's own check) and the message now says a cycle between **any** pair of units appears there. `11-M16` |
| **11-A12** — a failed `systemctl enable` prints a green tick, and nothing checks the unit is enabled | ⚠ **ACCEPTED — both halves fixed. PLAN row 12 now HAS a detector** | The tick is conditional on the exit status, and systemd's reason is **printed** instead of being discarded by `>/dev/null 2>&1`. And `check_unit` asks `systemctl show -p UnitFileState`: `enabled`/`enabled-runtime` passes, empty is unknown, anything else FAILS with *"this unit does NOT start after a reboot, and nothing else on this box will say so"*. `11-G16`, `11-M15` |
| **11-A13** — `load_condition_rules` is loud only when it reads **nothing** | ⚠ **ACCEPTED — fixed with the count the finding asked for** | The guard now compares the number of extracted kinds with the number of rows in the `CONDITION_KIND_RULES` block, **counted by a different shape** (`^  <kind>: {`, which a reformat keeps) so it cannot agree with itself, scoped to that block so an unrelated `Record<…>` cannot inflate it. Probed with the adversarial's own defect — `gpu_temp` reformatted onto four lines — which now **dies** naming `read 14 of 15 condition kinds`. `11-M17` |
| **11-A14** — what a correct `--gpus all` fallback must not get wrong | ⚠ **ADVISORY — IMPLEMENTED, against all four of its traps.** §3 | One `ExecStart`; `$GPU_FLAGS` **unbraced**; an `ExecStartPre` probe that asks `nvidia-container-cli info` and never starts a container of this repository; `EnvironmentFile=-` whose silent-default hazard is paid for by a **three-state** `check` row that reads `.HostConfig.DeviceRequests` off the container and **re-probes**, so *fallback while the toolkit now works* is a FAILING, actionable row. All six texts that asserted the old all-or-nothing behaviour were corrected, and a test asserts none of the three sources says it any more. `11-X1`…`11-X6` |
| **11-A15** — `.dockerignore` protects credentials only at the context root | ⚠ **ACCEPTED — fixed** | `**/.env`, `**/.env.*` and `**/*.apikey` added beside their root-relative twins — the one section the file's own header comment calls *"the one that must never be violated"* was the one section without them. `scripts`, `pipeline`, `SPEC.md`, `MOCK.html` and `README.md` are left root-only, which is correct for where those live. `11-W5` |
| **11-A16** — `Restart=on-failure` makes recovery depend on the container's exit code | **ACCEPTED as accurate, DEFERRED to the owner — it is an INSTALL-SPEC §7 decision, not a defect** | The mechanism is real and reasoned rather than run: `docker run` exits with the container's status, Next's standalone server handles `SIGTERM` and exits 0, so `docker stop ai-dashboard` leaves the unit `inactive (dead)` with `Result=success` and systemd does not restart it. But `Restart=on-failure` is written into INSTALL-SPEC §7, which this phase may not edit, and §2.5's *"a dashboard that cannot read a sensor must stay up and say so"* is the reasoning behind it. The mitigation that exists: `check`'s `ActiveState` row FAILS on `inactive`, and it is now measured (guard table). Recorded as `11-Q1` for the owner |
| **11-A17** — the env-file rewrite is not atomic | ⚠ **ACCEPTED — fixed** | `install` copies **onto** the destination: it truncates the live credentials file and writes it again, and an interrupt or a full `/` in that window leaves a truncated `/etc/ai-dashboard.env` — every login denied and every session refused at once, with nothing logged. The temp file now lives in the **destination's own directory** (a dot-file, 0600 from `mktemp`, removed by the EXIT trap) and the last step is `mv -f`, which is atomic within one filesystem — a temp in `/root` and a destination in `/etc` are not guaranteed to be one. `11-M14` |
| **11-A18a** — the dry-run refusal test measures the machine, not the artefact | ⚠ **ACCEPTED — fixed** | It relied on the suite's host not being Ubuntu and not being root, so on the box it would have failed for a reason that is not a defect. It now passes `OS_RELEASE=/dev/null`, which guarantees a refusal anywhere, and additionally asserts the closing line's wording |
| **11-A18b** — nothing asserts the dispatch `case` has the same 13 subcommands as `usage()` | ⚠ **ACCEPTED — fixed** | A third list existed and nothing compared it. The header's 13 entries and the `case` arms are now required to be the same set. `11-M18` |
| **11-A18c** — `Documentation=file:/etc/ai-dashboard.env` | ⚠ **ACCEPTED — fixed** | `systemctl status` invited its reader to open the one 0600 file on the box. It now points at the unit file, which is where the flags and their reasons are. A test asserts `Documentation=` does not name the env file. `11-W10` |
| **11-A18d** — preflight never checks `curl` or `ss` | ⚠ **ACCEPTED — fixed as WARNINGS, deliberately not refusals** | Both are now checked and both **warn**, naming what breaks (`deps` pipes the NVIDIA key through curl; `start` polls with it; `check`'s listener count needs `ss`). A refusal would fire on subcommands that do not use them, which is the refusal-nobody-reads shape this same adversarial names in 11-A8 |
| **11-A18e** — the README's install line runs `git rev-parse` on a box with no checkout | ⚠ **ACCEPTED — fixed** | The README now reads the sha **on the Mac** and pastes the literal value, and explains what `notag-<date>` means for a second build on one day |
| **11-A18f** — `cmd_deps` holds two spellings of four commands; the `.sources` backup announces no mode | **ACCEPTED IN PART.** The mode is fixed; the two spellings are **REJECTED as a defect**, with the refuting line | The `.sources` backup now announces `(mode 0644)`, matching the env-file backup. The two spellings are deliberate and `build.md` §7 says why: *"These lines are the COMMANDS BELOW, spelled out. A review surface that prints a command the real run does not execute is worse than no review surface"* — `--batch --yes` is what makes the key write overwrite an existing keyring without asking. Collapsing them into one `run` would print `curl … \| gpg …` as an opaque pipeline. The residual risk is drift between the two, which is what a reader of the dry run is looking at anyway |
| **11-A18g** — `check_session_secret` explains a non-quote failure with quotes | ⚠ **ACCEPTED — fixed** | The quote paragraph prints only when the message names a quote; everything else gets the true explanation (*`--env-file` takes the rest of the line verbatim*). Own test, `11-G20` |
| **11-A18h** — `--env-file` puts both secrets in the container's environment | **ACCEPTED as accurate, DEFERRED — owner-level, and it is INSTALL-SPEC §7's design** | `docker inspect` shows them in plaintext to every member of the `docker` group and `/proc/1/environ` to root; the repo's own `--api-key-file, never --api-key` rule is the counter-example. Changing it means the app reading a mounted file instead, which is a §5.1/§7 change and not this phase's. Recorded as `11-Q2` |

**Counts — 18 findings, 25 rows (11-A18's eight sub-items counted separately), and the rows add up:**

| verdict | rows | which |
|---|---|---|
| **ACCEPTED and fixed in this loop** | **20** | 11-A1, A2, A3, A5, A6, A7, A8, A9, A10, A11, A12, A13, A15, A17, and A18 a/b/c/d/e/g |
| ACCEPTED, IMPLEMENTED (advisory) | 1 | 11-A14 |
| ACCEPTED IN PART, the rest DEFERRED to a named owner question | 1 | 11-A4 (→ `11-Q3`) |
| ACCEPTED as accurate, DEFERRED to the owner | 2 | 11-A16 (→ `11-Q1`), 11-A18h (→ `11-Q2`) |
| ACCEPTED IN PART with the other half REJECTED | 1 | 11-A18f — the mode is fixed; the two spellings are the dry run's own design |
| | **25** | |

**Two sub-claims are REJECTED with the refuting line quoted**, inside otherwise-accepted rows:
11-A8's *"blocks every root subcommand on a correctly firewalled box"* (this box's rule form **was**
matched — the adversarial's own first table row says ✓), and 11-A18f's two-spellings half
(`build.md` §7: *"a review surface that prints a command the real run does not execute is worse
than no review surface"*).

---

## 2. ⚠⚠ The finding that governed this loop, and the count that is its evidence

### 2.1 What was wrong, in one sentence each

1. **Nothing asserted WHICH functions `cmd_check` calls.** `checkRow(fn, envFileBody)` existed,
   worked, and was pointed at five rows out of twenty-one. `check_one_process` could be replaced
   by `true` — the whole O22 section deleted from `check` — with 31 tests green.
2. **Nothing asserted THAT A GUARD REFUSES.** `validate()` proved the three validators agree with
   the TypeScript; the seven preflight refusals had one assertion between them, and it was that
   `install --dry-run` printed *some* `WOULD REFUSE`.

### 2.2 The two mechanisms

**A call-graph assertion over `cmd_check`, in two halves that are blind to different things.**

| half | what it reads | what it catches that the other does not |
|---|---|---|
| source-text | `cmd_check`'s body, requiring the calls to equal an 11-name list *in order, with nothing else* | a row dropped entirely (nothing to stub), a row reordered, a row renamed — and it forces a NEW row to be entered here, which is the only moment anyone asks whether it has a refusal test |
| behavioural | `cmd_check` run 13 times: all rows stubbed silent (must be 0), each row alone raising `row_fail` (must be 1), a row raising `row_unknown` (must be 2), unknown + fail together (must be 1) | a row that is called but whose verdict never reaches `CHECK_FAIL`; the `CHECK_FAIL > 0 → 1` and `CHECK_UNKNOWN > 0 → 2` contracts; `check_one_process` replaced by `true` |

**A guard-refusal table — "this guard refuses on bad input and permits on good".** Three tables,
one shape:

| table | cases | the form that cannot be satisfied by accident |
|---|---|---|
| `check`'s rows | **38** | every row driven against a stubbed box (docker, `ss`, `curl`, ufw, systemd, and the env file), each with its own bad input and a healthy one; the expected verdict is `fail`/`pass`/`unknown` **and** a substring the message must contain |
| preflight | **12** | **one** input flipped from a healthy baseline at a time, requiring **exactly one** refusal — so a guard that fires for the wrong reason is as visible as one that does not fire |
| whole subcommands | **14** | `restart`, `start`, `unit`, `install`, `configure`, `set-password`, `env_set`, `backup_env`, `env_get`, `report_ordering_cycles`, `load_condition_rules`, the dispatch table, the ufw matcher |

Three small refactors made that possible, and none of them changes what the script does on the
box: `is_root()` (bash's `EUID` is readonly, so an inline `(( EUID == 0 ))` cannot be exercised at
all), `have_terminal()` (the belt-and-braces hash re-check sits behind it), and `env_readable()` /
`env_file_stat()` / `unit_active_state()` / `unit_file_state()` (a test cannot create a
`root:root 0600` file or a systemd unit here). `install -m 0600 -o root -g root` became
`install -m 0600` plus a `chown` **conditional on being root**, which is identical on the box and
makes the mode of the file carrying the password hash assertable off it.

### 2.3 The count

**The sweep, re-run by this phase against this tree.** The adversarial enumerates 48 of its 49
survivors by name; all 48 were re-aimed at the reconciled tree, applied one at a time, measured
with `pnpm vitest run packaging.test.ts`, restored, and the restore asserted byte-for-byte
(`md5` before and after).

| | before (adversarial, 2026-09-10) | after (this phase) |
|---|---|---|
| edits applied | 63 | 48 (every enumerated survivor) |
| **SURVIVED — the suite stayed green** | **49** | **0** |
| CAUGHT | 14 | **48** |

Per family, so the number is readable rather than a single total:

| family | edits | survived before | survived now |
|---|---|---|---|
| 1a `check`'s rows | 18 + 2 | 20 | **0** |
| 1b every preflight refusal | 7 | 7 | **0** |
| 1c the loud-failure obligations | 6 | 6 | **0** |
| 1d the credentials file | 5 | 5 | **0** |
| 1e idempotence | 3 | 3 | **0** |
| 1f the image and the unit | 7 | 7 | **0** |

⚠ **The sweep is now the harness.** All 48 of those edits are permanently encoded as mutations
in `pipeline/steps/11-packaging/regressions.py` — `11-K*` (the call graph), `11-G*` (the `check`
rows), `11-Q*` (the preflight refusals), `11-M*` (the subcommand guards), `11-F*` (ufw's matcher),
`11-X*` (the GPU fallback) and `11-W*` (the image, the unit and the twelve spaces) — so the
measurement that found the hole is the thing that keeps it shut, rather than a script in a
scratchpad that nobody runs again.

⚠ **What the count does not say.** It is a count over the edits *someone already thought of*.
The mechanisms are what generalise: a new `check` row cannot be added without appearing in the
call-graph list, and a row added there without a guard-table entry has no measurement — which is
the state this whole finding describes, made visible at the moment it is created rather than a
phase later.

---

## 3. `--gpus all` falls back — INSTALL-SPEC §11.1, built here

**The shape.** One `ExecStart`, a systemd variable, and an `ExecStartPre` probe:

```ini
ExecStartPre=/bin/sh -c 'if nvidia-container-cli info >/dev/null 2>&1; then echo GPU_FLAGS=--gpus all; else echo GPU_FLAGS=; fi >/run/ai-dashboard-gpu.env'
EnvironmentFile=-/run/ai-dashboard-gpu.env
ExecStart=/usr/bin/docker run … --user 10001:10001 $GPU_FLAGS -e NVIDIA_DRIVER_CAPABILITIES=utility …
```

11-A14's four traps, each with the assertion that holds it:

| trap | what is done | asserted by |
|---|---|---|
| two `ExecStart=` lines make a `Type=simple` unit **fail to load** | one `ExecStart` | `unitCode().match(/^ExecStart=/gm)` has length 1 |
| `${GPU_FLAGS}` is passed as a **single argv** docker rejects; `$GPU_FLAGS` is split | unbraced | the braced spelling must not appear anywhere in the unit |
| a probe that runs **our own image** is a second container of this repository, which `check`'s O22 row counts | `nvidia-container-cli info` — the toolkit and the driver, the two coupled things, without starting anything | the probe must not contain `docker run` or `ai-dashboard:latest` |
| `EnvironmentFile=-` **swallows its own absence**, making the fallback the silent default | paid for by the `check` row below, which reads the CONTAINER | the mode row's three states, each in the guard table |

**How the mode is detected, and the two sources that were rejected.**
`docker inspect ai-dashboard --format '{{json .HostConfig.DeviceRequests}}'` — an `nvidia` entry
is GPU mode, `null`/`[]` is fallback, anything else is unknown. **Not** from the unit text, which
always says `$GPU_FLAGS`. **Not** from `gpus: null` in the telemetry, which is what a broken
toolkit *and a box with no compute card* both produce — and "there is no compute GPU" is this
box's documented steady state, so that inference is guaranteed wrong here at least once.

**Three states, because the container is created once and lives until something restarts it:**

| container | re-probe now | row | why |
|---|---|---|---|
| nvidia device request | answers | **✓** | `--gpus all` took |
| nvidia device request | does not answer | **✓** + a note | this container keeps working; the NEXT restart falls back. Fix the toolkit before restarting |
| fallback | does not answer | **✓** + the reason | the honest degraded mode. The eight non-GPU panels are unaffected and the GPU panels read `—` (§3.1, invariant 5). A FAIL here would fail `install` on a box with no card, which is this box |
| **fallback** | **answers** | **✗** | **the only actionable state** — a fallback that has outlived its cause, and nothing changes it on its own. *Fix: sudo ./dashboard.sh restart* |

⚠ **The one thing that is reasoned and not run, and step 12 owns it.** The belief here is that
systemd loads `EnvironmentFile=` in the forked child, per executed command — so an `ExecStartPre`
that writes the file affects the `ExecStart` of the **same** start. ⚠ **That is recalled, not
verified**: there is no systemd on this Mac and no systemd source tree in this repo, so it was not
read off a running instance and not confirmed against a document here. **The design is safe either way**: if systemd
instead reads environment files once at unit start, the value used is the previous start's probe
(or empty on the first boot after `/run` is cleared) — which is *the fallback*, and the `check`
row then says `FALLBACK … but nvidia-container-cli answers NOW … Fix: restart`. Never down,
never silent, one restart from correct. **Step 12 must observe which of the two happens.**

**Six texts asserted the opposite behaviour** and none was measured: `dashboard.sh` preflight's
driver warning, `cmd_deps`' toolkit note and its closing warning, `check_neighbours`, the unit's
flag table, and `README.md`. All six corrected, and a test now fails if any of the three sources
says a broken toolkit stops the container starting.

---

## 4. What else changed, and why each is not a weakening

| change | it is not a weakening because |
|---|---|
| `preflight` refuses a non-enforcing ufw for `install`/`firewall` | the refusal already existed 380 lines later, where it stopped a run that had already restarted docker and enabled the unit. Moving a refusal EARLIER is strictly stronger |
| `build` rebuilds a `notag-<date>` tag it would have skipped | the skip was the silent-failure shape on the deploy path. An explicit `--tag` still skips, loudly |
| `ufw_rule_for_port` accepts more spellings | each accepted spelling genuinely covers the port in ufw's own semantics; `Anywhere (v6)` is explicitly excluded, and the port-22 refusal's purpose is to notice a box one rule from a lockout, not to refuse a box that is already safe |
| the three "absent" rows became `row_unknown` when the file is unreadable | a row nobody could evaluate is not a row that passed — and it is not a row that FAILED either. Exit 2 exists for this and could not be reached |
| `env_set` writes its temp file in `/etc` rather than `/root` | it is a dot-file, 0600 from `mktemp`, removed by the EXIT trap on every path, and `/etc` is not a scanned `.d` directory. The alternative was a non-atomic rewrite of the credentials file |
| `install -m 0600 -o root -g root` split into `install -m 0600` + conditional `chown` | on the box (always root, enforced by `need_root`/preflight) the result is identical; off the box it is the only way the mode is measurable at all |

---

## 5. What this phase could NOT verify, and why

- **Anything that needs Docker.** No image built, no container started, no `docker inspect` run.
  `check_container`'s two rows, `container_gpu_mode`'s parser and `other_app_containers` are
  measured against `docker`'s **documented output shapes**, fed to the real functions through a
  shell stub. That the daemon produces those shapes is step 12's.
- **Anything that needs systemd.** `UnitFileState`, `StartLimitIntervalUSec`, the
  `EnvironmentFile`/`ExecStartPre` ordering above, and the ordering-cycle grep on a real boot.
- **ufw.** The matcher is measured against fabricated `ufw status` output, which is the parser and
  not ufw. `ufw delete`'s exit status for a non-existent rule is still unconfirmed — both branches
  are now handled, which is what makes that acceptable.
- **The box's own state.** Everything about ai-server comes from root `CLAUDE.md`.

---

## 6. Run log — exit codes, pasted rather than described

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ shellcheck dashboard.sh                                   ; echo $?
0
$ python3 pipeline/steps/11-packaging/regressions.py         ; echo $?
Red-test ledger: 60 distinct failing tests across 130 mutations; 60 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 130 regressions failed their check, as they must.
0
$ python3 <the re-aimed adversarial sweep, 48 edits>         ; echo $?
applied  48 of 48
caught   48
SURVIVED 0
0
$ pnpm verify   # twice, identical both times                ; echo $?
 Test Files  102 passed (102)
      Tests  3121 passed (3121)
Type Errors  no errors
0
```

---

## 7. What step 12 inherits

**Must be verified ON THE BOX, and cannot be verified anywhere else:**

1. **`journalctl -b --system | grep "ordering cycle"` AS ROOT** after a real boot. `check`'s row
   now distinguishes "clean" from "could not look"; only a boot can produce the third answer.
2. **`systemctl show ai-dashboard -p UnitFileState`** — PLAN row 12's *"survives a reboot"* now
   has a detector; the boot is what exercises it.
3. **The GPU probe's ordering** (§3): does the `ExecStartPre`-written `/run/ai-dashboard-gpu.env`
   reach the **same** start's `ExecStart`? Observe `docker inspect ai-dashboard --format
   '{{json .HostConfig.DeviceRequests}}'` on the first start after a boot.
4. **`install` will refuse until `sudo ufw enable` has been run** (11-A9), and enabling ufw on
   this box is the thing that took it off the network on 2026-09-04. Run
   `sudo ufw show added` first, from a session that stays open, and confirm a port-22 rule.
5. **The running container against the unit's `docker run` line** — the part of 11-A4 that was
   deferred: `docker inspect ai-dashboard --format '{{json .Config}}{{json .HostConfig}}'`.
6. **`docker build` actually succeeds**, and `pnpm install --frozen-lockfile` resolves the
   linux/x64 `sharp` variant. Never run here.
7. **`--read-only` at runtime**: whether Next 16's standalone server tries to create
   `.next/cache` with only `/tmp` as tmpfs.

---

## 8. The tree

```
$ git status --short
 M pipeline/HANDOVER.md
 M pipeline/INSTALL-SPEC.md      <- §11.1 only, and it arrived WITH this step's inheritance
?? .dockerignore
?? Dockerfile
?? README.md
?? dashboard.sh
?? packaging.test.ts
?? pipeline/handoffs/11-adversarial.md
?? pipeline/handoffs/11-packaging.md
?? pipeline/handoffs/11-reconcile.md
?? pipeline/handoffs/11-test-phase.md
?? pipeline/steps/11-packaging/
?? systemd/

$ git diff --stat pipeline/INSTALL-SPEC.md
 dashboard/pipeline/INSTALL-SPEC.md | 22 ++++++++++++++++++++++
 1 file changed, 22 insertions(+)      <- the §11.1 block, untouched by this phase
```

Nothing committed, nothing staged. `SPEC.md`, `MOCK.html` and `INSTALL-SPEC.md` are unmodified
(`INSTALL-SPEC.md`'s only diff is §11.1, which arrived with this step's inheritance and was not
touched here). No `.env` anywhere. `next-env.d.ts` byte-identical.
