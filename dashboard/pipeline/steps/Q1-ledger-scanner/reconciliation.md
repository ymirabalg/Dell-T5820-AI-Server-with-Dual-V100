# Q1 — back-port the corrected ⚠-scanner — RECONCILIATION

Branch `dashboard-frontend`. Ran as a **background subagent**, the first reconciliation to do so
(`ANCHOR.md` §8). Nothing committed, nothing staged, `SPEC.md` untouched, nothing outside
`dashboard/` changed.

Read in order: `handoffs/Q1-reconcile.md` → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → Q1's
`build.md`, `test.md`, `adversarial.md`. Every number below was measured in this phase, not
carried forward from a previous one.

---

## 1. The adjudication table — all seven findings

| # | Verdict | One-line reason |
|---|---|---|
| **F1** | **ACCEPTED** | Reproduced independently: `test.each<[…]>(` is invisible to the back-ported scanner *and* to the pre-Q1 one. Step 7 saw 128 marks; the file holds 130. One regex line closes it across all eight harnesses |
| **F2** | **ACCEPTED** | Reproduced: two character-identical ⚠ names in step 5's ledger, prefix `⚠ a timeout of`. Both renamed to name their seam — this was the **only** live prefix collision in the project, and it is now zero |
| **F3** | **ACCEPTED, in a wider form than proposed** | A diagnostic is the right shape and the parent's reasoning holds. But F3's own design (warn on the three skip paths) cannot see the fourth route — `CALL` never matching — which is *the route F1 travelled*. Implemented against a `CANDIDATE` regex instead, so route 4 is covered too. 5 warnings today, 0 false positives, exit code unchanged |
| **F4** | **DEFERRED** | Real, correctly measured, **zero live loss** (65 test files, 63 in some ledger, both orphans carry 0 ⚠). Every fix implementable at the harness layer needs a hand-maintained exemption list or a hardcoded orphan list — i.e. a check that is green over a subset, which is Q1's own defect wearing a different hat. Owner: **step 10**, the next moment the ledger union actually changes |
| **F5** | **ACCEPTED in part** | `S11` → `SC1`, because Q1 owns that id and the rename is free. **Not** extended to the pre-existing `G5`, which is the *other half of the same work-item id* — renaming it would invalidate step 7's own written record. Recorded as a gap: the collision is a namespace problem, and this closes one instance of it |
| **F6** | **ACCEPTED** | Reproduced across all 808 anchors: exactly two are ambiguous. `U6` pinned to the site its name describes, `T68` pinned to the value import, and an `ANCHOR AMBIGUOUS` check added to all eight harnesses so the third failure category stops being invisible |
| **F7** | **ACCEPTED** | Two lines. The `%` split is a `test.each` device and now runs only on `.each` calls. It lengthens two prefixes in `components/meter.test.tsx` and shortens none, which is the correct direction given F2 |

**Six accepted (one in part), one deferred, none rejected.** That is an unusually high acceptance
rate and it deserves saying plainly rather than being presented as a good outcome: the
adversarial phase measured rather than reasoned, and every claim it made survived independent
re-derivation here. The one finding I did not accept, F4, I could not reject either — its
measurement is right and its proposed fix is the thing that does not survive.

---

## 2. F1 — what it actually was, and the number that changes

`CALL = (?:^|\s)(?:test|it)(\.each)?\s*\(` cannot cross a generic type argument. Neither branch
matches `test.each<[string, LoginState]>(`: the `.each` branch needs `(` next, and the
empty-`(\.each)?` branch needs `\s*\(` to match `.each<`. **The call is not mis-parsed. It is
never seen**, and a call never seen takes none of the scanner's skip paths, so nothing printed.

Repo-wide there are four `(test|it).each<`. Two carry ⚠ marks, both in
`lib/auth/login-view.test.ts` (`:78`, six rows; `:110`, six rows), both in step 7's
`LEDGER_FILES`. The other two (`lib/collectors/dbus.test.ts:289`, `:376`) carry no ⚠.

Measured here by running the pre-fix and post-fix scanners over every harness's own
`LEDGER_FILES`:

| step | before the fix | after | Δ |
|---|---:|---:|---:|
| 02–06, 08 | unchanged | unchanged | 0 |
| **07-auth-login** | **128** | **130** | **+2** |
| **09-ui-primitives** (the donor) | 67 | 67 | 0 — untriggered, not immune |
| **total, all eight** | **687** | **689** | **+2** |

No mark was lost anywhere by the change; every mark the old regex found, the new one finds.

### The corrected record — and why the agreement was not the good news it looked like

`build.md` §1 and `ANCHOR.md` §2.2 both record **37** invisible marks across steps 2–8, **21** of
them in step 7, and `build.md` presents "every step's raw count matches §10.1's prediction
exactly" as a clean result. It is not, and this matters more than the arithmetic:

**§10.1's prediction was produced by running step 9's scanner. Q1's build measured with the same
scanner. Both are blind to `.each<T>`.** The prediction and the measurement agreed because they
shared a defect, not because either was right. Two independent numbers that agree are evidence;
one number computed twice is not. The true figures:

| | recorded | true |
|---|---:|---:|
| invisible marks, steps 2–8 (raw, before Q1's one adjudicated ⚠ drop) | 37 | **39** |
| of which in step 7 | 21 | **23** |

Both are corrected in `build.md` §1 and `WORK-ITEMS.md` §10.1 with the reason stated, not
silently edited.

**Both newly-visible step-7 marks turned out to be backed already** — F1 demonstrated this itself
with `W1` and `W4`, and step 7's re-run here confirms it: 130 marks checked, every one reddened,
exit 0. No new mutation was needed for either. That is the same "backed incidentally" result the
build got for the other 35, and it is exactly why the finding matters: incidental backing is not
enforced, and the ledger could not have told you it was there.

---

## 3. What was applied

### 3.1 The scanner block — all eight harnesses, byte-identical

`md5` of the block from the F1 comment through `red_test_lines`, in all eight
`regressions.py`: **`d9bb8cfeae1ba6dbc9a87ceac24baaf3`**, identical. (It was
`fee75013a0e0605e953b2da854fbd499` before, also identical — the invariant that only
`LEDGER_FILES` differs is preserved.)

Three changes inside it:

1. **F1** — `CALL` gains an optional type argument:
   `(?:test|it)(\.each)?(?:\s*<[^;{}()]*>)?\s*\(`. Excluding `;{}()` stops the match running
   away across a statement. A type argument that *contains* a parenthesis
   (`test.each<[() => void]>`) would still be missed — and is now **reported** rather than
   dropped, which is the point of (2).
2. **F3** — a `CANDIDATE` regex and `_code_only()`. Every `test`/`it` call the scanner is
   expected to be able to read, matched against comment- and string-blanked source; anything
   `CALL` + `FIRST_STRING` did not consume prints
   `!!! <file>:<line>: a test/it call the ⚠-scanner cannot read — <source>`.
3. **F7** — `prefix = (name.split("%")[0] if m.group(1) else name).strip()`.

### 3.2 The mutation engine — all eight harnesses

**F6.** Alongside the existing `ANCHOR NOT FOUND` check, an `ANCHOR AMBIGUOUS` check on
`original.count(old) > 1`, reported as its own summary line and its own exit-1 category. The
harness already learned this lesson once — `ANCHORS MOVED` was split out of `DID NOT BITE` on
2026-09-07 because one label sends a reader hunting for the wrong thing — and this is the third
member of the same family.

Two anchors had to be pinned before the check could pass, which is the finding:

| id | was | now |
|---|---|---|
| `U6` (step 8) | `if (this.state.hidden) return;\n void this.poll();\n }` — **2×**: `start()` and `resume()` | prefixed with `this.syncHidden();`, unique to `start()`, the site its name describes |
| `T68` (step 4) | `} from '@/lib/collectors';` — **2×**: the value import and the `import type` block | prefixed with `withServiceState,`, unique to the value import |

Both still bite after pinning (verified in the runs: `U6` reddens
`⚠ a runtime that starts hidden never polls at all`; `T68` reddens
`⚠ the assembler shares no budget across collectors`).

### 3.3 Test names

| file | change | finding |
|---|---|---|
| `lib/collectors/http.test.ts` | `⚠ a timeout of %s …` → `⚠ an HTTP timeout of %s …`, plus a comment saying why | F2 |
| `lib/collectors/io.test.ts` | `⚠ a timeout of %s …` → `⚠ a subprocess timeout of %s …`, plus a comment saying why | F2 |

Both were renamed rather than one, deliberately. Renaming one breaks the collision, but leaves
the other with a 14-character prefix — the second-shortest in the project — sitting one new test
away from the next collision. Nothing in either body, fixture or assertion changed.

### 3.4 Mutation ids

`S11` → `SC1` in step 7, with a comment recording why `S12` was not the escape (it is already a
gap id in step 5's `reconciliation.md`) and that `G5` remains.

---

## 4. ⚠ What the re-run found that nobody had predicted — a genuinely inert ⚠ mark in step 8

**Step 8's first re-run exited 1.** One mark had no mutation behind it:

```
NO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:
  lib/client/wire.test.ts
    ⚠ an impossible calendar date is refused, never rolled forward — %s
```

This is the most interesting result of the item, and it is **not** an F1 consequence. It is a
consequence of Q1's build renaming that test and nobody re-running the harness that owns it.

**Why it was invisible for so long.** The old name was
`⚠ %s is refused rather than rolled forward`. The ledger's prefix is `name.split("%")[0].strip()`
— for that name, the single character **`⚠`**. `'⚠' in joined` is true for any run in which any
⚠-marked test reddens at all, so the mark scored **covered for free, in every harness run this
project has ever done**. §10.1 predicted the rename as a cosmetic tidy-up ("names need the
placeholder moved later in the sentence"); it was load-bearing.

**Why the build's own run did not catch it.** `build.md` §1 reports step 8 at exit 0 and §3
reports the four renames, without saying which came first. The evidence says the renames came
after step 8's run and only step 7 was re-run afterwards (`build.md` §2 documents re-running step
7 and no other). **A rename changes what the ledger checks; it is not a cosmetic edit and the
owning harness must be re-run.** That is a new rule and it is in `HANDOVER.md` §5.2.

**What was actually inert.** `wire.ts`'s `calendarMatches` — the 19-character round-trip that
refuses a `Date.parse` result which rolled forward — **has never had a mutation.** Step 8's own
harness docstring records half of this story already: *"`W4` removes `wire.ts`'s ISO-shape guard
and had bitten since the build. F13 then added a calendar round-trip that independently refuses
every row the test table held, so the mutation applied, the property stayed true, and the shape
guard's coverage went to zero without a word."* Step 8's reconciliation fixed `W4`'s side (two
new fixtures in the region only the shape guard sees) and **never backed the new guard**. The
ledger could not say so, because of the `⚠` prefix.

**Fixed with `W21`**, and this is a real defect rather than a manufactured one — `wire.test.ts`'s
own comment records that `wire.ts` once *"claim[ed] the format check left only `2026-13-01` to
catch, which was a comment naming a property the code did not have"`:

```python
("W21 the calendar round-trip goes, so Date.parse rolls an impossible date forward",
 WIRE_SRC, "  if (!calendarMatches(rawTs, tsMs)) return null;\n", "", [WIRE]),
```

Verified by hand before adding it to the harness (mutation applied manually, `vitest` run on
`wire.test.ts` alone, reverted, `git status` checked): 2 of the table's 4 rows redden
deterministically — `2026-02-30` → `2026-03-02` and `2026-04-31` → `2026-05-01`. The other two
(`2026-13-01`, `24:30`) are `NaN` and are refused one line earlier by
`Number.isFinite(tsMs)`, so they are correct in either implementation. Not equivalent, not
probabilistic. HANDOVER §5.2 rule 1 satisfied on its first branch: the property has a plausible
wrong implementation, and it is the one the file shipped.

The other three renamed names (`collect.test.ts`, `config.test.ts`, `safety.test.ts`, the last
re-worded again by the test phase) were checked the same way — by re-running the harness that
owns each — and all three are genuinely backed.

---

## 5. What was re-run, and the results

**All eight harnesses, strictly serially, nothing else touching the tree.** 771 mutations.
`git status` checked after every one; no stranded mutation in `lib/` at any point.

| harness | mutations | ⚠ marks | exit |
|---|---:|---:|---|
| `02-format-severity` | 55 | 13 | **0** |
| `03-collectors-gpu-host` | 72 | 24 | **0** — plus 5 F3 warnings, all genuine |
| `04-collector-cooling` | 92 | 83 | **0** |
| `05-collectors-serving-storage-safety` | 127 | 97 | **0** |
| `06-telemetry-route` | 63 | 56 | **0** |
| `07-auth-login` | 128 | **130** | **0** |
| `08-client-runtime` | **173** | 219 | **1**, then **0** with `W21` |
| `09-ui-primitives` | 61 | 67 | **0** |
| **total** | **771** | **689** | all green |

Every harness prints `Every ⚠-marked test went red under at least one mutation` and
`All N regressions failed their check, as they must`.

**Steps 2–8 alone: 710 mutations, 622 ⚠ marks** — against 584 before Q1 and 620 after Q1's build.

### The F3 diagnostic's output today, in full

Five lines, all from step 3's run, all genuine and none a false positive:

```
!!! lib/collectors/numbers.test.ts:50:  a test/it call the ⚠-scanner cannot read — test(`${JSON.stringify(raw)} is null, not 0 — ${builtin}`, () => {
!!! lib/collectors/numbers.test.ts:90:  … test(`${JSON.stringify(raw)} → ${want}`, () => {
!!! lib/collectors/numbers.test.ts:115: … test(`${JSON.stringify(raw)} → ${want}`, () => {
!!! lib/collectors/numbers.test.ts:156: … test(`${raw} is not a reading`, () => {
!!! lib/collectors/proc.test.ts:516:    … test(`${name} survives every one`, () => {
```

These are the five backtick-named tests the test phase found (§3.4) and the adversarial confirmed.
None carries a ⚠ today, so nothing is lost — but the point is that if one ever does, the run says
so instead of silently shrinking the checked set.

**The prose false-positive hazard F3 warned about is closed by measurement, not by hope.** A first
implementation printed 7 lines: the 5 above plus two `it.` matches in comment prose
(`lib/client/guardrails.test.ts:308`, `proxy.test.ts:200`) that `_code_only()` failed to blank,
because a regex literal containing a quote (`/['"]\/login['"]/`) upstream of them desynchronises
the string lexer — the exact hazard F3 and the test phase both named. Rather than fix the lexer,
`CANDIDATE` requires the token be followed by `<`, `(`, or a **known modifier word**
(`.each`/`.skip`/`.only`/`.todo`/`.concurrent`/`.fails`/`.for`/`.runIf`/`.skipIf`), which prose
does not produce. That took it to 5 with zero false positives, and it degrades safely: the lexer
is defence in depth rather than the only defence.

### Independent cross-check of the whole mark set

Against vitest's own registered names (one `vitest run --reporter=json`, exit 0, 67 files, 2210
tests, taken with nothing else running), every one of the 689 marks was tested against every
`FAIL` line its harness could ever emit:

- **0 marks that fail to match their own rendered name.**
- **0 cross-file prefix collisions.** F2's was the only one; it is gone. The second, inert
  instance F2 recorded (`⚠ the route declares dynamic = force-dynamic`, steps 6 and 7) is
  confirmed still inert — the two files remain in disjoint check universes.

### `pnpm verify`

```
$ pnpm verify
 Test Files  67 passed (67)
      Tests  2210 passed (2210)
Type Errors  no errors
EXIT: 0
```

Run twice: once after the edits and before any harness, once at handover after all eight. ⚠ **This
is not the green** (`ANCHOR.md` §8 rule 1 / §9) — the parent re-runs it on the tree I leave, and
that run is the one that counts.

---

## 6. F4, deferred — the full reason, because a deferral costs nothing visible

F4 is correct on every measurable claim, and I re-derived all of them: 65 test files, **63** in
some step's `LEDGER_FILES`, the two orphans are `lib/throttle.test.ts` and `lib/contract.test.ts`,
and both carry **0** ⚠ marks. Its failure scenario is plausible — `throttle.test.ts` is already a
step-2 mutation target, so adding a ⚠ to it is a thing a reasonable person does, and the mark
would be counted by nobody.

**What does not survive is the proposed fix**, and it is worth being specific because "add a
one-line global assertion" sounds free:

- **No harness knows the union.** Each `regressions.py` knows only its own `LEDGER_FILES`. A
  union check needs either a new cross-harness script — a new artifact that nothing in this
  pipeline automatically runs — or the union hardcoded in eight places, which is one source of
  truth copied eight times and stale on the first edit.
- **The per-harness approximation needs an exemption list.** "Every file in my `checks` must be in
  my `LEDGER_FILES`" is implementable and catches F4's own scenario. It also fires on **9 files
  across 5 harnesses that are deliberately owned elsewhere** — step 7's own comment spends a
  paragraph explaining that `lib/guardrails.test.ts` is *deliberately* not in its ledger because
  ledger ownership follows the file. Replacing one hand-maintained list with two, one of which
  exists purely to silence the other, is not an improvement.
- **A hardcoded orphan guard is Q1's own defect.** "Assert these two named files carry no ⚠" is
  six lines and closes today's exposure. It also produces a check that looks like it enforces
  F4's invariant while covering 2 of the future's N files — **a mechanism reporting green over a
  subset of the real set**, which is the precise thing Q1 exists because of. Shipping that with a
  reassuring name would be the worse outcome.

**Deferred to step 10** — the next step that adds a harness, and therefore the first moment the
union actually changes and a real runner has a reason to exist. Recorded in `HANDOVER.md` with
both orphan files named so nobody re-measures.

---

## 7. New gaps for the owner

Neither is a `SPEC.md` question — this item never touched product behaviour, and invariant 7 was
not engaged. Both are pipeline-convention questions, which is the owner's call and not a phase's.

1. **The mutation-id namespace collides with the gap/work-item namespace, and F5 only closes one
   instance.** `S11/G5` is a single open obligation cited in `ANCHOR.md`, `HANDOVER.md`,
   `WORK-ITEMS.md` and `UI-BACKEND-GAPS.md`. Step 7's harness has a mutation id for **`S11` and
   for `G5`.** Q1's build created the first; the second predates it and I did not rename it,
   because step 7's own notes cite `G5` and rewriting them is outside this item. `S12` is
   likewise both a step-3/5/8 mutation id and a step-5 gap id. **`ANCHOR.md` §7's warning that
   "the `S*` namespace is polluted" understates it: it is not confined to `S`, and it is not
   confined to steps 3–5.** The cheap convention would be a reserved prefix for mutation ids
   (they are already per-harness scoped, so any prefix works), applied when a harness is next
   edited. Recorded, not done.

2. **A rename of a ⚠ test name is a ledger change and must re-run the owning harness.** §4 above
   is the case: four renames, three harnesses re-run, one not — and the one not re-run was hiding
   an inert mark that had been scoring covered since step 8. This is now written into
   `HANDOVER.md` §5.2 as rule 8, but it is a *process* rule with no mechanism behind it, and this
   project's own `_assert_unique_ids()` comment says what that is worth: *a rule that is written
   down and not checked is a rule that has already been broken somewhere you have not looked.*
   The mechanism that would close it is F4's — a runner that can re-run everything a change
   touches — which is the second reason F4 is deferred to a real step rather than dropped.

---

## 8. Scope, and the four things not done

`SPEC.md` untouched. Nothing outside `dashboard/` touched. Nothing committed or staged — the tree
is left dirty for the parent. My `pnpm verify` is exit 0 and is **not** the green.

### Tree at handover

```
$ git status --short
 M lib/auth/config.test.ts                                  ← Q1 build (rename)
 M lib/auth/session.test.ts                                 ← Q1 build (the dropped ⚠)
 M lib/client/wire.test.ts                                  ← Q1 build (rename)
 M lib/collectors/collect.test.ts                           ← Q1 build (rename)
 M lib/collectors/http.test.ts                              ← THIS PHASE (F2)
 M lib/collectors/io.test.ts                                ← THIS PHASE (F2)
 M lib/collectors/safety.test.ts                            ← Q1 build + test phase (rename)
 M pipeline/steps/02-format-severity/regressions.py         ← Q1 build + THIS PHASE
 M pipeline/steps/03-collectors-gpu-host/regressions.py     ← Q1 build + THIS PHASE
 M pipeline/steps/04-collector-cooling/regressions.py       ← Q1 build + THIS PHASE (T68)
 M pipeline/steps/05-collectors-serving-storage-safety/regressions.py
 M pipeline/steps/06-telemetry-route/regressions.py
 M pipeline/steps/07-auth-login/regressions.py              ← + SC1
 M pipeline/steps/08-client-runtime/regressions.py          ← + U6, W21
 M pipeline/steps/09-ui-primitives/regressions.py           ← THIS PHASE ONLY (the donor)
 M pipeline/ANCHOR.md                                       ← THIS PHASE (§2, §2.2, §7)
 M pipeline/HANDOVER.md                                     ← THIS PHASE (rewritten)
 M pipeline/WORK-ITEMS.md                                   ← THIS PHASE (§2 A6, §10.1)
?? pipeline/handoffs/                                        (four Q1 handoffs)
?? pipeline/steps/Q1-ledger-scanner/                         (build, test, adversarial, this)
```

**18 files changed, 1623 insertions(+), 134 deletions(-)**, all under `dashboard/`.

⚠ **`pipeline/steps/09-ui-primitives/regressions.py` is newly modified and was not in the build
phase's or the test phase's status.** That is F1's reach: step 9's harness is the scanner's donor
and carries the same blind spot, so Q1's fix touches **eight** harnesses, not seven. Its own
ledger has been under-counting on the same terms — untriggered today only because `components/`
happens to contain no generic-typed `.each`, which is luck rather than immunity.

### Documents corrected by this phase

| file | what |
|---|---|
| `steps/Q1-ledger-scanner/build.md` | §1's table and totals: step 7's true invisible count 21 → 23, the total 37 → 39, the "agree?" column's meaning restated (both scanners shared a blind spot); step 8's mutation count 172 → 173; a §7 added recording the rename that was never re-validated |
| `WORK-ITEMS.md` §10.1 | the same two numbers, and the "unmatchably short" paragraph rewritten — it was not a smaller defect riding along, it was hiding an inert mark |
| `WORK-ITEMS.md` §2 (A6) | marked closed — it was done during step 8 and the build phase confirmed it |
| `ANCHOR.md` §2.2 | Q1's numbers; Q1 marked done; "what to do next" now points at **Q2**, then step 10 |
| `ANCHOR.md` §7 | A6 removed from the still-open list; the namespace warning widened per §7.1 above |
| `HANDOVER.md` | rewritten header and every section Q1 touched; open obligations re-checked against `SPEC.md` (three were stale — see below) |

### ⚠ Three `HANDOVER.md` entries were stale against `SPEC.md`, in the safe direction — the fifth time

The parent's handoff said to re-check rather than copy forward. Doing so:

- **S19** — HANDOVER §8 lists it open. `SPEC.md` line 1327 carries *"⚠ S19, settled 2026-09-07:
  the message text carries it and the RENDERING does not"*, with the rejected alternatives.
  **Closed.**
- **S30** — HANDOVER §8 lists it open. `SPEC.md` line 780 carries *"Tone is `warn`, not `error`
  (⚠ S30, settled 2026-09-07)"*. **Closed.**
- **S49–S53** — HANDOVER §8 says *"the owner has not yet put any of them into `SPEC.md`"*. All
  five are in the spec as `WORK-ITEMS.md` §9's A8–A12. **Closed.** (`ANCHOR.md` §7 already knew
  this; HANDOVER did not, which is exactly the drift the rule exists to catch.)
- **S11/G5** — the **collector half** is settled in `SPEC.md` line 1208 (*"the exception has ONE
  hole and the collector closes it"*, and `collectCooling` now files the entry). Only the
  **panel-rendering** residue is open, owned by step 10. Narrowed, not closed.
