# Step 10 — Panels & assembly: SCOPE

**Written by the parent, 2026-09-08**, from `PLAN.md`'s step-10 row, `SPEC.md` §6.1/§6.2/§6.4/§6.5,
`UI-BACKEND-GAPS.md`, and `HANDOVER.md`'s open obligations. Every "already closed" below was
checked against the code, not against a handover.

`PLAN.md` defines it as: *"nine panels, header controls, banner, grid + breakpoints"*, green when
*"grid matches §6.1 placement; paused shows mode **and** alarm count"*.

**This is the largest step in the plan** — it is the first one that assembles rather than adds,
and it is the first with a real user-visible surface. Steps 1–9 built ~2260 tests of parts that
have never been composed. `components/` has **no production call site at all**: `grep -rn
"<Sparkline"` finds only its own test file.

---

## 1. ⚠ The structural constraint, and it decides the shape of the whole step

`components/purity.test.ts` forbids **every React hook** in `components/` — matched by the shape
React mandates (`use` + capital, called), and the walk **recurses**, so `components/panels/*.tsx`
is inside the guard the moment it is created. That is not incidental; step 9's own notes say the
walk was made recursive *specifically* so step 10's panels would be covered.

**Therefore: the nine panels are pure prop-driven functions. State is called exactly once, in
`app/`.** One `useTelemetry()` at the page root, everything below it props. This is already the
established direction — it is why the chart/table toggle is a prop (Q2), why the sparkline's
sizing was deferred to its caller (L9), and why unique SVG ids are documented as the caller's
obligation (L4). **Step 10 is that caller**, for all three.

The decision this forces, and it should be taken deliberately in the build phase rather than
discovered: *does the panel layer stay hook-free, or does `app/` grow a thin stateful shell that
`components/panels/` renders under?* The spec does not say. The precedent says the latter.

## 2. Deliverables

### 2.1 The nine panels (§6.2)

`GPU 0` · `GPU 1` · `CPU` · `MEMORY` · `COOLING` · `SERVING` · `STORAGE & NETWORK` · `SAFETY` ·
`SESSION EVENT LOG`.

Every one is `title · subtitle · chip` (§6.2's panel-head convention). **Subtitle is identity,
never measurement** — it must not change on a poll unless the machine changed. Two panels take
live telemetry there (GPU: `<name> · <bus>` both **raw**; CPU: `<cpuModel> · <cores>C / <threads>T`);
the rest take a fixed source label.

Panel-specific traps already written down, each of which has bitten a draft:

- **GPU** — the name is the driver's raw string (`Tesla PG500-216`, never "V100"); the bus id is
  the **full domain form** `00000000:17:00.0`, untrimmed. `MOCK.html` renders both wrongly and is
  a reference, never a source. Throttle reasons show only when something other than `0x4` is
  active — the normal power cap is not news and must not be styled as a warning.
- **GPU↔instance join** is `gpu.index === serving.instance`, correct on this deployment and **not
  derivable from the snapshot**. Getting it wrong prints the wrong model on a card rather than
  failing visibly.
- **COOLING** owns the fan service state; **SERVING is `llama-server` instances only** (decision 24).
- **SAFETY** — each row carries its `errors[]` explanation beside it, text from §6.5's `source`
  match, never copy written in the panel. "An alarm with no explanation beside it is not
  actionable."
- **SESSION EVENT LOG** is specified as a compact **scrolling** list — the §6.1 precedent that
  Q2-S2's ruling leaned on.

### 2.2 Header (§6.2) — the list is exhaustive and was settled 2026-09-07

hostname · `uptimeSec` · aggregate status dot · snapshot timestamp · age of last good snapshot ·
then **cadence** (1/2/5/10/30 s, default 5), **window** (10 min/30 min/2 h, default 30),
**refresh now**, **pause/resume**, and a visually separated **logout**.

⚠ **No IP address and no kernel release** — four places once described this header and none
agreed. `host.kernel` is carried on the wire and rendered nowhere, deliberately; it is *the only*
field with that justification and a second is a defect, not a precedent.

**Paused is a display mode, not a severity** — `❙❙ paused · 6 alarms`, never instead of the
severity. The count is **omitted at zero** (`● all healthy`, never `● 0 alarms`). Same shape for
a failed poll: `⊘ stale · 6 alarms`. This is half of `PLAN.md`'s green criterion.

### 2.3 Sticky alarm banner (§6.4)

Any alarm-level condition pins a banner naming the condition, the value, and when it started;
it stays until the condition clears. Multiple conditions collapse into one banner with a count.
Watch-level colours its cell and never raises a banner.

⚠ **Standing conditions have no live subject right now.** `ufw enforcing = no` was the archetype
and it no longer holds, so the ledger, the suppression, the once-per-session log and the
"returns to full alarm the moment it changes" rule **must be proved by fixture** and cannot be
confirmed against the running box.

### 2.4 Grid and breakpoints (§6.1)

The ASCII layout in §6.1 is authoritative and maps 1:1 onto CSS grid columns/rows. Two placements
are settled and were wrong in earlier drafts: **COOLING spans rows 2–3 in columns 1–2**, and the
fan service state belongs to COOLING. Four breakpoints: ≥1600 (sparklines promoted to full line
charts), 1280–1599 (the design target), 900–1279 (2 columns, scrolling accepted), <900 (1 column
in priority order).

### 2.5 Assembly seams — small, and each already specified

| # | Item | Note |
|---|---|---|
| **2.5a** | `state === null` is *before the first poll*, not missing data | **One wrapper in assembly**, not nine `if` branches. Must not render `—`. ⚠ **Ruled 2026-09-08 (S-D): this governs ONLY the frame where the client state itself is `null`.** Once state exists, a `null` *field* renders `—` under invariant 1, on poll 0 exactly as on poll 400 — there is one vocabulary for "no reading", not two |
| **2.5b** | Age indicator needs **its own interval** (D2) | ⚠ Do **not** tick it off store changes — the store changes once at the `live → stale` crossing, which is *worse than never*: it looks right in a fast-cadence fixture and freezes on a real failure, the one thing the indicator exists to prevent |
| **2.5c** | `unknownStanding` renders in SAFETY, or comes **off** `RuntimeState` (D3) | Leaving a field that implies a mechanism which cannot fire is HANDOVER do-not-copy #9 |
| **2.5d** | Unique SVG `id`s across chart instances | Step 10 is the caller L4 assigned this to |
| **2.5e** | Chart/sparkline **sizing** (L9) | The grid's decision; primitives take it as a prop |
| **2.5f** | Replace `--table-scroll-max: 40vh` with `max-height: 100%` | Q2-S2's recorded stopgap, once a panel body has a real bounded height |

## 3. Inherited backlog that lands here

| # | Item | Shape |
|---|---|---|
| **D6** | `use-telemetry.ts` has **no test and no mutation** — verified: no `use-telemetry.test.ts` exists | Needs jsdom. First assertion: unmounting calls `stop()`. Invariant 6 — record what jsdom buys **and what it costs step 11's image** |
| **Q2 F9 (deferred half)** | An out-of-domain instant currently clamps; dropping it would leave a pegged mark whose tooltip names a *different* instant | A clamp-vs-drop **rendering** decision, not a one-line guard |
| **Q1 F4** | Nothing asserts a ⚠-bearing file belongs to some step's `LEDGER_FILES`; 2 files are in none (both mark-free today) | Deferred here because step 10 is the next step to **add a harness**, so the union actually changes and a real cross-harness runner earns its existence |
| **L11** | No guard stops a component hard-coding `' RPM'` instead of calling a formatter | Needs a canonical unit-name constant in `lib/` first |
| **O14** | Formatter `parts` variant, for a styled unit | **Only if the design calls for it** — do not split on whitespace |
| **O2/O3/O4** | Dot and count are one reduction; one reading one condition (dedupe by id); `sinceMs` is when the **confirmed** band was first observed | Named in HANDOVER §6 as step 10's |

**Already closed, so nobody goes looking:** `formatGB`→`GiB` (O19), `errorsForPanel` (D4),
`traceFor` (D5), `formatTimeOfDay` (2.4 — verified present at `lib/format.ts:536`), S19 and S30
(both settled in `SPEC.md`), A6 (step 3's ledger).

## 4. Known unknowns — the spec is silent, invariant 7 applies

1. **S11/G5's panel half.** The collector side is closed. What remains: what the **panel** renders
   for an em dash that has no `errors[]` entry and whose coloured neighbour is not a severity.
2. **The hook boundary** (§1 above) — precedent is strong but the spec does not say it.
3. Anything the nine panels hit that §6.2 does not describe. §6.2 describes bodies; §6.1 describes
   placement; between them there is real room for silence, and invariant 7 says **stop and record**.

## 5. ⚠ Recommendation: run this as THREE loops, not one

Q2 was one primitive pair and produced 13 adversarial findings, two spec questions and four
phases. Step 10 is nine panels plus a header, a banner, a grid and the assembly. As a single loop
its reconciliation would be adjudicating findings across the entire UI at once — and the parent's
review, now a required phase, would be auditing a table too large to audit honestly.

| loop | contents | why this cut |
|---|---|---|
| **10a — the shell** | assembly seams §2.5, header §2.2, banner §2.3, grid §2.4, `app/` wiring, D6/jsdom | Everything the panels sit inside. Settles the hook boundary **before** nine panels are written against a guess |
| **10b — the panels** | the nine of §2.1 | The bulk. Can itself split (GPU+CPU+MEMORY / COOLING+SERVING+STORAGE / SAFETY+LOG) if 10a's findings suggest it |
| **10c — the backlog** | §3's inherited items, L9/L11, F4's cross-harness runner, the `max-height` replacement | Deliberately last: F4's runner and L9's sizing both want to see what 10a and 10b actually built |

**10a is the one to start**, and its first job is the §1 decision.
