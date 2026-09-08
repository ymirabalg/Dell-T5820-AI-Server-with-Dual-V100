#!/usr/bin/env python3
"""Step 9's deliberate regressions — evidence that the UI-primitive tests bite.

Same harness as steps 2–8, including the per-mutation **red-test ledger** (HANDOVER §5.2).
Each entry replaces one exact string in one source file with a plausible *wrong*
implementation — the wrong thing someone would actually write, never a syntax error — runs
the affected check, and restores the file. **Every one must exit 1.**

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Not used by this harness: every primitive here is a pure
  render function with no branded-type surface of its own, so step 9 introduced no boundary
  that only `tsc` can see. (Steps 2–8's `types`-kind entries exist because `lib/` carries
  branded units and closed-vocabulary switches; `components/` carries neither.)

The entries below the RECONCILIATION banner were added by step 9's reconciliation phase. Each
one restores a defect that actually shipped from the BUILD phase and that the adversarial
found, so the mutation is evidence the new test would have caught the real thing rather than a
hypothetical one.

⚠ HANDOVER §5.1 is honoured: every boundary comparison here (`used > total`, `total <= 0`,
`series.length >= 2`, `domainEndMs <= domainStartMs`) has a mutation on **both** sides where
a "both sides" fixture is meaningful — the legend threshold (`T3a`/`T3b`) is the clearest
case, one mutation losing the legend at 2 series and one gaining it at 1. The reconciliation
block adds the same pattern to the new geometry: the end dot pinned right (`T14`) and pinned
left (`T14b`), a gap with no minimum width (`T21`) and one that is nothing BUT the minimum
(`T21b`), a meter that names no band (`ME1`) and one that names a band that does not exist
(`ME3`).

⚠ **Three mutations target a TEST file rather than a component** — `PU3` and `PU4`. That is
deliberate and not a category error: for `purity.test.ts` the *guard is the code*, so the only
way to show its two halves (the hook pattern and the directory walk) are load-bearing is to
weaken them and watch its own fixtures go red. They restore the file exactly as any other
mutation does.

⚠ **The ledger's `marked_tests` scanner was CORRECTED here**, and steps 2–8 still carry the
old one. Its `.each([^\n]*)` could not span a newline, so a ⚠ name on a MULTI-LINE
`test.each([...])(...)` was invisible to the ledger — it did not count as marked, and nothing
ever required a mutation to redden it. `chip.test.tsx`'s *"⚠ the visually-hidden word survives
even with colour and glyph removed: %s"* had been in that state since the day it was written.
The replacement skips the `.each(…)` argument list paren-balanced, string-aware AND
comment-aware (HANDOVER §5.3 note 1), because this step's own fixtures contain `'useState('`
— an unbalanced paren inside a string — and an apostrophe inside a comment.

Run from ``dashboard/`` with pnpm on PATH, and **never concurrently with `pnpm verify`**:

    export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
    python3 pipeline/steps/09-ui-primitives/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

PALETTE = "components/palette.test.ts"
CHIP = "components/chip.test.tsx"
ROW = "components/row.test.tsx"
METER = "components/meter.test.tsx"
PANEL_SHELL = "components/panel-shell.test.tsx"
SPARKLINE = "components/sparkline.test.tsx"
CHART = "components/stacked-time-series-chart.test.tsx"
PURITY = "components/purity.test.ts"
STYLES = "components/styles.test.ts"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied verbatim from steps 2–8; only
#    LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# Seven consecutive earlier steps shipped a test that NAMES a property it does not check. So:
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
LEDGER_FILES = [
    PALETTE, CHIP, ROW, METER, PANEL_SHELL, SPARKLINE, CHART, PURITY, STYLES,
]

# ⚠ CORRECTED IN STEP 9's RECONCILIATION — the regex this used to be could not see a
# MULTI-LINE `test.each([...])(...)`, because its `\.each\([^\n]*\)` stopped at the first
# newline. `chip.test.tsx`'s "⚠ the visually-hidden word survives even with colour and glyph
# removed: %s" was therefore invisible to the ledger from the day it was written: it counted
# as unmarked, so nothing required a mutation to redden it. That is the ledger failing at
# exactly the job it exists to do, and it is silent — the harness printed a smaller number
# and passed. Steps 2–8 carry the same regex and should be re-run against this scanner.
#
# The replacement finds each `test`/`it` call, skips a `.each(…)` argument list
# PAREN-BALANCED and STRING-AWARE (HANDOVER §5.3 note 1: extract paren-balanced, not by
# regex — and this file's own fixtures contain `'useState('`, an unbalanced paren inside a
# string), then reads the first string literal of the call itself.
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


PALETTE_SRC = "components/palette.ts"
CHIP_SRC = "components/chip.tsx"
ROW_SRC = "components/row.tsx"
METER_SRC = "components/meter.tsx"
PANEL_SHELL_SRC = "components/panel-shell.tsx"
SPARKLINE_SRC = "components/sparkline.tsx"
CHART_SRC = "components/stacked-time-series-chart.tsx"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ============================================== components/palette.ts
    ("PA1 GPU 0's hex drifts from §9's literal value by one digit",
     PALETTE_SRC, "gpu0: '#3987e5',", "gpu0: '#3987e4',", [PALETTE]),
    ("PA2 GPU 1 is no longer dashed, so it is colour-only against GPU 0",
     PALETTE_SRC, "gpu1: { color: SERIES_COLORS.gpu1, dashed: true },",
     "gpu1: { color: SERIES_COLORS.gpu1, dashed: false },", [PALETTE]),

    # ============================================== components/chip.tsx
    ("C1 alarm shares watch's glyph, so the two bands are visually identical",
     CHIP_SRC, "alarm: '✕', // ✕ — login-form.tsx's own alarm glyph",
     "alarm: '▲', // ✕ — login-form.tsx's own alarm glyph", [CHIP]),
    ("C2 a null severity defaults to the good colour — O12, inverted",
     CHIP_SRC, "data-severity={severity ?? 'none'} data-size={size}",
     "data-severity={severity ?? 'normal'} data-size={size}", [CHIP, PANEL_SHELL, ROW]),
    ("C3 the visually-hidden word is dropped, leaving the glyph as the only carrier",
     CHIP_SRC, '      <span className="sr-only">{word}</span>\n', "", [CHIP]),

    # ============================================== components/panel-shell.tsx
    ("PS1 the title is lowercased, so \"GPU 0\" renders \"gpu 0\"",
     PANEL_SHELL_SRC, "<h2 className={styles.title}>{title}</h2>",
     "<h2 className={styles.title}>{title.toLowerCase()}</h2>", [PANEL_SHELL]),
    ("PS2 an em-dash subtitle is \"helpfully\" blanked instead of shown",
     PANEL_SHELL_SRC, "<p className={styles.subtitle}>{subtitle}</p>",
     "<p className={styles.subtitle}>{subtitle === '—' ? '' : subtitle}</p>", [PANEL_SHELL]),
    ("PS3 the section's own no-band state defaults to the good colour",
     PANEL_SHELL_SRC, '<section className={styles.panel} data-severity={chip ?? \'none\'}>',
     '<section className={styles.panel} data-severity={chip ?? \'normal\'}>', [PANEL_SHELL]),

    # ============================================== components/row.tsx
    ("R1 an em-dash value is blanked instead of passed through verbatim",
     ROW_SRC, "<span className={styles.value}>{value}</span>",
     "<span className={styles.value}>{value === '—' ? '' : value}</span>", [ROW]),
    ("R2 severity=null is conflated with an omitted prop via a loose equality check",
     ROW_SRC, "{severity === undefined ? null : (",
     "{severity == null ? null : (", [ROW]),
    ("R3 Row invents §6.5's \"already explained\" exception for itself",
     ROW_SRC,
     "{note === undefined || note === null || note === '' ? null : (",
     "{note === undefined || note === null || note === '' || value === '—' ? null : (",
     [ROW]),

    # ============================================== components/meter.tsx
    ("M1 the upper clamp is dropped, so an over-full reading overflows the track",
     METER_SRC, "  return Math.min(100, Math.max(0, (used / total) * 100));",
     "  return Math.max(0, (used / total) * 100);", [METER]),
    ("M1b the upper clamp is off by one, so an exactly-full reading is not drawn full",
     METER_SRC, "  return Math.min(100, Math.max(0, (used / total) * 100));",
     "  return Math.min(99, Math.max(0, (used / total) * 100));", [METER]),
    ("M2 a zero-width fill is \"helpfully\" treated as no reading at all",
     METER_SRC, "<div className={styles.track} data-severity={severity ?? 'none'}",
     "<div className={styles.track} data-severity={fillPercent === 0 ? 'none' : severity ?? 'none'}",
     [METER]),
    ("M3 the null/non-finite guards are dropped, so a null total silently claims 100% used",
     METER_SRC,
     "  if (used === null || total === null) return null;\n"
     "  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;\n"
     "  return Math.min(100, Math.max(0, (used / total) * 100));",
     "  return Math.min(100, Math.max(0, ((used as number) / (total as number)) * 100));",
     [METER]),
    ("M4 severity=null renders the good colour on the track instead of the no-band state",
     METER_SRC, "data-severity={severity ?? 'none'} aria-hidden",
     "data-severity={severity ?? 'normal'} aria-hidden", [METER]),

    # ============================================== components/sparkline.tsx
    ("SP1 the empty-series guard is disabled, so zero and all-null points fall through",
     SPARKLINE_SRC, "  if (points.length === 0 || readable.length === 0) {",
     "  if (false) {", [SPARKLINE]),
    ("SP2 a null reading is silently dropped instead of breaking the run, bridging the line",
     SPARKLINE_SRC,
     "    if (p.v === null || !Number.isFinite(p.v)) {\n"
     "      if (current.length > 0) runs.push(current);\n"
     "      current = [];\n"
     "    } else {\n"
     "      current.push({ index, v: p.v });\n"
     "    }",
     "    if (p.v === null || !Number.isFinite(p.v)) {\n"
     "      return;\n"
     "    }\n"
     "    current.push({ index, v: p.v });",
     [SPARKLINE]),
    ("SP3 the end dot marks the last point overall, including an unreadable trailing one",
     SPARKLINE_SRC, "  const last = readable[readable.length - 1];",
     "  const last = points[points.length - 1] as unknown as IndexedPoint;", [SPARKLINE]),

    # ============================================== components/stacked-time-series-chart.tsx
    ("T1 the x-axis is rendered once PER PLOT instead of once, shared",
     CHART_SRC,
     [
         ("      <g transform={`translate(0, ${plotsHeight})`} data-role=\"x-axis\">",
          "      {plots.map((_, pi) => (\n"
          "      <g key={pi} transform={`translate(0, ${plotsHeight})`} data-role=\"x-axis\">"),
         ("        ))}\n      </g>\n    </svg>", "        ))}\n      </g>\n      ))}\n    </svg>"),
     ],
     [CHART]),
    ("T2 a series' dash flag is ignored, so identity drops to colour alone",
     CHART_SRC,
     "                          strokeDasharray={s.dashed === true ? '5 4' : undefined}\n"
     "                          points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     "                          strokeDasharray={undefined}\n"
     "                          points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     [CHART]),
    ("T3a the legend threshold moves to 3, so a 2-series plot loses its legend",
     CHART_SRC,
     "          plot.series.length >= 2 || plot.series.some((s) => s.endLabel == null);",
     "          plot.series.length >= 3 || plot.series.some((s) => s.endLabel == null);", [CHART]),
    ("T3b the legend renders unconditionally, so a single-series plot gets one too",
     CHART_SRC,
     "        const legendNeeded =\n"
     "          plot.series.length >= 2 || plot.series.some((s) => s.endLabel == null);",
     "        const legendNeeded = true;", [CHART]),
    ("T4 a gap is hatched only where a series ALSO happens to hold a null — rule 3, inverted",
     CHART_SRC,
     "          const gapWidth = Math.max(MIN_GAP_WIDTH, toX - fromX);\n"
     "          return (",
     "          const gapWidth = Math.max(MIN_GAP_WIDTH, toX - fromX);\n"
     "          const anySeriesHasNull = plots.some((p) =>\n"
     "            p.series.some((s) =>\n"
     "              s.points.some(\n"
     "                (pt) => pt.tMs >= gap.fromMs && pt.tMs <= (gap.toMs ?? domainEndMs) && pt.v === null,\n"
     "              ),\n"
     "            ),\n"
     "          );\n"
     "          if (!anySeriesHasNull) return null;\n"
     "          return (",
     [CHART]),
    ("T5 an open gap (toMs: null) collapses to zero width instead of reaching the domain end",
     CHART_SRC, "          const toMs = gap.toMs ?? domainEndMs;",
     "          const toMs = gap.toMs ?? gap.fromMs;", [CHART]),
    ("T5b an open gap stops PART WAY — width > 0, which the old assertion could not tell from 'to the end'",
     CHART_SRC, "          const toMs = gap.toMs ?? domainEndMs;",
     "          const toMs = gap.toMs ?? domainStartMs + (domainEndMs - domainStartMs) * 0.9;",
     [CHART]),
    ("T6 the empty-domain guard is off by one, so equal start/end bounds are drawn anyway",
     CHART_SRC, "if (plots.length === 0 || domainEndMs <= domainStartMs) {",
     "if (plots.length === 0 || domainEndMs < domainStartMs) {", [CHART]),
    ("T7 a series' points are silently truncated to 100, undoing traceFor's own budget",
     CHART_SRC,
     "                          points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     "                          points={run.points.slice(0, 100).map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     [CHART]),
    ("T8 a null run is bridged across instead of breaking the line into two polylines",
     CHART_SRC,
     "    if (p.v === null || !Number.isFinite(p.v)) {\n"
     "      if (current.length > 0) runs.push({ points: current });\n"
     "      current = [];\n"
     "    } else {\n"
     "      current.push({ tMs: p.tMs, v: p.v });\n"
     "    }",
     "    if (p.v === null || !Number.isFinite(p.v)) {\n"
     "      continue;\n"
     "    }\n"
     "    current.push({ tMs: p.tMs, v: p.v });",
     [CHART]),
    ("T9 the end-label reads the literal last point instead of the last READABLE one",
     CHART_SRC,
     "            const runs = runsOf(s.points);\n"
     "            const lastRun = runs[runs.length - 1];\n"
     "            const lastPoint = lastRun?.points[lastRun.points.length - 1];",
     "            const runs = runsOf(s.points);\n"
     "            void runs;\n"
     "            const lastPoint = s.points[s.points.length - 1];",
     [CHART]),
    ("T10 an implementer 'helpfully' infers extra gap rects from holes in a series — rule 3, the reverse direction",
     CHART_SRC,
     [
         ("  if (current.length > 0) runs.push({ points: current });\n"
          "  return runs;\n"
          "};",
          "  if (current.length > 0) runs.push({ points: current });\n"
          "  return runs;\n"
          "};\n"
          "\n"
          "/** MUTATION T10: \"helpfully\" infers extra gaps from holes in any series' own points. */\n"
          "const inferredGapsFrom = (plots: readonly ChartPlot[]): readonly Gap[] => {\n"
          "  const out: Gap[] = [];\n"
          "  for (const p of plots) {\n"
          "    for (const s of p.series) {\n"
          "      let inHole = false;\n"
          "      let start = 0;\n"
          "      for (const pt of s.points) {\n"
          "        const isNull = pt.v === null || !Number.isFinite(pt.v);\n"
          "        if (isNull && !inHole) {\n"
          "          inHole = true;\n"
          "          start = pt.tMs;\n"
          "        }\n"
          "        if (!isNull && inHole) {\n"
          "          inHole = false;\n"
          "          out.push({ fromMs: start, toMs: pt.tMs, reason: 'failed' });\n"
          "        }\n"
          "      }\n"
          "    }\n"
          "  }\n"
          "  return out;\n"
          "};"),
         ("{gaps.map((gap, i) => {", "{[...gaps, ...inferredGapsFrom(plots)].map((gap, i) => {"),
     ],
     [CHART]),
    ("T11 one 600-point budget is shared across every series in a plot, instead of one per series",
     CHART_SRC,
     [
         ("  const plotTops = plots.map((_, i) => i * (plotHeight + PLOT_GAP));",
          "  let sharedBudget = 600; // MUTATION T11: one budget for the whole chart\n"
          "  const plotTops = plots.map((_, i) => i * (plotHeight + PLOT_GAP));"),
         ("                          points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
          "                          points={((take) => {\n"
          "                            sharedBudget -= take.length;\n"
          "                            return take;\n"
          "                          })(run.points.slice(0, Math.max(0, sharedBudget)))\n"
          "                            .map((p) => `${xFor(p.tMs)},${yFor(p.v)}`)\n"
          "                            .join(' ')}"),
     ],
     [CHART]),
    ("T12 the chart's null check is falsy-based, so a v=0 point wrongly breaks the run",
     CHART_SRC,
     "if (p.v === null || !Number.isFinite(p.v)) {",
     "if (!p.v || !Number.isFinite(p.v)) {",
     [CHART]),

    # ============================================== components/sparkline.tsx (invariant 1)
    ("SP4 the sparkline's null check is falsy-based, so a v=0 point wrongly breaks the run",
     SPARKLINE_SRC,
     "    if (p.v === null || !Number.isFinite(p.v)) {",
     "    if (!p.v || !Number.isFinite(p.v)) {",
     [SPARKLINE]),

    # ============================================== components/purity.test.ts's subject: chip.tsx
    ("PU1 Chip holds severity in useState, so its colour can be debounced across renders",
     CHIP_SRC,
     [
         ("import { EM_DASH } from '@/lib/format';\nimport type { Severity } from '@/lib/types';",
          "import { useState } from 'react';\n\n"
          "import { EM_DASH } from '@/lib/format';\nimport type { Severity } from '@/lib/types';"),
         ("export function Chip({ severity, label, size = 'md' }: ChipProps) {\n"
          "  const glyph = severity === null ? EM_DASH : GLYPH[severity];",
          "export function Chip({ severity, label, size = 'md' }: ChipProps) {\n"
          "  const [heldSeverity] = useState(severity); // exactly what rule 1 forbids\n"
          "  void heldSeverity;\n"
          "  const glyph = severity === null ? EM_DASH : GLYPH[severity];"),
     ],
     [PURITY]),

    # =========================================================================
    # ⚠ Added by step 9's RECONCILIATION. Every one of these is the code as it
    #   actually shipped from the BUILD phase — each mutation restores a defect
    #   the adversarial found and this phase fixed, so the mutation proves the
    #   new test would have caught it.
    # =========================================================================

    # -------------------------------------------- H1: the aria-label
    ("T13 every chart announces itself as the COOLING chart, whatever it is drawing",
     CHART_SRC,
     [
         ("aria-label={`${ariaLabel} — no time range to plot`}",
          'aria-label="no time range to plot"'),
         ("aria-label={ariaLabel}",
          'aria-label="cooling: temperature and fan speed over the selected window"'),
     ],
     [CHART]),

    # -------------------------------------------- H3: the end dot's x
    ("T14 the end dot and its value label are pinned to 'now', whatever the data says",
     CHART_SRC, "                  x: xFor(lastPoint.tMs),", "                  x: plotWidth,",
     [CHART]),
    ("T14b the end dot is pinned to the LEFT edge — the other side of the same mistake",
     CHART_SRC, "                  x: xFor(lastPoint.tMs),", "                  x: 0,", [CHART]),

    # -------------------------------------------- M1: y is not clamped
    ("T15 y is unclamped, so §6.3's 14,451 RPM is drawn off-canvas and cropped away",
     CHART_SRC,
     "        const yFor = (v: number): number =>\n"
     "          clamp(chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight, 0, chartHeight);",
     "        const yFor = (v: number): number =>\n"
     "          chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight;",
     [CHART]),

    # -------------------------------------------- M2: the fabricated flat domain
    ("T16 a flat series fabricates a ±1 domain, so a stopped fan gets a `-1 RPM` axis mid-plot",
     CHART_SRC,
     "  if (min === max) {\n"
     "    const lo = min - 1;\n"
     "    return [min >= 0 ? Math.max(0, lo) : lo, max + 1];\n"
     "  }",
     "  if (min === max) {\n"
     "    return [min - 1, max + 1];\n"
     "  }",
     [CHART]),

    # -------------------------------------------- M3: raw, evenly-divided y ticks
    ("T17 y-ticks divide the domain evenly again, so two gridlines carry the same label",
     CHART_SRC,
     "                {yTicksFor(yMin, yMax, Y_TICKS, plot.formatTick).map((v, i) => {",
     "                {ticksBetween(yMin, yMax, Y_TICKS).map((v, i) => {",
     [CHART]),

    # -------------------------------------------- M4: end labels leave the plot box
    ("T18 end-labels are pushed apart with no bound, onto the next plot's legend",
     CHART_SRC,
     "        const spacedYs = spaceApart(\n"
     "          endRows.map((r) => r.y),\n"
     "          END_LABEL_MIN_GAP,\n"
     "          chartHeight,\n"
     "        );",
     "        const spacedYs = spaceApart(\n"
     "          endRows.map((r) => r.y),\n"
     "          END_LABEL_MIN_GAP,\n"
     "          Number.POSITIVE_INFINITY,\n"
     "        );",
     [CHART]),

    # -------------------------------------------- M5: clipped labels
    ("T19 the top y-tick label is drawn at y = -2, entirely above the viewBox",
     CHART_SRC,
     "                  const labelY =\n"
     "                    y - TICK_LABEL_OFFSET < TICK_LABEL_HEIGHT\n"
     "                      ? y + TICK_LABEL_HEIGHT\n"
     "                      : y - TICK_LABEL_OFFSET;",
     "                  const labelY = y - TICK_LABEL_OFFSET;",
     [CHART]),
    ("T20 every time tick anchors 'middle', so the window's start time is cropped at x = 0",
     CHART_SRC,
     "            textAnchor={i === 0 ? 'start' : i === X_TICKS - 1 ? 'end' : 'middle'}",
     '            textAnchor="middle"',
     [CHART]),

    # -------------------------------------------- M9: gap width
    ("T21 a gap has no minimum width, so one failed poll in a 2 h window is invisible",
     CHART_SRC,
     "          const gapWidth = Math.max(MIN_GAP_WIDTH, toX - fromX);",
     "          const gapWidth = toX - fromX;",
     [CHART]),
    ("T21b every gap is drawn at the minimum width — the floor becomes a resize",
     CHART_SRC,
     "          const gapWidth = Math.max(MIN_GAP_WIDTH, toX - fromX);",
     "          const gapWidth = MIN_GAP_WIDTH;",
     [CHART]),
    ("T21c the out-of-window guard is dropped, so a gap that ended before the window is hatched",
     CHART_SRC,
     "          if (toMs < domainStartMs || fromMs > domainEndMs) return null;\n",
     "",
     [CHART]),

    # -------------------------------------------- M10: a one-point run
    ("T22 a one-point run is left as a polyline with a single vertex, which paints nothing",
     CHART_SRC,
     "                        {run.points.length === 1 && (",
     "                        {run.points.length === 0 && (",
     [CHART]),

    # -------------------------------------------- L1: an explicit bound is discarded
    ("T23 an explicit yMin/yMax is thrown away the moment no value is readable",
     CHART_SRC,
     "  if (values.length === 0) {\n"
     "    const lo = plot.yMin ?? 0;\n"
     "    const hi = plot.yMax ?? lo + 1;\n"
     "    return hi > lo ? [lo, hi] : [lo, lo + 1];\n"
     "  }",
     "  if (values.length === 0) {\n"
     "    return [0, 1];\n"
     "  }",
     [CHART]),

    # -------------------------------------------- L3: identity by colour alone
    ("T24 a lone series with no end-label loses its legend, leaving colour as its only identity",
     CHART_SRC,
     "          plot.series.length >= 2 || plot.series.some((s) => s.endLabel == null);",
     "          plot.series.length >= 2;",
     [CHART]),

    # -------------------------------------------- L8: legend pitch
    ("T25 legend entries go back to a fixed 90px pitch, so long labels overlap",
     CHART_SRC,
     "                  legendX +=\n"
     "                    LEGEND_SWATCH +\n"
     "                    LEGEND_TEXT_GAP +\n"
     "                    s.label.length * MONO_CHAR_WIDTH +\n"
     "                    LEGEND_ENTRY_GAP;",
     "                  legendX += 90;",
     [CHART]),

    # -------------------------------------------- M6 / M10, the sparkline's half
    ("SP5 a flat sparkline is drawn along the bottom edge, where 'coldest' lives",
     SPARKLINE_SRC,
     "  const yFor = (v: number): number =>\n"
     "    flat ? height / 2 : height - ((v - min) / (max - min)) * height;",
     "  const yFor = (v: number): number =>\n"
     "    height - ((v - min) / (flat ? 1 : max - min)) * height;",
     [SPARKLINE]),
    ("SP6 a one-point sparkline run is left invisible",
     SPARKLINE_SRC, "          {run.length === 1 && (", "          {run.length === 0 && (",
     [SPARKLINE]),

    # -------------------------------------------- L5 / L7 and the colour-only meter
    ("C4 the no-band chip claims the READING is missing, beside a value that is a reading",
     CHIP_SRC, "const NO_BAND_WORD = 'no severity band';",
     "const NO_BAND_WORD = 'no reading';", [CHIP]),
    ("ME1 the meter's band is a fill colour and nothing else — colour-only encoding",
     METER_SRC,
     "        {severity === null ? null : <span className=\"sr-only\">{SEVERITY_WORD[severity]}</span>}\n",
     "", [METER]),
    ("ME2 the bar re-announces the label and value already read out above it",
     METER_SRC,
     "<div className={styles.track} data-severity={severity ?? 'none'} aria-hidden=\"true\">",
     "<div className={styles.track} data-severity={severity ?? 'none'} role=\"img\""
     " aria-label={`${label}: ${formattedValue}`}>",
     [METER]),
    ("ME3 a null severity invents a band word where there is no band",
     METER_SRC,
     "{severity === null ? null : <span className=\"sr-only\">{SEVERITY_WORD[severity]}</span>}",
     "{severity === null ? <span className=\"sr-only\">no severity band</span>"
     " : <span className=\"sr-only\">{SEVERITY_WORD[severity]}</span>}",
     [METER]),

    # -------------------------------------------- M7: a CSS declaration that does nothing
    ("CS1 `.row` loses `flex-wrap: wrap`, so `.note`'s `flex-basis: 100%` silently stops wrapping",
     "components/row.module.css", "  flex-wrap: wrap;\n", "", ["components/styles.test.ts"]),

    # -------------------------------------------- H4: the purity guard itself
    ("PU2 Chip subscribes to the store with useSyncExternalStore — the hook the old guard missed",
     CHIP_SRC,
     [
         ("import { EM_DASH } from '@/lib/format';\nimport type { Severity } from '@/lib/types';",
          "import { useSyncExternalStore } from 'react';\n\n"
          "import { EM_DASH } from '@/lib/format';\nimport type { Severity } from '@/lib/types';"),
         ("export function Chip({ severity, label, size = 'md' }: ChipProps) {\n"
          "  const glyph = severity === null ? EM_DASH : GLYPH[severity];",
          "export function Chip({ severity, label, size = 'md' }: ChipProps) {\n"
          "  const held = useSyncExternalStore(sub, get, getServer); // the DEBOUNCED band\n"
          "  void held;\n"
          "  const glyph = severity === null ? EM_DASH : GLYPH[severity];"),
     ],
     [PURITY]),
    ("PU3 the component walk stops at the top level, so a future components/panels/ escapes it",
     PURITY,
     "    if (entry.isDirectory()) {\n"
     "      out.push(...componentFilesUnder(join(dir, entry.name)).map((f) => join(entry.name, f)));\n"
     "      continue;\n"
     "    }",
     "    if (entry.isDirectory()) {\n"
     "      continue;\n"
     "    }",
     [PURITY]),
    ("PU4 the hook pattern goes back to enumerating eight names, and misses every other hook",
     PURITY,
     r"const HOOK_CALL = /\buse(?:[A-Z]\w*)?\s*\(/;",
     r"const HOOK_CALL = /\buse(?:State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect|ImperativeHandle)\s*\(/;",
     [PURITY]),
]

# ---------------------------------------------------------------------------
# ⚠ Mutation ids must be unique. Added 2026-09-07, after NINE duplicates were found
#    across three harnesses — every one of them pre-existing and invisible.
# ---------------------------------------------------------------------------
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
