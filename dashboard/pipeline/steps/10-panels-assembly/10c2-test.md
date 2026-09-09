# Step 10c-2 — the guards (TEST)

**Written by the test-phase agent, 2026-09-08.** Branch `dashboard-frontend`. Read `10c2-build.md`
in full, `SCOPE.md`, `HANDOVER.md` §0.3/§0.5/§0.6, `ANCHOR.md` §4/§5/§8, `PLAN.md`, and the four
new `lib/*.test.ts` guard files end to end before writing anything below.

---

## 1. ⚠ THE HEADLINE ANSWER — no, the lint would not have caught `toContain('paused')`, and the
build's own "what it cannot catch" section understates why by one full severity level

**Established precisely, by direct evaluation, not by re-reading prose:**

```
isDangerousLiteral('paused')  === false
isDangerousLiteral('refresh') === false
```

`isDangerousLiteral` recognises exactly two shapes — a bare `data-severity="…"` string and a bare
(or singly tag-wrapped) `EM_DASH`. A bare non-attribute WORD matches neither `DATA_SEVERITY` nor
either em-dash pattern. That is one of two independent reasons the answer is no.

The second is structural. `compositePanelSourceFiles()` walks `readdirSync(PANELS_DIR)` where
`PANELS_DIR = components/panels` — confirmed by listing the directory:

```
$ ls components/panels/*.tsx | grep -v test        # cooling-panel.tsx, cpu-panel.tsx, gpu-panel.tsx, …
$ find components -maxdepth 1 -iname "header*"     # components/header.test.tsx, header.module.css, header.tsx
```

`header.tsx`/`header.test.tsx` live in `components/`, a directory this guard's file-walk never
enters. Confirmed further that even a hypothetical relocation would not help: `header.tsx`'s own
import list (`grep -n "^import" components/header.tsx`) names `header-status`, `mode`, `prefs`,
`types`, and its own CSS module — no `panel-shell` import anywhere. Both `'paused'` and
`'refresh'` lived in exactly this file (`components/header.test.tsx:60-70,106-119`), already
fixed on today's tree by 10a's own reconciliation (the assertions now read the literal joined
string, e.g. `toContain('paused · 6 alarms')`) — but nothing in this guard's code would stop
either shape from regressing there, or in a tenth panel, tomorrow.

**So the lint is excluded from `header.tsx` twice over — by directory scope and by literal
vocabulary, independently — and both were verified empirically** (`ls`/`grep` for scope; a direct
call to `isDangerousLiteral` for shape), not merely asserted from reading the source.

### The judgment: the SCOPE trade-off is defensible; the DOCUMENTATION of it is not

Narrowing to a closed, two-member literal vocabulary is a sound engineering call — the general
"any bare attribute" version genuinely has a prohibitive false-positive rate (198 whole-document
`toContain` calls exist today, the overwhelming majority sound). That part of `10c2-build.md`'s
reasoning holds up.

**But `10c2-build.md` §1 and `lib/tocontain-scope.test.ts`'s own module doc both mischaracterise
what is left uncovered**, in a way that materially understates it. Both said, verbatim:

> "A whole-document check of a **third** dangerous literal this project **has not been bitten by
> yet** (a bare `data-role="…"`, a bare `data-mode="…"` — the exact shape `'paused'` was)."

This is not a hypothetical third case. `'paused'` and `'refresh'` are the **first two of the four
founding failures** this very guard exists to close (10c2-build.md's own opening table lists
them first) — they already bit, twice, and are named in this file's own first paragraph. Calling
them "not been bitten by yet" while naming `'paused'` as the example, in the same sentence, is an
internal inconsistency, not merely an imprecise word choice: it reads as "everything that
historically bit is closed; only a new, undiscovered shape remains" when the true state is "half
of what historically bit remains completely open, with no guard anywhere in the project closing
it." A bare `data-role`/`data-mode` attribute genuinely IS an un-bitten, hypothetical third case
and belongs in the "cannot catch" list on its own terms — conflating it with the bare-word case
that already caused two of the four founding bugs is exactly the failure ANCHOR/HANDOVER name
repeatedly as this project's worst repeated defect: **a guard (or, here, a guard's own
documentation) that implies more coverage than it delivers.**

**Fixed** (in scope, source-level, no behaviour change — a doc-comment correction in the guard
this loop is the primary subject of): `lib/tocontain-scope.test.ts`'s "What this guard CANNOT
catch" section now states plainly that the bare-word shape is two of the four founding failures,
already realised, confirmed excluded twice over (scope and vocabulary), and distinct from the
genuinely-hypothetical bare-attribute case. `10c2-build.md` itself is left as the frozen
build-phase record (per this project's established convention — see HANDOVER §0.6's "document now
carries a marked correction with the original struck" pattern, applied to test-phase documents,
not retroactively to build documents); this file is where the correction lives for that reason.

**What follows from this for the parent's future planning, stated once:** if a bare-word
whole-document `toContain` regresses anywhere in `header.tsx`, or is introduced fresh in a tenth
panel's header-shaped subtitle, or in any file outside `components/panels/`, `lib/tocontain-scope
.test.ts` will report clean. That gap is real, disclosed (now accurately), and open.

---

## 2. The 8 `toContain`-lint hits — all 8 real, all 8 fixed (none silenced)

Read every diff (`git diff -- components/panels/*.test.tsx`), not just the build's table.

| file | fix mechanism | verified |
|---|---|---|
| `cpu-panel.test.tsx:56` | new `rowContaining(html, 'temperature')`, scoping both assertions | Diff scopes the SAME two assertions to the row; nothing was weakened or deleted. Reproduced live: mutating `Row`'s `severity` to `null` in a scratch check still shows the PanelShell head at `alarm` — the exact hazard the fix closes |
| `memory-panel.test.tsx:69,110` | new `ramMeterOf(html)` helper (`html.slice(indexOf('</header>'), indexOf('>swap<'))`), a substring window past the head and before the swap row | Both call sites re-checked against the panel's actual markup order; the slice bounds are non-overlapping with the head |
| `safety-panel.test.tsx:56` | existing `rowContaining` helper (already used two tests below in the same file), now applied here too | Confirmed `rowContaining`'s bracket-matching (`lastIndexOf('<div', at)` / `indexOf('</div>', at)`) captures both the chip and the row's own error text in one slice |
| `storage-network-panel.test.tsx:47,81` | existing `rootMeterOf` (for the root-disk case) plus `rowContaining` **hoisted from a nested `describe` to module scope** so both `§6.2` tests can reach it | Confirmed the hoist changed nothing about the helper's body — same bracket-matching logic, just a wider scope |
| `serving-panel.test.tsx:31` | `valueCells(html).some((cell) => cell.includes('—'))`, `test-support.ts`'s existing helper (`class="_value…"` regex) | Confirmed `valueCells` is unrelated to `PanelShell`'s head chip class, so this scoping is real, not cosmetic |
| `session-event-log-panel.test.tsx:71` | new `entryContaining(html, needle)`, same bracket-matching pattern applied to `<li>` instead of `<div>` | Build's own note that this panel's head chip is a hardcoded `null` (no live hazard today) is correct, and scoping anyway is the right call per its own reasoning — a future edit giving the panel a real chip needs no guard change to stay covered |

**None of the seven non-CPU hits weaken or drop an assertion** — every fix keeps the exact same
claim, narrowed to the element that actually carries it. That is "fixed," not "silenced," by the
project's own definition of the distinction (HANDOVER §0.4: "assert over the element that carries
the claim, never over the document that contains it").

All 8 fixes and the CPU-panel live-mutation proof are wired as **one** representative regression
(`10c-G2`, un-scoping the CPU-panel fix back to `expect(html)`), run and confirmed below.

---

## 3. Q1-F4 — the cross-harness ledger runner: union re-derivation, verified live

Read `lib/cross-harness-ledger.test.ts` in full. `ledgerUnion()` walks
`pipeline/steps/<step>/regressions.py` for every directory that exists **today** (`readdirSync`),
and `allTestFiles()` walks the whole repo for `*.test.ts(x)` **today**. Nothing is a fixed list.

**Verified by actually adding and removing a tenth harness, not by reading the code:**

```bash
mkdir -p pipeline/steps/99-fake-test-step
cat > pipeline/steps/99-fake-test-step/regressions.py <<'EOF'
FAKE_TEST = "lib/throttle.test.ts"
LEDGER_FILES = [FAKE_TEST]
EOF
npx vitest run lib/cross-harness-ledger.test.ts
```

Result: the previously-known second orphan (`lib/throttle.test.ts`) dropped out of the orphan set
immediately — `orphans.length` went to 0, and the guard's own "not vacuous" check correctly
**failed** (there happened to be no orphan left to exercise the guard, since `lib/contract.test.ts`
was fixed by this loop and `lib/throttle.test.ts` was just absorbed by the fake harness). Removed
the fake step; re-ran; back to 13/13 passing, `git status` clean. This proves the union is
recomputed from the filesystem on every run, both when a harness is added (§ the ask) and when a
file effectively "leaves" a ledger's shadow (§ the other half of the ask, and the direction
`10c-G5` — dropping `CPU_PANEL_TEST` from step 10's own `LEDGER_FILES` — already covers as a wired,
repeatable mutation).

`lib/contract.test.ts`'s new ⚠ mark (10b-S-G's `errors[].instance` test) and its fix (added to
step 3's `LEDGER_FILES`, mutation `10c-G1`) were both re-verified directly:

```
$ python3 pipeline/steps/03-collectors-gpu-host/regressions.py
--- 10c-G1 a collector-wide errors[] entry (no real subject) is given a spurious instance
    exit=1  Tests  1 failed | 16 passed (17)  red=1
      FAIL  lib/contract.test.ts > the wire format > ⚠ errors[].instance crosses the wire …
```

Matches `10c2-build.md`'s own claim exactly.

---

## 4. Dangling-class audit — the false-negative check the handoff specifically demanded

A guard clean on a clean tree proves nothing about whether it would fire on a dirty one. Did not
trust the wired `10c-G3` mutation alone (it only proves the guard fires on the SAME file
(`alarm-banner.tsx`) the historical bug lived in) — introduced a **second, independent** dangling
class on a **different** panel to rule out any special-casing:

```bash
sed -i '' 's/styles\.headline/styles.zzzTotallyBogus/' components/panels/gpu-panel.tsx
npx vitest run lib/dangling-css-class.test.ts   # 1 failed | 32 passed — fired correctly
# reverted; git diff --stat empty
```

`:global()`, `composes`, and dynamic access are handled with real fixtures, not just mentioned in
prose — read each:

- `:global(...)` — `declaredClasses` blanks its contents before scanning (`lib/dangling-css-
  class.test.ts:130`), and a dedicated fixture test proves a name inside it is excluded
  (`'a name inside :global(...) is excluded'`). A second, project-wide test proves **no
  stylesheet in this repo uses `:global` today**, so the exclusion path is exercised only by
  the fixture, not by anything live — correctly recorded as "proven absent, not merely assumed"
  in the module doc, and confirmed true by grepping every `.module.css` for `:global(`.
- `composes: … from …` — a dedicated fixture (`'composes: … still declares the composing class
  itself'`) proves the composing class registers, and a SEPARATE fixture proves the quoted file
  path inside `from '...'` does not get misread as declaring `module`/`css` as class names (the
  false positive the build found while writing this very test, per its own module doc).
- Dynamic access (`styles[expr]`) — counted, not silently dropped (`dynamicAccessesOf`), with a
  fixture proving a computed access is reported (`dynamicAccessCount === 1`) and a project-wide
  test proving none exist today, same "proven absent" discipline as `:global`.

All three are genuinely exercised, not merely asserted in a comment — confirmed by reading each
fixture's actual assertion, not just its describe-block name (the ANCHOR §5 rule: "a test that
names a property it does not check has appeared in every single step").

---

## 5. L11 (unit-suffix guard) and step 2's re-anchored mutation (`02-R3`) — read against its
original property, no narrowing found

`02-R3`'s ORIGINAL property: "swap formatted at 1 dp like RAM" — i.e. it catches a precision
regression (`TWO_DP` silently becoming `ONE_DP` on `formatSwapGiB`). The re-anchoring only
changed the anchor's literal text from `' GiB'` to `UNIT_GIB` (both resolve to the identical
string `' GiB'` — `lib/format.ts`'s `UNIT_GIB` constant); the actual mutated behaviour
(`TWO_DP → ONE_DP`) is byte-for-byte unchanged. The OLD anchor was already a full-line, function-
specific match (not a bare `' GiB'` substring that could have matched several functions), so there
was no possible narrowing from the swap to begin with — re-verified by running it:

```
$ python3 pipeline/steps/02-format-severity/regressions.py
--- 02-R3 swap formatted at 1 dp like RAM
    exit=1  Tests  6 failed | 274 passed (280)  red=6
```

Identical shape (`6 failed | 274 passed (280)`) to `10c2-build.md`'s own reported run. The three
pre-existing broken anchors on the uptime formatter (`02-R20`/`02-R30`/`02-R31`) are still present
and still unrelated to this loop (confirmed: none of `02-R3`'s neighbours or the uptime formatter
were touched by any `10c-2` diff) — correctly left out of scope, exactly as `10c2-build.md` says.
The script's own overall exit code is 1 **because of those three pre-existing anchors**, not
because of anything this loop did; do not read that nonzero exit as a regression.

---

## 6. Guards are code — the "finds nothing" branch, per HANDOVER §0.5

Each of the four new guard files carries an anti-vacuity assertion (e.g. `'composite panels
actually exist to check — a guard over an empty list proves nothing'`) that is **not** individually
⚠-marked or mutation-wired — an explicit, disclosed trade-off in `10c2-build.md` §6 (marks were
demoted to keep exactly one ⚠ per file, given the loop's five-guard budget).

**Verified by hand that this disclosed gap is not also a silent defect** — i.e. that these
anti-vacuity checks actually work, rather than being tautologically true:

```bash
# tocontain-scope.test.ts: break the panel-shell import filter so it matches nothing
# (panel-shell -> panel-shellXX in the regex)
npx vitest run lib/tocontain-scope.test.ts
# -> 'composite panels actually exist to check' FAILED: expected 0 to be greater than 0
# -> and 'compositePanelSourceFiles finds PanelShell importers by walking' FAILED too
# -> the PRIMARY ⚠-marked test.each silently ran ZERO iterations (26 passed vs 28 normal)
#    while reporting no failure of its own — exactly the danger ANCHOR §4 warns about
# reverted; git diff clean

# cross-harness-ledger.test.ts: force orphans to always be empty
npx vitest run lib/cross-harness-ledger.test.ts
# -> 'the guard is not vacuous — at least one orphan test file exists today' FAILED as expected
# reverted; git diff clean
```

Both anti-vacuity checks caught their respective "guard silently stops looking at anything" break.
**Not wired to the mutation ledger, but proven live to be a real, functioning backstop** — the
disclosed trade-off in `10c2-build.md` §6 is accurate: these tests exist, they are not tautologies,
and they are the reason a broken file-walker would surface as a failing (if unmarked) test rather
than as a quietly-shrinking test count. Left unwired deliberately, matching the build's own stated
scope decision — adding four more mutations for a branch already proven to work by hand did not
seem to earn its cost against this loop's budget, and is recorded here as a residual, disclosed
gap rather than silently accepted.

---

## 7. `exactOptionalPropertyTypes` — two stale comments corrected

`10c2-build.md` §5 found the flag has been `true` since the first commit and flagged, but did not
fix, two source comments still describing it as off — `lib/collectors/errors.ts:32` and
`lib/collectors/serving.test.ts:843` — deferring them to "the parent to route," reasoning that
fixing prose outside this loop's own guard files was outside a guard-shaped mandate.

**Re-examined and fixed, because the claim in both comments is not merely stale — it materially
misdescribes the current safety story.** Both said the flag being "off" is *why* a careless
`{ ...base, instance: maybeUndefined }` spread would typecheck with the key present. With the flag
actually **on**, that specific spread does **not** typecheck (`tsc` reports `TS2375`, exactly as
`10c2-build.md`'s own scratch-file probe demonstrated) — so the risk these comments warn against is
already closed by the compiler in the ordinary case, and the runtime `Object.hasOwn` assertions
they sit beside are best understood as the backstop for a loosely-typed path (`any`, a cast, a
`JSON.parse` result) that `tsc` cannot see through, not as the only thing standing between the
project and a silently-wrong wire format. Corrected both comments in place (prose only, no
assertion or behaviour changed); `pnpm verify` re-run afterward, still 99/2745/exit 0. `HANDOVER.md`
§0.5 carries the same stale claim and is left untouched — it is the reconciliation phase's
document to rewrite, not this loop's, per this project's own convention (ANCHOR §8).

---

## 8. What was fixed, and why (summary)

| file | change | why |
|---|---|---|
| `lib/tocontain-scope.test.ts` | Corrected the "what it cannot catch" bullet: the bare-word shape (`'paused'`/`'refresh'`) is two of the four founding failures already realised, not a hypothetical third case; both directions of its exclusion (scope AND vocabulary) stated and cited | §1 above — the guard's own documentation was overclaiming coverage, the exact pattern this project flags repeatedly |
| `lib/collectors/errors.ts` | Corrected the `exactOptionalPropertyTypes`-is-off claim in the `⚠` doc comment on the error-tagging helper | §7 — the claim is false today and materially changes what the runtime assertion is actually defending against |
| `lib/collectors/serving.test.ts` | Same correction, in the inline comment beside the `Object.hasOwn` assertion at line ~843 | §7 |

No test assertions, guard logic, mutation anchors, or `SPEC.md` were touched. `purity.test.ts` was
not weakened. Nothing was committed.

---

## 9. Tree-integrity check — confirming `lib/collectors/errors.ts` and `lib/format.ts` are
intended edits, not a stranded mutation

Both are `M` in `git status` and `errors.ts` is a SOURCE file step 4's harness mutates
(`04-T26`), so a harness that died mid-mutation would leave exactly this signature. Checked both
diffs directly:

- **`lib/collectors/errors.ts`** — `git diff` shows only the `⚠` doc-comment block above `tag()`
  changed (§7's correction: `exactOptionalPropertyTypes` "is off" → "is on since the first
  commit," plus the reasoning for why the runtime `Object.hasOwn` check still matters). `04-T26`'s
  actual anchor line, `return typeof code === 'string' && code !== '' ? code : null;`, is
  untouched — confirmed present verbatim by `grep` before AND after the edit. No mutation
  transform (a `→` replacement pair from any `regressions.py`) matches this diff's shape; it is a
  hand-written prose correction, not a stranded harness artifact. Step 4's harness was re-run in
  full afterward (§10) and passed clean, which a stranded mutation could not have done.
- **`lib/format.ts`** — `git diff` is entirely the original 10c-2 BUILD's own L11 work (the nine
  exported `UNIT_*` constants and every formatter re-pointed at them) — this test phase made no
  edit to this file at all. Confirmed by diffing it against `10c2-build.md`'s own description of
  what it added: matches exactly, nothing extra.

Both confirmed intended; neither is a leftover mutation. `pnpm verify` after both edits: still
**99 files / 2745 tests / exit 0** (re-confirmed a third time, below).

---

## 10. Final verification

```
$ pnpm verify
 Test Files  99 passed (99)
      Tests  2745 passed (2745)
Type Errors  no errors
```

Harnesses re-run, in order, sequentially, foreground (never alongside `pnpm verify` or each other)
— every one whose `LEDGER_FILES` or mutation-target files this loop touched, plus step 10 (the
loop's own primary subject) and step 3 (touched by `10c-G1`):

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 220 distinct failing tests across 172 mutations; 200 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 172 regressions failed their check, as they must.
# re-run once more after correcting lib/tocontain-scope.test.ts's module doc — identical result

$ python3 pipeline/steps/03-collectors-gpu-host/regressions.py
Red-test ledger: 115 distinct failing tests across 73 mutations; 25 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 73 regressions failed their check, as they must.

$ python3 pipeline/steps/02-format-severity/regressions.py
--- 02-R3 swap formatted at 1 dp like RAM
    exit=1  Tests  6 failed | 274 passed (280)  red=6
# script's own overall exit 1 is the three PRE-EXISTING, unrelated broken uptime anchors
# (02-R20/02-R30/02-R31), confirmed unrelated to this loop — see §5

$ python3 pipeline/steps/04-collector-cooling/regressions.py     # touched: lib/collectors/errors.ts (comment)
Red-test ledger: 183 distinct failing tests across 92 mutations; 83 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 92 regressions failed their check, as they must.

$ python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py   # touched: lib/collectors/serving.test.ts (comment)
Red-test ledger: 190 distinct failing tests across 130 mutations; 100 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 130 regressions failed their check, as they must.
```

Steps 4 and 5 were re-run because this loop edited a comment inside `lib/collectors/errors.ts`
(a step-4 mutation target, `04-T26`) and `lib/collectors/serving.test.ts` (a step-5 `LEDGER_FILES`
entry) respectively, even though neither edit touched a line any mutation anchors against —
verified by `grep` before running, confirmed by the clean run after.

```
$ git status --short
 M components/panels/cpu-panel.test.tsx
 M components/panels/memory-panel.test.tsx
 M components/panels/safety-panel.test.tsx
 M components/panels/serving-panel.test.tsx
 M components/panels/session-event-log-panel.test.tsx
 M components/panels/storage-network-panel.test.tsx
 M lib/collectors/errors.ts
 M lib/collectors/serving.test.ts
 M lib/format.ts
 M pipeline/steps/02-format-severity/regressions.py
 M pipeline/steps/03-collectors-gpu-host/regressions.py
 M pipeline/steps/10-panels-assembly/regressions.py
?? lib/cross-harness-ledger.test.ts
?? lib/dangling-css-class.test.ts
?? lib/tocontain-scope.test.ts
?? lib/unit-suffix.test.ts
?? pipeline/handoffs/10c2-guards.md
?? pipeline/handoffs/10c2-test-phase.md
?? pipeline/steps/10-panels-assembly/10c2-build.md
```

No stranded mutation from any harness run, checked after every single one. Every `M`/`??` above is
either 10c-2's original work or this test phase's two disclosed fixes (§8). Not committed, per the
standing rule.
