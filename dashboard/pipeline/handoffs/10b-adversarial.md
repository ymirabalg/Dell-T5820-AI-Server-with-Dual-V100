# Handoff — Step 10b, ADVERSARIAL phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10b-build.md` and `10b-test.md`, then `SCOPE.md`,
`components/panel-props.ts`, `SPEC.md` §6.2/§6.3/§6.4/§6.5/§6.6, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10b uncommitted.

## ⚠ You fix NOTHING

Findings only; reconcile adjudicates each ACCEPTED / REJECTED / DEFERRED. Every finding needs a
**concrete failure scenario** — input or state, and the wrong output or missed detection. Mark each
**EXECUTED** or **REASONED**.

---

## 1. What 10b is

The **nine panel bodies** under `components/panels/`, pure and hook-free, consuming `PanelProps`
(`state`, `nowMs`, `panelId`). 10a's shell (header, banner, grid, `app/` wiring) is **committed and
not yours**. `lib/` is untouched by 10b.

## 2. Verified — attack only with evidence

| | |
|---|---|
| `pnpm verify` exit **0**, **91 files, 2520 tests** | parent, this tree |
| **verify is DETERMINISTIC** | 10a-F17 committed (`3c37107`): fake timers, `deadline.ts`/`serving.ts` byte-identical to HEAD, 60/60 under load, still fails when the defect returns. **If a test fails now, believe it** |
| Scanner logic **identical across all nine** harnesses | parent diffed executable lines, md5 `68f7f93b`; step 10 differs only by dropped comments |
| Escaped-quote marks: **zero today**, and the shape is **self-flagging** | test phase scanned all 844 ⚠ names across steps 2–10. Parent confirmed the mechanism: `if uncovered: … return 1` — an unmatched mark is a **loud exit 1**, never a silent under-count. It can only produce a false RED, never a false green. **This is NOT a fourth instance of Q1's bug** — do not re-file it as one |
| Invariant 1 gap **found and fixed in 4 of 9 panels** | GPU, CPU, MEMORY, STORAGE&NET had zero tested but **no fixture isolating a null field from zero for the same field**. Four mutations added (`10b-GP2/CP3/MP3/SN3`), each "defaults to 0 instead of —" |

## 3. Where I would look

### 3.1 ⚠ The invariant-1 sweep stopped at four panels

The test phase found the conflation in **four of nine** and fixed those. **It did not report
clearing the other five** — and the panel where `0` versus `null` matters *most* is **COOLING**:
`PLAN.md` invariant 1 uses a fan as its own example — *"a fan reading 0 is a dead fan; a fan
reading nothing is a driver that did not load. Conflating them is the single worst bug this project
can ship."* Invariant 4 adds that **`fanN_input` is the only trustworthy telemetry**, and invariant
3 that **`ENODATA` on `pwm5` is HEALTHY**, not an error.

For **COOLING, SERVING, SAFETY, SESSION EVENT LOG** and the ninth: does each have a fixture
isolating a **null field** from a **zero reading of that same field**? If a panel has no zero-valued
reading at all, say so — that is a clean answer. **This is the highest-value question here**, and
the fact that four of nine were wrong is the reason to ask it of the rest.

### 3.2 The composition nobody has tested

Every panel test renders **in isolation**. The panels are **not wired into
`app/dashboard-shell.tsx`** (out of 10b's scope, confirmed by grep). So nothing proves nine panels
compose: SVG id collisions across two mounted `GpuPanel`s, duplicate DOM ids, CSS module class
collisions, a panel overflowing its grid cell. `panelId` exists as the id namespace — **is it
actually used everywhere an id is minted?** A colliding SVG id surfaces as a chart painted with the
wrong gradient, which reads as a styling accident rather than a bug.

### 3.3 Two files nothing forces to agree

S-B's wording (`last read 6:12 ago`) is byte-for-byte identical in `condition-lookup.ts` and
`app/dashboard-shell.tsx` — the test phase verified that and recorded that **nothing keeps them in
sync**. The owner *ruled* they must be the same words. What is the concrete failure? Is there a
guard that would catch a drift, and is one warranted here or is it a 10c item?

### 3.4 `errorsForPanel`'s granularity, against §3.7

§3.7 is **per source**, so **one `dell-smm` entry stands behind five fan channels and the mode** —
`UI-BACKEND-GAPS.md` says step 9/10's rendering "has to live with it". How does COOLING render one
entry against five em dashes? Does it repeat the same sentence five times, attach it once, or drop
it? And S11/G5's ruling (widened 2026-09-08: an `unavailable` neighbour discharges the explanation)
— does `10b-CO5` guard the *ruling*, or merely the current code shape?

### 3.5 The GPU↔instance join at the edges

`gpu.index === serving.instance` is **not derivable from the snapshot**. What renders when the
counts disagree — one GPU and two instances, two GPUs and none, an instance whose index matches no
card? Getting this wrong **prints the wrong model on a card rather than failing visibly**, which is
the failure mode §6.2 calls out by name.

### 3.6 Free hunting

The above is where I would look; a finding I did not anticipate is worth more. §6.3's bands,
§6.6's formatters (no hand-rolled units, no splitting a formatter's output), the session log's
ordering and cap, and `MOCK.html` traps (it renders a GPU name and a short bus id this box never
produces) are all fair game.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 105 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; orphans killed twice).
  Plain **sequential foreground commands**.
- Experiments are fine; **revert them and confirm with `git status`**, leaving the tree exactly as
  found. If you run a dev server, stop it and leave no `.env` behind — the parent checks.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`/`SCOPE.md`. Do not weaken `purity.test.ts`.**

## 5. Deliverable

`steps/10-panels-assembly/10b-adversarial.md`: numbered findings, each EXECUTED or REASONED with a
concrete failure scenario, plus **"what I attacked and could NOT break"** — that section tells
reconcile where not to spend budget and has been load-bearing in every step.

Report back a short summary. The parent will not read your transcript.
