# Handoff — 10e, RECONCILE phase (background agent)

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10e-adversarial.md` (**15 findings — your primary subject**),
`steps/10-panels-assembly/10e-test.md`, `steps/10-panels-assembly/10e-build.md`, then
`steps/10-panels-assembly/10e-match-the-mock.md` §2, §3, §6, §7, §8, §9 (rulings at the top of §9),
`SPEC.md` §6.1 (rewritten today), §6.2, §6.3, §6.5, §6.6, `HANDOVER.md` in full (you rewrite it),
`ANCHOR.md` §4/§5/§8/§9, `PLAN.md`. The 10c-3 reconciliation
(`steps/10-panels-assembly/10c3-reconciliation.md`) is the model for the deliverable.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10e build + test + adversarial
notes, uncommitted (81 entries). **Ports 39173/39174/39175 are FREE** — the parent's demo is down.
The browser scripts are available to you and **you must run them** (§3).

---

## 1. What the parent has verified — inherit as fact

| | how |
|---|---|
| `pnpm verify` exit 0, 102 files, 2886 tests on the build tree; test and adversarial both report 2892 / exit 0 after the test phase | parent ran the first; the later two are agent claims you re-run |
| **A2's source claim is true**: `components/strip.module.css:26` is `white-space: nowrap` with no `overflow-wrap` | parent grep |
| **A3's source claim is true**: `cooling-panel.test.tsx:60`'s `chanValueFor` matches `class="[^"]*"` and returns only the text, so no ink class is asserted | parent grep |
| **A8's source claim is true**: `hero.tsx:52` puts `aria-label` on a plain `<div>` | parent grep |
| **A1's shipped edit is what 10e §7 specified**: `panel-shell.module.css:18` `position: relative` on `.panel`. Whether it *works* is A1's measured claim (page scrolls at ~15 log entries, 11,639 px at 500) — **re-measure it yourself with the harness at 200 entries before adjudicating**; 10d measured 4568 px for the same defect before 10e |
| The three `02-R20`/`R30`/`R31` orphans are pre-existing (HANDOVER §1) | parent |
| A stranded step-05 mutation left by a killed harness was restored earlier today | parent |

## 2. What you must do

1. **Adjudicate every `10e-A1…A15` ACCEPTED / REJECTED / DEFERRED, each with a reason** a reader can
   check against the tree. Rejections are audited hardest: name the line that refutes the finding.
2. **Apply what survives.** A1 needs a fix that is *measured* to work (the adversarial's controls:
   `.scroll { position: relative }`, or `overflow: hidden` on `.panel` — pick on measurement and on
   what else each would clip), and a ⚠ test that reddens if it is removed. A2: `Strip` values wrap
   like F5's `.value`. A3: assert the three inks. A4: guard OQ-4 at the call site. A5/A6/A7: the
   unguarded wirings and CSS lines — a `⚠` test + `10e-` mutation each, or a reasoned deferral.
   A8: fix the ARIA and restore "fan 5" to COOLING's accessible headline. A11: read §6.2/§6.3 —
   `0x4` is *normal, not a fault* and hidden when it is the only bit; when another bit makes the
   line notable, decide from the spec how `0x4` is presented, and if the spec is silent, **record
   it, do not choose**. A12/A13/A14: fix or reject with reasons.
3. **Owner questions — record, do not rule:** A9/A10 and the builder's silence #5 (nothing bounds
   an `errors[]`/row-explanation block; this box's own 152-char DKMS message costs 65.6 px against
   14.2 budgeted at 1280) — does §6.1's promise hold on a degraded page, and if so, by truncation,
   a scroll box, or a budget? Also: delete the dead `Row` primitive? Fix the three step-2 orphans so
   that ledger runs again? Put every open question in HANDOVER §8 with what the code does today.
4. **Run the browser measurements** — they have been run by exactly one agent so far:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
   node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
   node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
   node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json      # no --oq
   ```
   Record the outputs in the reconciliation. If measurement 9 fails under `--fixture mac` only,
   say so and tie it to the owner question above. Note whether A1's fix changed the 200-entry
   log measurement.
5. **Then, in ONE foreground call, serially: all nine `regressions.py`.** Then `pnpm verify` cold.
   Then `git status` for a stranded mutation.
6. **Write `steps/10-panels-assembly/10e-reconciliation.md`** (adjudication table first) and
   **rewrite `HANDOVER.md`**: §0.0 becomes "10e closed pending parent review — §6.1 measured
   TRUE/FALSE (say which) on the healthy page", the open owner questions in §8, the per-harness
   totals in §1, the rules this loop learned in a new §0.9. Update `ANCHOR.md` §2 state lines
   only if a fact there is now wrong.

## 3. The four things you must NOT do (ANCHOR §8)

1. **Do not commit.** The parent re-runs `pnpm verify` itself and commits after its review.
2. **Do not edit `SPEC.md` or `MOCK.html`.** Wording you want goes in your report, quoted.
3. **Do not claim green.** Paste exit codes and totals; the parent re-derives them.
4. **Do not soften a rejection.** A REJECTED row names the line that refutes the finding or it is
   DEFERRED with an owner.

## 4. Rules

- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ **never poll with `pgrep`** (ANCHOR §9). `git checkout --` any stranded mutation.
- Re-run every harness whose `LEDGER_FILES` you touch; new mutations carry `10e-` ids and must be
  unique across all harnesses (the test phase found one collision; keep it at zero).
- Close only browsers you launch; no `next dev` left on :39173/:39174; no `.env`;
  `next-env.d.ts` byte-identical afterwards. Do not weaken `purity.test.ts` or the other guards.
- `ai-server` is read-only and you do not need it.

## 5. Report back

Short summary: the adjudication counts (accepted / rejected / deferred), what was fixed, the three
browser outputs' verdicts (page fit and spare at the three viewports, banner, measurement 9, the
200-entry log height), nine harness totals, `pnpm verify` exit code, and the owner questions. The
parent will not read your transcript.
