#!/usr/bin/env python3
"""Step 6's deliberate regressions — evidence that the telemetry route's tests bite.

Same harness as steps 2–5, including step 4's per-mutation **red-test ledger**. Each entry
replaces one exact string in one source file with a plausible *wrong* implementation — the
wrong thing someone would actually write, not a syntax error — runs the affected check, and
restores the file. **Every one must exit 1.**

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Vitest's ``typecheck`` block only covers ``*.test-d.ts``,
  so a loosened type shows up only under ``tsc``.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs re-aiming;
it does not mean the test is fine.

⚠ HANDOVER §5.1 is honoured: **no mutation anchors on the comparison it means to weaken**
without a sibling pointing the other way. The cache's ``now - startedMs < ttlMs`` carries
three — one dropping the in-flight disjunct, one loosening the boundary to ``<=``, one
removing result reuse entirely — because a single mutation of that line can only prove that
*a* freshness check exists, never that it points the right way.

⚠ Note the shape of ``A9``. It is one of **two** behaviour-preserving mutations here: it
wraps the six collectors in one shared ``deadline()``, which HANDOVER §6 item 1 calls the
route's worst available mistake, and *every behavioural test stays green under it*. Only the
source-text guard catches it. That is the third guard rule (HANDOVER §5.3) earning its place
again, and it is why the guard is a test rather than a sentence in this file.

``N1`` is the second, and the build wrongly claimed ``A9`` was the only one. Measured in
step 6's adversarial phase: ``export const dynamic = 'auto'`` still builds
``ƒ /api/telemetry``, because Next 16 does not cache route handlers by default — so ``N1``
changes no behaviour on this toolchain and reddens only because a test asserts the literal
string. The export is kept as defence against Cache Components and against a future default;
the *claim* was what needed correcting.

⚠ Two mutations here point at ``lib/guardrails.test.ts`` rather than at a step-6 test file
(``A9``, ``P4``). That is deliberate: step 6's reconciliation moved both structural guards
there, where the comment-blanking and tree-walking helpers already live.

Run from ``dashboard/`` with pnpm on PATH:

    export PATH="$HOME/.local/bin:$PATH"
    python3 pipeline/steps/06-telemetry-route/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

CACHE = "lib/telemetry/cache.test.ts"
SNAPSHOT = "lib/telemetry/snapshot.test.ts"
SOURCE = "lib/telemetry/source.test.ts"
HANDLER = "lib/telemetry/handler.test.ts"
ROUTE = "app/api/telemetry/route.test.ts"
GATE = "lib/telemetry/gate.test.ts"
CEILING = "lib/telemetry/ceiling.test.ts"
GUARD = "lib/guardrails.test.ts"

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
# ⚠ `lib/guardrails.test.ts` is deliberately NOT here even though step 6's reconciliation
# added TWO ⚠ tests to it — the assembler's shared-budget guard (moved here from
# `snapshot.test.ts`, where a deeper import specifier defeated it) and the tree-walking
# no-repeating-timer rule. **Ledger ownership follows the FILE, not the step** (HANDOVER
# §5.2), so their mutations live in step 4's harness: `T67` (a literal `setInterval` in a
# new `lib/telemetry/` file — the measured evasion of a hard-coded file list) and `T68`
# (`import { deadline } from '@/lib/collectors/deadline'` — the measured evasion of a
# brace-block name check). `A9` and `P4` below also fire at them, from this side.
LEDGER_FILES = [CACHE, SNAPSHOT, SOURCE, HANDLER, ROUTE, GATE, CEILING]

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


CACHE_SRC = "lib/telemetry/cache.ts"
SNAPSHOT_SRC = "lib/telemetry/snapshot.ts"
SOURCE_SRC = "lib/telemetry/source.ts"
HANDLER_SRC = "lib/telemetry/handler.ts"
ROUTE_SRC = "app/api/telemetry/route.ts"
GATE_SRC = "lib/telemetry/gate.ts"
CEILING_SRC = "lib/telemetry/ceiling.ts"

FRESHNESS = "    if (held !== null && (held.flight.inFlight || nowMs - held.startedMs < ttlMs)) {"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ================================================ §4 / O18 — the in-flight cache
    ("C1 the result is cached but the in-flight promise is not — every poll forks its own",
     CACHE_SRC,
     "    entry = { startedMs: nowMs, flight, promise };",
     "    void promise.then(() => {\n      entry = { startedMs: nowMs, flight, promise };\n    });",
     [CACHE, SOURCE]),
    ("C2 the freshness window alone decides, so a 6 s poll is overtaken at 2 s",
     CACHE_SRC, FRESHNESS,
     "    if (held !== null && nowMs - held.startedMs < ttlMs) {",
     [CACHE, SOURCE]),
    ("C3 only an in-flight sample is joined, so a settled result is never reused",
     CACHE_SRC, FRESHNESS,
     "    if (held !== null && held.flight.inFlight) {",
     [CACHE, SOURCE]),
    ("C4 the window boundary is inclusive — one poll too many is served from the cache",
     CACHE_SRC, FRESHNESS,
     "    if (held !== null && (held.flight.inFlight || nowMs - held.startedMs <= ttlMs)) {",
     [CACHE, SOURCE]),
    ("C5 the entry is re-stamped when the sample lands, so the window runs from completion",
     CACHE_SRC,
     "      (value) => {\n        flight.inFlight = false;\n        return value;\n      },",
     "      (value) => {\n        flight.inFlight = false;\n"
     "        if (entry !== null && entry.flight === flight) {\n"
     "          entry = { startedMs: monotonicMs(), flight, promise };\n        }\n"
     "        return value;\n      },",
     [CACHE]),
    ("C6 the sample is stamped with a second, wall-clock reading rather than the entry's",
     CACHE_SRC,
     "    const promise = sample(nowMs).then(",
     "    const promise = sample(Date.now()).then(",
     [CACHE, SOURCE]),
    ("C7 a rejected sample stays in the cache and is served for the rest of the window",
     CACHE_SRC,
     "        if (entry !== null && entry.flight === flight) entry = null;\n",
     "",
     [CACHE]),

    # ============================================ §4 — the assembled snapshot's shape
    ("A1 the whole storage collection is spread, so `errors` rides onto the wire",
     SNAPSHOT_SRC,
     "  const assembledStorage: Storage = { ...filesystems, net: host.net };",
     "  const assembledStorage: Storage = { ...storage, net: host.net };",
     [SNAPSHOT]),
    ("A2 the whole safety collection is spread, so `errors` rides onto the wire",
     SNAPSHOT_SRC,
     "  const assembledSafety: Safety = { ...checks, pwm5Present: cooling.pwm5Present };",
     "  const assembledSafety: Safety = { ...safety, pwm5Present: cooling.pwm5Present };",
     [SNAPSHOT]),
    ("A3 hostname is dropped from the top level, as §3.2's table would suggest",
     SNAPSHOT_SRC, "      hostname: host.hostname,\n", "", [SNAPSHOT]),
    ("A4 O9 — the fan service is left out of COOLING, so the two panels disagree",
     SNAPSHOT_SRC,
     "  const assembledCooling: Cooling = withServiceState(cooling.cooling, checks.fanServiceState);",
     "  const assembledCooling: Cooling = cooling.cooling;",
     [SNAPSHOT]),
    ("A5 §3.7 inverted — pwm5Present is derived from ch5Mode instead of the probe",
     SNAPSHOT_SRC,
     "  const assembledSafety: Safety = { ...checks, pwm5Present: cooling.pwm5Present };",
     "  const assembledSafety: Safety = { ...checks, pwm5Present: cooling.cooling.ch5Mode !== null };",
     [SNAPSHOT]),
    # ⚠ Added in step 8's reconciliation, with §4's `standing` field. The list is "echoed
    # verbatim and never parsed server-side": §6.4's "an id that matches no kind is reported as
    # unknown" is a **client-side** fact, and a server that tidied the list would turn the
    # loudest rule in §6.4 into silence — a suppression mechanism that looks configured and is
    # not, which is the `ufw is-active` shape this whole repo is written around.
    ("A17 the server tidies STANDING, so a malformed id is silently dropped instead of reported",
     SNAPSHOT_SRC,
     "      standing,",
     "      standing: [...new Set(standing.map((e) => e.trim()).filter((e) => e !== ''))],",
     [SNAPSHOT]),
    ("A18 STANDING is dropped from the wire, so nothing is ever standing on a real deployment",
     SNAPSHOT_SRC,
     "      // §4: echoed verbatim. Not validated, not deduplicated, not sorted — the browser is\n"
     "      // where an id is judged, and one malformed entry must never fail a poll.\n"
     "      standing,\n",
     "",
     [SNAPSHOT]),
    ("A6 serving: null is coerced to [], turning 'unknown' into 'none configured'",
     SNAPSHOT_SRC, "      serving: serving.serving,", "      serving: serving.serving ?? [],",
     [SNAPSHOT]),
    # ⚠ Added 2026-09-07. `A7`/`A8` prove every collector's entries REACH `errors[]`; nothing
    # proved they arrive in a particular ORDER, so the "in field order" clause of that test's
    # name was unbacked — the ledger cannot tell an order assertion from decoration. It is
    # load-bearing off this file: `dbus` is filed by two collectors, and §6.7's client rule
    # (S11) shows the **last** message per source in the event log, so reordering these six
    # changes the sentence an operator reads for a D-Bus failure.
    # ⚠ Added 2026-09-07 with A1. `STANDING` is captured once, at construction, because
    # `--env-file` fixes `process.env` at container creation — a per-sample read answers the
    # same value every time while implying it might not. This mutation is the code that was
    # there until A1, so the day someone restores it believing §4's old "takes effect on the
    # next poll", the suite says why it cannot.
    ("A20 STANDING is re-read inside every sample, promising a live change the deployment cannot make",
     SOURCE_SRC,
     [("  const standing = readStandingList(env);\n", ""),
      ("        standing,\n", "        standing: readStandingList(env),\n")],
     [SOURCE]),
    ("A19 the six collections are concatenated in a different order",
     SNAPSHOT_SRC,
     "      errors: [\n        ...gpus.errors,\n        ...host.errors,\n        ...cooling.errors,\n"
     "        ...serving.errors,\n        ...storage.errors,\n        ...safety.errors,",
     "      errors: [\n        ...safety.errors,\n        ...storage.errors,\n        ...serving.errors,\n"
     "        ...cooling.errors,\n        ...host.errors,\n        ...gpus.errors,",
     [SNAPSHOT]),
    ("A7 the cooling collector's entries are dropped from errors[]",
     SNAPSHOT_SRC, "        ...cooling.errors,\n", "", [SNAPSHOT]),
    ("A8 the host collector's entries are dropped from errors[]",
     SNAPSHOT_SRC, "        ...host.errors,\n", "", [SNAPSHOT]),
    # ⚠ Behaviour-preserving. See the module docstring: only the source-text guard sees it.
    ("A9 HANDOVER §6.1 — one shared deadline() across all six collectors",
     SNAPSHOT_SRC,
     [("  NO_FANS,\n  NO_FILESYSTEM,", "  NO_FANS,\n  NO_FILESYSTEM,\n  deadline,"),
      ("  const [gpus, host, cooling, serving, storage, safety] = await Promise.all([",
       "  const within = deadline(6000, 6000);\n"
       "  const [gpus, host, cooling, serving, storage, safety] = await Promise.all(["),
      ("      () => collectors.gpus(),", "      () => within(() => collectors.gpus()),")],
     [GUARD]),

    # ==================================== invariant 5 — a collector that throws
    ("A10 the GPU collector is called unguarded, so one rejection loses the whole snapshot",
     SNAPSHOT_SRC,
     "    attempt<GpuCollection>(\n      () => collectors.gpus(),\n"
     "      (why) => ({ gpus: null, errors: entriesFor(GPU_SOURCES, collectorThrew('collectGpus', why)) }),\n    ),",
     "    collectors.gpus(),",
     [SNAPSHOT]),
    ("A11 a crashed host collector files one entry, leaving eight blanks unexplained",
     SNAPSHOT_SRC,
     "        errors: entriesFor(HOST_SOURCES, collectorThrew('collectHost', why)),",
     "        errors: entriesFor(['proc-stat'], collectorThrew('collectHost', why)),",
     [SNAPSHOT]),
    ("A12 a crashed host collector invents zero counters, so the next delta is fiction",
     SNAPSHOT_SRC,
     "        sample: { atMs: nowMs, cpu: null, net: null },",
     "        sample: { atMs: nowMs, cpu: { busy: 0n, total: 0n }, net: { rxBytes: 0n, txBytes: 0n } },",
     [SNAPSHOT]),
    ("A13 a crashed cooling collector mints §3.6's alarm from a probe it never ran",
     SNAPSHOT_SRC,
     "        cooling: coolingFrom(NO_FANS, UNLOCATED, null),\n"
     "        pwm5Present: pwm5PresentFrom(UNLOCATED),",
     "        cooling: coolingFrom(NO_FANS, { outcome: 'absent' }, null),\n"
     "        pwm5Present: pwm5PresentFrom({ outcome: 'absent' }),",
     [SNAPSHOT]),
    ("A14 a crashed safety collector files one entry for three blanked checks",
     SNAPSHOT_SRC,
     "        errors: entriesFor(SAFETY_SOURCES, collectorThrew('collectSafety', why)),",
     "        errors: entriesFor(['dbus'], collectorThrew('collectSafety', why)),",
     [SNAPSHOT]),
    ("A15 a crashed safety collector answers `false` — the alarm §3.6 forbids from a failed read",
     SNAPSHOT_SRC,
     "        checks: NO_CHECKS,",
     "        checks: { ufwEnforcing: false, dkmsForRunningKernel: false, fanServiceState: null },",
     [SNAPSHOT]),

    # ================================================== §6.7 / O16 — previous
    ("R1 previous is replaced wholesale, discarding the last good counters",
     SOURCE_SRC, "      previous = mergePrevious(taken, sample);", "      previous = sample;",
     [SOURCE]),
    ("R2 retention is per SAMPLE, not per counter — one broken read freezes the other",
     SOURCE_SRC,
     "export const mergePrevious = (prev: DeltaSample | null, next: DeltaSample): DeltaSample => ({\n"
     "  atMs: next.net !== null ? next.atMs : (prev?.atMs ?? next.atMs),\n"
     "  cpu: next.cpu ?? prev?.cpu ?? null,\n"
     "  net: next.net ?? prev?.net ?? null,\n"
     "});",
     "export const mergePrevious = (prev: DeltaSample | null, next: DeltaSample): DeltaSample =>\n"
     "  next.cpu !== null && next.net !== null ? next : (prev ?? next);",
     [SOURCE]),
    ("R3 atMs advances whenever anything succeeded, so a retained rate reads double",
     SOURCE_SRC,
     "  atMs: next.net !== null ? next.atMs : (prev?.atMs ?? next.atMs),",
     "  atMs: next.atMs,",
     [SOURCE]),
    ("R4 the CPU counters are not retained across a failed /proc/stat read",
     SOURCE_SRC, "  cpu: next.cpu ?? prev?.cpu ?? null,", "  cpu: next.cpu,", [SOURCE]),
    ("R5 previous is never handed to the collector, so every poll is a first poll",
     SOURCE_SRC, "        previous: taken,", "        previous: null,", [SOURCE]),
    ("R6 the source warms its cache at construction — work with no client connected",
     SOURCE_SRC,
     "  return { snapshot: () => cache.get() };",
     "  void cache.get();\n  return { snapshot: () => cache.get() };",
     [SOURCE]),
    ("R7 a background refresh keeps the box sampling with nobody watching",
     SOURCE_SRC,
     "  return { snapshot: () => cache.get() };",
     "  setInterval(() => {\n    void cache.get();\n  }, 5000).unref();\n"
     "  return { snapshot: () => cache.get() };",
     [SOURCE, GUARD]),
    ("R8 the monotonic instant is used as a wall clock for §4's ts",
     SOURCE_SRC,
     "        ts: clock.isoNow(),",
     "        ts: isoTimestamp(new Date(startedMs).toISOString()),",
     [SOURCE]),
    ("R9 the delta clock is read again from Date.now() instead of the sample's instant",
     SOURCE_SRC, "        nowMs: startedMs,", "        nowMs: Date.now(),", [SOURCE]),
    ("R10 the shipped window is not §4's two seconds",
     SOURCE_SRC, "export const TELEMETRY_CACHE_MS = 2000;",
     "export const TELEMETRY_CACHE_MS = 5000;", [SOURCE]),

    # ====================================================== §4 / §5 — the handler
    # ⚠ Re-aimed by step 6's reconciliation: the check now runs through `authorized(...)`,
    # which denies rather than throwing (§5). The mutation is unchanged in substance.
    ("H1 the snapshot is sampled before the session is checked",
     HANDLER_SRC,
     "  if (!(await authorized(deps.authorize, request))) {\n"
     "    return new Response(null, { status: 401, headers: { 'cache-control': NO_STORE } });\n  }\n\n"
     "  const snapshot = await deps.source.snapshot();",
     "  const snapshot = await deps.source.snapshot();\n"
     "  if (!(await authorized(deps.authorize, request))) {\n"
     "    return new Response(null, { status: 401, headers: { 'cache-control': NO_STORE } });\n  }\n",
     [HANDLER]),
    ("H2 the refusal is 403, which §5.2's client does not route to /login on",
     HANDLER_SRC,
     "    return new Response(null, { status: 401, headers: { 'cache-control': NO_STORE } });",
     "    return new Response(null, { status: 403, headers: { 'cache-control': NO_STORE } });",
     [HANDLER, ROUTE]),
    # ⚠ RE-AIMED by step 7. `noSessionVerifierYet` is gone — step 7 replaced it with the real
    # `verifySession` rather than leaving an exported, tested, unused seam behind — so the old
    # anchor would report ANCHOR NOT FOUND. The property is unchanged and is still step 6's to
    # keep red, because `lib/telemetry/handler.test.ts` is in this harness's LEDGER_FILES: the
    # route's session check must refuse a request that carries no session.
    #
    # ⚠ ROUTE is deliberately NOT in the check list. `route.test.ts` calls the **real** `GET`,
    # and under a permissive verifier that would fork `nvidia-smi` and open two D-Bus
    # connections on whatever machine is running the harness. `handler.test.ts` runs the real
    # verifier against a fake source, which tells the two implementations apart without it.
    ("H3 the session check is permissive — telemetry open to the LAN",
     "lib/auth/authorize.ts",
     "    return liveSessionOf(request, deps) !== null;",
     "    return true;",
     [HANDLER, "lib/auth/authorize.test.ts"]),
    ("H4 invariant 5 inverted — a snapshot carrying errors[] is answered with 500",
     HANDLER_SRC,
     "  return new Response(JSON.stringify(snapshot), {\n    status: 200,",
     "  return new Response(JSON.stringify(snapshot), {\n"
     "    status: snapshot.errors.length > 0 ? 500 : 200,",
     [HANDLER]),
    ("H5 the body is served as text/plain, so a client cannot parse it as the contract",
     HANDLER_SRC,
     "      'content-type': 'application/json; charset=utf-8',",
     "      'content-type': 'text/plain; charset=utf-8',",
     [HANDLER]),
    ("H6 the responses become cacheable, so a stale snapshot outlives its own age indicator",
     HANDLER_SRC, "const NO_STORE = 'no-store';", "const NO_STORE = 'public, max-age=2';",
     [HANDLER]),

    # ========================================================== the Next route file
    ("N1 the route loses force-dynamic and the snapshot is prerendered at build time",
     ROUTE_SRC, "export const dynamic = 'force-dynamic';", "export const dynamic = 'auto';",
     [ROUTE]),
    ("N2 GET is aliased to the handler, so Next's context lands where the deps go",
     ROUTE_SRC,
     "export const GET = (request: Request): Promise<Response> => handleTelemetry(request);",
     "export const GET = handleTelemetry;",
     [ROUTE]),

    # ============================== §4 — the outstanding-call rule and the host ceiling
    # ⚠ Added by step 6's RECONCILIATION. §4 now states both halves and says neither ships
    # without the other: a ceiling alone restarts the polling and lets blocked reads,
    # orphaned `nvidia-smi` processes and abandoned sockets accumulate without limit, while
    # the gate alone leaves the endpoint dead behind a wedged `collectHost`.
    ("G1 the gate is a pass-through, so every poll issues another call into a wedged source",
     GATE_SRC,
     [("  gpus: gated(collectors.gpus),", "  gpus: collectors.gpus,"),
      ("  host: gated(collectors.host),", "  host: collectors.host,"),
      ("  cooling: gated(collectors.cooling),", "  cooling: collectors.cooling,"),
      ("  serving: gated(collectors.serving),", "  serving: collectors.serving,"),
      ("  storage: gated(collectors.storage),", "  storage: collectors.storage,"),
      ("  safety: gated(collectors.safety),", "  safety: collectors.safety,")],
     [GATE, SOURCE]),
    ("G2 one slot for all six, so a wedged collector skips the other five's readings",
     GATE_SRC,
     [("const gated = <A extends readonly unknown[], R>(",
       "let outstanding = false;\n\nconst gated = <A extends readonly unknown[], R>("),
      ("): ((...args: A) => Promise<R>) => {\n  let outstanding = false;\n",
       "): ((...args: A) => Promise<R>) => {\n")],
     [GATE]),
    ("G3 the slot is released only on success, so one failed read skips forever",
     GATE_SRC,
     "      (e: unknown) => {\n        outstanding = false;\n        throw e;\n      },",
     "      (e: unknown) => {\n        throw e;\n      },",
     [GATE]),
    ("G4 the slot is released when the call is ISSUED rather than when it settles",
     GATE_SRC,
     "    return started.then(\n"
     "      (value) => {\n        outstanding = false;\n        return value;\n      },\n"
     "      (e: unknown) => {\n        outstanding = false;\n        throw e;\n      },\n"
     "    );",
     "    outstanding = false;\n    return started;",
     [GATE]),
    ("P1 the ceiling spreads to a second collector, bounding a subject it must not",
     CEILING_SRC,
     "  ...collectors,\n",
     "  ...collectors,\n"
     "  gpus: () => deadline(ceilingMs, HOST_CEILING_MS)(() => collectors.gpus()),\n",
     [CEILING]),
    ("P2 collectHost is left unbounded, so a wedged /proc read hangs the endpoint forever",
     CEILING_SRC,
     "  host: (options) => deadline(ceilingMs, HOST_CEILING_MS)(() => collectors.host(options)),",
     "  host: (options) => collectors.host(options),",
     [CEILING, SOURCE]),
    ("P3 the ceiling is tightened below the poll's blessed worst case",
     CEILING_SRC, "export const HOST_CEILING_MS = 6000;", "export const HOST_CEILING_MS = 2000;",
     [CEILING]),
    # ⚠ The delay is `ceilingMs` — a caller-supplied number that never passed through
    # `boundedTimeoutMs`, so `Infinity` becomes 1 ms and every poll blanks nine host figures.
    # It also never clears its timer — the other half of what `deadline()` already does —
    # so it is the mutation that covers `⚠ the ceiling leaves no timer behind`.
    ("P4 the ceiling is hand-rolled with a bare setTimeout instead of deadline()",
     CEILING_SRC,
     "  host: (options) => deadline(ceilingMs, HOST_CEILING_MS)(() => collectors.host(options)),",
     "  host: (options) =>\n"
     "    Promise.race([\n"
     "      collectors.host(options),\n"
     "      new Promise<never>((_, reject) => {\n"
     "        setTimeout(() => reject(new Error(`timed out after ${ceilingMs} ms`)), ceilingMs);\n"
     "      }),\n"
     "    ]),",
     [GUARD, CEILING]),
    # ⚠ P5 is the composition ORDER, and it is the reason the two halves are one finding.
    # A gate outside the ceiling releases its slot when the race settles at the bound, so the
    # next poll issues a second call into the same wedged source: one more permanently
    # blocked thread-pool worker per poll, for as long as the container runs. Every other
    # behavioural test in the project stays green under it.
    ("P5 the gate is composed OUTSIDE the ceiling, so a wedged source is re-issued every poll",
     SOURCE_SRC,
     "  const guarded = withHostCeiling(oneAtATime(collectors), hostCeilingMs);",
     "  const guarded = oneAtATime(withHostCeiling(collectors, hostCeilingMs));",
     [SOURCE]),

    # ============================ §4 / §6.5 — the fixes step 6's review ruled MUST
    ("A16 a crashed host collector files the wrong nine sources — both valid §3.7 members",
     SNAPSHOT_SRC, "  'coretemp',\n];", "  'dell-smm',\n];", [SNAPSHOT]),
    ("H7 the session check is called unguarded, so a malformed cookie is a 500",
     HANDLER_SRC,
     "  if (!(await authorized(deps.authorize, request))) {",
     "  if (!(await deps.authorize(request))) {",
     [HANDLER]),
    # ⚠ R11 and R12 are the two measured evasions of the text guard step 6 shipped. Both are
    # invisible to any regex — `setInterval` is a global and a microtask is not a timer at
    # all — and both are caught by the behavioural tests in `source.test.ts`.
    ("R11 a background refresh through an aliased global, invisible to a text guard",
     SOURCE_SRC,
     "  return { snapshot: () => cache.get() };",
     "  const every = globalThis.setInterval;\n  every(() => {\n    void cache.get();\n  }, 5000).unref();\n"
     "  return { snapshot: () => cache.get() };",
     [SOURCE]),
    ("R12 the source warms itself in a microtask, which a synchronous assertion cannot see",
     SOURCE_SRC,
     "  return { snapshot: () => cache.get() };",
     "  void Promise.resolve().then(() => cache.get());\n  return { snapshot: () => cache.get() };",
     [SOURCE]),
    ("R13 a keep-alive at MODULE LOAD, which fake timers in a later test cannot reach",
     HANDLER_SRC,
     "export const productionTelemetryDeps: TelemetryHandlerDeps = {",
     "const every = globalThis.setInterval;\nevery(() => {\n  /* keep warm */\n}, 60000).unref();\n\n"
     "export const productionTelemetryDeps: TelemetryHandlerDeps = {",
     [SOURCE]),
    ("R14 the cache window is timed on the wall clock, so a backward NTP step holds a stale snapshot",
     SOURCE_SRC,
     "  monotonicMs: () => performance.now(),",
     "  monotonicMs: () => Date.now(),",
     [SOURCE]),

    # ====================================================================== type-level
    # ⚠ Not written as a cast: `x as T` always type-checks, so a cast mutation can never
    # fail `tsc` and would be an inert entry. Assign the invented value.
    ("T1 the storage spread is the one step 5 measured typechecking at exit 0",
     SNAPSHOT_SRC,
     "  const assembledStorage: Storage = { ...filesystems, net: host.net };",
     "  const assembledStorage: Storage = { ...storage, net: host.net };",
     "types"),
    ("T2 the safety spread, same shape, same measured mistake",
     SNAPSHOT_SRC,
     "  const assembledSafety: Safety = { ...checks, pwm5Present: cooling.pwm5Present };",
     "  const assembledSafety: Safety = { ...safety, pwm5Present: cooling.pwm5Present };",
     "types"),
    ("T3 a seventh UnitState escapes §3.7's closed vocabulary through the crash fallback",
     SNAPSHOT_SRC, "  fanServiceState: null,\n};", "  fanServiceState: 'stopped',\n};", "types"),
    ("T4 the collectors are typed by hand, so a signature change stops being a compile error",
     SNAPSHOT_SRC, "  readonly host: typeof collectHost;",
     "  readonly host: () => Promise<HostCollection>;", "types"),
]


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
