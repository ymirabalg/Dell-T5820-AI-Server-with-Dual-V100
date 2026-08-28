#!/usr/bin/env bash
#
# gpu-fan-control.sh — drive a chassis fan header from NVIDIA GPU temperature.
#
# Reads every GPU's temperature, takes the hottest, maps it through a fan curve
# and writes the result to one PWM channel of the motherboard's fan controller.
# Intended for passively-cooled cards (Tesla V100) fed by a fan hub.
#
#   sudo ./gpu-fan-control.sh list            # fan channels, RPM, PWM — start here
#   ./gpu-fan-control.sh monitor [SECS]       # no root: log RPM vs temps as CSV
#   sudo ./gpu-fan-control.sh probe [CH]      # ramp a channel to find which header it is
#   sudo ./gpu-fan-control.sh status          # one-shot: temps, target, RPM
#   sudo ./gpu-fan-control.sh run [--once]    # the control loop (what the service runs)
#   sudo ./gpu-fan-control.sh install         # /usr/local/sbin + systemd unit + config
#   sudo ./gpu-fan-control.sh uninstall       # stop, disable, hand fans back to the EC
#   sudo ./gpu-fan-control.sh restore         # hand fans back to the EC right now
#   sudo ./gpu-fan-control.sh failsafe        # park at STOP_STATE (systemd calls this)
#
# Config lives in /etc/gpu-fan-control.conf and overrides the DEFAULTS below.
# --dry-run works on every subcommand: it prints writes instead of making them.
#
set -euo pipefail

CONF="/etc/gpu-fan-control.conf"
UNIT="/etc/systemd/system/gpu-fan-control.service"
SBIN="/usr/local/sbin/gpu-fan-control.sh"

# ------------------------------------------------------------------- DEFAULTS
HWMON_NAME="dell_smm"   # hwmon driver that owns the fan headers
# Confirmed by probe on 2026-08-15: channel 5 is the PCIe/GPU header (FAN_HDD),
# 2586 RPM at pwm=128 vs 14451 at pwm=255. It only exists when the 5-fan module
# from dell-smm-5fan.sh is loaded; the stock driver stops at pwm4.
# Channels to drive, space separated — IDENTIFY EACH WITH `probe` FIRST.
# Confirmed on THIS board (single-socket 5820) 2026-08-27:
#   5 = FAN_HDD, the PCIe/GPU header feeding the card shroud fans
#   2 = the OEM fan in the GPU area. On a DUAL-socket 5810 this position is the
#       secondary CPU fan; with one socket there is no second CPU and the position
#       sits in the PCIe airflow path. Do not trust the 5810 fan map on this board.
# Every listed channel gets the same curve, hand-back band and dwell, because they
# are all driven from the same GPU temperature.
PWM_CHANNELS="${PWM_CHANNELS:-5 2}"
PWM_CHANNEL="${PWM_CHANNEL:-}"   # back-compat: older configs set a single channel

# STAGED CONTROL. Each entry is  channel:engage[:release[:dwell_up]]  in degC/seconds.
# Tiers escalate independently, so the quiet channel runs alone until the GPUs are
# genuinely being squeezed and only then do the loud ones join.
#
#   5:55:51      shroud fans — the primary, reacts immediately
#   2:68:60:30   GPU-area OEM fan — only under sustained both-card load
#   3:78:70:30   emergency only; never fires at the measured 74.3 C plateau
#
# ⚠ The RELEASE point must sit well below ENGAGE, because each tier COOLS THE THING IT
# MEASURES. Fan 2 is worth 1-2 C, so a narrow band would oscillate: cross 68, engage,
# drop to 66.5, release, climb back. An 8 C band is far wider than any tier's effect.
# ⚠ dwell_up stops a brief prefill spike escalating; leave it 0 on the primary tier so
# real cooling is never delayed.
# Empty PWM_TIERS falls back to PWM_CHANNELS + AUTO_BELOW (every channel, one threshold).
# Default EMPTY on purpose: upgrading the script must not silently restage an existing
# install. `install` writes the staged default into a NEW config; adopting it on an
# existing one is an explicit edit.
PWM_TIERS="${PWM_TIERS:-}"
# Measured on this hardware 2026-08-27: channel 5 gives 989 RPM at LOW, 4465 at
# HIGH, and the EC's own automatic duty sits at 2210 — i.e. LOW is less than HALF
# the airflow the EC provides unattended. So LOW is never a useful state here, and
# the curve is deliberately binary: EC auto below AUTO_BELOW, HIGH at or above it.
CURVE="55:100"          # degC:percent, ascending, interpolated
# dell_smm has no true PWM: it quantizes 0-255 onto three EC fan states, so the
# curve output lands in one of OFF (0-63), LOW (64-191), HIGH (192-255). Keeping
# MIN_PCT above 25% is what stops a cool GPU from switching the fans off.
MIN_PCT=50              # never below this while the service runs
PWM_OFF_CEILING=63      # any pwm at or under this stops the fan completely
MAX_PCT=100
HYSTERESIS=4            # degC the temp must fall before the fan is allowed to slow
INTERVAL=5              # seconds between samples
FAILSAFE_PCT=100        # applied when GPU temperature cannot be read
FAILSAFE_AFTER=3        # consecutive read failures before failsafe kicks in
# What to leave behind when the service stops. The EC knows nothing about a GPU,
# so handing a passively-cooled card back to an ambient-driven curve is the wrong
# default; "high" is loud but safe. Use `restore` to give the EC control back.
STOP_STATE="high"       # high | auto
# Below this GPU temperature the channel is handed BACK to the EC instead of being
# driven at LOW, because LOW is measurably worse than EC automatic on this board.
# Set 0 to disable and let CURVE/MIN_PCT own the channel at all times.
AUTO_BELOW=55           # degC; 0 disables the hand-back band
# Inertia on the way down. A passive card's die cools far faster than the heatsink
# and the air around it, so releasing the moment the sensor dips leaves stored heat
# in the mass and the next load starts from a warmer baseline. Hold HIGH this many
# seconds after the release condition first holds. 0 disables.
HIGH_DWELL=30           # seconds to keep HIGH after it would otherwise release
NVIDIA_SMI="nvidia-smi"
CPU_ABORT_TEMP=85       # probe aborts if the CPU package gets this hot

DRY_RUN=0
ONCE=0
PROBE_TARGETS=""        # set by `probe`; declared here so its EXIT trap is `set -u` safe

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# Service output goes to the journal, which adds its own clock; a terminal does not.
log() {
  if [[ -t 1 ]]; then printf '%s\n' "$*"
  else printf '%s %s\n' "$(date -Is)" "$*"; fi
}

usage() {
  sed -n '3,21p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

CMD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY_RUN=1; shift ;;
    --once)     ONCE=1; shift ;;
    -c|--config) CONF="${2:?-c needs a path}"; shift 2 ;;
    -h|--help)  usage 0 ;;
    -*)         die "unknown option: $1  (try --help)" ;;
    *)          if [[ -z "$CMD" ]]; then CMD="$1"; else ARG="$1"; fi; shift ;;
  esac
done
ARG="${ARG:-}"
[[ -n "$CMD" ]] || usage 1

# Config is sourced, so a syntax error there would take the script down with a
# bare bash message; name the file so the cause is obvious.
if [[ -f "$CONF" ]]; then
  # shellcheck disable=SC1090
  source "$CONF" || die "failed to parse $CONF"
fi

# ------------------------------------------------------------------- hwmon I/O
HWMON=""
find_hwmon() {
  local h
  for h in /sys/class/hwmon/hwmon*; do
    [[ -r "$h/name" ]] || continue
    if [[ "$(<"$h/name")" == "$HWMON_NAME" ]]; then HWMON="$h"; return 0; fi
  done
  die "no hwmon device named '$HWMON_NAME' — run 'list' to see what is present"
}

# dell_smm answers some SMM calls and refuses others, so a read that fails is
# normal here and must not abort the loop under `set -e`.
read_attr() { cat "$HWMON/$1" 2>/dev/null || true; }

# For display only: read_attr yields an empty string on refusal, which would
# print as a blank column; show a dash instead.
read_dash() { local v; v="$(read_attr "$1")"; printf '%s' "${v:--}"; }

write_attr() {
  local attr="$1" val="$2"
  if [[ $DRY_RUN -eq 1 ]]; then
    info "dry-run: $val > $HWMON/$attr"
    return 0
  fi
  printf '%s' "$val" > "$HWMON/$attr" 2>/dev/null \
    || { warn "write failed: $val > $HWMON/$attr"; return 1; }
}

need_root() {
  [[ $DRY_RUN -eq 1 ]] && return 0
  [[ "$(id -u)" -eq 0 ]] || die "must run as root (fan control needs CAP_SYS_ADMIN)"
}

TIER_CH=(); TIER_ON=(); TIER_OFF=(); TIER_UPD=()

# Builds the tier table. Older configs set PWM_CHANNEL or PWM_CHANNELS with a single
# AUTO_BELOW; those become one tier per channel at the same threshold, so upgrading the
# script never silently changes behaviour.
resolve_channels() {
  TIER_CH=(); TIER_ON=(); TIER_OFF=(); TIER_UPD=()
  local spec="${PWM_TIERS:-}"
  if [[ -z "${spec// /}" ]]; then
    [[ -n "${PWM_CHANNEL:-}" ]] && PWM_CHANNELS="$PWM_CHANNEL"
    local c
    for c in $PWM_CHANNELS; do
      spec+=" ${c}:${AUTO_BELOW}:$(( AUTO_BELOW - HYSTERESIS )):0"
    done
  fi
  local e ch on off upd
  for e in $spec; do
    IFS=: read -r ch on off upd <<<"$e"
    [[ "$ch" =~ ^[0-9]+$ && "$on" =~ ^[0-9]+$ ]] \
      || die "bad PWM_TIERS entry '$e' — want channel:engage[:release[:dwell_up]]"
    [[ -n "${off:-}" ]] || off=$(( on - HYSTERESIS ))
    [[ -n "${upd:-}" ]] || upd=0
    (( off < on )) || die "PWM_TIERS '$e': release ($off) must be below engage ($on)"
    # A band narrower than a tier's own cooling effect oscillates. 1-2 C is what a
    # chassis tier is worth here, so anything under 3 C is refused outright.
    (( on - off >= 3 )) || die "PWM_TIERS '$e': band is $(( on - off ))C — too narrow, it will oscillate"
    TIER_CH+=("$ch"); TIER_ON+=("$on"); TIER_OFF+=("$off"); TIER_UPD+=("$upd")
  done
  (( ${#TIER_CH[@]} > 0 )) || die "no channels configured — set PWM_TIERS or PWM_CHANNELS in $CONF"
  PWM_CHANNELS="${TIER_CH[*]}"
}

# `pwmN_enable` readback is NOT trustworthy on this board: it reports 2 ("EC auto")
# even while a manual state is in force, because the driver never sends the command
# that truly disables BIOS fan control (this machine is not in the kernel whitelist).
# Trusting it made every cycle issue TWO SET_FAN calls — enable=1 and pwm — where one
# would do, and channel 2 began oscillating. So: assert enable only on the engage
# transition, then write pwm alone. One SMM call per channel per cycle.
set_channel_pwm() {
  local ch="$1" pwm="$2" claim="${3:-0}"
  if (( claim )); then
    write_attr "pwm${ch}_enable" 1 || return 1
  fi
  write_attr "pwm${ch}" "$pwm"
}
set_channel_auto() { write_attr "pwm${1}_enable" 2 || true; }
# The first listed channel is what single-channel status output refers to.
primary_channel() { echo "${PWM_CHANNELS%% *}"; }

channels() {
  local f n
  for f in "$HWMON"/fan*_input; do
    [[ -e "$f" ]] || continue
    n="${f##*/fan}"; echo "${n%%_input}"
  done
}

pct_to_pwm() { echo $(( $1 * 255 / 100 )); }

cpu_temp() {
  local h t
  for h in /sys/class/hwmon/hwmon*; do
    [[ -r "$h/name" && "$(<"$h/name")" == "coretemp" ]] || continue
    t="$(cat "$h/temp1_input" 2>/dev/null || echo 0)"
    echo $(( t / 1000 )); return 0
  done
  echo 0
}

# --------------------------------------------------------------------- the GPU
# Prints the hottest GPU temperature, or nothing if the query failed. A card in
# a bad state reports "[N/A]" or "[Unknown Error]" rather than exiting non-zero,
# so non-numeric rows are dropped instead of trusted.
gpu_max_temp() {
  local out max="" t
  out="$(timeout 5 "$NVIDIA_SMI" --query-gpu=temperature.gpu \
         --format=csv,noheader,nounits 2>/dev/null)" || return 1
  while read -r t; do
    t="${t//[[:space:]]/}"
    [[ "$t" =~ ^[0-9]+$ ]] || continue
    # `if` rather than `[[ ]] && max=`: a false test on the last input line
    # would make the whole while-loop return 1 and trip `set -e`.
    if [[ -z "$max" ]] || (( t > max )); then max="$t"; fi
  done <<< "$out"
  [[ -n "$max" ]] || return 1
  echo "$max"
}

gpu_count() {
  timeout 5 "$NVIDIA_SMI" --query-gpu=index --format=csv,noheader 2>/dev/null | grep -c . || true
}

# --------------------------------------------------------------------- the curve
validate_curve() {
  local point t p last=-1
  [[ -n "$CURVE" ]] || die "CURVE is empty"
  for point in $CURVE; do
    [[ "$point" =~ ^[0-9]+:[0-9]+$ ]] || die "bad CURVE point '$point' (want degC:percent)"
    t="${point%%:*}"; p="${point##*:}"
    (( t > last )) || die "CURVE must ascend by temperature — '$point' follows ${last}"
    (( p <= 100 )) || die "CURVE percent >100 in '$point'"
    last="$t"
  done
  (( MIN_PCT <= MAX_PCT )) || die "MIN_PCT ($MIN_PCT) exceeds MAX_PCT ($MAX_PCT)"
  # A floor inside the OFF band would silently stop the GPU fans on an idle card,
  # which is the one failure this whole service exists to prevent.
  (( $(pct_to_pwm "$MIN_PCT") > PWM_OFF_CEILING )) \
    || die "MIN_PCT $MIN_PCT%% maps to pwm $(pct_to_pwm "$MIN_PCT"), which the EC reads as fan OFF"

  [[ "$AUTO_BELOW" =~ ^[0-9]+$ ]] || die "AUTO_BELOW must be a whole number of degC"
  # The hand-back has to sit above the hysteresis band, or the release threshold
  # (AUTO_BELOW - HYSTERESIS) goes negative and the channel never returns to auto.
  (( AUTO_BELOW == 0 || AUTO_BELOW > HYSTERESIS )) \
    || die "AUTO_BELOW ($AUTO_BELOW) must exceed HYSTERESIS ($HYSTERESIS), or be 0 to disable"

  [[ "$HIGH_DWELL" =~ ^[0-9]+$ ]] || die "HIGH_DWELL must be a whole number of seconds"
  # The dwell is evaluated once per sample, so anything under one INTERVAL cannot
  # actually delay a release and would only look like it was doing something.
  (( HIGH_DWELL == 0 || HIGH_DWELL >= INTERVAL )) \
    || die "HIGH_DWELL ($HIGH_DWELL s) is below INTERVAL ($INTERVAL s) — it would never take effect"
}

# Linear interpolation between curve points; flat below the first and above the last.
curve_pct() {
  local t="$1" point cur_t cur_p prev_t="" prev_p="" out
  for point in $CURVE; do
    cur_t="${point%%:*}"; cur_p="${point##*:}"
    if (( t <= cur_t )); then
      if [[ -z "$prev_t" ]]; then out="$cur_p"
      else out=$(( prev_p + ( (t - prev_t) * (cur_p - prev_p) ) / (cur_t - prev_t) ))
      fi
      break
    fi
    prev_t="$cur_t"; prev_p="$cur_p"
    out="$cur_p"
  done
  (( out < MIN_PCT )) && out="$MIN_PCT"
  (( out > MAX_PCT )) && out="$MAX_PCT"
  echo "$out"
}

# --------------------------------------------------------------------- applying
apply_pct() {
  local pct="$1" pwm
  pwm="$(pct_to_pwm "$pct")"
  # Re-assert manual mode every time: the EC is free to take the channel back,
  # and a silently-reverted pwm_enable would leave the GPUs on an ambient curve.
  local ch rc=0
  for ch in $PWM_CHANNELS; do
    set_channel_pwm "$ch" "$pwm" 1 || rc=1
  done
  return $rc
}

restore_auto() {
  [[ -n "$HWMON" ]] || return 0
  local ch
  for ch in $PWM_CHANNELS; do write_attr "pwm${ch}_enable" 2 || true; done
}

# Where the channel is parked when the control loop goes away for any reason.
apply_stop_state() {
  case "$STOP_STATE" in
    auto) restore_auto ;;
    high) apply_pct 100 || restore_auto ;;
    *)    warn "unknown STOP_STATE '$STOP_STATE' — falling back to high"
          apply_pct 100 || restore_auto ;;
  esac
}

# ------------------------------------------------------------------ subcommands
cmd_list() {
  local h ch
  bold "hwmon devices"
  for h in /sys/class/hwmon/hwmon*; do
    printf '  %-24s %s\n' "$(basename "$h")" "$(cat "$h/name" 2>/dev/null)"
  done
  echo
  find_hwmon
  bold "fan channels on $HWMON_NAME ($HWMON)"
  printf '  %-4s %-18s %-8s %-8s %-8s %s\n' CH LABEL RPM MAX PWM ENABLE
  for ch in $(channels); do
    printf '  %-4s %-18s %-8s %-8s %-8s %s\n' \
      "$ch" \
      "$(read_dash "fan${ch}_label")" \
      "$(read_dash "fan${ch}_input")" \
      "$(read_dash "fan${ch}_max")" \
      "$(read_dash "pwm${ch}")" \
      "$(read_dash "pwm${ch}_enable")"
  done
  echo
  info "enable 2 = firmware/EC automatic, 1 = manual (this script)"
  info "an empty PWM column means the EC refuses the read — see 'probe'"
}

# Read-only counterpart to `probe`, for when you cannot get a root shell: instead
# of driving the fans, log them while something else drives the heat. A channel
# that ramps with CPU load belongs to the CPU zone; one that ignores CPU load but
# follows drive temperature is the drive zone. CSV so it can be diffed or plotted.
cmd_monitor() {
  find_hwmon
  local secs="${ARG:-120}" iv="${MONITOR_INTERVAL:-5}" ch h elapsed=0 nvmes=()

  for h in /sys/class/hwmon/hwmon*; do
    [[ -r "$h/name" && "$(<"$h/name")" == "nvme" ]] && nvmes+=("$h")
  done

  printf 'elapsed'
  for ch in $(channels); do printf ',fan%s' "$ch"; done
  printf ',cpu'
  for h in "${nvmes[@]}"; do printf ',%s' "$(basename "$h")"; done
  printf '\n'

  while (( elapsed <= secs )); do
    printf '%s' "$elapsed"
    for ch in $(channels); do printf ',%s' "$(read_dash "fan${ch}_input")"; done
    printf ',%s' "$(cpu_temp)"
    for h in "${nvmes[@]}"; do
      printf ',%s' "$(( $(cat "$h/temp1_input" 2>/dev/null || echo 0) / 1000 ))"
    done
    printf '\n'
    sleep "$iv"
    elapsed=$(( elapsed + iv ))
  done
}

# Identify a header by making its fan audibly and measurably change speed. Ramps
# up before down, and never to zero, so a mis-guessed CPU-fan channel does not
# park a heatsink fan while the probe runs.
cmd_probe() {
  need_root
  find_hwmon
  # NOT `local`: probe_cleanup runs on EXIT, by which point this function has
  # already returned and a local would be out of scope — `set -u` would then kill
  # the trap and make a successful probe exit non-zero.
  PROBE_TARGETS="${ARG:-$(channels)}"
  local ch step other t
  bold "Probing fan channels: $(echo "$PROBE_TARGETS" | tr '\n' ' ')"
  warn "fans will change speed — watch and listen to identify each header"
  echo

  # Ctrl-C during a ramp would otherwise leave that channel pinned in manual
  # mode, so hand every channel back to the EC on any exit path.
  probe_cleanup() {
    local rc=$? c
    trap - EXIT INT TERM
    for c in ${PROBE_TARGETS:-}; do write_attr "pwm${c}_enable" 2 >/dev/null 2>&1 || true; done
    (( rc == 0 )) || warn "interrupted — all probed channels returned to EC automatic"
    exit "$rc"
  }
  trap probe_cleanup EXIT INT TERM

  for ch in $PROBE_TARGETS; do
    [[ -e "$HWMON/pwm${ch}" ]] || { warn "channel $ch has no pwm attribute — skipping"; continue; }
    bold "channel $ch"
    write_attr "pwm${ch}_enable" 1 || { warn "cannot take manual control of channel $ch"; continue; }
    # Only two steps, because the EC only has two usable states: 255 -> HIGH,
    # 128 -> LOW. Intermediate values quantize onto these same two, and anything
    # at or below 63 would stop the fan, so the ramp never goes there.
    for step in 255 128; do
      t="$(cpu_temp)"
      if (( t >= CPU_ABORT_TEMP )); then
        warn "CPU at ${t}C — aborting probe and restoring automatic control"
        write_attr "pwm${ch}_enable" 2 || true
        return 1
      fi
      write_attr "pwm${ch}" "$step" || true
      sleep 6
      printf '    pwm=%-4s ->' "$step"
      for other in $(channels); do
        printf ' fan%s=%-6s' "$other" "$(read_dash "fan${other}_input")"
      done
      printf '  cpu=%sC\n' "$(cpu_temp)"
    done
    write_attr "pwm${ch}_enable" 2 || true
    ok "channel $ch back on automatic"
    echo
  done
  info "any channel whose fanN RPM tracked the pwm steps can be added to PWM_CHANNELS"
}

cmd_status() {
  find_hwmon
  local temp pct n
  n="$(gpu_count)"
  if temp="$(gpu_max_temp)"; then
    pct="$(curve_pct "$temp")"
    printf '  GPUs        %s (hottest %sC)\n' "$n" "$temp"
    printf '  curve says  %s%% (pwm %s)\n' "$pct" "$(pct_to_pwm "$pct")"
  else
    printf '  GPUs        %s — temperature unreadable, failsafe would be %s%%\n' \
      "${n:-0}" "$FAILSAFE_PCT"
  fi
  printf '  channel %-3s pwm=%s enable=%s rpm=%s\n' \
    "$(primary_channel)" \
    "$(read_dash "pwm$(primary_channel)")" \
    "$(read_dash "pwm$(primary_channel)_enable")" \
    "$(read_dash "fan$(primary_channel)_input")"
  printf '  CPU package %sC\n' "$(cpu_temp)"
}

cmd_run() {
  need_root
  validate_curve
  find_hwmon

  # pwm5 exists only while the patched 5-fan module is loaded, and an insmod'd
  # module does not survive a reboot — so name that cause instead of implying the
  # channel number is simply wrong.
  local ch
  for ch in $PWM_CHANNELS; do
    [[ -e "$HWMON/pwm${ch}" ]] \
      || die "no pwm${ch} on $HWMON_NAME — run 'list' to see what exists.
  If the missing channel is 5, the stock driver caps at 4 fans: load the patched module
  with 'sudo dell-smm-5fan.sh load' (not persistent across reboots), or edit
  PWM_CHANNELS in $CONF to only channels that exist."
  done

  # No driver at all is a "not installed yet" state, not a fault: exit clean so
  # systemd's on-failure restart does not spin.
  if ! command -v "$NVIDIA_SMI" >/dev/null 2>&1; then
    warn "$NVIDIA_SMI not found — leaving fans on EC automatic and exiting"
    restore_auto
    exit 0
  fi

  local fails=0 temp pct now i ch on off upd
  local -a TIER_STATE=() TIER_UPS=() TIER_REL=()
  for i in "${!TIER_CH[@]}"; do TIER_STATE[i]=0; TIER_UPS[i]=0; TIER_REL[i]=0; done

  cleanup() {
    local rc=$?
    trap - EXIT INT TERM
    log "stopping — parking channels [$PWM_CHANNELS] at STOP_STATE=$STOP_STATE"
    apply_stop_state
    exit "$rc"
  }
  trap cleanup EXIT INT TERM
  trap 'RELOAD=1' HUP
  RELOAD=0

  local _t=""
  for i in "${!TIER_CH[@]}"; do
    _t+=" ch${TIER_CH[$i]}@${TIER_ON[$i]}/${TIER_OFF[$i]}"
    (( TIER_UPD[i] > 0 )) && _t+="+${TIER_UPD[$i]}s"
  done
  log "gpu-fan-control: tiers[${_t# }] interval=${INTERVAL}s"

  while :; do
    if (( RELOAD )); then
      RELOAD=0
      # shellcheck disable=SC1090
      [[ -f "$CONF" ]] && source "$CONF" && resolve_channels && validate_curve
      log "reloaded $CONF"
      for i in "${!TIER_CH[@]}"; do
        TIER_STATE[i]="${TIER_STATE[i]:-0}"; TIER_UPS[i]=0; TIER_REL[i]=0
      done
    fi

    if temp="$(gpu_max_temp)"; then
      (( fails > 0 )) && log "GPU temperature readable again (${temp}C)"
      fails=0
      pct="$(curve_pct "$temp")"
    else
      fails=$(( fails + 1 ))
      if (( fails == FAILSAFE_AFTER )); then
        warn "GPU temperature unreadable ${fails}x — failsafe ${FAILSAFE_PCT}%, ALL tiers"
      fi
      (( fails >= FAILSAFE_AFTER )) || { sleep "$INTERVAL" & wait $! || true; continue; }
      pct="$FAILSAFE_PCT"
      temp=999                       # forces every tier on, below
    fi

    now="$(date +%s)"
    for i in "${!TIER_CH[@]}"; do
      ch="${TIER_CH[$i]}"; on="${TIER_ON[$i]}"; off="${TIER_OFF[$i]}"; upd="${TIER_UPD[$i]}"

      if (( TIER_STATE[i] )); then
        # engaged: hold until temp clears the release point AND the dwell expires
        if (( temp <= off )); then
          if (( TIER_REL[i] == 0 )); then
            TIER_REL[i]="$now"
            log "gpu=${temp}C ch${ch} at release point (${off}C) — holding ${HIGH_DWELL}s"
          fi
          if (( now - TIER_REL[i] >= HIGH_DWELL )); then
            TIER_STATE[i]=0; TIER_REL[i]=0
            set_channel_auto "$ch"
            log "gpu=${temp}C -> ch${ch} back to EC auto"
            continue
          fi
        else
          TIER_REL[i]=0
        fi
        set_channel_pwm "$ch" "$(pct_to_pwm "$pct")" \
          || warn "could not set pwm${ch} — does this EC accept manual fan control?"
      else
        # idle: escalate only after temp has held at or above engage for dwell_up
        if (( temp >= on )); then
          (( TIER_UPS[i] == 0 )) && TIER_UPS[i]="$now"
          if (( now - TIER_UPS[i] >= upd )); then
            TIER_STATE[i]=1; TIER_UPS[i]=0
            if set_channel_pwm "$ch" "$(pct_to_pwm "$pct")" 1; then
              log "gpu=${temp}C -> ch${ch} ${pct}% (pwm $(pct_to_pwm "$pct")), engage ${on}C"
            else
              warn "could not set pwm${ch} — does this EC accept manual fan control?"
              TIER_STATE[i]=0
            fi
          fi
        else
          TIER_UPS[i]=0
          # Cheap re-assert: a competing writer could have taken the channel manual.
          [[ "$(read_attr "pwm${ch}_enable")" == "2" ]] || set_channel_auto "$ch"
        fi
      fi
    done

    (( ONCE )) && break
    # Backgrounded sleep so SIGTERM lands within milliseconds, not INTERVAL.
    sleep "$INTERVAL" & wait $! || true
  done
}

cmd_install() {
  need_root
  install -m 0755 "$0" "$SBIN"
  ok "installed $SBIN"

  if [[ -f "$CONF" ]]; then
    info "keeping existing $CONF"
  else
    cat > "$CONF" <<EOF
# gpu-fan-control.sh configuration.
# Identify the right channel first:  sudo $SBIN probe

HWMON_NAME="$HWMON_NAME"
# Staged control: channel:engage[:release[:dwell_up]] in degC / seconds.
# Identify every channel with \`probe\` before adding it.
#   ch5 = GPU shroud fans, the primary — reacts immediately
#   ch2 = GPU-area OEM fan  — sustained both-card load only
#   ch3/ch4 = emergency     — never fires at the measured 74.3 C plateau
# Release must sit well below engage: each tier cools the temperature it is reading,
# so a narrow band oscillates. The script refuses anything under 3 C.
PWM_TIERS="${PWM_TIERS:-5:55:51 2:68:60:30 3:78:70:30 4:78:70:30}"

# Legacy single-threshold form, used only when PWM_TIERS is empty.
PWM_CHANNELS="$PWM_CHANNELS"

# degC:percent, ascending. Interpolated between points, flat outside them.
CURVE="$CURVE"

MIN_PCT=$MIN_PCT
MAX_PCT=$MAX_PCT
HYSTERESIS=$HYSTERESIS
INTERVAL=$INTERVAL
FAILSAFE_PCT=$FAILSAFE_PCT
FAILSAFE_AFTER=$FAILSAFE_AFTER

# Where the channel is left when the service stops: "high" (loud, safe) or
# "auto" (hands the header back to the Dell EC, which cannot see GPU temps).
STOP_STATE="$STOP_STATE"

# Below this GPU temperature the channel goes back to the Dell EC rather than
# being driven at LOW. Measured 2026-08-27: LOW is 989 RPM on channel 5 against
# 2210 for EC automatic, so forcing LOW on a cool card is worse than doing
# nothing. 0 disables the band.
AUTO_BELOW=$AUTO_BELOW

# Seconds to keep HIGH after the release condition first holds, so the heatsink and
# surrounding air keep being purged after the die sensor has already dropped.
HIGH_DWELL=$HIGH_DWELL
EOF
    ok "wrote $CONF"
  fi

  cat > "$UNIT" <<EOF
[Unit]
Description=GPU temperature driven chassis fan control
Documentation=file:$SBIN
# NOT After=multi-user.target. This unit is WantedBy that target, so ordering it
# after the target is a cycle — and it stays invisible until something else orders
# itself after THIS unit. When llama-server@.service did exactly that, systemd broke
# the loop by silently dropping the llama-server start jobs, and the endpoints failed
# to come up on every boot with no error anywhere except the ordering-cycle line.
# All this really needs is the hwmon module, which is present well before here.
After=sysinit.target
# A missing pwm channel is a hard failure (see 'run'), and without a start limit
# Restart=on-failure would retry every RestartSec forever, filling the journal.
# The likely cause is DKMS failing to rebuild dell-smm-hwmon-5fan after a kernel
# upgrade, which drops pwm5. Give up after 5 tries so the unit sits visibly in
# 'failed' — losing GPU fan control must not fail quietly, but it must stop
# spinning. Check with: systemctl status gpu-fan-control
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
ExecStart=$SBIN run
# Belt and braces: the in-process trap handles SIGTERM, this covers SIGKILL.
ExecStopPost=$SBIN failsafe
Restart=on-failure
RestartSec=10
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF
  ok "wrote $UNIT"

  systemctl daemon-reload
  ok "systemd reloaded"
  echo
  info "start it with:  sudo systemctl enable --now gpu-fan-control"
  info "watch it with:  journalctl -u gpu-fan-control -f"
}

cmd_uninstall() {
  need_root
  systemctl disable --now gpu-fan-control 2>/dev/null || true
  find_hwmon
  restore_auto
  rm -f "$UNIT"
  systemctl daemon-reload
  ok "service removed; channels [$PWM_CHANNELS] back on EC automatic"
  info "left in place: $SBIN and $CONF"
}

cmd_restore() {
  find_hwmon
  restore_auto
  ok "channels [$PWM_CHANNELS] set to EC automatic"
}

# Config was sourced long before resolve_channels existed, so reconcile here — after
# every function is defined and before any subcommand runs.
resolve_channels

case "$CMD" in
  list)       cmd_list ;;
  monitor)    cmd_monitor ;;
  probe)      cmd_probe ;;
  status)     cmd_status ;;
  run)        cmd_run ;;
  install)    cmd_install ;;
  uninstall)  cmd_uninstall ;;
  restore)    need_root; cmd_restore ;;
  failsafe)   need_root; find_hwmon; apply_stop_state
              ok "channels [$PWM_CHANNELS] parked at STOP_STATE=$STOP_STATE" ;;
  *)          die "unknown command: $CMD  (try --help)" ;;
esac
