# `serving-mode.sh` — build notes

Built 2026-09-15 against `SERVING-MODES.md` (the contract) on branch `dashboard-frontend`.
The script is at the **repo root**: `/Users/yorman/Projects/DevelopmentLabs/ai-server/serving-mode.sh`.
Nothing under `dashboard/` was touched except this file. Nothing was written to the box.

**Status: shellcheck clean, 20/20 harness cases pass, not yet run on the box.** Every claim
below that is marked MEASURED comes from reading the box or the llama.cpp source on it; every
claim marked UNSETTLED needs a real run and is listed in §9.

---

## 1. What each subcommand does

### `sudo ./serving-mode.sh split [CTX]`

1. **`need_root`** — refuses without root, *including* under `--dry-run`. The preflight reads
   `ufw status`, which is root-only; a dry run that skipped its own preflight would not be the
   run it claims to describe. Optional positional `CTX` overrides the context for this switch
   only (it is also the lever for the "deliberately impossible split" acceptance test).
2. **Reads the current mode from systemd**, never from a file: `is-enabled` and `is-active` for
   `llama-split.service` and every `llama-server@N.service`, classified as
   `split` / `per-gpu` / `per-gpu-partial` / `both` / `none`. Refuses from `both`,
   `per-gpu-partial`, and (without `--bootstrap`) `none` — see §6.
3. **Preflight** (§3 below). Refuses on any failure *or any unknown*.
4. **Fit projection** (advisory, split only, explicitly labelled as a sum — see §4).
5. **Writes `llama-split.service` and the template drop-in** if their content would change,
   then `daemon-reload` **and** `systemctl restart ai-dashboard.service` — never one without
   the other (INSTALL-SPEC §11.4). If nothing changed it says so and does not reload.
6. **Names the clients it is about to break**: established peers on the ports that go dark
   (`ss -Htn state established '( sport = :8081 )'`, reverse-resolved where the box knows a
   name), plus a line saying 8081 is deliberately *not* rebound and why (§5 of the spec).
7. **Arms the rollback** (EXIT + INT/TERM traps), then `disable --now` both `llama-server@N`.
8. **Waits for the VRAM to actually free** — polls until no compute process remains on any card
   *and* every card is under `IDLE_MIB` (1024), for up to `VRAM_TIMEOUT` (120 s), then fails
   loudly and rolls back.
9. Writes `/etc/llama-server/split.env` (backing up any previous one).
10. `systemctl enable` then `start` (or `restart` if the env changed).
11. **Polls `/health` and rolls back on failure** — up to `HEALTH_TIMEOUT` (600 s), accepting
    200 or 401, bailing immediately if the unit stops being active. Same shape as
    `serve-llm.sh set-model`.
12. Prints mode, model, context, layout, live ports, dark ports, and **the dashboard caveat**.

### `sudo ./serving-mode.sh per-gpu`

The same sequence in reverse, restoring **exactly** the arrangement in `SERVING-MODES.md` §8
(`Qwen3.6-27B-Q4_K_M.gguf`, alias `qwen3.6-27b`, ctx **163840**, FA `auto`, SPEC `none`, ports
8080/8081) rather than whatever the env files happen to hold. Takes no positional argument and
says so if given one. It also (re)writes the split unit and drop-in, so the mutual exclusion is
installed from either direction.

### `./serving-mode.sh status` (no root needed)

Prints, all asked of the system: **enabled mode**, **running mode**, whether they **agree**,
every unit's `ActiveState` and enablement, every env file's port/ctx/fa/spec/model, which
endpoints answer `/health`, `nvidia-smi` per card plus which unit owns each compute PID, and the
ufw state per port. Exits **0** when enabled and running agree on a real mode, **2** when they
disagree or when a reading could not be taken, **1** on a usage error.

---

## 2. The unit text, and why each directive is there

`/etc/systemd/system/llama-split.service` (generated; `Conflicts=`/`After=` lists are built from
the visible GPU indices, so a third card would be picked up):

| directive | why |
|---|---|
| `After=network-online.target gpu-fan-control.service`, `Wants=network-online.target` | identical to the per-GPU template. Fan control before a 500 W load. |
| `Conflicts=llama-server@0.service llama-server@1.service` | ⚠ the mutual exclusion, in systemd rather than in the script, because the script is not present at boot and systemd is. A second claimant of the same cards does not fail politely; it OOMs. |
| `After=llama-server@0.service llama-server@1.service` | `Conflicts=` carries **no ordering** (systemd.unit(5) explicitly recommends adding one), so without this the stop of the per-GPU instances races the start of this one for the same VRAM. |
| **no** `After=llama-split.service` in the template's half | ⚠ ordering in both directions is an **ordering cycle**, which systemd breaks by *deleting a start job* with nothing on screen but one journal line — the 2026-08-28 incident. The ordering is deliberately one-way. |
| **no** `After=multi-user.target` | it is `WantedBy=` that target; ordering after it is a cycle by construction. |
| `StartLimitIntervalSec=300`, `StartLimitBurst=5` in `[Unit]` | systemd moved them in v229 and *ignores* them in `[Service]`. |
| `Type=exec`, `User=yorman` | as the template. |
| `Environment=CUDA_VISIBLE_DEVICES=0,1` | both cards to one process. The template hardcodes `%i`, which is precisely why split needs its own unit. |
| `EnvironmentFile=/etc/llama-server/split.env` | same grammar as the numbered instances: `PORT/MODEL/ALIAS/CTX/FA/SPEC`. systemd substitutes `${VAR}` but does no arithmetic, so `PORT` is computed in bash. |
| `--split-mode layer` | the whole point; also 9 °C cooler and ~34 % faster at prefill on this box. |
| `--n-gpu-layers 99`, `--parallel 1`, `--cont-batching`, `--flash-attn ${FA}`, `--spec-type ${SPEC}`, `--spec-draft-n-max 6`, `--metrics`, `--host 0.0.0.0`, `--api-key-file`, `--chat-template-kwargs '{"enable_thinking":false}'` | identical to the per-GPU unit, deliberately. Gemma 4 uses the same `enable_thinking` template variable as Qwen and defaults it false, so the flag is correct rather than dead Qwen config. |
| `--cache-ram 24576` | changed from the template's 12288 — reasoning in §5. |
| `Restart=on-failure`, `RestartSec=10` | as the template. |

`/etc/systemd/system/llama-server@.service.d/10-conflicts-split.conf` carries the other half:
`[Unit]` / `Conflicts=llama-split.service`, with no `After=`.

**Why a drop-in and not an edit to `serve-llm.sh`'s heredoc:** a drop-in is *part of* the
template unit as far as systemd is concerned, so the spec's "the same `Conflicts=` back from the
template" is satisfied — but it takes effect the first time `serving-mode.sh` runs, with nobody
having to remember to re-run `serve-llm.sh install` (which would also rewrite the unit and
reload systemd), and a later re-run of that install cannot quietly drop the line again.
`serve-llm.sh` was left untouched.

**Flags deliberately NOT passed, each commented in the unit itself:** `--main-gpu` (layer split
does not use it), `--tensor-split` (a manual ratio is a guess until a real load says which card
is busier — it is the first lever if one card OOMs), `--cache-reuse` (§5), `--mmproj` and any
MTP draft (text-only by design; MTP measured a 20× wall-clock loss on these Volta cards).

---

## 3. Every refusal and its trigger

| refusal | trigger | verified |
|---|---|---|
| `needs root` | `EUID != 0`, on `split`/`per-gpu`, dry or not | harness |
| `BOTH modes are enabled` | `llama-split` and any `llama-server@N` both enabled. Prints the two `systemctl disable` commands that resolve it. | harness |
| `only SOME llama-server@N are enabled` | `per-gpu-partial` — half-configured, no unambiguous rollback target | harness |
| `NEITHER mode is enabled` | `none`, without `--bootstrap`. There is nothing to roll back *to*. | harness |
| `CTX must be a number` / `per-gpu takes no arguments` / `unknown argument` | argument validation | harness |
| `llama-server not executable at …` | `BIN` missing | harness (implicit) |
| `… llama-server@.service is missing` | template absent — `serve-llm.sh install` has not run | harness (implicit) |
| `model file does not exist` / `is not readable` / `not a GGUF (bad magic)` / `yorman cannot read …` | the last one matters: the service runs as `yorman`, so root being able to read the file proves nothing (copied from `set-model`) | harness |
| `architecture … could not be read from its GGUF header` → **unknown** | `strings` missing, or header unreadable | harness |
| `cannot search …/libllama.so* for '<arch>'` → **unknown** | no library / no `strings` | harness |
| `this build does NOT know architecture '<arch>'` | arch absent from `libllama.so*` — would fail at load, after the wait is already paid | by construction |
| `nvidia-smi is missing` → **unknown** | GPU count, idleness and VRAM cannot be evaluated | harness |
| `no GPUs visible` / `split mode needs 2 cards` | fewer cards than the mode requires | by construction |
| `a card is held by pid N (comm) in <unit>` | a compute process that is **not** one of this script's units. "Idle" is checked as *held by nothing except the mode we are about to stop* — the cards are legitimately busy at preflight time. | harness (pid in a user slice) |
| `no api key at …` / `yorman cannot read …` | key missing or wrong mode | harness |
| `ufw: NO rule covers <port>/tcp` | no rule covering the port | harness |
| `ufw: cannot read the rule set` → **unknown** | not root, or ufw absent | harness |
| `the cards did not free` | VRAM poll timeout → **rolls back** | harness |
| `no healthy answer from <unit> on port <p>` | `/health` timeout, or the unit died → **rolls back** | harness |

⚠ **Unknown refuses; it is never a tick.** Every un-evaluable check prints `? … — UNKNOWN, and
unknown refuses` and counts toward the failure total. The preflight runs *all* checks before
refusing, so one run names every problem rather than only the first.

**ufw not enforcing is a warning, not a refusal** — and that is a judgement, recorded here for
review. The rule existing is checked and refused on; `ENABLED=no` is loud but does not block,
because refusing to switch modes would not close a port that is already open in the mode the box
is in. The warning repeats the `ufw show added` / port-22 lesson from `CLAUDE.md`.

---

## 4. The rollback path

Globals only — `PREV_MODE`, `TARGET_MODE`, `BACKUPS`, `ROLLBACK_ARMED` — because an `EXIT`
handler fires after the enclosing function has returned and `set -u` would kill a handler that
read a `local` (the bug this repo has already fixed twice).

- **Armed before anything is stopped**, disarmed only after every `/health` poll succeeds.
- `trap on_exit EXIT` preserves a real failure's exit status; `trap on_signal INT TERM` rolls
  back and exits **1**, because a Ctrl-C part way through a switch is *not* a successful stop
  (the inverse of `gpu-fan-control`'s service-SIGTERM reasoning, and noted as such in the code).
- Rollback: restore every backed-up env file (or delete one that did not exist before) →
  `disable --now` the target's units → `enable --now` the previous mode's units → say so.
- If `PREV_MODE == TARGET_MODE` (re-asserting the same mode) it never disables anything; it just
  restores the config and restarts, like `set-model`.
- With `--bootstrap` there is no previous mode; the script says the box is **not** serving and
  gives the command to bring one up.
- **The unit files are not rolled back, on purpose.** They are mode-independent infrastructure
  (the exclusion) and are inert while `llama-split` is disabled.

Exercised in the harness: a failed `/health`, a VRAM-wait timeout, and a SIGINT during the health
poll all rolled back to per-gpu, in the right order, with the env file restored.

---

## 5. The two decisions from spec §7

### `--cache-reuse`: **NOT passed.** It is architecturally dead on Gemma 4 too — for a different reason than on Qwen.

MEASURED, from the source of the exact build on the box (`0.1.1-dev`, commit `01818e4`):

- `tools/server/server-context.cpp:1174` — if `!llama_memory_can_shift(...)` then
  `n_cache_reuse = 0` and it logs
  `cache_reuse is not supported by this context, it will be disabled`.
- Gemma 4 is **interleaved sliding-window**, so the memory is `llama_kv_cache_iswa`, and
  `src/llama-kv-cache-iswa.cpp:253`:
  `get_can_shift() = kv_base->get_can_shift() && kv_swa->get_can_shift() && kv_base->get_size() == kv_swa->get_size()`.
- `src/llama-kv-cache-iswa.cpp:73` sizes the SWA cache as
  `GGML_PAD(min(size_base, n_swa + n_ubatch), 256)` — **1536 cells** (window 1024 + ubatch 512)
  against a base of 262144. The sizes differ, so `can_shift` is false.

So the flag would be accepted and silently disabled, exactly as it was on Qwen for eight days.
The *only* way to equalise the sizes is `--swa-full`, which would make the SWA cache full-size on
50 layers — hundreds of GiB. **Plain prefix caching is untouched** (on by default, no flag) and is
the one that actually earns its keep. The reasoning is in the unit file, so the next reader does
not re-litigate it. The falsification is one line of the load log: if it ever *does* say nothing
about `cache_reuse`, the flag is worth re-adding.

Note this is not the spec's "check the load log rather than assuming" — I could not start the
model (no write access to the box), so I read the code path instead and named the log line the
owner should check on the first real run.

### `--cache-ram`: **24576 MiB**, up from the template's 12288.

MEASURED, `tools/server/server-task.cpp:1708` (`server_prompt_cache::alloc`): a state larger than
the limit is **not evicted, it is skipped outright** —
`prompt state size %.3f MiB exceeds cache size limit %.3f MiB, skipping`. At 80 KiB/token a
12288 MiB cap can hold no state longer than ~157k tokens, so on the 262144 window the host cache
would be dead weight precisely in the mode whose value *is* the window. A full-window state is
~20.5 GiB, which 24576 covers.

24576 is also **the same total the box already reserves in per-gpu mode** (2 × 12288), so the
host-RAM ceiling does not move when the mode does. It is a cap, not a reservation; the box has
61 GiB with ~50 GiB available while both instances are loaded. If the owner wants this measured
rather than reasoned, the test is: run a full-window conversation, evict it, and check whether
the journal carries the "exceeds cache size limit" line.

---

## 6. What `--dry-run` prints, and its fidelity

Every mutating action goes through one of three printers, so the printed intent *is* the thing
that would run:

- `run <argv>` → `→ would run: systemctl disable --now llama-server@0.service` (the literal argv).
- `ensure_file` / `write_env` → `→ would write <path>:` followed by **the complete file content**,
  indented — not a summary. (`serve-llm.sh` prints a one-line summary; this was made stricter
  because step 11 found a dry run that printed something other than what it ran.)
- The two polls print their own parameters: the VRAM wait prints its threshold and timeout; the
  health poll prints the URL, interval, timeout, accepted codes and the mode it would roll back
  to.

The preflight is **read-only and runs for real** in a dry run, so `--dry-run` is also the way to
ask "would this switch be refused?". Verified in the harness that a dry run creates no file and
issues no `systemctl` verb other than the read-only ones.

Two honest gaps: a dry run cannot know whether the *load* would OOM (that is what the rollback
is for), and it prints the happy path — the rollback branch is described rather than executed.

---

## 7. How this was tested, given that the box is read-only

`shellcheck` clean (no warnings at any level) and `bash -n` clean.

A harness in the session scratchpad stubs `nvidia-smi`, `systemctl`, `ufw`, `curl`, `ss`,
`runuser`, `getent` and `hostname`, points every path (`ENVDIR`, `UNITDIR`, `KEYFILE`, `BIN`,
`LIBDIR`, `PROC_DIR`, both model paths) at a scratch prefix, and fabricates GGUF headers whose
`general.architecture` reads `gemma4` / `qwen35`. The stubbed `systemctl` mutates a fake state
file, so a full switch really does flip enablement and activity.

**20/20 cases pass**: both dry switches from both starting states, a dry switch with an explicit
CTX, eleven distinct refusals, four `status` states with the right exit codes, and `--help`.
Beyond the pass/fail battery, these full flows were run for real against the fake prefix: split →
success, split again (idempotent: no daemon-reload, no restart), split → per-gpu, a failed
`/health` → rollback, a VRAM timeout → rollback, and a SIGINT mid-switch → rollback.

Two harness-only edits are made by `sed` to a *copy* of the script (never to the script): the
`need_root` body, and the `EUID` guard inside `ufw_port_state`. Both gates were tested separately
against the real script, which refuses correctly.

A seam was added to the script for this: `PROC_DIR` (default `/proc`), used only to resolve a
compute PID's cgroup to its unit. Everything else was already env-overridable in the house style.

---

## 8. Spec silences, and what I decided

1. **The split-mode default context is not stated anywhere in the spec.** I defaulted to
   **262144**, the model's native window, because §6's whole argument for split mode is that it
   fits. It is overridable per run (`sudo ./serving-mode.sh split 163840`) and by
   `SPLIT_CTX` in the environment.
2. **The split alias is not stated.** `gemma-4-31b`, matching the house style of the 12B.
3. **Whether `split` should keep an existing `split.env` or rewrite it.** `install` keeps,
   `set-model` rewrites; I chose **rewrite from the recorded defaults**, backing up first and
   printing any field that changes, because "enter split mode" has to mean one known arrangement
   the same way `per-gpu` does. A hand-edited `split.env` will be overwritten — say so if that is
   wrong.
4. **§7 item 3 — which mode is the default at boot if both or neither are enabled — is still
   the owner's, and I did not decide it.** The script refuses from both states with a named
   reason and the exact commands to resolve them; `--bootstrap` is the deliberate escape from
   `none`, and it warns that a failed load then leaves the box dark.
5. **The ufw check tests only that a rule covers the port**, not that its source is the LAN. The
   spec asks only that "the ufw rule for the port exists".
6. **The `ufw status` output format could not be verified** — it needs root, which I do not have.
   The parser is tolerant (it scans `ALLOW` lines for `N/tcp` or `N:M/tcp` in the first column)
   but is the single most likely thing to need a tweak on the first real run.
7. **The §4 dashboard question is untouched**, as instructed. The script prints the caveat, in
   full, on every switch into split *and* in `status` whenever split is what is running.

---

## 9. Spec §9 acceptance — what is checkable now, and what only a real run can settle

| §9 item | state |
|---|---|
| `shellcheck` clean; `--dry-run` writes nothing and prints what it would do | **DONE**, harness-verified, both subcommands, both directions |
| `status` reports a disagreement when one is forced | **DONE**, harness-verified, exit 2 |
| Both switches run to completion from either starting state, **twice in a row** | **REAL RUN ONLY.** Verified against the stubbed box (idempotent second run does no daemon-reload and no restart); the model load itself cannot be faked. |
| A deliberately impossible split **rolls back** | **REAL RUN ONLY.** The rollback machinery is verified three ways in the harness. Force it with e.g. `sudo ./serving-mode.sh split 524288`, which is past the native window and well past 64 GiB of KV. |
| **A reboot in each mode comes back in that mode**, with `journalctl -b \| grep "ordering cycle"` empty | **REAL RUN ONLY, and this is the one that matters.** This class of bug appears only on a real boot — `systemctl restart` can never reproduce it. The script enables/disables rather than starting/stopping, and the `After=` is one-way precisely to avoid a cycle, but neither is proof until a boot says so. |
| The dashboard's behaviour in split mode matches whichever §4 option was chosen | **BLOCKED** on the owner's §4 decision. |

Two further real-run checks worth doing the first time, neither of which I could perform:

- `systemd-analyze verify /etc/systemd/system/llama-split.service` after the first write.
- **Check BOTH cards, never the sum** (spec §6.2). Layer split divides by layer, not by bytes;
  the script prints the sum projection with that warning attached and refuses to pretend it is a
  per-card answer. If one card OOMs, `--tensor-split` is the lever and the unit says so.

---

## 10. Known interactions

- **Re-running `sudo serve-llm.sh install` while split mode is enabled would produce the
  "both enabled" state** — it enables every `llama-server@N` unconditionally. The drop-in
  survives (it is a separate file), the exclusion still holds at runtime, and
  `serving-mode.sh status` reports the inconsistency, but the fix is to run
  `sudo ./serving-mode.sh per-gpu` (or disable `llama-split`) afterwards.
- The **installed** per-GPU template still passes `--cache-reuse 256`; it was removed from
  `serve-llm.sh` on 2026-09-14 but `install` has not been re-run. `serving-mode.sh per-gpu`
  restores the *env values*, not the unit, so it does not change that either way.
- `serve-llm.sh uninstall` removes the template but not `llama-server@.service.d/`. Harmless.
