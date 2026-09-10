# 10g — ADVERSARIAL. **The page does not fit. The throttle ruling bought 0–3 px, not 27. And the well the ruling names third is guarded by nothing.**

**Written by the ADVERSARIAL phase, 2026-09-09. Nothing was fixed and nothing was left edited** —
every experiment was undone with the edit that reverses it, and `git diff | shasum` is byte-identical
to what this phase inherited (`39727f24…`, verified after each experiment and at the end). No commit,
no `SPEC.md`, no `MOCK.html`. The only change to `git status` is this file.

Everything below was measured in real headless Chrome against `next dev` on port 39174, with
`/api/telemetry` rewritten in flight the same way `measure-breakpoints.mjs` does it. The control
scenario reproduces the build's measurement 11 **to the pixel** (spare 41 / 6 / 62 at
1280×1024 / 1600×1024 / 1920×1080, band 102, banner 58.8, and every one of the nine slots), so the
deltas below are against a fixture that is demonstrably the graded one. Scripts:
`scratchpad/adv-fit.mjs`, `adv-live.mjs`, `adv-banner.mjs`, `adv-scroll.mjs`.

---

## 1. Findings

### 10g-A1 — ⚠ **§6.1's promise fails on the graded page under ordinary telemetry, in four independent ways. MEASURED.**

**Severity: critical.** §6.1 is *"unconditional on telemetry"* and 10g's headline is that the
all-sources-explained page **fits at all three viewports**. It does not. Each row below changes
**one** field of measurement 11's own fixture and re-runs its own `recordFit` primitives:

| scenario — one variable from measurement 11's fixture | 1280×1024 | **1600×1024** | 1920×1080 |
|---|---|---|---|
| control (measurement 11 as graded) | 41 | **6** | 62 |
| `throttleReasons: 0x…24` — one notable bit beside the routine cap | 19 | **−16 OVER** | 40 |
| `throttleReasons: 0x…ec` — §6.3's four alarm bits plus the cap | **−5 OVER** | **−40 OVER** | 40 |
| a THIRD `llama-server` instance, explained like the other two | **−7 OVER** | **−42 OVER** | 14 |
| `model` = `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf` | **−19 OVER** | 6 | 62 |
| all four together | **−113** | **−64** | **−8 OVER** |

None of these is exotic:

- **The throttle mask.** `0x24` is the exact mask `10g-build.md` §3.1 measures as the *before*
  case. `0xec` is §6.3's four alarm bits — the state the whole banner exists for. Both cost
  **+22 px per GPU card at 1600** (199 → 221) or **+46** (199 → 245), on the row that sets the
  page's first term. ⚠ **The graded fixture cannot see this**: every browser fixture in the project
  hard-codes `throttleReasons: '0x0000000000000004'`
  (`measure-breakpoints.mjs:448`, `mocks/measure-arrangements.mjs:128`), which is not `notable`, so
  `gpu-panel.tsx:262`'s `decode.notable` guard renders **no throttle line at all**. The subject of
  ruling 10f-Q3 is absent from every page 10g measures. (Probe: `cap null well null` on the control.)
- **The third instance.** `SPEC.md` §3.4 is explicit: *"Instances are discovered, not hard-coded …
  a third card must appear without a code change."* It costs **+48 px** on SERVING (167 → 215), not
  the **+20** `10g-build.md` §6 silence 9 predicts.
- **`model`.** §3.4 sources it from `GET /v1/models`, whose id is the model **path** unless
  `--alias` is set. Rendered raw in two unbounded places: `serving-panel.tsx:97`'s `inline`
  (`+21 px per row`, whose own doc says it *"wraps naturally with the row"*) and
  `gpu-panel.tsx:255-261`'s `Strip` item `served by instance N` (**+17.9 px per GPU card**, strip
  14.8 → 32.7). 10g called itself *"the last unbounded terms"*; this is one it did not find.

The healthy page absorbs all of them (spare 158–229 px). It is the degraded page — the one §6.1's
2026-09-09 ruling is *about* — that breaks.

**How proven:** measured. `adv-fit.mjs`, three viewports per scenario, 13 s debounce wait per load,
per-slot heights printed and attributed.

---

### 10g-A2 — ⚠ **The throttle ruling bounds the WELL and not the LINE. Measured A/B on this tree it buys 2 / 3 / 0 px per card, against the build's claimed +27.**

**Severity: high.** `10g-build.md` §3.1: *"the term this bounds is +27 px per card on a third
notable bit … After: 17 px whatever the mask."* The 17 px is the **well's** (`panel-text.module.css:50`,
`max-height: 17px`), and the well is not the line. `caption.tsx:48-59` puts the label and the well
side by side inside `<p class="caption">`, which is `display: flex; flex-wrap: wrap`
(`panel-text.module.css:5-15`). A wrapping flex container breaks lines on each item's **hypothetical
main size** *before* any shrinking — so once the chips' combined max-content width exceeds the space
beside the `throttle` label, the well drops onto **its own second line** and the caption is two lines
tall. `min-width: 0` and `flex: 1 1 auto` do not prevent this; they only govern shrinking *after*
the line break.

Measured, mask `0xec`, five chips (`0x4 sw power cap` 117 px · `0x8 hw slowdown` 122 · `0x20 sw
thermal slowdown` 178 · `0x40 hw thermal slowdown` 178 · `0x80 hw power brake slowdown` 204, plus
4×10 px gaps = **839 px**):

| viewport | caption width | space beside the label | caption height | well height | well top |
|---|---|---|---|---|---|
| 1280 | 602 | ~542 | **41.2** | 17 | 24 (second line) |
| 1600 | 762 | ~701 | **41.2** | 17 | 24 (second line) |
| 1920 | 922 | ~861 | 17 | 17 | 0 (one line) |

And the A/B — the same tree, the same fixture, with `gpu-panel.tsx:268` temporarily reduced to
`<Caption label="throttle">` (the pre-10g shape, i.e. mutation `10g-GP1`) and then restored:

| mask | GPU card, WITHOUT the well | GPU card, WITH the well | the ruling buys |
|---|---|---|---|
| `0x…ec` | 236 / 248 / 221 | 234 / 245 / 221 | **2 / 3 / 0 px** |
| `0x…24` | 209 / 221 / 221 | 209 / 221 / 221 | **0 / 0 / 0 px** |

So on the page 10g grades, the throttle ruling buys **zero** (no throttle line is rendered at all);
on a page that does throttle, it buys **at most 3 px per card**. The `44 → 17` the build reports is
`44 → 41.2`.

⚠ Reasoned from the measured chip widths, not run: the wrap begins at the **third notable bit** —
`0x8 + 0x20 + 0x40` plus the routine `0x4` is 625 px of chips against 542 px available at 1280 —
which is precisely the case `SPEC.md` §6.1's ruling was written for.

Two smaller consequences of the same shape: the well's `overflow-x` computes to `auto` (one axis
non-`visible` forces the other), so a single chip wider than the column would get a horizontal
scrollbar inside a 17 px box; and the well takes the caption's **full** width once it wraps (602 px
at 1280), which is why the chips inside it then wrap to `scrollHeight 38` against `clientHeight 17`.

---

### 10g-A3 — ⚠ **Three one-line reverts of the 10g diff keep `pnpm verify` green. One of them deletes the affordance from every well on the page.**

**Severity: high.** All three applied together; `pnpm verify` **exit 0, 101 files, 3008 tests, no
type errors** (log: `scratchpad/adv-verify-mutated.log`), then all three reversed with the edit that
undoes them.

| revert | file:line | what it does on screen | why nothing catches it |
|---|---|---|---|
| `--well-fade-height: 9px` → `0px` | `components/tokens.css:137` | the continuation fade **vanishes from all four wells at once** — §6.1's ruled affordance is gone | every test asserts `background-size: 100% var(--well-fade-height)`; **no test asserts the token's value**, and `10g-PN7` mutates `--well-fade-cover` instead |
| `background-attachment: local, scroll` → `scroll, scroll` | `components/panels/status-row.module.css:135` | every `StatusRow` `note`/`detail` well claims hidden text **permanently**, whether or not any is hidden | `status-row.module.css`'s fade is asserted by **no test in the suite and no mutation in either harness** |
| `background-position: bottom` → `top` | `components/panels/panel-text.module.css:57` | the throttle well's fade moves to its **top** edge | only `panel-notes.module.css`'s `background-position` is asserted (`panel-notes.test.tsx:280`) |

The middle one is the structural hole: **`StatusRow`'s well is one of the four the ruling names**
(`10g-build.md` §4.2's table), and all five of its fade declarations
(`status-row.module.css:131-135`) can be deleted without a single red test or a single moved anchor.
`styles.test.ts`'s directory-wide rules cover *bounded* and *positioned* only; they say nothing about
the affordance.

---

### 10g-A4 — ⚠ **The `… N more` marker paints an opaque patch over the last visible line of the text it is about.**

**Severity: medium-high.** `.more` is `position: absolute; right: 2px; bottom: 0` with
`background: var(--surface-2)` — an **opaque** `#11161d`, one ramp step *lighter* than the well's
`--surface-sunken` `#090c11` (`panel-notes.module.css:83-95`). It is anchored to the wrapper's bottom
edge, so it sits over the bottom-most **visible** line at every scroll position. On a `tight` well
that is the only line there is.

Measured on the graded all-sources-explained page at 1280 (`adv-banner.mjs` B4):

| well | marker | marker box | overlap with the visible note | share of that line covered |
|---|---|---|---|---|
| `cpu messages` | `… 3 more` | 49 × 11 px | **46 × 11 px** | 46 of 275 px = **17 %** |
| `serving messages` | `… 3 more` | 49 × 11 px | **46 × 11 px** | 46 of 592 px = 8 % |

§6.1 asks the well to *say* it hides text. It says so by hiding text. The build's own §4.2 argues the
marker costs **0 px** — true of layout (confirmed, see §2) and false of legibility.

---

### 10g-A5 — ⚠ **On the project's own graded page, every `… N more` that exists is wrong, and the wells hiding the most are the ones with no marker.**

**Severity: medium.** The TEST phase established the marker is a lower bound and constructed a case
where it is wrong. Measured here on the **live graded page** rather than a fixture, it is wrong
everywhere it appears, and absent exactly where it would help most (`adv-banner.mjs` B5):

| well | bound | client / scroll | px hidden | entries fully visible | marker |
|---|---|---|---|---|---|
| `cpu messages` | tight | 18 / 233 | **215** | **0** | `… 3 more` — 4 are unreadable |
| `serving messages` | tight | 18 / 123 | 105 | 0 | `… 3 more` — 4 are unreadable |
| `storage & network messages` | roomy | 46 / 117 | **71** | — | **nothing** |
| `link messages` | tight | 18 / 59 | 41 | — | **nothing** |
| `safety ufw enforcing explanation` | row-note | 14 / 66 | **52** | — | **nothing** (by design) |
| `safety pwm5 present / DKMS / fan service` | row-note | 14 / 66 | 52 each | — | **nothing** (by design) |

The direction is confirmed structurally: `hiddenMessageCount = max(0, total − LINES_SHOWN[bound])`
and a `roomy` well's 42 px of content box cannot hold four entries at any line height above 8.25 px
(measured: 11–13.8 px), so it can never over-count. But *"a count, never a sentence"* is being met by
a count that is wrong on every well that shows one, on the one page an operator reaches because
something is wrong.

---

### 10g-A6 — ⚠ **16 of 21 alarm conditions are unreachable on a wall panel, and the banner offers no affordance that they exist beyond a 9/255 fade.**

**Severity: medium.** §6.4's *"Nothing is dropped"* is a claim about the DOM; measured against the
screen (`adv-banner.mjs` B1, `.rest` at 1280×1024):

| conditions | items rendered | `.rest` client / scroll | items **fully visible** | first one hidden |
|---|---|---|---|---|
| 2 / 3 / 4 | 1 / 2 / 3 | 21 / 21 | all | — |
| 6 | 5 | 21 / **48** | **4** | `RAM 33.2 GiB used · swap 2.00 GiB` |
| 12 | 11 | 21 / **75** | **4** | `GPU 0 VRAM 32,200 / 32,768 MiB` |
| 21 | 20 | 21 / **128** | **4** | `fan 2 0 RPM` |

`offsetHeight − clientHeight = 0` at every count — there is **no scrollbar** occupying layout, so
nothing on screen says the box scrolls except the fade. §6.1's subject is *"the single-screen wall
panel"*, where there is no pointer and no keyboard: at 21 conditions **16 of the 20 rest items
cannot be read at all**. (Mitigation, and it is real: every one of those conditions also appears in
its own panel and in the event log — but that is the mitigation for *dropping* them, and the banner
is what §6.4 makes the announcement.) A `… N more` was ruled out for this well on the grounds that
the head already carries the total; the total is not the same fact as *"you are seeing 4 of 20"*.

Answering the handoff's own question directly: **two conditions never wrap to two lines** — two
conditions is one `.rest` item and `scrollHeight === clientHeight === 21`. The first hidden condition
appears at **six** at 1280 and at **twelve** at 1920.

---

### 10g-A7 — ⚠ **Harness: 10g added three ⚠ tests whose ledger prefix is unmatchably short, and one of them is the single character `⚠`.**

**Severity: medium.** `regressions.py:252` computes a `test.each` name's ledger key as
`name.split("%")[0].strip()`, and `:253` prints `!!! … unmatchably short` for a key under 12
characters **without failing the run**. Three names in the tree trip it. **All three were added by
10g** (confirmed against `git show HEAD:`), and every one of them is 10g's own acceptance test:

| test | ledger key | other ⚠ names in that harness containing the key |
|---|---|---|
| `panel-notes.test.tsx:208` `⚠ %s with %i messages marks %s` | **`⚠`** (1 char) | **278** |
| `alarm-banner.test.tsx:157` `⚠ at %i conditions every one of them is in the DOM…` | `⚠ at` (4) | 0 today |
| `sparkline.test.tsx:936` `⚠ height=%i puts exactly that box on the table view…` | `⚠ height=` (9) | 0 today |

The first is total: the ledger's check is `prefix not in "\n".join(failing_test_lines)`, so **any**
mutation anywhere in step 10's 264 that reddens **any** ⚠ test marks the `… N more` marker's own
acceptance test as covered. It is certified by nothing.

⚠ **The hole is latent, not live** — I checked rather than assumed. Applying `10g-PN2`
(`{ tight: 1, roomy: 3 }` → `roomy: 4`) and running that file alone reddens
`⚠ roomy with 4 messages marks … 1 more`, `⚠ roomy with 9 messages marks … 6 more` and
`⚠ hiddenMessageCount is the exported arithmetic…` (3 failed / 18 passed), then reversed. So the
mutation does bite; what is broken is the *ledger's ability to know it*. The other two keys are
unambiguous today and fragile tomorrow — any future `⚠ at …` or `⚠ height=…` name silently covers
them.

Both phases reported *"every ⚠ mark reddened"* off runs that were printing these three `!!!` lines.

---

### 10g-A8 — `styles.test.ts`'s shared ledger prefix: the consequence, confirmed, and 10g widened it.

**Severity: low (recorded by the TEST phase; this is the consequence it asked to have confirmed).**
`styles.test.ts:112` and `:176` are two `test.each(cssFiles)` blocks whose names both begin
`⚠ every scrolling box in ` before the `%s`. One ledger key covers **both rules and every generated
file** — a single red generated test certifies all of them. 10g grew `cssFiles`'s scrolling set from
five files to seven, so the number of generated ⚠ tests behind that one key went from 10 to 14
(2 × 7). There is no per-file or per-rule accounting; a mutation that reddens only the *bounded*
rule in one file also discharges the *positioned* rule in all seven. Both rules do have live
mutations today (`10f-CS4`/`CS5` and `10f-CS6`/`10e-CS3`), so this is latent — but it is the
mechanism by which A7's live hole was created, in the same file family.

---

### 10g-A9 — `panel-notes.module.css`'s module doc still documents `roomy` as 60 px and argues for keeping it.

**Severity: low.** `panel-notes.module.css:21-26` — inside the `.notes` doc block, unchanged by 10g:
*"⚠ `roomy` is 60 px … 60 is kept rather than raised to 68 because STORAGE has only 15.3 px of slack
… The bound is what matters and 60 is the bound."* The rule 40 lines below is `max-height: 46px`
with its own ⚠ comment explaining 46. The file states both. This is the same class the TEST phase
fixed in `sparkline.tsx` and `stacked-time-series-chart.tsx` (§8, the retired `--table-scroll-max`
bullet); it was missed here because the stale text sits in a *different* rule's comment from the one
that changed. `panel-notes.tsx:55-59`'s own doc **is** correct, which makes the disagreement worse:
the two files that describe the same number now disagree.

---

### 10g-A10 — two published numbers do not reproduce.

**Severity: low.** Both are reporting, not behaviour.

- `10g-build.md` §2.3 prints `.rest` client/scroll as `21 / 101` at **both** 12 and 21 conditions.
  The TEST phase already corrected 21 → `21/128`. Measured here from a fresh load per stage:
  **12 conditions is `21 / 75`**, not 101. (The build applied its stages to one live page without a
  reload, so its `since` strings differ from a fresh load's and the chips are wider; the number is
  a property of the run, not of the rule — which is a reason to stop quoting it as one.)
- `10g-build.md` §6 silence 9 names *"a third SERVING row (+20)"*. Measured: **+48**, and it is what
  takes 1600×1024 from +6 to −42.

---

## 2. What held

Every one of these was attacked and did not move.

- **The table-view invariance is real, and it is robust.** Under **compound** load (all-sources
  explained *and* 21 alarm conditions *and* every well overflowing *and* the banner pinned), the grid
  measures **880.8 / 916.3 / 916.3 px** with all five table views open and **the same, to 0.1 px**,
  with all five closed, at 1280 / 1600 / 1920. Three full open-close cycles (24 clicks) leave it at
  880.8. Opening at 1280 and then resizing to 1600 and 1920 **with the tables still open** gives
  exactly the closed-page heights at those widths. Every slot is identical in both states.
- **The chart's box and the table's box agree everywhere I could look.** 38 / 50 / 174 px at the
  three breakpoints, on both chart primitives, in both directions — including the **first painted
  frame after a reload with the toggles clicked before any poll lands** (`--table-box-height: 38px` /
  `174px`, grid 880.8, identical to settled). The TEST phase's degenerate-domain fix holds. The
  hidden promotion wrapper costs 0 px, and only five table views are ever visible of the nine in the
  DOM.
- **The banner really is one height at any count, on the tightest page too.** 58.8 px at 2, 3, 4, 6,
  12 and 21 conditions, at 1280 / 1600 / 1920, on the all-sources-explained fixture as well as the
  alarm fixture — and 35.8 px at one condition, where `.rest` is not rendered at all. Band + gutter
  is 102 px in every scenario I ran. The banner's height is genuinely count-independent.
- **`role="alert"` does not re-announce on every poll.** The banner's full text was sampled every
  500 ms for 12 s at 21 conditions with the client polling: **0 changes**. There is no `aria-live` of
  its own. (The elapsed form does change at a minute boundary; that is once a minute, not once a
  poll.)
- **A poll does not throw the reader out of the well.** Scrolled `.rest` to the bottom
  (`scrollTop 107`), waited 6.5 s across two polls: the element is the **same node** and
  `scrollTop` is still 107. React's keys hold the items in place.
- **The `… N more` marker costs 0 px**, as claimed — the wrapper adds no height and every panel with
  a marker measures the same as one without.
- **The two reconstructed stylesheets are complete.** `alarm-banner.module.css` +54/−1 and
  `panel-notes.module.css` +50/−2 (55 and 52 changed lines, matching the TEST phase's claim).
  Declaration by declaration against `10g-build.md` §2.2, §3.2, §4.1-4.2 and §5: `.rest` carries
  `height: 21px`, `box-sizing`, `position: relative`, `overflow-y: auto`, `background-color:
  var(--surface-sunken)` and all five fade declarations, with `margin-top` gone; `.notes` carries the
  fade, `[data-bound='roomy']` is 46px, and `.well` / `.more` are present with the documented
  properties. All six mutation anchors that point into them (`10g-AB6`, `AB7`, `PN5`, `PN6`, `PN7`,
  `PN8`) resolve **exactly once** in the file each names. The only thing either file carries that the
  build does not name is `.rest:focus-visible`, which matches `.well`, `.tableView` ×2 and is
  plainly correct for a new tab stop. **Nothing is missing.**
- **Four candidate margin-eaters cost the page exactly 0 px** on the graded page, at all three
  viewports: a 21-condition banner, a 34-character hostname, a 44-character GPU name
  (`NVIDIA GV100GL [Tesla V100-PCIE-32GB] Rev. A1`), and `standing: ['ufw_enforcing','pwm5_present']`.
  The bounded wells do their job: message **length** no longer moves the page anywhere I could push
  it — only the **number of rows and lines** does, which is what A1 exploits.
- **The banner's head line does not wrap** with any real string I could produce: `.body` measures
  40.8 px at every count and viewport, which is a 17.8 px head plus the 2 px body gap plus the 21 px
  well. Build silence 9's *"a lead condition long enough to wrap the head line"* is not reachable
  from §6.3's own condition labels.

---

## 3. What I could not verify

1. **Classic, space-taking scrollbars.** The wall panel is a Linux browser, where scrollbars occupy
   layout; this Mac's Chrome uses overlay scrollbars, and injecting `::-webkit-scrollbar { width:
   15px; height: 15px }` did **not** switch it (`offsetWidth − clientWidth` stayed 0 on every well).
   So I could not measure what a 15 px scrollbar does to a **14 px** `StatusRow` well, a **17 px**
   throttle well, a **21 px** banner well or a **38 px** table box — nor whether a vertical scrollbar
   narrowing a table box triggers a horizontal one that eats 15 of its 38 px. Reasoned risk only;
   it wants one run on the real display.
2. **The nine harnesses were not re-run.** ~400 mutations across steps 9 and 10 alone is far more
   than one foreground call, and the rule forbids backgrounding them or running them beside
   `pnpm verify`. A7 and A8 are from reading `regressions.py`'s ledger code and running
   `marked_tests()` against the real tree, plus **one** targeted mutation applied and reversed by
   hand to decide whether A7's hole is live. I did not re-audit the other 28 new mutations for
   biting on an accident; the two I read closely (`10g-AB6`'s `height` → `max-height`, which the
   text assertion at `alarm-banner.test.tsx:211` catches only because `(?:^|[^-])` excludes
   `max-height`, and `10g-AB2`'s move) both bite for the property their name records.
3. **A multi-day `for 2 d 06:00` elapsed form.** The banner's `since` is measured from the client's
   own ledger, which starts at page load, so a short session can only produce `for <1 min`. The
   handoff's "2 d 06:00 on every row" scenario is not fabricable from the wire; the head-wrap risk it
   feeds is therefore untested at the widest strings, though §2's last bullet bounds it.
4. **Whether the fade at 9/255 with nothing hidden is visible to a human at wall-panel distance.**
   The TEST phase's number reproduces in the geometry (`cooling messages` and `.rest` at ≤4
   conditions both sit at `scrollHeight === clientHeight` and still carry the fade), but "does it
   read as clipped" is a judgement about a display I do not have. I found no case in the other
   direction: every well that hides anything hides at least a whole 11 px line, so the
   1 px-hidden = 11/255 blind spot has no live subject.
5. **`hiddenMessageCount` with an empty `message` string**, which would render a 0-height `<p>` and
   over-count. I did not establish whether the wire validator admits `message: ''`.
