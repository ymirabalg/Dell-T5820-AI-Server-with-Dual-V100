#!/usr/bin/env python3
"""Step 5's deliberate regressions — evidence that the serving/storage/safety tests bite.

Same harness as steps 2, 3 and 4, including step 4's per-mutation **red-test ledger**. Each
entry replaces one exact string in one source file with a plausible *wrong* implementation —
the wrong thing someone would actually write, not a syntax error — runs the affected check,
and restores the file. **Every one must exit 1.**

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Vitest's ``typecheck`` block only covers ``*.test-d.ts``,
  so a loosened type shows up only under ``tsc``.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs re-aiming;
it does not mean the test is fine.

⚠ HANDOVER §5's rule is honoured throughout: **no mutation anchors on the comparison it
means to weaken.** Where a guard has two sides there are two mutations — one per direction —
because a single mutation of ``x < N`` can only prove that *a* guard is there, never that it
points the right way. ``MIN_PORT``/``MAX_PORT`` and the body cap are the worked examples.

Run from ``dashboard/`` with pnpm on PATH:

    export PATH="$HOME/.local/bin:$PATH"
    python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

WIRE = "lib/collectors/dbus-wire.test.ts"
DBUS = "lib/collectors/dbus.test.ts"
LLAMA = "lib/collectors/llama.test.ts"
HTTP = "lib/collectors/http.test.ts"
SERVING = "lib/collectors/serving.test.ts"
STORAGE = "lib/collectors/storage.test.ts"
SAFETY = "lib/collectors/safety.test.ts"
COLLECT = "lib/collectors/collect.test.ts"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied verbatim from step 4; only
#    LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# Four consecutive steps shipped a test that NAMES a property it does not check — step 2's
# five inert mutations, step 3's `nvidia-smi` column guard, step 3's `S47c`, and step 4's
# "neither function can see the other's answer", whose body asserted *arity* and passed
# under the exact biconditional §3.7 forbids. The fixture-symmetry rule (HANDOVER §5) came
# out of the third of those. This is the fourth-generation rule, and it subsumes them:
#
#     Every ⚠-marked test must appear in at least one mutation's RED set.
#
# The harness already runs each mutation and reads vitest's output. It now records *which
# test names went red*, unions those sets across every mutation, and fails if a test
# carrying the project's ⚠ marker never appears. A test that no mutation can distinguish is
# a test that cannot fail for any wrong implementation anyone was willing to write.
#
# ⚠ What this CANNOT catch, and the limit is irreducible: a test that goes red for the
# WRONG reason. Step 4 found two by hand — one red because the file failed to compile,
# another because `TS6196` noticed an orphaned import — and a ledger scores both as
# covered. Mechanise the necessary condition; keep reading each test against its own name
# for the sufficient one.
#
# ⚠ A failure here is NOT "add a mutation until it goes green". The first hypothesis is
# that the test is inert and should be given a body that matches its name, or renamed to
# what it actually checks. The second is that the property has no plausible wrong
# implementation, in which case drop the ⚠ rather than the standard.

GUARDRAILS = "lib/guardrails.test.ts"
IO = "lib/collectors/io.test.ts"

# ⚠ `io.test.ts` joined the ledger in step 5's reconciliation, because step 5 added ⚠ tests
# to it (R1: `nodeIo.run`'s unvalidated bound) and **nothing else ledgers that file** —
# step 3's harness predates the mechanism and step 4's `LEDGER_FILES` does not list it. Its
# three pre-existing ⚠ tests therefore get re-aimed copies of step 3's mutations below; that
# is duplication bought for real coverage, which is a different case from `deadline.test.ts`,
# where step 4's ledger already covered them and copying would have been waste.
#
# ⚠ `guardrails.test.ts` is deliberately NOT here: **step 4's `LEDGER_FILES` already
# includes it**, so the two ⚠ guardrails tests step 5 added (the `setTimeout` source-text
# rule and its companion) are covered by mutations added to step 4's harness, exactly as
# step 5's build added one there for the `deadline.test.ts` test it wrote.
LEDGER_FILES = [WIRE, DBUS, LLAMA, HTTP, SERVING, STORAGE, SAFETY, IO]

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


def marked_tests():
    """Every ⚠-marked test name, as (file, name, matchable-prefix) triples."""
    found = []
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


WIRE_SRC = "lib/collectors/dbus-wire.ts"
DBUS_SRC = "lib/collectors/dbus.ts"
# ⚠ New in step 8: the two unit names moved here so the client can build §6.4's condition
# ids without importing `node:net`. See the note at F15.
UNITS_SRC = "lib/units.ts"
LLAMA_SRC = "lib/collectors/llama.ts"
HTTP_SRC = "lib/collectors/http.ts"
SERVING_SRC = "lib/collectors/serving.ts"
STATVFS_SRC = "lib/collectors/statvfs.ts"
STORAGE_SRC = "lib/collectors/storage.ts"
CHECKS_SRC = "lib/collectors/safety-checks.ts"
SAFETY_SRC = "lib/collectors/safety.ts"
COLLECT_SRC = "lib/collectors/collect.ts"
FIXTURES_SRC = "lib/fixtures.ts"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ================================================== the wire format (§2.2)
    # The one the LIVE BUS found. Every local test agreed with the bug.
    ("05-W1 the SIGNATURE header field is marshalled as a STRING — the bug systemd caught",
     WIRE_SRC,
     "  else if (sig === 'g') w.signature(value as string);\n",
     "",
     [WIRE, DBUS]),
    ("05-W2 the decoder ignores the peer's endianness byte and assumes little-endian",
     WIRE_SRC,
     "  const le = endian === DBUS_LITTLE_ENDIAN;",
     "  const le = true;",
     WIRE),
    ("05-W3 a VARIANT decodes to its own type name instead of the value inside it",
     WIRE_SRC,
     "      case 'v':\n        return this.basic(this.signature());",
     "      case 'v':\n        return this.signature();",
     [WIRE, DBUS, SERVING, SAFETY]),
    ("05-W4 an unsupported type is skipped instead of reported — the reader desynchronises",
     WIRE_SRC,
     "      default:\n        throw new Malformed(`unsupported D-Bus type \\`${sig}\\``);",
     "      default:\n        return null;",
     WIRE),
    ("05-W5 `incomplete` is collapsed into `malformed` — every partial read becomes an error",
     WIRE_SRC,
     "  if (bytes.length < byteLength) return { kind: 'incomplete' };",
     "  if (bytes.length < byteLength) return { kind: 'malformed', problem: 'short message' };",
     [WIRE, DBUS]),
    ("05-W6 the body is read without the header array's 8-byte padding",
     WIRE_SRC,
     "  const bodyStart = alignUp(DBUS_HEADER_BYTES + fieldsLength, 8);",
     "  const bodyStart = DBUS_HEADER_BYTES + fieldsLength;",
     [WIRE, DBUS]),
    ("05-W7 a STRING's NUL terminator is counted as part of the value",
     WIRE_SRC,
     "    this.pos += length + 1; // + the NUL terminator, which is not part of the value",
     "    this.pos += length;",
     [WIRE, DBUS]),
    ("05-W8 ERROR_NAME is not read, so NoSuchUnit is indistinguishable from any other failure",
     WIRE_SRC,
     "      else if (code === DBUS_HEADER_FIELD.errorName && typeof value === 'string') errorName = value;\n",
     "",
     [WIRE, DBUS]),
    ("05-W9 REPLY_SERIAL is taken from the message's OWN serial — signals become replies",
     WIRE_SRC,
     "      if (code === DBUS_HEADER_FIELD.replySerial && typeof value === 'number') replySerial = value;",
     "      replySerial = serial;\n      if (code === DBUS_HEADER_FIELD.replySerial && typeof value === 'number') replySerial = value;",
     WIRE),
    ("05-W10 the EXTERNAL identity is sent as a decimal uid rather than hex",
     WIRE_SRC,
     "export const authExternalLine = (uid: number): string => `AUTH EXTERNAL ${hexAscii(String(uid))}\\r\\n`;",
     "export const authExternalLine = (uid: number): string => `AUTH EXTERNAL ${String(uid)}\\r\\n`;",
     WIRE),
    ("05-W11 anything that is not REJECTED counts as a successful handshake",
     WIRE_SRC,
     "  if (said.startsWith('OK')) return 'ok';",
     "  if (!said.startsWith('REJECTED')) return 'ok';",
     WIRE),
    ("05-W12 NO_REPLY_EXPECTED is set, so a lost call is indistinguishable from a silent one",
     WIRE_SRC,
     "  message.byte(0); // flags — see the doc comment",
     "  message.byte(1);",
     WIRE),
    ("05-W13 the body is written without padding to an 8-byte boundary",
     WIRE_SRC,
     "  message.raw(fieldBytes);\n  message.align(8);\n  message.raw(bodyBytes);",
     "  message.raw(fieldBytes);\n  message.raw(bodyBytes);",
     [WIRE, DBUS]),
    ("05-W14 a STRING's length is counted in characters rather than UTF-8 bytes",
     WIRE_SRC,
     "    const bytes = ENCODER.encode(value);\n    this.uint32(bytes.length);",
     "    const bytes = ENCODER.encode(value);\n    this.uint32(value.length);",
     WIRE),

    # ================================================== the systemd client (§3.4, §3.6)
    ("05-D1 ActiveState is CAST rather than validated — §3.7's vocabulary stops being closed",
     DBUS_SRC,
     "  text === null ? null : (UNIT_STATES.find((s) => s === text) ?? null);",
     "  text === null ? null : (text as UnitState);",
     DBUS),
    # ⚠ D2 was INVERTED by step 5's reconciliation. It used to mutate `inactive` INTO the
    # tree; §3.7 now says `inactive` is correct, so the plausible wrong implementation is
    # the build's original — report `null` and hide a service that is not running.
    ("05-D2 a unit systemd never loaded is `null`, so SAFETY renders an UNCOLOURED em dash",
     DBUS_SRC,
     "            states.set(unit, NO_SUCH_UNIT_STATE);\n",
     "",
     [DBUS, SERVING]),
    # ⚠ Re-aimed 2026-09-08 (10b-S-G build): the per-unit `problems.push(…)` accumulation
    # became `errors.push(...tag('dbus', […], instance))` so a per-unit entry can carry the
    # instance the caller's `unitInstances` map names. Same property, same mutation — an
    # entry filed with no message at all — over the new shape.
    ("05-D2b the NoSuchUnit state is minted with no entry — an alarm nothing explains",
     DBUS_SRC,
     """            errors.push(
              ...tag(
                'dbus',
                [
                  `${unit}: ${NO_SUCH_UNIT_ERROR}: ${detail} — systemd has no record of this unit, ` +
                    `which for a unit this box's own configuration declares is \\`${NO_SUCH_UNIT_STATE}\\``,
                ],
                instance,
              ),
            );
""",
     "",
     DBUS),
    ("05-D2c NoSuchUnit maps to `failed`, a different alarm about a different cause",
     DBUS_SRC,
     "export const NO_SUCH_UNIT_STATE: UnitState = 'inactive';",
     "export const NO_SUCH_UNIT_STATE: UnitState = 'failed';",
     [DBUS, SERVING]),
    ("05-D3 the client takes the NEXT message as its reply instead of matching the serial",
     DBUS_SRC,
     "      const message = await this.message();\n      if (message.replySerial === serial) return message;",
     "      const message = await this.message();\n      void serial;\n      return message;",
     [DBUS, SERVING, SAFETY]),
    ("05-D4 a malformed frame is retried as though more bytes would help — a hang, not an error",
     DBUS_SRC,
     """      if (decoded.kind === 'malformed') {
        throw new Error(`the system bus sent something that is not a D-Bus message: ${decoded.problem}`);
      }
""",
     "",
     DBUS),
    ("05-D5 only successfully read units are keys, so `not asked` and `unknown` merge",
     DBUS_SRC,
     "const allUnknown = (units: readonly string[]): Map<string, UnitState | null> =>\n  new Map(units.map((unit) => [unit, null]));",
     "const allUnknown = (units: readonly string[]): Map<string, UnitState | null> => {\n  void units;\n  return new Map();\n};",
     DBUS),
    ("05-D6 an unreachable bus files one entry PER UNIT instead of one for the bus",
     DBUS_SRC,
     "    return { states, errors: tag('dbus', [`${socket}: ${reason(e)}`]) };",
     "    return { states, errors: tag('dbus', units.map((unit) => `${unit}: ${socket}: ${reason(e)}`)) };",
     [DBUS, SERVING]),
    ("05-D7 the conversation is unbounded — O17's failure, on a per-request route",
     DBUS_SRC,
     "    const chunk = await this.within(() => this.stream.next());",
     "    const chunk = await this.stream.next();",
     DBUS),
    ("05-D8 an empty unit list still opens a connection",
     DBUS_SRC,
     "  if (units.length === 0) return { states, errors: [] };\n",
     "",
     [DBUS, SERVING]),
    ("05-D9 GetUnit becomes LoadUnit — what `systemctl show` calls, and it MUTATES the box",
     DBUS_SRC,
     "          'GetUnit',",
     "          'LoadUnit',",
     DBUS),
    ("05-D10 a different property is read, so the panel shows SubState as ActiveState",
     DBUS_SRC,
     "export const ACTIVE_STATE_PROPERTY = 'ActiveState';",
     "export const ACTIVE_STATE_PROPERTY = 'SubState';",
     DBUS),
    ("05-D11 the connection is never closed",
     DBUS_SRC,
     "  } finally {\n    stream.close();\n  }",
     "  }",
     DBUS),

    # ================================================== §3.4's pure parsers
    ("05-L1 a non-canonical filename is accepted, so `01.env` and `1.env` share one subject",
     LLAMA_SRC,
     "  return String(value) === stem ? value : null;",
     "  return value;",
     LLAMA),
    ("05-L2 instances sort lexically, so a tenth card lands between 0 and 1",
     LLAMA_SRC,
     "  return { value: [...found].sort((a, b) => a - b), problems };",
     "  return { value: [...found].sort(), problems };",
     LLAMA),
    ("05-L3 discovery caps at the two cards this box has today — §3.4 forbids exactly this",
     LLAMA_SRC,
     "  for (const entry of entries) {\n    if (!entry.endsWith(LLAMA_ENV_SUFFIX)) continue;",
     "  for (const entry of entries.slice(0, 2)) {\n    if (!entry.endsWith(LLAMA_ENV_SUFFIX)) continue;",
     [LLAMA, SERVING]),
    ("05-L4 a missing PORT=/CTX= is silent — the em dash arrives with nothing explaining it",
     LLAMA_SRC,
     "  if (parseText(raw) === null) {\n    problems.push(`no \\`${key}=\\` assignment`);\n    return null;\n  }",
     "  if (parseText(raw) === null) {\n    return null;\n  }",
     [LLAMA, SERVING]),
    ("05-L5 an out-of-range value carries an errors[] entry — §6.7 says it must not",
     LLAMA_SRC,
     "  // Out of range: §6.7 — `null`, and deliberately no entry.\n  return value >= low && value <= high ? value : null;",
     "  if (value < low || value > high) {\n    problems.push(`\\`${key}=${String(value)}\\` is out of range`);\n    return null;\n  }\n  return value;",
     LLAMA),
    ("05-L6 the port range's LOW side is off by one, so PORT=0 becomes a port",
     LLAMA_SRC, "export const MIN_PORT = 1;", "export const MIN_PORT = 0;", LLAMA),
    ("05-L7 the port range's HIGH side is off by one, so PORT=65536 becomes a port",
     LLAMA_SRC, "export const MAX_PORT = 65535;", "export const MAX_PORT = 65536;", LLAMA),
    ("05-L8 CTX=0 is accepted as a context length",
     LLAMA_SRC,
     "  const ctxValue = numericField(found, 'CTX', 1, Number.MAX_SAFE_INTEGER, problems);",
     "  const ctxValue = numericField(found, 'CTX', 0, Number.MAX_SAFE_INTEGER, problems);",
     LLAMA),
    ("05-L9 env values are parsed as decimals, so a fractional port is accepted",
     LLAMA_SRC,
     "import { lines, parseIntegerStrict, parseText } from './numbers';",
     "import { lines, parseDecimalStrict as parseIntegerStrict, parseText } from './numbers';",
     LLAMA),
    ("05-L10 ALIAS is read from the env file instead of from /v1/models",
     LLAMA_SRC,
     "    value: { port: portValue === null ? null : port(portValue), ctx: ctxValue === null ? null : tokens(ctxValue) },",
     "    value: {\n      port: portValue === null ? null : port(portValue),\n      ctx: ctxValue === null ? null : tokens(ctxValue),\n      model: found.get('ALIAS') ?? null,\n    } as LlamaEnv,",
     LLAMA),
    ("05-L11 a 503 carries an errors[] entry, so a restart files one every poll",
     LLAMA_SRC,
     "  if (status === 503) return clean<HealthState>('unhealthy');",
     "  if (status === 503) return { value: 'unhealthy', problems: ['answered HTTP 503'] };",
     [LLAMA, SERVING]),
    ("05-L12 an answered non-200 is reported as `unreachable` — an alarm about a live process",
     LLAMA_SRC,
     "  return { value: 'unhealthy', problems: [`answered HTTP ${String(status)}`] };",
     "  return { value: 'unreachable', problems: [`answered HTTP ${String(status)}`] };",
     [LLAMA, SERVING]),
    ("05-L13 any 2xx/3xx counts as `ok`, so a redirect reads as a healthy server",
     LLAMA_SRC,
     "  if (status === 200) return clean<HealthState>('ok');",
     "  if (status >= 200 && status < 400) return clean<HealthState>('ok');",
     LLAMA),
    ("05-L14 the model falls back to `models[].name`, so one source of truth becomes two",
     LLAMA_SRC,
     [("  const data = (parsed as { readonly data?: unknown }).data;",
       "  const data =\n    (parsed as { readonly data?: unknown }).data ?? (parsed as { readonly models?: unknown }).models;"),
      ("  const rawId: unknown = (first as { readonly id?: unknown }).id;",
       "  const rawId: unknown =\n    (first as { readonly id?: unknown }).id ?? (first as { readonly name?: unknown }).name;")],
     LLAMA),
    ("05-L15 a multi-model instance is shown as one model with nothing said about the rest",
     LLAMA_SRC,
     "  if (data.length > 1) problems.push(`\\`data\\` lists ${String(data.length)} models; showing the first`);\n",
     "",
     LLAMA),
    ("05-L16 JSON.parse is unguarded, so a stranger on the port throws out of a pure parser",
     LLAMA_SRC,
     "  let parsed: unknown;\n  try {\n    parsed = JSON.parse(text);\n  } catch (e) {\n    return { value: null, problems: [`not JSON: ${e instanceof Error ? e.message : 'parse failed'}`] };\n  }",
     "  const parsed: unknown = JSON.parse(text);",
     LLAMA),
    ("05-L17 a body with no `data` is silently empty rather than reported",
     LLAMA_SRC,
     "  if (!Array.isArray(data)) return { value: null, problems: ['no `data` array'] };",
     "  if (!Array.isArray(data)) return { value: null, problems: [] };",
     LLAMA),
    ("05-L18 the probe host stops being a literal loopback address",
     LLAMA_SRC,
     "export const LLAMA_PROBE_HOST = '127.0.0.1';",
     "export const LLAMA_PROBE_HOST = 'localhost';",
     [LLAMA, SERVING]),
    ("05-L19 the FIRST assignment wins, so the file disagrees with the running process",
     LLAMA_SRC, "    found.set(key, value);", "    if (!found.has(key)) found.set(key, value);", LLAMA),
    ("05-L20 a non-string JSON id is handed to parseText, which calls .trim() on it",
     LLAMA_SRC,
     "  const id = typeof rawId === 'string' ? parseText(rawId) : null;",
     "  const id = parseText(rawId as string | undefined);",
     LLAMA),

    # ================================================== the HTTP probe
    ("05-H1 redirects are followed, so another server's answer is shown as this instance's",
     HTTP_SRC,
     "        (res) => {\n          const chunks: Buffer[] = [];",
     """        (res) => {
          const location = res.headers.location;
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && location !== undefined) {
            res.resume();
            finish(() => {
              resolve(nodeHttp.get(location, timeoutMs));
            });
            return;
          }
          const chunks: Buffer[] = [];""",
     HTTP),
    ("05-H2 the bound is the socket's inactivity timer, which a silent peer never trips",
     HTTP_SRC,
     "      timer = setTimeout(() => {\n        req.destroy();\n        finish(() => {\n          reject(new Error(`timed out after ${bound} ms`));\n        });\n      }, bound);",
     "      req.setTimeout(bound);",
     HTTP),
    # ⚠ F2 / R1 — the two seam bounds that were never validated. `setTimeout` clamps an
    # out-of-range delay to 1 ms, so `timeoutMs: Infinity` became the TIGHTEST bound: measured,
    # `health: 'unreachable'` (§6.3's ALARM) on a server answering in 5 ms. One mutation per
    # `setTimeout` delay, so the ledger stops being silent about either site.
    ("05-H8 the HTTP bound skips boundedTimeoutMs — Infinity becomes setTimeout's 1 ms",
     HTTP_SRC,
     "      }, bound);",
     "      }, timeoutMs);",
     [HTTP, "lib/guardrails.test.ts"]),
    ("05-H10 the seam prefixes the URL again, so every entry names it twice",
     HTTP_SRC,
     "          reject(new Error(`timed out after ${bound} ms`));",
     "          reject(new Error(`${url}: timed out after ${bound} ms`));",
     HTTP),
    ("05-H3 a non-2xx rejects, so `unhealthy` becomes `unreachable` and an alarm",
     HTTP_SRC,
     "          res.on('end', () => {\n            finish(() => {\n              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });\n            });\n          });",
     "          res.on('end', () => {\n            finish(() => {\n              const status = res.statusCode ?? 0;\n              if (status >= 400) reject(new Error(`${url}: HTTP ${String(status)}`));\n              else resolve({ status, body: Buffer.concat(chunks).toString('utf8') });\n            });\n          });",
     HTTP),
    ("05-H4 the body cap is `>=`, so a body exactly at the limit is rejected",
     HTTP_SRC,
     "            if (size > HTTP_MAX_BODY_BYTES) {",
     "            if (size >= HTTP_MAX_BODY_BYTES) {",
     HTTP),
    ("05-H5 a 5xx is retried inside one poll — §6.7 owns retry, as backoff BETWEEN polls",
     HTTP_SRC,
     [("      let settled = false;", "      let settled = false;\n      let retried = false;"),
      ("          res.on('end', () => {\n            finish(() => {\n              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });\n            });\n          });",
       """          res.on('end', () => {
            const status = res.statusCode ?? 0;
            if (status >= 500 && !retried) {
              retried = true;
              void nodeHttp.get(url, timeoutMs).then(
                (answer) => {
                  finish(() => {
                    resolve(answer);
                  });
                },
                () => {
                  finish(() => {
                    resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
                  });
                },
              );
              return;
            }
            finish(() => {
              resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
            });
          });""")],
     HTTP),
    ("05-H6 an Authorization header is sent to endpoints that need none",
     HTTP_SRC,
     "        { method: 'GET', agent: false, headers: { accept: 'application/json', connection: 'close' } },",
     "        {\n          method: 'GET',\n          agent: false,\n          headers: { accept: 'application/json', connection: 'close', authorization: 'Bearer llama' },\n        },",
     HTTP),
    ("05-H7 the rejection is re-wrapped, losing the errno §3.7 needs off `error.code`",
     HTTP_SRC,
     "      req.on('error', (e: Error) => {\n        finish(() => {\n          reject(e);\n        });\n      });",
     "      req.on('error', (e: Error) => {\n        finish(() => {\n          reject(new Error(`${url}: ${e.message}`));\n        });\n      });",
     HTTP),

    # ================================================== §3.5 disk
    ("05-S1 the divisor becomes 10^9, so no figure matches the `df -h` §6.6 says to check against",
     STATVFS_SRC, "export const BYTES_PER_GIB = 1024 ** 3;", "export const BYTES_PER_GIB = 1000 ** 3;", STORAGE),
    ("05-S2 `used` is computed from the free blocks rather than the used ones",
     STATVFS_SRC,
     "  const usedGiB: GiB = gib(((total - bfree) * bsize) / BYTES_PER_GIB);",
     "  const usedGiB: GiB = gib((bfree * bsize) / BYTES_PER_GIB);",
     STORAGE),
    ("05-S3 a zero block size passes, and a 931 GiB volume renders `0.0 / 0.0 GiB`",
     STATVFS_SRC, "  if (bsize === 0 || total === 0) {", "  if (total === 0) {", STORAGE),
    ("05-S4 more free blocks than total blocks is accepted, and `used` goes negative",
     STATVFS_SRC, "  if (bfree > total) {", "  if (bfree > total * 2) {", STORAGE),
    ("05-S5 the sanity check becomes `not NaN`, so negatives and fractions pass",
     STATVFS_SRC,
     "const sane = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;",
     "const sane = (value: number): boolean => !Number.isNaN(value);",
     STORAGE),
    ("05-S6 the unreadable filesystem is zeros rather than nulls — invariant 1, inverted",
     STATVFS_SRC,
     "export const NO_FILESYSTEM: Filesystem = { usedGiB: null, totalGiB: null };",
     "export const NO_FILESYSTEM: Filesystem = { usedGiB: gib(0), totalGiB: gib(0) };",
     STORAGE),
    ("05-S7 statvfs measures `/` and `/home` — the CONTAINER's overlay, not the host's disks",
     COLLECT_SRC,
     "  rootMount: '/host/root',\n  homeMount: '/host/home',",
     "  rootMount: '/',\n  homeMount: '/home',",
     [STORAGE, COLLECT]),
    ("05-S8 both filesystems share one errors[] entry, so one row's em dash is unexplained",
     STORAGE_SRC,
     "    errors: [...root.errors, ...home.errors],",
     "    errors: [...root.errors, ...home.errors].slice(0, 1),",
     STORAGE),
    # ⚠ R2 — the flattened shape typechecked and shipped `errors` onto the wire through a
    # spread. Both mutations restore it; both are caught by `tsc`, because the check is a
    # `@ts-expect-error` and an UNUSED one is itself a compile error.
    # ⚠ Two entries, one shape. The `types` half proves `tsc` catches it (which is where the
    # `@ts-expect-error` lives); the vitest half is what puts a RED TEST NAME in the ledger,
    # because a `types` mutation contributes no failing-test lines and could therefore never
    # cover a ⚠ test.
    ("05-S11 StorageCollection is flattened again, so `{ ...collectStorage(), net }` compiles",
     STORAGE_SRC,
     "  return {\n    filesystems: { root: root.value, home: home.value },",
     "  return {\n    root: root.value,\n    home: home.value,",
     "types"),
    ("05-S11b …and the assembled Storage then carries the collector's `errors` onto the wire",
     STORAGE_SRC,
     "  return {\n    filesystems: { root: root.value, home: home.value },",
     "  return {\n    filesystems: { root: root.value, home: home.value, errors: [] } as never,",
     STORAGE),
    ("05-S9 statvfs is unbounded — a device in D state hangs the telemetry route",
     STORAGE_SRC,
     "    blocks = await within(() => statvfs.statvfs(path));",
     "    blocks = await statvfs.statvfs(path);",
     STORAGE),
    ("05-S10 one failed mount short-circuits the other, losing a reading that was available",
     STORAGE_SRC,
     "  const [root, home] = await Promise.all([\n    measure(statvfs, within, paths.rootMount),\n    measure(statvfs, within, paths.homeMount),\n  ]);",
     "  const root = await measure(statvfs, within, paths.rootMount);\n  const home =\n    root.errors.length > 0\n      ? { value: NO_FILESYSTEM, errors: [] }\n      : await measure(statvfs, within, paths.homeMount);",
     STORAGE),

    # ================================================== §3.6 safety
    ("05-F1 a missing ENABLED= reads as `no` — an alarm invented from silence",
     CHECKS_SRC,
     "  if (raw === null) return { value: null, problems: [`no \\`${UFW_ENABLED_KEY}=\\` assignment`] };",
     "  if (raw === null) return { value: false, problems: [`no \\`${UFW_ENABLED_KEY}=\\` assignment`] };",
     SAFETY),
    ("05-F2 an unrecognised ENABLED= value reads as `no`",
     CHECKS_SRC,
     "  return { value: null, problems: [`\\`${UFW_ENABLED_KEY}=${raw}\\` is neither \\`yes\\` nor \\`no\\``] };",
     "  return { value: false, problems: [`\\`${UFW_ENABLED_KEY}=${raw}\\` is neither \\`yes\\` nor \\`no\\``] };",
     SAFETY),
    ("05-F3 the ufw key is matched as a prefix, so ENABLED_FOO= is read as ENABLED=",
     CHECKS_SRC,
     "    if (!trimmed.startsWith(`${UFW_ENABLED_KEY}=`)) continue;",
     "    if (!trimmed.startsWith(UFW_ENABLED_KEY)) continue;",
     SAFETY),
    ("05-F5 the DKMS module prefix is loosened to `dell`",
     CHECKS_SRC,
     "export const DKMS_MODULE_PREFIX = 'dell-smm-hwmon.ko';",
     "export const DKMS_MODULE_PREFIX = 'dell';",
     SAFETY),
    ("05-F6 the DKMS check is an exact match, so the compressed module stops counting",
     CHECKS_SRC,
     "  entries.some((entry) => entry.startsWith(DKMS_MODULE_PREFIX));",
     "  entries.some((entry) => entry === DKMS_MODULE_PREFIX);",
     SAFETY),
    ("05-F18 the DKMS check asks whether ANY module was built, not whether ours was",
     CHECKS_SRC,
     "  entries.some((entry) => entry.startsWith(DKMS_MODULE_PREFIX));",
     "  entries.some((entry) => entry.includes('.ko'));",
     SAFETY),
    ("05-F7 an unlistable /lib/modules is the ALARM — a step-11 mount typo raises it",
     SAFETY_SRC,
     "    kernels = await within(() => io.readDir(libModules));\n  } catch (e) {\n    return { value: null, errors: tag('dkms', [`${libModules}: ${reason(e)}`]) };",
     "    kernels = await within(() => io.readDir(libModules));\n  } catch (e) {\n    return { value: false, errors: tag('dkms', [`${libModules}: ${reason(e)}`]) };",
     SAFETY),
    ("05-F8 the running kernel's own directory is never checked for",
     SAFETY_SRC, "  if (!kernels.includes(release)) {", "  if (kernels.length === 0) {", SAFETY),
    ("05-F9 a missing updates/dkms is `unknown` — §3.6's documented alarm never fires",
     SAFETY_SRC,
     "    if (errnoCodeOf(e) === ENOENT) {\n      return {\n        value: false,",
     "    if (errnoCodeOf(e) === ENOENT) {\n      return {\n        value: null,",
     SAFETY),
    ("05-F10 ANY error on updates/dkms is the alarm, so an EACCES claims DKMS failed",
     SAFETY_SRC, "    if (errnoCodeOf(e) === ENOENT) {", "    if (errnoCodeOf(e) !== null) {", SAFETY),
    ("05-F12 an unreadable ufw.conf reads as `not enforcing` — the panel's worst inversion",
     SAFETY_SRC,
     "    return { value: null, errors: tag('ufw', [`${path}: ${reason(e)}`]) };",
     "    return { value: false, errors: tag('ufw', [`${path}: ${reason(e)}`]) };",
     SAFETY),
    ("05-F13 fanServiceState collapses to active/inactive, losing `failed` (§3.7 forbids it)",
     SAFETY_SRC,
     "    fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,",
     "    fanServiceState: (units.states.get(FAN_SERVICE_UNIT) === 'active'\n      ? 'active'\n      : 'inactive') as Safety['fanServiceState'],",
     SAFETY),
    ("05-F14 the ufw check shells out to `ufw status`, which §2.2 forbids and needs root",
     SAFETY_SRC,
     "    text = await within(() => io.readFile(path));",
     "    text = await within(() => io.run('ufw', ['status'], 2000));",
     SAFETY),
    # ⚠ RE-AIMED in step 8. `FAN_SERVICE_UNIT` and `servingUnitName` moved out of
    # `lib/collectors/dbus.ts` into `lib/units.ts` — §6.4's condition ids are built in the
    # BROWSER, and `dbus.ts`'s first import is `node:net`. `dbus.ts` re-exports both, so every
    # import path here is unchanged and only this anchor moved. Step 8's harness has its own
    # mutation at the new site, checked against its own tests; this one stays because it is
    # what proves step 5's D-Bus and SAFETY tests still bite on the name.
    ("05-F15 the fan service unit name loses its `.service` suffix",
     UNITS_SRC,
     "export const FAN_SERVICE_UNIT = 'gpu-fan-control.service';",
     "export const FAN_SERVICE_UNIT = 'gpu-fan-control';",
     [SAFETY, DBUS]),
    ("05-F16 a failed D-Bus read blanks the two FILE checks, which answered perfectly well",
     SAFETY_SRC,
     "  return {\n    checks: {\n      ufwEnforcing: ufw.value,",
     "  const busFailed = units.errors.length > 0;\n  return {\n    checks: {\n      ufwEnforcing: busFailed ? null : ufw.value,",
     SAFETY),
    ("05-F19 SafetyCollection is flattened again, so `{ ...collectSafety(), pwm5Present }` compiles",
     SAFETY_SRC,
     "  return {\n    checks: {\n      ufwEnforcing: ufw.value,\n      dkmsForRunningKernel: dkms.value,\n      fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,\n    },",
     "  return {\n    ufwEnforcing: ufw.value,\n    dkmsForRunningKernel: dkms.value,\n    fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,",
     "types"),
    ("05-F19b …and the assembled Safety then carries the collector's `errors` onto the wire",
     SAFETY_SRC,
     "      fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,\n    },",
     "      fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,\n      errors: [],\n    } as never,",
     SAFETY),
    # ⚠ F6 — the doc claimed the shell grammar and the code implemented a stricter subset.
    # The narrowing is the doc's; adding the leniency it promised is the plausible wrong fix,
    # and it turns four hand-edited spellings into §6.3's ALARM.
    ("05-F20 ufw values are unquoted like systemd's, widening a grammar the doc no longer claims",
     CHECKS_SRC,
     "    raw = parseText(trimmed.slice(UFW_ENABLED_KEY.length + 1));",
     "    raw = parseText(trimmed.slice(UFW_ENABLED_KEY.length + 1).replace(/^[\'\"]|[\'\"]$/g, ''));",
     SAFETY),
    ("05-F17 collectSafety asks about more units than the one O9 gives it",
     SAFETY_SRC,
     "    collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT], timeoutMs }),",
     "    collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT, 'llama-server@0.service'], timeoutMs }),",
     SAFETY),
    # ⚠ 10b-S-G, added in TEST phase: `collectSafety`'s omission of `unitInstances` was
    # enforced only by the author reading `safety.ts` — nothing failed if a future edit
    # passed one. `gpu-fan-control.service` has no instance, so a caller that mapped it to
    # one anyway would be WRONG, not merely absent. This mutation is the wrong edit that
    # omission is meant to prevent.
    ("10b-SF1 collectSafety attaches an instance to gpu-fan-control.service, which has none",
     SAFETY_SRC,
     "    collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT], timeoutMs }),",
     "    collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT], unitInstances: new Map([[FAN_SERVICE_UNIT, 0]]), timeoutMs }),",
     SAFETY),

    # ================================================== §3.4's wrapper
    ("05-V1 a directory that will not list becomes an EMPTY instance list, not `null`",
     SERVING_SRC,
     "    return { serving: null, errors: tag('llama-env', [`${dir}: ${reason(e)}`]) };",
     "    return { serving: [], errors: tag('llama-env', [`${dir}: ${reason(e)}`]) };",
     SERVING),
    # ⚠ 10b-S-G, added in the RECONCILIATION (adversarial A4). The build's "4 of 18 sources may
    # carry an `instance`" enumeration lives in a document; the type cannot express it, `tag()`'s
    # third parameter is on the SHARED minting helper, and `wire.ts` validates `source` and
    # `instance` independently. `collectSafety`'s side was closed by `10b-SF1`; these two are the
    # `llama-env` directory-level paths, whose entries are facts about the DIRECTORY. Each
    # mutation is the plausible wrong edit — "helpfully" attaching the instance in scope.
    ("10b-SG1 the readDir failure entry names instance 0, putting a directory-level fact on a row",
     SERVING_SRC,
     "    return { serving: null, errors: tag('llama-env', [`${dir}: ${reason(e)}`]) };",
     "    return { serving: null, errors: tag('llama-env', [`${dir}: ${reason(e)}`], 0) };",
     SERVING),
    ("10b-SG2 a malformed-filename problem is stamped with the first discovered instance",
     SERVING_SRC,
     "  const errors: TelemetryError[] = [...tag('llama-env', found.problems.map((p) => `${dir}: ${p}`))];",
     "  const errors: TelemetryError[] = [...tag('llama-env', found.problems.map((p) => `${dir}: ${p}`), found.value[0])];",
     SERVING),
    ("05-V2 an instance with no port is reported `unreachable` rather than NOT PROBED",
     SERVING_SRC,
     "  if (env.port === null) return NOT_PROBED;",
     "  if (env.port === null) return { health: 'unreachable', model: null, errors: [] };",
     SERVING),
    ("05-V3 /v1/models is probed even when /health did not answer 200",
     SERVING_SRC,
     "  if (state.value !== 'ok') return { health: state.value, model: null, errors: healthErrors };\n",
     "",
     SERVING),
    ("05-V4 a refused /health is filed against `llama-models`",
     SERVING_SRC,
     "      errors: tag('llama-health', [probeFailure(health, e)]),",
     "      errors: tag('llama-models', [probeFailure(health, e)]),",
     SERVING),
    ("05-V5 a failed /v1/models is filed against `llama-health`, blaming a working server",
     SERVING_SRC,
     "      errors: [...healthErrors, ...tag('llama-models', [probeFailure(models, e)])],",
     "      errors: [...healthErrors, ...tag('llama-health', [probeFailure(models, e)])],",
     SERVING),
    ("05-V6 unitState is taken positionally instead of by §6.4's derived join key",
     SERVING_SRC,
     "    unitState: units.states.get(servingUnitName(instance)) ?? null,",
     "    unitState: [...units.states.values()][0] ?? null,",
     SERVING),
    # ⚠ Re-aimed 2026-09-08 (10b-S-G build): the call grew a `unitInstances` argument (the
    # structural map `collectUnitStates` needs to attach `instance` to a per-unit `dbus`
    # entry). Same property under test — O9's single read must not widen to a second unit.
    ("05-V7 collectServing also reads gpu-fan-control — O9's single read becomes two",
     SERVING_SRC,
     "    collectUnitStates({\n      dbus,\n      paths,\n      units: instances.map(servingUnitName),\n      unitInstances,\n      timeoutMs: dbusTimeoutMs,\n    }),",
     "    collectUnitStates({\n      dbus,\n      paths,\n      units: [...instances.map(servingUnitName), 'gpu-fan-control.service'],\n      unitInstances,\n      timeoutMs: dbusTimeoutMs,\n    }),",
     SERVING),
    ("05-V8 env problems are filed against `llama-health`",
     SERVING_SRC,
     "  return { env: parsed.value, errors: tag('llama-env', parsed.problems.map((p) => `${path}: ${p}`)) };",
     "  return { env: parsed.value, errors: tag('llama-health', parsed.problems.map((p) => `${path}: ${p}`)) };",
     SERVING),
    ("05-V9 a 503 from /v1/models is parsed as a model list",
     SERVING_SRC, "  if (modelsStatus !== 200) {", "  if (modelsStatus !== 200 && modelsStatus !== 503) {", SERVING),
    ("05-V11 a second endpoint is probed — /props, which §13 of the decisions excludes",
     SERVING_SRC,
     "  const models = modelsUrl(env.port);",
     "  const models = `http://127.0.0.1:${String(env.port)}/props`;",
     SERVING),
    ("05-V12 the HTTP probes are unbounded",
     SERVING_SRC,
     "    status = (await within(() => http.get(health, timeoutMs))).status;",
     "    status = (await http.get(health, timeoutMs)).status;",
     SERVING),
    ("05-V13 a directory that lists no instances becomes `serving: null`",
     SERVING_SRC,
     "  const instances = found.value;",
     "  const instances = found.value;\n  if (instances.length === 0) return { serving: null, errors };",
     SERVING),
    ("05-V14 discovery problems are dropped, so an ignored .env file is never reported",
     SERVING_SRC,
     "  const errors: TelemetryError[] = [...tag('llama-env', found.problems.map((p) => `${dir}: ${p}`))];",
     "  const errors: TelemetryError[] = [];",
     SERVING),
    ("05-V15 a model-list parse problem is filed against `llama-health`",
     SERVING_SRC,
     "    errors: [...healthErrors, ...tag('llama-models', parsed.problems.map((p) => `${models}: ${p}`))],",
     "    errors: [...healthErrors, ...tag('llama-health', parsed.problems.map((p) => `${models}: ${p}`))],",
     SERVING),
    ("05-V17 the probe failure keeps only the prose, losing the errno §6.5 needs",
     SERVING_SRC,
     "  const code = errnoCodeOf(e);\n  return code === null ? `${url}: ${reason(e)}` : `${url}: ${code}: ${reason(e)}`;",
     "  return `${url}: ${reason(e)}`;",
     SERVING),
    ("05-V18 the env file is read by shelling out to `cat` — §2.2 forbids a subprocess here",
     SERVING_SRC,
     "    text = await within(() => io.readFile(path));",
     "    text = await within(() => io.run('cat', [path], 2000));",
     SERVING),
    ("05-V16 an unreadable env file is filed under a source from a different collector",
     SERVING_SRC,
     "    return { env: NO_LLAMA_ENV, errors: tag('llama-env', [`${path}: ${reason(e)}`]) };",
     "    return { env: NO_LLAMA_ENV, errors: tag('dell-smm', [`${path}: ${reason(e)}`]) };",
     SERVING),

    # ======================== ⚠ F1 — the budget must never be evidence about a subject
    # `collectServing` shipped ONE budget across the listing, every env read and every HTTP
    # probe, and `probe`'s catch mapped the shared deadline's own rejection to
    # `health: 'unreachable'` — §6.3's ALARM on a healthy instance. §6.7 now forbids it in
    # as many words. Two mutations, because the shape has two ways of going wrong.
    ("05-V19 the probe budget is opened once for the collector, so a slow discovery alarms both instances",
     SERVING_SRC,
     [("  const discovery = deadline(discoveryTimeoutMs, SERVING_DISCOVERY_TIMEOUT_MS);",
       "  const discovery = deadline(discoveryTimeoutMs, SERVING_DISCOVERY_TIMEOUT_MS);\n"
       "  const shared = deadline(probeTimeoutMs, SERVING_PROBE_TIMEOUT_MS);"),
      ("        const probed = await probe(http, deadline(probeBudget, SERVING_PROBE_TIMEOUT_MS), env, probeBudget);",
       "        const probed = await probe(http, shared, env, probeBudget);")],
     SERVING),
    ("05-V20 the probes spend the DISCOVERY budget, so a slow listing blames the servers",
     SERVING_SRC,
     "        const probed = await probe(http, deadline(probeBudget, SERVING_PROBE_TIMEOUT_MS), env, probeBudget);",
     "        const probed = await probe(http, discovery, env, probeBudget);",
     SERVING),
    ("05-V21 the per-instance HTTP bound skips boundedTimeoutMs, so NaN reaches the seam",
     SERVING_SRC,
     "  const probeBudget = boundedTimeoutMs(probeTimeoutMs, SERVING_PROBE_TIMEOUT_MS);",
     "  const probeBudget = probeTimeoutMs;",
     SERVING),
    ("05-V22 the HTTP bound is taken from the DISCOVERY option — R5's overloading, restored",
     SERVING_SRC,
     "  const probeBudget = boundedTimeoutMs(probeTimeoutMs, SERVING_PROBE_TIMEOUT_MS);",
     "  const probeBudget = boundedTimeoutMs(discoveryTimeoutMs, SERVING_PROBE_TIMEOUT_MS);",
     SERVING),
    # R5's measured symptom: `DBUS_TIMEOUT_MS`'s doc argued at length for 2 s while
    # `collectServing` handed the conversation 4 s, so the constant was live only as a
    # fallback and the doc described a bound nothing used.
    ("05-V23 the D-Bus conversation is given the PROBE budget, so DBUS_TIMEOUT_MS is only a fallback",
     SERVING_SRC,
     "  dbusTimeoutMs = DBUS_TIMEOUT_MS,",
     "  dbusTimeoutMs = SERVING_PROBE_TIMEOUT_MS,",
     SERVING),

    # ============================ ⚠ R1 — the OTHER unvalidated seam bound (step 3's)
    ("05-I1 the nvidia-smi bound skips boundedTimeoutMs — Infinity becomes setTimeout's 1 ms",
     "lib/collectors/io.ts",
     "      }, bound);",
     "      }, timeoutMs);",
     ["lib/collectors/io.test.ts", "lib/guardrails.test.ts"]),

    ("05-I2 nodeIo.run goes back to execFile's own `timeout:` — inert against a child that ignores SIGTERM",
     "lib/collectors/io.ts",
     [("        { encoding: 'utf8', windowsHide: true, signal: ac.signal, killSignal: 'SIGKILL' },",
       "        { encoding: 'utf8', windowsHide: true, timeout: bound },"),
      ("        ac.abort();\n        child.stdout?.destroy();\n        child.stderr?.destroy();\n        child.unref();\n        finish(() => {\n          reject(expired());\n        });",
       "        ac.abort();\n        void expired;")],
     IO),
    ("05-I5 the timeout message loses the command, so the entry does not say WHAT timed out",
     "lib/collectors/io.ts",
     "    const expired = (): Error => new Error(`${command}: timed out after ${bound} ms`);",
     "    const expired = (): Error => new Error(`timed out after ${bound} ms`);",
     IO),
    ("05-I3 the pipes are left held, so a descendant holding stdout is never bounded",
     "lib/collectors/io.ts",
     "        child.stdout?.destroy();\n        child.stderr?.destroy();\n",
     "",
     IO),
    # ⚠ No mutation for `child.unref()` alone, and it is a recorded gap rather than an
    # oversight: its property is "the PROCESS exits sooner" (9021 ms → 649 ms, measured in
    # step 3), which nothing inside that process can assert. Step 3's harness does not mutate
    # it in isolation either — it only appears inside larger anchors. I2 and I3 cover the
    # three ⚠ tests in this file; see `reconciliation.md`.

    # ============================ ⚠ R3 — the seam that abandoned its handle
    ("05-D12 the connect timer is never cleared, so it destroys a LIVE socket mid-conversation",
     DBUS_SRC,
     "        clearTimeout(timer);\n        outcome();\n      };\n      const timer = setTimeout(() => {",
     "        outcome();\n      };\n      const timer = setTimeout(() => {",
     DBUS),
    ("05-D13 the connect bound skips boundedTimeoutMs, so Infinity clamps to 1 ms",
     DBUS_SRC,
     "      const bound = boundedTimeoutMs(timeoutMs, DBUS_TIMEOUT_MS);",
     "      const bound = timeoutMs;",
     [DBUS, "lib/guardrails.test.ts"]),
    # ⚠ There is NO mutation for `socket.destroy()` inside the connect timer, and that is a
    # recorded gap rather than an oversight. Reaching it needs a unix connect that BLOCKS,
    # which no test in this process can produce: Node's `net.Server` accepts eagerly, a
    # missing path is `ENOENT` and an unlistened path `ECONNREFUSED`, both immediate. D10
    # covers the reachable half — the timer must not fire on a live socket. See
    # `reconciliation.md`.

    # ============================ ⚠ F3 — the decoder had no length ceiling
    # 16 bytes of rubbish burned the whole budget and the entry said "timed out" about a peer
    # that answered in 1 ms — verbatim the failure the incomplete/malformed split exists to
    # prevent. Three mutations: each ceiling, and the ORDERING that makes them meaningful.
    ("05-W15 the message ceiling is gone, so a four-billion-byte lie is `incomplete` forever",
     WIRE_SRC,
     """  if (byteLength > DBUS_MAX_MESSAGE_BYTES) {
    return {
      kind: 'malformed',
      problem: `message claims ${String(byteLength)} bytes, above D-Bus's ${String(DBUS_MAX_MESSAGE_BYTES)}`,
    };
  }
""",
     "",
     [WIRE, DBUS]),
    ("05-W16 the header-field ceiling is gone",
     WIRE_SRC,
     """  if (fieldsLength > DBUS_MAX_FIELDS_BYTES) {
    return {
      kind: 'malformed',
      problem: `header field array claims ${String(fieldsLength)} bytes, above D-Bus's ${String(DBUS_MAX_FIELDS_BYTES)}`,
    };
  }
""",
     "",
     WIRE),
    ("05-W17 the ceiling is checked AFTER the incomplete test, so an over-long claim still waits",
     WIRE_SRC,
     "  if (fieldsLength > DBUS_MAX_FIELDS_BYTES) {",
     "  if (bytes.length < byteLength) return { kind: 'incomplete' };\n  if (fieldsLength > DBUS_MAX_FIELDS_BYTES) {",
     [WIRE, DBUS]),
    ("05-W18 the ceiling is `>=`, rejecting a message of exactly the size D-Bus permits",
     WIRE_SRC,
     "  if (byteLength > DBUS_MAX_MESSAGE_BYTES) {",
     "  if (byteLength >= DBUS_MAX_MESSAGE_BYTES) {",
     WIRE),

    # ============================ ⚠ F11 — two different problems, one message
    ("05-L21 a `data` list whose first entry is junk is reported as an EMPTY list",
     LLAMA_SRC,
     "    problems.push(data.length === 0 ? '`data` is empty' : '`data[0]` is not an object');",
     "    problems.push('`data` is empty');",
     LLAMA),

    # ============================ the shared deadline (a step-4 module, fixed in step 5)
    # ⚠ `deadline.test.ts` stays in STEP 4's ledger — its other ⚠ tests are covered by step
    # 4's harness and duplicating them here would be waste. This one mutation exists
    # because step 5 added the latch, and behaviour added without a mutation that can
    # redden its test is exactly what the ledger exists to prevent.
    ("05-Y1 the spent budget is re-derived from the clock alone — an early timer leaves a sliver",
     "lib/collectors/deadline.ts",
     "    if (spent || left <= 0) {\n      spent = true;\n      return Promise.reject(overdue());\n    }",
     "    if (left <= 0) return Promise.reject(overdue());",
     "lib/collectors/deadline.test.ts"),

    # ================================================== the shared fixtures
    ("05-X1 servingPopulated stops carrying servingInstances, so later steps render a fiction",
     FIXTURES_SRC,
     "  serving: servingInstances,",
     "  serving: [servingInstances[0] ?? servingIdentityOnly],",
     SERVING),

    # ====================================================================== type-level
    # ⚠ Not written as a cast: `x as T` always type-checks, so a cast mutation can never
    # fail `tsc` and would be an inert entry in this harness. Assign the invented value.
    ("05-T1 a seventh HealthState is invented, escaping §3.7's closed vocabulary",
     SERVING_SRC,
     "    health: probed.health,",
     "    health: 'degraded',",
     "types"),
    ("05-T2 the port is minted from Number() rather than parsed and branded",
     LLAMA_SRC,
     "    value: { port: portValue === null ? null : port(portValue), ctx: ctxValue === null ? null : tokens(ctxValue) },",
     "    value: { port: Number(found.get('PORT')), ctx: ctxValue === null ? null : tokens(ctxValue) },",
     "types"),
    ("05-T3 Filesystem loses the GiB brand, so an unbranded byte count could be assigned to it",
     STATVFS_SRC, "  const totalGiB: GiB = gib((total * bsize) / BYTES_PER_GIB);",
     "  const totalGiB: number = (total * bsize) / BYTES_PER_GIB;", "types"),
    ("05-T4 the fan service state escapes §3.7's closed UnitState vocabulary",
     SAFETY_SRC,
     "    fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,",
     "    fanServiceState: 'running',",
     "types"),
    ("05-T5 ufwEnforcing is stringified, and the contract's boolean|null stops being enforced",
     SAFETY_SRC, "    ufwEnforcing: ufw.value,", "    ufwEnforcing: `${String(ufw.value)}`,", "types"),
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
