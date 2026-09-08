# Handoff — Step 10a, RECONCILE phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

⚠ You run as a **background subagent**. `ANCHOR.md` §8 lists **four things the parent does not
delegate** (restated in §5), and defines a **fifth phase — the parent's review** — which runs
after you and takes your notes as input. Read §8 first.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `steps/10-panels-assembly/SCOPE.md` →
`10a-build.md` → `10a-test.md` → `10a-adversarial.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty; 10a is unommitted.

## 1. The item

10a is the **shell** of step 10 — header, banner, grid, `app/` wiring, D6, and step 10's harness.
The nine panel bodies are **10b's**; do not pull them in. Adversarial raised **18 findings** (11
executed) plus a 10-item could-not-break section. Adjudicate **every one** ACCEPTED / REJECTED /
DEFERRED **with a reason**, apply what survives, re-run, write the notes.

## 2. ⚠ Confirmed by the parent — build on these, do not re-derive

| | |
|---|---|
| **F5** | `aggregateStatus(mode: RuntimeMode, alarms: number)` — the signature genuinely takes **no `severity`**. §9's O2 says the dot and the count are **one reduction**; this splits them structurally |
| **F13** | `header.module.css` is `position: sticky; z-index: 10`; `alarm-banner.module.css` is `position: sticky; z-index: 9`. The banner's own comment describes it as "directly under the header" — the bug is written down as intent |
| **F7** | `app/dashboard-shell.ssr.test.tsx` holds **3 tests** and does not exercise the non-null branch |
| green | `pnpm verify` exit **0**, 77 files, 2343 tests — parent, this tree |
| orphans | The wait loops the adversarial flagged are **killed**. Two were real; the count that looked like three was my own `grep` self-matching — the same defect class as the deadlock, one level up |

## 3. The two that decide whether 10a can close

### 3.1 F7 — the green criterion is green on a build that violates it

`PLAN.md`: step 10 is green when *"grid matches §6.1 placement; **paused shows mode and alarm
count**"*. The adversarial hard-coded `mode={'live'}`, `alarms={0}`, inverted pause/resume and
killed the cadence handler — **`pnpm verify` still exits 0 across all 77 files**. That ships a
header which can never say "paused" or "stale" and reads `● all healthy` on six alarms.

**This is the acceptance criterion for the step failing to test itself.** F8 is the same join gap
by deletion — removing `useNowTick` entirely (`nowMs = Date.now()`) is also green, so D2's whole
point dies silently. Treat F7/F8 as the centre of this reconciliation; if nothing else is fixed,
these must be.

### 3.2 F1/F2/F3 — §6.1's grid has two unguarded layers, and the inner one is plain TypeScript

`grid.tsx` binds placement with `className={styles.X}` but every test asserts only `data-slot`,
which **no stylesheet reads**. The adversarial rewired COOLING into the log's grid area leaving
`data-slot` untouched: **19/19 green, `tsc` clean**. The proposed proxy is cheap and honest —
assert the rendered `className` equals the imported `styles.<name>`. F3 is the recurring defect
again: the describe **names** "the `data-slot` the layout CSS keys on" when the CSS keys on the
class.

⚠ **F4 (a repeatable browser step) is proposed for 10c and I agree it is not yours** — but say so
explicitly rather than silently dropping it, and make sure `HANDOVER.md` carries it.

## 4. Judgement calls that are yours

- **F17 is cross-cutting and it undermines the definition of green.** `lib/collectors/serving.test.ts`'s
  ⚠ *"a slow discovery cannot band an alarm"* sleeps 95 ms inside a 100 ms budget; it failed one of
  the adversarial's `pnpm verify` runs unprompted and reproduced 2/6 under load. A **probabilistic
  ⚠ test** can be falsely credited by *any* harness ledger — `PLAN.md` says a probabilistic
  mutation is worse than none, and this is the same disease in the test. It lives in **step 5's**
  `LEDGER_FILES`, outside 10a's scope. Deferring it to 10c is defensible; **pretending green is
  deterministic while it stands is not.** Whatever you decide, `HANDOVER.md` must say plainly that
  `pnpm verify` is not currently deterministic and why.
- **F10** (a stale alarm pins the banner with nothing naming its age) and **F15** (logout's
  non-`keepalive` `fetch` can be dropped at unload, leaving an httpOnly cookie and a live 30-day
  session while the user sees a login screen — and a code comment asserts the opposite) are
  reasoned rather than executed. Judge them on the reasoning; F15's false comment is a finding in
  itself whatever you decide about the fetch.
- The adversarial **concurred** with build and test on the `useSyncExternalStore` mutation and gave
  a sharper reason: the pathology and the violation are the same event, since the snapshot *is* the
  runtime's state object. Three phases agreeing is not proof — but re-litigating it needs new
  evidence, not a fourth opinion.

**Rejections and deferrals are what the parent's review reads first**, because an accepted fix
leaves a visible diff and a rejected finding leaves nothing. Give them the better reasons.

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. **Do not commit or stage.** The parent commits after running `pnpm verify` itself.
2. **Your green is not the green** — run it, but the parent re-runs independently.
3. **Do not edit `SPEC.md`.** Record spec questions; the owner writes wording.
4. **Nothing outside `dashboard/`**, and **do not weaken `purity.test.ts`**.

Invariant 7 binds: if the spec is silent, **STOP and record it**.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py      # 34 mutations
```

- **nvm path first**; `$HOME/.local/bin/node` is v26.8.1 and shadows the pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop in the same `bash -c` that
  ran it matches its own command line and spins forever (ANCHOR §9). Plain **sequential foreground
  commands**. If you leave an orphan, the parent will find it.
- New mutations are **`10a-`** prefixed (ids carry their creating step).
- After a harness: `git status` for a stranded mutation; `git checkout --` it.

## 7. Deliverables

1. `steps/10-panels-assembly/10a-reconciliation.md` — the adjudication table with **all 18**,
   verdicts and reasons; what you applied; what you re-ran and its result; a "new gaps for the
   owner" section.
2. **Rewrite `pipeline/HANDOVER.md`** — it is authoritative for open obligations and has been found
   stale in the safe direction **six** times; re-check entries against `SPEC.md` rather than copying
   forward. It must carry F4, F17 and anything else you defer, and **the props contract 10b
   consumes**.
3. Correct `10a-build.md` where a finding shows it overstated (the props contract's exported type,
   at minimum).
4. Update `ANCHOR.md` §2.2 — 10a closing means **10b (the nine panels)** is next.

## 8. Report back

One line per finding with its verdict, what you applied, what you re-ran and its result, the spec
questions handed up, and anything left open. The parent never reads your transcript.
