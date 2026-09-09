# 10f TEST — the deliverable

**Written by the TEST phase, 2026-09-09.** Fixing was in scope; **five fixes were applied** and each
is named below with the measurement that justified it. Nothing committed. `SPEC.md` and `MOCK.html`
are untouched. **No guard weakened.** `purity.test.ts`, `dangling-css-class.test.ts`,
`tocontain-scope.test.ts`, `unit-suffix.test.ts` and `cross-harness-ledger.test.ts` are byte-identical
to `HEAD` (checked with `git diff --quiet`); `components/styles.test.ts` carries the build's new rule
and **this phase did not touch it at all**. Every assertion this phase added is an addition.

**The build's headline claims reproduce.** `pnpm verify` exit 0 at 101 files / 2957 tests; the
three harnesses this item changed (`02`, `09`, `10`) re-run to the build's exact figures; 16/16
breakpoints; `check-density.mjs --fixture box` **byte-identical to the build's own final run**; and
the corrected row model verified against `grid.module.css` *and* against five measured slots. The
other six harnesses were not re-run — this phase changed no file any of them mutates, checked by
grep rather than assumed.

**Two things the build states are wrong, and one of them matters.** The 163 px worst case is not a
bound on *any* telemetry — it omits `.noteWatch`, and a row that is both stale and explained costs
**+39.1 px measured, not +20** (§6). And `roomy` shows three message lines, not four (§2).

---

## §1 — Priority 1: the five retirements and every re-aim

**All five retirements are sound; all fourteen re-aimed mutations and the one re-aimed test anchor
preserve their property; and every one was verified by running the harness and reading which test
went red** — never by reading the note written beside the mutation.

### The five retirements (step 9, all on the deleted `components/row.tsx`)

| retired | claimed successor | verified how | verdict |
|---|---|---|---|
| `09-R2` `severity === undefined` must not loosen to `== null` | `10b-SR2` | ran: reddens `⚠ severity={null} renders the explicit no-band chip, distinct from omitting it` | **UPHELD** — same wrong implementation, same property, on the component that inherited all seven call sites |
| `10e-R1` the value never becomes a pill | `10e-SR4` | ran: reddens the same `severity={null}` pill test | **UPHELD** |
| `10e-R2` the value ALWAYS becomes a pill | `10e-SR5` | ran: reddens `omitting severity renders no chip at all` | **UPHELD** — both directions of the branch, kept |
| `09-R1` the value is never reformatted | **ported** + `10f-SR1` | ran: reddens the ported `⚠ the value is never reformatted — an em dash passes straight through` | **UPHELD** |
| `09-R3` no self-invented §6.5 "already explained" exception | **ported** + `10f-SR2` | ran: reddens the ported `⚠ a detail renders even beside a value that is already an em dash` | **UPHELD, with one narrowing recorded below** |

I also read **every** test `row.test.tsx` carried — not only the ⚠ ones — against
`status-row.test.tsx`, because a retirement that drops an unmarked property drops it just as
completely:

| `row.test.tsx` | equivalent on `StatusRow` |
|---|---|
| `a plain fact row — no severity, no note` | `label, value and note all render` + `omitting severity renders no chip at all` |
| `⚠ the value is never reformatted` | **ported** (`10f-SR1`) |
| `omitted entirely when the prop is omitted` | `omitting severity renders no chip at all` |
| `⚠ severity={null} still renders a chip … not the same as omitting` | present, **including the exact `data-severity="none"` occurrence COUNT of 3** — the assertion 10e added after a `toContain` missed a dropped glyph |
| `a real band renders that band` | ⚠ **no exact twin.** Covered by `10b-SR2`/`10e-SR4`/`10e-SR5` and by every panel test that reads a row's band. Unmarked in the original; recorded, not a hole worth a test |
| `absent when omitted` / `absent when explicitly null or empty` | `a null/empty note renders no trailing note element at all` |
| `⚠ a note renders even beside an em-dash value` | **ported** (`10f-SR2`) |
| `rendered verbatim when given` | `label, value and note all render` |
| `⚠ 10e` × 3 (the pill branch) | `10e-SR4`/`SR5` and the `severity={null}` pill test |

⚠ **One narrowing, recorded rather than fixed.** `09-R3` was about `Row`'s **one** note slot;
`StatusRow` has **two** (`note`, `detail`) and the port aims at `detail`. That is the right analogue
— §6.5's *"already shown beside it"* exception is about the `errors[]` explanation, which is
`detail` — but nothing now mutates `{!shown(note) ? null :`, so the same invented exception written
on the `note` slot would go uncaught. `note` is S-B's stale age, which §6.5's exception does not
reach, so this is a real but small gap. Left as it is; naming it is the point.

### The re-aims — fourteen mutations plus `styles.test.ts`'s own anchor, all verified live

| id | subject moved because | verified: reddens |
|---|---|---|
| `09-CS1` | `row.module.css` deleted → `panels/status-row.module.css`, which carries the identical `.row`/`.end` `flex-wrap: wrap` pair with `flex-basis: 100%` on `.note`/`.noteWatch` | the file-scoped `flex-basis` guard, naming `panels/status-row.module.css`. Same two edits, same defect |
| `styles.test.ts` non-vacuity anchor | same file move | the property is identical and the list still has a real member; **not** a weakening |
| `09-C2` | `data-severity` is now guarded by `band` | `⚠ null severity renders data-severity="none", never "normal"` in `chip.test.tsx` **and** `panel-shell.test.tsx`. It also lost `ROW` from its red-test set — correct, that file is gone |
| `09-PU1` · `09-PU2` | `Chip`'s signature gained `band = true` | the purity guard, both hooks |
| `02-R20` / `R30` / `R31` | `formatUptime` gained `prefix` | ⚠ **read against `lib/format.ts:443-453` line by line**: each anchor is the SAME line, the SAME property, and `${prefix}` is the only text that moved. R20 still drops the `days >= 1` floor, R30 still deletes the sub-minute form, R31 still moves its boundary by one. Nothing spans more or less of the function than before. **Step 2's ledger runs: 272 red across 60, 22 ⚠ checked** |
| `10b-SR1` | the class ternary became a two-branch conditional | `⚠ noteTone="watch" renders the note under a DIFFERENT class` — the WATCH/muted distinction, intact |
| `10b-SR3` | the detail span gained the well's attributes | 12 tests across five files — the slot is still removed entirely |
| `10b-CO5` · `10e-CO1` · `10b-MP5` | the calls gained `bound="roomy"` | the S11/G5 test and MEMORY/COOLING's own explanation tests |
| `10b-SG7` | the takeover's bespoke `.map` became `PanelNotes` | the S-G takeover test **and** the new roomy test. Same property: the entries that explain WHY nothing enumerated are dropped |
| `10e-GP6` | the chip call gained `band=` and wrapped | `⚠ every throttle chip carries \`code\`` — `code` at the only call site in the tree |

**Mechanical checks, run over all nine harnesses rather than the three that changed:** **1083**
mutation ids, **zero** cross-harness collisions, **zero** within-file duplicates, and **every one of
the 1083 anchors occurs exactly once in the file it names** (re-derived by importing each
`regressions.py` and counting in the file, not by `grep`). Zero `ANCHOR NOT FOUND`, zero
`ANCHOR AMBIGUOUS`, zero `DID NOT BITE` in the three runs.

---

## §2 — Priority 2: the bounded wells, measured at zero, one and forty lines

**Measured in headless Chrome against the two module stylesheets read verbatim off disk**, in the
real cascade (`tokens.css`'s `body` 12px/1.35 mono, `panel-shell.module.css`'s `.body` flex column
gap 5px, a 285 px column). Script: `scratchpad/wells.mjs`.

| case | well height | content (`scrollHeight`) | scrolls? |
|---|---|---|---|
| `PanelNotes`, **0 messages** | **nothing rendered at all** — container 0 px, 0 children | — | — |
| tight, 1 SHORT message | **17.77** | 18 | no |
| tight, 1 LONG message (the DKMS text, wraps to 55 px) | **18** | 59 | **yes** |
| tight, **40** long messages | **18** | 2324 | **yes** |
| roomy, 1 long message | 59.06 | 59 | no |
| roomy, **4 SHORT** messages | **60** | **68** | **yes** ← FIX 1 |
| roomy, **40** long messages | **60** | 2324 | **yes** |
| `StatusRow`, no detail | row 23.0 | — | — |
| `StatusRow`, 1 detail | row **43.0**, well **14** | 66 | **yes** |
| `StatusRow`, **40** lines of detail | row **43.0**, well **14** | 2625 | **yes** |

**Bounded at 0, 1 and 40. The `max-height` holds in every case, and nothing is truncated** — the
content is there and scrolls, which is what §3.7 requires. Three corollaries worth keeping:

- **Zero lines renders literally nothing**, because `PanelNotes` returns `null` before the well
  exists. That is why `check-density.mjs --fixture box` is unchanged to the digit, and I confirmed
  that independently: my run of it `diff`s **byte-identical** to the build's own final run.
- **One explained row costs exactly +20.0 px** (23.0 → 43.0). This is the term SAFETY pays four
  times, and it is the number §6 rests on.
- **One DKMS message is 66 px of content in a 285 px column** — the build's 65.6 px, reproduced.

**Both wells carry all four declarations**: `max-height`, `overflow-y: auto`, `position: relative`
(10e-A1's containing-block rule) and `box-sizing: border-box`. `styles.test.ts`'s scrolling-box
rule sees **both** — its non-vacuity list went 3 → 5 and names `panels/panel-notes.module.css` and
`panels/status-row.module.css` explicitly. I checked the new `BOUNDED` regex against the three
shapes that are not a bound (`line-height`, `min-height`, `height: auto`) and it refuses all three;
it is written positively, which is the right call — the negative-lookahead form is defeated by
backtracking exactly as the comment says.

**No unbounded `errors[]` path is left in `components/panels/`.** Grepped every remaining `.message`
read: all of them reach the screen through `StatusRow`'s `detail` or through `PanelNotes`.

### `tabindex`: always, not only on overflow — and that is the right answer here

Both wells are `role="group" tabIndex={0}` unconditionally. A server render cannot know whether a
box overflows, so the choice was reachable-always or reachable-never, and §3.7 settles it. The cost
is smaller than it looks: **on a healthy page the wells do not exist at all** (zero messages renders
nothing), so no tab stop is added to the page anyone looks at 99 % of the time. The residual cost is
one tab stop on a one-line explanation that happens to fit. Recorded, not changed.

One small wart: when a row carries **both** `note` and `detail`, two adjacent groups get the
identical accessible name `` `${label} explanation` ``. Not wrong, not worth a spec question.

### ⚠ FIX 1 — `roomy` shows THREE message lines and part of a fourth, not four

Measured: a message line is **13.77 px** and `.notes`'s own `gap` is **3 px**, so four messages need
`4 + 4×13.77 + 3×3 = 68.1 px` against the 60 px cap — four short messages report
`scrollHeight 68 > clientHeight 60` and scroll. The build's `60 = 4 + 4 × 14` dropped the gap term
it had itself measured at 3 px two rows earlier in the same table.

**The bound is not wrong; the sentence describing it is**, and raising 60 → 68 is *not* free:
STORAGE has only 15.3 px of slack under SAFETY before it sets row 3, so +8 would take it to 240.1
against SAFETY's 239.4 — the precise failure §1.3 of the build corrected. So the height stays and
the claim is corrected, in `panel-notes.module.css` and `panel-notes.tsx`, with the arithmetic and
the reason for not raising it written in place.

---

## §3 — Priority 3: the three bespoke copies folded into `PanelNotes`

**No string changed, no attribution rule changed, no one-message-per-source rule changed.** Read
before/after from `git show HEAD:` rather than from the build's description.

| | before | after | strings | S-G attribution | S-H once-per-source |
|---|---|---|---|---|---|
| **GPU takeover** | `errorsForPanel(snapshot,'gpu').map(e => <p class=takeoverNote>{e.message}</p>)` | `<PanelNotes bound="roomy" messages={errorsForPanel(snapshot,'gpu')} />` | identical list, identical order, `e.message` verbatim | unchanged — the takeover has no rows to attribute to | unchanged, `errorsForPanel` still supplies the list |
| **SERVING takeover** | `servingErrors.map(e => <p class=emptyNote>{e.message}</p>)` | `<PanelNotes bound="roomy" messages={servingErrors} />` | identical | ⚠ unchanged **and the important part is preserved**: this branch deliberately renders `servingErrors` **whole**, including an entry tagged with an `instance` no row exists for (10b-S-G's third orphan shape). `errorFor`/`unattributed` are untouched | unchanged |
| **STORAGE link** | `<Caption>{linkError}</Caption>` | `<PanelNotes messages={[linkError]} />` (tight) | identical string; `linkError` changed from `.message` to the entry | n/a | ⚠ unchanged — still `findLast(source === 'net-operstate')`, exactly one entry, and still **excluded** from the panel block (`notes` is `statvfs` + `proc-net-dev`) |

**Position is preserved in all three.** STORAGE's link explanation still sits after the link caption
and its stale age, which is what §6.5 requires — it explains the link line, not the two mounts.

Two rendering differences, both deliberate and both improvements:

- **The React key strengthened.** GPU's takeover keyed on `e.source` alone; `PanelNotes` keys on
  `` `${e.source}:${e.message}` ``. Two entries from one source (the ordinary case — `collectStorage`
  files one `statvfs` entry per mount) collided under the old key.
- **Tone token.** `.takeoverNote`/`.emptyNote` were `--ink-secondary`, and `PanelNotes .note` is
  `--ink-secondary` — unchanged. STORAGE's was a `Caption`, `--ink-muted`, and is now
  `--ink-secondary` on the sunken ground every other notes block uses. No spec rule governs it; the
  point of the fold is that all five now look the same, and they do.

### ⚠ FIX 2 — `storage-network-panel.tsx`'s module doc described the code it no longer ships

It still said *"`net-operstate` sits on the link caption's own detail line"* and *"the link's stale
age and its `errors[]` detail move into two extra **`Caption`** lines"*. Only the stale age is a
`Caption` now. This is HANDOVER §0.5's *"a document contradicting the code it shipped with"* — three
of eleven findings in one loop — one file over. Corrected, with what changed and why written in.

---

## §4 — Priority 4: `Chip band={false}`, both sides fixtured

**Both sides, in both places.** `chip.test.tsx`: the default bands (omitted renders byte-identical
to explicit `band`), and `band={false}` drops **all three** carriers. `gpu-panel.test.tsx`:
`0x4 | 0x20` renders exactly one banded chip and exactly one unbanded one — asserted as a **count**
over the chips inside the throttle caption, not as a whole-document `toContain` — and **`0x4` alone
renders no throttle line at all** and no `sw power cap` text.

**It is distinct from `severity={null}` in the DOM.** `band={false}` emits **no** `data-severity`, so
it falls through to `.chip[data-size='md']`'s own neutral `--border-hi` border, `rgba(152,165,180,.07)`
ground and `--ink-secondary` ink. `severity={null}` emits `data-severity="none"`, which is a
*different rule* painting the `--nodata` hatch. Read from `chip.module.css`; the two never resolve
to the same declarations.

**And for a screen reader.** Unbanded announces the label and nothing else. `severity={null}`
announces an `sr-only` **"no severity band"** beside an `aria-hidden` em dash. Different words for
different facts, which is the ruling's whole point: `0x4` was read and is known, it simply is not a
state claim.

Backed by six mutations, and the three-carrier split is right — a band travels on the attribute, the
glyph and the announced word, and dropping any two still looks fixed. `10f-C2` (default flips to
false) reddens **11** tests; `10f-C3` and `10f-C4` each reddens the one test written for it;
`10f-GP2`/`GP3` cover both directions of the wiring and `10f-GP4` covers the gate.

---

## §5 — Priority 5: measurement 10's fixture assertion cannot pass vacuously

**It cannot, and I proved it by breaking the fixture rather than by reading the code.**

The mechanism is right by construction: `textOf(slot)` returns `''` for a slot that is missing or
renamed, and `''.includes(<150-character string>)` is `false`, so the measurement **fails** where
10c-3/A3's null-tolerant `every(...)` predicate **skipped**. The `record(...)` call has no
`ok(...)`-style tolerance in it and no third state.

**Proof, run.** I set `fabrication.mode` to `'gpus-only'` so the box-degraded body is never served,
ran the script, and restored it:

```
FAIL     10. the real-box degraded fixture TOOK — the DKMS message is under SAFETY and dell-smm's under COOLING
         {"dkmsUnderSafety":false,"dellSmmUnderCooling":false,"safetySample":"safetyufw · pwm5 · dkms · fan
          service▲watch▲watchufw enforcing▲watch—/etc/ufw/ufw.conf: ENOENT …
15 passed, 1 failed, 0 blocked by this environment, 16 total.     (exit 1)
```

⚠ **And the three fit measurements under it still said PASS** — the mac's own degraded page fits —
which is exactly the vacuous-PASS shape 10c-3/A3 found twice in this file. The precondition is the
only thing standing between that and three reported-green measurements of the wrong page. The
sample fields name what it saw instead, so the failure is diagnosable rather than merely red.

Restored, and re-run: **16 passed · 0 failed, exit 0, output identical to the pre-probe run** —
`diff`ed, so the probe left nothing behind.

Two further confirmations that the fixture is really degraded rather than merely present:

- Measurement 10's own slot heights: **SAFETY 199** against the healthy box's **159.4** — a flat
  **+40**, which is exactly two explained rows at the +20.0 px I measured in §2 (`dkms`, and `pwm5`
  via `pwm5Present: false`). The fixture is doing what it says.
- **COOLING 425 ≈ CPU 216 + 9 + SAFETY 199 = 424.** The row model reproduces it (§6).

Both message strings are copied from the collectors that emit them, which is the right choice: a
reworded message breaks this fixture instead of leaving it silently grading a page the box no longer
produces.

---

## §6 — Priority 6: the row model, the 163 px bound, and the 1600×1024 case

### The row model is right, and it is confirmed twice over

Read from `grid.module.css` first. At ≥1280 the areas are
`'cooling cooling cpu memory'` / `'cooling cooling safety storage'`, so the tracks are
`row2 = max(CPU, MEMORY)` and `row3 = max(SAFETY, STORAGE)`; a spanning item contributes only the
excess over `row2 + gap + row3`. **Rows 2 and 3 size independently — the build's correction is
right and the column-sum model it started with cannot be.**

Then confirmed against **five measured COOLING slots** across three fixtures, none of which the
column-sum model reproduces:

| fixture / viewport | CPU | SAFETY | `cpu + 9 + safety` | COOLING measured |
|---|---|---|---|---|
| healthy box, 1280 | 216.1 | 159.4 | 384.5 | **384.5** |
| healthy box, 1600 | 240.1 | 159.4 | 408.5 | **408.5** |
| dev-Mac degraded, 1280 | 237 | 239 | 485 | **485** |
| dev-Mac degraded, 1600 | 261 | 239 | 509 | **509** |
| real-box degraded, 1280 | 216 | 199 | 424 | **425** |

### The 163 px re-derived from the measured constants

Every constant re-measured independently in §2: tight well **18**, roomy **60**, row detail well
**14**, `.row` row-gap **6**, panel body gap **5**, one explained row **+20.0**.

| term | sum | px |
|---|---|---|
| row 1 — a GPU card's tight notes | 18 + 5 | **23.0** — *measured*: mac gpu0 187 vs healthy 164.5 |
| row 2 — `max(CPU 216.1+23, MEMORY 137.8+65)`, CPU governs | 239.1 − 216.1 | **23.0** — *measured*: mac cpu 237 |
| row 3 — `max(SAFETY 159.4+4×20, STORAGE 144.1+65+23)`, SAFETY governs | 239.4 − 159.4 | **80.0** — *measured*, flat at every viewport |
| rows 2–3 together (COOLING's worst intrinsic stays under) | | **103.0** |
| row 4 — SERVING 103.8 + 40 + 23 = 166.8 over the log's 129.8 | | **37.0** — ⚠ *arithmetic only* |
| **page** | | **163.0** |

The sum reproduces. Measurement 9 shows **+123.2 px** of it directly (content bottom 884 against the
healthy 760.8); the missing 37 is SERVING's, and it is not measured on **either** fixture because on
both of them SERVING is in its takeover branch, which is *shorter* than healthy.

One correction: the build says the 80 px SAFETY term *"is exactly §2.11's own budget"* of
`4 × 19.1 = 76.4`. It is not — the well is 14 px where the bare line was 13.1, so each explained row
costs **0.9 px more** than §2.11 budgeted, 3.6 px over four rows. Small, and in the unhelpful
direction at the tightest viewport.

### The 1600×1024 compound case is ARITHMETIC, not measured — and its inputs are sound

The build's table reproduces exactly from measured inputs: healthy spare **227.6** (measured),
the two-alarm banner **65.7** (measured — `check-density.mjs` prints band 43 healthy and 108.7
pinned), giving `227.6 − 65.7 = 161.9` against 163.0 → **−1.1**, and the six-alarm banner **72.7**
(from 10e §2.11, *not* re-measured here) giving 154.9 → **−8.1**. The nearest measured point agrees:
the banner-pinned mac run leaves **38.5 px** at 1600, and SERVING's un-measured +37 consumes all but
~1.5 of it.

So: **arithmetic on measured constants, with one input (the six-alarm banner) carried from 10e.**
The build says as much implicitly — *"every case anyone can measure today passes"* — and that
framing is honest.

### ⚠ THE FINDING — 163 px is NOT a bound on any telemetry. It omits `.noteWatch`.

Silence #6 leaves `.noteWatch` unbounded on the grounds that S-B's `last read 6:12 ago` is *"bounded
by its own construction"*. That is true of its **height** — one line of fixed-width text. What §1.4
misses is that it is an **extra line**, on a row that may *also* carry the `detail` well, and
`status-row.tsx`'s own module doc calls that co-occurrence *"precisely the case that matters"*:
a source stops answering, so `errors[]` gains an entry **and** the conditions it fed go stale.
`status-row.test.tsx` fixtures exactly that pair, and `safety-panel.tsx:85-121` wires `note` and
`detail` on all four rows independently.

Measured (`scratchpad/wells.mjs`, same harness as §2):

| row | height | cost |
|---|---|---|
| bare | 23.00 | — |
| + `errors[]` detail (the bounded well) | 43.00 | **+20.00** |
| + stale age only (`.noteWatch`) | 42.13 | **+19.13** |
| + **both** | **62.13** | **+39.13** |

⚠ **CORRECTED IN PLACE BY THE RECONCILE PHASE, 2026-09-09 (finding `10f-A5`, ACCEPTED). The count
below was SEVEN; measured in the DOM it is TWO, and one of those two is absorbed.** The paragraph
as written said *"Seven rows on the page can be in that state — SAFETY ×4, SERVING ×2, COOLING's
fan-service row"*. The adversarial phase counted `status-row…noteWatch` nodes on the
all-collectors-failed page at 14 s, 20 s and 45 s after every collector stopped answering:

- **SAFETY's other three rows can never go stale.** `ufw_enforcing`, `pwm5_present` and
  `dkms_for_running_kernel` call TOTAL severity functions, so `conditionsFrom` pushes an
  observation on every successful poll and `observePoll` never carries them absent
  (`components/panels/condition-lookup.ts:15-21` says so in its own module doc, and it is why
  `safety-panel.tsx:88-96` renders `▲watch` with an em dash rather than a stale age). Measured:
  exactly **one** `noteWatch` under `[data-slot="safety"]`, the `fan service` row — never four.
- **SERVING's two rows are retired, not staled** (`lib/conditions.ts:737-746` retires a condition
  whose `enumeration` was read, and `serving` is read whenever the array is non-null — which is
  exactly when those rows exist). Measured: **zero** `noteWatch` under `[data-slot="serving"]` in
  any run, while both rows carried their `detail` wells.

So the +39.13 term applies to **SAFETY's `fan service` row and COOLING's**, and COOLING is a
spanning item whose intrinsic height is under `row2 + 9 + row3` in every case here, so it adds
nothing to the page. The per-row constants above reproduce exactly (26.8 / 46.8 / 45.9 / 65.9 in
the adversarial's own column, +20.0 / +19.1 / +39.1); only the COUNT was wrong. The corrected
worst case at 1280, re-derived from those same constants:

| term | §1.4 | this phase's ≈277.8 | ⚠ corrected (10f-A5) |
|---|---|---|---|
| row 1 (GPU cards; no stale-capable rows) | +23.0 | +23.0 | **+23.0** |
| row 2 — CPU + its tight well | +23.0 | +23.0 | **+23.0** |
| row 3 — SAFETY `159.4 + 3 × 20.0 + 39.13` = **258.5** (was `159.4 + 4 × 39.13` = 315.9) | +80.0 | +156.5 | **+99.1** |
| rows 2–3 | +103.0 | +179.5 | **+122.1** |
| row 4 — SERVING `103.8 + 2 × 20.0 + 23` = **166.8**, over the log's 129.8 | +37.0 | +75.3 | **+37.0** |
| **page** | **163.0** | ≈ 277.8 | **≈ 182.1** |

⚠ The adversarial's own headline for this correction — *"moves the estimate from ≈277.8 to
≈216"* — is **not reproducible from the constants it states**, and the reconcile phase could not
recover a route to 216 from them; the sum above is written out term by term instead. Nothing in
the conclusion turns on which: ≈182 still **fits** the 1280 two-alarm budget of 197.5 and is still
**over** the 1600 budget of 161.9 by ~20 px — and 10f-A2 measured the compound page over at all
three viewports anyway, for the different reason it names (the banner is itself unbounded).

**It is not a regression and 10f did not create it** — `.noteWatch` was unbounded before this loop
and the ruling scoped itself to `errors[]` blocks — but silence #4 still understates the gap, by
~19 px at 1280 rather than by the order of magnitude this section claimed.

Invariant 7 applies rather than a fix: `.noteWatch` is **not** an `errors[]` explanation, so bounding
it (or shortening it, or folding it into the same well) is a decision the owner's ruling did not
reach and this phase must not invent. **Recorded, with the measurement, for the adversarial and
reconcile phases and for the owner.** The cheapest close, if one is wanted, is that a row already
showing S-B's age is a row whose `detail` could share its line rather than claim a second.

⚠ One further unbounded term, out of Q1's scope and named for completeness: `safety-panel.tsx`'s
`state.unknownStanding` renders one row per unrecognised `STANDING` id with no cap. It is
configuration-driven rather than telemetry-driven, which is why the ruling does not reach it.

---

## §7 — Priority 7: names against bodies, `toContain`, entropy

**Every test name in all ten changed test files read against its body**, plus the deleted
`components/row.test.tsx` in full (§1). The new assertions do
not repeat §0.9's shape: each one that names a class, a tone, a size or a wiring **asserts that
thing** — `data-bound`, `role="group"`, `tabindex="0"`, the extracted CSS declaration, or an exact
occurrence count — not the text beside it. The three names that were imprecise are all about the
same arithmetic slip and are fixed in §2's FIX 1 (`panel-notes.module.css`, `panel-notes.tsx`, and
`10f-PN4`'s own mutation name).

**No new whole-document `toContain` of a dangerous literal.** Every new assertion is scoped: to the
well (`html.slice(html.lastIndexOf('<div', at), at)`), to the throttle caption, or to a single
primitive rendered alone — where the document *is* the element. The whole-document uses that remain
(`not.toContain('throttle')`, `not.toContain('sw power cap')`, `not.toContain('no GPUs enumerated')`)
are all **negative**, which is the strong direction: a `not.toContain` over a superset cannot be
satisfied by an unrelated element. `tocontain-scope.test.ts` is unchanged and green, and its two
guarded literals (`data-severity="…"` and the bare em dash in a composite panel) appear in no new
unscoped assertion.

**No entropy and no timers in any new test.** Every one takes `nowMs={0}` and a literal fixture;
nothing reads a clock, draws a random value or installs a fake timer. `pnpm verify` was run **five
times** across this phase — once on the tree as inherited (101 files / **2957**) and four times
after the fixes (101 / **2960**), identical every time on each side of the change.

**Two mechanical checks I ran that the build did not name.** Every anchor in **all nine** harnesses
occurs **exactly once** in the file it names (1083 of them) — the `DID NOT BITE` failure mode where
`replace(old, new, 1)` silently takes the first of two sites. And the `10f-` ids do not collide with
any of the other 1080 across harnesses, not merely within their own file.

---

## §8 — ⚠ FIX 3: the `bound` boundary had a fixture on one side only

**This is the fix that matters, and it is the project's own rule twice over** — HANDOVER §0.8's
*"wiring a prop is a property, and an optional prop makes it an untested one"*, and ANCHOR §5's
*"every boundary guard needs a fixture on both sides"*.

`bound` has **nine** call sites — five `roomy`, four `tight`. **Every one of the five `roomy` sites
has a test and a mutation. Of the four `tight` sites only STORAGE's link block did** (`10f-SN2`
mutates it TO roomy, the right direction, because the build reasoned about that one explicitly).
**The other three had neither a test nor a mutation** — and they are precisely the three that pay
for the page 1:1:

| call site | why it must be tight | was asserted by | was mutated by |
|---|---|---|---|
| `cpu-panel.tsx:153` | **CPU governs row 2** (`max(CPU 216.1, MEMORY 137.8)`) — §1.4's own model | nothing | nothing |
| `gpu-panel.tsx:288` (the **enumerated** card) | **row 1 IS `max(gpu0, gpu1)`** — it pays twice over | nothing | nothing |
| `serving-panel.tsx:155` (unattributed) | row 4 leaves SERVING 26 px under the log; its row details already spend 40 | nothing | nothing |

`10f-PN3` proves the *default* is tight. Nothing proved these call sites *take* the default:
adding `bound="roomy"` to any of them is **+42 px** with `pnpm verify` green and all nine harnesses
green — on a page whose worst case the build itself puts 1–8 px over budget at 1600×1024. That is
the exact defect Q1 exists to prevent, reachable by a one-word edit.

**Fixed**: three tests and three mutations, matching the shape of the five that existed.

| added | in |
|---|---|
| `⚠ 10f/Q1 — CPU takes the TIGHT notes bound: it governs row 2, so its growth costs the page 1:1` | `cpu-panel.test.tsx` |
| `⚠ 10f/Q1 — the ENUMERATED card takes the TIGHT bound: row 1 is max(gpu0, gpu1), so it pays 1:1` | `gpu-panel.test.tsx` |
| `⚠ 10f/Q1 — the UNATTRIBUTED block takes the TIGHT bound: row 4 has 26 px of slack, not 42` | `serving-panel.test.tsx` |
| `10f-CP1` · `10f-GP5` · `10f-SV2` | `10-panels-assembly/regressions.py` → **233** |

Each is scoped to the well itself and asserts both directions (`toContain('data-bound="tight"')` and
`not.toContain('data-bound="roomy"')`), and the GPU one additionally asserts the card is *enumerated*
so it cannot be satisfied by the takeover branch.

---

## §9 — Every fix applied by this phase

| # | fix | why |
|---|---|---|
| 1 | three TIGHT-side tests + `10f-CP1`/`10f-GP5`/`10f-SV2` | §8 — the boundary had one side only, on the three call sites that pay 1:1 |
| 2 | `panel-notes.module.css`: `roomy` is 3 lines + a sliver, not 4, with the arithmetic and why 60 is kept | §2 FIX 1 — measured |
| 3 | `panel-notes.tsx` module doc: the same correction | §2 FIX 1 |
| 4 | `10f-PN4`'s mutation name: "four message lines" → the height it actually sets | §2 FIX 1 |
| 5 | `storage-network-panel.tsx` module doc: the link explanation is a `PanelNotes`, not a `Caption`, and `linkError` is an entry | §3 FIX 2 — the doc described code it no longer ships |
| — | **nothing else** | no guard touched, no threshold moved, no assertion loosened, no CSS value changed |

**Recorded, not fixed** (invariant 7): §6's `.noteWatch` term, and `09-R3`'s `note`-slot narrowing.

---

## §10 — Results

**`pnpm verify` — exit 0. 101 test files, 2960 tests, no type errors.** (2957 before this phase;
+3 for §8's fixtures. The build's 101/2957 reproduced exactly before I touched anything.)

**Harnesses.** Three were run before any change and reproduced the build's figures exactly; the two
whose `LEDGER_FILES` this phase touched were re-run after. Which two was established by grepping
every `pipeline/steps/*/regressions.py` for each of the six `components/` files I edited — only
steps 9 and 10 hit, and step 9 only through `panel-notes.module.css`, where my edit is inside a
comment and disturbs neither `10f-CS4`'s nor `10f-CS6`'s anchor.

| harness | before this phase | after this phase |
|---|---|---|
| `02-format-severity` | **60** mutations · 272 red · 22 ⚠ · **exit 0** — its ledger runs | not touched |
| `09-ui-primitives` | **128** · 184 red · 135 ⚠ · **exit 0** | **128** · 184 red · 135 ⚠ · **exit 0** |
| `10-panels-assembly` | **230** · 271 red · 248 ⚠ · **exit 0** | **233** · 274 red · 251 ⚠ · **exit 0** (run twice after the change — once for the three new mutations, once more after `10f-PN4`'s rename; identical both times) |

Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE` in every run. All 1083 anchors
verified exactly-once; zero cross-harness id collisions.

**Browser measurements, all run by this phase.**

| harness | result |
|---|---|
| `measure-breakpoints.mjs` | **16 passed · 0 failed · 0 blocked · 16 total, exit 0.** Measurement 9: **140 / 104 / 160 px** spare. Measurement 10: fixture-took **PASS**, then **157 / 122 / 178 px** spare |
| measurement 10's precondition, **deliberately broken** | reports **FAIL** and the script exits 1 — the assertion is not vacuous |
| `measure-arrangements.mjs --fixture box --only baseline --anatomy` → `check-density.mjs` | **ALL PASS**, spare **263.2 / 227.6 / 283.6**, banner pinned overflow 0 — and the whole output `diff`s **byte-identical** to the build's final run. The healthy page did not move |
| `scratchpad/wells.mjs` (this phase's own) | boundedness at 0 / 1 / 40 lines, §2's table, and §6's `.noteWatch` measurement |

**Tree hygiene.** `git status` shows only intended changes — no stranded mutation; `next-env.d.ts`,
`AGENTS.md`, `SPEC.md` and `MOCK.html` byte-identical to `HEAD`; nothing listening on
:39173 / :39174 / :39175; no `next dev` process left by this phase; no `.env` written; and every
browser this phase launched was closed by the script that launched it. The tree differs from the one the
build left by exactly the five fixes in §9 and this file: three test files gain one test each,
step 10's harness gains three mutations and one renamed one, and three comment blocks are corrected.
**Nothing committed.**

⚠ **One pre-existing observation, not this phase's and not touched.** Two `next-server` (v16.3.4)
processes are listening on **:8391** and **:8392** from this same `dashboard/` directory, started
**Sun Sep 6 15:39**, logging to `/tmp/start.log` and `/tmp/start2.log`. They are three days old, are
`next start` rather than `next dev`, and are on neither measurement port. Left running — the rule is
to close only what you launched — but recorded, because "no server left behind" is a claim the next
reader will check and these will be what they find.
