# `serving-mode.sh` — ADVERSARIAL phase

Attacked 2026-09-15 against the test phase's tree (`b69f81b` + the 11 uncommitted fixes).
**16 findings, none fixed.** Nothing was written to the box; `git status` is byte-identical to
what was inherited. Scratch work is in the session scratchpad (`advrun.sh`, `adv/*`), reusing the
test phase's `world.sh` / `mkstubs.sh` / stub `bin/` unchanged and its `mkcopy.sh` one-line
harness copy.

The test phase's template was taken literally: **do not trust the script's model of a command it
cannot see.** Every degraded shape below was either read off the live box or built from the
command's documented behaviour, then run.

---

## Findings

### sm-A1 — ⚠⚠ **The rollback states that it restored the previous mode without ever checking. It can leave the box dark and disabled while saying it is serving.** — CRITICAL, measured

`serving-mode.sh:590-591`

```bash
for u in $(units_of_mode "$PREV_MODE"); do systemctl enable --now "$u" >/dev/null 2>&1 || true; done
warn "${PREV_MODE} re-enabled and restarted — check: $0 status"
```

The one command whose success the whole "a failed switch leaves the box SERVING, never dark"
promise rests on has **its stdout, its stderr and its exit status all discarded**, and the very
next line asserts it worked. There is no `is-active` check and no `/health` poll after a rollback.

**Measured** (`runs/adv-C`): per-gpu → split, `/health` never answers, and the rollback's
`enable --now` fails (stubbed to the real systemd message `Failed to enable unit: … is masked`):

```
✗ no healthy answer from llama-split.service on port 8080 — journalctl -u llama-split.service -n 60

ROLLING BACK to per-gpu mode
! removed …/etc/llama-server/split.env (it did not exist before)
! per-gpu re-enabled and restarted — check: … status        <-- FALSE
### EXIT=1
### final unit state:
###   llama-server@0.service disabled inactive
###   llama-server@1.service disabled inactive
###   llama-split.service    disabled inactive
```

Both endpoints dark, **both units disabled**, so a reboot also comes back serving nothing — and
the operator's last line of output says the previous mode is back. This is the same defect class
the test phase called its worst find (*"a false statement about the rule set"*), on the code path
that exists specifically to be trusted when everything else has already failed.

Realistic triggers for the inner failure, all of which `|| true` swallows: the previous mode's
model file was moved or renamed between the two runs; the target's process has not released the
cards so the per-GPU units start and immediately OOM (`enable --now` still returns non-zero only
sometimes — see sm-A5); `systemctl` hit the unit's `StartLimitBurst`; the unit was masked by hand;
the D-Bus connection dropped.

`do_rollback:583-584` has the identical defect in the `PREV_MODE == TARGET_MODE` branch —
`systemctl restart "$u" || true` followed by *"${TARGET_MODE} restarted on its previous
configuration"*.

### sm-A2 — ⚠ **A second failure *inside* the rollback aborts it silently, after the traps have already been cleared.** — HIGH, measured

`serving-mode.sh:552` (`restore_backups`), `600-606` (`on_exit`)

`on_exit` does `trap - EXIT INT TERM` **first** (line 602), then calls `do_rollback`. `restore_backups`
runs `cp "$src" "$dst"` and `rm -f` with **no `|| true`** under `set -e`, while every `systemctl`
call in `do_rollback` has one. So a failing `cp` kills the handler part-way through the rollback,
with no handler left to notice.

**Measured** (`runs/adv-J`), `cp` stubbed to fail on writes under `/etc` (read-only `/etc`, a full
filesystem, or an immutable attribute):

```
ROLLING BACK to split mode
cp: cannot create regular file '…/etc/llama-server/split.env': Read-only file system
### EXIT=1
```

That is the entire output. The banner claims a rollback; the raw `cp:` line is the only evidence it
did not happen; `split.env` is left holding the **new** configuration; and in the cross-mode case the
abort lands *before* `disable --now` of the target and *before* `enable --now` of the previous mode,
so the box stays in the half-switched state with nothing said. The script never prints
"the rollback itself failed".

This is precisely the repo's own recorded lesson (`CLAUDE.md`: a cleanup handler that dies under
`set -u`/`set -e` turns a recoverable failure into an unrecoverable one) with `cp` in place of the
`local` read the test phase checked for.

### sm-A3 — ⚠ **Every unit, port, firewall row and mode verdict is enumerated from `nvidia-smi`'s card list, not from systemd. A card that drops off the bus makes a whole running instance invisible — and `status` ticks green.** — HIGH, measured

`serving-mode.sh:137-167` (`gpu_indices` → `pg_instances` → `pg_units` / `unit_port_pairs` /
`ports_of_mode`), `182-202` (`detect_mode`), `1147` (`CVD`), `398`/`409` (the generated
`Conflicts=`/`After=` lists).

`pg_instances` returns the **CUDA indices nvidia-smi reports right now**. Everything downstream is
derived from it. A V100 that has fallen off the PCIe bus (a documented Volta failure mode; the box
has no BMC to notice) drops out of that list while `llama-server@1.service` stays enabled and
active.

**Measured** (`runs/adv-A`), `nvidia-smi` enumerating one card, both instances enabled + active:

```
enabled: per-gpu
running: per-gpu
✓ enabled and running agree: per-gpu

Units
  llama-split.service        not installed
  llama-server@0.service     active       enabled      <-- @1 is simply absent

Endpoints
  http://192.168.4.71:8080/v1        live (/health 200)   <-- 8081 absent

Cards
    GPU 0, 28532 MiB, 32768 MiB, 62, 240.00 W
    held by pid 4001     llama-server             llama-server@0.service
    held by pid 4002     llama-server             llama-server@1.service   <-- on a card not listed

Firewall
  ✓ ufw covers 8080/tcp inbound and is enforcing        <-- 8081 never checked
### EXIT=0
```

**Exit 0, "enabled and running agree".** The only tell is a held-by line naming a unit that the
Units table does not contain, and nothing flags it. Contrast the dashboard, which was explicitly
ruled to render exactly this as `card not enumerated` (`dashboard/SPEC.md:308`).

The switch is worse. **Measured** (`runs/adv-A2`), `sudo serving-mode.sh per-gpu` in the same state:

```
Configuration
  · 0.env: old ctx=99999 -> qwen3.6-27b ctx=163840
  ✓ wrote …/etc/llama-server/0.env
Starting per-gpu
Health
  ✓ llama-server@0.service healthy on port 8080
Now in per-gpu mode
### EXIT=0
### systemctl log:  enable llama-server@0.service / restart llama-server@0.service
```

`1.env` was never rewritten and `llama-server@1` was never touched, so the spec's *"restores the
arrangement recorded in §8"* (§3, §8) is silently not done — while the banner says the mode was
entered and the exit code is 0. There is **no card-count check for `per-gpu`** (`preflight:669-671`
only refuses `n < 1`, and `n < 2` for split only). The same enumeration also decides `CVD` and the
`Conflicts=`/`After=` lists baked into the generated `llama-split.service`, so a unit written in
that state permanently excludes the missing instance from the mutual exclusion.

Split refuses correctly in this state (`split mode needs 2 cards; 1 visible`, `runs/adv-A3`) — the
hole is `per-gpu` and `status`.

### sm-A4 — ⚠ **`detect_mode` has no `unknown`: every `systemctl` failure reads as "not enabled, not running".** — HIGH, measured

`serving-mode.sh:182-202`

The test phase fixed the *display* helper (`unit_enabled_state` → `unknown`, `:177`) and left the
*decision* function unfixed. `detect_mode` consumes only `is-enabled --quiet` / `is-active --quiet`
exit status, so "systemd says no" and "systemctl could not answer" are the same answer.

**Measured** (`runs/adv-E`), `systemctl` replaced by one that prints `Failed to connect to bus: No
such file or directory` and exits 1, with both instances enabled and active:

```
enabled: none
running: none
! neither mode is enabled or running — this box is NOT serving     <-- FALSE

Units
  llama-server@0.service     unknown      unknown
  llama-server@1.service     unknown      unknown                  <-- honest, two lines below
```

The script contradicts itself in adjacent blocks and the headline is the wrong one.

The switch is the dangerous half (`runs/adv-E2`): it refuses with

> `NEITHER mode is enabled, so a failed switch would have nothing to roll back to … sudo … split --bootstrap`

— a false statement about the box, whose printed remedy is **the flag that removes the only guard
against that state**. Taking that advice (`runs/adv-E3`) carries the run through a fully green
preflight, writes `llama-split.service` **and** the template drop-in, and only then dies at
`daemon-reload` with a bare `Failed to connect to bus` and no `die` framing.

This is the script's own stated doctrine (`:126-129`, *"a check that cannot be EVALUATED is
`unknown`, and unknown REFUSES"*) violated by the first check it runs.

### sm-A5 — ⚠ **The VRAM poll: an *unparseable* number is safe, but an *absent* or *short* reading is a false go.** — MEDIUM-HIGH, measured

`serving-mode.sh:219-228` (`vram_used_mib`, `vram_all_idle`), `1016-1031` (`wait_for_vram`)

The handoff's question, answered by measurement (`adv/vram.sh`, six fixtures):

| what `nvidia-smi --query-gpu=memory.used` does | `vram_all_idle` |
|---|---|
| `[N/A]` on both cards | **1 — refuses** ✓ |
| `28532` + `[Unknown Error]` | **1 — refuses** ✓ |
| exits 127 (binary gone) | **0 — ALL IDLE** ✗ |
| non-zero with the message on **stderr** | **0 — ALL IDLE** ✗ |
| exits 0, prints nothing | **0 — ALL IDLE** ✗ |
| **one line for two cards** (a card fell off the bus) | **0 — ALL IDLE** ✗ |

`for m in $(vram_used_mib)` over an empty list iterates zero times and falls through to `return 0`.
`gpu_busy_procs` is empty in the same cases, so `wait_for_vram`'s conjunction
(`[[ -z "$busy" ]] && vram_all_idle`) is satisfied at `t=0` and it prints its green tick with an
empty number in it: `✓ cards free after 0s:  MiB used`.

**Mitigation measured on the live box, and it is the reason this is not CRITICAL:** `nvidia-smi`
writes its errors to **stdout**, not stderr — `No devices were found` (rc 6) and
`Field "bogus.field" is not a valid field to query.` (rc 2) both arrive on stdout, fail the
`^[0-9]+$` test and refuse. So the common driver complaints land in the safe column. What does not:
a **short** reading. `vram_all_idle` validates the values it got but never checks that it got one
**per card** — `gpu_count` is available and unused. Same root as sm-A3.

Also: **nothing in the script is wrapped in `timeout`** (verified; `timeout` and `flock` are both
installed on the box). A wedged driver makes `nvidia-smi` block in NVML, and `wait_for_vram` then
hangs past `VRAM_TIMEOUT` with the per-GPU instances already stopped — dark, with no timeout and
traps that only fire on a signal.

### sm-A6 — ⚠ **A `ufw limit` rule is reported as "NO inbound ALLOW rule covers 8080/tcp" and refuses the switch. The rule does open the port.** — MEDIUM, measured

`serving-mode.sh:287` — `[[ "${fld[$ai]}" == ALLOW ]] || return 1    # DENY/REJECT/LIMIT do not open anything`

The comment is factually wrong about ufw. `ufw limit <port>/tcp` emits an **ACCEPT** preceded by a
`-m recent --update --seconds 30 --hitcount 6` drop — it opens the port, rate-limited, and is the
form a cautious operator reaches for on a LAN-exposed inference endpoint.

**Measured** against the shipped `ufw_line_covers`, extracted verbatim (`adv/ufw2.sh`):

```
FAIL  got=NO  want=COVER   8080/tcp   LIMIT IN   192.168.4.0/22
FAIL  got=NO  want=COVER   8080/tcp   LIMIT      192.168.4.0/22
```

`ufw_port_state` then returns 3 and the preflight prints
`✗ ufw: NO inbound ALLOW rule covers 8080/tcp — add it before serving on it` and refuses. That is a
**false statement about the rule set** on a firewall that is correct — the exact sentence the test
phase identified as the worst outcome, reintroduced for a different verb. `LIMIT` belongs with
`ALLOW`, or at minimum in the unparseable/UNKNOWN bucket (code 5) rather than in the confident
"there is no rule" bucket.

### sm-A7 — **An IPv6-only ALLOW row is a false TICK for the IPv4 port.** — MEDIUM, measured

`serving-mode.sh:296` — `(( m >= 2 )) && [[ "${tocol[$(( m - 1 ))]}" == '(v6)' ]] && m=$(( m - 1 ))`

`(v6)` is stripped and the row is then treated as if it covered IPv4.

```
FAIL  got=COVER  want=NO   8080/tcp (v6)   ALLOW IN   Anywhere (v6)
```

The box listens on `0.0.0.0:8080` / `0.0.0.0:8081` (measured, `ss -Hltn`), so IPv4 is the path that
decides whether clients reach it. A rule set carrying only the v6 half — `ufw allow to ::/0 port
8080`, or a v4 rule deleted while its v6 twin was left — reports *"an inbound ALLOW rule covers
8080/tcp and ufw IS enforcing"* over a closed port. The test phase's fixtures used `(v6)` only as a
decoration alongside a matching v4 row, so the case never separated.

### sm-A8 — **`status` exits 0 while a check was unknown, and its own closing line says it exits 2.** — MEDIUM, measured

`serving-mode.sh:1125-1141`

The Firewall block's unknown arm (`*) info "ufw state for ${p}/tcp: unknown (needs root)"`) does not
touch `rc`; only the Cards block does. The closing line prints:

> `exit code 0: 0 = enabled and running agree, 2 = they do not, or a check was unknown`

**Measured** (`runs/adv-D`, ufw absent) — the two lines above it say "unknown" twice and the line
itself says `exit code 0`. This is not hypothetical: it is the **live-box case**. The test phase's
own run recorded `ufw honestly unknown (needs root)` and **exit 0** on the real machine, which is
what any non-root `status` produces, and what any automation reading `$?` will see. Unknowns in the
env-file readings (`env_get … || echo '?'`) and in `unit_state`/`unit_enabled_state`
(`unknown`/`not-found`) are equally invisible to `rc`.

Either the exit code must count unknowns or the sentence must stop claiming it does.

### sm-A9 — ⚠ **A masked `llama-split.service` makes the script write into `/dev/null`, run `chmod 644 /dev/null`, and print `✓ wrote …`.** — MEDIUM, measured (primitives)

`serving-mode.sh:492-508` (`ensure_file`), lines 503-506

`systemctl mask llama-split.service` creates `/etc/systemd/system/llama-split.service` as a
**symlink to `/dev/null`** — the exact path `ensure_file` owns. Measured on the three primitives:

1. `[[ -f symlink→/dev/null ]]` → **false** (a char device is not a regular file) → `ensure_file`
   takes the *write* branch instead of comparing.
2. `printf '%s\n' "$content" > "$path"` follows the symlink → the unit text goes into `/dev/null`,
   rc 0, the mask is untouched.
3. `chmod` follows symlinks (verified: `chmod 644 link` took the target from 600 → 644), so
   **`chmod 644 "$path"` is `chmod 644 /dev/null`** — narrowing it from its correct `0666`. Every
   unprivileged `> /dev/null` on the box then fails until it is restored.

The run then prints `✓ wrote /etc/systemd/system/llama-split.service` (false), returns 0 so
`reload=1`, issues a `daemon-reload` and **restarts the `ai-dashboard` container for nothing**,
stops the per-GPU instances, waits out the VRAM, writes `split.env`, and only then dies at
`systemctl enable` (masked) and rolls back. The collateral `chmod` is never undone.

`ensure_file` and `write_env` should refuse a path that exists but is not a regular file rather than
following it.

### sm-A10 — **The `/health` tick proves only that *something* on that port answers, and the timeouts it prints are loop counts, not seconds.** — MEDIUM, reasoned (mechanism measured)

`serving-mode.sh:1035-1050` (`wait_health`), `:344` (`health_code`)

`wait_health` checks `systemctl is-active --quiet "$u"` and then curls `127.0.0.1:$p`, accepting
**200 or 401**, with no check that the socket belongs to the unit. The unit is `Type=exec`, so it is
`active` the instant the binary execs — before it binds. A bind failure (`Address already in use`)
happens *after* `systemctl start` has already returned 0. So on the **first** poll iteration:
`is-active` is true, and if anything else is already listening on the port and answers 200/401, the
function returns 0 at `t=0` and step 10 disarms the rollback. The switch reports success while the
real unit crash-loops to `StartLimitBurst`.

The preflight's foreign-process check does not close this: it enumerates
`--query-compute-apps`, so a non-GPU squatter (a proxy, a stale `-ngl 0` server, a container
publishing the port) is invisible to it. The script already uses `ss` in `clients_on_port` and never
asks whether the target port is free before starting.

Every harness run shows the shape of it: `· answered 200 after 0s` — a 32.6 GB model that takes
minutes to load is accepted as healthy on the first probe, with no requirement that the answer be
*late*. (llama.cpp does return 503 while loading, which is why this is narrow rather than routine —
but 503 is a property of the *right* process, not a check the script performs.)

Separately, both polls advance their counter by a literal 2 per iteration (`:1025`, `:1047`) while
each iteration also pays for `curl -m 2`, an `nvidia-smi`, a `ps` per compute pid and a `systemctl`.
`HEALTH_TIMEOUT=600` is therefore up to ~1200 s of wall clock per unit, and the script prints it as
seconds in the dry-run text. Same family as the repo's own `predicted_per_second` lesson: **the
number reported is not the quantity measured.**

### sm-A11 — **`ENV_CHANGED` is one global, so a switch restarts a healthy instance whose own configuration did not change — immediately after saying no port goes dark.** — MEDIUM-LOW, measured

`serving-mode.sh:1000` (set by any `write_env`), `:939` (read once per unit)

**Measured** (`runs/adv-G`), only `1.env` differing:

```
· 0.env already says exactly this — leaving it alone
✓ wrote …/etc/llama-server/1.env
…
###   systemctl restart llama-server@0.service
###   systemctl restart llama-server@1.service
```

Instance 0 — live, loaded, with a warm KV cache and established clients — is restarted because a
*different* card's env file changed. On this box that is a ~3-minute reload of a 19 GB model, every
established connection on 8080 dropped, and the prefill the one-agent-per-port rule exists to
preserve thrown away. The Clients block four steps earlier said *"no port goes dark in this
direction"*.

### sm-A12 — **Three checks that cannot be evaluated are reported as definite failures or definite passes rather than as unknown.** — MEDIUM-LOW, measured

- **`runuser` absent** (`:640`, `:687`). `! runuser -u yorman -- test -r "$f" 2>/dev/null` is true
  both when the user cannot read the file and when the command does not exist. **Measured**
  (`runs/adv-H`): two confident false accusations —
  `✗ yorman cannot read …/gemma-4-31B-it-Q8_0.gguf` and `✗ yorman cannot read …/llama-server.apikey`
  — sending the operator to fix permissions that are correct. Refusing is right; the *statement* is
  false, and it should be `pf_unk`.
- **`ss` absent** (`:350`, `clients_on_port` → `return 0` with no output). The caller cannot tell
  "no established peers" from "I could not look", and prints
  *"no established connections at this instant"* — a positive claim about the network.
- **`curl` absent.** Nothing preflights it (the script preflights `strings`, `ufw` and `nvidia-smi`).
  `health_code` returns an empty string forever, so **every switch would burn the full
  `HEALTH_TIMEOUT` and then roll back a mode that is in fact healthy** — the worst possible reading
  of a missing tool.

### sm-A13 — **No lock, and the enablement is flipped off before it is flipped on.** — MEDIUM-LOW, reasoned

There is no `flock`, lock file or advisory marker anywhere in the script (verified; `flock` is
installed on the box). Three concrete consequences:

- **Two `serving-mode.sh` runs at once** both pass the preflight, both stop, both write, both start.
  Each holds its own `PREV_MODE`/`BACKUPS`, so the loser's rollback restores an env file the winner
  has since rewritten, and `drop_backups`/`restore_backups` operate on stale `mktemp` copies.
- **`serve-llm.sh set-model N …` concurrent with a split switch.** `set-model` restarts
  `llama-server@N`; the drop-in's `Conflicts=llama-split.service` makes systemd **stop the split
  process** to let it start. `serving-mode.sh`'s health poll then sees `is-active` false and rolls
  back, while `set-model` runs its own rollback against the same env files. Neither script knows the
  other exists. (`serve-llm.sh install` producing `both enabled` is already recorded in the build
  notes §10; this is the sharper case.)
- **A reboot or power loss between step 6 and step 8** (`:883`-`:944`) — a window bounded by
  `VRAM_TIMEOUT` (120 s) plus the env writes — finds *both* modes disabled and the box comes back
  serving nothing, with no trap able to fire. The switch disables the old mode before enabling the
  new one; enabling the target first would shrink the window to zero at the cost of a transient
  `both`.

### sm-A14 — **`CTX` has no upper bound, so the fit projection overflows to a negative KV and the "does not fit" warning is suppressed.** — LOW, measured

`serving-mode.sh:776-784` (the guard), `:731` (`kv=$(( ctx * SPLIT_KV_KIB_PER_TOK / 1024 ))`)

The guard refuses `< 256` with the reasoning *"refuse the values whose meaning the script does not
model rather than report a fit it did not compute"* — and then models nothing at the top end.
**Measured** (`runs/adv-F`), `split 9223372036854775000`:

```
· projected: weights 31123 MiB + global KV -63 MiB (80 KiB/token x 9223372036854775000) + SWA 1200 MiB = 32260 MiB
·            against 65536 MiB across all cards, before compute buffers
```

A **negative** KV figure, a total that fits comfortably, and the
`the projection does not even fit the SUM of both cards` warning never fires. Bash wraps `intmax_t`
silently. A sane ceiling (the model's native 262144, or anything that keeps `ctx * 80` inside
int64) restores the guard's own stated principle.

### sm-A15 — **Spec divergences.** — LOW, measured

Read clause by clause against `SERVING-MODES.md`. The substance holds (see *What held*); these are
the gaps:

1. **`dashboard_caveat:762` states a decision that has been made.** It prints *"SERVING-MODES.md §4
   lists three honest fixes and the choice is the owner's."* §4 is now headed **"✅ RULED — the
   dashboard states the mode, honestly. Owner's ruling, 2026-09-15 … Option 1 of the three that were
   offered"**, and `dashboard/SPEC.md:1194-1206` carries the inverted join and `gpus: readonly
   number[] | null`. The caveat's *behavioural* claim (GPU 1 renders as an em dash today) is still
   true of the shipped dashboard code, but the operator is told an open question exists where the
   answer is written down. Printed on every split switch and on every `status` while split runs.
2. **Spec §3 orders the preflight first; the script asks systemd first** (`:795`-`:812`), which is
   why sm-A4's false "NEITHER mode is enabled" pre-empts the honest "nvidia-smi/systemctl cannot be
   read". Reordering would make the refusal name its real cause.
3. **The step-3 `daemon-reload` + `ai-dashboard` restart is a real mutation performed before the
   rollback is armed** (`:830`-`:841` vs `:871`-`:876`) and is never undone on a rollback. The unit
   files are deliberately left (documented); the container restart is not mentioned anywhere as a
   cost of a *failed* switch.
4. **`Documentation=file:${SVC_HOME}/serving-mode.sh`** (`:392`) — `~/serving-mode.sh` does not exist
   on the box (verified). The generated unit documents a path to nothing.

### sm-A16 — **The Clients block names only the port that goes *dark*, not every client the switch breaks.** — LOW, measured

`serving-mode.sh:843-869`, `:988` (`ports_of_other_modes`)

Spec §5: *"The switch script must say which clients it is about to break."*

- **per-gpu → split**: only 8081 is enumerated. `llama-server@0` is `disable --now`'d in step 6, so
  every established client on **8080** is dropped too, unnamed, and only reconnects minutes later
  when the split model has loaded.
- **split → per-gpu**: `ports_of_other_modes per-gpu` is empty, so it prints *"no port goes dark in
  this direction"* — true of the port, misleading about the clients: the split process on 8080 is
  stopped and everything attached to it is severed for the duration of two 19 GB loads.

`clients_on_port` is already written and would answer for both ports; it is simply not called for
the ports that survive.

---

## What held

Re-derived rather than taken from the test notes:

- **All eleven argument guards**, including the four the test phase added. Fixture-run against the
  harness copy: `split per-gpu` → *two subcommands given*; `split 163840 262144` → *too many
  arguments*; `split 0` → *CTX must be at least 256*; `split abc` → *CTX must be a number*;
  `per-gpu 5` → *takes no arguments*; `frobnicate` → *unknown argument*; no argument → usage.
- **`clients_on_port`'s `awk '{print $4}'` is correct.** Verified on the live box: with a `state`
  filter `ss` **omits the State column**, so the columns are `Recv-Q Send-Q Local Peer` and `$4` is
  the peer — `0 0 192.168.4.71:22 192.168.4.34:54609`. The test phase's fixture was right and a
  fixture built from the unfiltered form would have "found" a bug that is not there.
- **`ufw status` as a non-root user** prints `ERROR: You need to be root to run this script` and
  exits 1 (verified on the box), so `ufw_port_state` returns 4 → UNKNOWN → refuses. Dropping the
  `EUID` guard was correct.
- **`ufw_line_covers` on the shapes beyond the test phase's 18**: port ranges (`8000:8100/tcp`),
  `ALLOW FWD`, `Anywhere/udp`, a comment containing the word `ALLOW` on an ALLOW row **and** on a
  DENY row — all four correct. Only `LIMIT` (sm-A6) and v6-only (sm-A7) fail.
- **`[N/A]` and `[Unknown Error]` are handled safely** by `vram_all_idle` — the handoff's specific
  worry is not the hole; the hole is an *absent* reading (sm-A5).
- **`nvidia-smi` writes its errors to stdout on this box**, measured (`No devices were found` rc 6;
  `Field "…" is not a valid field to query.` rc 2), which is why those degrade safely.
- **`systemctl show <nonexistent> -p ActiveState --value` answers `inactive`, rc 0** (measured) — so
  `unit_state` genuinely cannot distinguish "absent" from "stopped". Every call site that matters is
  paired with `is-enabled` (which does say `not-found`, rc 4) or with an `-f` test on the unit file,
  so the ambiguity is contained. `-p UnitFileState --value` returns the empty string with rc 0 for
  the same unit; the script does not read that property.
- **`is-enabled` exits 0 for `static` and `indirect`** (measured: `systemd-journald.service` →
  `static` rc 0; `llama-server@.service` → `indirect` rc 0). `detect_mode` would count either as
  enabled. Not reachable today — the generated split unit carries `[Install] WantedBy=`, and only
  instances are queried — but it is a second, quieter form of sm-A4 if the unit text ever loses its
  `[Install]` section.
- **The env-file fallback in `pg_instances` really is reachable with `nvidia-smi` missing.** Measured
  on macOS bash 3.2 **and** on the box's bash 5.3.9: `errexit` does not abort the command
  substitution that `pg_units` wraps it in, so the `127` from the missing binary does not kill the
  function before the fallback. (Called *directly* under `set -e` it would; it never is.)
- **What `per-gpu` restores matches §8 byte for byte.** Live `0.env` re-read this session:
  `PORT=8080 / MODEL=/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf / ALIAS=qwen3.6-27b / CTX=163840 /
  FA=auto / SPEC=none`, mode `0644 root:root` — the same six keys in the same order, and the
  script's `chmod 644` matches what is on disk.
- **The corrected §6 arithmetic reproduces.** The script's projection prints
  `31123 + 20480 + 1200 = 52803 MiB of 65536`, matching the corrected table's 51.6 GiB / 80 %.
- **The box is untouched.** `/etc/systemd/system/` still holds only `llama-server@.service` and
  `ai-dashboard.service`; no `llama-split.service`, no `llama-server@.service.d/`, no `split.env`;
  `llama-server@0/1`, `ai-dashboard` and `gpu-fan-control` all `loaded active running`; 8080 and
  8081 both answer `/health` 200.

---

## What I could not verify, and why

- **Anything needing a real boot.** The ordering-cycle question (`journalctl -b | grep "ordering
  cycle"` empty in each mode) and `systemd-analyze verify /etc/systemd/system/llama-split.service`
  both need the unit written to the box, which this phase is forbidden from doing. The one-way
  `After=` reads correctly against `systemd.unit(5)` and against the 2026-08-28 incident, but reading
  is not proof — and sm-A3 adds a new reason to check it, since the `Conflicts=`/`After=` lists are
  generated from a card enumeration that may be short at the moment of writing.
- **Whether `nvidia-smi` writes an *NVML initialisation* failure to stdout or stderr.** Every error I
  could induce read-only (`-i 7`, a bogus field) went to stdout, which is the safe column. A
  driver/library version mismatch or a wedged NVML could not be induced on a live box, so the
  stderr rows in sm-A5's table are demonstrated with a stub rather than with the real binary.
- **The real `/health` race in sm-A10.** It needs a squatter on 8080 at the moment of a real switch.
  The mechanism (`Type=exec` → active before bind; `systemctl start` returns before the bind fails;
  200/401 accepted with no identity check; first iteration answers at `t=0`) is each verified
  separately, but the whole has not been run.
- **Whether the shipped dashboard renders GPU 1 as an em dash in split mode.** `dashboard/SPEC.md`
  carries the ruling; the component tests still assert the old `gpu.index === serving.instance` join,
  so the caveat's behavioural claim is very likely still true — but `dashboard/` was out of bounds
  beyond reading, and nothing was run. Only sm-A15's claim about §4 being *ruled* is measured.
- **Two-run concurrency (sm-A13) was reasoned, not raced.** The harness's stub `systemctl` serialises
  state through one file and cannot model a genuine interleaving.
- **Version gap, unchanged from the test phase.** Every scenario above ran under macOS bash 3.2; the
  box is 5.3.9. The one `set -e` behaviour any of these findings depends on (errexit inside a command
  substitution) was checked on **both** and is identical.
