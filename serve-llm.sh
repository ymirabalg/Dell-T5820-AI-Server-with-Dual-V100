#!/usr/bin/env bash
#
# serve-llm.sh — run llama-server as systemd services on the local network.
#
# Runs ON THE SERVER. Starts ONE INSTANCE PER GPU, each pinned to its own card,
# exposing an OpenAI-compatible endpoint gated by a shared API key, plus a ufw rule
# scoping the ports to the local subnet — which binds only while ufw is actually
# enforcing, and `check` is the thing that says whether it is.
# install/uninstall/set-model need root.
#
# Each instance carries its OWN model, alias and context size in
# /etc/llama-server/<i>.env, so the two cards can serve different models.
#
#   ./serve-llm.sh check              # preflight: binary, models, GPUs, ufw, cooling
#   sudo ./serve-llm.sh install       # key + template unit + ufw, then enable & start
#   sudo ./serve-llm.sh uninstall     # remove units and ufw rule (keeps the key)
#   sudo ./serve-llm.sh set-model N MODEL [ALIAS] [CTX]   # repoint one instance
#   ./serve-llm.sh status             # every instance, port, model, VRAM, temperature
#   ./serve-llm.sh test               # one round-trip through each instance
#   ./serve-llm.sh key-path           # where the key lives (never prints it)
#
#   --dry-run                         # print intended actions, change nothing
#
set -euo pipefail

SVC_USER="${SVC_USER:-yorman}"
SVC_HOME="$(getent passwd "$SVC_USER" | cut -d: -f6)"
BIN="${BIN:-${SVC_HOME}/llama.cpp/build/bin/llama-server}"
# Defaults for an instance that has no env file yet. An instance already carrying
# a model in /etc/llama-server/<i>.env keeps it — install never repoints a live
# instance behind your back; use `set-model` for that.
MODEL="${MODEL:-${SVC_HOME}/models/Qwen3.6-27B-Q4_K_M.gguf}"
ALIAS="${ALIAS:-qwen3.6-27b}"
PORT_BASE="${PORT_BASE:-8080}"
# CTX is per-instance now, and the per-token cost differs enormously by model.
# Qwen3.6-27B, measured 2026-08-27 on one V100 32 GiB: weights 18211 MiB + ~370 MiB
# fixed compute buffers + ~65 KiB/token of KV (few KV heads, GQA). 131072 lands at
# 26902 MiB leaving ~5.9 GiB spare; 262144 is a confirmed OOM. Inside the model's
# 262K native range, so no YaRN scaling involved.
# Gemma-4-12B is far cheaper per token: 5:1 sliding-window, so 40 of its 48 layers
# cache only ~1.5K tokens and the 8 global layers carry ONE KV head each. Measured
# 2026-09-04 by loading it CPU-only and reading RssAnon: 4.66 GiB of KV + compute
# buffers at the full 262144, over 11.84 GiB of Q8_0 weights. It would fit its entire
# native window on one card; 131072 is the house default and lands near 14.6 GiB.
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

usage() { sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
run()   { if (( DRY )); then printf '  \033[35m→\033[0m would run: %s\n' "$*"; else "$@"; fi; }
need_root() { (( EUID == 0 )) || die "this subcommand needs root — re-run with sudo"; }

gpu_count() { nvidia-smi --query-gpu=index --format=csv,noheader 2>/dev/null | wc -l | tr -d ' '; }

# `systemctl is-active ufw` is NOT evidence the firewall is enforcing anything.
# ufw.service is a oneshot that applies rules only when ENABLED=yes and reports
# "active (exited)" either way — so is-active is green on a disabled firewall.
# Found 2026-09-04 with 8080/8081 open to anything routable behind that green tick,
# the allow rule sitting unused in /etc/ufw/user.rules. Ask ufw, not systemd.
ufw_enforcing() {
  command -v ufw >/dev/null || return 1
  if (( EUID == 0 )); then
    [[ "$(ufw status 2>/dev/null | head -1)" == "Status: active" ]]
  else
    # ufw status needs root; ufw.conf is world-readable and carries the same fact.
    [[ "$(sed -n 's/^ENABLED=//p' /etc/ufw/ufw.conf 2>/dev/null | tail -1)" == "yes" ]]
  fi
}

# One instance per GPU, so the instance name IS the CUDA device index. Ports are
# PORT_BASE+index. Kept under 10 instances because the port suffix is a single digit.
instances() { local n; n="$(gpu_count)"; seq 0 $(( n - 1 )); }

# systemd cannot do arithmetic in a unit file, so "${PORT_BASE}%i" would CONCATENATE
# (8080 + instance 0 -> port 80800, above the 65535 limit). The port is computed here
# and handed to each instance through its own EnvironmentFile instead.
port_of() { echo $(( PORT_BASE + $1 )); }
ENVDIR="/etc/llama-server"

# The env file is the per-instance CONFIG, not a derived artefact: it carries the
# model that card serves. install therefore rewrites PORT (which it owns) but keeps
# any MODEL/ALIAS/CTX already present, so re-running install to fix a unit or a ufw
# rule can never silently repoint a card at a different model. `set-model` does that.
env_get() {  # env_get <instance> <key>
  local f="${ENVDIR}/${1}.env"
  [[ -r "$f" ]] || return 1
  sed -n "s/^${2}=//p" "$f" | tail -1
}

write_env() {  # write_env <instance> [model] [alias] [ctx] — blank args keep/inherit
  local i="$1" m a c p f
  f="${ENVDIR}/${i}.env"; p="$(port_of "$i")"
  m="${2:-$(env_get "$i" MODEL || true)}"; m="${m:-$MODEL}"
  a="${3:-$(env_get "$i" ALIAS || true)}"; a="${a:-$ALIAS}"
  c="${4:-$(env_get "$i" CTX   || true)}"; c="${c:-$CTX}"
  if (( DRY )); then info "would write $f: PORT=$p MODEL=$m ALIAS=$a CTX=$c"; return 0; fi
  mkdir -p "$ENVDIR"
  cat > "$f" <<ENVEOF
PORT=${p}
MODEL=${m}
ALIAS=${a}
CTX=${c}
ENVEOF
  chmod 644 "$f"
}

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
  [[ -r "$MODEL" ]] && ok "default model for a fresh instance: $MODEL" \
                    || warn "default model not readable at $MODEL"
  command -v nvidia-smi >/dev/null || die "nvidia-smi missing — this build needs CUDA"
  local n; n="$(gpu_count)"
  (( n > 0 )) && ok "GPUs:   ${n} visible -> ${n} instance(s), ports ${PORT_BASE}-$(( PORT_BASE + n - 1 ))" \
              || die "no GPUs visible"
  nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader | sed 's/^/    /'

  # Each instance holds a FULL copy of ITS OWN weights on its own card, so the fit
  # check is per-instance, not against the combined total.
  local i im msz free
  free=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
  for i in $(instances); do
    im="$(env_get "$i" MODEL || true)"; im="${im:-$MODEL}"
    if [[ ! -r "$im" ]]; then warn "GPU ${i}: model not readable at ${im}"; continue; fi
    msz=$(( $(stat -c %s "$im") / 1048576 ))
    info "GPU ${i}: $(basename "$im") — ${msz} MiB of ${free} MiB, $(( free - msz )) MiB left for KV + buffers"
    (( free - msz > 4096 )) || warn "GPU ${i}: fit is tight — consider a smaller CTX or quant"
  done

  if ufw_enforcing; then
    ok "ufw:    enforcing (install allows ${PORT_BASE}:$(( PORT_BASE + n - 1 ))/tcp from ${LAN})"
  else
    warn "ufw is NOT enforcing — ${PORT_BASE}:$(( PORT_BASE + n - 1 )) reachable from anywhere"
    warn "         routable, with only the api key gating inference. sudo ufw enable"
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
Description=llama-server on GPU %i
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
# MODEL/ALIAS/CTX/PORT all come from EnvironmentFile so the two cards can serve
# different models off one template. systemd substitutes \${VAR} in ExecStart but
# does NOT do arithmetic, which is why PORT is computed in bash (see port_of).
ExecStart=${BIN} \\
  --model \${MODEL} \\
  --alias \${ALIAS} \\
  --ctx-size \${CTX} \\
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
  if command -v ufw >/dev/null; then
    # Write the rule either way so a later `ufw enable` needs no re-run — but never
    # report success on a disabled firewall, which is exactly how 8080/8081 came to
    # be open for a week with a green tick next to them.
    ufw allow from "$LAN" to any port "${PORT_BASE}:$(( PORT_BASE + n - 1 ))" proto tcp >/dev/null
    if ufw_enforcing; then
      ok "ufw: ${PORT_BASE}:$(( PORT_BASE + n - 1 ))/tcp allowed from ${LAN} only"
    else
      warn "ufw rule WRITTEN BUT NOT IN FORCE — ufw.conf says ENABLED=no, so the ports"
      warn "     are open to anything routable. Close them with: sudo ufw enable"
    fi
  else
    warn "ufw not installed — no firewall rule added"
  fi

  local i p
  for i in $(instances); do
    write_env "$i"
    info "GPU ${i}: $(env_get "$i" ALIAS) ctx=$(env_get "$i" CTX)"
  done
  ok "per-instance env files in ${ENVDIR} (existing models kept)"

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
  command -v ufw >/dev/null && \
    run ufw delete allow from "$LAN" to any port "${PORT_BASE}:$(( PORT_BASE + n - 1 ))" proto tcp || true
  info "api key left at $KEYFILE — remove by hand if you want it gone"
}

# Registered on EXIT by cmd_set_model, so it may read GLOBALS ONLY — by the time it
# fires the enclosing function has returned, its locals are out of scope, and `set -u`
# would kill the handler part-way through the rollback.
SETMODEL_INSTANCE=""
SETMODEL_BACKUP=""
setmodel_rollback() {
  local rc=$?
  (( rc == 0 )) && return 0
  [[ -n "$SETMODEL_BACKUP" && -f "$SETMODEL_BACKUP" ]] || return 0
  warn "putting ${ENVDIR}/${SETMODEL_INSTANCE}.env back the way it was"
  cp "$SETMODEL_BACKUP" "${ENVDIR}/${SETMODEL_INSTANCE}.env"
  rm -f "$SETMODEL_BACKUP"
  systemctl restart "llama-server@${SETMODEL_INSTANCE}" || true
  warn "llama-server@${SETMODEL_INSTANCE} restarted on its previous model"
}

# Repoint ONE instance at another model. Deliberately separate from install: install
# must never change which model a card serves as a side effect of fixing a unit or a
# firewall rule.
cmd_set_model() {
  need_root
  local i="${1:-}" m="${2:-}" a="${3:-}" c="${4:-}" n p code t
  [[ "$i" =~ ^[0-9]$ ]] || die "instance must be a single digit — got '${i}'"
  n="$(gpu_count)"; (( i < n )) || die "instance ${i} does not exist — ${n} GPU(s) visible"
  [[ -n "$m" ]] || die "no model given — usage: $0 set-model N MODEL [ALIAS] [CTX]"
  m="$(readlink -f "$m")" || die "cannot resolve model path"
  [[ -r "$m" ]] || die "model not readable at $m"
  # Verify BEFORE restarting: a truncated or wrong-format file would otherwise take
  # the instance down and only explain itself in the journal.
  [[ "$(head -c 4 "$m")" == "GGUF" ]] || die "$m is not a GGUF"
  # The service runs as SVC_USER, so root being able to read it proves nothing.
  runuser -u "$SVC_USER" -- test -r "$m" || die "${SVC_USER} cannot read $m"
  [[ -z "$c" || "$c" =~ ^[0-9]+$ ]] || die "ctx must be a number — got '${c}'"
  [[ -f "$TMPL" ]] || die "$TMPL is missing — run 'sudo $0 install' first"

  bold "Pointing llama-server@${i} at $(basename "$m")"
  if (( DRY )); then write_env "$i" "$m" "$a" "$c"; info "would restart llama-server@${i}"; return 0; fi

  # Take the old config first. A model that OOMs on load would otherwise leave the
  # card with no server at all while systemd burns through its start limit.
  SETMODEL_INSTANCE="$i"
  if [[ -f "${ENVDIR}/${i}.env" ]]; then
    SETMODEL_BACKUP="$(mktemp)"; cp "${ENVDIR}/${i}.env" "$SETMODEL_BACKUP"
  fi
  trap setmodel_rollback EXIT

  write_env "$i" "$m" "$a" "$c"
  ok "wrote ${ENVDIR}/${i}.env — alias $(env_get "$i" ALIAS), ctx $(env_get "$i" CTX)"

  p="$(port_of "$i")"
  systemctl restart "llama-server@${i}"
  info "loading — $(du -h "$m" | cut -f1) off disk onto GPU ${i}, give it a minute"
  # Poll rather than trusting the restart: a unit can be 'active' while llama-server
  # is still allocating, and it can OOM a few seconds in.
  t=0
  while (( t < 300 )); do
    systemctl is-active --quiet "llama-server@${i}" \
      || die "llama-server@${i} died — journalctl -u llama-server@${i} -n 40"
    code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:${p}/health" || true)"
    [[ "$code" == 200 || "$code" == 401 ]] && break
    sleep 2; t=$(( t + 2 ))
  done
  (( t < 300 )) || die "no answer on /health after ${t}s — journalctl -u llama-server@${i} -n 40"
  trap - EXIT
  [[ -n "$SETMODEL_BACKUP" ]] && rm -f "$SETMODEL_BACKUP"
  ok "llama-server@${i} healthy on port ${p} after ${t}s"
  nvidia-smi --query-gpu=index,memory.used,memory.total,temperature.gpu --format=csv,noheader \
    | sed -n "$(( i + 1 ))p" | sed 's/^/    GPU /'
}

cmd_status() {
  bold "llama-server instances"
  local i p a c m ip; ip="$(hostname -I | awk '{print $1}')"
  for i in $(instances); do
    p="$(port_of "$i")"
    a="$(env_get "$i" ALIAS || true)"; c="$(env_get "$i" CTX || true)"; m="$(env_get "$i" MODEL || true)"
    printf '  GPU %s  port %s  ' "$i" "$p"
    systemctl is-active --quiet "llama-server@${i}" && printf '\033[32mactive\033[0m' || printf '\033[33minactive\033[0m'
    systemctl is-enabled --quiet "llama-server@${i}" 2>/dev/null && printf '  (enabled)' || printf '  (not enabled)'
    printf '  http://%s:%s/v1\n' "$ip" "$p"
    printf '         model %s  ctx=%s\n' "${a:-<no env file>}" "${c:-?}"
    printf '         %s\n' "${m:-—}"
  done
  echo
  info "split=none  slots=${SLOTS}  (each card holds a full copy of its own model)"
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
POS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    -h|--help) usage 0 ;;
    check|install|uninstall|status|test|key-path|set-model) ARG="$1"; shift ;;
    # Only set-model takes positional arguments; anywhere else a bare word is a typo.
    *) [[ "$ARG" == "set-model" ]] || die "unknown argument: $1"; POS+=("$1"); shift ;;
  esac
done

case "$ARG" in
  check)     cmd_check ;;
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  set-model) cmd_set_model ${POS[@]+"${POS[@]}"} ;;
  status)    cmd_status ;;
  test)      cmd_test ;;
  key-path)  cmd_key_path ;;
  *)         usage 1 ;;
esac
