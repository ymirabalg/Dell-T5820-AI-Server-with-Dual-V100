#!/usr/bin/env bash
#
# provision-base.sh — base tooling + root volume expansion for the ai-server.
#
# Run this ON THE SERVER (it needs sudo, and this repo's SSH access is
# non-interactive, so a password prompt would hang a remote invocation).
#
#   sudo ./provision-base.sh              # extend root LV, then install base packages
#   sudo ./provision-base.sh --packages   # packages only, leave the disk alone
#   sudo ./provision-base.sh --disk       # extend the root LV only
#   sudo ./provision-base.sh --dry-run    # show what would change, touch nothing
#
set -euo pipefail

VG="ubuntu-vg"
LV="ubuntu-lv"
LV_PATH="/dev/${VG}/${LV}"
PACKAGES=(python3-pip python3-venv build-essential pciutils htop tmux)

DO_DISK=1
DO_PKGS=1
DRY_RUN=0

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
run()   { if [[ $DRY_RUN -eq 1 ]]; then info "would run: $*"; else "$@"; fi; }

usage() {
  sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --packages) DO_DISK=0; shift ;;
    --disk)     DO_PKGS=0; shift ;;
    --dry-run)  DRY_RUN=1; shift ;;
    -h|--help)  usage 0 ;;
    *)          die "unknown option: $1  (try --help)" ;;
  esac
done

[[ $DRY_RUN -eq 1 || $EUID -eq 0 ]] || die "needs root — run with sudo (or use --dry-run)"

# ------------------------------------------------------------------ root volume
# The installer claimed only ~100G of the 236.5G partition; the rest sits
# unallocated in the volume group. ext4 grows online, so no unmount is needed.
if [[ $DO_DISK -eq 1 ]]; then
  bold "Extending ${LV_PATH} into free volume-group space"

  [[ -e "$LV_PATH" ]] || die "no logical volume at ${LV_PATH} — check 'sudo lvs'"

  FSTYPE="$(findmnt -no FSTYPE / )"
  [[ "$FSTYPE" == "ext4" ]] || die "expected ext4 on / but found '${FSTYPE}' — \
resize step assumes ext4 (xfs would need xfs_growfs); aborting rather than guessing"

  # LVM tools need root even to read, so a non-root --dry-run reports intent only.
  if [[ $EUID -ne 0 ]]; then
    warn "not root — cannot query ${VG} free space"
    info "root now: $(findmnt -no SIZE /) ($(findmnt -no USED /) used)"
    info "would run: lvextend -r -l +100%FREE ${LV_PATH}"
  else
    FREE_EXT="$(vgs --noheadings -o vg_free_count "$VG" 2>/dev/null | tr -d ' ' || true)"
    FREE_HUMAN="$(vgs --noheadings -o vg_free "$VG" 2>/dev/null | tr -d ' ' || true)"

    [[ -n "$FREE_EXT" ]] || die "could not read volume group ${VG} — check 'sudo vgs'"

    if [[ "$FREE_EXT" == "0" ]]; then
      warn "no free extents in ${VG} — nothing to extend, skipping"
    else
      info "free in ${VG}: ${FREE_HUMAN}"
      info "root now:     $(findmnt -no SIZE /) ($(findmnt -no USED /) used)"
      # -r resizes the filesystem in the same step, so the two can't drift apart.
      run lvextend -r -l +100%FREE "$LV_PATH"
      [[ $DRY_RUN -eq 1 ]] || ok "root now: $(findmnt -no SIZE /)"
    fi
  fi
  echo
fi

# --------------------------------------------------------------------- packages
if [[ $DO_PKGS -eq 1 ]]; then
  bold "Installing base tooling"

  MISSING=()
  for p in "${PACKAGES[@]}"; do
    if dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed"; then
      ok "${p} already installed"
    else
      MISSING+=("$p")
    fi
  done

  if [[ ${#MISSING[@]} -eq 0 ]]; then
    ok "nothing to install"
  else
    info "installing: ${MISSING[*]}"
    run apt-get update
    run env DEBIAN_FRONTEND=noninteractive apt-get install -y "${MISSING[@]}"
  fi
  echo
fi

# ------------------------------------------------------------------------- note
bold "Done."
info "This Ubuntu marks the system Python as externally managed (PEP 668), so"
info "'pip install' outside a virtualenv is refused by design. Use:"
echo "    python3 -m venv ~/.venvs/NAME && source ~/.venvs/NAME/bin/activate"
info "Python here is 3.14 — some ML wheels may not publish builds for it yet."
