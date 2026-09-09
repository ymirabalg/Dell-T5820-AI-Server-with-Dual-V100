# Handoff — 10e, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10e-build.md` and `steps/10-panels-assembly/10e-test.md` (**your subjects**),
then `steps/10-panels-assembly/10e-match-the-mock.md` §2, §3, §6, §8, §9 (rulings at the top of §9),
`SPEC.md` §6.1 (rewritten today), §6.2, §6.3, §6.5, §6.6, `HANDOVER.md` §0.4–§0.8, §5, `ANCHOR.md`
§4/§5/§8/§9, `PLAN.md` (the seven invariants).

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10e build + test, uncommitted
(~80 entries). ⚠ **Ports 39174/39175 are the parent's demo server**, and Next 16 refuses a second
`next dev` in the same directory, so **`measure-breakpoints.mjs` and `measure-arrangements.mjs` are
unavailable to you**. The parent runs both at review. Reason about geometry from the build notes'
pasted anatomy and from the CSS; say what you could not verify because of this.

---

## 1. Verified by the parent

| | |
|---|---|
| `pnpm verify` exit 0 on the build tree (102 files, 2886 tests) | parent, before the test phase |
| The three `02-R20`/`R30`/`R31` orphans are pre-existing | parent (HANDOVER §1) |
| A stranded step-05 mutation left by a killed harness was restored | parent |
| The rest — the test phase's 2892 / exit 0, four harnesses green, 11 files fixed, the builder's check-density ALL PASS and 263/228/284 spare — are **the agents' claims** |

## 2. Where to aim

Everything below the fold in §6.5 — **the degraded states are where a density rebuild breaks**, and
the builder measured only the healthy page:

1. **State B on the new leaves.** A notable throttle mask (`0x20` with `0x4`), an `errors[]` line
   under each SAFETY row, a dell-smm message on COOLING, S-B stale ages on rows, a six-condition
   banner. Render each with `renderToStaticMarkup`: does every §6.5 string still appear once, in the
   right panel, and does 10e §2.11's budget hold in the DOM (row counts, no duplicated notes)?
2. **Invariant 1 in `Hero`, `Figure`, `Strip`, `ChanTable`, `Meter tickPercent`.** `null` → `—` with
   the real unit; `0` → the numeral with its unit (`0 RPM`, `0 W`, `0 %`). Fixture both sides of
   every one. What does `Hero` do with `Infinity`, `NaN`, a negative, a 5-digit RPM?
3. **`PanelShell chip` omitted vs `null`.** Can a panel that HAS readings end up with the chip
   omitted through any prop path? Can the session log ever show a hatched `—` again?
4. **S-E / S-A / S-D on the GPU card**: `gpus: null`, an absent card, the pre-first-poll shell, a
   card with every field `null`. Does the promoted (≥1600) wrapper render sanely with zero points,
   one point, all-null points, `domain` with all points outside it?
5. **F5 in anger.** SERVING with a 60-character model alias, `ctx 1,048,576`, health `unreachable`,
   port `65535`, in a 262 px column — does it wrap, or overflow? Do `secondaryLabel`/`inline`/
   `endPrefix` collide with S-G attribution notes under the row?
6. **F1.** With 200 log entries, is there ANY `.sr-only` or absolutely positioned element left whose
   containing block is outside `.panel`? Both table views open at once?
7. **The header.** Glyph-only buttons: keyboard reachable, `aria-label` matches the action
   (pause ⟷ resume flips), `title` present, the paused state still "announces loudly" (§6.2).
   Cadence/window selects still submit the right values.
8. **`Row` is production-dead** (test phase). What else is dead or half-dead after the rewrite —
   CSS classes, props, exports, `CHART_SIZE` keys, `test-support` fixtures? Does `styles.test.ts`'s
   dangling-class audit see dead CSS, or only dangling references?
9. **10e §6's 26 rows.** Grep the built strings against the spec's, not the mock's. Any `V100`,
   `17:00.0`, `GB`, `snapshot`, `model qwen`, `since 20`, `Tjmax`, `stalled` in `components/`?
10. **The mac-fixture overflow (silence #5).** The builder blames unbounded `errors[]` wrapping.
    Is that the whole cause? Would a single 300-character `errors[]` message on a real box
    (a long `journalctl` line) push a healthy page past the fold? That is not a Mac-only case.
11. **Re-aimed mutations after the test phase** — it re-aimed more (`10e-GP1..5`, restored
    `10b-CO5`). Same question as always: does each still catch the property it names?
12. **Tests that consume entropy, timers, or `Date.now()`** in the new files.

## 3. Rules

- **Fix nothing. Write findings with a concrete failure scenario each** (inputs → wrong output),
  severity, and the file:line. Number them `10e-A1…`.
- You MAY add throwaway scripts under the scratchpad or run `pnpm vitest run <file>` to prove a
  scenario; you may not leave new test files or edits in the tree. `git status` must match what you
  inherited when you finish.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
```

- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, one
  call; ⚠ never poll with `pgrep` (ANCHOR §9). Do not launch `next dev`. `ai-server` is read-only
  and you do not need it. Do not commit. Do not edit `SPEC.md` or `MOCK.html`.

## 4. Deliverable

`steps/10-panels-assembly/10e-adversarial.md`: findings first, most severe first, each with its
scenario and how you proved it (or "reasoned, not run" where the browser was unavailable); then what
you tried that held. Short summary back. The parent will not read your transcript.
