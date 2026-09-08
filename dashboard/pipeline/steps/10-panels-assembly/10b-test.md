# Step 10b — the nine panel bodies (TEST phase)

**Written by the test-phase agent, 2026-09-08.** Fixes made; nothing rejected as out of scope
except the two things the handoff itself scoped away (`app/`, `lib/`). `pnpm verify` and the
harness both confirmed green after every change; see §8.

---

## 1. ⚠ The escaped-quote question — answered mechanically. **No live under-count, anywhere, today.**

**Method.** Re-implemented the exact `CALL`/`FIRST_STRING` regex pair from
`pipeline/steps/10-panels-assembly/regressions.py` (the scanner 10a's reconciliation confirmed is
byte-identical, modulo stripped comments, across all nine harnesses) and ran it over every file
named in every step's `LEDGER_FILES` — 844 `⚠`-marked test names across steps 2–10. For each, I
checked whether the raw captured string content contains a backslash immediately before the
character that also delimits the string (`\'` inside `'...'`, `\"` inside `"..."`) — the exact
condition that defeats the scanner, because `FIRST_STRING` captures the escape literally while
Vitest's runtime-printed name (and therefore the `FAIL` line the ledger unions against) has it
stripped.

**Result, per step:**

| step | ⚠-marked names scanned | with an escaped delimiting quote |
|---|---:|---:|
| 02 | 13 | 0 |
| 03 | 24 | 0 |
| 04 | 83 | 0 |
| 05 | 97 | 0 |
| 06 | 56 | 0 |
| 07 | 130 | 0 |
| 08 | 219 | 0 |
| 09 | 105 | 0 |
| 10 | 117 (121 after this phase's additions, see §3) | 0 |
| **total** | **844** | **0** |

A broader sanity grep (`grep -rn "⚠"` over every `test(`/`it(` line in the whole tree, not just
`LEDGER_FILES`, for any `\'` or `\"`) also came back empty. **Clean negative, stated plainly: this
is not live anywhere.**

**Why it isn't a fourth Q1-shaped blind spot, mechanically — and this matters more than the
count.** I traced exactly what happens when the condition *does* occur, by reading the harness's
own ledger-closure code (`marked_tests()` → `prefix not in joined` → `uncovered` →
`return 1` with `NO MUTATION REDDENS THESE ⚠ TESTS` printed). An escaped delimiting quote makes
`prefix` carry a literal backslash that can never appear in a `FAIL` line, so the affected mark is
**always** reported `uncovered` — regardless of whether the mutation actually reddened it. That is
a **loud, self-flagging failure**: the harness exits 1 the moment it runs, on every run, and names
the offending mark. Q1's original bug (a multi-line `test.each` invisible to the old regex) and
10a-F1's generic-type-argument blind spot both had the opposite shape: the mark never entered
`marked_tests()` at all, so the harness could exit 0 while genuinely uncovered — a **false green**.
This bug can only ever produce a **false red** on an actually-working mutation. It cannot cause the
ledger to report success over a smaller-than-real set, which is the specific failure class Q1 was
opened to close.

The three instances that existed transiently during 10b's build (per `10b-build.md` §6) were
caught for exactly this reason — the harness itself refused to go green — and were fixed by
switching those three test names to double-quoted strings. `10b-build.md`'s own phrase "would have
shipped as silently uncovered marks" slightly overstates it: they would have shipped as **loudly
uncovered marks**, which is why they were caught before shipping at all. The risk this bug shape
actually carries is alert fatigue (a reviewer seeing "uncovered" might reflexively blame escaping
without checking each one) rather than a hidden gap — worth naming for whoever next hits this, but
not the same danger as Q1's or F1's.

**Recommendation, not acted on (matches the "do not fix eight harnesses" instruction):** the
project convention "use double quotes, never `\'`, in a `⚠` test name" is sound and worth writing
into `ANCHOR.md`/`HANDOVER.md` as a standing rule the way the `pgrep -f` bracket rule is, since the
next occurrence would burn a harness run to rediscover what this scan already answered.

---

## 2. The 30 new mutations — equivalence and vacuousness audit

Read all 30 `10b-` mutation entries in `regressions.py` against the code they target (all nine
panel `.tsx` files plus `event-sentence.ts`) before running anything, then ran the full harness
(§8) as the mechanical check. **Zero `DID NOT BITE`, zero `ANCHORS AMBIGUOUS`, zero `ANCHORS
MOVED`** printed across all 105 mutations (71 inherited + 30 original 10b + 4 added this phase,
§3) — that triad is the harness's own detector for a mutation that silently failed to apply, ended
up ambiguous, or turned into a no-op, so this is mechanical evidence, not an assertion.

- **`10b-SN1`'s two-anchor construction (root/home severity swap) is correctly built to avoid the
  no-op failure `build.md` §4 describes** — I traced both `.replace(old, new, 1)` calls by hand:
  each anchor includes its own disk's `total{X}Gib`/`severity` context, so the first replacement
  cannot turn root's line into a byte-identical copy of home's and let the second replacement's
  first-match-wins semantics undo the first. Confirmed live: the harness run shows `10b-SN1`
  reddening 2 real tests, not 0.
- **`10b-CO5` — checked for "a guard that cannot fail is not a guard" specifically, per the
  handoff's direct ask.** Read `cooling-panel.tsx`'s fan5 row (`note={fan5Age ?? dellSmmError}`)
  and the fixture the ⚠ test at `cooling-panel.test.tsx:53` uses: `fan5Rpm: null`, `errors: []`,
  `pwm5Present: true` — which makes `fan5Age` and `dellSmmError` both resolve to `null` today, so
  `note` is `null` and the row renders bare. Under `10b-CO5`'s mutation
  (`note={fan5Age ?? dellSmmError ?? 'no reading reported'}`), that same fixture's `note` becomes
  the literal string `'no reading reported'`, which the test's own
  `expect(fan5Row).not.toContain('no reading')` directly catches. **Confirmed by running the
  harness, not just by reading**: `10b-CO5` reddens exactly this test. Not vacuous.
- No entropy or timing dependency anywhere in the nine panels' test files
  (`grep` for `Math.random`/`setTimeout`/`Date.now()`/`performance.now` over
  `components/panels/*.test.{ts,tsx}` is empty) — the probabilistic-mutation risk named in the
  handoff (and realised elsewhere in `lib/collectors/serving.test.ts`) has no surface here. All
  nine panels are pure `renderToStaticMarkup` calls against static fixtures.

No vacuous or probabilistic mutation found among the 30.

---

## 3. Invariant 1, in nine places — **not uniformly satisfied before this phase; four gaps fixed**

Audited every panel for "null renders `—`, zero renders the numeral with its unit, with a fixture
demonstrating BOTH sides for the same field." Two panels already did this rigorously and were left
untouched:

- ~~**COOLING** — `10b-CO2`/`10b-CO3` are exactly this, on `fan5` and `fan1`–`4`, each with a
  same-`describe`-block null-vs-zero pair.~~
  > ⚠ **CORRECTION — 10b's reconciliation, 2026-09-08 (adversarial F1d).** This is wrong, and it
  > is the load-bearing error in this note: **COOLING was the one panel this phase left untouched
  > on the grounds that it already did this rigorously, and it was the panel that did it least.**
  > `10b-CO2`/`10b-CO3` are both `severity={…}` → `severity={null}` — they delete a band, i.e.
  > they test the **zero** side only. The `fan5` describe block does have both fixtures, but its
  > null-side assertion was `expect(unreadHtml).toContain('—')` **document-wide**, which
  > `chip.tsx:75` satisfies with its own no-band glyph whatever the value cell renders; `fan1`–`4`
  > had **no null fixture at all**, and `?? rpm(0)` on fan 2 rendered a fabricated red alarm at
  > 105/105 green. Two documents asserted a coverage that did not exist. Fixed and backed —
  > `10b-CO6`, `10b-CO7`, and a per-panel value-cell guard; see `10b-reconciliation.md` §1 and §2.
  >
  > ⚠ **The method lesson, since this phase's §3 sweep was otherwise sound:** the audit asked
  > *"is there a mutation and a fixture for both sides"* and answered from the mutation's
  > **description**. Read what a mutation REPLACES, against the code, before crediting it with a
  > property — `severity → null` and `?? null → ?? zero` are opposite sides of invariant 1 and
  > their descriptions both read as "invariant 1".
- **SAFETY** — the three-valued boolean checks (`ufwEnforcing`/`pwm5Present`/
  `dkmsForRunningKernel`) are tested `true`/`false`/`null` distinctly (`false` → alarm with its own
  fixture, `null` → watch with its own fixture), which is this panel's version of the same
  property.

> ⚠ **CORRECTION, same date and same finding (F1c): the four fixes below are each ONE FIELD.**
> GPU `powerW`/`utilPct`/`smClockMHz`/`memUsedMiB`, CPU `cpuPct`/`loadAvg`, MEMORY
> `swapUsedGiB`/`memTotalGiB` and STORAGE `home.*`/rx/tx all still took a `?? <zero>` mutation
> with the whole suite green after this phase. The honest count on the day this note was written
> was **invariant 1 guarded on 5 of ~30 readable fields**. The reconciliation replaced the
> per-field approach with a per-panel guard over every value cell at once, so a row added
> tomorrow is covered too.

**Four panels had the reading tested only non-zero, with the null side covered solely by the
whole-ring-`emptyState()` case — a materially weaker guarantee**, because every field in
`lib/types.ts` is independently nullable (a mid-session single-sensor failure, §6.5) and none of
these four had a fixture where the *rest* of the snapshot is present but *this one field* is null.
Concretely, each was one plausible one-line typo away from shipping invariant 1's exact
conflation — `?? null` becoming `?? <zero-of-that-unit>` — completely undetected:

| panel | field | gap found |
|---|---|---|
| **GPU** | `tempC` | No zero-value assertion at all for temp/power/util/clock; the only null-side test was the whole-card `gpus: null` takeover (a different code path entirely) and the whole-ring-empty case |
| **CPU** | `cpuTempC` | A 95 °C alarm test existed; no null-field fixture, no 0 °C fixture |
| **MEMORY** | `memUsedGiB` | Nonzero GiB and a *small* swap value (0.04) were tested; no exact-zero and no null-field fixture for RAM |
| **STORAGE & NETWORK** | `root.usedGiB` | Nonzero figures and a zero *network* rate (`0 KB/s`, correctly numeral-with-unit) were tested; no null-field or exact-zero fixture for disk |

**Fixed.** Added one `⚠`-marked null-side test, one unmarked (documentation) zero-side mirror
test, and one backing mutation per panel — same pattern as `10b-CO2`/`10b-CO3`, each mutation
defaulting the missing reading to the zero of its own branded unit and verified to redden only the
new test:

- `components/panels/gpu-panel.test.tsx` — `⚠ a missing temperature reading renders — with the
  explicit no-band chip, not 0 °C` / mirror. Mutation `10b-GP2`.
- `components/panels/cpu-panel.test.tsx` — `⚠ invariant 1 — a missing CPU temperature renders —
  with the no-band chip, not 0 °C` / mirror. Mutation `10b-CP3`.
- `components/panels/memory-panel.test.tsx` — `⚠ invariant 1 — a missing RAM reading renders —
  with the no-band track, not 0.0 GiB` / mirror. Mutation `10b-MP3`.
- `components/panels/storage-network-panel.test.tsx` — `⚠ invariant 1 — a missing root-disk
  reading renders — with the no-band track, not 0.0 GiB` / mirror. Mutation `10b-SN3`.

Each mirror test is deliberately **not** `⚠`-marked, with a comment explaining why (the zero-side
formatter/severity behaviour is already covered at `lib/format.test.ts`/`lib/severity.test.ts`,
and none of these four files has any additional falsy-checking logic between the reading and those
calls that only the mirror test could catch) — matching the existing convention
`safety-panel.test.tsx` already documents for its own unbacked test.

**SERVING and SESSION EVENT LOG were checked and found adequately covered / not applicable**:
SERVING already has a rigorous `null`-vs-`[]`-vs-populated fixture set at the *enumeration* level
(`10b-SV2`), and its per-instance fields (`ctx`, `port`) have no realistic zero-reading ambiguity
in the same sense as a sensor. SESSION EVENT LOG has no `§6.3`-banded numeric reading at all — its
`chip` is either the entry's own carried severity or the explicit no-band state, both already
tested (`10b-SE2`).

All four new mutations verified live in the harness run (§8): each reddens exactly its own new
test, none of the pre-existing 101 mutations regressed, and the ledger's "every `⚠`-marked test
went red under at least one mutation" check passed at **121** marks (117 + 4 new).

---

## 4. The GPU traps — verified by reading the code, not the build notes

- **Raw driver name, never "V100."** `gpu-panel.tsx:93`: `formatText(gpu?.name ?? null)` — no
  lookup table, no branch on the string's content anywhere in the file. `formatText` (checked in
  `lib/format.ts`) only trims and blanks-to-`—`.
- **Full-length bus id.** Same line, `formatText(gpu?.bus ?? null)`, and the test at
  `gpu-panel.test.tsx:43` specifically asserts `· 00000000:17:00.0` appears and `· 17:00.0` does
  not — the stronger check the build note describes (a bare `.toContain('17:00.0')` could never
  fail under a trimming bug, since the short form is a substring of the full one).
- **Throttle rows only when something beyond `0x4` is active.** `gpu-panel.tsx:156`:
  `{decode !== null && decode.notable ? <Row .../> : null}`. `decode.notable` is
  `lib/throttle.ts`'s own decision, not re-derived here. Verified against three fixtures
  (`0x4` alone, `0x0`, `0x4 | 0x20`) in `gpu-panel.test.tsx:65–84`, all passing, and the normal
  power cap is never styled — no throttle row renders at all for it (not a row with a `normal`
  chip).
- **"Served by instance N."** `gpu-panel.tsx:163–166`: the label is a template literal,
  `` `served by instance ${index}` ``, never "on this card" anywhere in the file. The join itself
  (`gpu-panel.tsx:78-79`, `servingFor`) is `s.instance === index`, exactly `gpu.index ===
  serving.instance` (index is threaded in as this mount's own prop, and the join key comes from
  the same value). Tested with a mismatched-index fixture (`gpu-panel.test.tsx:96-101`) proving a
  card with no matching instance shows `—`, not another instance's model.

All four confirmed correct by direct reading; no fixes needed here.

---

## 5. SAFETY's stale row — verified byte-for-byte, with an honest caveat

`components/panels/condition-lookup.ts:54-56`:

```ts
condition !== undefined && condition.stale
  ? `last read ${formatAge(nowMs - condition.lastSeenMs)} ago`
  : null;
```

`app/dashboard-shell.tsx:98-99`:

```ts
const staleAgeText = (c: BannerCondition, nowMs: number): string | null =>
  c.stale ? `last read ${formatAge(nowMs - c.lastSeenMs)} ago` : null;
```

**Byte-for-byte identical template output**, modulo variable names (which never reach the rendered
string). Both are independently exercised: `condition-lookup.test.ts:44-48` asserts the literal
`'last read 6:12 ago'`, and `dashboard-shell.test.tsx:433` asserts the same literal against the
banner. So today they agree, and are proven to agree by test.

**The caveat the build note already raised is real and I confirmed it rather than just repeating
it**: there is no shared constant and no cross-file test — each file hardcodes the same string
independently. If either wording changes without the other, **nothing in the suite will fail**;
both tests would keep passing against their own file's now-diverged text. This is out of 10b's
file scope to fix (`condition-lookup.ts` can reference `components/panels/`; `dashboard-shell.tsx`
is `app/`, explicitly not this loop's to touch) — recorded here as a finding for whichever phase
next touches either file, not fixed.

---

## 6. Explanations — confirmed not invented; units confirmed not hand-rolled

Grepped every panel `.tsx` for hardcoded unit strings (`' RPM'`, `' MiB'`, `' GiB'`, `' °C'`,
`'%'`) and for any `.split(...)` on a formatter's output — **both empty** across
`components/panels/*.tsx`. Every unit-bearing string comes from `lib/format.ts` verbatim or is two
whole formatter outputs concatenated with a fixed separator (the GiB pairs `memory-panel.tsx`'s
and `storage-network-panel.tsx`'s own module docs already flag as a recorded O14 gap, not a
violation — `lib/format.ts` has no joint GiB formatter to call instead).

Checked every literal explanatory sentence in the nine files for a §3.7 violation (SAFETY row text
must come from `errorsForPanel`'s source match, never UI copy):

- **SAFETY** — every row's `note` is `staleAgeNote(...) ?? messageFor(source)`;
  `messageFor` reads only from `errorsForPanel(snapshot, 'safety')`. No hardcoded explanation
  anywhere in the file. The `unknownStanding` row's wording
  (`` `unknown STANDING entry` `` + a separate value span) matches `HANDOVER.md:753`'s
  pre-decided text exactly — this is D3's already-made decision being implemented, not invented
  copy.
- **GPU**'s `'no GPUs enumerated'` and **SERVING**'s `'serving instances unknown'` /
  `'no llama-server instances discovered'` are structural-state labels (§6.5's mandated exact
  wording for GPU; the `null`-vs-`[]` distinction §3.1 requires for SERVING), not alarm
  explanations competing with `errors[]` — different category from what §3.7 governs, and
  `errorsForPanel`'s own message is still shown alongside where one exists (GPU's takeover branch,
  SERVING's `errorMessage`).
- **`event-sentence.ts`**'s copy is the wording `lib/client/events.ts`'s own module doc explicitly
  defers to "the phase that owns the panel" — not a violation, it's the one place copy is meant to
  live.

No hardcoded explanatory copy found competing with an `errors[]` source.

---

## 7. Two things the build recorded — confirmed accurate

- **The chart/table toggle is unreachable.** `grep -n "view\b" lib/sparkline etc.` confirms `view`
  is a real, optional prop on both chart primitives (`components/sparkline.tsx:126`,
  `stacked-time-series-chart.tsx`). `grep -n "view=" components/panels/*.tsx` returns **nothing** —
  no panel ever sets it, and since all nine panels are hook-free (`purity.test.ts`), none of them
  *can* hold the toggle state themselves. Confirmed: **Q2-S2's table view is built into the
  primitives and specified, but there is no live UI path to it** until a stateful `app/` shell
  exists to own the toggle. Accurately stated in `10b-build.md` §5.
- **Not wired into `app/dashboard-shell.tsx`.** `grep -n "PanelPlaceholder\|GpuPanel\|CpuPanel..."
  app/dashboard-shell.tsx` shows all nine slots still rendering `<PanelPlaceholder .../>`; none of
  the nine new panel components is imported or referenced there. Confirmed accurate. **What this
  leaves unverified**: composition. Every one of the ~2500 panel-related tests renders one panel in
  isolation against a hand-built `RuntimeState`; nothing proves nine real panels mounted together
  under the real grid don't collide on an SVG id, don't fight over layout, and that
  `dashboard-shell.tsx`'s actual `useTelemetry()`-sourced state shape really satisfies `PanelProps`
  end to end (as opposed to the fixture shapes built in `test-support.ts`, which are hand-written
  to match the type but are not the same code path as the real hook). This is the same shape of
  gap 10a's own reconciliation flagged for the header/banner/grid ("a mutation harness over the
  parts does not cover the join") — it will recur here until the wiring (10c or the owner's next
  step) actually happens and a `dashboard-shell.test.tsx`-style join test exists over all nine real
  panels.

---

## 8. Names against bodies

Read every test name in all nine panel test files, `condition-lookup.test.ts`,
`event-sentence.test.ts`, and `status-row.test.tsx` against its assertions. No inert test found
(a test whose name claims a property its body does not check) beyond what is already known and
explained in-file (SAFETY's two documented not-⚠ tests, and the four new not-⚠ mirror tests added
in §3, each with a comment explaining why it carries no ledger obligation). `event-sentence.test.ts`
in particular is a clean exhaustive `switch`-shaped set: one test per `LogEntryKind`, name and
assertion in one-to-one correspondence, six of them `⚠`-marked with a dedicated mutation each
(`10b-ES1`–`ES6`), verified reddening correctly in the harness run below.

---

## 9. Verification

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
pnpm verify
```

**Exit 0, both before and after the harness run** (run twice, per ANCHOR's "never run verify
alongside a harness" rule — sequentially, not concurrently). **91 files, 2520 tests** (2512 + 8 new
— two tests per panel × four panels in §3), 0 type errors.

```
python3 pipeline/steps/10-panels-assembly/regressions.py
```

**Exit 0.** `All 105 regressions failed their check, as they must.` (101 inherited + 4 new:
`10b-GP2`, `10b-CP3`, `10b-MP3`, `10b-SN3`.) Zero `DID NOT BITE`, zero `ANCHORS AMBIGUOUS`, zero
`ANCHORS MOVED`. Red-test ledger: **132 distinct failing tests across 105 mutations; 121 ⚠-marked
tests checked, every one went red under at least one mutation.**

```
git status --short
```

```
 M SPEC.md
 M pipeline/steps/10-panels-assembly/regressions.py
?? components/panels/
?? pipeline/handoffs/10b-panels.md
?? pipeline/handoffs/10b-test-phase.md
?? pipeline/steps/10-panels-assembly/10b-build.md
```

`SPEC.md`'s modification predates this phase (the coordinator's S11/G5 edit, per `10b-build.md`
§6 — not touched here, per the rule against editing `SPEC.md`). `regressions.py`'s modification is
this phase's four new mutations. No stranded mutation: `pnpm verify` was run clean immediately
after the harness (§9 above), confirming every mutated file was restored.

## 10. Summary of changes made this phase

| file | change | why |
|---|---|---|
| `components/panels/gpu-panel.test.tsx` | +1 helper (`rowContaining`), +2 tests (1 `⚠`) | invariant 1 had no fixture for a missing GPU temperature reading distinct from the whole-card takeover case |
| `components/panels/cpu-panel.test.tsx` | +1 helper, +2 tests (1 `⚠`) | same gap, `cpuTempC` |
| `components/panels/memory-panel.test.tsx` | +2 tests (1 `⚠`) | same gap, RAM `used` |
| `components/panels/storage-network-panel.test.tsx` | +1 helper (`rootMeterOf`), +2 tests (1 `⚠`) | same gap, root disk `used` |
| `pipeline/steps/10-panels-assembly/regressions.py` | +4 mutations: `10b-GP2`, `10b-CP3`, `10b-MP3`, `10b-SN3` | back the four new `⚠` tests above; each verified to redden only its own test |

No production file under `components/panels/` was changed — every finding in §§4–7 confirmed the
build correct on read; the only gap requiring a fix was test coverage (§3). `SPEC.md`,
`purity.test.ts` and everything under `app/`/`lib/` were not touched.
