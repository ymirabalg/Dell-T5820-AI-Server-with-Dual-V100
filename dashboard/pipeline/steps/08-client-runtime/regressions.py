#!/usr/bin/env python3
"""Step 8's deliberate regressions — evidence that the client-runtime tests bite.

Same harness as steps 2–7, including step 4's per-mutation **red-test ledger**. Each entry
replaces one exact string in one source file with a plausible *wrong* implementation — the
wrong thing someone would actually write, not a syntax error — runs the affected check, and
restores the file. **Every one must exit 1.**

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Vitest's ``typecheck`` block only covers ``*.test-d.ts``,
  so a loosened type shows up only under ``tsc``.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs re-aiming;
it does not mean the test is fine.

⚠ HANDOVER §5.1 is honoured. Step 8's boundaries are the 8192 ring cap, the 600-point
decimation threshold, the 30 s backoff cap, §6.4's 10 s hold and the 500-entry log, and each
carries a fixture on **both** sides in the test files. Where a mutation weakens one of those
comparisons it is aimed at the surrounding block rather than at the comparison itself.

⚠ Three mutations here point at files other steps own — ``N1``/``N2``/``N3`` at
``lib/units.ts``, which step 8 created by moving two constants out of
``lib/collectors/dbus.ts`` so §6.4's condition ids can be built in a browser without dragging
``node:net`` into the bundle. Step 5's harness had one mutation anchored on the old definition
site; it was re-aimed there in the same change. Ledger ownership follows the FILE
(HANDOVER §5.2), and ``lib/units.ts`` is new, so its mutations live here.

⚠ **Re-aimed and extended by step 8's reconciliation.** Twenty anchors moved when the twelve
MUSTs landed — `gaps.ts` and `mode.ts` were extracted out of `runtime.ts`, the arrival path
moved inside a `try`, and `standing` became per-poll — and thirty-one mutations were added.
Three things that cost time and are worth inheriting:

* **Mutation ids must be unique.** Nine of the new ones collided with existing ids and made the
  ``DID NOT BITE`` list ambiguous about which entry had failed. Check with
  ``grep -oE '^ +[(]"[A-Z]+[0-9]+' regressions.py | sort | uniq -d``.
* ⚠ **A fix that adds a second, independent defence silently voids the first one's mutation.**
  ``W4`` removes ``wire.ts``'s ISO-shape guard and had bitten since the build. F13 then added a
  calendar round-trip that independently refuses every row the test table held, so the mutation
  applied, the property stayed true, and the shape guard's coverage went to zero without a word.
  The round-trip compares **19 characters**, so the region only the shape guard can see is a
  non-canonical *spelling* of a correct instant — and that matters because §6.7's dedupe is
  keyed on the ``ts`` **string**. Two rows were added to ``wire.test.ts`` for it, and ``W4`` was
  renamed, since its original name described a case the round-trip had taken over.
* ⚠ **Five of the six ``DID NOT BITE`` results were missing fixtures, not bad mutations**, and
  the ledger then named six more ⚠ marks with nothing behind them. Every one was a real hole;
  they are listed in ``reconciliation.md`` §3. The most valuable was
  ``a stale condition does not re-log its band on every poll``, whose guard is **invisible for a
  continuous metric and load-bearing for a value-band one**.

⚠ Properties with **no mutation**, recorded rather than papered over:

* ``use-telemetry.ts``. Every rule is in ``runtime.ts`` behind the ``RuntimeEnv`` seam; what
  is left is twelve lines of React wiring that need a DOM to execute. Step 8 declined to add
  jsdom for them — see ``build.md`` §"jsdom" — so the file has no test and therefore no
  mutation. What it *rests* on is asserted: ``client.test-d.ts`` proves the real ``Window``
  satisfies ``BrowserWindow``, so the un-run line ``createBrowserEnv(window)`` is at least
  type-correct, and it needs no cast.
* **"the debounce is driven by one wall clock rather than by the sample's `ts`"**
  (``runtime.ts``). Substituting ``wire.tsMs`` for ``this.env.nowMs()`` is behaviour-preserving
  under every fixture in the suite, because a fake server that stamps ``ts`` one second apart
  and a fake clock that advances one second per poll are the same numbers. Distinguishing them
  needs a fixture where the server's clock and the browser's disagree, which is a real gap and
  is recorded in ``build.md`` rather than mutated into a false green.
* **"the repeat is detected by identity rather than by sample count"** (``runtime.ts``).
  ``ring === this.state.ring`` and ``ring.samples.length === …`` differ **only at the 8192
  cap**, which no runtime fixture reaches (filling it costs 8192 fake polls). ``ring.test.ts``
  covers the cap directly, and ``U2`` proves the runtime consults the answer at all.
* **"the client never writes to the server"** (invariant 2). There is no write to remove:
  ``env.ts`` issues one ``GET`` and nothing else, and a mutation that *added* a write would be
  testing that a test exists rather than that the code is right.
* **"a stale condition does not re-log its band on every poll"** — ⚠ **the ⚠ mark was DROPPED
  from that test rather than backed, per HANDOVER §5.2 rule 1.** For a continuous metric the
  property is defended twice: ``E19`` removes the ``condition.stale`` short-circuit and ``E21``
  removes the ``previousBand === band`` early-out, and the test is green under each. Removing
  both at once is not an implementation anybody would write. The singly-defended half of the
  same rule — a **value-band** condition carrying a pending run across an outage — is now a ⚠
  test of its own, and ``E19`` backs it.

Run from ``dashboard/`` with pnpm on PATH, and **never concurrently with `pnpm verify`**:

    export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
    python3 pipeline/steps/08-client-runtime/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

PREFS = "lib/client/prefs.test.ts"
BACKOFF = "lib/client/backoff.test.ts"
RING = "lib/client/ring.test.ts"
SERIES = "lib/client/series.test.ts"
WIRE = "lib/client/wire.test.ts"
OBS = "lib/client/observations.test.ts"
EVENTS = "lib/client/events.test.ts"
ENV = "lib/client/env.test.ts"
RUNTIME = "lib/client/runtime.test.ts"
GAPS = "lib/client/gaps.test.ts"
MODE = "lib/client/mode.test.ts"
GUARD8 = "lib/client/guardrails.test.ts"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied verbatim from steps 4–7; only
#    LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# Seven consecutive steps shipped a test that NAMES a property it does not check. So:
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
# ⚠ `lib/client/client.test-d.ts` is NOT here. Its assertions run in the compiler, and
# HANDOVER §5.2 rule 4 is explicit that "a `types`-kind mutation contributes NO red-test
# lines, so it can never cover a ⚠ test". Its two ⚠ names are covered instead by `types`
# mutations `T1`–`T3`, which are listed below and must still exit 1 — the ledger just cannot
# see them.
LEDGER_FILES = [
    PREFS, BACKOFF, RING, SERIES, WIRE, OBS, EVENTS, ENV, RUNTIME, GUARD8, GAPS, MODE,
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


PREFS_SRC = "lib/client/prefs.ts"
BACKOFF_SRC = "lib/client/backoff.ts"
RING_SRC = "lib/client/ring.ts"
SERIES_SRC = "lib/client/series.ts"
WIRE_SRC = "lib/client/wire.ts"
OBS_SRC = "lib/client/observations.ts"
EVENTS_SRC = "lib/client/events.ts"
ENV_SRC = "lib/client/env.ts"
RUNTIME_SRC = "lib/client/runtime.ts"
GAPS_SRC = "lib/client/gaps.ts"
MODE_SRC = "lib/client/mode.ts"
UNITS_SRC = "lib/units.ts"

# D5's whole function body, which three mutations below replace with a different composition.
TRACE_BODY = (
    "  decimateSeries(\n"
    "    seriesFrom(samplesWithin(state.ring, windowMs(state.preferences.windowMinutes)), pick),\n"
    "  );"
)

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ============================================== §6.7 — localStorage preferences
    ("P1 the default cadence becomes 1 s, so five tabs fork five nvidia-smi a second",
     PREFS_SRC, "export const DEFAULT_CADENCE_SECONDS: CadenceSeconds = 5;",
     "export const DEFAULT_CADENCE_SECONDS: CadenceSeconds = 1;", [PREFS, RUNTIME]),
    ("P2 the default window becomes 10 minutes",
     PREFS_SRC, "export const DEFAULT_WINDOW_MINUTES: WindowMinutes = 30;",
     "export const DEFAULT_WINDOW_MINUTES: WindowMinutes = 10;", [PREFS, RUNTIME]),
    ("P3 the cadence key is renamed, so every stored preference is silently forgotten",
     PREFS_SRC, "export const CADENCE_KEY = 'aid.cadence';",
     "export const CADENCE_KEY = 'aid.cadenceSeconds';", [PREFS, RUNTIME]),
    ("P4 the window key is renamed",
     PREFS_SRC, "export const WINDOW_KEY = 'aid.window';",
     "export const WINDOW_KEY = 'aid.windowMinutes';", [PREFS, RUNTIME]),
    ("P5 the stored value is parsed leniently, so ' 5 ' and '5.0' become options",
     PREFS_SRC, "  if (raw === null || !DECIMAL.test(raw)) return fallback;",
     "  if (raw === null) return fallback;", [PREFS]),
    ("P6 a value outside §6.2's list is used anyway, so a hand-edited 7 s cadence is honoured",
     PREFS_SRC, "  return options.find((option) => option === value) ?? fallback;",
     "  return (options.find((option) => option === value) ?? value) as T;", [PREFS]),
    ("P7 the getItem call is unwrapped, so a blocked window throws during the first render",
     PREFS_SRC,
     "  let raw: string | null;\n  try {\n    raw = storage.getItem(key);\n  } catch {\n    return fallback;\n  }",
     "  const raw: string | null = storage.getItem(key);",
     [PREFS, RUNTIME]),
    ("P8 the setItem call is unwrapped, so a quota error escapes a dropdown's onChange",
     PREFS_SRC,
     "  try {\n    storage.setItem(key, String(value));\n  } catch {\n"
     "    // Quota, a private window, a blocked origin. §6.7: fall back silently.\n  }",
     "  storage.setItem(key, String(value));",
     [PREFS]),
    # ⚠ A `types` mutation, and that is the finding rather than a workaround. Narrowing
    # `PrefStorage | null` before `.setItem` is what the compiler requires; weakening the
    # narrowing is a `tsc` error, and at *runtime* it would be behaviour-preserving anyway,
    # because the `try`/`catch` §6.7 requires swallows the `TypeError` that follows. That is
    # HANDOVER's "every catch added for a never-throw rule removes a distinction", found here
    # by the ledger. The ⚠ was dropped from the matching test and its name says what it checks.
    ("P9 the null narrowing is weakened, so `storage.setItem` is called on nothing",
     PREFS_SRC, "  if (storage === null) return;\n  try {", "  if (storage === undefined) return;\n  try {",
     "types"),
    # ⚠ A `types` mutation, like `P9` and for the same reason: `PrefStorage | null` has to be
    # narrowed before `.getItem`, so "read from a storage that is not there" is a compile error
    # rather than a behaviour. The ⚠ was dropped from the matching test.
    ("P12 the null narrowing is weakened on the read path too",
     PREFS_SRC, "  if (storage === null) return fallback;", "  if (storage === undefined) return fallback;",
     "types"),
    ("P10 the longest window is written by hand and drifts from the selector",
     PREFS_SRC, "export const LONGEST_WINDOW_MS = Math.max(...WINDOW_MINUTES) * 60_000;",
     "export const LONGEST_WINDOW_MS = 60 * 60_000;", [PREFS]),
    ("P11 §6.2's cadence list loses its fastest entry",
     PREFS_SRC, "export const CADENCE_SECONDS = [1, 2, 5, 10, 30] as const;",
     "export const CADENCE_SECONDS = [2, 5, 10, 30] as const;", [PREFS]),

    # ================================================== §6.7 — the failed-poll backoff
    ("B1 the cap becomes 60 s, so a recovered server waits a minute to be noticed",
     BACKOFF_SRC, "export const BACKOFF_CAP_MS = 30_000;",
     "export const BACKOFF_CAP_MS = 60_000;", [BACKOFF]),
    ("B2 the first failure waits two cadences rather than one",
     BACKOFF_SRC, "  const exponent = Math.min(Math.max(0, consecutiveFailures - 1), 31);",
     "  const exponent = Math.min(Math.max(0, consecutiveFailures), 31);", [BACKOFF, RUNTIME]),
    ("B3 the backoff is linear, so a long outage never reaches the cap",
     BACKOFF_SRC, "  return Math.min(cadenceMs * 2 ** exponent, BACKOFF_CAP_MS);",
     "  return Math.min(cadenceMs * (exponent + 1), BACKOFF_CAP_MS);", [BACKOFF, RUNTIME]),
    ("B4 the cap is not applied at all",
     BACKOFF_SRC, "  return Math.min(cadenceMs * 2 ** exponent, BACKOFF_CAP_MS);",
     "  return cadenceMs * 2 ** exponent;", [BACKOFF]),
    ("B5 a healthy poll is scheduled at half a cadence",
     BACKOFF_SRC, "  const exponent = Math.min(Math.max(0, consecutiveFailures - 1), 31);",
     "  const exponent = Math.min(consecutiveFailures - 1, 31);", [BACKOFF]),

    # ============================================== §6.7 — the ring and the ts dedupe
    ("R1 the ring cap becomes exactly the window, with no headroom for a late poll",
     RING_SRC, "export const MAX_SAMPLES = 8192;", "export const MAX_SAMPLES = 7200;", [RING]),
    ("R2 the ts dedupe is dropped, so §4's cache puts duplicate points in the ring",
     RING_SRC, "  if (ring.heldTs.has(wire.snapshot.ts)) return ring;\n\n", "",
     [RING, RUNTIME]),
    ("R3 the dedupe looks only at the newest sample rather than at the ring",
     RING_SRC, "  if (ring.heldTs.has(wire.snapshot.ts)) return ring;",
     "  if (newestSample(ring)?.ts === wire.snapshot.ts) return ring;", [RING]),
    ("R4 a repeat returns a new ring, so every downstream pipeline re-runs on it",
     RING_SRC, "  if (ring.heldTs.has(wire.snapshot.ts)) return ring;",
     "  if (ring.heldTs.has(wire.snapshot.ts)) return { ...ring };", [RING, RUNTIME]),
    ("R10 the dedupe asks whether the ring is empty, so only the first sample is ever kept",
     RING_SRC, "  if (ring.heldTs.has(wire.snapshot.ts)) return ring;",
     "  if (ring.heldTs.size > 0) return ring;", [RING, RUNTIME]),
    ("R5 eviction drops the newest sample rather than the oldest",
     RING_SRC,
     "  const evicted = ring.samples.slice(0, ring.samples.length - MAX_SAMPLES + 1);\n"
     "  for (const gone of evicted) heldTs.delete(gone.ts);\n"
     "  const samples = [...ring.samples.slice(evicted.length), sample];",
     "  const evicted = ring.samples.slice(ring.samples.length - 1);\n"
     "  for (const gone of evicted) heldTs.delete(gone.ts);\n"
     "  const samples = [...ring.samples.slice(0, ring.samples.length - 1), sample];",
     [RING]),
    ("R6 an evicted ts stays in the key set, so the ring leaks one key per poll for ever",
     RING_SRC, "  for (const gone of evicted) heldTs.delete(gone.ts);\n", "", [RING]),
    ("R7 the window is selected by index, so a cadence change distorts the axis",
     RING_SRC, "  const within = ring.samples.filter((sample) => sample.tsMs >= from);",
     "  const within = ring.samples.slice(-600);", [RING]),
    ("R8 the window's old edge is exclusive, so the boundary sample is dropped",
     RING_SRC, "  const within = ring.samples.filter((sample) => sample.tsMs >= from);",
     "  const within = ring.samples.filter((sample) => sample.tsMs > from);", [RING, SERIES]),
    ("R9 the window is returned in arrival order, so a backwards clock doubles the line back",
     RING_SRC,
     "  return within.every((sample, i) => i === 0 || sample.tsMs >= (within[i - 1]?.tsMs ?? 0))\n"
     "    ? within\n    : [...within].sort((a, b) => a.tsMs - b.tsMs);",
     "  return within;",
     [RING]),

    # ================================================ §6.7 — min/max decimation
    ("S1 the threshold is raised so nothing is ever decimated",
     SERIES_SRC, "export const MAX_RENDERED_POINTS = 600;",
     "export const MAX_RENDERED_POINTS = 60_000;", [SERIES]),
    ("S2 the bucket is averaged — the one thing §6.7 says is a lie",
     SERIES_SRC,
     "    const firstIndex = Math.min(lowIndex, highIndex);\n"
     "    const secondIndex = Math.max(lowIndex, highIndex);\n"
     "    const first = points[firstIndex];\n"
     "    if (first !== undefined) out.push(first);\n"
     "    if (secondIndex !== firstIndex) {\n"
     "      const second = points[secondIndex];\n"
     "      if (second !== undefined) out.push(second);\n    }",
     "    let sum = 0;\n    let count = 0;\n"
     "    for (let i = start; i < end; i += 1) {\n"
     "      const value = points[i]?.v;\n"
     "      if (value === undefined || value === null) continue;\n"
     "      sum += value;\n      count += 1;\n    }\n"
     "    out.push({ tMs: points[start]?.tMs ?? 0, v: sum / count });\n"
     "    void lowIndex;\n    void highIndex;",
     [SERIES]),
    ("S3 only one extreme per bucket is kept, so a one-sample dip vanishes",
     SERIES_SRC,
     "    if (secondIndex !== firstIndex) {\n"
     "      const second = points[secondIndex];\n"
     "      if (second !== undefined) out.push(second);\n    }",
     "    void secondIndex;",
     [SERIES]),
    ("S4 an all-null bucket emits nothing, so a lost channel closes up into a line",
     SERIES_SRC,
     "      const first = points[start];\n      if (first !== undefined) out.push(first);\n      continue;",
     "      continue;",
     [SERIES]),
    ("S5 a bucket with no reading is drawn at zero — invariant 1, in a chart",
     SERIES_SRC,
     "      const first = points[start];\n      if (first !== undefined) out.push(first);\n      continue;",
     "      out.push({ tMs: points[start]?.tMs ?? 0, v: 0 });\n      continue;",
     [SERIES]),
    ("S6 the bucket count is the cap, so the result is twice the budget",
     SERIES_SRC, "  const bucketCount = Math.floor(cap / 2);", "  const bucketCount = cap;",
     [SERIES]),
    # ⚠ Invariant 1 inside a chart: a card that did not enumerate is `null`, and a plotting
    # layer that "helpfully" fills it draws a 0 °C GPU.
    ("S8 a missing reading is projected as zero so the line stays continuous",
     SERIES_SRC, "  samples.map((sample) => ({ tMs: sample.tsMs, v: pick(sample.snapshot) }));",
     "  samples.map((sample) => ({ tMs: sample.tsMs, v: pick(sample.snapshot) ?? 0 }));",
     [SERIES]),
    ("S7 a series is plotted against its index rather than against time",
     SERIES_SRC,
     "  samples.map((sample) => ({ tMs: sample.tsMs, v: pick(sample.snapshot) }));",
     "  samples.map((sample, index) => ({ tMs: index * 1000, v: pick(sample.snapshot) }));",
     [SERIES]),

    # ============================================ D5 — traceFor, and the order that is the point
    #
    # ⚠ S9 is the mutation the whole wrapper exists for. It is not a syntax swap: it is the
    # code a panel would write if it reached for `decimateSeries` first — decimate everything
    # the ring holds, then clip the drawn points to the window. Both orders type-check, both
    # return points, and both draw a curve. Measured under it: 151 points where 600 are owed,
    # 23 s between drawn points instead of 6 s, and a 70 °C excursion inside the window
    # silently absorbed by a 24-sample bucket it should never have shared.
    ("S9 the series is decimated before it is windowed, so the budget is spent on undrawn data",
     SERIES_SRC,
     TRACE_BODY,
     " {\n"
     "  const drawn = decimateSeries(seriesFrom(state.ring.samples, pick));\n"
     "  const newest = state.ring.newest;\n"
     "  if (newest === null) return drawn;\n"
     "  const from = newest.tsMs - windowMs(state.preferences.windowMinutes);\n"
     "  return drawn.filter((point) => point.tMs >= from);\n};",
     [SERIES]),
    ("S10 the trace ignores §6.2's window selector and always draws the default width",
     SERIES_SRC,
     [("import { windowMs } from './prefs';",
       "import { DEFAULT_WINDOW_MINUTES, windowMs } from './prefs';"),
      ("windowMs(state.preferences.windowMinutes)", "windowMs(DEFAULT_WINDOW_MINUTES)")],
     [SERIES]),
    ("S11 the trace drops its null readings, so the line closes over ground nobody measured",
     SERIES_SRC,
     TRACE_BODY,
     "  decimateSeries(\n"
     "    seriesFrom(samplesWithin(state.ring, windowMs(state.preferences.windowMinutes)), pick).filter(\n"
     "      (point) => point.v !== null,\n"
     "    ),\n  );",
     [SERIES]),
    # ⚠ HANDOVER §6 rule 10, as the wrong implementation: the stacked cooling chart has three
    # traces, so its author divides the budget between them — and GPU 0's resolution becomes a
    # function of how many other series happen to be drawn beside it.
    ("S12 the 600-point budget is split across a chart's traces rather than given to each",
     SERIES_SRC,
     TRACE_BODY,
     "  decimateSeries(\n"
     "    seriesFrom(samplesWithin(state.ring, windowMs(state.preferences.windowMinutes)), pick),\n"
     "    MAX_RENDERED_POINTS / 3,\n  );",
     [SERIES]),

    # ================================================ O10 — validating the wire
    ("W1 the response is cast rather than validated — O10, in one line",
     WIRE_SRC,
     "  const snapshot: TelemetrySnapshot = {\n    ts: isoTimestamp(rawTs),",
     "  const cast = value as unknown as TelemetrySnapshot;\n  return { snapshot: cast, tsMs };\n"
     "  const snapshot: TelemetrySnapshot = {\n    ts: isoTimestamp(rawTs),",
     [WIRE, GUARD8]),
    ("W2 serving: null is coerced to [], so \"unknown\" becomes \"none configured\"",
     WIRE_SRC, "  const serving = arrayOrNull(field(value, 'serving'), servingInstanceOf);",
     "  const serving = arrayOrNull(field(value, 'serving'), servingInstanceOf) ?? [];", [WIRE]),
    ("W3 a missing key is read as a null reading, so a broken server looks like a quiet box",
     WIRE_SRC, "const numberOrNull = (value: unknown): Checked<number | null> => {\n  if (value === null) return null;",
     "const numberOrNull = (value: unknown): Checked<number | null> => {\n"
     "  if (value === null || value === undefined) return null;",
     [WIRE]),
    # ⚠ Re-named in reconciliation, because F13's calendar round-trip took its original case
    # away. `'5'` parses to 2001-05-01 and the round-trip refuses it, so "accepts '5' as a date"
    # stopped being true of the mutated code and this entry stopped biting on every fixture the
    # table then held. The shape guard is still load-bearing, but only over what the round-trip
    # structurally cannot see: it compares **19 characters**, so a non-canonical *spelling* of a
    # correct instant — a written-out zero offset, a fourth fractional digit — passes it. That
    # matters because §6.7's dedupe is keyed on the `ts` string, and one instant under two
    # spellings enters the ring twice. Two rows were added to `wire.test.ts` for exactly those.
    ("W4 the ts shape is not checked, so one instant spelled two ways enters the ring twice",
     WIRE_SRC, "  if (typeof rawTs !== 'string' || !ISO_UTC.test(rawTs)) return null;",
     "  if (typeof rawTs !== 'string') return null;", [WIRE]),
    ("W5 manual with no duty is accepted, and the missing duty becomes OFF",
     WIRE_SRC,
     "  if (mode === 'manual') {\n"
     "    if (typeof duty !== 'number' || !Number.isInteger(duty)) return undefined;\n"
     "    if (duty < PWM_MIN || duty > PWM_MAX) return undefined;\n"
     "    return { ...channels, ch5Mode: 'manual', ch5Pwm: pwm(duty) };\n  }",
     "  if (mode === 'manual') {\n"
     "    return { ...channels, ch5Mode: 'manual', ch5Pwm: pwm(typeof duty === 'number' ? duty : 0) };\n  }",
     [WIRE]),
    ("W6 ec-auto is allowed to carry a duty, which ENODATA means it cannot have",
     WIRE_SRC, "  if (duty !== null) return undefined;\n", "", [WIRE]),
    ("W7 a seventh UnitState is accepted, and §6.3's exhaustive switch answers undefined",
     WIRE_SRC, "  return Object.hasOwn(table, value) ? (value as T) : undefined;",
     "  return value as T;", [WIRE]),
    ("W8 a nineteenth errors[] source is accepted, so §6.5 cannot match it to a figure",
     WIRE_SRC,
     "  if (typeof rawSource !== 'string' || !Object.hasOwn(ERROR_SOURCES, rawSource)) return undefined;",
     "  if (typeof rawSource !== 'string') return undefined;", [WIRE]),
    ("W9 a load average of any length is accepted",
     WIRE_SRC, "  if (!Array.isArray(value) || value.length !== 3) return undefined;",
     "  if (!Array.isArray(value) || value.length < 3) return undefined;", [WIRE]),
    ("W10 a null reading is coerced to zero on the way in — the worst bug this project can ship",
     WIRE_SRC,
     "  value === undefined ? undefined : value === null ? null : make(value);",
     "  value === undefined ? undefined : make(value ?? 0);",
     [WIRE]),

    ("W11 gpus: null is coerced to [], so \"not enumerated\" becomes \"no cards fitted\"",
     WIRE_SRC, "  const gpus = arrayOrNull(field(value, 'gpus'), gpuOf);",
     "  const gpus = arrayOrNull(field(value, 'gpus'), gpuOf) ?? [];", [WIRE]),
    # ⚠ The correction §4 and HANDOVER both forbid, made at the parse instead of at the store.
    ("W12 the epoch is stamped on arrival rather than read from the server's ts",
     WIRE_SRC, "  const tsMs = Date.parse(rawTs);", "  const tsMs = Date.now();", [WIRE]),
    ("W13 an unavailable channel 5 refuses the whole snapshot — the DKMS alarm, unrenderable",
     WIRE_SRC, "  if (mode === null) return { ...channels, ch5Mode: null, ch5Pwm: null };\n", "",
     [WIRE]),
    ("W14 the duty is checked for truthiness, so OFF (pwm 0) reads as no reading at all",
     WIRE_SRC, "    if (typeof duty !== 'number' || !Number.isInteger(duty)) return undefined;",
     "    if (typeof duty !== 'number' || !duty) return undefined;", [WIRE]),
    ("W15 a reading is coerced with Number(), so a string temperature becomes a temperature",
     WIRE_SRC,
     "  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;\n  return value;",
     "  const coerced = Number(value);\n  return Number.isFinite(coerced) ? coerced : undefined;",
     [WIRE]),
    ("W16 a three-valued check is coerced with Boolean(), so 'no' is true",
     WIRE_SRC, "  return typeof value === 'boolean' ? value : undefined;", "  return Boolean(value);",
     [WIRE]),
    ("W17 loadAvg: null is refused, so one unread file blanks the whole snapshot",
     WIRE_SRC,
     "const loadAverageOf = (value: unknown): Checked<LoadAverage | null> => {\n  if (value === null) return null;",
     "const loadAverageOf = (value: unknown): Checked<LoadAverage | null> => {",
     [WIRE]),
    ("W18 a string field is coerced with String(), so a number hostname is accepted",
     WIRE_SRC, "  return typeof value === 'string' ? value : undefined;", "  return String(value);",
     [WIRE]),

    # ================================================= O11 — the one projection
    ("O1 a row with no §6.3 band is given normal, so a failed read reads as health",
     OBS_SRC,
     "    // O12: no band, no condition. Never invent one.\n    if (rawSeverity === null) return;\n"
     "    out.push(observation({ kind, subject, label, value, rawSeverity, enumeration }));",
     "    out.push(observation({ kind, subject, label, value, rawSeverity: rawSeverity ?? 'normal', enumeration }));",
     [OBS]),
    ("O2 channel 5 joins the fan_stopped row, so one tach produces two conditions",
     OBS_SRC, "  [4, (c) => c.fan4Rpm],\n];", "  [4, (c) => c.fan4Rpm],\n  [5, (c) => c.fan5Rpm],\n];",
     [OBS]),
    ("O3 the serving unit name is spelled locally rather than derived from lib/units.ts",
     OBS_SRC, "    const unit = servingUnitName(instance.instance);",
     "    const unit = `llama-server@${instance.instance}.service`;", [OBS, GUARD8]),
    ("O4 the fan service is emitted from SAFETY only, so §9's dedupe is never exercised",
     OBS_SRC,
     "  // §9's \"one reading shown in two panels\": emitted here from COOLING and again from SAFETY.\n"
     "  push(\n    'unit',\n    FAN_SERVICE_UNIT,\n    FAN_SERVICE_UNIT,\n"
     "    formatText(cooling.serviceState),\n    severityUnitState(cooling.serviceState),\n  );\n",
     "",
     [OBS]),
    ("O5 the three-valued safety checks render as booleans, so — becomes \"no\"",
     OBS_SRC, "const yesNo = (value: boolean | null): string => (value === null ? EM_DASH : value ? 'yes' : 'no');",
     "const yesNo = (value: boolean | null): string => (value ? 'yes' : 'no');", [OBS]),
    ("O6 a unit's state is called continuous, so §6.4's own example line disappears",
     OBS_SRC, "  unit: true,\n  health: true,", "  unit: false,\n  health: true,", [OBS, EVENTS]),
    ("O9 the RAM row shows only its used figure, so a swap alarm names a value that did not move",
     OBS_SRC,
     "    `${formatGiB(host.memUsedGiB)} used · swap ${formatSwapGiB(host.swapUsedGiB)}`,",
     "    formatGiB(host.memUsedGiB),",
     [OBS]),
    # ⚠ §6.4: "A subject on a singleton kind is malformed, not a narrower match" — and the
    # interface name is exactly the subject someone would attach to `link`.
    ("O10 a singleton kind is given a subject, so its id stops being the bare kind",
     OBS_SRC, "  push('link', null, 'eno1 link',", "  push('link', 'eno1', 'eno1 link',", [OBS]),
    ("O7 the fan service's log source becomes serving, so COOLING's own row files elsewhere",
     OBS_SRC, "      return subject === FAN_SERVICE_UNIT ? 'cooling' : 'serving';",
     "      return 'serving';", [OBS]),
    ("O8 a GPU is subscripted by name, so §6.4's `gpu_temp:0` stops being an index",
     OBS_SRC, "    const at = String(gpu.index);", "    const at = gpu.name ?? String(gpu.index);",
     [OBS]),

    # ===================================================== §6.4 — the event log
    ("E1 the log cap becomes 5000, so a long session holds ten times what §6.7 allows",
     EVENTS_SRC, "export const MAX_EVENTS = 500;", "export const MAX_EVENTS = 5_000;", [EVENTS]),
    ("E2 the log is oldest-first, so the newest transition is off the bottom of the panel",
     EVENTS_SRC, "    entries: [...fresh.reverse(), ...state.entries].slice(0, MAX_EVENTS),",
     "    entries: [...state.entries, ...fresh].slice(0, MAX_EVENTS),", [EVENTS]),
    ("E3 the cap discards the newest entries rather than the oldest",
     EVENTS_SRC, "    entries: [...fresh.reverse(), ...state.entries].slice(0, MAX_EVENTS),",
     "    entries: [...fresh.reverse(), ...state.entries].slice(-MAX_EVENTS),", [EVENTS]),
    ("E4 O5's once-per-session set is dropped, so a standing condition logs on every move",
     EVENTS_SRC, "    if (condition.suppressed && loggedStanding.has(condition.id)) continue;\n", "",
     [EVENTS]),
    ("E5 a first sighting is never logged, so a dashboard opened during an alarm opens silent",
     EVENTS_SRC, "    const worthLogging = first ? condition.displaySeverity !== 'normal' : true;",
     "    const worthLogging = !first;", [EVENTS]),
    ("E6 every first sighting is logged, so the log opens full of healthy rows",
     EVENTS_SRC, "    const worthLogging = first ? condition.displaySeverity !== 'normal' : true;",
     "    const worthLogging = true;", [EVENTS]),
    ("E7 a continuous metric is logged on its reading, so it logs on every poll",
     EVENTS_SRC, "      band = condition.displaySeverity;", "      band = condition.value;",
     [EVENTS]),
    ("E8 the state-valued band is not debounced, so a flicker reaches the log",
     EVENTS_SRC,
     "      const hold =\n        previous === undefined\n"
     "          ? startBandHold(condition.value, nowMs)\n"
     "          : stepBandHold(previous, condition.value, nowMs, DEBOUNCE_MS);",
     "      const hold = startBandHold(condition.value, nowMs);",
     [EVENTS]),
    ("E9 a collector's presence is seeded confirmed, so a one-poll blip logs twice",
     EVENTS_SRC,
     "    const hold = stepBandHold(previous ?? startBandHold(false, nowMs), here, nowMs, DEBOUNCE_MS);",
     "    const hold =\n      previous === undefined\n        ? startBandHold(here, nowMs)\n"
     "        : stepBandHold(previous, here, nowMs, DEBOUNCE_MS);",
     [EVENTS]),
    ("E10 the errors[] message is dropped, so skipped and failed read alike",
     EVENTS_SRC, "      detail: present.get(source as ErrorSource) ?? '',", "      detail: '',",
     [EVENTS]),
    ("E11 seq never advances, so React keys collide and the order is unrecoverable",
     EVENTS_SRC, "    fresh.push({ ...entry, seq });\n    seq += 1;", "    fresh.push({ ...entry, seq });",
     [EVENTS]),
    ("E12 the session opens with an empty log, so nothing distinguishes it from a quiet one",
     EVENTS_SRC,
     "  entries: [\n    {\n      seq: 0,\n      atMs: nowMs,\n      source: 'session',",
     "  entries: [\n  ],\n  ignored: [\n    {\n      seq: 0,\n      atMs: nowMs,\n      source: 'session',",
     [EVENTS, RUNTIME]),

    # ⚠ Two pairs, and one coherent wrong design rather than two accidents: "log every
    # condition's current state on every poll, and do not special-case a standing one". Either
    # half alone is invisible — the band early-out swallows the missing once-per-session set,
    # and the once-per-session set swallows the missing early-out — which is why the ⚠ test it
    # covers needs both.
    ("E13 the log re-states every condition on every poll, standing ones included",
     EVENTS_SRC,
     [("    const previousBand = logged.get(condition.id);\n    const first = previousBand === undefined;\n"
       "    if (!first && previousBand === band) continue;",
       "    const previousBand = logged.get(condition.id);\n    const first = previousBand === undefined;"),
      ("    if (condition.suppressed && loggedStanding.has(condition.id)) continue;\n", "")],
     [EVENTS]),

    # ==================================================== the browser adapter
    ("V1 a 401 is folded into the failed-poll path, so the operator watches a grey dot",
     ENV_SRC, "    if (response.status === 401) return { kind: 'unauthorized' };\n", "",
     [ENV]),
    ("V2 any status at all is read as a snapshot, so a 502's HTML is parsed as telemetry",
     ENV_SRC, "    if (!response.ok) return { kind: 'error', detail: `HTTP ${response.status}` };\n", "",
     [ENV]),
    ("V3 a network failure is not caught, so the poll rejects and nothing reschedules",
     ENV_SRC,
     "    } catch (error) {\n      return { kind: 'error', detail: error instanceof Error ? error.message : 'request failed' };\n    }",
     "    } finally {\n      /* nothing */\n    }",
     [ENV]),
    ("V4 the localStorage property access is unwrapped, so a blocked origin throws at construction",
     ENV_SRC,
     "  try {\n    return win.localStorage ?? null;\n  } catch {\n"
     "    // Safari's \"Block all cookies\", a `file://` document, a blocked third-party iframe.\n"
     "    return null;\n  }",
     "  return win.localStorage ?? null;",
     [ENV]),
    ("V5 the visibility listener is never removed, so every mount leaks one",
     ENV_SRC,
     "    return () => {\n      win.document.removeEventListener('visibilitychange', listener);\n    };",
     "    return () => undefined;",
     [ENV, GUARD8]),
    ("V6 the request drops the session cookie, so every poll is a 401",
     ENV_SRC,
     [("export interface TelemetryRequestInit {\n  readonly credentials: 'same-origin';",
       "export interface TelemetryRequestInit {\n  readonly credentials: string;"),
      ("        credentials: 'same-origin',", "        credentials: 'omit',")],
     [ENV]),
    ("V7 the endpoint gains a trailing slash",
     ENV_SRC, "export const TELEMETRY_PATH = '/api/telemetry';",
     "export const TELEMETRY_PATH = '/api/telemetry/';", [ENV]),
    ("V8 document.hidden is read once at construction, so the tab is hidden for ever",
     ENV_SRC, "  isHidden: () => win.document.hidden,",
     "  isHidden: ((hidden: boolean) => () => hidden)(win.document.hidden),", [ENV]),
    ("V9 a body that is not JSON becomes an empty snapshot rather than a failed poll",
     ENV_SRC,
     "    } catch {\n      return { kind: 'error', detail: 'response was not JSON' };\n    }",
     "    } catch {\n      return { kind: 'ok', body: {} };\n    }",
     [ENV]),

    # ⚠ The plausible "helpful" refactor: fold O10's validation into the fetch. It is wrong
    # twice over — it gives the wire two doors, and it turns §4's *partial* snapshot, "the
    # normal case on this machine", into a failed poll the first time the validator tightens.
    ("V10 the adapter starts validating, so O10's one door becomes two",
     ENV_SRC,
     [("import type { PrefStorage } from './prefs';",
       "import type { PrefStorage } from './prefs';\nimport { parseSnapshot } from './wire';"),
      ("      return { kind: 'ok', body: await response.json() };",
       "      const parsed: unknown = await response.json();\n"
       "      return parseSnapshot(parsed) === null\n"
       "        ? { kind: 'error', detail: 'not a snapshot' }\n"
       "        : { kind: 'ok', body: parsed };")],
     [ENV]),

    # ======================================================== the runtime itself
    ("U1 a repeated ts engages the backoff, so a healthy 1 s dashboard backs off to 30 s",
     RUNTIME_SRC,
     "      this.applyMode({ consecutiveFailures: 0, lastFailure: null });\n      return;\n    }",
     "      this.fail('repeated ts');\n      return;\n    }",
     [RUNTIME]),
    ("U2 the runtime ignores the ring's verdict, so a repeat re-runs every pipeline",
     RUNTIME_SRC,
     "      this.applyMode({ consecutiveFailures: 0, lastFailure: null });\n      return;\n    }",
     "      this.applyMode({ consecutiveFailures: 0, lastFailure: null });\n    }",
     [RUNTIME]),
    ("U3 a 401 goes down the failed-poll path, so the session never gets renewed",
     RUNTIME_SRC,
     "        case 'unauthorized':\n          this.expire();\n          return;",
     "        case 'unauthorized':\n          this.fail('unauthorized');\n          break;",
     [RUNTIME]),
    ("U4 the expired hand-off loses its parameter, so §5.2 shows the idle screen",
     RUNTIME_SRC, "export const expiredLoginUrl = (): string => `${LOGIN_PATH}?${EXPIRED_PARAM}=1`;",
     "export const expiredLoginUrl = (): string => LOGIN_PATH;", [RUNTIME]),
    ("U5 a hidden tab still schedules a poll, so a background tab keeps forking nvidia-smi",
     RUNTIME_SRC, "    if (this.state.paused || this.state.hidden) return;\n    if (this.inFlight) return;",
     "    if (this.state.paused) return;\n    if (this.inFlight) return;", [RUNTIME]),
    # ⚠ Two pairs, because either guard alone makes the other unobservable — which is the
    # point of having both. The plausible wrong implementation is a developer who believes the
    # `visibilitychange` listener is enough and removes the pair of belt-and-braces checks
    # together.
    ("U6 both hidden-tab guards go, so a background tab polls from the moment it mounts",
     RUNTIME_SRC,
     [("    if (this.state.hidden) return;\n    void this.poll();\n  }", "    void this.poll();\n  }"),
      ("    if (!force && (this.state.paused || this.state.hidden)) return;",
       "    if (!force && this.state.paused) return;")],
     [RUNTIME]),
    ("U7 becoming visible waits out a whole cadence before asking anything",
     RUNTIME_SRC,
     "    if (!wasHidden) return;\n"
     "    // \"…resume on visibility.\" Immediately: a background tab throttles timers, so whatever\n"
     "    // is on screen is older than the age indicator would suggest even before the pause.\n"
     "    void this.poll();",
     "    if (!wasHidden) return;\n    this.reschedule();",
     [RUNTIME]),
    ("U8 the un-sampled span starts when polling stopped, not at the last reading",
     RUNTIME_SRC,
     "  private newestTsMs(): number | null {\n    return newestSample(this.state.ring)?.tsMs ?? null;\n  }",
     "  private newestTsMs(): number | null {\n    return this.env.nowMs();\n  }",
     [RUNTIME]),
    ("U9 the gap closes at the arrival time rather than at the sample's own ts",
     RUNTIME_SRC,
     "      gaps: observeSample(\n        this.state.gaps,\n        wire.tsMs,",
     "      gaps: observeSample(\n        this.state.gaps,\n        nowMs,",
     [RUNTIME]),
    ("U10 a successful poll does not reset the backoff, so one outage slows the page for ever",
     RUNTIME_SRC,
     "      consecutiveFailures: 0,\n      lastFailure: null,\n"
     "      severity: aggregateSeverity(poll.displayed),",
     "      consecutiveFailures: this.state.consecutiveFailures,\n      lastFailure: null,\n"
     "      severity: aggregateSeverity(poll.displayed),",
     [RUNTIME]),
    ("U11 stop() leaves the visibility listener attached, so every unmount leaks one",
     RUNTIME_SRC,
     "    if (this.unsubscribeVisibility !== null) {\n      this.unsubscribeVisibility();\n"
     "      this.unsubscribeVisibility = null;\n    }",
     "    this.unsubscribeVisibility = null;",
     [RUNTIME, GUARD8]),
    ("U12 stop() leaves the pending timer running, so a route change polls for ever",
     RUNTIME_SRC,
     "    this.inFlight = false;\n    this.cancelTimer();\n    if (this.unsubscribeVisibility !== null) {",
     "    this.inFlight = false;\n    if (this.unsubscribeVisibility !== null) {",
     [RUNTIME, GUARD8]),
    ("U13 a poll that lands after stop() writes to a dead store",
     RUNTIME_SRC, "    if (generation !== this.generation || !this.running) return;\n", "",
     [RUNTIME]),
    ("U14 the state is replaced on every poll, so a repeat re-renders the whole dashboard",
     RUNTIME_SRC, "    if (!changed) return;\n", "", [RUNTIME]),
    ("U15 refresh now silently resumes, so the mode the operator chose is undone by their click",
     RUNTIME_SRC,
     "  refreshNow(): void {\n    if (this.state.hidden) return;\n    void this.poll(true);\n  }",
     "  refreshNow(): void {\n    if (this.state.hidden) return;\n    this.resume();\n"
     "    void this.poll(true);\n  }",
     [RUNTIME]),
    ("U16 refresh now respects the pause, so an explicit request for a reading does nothing",
     RUNTIME_SRC,
     "  refreshNow(): void {\n    if (this.state.hidden) return;\n    void this.poll(true);\n  }",
     "  refreshNow(): void {\n    if (this.state.hidden) return;\n    void this.poll();\n  }",
     [RUNTIME]),
    ("U17 changing the cadence clears the ring, throwing away the window being watched",
     RUNTIME_SRC,
     "    this.applyMode({ preferences: { ...this.state.preferences, cadenceSeconds: seconds } });\n"
     "    this.reschedule();",
     "    this.applyMode({\n      preferences: { ...this.state.preferences, cadenceSeconds: seconds },\n"
     "      ring: EMPTY_RING,\n    });\n    this.reschedule();",
     [RUNTIME]),
    ("U18 STANDING defaults to suppressing a real alarm rather than to suppressing nothing",
     RUNTIME_SRC,
     "    const standing = standingIdsFrom(wire.snapshot.standing);",
     "    const standing = standingIdsFrom(\n"
     "      wire.snapshot.standing.length > 0 ? wire.snapshot.standing : ['ufw_enforcing'],\n    );",
     [RUNTIME]),
    ("U19 the paused mode is dropped, so a frozen dashboard looks live",
     MODE_SRC, "  if (input.paused) return 'paused';\n", "", [MODE, RUNTIME]),
    ("U20 the stale mode is dropped, so a failing poll never says so",
     MODE_SRC, "  return isStale(input) ? 'stale' : 'live';", "  return 'live';", [MODE, RUNTIME]),
    ("U35 a rejecting seam escapes, so the runtime stops polling with nothing on screen to say so",
     RUNTIME_SRC,
     "    let response: TelemetryResponse;\n    try {\n      response = await this.env.fetchTelemetry();\n"
     "    } catch {\n      response = { kind: 'error', detail: 'the request seam threw' };\n    }",
     "    const response: TelemetryResponse = await this.env.fetchTelemetry();",
     [RUNTIME]),
    ("U21 a malformed snapshot is treated as a partial one, so the dashboard renders nothing",
     RUNTIME_SRC, "            this.fail('malformed snapshot');\n            break;",
     "            break;",
     [RUNTIME]),
    ("U22 the malformed STANDING entries are dropped, so a typo silently suppresses nothing",
     RUNTIME_SRC, "      unknownStanding: standing.unknown,", "      unknownStanding: [],",
     [RUNTIME]),
    ("U23 §9's count is the number of conditions rather than the number that banner",
     RUNTIME_SRC, "      alarms: alarmCount(poll.displayed),", "      alarms: poll.displayed.length,",
     [RUNTIME]),

    # ⚠ The correction HANDOVER tells step 8 twice not to make: re-stamp `ts` on arrival. It
    # looks like an improvement — the age would then measure how long ago the *page* learned
    # something — and it silently makes every reading look up to six seconds fresher than it is.
    ("U31 the snapshot is re-stamped on arrival, so the age under-states instead of over-stating",
     RUNTIME_SRC, "    const ring = appendSample(this.state.ring, wire);",
     "    const ring = appendSample(this.state.ring, { ...wire, tsMs: this.env.nowMs() });",
     [RUNTIME]),
    ("U32 a partial snapshot is treated as a failed poll — invariant 5, inverted",
     RUNTIME_SRC, "          this.accept(wire);\n          break;",
     "          if (wire.snapshot.errors.length > 0) {\n            this.fail('partial snapshot');\n"
     "            break;\n          }\n          this.accept(wire);\n          break;",
     [RUNTIME]),
    # ⚠ "Carry the last reading forward so the chart does not break" is the tempting fix and the
    # one §6.7 forbids: "traces freeze rather than plotting zeros" means the trace **stops**.
    ("U33 a failed poll re-appends the last sample, so a dead server draws a flat live line",
     RUNTIME_SRC,
     "  private fail(detail: string): void {\n    this.applyMode({",
     "  private fail(detail: string): void {\n    const carried = newestSample(this.state.ring);\n"
     "    if (carried !== null) {\n      this.patch({\n"
     "        ring: { ...this.state.ring, samples: [...this.state.ring.samples, carried] },\n"
     "      });\n    }\n    this.applyMode({",
     [RUNTIME]),
    # ⚠ Hiding a "misleading" growing age while paused is exactly the failure §6.2 wrote the
    # indicator to prevent: "A frozen display that looks live".
    ("U34 the age stops counting while paused, so a frozen dashboard looks current",
     RUNTIME_SRC, "  return newest === null ? null : nowMs - newest.tsMs;",
     "  return newest === null || state.paused ? null : nowMs - newest.tsMs;", [RUNTIME]),

    # ======================= step 8's own guards (HANDOVER §5.3: text, runtime, behaviour)
    ("U24 the runtime schedules its own timer, plainly — the text guard's job",
     RUNTIME_SRC,
     "    this.timer = this.env.setTimer(() => {",
     "    this.timer = setTimeout(() => {",
     [GUARD8]),
    ("U25 the runtime reaches a global scheduler under a computed name — the text guard is blind",
     RUNTIME_SRC,
     "    this.timer = this.env.setTimer(() => {",
     "    const schedule = Reflect.get(globalThis, 'set' + 'Timeout') as (\n"
     "      run: () => void,\n      ms: number,\n    ) => TimerHandle;\n"
     "    this.timer = schedule(() => {",
     [GUARD8]),
    ("U26 the runtime reads document.hidden itself, bypassing the seam every test drives",
     RUNTIME_SRC,
     "  private syncHidden(): void {\n    const hidden = this.env.isHidden();",
     "  private syncHidden(): void {\n    const hidden = document.hidden;",
     [GUARD8]),
    ("U27 the client imports a server module, dragging node:net toward the browser bundle",
     RUNTIME_SRC,
     "import { EXPIRED_PARAM, LOGIN_PATH } from '../auth/login-view';",
     "import { connect } from 'node:net';\n\nvoid connect;\n\n"
     "import { EXPIRED_PARAM, LOGIN_PATH } from '../auth/login-view';",
     [GUARD8]),
    ("U28 the client imports a second lib/auth module, and node:crypto with it",
     RUNTIME_SRC,
     "import { EXPIRED_PARAM, LOGIN_PATH } from '../auth/login-view';",
     "import { SESSION_COOKIE } from '../auth/cookie';\n\nvoid SESSION_COOKIE;\n\n"
     "import { EXPIRED_PARAM, LOGIN_PATH } from '../auth/login-view';",
     [GUARD8]),
    ("U29 the client spells /login itself, so step 7's one definition becomes two",
     RUNTIME_SRC, "export const expiredLoginUrl = (): string => `${LOGIN_PATH}?${EXPIRED_PARAM}=1`;",
     "export const expiredLoginUrl = (): string => `/login?${EXPIRED_PARAM}=1`;", [GUARD8]),
    ("U30 the client spells /api/telemetry a second time",
     RUNTIME_SRC, "export const expiredLoginUrl = (): string =>",
     "export const TELEMETRY = '/api/telemetry';\n\nexport const expiredLoginUrl = (): string =>",
     [GUARD8]),

    # ============== the six ⚠ marks the retrofitted ledger found with nothing behind them
    # ⚠ Every one of these was a test whose name stated a property no mutation in the harness
    # could take away. They are grouped here rather than filed under their sections so that the
    # cost of the ledger is visible: 153 mutations, and six inert marks still got through until
    # `LEDGER_FILES` grew `gaps.test.ts` and `mode.test.ts` and the union was recomputed.
    # ⚠ The other half of "the transition, not the poll", and the guard that makes the
    # `condition.stale` short-circuit invisible for a continuous metric — see `E19`. Removing it
    # restates every condition's band on every poll, which is §6.7's forbidden shape and what
    # `⚠ a stale condition does not re-log its band on every poll` is really resting on.
    ("E21 a band is re-logged on every poll even when it has not changed",
     EVENTS_SRC, "    if (!first && previousBand === band) continue;\n", "", [EVENTS, RUNTIME]),
    ("E19 a stale condition re-logs its band on every poll, so one outage fills the log",
     EVENTS_SRC, "    if (condition.stale) continue;\n", "", [EVENTS, RUNTIME]),
    # ⚠ §6.7's "the transition, not the poll", in the one feed that is deliberately NOT
    # debounced — so the early-out is the only thing standing between it and a line per poll.
    ("E20 the mode is logged on every poll rather than at the crossing",
     EVENTS_SRC, "  const previous = state.logged.get(MODE_KEY);\n  if (previous === band) return state;",
     "  const previous = state.logged.get(MODE_KEY);", [EVENTS]),
    # ⚠ The complement of `G2`: that one keeps `hidden` and drops the other two, so a fixture
    # whose reason IS `hidden` cannot tell it from the real thing. Dropping `hidden` is what
    # `pause() → hide → resume()` needs, and it is the seam neither earlier phase reached.
    ("G6 a hidden tab is not a reason to have a gap, so resuming closes one on a hidden tab",
     GAPS_SRC, "  if (state.hidden) return 'hidden';\n", "", [GAPS, RUNTIME]),
    # ⚠ HANDOVER's very first warning, written as code: "do not re-stamp on arrival". §4 stamps
    # `ts` when the poll BEGAN, so the age can only over-state — and a repeat is not evidence of
    # currency. Re-stamping makes a server whose clock stepped backwards look permanently fresh,
    # which is F4 arriving through the ring instead of through the mode.
    ("U42 a repeated ts re-stamps the newest sample, so a repeat refreshes the age",
     RUNTIME_SRC,
     "      this.applyMode({ consecutiveFailures: 0, lastFailure: null });\n      return;\n    }",
     "      this.applyMode({\n        consecutiveFailures: 0,\n        lastFailure: null,\n"
     "        ring: {\n          ...ring,\n"
     "          newest: ring.newest === null ? null : { ...ring.newest, tsMs: this.env.nowMs() },\n"
     "        },\n      });\n      return;\n    }",
     [RUNTIME]),

    # ============================ lib/client/gaps.ts — §6.7's un-sampled spans (F1/F2/F7)
    # ⚠ Extracted out of `runtime.ts` in reconciliation, so every mutation here is new. The
    # first is the one the old suite could not have caught: a gap closed by a *sample* rather
    # than by a *reason* erases an hour of hidden time and draws a straight line across it.
    ("G1 the gap closes on any arriving sample, so an hour of hidden time is erased",
     GAPS_SRC,
     "  const closing = open !== undefined && open.toMs === null && anyGapReason(state) === null;",
     "  const closing = open !== undefined && open.toMs === null;",
     [GAPS, RUNTIME]),
    ("G2 only the reason that opened the gap is consulted, so pause → hide → resume closes it",
     GAPS_SRC,
     "  if (state.hidden) return 'hidden';\n  if (state.paused) return 'paused';\n"
     "  if (state.consecutiveFailures > 0) return 'failed';\n  return null;",
     "  if (state.hidden) return 'hidden';\n  return null;",
     [GAPS, RUNTIME]),
    # ⚠ `Date.now()` rather than a literal, because the wrong implementation here is not
    # "some other number" but "the other clock" — §6.7's rule is which clock, and a gap
    # opened before the first sample has no `ts` to be hatched back to.
    ("G3 a gap opened before the first sample falls back to the browser's clock",
     GAPS_SRC, "  if (fromMs === null) return gaps;",
     "  if (fromMs === null) return [...gaps, { fromMs: Date.now(), toMs: null, reason }];",
     [GAPS, RUNTIME]),
    ("G4 the prune horizon drops the OPEN gap, so a long absence stops being hatched",
     GAPS_SRC,
     "  const live = next.filter((gap) => gap.toMs === null || gap.toMs >= horizonMs);",
     "  const live = next.filter((gap) => gap.toMs !== null && gap.toMs >= horizonMs);",
     [GAPS]),
    ("G5 openness is read off the FIRST gap, so every gap after the first stays open for ever",
     GAPS_SRC, "gaps.at(-1)?.toMs === null;", "gaps.at(0)?.toMs === null;", [GAPS, RUNTIME]),

    # ================================= lib/client/mode.ts — §6.2's mode (F4/F11), extracted
    ("M1 the negative age is not stale, so a server clock ahead of the browser reads live",
     MODE_SRC, "  if (input.ageMs < 0) return true;\n", "", [MODE, RUNTIME]),
    ("M2 staleAfterMs loses its floor, so a healthy 1 s dashboard flickers stale",
     MODE_SRC,
     "  Math.max(MIN_STALE_AGE_MS, STALE_CADENCE_MULTIPLE * cadenceMs);",
     "  STALE_CADENCE_MULTIPLE * cadenceMs;",
     [MODE, RUNTIME]),
    ("M3 no sample yet is treated as stale, so the dashboard is grey before its first poll",
     MODE_SRC, "  if (input.ageMs === null) return false;", "  if (input.ageMs === null) return true;",
     [MODE, RUNTIME]),
    # ⚠ F4 reintroduced in its exact original form — the narrow fix the module doc warns
    # about. The failure counter is kept, the age term is dropped, and a run of repeats from a
    # server whose clock stepped backwards is green and frozen again.
    ("M4 stale is the failure counter alone, so a run of repeated ts stays green and frozen",
     MODE_SRC, "  return input.ageMs > staleAfterMs(input.cadenceMs);", "  return false;",
     [MODE, RUNTIME]),

    # ============================= lib/client/ring.ts — the two selectors reconciliation moved
    ("R14 the newest sample is newest by ARRIVAL, so the cell and the trace disagree",
     RING_SRC, "export const newestSample = (ring: SampleRing): Sample | null => ring.newest;",
     "export const newestSample = (ring: SampleRing): Sample | null => ring.samples.at(-1) ?? null;",
     [RING, RUNTIME]),
    ("R15 the window is anchored on the browser's clock, so a slow server empties the chart",
     RING_SRC, "  const from = ring.newest.tsMs - windowMs;", "  const from = Date.now() - windowMs;",
     [RING]),

    # ================================== lib/client/runtime.ts — the rest of reconciliation's
    ("U40 afterGap is never computed, so the first reading after a gap is debounced as usual",
     RUNTIME_SRC, "    const afterGap = gapIsOpen(this.state.gaps);", "    const afterGap = false;",
     [RUNTIME]),
    ("U41 refresh now loses its hidden guard, so a hidden tab takes a reading inside its gap",
     RUNTIME_SRC,
     "  refreshNow(): void {\n    if (this.state.hidden) return;\n    void this.poll(true);\n  }",
     "  refreshNow(): void {\n    void this.poll(true);\n  }",
     [RUNTIME]),
    # ⚠ C1. `reschedule()` is the last statement, so a throw anywhere on the arrival path
    # leaves `inFlight` false, no timer pending and the mode still `live`: polling stops in
    # silence, which is the one failure §6.2's age indicator cannot describe.
    ("U36 the arrival path sits outside the try, so a throw while reading a body wedges the poll loop",
     RUNTIME_SRC,
     [("    try {\n      switch (response.kind) {", "    {\n      switch (response.kind) {"),
      ("    } catch {\n      this.fail('the client could not read the response');\n    }\n"
       "    this.reschedule();",
       "    }\n    this.reschedule();")],
     [RUNTIME]),
    ("U37 the prune horizon is measured from the browser's clock rather than the newest ts",
     RUNTIME_SRC,
     "        (ring.newest?.tsMs ?? wire.tsMs) - LONGEST_WINDOW_MS,",
     "        nowMs - LONGEST_WINDOW_MS,",
     [RUNTIME]),
    # ⚠ F9's pair, and the two halves are here to show they are NOT the same guard.
    #
    # `U38` is a plain alias. The text guard sees it; the runtime guard does not, because an
    # alias that is never called reaches nothing. This is the exact line `build.md` claimed
    # was covered and was not.
    #
    # `U39` is the mirror, and it is written with a **split literal** on purpose:
    # `'return fet' + 'ch'` names neither `fetch` nor `globalThis` anywhere in the source, so
    # `codeOnly` — which blanks comments but keeps string contents — hands the text guard
    # nothing to match. Only the runtime wrapper sees it, and only because the call is made
    # from `runtime.ts`'s own frame, which is what `CLIENT_FRAME` attributes on.
    ("U38 a client module aliases fetch without calling it — the TEXT guard's half of F9",
     RUNTIME_SRC, "  private cancelTimer(): void {",
     "  private cancelTimer(): void {\n    const go = fetch;\n    void go;",
     [GUARD8]),
    ("U39 a client module reaches the network by a spelling no text can match — the RUNTIME guard's half",
     RUNTIME_SRC, "  private cancelTimer(): void {",
     "  private cancelTimer(): void {\n"
     "    const reach = Function('return fet' + 'ch')() as (u: string) => Promise<unknown>;\n"
     "    void reach('/api/telemetry').catch(() => undefined);",
     [GUARD8]),

    # ============================== lib/client/wire.ts — §4's `standing`, required since S34
    ("W19 standing is not required, so a server that omits it validates and the list is undefined",
     WIRE_SRC, "    standing === undefined ||\n", "", [WIRE]),
    ("W20 standing is coerced to empty, so a malformed list silently suppresses nothing",
     WIRE_SRC, "  const standing = arrayOf(field(value, 'standing'), plainString);",
     "  const standing = arrayOf(field(value, 'standing'), plainString) ?? [];", [WIRE]),

    # ================================ lib/client/events.ts — §6.5's edges and §6.7's sources
    ("E14 the FIRST errors[] message per source wins, so the assembly's verdict is lost",
     EVENTS_SRC, "  for (const error of errors) present.set(error.source, error.message);",
     "  for (const error of errors)\n    if (!present.has(error.source)) present.set(error.source, error.message);",
     [EVENTS]),
    ("E15 the stale feed reads the retired list, so a condition we stopped seeing is never logged",
     EVENTS_SRC, "  for (const condition of poll.wentStale) {", "  for (const condition of poll.retired) {",
     [EVENTS, RUNTIME]),
    ("E16 a retirement leaves the ledger behind, so a card that comes back logs a band change",
     EVENTS_SRC, "    logged.delete(condition.id);\n    valueHolds.delete(condition.id);\n", "",
     [EVENTS]),
    ("E17 a reading that returns in a new band is logged twice, where §6.5 asks for one entry",
     EVENTS_SRC, "    if (emittedIds.has(condition.id)) continue;\n", "", [EVENTS]),
    ("E18 the dedupe conflict is logged on every poll rather than once per session",
     EVENTS_SRC, "    if (loggedConflicts.has(conflict.id)) continue;\n", "", [EVENTS]),

    # ================== lib/client/observations.ts — which enumerations this snapshot READ
    # ⚠ `gpus: null` is "nvidia-smi failed", not "there are no cards". Treating it as a read
    # enumeration retires every card the moment the collector fails — F3's whole point.
    ("O14 a null enumeration counts as read, so a failed nvidia-smi retires every card",
     OBS_SRC,
     "  if (snapshot.gpus !== null) read.add(GPU_ENUMERATION);\n"
     "  if (snapshot.serving !== null) read.add(SERVING_ENUMERATION);",
     "  read.add(GPU_ENUMERATION);\n  read.add(SERVING_ENUMERATION);",
     [OBS, RUNTIME]),

    # ============= lib/client/observations.ts — D4, §6.5's ErrorSource -> panel join
    # ⚠ The `dbus` fan-out is the thing most likely to be got wrong and least likely to be
    # noticed: it is filed by TWO collectors and read by THREE figures. The handoff's own
    # table names only cooling and serving, so O15 is the wrong implementation a careful
    # reader would actually write.
    ("O15 dbus loses its safety arm, so a D-Bus outage leaves the fanServiceState em dash unexplained",
     OBS_SRC, "    case 'dbus':\n      return ['cooling', 'serving', 'safety'];",
     "    case 'dbus':\n      return ['cooling', 'serving'];", [OBS]),
    ("O16 dbus loses its cooling arm, so the COOLING panel's service row has no entry behind it",
     OBS_SRC, "    case 'dbus':\n      return ['cooling', 'serving', 'safety'];",
     "    case 'dbus':\n      return ['serving', 'safety'];", [OBS]),
    # ⚠ Not in the handoff's table either. `snapshot.ts` assembles
    # `assembledSafety.pwm5Present = cooling.pwm5Present`, so the cooling collector's probe is
    # what stands behind §6.2's SAFETY `pwm5 present` row — the row §3.7 says must never be an
    # alarm with no explanation beside it.
    ("O17 dell-smm stops at cooling, so §3.6's pwm5 alarm loses the entry that explains it",
     OBS_SRC, "    case 'dell-smm':\n      return ['cooling', 'safety'];",
     "    case 'dell-smm':\n      return ['cooling'];", [OBS]),
    # ⚠ Plausible because §6.2's cooling chart really does draw the GPU temperature trace. §6.5
    # settles it the other way: "no other panel is affected".
    ("O18 nvidia-smi also claims cooling, because that panel's chart plots GPU temperature",
     OBS_SRC, "    case 'nvidia-smi':\n      return ['gpu'];",
     "    case 'nvidia-smi':\n      return ['gpu', 'cooling'];", [OBS]),
    # ⚠ The failure the handoff predicts: with only §6.1's grid in mind there is nowhere to put
    # the hostname or the uptime, so both entries become unreachable — filed, carried on the
    # wire, and matched to nothing.
    ("O19 the header has no member, so hostname and proc-uptime explain nothing at all",
     OBS_SRC, "    case 'hostname':\n    case 'proc-uptime':\n      return ['header'];",
     "    case 'hostname':\n    case 'proc-uptime':\n      return [];", [OBS]),
    # ⚠ Reusing `conditionSource`'s vocabulary, which is the trap D4 exists to avoid: the event
    # log answers 'host' for both cpu_temp and ram, and §6.1 draws two panels.
    ("O20 CPU and MEMORY collapse to one host panel, so a failed /proc/meminfo points at the CPU",
     OBS_SRC, "    case 'proc-meminfo':\n      return ['memory'];",
     "    case 'proc-meminfo':\n      return ['cpu'];", [OBS]),
    ("O21 proc-cpuinfo is filed as identity and goes to the header beside the hostname",
     OBS_SRC, "    case 'proc-cpuinfo':\n      return ['cpu'];",
     "    case 'proc-cpuinfo':\n      return ['header'];", [OBS]),
    # ⚠ §4's errors[] order is a pinned decision and `events.ts` reads the LAST message per
    # source, so a panel that tidies its entries by source shows a different D-Bus sentence
    # than the event log does for the same fault.
    ("O22 a panel groups its entries by source, losing §4's pinned errors[] order",
     OBS_SRC,
     "  snapshot.errors.filter((error) => panelsForSource(error.source).includes(panel));",
     "  [...snapshot.errors]\n    .sort((a, b) => a.source.localeCompare(b.source))\n"
     "    .filter((error) => panelsForSource(error.source).includes(panel));", [OBS]),
    # ⚠ The 1:1 assumption, written as a first-match rather than a membership test. Every
    # fan-out keeps its first panel and silently loses the rest.
    ("O23 the join takes a source's first panel only, so every fan-out loses its other panels",
     OBS_SRC,
     "  snapshot.errors.filter((error) => panelsForSource(error.source).includes(panel));",
     "  snapshot.errors.filter((error) => panelsForSource(error.source)[0] === panel);", [OBS]),

    # ==================================================== lib/units.ts (new in step 8)
    ("N1 the fan service unit is renamed, so §3.6's check watches a unit that does not exist",
     UNITS_SRC, "export const FAN_SERVICE_UNIT = 'gpu-fan-control.service';",
     "export const FAN_SERVICE_UNIT = 'gpu-fan-control';", [OBS]),
    ("N2 the join key loses .service, so the SERVING panel stops matching its units",
     UNITS_SRC,
     "export const servingUnitName = (instance: number): string => `llama-server@${instance}.service`;",
     "export const servingUnitName = (instance: number): string => `llama-server@${instance}`;",
     [OBS]),
    ("N3 the client-safe module grows an import, and node:net goes into the browser bundle",
     UNITS_SRC,
     "/** `gpu-fan-control.service` — §3.3's `serviceState` and §3.6's `fanServiceState` (O9). */",
     "import { connect } from 'node:net';\n\nvoid connect;\n\n"
     "/** `gpu-fan-control.service` — §3.3's `serviceState` and §3.6's `fanServiceState` (O9). */",
     [GUARD8]),

    # ====================================================================== type-level
    # ⚠ Not written as a cast: `x as T` always type-checks, so a cast mutation can never fail
    # `tsc` and would be an inert entry. Widen or narrow the declaration instead.
    ("T1 BrowserWindow drifts from the DOM, so `createBrowserEnv(window)` stops compiling",
     ENV_SRC, "  setTimeout(run: () => void, delayMs: number): TimerHandle;",
     "  setTimeout(run: () => void, delayMs: number, tag: symbol): TimerHandle;", "types"),
    ("T2 parseSnapshot takes a snapshot, so every call site has to cast to satisfy it",
     WIRE_SRC, "export const parseSnapshot = (value: unknown): WireSnapshot | null => {",
     "export const parseSnapshot = (value: Record<string, unknown>): WireSnapshot | null => {",
     "types"),
    ("T4 §6.4's kind table loses a member, and a kind silently gets no band decision",
     OBS_SRC, "  link: true,\n};", "};", "types"),
    # ⚠ §3.7's closed vocabulary is only worth having if a nineteenth source is a compile
    # error. Under `strictNullChecks` a missing case makes `panelsForSource` able to return
    # `undefined` against a declared `readonly Panel[]` — TS2366. A `Record` with a default,
    # or a lookup keyed by `string`, would turn that into a silently unexplained em dash.
    ("T5 the source switch loses a case, and a source silently maps to no panel",
     OBS_SRC, "    case 'ufw':\n    case 'dkms':\n      return ['safety'];",
     "    case 'ufw':\n      return ['safety'];", "types"),
    ("T3 the runtime state becomes writable, so a panel can mutate the ring it renders",
     RUNTIME_SRC, "  readonly ring: SampleRing;", "  ring: SampleRing;", "types"),
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

    # ⚠ HANDOVER §1: `ANCHOR NOT FOUND` and `DID NOT BITE` are different findings with
    # different first hypotheses — one means the implementation moved and the mutation needs
    # re-aiming, the other means the mutation applied and no test noticed. This summary used
    # to print both under "DID NOT BITE", which is the more alarming of the two labels and
    # sends a reader hunting for a missing test that is not missing. Found 2026-09-07, when
    # an edit to `cooling.ts` moved `T31`'s anchor and the run reported it as inert.
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
