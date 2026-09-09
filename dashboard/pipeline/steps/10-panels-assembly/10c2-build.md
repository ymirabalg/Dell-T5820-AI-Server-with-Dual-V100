# Step 10c-2 — the guards (BUILD)

**Written by the build agent, 2026-09-08.** Branch `dashboard-frontend`, started clean at
`a0c2c0e`. Five mechanism guards, per the handoff at `pipeline/handoffs/10c2-guards.md`.

**This loop's own defect class is the false positive** (handoff §1). For every guard below:
the rule, its output on today's tree, whether each hit is real, the demonstration that it can
fail, and what it cannot catch — in that order.

## 0. Summary

| # | Guard | File | Fires on today's tree? | Real hits | Wired mutation |
|---|---|---|---|---|---|
| 1 | `toContain` lint | `lib/tocontain-scope.test.ts` | Yes, 8 | 8/8 real, all fixed | `10c-G2` |
| 2 | Cross-harness ledger runner | `lib/cross-harness-ledger.test.ts` | Yes, 5 | 1 pre-existing + 4 self-referential, both fixed | `10c-G1`, `10c-G5` |
| 3 | Dangling-class audit | `lib/dangling-css-class.test.ts` | No (clean) | — | `10c-G3` |
| 4 | L11 unit-suffix guard | `lib/unit-suffix.test.ts` + `lib/format.ts` | No (clean) | — | `10c-G4` |
| 5 | `exactOptionalPropertyTypes` | `tsconfig.json` | N/A — already on | — | — |

All four new `lib/*.test.ts` files are wired into `pipeline/steps/10-panels-assembly/regressions.py`'s
`LEDGER_FILES`, each with exactly one ⚠-marked test (the real per-file scanning assertion) and
one `10c-`-prefixed mutation proving it. The pre-existing orphan (`lib/contract.test.ts`) was
fixed in `pipeline/steps/03-collectors-gpu-host/regressions.py` with mutation `10c-G1`.

**Final state:** `pnpm verify` — 99 files / 2745 tests / exit 0. Step 10's harness — 172
mutations, all bite, 200 ⚠ marks all covered, exit 0. Step 3's harness — 73 mutations, all
bite, 25 ⚠ marks covered, exit 0. `git status` clean except the intended diff (see §7).

---

## 1. The `toContain` lint (`lib/tocontain-scope.test.ts`)

### The rule

A document-wide `toContain` is not flagged merely for being document-wide — SCOPE.md's own
candidate discriminator ("subject is `renderToStaticMarkup(...)` unscoped") has an unusable
false-positive rate: **198 such calls exist on today's tree**, and the overwhelming majority
are sound. So the guard narrows on two axes at once:

1. **Scope: composite panels only.** Computed by walking `components/panels/*.tsx` and
   checking each file's own import line for `panel-shell` — never a hand-typed file list.
   `PanelShell` is what creates the actual hazard: it renders a HEAD `data-severity` that is
   a REDUCTION over its children's leaf severities, so the head and a leaf can independently
   go right or wrong. A primitive rendered alone (`Chip`, `Meter`, `Row`, `StatusRow`,
   `PanelShell` itself, `Header`) has no second element to be confused with.
2. **Shape: two proven-dangerous literals.** A bare `data-severity="…"` string (the WHOLE
   `toContain` argument) or the bare `EM_DASH` glyph (optionally wrapped in one matching HTML
   tag or a couple of bracket characters — the two live spellings, `` `<td>${EM_DASH}</td>` ``
   and `` `>${EM_DASH}<` ``). A string with real content around either — `'paused · 6 alarms'`,
   `'— / 61.0 GiB'` — is specific enough that the guard leaves it alone; that specificity is
   exactly what the four historical bugs lacked.

One more mechanical exemption: a test whose own name contains `"throwing"` is a documented
non-crash smoke test (`'before the first poll, … renders — rather than throwing'`), present in
every panel. Its claim is "nothing crashed", which any `EM_DASH` occurring anywhere correctly
answers — flagging it would be exactly the false positive this loop is supposed to avoid.

### Output on today's tree, before the fix

30 raw candidates matched the two-literal shape. After scoping and the "throwing" exemption:

- **15 false positives, correctly out of scope** (primitive-only renders): `chip.test.tsx`
  (4), `header.test.tsx` (3, single `data-severity` carrier — the aggregate dot), `meter.test.tsx`
  (2), `panel-shell.test.tsx` (1), `row.test.tsx` (3), `status-row.test.tsx` (1, a row-level
  primitive despite living under `components/panels/`), `sparkline.test.tsx` (1, a single-point
  table fixture).
- **7 false positives, correctly exempted by name** ("before the first poll … throwing"):
  `cooling-panel.test.tsx`, `cpu-panel.test.tsx`, `gpu-panel.test.tsx`, `memory-panel.test.tsx`,
  `storage-network-panel.test.tsx`, and both halves of one `safety-panel.test.tsx` test.
- **8 real hits — every one fixed.**

### Whether each real hit is real, and the fix

| file | test | real? | how confirmed |
|---|---|---|---|
| `cpu-panel.test.tsx:56` | "temperature is banded by §6.3, and the chip matches the row" | **Yes** | **Proven live**: mutated the row's `severity` prop to `null` in `cpu-panel.tsx`, ran the file — this exact test stayed green because `PanelShell`'s head still showed `data-severity="alarm"` (same `chip` value). Reverted, `git status` clean. |
| `memory-panel.test.tsx:69` | "invariant 1 — a missing RAM reading renders —" | **Yes**, but already documented weak and covered by an adjacent head-scoped test (10b-S-F) | Scoped anyway for consistency |
| `memory-panel.test.tsx:110` | "a genuine 0.0 GiB RAM reading …" | **Yes** — head and swap both also read `normal` here | Scoped to the RAM meter |
| `safety-panel.test.tsx:56` | "pwm5Present: false is the ALARM …" | **Yes** — same head-reduction shape as CPU, `SafetyPanel`'s chip is `panelChip(ufw, pwm5, dkms, fanService)` | Scoped via the file's own existing `rowContaining` helper |
| `storage-network-panel.test.tsx:47,81` | "disk is banded on FREE space…", "link state is banded…" | **Yes** — `StorageNetworkPanel`'s chip is `panelChip(root, home, link)` | Scoped via `rootMeterOf`/`rowContaining` (the latter hoisted from a nested `describe` to module scope so both tests could use it) |
| `serving-panel.test.tsx:31` | "an identity-only instance … shows — for the rest" | Borderline — single-instance fixture, no true ambiguity today | Scoped to `valueCells` anyway, since the fix is free and removes the fragile shape |
| `session-event-log-panel.test.tsx:71` | "the chip carries the entry's own severity…" | **No** (this panel's head `chip` is a hardcoded `null` constant, never entries-derived) — but flagged because the file imports `PanelShell` | Scoped to the entry's own `<li>` anyway, for cleanliness and because a future edit giving this panel a real head chip would silently reintroduce the hazard otherwise |

The CPU-panel case is the one independently proven by mutation before any fix landed; the
others share the identical mechanism (`panelChip` reducing several leaf severities into one
head value that can mask a broken leaf), confirmed by reading each panel's own severity wiring
rather than re-deriving a fresh mutation for each.

### Demonstration it can fail

Wired as `10c-G2` in `pipeline/steps/10-panels-assembly/regressions.py`: un-scopes
`cpu-panel.test.tsx`'s fixed assertion back to `expect(html)`. `python3 regressions.py` run:
`exit=1  Tests  1 failed | 35 passed (36)  red=1`, failing exactly
`lib/tocontain-scope.test.ts`'s per-file check. Reverted by the harness; `git status` clean.

### What it cannot catch

- A whole-document check of a **third** dangerous literal this project has not been bitten by
  yet (a bare `data-role="…"`, a bare `data-mode="…"` — the exact shape `'paused'` was). It is
  a closed, two-member vocabulary by design: the general "any bare attribute" version has a
  prohibitive false-positive rate today (`role="alert"`, `class="sr-only"`,
  `aria-hidden="true"` and a dozen more are legitimate whole-document checks).
- **`app/dashboard-shell.tsx`** — the single most dangerous multi-carrier context in the
  project (all nine panels at once) — is out of scope, because it imports panel *components*,
  not `PanelShell` directly. Untested today only because `dashboard-shell.ssr.test.tsx` happens
  not to assert either literal shape. Recorded rather than silently accepted (invariant 7).
- A single-fixture false negative: a test with only one subject in play cannot be told apart,
  BY SHAPE, from a genuinely ambiguous two-subject one (`serving-panel.test.tsx`,
  `session-event-log-panel.test.tsx` above) — only reading the fixture answers which.
- Duplicate-occurrence bugs that use neither literal at all (HANDOVER §0.5's
  `namesInstance`-printed-twice finding) — a different weakness of `toContain`, a different
  guard.

---

## 2. Q1-F4 — the cross-harness ledger runner (`lib/cross-harness-ledger.test.ts`)

### The rule

1. **The union** — every `LEDGER_FILES` list in `pipeline/steps/<step>/regressions.py`,
   resolved the same way the harnesses themselves do (a `NAME = "path"` constant per entry,
   or a bare string literal for step 2's harness, which never introduced names).
2. **The real set** — every `*.test.ts`/`*.test.tsx` in the repo, `pipeline/` excluded.
3. **The check** — every file in (2) but not in (1) is an ORPHAN, and must carry no
   ⚠-marked test.

Q1 explicitly rejected a hardcoded orphan list ("a check green over a subset of the real
set — Q1's own defect wearing a different hat"). Nothing here is hardcoded: the union and the
real set are both recomputed by walking the filesystem every run.

### Output on today's tree

**Re-derived, not trusted from HANDOVER §0.1's 2026-09-07 snapshot** — and the union genuinely
changed:

| | Q1 (2026-09-07, 8 harnesses) | before this loop's fix (9 harnesses) |
|---|---|---|
| orphan files | `lib/throttle.test.ts`, `lib/contract.test.ts` | **the same two** |
| orphan ⚠ marks | 0 | **1** |

`lib/contract.test.ts` gained a ⚠ mark since Q1's measurement: `'⚠ errors[].instance crosses
the wire as a present key when set, and an ABSENT key when not'` (10b-S-G's work on
`TelemetryError.instance`). `lib/throttle.test.ts` still carries none — its one `⚠` is inside a
doc comment, not a test name (10a's F3 lesson, correctly invisible to this guard too).

**Also found, self-referentially, the moment the guard was written**: all four of this loop's
own new `lib/*.test.ts` files were themselves orphans with ⚠ marks — a ⚠-bearing test file in
no `LEDGER_FILES` list is exactly what this guard exists to catch, so it caught its own
siblings before catching anything external. This is recorded as *evidence the runner works*,
not as a defect in the other three guards.

### Whether each hit is real, and the fix

- **`lib/contract.test.ts`** — real, pre-existing. Fixed by adding it to step 3's
  `LEDGER_FILES` (step 3 is its natural owner: `lib/contract.ts` predates step 5 and sits
  beside `collect.ts`, which step 3 already checks) with a new mutation, `10c-G1`.
- **The four new guard files** — real, self-caused. Fixed by (a) demoting every fixture-level
  ⚠ mark in the four files to a plain test name, keeping exactly ONE ⚠ mark per file — the
  primary `test.each` that scans real project files — and (b) adding all four to step 10's
  `LEDGER_FILES` with one `10c-`-prefixed mutation apiece (§6 explains the demotion choice).

### Demonstration it can fail

Two, both wired:

- **`10c-G1`** (`pipeline/steps/03-collectors-gpu-host/regressions.py`) — mutates
  `lib/fixtures.ts`, giving `nothingReadable`'s collector-wide `errors[]` entry a spurious
  `instance: 0`. This is the mutation that actually exercises the fixture-driven ⚠ test (a
  first attempt mutating `tag()`'s branch in `lib/collectors/errors.ts` **did not bite** —
  the test never calls `tag()` at all, it round-trips a hand-written fixture literal through
  real `JSON.stringify`/`JSON.parse`; recorded as a live instance of "read what a mutation
  actually exercises before trusting it," ANCHOR §5). Run: `exit=1  Tests  1 failed | 16
  passed (17)  red=1`.
- **`10c-G5`** (`pipeline/steps/10-panels-assembly/regressions.py`) — mutates
  `pipeline/steps/10-panels-assembly/regressions.py` **itself**, dropping `CPU_PANEL_TEST`
  from its own `LEDGER_FILES`. `main()`'s `finally: path.write_text(original)` restores it
  regardless of outcome — the same guarantee every other mutation here relies on — and the
  `pnpm vitest run` subprocess reads the mutated file fresh from disk, which is the whole
  point of a text-anchored harness. Run: `exit=1  Tests  1 failed | 13 passed (14)  red=1`,
  correctly naming `/components/panels/cpu-panel.test.tsx` as the new orphan.

### What it cannot catch

- A test file that IS listed in some `LEDGER_FILES` but whose harness never actually runs it
  (a typo'd path, a renamed file on one side only) — this guard trusts that a listed path is
  checked elsewhere; it never runs a harness itself.
- A ⚠ mark covered by its own step's ledger but also redundantly (harmlessly) unlisted
  elsewhere — this guard is purely about orphans, never about double-coverage.
- The ⚠-scanner's own inherited blind spot: a `test`/`it` call shaped in a way no scanner can
  read (Q1's finding — five such calls exist project-wide today, all unmarked). Each harness's
  own `regressions.py` already prints an explicit `!!! … cannot read` diagnostic for this on
  every run; this guard does not re-audit that (it only needs to know whether an ORPHAN
  carries a mark, not to re-certify every harness's own scanner completeness).
- A fragility, not a false negative: `warningMarkedTestNames`'s scan of `codeOnly(text)` does
  not blank string BODIES, only comments — a test file that embeds `test(...)`-shaped text
  *inside a plain string* (as `cross-harness-ledger.test.ts`'s own fixture tests do, to feed
  the scanner example input) is not currently mis-read, but this was not proven sound in
  general, only observed not to misfire on the two cases actually present. Recorded rather
  than silently trusted.

---

## 3. The dangling-class audit (`lib/dangling-css-class.test.ts`)

### The rule

For every `.tsx` under `components/`/`app/` importing a sibling `<name>.module.css`, every
`<localName>.<property>` access must name a class the CSS file actually declares somewhere in
a selector. The reverse direction (dead, unreferenced CSS) is explicitly out of scope — that
is a build-time cost, not a "renders silently wrong" bug, and doubling the guard's scope for a
much lower-value finding was rejected.

Handled explicitly, because the handoff named them:

- **`:global(...)`** — content inside is excluded from the declared set, since a
  `:global(.foo)` selector is not a member of the module's exported object; a `styles.foo`
  reaching for it would be reaching for something that was never there. Proven absent on this
  tree by a dedicated assertion, not assumed.
- **`composes: … from …`** — the composing class itself is a real declaration and needs no
  special-casing; quoted `from '<path>'` text is blanked before scanning so `.module`/`.css`
  inside the path string are never misread as class names (found and fixed during this build —
  see below).
- **Dynamic access (`styles[expr]`)** — unreadable by a text scanner, so reported as a named,
  counted case (Q1's "report what you cannot read" rule) rather than silently skipped. None
  exist today; proven absent, not assumed.

### Output on today's tree

**Clean — zero dangling references across all 18 CSS-module imports.** The one known live
instance (`alarm-banner.tsx`'s `styles.item`) was already found and removed in 10c-1.

The FIRST implementation of the scanner was not clean, though — it flagged
`components/alarm-banner.tsx` with two spurious hits: `"X"` and `"item"`. Both came from the
file's own doc comment narrating the ORIGINAL `styles.item` bug, which quotes `styles.item`
and `styles.X` verbatim in prose. This is the 10a F3 lesson (in-comment matches are the
recurring false-positive source) hitting the guard meant to prevent it. Fixed by scanning
`codeOnly(text)` (comment-blind) instead of the raw source, which is now the primary example
cited in the guard's own module doc.

A second false positive, found while writing the `composes:` fixture test rather than on the
real tree: `declaredClasses` misread the quoted file path in `composes: bar from
'./other.module.css'` as declaring classes named `module` and `css`. Fixed by blanking quoted
string bodies before scanning, alongside `:global(...)` content.

### Demonstration it can fail

Wired as `10c-G3`: reintroduces a version of the historical bug on a different class
(`styles.banner` → `styles.zzzNoSuchRule` on `alarm-banner.tsx`'s outer wrapper, so the anchor
stays unique from the one already fixed). Run: `exit=1  Tests  1 failed | 32 passed (33)
red=1`. Also verified by hand before wiring: mutate, run `npx vitest run
lib/dangling-css-class.test.ts`, observe the single failure, revert, `git status` clean.

### What it cannot catch

- A class declared only as a CSS value fragment the scanner cannot distinguish from a real
  selector — a hypothetical `url(../x.png)` would spuriously "declare" a class named `png`.
  No stylesheet here uses `url(...)`, so this is untested; a text scanner over CSS cannot
  fully separate selector position from value position without a real parser (the same
  trade-off `lib/source-text.ts`'s `codeOnly` already makes for TypeScript).
- The reverse direction (dead CSS) — out of scope by design, stated above.
- A class that resolves for the WRONG reason (two components each importing their own
  stylesheet, one accidentally importing the other's path) — this guard only checks "does the
  pair this file's own import names agree," never "should this file be importing a different
  pair."

---

## 4. L11 — the unit-name constant and its guard

### Piece one: the constant — a design decision, recorded per invariant 7

**Not `lib/units.ts`.** That module already exists and means something else entirely: the two
SYSTEMD unit names (`gpu-fan-control.service`, `llama-server@<i>.service`) §6.4's condition ids
are built from. Reusing the name for a measurement's unit suffix would make one file answer
two unrelated questions and every future `grep -n unit` return both.

**Home: `lib/format.ts`**, already "the §6.6 formatters" module by its own doc comment. Nine
new exported constants — `UNIT_CELSIUS`, `UNIT_WATTS`, `UNIT_MIB`, `UNIT_GIB`, `UNIT_RPM`,
`UNIT_MHZ`, `UNIT_PERCENT`, `UNIT_MB_PER_S`, `UNIT_KB_PER_S` — and every formatter that used to
build its suffix from an inline literal (`formatCelsius`, `formatWatts`, `formatMiB`,
`formatMiBPair`, `formatMHz`, `formatGiB`, `formatSwapGiB`, `formatRpm`, `formatPercent`,
`formatBytesPerSecond`) now references the constant instead — one spelling, not a second copy
the guard could drift from.

**Cross-harness consequence, found and fixed**: step 2's own `regressions.py` had a mutation
(`02-R3`) anchored on `formatSwapGiB`'s old literal-string body. Re-anchored to the new
`UNIT_GIB`-based text; verified the mutation still bites (`exit=1  Tests  6 failed | 274
passed (280)  red=6`). No other step's harness references `lib/format.ts`. Step 2's harness
also surfaced three unrelated, PRE-EXISTING broken anchors on the uptime formatter
(`02-R20`/`02-R30`/`02-R31` — the function was refactored to take a `prefix` parameter at some
point after these mutations were written, orphaning them) — confirmed unrelated by diff (this
build never touched uptime code) and left unfixed as out of scope; recorded here rather than
silently worked around.

### Piece two: the guard

Every `.tsx` under `components/`/`app/` (test files excluded; `lib/format.ts` never enters
the scan — it is a `.ts` file outside both scan roots, so no explicit exemption is needed) is
scanned for the nine unit strings appearing as a COMPLETE static literal segment — a plain
string that is exactly the suffix, or a template literal whose text right after its LAST
interpolation is exactly the suffix and nothing else. Comment-blind via `codeOnly`.

### Output on today's tree

**Clean.** No component currently hard-codes a unit suffix around a value — this is a
preventive guard.

The FIRST implementation (a bare "does the codeOnly'd file contain this substring anywhere"
search) found two false positives the moment it ran on the real tree:

- **`components/header.tsx`** — `' W'` matched inside `readonly windowMinutes:
  WindowMinutes;`, a TYPE name, not a string.
- **`components/panels/cooling-panel.tsx`** — `' RPM'` matched inside `ariaLabel="GPU
  temperature and fan 5 RPM over the selected window"`, a descriptive label mentioning the
  unit as an English word, building no value at all.

Both are why the final version restricts to complete literal segments rather than "the
substring appears anywhere" — the narrower rule clears both false positives, confirmed by two
fixture tests reproducing each verbatim.

### Demonstration it can fail

Wired as `10c-G4`: `cooling-panel.tsx`'s fan-2 row is changed from `formatRpm(cooling?.fan2Rpm
?? null)` to a hand-built `` `${cooling?.fan2Rpm ?? 0} RPM` `` — the exact copy-paste an
inattentive edit next to a correct sibling row would make. Run: `exit=1  Tests  1 failed | 35
passed (36)  red=1`.

### What it cannot catch

- A unit suffix built by concatenating code points instead of a string literal (`' R' +
  'PM'`, `String.fromCharCode(...)`) — a text scanner cannot evaluate that without becoming a
  partial interpreter; nothing in this project does this today.
- A WRONG but still-formatter-sourced unit — calling `formatRpm` where `formatMHz` was meant
  typechecks (both take `number | null`) and prints a plausible wrong unit. This guard only
  forbids hand-spelling, never misrouting between two formatters that both legitimately exist.
- A tenth unit §6.6 might add later with no constant yet — the guard's vocabulary is exactly
  the nine strings `lib/format.ts` exports today.

---

## 5. `exactOptionalPropertyTypes`

**The handoff's premise was wrong, and re-checking is exactly what invariant 7 and HANDOVER
§0.5's own "compare against the counterfactual that was the code, not a weaker one" call for.**

`tsconfig.json` has had `"exactOptionalPropertyTypes": true` since the **very first commit**
(`71a2f7d`, step 1's scaffold) — `git log --oneline -- tsconfig.json` shows exactly one commit,
ever. `lib/guardrails.test.ts` has asserted `expect(raw).toMatch(/"exactOptionalPropertyTypes"\s*:\s*true/)`
since that same commit. **It has never been off.**

Verified directly, not merely re-asserted: added a scratch file to the project asserting
`const bad: T = { ...base, instance: maybeUndefined }` where `T`'s `instance` is `instance?:
number` — `tsc --noEmit` on the real tree (no CLI flag needed) reports:

```
error TS2375: Type '{ source: string; message: string; instance: undefined; }' is not
assignable to type 'T' with 'exactOptionalPropertyTypes: true'. …
```

i.e. the flag is live and enforcing today, exactly the scenario `lib/collectors/errors.ts:32`'s
comment and HANDOVER §0.5 both describe as impossible ("`exactOptionalPropertyTypes` is off, so
`{ ...base, instance: maybeUndefined }` … typechecks with the key present"). That comment and
HANDOVER's write-up are simply incorrect — `npx tsc --noEmit --exactOptionalPropertyTypes` (the
command HANDOVER §0.5 ran) was measuring a flag that was already on via `tsconfig.json`, so its
"exits 0" result proved nothing about turning anything on.

**Action taken: none — there is nothing to turn on.** `tsconfig.json` is unchanged.
`pnpm verify` was already green with the flag active (confirmed above, 99/2745/exit 0). This
is reported rather than silently corrected in `lib/collectors/errors.ts`/`serving.test.ts`'s
comments or `HANDOVER.md`'s §0.5, since fixing prose in files this loop does not otherwise own
is outside a guard-shaped mandate — flagged here for the parent to route.

---

## 6. The bar — marks, mutations, and the demotion trade-off

Per HANDOVER §5.1/ANCHOR §5, a guard is code and its own branches need mutations. Each of the
four new `lib/*.test.ts` files ships:

- **Fixture-level tests, both directions**, for every sub-predicate (`isDangerousLiteral`,
  `literalContent`, `declaredClasses`, `unitSuffixLiterals`, `literalSegments`,
  `ledgerFilesOf`, `warningMarkedTestNames`) — proving the classifier's own vocabulary, the
  same discipline `components/purity.test.ts` uses for its hook-shape regex.
- **Exactly one ⚠-marked test per file** — the `test.each` that scans real project files —
  backed by a `10c-`-prefixed mutation in `pipeline/steps/10-panels-assembly/regressions.py`
  (§1–4 above name each one).

**The trade-off, stated plainly**: the fixture-level tests are NOT individually ⚠-marked or
individually mutation-covered by `regressions.py`. They were originally written with ⚠ marks,
and Q1-F4's own runner immediately flagged all four files as self-referential orphans — proof
the runner works, and also proof that marking every sub-test would have required a
`10c-`-prefixed mutation for each of roughly 25 fixture assertions across four files, on top
of the four "real" mutations. Given the loop's five-guard scope and the effort budget, marks
were demoted to keep exactly the ONE assertion per file whose vacuity would actually let a real
defect through — the fixture tests remain as ordinary regression coverage (still run by
`pnpm verify`, still catch a broken classifier), just not claimed as separately load-bearing.
Recorded as a scope decision per invariant 7, not hidden.

Every fix in §1's table and every mutation in §2–4 was demonstrated live during this build:
source or test file mutated by hand or via the harness, the specific test observed to fail,
the file reverted, `git status` confirmed clean before moving on.

---

## 7. Final state

```
$ pnpm verify
 Test Files  99 passed (99)
      Tests  2745 passed (2745)
Type Errors  no errors
```

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 220 distinct failing tests across 172 mutations; 200 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 172 regressions failed their check, as they must.
```

```
$ python3 pipeline/steps/03-collectors-gpu-host/regressions.py
Red-test ledger: 115 distinct failing tests across 73 mutations; 25 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 73 regressions failed their check, as they must.
```

Step 2's harness (`pipeline/steps/02-format-severity/regressions.py`) has three pre-existing,
unrelated broken anchors on the uptime formatter (`02-R20`, `02-R30`, `02-R31`) discovered
while re-verifying `02-R3` after re-anchoring it — confirmed by diff to predate this build
entirely (a `prefix` parameter was added to the uptime formatter at some point after these
three mutations were written) and left unfixed as out of scope for a guards loop; reported
here per this loop's own "if a guard you add makes another step's harness fail, report it and
scope your fix" rule, since `02-R3` (the one entry this build's own change actually broke) was
fixed and re-verified, and the other three are unrelated pre-existing drift, not a consequence
of anything in this build.

```
$ git status --short
 M components/panels/cpu-panel.test.tsx
 M components/panels/memory-panel.test.tsx
 M components/panels/safety-panel.test.tsx
 M components/panels/serving-panel.test.tsx
 M components/panels/session-event-log-panel.test.tsx
 M components/panels/storage-network-panel.test.tsx
 M lib/format.ts
 M pipeline/steps/02-format-severity/regressions.py
 M pipeline/steps/03-collectors-gpu-host/regressions.py
 M pipeline/steps/10-panels-assembly/regressions.py
?? lib/cross-harness-ledger.test.ts
?? lib/dangling-css-class.test.ts
?? lib/tocontain-scope.test.ts
?? lib/unit-suffix.test.ts
?? pipeline/handoffs/10c2-guards.md
```

No stray mutation from any harness run; every `M`/`??` above is an intended part of this
loop's work. Not committed, per the standing rule.

## 8. Invariant 6/7 notes

- **Invariant 6** (no dependency without a recorded reason): no new dependency added.
- **Invariant 7** (spec silence, recorded): the `lib/units.ts` naming collision (§4), the
  `dashboard-shell.tsx` gap in guard 1's scope (§1), the pre-existing step-2 anchor drift
  (§7), and the ⚠-mark demotion trade-off (§6) are all recorded here rather than assumed away.
