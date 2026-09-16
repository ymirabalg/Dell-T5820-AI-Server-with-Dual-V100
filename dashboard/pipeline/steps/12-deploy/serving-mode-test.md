# `serving-mode.sh` — TEST phase

Tested 2026-09-15 against the build at `4a2f47a`. **11 defects found, all 11 fixed.** The
script is `shellcheck` clean at `-S style`, `bash -n` clean under macOS bash 3.2 **and**
under the box's own bash 5.3.9, and passes **104/104** harness assertions. **Nothing was
written to the box**; it is still serving on 8080/8081/8090 with no `llama-split.service`,
no drop-in and no `split.env`.

The harness lives in the session scratchpad (`mkstubs.sh`, `world.sh`, `run.sh`,
`fidelity.sh`, `battery.sh`, `rollback.sh`, `idem.sh`, `ufwtest.sh`, `mkcopy.sh`).

---

## 1. A `--dry-run` that is not dry — **NONE FOUND for writes; TWO print-vs-do divergences found and fixed**

The 12a lesson was taken literally. Every subcommand was run twice against two
byte-identical fabricated boxes: once `--dry-run` under stubs where every mutating
command (`systemctl daemon-reload/enable/disable/start/stop/restart`, `cp`, `rm`,
`chmod`, `mkdir`, `mv`, `install`, `tee`, `dd`, `ln`, `truncate`, `docker`) **logs a
violation and exits 97 if it is invoked for real**, and once for real under stubs that
*log* every mutating command. Then three assertions per case:

| assertion | what it catches |
|---|---|
| no violation, and the whole tree byte-identical before/after | an exec'd mutation **and** a shell redirection, which no `PATH` stub can see — so `printf … > "$path"` is covered too. `TMPDIR` points inside the tree, so a stray `mktemp` shows up as well |
| the argv the dry run **printed** == the argv the real run **executed** | the 12a failure class exactly |
| the file content the dry run **printed** == the bytes the real run **wrote** | a printer that summarises instead of showing |

**Seven cases, 35 assertions, all pass**: per-gpu→split, split→per-gpu, split→split,
per-gpu→per-gpu, split with an explicit CTX, and both directions from `none` with
`--bootstrap`.

**Every write does go through a printer.** `run`, `ensure_file` and `write_env` are the
only three, `restart_ai_dashboard` carries its own `DRY` branch, `backup_file` /
`restore_backups` / `drop_backups` are reachable only off the non-dry path, and the traps
are armed only when `(( ! DRY ))`. The sibling's bug is not present.

**But two things the dry run PRINTED were not what a real run would DO**, and both are
fixed:

1. ⚠ **A `systemctl disable --now` of a unit that does not exist.** `systemctl is-enabled`
   on a unit systemd has never heard of prints **`not-found`** and exits **4** — verified
   on the box, not assumed — and the test was `!= disabled`, so on a box with no
   `llama-split.service` (which is the box, today) the `per-gpu` path took the *disable*
   branch. A real run gets away with it because step 3 writes the unit and reloads first,
   so by step 6 it reads `disabled`; the dry run does not write it, so the dry run printed
   a `systemctl disable` the real run never issues. Worse, it also set `stopped=1`, which
   in a real run would mean **a full `VRAM_TIMEOUT` wait for a stop that never happened**,
   then a rollback. Rewritten to the positive test: `not-found` → nothing to stop.
2. ⚠ **The VRAM poll was announced unconditionally.** The `DRY` branch printed "would then
   POLL nvidia-smi …" even when nothing would be stopped, where the real run prints
   "nothing was stopped — not waiting on VRAM". Now it honours `stopped`.

The dry run also still runs the preflight for real (read-only), which is what makes
`--dry-run` a usable "would this be refused?".

## 2. The three rollback paths — **all pass, plus two more**

Exercised, not reasoned. Five cases, each asserting the box ends in the mode it started
in with **every** unit's enablement *and* activity restored, the env files byte-restored,
and **no backup temp file left in `TMPDIR`**:

| case | result |
|---|---|
| `/health` never answers, per-gpu → split | rolls back to per-gpu, exit 1 |
| `/health` never answers, split → per-gpu | rolls back to split, exit 1 |
| the cards never free (VRAM timeout) | rolls back, exit 1 |
| **SIGINT** during the health poll | rolls back, exit 1 |
| **SIGTERM** during the health poll | rolls back, exit 1 |

⚠ **The trap reads no `local`** — confirmed by inspection (`PREV_MODE`, `TARGET_MODE`,
`BACKUPS`, `ROLLBACK_ARMED`, `ENV_CHANGED` are all global; `on_exit`'s `local rc=$?` and
`do_rollback`'s `local u` are its own frames) *and* empirically: a `set -u` death inside
the handler would have left the enablement half-restored, and all five cases restore it
completely. The `EXIT` handler preserves the real exit status, and `INT`/`TERM` exit 1.

One deliberate residue confirmed correct: a `llama-split.service` **unit file** created by
a switch that then rolled back is *left on disk*, disabled and inactive. That is the
documented "unit files are mode-independent infrastructure" decision and it is inert.

## 3. The eleven refusals — **all fixture-tested; four more found**

All eleven reproduce, plus the ones the build marked "by construction":

`needs root` (tested against the **shipped** script, both subcommands) · `BOTH modes
enabled` · `per-gpu-partial` · `NEITHER mode enabled` without `--bootstrap` · `CTX must be
a number` · `per-gpu takes no arguments` · `unknown argument` · binary missing · template
missing · model missing · bad GGUF magic · **build does not know the architecture** ·
`strings` missing → unknown · library missing → unknown · `nvidia-smi` missing → unknown ·
**only one card for split** · **a foreign process holding a card** (pid in a user slice) ·
api key missing · model unreadable · **`yorman` cannot read the model** (the `runuser`
branch, stubbed so root can read it and the service user cannot — the case the check
exists for) · ufw unreadable → unknown · ufw has no rule.

**The twelfth, and three more:**

4. ⚠ **`serving-mode.sh split per-gpu` ran `per-gpu`.** Both words matched the subcommand
   arm and the **last one silently won**, banner and all. On a live box that is a mode
   switch nobody asked for, arrived at by a typo. Now: *"two subcommands given ('split'
   then 'per-gpu') — say exactly one"*.
5. **`split 163840 262144` took the first and dropped the rest without a word.** Now
   *"too many arguments"*.
6. **`split 0` was accepted** and printed `context: 0` with a 0 MiB KV projection — while
   llama.cpp reads `--ctx-size 0` as *the model's own training window*, i.e. 262144 here.
   A number the script models wrongly is worse than a refusal: now `CTX must be at least 256`.
7. **ufw: "a rule line could not be parsed"** → UNKNOWN, and unknown refuses (see below).

### ⚠ The `ufw status` parser was wrong in nine distinct ways

The build flagged it unverified. It could not be checked by running `ufw status` (root),
so it was checked against **ufw 0.36.2's own formatter on the box** —
`/usr/lib/python3/dist-packages/ufw/backend_iptables.py`, `get_status()`, which builds
every row as

```
"%-26s %-12s%-26s%s%s\n" % (To, " ".join([ACTION, dir]), From, attribs, comment)
```

where `To` is `[<dst addr>] [<port|range|list>[/proto]] [(v6)] [on <iface>]`, and which
**returns the single line `Status: inactive` with no rule table at all** when the firewall
is down. 18 fixtures built from that source; the shipped parser failed 9:

| shape | shipped | now |
|---|---|---|
| `192.168.4.71 8080/tcp  ALLOW …` (destination-qualified) | **"NO rule covers 8080/tcp" → refuses the switch** | covered |
| `192.168.4.71 8080/tcp on eno1  ALLOW IN …` | false "no rule" | covered |
| `80,443,8080/tcp  ALLOW …` (multiport) | false "no rule" | covered |
| `Anywhere  ALLOW …` (every port) | false "no rule" | covered |
| `192.168.4.71  ALLOW …` (address only = every port) | false "no rule" | covered |
| `8080/udp  ALLOW …` | **false TICK — said tcp was covered** | not covered |
| `8080/tcp  ALLOW OUT …` | **false TICK** | not covered |
| `Nginx Full  ALLOW …` (app profile) | reported as "no rule" | **unknown → refuses** |
| `Status: inactive` | **"NO rule covers 8080/tcp" → refuses** | "ufw is NOT enforcing" (warning) |

The last one is the important one. ⚠ **The build's own stated judgement — "ufw not
enforcing is a warning, not a refusal" — was unreachable code.** Return 2 was only emitted
*after* a rule had been matched, and no rule can ever be matched while ufw is down,
because `ufw status` prints no table. On a box in the state this one was in from
2026-08-27 to 2026-09-04, `serving-mode.sh split` would have refused with
*"NO rule covers 8080/tcp"* — a false statement about the rule set, hiding the true one.

Rewritten as `ufw_port_state` (status + dispatch) plus `ufw_line_covers` (one row, unit
testable): direction-aware (`ALLOW OUT`/`FWD` do not open a listening port), proto-aware,
handles ranges, comma lists, `(v6)`, `on <iface>`, destination qualification and
address-only rules — and returns a **new code 5 for "a row I could not parse, and nothing
matched"**, which the preflight treats as UNKNOWN and refuses on, rather than guessing in
either direction. The `(( EUID == 0 ))` guard was dropped: `ufw status` as a non-root user
prints *"ERROR: You need to be root to run this script"* and exits 1 (verified on the
box), so the command answers that itself, and the guard was a second, untestable copy of
the same rule that also made the parser impossible to exercise.

## 4. `detect_mode`, `status`, and output-vs-exit-status

**Every place both a command's output and its exit status are consumed was checked**, and
each was verified against the real box where the answer is systemd's:

| site | verdict |
|---|---|
| `unit_enabled_state` | correct — captures first, defaults after. ⚠ **but the default was `disabled`**, which is a tick where the truth is unreadable. systemd always says *something* (`enabled`/`disabled`/`not-found`), so an empty answer means `systemctl` itself failed. Changed to **`unknown`** |
| `detect_mode` | correct: `--quiet` + exit status only, stdout **and** stderr redirected so nothing systemd prints can be read back as a mode name |
| `build_knows_arch` | `rc=$?` in the `else` of the `if/elif` really is that function's status — verified by three separate fixtures giving *does-not-know* / *no `strings`* / *no library* distinctly |
| `gguf_arch`, `health_code`, `clients_on_port`, `gpu_busy_procs`, `gpu_count`, `CVD`, `stat`, the `nvidia-smi` sum | all `|| true` / regex-validated; all exercised |
| `env_get` | ⚠ **returned 0 with empty output when the KEY was absent** (only the unreadable-*file* case returned 1), so every `$(env_get … \|\| echo '?')` printed `ctx=` — a blank that reads as a value. Now returns 1 when the key is missing |
| `idx="$(gpu_indices)"` under `set -e` + `pipefail` with `nvidia-smi` absent | does **not** abort — confirmed identical on macOS bash 3.2 and the box's bash 5.3.9, so the env-file fallback really is reachable |

**`status` reports the disagreement in all four combinations**, each fixtured with the
right exit code: agree/per-gpu (0), agree/split (0), per-gpu enabled + split running (2),
split enabled + per-gpu running (2), per-gpu enabled + nothing running (2), nothing
enabled + split running (2, and it says a reboot comes back serving *nothing*), plus
`none` (2), `both` (2), `per-gpu-partial` (2) and `nvidia-smi` missing (2).

**Run against the live box, read-only** (`ssh ai-server 'bash -s -- status' < serving-mode.sh`):
exit 0, both endpoints 200, both compute PIDs correctly resolved through
`/proc/<pid>/cgroup` to `llama-server@0/1.service`, ufw honestly `unknown (needs root)`.
`split --dry-run` on the box refuses with *needs root*, as designed.

## 5. The two flag decisions — **both RE-DERIVED from source on the box; both hold**

Read myself from `~/llama.cpp` at the build's own commit `01818e4`, not taken from the
build notes. The model's geometry was read from the **GGUF header of the actual file** with
a hand-written parser (gguf-py needs numpy, which the box does not have).

**`--cache-reuse` omitted — CORRECT.** The chain, every link checked:

- `tools/server/server-context.cpp:1174` — `if (!llama_memory_can_shift(llama_get_memory(ctx_tgt)))`
  then, at 1180-1183, `params_base.n_cache_reuse = 0` and the log line
  *"cache_reuse is not supported by this context, it will be disabled"*.
- `src/llama-kv-cache-iswa.cpp:254-257` — `get_can_shift()` is
  `kv_base->get_can_shift() && kv_swa->get_can_shift() && kv_base->get_size() == kv_swa->get_size()`.
  Verbatim as the build claimed.
- `src/llama-kv-cache-iswa.cpp:73` — `size_swa = GGML_PAD(min(size_base, hparams.n_swa*(unified ? n_seq_max : 1) + n_ubatch), 256)`.
- From the file: `gemma4.attention.sliding_window = 1024`; the unit passes `--parallel 1`
  and no `-ub`, and `common.h:444` has `n_ubatch = 512`. So **1536 cells against 262144**.
  Unequal, `can_shift` false, flag silently disabled. `--swa-full` (default false,
  `common.h:562`) is the only way to equalise, and it would make 50 SWA layers full size.
- `llama-model.cpp:2376-2410` confirms a model with `swa_type != LLAMA_SWA_TYPE_NONE`
  gets `llama_kv_cache_iswa`, and the header's `sliding_window_pattern` is 5 SWA : 1
  global across 60 blocks, so Gemma 4 31B is squarely in that path.

There is also a **per-slot** copy of the same test the build did not mention
(`server-context.cpp:3135-3140`, `can_cache_reuse = llama_memory_can_shift(...) && !has_mtmd`),
which logs *"cache reuse is not supported - ignoring n_cache_reuse"*. Either line in the
load log is the falsification to watch for on the first real run.

**`--cache-ram 24576` — CORRECT, and the corrected arithmetic makes it *more* necessary.**
`tools/server/server-task.cpp:1728-1731`: `if (limit_size > 0 && state_size_new > limit_size)`
→ *"prompt state size … exceeds cache size limit … skipping"*, `return nullptr`. Not
evicted — **skipped**, exactly as the build said. `server-task.h:609` maps the MiB flag to
bytes (and `-1` to "no limit"). A full-window state is 20480 MiB of global KV + ~1200 MiB
of SWA ≈ **21680 MiB**, which 24576 covers with ~2.9 GiB spare and 12288 does not. The
build's "12288 holds no state longer than ~157k tokens" is ~**142k** once the SWA term is
counted. One nuance worth knowing: on a `bad_alloc` the server **halves the limit itself**
(`server-task.cpp:1767`, `limit_size = max(1, 0.4*size())`), so an over-large value
degrades rather than crashes.

## 6. Idempotence — **proved, twice each**

The same switch run twice against the *same* fabricated box, asserting the second run
leaves `/etc` byte-identical, issues **no `daemon-reload`** (which would revoke the
dashboard container's GPU access for nothing), **no `ai-dashboard` restart**, **does not
rewrite the env file** (it says "already says exactly this"), and **leaves no backup temp
behind**. All four pass: `split` twice, `per-gpu` twice, `split` while already split,
`per-gpu` while already per-gpu. The second run issues only the idempotent
`systemctl enable` + `start` no-ops.

One real bug found here: `drop_backups` ran a literal **`rm -f ''`** every successful
switch — `BACKUPS` ends in a newline and `<<<` adds another, so the last `read` yields an
empty `src`. Harmless with GNU `rm`, but it is an unvalidated path handed to `rm` and
`restore_backups` already guarded the same loop. Guarded.

## 7. What it writes to the box, against `SERVING-MODES.md` §8 — **exact**

The `per-gpu` restore was diffed against the **live** `/etc/llama-server/{0,1}.env`:

```
0.env: IDENTICAL to the live box
1.env: IDENTICAL to the live box
```

model `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf`, alias `qwen3.6-27b`, **ctx 163840**,
`FA=auto`, `SPEC=none`, ports 8080 / 8081 — §8 exactly, same six keys in the same order as
`serve-llm.sh` writes. So `sudo ./serving-mode.sh per-gpu` on the box as it stands today
rewrites nothing and restarts nothing.

`split.env` is `PORT=8080 / gemma-4-31B-it-Q8_0.gguf / gemma-4-31b / 262144 / auto / none`.

---

## Disagreements with `SERVING-MODES.md` (not edited, as instructed)

⚠ **§6's "SWA KV — 0.78 GiB in total, fixed" is low by ~50 %.** The real figure is **1200
MiB (1.17 GiB)**. 0.78 GiB is 1024 cells × 800 KiB; llama.cpp pads the SWA cache to
`n_swa + n_ubatch` = 1536 cells, not `n_swa`. The rest of §6 checks out against the file
byte for byte — `gemma4`, 60 blocks, `sliding_window 1024`, pattern 5 SWA : 1 global (50 /
10), global `head_count_kv 4` at `key/value_length 512` → 10 × 4 × (512+512) × 2 B = **80
KiB/token**, SWA `head_count_kv 16` at 256. The script's `SPLIT_SWA_MIB` now carries 1200
with the derivation, so its projection reads **52803 MiB of 65536 (81 %)** rather than
52402. Advisory only; nothing about the decision changes. ⚠ Re-derive if `-ub` is ever
passed to the split unit.

## Other notes for the owner

- **Also worth reading as a warning:** a mechanical rename of two local variables left one
  line pointing at the old name. `shellcheck` was **clean** and `bash -n` passed; the array
  silently stayed empty and every ufw row came back "unparseable". Only the fixture battery
  caught it. `set -u` does not help — appending to an unset name just creates it.
- **The harness needed one change to the script to run at all**, and it is a copy, not the
  shipped file: `need_root() { :; }`, a single line, asserted to be the *only* difference
  on every run (`mkcopy.sh` refuses if the diff exceeds two lines). Everything that does
  not need root — `--help`, `status` in every state, the root refusal itself, every
  argument-validation refusal — was run against the **shipped** script unmodified, on this
  Mac and on the box.
- **Version gap, stated honestly:** the batteries run under macOS bash **3.2**; the box has
  bash **5.3.9**. `bash -n` was run under both and the one `set -e` behaviour this script
  depends on (a failing `var="$(pipeline)"` not aborting) was checked on both and is
  identical. A full re-run on the box would need write access to a scratch prefix there,
  which this phase deliberately did not take.
- **`--dry-run` still cannot know whether the load would OOM.** That is what the `/health`
  poll and the rollback are for, and they are now exercised.
- **Still real-run-only, unchanged from the build's §9:** a reboot in each mode
  (`journalctl -b | grep "ordering cycle"` must be empty), `systemd-analyze verify
  /etc/systemd/system/llama-split.service`, and **checking both cards rather than the sum**
  after a real split load.

---

## Suite

```
$ shellcheck serving-mode.sh                → clean
$ shellcheck -S style serving-mode.sh       → clean
$ bash -n serving-mode.sh                   → clean (macOS bash 3.2)
$ ssh ai-server 'bash -n /dev/stdin'        → clean (box bash 5.3.9)
$ ssh ai-server 'bash -s -- status'         → exit 0, correct against the live box

dry-run fidelity   35 passed, 0 failed   (7 switches x 5 assertions)
refusals + status  42 passed, 0 failed
ufw parser         18 passed, 0 failed
rollback            5 passed, 0 failed
idempotence         4 passed, 0 failed
                  ---------------------
                  104 passed, 0 failed

$ git status --short
 M serving-mode.sh
?? dashboard/pipeline/handoffs/serving-mode-test.md
?? dashboard/pipeline/steps/12-deploy/serving-mode-test.md
```

`serving-mode.sh` is the only file changed: **181 insertions, 43 deletions**. Nothing under
`dashboard/` was touched except this notes file. Nothing was committed, nothing deployed,
and the box is byte-for-byte as it was found — no `llama-split.service`, no
`llama-server@.service.d/`, no `split.env`, `llama-server@0/1`, `ai-dashboard` and
`gpu-fan-control` all active and enabled, 8080/8081 answering 200 and 8090 answering 302.
