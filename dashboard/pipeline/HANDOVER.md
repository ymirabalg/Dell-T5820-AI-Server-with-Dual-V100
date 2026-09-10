# Handover — after step 11. **The deployment artefacts exist and are measured AT THEIR CALL SITES: 49 of 63 one-line edits used to disconnect a guard with the whole suite green, and the count is now 0 of 48. `--gpus all` falls back rather than taking the dashboard down, and `check` reports which mode is in force. Step 10's §6.1 answer is kept in full at §0.0.1.**

**Rewritten 2026-09-10 by step 11's reconciliation**, on top of 10h's. §0.0 and §0.13 are step
11's; §0.0.1 and §0.1-§0.12 are step 10's, unchanged and still the inheritance for anything that
touches `lib/`, `app/` or `components/`. **Step 11 touched none of those** — it wrote
`dashboard.sh`, `Dockerfile`, `.dockerignore`, `systemd/ai-dashboard.service`, `README.md` and
`packaging.test.ts`, and nothing else.

**Previously rewritten 2026-09-10 by 10h's reconciliation** (the owner's ruling of 2026-09-10 — the grid
itself is bounded — plus §6.4's `+N more`, §3.4's `model` as a filename, and the same day's two
follow-on rulings on the hostname and on headroom), on top of 10g's. Steps 1–8 are closed,
**step 9** is closed, **Q1** and **Q2** are closed, and every loop of **step 10** — 10a, 10b,
10b-S-G, 10c-1, 10c-2, 10c-3, 10e, 10f, 10g and now **10h** — is closed pending the parent's
review. 10d is a withdrawn design investigation kept as a record; **its stage 2 ("bound the grid")
is what 10h built.** This file is the whole inheritance: the next phase's agents get clean context
and read it as fact.

---

## 0.0 ⚠⚠ READ THIS FIRST — **step 11 is closed pending parent review. The deployment artefacts exist, and the thing that was wrong with them was not any one guard: it was that 49 of 63 one-line edits could disconnect a guard with the whole suite green. That is fixed at the cause, and the count is 0 of 48.**

**Step 11 wrote four files and nothing else**: `dashboard.sh` (2099 lines), `Dockerfile`,
`.dockerignore`, `systemd/ai-dashboard.service`, plus `README.md` and `packaging.test.ts`. They are
the only files in this repository that **nothing else in the suite can see**, and three of them
encode rules whose every failure mode is silent.

| the question | the answer |
|---|---|
| **Is the deployment path measured?** | **Yes, and for the first time it is measured at the CALL SITES.** `pnpm verify` **exit 0 — 102 files, 3121 tests**; `python3 pipeline/steps/11-packaging/regressions.py` **exit 0 — 130 mutations, all bit, 60 of 60 ⚠ tests reddened**; `shellcheck dashboard.sh` clean |
| **⚠⚠ What was wrong?** | **49 of 63 one-line edits to those four files kept the whole suite green** (adversarial, 2026-09-10) — every `check` row the test phase had not wired, all seven preflight refusals, `restart`'s container-id proof, `install`'s own failure gate, and `check_one_process` **deleted from `cmd_check` outright**. Two structural causes: nothing asserted **which functions `cmd_check` calls**, and nothing asserted **that a guard REFUSES** — only that it could be called |
| **Is it fixed?** | **Yes, at the cause rather than at the 49 instances, and the count is the evidence: 48 of 48 enumerated survivors now FAIL the suite.** A call-graph assertion over `cmd_check` (source-text *and* behavioural) and a three-part guard-refusal table (38 `check`-row cases, 12 preflight cases, 14 subcommand cases), each with its bad input and its good one |
| **Does `check` now detect a reboot survivor?** | **Yes — `systemctl show -p UnitFileState`, which did not exist anywhere.** PLAN row 12's acceptance criterion is literally *"survives a reboot"* and it had **no detector**: `check_unit` read `StartLimitIntervalUSec` and `ActiveState`, both of which reflect the unit FILE after a `daemon-reload` |
| **`--gpus all`?** | **Falls back, per INSTALL-SPEC §11.1 — built in this loop.** One `ExecStart`, `$GPU_FLAGS` **unbraced**, an `ExecStartPre` probe that asks `nvidia-container-cli info` and never starts a container of this repository, and a **three-state** `check` row that reads `docker inspect .HostConfig.DeviceRequests` off the container and **re-probes** — so *fallback while the toolkit now works* is a failing, actionable row and a fallback cannot outlive its cause |
| **What is still open?** | Three owner questions (`11-Q1` `Restart=on-failure`, `11-Q2` both secrets in the container's environment, `11-Q3` the flag-by-flag container-vs-unit diff) and the seven box-side verifications below. §8 |

### ⚠⚠ What step 12 must verify ON THE BOX, and cannot verify anywhere else

**There is no Docker and no systemd on this Mac.** Nothing in step 11 has been run against a
built image, a running container or a real boot; everything about them is read from the code and
from documented Docker/systemd behaviour, and `steps/11-packaging/reconciliation.md` §5 says which
is which. Seven things are step 12's, in the order they bite:

1. ⚠ **`install` now REFUSES on ai-server until `sudo ufw enable` has been run.** That is
   deliberate (`11-A9`): `cmd_firewall` already refused on a non-enforcing ufw, but at step 6 of
   8 — after docker was installed and **restarted**, the image built, the password written and the
   unit **enabled**, so the deployment would first have come up at the next reboot, unattended,
   with no rule, while the operator's last signal was a failure. The refusal is now at step 0.
   ⚠ **Enabling ufw is what took this box off the network on 2026-09-04.** Run
   `sudo ufw show added` first, from a session you keep open and do not close, and confirm a
   port-22 rule before `ufw enable`.
2. **`docker build` actually succeeds**, and `pnpm install --frozen-lockfile` resolves the
   linux/x64 `sharp` variant. Never run here.
3. **The GPU probe's ordering.** `ExecStartPre` writes `/run/ai-dashboard-gpu.env` and
   `EnvironmentFile=-` reads it. The belief is that systemd loads environment files in the forked
   child, per executed command, so the same start sees it — ⚠ **recalled, not verified**: no
   systemd here, and it was not confirmed against a document or a running instance. The design is
   safe either way — if systemd instead reads once at unit start, the first boot falls back and
   `check` says *"FALLBACK … but nvidia-container-cli answers NOW … Fix: restart"* — but step 12
   should observe which happens: `docker inspect ai-dashboard --format
   '{{json .HostConfig.DeviceRequests}}'` on the first start after a boot.
4. **`journalctl -b --system | grep "ordering cycle"` AS ROOT**, after a real boot. `check`'s row
   now has three answers rather than two, and only a boot produces the interesting one.
5. **`systemctl show ai-dashboard -p UnitFileState`** after that boot — the new detector for
   PLAN row 12.
6. **The running container against the unit's `docker run` line** — the deferred half of `11-A4`:
   `docker inspect ai-dashboard --format '{{json .Config}}{{json .HostConfig}}'`. `check` compares
   the image id and the GPU device request; nothing compares the mounts or the log options.
7. **`--read-only` at runtime**: whether Next 16's standalone server tries to create `.next/cache`
   with only `/tmp` as a tmpfs. Unknown here, one look there.

---

## 0.0.1 — step 10's closing state, kept in full. **§6.1 HOLDS, and here is exactly what it costs in hidden readings.**

**The answer to "does §6.1 hold", in one table, all of it measured by 10h's reconciliation on the
tree it left.**

| the question | the answer |
|---|---|
| **Does the page fit?** | **Yes, for any telemetry.** `documentElement.scrollHeight <= clientHeight` at 1280×1024, 1600×1024 and 1920×1080 on every graded fixture: healthy **263.2 / 227.6 / 283.6** px spare, all-collectors-failed **140 / 104 / 160**, the real box's DKMS failure **164 / 129 / 185**, all-sources-explained **41 / 6 / 62**, and the **HOSTILE** page — notable throttle mask on both cards, three `llama-server` instances, path-valued models, every source explained, a 500-condition banner, 500 log entries, every table view open, a 150-character hostname — **28 / 4 / 36**. It fits **by construction**, not by fixture: `band 102 + padding 21 + gaps 27 + Σrows ≤ 100vh` with the four row shares summing to exactly 1 |
| **Is anything HIDDEN to buy that fit?** | **No, on the four pages the design is supposed to hold whole.** New in this loop: `recordNoClipping` grades *"no panel body hides a reading, on either axis"* at all three viewports on the healthy page, the real box's degraded page, the all-collectors-failed page and the all-sources-explained page — **12 records, all PASS**, with the closest-to-its-cap margin printed on every one |
| **What IS hidden, then?** | **The hostile page, by design and by measurement.** `gpu0` 7 px · `gpu1` 7 px · `serving` 109 px at 1280×1024; **18 · 18 · 46** at 1600×1024; 5 · 5 · 35 at 1920×1080. **Six of nine panels show every reading even there**, all nine heads are intact and structurally outside the scroller, and **zero px is hidden horizontally on any of the nine** |
| **How much margin is left?** | ⚠ **Very little on one page.** All-sources-explained at 1600×1024: every one of the four rows is within **0.7–2.9 px** of its cap at once — 5.7 px of slack in 874. That page is the tightest thing this project grades and it is now graded on both criteria rather than one |
| **What is still open?** | Two things, both the owner's, both with numbers: the band is bounded against **telemetry** and not against a browser's **minimum-font-size setting** (`10h-Q1`), and **59 px of band reserve is spent unconditionally** on pages that have no banner (`10h-Q3`) — which is where the headroom the owner asked for already is |

### ⚠⚠ The finding that changed this loop's shape: the caps made the acceptance blind to the caps

Before 10h, too much content made the **page** scroll — loud, and graded by nine records. After
10h, too much content makes a **panel body** scroll, which on a pointerless wall panel means a
reading behind a fade — and **no measurement failed when that happened.** 10h's adversarial proved
it end to end: a compensating share pair (`--row1-max` 0.2286 → 0.2200 with `--row2-max`
0.3019 → 0.3105 — the sum still exactly 1, both shares still clearing their healthy constants)
clipped 7 px of GPU readings off the graded page while `measure-breakpoints.mjs` reported
**44 passed, 0 failed**, and the printed page spare **improved from 6 px to 12 px because a panel
had been clipped.** The project's tightest fit number rewarded the defect.

**So "the page fits" was necessary and stopped being sufficient, and the reconciliation added the
sufficient half.** Under the same defect the same script now reports **57 passed, 2 failed**,
naming `gpu0 hides 7px · gpu1 hides 7px`. **This is the shape to carry forward: a bound that
converts a visible failure into an invisible one obliges you to grade the invisible one in the
same loop.** It is this project's founding failure shape — `null` rendered as though it were data —
one layer up.

### ⚠⚠ The owner's headroom ruling was measured BOTH WAYS and NOT shipped, deliberately

Ruled 2026-09-10, **before** the clipping findings existed: *the four shares sum to ~0.98 rather
than 1.0, buying ~18 px at 1024 tall.* Shrinking the shares shrinks the caps, and the caps are what
decide when a body starts hiding readings — so it was run both ways, in full, on the same tree.

| | **shares sum 1.0** (shipped) | **shares sum 0.98** |
|---|---|---|
| page-fit records, every graded page | all PASS | all PASS |
| page spare, all-sources-explained | 41 / **6** / 62 px | 45 / **18** / 62 px |
| page spare, hostile | 28 / **4** / 36 px | 37 / **18** / 44 px |
| bodies hiding a reading — healthy, real-box-degraded | **none** | **none** |
| bodies hiding a reading — **all collectors failed** | **none** | `safety` 2 px at 1280; **`gpu0` 3 · `gpu1` 3 · `cpu` 2 · `safety` 2** at 1600 |
| bodies hiding a reading — **all sources explained** | **none** | `safety` 2 · `serving` 2 at 1280; **`gpu0` 3 · `gpu1` 3 · `cpu` 4 · `safety` 2 · `serving` 2** at 1600 |
| `measure-breakpoints.mjs` | **59 passed, 0 failed, exit 0** | **55 passed, 4 failed, exit 1** |

**0.98 buys 12–14 px of page spare at 1024 tall by hiding 2–4 px of readings in four or five panels
on two pages that were showing everything.** The whole cost lands on the two viewports §6.1 names
as the design target; 1920×1080 absorbs it.

**And re-proportioning is not the alternative, with arithmetic:** on the all-sources-explained page
at 1600×1024 all four rows sit 0.8–2.9 px from their caps *simultaneously* — 5.8 px of slack in
874. The visible slack is in MEMORY (~76 px), STORAGE (~24) and the LOG (~38) — and it is
unavailable, because §6.1's row
model is `row2 = max(CPU, MEMORY)` and `row3 = max(SAFETY, STORAGE)`: a row's share cannot be cut
toward MEMORY without clipping CPU. **There is no donor row.** Only enlarging `--rows-available`
produces headroom, and the only term available to enlarge it is `--band-reserve`.

**Which is where the headroom already is.** `--band-reserve: 102px` is the band *at its tallest* —
the 43 px header plus §6.4's fixed 58.8 px banner — reserved unconditionally. Measured on the
all-collectors-failed page, which has **no banner** and a real band of **43 px**:

```
1600x1024   page spare 104 px   band 43 of a reserved 102   gpu0 sitting 1.0 px from clipping
```

**59 px of screen is reserved that the page is not using and the rows are forbidden to use, while a
row is one pixel from hiding a reading.** Making the reserve conditional on the banner's presence
is strictly better than 0.98 on both criteria at once — unchanged when a banner stands, +59 px of
row budget when none does — and the build already costed it at *"a DOM attribute and two CSS
lines"*. **It is `10h-Q3` and it is the owner's**, not least because a conditional reserve is
exactly the second declaration `10h-A2`'s new guard is written to refuse.

### What 10h built, and what its reconciliation added

| ruling | built | measured after |
|---|---|---|
| ⚠⚠ **the GRID is bounded** (`SPEC.md` §6.1) | every slot gets `max-height: var(--rowN-max)` behind `(min-width: 1280px) and (min-height: 1024px)`; the panel head is `flex: 0 0 auto` **outside** a `.body` that is `flex: 0 1 auto; min-height: 0; overflow-y: auto; position: relative` and carries the continuation fade | the hostile page fits **28 / 4 / 36** where the same page without the caps is **−92 / −64 / −8 OVER**; all nine heads intact at all three viewports; 3000 px into every body in turn stops every slot **exactly at its own row's cap** |
| **§6.4's `+N more`** | `BANNER_REST_SHOWN = 3` drawn, the remainder counted beside the well (a `flex: 0 0 auto` SIBLING, not a child), the pinned count still derived from the whole list | `lead + drawn + N === the count announced` at 2 / 6 / 12 / 21 **and at 529**; banner **58.8 px at every count** |
| **§3.4's `model` as a filename** | `formatModelName`, with the raw string kept in the row's `title` and the strip item's `title` | worth +21 px per SERVING row and +17.9 px per GPU card on the hostile page |
| ⚠ **§3.2's `hostname` truncated** (reconcile) | `.hostname` gains `max-width: 320px; overflow: hidden; text-overflow: ellipsis`; a `hostnameTitle` prop keeps the whole reading, rendering **no attribute at all** when null | the hostile fixture carries a **150-character** FQDN and the band measures **101.8 of 102 at all three viewports**. Before the ruling a **79**-character one took it to **130.7** and the page 1 px over |
| ⚠ **headroom** (reconcile) | **measured both ways, 1.0 kept** — see the table above | — |

**What the reconciliation fixed on top of that** (adjudication table:
`steps/10-panels-assembly/10h-reconciliation.md` §1 — **10 findings, 8 accepted-and-closed, 2
accepted-and-deferred, 3 sub-claims rejected with the refuting line quoted**):

- ⚠⚠ **The acceptance's missing half** (`10h-A3`) — `recordNoClipping`, 12 new graded records,
  probed with the adversarial's own compensating share pair.
- ⚠ **Three guard defects, each a one-line edit that left 3056 tests green and the page 5, 21 and
  37 px wrong** (`10h-A1`/`A2`/`A8`). One shape three times: *a text assertion cannot see a later
  override, and `exec`/`slice` take the first match.* Fixed by asserting **uniqueness** rather than
  presence, and by **brace-matching** the media query instead of slicing to end of file. Each probed
  by re-applying the defect; new mutations `10h-GR12`/`GR13`/`GR14`.
- ⚠ **A focus ring this loop clipped** (`10h-A6`) — `.body` became a scroller, and an outline is
  *ink* overflow, so the app-wide `outline-offset: 2px` ring vanished on 10 of the 15 tab stops
  10f/10g/10h added *so clipped content stays reachable*. One descendant rule,
  `.body :focus-visible { outline-offset: -2px }`, guarded on the **sign** and measured in the
  browser (24 rings painted of 28, offsets `[-2]`, zero clipped).
- ⚠ **A blank cell §6.6 forbids, spelled with U+200B** (`10h-A10`) — `trim()` strips
  `White_Space` only, and U+200B is `Cf`, so `formatModelName`'s anti-blank-cell fallback never
  fired and rendered a visually empty cell. `printableText` closes it and the bidi-override case
  with it.
- ⚠ **The horizontal axis** (`10h-A5`) — all nine bodies are x-axis scrollers with no affordance.
  The CSS is deliberately unchanged (`overflow-x: hidden`/`clip` makes the content *unreachable* on
  a pointerless panel); the axis is **graded** instead, on every page.
- ⚠⚠ **A guard this reconciliation itself made inert, found by the ledger and not by any phase's
  reading** — `app/dashboard-shell.test.tsx`'s *"the hostname is the snapshot's own, not a literal"*
  was a document-wide `toContain`, and rendering the reading into a `title` as well left it passing
  under the very mutation it exists for. The nine-harness run's **exit code is what said so**. §0.12
  has the rule; the assertion is scoped to one element now and `10h-DS1` mutates the shell's own
  wiring of the new prop.

**Where 10h landed, all run by its reconciliation on the tree it left:** `pnpm verify` cold
**exit 0 — 101 test files, 3061 tests, no type errors**; `measure-breakpoints.mjs`
**59 passed / 0 failed / 0 blocked, exit 0**; `measure-arrangements.mjs` + `check-density.mjs`
(no `--oq`) **ALL PASS**, healthy spare **263.2 / 227.6 / 283.6 px** — identical to the digit to
10f's, 10g's and 10h's build's runs; **all nine `regressions.py` harnesses serially in one call,
all nine exit 0, 1180 mutations**, zero anchors moved or ambiguous, zero `DID NOT BITE`, zero
unmatchable ledger keys — ⚠ **on the second run of step 10; the first returned 1**, because the
ledger named an ⚠ test that this reconciliation's own new `title` had made inert (§0.12). Nothing committed; nothing staged; no `.env`; `next-env.d.ts`
byte-identical; `SPEC.md` and `MOCK.html` untouched. §1 has the per-harness table.

**Rulings that stand, and that no later loop re-asks** (all in `SPEC.md`): the §6.1 grid is
unchanged and all nine panels stay on the wall; **`MOCK.html` is the source for FORM only** and the
spec wins wherever the two disagree; the banner promise is **unconditional**; the no-scroll promise
is **unconditional on telemetry**; OQ-1/2/3/5/6 **declined**; **OQ-4 no chip on the session event
log**; **OQ-7 keep BOTH CPU traces**; OQ-8 recorded for the loop that owns §6.4's SAFETY.

**Next is the parent's review of `steps/10-panels-assembly/10h-reconciliation.md`, then a commit,
then step 11** (packaging), then step 12 (deploy, and the box redeploys — it still serves
`b3969cd`).

## 0.1 ⚠ NEW — what Q1 found, and the three rules that came out of it

Q1 back-ported step 9's corrected ⚠-scanner into steps 2–8. It was not a tidy-up; the ledger had
been reporting *"every ⚠-marked test went red"* over a set smaller than the real one, in every
step, since step 2.

| | before Q1 | after |
|---|---:|---:|
| harnesses carrying the corrected scanner | 1 (step 9) | **8** |
| ⚠ marks checked, steps 2–8 | 584 | **622** |
| ⚠ marks checked, all eight | — | **689** |
| mutations, all eight | 706 | **771** |

⚠ **Those two totals are Q1's snapshot and are already out of date** — they are kept because the
*before/after* is the point of this table, not the current count. As of Q2 (2026-09-08) it is
**803 mutations** and **725 ⚠ marks** across the eight (622 across steps 2–8, unchanged, plus
the `components/` harness’s 103), all of the growth in the `components/`
harness. The authoritative number is always the `All N regressions failed their check` line each
harness prints; §1 says why no total written here survives.

**Three rules, each paid for:**

1. ⚠ **A regex that silently matches *nothing* is how this happened, twice.** The pre-Q1 regex
   could not span a newline in a `test.each(…)` argument list. The replacement could not span a
   **generic type argument** (`test.each<[string, LoginState]>(…)`) — the same defect one shape
   over, in the scanner brought in to fix the first one. Neither printed anything, because a call
   that is never matched takes none of the scanner's skip paths. **The scanner now reports every
   `test`/`it` call it cannot read** (`!!! <file>:<line>: a test/it call the ⚠-scanner cannot
   read`). Five fire today, all backtick-named tests, none marked. If one of those lines ever
   names a test with a ⚠ in it, the ledger has stopped counting it.
2. ⚠ **Renaming a ⚠ test name is a LEDGER change. Re-run the owning harness.** Q1's build renamed
   four names and re-ran one harness. `lib/client/wire.test.ts`'s old name gave a ledger prefix of
   the single character `⚠` — a substring of *every* ⚠ FAIL line — so its mark had scored covered
   for free in every run this project has ever done. The rename exposed it as genuinely inert.
   See §5.2 rule 8.
3. ⚠ **A mutation anchor that matches its file TWICE is a third failure category**, and the most
   dangerous, because it does not look like one: `replace(old, new, 1)` silently takes the first
   site, the mutation still bites, the ledger still goes green, and the property being certified
   is no longer the one the mutation's name records. Two existed (`U6` in step 8, `T68` in step
   4). Both are pinned, and every harness now prints `ANCHORS AMBIGUOUS` and exits 1 rather than
   guessing.

**One item is deferred to step 10 and it is the mechanism-shaped one:** nothing anywhere asserts
that a test file carrying ⚠ marks is in *some* step's `LEDGER_FILES`. Measured: 65 test files, 63
are; the two that are not (`lib/throttle.test.ts`, `lib/contract.test.ts`) carry **0** ⚠ marks, so
nothing is lost today. `throttle.test.ts` is already a step-2 mutation target, so adding a ⚠ to it
is an ordinary thing to do and the mark would be counted by nobody. No harness knows the union of
the eight ledgers, and every approximation needs a hand-maintained exemption list — which is why
this is deferred to the step that next adds a harness rather than closed with a partial guard.
Full reasoning in `pipeline/steps/Q1-ledger-scanner/reconciliation.md` §6.

## 0.2 ⚠ what Q2 found, and the two questions step 10 inherits

> **10a's note, 2026-09-08:** everything below is still true and still owed — **but 10a was not
> blocked on it**, because 10a mounts no chart. The chart/table toggle, Q2-S2's height and Q2-F9's
> clamp all land on **10b**, which is the first phase to put a real chart in a real grid cell.

Q2 built §6.2's hover layer and table view onto both chart primitives. Thirteen adversarial
findings were adjudicated (ten accepted, two rejected, one split) — full table in
`pipeline/steps/Q2-hover-and-table/reconciliation.md`. Four results matter downstream.

**1. The geometry the whole feature rests on had no test naming it.** `hoverColumnsFor` — the
Voronoi partition that makes "the crosshair snaps to the nearest data position" work with no JS —
appeared **zero times** in either test file. Three plausible defects each left `components/` at
184/184 green, including one where zones span neighbour-to-neighbour, **overlap**, and turn "snap
to nearest" into "snap to **next**": hovering a spike puts the crosshair on the spike and reports
the following sample. **A wrong reading presented confidently is worse than no tooltip.** Five
tests and five mutations now read actual coordinates; they are the first tests in the item to
read one at all.

⚠ **And the recurring defect landed on the test written to close the previous gap.** The test
phase added *"⚠ every hover-zone rect is immediately followed by its OWN crosshair group"*, whose
body counts adjacent pairs and never establishes **ownership** — an implementation pairing every
zone with the *next* column's crosshair passes it. That is §5's *"a test that names a property it
does not check has appeared in every single step"*, one level up. **Read each test name against
its body, including the ones added to fix the last instance of this.**

**2. A fix can make an existing mutation vacuous, and it looks exactly like an inert test.**
Q2 added `Number.isFinite` guards to four value-rendering paths. `Number.isFinite(null)` and
`Number.isFinite(undefined)` are already `false`, so `Q2-H2`/`Q2-H3` — which mutate the
null/undefined halves of the same guard — became **equivalent mutations**: they apply, nothing
changes, the harness prints `DID NOT BITE`, and the natural reading is "the test is inert" when
the truth is "the fix subsumed the mutation". This is §1's *"adding a second, independent defence
makes the first one's mutation inert"* (step 8's `W4`) in a new place. Both were rewritten to
replace the **whole predicate** rather than delete a clause, and the source guard is written as
one positive test rather than three negative clauses so no redundant clause invites the same edit
again. **Whenever a fix adds a defence, re-run the harness and read what stopped biting.**

**3. Two spec questions, both open, both the owner's** (`reconciliation.md` §4, and `ANCHOR.md`
§2.2):

- **Q2-S1** — §6.2's *"per-mark tooltip on bars and dots"* is **entirely unmet**, not partially.
  The hover layer tiles the plot at `pointer-events: all` and is painted last, so SVG hit-testing
  never reaches the marks beneath it and their `<title>`s can never display. A full-body crosshair
  and reachable per-mark tooltips **cannot coexist on one plot**. `build.md` §7 recorded it as
  partially satisfied and has been corrected. ⚠ Consequence for the ledger: `Q2-H4`/`Q2-H5`
  protect markup with **no user-facing effect**, and the ledger structurally cannot tell that
  apart from a sound mutation.
- **Q2-S2 — step 10 is blocked on this one.** The table view has **no height bound**: ~722 `<tr>`
  at the default 30-minute window, 1,202 at 120 minutes, in a fixed grid cell, against §6.1's
  no-scroll promise. §6.2's own justification — *"they cost nothing when unused"* — is true of the
  tooltip and **silent about the table view**, which is not "unused" once toggled. Cap the rows,
  decimate again, or scroll inside the panel: each trades against a different part of the spec,
  so it needs §6.1 or §6.2 reworded before step 10 wires a toggle.

**4. `Sparkline` is a source-breaking change, twice over.** It now has **three required props**
that did not exist a week ago — `ariaLabel` (Q2's reconciliation), `formatValue` and `formatTime`
(Q2's build). All three are required and un-defaulted deliberately: a caller cannot ship an inert
hover layer or three identically-named tables by forgetting an optional prop. There is still **no
production call site** (`grep -rn "<Sparkline"` finds only its own test file), so step 10 is the
first phase to feel it. Read `StackedTimeSeriesChart`'s own `ariaLabel` prop doc — which argues
the case — before relaxing any of them.

---

## 0.3 ✅ CLOSED — `pnpm verify` IS deterministic (fixed `3c37107`), and what 10a found

### ✅ The determinism problem — FIXED 2026-09-08, `3c37107`

⚠ **Do not act on the description below as if it were current.** It is kept because the *reasoning*
is still the reference for this class of bug. **The fix:** the test uses Vitest fake timers, so the
95/100 ms constants are unchanged and only the clock is virtual. `deadline.ts` and `serving.ts` are
**byte-identical to their pre-fix state** — the monotonic-clock property is intact by construction,
not by argument, which is why a clock argument threaded into `deadline()` was rejected. Measured
**60/60 green**, 25 idle and 35 under load on a ten-core machine, against a defect that previously
reproduced 2-in-6; the parent added a further 5/5. And it **still fails when the defect returns**:
the historical shared-budget defect was reintroduced twice and only this test reddened, 32 of 33
siblings staying green.

### The problem as it was — kept for the reasoning, NOT as a live warning

**`lib/collectors/serving.test.ts:592`** — `⚠ a slow discovery cannot band an alarm on a healthy
instance` — sleeps a **real 95 ms** inside a **real 100 ms** `discoveryTimeoutMs`, with 20 ms HTTP
fakes layered on top. That is a race by construction: under CPU contention the sleep overruns the
budget, the collector legitimately takes the degraded path, and the test fails. 10a's adversarial
phase saw it fail an unprompted `pnpm verify` and reproduced it **2 times in 6 runs** under load
(0 in 10 unloaded).

Why this is worse than an ordinary flake, and why it is stated at the top of this file:

> `regressions.py` unions every red test name across all mutations into `covered`, then checks
> that every ⚠-marked test appears there. **A contention-driven failure of this test during any
> mutation run credits it as covered by a mutation that never touched it** — and because it *is*
> ⚠-marked, that credit is exactly what the ledger is checking. ANCHOR §5 already says a
> *mutation* that reddens probabilistically is worse than none. This is the same disease in the
> **test**, and every harness in the project shares the exposure.

**Consequences you must act on:**

- A single red run on this test is **not** evidence you broke something. Re-run before debugging.
- A single green ledger run is **not** proof every ⚠ mark is genuinely covered.
- Do not "fix" it by widening the margin: the 95-vs-100 relationship **is** the property under
  test. The fix is an **injected clock**, so the ordering is exact rather than raced.
- 10a raised the file count 77 → 79 and added a fifth jsdom environment, which increases per-run
  worker contention. It plausibly makes an existing latent flake likelier; it did not create it.

**Owner: 10c** (it lives in **step 5's** `LEDGER_FILES`, outside 10a's scope, and 10c is already
the loop that owns cross-harness work). Carried in §9.

### What else 10a's loop found

Four things worth inheriting as rules, all paid for by an adversarial phase that ran its edits
rather than arguing them:

1. ⚠ **A test that asserts a marker attribute is not testing the thing the CSS keys on.**
   `grid.test.tsx` asserted `data-slot` — which **no stylesheet reads** — while placement is bound
   by `className={styles.X}`. Rewiring COOLING into the log's grid area was **19/19 green with
   `tsc` clean**. The describe was even *named* "the `data-slot` the layout CSS keys on". If a
   test names a relationship, check the relationship exists.
2. ⚠ **A mutation harness over the parts does not cover the join, and the join is where the
   acceptance criterion lives.** `header-status.ts` and `header.tsx` were each tested thoroughly
   in isolation; nothing asserted they are ever handed the real values. Hard-coding
   `mode={'live'} alarms={0}` in the shell, inverting pause/resume and killing the cadence handler
   — all four at once — left `pnpm verify` at exit 0 across 77 files, on a build that can never
   say "paused" and reads `● all healthy` on six alarms. **That is `PLAN.md`'s own green criterion
   for step 10, unable to fail.** Same shape as Q1's finding, one level up.
3. ⚠ **Two `position: sticky; top: 0` siblings do not stack — they overlap.** The header
   (`z-index: 10`) painted over the alarm banner (`z-index: 9`) completely from the first scroll,
   and the banner's own comment described the arrangement as correct. Invisible at scroll 0, which
   is every screenshot. **One sticky wrapper containing both** is the fix that needs no measured
   header height.
4. ⚠ **A prose contract is not a contract.** `10a-build.md` documented a `PanelProps` shape and
   claimed it was "wired end to end"; no such type existed, and nine panels could each have
   invented a different prop name and typechecked. See §3.6.

---

## 0.4 ⚠ NEW — what 10b found, and the one rule to carry out of it

**14 adversarial findings: 11 accepted, 1 accepted in part, 2 deferred, 0 rejected outright.**
Full table in `pipeline/steps/10-panels-assembly/10b-reconciliation.md`. Three things generalise.

### ⚠ A document-wide `toContain` is a weak assertion wearing a strong name — THIRD instance

10a found `toContain('paused')` inert (satisfied by an unrelated attribute). Its test phase found
`toContain('refresh')` inert the same way. 10b found `expect(html).toContain('—')` inert in the
⚠ test named for **invariant 1**, in the panel `PLAN.md` uses as invariant 1's own example:
`chip.tsx:75` renders `EM_DASH` whenever `severity === null`, so the assertion passes on the chip
beside the row whatever the value cell prints. Under a one-token change the panel rendered
**`fan 5  0 RPM`** for a `dell_smm` that loaded and could not read the tach — *"the single worst
bug this project can ship"*, with the whole suite green.

**The rule: assert over the element that carries the claim, never over the document that
contains it.** `components/panels/test-support.ts` now exports `valueCells(html)`, and every
panel has one ⚠ test saying *with every reading null, no value cell prints a numeral* — which
covers ~30 readings in six tests **and covers a row added tomorrow**. A mechanical guard
forbidding the shape is **10c's** (§9, `10b-F1-guard`).

⚠ Two related traps, both hit again while fixing it: a row helper that finds the **subtitle**
(`rowContaining(html,'fan service')` on SAFETY, whose subtitle lists all four checks), and the
escaped-quote ledger trap below.

### ⚠ Read what a mutation REPLACES before crediting it with a property

`10b-CO2`/`CO3` are `severity={…}` → `severity={null}`: they delete a **band**, which is the
*zero* side of invariant 1. Both the build note and the test note described them as the
null-vs-zero pair, and the test phase skipped COOLING's audit **on the strength of that
description**. `severity → null` and `?? null → ?? zero` are opposite sides of one invariant and
both read as "invariant 1" in a mutation title. Both notes now carry marked corrections.

### ⚠ The sibling case, again — fixed where reported, missed one branch over

`Sparkline` handled the pre-first-poll ring correctly; `StackedTimeSeriesChart`, fed by the same
`chartDomainOf`, drew a fully plausible half-hour axis ending at **epoch 0 in local time** under a
fabricated `0–1 °C` scale. `event-sentence.ts` guarded an empty detail in two of its four
appending branches. Both were one line. **When a fix lands on one of a pair, check the pair.**

---

## 0.5 ⚠ NEW — what 10b-S-G found: the ledger's blind spot, and a half-applied discriminator

**11 adversarial findings: 6 accepted (3 in part), 1 rejected, 2 deferred; A2 accepted after a
judgment call, A5 accepted as a fixture with no behaviour change.** Full table in
`pipeline/steps/10-panels-assembly/10b-sg-reconciliation.md`. Four things generalise.

### ⚠ A mutation harness proves every ⚠ test CAN fail. It never proves every branch HAS one.

`serving-panel.tsx` calls `namesInstance` **twice** — once in `errorFor` (mutation `10b-SV4`) and
once in the `unattributed` filter (**no mutation, in a file with 133 of them**). Replacing the
second with the unfiltered array left `pnpm verify` at **93 files / 2587 tests, exit 0**, on a
build that prints every attributed message twice: once on its own row and again as a panel-level
note asserting a collector-wide fault. The **"too few"** direction was fixtured; **"too many" had
no assertion anywhere in the project.**

**The rules that fall out, and they are cheap:**

1. **A guard needs a fixture on both sides** (ANCHOR §5, and this is its fourth instance) — for a
   filter, that means asserting what it **keeps out**, not only what it lets through.
2. **`toContain` cannot see a duplicate.** A test whose *name* says "renders once" must **count**:
   `expect(html.split(needle).length - 1).toBe(1)`. This is §0.4's rule at a different angle and
   it was a fourth instance of the same weakness.
3. **When a function is used more than once, grep for its other call sites before believing the
   mutation that names it.** Nothing else found this — no ledger, no scanner, no type.

### ⚠ Adding a discriminator to a shared record obliges you to every consumer of that record

`TelemetryError` gained `instance`; `panelsForSource('dbus')` fans out to **COOLING, SERVING and
SAFETY**; S-G taught **one** of the three to read it. The entry `collectServing` files when
systemd has no record of instance 1 therefore rendered as
`fan service | active | llama-server@1.service: NoSuchUnit` on COOLING **and** SAFETY, beside a
healthy `gpu-fan-control.service` — the panel §6.2 calls the one that earns this dashboard's
existence. It was **pre-existing** (the entry was already `source: 'dbus'`), which is exactly what
made it dangerous: **the fix looked done.** ⚠ **A subject that two of three renderers ignore is
worse than no subject at all.** Both panels now filter on `e.instance === undefined`
(`10b-SG3`/`10b-SG4`); ⚠ a `dbus` entry with **no** instance is still ambiguous — §9's S-G-Q2.

### ⚠ Three of eleven findings were a document contradicting the code it shipped with

*"Nothing is dropped"* (false within one source), a comment citing `events.ts` as agreement
(no longer agreement after this very change), and a build note crediting a test that does not
discriminate (`connect ECONNREFUSED …:8081` passes the **old** heuristic on its own substring).
All three were written by the phase that also wrote the correct code, and the third was caught
only by **restoring the old implementation and running the suite**. Four loops in a row now.
**Compare against the counterfactual that was the code, not against a weaker one.**

### ⚠ `Object.hasOwn`, not `?.field === undefined` — ⚠ **and the reason given here was WRONG**

Every assertion that a subjectless entry *omits* the field uses `Object.hasOwn(...) === false`,
and that is still right. **The reason recorded for it was not.**

> ~~"`exactOptionalPropertyTypes` is **off**, so `{ ...base, instance: maybeUndefined }`
> typechecks with the key **present**."~~

**It has been `true` in `tsconfig.json` since the very first commit** (`71a2f7d`, step 1's
scaffold — `git log --oneline -- tsconfig.json` shows exactly one commit, ever), and
`lib/guardrails.test.ts` has asserted it as text since the same commit. 10c-2's build phase
proved it enforcing with a scratch file: that exact spread reports `TS2375`. The earlier
measurement (*"`npx tsc --noEmit --exactOptionalPropertyTypes` exits 0, so turning it on is
free"*) was reading a flag that was **already on**, so its result proved nothing about turning
anything on. **S-G-A11 is therefore closed as a non-item, not as a change.**

What the runtime `Object.hasOwn` checks actually defend is the path `tsc` cannot see through —
an `any`, a cast, a `JSON.parse` result crossing the wire — not the ordinary spread, which the
compiler has been rejecting all along. The two source comments that carried the wrong reason
(`lib/collectors/errors.ts`, `lib/collectors/serving.test.ts`) were corrected by 10c-2's test
phase.

---

## 0.6 ⚠ NEW — what 10c-1 found, and the rule to carry out of it

10c-1 mounted the nine panels for the first time. Its adversarial applied **four wrong edits
simultaneously** and `pnpm verify` exited 0 across **94 files / 2617 tests** on a build that
served GPU 0's model name and GPU 0's temperature history on GPU 1's card, sent GPU 1's toggle to
GPU 0, and shipped an alarm-forcing escape hatch any visitor could trigger in production.
**Twelve findings, all adjudicated: 10 accepted, 0 rejected, 2 deferred**
(`10c1-reconciliation.md`).

### ⚠ THE RULE — a fixture whose two subjects are identical cannot discriminate between them

`app/dashboard-shell.test.tsx` already had a two-GPU helper. It built card 1 as
`{ ...gpu0, index: 1 }` — the same `name`, `bus`, `tempC`, VRAM, everything. **Two
indistinguishable subjects make a positional read observationally identical to an index read**,
so three separate defects passed straight through it:

| edit | what it ships |
|---|---|
| `serving.find(s => s.instance === i)` → `serving[i]` | another instance's **model** on this card |
| `gpus.find(g => g.index === i)` → `gpus[i]` | another card's **die** under this card's title |
| the trace lambda's `index` → `0` | GPU 1's chart drawing **GPU 0's history** |

**Fixture *presence* is not fixture *power*.** Make the two subjects differ in every field the
component under test renders, and assert **per subject**, scoped to its own element.

⚠ **And the same shape one level out (`10c1-A3`/`A4`): an assertion whose subject does not render
cannot fail.** Two toggle tests asserted GPU 1's independence while driving a **one-GPU** state,
under which the `gpu1` cell renders §6.5's takeover — no `<svg>`, no button, no
`data-role="table-view"`. The negative assertion read as independence and asserted the fixture.
**Assert the precondition when the subject is conditional.** Only two of the four per-slot toggle
wirings were ever clicked; the shared mechanism was well mutated and the wirings were not —
§0.5's *"used more than once, mutated once"*, at a fourth site.

### ⚠ Both collectors return SPARSE collections, and the panels had assumed dense

Not hypothetical, and each is documented in its own collector's source:

- `lib/collectors/llama.ts:61 discoverInstances()` returns `[...found].sort()` — the **set** of
  instance indices whose `<i>.env` was read. A missing `0.env` gives `serving: [{instance: 1}]`.
- `lib/collectors/nvidia-smi.ts:147` skips a row whose `index` will not parse. `gpus: [{index: 1}]`
  is a shape it is designed to produce.

**Index into these by their `index`/`instance` field, never by array position.** A hard-coded
`=== 0` was already caught by the existing tests; only the positional form escaped.

### ⚠ CORRECTION — a `.module.css` import is a **Proxy**, not `{}`

`10c1-test.md` §1.2 stated that every CSS-module import resolves to an empty object, so no test
could ever observe a class name. **That is wrong, and acting on it would have weakened the exact
guard 10a added to close its own F1** (the one that caught COOLING painting in the event log's
grid cell). `Object.keys(styles)` is `[]` — which is why `console.log` prints `{}` — but
`styles.gpu0` returns `_gpu0_e75739`. `grid.test.tsx`'s tier-2 placement guard and
`dashboard-shell.test.tsx`'s sticky-band assertion are **live**; they would *fail* if the claim
were true. That document now carries a marked correction with the original struck.

**The real void is the opposite one: every key resolves, including keys with no rule.**
`styles.zzzNoSuchRule` → `_zzzNoSuchRule_e75739`, and the module is typed as an index signature,
so `tsc` is silent too. A deleted or misspelled class is invisible to the whole suite.
`alarm-banner.tsx` had one (`styles.item`, no `.item` in its stylesheet); it is removed, and the
mechanical audit is **10c-2's** (§9).

⚠ **Method note:** `console.log(obj)` on a Proxy prints `{}` and looks conclusive. **Probe a
property access, never the object.**

### ⚠ Three tiers of CSS question — only the third needs a browser

This is what 10c-3's scope actually is, and it should not be re-derived:

| tier | risk | observable |
|---|---|---|
| **binding** | which element carries which class, `data-*` hooks | **jsdom, today** |
| **reference** | `styles.X` naming a rule that does not exist | **a static check**, no runtime — 10c-2 |
| **paint** | cascade, specificity, media queries, `display:none` at ≥1600px, overflow, stacking | **a real browser** — 10c-3, and only this |

### ⚠ The sibling case, for the third loop running

`10c-CO4` (COOLING's GPU 1 trace) and `10c-GP6` (GPU's own GPU 1 trace) are the same lambda in
two files, found a phase apart. **When a lookup keyed on a subject index is found unguarded in
one file, grep the other consumers for the same shape before closing the finding.** 10b's
invariant-1 sweep stopped at four of nine panels; the test phase's fix stopped at COOLING.

### ⚠ A correction inside a correction, recorded both ways

`10c1-test.md` §5 flagged the escape hatch's wiring as untested — **right** — and demonstrated it
with a `!==`→`===` flip that **does not compile** (`TS2339`: the discriminated union has no
`body` on its failure arms). The finding was real and its justification was not. Both are now in
the document. §0.5's rule applies: **compare against the counterfactual that was the code.**

---

## 0.7 ⚠ NEW — what 10c-2 found, and the four rules to carry out of it

10c-2 built five mechanism guards — a `toContain`-scope lint, a cross-harness `LEDGER_FILES`
runner, a dangling-CSS-class audit, L11's unit-suffix guard, and `exactOptionalPropertyTypes`
(which turned out to need nothing done). Its adversarial raised **11 findings, 9 executed**; the
reconciliation accepted all 11 with two sub-parts rejected on measurement.
`10c2-reconciliation.md` has the table.

### ⚠ THE RULE — a guard must not fail when the project SUCCEEDS

`lib/cross-harness-ledger.test.ts` shipped with
`expect(orphans.length).toBeGreaterThan(0)` under a comment explaining it as an anti-vacuity
check. The effect was the opposite of the intent: **the day the last orphan is adopted into a
`LEDGER_FILES` — the outcome the guard exists to drive toward — `pnpm verify` goes red**, with
`expected 0 to be greater than 0`, on a file most readers will meet for the first time at that
moment. **One file** (`lib/throttle.test.ts`) stood between today's green and that red.

Two things generalise, and both are cheap:

1. **Assert the INPUTS, never the output.** "Did this guard look at everything?" is a question
   about the population it scanned. "Did it find something?" is a question about the project's
   health, and a healthy project answers *no*. The replacement asserts every `LEDGER_FILES` path
   is a file the walk actually found (96 ⊆ 97 today), which also closes a documented blind spot:
   a path typo'd or renamed on one side now fails there instead of being trusted.
2. **A guard whose failure message reads as its own breakage will be deleted, not fixed.** That
   is the real cost of the inversion, and it applies to any assertion whose red state is the
   success state.

### ⚠ Four nets, and three of them could not see their own guard go blind

Every one of the four new guards had an anti-vacuity check; only one was strong. Measured:
`dangling-css-class`'s `audits.length > 0` survived an **18 → 1** narrowing; the ledger's
population check survived **99 → 1**. The strongest of the four was strong by accident — a `>= 8`
someone happened to write in a *fixture* test rather than in the net. All four are now
proportional or named-member checks, in the net, with the reason written down.

⚠ **None of the four is mutation-covered** — no `10c-G*` mutation breaks a file-walk; every one
aims at the guard's single ⚠-marked `test.each`. Disclosed by the build, proven functional by
hand twice, and carried in §9 as a work item rather than closed.

### ⚠ The measured answer to "can the bare-word `toContain` case be mechanised?" — YES, at 9.5 %

Three documents said the general case *cannot be mechanised* because the false-positive rate is
prohibitive. **That is true of a source lint and false in general**, and the adversarial measured
it rather than arguing it, by overriding `toContain` in a scratch vitest setup file.

> **The rule:** a `toContain(X)` whose subject is a string is **ambiguous if `X` occurs more than
> once in that subject.** Decidable at run time from the subject alone.

| | |
|---|---|
| files / tests / string-subject `toContain` calls in `components/` | 27 / 468 / **454** |
| needle occurs **> 1** time | **43 (9.5 %)** |
| already covered by the `"throwing"` exemption | 7 |
| left to adjudicate | **36** |
| the source-lint discriminator the build rejected, for comparison | **198** |
| founding failures caught | **4 of 4** (`'paused'` ×2, `'refresh'` ×3, both em-dash shapes ≥2) |

Several of the 36 look like live instances of the trap: `safety-panel`'s `'ufw'`/`'pwm5'`/`'fan
service'` ×2 each, `storage-network`'s `'eno1'` ×4, `cooling-panel`'s `'fan 5'` ×5 and `'0 RPM'`
×6, `gpu-panel`'s `'GPU 0'`/`'GPU 1'` ×3. Others are plainly sound
(`stacked-time-series-chart.test.tsx`'s `'TIME('` ×17, *because* one axis is drawn once per plot).

**These numbers are recorded so nobody re-derives them.** The matcher itself is a **deferred work
item** (§9): it is a `test.setupFiles` change — project-wide harness mechanics, which this
project's own rules say must be mutation-proven — plus 36 adjudications and a staged
report-then-gate adoption. **Not 10c-3**, which is sizing and visual and closes step 10.

### ⚠ The ninth instance of §0.4's shape, found by the guard change itself

Narrowing the `"throwing"` exemption to em-dash literals only (its justification — *an em dash
anywhere proves nothing crashed* — never covered a severity band) immediately exposed
`safety-panel.test.tsx`'s `'every row renders — rather than throwing, **and the three total checks
read watch**'`: an unscoped `toContain('data-severity="watch"')` that `SafetyPanel`'s own head
chip satisfied by itself. **A blanket exemption keyed on a test's NAME exempts every assertion in
its BODY**, and a test name with two claims in it gets both exempted. Now scoped to the three rows.

### ⚠ A guard's documentation overstates its reach, four times in one loop

`.tsx`-only walks described as covering `components/`; a hand-typed membership list described as
"never a hand-typed copy"; "the text right after the LAST interpolation" describing code that
accepted any segment; "cannot be mechanised" for a bound that holds only in a source lint. Every
one was written by the phase that also wrote the correct code, and every one would have made a
later reader believe a case was covered.

⚠ **The test for this is mechanical: read the guard's doc as a CLAIM and try to falsify it with
one call.** That is exactly how the adversarial found all four, and it is cheaper than reading
the implementation.

---

## 0.8 ⚠ NEW — what 10c-3 found, and the four rules to carry out of it

Twelve adversarial findings, **all twelve accepted** (two in part), zero rejected outright, two
sub-parts deferred with owners. Full adjudication in
`pipeline/steps/10-panels-assembly/10c3-reconciliation.md`. Four things generalise past this loop.

### ⚠ THE RULE — a measurement that names a subject must prove the subject EXISTS

`measure-breakpoints.mjs` printed `PASS  6. <900px: panel priority order (… -> STORAGE -> LOG)`
for two years' worth of reader-confidence and had looked at **nothing**. It asked for
`[data-slot="storage"]` and `[data-slot="log"]`; the grid renders `storage-and-network` and
`session-event-log`. Attribute selectors are exact-match, both `querySelector`s returned `null`,
and the ordering predicate was written null-tolerant:

```js
ys.every((y, i) => i === 0 || y === null || ys[i - 1] === null || y >= (ys[i - 1] ?? 0))
```

so both comparisons involving them were **skipped**. With every slot `null` it returns `true`: a
fully vacuous PASS was one rename away. **Two phases read that line as evidence.** The same
script had a second instance: `getComputedStyle(el).gridTemplateColumns` computes to the literal
`'none'` on a non-grid element, and `'none'.split(/\s+/).filter(Boolean).length === 1`, so the
"1 column" measurement passed on an element that was not a grid at all.

This is the **fifth** instance of §0.6's shape (*an assertion whose subject does not render
cannot fail*) and the first outside the test suite. The fix has two halves and both are the
point: name the subject correctly, **and make a missing subject fail loudly instead of being
skipped**. There is now a measurement 0 whose whole job is to assert all nine slots exist.

### ⚠ A browser measurement does not need production code to fabricate its precondition

Two documents concluded that observing the ≥1600px chart promotion required extending
`force-alarm.ts` — production-adjacent code, shipped in the bundle, behind two gates — to
fabricate a `gpus` array, because this dev Mac's `/api/telemetry` returns `gpus: null` and the
GPU panel takes its takeover branch. **The measuring browser can rewrite the response itself**
(`page.route` → `route.fetch` → `route.fulfill`), and then the wire validator, the ring,
`traceFor`, the severity bands and the panel all run **completely unmodified** against a real
response with one collection substituted. Nothing ships. Invariant 2 is untouched — a response is
reshaped in the browser's memory; no request is built.

Consequence beyond this loop: *"we cannot observe X without hardware"* deserves one look at the
seam between the server and the client before it is recorded as blocked. Measurements 7 and 8
both pass now, and the second one — the 1280–1599px side of the same media query, the **design
target** — had never been observed in either direction by anything.

### ⚠ Two views of one dataset must be computed from ONE derivation, not two agreeing ones

`Sparkline` computed gap marks per **adjacent point-pair**; `StackedTimeSeriesChart` computes
them per **gap**. Nothing linked the two, and three separate defects fell out of the mismatch: a
gap flanked by a `null` produced no mark **and no table row** (so the accessibility floor said
less than the chart it substitutes for); a gap spanning several pairs drew three marks and listed
**three identical outages** where the chart lists one — in §6.7's explicitly blessed case, which
says such a reading leaves the gap *"neither closed nor split"*; and an open gap (`toMs: null`,
which extends to `+Infinity`) matched every pair, falsifying the module doc's claim that an
out-of-window gap is *"excluded by construction"*.

One `gapSpansFor(points, gaps)` now feeds both the marks and the table rows. Q2-F9's
`clipPlotsToDomain` is the same rule applied one component over — one derivation above the `view`
branch, both branches reading it. **Where two renderings of one fact are computed separately,
they will disagree; the only question is when someone notices.**

### ⚠ Wiring a prop is a property, and an optional prop makes it an untested one

`Sparkline.gaps` is optional; `StackedTimeSeriesChart.gaps` is required — for the identical fact.
Deleting `gaps={state.gaps}` from **both** CPU call sites left `pnpm verify` at **2801/2801
green** with both harnesses silent, silently restoring the F14b defect (a smooth line across
ground nobody sampled) in the band §6.1 calls the design target. The build's own note called that
*"worth a code-review habit, not a guard"*; **L11 was the same shape in the previous loop and got
a guard.** It is now three mutations and two behavioural fixtures, one per production call site.
The enabling fixture change is §0.6's rule again: `test-support.ts`'s state builder always
carried `gaps: []`, and a fixture whose two subjects are identical cannot discriminate between
them.

---

## 0.9 ⚠ NEW — what 10e found, and the five rules to carry out of it

10e brought `components/` to `MOCK.html`'s density. Its adversarial phase raised fifteen findings,
twelve of which were accepted and fixed; the full adjudication is
`steps/10-panels-assembly/10e-reconciliation.md`. Five rules are worth more than the diff.

### ⚠ THE RULE — a scroll container only clips what it is the CONTAINING BLOCK of

The single most expensive mistake of this loop, and it was in a *fix*. `.sr-only` is
`position: absolute`; every `Chip` renders one; the session event log's bounded 84 px well was
`position: static`. An absolutely-positioned box is clipped by an ancestor scroller **only when that
scroller is in its containing-block chain**, and a static box is in no chain at all — so 200 entries'
hidden spans escaped the well and grew `documentElement.scrollHeight` to **5189** on a 1024 px
viewport, the page acquiring a scrollbar at about **fifteen** entries.

The shipped fix put `position: relative` on `.panel` instead, reasoning that the panel would become
the containing block. It does — and it changes **nothing**, because `top`/`left` are `auto` (the box
is placed at its static position either way) and `.panel` is `overflow: visible` (the overflow
propagates straight through). Measured on the real page: **5189 with that line and 5189 without
it.** The lesson is not about CSS trivia; it is that **a plausible mechanism, written into a comment
in the file it is wrong about, survived a build, a test phase and a spec** — and only fell to a
measurement. `components/styles.test.ts` now carries the rule for the whole directory: *a rule
setting `overflow*: auto|scroll` must also set `position`.*

### ⚠ Fixing a defect in one primitive does not fix it in the primitive you write next

F5 — `status-row`'s `.value` could neither shrink nor wrap, so SERVING's composite string overflowed
a narrow column — was fixed in this loop, by this loop, with `min-width: 0; white-space: normal;
overflow-wrap: anywhere`. **The same loop then created `Strip` with `white-space: nowrap`** and moved
GPU's `served by instance N` into it — a value that carries `/v1/models`'s model id, which is an
absolute `.gguf` path whenever `serve-llm.sh set-model` was given no alias. Measured `scrollWidth`
**345 in the 285 px GPU column**, and the same 345 at 262 and 200. A defect class closed in one file
is not closed in the tree; grep for the shape, not the file.

### ⚠ `aria-label` on a role-less element is an attribute that renders and does nothing

`Hero` put `aria-label` on a plain `<div>`, which maps to ARIA's `generic` role, for which *ARIA in
HTML* lists the attribute as **prohibited** (axe-core's `aria-prohibited-attr`). Two mutations went
RED when it was deleted, so the suite read as covered while defending nothing. Worse, it was the
only carrier of the words **`fan 5`** on the COOLING panel: 10e had moved that reading out of a
`<Row label="fan 5">` into a `Hero`, and the string then appeared **nowhere in the panel body**.
Two rules: **an ARIA attribute needs a role that permits it** (`group`, not `img`, when the element's
own text must still be announced), and **visible text is the accessible name that cannot be got
wrong** — the fix was a visible key costing 0 px, not a better attribute.

### ⚠ A test that names a tone, a size, a tick or a wiring and asserts only the TEXT is §0.4's shape again

Nine of the fifteen findings were this, at eleven call sites, in the loop **after** §0.8 wrote the
rule down (*"wiring a prop is a property, and an optional prop makes it an untested one"*). Two
tests were literally named *"watch-toned"* and asserted only the wording; a test named *"chip renders
the explicit no-band state"* asserted a substring the `<section>`'s own attribute already supplied,
and its name stated the opposite of the ruling the code had implemented. **Read every test name
against its body — and when the property is a colour, a size or a class, assert the class.** The
mechanical form that works here: an exact occurrence **count**, or the extracted class string, never
a whole-document `toContain`.

### ⚠ `lib/source-text.ts`'s `codeOnly` cannot see a regex literal, and six guards read through it

`codeOnly` is a character state machine over `'`, `"`, `` ` ``, `//` and `/* */`. A **regular
expression literal** is none of those, so `/class="_noteWatch[^"]*">…/` — three `"` characters —
leaves it in string mode, and every comment after it, to the next `"` anywhere in the file, reads as
**live code**. It bit this loop in the safe direction (`tocontain-scope` flagged a dangerous literal
quoted inside a comment) and it is endemic: measured, **16 test files** currently desynchronise it,
`components/sparkline.test.tsx` over 672 lines and `lib/tocontain-scope.test.ts` — the guard itself —
over 333. Six guards read source through it. **Not fixed** (see §8, `10e-Q10`): the one-line fix is
that a `'`/`"` may not open a string that does not close before the next newline, but it changes what
six guards can see and its failures are the point. Until then: **a regex in a file a guard reads must
have an even number of quote characters, or be built with `new RegExp` over a `'…'` string.**

---

## 0.10 ⚠ NEW — what 10f found, and the six rules to carry out of it

10f bounded every `errors[]` block so a degraded page fits. Its adversarial phase raised ten
findings; four were fixed, four went to the owner as questions, one was accepted with no change and
one was deferred — the full adjudication is `steps/10-panels-assembly/10f-reconciliation.md`. Six
rules are worth more than the diff.

### ⚠ THE RULE — a bounded box needs a NAME, and the name has to be unique on the PAGE

Bounding a block is half the job: a scroll box no one can reach hides the very text §3.7 requires
beside the alarm, so every well is a `role="group"` with `tabIndex={0}` and an `aria-label`. 10f
gave all of them the **same** label. Measured on the all-collectors-failed page: **seven wells
announcing `collector messages`**, and `fan service explanation` naming two different units in two
different panels at once. `PanelShell` renders a bare `<section>`, which ARIA maps to `generic`, so
a panel gives its contents no context at all — the well's own name is the whole announcement.

Two things follow. **The name must carry its subject** (`` `${subject} messages` ``,
`` `${panel} ${label} explanation` ``), and the prop that carries it must be **required**, not
defaulted — a default lets the next call site re-create the collision with nothing to notice.
And **the property lives at the page, not in the primitive**: no per-component test can see that
nine call sites chose nine different subjects, so the assertion is in `app/dashboard-shell.test.tsx`
— gather every `role="group"` name on a fully degraded page and refuse duplicates.

### ⚠ A mutation that does not COMPILE proves nothing about the tests

`noUnusedParameters` is on. A mutation that deletes the only use of a parameter fails `tsc` before a
single test runs: the harness sees a non-zero exit and calls it bitten, while the red-test ledger
records nothing and the ⚠ test it was written for stays uncovered. Two shapes fix it — write the
mutation as the **two edits a real revert would make** (the parameter and its use), or pick the
wrong implementation that still compiles (10f's `10f-PN2` writes 10e-A8's own defect: an
`aria-label` on a role-less element).

### ⚠ §4's nullability is per FIELD, not per collection — and a bad fixture measures a real page

`lib/client/wire.ts`'s `hostOf`/`coolingOf`/`storageOf` return `undefined` for a non-record, so a
fabricated snapshot with `host: null` fails validation **whole**: the client keeps its last state,
the header reads `stale`, every reading is an em dash — and a browser measurement of that page
reports healthy slot heights and `overflow 0`. 10f's reconciliation wrote exactly that fixture and
got a clean, quotable, entirely wrong answer on the first run. **A degraded-collector fixture nulls
the fields inside the object**, and any measurement of a fabricated page should assert something
that proves the fabrication took (measurement 10's precondition is the pattern).

### ⚠ Budget against the variable that actually drives the height

Three documents in a row budgeted §6.4's banner as a function of the **alarm count** (10e §2.11's
63.7 / 72.7 px for six, then 10f's build, then its adversarial's normalisation). Measured: a
**six**-alarm banner is **65.7 px — identical to a two-alarm one** — because six chips still wrap
to the same two lines, while twenty-one alarms measure 173.1 / 146.2 / 119.4 across the three
viewports. The height is a function of the total TEXT and of the width, not of the count. A
constant nobody re-measured propagated through three sets of arithmetic.

### ⚠ Some properties are invisible in rendered markup — assert the thing itself

A React `key` does not appear in `renderToStaticMarkup` output, and React's recovery from a
duplicate key (reuse the first element) only happens in a reconciling client — so the obvious test
("both messages render") passes under the defect. The guard calls the component as a function and
reads `element.props.children[].key`. Same family as HANDOVER §0.6's three CSS tiers: ask what
carries the property, then assert *that*, not the nearest visible thing.

### ⚠ Reconcile a re-measurement with the one it disagrees with, term by term

10f's reconciliation measured the compound page **+40 / +75 / fits** where the adversarial had
measured **+63 / +71 / +15 over**. The two are the same result: its fixture also filed an
`nvidia-smi` error, which is one GPU card's 23 px well on row 1, and its banner carried different
text. Every other slot matched **to the tenth of a pixel**. A re-measurement that lands somewhere
else is not automatically a refutation — decompose it, and the difference names the fixture term
that moved. (The same exercise confirmed the row model a third time: `cooling = cpu + 9 + safety`,
and `safety 258.5` is exactly the corrected stale-and-explained arithmetic.)

---

## 0.11 ⚠ NEW — what 10g found, and the six rules to carry out of it

### ⚠ THE RULE — a bound on a BOX is not a bound on the LINE the box sits in

10g bounded the throttle well at `max-height: 17px`, asserted all four of its declarations, backed
them with two mutations, and shipped *"17 px whatever the mask"*. Measured on a page whose mask is
actually notable, the **caption** was **41.2 px** at 1280 and 1600: `.caption` is
`flex-wrap: wrap`, and a wrapping flex container breaks lines on each item's **hypothetical main
size** — the flex base size, computed *before* any shrinking — so with `flex-basis: auto` the
well's own max-content width (839 px of chips) pushed the well onto its own second line. The bound
held perfectly and the ruled shape did not exist.

- **`min-width: 0` and `flex-shrink` do not prevent a line break.** They govern only what happens
  after the container has already decided where the lines are. `flex-basis: 0` is what makes an
  item unable to force a break.
- **Every CSS-text test in this project could still pass.** They read the bounded box's own
  declarations; the defect was in the *parent's* line-breaking. When a ruling names a SHAPE ("a
  one-line well"), the acceptance has to measure that shape in a browser — the declarations are
  necessary and are not sufficient.

### ⚠ A ledger key short enough to match everything certifies nothing — and the warning for it had been printed and read past on every run

The red-test ledger matches a `test.each` mark by the text before its first `%`, and its whole
check is `prefix not in "\n".join(failing_test_lines)`. A key of `⚠` alone is a substring of every
⚠ FAIL line, so the mark is reported covered by a run that never touched it. Three such names
existed on 2026-09-10 — **all three added by 10g, and every one of them 10g's own acceptance
test** — and the harness had a `!!! … unmatchably short` line for each, printed on every run, past
which **both** the build and the test phase reported *"every ⚠ mark reddened"*.

- **Fixed twice over**: the three names carry 40–81-character keys now, AND `marked_tests()` in all
  nine harnesses collects unmatchable keys and `main()` **returns 1** naming them. A rule that is
  written down and not checked has already been broken somewhere nobody looked — this project's own
  lesson, and this is the third time it has been paid for.
- **"No other mark has this shape" is a measurement.** Import every `regressions.py`, call
  `marked_tests()`, count keys under 12 characters. It was 1064 marks, three short; it is zero now.
- ⚠ **The same sweep found eight families of character-identical ⚠ names in DIFFERENT files** — one
  name, one key, so a mutation reddening either copy scores both covered. Seven pre-date 10g and
  are `10g-Q4`; the eighth was 10g's and is split.

### ⚠ The four wells were copies of one stylesheet, and only three of them were guarded

§6.1's affordance ruling names four bounded wells. Three had a file-local CSS test that named one
or more of the five fade declarations. `StatusRow`'s — the one on every row of SAFETY, COOLING,
STORAGE and SERVING — had **no test in the suite and no mutation in either harness**, so all five
declarations could be deleted, or `background-attachment` flipped so every row claims hidden text
permanently, with `pnpm verify` green and not one anchor moved. `styles.test.ts`'s directory-wide
rules cover *bounded* and *positioned*; they say nothing about the affordance, which is the half
the ruling added. **This is `§0.9`'s rule ("fixing a defect in one primitive does not fix it in the
primitive you write next") in the other direction: when a ruling is applied to N copies of a rule,
count the guards, not the copies.**

### ⚠ A token's VALUE needs its own assertion — asserting the `var()` that reads it is not enough

Every fade test asserted `background-size: 100% var(--well-fade-height)`. Not one asserted the
token. `--well-fade-height: 9px` → `0px` is one line in one file and it deletes §6.1's ruled
affordance from **all four wells at once**, green everywhere. The neighbouring token
(`--well-fade-cover`) *did* have a mutation, which is exactly why the hole looked covered.

### ⚠ PROCESS — never `git checkout --` while the item is uncommitted

Inherited from 10g's TEST phase, which lost 10g's work in two stylesheets that way and rebuilt them
from a captured diff. The rule *"`git checkout --` a stranded mutation"* is written for a **clean**
tree; on a dirty one it discards the item. **Undo an experiment with the edit that reverses it**,
and verify the reversal (`git diff | shasum` against what the phase inherited — 10g's adversarial
did exactly this after every experiment and it is the practice to copy).

### ⚠ PROCESS — a new browser measurement must be probed by BREAKING it before it is trusted

Two measurements shipped vacuous in this item alone (m12 passed with `.rest { display: none }`; m13
compared five open table views against five open table views), and 10c-3 shipped two more. A
measurement is not evidence until it has been shown to FAIL on the defect it names. The cheapest
form is often free: measure the BEFORE state first, and if it reports the broken number the
instrument demonstrably distinguishes the two states — 10g's reconciliation used exactly that for
A2 (41.2 px before, 17.0 after) rather than writing a second probe. Grade the fixture's own
precondition too, so a fixture that stops taking reports a failure instead of a plausible number.

## 0.12 ⚠ NEW — what 10h found, and the eight rules to carry out of it

### ⚠⚠ THE RULE — a bound that turns a VISIBLE failure into an INVISIBLE one obliges you to grade the invisible one, in the same loop

10h capped every panel at its grid row's share. That is correct and it is what `SPEC.md` §6.1
rules. But it did not remove the failure — it **changed its shape**: content that used to grow the
page now scrolls inside a panel body, behind a fade, on a wall panel with no pointer. Nine records
graded the old shape. **Zero graded the new one**, so the project's acceptance went blind to
exactly the class of regression its own fix introduced.

Measured, and this is the number to remember: a compensating share pair clipped 7 px of GPU
readings off the graded page while `measure-breakpoints.mjs` reported **44 passed, 0 failed** — and
the printed page spare **improved from 6 px to 12 px, because a panel had been clipped.** The
tightest fit measure in the project rewarded the defect.

**So: when you bound something, ask what the overflow becomes and grade that too, before the loop
closes.** The fix here was 12 records and a helper. It is the same shape as this project's founding
failure — `null` rendered as though it were data — one layer up.

### ⚠ A text assertion cannot see a LATER override, and `exec`/`slice` take the FIRST match

Three of 10h's own guards fell to this in one adversarial pass, each a one-line edit that left
**101 files / 3056 tests / 0 failed** and the page 5, 21 and 37 px wrong:

| the guard read | the defeat | the fix |
|---|---|---|
| `/\.grid\s*\{([^}]*)\}/.exec(CSS)` | a `gap` in the `.grid` rule inside a **later** media query | `matchAll` every block, and require the property **exactly once** across all of them |
| `expect(TOKENS).toMatch(/--band-reserve:\s*102px;/)` | a **duplicate** declaration five lines below (in CSS the last one wins) | `soleDeclaration(name)` — exactly one, then `toBe` on its value |
| `DECLARATIONS.slice(indexOf(query))` | a cap that has fallen **out** of the query and still sits below it | **brace-match** the query's body; "outside" means both sides of it |

**The general form: assert UNIQUENESS, not presence, for anything whose effective value is
"the last one wins".** And never `[^}]*` on a `@media` body — it stops at the first inner `}`.

### ⚠ `trim()` is not "is this printable" — U+200B is `Cf`, not whitespace

`formatModelName`'s anti-blank-cell fallback tested `last === ''` after `.trim()`. `trim()` strips
Unicode `White_Space` only, so `/models/\u200b` produced a cell of length 1 that is **visually
empty** — §6.6's forbidden blank cell, produced by the guard written to prevent it. The same
category carries U+202E, which painted `gguf.exe` as `exe.gguf`. **A "is there anything to show
here" test on free text has to strip `\p{Cf}` as well as trim.**

### ⚠ Making a box a scroller CLIPS its children's focus rings

An outline is **ink** overflow: it never contributes to scrollable overflow, so `overflow: auto` on
a box with no padding erases the ring of any child flush with its padding edge. 10h turned nine
panel bodies into scrollers *and* added nine tab stops inside them so clipped content stays
reachable — and clipped the one affordance that says where the keyboard is on 10 of 15 of them.
**`outline-offset: -2px` on descendants of any scroller** is the fix, and it was already this
project's convention in four other stylesheets. Guard it on the **sign**: `+2px` is precisely the
value the rule inherits when it is deleted.

### ⚠ A `:focus-visible` property must be measured with the element FOCUSED, in keyboard modality

The first version of 10h's focus-ring record read `getComputedStyle(el).outlineOffset` at rest and
reported **28 of 28 broken at every viewport, on a tree whose rule is correct** — because an
unfocused element computes the default. Press `Tab` first (without keyboard modality Chrome does
not match `:focus-visible` under programmatic focus at all), then `el.focus({preventScroll: true})`,
read, blur, and **restore the scroller's position**. Count how many rings actually engaged and
print it: a record that says "no bad rings found" on an empty sample is the vacuous pass again.

### ⚠ `min-width: 0` cannot stop a flex WRAP — only `max-width` can

A wrapping flex container breaks its lines on each item's **hypothetical main size**. `min-width: 0`
lets an item shrink *within* a line it has already been given, which is too late: the long item is
already on a line of its own, and the header has already grown. Bounding §3.2's `hostname` — the
term that took the sticky band from 101.8 to 130.7 px and put the page over — needed a `max-width`,
and nothing else would have done it. (A flex item is blockified, which is also why `max-width`,
`overflow` and `text-overflow` apply to a `<span>` there at all.)

### ⚠⚠ The red-test ledger caught a loop making a NEIGHBOURING guard inert — the eleventh instance of one shape

10h's reconciliation added `hostnameTitle` (the raw hostname, kept in a `title` because the visible
string is now truncated). Nothing about that was wrong. What it did was make
`app/dashboard-shell.test.tsx`'s ⚠ *"the hostname is the snapshot's own, not a literal"* **inert**:
the assertion was a document-wide `expect(html).toContain('probe-host-42')`, and with the reading
now also in an attribute, `10a-DS16` — which hard-codes the VISIBLE hostname to `'ai-server'` —
leaves `probe-host-42` in the markup and the test passes on the defect it exists to catch.

**Only the ledger could see it**, and it is what turned the nine-harness run's exit code to 1:

```
NO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:
  app/dashboard-shell.test.tsx
    ⚠ the hostname is the snapshot’s own, not a literal
```

Two lessons, and the second is the one that generalises. **(a)** A document-wide `toContain` is a
weak assertion wearing a strong name — §0.4's shape, now found eleven times; the fix is to scope it
to one element and assert both halves at once. **(b)** ⚠ **Adding a rendering of a value somewhere
new can blind a guard that was watching for that value somewhere else.** Nothing in the diff touched
that test or its subject. When you render an existing reading into a new place — an attribute, a
tooltip, a second view — sweep the guards that assert *"this reading appears"*, because the ones
written as a whole-document search have just stopped meaning what they say.

### ⚠ Measure the margin on the box that HAS one

*"How close is this page to hiding a reading"* is not `clientHeight − scrollHeight` on the body: a
scroll container whose content is shorter than its box reports `scrollHeight === clientHeight`, so
that figure is **0 on every healthy panel** and says nothing at all. The margin that carries the
information is the **slot's height against its own computed `max-height`** — which is how the four
graded pages' tightest numbers (2.9 / 1.0 / 13.8 · 35.3 / 23.7 / 36.6 · 1.3 / **0.7** / 12.1) came
out, and how the 0.98 experiment was predicted before it was run.

## 0.13 ⚠ NEW — what step 11 found, and the six rules to carry out of it

Everything here is measured, on the four packaging artefacts, by step 11's build, test,
adversarial and reconcile phases. Full account:
`steps/11-packaging/build.md`, `test.md`, `adversarial.md`, `reconciliation.md`.

### ⚠⚠ THE RULE — a cross-check is only worth the call site it is wired into, and a guard is only worth an assertion that it REFUSES

This is one sentence with two halves and the project has now paid for both, one layer apart.

**The first half, found by the test phase.** `dashboard.sh` spells three canonical rules a second
time in bash (the scrypt encoding, Docker's `--env-file` grammar, §6.4's `STANDING` vocabulary),
and `packaging.test.ts` holds each **validator** equal to its TypeScript by measurement. That
instrument is real and it works. But **nothing measured the row that CALLS the validator** — and a
row is exactly where wiring comes undone. Eight one-line edits, all four obligations disconnected,
24 tests green.

**The second half, found by the adversarial one layer out.** After five rows were wired: **63
one-line edits, 49 kept the whole suite green.** Every other `check` row, all seven preflight
refusals, `restart`'s container-id proof, `install`'s own failure gate — and `check_one_process`
replaced by `true`, which deletes the entire O22 section from `check` with 31 tests green.

**The fix is not 49 patches. It is two mechanisms**, and they are the shape to copy:

| mechanism | what it asserts | what it makes impossible |
|---|---|---|
| a **call-graph assertion** over the orchestrating function | the calls in its body equal a named list, in order, with nothing else — AND, behaviourally, stubbing all rows silent gives one exit code while each row alone raising a failure gives another | a row deleted, replaced by `true`, reordered, or called with its verdict discarded; and a NEW row cannot be added without appearing in the list, which is the only moment anyone asks whether it has a test |
| a **guard-refusal table** — "this guard refuses on ITS bad input and permits on good" | one row per guard, both directions, with the expected verdict AND a substring the message must contain | a guard turned into a warning; a guard that fires for the wrong reason (the preflight table flips **one** input at a time and requires **exactly one** refusal) |

**Measured before and after, by the reconciliation, on the same 48 enumerated edits: 49 survived
→ 0 survived.**

### ⚠ A guard you cannot exercise is a guard nothing measures — and three of them were unexercisable BY CONSTRUCTION

Not "untested". **Impossible to test**, and the reason is worth knowing before writing the next
shell script:

- `(( EUID == 0 ))` — **bash's `EUID` is readonly**, so no test can make a non-root process take
  the root branch. Every root guard in the script was unreachable. Fixed by one function,
  `is_root()`, used in all four places.
- `[[ -t 0 ]]` — a test has no tty, so everything *behind* the terminal check was unreachable,
  including the belt-and-braces re-check of the password hasher's own output. Fixed by
  `have_terminal()`.
- `install -m 0600 -o root -g root` — **fails outright for a non-root caller**, so the mode of the
  file carrying the password hash could not be asserted anywhere off the box. Split into
  `install -m 0600` plus a `chown` **conditional on being root**: identical on the box, and
  assertable everywhere else.

The general form: **when a guard's condition is a property of the process rather than of the
input, put it behind a function.** It costs one line and it is the difference between a guard and
a comment.

### ⚠ "Could not read it" is not "it is not there" — and the wrong one of those is an alarming, specific, WRONG diagnosis

`check` reported `✗ PASSWORD_HASH is absent — every login is denied, silently`,
`✗ SESSION_SECRET is absent` and `✗ STANDING is absent` on a **correct** deployment, whenever it
was run without `sudo` — because `env_get`/`env_has` returned 1 both for "no such key" and for
"cannot open the file". Three FAILED rows and exit **1**, on a healthy box, whose most likely next
action is `sudo ./dashboard.sh set-password` — overwriting a working password.

The script already had the right answer and could not reach it: **exit 2 means "a row could not be
evaluated"**, and its own header says that is *almost always "re-run it with sudo"*. Any row that
can be reached without the privilege its evidence needs must ask **first** whether it can look, and
file *unknown* rather than *failed*. A row nobody could evaluate is not a row that passed — and it
is not a row that FAILED either.

The same shape, one function over: an ordering-cycle detector that read "no output from
`journalctl -b`" as "no cycle", when a user outside `adm` gets only their own journal and still
exits 0. Three states, not two.

### ⚠ "Already present" is not "already correct" — the one place a script may not say it is the deploy path

`build` skipped a rebuild when the image tag already existed and printed a **green tick**. With no
`--tag` the tag is `notag-<UTC date>`, so **every second build of one day collided**: `:latest`
stayed where it was, the next `restart` proved a restart had happened (the container id really did
change), and `check` passed every row **on the old code**. This repo's most-repeated failure mode —
a success report over a no-op — reached through the deploy path itself.

Two things came out of it. A tag that names a **day** cannot identify a tree, so that case now
rebuilds; and **`check` compares the RUNNING container's image id with `:latest`'s** — `status`
could not, because `docker ps --format '{{.Image}}'` prints the *reference*, not the id behind it.

⚠ **The two catch different things, and saying so is part of the rule.** The comparison catches a
rebuild that was never *restarted into*; it cannot catch a *skipped* build, because a skip leaves
`:latest` where it was and the container matches it exactly. A skip has to be fixed where it is
taken. Re-using an explicit `--tag` after an edit still ships the old image — now with a warning
and the image's build time, and `--force` is the answer.

### ⚠ A fallback that is not reported becomes permanent

INSTALL-SPEC §11.1 rules that `--gpus all` must fall back rather than take the dashboard down. The
trap is not in the falling back — it is that **a container is created once and lives until
something restarts it**, so a fallback taken during a driver upgrade survives the fix
*indefinitely*, and `EnvironmentFile=-` swallows its own absence, so the degraded mode is also the
silent default the first time the probe's output goes missing.

The row that pays for that has to distinguish **three** states, not two: GPU mode; fallback while
the toolkit is still broken (the honest degraded mode — and on this box, which documents having no
compute card, the *normal* one); and **fallback while the toolkit now works**, which is the only
actionable one and the one a two-state row loses. It must read the mode from the **container**
(`docker inspect .HostConfig.DeviceRequests`), never from the unit text — which always says
`$GPU_FLAGS` — and never from `gpus: null` in the telemetry, which is what a broken toolkit *and a
box with no card* both produce.

### ⚠ A refusal that fires on a correct configuration teaches an operator to ignore the one that matters

Two instances in one file, in opposite directions.

- `ufw_rule_for_port` read the "To" column as `$1`, which is right for the rule this box has and
  wrong for a **destination-qualified** rule (`ufw allow from LAN to <ip> port 22`) and for a
  **blanket** one. Either would have made the port-22 HARD REFUSAL fire on a genuinely
  well-firewalled machine. ⚠ **Stated accurately: this box's own rule form WAS matched**, so it was
  latent here rather than live — the adversarial's headline overstated it and the reconciliation
  narrowed it with the refuting line.
- The same condition was judged twice, 380 lines apart, and the two disagreed: `preflight`
  **warned** that ufw was not enforcing and `cmd_firewall` **refused** on it — at step 6 of 8, with
  docker restarted, the image built, the password written and the unit enabled. A refusal belongs
  where it costs nothing, which is before anything has been done.

## 1. How to run anything

`pnpm` is installed through corepack into a directory that is **not** on this machine's
`PATH`, and this Mac has two Nodes. Every command starts with the export:

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
node -v            # v24.16.0   ← the pinned major
pnpm verify
```

| Script | What it is | Use it for |
|---|---|---|
| **`pnpm verify`** | `rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run` | **The only definition of green.** |
| `pnpm test` | `vitest run` | Iterating. Not authoritative on its own |
| `pnpm typecheck` | `tsc --noEmit` | Iterating — incremental, and see below |
| `pnpm build` | `next build` | **Run it before closing step 9** — it touches `app/` |
| `pnpm dev` / `pnpm start` | dev server / prod server | Local only — see §10 |

### ⚠ The Node pin, and the `PATH` line that quietly defeats it

```
$HOME/.local/bin/node  →  $HOME/.hermes/node/bin/node   v26.8.1
$HOME/.nvm/versions/node/v24.16.0/bin/node               v24.16.0   ← the pinned major
```

`pnpm` is corepack's `pnpm.js` behind `#!/usr/bin/env node`, so pnpm — and therefore Vitest,
`tsc` and `next build` — run on whichever `node` comes first. Putting `$HOME/.local/bin` first
selects Node 26 against a manifest that says `<25.0.0`. The export above fixes it. **Steps 7
and 8 added no native module and no dependency**, so `NODE_MODULE_VERSION` no longer decides
anything — the pin now matters only for behavioural drift. `.nvmrc` and `.node-version` both
say `24`, and `lib/guardrails.test.ts` asserts the three files agree.

Toolchain: pnpm 12.3.4 (pinned by `packageManager`), TypeScript 7.0.2 (the native Go
compiler), Vitest 5.0.0, Next 16.3.4, React 19.2.8. **Eight dependencies, all pinned exactly,
and steps 1–8 added zero.** Invariant 6 still stands: no dependency without recording why in
the step's notes. **Step 8 considered jsdom and declined it** — see §9; step 9 is the next
place it has a case, and D6 records the first assertion it would buy.

### ⚠ Green means `pnpm verify` exits 0. Nothing else is evidence.

The Vitest summary lies, in three measured ways:

| what was broken | what the summary printed | real exit |
|---|---|---|
| type error in `app/page.tsx` (no test imports it) | `Test Files 3 passed (3)` · `Type Errors no errors` | **1** |
| failing type assertion at module scope in a `*.test-d.ts` | `Tests 57 passed (57)` · `Type Errors no errors` | **1** |
| **a test file that fails to compile** | `Test Files 3 passed (3)` · `Tests 57 passed (57)` | **1** |

The third is the worst: a file that fails to compile does not fail its tests, it **loses them
from the count**.

**And there is a fourth, found in step 7.** `pnpm typecheck` exited **0** on a tree carrying a
`TS2305` — a test file importing a just-deleted export — because `tsconfig.tsbuildinfo` was
stale. `pnpm test` then failed at *runtime*, and Vitest's own typecheck block printed
`Type Errors no errors`. Both directions have now been paid for:

- a **false failure** (step 3) costs a bisect;
- a **false pass** (step 7) **ships the bug**.

So `verify` deletes the build-info file first. `pnpm typecheck` stays incremental for
iteration and **is not the green signal**. `lib/guardrails.test.ts` asserts `verify`'s exact
text, so it cannot be quietly weakened.

**Vitest's `typecheck` block covers only `*.test-d.ts`.** A loosened brand in `lib/` shows up
as an *unused* `@ts-expect-error` in a `.test.ts`, which `vitest run` does not see and `tsc`
does. Per-file `pnpm vitest run <file>` is **not** a substitute while iterating: steps 3, 5 and
6 each shipped a type error that only the full `tsc` caught.

### ⚠ Run the suite more than once when anything it asserts is random

Step 7 shipped a test that **failed 1 run in 16** and could not be reproduced by the phase that
wrote it. See §5.4. When a change touches anything that consumes entropy or a clock, run
`pnpm verify` in a loop — step 7's reconciliation ran it **20 times**, step 8's **10**.

### The deliberate-regression harnesses — **TEN**. Run the nine after any change in `lib/`, `app/` or `components/`; run the tenth after any change to the four packaging artefacts

⚠ **Counts below re-derived 2026-09-08 by 10b-S-G's reconciliation**, by importing each
`regressions.py` and reading `len(REGRESSIONS)` — not copied forward. Step 10's covers 10a's
shell **and** 10b's nine panel bodies; `components/panels/*.test.*` files belong to this
harness's `LEDGER_FILES` and to no other (ledger ownership follows the FILE, §5.2 rule 6).

```bash
python3 pipeline/steps/02-format-severity/regressions.py                    #  66 mutations + ledger
python3 pipeline/steps/03-collectors-gpu-host/regressions.py                #  73 mutations + ledger
python3 pipeline/steps/04-collector-cooling/regressions.py                  #  94 mutations + ledger
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py  # 130 mutations + ledger
python3 pipeline/steps/06-telemetry-route/regressions.py                    #  63 mutations + ledger
python3 pipeline/steps/07-auth-login/regressions.py                         # 128 mutations + ledger
python3 pipeline/steps/08-client-runtime/regressions.py                     # 174 mutations + ledger
python3 pipeline/steps/09-ui-primitives/regressions.py                      # 153 mutations + ledger
python3 pipeline/steps/10-panels-assembly/regressions.py                    # 299 mutations + ledger
python3 pipeline/steps/11-packaging/regressions.py                         # 130 mutations + ledger
```

⚠ **The tenth is the only harness that reads `dashboard.sh`, `Dockerfile`, `.dockerignore` or
`systemd/ai-dashboard.service`**, and `packaging.test.ts` is the only test file that reads them —
verified by grep, not assumed, so that file's verdict IS `pnpm verify`'s verdict for those four
artefacts. Ledger ownership follows the FILE (§5.2 rule 6): `packaging.test.ts` is in this
harness's `LEDGER_FILES` and in no other. ⚠ **Nothing under `lib/`, `app/` or `components/` was
touched by step 11**, which is why its reconciliation did not re-run the other nine — `git status`
is the evidence, and it is in `steps/11-packaging/reconciliation.md` §8.

⚠ **Counts re-derived 2026-09-10 by 10h's reconciliation**, by importing each `regressions.py` —
never by `grep -c`, which the id-prefix guard's own literal inflates by one. **1180 across the
nine, 1180 unique, zero cross-harness collisions.** ⚠ **Step 11's harness adds 130 with the
`11-` prefix — 1310 across the ten** (52 written by step 11's build and test phases, **+78 by its
reconciliation**, which is the adversarial's own sweep re-aimed at the reconciled tree so that the
measurement of the hole is the harness that keeps it shut).

⚠ **10h's RECONCILIATION RAN ALL NINE, serially, in ONE detached call, and this is the current
state** (2026-09-10). Re-derived from that run's own `Red-test ledger` / `All N regressions
failed their check` lines, not carried forward. **All nine exit 0.**

| harness | mutations | red-test ledger | result |
|---|---|---|---|
| `02-format-severity` | **66** | 282 red across 66; **30 ⚠ checked** | **exit 0** |
| `03-collectors-gpu-host` | 73 | 115 red across 73; 25 ⚠ checked | **exit 0** |
| `04-collector-cooling` | 94 | 188 red across 94; 85 ⚠ checked | **exit 0** |
| `05-collectors-serving-storage-safety` | 130 | 190 red across 130; 100 ⚠ checked | **exit 0** |
| `06-telemetry-route` | 63 | 88 red across 63; 56 ⚠ checked | **exit 0** |
| `07-auth-login` | 128 | 202 red across 128; 130 ⚠ checked | **exit 0** |
| `08-client-runtime` | 174 | 288 red across 174; 221 ⚠ checked | **exit 0** |
| `09-ui-primitives` | **153** | 210 red across 153; **155 ⚠ checked** | **exit 0** |
| `10-panels-assembly` *(second run — see `steps/10-panels-assembly/10h-reconciliation.md` §5.1)* | **299** | 341 red across 299; **302 ⚠ checked** | **exit 0** |

**1180 mutation ids across the nine, 1180 unique, zero cross-harness collisions** — re-derived by importing each `regressions.py`, never by `grep -c`. **Zero `ANCHOR NOT FOUND`, zero `ANCHOR AMBIGUOUS`, zero `DID NOT BITE`, and every ⚠ mark reddened in all nine.**

⚠ **Steps 3-8 are identical to the TEST phase's run in every column** — 115/25 · 188/85 · 190/100 · 88/56 · 202/130 · 288/221 — which is the check that says nothing under `lib/` (other than `lib/format.ts`) or `app/` moved outside this loop's own two files. Step 2 grew because `lib/format.ts` is its ledger's subject (`10h-FM6`, plus the new ⚠ test it reddens: 29 → 30 marks checked); step 9 grew by `10h-PS11` (154 → 155 marks); step 10 owns every other file this reconciliation touched.

⚠ **Step 10's row is from a SECOND run**, and the first run's exit code is the finding of §5.1: the ledger reported one ⚠ test that no mutation reddens — one this reconciliation had itself made inert — and **returned 1**. The other eight rows are from the first run, which no part of that fix could reach.

⚠ **Superseded, kept for its reasoning — 10g's own note:** *"Steps 2–8 are identical to 10f's run
in every column. That is the check that says 10g's edit to the shared ledger block in all nine
harnesses changed no coverage anywhere it was not meant to."* 10h applies the same check one loop
on: steps 3–8 are identical to 10h's TEST phase's run in every column.

⚠ That total goes stale on the next item that adds a mutation; the authoritative number is always
each harness's own printed line.

⚠ **Run the anchor check after a run as well as before it.** 10f's reconciliation ran it *while*
the nine were still going and got three `ANCHOR x0` reports on `lib/auth/authorize.ts` and
`components/chip.tsx` — all three were the harness's own in-flight mutation, not a defect. A file
under a running harness is mutated for a second or two at a time; any source-text check taken then
is measuring a file the harness is about to restore.

⚠ **10c-2 touched THREE and re-ran three — steps 2, 3 and 10 — and its reconcile phase re-ran
step 10's alone.** The build re-anchored step 2's `02-R3` onto `UNIT_GIB` (`lib/format.ts`'s
literal moved into a constant), added `10c-G1` to step 3 (adopting `lib/contract.test.ts` into
its ledger), and added `10c-G2`…`10c-G5` to step 10 → **172**, with **200 ⚠ marks**. The
reconciliation touched only files in step 10's `LEDGER_FILES` (the four guards plus
`safety-panel.test.tsx`) and re-ran step 10's harness only, checked by grepping every
`pipeline/steps/*/regressions.py` for each. ⚠ **Step 2's harness exits 1 for THREE PRE-EXISTING
broken anchors** on the uptime formatter (`02-R20`/`02-R30`/`02-R31`, orphaned when that function
gained a `prefix` parameter long before this loop). Do not read that exit as a regression, and do
not "fix" it inside an unrelated item.

⚠ **10c-1 touched step 10's ONLY, and re-ran step 10's only.** It went 138 → **158** (build:
`10c-DS*`, `10c-CVT*`, `10c-GP1..3`, `10c-CP*`, `10c-CO1..3`, `10c-FA*`, minus `10a-PP1`/`PP2`
which went with `PanelPlaceholder`) → **159** (test phase: `10c-CO4`) → **168** (reconciliation:
`10c-GP4/5/6`, `10c-DS5/6/7`, `10c-UT1/2/3`), with **196 ⚠ marks**. That it is the only one was
established by grepping every `pipeline/steps/*/regressions.py` for each changed file — step 8's
sole hit is a **docstring** mention of `use-telemetry.ts`, not a ledger entry or an anchor.

⚠ **10b-S-G touched three of them and re-ran two.** Step 5 gained `10b-SF1` (test phase) and
`10b-SG1`/`10b-SG2` (reconciliation) → **130**; step 8 gained `10b-W1` (build) → **174**; step 10
gained `10b-SG3`…`10b-SG7` (reconciliation) → **138**. **Step 8 was NOT re-run by the
reconciliation and did not need to be** — nothing under `lib/client/` changed in that phase. The
rule is: re-run the harnesses whose `LEDGER_FILES` you touched, and **say which**.

⚠ **NINE as of 10a (2026-09-08).** `pipeline/steps/10-panels-assembly/regressions.py` is new: it
owns `app/dashboard-shell*.tsx`, `app/page*.tsx`, `app/use-now-tick*`, `lib/client/header-status*`,
`lib/client/banner*`, `lib/client/use-telemetry*`, and the four `components/` files 10a added
(`header`, `alarm-banner`, `grid`, and `panel-placeholder` until 10c-1 deleted it). It went **32 → 34** (10a's test phase)
**→ 70** (10a's reconciliation), with **86 ⚠ marks**, and it is the first harness in the project
to mutate a **CSS file** (`components/grid.module.css` — six of the seventy).

⚠ **The last one is the harness for `components/`, not for "step 9".** Ledger ownership follows
the FILE (see below), and every `components/*` test file is in its `LEDGER_FILES` and in no
other's. So **every UI item lands its mutations there**, prefixed with its own creating id —
it went 61 → 79 (Q2's build + test phases) → **93** (Q2's reconciliation), of which **32 are
`Q2-`**. It takes about a minute. A UI item that touches nothing under `lib/` or `app/` owes
**this harness only**: running the other seven would measure nothing it can have changed.

⚠ **It is eight, not seven.** Every handover before this one said seven, because step 9's harness
was written after them. Q1's fix to the ⚠-scanner applies to step 9's too — it is the **donor** of
the corrected scanner and carries the same blind spot — so an item that touches the scanner
touches eight files and owes eight runs.

**1130 mutations** — 60/73/94/130/63/128/174 across steps 2–8, **140** in the `components/`
harness and **268** in step 10's. ⚠ Every one of those nine figures is 10g's reconciliation's own
run of that harness (2026-09-10, all nine serially in one call, all nine exit 0), not carried
forward from an earlier loop.
⚠ **This total and the nine above it go stale on every item that adds a mutation, and have done seven times.** Do not trust them; the authoritative number is the
`All N regressions failed their check` line each harness prints, and all **eight** can be
re-derived at once by importing each `regressions.py` and reading `len(REGRESSIONS)`. ⚠ Do **not**
count with `grep -c '("10a-'` or its equivalent: the id-prefix guard `startswith("10a-")` contains
the same literal and inflates every count by exactly one. Each replaces one exact string in one source file with a **plausible wrong
implementation** — the wrong thing someone would actually write, never a syntax error — runs
the affected check, and restores the file. Every one must exit 1. Step 1 has no harness.

⚠ **Do not run a harness concurrently with `pnpm verify` or with another harness.** They mutate
source files in place. Concurrency produces a plausible false `TS6133` **and** a ledger that
falsely reports ⚠ tests as uncovered — both quotable rather than obviously broken. Serialise.
Steps 4, 5, 7 and 8 each take several minutes, and **a harness writes nothing to stdout until
it exits** (Python block-buffers to a file).

⚠ **DO NOT WRITE THAT WAIT LOOP. The advice this paragraph used to give cost five hours on
2026-09-08** and ANCHOR §9 now documents it: a `pgrep -f "regressions[.]py"` loop written in the
**same `bash -c` string** that launched the harness matches the *waiting shell's own command
line*, so it spins forever with no harness running at all. Seven orphaned shells were found this
way; 10a's adversarial phase found an eighth still spinning, from another session.
**Run harnesses as plain sequential foreground commands** — `python3 …/09.py; python3 …/10.py` —
which are serial by construction and need no poll.
⚠ **The brackets are load-bearing.** Written as `pgrep -f regressions.py`, the pattern matches
the **waiting shell's own command line** — which contains that text — so the loop can never
exit. Seven such shells were found spinning from earlier sessions on 2026-09-07, and every
one of them had been abandoned after its caller gave up and read the log instead. Better
still: run the harness in the background and use its **exit status**, which cannot be
confused with anything.

⚠ **`ANCHOR NOT FOUND`, `ANCHOR AMBIGUOUS` and `DID NOT BITE` are three different findings.**
The third label is new in Q1 (2026-09-07) and covers an anchor that matches its file **more than
once**: `replace(old, new, 1)` takes the first site silently, so the mutation applies, a test
reddens, the ledger goes green, and the property being certified is no longer the one the
mutation's name records. Two existed and both are now pinned — `U6` (step 8: `start()` and
`resume()` carry byte-identical hidden-tab guards) and `T68` (step 4: one `} from
'@/lib/collectors';` closes both the value import and the `import type` block).

- **`ANCHOR NOT FOUND`** means the implementation moved and the mutation needs **re-aiming**.
  It does not mean the test is fine. Step 7 re-aimed thirteen; step 8's reconciliation re-aimed
  **twenty**, after its own fixes moved the code the mutations pointed at.
- **`DID NOT BITE`** means the mutation applied and nothing noticed. **The first hypothesis is
  a missing or inert test, not a bad mutation.** Step 8's reconciliation found six, and all six
  were missing fixtures.

⚠ **Two shapes of `DID NOT BITE` that are not a bad mutation, and both have now happened:**

1. **Adding a `try`/`catch` removes a distinction** (step 7). `N2` had bitten for six phases;
   the moment the handler wrapped its verdict in the catch §5 requires, both implementations
   answered 204 and the test asserted only the status. The fix was a stronger test — assert
   what was *written*, not what was *returned*.
2. ⚠ **Adding a second, independent defence makes the first one's mutation inert** (step 8).
   `W4` removed `wire.ts`'s ISO-shape guard and had bitten since step 8's build. F13 then added
   a calendar round-trip, which independently refuses every row the test table held — so the
   mutation applied, the property stayed true, and the guard's own coverage silently went to
   zero. **The fix is a fixture in the region only the first guard can see**: the round-trip
   compares 19 characters, so a non-canonical *spelling* of a correct instant
   (`…T14:02:11.000+00:00`, `…T14:02:11.4821Z`) passes it. That is not cosmetic — §6.7's dedupe
   is keyed on the `ts` **string**, so one instant under two spellings enters the ring twice.
   **Whenever a fix adds a defence, re-run the harness and read what stopped biting.**

⚠ **`ANCHORS MOVED` and `DID NOT BITE` are now printed as separate summary lines.** Until
2026-09-07 all the harnesses appended an anchor miss to the same list and reported it under
`DID NOT BITE` — the more alarming of the two labels, sending a reader to hunt for a missing
test that is not missing. Found when an edit to `cooling.ts` moved step 4's `T31`.

⚠ **Ledger ownership follows the FILE, not the step.** A ⚠ test added to a file already in an
earlier step's `LEDGER_FILES` needs its mutation in **that** step's harness. Step 8 added ⚠
marks to `lib/conditions.ts` and `lib/format.ts`, so the ledger was **retrofitted to step 2's
harness** — and immediately found **six pre-existing ⚠ marks with no mutation behind them**,
five of them on `severity.ts`'s fan-stopped rows, including the `-0` / `Object.is` trap. All
six are now backed (`R51`–`R55`, and `T51` in step 4). ⚠ **Step 3's harness gained its ledger on
2026-09-07, and all **eight** now have one.** That retrofit found **four ⚠ marks with no mutation
behind them** — a temperature that must not gain a plausibility range, the *total* half of O7's
backwards-counter guard (fixture symmetry: only the *busy* half had a mutation), and `gpus: []`
collapsing to `null`. The fourth had its ⚠ dropped: it depends on nothing under
`lib/collectors/`, so no step-3 mutation can reach it.

⚠ **A ⚠ mark with two owners is a mark neither owner has to back.** `lib/conditions.test.ts`
was in step 4's `LEDGER_FILES` *and* was about to be added to step 2's. Step 2's ledger was
scoped to `format.test.ts` + `severity.test.ts` instead, and the conditions mutations went into
step 4 as `T70`–`T83`.

⚠ **The harness prints only the first three FAIL lines per mutation.** Reading coverage off the
printed log is therefore wrong; the ledger unions *all* of them. This cost one wrong conclusion
in step 8. **Trust the ledger's verdict, never the printed excerpt.**

⚠ **A `test.each` name whose first `%` falls early is unmatchable by the ledger**, and the
harness warns (`⚠ test name is unmatchably short`). ⚠ **Q1, 2026-09-07: the warning is not the
whole defence, and a name short enough scores covered for FREE rather than being caught.** A
prefix of `⚠` alone is a substring of every ⚠ FAIL line, so `prefix in joined` is trivially true
and the mark is reported covered by a run that never touched it. One mark had been in that state
since it was written. The `%` split now applies only to `.each` calls (a literal `%` in a plain
name no longer truncates the prefix), and **the harness reports every `test`/`it` call it could
not read at all** — see §0.1 rule 1.

⚠ **Mutation ids must be unique within a harness — and this is now ENFORCED, because writing
it down did not work.** Step 8's reconciliation added nine colliding ids; when the rule was
finally checked across all eight harnesses on 2026-09-07 it found **nine more, pre-existing and
invisible** — `R30`/`R31` in step 2, `T56`/`T57`/`T67`/`T68` in step 4, `D10`/`D11`/`L15` in
step 5. A duplicate does not crash: it makes the `DID NOT BITE` and `ANCHORS MOVED` lists
ambiguous about *which* entry failed, so the one output that matters when something is wrong is
the output that stops being readable. **Every harness now calls `_assert_unique_ids()` at import
and exits naming the offending ids.** The lesson is the general one: *a rule that is written
down and not checked has already been broken somewhere you have not looked.*

---

## 2. What exists

Everything under `dashboard/`. Nothing outside it has been created or modified except the root
`.gitignore`.

| Path | What it is |
|---|---|
| `lib/types.ts` | **The telemetry contract** + §3.7's closed vocabularies. ⚠ `standing: readonly string[]` is new in step 8 — **required, never `null`** |
| `lib/fixtures.ts` | **Canonical snapshots**, exported for every later step. Both roots carry `standing: []` |
| `lib/format.ts` | **§6.6** — every formatter, its two laws, and `formatAge` |
| `lib/severity.ts` | **§6.3** — every threshold row |
| `lib/throttle.ts` | **§3.7** — the `clocks_throttle_reasons.active` decoder |
| `lib/conditions.ts` | **§6.4 + §9** — `observePoll`, the ten-second hold, the ledger, standing, §6.5's stale/retired edges, §9's worst-wins dedupe |
| `lib/units.ts` | **New in step 8.** `FAN_SERVICE_UNIT`, `servingUnitName` — moved out of `lib/collectors/dbus.ts` so §6.4's ids can be built in a browser without dragging `node:net` into the bundle. ⚠ **It imports nothing, and a test holds that line** |
| `lib/source-text.ts` | `codeOnly`, `sourceFiles`, `projectRoot` — the guardrails' inputs |
| `lib/collectors/*.ts` | The six collectors, their seams, parsers and bounds — **finished** |
| `lib/telemetry/*.ts` | §4's cache, gate, ceiling, assembly, source and handler |
| `lib/auth/*.ts` | scrypt, base64url, config, cookie, session, revocations, rate-limit, authorize, handler, login-view |
| **`lib/client/*.ts`** | **New in step 8** — see §3 |
| `app/api/telemetry/route.ts` · `app/api/session/route.ts` | `dynamic` + the handler names, and nothing else |
| `app/login/page.tsx` · `login-form.tsx` | `/login`, and `LoginForm` (stateful) + `LoginCard` (**pure**) |
| `proxy.ts` | §5's gate. **`proxy.ts`, NOT `middleware.ts`** — §7 |
| **`components/*.tsx` + `*.module.css`** | **step 9's primitives, with Q2's hover layer and table view** — see §3.5 |
| **`components/header.tsx` · `alarm-banner.tsx` · `grid.tsx`** | **New in 10a** — §6.2's header, §6.4's banner, §6.1's grid. All pure, all with `.module.css`. ⚠ **`panel-placeholder.tsx` is DELETED** (10c-1) — it implied a "pending" mechanism that no longer runs, and its one useful property is now proven against the real panels' own output |
| **`components/panel-props.ts`** | **New in 10a.** `PanelProps` / `PanelId` — the contract 10b typechecks against. §3.6 |
| **`lib/client/header-status.ts` · `banner.ts`** | **New in 10a.** §9's aggregate status reduction and §6.4's banner reduction. Pure, hook-free, no React |
| **`app/dashboard-shell.tsx` + `.module.css`** | **New in 10a.** The ONE stateful surface: one `useTelemetry()`, one `useNowTick()`, one `state === null` guard, one sticky band |
| **`app/use-now-tick.ts`** | **New in 10a.** D2's independent age interval. Never driven by any store |
| **`components/panels/*.tsx` + `*.module.css`** | **New in 10b — the nine panel bodies**, plus `status-row.tsx`, `panel-notes.tsx`, `condition-lookup.ts`, `panel-chart.ts`, `event-sentence.ts`, `test-support.ts`, and 10c-1's `chart-view-toggle.tsx`. All pure, all inside `purity.test.ts`'s recursive walk. ⚠ **Mounted as of 10c-1** — see below |
| **`lib/client/force-alarm.ts`** | **New in 10c-1.** 10a-F4's alarm-forcing escape hatch — a pure function of `(body, search, nodeEnv)` wrapped around `RuntimeEnv.fetchTelemetry`, so a forced alarm runs the real validation, severity, debounce and banner path. Gated on `NODE_ENV !== 'production'` **and** an undocumented query string; the production gate is now a **behaviour** (`use-telemetry.force-alarm.test.tsx`, `10c-UT1`), not just a token |
| **`lib/tocontain-scope.test.ts` · `cross-harness-ledger.test.ts` · `dangling-css-class.test.ts` · `unit-suffix.test.ts`** | **New in 10c-2.** Four mechanism guards over the source tree, not over the product: the document-wide `toContain` lint, the cross-harness `LEDGER_FILES` runner, the dangling-CSS-class audit and L11's unit-suffix guard. All four walk the tree, all four are comment-blind, all four are in step 10's `LEDGER_FILES` with one `10c-G*` mutation apiece. ⚠ What each is blind to: §5.3 |
| **`lib/format.ts`'s `UNIT_*` constants** | **New in 10c-2.** `UNIT_CELSIUS`/`WATTS`/`MIB`/`GIB`/`RPM`/`MHZ`/`PERCENT`/`MB_PER_S`/`KB_PER_S` — the nine §6.6 suffixes, and every formatter now builds its suffix from one of them rather than from an inline literal. **Not `lib/units.ts`**, which means systemd unit names |
| **101 test files** | ⚠ **3010 tests** as of 10g's reconciliation, 2026-09-10 (10c-3 left 2793 · 10e → 2933 · 10f → 2967 · 10g's build → 3006, its test phase → 3008, its reconciliation → **3010**: the two ⚠ tests behind A3's unguarded reverts). ⚠ Stale on every item; `pnpm verify`'s own line is the number |
| `package.json` · `pnpm-lock.yaml` · `tsconfig.json` · `next.config.mjs` · `vitest.config.mts` | pinned toolchain; `strict` + seven more flags, all asserted |
| `app/layout.tsx` · `app/page.tsx` | ⚠ **No longer placeholders.** `page.tsx` renders `<DashboardShell />` and nothing else; `layout.tsx` imports `components/tokens.css` and paints the ground from tokens. ⚠ **`app/page.tsx` must stay free of telemetry** — see §6 — and it is now tested (`app/page.test.tsx`) |

⚠ **`components/` exists, and as of Q2 (2026-09-08) it carries §6.2's hover layer and table
view too.** Step 9 built the panel shell, chips, meters, rows, the sparkline and §6.2's stacked
cooling chart on `dashboard-frontend`; Q2 added a caller-owned `view` prop, a CSS-only crosshair,
native `<title>` tooltips and a table view to both chart primitives. One harness covers all of
it — `pipeline/steps/09-ui-primitives/regressions.py`, ⚠ **140 mutations, 146 ⚠ marks** as of 10g (it was 93/103 at Q2; 10g's build took it to 138, its test phase to 140).

⚠ **Every component is still a pure function of its props with zero React hooks**, and
`components/purity.test.ts` is unmodified and unweakened through all three items — 10a included.
**The hook boundary is settled and 10b inherits it as fact: `components/` is hook-free, hooks live
under `app/`, and there are exactly two of them** (`useTelemetry`, `useNowTick`), both called once,
both in `app/dashboard-shell.tsx`. The guard's walk recurses, so `components/panels/` is inside it
the moment 10b creates it. That is not a style
preference: it is why the view toggle is a **prop** the caller owns (step 10), and why there is
no `useId`, no hover-position state and no self-toggling leaf anywhere under `components/`.

⚠ **The assembly exists as of 10a and is COMPOSED as of 10c-1 (2026-09-08).**
`app/dashboard-shell.tsx` composes `Header` + `AlarmBanner` + `Grid`, and all nine grid slots now
hold their **real panel** — `PanelPlaceholder` is deleted. **jsdom exists** (`jsdom@30.0.1`,
devDependency, added by 10a for D6) — six test files use it, and `next build` was re-run to
confirm it does not reach `.next/standalone`.

⚠ **`GpuPanel` takes NO `index` prop** and is called with a literal `panelId="gpu0"`/`"gpu1"`
rather than through the `panel(id)` helper — `GpuPanelProps` narrows `panelId` to
`'gpu0' | 'gpu1'` and the helper's return type carries the full `PanelId` union, so spreading it
would widen the literal back out and let a swapped slot typecheck (10b-F12).

⚠ **Q2-S2's chart/table toggle is SHELL state, one entry per chart-bearing panel.**
`chartViews: Record<'gpu0'|'gpu1'|'cpu'|'cooling', 'chart'|'table'>` lives in
`app/dashboard-shell.tsx`; the four chart-bearing panels take **optional** `view`/`onToggleView`
props and render no control when `onToggleView` is omitted. The control renders **beside each
chart**, never in the header — §6.2 says the header list is exhaustive and that "a tooltip is
part of a chart, not a control of the page". ⚠ **Granularity is one toggle per PANEL, governing
every chart that panel draws** — §6.2 does not say, and the decision is recorded in
`chart-view-toggle.tsx`'s module doc (invariant 7), not spec-mandated.

⚠ **What composing them found, and it is the reason the join is worth mounting** (§0.6): three
positional-indexing defects and two unasserted toggle wirings, all invisible to ~330 isolated
panel tests. *A mutation harness over the parts does not cover the join* — 10a's own lesson, and
10c-1 is the loop that paid it.

**Does not exist yet:** `Dockerfile`, `.dockerignore`, `dashboard.sh`, the systemd unit,
`README.md`; any **automated** browser-driven test (10c-3, §9 — 10c-1 ran a real Chrome by hand
and argues in `10c1-build.md` §3.3 for giving it its own loop with a purpose-built tool).

---

## 3. The public surface steps 9–12 build on

### 3.1 ⚠ The client runtime (step 8) — this is the corrected surface, not `build.md`'s

```ts
useTelemetry(): { state: RuntimeState | null; runtime: TelemetryRuntime | null }   // NO options

new TelemetryRuntime(env)   ·   start() · stop()
setCadence(1|2|5|10|30) · setWindow(10|30|120) · pause() · resume() · refreshNow()
subscribe(listener) => unsubscribe   ·   getState(): RuntimeState

RuntimeState = {
  preferences, ring, conditions, displayed, events, gaps,
  paused, hidden, consecutiveFailures, lastFailure,
  mode: 'live' | 'paused' | 'stale' | 'expired',
  severity: Severity | null,        // §9's dot
  alarms: number,                   // §9's count — omit it at zero, in the RENDERING
  unknownStanding: readonly string[],
}

DisplayedCondition gains:  stale: boolean · lastSeenMs: number · enumeration: string | null

ageMs(state, nowMs): number | null   ·   latestSample(state): Sample | null   // newest by ts
samplesWithin(ring, windowMs)        // ⚠ NO nowMs parameter — anchored on the newest sample's ts
seriesFrom(samples, pick) · decimateSeries(points)   // 600 points PER SERIES
formatAge(ms)                        // a negative age never renders as a negative number
anyGapReason(state) · gapIsOpen(gaps) · modeOf(input) · isStale(input) · staleAfterMs(cadenceMs)
MAX_SAMPLES · MAX_RENDERED_POINTS · MAX_EVENTS · BACKOFF_CAP_MS · LONGEST_WINDOW_MS
CADENCE_SECONDS · WINDOW_MINUTES · DEFAULT_PREFERENCES · cadenceMs() · windowMs()
```

⚠ **`samplesWithin` lost its `nowMs` parameter in step 8's reconciliation.** Any call written
from an older note will not compile, which is the safe direction — but do not re-add it. The
window is `[newest.tsMs − windowMs, ∞)`, anchored on the data (§6.7). Anchored on the browser's
clock instead, a server 31 minutes behind empties a 30-minute chart **while the ring is full of
good data and the header still reads `live`**.

⚠ **`conditionsFrom` is NOT a panel surface.** It is deliberately un-deduplicated —
`unit:gpu-fan-control.service` comes out **twice**, once from COOLING and once from SAFETY —
and §9's reduction is what collapses them. A panel that mapped it to rows would render the fan
service twice and count two alarms for one fault, which is the outcome §9 forbids by name.
**Use `state.displayed`.**

### 3.2 The telemetry endpoint

```
GET /api/telemetry
  200 → TelemetrySnapshot (§4), Cache-Control: no-store
  401 → NO BODY, Cache-Control: no-store          ← session missing, expired or revoked
```

- **2 s cache holding the IN-FLIGHT promise.** At 1 s you receive the same `ts` two or three
  times in a row. **A repeated `ts` is not a failed poll** — step 8 handles it; step 9 sees
  only that the state object is returned by identity.
- **`ts` is the poll's start**, so an age computed from it can only over-state.
- **A partial snapshot is a 200 with `errors[]`** — the normal case on this machine
  (invariant 5).
- ⚠ **`errors[]` is in the snapshot's own field order** (gpus, host, cooling, serving,
  storage, safety) — but that is **this project's decision, pinned by a test, not §4's
  contract.** `grep -n "field order" SPEC.md` is empty. The earlier handovers stated it as
  contract; it is stated correctly here. It is load-bearing anyway, and that is why it is
  pinned: **`dbus` is filed by two collectors** (`collectSafety` for the fan service,
  `collectServing` for the llama units), and §6.7's client rule shows the **last** message
  per source, so the order decides which D-Bus sentence an operator reads. `snapshot.ts`
  states the reason, `snapshot.test.ts` pins it, and step 6's `A19` mutation backs it.
  §6.5 matches an entry to a figure by `source`. Eighteen sources, closed (§3.7).
- **`serving: null` is not `[]`**, on the wire and after any validation.
- ⚠ **`standing: string[]` is required and echoed verbatim** (S34). It is configuration, not a
  reading, so `null` is not one of its values, and the **client** reads it from every accepted
  sample. ⚠ **The SERVER does not.** `createTelemetrySource` captures it **once, at
  construction**: in production the value reaches `process.env` through Docker's `--env-file`,
  which reads `/etc/ai-dashboard.env` at `docker run` and never again, so a per-sample re-read
  answered the same value every time while implying it might not. **Changing `STANDING`
  requires a container restart.** §4 still says *"a change takes effect on the next poll"* and
  is owed a correction (§8). Settled by the owner 2026-09-07; `source.test.ts` pins it and step
  6's `A20` backs it.

### 3.3 ⚠ The auth surface — exactly one module of it is client-safe

```ts
// lib/auth/login-view.ts — pure strings and pure functions, NO imports at all.
export const LOGIN_PATH   = '/login';         // step 8 routes a 401 here
export const SESSION_PATH = '/api/session';   // ← step 10's logout calls DELETE here
export const EXPIRED_PARAM = 'expired';       // presence, not value
export const loginView · loginOutcome · retryAfterSeconds · LOGIN_WORDMARK · …
```

⚠ **Do not import anything else from `lib/auth/` in client code.** Everything else reaches
`node:crypto` and process-global state. Two ⚠ tests hold the line: one asserts the module has
**no imports at all**, the other refuses a quoted `'/login'` or `'/api/session'` anywhere else.
**A third spelling of either path turns that test red, which is the point.**

**A revoked cookie can still fetch the HTML shell.** The gate (`proxy.ts`) makes the
cryptographic verdict only; the **revocation** check runs on every `/api/*` route. So `GET /`
with a logged-out cookie is a 200, and its first `GET /api/telemetry` is the 401 that sends the
user to `/login`. That is acceptable **only while the shell carries no telemetry and no
secrets** (§6) — **including `standing`**, which is why S34 put it on the snapshot rather than
on a server-rendered prop.

### 3.4 The rest, unchanged from step 6

```ts
collectGpus · collectCpuTemp · collectHost · collectCooling · collectServing · collectStorage
collectSafety · collectUnitStates   ·   CollectorIo · HttpIo · DbusIo · StatvfsIo
MAX_TIMEOUT_MS · boundedTimeoutMs · deadline · boundedReader
reason · errnoCodeOf · tag · ParseResult<T> · clean<T>
NO_DELTAS · advanceDeltas · cpuPctBetween · netRatesBetween · withServiceState
observePoll · conditionsFrom · DEFAULT_PATHS · FAN_CHANNELS · PWM5_FILE · …
```

Branded units — `Celsius` `Watts` `MiB` `GiB` `GB` `MHz` `Rpm` `Percent` `BytesPerSecond`
`Seconds` `Pwm` `Port` `Tokens` over `number`; `IsoTimestamp` `ThrottleMask` over `string`.
⚠ **The constructors name a unit; they do not validate one.** They are `v as T`, erased at
runtime — so **O10: no `as TelemetrySnapshot` on a `fetch` response**. Validate the wire shape;
do not assert it.

Closed vocabularies, switched over exhaustively: `Severity` · `UnitState` (6) · `LinkState`
(7) · `HealthState` (3, field is `| null`) · `Ch5Mode` · **`ErrorSource` (18)** ·
`ThrottleTreatment` · `ThrottleReasonName` (8). `noFallthroughCasesInSwitch` is on and
asserted. **Steps 3–8 produced all eighteen sources and no nineteenth was ever needed.** If
step 9 needs a new one, that is a spec gap to **report**, not a blank to fill.

### 3.5 ⚠ NEW — `components/`, the surface step 10 composes (steps 9 + Q2)

Everything is a **pure function of props**, hook-free, and `purity.test.ts` enforces that by
shape rather than by a list of hook names. Nothing here owns state, picks its own size, or picks
its own view.

| Component | Surface worth knowing |
|---|---|
| `PanelShell` · `Chip` · `Meter` · `Row` | step 9's. `Meter`'s bar is `aria-hidden` with its value as adjacent visible text (a deliberate anti-double-announcement decision) — which is why it is **not** a per-mark-tooltip site |
| `Sparkline` | `points` · **`ariaLabel`** · `color` · `formatValue` · `formatTime` (all **required**) · `width?` `height?` · **`view?: 'chart' \| 'table'`** (default `'chart'`) · ⚠ **`gaps?`** — new in 10c-3 (F14b). Optional, unlike the chart's **required** `gaps`, so a new caller inherits the defect by omission: pass `state.gaps`, always, and see §0.8 |
| ⚠ **Gap rendering, both primitives** | **One mark and one table row per GAP** — never per adjacent point-pair, never suppressed because a `null` sits beside it. `Sparkline.gapSpansFor` and `StackedTimeSeriesChart`'s `gaps.map` must keep agreeing; three defects came out of them disagreeing (§0.8). ⚠ `Sparkline` also BREAKS the polyline across a gap; the chart draws through and hatches behind, because it positions by real time and the sparkline positions by index |
| `StackedTimeSeriesChart` | `id` · **`ariaLabel`** · `plots` · `gaps` · `domainStartMs` · `domainEndMs` · `formatTime` · `width?` `plotHeight?` · **`view?: 'chart' \| 'table'`** (default `'chart'`). ⚠ **It now enforces its own domain precondition** (`clipPlotsToDomain`, Q2-F9): an out-of-domain point is DROPPED from the polyline, the marks, the hover layer and the table, once, above the `view` branch |
| ⚠ **`CHART_SIZE` (`components/grid.tsx`)** | The one place a chart's pixel box comes from (L9). ⚠ **`sparkline.height` is a total `<svg>` height; `cooling.plotHeight` and `gpuPromoted.plotHeight` are PER PLOT** — the field was called `height` on all three until 10c-3's A7, and COOLING's chart paints **450px** for a declared 210. A new panel adds a named export here, never a literal at the call site |

**Five things about them that will bite a caller, all learned the expensive way:**

1. **The view toggle is the CALLER's state.** Both take `view` as a prop and neither remembers
   it. Step 10 holds it, exactly as it holds the sparkline's size — *"a primitive that picked its
   own size would be deciding layout from a leaf"*, one level up.
2. **`ariaLabel` is required and deliberately un-defaulted on BOTH.** §6.1 puts three sparklines
   and up to three charts on one page; any built-in sentence announces two of them as the wrong
   thing. `StackedTimeSeriesChart`'s prop doc argues the case; `Sparkline` had the built-in
   sentence that comment argues against until Q2 removed it.
3. **The chart never formats a number.** It imports exactly one thing from `lib/format.ts` —
   `EM_DASH`. Every unit-bearing string comes from the caller's `formatTick` / `formatTime` /
   `endLabel`, so the axis, the tooltip and the table cannot disagree about how a reading reads.
   ⚠ **The formatter is called only on a readable number**: `null`, `undefined` **and non-finite**
   render `EM_DASH` without reaching it. A derived `pick` that divides — a rate, a ratio over a
   zero denominator — is where step 10 will produce the non-finite case.
4. **A gap is drawn from `gaps`, never inferred** — and as of Q2 the **table view applies the
   same domain filter the chart does**. `runtime.ts` prunes gaps at 120 min while the default
   window is 30, so `gaps` legitimately holds entries far older than the domain you pass.
5. ⚠ **The chart CLAMPS points outside `[domainStartMs, domainEndMs]` rather than dropping
   them**, and neither requires nor checks that the domain contains its own points. `traceFor`
   guarantees it by windowing the ring before decimating — **so pass the domain you windowed
   with.** If you do not, an out-of-domain instant can own the leftmost span of the plot and
   report a reading taken before the labelled window (Q2 F9's deferred half, owner: step 10).

**The table view's shape**, since step 10 renders it: one `<table>` **per plot** (never one
merged table — two units in adjacent cells is a dual y-axis in tabular form), a `<caption>`
naming the series, `<th scope="col">` per series, `<th scope="row">` for each row's time, a gap
row spanning every column, and a per-plot *"no readings in the selected window"* row when a plot
has samples for nothing. ⚠ **It has no height bound — see §0.2's Q2-S2 before you toggle it.**

---

## 3.6 ⚠ NEW — the props contract 10b writes against (10a)

**It is a real exported type**, not a paragraph: `components/panel-props.ts`. That distinction is
the whole finding behind this section (10a adversarial F16) — the contract used to exist only in a
build document, `PanelPlaceholder` took `{ title }` alone, and `GridProps`'s nine slots are
`ReactNode`, which **any** element satisfies. Nine independently-written panels could each have
invented a different prop name and shape, and every one would have typechecked.

```ts
// components/panel-props.ts
export type PanelId =
  | 'gpu0' | 'gpu1' | 'cpu' | 'memory' | 'cooling'
  | 'safety' | 'storage-and-network' | 'serving' | 'session-event-log';

export interface PanelProps {
  readonly state: RuntimeState;   // the FULL, non-null state
  readonly nowMs: number;         // this tick's wall clock, from app/use-now-tick.ts
  readonly panelId: PanelId;      // the SVG-id namespace (2.5d / L4)
}
```

**What 10b does:** replace one `<PanelPlaceholder title="…" {...props} />` at a time in
`app/dashboard-shell.tsx` with `<GpuPanel {...props} index={0} />`. The grid wiring, the CSS
classes and the slot names do not change. A panel that invents its own prop names now fails `tsc`.

**Five rules that bind on top of the type**, each already paid for:

1. **`state` is the FULL `RuntimeState`, deliberately.** Computing a panel's slice IS its body's
   domain logic — the GPU↔instance join (`gpu.index === serving.instance`, correct on this
   deployment and **not derivable from the snapshot**), COOLING's channel-5 reasoning, SAFETY's
   `errorsForPanel` join. 10a handing down a pre-sliced subset would have been 10b's job done
   early against a guess.
2. **A panel never asks "has the hook mounted".** `app/dashboard-shell.tsx` holds the **only**
   `state === null` guard in the assembly (SCOPE 2.5a). Below it, a `null` FIELD is an ordinary
   "no reading" and renders `—` — the same question on poll 400 as on poll 1.
3. **A panel never sees `runtime`.** §6.2's four controls live in the header and nowhere else. A
   panel that genuinely needs one is a **new decision**, not an extension of this one.
4. **`nowMs` is the only clock.** `components/` is hook-free, and a `Date.now()` inside a render
   freezes exactly as F8 showed the shell's own would — it is only re-read when React re-renders,
   which after polling stops is never.
5. **`panelId` prefixes every SVG id the panel mints** — `` `${panelId}-temp-trace` `` (L4). 10b
   will write ONE `GpuPanel` and mount it twice; without the discriminator both instances mint the
   same gradient/clip-path ids, and a colliding SVG id surfaces as a chart painted with the wrong
   gradient — a bug that looks like a styling accident and is invisible to `tsc`.

**And the panel-body rules from §6, restated because 10b is the first phase they bite:** read
`state.displayed`, **never** `conditionsFrom`; a cell's colour is `lib/severity.ts` on the
**current** reading, never `displayed`'s debounced severity; hatch `state.gaps`, never a hole in a
series; **600 points per series**, not per chart.

### What else 10a hands 10b

| | |
|---|---|
| `components/grid.tsx` `GridProps` | Nine named slots: `gpu0` `gpu1` `cpu` `memory` `cooling` `safety` `storageAndNetwork` `serving` `sessionEventLog`. Exact spelling; the grid places by NAME, never by position |
| `CHART_SIZE` (exported from `grid.tsx`) | `sparkline: {220×44}`, `cooling: {480×210}`. The **grid's** decision (2.5e), because the grid's row heights are what a chart must fit inside. A panel wanting another size asks for a new named export here rather than picking a number |
| ⚠ the ≥1600px promotion | §6.1 changes which chart **component** a GPU card uses, not a size. **Left to 10b.** Recommended (not mandated): render both and let a `min-width: 1600px` media query in the panel's own CSS show one — so no viewport-tracking state has to cross the hook boundary |
| `PanelShell` | `title · subtitle · chip` (§6.2). ⚠ **subtitle is identity, never measurement** — it must not change on a poll unless the machine changed |
| the placeholder's title casing | `GPU 0` / `GPU 1` keep their capitals; the rest are lower case (`cpu`, `cooling`, `storage & network`, `session event log`) — `PanelShell`'s documented reading of §6.2's self-contradictory prose |
| ⚠ `unknownStanding` | **Decision recorded, not implemented (D3).** Keep the field; SAFETY renders each entry as its own row worded as a configuration defect (``unknown `STANDING` entry: `<id>` ``), **not** counted in §9's dot/count (O12), but visually distinct — silence is not acceptable for a mechanism whose whole job is suppressing alarms |
| ⚠ the banner's stale wording | `last read 6:12 ago`, coloured `--status-watch` not `--status-alarm`. **Done in 10b** — `components/panels/condition-lookup.ts`, and since 10b's reconciliation the two copies are held together by a **source-text guard** (`condition-lookup.test.ts`) rather than a doc comment: the adversarial reworded one side and the whole suite stayed green at 2483/2483 with the banner and the rows saying different things. Spec question S-B is still the owner's |
| ⚠ a stale row's VALUE | §6.5, in bold: *"A stale condition shows its LAST VALUE, unchanged — not an em dash."* `condition-lookup.ts`'s `staleValueOr` supplies it, on the four rows that can structurally go stale. Before 10b's reconciliation the banner rendered `4,308 RPM` and the row rendered `—` for one condition in one frame |
| ⚠ a stale row's two NOTES | The stale age and the `errors[]` explanation are two facts and `note={age ?? message}` dropped the second exactly when a source died. `StatusRow` carries `note` (watch-toned age) **and** `detail` (muted explanation) |

---

## 4. Obligations, with owning steps

### Closed by step 8

| # | What it was | How it closed |
|---|---|---|
| **O5** | Step 8 holds the "already logged" state for a standing condition | `loggedStanding` in `events.ts`. ⚠ It is **not reset** when `STANDING` changes mid-session: it belongs to the session, not the configuration (S52) |
| **O10** | No `as TelemetrySnapshot` on a `fetch` response | `wire.ts` validates every field. A ⚠ type test proves the cast is impossible |
| **O11** | `conditionsFrom(snapshot)` is ONE function serving the log and the banner | It is — and §3.1's warning is the other half of it |
| **step 8's own timer guard** | §5.3 required one | `lib/client/guardrails.test.ts`: a text guard, a behavioural guard, and a runtime globals guard, and they see different things |

### Still open

⚠ **Re-checked again by 10b's reconciliation, 2026-09-08 — the eighth reading.** **O12, O13 and
O3's rule are now CLOSED by 10b** and marked below; **O14 is still open and still has not
arisen**, re-verified by grep (`lib/format.ts` has no `parts` variant; no panel splits a
formatted string). O1 is closed for the panels: every cell colour in `components/panels/` is a
`lib/severity.ts` call on the current reading, and `state.displayed` is read only by
`condition-lookup.ts` for staleness. O20–O22 were **not** re-checked — they are step 11's.

⚠ **The seventh reading, by 10a's reconciliation, 2026-09-08, said:**
This time the staleness would have been in the *other* direction if left alone: **D2 and D6 were
open and are now closed**, and O2's structural half was **violated in code while listed here as
merely owed** (`aggregateStatus` took no `severity`, so the dot and the words were two reductions
and disagreed — 10a F5). An obligation listed as "owed to step N" is not evidence that step N has
not already half-done it wrongly. **Re-read the code each row names.**

⚠ Rows below marked *(not re-checked)* were copied forward by 10a because nothing in 10a's scope
touches them — steps 11 and 12 must re-verify their own.

| # | One line | Owner |
|---|---|---|
| **O1** | `Condition.severity` is the **confirmed** band, never a raw per-poll severity. Cell colour is **not** downstream of a condition | **steps 9, 10** |
| ~~**O2**~~ | **Closed by 10a for the header, 2026-09-08.** `aggregateStatus(mode, alarms, severity)` takes the same `severity` the dot is coloured with, so they cannot disagree; the count is `bannerConditions(displayed).length`, the same filter the banner uses, so the header and the banner cannot disagree either; the count is omitted at zero in **every** mode. ⚠ It was **open as a defect, not merely as an obligation** — the first build split them and rendered `● all healthy` beside a grey "no band" dot. **A panel chip is still 10b's** to get right (O1) | closed for the header |
| ~~**O3**~~ | **Satisfied structurally.** Panels read `state.displayed` — `observePoll`'s already-deduplicated output — and 10a's banner reduction is built on `bannerConditions`, not on `conditionsFrom`. ⚠ Still live as a **rule** for 10b: a panel that reaches for `conditionsFrom` re-opens it | rule, for 10b |
| ~~**O4**~~ | **Satisfied.** `sinceMs` is consumed as the confirmed band's first observation (`lib/client/banner.ts`, verified against `lib/conditions.ts`'s doc) and rendered as `since HH:MM:SS`. ⚠ See spec question **S-C**: it carries no date, which is a separate open question | closed |
| ~~**O12**~~ | **Closed by 10b.** Every "no severity" case is `severity={null}` (the explicit no-band chip) or an omitted prop (no chip at all); no panel falls back to `'normal'`. SAFETY's `unknownStanding` rows render with `severity={null}` and are kept out of that panel's own head chip. Backed by `10b-SP3`, `10b-SE2`, `10b-SR2`. ⚠ **The open residue is a question, not an obligation: 10b-S-F** — may a panel HEAD read `normal` while one of its own readings is `—`? §8 | closed; **10b-S-F is the owner's** |
| ~~**O13**~~ | **Closed by 10b.** COOLING's derived-mode row carries no `severity` prop at all, so `EC auto`/`unavailable` render as identity text beside the banded reading. Backed by `10b-CO1` | closed |
| **O14** | Formatters return unit-inclusive strings; ask for a `parts` variant rather than splitting on whitespace | ⚠ **was step 9, then step 10, then 10b — now 10c.** ⚠ Re-checked 2026-09-08 by 10b's reconciliation: no panel splits a formatter's output (`grep` for `.split(` over `components/panels/` is empty) and `lib/format.ts` still has no `parts` variant, so **the ask still has not arisen** even now that headline figures render. Two related shapes are recorded rather than acted on: MEMORY/STORAGE compose a GiB pair from two whole `formatGiB` calls, and SERVING composes one row value from four whole formatter outputs. Both concatenate whole unit-bearing strings, which O14 permits; neither splits one. **10b-F14a** — that SERVING row reads `:— · — · ctx — · health —` for an identity-only instance — is a copy nit for the owner, not an O14 violation. Original note follows. Step 9 and Q2 both closed without needing it: `components/` never splits a formatted string, because the chart primitives take a caller-supplied formatter and print its output whole. Step 10 is the first phase to render a headline figure and its unit at different sizes, which is where the ask actually arises. **`lib/format.ts` has no `parts` variant today** (checked 2026-09-08) — if you need one, ask for it; do not split on whitespace |
| ~~O19~~ | **Closed 2026-09-07.** It was a **deletion, not a rename**: `GiB` already existed for RAM and swap, so `GB`, `gb()` and `formatGB` were removed and disk moved onto `GiB`. ⚠ **`Filesystem.usedGB`/`totalGB` were WIRE names**, so this was a §4 contract change — server and client moved together | closed |
| **O20** | ⚠ `dashboard.sh set-password` must emit `scrypt.<log2N>.<r>.<p>.<salt>.<key>` — §4.1 | **step 11** *(not re-checked)* |
| **O21** | ⚠ `SESSION_SECRET` must be written unquoted — §4.1 | **step 11** *(not re-checked)* |
| **O22** | ⚠ **One process, one module instance.** A **security** obligation — §4.1 | **steps 11, 12** *(not re-checked)* |
| ~~O23~~ | **Closed 2026-09-07** — the hasher moved to `scripts/hash-password.py` on the host. See §4.1 for what it cost and how that is paid | closed |

O6–O9, O15–O18 are closed (steps 3–6).

### ⚠ Step 8's DEFER list, verbatim, with owners

| # | What | Owner |
|---|---|---|
| **D1** | **S40.** §6.4's event log gains a third feed — state fields with a closed vocabulary and no §6.3 band (`ch5Mode`). Spec clarification now; code later | **10b** — SESSION EVENT LOG's body |
| ~~**D2**~~ | **CLOSED by 10a.** `app/use-now-tick.ts` — a plain `setInterval`, importing nothing from any store. ⚠ **And the hook alone was not enough:** deleting it and reading `Date.now()` at render shipped green until `app/dashboard-shell.test.tsx` asserted the age advances with the state object **referentially unchanged**. A store-driven tick looks perfect in a fast-cadence fixture and freezes at the exact moment the indicator exists for | closed |
| **D3** | `unknownStanding` is rendered, or removed from `RuntimeState` | **10b.** ⚠ **The decision is already made** — keep the field, render it in SAFETY. §3.6's table has the wording and the O12 caveat. Only the code is owed |
| ~~**D4**~~ | ~~`errorsForPanel(snapshot, panel)`~~ — **closed 2026-09-07**, `lib/client/observations.ts:350`. ⚠ Carried here as open for step 9 until Q2 checked the tree | closed |
| ~~**D5**~~ | ~~`traceFor(state, pick)`~~ — **closed 2026-09-07**, `lib/client/series.ts:201`. Same staleness | closed |
| ~~**D6**~~ | **CLOSED by 10a.** `jsdom@30.0.1` (devDependency), `lib/client/use-telemetry.test.tsx` (unmount calls `stop()`, exactly once) + `.ssr.test.tsx` (no `window` → `{state: null, runtime: null}`, constructing nothing). **Invariant 6's cost was verified, not asserted**: `next build` was run and `.next/standalone` contains no jsdom — the tracer excludes it because only test files import it. ⚠ **Step 11 must re-check this once its Dockerfile exists** — a build-stage/runtime-stage split could still copy the wrong thing. ⚠ jsdom still cannot see `:hover`, `position: sticky`, `matchMedia` or layout — see §9's browser item | closed |
| **D7** | ⚠ **NARROWED 2026-09-07, not closed.** ~~S19~~ is settled in `SPEC.md` (line 1327: *"the message text carries it and the RENDERING does not"*). ~~S30~~ is settled (line 780: *"Tone is `warn`, not `error`"*). **S11/G5's collector half is settled** (line 1208 — `collectCooling` files the entry when `pwm5` is in the listing and `fan5_input` is not). What is left is **S11/G5's panel-rendering residue**: what a panel does with an em dash whose neighbour is not coloured | **step 10** |
| **D8** | The `STANDING` env plumbing, and its place on §4.1's silent-failure list | **step 11**, verified **step 12** |
| — | ~~The red-test ledger retrofit for step 3's harness~~ — **done during step 8**, confirmed by Q1's build phase and re-run clean by its reconciliation (72 mutations, 24 ⚠ marks, exit 0). ⚠ It was carried as open here, in `ANCHOR.md` §7 and in `WORK-ITEMS.md` §2 (A6) long after it was finished; all three are corrected | closed |
| — | ~~Q1 — the ⚠-scanner back-port~~ — **closed 2026-09-07.** All eight harnesses, 771 mutations, 689 marks. §0.1 | closed |
| **Q1-F4** | Nothing asserts a ⚠-bearing test file is in some `LEDGER_FILES`. Zero live loss today; both orphan files named in §0.1 | ⚠ **10c.** 10a is the step that added the ninth harness, so the union it was waiting on has now actually changed — and 10a's own ledger files were added by hand, which is exactly the step a cross-harness runner would check. Deferred to 10c with F4-browser and F17 because 10c is the loop that owns cross-harness work |
| **Q2-F9** | The chart CLAMPS out-of-domain points rather than dropping them, and does not check that the domain it is given contains them. `traceFor` guarantees it; the component does not. The **fix is not obviously "filter"** — dropping an out-of-domain instant's hover column leaves a visible pegged mark whose tooltip names a different instant, so it is a clamp-vs-drop rendering decision, not a one-line guard | **10b** — untouched by 10a, which mounts no chart |
| **Q2-F8** | `Sparkline` renders its `data-empty` state for an all-null window and so drops its hover layer entirely, while `StackedTimeSeriesChart` keeps one em-dash zone per instant. Q2 **rejected** changing it — the sparkline has no axis, so its zones would float over a blank box, and its table view carries the em-dash rows — but the asymmetry is written down here so step 10 can revisit it if a real card needs it | step 10, only if needed |
| **Q2-F13** | The table's `<tr key={tMs}>` depends on two upstream guards holding: §6.7 keys the ring on `ts` and drops repeats, and `decimateSeries` guards `secondIndex !== firstIndex`. Reachability is nil today and a composite key would be **unfalsifiable** (`renderToStaticMarkup` cannot observe a React key). Recorded so a change to either guard has a written note | whoever changes either guard |
| **10a-F4** | ⚠ **Nothing in the pipeline runs a browser**, and the one manual pass is not repeatable. §9 | **10c** |
| **10a-F12** | The banner's "since" carries no date — spec question **S-C**, §8 | **owner, then whoever renders it** |
| ~~**10a-F17**~~ | ✅ **CLOSED `3c37107`** — `pnpm verify` is deterministic. §0.3 | — |
| — | **A commit point** — `71a2f7d` was taken before step 9. The next is the owner's call | **owner** |

### 4.1 ⚠ The three step-11 obligations that fail **silently**, stated in full

⚠ **All four (O20, O21, O22, D8) are now BUILT and measured — step 11, 2026-09-10.** Keep reading
this section: it is why they exist and what each costs, and none of that changed. What changed is
that `dashboard.sh check` detects each of them on the box, `packaging.test.ts` holds the bash judge
equal to the TypeScript over a fixture table, **and — new in the reconciliation — the ROWS that
call those judges are themselves measured refusing.** §0.13's rule is the one to carry: a
cross-check is only worth the call site it is wired into.

**O20 — the hash format.** The server verifies with **scrypt**, in exactly this encoding:

```
scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>      six dot-separated fields over [A-Za-z0-9._-]
```

`parseScryptHash` returns `null` for anything else — **including a perfectly correct argon2id
hash**. And `null` is not an error: it is a clean, empty **401** on every login attempt, with
**nothing logged anywhere** (§5 logs nothing about authentication, deliberately). The symptom is
*a dashboard that will not open and will not say why*. **Use `hashPassword()` from
`lib/auth/scrypt.ts`; do not reimplement the encoder.**

**O21 — the env file's grammar is Docker's, and it does not strip quotes.** `--env-file` splits
on the **first** `=`, takes the rest verbatim, expands nothing, and **keeps quotes**. So
`SESSION_SECRET="…32 chars…"` becomes a 34-character secret with two quote characters baked in.
It **passes** the 32-character floor, produces a working dashboard, and every session dies the
moment anyone rewrites the file without quotes. Every value must be single-line, **unquoted**,
with no surrounding whitespace, and must avoid `$`.

**O22 — "one process, one cache" is now security and availability, not performance.**

| object | built at | what a second instance costs |
|---|---|---|
| `TelemetrySource` | `lib/telemetry/handler.ts` load | a second 2 s cache, a doubled `nvidia-smi` fork rate — **performance** |
| `productionRevocations` | `lib/auth/revocations.ts` load | **`DELETE` stops working** for requests landing on the other instance — a silent security regression |
| `productionRateLimiter` | `lib/auth/rate-limit.ts` load | §5's **global** limit becomes N× looser, and the KDF queue is no longer bounded |

Nothing in the suite can see any of this, because the suite runs one process by construction.
This is the shape of the ufw incident in the repo's own `CLAUDE.md` (`is-active` green on a
disabled firewall). **Step 11 must assert one process; step 12 must verify it on the box.**

### ~~O23~~ — closed 2026-09-07 by moving the hasher to the host

**It was:** the box has **no Node** (measured), so `dashboard.sh set-password` had to run
`hashPassword()` inside the image — which forced `set-password` to happen after `build`, and
which would probably have failed anyway, because `output: 'standalone'` traces only what the app
imports and **`hashPassword` is imported by nothing**.

**It is now:** `scripts/hash-password.py`, run on the host with the password on **stdin**. The
ordering constraint and the tracing dependency are both gone.

⚠ **The cost, and it is the one thing to keep an eye on:** that is a **second producer of a
format whose only failure mode is a silent 401**, which is on the do-not-copy list for a reason
— this project shipped it once when two base64url decoders diverged. **It is paid for by
measurement, not by a comment.** `lib/auth/hash-password-script.test.ts` runs the real file and
asserts the server's own `verifyPassword` accepts what it wrote, reads the parameters back out
of the encoded form (a weaker `logN` parses, verifies, and is simply wrong), and pins §5.1's
policy on both sides of each boundary. **Nine mutations back it — `Y1`–`Y9` in step 7's
harness.** The two implementations share six constants and nothing in either language holds them
equal; that test does. **If `scripts/hash-password.py` is ever edited, it is the thing that must
stay green.**

⚠ **`python3` is now a hard requirement of the test suite**, deliberately un-skipped: a skipped
test is the inert test the ledger exists to catch, and a host without python3 cannot deploy this
anyway.

⚠ **D8 belongs on this list too.** With `STANDING` absent or misspelled in
`/etc/ai-dashboard.env`, nothing is suppressed and the banner is nailed open by a condition the
operator has already accepted — with no error anywhere. `dashboard.sh check` should report a
`STANDING` entry that matches no condition id or kind; the client already computes exactly that
list as `state.unknownStanding` (D3).

---

## 5. ⚠ The four structural rules — inherited by steps 9–12

They catch four different things and none subsumes another.

### 5.1 Fixture symmetry — catches a boundary tested from one side

> **Every boundary guard needs a fixture on both sides of its boundary.** For any `x !== N`,
> `x < N` or `x > N` in a parser, the fixture set carries one case below and one above. And a
> regression that mutates a comparison **must not anchor on the comparison** — anchor on the
> surrounding block, or ship two mutations per guard.

It is a rule rather than a test because **the harness cannot supply it.** Step 3's `nvidia-smi`
column guard was mutated by a regression anchored on the literal `if (cells.length !== …) {`.
That proves *a guard exists there*; it can never prove the guard is an **equality**. Weakening
`!==` to `<` passed **all 807 tests and all 51 mutations**, and fabricated a thermal throttle
alarm on a card at 38 °C.

⚠ **Apply it with judgement. The test is whether the two sides differ AT A PANEL.** Step 9's
boundaries are rendering ones: the 600-point decimation threshold (`MAX_RENDERED_POINTS`), the
window bounds, and every `null`/`0` pair invariant 1 governs.

### 5.2 The red-test ledger — catches a test that cannot fail

> Every ⚠-marked test must appear in at least one mutation's RED set.

Copy the block verbatim from **any** harness — `LEDGER_FILES` is the only line that should
change.

⚠ **CORRECTED 2026-09-10 by 10g's reconciliation: the md5 this paragraph used to give is stale and
was uncheckable.** It said *"byte-identical in all eight, md5 `d9bb8cfeae1ba6dbc9a87ceac24baaf3`
over the span from the `F1` comment through `red_test_lines`"*. There are **nine** harnesses now,
and the block's surrounding COMMENT PROSE exists in three variants (steps 2–8 share one, step 9
carries the Q1-era original, step 10 a condensed rewrite) — so no span containing those comments
hashes the same in any two groups, and no span was found that hashes to `d9bb…` at all. **The
executable code IS identical in all nine, which is what the rule is about.** Check that instead,
which takes one command and cannot go stale the way a hash of prose does:

```python
python3 - <<'EOF'
import ast, hashlib, pathlib
WANT = {"UNMATCHABLE", "marked_tests", "red_test_lines", "_skip_balanced", "_code_only",
        "CALL", "FIRST_STRING", "CANDIDATE"}
def strip_docstrings(node):
    for n in ast.walk(node):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Module)):
            if (n.body and isinstance(n.body[0], ast.Expr)
                    and isinstance(n.body[0].value, ast.Constant)
                    and isinstance(n.body[0].value.value, str)):
                n.body.pop(0)
    return node
for p in sorted(pathlib.Path('pipeline/steps').glob('*/regressions.py')):
    src = [ast.dump(strip_docstrings(n)) for n in ast.parse(p.read_text()).body
           if getattr(n, 'name', None) in WANT
           or (isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') in WANT)]
    print(hashlib.md5('\n'.join(src).encode()).hexdigest(), len(src), p.parent.name)
EOF
```

All nine must print **eight** symbols and the same digest — `3c8de25c7136209b2a89526f649b381f` on
2026-09-10, and unlike the old md5 this one is re-derivable in one command whenever it goes stale.
⚠ Docstrings are stripped deliberately: they are part of the AST and they legitimately differ
between harnesses (each records its own history). The rule is about the CODE. A stale copy is a silently smaller checked set, which is the
exact failure this rule exists to prevent. Rules that come with it:

1. **A ledger failure is not "add a mutation until it goes green".** The first hypothesis is
   that the test is **inert** and needs a body matching its name, or a rename to what it
   actually checks. The second is that the property has no plausible wrong implementation, in
   which case **drop the ⚠ rather than the standard** — and record it in the harness docstring.
2. **It cannot catch a test that goes red for the WRONG reason**, and that half is irreducible.
   Keep reading each test against its own name. **Every step so far has shipped at least one
   name that over-claimed its body.**
3. ⚠ **A mutation whose RED set depends on a value the test drew is a *probabilistic*
   mutation, and the harness cannot tell it from a sound one.** The defence is one extra
   question while reading: *would this test be red for **every** input, or only for most?*
4. **A `types`-kind mutation contributes NO red-test lines**, so it can never cover a ⚠ test.
   Ship a second mutation whose check is the vitest file.
5. **`test.each` names are matched by the prefix before the first `%`.** Put the placeholder
   later in the sentence, and do not give two `test.each` blocks the same prefix.
   ⚠ **Both halves of that had been violated and neither was detectable.** A prefix of `⚠` alone
   matches every ⚠ FAIL line, so the mark scores covered without any mutation touching it — one
   was in that state since it was written (§0.1 rule 2). And two ⚠ names in step 5's ledger were
   **character-identical** (`lib/collectors/http.test.ts` and `lib/collectors/io.test.ts`,
   `⚠ a timeout of %s …`), so one mutation reddening either scored **both** covered and the other
   could have gone inert in silence. Both are renamed to name their seam. Q1 swept all 689 marks
   against every FAIL line their harness can emit: **that was the only live collision, and there
   are now zero.** A second, inert instance exists and is recorded — `⚠ the route declares
   dynamic = force-dynamic` is duplicated between `app/api/session/route.test.ts` (step 7) and
   `app/api/telemetry/route.test.ts` (step 6) — harmless only because the two files sit in
   disjoint check universes, and live the moment either harness's `checks` grows.
   ⚠ **The `%` split applies only to `.each` calls.** It used to run on every name, so a literal
   `%` in a plain test name truncated its prefix for no reason.
   ⚠⚠ **AND IT HAPPENED AGAIN — 10g, 2026-09-10, and this time the harness now REFUSES it.** Three
   ⚠ `test.each` names carried a key under 12 characters; one was the single character `⚠`, a
   substring of all 279 ⚠ FAIL lines step 10 can emit, so 10g's own `… N more` acceptance test was
   certified by *any* mutation anywhere in the harness. All three were 10g's. The `!!! … test name
   is unmatchably short` warning had been printing for each of them on every run, and **both** the
   build and the test phase reported *"every ⚠ mark reddened"* off runs that printed it. So the
   warning is now a **failure**: `marked_tests()` collects the keys in a module-level
   `UNMATCHABLE`, and `main()` prints them and **returns 1** before the ledger's verdict. Identical
   text in all nine harnesses. **Measured across all nine: 1064 ⚠ marks, exactly three short, now
   zero.**
   ⚠ **The cross-FILE case is still open and is `10g-Q4`.** Two ⚠ names that are
   character-identical in DIFFERENT files share one key, so a mutation reddening either scores
   both. Seven such families exist (five panel test files share one name; three share another;
   five two-file pairs across the chart primitives), all pre-dating 10g. And a `test.each` over a
   FILE LIST cannot have per-file accounting at all under a prefix-matching ledger — `10g-Q3`.
8. ⚠ **A ⚠ RENAME IS A LEDGER CHANGE. Re-run the owning harness.** New in Q1, 2026-09-07, and
   the only rule here found by a rename rather than by a mutation. Four ⚠ names were reworded to
   move a `%s` placeholder later; one harness was re-run; the rename that was not re-validated
   was hiding an **inert mark** — `wire.ts`'s `calendarMatches` round-trip had never had a
   mutation, and step 8's harness docstring already recorded half the story (F13's guard silently
   voided `W4`'s coverage, `W4`'s side was fixed, the new guard's was not). `W21` backs it now.
   The name is what the ledger matches on; editing it is editing the check.
9. ⚠ **Nothing asserts that a ⚠-bearing test file is in some `LEDGER_FILES`.** 65 test files, 63
   are; `lib/throttle.test.ts` and `lib/contract.test.ts` are not and carry 0 marks. Deferred to
   step 10 with reasons — §0.1.
6. **Ledger ownership follows the file, not the step.**
7. ⚠ **A ⚠ mark the ledger cannot back is usually a MISSING FIXTURE, not a bad mark.** Step 8's
   reconciliation had six, and every one turned out to be a real hole:

   | inert mark | what was actually missing |
   |---|---|
   | `⚠ a second reason keeps it open after the first goes away` · `⚠ pause → hide → resume leaves the gap open` | a mutation dropping the **`hidden`** arm of `anyGapReason`. The one that existed dropped `paused`/`failed`, which every fixture reaching those tests was immune to |
   | `⚠ no gap is opened before the first accepted sample` (runtime) | the fixture started **already hidden**, so `syncHidden` returned early and `openGap` was never called at all. A **failed** first poll is the path that reaches it |
   | `⚠ the age counts from the server's ts, and a repeat does not refresh it` | a mutation that **re-stamps on arrival** — the exact thing this file's first warning forbids |
   | `⚠ the crossing and the recovery, and nothing in between` | a mutation dropping `observeStaleness`'s early-out |
   | `⚠ a stale condition does not re-log its band on every poll` | **the most valuable of the six.** For a continuous metric the guard is invisible: the frozen band always equals the logged one, so the `previousBand === band` early-out defends it a second time. It is load-bearing only for a **value-band** condition — a unit that goes `active → failed` and becomes unreadable five seconds into its ten-second run carries a pending value across the outage, and an unguarded loop confirms it on the strength of time nobody sampled. Every fixture in that file used `gpu_temp` |

10. ⚠ **NEVER write `\'` inside a single-quoted `⚠` test name — use double quotes.** Added by
    10b's reconciliation, 2026-09-08, which is `10b-test.md` §1's own recommendation finally
    taken. The ⚠-scanner's `FIRST_STRING` regex captures the string content **including the
    backslash**, while Vitest's printed name (and therefore the `FAIL` line the ledger unions
    against) has it stripped — so the mark can never match and is reported **uncovered on every
    run, whether or not a mutation reddens it**. It is a *loud* failure (the harness exits 1 and
    names the mark), not a false green, so it cannot hide a gap — but it cost a harness run
    during 10b's build **and another during its reconciliation**, both times on freshly written
    names. Three more instances were created and fixed on 2026-09-08. `10b-test.md` §1 scanned
    all 844 marks across steps 2–10 and found zero live cases; this is about the next one written.

11. ⚠ **Mutation ids carry their creating step's id as a prefix — `07-R3`, `Q1-SC1`.** Added
    2026-09-08 (Q3), at the owner's instruction: the bare id namespace collided with the
    work-item/gap namespace (`S11`/`G5` were each simultaneously a step-7 mutation id and half
    of the open `S11/G5` work item; `S12` collided too). The prefix names the step that
    **created** the mutation, not the harness it currently lives in — four mutations (`SC1`,
    `K8`, `W19` in `07-auth-login/regressions.py`; `W21` in `08-client-runtime/regressions.py`)
    were created by work item Q1 and take `Q1-`, not their host step's number, because
    provenance never changes even though a mutation could in principle move. The change is
    textual only, confined to `entry[0]`'s leading token: `eid = entry[0].split()[0]` is still
    the whole parsing mechanism, and the ledger matches ⚠ *test names*, not mutation ids, so no
    covered-set moved. **Historical step notes (`build.md`, `review.md`, `adversarial.md`,
    `reconciliation.md`) keep bare ids** — their directory already supplies the missing prefix,
    and a blind rename across the docs would have corrupted the record, since `S11`, `G5`,
    `S12` and `D1` appear there as both mutation ids and work-item/gap ids with no textual rule
    to tell the two apart.

### 5.3 Source-text guardrails — catches a call that should exist and does not

`lib/guardrails.test.ts` asserts, over the source text: under **`lib/collectors/`,
`lib/telemetry/`, `lib/auth/`, `app/api/` and `proxy.ts`**, every `setTimeout` delay is a
`boundedTimeoutMs(…)` result (`deadline.ts` is the single exemption); nothing schedules
`setInterval`/`setImmediate`/`queueMicrotask`; `boundedTimeoutMs` is defined **exactly once**;
the assembler shares no budget across collectors; and neither `pwm5` projection calls the
other. It also asserts `tsconfig`'s flags, `verify`'s exact text, no `next/image` import, and
no raw control byte in any source file.

Four practical notes:

1. **Blank comments before scanning** (`codeOnly()`), and extract arguments **paren-balanced**
   (`lastArgumentOf()`), not by regex. ⚠ **`codeOnly` blanks comments but KEEPS string
   contents**, so a literal `'fetch'` inside a string is still visible to a text guard — and
   `'fet' + 'ch'` is not. Step 8's `U39` exists to demonstrate exactly that.
2. **A failure means a new unvalidated bound was added, not that the rule needs loosening.**
3. **Enumerate inputs by walking the tree, never by listing files.** A guard over a hard-coded
   file list is defeated by *adding a file* — measured in step 6, where a new module containing
   a literal `setInterval(` passed **71 of 71**. Use `sourceFiles()` / `serverSideFiles()`.
4. **A text guard is sound only over a vocabulary that cannot be aliased.** A *module-local*
   name is guardable; a **global** (`setInterval`, `fetch`, `require`) is **not guardable by
   text at all**. That needs a **behavioural** test and a **runtime** one, **both**, because
   neither sees what the other sees.

#### ⚠ NEW — 10c-2's four `lib/*.test.ts` guards, and what each is blind to

Four more source-text guards live beside `guardrails.test.ts`, all walking the tree (never a
file list), all comment-blind via `codeOnly`, all in **step 10's** `LEDGER_FILES` with one
`10c-`-prefixed mutation apiece:

| file | rule | ⚠ blind to |
|---|---|---|
| `tocontain-scope.test.ts` | in `components/panels/*.test.tsx` that import `PanelShell`, no whole-document `toContain` of a bare `data-severity="…"` or a bare em dash | a bare **WORD** (`'paused'`) — two of the four founding failures, excluded by scope AND vocabulary; `app/dashboard-shell.tsx`; an aliased or helper-bound render subject |
| `cross-harness-ledger.test.ts` | every `*.test.ts(x)` not in some step's `LEDGER_FILES` carries no ⚠ mark | a ⚠ mark on a `describe` (invisible to every ledger too); a listed file whose harness never exercises it |
| `dangling-css-class.test.ts` | every `styles.X` names a class its sibling `.module.css` declares | dead CSS (out of scope by design); a `url(…)` value read as a class declaration |
| `unit-suffix.test.ts` | no `.ts`/`.tsx` under `components/`/`app/` spells a §6.6 unit around a value | `' R' + 'PM'`; a percentage as `` `${pct}%` `` (a CSS length uses the same spelling — measured, §0.7); the wrong formatter called correctly |

Two rules these cost, on top of §5.3's four:

5. **Resolve what you can, COUNT what you cannot.** `dangling-css-class` counted the
   `styles[expr]` it could not read; `tocontain-scope` dropped its unreadable arguments in
   silence — in the same loop, on the same class of input. Both now count, and both assert zero.
6. **Widen the walk before trusting the scope sentence.** Both walking guards took `.tsx` only
   while ten non-test `.ts` files sat under their roots, two of which format values.

#### ⚠ Step 8's three client guards, and the corrected claims about them

`lib/client/guardrails.test.ts` carries all three. **These are `build.md`'s three over-claims in
their corrected form, and they must never be repeated as originally written:**

| claimed in `build.md` | the truth |
|---|---|
| *"runtime — catches any spelling at all"* | It catches **any spelling of a global it wraps**. It wrapped four schedulers and `fetch` was **not** one of them, so `const go = fetch;` walked past both guards. `fetch` and `XMLHttpRequest` are now wrapped |
| *"The exemptions are `env.ts` and `fake-env.ts`, both explicit."* | There is a **third**: `use-telemetry.ts` — the hook must reach `window`. It is now named in the guard, in its table, and in an `exempt` list rather than an inline `&&`. It exempts **the one file in step 8 with no test** |
| *"check `git status` … before believing it"* | `git status` could not do this in an untracked tree. §0's manifest procedure is the check |

⚠ **The runtime globals guard voids itself under `isolate: false`.** It patches
`globalThis.setTimeout` and friends for the length of one session and asserts zero calls from a
`lib/client/` stack frame. `vitest.config.mts` sets no `pool` or `isolate`, so one file per
worker holds today — but **this run's own reporter recommends `isolate: false` on every
invocation** ("~408ms faster … reuses workers across files"), and step 11 will want it when it
starts caring about CI time. Under it another file's patch-and-restore can interleave and leave
the globals un-wrapped for part of the window: the calls would go unrecorded and the guard would
still pass. The window therefore **ends by asserting the globals are still the wrappers this
test installed**, so the configuration change turns it red rather than hollow. Same family as
"do not run a harness concurrently with `verify`": a measurement that can be silently voided
must be made to say so.

⚠ **Client code under `app/` other than `app/api/` is out of the server-side timer rule's
scope** (step 7's `/login` countdown lives there). **Step 9 does not loosen either guard.**

### 5.4 ⚠ Determinism — a reading rule

> **A test may consume entropy only for an assertion that holds for every value it could
> draw.** If the truth of an assertion depends on *which* value was drawn, the value is not
> entropy — it is a fixture, and it must be constructed in the test.

**Where it came from.** `session.test.ts` asserted that flipping the last character of a
signature invalidates it. A 32-byte HMAC is 43 base64url characters, so the last character
carries **four significant bits of six** — when the tag happened to end in `A`, the flip
produced a *different spelling of the same bytes*, which the verifier accepted. The test failed
**1 run in 16** (measured: 6.15 % over 100 000 trials), and on those runs it demonstrated the
**opposite** of its own name.

**Steps 8–10 consume clocks rather than entropy**, and the same question applies. Two
clock-shaped traps step 8 paid for:

- ⚠ **`FakeEnv`'s two fake clocks were in different years** — browser 2023, server 2026 —
  invisible until §6.2's mode became a function of `browser now − server ts`, at which point
  every fixture read `stale`. `FakeEnv.now` is now `Date.parse(tsAt(0))`: a browser and a server
  that **agree**. **A test that wants skew has to ask for it**, which is the right way round —
  and two step-8 fixtures do ask, precisely so the clock rules have something to bite on.
- ⚠ **`FakeEnv` repeats its last answer once the response queue runs dry**, and that answer
  carries a `ts` the ring already holds. A fixture that resumes polling without queueing a fresh
  snapshot therefore takes the **repeat** branch, which returns early — so an assertion written
  after it can pass under both implementations. Queue the reply *before* the event that polls.

---

## 6. ⚠ What must not leak into steps 9 and 10

**Twelve rules, from step 8's review. They are the ones a panel is most likely to undo.**

1. **A cell's colour is not `displayed`.** §6.4: a cell calls `lib/severity.ts` on the current
   reading. **Nothing debounced is a cell colour.**
2. **Do not read `conditionsFrom` in a panel.** It is un-deduped by design.
   **`state.displayed` is the panel surface.**
3. **Do not infer gaps from holes in a series.** Hatch `state.gaps`; they carry real endpoints
   and survive decimation.
4. **Do not tick the age off store changes.** Under §6.2's mode rule the store changes exactly
   once at the `live → stale` crossing — which is *worse* than never, because a store-driven
   tick will appear to work. **The tick is an independent interval** (D2).
5. **Do not render `0 alarms`, and do not render a negative age.** `formatAge` clamps; the zero
   count is omitted in the **rendering**, not in `RuntimeState`.
6. **Do not put `standing` — or anything else off the snapshot — on the server-rendered shell.**
   §5's revoked-cookie asymmetry is the standing condition under which the whole gate design
   was accepted (§3.3).
7. **Do not add a second spelling of `/api/telemetry`, `/login`, `/api/session`, or either unit
   name.** The guards walk the tree, so adding a file does not escape them.
8. **Do not "fix" a red-cell/green-dot disagreement in a panel.** It is fixed once, at the
   reduction: §9's dedupe takes the **worst** severity among colliding observations and logs a
   `conflict` line once per session. A panel that patches it locally makes two places that must
   agree.
9. **`latestSample` and the chart's last point are the same sample**, and now provably so —
   both are newest **by `ts`**. Do not re-derive it.
10. **Do not add a per-chart decimation budget.** 600 points **per series** — so §6.2's stacked
    chart draws up to 1,800 (S49; the sentence is still not in `SPEC.md`).
11. **Do not read `rawSeverity`, compare severities, or hold a band outside `lib/conditions.ts`.**
    It is the easiest thing to undo by accident in a panel.
12. **Do not treat `state === null` as missing data.** It is *before the first poll*.

### ⚠ Four places steps 9 and 10 will NOT compose without an adapter

- **(a) `conditionsFrom` is un-deduped** — rule 2 above, and the reason it is stated twice.
- **(b) There is no `ErrorSource → panel` selector.** §6.5's "an em dash always has an
  `errors[]` entry behind it" needs one, and `conditionSource` maps `ConditionKind → panel`,
  not `ErrorSource`. **Write `errorsForPanel(snapshot, panel)` once, beside `conditionSource`**
  (D4) — a second mapping of a join that already exists is second on §7's do-not-copy list.
- **(c) `samplesWithin` → `seriesFrom` → `decimateSeries` is a three-call incantation whose
  order is silently load-bearing.** Decimating before windowing spends the point budget on data
  that is not drawn and produces a chart that is **subtly wrong rather than obviously broken**.
  One `traceFor(state, pick)` closes it (D5).
- **(d) `state` is `null` until the first client render** — nine `if (state === null)` branches,
  or one wrapper written once in step 10's assembly.

⚠ **One composition fact nobody should over-read:** `patch()` compares only the keys in the
patch, and `observeEvents` returns a fresh object on every accepted poll even when nothing was
logged. So `accept()` always notifies. That is correct — a new sample *is* a change — but the
identity optimisation covers **repeats only**, not steady state. **Do not build memoisation on
the assumption that a quiet poll is free.**

### Inherited, and still true

13. **⚠ `null` is not `0`** (invariant 1) and **first-sample deltas render `—`, never `0`**.
14. **A skipped call and a failed call must not read alike** (§6.7). The distinction lives in
    the `errors[]` message text — S19 is the open question of what sentence step 9/10 writes.
15. **The client never writes to the server** (invariant 2).
16. **`app/page.tsx` must stay free of telemetry and secrets** — see §3.3.
17. **`EC auto` and `unavailable` are not severities**, and `ENODATA` from `pwm5` is **healthy**
    (invariant 3).
18. **`fanN_input` is the only trustworthy fan telemetry** (invariant 4). `pwmN_enable` and
    `fanN_target` are not in the contract and must not be added.

---

## 7. Decisions taken, so no step re-litigates them

### Contract and formatting (steps 1–2)

- **`gpus` and `serving` stay `T[] | null`, and `null` is not `[]`.**
- **`Cooling` is a three-variant discriminated union.**
- **No validation in the brand constructors.** They must stay erasable.
- **Type-level assertions live inside `test()` callbacks**, for attribution.

### Collectors (steps 3–5)

- **A wrapped or backward counter is `null`, not clamped**, and carries **no** `errors[]` entry.
- **Every non-zero `nvidia-smi` exit is `gpus: null`**, including exit 6.
- **§6.3's `fan5` absolute row is TWO-SIDED and unconditional**: `0` and `> 5100` both alarm.
- ⚠ **`-0` is a stopped fan** — the comparison is `===`, never `Object.is`. (One of the five
  unbacked ⚠ marks step 2's ledger retrofit found; now backed by `R53`.)
- **`ENODATA` from `pwm5` is EC auto and healthy**, matched on `error.code` by exact equality.
- **No dependency for D-Bus**, and **`LoadUnit` is never called** — it *loads* the unit.
- **`node:http`, not `fetch`**, and **`statvfs` uses `bfree`, not `bavail`**.
- ⚠ **`lib/throttle.ts` REQUIRES the `0x` prefix** (2026-09-07). It used to be optional, which
  made a decimal reading *fabricate an alarm*: a bare `8` parsed as `0x8`, HW slowdown. Measured
  read-only before requiring it — driver 580.173.02 emits `0x0000000000000000` on both cards.
  The trade is a lost reading (`—` plus an entry) on a hypothetical driver that omits it against
  a fabricated alarm on the real one, and §6.3's posture is that the fabricated alarm is worse.
- ⚠ **`errors[]`'s concatenation order is a decision, pinned by a test**, because `dbus` is
  filed by two collectors and §6.7's client rule reads the **last** message per source. See §3.2.
- ⚠ **A fan channel 1–4 missing from the hwmon listing files an `errors[]` entry**; channel 5
  does not, because it has a documented absent state and `pwm5Present: false` explains it. §6.3's
  *"an em dash on channels 1–4 always has an entry behind it"* is true because of this branch,
  not because the board happens to enumerate them.

### The telemetry route (step 6)

- **Four modules, not one**, each with its own failure mode and its own fake.
- **`route.ts` holds `dynamic` and the handler names and nothing else**, and each handler is an
  **explicit one-parameter wrapper** — never `export const GET = handleTelemetry`.
- **The assembler propagates a rejection rather than inventing a snapshot**, and the cache
  **evicts** a rejected entry.
- **`Cache-Control: no-store` on 200 and 401.**
- **§4's two halves ship together:** `oneAtATime` and `withHostCeiling`, composed **ceiling
  outside gate**.

### Auth and login (step 7)

- **scrypt, not argon2id** — zero dependencies, zero ABI surface. `N = 2¹⁵, r = 8, p = 1`.
- **The hash encoding is deliberately not PHC**; the alphabet is `[A-Za-z0-9._-]`.
- **One scrypt at a time, process-wide**, because `crypto.scrypt` runs on libuv's pool.
- **The rate limit is GLOBAL, with no key at all** — `X-Forwarded-For` is *meaningless* behind
  `--network host`, and one bucket bounds the KDF queue at five by construction.
- **`POST /api/session` requires `Content-Type: application/json`, checked before the limit.**
- **Every refusal is 401 with no body.** No 400.
- **The token is not a JWT**, and verification order is **signature → shape → expiry**.
- **`timingSafeEqual` with the length compared first** — it *throws* on a length mismatch.
- **One canonical base64url decoder** (`base64url.ts`).
- **No `Secure` on the cookie**, and a test pins its absence. `SameSite=Strict` carries CSRF.
- **The gate is `proxy.ts`.** A file left at `middleware.ts` **simply never runs**.
- **Nothing about authentication is logged.**

### The client runtime (step 8)

- ⚠ **`stale` is a function of the newest reading's AGE, not of the failure counter.** Failed,
  **or** age > 3 cadences (floored at 10 s), **or** a negative age. The narrow fix — count
  consecutive repeats — covers one cause; this covers four with a number the page already has.
  Measured before it: thirty polls, thirty correct answers, **nothing on screen**, mode `live`,
  and `getState()` identical by identity throughout.
- ⚠ **A gap closes when a REASON goes away, not when a SAMPLE arrives**, and the predicate is
  over **all three** reasons. `pause() → hide → resume()` keeps it open. A reading may land
  inside a gap and neither closes nor splits it — it is real data and belongs in the ring.
- ⚠ **The two clocks.** Server `ts` positions readings (ring key, window bounds, gap endpoints,
  prune horizon); the browser's clock measures the session (§6.4's hold, log times, "since").
  **The age indicator is the one place they meet, and that is its whole job.**
- ⚠ **§9's id dedupe takes the WORST severity**, not the first, and `isWorse` is expressed
  through `worstSeverity` so §6.3's ordering has **one** definition.
- ⚠ **§6.5's stale/retired split lives in `observePoll`'s `displayed`**, not in `runtime.ts`
  reducing over two lists. A condition leaves only when *retired* — its enumeration was read and
  its subject was not in it. **`gpus: null` retires nothing.**
- ⚠ **A repeated `ts` is a SUCCESSFUL poll.** The counter resets, the dot stays green, and none
  of the condition, event or gap machinery runs — but `applyMode` still runs, because a repeat
  is exactly the poll during which the age can cross into `stale`.
- **`refreshNow()` polls while paused and does NOT resume** (§6.2 is silent; recorded as a
  silence). **It is a no-op while hidden.**
- **`STANDING` rides §4's snapshot** and is read from **every** accepted sample, so an
  operator's edit to `/etc/ai-dashboard.env` lands on the next poll with no reload path invented
  for it. Not a constructor option, not a build-time constant, and **not a server-shell prop** —
  the last on **security** grounds, not ergonomics.
- **The whole arrival path is inside `poll()`'s `try`.** `reschedule()` is the last statement,
  so a throw anywhere in there would leave `inFlight` false, no timer pending and the mode still
  `live`: polling stops **silently**, the one failure §6.2's age indicator cannot describe.
- **`patch()` compares the patch's own keys**, which is what makes "a repeated `ts` changes
  nothing" observable with `===` rather than merely true in principle — `useSyncExternalStore`
  re-renders whenever `getState()` returns a different object.

### ⚠ Do NOT copy — in descending order of damage

1. **A hand-rolled bound.** Five attempted; all are fixed once, in `deadline.ts`.
2. **A second `errnoCodeOf`**, or a second canonical base64url decoder. **Never match on
   message text.**
3. **A test that names a property it does not check.** Eight steps, eight occurrences.
4. **A test whose truth depends on a value it drew** (§5.4).
5. **A placeholder `null` on a field whose `null` already means something.**
6. **Deriving one three-valued field from another.** `null` is unknown and is never the alarm.
7. **A guard over a hard-coded file list, or over a global.** §5.3 notes 3 and 4.
8. **Raw control bytes in test files.**
9. **A parser that is tested, exported and unused.** Three exist, all with stated reasons —
   `unknownStanding` is the newest and is justified **only if** D3 renders it.
10. **Per-file `pnpm vitest run <file>` as the green signal.** It skips `tsc`.
11. ⚠ **A documentation claim that names a property the code does not have.** New in step 8
    (§5.3's table) — the same species as #3, in prose, and it reached `build.md` three times.

### Fixtures — import these, do not rebuild them

From **`lib/fixtures.ts`**: `nothingReadable` (every reading failed *because the probe could not
be performed*), `everythingZero` (everything read, many readings genuinely `0` — **a dead
fan**), `ch5Manual` / `ch5EcAuto`, `pwm5NodeAbsent`, `pwm5Unreadable`, `servingInstances` /
`servingPopulated`, `servingIdentityOnly`. ⚠ There is **no "empty snapshot"**.

From **`lib/client/fake-env.ts`**: `FakeEnv`, `MemoryStorage`, `ThrowingStorage`, `atTs`,
`tsAt`, `wireBodyOf`. ⚠ See §5.4 for its two clock traps.

From **`lib/collectors/samples.ts`**: raw captured text — `CAPTURED_*`, `EMPTY`.

### Import convention

`@/` for cross-directory imports, relative within a directory. ⚠ **Three toolchains have to
agree about `@/` and they read three different files.** `tsc` and `next build` take it from
`tsconfig.json`'s `paths`; **Vitest does not read `paths` at all** and needs `resolve.alias` in
`vitest.config.mts`. Both are present, and the alias is proven by an actual `@/` import at the
top of `lib/guardrails.test.ts` — not by a text assertion.

---

## 8. Spec gaps and open owner questions — ⚠ **step 11's THREE NEW, added 2026-09-10** (all three are INSTALL-SPEC changes); 10h's six; 10g's three ruled-and-assigned are now BUILT and its four are still open; 10f's six, five RULED AND BUILT; 10e's thirteen, five RULED AND BUILT

⚠ This table has now been **stale five times** (92 % before step 5, 100 % before step 6, again
before step 7, again in step 8, and again in Q2). **Every time, in the safe direction: entries
carried as open that the spec had already answered.** Re-check every row against the spec text
before trusting it. Invariant 7 stands: if the spec is silent, **report it — do not assume**.

**Open, with owners — THIRTY rows: step 11's three (`11-Q1`…`11-Q3`, below), 10h's six, 10g's four, 10f's one still-open (`10f-Q6`;
`10f-Q1`…`Q5` were ruled by the owner and BUILT by 10g), 10e's eight still-open ones (`10e-Q4`…`Q11`
— `10e-Q1`/`Q3`/`Q12`/`Q13` were built by 10f and `10e-Q2` by 10g), Q2's two, 10a's four, 10b's
three still-open ones, and 10b-S-G's four. S11/G5's rendering residue is CLOSED.**

### ⚠ NEW — step 11's three, 2026-09-10. **Questions, not proposals** — each names what the code does today.

Raised by step 11's adversarial and reconcile phases; the full statements, with what was measured
and what was only reasoned, are in `steps/11-packaging/reconciliation.md` §1. **Nothing below was
chosen** (invariant 7), and each is a change to `INSTALL-SPEC.md`, which the reconcile phase may
not edit.

| # | Gap | What stands today | Owner |
|---|---|---|---|
| **11-Q1** | **`Restart=on-failure` makes recovery depend on the container's exit code.** `docker run` exits with the container's status, and Next's standalone server handles `SIGTERM` and exits **0** — so `docker stop ai-dashboard`, the thing an operator reaches for, leaves the unit `inactive (dead)` with `Result=success` and **systemd does not restart it**. The wall panel goes blank and stays blank. (`docker rm -f` SIGKILLs, gives 137, and does restart.) A wall-panel service whose whole point is being up is a `Restart=always` shape. Reasoned from documented behaviour, **not run** — there is no systemd here | `Restart=on-failure`, which is INSTALL-SPEC §7's own choice, and §2.5's *"a dashboard that cannot read a sensor must stay up and say so — restarting it would destroy the browser's whole session buffer to fix nothing"* is the reasoning behind it. The mitigation that exists: `check`'s `ActiveState` row FAILS on `inactive`, and that row is now measured | **owner** |
| **11-Q2** | **Both secrets end up in the container's environment.** `--env-file` is read by the client, as root, on the host — which is why 0600 root:root is right and the container never sees the *file*. But the values then live in the container's environment, where `docker inspect` shows them in plaintext to every member of the `docker` group and `/proc/1/environ` shows them to root. This repo's own rule is the counter-example: *`--api-key-file`, never `--api-key`* (`serve-llm.sh`) | INSTALL-SPEC §7's design, unchanged. Changing it means the app reading a mounted 0600 file instead of `process.env`, which is a §5.1 change as well as a §7 one | **owner** |
| **11-Q3** | **Nothing compares the RUNNING container with the unit's `docker run` line.** `cmd_unit` installs a changed file, `daemon-reload`s and reports `✓ installed` / `✓ enabled`; `systemctl start` on an already-active unit returns 0 and does nothing; so a changed mount, a changed `--env-file` or a changed log option is *installed and not in force*, and every row is green. Step 11 closed the two that cost something — the **image id** and the **GPU device request** — and added the two missing warnings (`unit` and `configure` now both say the container keeps what it was created with). The general comparison is not built: it needs Docker to write against and a stable normalisation of every flag | Two targeted rows plus two warnings. `docker inspect ai-dashboard --format '{{json .Config}}{{json .HostConfig}}'` versus the unit is the evidence that exists and is unused | **owner**, and step 12 in the meantime |

### ⚠ NEW — 10h's six, 2026-09-10. **Questions, not proposals** — each names what the code does today.

Raised by 10h's build, test, adversarial and reconcile phases; full statements with every
measurement are in `steps/10-panels-assembly/10h-reconciliation.md` §6, and the two ⚠⚠ rows are
§0.0's own open items. **Nothing below was chosen** (invariant 7).

| # | Gap | What stands today | Owner |
|---|---|---|---|
| **10h-Q1** ⚠⚠ | **The band is bounded against telemetry and NOT against the environment.** §6.1's arithmetic subtracts a constant `--band-reserve: 102px`, so the page fits only while the real band is inside it. §3.2's `hostname` — the term telemetry controls — is now truncated and measured at **101.8 of 102 with a 150-character FQDN**. What is not closed: a browser's *Minimum font size* setting is a floor on **computed** font-size that overrides an author's `px` by design. **Re-measured by 10h's reconciliation on the shipped tree, with the truncation in force**: a 16 px root gives band **105.6 of 102 at all three viewports**, m11 2 px over and m14 3 px over at 1600×1024, and SAFETY hiding **27 px** at 1280 on two graded pages — ten records fail, with no telemetry involved. No CSS in this repo can defend against it. The two closures are both rulings — bound the band's own height and let its content truncate or scroll (a §6.2/§6.4 decision about what disappears from the band), or **measure** the band into `--rows-available` (a hook `components/` may not have, and §6.1's mechanism changes from arithmetic to measurement) | `--band-reserve: 102px`, a measured constant. Measurement 15 grades the premise and prints `101.8 of 102` on every run, so it cannot be inherited silently | **owner** |
| **10h-Q3** ⚠⚠ | **Should `--band-reserve` become conditional on §6.4's banner?** 59 px is reserved unconditionally; on a page with no alarm the real band is 43 px, and the all-collectors-failed page measures **104 px of screen spare at 1600×1024 while `gpu0` sits 1.0 px from clipping**. This is where the headroom the owner asked for on 2026-09-10 already is: conditional is strictly better than shrinking the shares on **both** criteria — unchanged when a banner stands, +59 px of row budget when none does — where 0.98 buys 12–14 px of page spare by hiding 2–4 px of readings in four or five panels (§0.0) | Unconditional, deliberately: §6.1's promise is unconditional on the banner. The change is a DOM attribute and two CSS lines (`10h-build.md` §6 silence 6) **plus a deliberate edit to `10h-A2`'s new sole-declaration guard**, which is written to refuse exactly that second declaration | **owner** |
| **10h-Q2** | **A panel body scrolls on the X axis with no affordance at all.** `overflow-y: auto` computes `overflow-x` to `auto`, so all nine bodies are horizontal scrollers; the continuation fade is `background-position: bottom` only. Nothing reaches it today (a 220-char ext4-legal filename and a 4000-char alias both wrap, and `hiddenX` is 0 on every graded page) — one `white-space: nowrap` child is all that stands between here and an unreachable reading. Should a body carry an x-axis fade, or forbid `nowrap` children? | Unchanged in CSS, and the reason is checkable: `overflow-x: hidden`/`clip` both produce a box that clips horizontally and **cannot be scrolled by the user at all**, which on §6.1's pointerless wall panel is worse. The axis is **graded** instead — half of `recordNoClipping`'s failure condition on four pages, and printed on the hostile page | **owner** |
| **10h-Q4** | **`styles.test.ts`'s `BOUNDED` rule cannot express "bounded by an ancestor".** `.body`'s real bound is the slot's `max-height` one box up; what satisfies the guard is `.body { max-height: 100% }`, which is **inert in both regimes** (measured: identical slot, head and body with it set to `none`). So the guard whose point is *"`overflow-y: auto` on an unbounded box does nothing"* is satisfied here by a declaration that does nothing | Unchanged, and **not** removed — deleting it would weaken a guard a reconciliation may not weaken. The module doc now names which box holds the real bound | **owner**, then whoever next changes that guard |
| **10h-Q5** | **`formatModelName` at two more boundaries.** `/models/.` renders `.`, which reads as a rendering fault rather than a name; and the `title` still carries whatever the wire sent, bidi overrides included | Both follow §3.4 as written — *"the path's final segment"*, *"not a lookup, not a prettification"*, and *"the whole string reachable in the row's `title`"*. The zero-width and bidi cases in the **visible cell** were fixed (`10h-A10`); changing either of these is a §3.4 change | **owner** |
| **10h-Q6** | **Is 320px the right bound for the hostname?** ~35 characters at the header's 15px mono face. The measured bracket at 1280 wide: **53 characters fits** (band 101.8) and **79 wraps** (band 130.7) — roughly 480 px and 710 px of rendered text, so the threshold is between them and 320 px sits well inside. Shorter is safer against other header content growing; longer shows more of an FQDN | 320px, with both measured points recorded in `header.module.css` so the trade can be made without re-measuring | **owner** |

### ✅ BUILT BY 10h — the three the owner ruled on 2026-09-10 and assigned here

All three are implemented and measured; the rows below are kept because they carry the numbers that
justified them. See `steps/10-panels-assembly/10h-build.md`, `10h-test.md` and
`10h-reconciliation.md`. **The grid bound** is `SPEC.md` §6.1's 2026-09-10 paragraph, built as a
per-slot `max-height` from the row's share with the head pinned outside a scrolling body; **the
banner's `+N more`** is `BANNER_REST_SHOWN = 3` plus a counted remainder that reconciles
arithmetically at every count up to 529; **`model` as a filename** is `formatModelName` with the raw
string kept in both call sites' `title`.

### ⚠⚠ RULED BY THE OWNER 2026-09-10 AND ASSIGNED TO 10h — three rows, ⚠ ALL THREE NOW BUILT (the text below is the inheritance as 10g recorded it)

10g's reconciliation was explicitly told to record these and not to build them. They are **not
questions**: `SPEC.md` carries the owner's wording for all three, and `WORK-ITEMS.md` §11 carries
the rows. What is here is the **measured inheritance**, so 10h does not re-derive it. Full
statements with every number: `steps/10-panels-assembly/10g-adversarial.md` A1/A2/A6 and
`steps/10-panels-assembly/10g-reconciliation.md` §5.

| # | Ruling | The measurement behind it | Owner |
|---|---|---|---|
| **10g-A1** ⚠⚠ **RULED 2026-09-10: THE GRID ITSELF IS BOUNDED. `SPEC.md` §6.1. → 10h** | Every panel gets a max-height derived from its grid row and its body scrolls inside it; **the head never scrolls away**; a scrolling panel says so with the same fade and `… N more`; the row model still governs, so the bound is per panel. **Acceptance is a browser measurement on HOSTILE telemetry, and the fixtures are part of the work.** Supersedes bounding terms one at a time | On the all-sources-explained page, which has **6 px of spare at 1600×1024**, ONE changed field breaks the fold four different ways: a notable mask `0x…24` (**−16**), §6.3's four alarm bits `0x…ec` (**−40**), a third `llama-server` instance §3.4 requires to work (**−42**, and it costs **+48 px** on SERVING, not the +20 the build predicted), a path-valued `model` (**−19 at 1280**). Together **−113 / −64 / −8**. ⚠ **Every browser fixture hard-codes `throttleReasons: '0x…04'`, which is not `notable`** (`measure-breakpoints.mjs:448`, `mocks/measure-arrangements.mjs:128`), so **no page this project has ever measured renders a throttle line** — confirmed independently by 10g's reconciliation | **10h** |
| **10g-A6** ⚠ **RULED 2026-09-10: the banner shows what fits plus `+N more`. `SPEC.md` §6.4. → 10h** | Replaces the fixed-height *scrolling* form ruled one day earlier (`10f-Q2`). The fixed height and the pinned alarm count still hold | `.rest` at 1280: client **21** / scroll **21, 48, 75, 128** at 2 / 6 / 12 / 21 conditions, with **4 items fully visible** at 6, 12 and 21 — so at 21 conditions **16 of the 20 rest items cannot be read at all**. `offsetHeight − clientHeight = 0` at every count: **no scrollbar occupies layout**, and a wall panel has no pointer and no keyboard. Two conditions never wrap; the first hidden condition appears at **six** at 1280 and at **twelve** at 1920. ⚠ The `12 → 75` is a FRESH LOAD; `measure-breakpoints.mjs` m12 measures 101 at the same count from its staged, no-reload run — the scroll height is a property of the RUN (10g-A10), and the acceptance rests on the banner HEIGHT, 58.8 in every run | **10h** |
| **10g-A1b** ⚠ **RULED 2026-09-10: `model` renders as its FILENAME. `SPEC.md` §3.4. → 10h** | The wire carries it raw, as §3.1 requires of every reading; the rendering shows the path's final segment, with the whole string in the row's `title` and the table view | `/v1/models` returns llama.cpp's `-m` argument — **the full weights path** unless `ALIAS` is set, and `ALIAS` is optional in `serve-llm.sh set-model`. Rendered raw in two unbounded places: `serving-panel.tsx`'s `inline` (**+21 px per row**) and `gpu-panel.tsx`'s `served by instance N` strip (**+17.9 px per GPU card**, strip 14.8 → 32.7) | **10h** |

### ⚠ NEW — 10g's four, 2026-09-10. **Questions, not proposals** — each names what the code does today.

Raised by 10g's build, test, adversarial and reconcile phases; full statements with the
measurements are in `steps/10-panels-assembly/10g-reconciliation.md` §1 and §3. **Nothing below
was chosen** (invariant 7).

| # | Gap | What stands today | Owner |
|---|---|---|---|
| **10g-Q1** ⚠ | **`… N more` counts ENTRIES and the reader sees LINES, so on the graded page every marker that appears is a lower bound and the wells hiding the most have no marker at all.** Measured on the live all-sources-explained page at 1280: `cpu messages` (`tight`) hides **215 px**, **0** entries fully visible, marker says `… 3 more` while four entries are unreadable; `storage & network messages` (`roomy`) hides **71 px** with **no marker**; `link messages` hides 41 px with none. §6.1 asks for the marker *"whenever `scrollHeight > clientHeight`"*, which hook-free `components/` cannot see. ⚠ **10h inherits this question unchanged**, because the owner's grid ruling puts the same affordance on a panel BODY | Exactly as ruled: `hiddenMessageCount(total, bound) = max(0, total − LINES_SHOWN[bound])`, `{ tight: 1, roomy: 3 }`, a lower bound and **never an overcount** (structural: every entry occupies at least one line). Recorded as `10g-build.md` §6 silence 1 before the adversarial found it. ⚠ **10h ANSWERED the panel-BODY half and left the well half open**: a panel body draws the fade and **no count**, because a body's children are not lines and are not comparable (COOLING's chart is 174 px and a `StatusRow` is ~19 px, and both are one child), and neither the count nor the condition `scrollHeight > clientHeight` is derivable without the hook `purity.test.ts` forbids (`10h-build.md` §1.4). The WELLS' entries-vs-lines gap is untouched and still the owner's | **owner** |
| **10g-Q2** ⚠ | **The `… N more` marker paints OPAQUELY over the line it describes.** `.more` is `position: absolute; bottom: 0; right: 2px` on an opaque `--surface-2`, so it sits over the bottom-most VISIBLE line at every scroll position — and on a `tight` well that is the only line there is. Measured at 1280: a 49 × 11 px marker overlapping **46 × 11 px** of the note, **17 %** of `cpu messages`' 275 px line. The marker MUST be out of flow (§6.1: *"the heights stay as budgeted"*), and every in-flow alternative buys legibility with page height | Unchanged, and deliberately: the owner's 2026-09-10 ruling puts the same affordance on every panel body, so the placement is 10h's to decide once rather than this loop's to decide twice. `10g-build.md` §4.2 now says "0 px **of layout**" with the measurement beside it. ⚠ **10h did NOT need to decide it**: a panel body carries the fade and no marker at all (see `10g-Q1`), so no second `.more` was placed and the question is unchanged and still the owner's | **owner** |
| **10g-Q3** | **A `test.each` over a file list cannot have per-file ledger accounting.** `styles.test.ts`'s two rules had ONE ledger key between them (A8); they now have two, but **each still stands for seven generated tests** — one per file in `cssFiles` — so a mutation reddening one file's copy discharges all seven. Under a ledger that matches a name PREFIX this is not fixable by renaming; the placeholder is the only thing that differs | Both rules have live mutations today (`10f-CS4`/`CS5` and `10f-CS6`/`10e-CS3`), so nothing is inert. What is missing is the ledger's ability to know it | **owner**, then whoever next changes the ledger mechanism |
| **10g-Q4** | **Seven families of character-identical ⚠ test names exist across DIFFERENT files** — one name, one ledger key, so a mutation reddening either copy scores both covered and one of them could go inert in silence. Measured 2026-09-10 across all nine harnesses: `⚠ with every reading null, no value cell prints a numeral` in **five** panel test files; `⚠ the toggle control renders ONLY when the caller supplies onToggleView` in **three**; and five two-file pairs — four across the two chart primitives, one across `gpu-panel.test.tsx`/`serving-panel.test.tsx`. **18 test names in seven families**, all of them pre-dating 10g (verified by `git grep` against `HEAD`) | Untouched. 10g's own eighth instance was split (`sparkline`/`stacked-time-series-chart` each name their own stylesheet now). The seven were not swept up inside this item because ~20 renames across files this loop did not otherwise touch is a ledger change with no measurement behind it — and a ⚠ rename obliges a full harness re-run (§5.2 rule 8) | **owner**, then the loop that next touches those files |

### 10f's six, 2026-09-09 — ⚠ FIVE ARE NOW RULED AND BUILT BY 10g; only `10f-Q6` is still open.

Raised by 10f's build, test, adversarial and reconcile phases; full statements with the
measurements are in `steps/10-panels-assembly/10f-reconciliation.md` §5. **Nothing below was
chosen** (invariant 7): the reconciliation deliberately did not widen a well or cap the banner,
because both are §6.1/§6.4 wording. `10f-Q1` and `10f-Q2` are the two that decide whether §6.1's
promise is currently true in the general case.

| # | Gap | What stands today | Owner |
|---|---|---|---|
| ~~**10f-Q1**~~ ✅ **RULED 2026-09-09 and BUILT BY 10g: a table view renders in the chart's own painted box. Measured after — grid 717.8 / 753.4 / 753.4 px with all five open and IDENTICAL with all five closed, every slot to 0.1 px (`measure-breakpoints.mjs` m13).** | **A chart's TABLE VIEW is bounded per component at `40vh`, and FIVE are reachable at once** (GPU 0, GPU 1, COOLING, CPU ×2), so the page's own bound is 200vh. Measured on a **healthy** page with all of them open: **+851 / +851 / +862 px**; GPU 0's alone is **+371.1** against 263.2 px of spare, reached by one click and ~21 samples. §6.2 rules the table view *"scrolls within its own container"* and §6.1 says the promise governs the PAGE, not a component — neither sentence was written with five 40vh containers in mind. Options the adversarial named: one table open at a time; a table bounded to its panel's body; or the promise conceded while a table is open | `--table-scroll-max: 40vh` in `components/tokens.css`, read by `sparkline.module.css` and `stacked-time-series-chart.module.css`. No page-level coordination — any number can be open at once. Untouched by 10f (Q2's code) | **owner** |
| ~~**10f-Q2**~~ ✅ **RULED 2026-09-09 and BUILT BY 10g: fixed-height well, the count outside it. Measured after — 58.8 px at 2 / 6 / 12 / 21 conditions at all three viewports, every condition still in the DOM (m12). ⚠ SUPERSEDED THE NEXT DAY by `10g-A6`: the scrolling form left 16 of 21 conditions unreachable, so the banner now shows what fits plus `+N more`.** | **§6.4's banner is UNBOUNDED, and it is the constant every §6.1 budget is drawn against.** Measured: **65.7 px at two alarms and at six** (identical — six chips wrap to the same two lines), 92.5 at twelve, **173.1 / 146.2 / 119.4 at twenty-one**. ⚠ It grows with its **text**, not its count, so "N alarms" is the wrong variable and the build's 90.5 / 72.7 six-alarm constant is wrong. Options: cap the rows shown (`+N more`), a fixed-height scrolling banner, or concede | `lib/client/banner.ts:88` returns `rest: mapped.slice(1)` with no cap; `AlarmBanner` renders every item; `alarm-banner.module.css` has no `max-height`. Budget up to six alarms: **197.5 / 162.0 / 218.0 px** | **owner** |
| ~~**10f-Q3**~~ ✅ **RULED 2026-09-09 and BUILT BY 10g: the throttle line is a 17 px well and `roomy` is 46 px. Measured after — the all-sources-explained page FITS at all three, spare 41 / 6 / 62. ⚠ The term that closed the 1 px was §6.4's banner losing its 7 px margin, NOT `roomy`, which buys 0 px on every graded page; and the WELL was bounded while the CAPTION was not until 10g's reconciliation fixed it (A2).** | **The page is 1 px OVER at 1600×1024** on the worst arithmetic case — every one of §3.7's eighteen sources explained while the readings stay present, with the ORDINARY two-alarm banner. Measured twice, identically (spare 34.6 / **−1.0** / 55.0). The build's own §1.4 predicted −1.1, and the measured grid growth is **+163.0** against its predicted 163.0, so this is a budget, not an estimation error. Is 1 px over acceptable, and if not, which term gives — the well heights (§6.1), the banner (§6.4), or SERVING's +37 px? | Nothing further is capped. The three graded fixtures all pass with 104–178 px to spare; this one is not among them, and it is not the all-collectors-failed page (a failed collector blanks its readings, which makes its panel shorter) | **owner** |
| ~~**10f-Q4**~~ ✅ **RULED 2026-09-09 and BUILT BY 10g: a CSS fade on all four wells and `… N more` on `PanelNotes`. ⚠ Two measured qualifications, both open as `10g-Q1`/`Q2`: the fade is PROPORTIONAL, not conditional (9/255 with nothing hidden), and the marker costs 0 px of LAYOUT while covering 46 × 11 px of the line it describes.** | **The `tight` well shows 7.7 % of CPU's four-source explanation** (18 px shown against 233 px of content), and §6.1's subject is *"the single-screen wall panel"*, where there is no pointer and no keyboard. No affordance is drawn either — measured `offsetHeight − clientHeight = 0` on every well, so nothing says the text continues. Is a one-line well the right shape, or should `tight` be two lines? | 18 px `tight` / 60 px `roomy` / 14 px on a row, each with its arithmetic recorded. Raising `roomy` by one line (+8 px) takes STORAGE past SAFETY and grows the page, so it is not free | **owner** |
| ~~**10f-Q5**~~ ✅ **RULED with Q4 and BUILT BY 10g.** | **How much of a collector's message an operator can read now depends on which panel's grid row has slack.** COOLING's single `dell-smm` message is three lines (`clientHeight 32 / scrollHeight 32`, nothing hidden); STORAGE's single `net-operstate` message is one line (`18 / 59`, 69 % hidden). Both hold exactly one message. §6.5 states no rule for that | Per-panel `bound`, exactly as the ruling permits (*"the height per panel is a builder decision measured against §2.11's budgets"*) | **owner** |
| **10f-Q6** | **`measure-breakpoints.mjs` has ZERO mutation coverage** and sits outside `pnpm verify`: it is in no harness's `LEDGER_FILES`, so `&&` → `||` in measurement 10's fixture-took precondition is green in every command this project runs. Same shape as `10e-Q9` — the grader that would see it is a browser run nothing requires | The precondition itself is sound and was proved non-vacuous by breaking the fixture (10f's test phase, §5). What is unguarded is the script's own code | **owner**, then step 11/12 |


### ⚠ NEW — 10e's thirteen, 2026-09-09. **Questions, not proposals** — each names what the code does today.

Raised by 10e's build, test, adversarial and reconcile phases; full statements with the
measurements are in `steps/10-panels-assembly/10e-reconciliation.md` §6. **Nothing below was
chosen** (invariant 7). `10e-Q1` is the one that decides whether step 10 is finished.

| # | Gap | What stands today | Owner |
|---|---|---|---|
| ~~**10e-Q1**~~ ✅ **RULED 2026-09-09 and BUILT BY 10f: unconditional; every `errors[]` block is a bounded scroll box. SPEC §6.1. Measured after: measurement 9 passes at all three viewports with 140 / 104 / 160 px spare, and the new measurement 10 (the real box's own DKMS failure) with 157 / 122 / 178. What the ruling did NOT reach is `10f-Q1`/`Q2`/`Q3` above.** | **Is §6.1's no-scroll promise conditioned on healthy telemetry, and if not, what bounds an `errors[]` block?** §6.1's acceptance sentence says *"fabricated healthy telemetry"*, and under that fixture the page fits at all three viewports with 227–284 px spare. `measure-breakpoints.mjs` measurement 9 grades an **all-collectors-failed** page and is **27 px** over at 1280 and **49 px** at 1600. §2.11 budgets **14.2 px** for a source's `errors[]` line; this box's own documented DKMS message is **152 characters** and measures **65.6 px** in a 285 px column, so it is not a dev-Mac artefact | Nothing caps `PanelNotes` or a `StatusRow`'s `detail`; the message text is the collector's own (S-H), so a long one simply wraps. If the promise is unconditional, the sub-question is **truncation, a scroll box, or a per-panel budget** | **owner**, then step 10/11 |
| ~~**10e-Q2**~~ ✅ **RULED 2026-09-09 with 10f-Q3 and BUILT BY 10g: the throttle line is a one-line well, bounded at 17 px. ⚠ The CAPTION around it was two lines (41.2 px at 1280/1600) until 10g's reconciliation measured it and fixed it in one declaration — see `10g-reconciliation.md` §2.** | **§2.11's throttle budget is measured 1.8× under at the design width.** A notable mask (`0x4` + `✕ 0x20 sw thermal slowdown`) costs **44.0 px** in the 285 px GPU column against **24.5** budgeted, and 17.0 at ≥1600; a third, unknown bit takes it to **71 px** and overflows the caption horizontally below ~245 px | The line renders only when `decodeThrottleMask(...).notable`, so the healthy page carries none of it — this is a degraded-state budget only | **owner** |
| ~~**10e-Q3**~~ ✅ **RULED 2026-09-09 and BUILT BY 10f: `Chip band={false}` — no `data-severity`, no glyph, no announced word, the same `code` pill in the same place. Both sides fixtured; `lib/throttle.ts` untouched.** | **How is `0x4` presented once ANOTHER bit makes the throttle line notable?** §6.2 says the normal power cap *"is not news and must not be styled as a warning"*. It is not styled as a warning; it is styled as a **verdict** — a green `✓` pill asserting the routine 250 W cap is healthy. §6.3 bands the metric `GPU throttle`, never a bit, and the per-reason severity is `lib/throttle.ts`'s own construction, invisible before 10e | One `Chip md code` per reason, banded by that reason's own `r.severity`. Note the tension: 10e decided in the same loop that a `normal` **`Meter`** is deliberately grey (*"colour is spent almost entirely on state"*), so the throttle caption is the one place a `normal` band is painted its status colour | **owner** |
| **10e-Q4** | **The GPU *retired*-card branch renders no `errors[]` at all.** With `gpus: []` and an `nvidia-smi` entry present the card renders `card not enumerated` and nothing else, while the `gpus: null` branch two lines below maps `errorsForPanel` into `.takeoverNote` | Byte-identical to `HEAD` — 10b's S-E residue, not 10e's. Verified by rendering both | **owner** |
| **10e-Q5** | **The GPU card prints the power pair twice** — the `Figure` (`249.8` `W` + `cap 250.0 W`) and the power `Meter`'s own head (`249.8 W / 250.0 W`): four numerals for two facts, on a density loop | The mock's form, recorded as such in `gpu-panel.tsx`. Flagged against §6.5's *"one fact, stated once"* | **owner** |
| **10e-Q6** | **A severity-bearing row announces its band twice** to a screen reader — `Chip sm`'s `sr-only` word and `Chip md`'s | Unchanged; both chips carry the word by design | **owner** |
| **10e-Q7** | **`aria-pressed` beside a label that names the NEXT action.** `header.tsx:182-184` gives `aria-pressed={paused}` *and* `aria-label={paused ? 'Resume polling' : 'Pause polling'}`, so a paused control announces *"Resume polling, toggle button, **pressed**"*. The APG's rule is that the two must not be combined. `ChartViewToggle` has the same shape | Inherited: `aria-pressed` predates 10e (the visible `▶ resume` was the name), and 10e only moved the name into the attribute | **owner** |
| **10e-Q8** | **Delete COOLING's dead fourth chan column, or keep the slot §2.2 specifies?** `ChanRowSpec.note` exists, `.chan` reserves a fourth `minmax(0, 1fr)` track, and **all four call sites pass `note: null`** — four empty spans | 10e §2.0/§2.2 specify the column as *"S-B stale age or nothing"*, and no loop has rendered a per-channel stale age yet. It costs 0 px, and `dangling-css-class.test.ts` cannot see it (the class IS referenced, just never populated) | **owner**, then the loop that renders S-B on channels 1–4 |
| **10e-Q9** | **Nothing runs the density grader.** `check-density.mjs` is the only tool that can see six one-line CSS reverts that leave the whole suite green (`.track`/`.scroll` `box-sizing`, `body { font-size: 12px }`, `.grid { gap: 9px }`, the well's fixed `height`, `.panel`'s `position`), and it is not wired into any command a later loop must run | Run by hand, twice, by two sessions; **ALL PASS**. Two of the six are now guarded by CSS-text tests (`10e-SE4`/`SE5`) and one by `styles.test.ts`'s new rule (`10e-CS2`) | **owner**, then step 11/12 |
| **10e-Q10** ⚠ | **Fix `lib/source-text.ts`'s `codeOnly` regex blind spot?** A regex literal containing an odd number of `"` leaves the comment-stripper in string mode, so comments read as live code for the rest of the file. Measured: **16 test files** currently desynchronise it (`sparkline.test.tsx` 672 lines; `tocontain-scope.test.ts`, the guard itself, 333). **Six** guards read source through it | Unfixed. The fix is that a `'`/`"` may not open a string that does not close before the next newline — small, but it changes what six guards can see, and its failures are the point. 10e balanced or `new RegExp`-wrapped every regex in the files it touched so it adds no new desync | **owner**, then the next loop touching `lib/source-text.ts` |
| **10e-Q11** | **SERVING's row severity is `worstSeverity(unitSeverity, healthSeverity)` and the pill's LABEL is `unitState`**, so an instance whose unit is `active` but whose `/health` is `unreachable` paints the word **`active`** alarm-red. No rule is broken — the same single severity governed the old hand-joined string — but the colour now visually attaches to the healthier of the two facts | Unchanged. The `/health` verdict sits outside the pill as muted `endPrefix` text | **owner** |
| ~~**10e-Q12**~~ ✅ **RULED 2026-09-09 and DONE BY 10f: `Row` deleted (three files), five mutations retired with the reason in place, and the TWO properties that had no equivalent ported to `status-row.test.tsx` (`10f-SR1`/`SR2`) rather than dropped.** | **Delete the now-dead `Row` primitive?** `<Row` appears only in `row.test.tsx`; at `HEAD` there were seven call sites and 10e converted every one. 10e added a pill branch and two mutations (`10e-R1`/`R2`) for callers that do not exist, and widened `09-CS1` over a stylesheet no page loads | Kept, green, defending no shipped rendering. `status-row.tsx`'s doc no longer claims a caller `Row` does not have | **owner**, then a later loop |
| ~~**10e-Q13**~~ ✅ **RULED 2026-09-09 and DONE BY 10f: the three anchors re-aimed onto `${prefix}`, same lines, same properties. Step 2's ledger runs again — 272 red across 60 mutations, 22 ⚠ checked.** | **Re-aim `02-R20`/`R30`/`R31` so step 2's ledger runs again?** `regressions.py:635` returns before the ledger whenever an anchor has moved, so the three pre-existing orphans have kept **step 2's whole ⚠ check dark** since `formatUptime` gained its `prefix` parameter. `lib/format.test.ts` has **no second owner**, so its marks — including the seven 10e added for the `format*Parts` variants — are checked by nothing that runs | Left untouched (HANDOVER §1 says they are not this loop's). The test phase ran the ledger diagnostically with only those three excluded: **261 red tests across 57 mutations, 22 ⚠ checked, every one reddened** — the coverage exists; nothing is checking it. It is one `formatUptime` signature away | **owner**, then the next loop touching step 2 |

### ⚠ NEW — 10b-S-G's four, 2026-09-08. None is implemented; each names what stands today.

Implementing the owner's `errors[].instance` ruling answered §6.5's structural requirement and
raised four questions the spec does not reach. Full statements in
`pipeline/steps/10-panels-assembly/10b-sg-reconciliation.md` §5. **Questions, not proposals** —
but each one has code standing behind it today, named here so the owner rules on a real thing.

| # | Gap | What stands today | Owner |
|---|---|---|---|
| **S-G-Q1** ⚠ | **When one source files SEVERAL entries about the same instance, does the row show them all or the last?** §6.5 says *"its row shows the unit state and **the reason**"* — singular. `readEnv` files **one entry per parse problem**, so a `1.env` missing `MODEL` with an unparseable `CTX` is two `llama-env` entries for instance 1; the first is on the page **nowhere** (it matched an instance, so it is excluded from the panel-level notes too). Reachable, not theoretical | `errorFor` folds by `source`, so the **last** wins per source per instance. The row already joins **across** sources with ` · `; joining within one is a small change if that is the ruling. The module doc no longer claims otherwise | **owner** |
| **S-G-Q2** ⚠ | **A `dbus` entry with no `instance` is two different facts.** A bus-wide connect failure blanks every `serving[].unitState` and SERVING must show it; `collectSafety`'s per-unit `gpu-fan-control.service` failure blanks nothing on SERVING. Nothing on the wire tells them apart, so SERVING prints another collector's unit failure under its rows. Fixing it needs a **second** structural subject on §4's error shape (which unit) or two distinguishable sources | Both render under SERVING's rows. COOLING and SAFETY now drop entries that DO name an instance (`10b-SG3`/`SG4`), which narrows the mirror case but cannot close this one | **owner**, then whoever owns §4 |
| **S-G-Q3** | **Does §3.7 mean to constrain WHICH sources may carry an `instance`?** The build's "4 of 18" table is a judgement in a document: the type is one flat interface, `tag()`'s third parameter is on the shared minting helper, and `wire.ts` accepts `instance` on `ufw`, `coretemp`, `nvidia-smi` and `statvfs` alike (inert for the fourteen — they never route to SERVING) | Enforced by a **test per path**: `10b-SF1` for `collectSafety`, `10b-SG1`/`10b-SG2` for `llama-env`'s two directory-level paths. That is the honest mechanism while the constraint is a judgement rather than a rule | **owner** |
| **S-G-Q4** | **Must `serving[]`'s `instance` values be unique on the wire, and should `wire.ts` refuse a snapshot that repeats one?** `parseInstanceIndex`'s docstring states the stake — two rows sharing one condition id, §9 dedupes, one instance vanishes from the header count — and the **collector** guarantees it with a `Set`; `wire.ts`'s stated purpose is not to trust the other side, and S-G made `instance` the sole join key, so a duplicate now duplicates every attributed diagnostic under one React key | Validated per entry, never across the array. A duplicate parses and renders twice | **owner**, then 10c |

Also open and unchanged from the build's own note: **`SPEC.md` does not say `instance` must be
non-negative**, and `wire.ts` deliberately matches `Gpu.index`'s permissiveness (`-1` and `0` both
validate) rather than inventing a floor the spec does not state.

### ⚠ NEW — 10b's four, 2026-09-08. Three are IMPLEMENTED conservatively; one is not implemented.

Full statements, with the rejected alternative for each, in
`pipeline/steps/10-panels-assembly/10b-reconciliation.md` §6. Questions for the owner, not
proposals — but three had to render *something* today, so each names the string in the code.

| # | Gap | Implemented as | Owner |
|---|---|---|---|
| **10b-S-E** ⚠ | **What a GPU panel renders for a card ABSENT from a `gpus[]` that WAS read.** §6.5 rules the *condition* (retired — *"the subject has left the machine, and that is an answer"*) but §6.2 gives no panel wording, and §6.5's only GPU literal, `no GPUs enumerated`, is for the whole enumeration failing. Before 10b's reconciliation the two states rendered **byte-identically** and the panel still printed `served by instance 1  gemma-4-12b` for a card that is not there — §6.2's own named failure mode | **`card not enumerated`**, a body takeover, no served-model row. Rejected: the ordinary body of em dashes, which is indistinguishable from a present card whose readings failed | **owner** |
| **10b-S-F** ⚠ | **May a panel's HEAD chip read `normal` while one of that panel's own readings is `—`?** MEMORY with `RAM — / —` and a healthy swap shows a green ✓ over an em dash; so do STORAGE and COOLING. §9's *"a dashboard that goes green because it stopped being able to look"* is written about the **aggregate**, which conditions protect (a stale condition keeps its band and its place in the count). §6.3 says nothing about a panel head over a mixture, and the panels are inconsistent: CPU and GPU go no-band, the other three do not | ⚠ **NOT CHANGED**: `worstSeverity` over the bands that exist, skipping `null`s, which is what §6.3 literally supports. The alternative — no-band whenever any input is unreadable — costs a panel its alarm colour when one unrelated field fails | **owner** |
| ~~**10b-S-G**~~ ⚠ | **`errors[]` carries a `source` but no subject, and §6.5 needs one.** The join could only be made by reading the message text | **RULED AND IMPLEMENTED, 2026-09-08.** `SPEC.md` §3.7 (line 542) carries the owner's wording; `TelemetryError` gained an optional `instance?: number` and the panel matches on that field alone — no message text is read in the attribution path any more. ⚠ **Additive, so an old server's snapshot still validates**; the redeploy is needed for the feature to *work*, not to avoid a refusal. Four **new** questions came out of implementing it — S-G-Q1…Q4 below | closed |
| **10b-S-H** | **When one source blanks several figures on one panel, is its message stated once or beside each?** `errorsForPanel`'s doc says granularity is per **source**; §3.7 says an alarm needs its explanation **beside it**. `dell-smm` blanks five channels and the mode; `statvfs` blanks both mounts; `proc-meminfo` blanks RAM and swap | **Once**, under the figures it blanks — matching COOLING's existing choice. Consequence, stated plainly: with `dell-smm` down, fans 1–4 read `—` with the message sitting on fan 5 | **owner** |

### ⚠ NEW — 10a's four, 2026-09-08. Three are IMPLEMENTED conservatively; one is not implemented.

These are **questions for the owner**, not proposals — but three of them had to render *something*
today, so each names the exact string in the code so the owner rules on a real thing. Full
statements with the rejected alternatives are in
`pipeline/steps/10-panels-assembly/10a-reconciliation.md` §5.

| # | Gap | Implemented as | Owner |
|---|---|---|---|
| **10a-S-A** ⚠ | **What the header reads when nothing has a band yet.** §6.2 gives three literals (`● all healthy`, `❙❙ paused · 6 alarms`, `⊘ stale · 6 alarms`) and none covers `severity === null` with `alarms === 0` — the state of **every page load** between hydration and the first poll, and of any poll producing no banded reading. §9 forbids the obvious answer: *"not `'normal'`, which would claim health for a poll that produced nothing."* The dot is correctly grey there; the words were saying **all healthy** three pixels away | **`● no readings`**. `● —` rejected (the status line already carries `— — · —` beside it); leaving `all healthy` rejected (it is the dot and the text disagreeing, which §9's "one reduction" exists to forbid) | **owner** |
| **10a-S-B** ⚠ | **How a stale reading's age is worded.** §6.5 requires *"its row and the banner name the age of the reading"* and gives no wording | **`last read 6:12 ago`**, coloured `--status-watch` not `--status-alarm` — the condition is still an alarm; this says nobody has been able to *look* since, which must not read as a second alarm. ⚠ **The row half is 10b's (SAFETY) and must use the same words** | **owner**, then 10b |
| **10a-S-C** ⚠ | **A "since" older than a day.** `since 03:00:14` on a wall panel open since Friday is indistinguishable from six hours ago. §6.4's example stays inside one day; decision 7 makes multi-day the expected case, and §6.4 also says the event log "is lost on reload, by design", which is what makes a multi-day page load ordinary rather than exceptional | ⚠ **NOT IMPLEMENTED.** Candidates: an elapsed form (`for 2 d 06:00` — `formatUptime`/`formatAge` have the vocabulary, and S-B has now put elapsed text in this banner anyway) or a date prefix when the instant is not today | **owner** |
| **10a-S-D** ⚠ | **Does SCOPE §2.5a govern the browser's pre-first-poll frame?** SCOPE says `state === null` is "before the first poll … **must not render `—`**". In a browser `state` is non-null from the first render, five header fields are legitimately `null`, and invariant 1 says they render `—`. Two documents, two readings | Code follows **invariant 1**: the guard covers the frame where `state` really is null (server render / pre-hydration), and `—` for a null field is the same correct answer on poll 0 as on poll 400. Reasoning in the reconciliation §3.3 | **owner** — one sentence in §6.2 or in SCOPE settles it |

⚠ **The two Q2 rows are QUESTIONS, not proposals.** No phase wrote wording for either; the owner
does (ANCHOR §8). Full statements, with the measurements and the trade-off table, are in
`pipeline/steps/Q2-hover-and-table/reconciliation.md` §4.

| # | Gap | Owner |
|---|---|---|
| **Q2-S2** ⚠ | **The table view has no height bound, and §6.2's justification does not cover it.** §6.2 accepts the hover layer and table view partly because *"they cost nothing when unused. A tooltip that never fires renders nothing and occupies no space in the grid, so §6.1's no-scroll promise is untouched."* True of the tooltip; **silent about the table view**, which is not "unused" once a caller toggles it. Measured: **~722 `<tr>`** at the default 30-minute window (2 plots × ~361 rows), **1,202** at 120 minutes after §6.7's decimation — ~12,000–20,000 px of content in a grid cell §6.1 budgets at a few hundred, inside a layout promising no scroll at ≥1280×1024. `.tableView` carries no `max-height`, no `overflow` and no row cap, and the primitive gives a caller nothing to hang one on. **Cap the rows** (the table stops being the chart's complete substitute, so §6.2's "accessibility floor" no longer holds), **decimate again** (a second budget beside §6.7's, and two decimations that can disagree), or **scroll inside the panel** (arguably what §6.1 forbids — though §6.1 already accepts scrolling below 1280px, and a panel scrollbar is not a page scrollbar). Needs a sentence in §6.1 or §6.2 | **owner**, then step 10 |
| **Q2-S1** | **§6.2's "per-mark tooltip on bars and dots" is entirely unmet, and the two clauses are in structural tension.** The crosshair half is delivered by a hover layer that tiles the plot body at `pointer-events: all` and is painted last; SVG hit-testing therefore hands the pointer to a zone and never to the mark beneath, so a mark's own `<title>` can never display (bar a ~2.5px crescent of the end dot past `plotWidth`). **A full-body crosshair and reachable per-mark tooltips cannot coexist on one plot.** Three sub-questions: was the clause written about a **bar or scatter** chart, where there is no crosshair layer? — `components/` has no such primitive, and `Meter` has its value as permanent visible text. If so, is the clause satisfied **vacuously** today and inherited by that future primitive? Or does the crosshair's own tooltip **discharge** it on a line chart, since it already reports the mark's instant and every series' value at it? `build.md` §7 recorded this as *partially* satisfied and has been corrected | **owner**, then whoever specs a bar/dot chart |
| ~~**S11 / G5**~~ — **CLOSED 2026-09-08 by 10b.** The panel half is discharged **by construction**: COOLING's fan5 row renders only a stale age or a real `errors[]` message, never invented copy, so a `fan5` em dash beside the `unavailable` neighbour gets no entry of its own. ⚠ The guard was **rebuilt** by 10b's reconciliation (adversarial F6): it asserted three substrings — the exact words `10b-CO5` injected — and a fallback sentence with different wording passed it. It now asserts the row carries **no note element at all**, which is what the ruling actually says. Do not re-raise either half | Prior wording, for the record: ⚠ **NARROWED.** The collector half is **settled** in `SPEC.md` line 1208: *"the exception has ONE hole and the collector closes it, not the panel"* — `collectCooling` files an entry when `pwm5` is in the listing and `fan5_input` is not, and the spec explicitly rejects a panel-rendered note because *"a qualified rule is one a future reader has to know the exceptions to."* What is left is what a **panel** does with an em dash whose coloured neighbour is not coloured. Do not re-raise the collector half | **step 10** |

**⚠ Closed since this table was last written — verified against the spec text, not assumed:**

| # | Where it is settled |
|---|---|
| ~~**S19**~~ | `SPEC.md` line 1327: *"⚠ S19, settled 2026-09-07: the message text carries it and the RENDERING does not."* One em dash and one entry either way; no fourth display state, no separate glyph, no colour. A distinct visual state and raising the panel to `watch` were both explicitly rejected, with reasons |
| ~~**S30**~~ | `SPEC.md` line 780: *"Tone is `warn`, not `error` (⚠ S30, settled 2026-09-07)"* — the same as *session expired*, because nothing the operator did is wrong. `error` and a toneless row were both rejected, with reasons |
| ~~**S49–S53**~~ | All five are in the spec as `WORK-ITEMS.md` §9's **A8–A12**. The paragraph below saying *"the owner has not yet put any of them into `SPEC.md`"* **was true when written and is now false**; it is kept for the reasoning and marked |

⚠ **S20, S31, S32 and S33 were on this table when step 8 closed and are NOT open** — all four
are answered by the current spec text (§4's *"a rule, not a census"*; §5's *"This check runs
FIRST, before the rate limit"*; §5.2's *"The screen never retries on its own"*; §5's *"compared
ignoring parameters and case"*). Removed 2026-09-07 after re-reading each against `SPEC.md`.
**That is the fourth time this table has been stale in the safe direction. Re-verify before
trusting any row.** Also closed and no longer worth raising: step 2's DEFER 15 and 16 —
`lib/severity.ts` exports a function for all fifteen of §6.3's rows, and `lib/conditions.ts`
carries `singleton` and `bareKindAllowedInStanding` per kind.

**⚠ New in step 8 — and ALL FIVE ARE NOW IN `SPEC.md`, as `WORK-ITEMS.md` §9's A8–A12.** This
heading used to read *"the owner has not yet put any of them into `SPEC.md`"*; that stopped being
true on 2026-09-07 and this file did not notice until Q1's reconciliation checked. `ANCHOR.md` §7
already knew. **The table is kept because the reasoning behind each ruling is worth having**, and
because the code's choice — recorded beside each, none of it filled by assumption — is what the
spec then adopted:

| # | Gap | What the code does |
|---|---|---|
| **S49** | **§6.7 does not say whether the 600-point decimation budget is per series or per chart.** The review ruled **per series**; the sentence never reached the spec | Per series. `decimateSeries` is called per trace, so §6.2's stacked chart draws up to **1,800** points. **Step 9 renders this** — see §6 rule 10 |
| **S50** | **§6.5 says a stale condition's row "names the age of the reading" but not WHICH CLOCK measures it.** §6.7 splits server `ts` from browser `now`, and "the age of a reading we did not take" is cleanly neither | `DisplayedCondition.lastSeenMs` is the **browser's** clock at the last poll that carried the condition — a fact about the session, matching `sinceMs` and an event-log line |
| **S51** | **§6.5 does not say what a stale condition's VALUE shows.** §6.6's "`null` renders `—`" could be misread as requiring the figure to blank | The last value read, unchanged, with `stale: true` beside it. **Step 9/10 decides the treatment** |
| **S52** | **§6.4 does not say whether `loggedStanding` survives a mid-session `STANDING` change** | Not reset. It belongs to the session, not to the configuration |
| **S53** | **§4 does not say what a duplicate entry in `STANDING` means** | Echoed verbatim; harmless because the client builds a `Set`. Recorded so nobody "fixes" it server-side |

**Closed by the current `SPEC.md`:** S14–S18, S21–S29, S34 (`standing` on §4's snapshot),
S35, S40–S48, plus S1–S13, G1–G6, C1–C5, F5 from steps 2–5. **Declined rather than open:** S8 —
`/v1/models` returning more than one model is a state this box cannot reach.

### ⚠ Three step-8 measurements recorded so nobody re-litigates them

- **S35 — the backoff's divergence point.** Doubling-to-the-cap and the written 1×/2×/4×
  sequence diverge **from the fourth failure, and only below an 8 s cadence** — nowhere at 10 s
  or 30 s. The build's claim was confirmed exactly; no change was made.
- **R3 — §6.4's ten seconds wants a monotonic clock, and does not get one.**
  `performance.now()` is not in the `RuntimeEnv` seam. A backward wall step only *delays* a
  confirmation, and `stepBandHold` already restarts a pending run when `nowMs <
  pendingSinceMs` — **the safe direction**. Recorded; do not build it.
- **The five ⚠ marks step 8 dropped, and why each was right.** `writing with no storage at
  all` and `no storage object at all yields the defaults` are **compiler-enforced**: removing
  the `null` guard makes `null.getItem` throw a `TypeError` *inside* the `try` §6.7 mandates,
  which returns the same fallback — the two implementations are behaviourally identical, so no
  behavioural mutation can exist (covered by the `types` mutations `P9`/`P12`). `gpus: null
  produces no GPU conditions` and its `serving` twin are defended at the wire (`W2`/`W11`).
  `every §6.4 kind has a decision about whether its value is itself a band` claimed only
  *completeness*, which is a compile error (`T4`). ⚠ **This is HANDOVER's own "every catch added
  for a never-throw rule removes a distinction", found by the ledger rather than by hindsight.**

---

## 9. Deferred work, with owners

⚠ **Two new documents, both 2026-09-07:**

- **`pipeline/WORK-ITEMS.md`** — the steps 1–8 sweep: what it found, an adversarial review of
  its own findings, the execution log, and §9's record of the **ten `SPEC.md` edits taken**.
  ⚠ **`SPEC.md` was edited for the first time in this project's history** (1290 → 1362 lines),
  by the owner's delegation. Every gap listed as "awaiting the owner's wording" in earlier
  handovers is now **in the spec**; §8's table below is the residue, not the whole story.
- **`pipeline/INSTALL-SPEC.md`** — ⚠ **step 11's `dashboard.sh`, specified before it is
  written**, with the four decisions the owner took on 2026-09-07 (NVIDIA's apt repo in; rsync
  for source delivery; the script adds the ufw rule defensively; subcommands with `install`
  orchestrating). It carries every system change the script makes, the `docker run` line flag
  by flag, the unit with its three traps, and `check` as the silent-failure detector for
  O20–O23 and D8. **It also names two prerequisites on the dashboard code** — a
  `dashboard-cli.js` kept in the standalone output, and `.dockerignore` — without which
  `set-password` cannot work at all.
- **`pipeline/UI-BACKEND-GAPS.md`** — ⚠ **read this before starting step 9.** §6.1 and §6.2's
  panel list checked against `lib/`, row by row. The finding is that **the data is all there**
  and what is missing is a thin seam layer: the GB→GiB rename first and mechanically, an
  `ErrorSource → panel` selector, `traceFor`, a time-of-day formatter, a `state === null`
  wrapper, and the age tick. It also carries the twelve do-not-leak rules, because that is the
  document step 9 will actually open.

| Work | Owner | Status |
|---|---|---|
| **Panel shell, chips, meters, rows, sparkline, stacked cooling chart** | **step 9** | specified — §6.1, §6.2, §6.6 |
| ~~**`errorsForPanel(snapshot, panel)`**~~ (D4) | — | **closed 2026-09-07** — `lib/client/observations.ts:350`. ⚠ Carried as open here until Q2 checked |
| ~~**`traceFor(state, pick)`**~~ (D5) | — | **closed 2026-09-07** — `lib/client/series.ts:201`. Same |
| ~~The GB → GiB rename~~ (O19) | — | **closed 2026-09-07** — a deletion; `GiB` already existed |
| **Formatter `parts` variant** (O14) | ⚠ **step 11 / owner** (was step 9, step 10, 10b, 10c-3) | open — re-checked by 10c-3: still nothing splits a formatted string, and 10c-3 added no styled unit. **The ask has not arisen in four consecutive loops**; it should be closed as a non-item or re-scoped by the owner rather than carried forward a fifth time |
| ~~**jsdom** (D6)~~ | — | **closed by 10a** — `jsdom@30.0.1`, both halves tested, and `next build` re-run to confirm it does not reach `.next/standalone`. ⚠ jsdom still cannot see `:hover`, `position: sticky`, `matchMedia` or layout — that is the browser item below, not this one |
| ~~S11/G5's **panel-rendering residue**~~ | — | **closed by 10b** — by construction, and the guard rebuilt to assert the ruling rather than three substrings. §8 |
| **S40's third event-log feed** (D1) | **10c / owner** | open — `LogEntryKind` is `lib/client/events.ts`'s and was outside 10b's file scope. ⚠ `event-sentence.ts`'s exhaustive switch makes the new kind a **compile error** in the panel the day it lands, so the panel half is future-proofed |
| ~~**render `unknownStanding`** (D3)~~ | — | **closed by 10b** — one SAFETY row per malformed entry, `severity={null}` (O12's explicit no-band), kept out of that panel's head chip. Backed by `10b-SP3` |
| ~~**the independent age tick** (D2)~~ | — | **closed by 10a** — `app/use-now-tick.ts`, **and** the caller-side test that catches its deletion |
| ~~The header: dot + count + paused/stale mode (O2)~~ | — | **closed by 10a** — and it was a live defect, not just an obligation: the first build split the dot from the count. §0.3 |
| ~~A `state === null` wrapper written once~~ | — | **closed by 10a** — one guard, in `app/dashboard-shell.tsx`, nowhere else. ⚠ Open question **10a-S-D** about what it covers |
| Render "duty unreadable" vs "channel 5 absent" distinctly | **10b** | open — COOLING's body |
| **Keep the server-rendered shell free of telemetry and secrets** | ⚠ **standing, all steps** | §3.3. 10a made `app/page.tsx` four lines and **tested it** (`app/page.test.tsx`) — it had no test at all before |
| ~~The red-test ledger retrofit for step 3's harness~~ | — | **closed** — done during step 8, confirmed 2026-09-07. All **eight** harnesses carry a ledger |
| ~~**Q1** — the ⚠-scanner back-port~~ | — | **closed 2026-09-07** — 771 mutations, 689 marks, eight harnesses green. §0.1 |
| ~~**Q1-F4** — assert every ⚠-bearing test file is in some `LEDGER_FILES`~~ | — | **closed by 10c-2** — `lib/cross-harness-ledger.test.ts`, union and real set both walked every run (96 ⊆ 97 today, one orphan left: `lib/throttle.test.ts`, mark-free). It adopted `lib/contract.test.ts` into step 3's ledger (`10c-G1`) and caught its own four siblings as orphans the moment it was written. ⚠ Its anti-vacuity check was **inverted** and is fixed — §0.7 |
| ~~**Q2** — §6.2's hover layer and table view~~ | — | **closed 2026-09-08** — 13 findings adjudicated, `components/` harness at 93 mutations. §0.2 |
| **Q2-S2** — the table view's height, against §6.1's no-scroll promise | ⚠ **owner** — and it is now PART OF §0.0 | ⚠ open, and **materially worse than when it was written**. 10c-3 verified 2.5f: **no panel body has a bounded ancestor**, so `max-height: 100%` would compute as unconstrained and silently uncap the table — `--table-scroll-max: 40vh` stays, correctly. But §0.0 measures the page scrolling by 560–632 px **with every panel in its chart view**, and a single toggle to `table` adds up to 40vh (432 px at 1080) on top. The two questions are now one: whoever decides §6.1's answer decides this. **The table view has never been measured in a browser at any width** |
| **Q2-S1** — §6.2's per-mark tooltip clause vs the crosshair layer that occludes it | **owner** | open — §8 |
| ~~**Q2-F9** — clamp vs drop for an out-of-domain instant~~ | — | **closed by 10c-3 — DROP.** `clipPlotsToDomain` filters every series once, above the `view` branch, so the chart, the hover layer and the table cannot disagree about which points exist. Reasoning: a mark's x **is** its claimed instant, so pegging it to a rail is a positional lie with no "capped but recognisable" story (unlike §6.3's magnitude clamp, which keeps the real time and puts the real number in the tooltip). ⚠ It also closed a gap F9 was never scoped to: `tableRowsFor`'s sample rows had **no** domain filter at all. `Q2-H10` retired (unreachable through the public component), `10c-F9-1`/`F9-2` added |
| ~~**10b — the nine panel bodies**~~ | — | **closed 2026-09-08** pending the parent's review — 14 findings adjudicated (11 accepted, 1 in part, 2 deferred, 0 rejected outright). **92 files · 2559 tests · step 10's harness at 129 mutations · 150 ⚠ marks.** `10b-reconciliation.md` |
| ~~⚠ **Wire the nine panels into `app/dashboard-shell.tsx`**~~ | — | **closed by 10c-1, 2026-09-08** — nine real panels mounted, `PanelPlaceholder` deleted, SVG ids distinct per cell, and the composition itself found five defects no isolated panel test could see (§0.6). `10c1-reconciliation.md` |
| ~~**Q2-S2's toggle needs a home in `app/`**~~ | — | **closed by 10c-1** — `chartViews` in `app/dashboard-shell.tsx`, one entry per chart-bearing panel, the control rendered beside each chart per §6.2. ⚠ Granularity (one per panel, not per chart) is an **invariant-7 recording**, not a spec ruling |
| ~~**10a-F4, half two: force an alarm client-side**~~ | — | **closed by 10c-1** — `lib/client/force-alarm.ts`, wrapped around `RuntimeEnv.fetchTelemetry` so the real validation/severity/debounce/banner path runs and a forced alarm takes the same two-poll confirmation a genuine one does. ⚠ Its **production unreachability is now a test** (`10c-UT1`), not an unwatched `process.env.NODE_ENV` token — the adversarial replaced that token and reached a real `pnpm build` chunk with everything green |
| ~~⚠ **10c1-A8-audit** — a static check that every `styles.X` names a rule its sibling `.module.css` declares~~ | — | **closed by 10c-2** — `lib/dangling-css-class.test.ts`, 18/18 CSS-module imports audited, quote- and namespace-agnostic, proportional population check (`10c-G3`). Was: **A CSS-module import is a Proxy: every key resolves, including keys with no rule** (§0.6), so a deleted or misspelled class is invisible to `tsc` and to the whole suite. The one live instance (`alarm-banner.tsx`'s `styles.item`) is **fixed**; the mechanism that hid it is not. ~15 lines, no browser, no runtime — it belongs beside `10b-F1-guard` and `L11` |
| ~~⚠ **10c1-A9-paint** — scope the browser step to **paint only**~~ | — | **closed by 10c-3, by construction.** `measure-breakpoints.mjs` reads exactly two kinds of fact: `getBoundingClientRect` (where something painted) and `getComputedStyle`'s `display`/`gridTemplateColumns` (what rendered post-cascade, post-media-query). It never asserts which class an element carries (jsdom's tier) and never checks that a `styles.X` resolves (10c-2's static audit). §0.6's three-tier table held |
| ⚠ **Banner items: should a condition be forbidden from wrapping mid-condition?** | ⚠ **owner** (was 10c-3) | open. 10c-3 looked at it in the browser pass and **still declined to invent a rule**, which is the right outcome: §6.4 specifies the banner's content and its collapsing rule and says nothing about an individual item's text wrapping. Both answers are real trade-offs — `white-space: nowrap` risks clipping or a horizontal scrollbar in the <900px band where several conditions are likeliest; free wrapping risks a label reading as separated from its own value in the one component whose job is an unambiguous glance. **A sentence in §6.4 settles it**; if it forbids wrapping, `.item { white-space: nowrap }` (or a `min-width`) is the fix and someone must also say what happens to an item too long for the narrowest supported width |
| ~~**10b-F1-guard** — forbid the document-wide `toContain` shape mechanically~~ | **PARTLY closed by 10c-2** | `lib/tocontain-scope.test.ts` closes **two of the four** founding shapes (bare `data-severity`, bare em dash) inside composite panels; it found 8 real hits, and its own reconcile-phase narrowing found a 9th (§0.7). ⚠ **The bare-WORD half is open and is now measured** — see the new row below |
| **10b-F11 / 10b-S-F** — a panel head reading `normal` over one of its own em dashes | **owner**, then 10b/10c | open — §8. Deferred deliberately: it changes what every panel head means, which is not a reconciler's call |
| ~~**10b-F14b** — at 1280–1599px the GPU and CPU traces cannot hatch a gap~~ | — | **closed by 10c-3, then CORRECTED THREE WAYS by its own adversarial.** `Sparkline` gained an optional `gaps` prop. ⚠ The failure was worse than "no hatch": with no null placeholder in the ring, the points either side of a gap are **adjacent in the array**, so index-positioning drew one smooth unbroken line across unsampled ground. The build's first implementation then computed marks per adjacent PAIR where the promoted chart computes them per GAP — A4/A5/A9, all three fixed by `gapSpansFor`. See §0.8 |
| **10b-F14a** — SERVING's composite row value reads `:— · — · ctx — · health —` for an identity-only instance | **owner** | open, cosmetic. Not an O14 violation (it concatenates whole formatter outputs, never splits one); changing it means inventing a composition rule §6.6 does not state |
| **10b-S-E · S-F · S-H** — three spec questions (~~S-G~~ is **ruled and implemented**) | **owner** | §8. Two implemented conservatively, S-F not implemented |
| ~~**10b-S-G** — `errors[]` gains an optional `instance`~~ | — | **closed 2026-09-08** pending the parent's review — build → test → adversarial → reconcile, **11 findings adjudicated** (6 accepted of which 3 in part, 1 rejected, 2 deferred). The `errors[]`→`llama-server` join is **structural**, not a substring match. `10b-sg-reconciliation.md` |
| ⚠ **S-G-Q1** — several entries from one source about one instance: only the last is rendered, anywhere | **owner** | open — §8. `readEnv` files one entry per parse problem, so this loses a real reason on a real box. The doc that claimed otherwise is corrected; **the behaviour is unchanged and deliberate**, because §6.5 says "the reason", singular |
| ⚠ **S-G-Q2** — a `dbus` entry with **no** instance conflates a bus-wide failure with `collectSafety`'s per-unit one | **owner**, then whoever owns §4 | open — §8. ⚠ **This is the residue of the A2 fix and it is named at both call sites in the code.** COOLING and SAFETY now ignore entries that name an instance; entries that name none still reach all three panels, so SERVING prints `gpu-fan-control.service`'s failure under its rows. Needs a second structural subject or two sources — not a reconciler's call |
| **S-G-Q3** — which of the eighteen sources may carry an `instance` is a judgement in a document | **owner** | open — §8. Enforced today by a test per path (`10b-SF1`, `10b-SG1`, `10b-SG2`). A type-level constraint was **rejected** as the fix here: it means a discriminated union over eighteen sources and a per-source rule in `wire.ts` that `SPEC.md` never states |
| **S-G-Q4** — duplicate `instance` values in `serving[]` validate and render twice under one React key | **owner**, then **step 11** (was 10c-2, then 10c-3; both were scoped elsewhere and neither touched `wire.ts`) | ⚠ open — §8, and **carried unactioned through two loops now**, which is the shape a row acquires just before it is forgotten. The collector prevents it; `wire.ts` does not, and its own header says its purpose is not to trust the other side |
| **S-G-A10** — should the session event log be per-instance? | **owner** (was "10c-2 / owner"; 10c-2 built guards only) | open, low. `events.ts:400` folds `errors[]` last-per-source across **all** instances while a SERVING row is now last-per-source **per** instance, so with both instances failing `/health` the log's one sentence is instance 1's while row 0 shows instance 0's. `events.ts` has no row to hang an instance on, which is why this is a question and not a bug. The comment that cited the two as agreeing is corrected |
| ~~**S-G-A11** — turn on `exactOptionalPropertyTypes`~~ | — | **closed by 10c-2 as a NON-ITEM.** ⚠ The flag has been `true` since the **first commit** and `guardrails.test.ts` has asserted it as text since then; `{ ...base, instance: maybeUndefined }` reports `TS2375` today. The earlier measurement ran `tsc` with a flag that was already on and proved nothing. `tsconfig.json` unchanged; the two source comments carrying the wrong reason are corrected — §0.5 |
| ~~**10a — the shell**~~ | — | **closed 2026-09-08** — 18 findings adjudicated (16 accepted, 2 deferred, 1 half-rejected). 79 files · 2399 tests · nine harnesses · 875 mutations. `10a-reconciliation.md` |
| ~~**10a-F17**~~ | ✅ **CLOSED** | Fixed and committed `3c37107`, 2026-09-08, ahead of 10b landing. Fake timers; `deadline.ts`/`serving.ts` byte-identical; 60/60 under load; still fails when the defect returns. **This row previously said "open and untouched" and was wrong** — it sent 10c-2's reconciliation to re-own a closed item |
| ⚠ **10a-F4 — nothing in the pipeline runs a browser AUTOMATICALLY** | ⚠ **half CLOSED by 10c-3; the "automatically" half is step 11/12's** | ✅ The measurements exist and run: `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`, `playwright-core` driving the **system** Chrome over CDP, **12 measurements: 9 pass · 3 fail · 0 blocked**. The three failures are §0.0 and they are the spec's. ⚠ **Nothing runs it automatically and it must not join `pnpm verify`** (ANCHOR §4: one deterministic command, no browser prerequisite) — wiring it into a CI step is **step 11/12's**. ⚠ It is macOS-only (hardcoded Chrome path) and measures `next dev`, **not** the standalone build step 11 ships — **step 12** should point it at the built artifact. Prior wording, for the record: | ⚠ **half closed.** (2) — the alarm-forcing hatch — is **built and tested** by 10c-1. (1) is still open: the seven measurements re-run headlessly, `getBoundingClientRect` at 820/899/900/1150/1279/1280/1920, asserting COOLING's `y`/`height`/`x` span at ≥1280 and the `y`-order at <900. ⚠ **10c-1 ran a real Chrome by hand and five of the seven passed**, but `resize_window` could not set the viewport — `window.innerWidth` read a constant 3440 across every call — so measurements 1–4 and 6 are unexercised. That is a **tooling** limit, cleanly separated from the app, and it is the concrete argument in `10c1-build.md` §3.3 for a purpose-built harness (Playwright/Puppeteer, verified absent from `.next/standalone` the way jsdom was) rather than half-solving it with the wrong tool. ⚠ **Scope it to paint only** — see `10c1-A9-paint` above |
| **10a-S-A · S-B · S-C · S-D** — four spec questions | **owner** | §8. Three implemented conservatively, S-C not implemented |
| ~~**10a — SCOPE 2.5f**: replace `--table-scroll-max: 40vh` with `max-height: 100%`~~ | — | ✅ **CLOSED BY 10g — the token is DELETED, not replaced.** `10f-Q1`'s ruling makes a table view render at the chart's own painted height (`--table-box-height`, set inline by the component and read by a real `height:` declaration so `styles.test.ts`'s bounded-box rule can still see it), so there is no page-independent number left to name. Measured after: the grid is identical with all five table views open and all five closed, at all three viewports. ⚠ The reasoning below stays, because 10h needs it — it is exactly why 'bound the grid' is not a token flip. Was: ⚠ **VERIFIED AND DELIBERATELY NOT CHANGED**, twice independently (10c-3's build and its test phase, by re-grepping every `height`/`min-height`/`max-height` under `components/` and `app/`). `grid.module.css` sets `grid-template-columns` at every breakpoint and **never `grid-template-rows`** — rows are `auto`. `min-height: 0` appears throughout and bounds nothing (it removes an implicit minimum). So **no panel body has a definite-height ancestor**, and `max-height: 100%` would compute as unconstrained per CSS's percentage-height rule and silently uncap the table again. `tokens.css` now records the verification. ⚠ Giving the grid a real bounded height is not a token flip — it is one of §0.0's three repairs |
| ~~**10c-1 — the wiring**~~ | — | **closed 2026-09-08** pending the parent's review — **12 findings adjudicated: 10 accepted, 0 rejected, 2 deferred.** 95 files · 2627 tests · step 10's harness at **168 mutations · 196 ⚠ marks**. `10c1-reconciliation.md`, and §0.6 for the rule it leaves behind |
| ~~**10c-2 — the guards**~~ | — | **closed 2026-09-08** pending the parent's review — **11 findings adjudicated: 11 accepted (2 in part), 0 rejected outright, 2 sub-parts rejected on measurement, 1 deferred build (F7).** 99 files · **2775 tests** · step 10's harness at **172 mutations · 200 ⚠ marks**. `10c2-reconciliation.md`, and §0.7 for the rules it leaves behind |
| ~~**10c-3 — sizing and visual**~~ | — | ⚠ **closed 2026-09-09 pending the parent's review — CLOSED WITH A KNOWN FAILURE (§0.0), not green.** **12 findings adjudicated: 12 accepted (2 in part), 0 rejected outright, 2 sub-parts deferred with owners.** 99 files · **2793 tests** · step 9's harness at **102** mutations / 114 ⚠ marks · step 10's at **175** / 203. `10c3-reconciliation.md`, and §0.8 for the rules it leaves behind |
| ~~**10e — match the mock's density**~~ | — | **committed `8ad8b9c`, 2026-09-09.** §6.1 measured TRUE on the healthy page: spare 263.2 / 227.6 / 283.6 px, banner pinned, overflow 0. 102 files · 2933 tests. §0.9 |
| ~~**10f — degraded pages fit**~~ | — | **committed `5769522`, 2026-09-09.** Every `errors[]` block a bounded well; the neutral `0x4` chip; `Row` deleted; step 2's ledger re-aimed. 10 findings adjudicated (4 accepted-and-fixed, 1 in part, 4 accepted-as-measured, 1 deferred, 0 rejected). 101 files · 2967 tests · nine harnesses, 1093 mutations, all nine exit 0. §0.10 |
| ~~**10g — the last four unbounded terms**~~ | — | ⚠ **closed 2026-09-10 pending the parent's review — GREEN, and the loop that proved the approach does not converge.** The four terms are bounded and measured; the adversarial then broke §6.1 four ways on ordinary telemetry and the owner ruled the GRID bounded (10h). **10 findings adjudicated: 5 accepted-and-fixed, 1 corrected-at-source, 1 deferred with an owner, 1 in part with one half refused against a named line, 2 not adjudicated because the owner ruled first.** 101 files · **3010 tests** · nine harnesses, **1130** mutations, all nine exit 0. ⚠ Its priority finding was that **the ledger was certifying 10g's own acceptance test with nothing** — §0.11. `10g-reconciliation.md` |
| ~~**L11** — a guard against a component hard-coding `' RPM'` instead of calling a formatter~~ | — | **closed by 10c-2** — `lib/format.ts` now exports nine `UNIT_*` constants and every formatter builds from them; `lib/unit-suffix.test.ts` scans every non-test `.ts`/`.tsx` under `components/`/`app/` for a unit spelled around a value, in a literal **or in JSX text** (`10c-G4`). Vocabulary is DERIVED from the `UNIT_*` exports, so a tenth unit is in scope automatically. ⚠ Blind to `` `${pct}%` `` — deliberately, with a counter-example: §0.7 |
| ⚠ **F7 — the runtime `toContain` matcher** (10c-2's adversarial) | ⚠ **a dedicated loop, NOT 10c-3** — the owner places it in `WORK-ITEMS.md` §10 | **open, and MEASURED so nobody re-derives it: 43/454 calls (9.5 %) flagged, 7 already exempt, 36 to adjudicate, against 198 for the source-lint version — and it catches 4 of the 4 founding failures where the shipped lint catches 2.** The rule is *"the needle occurs more than once in the subject"*, decided at run time from the subject alone, so none of the static bypasses apply. It is a `test.setupFiles` change (project-wide harness mechanics, which must itself be mutation-proven) plus a staged report-then-gate adoption — a loop with its own build/test/adversarial phases, not a bolt-on. §0.7 |
| ⚠ **Mutation coverage for the four guards' anti-vacuity nets** | ⚠ **a later loop / the owner** | open. No `10c-G*` mutation breaks a file-walk, so nothing requires any of the four nets to be able to fail; all four were proven functional **by hand** (10c-2's test phase, then its reconciliation). Four mutations, one per guard, each blinding that guard's walk. §0.7 |
| **10c-2's `dashboard-shell.tsx` scope gap** | **whoever writes the next `toContain` guard** | open, recorded per invariant 7. `app/dashboard-shell.tsx` renders all nine panels — the most multi-carrier context in the project — and is outside the lint's scope because it imports panel *components*, not `PanelShell`. Harmless today only because `dashboard-shell.ssr.test.tsx` happens to assert neither dangerous literal |
| ⚠ **§6.1's no-scroll promise — RULED, and the ruling is 10h's to build** | ⚠ **10h** (was: owner) | ⚠ **The original failure is CLOSED**: 10e's density work took 596/632/560 px of overflow to 263/228/284 px of SPARE, and 10f/10g bounded every `errors[]` block, the table views, the banner and the throttle line. **What replaced it**: 10g's adversarial measured the promise still breakable four independent ways on telemetry no fixture carries, so the owner ruled on 2026-09-10 that **the grid itself is bounded** (`SPEC.md` §6.1). §0.0 carries the four scenarios and their numbers; §8's first table carries the ruling. ⚠ **The fixtures are part of 10h's work** — every one hard-codes a non-notable throttle mask |
| ⚠ **The gap mark's contrast, in BOTH chart primitives** (10c-3 A8) | **owner** | open. `Sparkline`'s gap tint measured **1.120:1** against the panel ground; the reconciliation dropped its opacity so it now matches `StackedTimeSeriesChart`'s own blessed hatch stroke at **1.245:1**. Neither clears WCAG 2.2 SC 1.4.11's 3:1 for a non-text UI component, and **`SPEC.md` adopts no contrast standard** — §9's colour rule is about *series identity* (colour + dash + end-label), which a gap mark is not. Raising either is a token-level decision across both components. ⚠ What IS discharged: a gap is never carried by colour alone — the polyline breaks across every gap and the table carries a row for every gap in every case |
| ⚠ **Nothing has loaded the STANDALONE build's CSS in a browser** (10c-3 A10) | **step 12** | open. Every browser fact in step 10 comes from `next dev` on a GPU-less macOS host. CSS modules behave the same in both, so the risk is low — but it is unmeasured, and `measure-breakpoints.mjs` is the tool that would measure it if pointed at the built artifact |
| ⚠ **Wire the breakpoint measurements into something that runs them** (10c-3 A10) | **step 11 / 12** | open. Not `pnpm verify` (ANCHOR §4). ⚠ Its exit code means something again — `BLOCKED` is a third state now — so it *can* gate something; today it exits 1 for exactly one reason, §0.0 |
| **Make `Sparkline.gaps` REQUIRED, like `StackedTimeSeriesChart.gaps`** (10c-3 A6, the option not taken) | **a later loop** | open, low. The behavioural fixtures + `10c-P1`/`P2`/`P3` close the live hole; requiring the prop is compile-time and strictly stronger, but it forces a prop into every render in `sparkline.test.tsx` that does not care, and it still would not prove the value passed is `state.gaps` rather than `[]`. §0.8 |
| **O20 · O21 · O22 · D8** — the four silent-failure obligations | **step 11** | §4.1 |
| **`dashboard.sh check`**: an unparseable `PASSWORD_HASH`; a `SESSION_SECRET` short or quoted; a `STANDING` entry matching nothing; the env file's mode and owner | **step 11** | the only place any of them can be caught, because nothing is logged |
| **F7 — `LIMITS` bounds scrypt's memory but not its time** (measured 1 720 ms vs 58 ms at the worst accepted parameters) | **step 11** | with `check` |
| **`UV_THREADPOOL_SIZE=16`** and a container memory limit on `docker run` | **step 11** | §2.5 |
| `.dockerignore` excluding `*.test.ts` · `node .next/standalone/server.js` + the `.next/static` copy · whether `dynamic` is honoured with Cache Components | step 11 | open |
| Root `CLAUDE.md` gains a pointer to `dashboard/SPEC.md` (§2.4) | step 11 | open |
| **The ufw allow rule for 8090**, added the 2026-09-04 way (`sudo ufw show added` first, from a session that stays open) and confirmed with `ufw status numbered` | **step 12** | open |
| **Verify one container process serves every request** (O22) | **step 12** | open |
| Measure channel 5's **spin-up** ramp read-only and settle §6.4's hold for `fan5_engaged` | step 12 | open — see below |
| Require the `0x` prefix in `throttle.ts`'s `HEX` | owner | open |
| React plugin, coverage provider, ESLint | first step that needs one | open |

**jsdom, and what step 8 deliberately did not do.** Step 8 declined it: every rule lives in
`runtime.ts` behind the `RuntimeEnv` seam, and what jsdom would buy is the twelve lines of React
wiring in `use-telemetry.ts`. That file therefore has **no test and no mutation** — it is the
one such file in the step, and it is also the guard's **third, previously undocumented text
exemption**. What it *rests* on is asserted: `client.test-d.ts` proves the real `Window`
satisfies `BrowserWindow`, so the un-run line `createBrowserEnv(window)` is at least
type-correct and needs no cast. **D6: the first assertion jsdom buys is that unmounting
`useTelemetry` calls `stop()`.** Invariant 6 applies — record what it buys and what it costs
step 11's image. ⚠ And step 7's lesson: `login-form.tsx`'s `opaqueredirect` branch was
unmutatable only because it was buried in a submit handler; moving it into `loginOutcome` made
it a table test. **An untestable branch is often a placement problem rather than a testing one.**

**The channel-5 spin-up item, in full:** `pwm5` reads back the commanded duty *immediately*
while the tach climbs from EC auto's ~2210 to HIGH's 4300+, so `fan5` bands **alarm** across the
whole ramp. §6.4 does not debounce cell colour, so the cell **will** flash red on every engage —
and an engage happens whenever the GPUs cross 55 °C. Whether it also *banners* depends on
whether the ramp exceeds §6.4's 10 s hold, **never measured on this box** (`CLAUDE.md` records
only the ~50 s spin-*down*). Sample `fan5_input` across a natural engage while the cards are
hot, then choose between raising `fan5_engaged`'s hold to 30 s — matching the machine's own
`HIGH_DWELL` — and accepting the transient.

**Properties with no mutation, recorded rather than papered over.** `socket.destroy()` inside
`nodeDbus.connect`'s timer; `child.unref()` in `io.ts`; `session.ts`'s `Number.isFinite` guards
and its signature-length guard; *"the gate is at `proxy.ts` and there is no stale
`middleware.ts`"* (a fact about the file **tree**, and a harness mutates one file's contents);
"one bucket for the whole service" (a two-file change). **New in step 8:** `use-telemetry.ts`
(above); *"the debounce is driven by one wall clock rather than by the sample's `ts`"* — the two
are the same numbers under every fixture in the suite, and distinguishing them needs a server
and a browser that disagree; *"the repeat is detected by identity rather than by sample count"*
— the two differ **only at the 8192 cap**, which no runtime fixture reaches; and *"the client
never writes to the server"*, where a mutation that **added** a write would test that a test
exists rather than that the code is right. Each is documented at its harness site.

⚠ **One came *off* this list in step 8, and it is the pattern to expect.** *"A stale condition
does not re-log its band on every poll"* looked unmutatable and was not: it is invisible for a
continuous metric and **load-bearing for a value-band one**. The list is a record of
*current* knowledge, not a proof. Re-read it when a step adds a fixture of a new shape.

---

## 10. Toolchain facts that cost time to learn

- **This is Next 16 and it is not the Next.js in your training data.** Read
  `dashboard/AGENTS.md` and the bundled docs at `node_modules/next/dist/docs/` before writing
  any Next code. `middleware.ts` is now `proxy.ts`, and a file at the old name **never runs**.
- **`next build` rewrote `tsconfig.json` once**, setting `jsx: "react-jsx"` and appending
  `.next/dev/types/**/*.ts` to `include`. Absorbed; a build now leaves it byte-identical. All
  eight strictness flags survive and are asserted as text.
- **`pnpm start` is not the deployment path.** It prints `⚠ "next start" does not work with
  "output: standalone"` and then serves correctly anyway — from a different code path than the
  container uses. **Step 11 runs `node .next/standalone/server.js`**, after copying
  `.next/static` and `public` into `.next/standalone/.next/`; Next does not copy them.
- **`tsc` bails silently on an invalid config.** `strict: false` with
  `exactOptionalPropertyTypes: true` is `TS5052`; the compiler stops before checking anything
  and Vitest reports `Type Errors no errors`.
- **`execFile`'s callback fires on `'close'`, not `'exit'`.**
- **`setTimeout` clamps a delay outside the 32-bit signed range to 1 ms**, and `NaN` the same
  way. Step 8's cadences and backoff are inside that range; `/login`'s `Retry-After` countdown
  is not necessarily.
- **`performance.now()` is a global from Node 16** and needs no import. `setTimeout` counts on
  libuv's cached millisecond clock while `performance.now()` is finer, so a timer can fire
  *marginally before* its deadline.
- **`vi.advanceTimersByTimeAsync` drains microtasks between timers.** A synchronous read of a
  spy's call count does not. ⚠ Step 8 uses **`FakeEnv`'s own clock, not `vi.useFakeTimers`** —
  the runtime takes its scheduler as a parameter, so a test can *read* the pending timers rather
  than infer them, and `setImmediate` stays available to drain the poll's own `await`.
- **A background tab throttles `setTimeout`**, so a countdown there runs *slower* than the
  server's clock — the safe direction for a lockout, the **unsafe** direction for anything that
  assumes a tick happened. §6.7 pauses polling on `document.hidden` for this reason.
- **libuv's thread pool is four threads by default**, an in-flight operation cannot be
  cancelled, and **four blocked operations block every subsequent read in the process
  indefinitely**. `crypto.scrypt` runs there too, which is why the KDF is serialised.
- **`Buffer.from(s, 'base64url')` is lenient** — it *skips* characters outside the alphabet and
  accepts non-canonical spellings. `decodeExact` in `lib/auth/base64url.ts` is the only correct
  way to read one of our fields.
- ⚠ **`Date.parse` is lenient in the same family**, and step 8 paid for it twice: it **rolls an
  impossible date forward** (`2026-02-30…` lands on 2026-03-02), and it accepts non-canonical
  *spellings* of a correct instant (`…+00:00`, a fourth fractional digit). `wire.ts` needs
  **both** an ISO-shape guard and a 19-character calendar round-trip; neither subsumes the
  other, and the second one silently voided the first one's mutation (§1).
- **`crypto.scrypt` throws SYNCHRONOUSLY on bad parameters**, not through its callback.
- **`noUncheckedIndexedAccess` is on**, so every `split()[i]` is `string | undefined`.
- **The lockfile carries every linux/x64 variant step 12 needs.** `node:24-slim` is glibc.
  `pnpm install --frozen-lockfile` exits 0.
- **Inside `node:24-slim` the build runs as root**, so a plain `corepack enable` works.

---

## 11. Repo state, environment, and the commit point

⚠ **CORRECTED 2026-09-10 by 10g's reconciliation — the block below said `dashboard-frontend` was
at `391d17f` and "LOCAL ONLY, never pushed", and both stopped being true some commits ago.**

```
main                 3f06e98    [origin/main]                 backend, pushed. Untouched since
dashboard-backend    3f06e98    == main. Finished; carries ZERO UI; nothing more goes here
dashboard-frontend   5769522    [origin/dashboard-frontend]   PUSHED. ⚠ THE WORKING BRANCH.
                                10f is the last commit; 10e is 8ad8b9c
```

⚠ **10g leaves the tree dirty on purpose, on `5769522`.** Modified by the 10g loop:
`components/{alarm-banner,sparkline,stacked-time-series-chart}.{tsx,module.css,test.tsx}`,
`components/{tokens.css,styles.test.ts}`,
`components/panels/{caption,gpu-panel,panel-notes,status-row,storage-network-panel,panel-text}.*`,
`pipeline/steps/{09-ui-primitives,10-panels-assembly}/regressions.py`, ⚠ **the shared ledger block
in all NINE `regressions.py`** (10g's reconciliation, A7),
`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs`, `mocks/{arrangements,measure-arrangements}.mjs`,
plus the parent's `SPEC.md` / `WORK-ITEMS.md` / `ANCHOR.md` edits and this file. **Untracked:**
`pipeline/steps/10-panels-assembly/10g-{build,test,adversarial,reconciliation}.md` and
`pipeline/handoffs/10g-*.md`. ⚠ **Nothing under `lib/` or `app/` is 10g's** — if `git status` shows
a file there, it is a stranded harness mutation, not an intended edit (10g's own reconciliation saw
exactly that on `lib/collectors/serving.ts` while step 5's harness was mid-run). No `.env`;
`next-env.d.ts` byte-identical. **A phase agent stages nothing.**

**`dashboard-frontend` carries `components/` and step 9's harness**; the spec, the collectors,
the client runtime and every earlier harness live on `dashboard-backend`'s history and arrive
here by inheritance. **Do not commit UI to the backend branch** — that mistake was made once and
had to be split apart with a soft reset. ⚠ **Pushing `dashboard-frontend` needs the owner's
approval**; `git push` is gated by a permission classifier here and was refused once.

⚠ **10a left the tree dirty on purpose**, and the parent commits it. Modified: `app/layout.tsx`,
`app/page.tsx`, `package.json`, `pnpm-lock.yaml` (one devDependency, `jsdom@30.0.1`). Untracked:
everything 10a created — four `components/` primitives + `panel-props.ts`, two `lib/client/`
reductions, `app/dashboard-shell*`, `app/use-now-tick*`, `app/page.test.tsx`,
`pipeline/steps/10-panels-assembly/` and `pipeline/handoffs/`. **A phase agent stages nothing**
(`ANCHOR.md` §8), and its green is not the green — the parent re-runs `pnpm verify` itself.
(Q1 did the same before it: 15 modified files and two untracked directories.)

⚠ **10c-3 leaves the tree dirty on purpose too**, on top of everything below. **Modified by the
10c-3 loop** (build + reconciliation): `components/sparkline.tsx` · `sparkline.module.css` ·
`sparkline.test.tsx` · `stacked-time-series-chart.tsx` · `stacked-time-series-chart.test.tsx` ·
`grid.tsx` · `tokens.css` (comment only) · `panels/{gpu,cpu,cooling}-panel.tsx` ·
`panels/{gpu,cpu}-panel.test.tsx` · `panels/test-support.ts` · `package.json` + `pnpm-lock.yaml`
(one devDependency, **`playwright-core`**, verified NOT to reach `.next/standalone`) ·
`pipeline/steps/09-ui-primitives/regressions.py` · `pipeline/steps/10-panels-assembly/regressions.py`.
**Untracked:** `pipeline/steps/10-panels-assembly/10c3-{build,test,adversarial,reconciliation}.md`,
`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` and `pipeline/handoffs/10c3-*.md`.
⚠ **`next-env.d.ts` is NOT in that list and must not be** — `next dev` rewrites it on every
browser run, and the script now restores it itself in `finally` rather than leaving a prose
instruction to `git checkout --` it (A11). **A phase agent stages nothing**, and its green is not
the green.

⚠ **10c-2 leaves the tree dirty on purpose too**, on top of what 10a/10c-1 left. Modified by the
10c-2 loop: six `components/panels/*.test.tsx` (the eight scoped `toContain` assertions, plus
`safety-panel.test.tsx`'s ninth from the reconcile phase), `lib/format.ts` (the nine `UNIT_*`
constants), `lib/collectors/errors.ts` and `lib/collectors/serving.test.ts` (comment corrections
only), and three `pipeline/steps/*/regressions.py` (steps 2, 3 and 10). Untracked: the four
`lib/*.test.ts` guards, `pipeline/handoffs/10c2-*.md` and
`pipeline/steps/10-panels-assembly/10c2-{build,test,adversarial,reconciliation}.md`.
⚠ **`lib/collectors/errors.ts` and `lib/format.ts` are intended edits, NOT stranded mutations** —
`errors.ts` is a step-4 mutation target (`04-T26`) and has exactly that signature in
`git status`; both diffs were read line by line and step 4's harness re-run clean.
**A phase agent stages nothing** (`ANCHOR.md` §8), and its green is not the green — the parent
re-runs `pnpm verify` itself.

**`dashboard/` has been committed since step 8.** Nothing has been pushed.
That was the owner's call, taken on step 8's review recommendation (S14): a commit point
*before step 9* rather than before step 11, with **revert integrity** as the stated reason —
`git status` could not previously see a source file a killed harness left mutated. It also
restored `git grep` over this tree. **The next commit point is the owner's call**; `PLAN.md`
and the repo's own `CLAUDE.md` both say commits happen only when asked.

`dashboard/.gitignore` covers `*.tsbuildinfo` and `coverage/`. **`AGENTS.md` and `CLAUDE.md`
inside `dashboard/` are deliberately NOT ignored** — `next dev` rewrites them on every run, so
ignoring them means permanent untracked churn no `git status` will surface. `AGENTS.md` is
marker-delimited so project notes added outside the markers survive.

| | |
|---|---|
| Dev machine | macOS. **Node v24.16.0 (nvm) and v26.8.1 (`~/.hermes`) both installed** — §1 decides which one runs. pnpm 12.3.4 via corepack at `~/.local/bin`. **No Docker** |
| Target | `ai-server` at **192.168.4.71**, `ssh ai-server`. **Node absent, Docker absent** |

The box is reachable over SSH and **read-only queries against it are legitimate evidence** —
step 2 settled a finding with three `nvidia-smi` queries, step 3 captured every `/proc` and
`coretemp` fixture with `cat`, step 4 measured `pwm5`'s errno with a read-only `python3 -c`, and
step 5 replayed its own D-Bus frames at the live system bus. **Invariant 2 still holds: nothing
writes to the server** — no `systemctl`, no hwmon write, no `set-model`, no `LoadUnit`, and
`/v1/chat/completions` has never been called. **Steps 6, 7 and 8 needed the box for nothing, and
step 9 needs it for nothing either**: every primitive is a pure function of a snapshot.

⚠ **`ufw` now enforces on the box** (`ENABLED=yes`, verified 2026-09-06). **Port 8090 has no
allow rule**, so the dashboard will be unreachable until step 12 adds one. **Do not add it now**,
and when the time comes, add it the 2026-09-04 way: `sudo ufw show added` first, from a session
that stays open, because enabling ufw without a rule for port 22 locked this box out once
already and a Precision 5820 has no BMC.

The repo root's `CLAUDE.md` carries the hardware history behind every rule here — the 5-fan DKMS
module, the POST hang, the closed-loop-on-tach EC, the ufw incident that `ufwEnforcing` exists to
catch, and the SSH lockout that followed it. Read the *Serving* and *Server Administration*
sections if a decision here looks arbitrary; they are the reason these panels exist.
