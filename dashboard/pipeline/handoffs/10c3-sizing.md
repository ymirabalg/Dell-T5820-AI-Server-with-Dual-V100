# Handoff — Step 10c-3: sizing and visual (BUILD phase). **Step 10 closes with this.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project.

Read: this file → `steps/10-panels-assembly/SCOPE.md` (**you are 10c, last of three**) →
`pipeline/HANDOVER.md` §0.5, §0.6, §0.7, §9 → `SPEC.md` §6.1, §6.2, §6.7 → `ANCHOR.md`
§4/§5/§8/§9 → `PLAN.md`.

⚠ **Load the `dataviz` skill** — this loop is entirely charts, sizing and paint.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `6c2e64a`.

---

## 1. What this loop is, and one thing it is NOT

Seven items, all sizing or visual. ⚠ **`10a-F17` is NOT among them** — it was fixed and committed
at `3c37107`. `HANDOVER.md` claimed otherwise in three places and sent 10c-2's reconciliation to
re-own it; the parent corrected that on 2026-09-09. **`pnpm verify` is deterministic. If a test
fails, believe it.**

## 2. The seven

### 2.1 L9 — chart and sparkline sizing (the anchor item; several others depend on it)

Step 9 deferred sizing with: *"sizing is the grid's decision, and a primitive that picked its own
size would be deciding layout from a leaf."* Every loop since has passed a **defensible default**
rather than a canonical value — 10b recorded GPU's ≥1600px chart as `480×140`, explicitly a
recorded default.

**Decide the canonical answer and write it down.** The grid is real now (10a) and the panels are
wired (10c-1), so a size can finally come from the layout instead of a constant. ⚠ If the honest
answer is that a primitive should take a size **prop** whose value the grid computes, say what
computes it and where.

### 2.2 SCOPE 2.5f — `--table-scroll-max: 40vh` → `max-height: 100%`

Recorded as a **stopgap, not a considered value**, when Q2-S2 shipped: a viewport-relative bound
because no panel body had a bounded height. **10a's grid gives one now.** Verify that before
changing it — if a panel body still has no bounded ancestor, `100%` resolves to nothing and the
table grows again, which is the bug the stopgap was covering.

### 2.3 10b-F14b — no gap hatching at 1280–1599px

`Sparkline` takes **no `gaps` prop by design**, so `HANDOVER`'s *"hatch `state.gaps`, never a hole
in a series"* holds only ≥1600px, where the chart is promoted. The fix is either a new prop on
**step 9's primitive** or a different primitive at the design breakpoint — both are L9's question,
which is why they are in one loop. ⚠ A hole in a series that *looks* like a reading is worse than
a visible hatch; say which failure the 1280–1599px band currently has.

### 2.4 Q2-F9's deferred half — clamp vs drop

An out-of-domain instant currently **clamps**. Dropping it would leave a pegged mark whose tooltip
names a **different instant** — a rendering decision, not a one-line guard. Decide, and record why.

### 2.5 10a-F4's remaining half — the seven measurements, repeatably

10a measured §6.1's placement by hand in Chrome. 10c-1 built the alarm-forcing half and ran a real
browser, but **`resize_window` could not set the viewport** (`window.innerWidth` read a constant
3440), so five of seven measurements passed and the breakpoints could not be pinned. That is a
**tooling limit, cleanly separated from the app** — do not re-diagnose it, replace it.

⚠ **Invariant 6: no dependency without a recorded reason.** If this needs a headless browser,
record what it buys **and what it costs step 11's image** — and *verify* rather than assert, as
10a did for jsdom by inspecting `.next/standalone`.

### 2.6 10c1-A9 — scope the browser step to paint only

Established: **binding is observable today** (the CSS-module Proxy returns real hashed names) and
**dangling references are statically checkable** (10c-2's audit). **Only paint needs a browser.**
Keep the browser step to what only it can do.

### 2.7 The banner-item wrapping question

10c-1 recorded that a banner item works *"on `.rest`'s gap by luck, not design"*, and declined to
declare an `.item` rule because that would have been inventing. **Invariant 7 applies** — if §6.4
is silent on whether a banner item may wrap mid-condition, record it for the owner rather than
choosing.

## 3. The bar

- ⚠ **CSS and paint are not observable in jsdom.** A test that can only assert a stylesheet
  contains a string must **say so** and must not be named as though it proves behaviour.
- ⚠ **The `toContain` lint is live now** (10c-2) and so is the dangling-class audit. If a guard
  fires on your work, **it is probably right** — that is nine instances of the founding shape found
  so far.
- Mark load-bearing tests `⚠`; back each with a **`10c-`**-prefixed mutation.
- **HANDOVER §0.5:** a harness proves every ⚠ test *can* fail, never that every branch *has* one.
- **Invariant 1** both directions; **invariant 2** read-only.
- **Invariant 7:** if the spec is silent, **STOP and record it** — §2.7 is already one such.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 172 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**.
- ⚠ **Never poll for a harness** — the `pgrep` loop self-matches and spins forever (ANCHOR §9).
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **If you run a dev server, stop it and leave no `.env` or secret behind** — the parent checks.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**
- `ai-server` is **read-only** and you do not need it.

## 5. Deliverable

`steps/10-panels-assembly/10c3-build.md`: the L9 decision and what now computes a size; the 2.5f
verification (does a panel body have a bounded ancestor?); F14b's current failure and your fix;
Q2-F9's decision with reasoning; the browser step's shape, dependency reasoning and image
measurement; and every spec silence recorded.

⚠ **Also state what step 10 leaves behind** — this is its last loop, and step 11 (packaging) reads
your notes. Anything the nine panels or the shell assume about the environment belongs there.

Report back a short summary. The parent will not read your transcript.
