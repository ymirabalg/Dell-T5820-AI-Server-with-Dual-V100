#!/usr/bin/env bash
#
# thermal-soak.sh — load every GPU simultaneously and log what happens.
#
# Runs ON THE SERVER. Every plateau figure in CLAUDE.md came from this: one
# llama-bench per card, started together, with per-sample telemetry for GPU
# temperature and power plus every dell_smm fan channel and thermal sensor.
#
#   ./thermal-soak.sh MODEL.gguf [TAG]
#   LIMIT=78 REPS=6 ./thermal-soak.sh ~/models/foo.gguf ch5-only
#
# Writes TAG.csv (telemetry) and TAG.log (outcome). Kills both workloads if any
# card reaches LIMIT, and records whether it aborted or ran to completion — that
# distinction matters more than the peak, because a run that COMPLETES has found
# an equilibrium while one that aborts was still climbing.
#
set -uo pipefail

MODEL="${1:-}"; TAG="${2:-soak}"
LIMIT="${LIMIT:-78}"
REPS="${REPS:-6}"
PROMPT="${PROMPT:-32768}"
BIN="${BIN:-$HOME/llama.cpp/build/bin/llama-bench}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  \033[36m·\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
usage(){ sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

[[ -n "$MODEL" ]] || usage 1
[[ -r "$MODEL" ]] || die "model not readable: $MODEL"
[[ -x "$BIN"   ]] || die "llama-bench not found at $BIN"
command -v nvidia-smi >/dev/null || die "nvidia-smi not found"

# Each instance holds a FULL copy of the weights on its own card, so anything already
# resident competes. Refuse rather than fail cryptically half a minute in.
USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | sort -rn | head -1)
(( USED < 2000 )) || die "a GPU is holding ${USED} MiB — stop other workloads first
  e.g. sudo systemctl stop llama-server@0 llama-server@1"

H=$(for d in /sys/class/hwmon/hwmon*; do
      [[ "$(cat "$d/name" 2>/dev/null)" == "dell_smm" ]] && echo "$d"; done)
NGPU=$(nvidia-smi --query-gpu=index --format=csv,noheader | wc -l | tr -d ' ')
OUT="$HOME/${TAG}.csv"; LOG="$HOME/${TAG}.log"

# Column set is discovered, not hardcoded: fan count differs with and without the
# 5-fan module, and the hwmon node index moves between boots.
FANS=(); for f in "$H"/fan*_input; do [[ -e "$f" ]] && FANS+=("$(basename "${f%_input}")"); done
TEMPS=(); for f in "$H"/temp*_input; do [[ -e "$f" ]] && TEMPS+=("$(basename "${f%_input}")"); done

bold "Thermal soak: ${TAG}"
info "model   $(basename "$MODEL")"
info "load    ${NGPU} × llama-bench -p ${PROMPT} -n 128 -r ${REPS} -sm none"
info "guard   ${LIMIT}C   channels: ${FANS[*]}   sensors: ${TEMPS[*]}"

{ printf "t_s"; for g in $(seq 0 $((NGPU-1))); do printf ",gpu%s_t,gpu%s_w" "$g" "$g"; done
  for f in "${FANS[@]}"; do printf ",%s" "$f"; done
  for t in "${TEMPS[@]}"; do printf ",%s" "$t"; done; echo; } > "$OUT"

PIDS=()
for g in $(seq 0 $((NGPU-1))); do
  CUDA_VISIBLE_DEVICES="$g" "$BIN" -m "$MODEL" -p "$PROMPT" -n 128 -r "$REPS" \
    -ngl 99 -sm none > "$HOME/${TAG}-gpu${g}.log" 2>&1 &
  PIDS+=($!)
done

start=$(date +%s); ABORTED=0
alive() { local p; for p in "${PIDS[@]}"; do kill -0 "$p" 2>/dev/null && return 0; done; return 1; }
while alive; do
  mapfile -t T < <(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
  mapfile -t W < <(nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits)
  { printf "%s" "$(( $(date +%s) - start ))"
    for g in $(seq 0 $((NGPU-1))); do printf ",%s,%s" "${T[$g]}" "${W[$g]}"; done
    for f in "${FANS[@]}"; do printf ",%s" "$(cat "$H/${f}_input")"; done
    for t in "${TEMPS[@]}"; do printf ",%s" "$(( $(cat "$H/${t}_input") / 1000 ))"; done
    echo; } >> "$OUT"
  for t in "${T[@]}"; do
    if (( t >= LIMIT )); then
      echo "ABORT: a GPU reached ${t}C (limit ${LIMIT}C)" | tee -a "$LOG"
      kill -TERM "${PIDS[@]}" 2>/dev/null; sleep 2; kill -KILL "${PIDS[@]}" 2>/dev/null
      ABORTED=1; break 2
    fi
  done
  sleep 5
done
wait "${PIDS[@]}" 2>/dev/null

echo "aborted=${ABORTED} duration=$(( $(date +%s) - start ))s" >> "$LOG"
echo
bold "Plateau (last third of the run)"
awk -F, -v n="$NGPU" 'NR>1{r[NR]=$0; last=$1}
  END{ from=last/3*2
       for(k in r){ split(r[k],c,","); if(c[1]>=from){ m++
         for(g=0; g<n; g++){ s[g]+=c[2+g*2]; if(c[2+g*2]>mx[g])mx[g]=c[2+g*2] } } }
       for(g=0; g<n; g++) printf "  GPU%d  mean %.1f C  max %d C\n", g, s[g]/m, mx[g]
       printf "  (%d samples from t=%ds)\n", m, from }' "$OUT"
echo
(( ABORTED )) && printf '  \033[31m✗\033[0m aborted — still climbing, not an equilibrium\n' \
              || printf '  \033[32m✓\033[0m completed — the plateau above is real\n'
