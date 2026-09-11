#!/usr/bin/env bash
#
# deploy-step12.sh — run the ai-dashboard deployment on ai-server, one stage at a time,
# checking after each that nothing on this box was collateral damage.
#
# Runs ON THE SERVER, as root:  sudo ./deploy-step12.sh
#
# It does NO work of its own. Every real action is a `dashboard.sh` subcommand; this
# wrapper only sequences them and, between stages, re-asserts the two things that must
# survive a deploy on a box that is serving live inference: sshd still listening, and
# both llama-server instances still active. It stops at the first failure of either.
#
#   sudo ./deploy-step12.sh                 # the full sequence
#   sudo ./deploy-step12.sh --dry-run       # print every intended command, change nothing
#   sudo ./deploy-step12.sh --from unit     # resume at a stage (deps build set-password
#                                           #   configure unit firewall start)
#   ./deploy-step12.sh --help
#
# ⚠ `set-password` prompts. That is deliberate and is why this cannot be driven from the
# Mac: a password belongs on a terminal, never in a script, an argument or a log.
#
set -euo pipefail

readonly TAG="88494b7"          # the commit this deploys — dashboard-frontend @ 11b
readonly LAN_CIDR="192.168.4.0/22"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HERE
readonly DASHBOARD="$HERE/dashboard.sh"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

usage() { sed -n '3,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

DRY_RUN=""
FROM="deps"
while (( $# )); do
  case "$1" in
    --dry-run) DRY_RUN="--dry-run"; shift ;;
    --from)    FROM="${2:?--from needs a stage}"; shift 2 ;;
    -h|--help) usage ;;
    *)         die "unknown argument: $1 (try --help)" ;;
  esac
done

readonly STAGES=(deps build set-password configure unit firewall start)

# ---------------------------------------------------------------- preconditions
[[ -x "$DASHBOARD" ]] || die "dashboard.sh not found beside this script at $DASHBOARD"
if [[ -z "$DRY_RUN" && "${EUID}" -ne 0 ]]; then
  die "this needs root — run: sudo ./deploy-step12.sh"
fi
printf '%s\n' " ${STAGES[*]} " | grep -q " ${FROM} " || die "--from: unknown stage '${FROM}'"

# ---------------------------------------------------------------- the guardrail
# The two things a deploy on this box must not break. Checked before the first stage
# (so a pre-existing failure is never blamed on us) and after every stage.
baseline_sshd=""
baseline_llama=""

probe_sshd()  { ss -ltn 2>/dev/null | grep -qE ':22[[:space:]]' && echo up || echo down; }
probe_llama() { systemctl is-active llama-server@0 llama-server@1 2>/dev/null | tr '\n' ' '; }

assert_survived() {
  local where="$1" sshd llama
  sshd="$(probe_sshd)"
  llama="$(probe_llama)"
  [[ "$sshd" == "$baseline_sshd" ]] \
    || die "after ${where}: sshd went from '${baseline_sshd}' to '${sshd}'. STOP — do not close your session. Fix before continuing."
  [[ "$llama" == "$baseline_llama" ]] \
    || die "after ${where}: llama-server went from '${baseline_llama}' to '${llama}'. STOP — inference was collateral damage."
  ok "after ${where}: sshd ${sshd}, llama-server ${llama}"
}

# ---------------------------------------------------------------- run
bold "ai-dashboard deploy — image tag ${TAG}, LAN ${LAN_CIDR}${DRY_RUN:+  (DRY RUN)}"
echo

bold "Baseline, before anything is changed"
baseline_sshd="$(probe_sshd)"
baseline_llama="$(probe_llama)"
info "sshd:         ${baseline_sshd}"
info "llama-server: ${baseline_llama}"
[[ "$baseline_sshd" == "up" ]] || warn "sshd is not listening on 22 even before we start — that is not this deploy's doing"
echo

started=""
for stage in "${STAGES[@]}"; do
  if [[ -z "$started" ]]; then
    if [[ "$stage" == "$FROM" ]]; then
      started=1
    else
      info "skipping ${stage} (--from ${FROM})"
      continue
    fi
  fi

  bold "Stage: ${stage}"
  case "$stage" in
    build)    "$DASHBOARD" build --tag "$TAG" ${DRY_RUN:+$DRY_RUN} ;;
    firewall) "$DASHBOARD" firewall --lan-cidr "$LAN_CIDR" ${DRY_RUN:+$DRY_RUN} ;;
    *)        "$DASHBOARD" "$stage" ${DRY_RUN:+$DRY_RUN} ;;
  esac
  assert_survived "$stage"
  echo
done

# ---------------------------------------------------------------- verdict
bold "check — the silent-failure detector"
set +e
"$DASHBOARD" check
check_rc=$?
set -e
echo

case "$check_rc" in
  0) ok "check exited 0: every row passed." ;;
  1) die "check exited 1: a row FAILED. The deploy is not done — read the rows above." ;;
  2) warn "check exited 2: nothing failed, but a row could not be evaluated."
     warn "A row nobody could evaluate is not a row that passed. Re-read it." ;;
  *) die "check exited ${check_rc}, which is not a documented code." ;;
esac

echo
bold "What is still yours to verify, and neither this script nor check can do it"
info "1. A REAL REBOOT. An ordering cycle deletes start jobs silently and only ever"
info "   appears on a real boot — 'systemctl restart' can never reproduce it."
info "   After rebooting:  journalctl -b | grep 'ordering cycle'   (expect nothing)"
info "                     systemctl is-enabled ai-dashboard        (expect enabled)"
info "                     systemctl is-active  ai-dashboard        (expect active)"
info "2. The dashboard itself, from another machine on the LAN:"
info "      http://192.168.4.71:8090/"
info "3. That the page fits without scrolling at 1280x1024 and above, with the browser"
info "   at its DEFAULT font size and 100% zoom — SPEC 6.1 is conditioned on both."
