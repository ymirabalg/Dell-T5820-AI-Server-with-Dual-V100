# `serving-mode.sh` — RECONCILE phase

Reconciled 2026-09-15 against the adversarial phase's **16 findings**, on `b69f81b` + the test
phase's 11 uncommitted fixes. **13 ACCEPTED and fixed, 3 ACCEPTED IN PART with the remainder
DEFERRED and named, 0 REJECTED.** Nothing was committed. Nothing was written to the box — the only
thing run against it was `bash -n` on stdin and a read-only `status`, and it is still serving on
8080/8081 with no `llama-split.service`, no drop-in and no `split.env`.

`serving-mode.sh` is the only file changed: **+728 / −118** against the tree this phase inherited
(1178 → 1804 lines; one of those lines is the harness's own `need_root` stub, which the
comparison copy carries and the shipped file does not). Nothing under `dashboard/` was touched except this notes file.
`SERVING-MODES.md` was **not** edited (its mtime is still the parent's 21:43 correction); the four
wordings this phase would like in it are quoted in §8.

**The two numbers that carry the evidence: the adversarial phase's 16 findings, expressed as 30
assertions, go from 0/30 passing to 30/30. The test phase's harnesses go 104/104 → 110/110** (the
ufw battery gained six cases and had one expectation corrected — §3).

---

## 1. Adjudication

| # | finding (severity as filed) | verdict | what was done, and how it is checkable |
|---|---|---|---|
| **sm-A1** | rollback claims the previous mode is back without checking — CRITICAL | **ACCEPTED** | `do_rollback` now re-reads systemd after its own `enable --now`, per unit, on **both** axes, and prints a verdict from what it read. A rollback that could not restore says so and the run exits **3**. Checked by `A1a`/`A1b`/`A1c` in the sweep, and by the 5 existing rollback cases. |
| **sm-A2** | a second failure inside the rollback aborts it silently — HIGH | **ACCEPTED** | Every rollback step goes through `rb_step` (status captured, output shown, never aborts); the rollback runs with `errexit` **off**; `on_exit` no longer clears `INT`/`TERM` — `do_rollback` **ignores** them so a second Ctrl-C cannot stop it mid-way. `A2a`/`A2b`. |
| **sm-A3** | units/ports/firewall/verdict enumerated from `nvidia-smi` — HIGH | **ACCEPTED** | `compute_pg_instances` unions **systemd** (`list-units`, `list-dependencies multi-user.target`) with the env files and the cards, computed once per run into `PG_INSTANCES`. Cards remain the source only where cards are the subject (`CVD`, the fit projection, idleness). `status` and the preflight now **reconcile** the two lists and name the difference. `A3a`/`A3b`. |
| **sm-A4** | `detect_mode` has no `unknown` — HIGH | **ACCEPTED** | `unit_enabled_verdict` / `unit_active_verdict` read systemd's **word**, not an exit status; `detect_mode` returns `unknown`; the switch refuses on it **before** any other arm and never prints the flag; `status` says UNKNOWN and exits 2. `A4a`/`A4b`/`A4c`. |
| **sm-A5** | VRAM poll: absent or short reading is a false go; nothing wrapped in `timeout` — MED-HIGH | **ACCEPTED** | `vram_all_idle` counts readings and requires **one per card**; zero readings is not idle. Every `nvidia-smi` call goes through `nv()`, which wraps it in `timeout $NV_TIMEOUT` when `timeout` exists. `A5a`/`A5b`/`A5c`. |
| **sm-A6** | a `ufw limit` rule reported as "NO inbound ALLOW rule" — MEDIUM | **ACCEPTED** | `LIMIT` joins `ALLOW`; the tick names it as rate-limited (`UFW_MATCH_ACTION`). `A6`, plus 3 new fixtures in the ufw battery. |
| **sm-A7** | an IPv6-only row is a false tick for the IPv4 port — MEDIUM | **ACCEPTED** | A `(v6)` To-column row returns "does not cover". ⚠ **This corrected a test-phase fixture whose expectation encoded the defect** — see §3. `A7`, plus 3 new fixtures. |
| **sm-A8** | `status` exits 0 while its closing line claims unknowns exit 2 — MEDIUM | **ACCEPTED** | Both halves: the unknowns the verdict rests on now **move the code** (a unit systemd would not answer for, a `?` in an env reading, an unparseable ufw rule set, ufw unreadable **as root**), and the sentence now says exactly what the number means. Root-gated ufw read as a plain user is reported and deliberately does **not** move it — reasoned in §4. `A8a`/`A8b`. |
| **sm-A9** | a masked unit makes the script write into `/dev/null` and `chmod 644 /dev/null` — MEDIUM | **ACCEPTED** | `assert_plain_file` refuses any symlink or non-regular target in `ensure_file` **and** `write_env`; the preflight checks every path the mode will write and every unit it must enable, so it refuses **before** the first mutation. `A9`. |
| **sm-A10** | `/health` proves only that *something* answers; the timeouts are loop counts | **ACCEPTED IN PART** | Accepted: the ports are asserted **free** after the stop and before the start (`assert_ports_free`, via `ss -Hltnp`), which is what closes the squatter case the compute-app check cannot see; and both polls now measure **elapsed seconds** (`SECONDS`), so `HEALTH_TIMEOUT=600` is 600 s. **DEFERRED:** proving the 200/401 came from *that unit's* socket (an inode→pid→cgroup join). `A10a`/`A10b`. |
| **sm-A11** | one global `ENV_CHANGED` restarts an instance whose config did not change | **ACCEPTED** | `ENV_CHANGED_FILES` + `env_changed_for <unit>`, over the same 1:1 the units declare with `EnvironmentFile=`. `A11`. |
| **sm-A12** | three un-evaluable checks reported as definite — MED-LOW | **ACCEPTED** | `svcuser_can_read` returns a third value for "could not ask"; `clients_on_port` returns 2 for "could not look" and `report_clients` prints it as an unread reading; `curl`, `runuser` and `ss` are preflighted (curl refuses, runuser is unknown, ss warns). `A12a`/`A12b`/`A12c`. |
| **sm-A13** | no lock; and the enablement is flipped off before it is flipped on — MED-LOW | **ACCEPTED IN PART** | Accepted: `take_lock` (`flock -n` on `/run/serving-mode.lock`, printed rather than taken under `--dry-run`, warning rather than silence when `flock` is absent). **DEFERRED:** enabling the target *before* disabling the previous mode — see §4. `A13`. |
| **sm-A14** | `CTX` has no upper bound, so the projection overflows to a negative KV | **ACCEPTED** | `SPLIT_CTX_MAX` (16777216), deliberately far above `524288` so the spec's forced-rollback run still works. `A14`. |
| **sm-A15** | four spec divergences | **ACCEPTED IN PART** | **.1 caveat** rewritten (§5). **.3 dashboard restart** is now announced as a cost a rollback does not undo — but is still not undone, reasoned in §4. **.4 `Documentation=`** now names a path that exists. **DEFERRED: .2**, the preflight-before-systemd reordering — see §4. `A15a`/`A15b`. |
| **sm-A16** | the Clients block names only the port that goes *dark* | **ACCEPTED** | Every port the switch interrupts is enumerated, in both directions, distinguishing "stops answering" from "keeps its number but is cut for the duration of the load". `A16a`/`A16b`. |

**Counts: 16 findings — 13 ACCEPTED, 3 ACCEPTED IN PART (sm-A10, sm-A13, sm-A15), 0 REJECTED, 4
sub-items DEFERRED** (sm-A10's socket-identity join, sm-A13's enable-before-disable, sm-A15.2's
ordering, sm-A15.3's *undo*). Nothing was dismissed as not-a-bug.

---

## 2. sm-A1 — how the critical finding was closed

The shipped rollback ended:

```bash
for u in $(units_of_mode "$PREV_MODE"); do systemctl enable --now "$u" >/dev/null 2>&1 || true; done
warn "${PREV_MODE} re-enabled and restarted — check: $0 status"
```

stdout, stderr **and** exit status discarded, and the next line asserting it worked.

**What now proves the previous mode is back** is that systemd is asked again, after the fact, and
the answer is printed:

```
Rollback verification — re-read from systemd, not assumed
  llama-server@0.service     active       enabled
  llama-server@1.service     active       enabled
  ✓ per-gpu re-enabled and restarted — VERIFIED: every unit above is active AND enabled
```

Each unit is re-read on **both** axes — `unit_state` (is it serving now?) and
`unit_enabled_state` (does a reboot come back serving?) — because the measured failure left both
wrong at once. Any unit that is not `active` **and** `enabled` sets `ROLLBACK_FAILED`; so does any
`rb_step` that failed; so does a reading systemd would not give, which is reported as *cannot be
verified*, not as a yes. The failure path prints, to stderr:

```
✗ THE ROLLBACK DID NOT RESTORE per-gpu MODE — the box may be serving NOTHING.
  !      steps that failed inside the rollback:
            systemctl enable --now llama-server@0.service (exit 1)
  !      Anything above that is not 'active enabled' is not serving now and will not
  !      come back at a reboot either. By hand, now:
  !        sudo systemctl unmask llama-server@0.service 2>/dev/null; sudo systemctl enable --now llama-server@0.service
  ...
✗ exit 3: the switch FAILED and the rollback could NOT restore per-gpu.
```

**Exit 3 is new** and is documented in the header (and therefore in `usage()`, whose `sed` range
was bumped): *the switch failed **and** the rollback could not restore the previous mode.* A
failed switch that did roll back still exits 1, so the two cases are distinguishable by a script.

**What the verification deliberately does NOT do** is poll `/health`. The previous mode has to
load 19–32 GB of weights again, which is minutes on this box, and a rollback must not sit on that
while the operator waits to learn what happened. `active` on a `Type=exec` unit means the process
is running, not that the model is loaded — so the check is *named* (`confirm the endpoints with
$0 status`) rather than implied. That is the one honest gap in the closure and it is stated on
screen.

**Designed for the second failure, per the handoff:**

- the whole rollback runs with `errexit` **off**, every step through `rb_step`, which captures the
  status, prints the command's own output, records the step in `ROLLBACK_PROBLEMS` and **carries
  on**;
- `restore_backups`' `cp` is guarded; when it fails the backup temp file is **kept** and its path
  printed, rather than deleted as if the restore had happened;
- `on_exit` clears only `EXIT` (to prevent re-entry) and `do_rollback` sets `trap '' INT TERM`, so
  a second Ctrl-C cannot abort the recovery part way. There is no unbounded wait inside the
  rollback, so ignoring them cannot hang it.

Measured on the pre-fix script (`sweep-runs/A2a-cp-fails`), the same scenario ended with
`llama-split.service enabled active` and **both** per-GPU instances `disabled inactive` — the
half-switched state, silently. After the fix the same scenario names the failed `cp`, keeps the
backup, disables the target, re-enables per-gpu and verifies it.

---

## 3. The suites, and every exit code

Pasted, not summarised.

```
$ shellcheck serving-mode.sh                        rc=0
$ shellcheck -S style serving-mode.sh               rc=0
$ bash -n serving-mode.sh            (macOS 3.2)    rc=0
$ ssh ai-server 'bash -n /dev/stdin' (box 5.3.9)    rc=0
$ ssh ai-server 'bash -s -- status'  (LIVE box)     rc=0   both endpoints 200, ufw honestly
                                                           root-gated, box untouched
$ bash serving-mode.sh --help                       rc=0   (the exit-code table above is in
                                                           the header, so usage prints it)
```

The live `status` is worth one line of its own, because it is the case sm-A8 is about: on the
real box, unprivileged, it prints `ufw state for 8080/tcp: unknown — root-gated` twice and then
`exit code 0`, and the sentence under it now says exactly why that is 0 and what would make it 2.
Before this phase the same run printed `exit code 0` under a line claiming unknowns exit 2.

**The test phase's harnesses, re-run in full against the fixed script:**

| battery | before this phase | after |
|---|---|---|
| dry-run fidelity (7 switches × 5 assertions) | 35 / 0 | **35 / 0** |
| refusals + `status` | 42 / 0 | **42 / 0** |
| ufw parser | 18 / 0 | **24 / 0** (see below) |
| rollback | 5 / 0 | **5 / 0** |
| idempotence | 4 / 0 | **4 / 0** |
| **total** | **104 / 0** | **110 / 0** |

Every number in that table and in the sweep below is from a run against the **byte-final**
`serving-mode.sh` — the whole set was re-run after the last edit, because a measurement taken
against a copy that is one line behind is not a measurement of what ships.

⚠ **One inherited expectation was WRONG and was corrected, not worked around.** The ufw battery's
`"v6 twin line"` fixture asserted that a **lone** `8080/tcp (v6) ALLOW Anywhere (v6)` row *covers*
the port — i.e. the fixture encoded sm-A7. It is now
`"v6-ONLY row does NOT cover the v4 port"` (expect 3), with `"v4 row WITH its v6 twin"` (expect 0)
added beside it so the two cases stay separated, plus a v6+interface row and three `LIMIT` rows.
18 → 24 cases, one expectation changed, five added. That is the only inherited assertion this
phase altered.

**The adversarial phase's sweep, re-expressed as assertions of the correct behaviour** —
`scratchpad/advsweep.sh`, **30 assertions** across all 16 findings, run against the
**pre-reconcile** script and the fixed one, same stubs, same fabricated box, same command:

```
$ bash advsweep.sh serving-mode.PREFIX.sh  BEFORE     0 of 30 assertions pass, 30 fail
$ bash advsweep.sh serving-mode.harness.sh AFTER     30 of 30 assertions pass,  0 fail
```

**Every one of the 30 reproduces on the script this phase inherited**, which is what makes the
after-number mean something. Each scenario is the adversarial phase's own, rebuilt from its notes
(`runs/adv-A…adv-J`, `adv/ufw2.sh`, `adv/vram.sh`) rather than taken on trust; three needed a
harness the adversarial phase did not have, and each is commented with what was measured to build
it:

- an **outer 45 s deadline** per run, because the wedged-NVML scenario makes the **pre-fix** script
  block for ever — without it the sweep hangs on the very defect it is measuring;
- a **differential** timing assertion for sm-A10b (the same scenario at `HEALTH_TIMEOUT` 4 and 12,
  asserting on the *difference*), so that constant costs in the run cancel instead of being
  guessed at. Measured: pre-fix **25 s** for that step (15 s vs 40 s), fixed **6 s**;
- a **shadow `/usr/bin`** for the missing-`curl` case, because deleting the stub is not enough —
  macOS's own `/usr/bin/curl` is on the PATH and `command -v curl` finds it.

⚠ **Two of the sweep's own assertions were wrong the first time, and both were false NEGATIVES
against the fixed script** — the script had done the right thing and the check could not see it.
They are recorded because the same trap will catch the next loop: one matched `already being
listened on` against output that says `ALREADY`; the other (`A5c`) read the script's own exit
**124** — a `timeout` that expired inside a guarded call — as *the harness killed it*. An
assertion that cannot distinguish "the subject failed" from "my instrument failed" is not
evidence. Both are now written so the two cases produce different text.

---

## 4. What was deferred, and the trigger that should retire it

Each of these is a real finding. None is dismissed; each has a named condition under which it
should be done.

1. **sm-A10, the socket-identity join.** `wait_health` still accepts 200/401 from whatever answers
   the port. The squatter case is closed at a different seam (`assert_ports_free`, after the stop
   and before the start), which covers the realistic shape — a proxy, a stale server, a container
   publishing the port. What is NOT covered is a process that grabs the port *inside* the window
   between that check and the bind. Closing that needs `ss -Hltnp`'s pid resolved through
   `/proc/<pid>/cgroup` to the unit, the same join `gpu_busy_procs` already does for compute PIDs.
   **Retire it when** a real switch is ever observed reporting success over a crash-looping unit,
   or when someone adds a second listener to this box on purpose.
2. **sm-A13, enable-before-disable.** The switch still disables the old mode before enabling the
   new one, so a reboot inside that window (bounded by `VRAM_TIMEOUT` plus the env writes) comes
   back with neither enabled. Reversing it would shrink the window to zero at the cost of a
   transient `both` — a state whose **boot** behaviour (systemd resolving `Conflicts=` between two
   units that both want `multi-user.target`) this project has never observed, and whose last
   surprise in this family cost both endpoints at boot with one journal line. **Retire it when**
   the spec §9 reboot acceptance has actually been run in each mode, so there is a measurement of
   what `both` does at boot to reason from.
3. **sm-A15.2, preflight before the systemd question.** The spec §3 orders the preflight first; the
   script asks systemd first. The *harm* the finding named — a false "NEITHER mode is enabled"
   pre-empting the honest "systemctl cannot be read" — is closed by sm-A4, which makes the first
   question answer `unknown` and say so. What remains is only which of several *true* refusals is
   printed first. **Retire it when** the refusal order is ever observed to mislead someone.
4. **sm-A15.3, the dashboard-container restart is not undone.** Accepted as a *disclosure* — the
   run now says the `daemon-reload` and the `ai-dashboard` restart are not undone by a rollback,
   before doing them — and **the implied remedy is rejected on purpose**: restarting the container
   a second time during a rollback is another interruption of the thing the operator is watching,
   to undo something that is idempotent and harmless. The unit files are likewise deliberately
   left (documented in the build notes).

**One judgement worth review, in sm-A8.** `status` counts unknowns toward exit 2 — but not the
ufw check when it is unreadable *because the caller is not root*. That is the live-box case for
every unprivileged `status`, and making it exit 2 would mean the code never distinguishes anything
again. Run **as root** the same answer means ufw is absent or broken, which is a real unknown and
does count. The closing line states this in full rather than leaving the reader to infer it. If
the owner would rather have a third code for "evaluated with gaps", that is a one-line change.

**Two defects this phase introduced and then caught**, recorded because the second is the more
interesting one:

1. **An unguarded pipeline on the VRAM failure path.** Wrapping `nvidia-smi` in `timeout` (sm-A5)
   means it can now exit **124**, and `vram_used_mib | sed …` as a bare statement under
   `set -e -o pipefail` then ended the run at that line — *before* its own `die`, so the
   "the cards did not free" message never printed and the exit code was 124 instead of 1. The
   rollback still happened (the EXIT trap fired), which is exactly why it would have been easy to
   miss. Both diagnostic lines are now captured and guarded, and a reading that cannot be taken
   says so. The same shape in `status`'s Cards block was guarded with it. **Caught by the sweep's
   A5c**, not by the 110 inherited cases — none of which wedges a driver.
2. **A false statement in the Clients block, added by the fix for sm-A16.** Enumerating "every
   port the switch interrupts" first reported the target mode's ports as *cut*, which is wrong for
   a port that is **dark right now** (8081 on the way back from split: it comes UP, it is not
   cut). Each such port is now probed with the same `/health` call `status` uses, and the two
   cases are worded differently. Found by reading the output, not by a fixture.

---

## 5. The caveat's new text (sm-A15.1)

`dashboard_caveat` no longer tells the operator that a ruled question is open. Printed on every
switch into split and on every `status` while split runs:

```
⚠ DASHBOARD: the shipped dashboard does not yet know about split mode, and what it
     shows for GPU 1 in this mode is not cosmetic.
     It still joins a card to an instance by gpu.index === serving.instance (its
     SPEC.md §3.4, §6.2). In split mode that join has no answer: ONE instance, TWO
     cards, and 'split' is not an index — so GPU 1's served-by line renders as an em
     dash, which by the dashboard's own invariant 1 reads as AN UNREAD READING when
     the truth is 'this card IS serving, jointly'. False by omission.
     This is NOT an open question. SERVING-MODES.md §4 was RULED on 2026-09-15: the
     dashboard will state the mode honestly, via serving[].gpus sourced from each
     unit's own CUDA_VISIBLE_DEVICES (%i -> [N]; this unit -> [0,1]).
     ⚠ RETIRED BY: dashboard loop 12b shipping serving[].gpus and the inverted join
     (dashboard/SPEC.md §3.4/§6.2, SERVING-MODES.md §4). The day GPU 1 reads
     'served jointly with GPU 0', this caveat is false — delete it from this script.
     Until then: do not read GPU 1's served-by line in split mode.
```

The behavioural claim is still true of the shipped dashboard (`dashboard/SPEC.md` carries the
ruling; the component tests still assert the old join), so the warning stays — but it now states
the ruling, and it names the thing that makes it false: **loop 12b**. This is the only place in
the script that must change when 12b lands, and it says so on its own face.

---

## 6. What a future session must know

⚠ **`HANDOVER.md` was deliberately NOT rewritten** — that is the dashboard pipeline's file and
this is a root script. What matters is here instead:

- **The script is still not on the box, and has never run there beyond `status` and `bash -n`.**
  Everything in §3 is harness evidence plus two read-only live runs.
- **Still real-run-only**, unchanged from the build's §9 and now with two more items:
  a reboot in each mode (`journalctl -b | grep "ordering cycle"` must be empty);
  `systemd-analyze verify /etc/systemd/system/llama-split.service`; **both cards checked, never
  the sum**, after a real split load; and now (a) the **lock** path on a box where `/run` exists
  and `flock` is real, and (b) the **`list-dependencies` / `list-units` enumeration** against a box
  where an instance is genuinely disabled — both were measured read-only on the live box but only
  exercised for real against the stub.
- **The enumeration is now three-source.** If a future reader wonders why `pg_instances` is not
  just `nvidia-smi`: because a card that falls off the bus made a running instance invisible in
  every table while `status` exited 0. `systemctl list-unit-files 'llama-server@*'` is **not** a
  usable fourth source — measured on the box, it lists only the template (`indirect`), never the
  instances.
- **`PG_INSTANCES` and `CVD` are computed once, in main, and only for the three real
  subcommands.** A run's tables therefore cannot disagree with each other, and `--help` runs no
  probes. Override either from the environment to exercise a shape.
- **The harness now models four more commands** (`systemctl list-units`, `list-dependencies`,
  `list-unit-files`, `mask`; plus `flock`, `timeout` and `ss -l`), all built from output read off
  the live box on 2026-09-15 and commented with what was measured.
- **The sweep is the regression suite for the adversarial findings.** `scratchpad/advsweep.sh
  <script> <label>` re-runs all 28 assertions against any copy of the script; that is how the
  before/after count in §3 was produced, and how a future loop should check it has not regressed.

---

## 7. Owner questions

Seven, each a judgement this phase made that is reversible in one place:

1. **Exit 3 is new.** A switch that fails *and* cannot restore the previous mode now exits 3
   rather than 1, so automation can tell "it rolled back" from "the box may be dark". Wanted, or
   should every failure stay 1?
2. **An unprivileged `status` still exits 0 with the ufw check unknown** (§4). The alternative is a
   third code for "agreed, but with gaps".
3. **`per-gpu` now REFUSES when an instance has no visible card** — the recovery mode became
   stricter. The alternative is to configure only the cards that are present and say loudly that
   the §8 arrangement was not fully restored. Refusing was chosen because a silent half-switch is
   what sm-A3 filed; it is a one-line change if the owner prefers the other.
4. **`Documentation=file:/etc/llama-server/split.env`** replaced a path that does not exist. If
   the script is ever installed on the box (`/usr/local/sbin/serving-mode.sh`, as
   `gpu-fan-control.sh` is), that is the better target — but it must be a fixed path, not `$0`,
   or the unit text changes with how the script was invoked and forces a `daemon-reload`.
5. **The lock is `/run/serving-mode.lock`, and only this script takes it.** The sharper collision
   in sm-A13 is `serve-llm.sh set-model` running during a switch. Teaching `serve-llm.sh` to take
   the same lock is the real fix and is **out of this phase's scope** — `serve-llm.sh` was not
   touched.
6. **sm-A13's enable-before-disable ordering is deferred** pending the reboot acceptance run
   (§4.2). That acceptance item is still unexecuted, and it is the one that would settle it.
7. **The four `SERVING-MODES.md` wordings below**, none of which was applied.

---

## 8. Wording this phase would like in `SERVING-MODES.md` (not edited, as instructed)

1. **§3, after the rollback clause.** The spec says the switch must "roll back on failure …
   restore the previous mode and say why". It does not say the rollback must *check*. Suggested
   addition: *"⚠ And the rollback must VERIFY its own result from systemd — enablement and
   activity, per unit — and say plainly when it could not restore the previous mode. A rollback
   that reports success without checking is worse than none: it is reached only when something has
   already gone wrong."*
2. **§3 item 1, the preflight clause.** Suggested addition after *"a check that cannot be
   evaluated reports unknown and refuses"*: *"— and that applies to the FIRST question the script
   asks, which is systemd's. 'systemd did not answer' is `unknown`, never 'nothing is enabled'."*
3. **§5.** Suggested replacement for *"The switch script must say which clients it is about to
   break"*: *"…must say which clients it is about to break — on every port it interrupts, not only
   the port that stops existing. A port that keeps its number is still cut for the length of a
   model load."*
4. **§9 acceptance.** Suggested addition: *"A forced failure whose ROLLBACK also fails (mask a unit
   first) is reported as a failed rollback, not as a restored mode."* — that is the case this
   phase's sweep runs as `A1a`, and it is the one acceptance item that cannot be inferred from a
   successful run.
