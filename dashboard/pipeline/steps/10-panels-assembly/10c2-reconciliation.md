# Step 10c-2 — the guards (RECONCILIATION)

**Written by the reconcile agent, 2026-09-08 (finished into 2026-09-09).** Branch `dashboard-frontend`, working dir
`dashboard/`. Read `pipeline/handoffs/10c2-reconcile.md`, `ANCHOR.md` §4/§5/§8/§9, `PLAN.md`,
`SCOPE.md`, `10c2-build.md`, `10c2-test.md` and `10c2-adversarial.md` in full before touching
anything.

⚠ **This is not closed until the parent's review** (ANCHOR §8): the parent re-runs `pnpm verify`
itself, audits the table below row by row — **rejections and deferrals first** — spot-checks the
headline claims against the tree, and commits. Nothing here is staged or committed.

## 0. ⚠ A numbering correction, stated first so the table can be read against the right document

The reconcile handoff calls the inverted ledger guard **F8**. The adversarial document numbers
that finding **F2**; its own **F8** is the separate (and related) finding that no anti-vacuity
check is mutation-guarded and the four differ in strength by an order of magnitude. **This
document uses the adversarial's numbering throughout**, which is the numbering in the file the
parent's review will open. Both findings are adjudicated; nothing is lost either way.

## 1. The adjudication table — all eleven

| # | Finding | Verdict | Reason |
|---|---|---|---|
| **F1** | `toContain(EM_DASH)` / a hoisted constant bypasses the lint, **and is not even reported** | **ACCEPTED, applied in full** | The identifier and file-local `const NAME = '<literal>'` bindings are now resolved before classification, and an argument still unreadable is **counted and named** (`unreadableToContainArguments`) with a project-wide assertion that there are none. The sibling guard in this same loop already counted what it could not read; applying the opposite policy silently was the defect, not the `null` |
| **F2** | the ledger guard's anti-vacuity test goes **RED when the project reaches zero orphans** | **ACCEPTED, applied** | A guard that punishes its own fix. Replaced with the input-side check (§2.1): every `LEDGER_FILES` path must be a file the walk actually found. Demonstrated both ways — green at zero orphans, red (naming 17 files) on a narrowed walk |
| **F3** | the L11 guard cannot see **JSX text**, nor anything after the suffix | **ACCEPTED IN PART, applied** | JSX text and trailing content are now caught, and the doc/code mismatch it exposed is corrected. ⚠ The **bare `%`** sub-case is **REJECTED with evidence** — see §3.1 |
| **F4** | the suffix vocabulary is a hand-typed **membership** list, and the doc says otherwise | **ACCEPTED, applied** | Derived from `lib/format.ts`'s own `UNIT_*` exports. One line, and it is the move `purity.test.ts` already made |
| **F5** | both walking guards scan **`.tsx` only** | **ACCEPTED, applied** | Ten non-test `.ts` files sit under the scan roots, two of which format values. Both walks now take `.ts`; the doc sentence that reasoned from the extension is corrected |
| **F6** | a **double-quoted** CSS import silently drops a file from the audit | **ACCEPTED, applied** | Import pattern is now quote-agnostic and accepts the namespace form; the population check is now **proportional** (every file that names a stylesheet must produce an audit), which catches the whole class rather than the two shapes measured |
| **F7** | *"cannot be mechanised"* is FALSE — the bare-word case is mechanisable in a **matcher**, measured | **ACCEPTED as a correction; the build DEFERRED** | The doc bound is corrected in the guard itself (§2.4). Building the matcher is a project-wide `setupFiles` change plus 36 adjudications plus its own mutation coverage — a loop, not a reconcile-phase apply. Owner and the measured numbers: §4 |
| **F8** | no anti-vacuity check is mutation-guarded, and the four differ by an order of magnitude | **ACCEPTED, applied** | Three of the four nets were strengthened (§2.5); the fourth's strength moved out of a fixture test — *"an accident of style, not a designed defence"* — and into the net, with the reason written down |
| **F9** | `ledgerFilesOf` drops entries on a `#` comment | **ACCEPTED, applied** | `stripPyComments` (quote- and docstring-aware) plus four fixtures. Latent, safe-direction — and the failure it produces (the suite goes red naming a file the reader can SEE in the list) is the one whose cheapest wrong fix is deleting the assertion |
| **F10** | smaller lint bypasses: `let`, alias, helper-bound render, `expect.soft`, the blanket `"throwing"` exemption | **ACCEPTED IN PART, applied** | `let`, `expect.soft` and the exemption narrowing are in — and the narrowing **found a live weak assertion** (§3.2). Alias tracking and helper-bound renders are **REJECTED**: §3.3 |
| **F11** | "exactly one ⚠ per file" is inaccurate — 12 marks sit on `describe` blocks | **ACCEPTED as documentation** | The adversarial's own calibration is right: `describe`-level marks are 20+-file practice and are not a defect. No mark removed. The correction is recorded here and as a permanent note in the guard whose subject is unprovable marks (§2.6) |

**Zero findings rejected outright; two sub-parts rejected, both with measurement rather than
judgement** (§3.1, §3.3). ANCHOR §8 says a run with zero rejections gets *more* scrutiny, not
less — §3 and §4 are written for that audit.

---

## 2. What was applied, guard by guard

### 2.1 `lib/cross-harness-ledger.test.ts` — F2, F8, F9, F11

**The inversion (F2).** `expect(orphans.length).toBeGreaterThan(0)` is gone. What replaces it
asserts the **inputs**, which lines 246–248 already did half of:

```ts
test('the guard looked at everything — every LEDGER_FILES path is a file this walk found', …)
```

96 union entries against 97 walked test files today, and the union is exactly a subset. Three
things follow, and all three were verified rather than argued:

1. **Zero orphans is now the success state.** Re-ran the adversarial's own experiment — a
   throwaway `pipeline/steps/99-zz-probe/regressions.py` adopting `lib/throttle.test.ts` — and
   the file is **green at 0 orphans** (16 tests). Directory removed; `git status` clean.
2. **It can still fail.** Added `'collectors'` to `SKIP_DIRS` (the exact vacuity shape F2
   describes) and the new check went red naming all 17 files that left the walk. Reverted.
3. **It closes a documented blind spot for free.** This file's own "CANNOT catch" list opened
   with *"a typo'd path, or a file renamed on one side and not the other … this guard trusts
   that a listed path is real."* It no longer trusts it. That bullet now carries a marked
   correction saying which half is closed.

**The comment stripper (F9).** `stripPyComments` handles single, double and both triple-quote
forms — every harness carries docstrings, four carry `'''` blocks — so a `#` inside a docstring
or inside a quoted path cannot truncate the parse. Four fixtures, both directions. The union is
unchanged at 96 after the change (re-derived, not assumed).

**F11's note** is a permanent bullet in this file's "cannot catch" list: `marked_tests()`'s
`CALL` regex cannot read a mark on a `describe`, exactly as it cannot read one in a doc comment,
so `grep -c ⚠ <file>` is **not** the count of ledger-covered marks. That is the audit this very
guard exists to automate, so the disclaimer belongs here rather than only in a phase note.

### 2.2 `lib/unit-suffix.test.ts` — F3, F4, F5, F8

- **Vocabulary derived** (F4): `Object.entries(format).filter(([k]) => k.startsWith('UNIT_'))`.
  A tenth `UNIT_*` is now in scope the day it is exported.
- **Walk widened** to `.ts` (F5), and the doc sentence that reasoned *"it is a `.ts` file, **and**
  it is not under either scan root"* is corrected — the `and` was carrying an argument it could
  not carry.
- **Two new shapes** (F3): a post-interpolation segment that **begins** with a unit at a word
  boundary, in a template literal (`` `${n} RPM (fan 5)` ``, `` `${n} RPM.` ``) **or in JSX text**
  (`<td>{cooling.fan2Rpm} RPM</td>`). The old rule required whole-segment equality, which the
  wired mutation `10c-G4` happened to satisfy — so the ledger was exercising the one shape that
  already worked.
- **Net strengthened** (F8): `files.length >= 30` plus two named members — `cooling-panel.tsx`
  (the file `10c-G4` mutates) and `panel-chart.ts` (the file F5 added).
- Clean on the widened tree: no component and no `.ts` module under the roots hard-codes a unit.

### 2.3 `lib/dangling-css-class.test.ts` — F5, F6, F8

Quote-agnostic and namespace-aware import matching, `.ts` in the walk, and the population check
is now **proportional**: every walked file whose code mentions `.module.css` must produce an
audit, named individually if it does not. 18 = 18 today. Two new fixtures build a double-quoted
and a namespace-imported pair in a temp dir and prove the dangling class is still found.

### 2.4 `lib/tocontain-scope.test.ts` — F1, F7, F8, F10

- `EM_DASH` (imported from `lib/format.ts`, so the value cannot drift from the rendered glyph)
  and file-local `const NAME = '<literal>'` are resolved; unreadable arguments are counted,
  named and asserted zero.
- `let`-bound renders and `expect.soft` are in scope.
- The `"throwing"` exemption is **em-dash-only**. Its justification — *any em dash anywhere
  proves nothing crashed* — never covered a band.
- The floor (`>= 8`) and the named member (`cpu-panel.tsx`) moved from a fixture test into the
  net itself, with the reason recorded (F8).
- **F7's bound is corrected in the module doc**, in the same place the overstatement lived: the
  bare-word case cannot be mechanised **in a source lint**; it is mechanisable **in a matcher**
  at a measured 9.5 % adjudication cost, and the numbers are in §4 so nobody re-derives them.

### 2.5 The four nets, before and after (F8)

| guard | net before | net now |
|---|---|---|
| `tocontain-scope` | `> 0`, with `>= 8` + a named member in a *fixture* test | `>= 8` + `cpu-panel.tsx` **in the net**, plus "zero unreadable arguments" |
| `unit-suffix` | `> 0`, plus `> 15` inside the exemption test | `>= 30` + two named members |
| `dangling-css-class` | `> 0` of 18 — an 18→1 narrowing passed | every file that mentions a stylesheet is audited, named if not |
| `cross-harness-ledger` | `orphans.length > 0` — **inverted**, and blind to a narrowed walk | every union path is a file the walk found (96 ⊆ 97) |

⚠ **Still true, and disclosed rather than fixed:** none of the four nets is itself
mutation-covered. The build disclosed this (§6) and the test phase proved each net functional by
hand; this loop proved two more of them functional by hand (§2.1, above). Adding four mutations
whose targets are the guards' own file-walkers is a reasonable next-loop item and is carried in
`HANDOVER.md` rather than done here — it is the same class of work as F7's matcher and wants the
same budget.

### 2.6 One production-adjacent fix outside the guards, forced by F10 — and it is a real one

`components/panels/safety-panel.test.tsx`:

```
test('every row renders — rather than throwing, and the three total checks read watch', …)
    expect(html).toContain('—');
    expect(html).toContain('data-severity="watch"');     <-- exempted, and inert
```

The blanket `"throwing"` exemption covered the **whole test body**, so the band assertion was
never examined by the guard — and `SafetyPanel`'s head chip is `panelChip(ufw, pwm5, dkms,
fanService)`, which is itself `watch` on an empty state. The second half of the test's own name
was therefore not asserted by anything. Now scoped to the three rows it names
(`ufw enforcing`, `pwm5 present`, `DKMS for running kernel`), each checked individually.

**This is the ninth hit of the founding shape, found by a guard change made in the reconcile
phase**, and it is the argument for F10's narrowing being worth its cost.

---

## 3. The rejections, in full — audit these first

### 3.1 F3's third escape, the bare `%` — REJECTED, with the measurement

`UNIT_PERCENT` is `' %'`, so `` `${pct}%` `` is invisible. The adversarial calls it *"the
commonest spelling of a percentage anywhere"*, which is true, and adding `%` to the vocabulary is
one character. **It was not added, because the one live `}%` in the entire tree is not a
reading:**

```
components/meter.tsx:76:  style={{ width: fillPercent === null ? '0%' : `${fillPercent}%` }}
```

That is a CSS **length**. Adding `%` flags it on day one — a false positive in the loop whose
declared defect class is the false positive, on the guard's very first widening. A text scanner
cannot tell a CSS length from a displayed value, and inventing a `style={{…}}`-shaped exemption
is a bigger hole than the one it closes. Recorded as a "cannot catch" bullet **with the reason
and the counter-example**, and fixtured, so the next person does not re-derive it and does not
add `%` casually.

### 3.2 What F10's narrowing cost, stated so the trade is visible

Narrowing the `"throwing"` exemption cannot be free: a future genuine non-crash smoke test that
happens to assert a band whole-document will now be flagged and must scope it. That is the
correct direction — the exemption's own justification only ever covered the em dash — but it is a
narrowing of a documented carve-out, so it is named here rather than presented as pure gain.

### 3.3 F10's alias and helper-bound bypasses — REJECTED

```
const doc = html;  expect(doc).toContain('data-severity="alarm"');
const html = renderPanel({…});   // a local render helper
```

Both need real dataflow (alias chains, a call graph across helpers), which turns a
necessary-condition **text lint** into a partial evaluator — the exact line
`literalContent`'s own doc draws, and the line the build defended for good reasons. Neither shape
exists on today's tree (the adversarial verified all eight composite panel test files bind every
render directly). **And both are caught by F7's runtime matcher**, which never sees source at
all: that is the layer where this class belongs, and it is deferred with the rest of it. Rejecting
them here is not a claim they are safe; it is a claim they are the *other* guard's work.

### 3.4 What this loop did NOT do, though a §9 row named it

⚠ **`10a-F17` — `pnpm verify`'s non-determinism — was NOT addressed.** `HANDOVER.md` §9 and
`ANCHOR.md` §2.2 both list it under 10c-2; the loop's own handoff (`10c2-guards.md`) scoped 10c-2
to five guards and did not include it. It is untouched: `lib/collectors/serving.test.ts:592`
still sleeps a real 95 ms inside a real 100 ms budget. **Re-owned to 10c-3 in `HANDOVER.md`**, and
flagged for the parent, because it undermines every ledger in the project and a stale row saying
someone else already has it is exactly how it gets lost.

---

## 4. F7 — the deferral, with its measured numbers, so nobody re-derives them

**The rule:** a `toContain(X)` whose subject is a string is **ambiguous if `X` occurs more than
once in that subject.** Decidable at run time from the subject alone — no fixture analysis, no
source parsing, so none of F1's or F10's static bypasses apply to it.

| measurement (adversarial, 2026-09-08, `toContain` overridden in a scratch setup file) | value |
|---|---|
| files / tests / `toContain` calls with a string subject, `components/` | 27 / 468 / **454** |
| calls where the needle occurs **> 1** time | **43 (9.5 %)** |
| of those, already covered by the existing `"throwing"` exemption | 7 |
| remaining, needing adjudication or scoping | **36** |
| for comparison: the source-lint discriminator the build rejected | **198** |
| founding failures caught | **4 of 4** — `'paused'` ×2, `'refresh'` ×3, both em-dash shapes ≥2 |

Several of the 36 look like latent instances of the very trap: `safety-panel`'s `'ufw'`, `'pwm5'`
and `'fan service'` ×2 each; `storage-network`'s `'eno1'` ×4; `cooling-panel`'s `'fan 5'` ×5 and
`'0 RPM'` ×6; `gpu-panel`'s `'GPU 0'`/`'GPU 1'` ×3. Others are plainly legitimate
(`stacked-time-series-chart.test.tsx` asserting `'TIME('` ×17 *because* one shared axis is drawn
once per plot) and need an exemption or a scoped subject.

**Why it is not built here.** It is a `test.setupFiles` change — project-wide test-harness
mechanics, which by this project's own rules must itself be mutation-proven — plus 36
adjudications, plus a staged report-then-gate adoption. That is a loop with a build, a test and an
adversarial phase; doing it inside a reconciliation would be the "add scope" failure `PLAN.md`
forbids of this phase.

**Owner: a dedicated loop after step 10 closes — NOT 10c-3.** 10c-3 is sizing and visual, needs a
browser, and is what step 10 closes with; bolting a project-wide matcher onto it would make the
parent's review audit two unlike jobs at once, which is precisely why SCOPE §5 cut 10c into three
in the first place. Recorded in `HANDOVER.md` §9 for the owner to place in `WORK-ITEMS.md` §10.

---

## 5. Verification

⚠ Every harness run **sequentially, in the foreground**, never alongside `pnpm verify` and never
two at once. No poll loop was used at any point (ANCHOR §9).

```
$ pnpm verify
 Test Files  99 passed (99)
      Tests  2775 passed (2775)      (2745 before this phase — +30 fixtures)
Type Errors  no errors
```

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 220 distinct failing tests across 172 mutations; 200 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 172 regressions failed their check, as they must.
```

All five `10c-G*` mutations still bite against the rewritten guards:

```
10c-G2 (un-scope cpu-panel)      1 failed | 44 passed (45)   lib/tocontain-scope.test.ts
10c-G3 (dangling styles class)   1 failed | 34 passed (35)   lib/dangling-css-class.test.ts
10c-G4 (hand-built RPM string)   1 failed | 50 passed (51)   lib/unit-suffix.test.ts
10c-G5 (drop CPU_PANEL_TEST)     1 failed | 17 passed (18)   lib/cross-harness-ledger.test.ts
```

**Which harnesses were re-run, and why only these.** Every file this phase touched —
`lib/tocontain-scope.test.ts`, `lib/cross-harness-ledger.test.ts`, `lib/unit-suffix.test.ts`,
`lib/dangling-css-class.test.ts`, `components/panels/safety-panel.test.tsx` — is in **step 10's**
`LEDGER_FILES` and in no other harness's; no source file and no other harness's mutation anchor
was touched (checked by grepping every `pipeline/steps/*/regressions.py` for each). Steps 2, 3, 4
and 5 were re-run by the test phase after ITS edits and are unaffected by this one. Step 2's three
pre-existing broken uptime anchors (`02-R20`/`02-R30`/`02-R31`) are still there, still unrelated,
still out of scope.

`git status --short` after every harness run is byte-identical to the handoff's listing — no
stranded mutation. ⚠ `lib/collectors/errors.ts`, `lib/collectors/serving.test.ts` and
`lib/format.ts` are the earlier phases' intended edits and were **not** touched or reverted here.

**Nothing committed, nothing staged. `SPEC.md` untouched. `purity.test.ts` untouched. Nothing
outside `dashboard/` changed.**

## 6. For the parent

1. **A spec change is not requested.** No invariant-7 silence was hit that is not already
   recorded.
2. **Two items want a place in `WORK-ITEMS.md` §10**, and only the owner/parent can put them
   there: F7's runtime matcher (§4) and mutation coverage for the four anti-vacuity nets (§2.5).
3. **`10a-F17` is still open and was never in this loop's scope** (§3.4) — the two documents that
   said 10c-2 owned it are corrected.
4. The claim most worth spot-checking is §2.6: `git diff components/panels/safety-panel.test.tsx`
   shows one whole-document band assertion becoming three row-scoped ones, and
   `lib/tocontain-scope.test.ts`'s `isEmDashLiteral` is why it was found.
