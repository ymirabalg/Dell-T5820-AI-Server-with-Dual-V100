# 10e ADVERSARIAL — findings

**Written 2026-09-09 by the adversarial phase. Nothing was fixed; nothing was committed.**
`git status` is the 81 entries this phase inherited (65 `M`, 16 `??`), plus this note.

## What this phase could and could not run

| | |
|---|---|
| `pnpm verify` | **run — exit 0, 102 files, 2892 tests, no type errors.** The test phase's claim confirmed |
| `02` / `04` / `09` / `10` harnesses, serially, one call | **run.** 04 → 94/94 exit 0; 09 → **122/122**, 134 ⚠ checked, exit 0; 10 → **191/191**, 215 ⚠ checked, exit 0; 02 → exit 1 with **only** `02-R20`/`R30`/`R31` (the pre-existing orphans). Every agent claim about the harnesses holds |
| `measure-breakpoints.mjs` / `measure-arrangements.mjs` / `check-density.mjs` | **NOT run** — the parent's `next dev` holds the directory (handoff §intro). So `check-density.mjs`'s ALL PASS, the 263/228/284 spare, and measurement 9's 27/49 px are still **unverified by anyone but the second build agent** |
| headless Chrome on **standalone repros** (`playwright-core` + system Chrome, no `next dev`, no port) | **run** — this is how A1, A2, A9 and A10 below are measured. The CSS in each repro is copied verbatim from the shipped stylesheets; the numbers are Chrome's, not arithmetic |
| 24 hand-applied source/CSS mutations, each followed by the full suite and an immediate restore | **run** (`scratchpad/mut.py`, `mut2.py`). Tree verified clean after each batch |

Scratch artefacts are in the session scratchpad (`f1.html`, `f1b.html`, `f1.mjs`, `f1b.mjs`,
`f1c.mjs`, `f5.html`, `f5.mjs`, `f5b.mjs`, `strip.mjs`, `notes.html`, `notes.mjs`, `banner.mjs`,
`degraded.stest.tsx`, `vitest.scratch.mjs`, `mut.py`, `mut2.py`, `deadcss.mjs`, `deadexp.mjs`).
Nothing was left in the tree.

---

# Findings, most severe first

## 10e-A1 — F1's fix does not work. The `.sr-only` leak is still there, and the page starts scrolling at ~15 log entries

**Severity: HIGH.** `components/panel-shell.module.css:13-18`, with
`components/panels/session-event-log-panel.module.css:3-13`, `components/chip.tsx:108`,
`components/tokens.css:148-158`.

`panel-shell.module.css:13` claims: *"every `Chip` renders a `position: absolute` `.sr-only`
span. With no positioned ancestor its containing block is the initial containing block, so a
clipped descendant (the session event log's scroll box, either chart's table view) pushed that
hidden span BELOW THE FOLD and grew `documentElement.scrollHeight`. This makes the panel the
containing block for every `.sr-only` span inside it."*

The premise is right and the remedy does not follow. With `top`/`left` auto, an absolutely
positioned box is placed at its **static position** — inside the 500th `<li>`, ~10,000 px down —
in *both* cases; moving the containing block from the ICB to `.panel` does not move it. And an
ancestor scroll container clips an abspos descendant only when it is in that descendant's
**containing-block chain**: `.scroll` is `position: static`, so it is in neither chain. `.panel`,
`.slot` and `.grid` are all `overflow: visible`, so the span's scrollable-overflow region
propagates straight to the document exactly as before.

**Measured** (`scratchpad/f1b.html` — the shipped `.panel` / `.scroll` / `.entry` / `.sr-only`
rules verbatim, log panel placed so its bottom sits at y = 828.5 on a 1280×1024 viewport, i.e.
195 px of spare, *less* generous than the 263 px `check-density.mjs` reports):

| log entries | `documentElement.scrollHeight` | panel height |
|---|---|---|
| 1 / 3 / 5 | 1024 | 128.5 |
| 10 | 1024 | 128.5 |
| **15** | **1044 — the page now scrolls** | 128.5 |
| 20 | 1154 | 128.5 |
| 50 | 1809 | 128.5 |
| 200 | 5085 | 128.5 |
| **500** (`MAX_EVENTS`) | **11,639** | 128.5 |

Row height is 21.84 px, so each entry past the well adds 21.84 px of document scroll height.
**The panel stays 128.5 px throughout** — which is why `check-density.mjs`'s per-slot check and
10e §2.8's *"the panel is 133.8 px whether the log holds one entry or five hundred"* both stay
true while §6.1's no-scroll promise fails.

Controls, same page (`scratchpad/f1c.mjs`), at 200 entries:

| | `scrollHeight` |
|---|---|
| as shipped | 5085 |
| delete every `.sr-only` span | **1024** |
| `.scroll { position: relative }` | **1024** (`.panel.scrollHeight` 127, `.scroll.scrollHeight` 4369 — contained where it belongs) |
| `.panel { overflow: hidden }` | **1024** |

A three-panel side-by-side (`scratchpad/f1.html`) makes the same point in one page: `.panel`
static → panel `scrollHeight` 101; `.panel` relative (**shipped**) → 3992; `.scroll` relative →
101.

**Failure scenario.** A wall panel left open. 15 state transitions land (a fan engaging and
releasing across a soak is several per minute). The page acquires a scrollbar and the bottom row
of panels can be scrolled off — the one thing §6.1 promises will not happen. Nothing in the
suite notices: deleting `position: relative` from `.panel` altogether leaves all 2892 tests green
(mutation **Q**), and so does reverting `.scroll` to `max-height: 84px` (mutation **R**).

**Not fixed.** The measured fix is `position: relative` on `.scroll` — the clipping box — not on
`.panel`. Note the comment's other two named victims (the chart table views) are safe for a
different reason: their only `.sr-only` is the `<caption>`, which sits at the top.

---

## 10e-A2 — `Strip` re-creates F5's exact defect on the GPU card: `served by instance N` cannot wrap and overflows the panel

**Severity: HIGH.** `components/strip.module.css:23-27` (`.v { white-space: nowrap }`),
`components/panels/gpu-panel.tsx:248-254`.

10e moved `served by instance N` out of a `Row` (whose `.value` 10e itself gave
`min-width: 0; white-space: normal; overflow-wrap: anywhere` **because of F5**) into `Strip`,
whose `.v` is `white-space: nowrap` with no `overflow-wrap`. `.strip`'s `flex-wrap: wrap` only
wraps *between* items; a single item wider than the column just spills.

The value is `formatText(instance.model)`, and `instance.model` is `/v1/models`'s `data[0].id`
(`lib/collectors/llama.ts:206-233`). `llama-server` reports **the `-m` path** there unless
`--alias` is given, and `serve-llm.sh`'s own signature is `set-model N MODEL [ALIAS]` — the alias
is optional (CLAUDE.md, *Serving*). So `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf` is a
reachable value on this box, not a hypothetical.

**Measured** (`scratchpad/f5.html`, the shipped `.strip`/`.item`/`.k`/`.v` rules verbatim), GPU
column content width 285 px at the 1280 design target:

| column width | `.strip` scrollWidth | column scrollWidth |
|---|---|---|
| 285 px | **345** | **345** |
| 262 px | **345** | **345** |
| 200 px | **345** | **345** |

Flipping only `.v` to `white-space: normal; overflow-wrap: anywhere` in the same page
(`scratchpad/strip.mjs`) returns both to **285** at a cost of 47.5 px of strip height. So the
`nowrap` is the whole cause, and SERVING's `inline` — the same string, the same width — does not
overflow precisely because it *has* `overflow-wrap: anywhere` (`status-row.module.css:57-63`).

Unguarded: deleting `white-space: nowrap` from `strip.module.css` leaves all 2892 tests green
(mutation **U**).

---

## 10e-A3 — §2.11's own invariant-1 requirement is unguarded, and 10e-test.md states the opposite

**Severity: HIGH** (a false claim about coverage, on invariant 1).
`components/panels/cooling-panel.tsx:100-104`, `components/panels/cooling-panel.test.tsx:57-62`.

10e §2.11's degraded table says of *fan 3 at `0 RPM`*: **"chan row unchanged (14.8; the numeral
turns `--status-alarm-ink`)"**, and `cooling-panel.module.css:44-58` ships the three inks
(`.value` / `.valueUnknown` / `.valueZero`) for it. `10e-test.md`'s "26 rows" paragraph asserts:
*"`0 RPM` takes `.valueZero { color: var(--status-alarm-ink) }` while `null` takes
`.valueUnknown`, **fixtured both ways**"*.

**Measured false.** Deleting the zero branch —

```ts
if (value === 0) return styles.valueZero as string;      // cooling-panel.tsx:102
```

— so that a genuinely stopped fan falls through to the ordinary `.value` ink, leaves the whole
suite green: **102 files, 2892 passed** (mutation **AF**). The reason is in the test helper:

```ts
const chanValueFor = (html, channelLabel) => { ...
  const valueMatch = /<span class="[^"]*">([^<]*)<\/span>/.exec(html.slice(afterId));
  return valueMatch?.[1] ?? '';                          // the TEXT; the class is discarded
};
```

`chanValueFor` deliberately matches any class and returns only the text, so the two tests at
`cooling-panel.test.tsx:148-167` fixture `'0 RPM'` vs `'—'` — the *strings*, which `formatRpm`
already guarantees — and never the *ink*, which is the only thing 10e added. `chanSeverityFor`
reads the sibling `Chip`'s `data-severity`, which comes from `severityFanStopped`, not from
`chanValueClass`. So all three branches of `chanValueClass` are unasserted, and no mutation in
any of the nine harnesses touches it.

**Failure scenario.** A wrong implementation writes `chanValueClass` with `if (!value)` or drops
the zero branch. A chassis fan reading `0 RPM` — a dead fan on a box with two passively-cooled
250 W cards — prints in the same ink as `1,005 RPM`. Green everywhere.

---

## 10e-A4 — the session event log can silently get its hatched `—` back: OQ-4 has no guard at the call site

**Severity: MEDIUM-HIGH.** `components/panels/session-event-log-panel.tsx:69`,
`components/panel-shell.tsx:81-89`.

This is the handoff's aim 3 asked as a mutation. `panel-shell.test.tsx` fixtures all three
primitive states with exact counts (1 / 2 occurrences of `data-severity="none"`), and
`10e-PS4`/`PS5` back them — but **nothing asserts that the LOG is the caller that omits it**.
Adding `chip={null}` back to the log's `PanelShell` leaves all 2892 tests green (mutation **O**),
and the head renders the hatched `—` pill again — the exact rendering OQ-4 declined.

`10b-SE2` was re-aimed onto that call-site line, but its mutation is a different edit; a
`chip={null}` insertion is not the wrong implementation it catches.

Conversely, the parent's other half of the question — *can a panel that HAS readings end up with
the chip omitted?* — **holds**: `chip?: Severity | null` under `exactOptionalPropertyTypes: true`
makes `chip={undefined}` a compile error, and all eight other call sites pass a
`Severity | null`-typed expression (verified by reading each, and by the test phase's `git show
HEAD:` diff).

---

## 10e-A5 — five prop wirings 10e added at panel call sites are asserted by nothing

**Severity: MEDIUM-HIGH.** Each was applied and the full suite run; **every one stayed green**
(102 files, 2892 passed). This is HANDOVER §0.8's rule — *wiring a prop is a property, and an
optional prop makes it an untested one* — recurring at five more sites in the same loop the test
phase closed it at three.

| # | mutation | file:line | result |
|---|---|---|---|
| B | GPU VRAM meter loses `tickPercent={90}` | `gpu-panel.tsx:246` | GREEN |
| C | MEMORY RAM meter loses `tickPercent={85}` | `memory-panel.tsx:58` | GREEN |
| D2 | STORAGE loses **both** `tickPercent={85}` | `storage-network-panel.tsx:77,85` | GREEN |
| E | the throttle chips lose the `code` modifier | `gpu-panel.tsx:258` | GREEN |
| A | **CPU's two promoted sparklines lose `timeLabels`** | `cpu-panel.tsx:128,140` | GREEN |
| F | COOLING's mode chip becomes `size="sm"` (the pill disappears) | `cooling-panel.tsx:188` | GREEN |
| N | `Figure` loses its `cap 250.0 W` caption | `gpu-panel.tsx:225` | GREEN |

Two are worse than the rest.

**E** is the one `chip.tsx:39-40` names by hand: *"`code` … `text-transform: none` and the
monospace face, **so `0x4` cannot render `0X4`**"*. `10e-C1` backs the *primitive*'s `code`
modifier in step 9's harness; nothing backs the *wiring*, so dropping `code` at the only call
site ships `0X4 SW POWER CAP` / `0X20 SW THERMAL SLOWDOWN` — a mask uppercased into something
that is not a mask — with every harness green.

**A** is the GPU hole the test phase closed (`10e-GP1`..`GP5`), left open on CPU. The test phase
recorded that `cpu-sparkline-wrap` / `cpu-full-chart-wrap` are referenced by no test and no
measurement; `timeLabels` is in the same position. `10c-P2`/`P3`'s anchors *contain* the
`timeLabels` token as surrounding context, which is why they still match after it is deleted.

---

## 10e-A6 — the density fix itself is unguarded: six one-line CSS reverts, all green

**Severity: MEDIUM-HIGH**, because the only tool that can see them is the one this environment
cannot run.

| # | mutation | file | result |
|---|---|---|---|
| W | `body { font-size: 12px }` → `16px` | `tokens.css:127` | GREEN |
| S | `.track { box-sizing: border-box }` removed | `meter.module.css:34` | GREEN |
| T | `.scroll { box-sizing: border-box }` removed | `session-event-log-panel.module.css:6` | GREEN |
| R | `.scroll { height: 84px }` → `max-height` | `session-event-log-panel.module.css:7` | GREEN |
| Q | `.panel { position: relative }` removed | `panel-shell.module.css:18` | GREEN |
| X | `.grid { gap: 9px }` → `12px` | `grid.module.css` | GREEN |

`W` is 10e §1.1's *"one line that does a third of the work"* and the single place the root size
is set; reverting it scales every panel by ~33 % and blows the fold. `S` and `T` are the two
lines the second build agent added to converge `check-density.mjs` from +1.8 px/meter to 0.0 %.
`R` is what makes §2.8's fixed well fixed.

`components/styles.test.ts` is the file that could see these and does not: it asserts one
property family (`flex-basis: 100%` inside a `flex-wrap: wrap` container) file-wide, and nothing
about `box-sizing`, `height`, `position` or the root size. Recorded, not fixed — but it means
*every* number in `10e-build.md` §1 rests on a browser run nobody can currently reproduce.

---

## 10e-A7 — S-B's watch tone is unguarded on both surfaces that carry it

**Severity: MEDIUM.** `components/panels/safety-panel.tsx:118`,
`components/panels/storage-network-panel.tsx:105-107`.

S-B (SPEC §6.5, ruled 2026-09-08) requires a stale row's age to read `--status-watch`, *"matching
`AlarmBanner`'s own `.stale` span exactly"*. Both places 10e renders it are unasserted:

- Forcing SAFETY's fan-service row to `noteTone={'muted'}` → **GREEN** (mutation M).
- Deleting STORAGE's `style={{ color: 'var(--status-watch)' }}` → **GREEN** (mutation K).

The second is the build's recorded silence #4 (*"STORAGE's stale-age tone has no shared component
to express it"*). The silence was recorded; the resulting one-off inline style shipped with no
test and no mutation, so the next reader who tidies it away removes a ruled requirement silently.
COOLING's own `.staleCaption` (`cooling-panel.module.css:13-18`) is the third copy of the same
colour and is likewise unasserted.

---

## 10e-A8 — `Hero`'s `ariaLabel` renders `aria-label` on a `<div>`, where ARIA prohibits it — and COOLING's headline loses the words "fan 5" entirely

**Severity: MEDIUM.** `components/hero.tsx:44-52`; callers at `cooling-panel.tsx:184`,
`gpu-panel.tsx:185`, `cpu-panel.tsx:92`, `memory-panel.tsx:51`.

```tsx
<div className={styles.hero} data-severity={severity ?? 'none'} aria-label={ariaLabel}>
```

A `<div>` with no `role` maps to ARIA's `generic` role, for which *ARIA in HTML* lists
`aria-label` as **prohibited**; assistive technology is not required to expose it and generally
does not (this is what axe-core reports as `aria-prohibited-attr`). The prop's own doc claims it
is *"an accessible name for the whole figure, when the visible text alone would not say what it
is"* — which is exactly the case that does not work.

Two concrete consequences, both from the rendered markup (`scratchpad/degraded.stest.tsx`, real
components through `renderToStaticMarkup`):

1. **COOLING.** Before 10e the fan-5 reading was `<Row label="fan 5" …>` — visible text. It is now
   `<Hero … ariaLabel="fan 5">`, and **the string `fan 5` no longer appears in the panel body at
   all**; the head shows `cooling`, the chan table shows `fan 2 / fan 1 / fan 3 / fan 4`, and the
   34 px headline number sits unlabelled beside a pill reading `unavailable`. The only surviving
   occurrences are the chart legend and the subtitle's `channel 5 = FAN_HDD`.
2. **GPU and CPU** pass the *chart's* label — `GPU 0 temperature over the selected window` — to
   the Hero, which is a **point reading, not a window**. The same string is already the
   `aria-label` of both `<svg role="img">` mounts and of the `ChartViewToggle`, so if the div's
   label ever were exposed the card would announce it three times, once wrongly.

Worse for the ledger: mutations **G** and **H** (deleting `ariaLabel` from the GPU and COOLING
heroes) go **RED**. The suite is defending an attribute that does nothing, which reads as
coverage. `10e-H*` in step 9's harness covers the hatch/unit/severity behaviour, not this.

Deleting MEMORY's `ariaLabel="memory used"` is **GREEN** (mutation I) — so the three callers are
not even covered consistently.

---

## 10e-A9 — §2.11's throttle budget is measured 1.8× under at the 1280 design target

**Severity: MEDIUM.** `components/panels/gpu-panel.tsx:255-261`,
`components/panels/panel-text.module.css:5-15`, `components/chip.module.css:5-45`.

§2.11 costs *"a notable throttle mask"* at **+24.5 px (19.5 line + gap)** and names the mock's own
state B content: `0x4` + `✕ 0x20 sw thermal slowdown`. Measured with exactly those two chips, the
shipped `.caption` and `.chip[data-size=md][data-code]` rules, in a 285 px GPU column
(`scratchpad/f5b.mjs`):

| column | caption height |
|---|---|
| 285 px (1280 design target) | **44.0** |
| 445 px (≥1600 GPU column) | 17.0 |
| 600 px | 17.0 |

Each `Chip` is `white-space: nowrap` (`chip.module.css:9`), so the two reasons cannot break; they
wrap to two rows below ~400 px, and `.caption`'s `gap: 10px` is a *row* gap as well as a column
gap. 44 vs 24.5 is +19.5 px **per GPU card**, so ~+39 px on a page whose §2.11 worst-plausible
arithmetic lands at 1005 against 1024. A third reason (an unknown bit — `throttle.ts:154`
produces `0x80000000 unknown throttle reason`) takes it to **71 px** at 285 px and makes the
caption itself overflow horizontally below ~245 px.

---

## 10e-A10 — the errors[] wrapping is NOT a Mac-only artefact: this box's own DKMS message costs 65.6 px against a 14.2 px budget

**Severity: MEDIUM.** Answers the handoff's aim 10 and adjudicates build silence #5.

`10e-build.md` §2 argues measurement 9's residual overflow is *"entirely message wrapping, and the
messages that wrap are dev-Mac paths … that the real box does not produce."* The second half is
false. `lib/collectors/safety.ts:186-190` produces, on a real Linux box:

```
/lib/modules/7.0.0-31-generic/updates/dkms: does not exist — DKMS has not built the 5-fan
module for `7.0.0-31-generic`, so the next boot loses `pwm5`
```

That is 152 characters, and it is the box's **documented, expected** failure mode — CLAUDE.md's
*"DKMS only builds for the RUNNING kernel … the next reboot would have landed on a kernel with no
`pwm5`"*. Measured with the shipped `.row`/`.note` rules (`scratchpad/notes.mjs`):

| column | the `.note` alone | the whole SAFETY row |
|---|---|---|
| 285 px (1280) | **65.6** | **98.4** |
| 445 px (≥1600) | 39.4 | 72.2 |

§2.11 budgets **14.2 px** for *"a source's `errors[] `line"* and **45.9 px** for *"a `StatusRow`
with a one-line explanation"*. One real message on one real row is 52.5 px over, at the design
width, on the panel §6.2 calls *"the panel that earns the dashboard's existence"*. The sibling
`checkDkms` message at `safety.ts:167` (*"no directory for the running kernel …"*) is 130
characters and behaves the same.

So spec silence #5 is real and it is not conditioned on the dev Mac. The remaining questions
(does §6.1's promise hold under a degraded page; should `PanelNotes`/`detail` be capped) are
unchanged and still the owner's — recorded, not chosen.

---

## 10e-A11 — the throttle line now paints `0x4 sw power cap` as a green `✓ NORMAL` pill

**Severity: MEDIUM.** `components/panels/gpu-panel.tsx:255-261` vs `HEAD`'s single
`<Row label="throttle" value={…join(', ')} severity={decode.severity} />`.

Before 10e the reasons were one joined string in one row banded by the **worst** severity. 10e
renders one `Chip md code` **per reason, banded by that reason's own `r.severity`** — and
`lib/throttle.ts:163` mints `severity: known.treatment === 'alarm' ? 'alarm' : 'normal'` per bit.
So a mask of `0x24` renders (verified, `scratchpad/degraded.stest.tsx`):

```html
<span data-severity="normal" data-size="md" data-code="true">✓ … 0x4 sw power cap</span>
<span data-severity="alarm"  data-size="md" data-code="true">✕ … 0x20 sw thermal slowdown</span>
```

Three things worth the owner's eye, none of them a literal rule violation:

- This file's own module doc quotes §6.2: *"the normal power cap **is not news** and must not be
  styled as a warning."* It is not styled as a warning; it is styled as a **verdict** — a green
  tick asserting the routine 250 W cap is *healthy*, a band §6.3 never assigns to a throttle bit.
- 10e decided in the same loop that a `normal` **`Meter`** is deliberately **not** green
  (`meter.tsx:27-33`: *"colour is spent almost entirely on state … `normal` and the no-band case
  both draw this same grey"*). The throttle caption is now the one place on the page where a
  `normal` band is painted its status colour.
- The per-bit `normal` is `throttle.ts`'s own construction, not a §6.3 row. Before 10e it was
  invisible (only `decode.severity`, the worst, reached the DOM); 10e made it visible.

---

## 10e-A12 — COOLING's chan table has a fourth column that is dead by construction

**Severity: LOW.** `components/panels/cooling-panel.tsx:91-118, 229-236`,
`components/panels/cooling-panel.module.css:25-32, 60-67`.

`ChanRowSpec.note` exists, `ChanTable` renders `<span className={styles.chanNote}>{row.note ?? ''}</span>`,
`.chan` reserves a fourth `minmax(0, 1fr)` grid track for it, and **all four call sites pass
`note: null`**. The rendered output is four empty spans (confirmed in the degraded render).
Deleting the whole column is invisible to the suite (mutation **J**, GREEN).

`lib/dangling-css-class.test.ts` cannot see it — its own doc says the reverse direction (dead,
unreferenced CSS) is out of scope, and here the class *is* referenced, just never populated. A
full dead-CSS scan of `components/` + `app/` found **no** declared-but-unreferenced class
(`scratchpad/deadcss.mjs`), so this is the only dead surface of its kind, and it is dead by data
rather than by reference.

---

## 10e-A13 — STORAGE reads the FIRST `proc-net-dev` entry, two lines under a ⚠ comment that says LAST

**Severity: LOW.** `components/panels/storage-network-panel.tsx:347-351`.

```ts
// ⚠ LAST, not first — `events.ts` keys a `Map` by source (10b-reconcile, adversarial F10),
// and `collectStorage` concatenates root's and home's `statvfs` entries, so more than one
// entry per source is the ordinary case on this panel rather than a hypothetical.
const linkError = storageErrors.findLast((e) => e.source === 'net-operstate')?.message ?? null;
const netError  = storageErrors.find((e) => e.source === 'proc-net-dev') ?? null;   // FIRST
```

Every sibling in this loop uses `findLast` (`cooling-panel.tsx:148,159`, `safety-panel.tsx:75`,
and `linkError` immediately above). If `collectHost`/`collectStorage` ever file two
`proc-net-dev` entries, the panel shows the first and the event log shows the last — F10's exact
disease. Both directions are green (mutation **AG**), so nothing pins either reading.

---

## 10e-A14 — `10e-GP5` bites on an arithmetic accident, not on the property it names

**Severity: LOW.** `components/panels/gpu-panel.test.tsx:449-463`.

The `⚠ BOTH mounts plot on the fixed 30–90 scale` test asserts, over the `points=` of **both**
mounts:

```ts
expect(y).toBeGreaterThan(0);
expect(y).toBeLessThan(38);
```

`38` is `CHART_SIZE.gpuSparkline.height`. The promoted mount is **50** px with `padT 4 / padB 10`,
so its honest plot range is 4…40. `10e-GP5` (drop `domain` from the promoted mount) bites only
because autoscaling puts the lower point at y = 40, which clears 38 by 2 px. Raise `padB`, lower
`gpuPromoted.height` to 48, or move the baseline, and the mutation stops biting while the defect
is unchanged; conversely a legitimate promoted-geometry change turns the test red for no defect.
The scoped form (each mount checked against its own height, the way the refs/time-label tests in
the same describe are scoped by `data-role`) is what the property actually needs.

---

## 10e-A15 — carried forward, not introduced by 10e

- **The GPU *retired*-card branch renders no `errors[]` at all.** `gpu-panel.tsx:169-172`: with
  `gpus: []` and an `nvidia-smi` entry present, the card renders `card not enumerated` and
  nothing else, while the `gpus: null` branch two lines below maps `errorsForPanel` into
  `.takeoverNote`. Verified by rendering both. The branch is byte-identical to `HEAD`, so this is
  10b's, not 10e's — but it is the handoff's aim-4 S-A case and it answers it: no, the message
  does not appear.
- **The GPU card prints the power pair twice** — `Figure` (`249.8` `W` + `cap 250.0 W`) and the
  power `Meter`'s own head (`249.8 W / 250.0 W`), four numerals for two facts, on a density loop.
  The mock's form, and recorded as such in `gpu-panel.tsx:223-224`; flagged here only because
  §6.5's "one fact, stated once" is the rule the rest of this loop is measured against.
- **A severity-bearing row announces its band twice** (`Chip sm`'s `sr-only` + `Chip md`'s) —
  already recorded by the test phase; confirmed in the rendered markup.
- **`aria-pressed` on the pause button with a label that flips.** `header.tsx:182-184` gives
  `aria-pressed={paused}` *and* `aria-label={paused ? 'Resume polling' : 'Pause polling'}`, so a
  paused control announces "Resume polling, toggle button, **pressed**". The APG's rule is that a
  label naming the *next* action and `aria-pressed` should not be combined. `aria-pressed`
  predates 10e (the visible `▶ resume` was the name before); 10e only moved the name into the
  attribute, so this is inherited. `ChartViewToggle` has the same shape.

---

# What I tried that held

- **`pnpm verify`**: exit 0, 102 files, **2892** tests, no type errors. The test phase's number
  is exact.
- **The four harnesses, run serially in one call, nothing else running.** `04` 94/94 exit 0,
  85 ⚠ checked; `09` **122/122** exit 0, 134 ⚠ checked; `10` **191/191** exit 0, 215 ⚠ checked;
  `02` exit 1 on `02-R20`/`R30`/`R31` **only**, with every 10e mutation in it biting. No
  `DID NOT BITE`, no `ANCHOR AMBIGUOUS`, no other `ANCHOR NOT FOUND`. The tree was clean after
  each (`git status` 81, unchanged).
- **`10e-GP1`..`GP5` each redden a different assertion in the OQ-6 describe** (GP1 two, GP2/GP3/
  GP4/GP5 one each), and `10e-SR3`/`SR4`/`SR5`/`HD2`/`HD3`/`CAP1`/`10b-CO5` each redden the test
  their name points at. Read from the harness RED sets, not assumed.
- **10e §6's 26 rows, the greppable half.** `V100`, `17:00.0`, `GB`, `snapshot`, `model qwen`,
  `since 20`, `Tjmax`, `stalled` — **zero** occurrences in rendered strings anywhere under
  `components/` or `app/`; the only hits are prose in doc comments and the identifier
  `snapshot`. `formatText(gpu?.name)` / `formatText(gpu?.bus)` are untrimmed, confirmed in the
  rendered card (`Tesla PG500-216 · 00000000:17:00.0`).
- **The six-condition banner fits.** Measured with the shipped `.banner`/`.head`/`.rest`/`.item`
  rules at 1280: the sticky band is **78.8 px at one alarm and 108.7 px at two through six** —
  the chips fit on one `.rest` row, so `check-density.mjs`'s `BAND` figure of 108.7 already
  covers §6.4's worst case, not just the two-alarm one.
- **F5's SERVING row does not overflow horizontally.** With a 57-character model alias,
  `ctx 1,048,576`, `health unreachable`, port `65535` and `deactivating` in the pill, the row's
  `scrollWidth` is 283/260/198 in 285/262/200 px columns — inside every one. It costs height
  instead (112.3 px at 285 and 262, 156.3 at 200, for **one** instance, against §2.11's 45.9 for
  a row with a one-line explanation), which is 10e-A10's problem, not a wrap failure.
  `secondaryLabel` / `inline` / `endPrefix` do not collide with the S-G attribution note: `note`
  and `detail` take `flex-basis: 100%` and land on their own lines below, verified in the DOM.
- **Every degraded string lands in the right panel, once.** Rendered State B for GPU (mask
  `0x24` + an `nvidia-smi` entry), COOLING (stale fan5 + the dell-smm message), SAFETY (four
  rows, four different sources), SERVING and STORAGE: SAFETY renders exactly 4 rows and 4 notes,
  no message is duplicated, `dbus` entries carrying an `instance` stay off COOLING and SAFETY,
  and STORAGE's `net-operstate` appears in its caption and *not* in `PanelNotes` while both
  `statvfs` entries and `proc-net-dev` appear there and nowhere else.
- **Invariant 1 through the new leaves.** `readable()` (`lib/format.ts:82`) rejects `null`, `NaN`
  and `±Infinity` and accepts `0`, so `Hero` gets `EM_DASH` for `Infinity`/`NaN` and `'0'` for
  zero; a 5-digit RPM renders `14,451`. Rendered both sides for `Hero` (hatched `.valueUnknown`
  vs `.value`), `Figure` (`—` + `W`, `cap —`), `Strip` (`—` per item), `ChanTable`
  (`—` / `0 RPM`), and `Meter` (`width: 0%`, never `NaN%`). `Hero`'s unit survives beside the
  dash in every case, including MEMORY's composed `GiB used` and CPU's `°C pkg`.
- **`Sparkline`'s degenerate inputs.** Zero points and all-null points both take the
  `data-empty="true"` branch at the caller's own `width`/`height` (so the promoted wrapper still
  paints 50 px); one point anchors at x=0 with a `lone-point` circle; a `domain` with every point
  outside it clamps the y magnitude only and leaves x alone (no Q2-F9 X-drop). No division by
  zero anywhere (`n <= 1` and `flat` are both guarded).
- **No dead CSS.** A full declared-vs-referenced scan of every `*.module.css` under `components/`
  and `app/` found zero classes declared and never reached through `styles.*`. All five
  `CHART_SIZE` keys are consumed. No export outside a prop-interface type is unused.
- **`Row` is production-dead** (test phase's finding, re-confirmed: `<Row` appears only in
  `row.test.tsx`), and `row.module.css` is a stylesheet no page loads. Recorded there, unchanged
  here.
- **No `.sr-only` outside a `.panel`.** The header and the alarm banner render no `Chip`; every
  `.sr-only` in the tree is inside a panel body. (Which is what makes 10e-A1 a single-panel
  problem rather than a page-wide one.)
- **No test consumes entropy or an unpinned clock.** `Math.random`, `performance.now`, bare
  `new Date()` and `crypto.*` appear in none of the 10e-touched test files; the only
  `vi.useFakeTimers()` uses are in `app/dashboard-shell.test.tsx`, each pinned with
  `vi.setSystemTime` and released by the file's `afterEach`.

---

# Not verified, and why

- **Every browser number in `10e-build.md`.** `check-density.mjs`'s ALL PASS, the per-slot
  164.5/216.1/384.5 table, the 263.2 / 227.6 / 283.6 px spare, the painted `[38,0]` → `[0,50]`
  anatomy, and measurement 9's 27/49 px overflow all come from `measure-arrangements.mjs` /
  `measure-breakpoints.mjs`, which cannot start (`next dev` refuses a second server in this
  directory, and :39174/:39175 are the parent's). Only the second build agent has run them; this
  phase could not confirm or refute a single one. **10e-A1 and 10e-A9/A10 all bear on those
  numbers**, and re-running them from a separate worktree — with the log seeded past 15 entries,
  and with a real 150-character `errors[]` message — is the first thing to do at review.
- **Anything requiring the two CSS media queries to actually paint** (§6.1's 1600 px promotion,
  the 4→2→1 column bands). `renderToStaticMarkup` cannot see them and neither can jsdom.
- **The two tool fixes the second build agent made** (`anatomy()`'s svg scan, `check-density`'s
  spare measurement) were read, not executed; both look correct on the diff and both turn a
  previously unsatisfiable check satisfiable.
