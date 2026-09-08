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

⚠ HANDOVER §5.1 is honoured: every boundary comparison here (`used > total`, `total <= 0`,
`series.length >= 2`, `domainEndMs <= domainStartMs`) has a mutation on **both** sides where
a "both sides" fixture is meaningful — the legend threshold (`T3a`/`T3b`) is the clearest
case, one mutation losing the legend at 2 series and one gaining it at 1.

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
    PALETTE, CHIP, ROW, METER, PANEL_SHELL, SPARKLINE, CHART, PURITY,
]

# `test('…')`, `it('…')` and `test.each(…)('…')`, single- or double-quoted.
MARKED = re.compile(
    r"""(?:^|\s)(?:test|it)(?:\.each\([^\n]*\))?\(\s*(['"])((?:(?!\1).)*⚠(?:(?!\1).)*)\1"""
)


def marked_tests():
    """Every ⚠-marked test name, as (file, name, matchable-prefix) triples."""
    found = []
    for rel in LEDGER_FILES:
        text = pathlib.Path(rel).read_text()
        for m in MARKED.finditer(text):
            name = m.group(2)
            prefix = name.split("%")[0].strip()
            if len(prefix) < 12:
                print(f"!!! {rel}: ⚠ test name is unmatchably short: {name!r}")
            found.append((rel, name, prefix))
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
     METER_SRC, "data-severity={severity ?? 'none'}\n        role=\"img\"",
     "data-severity={fillPercent === 0 ? 'none' : severity ?? 'none'}\n        role=\"img\"",
     [METER]),
    ("M3 the null/non-finite guards are dropped, so a null total silently claims 100% used",
     METER_SRC,
     "  if (used === null || total === null) return null;\n"
     "  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;\n"
     "  return Math.min(100, Math.max(0, (used / total) * 100));",
     "  return Math.min(100, Math.max(0, ((used as number) / (total as number)) * 100));",
     [METER]),
    ("M4 severity=null renders the good colour on the track instead of the no-band state",
     METER_SRC, "className={styles.track}\n        data-severity={severity ?? 'none'}",
     "className={styles.track}\n        data-severity={severity ?? 'normal'}", [METER]),

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
     "      <g transform={`translate(0, ${plotsHeight})`} data-role=\"x-axis\">\n"
     "        {ticksBetween(domainStartMs, domainEndMs, X_TICKS).map((t, i) => (\n"
     "          <text key={i} x={xFor(t)} y={14} className={styles.tickLabel} textAnchor=\"middle\">\n"
     "            {formatTime(t)}\n"
     "          </text>\n"
     "        ))}\n"
     "      </g>",
     "      {plots.map((_, pi) => (\n"
     "      <g key={pi} transform={`translate(0, ${plotsHeight})`} data-role=\"x-axis\">\n"
     "        {ticksBetween(domainStartMs, domainEndMs, X_TICKS).map((t, i) => (\n"
     "          <text key={i} x={xFor(t)} y={14} className={styles.tickLabel} textAnchor=\"middle\">\n"
     "            {formatTime(t)}\n"
     "          </text>\n"
     "        ))}\n"
     "      </g>\n"
     "      ))}",
     [CHART]),
    ("T2 a series' dash flag is ignored, so identity drops to colour alone",
     CHART_SRC,
     "                        strokeDasharray={s.dashed === true ? '5 4' : undefined}\n"
     "                        points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     "                        strokeDasharray={undefined}\n"
     "                        points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     [CHART]),
    ("T3a the legend threshold moves to 3, so a 2-series plot loses its legend",
     CHART_SRC, "const legendNeeded = plot.series.length >= 2;",
     "const legendNeeded = plot.series.length >= 3;", [CHART]),
    ("T3b the legend renders unconditionally, so a single-series plot gets one too",
     CHART_SRC, "const legendNeeded = plot.series.length >= 2;",
     "const legendNeeded = true;", [CHART]),
    ("T4 a gap is hatched only where a series ALSO happens to hold a null — rule 3, inverted",
     CHART_SRC,
     "          if (toX <= fromX) return null;\n"
     "          return (",
     "          if (toX <= fromX) return null;\n"
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
     CHART_SRC, "const toX = xFor(gap.toMs ?? domainEndMs);",
     "const toX = xFor(gap.toMs ?? gap.fromMs);", [CHART]),
    ("T6 the empty-domain guard is off by one, so equal start/end bounds are drawn anyway",
     CHART_SRC, "if (plots.length === 0 || domainEndMs <= domainStartMs) {",
     "if (plots.length === 0 || domainEndMs < domainStartMs) {", [CHART]),
    ("T7 a series' points are silently truncated to 100, undoing traceFor's own budget",
     CHART_SRC,
     "                        points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
     "                        points={run.points.slice(0, 100).map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}",
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
     "              <g data-role=\"series\">\n"
     "                {plot.series.map((s) => (\n"
     "                  <g key={s.id} data-series={s.id}>\n"
     "                    {runsOf(s.points).map((run, i) => (\n"
     "                      <polyline\n"
     "                        key={i}\n"
     "                        className={styles.line}\n"
     "                        stroke={s.color}\n"
     "                        strokeDasharray={s.dashed === true ? '5 4' : undefined}\n"
     "                        points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}\n"
     "                      />\n"
     "                    ))}\n"
     "                  </g>\n"
     "                ))}\n"
     "              </g>",
     "              <g data-role=\"series\">\n"
     "                {(() => {\n"
     "                  let sharedBudget = 600;\n"
     "                  return plot.series.map((s) => (\n"
     "                    <g key={s.id} data-series={s.id}>\n"
     "                      {runsOf(s.points).map((run, i) => {\n"
     "                        const take = run.points.slice(0, Math.max(0, sharedBudget));\n"
     "                        sharedBudget -= take.length;\n"
     "                        return (\n"
     "                          <polyline\n"
     "                            key={i}\n"
     "                            className={styles.line}\n"
     "                            stroke={s.color}\n"
     "                            strokeDasharray={s.dashed === true ? '5 4' : undefined}\n"
     "                            points={take.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}\n"
     "                          />\n"
     "                        );\n"
     "                      })}\n"
     "                    </g>\n"
     "                  ));\n"
     "                })()}\n"
     "              </g>",
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

    if moved:
        print("\nANCHORS MOVED — re-aim these, they did not run:", ", ".join(moved))
    if bad:
        print("\nDID NOT BITE:", ", ".join(bad))
    if moved or bad:
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
