# Handoff — Step 10a: the shell (BUILD phase)

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

Read: this file → `pipeline/steps/10-panels-assembly/SCOPE.md` (**the whole step; you are loop
10a of three**) → `SPEC.md` §6.1, §6.2, §6.4, §6.5 → `pipeline/ANCHOR.md` §4/§5/§8/§9 →
`pipeline/PLAN.md` (the seven invariants) → `pipeline/HANDOVER.md` §3.5 (the `components/`
surface you compose) → `pipeline/UI-BACKEND-GAPS.md` §2.5–§2.9 and §4.

⚠ **Load the `dataviz` skill** before touching anything with a chart, meter or stat row.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree is **clean** — start from green.

---

## 1. ⚠ YOUR FIRST JOB IS A DECISION, and everything else waits on it

`components/purity.test.ts` forbids **every React hook** in `components/` — matched by the shape
React mandates (`use` + capital, called), not a name list — and **the walk recurses**, so
`components/panels/*.tsx` is inside the guard the moment that directory exists. Step 9 made the
walk recursive *specifically* so step 10's panels would be covered. That is deliberate, not an
accident you are free to undo.

So: **where does state live, and what exactly do the nine panels receive?**

The precedent is strong and consistent — Q2's chart/table toggle is a caller-owned prop, L9
deferred the sparkline's sizing to its caller, L4 made unique SVG ids the caller's obligation, and
all three name **step 10** as that caller. The obvious reading is: one `useTelemetry()` at the
page root in `app/`, everything below it pure and prop-driven.

**But `SPEC.md` does not say it.** Invariant 7 applies — so **decide it explicitly, write the
decision and its reasoning into your notes, and design the props contract deliberately.** 10b
writes nine panels against whatever you settle here; if you leave it implicit, nine panels get
written against a guess and reworked.

⚠ **Do not weaken or narrow `purity.test.ts` to make anything fit.** If you believe the guard is
wrong, say so in your notes with the argument and leave it alone.

## 2. Scope — 10a is the shell, NOT the panels

**IN:**

| | |
|---|---|
| **Header** | §6.2's exhaustive control set |
| **Sticky alarm banner** | §6.4 |
| **Grid + 4 breakpoints** | §6.1 |
| **`app/` wiring** | one `useTelemetry()`, the props contract 10b consumes |
| **Assembly seams** | SCOPE §2.5a–§2.5e |
| **D6** | `use-telemetry.ts` has no test and no mutation |
| **Step 10's harness** | `pipeline/steps/10-panels-assembly/regressions.py` — this step has none yet |

**OUT — belongs to 10b:** the nine panel bodies. You need *something* in the grid cells to lay
out against; **decide and record** whether that is minimal stubs, `PanelShell` used directly, or
a fixture — and make the choice one 10b can build on rather than delete.

**OUT — belongs to 10c:** F9's deferred half, F4's cross-harness runner, L9, L11, the
`--table-scroll-max` → `max-height: 100%` replacement.

## 3. The requirements that have already bitten a draft

### 3.1 Header (§6.2) — the list is EXHAUSTIVE, settled 2026-09-07

hostname · `uptimeSec` (§3.2's four forms) · aggregate status dot · snapshot timestamp · age of
last **successful** snapshot · then **cadence** (1/2/5/10/30 s, default 5) · **window**
(10 min / 30 min / 2 h, default 30) · **refresh now** · **pause/resume** · and a visually
separated **logout**.

⚠ **No IP address. No kernel release.** Four places once described this header and none agreed.
`MOCK.html`'s meta line is a mock-only rendering — **the mock is a reference, never a source.**
`host.kernel` is carried on the wire and rendered nowhere, deliberately; it is *the only* field
with that justification, and a second one is a defect, not a precedent.

⚠ **Paused is a display mode, not a severity.** Shown *alongside* the severity, never instead:
`❙❙ paused · 6 alarms`. **The count is omitted at zero** — `● all healthy`, never `● 0 alarms`.
Same shape for a failed poll: `⊘ stale · 6 alarms`. **This is half of `PLAN.md`'s green criterion
for step 10**, so it gets a ⚠ test and a mutation.

**None of the controls touches the server.** They change the browser's timer, its window, or its
session. Logout calls `DELETE` on `SESSION_PATH` (`/api/session`) — see HANDOVER.

### 3.2 Banner (§6.4)

Alarm-level conditions pin a banner naming condition, value, and when it started; it stays until
the condition clears. Multiple collapse into one banner **with a count**. Watch-level colours its
cell and **never** raises a banner.

⚠ **Standing conditions have no live subject.** `ufw enforcing = no` was the archetype and no
longer holds — so the ledger, the suppression, the once-per-session log and "returns to full
alarm the moment it changes" **must be proved by fixture** and cannot be checked against the box.

Relevant open obligations, named in HANDOVER §6 as step 10's: **O2** the dot and the count are
**one reduction**, a suppressed standing condition is neither red nor counted; **O3** one reading
one condition, dedupe by id; **O4** `sinceMs` is when the **confirmed** band was first observed.

### 3.3 Grid (§6.1)

The ASCII layout is authoritative and maps 1:1 onto CSS grid columns and rows. Two placements
were wrong in earlier drafts and are settled: **COOLING spans rows 2–3 in columns 1–2** (its
shared-time chart needs the height; auto-placement leaves dead ground), and the fan service state
belongs to COOLING, not SERVING.

Breakpoints: **≥1600** (sparklines promoted to full line charts inside the GPU cards) ·
**1280–1599** (the design target) · **900–1279** (2 columns; scrolling begins and is accepted) ·
**<900** (1 column: GPUs → cooling → safety → serving → host → storage).

⚠ The no-scroll promise is about the **page**, not every component (§6.1, clarified 2026-09-08).

### 3.4 The seams — each is specified, and each has a trap

- **`state === null` is *before the first poll*, not missing data.** It must **not** render `—`.
  Write the wrapper **once, here**, not nine times in 10b.
- ⚠ **The age indicator needs its OWN interval (D2).** Do **not** tick it off store changes: under
  §6.2's mode rule the store changes exactly once, at the `live → stale` crossing — which is
  **worse than never**, because a store-driven tick *appears* to work in a fast-cadence fixture and
  then freezes on a real failure, the one thing the age indicator exists to prevent.
- **`unknownStanding` (D3):** render it in SAFETY, or take it **off** `RuntimeState`. Leaving a
  field that implies a mechanism which cannot fire is HANDOVER's do-not-copy #9. SAFETY's body is
  10b's, so if you choose "render", define the seam and hand it over.
- **Unique SVG `id`s** across chart instances are **yours** — L4 assigned them to the caller.
- **Sizing (L9)** is the grid's decision; the primitives take it as a prop.

### 3.5 D6 — jsdom, and invariant 6

`lib/client/use-telemetry.ts` is the one file from step 8 with **no test and no mutation**
(verified by the parent: no `use-telemetry.test.ts` exists). First assertion: **unmounting the
hook calls `stop()`**.

⚠ **Invariant 6: no dependency without a recorded reason.** If you add jsdom, record what it buys
**and what it costs step 11's container image** — and *verify* rather than assert whether a
devDependency reaches that image. If it does, that is an owner question, not your call.

## 4. The bar

- **Mark load-bearing tests `⚠`** and back each with a mutation in step 10's new harness. A ⚠ mark
  with no mutation fails the harness — that is the mechanism Q1 repaired.
- **Mutation ids are `10a-` prefixed.** Ids carry their **creating** step (ANCHOR §9); 10b and 10c
  use their own, so provenance stays readable across the three loops.
- ⚠ **Copy step 9's harness as the template** — it has the corrected ⚠-scanner (paren-balanced,
  string-, comment- **and** generic-aware), the `ANCHOR AMBIGUOUS` category, and the ledger check.
  Do **not** write a scanner from scratch; all eight existing harnesses are byte-identical there
  and yours must match.
- ⚠ **Beware the equivalent mutation.** Q2's reconciliation caught two of its own turning vacuous
  when a new guard subsumed an old one — they would print `DID NOT BITE`, which reads as an inert
  test when the truth is a vacuous mutation. Each mutation must be a **wrong implementation
  somebody would plausibly write** and must redden **deterministically**. A probabilistic mutation
  is worse than none.
- ⚠ **CSS and layout are not observable in jsdom.** `:hover`, `position: sticky`, `overflow`, grid
  placement — none of it. If a test can only assert that a stylesheet contains a string, **say so**
  and do not name it as though it proves behaviour. Q2-S2's answer was to **open a real browser**
  and check geometry; that option is available to you and is the honest one for §6.1's placement.
- **A test that names a property it does not check has appeared in every single step.** Read each
  test name against its body before you finish.
- **Invariant 1: `null` is not `0`.** `—` for null; the numeral **with its unit** for zero.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0, never a printed summary
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never run `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness.** A `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its **own** command line and spins forever — five hours lost 2026-09-08
  (ANCHOR §9). Use plain **sequential foreground commands**; serial by construction.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit.** **Do not edit `SPEC.md`.** Scope is `app/`, `components/`, and step 10's
  harness. Nothing outside `dashboard/`.
- **Invariant 7: if the spec is silent, STOP and record it.** §6.2 describes panel *bodies*, §6.1
  describes *placement* — there is real room for silence between them, and the owner answers.
  Known-open already: **S11/G5's panel half** (what a panel renders for an em dash with no
  `errors[]` entry whose coloured neighbour is not a severity).

## 6. Deliverable

`pipeline/steps/10-panels-assembly/10a-build.md`: **the §1 decision and its reasoning first**, then
what you built, the props contract 10b will consume (state it precisely — it is the handover),
design decisions where the spec was silent, the D6/jsdom finding, your ⚠ marks and their
mutations, and every gap recorded. End with `pnpm verify`, the harness result, and `git status`.

Report back a short summary. The parent will not read your transcript.
