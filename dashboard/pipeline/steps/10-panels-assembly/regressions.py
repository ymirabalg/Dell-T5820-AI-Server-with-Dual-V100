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
# 10e — the shared Caption leaf (§2.0, new): GPU's throttle line, STORAGE's link line.
CAPTION_TEST = "components/panels/caption.test.tsx"
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
    CAPTION_TEST,
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
CAPTION_SRC = "components/panels/caption.tsx"
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
    # ⚠ 10e re-aimed H3/H4/H5/H6/H9: every header button went glyph-only (§4) — new attribute
    # order and no more visible words on the pause/resume button. Same properties, new anchors.
    ("10a-H3 the refresh button no longer calls onRefreshNow",
     HEADER_SRC,
     'onClick={onRefreshNow}>\n          ⟳',
     'onClick={() => undefined}>\n          ⟳',
     [HEADER_TEST]),
    ("10a-H4 the pause/resume button no longer calls onPauseResume",
     HEADER_SRC,
     '          onClick={onPauseResume}',
     '          onClick={() => undefined}',
     [HEADER_TEST]),
    ("10a-H5 the pause/resume label is stuck on \"❙❙\" (pause), never announcing \"▶\" (resume)",
     HEADER_SRC,
     "{paused ? '▶' : '❙❙'}",
     "{'❙❙'}",
     [HEADER_TEST]),
    ("10a-H6 the logout button no longer calls onLogout",
     HEADER_SRC,
     '          onClick={onLogout}',
     '          onClick={() => undefined}',
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
     '<span aria-hidden="true" className={styles.separator} />\n\n        <button\n          type="button"\n          className={styles.logout}',
     '<button\n          type="button"\n          className={styles.logout}',
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
    # ⚠ 10e RETIRED `10a-H13`, not re-aimed. Its whole premise was "the refresh-now button loses
    # its visible text `⟳ refresh`" — but 10e's own §4 redesign makes every header button
    # glyph-only BY DESIGN (`⟳` alone, no trailing word, ever). There is no "visible text" left
    # for a mutation to remove; the property this guarded (a real accessible name surviving the
    # glyph-only form) is now `header.test.tsx`'s own `aria-label="Refresh now"` assertions,
    # which nothing here can silently defeat the way a stray `toContain('refresh')` once could.
    # Per HANDOVER §5.2 rule 1: the property has no plausible wrong implementation left to write
    # against this source, so the mutation is dropped rather than kept as a no-op.
    # ⚠ 10e's TEST phase upheld the retirement and added the two guards it leans on:
    # `10e-HD3` (the `refresh` -> `cadence` rename that removed the ambiguous word from the
    # markup at all) and `10e-HD2` (the pause control's accessible name, which `10a-H5` stopped
    # reaching once the word moved off the glyph). ⚠ The header mutations 10e's BUILD named
    # `10e-H1` are `10e-HD*` here: step 9's harness already owns `10e-H1`..`10e-H4` for the new
    # `Hero` leaf, and a bare `10e-H1` in a step note was ambiguous between the two files —
    # the exact collision ANCHOR §9's prefix rule exists to prevent, one level in.

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
     # ⚠ 10f/Q1 re-aimed: the class ternary became a two-branch conditional when the muted
     # branch gained Q1's well attributes. Same property — collapse the WATCH branch onto the
     # muted class and the two facts become indistinguishable.
     "          <span className={styles.noteWatch}>{note}</span>",
     "          <span className={styles.note}>{note}</span>",
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
     [("  const tempSeverity = severityGpuTemp(gpu?.tempC ?? null);",
       "  const tempSeverity = severityGpuTemp(gpu?.tempC ?? celsius(0));"),
      ("  const tempParts = formatCelsiusParts(gpu?.tempC ?? null);",
       "  const tempParts = formatCelsiusParts(gpu?.tempC ?? celsius(0));")],
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
     [("  const chip = severityCpuTemp(host?.cpuTempC ?? null);",
       "  const chip = severityCpuTemp(host?.cpuTempC ?? celsius(0));"),
      ("  const tempParts = formatCelsiusParts(host?.cpuTempC ?? null);",
       "  const tempParts = formatCelsiusParts(host?.cpuTempC ?? celsius(0));")],
     [CPU_PANEL_TEST]),

    # components/panels/memory-panel.tsx
    ("10b-MP1 the swap row renders at 1dp (formatGiB) instead of §6.6's 2dp, rounding a small swap to 0.0",
     MEMORY_PANEL_SRC,
     "formattedValue={`${formatSwapGiB(swap)} / ${formatSwapGiB(swapTotal)}`}",
     "formattedValue={`${formatGiB(swap)} / ${formatSwapGiB(swapTotal)}`}",
     [MEMORY_PANEL_TEST]),
    # ⚠ Re-aimed by 10b-S-F (2026-09-08): the source line changed from `severityMemory(host)`
    # to `panelChip(severityRam(…), severitySwap(…))` — see panel-chip.ts's module doc for why
    # the composed helper had to be replaced with its two leaves. The mutation's INTENT is
    # unchanged: drop the swap leaf, banding on RAM% alone.
    ("10b-MP2 the panel head's chip drops the swap trigger, banding on RAM% alone",
     MEMORY_PANEL_SRC,
     "  const chip = panelChip(ramSeverity, swapSeverity);",
     "  const chip = panelChip(ramSeverity);",
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
     "{linkAge === null ? null : (",
     "{true ? null : (",
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
     '<Chip severity={null} size="md" label={cooling === null ? formatText(null) : formatCh5Pwm(cooling)} />',
     '<Chip severity="alarm" size="md" label={cooling === null ? formatText(null) : formatCh5Pwm(cooling)} />',
     [COOLING_PANEL_TEST]),
    ("10b-CO2 the fan5 headline row drops its severity entirely, so a dead fan (0 RPM) never alarms",
     COOLING_PANEL_SRC,
     "severity={fan5Severity}",
     "severity={null}",
     [COOLING_PANEL_TEST]),
    ("10b-CO3 the fan 2 row's severity is hard-coded away, so a stopped fan 2 (0 RPM) never alarms",
     COOLING_PANEL_SRC,
     "{ id: 'fan 2', value: cooling?.fan2Rpm ?? null, severity: fan2Severity, note: null },",
     "{ id: 'fan 2', value: cooling?.fan2Rpm ?? null, severity: null, note: null },",
     [COOLING_PANEL_TEST]),
    ("10b-CO4 the fan-service row drops its stale-age note, so an outage reads as a plain (stale) reading",
     COOLING_PANEL_SRC,
     "          note={serviceAge}\n          noteTone={serviceAge === null ? 'muted' : 'watch'}",
     "          note={null}\n          noteTone={serviceAge === null ? 'muted' : 'watch'}",
     [COOLING_PANEL_TEST]),
    # ⚠ S11/G5, settled 2026-09-08 (ruled while this loop was building SAFETY/COOLING):
    # widened §6.5 exception — a fan5 em dash beside the "unavailable" mode neighbour needs no
    # entry of its own, and the two rejected alternatives are both "invent copy in the panel".
    # This mutation reintroduces exactly the rejected fallback-sentence alternative.
    #
    # ⚠ 10e's build RETIRED this mutation ("structurally superseded"); 10e's TEST phase
    # RESTORED it, re-aimed. The retirement premise was that the anchor
    # (`note={fan5Age} … detail={dellSmmError}` on a fan5 `Row`) no longer exists — true, the
    # headline is a `Hero` now with no note slot. But the PROPERTY is not superseded: the
    # `errors[]` text for channel 5 simply moved to `PanelNotes`, and writing
    # `dellSmmError ?? '<a sentence>'` there is exactly the alternative §3.7 and the S11/G5
    # ruling reject, one line further down the same file. Without this mutation the ⚠ test
    # `⚠ S11/G5 … needs NO entry of its own` is reddened only by `10b-CO6` (which breaks its
    # em-dash assertion), so its `not.toMatch(/class="_note/)` half — the half the ruling is
    # about — was inert. HANDOVER §5.2 rule 2: the ledger cannot tell a mark reddened for the
    # RIGHT reason from one reddened for another.
    ("10b-CO5 the fan5 explanation invents a fallback \"no reading reported\" sentence when no errors[] entry exists, violating the widened S11/G5 exception",
     COOLING_PANEL_SRC,
     # ⚠ 10f/Q1 re-aimed: the call gained `bound="roomy"` and wrapped onto its own lines.
     "        messages={dellSmmError === null ? [] : [{ source: 'dell-smm', message: dellSmmError }]}",
     "        messages={[{ source: 'dell-smm', message: dellSmmError ?? 'channel 5 is not reporting a tach' }]}",
     [COOLING_PANEL_TEST]),

    # components/panels/serving-panel.tsx
    ("10b-SV1 a token rate leaks back into the instance row, violating decision 13",
     SERVING_PANEL_SRC,
     "    endPrefix={`health ${formatText(instance.health)}`}",
     "    endPrefix={`health ${formatText(instance.health)}` + ' · 32 t/s'}",
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
     "          value={yesNo(safety?.pwm5Present ?? null)}\n          severity={pwm5Severity}",
     "          value={yesNo(safety?.pwm5Present ?? null)}\n          severity={ufwSeverity}",
     [SAFETY_PANEL_TEST]),
    ("10b-SP3 an unknownStanding row is given a hard-coded watch chip, inventing a band O12 forbids",
     SAFETY_PANEL_SRC,
     '<Chip severity={null} size="sm" />',
     '<Chip severity="watch" size="sm" />',
     [SAFETY_PANEL_TEST]),
    ("10b-SP4 the fan-service row drops its stale-age note, so an outage reads as a plain (stale) reading",
     SAFETY_PANEL_SRC,
     "          note={fanServiceAge}\n          noteTone={fanServiceAge === null ? 'muted' : 'watch'}",
     "          note={null}\n          noteTone={fanServiceAge === null ? 'muted' : 'watch'}",
     [SAFETY_PANEL_TEST]),

    # components/panels/session-event-log-panel.tsx
    ("10b-SE1 the entry list is reversed before rendering, so the log reads oldest-first",
     SESSION_EVENT_LOG_PANEL_SRC,
     "{state.events.entries.map((entry) => (",
     "{[...state.events.entries].reverse().map((entry) => (",
     [SESSION_EVENT_LOG_PANEL_TEST]),
    ("10b-SE2 the panel head is given a hard-coded watch chip instead of the explicit no-band state",
     SESSION_EVENT_LOG_PANEL_SRC,
     'subtitle="state transitions since page load">',
     'subtitle="state transitions since page load" chip="watch">',
     [SESSION_EVENT_LOG_PANEL_TEST]),

    # ========================================= 10b's RECONCILIATION, 2026-09-08
    # Twenty mutations backing the fixes for adversarial F1a-F1c, F2-F10 and F12-F14. Every one
    # of the six invariant-1 entries below is a mutation the ADVERSARIAL ran by hand and watched
    # pass with the whole suite green; they are permanent regressions now rather than a finding.

    # ---- F1a/F1b/F1c: invariant 1, on the fields that had no null-side fixture at all.
    ("10b-CO6 the fan5 headline defaults a MISSING tach to 0 RPM - invariant 1's own example sentence, in the panel PLAN.md names it in",
     COOLING_PANEL_SRC,
     "  const fan5Parts = formatRpmParts(cooling?.fan5Rpm ?? null);",
     "  const fan5Parts = formatRpmParts(cooling?.fan5Rpm ?? rpm(0));",
     [COOLING_PANEL_TEST]),
    ("10b-CO7 fan 2 defaults a missing tach to 0 RPM, rendering a FABRICATED red alarm on a fan nobody could read",
     COOLING_PANEL_SRC,
     "{ id: 'fan 2', value: cooling?.fan2Rpm ?? null, severity: fan2Severity, note: null },",
     "{ id: 'fan 2', value: cooling?.fan2Rpm ?? rpm(0), severity: severityFanStopped(cooling?.fan2Rpm ?? rpm(0)), note: null },",
     [COOLING_PANEL_TEST]),
    ("10b-GP3 a missing power reading defaults to 0.0 W - the second field on the card, untested on the null side before this",
     GPU_PANEL_SRC,
     [("import { celsius } from '@/lib/types';",
       "import { celsius, watts } from '@/lib/types';"),
      ("  const powerParts = formatWattsParts(gpu?.powerW ?? null);",
       "  const powerParts = formatWattsParts(gpu?.powerW ?? watts(0));")],
     [GPU_PANEL_TEST]),
    ("10b-CP4 a missing CPU utilisation defaults to 0.0 %, so an unread /proc/stat reads as an idle box",
     CPU_PANEL_SRC,
     "        formattedValue={formatPercent(host?.cpuPct ?? null)}",
     "        formattedValue={formatPercent(host?.cpuPct ?? percent(0))}",
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
     [("import type { Storage, TelemetrySnapshot } from '@/lib/types';",
       "import { bytesPerSecond } from '@/lib/types';\nimport type { Storage, TelemetrySnapshot } from '@/lib/types';"),
      ("{ k: 'eno1 ↓ rx', v: formatBytesPerSecond(storage?.net.rxBytesPerSec ?? null) },",
       "{ k: 'eno1 ↓ rx', v: formatBytesPerSecond(storage?.net.rxBytesPerSec ?? bytesPerSecond(0)) },")],
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
     # ⚠ 10f/Q1 re-aimed: the detail span gained the bounded well's role/tabIndex/aria-label
     # and now spans five lines. Same property — the slot is removed entirely.
     "      {!shown(detail) ? null : (\n"
     "        <span className={styles.note} role=\"group\" tabIndex={0} aria-label={`${panel} ${label} explanation`}>\n"
     "          {detail}\n"
     "        </span>\n"
     "      )}\n",
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
    # ⚠ 10e RETIRED `10b-CP5` ("the CPU panel stops rendering coretemp's explanation"), and 10e's
    # TEST phase agrees — but the reason was not written down at the time, so it is written here.
    # CP5 anchored on a PER-ROW `note={messageFor('coretemp')}` that 10e deleted: the CPU hero,
    # meter and strip have no note slot any more, so all four CPU sources render through ONE
    # `<PanelNotes messages={cpuErrors} />` call (10e §2.3, S-H). Two mutations on one source
    # line would be redundant, and `10b-CP6` was re-aimed onto that line and renamed to say so.
    # ⚠ What CP5 no longer covers, recorded rather than claimed closed: WHICH sources feed
    # `cpuErrors` is now `errorsForPanel`'s business, guarded by step 8's
    # `lib/client/observations.test.ts`, not by this harness. A panel-side edit narrowing the
    # source set (rather than emptying it) is caught there and nowhere here.
    ("10b-MP5 the MEMORY panel drops proc-meminfo's explanation, so a blanked RAM pair is unexplained anywhere on the page",
     MEMORY_PANEL_SRC,
     # ⚠ 10f/Q1 re-aimed: the call gained `bound="roomy"`.
     "<PanelNotes subject=\"memory\" bound=\"roomy\" messages={snapshot === null ? [] : errorsForPanel(snapshot, 'memory')} />",
     "<PanelNotes subject=\"memory\" bound=\"roomy\" messages={[]} />",
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

    ("10b-CP6 the CPU panel drops its error explanations entirely, so every blanked reading is unexplained",
     CPU_PANEL_SRC,
     "  <PanelNotes subject=\"cpu\" messages={cpuErrors} />",
     "  <PanelNotes subject=\"cpu\" messages={[]} />",
     [CPU_PANEL_TEST]),
    ("10b-SN6 the STORAGE panel drops proc-net-dev's explanation, so both blanked counters are unexplained",
     STORAGE_NETWORK_PANEL_SRC,
     "  const notes = netError === null ? diskErrors : [...diskErrors, netError];",
     "  const notes = diskErrors;",
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
     "  const chip = panelChip(ramSeverity, swapSeverity);",
     "  const chip = ramSeverity ?? swapSeverity;",
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
     # ⚠ 10f/Q1 re-aimed: the takeover branch had a bespoke `.emptyNote` list — a second,
     # UNBOUNDED copy of `PanelNotes` — and is now the primitive itself. Same property: the
     # entries that explain WHY nothing was enumerated are dropped from the takeover body.
     '          <PanelNotes subject="serving" bound="roomy" messages={servingErrors} />',
     '          <PanelNotes subject="serving" bound="roomy" messages={[]} />',
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
    ("10c-CVT2 the button always offers \"table\", even while already showing the table",
     CHART_VIEW_TOGGLE_SRC,
     "      {isTable ? 'chart' : 'table'}",
     "      {'table'}",
     [CHART_VIEW_TOGGLE_TEST]),
    ("10c-CVT3 the button always offers \"chart\", even while still showing the chart",
     CHART_VIEW_TOGGLE_SRC,
     "      {isTable ? 'chart' : 'table'}",
     "      {'chart'}",
     [CHART_VIEW_TOGGLE_TEST]),

    # components/panels/gpu-panel.tsx — the toggle's plumbing into the two chart elements.
    ("10c-GP1 the default view is \"table\", so a GPU card renders as a table before anyone toggles anything",
     GPU_PANEL_SRC,
     "export function GpuPanel({ state, panelId, view = 'chart', onToggleView }: GpuPanelProps) {",
     "export function GpuPanel({ state, panelId, view = 'table', onToggleView }: GpuPanelProps) {",
     [GPU_PANEL_TEST]),
    ("10c-GP2 the toggle control never renders, even when the caller supplies onToggleView",
     GPU_PANEL_SRC,
     "  const toggle =\n    onToggleView === undefined ? undefined : (",
     "  const toggle =\n    true ? undefined : (",
     [GPU_PANEL_TEST]),
    ("10c-GP3 the sparkline is pinned to chart view, so only the ≥1600px promotion ever switches to a table",
     GPU_PANEL_SRC,
     "                  height={CHART_SIZE.gpuSparkline.height}\n                  view={view}",
     "                  height={CHART_SIZE.gpuSparkline.height}\n                  view=\"chart\"",
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
     "  const toggle =\n    onToggleView === undefined ? undefined : (",
     "  const toggle =\n    true ? undefined : (",
     [CPU_PANEL_TEST]),
    ("10c-CP3 the temperature sparkline is pinned to chart view, so toggling the panel only switches utilisation",
     CPU_PANEL_SRC,
     "          color={SERIES_COLORS.gpu0}\n          width={CHART_SIZE.cpuSparkline.width}\n          height={CHART_SIZE.cpuSparkline.height}\n          view={view}",
     "          color={SERIES_COLORS.gpu0}\n          width={CHART_SIZE.cpuSparkline.width}\n          height={CHART_SIZE.cpuSparkline.height}\n          view=\"chart\"",
     [CPU_PANEL_TEST]),

    # components/panels/cooling-panel.tsx
    ("10c-CO1 the default view is \"table\", so COOLING's shared-time chart renders as a table before anyone toggles anything",
     COOLING_PANEL_SRC,
     "export function CoolingPanel({ state, nowMs, panelId, view = 'chart', onToggleView }: CoolingPanelProps) {",
     "export function CoolingPanel({ state, nowMs, panelId, view = 'table', onToggleView }: CoolingPanelProps) {",
     [COOLING_PANEL_TEST]),
    ("10c-CO2 the toggle control never renders, even when the caller supplies onToggleView",
     COOLING_PANEL_SRC,
     "  const toggle =\n    onToggleView === undefined ? undefined : (",
     "  const toggle =\n    true ? undefined : (",
     [COOLING_PANEL_TEST]),
    ("10c-CO3 the shared-time chart is pinned to chart view, so the toggle changes only its own control's label",
     COOLING_PANEL_SRC,
     "          width={CHART_SIZE.cooling.width}\n          plotHeight={CHART_SIZE.cooling.plotHeight}\n          view={view}",
     "          width={CHART_SIZE.cooling.width}\n          plotHeight={CHART_SIZE.cooling.plotHeight}\n          view=\"chart\"",
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
    # ⚠ 10e re-aimed: `95 °C` split into two checks (`>95<` / `°C`) once `Hero` stopped
    # concatenating value+unit into one string (O14). Same property — the FIRST assertion is
    # the one this mutation un-scopes back to the whole document.
    ("10c-G2 cpu-panel's temperature-severity check is un-scoped back to the whole document",
     CPU_PANEL_TEST,
     "    const row = rowContaining(html, 'temperature');\n"
     "    expect(row).toContain('data-severity=\"alarm\"');\n"
     "    expect(row).toContain('>95<');",
     "    const row = rowContaining(html, 'temperature');\n"
     "    expect(html).toContain('data-severity=\"alarm\"');\n"
     "    expect(row).toContain('>95<');",
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
    # ⚠ 10e re-aimed: the chan table's four rows (fan2/1/3/4) now share ONE generic value
    # renderer (`ChanTable`) instead of four separate `formatRpm(cooling?.fanNRpm ?? null)`
    # call sites — same property (a hard-coded ` RPM` suffix bypassing the formatter), caught
    # regardless of which channel it would have hit.
    ("10c-G4 the chan table hand-builds its RPM string instead of calling formatRpm",
     COOLING_PANEL_SRC,
     "<span className={chanValueClass(row.value)}>{formatRpm(row.value)}</span>",
     "<span className={chanValueClass(row.value)}>{`${row.value ?? 0} RPM`}</span>",
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

    # ----------------------------------------------------------------------------------
    # 10c-3 reconciliation / A6 — THE PANELS' `gaps` WIRING.
    #
    # `Sparkline` gained a `gaps` prop in 10c-3 and step 9's harness covers the PRIMITIVE.
    # Nothing covered the three production call sites: deleting `gaps={state.gaps}` from both
    # CPU mounts left `pnpm verify` green at 2801/2801 and BOTH harnesses silent, restoring
    # F14b's defect (a smooth line across unsampled ground) in the 1280-1599px band §6.1 calls
    # the design target. `gaps` is optional on this primitive by design, so the type checker
    # cannot catch it either — these three mutations are what does.
    # ----------------------------------------------------------------------------------
    # ⚠ 10e re-aimed P1/P2, and WIDENED them: OQ-7 gave CPU two SIZES of each trace (the
    # ≥1600px promotion is now the same `Sparkline` primitive, not a second chart), so there
    # are 4 mount points, not 2. Each pair below drops `gaps` from BOTH sizes of one trace —
    # disambiguated by the `width=` line immediately above, since `formatValue`/`formatTime`/
    # `gaps` alone repeat identically at both sizes.
    ("10c-P1 the CPU temperature sparkline stops receiving state.gaps, so an unsampled span draws as one smooth line",
     CPU_PANEL_SRC,
     [("          width={CHART_SIZE.cpuSparkline.width}\n          height={CHART_SIZE.cpuSparkline.height}\n          view={view}\n          formatValue={(v) => formatCelsius(celsius(v))}\n          formatTime={formatTimeOfDayMs}\n          gaps={state.gaps}\n        />",
       "          width={CHART_SIZE.cpuSparkline.width}\n          height={CHART_SIZE.cpuSparkline.height}\n          view={view}\n          formatValue={(v) => formatCelsius(celsius(v))}\n          formatTime={formatTimeOfDayMs}\n        />"),
      ("          width={CHART_SIZE.cpuPromoted.width}\n          height={CHART_SIZE.cpuPromoted.height}\n          view={view}\n          formatValue={(v) => formatCelsius(celsius(v))}\n          formatTime={formatTimeOfDayMs}\n          gaps={state.gaps}\n          timeLabels",
       "          width={CHART_SIZE.cpuPromoted.width}\n          height={CHART_SIZE.cpuPromoted.height}\n          view={view}\n          formatValue={(v) => formatCelsius(celsius(v))}\n          formatTime={formatTimeOfDayMs}\n          timeLabels")],
     [CPU_PANEL_TEST]),
    ("10c-P2 the CPU utilisation sparkline stops receiving state.gaps — the sibling call site, which a fixture covering only the first would miss",
     CPU_PANEL_SRC,
     [("          width={CHART_SIZE.cpuSparkline.width}\n          height={CHART_SIZE.cpuSparkline.height}\n          view={view}\n          formatValue={(v) => formatPercent(percent(v))}\n          formatTime={formatTimeOfDayMs}\n          gaps={state.gaps}\n        />",
       "          width={CHART_SIZE.cpuSparkline.width}\n          height={CHART_SIZE.cpuSparkline.height}\n          view={view}\n          formatValue={(v) => formatPercent(percent(v))}\n          formatTime={formatTimeOfDayMs}\n        />"),
      ("          width={CHART_SIZE.cpuPromoted.width}\n          height={CHART_SIZE.cpuPromoted.height}\n          view={view}\n          formatValue={(v) => formatPercent(percent(v))}\n          formatTime={formatTimeOfDayMs}\n          gaps={state.gaps}\n          timeLabels",
       "          width={CHART_SIZE.cpuPromoted.width}\n          height={CHART_SIZE.cpuPromoted.height}\n          view={view}\n          formatValue={(v) => formatPercent(percent(v))}\n          formatTime={formatTimeOfDayMs}\n          timeLabels")],
     [CPU_PANEL_TEST]),
    # ⚠ 10e re-aimed and WIDENED: the ≥1600px promotion is now the SAME `Sparkline` primitive
    # (§3.2), not `StackedTimeSeriesChart`, so there are two mount points sharing the identical
    # `formatValue`/`formatTime`/`gaps`/`domain` tail — disambiguated by the `width=` line.
    ("10c-P3 the GPU card's sparkline stops receiving state.gaps while its promoted chart still hatches, so the two breakpoints disagree",
     GPU_PANEL_SRC,
     [("                  width={CHART_SIZE.gpuSparkline.width}\n                  height={CHART_SIZE.gpuSparkline.height}\n                  view={view}\n                  formatValue={(v) => formatCelsius(celsius(v))}\n                  formatTime={formatTimeOfDayMs}\n                  gaps={state.gaps}\n                  domain={TEMP_DOMAIN}\n                />",
       "                  width={CHART_SIZE.gpuSparkline.width}\n                  height={CHART_SIZE.gpuSparkline.height}\n                  view={view}\n                  formatValue={(v) => formatCelsius(celsius(v))}\n                  formatTime={formatTimeOfDayMs}\n                  domain={TEMP_DOMAIN}\n                />"),
      ("                  width={CHART_SIZE.gpuPromoted.width}\n                  height={CHART_SIZE.gpuPromoted.height}\n                  view={view}\n                  formatValue={(v) => formatCelsius(celsius(v))}\n                  formatTime={formatTimeOfDayMs}\n                  gaps={state.gaps}\n                  domain={TEMP_DOMAIN}",
       "                  width={CHART_SIZE.gpuPromoted.width}\n                  height={CHART_SIZE.gpuPromoted.height}\n                  view={view}\n                  formatValue={(v) => formatCelsius(celsius(v))}\n                  formatTime={formatTimeOfDayMs}\n                  domain={TEMP_DOMAIN}")],
     [GPU_PANEL_TEST]),

    # ============================================== components/panels/status-row.tsx (10e §2.7)
    ("10e-SR1 secondaryLabel is silently dropped, so SERVING's port never renders",
     STATUS_ROW_SRC,
     "{secondaryLabel === undefined ? null : (",
     "{true ? null : (",
     [STATUS_ROW_TEST]),
    # ⚠ 10e-test renamed this, 2026-09-09. It shipped as "inline is suppressed the same way
    # note/detail are (null/empty), inventing a policy it must not have" — which describes the
    # SHIPPED code, not a wrong implementation: `status-row.tsx:133` already uses the same
    # `shown()` helper `note` and `detail` use, deliberately. The BODY drops `inline`
    # altogether, which is a different (and real) defect. HANDOVER §0.4: read what a mutation
    # REPLACES before crediting it with a property. The ⚠ test it reddens carried the same
    # wrong words and was renamed with it.
    ("10e-SR2 inline is silently dropped, so SERVING's model · ctx never renders",
     STATUS_ROW_SRC,
     "{!shown(inline) ? null : <span className={styles.inline}>{inline}</span>}",
     "{null}",
     [STATUS_ROW_TEST]),
    # ⚠ 10e-test added SR4/SR5, 2026-09-09. `Row` got both directions of the pill branch
    # (`10e-R1`/`10e-R2` in step 9's harness) and `StatusRow` — the component that renders
    # EVERY pill on the shipped page, since no panel calls `Row` any more — got neither.
    # `10b-SR2` governs only the LEFT-edge `Chip sm` guard at `status-row.tsx:124`; the `md`
    # pill has its own independent ternary at `:136`.
    ("10e-SR4 a StatusRow value never becomes a pill — severity given still renders plain text",
     STATUS_ROW_SRC,
     "        {severity === undefined ? (\n          <span className={styles.value}>{value}</span>\n        ) : (",
     "        {true ? (\n          <span className={styles.value}>{value}</span>\n        ) : (",
     [STATUS_ROW_TEST]),
    ("10e-SR5 a StatusRow value ALWAYS becomes a pill, even with no severity of its own to badge it with",
     STATUS_ROW_SRC,
     "        {severity === undefined ? (\n          <span className={styles.value}>{value}</span>\n        ) : (",
     "        {false ? (\n          <span className={styles.value}>{value}</span>\n        ) : (",
     [STATUS_ROW_TEST]),
    ("10e-SR3 endPrefix is silently dropped, so SERVING's health text never renders ahead of the pill",
     STATUS_ROW_SRC,
     "{endPrefix === undefined ? null : <span className={styles.endPrefix}>{endPrefix}</span>}",
     "{null}",
     [STATUS_ROW_TEST]),

    ("10e-CO1 the dell-smm errors[] cause is dropped from PanelNotes, so a stale fan5 loses its explanation",
     COOLING_PANEL_SRC,
     # ⚠ 10f/Q1 re-aimed: the call gained `bound="roomy"` and wrapped onto its own lines.
     "        messages={dellSmmError === null ? [] : [{ source: 'dell-smm', message: dellSmmError }]}",
     "        messages={[]}",
     [COOLING_PANEL_TEST]),

    ("10e-SP1 a boolean check renders the raw JS boolean instead of yes/no",
     SAFETY_PANEL_SRC,
     "const yesNo = (value: boolean | null): string => (value === null ? formatText(null) : value ? 'yes' : 'no');",
     "const yesNo = (value: boolean | null): string => (value === null ? formatText(null) : String(value));",
     [SAFETY_PANEL_TEST]),

    ("10e-CVT1 the aria-label is shortened along with the visible label, losing the caller's own sentence",
     CHART_VIEW_TOGGLE_SRC,
     "aria-label={`${label}: show as ${isTable ? 'chart' : 'table'}`}",
     "aria-label={isTable ? 'chart' : 'table'}",
     [CHART_VIEW_TOGGLE_TEST]),

    ("10e-SV1 an unread ctx substitutes a plausible-looking default instead of the em dash",
     SERVING_PANEL_SRC,
     "inline={`${formatText(instance.model)} · ctx ${formatTokens(instance.ctx)}`}",
     "inline={`${formatText(instance.model)} · ctx ${formatTokens(instance.ctx) === '—' ? '131,072' : formatTokens(instance.ctx)}`}",
     [SERVING_PANEL_TEST]),

    ("10e-HD1 the refresh button loses its accessible name, leaving a glyph nothing announces",
     HEADER_SRC,
     '<button type="button" aria-label="Refresh now" title="Refresh now" onClick={onRefreshNow}>',
     '<button type="button" title="Refresh now" onClick={onRefreshNow}>',
     [HEADER_TEST]),
    # ⚠ ADDED BY 10e's TEST PHASE, 2026-09-09. `10a-H5` was re-aimed onto the VISIBLE GLYPH
    # (`{paused ? '▶' : '❙❙'}`), which is now only half the control's announcement: 10e §4 moved
    # the word onto a SEPARATE `aria-label` ternary. A wrong implementation pinning that label
    # ships a paused dashboard whose only announcement to a screen reader still says "Pause
    # polling" — §6.2's *"a paused dashboard must announce it loudly"*, defeated for exactly the
    # reader who cannot see the glyph. Nothing anywhere mutated it.
    ("10e-HD2 the pause control's accessible name is stuck on \"Pause polling\", so a paused dashboard never announces resume",
     HEADER_SRC,
     "          aria-label={paused ? 'Resume polling' : 'Pause polling'}",
     "          aria-label=\"Pause polling\"",
     [HEADER_TEST]),
    # ⚠ ADDED BY 10e's TEST PHASE. The `refresh` -> `cadence` rename (10e §4) is what made
    # `10a-H13` retirable: `10a-H13`'s original comment records that the cadence control's own
    # visible `<span>refresh</span>` was what made `toContain('refresh')` inert in the first
    # place (HANDOVER §0.4's second founding instance). Nothing asserted the rename, so a later
    # loop could restore the word and silently re-arm that ambiguity.
    ("10e-HD3 the cadence control's visible label reverts to \"refresh\", re-arming the ambiguity 10a-H13 was retired on",
     HEADER_SRC,
     "<span className={styles.controlLabel}>cadence</span>",
     "<span className={styles.controlLabel}>refresh</span>",
     [HEADER_TEST]),

    # ⚠ ADDED BY 10e's TEST PHASE, 2026-09-09 — the promoted GPU chart's three optional props.
    # HANDOVER §0.8: *wiring a prop is a property, and an optional prop makes it an untested
    # one.* 10e wired `domain`/`refs`/`timeLabels` at three call sites in `gpu-panel.tsx` and
    # asserted none of them outside `sparkline.test.tsx` (the PRIMITIVE). Deleting
    # `refs={TEMP_REFS}` and `timeLabels` left `pnpm verify` green and BOTH harnesses green —
    # `10c-P3`'s anchor ends at `domain={TEMP_DOMAIN}` and still matched — while dropping what
    # SPEC §6.1's OQ-6 ruling requires to be drawn, and the only consumer of the two exported
    # constants `10e-S1`..`S4` defend across two harnesses. Backed now, both directions.
    ("10e-GP1 the promoted GPU chart loses §6.3's 70/80 reference lines, which OQ-6 rules must be drawn",
     GPU_PANEL_SRC,
     "                  refs={TEMP_REFS}\n",
     "",
     [GPU_PANEL_TEST]),
    ("10e-GP2 the reference lines are drawn on the 1280 form too, which OQ-6 declines",
     GPU_PANEL_SRC,
     "                  domain={TEMP_DOMAIN}\n                />",
     "                  domain={TEMP_DOMAIN}\n                  refs={TEMP_REFS}\n                />",
     [GPU_PANEL_TEST]),
    ("10e-GP3 the promoted GPU chart loses its time axis, so the window it draws is unlabelled",
     GPU_PANEL_SRC,
     "                  timeLabels\n",
     "",
     [GPU_PANEL_TEST]),
    # Both sizes, one mutation each — dropping it from ONE size is the likelier edit and the
    # worse outcome (the same card reads on two different scales either side of 1600px), and
    # keeping the other reference means neither mutation turns `TEMP_DOMAIN` into dead code.
    ("10e-GP4 the 1280 GPU chart autoscales instead of §3.2's fixed 30-90 scale, so the two sizes disagree",
     GPU_PANEL_SRC,
     "                  domain={TEMP_DOMAIN}\n                />",
     "                />",
     [GPU_PANEL_TEST]),
    ("10e-GP5 the promoted GPU chart autoscales, so its reference lines float against a scale that is not §6.3's",
     GPU_PANEL_SRC,
     "                  domain={TEMP_DOMAIN}\n                  refs={TEMP_REFS}",
     "                  refs={TEMP_REFS}",
     [GPU_PANEL_TEST]),

    # ========================================= 10e's RECONCILIATION, 2026-09-09
    # Twenty mutations backing the fixes for adversarial 10e-A1/A3/A4/A5/A7/A8/A13/A14. Every
    # one of them is an edit the ADVERSARIAL (or this phase) applied by hand and watched pass
    # with the whole suite green — HANDOVER §0.8's rule at a further eleven call sites.

    # ---- 10e-A4: OQ-4 is a CALL-SITE decision and nothing asserted the caller.
    ("10e-SE3 the log's head gets its chip back as the explicit no-band pill - OQ-4's declined rendering, at the only call site that can choose it",
     SESSION_EVENT_LOG_PANEL_SRC,
     '<PanelShell title="session event log" subtitle="state transitions since page load">',
     '<PanelShell title="session event log" subtitle="state transitions since page load" chip={null}>',
     [SESSION_EVENT_LOG_PANEL_TEST]),

    # ---- 10e-A1/A6: the three declarations on `.scroll` that make the well a well.
    ("10e-SE4 the log well goes back to max-height, so the panel grows with the number of entries",
     "components/panels/session-event-log-panel.module.css",
     "  height: 84px;", "  max-height: 84px;",
     [SESSION_EVENT_LOG_PANEL_TEST]),
    ("10e-SE5 the log well loses box-sizing, so the mock's 84px total box paints 86",
     "components/panels/session-event-log-panel.module.css",
     "  box-sizing: border-box;\n  height: 84px;", "  height: 84px;",
     [SESSION_EVENT_LOG_PANEL_TEST]),

    # ---- 10e-A3: invariant 1's three chan inks, one branch per mutation (fixture symmetry).
    ("10e-CO2 a genuine 0 RPM takes the ordinary ink, so a dead fan prints like a healthy one",
     COOLING_PANEL_SRC,
     "  if (value === 0) return styles.valueZero as string;\n", "",
     [COOLING_PANEL_TEST]),
    ("10e-CO3 an unreadable channel takes the ordinary ink, so an em dash prints like a reading",
     COOLING_PANEL_SRC,
     "  if (value === null || !Number.isFinite(value)) return styles.valueUnknown as string;",
     "  if (value === null || !Number.isFinite(value)) return styles.value as string;",
     [COOLING_PANEL_TEST]),

    # ---- 10e-A5: the mode pill's size is a wiring, and an `sm` chip renders no label at all.
    ("10e-CO4 the mode becomes a bare `sm` glyph, so `HIGH pwm 255` disappears from the panel entirely",
     COOLING_PANEL_SRC,
     'severity={null} size="md" label={cooling === null ? formatText(null) : formatCh5Pwm(cooling)}',
     'severity={null} size="sm" label={cooling === null ? formatText(null) : formatCh5Pwm(cooling)}',
     [COOLING_PANEL_TEST]),

    # ---- 10e-A8: COOLING's headline loses the words `fan 5` from the body again.
    ("10e-CO8 the fan5 headline loses its visible subject, leaving a 34px numeral labelled by nothing",
     COOLING_PANEL_SRC,
     "        <span className={styles.heroKey}>fan 5</span>\n", "",
     [COOLING_PANEL_TEST]),

    # ---- 10e-A7: S-B's watch tone, on the third of the three surfaces that carry it.
    ("10e-CO9 the stale-age caption is alarm-toned, so `last read 6:12 ago` reads as a second alarm",
     "components/panels/cooling-panel.module.css",
     "  color: var(--status-watch);\n  font-family: var(--font-mono);",
     "  color: var(--status-alarm);\n  font-family: var(--font-mono);",
     [COOLING_PANEL_TEST]),
    ("10e-SP2 SAFETY's fan-service age is muted, dropping S-B's watch tone at the call site",
     SAFETY_PANEL_SRC,
     "          noteTone={fanServiceAge === null ? 'muted' : 'watch'}",
     "          noteTone={'muted'}",
     [SAFETY_PANEL_TEST]),
    ("10e-SN3 STORAGE's stale link age loses its watch tone - the one-off inline style a tidy-up removes silently",
     STORAGE_NETWORK_PANEL_SRC,
     "<span style={{ color: 'var(--status-watch)' }}>{linkAge}</span>",
     "<span>{linkAge}</span>",
     [STORAGE_NETWORK_PANEL_TEST]),

    # ---- 10e-A5: four `tickPercent` wirings, none of which any test could see.
    ("10e-GP7 the GPU VRAM bar loses §6.3's 90% watch tick",
     GPU_PANEL_SRC,
     "            severity={severityVram(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null)}\n            tickPercent={90}",
     "            severity={severityVram(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null)}",
     [GPU_PANEL_TEST]),
    ("10e-MP2 the RAM hero's accessible name is dropped - the one Hero caller no test noticed (10e-A8)",
     MEMORY_PANEL_SRC,
     ' severity={ramSeverity} ariaLabel="memory used" />',
     " severity={ramSeverity} />",
     [MEMORY_PANEL_TEST]),

    ("10e-MP1 the RAM bar loses §6.3's 85% watch tick",
     MEMORY_PANEL_SRC,
     "        severity={ramSeverity}\n        tickPercent={85}",
     "        severity={ramSeverity}",
     [MEMORY_PANEL_TEST]),
    ("10e-SN1 both disk bars lose the 85%-used watch tick together, which is how the wrong implementation would write it",
     STORAGE_NETWORK_PANEL_SRC,
     [("        severity={rootSeverity}\n        tickPercent={85}", "        severity={rootSeverity}"),
      ("        severity={homeSeverity}\n        tickPercent={85}", "        severity={homeSeverity}")],
     [STORAGE_NETWORK_PANEL_TEST]),

    # ---- 10e-A5: the `code` modifier, at the ONE call site chip.tsx's own doc names.
    ("10e-GP6 the throttle chips lose `code`, so the mask is uppercased into `0X4` - not a mask any more",
     GPU_PANEL_SRC,
     # ⚠ 10f/Q3 re-aimed: the chip gained `band={r.severity !== 'normal'}` and the call now
     # spans several lines. Same property — `code` at the only call site in the tree.
     '                  code\n                  band=',
     '                  band=',
     [GPU_PANEL_TEST]),

    # ---- 10e-A5: the power Figure's caption - the `cap` half of §6.2's "power against the cap".
    ("10e-GP8 the power Figure loses its `cap 250.0 W` caption, so the hero row states the draw with nothing to read it against",
     GPU_PANEL_SRC,
     " caption={`cap ${formatWatts(gpu?.powerCapW ?? null)}`}",
     "",
     [GPU_PANEL_TEST]),

    # ---- 10e-A8: a point reading named with the chart's window sentence.
    ("10e-GP9 the GPU hero is named with the CHART's window sentence, which is not what a single instantaneous numeral is",
     GPU_PANEL_SRC,
     "severity={tempSeverity} ariaLabel={heroAriaLabel}",
     "severity={tempSeverity} ariaLabel={ariaLabel}",
     [GPU_PANEL_TEST]),
    ("10e-CP3 the CPU hero is named with the CHART's window sentence",
     CPU_PANEL_SRC,
     "severity={chip} ariaLabel={heroAriaLabel}",
     "severity={chip} ariaLabel={tempAriaLabel}",
     [CPU_PANEL_TEST]),

    # ---- 10e-A5: CPU's promoted time axis - the GPU hole the test phase closed, left open here.
    ("10e-CP1 both promoted CPU charts lose their time axis, which is how a copy-paste would drop it",
     CPU_PANEL_SRC,
     [("          gaps={state.gaps}\n          timeLabels\n        />\n        <Sparkline\n          points={utilTrace}\n          ariaLabel={utilAriaLabel}\n          color={SERIES_COLORS.gpu1}\n          width={CHART_SIZE.cpuPromoted.width}",
       "          gaps={state.gaps}\n        />\n        <Sparkline\n          points={utilTrace}\n          ariaLabel={utilAriaLabel}\n          color={SERIES_COLORS.gpu1}\n          width={CHART_SIZE.cpuPromoted.width}"),
      ("          gaps={state.gaps}\n          timeLabels\n        />\n      </div>",
       "          gaps={state.gaps}\n        />\n      </div>")],
     [CPU_PANEL_TEST]),
    ("10e-CP4 the 1280 CPU pair gains the time axis too, spending height the design target does not have",
     CPU_PANEL_SRC,
     "          formatValue={(v) => formatCelsius(celsius(v))}\n          formatTime={formatTimeOfDayMs}\n          gaps={state.gaps}\n        />\n        <Sparkline\n          points={utilTrace}\n          ariaLabel={utilAriaLabel}\n          color={SERIES_COLORS.gpu1}\n          width={CHART_SIZE.cpuSparkline.width}",
     "          formatValue={(v) => formatCelsius(celsius(v))}\n          formatTime={formatTimeOfDayMs}\n          gaps={state.gaps}\n          timeLabels\n        />\n        <Sparkline\n          points={utilTrace}\n          ariaLabel={utilAriaLabel}\n          color={SERIES_COLORS.gpu1}\n          width={CHART_SIZE.cpuSparkline.width}",
     [CPU_PANEL_TEST]),

    # ---- 10e-A13: FIRST vs LAST, two lines under a comment that says LAST.
    ("10e-SN2 STORAGE reads the FIRST proc-net-dev entry, so the panel and the event log disagree",
     STORAGE_NETWORK_PANEL_SRC,
     "  const netError = storageErrors.findLast((e) => e.source === 'proc-net-dev') ?? null;",
     "  const netError = storageErrors.find((e) => e.source === 'proc-net-dev') ?? null;",
     [STORAGE_NETWORK_PANEL_TEST]),

    # ============================================== components/panels/caption.tsx (10e, new)
    ("10e-CAP1 the label always renders, even when omitted, so a caption with no lead word gets one anyway",
     CAPTION_SRC,
     "{label === undefined ? null : <b className={styles.label}>{label}</b>}",
     "<b className={styles.label}>{label}</b>",
     [CAPTION_TEST]),
    # =========================================================================
    # ⚠ 10f — the owner's four rulings of 2026-09-09 (SPEC §6.1 / §6.2).
    #   Q1: every `errors[]` block is a bounded scroll box, so a DEGRADED page fits.
    #   Q3: `0x4` beside a notable bit is a neutral, unbanded code chip.
    #   Q12: `Row` deleted — its two orphaned properties ported here (`10f-SR1`/`SR2`).
    # =========================================================================

    # ---- Q1: PanelNotes, the primitive. The well is what keeps §6.1's promise on a page where
    # every collector has failed; before it, that page missed the fold by 27 / 49 px (92 / 115
    # with §6.4's banner pinned).
    # ⚠ 10f RECONCILE re-aimed the ANCHOR (`aria-label` gained `${subject}`) and the
    # REPLACEMENT: dropping the name outright now leaves `subject` unread, which `tsc`'s
    # `noUnusedParameters` catches before a single test runs — a mutation that fails to compile
    # proves nothing about the tests. The wrong implementation it writes instead is the one this
    # project has already shipped once (10e-A8): an `aria-label` on a role-less `<div>`, which
    # ARIA prohibits on the `generic` role, plus no tab stop. Same property, same red tests.
    ("10f-PN2 the notes well is not keyboard-reachable and its name is an attribute ARIA ignores, so its scrolled-away messages cannot be read at all",
     PANEL_NOTES_SRC,
     # ⚠ RE-AIMED by 10g/Q4, not weakened: the well gained a wrapper (so the `… N more` marker
     # has a positioned box that is not the scroller), which indented these four lines by two.
     # The same three attributes are deleted from the same element.
     '        data-bound={bound}\n        role="group"\n        tabIndex={0}\n        aria-label={`${subject} messages`}\n',
     "        data-bound={bound}\n        aria-label={`${subject} messages`}\n",
     [PANEL_NOTES_TEST]),
    ("10f-PN3 bound defaults to roomy, so a call site that forgets the prop gets the TALLER box - the unsafe direction",
     PANEL_NOTES_SRC,
     "export function PanelNotes({ messages, subject, bound = 'tight' }: PanelNotesProps) {",
     "export function PanelNotes({ messages, subject, bound = 'roomy' }: PanelNotesProps) {",
     [PANEL_NOTES_TEST]),
    ("10f-PN4 the tight well is given the ROOMY height, so GPU/CPU/SERVING each cost the page 60px instead of 18",
     "components/panels/panel-notes.module.css",
     "  max-height: 18px;",
     "  max-height: 60px;",
     [PANEL_NOTES_TEST]),

    # ---- Q1: the per-panel `bound` wiring. A wired prop asserted by nothing is an untested one
    # (HANDOVER §0.8), and `roomy` is exactly the value a panel with no column slack must NOT get.
    ("10f-MP1 MEMORY loses its roomy bound, so its notes block silently drops to one line",
     MEMORY_PANEL_SRC,
     '<PanelNotes subject="memory" bound="roomy" messages={snapshot === null ? [] : errorsForPanel(snapshot, \'memory\')} />',
     "<PanelNotes subject=\"memory\" messages={snapshot === null ? [] : errorsForPanel(snapshot, 'memory')} />",
     [MEMORY_PANEL_TEST]),
    ("10f-SN1 STORAGE loses its roomy bound, so its notes block silently drops to one line",
     STORAGE_NETWORK_PANEL_SRC,
     '<PanelNotes subject="storage & network" bound="roomy" messages={notes} />',
     '<PanelNotes subject="storage & network" messages={notes} />',
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10f-SN2 the LINK explanation is given the ROOMY bound, taking STORAGE past SAFETY so it sets row 3 and grows the page",
     STORAGE_NETWORK_PANEL_SRC,
     '<PanelNotes subject="link" messages={linkError === null ? [] : [linkError]} />',
     '<PanelNotes subject="link" bound="roomy" messages={linkError === null ? [] : [linkError]} />',
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10f-SN3 net-operstate's explanation is dropped, so a blanked link state is unexplained anywhere on the page",
     STORAGE_NETWORK_PANEL_SRC,
     "messages={linkError === null ? [] : [linkError]}",
     "messages={[]}",
     [STORAGE_NETWORK_PANEL_TEST]),
    ("10f-CO1 COOLING loses its roomy bound, so its notes block silently drops to one line",
     COOLING_PANEL_SRC,
     '        bound="roomy"\n',
     "",
     [COOLING_PANEL_TEST]),
    ("10f-GP1 the GPU takeover explanation loses its roomy bound",
     GPU_PANEL_SRC,
     '<PanelNotes subject={`GPU ${index}`} bound="roomy" messages={errorsForPanel(snapshot, \'gpu\')} />',
     '<PanelNotes subject={`GPU ${index}`} messages={errorsForPanel(snapshot, \'gpu\')} />',
     [GPU_PANEL_TEST]),
    ("10f-SV1 the SERVING takeover explanation loses its roomy bound",
     SERVING_PANEL_SRC,
     '<PanelNotes subject="serving" bound="roomy" messages={servingErrors} />',
     '<PanelNotes subject="serving" messages={servingErrors} />',
     [SERVING_PANEL_TEST]),

    # ---- Q1: StatusRow's `detail` well.
    ("10f-SR3 a row's errors[] well is not keyboard-reachable and not named, so a wrapped message cannot be scrolled to",
     STATUS_ROW_SRC,
     '        <span className={styles.note} role="group" tabIndex={0} aria-label={`${panel} ${label} explanation`}>\n          {detail}',
     "        <span className={styles.note}>\n          {detail}",
     [STATUS_ROW_TEST]),
    ("10f-SR4 S-B's stale age is boxed like an errors[] explanation, spending a scroll well on a reading bounded by construction",
     STATUS_ROW_SRC,
     "          <span className={styles.noteWatch}>{note}</span>",
     '          <span className={styles.note} role="group" tabIndex={0} aria-label={`${panel} ${label} note`}>{note}</span>',
     [STATUS_ROW_TEST]),
    ("10f-SR5 a row's errors[] well is given two lines, which is 55.6px more than §6.1 has at 1600x1024",
     "components/panels/status-row.module.css",
     "  max-height: 14px;",
     "  max-height: 28px;",
     [STATUS_ROW_TEST]),

    # ---- Q12: the two properties `row.test.tsx` carried that `StatusRow` did not (see step 9's
    # harness, where `09-R1`/`09-R3` were retired with this note beside them).
    ("10f-SR1 the value is reformatted - an em dash is 'helpfully' blanked instead of passed through",
     STATUS_ROW_SRC,
     "          <span className={styles.value}>{value}</span>",
     "          <span className={styles.value}>{value === '—' ? '' : value}</span>",
     [STATUS_ROW_TEST]),
    ("10f-SR2 StatusRow invents §6.5's \"already explained\" exception for itself, off its own value",
     STATUS_ROW_SRC,
     "      {!shown(detail) ? null : (",
     "      {!shown(detail) || value === '—' ? null : (",
     [STATUS_ROW_TEST]),

    # ---- Q3: the neutral `0x4` chip, both directions (fixture symmetry, HANDOVER §5.1).
    ("10f-GP2 every throttle reason keeps its band, so the routine 0x4 paints a green ✓ NORMAL verdict again",
     GPU_PANEL_SRC,
     "                  band={r.severity !== 'normal'}",
     "                  band",
     [GPU_PANEL_TEST]),
    ("10f-GP3 no throttle reason keeps its band, so a notable sw thermal slowdown loses its alarm colour",
     GPU_PANEL_SRC,
     "                  band={r.severity !== 'normal'}",
     "                  band={false}",
     [GPU_PANEL_TEST]),
    ("10f-GP4 the throttle line renders for any decodable mask, so the routine 0x4 gets a line of its own",
     GPU_PANEL_SRC,
     "{decode !== null && decode.notable ? (",
     "{decode !== null ? (",
     [GPU_PANEL_TEST]),

    # ---- Q1, the OTHER side of `bound`, added by 10f's TEST phase. Five call sites had a
    # `roomy` mutation and a test; the THREE that must take the TIGHT default had neither, and
    # they are the three that pay 1:1 (§1.4): CPU governs row 2, a GPU card IS row 1, and
    # SERVING's unattributed block has 26 px of slack under the session log against `roomy`'s
    # 42. `10f-PN3` proves the DEFAULT is tight; nothing proved these call sites take it.
    # HANDOVER §0.8 — "wiring a prop is a property, and an optional prop makes it an untested
    # one" — and ANCHOR §5's "every boundary guard needs a fixture on both sides".
    ("10f-CP1 the CPU notes block is given the ROOMY bound, +42px on the panel that governs row 2",
     CPU_PANEL_SRC,
     '<PanelNotes subject="cpu" messages={cpuErrors} />',
     '<PanelNotes subject="cpu" bound="roomy" messages={cpuErrors} />',
     [CPU_PANEL_TEST]),
    ("10f-GP5 the ENUMERATED GPU card's notes block is given the ROOMY bound, +42px on row 1 twice over",
     GPU_PANEL_SRC,
     '<PanelNotes subject={`GPU ${index}`} messages={snapshot === null ? [] : errorsForPanel(snapshot, \'gpu\')} />',
     '<PanelNotes subject={`GPU ${index}`} bound="roomy" messages={snapshot === null ? [] : errorsForPanel(snapshot, \'gpu\')} />',
     [GPU_PANEL_TEST]),
    ("10f-SV2 SERVING's unattributed block is given the ROOMY bound, past the 26px row 4 has for it",
     SERVING_PANEL_SRC,
     '<PanelNotes subject="serving" messages={unattributed} />',
     '<PanelNotes subject="serving" bound="roomy" messages={unattributed} />',
     [SERVING_PANEL_TEST]),

    # ---- 10f RECONCILE, 2026-09-09. The adversarial phase's A6 (accessible names) and A4 (six
    # one-line reverts of the 10f diff that left `pnpm verify` and all nine harnesses green).
    # Each mutation below is one of those reverts, or the naming defect A6 measured.
    #
    # ⚠ A6: seven wells announced the constant `collector messages` and `fan service
    # explanation` named two different units in two different panels, measured in the DOM at
    # 1280x1024 on the all-collectors-failed page. The page-wide property lives in
    # `dashboard-shell.test.tsx` because no primitive can see nine call sites at once.
    # ⚠ TWO edits, because one would not COMPILE: dropping `${subject}` from the name leaves the
    # parameter unread and `noUnusedParameters` fails the run before a test executes. What a
    # revert actually looks like is both halves — the parameter gone and the constant back.
    ("10f-PN5 the notes well is named by a constant again, so seven wells on the degraded page announce the same three words",
     PANEL_NOTES_SRC,
     [("export function PanelNotes({ messages, subject, bound = 'tight' }: PanelNotesProps) {",
       "export function PanelNotes({ messages, bound = 'tight' }: PanelNotesProps) {"),
      ("      aria-label={`${subject} messages`}",
       '      aria-label="collector messages"')],
     [PANEL_NOTES_TEST, DASHBOARD_SHELL_TEST]),
    ("10f-SR8 a row's well drops the panel from its name, so COOLING's and SAFETY's `fan service` rows announce identically",
     STATUS_ROW_SRC,
     "aria-label={`${panel} ${label} explanation`}",
     "aria-label={`${label} explanation`}",
     [STATUS_ROW_TEST, DASHBOARD_SHELL_TEST]),
    ("10f-SN4 STORAGE's link well takes the panel's own subject, so one panel carries two identically-named wells",
     STORAGE_NETWORK_PANEL_SRC,
     '<PanelNotes subject="link" messages={linkError === null ? [] : [linkError]} />',
     '<PanelNotes subject="storage & network" messages={linkError === null ? [] : [linkError]} />',
     [DASHBOARD_SHELL_TEST]),

    # ⚠ A4/R1: the MUTED note branch is a well too, and it had neither a test nor a mutation —
    # `10f-SR3` and every new test covered `detail` only. No caller renders it today (every call
    # site passes `note` as S-B's age, watch-toned), which is exactly why nothing noticed.
    ("10f-SR6 a muted note becomes a bounded box nobody can reach — no role, no tab stop, no name",
     STATUS_ROW_SRC,
     '<span className={styles.note} role="group" tabIndex={0} aria-label={`${panel} ${label} note`}>',
     "<span className={styles.note}>",
     [STATUS_ROW_TEST]),
    # ⚠ A4/R2, R5: the declaration that keeps a 600-character unbroken path inside the well.
    # Measured overhang past the panel with it: 0.0 px at all three viewports.
    ("10f-PN7 a panel note stops breaking an unbreakable string, so one long path escapes the well horizontally",
     "components/panels/panel-notes.module.css",
     "  font-size: 0.85em;\n  overflow-wrap: anywhere;",
     "  font-size: 0.85em;",
     [PANEL_NOTES_TEST]),
    ("10f-SR7 a row's explanation stops breaking an unbreakable string, so one long path escapes the well horizontally",
     "components/panels/status-row.module.css",
     "  overflow-wrap: anywhere;\n  display: block;\n  box-sizing: border-box;",
     "  display: block;\n  box-sizing: border-box;",
     [STATUS_ROW_TEST]),
    # ⚠ A4/R6, R7: the ground is the only cue that text is hidden inside the box, and the
    # padding is what `box-sizing: border-box` is ABOUT (18 = 4 + 14).
    ("10f-PN8 the well loses its sunken ground, so a scrollable box reads as body text that simply stops",
     "components/panels/panel-notes.module.css",
     "  border-radius: 2px;\n  background: var(--surface-sunken);",
     "  border-radius: 2px;",
     [PANEL_NOTES_TEST]),
    ("10f-PN9 the well loses its padding, so border-box has no subject and the text sits against the panel edge",
     "components/panels/panel-notes.module.css",
     "  padding: 2px 5px;",
     "  padding: 0;",
     [PANEL_NOTES_TEST]),
    # ⚠ A4/R4: `collectStorage` files one `statvfs` entry per mount, so a key of `source` alone
    # collides in the ORDINARY case. React's recovery is to reuse the first element, which the
    # rendered markup cannot show — the test reads the keys.
    ("10f-PN6 the notes key is the source alone, so two entries from one source collide (statvfs files one per mount)",
     PANEL_NOTES_SRC,
     "key={`${e.source}:${e.message}`}",
     "key={e.source}",
     [PANEL_NOTES_TEST]),
    # ---- 10g/Q2, Q3, Q4, Q5 — the last four unbounded terms (SPEC §6.1/§6.4, ruled
    # 2026-09-09). Each of these is a one-line revert of the 10g diff that leaves `pnpm verify`
    # green without its guard, which is the shape 10f-A4 found six of.

    # ============================================== components/alarm-banner.tsx (⚠ Q2)
    ("10g-AB1 the banner caps its own list at five, so a twelve-alarm page counts twelve and names six",
     ALARM_BANNER_SRC,
     "            {rest.map((item) => (",
     "            {rest.slice(0, 5).map((item) => (",
     [ALARM_BANNER_TEST]),
    # ⚠ A MOVE, not a deletion. Deleting the count compiles and reddens plenty — but it is
    # `10a-AB1`'s subject, and it leaves the ⚠ test this backs (the count PRECEDES the well)
    # passing, because `indexOf` returns -1 for text that is not there and -1 is less than
    # everything. The wrong implementation someone would actually write is the count moved
    # in with the conditions it counts.
    ("10g-AB2 the count moves INSIDE the scrolling well, so §6.4's 'always visible' scrolls away at twelve alarms",
     ALARM_BANNER_SRC,
     '      <div className={styles.body}>\n        <div className={styles.head}>\n          <span className={styles.count}>\n            {count} active alarm{count === 1 ? \'\' : \'s\'}\n          </span>\n          <span className={styles.lead}>\n            <b>\n              {lead.label} {lead.value}\n            </b>\n          </span>\n          <span className={styles.since}>{lead.since}</span>\n          {lead.age === null ? null : <span className={styles.stale}>{lead.age}</span>}\n        </div>\n        {rest.length > 0 ? (\n          // ⚠ 10g/Q2 — the SCROLLING half of §6.4\'s fixed two-line banner. Named and\n          // `tabIndex={0}` for the same reason every other bounded box on this page is\n          // (10f-A6): a scroll region nobody can reach hides what it holds, and here what it\n          // holds is every alarm past the first line. The lead above is deliberately outside\n          // it, so §6.4\'s *"the count is always visible"* needs no sticky positioning.\n          <div\n            className={styles.rest}\n            role="group"\n            tabIndex={0}\n            aria-label="other alarm conditions"\n            data-role="banner-rest"\n          >\n            {rest.map((item) => (\n              // 10e §5 — `.item` is a REAL class now (10c1-A8\'s dangling `styles.item` was\n              // fixed by removing the reference; this loop restores it as a genuine rule,\n              // since the mock\'s `.item` carries its own border/background/padding — see\n              // `alarm-banner.module.css`).\n              <span key={item.id} className={styles.item}>\n                {item.label} {item.value} <i className={styles.itemSince}>{item.since}</i>\n                {item.age === null ? null : <i className={styles.stale}>{item.age}</i>}\n              </span>\n            ))}\n          </div>\n        ) : null}\n',
     '      <div className={styles.body}>\n        <div className={styles.head}>\n          <span className={styles.lead}>\n            <b>\n              {lead.label} {lead.value}\n            </b>\n          </span>\n          <span className={styles.since}>{lead.since}</span>\n          {lead.age === null ? null : <span className={styles.stale}>{lead.age}</span>}\n        </div>\n        {rest.length > 0 ? (\n          // ⚠ 10g/Q2 — the SCROLLING half of §6.4\'s fixed two-line banner. Named and\n          // `tabIndex={0}` for the same reason every other bounded box on this page is\n          // (10f-A6): a scroll region nobody can reach hides what it holds, and here what it\n          // holds is every alarm past the first line. The lead above is deliberately outside\n          // it, so §6.4\'s *"the count is always visible"* needs no sticky positioning.\n          <div\n            className={styles.rest}\n            role="group"\n            tabIndex={0}\n            aria-label="other alarm conditions"\n            data-role="banner-rest"\n          >\n            <span className={styles.count}>\n              {count} active alarm{count === 1 ? \'\' : \'s\'}\n            </span>\n            {rest.map((item) => (\n              // 10e §5 — `.item` is a REAL class now (10c1-A8\'s dangling `styles.item` was\n              // fixed by removing the reference; this loop restores it as a genuine rule,\n              // since the mock\'s `.item` carries its own border/background/padding — see\n              // `alarm-banner.module.css`).\n              <span key={item.id} className={styles.item}>\n                {item.label} {item.value} <i className={styles.itemSince}>{item.since}</i>\n                {item.age === null ? null : <i className={styles.stale}>{item.age}</i>}\n              </span>\n            ))}\n          </div>\n        ) : null}\n',
     [ALARM_BANNER_TEST]),
    ("10g-AB3 the banner's scrolling well loses its role, name and tab stop — a scroll box nobody can reach",
     ALARM_BANNER_SRC,
     "            className={styles.rest}\n            role=\"group\"\n            tabIndex={0}\n            aria-label=\"other alarm conditions\"\n            data-role=\"banner-rest\"",
     "            className={styles.rest}\n            data-role=\"banner-rest\"",
     [ALARM_BANNER_TEST]),
    ("10g-AB4 a single standing condition renders an empty scrolling well under its own lead",
     ALARM_BANNER_SRC, "{rest.length > 0 ? (", "{true ? (", [ALARM_BANNER_TEST]),
    ("10g-AB5 the banner announces as a status rather than an alert, so a new alarm waits its turn",
     ALARM_BANNER_SRC,
     'className={styles.banner} role="alert"',
     'className={styles.banner} role="status"',
     [ALARM_BANNER_TEST]),
    ("10g-AB6 the banner well is bounded by max-height, so its height is the CONTENT's again below one line",
     "components/alarm-banner.module.css",
     "  height: 21px;\n  box-sizing: border-box;",
     "  max-height: 21px;\n  box-sizing: border-box;",
     [ALARM_BANNER_TEST]),
    ("10g-AB7 both fade layers scroll with the container, so the banner claims more conditions below when there are none",
     "components/alarm-banner.module.css",
     "  background-image: var(--well-fade-cover), var(--well-fade-edge);\n  background-position: bottom;\n  background-size: 100% var(--well-fade-height);\n  background-repeat: no-repeat;\n  background-attachment: local, scroll;",
     "  background-image: var(--well-fade-cover), var(--well-fade-edge);\n  background-position: bottom;\n  background-size: 100% var(--well-fade-height);\n  background-repeat: no-repeat;\n  background-attachment: scroll, scroll;",
     [ALARM_BANNER_TEST]),

    # ============================================== components/panels/panel-notes.tsx (⚠ Q4)
    ("10g-PN1 the marker's count ignores the well's bound, so a roomy well says three lines are hidden that are not",
     PANEL_NOTES_SRC,
     "  Math.max(0, total - LINES_SHOWN[bound]);",
     "  Math.max(0, total - 1);",
     [PANEL_NOTES_TEST]),
    ("10g-PN2 the roomy budget is four lines, the height it USED to be — so the marker undercounts by one",
     PANEL_NOTES_SRC,
     "{ tight: 1, roomy: 3 }",
     "{ tight: 1, roomy: 4 }",
     [PANEL_NOTES_TEST]),
    ("10g-PN3 the marker is announced to assistive tech, which is being read every message anyway",
     PANEL_NOTES_SRC,
     '<span className={styles.more} aria-hidden="true" data-role="notes-more">',
     '<span className={styles.more} data-role="notes-more">',
     [PANEL_NOTES_TEST]),
    ("10g-PN4 the marker moves INSIDE the scroll box, where it scrolls away with the text it is about",
     PANEL_NOTES_SRC,
     '      </div>\n      {hidden === 0 ? null : (\n        // ⚠ `aria-hidden`: nothing is hidden from assistive tech — every message is in the DOM\n        // inside the named, focusable well above. This marker is the WALL PANEL\'s affordance,\n        // where there is no pointer and no keyboard to discover the scroll with.\n        <span className={styles.more} aria-hidden="true" data-role="notes-more">{`… ${hidden} more`}</span>\n      )}\n    </div>',
     '        {hidden === 0 ? null : (\n          <span className={styles.more} aria-hidden="true" data-role="notes-more">{`… ${hidden} more`}</span>\n        )}\n      </div>\n    </div>',
     [PANEL_NOTES_TEST]),
    ("10g-PN5 the marker is laid out in flow, so every overflowing well grows the panel by a line",
     "components/panels/panel-notes.module.css",
     ".more {\n  position: absolute;",
     ".more {\n  position: static;",
     [PANEL_NOTES_TEST]),
    ("10g-PN6 both fade layers scroll with the container, so a well with nothing hidden still says there is more",
     "components/panels/panel-notes.module.css",
     "  background-attachment: local, scroll;",
     "  background-attachment: local, local;",
     [PANEL_NOTES_TEST]),
    ("10g-PN7 the fade's cover is painted in the PANEL's ground, not the well's, so it is a bar rather than a cover",
     "components/tokens.css",
     "  --well-fade-cover: linear-gradient(to top, var(--surface-sunken), transparent);",
     "  --well-fade-cover: linear-gradient(to top, var(--surface-1), transparent);",
     [PANEL_NOTES_TEST]),
    ("10g-PN8 the roomy well goes back to four lines, spending the margin 10g/Q3 bought back",
     "components/panels/panel-notes.module.css",
     ".notes[data-bound='roomy'] {\n  max-height: 46px;",
     ".notes[data-bound='roomy'] {\n  max-height: 60px;",
     [PANEL_NOTES_TEST]),
    # ⚠ ADDED 2026-09-10 by 10g's RECONCILIATION (adversarial A3/R1). Every fade test in the
    # project asserted `background-size: 100% var(--well-fade-height)` and NOT ONE asserted the
    # token's value — so this one line deleted §6.1's ruled affordance from all FOUR wells at
    # once with `pnpm verify` green. `10g-PN7` mutates `--well-fade-cover`, the line above it,
    # which is why the hole looked covered.
    ("10g-PN9 the fade's height goes to zero, so every bounded well on the page silently loses the affordance",
     "components/tokens.css",
     "  --well-fade-height: 9px;",
     "  --well-fade-height: 0px;",
     [PANEL_NOTES_TEST]),

    # ============================================== components/panels/caption.tsx (⚠ Q3)
    ("10g-CP1 the throttle line stops being a well, so a third notable bit grows both GPU cards by 27px again",
     CAPTION_SRC,
     "      {well === undefined ? (",
     "      {true ? (",
     [CAPTION_TEST, GPU_PANEL_TEST]),
    # ⚠ The STORAGE test is 10g TEST-phase's: this mutation's NAME is about STORAGE's link
    # line, and until that test existed the only file it could redden about the default was
    # `caption.test.tsx`. `gpu-panel.test.tsx` renders a card with no link line at all.
    ("10g-CP2 `well` gains a default, so STORAGE's link line becomes an unnamed box with a tab stop",
     CAPTION_SRC,
     "export function Caption({ label, well, children }: CaptionProps) {",
     "export function Caption({ label, well = 'caption', children }: CaptionProps) {",
     [CAPTION_TEST, GPU_PANEL_TEST, STORAGE_NETWORK_PANEL_TEST]),
    ("10g-CP3 the LABEL is inside the well, so `throttle` scrolls out of view with the chips it names",
     CAPTION_SRC,
     '      {label === undefined ? null : <b className={styles.label}>{label}</b>}\n      {well === undefined ? (\n        children\n      ) : (\n        <span className={styles.well} role="group" tabIndex={0} aria-label={well} data-role="caption-well">\n          {children}\n        </span>\n      )}',
     '      {well === undefined ? (\n        <>\n          {label === undefined ? null : <b className={styles.label}>{label}</b>}\n          {children}\n        </>\n      ) : (\n        <span className={styles.well} role="group" tabIndex={0} aria-label={well} data-role="caption-well">\n          {label === undefined ? null : <b className={styles.label}>{label}</b>}\n          {children}\n        </span>\n      )}',
     [CAPTION_TEST]),
    ("10g-CP4 the throttle well is bounded at the THREE-line height, which is the height it had before the ruling",
     "components/panels/panel-text.module.css",
     "  max-height: 17px;",
     "  max-height: 44px;",
     [CAPTION_TEST]),
    ("10g-CP5 the throttle well stops scrolling, so its chips wrap and grow the card exactly as before",
     "components/panels/panel-text.module.css",
     "  position: relative;\n  overflow-y: auto;\n  max-height: 17px;",
     "  position: relative;\n  max-height: 17px;",
     [CAPTION_TEST]),
    # ---- ⚠ ADDED 2026-09-10 by 10g's RECONCILIATION (adversarial A2 and A3/R3).
    # ⚠ A2: the WELL was bounded and the CAPTION was not. `.caption` is `flex-wrap: wrap`, so
    # with `flex-basis: auto` the well's own max-content width breaks the line and the caption
    # is two lines tall — measured 41.2 px at 1280 and 1600 against the ruling's (and the
    # build's) claimed 17. This is the exact declaration someone would write back.
    ("10g-CP6 the throttle well takes its content's width as its flex basis, so the CAPTION wraps to two lines again",
     "components/panels/panel-text.module.css",
     "  flex: 1 1 0;",
     "  flex: 1 1 auto;",
     [CAPTION_TEST]),
    # ⚠ A3/R3: `panel-notes.module.css`'s `background-position` was asserted and this copy of
    # the same rule was not, so the fade could be moved to the well's TOP edge — marking the
    # edge the text does not continue past — with the whole suite green.
    ("10g-CP7 the throttle well's fade moves to its TOP edge, marking the edge the chips do NOT continue past",
     "components/panels/panel-text.module.css",
     "  background-position: bottom;",
     "  background-position: top;",
     [CAPTION_TEST]),

    # ============================================== components/panels/status-row.module.css (⚠ Q4)
    # ⚠ ADDED 2026-09-10 by 10g's RECONCILIATION (adversarial A3/R2). A `StatusRow`'s well is
    # one of the FOUR §6.1's affordance ruling names, and all five of its fade declarations
    # were asserted by no test in the suite and backed by no mutation in either harness. Both
    # attachments `scroll` is the revert that reads as a working fade and claims hidden text
    # permanently — on every row of SAFETY, COOLING, STORAGE and SERVING at once.
    ("10g-SR1 both fade layers scroll with the container, so every row's explanation well claims hidden text permanently",
     "components/panels/status-row.module.css",
     "  background-attachment: local, scroll;",
     "  background-attachment: scroll, scroll;",
     [STATUS_ROW_TEST]),

    # ============================================== components/panels/gpu-panel.tsx (⚠ Q3 wiring)
    ("10g-GP1 the GPU card stops asking for a well, so the primitive's bound is present and unused (10e's `0X4` shape)",
     GPU_PANEL_SRC,
     '<Caption label="throttle" well={`GPU ${index} throttle`}>',
     '<Caption label="throttle">',
     [GPU_PANEL_TEST]),
    ("10g-GP2 both cards' throttle wells are given one constant name, so two boxes announce the same three words",
     GPU_PANEL_SRC,
     '<Caption label="throttle" well={`GPU ${index} throttle`}>',
     '<Caption label="throttle" well="throttle">',
     [GPU_PANEL_TEST, DASHBOARD_SHELL_TEST]),
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
    # ⚠ `10e-` added by 10e (match-the-mock/density loop) — same instruction, same reasoning.
    # ⚠ `10f-` added by 10f (the owner's four rulings of 2026-09-09) — same instruction.
    # ⚠ `10g-` added by 10g (the last four unbounded terms: the table views, §6.4's banner, the
    #    throttle line, and the `… N more` affordance) — same instruction, same reasoning.
    bad_prefix = sorted(k for k in seen if not k.startswith(("10a-", "10b-", "10c-", "10e-", "10f-", "10g-")))
    if bad_prefix:
        raise SystemExit(
            f"!!! mutation ids must carry the creating step's prefix (10a-/10b-/10c-/10e-/10f-/10g-): {', '.join(bad_prefix)}"
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
