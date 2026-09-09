# Step 10c-2 — the guards (ADVERSARIAL)

**Written by the adversarial agent, 2026-09-08.** Branch `dashboard-frontend`, working dir
`dashboard/`. Read `pipeline/handoffs/10c2-adversarial.md`, `10c2-build.md`, `10c2-test.md`,
`SCOPE.md`, `HANDOVER.md` §0.3/§0.5/§0.6, `ANCHOR.md` §4/§5/§8, `PLAN.md`, and all four
`lib/*.test.ts` guard files plus `lib/source-text.ts` and step 10's `regressions.py` before
attacking anything.

**Nothing was fixed.** Every experiment was reverted; `git status --short` at the end is
byte-identical to the handoff's own listing, and `pnpm verify` re-run afterwards is
**99 files / 2745 tests / exit 0**.

Settled items from the handoff (`pnpm verify` green, the lint closing 2 of 4 with the doc now
saying so, all 8 lint hits real, the ledger union genuinely re-derived, `02-R3` re-anchored,
`exactOptionalPropertyTypes` already on) were **not** re-opened.

---

## 0. Summary

| # | Finding | Guard | Live today? | Evidence |
|---|---|---|---|---|
| F1 | `toContain(EM_DASH)` — the project's own live idiom — bypasses the lint **silently and unreported** | 1 | latent, idiom live | EXECUTED |
| F2 | The ledger guard's "not vacuous" test **goes red when the project reaches zero orphans** | 2 | one file from firing | EXECUTED |
| F3 | The L11 guard cannot see **JSX text**, the most natural way to hard-code a unit | 4 | latent | EXECUTED |
| F4 | The L11 suffix list is **hand-typed membership**; a tenth `UNIT_*` escapes, and the doc says otherwise | 4 | latent | EXECUTED |
| F5 | Both file-walking guards scan `.tsx` **only**, and this project keeps display logic in `.ts` under `components/` | 3, 4 | latent, 19 files | EXECUTED |
| F6 | A **double-quoted** CSS-module import removes a file from the audit entirely, and the vacuity net cannot see the loss | 3 | latent | EXECUTED |
| F7 | **The §3.1 constructive answer** — the bare-word half IS mechanisable, at runtime, not in a source lint | 1 | measured | EXECUTED |
| F8 | No anti-vacuity check is mutation-guarded, and the four differ in strength by an order of magnitude | all | true today | REASONED |
| F9 | `ledgerFilesOf` silently **drops entries** on a `#` comment inside `LEDGER_FILES` or a trailing comment on a path constant | 2 | latent | EXECUTED |
| F10 | Smaller lint bypasses: `let`-bound render, alias, helper-bound render, and the blanket `"throwing"` exemption | 1 | latent | EXECUTED |
| F11 | "Exactly ONE ⚠ mark per file" is inaccurate — each guard file carries 3–5, on `describe` blocks no harness can see | all | true today | EXECUTED |

---

## F1 — `expect(html).toContain(EM_DASH)` bypasses the lint silently, and the guard does not even report that it could not read it — EXECUTED

**The mechanism.** `literalContent(arg)` returns `null` for anything that is not a quoted string
or a template whose sole interpolation is the identifier `EM_DASH`. A **bare `EM_DASH`
identifier** is neither:

```
literalContent('EM_DASH')                      -> null
dangerousWholeDocumentChecks(<a test whose body is
  `const html = renderToStaticMarkup(<X />); expect(html).toContain(EM_DASH);`>)  -> []
```

Both measured by calling the exported functions directly from a scratch test file (deleted).

**Why this is not hypothetical.** The idiom is already live in this repo:

```
components/sparkline.test.tsx:217:    expect(nullTooltip).toContain(EM_DASH);
```

`sparkline.test.tsx` is out of scope (a primitive, `components/`, not `components/panels/`) so
the guard is right to be quiet there — but it is the spelling a next author copies. The guard's
own module doc enumerates "the two live spellings", `` `<td>${EM_DASH}</td>` `` and
`` `>${EM_DASH}<` ``, and does not mention the bare-identifier form at all.

**The same hole one step out**: a hoisted constant.

```
const ALARM = 'data-severity="alarm"';
test('a real band', () => { const html = …; expect(html).toContain(ALARM); });   -> []
```

**Concrete failure scenario.** 10c-2 scoped eight assertions to their rows. A later loop adds an
invariant-1 test to `cooling-panel.test.tsx` and writes `expect(html).toContain(EM_DASH)`,
copying `sparkline.test.tsx`'s style. `lib/tocontain-scope.test.ts` reports clean, `pnpm verify`
is green, and the assertion is satisfied by `Chip`'s own no-band glyph — HANDOVER §0.4's
`fan 5  0 RPM`, *"the single worst bug this project can ship"*, reopened by the very shape the
guard was built to close.

**⚠ The sharper half is the silence, not the miss.** `literalContent` returning `null` is a
deliberate, correct design ("a call it cannot read is a call it does not flag rather than one it
flags wrongly"). But the *sibling guard in the same loop* handles the identical situation the
opposite way: `lib/dangling-css-class.test.ts` counts `styles[expr]` it cannot read and asserts
the count is zero, citing Q1's rule — *"a scanner must REPORT what it cannot read rather than
silently pass it"*. The `toContain` lint applies the opposite policy to the same class of input,
in the same loop, without saying so. Today's tree would pass an "unreadable arguments == 0"
assertion for `components/panels/*.test.tsx` (there are none), so the strict version is free
right now — which is precisely when it is cheapest to adopt.

**Not fixed.** Direction for the reconcile phase, if accepted: resolve module-scope
`const X = '<literal>'` bindings, and add a counted "arguments this guard could not read"
diagnostic to `dangerousWholeDocumentChecks` mirroring `dynamicAccessCount`.

---

## F2 — the cross-harness guard's own anti-vacuity test goes RED when the project reaches zero orphans — EXECUTED

`lib/cross-harness-ledger.test.ts` ends with:

```ts
test('the guard is not vacuous — at least one orphan test file exists today to exercise it', () => {
  expect(orphans.length).toBeGreaterThan(0);
});
```

**Re-derived today:** the union is 96 entries across 9 harnesses, `allTestFiles()` is 99, and
there is exactly **one** genuine orphan left — `lib/throttle.test.ts`. `lib/contract.test.ts`
was adopted by this very loop. No ledger entry names a file that is missing from disk.

**Demonstrated.** Added a throwaway tenth harness
`pipeline/steps/99-zz-probe/regressions.py` containing only
`THROTTLE_TEST = "lib/throttle.test.ts"` / `LEDGER_FILES = [THROTTLE_TEST]`, then ran the guard:

```
× the guard is not vacuous — at least one orphan test file exists today to exercise it
  AssertionError: expected 0 to be greater than 0
  Tests  1 failed | 11 passed (12)
```

Directory removed; `git status` clean.

**Concrete failure scenario.** 10c-3 (or any later loop) does the obviously correct thing and
adopts `lib/throttle.test.ts` into some step's `LEDGER_FILES` — the exact outcome this guard
exists to drive toward. `pnpm verify` goes red across the whole suite, with a message that reads
as though the guard itself broke. The next person's cheapest reading is "the guard is wrong,
delete the line" — and deleting it removes the only vacuity net this file has.

**⚠ And it is not a vacuity check in the first place.** The vacuity risk here is
`allTestFiles()` silently narrowing (a new `SKIP_DIRS` entry, a changed extension test, a walk
that throws on one subtree) so that the `test.each` iterates over a shrunken population.
`orphans.length > 0` does not detect that at all: a narrowed walk that still finds one orphan
passes. The population is checked only by `allTestFiles().length > 0` — **99 today, and 1 would
pass**. The check that is present asserts *the project has not finished*; the check that is
needed asserts *the guard looked at everything*.

Note this exact failure was seen by the test phase (§3, while adding its fake tenth harness) and
recorded as the guard "correctly failing". It is the same event; the disagreement is about
whether going red on the success state is correct behaviour.

---

## F3 — the L11 unit guard cannot see JSX text, which is the most natural way to hard-code a unit — EXECUTED

`literalSegments` scans for `'`, `"` and `` ` ``. **JSX children are none of those.** Measured:

| source | `unitSuffixLiterals` |
|---|---|
| `<span>{v} RPM</span>` | `[]` |
| `<td>{cooling.fan2Rpm} RPM</td>` | `[]` |
| `` `${n} RPM` `` (the wired mutation's shape) | `[' RPM']` |
| `` `${n} RPM (fan 5)` `` | `[]` |
| `` `${n} RPM.` `` | `[]` |
| `` `${pct}%` `` | `[]` |
| `` `${pct} %` `` | `[' %']` |
| `n + ' ' + 'RPM'` | `[]` (disclosed) |

Three distinct escapes, none disclosed in the guard's "what it cannot catch":

1. **JSX text.** Every panel today routes readings through `value={formatRpm(...)}` props, so
   this is latent — but a table-shaped panel rendering `<td>{x} RPM</td>` is an ordinary edit,
   and the guard's wired mutation `10c-G4` uses the template form, so **the ledger never
   exercises the JSX path at all**.
2. **Anything after the suffix.** The implementation requires a whole segment to *equal* the
   suffix (`segments.has(unit)`), so any trailing punctuation or word defeats it. The module doc
   describes a weaker rule ("the text right after its LAST interpolation is exactly the suffix"),
   which is also not what the code does — the code accepts *any* segment, not only the last.
3. **`%` with no space.** `UNIT_PERCENT` is `' %'`. `` `${pct}%` `` — the commonest spelling of a
   percentage anywhere — is invisible.

**Concrete failure scenario.** A tenth panel prints utilisation inline as
`<span className={styles.value}>{cpu.utilPct}%</span>`, skipping `formatPercent` and therefore
skipping its rounding and its null handling. `pnpm verify` green, L11 guard green, and a null
reading prints `NaN%` or `0%` beside a correctly formatted sibling — the null-vs-zero confusion
invariant 1 exists to prevent.

---

## F4 — the L11 suffix vocabulary is a hand-typed *membership* list, and the doc claims it is not — EXECUTED

`lib/unit-suffix.test.ts` imports nine constants by name and re-lists them in a
hand-written array:

```ts
const UNIT_SUFFIXES: readonly string[] = [UNIT_CELSIUS, UNIT_WATTS, /* …7 more, typed out… */];
```

with the comment *"imported from the same module the formatters build from — never a second,
hand-typed copy that could drift out of step with theirs."* **The values cannot drift; the
membership can.** This is precisely the blocklist-versus-allowlist problem the handoff §3.4
asked about, and `purity.test.ts` already solved once by matching a shape rather than a list.

**The shape-derived alternative works and is one line** — measured:

```
Object.keys(format).filter((k) => k.startsWith('UNIT_'))
  -> ["UNIT_CELSIUS","UNIT_WATTS","UNIT_MIB","UNIT_GIB","UNIT_RPM","UNIT_MHZ",
      "UNIT_PERCENT","UNIT_MB_PER_S","UNIT_KB_PER_S"]
```

Exactly the nine, derived from `lib/format.ts`'s exports rather than restated.

**Concrete failure scenario.** §6.6 grows a tenth reading — a `UNIT_KELVIN`, a `UNIT_GB_PER_S`,
a `UNIT_VOLTS` for a PSU sensor. The author adds the constant to `lib/format.ts` and a
`formatKelvin` beside its siblings, sees the L11 guard green, and reasonably concludes the guard
covers it. It does not, and nothing will ever say so. The guard's own doc lists this as a
"cannot catch" (*"a tenth unit §6.6 might add later"*) while simultaneously claiming the
vocabulary is drift-proof — the two statements are about different things and the reader is
likelier to remember the second.

---

## F5 — both file-walking guards scan `.tsx` only, and this project puts display logic in `.ts` files under `components/` — EXECUTED

`componentSourceFiles()` in **both** `lib/unit-suffix.test.ts` and
`lib/dangling-css-class.test.ts` filters `entry.name.endsWith('.tsx')`. Under the two scan roots
there are **25 non-test `.tsx` files and 19 `.ts` files**, including:

- `components/panels/condition-lookup.ts` — its own ⚠ doc comment reads *"`DisplayedCondition.value`
  is already formatted (`'4,308 RPM'`, `'active'`)"*, i.e. it is the module that handles
  unit-bearing display strings.
- `components/panels/panel-chart.ts` — imports `formatTimeOfDay` from `lib/format` and produces
  tick/time label text for `StackedTimeSeriesChart`. A y-axis suffix (`` `${v} °C` ``) belongs
  here by construction.
- `components/panels/event-sentence.ts`, `components/panels/panel-chip.ts`,
  `components/palette.ts`, `app/use-now-tick.ts`.

Neither guard's doc mentions the exclusion. Worse, the L11 guard's doc *reasons about the
extension* and draws the wrong conclusion from it:

> "`lib/format.ts` … never enters this scan: it is a `.ts` file, **and** it is not under either
> scan root. No explicit exemption is needed."

The `and` is doing no work — the `.ts` half alone already excludes every `.ts` file that *is*
under a scan root, which is the case the sentence was written to reassure a reader about.

**Concrete failure scenario.** A future `formatAxisTick` lands in
`components/panels/panel-chart.ts` — the natural home, next to `formatTimeOfDayMs` — and
hand-writes `` `${v} °C` `` because it needs the °C without the thousands separator. L11 green.
Same for a `staleValueOr` sibling in `condition-lookup.ts` that appends a unit to a bare number.

The dangling-CSS guard shares the filter; the exposure there is smaller (a `.ts` file importing
a CSS module is unusual) but the same one-word fix covers both.

---

## F6 — a double-quoted CSS-module import removes a whole file from the dangling-class audit, and the vacuity net cannot see the loss — EXECUTED

`cssModuleImports` matches `import\s+(\w+)\s+from\s+'(\.[^']+\.module\.css)'` — **single quotes
only**. Measured on a throwaway fixture pair in a temp dir:

| import form | `auditFile(...)` |
|---|---|
| `import styles from './w.module.css';` + `styles.nope` | `[{ dangling: ['nope'], … }]` |
| `import styles from "./w.module.css";` + `styles.nope` | `[]` — **no audit entry, no error** |
| `import * as styles from './w.module.css';` + `styles.nope` | `[]` |

Silent omission, not a failure. And the guard's only population check is
`expect(audits.length).toBeGreaterThan(0)`.

**Measured coverage today: 18 audits over 18 `.tsx` files whose text mentions `.module.css` —
complete.** So a proportional assertion is free right now:
`audits.length === <files mentioning .module.css>` would hold at 18 = 18 and would have caught
any of the above.

**Concrete failure scenario.** Someone runs a formatter with different quote settings over one
file, or hand-writes a new panel's import with double quotes because that is what their editor
inserted. That component drops out of the audit. `pnpm verify` green (`18 → 17 > 0`), the
`test.each` simply iterates one fewer time, and the guard is silently narrower. A `styles.item`
typo in that file is invisible again — which is exactly the 10c-1 bug this guard was built for,
in a file the guard reports nothing about.

---

## F7 — ⚠ THE §3.1 ANSWER: the bare-word half IS mechanisable — as a runtime occurrence count, not a source lint — EXECUTED, with measured false-positive cost

The handoff asked for the constructive half: is there a rule that catches `toContain('paused')`
without unacceptable false positives? **Yes, and it catches all four founding failures, not two —
but it lives at a different layer than the guard 10c-2 built.**

### The rule

> A `toContain(X)` whose subject is a string is **ambiguous** if `X` occurs **more than once** in
> that subject. One occurrence means the assertion can only be satisfied one way; two or more
> means it cannot distinguish which source satisfied it.

This is the handoff's own first candidate — *"an assertion whose literal appears in the rendered
output from more than one source"* — and, critically, it is **decidable at run time from the
subject alone**, with no fixture analysis and no partial evaluation. It needs no source parsing,
so none of F1/F10's static bypasses (`EM_DASH` identifier, hoisted constant, helper-bound render,
`let`) apply to it.

### Measurement — how it would have done on the four founding failures

Instrumented by overriding `toContain` in a throwaway vitest setup file (a scratch config, both
deleted afterwards) and logging, for every call, the needle's occurrence count in the subject.
Run over `components/`: **27 files, 468 tests, 454 `toContain` calls with a string subject.**

On `components/header.test.tsx`, where founding failures #1 and #2 lived:

| needle | occurrences in the header render | verdict |
|---|---|---|
| `'paused'` | **2** whenever the dashboard is paused (`data-mode="paused"` **+** the visible label) | flagged |
| `'refresh'` | **3**, in *every* header render, including ones where refresh is not under test | flagged |

Founding failure #3 (`toContain('—')`, HANDOVER §0.4) and #4 (`toContain('data-severity="none"')`)
also count ≥2 in every panel render — confirmed in the same run (e.g.
`session-event-log-panel.test.tsx`, `data-severity="none"`, count 2, on a subject that has
*already been scoped* by this loop).

**So: the shape lint catches 2 of 4. This rule catches 4 of 4.**

### Measurement — the false-positive cost, which is the whole question

| population | count |
|---|---|
| `toContain` calls with a string subject, `components/` | 454 |
| of those, needle occurs > 1 time | **43 (9.5 %)** |
| already exempt under the existing `"throwing"` rule | 7 |
| remaining, needing adjudication or scoping | **36** |

For comparison, the discriminator the build rejected on false-positive grounds ("subject is an
unscoped `renderToStaticMarkup(...)`") matches **198**. This is an order of magnitude smaller.

And the 36 are not uniformly noise. Several are latent instances of a trap HANDOVER §0.4 already
names — *"a row helper that finds the subtitle"*:

```
safety-panel.test.tsx        'ufw' ×2, 'pwm5' ×2, 'fan service' ×2   (subtitle + row)
storage-network-panel.test.tsx  'eno1' ×4
cooling-panel.test.tsx       'fan 5' ×5, '0 RPM' ×6, '4,308 RPM' ×4
gpu-panel.test.tsx           'GPU 0' ×3, 'GPU 1' ×3
```

Others are plainly legitimate and would need an exemption or a scoped subject — e.g.
`stacked-time-series-chart.test.tsx` asserting `'TIME('` ×17 in a test whose *whole point* is
that one shared x-axis is drawn once per plot.

### The honest cost, stated so the reconcile phase can price it

- It is a **runtime** rule: it only sees the fixtures the suite actually renders, so it reports
  on exercised paths, not on source. It complements the source lint; it does not replace it.
- It needs an opt-out (the existing `"throwing"` name rule composes cleanly and already covers 7
  of the 43).
- It requires overriding `expect(...).toContain` globally via `test.setupFiles` — a
  project-wide mechanism change, and the kind of thing that must itself be mutation-proven.
- 36 hits need adjudication before it can be a **gate** rather than a **report**. A staged
  adoption (report-only first, then gate) is the obvious shape.

### The judgment the handoff asked for

**The half-guard is worth having**, and the build's scope reasoning is sound: as a *source text
lint*, the bare-word case genuinely cannot be separated from the 198 legitimate whole-document
checks — I tried and could not construct one. **But "cannot be mechanised" is false**, and that
is the sentence a reader would otherwise take away from `lib/tocontain-scope.test.ts`'s corrected
doc, which says the two-member vocabulary exists *"because the general version's false-positive
rate on this tree is prohibitive"* and stops there. That is true of the static rule and untrue of
the dynamic one, and the doc does not distinguish them. **The bound worth recording is narrower
than the one currently written: this project cannot mechanise the bare-word case *in a source
lint*; it can mechanise it in a matcher, at a measured 9.5 % adjudication cost.**

---

## F8 — the anti-vacuity checks run in `pnpm verify` but none is mutation-guarded, and their strengths differ by an order of magnitude — REASONED

Direct answer to handoff §3.2: **they are real assertions, not a manual demonstration** — each is
an ordinary `test(...)` in a file `pnpm verify` runs. What is missing is the mutation. Reading
all five `10c-G*` entries in step 10's and step 3's `regressions.py`: `10c-G1` targets a fixture,
`10c-G2` un-scopes a CPU-panel assertion, `10c-G3` a CSS class, `10c-G4` a formatter call,
`10c-G5` this harness's own `LEDGER_FILES`. **Every one of them is aimed at the file's single
⚠-marked `test.each`.** No mutation anywhere breaks a file-walk, so nothing requires any of the
four nets to be able to fail. The test phase's disclosure (§6) is accurate; this finding is about
what the four checks would *actually* catch, which was not examined.

| guard | net | population today | narrowing it survives |
|---|---|---|---|
| `tocontain-scope` | `compositePanelSourceFiles().length > 0`, **plus** a separate fixture test asserting `>= 8` and `toContain('cpu-panel.tsx')` | 8 | 8→7 caught. **Strongest of the four** |
| `unit-suffix` | `files.length > 15` (and `> 0`) | 25 | 25→16 silent, 25→15 caught |
| `dangling-css-class` | `audits.length > 0` only | 18 | **18→1 silent** (see F6) |
| `cross-harness-ledger` | `orphans.length > 0`; population only `allTestFiles().length > 0` | 99 files / 1 orphan | **99→1 silent**, and inverted (see F2) |

**Concrete failure scenario** (the one F6 already builds): the CSS-import regex is tightened or a
quote style changes, `audits` falls from 18 to 1, `> 0` stays green, and the guard reports on one
file while reading as though it covered every component. The `tocontain` guard is immune to the
same class of edit only because someone happened to write `>= 8` in a *fixture* test rather than
in the net itself — an accident of style, not a designed defence, and it is not stated anywhere
as the reason that guard is safer.

---

## F9 — `ledgerFilesOf` silently drops entries on a comment inside `LEDGER_FILES`, or a trailing comment on a path constant — EXECUTED

`ledgerFilesOf` splits the list body on `,` and resolves each chunk as either a quoted string or a
known constant name; the `ASSIGN` regex requires the constant's line to *end* right after the
closing quote (`^NAME\s*=\s*"…"\s*$`). Measured:

| harness shape | resolved |
|---|---|
| `LEDGER_FILES = [` / `    # step 9 files` / `    A_TEST, B_TEST,` / `]` | `['lib/b.test.ts']` — **A_TEST silently gone** |
| `A_TEST = "lib/a.test.ts"  # the a file` + `LEDGER_FILES = [A_TEST]` | `[]` — **the whole list gone** |
| `LEDGER_FILES = [MYSTERY]` (no such constant) | `[]` (fixtured, correct) |

**Checked all nine real harnesses: no `#` appears inside any `LEDGER_FILES` body, and no path
constant carries a trailing comment.** So this is latent, not live.

**Direction is the safe one** — a dropped entry creates a *false* orphan, never hides a real one.
But a false positive in a guard is this loop's own declared defect class, and the failure would
be maximally confusing: `pnpm verify` red, naming a file that is *visibly present* in the
`LEDGER_FILES` list the reader is looking at.

**Concrete failure scenario.** Step 10's `LEDGER_FILES` is 32 entries over 8 lines. A future
editor groups them — `# step 9's primitives`, `# 10c-2's guards` — inside the list. The first
entry after each comment vanishes from the union; if it carries ⚠ marks (most do), the suite goes
red claiming a listed file is an orphan. The cheapest reading is "the guard is broken", and the
cheapest fix is to delete the assertion.

---

## F10 — smaller bypasses of the `toContain` lint, all latent today — EXECUTED

Measured against `dangerousWholeDocumentChecks`, all returning `[]`:

| shape | why |
|---|---|
| `let html = renderToStaticMarkup(<X />)` | `wholeDocVars` regex requires `const` |
| `const doc = html; expect(doc).toContain('data-severity="alarm"')` | aliasing is not tracked |
| `const html = renderPanel({…})` (a local render helper) | subject must be bound *directly* to `renderToStaticMarkup(` |
| `expect.soft(html).toContain('data-severity="alarm"')` | the matcher regex is `\bexpect\(` |
| `test('the alarm chip renders without throwing', …)` with 5 substantive assertions | the `"throwing"` exemption is per-**test**, not per-assertion |

**None exists today**: all eight composite-panel test files bind every render as
`const <name> = renderToStaticMarkup(` (verified by grep — 15/20/16/14/14/16/14/6 occurrences,
plus multi-subject bindings like `withoutHandler`, `deadHtml`, `presentButUnread`, all of which
the regex does catch since it accepts any identifier).

**Concrete failure scenario for the one that matters — the blanket exemption.** The word
"throwing" appears in a test name for a good reason (the non-crash smoke test), but the exemption
attaches to the *whole test body*. A future test named
`'a paused dashboard renders the alarm band without throwing'` — a perfectly natural name for a
regression test combining both claims — gets every assertion inside it exempted, including a
whole-document `toContain('data-severity="alarm"')`. The guard's doc calls the marker
"mechanical, visible … a future test wanting the exemption has to spell out that it is a
non-crash smoke test", which is true of the *name* and not of the *scope*.

---

## F11 — "exactly ONE ⚠ mark per file" is inaccurate: each guard file carries 3–5, on `describe` blocks no harness can read — EXECUTED

`10c2-build.md` §6 states the four files ship *"Exactly one ⚠-marked test per file"* and that
fixture marks were *"demoted to a plain test name"*. Counted:

| file | test-level ⚠ | `describe`-level ⚠ |
|---|---|---|
| `lib/tocontain-scope.test.ts` | 1 | 4 |
| `lib/cross-harness-ledger.test.ts` | 1 | 3 |
| `lib/dangling-css-class.test.ts` | 1 | 3 |
| `lib/unit-suffix.test.ts` | 1 | 2 |

The *test*-level claim is exactly right. But the marks were not removed — they were moved onto
`describe(...)` titles, which `marked_tests()` in every `regressions.py` cannot see (its `CALL`
regex is `(?:test|it)(\.each)?`), so **12 ⚠ marks were added by this loop that no ledger will
ever require a mutation for.**

**Calibration, stated so this is not over-read:** `describe`-level ⚠ is long-standing practice
here — over twenty existing test files use it, including `header.test.tsx`, `purity.test.ts` and
six panel test files. So this is a **documentation-precision finding, not a new defect**, and I
am not proposing the marks be removed.

**Why it is still worth stating.** `grep -c ⚠ lib/tocontain-scope.test.ts` returns 5, not 1, and
a reader auditing "is every ⚠ mark ledger-covered?" — the exact audit `lib/cross-harness-ledger.test.ts`
exists to automate — gets a number that disagrees with the build document by 4×, in the file
whose subject is unprovable ⚠ marks. The cross-harness guard's own doc is careful to note that
`lib/throttle.test.ts`'s ⚠ "is inside a doc comment, not a test name, so it is invisible …
correctly". `describe`-level marks are invisible in exactly the same way and are far easier to
mistake for real ones.

---

## What I attacked and could NOT break

Everything below was probed with a real execution, not read and assumed.

1. **The ledger union's re-derivation.** Re-derived from scratch: 9 harnesses, union **96**
   entries, `allTestFiles()` **99**, orphans exactly `['lib/throttle.test.ts']` (plus my own
   scratch files while they existed — the guard noticed them immediately, which is itself a live
   demonstration). **Zero ledger entries name a file that is not on disk**, so the handoff's
   "ledger entry naming a file that no longer exists" edge is clean today; when it does happen the
   direction is safe (a phantom entry cannot cover a real orphan, because orphan-hood is computed
   from the real file's own path). A file listed in **two** ledgers is harmless — the union is a
   `Set`. A harness with no `LEDGER_FILES` at all resolves to `[]` and contributes nothing
   (fixtured), and four non-step directories under `pipeline/steps/` with no `regressions.py` are
   skipped without error.
2. **`codeOnly` comment-blinding, on all four guards.** Could not forge a hit from prose in any
   of them: a commented-out `expect(html).toContain('data-severity="alarm"')`, a comment naming
   `styles.item`, a comment mentioning `0 RPM`, and a JSDoc example `` `4,308 RPM` `` are all
   correctly ignored. This is the 10a F3 lesson and it holds.
3. **Forging a ⚠ mark from a string body.** The build doc flagged this as an unproven fragility.
   I could not do it: `warningMarkedTestNames`'s `CALL` regex requires `(?:^|\s)` before
   `test`/`it`, and the shapes I tried (a `test(` immediately after a quote; a multi-line template
   containing a full `test('⚠ …')`) all produced `[]`.
4. **`declaredClasses` selector shapes.** Correct on `@keyframes` (`.a` only, not `pulse`),
   comma-separated multi-selectors, `>` combinators, attribute selectors, decimal values
   (`0.75rem`), `transition: opacity .2s ease` (`.2s` not read as a class), quoted `composes:
   … from '…'` paths, and `:global(...)`. The only misfire is the one already disclosed —
   `url(../x.png)` declares a phantom class `png`, confirmed — and no stylesheet here uses `url()`.
5. **`.tsx` files importing two stylesheets.** Audited independently per local import name; no
   cross-talk. Full coverage today: **18 audits over the 18 files that mention `.module.css`**.
   A `.tsx` with no CSS import returns `[]` rather than throwing (fixtured). A `.module.css`
   with no importer is simply never scanned — the disclosed dead-CSS direction.
6. **The `toContain` lint's composite-panel walk.** `compositePanelSourceFiles()` returns the
   correct eight by reading each file's own imports; `status-row.tsx` is correctly excluded; a
   panel added without a matching `<name>.test.tsx` would make `readFileSync` throw loudly rather
   than skip silently.
7. **`literalContent` / `isDangerousLiteral` vocabulary.** Both directions behave as documented on
   every shape I tried; the exclusions of `'paused'`, `'refresh'`, `'— / 61.0 GiB'`,
   `'paused · 6 alarms'` and `data-severity="ALARM"` are all correct and deliberate.
8. **Tree integrity.** `lib/collectors/errors.ts` and `lib/format.ts` were left untouched, as
   instructed. All experiments reverted: four scratch test files, one scratch vitest config, one
   scratch setup file and one throwaway harness directory created and deleted.
   `git status --short` at the end matches the handoff's listing exactly, and `pnpm verify` is
   **99 files / 2745 tests / Type Errors: none / exit 0**.
9. **Not re-opened**, per the handoff: the 8 lint hits, the doc correction about the two
   bare-word founding failures, `02-R3`, and `exactOptionalPropertyTypes`.

I did **not** re-run `regressions.py` for any step — the parent settled that all five `10c-G*`
mutations bite, and the handoff's sequencing rule makes a redundant 172-mutation run expensive
for no new information.
