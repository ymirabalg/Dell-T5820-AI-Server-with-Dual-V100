# 10f ADVERSARIAL — findings

**Written by the ADVERSARIAL phase, 2026-09-09. Nothing was fixed and nothing was left edited.**
`git status` at the end is byte-identical to the one inherited (27 tracked files changed, 1219/137,
`row.*` staged deleted, four untracked `.md` plus this file). Every temporary script is in the
session scratchpad; nothing was committed; `SPEC.md` and `MOCK.html` were not opened for writing.

**Method.** Four browser harnesses of my own (`scratchpad/hostile{,2,3,4,5}.mjs`), each a copy of
`measure-breakpoints.mjs`'s server/login/route-interception skeleton on **:39174**, driving the real
app under fabricated telemetry; plus by-hand mutation of `lib/format.ts`, six by-hand one-line
reverts each followed by `pnpm verify`, and a serial run of the three harnesses 10f changed.
Every number below is from a run in this phase. **"Measured"** means a `getBoundingClientRect` /
`getComputedStyle` reading printed by one of those scripts; **"reasoned"** means read off the source
and never executed.

---

## Findings

### 10f-A1 — ⚠ SEVERE. Opening ONE chart's table view breaks §6.1 on a **healthy** page, and 10f's own silence #5 says nothing unbounded is left

**Severity: high.** Not introduced by 10f — but it falsifies a claim 10f makes, and it means the
acceptance measurement never grades the state a reader can reach with one click.

`10f-build.md:386-390` (silence #5): *"**`10e-Q2` is now the only UNBOUNDED term left on the
page**"*. Measured false three times over. The chart **table view** — SPEC §6.2's *"table view of
the series, **scrolling within its own container**"*, §9's *"accessibility floor"* — is bounded only
per component, at `--table-scroll-max: 40vh` (`components/tokens.css:117`, used at
`components/sparkline.module.css:119` and `components/stacked-time-series-chart.module.css:104`).
**Five of them are visible at once** (GPU 0, GPU 1, COOLING, and CPU's two), so the page's own bound
is 200vh.

Measured, `scratchpad/hostile4.mjs` — **healthy** telemetry, cadence 1 s, ~70 s of polling (72
samples in a 30-min window), then every `show as table` control clicked:

| viewport | overflow | gpu0 slot | cooling | cpu | each table |
|---|---|---|---|---|---|
| 1280×1024 | **+851 px** | 164.5 → **535.6** | 384.5 → **1127.7** | 216.1 → **959.3** | `clientHeight 410`, `scrollHeight 1429`, `max-height 409.6px` |
| 1600×1024 | **+851 px** | 176 → 535.6 | 408.5 → 1127.7 | 240.1 → 959.3 | same |
| 1920×1080 | **+862 px** | 176 → 558 | 408.5 → 1172.5 | 240.1 → 1004.1 | `max-height 432px` |

**One table view alone is already over.** GPU 0's slot grows **+371.1 px** (the 409.6 px table minus
the ~38 px sparkline it replaces) against **263.2 px** of healthy spare at 1280 — over by ~108 px
with three of the four controls untouched. At the default 5 s cadence a table reaches its 40vh cap
after ~21 samples, i.e. **under two minutes** after the page is opened.

The degraded page is worse: same run set on the all-collectors-failed fixture measured **+484 / +457
/ +401 px** (`hostile3.mjs` phase G) and, after two more minutes of samples, **+778 / +751 / +669**.

Neither `measure-breakpoints.mjs` (all 16 measurements) nor `check-density.mjs` ever opens a table
view, so nothing in the acceptance set can see this. Proven: **measured.**

---

### 10f-A2 — ⚠ The compound worst case is over at ALL THREE viewports, not "1–8 px at 1600", and the alarm banner is the term nobody bounded

**Severity: high.** `10f-build.md:380-385` (silence #4) says the compound case needs *"all seven
collectors failed **and** both `llama-server` instances erroring **and** a standing six-alarm
banner"* and lands *"1–8 px over"* at 1600 only; `10f-test.md:294-305` calls that *"arithmetic on
measured constants"* and endorses it.

Fabricated and measured (`scratchpad/hostile3.mjs`, phase F): six-plus alarm-band readings held past
the 10 s debounce, then every collector failed while the GPU cards kept alarming — the ordinary
sequence, not a synthetic one, since collectors fail *after* the alarm that made someone look.

| viewport | banner | grid overflow | spare |
|---|---|---|---|
| 1280×1024 | 146.2 px (12 alarms) | **+63 px** | −62.8 |
| 1600×1024 | 119.4 px | **+71 px** | −71.5 |
| 1920×1080 | 119.4 px | **+15 px** | −15.5 |

Slots at 1600: gpu 199 · 199 · cooling 528.3 · cpu 260.8 · memory 185.8 · **safety 258.5** ·
storage 251.3 · serving 166.8 · log 129.8.

Normalising to the build's own six-alarm assumption (90.5 px at 1280, 72.7 at ≥1600) still leaves
**+7 px at 1280 and +25 px at 1600** — against a predicted **+0.7** and **−8.1**. The build's table
is optimistic in the direction that matters at both tight viewports.

**The reason is that §6.4's banner is itself unbounded.** `lib/client/banner.ts:88` returns
`rest: mapped.slice(1)` with no cap, `AlarmBanner` renders every item, and
`components/alarm-banner.module.css` has no `max-height` anywhere. Measured heights at
1280 / 1600 / 1920:

| standing alarms | 1280 | 1600 | 1920 |
|---|---|---|---|
| 2 | 65.7 | 65.7 | 65.7 |
| 12 | **146.2** | 119.4 | 119.4 |
| 19 | **173.1** | 146.2 | 119.4 |

Nineteen alarms is not exotic on this box: four safety checks failing + two GPU temps + four fans +
two disks + link + CPU temp + swap + two units gets there without trying (that is exactly the
fixture that produced 19). §6.1's promise is *"unconditional on the banner"*, and 10f's whole budget
is drawn against a banner constant that is not one. Proven: **measured.**

---

### 10f-A3 — ⚠ 1600×1024 has **1.3 px** of spare on the ordinary all-collectors-failed page

**Severity: high** (it is the margin every other finding is spent against).
`components/panels/panel-notes.module.css:38,46` · `status-row.module.css:123`.

Fixture: a healthy box on which all eighteen §3.7 sources have filed the real 150-character DKMS
message, plus two instance-tagged `llama-server` entries, with the ordinary two-alarm banner pinned.
Measured twice in independent runs (`hostile2.mjs` phase C, `hostile5.mjs` phase I), identical to the
tenth of a pixel:

| viewport | overflow | **spare** |
|---|---|---|
| 1280×1024 | 0 | 36.9 |
| **1600×1024** | 0 | **1.3** |
| 1920×1080 | 0 | 57.3 |

This is neither of the two fixtures 10f graded — measurement 9 (dev-Mac, 104 px spare at 1600) and
measurement 10 (two sources, 122 px) — and it sits far below both. **1.3 px is not a margin.** It is
consumed by one more banner chip wrapping, one more character in one message, a different font
fallback, a browser zoom step, or a platform whose scrollbars take width (see *could not verify*).
Proven: **measured.**

---

### 10f-A4 — Six one-line reverts of the 10f diff keep `pnpm verify` green at 101 files / 2960 tests

**Severity: medium.** Each was applied alone, verified, and reverted; each leaves the suite at
**2960 passed, no type errors**, and none of the six touches text any of the 1083 harness anchors
name (checked by grep against all nine `regressions.py`).

| # | file:line | the one line | what it costs |
|---|---|---|---|
| R1 | `components/panels/status-row.tsx:156-158` | the **muted `note`** well loses `role="group" tabIndex={0} aria-label` | that well becomes an unreachable scroll box. `10f-SR3` and the new tests cover **`detail` only**; nothing asserts or mutates the `note` branch |
| R2 | `components/panels/panel-notes.module.css:54` | `.note` loses `overflow-wrap: anywhere` | the declaration that keeps a 600-character unbroken path inside the well (measured escape = 0 px today) — asserted by neither CSS-text test |
| R5 | `components/panels/status-row.module.css:118` | `.note` loses `overflow-wrap: anywhere` | same, on the row well |
| R6 | `components/panels/panel-notes.module.css:40` | `.notes` loses `background: var(--surface-sunken)` | the well stops reading as a well — the only cue that text is hidden |
| R7 | `components/panels/panel-notes.module.css:34` | `padding: 2px 5px` → `padding: 0` | the whole `border-box` argument in the module comment stops having a subject |
| R4 | `components/panels/panel-notes.tsx:101` | `key={\`${e.source}:${e.message}\`}` → `key={e.source}` | the duplicate-key collision `10f-test.md:167-169` calls out as an improvement, silently back |

The CSS-text tests are strong on the four declarations they name (`max-height`, `overflow-y`,
`position`, `box-sizing` — verified: reverting any of them is caught, `10f-CS4`/`CS5`/`CS6` bite) and
silent on everything else in the same rule.

**Related, and worse in kind:** `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` is in no
harness's `LEDGER_FILES` and outside `pnpm verify`, so the ~90 lines 10f added to it — `recordFit`,
`fixtureBoxDegraded`, `measureBoxDegraded` — have **zero** mutation coverage. `&&` → `||` in
measurement 10's precondition (line 588) is green in every command this project runs.
Proven: **measured** (six `pnpm verify` runs) and **reasoned** (the grep for anchor overlap).

---

### 10f-A5 — The test phase's corrected ≈277.8 px worst case over-counts: **two** rows can be stale-and-explained, not seven

**Severity: medium.** `10f-test.md:326-336` derives ≈277.8 px from *"Seven rows on the page can be in
that state — SAFETY ×4, SERVING ×2, COOLING's fan-service row"*. Measured, that is two.

- **SAFETY's other three rows can never go stale.** `ufw_enforcing`, `pwm5_present` and
  `dkms_for_running_kernel` call TOTAL severity functions, so `conditionsFrom` pushes an observation
  on every successful poll and `observePoll` never carries them absent —
  `components/panels/condition-lookup.ts:15-21` states this in its own module doc, and it is why
  `safety-panel.tsx:88-96` renders `▲watch` with an em dash rather than a stale age when
  `safety` is all-null. Measured at 14 s, 20 s and 45 s after every collector failed: exactly **one**
  `status-row…noteWatch` under `[data-slot="safety"]` (the `fan service` row), never four.
- **SERVING's two rows are retired, not staled.** `lib/conditions.ts:737-746` retires a condition
  whose `enumeration` was read; `serving` is read whenever the array is non-null, which is exactly
  when those rows exist. Measured: **zero** `noteWatch` under `[data-slot="serving"]` in any run,
  while both rows carried their `detail` wells.

So the +39.13 term applies to **SAFETY `fan service` and COOLING `fan service`** — measured in the
DOM as the only two — plus STORAGE's link, which is a `Caption` and not a row. The per-row constants
themselves reproduce exactly: bare **26.8**, + `detail` **46.8** (+20.0), + stale age **45.9**
(+19.1), + both **65.9** (+39.1). Correcting the count moves the estimate from ≈277.8 to ≈216, which
does **not** rescue the case — A2 measured it over anyway, for the different reason A2 names.
Proven: **measured.**

---

### 10f-A6 — Nine wells share one accessible name, and two different subjects share another

**Severity: medium.** `components/panels/panel-notes.tsx:98` · `status-row.tsx:156,161`.

Measured on the all-collectors-failed page at 1280, walking every focusable element:

- **25 tab stops**, up from **10** on the healthy page — 16 of them wells.
- Duplicate `role="group"` names: `["collector messages", "fan service explanation"]`.
- `"collector messages"` is announced by GPU 0, GPU 1, COOLING, CPU, MEMORY, **STORAGE twice**
  (the panel block and the link block, adjacent in the same panel) and SERVING. A screen-reader
  user tabbing the page hears the same seven words seven times with nothing distinguishing them.
- `"fan service explanation"` names **two different units in two different panels** — COOLING's
  `gpu-fan-control.service` row and SAFETY's own fan-service row. The name is
  `` `${label} explanation` `` and both rows are labelled `fan service`. `10f-test.md:133-134`
  records the *within-row* collision (`note` and `detail` on one row) as *"one small wart"*; the
  cross-panel one is not recorded at all.
- A well that scrolls nothing is still a tab stop: measured 2 of 16 on that page (MEMORY's and
  COOLING's), and on a lightly-degraded page most of them. `10f-test.md:125-131` argues this is
  cheap because *"on a healthy page the wells do not exist at all"* — true, and the cost is paid
  entirely on the page an operator reaches **because something is wrong**.
- Both GPU cards render the same `errorsForPanel(snapshot, 'gpu')` list (`gpu-panel.tsx:288`), so
  one `nvidia-smi` message occupies two identically-named wells. Pre-existing; 10f did not change it,
  and folding the takeover into `PanelNotes` (`gpu-panel.tsx:187`) doubles it again in that branch.

Proven: **measured.**

---

### 10f-A7 — The bound holds; the readability it buys was never quantified, and on the wall panel it is zero

**Severity: medium.** `components/panels/panel-notes.module.css:30-47` ·
`status-row.module.css:111-126`. This is the ruling's own cost rather than a defect the build
missed — but no phase put a number on it, and the number is the argument.

Measured at 1280 on the all-collectors-failed page, `clientHeight` against `scrollHeight`:

| well | shown | content | visible |
|---|---|---|---|
| CPU `collector messages` (4 sources) | 18 px | **233 px** | **7.7 %** |
| SERVING unattributed | 18 px | 123 px | 15 % |
| SAFETY, each of four rows | 14 px | 66 px | 21 % |
| STORAGE link | 18 px | 59 px | 31 % |
| STORAGE panel block | 60 px | 117 px | 51 % |

§3.7's rule is *"an alarm with no explanation beside it is not actionable"*, and §6.1's subject is
*"the single-screen wall panel"*. On a wall panel there is no pointer and no keyboard, so **7.7 % of
CPU's explanation is the whole of it**. The wells carry no affordance either — no scrollbar gutter,
no fade, no "more" marker; measured `offsetHeight − clientHeight = 0` on every well, i.e. nothing at
all is drawn to say text continues. Proven: **measured.**

---

### 10f-A8 — `Chip band={false}` is not constrained to `size="md"`, and on an `sm` chip it renders nothing at all

**Severity: low-medium (latent).** `components/chip.tsx:117,121,128-140` ·
`components/chip.module.css:75-83`.

`band` is a plain optional boolean on `ChipProps`, orthogonal to `size` in the type and in the
component. An `sm` chip's entire visible content **is** the glyph, and its entire accessible content
is the `sr-only` band word; `.chip[data-size='sm']` fixes `width: 11px` and there is no `label` slot
in any `sm` call site. So `<Chip severity="alarm" size="sm" band={false} />` renders an **empty 11 px
box with no `data-severity`, no glyph and no announced word** — a severity indicator that says
nothing, in the four places `sm` is used (`status-row.tsx:136`, `cooling-panel.tsx:111`,
`session-event-log-panel.tsx:81`, `safety-panel.tsx:126`). Nothing in the type, the tests or the six
`10f-C*`/`10f-GP*` mutations forbids it; the module doc frames `band` entirely in terms of the `md`
code pill and never says it is `md`-only.

No caller does this today — `band` is passed at exactly one site in the tree (`gpu-panel.tsx:276`).
Proven: **reasoned, not run.**

---

### 10f-A9 — Measurement 10's precondition is a containment check, not an exclusivity one

**Severity: low.** `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs:570-590`.

The answer to the handoff's question is: **not today, and the assertion does not forbid it.**
`panelsForSource` (`lib/client/observations.ts:322-324`) maps `dkms → ['safety']`, so the injected
message can only land under SAFETY. But the check is `safety.includes(dkms)` — adding `dkms` to a
second panel's list is a one-line edit in `observations.ts`, and measurement 10 would still report
PASS while the page carried an extra well. The same check is already *half* blind in the other
direction: `dell-smm → ['cooling', 'safety']`, so `DELL_SMM_MESSAGE` renders in **two** panels and
the precondition names only COOLING.

Two smaller notes on the same block: the precondition is evaluated once, at
`NO_SCROLL_VIEWPORTS[0]`, before `recordFit` changes the viewport three times; and
`textContent.includes` is satisfied by text inside a `display: none` subtree or scrolled out of a
well, so "the fixture took" is strictly weaker than "the fixture is on screen". Neither is wrong
given that the fit is measured separately — they are the limits of what the PASS means.
Proven: **reasoned, not run** (the mechanism), with the panel map read from source.

---

### 10f-A10 — One message is three lines in COOLING and one line in STORAGE, and the spec is silent on that

**Severity: low.** `components/panels/cooling-panel.tsx:148,255` ·
`storage-network-panel.tsx:69,137`.

COOLING's `PanelNotes` can hold **at most one** message — `dellSmmError` is a `findLast` on a single
source — and takes `bound="roomy"` (60 px, three lines). STORAGE's link block also holds **exactly
one** message and takes the `tight` default (18 px, one line). Measured on the degraded page:
COOLING's well `clientHeight 32 / scrollHeight 32` (nothing hidden) against STORAGE's link well
`18 / 59` (69 % hidden). The arithmetic behind each choice is recorded and correct; what is not
recorded is that **how much of a collector's message an operator can read now depends on which
panel's grid row has slack**, which is a reader-facing rule §6.5 does not state. Silence #3 records
`max-height`-vs-`height`; this one is not recorded at all. Proven: **measured.**

---

## What held

Everything below was attacked and did not break.

**Hostile content cannot escape a well horizontally.** Five message shapes, each filed by all
eighteen sources at once, at all three viewports: a **600-character path with no spaces**, a
**2 KB `journalctl` line**, **RTL Arabic**, a message with embedded `\n`, and 400 characters after a
non-breaking space. Measured every time: `documentElement.scrollWidth − clientWidth = 0`, the widest
element-vs-panel overhang **0.0 px**, and `scrollWidth === clientWidth` on every well. Page overflow
0 at all three viewports in all five (spare 36.9 / 1.3–3.3 / 57.3). `overflow-wrap: anywhere` is what
does it, and A4/R2/R5 is that it is unasserted.

**A hundred entries from one source do not grow the page.** 218 `errors[]` entries (statvfs ×100,
coretemp ×100, plus the eighteen) — overflow **0**, spare 42.3 / 6.8 / 62.8, wells scrolling with
`clientHeight` pinned. Neither the well nor the dedupe bounds the count (`errorsForPanel` filters and
does not fold); the `max-height` alone is enough.

**Nested scrolling does not re-grow the document.** A well inside SAFETY's row list, the log's own
well, and the panel wells all scroll independently; scrolling **every** inner scroller in the
document to its end changed `documentElement.scrollHeight` by **0**. The only thing that grows the
page in that configuration is the chart table view — finding A1, which is not a well.

**Zero / one / many is bounded.** `clientHeight` measured pinned at 14 / 18 / 32 / 45 / 60 px while
`scrollHeight` ran to 233; an empty `messages` renders no element at all, and the healthy page is
**263.2 / 227.6 / 283.6 px** spare with slot heights identical to the build's to the tenth of a pixel.

**Q13's three re-aims bite the property they name.** Applied by hand to `lib/format.ts:449-451` and
run against `lib/format.test.ts`:

| mutation | red | the test that went red |
|---|---|---|
| `02-R30` (delete the sub-minute return) | **6** | …including `…and the fourth form exists because "up 0 min" is that defect one scale down` |
| `02-R31` (`<` → `<=`) | **1** | `exactly one minute is a minute count, not the sub-minute form → 60` |
| `02-R20` (`days >= 1` → `>= 0`) | **14** | the whole `§3.2's four forms` block |

Exactly the build's figures (6 / 1 / 14), on the properties the ids record; `${prefix}` is the only
text that moved and no anchor spans more or less of the function than before. `lib/format.ts`
restored byte-identical (md5 checked).

**The three harnesses reproduce, run serially in one call on the inherited tree.**

| harness | mutations | ledger | exit |
|---|---|---|---|
| `02-format-severity` | **60** | 272 red across 60; 22 ⚠ checked | 0 |
| `09-ui-primitives` | **128** | 184 red across 128; 135 ⚠ checked | 0 |
| `10-panels-assembly` | **233** | 274 red across 233; 251 ⚠ checked | 0 |

Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`. `pnpm verify`: **101 files,
2960 tests, no type errors, exit 0.**

**`PanelNotes` consolidation is right under S-G and S-H.** Fixtured with `llama-env` carrying
`instance: 0` *and* an untagged `llama-env`, plus `llama-health` with `instance: 1` and untagged.
Measured in the DOM: the tagged entries render in `llama-server@0 explanation` /
`llama-server@1 explanation` (one well each), the untagged ones in SERVING's single
`collector messages` well — **each entry exactly once, none duplicated, none dropped**. SAFETY's
`messageFor` still filters `e.instance === undefined` (`safety-panel.tsx:74-75`), COOLING's
`dbusError` still does (`cooling-panel.tsx:159-160`), and STORAGE's `net-operstate` is still excluded
from the panel block and rendered once under the link caption in its original position. The GPU
takeover still renders `errorsForPanel(snapshot,'gpu')` whole, and the SERVING takeover still renders
`servingErrors` whole including the orphan-instance shape.

**`Chip band` does not leak.** `band` is passed at exactly one call site in the whole tree
(`gpu-panel.tsx:276`); every other `<Chip>` — 8 sites — omits it and takes the `true` default, so no
existing rendering changed. Reverting the guard (`data-severity` emitted regardless of `band`) is
caught: **2 tests red in 2 files**. Removing `tabIndex` from `PanelNotes` is caught: **1 test red**.
The throttle chips live inside a `Caption`, not inside a chart, so neither the table view nor the
hover layer touches them — there is no such layer over a `Caption`.

**`styles.test.ts`'s new `BOUNDED` regex is correct as written.** `min-height`/`line-height` are
refused because `[^-]` cannot match the hyphen before `height:`; `height: auto` is refused because the
value must start with a digit, `calc(` or `var(`. The positive form really is necessary — the
negative-lookahead form is defeated by backtracking exactly as the comment says.

---

## What I could not verify

1. **Classic (non-overlay) scrollbars — the deployment target's default.** Every measurement in this
   phase *and in 10f* was taken on macOS Chrome, where `offsetHeight − clientHeight` measured **0**
   on every well. I tried to force 15 px classic scrollbars with an injected `*::-webkit-scrollbar`
   rule (`scratchpad/hostile5.mjs` phase J); the wells' scrollbar box stayed 0, so the probe proved
   nothing. **Open:** whether a `max-height: 14px` `.note` has room for a scrollbar at all on
   Linux/Windows Chrome, and whether losing 15 px of the 269 px SAFETY column to one re-wraps enough
   to matter against A3's 1.3 px of spare at 1600×1024. Worth one measurement on the real box.
2. **A banner of exactly six alarms.** I measured 2, 12 and 19; 10e §2.11's 63.7 / 72.7 px figures
   for six were not reproduced. A2's normalisation uses the build's own numbers rather than mine.
3. **Each of A4's six reverts against the three harnesses.** Each was run against `pnpm verify` only.
   I established by grep that none of the reverted text appears in any of the 1083 anchors, but I did
   not re-run the harnesses under each revert.
4. **Whether A1's table-view overflow predates 10e.** I measured it on this tree only. The 40vh
   constant and both `.tableView` rules are untouched by the 10f diff, so it is not 10f's — but I did
   not check out an earlier commit to date it.
5. **`safety-panel.tsx`'s `state.unknownStanding`.** Named by the test phase as a second unbounded,
   configuration-driven term; I did not fabricate an unrecognised `STANDING` id to measure it.

---

## Housekeeping

`git status` matches the inherited tree exactly (checked before and after every probe; `lib/format.ts`
and all six reverted files restored from copies and confirmed by `git diff --shortstat` at
27 files / 1219 / 137). Nothing listening on :39173 or :39174. Every browser this phase launched was
closed by the script that launched it, and every `next dev` it started was killed by process group.

⚠ **Three** `next-server (v16.3.4)` processes remain, aged 3 d 02 h, 3 d 02 h and 2 d 13 h — one more
than `10f-test.md:475-480` records. None is mine (mine would be seconds old) and none is on a
measurement port; left running per the rule, and recorded because the next reader will find three
where the last note says two.
