# Handoff — Step 10c-1, ADVERSARIAL phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10c1-build.md` and `10c1-test.md`, then `SCOPE.md`, `SPEC.md`
§6.1/§6.2, `ANCHOR.md` §4/§5/§8, `HANDOVER.md` §0.3/§0.5, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10c-1 uncommitted.

## ⚠ You fix NOTHING

Findings only; reconcile adjudicates each. Every finding needs a **concrete failure scenario**.
Mark each **EXECUTED** or **REASONED**.

---

## 1. What 10c-1 is

The **first composed render in this project's history**: the nine real panels wired into
`app/dashboard-shell.tsx`, `PanelPlaceholder` deleted, a shell-owned table-view toggle (four
`useState` entries, `ChartViewToggle` beside each chart, never in the header), and a client-side
alarm-forcing escape hatch for the browser check.

## 2. Settled — do not re-open

| | |
|---|---|
| `pnpm verify` exit **0**, **94 files, 2617 tests**; `pnpm build` exit 0 | parent |
| **The escape hatch is provably dead in production** | parent verified **in the built bundle**: the call compiles to `(e.body, window.location.search, "production")` with `if("production"===l\|\|…)` — a baked literal, not a variable |
| **Duplicate DOM ids: genuinely clean** | test phase grepped `components/` — exactly one call site mints an `id` (the chart's hatch pattern) and every caller passes a `panelId`-prefixed value; `Sparkline` mints none |
| No `.env`, secret or dev server left behind | parent |

## 3. ⚠ The priority: a two-GPU machine tested with one-GPU fixtures

I confirmed it: **`lib/fixtures.ts` contains zero occurrences of a second GPU index.** Every shared
fixture enumerates GPU 0 only — on a box whose entire purpose is **2× V100**, whose grid has **two
GPU slots**, and whose §6.2 join is `gpu.index === serving.instance` across **two instances**.

The test phase found one consequence and fixed it: `cooling-panel.tsx`'s `gpu1Trace`
(`g.index === 1`) had **never been exercised**; mutating it to `index === 0` left the whole suite
green. It added `10c-CO4`.

**One instance fixed, the class unexamined — this is exactly 10b's invariant-1 shape**, where four
of nine panels were wrong and the sweep had stopped at four. So sweep it:

- **GPU 1's panel** — is anything about the second card asserted, or does `gpu1` render only under
  a fixture that has no GPU 1?
- **The GPU↔instance join for instance 1** — §6.2 warns this *"prints the wrong model on a card
  rather than failing visibly"*.
- **The header aggregate and the alarm count** over two cards rather than one.
- **Conditions and the event log** with two GPU subjects — `observeStaleness`, dedupe by id.
- **The grid** with both GPU slots occupied.

For each: is there a fixture, and would a plausible wrong implementation redden? Where the answer
is "no fixture exists", that is the finding — you need not build one.

## 4. The other two

### 4.1 ⚠ The CSS blind spot is total, and the test phase said so honestly

Every `.module.css` import resolves to `{}` in every test under this config, so **no test in this
suite can observe a class name — ever.** "No CSS module collision found" is therefore
*unfalsifiable*, not a pass. Two questions worth a finding each:

- What else does that void? Anything asserting on a class, a `data-*` used as a style hook, or a
  CSS-driven behaviour. 10a's grid placement depends on `className={styles.X}` — is *that* guard
  affected, or does it compare imported values symbolically?
- Is the **browser step** the only possible answer, making this an argument about 10c-3's scope
  rather than a defect here? Say which.

### 4.2 The escape hatch's *wiring* has zero coverage

The pure `force-alarm.ts` function is well tested. Its **call site in `use-telemetry.ts`** is not,
and `use-telemetry.ts` is the file that reached step 10 with no test at all (D6). Construct the
failure: what wrong wiring ships green? Note the parent has verified the production gate — this is
about the **development** path being wrong, not about it leaking.

### 4.3 Free hunting

Not limited to the above. Toggle state surviving a poll is "sound by React semantics but not
dynamically tested" — that is a claim, test it. §6.1's placement, §6.2's exhaustive header,
invariant 1 both directions, and the harness ledger are all fair game.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py       # 159 mutations
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; never two at once — **sequential
  foreground**. ⚠ **Never poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9).
- Experiments are fine; **revert them, confirm with `git status`**, leave the tree exactly as found.
- **If you run a dev server, stop it and leave no `.env` behind** — the parent checks.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 6. Deliverable

`steps/10-panels-assembly/10c1-adversarial.md`: numbered findings, each EXECUTED or REASONED with
a concrete failure scenario, plus **"what I attacked and could NOT break"**.

Report back a short summary. The parent will not read your transcript.
