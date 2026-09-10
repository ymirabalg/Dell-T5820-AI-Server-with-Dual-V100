# ANCHOR — resume point for the ai-server dashboard build

**Written 2026-09-07 by the session that ran steps 1–8, and updated when step 8 closed. It is
the only inheritance: the next session has no memory of that conversation.** Read this file,
then `PLAN.md`, then `HANDOVER.md`, then `SPEC.md`. Everything below is fact unless marked
otherwise.

---

## 1. What this project is

A read-only web dashboard for `ai-server` (the Dell Precision 5820 documented in the repo
root `CLAUDE.md`), showing GPUs, host, cooling, inference endpoints, disk/network and a
SAFETY panel of things that fail silently on that box.

| Artefact | Role |
|---|---|
| `dashboard/SPEC.md` | **1290 lines. Authoritative.** Every decision, with reasoning. Cite section numbers |
| `dashboard/MOCK.html` | Visual reference, four states. **A reference, never a source.** Do not import from it |
| `dashboard/pipeline/PLAN.md` | The 12 steps, the four-phase protocol, the **seven global invariants** |
| `dashboard/pipeline/HANDOVER.md` | Rewritten by each reconciliation. **The authoritative list of open obligations** |
| `dashboard/pipeline/steps/NN-*/` | `build.md`, `adversarial.md`, `review.md`, `reconciliation.md`, `regressions.py` per step |

The spec was hardened by the build itself: **roughly 100 defects were found in it** by the
adversarial and review phases and fixed before they became wrong code. Several were serious
(a dead GPU fan rendering green; the header going green while a card sits at 90 °C).

---

## 2. State — READ THIS FIRST. Written 2026-09-09 by the session that ran Q1–Q3, 10a–10c, 10d, 10e and 10f; it is the only inheritance.

### 2.0 ⚠ The one-paragraph version

> ⚠⚠ **CORRECTED AND EXTENDED 2026-09-10 by 10g's reconciliation, and read this paragraph first.**
> 10e and 10f are **committed** (`8ad8b9c`, `5769522`); **10g** is the uncommitted work. §6.1's
> promise is measured TRUE on every fixture this project grades — healthy (263/228/284 px spare),
> all-collectors-failed (140/104/160), the real box's DKMS failure (164/129/185) and the
> all-sources-explained page (41/6/62) — and 10g's adversarial then measured it **FALSE on
> ordinary telemetry no fixture carries**: one notable throttle mask, or §6.3's four alarm bits,
> or a third `llama-server` instance §3.4 requires to work, or a `model` that is a path, each
> breaks the fold on its own. So the owner ruled on 2026-09-10 that **the GRID itself is bounded**
> — every panel gets a max-height from its grid row and its body scrolls, head pinned — plus a
> `+N more` banner and `model` rendered as its filename. That is **10h**, and it is what closes
> §6.1 for good. Everything below stands as the record of how the term-by-term approach ran out.

**Step 10 is built and, as of 10f (2026-09-09, uncommitted), it MEETS §6.1's only quantitative
promise on the healthy page AND on a degraded one.** The build used to overflow the fold by
356 / 418 / 362 px at 1280×1024 / 1600×1024 / 1920×1080; measured on today's tree with
`--fixture box` it **fits at all three with 263 / 228 / 284 px to spare, and still fits with §6.4's
alarm banner pinned**. The cause was never the grid — `MOCK.html`, the same four-row nine-panel
layout, always fitted — it was density, and 10e brought `components/` to the mock's. **10e's one
remaining failure is CLOSED:** the owner ruled the promise unconditional on telemetry, 10f made
every `errors[]` block a bounded scroll box, and `measure-breakpoints.mjs` is now **16/16, exit 0**
— measurement 9 (all seven non-GPU collectors failed) passes with 140 / 104 / 160 px to spare, and
a new measurement 10 grades the real box's own DKMS failure at 157 / 122 / 178. **What is left is
three UNBOUNDED terms, none of them 10f's and all of them spec wording:** the chart table views
(five reachable at once at 40vh each — measured +851 px on a healthy page), §6.4's banner (no cap
at all), and the throttle line. They are `HANDOVER.md` §8's `10f-Q1`, `10f-Q2` and `10e-Q2`.
**Next: the parent's review of `steps/10-panels-assembly/10f-reconciliation.md`, then a commit,
then step 11.**

### 2.1 Branches and tree

```
main                 3f06e98   [origin/main]                 backend, pushed. Untouched since
dashboard-frontend   5769522   [origin/dashboard-frontend]   10f is the last commit (10e is 8ad8b9c)
```

⚠ **CORRECTED 2026-09-10 by 10g's reconciliation — the two lines above said `5d9b00e` and "10e AND
10f", both of which stopped being true when 10e and 10f were committed on 2026-09-09.**

⚠ **The tree is DIRTY and that is 10g**, uncommitted on `5769522`: `SPEC.md`'s three 2026-09-10
rulings and `WORK-ITEMS.md`'s three rows (the parent's), the 10g build/test/adversarial/reconcile
work under `components/`, the two touched harnesses plus the shared ledger block in all NINE, the
two measurement scripts, and the untracked phase notes and handoffs. `git status` is ~35 entries.
Nothing under `proxy.ts`, `next.config.mjs`, `lib/` or `app/` is touched by 10g, there is no
`.env`, and `next-env.d.ts` is byte-identical. **Verify with `git status` before trusting any of
this**; a stranded harness mutation looks exactly like an intended edit.

### 2.2 What is closed

| loop | commit | what it was |
|---|---|---|
| Q1 | `62dcbdf` | the ⚠-scanner could not see multi-line `test.each`; 39 marks were invisible |
| Q3 | `80e7211` | mutation ids carry their creating step (`07-R3`, `Q1-SC1`) |
| Q2 + S1/S2 | `ac9eee1`, `88bb2e9` | hover layer + table view; owner rulings |
| 10a | `b4ffa3e` | the shell; the green criterion had not tested itself |
| 10a-F17 | `3c37107` | `pnpm verify` made deterministic (fake timers; `deadline.ts` untouched) |
| 10b + S-F + S-G | `bdc1c5c`, `da78491`, `be53c8d` | nine panels; invariant-1 coverage was illusory; `errors[].instance` |
| 10c-1 | `a0c2c0e` | panels wired — the first composed render; a fixture that could not tell two GPUs apart |
| 10c-2 | `6c2e64a` | five guards; one of them punished the fix |
| 10c-3 | `7de7dd3` | sizing/paint; **§6.1 measured false** — step 10 closed-with-a-known-failure |
| 10e | ⚠ **uncommitted** | the density build; **§6.1 measured TRUE on the healthy page**; F1's shipped fix measured worthless and re-fixed |
| 10f | `5769522` | the owner's four rulings: bounded `errors[]` wells (**§6.1 now measured TRUE on a DEGRADED page**), the neutral `0x4` chip, `Row` deleted, step 2's ledger re-aimed and running |
| 10g | ⚠ **uncommitted** | the owner's four rulings of 2026-09-09: the table view inside the chart's own box, §6.4's fixed-height banner, the throttle line as a one-line well + `roomy` 46 px, and the fade / `… N more` affordance. **Its adversarial then measured §6.1 breakable on hostile telemetry**, which is what the owner ruled on the day after (§2.0) |

Suite at `7de7dd3`: **99 files · 2793 tests · exit 0**; nine harnesses, ~947 mutations, every ledger clean.
Suite at `5769522` (10f): **101 files · 2967 tests · exit 0**; nine harnesses, **1093** mutations,
all nine exit 0 — including step 2's, whose three orphaned anchors 10f re-aimed.
⚠ Suite on today's dirty tree (10g): **101 files · 3010 tests · exit 0**; nine harnesses,
**1130** mutations, **all nine exit 0** — zero anchors moved or ambiguous, zero `DID NOT BITE`,
zero unmatchable ledger keys (that last one is now a FAILURE rather than a warning, 10g-A7).
Browser: `measure-breakpoints.mjs` **30/30 exit 0**, `check-density.mjs` **ALL PASS**. Numbers go
stale on every item; the authoritative ones are each harness's own printed line and
`HANDOVER.md` §1.

### 2.3 ⚠ 10d and 10e — the design investigation, and what was withdrawn

**10d** (uncommitted, keep as a record): a layout re-plan that measured three re-arrangements and
recommended "arrangement B" (COOLING in its own column, SERVING + the event log in a closed
`<details>`). **Its recommendation is WITHDRAWN** — the owner rejected the shape, and the mock
measurement above proves the shape was never the problem. **What survives from 10d:** the measured
overflow numbers; ~200 px of the earlier 560 was this GPU-less Mac's `errors[]` notes; and two
**shipped defects it found by measuring**: **F1** — the session event log grows the *page* through
its clipped scroll box because `Chip`'s absolute `.sr-only` spans escape (fix: `position: relative`
on `.panel`); **F5** — SERVING's instance row overflows horizontally below ~450 px (fix: let
`status-row`'s `.value` wrap). **The owner ruled: fix both.**

**10e** = the builder spec to match the mock's density. Status at the time of writing: **PENDING —
see the line immediately below, which the parent updates when the agent reports.**

> **10e status: BUILT, TESTED, ATTACKED and RECONCILED — 2026-09-09, uncommitted, awaiting the
> parent's review.** The spec is `steps/10-panels-assembly/10e-match-the-mock.md`; the four phase
> notes are `10e-build.md`, `10e-test.md`, `10e-adversarial.md` and **`10e-reconciliation.md`**
> (read that one first — its §1 is the adjudication of all fifteen adversarial findings).
>
> **Where it landed.** `pnpm verify` exit 0 — 102 files, 2933 tests. `check-density.mjs`
> **ALL PASS** at all three viewports with no `--oq` flag (four of the nine slots at exactly 0.0 % of target),
> spare 263.2 / 227.6 / 283.6 px, banner pinned still overflow 0. `measure-breakpoints.mjs` 10 pass
> / 2 fail / 12 total — measurement 9 fails at 1280 and 1600 **under the dev-Mac fixture only**.
> All nine harnesses run: eight exit 0, `02` exits 1 on the three pre-existing orphans and nothing
> else; 1061 mutation ids, zero collisions.
>
> ⚠ **The two defects 10d found are both closed, and F1 was closed WRONGLY first.**
> `panel-shell.module.css`'s `.panel { position: relative }` — the fix 10e §7 specified — measures
> **5189 either way** at 200 log entries; the fix is `position: relative` on the CLIPPING box
> (`.scroll`, and `.tableView` in both chart primitives), after which the page is 1024 at 200 and at
> 500 entries. F5 was fixed and then **re-created one primitive over** in the new `Strip`. Both are
> in `HANDOVER.md` §0.9, which is the five rules this loop paid for.
>
> **Thirteen owner questions** are open in `HANDOVER.md` §8 as `10e-Q1`…`10e-Q13`. `10e-Q1` — does
> §6.1's promise hold on a DEGRADED page, and if so what bounds an `errors[]` block — is the one
> that decides whether step 10 is finished.
>
> ⚠ **FOUR OF THEM ARE NOW RULED AND BUILT — that is 10f** (2026-09-09, uncommitted):
> `10e-Q1` (unconditional; every `errors[]` block is a bounded scroll box), `10e-Q3` (the neutral
> unbanded `0x4` chip), `10e-Q12` (`Row` deleted, two orphaned properties ported rather than
> dropped) and `10e-Q13` (the three anchors re-aimed; step 2's ledger runs again).

### 2.3a ⚠ 10f — the four rulings, built

> **10f status: BUILT, TESTED, ATTACKED and RECONCILED — 2026-09-09, uncommitted, awaiting the
> parent's review.** The handoff is `handoffs/10f-degraded-fit.md`; the four phase notes are
> `10f-build.md`, `10f-test.md`, `10f-adversarial.md` and **`10f-reconciliation.md`** (read that
> one first — its §1 adjudicates all ten adversarial findings and its §3 is the only
> re-measurement of the two that decide the loop).
>
> **Where it landed.** `pnpm verify` exit 0 — **101 files, 2967 tests**. `measure-breakpoints.mjs`
> **16 passed / 0 failed / 16 total, exit 0** (measurement 9 now passes at all three viewports;
> measurement 10, new, grades the real box's own DKMS failure and asserts its own precondition
> first). `check-density.mjs` **ALL PASS**, healthy spare unchanged to the digit — the wells render
> nothing at all when `errors[]` is empty, which is the whole point of `max-height` over `height`.
> All nine harnesses run serially, **all nine exit 0**, 1093 mutations, every ledger clean.
>
> ⚠ **What 10f did NOT close, measured by its reconciliation and now the owner's:** a chart's
> **table view** is bounded only per component at 40vh and five are reachable at once (**+851 px
> on a HEALTHY page**, `10f-Q1`); §6.4's **banner** has no cap and grows with its TEXT rather than
> its alarm count (`10f-Q2`); and on the worst arithmetic page — every source explained while every
> reading is still present — the page is **1 px over at 1600×1024** with an ordinary two-alarm
> banner (`10f-Q3`). Six owner questions in all, `10f-Q1`…`10f-Q6`, in `HANDOVER.md` §8.

### 2.4 Rulings that STAND (do not re-ask)

- **Fix §6.1 before step 11.** Packaging waits for a page that meets its own spec.
- **Keep the 1280×1024 promise** — the wall is not assumed to be 1920-only.
- **Fix F1 and F5 both**, now.
- ⚠ **`MOCK.html` is the source for FORM only** — density, anatomy, type scale, spacing, chart
  sizes. **Data, strings and rules come from `SPEC.md`; where they disagree the spec wins.** Owner's
  words: *"the mock is a mock; the data predates the mock is a rule — if the mock says V100 but the
  data says PG500-216 then it is PG500-216."* So the raw driver name, full bus id, `GiB`, invariant
  1, the throttle rules and every S-* ruling stand exactly as built. (Also in §9.)
- The four 10a spec rulings (S-A `● no readings`, S-B `last read 6:12 ago`, S-C elapsed `for 2 d
  06:00`, S-D invariant 1 governs) and the four 10b ones (S-E `card not enumerated`, S-F never green
  over an em dash, S-G `errors[].instance`, S-H one message per source) are all in `SPEC.md`.

### 2.5 Rulings that are SUPERSEDED by the mock finding (do not implement)

The owner answered seven 10d questions before the mock was measured. **These no longer apply**:
the `<summary>` disclosure and moving SERVING/the log off the wall (10d Q2, Q4); one chart width
"400 everywhere" and `plotHeight` 100 (Q5, Q6 — sizes now come from the mock: sparkline **38 px,
50 at ≥1600**; COOLING pair **84 + 10 + 46 + 14 = 160 px**).

⚠ **CORRECTED 2026-09-10 — stage 2 "bound the grid" (10d Q3) is now RULED, not deferred.** This
entry used to read *"deferred, not ruled out — re-evaluate only after the density fix is measured,
since the mock's own numbers say it may be unnecessary in the healthy state."* The density fix was
measured and the healthy page has 227–284 px of spare, exactly as predicted — but four loops then
bounded one term each (notes wells, table views, the banner, the throttle line) and a new unbounded
term appeared every time. 10g-A1 measured four of them breaking the fold on the same page on
2026-09-10, and the owner ruled the grid bounded (`SPEC.md` §6.1, `WORK-ITEMS.md` §11). It is
**10h**. The "unnecessary in the healthy state" reasoning was right about the healthy state and
that was the wrong state to reason about.

### 2.6 ⚠ What to do next, in order

> **Progress 2026-09-09, evening:** **10f is COMMITTED at `5769522`** (full loop; parent re-ran verify
> 2967/exit 0 and all browser measurements: m9 140/104/160, m10 157/122/178, density ALL PASS).
> §6.1 holds on healthy AND all-collectors-failed pages. The owner then ruled the last four
> (SPEC §6.1/§6.4, WORK-ITEMS §11): **10g** = table view inside the chart's box (10f-Q1) · fixed
> two-line scrolling banner (10f-Q2) · throttle line as a one-line well + roomy wells to 46 px, then
> re-measure the all-explained page (10f-Q3/10e-Q2) · `… N more` affordance (10f-Q4/Q5). **10g's build
> was launched from `handoffs/10g-bounded-terms.md`**; test → adversarial → reconcile → parent review
> follow, then step 11. Still open, none blocking: `10e-Q4`–`Q11`, `10f-Q6`.

> **Progress 2026-09-09, later:** **10e is COMMITTED at `8ad8b9c`** after the full loop (build ×2,
> test, adversarial, reconcile, parent review — parent re-ran `pnpm verify` 2933/exit 0 and all three
> browser measurements itself). §6.1 is measured TRUE on the healthy page with 263 / 228 / 284 px
> spare and the banner pinned. The owner ruled four of the thirteen 10e questions the same day
> (SPEC §6.1/§6.2, WORK-ITEMS §11): **10f** = bound `errors[]`/`detail` blocks so DEGRADED pages fit
> (Q1) · `0x4` neutral chip (Q3) · delete `Row` (Q12) · re-aim `02-R20/R30/R31` (Q13). **10f's build
> was launched from `handoffs/10f-degraded-fit.md`**; test → adversarial → reconcile → parent review
> follow, then step 11. Remaining open owner questions: `10e-Q2`, `Q4`–`Q11` (HANDOVER §8).

> **Progress 2026-09-09, end of day:** steps 1–5 below are **DONE**. The owner ruled on all nine
> questions (banner **unconditional**; OQ-1/2/3/5/6 **declined**; OQ-4 **no chip** on the log;
> **OQ-7 keep BOTH CPU traces** → CPU target 216.1 / 240.1 / 240.1; OQ-8 recorded), `SPEC.md` §6.1/§6.2
> were rewritten by the parent, and the **full 10e loop ran**: build → test → adversarial →
> reconcile, all four notes in `steps/10-panels-assembly/`. Acceptance was measured, twice, by two
> sessions: `check-density.mjs` **ALL PASS**, `measure-breakpoints.mjs` **10/12** with measurement 9
> failing under the dev-Mac fixture only. **What is left is the parent's review and the commit.**

1. ✅ **DONE** — 10e's spec was written and its owner questions put to the owner.
2. ✅ **DONE** — all nine ruled.
3. ✅ **DONE** — `SPEC.md` §6.1/§6.2 rewritten by the parent.
4. ✅ **DONE** — the density build ran as a full loop. ⚠ **What is NOT done is the fifth phase:**
   **the parent's review** (§8 — re-run `pnpm verify` yourself, read every rejection and deferral in
   `10e-reconciliation.md` §1, spot-check the headline claims against the tree, then commit). Start
   with §8's four checks and with that file's own §8, which names what to check first.
5. ✅ **DONE** — the real app is measured. `measure-breakpoints.mjs` does **not** exit 0: it is
   10 pass / 2 fail, and both failures are measurement 9 under the **dev-Mac** fixture, where every
   Linux-only collector has failed. Under `--fixture box` the page fits at all three viewports with
   227–284 px to spare, banner included. **Whether that is enough is `HANDOVER.md` §8's `10e-Q1`,
   and it is the owner's** — do not treat the non-zero exit as a density regression.
6. **Then rule on stage 2** ("bound the grid", §2.5) with those numbers — on this evidence it looks
   unnecessary in the healthy state.
7. Then **step 11** (packaging), then **redeploy the box** (owner ruled: at step 10 complete; it
   still serves `b3969cd`).

### 2.7 Owner questions still open, carried from earlier loops

S-G-Q1…Q4 (`HANDOVER.md` §8), F14a (a `:—` copy nit), D1 (the log's third feed), 10b-S-F's "its own
readings" definition (recorded, not questioned). The banner question is **ruled** (unconditional,
`SPEC.md` §6.1) and superseded by **`10e-Q1`**, which is itself ruled and built.

⚠ **Updated 2026-09-10.** Of 10e's thirteen, `10e-Q1`/`Q3`/`Q12`/`Q13` were ruled and built by 10f
and `10e-Q2` by 10g; `10e-Q4`–`Q11` stay open. Of 10f's six, `10f-Q1`–`Q5` were ruled and built by
10g and `10f-Q6` stays open. 10g adds **`10g-Q1`…`10g-Q4`** (`HANDOVER.md` §8) and the owner has
already ruled its three biggest findings into **10h**: the grid is bounded, the banner shows what
fits plus `+N more`, and `model` renders as its filename.

### 2.8 Things this session learned that the next one must not re-learn

All recorded in §8/§9 — the short list: **the parent reviews every reconciliation** (a fifth phase);
**a `pgrep` wait loop in the same `bash -c` that ran the harness deadlocks** — do not wait, run
harnesses sequentially in the foreground; **`grep -c "while pgrep"` self-matches** — use a bracket
pattern; **a heredoc written to a relative path from the wrong cwd fails silently while the trailing
`echo` prints "written"** — `ls` the file; **`pgrep -f chrome` matches the user's own browser** —
never kill what you did not launch; **the handover was stale in the dangerous direction once**
(it said F17 was open a day after it was fixed) — check `git log` before re-owning an item.

## 3. Toolchain

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
```

- **The `nvm` path must come first.** `$HOME/.local/bin/node` is a symlink to
  `~/.hermes/node` (**v26.8.1**) and shadows the pin. The image ships `node:24-slim` and
  `.nvmrc` pins 24; testing on 26 is the skew step 1 removed and step 4 found reintroduced.
- `~/.local/bin` is still needed — `pnpm` (12.3.4) lives there, activated via
  `corepack enable --install-directory ~/.local/bin`.
- Dependencies: **`next`, `react`, `react-dom` only**, plus five dev. No native modules. Auth
  uses Node's built-in `scrypt` precisely to keep it that way.

---

## 4. What "green" means, and how to verify integrity

**Green is `pnpm verify` exiting 0. Never a printed summary.** Three separate failure shapes
were found where the counters read clean on a failing run — including one where a
non-compiling test file silently drops its tests from the total. `verify` is
`tsc --noEmit && vitest run` and now runs **cold** (it clears `tsconfig.tsbuildinfo` first,
after a false *pass* was observed on a tree with a real `TS2305`).

### Integrity procedure

**`git status` now works** — the tree is committed (`71a2f7d`), so a stranded mutation from a
killed harness shows as a modified file. That is the primary check; use `git diff --stat`.
Before the commit it did not work, because an untracked `dashboard/` collapses to `?? ./`,
and the phases used an md5 manifest instead. That manifest form still works and is what the
step-8 progress brief references:

```bash
find lib app proxy.ts -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | xargs md5 > /tmp/manifest.before
# ... run phase ...
find lib app proxy.ts -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | xargs md5 | diff - /tmp/manifest.before
```

**Never run `pnpm verify` concurrently with a `regressions.py` harness.** It produces a
plausible false `TS6133` and a ledger that falsely reports ⚠ tests as uncovered. Run serially.

---

## 5. The process

Each step runs **build → adversarial → review → reconciliation**, each phase a **fresh agent
with clean context**, receiving only `PLAN.md`, `SPEC.md`, `HANDOVER.md`, and the earlier
phases' notes for that step.

- **build** implements and writes tests. **adversarial** tries to break it and fixes nothing.
- **review** reads the build *and* the adversarial findings, adjudicates each
  UPHELD/OVERSTATED/REJECTED, and adds its own. **reconciliation** applies what survived,
  rejects the rest with reasons, re-runs everything, rewrites `HANDOVER.md`.
- **The parent (you) owns `SPEC.md`.** Phases record gaps; they never edit the spec. Apply
  accepted wording yourself, then tell the next phase the spec changed.
- A later phase overriding an earlier one **on measurement** is normal and has happened four
  times, including reconciliation correctly overruling its own review.

### The seven invariants (full text in `PLAN.md`)

1. **`null` is not `0`.** `null` renders `—`; zero renders the numeral with its unit.
2. **Read-only.** Nothing writes to the server, ever.
3. **`ENODATA` from `pwm5` means "EC auto", which is HEALTHY.**
4. **`fanN_input` is the only trustworthy fan telemetry** — `pwmN_enable` lies, `fanN_target` clamps.
5. **A failed reading is a partial snapshot plus an `errors[]` entry — never a 500.**
6. **Node 24, TypeScript strict, pnpm, Vitest.** No dependency without recorded reason.
7. **If the spec is silent, STOP and record it.** Do not invent. This is how ~100 gaps were found.

### Structural rules the pipeline learned the hard way

- **Every boundary guard needs a fixture on both sides.** Three steps shipped a guard tested
  in one direction only.
- **Mark load-bearing tests `⚠` and run the red-test ledger** — it records which tests go red
  per mutation and fails if a ⚠ test never reddens. It has found inert tests in every step.
- **A mutation that reddens probabilistically is worse than none** — the ledger cannot tell it
  from a sound one.
- **A test may consume entropy only for an assertion that holds for every value it could
  draw.** A 1-in-16 flake shipped this way.
- **Every `catch` added for a "never throw" rule removes a distinction.** Assert what was
  *written*, not what was *returned*.
- **Guards over globals** (`setInterval`, `fetch`, `document`) are not soundly fixable by
  source text; pair them with a behavioural test. The runtime globals guard also **voids
  itself under `isolate: false`** — which Vitest's own reporter recommends on every run.
- **A test that names a property it does not check has appeared in every single step.** Read
  each test name against its body.

---

## 6. Module map (`dashboard/`)

```
lib/types.ts            the §4 contract; every reading `T | null`; branded units
lib/format.ts           §6.6 formatters        lib/severity.ts   §6.3 bands
lib/throttle.ts         §3.7 mask decoder      lib/conditions.ts §6.4 observePoll (debounce+ledger)
lib/fixtures.ts  lib/units.ts  lib/source-text.ts  lib/guardrails.test.ts
lib/collectors/         io, deadline, numbers, proc, nvidia-smi, deltas, hwmon, dell-smm,
                        cooling, dbus-wire, dbus, llama, http, statvfs, safety-checks,
                        serving, storage, safety, collect, result, errors
lib/telemetry/          cache, gate, ceiling, source, snapshot, handler
lib/auth/               scrypt, base64url, config, cookie, session, revocations,
                        rate-limit, authorize, handler, login-view
lib/client/             prefs, wire, ring, series, backoff, observations, events, env,
                        runtime, use-telemetry, fake-env
app/                    api/telemetry, api/session, login/, layout.tsx, page.tsx
proxy.ts                the auth gate — Next 16 renamed `middleware.ts`; the old name NEVER RUNS
```

---

## 7. Where the open work is recorded

**`HANDOVER.md` is authoritative** for open obligations (`O*`) — it is rewritten each
reconciliation and has been found stale in the *safe* direction three times (entries already
answered by the spec). **Re-check every entry against `SPEC.md` before trusting it.**

Also mine: each step's `review.md` §DEFER table (names an owning step) and each
`reconciliation.md` "new spec gaps for you" section.

⚠ **Beware the id namespaces, and the warning that used to sit here understated the problem.**
It said *"the `S*` namespace is polluted: some `S`-prefixed ids in steps 3–5 are harness mutation
ids, not gaps."* Widened 2026-09-07 by Q1's reconciliation (adversarial F5): the pollution is
**not confined to `S` and not confined to steps 3–5**. `S11/G5` is one open obligation, cited in
this file, `HANDOVER.md`, `WORK-ITEMS.md` and `UI-BACKEND-GAPS.md` — and step 7's harness holds a
mutation id for `S11` *and* one for `G5`. `S12` is both a step-3/5/8 mutation id and a step-5 gap
id. Q1 renamed the one it created (`S11` → `SC1`) and left `G5` alone, because step 7's own notes
cite it. **A grep for an id can land in a harness; read what you hit.** The cheap fix — a
reserved prefix for mutation ids, which are already per-harness scoped — is recorded for the
owner in Q1's `reconciliation.md` §7 and not taken.

A cached extract of the DEFER tables for steps 1–7 may still exist at
`/private/tmp/claude-501/.../scratchpad/defers.md`; regenerate it if not.

### ⚠ S49–S53 are CLOSED — the owner ruled on all five and `SPEC.md` was edited

That was the first time the spec had ever been changed in this project. **`SPEC.md` is no
longer frozen**: the owner delegates wording, and ten edits are logged in
`pipeline/WORK-ITEMS.md` §9. So when the spec is silent, invariant 7 still says STOP and
record — but the recording now has somewhere to go, and the owner answers.

The amendments worth knowing before touching the UI: §6.7's 600-point budget is **per
series**; a stale row's clock is the **browser's** and its value is the **last reading**;
§6.2 gained a panel-head convention (`title · subtitle · chip`), an exhaustive header list, the
GPU↔instance join, and — added late, after step 9's primitives were already built — **a hover
layer and a table view as accepted defaults** (the owner's ruling: *do not fight `dataviz` to
strip its defaults; amend the spec instead*). That last one is why Q2 exists.

**Deferred work items with owning steps** (from step 8's §9.4 list):

- **Backend, still open:** **D8** `STANDING` env plumbing → step 11, verified step 12. ⚠ That is
  now the *only* backend item here — the **red-test ledger retrofit for step 3's harness** was
  listed beside it as "still has none, folded into Q1" and **that was wrong: it was done during
  step 8.** Q1's build phase confirmed it (`LEDGER_FILES` at line 71, a wired-up coverage check,
  a comment at line 43 saying so) and Q1's reconciliation re-ran it clean — 72 mutations, 24 ⚠
  marks, exit 0. Corrected 2026-09-07; also corrected in `WORK-ITEMS.md` §2 (A6) and
  `HANDOVER.md`.
- **Closed 2026-09-07:** ~~O19~~ (GB→GiB, a §4 wire change), ~~D4~~ `errorsForPanel`,
  ~~D5~~ `traceFor`, ~~A6~~ (step 3's ledger retrofit — see above), ~~the six unbacked
  `severity.ts` marks~~. **D7 is narrowed, not closed:** ~~S19~~ and ~~S30~~ are settled in
  `SPEC.md` (lines 1327 and 780, both marked *settled 2026-09-07*), and **S11/G5's collector half
  is settled too** (line 1208 — `collectCooling` files the entry). What remains of D7 is
  S11/G5's **panel-rendering** residue, owned by step 10.
- **Still open for steps 10–12:** D1 S40's third event-log feed · ~~D2 the independent age
  tick~~ (closed by 10a) · ~~D3 rendering `unknownStanding`~~ (closed by 10b) · ~~D6 jsdom +
  `useTelemetry` unmount~~ (closed by 10a) · ~~**L9 sparkline sizing**~~ (closed by 10c-3 — `CHART_SIZE`, ⚠ with A7's correction: its lower two entries are `plotHeight`, per plot) · ~~L11 the
  unit-name constant guard~~ (**closed by 10c-2** — `lib/format.ts`'s nine `UNIT_*` constants and
  `lib/unit-suffix.test.ts`). ⚠ Corrected 2026-09-08 by 10c-2's reconciliation: this line had gone
  stale in the safe direction on four of its six entries. `HANDOVER.md` §9 is authoritative.

---

## 8. The plan from here

Steps 1–8's sweep and step 9 are done. The queue is `pipeline/WORK-ITEMS.md` §10 (see §2.2).

### ⚠ The loop the owner wants, and it is not PLAN.md's

Each work item is **one agent loop**, one item at a time, each phase a **fresh agent with clean
context** receiving a written handoff:

| phase | model | runs as | does |
|---|---|---|---|
| **build** | **Opus 5, high effort** (was Sonnet 5 until 2026-09-09) | subagent | implements + tests. Load the `dataviz` skill for anything with a chart, meter or stat row |
| **test** | **Opus 5, high effort** (was Sonnet 5 until 2026-09-09) | subagent | reads every test name against its body; fixture symmetry; hunts equivalent and probabilistic mutations |
| **adversarial** | Opus 5, high effort | subagent | tries to break it, **fixes nothing**, writes findings with concrete failure scenarios |
| **reconcile** | Opus 5, high effort | **background subagent** — changed 2026-09-07 | adjudicates every finding ACCEPTED/REJECTED/DEFERRED **with reasons**, applies what survives, re-runs everything, writes `reconciliation.md` and rewrites `HANDOVER.md` |
| **review** | — | **the parent, always** — added 2026-09-08 | re-runs `pnpm verify` itself, **audits the reconciliation's adjudication table**, spot-checks its headline claims against the tree, then commits. **The loop is not closed until this runs.** |

### ⚠ PROJECT RULE — the parent reviews every reconciliation. Added 2026-09-08, owner's instruction.

**A reconciliation is not finished when the agent reports. It is finished when the parent has
reviewed it.** This is a fifth phase, it is never delegated, and it is the counterweight to
having moved the reconcile seat into an agent at all.

What the review must actually do — all four, every time:

1. **Re-run `pnpm verify` yourself** on the tree the agent left. Its green is not the green.
2. **Read the adjudication table in full** — every ACCEPTED, REJECTED and DEFERRED row with its
   reason. **Rejections and deferrals are the priority**: an accepted fix leaves a diff you can
   see, a rejected finding leaves nothing at all. A run with *zero* rejections gets the same
   scrutiny, not less — zero is the shape a rubber-stamp makes, so audit the deferrals instead.
3. **Spot-check the headline claims against the tree**, not against the report. Q1's review
   checked the generic-`test.each` syntax at the named line numbers and the duplicate test name
   in both files before believing either. Two `grep`s; it is not expensive.
4. **Then commit**, and say in the message what was verified by the parent versus reported.

**What made Q1's loop work is worth copying:** the parent verified F1 and F2 *itself* before
writing the reconcile handoff, so the agent inherited facts rather than claims, and its handoff
said which was which. Do that — a phase that must re-derive its own inputs spends its budget
there instead of on the work.

### ⚠ Reconciliation moved out of the parent — 2026-09-07, at the owner's instruction

It used to be the parent's own work. It is now **a background subagent like every other phase**,
for one reason: reconciliation is the most context-expensive phase in the loop — it reads the
build, the test pass, every adversarial finding, and the code each finding names, and step 9's
ran to 25 findings. Doing that in the parent burned the session that has to survive the *whole*
queue. The parent now spends its context on judgment and sequencing, not on re-reading.

**What the parent keeps, and must not delegate:**

1. **Green.** `pnpm verify` exiting 0, run *by the parent*, on the tree the agent left behind,
   before any commit. §4 and §9 both say this and they were written because an agent claimed
   green on a failing tree. A background agent reporting "verify passes" is a claim, not
   evidence.
2. **The commit.** Repo convention is commit-only-when-asked (root `CLAUDE.md`), and every
   reconciliation so far has been an explicit ask. The agent stages nothing.
3. **`SPEC.md`.** Unchanged from §5 — phases record gaps, the parent writes wording. A
   reconciliation agent that wants a spec change says so in its report.
4. **Audit of the adjudication table.** Read every REJECTED and DEFERRED row and its reason.
   Accepting a fix costs a diff you can see; rejecting a finding costs nothing visible, which
   makes rejection the failure mode to check.

**The honest cost of this change.** The parent's judgment in the reconcile seat was load-bearing:
this project has a reconciliation correctly overruling its own review, and four occasions where
an agent corrected the parent and was right. Moving the seat to an agent means the parent
*audits* an adjudication it did not produce — weaker than producing it, and the mitigation is
rule 4 above, not optimism. If a reconcile agent's rejections start reading thin, pull the phase
back into the parent for that item and say so here.

**Mechanics.** Spawn it with `Agent`, and let it run in the background — do not block on it. The
handoff must name: the item, the branch (`dashboard-frontend`), the files in play, the phases'
notes to read, **what the parent has already verified** (§8's rule below), and the four
non-delegable items above so the agent does not commit or edit `SPEC.md`. It reports back a
summary; the transcript stays out of the parent's context, which is the entire point.

**Handoffs live in `pipeline/handoffs/`.** Write one before spawning; the agent's quality tracks
the handoff's. The step 9 handoff is the model to copy.

⚠ **Write down what you have already verified yourself**, so the agent does not re-litigate it —
and be honest when the agent corrects you. It did, four times this session, and every correction
was right.

### ⚠ Scope — the backend-only constraint is LIFTED, and a new one replaces it

Steps 1–8 are closed, so the old "do not touch steps 9–12" rule has expired. **The live
constraint is the branch**: UI work belongs on `dashboard-frontend`, and nothing outside
`dashboard/` changes. Q1 is the exception worth naming — it edits the *harnesses* of steps
2–8, which live on the backend branch's history but are inherited here; do it on
`dashboard-frontend` like everything else and let the merge sort it out.

Invariant 7 still binds: **if the spec is silent, STOP and record it.** What changed is that
recording it now leads somewhere — see §7.

---

## 9. Standing constraints

- ⚠ **Every spawned agent runs on Opus 5 at high effort unless the owner says otherwise** — owner's
  instruction, 2026-09-09, made a project rule the same day. It replaced the "Sonnet 5 for build
  and test" row in §8's table after the first 10e build agent, on Sonnet, was killed mid-flight by
  a Sonnet session rate limit with half the primitives edited and no notes written. Pass
  `model: "opus"` on every `Agent` call; the phase table in §8 is the record.
- ⚠ **Mutation ids carry their creating step's id as a prefix** — `07-R3`, `Q1-SC1` — added
  2026-09-08 at the owner's instruction. The bare namespace collided with the gap/work-item
  namespace: `S11` and `G5` were each simultaneously a step-7 mutation id and half of the open
  `S11/G5` work item, and `S12` collided too. §7's old warning that "the `S*` namespace is
  polluted" understated it — it was never confined to `S`, nor to steps 3–5. The prefix is the
  **creating** step, not the harness the mutation currently lives in, so it never changes.
- ⚠ **`MOCK.html` is a source for FORM only — density, anatomy, type scale, spacing, chart sizes.
  Data, strings and rules come from `SPEC.md`, and where the two disagree the spec wins.** The
  owner's words, 2026-09-09: *"the mock is a mock; the data predates the mock is a rule — if the
  mock says V100 but the data says PG500-216 then it is PG500-216."* So: raw driver name, full bus
  id, `GiB`, invariant 1, the throttle rules, every S-* ruling — all stand exactly as built; the
  mock supplies how tall and how dense, never what is printed. This sharpens the older "reference,
  never a source" line: it *is* the source for form, since measured on 2026-09-09 it fits every
  §6.1 viewport the build overflowed.
- **Commit only when asked** (repo convention, root `CLAUDE.md`). Each reconciliation has been
  an explicit ask; `git push` is separately gated and needs its own.
- **The server `ai-server` is reachable over SSH and is read-only to this work.** Reads are
  encouraged — several findings were settled by measuring the real box. **Never write to it**:
  no `pwmN`, no mutating D-Bus call (`LoadUnit` is forbidden — `GetUnit` is the read-only
  one), no `/v1/chat/completions`.
- **`ufw` now enforces on the box** (`ENABLED=yes`, verified 2026-09-06). Port **8090 has no
  allow rule**, so the dashboard will be unreachable until step 12 adds one. Do not add it now.
- Nothing outside `dashboard/` should change, except the root `.gitignore` (already modified).
- **`pnpm verify` exiting 0 is the only definition of green.** Not a printed summary, not an
  agent's report. Re-run it yourself before every commit — an agent has claimed green on a
  tree that failed.
- **Never `sleep`-poll a background harness.** `until ! pgrep -f regressions.py` never exits:
  the pattern matches the waiting shell's own command line. Write `pgrep -f "regressions[.]py"`.
- ⚠ **THE BRACKET IS NOT ENOUGH, and this cost five hours on 2026-09-08.** `regressions[.]py`
  stops the pattern matching *itself*, but a wait loop written as part of the **same `bash -c`
  string** that also ran the harness has the literal text `python3 …/regressions.py` in its own
  command line — so `pgrep -f` matches the waiter, and it spins forever. Two shells sat in that
  state for five hours with **no harness running at all**; the tell is `pgrep` matching while
  `pgrep -fl "vitest|node"` shows no child doing work. It was written into a subagent handoff by
  the parent, who had quoted the bracket rule while introducing the very bug it warns about.
  **The fix is to not wait at all**: run harnesses as plain sequential foreground commands in one
  call — `python3 …/07.py; python3 …/08.py` — which are serial by construction and need no poll.
  If you must poll, poll from a shell that has never mentioned the harness.
  Seven orphaned shells were found this way.
