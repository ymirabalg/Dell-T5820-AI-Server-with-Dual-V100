#!/usr/bin/env bash
#
# serving-mode.sh — switch the box between its two serving arrangements.
#
# Runs ON THE SERVER. Two mutually exclusive ways to use the two V100s. The
# exclusion itself lives in systemd (Conflicts=), not in this script, because the
# script is not present at boot and systemd is.
#
#   per-gpu   TWO llama-server processes, one card each, --split-mode none, ports
#             8080 AND 8081. The default. Restores exactly what SERVING-MODES.md §8
#             records: Qwen3.6-27B Q4_K_M, ctx 163840, on both cards.
#   split     ONE llama-server across BOTH cards, --split-mode layer, port 8080 only.
#             Gemma 4 31B Q8_0 at its native 262144 window. Port 8081 goes dark.
#
#   sudo ./serving-mode.sh split [CTX]   # one model across both cards
#   sudo ./serving-mode.sh per-gpu       # back to one model per card
#   ./serving-mode.sh status             # which mode is ENABLED, which is RUNNING,
#                                        # and whether they agree — disagreement is
#                                        # the state a naive check misses
#
#   --dry-run     print every write and every systemctl call and change nothing.
#                 split/per-gpu still need root even dry: the preflight reads
#                 root-only files (ufw), and a dry run that skipped its own
#                 preflight would not be the run it claims to describe.
#   --bootstrap   allow entering a mode when NEITHER mode is enabled. Refused by
#                 default, because then there is nothing to roll back TO.
#
# A failed switch ROLLS BACK: the previous mode is restarted and the box is left
# serving, never dark. `status` exits 0 when enabled and running agree, 2 when they
# do not, 1 on a usage error.
#
set -euo pipefail

# ------------------------------------------------------------------ where things are
# All overridable so the script can be exercised against a scratch prefix; the
# defaults are the box.
SVC_USER="${SVC_USER:-yorman}"
SVC_HOME="${SVC_HOME:-$(getent passwd "$SVC_USER" 2>/dev/null | cut -d: -f6 || true)}"
SVC_HOME="${SVC_HOME:-/home/${SVC_USER}}"
BIN="${BIN:-${SVC_HOME}/llama.cpp/build/bin/llama-server}"
LIBDIR="${LIBDIR:-${SVC_HOME}/llama.cpp/build/bin}"
ENVDIR="${ENVDIR:-/etc/llama-server}"
KEYFILE="${KEYFILE:-/etc/llama-server.apikey}"
UNITDIR="${UNITDIR:-/etc/systemd/system}"
PROC_DIR="${PROC_DIR:-/proc}"   # only ever moved to exercise this script off-box
TMPL_NAME="llama-server@.service"
SPLIT_NAME="llama-split.service"
TMPL="${UNITDIR}/${TMPL_NAME}"
DROPIN_DIR="${TMPL}.d"
DROPIN="${DROPIN_DIR}/10-conflicts-split.conf"
SPLIT_UNIT="${UNITDIR}/${SPLIT_NAME}"
PORT_BASE="${PORT_BASE:-8080}"

# ------------------------------------------------------- the two arrangements
# split — SERVING-MODES.md §6. Geometry read from the GGUF header, not assumed:
# 60 layers (10 global / 50 sliding-window), global KV 80 KiB per token, SWA KV a
# fixed 0.78 GiB. 262144 is the model's native window and the whole argument for
# split mode: 30.4 GiB of weights + 20.3 GiB of KV = ~51 GiB of the 64 GiB across
# both cards.
SPLIT_MODEL="${SPLIT_MODEL:-${SVC_HOME}/models/gemma-4-31B-it-Q8_0.gguf}"
SPLIT_ALIAS="${SPLIT_ALIAS:-gemma-4-31b}"
SPLIT_CTX="${SPLIT_CTX:-262144}"
SPLIT_FA="${SPLIT_FA:-auto}"
SPLIT_SPEC="${SPLIT_SPEC:-none}"
# Host-RAM prompt cache for the ONE split process, in MiB. Deliberately NOT the
# template's 12288, and the reason is arithmetic rather than generosity: a cached
# state larger than this limit is not evicted, it is SKIPPED outright —
# server_prompt_cache::alloc() logs "prompt state size N MiB exceeds cache size
# limit" and returns nullptr. At 80 KiB/token a 12288 MiB cap can hold no state
# longer than ~157k tokens, so on a 262144 window the cache would go dead exactly
# where this mode's value is. 24576 covers a full-window state (~20.5 GiB) and is
# the SAME total the box already reserves in per-gpu mode (2 x 12288), so the
# host-RAM ceiling does not move when the mode does. It is a cap, not a
# reservation: 61 GiB installed, ~50 GiB available with both instances loaded.
SPLIT_CACHE_RAM="${SPLIT_CACHE_RAM:-24576}"
# Per-token global KV, in KiB, used only for the advisory fit projection below and
# only trusted for the architecture it was measured on.
SPLIT_KV_KIB_PER_TOK="${SPLIT_KV_KIB_PER_TOK:-80}"
SPLIT_SWA_MIB="${SPLIT_SWA_MIB:-799}"          # fixed, does not grow with context
SPLIT_ARCH_EXPECT="${SPLIT_ARCH_EXPECT:-gemma4}"

# per-gpu — SERVING-MODES.md §8, verified on the box 2026-09-14. This is restored
# EXACTLY, not read back from the env files: the env files are what a previous
# experiment left behind, and "back to per-gpu" has to mean one known arrangement.
PG_MODEL="${PG_MODEL:-${SVC_HOME}/models/Qwen3.6-27B-Q4_K_M.gguf}"
PG_ALIAS="${PG_ALIAS:-qwen3.6-27b}"
PG_CTX="${PG_CTX:-163840}"
PG_FA="${PG_FA:-auto}"
PG_SPEC="${PG_SPEC:-none}"

SLOTS="${SLOTS:-1}"
SPEC_N_MAX="${SPEC_N_MAX:-6}"
# A card with no compute process on it still reports a little memory in use; below
# this it counts as free. The primary signal is that no compute app remains at all.
IDLE_MIB="${IDLE_MIB:-1024}"
VRAM_TIMEOUT="${VRAM_TIMEOUT:-120}"            # seconds to wait for the cards to empty
# 32.64 GB off disk and onto two cards. set-model allows 300 s for a 19 GB model on
# one card; this is the same budget scaled for twice the bytes and a cold page cache.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-600}"

DRY=0
BOOTSTRAP=0

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '3,31p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
run()   { if (( DRY )); then printf '  \033[35m→\033[0m would run: %s\n' "$*"; else "$@"; fi; }
need_root() { (( EUID == 0 )) || die "this subcommand needs root — re-run with sudo (even with --dry-run: the preflight reads root-only files)"; }

# ------------------------------------------------------------------ preflight
# ⚠ A check that cannot be EVALUATED is `unknown`, and unknown REFUSES. It is never
# a tick. This project has shipped the opposite four times; the most recent cost a
# day (root CLAUDE.md: `systemctl is-active ufw` reading green on a firewall that
# was not enforcing, with 8080/8081 open to anything routable for a week).
PF_FAILS=0
pf_ok()   { ok "$*"; }
pf_bad()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; PF_FAILS=$(( PF_FAILS + 1 )); }
pf_unk()  { printf '  \033[33m?\033[0m %s \033[33m— UNKNOWN, and unknown refuses\033[0m\n' "$*" >&2; PF_FAILS=$(( PF_FAILS + 1 )); }

# ------------------------------------------------------------------- inspection
nvidia_ok() { command -v nvidia-smi >/dev/null 2>&1; }
gpu_indices() { nvidia-smi --query-gpu=index --format=csv,noheader 2>/dev/null | tr -d ' '; }
gpu_count() { gpu_indices | grep -c . || true; }

# The per-GPU instance names ARE the CUDA device indices (serve-llm.sh instances()).
# Falls back to the env files so `status` still says something useful on a box where
# nvidia-smi is missing or the driver is wedged — which is itself worth reporting.
pg_instances() {
  local idx
  idx="$(gpu_indices)"
  if [[ -n "$idx" ]]; then printf '%s\n' "$idx"; return 0; fi
  local f b
  for f in "$ENVDIR"/[0-9].env; do
    [[ -e "$f" ]] || continue
    b="$(basename "$f" .env)"; printf '%s\n' "$b"
  done
}

port_of() { echo $(( PORT_BASE + $1 )); }
pg_units() { local i; for i in $(pg_instances); do printf 'llama-server@%s.service\n' "$i"; done; }

# The single source of truth for "which unit serves which port in which mode", so a
# unit can never be polled on another unit's port.
unit_port_pairs() {
  local i
  case "$1" in
    split)   printf '%s\t%s\n' "$SPLIT_NAME" "$(port_of 0)" ;;
    per-gpu) for i in $(pg_instances); do printf 'llama-server@%s.service\t%s\n' "$i" "$(port_of "$i")"; done ;;
  esac
}
units_of_mode() { unit_port_pairs "$1" | cut -f1; }
ports_of_mode() { unit_port_pairs "$1" | cut -f2; }

# ⚠ `systemctl is-enabled X` PRINTS "disabled" and EXITS NON-ZERO for a disabled unit,
# so the obvious `... || echo disabled` prints it twice and every comparison against the
# result then fails. Capture first, default after.
unit_state() { local v; v="$(systemctl show "$1" -p ActiveState --value 2>/dev/null || true)"; echo "${v:-unknown}"; }
unit_enabled_state() { local v; v="$(systemctl is-enabled "$1" 2>/dev/null || true)"; echo "${v:-disabled}"; }

# detect_mode enabled|running -> split | per-gpu | per-gpu-partial | both | none
# Asks systemd, never a file. `both` and `per-gpu-partial` are the states the switch
# refuses from, because neither has an unambiguous "previous mode" to roll back to.
detect_mode() {
  local verb split_n=0 pg_n=0 pg_t=0 u
  case "$1" in
    enabled) verb=is-enabled ;;
    running) verb=is-active ;;
    *) die "detect_mode: bad argument '$1'" ;;
  esac
  # stdout redirected as well as stderr: this function's own output IS the answer, so
  # anything systemctl decides to print would be read back as a mode name.
  if systemctl "$verb" --quiet "$SPLIT_NAME" >/dev/null 2>&1; then split_n=1; fi
  for u in $(pg_units); do
    pg_t=$(( pg_t + 1 ))
    if systemctl "$verb" --quiet "$u" >/dev/null 2>&1; then pg_n=$(( pg_n + 1 )); fi
  done
  if   (( split_n == 1 && pg_n > 0 ));      then echo both
  elif (( split_n == 1 ));                  then echo split
  elif (( pg_n == 0 ));                     then echo none
  elif (( pg_t > 0 && pg_n == pg_t ));      then echo per-gpu
  else                                           echo per-gpu-partial
  fi
}

# Every process holding VRAM, as "pid<TAB>unit<TAB>comm". The unit comes from the
# process's own cgroup line, e.g.
#   0::/system.slice/system-llama\x2dserver.slice/llama-server@0.service
# so a card held by something that is NOT one of our units is named rather than
# waited on forever.
gpu_busy_procs() {
  local pid unit comm
  nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null | tr -d ' ' | while read -r pid; do
    [[ -n "$pid" ]] || continue
    unit="$(sed -n 's#.*/\([^/]*\.service\)$#\1#p' "${PROC_DIR}/${pid}/cgroup" 2>/dev/null | head -1)"
    comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
    printf '%s\t%s\t%s\n' "$pid" "${unit:-no-unit}" "${comm:-?}"
  done
}

vram_used_mib() { nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | tr -d ' '; }

vram_all_idle() {
  local m
  for m in $(vram_used_mib); do
    [[ "$m" =~ ^[0-9]+$ ]] || return 1
    (( m <= IDLE_MIB )) || return 1
  done
  return 0
}

# ufw. `systemctl is-active ufw` is NOT evidence of anything (root CLAUDE.md), and
# `ufw status` needs root, so unprivileged callers get `unknown` and say so rather
# than guessing. Returns: 0 rule present and enforcing, 2 present but ufw disabled,
# 3 no rule covering the port, 4 cannot tell.
ufw_port_state() {
  local port="$1" out line spec lo hi
  command -v ufw >/dev/null 2>&1 || return 4
  (( EUID == 0 )) || return 4
  out="$(ufw status 2>/dev/null)" || return 4
  [[ -n "$out" ]] || return 4
  local found=0
  while read -r line; do
    [[ "$line" == *ALLOW* ]] || continue
    spec="$(awk '{print $1}' <<<"$line")"
    spec="${spec%%/*}"
    if [[ "$spec" =~ ^([0-9]+):([0-9]+)$ ]]; then
      lo="${BASH_REMATCH[1]}"; hi="${BASH_REMATCH[2]}"
      (( port >= lo && port <= hi )) && found=1
    elif [[ "$spec" =~ ^[0-9]+$ ]]; then
      (( port == spec )) && found=1
    fi
  done <<<"$out"
  (( found )) || return 3
  [[ "$(head -1 <<<"$out")" == "Status: active" ]] || return 2
  return 0
}

# The architecture the file itself declares, read from the GGUF header rather than
# inferred from the filename. The key is a string KV at the very front of the file:
# "general.architecture" immediately followed by its value.
gguf_arch() {
  local f="$1"
  command -v strings >/dev/null 2>&1 || return 1
  head -c 4096 "$f" 2>/dev/null | strings -n 3 | grep -A1 -x 'general\.architecture' | tail -1
}

build_knows_arch() {
  local arch="$1" hits
  command -v strings >/dev/null 2>&1 || return 2
  compgen -G "${LIBDIR}/libllama.so*" >/dev/null 2>&1 || return 2
  hits="$(strings "${LIBDIR}"/libllama.so* 2>/dev/null | grep -c -F -x "$arch" || true)"
  (( hits > 0 ))
}

health_code() { curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:${1}/health" 2>/dev/null || true; }

# Established peers on a port, so a switch can say WHO it is about to break instead
# of only which port number stops answering (SERVING-MODES.md §5).
clients_on_port() {
  local port="$1" peer name
  command -v ss >/dev/null 2>&1 || return 0
  ss -Htn state established "( sport = :${port} )" 2>/dev/null | awk '{print $4}' | sed 's/:[0-9]*$//' \
    | sort -u | while read -r peer; do
      [[ -n "$peer" ]] || continue
      name="$(getent hosts "$peer" 2>/dev/null | awk '{print $2}' | head -1 || true)"
      if [[ -n "$name" ]]; then printf '%s (%s)\n' "$peer" "$name"; else printf '%s\n' "$peer"; fi
    done
}

# ⚠⚠ INSTALL-SPEC §11.4. A `systemctl daemon-reload` resets the device allow-list on
# a RUNNING container on this box (cgroup v2 + Docker's systemd cgroup driver): after
# one, nvidia-smi inside the ai-dashboard container fails with "Failed to initialize
# NVML: Unknown Error" while the host's cards are perfectly healthy. Every script here
# that reloads systemd restarts that unit afterwards; this one is no exception.
# It must never fail the run: a box without the dashboard is the ordinary case.
restart_ai_dashboard() {
  local unit=ai-dashboard.service state
  [[ -f "${UNITDIR}/${unit}" ]] || return 0
  state="$(unit_state "$unit")"
  if [[ "$state" != active ]]; then
    info "$unit is ${state:-unknown}, not active — nothing to restart"
    return 0
  fi
  if (( DRY )); then
    printf '  \033[35m→\033[0m would run: systemctl restart %s  (a daemon-reload revokes its container GPU access, §11.4)\n' "$unit"
    return 0
  fi
  if systemctl restart "$unit" 2>/dev/null; then
    ok "restarted $unit — a daemon-reload revokes its container's GPU device access (§11.4)"
  else
    warn "could not restart $unit. systemd was reloaded, so its container has NO GPU"
    warn "     device access until someone restarts it by hand."
  fi
}

# ------------------------------------------------------------------- unit text
split_unit_text() {
  local conflicts
  conflicts="$(pg_units | tr '\n' ' ')"; conflicts="${conflicts% }"
  cat <<EOF
[Unit]
Description=llama-server across ALL GPUs (split mode, one process)
Documentation=file:${SVC_HOME}/serving-mode.sh
After=network-online.target gpu-fan-control.service
Wants=network-online.target
# ⚠ Mutual exclusion belongs HERE, not in serving-mode.sh: the script is not present
# at boot and systemd is. Both modes claim the same cards, and a second claimant does
# not fail politely — it OOMs, or takes a card that is already busy.
Conflicts=${conflicts}
# Conflicts= carries NO ordering of its own (systemd.unit(5) says so and recommends
# exactly this), so without the next line the stop of the per-GPU instances would race
# the start of this one for the same VRAM.
# ⚠ The ordering is deliberately ONE-WAY. The mirror image — After=llama-split.service
# in the template — would be an ordering cycle the moment both are pulled into one
# transaction, and this box has already lost both endpoints at boot to exactly that
# class of bug, silently (root CLAUDE.md, 2026-08-28: "Job llama-server@0.service/start
# deleted to break ordering cycle"). The template's half of the exclusion is a bare
# Conflicts= with no After=. After ANY change here, on a REAL boot:
#     journalctl -b | grep "ordering cycle"
After=${conflicts}
# ⚠ NEVER After=multi-user.target: this unit is WantedBy that target, so ordering it
# after the target is a cycle by construction.
# StartLimit* MUST be in [Unit] — systemd moved them in v229 and silently ignores them
# in [Service], falling back to a 10 s window RestartSec=10 can never fill.
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=exec
User=${SVC_USER}
# Both cards to one process. The per-GPU template hardcodes CUDA_VISIBLE_DEVICES=%i
# and a literal --split-mode none, which is why split mode needs its own unit rather
# than another environment variable.
Environment=CUDA_VISIBLE_DEVICES=${CVD}
EnvironmentFile=${ENVDIR}/split.env
# MODEL/ALIAS/CTX/FA/SPEC/PORT come from the EnvironmentFile, same grammar as the
# numbered instances. systemd substitutes \${VAR} but does NO arithmetic, which is why
# PORT is computed in bash and written into the file.
ExecStart=${BIN} \\
  --model \${MODEL} \\
  --alias \${ALIAS} \\
  --ctx-size \${CTX} \\
  --n-gpu-layers 99 \\
  --split-mode layer \\
  --parallel ${SLOTS} \\
  --cont-batching \\
  --flash-attn \${FA} \\
  --cache-ram ${SPLIT_CACHE_RAM} \\
  --spec-type \${SPEC} \\
  --spec-draft-n-max ${SPEC_N_MAX} \\
  --metrics \\
  --host 0.0.0.0 \\
  --port \${PORT} \\
  --api-key-file ${KEYFILE} \\
  --chat-template-kwargs '{"enable_thinking":false}'
# NOT PASSED, each on purpose:
#   --main-gpu      layer split does not use it (it selects the card for -sm none, or
#                   the KV/intermediate card for -sm row).
#   --tensor-split  a manual ratio is a guess until a real load says which card is the
#                   busier one. It is the FIRST lever to reach for if one card OOMs.
#   --cache-reuse   architecturally dead on this model, and for a DIFFERENT reason than
#                   it was dead on Qwen. Gemma 4 is interleaved sliding-window, so the
#                   memory is llama_kv_cache_iswa, whose get_can_shift() is the AND of
#                   kv_base->get_can_shift(), kv_swa->get_can_shift() and
#                   kv_base->get_size() == kv_swa->get_size(). The SWA cache is sized
#                   pad(min(n_ctx, n_swa + n_ubatch), 256) = 1536 cells against 262144,
#                   so the sizes differ, can_shift is false, and server-context.cpp logs
#                   "cache_reuse is not supported by this context, it will be disabled".
#                   Only --swa-full equalises them, and that would make the SWA cache
#                   full size on 50 layers — hundreds of GiB. Plain PREFIX caching, the
#                   one that matters, is on by default and needs no flag.
#   --mmproj / MTP  the repo carries a vision tower and a multi-token-prediction head;
#                   neither is fetched and neither should be loaded. MTP measured a 20x
#                   WALL-CLOCK loss on these Volta cards while every internal metric
#                   looked healthy.
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

dropin_text() {
  cat <<EOF
[Unit]
# The other half of the mutual exclusion declared in ${SPLIT_NAME}.
#
# Written as a DROP-IN rather than as an edit to serve-llm.sh's heredoc for two
# reasons: the property then holds without anyone re-running \`serve-llm.sh install\`
# (which would also rewrite the unit and reload systemd), and a later re-run of that
# install cannot quietly drop the line again.
#
# ⚠ No After= here, deliberately. ${SPLIT_NAME} carries the ordering for this pair;
# declaring it in both directions is an ordering cycle, and systemd breaks a cycle by
# DELETING one of the start jobs, with nothing on screen except one journal line.
Conflicts=${SPLIT_NAME}
EOF
}

# Write a file only when its content would change, and report honestly either way.
# Returns 0 if it changed (caller then needs a daemon-reload), 1 if it did not.
ensure_file() {  # ensure_file <path> <content>
  local path="$1" content="$2"
  if [[ -f "$path" ]] && [[ "$(cat "$path")" == "$content" ]]; then
    info "$(basename "$path") is already correct — leaving it alone"
    return 1
  fi
  if (( DRY )); then
    printf '  \033[35m→\033[0m would write %s:\n' "$path"
    printf '%s\n' "$content" | sed 's/^/        /'
    return 0
  fi
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  chmod 644 "$path"
  ok "wrote $path"
  return 0
}

# ------------------------------------------------------------------ env files
env_get() {  # env_get <file> <key>
  [[ -r "$1" ]] || return 1
  sed -n "s/^${2}=//p" "$1" | tail -1
}

env_text() {  # env_text <port> <model> <alias> <ctx> <fa> <spec>
  printf 'PORT=%s\nMODEL=%s\nALIAS=%s\nCTX=%s\nFA=%s\nSPEC=%s\n' "$1" "$2" "$3" "$4" "$5" "$6"
}

# ------------------------------------------------- rollback state and handlers
# ⚠ Everything a trap reads must be GLOBAL. An EXIT handler fires after the enclosing
# function has returned, its locals are out of scope, and `set -u` then kills the
# handler PART WAY THROUGH the rollback — this repo has fixed that same bug twice
# (probe_cleanup, and the $HOME-under-sudo one).
PREV_MODE=""
TARGET_MODE=""
BACKUPS=""          # lines of  "<tmpfile>\t<original path>"  or  "NEW\t<path>"
ROLLBACK_ARMED=0
ENV_CHANGED=0

backup_file() {  # backup_file <path>
  local p="$1" t
  if [[ -f "$p" ]]; then
    t="$(mktemp)"; cp "$p" "$t"
    BACKUPS+="${t}"$'\t'"${p}"$'\n'
  else
    BACKUPS+="NEW"$'\t'"${p}"$'\n'
  fi
}

restore_backups() {
  local src dst
  [[ -n "$BACKUPS" ]] || return 0
  while IFS=$'\t' read -r src dst; do
    [[ -n "$dst" ]] || continue
    if [[ "$src" == NEW ]]; then rm -f "$dst"; warn "removed $dst (it did not exist before)"
    else cp "$src" "$dst"; rm -f "$src"; warn "restored $dst"; fi
  done <<<"$BACKUPS"
  BACKUPS=""
}

drop_backups() {
  local src dst
  [[ -n "$BACKUPS" ]] || return 0
  while IFS=$'\t' read -r src dst; do
    [[ "$src" == NEW ]] || rm -f "$src"
  done <<<"$BACKUPS"
  BACKUPS=""
}

# A switch that fails must leave the box SERVING, not dark. Same shape as
# serve-llm.sh's setmodel_rollback, widened from one instance to a whole mode.
do_rollback() {
  (( ROLLBACK_ARMED )) || return 0
  ROLLBACK_ARMED=0
  echo
  bold "ROLLING BACK to ${PREV_MODE:-<nothing>} mode"
  restore_backups
  local u
  if [[ "$PREV_MODE" == "$TARGET_MODE" ]]; then
    # Re-asserting the mode the box was already in: never disable it, just put it
    # back on the configuration it had.
    for u in $(units_of_mode "$TARGET_MODE"); do systemctl restart "$u" || true; done
    warn "${TARGET_MODE} restarted on its previous configuration"
    return 0
  fi
  for u in $(units_of_mode "$TARGET_MODE"); do systemctl disable --now "$u" >/dev/null 2>&1 || true; done
  case "$PREV_MODE" in
    split|per-gpu)
      for u in $(units_of_mode "$PREV_MODE"); do systemctl enable --now "$u" >/dev/null 2>&1 || true; done
      warn "${PREV_MODE} re-enabled and restarted — check: $0 status"
      ;;
    *)
      warn "there was no previous mode to restore (--bootstrap), so the box is NOT serving."
      warn "     Bring one up by hand: sudo $0 per-gpu --bootstrap"
      ;;
  esac
}

on_exit() {
  local rc=$?
  trap - EXIT INT TERM
  if (( rc == 0 )); then drop_backups; exit 0; fi
  do_rollback
  exit "$rc"
}

# A Ctrl-C part way through a switch is NOT a successful stop — unlike
# gpu-fan-control's service SIGTERM, where the same reasoning runs the other way. Roll
# back and exit non-zero so the journal and the shell both record a failed switch.
on_signal() {
  trap - EXIT INT TERM
  warn "interrupted"
  do_rollback
  exit 1
}

# ------------------------------------------------------------------- preflight
preflight() {  # preflight <mode>
  local mode="$1" model arch rc n
  PF_FAILS=0
  case "$mode" in
    split)   model="$SPLIT_MODEL" ;;
    per-gpu) model="$PG_MODEL" ;;
  esac
  bold "Preflight for ${mode} mode"

  # --- the binary
  if [[ -x "$BIN" ]]; then pf_ok "binary: $BIN"; else pf_bad "llama-server not executable at $BIN"; fi

  # --- the per-GPU template must exist for either mode: split Conflicts= with it,
  #     and per-gpu is instantiated from it.
  if [[ -f "$TMPL" ]]; then pf_ok "template: $TMPL"
  else pf_bad "$TMPL is missing — run 'sudo serve-llm.sh install' first"; fi

  # --- the model file
  if [[ ! -e "$model" ]]; then pf_bad "model file does not exist: $model"
  elif [[ ! -r "$model" ]]; then pf_bad "model file is not readable: $model"
  elif [[ "$(head -c 4 "$model")" != "GGUF" ]]; then pf_bad "not a GGUF (bad magic): $model"
  elif ! runuser -u "$SVC_USER" -- test -r "$model" 2>/dev/null; then
    pf_bad "${SVC_USER} cannot read $model — the service runs as ${SVC_USER}, root being able to read it proves nothing"
  else
    pf_ok "model: $model ($(du -h "$model" 2>/dev/null | cut -f1))"
  fi

  # --- the build must know the architecture, and the architecture comes from the
  #     file's own header rather than from its name.
  arch=""
  if [[ -r "$model" ]]; then arch="$(gguf_arch "$model" || true)"; fi
  if [[ -z "$arch" ]]; then
    pf_unk "architecture of $(basename "$model") could not be read from its GGUF header"
  elif build_knows_arch "$arch"; then
    pf_ok "architecture: ${arch} — this build knows it"
    if [[ "$mode" == split && "$arch" != "$SPLIT_ARCH_EXPECT" ]]; then
      warn "the split model declares '${arch}', not '${SPLIT_ARCH_EXPECT}' — the VRAM projection"
      warn "     below is only valid for ${SPLIT_ARCH_EXPECT} and will be skipped"
    fi
  else
    rc=$?
    if (( rc == 2 )); then pf_unk "cannot search ${LIBDIR}/libllama.so* for '${arch}' (no strings, or no library there)"
    else pf_bad "this build does NOT know architecture '${arch}' — it would fail at load, after the wait"; fi
  fi

  # --- the cards
  if ! nvidia_ok; then
    pf_unk "nvidia-smi is missing — GPU count, idleness and VRAM cannot be evaluated"
  else
    n="$(gpu_count)"
    if (( n < 1 )); then pf_bad "no GPUs visible to nvidia-smi"
    elif [[ "$mode" == split ]] && (( n < 2 )); then pf_bad "split mode needs 2 cards; ${n} visible"
    else pf_ok "GPUs: ${n} visible"; fi
    # "Idle" here means "held by nothing except the mode we are about to stop". The
    # cards are BUSY at this point in a normal switch — that is the mode being left.
    local line pid unit comm foreign=0
    while IFS=$'\t' read -r pid unit comm; do
      [[ -n "$pid" ]] || continue
      if [[ "$unit" == llama-server@*.service || "$unit" == "$SPLIT_NAME" ]]; then continue; fi
      pf_bad "a card is held by pid ${pid} (${comm}) in ${unit} — not one of this script's units. Stop it first."
      foreign=1
    done < <(gpu_busy_procs)
    (( foreign )) || pf_ok "cards: held by nothing except this script's own units"
  fi

  # --- the api key
  if [[ ! -s "$KEYFILE" ]]; then
    pf_bad "no api key at $KEYFILE — run 'sudo serve-llm.sh install' (it generates one)"
  elif ! runuser -u "$SVC_USER" -- test -r "$KEYFILE" 2>/dev/null; then
    pf_bad "${SVC_USER} cannot read $KEYFILE (wanted root:${SVC_USER} 0640)"
  else
    pf_ok "api key: present and readable by ${SVC_USER}"
  fi

  # --- ufw, for every port this mode will serve
  local p
  for p in $(ports_of_mode "$mode"); do
    set +e; ufw_port_state "$p"; rc=$?; set -e
    case "$rc" in
      0) pf_ok "ufw: a rule covers ${p}/tcp and ufw IS enforcing" ;;
      2) pf_ok "ufw: a rule covers ${p}/tcp"
         warn "ufw is NOT enforcing (ufw.conf ENABLED=no) — ${p} is open to anything routable,"
         warn "     with only the api key gating inference. Fix: sudo ufw enable — but check"
         warn "     'sudo ufw show added' lists a rule for port 22 FIRST, or you lock SSH out." ;;
      3) pf_bad "ufw: NO rule covers ${p}/tcp — add it before serving on it" ;;
      *) pf_unk "ufw: cannot read the rule set for ${p}/tcp (needs root, and ufw installed)" ;;
    esac
  done

  if (( PF_FAILS > 0 )); then
    die "${PF_FAILS} preflight check(s) failed or could not be evaluated — refusing to half-switch"
  fi
  ok "preflight: all checks evaluated and passed"
}

# Advisory only, and labelled as such. ⚠ Layer split divides by LAYER, not evenly by
# bytes, so this SUM says nothing about whether the BUSIER card fits in 32768 MiB.
# Only a real load answers that; the /health poll and the rollback are what cover it.
split_projection() {
  local ctx="$1" model="$2" arch="$3" wmib kv total tot_vram
  [[ "$arch" == "$SPLIT_ARCH_EXPECT" ]] || { info "no per-token KV figure for arch '${arch}' — skipping the VRAM projection"; return 0; }
  wmib=$(( $(stat -c %s "$model" 2>/dev/null || echo 0) / 1048576 ))
  if (( wmib == 0 )); then
    info "could not size $(basename "$model") — skipping the VRAM projection rather than printing a 0"
    return 0
  fi
  kv=$(( ctx * SPLIT_KV_KIB_PER_TOK / 1024 ))
  total=$(( wmib + kv + SPLIT_SWA_MIB ))
  tot_vram="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null \
    | awk '{s+=$1} END{printf "%d", s}' || true)"
  [[ "$tot_vram" =~ ^[0-9]+$ ]] || tot_vram=0
  info "projected: weights ${wmib} MiB + global KV ${kv} MiB (${SPLIT_KV_KIB_PER_TOK} KiB/token x ${ctx}) + SWA ${SPLIT_SWA_MIB} MiB = ${total} MiB"
  if (( tot_vram > 0 )); then
    info "           against ${tot_vram} MiB across all cards, before compute buffers"
    if (( total >= tot_vram )); then
      warn "the projection does not even fit the SUM of both cards. Expect a failed load"
      warn "     and a rollback. Lower the context: sudo $0 split <CTX>"
    fi
  fi
  warn "⚠ that is a SUM. Layer split divides by LAYER, not evenly by bytes, so it says"
  warn "     NOTHING about whether the busier card fits inside one card's memory, and"
  warn "     compute buffers at a deep prefill are on top and have not been measured on"
  warn "     this architecture. Only the load can answer it — which is what the /health"
  warn "     poll and the rollback below are for. If one card OOMs, --tensor-split is"
  warn "     the lever."
}

dashboard_caveat() {
  echo
  warn "⚠ DASHBOARD: this mode MISREPORTS GPU 1, and it is not cosmetic."
  warn "     The dashboard joins a card to an instance by gpu.index === serving.instance"
  warn "     (its SPEC.md §3.4, §6.2). In split mode that join has no answer: there is ONE"
  warn "     instance and TWO cards, and 'split' is not an index. Left alone, GPU 1's"
  warn "     'served by instance 1' renders as an em dash — which by the dashboard's own"
  warn "     invariant 1 reads as 'this reading could not be taken', when the truth is"
  warn "     'this card IS serving, jointly, and the question does not apply'. That is a"
  warn "     false statement by omission."
  warn "     SERVING-MODES.md §4 lists three honest fixes and the choice is the owner's."
  warn "     Until one is made: do not read GPU 1's served-by line in split mode."
}

# --------------------------------------------------------------------- switch
cmd_switch() {  # cmd_switch <mode> [ctx]
  local mode="$1" ctx_arg="${2:-}"
  local enabled running model alias ctx fa spec u p arch
  need_root
  TARGET_MODE="$mode"

  case "$mode" in
    split)
      if [[ -n "$ctx_arg" ]]; then
        [[ "$ctx_arg" =~ ^[0-9]+$ ]] || die "CTX must be a number — got '${ctx_arg}'"
        SPLIT_CTX="$ctx_arg"
      fi
      model="$SPLIT_MODEL"; alias="$SPLIT_ALIAS"; ctx="$SPLIT_CTX"; fa="$SPLIT_FA"; spec="$SPLIT_SPEC" ;;
    per-gpu)
      [[ -z "$ctx_arg" ]] || die "per-gpu takes no arguments — it restores the arrangement recorded in SERVING-MODES.md §8"
      model="$PG_MODEL"; alias="$PG_ALIAS"; ctx="$PG_CTX"; fa="$PG_FA"; spec="$PG_SPEC" ;;
  esac

  bold "Switching to ${mode} mode$( (( DRY )) && echo '  [DRY RUN — nothing will be written]')"

  # ---- 1. where we are, from systemd rather than from a file
  enabled="$(detect_mode enabled)"
  running="$(detect_mode running)"
  info "enabled now: ${enabled}"
  info "running now: ${running}"
  case "$enabled" in
    both)
      die "BOTH modes are enabled. That cannot be rolled back to, and at boot both would
     claim the same cards. Resolve it by hand, then re-run:
       sudo systemctl disable ${SPLIT_NAME}       # to keep per-gpu
       sudo systemctl disable $(pg_units | tr '\n' ' ')   # to keep split" ;;
    per-gpu-partial)
      die "only SOME llama-server@N are enabled, so the per-gpu mode is half-configured and
     there is no unambiguous mode to roll back to. Enable or disable them all, then re-run." ;;
    none)
      (( BOOTSTRAP )) || die "NEITHER mode is enabled, so a failed switch would have nothing to roll back to
     and the box would be left dark. If that is really the starting state:
       sudo $0 ${mode} --bootstrap" ;;
  esac
  if [[ "$enabled" != "$running" ]]; then
    warn "enabled (${enabled}) and running (${running}) DISAGREE — see '$0 status'."
    warn "     This switch resolves it by enabling and starting ${mode} explicitly."
  fi
  PREV_MODE="$enabled"
  (( BOOTSTRAP )) && [[ "$enabled" == none ]] && warn "--bootstrap: there is NO rollback target. A failed load leaves the box dark."

  # ---- 2. preflight. Refuse rather than half-switch.
  echo
  preflight "$mode"
  if [[ "$mode" == split ]]; then
    arch="$(gguf_arch "$model" || true)"
    echo
    bold "Fit"
    split_projection "$ctx" "$model" "${arch:-unknown}"
  fi

  # ---- 3. the units themselves (and the mutual exclusion)
  echo
  bold "Units"
  local reload=0
  if ensure_file "$SPLIT_UNIT" "$(split_unit_text)"; then reload=1; fi
  if ensure_file "$DROPIN" "$(dropin_text)"; then reload=1; fi
  if (( reload )); then
    run systemctl daemon-reload
    restart_ai_dashboard
  else
    info "no unit changed — no daemon-reload, so the dashboard's container keeps its GPU access"
  fi

  # ---- 4. who is about to lose an endpoint
  echo
  bold "Clients"
  local dark="" pp
  for pp in $(ports_of_other_modes "$mode"); do dark+="${pp} "; done
  if [[ -n "$dark" ]]; then
    for pp in $dark; do
      local peers; peers="$(clients_on_port "$pp" || true)"
      if [[ -n "$peers" ]]; then
        warn "port ${pp} STOPS ANSWERING. Established clients right now:"
        printf '%s\n' "$peers" | sed 's/^/        /'
      else
        warn "port ${pp} STOPS ANSWERING — no established connections at this instant, which"
        warn "     is not the same as no clients: anything pointing at it fails with connection"
        warn "     refused, and nothing explains why."
      fi
    done
    info "${dark% } is NOT rebound to the surviving instance, deliberately: one process"
    info "     cannot serve two ports, and a proxy forwarding one to the other would hand"
    info "     two agents ONE KV cache while looking like two independent endpoints — a"
    info "     correctness failure, not an efficiency one (SERVING-MODES.md §5)."
  else
    info "no port goes dark in this direction"
  fi
  if [[ "$(unit_state ai-dashboard.service)" == active ]]; then
    info "ai-dashboard.service is active and polls these ports — it will notice."
  fi

  # ---- 5. arm the rollback BEFORE touching anything
  if (( ! DRY )); then
    ROLLBACK_ARMED=1
    trap on_exit EXIT
    trap on_signal INT TERM
  fi

  # ---- 6. stop every unit that is not this mode's, and WAIT for the VRAM
  echo
  bold "Stopping the other mode"
  local stopped=0
  for u in $(units_of_other_modes "$mode"); do
    if [[ "$(unit_enabled_state "$u")" != disabled || "$(unit_state "$u")" == active ]]; then
      run systemctl disable --now "$u"
      stopped=1
    else
      info "$u is already disabled and inactive"
    fi
  done
  if (( DRY )); then
    printf '  \033[35m→\033[0m would then POLL nvidia-smi until no compute process remains and every card\n'
    printf '    is under %s MiB, for up to %s s, and FAIL LOUDLY (with a rollback) if it is not.\n' "$IDLE_MIB" "$VRAM_TIMEOUT"
  elif (( stopped )); then
    wait_for_vram
  else
    info "nothing was stopped — not waiting on VRAM"
  fi

  # ---- 7. configuration
  echo
  bold "Configuration"
  ENV_CHANGED=0
  case "$mode" in
    split)
      p="$(port_of 0)"
      write_env "${ENVDIR}/split.env" "$(env_text "$p" "$model" "$alias" "$ctx" "$fa" "$spec")" ;;
    per-gpu)
      local i
      for i in $(pg_instances); do
        p="$(port_of "$i")"
        write_env "${ENVDIR}/${i}.env" "$(env_text "$p" "$model" "$alias" "$ctx" "$fa" "$spec")"
      done ;;
  esac

  # ---- 8. enable AND start. enable, not just start: a mode that does not survive a
  #         reboot is the failure this box has already had, silently.
  echo
  bold "Starting ${mode}"
  while IFS=$'\t' read -r u p; do
    [[ -n "$u" ]] || continue
    run systemctl enable "$u"
    if [[ "$(unit_state "$u")" == active ]] && (( ENV_CHANGED )); then
      run systemctl restart "$u"
    else
      run systemctl start "$u"
    fi
  done < <(unit_port_pairs "$mode")

  # ---- 9. health, and roll back on failure
  echo
  bold "Health"
  while IFS=$'\t' read -r u p; do
    [[ -n "$u" ]] || continue
    if (( DRY )); then
      printf '  \033[35m→\033[0m would poll http://127.0.0.1:%s/health every 2 s for up to %s s,\n' "$p" "$HEALTH_TIMEOUT"
      printf '    accepting 200 or 401, failing at once if %s stops being active, and would\n' "$u"
      printf '    ROLL BACK to %s mode on any failure.\n' "${PREV_MODE:-<nothing>}"
      continue
    fi
    info "loading $(basename "$model") onto the card(s) — give it a minute or several"
    if ! wait_health "$u" "$p"; then
      die "no healthy answer from ${u} on port ${p} — journalctl -u ${u} -n 60"
    fi
    ok "${u} healthy on port ${p}"
  done < <(unit_port_pairs "$mode")

  # ---- 10. disarm and report
  if (( ! DRY )); then
    trap - EXIT INT TERM
    ROLLBACK_ARMED=0
    drop_backups
  fi

  echo
  bold "Now in ${mode} mode"
  info "model:   $(basename "$model")  (alias ${alias})"
  info "context: ${ctx}"
  info "layout:  $( [[ "$mode" == split ]] && echo 'one process, --split-mode layer, CUDA_VISIBLE_DEVICES='"$CVD" || echo 'one process per card, --split-mode none' )"
  local ip; ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  for p in $(ports_of_mode "$mode"); do info "live:    http://${ip:-127.0.0.1}:${p}/v1"; done
  for p in $(ports_of_other_modes "$mode"); do info "dark:    port ${p} (connection refused)"; done
  if [[ "$mode" == split ]]; then dashboard_caveat
  else info "the dashboard's card-to-instance join is meaningful again in this mode"; fi
  echo
  info "verify:  $0 status"
  (( DRY )) && { echo; ok "dry run: nothing above was written or started"; }
  return 0
}

# Ports and units belonging to any mode that is NOT this one.
ports_of_other_modes() { case "$1" in split) local i; for i in $(pg_instances); do [[ "$(port_of "$i")" == "$(port_of 0)" ]] || port_of "$i"; done ;; per-gpu) : ;; esac; }
units_of_other_modes() { case "$1" in split) pg_units ;; per-gpu) printf '%s\n' "$SPLIT_NAME" ;; esac; }

write_env() {  # write_env <path> <content>
  local path="$1" content="$2"
  if [[ -f "$path" ]] && [[ "$(cat "$path")" == "$content" ]]; then
    info "$(basename "$path") already says exactly this — leaving it alone"
    return 0
  fi
  if [[ -f "$path" ]]; then
    info "$(basename "$path"): $(env_get "$path" ALIAS || echo '?') ctx=$(env_get "$path" CTX || echo '?') -> $(sed -n 's/^ALIAS=//p' <<<"$content") ctx=$(sed -n 's/^CTX=//p' <<<"$content")"
  fi
  ENV_CHANGED=1
  if (( DRY )); then
    printf '  \033[35m→\033[0m would write %s:\n' "$path"
    printf '%s\n' "$content" | sed 's/^/        /'
    return 0
  fi
  backup_file "$path"
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  chmod 644 "$path"
  ok "wrote $path"
}

# ⚠ Do not assume a stopped unit has released its cards. The process exits, the driver
# tears the context down asynchronously, and starting the other mode into a card that
# is still 28 GiB full is an OOM with a confusing message. Poll, and fail LOUDLY.
wait_for_vram() {
  local t=0 busy
  info "waiting for the cards to actually free (up to ${VRAM_TIMEOUT}s)"
  while (( t < VRAM_TIMEOUT )); do
    busy="$(gpu_busy_procs || true)"
    if [[ -z "$busy" ]] && vram_all_idle; then
      ok "cards free after ${t}s: $(vram_used_mib | tr '\n' ' ')MiB used"
      return 0
    fi
    sleep 2; t=$(( t + 2 ))
  done
  warn "still busy after ${VRAM_TIMEOUT}s:"
  gpu_busy_procs | sed 's/^/        pid /' || true
  vram_used_mib | sed 's/^/        used MiB: /'
  die "the cards did not free — refusing to start ${TARGET_MODE} into occupied VRAM"
}

# Poll rather than trusting the start: a unit is 'active' the moment it execs, long
# before the weights are on the cards, and it can OOM a minute in.
wait_health() {  # wait_health <unit> <port>
  local u="$1" p="$2" t=0 code
  while (( t < HEALTH_TIMEOUT )); do
    if ! systemctl is-active --quiet "$u"; then
      warn "${u} is no longer active after ${t}s"
      return 1
    fi
    code="$(health_code "$p")"
    if [[ "$code" == 200 || "$code" == 401 ]]; then
      info "answered ${code} after ${t}s"
      return 0
    fi
    sleep 2; t=$(( t + 2 ))
  done
  return 1
}

# --------------------------------------------------------------------- status
cmd_status() {
  local enabled running u st en p code i
  bold "Serving mode"
  enabled="$(detect_mode enabled)"
  running="$(detect_mode running)"
  printf '  enabled: \033[1m%s\033[0m\n' "$enabled"
  printf '  running: \033[1m%s\033[0m\n' "$running"
  local rc=0
  if [[ "$enabled" == "$running" ]]; then
    case "$enabled" in
      none) warn "neither mode is enabled or running — this box is NOT serving"; rc=2 ;;
      both|per-gpu-partial) warn "'${enabled}' is not a mode. Resolve it by hand before switching."; rc=2 ;;
      *) ok "enabled and running agree: ${enabled}" ;;
    esac
  else
    rc=2
    warn "⚠ DISAGREEMENT: ${enabled} is enabled but ${running} is running."
    warn "     A reboot would come back in '${enabled}', not in what you see now. This is the"
    warn "     state a naive is-active check misses. Settle it with: sudo $0 ${enabled}"
    [[ "$enabled" == none ]] && warn "     (nothing is enabled, so a reboot comes back serving NOTHING)"
  fi

  echo
  bold "Units"
  for u in "$SPLIT_NAME" $(pg_units); do
    if [[ ! -f "${UNITDIR}/${u}" && "$u" != llama-server@* ]]; then
      printf '  %-26s %s\n' "$u" "not installed"
      continue
    fi
    st="$(unit_state "$u")"; en="$(unit_enabled_state "$u")"
    printf '  %-26s %-12s %s\n' "$u" "$st" "$en"
  done

  echo
  bold "Configuration"
  local f
  for f in "${ENVDIR}/split.env" "${ENVDIR}"/[0-9].env; do
    [[ -e "$f" ]] || continue
    printf '  %-28s port=%-5s ctx=%-7s fa=%-5s spec=%s\n' "$(basename "$f")" \
      "$(env_get "$f" PORT || echo '?')" "$(env_get "$f" CTX || echo '?')" \
      "$(env_get "$f" FA || echo '?')" "$(env_get "$f" SPEC || echo '?')"
    printf '  %-28s %s\n' '' "$(env_get "$f" MODEL || echo '?')"
  done

  echo
  bold "Endpoints"
  local ip; ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  for i in $(pg_instances); do
    p="$(port_of "$i")"
    code="$(health_code "$p")"
    case "$code" in
      200|401) printf '  %-34s \033[32mlive\033[0m (/health %s)\n' "http://${ip:-127.0.0.1}:${p}/v1" "$code" ;;
      *)       printf '  %-34s \033[33mdark\033[0m (no answer)\n' "http://${ip:-127.0.0.1}:${p}/v1" ;;
    esac
  done

  echo
  bold "Cards"
  if nvidia_ok; then
    nvidia-smi --query-gpu=index,memory.used,memory.total,temperature.gpu,power.draw \
      --format=csv,noheader 2>/dev/null | sed 's/^/    GPU /'
    local pid unit comm
    while IFS=$'\t' read -r pid unit comm; do
      [[ -n "$pid" ]] || continue
      printf '    held by pid %-8s %-24s %s\n' "$pid" "$comm" "$unit"
    done < <(gpu_busy_procs)
  else
    warn "nvidia-smi is missing — card state UNKNOWN (not 'idle')"
    rc=2
  fi

  echo
  bold "Firewall"
  for p in $(ports_of_mode per-gpu); do
    local urc; set +e; ufw_port_state "$p"; urc=$?; set -e
    case "$urc" in
      0) ok "ufw covers ${p}/tcp and is enforcing" ;;
      2) warn "ufw has a rule for ${p}/tcp but is NOT enforcing — the port is open to anything routable" ;;
      3) warn "ufw has NO rule for ${p}/tcp" ;;
      *) info "ufw state for ${p}/tcp: unknown (needs root)" ;;
    esac
  done

  if [[ "$running" == split ]]; then dashboard_caveat; fi
  echo
  info "exit code ${rc}: 0 = enabled and running agree, 2 = they do not, or a check was unknown"
  return "$rc"
}

# ------------------------------------------------------------------------ main
# CUDA_VISIBLE_DEVICES for the split unit: every visible card, in order. Computed here
# rather than hardcoded so a third card would be picked up.
CVD="$(gpu_indices | paste -sd, - 2>/dev/null || true)"
CVD="${CVD:-0,1}"

CMD=""
POS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY=1; shift ;;
    --bootstrap) BOOTSTRAP=1; shift ;;
    -h|--help)   usage 0 ;;
    split|per-gpu|status) CMD="$1"; shift ;;
    *) [[ "$CMD" == split || "$CMD" == per-gpu ]] || die "unknown argument: $1"; POS+=("$1"); shift ;;
  esac
done

case "$CMD" in
  split)   cmd_switch split ${POS[0]+"${POS[0]}"} ;;
  per-gpu) cmd_switch per-gpu ${POS[0]+"${POS[0]}"} ;;
  status)  cmd_status ;;
  *)       usage 1 ;;
esac
