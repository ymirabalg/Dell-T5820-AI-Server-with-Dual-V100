# 10h — the GRID is bounded (BUILD). **§6.1's promise now holds for any telemetry, and the fixture that could see it did not exist until this loop built it.**

**Written 2026-09-10 by the build phase.** Nothing committed. `SPEC.md` and `MOCK.html` untouched.
No guard weakened. Three tests were re-aimed and one guard's own fixture list grew (§7); six
inherited mutation anchors were re-aimed, five because the code moved under them and one because a
RULING did (§7). Every figure below was measured by this phase, in real headless Chrome, on the
tree it describes.

---

## 0. The headline, before anything else

| | |
|---|---|
| `pnpm verify` (cold) | **exit 0 — 101 test files, 3054 tests, no type errors** (3010 before; +44, every one an assertion added) |
| `measure-breakpoints.mjs` | **38 passed · 0 failed · 0 blocked · 38 total, exit 0** (was 30/30 — measurement **14**, the hostile page, is new and carries eight records; two of measurement 12's were re-aimed, §5) |
| `check-density.mjs --fixture box` | **ALL PASS**, spare **263.2 / 227.6 / 283.6 px** — and **every one of the nine slots is identical, to the digit, at all three viewports** to the same run taken on the pre-10h tree (compared programmatically, not by eye). The bound does not shrink a panel that already fits |
| ⚠⚠ **the HOSTILE page** | **FITS at all three: spare 28 / 4 / 36 px.** Without the grid bound, the same page is **−92 / −64 / −8 px OVER** — measured on this tree by neutralising the caps and re-running |
| the heads | **all nine intact at all three viewports**, and structurally outside the scroller |
| the bodies that scroll on the hostile page | 1280: `gpu0`/`gpu1` hide 7 px each, `serving` hides 109 px · 1600: 18 / 18 / 46 · 1920: 5 / 5 / 35. **Six of nine panels are untouched even there** |
| §6.4's `+N more` | the banner accounts for **every** condition: `lead + drawn + N === the count it announces`, at 2 / 6 / 12 / 21 and at 500+ |
| §3.4's `model` | renders as its filename, raw on the wire, whole in the row's `title` |
| nine `regressions.py` harnesses | **all nine run serially in ONE call, all nine exit 0 — 1169 mutations** (was 1130), zero anchors moved or ambiguous, zero `DID NOT BITE`, zero unmatchable ledger keys, every ⚠ mark reddened. §8 |
| the tree | nothing committed, nothing staged, no `.env`, `next-env.d.ts` byte-identical, no stranded mutation |

---

## 1. The ruling, and the mechanism

### 1.1 Why the grid and not one more term

Four loops bounded one term each — the notes wells (10f), the throttle line, the table views and
§6.4's banner (10g) — and a new unbounded term appeared every time. 10g's adversarial measured the
end of that road: on the all-sources-explained page, which had **6 px** of spare at 1600×1024,
**any one** of four ordinary changes broke the fold (a notable mask −16, four alarm bits −40, a
third `llama-server` instance −42, a path-valued `model` −19 at 1280). The owner's ruling of
2026-09-10 stops bounding terms and bounds the container.

### 1.2 The mechanism, in one paragraph

`grid.module.css` gives every **slot** a `max-height` taken from its row's share of the height the
viewport has left; `panel-shell.module.css` makes the panel's **head** `flex: 0 0 auto` outside a
`.body` that is `flex: 0 1 auto; min-height: 0; overflow-y: auto`. A slot is a row-direction flex
box holding exactly one panel at `flex: 1 1 auto; min-height: 0`, so capping the slot caps the
panel (the panel is stretched to the slot's used height), and the body is then the only thing that
can absorb the difference. Nothing else in the grid moves: `align-items: start` and COOLING's
`align-self: stretch` are untouched, exactly as the ruling requires.

**Head pinning: a flex column, not `position: sticky`** — and the reason is the same one
`alarm-banner.module.css` gives for §6.4's count. A sticky head is *inside* the scroller and needs
an opaque ground of its own to stop readings scrolling visibly under it; this panel's ground is
`--surface-1` **plus**, at alarm severity, a gradient wash from its top edge, so no single colour
matches. A head that is not in the scroller at all needs no ground, cannot be scrolled past, and
keeps its bottom rule where it is instead of dragging it down the body. The measurement asserts
the structural fact rather than the visual one: **the head must not be a descendant of the
scrolling body**, because a head that *is* looks perfectly intact at scroll 0 — which is every
screenshot, and is exactly the shape of 10a-F13's two stacked stickies.

### 1.3 The per-row arithmetic

The caps live behind `@media (min-width: 1280px) and (min-height: 1024px)` — §6.1's own condition
(*"the promise holds at ≥1280px wide and ≥1024px tall … a 1280×800 display does scroll"*), so on a
short or narrow screen nothing is clipped and legibility wins, which is what the spec asks for.

```
--rows-available = 100vh − 102 (band) − 21 (grid padding) − 27 (three row gaps)
```

| term | px | measured how |
|---|---|---|
| `--band-reserve` | **102** | the sticky band at its tallest: the 43 px header plus §6.4's banner, which 10g made a fixed **58.8 px** at any alarm count. Measured band **43** without a banner and **101.8** with one, at all three viewports. The maximum is reserved unconditionally, because §6.1's promise is unconditional on the banner — a page with no banner simply keeps 59 px it is never asked to spend |
| `--grid-pad-v` | **21** | `.grid`'s own `padding: 9px 12px 12px` |
| `--grid-row-gaps` | **27** | three 9 px row gaps |

At the tightest viewport §6.1 names (1024 tall) that is **874.2 px** for the four rows. The four
shares are **derived, not chosen**:

```
cap(row) = healthy(row) + surplus × growth(row) / total growth
```

| row | healthy (measured, 1600×1024) | growth (10f-build §1.4's published budget) | cap at 1024 | share |
|---|---|---|---|---|
| 1 — GPU 0 / GPU 1 | 176 | +23 (the card's notes well) | **199.8** | `0.2286` |
| 2 — CPU / MEMORY | 240.1 | +23 | **263.9** | `0.3019` |
| 3 — SAFETY / STORAGE | 159.4 | +80 (four `StatusRow` explanations) | **242.3** | `0.2772` |
| 4 — SERVING / LOG | 129.8 | +37 | **168.1** | `0.1923` |
| | **705.3** | **163** | **874.1** | **1.0000** |

Two properties fall out, and both are asserted in `grid.test.tsx` rather than left as prose:

- **the shares sum to exactly 1**, which is what makes the page fit *by construction* —
  `band 102 + padding 21 + gaps 27 + Σ rows ≤ 100vh` holds for any telemetry whatsoever, and a
  page whose every row sits at its cap ends exactly at the fold; and
- **every share is comfortably above its row's healthy height** (the smallest margin is row 2's
  23.8 px), which is what stops a bound from shrinking a panel that already fitted.

**COOLING is bounded at `--row2-max + 9px + --row3-max`**, the cell it actually spans — the same
sum `check-density.mjs` already grades its stretched slot against. That matters and is not
belt-and-braces: a spanning grid item's contribution is distributed across the tracks it spans, so
an unbounded COOLING pushes rows 2–3 past their combined budget even when CPU, MEMORY, SAFETY and
STORAGE are all under theirs. Its own `max-height` clamps that contribution.

⚠ **Rounding to whole percents was tried first and rejected**: 23 / 30 / 28 / 19 also sums to 1
and also clears every healthy height, but it costs CPU and SERVING ~1 px of clipping on
measurement 11's page — the page every earlier loop was graded on — for no gain. The unrounded
shares are the derivation's own numbers and every fixture this project grades still fits with
nothing clipped (measurement 11 comes closest, at 0.8–3.3 px of margin per row).

### 1.4 What a panel body's `… N more` counts — the answer to `10g-Q1`, for a panel body

**Nothing. A panel body draws the fade and no count, and that is a decision with a reason rather
than an omission.**

The wells' marker is `hiddenMessageCount(total, bound) = max(0, total − LINES_SHOWN[bound])`, which
is honest only because every entry in a well is at least one line of one uniform height — the
structural fact that makes it a lower bound and never an overcount. A panel body's children are not
lines and are not comparable to each other: COOLING's chart is **174 px** and a `StatusRow` is
~19 px, and both are exactly one child. `entries − linesShown` has no meaning there, and any number
derived from it would be invented rather than measured.

Worse, for a panel body **neither half is derivable**: not the count, and not the *condition*
either (`scrollHeight > clientHeight`), because `purity.test.ts` forbids the hook that could
measure it. So the affordance is the half CSS computes exactly — the two-layer scroll-shadow every
bounded well already carries, with the cover painted in `--surface-1` (the panel's ground) instead
of `--surface-sunken` (a well's), because the mechanism only cancels when the cover matches the
box's own exact ground.

⚠ **Two honest qualifications, both recorded as silences in §6** rather than argued away: the fade
is *proportional*, not conditional (10g's TEST phase measured 9/255 with nothing hidden), and a
panel body's background paints **behind** its children, so an opaque last child — a `PanelNotes`
well, the log's own box — can occlude it. Where that happens the occluding child carries its own
fade at the same edge, which is a different fact drawn in the same pixels.

---

## 2. §6.4's banner — what fits, plus `+N more`

`AlarmBanner` renders `BANNER_REST_SHOWN = 3` conditions past the lead and a `+N more` for the
remainder. **The cap is in the component, not in `lib/client/banner.ts`**: `bannerView` still
returns `rest` uncapped, so the pinned count stays `1 + rest.length` — derived from the whole list,
which is 10a-F14's property and the thing that stops this being a lying banner again. What the cap
decides is only how many are *drawn*, and the remainder is stated beside them.

**Three is measured** (10g-A6, at 1280×1024): with `.rest` taking the banner's full width, **four
items are fully visible** at 6, 12 and 21 conditions; the `+N more` marker takes one of those four
slots. ⚠ It is a constant, and it has to be — what actually fits is a function of rendered text
width, which `components/` cannot measure. At ≥1600px more would fit (measured: the first hidden
condition appeared at twelve rather than at six), so three is a floor there rather than the exact
answer. §6 records that.

**The marker is a SIBLING of the well, not a child of it** (`.restLine` is a flex row; the well is
`flex: 1 1 0; min-width: 0` and the marker `flex: 0 0 auto`). Inside, it would be one more item
competing for the same line and could itself be the item pushed out of view — a marker saying how
much you cannot see, which you cannot see. `flex: 1 1 0` and not `1 1 auto` is 10g-A2's lesson one
box over: a wrapping flex container breaks lines on each item's *hypothetical* main size, so a
`flex-basis: auto` well would offer its whole max-content width and push the marker onto a second
line this banner does not have.

**The marker is NOT `aria-hidden`**, unlike a well's `… N more`. A well hides nothing from a
screen reader — every message is in the DOM. Here the counted conditions really are absent, so this
is the only thing that tells a screen-reader user the list it just read is partial.

**The well keeps its scroll, its fade, its name and its tab stop.** The cap is a constant, so a
long enough label can still overflow one line; then the fade says so rather than the tail vanishing
silently.

**Measured**, at 1280 (`measure-breakpoints.mjs` m12, printed on PASS):

| conditions | drawn | `+N more` | `.rest` client / scroll | last drawn item's bottom |
|---|---|---|---|---|
| 2 | 1 | — | 21 / 21 | 21 |
| 6 | 3 | **+2** | 21 / 21 | 21 |
| 12 | 3 | **+8** | 21 / 21 | 21 |
| 21 | 3 | **+17** | 21 / 21 | 21 |

Before: `.rest` scrolled to **48 / 75 / 128** at those counts with `offsetHeight − clientHeight = 0`
— no scrollbar in layout, on a wall panel with no pointer — so 16 of 21 conditions were unreadable.
Now `scrollHeight === clientHeight` at every count: what the banner claims is what a reader sees.

The banner's height is **58.8 px at every count**, unchanged (m12's equality record still passes).

---

## 3. §3.4 — `model` renders as its filename

`lib/format.ts` gains `formatModelName`, in the shape `formatCpuModel` already had: it takes the
segment after the last `/`, and **falls back to the whole trimmed string** rather than to an empty
cell when there is no final segment (`/home/yorman/models/`), because §6.6 forbids a blank cell as
firmly as it forbids `N/A` and *"too long"* is a better failure than `—`.

There is no *"does this look like a path"* branch, deliberately: §3.4 says *"a path's identity is
its filename, and an alias is already a filename-shaped word, so the two forms render alike"*, and
the last segment of a string with no separator is the string. Nothing is prettified — no extension
stripped, no case changed, no lookup — and a backslash is **not** a separator (the box is Linux and
§3.4's source is `/etc/llama-server/<i>.env`).

Two call sites, and both keep the raw reading:

| where | visible | raw kept in |
|---|---|---|
| `serving-panel.tsx`'s row `inline` | `Qwen3.6-27B-Q4_K_M.gguf · ctx 131,072` | the row's `title` (new `StatusRow.inlineTitle`) |
| `gpu-panel.tsx`'s `served by instance N` strip | `Qwen3.6-27B-Q4_K_M.gguf` | the item's `title` (new `StripItem.title`) |

Both new props are `string | null` and render **no attribute at all** when null — `title=""` and
`title="undefined"` are the two ways this ships unnoticed, and both sides are fixtured. The `title`
is on the **inline span**, not the row: a `title` on the row would name the whole row after one of
its readings.

**Measured value on the hostile page**, where all three instances carry paths: without the
filename rendering the page is a further ~+21 px per SERVING row and ~+17.9 px per GPU card, the
figures 10g measured. With it, the strings are bounded by the panel and by their own filenames.

⚠ **Spec silence:** §3.4 says the whole string stays reachable *"in the row's `title` and the table
view"*. SERVING draws no chart and therefore has no table view, and the GPU card's table view is
the temperature series — neither carries `model`. The `title` is implemented; the table-view half
has no subject on this page. §6 records it.

---

## 4. The hostile fixture — measurement 14

⚠ **Every browser fixture in this project hard-coded `throttleReasons: '0x…04'`, which is not
`notable`**, so `gpu-panel.tsx`'s `decode.notable` guard meant **no page this project had ever
measured rendered a throttle line at all.** That is why four independent ways to break the fold
stayed invisible until an adversarial phase fabricated the mask by hand. The fixtures were part of
this loop's work.

`fixtureHostile()` carries, all at once:

- **all eighteen of §3.7's sources explained**, each with the real 150-character DKMS message, plus
  **three** instance-tagged `llama-health` entries (§4's `TelemetryError.instance` is what puts an
  explanation on a SERVING *row* rather than in the panel block);
- **`0x…ec` on both cards** — §6.3's four alarm bits beside the routine 250 W cap;
- **three `llama-server` instances**, which §3.4 requires to work;
- **path-valued models** on all three;
- **every §6.3 alarm band standing at once** (measurement 12's 21-condition set, verbatim), so the
  banner is pinned and every panel wears its alarm ground;
- **the session event log at its 500-entry cap**;
- and measurement 14 **opens every table view** before it grades the fit.

**How the log is driven to `MAX_EVENTS` (500), and why it is a fixture device.** It cannot be done
by churning readings: §6.4 debounces every transition by *ten seconds of wall time the client was
sampling*, so each confirmed band costs ~10 s and 500 entries would cost minutes of run time. What
*does* log immediately is a **first sighting that is already non-normal** (`events.ts`: *"a
dashboard opened during an alarm must not show an empty log"*), so one poll carrying N alarming
subjects writes N entries. Extra GPU indices are the cheapest such subject — §3.1's `gpus` is an
array of any length and §6.1's grid renders GPU 0 and GPU 1 only, so an extra card adds three alarm
conditions and **no panel**. `HOSTILE_EXTRA_GPUS = 168` plus the 21 ordinary conditions is past
500. It manufactures the log's own documented cap, which `session-event-log-panel.module.css`
claims to absorb at `height: 84px` (*"133.8 px whether the log holds one entry or five hundred"*) —
asserted by 10e, and never measured on a graded page until now. A second effect worth having: the
banner is then asked to account for **five hundred** conditions rather than twenty-one.

### 4.1 The result, before and after

| viewport | hostile, caps neutralised | hostile, as shipped | 10g's compound row, for comparison |
|---|---|---|---|
| 1280 × 1024 | **−92 px OVER** | **+28 px spare** | −113 |
| 1600 × 1024 | **−64 px OVER** | **+4 px spare** | −64 |
| 1920 × 1080 | **−8 px OVER** | **+36 px spare** | −8 |

The "caps neutralised" column is this tree with `max-height: var(--rowN-max)` replaced by
`max-height: none` and nothing else changed — so it is the same page, the same fixture and the same
run, differing in exactly the declaration the ruling adds. It also reported **`scrolling bodies:
none`**, which is the other half of the same evidence: the caps are what causes the scrolling, and
without them nothing scrolls and the page grows instead.

### 4.2 What is scrolling, and what is not

Recorded on PASS as well as FAIL, because *"the page fits"* is worthless without it — a page fits
trivially if every panel has been clipped to nothing:

| viewport | bodies that scroll | everything else |
|---|---|---|
| 1280 × 1024 | `gpu0` and `gpu1` hide **7 px** each (body 150 of 157); `serving` hides **109 px** (body 119 of 228) | six of nine panels show every reading |
| 1600 × 1024 | 18 / 18 / **46** | as above |
| 1920 × 1080 | 5 / 5 / **35** | as above |

And **all nine heads are intact at all three viewports**, structurally outside the scroller.

### 4.3 The eight preconditions

Measurement 14 asserts, before it grades anything: the throttle line renders on **both** cards; the
third instance is on the page; every model shows as a filename **and no directory is rendered**
(asserting only the filename would pass on a raw path, which contains it); the DKMS message is
under CPU **and** under SAFETY; the banner is pinned with more than 21 conditions; the log holds
≥ 500 entries; five table views are visible and four controls were found.

### 4.4 ⚠ Every new measurement was probed by BREAKING it

Two of 10g's measurements shipped vacuous, and 10c-3's shipped two more. Each record below was
shown to FAIL on the defect it names, on this tree, and then restored (with the edit that reverses
it — never `git checkout --`):

| record | probe | result |
|---|---|---|
| `14. <vp> no-scroll promise` ×3 | the five `max-height` caps → `none` | **FAIL** at all three (−92 / −64 / −8), and `scrolling bodies: none` |
| `14. the HOSTILE fixture TOOK` | mask back to `0x…04`, one model back to an alias | **FAIL** |
| `14. §6.4's banner ACCOUNTS…` | `+${hidden}` → `+${hidden + 1}` | **FAIL** |
| `14. every panel HEAD is intact` ×3 | the head moved inside `.body` | **FAIL** at all three |
| `12. §6.4 ACCOUNTS for every condition` | the same off-by-one marker | **FAIL** |
| `12. every condition the banner DRAWS is on screen` | `BANNER_REST_SHOWN = 15` | **FAIL** (the last drawn item ends below the one visible line) |

---

## 5. Two measurement-12 records were RE-AIMED, and the reason is a ruling, not a convenience

10g graded §6.4's banner on *"nothing is dropped"* — one rendered item per condition, in the DOM,
reachable by scrolling. The owner then measured the **screen** rather than the DOM and ruled the
other way one day later. So that record is false by design now, and it is replaced by the two
claims a capped banner can actually make, both **stronger** than what they replace:

1. **nothing is unaccounted for** — `1 (lead) + drawn + '+N more' === the announced count`,
   arithmetic rather than a search for labels; and
2. **what it draws is on screen** — the last drawn item must end inside the well's **one visible
   line**. 10g's version asked only that it be inside the *scrollable content*, which is exactly
   what let sixteen of twenty-one sit below the fold and still report PASS.

Both still refuse the `display: none` pass 10g's TEST phase found (`restVisible`,
`restClientHeight`), because that hole is orthogonal to which ruling is in force.

The same re-aim was applied to `alarm-banner.test.tsx`'s ⚠ `test.each`, in the same words and for
the same reason.

---

## 6. Spec silences — recorded, not chosen (invariant 7)

1. ⚠ **A panel body gets the fade and NO `… N more`** — the answer to `10g-Q1` for a panel body,
   and §6.1's affordance sentence does not distinguish a well from a body. Neither the count nor
   the condition is derivable from data (§1.4 has the reasoning); a number here would be invented.
2. ⚠ **The fade on a panel body can be OCCLUDED.** A background paints behind its element's
   children, and a body's last child may be opaque (a `PanelNotes` well, the log's box). Where it
   is, that child carries its own fade at the same edge. Making the panel's own affordance paint
   *over* its content would require an out-of-flow overlay, which cannot be made conditional on
   overflow in CSS — so it would draw on every panel, always, including the ones hiding nothing.
3. ⚠ **`BANNER_REST_SHOWN = 3` is the DESIGN-WIDTH count, and it is a floor at ≥1600px.** §6.4 says
   *"the conditions that fit its two lines"*; what fits is a function of rendered text width, which
   `components/` cannot measure. Measured, the first hidden condition appeared at six conditions at
   1280 and at twelve at 1920, so a wide viewport could show more than three. The two-variant
   media-query trick the GPU charts use would fix it and doubles the DOM; not taken without a
   ruling.
4. ⚠ **§3.4's *"and the table view"* has no subject.** SERVING draws no chart and so has no table
   view; the GPU card's table view is its temperature series and carries no `model`. The `title`
   half of the ruling is implemented at both call sites.
5. **The panel body is a named, focusable `role="group"` — nine new tab stops.** §6.1 does not ask
   for it. Without it a panel whose only clipped content is plain text would be unreachable by
   keyboard, which is a hole this change would have *opened*; with it, `` `${title} readings` `` is
   new copy of the region-name kind (the precedent is 10f's `` `${subject} messages` `` and 10g's
   `other alarm conditions`).
6. **`--band-reserve` reserves the banner unconditionally**, so a page with no alarm keeps 59 px it
   is never asked to spend. §6.1 makes the promise unconditional on the banner; it says nothing
   about giving an un-alarmed page more room. Making the reserve conditional on the banner's
   presence is a DOM attribute and two CSS lines if the owner wants it.
7. **The caps are behind `(min-height: 1024px)` as well as `(min-width: 1280px)`.** §6.1 conditions
   its promise on both, and *"below either bound, legibility wins"*; that is read here as "do not
   clip a 1280×800 display", which is a reading of the sentence rather than a rule it states.
8. ⚠ **`HOSTILE_EXTRA_GPUS = 168` is a fixture device, not a plausible machine.** §3.1's `gpus` is
   an array of any length and §6.1 draws two cards, so the extra indices add conditions and no
   panel — which is how the log's own 500-entry cap is reached inside a graded run (§4). It also
   takes the banner to 500+ conditions, which is the direction that matters for `+N more`.
9. **Measurement 11's page now clips nothing, but by 0.8–3.3 px per row.** That is a margin, not
   comfort. The terms that would eat it are the same ones §6.1's ruling names — and they no longer
   break the *page*, only that row's own scroll.

---

## 7. What changed in the tree

### Source (10 files)

| file | what |
|---|---|
| `components/tokens.css` | `--panel-fade-cover`; `--band-reserve` / `--grid-pad-v` / `--grid-row-gaps` / `--rows-available` / `--row1-max`…`--row4-max` / `--row23-max`, with the full derivation |
| `components/grid.module.css` | the per-slot caps, behind `(min-width: 1280px) and (min-height: 1024px)` |
| `components/panel-shell.module.css` | `.head` `flex: 0 0 auto`; `.body` becomes the bounded, positioned, faded scroller |
| `components/panel-shell.tsx` | the body is a named, focusable `role="group"` carrying `data-role="panel-body"` |
| `components/alarm-banner.tsx` | `BANNER_REST_SHOWN`; `shown`/`hidden`; the `+N more` marker beside the well |
| `components/alarm-banner.module.css` | `.restLine`, `.more`; `.rest` gains `flex: 1 1 0; min-width: 0` |
| `components/strip.tsx` | `StripItem.title` |
| `components/panels/status-row.tsx` | `StatusRowProps.inlineTitle` |
| `components/panels/serving-panel.tsx` | `formatModelName` + `inlineTitle` |
| `components/panels/gpu-panel.tsx` | `formatModelName` + the strip item's `title` |
| `lib/format.ts` | `formatModelName` |

### Tests (8 files, none weakened)

`components/grid.test.tsx` (+the whole cap and token-share block), `components/panel-shell.test.tsx`,
`components/alarm-banner.test.tsx`, `components/styles.test.ts`, `components/strip.test.tsx`,
`components/panels/status-row.test.tsx`, `components/panels/serving-panel.test.tsx`,
`components/panels/gpu-panel.test.tsx`, `lib/format.test.ts`.

**Three re-aims, none narrower than the original:**

1. `grid.test.tsx`'s breakpoint test read `@media \(min-width: (\d+)px\)` and now reads the whole
   prelude — **strictly stronger**: it pins §6.1's *other* bound (`min-height: 1024px`), which the
   old shape structurally could not see.
2. `alarm-banner.test.tsx`'s ⚠ `test.each` — *"every condition is in the DOM"* → *"every condition
   is either drawn or counted by `+N more`"*, plus the arithmetic reconciliation. §5 has the
   reasoning.
3. `styles.test.ts`'s bounded-panes list grows from seven to **eight** (`panel-shell.module.css`).
   The list grew for the third time; nothing has ever left it.

### Measurement (1 file)

`measure-breakpoints.mjs` — `fixtureHostile`, `HOSTILE_MODEL_PATHS`, `HOSTILE_EXTRA_GPUS`, a
`hostile` fabrication mode, `setViews` hoisted to module scope so measurements 13 and 14 cannot
disagree about what "open" means, **measurement 14** (five records), the two re-aimed measurement-12
records, and the scrolling-bodies line printed on PASS.

### Harnesses (3 files)

| harness | before | after | new ids |
|---|---|---|---|
| `02-format-severity` | 60 | **65** | `10h-FM1`…`FM5` |
| `09-ui-primitives` | 138 | **152** | `10h-PS1`…`PS10`, `10h-ST1`/`ST2` |
| `10-panels-assembly` | 268 | **290** | `10h-GR1`…`GR10`, `10h-AB1`…`AB5`, `10h-SR1`/`SR2`, `10h-SV1`/`SV2`, `10h-GP1`…`GP3` |

**1169 mutations across the nine** (was 1130), re-derived by importing each `regressions.py`.
Step 10's id-prefix guard accepts `10h-`.

**Six inherited anchors re-aimed, none weakened.** Five moved because 10h's edits re-indented or
re-shaped the code they pointed at; one was re-aimed because a RULING moved under it:

| id | why it moved | how it is pinned now |
|---|---|---|
| `10e-ST1` | the `<dd>` became multi-line when it gained its `title` | the same element, the same em-dash exception |
| `10e-SR2` | the inline span became multi-line for the same reason | the same element, the same property |
| `10e-SV1` | the model half of that line is `formatModelName` now | the same `ctx` default, unchanged |
| `10g-AB2`, `10g-AB3` | the well is nested one level deeper inside `.restLine` | the same attributes / the same MOVE, at the new indentation |
| ⚠ `10g-AB1` | it defended *"the banner never caps its own list"*, which §6.4's ruling of 2026-09-10 **reversed** one day after 10g built it | re-aimed onto the successor property a capped banner can still be held to: a SECOND, silent cap past the declared one, so `+N more` under-counts and the accounting stops reconciling |

⚠ **`10h-GR10` DID NOT BITE on its first run, and the reason is this project's own recurring
shape.** `align-items: start` → `stretch` left `grid.test.tsx` green, because that file's assertion
read the raw stylesheet and the module doc **quotes the rule it guards**. The test now strips
comments before matching, the same convention `styles.test.ts` has carried since 10c-2. The
mutation is what found it.

---

## 8. The nine harnesses, as this build left them

Run **serially, in one call, on the tree this file describes**; every number below is read off that
run's own printed lines, never carried forward. **All nine exit 0.**

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | **65** | 280 red across 65; 29 ⚠ checked | **exit 0** |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | **152** | 209 red across 152; **154** ⚠ checked | **exit 0** |
| `10-panels-assembly` | **290** | 337 red across 290; **298** ⚠ checked | **exit 0** |

**1169 mutation ids** (was 1130), zero cross-harness collisions, **zero `ANCHOR NOT FOUND`, zero
`ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, zero unmatchable ledger keys, and every ⚠ mark reddened.**

⚠ **Steps 3–8 are identical to 10g's run in every column**, which is the check that says nothing
under `lib/` (other than `lib/format.ts`) or `app/` moved: step 2 grew because `formatModelName` is
§3.4's ruling and `lib/format.test.ts` is its harness's own ledger file; steps 9 and 10 own every
other file this loop touched. All nine were run because the acceptance is the whole set.

⚠ **Four of this loop's own ⚠ tests were inert on the first full run, and the ledger is what found
them** — the boundary cases where a new optional prop renders *no* attribute (`strip`,
`status-row`, `gpu-panel`) and `align-items: start`. Each now has a mutation (`10h-ST2`,
`10h-SR2`, `10h-GP3`, `10h-GR10`). HANDOVER §0.8's rule paid for itself again: **an optional prop
is an untested one until both sides are fixtured *and* both sides have a mutation.**

⚠ **On the "one FOREGROUND call" rule.** The nine take ~11 minutes and this environment's
foreground tool caps at 10, so they were run as **one detached call** — still one command, still
strictly serial, nothing else running beside them, and no `pgrep` anywhere. The rule's two hazards
(concurrency and the self-matching wait loop) are both avoided; only the word "foreground" is not
literally met, and it is recorded here rather than glossed.

---

## 9. What a reviewer should check first

1. **Run `measure-breakpoints.mjs` yourself.** Measurement 14 is the acceptance, and §4.4's probe
   table is the reason to believe it — in particular the caps-neutralised column, which is the
   BEFORE number taken on this tree rather than quoted from 10g.
2. **§1.3's arithmetic**, and specifically that the four shares sum to 1. That is the whole of why
   the page fits for *any* telemetry rather than for the fixtures that happen to exist.
3. **`check-density.mjs` being identical to 10g's to the digit.** A bound that shrank a panel that
   already fitted would be a regression dressed as a fix, and that is the check that would see it.
4. **§6's silence 1** — a panel body draws the fade and no count. It is the answer to an open owner
   question, and it is a decision not to invent a number.
