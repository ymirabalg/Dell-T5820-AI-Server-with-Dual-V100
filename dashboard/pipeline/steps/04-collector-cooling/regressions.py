#!/usr/bin/env python3
"""Step 4's deliberate regressions — evidence that the cooling tests bite.

Same harness as steps 2 and 3. Each entry replaces one exact string in one source file
with a plausible *wrong* implementation — the wrong thing someone would actually write,
not a syntax error — runs the affected check, and restores the file. **Every one must
exit 1.**

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Vitest's ``typecheck`` block only covers ``*.test-d.ts``,
  so a loosened type shows up only under ``tsc``.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs
re-aiming; it does not mean the test is fine.

⚠ HANDOVER §5's rule is honoured throughout: **no mutation anchors on the comparison it
means to weaken.** Where a guard has two sides, there are two mutations — one per
direction — because a single mutation of ``x < 0`` can only ever prove that *a* guard is
there, never that it points the right way.

Run from ``dashboard/`` with pnpm on PATH:

    export PATH="$HOME/.local/bin:$PATH"
    python3 pipeline/steps/04-collector-cooling/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

SMM = "lib/collectors/dell-smm.test.ts"
COOL = "lib/collectors/cooling.test.ts"
HW = "lib/collectors/hwmon.test.ts"
DL = "lib/collectors/deadline.test.ts"
SEV = "lib/severity.test.ts"
COND = "lib/conditions.test.ts"
GUARD = "lib/guardrails.test.ts"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger
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
#
# Steps 5–12: copy this block. `LEDGER_FILES` is the only line that changes.

LEDGER_FILES = [SMM, COOL, HW, DL, SEV, COND, GUARD]

# `test('…')`, `it('…')` and `test.each(…)('…')`, single- or double-quoted.
MARKED = re.compile(
    r"""(?:^|\s)(?:test|it)(?:\.each\([^\n]*\))?\(\s*(['"])((?:(?!\1).)*⚠(?:(?!\1).)*)\1"""
)


def marked_tests():
    """Every ⚠-marked test name, as (file, matchable-prefix) pairs.

    `test.each` interpolates its arguments into the reported name, so only the literal
    text before the first `%` is matchable. That prefix is what gets looked for in
    vitest's FAIL lines.
    """
    found = []
    for rel in LEDGER_FILES:
        text = pathlib.Path(rel).read_text()
        for m in MARKED.finditer(text):
            name = m.group(2)
            prefix = name.split("%")[0].strip()
            if len(prefix) < 12:  # too short to match without false positives
                print(f"!!! {rel}: ⚠ test name is unmatchably short: {name!r}")
            found.append((rel, name, prefix))
    return found


def red_test_lines(out):
    """The `FAIL <file> > <suite> > <test>` lines vitest prints, one per failing test."""
    return [l.strip() for l in out.splitlines() if l.strip().startswith("FAIL ")]


# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
# where one hazard is guarded in two places.
REGRESSIONS = [
    # ================================================================= O8, the probe
    # The single most dangerous class in this project: turning "I could not look" into
    # "GPU fan control is gone", on a box with two passively-cooled 250 W cards.
    ("T1 pwm5Present is DERIVED from ch5Mode — §3.7's forbidden biconditional",
     "lib/collectors/dell-smm.ts",
     """export const pwm5PresentFrom = (probe: Pwm5Probe): Safety['pwm5Present'] => {
  switch (probe.outcome) {""",
     """export const pwm5PresentFrom = (probe: Pwm5Probe): Safety['pwm5Present'] => {
  return ch5ModeFrom(probe) !== null;
  // eslint-disable-next-line no-unreachable
  switch (probe.outcome) {""",
     SMM),
    ("T2 an unlocated probe alarms instead of reporting unknown",
     "lib/collectors/dell-smm.ts",
     """    case 'unlocated':
      // §3.7: "unknown, not alarm". The check could not be performed.
      return null;""",
     """    case 'unlocated':
      return false;""",
     SMM),
    ("T3 an unreadable pwm5 alarms — an EACCES becomes the DKMS failure",
     "lib/collectors/dell-smm.ts",
     """    case 'manual':
    case 'ec-auto':
    case 'unreadable':
      // The node was listed. Whether it can be *read* is a different question, and it is
      // `ch5Mode`'s, not this one's.
      return true;""",
     """    case 'manual':
    case 'ec-auto':
      return true;
    case 'unreadable':
      return false;""",
     SMM),
    ("T4 an absent pwm5 node is reported as unknown — the alarm is lost entirely",
     "lib/collectors/dell-smm.ts",
     """    case 'absent':
      // §3.6's alarm: `dell_smm` answered and there is no `pwm5` — the DKMS 5-fan module
      // did not load, so channel 5 is uncontrollable.
      return false;""",
     """    case 'absent':
      return null;""",
     SMM),
    ("T5 ch5Mode is derived from pwm5Present — the other direction of the same error",
     "lib/collectors/dell-smm.ts",
     """export const ch5ModeFrom = (probe: Pwm5Probe): Ch5Mode => {
  switch (probe.outcome) {""",
     """export const ch5ModeFrom = (probe: Pwm5Probe): Ch5Mode => {
  return pwm5PresentFrom(probe) === true ? 'manual' : null;
  // eslint-disable-next-line no-unreachable
  switch (probe.outcome) {""",
     SMM),

    # ============================================== invariant 3 — ENODATA is HEALTHY
    ("T6 ENODATA is treated as a failure, so EC auto reads as unavailable",
     "lib/collectors/dell-smm.ts",
     "    if (read.code === PWM5_EC_AUTO_ERRNO) return clean({ outcome: 'ec-auto' });\n",
     "",
     SMM),
    ("T7 ENODATA is matched on the MESSAGE instead of the code",
     "lib/collectors/dell-smm.ts",
     "    if (read.code === PWM5_EC_AUTO_ERRNO) return clean({ outcome: 'ec-auto' });",
     "    if (read.message.includes(PWM5_EC_AUTO_ERRNO)) return clean({ outcome: 'ec-auto' });",
     SMM),
    ("T8 EC auto carries an errors[] entry — invariant 3 says it is not an error",
     "lib/collectors/dell-smm.ts",
     "    if (read.code === PWM5_EC_AUTO_ERRNO) return clean({ outcome: 'ec-auto' });",
     "    if (read.code === PWM5_EC_AUTO_ERRNO)\n      return { value: { outcome: 'ec-auto' }, problems: [read.message] };",
     SMM),
    ("T9 ec-auto is folded into 'mode unknown'",
     "lib/collectors/dell-smm.ts",
     "    case 'ec-auto':\n      return 'ec-auto';",
     "    case 'ec-auto':\n      return null;",
     SMM),
    ("T10 the wrapper throws the errno away, so ENODATA can never be recognised",
     "lib/collectors/cooling.ts",
     "    read = { kind: 'failed', code: errnoCodeOf(e), message: reason(e) };",
     "    read = { kind: 'failed', code: null, message: reason(e) };",
     COOL),

    # ==================================================== O6, the pwm5 register range
    ("T11 pwm5 goes through Number() — `Number('')` is 0, so a truncated read is `OFF pwm 0`",
     "lib/collectors/dell-smm.ts",
     "  const value = parseIntegerStrict(read.text);\n  if (value === null) {",
     "  const value: number | null = Number(read.text);\n  if (Number.isNaN(value)) {",
     SMM),
    ("T12 the 0-255 range check is dropped entirely — 256 becomes a duty",
     "lib/collectors/dell-smm.ts",
     "  if (pwmStateName(pwm(value)) === null) return clean({ outcome: 'unreadable' });\n",
     "",
     SMM),
    # ⚠ T13/T14 are the two DIRECTIONS of that guard. Neither anchors on a comparison:
    # each replaces the whole guard with a one-sided one, and each is caught by a fixture
    # on its own side of the register.
    ("T13 only the LOW side is checked — 256 passes as a duty",
     "lib/collectors/dell-smm.ts",
     "  if (pwmStateName(pwm(value)) === null) return clean({ outcome: 'unreadable' });",
     "  if (value < 0) return clean({ outcome: 'unreadable' });",
     SMM),
    ("T14 only the HIGH side is checked — -1 passes as a duty",
     "lib/collectors/dell-smm.ts",
     "  if (pwmStateName(pwm(value)) === null) return clean({ outcome: 'unreadable' });",
     "  if (value > 255) return clean({ outcome: 'unreadable' });",
     SMM),
    ("T15 an out-of-range duty raises an errors[] entry, against §6.7",
     "lib/collectors/dell-smm.ts",
     "  if (pwmStateName(pwm(value)) === null) return clean({ outcome: 'unreadable' });",
     "  if (pwmStateName(pwm(value)) === null)\n    return { value: { outcome: 'unreadable' }, problems: ['`pwm5` out of range'] };",
     SMM),
    ("T16 a truncated pwm5 is silent — no entry, so the panel cannot explain the dash",
     "lib/collectors/dell-smm.ts",
     "    return { value: { outcome: 'unreadable' }, problems: [`\\`${PWM5_FILE}\\` is not a reading`] };",
     "    return clean({ outcome: 'unreadable' });",
     SMM),

    # ============================================= invariant 1 at the fan tachometers
    ("T17 fanN_input goes through Number() — an empty read becomes 0 RPM",
     "lib/collectors/dell-smm.ts",
     "  const value = parseIntegerStrict(raw);\n  if (value === null) {",
     "  const value: number | null = Number(raw);\n  if (Number.isNaN(value)) {",
     SMM),
    # ⚠ T18/T19: the two directions of the RPM floor, again one mutation each.
    ("T18 the floor swallows a genuine zero — a dead fan renders as no reading",
     "lib/collectors/dell-smm.ts",
     "  return value < 0 ? null : rpm(value);",
     "  return value <= 0 ? null : rpm(value);",
     SMM),
    ("T19 the floor is gone — a negative revolution count becomes a reading",
     "lib/collectors/dell-smm.ts",
     "  return value < 0 ? null : rpm(value);",
     "  return rpm(value);",
     SMM),
    ("T20 an implausible tach is 'sanitised' to null, deleting §6.3's absolute alarm",
     "lib/collectors/dell-smm.ts",
     "  return value < 0 ? null : rpm(value);",
     "  return value < 0 || value > 5100 ? null : rpm(value);",
     SMM),
    ("T21 an absent channel is reported as a failed read — noise on a standing alarm",
     "lib/collectors/dell-smm.ts",
     "  if (raw === undefined) return null;",
     "  if (raw === undefined) {\n    problems.push(`\\`${file}\\` is not a reading`);\n    return null;\n  }",
     SMM),
    ("T22 channel 5 is read from channel 4's file — the off-by-one that hides the GPU fan",
     "lib/collectors/dell-smm.ts",
     "    fan5Rpm: fanRpm(files, 5, problems),",
     "    fan5Rpm: fanRpm(files, 4, problems),",
     SMM),
    ("T23 NO_FANS is five zeroes instead of five nulls",
     "lib/collectors/dell-smm.ts",
     """export const NO_FANS: FanReadings = {
  fan1Rpm: null,
  fan2Rpm: null,
  fan3Rpm: null,
  fan4Rpm: null,
  fan5Rpm: null,
};""",
     """export const NO_FANS: FanReadings = {
  fan1Rpm: rpm(0),
  fan2Rpm: rpm(0),
  fan3Rpm: rpm(0),
  fan4Rpm: rpm(0),
  fan5Rpm: rpm(0),
};""",
     [SMM, COOL]),

    # ================================================ the union, and the service state
    ("T24 an unreadable channel is presented as EC auto — a fault rendered as healthy",
     "lib/collectors/dell-smm.ts",
     """    case 'ec-auto':
      return { ...channels, ch5Mode: 'ec-auto', ch5Pwm: null };
    case 'unlocated':
    case 'absent':
    case 'unreadable':""",
     """    case 'ec-auto':
    case 'unreadable':
      return { ...channels, ch5Mode: 'ec-auto', ch5Pwm: null };
    case 'unlocated':
    case 'absent':""",
     SMM),
    # ⚠ re-aimed: `withServiceState`'s three-branch switch was measured redundant in step
    # 4's reconciliation (a bare spread preserves the union) and collapsed to one line.
    ("T25 withServiceState drops the state it was called to write",
     "lib/collectors/dell-smm.ts",
     "export const withServiceState = (cooling: Cooling, serviceState: UnitState | null): Cooling => ({\n  ...cooling,\n  serviceState,\n});",
     "export const withServiceState = (cooling: Cooling, serviceState: UnitState | null): Cooling => {\n  void serviceState;\n  return cooling;\n};",
     SMM),
    # ⚠ re-aimed in step 4's reconciliation: `errnoCodeOf` was hoisted to `errors.ts`
    # because step 5's D-Bus and /health probes are the third caller.
    ("T26 errnoCodeOf accepts a numeric code, so `61` is compared against 'ENODATA'",
     "lib/collectors/errors.ts",
     "  return typeof code === 'string' && code !== '' ? code : null;",
     "  return code === undefined || code === null ? null : String(code);",
     SMM),

    # ======================================================= the wrapper's own branches
    ("T27 a missing dell_smm node is reported as an ABSENT pwm5 — unknown becomes the alarm",
     "lib/collectors/cooling.ts",
     "    return assemble({ outcome: 'unlocated' }, NO_FANS, [\n      describeHwmonMiss(node, paths.hwmonRoot, DELL_SMM_NAME),\n    ]);",
     "    return assemble({ outcome: 'absent' }, NO_FANS, [\n      describeHwmonMiss(node, paths.hwmonRoot, DELL_SMM_NAME),\n    ]);",
     COOL),
    ("T28 an EACCES on the node directory is reported as an absent pwm5",
     "lib/collectors/cooling.ts",
     "    return assemble({ outcome: 'unlocated' }, NO_FANS, [`${dir}: ${reason(e)}`]);",
     "    return assemble({ outcome: 'absent' }, NO_FANS, [`${dir}: ${reason(e)}`]);",
     COOL),
    ("T29 the listing stops being the presence oracle — pwm5 is read speculatively",
     "lib/collectors/cooling.ts",
     """  if (!listed.has(PWM5_FILE)) {
    problems.push(
      `${dir}: no \\`${PWM5_FILE}\\` node — the DKMS 5-fan module did not load, ` +
        'so channel 5 is uncontrollable',
    );
    return assemble({ outcome: 'absent' }, fans.value, problems);
  }

""",
     "",
     COOL),
    ("T30 pwm5Present is recomputed from the assembled Cooling instead of from the probe",
     "lib/collectors/cooling.ts",
     "  pwm5Present: pwm5PresentFrom(probe),",
     "  pwm5Present: coolingFrom(fans, probe, null).ch5Mode !== null,",
     COOL),
    # ⚠ Re-aimed 2026-09-07 when the listing-miss branch (A3) lengthened this loop.
    ("T31 the reads go concurrent — eleven blocked SMM calls on a four-thread pool",
     "lib/collectors/cooling.ts",
     r"""  for (const channel of FAN_CHANNELS) {
    const file = fanInputFile(channel);
    if (!listed.has(file)) {
      // ⚠ §6.3, the `fan1`–`fan4` row: "An em dash on channels 1–4 **always** has an
      // `errors[]` entry behind it; one on channel 5 may not, because channel 5 has a
      // documented absent state and these do not." That asymmetry is the whole of this
      // branch. Channel 5 legitimately vanishes on the stock 4-fan driver and is explained
      // by `pwm5Present: false` a few lines below, so it stays silent. Channels 1–4 have no
      // such state: the driver exposes them unconditionally, so one going missing is news,
      // and without an entry it would render as a bare `—` that §6.5's one exception cannot
      // reach — the neighbour that would explain it reads `unavailable`, which O13 says is
      // not a severity.
      //
      // Unreachable on this board, and kept anyway: it costs one comparison, it can
      // fabricate nothing (an `errors[]` entry mints no verdict and no severity), and it is
      // the difference between §6.3's sentence being true and being true by luck.
      if (channel !== 5) {
        problems.push(
          `${dir}: no \`${file}\` in the listing — channel ${channel} did not enumerate`,
        );
      }
      continue;
    }
    try {
      files[file] = await reader.readFile(`${dir}/${file}`);
    } catch (e) {
      problems.push(`${dir}/${file}: ${reason(e)}`);
    }
  }""",
     r"""  await Promise.all(
    FAN_CHANNELS.map(async (channel) => {
      const file = fanInputFile(channel);
      if (!listed.has(file)) {
        // ⚠ §6.3, the `fan1`–`fan4` row: "An em dash on channels 1–4 **always** has an
        // `errors[]` entry behind it; one on channel 5 may not, because channel 5 has a
        // documented absent state and these do not." That asymmetry is the whole of this
        // branch. Channel 5 legitimately vanishes on the stock 4-fan driver and is explained
        // by `pwm5Present: false` a few lines below, so it stays silent. Channels 1–4 have no
        // such state: the driver exposes them unconditionally, so one going missing is news,
        // and without an entry it would render as a bare `—` that §6.5's one exception cannot
        // reach — the neighbour that would explain it reads `unavailable`, which O13 says is
        // not a severity.
        //
        // Unreachable on this board, and kept anyway: it costs one comparison, it can
        // fabricate nothing (an `errors[]` entry mints no verdict and no severity), and it is
        // the difference between §6.3's sentence being true and being true by luck.
        if (channel !== 5) {
          problems.push(
            `${dir}: no \`${file}\` in the listing — channel ${channel} did not enumerate`,
          );
        }
        return;
      }
      try {
        files[file] = await reader.readFile(`${dir}/${file}`);
      } catch (e) {
        problems.push(`${dir}/${file}: ${reason(e)}`);
      }
    }),
  );""",
     COOL),
    ("T32 O17 abandoned — the hwmon reads are unbounded again",
     "lib/collectors/cooling.ts",
     "  const reader = boundedReader(io, deadline(timeoutMs, DELL_SMM_TIMEOUT_MS));",
     "  const reader = { readFile: io.readFile, readDir: io.readDir };\n  void boundedReader;\n  void deadline;\n  void timeoutMs;",
     COOL),
    # ⚠ T33/T34 re-aimed: the bound was hoisted into `deadline.ts` in step 4's
    # reconciliation, so step 5 has one copy to call rather than four to write.
    ("T33 the deadline becomes per-operation, so the real bound is N times the documented one",
     "lib/collectors/deadline.ts",
     "    const left = deadlineAt - performance.now();",
     "    const left = budget;",
     [DL, COOL]),
    ("T34 the late rejection of an abandoned read is left unsubscribed (a bare race)",
     "lib/collectors/deadline.ts",
     """      start().then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (e: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(reason(e)));
        },
      );""",
     """      void Promise.race([start(), new Promise<never>(() => {})]).then(
        (value: T) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
      );""",
     [DL, COOL]),
    ("T35 a trap file is read — pwmN_enable, which lies about the mode",
     "lib/collectors/cooling.ts",
     "  for (const channel of FAN_CHANNELS) {\n    const file = fanInputFile(channel);",
     "  for (const channel of FAN_CHANNELS) {\n    const file = `pwm${channel}_enable`;",
     COOL),

    # ================================================================== the hwmon walk
    ("T36 the node is found by a fixed index instead of by name (§3.3 forbids it)",
     "lib/collectors/hwmon.ts",
     "    if (read === name) return { found: true, dir };",
     "    void read;\n    if (entry === 'hwmon3') return { found: true, dir };",
     HW),
    ("T37 the sysfs trailing newline is not trimmed, so nothing ever matches",
     "lib/collectors/hwmon.ts",
     "      read = parseText(await reader.readFile(`${dir}/${HWMON_NAME_FILE}`));",
     "      read = await reader.readFile(`${dir}/${HWMON_NAME_FILE}`);",
     HW),
    ("T38 an unreadable `name` is swallowed — \"could not read\" becomes \"not there\"",
     "lib/collectors/hwmon.ts",
     "      unidentified.push(`${entry} (${reason(e)})`);\n      continue;",
     "      void e;\n      continue;",
     HW),
    ("T39 an unreadable ROOT is reported as absence",
     "lib/collectors/hwmon.ts",
     "    return { found: false, why: 'root-unreadable', error };",
     "    void error;\n    return { found: false, why: 'absent', scanned: 0 };",
     [HW, COOL]),
    ("T40 the two miss messages collapse into one, losing §6.5's distinction",
     "lib/collectors/hwmon.ts",
     """    case 'indeterminate':
      return (
        `no hwmon named \\`${name}\\` under ${root}, and ` +
        `${miss.unidentified.length} of ${miss.scanned} node(s) could not be identified: ` +
        `${miss.unidentified.join(', ')}`
      );""",
     """    case 'indeterminate':
      return `no hwmon named \\`${name}\\` under ${root}`;""",
     HW),

    # ============================================ §6.3's zero clause (step 4 reconciliation)
    # ⚠ T45 is the mutation that would have caught the hole this reconciliation closed:
    # §6.3's `fan5` absolute row was one-sided, so six of the seven reachable
    # `fan5Rpm === 0` states — every mode but engaged-manual, including the `ec-auto` this
    # box sits in below AUTO_BELOW=55 — banded `normal`. A dead fan on a box with two
    # passively-cooled 250 W cards produced an affirmative green.
    ("T45 the fan5 absolute row loses its low end — a stopped fan bands NORMAL again",
     "lib/severity.ts",
     "  return value > 5100 || value === 0 ? 'alarm' : 'normal';",
     "  return value > 5100 ? 'alarm' : 'normal';",
     SEV),
    ("T46 the zero test uses Object.is, so a corrupt -0 escapes the row",
     "lib/severity.ts",
     "  return value > 5100 || value === 0 ? 'alarm' : 'normal';",
     "  return value > 5100 || Object.is(value, 0) ? 'alarm' : 'normal';",
     SEV),
    ("T47 severityFan5's unknown-engagement branch drops the absolute alarm",
     "lib/severity.ts",
     "  if (ch5Engagement(cooling) === 'unknown') return absolute === 'alarm' ? 'alarm' : null;",
     "  if (ch5Engagement(cooling) === 'unknown') return null;",
     SEV),
    ("T48 fan1-fan4: an unreadable channel is treated as a stopped one — invariant 1 inverted",
     "lib/severity.ts",
     """export const severityFanStopped = (value: Rpm | null): Severity | null => {
  if (value === null || !Number.isFinite(value)) return null;""",
     """export const severityFanStopped = (value: Rpm | null): Severity | null => {
  if (!Number.isFinite(value)) return 'alarm';""",
     SEV),
    ("T49 fan1-fan4: a stopped chassis fan is downgraded to watch",
     "lib/severity.ts",
     "  // `===`, never `Object.is`: `-0` is a stopped fan, not a value that escapes the row.\n  return value === 0 ? 'alarm' : 'normal';",
     "  return value === 0 ? 'watch' : 'normal';",
     SEV),
    ("T50 fan1-fan4 gain an invented upper bound, which §6.3 says they must not have",
     "lib/severity.ts",
     "  // `===`, never `Object.is`: `-0` is a stopped fan, not a value that escapes the row.\n  return value === 0 ? 'alarm' : 'normal';",
     "  return value === 0 || value > 5100 ? 'alarm' : 'normal';",
     SEV),
    ("T51 fan_stopped becomes a singleton, so a channel index is 'malformed' (§6.4)",
     "lib/conditions.ts",
     "  fan_stopped: { singleton: false, bareKindAllowedInStanding: true },",
     "  fan_stopped: { singleton: true, bareKindAllowedInStanding: true },",
     COND),


    # ===================================================================================
    # Added in step 8's reconciliation. §9's *stale versus retired*, §9's worst-severity
    # dedupe and §6.4's "a gap ends any pending run" all landed in `lib/conditions.ts`, whose
    # ledger this harness owns (HANDOVER §5.2: ownership follows the FILE). Each entry is a
    # wrong implementation somebody would actually write, and each names the finding it closes.
    # ===================================================================================
    # ⚠ F3, the failure this dashboard exists to prevent: reduce over the poll instead of over
    # the session, and a card at 90 °C whose `nvidia-smi` fails takes the header from
    # `● 1 alarm` to `● all healthy` with no log line.
    # ⚠ Added 2026-09-07. §6.3's `fan1`–`fan4` row promises "an em dash on channels 1–4
    # always has an `errors[]` entry behind it"; the listing-miss path used to `continue`
    # silently, so the promise was true only because this board always enumerates them. The
    # asymmetry with channel 5 — which legitimately vanishes and is explained by
    # `pwm5Present: false` — is what this mutation removes.
    ("T84 a channel missing from the listing is skipped in silence, on every channel",
     "lib/collectors/cooling.ts",
     "      if (channel !== 5) {\n        problems.push(\n"
     "          `${dir}: no \\`${file}\\` in the listing — channel ${channel} did not enumerate`,\n"
     "        );\n      }\n      continue;",
     "      continue;",
     [COOL]),
    ("T70 the reduction runs over this poll only, so a lost collector turns the dot green (F3)",
     "lib/conditions.ts",
     "  const remembered = new Map<string, DisplayedCondition>();\n"
     "  for (const id of state.remembered.keys()) {\n"
     "    const next = current.get(id) ?? carried.get(id);\n"
     "    if (next !== undefined) remembered.set(id, next);\n"
     "  }\n"
     "  for (const [id, condition] of current) if (!remembered.has(id)) remembered.set(id, condition);",
     "  const remembered = new Map<string, DisplayedCondition>(current);\n"
     "  void carried;",
     COND),

    # ⚠ The mirror failure: latch every vanished condition for ever, and an alarm about a card
    # somebody deliberately pulled becomes un-clearable without a reload.
    ("T71 nothing is ever retired, so a card that was pulled keeps alarming for ever (F3)",
     "lib/conditions.ts",
     "    if (confirmedAbsent && enumerated) {",
     "    if (false && confirmedAbsent && enumerated) {",
     COND),

    # ⚠ §9: "A collection that could NOT be read retires nothing." Dropping the evidence check
    # retires a card whenever `nvidia-smi` fails, which is F3 wearing the opposite mask.
    ("T72 an unread collection retires its subjects, so gpus: null looks like gpus: [] (F3)",
     "lib/conditions.ts",
     "    const enumerated = previous.enumeration !== null && enumerationsRead.has(previous.enumeration);",
     "    const enumerated = true;",
     COND),

    # ⚠ §6.5: "Confirmed over the same ten seconds, so one flickering enumeration cannot retire
    # a card." Retiring on the first absent poll is what a single bad `nvidia-smi` run costs.
    ("T73 absence is believed on the first poll, so one flicker retires a card (F3)",
     "lib/conditions.ts",
     "    ? startBandHold(true, nowMs)\n"
     "    : stepBandHold(previous ?? startBandHold(true, nowMs), false, nowMs);",
     "    ? startBandHold(true, nowMs)\n    : startBandHold(false, nowMs);",
     COND),

    # ⚠ §6.5's asymmetry, in the other direction: a returning reading held for ten seconds
    # means a card that is answering is still drawn as stale.
    ("T74 a returning reading is debounced too, so a card that is answering still reads stale",
     "lib/conditions.ts",
     "  here\n    ? startBandHold(true, nowMs)",
     "  here\n    ? stepBandHold(previous ?? startBandHold(false, nowMs), true, nowMs)",
     COND),

    # ⚠ F6: §9's dedupe takes the WORST severity, not the first. Taking the first lets whichever
    # panel is projected first decide, and a `failed` service behind an `active` reading renders
    # a red cell under a green dot.
    ("T75 the dedupe keeps the first observation, so a failed service hides under an active one (F6)",
     "lib/conditions.ts",
     "    for (const o of group) if (isWorse(o.rawSeverity, chosen.rawSeverity)) chosen = o;",
     "    void isWorse;",
     COND),

    ("T76 the dedupe keeps the last observation instead — the same defect, other order (F6)",
     "lib/conditions.ts",
     "    for (const o of group) if (isWorse(o.rawSeverity, chosen.rawSeverity)) chosen = o;",
     "    for (const o of group) chosen = o;\n    void isWorse;",
     COND),

    ("T77 a disagreement is absorbed silently, so a server defect never reaches the log",
     "lib/conditions.ts",
     "      conflicts.push({ id: chosen.id, label: chosen.label, kept: chosen.value, others });",
     "      void others;",
     COND),

    # ⚠ F7: §6.4's ten seconds are ten seconds the client was SAMPLING. Without the restart,
    # one sample either side of an hour-long gap confirms a band and dates it to before the gap.
    ("T78 a gap does not end a pending run, so two samples an hour apart confirm a band (F7)",
     "lib/conditions.ts",
     "  const priorHolds = options.afterGap ? restartPendingRuns(state.holds, nowMs) : state.holds;",
     "  const priorHolds = state.holds;",
     COND),

    ("T79 a gap restarts a band that had already confirmed, re-opening a settled question (F7)",
     "lib/conditions.ts",
     "    if (Object.is(hold.pending, hold.confirmed)) {\n      next.set(key, hold);\n      continue;\n    }",
     "    if (false) {\n      next.set(key, hold);\n      continue;\n    }",
     COND),

    # ⚠ §6.4: "A poll in which a condition does not appear steps nothing." Stepping an absent
    # condition's hold lets an interval nobody sampled confirm a band on its behalf.
    ("T80 an absent condition's hold is stepped, so absence confirms a band (§6.4)",
     "lib/conditions.ts",
     "    const stale: DisplayedCondition = previous.stale ? previous : { ...previous, stale: true };",
     "    holds.set(id, stepBandHold(holds.get(id) ?? startBandHold<Severity>(previous.severity, nowMs), previous.severity, nowMs));\n"
     "    const stale: DisplayedCondition = previous.stale ? previous : { ...previous, stale: true };",
     COND),

    # ⚠ §6.5: staleness "never raises a severity and never lowers one". Promoting a stale
    # condition to watch devalues amber on every collector hiccup; that is the whole argument.
    ("T81 a stale condition is promoted to watch, so every collector hiccup raises the dot",
     "lib/conditions.ts",
     "    const stale: DisplayedCondition = previous.stale ? previous : { ...previous, stale: true };",
     "    const stale: DisplayedCondition = { ...previous, stale: true, displaySeverity: 'watch' };",
     COND),

    # ⚠ §9 reports a disagreement so a server defect is visible; reporting one for every
    # duplicated id makes the signal meaningless — `gpu-fan-control.service` reaches the
    # browser twice on every healthy poll, so this would file a defect five times a minute.
    ("T82 every duplicated id is reported as a disagreement, agreeing pairs included",
     "lib/conditions.ts",
     "    if (group.some((o) => o.rawSeverity !== chosen.rawSeverity || o.value !== chosen.value)) {",
     "    if (group.length > 1) {",
     COND),

    # ⚠ "A gap ends any pending run" read as "a gap resets every hold": a band that had already
    # confirmed is re-dated to the moment sampling resumed, so §6.4's "when it started" reports
    # the end of the gap rather than the first observation of the band it is describing.
    # ⚠ Two pairs, because it is one coherent wrong design rather than two accidents: read "a
    # gap ends any pending run" as "a gap resets every hold" and both halves follow. Either
    # half alone is invisible — dropping the settled early-out changes only `pendingSinceMs` on
    # a band that is not pending, and re-seeding only the pending ones is what the rule says.
    ("T83 a gap re-dates a band that had already confirmed, so the banner's since is the gap's end",
     "lib/conditions.ts",
     [("    if (Object.is(hold.pending, hold.confirmed)) {\n      next.set(key, hold);\n      continue;\n    }\n",
       ""),
      ("    changed = true;\n    next.set(key, { ...hold, pendingSinceMs: nowMs });",
       "    changed = true;\n    next.set(key, startBandHold(hold.pending, nowMs));")],
     COND),

    # ==================================== the shared deadline (A2 + A7, step 4 reconciliation)
    ("T52 the deadline goes back to the WALL clock — an NTP step un-bounds it",
     "lib/collectors/deadline.ts",
     [("  const deadlineAt = performance.now() + budget;", "  const deadlineAt = Date.now() + budget;"),
      ("    const left = deadlineAt - performance.now();", "    const left = deadlineAt - Date.now();")],
     DL),
    ("T53 the budget loses its ceiling — Infinity becomes setTimeout's 1 ms clamp",
     "lib/collectors/deadline.ts",
     "  Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS\n    ? timeoutMs\n    : fallbackMs;",
     "  Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : fallbackMs;",
     [DL, COOL]),
    ("T54 the budget loses its floor — a 0 or negative budget is taken at face value",
     "lib/collectors/deadline.ts",
     "  Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS\n    ? timeoutMs\n    : fallbackMs;",
     "  Number.isFinite(timeoutMs) && timeoutMs <= MAX_TIMEOUT_MS ? timeoutMs : fallbackMs;",
     DL),
    # ⚠ Added by STEP 5, which fixed the defect this covers. `deadline.ts` is a step-4
    # module but step 5 is its heaviest caller, and step 4's own ledger scans
    # `deadline.test.ts` — so the mutation for step 5's new ⚠ test has to live here too, or
    # this harness reports it as inert. The same entry is in step 5's harness.
    ("T55b the spent budget is re-derived from the clock alone — an early timer leaves a sliver",
     "lib/collectors/deadline.ts",
     "    if (spent || left <= 0) {\n      spent = true;\n      return Promise.reject(overdue());\n    }",
     "    if (left <= 0) return Promise.reject(overdue());",
     DL),
    ("T55 only readFile is bounded — the directory listing is left unbounded",
     "lib/collectors/deadline.ts",
     "  readDir: (path) => within(() => reader.readDir(path)),",
     "  readDir: (path) => reader.readDir(path),",
     DL),

    # ================================ the wrapper's new guards (step 4 reconciliation)
    ("T56 the presence oracle loses its sanity floor — an empty listing raises THE alarm",
     "lib/collectors/cooling.ts",
     """  if (!listed.has(HWMON_NAME_FILE)) {
    return assemble({ outcome: 'unlocated' }, NO_FANS, [
      `${dir}: listing has no \\`${HWMON_NAME_FILE}\\`, which was just read from it — ` +
        'the directory listing cannot be trusted to say whether `pwm5` exists',
    ]);
  }
""",
     "",
     COOL),
    ("T57 the six timeout entries are collapsed into one, so five figures lose their reason",
     "lib/collectors/cooling.ts",
     "      problems.push(`${dir}/${file}: ${reason(e)}`);",
     "      if (problems.length === 0) problems.push(`${dir}/${file}: ${reason(e)}`);",
     COOL),
    ("T58 the ENODATA compare is normalised, so a near-miss code becomes the healthy state",
     "lib/collectors/dell-smm.ts",
     "    if (read.code === PWM5_EC_AUTO_ERRNO) return clean({ outcome: 'ec-auto' });",
     "    if (read.code?.trim().toUpperCase() === PWM5_EC_AUTO_ERRNO)\n      return clean({ outcome: 'ec-auto' });",
     SMM),

    # ===================================== the project-wide guardrails (step 4 reconciliation)
    # ⚠ T59 is the mutation A6 exhibited: a BEHAVIOUR-PRESERVING coupling. It produces the
    # identical total function, so it passes every test in `dell-smm.test.ts` and every
    # other mutation's check. Only a source-text assertion can see it.
    ("T59 pwm5PresentFrom reads ch5Mode's answer while preserving behaviour exactly",
     "lib/collectors/dell-smm.ts",
     """export const pwm5PresentFrom = (probe: Pwm5Probe): Safety['pwm5Present'] => {
  switch (probe.outcome) {""",
     """export const pwm5PresentFrom = (probe: Pwm5Probe): Safety['pwm5Present'] => {
  if (ch5ModeFrom(probe) !== null) return true;
  switch (probe.outcome) {""",
     [GUARD, SMM]),
    # The replacement is built with chr(0) rather than written literally, so THIS file
    # does not acquire the very byte it is testing for.
    ("T60 a raw control byte re-enters a source file, hiding it from grep and ripgrep",
     "lib/collectors/dell-smm.ts",
     "export const DELL_SMM_NAME = 'dell_smm';",
     "export const DELL_SMM_NAME = 'dell_smm';\nconst NUL_CANARY = '" + chr(0) + "';\nvoid NUL_CANARY;",
     GUARD),
    ("T61 the Node pin drifts — .nvmrc and engines.node disagree, silently, until step 7",
     ".nvmrc", "24", "26", GUARD),

    # ⚠ Added by STEP 5's reconciliation, for the same reason step 5's build added one entry
    # here for `deadline.test.ts`: `LEDGER_FILES` includes `guardrails.test.ts`, so a ⚠ test
    # step 5 added there would be reported as inert in THIS harness. The rule they defend is
    # the project's third guard — "a call that should exist and does not" — which neither the
    # ledger nor fixture symmetry can see, because one takes a ⚠ test as input and the other
    # a comparison a parser already contains.
    ("T56 the nvidia-smi seam's setTimeout takes the raw argument again — Infinity clamps to 1 ms",
     "lib/collectors/io.ts", "      }, bound);", "      }, timeoutMs);", GUARD),
    ("T57 a second boundedTimeoutMs is defined at a seam, so 'validated' stops meaning one thing",
     "lib/collectors/http.ts",
     "import { boundedTimeoutMs } from './deadline';",
     "export const boundedTimeoutMs = (timeoutMs: number, fallbackMs: number): number =>\n"
     "  Number.isFinite(timeoutMs) ? timeoutMs : fallbackMs;",
     GUARD),

    # ⚠ Added by STEP 6's reconciliation, and here rather than in step 6's harness for the
    # reason step 5 added T56/T57 here: `LEDGER_FILES` includes `guardrails.test.ts`, so a ⚠
    # test added there by a later step is reported as inert by THIS harness until a mutation
    # in THIS file reddens it. Ledger ownership follows the file, not the step.
    #
    # Both are **measured evasions**, not invented ones. Step 6 shipped each of these guards
    # over a narrower input than the property needed, and its adversarial phase defeated both
    # while the whole suite stayed green.
    ("T67 a background refresh in a NEW telemetry file, which a hard-coded file list cannot see",
     "lib/telemetry/gate.ts",
     "export const oneAtATime = (collectors: SnapshotCollectors): SnapshotCollectors => ({",
     "setInterval(() => {\n  /* keep the collectors warm */\n}, 5000).unref();\n\n"
     "export const oneAtATime = (collectors: SnapshotCollectors): SnapshotCollectors => ({",
     GUARD),
    ("T68 the assembler reaches a shared budget through a DEEPER import specifier",
     "lib/telemetry/snapshot.ts",
     [("} from '@/lib/collectors';",
       "} from '@/lib/collectors';\nimport { deadline } from '@/lib/collectors/deadline';"),
      ("  const [gpus, host, cooling, serving, storage, safety] = await Promise.all([",
       "  const within = deadline(6000, 6000);\n"
       "  const [gpus, host, cooling, serving, storage, safety] = await Promise.all(["),
      ("      () => collectors.gpus(),", "      () => within(() => collectors.gpus()),")],
     GUARD),

    # ============================== added by the RED-TEST LEDGER (step 4 reconciliation)
    # The ledger's first run found eight ⚠-marked tests that no mutation could redden.
    # Each of these was written to answer one of them; nothing was renamed or demoted, and
    # every one of the eight named a property that does have a plausible wrong version.
    ("T62 the fan files become `fanN_target` — trap 1, which clamps to the HIGH nominal",
     "lib/collectors/dell-smm.ts",
     "export const fanInputFile = (channel: number): string => `fan${channel}_input`;",
     "export const fanInputFile = (channel: number): string => `fan${channel}_target`;",
     [SMM, COOL]),
    ("T63 the duty file becomes `pwm5_enable` — trap 2, which reads back 2 under manual",
     "lib/collectors/dell-smm.ts",
     "export const PWM5_FILE = 'pwm5';",
     "export const PWM5_FILE = 'pwm5_enable';",
     [SMM, COOL]),
    ("T64 a duty of 0 is treated as no duty — the falsy-zero bug, one character",
     "lib/collectors/dell-smm.ts",
     "  const value = parseIntegerStrict(read.text);\n  if (value === null) {",
     "  const value = parseIntegerStrict(read.text);\n  if (!value) {",
     [SMM, COOL]),
    ("T65 a rejection with NO code is promoted to EC auto — the healthy answer, invented",
     "lib/collectors/dell-smm.ts",
     "    if (read.code === PWM5_EC_AUTO_ERRNO) return clean({ outcome: 'ec-auto' });",
     "    if (read.code === PWM5_EC_AUTO_ERRNO || read.code === null)\n      return clean({ outcome: 'ec-auto' });",
     [SMM, COOL]),
    ("T66 ec-auto reports pwm5Present as unknown, breaking §3.7's one true implication",
     "lib/collectors/dell-smm.ts",
     """    case 'manual':
    case 'ec-auto':
    case 'unreadable':
      // The node was listed. Whether it can be *read* is a different question, and it is
      // `ch5Mode`'s, not this one's.
      return true;""",
     """    case 'manual':
    case 'unreadable':
      return true;
    case 'ec-auto':
      return null;""",
     [SMM, COOL]),
    ("T67 a `dell_smm` tempN_input is read for chassis ambient — §3.2 forbids it",
     "lib/collectors/cooling.ts",
     "  const files: Record<string, string> = {};\n  for (const channel of FAN_CHANNELS) {",
     """  const files: Record<string, string> = {};
  if (listed.has('temp1_input')) {
    try {
      files['temp1_input'] = await reader.readFile(`${dir}/temp1_input`);
    } catch (e) {
      void e;
    }
  }
  for (const channel of FAN_CHANNELS) {""",
     COOL),
    ("T68 readDir returns Dirents, so every `listed.has(...)` presence check silently fails",
     "lib/collectors/io.ts",
     "  readDir: (path) => readdir(path),",
     "  readDir: (path) => readdir(path, { withFileTypes: true }) as unknown as Promise<string[]>,",
     COOL),
    ("T69 an UNREADABLE fan5 is banded as a stopped one — invariant 1 inverted at the band",
     "lib/severity.ts",
     "  if (value === null || !Number.isFinite(value)) return null;\n  return value > 5100 || value === 0 ? 'alarm' : 'normal';",
     "  if (!Number.isFinite(value)) return 'alarm';\n  return value > 5100 || value === 0 ? 'alarm' : 'normal';",
     SEV),

    # ====================================================================== type-level
    ("T41 the wrapper normalises `unknown` away — `?? false` is the alarm by default",
     "lib/collectors/cooling.ts",
     "  pwm5Present: pwm5PresentFrom(probe),",
     "  pwm5Present: pwm5PresentFrom(probe) ?? false,",
     COOL),
    ("T41b pwm5Present is stringified, and the contract's boolean|null is not enforced",
     "lib/collectors/cooling.ts",
     "  pwm5Present: pwm5PresentFrom(probe),",
     "  pwm5Present: `${pwm5PresentFrom(probe)}`,",
     "types"),
    ("T42 FanReadings loses the Rpm brand", "lib/collectors/dell-smm.ts",
     "  readonly fan5Rpm: Rpm | null;", "  readonly fan5Rpm: number | null;", "types"),
    ("T43 a fan is minted straight from Number(), bypassing the Rpm brand and the parse",
     "lib/collectors/dell-smm.ts",
     "    fan1Rpm: fanRpm(files, 1, problems),",
     "    fan1Rpm: Number(files['fan1_input']),", "types"),
    ("T43b the fan service state escapes §3.7's closed UnitState vocabulary",
     "lib/collectors/cooling.ts",
     "  cooling: coolingFrom(fans, probe, null),",
     "  cooling: coolingFrom(fans, probe, 'running'),", "types"),
    ("T44 CoolingEcAuto is handed a duty — the union exists to stop exactly this",
     "lib/collectors/dell-smm.ts",
     "      return { ...channels, ch5Mode: 'ec-auto', ch5Pwm: null };",
     "      return { ...channels, ch5Mode: 'ec-auto', ch5Pwm: pwm(0) };", "types"),
]


def main() -> int:
    os.chdir(ROOT)
    bad = []
    moved = []
    covered = set()  # every FAIL line seen across every mutation
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
