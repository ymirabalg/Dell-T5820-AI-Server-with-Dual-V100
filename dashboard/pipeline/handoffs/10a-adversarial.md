# Handoff — Step 10a, ADVERSARIAL phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10a-build.md` and `10a-test.md`, then `SCOPE.md`, then `SPEC.md`
§6.1/§6.2/§6.4/§6.5, then `ANCHOR.md` §4/§5/§8 and `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree intentionally dirty.

## ⚠ You fix NOTHING

Findings only; a reconcile phase adjudicates each ACCEPTED / REJECTED / DEFERRED, and a finding
you fix yourself is a finding nobody adjudicates. Every finding needs a **concrete failure
scenario** — the input or state, and the wrong output or missed detection.

---

## 1. What 10a is

The **shell**: header, sticky alarm banner, grid, `app/` wiring, D6, and step 10's new harness.
**The nine panel bodies are 10b's** — do not file findings asking for them.

Hook boundary settled: `components/` is **100% hook-free**; state lives in `useTelemetry` and a new
`useNowTick` (D2's independent age tick), both called once from `app/dashboard-shell.tsx`. New pure
modules `lib/client/banner.ts` and `lib/client/header-status.ts`.

## 2. Verified — attack only with evidence

| | |
|---|---|
| `pnpm verify` exit **0**, **77 files, 2343 tests** | parent, this tree |
| `purity.test.ts` untouched; **zero hooks in `components/`** | parent grepped the shape across all non-test `.tsx` |
| jsdom **dev-only**; runtime deps still exactly `next`/`react`/`react-dom` | parent read `package.json` |
| No secrets or `.env` left by the browser session; no stray dev server | parent checked |
| **§6.1 placement is MEASURED, not asserted** | the test phase ran `pnpm dev`, logged into the real dashboard in Chrome, and measured `getBoundingClientRect`/`getComputedStyle` at seven widths. COOLING's two-row span in cols 1–2, the <900 panel order, and the breakpoints **exact at the pixel** (899→1 col, 900→2, 1279→2, 1280→4). Sticky header confirmed live |

## 3. Where I would look

### 3.1 ⚠ The grid is verified by a MANUAL act that nothing repeats

This is the strongest lead and the test phase filed it honestly as residual. §6.1's placement is
**half of `PLAN.md`'s green criterion for step 10**, and the thing that proves it is a browser
session a person ran once. Nothing in `pnpm verify` or the harness will notice when a future edit
— 10b's nine panels landing in these cells, 10c's `max-height` change, a token rename — breaks
COOLING's span or moves a breakpoint.

Concrete: what edit silently violates §6.1 and ships green? Is there an assertion that would have
caught it — the emitted `className`/`style`, a CSS custom property, the grid template string
itself — that is an **honest** proxy rather than a source-text test named as though it proves
layout? Or is the real answer that this needs a browser step nothing currently runs, which is a
finding about the *pipeline*, not this code?

### 3.2 The props contract is prose with no exported type

The test phase found `10a-build.md` §2's `PanelProps` / SVG-id-discriminator contract exists only
as prose — **no exported type**, so 10b invents the actual prop name with no compiler-checked
precedent. Nine panels get written against it. Is that a documentation gap or a code gap? What
does the compiler currently permit that the prose forbids?

### 3.3 The unmarked test, and the ledger hole it leaves

A mutation was removed because it triggers a real React `useSyncExternalStore` pathology (OOM
rather than a clean failure), leaving its test **deliberately unmarked** — i.e. outside the ledger,
so the property is unprotected. Both earlier phases concurred. **Test that agreement**: is there a
*different* mutation reddening the same property without the pathology? If there genuinely is not,
say so — that is a legitimate answer and it is what the could-not-break section is for.

### 3.4 §6.4's obligations, which are reductions and easy to get subtly wrong

HANDOVER names these as step 10's: **O2** the dot and the alarm count are **one reduction**, and a
suppressed standing condition is **neither red nor counted**; the count is **omitted at zero**.
**O3** one reading, one condition — dedupe by id; channel 5's zero is carried by `fan5_absolute`
and is never a `fan_stopped` subject. **O4** `sinceMs` is when the **confirmed** band was first
observed, not when the reading first crossed.

⚠ **Standing conditions have no live subject** — `ufw enforcing = no` no longer holds — so the
ledger, the suppression, the once-per-session log and "returns to full alarm the moment it
changes" exist **only as fixtures**. Fixtures are where an untested branch hides. Check both
directions on every one: this project's rule is that every boundary guard needs a fixture on
**both** sides, and three steps shipped a guard tested in one direction only.

### 3.5 D2's age tick

The rule: it must **not** derive from store changes, because the store changes once at the
`live → stale` crossing — worse than never, since it looks right in a fast-cadence fixture and
freezes on exactly the real failure the indicator exists to catch. Would any test notice if
`useNowTick` were rewired to the store? Would any notice if its interval were 60 s instead of 1 s?

### 3.6 Invariant 1, in the one place it inverts

`state === null` is **before the first poll** and must **not** render `—`. Everywhere else `null`
**is** `—`, and zero is the numeral **with its unit**. The wrapper is the only place in the
codebase where a null means "not yet" rather than "absent" — check the seam between those two
readings, and check that the wrapper is genuinely the single guard the test phase says it is.

### 3.7 Free hunting

The above is where I would look; a finding I did not anticipate is worth more than a confirmation
of one I did. The header list is **exhaustive** (no IP, no kernel — four places once described it
and none agreed), and `MOCK.html` is a reference, never a source.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 34 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9, five hours lost). Plain
  sequential foreground commands.
- Experiments are fine; **revert them and confirm with `git status`**, leaving the tree exactly as
  you found it so reconcile knows what build and test left. If you run a dev server, stop it and
  leave no `.env` or secret behind — the parent checks.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 5. Deliverable

`steps/10-panels-assembly/10a-adversarial.md`: numbered findings, each with a concrete failure
scenario and what you ran or reasoned from — **mark clearly which are reasoned rather than
executed**, since layout largely cannot be executed in jsdom. Include **"what I attacked and could
NOT break"**; it tells reconcile where not to spend budget and has been load-bearing in every step.

Report back a short summary. The parent will not read your transcript.
