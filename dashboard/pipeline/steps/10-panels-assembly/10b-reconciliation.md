# Step 10b — the nine panel bodies (RECONCILIATION phase)

**Written by the reconcile agent, 2026-09-08.** Branch `dashboard-frontend`, working dir
`dashboard/`. Fourteen adversarial findings adjudicated: **eleven ACCEPTED, one ACCEPTED IN PART,
two DEFERRED, none rejected outright** — plus three sub-items of F14 adjudicated separately
(one accepted, one deferred, one rejected).

⚠ **This agent's green is not the green.** `pnpm verify` exit 0 and the harness exit 0 are
reported below as claims for the parent to re-run (ANCHOR §8). Nothing was committed or staged;
`SPEC.md` was not touched; nothing outside `dashboard/` changed; `purity.test.ts` is unweakened
and still green over the enlarged `components/panels/`.

---

## 1. The adjudication table — all fourteen

| # | Verdict | Reason | What was applied |
|---|---|---|---|
| **F1a** COOLING's fan5 null-side assertion is satisfied by the chip glyph | **ACCEPTED** | Reproduced by the parent and re-reproduced here. `chip.tsx:75` renders `EM_DASH` for `severity === null`, so `expect(unreadHtml).toContain('—')` passes on the chip whatever the value cell says; `?? rpm(0)` printed **`fan 5  0 RPM`** with the file green. A test named for invariant 1 that did not check it, in the panel `PLAN.md` uses as invariant 1's own example | The assertion now reads the **fan5 row's value cell**: `expect(valueCells(rowContaining(unreadHtml,'fan 5'))).toEqual(['—'])`. Mutation `10b-CO6` makes it permanent |
| **F1b** fan1–4 have no null fixture at all | **ACCEPTED** | Confirmed: the only null-side coverage was `emptyState()`, a different branch. `?? rpm(0)` on fan 2 renders a **fabricated red alarm** — the mirror failure, and worse than the first because it invents an alarm rather than hiding one. "Every boundary guard needs a fixture on both sides" is this project's own structural rule | New ⚠ test *"an UNREAD fan2 renders — and does NOT alarm"*, asserting the value cell **and** the absence of `data-severity="alarm"`. Mutation `10b-CO7` (value **and** severity, the adversarial's own two-line diff) |
| **F1c** the four "fixed" panels are fixed on one field each | **ACCEPTED** | Confirmed by inspection: GPU `powerW`/`utilPct`/`smClockMHz`/`memUsedMiB`, CPU `cpuPct`/`loadAvg`, MEMORY `swapUsedGiB`/`memTotalGiB`, STORAGE `home.*`/`rx`/`tx` all took `?? <zero>` green. Fixing them one field at a time would leave the *next* row uncovered the day it is added | A **per-panel guard over every value cell at once**: with a snapshot whose collections were read and whose every reading is `null` (`allReadingsNull`), no value cell may contain a digit. One ⚠ test each on GPU, CPU, MEMORY, STORAGE, COOLING and SERVING. Backed by `10b-GP3`, `10b-CP4`, `10b-MP4`, `10b-SN4` — the adversarial's own four mutations, now permanent |
| **F1d** `10b-build.md` and `10b-test.md` assert coverage that does not exist | **ACCEPTED** | Read `10b-CO2`/`CO3` against the code: both are `severity={…}` → `severity={null}`, which deletes a **band** — the *zero* side. Neither touches a `?? null` fallback. Both notes describe them as the null-vs-zero pair | Both notes carry a **⚠ CORRECTION** block naming the false sentence, quoting the mutations, and pointing at the mutations that now do back the claim. The claims are struck through, not deleted |
| **F2** SERVING attaches `errors[0]` to every instance row | **ACCEPTED** | Rendered from the *shipped* fixture: healthy `llama-server@0` carried `connect ECONNREFUSED 127.0.0.1:8081`. §6.5 says the reason goes on **its** row and *"the other instance is unaffected, and that is a structural requirement"*. It also **dropped** every entry after the first | An entry reaches a row only when its message names that instance — the unit name (`lib/units.ts`'s `servingUnitName`, not respelled), the `<i>.env` path, or the port. Last **per source**, so a `dbus` and a `llama-health` entry about one instance both survive. Entries naming no instance render once under the rows. Mutation `10b-SV4` |
| **F3** `note={age ?? error}` discards the cause exactly when there is one | **ACCEPTED** | The two co-occur precisely when a source dies. Verified: the identical snapshot without the staleness renders the message; with it, `no hwmon named dell_smm` appears nowhere on the panel. §3.7: *"an alarm with no explanation beside it is not actionable"* | `StatusRow` gains a second, always-muted `detail` slot (its own file, this loop's to own). Five call sites: COOLING ×2, SAFETY ×4, STORAGE, SERVING. Mutation `10b-SR3` deletes the slot and reddens five test files |
| **F4** a stale row blanks a value §6.5 says must stand | **ACCEPTED** | Checked against §6.5's actual words as the handoff asked — it is **bold, twice**: *"A stale condition shows its LAST VALUE, unchanged — not an em dash."* And `alarm-banner.tsx:71,81` renders `lead.value`, so banner and row printed **two different numbers for one condition in one frame** | `staleValueOr(condition, current)` in `condition-lookup.ts`, applied to the four rows that can structurally go stale. ⚠ It substitutes **only for an em dash** — a present reading always wins, because "unchanged" describes a value nobody could re-read. Mutations `10b-CL3`/`10b-CL4` |
| **F5** eight of eighteen error sources have no rendering path | **ACCEPTED IN PART** | The *rendering-path* half is real and is a §6.5 violation: `observations.ts` splits CPU's four sources and MEMORY's one **by the figure each blanks**, and its own doc says `collectHost` files nine sources for one crash *"precisely so this split is possible"* — for a consumer that then never called `errorsForPanel`. The *granularity* half is **rejected as a defect**: `errorsForPanel`'s doc settles it (*"granularity is per source, not per figure"*), so COOLING attaching `dell-smm` once is correct and fans 1–4 being silent is "one fact, stated once" | CPU: `coretemp` → temperature row, `proc-stat` → utilisation, `proc-loadavg` → load average, `proc-cpuinfo` → under the rows (it blanks the subtitle, which has no note slot). MEMORY: `proc-meminfo` once. STORAGE: `proc-net-dev` → rx row, `statvfs` once beneath both bars. GPU: `nvidia-smi` now also renders on the **non**-takeover branch. New `PanelNotes` component + tests. Mutations `10b-CP5`, `10b-CP6`, `10b-MP5`, `10b-SN5`, `10b-SN6`, `10b-PN1`. **The remaining question — may a source repeat beside each figure it blanks? — is spec question 10b-S-H** |
| **F6** `10b-CO5` guards three substrings, not the ruling | **ACCEPTED** | Reproduced: a fallback with different words (`'channel 5 is not reporting a tach'`) passed the file's 11 tests. The ruling is *"no fallback sentence written in the panel, at all"* | The ⚠ test now asserts the **shape**: with neither a stale age nor an `errors[]` entry, the fan5 row carries **no note element** (`not.toMatch(/class="_note/)`). `10b-CO5` was re-aimed to inject the adversarial's own differently-worded sentence, so the guard is proven against the wording it used to miss |
| **F7** a GPU absent from a read enumeration prints a served model | **ACCEPTED**, with a spec question | §6.2 names the failure mode by name. And absent rendered **byte-identically** to present-with-all-nulls, collapsing the *retired* / *stale* distinction §3.1/§9 spend paragraphs on. §6.5 does say *"absent from a collection that was read → the subject has left the machine, and that is an answer"*, so a distinct rendering is spec-directed even though the **wording** is not | A third branch: `absent = snapshot !== null && gpus !== null && gpu === null` renders `card not enumerated` and no served-model row. Two ⚠ tests, including a byte-inequality assertion against the all-null card. Mutation `10b-GP4`. **Wording is spec question 10b-S-E** |
| **F8** the promoted chart draws a fictitious axis before the first poll | **ACCEPTED** | `panel-chart.ts`'s own doc claimed a domain ending at epoch 0 draws an empty axis; `StackedTimeSeriesChart` only recognises `domainEndMs <= domainStartMs` as empty, so `0 − windowMs → 0` is an ordinary half-hour. Sibling-case defect: `Sparkline` was right all along | `chartDomainOf` returns `{0, 0}` for an empty ring — reusing the primitive's **existing** empty branch, no new copy, one line. The doc is rewritten to say what is true. ⚠ The old test *"an empty ring still returns an ordered domain"* **asserted the defect in its own words** and was replaced, not deleted, with the correction recorded in the file. Mutation `10b-PC1` |
| **F9** the two S-B strings are held together by a doc comment | **ACCEPTED** | Parent-confirmed: renamed to "last seen", **2483/2483 green**, banner still saying "last read" | A source-text guard in `condition-lookup.test.ts` extracts the template from **both** files (via `lib/source-text.ts`'s `codeOnly`, so a doc comment cannot satisfy it) and asserts they are the same sentence. ⚠ **No `app/` change** — the guard reads the file rather than importing it, which keeps 10a's committed `dashboard-shell.tsx` and its `10a-DS15` anchor untouched. Mutation `10b-CL2` runs the adversarial's exact drift |
| **F10** panels read the first `errors[]` entry; `events.ts` reads the last | **ACCEPTED** | `errorsForPanel`'s own doc names the hazard, and multi-entry-per-source is routine today (`collectStorage` concatenates both mounts' `statvfs`; `collectCooling` folds a `problems: string[]`). Two sentences for one fault in one session is HANDOVER §0.3's `since 15:10:40` failure in a new place | Every panel-side lookup is `findLast` (COOLING ×2, SAFETY, STORAGE ×2, CPU); SERVING is last-**per-source**. Mutation `10b-CO9`. **No `lib/` change** — the panels moved to the log's convention, not the reverse |
| **F11** MEMORY/STORAGE/COOLING show a green ✓ over an em dash | **DEFERRED — owner, as spec question 10b-S-F** | Real and reproduced, and the adversarial is right that it may be a spec question rather than a defect. §9's sentence *"a dashboard that goes green because it stopped being able to look"* is written about **the aggregate**, which is protected by conditions (a stale condition keeps its band and its place in the count). A **panel** chip is not the aggregate, and §6.3 has no rule for a mixture. The alternative — no-band whenever any input is unreadable — costs a panel its alarm colour the moment one unrelated field fails, which is a worse failure in the other direction. **Not a change to make on a reconciler's judgment**; it changes what every panel head means. Interim behaviour is `worstSeverity` over the bands that exist, which is what §6.3 literally supports |
| **F12** `index` and `panelId` are independent and nothing ties them | **ACCEPTED** | `<GpuPanel panelId="gpu1" index={0} />` typechecked and rendered GPU 0's card, titled `GPU 0`, into the `gpu1` slot with correct unique ids — nothing collides, nothing goes red. The wiring diff 10c has to write is exactly where it would be mis-typed | `GpuPanelProps` narrows `panelId` to `'gpu0' \| 'gpu1'` and **derives** `index`; the prop is gone. An illegal mount is now a compile error and the pair cannot disagree. Mutation `10b-GP5`. ⚠ **10c's wiring is `<GpuPanel {...props} />` with no `index`** — recorded in HANDOVER |
| **F13** the session log's accessible name stutters | **ACCEPTED** | `session-event-log session event log` — `panelId` is the SVG-id namespace (`panel-props.ts`), not a display string, and no other panel puts it in visible text. One line, and the test had locked the stutter in | `aria-label="session event log"`. The test now also asserts the stutter is **absent**. Mutation `10b-SE3` re-introduces a prefix |
| **F14a** SERVING composes one row value from four formatter outputs (`:—  ·  —  ·  ctx —`) | **REJECTED as a violation; the cosmetic recorded** | No rule is broken: `Row`'s contract is that `value` is pre-formatted and rendered verbatim, and O14 forbids **splitting** a formatter's output, not concatenating whole ones — the same call `memory-panel.tsx` already documents for its GiB pairs. `:${formatPort(null)}` reading `:—` is ugly, not wrong, and changing it means inventing a composition rule §6.6 does not state | Nothing. Recorded in HANDOVER as a copy nit for the owner |
| **F14b** at 1280–1599px the GPU/CPU traces cannot hatch a gap | **DEFERRED — 10c, with L9** | Correct: `Sparkline` takes no `gaps` prop by design, so HANDOVER's *"hatch `state.gaps`, never a hole in a series"* holds only above 1600px. But the fix is either a new prop on **step 9's** primitive or a different primitive at the design breakpoint — both are sizing/primitive decisions, which is exactly L9's open question, and 10c owns L9 and the browser pass that would show which |
| **F14c** `describeEvent`'s `stale` branch interpolates `detail` unguarded | **ACCEPTED** | Its two siblings guard it; `describeEvent` is a total function of an **entry**, not of what `events.ts` emits this month, and the inconsistency is what makes the next reader guess which branches are safe. It is directly testable at the unit boundary even though the adversarial could not construct it from `events.ts` | `stale` **and** `reading-returned` (the same shape, one branch over — the sibling-case rule this project keeps paying for) now guard an empty detail. Mutations `10b-ES7`/`10b-ES8` |

---

## 2. The root cause the parent asked about: is the fix per-finding or a guard?

**Both, and the guard is the part worth carrying forward.** The third document-wide `toContain`
to be found inert (10a's `paused`, its test phase's `refresh`, now `—`) is not three accidents.
The shape is: *assert over the document, name the row*. It passes as soon as **any** element on
the page contains the needle, and a panel is full of elements that innocently do.

Three things were done rather than one:

1. **Per-finding**, on the two the adversarial executed (F1a's fan5 row, F1b's fan 2 row) — those
   assertions now read a value cell.
2. **A guard over the property, not the sentence**: `valueCells(html)` in `test-support.ts`
   extracts every `class="_value…"` span, and each panel has one ⚠ test saying *with every reading
   null, no value cell prints a numeral*. That covers ~30 readings across six panels in six tests
   and, crucially, **covers a row added tomorrow** — which per-field tests never do.
3. **The rule written where the next reader will hit it**, in `valueCells`'s own doc:
   *assert over the element that carries the claim, never over the document that contains it.*

**What is NOT done, and is 10c's**: a mechanical guard that *forbids* the shape — e.g. a
source-text check that no `components/panels/*.test.tsx` calls `toContain` with a bare `—` on a
whole-document string. It belongs to 10c for two reasons. It is a **cross-cutting test-quality
guard**, which is precisely Q1-F4's family (already 10c's), and a source-text guard over test
files is exactly the kind ANCHOR warns must be paired with something behavioural — the behavioural
half is the six guards above, and they should exist for a while before a lint is written against
their shape. Recorded in `HANDOVER.md` §9 as **10b-F1-guard**, owner 10c.

---

## 3. What changed, file by file

**Production (`components/panels/`, all new this loop, none of it committed):**

| file | change | finding |
|---|---|---|
| `panel-chart.ts` | empty ring → `{0,0}`; the false doc paragraph rewritten | F8 |
| `condition-lookup.ts` | `+ staleValueOr` | F4 |
| `status-row.tsx` | `+ detail` slot, always muted | F3 |
| `panel-notes.tsx` + `.module.css` | **new** — §6.5's panel-level explanations | F5 |
| `cooling-panel.tsx` | `findLast`; fan5 + fan service take `staleValueOr`, `note`/`detail` split | F3 F4 F10 |
| `safety-panel.tsx` | `findLast`; four rows take `detail`; fan service takes `staleValueOr` | F3 F4 F10 |
| `storage-network-panel.tsx` | `findLast`; link row as above; `proc-net-dev` on rx; `statvfs` in `PanelNotes` | F3 F4 F5 F10 |
| `cpu-panel.tsx` | `errorsForPanel` for the first time — three rows + `PanelNotes` | F5 F10 |
| `memory-panel.tsx` | `errorsForPanel` for the first time — `PanelNotes` | F5 |
| `serving-panel.tsx` | per-instance attribution; unattributed entries in `PanelNotes`; `detail` | F2 F3 F10 |
| `gpu-panel.tsx` | absent-card branch; `panelId` narrowed and `index` derived; `PanelNotes` | F5 F7 F12 |
| `session-event-log-panel.tsx` | `aria-label="session event log"` | F13 |
| `event-sentence.ts` | `stale` and `reading-returned` guard an empty detail | F14c |

**Tests:** `test-support.ts` gains `valueCells` and `allReadingsNull`; ten test files gained
assertions; `panel-notes.test.tsx` is new. **`app/` and `lib/` were NOT touched** — see §5.

**Harness:** `regressions.py` gains `PANEL_NOTES_TEST` in `LEDGER_FILES`, two new `*_SRC`
constants, **24 new `10b-` mutations**, and **six re-aimed anchors** (`10b-CP3`, `10b-MP3`,
`10b-CO4`, `10b-CO5`, `10b-SP4`, `10b-SN2`, `10b-SV3`) whose target text this loop changed.

---

## 4. Verification — claims for the parent to re-run

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
pnpm verify                                                  # exit 0, twice
python3 pipeline/steps/10-panels-assembly/regressions.py      # exit 0
git status --short                                           # no stranded mutation
```

| | before this phase | after |
|---|---|---|
| `pnpm verify` | exit 0 · 91 files · 2520 tests | **exit 0 · 92 files · 2559 tests** (run twice, both green) |
| harness | 105 mutations · 121 ⚠ marks | **129 mutations · 150 ⚠ marks**, every mark reddened by at least one mutation |
| `DID NOT BITE` / `ANCHORS MOVED` / `ANCHORS AMBIGUOUS` | 0 | **0** (two `ANCHORS MOVED` were hit mid-work and re-aimed) |
| `git status --short` | `M SPEC.md`, `M regressions.py`, `?? components/panels/`, `?? pipeline/…` | identical |

⚠ **Two ledger traps were paid again during this phase, both already documented and both still
worth restating**, because a documented trap that recurs is a trap the process has not closed:

1. **The escaped-quote trap** (`10b-build.md` §6). Three new ⚠ test names were written as
   `'⚠ … instance 1\'s …'` and the harness reported all three **uncovered** despite the mutation
   visibly reddening them. Fixed by switching to double-quoted names. It is loud, as
   `10b-test.md` §1 correctly argued — but it cost a harness run to rediscover, which is that
   note's own recommendation (write it into `ANCHOR.md`) not having been taken. It is now in
   `HANDOVER.md` §5.2.
2. **A row-scoping helper that finds the header.** `rowContaining(html,'fan service')` returns
   the **subtitle** on SAFETY, whose subtitle is `ufw · pwm5 · dkms · fan service`. Same family
   as F1a one level down: a helper that names a row and returns whatever matched first.

---

## 5. Scope decisions — what was NOT touched, and why

- **`app/` and `lib/` are untouched.** F9 and F10 were the two findings that might have needed
  one. F9's guard reads `app/dashboard-shell.tsx` **as text** rather than importing or editing it,
  which also keeps `10a-DS15`'s mutation anchor intact. F10 was fixed by moving the **panels** to
  `events.ts`'s convention rather than moving `events.ts` — the log's last-wins fold is the
  documented behaviour and six panel call sites are the cheaper, more reversible side.
- **`SPEC.md` untouched**; four spec questions are recorded below for the owner.
- **`purity.test.ts` unweakened.** `PanelNotes` is a pure function of props like everything else
  in the directory; the guard's recursive walk covers it and is green.
- **No dependency added** (invariant 6).
- **The adversarial's could-not-break section was not re-spent**, per the handoff.

---

## 6. New gaps for the owner — four spec questions

Each is written the way ANCHOR §5 requires: a question, not a proposal, with what the code does
**today** so the owner rules on a real thing.

| # | Question | What the code does now | Owner |
|---|---|---|---|
| **10b-S-E** ⚠ | **What does a GPU panel render for a card absent from a `gpus[]` that WAS read?** §6.5 rules the *condition* (retired: "the subject has left the machine, and that is an answer") but §6.2 gives no panel wording, and §6.5's only GPU literal — `no GPUs enumerated` — is for the whole enumeration failing. The two are different facts and must not share a sentence | **`card not enumerated`**, as a body takeover, with no served-model row. Chosen to parallel §6.5's own literal one word out; rejected: rendering the ordinary body of em dashes (indistinguishable from a present card whose readings failed — the byte-identical case F7 measured) | **owner** |
| **10b-S-F** ⚠ | **May a panel's head chip read `normal` while one of that panel's own readings is `—`?** MEMORY with `RAM — / —` and a healthy swap shows a green ✓ over an em dash. §9's *"a dashboard that goes green because it stopped being able to look"* is written about the **aggregate**, which conditions protect; §6.3 says nothing about a panel head over a mixture | **Unchanged**: `worstSeverity` over the bands that exist, skipping `null`s. The alternative (no-band whenever any input is unreadable) costs a panel its alarm colour when one unrelated field fails | **owner** |
| **10b-S-G** ⚠ | **`errors[]` carries a `source` but no subject, so a per-instance reason can only be matched by reading the message text.** §6.5 requires *"its row shows the unit state and the reason"* for one `llama-server` instance while the other is unaffected — a structural requirement, per the spec's own words. §4's error shape cannot express it | Matched on the message: the unit name, the `<i>.env` path, or the port. Honest, tested, and **a heuristic**. The clean fix is an optional `instance`/subject on a `TelemetryError`, which is a §4 wire change | **owner**, then whoever owns §4 |
| **10b-S-H** | **When one source blanks several figures on one panel, is its message stated once or beside each?** `errorsForPanel`'s doc says granularity is per **source**; §3.7 says an alarm needs its explanation **beside it**. `dell-smm` blanks five channels and the mode; `statvfs` blanks both mounts; `proc-meminfo` blanks RAM and swap | **Once**, under the figures it blanks, matching COOLING's existing choice. Consequence, stated plainly: with `dell-smm` down, fans 1–4 read `—` with the message on fan 5 | **owner** |

---

## 7. Left open, with owners — every deferral repeated in `HANDOVER.md` §9

| item | owner | why it is not closed here |
|---|---|---|
| **F11 / 10b-S-F** — a green chip over an em dash | **owner**, then 10b/10c | Changes what every panel head means; not a reconciler's call |
| **F14b** — no gap hatching at 1280–1599px | **10c** | Needs a `gaps` prop on step 9's `Sparkline` or a different primitive at the design breakpoint — L9's question, and 10c owns L9 and the browser pass |
| **10b-F1-guard** — forbid the document-wide `toContain` shape mechanically | **10c** | Q1-F4's family (cross-cutting test-quality guard, already 10c's); the behavioural half exists now and should live a while before a lint is written against its shape |
| **F14a** — `:—` in SERVING's composite row value | **owner** | Cosmetic; changing it invents a composition rule §6.6 does not state |
| **Wiring** — the nine panels still have **no production call site** | **10c** | `dashboard-shell.tsx` renders nine `PanelPlaceholder`s; the swap is an `app/` change. ⚠ **`<GpuPanel {...props} />` now takes NO `index`** (F12) |
| **D1** — S40's third event-log feed | **10c / owner** | `LogEntryKind` is `lib/client/events.ts`'s; `event-sentence.ts`'s exhaustive switch will force the case the day it lands |
| **Q2-F9**, **Q2-S2**, **L9**, **L11**, **SCOPE 2.5f**, **10a-F17**, **10a-F4**, **Q1-F4** | as recorded | untouched by this loop |
