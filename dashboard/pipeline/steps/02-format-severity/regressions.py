#!/usr/bin/env python3
"""Step 2's deliberate regressions — evidence that the tests bite.

Each entry breaks the implementation in one specific way, runs the affected check, and
restores the file. Every one must exit 1.

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Type-level guarantees (brands, closed vocabularies).
  Vitest's ``typecheck`` block only covers ``*.test-d.ts``, so a loosened brand shows up
  as an **unused** ``@ts-expect-error`` in a ``.test.ts`` and only ``tsc`` sees it.

⚠ **One mutation was written, measured and dropped** (2026-09-07, the time-of-day item),
per HANDOVER §5.2 rule 1 — "the property has no plausible wrong implementation, in which
case drop the ⚠ rather than the standard", here in its mutation-side form. Weakening
``hour: '2-digit'`` to ``hour: 'numeric'`` in ``lib/format.ts``'s ``TIME_OF_DAY_OPTIONS``
is an **equivalent** mutation, not a wrong one: under ``hourCycle: 'h23'`` ICU resolves the
hour field to ``2-digit`` whatever was asked for — measured on Node 24.16.0, all four
``hour``/``minute`` width combinations render ``04:07:03`` and ``resolvedOptions().hour``
comes back ``"2-digit"``. No test can separate the two implementations because there is no
behavioural difference to see, so ``DID NOT BITE`` there was the harness being right. The
zero-padding is still asserted (``04:07:03``); what is *not* claimed anywhere is that the
explicit width is what produces it.

Run from ``dashboard/`` with pnpm on PATH:

    export PATH="$HOME/.local/bin:$PATH"
    python3 pipeline/steps/02-format-severity/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger — retrofitted in step 8's reconciliation
# ---------------------------------------------------------------------------
#
# Steps 4-8 carry this; steps 2 and 3 predate it, and step 8 added ⚠ marks to
# `lib/conditions.ts` and `lib/format.ts` (§9's stale-versus-retired, §9's worst-severity
# dedupe, §6.4's gap rule, §6.6's negative age). A ⚠ mark is a claim that some plausible wrong
# implementation reddens the test; a claim nobody checks is the exact defect this whole device
# exists to catch, so the device comes with the marks.
#
#     Every ⚠-marked test must appear in at least one mutation's RED set.
#
# ⚠ A failure here is NOT "add a mutation until it goes green". The first hypothesis is that
# the test is inert and should be given a body matching its name; the second is that the
# property has no plausible wrong implementation, in which case drop the ⚠ rather than the
# standard.
#
# ⚠ `types`-kind mutations contribute no red-test lines, so they can never cover a ⚠ test.
# ⚠ `lib/conditions.test.ts` is deliberately NOT here. Step 4's harness already carries it in
# its own LEDGER_FILES, and a ⚠ mark with two owners is a mark neither owner has to back —
# so the conditions mutations for §9's stale-versus-retired, §9's worst-severity dedupe and
# §6.4's gap rule live in step 4's harness, beside the ones already there.
LEDGER_FILES = ["lib/format.test.ts", "lib/severity.test.ts"]

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

# (name, source file, exact text to replace, replacement, check)
#   check is a test file to run, or the literal "types" to run `pnpm typecheck`.
REGRESSIONS = [
    # ---------------------------------------------------------------- §6.6 formatters
    ("02-R1 formatters treat 0 as absent (falsy check)", "lib/format.ts",
     "  readable(v) ? `${fmt.format(v === 0 ? 0 : v)}${unit}` : EM_DASH;",
     "  v ? `${fmt.format(v)}${unit}` : EM_DASH;", "lib/format.test.ts"),
    ("02-R2 null renders blank instead of the em dash", "lib/format.ts",
     "export const EM_DASH = '—';", "export const EM_DASH = '';", "lib/format.test.ts"),
    ("02-R2b null renders N/A", "lib/format.ts",
     "export const EM_DASH = '—';", "export const EM_DASH = 'N/A';", "lib/format.test.ts"),
    # ⚠ Re-anchored by 10c-2 (L11): `formatSwapGiB` now builds its unit from the exported
    # `UNIT_GIB` constant (`lib/format.ts`'s own §6.6-unit-suffixes section) rather than the
    # inline literal `' GiB'` — same string, same behaviour, named so `lib/unit-suffix.test.ts`
    # can import it instead of keeping a second copy. The precision this mutation targets
    # (`TWO_DP` → `ONE_DP`) is unaffected; only the anchor text moved.
    ("02-R3 swap formatted at 1 dp like RAM", "lib/format.ts",
     "export const formatSwapGiB = (v: GiB | null): string => render(v, TWO_DP, UNIT_GIB);",
     "export const formatSwapGiB = (v: GiB | null): string => render(v, ONE_DP, UNIT_GIB);",
     "lib/format.test.ts"),
    # Added in step 3's reconciliation together with F1. SPEC.md §3.2 carries four uptime
    # forms; step 2's code implemented three and rendered a just-booted box `up 0 min`,
    # which is §3.2's own stated defect (`up 0 d 00:14`) one scale down. The fixture pair
    # around the boundary is the point: 59 s and 60 s must render differently.
    ("02-R30 the sub-minute uptime form is dropped - a fresh boot reads `up 0 min` (F1)",
     "lib/format.ts",
     "  if (total < UPTIME_SUB_MINUTE) return 'up <1 min';\n", "", "lib/format.test.ts"),
    ("02-R31 the sub-minute boundary swallows the first whole minute too",
     "lib/format.ts",
     "  if (total < UPTIME_SUB_MINUTE) return 'up <1 min';",
     "  if (total <= UPTIME_SUB_MINUTE) return 'up <1 min';", "lib/format.test.ts"),

    ("02-R4 HIGH band starts above 192 instead of at 192", "lib/format.ts",
     "  return v >= PWM_HIGH_FLOOR ? 'HIGH' : v >= PWM_LOW_FLOOR ? 'LOW' : 'OFF';",
     "  return v > PWM_HIGH_FLOOR ? 'HIGH' : v >= PWM_LOW_FLOOR ? 'LOW' : 'OFF';",
     "lib/format.test.ts"),

    # ------------------------------------------------------- A3/R2: the shared quantisation
    ("02-R16 an unreadable pwm duty is given a state anyway (A3)", "lib/format.ts",
     "  if (!Number.isFinite(v) || v < PWM_MIN || v > PWM_MAX) return null;\n",
     "", "lib/format.test.ts"),
    ("02-R17 an out-of-range duty is clamped into the register instead of rejected",
     "lib/format.ts",
     "  if (!Number.isFinite(v) || v < PWM_MIN || v > PWM_MAX) return null;",
     "  if (!Number.isFinite(v)) return null;", "lib/format.test.ts"),
    ("02-R18 a manual channel with an unreadable duty bands `normal` (A3, the safety half)",
     "lib/severity.ts",
     "  if (ch5Engagement(cooling) === 'unknown') return absolute === 'alarm' ? 'alarm' : null;",
     "  if (ch5Engagement(cooling) === 'unknown') return absolute;", "lib/severity.test.ts"),
    ("02-R19 engagement folds 'unknown' into 'not-engaged' (the boolean this replaced)",
     "lib/severity.ts", "  if (state === null) return 'unknown';",
     "  if (state === null) return 'not-engaged';", "lib/severity.test.ts"),

    # ---------------------------------------------------------------- §3.2 uptime
    ("02-R20 uptime always uses the day form (§3.2's `up 0 d 00:14`)", "lib/format.ts",
     "  if (days >= 1) return `up ${days} d ${pad2(hours)}:${pad2(minutes)}`;",
     "  if (days >= 0) return `up ${days} d ${pad2(hours)}:${pad2(minutes)}`;",
     "lib/format.test.ts"),

    # ---------------------------------------------------------------- §6.3 bands
    # ⚠ 10e re-aimed this anchor: `severityGpuTemp` now reads `GPU_TEMP_ALARM_C` (10e / §3.2)
    # rather than the bare literal `80`, so the GPU sparkline's reference line and this band
    # cannot drift apart. Same property, same boundary, new source text.
    ("02-R5 GPU temp alarm at >80 instead of >=80", "lib/severity.ts",
     "    : tempC >= GPU_TEMP_ALARM_C\n      ? 'alarm'", "    : tempC > GPU_TEMP_ALARM_C\n      ? 'alarm'",
     "lib/severity.test.ts"),
    ("02-R6 the engaged fan5 band applied in every mode", "lib/severity.ts",
     "  if (ch5Engagement(cooling) !== 'engaged') return null;", "  if (false) return null;",
     "lib/severity.test.ts"),
    ("02-R7 engagement inferred from ch5Mode alone", "lib/severity.ts",
     "  if (cooling.ch5Mode !== 'manual') return 'not-engaged';\n  const state = pwmStateName(cooling.ch5Pwm);\n  if (state === null) return 'unknown';\n  return state === 'HIGH' ? 'engaged' : 'not-engaged';",
     "  return cooling.ch5Mode === 'manual' ? 'engaged' : 'not-engaged';",
     "lib/severity.test.ts"),
    ("02-R8 pwm5Present null read as the alarm", "lib/severity.ts",
     "  present === null ? 'watch' : present ? 'normal' : 'alarm';",
     "  present === null ? 'alarm' : present ? 'normal' : 'alarm';", "lib/severity.test.ts"),
    ("02-R21 an unreadable ufw.conf gets no severity (the pre-§6.3-amendment behaviour)",
     "lib/severity.ts", "  enforcing === null ? 'watch' : enforcing ? 'normal' : 'alarm';",
     "  enforcing === null ? 'normal' : enforcing ? 'normal' : 'alarm';",
     "lib/severity.test.ts"),
    ("02-R22 dkmsForRunningKernel null read as the alarm", "lib/severity.ts",
     "  built === null ? 'watch' : built ? 'normal' : 'alarm';",
     "  built === null ? 'alarm' : built ? 'normal' : 'alarm';", "lib/severity.test.ts"),
    ("02-R23 llama.cpp's 503-while-loading treated as an alarm", "lib/severity.ts",
     "    case 'unhealthy':\n      return 'watch';", "    case 'unhealthy':\n      return 'alarm';",
     "lib/severity.test.ts"),
    ("02-R24 an `unknown` link state treated as healthy", "lib/severity.ts",
     "    case 'dormant':\n    case 'testing':\n    case 'unknown':\n      return 'watch';",
     "    case 'dormant':\n    case 'testing':\n      return 'watch';\n    case 'unknown':\n      return 'normal';",
     "lib/severity.test.ts"),
    ("02-R15 worstSeverity calls an all-null panel normal", "lib/severity.ts",
     "  let worst: Severity | null = null;", "  let worst: Severity | null = 'normal';",
     "lib/severity.test.ts"),

    # ---------------------------------------------------------------- §3.7 throttle
    ("02-R9 unknown throttle bits silently dropped", "lib/throttle.ts",
     "    reasons.push(decodeBit(rest & -rest));",
     "    const b = rest & -rest;\n    if (BY_BIT.has(b)) reasons.push(decodeBit(b));",
     "lib/throttle.test.ts"),
    ("02-R10 unknown throttle bit treated as alarm", "lib/throttle.ts",
     "      severity: 'watch',\n      label: `${code} ${UNKNOWN_REASON_NAME}`,",
     "      severity: 'alarm',\n      label: `${code} ${UNKNOWN_REASON_NAME}`,",
     "lib/throttle.test.ts"),
    ("02-R11 'normal, not a fault' attached to every mask", "lib/throttle.ts",
     "    note: value === 0n || value === SW_POWER_CAP ? NOT_A_FAULT_NOTE : null,",
     "    note: NOT_A_FAULT_NOTE,", "lib/throttle.test.ts"),

    # ---------------------------------------------------------------- §6.4 the pipeline
    ("02-R12 change compared with the first severity, not sticky", "lib/conditions.ts",
     "        changed: prev.changed || prev.lastSeverity !== severity,",
     "        changed: prev.firstSeverity !== severity,", "lib/conditions.test.ts"),
    ("02-R12b `changed` not sticky — differs-from-previous-poll (A1: needs a 4th observation)",
     "lib/conditions.ts", "        changed: prev.changed || prev.lastSeverity !== severity,",
     "        changed: prev.lastSeverity !== severity,", "lib/conditions.test.ts"),
    # ⚠ Re-aimed in step 8's reconciliation: `observePoll`'s loop now runs over the deduped
    # groups, so the observation is `chosen` and the key is `id`. Same mutation, same property.
    ("02-R25 the ledger fed the RAW per-poll severity (A2 — the composition defect)",
     "lib/conditions.ts", "    const entry = observeSeverity(ledger.get(id), severity);",
     "    const entry = observeSeverity(ledger.get(id), chosen.rawSeverity);",
     "lib/conditions.test.ts"),
    ("02-R26 the displayed severity is the raw one, skipping the debounce entirely",
     "lib/conditions.ts", "    const severity = hold.confirmed;",
     "    const severity = o.rawSeverity;", "lib/conditions.test.ts"),
    ("02-R13 standing overwrites the real severity", "lib/conditions.ts",
     "      severity,\n      displaySeverity,", "      severity: displaySeverity,\n      displaySeverity,",
     "lib/conditions.test.ts"),
    ("02-R14 debounce confirms on the first poll in the new band", "lib/conditions.ts",
     "  if (nowMs - state.pendingSinceMs < holdMs) return state;", "  if (false) return state;",
     "lib/conditions.test.ts"),
    ("02-R27 the banner timestamp is the confirmation instant, not the first sighting (R4)",
     "lib/conditions.ts", "      sinceMs: hold.confirmedSinceMs,", "      sinceMs: nowMs,",
     "lib/conditions.test.ts"),
    # ⚠ Re-aimed in step 8's reconciliation. The dedupe used to be a `seen` set inside the
    # loop; it is now the grouping itself, because §9 needs every observation of an id in hand
    # to take the worst severity. Giving each observation its own group is the same defect.
    ("02-R28 conditions are not deduplicated by id (R5 — one reading counted twice)",
     "lib/conditions.ts",
     "    const group = grouped.get(o.id);\n"
     "    if (group === undefined) grouped.set(o.id, [o]);\n"
     "    else group.push(o);",
     "    grouped.set(`${o.id}#${grouped.size}`, [o]);",
     "lib/conditions.test.ts"),
    ("02-R29 the aggregate reduces the TRUE severity, so a standing alarm turns the dot red",
     "lib/conditions.ts", "worstSeverity(...displayed.map((d) => d.displaySeverity));",
     "worstSeverity(...displayed.map((d) => d.severity));", "lib/conditions.test.ts"),
    ("02-R37 a backwards clock breaks the identity contract (A14)", "lib/conditions.ts",
     "    return settled ? state : { ...state, pendingSinceMs: nowMs };",
     "    return { ...state, pendingSinceMs: nowMs };", "lib/conditions.test.ts"),

    # ------------------------------------------------------- §6.4 the STANDING vocabulary
    ("02-R38 a bare `unit` in STANDING is accepted, silencing gpu-fan-control (A10)",
     "lib/conditions.ts", "      if (rule.bareKindAllowedInStanding) ids.add(trimmed);\n      else unknown.push(trimmed);",
     "      ids.add(trimmed);", "lib/conditions.test.ts"),
    ("02-R32 a subject on a singleton kind is silently accepted (A9)", "lib/conditions.ts",
     "    } else if (subject === '' || rule.singleton) {\n      unknown.push(trimmed);",
     "    } else if (subject === '') {\n      unknown.push(trimmed);", "lib/conditions.test.ts"),
    ("02-R33 an empty subject is silently accepted (A9)", "lib/conditions.ts",
     "    } else if (subject === '' || rule.singleton) {\n      unknown.push(trimmed);",
     "    } else if (rule.singleton) {\n      unknown.push(trimmed);", "lib/conditions.test.ts"),

    # ---------------------------------------------------------------- type-level
    ("02-R34 formatMiB loosened off its brand (§6.6's three memory units)", "lib/format.ts",
     "export const formatMiB = (v: MiB | null): string",
     "export const formatMiB = (v: number | null): string", "types"),
    ("02-R35 usedPercent takes two unrelated units (R1)", "lib/severity.ts",
     "export const usedPercent = <T extends number>(\n  used: T | null,\n  total: NoInfer<T> | null,\n): Percent | null => {",
     "export const usedPercent = (\n  used: number | null,\n  total: number | null,\n): Percent | null => {",
     "types"),
    ("02-R36 ErrorSource loses net-operstate again (A5)", "lib/types.ts",
     "  | 'net-operstate'\n", "", "types"),

    # ===================================================================================
    # Added in step 8's reconciliation. §9's *stale versus retired*, §9's worst-severity
    # dedupe, §6.4's "a gap ends any pending run" and §6.6's negative-age rule all landed in
    # step 2's files, so their mutations live here — HANDOVER §5.2: **ledger ownership follows
    # the FILE.** Each one is a wrong implementation somebody would actually write, and each
    # names the finding it closes.
    # ===================================================================================

    # ⚠ §6.6: "A negative age never renders as a negative number." A `ts` ahead of the browser's
    # clock is skew, and an age of `-4 s` invites the one reading it cannot have.
    ("02-R49 a negative age renders with its minus sign, so skew reads as a future reading",
     "lib/format.ts",
     "  const total = Math.floor(Math.max(0, ms) / 1000);",
     "  const total = Math.floor(ms / 1000);",
     "lib/format.test.ts"),

    ("02-R50 an absent age renders as zero seconds, so before-the-first-poll looks current",
     "lib/format.ts",
     "  if (!readable(ms)) return EM_DASH;",
     "  if (ms === null) return '0 s';",
     "lib/format.test.ts"),

    # ===================================================================================
    # ⚠ Six ⚠-marked tests in this step's own files had **no mutation behind them** — a claim
    # nobody checked, which is the defect the ledger exists to find. Surfaced when step 8's
    # reconciliation retrofitted the ledger here; the marks are on the most safety-critical
    # rows this project has, so they are backed rather than dropped.
    # ===================================================================================

    # ⚠ §6.3's two-sided absolute row, low end: "`0` is a stopped fan or a lost tach … no state
    # this channel can be commanded into produces it." Six of the seven `ch5Mode` states banded
    # `normal` before the zero clause, and `ec-auto` is the one this box sits in below 55 °C.
    ("02-R51 the fan5 absolute row loses its zero clause, so a stalled tach bands green",
     "lib/severity.ts",
     "  return value > 5100 || value === 0 ? 'alarm' : 'normal';",
     "  return value > 5100 ? 'alarm' : 'normal';",
     "lib/severity.test.ts"),

    # ⚠ Invariant 1, the other direction: `null` is a channel that produced no reading and
    # carries **no severity**. Treating it as a zero turns a driver that did not load into a
    # stopped fan, which is the two states §6.5 says must never look alike.
    ("02-R52 a null fan5 reading is treated as zero, so an absent channel alarms as a dead fan",
     "lib/severity.ts",
     "  const value: Rpm | null = cooling.fan5Rpm;\n"
     "  if (value === null || !Number.isFinite(value)) return null;\n"
     "  return value > 5100 || value === 0 ? 'alarm' : 'normal';",
     "  const value: Rpm | null = cooling.fan5Rpm;\n"
     "  if (value !== null && !Number.isFinite(value)) return null;\n"
     "  return (value ?? 0) > 5100 || (value ?? 0) === 0 ? 'alarm' : 'normal';",
     "lib/severity.test.ts"),

    # ⚠ §6.3 names this trap by name: "In JavaScript `-0 === 0`, so a corrupt `-0` is correctly
    # treated as a stopped fan — the comparison must be `===`, never `Object.is`, which would
    # let it through." `fanN_input` is an unsigned revolution count, so `-0` only ever arrives
    # from a corrupt read — exactly the value that must not slip past the row.
    ("02-R53 the stopped-fan comparison becomes Object.is, so a corrupt -0 bands normal",
     "lib/severity.ts",
     "  return value === 0 ? 'alarm' : 'normal';",
     "  return Object.is(value, 0) ? 'alarm' : 'normal';",
     "lib/severity.test.ts"),

    # ⚠ §6.3: "No upper row — the EC does not modulate them under GPU load and no nominal is
    # documented." An invented ceiling on fan1-fan4 is the plausible symmetry error, and it
    # would fire on a healthy box rather than on anything measured.
    ("02-R54 fan1-fan4 gain an invented upper bound, which §6.3 refuses to guess at",
     "lib/severity.ts",
     "  return value === 0 ? 'alarm' : 'normal';",
     "  return value === 0 || value > 5100 ? 'alarm' : 'normal';",
     "lib/severity.test.ts"),

    # ⚠ §6.5's law 1 at the boundary that matters most on this row: `up <1 min` says "the box
    # just booted"; `—` says "/proc/uptime could not be read". Those demand different reactions.
    ("02-R55 a just-booted box renders the em dash, so a fresh boot looks like an unread file",
     "lib/format.ts",
     "  if (!readable(v) || v < 0) return EM_DASH;",
     "  if (!readable(v) || v <= 0) return EM_DASH;",
     "lib/format.test.ts"),

    # ------------------------------------------ §6.6's time of day, and §6.2's `14:47:31 EDT`
    # ⚠ The one that ships wrong: `en-US` defaults to 12-hour, so dropping `hourCycle`
    # renders §6.2's header `02:47:31 PM`. Midnight is the fixture that catches every
    # version of this — noon is `12:00:00` under h12, h23 and h24 alike.
    ("02-R56 the hour cycle is left to en-US, which is 12-hour", "lib/format.ts",
     "  hourCycle: 'h23',\n} as const",
     "} as const", "lib/format.test.ts"),
    # ⚠ The other 24-hour spelling. `h24` differs from `h23` at exactly one instant a day:
    # midnight reads `24:00:00`, which on a header looks like a clock that has failed.
    ("02-R57 h24 instead of h23 - midnight reads 24:00:00", "lib/format.ts",
     "  hourCycle: 'h23',\n} as const",
     "  hourCycle: 'h24',\n} as const", "lib/format.test.ts"),
    # §6.2's header is `14:47:31`, not `14:47`. At a 5 s cadence a minute-resolution clock
    # is indistinguishable from a page that has stopped polling.
    ("02-R58 seconds dropped from the header clock", "lib/format.ts",
     "  second: '2-digit',\n  hourCycle",
     "  hourCycle", "lib/format.test.ts"),
    # ⚠ `shortGeneric` is the plausible wrong reading of "the short zone name": it is
    # DST-BLIND (`ET` in both July and January), so the header would be silently wrong for
    # eight months of the year.
    ("02-R60 the zone abbreviation uses the generic form and stops tracking DST", "lib/format.ts",
     "  timeZoneName: 'short',\n} as const",
     "  timeZoneName: 'shortGeneric',\n} as const", "lib/format.test.ts"),
    ("02-R61 the zone abbreviation is the long name - `Eastern Daylight Time`", "lib/format.ts",
     "  timeZoneName: 'short',\n} as const",
     "  timeZoneName: 'long',\n} as const", "lib/format.test.ts"),
    # ⚠ `Intl.DateTimeFormat.prototype.format` THROWS `RangeError: Invalid time value` on an
    # invalid Date, so this guard's absence is not a bad-looking cell - it is the header
    # throwing and taking the page with it. `IsoTimestamp` is an unvalidated brand, so an
    # unparsable value is reachable by construction.
    ("02-R62 the unparsable-ts guard is dropped, so the formatter throws", "lib/format.ts",
     "  return Number.isNaN(at.getTime()) ? null : at;",
     "  return at;", "lib/format.test.ts"),
    # The pinned-zone seam is accepted and ignored. ⚠ WHICH rows go red depends on the
    # machine's own zone, but at least one always does: the tables pin four different zones
    # and no single host zone satisfies more than one of them.
    ("02-R63 the pinned timeZone is ignored by the clock", "lib/format.ts",
     "{ ...TIME_OF_DAY_OPTIONS, timeZone });",
     "{ ...TIME_OF_DAY_OPTIONS });", "lib/format.test.ts"),
    ("02-R64 the pinned timeZone is ignored by the zone abbreviation", "lib/format.ts",
     "{ ...ZONE_OPTIONS, timeZone });",
     "{ ...ZONE_OPTIONS });", "lib/format.test.ts"),

    # ---------------------------------------------------------------- 10e — the `parts` variants (O14)
    # `renderParts` is the one function all four `format*Parts` functions share, so a single
    # mutation on it exercises every one of them — see `format.test.ts`'s own note on why the
    # four "null keeps the real unit" ⚠ tests share this anchor rather than each getting a
    # private one.
    ("10e-F1 the parts helper drops its readable() gate, so null renders as though it were 0",
     "lib/format.ts",
     "  value: readable(v) ? fmt.format(v === 0 ? 0 : v) : EM_DASH,",
     "  value: fmt.format(v === 0 ? 0 : (v ?? 0)),", "lib/format.test.ts"),
    ("10e-F3 the parts helper treats a real zero as unreadable, inverting invariant 1",
     "lib/format.ts",
     "  value: readable(v) ? fmt.format(v === 0 ? 0 : v) : EM_DASH,",
     "  value: readable(v) && v !== 0 ? fmt.format(v === 0 ? 0 : v) : EM_DASH,",
     "lib/format.test.ts"),
    ("10e-F2 formatGiBParts rounds to 2dp (swap's precision), not formatGiB's 1dp",
     "lib/format.ts",
     "export const formatGiBParts = (v: GiB | null): FormattedParts => renderParts(v, ONE_DP, UNIT_GIB.trim());",
     "export const formatGiBParts = (v: GiB | null): FormattedParts => renderParts(v, TWO_DP, UNIT_GIB.trim());",
     "lib/format.test.ts"),

    # ---------------------------------------------------------------- 10e — the GPU-temp constants
    ("10e-S1 GPU_TEMP_WATCH_C drifts from §6.3's 70", "lib/severity.ts",
     "export const GPU_TEMP_WATCH_C = 70;", "export const GPU_TEMP_WATCH_C = 71;",
     "lib/severity.test.ts"),
    ("10e-S2 severityGpuTemp's watch floor is a strict >, so the boundary reads normal",
     "lib/severity.ts",
     "      : tempC >= GPU_TEMP_WATCH_C\n        ? 'watch'",
     "      : tempC > GPU_TEMP_WATCH_C\n        ? 'watch'",
     "lib/severity.test.ts"),
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
    for name, src, old, new, check in REGRESSIONS:
        path = pathlib.Path(src)
        original = path.read_text()
        if old not in original:
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
        if original.count(old) > 1:
            print(f"--- {name}\n    ANCHOR AMBIGUOUS in {src} — matches {original.count(old)}×; "
                  f"replace(…, 1) would take whichever comes first. Pin it to one site")
            ambiguous.append(name)
            continue
        path.write_text(original.replace(old, new, 1))
        cmd = ["pnpm", "typecheck"] if check == "types" else ["pnpm", "vitest", "run", check]
        try:
            run = subprocess.run(cmd, capture_output=True, text=True)
        finally:
            path.write_text(original)
        out = run.stdout + run.stderr
        if check == "types":
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
            print("     ", f[:260])
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
