# Q1 — back-port the corrected ⚠-scanner — ADVERSARIAL

Branch `dashboard-frontend`. **Nothing was fixed, nothing committed, `SPEC.md` untouched.** Every
experiment that mutated a source file was reverted and `git status --short` was diffed against a
snapshot taken at the start of this phase; it is byte-identical at handover (12 modified files,
497 insertions / 47 deletions — exactly what build and test left).

Method note: rather than reasoning about the scanner, I **re-implemented it verbatim in a
scratchpad script** and ran it over every `LEDGER_FILES` entry of all eight harnesses, then
cross-checked its output against **ground truth from vitest itself** — a full
`pnpm vitest run --reporter=json` (exit 0, 2210 tests, 885 of them with `⚠` in the title) parsed
into the exact `FAIL <file> > <suite> > <test>` lines the ledger matches against. That is what
turned Finding 1 up; no amount of reading the regex would have.

---

## Findings

### F1 — ⚠⚠ `test.each<T>(…)` is invisible to the scanner, and **two ⚠ marks are invisible in step 7 right now**, after Q1

**This is Q1's own defect class, still live in the file Q1 declared clean.**

`CALL = re.compile(r"(?:^|\s)(?:test|it)(\.each)?\s*\(")` requires `(` immediately after
`.each`. A **generic type argument** between them defeats it, and the regex then matches
*nothing at all* — the branch with `(\.each)?` empty also fails, because `\s*\(` cannot match
`.each<`. The call is not mis-parsed; it is never seen.

Two such calls carry ⚠ marks, both in `lib/auth/login-view.test.ts`, both inside step 7's
`LEDGER_FILES`:

| line | source | rendered ⚠ tests |
|---|---|---|
| 78 | `test.each<[string, LoginState, string \| null, boolean]>([…])('⚠ §5.2 state — %s', …)` | 6 |
| 113 | `test.each<[string, LoginState]>([…])('⚠ the password field is never disabled — %s', …)` | 6 |

**Evidence.** vitest registers 12 tests whose titles contain `⚠` in that file for which **no
mark prefix returned by `marked_tests()` is a substring**. Cross-checked in both directions:
the scanner reports 128 marks for step 7 (matching `build.md` exactly), and the file's real
count is 130. The same audit over all eight harnesses shows this is the only file affected —
every other registered ⚠ test in every ledger file is matched by some mark prefix.

Two further generic-typed `.each` blocks exist and are equally invisible —
`lib/collectors/dbus.test.ts:289` and `:376` (step 5's ledger, `DBUS`) — but neither name
carries a ⚠, so nothing is lost there today. Repo-wide there are exactly four
`(test|it).each<`.

**Is coverage actually lost today? No — and that is the whole problem.** I applied two existing
step-7 mutations by hand and reverted each:

```
W4 (login-view.ts, fieldDisabled: false → true while submitting)
 FAIL  lib/auth/login-view.test.ts > §5.2’s six states > ⚠ the password field is never disabled — submitting
      Tests  1 failed | 42 passed (43)

W1 (WRONG_PASSWORD_MESSAGE reworded)
 FAIL  lib/auth/login-view.test.ts > the copy §5.2 fixes > ⚠ the wrong-password and expired messages are §5.2’s, exactly
 FAIL  lib/auth/login-view.test.ts > §5.2’s six states > ⚠ §5.2 state — Wrong password
      Tests  2 failed | 41 passed (43)
```

Both invisible marks are backed **incidentally**. The ledger does not know that, does not
require it, and would not notice it going away.

**Concrete failure scenario.** Someone retires `W1` as redundant with `W3`/`W12` (the
message-copy mutations overlap heavily), and separately edits `loginView` so the `wrong` and
`unreachable` branches return the same message object — §5.2's sixth row collapsing into its
third, which is *precisely* the defect `W12`'s own name says the project fears. The six
`⚠ §5.2 state — …` rows go inert. Step 7's harness prints
`128 ⚠-marked tests checked. … Every ⚠-marked test went red under at least one mutation.` and
exits 0. Nothing anywhere says 130 marks exist.

**Consequences for the record, not just for the code:**

- `ANCHOR.md` §2.2 and `build.md` §1 both state **37** invisible marks across steps 2–8, 21 of
  them in step 7. Reproducing the old and new scanners side by side (old regex recovered from
  `git diff`) gives **584 → 620 for steps 2–8** — i.e. +36 after the one adjudicated drop, +37
  raw, agreeing with `build.md` exactly. But the true invisible count was **39** (+2 in step 7,
  making step 7's own figure **23**, not 21), because *both* scanners are blind to `.each<T>`.
  Q1 closed one blind spot and inherited another of identical shape.
- Step 9's harness — the donor of the "corrected" scanner — has the same hole. It is untriggered
  only because `components/` happens to contain no generic-typed `.each`.

**Fix shape, if accepted (not applied).** Allowing an optional type-argument list in `CALL`,
e.g. `(?:test|it)(\.each)?(?:\s*<[^;{}()]*>)?\s*\(`, closes it in one line across eight
harnesses. It is worth pairing with F3's diagnostic rather than shipping alone: a regex that
silently matches nothing is how this got here.

---

### F2 — Two ⚠ marks in step 5's ledger have **identical names**, so the ledger cannot tell them apart (answers §3.2)

I ran the global check the handoff asked for, and then a stronger version of it: every mark
prefix from every harness tested against **every FAIL line that harness could ever emit**,
reconstructed from vitest's own registered names (`FAIL <rel> > <ancestors…> > <title>`) over
each harness's complete mutation-check universe — not just its `LEDGER_FILES`, and using
`%s`-substituted titles rather than raw source names. 2210 registered tests, 687 marks.

**Result: exactly one live collision, in step 5.**

| file:line | name |
|---|---|
| `lib/collectors/http.test.ts:196` | `⚠ a timeout of %s falls back to the module default, never to setTimeout’s 1 ms` |
| `lib/collectors/io.test.ts:254` | *the same string, character for character* |

Both yield prefix `'⚠ a timeout of'` (14 chars — the second-shortest in the whole project).

**Demonstrated with real vitest output, not simulated.** I applied step 5's `I1` mutation
(`lib/collectors/io.ts`, `}, bound);` → `}, timeoutMs);`) by hand, ran **only**
`lib/collectors/io.test.ts`, captured its five FAIL lines, and reverted:

```
covered FAIL lines captured from the I1 run (io.test.ts ONLY): 5
  ledger predicate for lib/collectors/http.test.ts:196 mark: '⚠ a timeout of' in joined -> True  => COVERED
  ledger predicate for lib/collectors/io.test.ts:254  mark: '⚠ a timeout of' in joined -> True  => COVERED
```

`http.test.ts` never ran, and its ⚠ mark scores covered.

**Concrete failure scenario.** `H8` and `I1` are two mutations of the same shape at two seams,
and the comment above `H8` says so ("One mutation per `setTimeout` delay, so the ledger stops
being silent about either site"). A future cleanup that factors the two bounds into one shared
helper — or simply re-aims `H8` at the new helper and leaves its `checks` list at `[HTTP,
guardrails]` while the anchor now lives elsewhere — removes `http.test.ts` from the reddening
set. `I1` still fires, `joined` still contains `⚠ a timeout of …`, the ledger prints "Every
⚠-marked test went red" and exits 0, and the HTTP seam's ⚠ test is inert. The intent the comment
records is *not* enforceable by the mechanism written to enforce it.

**Second instance, currently inert, recorded so it is not rediscovered:**
`⚠ the route declares dynamic = force-dynamic` is duplicated between
`app/api/session/route.test.ts:24` (step 7) and `app/api/telemetry/route.test.ts:46` (step 6).
Neither file is in the other harness's check universe, so no conflation occurs today; it becomes
live the moment either harness's `checks` grows to include the other file.

Nothing else collides. No mark prefix is a substring of any other test's rendered name, no
prefix spans a `%s` boundary into another name, and no prefix fails to match its own test.

---

### F3 — `marked_tests()` warns about a *weak* match and is **silent about no match at all** (answers §3.1, and I think the parent under-stated it)

The parent's §3.1 asked me to test the reasoning rather than agree. I agree with the conclusion
and disagree with its scope: **the backtick case is one instance of a general asymmetry**, and
F1 proves the general case is not theoretical.

`marked_tests()` has exactly one diagnostic — `!!! … ⚠ test name is unmatchably short` — and
**three silent `continue` paths**:

1. `_skip_balanced` returns `None` (an unbalanced `.each(…)` argument list),
2. the character after a skipped `.each(…)` is not `(`,
3. `FIRST_STRING` does not match — a backtick name, a name behind a comment, a name built by a
   helper.

Plus the fourth route F1 found, which is upstream of all of them: `CALL` never matches, so no
path is taken at all.

**Demonstrated.** A synthetic file (scratchpad only, never in the tree) containing four ⚠
marks — one ordinary quoted `.each` name whose fixture array holds a regex literal
`/['"]\/login['"]/`, one backtick name, one name behind a comment, one ordinary name:

```
scanner output (everything it prints):
  (nothing above this line = the scanner printed nothing)

marks the file actually contains: 4
marks the scanner found: 1
    '⚠ an ordinary mark that IS seen'
```

Three marks dropped, zero output. Note the first of the three is a **completely ordinary
quoted `test.each` name** — the blind spot is not confined to unusual name syntax; a quote
character inside a regex literal in the fixture array is enough, because `_skip_balanced` has no
concept of a regex literal and treats the `'` in `['"]` as opening a string.

**Answering the three questions as asked:**

- *Is the failure reachable in this codebase's conventions?* **It is already realised** — see F1.
  For the backtick case specifically: five backtick-named tests exist today
  (`lib/collectors/numbers.test.ts:50,90,115,156`, `lib/collectors/proc.test.ts:516`), all using
  `for (const x of …) test(\`${x}…\`, …)`, none marked. So the habit is not strong enough to
  rely on — a live convention in this repo already produces names the scanner cannot read, and
  the only thing standing between that and a lost mark is that nobody has typed a ⚠ into one.
  For the regex-in-fixture case: real regexes with quotes exist
  (`lib/auth/login-view.test.ts:242-243`, `lib/client/guardrails.test.ts:110,140`) but all sit in
  callback bodies, never in a `.each` fixture array. **Confirmed mechanically across every ledger
  and check file: zero `SKIP-unbalanced` and zero `SKIP-no-paren` today.** So that one is a note,
  not a bug — but only by luck, and it is silent when the luck runs out.
- *Is the cheap fix a pure diagnostic?* **Yes, and it should be widened beyond backticks.** One
  `print` on each of the four skip paths — "a `test`/`it` call at `<file>:<line>` was skipped;
  its name is not a plain quoted string" — catches backticks, F1's `.each<T>`, a comment before
  the name, and a future `_skip_balanced` mis-parse, all without parsing anything new. It does
  not reintroduce interpolation-parsing risk into eight harnesses, which was the parent's real
  worry.
- *Is a warning worse than nothing?* No. The output volume is bounded (today it would print
  8 lines across the whole project: the 5 backticks, F1's 2, and — see below — 3 harmless
  false positives), and every one of the 8 is something a reader should know.

**One caveat the warning must be built around: `CALL` also matches English prose.**
`(?:^|\s)(?:test|it)\s*\(` matches ` it (` in a comment. Three real instances today, all
harmless because `FIRST_STRING` then fails:

```
lib/collectors/deadline.test.ts:85   "… the mutation below it (T52) walked straight through it."
lib/telemetry/snapshot.test.ts:44    "… exactly as `collectCooling` returns it (O9) —"
lib/throttle.test.ts:49              "… before requiring it (2026-09-07): driver 580.173.02 …"
```

A naive "warn on every skip" would print these three every run and train the reader to ignore
the warning — which would be worse than nothing. The diagnostic needs to suppress matches that
fall inside a comment (`marked_tests()` is comment-aware *inside* `_skip_balanced` but not at
the `CALL.finditer` level). Recording it here so whoever implements F3 does not ship the noisy
version. The converse hazard is worth naming too: a comment containing
`` it('⚠ …') `` would register a **phantom mark** the ledger can never satisfy. None exists today.

---

### F4 — Nothing enforces that a test file containing ⚠ marks is in *some* `LEDGER_FILES`

Ledger membership is hand-maintained per step. There is no assertion anywhere that the union of
the eight `LEDGER_FILES` covers every file that carries a ⚠.

Measured: 65 test files, **63** appear in some step's `LEDGER_FILES`. The two that do not are
`lib/throttle.test.ts` and `lib/contract.test.ts`. I ran the real scanner over both: **0 ⚠
marks** in each (`throttle.test.ts`'s single `⚠` is in a comment at line 43), so nothing is lost
today.

**Concrete failure scenario.** `lib/throttle.test.ts` *is* already a mutation-check target — step
2's `T`-series mutations name it three times — so a reasonable person adds a ⚠ to its
`0x`-prefix boundary test (line 43's comment says the `'4'` case is "on the refused side of that
boundary", which is exactly the boundary-both-sides rule ANCHOR §5 says three steps have already
got wrong). It is in no `LEDGER_FILES`, so `marked_tests()` never reads the file, the mark is
never counted, no mutation is ever required to redden it, and every harness stays green. Same
silent-under-checking species as Q1 itself, reached by a different route.

A one-line global assertion (grep every `*.test.ts(x)` for `⚠` inside a test name; fail if the
file is in no `LEDGER_FILES`) makes it impossible.

---

### F5 — `S11` collides with an open work-item id the project cites constantly

Q1's build added a step-7 mutation `S11 the parsed-hash null check is dropped …`. `S11` is
already this project's identifier for an **open** obligation, always written `S11/G5`, cited in
`ANCHOR.md:80` and `:242`, `HANDOVER.md:428`, `:839`, `:921`, `UI-BACKEND-GAPS.md:78`, `:163`,
and `WORK-ITEMS.md:104`, `:217`, `:218`, `:238`.

`ANCHOR.md` §7 already warns: *"the `S*` namespace is polluted: some `S`-prefixed ids in steps
3–5 are harness mutation ids, not gaps."* Q1 extended the pollution to step 7, and to the one
S-number that is currently load-bearing in the queue.

**Concrete failure scenario.** A step-10 agent reads `ANCHOR.md` §2.1 — *"it has O19, D4 and D5
but not the time formatter or S11/G5"* — greps `S11` to find out what it must implement, and the
first hit is a scrypt mutation in `pipeline/steps/07-auth-login/regressions.py`. Cost is
confusion, not breakage; `_assert_unique_ids()` is per-harness and correctly unaffected (144 ids
are already reused across different steps by design, and no harness has an internal duplicate —
verified for all eight). Renaming to `S12` or `SC1` is free and this is the moment it is cheap.

---

### F6 — Two mutation anchors match their file **more than once**, and `replace(old, new, 1)` silently takes the first (scope-adjacent — the mutation engine, not the scanner)

I checked all **808** mutation anchors across the eight harnesses against the current tree.
Two are ambiguous:

| id | file | occurrences |
|---|---|---|
| `U6` (step 8) | `lib/client/runtime.ts` | `"    if (this.state.hidden) return;\n    void this.poll();\n  }"` appears **2×** |
| `T68` (step 4) | `lib/telemetry/snapshot.ts` | `"} from '@/lib/collectors';"` appears **2×** (lines 83 and 96) |

`T68` is benign — it inserts an import after whichever occurrence comes first, and the guardrail
it targets scans source text, so either site serves.

`U6` is not obviously benign: its name is *"**both** hidden-tab guards go, so a background tab
polls from the moment it mounts"*, and `replace(…, 1)` leaves one of the two identical guard
sites intact. **Concrete failure scenario:** the two sites are `start()` (line 289) and the
resume path (line 342). If a refactor reorders them, the mutation silently moves to the other
call site. It still bites, the ledger still goes green, and the mutation is now certifying a
different property from the one its name records — the "red for the wrong reason" case the
harness's own header comment calls the ledger's irreducible limit, arriving here through the
mutation engine rather than through a test.

Cheap guard: assert `original.count(old) == 1` alongside the existing `ANCHOR NOT FOUND` check,
and report a third category. Flagged as scope-adjacent so reconcile can DEFER it cleanly.

---

### F7 — `prefix = name.split("%")[0]` is applied to plain `test()` names too (low)

The `%`-split exists to strip a `test.each` placeholder. It runs on every name, including plain
ones, so a literal `%` truncates the prefix for no reason. Two live cases, both in
`components/meter.test.tsx` (step 9's ledger):

| line | name | prefix actually used |
|---|---|---|
| 22 | `⚠ exactly full renders 100%, not clamped away or overflowed` | `⚠ exactly full renders 100` |
| 29 | `⚠ used greater than total clamps to 100%, never past it` | `⚠ used greater than total clamps to 100` |

Harmless today — both remain unique, both are well over the 12-character floor, and both match
their own FAIL line. Recorded because it shortens the discriminating prefix silently, which is
the input to F2's failure mode: a third meter test named `⚠ exactly full renders 100% of the
bar …` would be conflated with line 22's mark and neither would be independently required to
redden.

---

## What I attacked and could NOT break

Spend no reconcile budget re-checking these. Each was measured, not reasoned about.

| Claim | How I tried to break it | Result |
|---|---|---|
| The suite is green | Ran the full `vitest run --reporter=json` myself on the tree as left by test | **exit 0**, 67 files, 2210 tests. (I did not re-run `tsc`; the parent's `pnpm verify` covers it) |
| Scanner block byte-identical across steps 2–9 | md5 of the `CALL`…`red_test_lines` span in all eight | identical, `a55d6c64b934f6d447918665e782fe70` |
| **The ledger *check* in `main()` is identical too** (nobody had verified this — a step could have had a decorative scanner and no check) | md5 of the `# --- the ledger` … `Every ⚠-marked test went red` span in all eight; plus `_assert_unique_ids()`, `marked = marked_tests()` and `if uncovered:` present exactly once each | identical, `31d099b74327ac620e18c8598bb33dbe`, all eight wired up |
| `build.md` §1's before/after table | Recovered the **old** `MARKED` regex from `git diff` and re-ran both scanners over every ledger file | reproduced exactly: 11→13, 22→24, 83→83, 94→97, 56→56, 108→128, 210→219; **584 → 620 for steps 2–8** (+36 post-drop, +37 raw). Step 9 also gained 3 (64→67) under the same comparison, confirming its own scanner was already the corrected one |
| `build.md`'s mutation counts | Counted `REGRESSIONS` entries by AST, including `REGRESSIONS +=` blocks | 55 / 72 / 92 / 127 / 63 / **128** / 172, and 61 for step 9 — every number matches |
| No mutation has gone stale | Checked all **808** anchors against the current tree | **0 `ANCHOR NOT FOUND`.** Every mutation in every harness is still aimed at live code |
| Mutation ids are unique | AST-extracted every id per harness | no duplicate inside any harness. 144 ids are reused *across* harnesses, which the per-harness assertion correctly permits |
| The four renamed test names describe their bodies | Read each diff hunk against its assertions | all four accurate, including the test phase's regrammared `safety.test.ts` line. Prefixes 54–80 chars, far over the floor; none collides with anything (F2's sweep) |
| Q1 did not creep in scope | `git diff -U0` hunk headers for all seven harnesses | changes confined to the scanner block plus step 7's three new mutations. Nothing outside `dashboard/`; `SPEC.md` untouched |
| `K8` really backs two marks (not a prefix artefact) | Independent of the test phase: checked both marks' prefixes (`⚠ answers null for`, `⚠ no session is found on the request`) against every FAIL line step 7 can emit | distinct, each matching only its own file. The two-mark claim is genuine |
| The dropped `session.test.ts` ⚠ was safe to drop | Looked for the single mutation the build/test phases might have missed. Best candidate: delete `decodeExact`'s length check (`if (decoded.length !== expectedBytes) return null;`) — that is exactly the guard `session.ts:162` documents as the one stopping `timingSafeEqual` from throwing on a length mismatch, and it is a *plausible* omission (someone reasoning that the canonical re-encode subsumes it — it does not, since a shorter canonical field re-encodes to itself) | **Still does not redden it.** The RangeError is caught by the outer `catch`, which returns `null`, and the test asserts `.not.toThrow()` + `toBeNull()` — both hold. Reddening still needs the catch removed *as well*. `S4` already mutates that exact line with `checks=[SCRYPT]`, correctly not `[SESSION]`. **The drop stands.** (Underlying reason, which is ANCHOR §5's own rule: the test is structurally incapable of distinguishing "guarded" from "throws and is caught") |
| Some other name syntax is silently unscanned | Grepped all 65 test files for `test.skip`, `it.skip`, `.only`, `.todo`, `.fails`, `.concurrent`, `.for`, `` .each` `` (template table), `describe.each`, nested template literals | **zero of every one.** The only unscanned forms in the repo are the 5 backtick names (F3) and the 4 generic-typed `.each` (F1) |
| A `.each` fixture array defeats `_skip_balanced` today | Ran the real `_skip_balanced` over every ledger and check file | 0 unbalanced, 0 "no `(` after `.each`". The regex-literal hazard is real (F3) but **not triggered anywhere today** |
| A ⚠ name's raw source text differs from its rendered title | Searched all 687 marks for backslash escapes (which `FIRST_STRING` captures raw and would make un-matchable) and for `$`-placeholder `.each` names | **none of either.** Every mark's prefix matches its own rendered FAIL line |
| ⚠ marks exist outside every ledger | Ran the scanner on the two orphan files | `lib/throttle.test.ts` 20 tests / 0 marks, `lib/contract.test.ts` 16 tests / 0 marks. F4 is a latent hole, not a live loss |
| `S11` / `K8` / `W19` are genuinely new coverage | The build's first step-7 run reported these marks *uncovered* with the corrected scanner, which is a proof no pre-existing mutation reddened them; separately checked `W7` (the sibling `Retry-After` mutation) cannot redden `W19`'s row — `Number(' 30 ')` is `30`, so the padded fixture still passes under `W7` | none is subsumed by an existing mutation |

## Gaps / spec silence

None. Every finding is internal to the harnesses, the test names, or the pipeline's own id
conventions. Nothing here touches product behaviour or `SPEC.md`, and no spec question arose
(invariant 7 not engaged).

## Final state

```
$ git status --short          # diffed against a snapshot taken at phase start
 M lib/auth/config.test.ts
 M lib/auth/session.test.ts
 M lib/client/wire.test.ts
 M lib/collectors/collect.test.ts
 M lib/collectors/safety.test.ts
 M pipeline/steps/02-format-severity/regressions.py
 M pipeline/steps/03-collectors-gpu-host/regressions.py
 M pipeline/steps/04-collector-cooling/regressions.py
 M pipeline/steps/05-collectors-serving-storage-safety/regressions.py
 M pipeline/steps/06-telemetry-route/regressions.py
 M pipeline/steps/07-auth-login/regressions.py
 M pipeline/steps/08-client-runtime/regressions.py
?? pipeline/handoffs/…            (the three Q1 handoffs)
?? pipeline/steps/Q1-ledger-scanner/   (build.md, test.md, this file)

12 files changed, 497 insertions(+), 47 deletions(-)   — identical to the test phase's handover
```

Three source mutations were applied and reverted during this phase (`I1` on
`lib/collectors/io.ts`, `W4` and `W1` on `lib/auth/login-view.ts`); each was followed by
`git checkout --` and an md5/status check. No `regressions.py` harness was run — every
experiment used a targeted `pnpm vitest run <one file>`, and the one full-suite run was a plain
`vitest run` with nothing else touching the tree. No commit made.
