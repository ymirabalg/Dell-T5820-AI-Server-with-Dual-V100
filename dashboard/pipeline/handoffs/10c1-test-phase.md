# Handoff — Step 10c-1, TEST phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10c1-build.md` (**your primary subject**), then `SCOPE.md`,
`components/panel-props.ts`, `SPEC.md` §6.1/§6.2, `ANCHOR.md` §4/§5/§8, `HANDOVER.md` §0.3/§0.5,
`PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10c-1 uncommitted.

---

## 1. What 10c-1 built

**The wiring** — `app/dashboard-shell.tsx` renders the nine real panels; `PanelPlaceholder` and
its test and CSS are **deleted**. **The table toggle** — shell-owned `useState`, one entry per
chart-bearing panel (GPU0/GPU1/CPU/COOLING), with a `ChartViewToggle` rendered **inside each panel
beside its own chart**, never in the header (§6.2 rules that out explicitly). **A client-side
alarm-forcing escape hatch** (`lib/client/force-alarm.ts`) for the browser check.

## 2. Verified by the parent — do not re-derive

| | |
|---|---|
| `pnpm verify` exit **0**, **94 files, 2616 tests**, no type errors | parent, this tree |
| `pnpm build` exit **0** | parent |
| **The escape hatch is provably dead in production** | ⚠ I verified this **in the built bundle**, not from the source: the call compiles to `(e.body, window.location.search, "production")` with `if("production"===l\|\|…)` — the env is a **baked string literal**, not a variable. The build's own correction was right in both directions: the code ships, the call cannot fire |
| No `.env`, no secret, no dev server left behind | parent |
| `PanelPlaceholder` is gone; the nine panels are wired | parent |

## 3. ⚠ Highest priority: composition is the point, and only one loop has ever seen it

**Nothing in this project rendered the real dashboard until this build.** Every panel test still
renders in isolation. The build reports finding two assumptions when it composed for real (an F16
test relying on a `data-panel-id` marker only the placeholder emitted; `everythingZero` enumerating
only GPU 0) and **no** SVG-id, CSS-module or overflow bug.

**That "no bug" is the claim to attack**, because it is the first composed render and the cheapest
place to be wrong. With all nine mounted in the real grid:

- Are there **duplicate DOM ids** anywhere — `id`, `aria-labelledby`, `for`, SVG `<defs>` ids?
  `panelId` namespaces what the panels mint; does anything else mint an id? The **toggle** is new
  and there are four of them.
- Do two panels' **CSS module classes** collide once all nine stylesheets load together?
- The build says composition found no overflow. **What would have shown one?** If the answer is
  "nothing in jsdom", say so — that is a real limit, not a pass.

### 3.1 The toggle's own risks

Four independent `useState` entries in the shell. Does toggling GPU 0 affect GPU 1? Does the state
survive a poll (a new snapshot arriving must not reset a reader's chosen view)? Does the toggle
appear on panels with **no chart**? And ⚠ **invariant 2 — read-only**: confirm it changes only the
browser's rendering.

⚠ **The granularity — one toggle per panel rather than per chart — is recorded as an invariant-7
decision.** Assess whether that recording is honest: is it genuinely a spec silence, or does §6.2
constrain it?

## 4. The rest

- **The deleted `PanelPlaceholder`** — confirm nothing still references it (`tsc` would catch an
  import; a **string** reference in a test or harness anchor would not). Check step 10's
  `LEDGER_FILES` and every mutation anchor.
- ⚠ **`everythingZero` needed a two-GPU fixture.** A fixture that enumerated one GPU while the grid
  has two slots is exactly the shape that hides a bug. Are there **other** fixtures with the same
  single-GPU assumption now that both slots render?
- **The browser check.** The build ran real Chrome, confirmed the ≥1600px promotion and the
  900–1279px layout, and reported `resize_window` **unreliable for pinning exact pixel boundaries**
  — a tooling limit, stated rather than faked. **Do not paper over it.** Assess: what does the
  check now actually guarantee, and what still rests on 10a's one-off manual pass?
- **New branches need their own mutations** (HANDOVER §0.5: a harness proves every ⚠ test *can*
  fail, never that every branch *has* one). 10b's A1 was an unmutated line in a mutated file — the
  toggle and the escape hatch are new branches.
- ⚠ **Scope every assertion.** A document-wide `toContain` has fooled **four** loops here; on a
  page with nine panels mounted it is worthless.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py       # 158 mutations
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; never two at once — **sequential
  foreground**. ⚠ **Never poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9).
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **If you run a dev server, stop it and leave no `.env` behind** — the parent checks.
- **Fixing IS in scope** — say what you changed and why.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 6. Deliverable

`steps/10-panels-assembly/10c1-test.md`, leading with §3's answer. Short summary after. End with
`pnpm verify`, the harness result, and `git status`.
