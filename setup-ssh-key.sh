#!/usr/bin/env bash
#
# setup-ssh-key.sh — authorize this Mac's SSH key on a remote server.
#
# Run this from YOUR MAC (not on the server). It copies your public key to the
# server's authorized_keys using a one-time password login, then verifies that
# key-based, non-interactive SSH works afterwards.
#
#   ./setup-ssh-key.sh                      # defaults to 192.168.4.31, prompts for user
#   ./setup-ssh-key.sh yorman@192.168.4.31  # explicit user@host
#   ./setup-ssh-key.sh -p 2222 ubuntu@srv   # non-standard port
#   ./setup-ssh-key.sh --print-key          # no network: print the key to paste on the server
#
set -euo pipefail

DEFAULT_HOST="192.168.4.31"
KEY="${HOME}/.ssh/id_ed25519"
PORT=22
ALIAS=""
TARGET=""
PRINT_ONLY=0

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--identity) KEY="${2:?-i needs a path}"; shift 2 ;;
    -p|--port)     PORT="${2:?-p needs a port}"; shift 2 ;;
    -a|--alias)    ALIAS="${2:?-a needs a name}"; shift 2 ;;
    --print-key)   PRINT_ONLY=1; shift ;;
    -h|--help)     usage 0 ;;
    -*)            die "unknown option: $1  (try --help)" ;;
    *)             TARGET="$1"; shift ;;
  esac
done

# ---------------------------------------------------------------- key material
# Public key must exist; derive it from the private key if only that is present.
if [[ ! -f "$KEY" ]]; then
  bold "No key at $KEY"
  read -r -p "  Generate a new ed25519 key there? [Y/n] " reply
  [[ "${reply:-Y}" =~ ^[Yy]?$ ]] || die "aborted — pass an existing key with -i"
  ssh-keygen -t ed25519 -f "$KEY" -C "$(whoami)@$(hostname -s)"
  ok "generated $KEY"
fi
[[ -f "${KEY}.pub" ]] || ssh-keygen -y -f "$KEY" > "${KEY}.pub"

PUBKEY="$(cat "${KEY}.pub")"

if [[ $PRINT_ONLY -eq 1 ]]; then
  bold "Run this ON THE SERVER (console, or any shell you already have there):"
  echo
  cat <<EOF
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo '${PUBKEY}' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
EOF
  echo
  info "Then re-run this script without --print-key to verify the connection."
  exit 0
fi

# -------------------------------------------------------------------- target
if [[ -z "$TARGET" ]]; then
  read -r -p "  Server [${DEFAULT_HOST}]: " host_in
  TARGET="${host_in:-$DEFAULT_HOST}"
fi
if [[ "$TARGET" != *@* ]]; then
  bold "Which username exists on ${TARGET}?"
  info "On Ubuntu Server this is the name chosen during install (often not your Mac username)."
  info "Check it on the box with: whoami"
  read -r -p "  Username: " user_in
  [[ -n "$user_in" ]] || die "a username is required"
  TARGET="${user_in}@${TARGET}"
fi

USER_PART="${TARGET%@*}"
HOST_PART="${TARGET#*@}"

bold "Authorizing $(basename "$KEY") for ${TARGET} (port ${PORT})"
info "fingerprint: $(ssh-keygen -lf "${KEY}.pub" | awk '{print $2}')"

# ------------------------------------------------------------------ preflight
# Fail early with a clear cause rather than a generic ssh timeout.
if ! nc -z -G 5 -w 5 "$HOST_PART" "$PORT" 2>/dev/null; then
  die "cannot reach ${HOST_PART}:${PORT} — check the host is up and sshd is listening"
fi
ok "${HOST_PART}:${PORT} is accepting connections"

# Already done? Then there is no need to ask for a password at all.
if ssh -o BatchMode=yes -o ConnectTimeout=8 -o IdentitiesOnly=yes \
       -i "$KEY" -p "$PORT" "$TARGET" true 2>/dev/null; then
  ok "key is already authorized — nothing to install"
else
  echo
  info "Enter the ${USER_PART} account's password when prompted (one time only)."
  ssh-copy-id -i "${KEY}.pub" -p "$PORT" "$TARGET" || die "ssh-copy-id failed

  Permission denied means the username or password is wrong. OpenSSH returns the
  same error for a bad password and a nonexistent account, so verify the username
  on the server itself with 'whoami'. If you cannot log in with a password at all,
  use:  $0 --print-key"
fi

# --------------------------------------------------------------- verification
echo
bold "Verifying key-based login"
REMOTE_INFO="$(ssh -o BatchMode=yes -o ConnectTimeout=8 -o IdentitiesOnly=yes \
  -i "$KEY" -p "$PORT" "$TARGET" \
  'printf "%s\t%s\t%s" "$(whoami)" "$(hostname)" "$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"' 2>&1)" \
  || die "key install appeared to succeed but login still fails:
  ${REMOTE_INFO}"

IFS=$'\t' read -r r_user r_host r_os <<< "$REMOTE_INFO"
ok "logged in as ${r_user}@${r_host}"
[[ -n "${r_os:-}" ]] && ok "remote OS: ${r_os}"

# ------------------------------------------------------------ optional alias
if [[ -n "$ALIAS" ]]; then
  CONFIG="${HOME}/.ssh/config"
  touch "$CONFIG"; chmod 600 "$CONFIG"
  if grep -qiE "^[[:space:]]*Host[[:space:]]+${ALIAS}([[:space:]]|$)" "$CONFIG"; then
    warn "~/.ssh/config already has a 'Host ${ALIAS}' entry — leaving it untouched"
  else
    cat >> "$CONFIG" <<EOF

Host ${ALIAS}
    HostName ${HOST_PART}
    User ${USER_PART}
    Port ${PORT}
    IdentityFile ${KEY}
    IdentitiesOnly yes
EOF
    ok "added alias — you can now use: ssh ${ALIAS}"
  fi
fi

echo
bold "Done. Claude can now run commands over SSH non-interactively:"
echo "  ssh ${TARGET}$([[ $PORT -ne 22 ]] && echo " -p ${PORT}") 'uname -a'"
