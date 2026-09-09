# 10f BUILD — the four rulings. **§6.1's promise now holds on a DEGRADED page, measured.**

**Written by the BUILD phase, 2026-09-09.** Nothing committed. `SPEC.md` and `MOCK.html` untouched.
No guard weakened — `styles.test.ts` gained a rule and `dangling-css-class.test.ts`,
`tocontain-scope.test.ts`, `unit-suffix.test.ts`, `purity.test.ts` and
`cross-harness-ledger.test.ts` are byte-identical to `HEAD`.

---

## 0. The headline, before anything else

| | before (reproduced by this phase) | after |
|---|---|---|
| `measure-breakpoints.mjs` | **10 pass · 2 fail**, exit 1 | **16 pass · 0 fail · 0 blocked · 16 total, exit 0** |
| ↳ measurement 9, dev-Mac fixture (all seven non-GPU collectors failed) | 1280 **over by 27 px** · 1600 **over by 49** · 1920 fits | fits at all three, **140 / 104 / 160 px to spare** |
| ↳ measurement 10 — NEW, the real box's own degraded page | did not exist | fixture-took check PASS; fits at all three, **157 / 122 / 178 px to spare** |
| same page with §6.4's two-alarm banner pinned (`--fixture mac`) | **over by 92 / 115 / 18 px** | **overflow 0 / 0 / 0**, with 74.0 / 38.5 / 94.5 px still to spare |
| `check-density.mjs --fixture box` (healthy) | ALL PASS, spare 263.2 / 227.6 / 283.6 | **ALL PASS, spare 263.2 / 227.6 / 283.6 — identical to the digit** |
| `pnpm verify` | exit 0, 102 files, 2933 tests | **exit 0, 101 files, 2957 tests** |
| nine `regressions.py` harnesses | 8 × exit 0; **`02` exit 1**, ledger never reached | **9 × exit 0**; step 2's ledger runs (below) |

**The healthy page did not move.** Every per-slot height, every painted chart box and every spare
figure `check-density.mjs` reports is unchanged from 10e, to the digit — the bounded wells render
nothing at all when `errors[]` is empty, which is the whole point of `max-height` over `height`.

---

## 1. Q1 — degraded pages fit: every `errors[]` block is a bounded scroll box

### 1.1 What was unbounded, and it was not two things but FIVE

The ruling names `PanelNotes` and a `StatusRow`'s `detail`. The tree had **five** places that
rendered a collector's message straight into the layout, three of them bespoke re-implementations
of `PanelNotes`:

| # | where | what it was | now |
|---|---|---|---|
| 1 | `panel-notes.tsx` `.notes` | the shared block, unbounded | bounded well, per-panel height |
| 2 | `status-row.module.css` `.note` (the class `detail` renders with) | unbounded | bounded well, one line |
| 3 | `gpu-panel.tsx`'s `gpus: null` takeover — `.takeoverNote`, one `<p>` per source | a second, unbounded copy of `PanelNotes` | **`<PanelNotes bound="roomy">`**; `.takeoverNote` deleted |
| 4 | `serving-panel.tsx`'s `serving: null / []` takeover — `.emptyNote` | a third, unbounded copy | **`<PanelNotes bound="roomy">`**; `.emptyNote` deleted |
| 5 | `storage-network-panel.tsx`'s `<Caption>{linkError}</Caption>` | a fourth, unbounded copy — **measured 43 px** (three wrapped lines) on a failed `net-operstate` | **`<PanelNotes>`** (tight — §1.3), in the same position |

Folding 3–5 into the primitive is what makes the ruling hold as the well changes: one bounded shape
in one file, rather than five that have to be kept in step. The handoff's own heading is *"bound
every notes block"*, and §6.1's promise is unconditional on telemetry — a block left unbounded
would break it on a snapshot nobody has drawn yet. **Recorded as a silence (§6, #1): the spec text
names two blocks.**

### 1.2 The shape, and what each declaration is worth

`panel-notes.module.css` `.notes` and `status-row.module.css` `.note`, both:

```
box-sizing: border-box;   /* the max-height is the TOTAL box, padding inside the budget */
position: relative;       /* 10e-A1: a scroller clips an absolutely-positioned descendant only
                             when it is in that descendant's containing-block chain, and every
                             Chip renders a `position: absolute` .sr-only span */
overflow-y: auto;         /* the messages stay WHOLE — §3.7 forbids truncating them */
max-height: <per panel>;  /* the line that bounds the PAGE */
background: var(--surface-sunken);
```

**`max-height`, not `height`** — allowed by the handoff (*"a `max-height` bounds it as well as a
`height` does"*) and better here: a row with one short message must not look boxed, and a fixed
`height` would reserve empty rows under every one-line explanation. Boundedness is proved twice —
by the arithmetic in §1.4 and by the four browser measurements in §0.

**The well is a named, keyboard-reachable `role="group"` with `tabIndex={0}`**, the same shape the
session event log's own bounded well already uses. A scroll box nobody can scroll hides the very
text §3.7 requires beside the alarm, and the DKMS message is five lines in a one-line box.
⚠ `group`, not a bare `aria-label` on a role-less element — 10e-A8's finding. The WATCH-toned
stale age (`.noteWatch`) is deliberately **not** a well: `last read 6:12 ago` is bounded by its own
construction.

### 1.3 The heights, and they are per panel because the spare is not shared evenly

Measured on this build (12 px root, headless Chrome):

| quantity | measured |
|---|---|
| a `PanelNotes` message line | **14.0 px** |
| `.notes` padding (2 top + 2 bottom) | 4 px |
| gap between two messages | 3 px |
| a `StatusRow` `.note` line (10.5 px at `line-height: 1.25`) | **13.1 px** |
| `.row`'s row gap, paid once when the note takes its own line | 6 px |
| a panel body's row gap | 5 px |

So the two `PanelNotes` heights are whole numbers of message lines:

| `bound` | height | shows | where |
|---|---|---|---|
| `tight` (**the default**) | **18 px** = 4 + 14 | one message line | GPU card · CPU · SERVING's per-instance block · STORAGE's LINK block |
| `roomy` | **60 px** = 4 + 4 × 14 | four message lines | COOLING · MEMORY · STORAGE's panel block · GPU takeover · SERVING takeover |

and `StatusRow`'s `.note` is **14 px** — one 13.1 px line with 0.9 px of slack.

⚠ **The default is the SMALLER one.** A call site that forgets the prop is bounded tight; a
forgotten prop must never be the one that breaks the promise.

**Why those panels get those values, and ⚠ the first version of this arithmetic was WRONG.**
§6.1's four rows are `r1 = max(gpu0, gpu1)`, then **rows 2 and 3 SIZE INDEPENDENTLY** —
`row 2 = max(CPU, MEMORY)`, `row 3 = max(SAFETY, STORAGE)`, with COOLING spanning both and
contributing only its own intrinsic height — and `r4 = max(SERVING, LOG)`. This build first
modelled rows 2–3 as two COLUMN sums (`CPU + 9 + SAFETY` against `MEMORY + 9 + STORAGE`), which
gives MEMORY and STORAGE a shared 93.6 px of slack they do not have. The browser said otherwise:
with the link block roomy, STORAGE measured **259.4** against SAFETY's 239.4 at 1280, so STORAGE
set row 3 and the page carried **20 px it did not need**. Verified in both directions —
`row2 + 9 + row3` reproduces the measured COOLING slot to 0.1 px at every viewport, on both
fixtures, and the column model does not.

So the real slack, on the healthy page at 1280 (`check-density.mjs`'s own measured figures):

| cell | healthy | its row | slack before it costs the page |
|---|---|---|---|
| GPU 0 / GPU 1 | 164.5 | row 1 | **0** — either card sets it |
| CPU | 216.1 | row 2 | **0** — CPU sets row 2 |
| MEMORY | 137.8 | row 2 | 78.3 |
| SAFETY | 159.4 | row 3 | **0** — SAFETY sets row 3 |
| STORAGE | 144.1 | row 3 | **15.3** — and 95.3 once SAFETY's own four explanations take it to 239.4 |
| SERVING | 103.8 | row 4 (LOG sets it at 129.8) | 26.0 |
| COOLING intrinsic | 366.3 | spans 2–3 (384.5) | 18.2, and 103 once rows 2–3 grow |

GPU, CPU and SERVING pay 1:1 and take `tight`. MEMORY and COOLING are absorbed and take `roomy`.
**STORAGE is the interesting one: it holds TWO blocks and can afford one of each.** Its ceiling is
whatever SAFETY grows to (239.4 worst case), so 144.1 + 65 + 23 = 232.1 fits and 144.1 + 65 + 65 =
274.1 does not. The panel block — `statvfs` (one entry per mount) plus `proc-net-dev`, up to three
messages — takes `roomy`; the link block, which holds exactly one `net-operstate` message, takes
`tight`. Measured after the change: STORAGE **232.1**, back under SAFETY, at every viewport.

The two takeover branches take `roomy` because neither draws a chart, so both bodies sit far under
the height their own row is set by.

### 1.4 The arithmetic — page growth is bounded at 163 px for ANY telemetry

| term | sum | px |
|---|---|---|
| GPU card notes (row 1, 1:1) | 18 + 5 | **23.0** |
| row 2 = max(CPU 216.1 + 23, MEMORY 137.8 + 65) → CPU governs | 239.1 − 216.1 | **23.0** |
| row 3 = max(SAFETY 159.4 + 4 × (14 + 6), STORAGE 144.1 + 65 + 23) → SAFETY governs | 239.4 − 159.4 | **80.0** |
| → rows 2–3 (487.5 against 384.5; COOLING's worst intrinsic 451.3 stays under) | 23.0 + 80.0 | **103.0** |
| SERVING (two row details 40 + notes 23) over the LOG's 129.8 | 166.8 − 129.8 | **37.0** |
| **page** | 23.0 + 103.0 + 37.0 | **163.0** |

The 80 px SAFETY term is **exactly §2.11's own budget** — *"a `StatusRow` with a one-line
explanation: +19.1 per row … SAFETY, all four rows explained: 160.0 → 236.4"* — and it is measured:
SAFETY went 159.4 healthy → **239.4** degraded, at every viewport, a flat +80.0. That is why the
row well is **one** line and not two: at two it is 132 px and the page no longer fits at 1600×1024.

Against §6.1's spare, with §6.4's banner pinned (banner heights from §2.11: 90.5 px at 1280 where
the chips wrap to two lines, 63.7 at ≥1600, each plus the 9 px band gap):

| viewport | healthy spare | budget, 2-alarm banner | budget, 6-alarm banner | worst case | margin |
|---|---|---|---|---|---|
| 1280 × 1024 | 263.2 | 197.5 | 163.7 | 163.0 | +34.5 / **+0.7** |
| 1600 × 1024 | 227.6 | 161.9 | 154.9 | 163.0 | **−1.1 / −8.1** |
| 1920 × 1080 | 283.6 | 217.9 | 210.9 | 163.0 | +54.9 / +47.9 |

⚠ **1600 × 1024 is the tightest of the three viewports, not 1280**, and §2.11's worst-plausible
arithmetic was only ever done at 1280 (where it lands at 1005 of 1024). At 1600 both promoted
charts are taller, so the healthy spare is 36 px smaller while the degraded growth is identical —
the caps are width-independent by construction. Every case anyone can *measure today* passes with
104–178 px to spare; the **compound** worst case at 1600 — all seven collectors failed **and** both
`llama-server` instances erroring **and** a standing six-alarm banner — lands 1–8 px over.
Recorded as a silence (§6, #4), with the one term that would close or widen it named there.

### 1.5 Measured, before and after — the dev-Mac fixture, per slot

`mocks/measure-arrangements.mjs --fixture mac --only baseline --anatomy`, this phase's own runs:

| slot | 1280 before → after | 1600 before → after | 1920 before → after |
|---|---|---|---|
| gpu0 / gpu1 | 186.8 → 187.2 | 198.4 → 198.8 | 198.4 → 198.8 |
| cooling (stretched = rows 2 + 9 + 3) | 652.1 → **485.2** | 662.9 → **509.2** | 621.6 → **509.2** |
| cpu | 341.5 → **236.8** | 365.5 → **260.8** | 324.3 → **260.8** |
| memory | 171.6 → 172.0 | 171.6 → 172.0 | 157.8 → 158.3 |
| safety | 301.5 → **239.4** | 288.4 → **239.4** | 288.4 → **239.4** |
| storage & network | 288.8 → **232.1** | 274.7 → **232.1** | 233.4 → **223.4** |
| serving | 93.7 → 99.9 | 93.7 → 99.9 | 93.7 → 99.9 |
| session event log | 129.8 → 129.8 | 129.8 → 129.8 | 129.8 → 129.8 |
| **grid** | 1007.7 → **841.3** | 1030.1 → **876.8** | 988.8 → **876.8** |
| **overflow, no banner** | 27 → **0** | 49 → **0** | 0 → 0 |
| **overflow, banner pinned** | 92 → **0** | 115 → **0** | 18 → **0** |
| **spare, banner pinned** | — → **74.0** | — → **38.5** | — → **94.5** |

Per-block, at 1280: CPU's notes **123 px → 18** (four sources, ~8 wrapped lines → one line, scroll);
STORAGE's panel block **92 → 60** and its link block **43 → 18**; the SAFETY rows block **252 →
190** (exactly 4 × 20 over the healthy 110.4); GPU's 17 → 18 and COOLING's 17 → 18 (each already a
single line — the well costs them 1 px of padding). **One slot GREW and it is correct**: SERVING
93.7 → 99.9, because its takeover explanation was a bare `<p>` list and is now a well with padding
and a ground; every one-line block gains the same 1 px for the same reason.

STORAGE's final anatomy at 1280 is the whole design in one line — `[head 25, / 23, /home 23,
**panel notes 60**, strip 15, link caption 19, **link notes 18**]` = 232.1, under SAFETY's 239.4.

### 1.6 The new real-box degraded case — `measure-breakpoints.mjs` measurement 10

10e's build argued the residual overflow away as a dev-Mac artefact (*"the messages that wrap are
dev-Mac paths … that the real box does not produce"*), and 10e-A10 measured that false. Measurement
10 is the case that argument was wrong about, and it is **not** the Mac's: a healthy box
(`CLAUDE.md`'s own figures) on which **DKMS has not built for the running kernel**, which is the
box's documented failure mode — *"DKMS only builds for the RUNNING kernel … the next reboot would
have landed on a kernel with no `pwm5`"*.

Both strings are copied from the collectors that emit them, so a reworded message changes this
fixture rather than leaving it grading something the box no longer says:

- **`lib/collectors/safety.ts:186-190`** →
  ``/lib/modules/7.0.0-31-generic/updates/dkms: does not exist — DKMS has not built the 5-fan module for `7.0.0-31-generic`, so the next boot loses `pwm5` `` — **150 characters** (⚠ 150, not the 152 10e-A10 and the handoff quote — counted from the
  collector's own template; the em dash is one character but three bytes), on SAFETY's `dkms` row
  *and*, via `pwm5Present: false`, its `dell-smm` row.
- **`lib/collectors/cooling.ts:237-240`** →
  ``/sys/class/hwmon/hwmon3: no `pwm5` node — the DKMS 5-fan module did not load, so channel 5 is uncontrollable`` — **two lines** under COOLING.

⚠ It **asserts its own precondition first**: measurement 10's first line checks that the DKMS text
really is under `[data-slot="safety"]` and the `dell-smm` text under `[data-slot="cooling"]`, and
FAILS if not. A fixture that failed to take would otherwise be graded as a healthy page and reported
PASS — the shape 10c-3/A3 found twice in this very file.

Result: **PASS at all three viewports, 157 / 122 / 178 px to spare.**

`recordFit()` was extracted so measurement 10 grades the page with measurement 9's *identical*
primitives rather than a second, agreeing implementation (HANDOVER §0.8). Both now print the
**spare** on PASS as well as FAIL — measured from the CONTENT bottom, never from `scrollHeight`,
which is defined as at least the viewport height and so reads a constant 0 on any page that fits
(the same correction `check-density.mjs` carries).

---

## 2. Q3 — `0x4` beside a notable bit is a neutral, unbanded code chip

`Chip` gains `band?: boolean`, default `true`. `band={false}` drops **all three** carriers of a
band — the `data-severity` attribute the stylesheet colours from, the glyph, and the `sr-only`
word — and keeps everything else: the same `code` pill, the same place, the same text. It takes the
base `.chip[data-size='md']` neutral border and ground.

`gpu-panel.tsx`'s throttle `Caption`:

```tsx
<Chip … code band={r.severity !== 'normal'} label={r.label} />
```

⚠ **`band={false}` is not `severity={null}`, and the difference is the point.** `severity={null}` is
O12's *"this reading has no §6.3 row to band it"*: an em dash on a hatched `--nodata` ground,
announced *"no severity band"* — the vocabulary of a reading that could not be judged. `0x4` was
read, is known, and simply is not a state claim. Asserted as a difference, both renderings, in
`chip.test.tsx`.

`lib/throttle.ts` is **untouched** — presentation only, and `r.severity` is still what decides which
chips are banded. The healthy page is unaffected: the line renders only when
`decodeThrottleMask(...).notable`, and **both sides are tested** — `0x4` alone renders no line at
all (and no `sw power cap` text), `0x4 | 0x20` renders exactly one unbanded chip and exactly one
banded one, scoped to the throttle caption rather than the whole document.

---

## 3. Q12 — the dead `Row` primitive is deleted

`git rm components/row.tsx components/row.module.css components/row.test.tsx`. Grepped first:
`<Row` appears in production **nowhere** — the only two survivors are a historical comment in
`cooling-panel.test.tsx` and a string *fixture* in `unit-suffix.test.ts`.

Step 9's harness: `ROW`/`ROW_SRC` removed, `ROW` dropped from `LEDGER_FILES` and from `09-C2`'s
red-test set, and `09-R1`/`09-R2`/`09-R3`/`10e-R1`/`10e-R2` removed **with the reason in place**.
Each was checked against the surviving component before removal rather than assumed covered:

| retired | where its property lives now |
|---|---|
| `09-R2` (`severity === undefined` must not loosen to `== null`) | `10b-SR2`, step 10 |
| `10e-R1` / `10e-R2` (both directions of the pill branch) | `10e-SR4` / `10e-SR5`, step 10 |
| `09-R1` (the value is never reformatted) | ⚠ **had no equivalent** — the ⚠ test is **ported** to `status-row.test.tsx`, backed by `10f-SR1` |
| `09-R3` (no self-invented §6.5 "already explained" exception) | ⚠ **had no equivalent** — ported, backed by `10f-SR2` |

`09-CS1` — the mutation that proves `styles.test.ts`'s `flex-basis: 100%` rule bites — is
**re-aimed onto `components/panels/status-row.module.css`**, which took `Row`'s shape and all seven
of its shipped call sites in 10e and carries the identical `.row`/`.end` pair. Same two edits, same
guard, same defect. `styles.test.ts`'s non-vacuity anchor moves with it (`row.module.css` →
`panels/status-row.module.css`): the subject moved, the property is identical.

---

## 4. Q13 — `02-R20` / `02-R30` / `02-R31` re-aimed, and step 2's ledger runs again

`formatUptime` gained a `prefix` parameter for §6.4's banner (S-C, 2026-09-08), so its four returns
interpolate `${prefix}` where they used to spell `up`. The three anchors named the old text, matched
nothing, and `main()` returns at the first `ANCHOR NOT FOUND` — so step 2's ledger, **the only owner
of `lib/format.test.ts`**, had not run since.

Each is re-aimed onto the **same property on the same line**; nothing is narrowed, because
`${prefix}` is the only text that moved and no anchor now spans more or less of the function than it
did before:

| id | property | re-aimed anchor |
|---|---|---|
| `02-R20` | the day form loses its `days >= 1` floor | `` if (days >= 1) return `${prefix} ${days} d …` `` |
| `02-R30` | the sub-minute form is deleted — a fresh boot reads `up 0 min` | `` if (total < UPTIME_SUB_MINUTE) return `${prefix} <1 min`; `` (+ newline) |
| `02-R31` | the sub-minute boundary swallows the first whole minute | the same line, `<` → `<=` |

All three bite, on the properties their names record:

```
--- 02-R30 …   exit=1  Tests  6 failed | 301 passed (307)  red=6
--- 02-R31 …   exit=1  Tests  1 failed | 306 passed (307)  red=1
      FAIL  lib/format.test.ts > uptime — §3.2 s four forms > exactly one minute is a
            minute count, not the sub-minute form → 60
--- 02-R20 …   exit=1  Tests 14 failed | 293 passed (307)  red=14
```

**Step 2's ledger output, run for the first time since `formatUptime` changed:**

```
Red-test ledger: 272 distinct failing tests across 60 mutations; 22 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 60 regressions failed their check, as they must.
```

**22 ⚠ marks checked** — the figure 10e's test phase measured diagnostically with the three
excluded, so the coverage it predicted is real; and 272 red tests across all **60** mutations
against the diagnostic's 261 across 57.

---

## 5. The harnesses, and `pnpm verify`

All nine run **serially in one foreground call**, on the tree this file describes. Each figure is
that harness's own printed `All N regressions failed their check` / `Red-test ledger` line, never
carried forward.

⚠ **Step 10's was then re-run alone**, after §1.3's row model was corrected and STORAGE's link
block went from `roomy` to the tight default. It is the only harness whose `LEDGER_FILES` that
change touches (`storage-network-panel.test.tsx`), established by grepping every
`pipeline/steps/*/regressions.py` for the two files edited — step 9's mutations reach neither.
Its figures below are that re-run's, and they are identical to the nine-harness pass.

| harness | mutations | red-test ledger | result |
|---|---:|---|---|
| `02-format-severity` | **60** | **272 red across 60; 22 ⚠ checked** | ⚠ **exit 0 — its ledger runs for the first time since `formatUptime` changed** (was exit 1 at `ANCHOR NOT FOUND`, ledger never reached) |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | exit 0 |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | exit 0 |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | exit 0 |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | exit 0 |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | exit 0 |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | exit 0 |
| `09-ui-primitives` | **128** (was 127: −5 `Row`, +6 `10f-`) | 184 red across 128; **135 ⚠ checked** | exit 0 |
| `10-panels-assembly` | **230** (was 212: +18 `10f-`) | 271 red across 230; **248 ⚠ checked** | exit 0 |

**1080 mutations across the nine — zero cross-harness id collisions, zero ANCHOR NOT FOUND, zero
ANCHOR AMBIGUOUS, zero DID NOT BITE.** Both totals re-derived by importing each `regressions.py`
rather than counted by `grep`; every anchor was additionally checked to occur **exactly once** in
the file it names, in all nine harnesses.

**`pnpm verify` (cold): exit 0 — 101 test files, 2957 tests, no type errors.** 102/2933 before; the
file count drops by one with `row.test.tsx` and the test count rises by 24.

**Tree hygiene:** `git status` shows only the intended changes — no stranded mutation. Nothing
listening on :39173 / :39174 / :39175, no `next dev` process left, no `.env` written, and
`next-env.d.ts` and `AGENTS.md` are byte-identical to `HEAD`.

---

## 6. Spec silences — recorded, not chosen (invariant 7)

1. ⚠ **The ruling names two blocks; the tree had five.** §6.1's ⚠ paragraph says *"`PanelNotes`,
   and a `StatusRow`'s `detail`"*. Three more places rendered a collector's message straight into
   the layout (§1.1), each a bespoke copy of `PanelNotes`. All three were folded into the
   primitive, which is what the handoff's own heading asks (*"bound every notes block"*) and what
   §6.1's *"unconditional on telemetry"* requires — but the spec text does not enumerate them, so
   the widening is recorded rather than assumed.
2. **The accessible NAME of a bounded well is invented copy.** The spec says nothing.
   `PanelNotes` announces `aria-label="collector messages"`; a row's well announces
   `` `${label} explanation` ``. Neither is a *message* (§3.7's rule is about the message text,
   which is still the collector's own and is never rewritten) — they are region names, and a
   scrollable region needs one. If the owner wants different words, they are two string literals.
3. **`max-height`, not `height`.** The ruling says *"fixed-height scroll box"*; the handoff
   explicitly permits a `max-height` *"but then prove the page height is bounded"*. Proved twice —
   §1.4's arithmetic and §0's four measurements. The reason to prefer it: a row carrying one short
   message must not look boxed, and a fixed `height` reserves empty rows under every one-line
   explanation on the page.
4. ⚠ **The compound worst case at 1600 × 1024 is 1–8 px over, and 1600 is the tightest viewport.**
   §1.4's table. It needs all seven collectors failed **and** both `llama-server` instances
   erroring **and** a standing six-alarm banner, simultaneously. Every measurable case passes with
   101–178 px to spare. Two levers exist and neither is this loop's: SERVING's 37 px term (its
   two per-row explanations plus its unattributed block, against 26 px of slack under the session
   log), and SAFETY's 80 px (four rows × one line, which is §2.11's own budget exactly).
5. ⚠ **`10e-Q2` is now the only UNBOUNDED term left on the page, and that sharpens it.**
   ⚠ **FALSE AS WRITTEN — corrected in place by the RECONCILE phase, 2026-09-09 (`10f-A1`,
   `10f-A2`, ACCEPTED, both measured).** Three terms are unbounded, not one. (a) A chart's
   **table view** is bounded only per component, at `--table-scroll-max: 40vh`, and **five are
   reachable at once** (GPU 0, GPU 1, COOLING, CPU ×2) — one click each, no telemetry needed:
   measured **+851 / +851 / +862 px** of page overflow on the HEALTHY page with all of them
   open, and +371.1 px from GPU 0's alone against 263.2 px of healthy spare at 1280. (b) §6.4's
   **alarm banner** has no cap in `lib/client/banner.ts` and no `max-height` in its stylesheet:
   measured 65.7 px at two alarms, **146.2** at twelve and **173.1** at nineteen (1280). (c)
   `10e-Q2`'s throttle line, as this paragraph says. Neither (a) nor (b) is 10f's to close —
   both are §6.1/§6.2/§6.4 wording — and both are now owner questions `10f-Q1` and `10f-Q2` in
   HANDOVER §8, with the numbers. The sentence stands only as *"the only unbounded term the Q1
   ruling reached"*, which is not what it says.
 A notable
   throttle mask costs **+44 px per GPU card** at 1280 (measured, 10e-A9) and Q3 does not change
   its height — a neutral chip is the same box as a banded one. Add it to §1.4's 163 and the worst
   case is 207, which exceeds the budget at *every* viewport with a banner pinned. So Q2 is not a
   budget overrun to be absorbed; it is the last block the ruling did not reach. Still the owner's.
6. **`.noteWatch` is deliberately left unbounded.** S-B's `last read 6:12 ago` is bounded by its
   own construction, and a well round a fixed-width age reading is chrome spent on nothing. It is
   also the only note class the ruling's reasoning does not reach: it is not an `errors[]`
   explanation. Asserted as a difference, both directions.

---

## 7. Files changed

### Source (11 files)

| file | change |
|---|---|
| `components/chip.tsx` | **Q3** — `band?: boolean` (default `true`); `false` drops `data-severity`, the glyph and the `sr-only` word. Module doc records why it is not `severity={null}` |
| `components/panels/panel-notes.tsx` | **Q1** — `bound?: 'tight' \| 'roomy'` (default `tight`), `data-bound`, and the well's `role="group"` / `tabIndex` / `aria-label` |
| `components/panels/panel-notes.module.css` | **Q1** — the bounded well; `tight` 18px, `roomy` 60px |
| `components/panels/status-row.module.css` | **Q1** — `.note` becomes the same well at 14px (one line); `.noteWatch` deliberately not. Header rewritten for `Row`'s deletion |
| `components/panels/status-row.tsx` | **Q1** — the muted `note` and `detail` render inside a named, reachable well. Module doc rewritten: this is the only row now |
| `components/panels/gpu-panel.tsx` | **Q3** — `band={r.severity !== 'normal'}` on the throttle chips. **Q1** — the `gpus: null` takeover renders `PanelNotes bound="roomy"` |
| `components/panels/gpu-panel.module.css` | `.takeoverNote` deleted (dead) |
| `components/panels/serving-panel.tsx` | **Q1** — the `serving: null / []` takeover renders `PanelNotes bound="roomy"` |
| `components/panels/serving-panel.module.css` | `.emptyNote` deleted (dead) |
| `components/panels/storage-network-panel.tsx` | **Q1** — `linkError` is an entry, not a string, and renders through `PanelNotes` in the same position; the panel block takes `bound="roomy"`, the link block the tight default (§1.3) |
| `components/panels/cooling-panel.tsx` · `memory-panel.tsx` | **Q1** — `bound="roomy"` |

### Deleted (Q12, 3 files)

`components/row.tsx` · `components/row.module.css` · `components/row.test.tsx`

### Tests (8 files, none weakened)

| file | change |
|---|---|
| `components/styles.test.ts` | **new directory-wide rule**: a scrolling box must also be a BOUNDED box, with its own both-directions fixture test. The scrolling-pane non-vacuity list grows 3 → 5; the `flex-basis` non-vacuity anchor moves to `panels/status-row.module.css` (Q12) |
| `components/chip.test.tsx` | Q3: the default bands; `band={false}` drops all three carriers; unbanded ≠ `severity={null}` |
| `components/panels/panel-notes.test.tsx` | Q1: the well is named and reachable; `bound` defaults TIGHT; the CSS text of both heights |
| `components/panels/status-row.test.tsx` | Q1: the detail well is named and reachable, the watch note is not, the CSS text; the two ⚠ properties PORTED from `row.test.tsx` (Q12); one regex re-aimed for the new attributes |
| `components/panels/gpu-panel.test.tsx` | Q3 both sides (neutral `0x4` beside a banded `0x20`; `0x4` alone still draws no line); Q1's takeover well |
| `components/panels/serving-panel.test.tsx` · `storage-network-panel.test.tsx` · `memory-panel.test.tsx` · `cooling-panel.test.tsx` | Q1: each panel's `bound` wiring, and STORAGE's link explanation (which nothing had a mutation for at all) |

### Harnesses (3 files)

| file | change |
|---|---|
| `pipeline/steps/02-format-severity/regressions.py` | **Q13** — `02-R20`/`R30`/`R31` re-aimed onto `${prefix}`; 60 mutations, unchanged count |
| `pipeline/steps/09-ui-primitives/regressions.py` | **Q12** — `ROW`/`ROW_SRC` removed, 5 mutations retired with the reason in place, `09-C2` and `09-CS1` re-aimed, `09-PU1`/`PU2` re-aimed for `Chip`'s new signature; **+6** `10f-` (`C2`–`C4`, `CS4`–`CS6`) → **128** |
| `pipeline/steps/10-panels-assembly/regressions.py` | 6 anchors re-aimed (`10b-SR1`/`SR3`/`SG7`/`CO5`/`MP5`, `10e-CO1`/`GP6`); **+18** `10f-` → **230**; `10f-` added to the id-prefix guard |

### Measurement (1 file)

`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` — `recordFit()` extracted so 9 and 10
share one derivation; the real-box degraded fixture and **measurement 10** (12 → 16 measurements);
`spare` reported on PASS as well as FAIL, measured from the content bottom.


---

## 8. What a reviewer should check first

1. **§1.3's row model, which this build got wrong the first time and the browser corrected** —
   rows 2 and 3 size INDEPENDENTLY, so STORAGE's slack is SAFETY's height and not a shared
   column's. That is what makes STORAGE's link block tight, and it is worth 20 px at 1280. Then
   §1.4's arithmetic against §1.3's measured constants: `18 = 4 + 14`, `60 = 4 + 4 × 14`,
   `14 ≈ 13.1 + slack`. The 80.0 px SAFETY term is independently confirmed (159.4 → 239.4, flat
   at every viewport).
2. **Silence #4** — the one place the promise is not unconditional in arithmetic, only in every
   case that can be measured.
3. **The five retirements in step 9's harness (§3)** — a retirement that quietly drops a property
   is what the rule exists to prevent; two of the five had no equivalent and were ported rather
   than deleted.
4. **`10f-PN3`** — that `bound` defaults to the SMALLER height. A forgotten prop must fail safe.
