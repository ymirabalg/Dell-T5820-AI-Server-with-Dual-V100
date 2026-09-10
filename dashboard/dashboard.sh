#!/usr/bin/env bash
#
# dashboard.sh — install and operate the ai-server dashboard container.
#
# Runs ON THE SERVER, by a person: sudo needs a password on this box, so nothing here can
# be driven non-interactively from the Mac. The source tree arrives by rsync (SPEC.md §2.3
# — the box is x86_64, the Mac is arm64, so the image is built HERE):
#
#   rsync -a --delete --exclude node_modules --exclude .next --exclude .git \
#         --exclude '*.tsbuildinfo' dashboard/ ai-server:~/ai-dashboard-src/
#
#   ./dashboard.sh deps                # Docker + NVIDIA Container Toolkit       [root]
#   ./dashboard.sh build [--tag SHA]   # docker build, tag :SHA and :latest      [root]
#   ./dashboard.sh set-password        # prompt, hash, write PASSWORD_HASH       [root]
#   ./dashboard.sh configure           # env file, SESSION_SECRET, STANDING      [root]
#   ./dashboard.sh unit                # install and enable the systemd unit     [root]
#   ./dashboard.sh firewall            # the ufw rule for 8090, defensively      [root]
#   ./dashboard.sh start               # start the unit, wait for it to answer   [root]
#   ./dashboard.sh install             # every step above in order, then check   [root]
#   ./dashboard.sh check               # the silent-failure detector
#   ./dashboard.sh status              # unit, container, port, image, env file
#   ./dashboard.sh logs [-f]           # journalctl -u ai-dashboard
#   ./dashboard.sh restart             # restart, prove it restarted, then check [root]
#   ./dashboard.sh uninstall           # unit + container + rule; KEEPS the env file [root]
#
#   --dry-run         print every intended write and command; change nothing
#   --tag SHA         image tag for `build`. No --tag means notag-<UTC date>, loudly
#   --lan-cidr CIDR   source range for the ufw rule (default 192.168.4.0/22)
#   --force           rebuild an image that already exists
#   --purge           uninstall: ALSO delete /etc/ai-dashboard.env, after confirmation
#   --purge-image     uninstall: ALSO delete the ai-dashboard images
#
# check exits 0 when every row passes, 1 when a row FAILED, and 2 when nothing failed but
# a row could not be evaluated — almost always "re-run it with sudo". A row nobody could
# evaluate is not a row that passed; this box has already shipped that mistake once, when
# `systemctl is-active ufw` read green on a firewall that was not enforcing.
#
set -euo pipefail

# ⚠ The C locale, deliberately, and it is not cosmetic.
#
# `[[:space:]]` is LOCALE-DEFINED. Measured 2026-09-10: under a UTF-8 locale on macOS,
# U+00A0 matches it; under glibc it depends on the locale data. So `trim` — which decides
# whether a STANDING entry is empty and where its kind ends — would judge the same env file
# differently on the box and on the machine that tests it, and the check whose whole job is
# to notice a mistyped id would be the thing that varied. Under C it is exactly the ASCII
# set, everywhere, which makes this script STRICTER than JavaScript's `.trim()` — a false
# alarm an operator can see, never a silent pass. `packaging.test.ts` pins that direction.
export LC_ALL=C

# --------------------------------------------------------------------------- what we touch
IMAGE="${IMAGE:-ai-dashboard}"
CONTAINER="${CONTAINER:-ai-dashboard}"
PORT="${PORT:-8090}"
ENV_FILE="${ENV_FILE:-/etc/ai-dashboard.env}"
UNIT_PATH="${UNIT_PATH:-/etc/systemd/system/ai-dashboard.service}"
UNIT_NAME="ai-dashboard.service"
LAN="${LAN:-192.168.4.0/22}"
# ⚠ Backups go to /root, NEVER beside the original and NEVER inside a scanned .d directory.
# Root CLAUDE.md, learned by doing exactly that to /etc/apt/ubuntu.sources: apt then warns
# about the unrecognised extension on EVERY invocation. /etc/ai-dashboard.env.bak.* would
# also be found by a careless `cat /etc/ai-dashboard.env*`, and it carries a password hash.
BACKUP_DIR="${BACKUP_DIR:-/root}"
NVIDIA_KEYRING="/etc/apt/keyrings/nvidia-container-toolkit.gpg"
NVIDIA_SOURCES="/etc/apt/sources.list.d/nvidia-container-toolkit.sources"
NVIDIA_KEY_URL="https://nvidia.github.io/libnvidia-container/gpgkey"
NVIDIA_REPO_URL="https://nvidia.github.io/libnvidia-container/stable/deb/amd64"

# ⚠ Read through a variable so a test can point it somewhere else. `preflight`'s FIRST
# refusal is "is this Ubuntu", and a refusal that can only be exercised by running on the
# wrong OS is a refusal nothing ever measures — which is exactly how all seven of them came
# to be one line from being deleted with the suite green (2026-09-10).
OS_RELEASE="${OS_RELEASE:-/etc/os-release}"
# The container's GPU mode is decided ONCE per start by the unit's probe, and written here.
# ⚠ `check` NEVER reads this file to decide which mode is in force — it asks the container
# (`docker inspect .HostConfig.DeviceRequests`). This path exists so the two can be compared.
GPU_ENV_FILE="${GPU_ENV_FILE:-/run/ai-dashboard-gpu.env}"

DRY=0
FORCE=0
PURGE=0
PURGE_IMAGE=0
TAG=""
CMD=""
ARG=""

# ⚠ Globals, not locals, because the EXIT trap reads them. A cleanup registered on EXIT
# fires AFTER the enclosing function has returned, so a `local` is out of scope by then and
# `set -u` kills the handler — turning a successful run into exit 1. This project has paid
# for that once already (`probe_cleanup` in gpu-fan-control.sh, 2026-08-15).
TMP=""
PW1=""
PW2=""

# --------------------------------------------------------------------------------- output
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
step()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

# usage() re-reads this file's own header, so the help text and the comment at the top are
# the same text and cannot drift. ⚠ Adding a header line means bumping the range.
usage() { sed -n '3,36p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

run() {
  if (( DRY )); then printf '  \033[35m→\033[0m would run: %s\n' "$*"
  else "$@"; fi
}

# A "✓ … written" line that a dry run must not print. Under --dry-run the write itself
# already printed "would write …", and a tick after it would be a report of something that
# did not happen — the one thing a review surface must never do.
ok_done() { (( DRY )) || ok "$*"; }

# ⚠ ONE spelling of "am I root", and it is a FUNCTION rather than `(( EUID == 0 ))` inline.
# `EUID` is readonly in bash, so an inline test cannot be exercised from a test at all: the
# root half of `need_root`, of `preflight`, of `ufw_enforcing` and of `ufw_rule_for_port`
# could each be deleted with the whole suite green (measured 2026-09-10, X29). A function can
# be overridden in a sourced copy, which is what makes those four guards measurable.
is_root() { (( EUID == 0 )); }

# ⚠ `refuse`, not `die`: under --dry-run this prints "WOULD REFUSE" and lets the rest of
# the account be printed. A real run still stops here.
need_root() { is_root || refuse "$CMD needs root — re-run with sudo"; }

# ⚠ A preflight refusal, under --dry-run, is PRINTED rather than taken.
#
# A real run stops at the first refusal, which means a review of `install --dry-run` on a
# box with two problems only ever shows one of them — and the second is found by an operator
# who has already started. So a dry run prints every refusal it would make, labels each one
# WOULD REFUSE, keeps going, and exits NON-ZERO at the end. It is a superset of the real
# run's account, never a quieter one; `PREFLIGHT_REFUSALS` is what makes the exit code
# honest, because a dry run that printed a refusal and exited 0 would be exactly the
# green-on-a-failure shape this box has already shipped once.
PREFLIGHT_REFUSALS=0
refuse() {
  if (( DRY )); then
    PREFLIGHT_REFUSALS=$(( PREFLIGHT_REFUSALS + 1 ))
    printf '  \033[31m✗ WOULD REFUSE:\033[0m %s\n' "$*"
    return 0
  fi
  die "$*"
}

cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [[ -n "$TMP" ]]; then rm -f "$TMP"; fi
  # `read -rs` turns echo off; an interrupt during the password prompt would otherwise
  # leave the operator's terminal silent with no clue why.
  # ⚠ Written as `if`, not `[[ … ]] && …`: an AND-list whose left side fails returns 1, and
  # a trap handler that returns 1 before its own `exit` turns a successful run into exit 1.
  if [[ -t 0 ]]; then stty echo 2>/dev/null || true; fi
  PW1=""; PW2=""
  exit "$rc"
}
trap cleanup EXIT INT TERM

# The directory this script lives in — which IS the rsync'd source tree, since the script
# ships inside it.
#
# ⚠ NOT $HOME/ai-dashboard-src. `$HOME` is not stable across sudo: Ubuntu's sudo resets it
# to /root, so a script whose preflight runs unprivileged and whose build needs root would
# disagree with itself about where its own source is. dell-smm-5fan.sh reported "no rebuilt
# module" for a module it had just built, for exactly this reason (fixed 2026-08-27).
# INSTALL-SPEC §2 names ~/ai-dashboard-src; in the documented flow this resolves to it, and
# in every other flow it resolves to something true rather than to /root.
SRC="${SRC:-$(cd -- "$(dirname -- "$0")" && pwd -P)}"

# ============================================================================================
#  The validators — O20, O21 and D8
# ============================================================================================
#
# ⚠ Everything in this section is a SECOND SPELLING of a rule whose first spelling is
# TypeScript, and every one of them fails silently when it drifts: an unparseable
# PASSWORD_HASH is a clean empty 401 with nothing logged (§5 logs nothing about
# authentication, deliberately), a quoted SESSION_SECRET works today and dies the moment
# anyone rewrites the file, and a mistyped STANDING entry suppresses nothing and leaves the
# banner nailed open. There is no diagnostic anywhere else for any of the three.
#
# This project has shipped a divergence of exactly this shape once — two base64url decoders,
# 1 tag in 16 with four accepted spellings — and the lesson on the do-not-copy list is
# "never a second implementation of a canonical format".
#
# ⚠ So these are held equal to the TypeScript BY MEASUREMENT, not by discipline.
# `packaging.test.ts` sources this file and runs every function below against
# `parseScryptHash` / `decodeExact` (lib/auth/scrypt.ts), `readAuthConfig`
# (lib/auth/config.ts) and `standingIdsFrom` (lib/conditions.ts) over a table of inputs,
# asserting the two agree on every one. If a validator here is edited, that test is the
# thing that must stay green. Mutations `11-*` in
# `pipeline/steps/11-packaging/regressions.py` prove it can go red.
#
# ⚠ They print WHAT is wrong and never the value. A PASSWORD_HASH is offline-attackable and
# a SESSION_SECRET forges every session; both would end up in a terminal scrollback and in
# whatever the operator pastes into a chat window.

# The scrypt encoding, spelled once: `scrypt.<log2N>.<r>.<p>.<salt>.<key>`, six dot-separated
# fields over [A-Za-z0-9._-] (lib/auth/scrypt.ts).
HASH_TAG="scrypt"
# Bounds from LIMITS in lib/auth/scrypt.ts. ⚠ A DoS guard, not a strength guard: a typo'd
# logN of 30 asks OpenSSL for 8 GiB, and the honest answer is "this hash is not usable".
HASH_LOGN_MIN=1;  HASH_LOGN_MAX=20
HASH_R_MIN=1;     HASH_R_MAX=32
HASH_P_MIN=1;     HASH_P_MAX=16
# SALT_BYTES=16 and KEY_BYTES=32 in unpadded base64url are 22 and 43 characters.
#
# ⚠ The trailing character class is not decoration and it is not a typo. `decodeExact`
# re-encodes what it decoded and compares, so it accepts only the CANONICAL spelling — and
# an unpadded base64url field whose length is not a multiple of 4 ends on a character
# carrying unused low bits. 16 bytes is 21 characters plus one carrying 2 significant bits
# (so its index must be a multiple of 16: A Q g w); 32 bytes is 42 plus one carrying 4 (a
# multiple of 4: A E I M Q U Y c g k o s w 0 4 8). Four spellings per salt and sixteen per
# key decode to the identical bytes and are NOT what this project writes. A validator that
# checked only the alphabet and the length would accept all of them, and the server would
# then refuse the hash it had just approved.
HASH_SALT_RE='^[A-Za-z0-9_-]{21}[AQgw]$'
HASH_KEY_RE='^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'

# Print why $1 is not a usable PASSWORD_HASH, and return 1. Silent and 0 when it is fine.
scrypt_hash_error() {
  local h="$1" tag logn r p salt key
  if [[ -z "$h" ]]; then
    echo "is empty"; return 1
  fi
  case "$h" in
    \$argon2*)
      echo "is an argon2id hash. §5 permits either algorithm and this build implements" \
           "scrypt; parseScryptHash returns null for it, and null is a clean empty 401 on" \
           "every attempt with nothing logged. Re-run set-password"
      return 1 ;;
  esac
  # ⚠ Six fields exactly. The last group cannot contain a dot, so a seventh field fails
  # here rather than being silently folded into the key.
  if [[ ! "$h" =~ ^([^.]*)\.([^.]*)\.([^.]*)\.([^.]*)\.([^.]*)\.([^.]*)$ ]]; then
    echo "is not six dot-separated fields (scrypt.<log2N>.<r>.<p>.<salt>.<key>)"
    return 1
  fi
  tag="${BASH_REMATCH[1]}"; logn="${BASH_REMATCH[2]}"; r="${BASH_REMATCH[3]}"
  p="${BASH_REMATCH[4]}";   salt="${BASH_REMATCH[5]}"; key="${BASH_REMATCH[6]}"

  [[ "$tag" == "$HASH_TAG" ]] || { echo "does not start with '${HASH_TAG}.'"; return 1; }

  decimal_in_range "$logn" "$HASH_LOGN_MIN" "$HASH_LOGN_MAX" \
    || { echo "field 2 (log2N) is not a decimal integer in ${HASH_LOGN_MIN}..${HASH_LOGN_MAX}"; return 1; }
  decimal_in_range "$r" "$HASH_R_MIN" "$HASH_R_MAX" \
    || { echo "field 3 (r) is not a decimal integer in ${HASH_R_MIN}..${HASH_R_MAX}"; return 1; }
  decimal_in_range "$p" "$HASH_P_MIN" "$HASH_P_MAX" \
    || { echo "field 4 (p) is not a decimal integer in ${HASH_P_MIN}..${HASH_P_MAX}"; return 1; }

  [[ "$salt" =~ $HASH_SALT_RE ]] \
    || { echo "field 5 (salt) is not canonical unpadded base64url of 16 bytes (${#salt} chars)"; return 1; }
  [[ "$key" =~ $HASH_KEY_RE ]] \
    || { echo "field 6 (key) is not canonical unpadded base64url of 32 bytes (${#key} chars)"; return 1; }
  return 0
}

# `^(0|[1-9][0-9]*)$` — the same rule as `decimal()` in lib/auth/scrypt.ts. ⚠ Deliberately
# stricter than arithmetic: bash's `(( ))` accepts `010` as octal 8 and `0x10` as 16, and
# Node's `Number()` accepts ` 15 `, `1e1` and `+15`. None of those is a spelling this
# project writes, and each one parses to something on one side and nothing on the other.
decimal_in_range() {
  local v="$1" lo="$2" hi="$3"
  [[ "$v" =~ ^(0|[1-9][0-9]*)$ ]] || return 1
  (( 10#$v >= lo && 10#$v <= hi ))
}

# The shortest SESSION_SECRET this build accepts — MIN_SESSION_SECRET_CHARS in
# lib/auth/config.ts. `readAuthConfig` returns null below it and EVERY session is refused.
MIN_SECRET_CHARS=32

# Print why $1 is not a usable value in Docker's --env-file grammar, and return 1.
#
# ⚠ O21. `--env-file` splits on the FIRST `=`, takes the rest of the line VERBATIM, expands
# nothing, and KEEPS QUOTES. `SESSION_SECRET="…32 chars…"` therefore becomes a 34-character
# secret with two quote characters baked in: it PASSES the length floor, produces a working
# dashboard, and every open session dies the moment anyone rewrites the file unquoted.
# `$` is refused for the other direction — a `dashboard.sh` or an operator that ever
# *sourced* this file in a shell would expand it, silently.
env_value_error() {
  local v="$1"
  case "$v" in
    *$'\n'*|*$'\r'*) echo "contains a line break — Docker reads one line per key"; return 1 ;;
    *'"'*)  echo "contains a double quote. --env-file does not strip quotes: the value would include it"; return 1 ;;
    *"'"*)  echo "contains a single quote. --env-file does not strip quotes: the value would include it"; return 1 ;;
    *'$'*)  echo "contains a \$, which a shell that ever sourced this file would expand"; return 1 ;;
    # ⚠ A backtick is the SAME hazard as a \$ and was missing from this list until
    # 2026-09-10: a sourcing shell runs it. Docker keeps it verbatim, so refusing it makes
    # this stricter than Docker in the direction O21 requires — a false alarm an operator
    # can see, never a value that works today and does something else tomorrow.
    *'`'*)  echo "contains a backtick, which a shell that ever sourced this file would EXECUTE"; return 1 ;;
  esac
  # ⚠ Leading and trailing whitespace is part of the value to Docker and invisible to a
  # reader. Checked as text, not by a trim-and-compare that a locale could change.
  case "$v" in
    ' '*|$'\t'*) echo "has leading whitespace, which Docker keeps"; return 1 ;;
    *' '|*$'\t') echo "has trailing whitespace, which Docker keeps"; return 1 ;;
  esac
  return 0
}

# §6.4's condition vocabulary, READ FROM lib/conditions.ts rather than retyped here.
#
# ⚠ D8. A STANDING entry that matches no condition suppresses NOTHING: the banner stays
# nailed open by a condition the operator has already accepted, and there is no error
# anywhere. The client computes exactly this list as `state.unknownStanding` — in the
# browser, which is where §6.4 puts every judgement about an id so that "an id that matches
# no kind is reported as unknown" can reach a reader. Nothing reports it on the box, which
# is what this is for.
#
# Fifteen kinds, each with two flags. Retyping them would be a fifteen-row copy that goes
# stale the first time a kind is added; this reads the table out of the source of truth and
# fails loudly if it cannot.
CONDITION_RULES=""
load_condition_rules() {
  local f="$SRC/lib/conditions.ts" got want
  [[ -r "$f" ]] || die "cannot read $f — STANDING cannot be checked without §6.4's vocabulary"
  # ⚠ POSIX BRE only (no \| alternation): this same function is exercised on macOS by
  # packaging.test.ts, whose sed is BSD's.
  CONDITION_RULES="$(sed -n \
    's/^  \([a-z0-9_]*\): { singleton: \([a-z]*\), bareKindAllowedInStanding: \([a-z]*\) },$/\1 \2 \3/p' \
    "$f")"
  [[ -n "$CONDITION_RULES" ]] \
    || die "could not read CONDITION_KIND_RULES out of $f — the table's shape moved"
  # ⚠ THE COUNT, not just "not empty". The sed above requires ONE exact single-line shape,
  # and a guard that fires only on a TOTALLY empty result is silent for every PARTIAL one:
  # a prettier run, a longer kind name that wraps, or an added field drops that kind from the
  # vocabulary, and `check` then reports the operator's perfectly good STANDING entry as
  # matching nothing. The operator's fix for that is to delete a valid suppression — which
  # un-suppresses an accepted condition, from a formatting change two directories away.
  # Measured 2026-09-10: 14 of 15 kinds extracted, no warning (11-A13).
  #
  # ⚠ The count is taken from a DIFFERENT shape than the extraction, or it would agree with
  # itself: the sed above needs the whole row on one line, while this counts the rows of the
  # object literal by their opening `<kind>: {` — which a reformat KEEPS. Scoped to the
  # CONDITION_KIND_RULES block so an unrelated `Record<…>` elsewhere in the file cannot
  # inflate it.
  got="$(printf '%s\n' "$CONDITION_RULES" | grep -c . || true)"
  want="$(sed -n '/^export const CONDITION_KIND_RULES/,/^};/p' "$f" | grep -cE '^  [a-z0-9_]+: \{' || true)"
  (( got == want )) || die "read ${got} of ${want} condition kinds out of $f — the table's
     shape moved for the rest, and a STANDING entry naming one of them would be reported as
     matching nothing. Fix the sed in load_condition_rules against $f"
}

# kind -> "<singleton> <bareKindAllowedInStanding>", or exit 1 if the kind is unknown.
#
# ⚠ The kind reaches awk through the ENVIRONMENT, not through `-v`. `awk -v k=VALUE`
# processes ESCAPE SEQUENCES in VALUE, so `gpu_te\mp` arrived as `gpu_temp` and this
# function ACCEPTED it — while `standingIdsFrom` reports it unknown. That is the one
# direction this judge must never take: looser than the browser, on the check whose whole
# job is to notice a mistyped id. Measured 2026-09-10 with BSD awk; POSIX leaves an
# undefined escape undefined, so gawk and mawk are free to differ from each other too.
# ENVIRON is byte-exact everywhere.
condition_rule() {
  local found
  # A here-string, not a pipe: `awk … exit` on the read end of a pipe SIGPIPEs the writer,
  # and under `set -o pipefail` that turns a successful lookup into a failed command.
  found="$(CONDITION_KIND="$1" awk '$1 == ENVIRON["CONDITION_KIND"] { print $2, $3 }' <<<"$CONDITION_RULES")"
  [[ -n "$found" ]] || return 1
  printf '%s' "$found"
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# Print why one STANDING entry is not a condition id, and return 1. Silent and 0 otherwise.
#
# §6.4's four malformedness rules, in the order `standingIdsFrom` applies them:
#
#   gpu_fan_speed      unknown — matches no kind
#   ufw_enforcing:yes  unknown — a subject on a singleton kind. "must be reported as
#                      unknown, not silently suppress nothing"; and it is the entry an
#                      operator will actually type, because every other line in an env file
#                      is KEY=value and `ufw_enforcing` reads like a key
#   gpu_temp:          unknown — an empty subject
#   unit               unknown — `unit` requires a subject. A bare `unit` would silence
#                      gpu-fan-control.service, the unit whose failure puts two passively
#                      cooled 250 W cards on an EC curve measured to ignore GPU temperature
#   gpu_temp           accepted — a bare kind matches EVERY subject, which is right for two
#                      identical cards
#
# ⚠ THE DIVERGENCE THAT WAS STATED ONE-DIRECTIONAL AND WAS NOT (fixed 2026-09-10).
#
# `trim` above strips the C locale's `[[:space:]]` — the ASCII set. JavaScript's `.trim()`
# strips that set PLUS twelve more characters (`String.prototype.trim`'s WhiteSpace +
# LineTerminator: U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and
# the BOM U+FEFF). The old comment here said the difference could only make this judge
# STRICTER. It could not, and a differential fuzz measured 24 inputs where it went the other
# way: with the extra whitespace AFTER the colon — `unit:<NBSP>` — bash saw a non-empty
# subject and ACCEPTED, while the browser trimmed it to '' and reported the entry unknown.
# `check` then printed `✓ all N STANDING entries match …` for an entry that suppresses
# nothing, which is D8's entire failure mode certified green by the only thing that can see
# it. U+200B (zero-width space) is NOT in JavaScript's set and is correctly not here either.
#
# The fix is not to copy `.trim()` — under LC_ALL=C these are multi-byte sequences and a
# byte-wise strip could split one. Any entry CONTAINING one of the twelve is refused
# outright, which is >= as strict as the browser on every input: where JS trims it away and
# accepts, this reports a visible false alarm; where JS reports unknown, the two agree.
STANDING_NON_ASCII_SPACE='a non-ASCII whitespace character (a non-breaking space, an en/em
     space, a line/paragraph separator or a BOM — what a paste from a rendered document, a
     chat window or a PDF carries). JavaScript trims those and this cannot, so the browser
     and this check would disagree about the entry'
standing_entry_error() {
  local entry="$1" trimmed kind subject has_subject rule singleton bare
  trimmed="$(trim "$entry")"
  [[ -n "$trimmed" ]] || return 0
  # U+00A0 · U+1680 · U+2000…U+200A · U+2028 · U+2029 · U+202F · U+205F · U+3000 · U+FEFF,
  # as their UTF-8 bytes, enumerated rather than expressed as a byte RANGE: a range inside a
  # bracket expression is collation-dependent, and this file's whole reason for `LC_ALL=C` is
  # that a locale-dependent character class judged the same env file two ways.
  case "$trimmed" in
    *$'\xc2\xa0'*|*$'\xe1\x9a\x80'*|*$'\xe2\x80\x80'*|*$'\xe2\x80\x81'*|*$'\xe2\x80\x82'*\
    |*$'\xe2\x80\x83'*|*$'\xe2\x80\x84'*|*$'\xe2\x80\x85'*|*$'\xe2\x80\x86'*|*$'\xe2\x80\x87'*\
    |*$'\xe2\x80\x88'*|*$'\xe2\x80\x89'*|*$'\xe2\x80\x8a'*|*$'\xe2\x80\xa8'*|*$'\xe2\x80\xa9'*\
    |*$'\xe2\x80\xaf'*|*$'\xe2\x81\x9f'*|*$'\xe3\x80\x80'*|*$'\xef\xbb\xbf'*)
      echo "an entry contains ${STANDING_NON_ASCII_SPACE}"
      return 1 ;;
  esac
  if [[ "$trimmed" == *:* ]]; then
    kind="${trimmed%%:*}"; subject="${trimmed#*:}"; has_subject=1
  else
    kind="$trimmed"; subject=""; has_subject=0
  fi
  if ! rule="$(condition_rule "$kind")"; then
    echo "'${trimmed}' matches no condition kind"
    return 1
  fi
  singleton="${rule%% *}"; bare="${rule##* }"
  if (( has_subject == 0 )); then
    [[ "$bare" == "true" ]] && return 0
    echo "'${trimmed}' is a bare kind that requires a subject (a bare 'unit' would silence gpu-fan-control.service)"
    return 1
  fi
  if [[ -z "$subject" ]]; then
    echo "'${trimmed}' has an empty subject"
    return 1
  fi
  if [[ "$singleton" == "true" ]]; then
    echo "'${trimmed}' puts a subject on a singleton kind — the box has exactly one"
    return 1
  fi
  return 0
}

# ============================================================================================
#  /etc/ai-dashboard.env  (§6)
# ============================================================================================

# ⚠ "Could not read it" is NOT "it is not there", and `check` shipped that confusion.
# Measured 2026-09-10: a CORRECT deployment (root:root 0600) checked WITHOUT sudo printed
# `✗ PASSWORD_HASH is absent — every login is denied, silently`, `✗ SESSION_SECRET is absent`
# and `✗ STANDING is absent` — three specific, alarming, WRONG diagnoses on a healthy box,
# with exit 1 rather than the exit 2 whose whole meaning is "re-run it with sudo". The
# operator's most likely next action from that output is `sudo ./dashboard.sh set-password`,
# which overwrites a working password. Every row that can be reached without root asks this
# first, and files `row_unknown` instead. A separate function so a test can drive both sides
# without being run as root.
env_readable() { [[ -r "$ENV_FILE" ]]; }

env_get() {
  env_readable || return 1
  # Docker takes the LAST occurrence of a key, so this does too. `tail` consumes all of
  # sed's output, so there is no SIGPIPE for `pipefail` to trip over.
  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -1
}

env_has() {
  local hit
  env_readable || return 1
  hit="$(sed -n "s/^${1}=.*/present/p" "$ENV_FILE")"
  [[ -n "$hit" ]]
}

# ⚠ 0600 BEFORE anything is in it, and root-owned only when we are root. `install -o root`
# fails outright for a non-root caller, which on the box is right (every writer preflights
# for root) and off the box meant the mode of the file carrying the password hash was
# unmeasurable: `-m 0600` could be changed to `-m 0644` with the whole suite green
# (2026-09-10, X37/X38). Splitting the ownership off makes the mode assertable anywhere.
install_0600() {
  local from="$1" to="$2"
  install -m 0600 "$from" "$to"
  if is_root; then chown root:root "$to"; fi
}

backup_env() {
  local stamp dest
  [[ -f "$ENV_FILE" ]] || return 0
  stamp="$(date +%Y%m%d-%H%M%S)"
  dest="${BACKUP_DIR}/ai-dashboard.env.bak.${stamp}"
  if (( DRY )); then info "would copy $ENV_FILE -> $dest (mode 0600)"; return 0; fi
  install_0600 "$ENV_FILE" "$dest"
  info "backed up $ENV_FILE -> $dest"
}

# env_set KEY VALUE — rewrite the file with KEY set, every other line kept verbatim.
env_set() {
  local key="$1" value="$2" why
  if ! why="$(env_value_error "$value")"; then
    die "refusing to write ${key}: the value ${why}"
  fi
  # ⚠ BEFORE the --dry-run return, not after it. `backup_env` is itself dry-aware, and
  # while it was called below this block its "would copy …" line was UNREACHABLE: a real
  # run wrote a timestamped copy of the credentials into /root and the review surface an
  # operator reads first never mentioned it. INSTALL-SPEC §1 asks that a dry run be a
  # complete account of what the real run does; an unannounced write is the opposite.
  backup_env
  if (( DRY )); then
    if [[ "$key" == "PASSWORD_HASH" || "$key" == "SESSION_SECRET" ]]; then
      info "would write ${key}=<${#value} characters, not printed> to $ENV_FILE (0600 root:root)"
    else
      info "would write ${key}=${value} to $ENV_FILE (0600 root:root)"
    fi
    return 0
  fi
  # ⚠ The temp file is built in the DESTINATION's directory, and the last step is a `mv`.
  # `install` COPIES ONTO the destination: it truncates the live credentials file and writes
  # it again, so an interrupt, a full `/` or a power loss inside that window leaves a
  # truncated /etc/ai-dashboard.env — every login denied and every session refused at once,
  # with nothing logged. A rename within one filesystem is atomic; a temp file in /root and a
  # destination in /etc are not guaranteed to be one filesystem, so the temp moves here.
  # It is a DOT file (invisible to a careless `cat /etc/ai-dashboard.env*`), 0600 from
  # creation by `mktemp`, and the EXIT trap removes it on every path.
  TMP="$(mktemp "$(dirname -- "$ENV_FILE")/.ai-dashboard.env.XXXXXX")"
  chmod 0600 "$TMP"
  if [[ -f "$ENV_FILE" ]]; then
    # Every line except this key, verbatim. Comments and blank lines survive: Docker's
    # --env-file skips both.
    sed "/^${key}=/d" "$ENV_FILE" >"$TMP"
  else
    {
      echo "# /etc/ai-dashboard.env — SPEC.md §5.1, written by dashboard.sh."
      echo "# Read ONCE by 'docker run --env-file', at container creation. A change here"
      echo "# takes effect on the next 'dashboard.sh restart', never on the next poll."
      echo "# ⚠ Docker's grammar is not a shell's: it splits on the FIRST '=', takes the"
      echo "# rest of the line verbatim, expands nothing and KEEPS QUOTES. Every value is"
      echo "# single-line, unquoted, untrimmed and free of '\$'. 'dashboard.sh check' says so."
    } >"$TMP"
  fi
  printf '%s=%s\n' "$key" "$value" >>"$TMP"
  chmod 0600 "$TMP"
  if is_root; then chown root:root "$TMP"; fi
  mv -f "$TMP" "$ENV_FILE"
  TMP=""
}

# ============================================================================================
#  ufw, docker and systemd — asking, never assuming
# ============================================================================================

have() { command -v "$1" >/dev/null 2>&1; }

# ⚠ A function for the same reason as `is_root`: `[[ -t 0 ]]` inline cannot be exercised from
# a test at all, and the belt-and-braces re-check of the hasher's own output sits BEHIND it.
# That re-check could be deleted with the whole suite green (2026-09-10, X45), on the one
# guard between a hash the server cannot parse and a dashboard that denies every login with
# nothing logged. The refusal itself is unchanged: no terminal, no password.
have_terminal() { [[ -t 0 ]]; }

# ⚠ `systemctl is-active ufw` is NOT evidence the firewall is enforcing anything. ufw.service
# is a oneshot that applies rules only when ENABLED=yes and reports "active (exited)" either
# way, so is-active reads green on a disabled firewall. Found on this box on 2026-09-04 with
# 8080/8081 open to anything routable behind that green tick. Ask ufw, not systemd.
ufw_enforcing() {
  have ufw || return 1
  if is_root; then
    [[ "$(ufw status 2>/dev/null | head -1)" == "Status: active" ]]
  else
    [[ "$(sed -n 's/^ENABLED=//p' /etc/ufw/ufw.conf 2>/dev/null | tail -1)" == "yes" ]]
  fi
}

# Does an allow rule cover a port? Prints the matching rule, or nothing.
#
# ⚠ Matched on the "To" COLUMN, never as a substring of the line. The LAN source range this
# script writes is `192.168.4.0/22`, which ends in the characters `/22` — a grep for "22"
# anywhere in a `ufw status` line reports that the SSH port is covered by the rule that
# covers 8090, on the one check whose failure takes the box off the network. A port-22
# allow can also legitimately be spelled `OpenSSH` or `SSH` (a ufw app profile) or as a
# range like `20:30/tcp`, and all three are accepted here.
#
# ⚠ THE "To" COLUMN IS NOT ALWAYS $1 (fixed 2026-09-10). Legal spellings were invisible to
# the old `to = $1`, and this function feeds the HARD REFUSAL — a refusal that fires on a
# correctly configured machine is how an operator learns to ignore the one refusal that
# matters. Measured against this awk program with fabricated `ufw status` output:
#
#   22/tcp                 ALLOW  192.168.4.0/22   what this script writes   — found before
#   192.168.4.71 22/tcp    ALLOW  192.168.4.0/22   `ufw allow from LAN to <ip> port 22`
#   Anywhere               ALLOW  192.168.4.0/22   a blanket `ufw allow from LAN`
#   [ 1] 22/tcp            ALLOW IN  Anywhere      numbered, rules 1-9: ufw pads a single
#                                                  digit with a SPACE, so `$1` was `[` and
#                                                  `$2` was `1]` — the branch took the RULE
#                                                  NUMBER as the port
#
# ⚠ Stated accurately: this box's own rule is the FIRST form, which the old matcher did
# find, so the destination-qualified miss was LATENT here rather than a live blocker
# (checked 2026-09-10). The numbered case is dead today because only plain `ufw status` is
# parsed. Both are fixed anyway — every field before the ACTION column is tested as a "To".
#
# ⚠ `Anywhere` (v4) genuinely covers every port: it is what ufw prints when a rule names no
# destination port, so accepting it is ufw's semantics rather than laxity. `Anywhere (v6)` is
# NOT accepted — an IPv6 blanket does not keep an IPv4 SSH session alive, and this is the
# check standing between a root run and the 2026-09-04 lockout.
ufw_rule_for_port() {
  local want="$1"
  is_root || return 2
  have ufw || return 2
  ufw status 2>/dev/null | awk -v want="$want" '
    function covers(to,   slash, port, colon, lo, hi) {
      if (to == "OpenSSH" || to == "SSH") { return 1 }
      if (to == "Anywhere") { return 1 }          # no destination port = every port
      slash = index(to, "/")
      port = (slash ? substr(to, 1, slash - 1) : to)
      if (port == want) { return 1 }
      colon = index(port, ":")
      if (colon) {
        lo = substr(port, 1, colon - 1) + 0
        hi = substr(port, colon + 1) + 0
        if (lo <= want + 0 && want + 0 <= hi) { return 1 }
      }
      return 0
    }
    /^Status:/ || /^ *$/ || /^To  *Action/ || /^-- *$/ { next }
    {
      first = 1
      if ($1 ~ /^\[[0-9]*\]?$/) { first = ($1 ~ /\]$/) ? 2 : 3 }
      for (i = first; i <= NF; i++) {
        if ($i ~ /^(ALLOW|DENY|REJECT|LIMIT)$/) { break }   # the Action column ends "To"
        if ($i == "Anywhere" && $(i + 1) == "(v6)") { continue }   # v6 blanket: see above
        if (covers($i)) { print; next }
      }
    }'
}

docker_ok() { have docker && docker info >/dev/null 2>&1; }

container_ids() {
  docker ps --filter "name=^${CONTAINER}$" --format '{{.ID}}' 2>/dev/null || true
}

image_exists() {
  local out
  out="$(docker image inspect "$1" --format '{{.Id}}' 2>/dev/null || true)"
  [[ -n "$out" ]]
}

unit_installed() { [[ -f "$UNIT_PATH" ]]; }

# ============================================================================================
#  Preflight (§2) — refuse before anything slow or interactive, so a failure names its cause
# ============================================================================================

# preflight <needs-root> <needs-python> <needs-source> <will-touch-the-firewall>
#
# ⚠ Runs ONCE per invocation. `install` calls it with the union of every step's
# requirements and then calls those steps, each of which would otherwise preflight again —
# five identical blocks in one run, which is how a review surface becomes something nobody
# reads to the end.
PREFLIGHT_DONE=0
preflight() {
  local want_root="$1" want_python="$2" want_source="$3" want_firewall="${4:-0}"
  local id ver arch major minor free name listener

  (( PREFLIGHT_DONE )) && return 0
  PREFLIGHT_DONE=1

  step "Preflight"

  if [[ -r "$OS_RELEASE" ]]; then
    id="$(sed -n 's/^ID=//p' "$OS_RELEASE" | tr -d '"' | tail -1)"
    ver="$(sed -n 's/^VERSION_ID=//p' "$OS_RELEASE" | tr -d '"' | tail -1)"
  else
    id=""; ver=""
  fi
  arch="$(uname -m)"
  major="${ver%%.*}"; minor="${ver#*.}"; minor="${minor%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] || major=0
  [[ "$minor" =~ ^[0-9]+$ ]] || minor=0
  # The image is node:24-slim: glibc, amd64. Anything else is a different runtime wearing
  # the same tag.
  if [[ "$id" != "ubuntu" ]] || (( major < 24 )) || { (( major == 24 )) && (( minor < 4 )); }; then
    refuse "needs Ubuntu 24.04 or newer; found ${id:-unknown} ${ver:-unknown}"
  fi
  [[ "$arch" == "x86_64" ]] || refuse "needs x86_64; found ${arch}"
  ok "os:      ${id} ${ver} ${arch}"

  if (( want_root )); then
    if is_root; then ok "root:    yes"
    else refuse "$CMD needs root — re-run with sudo"; fi
  fi

  if (( want_source )); then
    # ⚠ The second half runs only if the first passed. Under --dry-run `refuse` PRINTS and
    # returns, so this block goes on executing after a refusal — and `sed` on a file that is
    # not there is a raw error that killed the dry run before the rest of its account
    # (INSTALL-SPEC §1: a dry run prints every refusal it would make, not the first).
    if [[ ! -r "$SRC/package.json" ]]; then
      refuse "no package.json in $SRC — is this the rsync'd source tree?"
    else
      name="$(sed -n 's/^[[:space:]]*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$SRC/package.json")"
      name="${name%%$'\n'*}"
      if [[ "$name" == "ai-dashboard" ]]; then
        ok "source:  $SRC (package.json says ai-dashboard)"
      else
        refuse "$SRC/package.json is '${name:-unnamed}', not 'ai-dashboard'"
      fi
    fi
  fi

  # `df -Pk` for the POSIX one-line-per-filesystem format; the default output wraps a long
  # device name onto two lines and shifts every column.
  free="$(df -Pk /var/lib 2>/dev/null | awk 'NR == 2 { print int($4 / 1048576) }')"
  if [[ -z "$free" ]]; then
    warn "disk:    could not read free space on /var/lib"
  elif (( free < 10 )); then
    refuse "only ${free} GB free on /var/lib; the build plus the image needs 10 GB"
  else
    ok "disk:    ${free} GB free on /var/lib"
  fi

  # ⚠ Warn, never refuse. "There is no compute GPU" is a documented state of this box, and
  # a dashboard that reports `gpus: null` honestly is exactly what §6.5 asks for.
  if have nvidia-smi && nvidia-smi -L >/dev/null 2>&1; then
    ok "driver:  $(nvidia-smi --query-gpu=driver_version --format=csv,noheader | tail -1) ($(nvidia-smi -L | wc -l | tr -d ' ') GPU(s))"
  else
    warn "driver:  nvidia-smi absent or failing. The GPU panels will read '—', and the"
    warn "         unit's ExecStartPre probe will start the container WITHOUT --gpus all"
    warn "         (INSTALL-SPEC §11.1). The other eight panels are unaffected; 'check'"
    warn "         says which mode is in force, because a fallback outlives its cause"
  fi

  # ⚠ THE HARD REFUSAL. Enabling ufw without a rule for port 22 took this box off the
  # network on 2026-09-04, and a Precision 5820 is a workstation with no iDRAC/BMC —
  # recovery is a keyboard and a monitor. This script never runs `ufw enable`, but it does
  # refuse to touch a firewall that is one rule away from locking its operator out.
  if ufw_enforcing; then
    if is_root; then
      if [[ -n "$(ufw_rule_for_port 22)" ]]; then
        ok "ufw:     enforcing, and a rule covers port 22"
      else
        refuse "⚠ HARD REFUSAL — ufw is enforcing and NO rule covers port 22. Fix that FIRST,
     from a session you
     already have open and do not close:
       sudo ufw allow from ${LAN} to any port 22 proto tcp
       sudo ufw status numbered"
      fi
    else
      warn "ufw:     enforcing; the port-22 rule cannot be read without root"
    fi
  elif (( want_firewall )); then
    # ⚠ THE SAME CONDITION, JUDGED ONCE. `cmd_firewall` refuses on a non-enforcing ufw and
    # `install` reaches it at step 6 of 8 — after docker has been installed and RESTARTED,
    # the image built, the password prompted and written, and the unit installed and ENABLED.
    # The run then stops, so `start` and `check` never happen: the deployment first comes up
    # AT THE NEXT REBOOT, unattended, with no ufw rule, while the operator's last signal was
    # a failure. Preflight already knew the answer at step 0 and only warned, so the two
    # judgements of one condition disagreed 380 lines apart (11-A9, 2026-09-10). INSTALL-SPEC
    # §8 asks the script to stop; it now stops HERE, before anything has been done.
    refuse "$CMD reaches the firewall step and ufw reads ENABLED=no. This script never runs
     'ufw enable' — that is an operator's decision, taken from a session that stays open
     until a fresh one is verified. Check the port-22 rule FIRST, which activates nothing:
       sudo ufw show added
       sudo ufw allow from ${LAN} to any port 22 proto tcp
       sudo ufw enable"
  else
    warn "ufw:     NOT enforcing. This script never runs 'ufw enable' — that is an"
    warn "         operator's decision, from a session that stays open (root CLAUDE.md)"
  fi

  if (( want_python )); then
    have python3 || refuse "python3 is missing, and scripts/hash-password.py is the only producer of PASSWORD_HASH"
    [[ -r "$SRC/scripts/hash-password.py" ]] \
      || refuse "no $SRC/scripts/hash-password.py — the rsync must carry scripts/ (INSTALL-SPEC §11.3)"
    ok "python:  $(python3 --version 2>&1) with $SRC/scripts/hash-password.py"
  fi

  # Something already on 8090 that is not ours means the container will start, fail to
  # bind, and log it where nobody looks.
  if have ss; then
    listener="$(ss -H -ltn "sport = :${PORT}" 2>/dev/null || true)"
    if [[ -n "$listener" && -z "$(container_ids)" ]]; then
      refuse "something is already listening on ${PORT} and it is not our container:
     ${listener}"
    fi
    if [[ -z "$listener" ]]; then ok "port:    ${PORT} is free"
    else ok "port:    ${PORT} held by ${CONTAINER}"; fi
  else
    warn "tools:   'ss' is missing — the 8090 listener count in 'check' cannot be taken"
  fi

  # ⚠ A preflight exists so a failure NAMES ITS CAUSE. Neither of these was checked, and
  # `deps` pipes curl into gpg while `start` polls with it: a missing curl made `deps` die on
  # a raw `command not found` from inside a pipeline (11-A18d). A warning rather than a
  # refusal — `curl` is present on every Ubuntu this box has ever run, and a refusal on a
  # command that does not use it would be the refusal-nobody-reads shape again.
  have curl || warn "tools:   'curl' is missing — 'deps' pipes the NVIDIA key through it and
     'start' polls the login page with it. Both will fail on a bare 'command not found'"

  if (( DRY )) && (( PREFLIGHT_REFUSALS > 0 )); then
    warn "${PREFLIGHT_REFUSALS} refusal(s) above. A REAL run stops at the first one; this dry"
    warn "  run kept going so you can see all of them, and it will exit non-zero."
  fi
}

# ============================================================================================
#  deps (§3) — Docker from Ubuntu's archive, the toolkit from the one third-party source
# ============================================================================================

NVIDIA_SOURCES_BODY() {
  cat <<SOURCES
Types: deb
URIs: ${NVIDIA_REPO_URL}
Suites: /
Signed-By: ${NVIDIA_KEYRING}
SOURCES
}

cmd_deps() {
  preflight 1 0 0

  step "Docker, from Ubuntu's own archive"
  # ⚠ Not get.docker.com | sh, and not Docker's own apt repo. docker.io 29.1.3 IS in Ubuntu
  # 26.04's archive; a second third-party source is a second thing that can replace libc6.
  if have docker; then
    ok "docker already present: $(docker --version 2>/dev/null || echo unknown)"
  else
    run apt-get install -y docker.io
  fi

  step "NVIDIA Container Toolkit, from the ONE third-party source on this box"
  # It is genuinely not in the archive: `apt-cache search nvidia-container` is empty on
  # 26.04. Without it every poll is `gpus: null` and both headline panels are permanently
  # blank. ⚠ The container still STARTS — the unit's probe falls back to no `--gpus all`
  # rather than taking the whole dashboard down with the GPU panels (INSTALL-SPEC §11.1) —
  # but the fallback lasts until someone restarts, and `check`'s GPU-mode row is what says so.
  info "key:     $NVIDIA_KEY_URL -> $NVIDIA_KEYRING (dearmoured)"
  info "source:  $NVIDIA_SOURCES"
  NVIDIA_SOURCES_BODY | sed 's/^/      /'
  # ⚠ Signed-By pins the key to THIS source. A key dropped in trusted.gpg.d signs the whole
  # archive list, which is how a third-party repo becomes able to replace libc6.
  info "⚠ Signed-By pins that key to this source only, never to the whole archive list"

  if (( DRY )); then
    # ⚠ These lines are the COMMANDS BELOW, spelled out. A review surface that prints a
    # command the real run does not execute is worse than no review surface: `--batch --yes`
    # is what makes the key write overwrite an existing keyring without asking, and the
    # backup below is a write into /root that a reader would otherwise not know about.
    info "would run: install -d -m 0755 /etc/apt/keyrings"
    if [[ -f "$NVIDIA_SOURCES" ]]; then
      info "would copy $NVIDIA_SOURCES -> ${BACKUP_DIR}/nvidia-container-toolkit.sources.bak.<timestamp>"
    fi
    info "would run: curl -fsSL $NVIDIA_KEY_URL | gpg --batch --yes --dearmor -o $NVIDIA_KEYRING"
    info "would run: chmod 0644 $NVIDIA_KEYRING"
    info "would print the key fingerprint with: gpg --show-keys --with-fingerprint $NVIDIA_KEYRING"
    info "would write $NVIDIA_SOURCES (0644 root:root) with the body above"
  else
    install -d -m 0755 /etc/apt/keyrings
    # ⚠ A backup NEVER goes inside a scanned .d directory: apt warns about an unrecognised
    # extension there on EVERY invocation. Root CLAUDE.md, learned on ubuntu.sources.
    if [[ -f "$NVIDIA_SOURCES" ]]; then
      install -m 0644 -o root -g root "$NVIDIA_SOURCES" \
        "${BACKUP_DIR}/nvidia-container-toolkit.sources.bak.$(date +%Y%m%d-%H%M%S)"
      info "backed up the existing source file into ${BACKUP_DIR}/"
    fi
    curl -fsSL "$NVIDIA_KEY_URL" | gpg --batch --yes --dearmor -o "$NVIDIA_KEYRING"
    chmod 0644 "$NVIDIA_KEYRING"
    ok "key installed. Fingerprint:"
    gpg --show-keys --with-fingerprint "$NVIDIA_KEYRING" 2>/dev/null | sed 's/^/      /' || true
    # ⚠ Written WHOLE, never appended to.
    NVIDIA_SOURCES_BODY >"$NVIDIA_SOURCES"
    chmod 0644 "$NVIDIA_SOURCES"
    ok "wrote $NVIDIA_SOURCES"
  fi

  run apt-get update
  run apt-get install -y nvidia-container-toolkit

  step "Wiring the toolkit into the docker daemon"
  # nvidia-ctk rewrites /etc/docker/daemon.json. Back it up first, print before and after,
  # then restart docker — which stops every running container, including this dashboard.
  if [[ -f /etc/docker/daemon.json ]]; then
    info "current /etc/docker/daemon.json:"
    sed 's/^/      /' /etc/docker/daemon.json
    if (( DRY )); then
      info "would copy /etc/docker/daemon.json -> ${BACKUP_DIR}/daemon.json.bak.<timestamp>"
    else
      install -m 0644 -o root -g root /etc/docker/daemon.json \
        "${BACKUP_DIR}/daemon.json.bak.$(date +%Y%m%d-%H%M%S)"
    fi
  else
    info "there is no /etc/docker/daemon.json yet; nvidia-ctk will create one"
  fi
  run nvidia-ctk runtime configure --runtime=docker
  if (( DRY )); then
    info "would print the resulting /etc/docker/daemon.json"
  elif [[ -f /etc/docker/daemon.json ]]; then
    info "resulting /etc/docker/daemon.json:"
    sed 's/^/      /' /etc/docker/daemon.json
  fi
  warn "restarting docker stops every running container on this box"
  run systemctl restart docker

  step "Versions — and they are COUPLED"
  report_toolkit_and_driver
  warn "⚠ A driver upgrade that breaks the toolkit takes the GPU panels with it. It no"
  warn "  longer takes the whole dashboard: the unit probes first and starts without"
  warn "  --gpus all if the toolkit does not answer. ⚠ That fallback is decided ONCE, at"
  warn "  container creation, and survives the fix until a restart — './dashboard.sh check'"
  warn "  reports which mode is in force. This joins DKMS on the after-every-kernel-upgrade"
  warn "  check."
}

report_toolkit_and_driver() {
  local tk drv
  tk="$(nvidia-ctk --version 2>/dev/null | tail -1 || true)"
  drv="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | tail -1 || true)"
  info "toolkit: ${tk:-absent}"
  info "driver:  ${drv:-absent}"
}

# ============================================================================================
#  build (§4)
# ============================================================================================

cmd_build() {
  preflight 1 0 1
  local tag
  if [[ -n "$TAG" ]]; then
    tag="$TAG"
  else
    # ⚠ The box's copy is NOT a git checkout — it arrives by rsync — so the sha cannot come
    # from `git rev-parse` here. An untagged image cannot be traced back to a commit, and
    # this project has already learned to deploy a commit rather than a working tree
    # (FIRST-DEPLOY §7: a build agent was mid-edit on lib/format.ts).
    tag="notag-$(date -u +%Y%m%d)"
    warn "no --tag: tagging ${IMAGE}:${tag}. ⚠ This image cannot be traced back to a commit."
    warn "         Pass --tag \$(git rev-parse --short HEAD) from the Mac's checkout instead."
  fi

  step "Building ${IMAGE}:${tag}"
  docker_ok || { (( DRY )) || die "docker is not running — run 'deps' first"; }
  # ⚠ "Already present" is treated as "already correct" NOWHERE ELSE in this script, and it
  # must not be treated so for an AUTO-GENERATED tag. `notag-<UTC date>` collides for every
  # build on one day, so the second build of a day printed a GREEN TICK, left `:latest`
  # pointing where it was, and the next `restart` then proved a restart had happened — the
  # container id really did change — while `check` passed every row ON THE OLD CODE. That is
  # this repo's most-repeated failure mode (a success report over a no-op) reached through
  # the deploy path itself (11-A3, 2026-09-10). An explicit `--tag` identifies its contents,
  # so a skip there is a real answer; `notag-` identifies a DAY and never a tree.
  if image_exists "${IMAGE}:${tag}" && (( ! FORCE )) && [[ -n "$TAG" ]]; then
    warn "${IMAGE}:${tag} already exists and --tag was given, so it is NOT being rebuilt."
    warn "  ⚠ Nothing here compares that image with $SRC. If the tree has changed since,"
    warn "  ':latest' still points at the OLD image and every later step — including check —"
    warn "  will pass on old code. Re-run with --force if you have edited anything."
    (( DRY )) || info "$(docker image inspect "${IMAGE}:${tag}" \
      --format 'existing: {{.Id}} built {{.Created}}' 2>/dev/null || true)"
  elif image_exists "${IMAGE}:${tag}" && (( ! FORCE )); then
    warn "${IMAGE}:${tag} already exists, and that tag is a DATE rather than a commit — a"
    warn "  second build on one day collides with the first. Rebuilding rather than shipping"
    warn "  whatever was built earlier today."
    run docker build -t "${IMAGE}:${tag}" -t "${IMAGE}:latest" "$SRC"
  else
    run docker build -t "${IMAGE}:${tag}" -t "${IMAGE}:latest" "$SRC"
  fi
  (( DRY )) || info "$(docker image inspect "${IMAGE}:${tag}" --format '{{.Id}} {{.Size}} bytes' 2>/dev/null || true)"
}

# ============================================================================================
#  set-password (§5)
# ============================================================================================

cmd_set_password() {
  preflight 1 1 1
  local hash_out rc
  step "Setting the dashboard password"

  if (( DRY )); then
    info "would prompt twice with 'read -rs' (no echo, never an argument — an argument"
    info "  lands in shell history and in ps, the same reasoning as --api-key-file)"
    info "would pipe it on STDIN into: python3 $SRC/scripts/hash-password.py"
    info "  ⚠ exit 2 means §5.1's policy refused it (≥6 characters, a letter and a digit);"
    info "  the script prints NO hash in that case, so a caller that ignored the exit code"
    info "  cannot write one"
    # ⚠ THE BACKUP, announced HERE TOO. `env_set` calls `backup_env` above its own dry-run
    # return, which repairs every caller that REACHES `env_set` — and this one returns first,
    # so `set-password --dry-run` was silent about a timestamped 0600 copy of the credentials
    # file landing in /root, on the subcommand that rewrites that file EVERY time it is run
    # (11-A7, the 11-N3 fix reaching one of two callers). Same spelling as `env_set`'s.
    backup_env
    info "would write PASSWORD_HASH=<the hash, not printed> to $ENV_FILE (0600 root:root)"
    return 0
  fi

  have_terminal || die "set-password needs a terminal; it will not read a password from a pipe"

  while :; do
    printf '  password: '   ; IFS= read -rs PW1; printf '\n'
    printf '  again:    '   ; IFS= read -rs PW2; printf '\n'
    if [[ "$PW1" != "$PW2" ]]; then
      warn "the two did not match"
      continue
    fi
    # ⚠ printf is a BUILTIN, so the password never becomes an argv of an external process
    # and never appears in ps. §5.1's rule, and serve-llm.sh's --api-key-file reasoning.
    set +e
    hash_out="$(printf '%s' "$PW1" | python3 "$SRC/scripts/hash-password.py" 2>&1)"
    rc=$?
    set -e
    if (( rc == 2 )); then
      # The script names the rule that failed; print ITS message rather than a second copy
      # of the policy that could drift from it.
      warn "$hash_out"
      continue
    fi
    (( rc == 0 )) || die "hash-password.py exited ${rc}: ${hash_out}"
    break
  done
  PW1=""; PW2=""

  # ⚠ Belt and braces over the producer, because the failure it guards is silent: an
  # unparseable PASSWORD_HASH is a clean empty 401 on every attempt with nothing logged.
  local why
  if ! why="$(scrypt_hash_error "$hash_out")"; then
    die "hash-password.py produced something this build cannot verify: it ${why}"
  fi
  env_set PASSWORD_HASH "$hash_out"
  hash_out=""
  ok "PASSWORD_HASH written to $ENV_FILE"
  info "⚠ §5.1's policy is enforced HERE and is unverifiable afterwards: 'check' is handed a"
  info "  hash, so it can confirm the encoding and never the password behind it"
  if unit_installed; then
    warn "the container reads this file once, at creation — run: dashboard.sh restart"
  fi
}

# ============================================================================================
#  configure (§6)
# ============================================================================================

cmd_configure() {
  preflight 1 0 0
  step "Configuring $ENV_FILE"

  # ⚠ NEVER overwritten. Rotating SESSION_SECRET logs out every open session — the same
  # principle as `serve-llm.sh install` never repointing a live model.
  if env_has SESSION_SECRET && [[ -n "$(env_get SESSION_SECRET || true)" ]]; then
    ok "SESSION_SECRET already present — keeping it (rotating it logs out every session)"
  else
    # 32 random bytes as HEX: 64 characters of [0-9a-f], which cannot collide with a quote,
    # a space or a '$'. That is deliberate, not cosmetic — see env_value_error.
    local secret
    if (( DRY )); then
      info "would generate 32 random bytes as 64 hex characters and write SESSION_SECRET"
      # ⚠ …and then through env_set, with a placeholder of the right LENGTH rather than a
      # real secret, so that the account a dry run prints carries the backup, the file and
      # the mode the real run would produce. Skipping the writer here left the one branch
      # that rewrites a live credentials file announcing nothing but a sentence.
      # env_set prints the LENGTH and never the value, on both paths.
      secret="$(printf '%064d' 0)"
      env_set SESSION_SECRET "$secret"
      secret=""
    else
      secret="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
      [[ "${#secret}" -eq 64 ]] || die "expected 64 hex characters from /dev/urandom, got ${#secret}"
      env_set SESSION_SECRET "$secret"
      secret=""
      ok_done "SESSION_SECRET written (64 hex characters, not printed)"
    fi
  fi

  # ⚠ D8. Absent or misspelled, §6.4's suppression silently never applies.
  if env_has STANDING; then
    ok "STANDING already present — leaving it alone (it is the operator's)"
  else
    env_set STANDING ""
    ok_done "STANDING= written (empty: nothing is standing, which is the loud default)"
  fi

  if ! env_has PASSWORD_HASH; then
    warn "no PASSWORD_HASH yet — run: sudo ./dashboard.sh set-password"
  fi

  # ⚠ Same sentence `set-password` prints, for the same reason: --env-file is read ONCE, at
  # container creation. `configure` is the OTHER subcommand that changes what the container
  # was created with, and it said nothing (11-A4).
  if unit_installed && [[ -n "$(container_ids)" ]]; then
    warn "the container reads $ENV_FILE once, at creation — a change here takes effect on"
    warn "  'sudo ./dashboard.sh restart', never on the next poll"
  fi
}

# ============================================================================================
#  unit (§7)
# ============================================================================================

UNIT_SRC_REL="systemd/ai-dashboard.service"

cmd_unit() {
  preflight 1 0 1
  local src="$SRC/$UNIT_SRC_REL"
  if [[ ! -r "$src" ]]; then refuse "no $src — the rsync must carry systemd/"; return 0; fi

  step "Installing $UNIT_PATH"
  # ⚠ The unit is COPIED from the source tree, never generated here. The `docker run` line
  # is the only copy of the container's flags in this project, and a script that rendered a
  # second one would be free to drift from the file an operator reads and reviews.
  if (( DRY )); then
    info "would install $src -> $UNIT_PATH (0644 root:root), then daemon-reload and enable"
    info "the file that would be installed:"
    sed 's/^/      /' "$src"
  else
    install -m 0644 -o root -g root "$src" "$UNIT_PATH"
    ok "installed $UNIT_PATH"
    systemctl daemon-reload
    # ⚠ The tick used to be UNCONDITIONAL, so a failed enable printed `! systemctl enable
    # reported a problem` AND `✓ enabled ai-dashboard.service` on consecutive lines, with
    # systemd's own reason thrown away by `>/dev/null 2>&1` (11-A12). A tick over a failure
    # is the shape this whole script exists to prevent, and the consequence is PLAN row 12's
    # acceptance criterion: a unit that is running now and will not come back after a reboot.
    # `check` now asks for UnitFileState, which is the detector that did not exist.
    local enable_out enable_rc=0
    enable_out="$(systemctl enable "$UNIT_NAME" 2>&1)" || enable_rc=$?
    if (( enable_rc == 0 )); then
      ok "enabled $UNIT_NAME"
    else
      warn "systemctl enable exited ${enable_rc} — this unit will NOT start after a reboot:"
      printf '%s\n' "$enable_out" | sed 's/^/      /'
    fi
    # ⚠ The file is installed; it is not in force. `systemctl start` on an already-active
    # unit returns 0 and does nothing, so a changed ExecStart — a new mount, a changed
    # --env-file, the GPU probe — is reported `✓ installed`, reported `✓ enabled`, and the
    # container goes on running with the flags it was CREATED with. `check` compares the
    # running container against the image and the GPU mode for exactly this reason.
    if [[ -n "$(container_ids)" ]]; then
      warn "a container is already running: it keeps the flags it was CREATED with until you"
      warn "  run 'sudo ./dashboard.sh restart'. daemon-reload does not restart anything."
    fi
  fi

  # ⚠ TRAP 1, checked rather than trusted. StartLimitIntervalSec/StartLimitBurst are IGNORED
  # in [Service] — systemd moved them to [Unit] in v229 — and the fallback is a 10 s window
  # that RestartSec=10 can never fill, so a broken instance retries for ever. Writing them in
  # the right section is not evidence they took: ask systemd what it ended up with.
  if (( DRY )); then
    info "would verify: systemctl show $UNIT_NAME -p StartLimitIntervalUSec  (expects 5min)"
  else
    check_start_limit || die "the StartLimit* keys did not take — see [Unit] in $UNIT_PATH"
  fi

  # ⚠ TRAP 3. An ordering cycle is broken by SILENTLY DELETING a start job, and it only ever
  # appears on a real boot. Nothing here can create one on this boot; the check is repeated
  # in `check` and again by step 12 after a reboot, which is the only place it can bite.
  if (( DRY )); then
    info "would run: journalctl -b --system | grep 'ordering cycle'  (expects no output)"
  else
    # ⚠ `|| true`: it now returns 2 for "could not look", and an unchecked non-zero under
    # `set -e` would abort `unit` — and, from `install`, would abort the whole run at the
    # step after the unit was enabled. The row is repeated in `check`, which is where a
    # cycle has to be answered for.
    report_ordering_cycles || true
  fi
}

start_limit_value() {
  systemctl show "$UNIT_NAME" -p StartLimitIntervalUSec 2>/dev/null | sed -n 's/^StartLimitIntervalUSec=//p'
}

check_start_limit() {
  local v
  v="$(start_limit_value)"
  case "$v" in
    5min|300s|300000000|300000000us) ok "StartLimitIntervalUSec=${v} — the keys landed in [Unit]" ; return 0 ;;
    "") warn "systemctl show returned nothing for StartLimitIntervalUSec"; return 1 ;;
    *)  warn "StartLimitIntervalUSec=${v}, expected 5min. In [Service] systemd IGNORES these"
        warn "  keys and falls back to a 10 s window RestartSec=10 can never fill"
        return 1 ;;
  esac
}

system_journal_readable() {
  # ⚠ `journalctl -b` gives a user outside `adm`/`systemd-journal` ONLY THEIR OWN journal and
  # still exits 0, so an empty result from it is not evidence of anything. `--system` is the
  # question that has an answer: it fails for a user who cannot read the system journal.
  journalctl -b --system -n 1 --no-pager >/dev/null 2>&1
}

# 0 = looked and found nothing · 1 = found a cycle · 2 = could not look.
#
# ⚠ THE THIRD STATE IS THE POINT (added 2026-09-10, 11-A11). This used to read "no output"
# as "no cycle" and print a ✓, so a non-root `check` on an account outside `adm` certified
# the one trap that CAN ONLY EVER BE OBSERVED ON A REAL BOOT, having read nothing at all —
# and this trap has already deleted start jobs on this machine (2026-08-28). `check` has a
# third state for precisely this, and this row did not use it.
report_ordering_cycles() {
  local hits
  if ! system_journal_readable; then
    warn "cannot read this boot's SYSTEM journal — an ordering cycle cannot be ruled out
     from here. Re-run as root, or add this account to 'adm'"
    return 2
  fi
  # ⚠ Captured first, then matched. `journalctl | grep -q` under `set -o pipefail` would
  # SIGPIPE journalctl on the first match and report the pipeline as FAILED — the branch
  # silently inverts. Plain grep reads to the end, so there is no SIGPIPE at all.
  hits="$(journalctl -b --system --no-pager 2>/dev/null | grep 'ordering cycle' || true)"
  if [[ -n "$hits" ]]; then
    warn "⚠ ORDERING CYCLE in this boot's journal — systemd deletes a start job to break one.
     ⚠ The grep is unqualified, so a cycle between ANY pair of units on this box appears
     here; read the lines before assuming it is the dashboard's:"
    printf '%s\n' "$hits" | sed 's/^/      /'
    return 1
  fi
  ok "no ordering cycle in this boot's journal (system journal, read in full)"
  return 0
}

unit_active_state() {
  systemctl show "$UNIT_NAME" -p ActiveState --value 2>/dev/null || true
}

# ⚠ `enabled` is the whole of PLAN row 12's "survives a reboot", and NOTHING asked for it
# until 2026-09-10: `check_unit` read StartLimitIntervalUSec and ActiveState, both of which
# reflect the unit FILE after a daemon-reload, so a dashboard that is running now and will
# never come back passed every row (11-A12).
unit_file_state() {
  systemctl show "$UNIT_NAME" -p UnitFileState --value 2>/dev/null || true
}

# ============================================================================================
#  firewall (§8) — the one step that has already taken this box off the network
# ============================================================================================

cmd_firewall() {
  preflight 1 0 0 1
  step "ufw rule for ${PORT}/tcp from ${LAN}"
  if ! have ufw; then
    refuse "ufw is not installed; nothing to do, and nothing is protecting ${PORT}"
    return 0
  fi

  # ⚠ The script NEVER runs `ufw enable`. Enabling a firewall on a box with no BMC is an
  # operator's decision, taken from a session that stays open until a fresh one is verified.
  if ! ufw_enforcing; then
    refuse "ufw reads ENABLED=no. This script does not enable firewalls.
     If you enable it yourself, do it from a session you already have open, and check
     the port-22 rule FIRST with:  sudo ufw show added"
    return 0
  fi

  # `show added` is the one command that tells you what is there without changing anything.
  info "ufw show added:"
  ufw show added 2>/dev/null | sed 's/^/      /'

  local existing
  existing="$(ufw_rule_for_port "$PORT")"
  if [[ -n "$existing" ]]; then
    ok "a rule already covers ${PORT}; not adding a duplicate:"
    printf '%s\n' "$existing" | sed 's/^/      /'
  else
    run ufw allow from "$LAN" to any port "$PORT" proto tcp
  fi

  if (( DRY )); then
    info "would run: ufw status numbered"
  else
    ufw status numbered | sed 's/^/      /'
  fi
  info "⚠ The dashboard cannot tell you afterwards whether ${PORT} is allowed: ufw.conf is"
  info "  world-readable and user.rules is root-only, so §3.6's SAFETY row answers 'is the"
  info "  firewall on' and never 'is this port reachable'. A page that loads is that evidence."
}

# ============================================================================================
#  start / restart / status / logs
# ============================================================================================

wait_for_answer() {
  local i code=""
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    code="$(curl -sS -o /dev/null -m 3 -w '%{http_code}' "http://127.0.0.1:${PORT}/login" 2>/dev/null || true)"
    [[ "$code" == "200" ]] && { ok "http://127.0.0.1:${PORT}/login answered 200 after ${i}s"; return 0; }
    sleep 1
  done
  warn "nothing answered on ${PORT} after 30 s (last HTTP code: ${code:-none})"
  warn "  read the journal: ./dashboard.sh logs"
  return 1
}

cmd_start() {
  need_root
  step "Starting $UNIT_NAME"
  run systemctl start "$UNIT_NAME"
  if (( DRY )); then
    info "would poll http://127.0.0.1:${PORT}/login for up to 30 s"
    return 0
  fi
  wait_for_answer || die "the unit started but nothing answered — see 'logs'"
}

cmd_restart() {
  need_root
  step "Restarting $UNIT_NAME"
  local before after
  before="$(container_ids | tr -d ' \n')"
  run systemctl restart "$UNIT_NAME"
  if (( DRY )); then
    info "would poll http://127.0.0.1:${PORT}/login, then assert the container id CHANGED,"
    info "  then run check"
    return 0
  fi
  wait_for_answer || die "restart did not come back — see 'logs'"
  after="$(container_ids | tr -d ' \n')"
  # ⚠ A restart that reports success and changes nothing is this repo's most-repeated
  # failure mode, and the dashboard has already produced one: the standalone server renames
  # its own process to `next-server (v16.3.4)`, so `pkill -f "node server.js"` silently
  # missed it and the old process kept serving (FIRST-DEPLOY §5.1). Ask what is running.
  if [[ -n "$before" && "$before" == "$after" ]]; then
    die "the container id did not change (${before}) — nothing actually restarted"
  fi
  ok "container id ${before:-none} -> ${after:-none}"
  cmd_check
}

cmd_status() {
  bold "ai-dashboard"
  local state sub tags mode owner
  if unit_installed; then
    state="$(systemctl show "$UNIT_NAME" -p ActiveState --value 2>/dev/null || true)"
    sub="$(systemctl show "$UNIT_NAME" -p SubState --value 2>/dev/null || true)"
    info "unit:      ${state:-unknown} (${sub:-unknown})  ·  StartLimitIntervalUSec=$(start_limit_value || true)"
  else
    warn "unit:      not installed"
  fi

  if have docker; then
    local line
    line="$(docker ps -a --filter "name=^${CONTAINER}$" --format '{{.Status}}  {{.Image}}  {{.ID}}' 2>/dev/null || true)"
    info "container: ${line:-none}"
    # ⚠ `{{.Image}}` above is the REFERENCE — `ai-dashboard:latest` — and says nothing about
    # WHICH image that name points at now. The id is the only thing that can be compared
    # with what `build` produced, and `check` compares it.
    if [[ -n "$(container_ids)" ]]; then
      info "image id:  $(docker inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null | cut -c1-19 || true) running · $(docker image inspect "${IMAGE}:latest" --format '{{.Id}}' 2>/dev/null | cut -c1-19 || true) is :latest"
      info "gpu mode:  $(container_gpu_mode) (from .HostConfig.DeviceRequests, never from the unit text)"
    fi
    tags="$(docker image ls "$IMAGE" --format '{{.Tag}} ({{.Size}}, {{.CreatedSince}})' 2>/dev/null | tr '\n' ' ' || true)"
    info "images:    ${tags:-none}"
  else
    warn "container: docker is not installed"
  fi

  if have ss; then
    info "port:      $(ss -H -ltn "sport = :${PORT}" 2>/dev/null | head -1 || true)"
  fi

  if [[ -e "$ENV_FILE" ]]; then
    mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"
    owner="$(stat -c '%U:%G' "$ENV_FILE" 2>/dev/null || true)"
    info "env file:  $ENV_FILE  ${owner} ${mode}"
    if [[ -r "$ENV_FILE" ]]; then
      # ⚠ Key names only. A PASSWORD_HASH is offline-attackable and a SESSION_SECRET forges
      # every session; neither belongs in a scrollback or in whatever gets pasted onward.
      info "keys:      $(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$ENV_FILE" | tr '\n' ' ')"
      info "STANDING:  $(env_get STANDING || true)"
    else
      info "keys:      (root only)"
    fi
  else
    warn "env file:  $ENV_FILE does not exist"
  fi

  info "url:       http://$(hostname -I 2>/dev/null | awk '{ print $1 }'):${PORT}/"
  browser_note
}

# §6.1's promise — no scrollbar and nothing clipped at 1280×1024 and 1600×1024 — is bounded
# against telemetry but NOT against the browser. Ruled an operating requirement 2026-09-10.
browser_note() {
  info "⚠ The wall panel's browser must run at DEFAULT font size and 100 % zoom. A"
  info "  minimum-font-size of 16 px alone puts the page 2-3 px over at 1600×1024 and hides"
  info "  27 px of the SAFETY panel at 1280. See README.md, 'Configuring the wall panel'."
}

cmd_logs() {
  local follow=""
  [[ "$ARG" == "-f" || "$ARG" == "--follow" ]] && follow="-f"
  if [[ -n "$follow" ]]; then
    run journalctl -u "$UNIT_NAME" -f
  else
    run journalctl -u "$UNIT_NAME" --no-pager -n 200
  fi
}

# ============================================================================================
#  check (§9) — the silent-failure detector
# ============================================================================================
#
# ⚠ This is the most valuable subcommand in the script, because §5 logs NOTHING about
# authentication. An unparseable hash, a quoted secret, a second container and a mistyped
# STANDING entry each produce a dashboard that misbehaves with no diagnostic ANYWHERE.
# Every row below detects something that can be noticed nowhere else.
#
# The standing rule from this repo applies to all of them: writing the config is not
# evidence it took. Ask the system what it actually ended up with.

CHECK_FAIL=0
CHECK_UNKNOWN=0

row_ok()      { ok "$*"; }
row_fail()    { CHECK_FAIL=$(( CHECK_FAIL + 1 ));       printf '  \033[31m✗\033[0m %s\n' "$*"; }
row_unknown() { CHECK_UNKNOWN=$(( CHECK_UNKNOWN + 1 )); printf '  \033[33m?\033[0m %s\n' "$*"; }

# mode and owner of the env file, as one line. A function so a test can put a root:root 0600
# file in front of the row on a machine where it cannot create one.
env_file_stat() {
  printf '%s %s' "$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)" \
                 "$(stat -c '%U:%G' "$ENV_FILE" 2>/dev/null || true)"
}

check_env_file() {
  step "The env file (§6)"
  if [[ ! -e "$ENV_FILE" ]]; then
    row_fail "$ENV_FILE does not exist — the container has no credentials at all"
    return
  fi
  local mode owner st
  st="$(env_file_stat)"
  mode="${st%% *}"; owner="${st#* }"
  if [[ "$mode" == "600" && "$owner" == "root:root" ]]; then
    row_ok "$ENV_FILE is root:root 0600"
  else
    row_fail "$ENV_FILE is ${owner:-?} ${mode:-?}, expected root:root 600 — it carries a password hash"
  fi
  if ! env_readable; then
    row_unknown "cannot read $ENV_FILE — re-run with sudo to check its contents"
    return 1
  fi

  # ⚠ Docker's --env-file grammar, applied to every line. The one that surprises people:
  # a bare `PASSWORD_HASH` with NO `=` is not a syntax error to Docker — it means "pass the
  # HOST's value of that variable through", which is almost always empty, and the container
  # then denies every login with nothing logged.
  local line key value why bad=0 lineno=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$(( lineno + 1 ))
    case "$line" in ''|'#'*) continue ;; esac
    if [[ "$line" != *=* ]]; then
      # ⚠ THE LINE NUMBER AND ITS LENGTH — never the line. This printed
      # `${line%%[!A-Za-z0-9_]*}…`, the prefix up to the first character outside
      # [A-Za-z0-9_], and a SESSION_SECRET is 64 characters of [0-9a-f] by `configure`'s own
      # deliberate choice: the expansion removed NOTHING and the whole secret went to the
      # terminal, followed by an ellipsis telling the reader it had been truncated (11-A6).
      # The reachable input is this row's own subject — a hand-edited file, where an editor's
      # hard wrap leaves the tail of a long `SESSION_SECRET=…` line as a bare hex line. A
      # line number is what finds it anyway; the value never helped.
      row_fail "line ${lineno} has no '=' (${#line} characters, not printed): Docker reads that as 'take this from the host environment'"
      bad=1; continue
    fi
    key="${line%%=*}"; value="${line#*=}"
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      row_fail "'${key}' is not a usable environment-variable name"
      bad=1; continue
    fi
    if ! why="$(env_value_error "$value")"; then
      row_fail "${key} ${why}"
      bad=1
    fi
  done < "$ENV_FILE"
  (( bad )) || row_ok "every line is a single-line, unquoted KEY=VALUE"
  return 0
}

# ⚠ The one line that separates "absent" from "unreadable", spelled once for the three rows
# that were all getting it wrong. Returns 1 when the row must not judge.
env_unreadable_row() {
  env_readable && return 1
  row_unknown "$1 cannot be read: $ENV_FILE needs root. ⚠ This is NOT 'it is absent' — a
     correct deployment is root:root 0600 and this row said 'absent' on it, with exit 1,
     three rows at a time. Re-run with sudo"
  return 0
}

check_password_hash() {
  step "O20 — the password hash"
  local h why
  env_unreadable_row "PASSWORD_HASH" && return
  if ! env_has PASSWORD_HASH; then
    row_fail "PASSWORD_HASH is absent — every login is denied, silently"
    return
  fi
  h="$(env_get PASSWORD_HASH || true)"
  if why="$(scrypt_hash_error "$h")"; then
    row_ok "PASSWORD_HASH parses as scrypt.<log2N>.<r>.<p>.<salt>.<key> (${h%%.*}, ${#h} chars)"
    info "⚠ check is handed a HASH. It confirms the encoding and can NEVER confirm that the"
    info "  password behind it met §5.1's policy — that is enforced once, at set-password"
  else
    row_fail "PASSWORD_HASH ${why}."
    row_fail "  parseScryptHash returns null for it, and null is a clean empty 401 on every"
    row_fail "  attempt with NOTHING logged: a dashboard that will not open and will not say why."
    row_fail "  Fix: sudo ./dashboard.sh set-password"
  fi
}

check_session_secret() {
  step "O21 — the session secret"
  local v why
  env_unreadable_row "SESSION_SECRET" && return
  if ! env_has SESSION_SECRET; then
    row_fail "SESSION_SECRET is absent — readAuthConfig returns null and every session is refused"
    return
  fi
  v="$(env_get SESSION_SECRET || true)"
  if ! why="$(env_value_error "$v")"; then
    row_fail "SESSION_SECRET ${why}."
    # ⚠ The quote explanation only where quotes are the problem. It used to print after a
    # trailing space or a backtick too, which sends the reader looking for a quote that is
    # not there — and 11-A6 showed this row's message construction is where a leak got in.
    case "$why" in
      *quote*)
        row_fail "  ⚠ --env-file does not strip quotes: a quoted 32-character secret PASSES the"
        row_fail "  length floor as a DIFFERENT secret, works today, and kills every open session"
        row_fail "  the moment anyone rewrites the file unquoted." ;;
      *)
        row_fail "  ⚠ --env-file takes the rest of the line VERBATIM and expands nothing, so"
        row_fail "  what readAuthConfig receives is not what the file looks like it says." ;;
    esac
    return
  fi
  if (( ${#v} < MIN_SECRET_CHARS )); then
    row_fail "SESSION_SECRET is ${#v} characters, below the ${MIN_SECRET_CHARS}-character floor — every session is refused"
    return
  fi
  row_ok "SESSION_SECRET is ${#v} characters, unquoted, single-line, no '\$'"
}

check_standing() {
  step "D8 — STANDING (§6.4)"
  local raw entry why bad=0 n=0
  env_unreadable_row "STANDING" && return
  if ! env_has STANDING; then
    row_fail "STANDING is absent. §6.4's suppression then never applies and nothing says so"
    return
  fi
  raw="$(env_get STANDING || true)"
  if [[ -z "$(trim "$raw")" ]]; then
    row_ok "STANDING is empty — nothing is standing, every alarm at full volume (the safe default)"
    return
  fi
  load_condition_rules
  # ⚠ Split by reading lines, not by `for entry in $raw` with IFS=',': an unquoted expansion
  # is subject to PATHNAME expansion as well as word splitting, so a STANDING entry
  # containing `*` would be silently replaced by whatever files happen to be in the working
  # directory — and the check would then pass or fail on the contents of a directory.
  while IFS= read -r entry; do
    [[ -n "$(trim "$entry")" ]] || continue
    n=$(( n + 1 ))
    if ! why="$(standing_entry_error "$entry")"; then
      row_fail "STANDING ${why}"
      bad=1
    fi
  done <<<"$(printf '%s' "$raw" | tr ',' '\n')"
  if (( bad == 0 )); then
    row_ok "all ${n} STANDING entries match a §6.4 condition kind or id"
  else
    row_fail "  a STANDING entry that matches nothing suppresses NOTHING: the banner stays"
    row_fail "  nailed open by a condition the operator already accepted, with no error anywhere"
  fi
  info "⚠ --env-file is read ONCE, at container creation. A STANDING change needs"
  info "  'sudo ./dashboard.sh restart', never a poll (§4, corrected 2026-09-07)"
}

# The names of OTHER containers running this app, read from `docker ps --format
# '{{.Names}} {{.Image}}'` on stdin. Pure, so `packaging.test.ts` can put a second instance
# in front of it on a machine with no Docker at all.
#
# ⚠ Matched on the REPOSITORY, at every tag. `--filter ancestor=ai-dashboard:latest`
# resolves that reference to ONE image id, so a container started from an older tag —
# `ai-dashboard:notag-20260901`, the image an operator runs to compare two builds — is a
# second instance the ancestor filter cannot see. It carries its own PORT, so the listener
# count on 8090 cannot see it either, and it has the same three process-global objects:
# a second telemetry cache, a second revocation set, a second rate limiter.
#
# ⚠ Still invisible, and named here rather than implied: an instance built from a DIFFERENT
# repository name, and anything not run under Docker at all. Both are outside what `docker
# ps` can be asked about by name; step 12 owns the box-side verification.
other_app_containers() {
  local nm img
  while read -r nm img; do
    if [[ -z "$nm" || "$nm" == "$CONTAINER" ]]; then continue; fi
    case "$img" in
      "$IMAGE"|"$IMAGE":*) printf '%s\n' "$nm" ;;
    esac
  done
}

check_one_process() {
  step "O22 — one process, one cache"
  if ! have docker; then row_unknown "docker is not installed"; return; fi
  if ! docker_ok; then row_unknown "cannot talk to the docker daemon (root, or the docker group)"; return; fi

  local named others by_id procs
  named="$(docker ps --filter "name=^${CONTAINER}$" --format '{{.ID}}' 2>/dev/null | wc -l | tr -d ' ')"
  # Two different questions, and neither answers the other:
  #   · by REPOSITORY — every tag, which is what `other_app_containers` reads;
  #   · by ancestor — the image id `${IMAGE}:latest` resolves to today, which also catches a
  #     container started from a bare id or from an image built FROM ours.
  by_id="$(docker ps --filter "ancestor=${IMAGE}:latest" --format '{{.Names}}' 2>/dev/null \
            | grep -v "^${CONTAINER}$" || true)"
  others="$({ docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null || true; } | other_app_containers)"
  others="$(printf '%s\n%s\n' "$others" "$by_id" | sed '/^$/d' | sort -u | tr '\n' ' ')"
  others="$(trim "$others")"
  if [[ "$named" == "1" ]]; then
    row_ok "exactly one container named ${CONTAINER} is running"
  else
    row_fail "${named} containers named ${CONTAINER} are running (expected 1)"
  fi
  if [[ -n "$others" ]]; then
    row_fail "other containers are running a ${IMAGE} image: ${others}"
    row_fail "  a second instance means a second telemetry cache, a doubled nvidia-smi fork"
    row_fail "  rate, DELETE /api/session silently failing for requests that land on the other"
    row_fail "  one, and §5's GLOBAL rate limit becoming N× looser. Nothing in the suite sees it"
  fi
  if [[ "$named" == "1" ]]; then
    procs="$(docker top "$CONTAINER" -o pid,args 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')"
    if [[ "$procs" == "1" ]]; then
      row_ok "one process inside it (docker top)"
    else
      row_fail "${procs} processes inside ${CONTAINER} (expected 1) — see 'docker top ${CONTAINER}'"
    fi
  fi
  if have ss; then
    local listeners
    listeners="$(ss -H -ltn "sport = :${PORT}" 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$listeners" == "1" ]]; then
      row_ok "exactly one listener on ${PORT}"
    else
      row_fail "${listeners} listeners on ${PORT} (expected 1)"
    fi
  fi
}

# ⚠ The SAME question the unit's ExecStartPre probe asks, spelled once here and once there,
# and it is deliberately NOT `docker run --gpus all <our image> true`: that would be a SECOND
# CONTAINER OF THIS REPOSITORY, which `other_app_containers` matches by repository and
# `--filter ancestor=` matches by image id, so a `check` racing a start would report a false
# O22 failure (11-A14). `nvidia-container-cli info` asks the toolkit AND the driver — the two
# things that are coupled and that break together — without starting anything.
gpu_runtime_available() {
  have nvidia-container-cli && nvidia-container-cli info >/dev/null 2>&1
}

# gpu · fallback · unknown — read from THE CONTAINER, and from nothing else.
#
# ⚠ Not from the unit text: it says `$GPU_FLAGS` and cannot tell you what the probe decided.
# ⚠ Not from the telemetry: `gpus: null` is what a broken toolkit AND A BOX WITH NO COMPUTE
# CARD both produce, and "there is no compute GPU" is this box's documented steady state, so
# that inference is guaranteed wrong here at least once.
container_gpu_mode() {
  local dr
  dr="$(docker inspect "$CONTAINER" --format '{{json .HostConfig.DeviceRequests}}' 2>/dev/null)" \
    || { printf 'unknown'; return 0; }
  case "$dr" in
    *nvidia*)       printf 'gpu' ;;
    ""|null|"[]")   printf 'fallback' ;;
    *)              printf 'unknown' ;;
  esac
}

check_container() {
  step "The running container (§7) — what it runs, and whether it got the GPU"
  if ! have docker; then row_unknown "docker is not installed"; return; fi
  if ! docker_ok; then row_unknown "cannot talk to the docker daemon (root, or the docker group)"; return; fi
  if [[ -z "$(container_ids)" ]]; then
    row_fail "no container named ${CONTAINER} is running, so neither of the rows below can
     be taken. 'systemctl status ${UNIT_NAME}' and './dashboard.sh logs' say why"
    return
  fi

  # ⚠ THE ROW FOR "IT SHIPPED THE PREVIOUS IMAGE". `build` can skip a rebuild, `unit` can
  # install a changed file, and `systemctl start` on an already-active unit returns 0 and
  # does nothing — so the container can be running code that is not what is on disk, while
  # `restart`'s id proof CONFIRMS a restart happened (the container id did change) and every
  # other row passes. Nothing anywhere compared the running image with :latest until
  # 2026-09-10 (11-A3, 11-A4), and `status` cannot show it either: `docker ps
  # --format {{.Image}}` prints the REFERENCE, `ai-dashboard:latest`, not the id behind it.
  local running latest mode
  running="$(docker inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"
  latest="$(docker image inspect "${IMAGE}:latest" --format '{{.Id}}' 2>/dev/null || true)"
  if [[ -z "$running" || -z "$latest" ]]; then
    row_unknown "could not read both the running image id and ${IMAGE}:latest's"
  elif [[ "$running" == "$latest" ]]; then
    row_ok "the running container IS ${IMAGE}:latest (${running:0:19})"
  else
    row_fail "the running container is ${running:0:19} and ${IMAGE}:latest is now
     ${latest:0:19} — it is serving an OLDER image than the one this tree builds. A build
     that skipped, or a unit change never restarted. Fix: sudo ./dashboard.sh restart"
  fi

  # ⚠ THREE STATES, NOT TWO (INSTALL-SPEC §11.1, and 11-A14's list). The container is created
  # once and lives until something restarts it, so a fallback taken during a driver upgrade
  # SURVIVES THE FIX INDEFINITELY — and that third state is the only actionable one.
  mode="$(container_gpu_mode)"
  if gpu_runtime_available; then
    case "$mode" in
      gpu)      row_ok "GPU mode: the container holds an nvidia device request, and the
     toolkit answers. --gpus all took" ;;
      fallback) row_fail "GPU mode: FALLBACK is in force — the container was started WITHOUT
     --gpus all — but nvidia-container-cli answers NOW. The GPU panels are reading '—' for a
     toolkit that is no longer broken, and nothing will change that on its own: the container
     keeps what it was created with. Fix: sudo ./dashboard.sh restart" ;;
      *)        row_unknown "GPU mode: could not read .HostConfig.DeviceRequests" ;;
    esac
  else
    case "$mode" in
      gpu)      row_ok "GPU mode: the container holds an nvidia device request, but
     nvidia-container-cli does NOT answer now. This container keeps working; the NEXT restart
     falls back. Fix the toolkit before restarting (see the versions below)" ;;
      fallback) row_ok "GPU mode: FALLBACK, and the probe agrees — nvidia-container-cli does
     not answer, so 'docker run --gpus all' would fail and take the whole dashboard with it.
     The eight non-GPU panels are unaffected and the GPU panels read '—' (§3.1, invariant 5)" ;;
      *)        row_unknown "GPU mode: could not read .HostConfig.DeviceRequests" ;;
    esac
  fi
}

check_hasher() {
  step "The password producer (§5)"
  local f="$SRC/scripts/hash-password.py"
  if [[ -r "$f" ]]; then
    if [[ -x "$f" ]]; then
      row_ok "$f is present and executable"
    else
      row_ok "$f is present (not executable; it is run as 'python3 <path>')"
    fi
  else
    row_fail "$f is missing — set-password has no producer, and that is only discovered by someone who needs it"
  fi
  if have python3; then
    row_ok "$(python3 --version 2>&1)"
  else
    row_fail "python3 is absent — nothing on this box can produce a PASSWORD_HASH"
  fi
}

check_unit() {
  step "The unit (§7)"
  if ! unit_installed; then row_fail "$UNIT_PATH is not installed"; return; fi
  local v state enabled rc
  v="$(start_limit_value)"
  case "$v" in
    5min|300s|300000000|300000000us) row_ok "StartLimitIntervalUSec=${v} — the keys landed in [Unit]" ;;
    "") row_unknown "systemctl show returned nothing for StartLimitIntervalUSec" ;;
    *)  row_fail "StartLimitIntervalUSec=${v}, expected 5min. systemd IGNORES StartLimit* in
     [Service] and falls back to a 10 s window that RestartSec=10 can never fill, so a
     broken instance retries for ever with nothing saying so" ;;
  esac
  state="$(unit_active_state)"
  if [[ "$state" == "active" ]]; then row_ok "the unit is active"
  else row_fail "the unit is ${state:-unknown}"; fi

  # ⚠ PLAN row 12's whole acceptance criterion is "survives a reboot", and until 2026-09-10
  # nothing anywhere in this script asked whether the unit was ENABLED. `cmd_unit`'s tick was
  # unconditional, so a failed `systemctl enable` produced a warning and a ✓ on consecutive
  # lines, and a dashboard that is up now and gone after the next boot passed every row.
  enabled="$(unit_file_state)"
  case "$enabled" in
    enabled|enabled-runtime) row_ok "UnitFileState=${enabled} — it comes back after a reboot" ;;
    "") row_unknown "systemctl show returned nothing for UnitFileState" ;;
    *)  row_fail "UnitFileState=${enabled} — this unit does NOT start after a reboot, and
     nothing else on this box will say so. Fix: sudo ./dashboard.sh unit" ;;
  esac

  set +e
  report_ordering_cycles; rc=$?
  set -e
  case "$rc" in
    0) : ;;
    1) row_fail "an ordering cycle deleted a start job on this boot" ;;
    # ⚠ "Could not look" is its own row. See report_ordering_cycles: an empty `journalctl -b`
    # from an account outside `adm` used to read as "no cycle" and print a ✓.
    *) row_unknown "this boot's system journal could not be read, so an ordering cycle — the
     one trap that appears ONLY on a real boot — was not ruled out. Re-run with sudo" ;;
  esac
}

check_firewall() {
  step "ufw"
  if ! have ufw; then row_fail "ufw is not installed"; return; fi
  if ! ufw_enforcing; then
    row_fail "ufw reads ENABLED=no. ⚠ Do NOT just enable it: check the port-22 rule first
     with 'sudo ufw show added', from a session you keep open"
    return
  fi
  row_ok "ufw is enforcing (asked ufw, not systemd)"
  local r22 r8090 rc
  set +e
  r22="$(ufw_rule_for_port 22)";     rc=$?
  set -e
  if (( rc == 2 )); then row_unknown "the ufw rules need root to read"; return; fi
  r8090="$(ufw_rule_for_port "$PORT")"
  if [[ -n "$r22" ]]; then row_ok "a rule covers 22"
  else row_fail "NO rule covers port 22"; fi
  if [[ -n "$r8090" ]]; then
    row_ok "a rule covers ${PORT}"
  else
    row_fail "no rule covers ${PORT} — the container will start, bind, log nothing and
     answer nobody, which looks exactly like a broken build"
  fi
}

check_gate() {
  step "The gate (§5) — a route that answers 200 without a cookie is the whole failure"
  if ! have curl; then row_unknown "curl is not installed"; return; fi
  local code
  code="$(curl -sS -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${PORT}/api/telemetry" 2>/dev/null || true)"
  case "$code" in
    401) row_ok "GET /api/telemetry without a cookie is 401 — proxy.ts runs" ;;
    ""|000)  row_fail "nothing answered on ${PORT} (curl reports ${code:-no code})" ;;
    *)   row_fail "GET /api/telemetry without a cookie is ${code}, expected 401. ⚠ Next 16
     renamed middleware.ts to proxy.ts; a file left at the old name is not an error, it
     simply never runs, and every route is then open with nothing in any log" ;;
  esac
}

check_neighbours() {
  # ⚠ Reported, never touched. The dashboard must never be a dependency of anything that
  # serves or cools (§2.3); gpu-fan-control.sh and dell-smm-5fan.sh own these.
  step "The box's other services — reported, never touched"
  report_toolkit_and_driver
  info "⚠ toolkit and driver are COUPLED: a driver upgrade that breaks the toolkit takes the"
  info "  GPU panels. It no longer takes the dashboard with them — the unit's probe falls"
  info "  back to starting without --gpus all (INSTALL-SPEC §11.1) — but the fallback lasts"
  info "  until someone restarts, which is what the GPU-mode row above is for"
  info "gpu-fan-control: $(systemctl is-active gpu-fan-control 2>/dev/null || true)"
  info "llama-server@0:  $(systemctl is-active llama-server@0 2>/dev/null || true)"
  info "llama-server@1:  $(systemctl is-active llama-server@1 2>/dev/null || true)"
}

cmd_check() {
  CHECK_FAIL=0
  CHECK_UNKNOWN=0
  bold "Checking the ai-dashboard deployment"
  # check reads and never writes, so --dry-run has nothing to withhold. Said out loud
  # because "it ran anyway" is otherwise indistinguishable from a --dry-run that leaked.
  (( DRY )) && info "--dry-run: check is read-only, so it runs for real and changes nothing"
  check_env_file || true
  check_password_hash
  check_session_secret
  check_standing
  check_hasher
  check_unit
  check_one_process
  check_container
  check_firewall
  check_gate
  check_neighbours

  echo
  if (( CHECK_FAIL > 0 )); then
    printf '  \033[31m✗ %d row(s) FAILED\033[0m — each one is something with no diagnostic anywhere else\n' "$CHECK_FAIL"
    return 1
  fi
  if (( CHECK_UNKNOWN > 0 )); then
    printf '  \033[33m? %d row(s) could not be evaluated\033[0m — re-run with sudo before believing this.\n' "$CHECK_UNKNOWN"
    printf '    A row nobody could evaluate is not a row that passed.\n'
    return 2
  fi
  ok "every row passes"
  browser_note
  return 0
}

# ============================================================================================
#  install (§0) and uninstall (§10)
# ============================================================================================
#
# ⚠ The ORDER below is a convenience, not a constraint, and that is a change worth knowing.
# It was a constraint while the hasher lived in the image — the box has no Node, so
# set-password could not run until build had produced something to run it in.
# scripts/hash-password.py removed that (O23 is closed): set-password now works on a box
# with nothing installed but python3. deps-then-build-then-credential is kept because it
# reads correctly and fails early.
#
# ⚠ Idempotent throughout. Re-running install on a working deployment is a no-op plus a
# check: an existing PASSWORD_HASH is KEPT and not re-prompted, an existing SESSION_SECRET
# is NEVER overwritten (rotating it logs out every open session), an existing ufw rule is
# not duplicated, and an unchanged image is not rebuilt without --force.

cmd_install() {
  # The union of every step's requirements, taken once. Each cmd_* below then finds
  # PREFLIGHT_DONE set and does not repeat it. ⚠ The 4th argument says this run REACHES
  # the firewall step, so a non-enforcing ufw is refused at step 0 rather than at step 6.
  preflight 1 1 1 1
  bold "Installing the ai-dashboard deployment"
  (( DRY )) && warn "--dry-run: nothing below is executed. This is the review surface."

  cmd_deps
  cmd_build

  step "The password"
  if env_has PASSWORD_HASH && [[ -n "$(env_get PASSWORD_HASH || true)" ]]; then
    ok "PASSWORD_HASH already present — keeping it, not re-prompting"
  else
    cmd_set_password
  fi

  cmd_configure
  cmd_unit
  cmd_firewall
  cmd_start

  # ⚠ install FAILS on a failed check, and that is the owner's answered question (§12.2).
  # Every row of check detects something that produces no diagnostic anywhere else, so a
  # warning printed at the end of a long run is a warning nobody reads. The consequence to
  # accept: a box with a pre-existing STANDING typo, or a second container someone started
  # by hand, cannot be installed onto until that is fixed — which is the point. The unit is
  # left installed and running, so 'status' and 'logs' still work.
  if (( DRY )); then
    step "check"
    info "check is read-only, so a real run would execute it here for real and FAIL the"
    info "install if any row failed"
    return 0
  fi
  local rc=0
  cmd_check || rc=$?
  if (( rc != 0 )); then
    die "install completed but 'check' did not pass (exit ${rc}). The unit is installed and
     running; read the failing rows above. Nothing else will tell you about them."
  fi
  ok "installed"
}

cmd_uninstall() {
  need_root
  bold "Removing the ai-dashboard deployment"

  if unit_installed; then
    run systemctl stop "$UNIT_NAME"
    run systemctl disable "$UNIT_NAME"
    run rm -f "$UNIT_PATH"
    run systemctl daemon-reload
  else
    info "no $UNIT_PATH to remove"
  fi

  if have docker; then
    run docker rm -f "$CONTAINER"
    # ⚠ `docker rm -f $CONTAINER` removes ONE name. The very container `check_one_process`
    # was widened to notice — one from an older tag, under another name — is left running
    # after "uninstall", still serving the dashboard on its own port with the credentials it
    # was created with, and now with no unit and no rule that could ever remove it (11-A10).
    # Reported rather than removed: killing a container this script did not create is not a
    # decision it should take silently, and naming it is what the operator cannot do without
    # this line.
    local strays
    strays="$({ docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null || true; } | other_app_containers | tr '\n' ' ')"
    strays="$(trim "$strays")"
    if [[ -n "$strays" ]]; then
      warn "⚠ still running, from a ${IMAGE} image under another name: ${strays}"
      warn "  Each is a second telemetry cache, a second revocation set and a second rate"
      warn "  limiter, with no unit and no ufw rule left to remove it. Remove by hand:"
      warn "    sudo docker rm -f ${strays}"
    fi
  fi

  # ⚠ This deletes a rule by MATCHING ITS TEXT, CIDR included, and --lan-cidr is not
  # persisted anywhere: an install done with `--lan-cidr 10.0.0.0/8` and an uninstall done
  # without it leave 8090 allowed. ufw's own answer to a rule that is not there is
  # `Could not delete non-existent rule` — and under `set -e` a non-zero exit would ABORT the
  # uninstall before the env-file and image steps. Both branches are now read, and the rule
  # is re-read afterwards rather than assumed gone (11-A10).
  if have ufw && ufw_enforcing; then
    local rc=0
    run ufw delete allow from "$LAN" to any port "$PORT" proto tcp || rc=$?
    (( rc == 0 )) || warn "ufw delete exited ${rc} — most likely there was no such rule for
     ${LAN}. If this install was made with a different --lan-cidr, its rule is still there"
    if (( ! DRY )) && [[ -n "$(ufw_rule_for_port "$PORT" || true)" ]]; then
      warn "⚠ a rule STILL covers ${PORT} after the delete — read it and remove it by hand:"
      ufw_rule_for_port "$PORT" | sed 's/^/      /'
      warn "    sudo ufw status numbered   then   sudo ufw delete <N>"
    fi
  else
    info "ufw is not enforcing; no rule removed"
  fi

  # ⚠ The env file STAYS, the same choice serve-llm.sh uninstall makes about the API key.
  # Deleting a password hash and a session secret because someone was reinstalling is not a
  # decision a script should take.
  if (( PURGE )); then
    step "--purge"
    # ⚠ THE BACKUPS ARE PART OF THE SECRET. Every env_set has written a timestamped 0600 copy
    # of this file into /root — two per `configure`, one per `set-password`, one per password
    # change, for the life of the box — and nothing prunes them. `--purge` told the operator
    # it was deleting "the password hash and the session secret" while every one of them
    # stayed on disk, in a directory nobody thinks of as holding credentials (11-A10). The
    # hash is offline-attackable and the secret forges every session.
    local backups=()
    while IFS= read -r b; do [[ -n "$b" ]] && backups+=("$b"); done < <(
      ls -1 "${BACKUP_DIR}"/ai-dashboard.env.bak.* 2>/dev/null || true)
    info "this deletes $ENV_FILE, which carries the password hash and the session secret."
    info "Every open session dies and the password has to be set again."
    info "⚠ …and the ${#backups[@]} timestamped copy(ies) of it in ${BACKUP_DIR}, which carry the"
    info "  same hash and the same secret:"
    if (( ${#backups[@]} )); then printf '      %s\n' "${backups[@]}"; fi
    if (( DRY )); then
      info "would require you to type DELETE, then remove $ENV_FILE and those ${#backups[@]} copies"
    else
      local answer=""
      printf '  type DELETE to confirm: '
      IFS= read -r answer
      if [[ "$answer" == "DELETE" ]]; then
        rm -f "$ENV_FILE"; ok "removed $ENV_FILE"
        if (( ${#backups[@]} )); then
          rm -f "${backups[@]}"; ok "removed ${#backups[@]} backup copy(ies) from ${BACKUP_DIR}"
        fi
      else
        info "not confirmed; $ENV_FILE kept"
      fi
    fi
  else
    info "kept $ENV_FILE (--purge removes it, after a typed confirmation)"
  fi

  if (( PURGE_IMAGE )) && have docker; then
    local ids
    ids="$(docker image ls "$IMAGE" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | tr '\n' ' ' || true)"
    if [[ -n "$ids" ]]; then
      # shellcheck disable=SC2086  # deliberate word splitting: one tag per argument
      run docker image rm $ids
    else
      info "no ${IMAGE} images to remove"
    fi
  else
    info "kept the ${IMAGE} images (--purge-image removes them)"
  fi

  # ⚠ Docker, the toolkit and the apt source all stay. Uninstalling a container runtime
  # from under whatever else may have started using it is not this script's call.
  info "Docker, the NVIDIA toolkit and $NVIDIA_SOURCES are untouched, deliberately"
}

# ============================================================================================
#  Arguments and dispatch
# ============================================================================================

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)    DRY=1; shift ;;
      --force)      FORCE=1; shift ;;
      --purge)      PURGE=1; shift ;;
      --purge-image) PURGE_IMAGE=1; shift ;;
      --tag)        TAG="${2:?--tag needs a value}"; shift 2 ;;
      --lan-cidr)   LAN="${2:?--lan-cidr needs a value}"; shift 2 ;;
      -h|--help)    usage 0 ;;
      -f|--follow)  ARG="-f"; shift ;;
      -*)           die "unknown option: $1  (try --help)" ;;
      *)            if [[ -z "$CMD" ]]; then CMD="$1"; else ARG="$1"; fi; shift ;;
    esac
  done

  [[ -n "$CMD" ]] || usage 1

  case "$CMD" in
    deps)         cmd_deps ;;
    build)        cmd_build ;;
    set-password) cmd_set_password ;;
    configure)    cmd_configure ;;
    unit)         cmd_unit ;;
    firewall)     cmd_firewall ;;
    start)        cmd_start ;;
    install)      cmd_install ;;
    check)        cmd_check ;;
    status)       cmd_status ;;
    logs)         cmd_logs ;;
    restart)      cmd_restart ;;
    uninstall)    cmd_uninstall ;;
    *)            die "unknown command: $CMD  (try --help)" ;;
  esac

  # ⚠ A dry run that printed "WOULD REFUSE" and exited 0 is a green tick over a failure —
  # the exact shape of `systemctl is-active ufw` reading green on a disabled firewall.
  if (( DRY )) && (( PREFLIGHT_REFUSALS > 0 )); then
    die "${PREFLIGHT_REFUSALS} refusal(s) above; a real run stops at the FIRST one, so the
     rest of this account is what you would have found afterwards. Not all of them are
     preflight's: 'need_root' and 'firewall' refuse where they stand"
  fi
}

# ⚠ Sourced, rather than run, by `packaging.test.ts`, which is the ONLY thing holding the
# validators above equal to lib/auth/scrypt.ts, lib/auth/config.ts and lib/conditions.ts —
# three rules whose every failure mode is silent. The alternative was a CLI entry point
# nobody would ever type, or no cross-check at all.
if [[ -z "${DASHBOARD_SH_LIB:-}" ]]; then
  main "$@"
fi
