# Handoff — Step 10b, TEST phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10b-build.md` (**your primary subject**), then `SCOPE.md`,
`components/panel-props.ts`, `SPEC.md` §6.2/§6.3/§6.5/§6.6, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10b's build is uncommitted.

---

## 1. What 10b built

The **nine panel bodies** under `components/panels/`, pure and hook-free, consuming
`PanelProps` (`state`, `nowMs`, `panelId`). Plus shared support (`status-row.tsx`,
`condition-lookup.ts`, `panel-chart.ts`, `event-sentence.ts`, `test-support.ts`) and 30 new
`10b-` mutations. **`app/` and `lib/` were out of scope and are untouched.**

## 2. Verified by the parent — do not re-derive

| | |
|---|---|
| `pnpm verify` exit **0**, **91 files, 2512 tests**, no type errors | parent, this tree |
| **`pnpm verify` is now DETERMINISTIC** | 10a-F17 is fixed and committed (`3c37107`): the flaky step-5 test uses fake timers, `deadline.ts`/`serving.ts` byte-identical to HEAD, 60/60 green under load, and it still fails when the defect returns. **Green means something again** — if a test fails now, believe it |
| Scanner logic is **identical across all nine harnesses** | I diffed the executable lines (comments and docstrings stripped): md5 `68f7f93b…` in every one. **Step 10's copy differs only by dropped comments** — 10a stripped Q1's explanatory docstrings. No logic divergence |

## 3. ⚠ Your highest-priority question — a possible FOURTH instance of Q1's bug

10b reports that **escaped apostrophes (`\'`) inside single-quoted test names defeat the
⚠-scanner's matching** against Vitest's actual (unescaped) output, and recorded it as a rule for
writing names in this codebase.

Given §2, that is **not** a scanner divergence — so it is either a naming rule or a live
under-count, and which one matters enormously. Q1 was opened because the ledger reported success
over a set smaller than the real one; F1 in 10a found the "corrected" scanner still blind to
generic type arguments. **This would be the third such blind spot, and the question nobody has
asked is whether it is live in the other eight harnesses right now.**

**Answer it mechanically.** Across every step's `LEDGER_FILES`: does any `⚠`-marked test name
contain an escaped quote? If yes, is that mark currently being matched — or is it silently
uncounted, exactly as the multi-line `test.each` marks were before Q1? Report the count per step.
If the answer is "none today", say so plainly — that is a clean negative and it is worth knowing.

⚠ **Do not fix eight harnesses on your own initiative.** If you find a live under-count, that is a
finding for the adversarial and reconcile phases and possibly its own loop; 10b's scope is
`components/panels/`, `components/`, and step 10's harness.

## 4. The rest, in priority order

### 4.1 The 30 new mutations

Written to make a ledger go green — the circumstance that produces bad ones. For each: a **wrong
implementation somebody would plausibly write**, reddening **deterministically**, reddening the
test whose *name claims that property*. ⚠ **Three reconciliations have now caught mutations turning
vacuous** when a new guard subsumed an old one — they print `DID NOT BITE`, which reads as an inert
test when the truth is a vacuous mutation.

### 4.2 Invariant 1, in nine places

`null` → `—`; zero → the numeral **with its unit**. *"A fan reading 0 is a dead fan; a fan reading
nothing is a driver that did not load. Conflating them is the single worst bug this project can
ship."* Check **both directions with fixtures** in every panel that renders a reading — "every
boundary guard needs a fixture on both sides" is a rule three steps here have already broken.

### 4.3 The GPU traps — each has already bitten a draft

Confirm by reading the code, not the build notes: the name renders the driver's **raw** string
(`Tesla PG500-216`, never "V100" — `MOCK.html` shows a string this box never produces); the bus id
is **full-length** (`00000000:17:00.0`); **throttle rows appear only when something beyond `0x4` is
active** and the normal power cap is not styled as a warning; the model is labelled **"served by
instance N"**, since `gpu.index === serving.instance` is true of this deployment and **not
derivable from the snapshot**.

### 4.4 S-B's exact words, and the S11/G5 guard

- The build says SAFETY's stale row reproduces `last read 6:12 ago` **byte-for-byte from
  `app/dashboard-shell.tsx`'s own function**. ⚠ **Verify that literally** — the owner ruled these
  must be the same words, and they now live in two files that nothing forces to agree. What
  happens if one changes?
- **`10b-CO5`** is claimed to guard the owner's S11/G5 ruling (a `fan5` em dash beside an
  `unavailable` neighbour needs no explanation). The build says COOLING satisfied it *by
  construction*. **Does the mutation actually redden if a fallback line were added?** A guard that
  cannot fail is not a guard.

### 4.5 Explanations must not be invented

§3.7: SAFETY row text comes from `errorsForPanel`'s source match, **never from copy written in the
UI** — a constraint the S11/G5 ruling made *firmer*. Grep for hard-coded explanatory sentences.
Same for units: use `lib/format.ts`, never a literal `' RPM'`, and never split a formatter's output
on whitespace.

### 4.6 Names against bodies

*"A test that names a property it does not check has appeared in every single step."* 10a found two
inert assertions and its adversarial found a third. Nine new panels is the largest surface yet.

### 4.7 Two things the build recorded — assess, don't inherit

- **The chart/table toggle is unreachable**: the `view` prop exists but nothing can flip it, since
  the state cannot live in a hook-free panel and the shell does not own it. Is that stated
  correctly, and is Q2-S2's accessibility floor therefore **built but not operable**?
- **The panels are not wired into `app/dashboard-shell.tsx`** (out of 10b's scope). So every panel
  test renders in isolation and **nothing proves they compose**. Say what that leaves unverified.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 101 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; orphans killed twice).
  Plain **sequential foreground commands**.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Fixing IS in scope** — say what you changed and why.
- **Do not commit. Do not edit `SPEC.md` or `SCOPE.md`. Do not weaken `purity.test.ts`.** Scope:
  `components/panels/`, `components/`, step 10's harness. **Not `app/`, not `lib/`.**

## 6. Deliverable

`steps/10-panels-assembly/10b-test.md`, leading with §3's answer. Then a short summary. A clean
result stated with its evidence beats a manufactured finding. End with `pnpm verify`, the harness
result, and `git status`.
