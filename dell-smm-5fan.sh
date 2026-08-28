#!/usr/bin/env bash
#
# dell-smm-5fan.sh — rebuild dell-smm-hwmon with 5-fan support.
#
# Runs ON THE SERVER. The stock driver caps at DELL_SMM_NO_FANS=4, so the board's
# 5th header (the PCIe/GPU fan position) is never queried over SMM and cannot
# appear in sysfs no matter what is plugged into it. This builds a patched module
# out of tree and swaps it in. Only load/unload need root; build does not.
#
#   ./dell-smm-5fan.sh check            # preflight only, no root
#   ./dell-smm-5fan.sh build            # fetch source, patch, compile
#   sudo ./dell-smm-5fan.sh load        # swap in for this boot only
#   sudo ./dell-smm-5fan.sh unload      # restore the stock module
#   sudo ./dell-smm-5fan.sh install     # register with dkms — survives reboots
#   sudo ./dell-smm-5fan.sh uninstall   # deregister from dkms
#   ./dell-smm-5fan.sh status           # what is loaded, how many fans
#
#   --dry-run                           # print intended actions, change nothing
#   --source DIR                        # reuse an existing kernel source tree
#
set -euo pipefail

KVER="$(uname -r)"
KBUILD="/lib/modules/${KVER}/build"
# `build` runs unprivileged but `load`/`install` need root, and Ubuntu's sudo resets
# HOME to /root — so the two halves would disagree on where the .ko lives. Resolve
# against the INVOKING user's home whenever we are under sudo.
_HOME="${HOME}"
if [[ -n "${SUDO_USER:-}" ]]; then
  _SUDO_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6 || true)"
  [[ -n "$_SUDO_HOME" ]] && _HOME="$_SUDO_HOME"
fi
WORKDIR="${WORKDIR:-${_HOME}/dell-smm-5fan}"
BUILDDIR="${WORKDIR}/build"
MODNAME="dell-smm-hwmon"
DKMS_PKG="dell-smm-hwmon-5fan"
DKMS_VER="1.0"
DKMS_SRC="/usr/src/${DKMS_PKG}-${DKMS_VER}"
DRY=0
SRCDIR=""
ARG=""

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '3,19p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

run() {
  if (( DRY )); then printf '  \033[35m→\033[0m would run: %s\n' "$*"; else "$@"; fi
}

need_root() { (( EUID == 0 )) || die "this subcommand needs root — re-run with sudo"; }

# NOT `lsmod | grep -q`: grep -q exits on first match and SIGPIPEs lsmod, which
# under `set -o pipefail` makes the whole pipeline report failure. Capture first.
module_loaded() {
  local out; out="$(lsmod)"
  grep -q '^dell_smm_hwmon' <<<"$out"
}

module_refcount() {
  local out; out="$(lsmod)"
  awk '/^dell_smm_hwmon/{print $3; found=1} END{if(!found) print "0"}' <<<"$out"
}

# ------------------------------------------------------------------ discovery
# The dell_smm hwmon node moves around between boots, so never hardcode hwmon2.
find_dell_hwmon() {
  local h
  for h in /sys/class/hwmon/hwmon*; do
    [[ -r "$h/name" && "$(<"$h/name")" == "dell_smm" ]] && { echo "$h"; return 0; }
  done
  return 1
}

fan_count() {
  local h; h="$(find_dell_hwmon)" || { echo 0; return; }
  ls "$h"/fan*_input 2>/dev/null | wc -l | tr -d ' '
}

pwm_count() {
  local h; h="$(find_dell_hwmon)" || { echo 0; return; }
  ls "$h"/pwm[0-9] 2>/dev/null | wc -l | tr -d ' '
}

# Must never fail: it runs inside a command substitution under `set -e -o pipefail`,
# where a non-zero exit (mokutil on a legacy-BIOS box, for one) would kill the script.
secure_boot_state() {
  local out=""
  if [[ ! -d /sys/firmware/efi ]]; then
    echo "n/a (legacy BIOS boot — unsigned modules load fine)"; return 0
  fi
  if command -v mokutil >/dev/null 2>&1; then
    out="$(mokutil --sb-state 2>/dev/null | head -1 || true)"
    [[ -n "$out" ]] && { echo "$out"; return 0; }
  fi
  local f; f="$(find /sys/firmware/efi/efivars -maxdepth 1 -name 'SecureBoot-*' 2>/dev/null | head -1 || true)"
  if [[ -n "$f" && -r "$f" ]]; then
    # 5th byte is the flag; 1 = enabled
    if [[ "$(od -An -t u1 -j 4 -N 1 "$f" 2>/dev/null | tr -d ' ' || true)" == "1" ]]; then
      echo "enabled"
    else
      echo "disabled"
    fi
  else
    echo "unknown (efivar unreadable)"
  fi
  return 0
}

# ------------------------------------------------------------------ preflight
cmd_check() {
  bold "Preflight for ${MODNAME} rebuild"
  info "kernel:        ${KVER}"

  [[ -d "$KBUILD" ]] && ok "headers:       ${KBUILD}" \
                     || die "headers missing — install linux-headers-${KVER}"

  local t
  for t in gcc make patch awk; do
    command -v "$t" >/dev/null 2>&1 && ok "tool:          $t" || die "missing required tool: $t"
  done

  local sb; sb="$(secure_boot_state)"
  case "$sb" in
    *enabled*) warn "${sb} — an unsigned module will be REFUSED by the kernel."
               warn "  either sign the module with a MOK, or disable Secure Boot in BIOS" ;;
    *)         ok "secure boot:   ${sb}" ;;
  esac

  if module_loaded; then
    local refs; refs="$(module_refcount)"
    ok "module loaded: dell_smm_hwmon (refcount ${refs})"
    (( refs == 0 )) || warn "refcount is not 0 — 'load' will not be able to unload it"
  else
    warn "dell_smm_hwmon is not currently loaded"
  fi

  info "fan channels now: $(fan_count)   pwm channels now: $(pwm_count)"
  if [[ -f "${BUILDDIR}/${MODNAME}.ko" ]]; then
    ok "rebuilt module already present: ${BUILDDIR}/${MODNAME}.ko"
  else
    info "no rebuilt module yet — run: $0 build"
  fi
}

# ---------------------------------------------------------------------- build
# Source acquisition is the fragile step, so it is isolated and explains itself.
obtain_source() {
  local c
  if [[ -n "$SRCDIR" ]]; then
    c="${SRCDIR}/drivers/hwmon/${MODNAME}.c"
    [[ -f "$c" ]] || die "--source given but ${c} does not exist"
    echo "$c"; return 0
  fi

  c="$(find "${WORKDIR}" -maxdepth 4 -path "*/drivers/hwmon/${MODNAME}.c" 2>/dev/null | head -1)"
  [[ -n "$c" ]] && { echo "$c"; return 0; }

  # apt-get source deliberately runs unprivileged; it only needs deb-src entries.
  (( DRY )) && { echo "${WORKDIR}/<kernel-src>/drivers/hwmon/${MODNAME}.c"; return 0; }
  ( cd "$WORKDIR" && apt-get source "linux-image-unsigned-${KVER}" >/dev/null 2>&1 ) || \
  ( cd "$WORKDIR" && apt-get source "linux-image-${KVER}" >/dev/null 2>&1 ) || \
    die "could not fetch kernel source.

  Ubuntu 26.04 uses deb822 sources. Enable source packages by adding
  'deb-src' to the Types: line in /etc/apt/sources.list.d/ubuntu.sources:

      Types: deb deb-src

  then 'sudo apt-get update' and re-run. Alternatively pass a tree you
  already have with:  $0 build --source /path/to/linux-source"

  c="$(find "${WORKDIR}" -maxdepth 4 -path "*/drivers/hwmon/${MODNAME}.c" 2>/dev/null | head -1)"
  [[ -n "$c" ]] || die "kernel source fetched but ${MODNAME}.c was not found in it"
  echo "$c"
}

# Every entry in both HWMON_CHANNEL_INFO lists is identical, so a 5th can simply
# be inserted at the head of each list — no need to match the tail's context,
# which is what makes a context diff brittle across kernel revisions.
apply_change() {
  local src="$1" dst="$2"

  # The upstream source separates the constant from its value with a TAB, and
  # indents channel entries with tabs+spaces. Match on whitespace classes, never
  # on literal spacing, or this asserts against a file that is in fact correct.
  grep -Eq '^#define[[:space:]]+DELL_SMM_NO_FANS[[:space:]]+4[[:space:]]*$' "$src" \
    || die "expected a '#define DELL_SMM_NO_FANS 4' line in ${src}
  Found instead: $(grep -E 'DELL_SMM_NO_FANS[[:space:]]+[0-9]' "$src" | head -1 | sed 's/^[[:space:]]*//')
  This kernel's driver differs from the assumed baseline; inspect it before proceeding."

  local before; before="$(grep -c 'HWMON_PWM_INPUT' "$src" || true)"
  (( before == 4 )) || die "expected 4 pwm channel entries, found ${before} — aborting
  rather than guessing at an unfamiliar driver layout."

  # Duplicating the block's own first entry (2 lines for fan, 1 for pwm) keeps the
  # file's exact indentation and flags without hardcoding either. Every entry in
  # these lists is identical, so position within the list does not matter.
  sed -E 's/^(#define[[:space:]]+DELL_SMM_NO_FANS[[:space:]]+)4([[:space:]]*)$/\15\2/' "$src" | awk '
    !fdone && /HWMON_CHANNEL_INFO\(fan,/ { print; fstate = 1; n = 0; next }
    fstate == 1 {
      print; n++; b[n] = $0
      if (n == 2) { print b[1]; print b[2]; fstate = 0; fdone = 1 }
      next
    }
    !pdone && /HWMON_CHANNEL_INFO\(pwm,/ { print; pstate = 1; next }
    pstate == 1 { print; print $0; pstate = 0; pdone = 1; next }
    { print }
  ' > "$dst"

  grep -Eq '^#define[[:space:]]+DELL_SMM_NO_FANS[[:space:]]+5[[:space:]]*$' "$dst" \
    || die "patch verification failed: constant not updated"
  local after; after="$(grep -c 'HWMON_PWM_INPUT' "$dst" || true)"
  (( after == 5 )) || die "patch verification failed: ${after} pwm entries, expected 5"
  local fans; fans="$(grep -c 'HWMON_F_TARGET' "$dst" || true)"
  (( fans == 5 )) || die "patch verification failed: ${fans} fan entries, expected 5"
  ok "patch verified: DELL_SMM_NO_FANS=5, 5 fan entries, 5 pwm entries"
}

cmd_build() {
  bold "Building ${MODNAME} with 5-fan support for ${KVER}"
  [[ -d "$KBUILD" ]] || die "headers missing — install linux-headers-${KVER}"

  run mkdir -p "$BUILDDIR"
  (( DRY )) || mkdir -p "$BUILDDIR"

  local src; src="$(obtain_source)"
  info "source: ${src}"

  if (( DRY )); then
    info "would patch DELL_SMM_NO_FANS 4 -> 5 and add one fan + one pwm channel entry"
    info "would run: make -C ${KBUILD} M=${BUILDDIR} modules"
    return 0
  fi

  apply_change "$src" "${BUILDDIR}/${MODNAME}.c"

  cat > "${BUILDDIR}/Makefile" <<EOF
obj-m += ${MODNAME}.o
EOF

  make -C "$KBUILD" M="$BUILDDIR" modules
  [[ -f "${BUILDDIR}/${MODNAME}.ko" ]] || die "build reported success but ${MODNAME}.ko is missing"
  ok "built ${BUILDDIR}/${MODNAME}.ko"
  info "next: sudo $0 load"
}

# ----------------------------------------------------------------- load/unload
# Leaving a channel in manual mode across an unload would strand it there with no
# driver to hand it back, so every path forces AUTO first.
all_channels_auto() {
  local h c; h="$(find_dell_hwmon)" || return 0
  for c in "$h"/pwm[0-9]_enable; do
    [[ -w "$c" ]] || continue
    run bash -c "echo 2 > '$c'" || true
  done
}

cmd_load() {
  need_root
  bold "Swapping in the rebuilt ${MODNAME}"
  [[ -f "${BUILDDIR}/${MODNAME}.ko" ]] || die "no rebuilt module — run: $0 build"

  if systemctl is-active --quiet gpu-fan-control 2>/dev/null; then
    die "gpu-fan-control.service is active — stop it first:
  sudo systemctl stop gpu-fan-control"
  fi

  info "returning all channels to EC automatic before unload"
  all_channels_auto

  # If insmod fails we must not leave the box with no fan driver at all.
  restore_stock() {
    local rc=$?
    trap - EXIT INT TERM
    if ! module_loaded; then
      warn "restoring the stock module"
      modprobe dell_smm_hwmon 2>/dev/null || true
    fi
    exit "$rc"
  }
  trap restore_stock EXIT INT TERM

  run rmmod dell_smm_hwmon || warn "rmmod failed (module may not have been loaded)"
  run insmod "${BUILDDIR}/${MODNAME}.ko"

  (( DRY )) && { trap - EXIT INT TERM; return 0; }

  local f p; f="$(fan_count)"; p="$(pwm_count)"
  info "fan channels: ${f}   pwm channels: ${p}"
  if (( f >= 5 )); then
    ok "fan5 is present — the 5th header is now addressable"
    info "next: sudo ./gpu-fan-control.sh probe 5   (watch the hub fan)"
  else
    warn "still ${f} fans — the EC did not answer for fan index 4 on this board."
    warn "  the driver now asks; the firmware declined. That is a hardware answer,"
    warn "  not a build problem. Run '$0 unload' to go back."
  fi
  trap - EXIT INT TERM
}

cmd_unload() {
  need_root
  bold "Restoring the stock ${MODNAME}"
  info "returning all channels to EC automatic"
  all_channels_auto
  run rmmod dell_smm_hwmon || warn "rmmod failed — module may not be loaded"
  run modprobe dell_smm_hwmon
  (( DRY )) || ok "stock module reloaded — fan channels: $(fan_count)"
}

# ------------------------------------------------------------------------ dkms
# Overriding an IN-TREE module, which is the unusual part: DEST_MODULE_LOCATION
# of /updates/dkms lands the .ko in /lib/modules/$KVER/updates/dkms/, and depmod
# searches `updates` before `kernel`, so modprobe picks this one over Ubuntu's.
write_dkms_conf() {
  cat > "${DKMS_SRC}/dkms.conf" <<EOF
PACKAGE_NAME="${DKMS_PKG}"
PACKAGE_VERSION="${DKMS_VER}"
BUILT_MODULE_NAME[0]="${MODNAME}"
DEST_MODULE_LOCATION[0]="/updates/dkms"
MAKE[0]="make -C \${kernel_source_dir} M=\${dkms_tree}/\${PACKAGE_NAME}/\${PACKAGE_VERSION}/build modules"
CLEAN="make -C \${kernel_source_dir} M=\${dkms_tree}/\${PACKAGE_NAME}/\${PACKAGE_VERSION}/build clean"
AUTOINSTALL="yes"
EOF
}

cmd_install() {
  need_root
  command -v dkms >/dev/null 2>&1 || die "dkms is not installed — apt-get install dkms"
  bold "Registering ${DKMS_PKG}/${DKMS_VER} with dkms"

  local patched="${BUILDDIR}/${MODNAME}.c"
  [[ -f "$patched" ]] || die "no patched source at ${patched} — run: $0 build"

  # Re-register cleanly rather than layering onto a half-removed previous attempt.
  if dkms status -m "$DKMS_PKG" -v "$DKMS_VER" 2>/dev/null | grep -q .; then
    warn "an existing ${DKMS_PKG}/${DKMS_VER} registration will be removed first"
    run dkms remove -m "$DKMS_PKG" -v "$DKMS_VER" --all || true
  fi

  run mkdir -p "$DKMS_SRC"
  if (( DRY )); then
    info "would copy ${patched} -> ${DKMS_SRC}/${MODNAME}.c"
    info "would write ${DKMS_SRC}/dkms.conf and Makefile"
    info "would run: dkms add/build/install -m ${DKMS_PKG} -v ${DKMS_VER}"
    return 0
  fi

  cp "$patched" "${DKMS_SRC}/${MODNAME}.c"
  printf 'obj-m += %s.o\n' "$MODNAME" > "${DKMS_SRC}/Makefile"
  write_dkms_conf
  ok "staged ${DKMS_SRC}"

  dkms add -m "$DKMS_PKG" -v "$DKMS_VER"
  dkms build -m "$DKMS_PKG" -v "$DKMS_VER"
  dkms install -m "$DKMS_PKG" -v "$DKMS_VER"
  depmod -a

  # Prove modprobe now resolves to the dkms copy, not Ubuntu's in-tree module.
  local resolved; resolved="$(modinfo -n dell_smm_hwmon 2>/dev/null || echo '?')"
  case "$resolved" in
    */updates/dkms/*) ok "modprobe resolves to: ${resolved}" ;;
    *) warn "modprobe still resolves to: ${resolved}"
       warn "  the dkms module will not win at boot — check /etc/depmod.d search order" ;;
  esac

  info "reloading so the dkms module takes effect now"
  all_channels_auto
  rmmod dell_smm_hwmon 2>/dev/null || warn "rmmod failed — a reboot will pick it up"
  modprobe dell_smm_hwmon || die "modprobe failed — reboot to recover the stock module"

  local f; f="$(fan_count)"
  if (( f >= 5 )); then
    ok "persistent: ${f} fan channels, and dkms will rebuild on kernel upgrades"
  else
    warn "only ${f} fan channels after reload — inspect 'dkms status' and dmesg"
  fi
}

cmd_uninstall() {
  need_root
  bold "Removing ${DKMS_PKG}/${DKMS_VER} from dkms"
  run dkms remove -m "$DKMS_PKG" -v "$DKMS_VER" --all || warn "dkms remove reported an error"
  run rm -rf "$DKMS_SRC"
  run depmod -a
  (( DRY )) && return 0

  info "reloading the stock module"
  all_channels_auto
  rmmod dell_smm_hwmon 2>/dev/null || true
  modprobe dell_smm_hwmon || warn "modprobe failed — reboot to recover"
  ok "stock module restored — fan channels: $(fan_count)"
}

cmd_status() {
  bold "dell_smm_hwmon status"
  if module_loaded; then
    local f; f="$(modinfo -n dell_smm_hwmon 2>/dev/null || echo '(out-of-tree, no file)')"
    ok "loaded (refcount $(module_refcount)) — on-disk stock module: ${f}"
  else
    warn "not loaded"
  fi
  info "fan channels: $(fan_count)   pwm channels: $(pwm_count)"
  if [[ -f "${BUILDDIR}/${MODNAME}.ko" ]]; then
    ok "rebuilt module available: ${BUILDDIR}/${MODNAME}.ko"
  else
    info "no rebuilt module built yet"
  fi
  local st; st="$(dkms status -m "$DKMS_PKG" 2>/dev/null || true)"
  if [[ -n "$st" ]]; then ok "dkms: ${st}"; else info "dkms: not registered (this boot only)"; fi
  info "secure boot: $(secure_boot_state)"
}

# ----------------------------------------------------------------------- main
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)  DRY=1; shift ;;
    --source)   SRCDIR="${2:?--source needs a directory}"; shift 2 ;;
    -h|--help)  usage 0 ;;
    -*)         die "unknown option: $1  (try --help)" ;;
    *)          if [[ -z "$ARG" ]]; then ARG="$1"; else die "unexpected argument: $1"; fi; shift ;;
  esac
done

mkdir -p "$WORKDIR" 2>/dev/null || true

case "${ARG:-}" in
  check)     cmd_check ;;
  build)     cmd_build ;;
  load)      cmd_load ;;
  unload)    cmd_unload ;;
  install)   cmd_install ;;
  uninstall) cmd_uninstall ;;
  status)    cmd_status ;;
  "")      usage 0 ;;
  *)       die "unknown subcommand: ${ARG}  (try --help)" ;;
esac
