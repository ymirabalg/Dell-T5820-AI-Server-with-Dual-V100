# Handoff — Step 10b: the nine panels (BUILD phase)

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

Read: this file → `steps/10-panels-assembly/SCOPE.md` (**you are loop 10b of three**) →
`components/panel-props.ts` (**the contract you typecheck against**) → `pipeline/HANDOVER.md`
§0.3, §3.5, §3.6 → `SPEC.md` §6.2, §6.3, §6.4, §6.5, §6.6 → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

⚠ **Load the `dataviz` skill** — every GPU card has a trace, COOLING has a shared-time chart, and
several panels have meters and stat rows.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `f12c3ef`.

---

## 1. What you are building

The **nine panel bodies** that drop into 10a's grid slots:

`gpu0` · `gpu1` · `cpu` · `memory` · `cooling` · `safety` · `storage-and-network` · `serving` ·
`session-event-log`

10a built everything they sit inside — header, banner, grid, `app/` wiring — and it is committed.
**The shell is not yours to change**; if you need something from it, say so rather than reaching in.

## 2. ⚠ The contract, and the constraint behind it

`components/purity.test.ts` forbids **every React hook** in `components/`, matched by shape, and
**the walk recurses into `components/panels/`**. That is deliberate: step 9 made it recursive so
this loop would be covered. State lives in `app/`; your panels are **pure functions of props**.

`components/panel-props.ts` is a **real exported type** — typecheck against it, do not restate it:

- **`state: RuntimeState`** — non-null. `app/`'s single 2.5a guard has already run, so **a panel
  never asks "has the hook mounted"**. A `null` *field* is an ordinary "no reading" and renders
  `—`, on poll 400 exactly as on poll 1 (**ruled 2026-09-08, S-D**).
- **`nowMs: number`** — this tick's wall clock from `app/use-now-tick.ts`. A panel needing an age
  derives it from this and **never reads a clock of its own**; `Date.now()` in a render would
  freeze exactly as 10a's F8 showed.
- **`panelId: PanelId`** — ⚠ **the SVG-id namespace.** Every `id` you mint (gradient, clip path,
  `aria-labelledby`) is prefixed with it. `GpuPanel` mounts twice, at `gpu0` and `gpu1`; a
  colliding SVG id surfaces as a chart painted with the wrong gradient, which reads as a styling
  accident rather than a bug.

**Do not weaken `purity.test.ts`.** If you believe it blocks something necessary, argue it in your
notes and leave it alone.

## 3. Panel head — every one is `title · subtitle · chip` (§6.2)

- **title** — lower case: `GPU 0`, `cpu`, `cooling`, `serving`.
- **subtitle** — ⚠ **identity, never measurement.** It answers *what am I looking at*, not *how is
  it doing*, and must not change on a poll unless the machine changed. Two panels take live
  telemetry here: **GPU** = `<name> · <bus>` (both **raw**), **CPU** =
  `<cpuModel> · <cores>C / <threads>T`. The rest take a fixed source label
  (`/proc/meminfo`, `statvfs · eno1`, `dell_smm · channel 5 = FAN_HDD (PCIe/GPU)`).
- **chip** — the panel's own severity from §6.3 on the **current** reading; §6.4: a cell's colour
  is **not** debounced.
- ⚠ **A subtitle is `—` when its field is `null`**, like any other reading. A GPU whose `name`
  failed to parse keeps its subtitle and shows what it has.

## 4. The traps, per panel — each has already bitten a draft

**GPU ×2** — temperature dominant with a 30-minute trace behind it; power against the 250 W cap;
VRAM as a bar with absolute MiB; utilisation; SM clock; and the model served on that card.

- ⚠ **The name is the driver's raw string.** `nvidia-smi` returns **`Tesla PG500-216`** here — the
  board code. It will not say "V100" anywhere; there is no lookup table, deliberately, so a driver
  reporting something unexpected is visible rather than laundered. **`MOCK.html` shows
  `Tesla V100-PCIE-32GB`, a string this box never produces.**
- ⚠ **The bus id renders RAW and in full**: `00000000:17:00.0`, never `17:00.0`. `MOCK.html` shows
  the short form. **The mock is a reference, never a source.**
- ⚠ **Throttle reasons appear only when something other than `0x4` is active.** The normal power
  cap is not news and **must not be styled as a warning**.
- ⚠ **The GPU↔instance join is `gpu.index === serving.instance`** — true of this deployment
  (`CUDA_VISIBLE_DEVICES=%i` in the unit template) and **not derivable from the snapshot**. Getting
  it wrong prints the wrong model on a card rather than failing visibly. Label it as *served by
  instance N*, not as "on this card".
- At **≥1600px** §6.1 promotes the sparkline to a full line chart. Sizing arrives as a prop —
  **L9's canonical value is 10c's**, so take a defensible default and record it.

**CPU** — package temp, aggregate utilisation with a trace, load average. Model and core/thread
count are the **subtitle**, not body rows.

**MEMORY** — used against 61 GiB as a bar, plus swap. **Swap gets its own row** because any swap in
use is meaningful on this box.

**COOLING** — `fan5` RPM headline, derived mode (`HIGH pwm 255` / `EC auto`), `fan2` and the rest
smaller, **and the fan service state** (decision 24 — it belongs here, *not* to SERVING). Its
shared-time chart drawing the GPU temperature trace against fan RPM is *"the single most useful
thing this panel can do"*. ⚠ Invariant 3: **`ENODATA` from `pwm5` means EC auto, which is
HEALTHY** — never an error. Invariant 4: **`fanN_input` is the only trustworthy fan telemetry**.

**SERVING** — one row per instance: unit state dot, port, model alias, context, `/health`. **No
token rates** (decision 13). `llama-server` instances **only**.

**STORAGE & NETWORK** — `/` and `/home` as bars with absolute figures; `eno1` throughput with
direction; link state.

**SAFETY** — §3.6's four checks as a compact list with pass/warn/fail glyphs. *"The panel that
earns the dashboard's existence"* — it does not get hidden behind a tab.

- ⚠ **Each row carries its `errors[]` explanation beside it** — §3.7 requires it in as many words:
  *"an alarm with no explanation beside it is not actionable"*. Text comes from **`errorsForPanel`**
  (`lib/client/observations.ts`) via §6.5's `source` match, **never copy written here**.
- ⚠ **A stale row uses S-B's exact words: `last read 6:12 ago`**, `--status-watch` not
  `--status-alarm` (ruled 2026-09-08; §6.5 now says the banner and the row use the same words).
  10a shipped the banner half — **read it and match it**.

**SESSION EVENT LOG** — a compact **scrolling** list of state transitions since page load. §6.1's
no-scroll promise governs the page, not a component (clarified 2026-09-08).

## 5. Open items that land in this loop

Named in `HANDOVER.md` as 10b's — read each there rather than from memory: **D1** (S40's third
event-log feed) · **D3** (`unknownStanding` renders in SAFETY, or comes **off** `RuntimeState` —
leaving a field implying a mechanism that cannot fire is do-not-copy #9) · **S11/G5's panel half**
(what a row renders for an em dash with **no** `errors[]` entry whose coloured neighbour is not a
severity — ⚠ **this is a known spec silence**; invariant 7 applies) · **O12/O13/O14** ·
**Q2-F9's deferred half** (an out-of-domain instant: clamp vs drop) · **Q2-S2's table view** now
that panels are real callers.

## 6. The bar

- **Mark load-bearing tests `⚠`**, back each with a mutation in
  `pipeline/steps/10-panels-assembly/regressions.py`, prefixed **`10b-`**.
- ⚠ **Beware the equivalent mutation** — three reconciliations have now caught mutations turning
  vacuous when a new guard subsumed an old one. They print `DID NOT BITE`, which reads as an inert
  test when the truth is a vacuous mutation. A **probabilistic** mutation is worse than none.
- **Invariant 1, both directions, everywhere.** `null` → `—`; zero → the numeral **with its unit**
  (`0 RPM`). *"A fan reading 0 is a dead fan; a fan reading nothing is a driver that did not load.
  Conflating them is the single worst bug this project can ship."*
- **Use `lib/format.ts`.** Do not hard-code a unit string and do not split a formatter's output on
  whitespace (O14 — ask for a `parts` variant if you need styled units).
- **A test that names a property it does not check has appeared in every single step.** Read each
  name against its body. 10a found two inert assertions this way and the adversarial found a third.
- ⚠ **CSS and layout are not observable in jsdom.** If a test can only assert a stylesheet contains
  a string, **say so** — do not name it as though it proves behaviour. 10a's grid needed a real
  browser to be verified at all.

## 7. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 71 mutations before you start
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ **`pnpm verify` is NOT deterministic today** (`HANDOVER.md` §0.3): `lib/collectors/serving.test.ts`
  has a wall-clock-flaky ⚠ test — 95 ms sleep in a 100 ms budget, 2/6 under load — deferred to 10c.
  **If a `serving` test fails, re-run before believing it, and do not fix it here.**
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; the parent has killed
  orphans from this twice). Plain **sequential foreground commands**.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit. Do not edit `SPEC.md` or `SCOPE.md`. Do not weaken `purity.test.ts`.**
- Scope: `components/panels/` (new), `components/`, and step 10's harness. **Not `app/`** — that is
  10a's, and it is committed. **Not 10c's backlog.**
- **Invariant 7: if the spec is silent, STOP and record it.** §6.2 describes bodies and §6.1
  describes placement; there is real room between them, and the owner answers. This is how ~100
  spec gaps were found.

## 8. Deliverable

`steps/10-panels-assembly/10b-build.md`: what each panel renders and why, every design decision
where the spec was silent, how you discharged §5's open items (or why one is not yours), your ⚠
marks and their mutations, and every gap recorded for the owner. End with `pnpm verify`, the
harness result, and `git status`.

Report back a short summary. The parent will not read your transcript.
