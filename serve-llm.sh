#!/usr/bin/env bash
#
# serve-llm.sh — run llama-server as systemd services on the local network.
#
# Runs ON THE SERVER. Starts ONE INSTANCE PER GPU, each pinned to its own card,
# exposing an OpenAI-compatible endpoint gated by a shared API key with the
# firewall scoped to the local subnet. Only install/uninstall need root.
#
#   ./serve-llm.sh check              # preflight: binary, model, GPUs, ufw, cooling
#   sudo ./serve-llm.sh install       # key + template unit + ufw, then enable & start
#   sudo ./serve-llm.sh uninstall     # remove units and ufw rule (keeps the key)
#   ./serve-llm.sh status             # every instance, port, VRAM, temperature
#   ./serve-llm.sh test               # one round-trip through each instance
#   ./serve-llm.sh key-path           # where the key lives (never prints it)
#
#   --dry-run                         # print intended actions, change nothing
#
set -euo pipefail

SVC_USER="${SVC_USER:-yorman}"
SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
BIN="${BIN:-${SVC_HOME}/llama.cpp/build/bin/llama-server}"
MODEL="${MODEL:-${SVC_HOME}/models/Qwen3.6-27B-Q4_K_M.gguf}"
ALIAS="${ALIAS:-qwen3.6-27b}"
PORT_BASE="${PORT_BASE:-8080}"
# Measured 2026-08-27 on one V100 32 GiB: weights 18211 MiB + ~370 MiB fixed compute
# buffers + ~65 KiB/token of KV (few KV heads, GQA). So 131072 lands at 26902 MiB and
# leaves ~5.9 GiB spare; 262144 is a confirmed OOM. Well inside the model's 262K native
# range, so no YaRN scaling involved.
CTX="${CTX:-131072}"
SLOTS="${SLOTS:-1}"
LAN="${LAN:-192.168.4.0/22}"
KEYFILE="/etc/llama-server.apikey"
TMPL="/etc/systemd/system/llama-server@.service"
OLD_UNIT="/etc/systemd/system/llama-server.service"
DRY=0

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
run()   { if (( DRY )); then printf '  \033[35m→\033[0m would run: %s\n' "$*"; else "$@"; fi; }
need_root() { (( EUID == 0 )) || die "this subcommand needs root — re-run with sudo"; }

gpu_count() { nvidia-smi --query-gpu=index --format=csv,noheader 2>/dev/null | wc -l | tr -d ' '; }

# One instance per GPU, so the instance name IS the CUDA device index. Ports are
# PORT_BASE+index. Kept under 10 instances because the port suffix is a single digit.
instances() { local n; n="$(gpu_count)"; seq 0 $(( n - 1 )); }

# systemd cannot do arithmetic in a unit file, so "${PORT_BASE}%i" would CONCATENATE
# (8080 + instance 0 -> port 80800, above the 65535 limit). The port is computed here
# and handed to each instance through its own EnvironmentFile instead.
port_of() { echo $(( PORT_BASE + $1 )); }
ENVDIR="/etc/llama-server"

# Service runs unprivileged, so the key cannot be root-only; root:SVC_USER at 0640
# keeps it from every other account, and --api-key-file keeps it out of `ps`, which
# a bare --api-key would not.
ensure_key() {
  if [[ -s "$KEYFILE" ]]; then ok "api key exists: $KEYFILE (leaving it alone)"; return 0; fi
  info "generating a new api key at $KEYFILE"
  (( DRY )) && return 0
  ( umask 077; openssl rand -hex 32 > "$KEYFILE" )
  chown "root:${SVC_USER}" "$KEYFILE"; chmod 640 "$KEYFILE"
  ok "api key written (read it yourself: sudo cat $KEYFILE)"
}

cmd_check() {
  bold "Preflight for llama-server"
  [[ -x "$BIN" ]]   && ok "binary: $BIN"   || die "llama-server not found at $BIN"
  [[ -r "$MODEL" ]] && ok "model:  $MODEL" || die "model not readable at $MODEL"
  info "size:   $(du -h "$MODEL" | cut -f1)"
  command -v nvidia-smi >/dev/null || die "nvidia-smi missing — this build needs CUDA"
  local n; n="$(gpu_count)"
  (( n > 0 )) && ok "GPUs:   ${n} visible -> ${n} instance(s), ports ${PORT_BASE}-$(( PORT_BASE + n - 1 ))" \
              || die "no GPUs visible"
  nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader | sed 's/^/    /'

  # Each instance holds a FULL copy of the weights on its own card, so the fit
  # check is per-card, not against the combined total.
  local msz free
  msz=$(( $(stat -c %s "$MODEL") / 1048576 ))
  free=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
  info "per-card: ${msz} MiB weights of ${free} MiB -> $(( free - msz )) MiB for KV + buffers"
  (( free - msz > 4096 )) && ok "fit:    comfortable" \
                          || warn "fit:    tight — consider a smaller CTX or quant"

  if systemctl is-active --quiet ufw; then
    ok "ufw:    active (install allows ${PORT_BASE}:$(( PORT_BASE + n - 1 ))/tcp from ${LAN})"
  else
    warn "ufw is NOT active — ports will be reachable from anywhere routable"
  fi
  if systemctl is-active --quiet gpu-fan-control; then
    ok "cooling: gpu-fan-control is active"
  else
    warn "gpu-fan-control is NOT active — do not run both instances loaded without it"
  fi
  # Measured 2026-08-27: both cards busy plateaus at ~77-80 C, only 3-6 C from the
  # 83 C spec. Worth saying out loud every time, because it is the one configuration
  # that is fine on a cool day and not on a warm one.
  (( n > 1 )) && warn "thermals: both instances busy reaches ~77-80 C (spec 83 C) — ambient-sensitive"
  [[ -s "$KEYFILE" ]] && ok "api key: present" || info "api key: will be generated on install"
}

cmd_install() {
  need_root
  cmd_check
  echo
  bold "Installing llama-server@.service (one instance per GPU)"
  ensure_key

  if (( DRY )); then
    info "would write $TMPL and enable instances: $(instances | tr '\n' ' ')"
    return 0
  fi

  # The old single-instance unit is superseded; leaving it enabled would fight the
  # per-GPU instances for the same port.
  if [[ -f "$OLD_UNIT" ]]; then
    systemctl disable --now llama-server.service 2>/dev/null || true
    rm -f "$OLD_UNIT"
    ok "removed superseded single-instance unit"
  fi

  cat > "$TMPL" <<EOF
[Unit]
Description=llama-server ${ALIAS} on GPU %i
Documentation=file:${SVC_HOME}/serve-llm.sh
After=network-online.target gpu-fan-control.service
Wants=network-online.target
# StartLimit* MUST be in [Unit] — systemd moved them in v229 and silently ignores
# them in [Service], falling back to a 10 s window that RestartSec=10 can never
# fill, so a broken instance would retry forever instead of failing visibly.
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=exec
User=${SVC_USER}
# Pin this instance to one card. Measured 2026-08-27: layer-split gains nothing
# for a per-GPU instance, and -sm none avoids all cross-card traffic.
Environment=CUDA_VISIBLE_DEVICES=%i
EnvironmentFile=${ENVDIR}/%i.env
ExecStart=${BIN} \\
  --model ${MODEL} \\
  --alias ${ALIAS} \\
  --ctx-size ${CTX} \\
  --n-gpu-layers 99 \\
  --split-mode none \\
  --parallel ${SLOTS} \\
  --cont-batching \\
  --host 0.0.0.0 \\
  --port \${PORT} \\
  --api-key-file ${KEYFILE} \\
  --chat-template-kwargs '{"enable_thinking":false}'
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  ok "wrote $TMPL"
  systemctl daemon-reload
  ok "systemd reloaded"

  local n; n="$(gpu_count)"
  if systemctl is-active --quiet ufw; then
    ufw allow from "$LAN" to any port "${PORT_BASE}:$(( PORT_BASE + n - 1 ))" proto tcp >/dev/null
    ok "ufw: ${PORT_BASE}:$(( PORT_BASE + n - 1 ))/tcp allowed from ${LAN} only"
  else
    warn "ufw inactive — no firewall rule added"
  fi

  local i p
  mkdir -p "$ENVDIR"
  for i in $(instances); do
    p="$(port_of "$i")"
    echo "PORT=${p}" > "${ENVDIR}/${i}.env"
    chmod 644 "${ENVDIR}/${i}.env"
  done
  ok "wrote per-instance env files in ${ENVDIR}"

  for i in $(instances); do
    p="$(port_of "$i")"
    systemctl enable --now "llama-server@${i}" >/dev/null 2>&1 \
      && ok "started llama-server@${i} on port ${p} (GPU ${i})" \
      || warn "llama-server@${i} failed — journalctl -u llama-server@${i} -n 40"
  done
}

cmd_uninstall() {
  need_root
  local i n; n="$(gpu_count)"
  for i in $(instances); do run systemctl disable --now "llama-server@${i}" || true; done
  [[ -f "$TMPL" ]] && { run rm -f "$TMPL"; ok "removed $TMPL"; }
  [[ -d "$ENVDIR" ]] && { run rm -rf "$ENVDIR"; ok "removed $ENVDIR"; }
  run systemctl daemon-reload
  systemctl is-active --quiet ufw && \
    run ufw delete allow from "$LAN" to any port "${PORT_BASE}:$(( PORT_BASE + n - 1 ))" proto tcp || true
  info "api key left at $KEYFILE — remove by hand if you want it gone"
}

cmd_status() {
  bold "llama-server instances"
  local i p
  for i in $(instances); do
    p="$(port_of "$i")"
    printf '  GPU %s  port %s  ' "$i" "$p"
    systemctl is-active --quiet "llama-server@${i}" && printf '\033[32mactive\033[0m' || printf '\033[33minactive\033[0m'
    systemctl is-enabled --quiet "llama-server@${i}" 2>/dev/null && printf '  (enabled)' || printf '  (not enabled)'
    printf '  http://%s:%s/v1\n' "$(hostname -I | awk '{print $1}')" "$p"
  done
  echo
  info "model: ${ALIAS}  ctx=${CTX}  split=none  slots=${SLOTS}  (one full copy per card)"
  nvidia-smi --query-gpu=index,memory.used,memory.total,temperature.gpu,power.draw \
    --format=csv,noheader | sed 's/^/    GPU /'
}

# Reads the key from the file rather than as an argument, so it never lands in
# shell history or in this script's output.
cmd_test() {
  [[ -r "$KEYFILE" ]] || die "cannot read $KEYFILE — run as $SVC_USER or with sudo"
  local key i p out; key="$(<"$KEYFILE")"
  bold "Round-trip through each instance"
  for i in $(instances); do
    p="$(port_of "$i")"
    printf '  GPU %s (port %s): ' "$i" "$p"
    out="$(curl -sf -m 180 "http://127.0.0.1:${p}/v1/chat/completions" \
      -H "Content-Type: application/json" -H "Authorization: Bearer ${key}" \
      -d '{"messages":[{"role":"user","content":"Reply with exactly: OK"}],"max_tokens":16}' 2>/dev/null)" \
      || { printf '\033[31mFAILED\033[0m  (journalctl -u llama-server@%s -n 40)\n' "$i"; continue; }
    python3 -c 'import sys,json;d=json.load(sys.stdin);m=d["choices"][0]["message"];u=d.get("usage",{});print(repr((m.get("content") or "")[:40]),"tokens:",u.get("total_tokens"))' <<<"$out"
  done
}

cmd_key_path() { echo "$KEYFILE"; info "read it with: sudo cat $KEYFILE"; }

ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    -h|--help) usage 0 ;;
    check|install|uninstall|status|test|key-path) ARG="$1"; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

case "$ARG" in
  check)     cmd_check ;;
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  status)    cmd_status ;;
  test)      cmd_test ;;
  key-path)  cmd_key_path ;;
  *)         usage 1 ;;
esac
