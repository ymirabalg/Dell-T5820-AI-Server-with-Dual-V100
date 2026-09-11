#!/usr/bin/env python3
"""Step 11's deliberate regressions — evidence that the packaging tests bite.

Same harness as steps 2-10, including step 4's per-mutation **red-test ledger**. Each entry
replaces one exact string in one source file with a plausible *wrong* implementation — the
wrong thing someone would actually write, not a syntax error — runs ``pnpm vitest run
packaging.test.ts``, and restores the file. **Every one must exit 1.**

⚠ **The sources here are not TypeScript**, and that is the point. ``dashboard.sh``,
``Dockerfile``, ``systemd/ai-dashboard.service`` and ``.dockerignore`` are the four files in
this project that **nothing else in the suite can see**, and three of them encode rules whose
every failure mode is silent: an unparseable ``PASSWORD_HASH`` is a clean empty 401 with
nothing logged, a quoted ``SESSION_SECRET`` works today and kills every session tomorrow, and
a ``STANDING`` entry that matches nothing suppresses nothing. ``packaging.test.ts`` sources
the real script and measures its verdicts against ``parseScryptHash``, ``readAuthConfig`` and
``standingIdsFrom``; this file is the proof that the measurement can fail.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs re-aiming;
it does not mean the test is fine.

⚠ HANDOVER §5.1 is honoured. Every bound this script carries is fixtured on **both** sides in
``packaging.test.ts`` (``logN`` at 0/20/21, ``r`` at 32/33, salt and key one byte short, the
canonical and non-canonical spelling of the same bytes), and the mutations below attack the
comparisons from both directions: ``11-H5`` widens a ceiling, ``11-H2`` drops a length rule
entirely, ``11-H6`` loosens the decimal grammar.

⚠ Note the shape of ``11-S4``. It swaps two capture groups in the ``sed`` that reads §6.4's
kind table out of ``lib/conditions.ts`` — the script's ONE guard against retyping a fifteen-row
vocabulary — and every behavioural check of a *singleton* entry stays green under it. Only the
cross-check against ``standingIdsFrom`` sees it, which is why that test runs the real table
rather than a fixture of its own.

Run from ``dashboard/`` with pnpm on PATH:

    export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
    python3 pipeline/steps/11-packaging/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

PACKAGING = "packaging.test.ts"
# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied verbatim from steps 4 and 5; only
#    LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# Five consecutive steps shipped a test that NAMES a property it does not check. Step 5's
# reconciliation found four more, and **three of its four non-biting mutations were bad
# TESTS, not bad mutations** — including one whose name promised three budgets and whose
# body checked one. So:
#
#     Every ⚠-marked test must appear in at least one mutation's RED set.
#
# The harness runs each mutation, records which test names went red, unions those sets, and
# fails if a ⚠-marked test never appears. A test that no mutation can distinguish is a test
# that cannot fail for any wrong implementation anyone was willing to write.
#
# ⚠ What this CANNOT catch, and the limit is irreducible: a test that goes red for the WRONG
# reason. Mechanise the necessary condition; keep reading each test against its own name for
# the sufficient one.
#
# ⚠ A failure here is NOT "add a mutation until it goes green". The first hypothesis is that
# the test is inert and should be given a body matching its name, or renamed to what it
# actually checks. The second is that the property has no plausible wrong implementation, in
# which case drop the ⚠ rather than the standard.
#
# ⚠ `packaging.test.ts` is the ONLY ledger file here, and it is in no other harness's
# LEDGER_FILES: ledger ownership follows the FILE (HANDOVER §5.2 rule 6), and nothing
# outside this step reads `dashboard.sh`, the `Dockerfile`, the unit or `.dockerignore`.
# `lib/cross-harness-ledger.test.ts` re-derives the union of all ten lists by walking, so a
# ⚠ mark that ended up orphaned here would fail THAT test rather than passing quietly.
LEDGER_FILES = [PACKAGING]

# `test('…')`, `it('…')` and `test.each(…)('…')`, single- or double-quoted.
# ⚠ BACK-PORTED from step 9's reconciliation (Q1, 2026-09-07) — this step's
# ledger previously used a `MARKED` regex whose `.each([^\n]*)` could not span a
# newline, so a ⚠ name on a MULTI-LINE `test.each([...])(...)` was invisible to it: it
# never counted as marked, and nothing ever required a mutation to redden it. See
# HANDOVER §5.2 and `pipeline/steps/09-ui-primitives/regressions.py` for the full
# account.
#
# The replacement finds each `test`/`it` call, skips a `.each(...)` argument list
# PAREN-BALANCED and STRING-AWARE, then reads the first string literal of the call
# itself.
# ⚠ Q1 reconciliation, 2026-09-07 (adversarial F1): a GENERIC TYPE ARGUMENT between
# `.each` and its `(` — `test.each<[string, LoginState]>([…])('⚠ …')` — defeated
# `(?:test|it)(\.each)?\s*\(` completely. Not mis-parsed: never matched at all, because
# the empty-`(\.each)?` branch cannot get past `.each<` either. Two ⚠ marks in
# `lib/auth/login-view.test.ts` were invisible to BOTH the pre-Q1 regex and the step-9
# scanner Q1 back-ported, so the true invisible-mark count for steps 2–8 was 39, not 37.
# The optional `<…>` below closes it. Excluding `;{}()` from the type argument keeps the
# match from running away across a statement; a type argument containing a parenthesis
# (`test.each<[() => void]>`) would still be missed — and would now be REPORTED by the
# `CANDIDATE` diagnostic below rather than dropped in silence.
CALL = re.compile(r"(?:^|\s)(?:test|it)(\.each)?(?:\s*<[^;{}()]*>)?\s*\(")
FIRST_STRING = re.compile(r"""\s*(['"])((?:\\.|(?!\1).)*)\1""")

# ⚠ Q1 reconciliation, 2026-09-07 (adversarial F3): every `test`/`it` call this scanner is
# EXPECTED to be able to read. `marked_tests()` reports anything matching this that it could
# not read — a backtick-quoted name, a `.skip`/`.only`/`.concurrent` modifier, a generic type
# argument it still cannot parse, an unbalanced `.each(…)` list. Before this, EVERY one of
# those was a silent `continue`: the mark simply did not exist as far as the ledger was
# concerned, which is the exact defect Q1 was opened to fix, and F1 proved it was still live
# in the "corrected" scanner. The report is a warning, never a failure — it cannot break a
# passing run, and a run that starts failing for a new reason is the thing this project can
# least afford. Names are matched against prose-suppressed source (`_code_only`) because
# `(?:^|\s)it\s*\(` also matches English: three comments in this tree say "… through it (T52)".
CANDIDATE = re.compile(
    r"(?:^|\s)(?:test|it)\s*"
    r"(?:<|\(|\.(?:each|skip|only|todo|concurrent|fails|for|runIf|skipIf)\b)"
)


def _skip_balanced(text, i):
    """`text[i]` is `(`; index just past its matching `)`, skipping strings AND comments.

    ⚠ Comments are not decoration here: an apostrophe inside one (`step 8's runtime`) opens a
    string as far as a naive scanner is concerned, and everything after it is mis-parsed.
    """
    depth = 0
    while i < len(text):
        ch = text[i]
        if text.startswith("//", i):
            nl = text.find("\n", i)
            i = len(text) if nl == -1 else nl
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = len(text) if end == -1 else end + 2
            continue
        if ch in "'\"`":
            quote = ch
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return None


def _code_only(text):
    """`text` with every comment and every string BODY blanked, offsets preserved.

    Used ONLY by the `CANDIDATE` diagnostic, so that prose and the source-text guards that
    quote `test(` as data are not reported as calls the scanner failed to read.
    """
    out = list(text)
    i = 0
    while i < len(text):
        if text.startswith("//", i):
            nl = text.find("\n", i)
            end = len(text) if nl == -1 else nl
            out[i:end] = " " * (end - i)
            i = end
            continue
        if text.startswith("/*", i):
            e = text.find("*/", i + 2)
            end = len(text) if e == -1 else e + 2
            out[i:end] = " " * (end - i)
            i = end
            continue
        if text[i] in "'\"`":
            quote = text[i]
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    out[i] = " "
                    if i + 1 < len(text):
                        out[i + 1] = " "
                    i += 2
                    continue
                if text[i] == quote:
                    break
                out[i] = " "
                i += 1
            i += 1
            continue
        i += 1
    return "".join(out)


# ⚠ 10g/A7, 2026-09-10 — the ledger keys this scanner could not match, collected so the run
# FAILS on them instead of printing a warning nobody reads. The ledger's own check is
# `prefix not in joined`, so a key of `⚠` alone is a substring of every ⚠ FAIL line and the
# mark scores covered without any mutation touching it. Three such names existed across the
# nine harnesses on 2026-09-10 — all three added by 10g, one of them 10g's own acceptance
# test for the `… N more` marker — and both earlier phases reported "every ⚠ mark reddened"
# off runs that were printing these lines. HANDOVER §5.2 rule 5.
UNMATCHABLE = []


def marked_tests():
    """Every ⚠-marked test name, as (file, name, matchable-prefix) triples."""
    found = []
    UNMATCHABLE.clear()
    for rel in LEDGER_FILES:
        text = pathlib.Path(rel).read_text()
        read = set()
        for m in CALL.finditer(text):
            at = m.end() - 1  # the `(` of either `test(` or `test.each(`
            if m.group(1):  # `.each(…)` — skip its argument list, then expect `(`
                after = _skip_balanced(text, at)
                if after is None:
                    continue
                after = len(text) - len(text[after:].lstrip())
                if after >= len(text) or text[after] != "(":
                    continue
                at = after
            s = FIRST_STRING.match(text, at + 1)
            if s is None:
                continue
            read.add(m.start())
            name = s.group(2)
            if "⚠" not in name:
                continue
            # ⚠ Q1 reconciliation, 2026-09-07 (adversarial F7): the `%` split exists to strip a
            # `test.each` placeholder, so it applies ONLY to a `.each` call. Run on a plain
            # name it truncated the prefix at a literal percent sign (`⚠ exactly full renders
            # 100%, …` matched on `⚠ exactly full renders 100`), shortening the discriminating
            # prefix for no reason — and a short prefix is the input to F2's conflation.
            prefix = (name.split("%")[0] if m.group(1) else name).strip()
            if len(prefix) < 12:
                UNMATCHABLE.append((rel, name, prefix))
                print(f"!!! {rel}: ⚠ test name is unmatchably short: {name!r}")
            found.append((rel, name, prefix))
        for c in CANDIDATE.finditer(_code_only(text)):
            if c.start() in read:
                continue
            nl = text.find("\n", c.start())
            snippet = text[c.start(): len(text) if nl == -1 else nl].strip()[:100]
            line = text.count("\n", 0, c.start()) + 1
            print(f"!!! {rel}:{line}: a test/it call the ⚠-scanner cannot read — {snippet}")
    return found


def red_test_lines(out):
    """The `FAIL <file> > <suite> > <test>` lines vitest prints, one per failing test."""
    return [l.strip() for l in out.splitlines() if l.strip().startswith("FAIL ")]


SH = "dashboard.sh"
UNIT = "systemd/ai-dashboard.service"
DOCKERFILE = "Dockerfile"
DOCKERIGNORE = ".dockerignore"
# ⚠ loop 11b: the ruling reaches into the app, and packaging.test.ts is the ledger owner of
# the assertion that no composition root reads the two secrets from `process.env`.
AUTHZ_SRC = "lib/auth/authorize.ts"
# ⚠ lib/auth/ is step 07's and its ledger owns those test FILES. These two mutations live
# HERE because the test that catches them is packaging.test.ts: each is a way for the
# TypeScript half of a rule spelled twice to drift from the bash half, and the
# cross-check that measures that agreement is step 11's.
SECRETFILE_SRC = "lib/auth/secret-file.ts"
PKG = "package.json"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ============================================================ O20 — the hash encoding
    ("11-H1 the key field is checked for length and alphabet but not for CANONICAL spelling",
     SH,
     "HASH_KEY_RE='^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'",
     "HASH_KEY_RE='^[A-Za-z0-9_-]{43}$'",
     [PACKAGING]),
    ("11-H2 the salt is checked for its alphabet only, so any length passes",
     SH,
     "HASH_SALT_RE='^[A-Za-z0-9_-]{21}[AQgw]$'",
     "HASH_SALT_RE='^[A-Za-z0-9_-]+$'",
     [PACKAGING]),
    ("11-H3 the field-count regex loses its anchors, so a seventh field is simply ignored",
     SH,
     '  if [[ ! "$h" =~ ^([^.]*)\\.([^.]*)\\.([^.]*)\\.([^.]*)\\.([^.]*)\\.([^.]*)$ ]]; then',
     '  if [[ ! "$h" =~ ([^.]*)\\.([^.]*)\\.([^.]*)\\.([^.]*)\\.([^.]*)\\.([^.]*) ]]; then',
     [PACKAGING]),
    ("11-H4 the tag is checked for presence rather than for being 'scrypt'",
     SH,
     '  [[ "$tag" == "$HASH_TAG" ]] || { echo "does not start with \'${HASH_TAG}.\'"; return 1; }',
     '  [[ -n "$tag" ]] || { echo "has an empty tag"; return 1; }',
     [PACKAGING]),
    ("11-H5 the logN ceiling is raised past LIMITS, so a hash the server refuses is approved",
     SH,
     "HASH_LOGN_MIN=1;  HASH_LOGN_MAX=20",
     "HASH_LOGN_MIN=1;  HASH_LOGN_MAX=31",
     [PACKAGING]),
    ("11-H6 the cost fields accept any digits, so a zero-padded 015 parses here and not there",
     SH,
     '  [[ "$v" =~ ^(0|[1-9][0-9]*)$ ]] || return 1',
     '  [[ "$v" =~ ^[0-9]+$ ]] || return 1',
     [PACKAGING]),
    ("11-H7 an argon2id hash falls through to the generic shape message",
     SH,
     "    \\$argon2*)",
     "    \\$argon2id-v19*)",
     [PACKAGING]),
    ("11-H8 a rejection message quotes the field it rejected, putting a credential in the log",
     SH,
     '{ echo "field 6 (key) is not canonical unpadded base64url of 32 bytes (${#key} chars)"; return 1; }',
     '{ echo "field 6 (key) is not canonical unpadded base64url of 32 bytes (${key})"; return 1; }',
     [PACKAGING]),

    # ======================================================= O21 — the env-file grammar
    ("11-E1 a double-quoted value is accepted, which is O21 exactly",
     SH,
     '    *\'"\'*)  echo "contains a double quote. --env-file does not strip quotes: the value would include it"; return 1 ;;',
     '    *\'"\'*)  : ;;',
     [PACKAGING]),
    ("11-E2 a value containing $ is accepted, and a sourcing shell expands it away",
     SH,
     '    *\'$\'*)  echo "contains a \\$, which a shell that ever sourced this file would expand"; return 1 ;;',
     '    *\'$\'*)  : ;;',
     [PACKAGING]),
    ("11-E3 trailing whitespace is accepted, and Docker keeps it as part of the secret",
     SH,
     '    *\' \'|*$\'\\t\') echo "has trailing whitespace, which Docker keeps"; return 1 ;;',
     '    *\' \'|*$\'\\t\') : ;;',
     [PACKAGING]),

    # ============================================================ D8 — STANDING (§6.4)
    ("11-S1 a bare kind is always accepted, so a bare 'unit' silences gpu-fan-control",
     SH,
     '    [[ "$bare" == "true" ]] && return 0',
     '    return 0',
     [PACKAGING]),
    ("11-S2 the singleton flag is compared against the wrong literal, so it never fires",
     SH,
     '  if [[ "$singleton" == "true" ]]; then',
     '  if [[ "$singleton" == "yes" ]]; then',
     [PACKAGING]),
    ("11-S3 the empty-subject rule tests the kind instead of the subject",
     SH,
     '  if [[ -z "$subject" ]]; then',
     '  if [[ -z "$kind" ]]; then',
     [PACKAGING]),
    ("11-S4 the two flag columns are swapped as they are read out of lib/conditions.ts",
     SH,
     "bareKindAllowedInStanding: \\([a-z]*\\) },$/\\1 \\2 \\3/p'",
     "bareKindAllowedInStanding: \\([a-z]*\\) },$/\\1 \\3 \\2/p'",
     [PACKAGING]),
    ("11-S5 the locale is left to the environment, so [[:space:]] means different things",
     SH,
     "export LC_ALL=C\n",
     "export LC_ALL=en_US.UTF-8\n",
     [PACKAGING]),
    ("11-S6 the condition vocabulary is retyped into the script beside the table it reads",
     SH,
     'CONDITION_RULES=""\n',
     'CONDITION_RULES=""\nCONDITION_KINDS="gpu_temp gpu_throttle fan5_engaged dkms_for_running_kernel"\n',
     [PACKAGING]),

    # ================================================================== the systemd unit
    ("11-U1 StartLimitIntervalSec and StartLimitBurst move into [Service], where systemd ignores them",
     UNIT,
     "StartLimitIntervalSec=300\nStartLimitBurst=5\n\n[Service]\nType=simple",
     "\n[Service]\nType=simple\nStartLimitIntervalSec=300\nStartLimitBurst=5",
     [PACKAGING]),
    ("11-U2 the unit is ordered after multi-user.target, which is the ordering cycle",
     UNIT,
     "After=docker.service sysinit.target",
     "After=docker.service multi-user.target",
     [PACKAGING]),
    ("11-U3 the port is published instead of shared, so DOCKER/FORWARD bypasses ufw",
     UNIT,
     "    --network host \\\n",
     "    -p 8090:8090 \\\n",
     [PACKAGING]),
    ("11-U4 the read-only root filesystem is dropped and only the tmpfs survives",
     UNIT,
     "    --read-only --tmpfs /tmp \\\n",
     "    --tmpfs /tmp \\\n",
     [PACKAGING]),
    ("11-U5 the /etc/llama-server mount is dropped, and SERVING reads null on a healthy box",
     UNIT,
     "    -v /etc/llama-server:/etc/llama-server:ro \\\n",
     "",
     [PACKAGING]),
    ("11-U6 one mount loses its :ro, which is invariant 2 gone with no other symptom",
     UNIT,
     "    -v /lib/modules:/lib/modules:ro \\\n",
     "    -v /lib/modules:/lib/modules \\\n",
     [PACKAGING]),
    ("11-U7 a Docker restart policy is added, and fights systemd for the container",
     UNIT,
     "/usr/bin/docker run --rm --name ai-dashboard \\\n",
     "/usr/bin/docker run --rm --restart unless-stopped --name ai-dashboard \\\n",
     [PACKAGING]),
    ("11-U8 UV_THREADPOOL_SIZE is dropped back to libuv's default of four",
     UNIT,
     "    -e UV_THREADPOOL_SIZE=16 \\\n",
     "",
     [PACKAGING]),

    # ======================================================================== the image
    ("11-D1 the .next/static copy is dropped, and every stylesheet 404s with nothing logged",
     DOCKERFILE,
     "COPY --from=build /app/.next/static ./.next/static\n",
     "",
     [PACKAGING]),
    ("11-D2 HOSTNAME is set to the box's name, so the server binds 127.0.1.1 and answers nobody",
     DOCKERFILE,
     "    HOSTNAME=0.0.0.0",
     "    HOSTNAME=ai-server",
     [PACKAGING]),
    ("11-D3 the runtime stage drifts off the Node major the suite runs on",
     DOCKERFILE,
     "FROM node:24-slim AS runtime",
     "FROM node:26-slim AS runtime",
     [PACKAGING]),
    ("11-D4 a public/ copy is added for a directory that does not exist",
     DOCKERFILE,
     "COPY --from=build /app/.next/static ./.next/static\n",
     "COPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\n",
     [PACKAGING]),
    ("11-I1 the test files are let back into the build context",
     DOCKERIGNORE,
     "**/*.test.ts\n",
     "# **/*.test.ts\n",
     [PACKAGING]),
    ("11-P1 a fourth runtime dependency appears, and is traced into the image",
     PKG,
     '    "next": "16.3.4",',
     '    "sharp": "0.35.4",\n    "next": "16.3.4",',
     [PACKAGING]),

    # ============================================================ the script's own rules
    ("11-A1 usage()'s line range stops short, and the help text silently loses its options",
     SH,
     "sed -n '3,36p' \"$0\"",
     "sed -n '3,30p' \"$0\"",
     [PACKAGING]),
    ("11-A2 a subcommand is misspelled in the dispatch and answers 'unknown command'",
     SH,
     "    firewall)     cmd_firewall ;;",
     "    firewalll)    cmd_firewall ;;",
     [PACKAGING]),
    ("11-N1 ok_done prints its tick under --dry-run, reporting a write that did not happen",
     SH,
     'ok_done() { (( DRY )) || ok "$*"; }',
     'ok_done() { ok "$*"; }',
     [PACKAGING]),
    ("11-N2 a dry run counts no refusals, so it prints WOULD REFUSE and exits 0",
     SH,
     "    PREFLIGHT_REFUSALS=$(( PREFLIGHT_REFUSALS + 1 ))",
     "    PREFLIGHT_REFUSALS=0",
     [PACKAGING]),
    ("11-C1 the password is passed to the hasher as an argument, where ps can read it",
     SH,
     '    hash_out="$(printf \'%s\' "$PW1" | python3 "$SRC/scripts/hash-password.py" 2>&1)"',
     '    hash_out="$(python3 "$SRC/scripts/hash-password.py" "$PW1" 2>&1)"',
     [PACKAGING]),
    ("11-C2 the env file is read by sourcing it, which expands every $ in a credential",
     SH,
     '  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -1',
     '  ( . "$ENV_FILE"; eval "printf \'%s\' \\"\\$${1}\\"" )',
     [PACKAGING]),
    ("11-H9 the salt keeps its length rule but loses the CANONICAL-spelling one",
     SH,
     "HASH_SALT_RE='^[A-Za-z0-9_-]{21}[AQgw]$'",
     "HASH_SALT_RE='^[A-Za-z0-9_-]{22}$'",
     [PACKAGING]),
    ("11-H10 the p ceiling is raised past LIMITS, on the bound whose far side had no fixture",
     SH,
     "HASH_P_MIN=1;     HASH_P_MAX=16",
     "HASH_P_MIN=1;     HASH_P_MAX=99",
     [PACKAGING]),
    ("11-H11 the r floor drops to zero, so r=0 parses here and returns null there",
     SH,
     "HASH_R_MIN=1;     HASH_R_MAX=32",
     "HASH_R_MIN=0;     HASH_R_MAX=32",
     [PACKAGING]),
    # ⚠ 11-S7 bites exactly where the defect is real. `awk -v k=VALUE` processes escape
    # sequences in VALUE, and POSIX leaves an UNDEFINED escape undefined — an awk that kept
    # `\m` verbatim would make this mutation inert, and would also not have the bug.
    ("11-S7 the condition kind reaches awk through -v, whose escape processing makes this judge LOOSER than the browser",
     SH,
     'found="$(CONDITION_KIND="$1" awk \'$1 == ENVIRON["CONDITION_KIND"] { print $2, $3 }\' <<<"$CONDITION_RULES")"',
     'found="$(awk -v k="$1" \'$1 == k { print $2, $3 }\' <<<"$CONDITION_RULES")"',
     [PACKAGING]),

    # ========================================== check's ROWS, not the validators they call
    # ⚠ Every one of these five left all 24 tests green when it was measured on 2026-09-10.
    # The validators were held equal to the TypeScript and the rows that call them were held
    # to nothing, which is the same silence one level up.
    ("11-R1 check's O21 row stops asking env_value_error, and a quoted secret passes",
     SH,
     '  if ! why="$(env_value_error "$v")"; then',
     '  if false; then',
     [PACKAGING]),
    # ⚠ RE-AIMED 2026-09-11, and RE-NAMED with it. This mutation used to be the only
    # `scrypt_hash_error` call in the row and its name said "an argon2id hash passes"; §1.5's
    # message fix added a FIRST call for the argon2id case, and the name then described
    # something the mutation no longer did — argon2id is answered before this call is reached.
    # A mutation whose name is not its property is a certificate for the wrong thing, so the
    # name follows the anchor, and `11b-R6` below covers the call the old name was about.
    ("11-R2 check's O20 row stops asking scrypt_hash_error for the ENCODING, and a hash parseScryptHash cannot read passes",
     SH,
     '  if why="$(scrypt_hash_error "$h")"; then',
     '  if true; then',
     [PACKAGING]),
    ("11b-R6 check's O20 row stops asking scrypt_hash_error for the SHAPE, and an argon2id hash is diagnosed as a quoting problem",
     SH,
     '  if ! shape="$(scrypt_hash_error "$h")"; then',
     '  if false; then',
     [PACKAGING]),
    ("11-R3 check's D8 row stops asking standing_entry_error, and a mistyped id passes",
     SH,
     '    if ! why="$(standing_entry_error "$entry")"; then',
     '    if false; then',
     [PACKAGING]),
    ("11-R4 the env-file row stops noticing a line with no '=', which Docker takes from the host",
     SH,
     '    if [[ "$line" != *=* ]]; then',
     '    if false; then',
     [PACKAGING]),
    ("11-R5 env_set downgrades its refusal to a note, so the script itself can write a quoted value",
     SH,
     '    if ! why="$(secret_value_error "$value")"; then\n      die "refusing to write ${key}: the value ${why}"\n    fi',
     '    if ! why="$(secret_value_error "$value")"; then\n      warn "the value ${why}"\n    fi',
     [PACKAGING]),
    ("11-O1 O22 counts only containers of the :latest tag, missing the one an upgrade leaves running",
     SH,
     '      "$IMAGE"|"$IMAGE":*) printf \'%s\\n\' "$nm" ;;',
     '      "$IMAGE":latest) printf \'%s\\n\' "$nm" ;;',
     [PACKAGING]),
    ("11-N3 the env file is rewritten with no timestamped backup, and no dry run says so",
     SH,
     '  backup_env\n  if (( DRY )); then',
     '  if (( DRY )); then',
     [PACKAGING]),
    ("11-C3 the env file is sourced through the BRACED spelling the source-text guard could not see",
     SH,
     '  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -1',
     '  ( . "${ENV_FILE}"; eval "printf \'%s\' \\"\\$${1}\\"" )',
     [PACKAGING]),
    ("11-H12 the salt's rejection message quotes the salt, putting half a credential in the log",
     SH,
     '{ echo "field 5 (salt) is not canonical unpadded base64url of 16 bytes (${#salt} chars)"; return 1; }',
     '{ echo "field 5 (salt) is not canonical unpadded base64url of 16 bytes (${salt})"; return 1; }',
     [PACKAGING]),
    ("11-D5 the runtime account keeps its uid and loses its nologin shell, with the comment still saying otherwise",
     DOCKERFILE,
     "      --home-dir /nonexistent --shell /usr/sbin/nologin dashboard",
     "      --home-dir /nonexistent dashboard",
     [PACKAGING]),
    ("11-E4 a backtick is accepted, and a shell that ever sourced the env file EXECUTES it",
     SH,
     '''    *'`'*)  echo "contains a backtick, which a shell that ever sourced this file would EXECUTE"; return 1 ;;''',
     '''    *'`'*)  : ;;''',
     [PACKAGING]),

    # ==================================================================================
    # ⚠⚠ THE RECONCILIATION'S OWN 55 — added 2026-09-10
    # ==================================================================================
    #
    # The adversarial applied 63 one-line edits to these four files and **49 kept the whole
    # suite green**. Nearly every one of them is below, re-aimed at the tree as it stands
    # now, so the sweep that measured the hole is the harness that keeps it shut. The two
    # mechanisms they are pointed at are in `packaging.test.ts`: a CALL-GRAPH assertion over
    # `cmd_check`, and a "this guard refuses on bad input and permits on good" table over
    # every `check` row, every preflight refusal and every subcommand-level guard.
    #
    # ⚠ The lesson these encode, and it is the general one: **a cross-check is only worth the
    # call site it is wired into, and a guard is only worth an assertion that it REFUSES.**

    # ------------------------------------------------- cmd_check's call graph and exit code
    ("11-K1 the whole O22 section is deleted from cmd_check, and the rows it leaves are still green",
     SH,
     "  check_one_process\n  check_container\n",
     "  true\n  check_container\n",
     [PACKAGING]),
    ("11-K2 cmd_check can never return 1, so install's gate, restart's gate and the operator's exit code all go green together",
     SH,
     "  if (( CHECK_FAIL > 0 )); then",
     "  if (( CHECK_FAIL > 99 )); then",
     [PACKAGING]),
    ("11-K3 a row nobody could evaluate is reported as a row that passed",
     SH,
     "  if (( CHECK_UNKNOWN > 0 )); then",
     "  if (( CHECK_UNKNOWN > 99 )); then",
     [PACKAGING]),
    ("11-K4 a row is dropped from cmd_check rather than replaced, which no behavioural stub can see",
     SH,
     "  check_hasher\n  check_unit\n",
     "  check_unit\n",
     [PACKAGING]),

    # ------------------------------------------------------------------ check's own rows
    ("11-G1 the gate row asks nothing and reports 401 whatever the server said",
     SH,
     '''  code="$(curl -sS -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${PORT}/api/telemetry" 2>/dev/null || true)"''',
     '  code=401',
     [PACKAGING]),
    ("11-G2 a world-readable credentials file passes the mode row",
     SH,
     '  if [[ "$mode" == "640" && "$owner" == "0:${want_gid}" ]]; then\n'
     '    row_ok "$ENV_FILE is root:${want_gid} 0640 — mounted, and readable by the container only"',
     '  if true; then\n'
     '    row_ok "$ENV_FILE is root:${want_gid} 0640 — mounted, and readable by the container only"',
     [PACKAGING]),
    ("11-G3 a malformed environment-variable name passes the env-file row",
     SH,
     '    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then',
     '    if false; then',
     [PACKAGING]),
    ("11-G4 no unit installed at all reads green",
     SH,
     '  if ! unit_installed; then row_fail "$UNIT_PATH is not installed"; return; fi',
     '  if ! unit_installed; then row_ok "$UNIT_PATH is not installed"; return; fi',
     [PACKAGING]),
    ("11-G5 trap 1's runtime half: the 10 s window systemd falls back to reads green",
     SH,
     '    *)  row_fail "StartLimitIntervalUSec=${v}, expected 5min. systemd IGNORES StartLimit* in',
     '    *)  row_ok "StartLimitIntervalUSec=${v}, expected 5min. systemd IGNORES StartLimit* in',
     [PACKAGING]),
    ("11-G6 the 2026-09-04 defect itself: a firewall that is not enforcing is ticked",
     SH,
     '    row_fail "ufw reads ENABLED=no. ⚠ Do NOT just enable it: check the port-22 rule first',
     '    row_ok "ufw reads ENABLED=no. ⚠ Do NOT just enable it: check the port-22 rule first',
     [PACKAGING]),
    ("11-G7 the row about the failure that took this box off the network reads green",
     SH,
     '  else row_fail "NO rule covers port 22"; fi',
     '  else row_ok "NO rule covers port 22"; fi',
     [PACKAGING]),
    ("11-G8 8090 unprotected reads green",
     SH,
     '    row_fail "no rule covers ${PORT} — the container will start, bind, log nothing and',
     '    row_ok "no rule covers ${PORT} — the container will start, bind, log nothing and',
     [PACKAGING]),
    ("11-G9 a missing hash-password.py is discovered by whoever needs it, not by check",
     SH,
     '    row_fail "$f is missing — set-password has no producer, and that is only discovered by someone who needs it"',
     '    row_ok "$f is missing — set-password has no producer, and that is only discovered by someone who needs it"',
     [PACKAGING]),
    ("11-G10 O20's absent case reads green, and every login is denied silently",
     SH,
     '    row_fail "PASSWORD_HASH is absent — every login is denied, silently"',
     '    row_ok "PASSWORD_HASH is absent — every login is denied, silently"',
     [PACKAGING]),
    ("11-G11 O21's absent case reads green, and every session is refused",
     SH,
     '    row_fail "SESSION_SECRET is absent — readAuthConfig returns null and every session is refused"',
     '    row_ok "SESSION_SECRET is absent — readAuthConfig returns null and every session is refused"',
     [PACKAGING]),
    ("11-G12 the container count is a constant, so a second instance cannot be counted",
     SH,
     '''  named="$(docker ps --filter "name=^${CONTAINER}$" --format '{{.ID}}' 2>/dev/null | wc -l | tr -d ' ')"''',
     '  named=1',
     [PACKAGING]),
    ("11-G13 the 8090 listener count is a constant",
     SH,
     '''    listeners="$(ss -H -ltn "sport = :${PORT}" 2>/dev/null | wc -l | tr -d ' ')"''',
     '    listeners=1',
     [PACKAGING]),
    ("11-G14 the second-instance union loses its ancestor half",
     SH,
     '''  by_id="$(docker ps --filter "ancestor=${IMAGE}:latest" --format '{{.Names}}' 2>/dev/null \\
            | grep -v "^${CONTAINER}$" || true)"''',
     '  by_id=""',
     [PACKAGING]),
    ("11-G15 one process inside the container is a constant",
     SH,
     '''    procs="$(docker top "$CONTAINER" -o pid,args 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')"''',
     '    procs=1',
     [PACKAGING]),
    ("11-G16 PLAN row 12's detector: a unit that will not come back after a reboot reads green",
     SH,
     '    *)  row_fail "UnitFileState=${enabled} — this unit does NOT start after a reboot, and',
     '    *)  row_ok "UnitFileState=${enabled} — this unit does NOT start after a reboot, and',
     [PACKAGING]),
    ("11-G17 a container running an OLDER image than :latest reads green",
     SH,
     '    row_fail "the running container is ${running:0:19} and ${IMAGE}:latest is now',
     '    row_ok "the running container is ${running:0:19} and ${IMAGE}:latest is now',
     [PACKAGING]),
    ("11-G18 an unreadable credentials file is reported as an ABSENT one, on a healthy box",
     SH,
     '  env_readable && return 1\n',
     '  return 1\n',
     [PACKAGING]),
    ("11-G19 the bare-line row prints the line, and a SESSION_SECRET has no character it would truncate at",
     SH,
     '''      row_fail "line ${lineno} has no '=' (${#line} characters, not printed): Docker reads that as 'take this from the host environment'"''',
     '''      row_fail "a line with no '=' (${line%%[!A-Za-z0-9_]*}…): Docker reads that as 'take this from the host environment'"''',
     [PACKAGING]),
    ("11-G20 a trailing space in the secret is explained as a quote problem",
     SH,
     '    case "$why" in\n      *quote*)',
     '    case "$why" in\n      *)',
     [PACKAGING]),

    # ------------------------------------------------------------- the preflight refusals
    ("11-Q1 the ufw port-22 HARD REFUSAL becomes a warning, on the guard between a root run and the 2026-09-04 lockout",
     SH,
     '        refuse "⚠ HARD REFUSAL — ufw is enforcing and NO rule covers port 22. Fix that FIRST,',
     '        warn "⚠ HARD REFUSAL — ufw is enforcing and NO rule covers port 22. Fix that FIRST,',
     [PACKAGING]),
    ("11-Q2 the image is amd64-only and the architecture refusal becomes a warning",
     SH,
     '  [[ "$arch" == "x86_64" ]] || refuse "needs x86_64; found ${arch}"',
     '  [[ "$arch" == "x86_64" ]] || warn "needs x86_64; found ${arch}"',
     [PACKAGING]),
    ("11-Q3 python3 is the only producer of a PASSWORD_HASH and its absence becomes a warning",
     SH,
     '    have python3 || refuse "python3 is missing, and scripts/hash-password.py is the only producer of PASSWORD_HASH"',
     '    have python3 || warn "python3 is missing, and scripts/hash-password.py is the only producer of PASSWORD_HASH"',
     [PACKAGING]),
    ("11-Q4 something else already listening on the port becomes a warning",
     SH,
     '      refuse "something is already listening on ${PORT} and it is not our container:',
     '      warn "something is already listening on ${PORT} and it is not our container:',
     [PACKAGING]),
    ("11-Q5 the disk-space refusal becomes a warning, and the build fills /var/lib",
     SH,
     '    refuse "only ${free} GB free on /var/lib; the build plus the image needs 10 GB"',
     '    warn "only ${free} GB free on /var/lib; the build plus the image needs 10 GB"',
     [PACKAGING]),
    ("11-Q6 install goes back to discovering a disabled firewall at step 6 of 8, with the unit already enabled",
     SH,
     '    refuse "$CMD reaches the firewall step and ufw reads ENABLED=no. This script never runs',
     '    warn "$CMD reaches the firewall step and ufw reads ENABLED=no. This script never runs',
     [PACKAGING]),
    ("11-Q10 the firewall subcommand stops declaring that it reaches the firewall step, so the refusal moves back to step 6 of 8",
     SH,
     "cmd_firewall() {\n  preflight 1 0 0 1",
     "cmd_firewall() {\n  preflight 1 0 0 0",
     [PACKAGING]),
    ("11-Q11 the disabled-firewall refusal fires for every subcommand, so check and status are refused on a box whose operator has not enabled ufw",
     SH,
     "  elif (( want_firewall )); then",
     "  elif true; then",
     [PACKAGING]),
    ("11-Q7 need_root is neutered entirely, and every root subcommand runs unprivileged",
     SH,
     'need_root() { is_root || refuse "$CMD needs root — re-run with sudo"; }',
     'need_root() { return 0; }',
     [PACKAGING]),
    ("11-Q8 the script is pointed at the wrong source tree and says so as a warning",
     SH,
     '''        refuse "$SRC/package.json is '${name:-unnamed}', not 'ai-dashboard'"''',
     '''        warn "$SRC/package.json is '${name:-unnamed}', not 'ai-dashboard'"''',
     [PACKAGING]),
    ("11-Q9 the rsync that did not carry scripts/ is a warning rather than a refusal",
     SH,
     '      || refuse "no $SRC/scripts/hash-password.py — the rsync must carry scripts/ (INSTALL-SPEC §11.3)"',
     '      || warn "no $SRC/scripts/hash-password.py — the rsync must carry scripts/ (INSTALL-SPEC §11.3)"',
     [PACKAGING]),

    # ------------------------------------------------------ the guards that are subcommands
    ("11-M1 restart's container-id proof is disconnected, and a restart that changed nothing reports success",
     SH,
     '  if [[ -n "$before" && "$before" == "$after" ]]; then',
     '  if false; then',
     [PACKAGING]),
    ("11-M2 restart stops re-checking, at the one moment a changed env file first takes effect",
     SH,
     '  ok "container id ${before:-none} -> ${after:-none}"\n  cmd_check\n',
     '  ok "container id ${before:-none} -> ${after:-none}"\n',
     [PACKAGING]),
    ("11-M3 trap 1's install-time verification is disconnected: the keys are written and never asked about",
     SH,
     '    check_start_limit || die "the StartLimit* keys did not take — see [Unit] in $UNIT_PATH"',
     '    check_start_limit || true',
     [PACKAGING]),
    ("11-M4 install no longer fails on a failed check, which is §12.2's answered question reversed",
     SH,
     '    die "install completed but \'check\' did not pass (exit ${rc}). The unit is installed and',
     '    warn "install completed but \'check\' did not pass (exit ${rc}). The unit is installed and',
     [PACKAGING]),
    ("11-M5 start stops proving that anything answered on the port",
     SH,
     '  wait_for_answer || die "the unit started but nothing answered — see \'logs\'"',
     '  wait_for_answer || true',
     [PACKAGING]),
    ("11-M6 install re-prompts for and overwrites a password that is already set",
     SH,
     '  if env_has PASSWORD_HASH && [[ -n "$(env_get PASSWORD_HASH || true)" ]]; then',
     '  if false; then',
     [PACKAGING]),
    ("11-M7 configure rotates a live SESSION_SECRET, logging out every open session",
     SH,
     '  if env_has SESSION_SECRET && [[ -n "$(env_get SESSION_SECRET || true)" ]]; then',
     '  if false; then',
     [PACKAGING]),
    ("11-M8 configure overwrites the STANDING an operator wrote by hand",
     SH,
     '  if env_has STANDING; then\n    ok "STANDING already present',
     '  if false; then\n    ok "STANDING already present',
     [PACKAGING]),
    ("11-M9 the file carrying the password hash is written world-readable",
     SH,
     '  chmod 0640 "$TMP"\n  if is_root; then chown "root:$(container_gid)" "$TMP"; fi',
     '  chmod 0644 "$TMP"\n  if is_root; then chown "root:$(container_gid)" "$TMP"; fi',
     [PACKAGING]),
    ("11-M10 every timestamped backup of the credentials file is written world-readable",
     SH,
     '  install -m 0600 "$from" "$to"',
     '  install -m 0644 "$from" "$to"',
     [PACKAGING]),
    ("11-M11 env_get takes the FIRST duplicate and check then judges the line the container never sees",
     SH,
     '  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -1',
     '  sed -n "s/^${1}=//p" "$ENV_FILE" | head -1',
     [PACKAGING]),
    ("11-M12 the belt-and-braces re-check of the hasher's own output is disconnected",
     SH,
     '  if ! why="$(scrypt_hash_error "$hash_out")"; then',
     '  if false; then',
     [PACKAGING]),
    ("11-M13 set-password's dry run hides the timestamped copy of the credentials it makes in /root",
     SH,
     '    backup_env\n    # ⚠ THE MODE, and it is `env_set`\'s own spelling',
     '    # ⚠ THE MODE, and it is `env_set`\'s own spelling',
     [PACKAGING]),
    ("11-M14 the credentials file is rewritten in place rather than renamed onto, so an interrupt truncates it",
     SH,
     '  mv -f "$TMP" "$ENV_FILE"\n  TMP=""',
     '  install -m 0600 "$TMP" "$ENV_FILE"\n  rm -f "$TMP"; TMP=""',
     [PACKAGING]),
    ("11-M15 a failed systemctl enable prints a green tick and systemd's reason is discarded",
     SH,
     '''    local enable_out enable_rc=0
    enable_out="$(systemctl enable "$UNIT_NAME" 2>&1)" || enable_rc=$?
    if (( enable_rc == 0 )); then
      ok "enabled $UNIT_NAME"
    else
      warn "systemctl enable exited ${enable_rc} — this unit will NOT start after a reboot:"
      printf '%s\\n' "$enable_out" | sed 's/^/      /'
    fi''',
     '''    systemctl enable "$UNIT_NAME" >/dev/null 2>&1 || warn "systemctl enable reported a problem"
    ok "enabled $UNIT_NAME"''',
     [PACKAGING]),
    ("11-M16 a journal this account cannot read is reported as a boot with no ordering cycle",
     SH,
     '''  if ! system_journal_readable; then
    warn "cannot read this boot's SYSTEM journal — an ordering cycle cannot be ruled out
     from here. Re-run as root, or add this account to 'adm'"
    return 2
  fi''',
     '  :',
     [PACKAGING]),
    ("11-M17 the condition vocabulary is loud only when it reads NOTHING, so a reformatted row drops a kind in silence",
     SH,
     '  (( got == want )) || die "read ${got} of ${want} condition kinds out of $f — the table\'s',
     '  (( got == want )) || warn "read ${got} of ${want} condition kinds out of $f — the table\'s',
     [PACKAGING]),
    ("11-M18 a subcommand is documented in the header and missing from the dispatch case",
     SH,
     '    set-password) cmd_set_password ;;\n',
     '',
     [PACKAGING]),

    # --------------------------- the six the sweep measured that had no PERMANENT mutation
    # ⚠ Added so the harness, and not a one-off script in a scratchpad, is the record.
    ("11-G21 the second-instance row never fires, which is the row 11-O1 was written to protect",
     SH,
     '  others="$(trim "$others")"',
     '  others=""',
     [PACKAGING]),
    ("11-G22 trap 2's runtime half: an ordering cycle that deleted a start job reads green",
     SH,
     '    1) row_fail "an ordering cycle deleted a start job on this boot" ;;',
     '    1) row_ok "an ordering cycle deleted a start job on this boot" ;;',
     [PACKAGING]),
    ("11-G23 a unit that is failed or inactive reads green",
     SH,
     '  else row_fail "the unit is ${state:-unknown}"; fi',
     '  else row_ok "the unit is ${state:-unknown}"; fi',
     [PACKAGING]),
    ("11-G24 the rule covering the dashboard's own port is assumed rather than read",
     SH,
     '  r8090="$(ufw_rule_for_port "$PORT")"',
     '  r8090="present"',
     [PACKAGING]),
    ("11-M19 the ordering-cycle detector finds a cycle and reports success",
     SH,
     """    printf '%s\\n' "$hits" | sed 's/^/      /'
    return 1""",
     """    printf '%s\\n' "$hits" | sed 's/^/      /'
    return 0""",
     [PACKAGING]),
    ("11-E5 a tab-indented value passes, and Docker keeps the tab as part of the secret",
     SH,
     """    ' '*|$'\\t'*) echo "has leading whitespace, which Docker keeps"; return 1 ;;""",
     """    ' '*) echo "has leading whitespace, which Docker keeps"; return 1 ;;""",
     [PACKAGING]),

    # ------------------------------------------------------------------ the --gpus fallback
    ("11-X1 the GPU flags are braced, so systemd passes '--gpus all' as a single argv docker rejects",
     UNIT,
     '    $GPU_FLAGS \\',
     '    ${GPU_FLAGS} \\',
     [PACKAGING]),
    ("11-X2 --gpus all goes back into ExecStart unconditionally, and a broken toolkit takes the whole dashboard down",
     UNIT,
     '    $GPU_FLAGS \\',
     '    --gpus all \\',
     [PACKAGING]),
    ("11-X3 the GPU probe starts a second container of this repository, which check's O22 row then counts",
     UNIT,
     "ExecStartPre=/bin/sh -c 'if nvidia-container-cli info >/dev/null 2>&1;",
     "ExecStartPre=/bin/sh -c 'if docker run --rm --gpus all ai-dashboard:latest true >/dev/null 2>&1;",
     [PACKAGING]),
    ("11-X4 the container's GPU mode is read from its environment rather than from its device requests",
     SH,
     """  dr="$(docker inspect "$CONTAINER" --format '{{json .HostConfig.DeviceRequests}}' 2>/dev/null)" \\""",
     """  dr="$(docker inspect "$CONTAINER" --format '{{json .Config.Env}}' 2>/dev/null)" \\""",
     [PACKAGING]),
    ("11-X5 a fallback that outlives its cause is ticked, and only the actionable state is lost",
     SH,
     '      fallback) row_fail "GPU mode: FALLBACK is in force — the container was started WITHOUT',
     '      fallback) row_ok "GPU mode: FALLBACK is in force — the container was started WITHOUT',
     [PACKAGING]),
    ("11-X6 the deps text goes back to promising that a broken toolkit stops the container starting",
     SH,
     '  warn "⚠ A driver upgrade that breaks the toolkit takes the GPU panels with it. It no"',
     '  warn "⚠ A driver upgrade takes the GPU panels, and the unit will not start\'"',
     [PACKAGING]),

    # ------------------------------------------------------------------------ ufw's matcher
    ("11-F1 the To column is read as $1 only, and three legal spellings of a port-22 rule go missing",
     SH,
     '''      first = 1
      if ($1 ~ /^\\[[0-9]*\\]?$/) { first = ($1 ~ /\\]$/) ? 2 : 3 }
      for (i = first; i <= NF; i++) {''',
     '''      first = 1
      if ($1 ~ /^\\[[0-9]*\\]?$/) { first = 2 }
      for (i = first; i <= first; i++) {''',
     [PACKAGING]),
    ("11-F2 an IPv6 blanket rule is accepted as covering an IPv4 SSH session",
     SH,
     '        if ($i == "Anywhere" && $(i + 1) == "(v6)") { continue }   # v6 blanket: see above',
     '        if (0) { continue }',
     [PACKAGING]),
    ("11-F3 the From column is searched too, so the /22 in the LAN range answers for port 22",
     SH,
     '        if ($i ~ /^(ALLOW|DENY|REJECT|LIMIT)$/) { break }   # the Action column ends "To"',
     '        if (0) { break }',
     [PACKAGING]),

    # ------------------------------------------------------------------- the twelve spaces
    ("11-W1 an entry padded with a non-breaking space is accepted, and this judge is LOOSER than the browser",
     SH,
     "    *$'\\xc2\\xa0'*|*$'\\xe1\\x9a\\x80'*|*$'\\xe2\\x80\\x80'*|*$'\\xe2\\x80\\x81'*|*$'\\xe2\\x80\\x82'*\\",
     "    *$'\\xe1\\x9a\\x80'*|*$'\\xe2\\x80\\x81'*|*$'\\xe2\\x80\\x82'*\\",
     [PACKAGING]),

    # ---------------------------------------------------------------- the image and the unit
    ("11-W2 the lockfile guarantee is dropped and the box resolves its own dependency versions",
     DOCKERFILE,
     'RUN corepack enable && pnpm install --frozen-lockfile',
     'RUN corepack enable && pnpm install',
     [PACKAGING]),
    ("11-W3 the runtime stage ships as development, with React's development build and no minification",
     DOCKERFILE,
     'ENV NODE_ENV=production \\',
     'ENV NODE_ENV=development \\',
     [PACKAGING]),
    ("11-W4 the build stage's copy is narrowed and whatever is not enumerated silently stops shipping",
     DOCKERFILE,
     '\nCOPY . .\n',
     '\nCOPY app lib components ./\n',
     [PACKAGING]),
    ("11-W5 a credentials file below the context root enters the build context",
     DOCKERIGNORE,
     '.env\n**/.env\n',
     '.env\n',
     [PACKAGING]),
    ("11-W6 the spec and the whole pipeline are uploaded to the docker daemon",
     DOCKERIGNORE,
     'pipeline\nSPEC.md',
     'SPEC.md',
     [PACKAGING]),
    ("11-W7 the container's name drifts from the one check, ExecStartPre and ExecStopPost all use",
     UNIT,
     'ExecStart=/usr/bin/docker run --rm --name ai-dashboard \\',
     'ExecStart=/usr/bin/docker run --rm --name ai-dashboard2 \\',
     [PACKAGING]),
    ("11-W8 the container reads the wrong env file, and every credential in it is the backup's",
     UNIT,
     '    -v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro \\',
     '    -v /etc/ai-dashboard.env.bak:/etc/ai-dashboard.env:ro \\',
     [PACKAGING]),
    ("11-W9 the SIGKILL cleanup is dropped, and a stale container becomes the second instance",
     UNIT,
     'ExecStopPost=-/usr/bin/docker rm -f ai-dashboard\n',
     '',
     [PACKAGING]),
    ("11-W10 systemctl status points its reader at the 0600 file carrying the password hash",
     UNIT,
     'Documentation=file:/etc/systemd/system/ai-dashboard.service',
     'Documentation=file:/etc/ai-dashboard.env',
     [PACKAGING]),

    # ==================================================================================
    # ⚠⚠ LOOP 11b, 2026-09-11 — the owner's three rulings after step 11
    # ==================================================================================
    #
    # 11-Q2: the two secrets leave the container's environment; /etc/ai-dashboard.env is
    #        MOUNTED and the server parses it, with a reader stricter than Docker's grammar.
    # 11-Q1: `Restart=always`, because a `docker stop` exits 0 and left the monitor down.
    # 11-Q3: `check` compares the whole flag set of the RUNNING container against the unit's
    #        own `docker run` line, with the expectation DERIVED from that line.

    ("11b-E5 the writer's strict rule accepts a backslash, which systemd reads as an escape",
     SH,
     '    *\\\\*)  echo "contains a backslash, which systemd and a sourcing shell both read as an escape"; return 1 ;;',
     '    *\\\\*)  : ;;',
     [PACKAGING]),
    ("11b-E6 the writer's strict rule accepts a '#', which several .env readers take as a comment",
     SH,
     '    *\'#\'*)  echo "contains a \'#\', which several .env readers take as a comment and Docker does not"; return 1 ;;',
     '    *\'#\'*)  : ;;',
     [PACKAGING]),
    ("11b-E7 the printable-ASCII range goes, so an invisible U+00A0 inside a secret is written and the server then refuses to start",
     SH,
     '  if [[ "$v" == *[!\\!-\\~]* ]]; then',
     '  if false; then',
     [PACKAGING]),
    ("11b-E8 the empty-value rule goes, and an empty PASSWORD_HASH is written as a configuration",
     SH,
     '  [[ -n "$v" ]] || { echo "is empty"; return 1; }',
     '  :',
     [PACKAGING]),
    ("11b-E9 env_set judges a SECRET by Docker's grammar alone, so it can write a file the server will not start on",
     SH,
     '    if ! why="$(secret_value_error "$value")"; then',
     '    if ! why="$(env_value_error "$value")"; then',
     [PACKAGING]),

    ("11b-G21 the credentials file is written 0600 again, which the container cannot read",
     SH,
     '  chmod 0640 "$TMP"\n  if is_root; then chown "root:$(container_gid)" "$TMP"; fi',
     '  chmod 0600 "$TMP"\n  if is_root; then chown root:root "$TMP"; fi',
     [PACKAGING]),
    ("11b-G23 the O20 row stops asking whether the SERVER can read the line at all",
     SH,
     '  if ! why="$(secret_value_error "$h")"; then',
     '  if false; then',
     [PACKAGING]),

    ("11b-K5 check_drift is dropped from cmd_check, and 11-Q3's whole comparison goes with it",
     SH,
     "  check_container\n  check_drift\n",
     "  check_container\n",
     [PACKAGING]),
    ("11b-D12 an unreadable docker inspect is reported as a container with no secrets in its Env",
     SH,
     '  if (( env_read != 0 )); then',
     '  if false; then',
     [PACKAGING]),
    ("11b-D6 check stops asserting the secrets are absent from docker inspect's Env",
     SH,
     '  if [[ -n "$leaked" ]]; then',
     '  if false; then',
     [PACKAGING]),
    ("11b-D7 the mounts are no longer compared, so a container started by hand with none passes",
     SH,
     '  drift_row "the mounts, source:target:ro and all" "$(trim "$want")" "$(trim "$got")"',
     '  :',
     [PACKAGING]),
    ("11b-D8 a published port — which bypasses ufw entirely — is no longer compared",
     SH,
     '  drift_row "published ports (§2.1: NONE — publishing bypasses ufw)" "$(trim "$want")" "$(trim "$got")"',
     '  :',
     [PACKAGING]),
    ("11b-D9 drift is reported as a tick, so every flag in the comparison reads green",
     SH,
     '    row_fail "${what} DRIFTED — the unit says [${want}] and the container has [${got}].',
     '    row_ok "${what} DRIFTED — the unit says [${want}] and the container has [${got}].',
     [PACKAGING]),
    ("11b-D10 the mount expectation is RETYPED here instead of derived from the unit — two producers of one list",
     SH,
     '  want="$(unit_flag_values "$cmd" -v --volume | tr \'\\n\' \' \')"',
     '  want="/:/host/root:ro /etc/hostname:/etc/hostname:ro /etc/llama-server:/etc/llama-server:ro /etc/ufw/ufw.conf:/etc/ufw/ufw.conf:ro /home:/host/home:ro /lib/modules:/lib/modules:ro /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro /sys:/sys:ro "',
     [PACKAGING]),
    ("11b-D11 the env-key comparison loses the pass-through exclusion, so an operator with nothing STANDING sees a false alarm",
     SH,
     '    [[ "$passthrough" == *" ${key} "* ]] && continue',
     '    :',
     [PACKAGING]),

    ("11b-U9 --env-file comes back, and both secrets are in docker inspect again",
     UNIT,
     "    -v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro \\\n",
     "    --env-file /etc/ai-dashboard.env \\\n",
     [PACKAGING]),
    ("11b-U10 the credentials mount loses its :ro, so the container can rewrite the hash it authenticates against",
     UNIT,
     "    -v /etc/ai-dashboard.env:/etc/ai-dashboard.env:ro \\\n",
     "    -v /etc/ai-dashboard.env:/etc/ai-dashboard.env \\\n",
     [PACKAGING]),
    ("11b-U11 -e STANDING becomes an assignment, so §6.4's list is baked into the unit instead of read from the file",
     UNIT,
     "    -e STANDING \\\n",
     "    -e STANDING= \\\n",
     [PACKAGING]),
    ("11b-U12 the STANDING probe cats the whole credentials file into a /run file",
     UNIT,
     'ExecStartPre=/bin/sh -c \'grep -E "^STANDING=" /etc/ai-dashboard.env | tail -n 1 >/run/ai-dashboard-standing.env || true\'',
     'ExecStartPre=/bin/sh -c \'cat /etc/ai-dashboard.env >/run/ai-dashboard-standing.env || true\'',
     [PACKAGING]),
    ("11b-U13 Restart=on-failure comes back, and a docker stop leaves the monitor down until someone notices",
     UNIT,
     "\nRestart=always\nRestartSec=10",
     "\nRestart=on-failure\nRestartSec=10",
     [PACKAGING]),
    ("11b-U15 a Docker restart policy is added beside systemd's, and the two fight for the container",
     UNIT,
     "    --read-only --tmpfs /tmp \\\n",
     "    --read-only --tmpfs /tmp --restart always \\\n",
     [PACKAGING]),

    ("11b-W5 a composition root goes back to process.env, and the mount becomes decoration",
     AUTHZ_SRC,
     "  get env(): Environment {\n    return credentialEnvironment();\n  },",
     "  env: process.env,",
     [PACKAGING]),

    # ---- the drift rows that could not be READ, and one mutation per read ----------------
    # ⚠ 11-A11 for the SECOND time in this function. Two of the six rows have an EMPTY
    # expectation by design — the unit carries no --restart and publishes no port — so an
    # unreadable `docker inspect` compared "" with "" and printed a TICK. Measured 2026-09-11.
    ("11b-D13 a drift row nobody could read prints a tick instead of row_unknown — 11-A11 again",
     SH,
     '  row_unknown "${1}: \'docker inspect\' could not answer for ${CONTAINER}, so this row was not',
     '  row_ok "${1}: \'docker inspect\' could not answer for ${CONTAINER}, so this row was not',
     [PACKAGING]),
    ("11b-D14 the published-ports row stops judging its own read, and an unreadable inspect ticks again",
     SH,
     '  if ! got="$(container_field \'{{range $p, $v := .HostConfig.PortBindings}}{{println $p}}{{end}}\')"; then',
     '  if ! got="$(container_field \'{{range $p, $v := .HostConfig.PortBindings}}{{println $p}}{{end}}\')" && false; then',
     [PACKAGING]),
    ("11b-D15 the restart-policy row stops judging its own read — the other EMPTY expectation",
     SH,
     '  if ! got="$(container_field \'{{.HostConfig.RestartPolicy.Name}}\')"; then',
     '  if ! got="$(container_field \'{{.HostConfig.RestartPolicy.Name}}\')" && false; then',
     [PACKAGING]),
    ("11b-D16 the image's own ENV read is no longer judged, so a failed read reports drift on a correct box",
     SH,
     '  if ! image_env_raw="$(docker image inspect',
     '  if false && ! image_env_raw="$(docker image inspect',
     [PACKAGING]),

    # ---- check and the server must agree on the FILE, not only on one value ---------------
    ("11b-E10 check stops noticing a DUPLICATE key, which Docker resolves silently and the server refuses to start on",
     SH,
     '    if [[ "$seen" == *" ${key} "* ]]; then',
     '    if false; then',
     [PACKAGING]),
    ("11b-E11 the NUL row goes, and a byte bash cannot hold reads back as a clean printable secret",
     SH,
     '  if (( ${total:-0} != ${nulless:-0} )); then',
     '  if false; then',
     [PACKAGING]),
    ("11b-E12 check refuses an INDENTED comment again, on a file Docker and the server both accept",
     SH,
     '    case "$stripped" in \'\'|\'#\'*) continue ;; esac',
     '    case "$line" in \'\'|\'#\'*) continue ;; esac',
     [PACKAGING]),
    ("11b-E13 the 64 KiB line bound goes from check, and a file docker run refuses outright ticks",
     SH,
     '    if (( ${#line} >= MAX_ENV_LINE_BYTES )); then',
     '    if false; then',
     [PACKAGING]),
    ("11b-E15 the bash half of the 64 KiB bound drifts from the reader's, and the two judges disagree on the same file",
     SH,
     "MAX_ENV_LINE_BYTES=65536",
     "MAX_ENV_LINE_BYTES=131072",
     [PACKAGING]),
    # ---- ⚠⚠ 11b-A1/11b-A2: the three whole-file rules the reader had and `check` did not,
    # plus the fourth a GENERATED corpus of 276 files found. 21 of those files were a green
    # `check` and a container that refuses to start; a 21-row hand-written list was green while
    # every one of them was true.
    ("11b-E16 the whole-file CR rule goes, and one Windows-pasted COMMENT is a green check and a container that will not boot",
     SH,
     '  if grep -q $\'\\r\' "$ENV_FILE"; then',
     '  if false; then',
     [PACKAGING]),
    ("11b-E17 the whole-file BOM rule goes, and a BOM in a comment or a non-secret value ticks",
     SH,
     '  if grep -q $\'\\xef\\xbb\\xbf\' "$ENV_FILE"; then',
     '  if false; then',
     [PACKAGING]),
    ("11b-E18 the UTF-8 validity rule goes, and one latin-1 comment is a green check the container refuses",
     SH,
     '  if ! file_is_utf8 "$ENV_FILE"; then',
     '  if false; then',
     [PACKAGING]),
    ("11b-E19 the 64 KiB bound moves back BELOW the comment/blank skip, so a 70 KiB comment is never measured",
     SH,
     '    if (( ${#line} >= MAX_ENV_LINE_BYTES )); then',
     '    case "${line#"${line%%$ENV_INDENT_RUN}"}" in \'\'|\'#\'*) continue ;; esac\n'
     '    if (( ${#line} >= MAX_ENV_LINE_BYTES )); then',
     [PACKAGING]),
    ("11b-E20 the DIRECTORY row goes — the shape docker creates for a missing bind-mount source",
     SH,
     '  if [[ -d "$ENV_FILE" ]]; then',
     '  if false; then',
     [PACKAGING]),
    ("11b-E21 env_readable goes back to -r alone, which is TRUE for a readable directory",
     SH,
     'env_readable() { [[ -f "$ENV_FILE" && -r "$ENV_FILE" ]]; }',
     'env_readable() { [[ -r "$ENV_FILE" ]]; }',
     [PACKAGING]),
    ("11b-E22 configure stops repairing the mode, and an upgrading box keeps the 0600 the container cannot read",
     SH,
     '  env_repair_mode\n\n  if ! env_has PASSWORD_HASH; then',
     '  if ! env_has PASSWORD_HASH; then',
     [PACKAGING]),
    ("11b-E23 env_set stops saying the running container still holds the OLD inode",
     SH,
     '  if unit_installed && [[ -n "$(container_ids)" ]]; then\n'
     '    warn "the running container still has the OLD $ENV_FILE open.',
     '  if false; then\n'
     '    warn "the running container still has the OLD $ENV_FILE open.',
     [PACKAGING]),
    ("11b-E24 set-password's dry run announces the OLD mode again — the one that denies every login",
     SH,
     '    info "would write PASSWORD_HASH=<the hash, not printed> to $ENV_FILE (0640 root:$(container_gid))"',
     '    info "would write PASSWORD_HASH=<the hash, not printed> to $ENV_FILE (0600 root:root)"',
     [PACKAGING]),
    ("11b-E25 the printed-key bound goes back to the SECRET FLOOR, so a minimum-length secret can be printed whole",
     SH,
     '      if (( ${#key} < MIN_SECRET_CHARS )) && [[ "$key" != *[!\\!-\\~]* ]]; then',
     '      if (( ${#key} <= MIN_SECRET_CHARS )) && [[ "$key" != *[!\\!-\\~]* ]]; then',
     [PACKAGING]),
    ("11b-N6 the TypeScript half of the printed-key bound goes back to the floor, and the two spellings diverge",
     SECRETFILE_SRC,
     'export const MAX_NAMED_KEY_CHARS = MIN_SESSION_SECRET_CHARS - 1;',
     'export const MAX_NAMED_KEY_CHARS = MIN_SESSION_SECRET_CHARS;',
     [PACKAGING]),

    # ---- ⚠⚠ 11b-A6 / 11b-A8: two units, and six of fourteen flags --------------------------
    ("11b-U1 the container's uid comes from the REPO's unit again, not the one systemd runs",
     SH,
     '  for f in "$UNIT_PATH" "$SRC/$UNIT_SRC_REL"; do',
     '  for f in "$SRC/$UNIT_SRC_REL" "$UNIT_PATH"; do',
     [PACKAGING]),
    ("11b-U2 the installed unit is no longer compared with the repo's, so a hand-edited one is invisible",
     SH,
     '  elif [[ "$installed_exec" == "$repo_exec" ]]; then',
     '  elif true; then',
     [PACKAGING]),
    ("11b-D17 the --read-only drift row stops comparing, and a writable root filesystem passes",
     SH,
     '    drift_row "--read-only (§2.5: nothing writable but the tmpfs)" "$want" "$got"',
     '    row_ok "--read-only (§2.5: nothing writable but the tmpfs) matches the unit"',
     [PACKAGING]),
    ("11b-D18 the --user drift row stops comparing, and the uid the file mode hangs on is unchecked",
     SH,
     '    drift_row "--user (the uid the mode of $ENV_FILE is derived from)" "$want" "$got"',
     '    row_ok "--user matches the unit"',
     [PACKAGING]),
    ("11b-D19 the --tmpfs read stops being judged — another expectation that can look EMPTY",
     SH,
     '  if ! got="$(container_field \'{{range $p, $v := .HostConfig.Tmpfs}}{{println $p}}{{end}}\')"; then',
     '  if ! got="$(container_field \'{{range $p, $v := .HostConfig.Tmpfs}}{{println $p}}{{end}}\')" && false; then',
     [PACKAGING]),

    ("11b-E14 the bad-key row prints the key whatever it is, and a wrapped value in key position reaches the terminal",
     SH,
     '      if (( ${#key} < MIN_SECRET_CHARS )) && [[ "$key" != *[!\\!-\\~]* ]]; then',
     '      if true; then',
     [PACKAGING]),

    # ---- the two spellings of one rule, drifting in ways a 22-value table could not see ---
    # ⚠ Both of these kept the WHOLE suite green on 2026-09-11, before the cross-check corpus
    # was generated rather than listed. The first is a one-code-point boundary; the second is
    # the ORDER the rules fire in, which `secretValueError`'s own header calls part of the
    # contract and which only a value carrying BOTH characters can expose.
    ("11b-S17 the printable range's upper bound moves ONE code point in TypeScript only, so DEL is legal there and not in bash",
     SECRETFILE_SRC,
     "    if (cp < 0x21 || cp > 0x7e) {",
     "    if (cp < 0x21 || cp > 0x7f) {",
     [PACKAGING]),
    ("11b-S18 the backslash rule and the '#' rule swap places in TypeScript only, so one value gets two different reasons",
     SECRETFILE_SRC,
     "  if (value.includes('\\\\')) {\n    return 'contains a backslash, which systemd and a sourcing shell both read as an escape';\n  }\n  if (value.includes('#')) {\n    return \"contains a '#', which several .env readers take as a comment and Docker does not\";\n  }\n",
     "  if (value.includes('#')) {\n    return \"contains a '#', which several .env readers take as a comment and Docker does not\";\n  }\n  if (value.includes('\\\\')) {\n    return 'contains a backslash, which systemd and a sourcing shell both read as an escape';\n  }\n",
     [PACKAGING]),
]


# ---------------------------------------------------------------------------
# ⚠ Mutation ids must be unique. Added 2026-09-07, after NINE duplicates were found
#    across three harnesses — every one of them pre-existing and invisible.
# ---------------------------------------------------------------------------
#
# HANDOVER §1 has warned about this since step 8 and the warning was never enforced, which is
# the whole lesson: a rule that is written down and not checked is a rule that has already been
# broken somewhere you have not looked. A duplicate is not a crash — it makes the
# `DID NOT BITE` and `ANCHORS MOVED` lists ambiguous about WHICH entry failed, so the one
# output that matters when something is wrong is the output that stops being readable.
def _assert_unique_ids() -> None:
    seen: dict[str, int] = {}
    for entry in REGRESSIONS:
        eid = entry[0].split()[0]
        seen[eid] = seen.get(eid, 0) + 1
    dupes = sorted(k for k, n in seen.items() if n > 1)
    if dupes:
        raise SystemExit(f"!!! duplicate mutation ids, which make the failure lists ambiguous: {', '.join(dupes)}")


_assert_unique_ids()


def main() -> int:
    os.chdir(ROOT)
    bad = []
    moved = []
    ambiguous = []
    covered = set()
    for entry in REGRESSIONS:
        if len(entry) == 5:
            name, src, old, new, check = entry
            pairs = [(old, new)]
        else:
            name, src, pairs, check = entry
        checks = check if isinstance(check, list) else [check]
        path = pathlib.Path(src)
        original = path.read_text()
        mutated = original
        missing = [old for old, _ in pairs if old not in mutated]
        if missing:
            print(f"--- {name}\n    ANCHOR NOT FOUND in {src} — the implementation moved")
            moved.append(name)
            continue
        # ⚠ Q1 reconciliation, 2026-09-07 (adversarial F6). An anchor that matches TWICE is a
        # third finding, and the most dangerous of the three because it does not look like one:
        # `str.replace(old, new, 1)` silently takes the FIRST site, so the mutation still
        # applies, a test still reddens, the ledger still goes green — and the property being
        # certified is no longer the one the mutation's name records. Reorder the two sites and
        # the mutation moves with no diff anywhere. Found on step 8's `U6`, whose name says
        # "both hidden-tab guards" while one of two identical guard sites was left standing.
        doubled = [(old, mutated.count(old)) for old, _ in pairs if mutated.count(old) > 1]
        if doubled:
            print(f"--- {name}\n    ANCHOR AMBIGUOUS in {src} — matches {doubled[0][1]}×; "
                  f"replace(…, 1) would take whichever comes first. Pin it to one site")
            ambiguous.append(name)
            continue
        for old, new in pairs:
            mutated = mutated.replace(old, new, 1)
        path.write_text(mutated)
        try:
            if checks == ["types"]:
                cmd = ["pnpm", "typecheck"]
            else:
                cmd = ["pnpm", "vitest", "run", *checks]
            run = subprocess.run(cmd, capture_output=True, text=True)
        finally:
            path.write_text(original)
        out = run.stdout + run.stderr
        if checks == ["types"]:
            tally = next(
                (l.strip() for l in out.splitlines() if ".ts(" in l and "error TS" in l), "?"
            )[:150]
        else:
            tally = next(
                (l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")), "?"
            )
        fails = red_test_lines(out)
        covered.update(fails)
        print(f"--- {name}\n    exit={run.returncode}  {tally}  red={len(fails)}")
        for f in fails[:3]:
            print("     ", f[:150])
        if run.returncode == 0:
            bad.append(name)

    # ⚠ HANDOVER §1: `ANCHOR NOT FOUND` and `DID NOT BITE` are different findings with
    # different first hypotheses — one means the implementation moved and the mutation needs
    # re-aiming, the other means the mutation applied and no test noticed. This summary used
    # to print both under "DID NOT BITE", which is the more alarming of the two labels and
    # sends a reader hunting for a missing test that is not missing. Found 2026-09-07, when
    # an edit to `cooling.ts` moved `T31`'s anchor and the run reported it as inert.
    if ambiguous:
        print("\nANCHORS AMBIGUOUS — pin these to one site, they did not run:", ", ".join(ambiguous))
    if moved:
        print("\nANCHORS MOVED — re-aim these, they did not run:", ", ".join(moved))
    if bad:
        print("\nDID NOT BITE:", ", ".join(bad))
    if moved or bad or ambiguous:
        return 1

    # ------------------------------------------------------------------ the ledger
    marked = marked_tests()
    if UNMATCHABLE:
        print(
            "\nUNMATCHABLE LEDGER KEYS — these ⚠ names cannot be matched against a FAIL line,\n"
            "so the ledger's verdict on them means nothing. Move the %-placeholder later:"
        )
        for rel, nm, prefix in UNMATCHABLE:
            print(f"  {rel}\n    {nm}\n    ledger key {prefix!r} ({len(prefix)} chars)")
        return 1
    joined = "\n".join(covered)
    uncovered = [(rel, nm) for rel, nm, prefix in marked if prefix not in joined]
    print(
        f"\nRed-test ledger: {len(covered)} distinct failing tests across "
        f"{len(REGRESSIONS)} mutations; {len(marked)} ⚠-marked tests checked."
    )
    if uncovered:
        print("\nNO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:")
        for rel, nm in uncovered:
            print(f"  {rel}\n    {nm}")
        return 1
    print("Every ⚠-marked test went red under at least one mutation.")

    print(f"\nAll {len(REGRESSIONS)} regressions failed their check, as they must.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
