# Handoff — Q2, RECONCILE phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

⚠ You run as a **background subagent**, and `ANCHOR.md` §8 lists **four things the parent does
not delegate**, restated in §5 below. §8 also now defines a **fifth phase — the parent's review**
— which runs after you and which your notes are the input to. Read §8 before starting.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `steps/Q2-hover-and-table/build.md` →
`test.md` → `adversarial.md`. Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty:
7 modified files, 3 untracked pipeline paths.

## 1. The item

§6.2 requires charts to carry a **hover layer** and a **table view** as defaults, the table view
being an **accessibility floor**. Step 9 built the primitives before that amendment. Q2 added a
caller-owned `view` prop, a CSS-only crosshair (`.hoverZone:hover + .crosshairGroup`), native
`<title>` tooltips, a table view, two required `Sparkline` props, and 18 `Q2-` mutations.

Adversarial raised **13 findings** plus an 11-item could-not-break section. Adjudicate **every
one** ACCEPTED / REJECTED / DEFERRED **with a reason**, apply what survives, re-run, write notes.

## 2. Verified by the parent — these four are REAL, build on them

| | |
|---|---|
| **F1** | `hoverColumnsFor` appears **0 times** in `stacked-time-series-chart.test.tsx`. The geometry the whole feature rests on has no test naming it |
| **F2** | `.crosshairGroup { pointer-events: none }` confirmed, and the `<title>` is a child of the hover **rect**. So the zone tiles the plot at `pointer-events: all` and **shadows the per-mark dots underneath** — F2's occlusion claim is credible |
| **F3** | `role="group" aria-label={ariaLabel}` exists (line ~478) — the finding is that **no test covers it**, not that it is missing |
| **F10** | `.tableView` has **no `max-height` and no `overflow`** — confirmed by reading the CSS |
| green | `pnpm verify` exit **0**, 67 files, **2237** tests, no type errors — parent, on this tree |

**The adversarial refuted both of the parent's own §3.1 hypotheses** (that an `opacity: 0`
crosshair might block the next zone, and that a `<title>` might sit inside a hidden element).
Both were wrong; do not resurrect them.

## 3. Judgement calls that are genuinely yours

- **F1 is the most serious.** Three plausible defects each left `components/` fully green,
  including one where "snap to nearest" silently becomes "snap to **next**" — hovering a spike
  reports the following sample. A wrong reading presented confidently is worse than no tooltip.
  Its sub-finding is sharper still: the **test phase's own new adjacency test** names "its OWN
  crosshair group" but only counts adjacent pairs, so an off-by-one pairing passes. That is this
  project's recurring defect landing on the test written to close the previous gap — worth saying
  out loud in the notes.
- **F2 changes what the build recorded as a spec gap.** `build.md` §7 says §6.2's "per-mark
  tooltip on bars and dots" is *partially* satisfied; F2 says it is **entirely unmet**, because
  the marks are occluded. If F2 holds, the gap's wording must change — and note `Q2-H4`/`Q2-H5`
  would then be mutations protecting markup with no user-facing effect, which is its own finding.
- **F10 may be an owner question, not yours.** 1,202 `<tr>` for a 2 h window and ~722 for the
  default 30 min, unbounded, inside a fixed grid cell — against §6.1's **no-scroll promise**. The
  fixes (cap rows, decimate, scroll within the panel) each trade against a different part of the
  spec, and "scroll inside a panel" is arguably exactly what §6.1 forbids. **If the choice needs
  §6.1 or §6.2 reworded, that is the owner's** — record it precisely and do not invent wording.
- **F5, F6, F7, F8, F9** are ordinary correctness findings with stated reachability; the
  adversarial was honest about F6 being unreachable over the wire and F9 being medium-low. Judge
  them on that, and **reject the ones that do not earn their fix** — a rejection with a good
  reason is a fine outcome. **F11** (a stale comment claiming coverage that does not exist) and
  **F12** (three sparklines producing three identically-named tables) look cheap and real.

**Rejections and deferrals are what the parent's review reads first**, because an accepted fix
leaves a visible diff and a rejected finding leaves nothing. Give them the better reasons.

## 4. Re-running

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                  # green is EXIT 0
python3 pipeline/steps/09-ui-primitives/regressions.py       # 79 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness.** A `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever — five hours lost 2026-09-08,
  ANCHOR §9. Plain **sequential foreground commands**; serial by construction.
- After any harness: `git status` for a stranded mutation; `git checkout --` it.
- Any new mutation you add is **`Q2-`** prefixed (ANCHOR §9: the id carries its *creating* step).

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. **Do not commit or stage.** The parent commits, after running `pnpm verify` itself.
2. **Your green is not the green.** Run it — you need it — but the parent re-runs independently.
3. **Do not edit `SPEC.md`.** Record spec questions; the owner writes wording. F2 and F10 both
   likely produce one.
4. **Nothing outside `dashboard/`**, and **do not weaken `purity.test.ts`** to make anything fit.

Invariant 7 binds: if the spec is silent, **STOP and record it**.

## 6. Deliverables

1. `steps/Q2-hover-and-table/reconciliation.md` — the adjudication table with **all 13**, verdicts
   and reasons; what you applied; what you re-ran and its result; a "new gaps for the owner"
   section (expect F2 and F10 there).
2. **Rewrite `pipeline/HANDOVER.md`** — authoritative for open obligations, rewritten each
   reconciliation. It has been found stale in the safe direction five times; re-check entries
   against `SPEC.md` rather than copying them forward.
3. Correct `build.md` §7's spec-gap wording if F2 holds.
4. Update `ANCHOR.md` §2.2's queue — Q2 closing means the next item is **step 10**.

## 7. Report back

One line per finding with its verdict, what you applied, what you re-ran and its result, the
spec questions you are handing up, and anything left open. The parent has not read your
transcript and never will.
