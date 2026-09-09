# ANCHOR — resume point for the ai-server dashboard build

**Written 2026-09-07 by the session that ran steps 1–8, and updated when step 8 closed. It is
the only inheritance: the next session has no memory of that conversation.** Read this file,
then `PLAN.md`, then `HANDOVER.md`, then `SPEC.md`. Everything below is fact unless marked
otherwise.

---

## 1. What this project is

A read-only web dashboard for `ai-server` (the Dell Precision 5820 documented in the repo
root `CLAUDE.md`), showing GPUs, host, cooling, inference endpoints, disk/network and a
SAFETY panel of things that fail silently on that box.

| Artefact | Role |
|---|---|
| `dashboard/SPEC.md` | **1290 lines. Authoritative.** Every decision, with reasoning. Cite section numbers |
| `dashboard/MOCK.html` | Visual reference, four states. **A reference, never a source.** Do not import from it |
| `dashboard/pipeline/PLAN.md` | The 12 steps, the four-phase protocol, the **seven global invariants** |
| `dashboard/pipeline/HANDOVER.md` | Rewritten by each reconciliation. **The authoritative list of open obligations** |
| `dashboard/pipeline/steps/NN-*/` | `build.md`, `adversarial.md`, `review.md`, `reconciliation.md`, `regressions.py` per step |

The spec was hardened by the build itself: **roughly 100 defects were found in it** by the
adversarial and review phases and fixed before they became wrong code. Several were serious
(a dead GPU fan rendering green; the header going green while a card sits at 90 °C).

---

## 2. State — READ THIS FIRST. Written 2026-09-09 by the session that ran Q1–Q3, 10a–10c, 10d and 10e; it is the only inheritance.

### 2.0 ⚠ The one-paragraph version

**Step 10 is built and committed but does not meet §6.1's only quantitative promise** — the page
overflows the fold by 356 / 418 / 362 px at 1280×1024 / 1600×1024 / 1920×1080 with healthy
telemetry. **The cause is NOT the grid.** `MOCK.html` — the §8.2 design, which the owner calls
"super cool" and wants adapted — uses the **same four-row, nine-panel grid** and **fits at every
one of those viewports** (measured 2026-09-09: ~19 / ~90 / **~159 px to spare**). The built panels
are simply **1.8–2.4× taller than the design** (GPU 485 vs 220, COOLING 868 vs 472, CPU 458 vs
204 …). **The work is to bring the implementation to the mock's density; the grid, the shape and
all nine panels stay exactly as §6.1 draws them.** A builder spec for that is 10e
(`steps/10-panels-assembly/10e-match-the-mock.md`) — see §2.3 for its status.

### 2.1 Branches and tree

```
main                 3f06e98   [origin/main]                 backend, pushed. Untouched since
dashboard-frontend   7de7dd3   [origin/dashboard-frontend]   pushed; 10c-3 is the last commit
```

**Uncommitted, and meant to be committed together as "the design record" once 10e lands:**
`steps/10-panels-assembly/10d-layout-replan.md` + `mocks/` (15 mocks, harness, screenshots),
`mocks/measure-mock.mjs`, `handoffs/10d-layout-replan.md`, `handoffs/10e-match-the-mock.md`,
`steps/10-panels-assembly/10e-match-the-mock.md` (when written), and this file. Nothing under
`components/`, `app/`, `lib/` or `SPEC.md` is dirty — **verify with `git status` before trusting
that**; a stranded harness mutation looks exactly like an intended edit.

### 2.2 What is closed

| loop | commit | what it was |
|---|---|---|
| Q1 | `62dcbdf` | the ⚠-scanner could not see multi-line `test.each`; 39 marks were invisible |
| Q3 | `80e7211` | mutation ids carry their creating step (`07-R3`, `Q1-SC1`) |
| Q2 + S1/S2 | `ac9eee1`, `88bb2e9` | hover layer + table view; owner rulings |
| 10a | `b4ffa3e` | the shell; the green criterion had not tested itself |
| 10a-F17 | `3c37107` | `pnpm verify` made deterministic (fake timers; `deadline.ts` untouched) |
| 10b + S-F + S-G | `bdc1c5c`, `da78491`, `be53c8d` | nine panels; invariant-1 coverage was illusory; `errors[].instance` |
| 10c-1 | `a0c2c0e` | panels wired — the first composed render; a fixture that could not tell two GPUs apart |
| 10c-2 | `6c2e64a` | five guards; one of them punished the fix |
| 10c-3 | `7de7dd3` | sizing/paint; **§6.1 measured false** — step 10 closed-with-a-known-failure |

Suite at `7de7dd3`: **99 files · 2793 tests · exit 0**; nine harnesses, ~947 mutations, every ledger clean.

### 2.3 ⚠ 10d and 10e — the design investigation, and what was withdrawn

**10d** (uncommitted, keep as a record): a layout re-plan that measured three re-arrangements and
recommended "arrangement B" (COOLING in its own column, SERVING + the event log in a closed
`<details>`). **Its recommendation is WITHDRAWN** — the owner rejected the shape, and the mock
measurement above proves the shape was never the problem. **What survives from 10d:** the measured
overflow numbers; ~200 px of the earlier 560 was this GPU-less Mac's `errors[]` notes; and two
**shipped defects it found by measuring**: **F1** — the session event log grows the *page* through
its clipped scroll box because `Chip`'s absolute `.sr-only` spans escape (fix: `position: relative`
on `.panel`); **F5** — SERVING's instance row overflows horizontally below ~450 px (fix: let
`status-row`'s `.value` wrap). **The owner ruled: fix both.**

**10e** = the builder spec to match the mock's density. Status at the time of writing: **PENDING —
see the line immediately below, which the parent updates when the agent reports.**

> **10e status: DONE, 2026-09-09.** `steps/10-panels-assembly/10e-match-the-mock.md` (957 lines:
> one-screen summary, the nine parts, method) plus two scripts under `mocks/`:
> `measure-mock-anatomy.mjs` (per-element anatomy of the mock at all three viewports, healthy /
> paused / six-alarm; its totals match §2.0's table to the pixel) and **`check-density.mjs`, the
> acceptance checker** — it grades a `measure-arrangements.mjs --anatomy` JSON of the *real app*
> against the spec's targets (±10 %), page fit, ≥200 px spare, banner fit and painted chart boxes.
> Run on today's build it reports **31 FAIL**, so it discriminates; with the owner-question rows
> accepted it reproduces the mock's own totals exactly, so its arithmetic is validated.
>
> **The finding, sharper than §2.0:** the overflow is a **16 px `em` base with one-reading-per-24 px
> body lines** — not the charts and not the grid. Spec-only targets at 1920 (healthy): GPU **176**
> (built 458) · COOLING intrinsic **366** (750) · CPU 185 · MEMORY 138.5 · SAFETY 160 · STORAGE 145
> · SERVING 104 · LOG 133.8. Page **757 / 768 / 768** at the three viewports → **267 / 256 / 312 px
> spare**, and **a six-alarm banner fits at 1280×1024** even with every owner question accepted.
>
> ⚠ **Two corrections to the parent's framing, both right:** (1) **SAFETY's mock height (259)
> contains 99 px of prose §3.7 forbids** — the mock's per-row notes are written copy, not
> `errors[]` text — so "±10 % of the mock" is the wrong acceptance there; §8 of the spec sets
> acceptance against the **spec-only** targets, and the checker encodes that. (2) **The ≥1600
> promotion is the mock's 50 px sparkline with a time axis and threshold lines, not a 160 px second
> chart.** The spec keeps the media-query two-wrapper mechanism (over a shell-computed `matchMedia`
> prop; reasons in its §3.2) and gives `Sparkline` three optional props (`domain`, `refs`,
> `timeLabels`). It also **removes the CPU temperature sparkline** — §6.2 attaches the trace to
> utilisation — pending OQ-7.
>
> **Eight owner questions (spec §9), to be put as a selectable list:** OQ-1 a min/max/now caption
> under traces (+19 px each) · OQ-2 per-panel note footers (+37.6 each; needs a text source) · OQ-3
> count chips (`1 of 4 failing`, `2 of 2 up`) · OQ-4 the log's head chip (`—` vs `10 s debounce`)
> · OQ-5 a paused banner (mapped in §5, gated) · OQ-6 the `engage 55` / `EC auto 2210` reference
> lines (constants the dashboard never reads; 70/80 are §6.3's and are drawn) · OQ-7 confirm the CPU
> temp-trace removal · OQ-8 the `standing` pill's form for §6.4.
>
> **Beyond CSS, the builder will touch:** `lib/format.ts` `parts` variants (O14) so heroes size the
> unit without splitting a string; `lib/severity.ts` exporting the 70/80 literals (bare literals at
> lines 125/127 today); a `PanelShell` `headControl` prop (the table toggle moves into the head at
> 0 px); new leaves `hero.tsx` / `strip.tsx`; `Meter` `tickPercent`; `Chip` `code` variant;
> `header.test.tsx` lines 69/70/75 move from visible words to accessible names. **F1 and F5 are
> concrete edits in its §7.** Nothing under `components/`, `app/`, `lib/` or `SPEC.md` was changed
> by 10e — it is a spec.

### 2.4 Rulings that STAND (do not re-ask)

- **Fix §6.1 before step 11.** Packaging waits for a page that meets its own spec.
- **Keep the 1280×1024 promise** — the wall is not assumed to be 1920-only.
- **Fix F1 and F5 both**, now.
- ⚠ **`MOCK.html` is the source for FORM only** — density, anatomy, type scale, spacing, chart
  sizes. **Data, strings and rules come from `SPEC.md`; where they disagree the spec wins.** Owner's
  words: *"the mock is a mock; the data predates the mock is a rule — if the mock says V100 but the
  data says PG500-216 then it is PG500-216."* So the raw driver name, full bus id, `GiB`, invariant
  1, the throttle rules and every S-* ruling stand exactly as built. (Also in §9.)
- The four 10a spec rulings (S-A `● no readings`, S-B `last read 6:12 ago`, S-C elapsed `for 2 d
  06:00`, S-D invariant 1 governs) and the four 10b ones (S-E `card not enumerated`, S-F never green
  over an em dash, S-G `errors[].instance`, S-H one message per source) are all in `SPEC.md`.

### 2.5 Rulings that are SUPERSEDED by the mock finding (do not implement)

The owner answered seven 10d questions before the mock was measured. **These no longer apply**:
the `<summary>` disclosure and moving SERVING/the log off the wall (10d Q2, Q4); one chart width
"400 everywhere" and `plotHeight` 100 (Q5, Q6 — sizes now come from the mock: sparkline **38 px,
50 at ≥1600**; COOLING pair **84 + 10 + 46 + 14 = 160 px**); and **stage 2 "bound the grid"** (Q3)
is **deferred, not ruled out** — re-evaluate only *after* the density fix is measured, since the
mock's own numbers say it may be unnecessary in the healthy state.

### 2.6 ⚠ What to do next, in order

1. **Read 10e's spec** (`steps/10-panels-assembly/10e-match-the-mock.md`) and its owner questions.
   ⚠ One question to expect: **even the mock overflows at 1280×1024 (~166 px) and 1600×1024 (~52 px)
   under a six-alarm banner** and holds only at 1920. Whether §6.1's promise is conditioned on
   "no banner pinned" is the owner's — bring it with the rest.
2. **Put the owner questions to the owner as a selectable list** (the owner prefers that form).
3. **The parent rewrites `SPEC.md` §6.1** — keep the drawing and the four breakpoints; replace the
   unmeasured "~1026px … fits comfortably" sentence with the mock's measured numbers; state that
   `MOCK.html` is the source for form; record the banner ruling. **Phases never edit `SPEC.md`.**
4. **Run the density build as a full loop** — build → test → adversarial → reconcile (background
   agent) → **parent review** (§8: re-run `pnpm verify` yourself, read every rejection and deferral,
   spot-check headline claims against the tree, then commit). Expect the adversarial to find things;
   every loop this session has.
5. **Measure the real app** with `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`
   (measurement 9 is the scroll check; the script must exit 0). Then rule on stage 2 with real numbers.
6. Then **step 11** (packaging), then **redeploy the box** (owner ruled: at step 10 complete; it
   still serves `b3969cd`).

### 2.7 Owner questions still open, carried from earlier loops

S-G-Q1…Q4 (`HANDOVER.md` §8), F14a (a `:—` copy nit), D1 (the log's third feed), 10b-S-F's "its own
readings" definition (recorded, not questioned), and whether §6.1 is banner-conditioned (new).

### 2.8 Things this session learned that the next one must not re-learn

All recorded in §8/§9 — the short list: **the parent reviews every reconciliation** (a fifth phase);
**a `pgrep` wait loop in the same `bash -c` that ran the harness deadlocks** — do not wait, run
harnesses sequentially in the foreground; **`grep -c "while pgrep"` self-matches** — use a bracket
pattern; **a heredoc written to a relative path from the wrong cwd fails silently while the trailing
`echo` prints "written"** — `ls` the file; **`pgrep -f chrome` matches the user's own browser** —
never kill what you did not launch; **the handover was stale in the dangerous direction once**
(it said F17 was open a day after it was fixed) — check `git log` before re-owning an item.

## 3. Toolchain

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
```

- **The `nvm` path must come first.** `$HOME/.local/bin/node` is a symlink to
  `~/.hermes/node` (**v26.8.1**) and shadows the pin. The image ships `node:24-slim` and
  `.nvmrc` pins 24; testing on 26 is the skew step 1 removed and step 4 found reintroduced.
- `~/.local/bin` is still needed — `pnpm` (12.3.4) lives there, activated via
  `corepack enable --install-directory ~/.local/bin`.
- Dependencies: **`next`, `react`, `react-dom` only**, plus five dev. No native modules. Auth
  uses Node's built-in `scrypt` precisely to keep it that way.

---

## 4. What "green" means, and how to verify integrity

**Green is `pnpm verify` exiting 0. Never a printed summary.** Three separate failure shapes
were found where the counters read clean on a failing run — including one where a
non-compiling test file silently drops its tests from the total. `verify` is
`tsc --noEmit && vitest run` and now runs **cold** (it clears `tsconfig.tsbuildinfo` first,
after a false *pass* was observed on a tree with a real `TS2305`).

### Integrity procedure

**`git status` now works** — the tree is committed (`71a2f7d`), so a stranded mutation from a
killed harness shows as a modified file. That is the primary check; use `git diff --stat`.
Before the commit it did not work, because an untracked `dashboard/` collapses to `?? ./`,
and the phases used an md5 manifest instead. That manifest form still works and is what the
step-8 progress brief references:

```bash
find lib app proxy.ts -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | xargs md5 > /tmp/manifest.before
# ... run phase ...
find lib app proxy.ts -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | xargs md5 | diff - /tmp/manifest.before
```

**Never run `pnpm verify` concurrently with a `regressions.py` harness.** It produces a
plausible false `TS6133` and a ledger that falsely reports ⚠ tests as uncovered. Run serially.

---

## 5. The process

Each step runs **build → adversarial → review → reconciliation**, each phase a **fresh agent
with clean context**, receiving only `PLAN.md`, `SPEC.md`, `HANDOVER.md`, and the earlier
phases' notes for that step.

- **build** implements and writes tests. **adversarial** tries to break it and fixes nothing.
- **review** reads the build *and* the adversarial findings, adjudicates each
  UPHELD/OVERSTATED/REJECTED, and adds its own. **reconciliation** applies what survived,
  rejects the rest with reasons, re-runs everything, rewrites `HANDOVER.md`.
- **The parent (you) owns `SPEC.md`.** Phases record gaps; they never edit the spec. Apply
  accepted wording yourself, then tell the next phase the spec changed.
- A later phase overriding an earlier one **on measurement** is normal and has happened four
  times, including reconciliation correctly overruling its own review.

### The seven invariants (full text in `PLAN.md`)

1. **`null` is not `0`.** `null` renders `—`; zero renders the numeral with its unit.
2. **Read-only.** Nothing writes to the server, ever.
3. **`ENODATA` from `pwm5` means "EC auto", which is HEALTHY.**
4. **`fanN_input` is the only trustworthy fan telemetry** — `pwmN_enable` lies, `fanN_target` clamps.
5. **A failed reading is a partial snapshot plus an `errors[]` entry — never a 500.**
6. **Node 24, TypeScript strict, pnpm, Vitest.** No dependency without recorded reason.
7. **If the spec is silent, STOP and record it.** Do not invent. This is how ~100 gaps were found.

### Structural rules the pipeline learned the hard way

- **Every boundary guard needs a fixture on both sides.** Three steps shipped a guard tested
  in one direction only.
- **Mark load-bearing tests `⚠` and run the red-test ledger** — it records which tests go red
  per mutation and fails if a ⚠ test never reddens. It has found inert tests in every step.
- **A mutation that reddens probabilistically is worse than none** — the ledger cannot tell it
  from a sound one.
- **A test may consume entropy only for an assertion that holds for every value it could
  draw.** A 1-in-16 flake shipped this way.
- **Every `catch` added for a "never throw" rule removes a distinction.** Assert what was
  *written*, not what was *returned*.
- **Guards over globals** (`setInterval`, `fetch`, `document`) are not soundly fixable by
  source text; pair them with a behavioural test. The runtime globals guard also **voids
  itself under `isolate: false`** — which Vitest's own reporter recommends on every run.
- **A test that names a property it does not check has appeared in every single step.** Read
  each test name against its body.

---

## 6. Module map (`dashboard/`)

```
lib/types.ts            the §4 contract; every reading `T | null`; branded units
lib/format.ts           §6.6 formatters        lib/severity.ts   §6.3 bands
lib/throttle.ts         §3.7 mask decoder      lib/conditions.ts §6.4 observePoll (debounce+ledger)
lib/fixtures.ts  lib/units.ts  lib/source-text.ts  lib/guardrails.test.ts
lib/collectors/         io, deadline, numbers, proc, nvidia-smi, deltas, hwmon, dell-smm,
                        cooling, dbus-wire, dbus, llama, http, statvfs, safety-checks,
                        serving, storage, safety, collect, result, errors
lib/telemetry/          cache, gate, ceiling, source, snapshot, handler
lib/auth/               scrypt, base64url, config, cookie, session, revocations,
                        rate-limit, authorize, handler, login-view
lib/client/             prefs, wire, ring, series, backoff, observations, events, env,
                        runtime, use-telemetry, fake-env
app/                    api/telemetry, api/session, login/, layout.tsx, page.tsx
proxy.ts                the auth gate — Next 16 renamed `middleware.ts`; the old name NEVER RUNS
```

---

## 7. Where the open work is recorded

**`HANDOVER.md` is authoritative** for open obligations (`O*`) — it is rewritten each
reconciliation and has been found stale in the *safe* direction three times (entries already
answered by the spec). **Re-check every entry against `SPEC.md` before trusting it.**

Also mine: each step's `review.md` §DEFER table (names an owning step) and each
`reconciliation.md` "new spec gaps for you" section.

⚠ **Beware the id namespaces, and the warning that used to sit here understated the problem.**
It said *"the `S*` namespace is polluted: some `S`-prefixed ids in steps 3–5 are harness mutation
ids, not gaps."* Widened 2026-09-07 by Q1's reconciliation (adversarial F5): the pollution is
**not confined to `S` and not confined to steps 3–5**. `S11/G5` is one open obligation, cited in
this file, `HANDOVER.md`, `WORK-ITEMS.md` and `UI-BACKEND-GAPS.md` — and step 7's harness holds a
mutation id for `S11` *and* one for `G5`. `S12` is both a step-3/5/8 mutation id and a step-5 gap
id. Q1 renamed the one it created (`S11` → `SC1`) and left `G5` alone, because step 7's own notes
cite it. **A grep for an id can land in a harness; read what you hit.** The cheap fix — a
reserved prefix for mutation ids, which are already per-harness scoped — is recorded for the
owner in Q1's `reconciliation.md` §7 and not taken.

A cached extract of the DEFER tables for steps 1–7 may still exist at
`/private/tmp/claude-501/.../scratchpad/defers.md`; regenerate it if not.

### ⚠ S49–S53 are CLOSED — the owner ruled on all five and `SPEC.md` was edited

That was the first time the spec had ever been changed in this project. **`SPEC.md` is no
longer frozen**: the owner delegates wording, and ten edits are logged in
`pipeline/WORK-ITEMS.md` §9. So when the spec is silent, invariant 7 still says STOP and
record — but the recording now has somewhere to go, and the owner answers.

The amendments worth knowing before touching the UI: §6.7's 600-point budget is **per
series**; a stale row's clock is the **browser's** and its value is the **last reading**;
§6.2 gained a panel-head convention (`title · subtitle · chip`), an exhaustive header list, the
GPU↔instance join, and — added late, after step 9's primitives were already built — **a hover
layer and a table view as accepted defaults** (the owner's ruling: *do not fight `dataviz` to
strip its defaults; amend the spec instead*). That last one is why Q2 exists.

**Deferred work items with owning steps** (from step 8's §9.4 list):

- **Backend, still open:** **D8** `STANDING` env plumbing → step 11, verified step 12. ⚠ That is
  now the *only* backend item here — the **red-test ledger retrofit for step 3's harness** was
  listed beside it as "still has none, folded into Q1" and **that was wrong: it was done during
  step 8.** Q1's build phase confirmed it (`LEDGER_FILES` at line 71, a wired-up coverage check,
  a comment at line 43 saying so) and Q1's reconciliation re-ran it clean — 72 mutations, 24 ⚠
  marks, exit 0. Corrected 2026-09-07; also corrected in `WORK-ITEMS.md` §2 (A6) and
  `HANDOVER.md`.
- **Closed 2026-09-07:** ~~O19~~ (GB→GiB, a §4 wire change), ~~D4~~ `errorsForPanel`,
  ~~D5~~ `traceFor`, ~~A6~~ (step 3's ledger retrofit — see above), ~~the six unbacked
  `severity.ts` marks~~. **D7 is narrowed, not closed:** ~~S19~~ and ~~S30~~ are settled in
  `SPEC.md` (lines 1327 and 780, both marked *settled 2026-09-07*), and **S11/G5's collector half
  is settled too** (line 1208 — `collectCooling` files the entry). What remains of D7 is
  S11/G5's **panel-rendering** residue, owned by step 10.
- **Still open for steps 10–12:** D1 S40's third event-log feed · ~~D2 the independent age
  tick~~ (closed by 10a) · ~~D3 rendering `unknownStanding`~~ (closed by 10b) · ~~D6 jsdom +
  `useTelemetry` unmount~~ (closed by 10a) · ~~**L9 sparkline sizing**~~ (closed by 10c-3 — `CHART_SIZE`, ⚠ with A7's correction: its lower two entries are `plotHeight`, per plot) · ~~L11 the
  unit-name constant guard~~ (**closed by 10c-2** — `lib/format.ts`'s nine `UNIT_*` constants and
  `lib/unit-suffix.test.ts`). ⚠ Corrected 2026-09-08 by 10c-2's reconciliation: this line had gone
  stale in the safe direction on four of its six entries. `HANDOVER.md` §9 is authoritative.

---

## 8. The plan from here

Steps 1–8's sweep and step 9 are done. The queue is `pipeline/WORK-ITEMS.md` §10 (see §2.2).

### ⚠ The loop the owner wants, and it is not PLAN.md's

Each work item is **one agent loop**, one item at a time, each phase a **fresh agent with clean
context** receiving a written handoff:

| phase | model | runs as | does |
|---|---|---|---|
| **build** | **Sonnet 5, high effort** | subagent | implements + tests. Load the `dataviz` skill for anything with a chart, meter or stat row |
| **test** | **Sonnet 5, high effort** | subagent | reads every test name against its body; fixture symmetry; hunts equivalent and probabilistic mutations |
| **adversarial** | default | subagent | tries to break it, **fixes nothing**, writes findings with concrete failure scenarios |
| **reconcile** | default | **background subagent** — changed 2026-09-07 | adjudicates every finding ACCEPTED/REJECTED/DEFERRED **with reasons**, applies what survives, re-runs everything, writes `reconciliation.md` and rewrites `HANDOVER.md` |
| **review** | — | **the parent, always** — added 2026-09-08 | re-runs `pnpm verify` itself, **audits the reconciliation's adjudication table**, spot-checks its headline claims against the tree, then commits. **The loop is not closed until this runs.** |

### ⚠ PROJECT RULE — the parent reviews every reconciliation. Added 2026-09-08, owner's instruction.

**A reconciliation is not finished when the agent reports. It is finished when the parent has
reviewed it.** This is a fifth phase, it is never delegated, and it is the counterweight to
having moved the reconcile seat into an agent at all.

What the review must actually do — all four, every time:

1. **Re-run `pnpm verify` yourself** on the tree the agent left. Its green is not the green.
2. **Read the adjudication table in full** — every ACCEPTED, REJECTED and DEFERRED row with its
   reason. **Rejections and deferrals are the priority**: an accepted fix leaves a diff you can
   see, a rejected finding leaves nothing at all. A run with *zero* rejections gets the same
   scrutiny, not less — zero is the shape a rubber-stamp makes, so audit the deferrals instead.
3. **Spot-check the headline claims against the tree**, not against the report. Q1's review
   checked the generic-`test.each` syntax at the named line numbers and the duplicate test name
   in both files before believing either. Two `grep`s; it is not expensive.
4. **Then commit**, and say in the message what was verified by the parent versus reported.

**What made Q1's loop work is worth copying:** the parent verified F1 and F2 *itself* before
writing the reconcile handoff, so the agent inherited facts rather than claims, and its handoff
said which was which. Do that — a phase that must re-derive its own inputs spends its budget
there instead of on the work.

### ⚠ Reconciliation moved out of the parent — 2026-09-07, at the owner's instruction

It used to be the parent's own work. It is now **a background subagent like every other phase**,
for one reason: reconciliation is the most context-expensive phase in the loop — it reads the
build, the test pass, every adversarial finding, and the code each finding names, and step 9's
ran to 25 findings. Doing that in the parent burned the session that has to survive the *whole*
queue. The parent now spends its context on judgment and sequencing, not on re-reading.

**What the parent keeps, and must not delegate:**

1. **Green.** `pnpm verify` exiting 0, run *by the parent*, on the tree the agent left behind,
   before any commit. §4 and §9 both say this and they were written because an agent claimed
   green on a failing tree. A background agent reporting "verify passes" is a claim, not
   evidence.
2. **The commit.** Repo convention is commit-only-when-asked (root `CLAUDE.md`), and every
   reconciliation so far has been an explicit ask. The agent stages nothing.
3. **`SPEC.md`.** Unchanged from §5 — phases record gaps, the parent writes wording. A
   reconciliation agent that wants a spec change says so in its report.
4. **Audit of the adjudication table.** Read every REJECTED and DEFERRED row and its reason.
   Accepting a fix costs a diff you can see; rejecting a finding costs nothing visible, which
   makes rejection the failure mode to check.

**The honest cost of this change.** The parent's judgment in the reconcile seat was load-bearing:
this project has a reconciliation correctly overruling its own review, and four occasions where
an agent corrected the parent and was right. Moving the seat to an agent means the parent
*audits* an adjudication it did not produce — weaker than producing it, and the mitigation is
rule 4 above, not optimism. If a reconcile agent's rejections start reading thin, pull the phase
back into the parent for that item and say so here.

**Mechanics.** Spawn it with `Agent`, and let it run in the background — do not block on it. The
handoff must name: the item, the branch (`dashboard-frontend`), the files in play, the phases'
notes to read, **what the parent has already verified** (§8's rule below), and the four
non-delegable items above so the agent does not commit or edit `SPEC.md`. It reports back a
summary; the transcript stays out of the parent's context, which is the entire point.

**Handoffs live in `pipeline/handoffs/`.** Write one before spawning; the agent's quality tracks
the handoff's. The step 9 handoff is the model to copy.

⚠ **Write down what you have already verified yourself**, so the agent does not re-litigate it —
and be honest when the agent corrects you. It did, four times this session, and every correction
was right.

### ⚠ Scope — the backend-only constraint is LIFTED, and a new one replaces it

Steps 1–8 are closed, so the old "do not touch steps 9–12" rule has expired. **The live
constraint is the branch**: UI work belongs on `dashboard-frontend`, and nothing outside
`dashboard/` changes. Q1 is the exception worth naming — it edits the *harnesses* of steps
2–8, which live on the backend branch's history but are inherited here; do it on
`dashboard-frontend` like everything else and let the merge sort it out.

Invariant 7 still binds: **if the spec is silent, STOP and record it.** What changed is that
recording it now leads somewhere — see §7.

---

## 9. Standing constraints

- ⚠ **Mutation ids carry their creating step's id as a prefix** — `07-R3`, `Q1-SC1` — added
  2026-09-08 at the owner's instruction. The bare namespace collided with the gap/work-item
  namespace: `S11` and `G5` were each simultaneously a step-7 mutation id and half of the open
  `S11/G5` work item, and `S12` collided too. §7's old warning that "the `S*` namespace is
  polluted" understated it — it was never confined to `S`, nor to steps 3–5. The prefix is the
  **creating** step, not the harness the mutation currently lives in, so it never changes.
- ⚠ **`MOCK.html` is a source for FORM only — density, anatomy, type scale, spacing, chart sizes.
  Data, strings and rules come from `SPEC.md`, and where the two disagree the spec wins.** The
  owner's words, 2026-09-09: *"the mock is a mock; the data predates the mock is a rule — if the
  mock says V100 but the data says PG500-216 then it is PG500-216."* So: raw driver name, full bus
  id, `GiB`, invariant 1, the throttle rules, every S-* ruling — all stand exactly as built; the
  mock supplies how tall and how dense, never what is printed. This sharpens the older "reference,
  never a source" line: it *is* the source for form, since measured on 2026-09-09 it fits every
  §6.1 viewport the build overflowed.
- **Commit only when asked** (repo convention, root `CLAUDE.md`). Each reconciliation has been
  an explicit ask; `git push` is separately gated and needs its own.
- **The server `ai-server` is reachable over SSH and is read-only to this work.** Reads are
  encouraged — several findings were settled by measuring the real box. **Never write to it**:
  no `pwmN`, no mutating D-Bus call (`LoadUnit` is forbidden — `GetUnit` is the read-only
  one), no `/v1/chat/completions`.
- **`ufw` now enforces on the box** (`ENABLED=yes`, verified 2026-09-06). Port **8090 has no
  allow rule**, so the dashboard will be unreachable until step 12 adds one. Do not add it now.
- Nothing outside `dashboard/` should change, except the root `.gitignore` (already modified).
- **`pnpm verify` exiting 0 is the only definition of green.** Not a printed summary, not an
  agent's report. Re-run it yourself before every commit — an agent has claimed green on a
  tree that failed.
- **Never `sleep`-poll a background harness.** `until ! pgrep -f regressions.py` never exits:
  the pattern matches the waiting shell's own command line. Write `pgrep -f "regressions[.]py"`.
- ⚠ **THE BRACKET IS NOT ENOUGH, and this cost five hours on 2026-09-08.** `regressions[.]py`
  stops the pattern matching *itself*, but a wait loop written as part of the **same `bash -c`
  string** that also ran the harness has the literal text `python3 …/regressions.py` in its own
  command line — so `pgrep -f` matches the waiter, and it spins forever. Two shells sat in that
  state for five hours with **no harness running at all**; the tell is `pgrep` matching while
  `pgrep -fl "vitest|node"` shows no child doing work. It was written into a subagent handoff by
  the parent, who had quoted the bracket rule while introducing the very bug it warns about.
  **The fix is to not wait at all**: run harnesses as plain sequential foreground commands in one
  call — `python3 …/07.py; python3 …/08.py` — which are serial by construction and need no poll.
  If you must poll, poll from a shell that has never mentioned the harness.
  Seven orphaned shells were found this way.
