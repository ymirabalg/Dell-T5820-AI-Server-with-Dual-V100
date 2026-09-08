# Handoff — Q2, TEST phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `pipeline/steps/Q2-hover-and-table/build.md` (your primary subject), then `SPEC.md` §6.2
(~line 953) and §9's chart-interaction row, then `pipeline/ANCHOR.md` §4/§5/§8 and `PLAN.md`.

Branch `dashboard-frontend`, working directory `dashboard/`. Tree intentionally dirty.

---

## 1. What the build did

§6.2 requires charts to carry a hover layer and a table view as **defaults**. The build gave
`stacked-time-series-chart.tsx` and `sparkline.tsx`:

- a `view: 'chart' | 'table'` prop (default `'chart'`), caller-owned — because
  `components/purity.test.ts` forbids every React hook in `components/` by shape-match, so a
  primitive cannot hold its own toggle state;
- a **CSS-only crosshair** — adjacent-sibling `:hover` reveal over Voronoi-partitioned hover
  columns, no JS pointer tracking;
- native SVG `<title>` tooltips, exact-instant lookup;
- a **table view** rendering `EM_DASH` for null and a formatted numeral for zero;
- two new **required** props on `Sparkline` (`formatValue`, `formatTime`), deliberately required
  so the defaults cannot be silently skipped;
- **16 `Q2-`-prefixed mutations** in `steps/09-ui-primitives/regressions.py`.

## 2. Verified by the parent — do not re-derive

| Fact | Evidence |
|---|---|
| `pnpm verify` exit **0**, 67 files, **2235** tests (+25), no type errors | run by the parent on the handover tree, no harness running |
| `components/purity.test.ts` is **untouched** | `git diff --stat` on it is empty — the guard was not weakened to make this fit |
| Scope is clean | only `components/*`, step 9's harness, and the new `steps/Q2-hover-and-table/` |
| 16 `Q2-` mutations exist | counted in step 9's harness |

## 3. Your job — ANCHOR §8: read every test name against its body, check fixture symmetry, hunt equivalent and probabilistic mutations

### 3.1 ⚠ Highest risk: can these tests actually FAIL?

A CSS-only hover layer is **not observable in jsdom**. `:hover` never fires, and a
`*.module.css` rule is inert text to a test runner. So there is a real danger that the hover
tests assert **source text** — that a selector string exists in a file — rather than behaviour.
This project has a rule about precisely that: *"Guards over globals are not soundly fixable by
source text; pair them with a behavioural test."* And its harder-won one: **"a test that names a
property it does not check has appeared in every single step."**

For every hover-related test: what would have to break for it to go red? If the answer is "the
CSS file stops containing a string", say so plainly and judge whether the ⚠ mark is honest. A
source-text assertion is not automatically wrong — this project uses them deliberately — but it
must not be **described** as testing behaviour it cannot reach.

### 3.2 The 16 new mutations

Written to make a ledger go green, which is the circumstance that produces bad mutations. For
each: is it a **wrong implementation somebody would plausibly write**, does it redden
**deterministically**, and does it redden the test whose *name claims that property*? A
probabilistic mutation is **worse than none** — the ledger cannot tell it from a sound one.

⚠ **Watch for CSS-mutation theatre.** A mutation that edits a `.module.css` string and reddens a
test that greps that same string is a closed loop: it proves the test reads the file, not that
the file does anything. Say which of the 16 are of that shape.

### 3.3 ⚠ The two re-anchored pre-existing mutations

The build reports that `09-T13` and `09-T1` had anchors that collided with or silently re-aimed
onto the new code — one became ambiguous, one re-aimed onto a coincidentally-identical closing
pattern and produced a *compile error* rather than a clean signal. Both were re-anchored.

**Verify the re-anchoring did not weaken them.** A mutation moved to new anchor text can end up
testing something narrower than it did before, and the ledger will not notice: it only asks
whether *some* ⚠ test reddened. Read both against what they were written to catch.

### 3.4 Invariant 1 in the table view

**`null` is not `0`.** `null` renders `—`; zero renders the numeral **with its unit**. A table of
readings is the easiest place in this codebase to break it. Check **both directions** with
fixtures — "every boundary guard needs a fixture on both sides" is a rule three steps here have
already broken. Also confirm no unit string is hard-coded rather than coming from a formatter.

### 3.5 The two new required props

`Sparkline` gained required `formatValue`/`formatTime`. Required props are a breaking change to a
primitive. Confirm nothing in the tree still calls `Sparkline` without them (there should be no
production call sites yet — step 10 has not built panels — but confirm rather than assume), and
that the type-level test surface, if any, reflects it.

### 3.6 The cost claim

The build says hover columns are ~600 in the realistic case and 600×N adversarially, and that it
chose exact-instant matching over pixel-bucketing so a cross-series reading is never fabricated.
That is a defensible trade; check the **arithmetic and the claim**, not the preference.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0, never a printed summary
python3 pipeline/steps/09-ui-primitives/regressions.py    # 77 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never run `pnpm verify` alongside a harness, and never two harnesses at once.
- ⚠ **Do not poll for a running harness.** A `pgrep -f "regressions[.]py"` wait loop written into
  the same `bash -c` that ran the harness matches its **own** command line and spins forever —
  this cost five hours on 2026-09-08 (ANCHOR §9). Run harnesses as plain **sequential foreground
  commands**; they are serial by construction and need no poll.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Fixing IS in scope** for this phase — say what you changed and why.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.** Scope is
  `components/` and step 9's harness.
- Invariant 7: if the spec is silent, record it. The build already recorded one gap (§6.2's
  "per-mark tooltip on bars and dots" has no bar/dot primitive to attach to) — **assess whether
  that gap is stated correctly**, do not simply inherit it.

## 5. Deliverable

`pipeline/steps/Q2-hover-and-table/test.md`, then a short summary. A clean result stated with its
evidence beats a manufactured finding. End with `pnpm verify`, the step 9 harness result, and
`git status`. The parent will not read your transcript.
