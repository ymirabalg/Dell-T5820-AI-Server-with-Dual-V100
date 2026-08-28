#!/usr/bin/env bash
#
# gpu-bench.sh — run a GPU workload under a thermal watchdog, with telemetry.
#
# Runs ON THE SERVER. Samples every GPU once a second while the workload runs,
# writes a CSV, and KILLS the workload if any card reaches the temperature limit.
# Built for passively-cooled Teslas whose fan control is not yet trustworthy.
#
#   ./gpu-bench.sh -- llama-bench -m model.gguf -p 512 -n 128 -ngl 99
#   ./gpu-bench.sh --limit 70 -- <command...>     # different abort temperature
#   ./gpu-bench.sh --csv run1.csv -- <command...> # where to write telemetry
#   ./gpu-bench.sh --watch                        # just watch temps, no workload
#
set -euo pipefail

# Measured 2026-08-27: this machine's own plateaus are 65.4 C (split), 74.2 C (single
# card) and ~77-80 C (both instances busy). A 65 C limit sits BELOW normal operating
# temperature and killed every soak at the moment it reached steady state — healthy runs
# read as thermal failures. 78 acts at 76, leaving 7 C to the 83 C spec and 11 to the
# 87 C slowdown. Lower it deliberately for an unproven cooling change, not by default.
LIMIT=78                 # abort if any GPU reaches this (degC)
MARGIN=2                 # act this many degrees early
INTERVAL=1               # seconds between samples
CSV=""
WATCH_ONLY=0

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '3,13p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)    LIMIT="${2:?--limit needs degC}"; shift 2 ;;
    --interval) INTERVAL="${2:?--interval needs seconds}"; shift 2 ;;
    --csv)      CSV="${2:?--csv needs a path}"; shift 2 ;;
    --watch)    WATCH_ONLY=1; shift ;;
    -h|--help)  usage 0 ;;
    --)         shift; break ;;
    *)          die "unexpected argument: $1  (workload goes after --)" ;;
  esac
done

command -v nvidia-smi >/dev/null || die "nvidia-smi not found"
ABORT_AT=$(( LIMIT - MARGIN ))
CSV="${CSV:-$HOME/gpu-bench-$(date +%Y%m%d-%H%M%S).csv}"

gpu_max_temp() {
  nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null \
    | sort -rn | head -1
}

sample_header() { echo "elapsed_s,gpu,temp_c,power_w,sm_clock_mhz,util_pct,throttle" ; }

sample_row() {
  local t="$1"
  nvidia-smi --query-gpu=index,temperature.gpu,power.draw,clocks.sm,utilization.gpu,clocks_throttle_reasons.active \
    --format=csv,noheader,nounits 2>/dev/null \
    | while IFS=, read -r idx temp pw clk util thr; do
        printf '%s,%s,%s,%s,%s,%s,%s\n' "$t" "${idx// /}" "${temp// /}" "${pw// /}" "${clk// /}" "${util// /}" "${thr// /}"
      done
}

# The watchdog is the whole point: never leave a passive card running unattended
# above a temperature nobody has validated the cooling against.
run_watchdog() {
  local pid="$1" start elapsed maxtemp breached=0
  start=$(date +%s)
  sample_header > "$CSV"
  while kill -0 "$pid" 2>/dev/null; do
    elapsed=$(( $(date +%s) - start ))
    sample_row "$elapsed" >> "$CSV"
    maxtemp="$(gpu_max_temp)"
    if [[ -n "$maxtemp" ]] && (( maxtemp >= ABORT_AT )); then
      breached=1
      warn "ABORT: a GPU hit ${maxtemp}C (limit ${LIMIT}C, acting at ${ABORT_AT}C)"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      kill -KILL "$pid" 2>/dev/null || true
      break
    fi
    sleep "$INTERVAL"
  done
  return $breached
}

summarise() {
  [[ -s "$CSV" ]] || { warn "no telemetry captured"; return 0; }
  bold "Telemetry summary  ($CSV)"
  awk -F, 'NR>1 && $2!="" {
      if ($3+0 > maxt[$2]) maxt[$2]=$3+0
      if ($4+0 > maxp[$2]) maxp[$2]=$4+0
      if ($5+0 > maxc[$2]) maxc[$2]=$5+0
      n[$2]++
      if ($7 != "Not Active" && $7 != "" ) thr[$2]=thr[$2] " " $7
    }
    END {
      for (g in maxt)
        printf "  GPU%s  max %sC   peak %sW   max SM %sMHz   samples %s\n", g, maxt[g], maxp[g], maxc[g], n[g]
      for (g in thr) if (thr[g] != "") printf "  GPU%s  THROTTLED:%s\n", g, thr[g]
    }' "$CSV"
}

if (( WATCH_ONLY )); then
  bold "Watching GPU temperatures (Ctrl-C to stop) — abort threshold ${ABORT_AT}C"
  while :; do
    nvidia-smi --query-gpu=index,temperature.gpu,power.draw,clocks.sm,utilization.gpu \
      --format=csv,noheader
    sleep "$INTERVAL"; echo "---"
  done
fi

[[ $# -gt 0 ]] || usage 1

bold "Workload: $*"
info "abort at ${ABORT_AT}C (limit ${LIMIT}C), sampling every ${INTERVAL}s"
info "telemetry: $CSV"
info "starting temps: $(nvidia-smi --query-gpu=index,temperature.gpu --format=csv,noheader | tr '\n' ' ')"
echo

"$@" &
WORKPID=$!

# If this script dies, do not leave the workload running unwatched.
cleanup() { kill -TERM "$WORKPID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

set +e
run_watchdog "$WORKPID"
BREACHED=$?
wait "$WORKPID" 2>/dev/null
RC=$?
set -e
trap - EXIT INT TERM

echo
summarise
echo
if (( BREACHED )); then
  die "workload was ABORTED on temperature — results are incomplete"
elif (( RC != 0 )); then
  warn "workload exited non-zero (rc=$RC)"
else
  ok "workload completed, thermals stayed under ${ABORT_AT}C"
fi
