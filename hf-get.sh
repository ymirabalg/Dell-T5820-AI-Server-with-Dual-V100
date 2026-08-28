#!/usr/bin/env bash
#
# hf-get.sh — download a large file from Hugging Face at more than one stream's speed.
#
# Runs anywhere with bash + curl. HF throttles hard: a single connection settles to
# ~5 MB/s regardless of your link. This splits the file into chunks fetched by a pool
# of workers, resumes any chunk independently, verifies every chunk's length before
# joining, and checks the assembled file's size and GGUF magic.
#
#   ./hf-get.sh REPO FILE [DEST]
#   ./hf-get.sh unsloth/Qwen3.8-27B-GGUF Qwen3.8-27B-UD-Q4_K_M.gguf ~/models
#
#   WORKERS=8 CHUNK_MB=256 ./hf-get.sh ...   # tune the pool
#
# Measured on this project: 25 GB in ~60 min where a single stream projected ~2 h.
# The client-side burst allowance is a few GB; after that everything converges on the
# same sustained rate, so raising WORKERS past ~8 buys nothing.
#
set -euo pipefail

REPO="${1:-}"; FILE="${2:-}"; DEST="${3:-.}"
WORKERS="${WORKERS:-8}"
CHUNK=$(( ${CHUNK_MB:-256} * 1024 * 1024 ))

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
info()  { printf '  \033[36m·\033[0m %s\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
usage() { sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

[[ -n "$REPO" && -n "$FILE" ]] || usage 1
command -v curl >/dev/null || die "curl not found"

URL="https://huggingface.co/${REPO}/resolve/main/${FILE}"
OUT="${DEST%/}/${FILE}"
PARTS="${DEST%/}/.${FILE}.parts"
mkdir -p "$DEST" "$PARTS"

bold "Fetching ${FILE}"
info "from ${REPO}"

# Content-Length via a redirect-following HEAD. Without a total we cannot chunk.
SZ="$(curl -sIL "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v}')"
[[ "$SZ" =~ ^[0-9]+$ && "$SZ" -gt 0 ]] || die "could not determine size — is the path right?
  tried: $URL"
N=$(( (SZ + CHUNK - 1) / CHUNK ))
info "$(awk -v s="$SZ" 'BEGIN{printf "%.2f GB", s/1e9}') in ${N} chunks, ${WORKERS} workers"

want() { local i=$1 s e; s=$((i*CHUNK)); e=$((s+CHUNK-1)); (( e > SZ-1 )) && e=$((SZ-1)); echo $((e-s+1)); }
have() { stat -c %s "$PARTS/c$1" 2>/dev/null || stat -f %z "$PARTS/c$1" 2>/dev/null || echo 0; }

# Each worker takes every WORKERSth chunk. No locking needed, and an interrupted run
# resumes because every chunk knows its own expected length.
worker() {
  local w=$1 i s e need got
  for (( i=w; i<N; i+=WORKERS )); do
    need=$(want "$i"); s=$((i*CHUNK)); e=$((s+need-1))
    for _ in 1 2 3 4 5; do
      got=$(have "$i")
      (( got >= need )) && break
      curl -fsL --max-time 600 -r $((s+got))-$e "$URL" >> "$PARTS/c$i" 2>/dev/null || true
    done
  done
}

for w in $(seq 0 $((WORKERS-1))); do worker "$w" & done
wait

# Verify BEFORE joining: a short chunk would produce a silently corrupt file that only
# fails much later, at load time, after the whole download has been paid for.
for (( i=0; i<N; i++ )); do
  [[ "$(have "$i")" == "$(want "$i")" ]] \
    || die "chunk $i is $(have "$i") bytes, expected $(want "$i") — re-run to resume"
done

cat $(for (( i=0; i<N; i++ )); do echo "$PARTS/c$i"; done) > "$OUT"
FINAL=$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")
[[ "$FINAL" == "$SZ" ]] || die "assembled $FINAL bytes, expected $SZ"
if [[ "$FILE" == *.gguf ]]; then
  [[ "$(head -c 4 "$OUT")" == "GGUF" ]] || die "assembled file is not a GGUF"
  ok "GGUF magic verified"
fi
rm -rf "$PARTS"
ok "$OUT ($(awk -v s="$SZ" 'BEGIN{printf "%.2f GB", s/1e9}'))"
