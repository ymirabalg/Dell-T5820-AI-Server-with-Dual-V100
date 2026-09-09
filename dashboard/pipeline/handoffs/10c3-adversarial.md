# Handoff — Step 10c-3, ADVERSARIAL phase. **Step 10 closes after this loop.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10c3-build.md` and `10c3-test.md`, then `SCOPE.md`, `SPEC.md`
§6.1/§6.2/§6.7, `HANDOVER.md` §0.5–§0.7, `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10c-3 uncommitted.

## ⚠ You fix NOTHING

Findings only. Concrete failure scenario each. Mark **EXECUTED** or **REASONED**.

---

## 1. What 10c-3 is

L9's canonical `CHART_SIZE`; a **verification that declined a change** (no bounded ancestor, so
`--table-scroll-max: 40vh` stays); `Sparkline`'s new optional `gaps` prop (F14b); **drop-not-clamp**
via `clipPlotsToDomain` (Q2-F9); a `playwright-core` CDP measurement script (10a-F4); paint-scoping;
and the banner-wrapping spec silence.

## 2. Settled — do not re-open

| | |
|---|---|
| `pnpm verify` exit **0**, **99 files, 2788 tests**; `pnpm build` exit 0 | parent |
| `gaps={state.gaps}` at every chart call site; one `clipPlotsToDomain` feeds chart **and** table | parent grepped |
| Runtime deps still exactly `next`/`react`/`react-dom`; **no playwright package in `.next/standalone`** | parent. ⚠ Four files *name* it — our copied `package.json` and three inside **Next's own package**. The code does not ship; a `grep` will mislead |
| The six re-anchored step-9 mutations were **not** narrowed | test phase checked each by name against its original property |
| **No leaked browser** | parent: every Chrome process here is the user's own (one at 24 days' uptime; the recent one is a tab renderer) |

## 3. Where I would look

### 3.1 ⚠ Measurement #7 has NEVER been observed in a real browser

The test phase's sharpest finding: 10c-1 claimed to have confirmed #7 via `getComputedStyle`, but
that claim is **self-contradictory** — the "no GPUs enumerated" takeover branch never renders the
wrapper elements the claim says it read, and the same document records `gpus: null` as the live
condition at the time. So #7 rests on nothing, and today's script cannot run it (this Mac has no
GPU; `nvidia-smi: ENOENT`).

**Step 10 closes with this loop, so this is the last chance to state the residue precisely.** What
does #7 actually assert? Can it be reached with a **fixture-backed** snapshot rather than real
hardware — 10c-1's escape hatch forces an alarm client-side, so is there an equivalent lever for
GPU presence? If not, say plainly what steps 11 and 12 inherit unverified.

### 3.2 Drop-not-clamp, at the edges

The test phase covered all-out-of-domain and the isolated point. Push further: points **exactly on**
the domain boundary (inclusive at both ends? consistent with §6.7's window arithmetic?); a
**zero-width** domain; a series whose points share one instant; and the interaction with the **new
`gaps` prop** — does clipping a point adjacent to a gap change which hatch is drawn, or produce a
hatch with nothing on one side?

### 3.3 `Sparkline`'s new prop, from step 9's side

It is **optional**. What renders for a caller that omits it — the old smooth-line-across-a-gap bug,
silently? If so the fix is opt-in and the next consumer inherits the defect. Is there a guard that a
chart-bearing panel passes `gaps`, or only three call sites that happen to?

### 3.4 The measurement script as a pipeline artifact

Nothing runs it automatically. It is a `.mjs` outside the suite, so **no harness mutates it and
`pnpm verify` never executes it** — the same category as 10a-F4's original complaint, one level up.
Does it fail loudly if the app changes shape, or pass vacuously? What if a selector it depends on is
renamed?

### 3.5 Free hunting

Not limited to the above. ⚠ The `toContain` lint and dangling-class audit are live — **if either
fires, it is probably right** (nine instances found so far).

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/09-ui-primitives/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
```

⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**. ⚠ **Never
poll** (ANCHOR §9). Experiments: **revert and confirm with `git status`**. ⚠ **If you launch a
browser, close only what you launched** — the user's own Chrome is running on this machine.
**Fix nothing. Commit nothing. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 5. Deliverable

`steps/10-panels-assembly/10c3-adversarial.md`: numbered findings, EXECUTED or REASONED, plus
**"what I attacked and could NOT break"**. ⚠ **Also: what does step 10 leave unverified?** This is
the last adversarial pass on it, and step 11 reads your notes.

Report back a short summary.
