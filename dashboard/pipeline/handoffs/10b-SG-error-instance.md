# Handoff — 10b-S-G: `errors[]` gains an optional `instance` (BUILD phase)

**Written by the parent, 2026-09-08, implementing an owner ruling.** Fresh agent, no memory of
this project.

Read: this file → `SPEC.md` **§4's `errors[].instance` block** (the ruling; search `10b-S-G`) and
§6.5 → `pipeline/HANDOVER.md` §0.3 and the `errors[]`/`errorsForPanel` sections →
`steps/10-panels-assembly/10b-reconciliation.md` (**F2**, and spec question 10b-S-G) →
`ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. **`SPEC.md` is modified by the parent** —
that is the ruling. **Do not edit it.** Everything else is committed at `da78491`.

---

## 1. Why

§6.5 requires that one `llama-server` instance's row show *"the unit state and the reason"* **while
the other is unaffected**. That is a structural requirement. §4's error shape cannot express it: an
entry carries a `source` and **no subject**.

So the code currently attributes a reason by **reading the message text** — matching a unit name,
an `<i>.env` path, or a port. It is implemented, tested, and honest about being a heuristic. Its
failure mode is the problem: **a collector rewording a message silently attaches an error to the
wrong instance, and nothing fails**, because a substring match cannot fail loudly. 10b's F2 found
the shipped fixture printing `connect ECONNREFUSED 127.0.0.1:8081` beside the **healthy** instance.

**The owner ruled: add the field.** Make the join structural.

## 2. ⚠ What kind of wire change this is — read carefully, I got this wrong once

`instance` is **added and optional**. So — unlike O19's `GB`→`GiB` rename — **an old server's
snapshot still validates**; it simply carries no instance, and every entry falls back to
panel-level rendering, which is exactly how a source with no subject already behaves.

**The redeploy is required for the feature to work, not to avoid a refusal.** I wrote the opposite
into `SPEC.md` earlier and corrected it; if you find any note still claiming a new client refuses
an old server's snapshot **for this change**, that is my error and you should flag it.

Consequence you may rely on: **this can land before the box is redeployed without breaking it.**

## 3. What to build

- **`lib/types.ts`** — `TelemetryError` gains an **optional** subject. Absent means *the entry
  concerns the panel, not one row*. Keep `source`'s **closed vocabulary** intact — it is closed
  because §6.5 requires exhaustive matching, and `errorsForPanel` switches on it.
- **The collectors that know an instance** — file it. **Enumerate which ones can and which cannot**
  in your notes; do not guess. An entry that genuinely has no instance must not invent one.
- **`lib/client/wire.ts`** — validate the new field. ⚠ This validator is the client's guard against
  a malformed snapshot; a new optional field must be *validated when present* and *accepted when
  absent*. Both directions need a fixture — "every boundary guard needs a fixture on both sides"
  is a rule three steps here have already broken.
- **`lib/fixtures.ts`, `lib/contract.test.ts`, `lib/types.test-d.ts`** — move with the contract, as
  O19's did.
- **The serving panel + `condition-lookup`** — ⚠ **replace the text heuristic, do not supplement
  it.** Two join paths where one is a heuristic is worse than the heuristic alone, because the
  fallback hides when the structural path fails. If a fallback is genuinely needed for entries
  with no instance, that is a *different* rule — state it explicitly.

## 4. The bar

- **Three harnesses are in play**: **step 5** (`serving`), **step 8** (`wire`/client), **step 10**
  (panels). A file you edit that is in a harness's `LEDGER_FILES` means **that harness must be
  re-run in full**. Say which you ran and why.
- New mutations are **`10b-`** prefixed (ids carry their creating step).
- ⚠ **Beware the equivalent mutation** — five reconciliations have now caught mutations turning
  vacuous when a new guard subsumed an old one. They print `DID NOT BITE`, which reads as an inert
  test when the truth is a vacuous mutation.
- ⚠ **Scope assertions.** `expect(html).toContain(…)` document-wide has fooled **four** loops here
  (`'paused'`, `'refresh'`, `'—'`, `'data-severity="none"'`). Assert on the row you mean.
- **Invariant 5:** a failed reading is a partial snapshot plus an `errors[]` entry — **never a
  500**. **Invariant 2:** read-only. **Invariant 1:** `null` is `—`, zero is the numeral with its
  unit.
- **The regression F2 found must be covered by a test that would fail without your change**: an
  error naming instance 1 must not appear on instance 0's row.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                              # green is EXIT 0
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
python3 pipeline/steps/08-client-runtime/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; **never two harnesses at once**. These are long
  (127 + 173 + 133 mutations); run them **sequentially in the foreground**.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; orphans killed twice).
- After each harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`** — no hooks in
  `components/`.
- **`ai-server` is read-only to this work** and you do not need it.
- **Invariant 7: if the spec is silent, STOP and record it.** §4 now names the field; it does not
  enumerate which sources carry one. That is a judgement to make and record, not a blank to fill
  silently.

## 6. Deliverable

`steps/10-panels-assembly/10b-sg-error-instance.md`: the shape you chose and why; **which sources
can and cannot carry an instance**, enumerated; how the old-server case behaves; what replaced the
text heuristic and proof the heuristic is gone; which harnesses you re-ran and their results; your
⚠ marks and mutations. End with `pnpm verify` and `git status`.

Report back a short summary. The parent will not read your transcript.
