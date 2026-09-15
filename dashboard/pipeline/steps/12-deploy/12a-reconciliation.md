# 12a — RECONCILIATION. **Every standing figure is now readable from a GREEN run, §11.4's ninth arm is closed at the parse rather than at the arm, and the eleven one-line reverts are 11 of 11 caught.**

**Written 2026-09-15 by the reconcile phase.** Nothing committed, nothing staged. `SPEC.md`,
`MOCK.html` and `INSTALL-SPEC.md` untouched. **No guard weakened** — every change below either
adds a refusal, adds a record, or makes an existing assertion narrower. Nothing was written to the
box; nothing was read from it either.

---

## 0. The headline, before the table

| | |
|---|---|
| ⚠⚠ **the finding that governed the loop** | **A passing record printed no numbers**, so `12a-test.md` §1.4's standing figures existed only in a run where the record had been deliberately broken. The printer is fixed at the general case — a fallback that prints any detail the nine curated lines do not know — and **every standing figure below is re-transcribed from the green run of 2026-09-15**. Four numbers that no passing run can reproduce are **struck**, not re-justified (§2.3) |
| `measure-breakpoints.mjs` | **exit 0 — 81 passed, 0 failed, 0 blocked** (was 67/0/0; **+14** records: measurements 17 and 18) |
| `pnpm verify` (cold, final) | **exit 0 — 108 files, 3500 tests, no type errors** (inherited 106 / 3455; **+2 files, +45 tests**) |
| the eleven one-line reverts | ⚠ **11 of 11 CAUGHT · 0 survive** (the adversarial measured 11 of 11 surviving). Applied one at a time to this tree, the named test file run against each, the file restored and the restore asserted byte-for-byte. §4 |
| §11.4's ninth arm | **closed at the PARSE, not at the arm**: one `marker_number` that refuses unless **exactly one** well-formed marker is present, used by both markers the probe now prints. 127/126 get their own diagnosis, the card list is counted, and the 0-255 bound the comment claimed is the bound written. §3 |
| the mirror guard | `lib/unsatisfiable-css-rule.test.ts` — **measured making exactly the finding `12a-A5` made by hand** (`.status[data-mode]` on `components/header.tsx`, twice) when the rule is re-created, and **zero findings** on the tree otherwise |
| the two new test files | `measurement-harness.test.ts` and `lib/unsatisfiable-css-rule.test.ts`, both in step 10's `LEDGER_FILES`, both backed by new mutations. **The browser harnesses and the shim were in NO harness's ledger and in no mutation anywhere until this loop** |
| ⚠⚠ **what the harnesses found in this loop's OWN work** | **Step 11's first run returned 1.** `12a-SH15` — delete the card-count marker from the probe — did not bite, because every guard row stubs `docker` wholesale and **nothing had ever executed the probe string itself**. Six tests now run it in a real `sh` against a fake `nvidia-smi`, three more mutations came with them, and the harness was re-run whole. §7.1 |
| the two harnesses | `10-panels-assembly` **exit 0 — 325 mutations, all bit, 335 ⚠ checked**; `11-packaging` **exit 0 — 203, all bit, 93 ⚠ checked** (second run). 528 anchors present exactly once afterwards |
| the box | not touched. No SSH, no read, no write |

**The sentence this loop earned**, and it is §0.15 of HANDOVER: *a PASS that prints no number is a
claim, and a number transcribed from a failed run is not evidence.* The corollary it also earned,
measured on this loop's own fix: *a text guard that reads a FILE cannot see one of several
identical lines removed* — §4.1.

---

## 1. The adjudication — all ten findings, eleven rows

| # | Verdict | What was done |
|---|---|---|
| **12a-A1** — 15 and 16 print NO numbers when they pass, and §1.4's figures came from the run where 15 FAILED | ⚠⚠ **ACCEPTED — the priority of the loop, and fixed at the CLASS rather than at the two records** | The printer was nine `if (detail && …)` blocks keyed on eight recognised detail SHAPES; a record whose detail matched none of them printed a bare `PASS`. Both records 12a added were exactly that. Fixed with a `say()` that records whether anything printed and **a fallback that prints the whole detail as JSON when nothing did** — so the curated lines are an optimisation, not a filter, and *"every future record added with a new detail shape is silently a bare PASS"* is structurally closed. The green run's own lines are in §2. Guarded by `12a-MH5`: delete the fallback and `measurement-harness.test.ts` goes red |
| **12a-A2** — §11.4's ninth arm: two `RC=` markers whose LAST is `0` scores a tick; 127/126 get the wrong fix; `nvidia-smi -L >/dev/null` discards the list | ⚠⚠ **ACCEPTED — all three, and generalised.** §3 | **(a)** `marker_number KEY TEXT MAX` is now the only parse: it requires **exactly one** occurrence of the marker, a 1-3 digit value **within range**, and normalises it to canonical decimal; zero markers, two markers, a truncated one, a non-numeric one and an out-of-range one all answer `nomarker` → the row's existing *nobody looked* arm. **(b)** `gpu:127` and `gpu:126` are the SHELL's statuses and now have their own row: *"nvidia-smi IS NOT RUNNABLE … a restart re-creates the container the same way and will not change it"*, pointing at the toolkit. **(c)** the probe prints `GPUS=` as well as `RC=`, counted with shell builtins only, and `gpu:0` with **zero** cards is a FAILING row naming the `gpus: []` shape. Twelve rows added to the guard table and **six tests that execute the probe itself** (§7.1); **nine new mutations** (`12a-SH11`…`SH19`), and `12a-SH2`/`SH3`/`SH9` re-aimed onto the new shape with their properties unchanged |
| **12a-A3** — the shim's absence fails loudly and names the WRONG cause; the spawned server's stderr is piped and never read | ⚠ **ACCEPTED — both halves, in one module shared by both harnesses** | `pipeline/steps/10-panels-assembly/server-log.mjs`: `attachServerLog` drains both streams into a **bounded** ring (which is the latent full-pipe hang, removed rather than left to be discovered), and `waitWithServerOutput` prints the tail **before rethrowing** — the harness still exits non-zero, but the line above the stack is now the server's own words. Wired into `measure-breakpoints.mjs` and `mocks/measure-arrangements.mjs`, and **also onto `waitForSelector('[data-slot="gpu0"]')`** — the exact line the four-day outage died on. One module rather than two copies, which is `12a-A4`'s lesson applied to `12a-A3`'s fix |
| **12a-A4** — the shim is a third, untethered producer of `/etc/ai-dashboard.env` | ⚠ **ACCEPTED — tethered at run time AND in the suite** | The shim reads `lib/auth/secret-file.ts` before installing any fake and **refuses to start** unless the declared literal is in it (the `unit_exec_start` shape the finding names). And `measurement-harness.test.ts` compares all **three** producers — `secret-file.ts`'s `SECRET_ENV_FILE`, the shim's, and `dashboard.sh`'s `ENV_FILE` default — in one test, which is the earlier and cheaper of the two alarms: the drift fails `pnpm verify` rather than the next browser run |
| **12a-A5** — `12a-Q10` confirmed, dated, and the ONLY unsatisfiable rule in the tree | ⚠ **ACCEPTED — the rule is removed (not re-spelled), and the mirror guard is written.** §5.1 has the reasoning for *removed* | `.status[data-mode='paused'\|'stale']` has never matched in any commit; removing it changes **no painted pixel** and removes a comment claiming a paint that does not happen. It is deliberately **not** re-spelled: `MOCK.html` renders a second pill rather than hatching this one, so *"make the rule match"* and *"match the mock"* are different changes and the choice is the owner's (`12a-Q10`, still open, now with both candidates written down where the rule was). `lib/unsatisfiable-css-rule.test.ts` is the mirror of `dangling-css-class.test.ts`, with a both-directions fixture and a population check — **measured: it reports exactly the historical defect when that rule is restored, and nothing otherwise** |
| **12a-A5b** — `panel-notes.tsx`'s module doc is false about its own callers | ⚠ **ACCEPTED — fixed, and widened by measurement** | The doc said *"GPU, CPU and SERVING take `'tight'`"*; `gpu-panel.tsx:193`/`:204` and **`serving-panel.tsx:151`** all pass `bound="roomy"`. Corrected to name the BRANCH rather than the panel, with the arithmetic that makes it consistent (a takeover draws no chart, so the well spends height the row already has) and a pointer to measurements 16-18, which now measure it |
| **12a-A6** — the "0…18 × 4 × 4 crossing" is two 2-D slices with `alarms` pinned at 0 | ⚠ **ACCEPTED — replaced with the product**, 912 points | 4 modes × 4 bands × 3 alarm counts × 19 failing counts, each asserted on **all three** returned fields — including `glyph`, which nothing in the tree asserted anywhere (a `BY_MODE` table with `paused` and `stale` swapped passed the whole sweep). The expectations are structural rather than a second copy of the function's string building, and the shapes the slices could not reach are pinned as literals — including the one the finding names: `live`, 0 alarms, no band, 3 unread → **`no readings · 3 sources unread`**. ⚠ The last bullet — nothing crosses `failingSourceCount(snapshot)` with `alarmCount`/`aggregateSeverity` from the SAME snapshot — is **DEFERRED with a reason**, §5.2 |
| **12a-A7** — measurement 16 asserts co-presence where it claims containment, and grades the easy half | ⚠⚠ **ACCEPTED — three of four gaps closed by measurement, the fourth in part** | **Containment:** `gpu0ReasonInWell`/`gpu1ReasonInWell` ask whether the message is inside a `roomy` well's own subtree, not whether both exist somewhere in the slot; `>= 1` is now **`=== 1`**. **Gap 1 (one card enumerated, one not):** new fixture and **measurement 17**, whose falsifiable term is `takeoverNoTallerThanCard` — the claim `gpu-panel.tsx`'s comment makes in prose. **Gap 2 (`gpus: null`):** new fixture and **measurement 18**, the last branch of `GpuPanel` no browser had rendered. **Gap 3 (a long message):** measurement 17's fixture carries a 180-character collector message. **Gap 4 (several entries):** it also carries **two** entries from one source, so the `+N more` path is on the page; the fade's own geometry is not separately asserted — §5.3 |
| **12a-A8** — measurement 16's three fit rows are near-unfalsifiable: the row caps convert overflow into clipping | **ACCEPTED as accurate — NARROWED by measurement, and the falsifiability is added elsewhere rather than by changing those rows** | The claim is right for the page it is about: measurement 18 (`gpus: null`) lands on the **identical** 245/221/277 px spare as 16, which is how far both all-takeover pages sit from the bound. It is **not** a property of takeover pages in general — measurement 17's mixed page measures 141/106/162 px spare and its no-clipping row lands **0.8 px** from gpu0's cap at 1600. The `.takeover { min-height: 400px }` break the adversarial used in R2 would now redden 17's `takeoverNoTallerThanCard` as well as the no-clipping rows, which is the falsifiability the finding asks for. 16's rows are left as they are: they are the anti-vacuity net for a page that cannot grow, and deleting them would remove a check that costs nothing |
| **12a-A9** — eleven one-line reverts stay green, four covered by literally nothing | ⚠⚠ **ACCEPTED — 11 of 11 now caught**, and the two uncovered REGIONS are closed, not the eleven lines. §4 | `measurement-harness.test.ts` (new, in step 10's `LEDGER_FILES`) tests the shim **behaviourally** in a real `node --require` and pins fourteen named terms of the two `.mjs` harnesses, each with the sentence describing what its removal loses. `packaging.test.ts` gains nine tests that **execute** both sibling scripts' `restart_ai_dashboard` against a stubbed systemd — the first test in this repository to read outside `dashboard/`, and the only coverage those two functions have. **Twelve new step-10 mutations** (`12a-MH1`…`MH11`, `12a-CSS1`: 313 → 325) and **twelve new step-11 ones** (`12a-SH11`…`SH19`, `12a-SL1`/`SL2`, `12a-GF1`: 191 → 203) |
| **12a-A10** — `rc` accepts 256…999 | ⚠ **ACCEPTED — folded into `marker_number`'s bound, and fixtured on both sides** | `(( ${#value} > 3 )) || (( 10#$value > max ))`. The guard table now carries **255 (a verdict)**, **256 (unknown)** and **1000 (unknown)**, which is the boundary the old comment claimed and nothing tested in either direction |

**Counts — 10 findings, 11 rows:**

| verdict | rows | which |
|---|---|---|
| **ACCEPTED and fixed in this loop** | **10** | A1, A2, A3, A4, A5, A5b, A6 (main), A7, A9, A10 |
| ACCEPTED as accurate, NARROWED, remedy elsewhere | 1 | A8 |
| DEFERRED with a named reason | 2 sub-items | A6's snapshot-level crossing (§5.2); A7's gap 4 geometry (§5.3) |
| REJECTED | **0** | — and §5 is where that is audited rather than asserted: three things the findings implied were NOT done, each with the reason |

---

## 2. ⚠⚠ The governing finding, and the figures re-transcribed from a GREEN run

### 2.1 What was wrong, and what the fix is

`measure-breakpoints.mjs`'s PASS printer was a whitelist of eight detail keys. Record 15's detail
is `{text, textWidth, headerHeight, oneRow, children, tops, dotSeverity, calibration}` and record
16's was `{gpu0Takeover … gpu0Sample}`; neither matched, so both printed a bare `PASS` line. The
numbers `12a-test.md` §1.4 quotes as standing appear verbatim in `breakpoints3.log`, **the run in
which record 15 FAILED** — the only way to read them was to break the record.

The fix is not two more `if` blocks. `say()` records that a line was printed, and anything the
nine curated lines did not print falls through to `JSON.stringify(detail)`. A FAIL has always
printed its whole detail; a PASS does now too.

### 2.2 The standing figures, all from `exit 0 — 81 passed, 0 failed, 0 blocked`

**Record 15 — 12a's status line at its ceiling** (hostile fixture, 1280×1024):

| | |
|---|---|
| the status text on screen | **`529 alarms · 18 sources unread`** |
| its width | **208.6 px** |
| the header | **43.0 px**, `oneRow: true`, **4** painting children, tops `[11.4, 10.1, 14.1, 10]` |
| the same header with a deliberately absurd status string | **98.1 px — wrapped** |
| the dot | **`alarm`** |

⚠ **`children: 4`, not 5.** The failing run quoted in the notes reported 5, because its metric
counted the zero-height `aria-hidden` spacer. The repaired metric filters on `height > 0`, so the
green run's 4 is the number that describes the header — and it is a second, independent reason the
old figures could not simply be carried across.

**Record 15's band, and §6.1 on the graded pages** — all reproduced:

| record | 1280×1024 | 1600×1024 | 1920×1080 |
|---|---|---|---|
| the sticky band vs `--band-reserve: 102` | **101.8** | **101.8** | **101.8** |
| 14 — the hostile page's spare | **28 px** | **4 px** | **36 px** |
| 16 — `gpus: []`, spare | **245 px** | **221 px** | **277 px** |
| 17 — one card enumerated, one not, spare | **141 px** | **106 px** | **162 px** |
| 18 — `gpus: null`, spare | **245 px** | **221 px** | **277 px** |

**Record 16 / 18 — the takeover cards:** every GPU slot **84 px**, against the **164 px** (1280) /
**176 px** (1600, 1920) a healthy card sets row 1 to on the degraded page (record 10). Both cards
draw the takeover, both carry the collector's sentence, and in each slot it is inside **exactly
one** `data-bound="roomy"` well.

**Record 17 — the mixed page**, which nothing had ever rendered: `gpu0Chart: 1`, `gpu0Takeover:
false`, **gpu0 187.5 px** and **gpu1 112 px** at 1280 — the enumerated card sets the row and the
takeover beside it is 75 px shorter, which is the claim `gpu-panel.tsx:190-192` makes in prose.
⚠ At 1600 its no-clipping row reports gpu0 **0.8 px** from its cap: the tightest clearance in the
project except measurement 11's cpu at 0.7 px, and worth knowing before anyone spends that page's
"spare".

**`check-density.mjs`: ALL PASS**, three viewports, every panel within 0.6 % of target except
SESSION EVENT LOG at **−3.0 %**, its standing figure. `measure-arrangements.mjs`: exit 0.

### 2.3 ⚠ The numbers that are STRUCK, because no passing run can reproduce them

`12a-build.md` §3.4 measured 12a's status string **by hand in a scratch page**, because the
harness could not log in that day. That page does not exist and no standing record measures those
strings, so under this loop's own rule they are struck rather than re-justified. The comment in
`lib/client/header-status.test.ts` that carried them now carries §2.2's table instead.

| struck | why it cannot be reproduced |
|---|---|
| `all healthy` **76.5 px**, `6 alarms` **55.6 px**, `1 source unread` **104.3 px** | no record measures those three strings; the harness measures the CEILING string on the hostile page |
| `paused · 6 alarms · 18 sources unread` **257.3 px** | the reachable ceiling on a graded page is `529 alarms · 18 sources unread` at 208.6 px. The 257.3 px string is producible by the function (`header-status.test.ts` pins it as the longest TEXT) but is not painted by any fixture |
| the wrap threshold **500.6 px** and **507.5 px / 71.8 px** one character past it | the harness's in-run calibration measures a **98.1 px** wrapped header, which is the falsifiability that number was quoted for; the threshold itself is not measured anywhere |
| *"243 px and 36 characters of margin"* | derived from 257.3 and 500.6, both struck |

**What survives from §3.4, and is now measured on every run:** the header is **43.0 px**, one row,
on the page carrying the widest clause the rule can produce — and `--band-reserve: 102` still holds
at 101.8.

---

## 3. §11.4's ninth arm, and why the fix is a parser rather than an arm

**The defect family, stated once.** Four before this one — a `docker inspect | grep` that scored a
false pass, drift rows whose expectation was the empty string, a marker that was not a verdict
(the eighth arm), and `${out##*RC=}`. Every one of them read a captured stream and believed the
first thing that looked like an answer. **None of them had an opinion about how many answers were
in the capture.** So the fix is one parser with that opinion:

```
marker_number KEY TEXT MAX  →  the value, or `nomarker`
    zero markers · two or more markers · a truncated value · a non-numeric value ·
    a value outside 0..MAX          →  nomarker  (= "nobody looked")
```

Measured, one real bash subprocess per case, with a stubbed `docker`:

| the container printed | mode | the row today |
|---|---|---|
| `GPUS=2` `RC=0` | gpu | ✓ *the container ran nvidia-smi and read 2 card(s)* |
| `GPUS=0` `RC=0` | gpu | ✗ **THE CONTAINER SEES NO CARDS** — the `gpus: []` shape, which used to score the tick |
| `GPUS=1` `RC=0` | gpu | ✓ *read 1 card(s)* — the count is read, not assumed |
| `RC=255` then `RC=0` | gpu | **? two that disagree** (was: ✓ *read the cards*) |
| `RC=0` then `RC=255`, and both on one line | gpu | ? two that disagree |
| `RC=127` / `RC=126` | gpu | ✗ **nvidia-smi IS NOT RUNNABLE** — *command not found* / *found but not executable*, naming the toolkit and saying a restart cannot help |
| `RC=127` | fallback | ✓ *is the fallback* — unchanged, and deliberately: INSTALL-SPEC §11.1's documented state must stay installable (§12.2) |
| `RC=` · `RC=oops` · `RC=256` · `RC=1000` · no `GPUS=` at all | either | ? nobody looked |
| `RC=255 and some container chatter` | gpu | ✗ *exited 255* — the status is read, the chatter is not |

⚠ **The consequence to state plainly, because it changes what `install` does on the box:** a
container that holds a device request and enumerates zero cards now FAILS `check`, and
INSTALL-SPEC §12.2 makes `install` fail on a failed `check`. That is the intent — it is the
production failure's own shape — but it is a box-visible behaviour change and is listed in §9.

The count is produced by the inner shell with **builtins only** (an `IFS`-split `for` loop, no
`grep`/`wc`): a missing external would make the marker unreadable, which `marker_number` reads as
*nobody looked* — fail-closed, but noisily, and there is no reason to accept that when a loop
costs nothing. `shellcheck dashboard.sh` stays clean (one `# shellcheck disable=SC2016` with its
reason: every `$` in the probe string is read by the CONTAINER's `sh`).

---

## 4. The revert sweep — 11 of 11

Each revert applied to this tree one at a time, the named test file run against it, the file
restored from its own text and the restore asserted (`path.read_text() == original`).

| # | the one-line revert | before | now | what catches it |
|---|---|---|---|---|
| 1 | shim: delete the `if (!hash \|\| !secret) throw` | survived | **CAUGHT** | 2 tests — the preload is run for real, with and without the variables |
| 2 | shim: delete every `fakeStat` field except `isFile` | survived | **CAUGHT** | the fake is asked `isDirectory()` and `size` in a real process |
| 3 | `:1819` drop `rects.length > 1 &&` | survived | **CAUGHT** | terms table |
| 4 | `:1850` drop `statusLine.dotSeverity === 'alarm' &&` | survived | **CAUGHT** | terms table |
| 5 | `:1853` drop the calibration's second term | survived | **CAUGHT** | terms table |
| 6 | 16's roomy-well term → `>= 0` | survived | **CAUGHT** | terms table (exact count) |
| 7 | drop `gpu1Takeover`/`gpu1ReasonInWell` from 16 | survived | **CAUGHT** | terms table (exact count) — see §4.1 |
| 8 | `serve-llm.sh` delete the whole `if (( DRY ))` block | survived | **CAUGHT** | the function is executed against a stubbed systemd |
| 9 | `gpu-fan-control.sh`, the same block | survived | **CAUGHT** | same |
| 10 | `dashboard.sh` accept a 5-digit "exit status" | survived (measured by the adversarial) | **CAUGHT** | the 255/256/1000 rows |
| 11 | the `NODE_OPTIONS` filter → a plain template | survived | **CAUGHT** | terms table |

### 4.1 ⚠ The correction this loop made to its own fix, and it is the second rule the loop earned

The sweep was run **four times**, and the first three are the finding:

| run | result | why |
|---|---|---|
| A | 9 of 11 | items 6 and 7 came back `ANCHOR AMBIGUOUS` — the sweep's own anchors matched twice, because measurement 18 carries the identical conjunction. The same ambiguity hit `12a-MH7` and was caught by the harness's own rule |
| B (anchors pinned to record 16) | 9 of 11 | **6 and 7 genuinely SURVIVED**: `measurement-harness.test.ts` asserted each term with a whole-file `toContain`, and measurements 16, 17 and 18 assert the **identical** six conjuncts — remove one of three copies and two remain |
| C (`count`, asserted with `>=`) | 10 of 11 | **7 still survived**, because the count was written as 2 and there are 3 |
| D (`count`, asserted with `toBe`) | **11 of 11** | — |

A file-level text guard cannot see one of several identical lines removed. The `Term` record now
carries an exact `count` (`3` for the takeover conjuncts, `2` for the roomy-well term, `4` for
`takeoverNoTallerThanCard`), asserted with `toBe`, not `toBeGreaterThanOrEqual` — which also makes
adding a fourth takeover record a deliberate edit here rather than a silent loosening. **Writing
the guard was not evidence it caught anything; running the sweep against it was.**

⚠ The same duplication bit `12a-MH7`'s anchor, which matched twice once measurement 18 existed —
caught by the harness's own `ANCHOR AMBIGUOUS` rule and pinned to measurement 16 by including its
record name, the way `10f-GP1` had to be pinned.

---

## 5. What was NOT done, and why — the rejections this table would otherwise hide

### 5.1 The paused/stale hatch was REMOVED, not re-spelled

`12a-A5` asks for the rule to be fixed. There are two ways to make it satisfiable and **both are
new paint**: stamp `data-mode` on `.status` as well (hatching the severity pill), or
`.status:has(.dot[data-mode='paused'])` (the same paint, different spelling). `MOCK.html` — which
ANCHOR §9 makes the source for FORM — does neither: it renders a **second** pill beside the
severity one. So *"make the rule match"* and *"match the mock"* are different changes, nothing in
`SPEC.md` requires a hatch, and inventing the first assertion of an unruled paint is what
invariant 7 exists to stop.

Removing the rule is therefore the only change that fixes the defect (the tree no longer carries a
selector nothing can satisfy) **without deciding the paint**. It changes no pixel, the intent is
kept in full where the rule was, and `12a-Q10` stays open with both candidates written down.

### 5.2 A6's last bullet — the snapshot-level crossing — is DEFERRED, with its owner

Nothing crosses `failingSourceCount(snapshot)` with `alarmCount(snapshot)`/`aggregateSeverity`
**from the same snapshot**: `header-status.test.ts` sweeps scalars, and
`collector-visibility.test.tsx` renders the shell with `severity: 'normal', alarms: 0` **pinned in
the fixture** rather than derived. Closing it means driving the real reducer
(`lib/conditions.ts` → `lib/client/runtime.ts`) from a snapshot and feeding its outputs to the
header — which is step 08's module under step 10's ledger, and a new fixture shape for a property
neither loop has stated. It is recorded here and in HANDOVER §9 rather than half-built: an
integration assertion invented by a reconciliation, with no one able to say what it should read in
the interesting corners, is the shape this project has twice had to delete.

### 5.3 A7's gap 4 — the fade's own geometry — is covered only as far as the page

Measurement 17's fixture files **two** `nvidia-smi` entries, one of them 180 characters, so the
bounded well is doing real work and the `+N more` path is exercised on the page. What is **not**
asserted is the fade's geometry in that well specifically (`hiddenMessageCount`, the marker's own
line). Measurement 15's `.rest` record already measures exactly that mechanism on the banner, and
`panel-notes.test.tsx` measures the count in jsdom; a third derivation of a guarded fact is what
HANDOVER §0.8 tells this project not to build. Recorded, not built.

### 5.4 Measurement 16's fit rows were left alone

See the A8 row: they are accurate, they are the anti-vacuity net for a page that cannot grow, and
the falsifiability the finding wants is now carried by measurement 17's own term. Deleting them
would remove a check that costs nothing and reads as a weakening.

---

## 6. ⚠ For the parent: §9 row 1, the wording (this file does not edit `SPEC.md`)

**Why it needs amending at all.** §9 row 1 defines the header dot as *"one reduction over each
condition's `displaySeverity`"*. After 12a the painted dot is that reduction **except** when the
reduction is `normal` and any §3.7 source failed to be read, in which case it paints no band. The
choice is right and its precedents are §6.2's own (S-A, and 10b-S-F one level down); the sentence
is what is now false.

**The sentence we would like row 1's Resolution cell to become:**

> **One reduction over each condition's `displaySeverity`** (§6.4) — the debounced band after
> standing suppression — **with one refusal on top of it: a `normal` reduction is painted as no
> band while any §3.7 source failed to be read**, and the number of those sources is named in the
> text beside it. `watch` and `alarm` are never lowered, so a failing collector can never hide an
> alarm. A suppressed standing condition is neither red nor counted — its truth is named in its
> SAFETY row instead. The count is **omitted when zero**, so the header reads `● all healthy`,
> never `0 alarms`. **Paused/stale is a mode shown alongside it, never instead of it.**

**And the Because cell:**

> Reducing over `displaySeverity` is what keeps the dot, the count and the banner from ever
> disagreeing. The refusal is the same law one level up: a reduction computed only from readings
> that EXIST paints green over a machine that has stopped being able to look — §6.2's ruling of
> 2026-09-14 fixes what the header SAYS in that state, and this fixes what it PAINTS, so the two
> cannot disagree three pixels apart. A mode that hid the count would be a lying dashboard.

**If the parent rules the other way** — the dot keeps the raw reduction and paints `normal` green
beside `2 sources unread` — the tree changes in five places and no further:

1. `lib/client/header-status.ts`: one line (`severity: failing && severity === 'normal' ? null :
   severity` → `severity`), and the `AggregateStatus.severity` doc paragraph that explains it.
2. `components/header.tsx`: `data-severity={status.severity ?? 'none'}` may go back to the
   `severity` prop; the ⚠⚠ 12a comment above it goes with it.
3. `lib/client/header-status.test.ts`: the band-crossing expectation, property 3 of the new
   912-point crossing, and the `12a-HS*` fixtures that assert the downgrade.
4. `components/header.test.tsx`: the two `data-severity` assertions and their negative pair.
5. Nothing else — verified: `app/dashboard-shell.tsx:221` is the only consumer of
   `state.severity` and `components/header.tsx:176` the only `data-severity` the header stamps.
   No title, favicon or body class reads it. `12a-HS5`'s watch/alarm invariance and record 15's
   `dotSeverity === 'alarm'` term hold under either ruling.

It is a cheap reversal, and that is worth saying: nothing structural was built on the choice.

---

## 7. Run log — every command, with its exit code

⚠ **Strictly serial.** No two harnesses were alive at once, `pnpm verify` never ran beside one,
and nothing was polled with `pgrep` — each long run was started once and waited on by its own
completion, and the waits never named the harness's command line (ANCHOR §9's five-hour trap).

| # | command | result |
|---|---|---|
| 1 | `pnpm verify` (cold, mid-loop) | **exit 0** — 108 files, 3494 tests |
| 2 | `node …/measure-breakpoints.mjs` | **exit 0** — **81 passed, 0 failed, 0 blocked** (was 67/0/0). Log: `…/scratchpad/breakpoints-r1.log` |
| 3 | `node …/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json` | **exit 0** |
| 4 | `node …/mocks/check-density.mjs <json>` | **exit 0 — ALL PASS**, three viewports. ⚠ Its first invocation exited **2** with a usage line — it takes the arrangements JSON as an argument and had been given none; that is the tool refusing, not a failure |
| 5 | the eleven-revert sweep, run twice | **9 → 11 of 11 CAUGHT.** §4.1 is what the two runs between them found |
| 6 | `shellcheck dashboard.sh` · `shellcheck ../gpu-fan-control.sh` | **both clean** (0.11.0). `shellcheck ../serve-llm.sh` prints **5 SC2015 info notices, 5 before this loop and 5 after** — measured against `git show HEAD:serve-llm.sh`, which is also the correction `12a-test.md` §8 makes to the build's "6" |
| 7 | `python3 pipeline/steps/10-panels-assembly/regressions.py` | **exit 0 — 325 mutations, all bit** (was 313); **502 distinct failing tests; 335 ⚠-marked tests checked, every one reddened** (was 326). Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero unmatchable ledger keys |
| 8 | `python3 pipeline/steps/11-packaging/regressions.py` — **first run** | ⚠ **exit 1 — 200 mutations, 199 bit, `12a-SH15` DID NOT BITE.** §7.1. Not a false alarm and not re-aimed away: the harness had found a real hole in this loop's own work |
| 9 | `pnpm vitest run packaging.test.ts` (after the six probe tests) | exit 0 — 100 tests |
| 10 | `python3 pipeline/steps/11-packaging/regressions.py` — **second run** | **exit 0 — 203 mutations, all bit**; 94 distinct failing tests across 203; **93 ⚠-marked tests checked, every one reddened** (was 85) |
| 11 | `pnpm verify` (cold, final) | **exit 0 — 108 files, 3500 tests, no type errors** — the tree the parent reviews |
| 12 | the shim moved aside, `measure-breakpoints.mjs` re-run | **exit 1**, and the message is `12a-A3`'s fix doing its job — §7.2 |
| 13 | the anchor check, AFTER both runs | **528 anchors across the two harnesses, each present exactly once** — zero stranded mutations |
| 14 | `git status` | §8 |

### 7.1 ⚠⚠ The harness found the hole this loop left in its own §11.4 work

`12a-SH15` deletes the `GPUS=` half of the probe's `printf` — the marker that carries the card
count, which is the whole of `12a-A2`'s third defect — and **no test noticed.** The reason is
exact: every row of the guard table stubs `docker` wholesale, so the string the container actually
executes had never been executed by anything. **The scoring was measured and the PRODUCTION of the
markers was not** — the same shape as every other finding in this loop.

The response is not to re-aim the mutation. Six tests now run the probe in a real local `sh` with
`docker exec <name> sh -c <script>` wired to run that script, and a fake `nvidia-smi` first on
`PATH`: two cards → `0 2`; the 2026-09-14 failure → `255 0`; **`gpus: []` → `0 0`**; no binary at
all → `127 0`; a MIG line is not counted as a card; and the probe reaches for no external at all
(`grep`, `wc`, `awk`, `sed`, `cut`, `tr`, `head`). Three more mutations came with them —
`12a-SH17` (count every line), `12a-SH18` (throw the list away at the source), `12a-SH19` (count
with `grep -c`, which is correct here and unrunnable in an image that carries only `sh`) — and
each was applied by hand and measured reddening exactly its own tests before the harness re-ran.

⚠ **Two ledger defects of this loop's own were caught in the same pass**, both by the harness's
own diagnostics rather than by reading:

1. **Three new `test.each` names put `%s` FIRST.** Every harness keys a ⚠ mark by
   `name.split('%')[0]`, so the key was the marker alone — a substring of every ⚠ FAIL line,
   which scores the mark covered without any mutation touching it (10g-A7). The placeholder is
   last in all three now, and `marked_tests()` reports **0 unmatchable** in both harnesses.
2. **A comment between `test.each(…)(` and the name made the mark invisible.** The scanner reads
   the first string literal after the argument list and does not skip comments; it printed
   `a test/it call the ⚠-scanner cannot read` rather than dropping the mark silently, which is
   Q1-F3's diagnostic doing exactly what it was added for. Both comments moved above the call.

### 7.2 `12a-A3`'s fix, measured the way the finding was

With `secret-file-shim.cjs` moved aside, the adversarial's R4 produced exactly one line —
`Error: server did not come up at http://localhost:39173/login within 60000ms` — naming a port.
The same run now prints the spawned server's own output first, and the first line of it is the
cause. The file was moved back and compared byte-for-byte.

---

## 8. The tree

`git status` at the end of this phase — **nothing committed, nothing staged, `HEAD` still
`4a2f47a`**, and no file was ever `git add`ed or `git checkout --`'d.

| | |
|---|---|
| modified (13) | `app/collector-visibility.test.tsx`\*, `components/header.module.css`, `components/panels/panel-notes.tsx`, `dashboard.sh`, `lib/client/header-status.test.ts`, `lib/client/header-status.ts`\*, `packaging.test.ts`, `pipeline/HANDOVER.md`, `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`, `…/mocks/measure-arrangements.mjs`, `…/10-panels-assembly/regressions.py`, `…/11-packaging/regressions.py`, plus `../serve-llm.sh` and `../gpu-fan-control.sh` outside `dashboard/` |
| new (7) | `measurement-harness.test.ts`, `lib/unsatisfiable-css-rule.test.ts`, `pipeline/steps/10-panels-assembly/server-log.mjs`, `…/secret-file-shim.cjs`, and the three phase notes (`12a-test.md`, `12a-adversarial.md`, this file) plus the two handoffs |
| untouched | `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md`, everything under `systemd/`, `Dockerfile`, `.dockerignore`, and every production module in the auth path. `next-env.d.ts` is clean — each harness run restored it by writing `HEAD`'s bytes back |

\* inherited from the TEST phase; this phase did not change either file's behaviour.

⚠ **`git diff --stat` taken DURING a harness run shows the harness's own in-flight mutation** —
one was observed on `systemd/ai-dashboard.service` while step 11's run held it mutated. That is
10f's documented trap, and the status above is from a quiet tree.

---

## 9. Owner questions this loop leaves

| # | Question | State |
|---|---|---|
| **12a-Q2** ⚠⚠ (amended) | §9 row 1 defines the header dot as *"one reduction over each condition's `displaySeverity`"*, and 12a's painted dot is no longer exactly that | **The choice stands and is measured; the SENTENCE is false.** §6 above quotes the replacement we would like row 1 to become, and names the five places the tree changes if the parent rules the other way. A phase may not write it |
| **12a-Q10** ⚠ | §6.2's paused/stale hatch has never painted: `.status[data-mode=…]` could not match, and the rule was born dead | **The dead rule is REMOVED** — no pixel changes — and both candidate spellings are written down where it was. What to paint, if anything, is unruled: `MOCK.html` renders a **second** pill rather than hatching this one, so "make the rule match" and "match the mock" are different designs |
| **12a-Q11** ⚠ NEW | A container holding a device request that enumerates **zero** cards now FAILS `check`, so `install` refuses on such a box (INSTALL-SPEC §12.2) | Deliberate: it is the `gpus: []` shape and the row exists to catch exactly it. Named because it is a **box-visible behaviour change** an operator meets during an install, and INSTALL-SPEC §11.4 does not say what that state is |
| **12a-Q1** | `unread` collides with the "unread messages" idiom | Unchanged by this loop. A one-line literal change plus fixtures if the owner prefers `not read` / `silent` |
| **12a-Q9** | `gpu-fan-control.sh`'s `install`/`uninstall` ignore `DRY_RUN` entirely | Unchanged. Only `restart_ai_dashboard` was fixed, and it is now executed by `packaging.test.ts`. The rest is a root-script loop |
| **12a-Q4** | *How should the browser harness authenticate under §5.1?* | **TAKEN by the test phase — candidate (a).** This loop tethered it (`12a-A4`) and tested it behaviourally. If the owner prefers (b), it is one file and one `NODE_OPTIONS` to delete |
| 12a-Q3, Q5, Q6, Q7, Q8 | unchanged by this phase | — |

### ⚠ One number the parent should see, which is not a question

Measurement 17's no-clipping row reports **gpu0 within 0.8 px of its cap at 1600×1024** on the
mixed page. That is the second-tightest clearance in the project (measurement 11's cpu is 0.7 px),
and it is on a page that has existed for one day. Nothing is over the bound and no promise is
broken — but the mixed page is where the next 1 px goes, and "245 / 221 / 277 px spare" on the
all-takeover pages is not headroom that page shares.
