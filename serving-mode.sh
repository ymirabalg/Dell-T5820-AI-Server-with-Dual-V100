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
# serving, never dark — and the rollback then RE-READS systemd and says whether that
# actually happened. A rollback that only claims it worked is worse than none.
#
#   exit 0   the switch completed  (status: enabled and running agree)
#   exit 1   refused, or the switch failed and the previous mode WAS restored
#   exit 2   status only: enabled and running disagree, or a check needed for that
#            verdict could not be evaluated
#   exit 3   ⚠ the switch failed AND the rollback could not restore the previous mode.
#            The box may be serving nothing; the output names every unit's state.
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
# split — SERVING-MODES.md §6. Geometry RE-READ from the GGUF header 2026-09-15 and
# confirmed: architecture gemma4, 60 blocks, sliding_window 1024, sliding_window_pattern
# 5 SWA : 1 global, so 50 SWA and 10 global; global head_count_kv 4 at key/value_length
# 512, SWA head_count_kv 16 at 256. Hence global KV = 10 x 4 x (512+512) x 2 B = 80 KiB
# per token. 262144 is the model's native window and the whole argument for split mode:
# ~30.4 GiB of weights + ~20 GiB of global KV + ~1.2 GiB of SWA = ~52 GiB of the 64 GiB
# across both cards. (§6's table calls the SWA cache 0.78 GiB; llama.cpp actually sizes
# it at 1536 cells rather than 1024 — see SPLIT_SWA_MIB below. Advisory only.)
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
# Fixed, and it does NOT grow with context — but it is not the 1024-cell figure the
# spec's §6 table implies. llama.cpp sizes the SWA half of an iswa cache as
#   GGML_PAD(min(n_ctx_seq, n_swa*(unified ? n_seq_max : 1) + n_ubatch), 256)
# (src/llama-kv-cache-iswa.cpp), which with this model's n_swa=1024, --parallel 1 and
# the default n_ubatch=512 is PAD(1536, 256) = 1536 cells, not 1024. Per token the 50
# SWA layers cost 16 KV heads x (256 + 256) x 2 B = 800 KiB, so 1536 x 800 KiB = 1200
# MiB. Advisory only; it moves the projection by ~400 MiB and changes no decision.
# ⚠ If -ub is ever passed to the split unit, re-derive this.
SPLIT_SWA_MIB="${SPLIT_SWA_MIB:-1200}"
SPLIT_ARCH_EXPECT="${SPLIT_ARCH_EXPECT:-gemma4}"
# Only a guard against integer overflow in the fit projection — NOT a statement about
# what this model can do. See the refusal in cmd_switch.
SPLIT_CTX_MAX="${SPLIT_CTX_MAX:-16777216}"

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

# One switch at a time. /run is tmpfs, so the lock cannot survive a reboot as a stale file.
LOCKFILE="${LOCKFILE:-/run/serving-mode.lock}"

DRY=0
BOOTSTRAP=0

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# ⚠ House convention: this re-reads the header comment, so the usage block and the header
# are the same text. Adding a header line means bumping this range (it now ends at the
# last '#' line before `set -euo pipefail`).
usage() { sed -n '3,38p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
run()   { if (( DRY )); then printf '  \033[35m→\033[0m would run: %s\n' "$*"; else "$@"; fi; }
need_root() { (( EUID == 0 )) || die "this subcommand needs root — re-run with sudo (even with --dry-run: the preflight reads root-only files)"; }

# ⚠ There was no lock of any kind, and three things collide on this box: two
# serving-mode.sh runs (each holds its own PREV_MODE and BACKUPS, so the loser's rollback
# restores an env file the winner has since rewritten); a `serve-llm.sh set-model N …`
# during a split switch (set-model restarts llama-server@N, the drop-in's
# Conflicts=llama-split.service makes systemd STOP the split process to let it, this
# script's health poll then sees is-active false and rolls back, and set-model runs its
# own rollback over the same files); and the dashboard's own restarts. `flock` is
# installed on the box (verified 2026-09-15). Where it is not, say so rather than
# pretending to serialise.
take_lock() {
  local d
  # ⚠ A dry run must write NOTHING, and creating the lock file is a write, however small.
  # It is printed instead. The cost is that a dry run cannot detect a concurrent switch;
  # the alternative is a --dry-run that touches the filesystem, which is the promise this
  # whole script is built around.
  if (( DRY )); then
    printf '  \033[35m→\033[0m would take an exclusive flock on %s for the whole switch\n' "$LOCKFILE"
    return 0
  fi
  command -v flock >/dev/null 2>&1 || {
    warn "flock is not installed — a concurrent switch cannot be locked out. Check by hand:"
    warn "     pgrep -af 'serving-mode.sh|serve-llm.sh'"
    return 0; }
  d="$(dirname "$LOCKFILE")"
  if [[ ! -w "$LOCKFILE" ]] && { [[ ! -d "$d" ]] || [[ ! -w "$d" ]]; }; then
    warn "${LOCKFILE} is not writable — running WITHOUT a lock"
    return 0
  fi
  exec 9>>"$LOCKFILE" || { warn "could not open ${LOCKFILE} — running WITHOUT a lock"; return 0; }
  flock -n 9 || die "another serving-mode.sh is already running (it holds ${LOCKFILE}).
     Two switches at once corrupt each other's rollback state. Wait for it, or:
       pgrep -af serving-mode.sh"
}

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

# ⚠ EVERY nvidia-smi call goes through this. A wedged driver makes nvidia-smi block
# inside NVML and never return: wait_for_vram would then sit there past VRAM_TIMEOUT
# with the per-GPU instances ALREADY STOPPED — dark, with no timeout to save it and
# traps that only fire on a signal. `timeout` is installed on this box (verified
# 2026-09-15); where it is not, the call is made directly rather than refused.
NV_TIMEOUT="${NV_TIMEOUT:-10}"
nv() {
  if command -v timeout >/dev/null 2>&1; then timeout "$NV_TIMEOUT" nvidia-smi "$@"
  else nvidia-smi "$@"; fi
}
gpu_indices() { nv --query-gpu=index --format=csv,noheader 2>/dev/null | tr -d ' '; }
gpu_count() { gpu_indices | grep -c . || true; }

# lines in A that are not in B (both newline-separated). Used to reconcile the units
# systemd knows about against the cards nvidia-smi can see.
list_minus() {  # list_minus <A> <B>
  local a="$1" b="$2" x
  [[ -n "$a" ]] || return 0
  while read -r x; do
    [[ -n "$x" ]] || continue
    grep -qxF "$x" <<<"$b" || printf '%s\n' "$x"
  done <<<"$a"
}

# ⚠⚠ ENUMERATE FROM SYSTEMD, not from the card list. Every unit, port, firewall row and
# mode verdict used to be derived from the CUDA indices nvidia-smi reports *right now*.
# A V100 that falls off the PCIe bus — a documented Volta failure mode, and this box has
# no BMC to notice — drops out of that list while llama-server@1.service stays enabled
# and active. Measured: `status` then printed "enabled and running agree: per-gpu", exit
# 0, with instance 1 absent from every table, and `per-gpu` rewrote only 0.env and
# reported the mode entered. Cards are the subject of the CARD questions only (CVD, the
# fit projection, "is this card idle"); which UNITS exist is systemd's answer.
#
# Three sources, unioned: what systemd has loaded or what multi-user.target wants (units
# that EXIST), the env files (configuration that exists), and the cards (what per-gpu
# SHOULD have, so a fresh box still enumerates). Measured on the box 2026-09-15:
# `list-unit-files 'llama-server@*'` lists only the TEMPLATE (state `indirect`) and never
# the instances, so it is not usable here; `list-units --all` lists the loaded instances
# and `list-dependencies multi-user.target --plain` lists the enabled ones. Asking
# `systemctl show` about an instance does NOT make it appear in either (checked).
systemd_pg_instances() {
  { systemctl list-units --all --no-legend --plain 'llama-server@*.service' 2>/dev/null || true
    systemctl list-dependencies multi-user.target --plain --no-pager 2>/dev/null || true
  } | sed -n 's/.*llama-server@\([0-9][0-9]*\)\.service.*/\1/p'
}
env_pg_instances() {
  local f
  for f in "$ENVDIR"/[0-9].env; do [[ -e "$f" ]] || continue; basename "$f" .env; done
}
compute_pg_instances() {
  # ⚠ `|| true`: this runs under `set -o pipefail`, and any of the three sources may be a
  # missing binary (nvidia-smi 127) or a systemctl that cannot answer. A non-zero here
  # would abort the whole script at the assignment in main — silently, with no output at
  # all — which is the opposite of what an unreadable source must do. The EMPTINESS of
  # the result is the signal, and every caller already handles an empty list.
  { systemd_pg_instances; env_pg_instances; gpu_indices; } 2>/dev/null \
    | sed -n 's/^\([0-9][0-9]*\)$/\1/p' | sort -n -u || true
}
# Computed ONCE per run (in main), so every table in one run agrees with every other and
# a card that disappears mid-run cannot make a unit vanish between two blocks of output.
PG_INSTANCES="${PG_INSTANCES:-}"
pg_instances() { printf '%s\n' "$PG_INSTANCES" | sed '/^$/d'; }

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
# ⚠ The fallback is `unknown`, NOT `disabled`. systemd always says something — a unit
# it has never heard of answers "not-found" (exit 4), a known one "enabled"/"disabled"
# (exit 0/1) — so an empty answer means systemctl itself failed, and calling that
# "disabled" would be a tick where the truth is unreadable.
unit_enabled_state() { local v; v="$(systemctl is-enabled "$1" 2>/dev/null || true)"; echo "${v:-unknown}"; }

# ⚠ yes / no / unknown, from systemd's own WORD rather than from an exit status. The
# shipped detect_mode consumed only `is-enabled --quiet` / `is-active --quiet` exit
# codes, so "systemd says no" and "systemctl could not answer" were the same answer:
# with the bus gone it printed "neither mode is enabled or running — this box is NOT
# serving" over a box that was serving, two lines above a Units table that honestly said
# `unknown`, and the switch then refused with a false reason whose printed remedy was
# the one flag that removes the guard.
unit_enabled_verdict() {
  case "$(unit_enabled_state "$1")" in
    enabled|enabled-runtime)       echo yes ;;
    disabled|masked|not-found|bad) echo no ;;
    # static / indirect / generated / transient / linked / alias: the unit carries no
    # [Install] of its own, so "would this come back after a reboot" has no answer from
    # this question — and `is-enabled` exits 0 for static and indirect, which the exit
    # status form counted as ENABLED. Unknown, therefore refuses.
    *)                             echo unknown ;;
  esac
}
unit_active_verdict() {
  case "$(unit_state "$1")" in
    active|activating|reloading)  echo yes ;;
    inactive|deactivating|failed) echo no ;;
    *)                            echo unknown ;;
  esac
}
verdict_of() {  # verdict_of enabled|running <unit>
  case "$1" in
    enabled) unit_enabled_verdict "$2" ;;
    running) unit_active_verdict "$2" ;;
    *) die "verdict_of: bad argument '$1'" ;;
  esac
}

# detect_mode enabled|running -> split | per-gpu | per-gpu-partial | both | none | unknown
# Asks systemd, never a file. `both` and `per-gpu-partial` are the states the switch
# refuses from, because neither has an unambiguous "previous mode" to roll back to; and
# `unknown` is the state it refuses from WITHOUT inventing a reason.
detect_mode() {
  local split_v pg_yes=0 pg_no=0 pg_unk=0 u v
  case "$1" in enabled|running) ;; *) die "detect_mode: bad argument '$1'" ;; esac
  split_v="$(verdict_of "$1" "$SPLIT_NAME")"
  for u in $(pg_units); do
    v="$(verdict_of "$1" "$u")"
    case "$v" in
      yes) pg_yes=$(( pg_yes + 1 )) ;;
      no)  pg_no=$(( pg_no + 1 )) ;;
      *)   pg_unk=$(( pg_unk + 1 )) ;;
    esac
  done
  if [[ "$split_v" == unknown ]] || (( pg_unk > 0 )); then echo unknown; return 0; fi
  if   [[ "$split_v" == yes ]] && (( pg_yes > 0 )); then echo both
  elif [[ "$split_v" == yes ]];                     then echo split
  elif (( pg_yes == 0 ));                           then echo none
  elif (( pg_no == 0 ));                            then echo per-gpu
  else                                                   echo per-gpu-partial
  fi
}

# Every process holding VRAM, as "pid<TAB>unit<TAB>comm". The unit comes from the
# process's own cgroup line, e.g.
#   0::/system.slice/system-llama\x2dserver.slice/llama-server@0.service
# so a card held by something that is NOT one of our units is named rather than
# waited on forever.
gpu_busy_procs() {
  local pid unit comm
  nv --query-compute-apps=pid --format=csv,noheader 2>/dev/null | tr -d ' ' | while read -r pid; do
    [[ -n "$pid" ]] || continue
    unit="$(sed -n 's#.*/\([^/]*\.service\)$#\1#p' "${PROC_DIR}/${pid}/cgroup" 2>/dev/null | head -1)"
    comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
    printf '%s\t%s\t%s\n' "$pid" "${unit:-no-unit}" "${comm:-?}"
  done
}

vram_used_mib() { nv --query-gpu=memory.used --format=csv,noheader,nounits 2>/dev/null | tr -d ' '; }

# ⚠ An UNPARSEABLE reading was already safe: `[N/A]` and `[Unknown Error]` fail the regex
# and refuse, and nvidia-smi writes its complaints to STDOUT on this box (measured), so
# they land in the safe column. An ABSENT or SHORT reading was NOT. `for m in $(...)` over
# an empty list iterates zero times and fell straight through to `return 0`, so nvidia-smi
# exiting 127, exiting non-zero with the message on stderr, printing nothing, or printing
# ONE line for TWO cards (a card off the bus) all read as "every card is free" — and
# wait_for_vram printed its green tick with an empty number in it:
#     ✓ cards free after 0s:  MiB used
# Count the readings and require one PER CARD. gpu_count was available and unused.
vram_all_idle() {
  local m n=0 cards
  cards="$(gpu_count)"
  while read -r m; do
    [[ -n "$m" ]] || continue
    [[ "$m" =~ ^[0-9]+$ ]] || return 1
    (( m <= IDLE_MIB )) || return 1
    n=$(( n + 1 ))
  done < <(vram_used_mib)
  (( n > 0 )) || return 1                 # no reading at all is not "idle"
  [[ "$cards" =~ ^[0-9]+$ ]] || return 1
  (( n == cards )) || return 1            # one line for two cards is not "all cards"
  return 0
}

# ufw. `systemctl is-active ufw` is NOT evidence of anything (root CLAUDE.md), and
# `ufw status` needs root — as a plain user it prints "ERROR: You need to be root to
# run this script" and exits 1, so the command answers that by itself and no separate
# EUID guard is wanted (one would only be a second, untestable copy of the rule).
#
# ⚠ The row format is NOT "port in column 1". It is ufw's own, from
# backend_iptables.get_status() in ufw 0.36.2 on this box:
#     "%-26s %-12s%-26s%s%s\n" % (To, ACTION[ IN|OUT|FWD], From, attribs, comment)
# and the To column is  [<dst addr>] [<port|range|list>[/proto]] [(v6)] [on <iface>]
# — so a rule written `to 192.168.4.71 port 8080` puts the ADDRESS in column 1 and the
# port in column 2. Reading column 1 misses it and reports "no rule", which would
# refuse a switch over a firewall that is in fact correct. (Step 11 was fooled by the
# same destination-qualified form.)
#
# ⚠ An INACTIVE firewall prints the single line "Status: inactive" and NO rule table at
# all — get_status() returns before building one. So "no rule matched" and "the
# firewall is down" are different answers and must not be conflated.
#
# Returns: 0 an ALLOW rule covers <port>/tcp inbound and ufw is enforcing
#          2 ufw is NOT enforcing (its rule table cannot be read from `ufw status`)
#          3 enforcing, and no ALLOW rule covers the port
#          4 cannot tell at all (no ufw, not root, or unrecognised output)
#          5 enforcing, nothing matched, but a rule line could not be parsed — UNKNOWN
UFW_MATCH_ACTION=""   # ALLOW or LIMIT, set by the row that matched, for an honest message
ufw_port_state() {
  local port="$1" out line first found=0 unparsed=0
  UFW_MATCH_ACTION=""
  command -v ufw >/dev/null 2>&1 || return 4
  out="$(ufw status 2>/dev/null)" || return 4
  [[ -n "$out" ]] || return 4
  first="$(head -1 <<<"$out")"
  case "$first" in
    'Status: active')   ;;
    'Status: inactive') return 2 ;;
    *)                  return 4 ;;
  esac
  while IFS= read -r line; do
    UFW_LINE_ACTION=""
    ufw_line_covers "$port" "$line"
    case $? in
      0) found=1; UFW_MATCH_ACTION="${UFW_LINE_ACTION:-ALLOW}" ;;
      2) unparsed=1 ;;
    esac
  done <<<"$out"
  (( found ))    && return 0
  (( unparsed )) && return 5
  return 3
}

# ufw_line_covers <port> <line> -> 0 covers, 1 does not, 2 cannot be parsed.
# Split out so it can be unit-tested against every shape `ufw status` emits.
# Sets UFW_LINE_ACTION to the action it matched (ALLOW or LIMIT) so the caller can say
# which one it found rather than calling a rate-limited rule a plain ALLOW.
UFW_LINE_ACTION=""
ufw_line_covers() {
  local port="$1" line="$2"
  local -a fld=() tocol=()
  read -r -a fld <<<"$line"
  local n=${#fld[@]} i ai=-1
  for (( i = 0; i < n; i++ )); do
    case "${fld[$i]}" in ALLOW|DENY|REJECT|LIMIT) ai=$i; break ;; esac
  done
  (( ai >= 0 )) || return 1                 # banner, header, blank: not a rule row
  # ⚠ LIMIT OPENS THE PORT. `ufw limit 8080/tcp` emits an ACCEPT preceded by a
  # `-m recent --update --seconds 30 --hitcount 6` drop — an allow with a rate limit, and
  # the form a cautious operator reaches for on a LAN-exposed inference endpoint. The old
  # comment here ("DENY/REJECT/LIMIT do not open anything") was factually wrong about ufw,
  # and the consequence was the worst kind of output this script can produce: a FALSE
  # STATEMENT ABOUT THE RULE SET — "NO inbound ALLOW rule covers 8080/tcp" — refusing the
  # switch over a firewall that is correct. DENY and REJECT really do not open anything.
  case "${fld[$ai]}" in
    ALLOW|LIMIT) UFW_LINE_ACTION="${fld[$ai]}" ;;
    *) return 1 ;;
  esac
  # The token after the action carries the direction when there is one. OUT and FWD
  # do not open a listening port ON this host, so only IN (or none) counts.
  case "${fld[$(( ai + 1 ))]:-}" in OUT|FWD) return 1 ;; esac
  (( ai > 0 )) || return 2                  # an ALLOW with an empty To column
  for (( i = 0; i < ai; i++ )); do tocol+=("${fld[$i]}"); done
  local m=${#tocol[@]}
  # strip "on <iface>" first: ufw appends "(v6)" before it
  (( m >= 3 )) && [[ "${tocol[$(( m - 2 ))]}" == on ]] && m=$(( m - 2 ))
  # ⚠ A "(v6)" row covers IPv6 ONLY — it must NOT be read as covering the IPv4 port.
  # This box listens on 0.0.0.0:8080 and 0.0.0.0:8081 (measured, `ss -Hltn`), so IPv4 is
  # the path that decides whether a client reaches it. Stripping the marker and treating
  # the row as any other made a rule set carrying only the v6 half — `ufw allow to ::/0
  # port 8080`, or a v4 rule deleted while its twin was left — report "an inbound ALLOW
  # rule covers 8080/tcp and ufw IS enforcing" over a port that is closed to every client
  # on the LAN. A false tick, which this script's doctrine forbids.
  (( m >= 2 )) && [[ "${tocol[$(( m - 1 ))]}" == '(v6)' ]] && return 1
  (( m >= 1 )) || return 2
  local last="${tocol[$(( m - 1 ))]}" spec proto=""
  case "$last" in */*) spec="${last%%/*}"; proto="${last#*/}" ;; *) spec="$last" ;; esac
  # "Anywhere" (optionally "/tcp") in the To column means every port.
  if [[ "$spec" == Anywhere ]]; then
    [[ -z "$proto" || "$proto" == tcp ]] && return 0
    return 1
  fi
  # A port spec: N, N:M, or a comma list of either, with an optional /proto.
  if [[ "$spec" =~ ^[0-9]+(:[0-9]+)?(,[0-9]+(:[0-9]+)?)*$ ]]; then
    [[ -n "$proto" && "$proto" != tcp ]] && return 1
    local part lo hi
    for part in ${spec//,/ }; do
      if [[ "$part" =~ ^([0-9]+):([0-9]+)$ ]]; then
        lo="${BASH_REMATCH[1]}"; hi="${BASH_REMATCH[2]}"
        (( port >= lo && port <= hi )) && return 0
      elif (( port == part )); then
        return 0
      fi
    done
    return 1
  fi
  # No port component at all — the To column is only an address (or address/CIDR),
  # which in ufw means EVERY port on that address.
  if (( m == 1 )) && [[ "$last" == *[.:]* ]]; then return 0; fi
  # Anything else (an application profile name, say) cannot be resolved from
  # `ufw status` alone, and a guess here would be the tick that unknown must never be.
  return 2
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
# ⚠ Returns 2 when it COULD NOT LOOK (no ss), which the caller must not print as "no
# established connections at this instant" — that is a positive claim about the network
# made from a missing tool.
clients_on_port() {
  local port="$1" peer name
  command -v ss >/dev/null 2>&1 || return 2
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
# ⚠ This said file:${SVC_HOME}/serving-mode.sh, a path that does not exist on this box
# (verified 2026-09-15). A Documentation= URI that resolves to nothing is decoration.
# The env file is where this unit's configuration actually is, and it is written by the
# same run, so it exists from the first successful switch onward — and unlike the
# script's own path it does not change with how the script was invoked, which would
# rewrite the unit and force a daemon-reload for nothing.
Documentation=file:${ENVDIR}/split.env
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

# ⚠ NEVER WRITE THROUGH A SYMLINK. `systemctl mask llama-split.service` replaces
# /etc/systemd/system/llama-split.service with a SYMLINK TO /dev/null — the exact path
# ensure_file owns — and all three primitives follow it:
#   1. [[ -f link→/dev/null ]] is FALSE (a char device is not a regular file), so the
#      content comparison was skipped and the WRITE branch taken;
#   2. `printf … > "$path"` follows the link, so the unit text went into /dev/null, rc 0,
#      with the mask untouched and "✓ wrote …" printed;
#   3. `chmod 644 "$path"` follows it too (verified), so it was `chmod 644 /dev/null` —
#      narrowing it from 0666 and breaking every unprivileged `> /dev/null` on the box,
#      collateral no rollback undoes.
# The run then reloaded systemd, restarted the dashboard container for nothing, stopped
# the per-GPU instances and only died at `systemctl enable`.
assert_plain_file() {  # assert_plain_file <path>
  local path="$1"
  if [[ -L "$path" ]]; then
    die "${path} is a SYMLINK, not a regular file — refusing to write through it. A masked
     unit is exactly this: a symlink to /dev/null, so the content would go to the link's
     TARGET and the chmod would change the target's mode. Fix, then re-run:
       sudo systemctl unmask $(basename "$path")     # if it is a masked unit
       ls -l ${path}                                 # otherwise, see what it points at"
  fi
  if [[ -e "$path" && ! -f "$path" ]]; then
    die "${path} exists and is not a regular file — refusing to write through it."
  fi
}

# Write a file only when its content would change, and report honestly either way.
# Returns 0 if it changed (caller then needs a daemon-reload), 1 if it did not.
ensure_file() {  # ensure_file <path> <content>
  local path="$1" content="$2"
  assert_plain_file "$path"
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
  local v; v="$(sed -n "s/^${2}=//p" "$1" | tail -1)"
  # ⚠ Return non-zero when the key is ABSENT, not just when the file is unreadable.
  # Every caller is `$(env_get ... || echo '?')`, and a silent empty string there
  # printed "ctx=" — a blank where the reading is missing, which reads as a value.
  [[ -n "$v" ]] || return 1
  printf '%s\n' "$v"
}

# Which env file belongs to which unit — the same 1:1 the units themselves declare via
# EnvironmentFile=, so "did THIS unit's configuration change" can be answered per unit.
env_file_of_unit() {
  case "$1" in
    "$SPLIT_NAME")          printf '%s\n' "${ENVDIR}/split.env" ;;
    llama-server@*.service) local i="${1#llama-server@}"; printf '%s\n' "${ENVDIR}/${i%.service}.env" ;;
  esac
}
env_changed_for() {  # env_changed_for <unit>
  local f; f="$(env_file_of_unit "$1")"
  [[ -n "$f" ]] || return 1
  grep -qxF "$f" <<<"$ENV_CHANGED_FILES"
}
# Every env file a mode owns, for the "is this path writable as a plain file" preflight.
mode_env_files() {
  local i
  case "$1" in
    split)   printf '%s\n' "${ENVDIR}/split.env" ;;
    per-gpu) for i in $(pg_instances); do printf '%s\n' "${ENVDIR}/${i}.env"; done ;;
  esac
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
ENV_CHANGED_FILES=""   # one path per line: which units actually need a restart
ROLLBACK_FAILED=0      # set when the rollback could NOT put the previous mode back
ROLLBACK_PROBLEMS=""   # one line per step that failed inside the rollback

backup_file() {  # backup_file <path>
  local p="$1" t
  if [[ -f "$p" ]]; then
    t="$(mktemp)"; cp "$p" "$t"
    BACKUPS+="${t}"$'\t'"${p}"$'\n'
  else
    BACKUPS+="NEW"$'\t'"${p}"$'\n'
  fi
}

# ⚠ Every step of a rollback runs through this: it never aborts the caller, it records
# the failure, and it SHOWS what the command said. A rollback is reached only when
# something has already gone wrong, so a SECOND failure inside it is the case to design
# for — not the first.
rb_step() {  # rb_step <description> <cmd...>
  local what="$1"; shift
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if (( rc == 0 )); then return 0; fi
  ROLLBACK_PROBLEMS+="${what} (exit ${rc})"$'\n'
  printf '  \033[31m✗\033[0m rollback step FAILED: %s (exit %s)\n' "$what" "$rc" >&2
  [[ -n "$out" ]] && printf '%s\n' "$out" | sed 's/^/        /' >&2
  return 1
}

restore_backups() {
  local src dst
  [[ -n "$BACKUPS" ]] || return 0
  while IFS=$'\t' read -r src dst; do
    [[ -n "$dst" ]] || continue
    if [[ "$src" == NEW ]]; then
      if rb_step "remove ${dst}" rm -f "$dst"; then warn "removed $dst (it did not exist before)"; fi
    else
      # ⚠ This `cp` had no guard while every systemctl call in do_rollback had one, so a
      # failing cp — read-only /etc, a full filesystem, an immutable attribute — killed
      # the handler PART WAY THROUGH the rollback, under `set -e`, with the traps already
      # cleared. Measured: the whole output was the banner, a raw `cp:` line and exit 1;
      # the env file was left holding the NEW configuration; and in the cross-mode case
      # the abort landed BEFORE the target was disabled and BEFORE the previous mode was
      # re-enabled, so the box stayed half-switched with nothing said.
      if rb_step "restore ${dst} from ${src}" cp "$src" "$dst"; then
        warn "restored $dst"; rm -f "$src" 2>/dev/null || true
      else
        warn "     ⚠ ${dst} still holds the NEW configuration. Its backup is KEPT at ${src}"
        warn "       — copy it back by hand before starting anything on that file."
      fi
    fi
  done <<<"$BACKUPS"
  BACKUPS=""
}

drop_backups() {
  local src dst
  [[ -n "$BACKUPS" ]] || return 0
  while IFS=$'\t' read -r src dst; do
    # ⚠ BACKUPS ends in a newline and <<< adds another, so the last read yields an
    # EMPTY src — without this guard that became a literal `rm -f ''` every run.
    # Harmless with GNU rm, but it is an unvalidated path handed to rm, and
    # restore_backups already guards the same loop.
    [[ -n "$src" && "$src" != NEW ]] || continue
    rm -f "$src"
  done <<<"$BACKUPS"
  BACKUPS=""
}

# ⚠⚠ THE VERIFICATION IS THE POINT. The rollback used to end with
#     for u in ...; do systemctl enable --now "$u" >/dev/null 2>&1 || true; done
#     warn "${PREV_MODE} re-enabled and restarted"
# — the one command the whole "a failed switch leaves the box SERVING, never dark"
# promise rests on, with its stdout, its stderr AND its exit status discarded, and the
# very next line asserting it worked. Measured: with that enable failing (a masked unit,
# a StartLimitBurst already spent, a model moved between the two runs, a dropped D-Bus),
# both per-GPU instances and the split unit ended `disabled inactive` — dark now and dark
# after a reboot — under a final line that said the previous mode was restored.
#
# So the mode is re-read from systemd AFTER the enable, per unit, on both axes that
# matter: enablement (does a reboot come back serving?) and activity (is it serving
# now?). Anything that is not both is named, and the run exits 3.
verify_mode_restored() {  # verify_mode_restored <mode> <what-was-attempted>
  local mode="$1" what="$2" u en ac bad=0 unk=0
  echo
  bold "Rollback verification — re-read from systemd, not assumed"
  for u in $(units_of_mode "$mode"); do
    en="$(unit_enabled_state "$u")"; ac="$(unit_state "$u")"
    printf '  %-26s %-12s %s\n' "$u" "$ac" "$en"
    case "$en" in enabled|enabled-runtime) ;; unknown) unk=1 ;; *) bad=1 ;; esac
    case "$ac" in active|activating|reloading) ;; unknown) unk=1 ;; *) bad=1 ;; esac
  done
  [[ -n "$ROLLBACK_PROBLEMS" ]] && bad=1
  if (( bad || unk )); then
    ROLLBACK_FAILED=1
    if (( bad )); then
      printf '  \033[31m✗\033[0m THE ROLLBACK DID NOT RESTORE %s MODE — the box may be serving NOTHING.\n' "$mode" >&2
    else
      printf '  \033[31m✗\033[0m THE ROLLBACK CANNOT BE VERIFIED: systemd did not answer for at least one\n' >&2
      printf '    unit above, so whether %s is back is UNKNOWN — which is not a yes.\n' "$mode" >&2
    fi
    if [[ -n "$ROLLBACK_PROBLEMS" ]]; then
      # same stream as its own heading: `warn` is stdout, and a list that lands on the
      # other stream reads as though it belonged to something else.
      warn "     steps that failed inside the rollback:"
      printf '%s' "$ROLLBACK_PROBLEMS" | sed 's/^/          /'
    fi
    warn "     Anything above that is not 'active enabled' is not serving now and will not"
    warn "     come back at a reboot either. By hand, now:"
    for u in $(units_of_mode "$mode"); do
      warn "       sudo systemctl unmask ${u} 2>/dev/null; sudo systemctl enable --now ${u}"
    done
    warn "       sudo journalctl -u <unit> -n 60      # why it would not start"
    warn "       $0 status                            # then confirm"
    return 1
  fi
  ok "${mode} ${what} — VERIFIED: every unit above is active AND enabled"
  # ⚠ Deliberately NOT a /health poll: the previous mode has to load its weights again,
  # which is minutes on this box (19-32 GB), and a rollback must not sit on that while
  # the operator waits to learn what happened. `active` on a Type=exec unit means the
  # process is running, not that the model is loaded — so name the check rather than
  # implying it was made.
  info "the weights still have to load: confirm the endpoints with  $0 status"
  return 0
}

# A switch that fails must leave the box SERVING, not dark. Same shape as
# serve-llm.sh's setmodel_rollback, widened from one instance to a whole mode.
do_rollback() {
  (( ROLLBACK_ARMED )) || return 0
  ROLLBACK_ARMED=0
  # ⚠ errexit OFF for the whole rollback, with every step's status captured by rb_step
  # instead. Under `set -e` a single failing command inside the handler ended the run
  # part way through the recovery — the exact failure mode this project has now fixed
  # three times (probe_cleanup's `local`, $HOME under sudo, and restore_backups' `cp`).
  local had_e=0; case "$-" in *e*) had_e=1 ;; esac
  set +e
  # ⚠ INT/TERM are IGNORED here, not cleared: a second Ctrl-C during a rollback would
  # otherwise abort it mid-way and leave the box half-restored with nothing said. There
  # is no unbounded wait inside this function, so ignoring them cannot hang.
  trap '' INT TERM
  echo
  bold "ROLLING BACK to ${PREV_MODE:-<nothing>} mode"
  info "interrupts are ignored until this finishes"
  restore_backups
  local u
  if [[ "$PREV_MODE" == "$TARGET_MODE" ]]; then
    # Re-asserting the mode the box was already in: never disable it, just put it
    # back on the configuration it had.
    for u in $(units_of_mode "$TARGET_MODE"); do rb_step "systemctl restart ${u}" systemctl restart "$u"; done
    verify_mode_restored "$TARGET_MODE" "restarted on its previous configuration"
  else
    for u in $(units_of_mode "$TARGET_MODE"); do rb_step "systemctl disable --now ${u}" systemctl disable --now "$u"; done
    case "$PREV_MODE" in
      split|per-gpu)
        for u in $(units_of_mode "$PREV_MODE"); do rb_step "systemctl enable --now ${u}" systemctl enable --now "$u"; done
        verify_mode_restored "$PREV_MODE" "re-enabled and restarted"
        ;;
      *)
        ROLLBACK_FAILED=1
        warn "there was no previous mode to restore (--bootstrap), so the box is NOT serving."
        warn "     Bring one up by hand: sudo $0 per-gpu --bootstrap"
        ;;
    esac
  fi
  (( had_e )) && set -e
  return 0
}

on_exit() {
  local rc=$?
  # ⚠ Only EXIT is cleared, and only so the handler cannot re-enter itself. INT and TERM
  # are left alone here and IGNORED by do_rollback, because clearing all three (as this
  # did) meant a failure inside the rollback had no handler left to notice it and a
  # second Ctrl-C could abort the recovery outright.
  trap - EXIT
  if (( rc == 0 )); then trap - INT TERM; drop_backups; exit 0; fi
  do_rollback
  if (( ROLLBACK_FAILED )); then
    echo
    printf '  \033[31m✗\033[0m exit 3: the switch FAILED and the rollback could NOT restore %s.\n' "${PREV_MODE:-the previous mode}" >&2
    exit 3
  fi
  exit "$rc"
}

# A Ctrl-C part way through a switch is NOT a successful stop — unlike
# gpu-fan-control's service SIGTERM, where the same reasoning runs the other way. Roll
# back and exit non-zero so the journal and the shell both record a failed switch.
on_signal() {
  trap - EXIT
  warn "interrupted"
  do_rollback
  (( ROLLBACK_FAILED )) && exit 3
  exit 1
}

# ⚠ 0 = the service user can read it, 1 = it cannot, 2 = the question could not be asked.
# `! runuser -u yorman -- test -r "$f" 2>/dev/null` was true BOTH when the user cannot
# read the file and when runuser is not installed, so a box without runuser produced two
# confident false accusations ("yorman cannot read …") and sent the operator to fix
# permissions that were already correct. Refusing is right; the STATEMENT was false.
svcuser_can_read() {  # svcuser_can_read <path>
  command -v runuser >/dev/null 2>&1 || return 2
  runuser -u "$SVC_USER" -- test -r "$1" 2>/dev/null && return 0
  return 1
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
  else
    set +e; svcuser_can_read "$model"; rc=$?; set -e
    case "$rc" in
      0) pf_ok "model: $model ($(du -h "$model" 2>/dev/null | cut -f1))" ;;
      1) pf_bad "${SVC_USER} cannot read $model — the service runs as ${SVC_USER}, root being able to read it proves nothing" ;;
      *) pf_unk "whether ${SVC_USER} can read $model cannot be asked here (runuser is not installed)" ;;
    esac
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

    # --- ⚠ the units systemd knows about, reconciled against the cards that answer.
    #     per-gpu means ONE INSTANCE PER CARD: an instance whose card is not on the bus
    #     cannot serve, and writing its env file and starting it anyway is the silent
    #     half-switch this check exists to prevent. There was NO card-count check for
    #     per-gpu at all (only n<1, and n<2 for split).
    local orphan_i orphan_c
    orphan_i="$(list_minus "$(pg_instances)" "$(gpu_indices)")"
    orphan_c="$(list_minus "$(gpu_indices)" "$(pg_instances)")"
    if [[ -n "$orphan_i" ]]; then
      if [[ "$mode" == per-gpu ]]; then
        pf_bad "these llama-server instances exist in systemd or in ${ENVDIR} but their cards are
     NOT visible to nvidia-smi: $(tr '\n' ' ' <<<"$orphan_i")
     per-gpu is one instance per card, so this would half-configure the mode while
     reporting it entered. Either the card has left the bus (check: nvidia-smi -L,
     lspci | grep -i nvidia, dmesg | grep -i xid) or a stale N.env is left over."
      else
        warn "instance(s) $(tr '\n' ' ' <<<"$orphan_i")have no visible card. They will be stopped"
        warn "     if running, which is harmless, but something is wrong with the card list."
      fi
    fi
    if [[ -n "$orphan_c" && "$mode" == per-gpu ]]; then
      info "card(s) $(tr '\n' ' ' <<<"$orphan_c")have no instance yet — one will be configured per card"
    fi
  fi

  # --- the api key
  if [[ ! -s "$KEYFILE" ]]; then
    pf_bad "no api key at $KEYFILE — run 'sudo serve-llm.sh install' (it generates one)"
  else
    set +e; svcuser_can_read "$KEYFILE"; rc=$?; set -e
    case "$rc" in
      0) pf_ok "api key: present and readable by ${SVC_USER}" ;;
      1) pf_bad "${SVC_USER} cannot read $KEYFILE (wanted root:${SVC_USER} 0640)" ;;
      *) pf_unk "whether ${SVC_USER} can read $KEYFILE cannot be asked here (runuser is not installed)" ;;
    esac
  fi

  # --- ⚠ the tools whose ABSENCE this script would otherwise read as an ANSWER. It
  #     already preflights strings, ufw and nvidia-smi; these three were missing.
  if ! command -v curl >/dev/null 2>&1; then
    pf_bad "curl is missing — /health could never be polled, so a switch would run the full
     ${HEALTH_TIMEOUT}s health timeout and then ROLL BACK a mode that is in fact healthy"
  fi
  if ! command -v runuser >/dev/null 2>&1; then
    pf_unk "runuser is missing — 'can ${SVC_USER} read this file' cannot be asked, and root
     being able to read it proves nothing (the units run as ${SVC_USER})"
  fi
  if ! command -v ss >/dev/null 2>&1; then
    warn "ss is missing — the clients this switch is about to break cannot be enumerated."
    warn "     Not a refusal, but read the Clients block below as 'could not look', not as"
    warn "     'nobody is connected'."
  fi

  # --- ⚠ every file this mode will write must be a PLAIN file. `systemctl mask` turns a
  #     unit path into a symlink to /dev/null, and writing through it silently succeeds
  #     (see assert_plain_file). Catch it here, before the first mutation, rather than in
  #     step 3 after the run has already started.
  local w
  for w in "$SPLIT_UNIT" "$DROPIN" $(mode_env_files "$mode"); do
    if [[ -L "$w" ]]; then
      pf_bad "$w is a SYMLINK (a masked unit is a symlink to /dev/null) — this script would
     write through it and chmod its TARGET. Fix: sudo systemctl unmask $(basename "$w")"
    elif [[ -e "$w" && ! -f "$w" ]]; then
      pf_bad "$w exists and is not a regular file — refusing to write through it"
    fi
  done
  # A unit this mode has to ENABLE, masked, fails at `systemctl enable` — which is one of
  # the ways the rollback's own enable used to fail silently. Say it now instead.
  for w in $(units_of_mode "$mode"); do
    if [[ "$(unit_enabled_state "$w")" == masked ]]; then
      pf_bad "$w is MASKED — 'systemctl enable' would fail. Fix: sudo systemctl unmask $w"
    fi
  done

  # --- ufw, for every port this mode will serve
  local p
  for p in $(ports_of_mode "$mode"); do
    set +e; ufw_port_state "$p"; rc=$?; set -e
    case "$rc" in
      0) if [[ "$UFW_MATCH_ACTION" == LIMIT ]]; then
           pf_ok "ufw: an inbound LIMIT rule covers ${p}/tcp and ufw IS enforcing — that is an
     ALLOW with a rate limit (6 connections / 30 s per source), so the port IS open"
         else
           pf_ok "ufw: an inbound ALLOW rule covers ${p}/tcp and ufw IS enforcing"
         fi ;;
      # Not a refusal, and that is a judgement: refusing to switch modes would not
      # close a port that is already open in the mode the box is in.
      2) warn "ufw is NOT enforcing — ${p} is open to anything routable, with only the api"
         warn "     key gating inference. And 'ufw status' prints NO rule table while the"
         warn "     firewall is down, so whether a rule even exists cannot be read from it:"
         warn "     ask 'sudo ufw show added'. Fix: sudo ufw enable — but check that listing"
         warn "     carries a rule for port 22 FIRST, or you lock SSH out (root CLAUDE.md,"
         warn "     2026-09-04: it happened, and there is no iDRAC on this box)." ;;
      3) pf_bad "ufw: NO inbound ALLOW rule covers ${p}/tcp — add it before serving on it" ;;
      5) pf_unk "ufw: a rule line could not be parsed and nothing matched ${p}/tcp — an
     application-profile rule, most likely. Check by hand: sudo ufw status" ;;
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
  tot_vram="$(nv --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null \
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

# ⚠ This used to end "SERVING-MODES.md §4 lists three honest fixes and the choice is the
# owner's" — telling the operator an open question existed where the answer was already
# written down. §4 was RULED on 2026-09-15 (Option 1: the dashboard states the mode,
# honestly, via serving[].gpus read from each unit's own CUDA_VISIBLE_DEVICES). The
# BEHAVIOUR this warns about is still true of the shipped dashboard, so the caveat stays —
# but it now says what is true, and it names the thing that retires it.
dashboard_caveat() {
  echo
  warn "⚠ DASHBOARD: the shipped dashboard does not yet know about split mode, and what it"
  warn "     shows for GPU 1 in this mode is not cosmetic."
  warn "     It still joins a card to an instance by gpu.index === serving.instance (its"
  warn "     SPEC.md §3.4, §6.2). In split mode that join has no answer: ONE instance, TWO"
  warn "     cards, and 'split' is not an index — so GPU 1's served-by line renders as an em"
  warn "     dash, which by the dashboard's own invariant 1 reads as AN UNREAD READING when"
  warn "     the truth is 'this card IS serving, jointly'. False by omission."
  warn "     This is NOT an open question. SERVING-MODES.md §4 was RULED on 2026-09-15: the"
  warn "     dashboard will state the mode honestly, via serving[].gpus sourced from each"
  warn "     unit's own CUDA_VISIBLE_DEVICES (%i -> [N]; this unit -> [${CVD}])."
  warn "     ⚠ RETIRED BY: dashboard loop 12b shipping serving[].gpus and the inverted join"
  warn "     (dashboard/SPEC.md §3.4/§6.2, SERVING-MODES.md §4). The day GPU 1 reads"
  warn "     'served jointly with GPU 0', this caveat is false — delete it from this script."
  warn "     Until then: do not read GPU 1's served-by line in split mode."
}

# --------------------------------------------------------------------- switch
cmd_switch() {  # cmd_switch <mode> [ctx]
  local mode="$1" ctx_arg="${2:-}"
  local enabled running model alias ctx fa spec u p arch
  need_root
  take_lock
  TARGET_MODE="$mode"

  case "$mode" in
    split)
      if [[ -n "$ctx_arg" ]]; then
        [[ "$ctx_arg" =~ ^[0-9]+$ ]] || die "CTX must be a number — got '${ctx_arg}'"
        # ⚠ 0 is not "no context": llama.cpp reads --ctx-size 0 as "use the model's own
        # training window", which here would silently mean 262144 while this script
        # printed "context: 0" and projected 0 MiB of KV. Refuse the values whose
        # meaning the script does not model rather than report a fit it did not compute.
        (( ctx_arg >= 256 )) || die "CTX must be at least 256 — got '${ctx_arg}'. Note llama.cpp
     reads 0 as 'the model's own training window' (262144 here), which is not what a
     printed 'context: 0' would lead you to expect."
        # ⚠ And a CEILING, for the same stated reason at the other end. The guard refused
        # "the values whose meaning the script does not model" below 256 and then modelled
        # nothing above: bash wraps intmax_t silently, so `split 9223372036854775000`
        # printed "global KV -63 MiB" — a NEGATIVE cache — a total that fits comfortably,
        # and no "does not even fit the SUM of both cards" warning at all. The ceiling is
        # deliberately far above anything real (SPLIT_CTX_MAX, 16777216) so that
        # SERVING-MODES.md §9's forced-failure run, `split 524288`, is still accepted.
        # (the length test first: a literal past 2^63 would make the arithmetic itself
        # throw "value too great for base" rather than compare)
        if (( ${#ctx_arg} > 8 )) || (( ctx_arg > SPLIT_CTX_MAX )); then
          die "CTX must be at most ${SPLIT_CTX_MAX} — got '${ctx_arg}'. Past that, ctx x
     ${SPLIT_KV_KIB_PER_TOK} KiB overflows a 64-bit integer and the fit projection prints a
     NEGATIVE KV figure with the 'does not fit' warning suppressed. Values above the
     model's native 262144 are still accepted — that is how a rollback is forced."
        fi
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
  # ⚠ UNKNOWN IS NOT 'none', and it is checked before every other arm — including the one
  # that offers a flag. With systemd unreadable the script used to announce "NEITHER mode
  # is enabled, so a failed switch would have nothing to roll back to", a false statement
  # about the box, and print as its remedy the one flag that REMOVES that guard; taking
  # that advice carried the run through a green preflight, wrote the unit and the drop-in,
  # and died at daemon-reload with a bare "Failed to connect to bus".
  if [[ "$enabled" == unknown || "$running" == unknown ]]; then
    die "systemd could not be read (enabled=${enabled}, running=${running}), so the mode this
     box is in is UNKNOWN — which is NOT the same as 'not serving'. Refusing: a switch
     that cannot name the mode it is leaving has nothing to roll back to, and no flag
     overrides this — the guard that can be waived is for a box genuinely serving
     nothing, and waiving it would not make systemctl answer. Check, in this order:
       systemctl is-system-running
       systemctl is-enabled llama-server@0.service ; systemctl is-active llama-server@0.service
       $0 status"
  fi
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
    # ⚠ This is a real mutation, performed BEFORE the rollback is armed, and a rollback
    # does not undo it: the unit files are deliberately left (they are mode-independent
    # infrastructure and inert while disabled), and the ai-dashboard container has by then
    # already been restarted. Say so, because a failed switch is not free.
    warn "the daemon-reload and the ai-dashboard restart below are NOT undone by a rollback."
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
      report_clients "$pp" "STOPS ANSWERING (connection refused) until the mode is switched back"
    done
    info "${dark% } is NOT rebound to the surviving instance, deliberately: one process"
    info "     cannot serve two ports, and a proxy forwarding one to the other would hand"
    info "     two agents ONE KV cache while looking like two independent endpoints — a"
    info "     correctness failure, not an efficiency one (SERVING-MODES.md §5)."
  else
    info "no port goes DARK in this direction"
  fi
  # ⚠ The ports that go dark are only half the clients this breaks. Every unit of the mode
  # being left is `disable --now`'d, so the clients on the ports that SURVIVE are severed
  # too — for the minutes the new model takes to load — and they used to go unnamed, under
  # a line that said "no port goes dark in this direction". SERVING-MODES.md §5 asks which
  # clients the switch breaks, not which port numbers stop existing.
  local cutting=0
  for u in $(units_of_other_modes "$mode"); do
    [[ "$(unit_state "$u")" == active ]] && cutting=1
  done
  if (( cutting )); then
    for pp in $(ports_of_mode "$mode"); do
      # ⚠ Only the ports that are actually ANSWERING now are cut. A target port that is
      # dark today (8081 on the way back from split) is not "cut" — it comes UP — and
      # saying otherwise would be exactly the kind of false statement this block exists
      # to stop making. Measured with the same /health probe `status` uses.
      case "$(health_code "$pp")" in
        200|401) report_clients "$pp" "keeps its number but is CUT: every established connection is dropped and it does not answer again until the new model has loaded" ;;
        *)       info "port ${pp} is not answering now — it comes UP when ${mode} has loaded" ;;
      esac
    done
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
  local uen ust
  for u in $(units_of_other_modes "$mode"); do
    uen="$(unit_enabled_state "$u")"; ust="$(unit_state "$u")"
    # ⚠ `systemctl is-enabled` on a unit systemd has never heard of prints
    # **not-found** and exits 4 — verified on the box, and it is NOT "disabled". The
    # old test was `!= disabled`, so a box with no llama-split.service at all took the
    # disable branch: a `disable --now` of a nonexistent unit, and worse, `stopped=1`
    # and a full VRAM wait for a stop that never happened. Under --dry-run it also
    # PRINTED a `systemctl disable` that a real run would not issue, because a real run
    # writes the unit in step 3 first — the exact print-vs-do divergence this script is
    # meant not to have.
    if [[ "$uen" == not-found ]]; then
      info "$u is not installed — nothing to stop"
    elif [[ "$uen" == disabled || "$uen" == masked ]] \
         && [[ "$ust" != active && "$ust" != activating && "$ust" != reloading ]]; then
      info "$u is ${uen} and ${ust}"
    else
      run systemctl disable --now "$u"
      stopped=1
    fi
  done
  # ⚠ The dry branch must honour `stopped` too. It used to announce the VRAM poll
  # unconditionally, so a switch that stops nothing printed a wait it would never do.
  if (( DRY && stopped )); then
    printf '  \033[35m→\033[0m would then POLL nvidia-smi until no compute process remains and every card\n'
    printf '    is under %s MiB, for up to %s s, and FAIL LOUDLY (with a rollback) if it is not.\n' "$IDLE_MIB" "$VRAM_TIMEOUT"
  elif (( DRY )); then
    info "nothing would be stopped — not waiting on VRAM"
  elif (( stopped )); then
    wait_for_vram
    assert_ports_free "$mode"
  else
    info "nothing was stopped — not waiting on VRAM"
  fi

  # ---- 7. configuration
  echo
  bold "Configuration"
  ENV_CHANGED_FILES=""
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
    # ⚠ Per unit: restart only the instance whose OWN env file changed. See write_env.
    if [[ "$(unit_state "$u")" == active ]] && env_changed_for "$u"; then
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

report_clients() {  # report_clients <port> <what happens to it>
  local p="$1" what="$2" peers rc
  set +e; peers="$(clients_on_port "$p")"; rc=$?; set -e
  if (( rc == 2 )); then
    warn "port ${p} ${what}"
    warn "     — WHO is connected could NOT BE READ (ss is not installed). That is an unread"
    warn "       reading, not an empty one: do not read it as 'nobody is connected'."
  elif [[ -n "$peers" ]]; then
    warn "port ${p} ${what}. Established clients right now:"
    printf '%s\n' "$peers" | sed 's/^/        /'
  else
    warn "port ${p} ${what} — no established connections at this instant, which is not the"
    warn "     same as no clients: anything pointing at it fails, and nothing explains why."
  fi
}

# Ports and units belonging to any mode that is NOT this one.
ports_of_other_modes() { case "$1" in split) local i; for i in $(pg_instances); do [[ "$(port_of "$i")" == "$(port_of 0)" ]] || port_of "$i"; done ;; per-gpu) : ;; esac; }
units_of_other_modes() { case "$1" in split) pg_units ;; per-gpu) printf '%s\n' "$SPLIT_NAME" ;; esac; }

write_env() {  # write_env <path> <content>
  local path="$1" content="$2"
  assert_plain_file "$path"
  if [[ -f "$path" ]] && [[ "$(cat "$path")" == "$content" ]]; then
    info "$(basename "$path") already says exactly this — leaving it alone"
    return 0
  fi
  if [[ -f "$path" ]]; then
    info "$(basename "$path"): $(env_get "$path" ALIAS || echo '?') ctx=$(env_get "$path" CTX || echo '?') -> $(sed -n 's/^ALIAS=//p' <<<"$content") ctx=$(sed -n 's/^CTX=//p' <<<"$content")"
  fi
  # ⚠ PER FILE, not one global flag. `ENV_CHANGED` was set by ANY write_env and read once
  # per unit, so a switch in which only 1.env differed restarted llama-server@0 as well —
  # a live, loaded instance with a warm KV cache and established clients, ~3 minutes of
  # reload on this box, every connection on 8080 dropped, and the prefill the
  # one-agent-per-port rule exists to preserve thrown away — four steps after the Clients
  # block said "no port goes dark in this direction".
  ENV_CHANGED_FILES+="${path}"$'\n'
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

# ⚠ The /health tick proves only that SOMETHING on that port answers. The unit is
# Type=exec, so it is `active` the instant the binary execs — long before it binds — and a
# bind failure ("Address already in use") happens AFTER `systemctl start` has returned 0.
# So on the FIRST poll iteration is-active is true, and anything else already listening
# that answers 200 or 401 ends the poll at t=0: the switch reports success while the real
# unit crash-loops to its StartLimitBurst. The preflight's foreign-process check cannot
# see such a squatter — it enumerates --query-compute-apps, and a proxy, a stale `-ngl 0`
# server or a container publishing the port holds no VRAM. So ask whether the port is free
# at the one moment it must be: after the other mode has stopped, before this one starts.
port_listener() {  # port_listener <port> -> the listening socket lines, or empty; 2 = cannot look
  command -v ss >/dev/null 2>&1 || return 2
  ss -Hltnp 2>/dev/null | awk -v p=":$1\$" '$4 ~ p {print}'
}
assert_ports_free() {  # assert_ports_free <mode>
  local p squat rc
  for p in $(ports_of_mode "$1"); do
    set +e; squat="$(port_listener "$p")"; rc=$?; set -e
    if (( rc == 2 )); then
      info "cannot check whether port ${p} is free (ss is not installed) — a squatter there"
      info "     would answer the health poll in place of the unit being started"
      continue
    fi
    if [[ -n "$squat" ]]; then
      printf '%s\n' "$squat" | sed 's/^/        /' >&2
      die "port ${p} is ALREADY being listened on, and the mode being left has just been
     stopped — so that is not ours. Starting into it would give a unit that cannot bind
     while the /health poll is answered by the squatter above, and the switch would
     report success over a crash-looping service. Stop it, then re-run."
    fi
    ok "port ${p} is free"
  done
}

# ⚠ Do not assume a stopped unit has released its cards. The process exits, the driver
# tears the context down asynchronously, and starting the other mode into a card that
# is still 28 GiB full is an OOM with a confusing message. Poll, and fail LOUDLY.
wait_for_vram() {
  # ⚠ ELAPSED SECONDS, not loop counts. Both polls used to advance a counter by a literal
  # 2 per iteration while each iteration ALSO paid for an nvidia-smi, a ps per compute pid
  # and (in wait_health) a `curl -m 2` — so the number printed as seconds was smaller than
  # the wall clock, and a "600 s" timeout could run for ~1200 s. Same family as this
  # project's own predicted_per_second lesson: the number reported must be the quantity
  # measured. SECONDS is a bash builtin and is wall clock.
  local t0=$SECONDS t=0 busy
  info "waiting for the cards to actually free (up to ${VRAM_TIMEOUT}s)"
  while (( t < VRAM_TIMEOUT )); do
    busy="$(gpu_busy_procs || true)"
    if [[ -z "$busy" ]] && vram_all_idle; then
      ok "cards free after ${t}s: $(vram_used_mib | tr '\n' ' ')MiB used"
      return 0
    fi
    sleep 2; t=$(( SECONDS - t0 ))
  done
  warn "still busy after ${VRAM_TIMEOUT}s:"
  # ⚠ Both guarded. These run on the FAILURE path, where the most likely reason the poll
  # timed out is that nvidia-smi itself is not answering — and an unguarded pipeline whose
  # left-hand side exits non-zero (a `timeout` expiring returns 124) takes `set -o
  # pipefail` and `set -e` with it, killing the run BEFORE the `die` below and returning
  # 124 instead of 1. The diagnosis would then be missing from the one place it matters.
  local diag
  diag="$(gpu_busy_procs || true)"
  if [[ -n "$diag" ]]; then printf '%s\n' "$diag" | sed 's/^/        pid /'; fi
  diag="$(vram_used_mib || true)"
  if [[ -n "$diag" ]]; then printf '%s\n' "$diag" | sed 's/^/        used MiB: /'
  else warn "        and nvidia-smi gave NO reading at all — the driver, not just the cards,"
       warn "        may be the problem (it is wrapped in 'timeout ${NV_TIMEOUT}s' here)"; fi
  die "the cards did not free — refusing to start ${TARGET_MODE} into occupied VRAM"
}

# Poll rather than trusting the start: a unit is 'active' the moment it execs, long
# before the weights are on the cards, and it can OOM a minute in.
wait_health() {  # wait_health <unit> <port>
  local u="$1" p="$2" t0=$SECONDS t=0 code
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
    sleep 2; t=$(( SECONDS - t0 ))     # elapsed seconds, not iterations x 2 — see wait_for_vram
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
  if [[ "$enabled" == unknown || "$running" == unknown ]]; then
    # ⚠ Not "none". systemd itself could not be read, and saying "this box is NOT serving"
    # over a box that is serving is the worst sentence this command can print.
    rc=2
    warn "⚠ systemd could not be read (enabled=${enabled}, running=${running}) — the mode is"
    warn "     UNKNOWN, which is NOT 'not serving'. The Units table below shows which units"
    warn "     answered. Check: systemctl is-system-running"
  elif [[ "$enabled" == "$running" ]]; then
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
    # ⚠ An `unknown` here is systemctl failing to answer, not a unit that is off. It is
    # the reading the mode verdict is made of, so it must move the exit code.
    if [[ "$st" == unknown || "$en" == unknown ]]; then
      warn "     ^ systemd did not answer for this unit — UNKNOWN, not 'off'"
      rc=2
    fi
  done

  echo
  bold "Configuration"
  local f vals
  for f in "${ENVDIR}/split.env" "${ENVDIR}"/[0-9].env; do
    [[ -e "$f" ]] || continue
    vals="$(env_get "$f" PORT || echo '?')|$(env_get "$f" CTX || echo '?')|$(env_get "$f" FA || echo '?')|$(env_get "$f" SPEC || echo '?')|$(env_get "$f" MODEL || echo '?')"
    printf '  %-28s port=%-5s ctx=%-7s fa=%-5s spec=%s\n' "$(basename "$f")" \
      "$(cut -d'|' -f1 <<<"$vals")" "$(cut -d'|' -f2 <<<"$vals")" \
      "$(cut -d'|' -f3 <<<"$vals")" "$(cut -d'|' -f4 <<<"$vals")"
    printf '  %-28s %s\n' '' "$(cut -d'|' -f5 <<<"$vals")"
    # A '?' is a key this script could not read out of a file that EXISTS — a malformed
    # env file, not a default. It is an unknown reading and it counts.
    if [[ "$vals" == *'?'* ]]; then
      warn "     ^ a value above could not be read from $(basename "$f") — UNKNOWN, not a default"
      rc=2
    fi
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
    # `|| true`: `nv` wraps nvidia-smi in `timeout`, which exits 124 on a wedged driver —
    # and an unguarded pipeline under `set -e -o pipefail` would end `status` right here,
    # printing nothing about the cards and nothing below them either.
    nv --query-gpu=index,memory.used,memory.total,temperature.gpu,power.draw \
      --format=csv,noheader 2>/dev/null | sed 's/^/    GPU /' || true
    local pid unit comm
    while IFS=$'\t' read -r pid unit comm; do
      [[ -n "$pid" ]] || continue
      printf '    held by pid %-8s %-24s %s\n' "$pid" "$comm" "$unit"
    done < <(gpu_busy_procs)
    # ⚠ The units are enumerated from systemd and the cards from nvidia-smi, so the two
    # can disagree — and that disagreement used to be INVISIBLE: the only tell was a
    # "held by" line naming a unit the Units table did not contain, and nothing flagged
    # it while the run exited 0. A card absent from a list that was READ is an answer in
    # its own right (the dashboard was ruled to render exactly this as
    # `card not enumerated`, dashboard/SPEC.md), not a missing reading.
    local orphan_i
    orphan_i="$(list_minus "$(pg_instances)" "$(gpu_indices)")"
    if [[ -n "$orphan_i" ]]; then
      warn "⚠ instance(s) $(tr '\n' ' ' <<<"$orphan_i")are known to systemd or configured in"
      warn "     ${ENVDIR}, but their cards are NOT in the list nvidia-smi just returned."
      warn "     A card that has left the PCIe bus looks exactly like this, and this box has"
      warn "     no BMC to notice. Check: nvidia-smi -L; lspci | grep -i nvidia; dmesg | grep -i xid"
      rc=2
    fi
  else
    warn "nvidia-smi is missing — card state UNKNOWN (not 'idle')"
    rc=2
  fi

  echo
  bold "Firewall"
  for p in $(ports_of_mode per-gpu); do
    local urc; set +e; ufw_port_state "$p"; urc=$?; set -e
    case "$urc" in
      0) if [[ "$UFW_MATCH_ACTION" == LIMIT ]]; then
           ok "ufw covers ${p}/tcp inbound and is enforcing (a LIMIT rule: allow, rate-limited)"
         else
           ok "ufw covers ${p}/tcp inbound and is enforcing"
         fi ;;
      2) warn "ufw is NOT enforcing — ${p} is open to anything routable. Its rule table is"
         warn "     not readable while it is down: sudo ufw show added" ;;
      3) warn "ufw has NO inbound ALLOW rule for ${p}/tcp" ;;
      5) warn "ufw: a rule line could not be parsed and nothing matched ${p}/tcp — check by hand"
         rc=2 ;;
      # ⚠ `ufw status` is root-only, so an unprivileged `status` CANNOT evaluate this. That
      # is the live-box case, not a hypothetical, and making it exit 2 would mean the code
      # never distinguishes anything. It is reported as unknown and named as root-gated;
      # as ROOT the same answer means ufw is absent or unreadable, which is a real unknown
      # and does count. Either way the closing line below now says which.
      *) if (( EUID == 0 )); then
           warn "ufw: the rule set for ${p}/tcp cannot be read even as root — is ufw installed?"
           rc=2
         else
           info "ufw state for ${p}/tcp: unknown — root-gated ('ufw status' refuses as a plain"
           info "     user). Re-run with sudo for this check to be evaluated at all."
         fi ;;
    esac
  done

  if [[ "$running" == split ]]; then dashboard_caveat; fi
  echo
  # ⚠ This sentence used to claim the code counts unknowns while nothing but the missing
  # nvidia-smi actually moved it — so a run whose own two lines above said "unknown" twice
  # printed "exit code 0", which is what any automation reading $? would see. It now says
  # exactly what the number means, and the unknowns that DO move it move it.
  info "exit code ${rc}: 0 = enabled and running agree and every check above was evaluated;"
  info "     2 = they do not agree, or a reading the verdict rests on could not be taken."
  info "     Checks that are root-gated (ufw, as a plain user) are reported as unknown and"
  info "     deliberately do NOT change the code — re-run with sudo to have them count."
  return "$rc"
}

# ------------------------------------------------------------------------ main
CVD="${CVD:-}"

CMD=""
POS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY=1; shift ;;
    --bootstrap) BOOTSTRAP=1; shift ;;
    -h|--help)   usage 0 ;;
    split|per-gpu|status)
      # ⚠ A SECOND subcommand must not silently win. `serving-mode.sh split per-gpu`
      # used to run per-gpu — the LAST one seen — so a typo could switch the box to
      # the mode the operator did not ask for, on a live machine, with the banner
      # quietly naming the other mode. Refuse instead.
      [[ -z "$CMD" ]] || die "two subcommands given ('${CMD}' then '$1') — say exactly one"
      CMD="$1"; shift ;;
    *)
      [[ "$CMD" == split || "$CMD" == per-gpu ]] || die "unknown argument: $1"
      # ⚠ And only ONE positional. `split 163840 262144` used to take the first and
      # drop the rest without a word.
      (( ${#POS[@]} == 0 )) || die "too many arguments: '${POS[0]}' then '$1' — split takes at most one CTX"
      POS+=("$1"); shift ;;
  esac
done

# The two enumerations, taken ONCE and only for the subcommands that need them, so every
# block of one run's output agrees with every other and `--help` runs no probes.
#   PG_INSTANCES — which per-GPU units EXIST, from systemd (+ env files + cards).
#   CVD          — CUDA_VISIBLE_DEVICES for the split unit: every visible CARD, in order.
#                  Cards are genuinely the subject here, so nvidia-smi is the right source;
#                  it is NOT the right source for the unit list (see compute_pg_instances).
case "$CMD" in
  split|per-gpu|status)
    [[ -n "$PG_INSTANCES" ]] || PG_INSTANCES="$(compute_pg_instances)"
    if [[ -z "$CVD" ]]; then CVD="$(gpu_indices | paste -sd, - 2>/dev/null || true)"; CVD="${CVD:-0,1}"; fi ;;
esac

case "$CMD" in
  split)   cmd_switch split ${POS[0]+"${POS[0]}"} ;;
  per-gpu) cmd_switch per-gpu ${POS[0]+"${POS[0]}"} ;;
  status)  cmd_status ;;
  *)       usage 1 ;;
esac
