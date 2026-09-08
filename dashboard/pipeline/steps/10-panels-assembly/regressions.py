#!/usr/bin/env python3
"""Step 10a's deliberate regressions — evidence that the shell's tests bite.

Same harness as steps 2–9, including the per-mutation **red-test ledger** (HANDOVER §5.2) and
the corrected ⚠-scanner (paren-balanced, string-, comment- and generic-aware) step 9's
reconciliation produced. **Copied from `pipeline/steps/09-ui-primitives/regressions.py`
verbatim** except for `LEDGER_FILES` and `REGRESSIONS` — the handoff for this step says not to
write a scanner from scratch, and all eight+ existing harnesses are byte-identical here.

Scope: **10a, the shell** — the assembly seams, the header, the sticky alarm banner, the grid,
`app/`'s wiring, and D6 (`use-telemetry.ts`). The nine panel bodies are 10b's; this harness
does not touch `components/panels/` because it does not exist yet.

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
PANEL_PLACEHOLDER_TEST = "components/panel-placeholder.test.tsx"
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
LEDGER_FILES = [
    HEADER_STATUS_TEST, BANNER_TEST, HEADER_TEST, ALARM_BANNER_TEST, GRID_TEST,
    PANEL_PLACEHOLDER_TEST, USE_TELEMETRY_TEST, USE_TELEMETRY_SSR_TEST, USE_NOW_TICK_TEST,
    DASHBOARD_SHELL_SSR_TEST, DASHBOARD_SHELL_TEST, PAGE_TEST,
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
PANEL_PLACEHOLDER_SRC = "components/panel-placeholder.tsx"
USE_TELEMETRY_SRC = "lib/client/use-telemetry.ts"
USE_NOW_TICK_SRC = "app/use-now-tick.ts"
DASHBOARD_SHELL_SRC = "app/dashboard-shell.tsx"
GRID_CSS_SRC = "components/grid.module.css"
PAGE_SRC = "app/page.tsx"

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

    # ============================================== components/panel-placeholder.tsx
    ("10a-PP1 the placeholder chip claims a \"normal\" severity band it has not earned",
     PANEL_PLACEHOLDER_SRC,
     '<PanelShell title={title} subtitle={PLACEHOLDER_SUBTITLE} chip={null}>',
     "<PanelShell title={title} subtitle={PLACEHOLDER_SUBTITLE} chip={'normal'}>",
     [PANEL_PLACEHOLDER_TEST]),

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
    ("10a-PP2 the placeholder stops rendering its panelId, so the id namespace is unobservable (F16)",
     PANEL_PLACEHOLDER_SRC,
     '<p className={styles.pending} data-panel-id={panelId}>',
     '<p className={styles.pending}>',
     [PANEL_PLACEHOLDER_TEST, DASHBOARD_SHELL_TEST]),
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
    bad_prefix = sorted(k for k in seen if not k.startswith("10a-"))
    if bad_prefix:
        raise SystemExit(f"!!! mutation ids must carry the creating step's prefix (10a-): {', '.join(bad_prefix)}")


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
