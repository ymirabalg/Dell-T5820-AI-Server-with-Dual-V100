#!/usr/bin/env python3
"""Step 10's deliberate regressions — evidence that the shell's AND the panels' tests bite.

Same harness as steps 2–9, including the per-mutation **red-test ledger** (HANDOVER §5.2) and
the corrected ⚠-scanner (paren-balanced, string-, comment- and generic-aware) step 9's
reconciliation produced. **Copied from `pipeline/steps/09-ui-primitives/regressions.py`
verbatim** except for `LEDGER_FILES` and `REGRESSIONS` — the handoff for this step says not to
write a scanner from scratch, and all eight+ existing harnesses are byte-identical here.

Scope: **10a, the shell** (assembly seams, header, sticky alarm banner, grid, `app/`'s wiring,
D6) **plus 10b, the nine panel bodies** under `components/panels/` — SCOPE.md's three-loop
split shares this one harness rather than each loop writing its own, so `LEDGER_FILES` and
`REGRESSIONS` below carry both loops' entries, distinguished by their `10a-`/`10b-` id prefix
and by a `# === 10b ===`-style banner comment marking where 10b's additions start. 10c's
backlog items, when they land, will extend this file the same way rather than starting a
tenth harness.

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Not used by this harness, same reasoning step 9 gave: every
  file 10a added is either a pure function/component or a thin `app/` hook with no branded-type
  boundary of its own that only `tsc` could catch a mutation crossing.

Run from ``dashboard/`` with pnpm on PATH, and **never concurrently with `pnpm verify`** or
another harness:

    export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
    python3 pipeline/steps/10-panels-assembly/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

HEADER_STATUS_TEST = "lib/client/header-status.test.ts"
BANNER_TEST = "lib/client/banner.test.ts"
HEADER_TEST = "components/header.test.tsx"
ALARM_BANNER_TEST = "components/alarm-banner.test.tsx"
GRID_TEST = "components/grid.test.tsx"
USE_TELEMETRY_TEST = "lib/client/use-telemetry.test.tsx"
USE_TELEMETRY_SSR_TEST = "lib/client/use-telemetry.ssr.test.tsx"
USE_NOW_TICK_TEST = "app/use-now-tick.test.tsx"
DASHBOARD_SHELL_SSR_TEST = "app/dashboard-shell.ssr.test.tsx"
# ⚠ Added by 10a's reconciliation. `dashboard-shell.test.tsx` is THE join test — before it, the
# whole non-null branch of the shell was executed by nothing and `PLAN.md`'s own green criterion
# ("paused shows mode AND alarm count") could be hard-coded away with `pnpm verify` still at 0.
DASHBOARD_SHELL_TEST = "app/dashboard-shell.test.tsx"
PAGE_TEST = "app/page.test.tsx"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied verbatim from steps 2–9; only
#    LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# Every ⚠-marked test must appear in at least one mutation's RED set. The harness runs each
# mutation, records which test names went red, unions those sets, and fails if a ⚠-marked test
# never appears. A test that no mutation can distinguish is a test that cannot fail for any
# wrong implementation anyone was willing to write.
#
# ⚠ What this CANNOT catch, and the limit is irreducible: a test that goes red for the WRONG
# reason. Mechanise the necessary condition; keep reading each test against its own name for
# the sufficient one.
#
# ⚠ A failure here is NOT "add a mutation until it goes green". The first hypothesis is that
# the test is inert and should be given a body matching its name, or renamed to what it
# actually checks. The second is that the property has no plausible wrong implementation, in
# which case drop the ⚠ rather than the standard.
# ⚠ 10b's nine panel bodies + their shared support files. Every `components/panels/*.test.*`
# file lives in THIS harness's `LEDGER_FILES` and no other's — "ledger ownership follows the
# FILE" (HANDOVER §5.2 rule 6) — because `components/panels/` did not exist before this loop
# and this is the harness `components/` files owe.
STATUS_ROW_TEST = "components/panels/status-row.test.tsx"
CONDITION_LOOKUP_TEST = "components/panels/condition-lookup.test.ts"
EVENT_SENTENCE_TEST = "components/panels/event-sentence.test.ts"
PANEL_CHART_TEST = "components/panels/panel-chart.test.ts"
GPU_PANEL_TEST = "components/panels/gpu-panel.test.tsx"
CPU_PANEL_TEST = "components/panels/cpu-panel.test.tsx"
MEMORY_PANEL_TEST = "components/panels/memory-panel.test.tsx"
COOLING_PANEL_TEST = "components/panels/cooling-panel.test.tsx"
STORAGE_NETWORK_PANEL_TEST = "components/panels/storage-network-panel.test.tsx"
SERVING_PANEL_TEST = "components/panels/serving-panel.test.tsx"
SAFETY_PANEL_TEST = "components/panels/safety-panel.test.tsx"
SESSION_EVENT_LOG_PANEL_TEST = "components/panels/session-event-log-panel.test.tsx"
# ⚠ Added by 10b's RECONCILIATION, 2026-09-08 — §6.5's panel-level `errors[]` explanations.
PANEL_NOTES_TEST = "components/panels/panel-notes.test.tsx"
# ⚠ Added by 10b-S-F, 2026-09-08 — the shared panel-head chip override the owner's ruling
# requires (§6.2). One file, imported by every panel that can reach the case, so its own unit
# tests carry the ⚠-marked load-bearing coverage rather than one per panel.
PANEL_CHIP_TEST = "components/panels/panel-chip.test.ts"
# ⚠ Added by 10c1 — the wiring loop. `chart-view-toggle.tsx` is the control Q2-S2's toggle
# renders through (see that file's module doc for why it lives beside a chart rather than in
# the header); `force-alarm.ts` is 10a-F4's alarm-forcing escape hatch, pure and DOM-free.
CHART_VIEW_TOGGLE_TEST = "components/panels/chart-view-toggle.test.tsx"
FORCE_ALARM_TEST = "lib/client/force-alarm.test.ts"
# ⚠ Added by 10c1's RECONCILIATION, 2026-09-08 (adversarial A5/A6). `force-alarm.test.ts` covers
# the PURE function; this file covers the six lines in `use-telemetry.ts` that CALL it — the
# `process.env.NODE_ENV` token the whole production-unreachability argument rests on, which was
# defended by nothing and which the adversarial replaced with `'development'` all the way into a
# real `pnpm build` chunk with the suite and the harness both green.
FORCE_ALARM_WIRING_TEST = "lib/client/use-telemetry.force-alarm.test.tsx"

# ⚠ === 10c-2's four guards ===
# `lib/` (not `components/panels/`), because each is a project-wide mechanism guard, not a
# panel body — same reasoning `lib/guardrails.test.ts`/`lib/client/guardrails.test.ts` already
# use for cross-cutting checks. Each was itself an orphan under Q1-F4's own runner the moment
# it was written (a ⚠-marked test file in no `LEDGER_FILES` list) — proof the runner works
# before its first "real" catch. Only the ONE test.each that scans real files stays ⚠-marked
# in each; the classifier's own fixture tests are left unmarked deliberately (10c2-build.md
# §5) rather than each earning its own mutation here.
TOCONTAIN_SCOPE_TEST = "lib/tocontain-scope.test.ts"
DANGLING_CSS_CLASS_TEST = "lib/dangling-css-class.test.ts"
UNIT_SUFFIX_TEST = "lib/unit-suffix.test.ts"
CROSS_HARNESS_LEDGER_TEST = "lib/cross-harness-ledger.test.ts"

LEDGER_FILES = [
    HEADER_STATUS_TEST, BANNER_TEST, HEADER_TEST, ALARM_BANNER_TEST, GRID_TEST,
    USE_TELEMETRY_TEST, USE_TELEMETRY_SSR_TEST, USE_NOW_TICK_TEST,
    DASHBOARD_SHELL_SSR_TEST, DASHBOARD_SHELL_TEST, PAGE_TEST,
    STATUS_ROW_TEST, CONDITION_LOOKUP_TEST, EVENT_SENTENCE_TEST, PANEL_CHART_TEST,
    GPU_PANEL_TEST, CPU_PANEL_TEST, MEMORY_PANEL_TEST, COOLING_PANEL_TEST,
    STORAGE_NETWORK_PANEL_TEST, SERVING_PANEL_TEST, SAFETY_PANEL_TEST,
    SESSION_EVENT_LOG_PANEL_TEST, PANEL_NOTES_TEST, PANEL_CHIP_TEST,
    CHART_VIEW_TOGGLE_TEST, FORCE_ALARM_TEST, FORCE_ALARM_WIRING_TEST,
    TOCONTAIN_SCOPE_TEST, DANGLING_CSS_CLASS_TEST, UNIT_SUFFIX_TEST, CROSS_HARNESS_LEDGER_TEST,
]

# `test`/`it`, optionally `.each(<PAREN-BALANCED ARGS>)`, optionally `<A GENERIC ARG>`, then `(`.
CALL = re.compile(r"(?:^|\s)(?:test|it)(\.each)?(?:\s*<[^;{}()]*>)?\s*\(")
FIRST_STRING = re.compile(r"""\s*(['"])((?:\\.|(?!\1).)*)\1""")

# Every `test`/`it` call this scanner is EXPECTED to be able to read — the diagnostic that
# reports anything matching this it could not parse, rather than silently dropping the mark.
CANDIDATE = re.compile(
    r"(?:^|\s)(?:test|it)\s*"
    r"(?:<|\(|\.(?:each|skip|only|todo|concurrent|fails|for|runIf|skipIf)\b)"
)


def _skip_balanced(text, i):
    """`text[i]` is `(`; index just past its matching `)`, skipping strings AND comments."""
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
    """`text` with every comment and every string BODY blanked, offsets preserved."""
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


HEADER_STATUS_SRC = "lib/client/header-status.ts"
BANNER_SRC = "lib/client/banner.ts"
HEADER_SRC = "components/header.tsx"
ALARM_BANNER_SRC = "components/alarm-banner.tsx"
GRID_SRC = "components/grid.tsx"
USE_TELEMETRY_SRC = "lib/client/use-telemetry.ts"
USE_NOW_TICK_SRC = "app/use-now-tick.ts"
DASHBOARD_SHELL_SRC = "app/dashboard-shell.tsx"
GRID_CSS_SRC = "components/grid.module.css"
PAGE_SRC = "app/page.tsx"
# ==================================================== 10c1's wiring loop
# `GPU_PANEL_SRC`/`CPU_PANEL_SRC`/`COOLING_PANEL_SRC` already exist below (10b's own additions);
# reused here rather than redefined.
CHART_VIEW_TOGGLE_SRC = "components/panels/chart-view-toggle.tsx"
FORCE_ALARM_SRC = "lib/client/force-alarm.ts"

# ==================================================== 10b's panel bodies
STATUS_ROW_SRC = "components/panels/status-row.tsx"
CONDITION_LOOKUP_SRC = "components/panels/condition-lookup.ts"
EVENT_SENTENCE_SRC = "components/panels/event-sentence.ts"
GPU_PANEL_SRC = "components/panels/gpu-panel.tsx"
CPU_PANEL_SRC = "components/panels/cpu-panel.tsx"
MEMORY_PANEL_SRC = "components/panels/memory-panel.tsx"
COOLING_PANEL_SRC = "components/panels/cooling-panel.tsx"
STORAGE_NETWORK_PANEL_SRC = "components/panels/storage-network-panel.tsx"
SERVING_PANEL_SRC = "components/panels/serving-panel.tsx"
SAFETY_PANEL_SRC = "components/panels/safety-panel.tsx"
SESSION_EVENT_LOG_PANEL_SRC = "components/panels/session-event-log-panel.tsx"
# ⚠ Added by 10b's RECONCILIATION, 2026-09-08.
PANEL_CHART_SRC = "components/panels/panel-chart.ts"
PANEL_NOTES_SRC = "components/panels/panel-notes.tsx"
# ⚠ Added by 10b-S-F, 2026-09-08 — the owner's ruling on §6.2's chip.
PANEL_CHIP_SRC = "components/panels/panel-chip.ts"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ============================================== lib/client/header-status.ts
    # §6.2/§9's half of PLAN.md's green criterion: "paused shows mode AND alarm count", and
    # the count is omitted at zero in every mode. Every one of these mutations reintroduces a
    # documented, already-drafted mistake (per the handoff, "already bitten a draft").
    # ⚠ Re-aimed by 10a's reconciliation when F5 gave `live` a third input; the mutation is
    # unchanged in intent — the zero-omission rule stops applying and `0 alarms` leaks through.
    ("10a-HS1 zero alarms in live mode no longer renders \"all healthy\" — the count leaks through",
     HEADER_STATUS_SRC,
     "    text: alarms === 0 ? (severity === null ? 'no readings' : 'all healthy') : alarmsWord(alarms),",
     "    text: alarmsWord(alarms),",
     [HEADER_STATUS_TEST, HEADER_TEST, DASHBOARD_SHELL_TEST]),
    ("10a-HS2 paused with zero alarms renders \"paused · 0 alarms\" instead of bare \"paused\"",
     HEADER_STATUS_SRC,
     "text: alarms === 0 ? 'paused' : `paused · ${alarmsWord(alarms)}`,",
     "text: `paused · ${alarmsWord(alarms)}`,",
     [HEADER_STATUS_TEST]),
    ("10a-HS3 stale with zero alarms renders \"stale · 0 alarms\" instead of bare \"stale\"",
     HEADER_STATUS_SRC,
     "text: alarms === 0 ? 'stale' : `stale · ${alarmsWord(alarms)}`,",
     "text: `stale · ${alarmsWord(alarms)}`,",
     [HEADER_STATUS_TEST]),
    ("10a-HS4 paused with alarms drops the word \"paused\", showing only the count",
     HEADER_STATUS_SRC,
     "text: alarms === 0 ? 'paused' : `paused · ${alarmsWord(alarms)}`,",
     "text: alarms === 0 ? 'paused' : alarmsWord(alarms),",
     [HEADER_STATUS_TEST, HEADER_TEST]),
    ("10a-HS5 stale with alarms drops the word \"stale\", showing only the count",
     HEADER_STATUS_SRC,
     "text: alarms === 0 ? 'stale' : `stale · ${alarmsWord(alarms)}`,",
     "text: alarms === 0 ? 'stale' : alarmsWord(alarms),",
     [HEADER_STATUS_TEST, HEADER_TEST]),
    ("10a-HS6 paused shares live's dot glyph, so the two modes are visually identical",
     HEADER_STATUS_SRC, "glyph: '❙❙',", "glyph: '●',", [HEADER_STATUS_TEST]),
    ("10a-HS7 the expired hand-off leaks the alarm count into \"signed out\"",
     HEADER_STATUS_SRC,
     "expired: () => ({ glyph: '⊘', text: 'signed out' }),",
     "expired: (alarms) => ({ glyph: '⊘', text: `signed out · ${alarmsWord(alarms)}` }),",
     [HEADER_STATUS_TEST]),

    # ============================================== lib/client/banner.ts
    ("10a-BN1 the banner leads with the NEWEST alarm instead of the oldest-standing one",
     BANNER_SRC,
     "(a, b) => a.sinceMs - b.sinceMs || a.id.localeCompare(b.id),",
     "(a, b) => b.sinceMs - a.sinceMs || a.id.localeCompare(b.id),",
     [BANNER_TEST]),
    ("10a-BN2 the banner-worthy filter is bypassed, so a watch-level condition can lead or count",
     BANNER_SRC, "[...bannerConditions(displayed)]", "[...displayed]", [BANNER_TEST]),
    ("10a-BN3 the empty banner is rebuilt fresh instead of reusing the shared EMPTY_BANNER",
     BANNER_SRC,
     "if (ordered.length === 0) return EMPTY_BANNER;",
     "if (ordered.length === 0) return { count: 0, lead: null, rest: [] };",
     [BANNER_TEST]),
    ("10a-BN4 the count is off by one, forgetting the lead condition counts too",
     BANNER_SRC,
     "return { count: mapped.length, lead: mapped[0] ?? null, rest: mapped.slice(1) };",
     "return { count: mapped.length - 1, lead: mapped[0] ?? null, rest: mapped.slice(1) };",
     [BANNER_TEST]),

    # ============================================== components/header.tsx
    ("10a-H1 the cadence select no longer calls onSetCadence when changed",
     HEADER_SRC,
     "onChange={(event) => onSetCadence(Number(event.target.value) as CadenceSeconds)}",
     "onChange={() => undefined}",
     [HEADER_TEST]),
    ("10a-H2 the window select no longer calls onSetWindow when changed",
     HEADER_SRC,
     "onChange={(event) => onSetWindow(Number(event.target.value) as WindowMinutes)}",
     "onChange={() => undefined}",
     [HEADER_TEST]),
    ("10a-H3 the refresh button no longer calls onRefreshNow",
     HEADER_SRC,
     '<button type="button" onClick={onRefreshNow}>',
     '<button type="button" onClick={() => undefined}>',
     [HEADER_TEST]),
    ("10a-H4 the pause/resume button no longer calls onPauseResume",
     HEADER_SRC,
     '<button type="button" aria-pressed={paused} onClick={onPauseResume}>',
     '<button type="button" aria-pressed={paused} onClick={() => undefined}>',
     [HEADER_TEST]),
    ("10a-H5 the pause/resume label is stuck on \"pause\", never announcing \"resume\"",
     HEADER_SRC,
     "{paused ? '▶ resume' : '❙❙ pause'}",
     "{'❙❙ pause'}",
     [HEADER_TEST]),
    ("10a-H6 the logout button no longer calls onLogout",
     HEADER_SRC,
     '<button type="button" className={styles.logout} onClick={onLogout}>',
     '<button type="button" className={styles.logout} onClick={() => undefined}>',
     [HEADER_TEST]),
    ("10a-H7 the cadence selector silently drops the slowest option, breaking the exhaustive list",
     HEADER_SRC,
     "{CADENCE_SECONDS.map((seconds) => (",
     "{CADENCE_SECONDS.slice(0, 4).map((seconds) => (",
     [HEADER_TEST]),
    ("10a-H8 the window selector silently drops the longest option, breaking the exhaustive list",
     HEADER_SRC,
     "{WINDOW_MINUTES.map((minutes) => (",
     "{WINDOW_MINUTES.slice(0, 2).map((minutes) => (",
     [HEADER_TEST]),
    ("10a-H9 logout loses its visual separation from the four controls",
     HEADER_SRC,
     '<span aria-hidden="true" className={styles.separator} />\n\n        <button type="button" className={styles.logout} onClick={onLogout}>',
     '<button type="button" className={styles.logout} onClick={onLogout}>',
     [HEADER_TEST]),
    ("10a-H10 the header re-grows an IP address next to the hostname — the exact regression the spec names",
     HEADER_SRC,
     "<span className={styles.hostname}>{hostname}</span>",
     "<span className={styles.hostname}>{hostname} · 192.168.4.71</span>",
     [HEADER_TEST]),
    ("10a-H11 the header re-grows a kernel release next to the uptime — the exact regression the spec names",
     HEADER_SRC,
     "<span className={styles.uptime}>{uptime}</span>",
     "<span className={styles.uptime}>{uptime} · kernel 7.0.0-30</span>",
     [HEADER_TEST]),
    ("10a-H12 a paused dashboard hides its severity colour instead of showing it alongside the mode",
     HEADER_SRC,
     "data-severity={severity ?? 'none'}",
     "data-severity={mode === 'paused' ? 'none' : (severity ?? 'none')}",
     [HEADER_TEST]),
    # ⚠ Found by 10a-test: `10a-H3` above only mutates the refresh button's WIRING, so it never
    # touched `toContain('refresh')` in "refresh now and a pause control both render" — a sibling
    # of the exact inert-assertion shape the build already found once on "paused". That render
    # test was checking for the SUBSTRING "refresh", which the cadence control's own label
    # (`<span>refresh</span>`, §6.2's name for the cadence selector) and its
    # `aria-label="refresh cadence"` both ALSO satisfy — confirmed by deleting the refresh-now
    # button's visible text and watching the old assertion stay green. Fixed in
    # `header.test.tsx` to assert the button's own `⟳ refresh` glyph+text, unique in the markup;
    # this mutation is what proves the fix actually bites.
    ("10a-H13 the refresh-now button loses its visible text, leaving only the cadence label's unrelated \"refresh\"",
     HEADER_SRC,
     "        <button type=\"button\" onClick={onRefreshNow}>\n"
     "          ⟳ refresh\n"
     "        </button>",
     "        <button type=\"button\" onClick={onRefreshNow}>\n"
     "          ⟳\n"
     "        </button>",
     [HEADER_TEST]),

    # ============================================== components/alarm-banner.tsx
    ("10a-AB1 the alarm count is always singular, so \"3 active alarms\" reads \"3 active alarm\"",
     ALARM_BANNER_SRC,
     "{count} active alarm{count === 1 ? '' : 's'}",
     "{count} active alarm",
     [ALARM_BANNER_TEST]),
    ("10a-AB2 the \"rest\" of the collapsed alarms is never rendered, hiding every alarm but the lead",
     ALARM_BANNER_SRC, "{rest.length > 0 ? (", "{false ? (", [ALARM_BANNER_TEST]),
    # ⚠ Re-aimed by 10a's reconciliation: F14 removed the `count` prop, so the guard is now
    # `lead === null` alone — which is also the honest shape, since `lead` is the thing that
    # would be dereferenced.
    ("10a-AB3 the empty-banner guard is disabled, crashing on a null lead instead of rendering nothing",
     ALARM_BANNER_SRC,
     "  if (lead === null) return null;",
     "  if (false) return null;",
     [ALARM_BANNER_TEST]),

    # ============================================== components/grid.tsx
    ("10a-GR1 the GPU 1 slot renders GPU 0's content instead of its own — a copy-paste join bug",
     GRID_SRC,
     '<div className={styles.gpu1} data-slot="gpu1">\n        {gpu1}\n      </div>',
     '<div className={styles.gpu1} data-slot="gpu1">\n        {gpu0}\n      </div>',
     [GRID_TEST]),

    # ⚠ components/panel-placeholder.tsx and its two mutations (10a-PP1, 10a-PP2) are GONE —
    # 10c1 deleted the component (and its test file) once the nine real panels replaced it in
    # `dashboard-shell.tsx` (HANDOVER's do-not-copy rule: don't leave a thing implying a
    # "pending" mechanism that no longer runs). 10a-PP2's job — proving `panelId` reaches each
    # slot correctly — is now covered by `10c-DS1` (a swapped `panelId` literal) together with
    # `10c-DS5`/`10c-DS6`/`10c-DS7` (the four per-slot toggle wirings), against the REAL panels'
    # own content rather than a marker attribute only the placeholder rendered.
    # ⚠ CORRECTED by 10c1's reconciliation (adversarial A12): this comment named `10c-DS-WIRE*`,
    # which has never existed in this file. It is the only place a reader is told where
    # 10a-PP2's coverage went, written by the phase that also wrote the correct mutations.

    # ============================================== lib/client/use-telemetry.ts  (D6)
    ("10a-UT1 unmounting no longer calls stop() — the effect's cleanup is dropped",
     USE_TELEMETRY_SRC,
     "  useEffect(() => {\n"
     "    if (runtime === null) return undefined;\n"
     "    runtime.start();\n"
     "    return () => {\n"
     "      runtime.stop();\n"
     "    };\n"
     "  }, [runtime]);",
     "  useEffect(() => {\n"
     "    if (runtime === null) return undefined;\n"
     "    runtime.start();\n"
     "    return undefined;\n"
     "  }, [runtime]);",
     [USE_TELEMETRY_TEST]),
    # ⚠ There is deliberately NO mutation here for "the runtime is rebuilt on every render
    # instead of held once in the ref" (dropping `held.current === null &&`). It was tried and
    # measured: it feeds `useSyncExternalStore` a `getSnapshot` whose identity changes on every
    # call, which trips React's own tearing-detection retry loop rather than failing a test —
    # 506 seconds and a `SIGABRT` from a JS heap OOM, not a red test. See the (deliberately
    # unmarked) test this would have targeted in `use-telemetry.test.tsx` for the full account.
    # A mutation that does not redden deterministically and quickly is worse than none.
    ("10a-UT3 the server-render guard is dropped, throwing on the undeclared `window` global",
     USE_TELEMETRY_SRC,
     "if (held.current === null && typeof window !== 'undefined') {",
     "if (held.current === null) {",
     [USE_TELEMETRY_SSR_TEST]),

    # ============================================== app/use-now-tick.ts  (D2/2.5b)
    ("10a-NT1 the tick's clock is captured once at mount and never re-read, freezing the age forever",
     USE_NOW_TICK_SRC,
     "  useEffect(() => {\n"
     "    const id = setInterval(() => {\n"
     "      setNow(Date.now());\n"
     "    }, intervalMs);",
     "  useEffect(() => {\n"
     "    const frozen = Date.now();\n"
     "    const id = setInterval(() => {\n"
     "      setNow(frozen);\n"
     "    }, intervalMs);",
     [USE_NOW_TICK_TEST]),
    ("10a-NT2 unmounting no longer clears the interval, leaking a timer onto a dead tree",
     USE_NOW_TICK_SRC,
     "    return () => {\n"
     "      clearInterval(id);\n"
     "    };\n"
     "  }, [intervalMs]);",
     "    return undefined;\n"
     "  }, [intervalMs]);",
     [USE_NOW_TICK_TEST]),

    # ============================================== app/dashboard-shell.tsx  (2.5a)
    # ⚠ Found by 10a-test: this file had NO test at all, despite owning the ONE `state === null`
    # guard in the whole assembly. `use-telemetry.ts`'s contract means `state`/`runtime` are
    # `null` only when there is no `window` — a server render — so the guard is exercisable only
    # via `renderToStaticMarkup`, the same pattern `use-telemetry.ssr.test.tsx` already used for
    # D6. Dropping the guard does not hang or OOM (unlike the `use-telemetry.ts` case just
    # above): it is a plain synchronous null-dereference in `latestSample`, so it fails fast.
    ("10a-DS1 the 2.5a guard is dropped — a server render crashes instead of showing \"connecting…\"",
     DASHBOARD_SHELL_SRC,
     "  if (state === null || runtime === null) return <ConnectingShell />;",
     "  if (false) return <ConnectingShell />;",
     [DASHBOARD_SHELL_SSR_TEST]),

    # ========================================================================
    # ⚠ Added by 10a's RECONCILIATION — one per accepted adversarial finding.
    #
    # Every mutation below is the exact edit the adversarial phase either RAN and watched ship
    # green, or argued would. They are grouped by finding rather than by file, because that is
    # what a later reader needs: "which finding does this guard, and would it still bite."
    # ========================================================================

    # -------------------------------------------------- F5/F6: the dot and the words are ONE
    # reduction (§9/O2), and `severity: Severity | null` is a boundary with fixtures on both
    # sides. Before the fix, `aggregateStatus` took no `severity` at all, so `● all healthy`
    # rendered beside a grey "no band" dot on every page load before the first poll.
    ("10a-HS8 the words claim health while the dot says \"no band\" — the F5 split, restored",
     HEADER_STATUS_SRC,
     "    text: alarms === 0 ? (severity === null ? 'no readings' : 'all healthy') : alarmsWord(alarms),",
     "    text: alarms === 0 ? 'all healthy' : alarmsWord(alarms),",
     [HEADER_STATUS_TEST, HEADER_TEST, DASHBOARD_SHELL_TEST]),
    ("10a-H14 a null severity paints the dot GREEN — the side of the guard that had no fixture",
     HEADER_SRC,
     "data-severity={severity ?? 'none'}",
     "data-severity={severity ?? 'normal'}",
     [HEADER_TEST]),
    ("10a-H15 the header stops handing aggregateStatus the severity it colours the dot with",
     HEADER_SRC,
     "const status = aggregateStatus(mode, alarms, severity);",
     "const status = aggregateStatus(mode, alarms, 'normal');",
     [HEADER_TEST, DASHBOARD_SHELL_TEST]),

    # -------------------------------------------------- F1/F2/F3: §6.1's grid had two
    # unguarded layers. The inner one is a one-token TypeScript edit `pnpm verify` could not
    # see; the outer one is the stylesheet, which had no coverage of any kind.
    ("10a-GR2 COOLING is placed in the SESSION EVENT LOG's grid area, data-slot untouched (F1)",
     GRID_SRC,
     '<div className={styles.cooling} data-slot="cooling">',
     '<div className={styles.log} data-slot="cooling">',
     [GRID_TEST]),
    ("10a-GR3 the ≥1280px map loses COOLING's second row, so the settled row 2–3 span dies (F2)",
     GRID_CSS_SRC,
     "      'cooling cooling cpu memory'\n      'cooling cooling safety storage'",
     "      'cooling cooling cpu memory'\n      'safety safety safety storage'",
     [GRID_TEST]),
    ("10a-GR4 the 2-column breakpoint moves to 950px, so a 920px display gets the phone stack (F2)",
     GRID_CSS_SRC, "@media (min-width: 900px) {", "@media (min-width: 950px) {", [GRID_TEST]),
    ("10a-GR5 a class is renamed in the CSS alone, so its cell falls out of the area map (F2)",
     GRID_CSS_SRC, ".storage {\n  grid-area: storage;\n}", ".storageAndNetwork {\n  grid-area: storage;\n}",
     [GRID_TEST]),

    # -------------------------------------------------- F10/F14: §6.5's stale age, and a count
    # that could drift from the list it names.
    ("10a-BN5 the reduction drops `stale`, so the banner cannot tell a held reading from a live one",
     BANNER_SRC, "  stale: c.stale,", "  stale: false,", [BANNER_TEST]),
    ("10a-BN6 the age is measured from `sinceMs` — when the BAND was confirmed, not when it was last seen",
     BANNER_SRC, "  lastSeenMs: c.lastSeenMs,", "  lastSeenMs: c.sinceMs,", [BANNER_TEST]),
    ("10a-AB4 the announced count stops tracking the list, so N conditions read \"1 active alarm\"",
     ALARM_BANNER_SRC, "  const count = 1 + rest.length;", "  const count = 1;",
     [ALARM_BANNER_TEST, DASHBOARD_SHELL_TEST]),
    ("10a-AB5 the lead's stale age is never rendered — §6.5's \"the banner names the age\" silently drops",
     ALARM_BANNER_SRC,
     "{lead.age === null ? null : <span className={styles.stale}>{lead.age}</span>}",
     "{null}",
     [ALARM_BANNER_TEST, DASHBOARD_SHELL_TEST]),
    ("10a-AB6 a stale condition in the REST list loses its age, so only the lead is honest",
     ALARM_BANNER_SRC,
     "{item.age === null ? null : <i className={styles.stale}>{item.age}</i>}",
     "{null}",
     [ALARM_BANNER_TEST]),

    # -------------------------------------------------- F7/F8: the join. Each of these five
    # shipped green in the adversarial's own run, ALL FOUR AT ONCE, across 77 files.
    ("10a-DS2 the header's mode is hard-coded live — it can never say \"paused\" or \"stale\" (F7)",
     DASHBOARD_SHELL_SRC, "          mode={state.mode}", "          mode={'live'}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS3 the alarm count is hard-coded 0 — six alarms read \"all healthy\" (F7)",
     DASHBOARD_SHELL_SRC, "          alarms={state.alarms}", "          alarms={0}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS4 pause/resume is inverted, so a paused dashboard can never be un-stuck (F7)",
     DASHBOARD_SHELL_SRC,
     "onPauseResume={() => (state.paused ? runtime.resume() : runtime.pause())}",
     "onPauseResume={() => (state.paused ? runtime.pause() : runtime.resume())}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS5 the cadence control is wired to nothing (F7)",
     DASHBOARD_SHELL_SRC,
     "onSetCadence={(seconds) => runtime.setCadence(seconds)}",
     "onSetCadence={() => undefined}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS6 useNowTick is replaced by a render-time Date.now(), so the age freezes when polling stops (F8)",
     DASHBOARD_SHELL_SRC,
     "  const nowMs = useNowTick(AGE_TICK_MS);",
     "  const nowMs = Date.now();",
     [DASHBOARD_SHELL_TEST]),

    # -------------------------------------------------- F13/F15/F16/F9/F18
    ("10a-DS7 the header and banner go back to being sticky SIBLINGS, so the banner is occluded (F13)",
     DASHBOARD_SHELL_SRC,
     '      <div className={styles.stickyBand}>',
     '      <div>',
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS8 logout's DELETE loses `keepalive`, so its own navigation can cancel it (F15)",
     DASHBOARD_SHELL_SRC,
     "{ method: 'DELETE', credentials: 'same-origin', keepalive: true }",
     "{ method: 'DELETE', credentials: 'same-origin' }",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS9 every panel is handed the same panelId, so 10b's SVG ids collide across cards (F16)",
     DASHBOARD_SHELL_SRC,
     "const panel = (panelId: PanelProps['panelId']): PanelProps => ({ state, nowMs, panelId });",
     "const panel = (_panelId: PanelProps['panelId']): PanelProps => ({ state, nowMs, panelId: 'gpu0' });",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS10 the age suffix is appended unconditionally, so \"no reading yet\" renders \"— ago\" (F9)",
     DASHBOARD_SHELL_SRC,
     "          ageText={age === null ? formatAge(null) : `${formatAge(age)} ago`}",
     "          ageText={`${formatAge(age)} ago`}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS11 the stale age is never computed, so the banner presents a held reading as live (F10)",
     DASHBOARD_SHELL_SRC,
     "  c.stale ? `last read ${formatAge(nowMs - c.lastSeenMs)} ago` : null;",
     "  null;",
     [DASHBOARD_SHELL_TEST]),
    ("10a-PG1 the entry point renders nothing at all — a blank dashboard, previously untested (F18)",
     PAGE_SRC, "  return <DashboardShell />;", "  return null;", [PAGE_TEST]),

    # -------------------------------------------------- Ledger closure: the ⚠ tests the first
    # reconciliation run reported as reddened by nothing. Each one below is a plausible wrong
    # implementation someone would actually write, not a mutation invented to satisfy the
    # ledger — the one test that had no such implementation had its ⚠ dropped instead
    # (`grid.test.tsx`'s vacuity check on its own technique), per the rule at the top of this
    # file: the first hypothesis for an uncovered mark is that the TEST is wrong.
    ("10a-HS9 a null band suppresses the COUNT too, so six alarms read \"no readings\"",
     HEADER_STATUS_SRC,
     "    text: alarms === 0 ? (severity === null ? 'no readings' : 'all healthy') : alarmsWord(alarms),",
     "    text: severity === null ? 'no readings' : alarms === 0 ? 'all healthy' : alarmsWord(alarms),",
     [HEADER_STATUS_TEST]),
    ("10a-BN7 every condition is reported STALE, so a live reading wears a held reading's age",
     BANNER_SRC, "  stale: c.stale,", "  stale: true,", [BANNER_TEST]),
    ("10a-AB7 the age slot renders unconditionally, so a live alarm carries a stale marker",
     ALARM_BANNER_SRC,
     "{lead.age === null ? null : <span className={styles.stale}>{lead.age}</span>}",
     "<span className={styles.stale}>{lead.age ?? 'last read \u2014'}</span>",
     [ALARM_BANNER_TEST]),
    ("10a-GR6 the \u22651280px configuration loses its area map, so the design target auto-places",
     GRID_CSS_SRC,
     "    grid-template-areas:\n      'gpu0 gpu0 gpu1 gpu1'\n      'cooling cooling cpu memory'\n      'cooling cooling safety storage'\n      'serving serving log log';",
     "    grid-auto-rows: auto;",
     [GRID_TEST]),
    ("10a-GR7 the <900px stack is reordered, silently changing \u00a76.1's triage priority order",
     GRID_CSS_SRC,
     "    'gpu0'\n    'gpu1'\n    'cooling'\n    'safety'\n    'serving'",
     "    'gpu0'\n    'gpu1'\n    'safety'\n    'cooling'\n    'serving'",
     [GRID_TEST]),
    ("10a-GR8 the 900\u20131279px map drops COOLING's full-width row, contradicting the recorded decision",
     GRID_CSS_SRC,
     "      'gpu0 gpu1'\n      'cooling cooling'\n      'cpu memory'",
     "      'gpu0 gpu1'\n      'cooling cpu'\n      'memory memory'",
     [GRID_TEST]),
    ("10a-DS12 the window control is wired to nothing (F7's family)",
     DASHBOARD_SHELL_SRC,
     "onSetWindow={(minutes) => runtime.setWindow(minutes)}",
     "onSetWindow={() => undefined}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS13 refresh-now is wired to nothing (F7's family)",
     DASHBOARD_SHELL_SRC,
     "onRefreshNow={() => runtime.refreshNow()}",
     "onRefreshNow={() => undefined}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS14 the selects show a hard-coded default instead of the session's own preferences",
     DASHBOARD_SHELL_SRC,
     "          cadenceSeconds={state.preferences.cadenceSeconds}\n          windowMinutes={state.preferences.windowMinutes}",
     "          cadenceSeconds={5}\n          windowMinutes={30}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS15 every banner item gets an age, so a live reading is presented as a held one (F10 reversed)",
     DASHBOARD_SHELL_SRC,
     "  c.stale ? `last read ${formatAge(nowMs - c.lastSeenMs)} ago` : null;",
     "  `last read ${formatAge(nowMs - c.lastSeenMs)} ago`;",
     [DASHBOARD_SHELL_TEST]),
    ("10a-DS16 the hostname is a literal, so the header names a machine it never read",
     DASHBOARD_SHELL_SRC,
     "          hostname={formatText(snapshot?.hostname ?? null)}",
     "          hostname={'ai-server'}",
     [DASHBOARD_SHELL_TEST]),
    ("10a-PG2 the entry point server-renders a fact of its own, breaking HANDOVER rule 16 (F18)",
     PAGE_SRC,
     "  return <DashboardShell />;",
     "  return (\n    <>\n      <p>ai-server 192.168.4.71</p>\n      <DashboardShell />\n    </>\n  );",
     [PAGE_TEST]),
    # ⚠ S-C, 2026-09-08: the banner's "since" moved from a clock time to an elapsed duration
    # (`for 2 d 06:00`). The subtraction order is the whole implementation — swap it and every
    # confirmed band, however old, clamps to zero and reads "for <1 min" instead of naming how
    # long it has actually been standing. A plausible transposition (which operand comes first
    # in "elapsed = now minus since" is not mnemonic the way "age = now minus last-seen" is,
    # since this file writes both in the same few lines), and it reddens deterministically:
    # neither fixture in the ⚠ test below can produce anything but "for <1 min" under it.
    ("10a-SC1 the elapsed \"since\" subtracts in the wrong order, so every alarm reads \"for <1 min\" no matter how long it has stood",
     DASHBOARD_SHELL_SRC,
     "formatUptime(seconds(Math.max(0, nowMs - sinceMs) / 1000), 'for');",
     "formatUptime(seconds(Math.max(0, sinceMs - nowMs) / 1000), 'for');",
     [DASHBOARD_SHELL_TEST]),

    # ============================================== 10b — the nine panel bodies
    # components/panels/status-row.tsx
    ("10b-SR1 a stale note and an errors[] note share one CSS class, so the two can no longer be told apart",
     STATUS_ROW_SRC,
     "className={noteTone === 'watch' ? styles.noteWatch : styles.note}",
     "className={styles.note}",
     [STATUS_ROW_TEST]),
    ("10b-SR2 severity===undefined loosens to ==null, so an explicit severity={null} (O12's no-band chip) silently renders no chip at all",
     STATUS_ROW_SRC,
     "{severity === undefined ? null : (",
     "{severity == null ? null : (",
     [STATUS_ROW_TEST]),

    # components/panels/condition-lookup.ts
    ("10b-CL1 the stale age is measured from sinceMs (when the band was CONFIRMED) instead of lastSeenMs (when it was last SEEN)",
     CONDITION_LOOKUP_SRC,
     "`last read ${formatAge(nowMs - condition.lastSeenMs)} ago`",
     "`last read ${formatAge(nowMs - condition.sinceMs)} ago`",
     [CONDITION_LOOKUP_TEST]),

    # components/panels/event-sentence.ts — one mutation per LogEntryKind branch this
    # step's tests hold a property of.
    ("10b-ES1 a first sighting (from===null) grows a transition arrow it never earned",
     EVENT_SENTENCE_SRC,
     "return from === null ? `${label} ${detail}` : `${label} ${detail} (${from} → ${to})`;",
     "return `${label} ${detail} (${from} → ${to})`;",
     [EVENT_SENTENCE_TEST]),
    ("10b-ES2 a band transition names the two states in the WRONG order",
     EVENT_SENTENCE_SRC,
     "return from === null ? `${label} ${detail}` : `${label} ${detail} (${from} → ${to})`;",
     "return from === null ? `${label} ${detail}` : `${label} ${detail} (${to} → ${from})`;",
     [EVENT_SENTENCE_TEST]),
    ("10b-ES3 a standing entry's transitional form drops the visible \"standing\" marker",
     EVENT_SENTENCE_SRC,
     "        : `${label} ${detail} (${from} → ${to}) · standing`;",
     "        : `${label} ${detail} (${from} → ${to})`;",
     [EVENT_SENTENCE_TEST]),
    ("10b-ES4 source-lost always appends \" — \" plus the detail, even when there is none",
     EVENT_SENTENCE_SRC,
     "return detail === '' ? `${label} stopped answering` : `${label} stopped answering — ${detail}`;",
     "return `${label} stopped answering — ${detail}`;",
     [EVENT_SENTENCE_TEST]),
    ("10b-ES5 a retirement always names the band it left, even a never-confirmed one (from===null)",
     EVENT_SENTENCE_SRC,
     "return `${label} retired${from === null ? '' : ` (was ${from})`}`;",
     "return `${label} retired (was ${from})`;",
     [EVENT_SENTENCE_TEST]),
    ("10b-ES6 mode-stale always appends \" — \" plus the reason, even when there is none",
     EVENT_SENTENCE_SRC,
     "return detail === '' ? 'dashboard stale' : `dashboard stale — ${detail}`;",
     "return `dashboard stale — ${detail}`;",
     [EVENT_SENTENCE_TEST]),

    # components/panels/gpu-panel.tsx
    ("10b-GP1 the bus id is trimmed to nvidia-smi's short form, undoing §6.6's full-domain rule",
     GPU_PANEL_SRC,
     "const subtitle = `${formatText(gpu?.name ?? null)} · ${formatText(gpu?.bus ?? null)}`;",
     "const subtitle = `${formatText(gpu?.name ?? null)} · ${(gpu?.bus ?? '').split(':').slice(-2).join(':')}`;",
     [GPU_PANEL_TEST]),
    ("10b-GP2 a missing GPU temperature reading defaults to 0 °C instead of —, invariant 1's exact conflation",
     GPU_PANEL_SRC,
     '<Row label="temperature" value={formatCelsius(gpu?.tempC ?? null)} severity={severityGpuTemp(gpu?.tempC ?? null)} />',
     '<Row label="temperature" value={formatCelsius(gpu?.tempC ?? celsius(0))} severity={severityGpuTemp(gpu?.tempC ?? celsius(0))} />',
     [GPU_PANEL_TEST]),

    # components/panels/cpu-panel.tsx
    ("10b-CP1 the CPU model subtitle skips §3.2's trim, leaking the untrimmed marketing string",
     CPU_PANEL_SRC,
     "const subtitle = `${formatCpuModel(host?.cpuModel ?? null)} · ${coreThread(host?.cores ?? null)}C / ${coreThread(host?.threads ?? null)}T`;",
     "const subtitle = `${host?.cpuModel ?? '—'} · ${coreThread(host?.cores ?? null)}C / ${coreThread(host?.threads ?? null)}T`;",
     [CPU_PANEL_TEST]),
    ("10b-CP2 coreThread stops guarding null, so a missing core/thread count prints the literal word \"null\"",
     CPU_PANEL_SRC,
     "const coreThread = (n: number | null): string => (n === null ? EM_DASH : String(n));",
     "const coreThread = (n: number | null): string => String(n);",
     [CPU_PANEL_TEST]),
    ("10b-CP3 a missing CPU temperature defaults to 0 °C instead of —, invariant 1's exact conflation",
     CPU_PANEL_SRC,
     [
         ("const chip = severityCpuTemp(host?.cpuTempC ?? null);",
          "const chip = severityCpuTemp(host?.cpuTempC ?? celsius(0));"),
         ('        value={formatCelsius(host?.cpuTempC ?? null)}',
          '        value={formatCelsius(host?.cpuTempC ?? celsius(0))}'),
     ],
     [CPU_PANEL_TEST]),

    # components/panels/memory-panel.tsx
    ("10b-MP1 the swap row renders at 1dp (formatGiB) instead of §6.6's 2dp, rounding a small swap to 0.0",
     MEMORY_PANEL_SRC,
     '<Row label="swap" value={formatSwapGiB(swap)} severity={severitySwap(swap)} />',
     '<Row label="swap" value={formatGiB(swap)} severity={severitySwap(swap)} />',
     [MEMORY_PANEL_TEST]),
    # ⚠ Re-aimed by 10b-S-F (2026-09-08): the source line changed from `severityMemory(host)`
    # to `panelChip(severityRam(…), severitySwap(…))` — see panel-chip.ts's module doc for why
    # the composed helper had to be replaced with its two leaves. The mutation's INTENT is
    # unchanged: drop the swap leaf, banding on RAM% alone.
    ("10b-MP2 the panel head's chip drops the swap trigger, banding on RAM% alone",
     MEMORY_PANEL_SRC,
     "const chip = panelChip(severityRam(used, total), severitySwap(swap));",
     "const chip = panelChip(severityRam(used, total));",
     [MEMORY_PANEL_TEST]),
    ("10b-MP3 a missing RAM reading defaults to 0.0 GiB instead of —, invariant 1's exact conflation",
     MEMORY_PANEL_SRC,
     [
         ("import type { Host, TelemetrySnapshot } from '@/lib/types';",
          "import { gib } from '@/lib/types';\nimport type { Host, TelemetrySnapshot } from '@/lib/types';"),
         ("const used = host?.memUsedGiB ?? null;",
          "const used = host?.memUsedGiB ?? gib(0);"),
     ],
     [MEMORY_PANEL_TEST]),

    # components/panels/storage-network-panel.tsx
    # ⚠ Two pairs, each anchored on its OWN disk's surrounding text (`root.totalGiB` /
    # `home.totalGiB`) rather than on the bare `severity={rootSeverity}` / `severity={homeSeverity}`
    # tokens — those two are each other's replacement text, so a naive swap's second `.replace(…, 1)`
    # would silently undo the first and ship a no-op mutation.
    ("10b-SN1 the / and /home meters swap severities, so a full root disk bands the WRONG bar",
     STORAGE_NETWORK_PANEL_SRC,
     [
         ("total={storage?.root.totalGiB ?? null}\n        severity={rootSeverity}",
          "total={storage?.root.totalGiB ?? null}\n        severity={homeSeverity}"),
         ("total={storage?.home.totalGiB ?? null}\n        severity={homeSeverity}",
          "total={storage?.home.totalGiB ?? null}\n        severity={rootSeverity}"),
     ],
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10b-SN2 a stale link condition drops its age note, showing only the (stale) errors[] message if any",
     STORAGE_NETWORK_PANEL_SRC,
     "note={linkAge}\n        noteTone={linkAge === null ? 'muted' : 'watch'}",
     "note={null}\n        noteTone={linkAge === null ? 'muted' : 'watch'}",
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10b-SN3 a missing root-disk reading defaults to 0.0 GiB instead of —, invariant 1's exact conflation",
     STORAGE_NETWORK_PANEL_SRC,
     [
         ("import type { Storage, TelemetrySnapshot } from '@/lib/types';",
          "import { gib } from '@/lib/types';\nimport type { Storage, TelemetrySnapshot } from '@/lib/types';"),
         ("const rootSeverity = severityDiskFree(storage?.root.usedGiB ?? null, storage?.root.totalGiB ?? null);",
          "const rootSeverity = severityDiskFree(storage?.root.usedGiB ?? gib(0), storage?.root.totalGiB ?? null);"),
         ("formattedValue={`${formatGiB(storage?.root.usedGiB ?? null)} / ${formatGiB(storage?.root.totalGiB ?? null)}`}\n        used={storage?.root.usedGiB ?? null}",
          "formattedValue={`${formatGiB(storage?.root.usedGiB ?? gib(0))} / ${formatGiB(storage?.root.totalGiB ?? null)}`}\n        used={storage?.root.usedGiB ?? gib(0)}"),
     ],
     [STORAGE_NETWORK_PANEL_TEST]),

    # components/panels/cooling-panel.tsx
    ("10b-CO1 the derived-mode row (EC auto/unavailable) is given a hard-coded alarm chip, violating O13",
     COOLING_PANEL_SRC,
     '<Row label="mode" value={cooling === null ? formatText(null) : formatCh5Pwm(cooling)} />',
     '<Row label="mode" value={cooling === null ? formatText(null) : formatCh5Pwm(cooling)} severity="alarm" />',
     [COOLING_PANEL_TEST]),
    ("10b-CO2 the fan5 headline row drops its severity entirely, so a dead fan (0 RPM) never alarms",
     COOLING_PANEL_SRC,
     "severity={fan5Severity}",
     "severity={null}",
     [COOLING_PANEL_TEST]),
    ("10b-CO3 the fan 2 row's severity is hard-coded away, so a stopped fan 2 (0 RPM) never alarms",
     COOLING_PANEL_SRC,
     'severity={severityFanStopped(cooling?.fan2Rpm ?? null)}',
     'severity={null}',
     [COOLING_PANEL_TEST]),
    ("10b-CO4 the fan-service row drops its stale-age note, so an outage reads as a plain (stale) reading",
     COOLING_PANEL_SRC,
     "note={serviceAge}\n        noteTone={serviceAge === null ? 'muted' : 'watch'}",
     "note={null}\n        noteTone={serviceAge === null ? 'muted' : 'watch'}",
     [COOLING_PANEL_TEST]),
    # ⚠ S11/G5, settled 2026-09-08 (ruled while this loop was building SAFETY/COOLING):
    # widened §6.5 exception — a fan5 em dash beside the "unavailable" mode neighbour needs no
    # entry of its own, and the two rejected alternatives are both "invent copy in the panel".
    # This mutation reintroduces exactly the rejected fallback-sentence alternative.
    ("10b-CO5 the fan5 row invents a fallback \"no reading reported\" sentence when neither a stale age nor an errors[] entry exists, violating the widened S11/G5 exception",
     COOLING_PANEL_SRC,
     "note={fan5Age}\n          noteTone={fan5Age === null ? 'muted' : 'watch'}\n          detail={dellSmmError}",
     "note={fan5Age}\n          noteTone={fan5Age === null ? 'muted' : 'watch'}\n          detail={dellSmmError ?? 'channel 5 is not reporting a tach'}",
     [COOLING_PANEL_TEST]),

    # components/panels/serving-panel.tsx
    ("10b-SV1 a token rate leaks back into the instance row, violating decision 13",
     SERVING_PANEL_SRC,
     "    `health ${formatText(instance.health)}`,\n  ].join(' · ');",
     "    `health ${formatText(instance.health)}`,\n    '32 t/s',\n  ].join(' · ');",
     [SERVING_PANEL_TEST]),
    ("10b-SV2 the takeover branch drops its null check, so serving: null renders no rows and no explanation",
     SERVING_PANEL_SRC,
     "{instances === null || instances.length === 0 ? (",
     "{instances !== null && instances.length === 0 ? (",
     [SERVING_PANEL_TEST]),
    ("10b-SV3 an instance row drops its stale-age note, so an outage reads as a plain (stale) reading",
     SERVING_PANEL_SRC,
     "note={age}\n      noteTone={age === null ? 'muted' : 'watch'}",
     "note={null}\n      noteTone={age === null ? 'muted' : 'watch'}",
     [SERVING_PANEL_TEST]),

    # components/panels/safety-panel.tsx
    ("10b-SP1 yesNo stops translating booleans, so the three checks print true/false/null instead of yes/no/—",
     SAFETY_PANEL_SRC,
     "const yesNo = (value: boolean | null): string => (value === null ? formatText(null) : value ? 'yes' : 'no');",
     "const yesNo = (value: boolean | null): string => String(value);",
     [SAFETY_PANEL_TEST]),
    ("10b-SP2 the pwm5 row is wired to ufw's severity instead of its own, a copy-paste cross-wire",
     SAFETY_PANEL_SRC,
     '''        value={yesNo(safety?.pwm5Present ?? null)}
        severity={pwm5Severity}''',
     '''        value={yesNo(safety?.pwm5Present ?? null)}
        severity={ufwSeverity}''',
     [SAFETY_PANEL_TEST]),
    ("10b-SP3 an unknownStanding row is given a hard-coded watch chip, inventing a band O12 forbids",
     SAFETY_PANEL_SRC,
     '<Chip severity={null} size="sm" />',
     '<Chip severity="watch" size="sm" />',
     [SAFETY_PANEL_TEST]),
    ("10b-SP4 the fan-service row drops its stale-age note, so an outage reads as a plain (stale) reading",
     SAFETY_PANEL_SRC,
     "note={fanServiceAge}\n        noteTone={fanServiceAge === null ? 'muted' : 'watch'}",
     "note={null}\n        noteTone={fanServiceAge === null ? 'muted' : 'watch'}",
     [SAFETY_PANEL_TEST]),

    # components/panels/session-event-log-panel.tsx
    ("10b-SE1 the entry list is reversed before rendering, so the log reads oldest-first",
     SESSION_EVENT_LOG_PANEL_SRC,
     "{state.events.entries.map((entry) => (",
     "{[...state.events.entries].reverse().map((entry) => (",
     [SESSION_EVENT_LOG_PANEL_TEST]),
    ("10b-SE2 the panel head is given a hard-coded watch chip instead of the explicit no-band state",
     SESSION_EVENT_LOG_PANEL_SRC,
     'subtitle="state transitions since page load" chip={null}>',
     'subtitle="state transitions since page load" chip="watch">',
     [SESSION_EVENT_LOG_PANEL_TEST]),

    # ========================================= 10b's RECONCILIATION, 2026-09-08
    # Twenty mutations backing the fixes for adversarial F1a-F1c, F2-F10 and F12-F14. Every one
    # of the six invariant-1 entries below is a mutation the ADVERSARIAL ran by hand and watched
    # pass with the whole suite green; they are permanent regressions now rather than a finding.

    # ---- F1a/F1b/F1c: invariant 1, on the fields that had no null-side fixture at all.
    ("10b-CO6 the fan5 headline defaults a MISSING tach to 0 RPM - invariant 1's own example sentence, in the panel PLAN.md names it in",
     COOLING_PANEL_SRC,
     "value={staleValueOr(fan5Condition, formatRpm(cooling?.fan5Rpm ?? null))}",
     "value={staleValueOr(fan5Condition, formatRpm(cooling?.fan5Rpm ?? rpm(0)))}",
     [COOLING_PANEL_TEST]),
    ("10b-CO7 fan 2 defaults a missing tach to 0 RPM, rendering a FABRICATED red alarm on a fan nobody could read",
     COOLING_PANEL_SRC,
     [
         ('          value={formatRpm(cooling?.fan2Rpm ?? null)}\n          severity={severityFanStopped(cooling?.fan2Rpm ?? null)}',
          '          value={formatRpm(cooling?.fan2Rpm ?? rpm(0))}\n          severity={severityFanStopped(cooling?.fan2Rpm ?? rpm(0))}'),
     ],
     [COOLING_PANEL_TEST]),
    ("10b-GP3 a missing power reading defaults to 0.0 W - the second field on the card, untested on the null side before this",
     GPU_PANEL_SRC,
     [
         ("import { celsius } from '@/lib/types';",
          "import { celsius, watts } from '@/lib/types';"),
         ('value={`${formatWatts(gpu?.powerW ?? null)} of ${formatWatts(gpu?.powerCapW ?? null)} cap`}',
          'value={`${formatWatts(gpu?.powerW ?? watts(0))} of ${formatWatts(gpu?.powerCapW ?? null)} cap`}'),
     ],
     [GPU_PANEL_TEST]),
    ("10b-CP4 a missing CPU utilisation defaults to 0.0 %, so an unread /proc/stat reads as an idle box",
     CPU_PANEL_SRC,
     '        value={formatPercent(host?.cpuPct ?? null)}',
     '        value={formatPercent(host?.cpuPct ?? percent(0))}',
     [CPU_PANEL_TEST]),
    ("10b-MP4 a missing swap reading defaults to 0.00 GiB, so an unread /proc/meminfo reads as no swap in use",
     MEMORY_PANEL_SRC,
     [
         ("import type { Host, TelemetrySnapshot } from '@/lib/types';",
          "import { gib } from '@/lib/types';\nimport type { Host, TelemetrySnapshot } from '@/lib/types';"),
         ("const swap = host?.swapUsedGiB ?? null;", "const swap = host?.swapUsedGiB ?? gib(0);"),
     ],
     [MEMORY_PANEL_TEST]),
    ("10b-SN4 a missing eno1 rx rate defaults to 0 KB/s, so an unread /proc/net/dev reads as a silent link",
     STORAGE_NETWORK_PANEL_SRC,
     [
         ("import type { Storage, TelemetrySnapshot } from '@/lib/types';",
          "import { bytesPerSecond } from '@/lib/types';\nimport type { Storage, TelemetrySnapshot } from '@/lib/types';"),
         ("        value={formatBytesPerSecond(storage?.net.rxBytesPerSec ?? null)}",
          "        value={formatBytesPerSecond(storage?.net.rxBytesPerSec ?? bytesPerSecond(0))}"),
     ],
     [STORAGE_NETWORK_PANEL_TEST]),

    # ---- F2: SERVING attaches an entry to a row that entry is not about.
    ("10b-SV4 every serving errors[] entry attaches to EVERY instance row, so a healthy instance 0 prints instance 1's ECONNREFUSED",
     SERVING_PANEL_SRC,
     "    for (const e of servingErrors) if (namesInstance(e, instance)) bySource.set(e.source, e.message);",
     "    for (const e of servingErrors) bySource.set(e.source, e.message);",
     [SERVING_PANEL_TEST]),

    # ---- F3: the stale age displaces the errors[] explanation.
    ("10b-SR3 StatusRow drops its second note slot, so a stale row goes silent about its cause again",
     STATUS_ROW_SRC,
     "      {!shown(detail) ? null : <span className={styles.note}>{detail}</span>}\n",
     "",
     [STATUS_ROW_TEST, COOLING_PANEL_TEST, SAFETY_PANEL_TEST, STORAGE_NETWORK_PANEL_TEST, SERVING_PANEL_TEST]),

    # ---- F4: SS6.5's "a stale condition shows its LAST VALUE, unchanged".
    ("10b-CL2 the panel's stale sentence is reworded, drifting from the banner's (S-B's whole point)",
     CONDITION_LOOKUP_SRC,
     "`last read ${formatAge(nowMs - condition.lastSeenMs)} ago`",
     "`last seen ${formatAge(nowMs - condition.lastSeenMs)} ago`",
     [CONDITION_LOOKUP_TEST]),
    ("10b-CL3 staleValueOr blanks a stale reading to an em dash, contradicting the banner's own value for the same condition",
     CONDITION_LOOKUP_SRC,
     "  condition !== undefined && condition.stale && current === EM_DASH ? condition.value : current;",
     "  current;",
     [CONDITION_LOOKUP_TEST, COOLING_PANEL_TEST, STORAGE_NETWORK_PANEL_TEST]),

    # ---- F5: sources with no rendering path to the screen.
    ("10b-CP5 the CPU panel stops rendering coretemp's explanation, leaving a blanked temperature unexplained",
     CPU_PANEL_SRC,
     "        note={messageFor('coretemp')}",
     "        note={null}",
     [CPU_PANEL_TEST]),
    ("10b-MP5 the MEMORY panel drops proc-meminfo's explanation, so a blanked RAM pair is unexplained anywhere on the page",
     MEMORY_PANEL_SRC,
     "<PanelNotes messages={snapshot === null ? [] : errorsForPanel(snapshot, 'memory')} />",
     "<PanelNotes messages={[]} />",
     [MEMORY_PANEL_TEST]),
    ("10b-SN5 the STORAGE panel drops statvfs's explanation, so both mounts blank with no cause shown",
     STORAGE_NETWORK_PANEL_SRC,
     "const diskErrors = storageErrors.filter((e) => e.source === 'statvfs');",
     "const diskErrors: typeof storageErrors = [];",
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10b-PN1 PanelNotes renders an empty container for an empty list instead of nothing",
     PANEL_NOTES_SRC,
     "  if (messages.length === 0) return null;\n",
     "",
     [PANEL_NOTES_TEST]),

    ("10b-CP6 the CPU panel drops proc-cpuinfo's explanation, so a blanked SUBTITLE is unexplained anywhere",
     CPU_PANEL_SRC,
     "<PanelNotes messages={identityErrors} />",
     "<PanelNotes messages={[]} />",
     [CPU_PANEL_TEST]),
    ("10b-SN6 the STORAGE panel drops proc-net-dev's explanation, so both blanked counters are unexplained",
     STORAGE_NETWORK_PANEL_SRC,
     "        note={netError}",
     "        note={null}",
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10b-CL4 staleValueOr drops its em-dash guard, so a stale condition overrides a reading that IS present",
     CONDITION_LOOKUP_SRC,
     "  condition !== undefined && condition.stale && current === EM_DASH ? condition.value : current;",
     "  condition !== undefined && condition.stale ? condition.value : current;",
     [CONDITION_LOOKUP_TEST]),

    # ---- F7: a card absent from an enumeration that WAS read.
    ("10b-GP4 an absent card renders identically to a present card whose readings all failed, and still asserts a served model",
     GPU_PANEL_SRC,
     "  const absent = snapshot !== null && snapshot.gpus !== null && gpu === null;",
     "  const absent = false;",
     [GPU_PANEL_TEST]),

    # ---- F12: index and panelId could disagree; index is now derived from panelId.
    ("10b-GP5 the derived card index ignores panelId, so the gpu1 slot renders GPU 0's card under a GPU 0 heading",
     GPU_PANEL_SRC,
     "  const index: 0 | 1 = panelId === 'gpu0' ? 0 : 1;",
     "  const index: 0 | 1 = 0;",
     [GPU_PANEL_TEST]),

    # ---- F8: a fictitious axis before the first poll.
    ("10b-PC1 the chart domain loses its empty-ring branch, drawing a plausible half-hour ending at epoch 0 before any poll lands",
     PANEL_CHART_SRC,
     "  if (newest === null) return { startMs: 0, endMs: 0 };\n",
     "",
     [PANEL_CHART_TEST]),

    # ---- F10: first vs last errors[] entry per source.
    ("10b-CO9 the fan5 row shows the FIRST dell-smm message where the event log shows the LAST - two sentences for one fault in one session",
     COOLING_PANEL_SRC,
     "const dellSmmError = coolingErrors.findLast((e) => e.source === 'dell-smm')?.message ?? null;",
     "const dellSmmError = coolingErrors.find((e) => e.source === 'dell-smm')?.message ?? null;",
     [COOLING_PANEL_TEST]),

    # ---- F13: panelId is an id namespace, not display copy.
    ("10b-SE3 the log's accessible name is prefixed with a state value again, so it stutters the way the slot id did",
     SESSION_EVENT_LOG_PANEL_SRC,
     'aria-label="session event log"',
     'aria-label={`${state.mode} session event log`}',
     [SESSION_EVENT_LOG_PANEL_TEST]),

    # ---- F14: the branches that append an em-dashed detail.
    ("10b-ES7 the stale branch stops guarding an empty detail, ending the sentence with a dangling dash",
     EVENT_SENTENCE_SRC,
     "return detail === '' ? `${label} stale` : `${label} stale — last value ${detail}`;",
     "return `${label} stale — last value ${detail}`;",
     [EVENT_SENTENCE_TEST]),
    ("10b-ES8 the reading-returned branch stops guarding an empty detail, ending the sentence with a dangling dash",
     EVENT_SENTENCE_SRC,
     "return detail === '' ? `${label} reading returned` : `${label} reading returned — ${detail}`;",
     "return `${label} reading returned — ${detail}`;",
     [EVENT_SENTENCE_TEST]),

    # ============================================== components/panels/panel-chip.ts (10b-S-F)
    # The owner's ruling on §6.2's chip, 2026-09-08: the worst band among a panel's own
    # readings, skipping nulls — EXCEPT a panel that would read `normal` while one of those same
    # readings is `null` shows NO BAND instead, and — this is the part a careless fix breaks —
    # `watch`/`alarm` are returned untouched. Three mutations, one per way to get that WRONG;
    # `MEMORY_PANEL_TEST` rides along on the two that a real MEMORY snapshot can distinguish, so
    # the shared helper's own tests double as evidence the panel that found the bug is wired to
    # it, without a second implementation of the same logic to keep in sync.
    ("10b-PH1 the downgrade fires on ANY null regardless of the worst band, so an alarm loses its colour to an unrelated unreadable field",
     PANEL_CHIP_SRC,
     "  return worst === 'normal' && severities.includes(null) ? null : worst;",
     "  return severities.includes(null) ? null : worst;",
     [PANEL_CHIP_TEST, MEMORY_PANEL_TEST]),
    ("10b-PH2 the downgrade never fires at all, so a panel goes green over its own em dash exactly like the finding",
     PANEL_CHIP_SRC,
     "  return worst === 'normal' && severities.includes(null) ? null : worst;",
     "  return worst;",
     [PANEL_CHIP_TEST, MEMORY_PANEL_TEST]),
    ("10b-PH3 normal is downgraded to no band even with no null reading at all, so a fully-read panel can never show green",
     PANEL_CHIP_SRC,
     "  return worst === 'normal' && severities.includes(null) ? null : worst;",
     "  return worst === 'normal' ? null : worst;",
     [PANEL_CHIP_TEST]),

    # components/panels/memory-panel.tsx (10b-S-F) — the WIRING, guarded separately from
    # panel-chip.ts's own logic above: this reintroduces `worstSeverity`'s null-skip at the call
    # site via `??`, the exact shape `severityMemory` had before this ruling, without touching
    # panel-chip.ts at all. `10b-PH1`/`10b-PH2` above would not catch a regression here if
    # `panelChip` itself stayed correct but MEMORY stopped calling it correctly.
    ("10b-MP6 the chip falls back from a null RAM reading to swap via ??, reintroducing the exact null-skip the ruling forbids at the call site",
     MEMORY_PANEL_SRC,
     "const chip = panelChip(severityRam(used, total), severitySwap(swap));",
     "const chip = severityRam(used, total) ?? severitySwap(swap);",
     [MEMORY_PANEL_TEST]),

    # ================================== 10b-S-G's RECONCILIATION, 2026-09-08 (adversarial A1/A2/A5)
    # Five mutations on the two things S-G left unguarded: the SECOND `namesInstance` call site
    # (`unattributed`, which had none — deleting it left the whole suite green at 93 files /
    # 2587 tests), and the two OTHER panels `panelsForSource('dbus')` reaches, which S-G taught
    # nothing about `instance`.
    ("10b-SG3 COOLING's fan-service row explains itself with a dbus entry about an llama-server instance",
     COOLING_PANEL_SRC,
     "    coolingErrors.findLast((e) => e.source === 'dbus' && e.instance === undefined)?.message ?? null;",
     "    coolingErrors.findLast((e) => e.source === 'dbus')?.message ?? null;",
     [COOLING_PANEL_TEST]),
    ("10b-SG4 SAFETY's rows explain themselves with an entry that names an llama-server instance",
     SAFETY_PANEL_SRC,
     "    safetyErrors.findLast((e) => e.source === source && e.instance === undefined)?.message ?? null;",
     "    safetyErrors.findLast((e) => e.source === source)?.message ?? null;",
     [SAFETY_PANEL_TEST]),
    ("10b-SG5 every attributed serving entry is ALSO printed as a panel-level note, so one fault reads as two",
     SERVING_PANEL_SRC,
     "  const unattributed = servingErrors.filter(\n    (e) => !(instances ?? []).some((instance) => namesInstance(e, instance)),\n  );",
     "  const unattributed = servingErrors;",
     [SERVING_PANEL_TEST]),
    ("10b-SG6 the panel-level note is dropped, so an entry that names no row on this page renders nowhere",
     SERVING_PANEL_SRC,
     "  const unattributed = servingErrors.filter(\n    (e) => !(instances ?? []).some((instance) => namesInstance(e, instance)),\n  );",
     "  const unattributed = servingErrors.filter(() => false);",
     [SERVING_PANEL_TEST]),
    ("10b-SG7 the serving: null / serving: [] takeover swallows the entries that explain WHY nothing was enumerated",
     SERVING_PANEL_SRC,
     "          {servingErrors.map((e) => (",
     "          {[].map((e: TelemetryError) => (",
     [SERVING_PANEL_TEST]),

    # ================================== 10c1 — the wiring loop
    # `dashboard-shell.tsx`: replacing the nine `PanelPlaceholder`s with the real panels, and
    # Q2-S2's chart/table toggle as shell-owned per-panel state.
    ("10c-DS1 the GPU 1 slot is fed panelId=\"gpu0\", a copy-paste wiring bug the placeholder's marker used to catch",
     DASHBOARD_SHELL_SRC,
     '            panelId="gpu1"',
     '            panelId="gpu0"',
     [DASHBOARD_SHELL_TEST]),
    ("10c-DS2 toggling one panel resets every OTHER chart-bearing panel back to chart view",
     DASHBOARD_SHELL_SRC,
     "    setChartViews((prev) => ({ ...prev, [id]: prev[id] === 'chart' ? 'table' : 'chart' }));",
     "    setChartViews((prev) => ({ ...INITIAL_CHART_VIEWS, [id]: prev[id] === 'chart' ? 'table' : 'chart' }));",
     [DASHBOARD_SHELL_TEST]),
    ("10c-DS3 the toggle never flips — clicking a chart's table-view button leaves it in chart view",
     DASHBOARD_SHELL_SRC,
     "    setChartViews((prev) => ({ ...prev, [id]: prev[id] === 'chart' ? 'table' : 'chart' }));",
     "    setChartViews((prev) => ({ ...prev, [id]: 'chart' }));",
     [DASHBOARD_SHELL_TEST]),
    ("10c-DS4 every chart-bearing panel starts in TABLE view, not chart view",
     DASHBOARD_SHELL_SRC,
     "const INITIAL_CHART_VIEWS: ChartViewMap = { gpu0: 'chart', gpu1: 'chart', cpu: 'chart', cooling: 'chart' };",
     "const INITIAL_CHART_VIEWS: ChartViewMap = { gpu0: 'table', gpu1: 'table', cpu: 'table', cooling: 'table' };",
     [DASHBOARD_SHELL_TEST]),

    # ⚠ Added by 10c1's RECONCILIATION (adversarial A3/A4). `10c-DS2/3/4` mutate
    # `toggleChartView`/`INITIAL_CHART_VIEWS` — the mechanism all four slots SHARE. The four
    # per-slot wirings are a separate thing, and only two of them (`gpu0`, `cpu`) were ever
    # clicked: HANDOVER §0.5's "a function used more than once, mutated once", at a fourth site.
    ("10c-DS5 the GPU 1 slot reads GPU 0's view, so GPU 0's toggle silently flips GPU 1 too",
     DASHBOARD_SHELL_SRC,
     "            view={chartViews.gpu1}",
     "            view={chartViews.gpu0}",
     [DASHBOARD_SHELL_TEST]),
    ("10c-DS6 GPU 1's toggle button sends its click to GPU 0 — the card the operator was reading changes instead",
     DASHBOARD_SHELL_SRC,
     "            onToggleView={() => toggleChartView('gpu1')}",
     "            onToggleView={() => toggleChartView('gpu0')}",
     [DASHBOARD_SHELL_TEST]),
    ("10c-DS7 COOLING's toggle button sends its click to CPU — the fourth wiring, previously never clicked",
     DASHBOARD_SHELL_SRC,
     "            onToggleView={() => toggleChartView('cooling')}",
     "            onToggleView={() => toggleChartView('cpu')}",
     [DASHBOARD_SHELL_TEST]),

    # components/panels/chart-view-toggle.tsx — the control itself.
    ("10c-CVT1 the button's onClick is dropped, so clicking it never reaches the caller's onToggle",
     CHART_VIEW_TOGGLE_SRC,
     "      onClick={onToggle}",
     "      onClick={() => undefined}",
     [CHART_VIEW_TOGGLE_TEST]),
    ("10c-CVT2 the button always offers \"table view\", even while already showing the table",
     CHART_VIEW_TOGGLE_SRC,
     "      {isTable ? 'chart view' : 'table view'}",
     "      {'table view'}",
     [CHART_VIEW_TOGGLE_TEST]),
    ("10c-CVT3 the button always offers \"chart view\", even while still showing the chart",
     CHART_VIEW_TOGGLE_SRC,
     "      {isTable ? 'chart view' : 'table view'}",
     "      {'chart view'}",
     [CHART_VIEW_TOGGLE_TEST]),

    # components/panels/gpu-panel.tsx — the toggle's plumbing into the two chart elements.
    ("10c-GP1 the default view is \"table\", so a GPU card renders as a table before anyone toggles anything",
     GPU_PANEL_SRC,
     "export function GpuPanel({ state, panelId, view = 'chart', onToggleView }: GpuPanelProps) {",
     "export function GpuPanel({ state, panelId, view = 'table', onToggleView }: GpuPanelProps) {",
     [GPU_PANEL_TEST]),
    ("10c-GP2 the toggle control never renders, even when the caller supplies onToggleView",
     GPU_PANEL_SRC,
     "          {onToggleView === undefined ? null : (\n            <ChartViewToggle view={view} onToggle={onToggleView} label={ariaLabel} />\n          )}",
     "          {null}",
     [GPU_PANEL_TEST]),
    ("10c-GP3 the sparkline is pinned to chart view, so only the ≥1600px promotion ever switches to a table",
     GPU_PANEL_SRC,
     "              height={CHART_SIZE.sparkline.height}\n              view={view}",
     "              height={CHART_SIZE.sparkline.height}\n              view=\"chart\"",
     [GPU_PANEL_TEST]),

    # ⚠ Added by 10c1's RECONCILIATION (adversarial A1/A2/A11) — ONE defect shape at three
    # sites in this file: `components/panels/` assumed `gpus` and `serving` are dense arrays
    # indexed from zero, and BOTH collectors document that they are not
    # (`llama.ts:61 discoverInstances` returns the sorted SET of found indices;
    # `nvidia-smi.ts:147` skips a row whose index will not parse). A hard-coded `=== 0` was
    # already caught; only the POSITIONAL variant escaped, and it escaped because every
    # two-card fixture in the project was dense, in order and — A10 — identical card to card.
    ("10c-GP4 the §6.2 GPU↔instance join becomes array-POSITION lookup, printing another card's model",
     GPU_PANEL_SRC,
     "  snapshot?.serving?.find((s) => s.instance === index) ?? null;",
     "  snapshot?.serving?.[index] ?? null;",
     [GPU_PANEL_TEST]),
    ("10c-GP5 the card lookup becomes array-POSITION, so a sparse gpus[] renders GPU 1's die titled GPU 0",
     GPU_PANEL_SRC,
     "  snapshot?.gpus?.find((g) => g.index === index) ?? null;",
     "  snapshot?.gpus?.[index] ?? null;",
     [GPU_PANEL_TEST]),
    ("10c-GP6 GPU 1's temperature TRACE reads card 0 — 10c-CO4's exact twin in the other file",
     GPU_PANEL_SRC,
     "  const trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === index)?.tempC ?? null);",
     "  const trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 0)?.tempC ?? null);",
     [GPU_PANEL_TEST]),

    # components/panels/cpu-panel.tsx — one toggle governs BOTH sparklines.
    ("10c-CP1 the default view is \"table\", so the CPU card renders as tables before anyone toggles anything",
     CPU_PANEL_SRC,
     "export function CpuPanel({ state, view = 'chart', onToggleView }: CpuPanelProps) {",
     "export function CpuPanel({ state, view = 'table', onToggleView }: CpuPanelProps) {",
     [CPU_PANEL_TEST]),
    ("10c-CP2 the toggle control never renders, even when the caller supplies onToggleView",
     CPU_PANEL_SRC,
     "      {onToggleView === undefined ? null : (\n        <ChartViewToggle view={view} onToggle={onToggleView} label=\"CPU charts\" />\n      )}",
     "      {null}",
     [CPU_PANEL_TEST]),
    ("10c-CP3 the temperature sparkline is pinned to chart view, so toggling the panel only switches utilisation",
     CPU_PANEL_SRC,
     "        color={SERIES_COLORS.gpu0}\n        width={CHART_SIZE.sparkline.width}\n        height={CHART_SIZE.sparkline.height}\n        view={view}",
     "        color={SERIES_COLORS.gpu0}\n        width={CHART_SIZE.sparkline.width}\n        height={CHART_SIZE.sparkline.height}\n        view=\"chart\"",
     [CPU_PANEL_TEST]),

    # components/panels/cooling-panel.tsx
    ("10c-CO1 the default view is \"table\", so COOLING's shared-time chart renders as a table before anyone toggles anything",
     COOLING_PANEL_SRC,
     "export function CoolingPanel({ state, nowMs, panelId, view = 'chart', onToggleView }: CoolingPanelProps) {",
     "export function CoolingPanel({ state, nowMs, panelId, view = 'table', onToggleView }: CoolingPanelProps) {",
     [COOLING_PANEL_TEST]),
    ("10c-CO2 the toggle control never renders, even when the caller supplies onToggleView",
     COOLING_PANEL_SRC,
     "        {onToggleView === undefined ? null : (\n          <ChartViewToggle\n            view={view}\n            onToggle={onToggleView}\n            label=\"GPU temperature and fan 5 RPM\"\n          />\n        )}",
     "        {null}",
     [COOLING_PANEL_TEST]),
    ("10c-CO3 the shared-time chart is pinned to chart view, so the toggle changes only its own control's label",
     COOLING_PANEL_SRC,
     "          width={CHART_SIZE.cooling.width}\n          plotHeight={CHART_SIZE.cooling.height}\n          view={view}",
     "          width={CHART_SIZE.cooling.width}\n          plotHeight={CHART_SIZE.cooling.height}\n          view=\"chart\"",
     [COOLING_PANEL_TEST]),
    # ⚠ Added by 10c1's TEST phase — found while chasing the handoff's "are there other fixtures
    # with the single-GPU assumption" question. `everythingZero` enumerates only GPU 0, so this
    # line's `g.index === 1` lookup was never exercised against a real second card by any fixture
    # in the project; duplicating GPU 0's lookup here passed the whole suite before this mutation
    # and its paired test existed.
    ("10c-CO4 the GPU 1 trace reads GPU 0's card instead of its own — GPU 1's line duplicates GPU 0's",
     COOLING_PANEL_SRC,
     "  const gpu1Trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 1)?.tempC ?? null);",
     "  const gpu1Trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 0)?.tempC ?? null);",
     [COOLING_PANEL_TEST]),

    # lib/client/force-alarm.ts — 10a-F4's alarm-forcing escape hatch. Pure, so every mutation
    # is caught by the plain-Node unit tests alone.
    ("10c-FA1 the production gate is INVERTED, so the escape hatch forces an alarm in production and never off it",
     FORCE_ALARM_SRC,
     "  if (nodeEnv === 'production') return body;",
     "  if (nodeEnv !== 'production') return body;",
     [FORCE_ALARM_TEST]),
    ("10c-FA2 the query-string gate is removed, so EVERY non-production poll is forced into alarm",
     FORCE_ALARM_SRC,
     "  if (!new URLSearchParams(search).has(FORCE_ALARM_PARAM)) return body;",
     "  if (false) return body;",
     # ⚠ Both files: the pure function's own tests AND the wiring test, whose "no query flag →
     # the body is handed on unchanged" case is exactly what this mutation destroys. Added by
     # 10c1's reconciliation.
     [FORCE_ALARM_TEST, FORCE_ALARM_WIRING_TEST]),
    ("10c-FA3 the forced temperature no longer clears §6.3's alarm threshold",
     FORCE_ALARM_SRC,
     "const FORCED_ALARM_TEMP_C = 95;",
     "const FORCED_ALARM_TEMP_C = 50;",
     [FORCE_ALARM_TEST]),
    ("10c-FA4 forcing the temperature drops every OTHER field on GPU 0 instead of carrying them through",
     FORCE_ALARM_SRC,
     "  const forcedGpu = { ...(firstGpu as Record<string, unknown>), tempC: FORCED_ALARM_TEMP_C };",
     "  const forcedGpu = { tempC: FORCED_ALARM_TEMP_C };",
     [FORCE_ALARM_TEST]),
    ("10c-FA5 the null-body guard is dropped, so a null body reaches the gpus lookup and throws",
     FORCE_ALARM_SRC,
     "  if (body === null || typeof body !== 'object') return body;",
     "  if (typeof body !== 'object') return body;",
     [FORCE_ALARM_TEST]),
    ("10c-FA6 the array-shape guard is dropped, so a missing or null gpus field throws instead of passing through",
     FORCE_ALARM_SRC,
     "  if (!Array.isArray(snapshot.gpus) || snapshot.gpus.length === 0) return body;",
     "  if (snapshot.gpus.length === 0) return body;",
     [FORCE_ALARM_TEST]),

    # ⚠ Added by 10c1's RECONCILIATION (adversarial A5/A6) — the escape hatch's WIRING, which
    # is a different thing from the pure function `10c-FA1..6` cover. The gate's whole
    # production-unreachability argument rests on `process.env.NODE_ENV` at ONE call site,
    # which Next's build replaces with the literal `"production"`. The adversarial replaced the
    # token with `'development'`, and `pnpm verify`, this harness AND `pnpm build` all stayed
    # green while the shipped chunk read `location.search,"development"`.
    ("10c-UT1 the production gate's token is replaced by a literal 'development' — the exact edit that reached a real bundle",
     USE_TELEMETRY_SRC,
     "window.location.search, process.env.NODE_ENV)",
     "window.location.search, 'development')",
     [FORCE_ALARM_WIRING_TEST]),
    ("10c-UT2 the opt-in reads location.hash, so the query-string gate can never open at all",
     USE_TELEMETRY_SRC,
     "response.body, window.location.search,",
     "response.body, window.location.hash,",
     [FORCE_ALARM_WIRING_TEST]),
    ("10c-UT3 the wrapper is dropped — the hatch is wired in but does nothing, indistinguishable from working on a GPU-less host",
     USE_TELEMETRY_SRC,
     "          body: forceAlarmForTesting(response.body, window.location.search, process.env.NODE_ENV),",
     "          body: response.body,",
     [FORCE_ALARM_WIRING_TEST]),

    # ⚠ === 10c-2's four guards — each demonstrated live by hand before being wired here
    #    (10c2-build.md), reproduced as an anchored mutation rather than left as a one-off. ===

    # `10b-F1-guard` (the toContain-scope lint): un-scoping a check back to the whole document
    # is exactly the shape all four historical bugs took. This is the SAME edit the parent
    # made by hand to prove the guard fires, now pinned.
    ("10c-G2 cpu-panel's temperature-severity check is un-scoped back to the whole document",
     CPU_PANEL_TEST,
     "    const row = rowContaining(html, 'temperature');\n"
     "    expect(row).toContain('data-severity=\"alarm\"');\n"
     "    expect(row).toContain('95 °C');",
     "    const row = rowContaining(html, 'temperature');\n"
     "    expect(html).toContain('data-severity=\"alarm\"');\n"
     "    expect(row).toContain('95 °C');",
     [TOCONTAIN_SCOPE_TEST]),

    # `10c1-A8-audit` (the dangling-class audit): a misspelled/deleted class resolves to a
    # plausible hash through the CSS-module Proxy and is invisible to `tsc` and every render
    # test — this is `alarm-banner.tsx`'s own historical `styles.item` bug, reproduced on a
    # different class so the anchor stays unique.
    ("10c-G3 alarm-banner.tsx's outer wrapper references a class with no rule in its stylesheet",
     ALARM_BANNER_SRC,
     '<div className={styles.banner} role="alert">',
     '<div className={styles.zzzNoSuchRule} role="alert">',
     [DANGLING_CSS_CLASS_TEST]),

    # L11 (the unit-suffix guard): a component hand-builds the reading instead of calling the
    # formatter — right next to a correct `formatRpm` call on the sibling row, so this is
    # exactly the edit an inattentive copy-paste would make.
    ("10c-G4 cooling-panel's fan 2 row hand-builds its RPM string instead of calling formatRpm",
     COOLING_PANEL_SRC,
     "value={formatRpm(cooling?.fan2Rpm ?? null)}",
     "value={`${cooling?.fan2Rpm ?? 0} RPM`}",
     [UNIT_SUFFIX_TEST]),

    # Q1-F4 (the cross-harness runner): removing a ⚠-bearing file from LEDGER_FILES is
    # precisely what makes a test file an unprovable orphan — this mutates THIS harness's own
    # list, not a component. `main()` restores the original text from memory in its `finally`
    # block regardless of outcome, the same guarantee every other mutation here relies on; the
    # `pnpm vitest run` subprocess reads the mutated file fresh from disk, which is the whole
    # point of a text-anchored harness rather than an in-process one.
    ("10c-G5 cpu-panel.test.tsx is dropped from this file's own LEDGER_FILES, becoming an orphan with live ⚠ marks",
     "pipeline/steps/10-panels-assembly/regressions.py",
     "    GPU_PANEL_TEST, CPU_PANEL_TEST, MEMORY_PANEL_TEST, COOLING_PANEL_TEST,\n",
     "    GPU_PANEL_TEST, MEMORY_PANEL_TEST, COOLING_PANEL_TEST,\n",
     [CROSS_HARNESS_LEDGER_TEST]),
]

# ---------------------------------------------------------------------------
# ⚠ Mutation ids must be unique — and, since 2026-09-08, carry their CREATING step as a
#    prefix (ANCHOR §9). `10a-` here; 10b and 10c use their own.
# ---------------------------------------------------------------------------
def _assert_unique_ids() -> None:
    seen: dict[str, int] = {}
    for entry in REGRESSIONS:
        eid = entry[0].split()[0]
        seen[eid] = seen.get(eid, 0) + 1
    dupes = sorted(k for k, n in seen.items() if n > 1)
    if dupes:
        raise SystemExit(f"!!! duplicate mutation ids, which make the failure lists ambiguous: {', '.join(dupes)}")
    # ⚠ SCOPE.md's three-loop split (10a/10b/10c) shares this one harness, so more than one
    # creating-step prefix is expected here — unlike a harness inherited unchanged from an
    # earlier step. Widen this set as each further loop lands its own mutations.
    # ⚠ `10c-` added by 10c1 (the wiring loop, first of 10c's three parts) — see the handoff's
    # "back each ⚠ mark with a 10c-prefixed mutation" instruction.
    bad_prefix = sorted(k for k in seen if not k.startswith(("10a-", "10b-", "10c-")))
    if bad_prefix:
        raise SystemExit(
            f"!!! mutation ids must carry the creating step's prefix (10a-/10b-/10c-): {', '.join(bad_prefix)}"
        )


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
