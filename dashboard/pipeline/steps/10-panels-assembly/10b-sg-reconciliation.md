# 10b-S-G — RECONCILIATION phase

**Written by the reconciliation agent, 2026-09-08.** Branch `dashboard-frontend`, working dir
`dashboard/`. Read: the handoff (`pipeline/handoffs/10b-SG-reconcile.md`), `ANCHOR.md` §4/§5/§8/§9,
`PLAN.md`, `SPEC.md`'s `errors[].instance` block (§3.7, line 542 — the test phase's correction to
"§4" is right) and §6.5, then the build (`10b-sg-error-instance.md`), the test phase
(`10b-sg-test.md`) and the adversarial (`10b-sg-adversarial.md`).

**Nothing was committed or staged. `SPEC.md` was not edited** — the four spec questions this
phase raises are in §5 below, for the owner. `purity.test.ts` was not touched. Nothing outside
`dashboard/` changed.

⚠ **This phase's green is not the green.** `pnpm verify` and both harnesses are reported in §4;
ANCHOR §8 makes re-running them the parent's own job before the commit that closes this item.

---

## 1. The adjudication — all eleven

| # | Finding, in one line | Verdict | Reason |
|---|---|---|---|
| **A1** | The second `namesInstance` call site (`unattributed`) has no mutation; replacing the filter with `servingErrors` left the whole suite green, shipping every attributed message twice | **ACCEPTED** | Executed and confirmed by the parent. The "too few" direction was covered and "too many" had **no assertion anywhere** — ANCHOR §5's *"every boundary guard needs a fixture on both sides"*, failing in the exact place the ledger cannot see. Fixed with counting assertions and two mutations (§2.1) |
| **A2** | `panelsForSource('dbus')` fans out to COOLING/SERVING/SAFETY and only SERVING learned the join, so `llama-server@1.service: NoSuchUnit` prints beside a healthy `gpu-fan-control.service` on two panels | **ACCEPTED** (not deferred) | See §3 — this is the ruling that needed the most thought, and the reason is that S-G is the change that put the discriminator in the entry and used it in one of three places |
| **A3** | Two entries sharing `source` **and** `instance`: the first vanishes from the page, while the module doc claims *"Nothing is dropped"* | **ACCEPTED IN PART** | The **false claim** is a defect this phase owns and it is fixed (§2.3). The **rendering** change — joining several messages from one source for one row — is a §6.5 question the spec does not answer ("its row shows the unit state and **the reason**", singular), so invariant 7 applies: recorded as **S-G-Q1**, not invented here |
| **A4** | The 4-of-18 enumeration is enforced by nothing; the two `llama-env` directory-level paths have no test, unlike `collectSafety` | **ACCEPTED IN PART** | The **missing tests** are this phase's job and are added, with the two mutations that represent the wrong edit (§2.4). A **type-level** constraint is REJECTED as a fix here: it means splitting `TelemetryError` into a discriminated union over eighteen sources and teaching `wire.ts` a per-source rule `SPEC.md` never states, on the wire whose one documented property is that the field is **optional**. Whether §3.7 wants that rule at all is **S-G-Q3** |
| **A5** | An orphaned `instance` degrades correctly to `PanelNotes` — the behaviour is right and nothing tests it | **ACCEPTED — fixture only, no behaviour change** | The parent's own strongest lead did not land, and the standing instruction is *do not let anyone "fix" a non-bug*. Three shapes are now fixtured (instance 5 against two rows, `serving: null`, `serving: []`) on the same line A1 left uncovered (§2.2) |
| **A6** | `optionalInteger`'s value edges (`-1`, `0`, `-0`, `2^53`, `1e21` accepted; float/NaN/∞/string/null/bool refused) | **REJECTED — no defect** | Every acceptance and refusal is `integer()`'s, the same check already behind `Gpu.index` and `ServingInstance.instance`, so a reader has one rule and not two. The handoff settled it as a clean negative and the adversarial's own table agrees. The non-negativity question is already recorded by the build under invariant 7; adding an "accepted edge" fixture would pin behaviour no rule requires, which is how a test becomes a specification nobody wrote |
| **A7** | Duplicate `instance` values in `serving[]` validate; the panel renders one message twice under a single React key | **DEFERRED — owner, then 10c** | Real, and S-G made it slightly worse by making `instance` the sole join key. But the fix is a **new cross-entry rule in `wire.ts`** whose failure mode is refusing the whole snapshot (§1 of the test phase), for a shape only a buggy server can produce — the collector's `discoverInstances` accumulates into a `Set` and rejects non-canonical spellings. `SPEC.md` does not state a uniqueness requirement on the wire. Recorded as **S-G-Q4** |
| **A8** | `dbus` with no `instance` conflates a bus-wide failure with `collectSafety`'s per-unit one, so SERVING prints `gpu-fan-control.service`'s failure under its rows | **DEFERRED — owner** | Genuinely unfixable inside this item: it needs either a **second** structural subject on §4's error shape (which unit) or `collectSafety`/`collectServing` filing under distinguishable sources. Both are §3.7/§4 changes and this phase does not own the spec. Recorded as **S-G-Q2**, and named in the two code comments A2 added so the next reader sees the limit at the call site rather than in a document |
| **A9** | Restoring the old three-`.includes` heuristic reddens exactly the two tests the test phase named; the build's §7 attribution is wrong | **ACCEPTED** | Settled by execution twice (test phase by reimplementation, adversarial by reverting the real body). The feature **is** proven — by the two other tests. `10b-sg-error-instance.md` §7 now carries a marked correction rather than an edited-away claim (§2.5) |
| **A10** | `errorFor`'s comment cites `events.ts:400` as agreement, and after S-G the two folds legitimately differ | **ACCEPTED** (comment), question recorded | A comment citing as agreement something that is no longer agreement is the same defect class as A3's doc, and cheaper to fix than to leave. Whether the session log should itself be per-instance is a real question with no spec answer — noted for **10c**, not changed: `events.ts` has no row to hang an instance on, and the reason the fold reads LAST rather than FIRST is unaffected either way |
| **A11** | `exactOptionalPropertyTypes` is off, so `contract.test.ts`'s `Object.hasOwn === false` is a runtime guarantee the compiler does not carry | **ACCEPTED IN PART** | The warning belongs where entries are minted, and is now in `errors.ts`'s docstring beside the sentence that was true only of `tag` (§2.6). Turning the **flag** on is a `tsconfig.json` change affecting every file in the project, which is not this item's scope — but it is now **measured** rather than guessed: `npx tsc --noEmit --exactOptionalPropertyTypes` exits **0** on this tree today. Deferred to **10c** with that number, because it is free now and gets less free every loop |

**Tally: 8 accepted — of which 3 in part (A3, A4, A11) and one (A5) is a fixture with no
behaviour change — 1 rejected (A6), 2 deferred (A7, A8).** The three "in part" verdicts each
carry a deferral of their own, so **five things leave this loop open**, all in §5 and all in
`HANDOVER.md` §9 with an owner: S-G-Q1 (from A3), S-G-Q3 (A4), S-G-Q4 (A7), S-G-Q2 (A8), and
`exactOptionalPropertyTypes` (A11, 10c's). A2 was accepted after the judgment call in §3.

---

## 2. What was applied

### 2.1 A1 — the "too many" direction now has assertions, and the line has mutations

- `components/panels/serving-panel.test.tsx`: a local `occurrences(html, needle)` helper, and
  a new ⚠ test **"an ATTRIBUTED entry renders on its row and never again as a panel note"**
  (`servingPopulated`: on row 1, and **exactly once** on the page).
- The pre-existing test *"an entry naming no instance is collector-wide and renders **once**,
  under the rows"* had a document-wide `toContain` where its own name says *once* — ANCHOR
  §2.2's fourth carried lesson, a fourth instance. It now counts.
- `pipeline/steps/10-panels-assembly/regressions.py`: **`10b-SG5`** (`unattributed =
  servingErrors` — the adversarial's own green-on-a-broken-tree experiment, now a permanent
  regression) and **`10b-SG6`** (`unattributed = servingErrors.filter(() => false)` — the
  opposite side, an entry that names no row on this page rendering nowhere at all).

### 2.2 A5 — the orphan, fixtured and not "fixed"

Two more ⚠ tests in the same block, no source change:

- **an entry naming an instance that is not on the page falls to the panel note** — `instance:
  5` against rows 0 and 1, asserted absent from both rows and present exactly once; and, in the
  same fixture, an `instance: 0` entry asserted on row 0 and *only* there, so one test carries
  both directions of the same filter.
- **`serving: null` and `serving: []` still show an instance-tagged entry** — the takeover
  branch, whose note rendering had no mutation either. **`10b-SG7`** now deletes it.

### 2.3 A3 — the doc that contradicted its code

`components/panels/serving-panel.tsx`'s module doc claimed *"Nothing is dropped"*. It is true
across sources and false within one, and `readEnv` files **one entry per parse problem**, so a
`1.env` missing `MODEL` with an unparseable `CTX` is two `llama-env` entries for instance 1 of
which only the second renders. The doc now says exactly that, names the open question, and stops
implying S-G closed it. `errorFor`'s own comment carries the same limit at the fold that causes
it. **No rendering change** — see S-G-Q1.

### 2.4 A4 — the two `llama-env` directory-level paths

- `lib/collectors/serving.test.ts`: one ⚠ test driving **both** paths through the real
  `collectServing` — the `readDir` failure (`serving: null`) and a `default.env` that is not an
  instance — asserting `Object.hasOwn(entry, 'instance') === false` rather than
  `?.instance === undefined`, because a key **present** and holding `undefined` reads identically
  through the latter and is exactly what a careless spread produces (A11).
- `pipeline/steps/05-collectors-serving-storage-safety/regressions.py`: **`10b-SG1`** (the
  `readDir` entry is stamped with instance 0) and **`10b-SG2`** (the malformed-filename problems
  are stamped with `found.value[0]`). Both are the plausible wrong edit — "helpfully" attaching
  the instance already in scope — and they complete the pattern `10b-SF1` started for
  `collectSafety`.

### 2.5 A9 — the correction to the build's §7

`10b-sg-error-instance.md` §7 now opens with a **marked correction** naming what is wrong (the
credited test does not discriminate: `connect ECONNREFUSED 127.0.0.1:8081` contains `:8081`, so
the old heuristic passes it on its own merits), what the evidence is (two independent executions),
and which two tests actually carry the feature. The original claim is left standing beneath it,
struck rather than deleted, per the handoff.

### 2.6 A11 — the warning at the mint

`lib/collectors/errors.ts`'s `tag` docstring said *"passing `undefined` explicitly is the same as
omitting it"*. True of `tag`; not true of an object literal built anywhere else, because
`exactOptionalPropertyTypes` is off. The docstring now says so and says what rests on it.

### 2.7 A2 — the two panels that ignored the discriminator

`components/panels/cooling-panel.tsx` and `components/panels/safety-panel.tsx` now read
`e.instance === undefined` alongside the source match. Three tests (two on COOLING, one on
SAFETY) and mutations **`10b-SG3`**/**`10b-SG4`**. The full reasoning is §3.

---

## 3. A2 — why it was accepted rather than deferred to 10c

Both were defensible and the handoff said so. The four things that decided it:

1. **The state it would otherwise be left in is worse than before the field existed.** An entry
   that now carries a subject, rendered by two panels that ignore it, *looks* fixed. The failure
   is silent, on a healthy-reading row, in SAFETY — the panel §6.2 calls the one that earns this
   dashboard's existence.
2. **The fix is provably a narrowing, and cannot be wrong.** Neither panel has a row for an
   `llama-server` instance; an entry that names one therefore explains nothing either panel
   renders. Nothing is lost from the page: SERVING shows it, on the row it names.
3. **The scope cost is two lines and one harness.** Both panels' test files are already step
   10's `LEDGER_FILES`, so the whole change — source, tests, mutations — stays inside one loop's
   ownership and one harness run. It does **not** touch `lib/client/observations.ts`, which is
   step 8's, and that was a deliberate choice: `errorsForPanel`'s own doc says it answers *which
   entries exist, not which em dash they belong to*, and the instance→row join is squarely the
   second question. Putting a row-level discriminator in the source-level router would have made
   that sentence false and pulled step 8's harness into a panel fix.
4. **PLAN.md's "add scope" prohibition is about a reconciler inventing work, not about finishing
   the finding it was handed.** A1 and A2 are the same defect at two altitudes: a discriminator
   the code does not read.

⚠ **What A2's fix does NOT close, stated plainly:** a `dbus` entry with **no** instance still
reaches all three panels, and bus-wide-versus-`gpu-fan-control` remains indistinguishable (A8).
Both panels' comments say so at the call site.

---

## 4. Verification

```
$ pnpm verify
 Test Files  93 passed (93)
      Tests  2594 passed (2594)      (2587 + 7 new)
Type Errors  no errors
```

**Harnesses re-run: step 5 and step 10 — and only those.** The files this phase touched that are
in a harness's `LEDGER_FILES` are `lib/collectors/serving.test.ts` (step 5) and
`components/panels/{serving,cooling,safety}-panel.test.tsx` (step 10). **Step 8 was not re-run
and did not need to be**: nothing under `lib/client/` was touched, `wire.ts` and
`observations.ts` are byte-identical to the tree this phase was handed.

```
$ python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
Red-test ledger: 190 distinct failing tests across 130 mutations; 100 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 130 regressions failed their check, as they must.            [exit 0]

$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 181 distinct failing tests across 138 mutations; 163 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 138 regressions failed their check, as they must.            [exit 0]
```

Run as **one sequential foreground pair in a single call** (ANCHOR §9 — no wait loop was written,
and none was needed). Step 5 went 128 → **130** (`10b-SG1`, `10b-SG2`), step 10 133 → **138**
(`10b-SG3`…`10b-SG7`). Every new mutation bit, each reddening its own new test:

| mutation | red tests |
|---|---|
| `10b-SG1` / `10b-SG2` | 1 each — *the two DIRECTORY-level `llama-env` entries carry no instance* |
| `10b-SG3` | 1 — COOLING's *a dbus entry that names an llama-server instance never explains THIS fan service* |
| `10b-SG4` | 1 — SAFETY's equivalent |
| `10b-SG5` | 2 — *an ATTRIBUTED entry renders on its row and never again as a panel note*, plus the orphan test's second half |
| `10b-SG6` | 3 — the pre-existing *collector-wide … renders once* test, the orphan test, and *an entry whose MESSAGE names an instance but has no `instance` field* |
| `10b-SG7` | 1 — *serving: null and serving: [] still show an instance-tagged entry* |

⚠ The **cooling** test asserting a `dbus` entry with NO instance still explains the fan-service row
is covered by the pre-existing `10b-SR3` (StatusRow's second note slot), which is why no eighth
mutation was added: the ledger run confirms it, rather than a claim in this document.

`git status --short` was checked after each run for a stranded mutation.

---

## 5. Spec questions for the owner — invariant 7

None of these were decided here. Each names the code that stands today so the owner rules on a
real thing rather than on a hypothetical.

| # | Question | What the code does today | From |
|---|---|---|---|
| **S-G-Q1** | **When one source files several entries about the SAME instance, does the row show them all or the last?** §6.5 says *"its row shows the unit state and **the reason**"* — singular — and `errorFor` folds by source, so two `llama-env` problems for instance 1 render as one line and the other is on the page **nowhere**. `readEnv` files one entry per parse problem, so this is reachable, not theoretical | The **last** per source per instance. The row already joins **across** sources with ` · `, so joining within one is a two-character change if that is the ruling | A3 |
| **S-G-Q2** | **A `dbus` entry with no `instance` is two different facts.** A bus-wide connect failure blanks every `serving[].unitState` and SERVING must show it; `collectSafety`'s per-unit `gpu-fan-control.service` failure blanks nothing on SERVING at all. Nothing on the wire distinguishes them. Fixing it needs a second structural subject (which unit) on §4's error shape, or two distinguishable sources | Both render under SERVING's rows. §6.5's *"an alarm with no explanation is not actionable"* is satisfied; *"the explanation belongs to this figure"* is not | A8 |
| **S-G-Q3** | **Does §3.7 mean to constrain WHICH sources may carry an `instance`?** The build's 4-of-18 table is a judgement recorded in a document; the type is one flat interface, `tag()`'s parameter is on the shared minting helper, and `wire.ts` accepts `instance` on `ufw`, `coretemp`, `nvidia-smi` and `statvfs` alike. It is inert for the fourteen (they never route to SERVING) and live for the four | Enforced by **tests per path** — `10b-SF1` for `collectSafety`, `10b-SG1`/`10b-SG2` for `llama-env`'s two directory-level paths — which is the honest answer while the constraint is a judgement rather than a rule | A4 |
| **S-G-Q4** | **Must `serving[]`'s `instance` values be unique on the wire, and should `wire.ts` refuse a snapshot that repeats one?** `parseInstanceIndex`'s own docstring states the stake (two rows sharing one condition id; §9 dedupes and one instance silently vanishes from the count), and the **collector** guarantees it — but `wire.ts`'s stated purpose is not to trust the other side, and S-G made `instance` the sole join key, so a duplicate now also duplicates every attributed diagnostic under one React key | Validated per entry, never across the array. A duplicate renders twice | A7 |

Also still open from the build, unchanged: **`SPEC.md` does not say `instance` must be
non-negative**, and `wire.ts` matches `Gpu.index`'s permissiveness rather than inventing a floor.

---

## 6. What the next phase should know

- **The uncovered line A1 found was in a file with 133 mutations.** Not an untested file — an
  untested *line* in a tested file, on the only call site of a function whose other call site
  had a mutation. The ledger cannot see this: it proves every ⚠ test can fail, never that every
  branch has a ⚠ test. Q1-F4's cross-harness runner does not close it either. **The only thing
  that found it was reading the source for a second call site of the same function.**
- **Two of the eleven findings were a document contradicting its own code** (A3, A10), and a
  third was a document crediting a test that does not do what it says (A9). All three were
  written by the phase that also wrote the correct code. That is now four loops in a row.
- **`npx tsc --noEmit --exactOptionalPropertyTypes` exits 0 on this tree.** Whoever picks up
  A11's deferral does not need to budget for a migration today.
