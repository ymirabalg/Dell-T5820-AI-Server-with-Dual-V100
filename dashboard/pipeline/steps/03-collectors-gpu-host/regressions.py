#!/usr/bin/env python3
"""Step 3's deliberate regressions — evidence that the tests bite.

Step 2's review found a rule that was correct in code and pinned by no test, because the
covering test used observations where a right and a wrong implementation agree. The only
defence is to break the implementation on purpose and watch the suite go red.

Each entry replaces one exact string in one source file with a plausible *wrong*
implementation — the wrong thing someone would actually write, not a syntax error — runs
the affected check, and restores the file. **Every one must exit 1.**

Two kinds of check, matching step 2's harness:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Vitest's ``typecheck`` block only covers ``*.test-d.ts``,
  so a loosened type shows up only under ``tsc``.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs
re-aiming; it does not mean the test is fine.

Run from ``dashboard/`` with pnpm on PATH:

    export PATH="$HOME/.local/bin:$PATH"
    python3 pipeline/steps/03-collectors-gpu-host/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

NUM = "lib/collectors/numbers.test.ts"
NV = "lib/collectors/nvidia-smi.test.ts"
PROC = "lib/collectors/proc.test.ts"
DELTA = "lib/collectors/deltas.test.ts"
COL = "lib/collectors/collect.test.ts"
IO = "lib/collectors/io.test.ts"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied from steps 4–8; only LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# ⚠ **RETROFITTED 2026-09-07, and it was the last harness without one.** Steps 4–8 shipped
# with the ledger; steps 2 and 3 pre-dated it. Step 2's retrofit — done during step 8 —
# immediately found **six ⚠-marked tests with no mutation behind them**, five of them on
# `severity.ts`'s fan-stopped rows, the most safety-critical table in the project. This is
# the same retrofit against the collectors.
#
# Eight consecutive steps shipped a test that NAMES a property it does not check. So:
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
# which case drop the ⚠ rather than the standard — and record it in this docstring.
#
# ⚠ A `types`-kind mutation contributes NO red-test lines, so it can never cover a ⚠ test.
# Ship a second mutation whose check is the vitest file.
LEDGER_FILES = [NUM, NV, PROC, DELTA, COL, IO]

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


# (name, source file, old, new, check)  — or, where one hazard is guarded in two places,
# (name, source file, [(old, new), …], check).
#   A list is needed where one hazard is guarded in two places: breaking only one guard
#   proves nothing, because the other still catches it — and a regression that does not
#   bite is exactly the "test that looks like coverage and is not" this harness exists for.
REGRESSIONS = [
    # ------------------------------------------------ invariant 1 at parse time (O6/O7)
    ("S1 parseDecimalStrict falls back to Number() — `Number('')` is 0",
     "lib/collectors/numbers.ts",
     "  if (!DECIMAL.test(s)) return null;\n  const n = Number(s);\n  return Number.isFinite(n) ? n : null;\n};\n\n/**\n * An unsigned `/proc` counter",
     "  const n = Number(s);\n  return Number.isFinite(n) ? n : null;\n};\n\n/**\n * An unsigned `/proc` counter",
     NUM),
    ("S2 parseIntegerStrict uses parseInt — `parseInt('12 MiB')` is 12",
     "lib/collectors/numbers.ts",
     "  if (!INTEGER.test(s)) return null;\n  const n = Number(s);",
     "  const n = parseInt(s, 10);",
     NUM),
    ("S3 parseText returns the empty string instead of null",
     "lib/collectors/numbers.ts",
     "  return s === '' ? null : s;", "  return s;", NUM),
    ("S4 a genuine zero is treated as absent (the falsy check)",
     "lib/collectors/numbers.ts",
     "  return s === '' || BRACKETED_PLACEHOLDER.test(s);",
     "  return !s || s === '0' || BRACKETED_PLACEHOLDER.test(s);", NUM),
    ("S5 `fields` splits on a single space, so /proc/stat gains a phantom column",
     "lib/collectors/numbers.ts",
     "  return s === '' ? [] : s.split(/\\s+/);", "  return s === '' ? [] : s.split(' ');", NUM),
    ("S6 parseCounter goes through Number, losing exactness past 2^53",
     "lib/collectors/numbers.ts",
     "  if (!UNSIGNED_INTEGER.test(s)) return null;\n  return BigInt(s);",
     "  if (!UNSIGNED_INTEGER.test(s)) return null;\n  return BigInt(Number(s));", NUM),

    # ------------------------------------------------------------------ §3.1 nvidia-smi
    ("S7 `[N/A]` reaches a brand constructor as NaN", "lib/collectors/nvidia-smi.ts",
     "  if (isNotAReading(raw)) return null;\n  const n = parseDecimalStrict(raw);\n  return n === null ? null : brand(n);",
     "  const n = Number(raw);\n  return brand(n);", NV),
    # WARNING S8 anchors on the guard's BODY, never on its comparison. The review's finding
    # was that a mutation anchored on `!==` can only ever prove "a guard exists here" - the
    # operator it would have to change is the string it matches on. S8a/S8b are the other
    # half of that fix: one mutation per DIRECTION, each caught by a fixture on its own side
    # of the boundary. Both sides are required; either alone passed all 807 tests.
    ("S8 the column-count guard is inert - the row is parsed anyway",
     "lib/collectors/nvidia-smi.ts",
     "      problems.push(\n        `unparseable row: expected ${NVIDIA_SMI_FIELDS.length} columns, got ${cells.length} — ${excerpt(line)}`,\n      );\n      continue;",
     "      void excerpt;", NV),
    ("S8a the column guard weakened to `<` - a TWELVE-column row shifts every field left",
     "lib/collectors/nvidia-smi.ts",
     "    if (cells.length !== NVIDIA_SMI_FIELDS.length) {",
     "    if (cells.length < NVIDIA_SMI_FIELDS.length) {", NV),
    ("S8b the column guard weakened to `>` - a short row is parsed with missing columns",
     "lib/collectors/nvidia-smi.ts",
     "    if (cells.length !== NVIDIA_SMI_FIELDS.length) {",
     "    if (cells.length > NVIDIA_SMI_FIELDS.length) {", NV),
    ("S52 utilization.gpu loses its 0-100 range check (§3.1)",
     "lib/collectors/nvidia-smi.ts",
     "      utilPct: utilisationReading(cells[COL.utilPct]),",
     "      utilPct: reading(cells[COL.utilPct], percent),", NV),
    ("S53 the utilisation range excludes its own upper bound (off by one at 100)",
     "lib/collectors/nvidia-smi.ts",
     "  if (n === null || n < UTIL_PCT_MIN || n > UTIL_PCT_MAX) return null;",
     "  if (n === null || n < UTIL_PCT_MIN || n >= UTIL_PCT_MAX) return null;", NV),
    ("S9 a row with an unreadable index becomes GPU 0", "lib/collectors/nvidia-smi.ts",
     "    const index = parseIntegerStrict(cells[COL.index]);\n    if (index === null) {",
     "    const index = parseIntegerStrict(cells[COL.index]) ?? 0;\n    if (false) {", NV),
    ("S10 an unparseable throttle mask becomes 0x0 — a card reported as not throttling",
     "lib/collectors/nvidia-smi.ts",
     "  return parseThrottleMask(candidate) === null ? null : candidate;",
     "  return parseThrottleMask(candidate) === null ? throttleMask('0x0') : candidate;", NV),
    ("S11 the query field order drifts from §3.1", "lib/collectors/nvidia-smi.ts",
     "  'temperature.gpu',\n  'power.draw',", "  'power.draw',\n  'temperature.gpu',", NV),
    ("S12 a row that fails takes the good rows with it", "lib/collectors/nvidia-smi.ts",
     "      continue;\n    }\n\n    const index =", "      return { value: [], problems };\n    }\n\n    const index =", NV),

    # ---------------------------------------------------------------------- §3.2 /proc
    ("S13 /proc/stat matched by prefix, so `cpu0` is read as the aggregate",
     "lib/collectors/proc.ts",
     "    if (parts[0] !== 'cpu') continue;", "    if (!line.startsWith('cpu')) continue;", PROC),
    ("S14 guest and guest_nice double-counted into busy", "lib/collectors/proc.ts",
     [("const CPU_BUSY_FIELDS = ['user', 'nice', 'system', 'irq', 'softirq', 'steal'] as const;",
       "const CPU_BUSY_FIELDS = ['user', 'nice', 'system', 'irq', 'softirq', 'steal', 'guest', 'guest_nice'] as const;"),
      ("  'steal',\n] as const;", "  'steal',\n  'guest',\n  'guest_nice',\n] as const;")], PROC),
    ("S15 a corrupt /proc/stat field is skipped instead of failing the line",
     "lib/collectors/proc.ts",
     "      if (n === null) {\n        return { value: null, problems: [`field \\`${name}\\` is not a counter`] };\n      }",
     "      if (n === null) continue;", PROC),
    ("S16 memUsed falls back to MemTotal - MemFree — page cache read as consumption",
     "lib/collectors/proc.ts",
     "  const memAvailable = read('MemAvailable');",
     "  const memAvailable = meminfoKiB(map, 'MemAvailable') ?? read('MemFree');", PROC),
    ("S17 the meminfo unit is assumed rather than required", "lib/collectors/proc.ts",
     "  if (parts.length !== 2 || parts[1] !== 'kB') return null;",
     "  if (parts.length < 1) return null;", PROC),
    ("S18 loadavg reports two of three averages instead of null", "lib/collectors/proc.ts",
     "  if (one === null || five === null || fifteen === null) {",
     "  if (one === null && five === null && fifteen === null) {", PROC),
    ("S19 uptime rounds instead of flooring, claiming a minute that has not elapsed",
     "lib/collectors/proc.ts", "  return clean(seconds(Math.floor(n)));",
     "  return clean(seconds(Math.round(n)));", PROC),
    ("S20 /proc/net/dev split on whitespace — the jammed-interface trap",
     "lib/collectors/proc.ts",
     "    const colon = line.indexOf(':');\n    if (colon === -1) continue;\n    if (line.slice(0, colon).trim() !== iface) continue;\n\n    const cols = fields(line.slice(colon + 1));",
     "    const all = fields(line);\n    if (all[0] !== `${iface}:`) continue;\n\n    const cols = all.slice(1);", PROC),
    ("S54a the /proc/net/dev column guard weakened to `<` - a 17-column line is accepted",
     "lib/collectors/proc.ts",
     "    if (cols.length !== NET_COLUMNS) {", "    if (cols.length < NET_COLUMNS) {", PROC),
    ("S54b the /proc/net/dev column guard weakened to `>` - a short line is accepted",
     "lib/collectors/proc.ts",
     "    if (cols.length !== NET_COLUMNS) {", "    if (cols.length > NET_COLUMNS) {", PROC),
    ("S21 rx and tx byte offsets shifted onto the packet counts", "lib/collectors/proc.ts",
     "const NET_RX_BYTES = 0;\nconst NET_TX_BYTES = 8;", "const NET_RX_BYTES = 1;\nconst NET_TX_BYTES = 9;", PROC),
    ("S22 cores read from `cpu cores` instead of distinct topology pairs",
     "lib/collectors/proc.ts",
     "      case 'physical id':\n        physicalId = parseText(raw);\n        break;",
     "      case 'cpu cores':\n        physicalId = '0';\n        coreId = parseText(raw);\n        break;\n      case 'physical id':\n        break;", PROC),
    ("S23 cpuModel trimmed in the collector — the snapshot cannot be un-trimmed",
     "lib/collectors/proc.ts", "        cpuModel ??= parseText(raw);",
     "        cpuModel ??= parseText(raw)?.replace(/\\(R\\)|\\(TM\\)|Intel |CPU @.*/g, '').trim() ?? null;", PROC),
    ("S24 cores/threads report 0 instead of null when absent", "lib/collectors/proc.ts",
     "      cores: pairs.size === 0 ? null : pairs.size,\n      threads: threads === 0 ? null : threads,",
     "      cores: pairs.size,\n      threads,", PROC),
    ("S25 an operstate outside §3.7's seven values is passed through",
     "lib/collectors/proc.ts",
     "  const found = LINK_STATES.find((s) => s === raw);",
     "  const found = (raw ?? undefined) as (typeof LINK_STATES)[number] | undefined;", PROC),
    ("S26 coretemp read by index instead of by label", "lib/collectors/proc.ts",
     "    if (parseText(contents) !== PACKAGE_LABEL) continue;", "    if (match[1] !== 'temp1') continue;", PROC),
    ("S27 an unreadable coretemp input becomes 0 °C (HANDOVER O6)",
     "lib/collectors/proc.ts",
     "    const milli = parseDecimalStrict(raw);\n    if (milli === null) {",
     "    const milli = Number(raw);\n    if (false) {", PROC),
    ("S28 coretemp rounded in the collector rather than by §6.6", "lib/collectors/proc.ts",
     "    return clean(celsius(milli / MILLI));", "    return clean(celsius(Math.round(milli / MILLI)));", PROC),
    ("S29 an empty /etc/hostname becomes the empty string", "lib/collectors/proc.ts",
     "  const name = parseText(text.split(/\\r?\\n/)[0]);",
     "  const name = (text.split(/\\r?\\n/)[0] ?? '').trim();", PROC),

    # ------------------------------------------------------------- §6.7 / O7 the deltas
    ("S30 the first sample reports 0 instead of null (§6.7)", "lib/collectors/deltas.ts",
     "  if (prev === null || next === null) return null;",
     "  if (prev === null || next === null) return percent(0);", DELTA),
    ("S31 the first network sample reports 0 B/s instead of null (§6.7)",
     "lib/collectors/deltas.ts",
     "  if (prev === null || prev.net === null || next.net === null) return none;",
     "  if (prev === null || prev.net === null || next.net === null)\n    return { rxBytesPerSec: bytesPerSecond(0), txBytesPerSec: bytesPerSecond(0) };", DELTA),
    ("S32 O7 — a negative delta is clamped to 0 instead of sent as null",
     "lib/collectors/deltas.ts", "  if (d < 0n || d > MAX_SAFE) return null;",
     "  if (d > MAX_SAFE) return null;\n  if (d < 0n) return 0;", DELTA),
    ("S33 O7 — a negative cpuPct reaches the UI", "lib/collectors/deltas.ts",
     "  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;",
     "  if (!Number.isFinite(pct)) return null;", DELTA),
    ("S34 the naive busy/total with no guards — 0/0 is NaN, and percent(NaN) type-checks",
     "lib/collectors/deltas.ts",
     [("  if (busy === null || total === null || total === 0) return null;",
       "  if (busy === null || total === null) return null;"),
      ("  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;",
       "  if (pct < 0 || pct > 100) return null;")], DELTA),
    ("S35 a backwards clock produces a negative rate (both guards removed)",
     "lib/collectors/deltas.ts",
     [("  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return none;",
       "  if (!Number.isFinite(elapsedMs) || elapsedMs === 0) return none;"),
      ("    return Number.isFinite(r) && r >= 0 ? bytesPerSecond(r) : null;",
       "    return Number.isFinite(r) ? bytesPerSecond(r) : null;")], DELTA),
    ("S36 a delta too large to convert exactly is rounded rather than rejected",
     "lib/collectors/deltas.ts", "  if (d < 0n || d > MAX_SAFE) return null;",
     "  if (d < 0n) return null;", DELTA),

    # ------------------------------------------- invariant 5 and §3.7's ErrorSource set
    ("S37 nvidia-smi absent reported as `[]` — the enumeration confused with finding none",
     "lib/collectors/collect.ts",
     "    return { gpus: null, errors: tag('nvidia-smi', [reason(e)]) };",
     "    return { gpus: [], errors: tag('nvidia-smi', [reason(e)]) };", COL),
    ("S38 §3.7 — a failed link read attributed to the byte counters",
     "lib/collectors/collect.ts",
     "        'net-operstate',\n        `${paths.sysClassNet}/${iface}/operstate`,",
     "        'proc-net-dev',\n        `${paths.sysClassNet}/${iface}/operstate`,", COL),
    ("S39 a failed read throws instead of becoming an errors[] entry (invariant 5)",
     "lib/collectors/collect.ts",
     "  let text: string;\n  try {\n    text = await io.readFile(path);\n  } catch (e) {\n    return { value: fallback, errors: tag(source, [`${path}: ${reason(e)}`]) };\n  }",
     "  const text: string = await io.readFile(path);", COL),
    ("S40 one failed read blanks the whole host object", "lib/collectors/collect.ts",
     "      cpuModel: cpuinfo.value.cpuModel,", "      cpuModel: stat.value === null ? null : cpuinfo.value.cpuModel,", COL),
    # ⚠ S41/S42/S55 re-aimed in step 4's reconciliation. `collectCpuTemp` adopted the
    # shared hwmon walk (`lib/collectors/hwmon.ts`) — the second caller made the right
    # abstraction visible — so the loop these three mutated no longer exists here. They now
    # attack the same three properties at their new sites, and they still run step 3's own
    # `collect.test.ts`, which is what makes them evidence that the adoption preserved
    # step 3's protection rather than merely leaving its tests green.
    ("S41 coretemp located by a fixed hwmon index instead of by name",
     "lib/collectors/collect.ts",
     "  const node = await findHwmonNode(io, paths.hwmonRoot, CORETEMP_NAME);",
     "  const node = { found: true as const, dir: `${paths.hwmonRoot}/hwmon0` };\n  void findHwmonNode;",
     COL),
    ("S42 the collector falls back to another sensor when coretemp is absent",
     "lib/collectors/collect.ts",
     "  const node = await findHwmonNode(io, paths.hwmonRoot, CORETEMP_NAME);",
     "  let node = await findHwmonNode(io, paths.hwmonRoot, CORETEMP_NAME);\n  if (!node.found) node = await findHwmonNode(io, paths.hwmonRoot, 'dell_smm');",
     COL),
    ("S43 the interface is hard-coded rather than flowing to both sources",
     "lib/collectors/collect.ts",
     "        `${paths.sysClassNet}/${iface}/operstate`,",
     "        `${paths.sysClassNet}/eno1/operstate`,", COL),
    ("S55 an UNREADABLE hwmon node is swallowed and reported as an ABSENT one (A5)",
     "lib/collectors/hwmon.ts",
     "      unidentified.push(`${entry} (${reason(e)})`);\n      continue;",
     "      void e;\n      continue;", COL),
    ("S56 a parse problem is not prefixed with the path that was read (A9)",
     "lib/collectors/collect.ts",
     "        parsed.problems.map((problem) => `${path}: ${problem}`),",
     "        parsed.problems,", COL),
    ("S57 a coretemp parse problem loses the DISCOVERED hwmon directory (A9, step 4's case)",
     "lib/collectors/collect.ts",
     "      parsed.problems.map((problem) => `${dir}: ${problem}`),",
     "      parsed.problems,", COL),
    ("S44 a mount path drifts from §2.2", "lib/collectors/collect.ts",
     "  etcHostname: '/etc/hostname',", "  etcHostname: '/host/etc/hostname',", COL),

    # ----------------------------------------------------------------- the real nodeIo
    ("S50 a synchronous throw from the IO layer escapes as a 500 (invariant 5)",
     "lib/collectors/collect.ts",
     "  let text: string;\n  try {\n    text = await io.readFile(path);\n  } catch (e) {",
     "  let text: string;\n  text = await io.readFile(path);\n  try {\n  } catch (e) {\n    void 0;\n  }\n  if (false) {", COL),
    ("S51 a throwing `uname` fails the whole poll instead of nulling one field",
     "lib/collectors/collect.ts",
     "  try {\n    return parseText(io.unameRelease());\n  } catch {\n    return null;\n  }",
     "  return parseText(io.unameRelease());", COL),

    ("S45 nodeIo.readFile returns a Buffer, which every fake would still accept",
     "lib/collectors/io.ts", "  readFile: (path) => readFile(path, 'utf8'),",
     "  readFile: (path) => readFile(path).then((b) => b as unknown as string),", IO),
    ("S46 nodeIo.run reports `Command failed: …` instead of the command's own stderr",
     "lib/collectors/io.ts",
     "  const said = stderr.trim();\n  if (said !== '') return said;",
     "  const said = stderr.trim();\n  void said;",
     IO),
    # WARNING S47 is the mutation that would have caught A1, and the child it runs against
    # is the whole point: `/bin/sleep` HONOURS SIGTERM, which is the one input class where
    # the broken implementation and the correct one are indistinguishable. The old S47
    # deleted the `timeout:` option and bit only because `/bin/sleep 5` dies when signalled,
    # so it proved the option was PRESENT and never that it BOUNDS. `io.test.ts` now drives
    # a `trap "" TERM; sleep 9` child and asserts elapsed time against the deadline.
    ("S47 nodeIo.run goes back to execFile's own `timeout:` - inert against a child that ignores SIGTERM",
     "lib/collectors/io.ts",
     [("        { encoding: 'utf8', windowsHide: true, signal: ac.signal, killSignal: 'SIGKILL' },",
       "        { encoding: 'utf8', windowsHide: true, timeout: timeoutMs },"),
      ("        ac.abort();\n        child.stdout?.destroy();\n        child.stderr?.destroy();\n        child.unref();\n        finish(() => {\n          reject(expired());\n        });",
       "        ac.abort();\n        void expired;")], IO),
    ("S47b the deadline only aborts - abort does not reach a child that has already exited",
     "lib/collectors/io.ts",
     "        ac.abort();\n        child.stdout?.destroy();\n        child.stderr?.destroy();\n        child.unref();\n        finish(() => {\n          reject(expired());\n        });",
     "        ac.abort();\n        void expired;", IO),
    ("S47c the deadline settles the promise but leaks the pipes (a bare Promise.race)",
     "lib/collectors/io.ts",
     "        child.stdout?.destroy();\n        child.stderr?.destroy();\n        child.unref();\n",
     "", IO),
    ("S58 a signal-killed process reports execFile's argv dump, not the signal (A6)",
     "lib/collectors/io.ts",
     "  if (error.signal != null) return `${command}: killed by ${error.signal}`;\n  if (typeof error.code === 'number') return `${command}: exited ${error.code}`;\n",
     "", IO),

    # ------------------------------------------------------------- F2, the `@/` path alias
    # Vitest does not read tsconfig `paths`, so without this the alias resolves under `tsc`
    # and `next build` and fails at TEST time. `lib/guardrails.test.ts` proves it by
    # importing through `@/` for real; a text assertion against the config would be this
    # box's own recurring mistake ("writing the config is not evidence it took") in a new
    # place, and would still pass with the alias deleted.
    ("S59 the `@/` alias is dropped from vitest.config.mts", "vitest.config.mts",
     "  resolve: {\n    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },\n  },\n",
     "", "lib/guardrails.test.ts"),

    # ------------------------------------------------------------------------ type-level
    ("S48 Gpu.tempC loosened off its Celsius brand", "lib/types.ts",
     "  readonly tempC: Celsius | null;", "  readonly tempC: number | null;", "types"),
    ("S49 the collector mints Celsius from an unvalidated number", "lib/collectors/proc.ts",
     "  readonly memUsedGiB: GiB | null;", "  readonly memUsedGiB: number | null;", "types"),
]



# ---------------------------------------------------------------------------
# ⚠ Added 2026-09-07 by the ledger retrofit. Each of these backs a ⚠-marked test that no
#   existing mutation could redden — the retrofit found four, and this is three of them.
#   (The fourth, `and the shift it prevents is what would have been reported`, had its ⚠
#   dropped instead: it asserts properties of the fixture plus one fact about
#   `lib/throttle.ts`, which is step 2's file, so no step-3 mutation can reach it.)
# ---------------------------------------------------------------------------

REGRESSIONS += [
    # ⚠ Step 3's review, A7: "no invented ranges for GPU temperature, power, memory or
    # clock. No measured basis, and a wrong bound silently discards a real reading."
    # `utilPct` alone is range-checked, because 0–100 *is* its unit. This mutation is the
    # plausible wrong move a later reader makes on seeing that one range and generalising it.
    ("S65 temperature gains a plausibility range, so a real reading is discarded as absurd",
     "lib/collectors/nvidia-smi.ts",
     "      tempC: reading(cells[COL.tempC], celsius),",
     "      tempC: ((v) => (v === null || (v >= 0 && v <= 150) ? v : null))(\n"
     "        reading(cells[COL.tempC], celsius),\n      ),",
     NV),
    # ⚠ Fixture symmetry (HANDOVER §5.1). O7's guard has two halves — a backwards **busy**
    # counter and a backwards **total** — and only the busy half was mutated. Note the
    # obvious mutation does NOT work: dropping `total === null` still yields `null`, because
    # `busy / null` is `Infinity` and the `Number.isFinite` guard below catches it. The
    # distinguishing wrong implementation is the one that makes a backwards delta into a
    # *number*, which is the clamping O7 exists to forbid.
    ("S66 a backwards total counter is made positive, so a reboot forges a CPU percentage",
     "lib/collectors/deltas.ts",
     "  const total = safeDelta(prev.total, next.total);",
     "  const total = Math.abs(Number(next.total - prev.total));",
     DELTA),
    # ⚠ §3.1: "`gpus: null` = the enumeration could not be performed … `gpus: []` = the
    # command succeeded and produced no parseable rows." Collapsing the two is the wrong
    # implementation someone writes on the reasoning "no rows means no cards means null" —
    # and it destroys the distinction steps 1 and 2 spent a decision on.
    ("S67 an empty parse collapses to null, so `it ran and found nothing` reads as `we could not look`",
     "lib/collectors/collect.ts",
     "  return { gpus: parsed.value, errors: tag('nvidia-smi', problems) };",
     "  return {\n    gpus: parsed.value.length === 0 ? null : parsed.value,\n"
     "    errors: tag('nvidia-smi', problems),\n  };",
     COL),
    # ⚠ §3.1: "`gpus: []` … **always carries an `errors[]` entry**, so it is never silent."
    # The realistic `[]` carries one problem per unparseable row; the branch that produced `[]`
    # from no output at all carried none until 2026-09-07.
    ("S68 an empty parse with no output is silent, against §3.1's `never silent`",
     "lib/collectors/collect.ts",
     "  const problems =\n    parsed.value.length === 0 && parsed.problems.length === 0\n"
     "      ? ['nvidia-smi exited 0 and printed nothing — no rows to parse, and no reason given']\n"
     "      : parsed.problems;",
     "  const problems = parsed.problems;",
     COL),
]



# ---------------------------------------------------------------------------
# ⚠ `pathsFrom` — the container/host mount override, added 2026-09-07
# ---------------------------------------------------------------------------
#
# The first native deploy read every collector correctly and failed on exactly two paths:
# §2.2 mounts `/` and `/home` at `/host/root` and `/host/home`, so the defaults are right in
# the container and wrong outside it. These mutations hold the override to what it is for.

REGRESSIONS += [
    # ⚠ The dangerous direction. Defaulting to the HOST paths means that inside the container
    # `statvfs('/')` measures the container's own overlay — a plausible-looking number about a
    # filesystem nobody asked about, reported with no error at all.
    ("S69 the mount defaults become the host paths, so the container measures its own overlay",
     "lib/collectors/collect.ts",
     "  rootMount: '/host/root',\n  homeMount: '/host/home',",
     "  rootMount: '/',\n  homeMount: '/home',",
     COL),
    ("S70 an empty ROOT_MOUNT overrides the default, so statvfs is handed nothing",
     "lib/collectors/collect.ts",
     "  rootMount: env[ROOT_MOUNT_KEY]?.trim() || DEFAULT_PATHS.rootMount,",
     "  rootMount: env[ROOT_MOUNT_KEY]?.trim() ?? DEFAULT_PATHS.rootMount,",
     COL),
    ("S71 ROOT_MOUNT silently drives the HOME mount too, so both figures describe one filesystem",
     "lib/collectors/collect.ts",
     "  homeMount: env[HOME_MOUNT_KEY]?.trim() || DEFAULT_PATHS.homeMount,",
     "  homeMount: env[ROOT_MOUNT_KEY]?.trim() || DEFAULT_PATHS.homeMount,",
     COL),
    ("S72 the override reaches every path, not only the two that are remapped",
     "lib/collectors/collect.ts",
     "export const pathsFrom = (env: Environment): CollectorPaths => ({\n  ...DEFAULT_PATHS,",
     "export const pathsFrom = (env: Environment): CollectorPaths => ({\n  ...DEFAULT_PATHS,\n"
     "  procStat: env[ROOT_MOUNT_KEY]?.trim() || DEFAULT_PATHS.procStat,",
     COL),
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
        # Most entries are (name, src, old, new, check); the few that need to break two
        # guards at once are (name, src, [(old, new), …], check).
        if len(entry) == 5:
            name, src, old, new, check = entry
            pairs = [(old, new)]
        else:
            name, src, pairs, check = entry
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
        checks = check if isinstance(check, list) else [check]
        cmd = (
            ["pnpm", "typecheck"]
            if checks == ["types"]
            else ["pnpm", "vitest", "run", *checks]
        )
        try:
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
            print("     ", f[:260])
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
