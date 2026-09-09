# Handoff — 10f BUILD: the four rulings after 10e. **Degraded pages fit; `0x4` neutral; `Row` deleted; step 2's ledger runs again.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read: this file →
`SPEC.md` §6.1 (the two ⚠ paragraphs dated 2026-09-09, especially the last one) and §6.2's GPU
card paragraph → `pipeline/HANDOVER.md` §0.0, §0.9, §1, §8 (rows `10e-Q1`, `Q3`, `Q12`, `Q13`) →
`steps/10-panels-assembly/10e-reconciliation.md` §1–§3 → `steps/10-panels-assembly/10e-adversarial.md`
A9/A10/A11 → `steps/10-panels-assembly/10e-match-the-mock.md` §2.11 (degraded budgets) → `ANCHOR.md`
§4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at the 10e commit. Load the
`dataviz` skill only if you touch a chart (you should not need to).

## 1. Verified by the parent on the tree you inherit

- `pnpm verify` exit 0, **102 files, 2933 tests**; all nine harnesses run by the reconcile and
  audited: 02 red **only** on `02-R20`/`R30`/`R31`, 09 127/127, 10 212/212.
- Browser: `check-density.mjs` **ALL PASS** at 1280×1024 / 1600×1024 / 1920×1080, spare 263.2 /
  227.6 / 283.6 px, banner pinned overflow 0 — run by the parent. `measure-breakpoints.mjs`
  **10/12**: measurement 9 fails at 1280 by **27 px** and 1600 by **49 px** on its own fixture (this
  dev Mac's telemetry, every non-GPU collector failing with a long path). Slot heights on that
  fixture at 1280: cooling 652, cpu 342, safety 302, storage 289 — versus 384 / 216 / 159 / 144
  healthy. **That gap is entirely `errors[]` / `detail` text.**

## 2. The four items — owner's rulings, do not re-ask

### 2.1 Q1 — degraded pages fit: bound every notes block (SPEC §6.1, last ⚠ paragraph)

Every `PanelNotes` block and every `StatusRow` `detail` becomes a **fixed-height scroll box**, the
way the session event log's `.scroll` already is: `overflow-y: auto`, a fixed `height`,
**`position: relative`** (styles.test.ts's new rule — a scrolling box must be a positioned box — will
fail you otherwise, and it is right), `box-sizing: border-box`, `--surface-sunken` well. Messages
stay whole; nothing is truncated. **Decide the height per panel by measurement against 10e §2.11's
budgets** — the budget is what the healthy spare (§1) can absorb: at 1280 the sum of every panel's
worst-case notes growth must stay under ~263 px minus the banner's 65.7. Say the arithmetic in your
notes. Rows that carry ONE short message should not look boxed — consider a `max-height` that only
bites past N lines, but then prove the page height is bounded (a `max-height` bounds it as well as a
`height` does; a missing one does not). **Acceptance: measurement 9 passes at all three viewports on
BOTH fixtures** — `measure-breakpoints.mjs` as is (dev-Mac fixture), and `check-density.mjs` still
ALL PASS on `--fixture box`. Add a case to `measure-breakpoints.mjs` or `measure-arrangements.mjs`
that fabricates the **box's own DKMS message** (152 chars, `lib/collectors/safety.ts`) under SAFETY
and a two-line `dell-smm` message under COOLING, and asserts the page still fits — that is the
real-box degraded case, and it is not the Mac's.

### 2.2 Q3 — `0x4` beside a notable bit is a neutral, unbanded code chip (SPEC §6.2)

In `gpu-panel.tsx`'s throttle `Caption`: a reason whose severity is `normal` renders `Chip code` with
**no band** (no glyph, no colour); notable reasons keep their severity band. The healthy page is
unaffected (the line renders only when `decodeThrottleMask(...).notable`). ⚠ test both sides
(`0x4` alone → no line; `0x4 | 0x20` → one neutral chip + one banded chip) and back with `10f-`
mutations. Do not touch `lib/throttle.ts`'s severities — presentation only.

### 2.3 Q12 — delete the dead `Row` primitive

`row.tsx`, `row.module.css`, `row.test.tsx`, its `10e-R1`/`R2` mutations and `09-CS1`'s widening
over that stylesheet. Grep first: `<Row` must appear nowhere in production. Then run the dangling-
class and styles guards, and both step 9 and step 10 harnesses — retiring a mutation needs a
one-line reason in the harness at the place it was removed (the pattern the test phase asked for).

### 2.4 Q13 — re-aim `02-R20` / `02-R30` / `02-R31` so step 2's ledger runs again

`formatUptime` gained a `prefix` parameter; the three anchors name the old text. Re-aim each to the
**same property** on the current source (read what each was written to catch — the test phase's
`10e-test.md` §1 shows how to check a re-aim is not narrower). Then step 2's harness must **exit 0
and print its ledger** — 22 ⚠ marks checked was the diagnostic figure; you should see it or better.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
for s in 02-format-severity 03-collectors-gpu-host 04-collector-cooling 05-collectors-serving-storage-safety \
         06-telemetry-route 07-auth-login 08-client-runtime 09-ui-primitives 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done
```

- Mutation ids `10f-`, unique across all harnesses; ⚠ on load-bearing tests; fixtures both sides.
- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ never poll with `pgrep` (ANCHOR §9). `git checkout --` a stranded mutation.
- Close only browsers you launch; no `next dev` left on :39173/:39174; no `.env`; `next-env.d.ts`
  byte-identical. **Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken any guard.**
- Invariant 7: if the spec is silent, STOP and record it.

## 4. Deliverable

`steps/10-panels-assembly/10f-build.md`: per item what changed and the measured before/after
(measurement 9 on both fixtures; the new real-box degraded case; the per-panel notes heights and the
arithmetic); step 2's ledger output; harness totals; spec silences. Short summary back. The parent
will not read your transcript.
