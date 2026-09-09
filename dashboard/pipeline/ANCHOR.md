# ANCHOR — resume point for the ai-server dashboard build

**Written 2026-09-07 by the session that ran steps 1–8, and updated when step 8 closed. It is
the only inheritance: the next session has no memory of that conversation.** Read this file,
then `PLAN.md`, then `HANDOVER.md`, then `SPEC.md`. Everything below is fact unless marked
otherwise.

---

## 1. What this project is

A read-only web dashboard for `ai-server` (the Dell Precision 5820 documented in the repo
root `CLAUDE.md`), showing GPUs, host, cooling, inference endpoints, disk/network and a
SAFETY panel of things that fail silently on that box.

| Artefact | Role |
|---|---|
| `dashboard/SPEC.md` | **1290 lines. Authoritative.** Every decision, with reasoning. Cite section numbers |
| `dashboard/MOCK.html` | Visual reference, four states. **A reference, never a source.** Do not import from it |
| `dashboard/pipeline/PLAN.md` | The 12 steps, the four-phase protocol, the **seven global invariants** |
| `dashboard/pipeline/HANDOVER.md` | Rewritten by each reconciliation. **The authoritative list of open obligations** |
| `dashboard/pipeline/steps/NN-*/` | `build.md`, `adversarial.md`, `review.md`, `reconciliation.md`, `regressions.py` per step |

The spec was hardened by the build itself: **roughly 100 defects were found in it** by the
adversarial and review phases and fixed before they became wrong code. Several were serious
(a dead GPU fan rendering green; the header going green while a card sits at 90 °C).

---

## 2. State — READ CAREFULLY. Updated 2026-09-08 by 10c-1's reconciliation.

**Steps 1–8 are closed and verified. Step 9's full loop is closed. Q1 and Q2 are closed.
Step 10 is UNDER WAY: 10a — the shell — is closed, 10b — the nine panel bodies — is closed,
10b-S-G (the owner's `errors[].instance` ruling) is closed, and **10c-1 — the wiring — is closed**.
⚠ 10c was cut into three: **10c-2 (guards) is next, then 10c-3 (sizing/visual)**, and step 10
closes with 10c-3.** Steps 11–12 have not started.

### ⚠ The backend has LANDED ON `main` — 2026-09-07. Two branches remain.

```
main                 3f06e98   local ahead of [origin/main]   backend merged, fast-forward, NOT PUSHED
dashboard-backend    3f06e98   [origin/dashboard-backend]     == main. Finished; nothing more goes here
dashboard-frontend   391d17f   3 commits ahead of main        LOCAL ONLY, never pushed
```

The merge was a clean fast-forward — `dashboard-backend` had 18 commits and `main` had none of
its own — touching only `dashboard/` and the root `.gitignore`. **`main` and `origin/main` have
diverged until somebody pushes**, and `git push` is gated here and was not asked for.

`dashboard-backend` is now redundant with `main` and carries **zero UI**: no `components/`, no
`steps/09-ui-primitives/` (verified by `git ls-tree`, 2026-09-07). The split the previous session
made by soft reset held. Do not add to that branch; if UI ever appears on it, that is the same
mistake recurring.

**`dashboard-frontend` is the working branch.** It carries `components/` and step 9's harness and
nothing else; the spec, the collectors, the client runtime and every earlier harness live on
`dashboard-backend` and arrive here by inheritance. **Do not commit UI to the backend branch** —
that mistake was made once and had to be split apart with a soft reset.

⚠ **Pushing `dashboard-frontend` needs the owner's approval** — `git push` is gated by a
permission classifier in this environment and was refused once before the owner allowed it.

### What exists

| | |
|---|---|
| steps 1–8 | closed. **710** mutations across seven harnesses, every one biting (was 705; Q1 added four) |
| step 9 | **closed** — build → test → adversarial → reconcile, 25 findings adjudicated |
| **Q1** | **closed 2026-09-07** — the ledger scanner, seven findings adjudicated. §2.2 |
| **Q2** | **closed 2026-09-08** — §6.2's hover layer + table view, 13 findings adjudicated. §2.2 |
| **10a** | build → test → adversarial → **reconcile done 2026-09-08**, 18 findings adjudicated; **the parent's review is the phase that closes it** (§8). §2.2 |
| **10b / 10b-S-G** | closed 2026-09-08 — 14 and 11 findings adjudicated. §2.2 |
| **10c-1 — the wiring** | **closed 2026-09-08** — the nine panels mounted, `PanelPlaceholder` deleted, Q2-S2's toggle housed in `app/`, 10a-F4's alarm-forcing hatch built. **12 findings adjudicated: 10 accepted, 0 rejected, 2 deferred.** §2.2 |
| suite | **95 files · 2627 tests · `pnpm verify` exit 0** (10c-1, 2026-09-08; was 93 · 2594 after 10b-S-G) |
| step 9's harness | **95** mutations, ledger clean over its ⚠ marks |
| step 10's harness | **168** mutations · **196** ⚠ marks — new in 10a (70/86), grown by 10b, 10b-S-G and 10c-1. The first harness to mutate a CSS file |
| all **nine** harnesses | **977 mutations · every harness exit 0** — 714 across steps 2–8 (step 5 is **130**, step 8 **174**, both grown by 10b-S-G), 95 in `components/`, **168** in step 10's. ⚠ Steps 2–9's figures are carried from 10b-S-G's derivation; step 10's is 10c-1's own harness output |
| the box | **running the backend natively**, see §2.1 |

### 2.1 ⚠ The backend is DEPLOYED and running on `ai-server` right now

Not §2.5's container — a native run, put there deliberately as the cheapest thing that exercises
the real endpoint. **Node 24.16.0 in `~/.local/node24`** (checksum-verified), source at
`~/aid-deploy`, serving **`127.0.0.1:8090` only**, so ufw is untouched and nothing is exposed.

```bash
pnpm probe          # from dashboard/ on the Mac — validates + renders the live snapshot
```

It last read **zero `errors[]`** with all 25 conditions banding normal. ⚠ **It is serving commit
`b3969cd` and is now behind** — it has O19, D4 and D5 but not the time formatter or S11/G5.
Redeploy with `git archive HEAD:dashboard | ssh ai-server '…'` — **deploy a commit, not a working
tree**, or you ship whatever an agent happens to be mid-edit on. Full account in
`pipeline/FIRST-DEPLOY.md`. Everything is under `~`; `rm -rf` undoes it.

⚠ The deployed password is `dashboard1`, set for testing. Step 11 replaces it properly.

### 2.2 ⚠ What to do next — **10c-2, the guards**, then **10c-3, sizing and visual**

### ⚠ 10c-1 — THE WIRING — is CLOSED, 2026-09-08. Two loops remain in step 10.

SCOPE §5's third loop was cut into three when it turned out to be three unlike jobs. **10c-1
(the wiring) is done**: the nine real panels are mounted in `app/dashboard-shell.tsx`,
`PanelPlaceholder` is deleted, Q2-S2's chart/table toggle has a shell-owned home, and 10a-F4's
alarm-forcing escape hatch exists. Build → test → adversarial → reconcile are done and §8's fifth
phase (the parent re-runs `pnpm verify`, audits the adjudication table, spot-checks, commits) is
what closes it. **12 adversarial findings adjudicated: 10 accepted, 0 rejected, 2 deferred.**
See `pipeline/steps/10-panels-assembly/10c1-reconciliation.md`.

**Suite after 10c-1: 95 files · 2627 tests · `pnpm verify` exit 0. Step 10's harness at 168
mutations · 196 ⚠ marks** (138 before this loop). The other eight harnesses are untouched, and
that was established by grepping every `pipeline/steps/*/regressions.py` for each file 10c-1
changed — step 8's sole hit is a docstring mention, not a ledger entry or an anchor. ⚠ Their
counts are carried forward from 10b-S-G's derivation and were **not** re-derived here.

| loop | contents | state |
|---|---|---|
| **10c-1 — the wiring** | mount the nine, the toggle's home, the alarm-forcing hatch | ✅ **closed 2026-09-08** |
| **10c-2 — the guards** | `10b-F1-guard` (the document-wide `toContain` lint) · **Q1-F4** (the cross-harness `LEDGER_FILES` runner) · **L11** (the unit-name constant) · **S-G-A11** (`exactOptionalPropertyTypes`, measured free) · **10a-F17** (`pnpm verify`'s non-determinism) · **`10c1-A8-audit`** (every `styles.X` against its sibling stylesheet) | **NEXT** |
| **10c-3 — sizing and visual** | **L9** · `10b-F14b` (no gap hatching at 1280–1599px) · SCOPE 2.5f's `max-height: 100%` · **Q2-F9**'s clamp-vs-drop · **10a-F4**'s remaining half (the seven viewport measurements, headless) · the banner-item wrapping question | after 10c-2 |

**Why this order.** 10c-2 is entirely mechanical — no browser, no design decision, and every item
is a guard that would have caught something this project has already shipped. 10c-3 needs a real
browser and at least one sizing decision the spec leaves open, so it wants to see what the
composed page actually is. ⚠ **Scope 10c-3 to PAINT.** `10c1-A9` established three tiers: binding
is observable in jsdom today, a dangling CSS reference is statically checkable with no runtime
(that is 10c-2's `A8-audit`), and only cascade/specificity/media-queries/overflow/stacking need a
browser. Asking the browser step to carry the other two makes it slower and no better.

**⚠ The four things 10c-2 and 10c-3 must inherit as fact from 10c-1, not rediscover:**

1. ⚠ **A fixture whose two subjects are identical cannot discriminate between them.** The
   two-GPU test helper built card 1 as `{ ...gpu0, index: 1 }`, so three separate
   positional-indexing defects (`serving[i]`, `gpus[i]`, a trace lambda hard-coded to card 0)
   were observationally identical to correct code. Four wrong edits shipped at once with
   `pnpm verify` at exit 0 across 94 files / 2617 tests. **Fixture presence is not fixture
   power.** The sibling rule: an assertion whose subject does not render cannot fail either —
   two toggle tests asserted GPU 1's independence while GPU 1 rendered §6.5's takeover.
2. ⚠ **Both collectors return SPARSE collections and their own source says so.**
   `llama.ts:61 discoverInstances()` returns the sorted **set** of found instance indices;
   `nvidia-smi.ts:147` skips a row whose `index` will not parse. **Index by the `index`/`instance`
   field, never by array position.** A hard-coded `=== 0` was already caught; only positional
   escaped.
3. ⚠ **A `.module.css` import under Vitest is a Proxy, not `{}`.** `Object.keys` is `[]` — hence
   `console.log` printing `{}` — but `styles.gpu0` returns `_gpu0_e75739`. `grid.test.tsx`'s
   tier-2 placement guard and the sticky-band assertion are **live**, and acting on
   `10c1-test.md` §1.2 as originally written would have weakened them; that document now carries
   a marked correction. **The real void is that every key resolves, including keys with no rule**
   — which is what `10c1-A8-audit` is for. Probe a property access, never the object.
4. ⚠ **The chart/table toggle is shell state, one entry per chart-bearing panel**, and the
   control renders beside each chart because §6.2 says the header list is exhaustive.
   **Granularity — one toggle per panel, governing every chart it draws — is an invariant-7
   recording, not a spec ruling** (`chart-view-toggle.tsx`'s module doc). A future panel wanting
   independent toggles is a new decision, not an extension of this one.

### ⚠ 10b-S-G is CLOSED, 2026-09-08 — it was the last item before 10c.

The owner's ruling that `errors[]` gains an optional `instance` is built, tested, attacked and
reconciled: build → test → adversarial → reconcile are done and §8's fifth phase (the parent
re-runs `pnpm verify`, audits the adjudication table, spot-checks, commits) is what closes it.
**11 adversarial findings adjudicated: 6 accepted (3 in part), 1 rejected, 2 deferred.** See
`pipeline/steps/10-panels-assembly/10b-sg-reconciliation.md`.

**What it changed, as fact for 10c:** `TelemetryError` carries `instance?: number` — the
contract's **first and only optional member**, pinned by a dedicated `types.test-d.ts` census so a
second one is still a compile error. The `errors[]`→`llama-server` join is **structural**: no
panel reads message text to decide attribution any more. It is **additive on the wire**, so an old
server's snapshot still validates and every entry simply falls back to panel-level rendering — the
redeploy is needed for the feature to *work*, not to avoid a refusal (unlike O19).

**Four things 10c inherits from it, and one is a rule:**

1. ⚠ **A mutation harness proves every ⚠ test CAN fail; it never proves every branch HAS one.**
   `namesInstance` had two call sites and one mutation. Deleting the unmutated filter left
   `pnpm verify` green at 93 files / 2587 tests while the panel printed every attributed message
   **twice**. **Grep for a function's other call sites before believing the mutation named for
   it**, and make a test whose name says "once" **count** rather than `toContain`.
2. ⚠ **Adding a discriminator obliges you to every consumer.** `panelsForSource('dbus')` reaches
   COOLING, SERVING and SAFETY; S-G taught one of the three. Fixed for the entries that name an
   instance; ⚠ **entries with NO instance are still ambiguous** (bus-wide vs `collectSafety`'s own
   per-unit failure) — `HANDOVER.md` §8's **S-G-Q2**, the owner's.
3. **Four new spec questions** — S-G-Q1…Q4 in `HANDOVER.md` §8 — none implemented, each naming
   the code that stands today. S-G-Q1 (only the last of several entries from one source about one
   instance is rendered, anywhere) is the one with a live consequence on this box.
4. ⚠ **`exactOptionalPropertyTypes` is off**, so `{...base, instance: maybeUndefined}` typechecks
   with the key present — assert absence with `Object.hasOwn`, never `?.field === undefined`.
   Measured 2026-09-08: `npx tsc --noEmit --exactOptionalPropertyTypes` **exits 0 on this tree**,
   so turning it on is a one-line change with no migration. 10c's, and it gets less free with time.

**Suite after S-G: 93 files · 2594 tests · `pnpm verify` exit 0. Nine harnesses · 947 mutations**
(step 5 → 130, step 8 → 174, step 10 → 138).

**10b — the nine panel bodies — is CLOSED, 2026-09-08**, once the parent's review passes:
build → test → adversarial → reconcile are done, and §8's fifth phase (the parent re-runs
`pnpm verify` itself, audits the adjudication table, spot-checks, commits) is the one that closes
it. **14 adversarial findings adjudicated: 11 accepted, 1 accepted in part, 2 deferred, 0
rejected outright.** See `pipeline/steps/10-panels-assembly/10b-reconciliation.md`.
**10a — the shell — closed the same way on 2026-09-08** (18 findings: 16 accepted, 2 deferred,
1 half-rejected; `10a-reconciliation.md`). SCOPE §5's three-loop cut (10a → 10b → **10c**) is
being followed and 10c is the last of the three.

| | |
|---|---|
| what exists | 10a's shell — §6.2's header, §6.4's sticky banner, §6.1's grid + breakpoints, `app/dashboard-shell.tsx` — **plus 10b's nine panel bodies** under `components/panels/`, with `status-row.tsx`, `panel-notes.tsx`, `condition-lookup.ts`, `panel-chart.ts`, `event-sentence.ts` |
| ⚠ what does NOT exist | **the wiring.** `dashboard-shell.tsx` still renders nine `PanelPlaceholder`s; the panels have **no production call site**, so nothing yet proves the nine compose. That is 10c's first job, and `<GpuPanel {...props} />` takes **no `index`** |
| closed obligations | 10a: **D2**, **D6**, **O2**, the 2.5a wrapper, 2.5d's id namespace. 10b: **O12**, **O13**, **O3**'s rule, **D3** (`unknownStanding`), **S11/G5**'s panel residue |
| suite | **93 files · 2594 tests · `pnpm verify` exit 0** (was 92 · 2559 after 10b; 79 · 2399 after 10a) |
| harnesses | **NINE · 947 mutations.** `pipeline/steps/10-panels-assembly/regressions.py` covers both loops — **138 mutations** (129 after 10b, 70/86 after 10a). Step 5 is **130**, step 8 **174**, both grown by 10b-S-G |

**⚠ The four things 10c must inherit as fact, not rediscover:**

1. **The hook boundary is settled.** `components/` is hook-free (`purity.test.ts`, unweakened —
   and it now recurses over `components/panels/` too); hooks live under `app/`; there are exactly
   two and both are called once, in `app/dashboard-shell.tsx`. **The nine panels are pure
   functions of props**, which is why the chart/table toggle and the age tick live in `app/`.
2. **`components/panel-props.ts` is a REAL type** — `PanelProps { state, nowMs, panelId }`.
   ⚠ `GpuPanel` narrows `panelId` to `'gpu0' | 'gpu1'` and **derives** its card index from it;
   the old separate `index` prop is gone, because two independent copies of *which card am I*
   typechecked while disagreeing and rendered GPU 0 into the `gpu1` slot (10b-F12).
3. ⚠ **`pnpm verify` is NOT deterministic today** — `lib/collectors/serving.test.ts:592` races a
   real 95 ms sleep against a real 100 ms budget, and a probabilistic ⚠ test can be falsely
   credited by **any** harness ledger. `HANDOVER.md` §0.3. Still **10c's**; do not debug a single
   red run on that test before re-running it.
4. ⚠ **A document-wide `toContain` is a weak assertion wearing a strong name — three instances
   in three loops** (10a's `paused`, its test phase's `refresh`, 10b's `—`, the last of which sat
   in the ⚠ test named for `PLAN.md`'s FIRST invariant and passed while the panel printed
   `fan 5  0 RPM` for a fan nobody could read). `HANDOVER.md` §0.4. **Assert over the element
   that carries the claim, never over the document that contains it.** A mechanical guard
   forbidding the shape is 10c's (`10b-F1-guard`).

**⚠ Two findings from 10a's loop worth carrying into every later step**, because both shipped
green and neither is specific to this code:

- **A mutation harness over the parts does not cover the join.** `header-status.ts` and
  `header.tsx` were each thoroughly tested in isolation while the shell that feeds them was
  executed by nothing — so hard-coding `mode={'live'} alarms={0}`, inverting pause/resume and
  killing the cadence handler left `pnpm verify` at exit 0 across 77 files, on a build that can
  never say "paused" and reads `● all healthy` on six alarms. That is `PLAN.md`'s own green
  criterion for step 10, unable to fail. Same shape as Q1's finding, one level up.
- **A test that asserts a marker attribute is not testing what the CSS keys on.** `grid.test.tsx`
  asserted `data-slot`, which no stylesheet reads, while placement is bound by
  `className={styles.X}` — rewiring COOLING into the log's grid area was 19/19 green with `tsc`
  clean, and the describe was *named* "the `data-slot` the layout CSS keys on".

**Q1 is CLOSED, 2026-09-07** — build → test → adversarial → reconcile, seven findings adjudicated
(six accepted, one deferred, none rejected). See
`pipeline/steps/Q1-ledger-scanner/reconciliation.md`.

**Q2 is CLOSED, 2026-09-08** — build → test → adversarial → reconcile, **13 findings adjudicated
(ten accepted, two rejected, one split accept/defer)**, plus the parent's review. §6.2's hover
layer and table view now exist on both chart primitives. See
`pipeline/steps/Q2-hover-and-table/reconciliation.md`; the suite is **67 files · 2260 tests** and
the `components/` harness is **95 mutations · 105 ⚠ marks**.

### ⚠ Q2's two spec questions are ANSWERED and IMPLEMENTED — 2026-09-08. Step 10 is NOT blocked.

The owner ruled on both, the parent wrote the wording into `SPEC.md` (three amendments — §6.2,
§6.1 and §9's decision row), and the code half is in. **`SPEC.md` has now been amended by the
owner's ruling for the second time in this project; it is not frozen.**

- **Q2-S1 — the crosshair's tooltip discharges the per-mark requirement on line and area plots.**
  They cannot both be reached: a full-body crosshair needs hover zones tiling the plot, and those
  zones necessarily occlude every mark beneath them. §6.2's "per-mark on bars and dots" clause now
  **scopes to bar and dot charts**, which `components/` does not contain — so it goes live when one
  is built rather than standing as permanently unmet. The per-mark `<title>`s stay: correct markup,
  no cost, reachable again if paint order ever changes. **No code change was needed.**
- **Q2-S2 — the table view scrolls inside its own container** (`max-height` + `overflow-y`).
  §6.1's promise governs the **page**, not every component, and the spec already specified the
  session event log as "a compact scrolling list"; §6.1 now says that outright, because the
  implicitness is exactly what made this read as a violation rather than a design choice.
  ⚠ **Capping or decimating rows was considered and REJECTED** — a decimated table is no longer a
  complete substitute for the chart, which is both the ground on which it is an accessibility floor
  and the ground on which `build.md` §3.6 declined keyboard parity. **Every row stays in the DOM.
  Do not re-propose a cap.**

**What step 10 inherits from S2, and owes:** `--table-scroll-max: 40vh` in `tokens.css` is a
**viewport-relative stopgap, not a considered layout value**. §6.1 says sizing is the grid's
decision and step 9 deferred the sparkline's sizing (L9) for the same reason. When a panel body
has a real bounded height, replace it with `max-height: 100%`. It is recorded as owed rather than
left looking deliberate.

Also from S2, worth copying rather than re-deriving: the scroll container is a **keyboard tab
stop** (a scrollable region only a mouse can reach fails the floor it exists to hold up), sticky
headers need **`border-collapse: separate`** to work around a WebKit bug where sticky table cells
do nothing under `collapse`, and **the CSS was verified in a real Chrome browser** rather than
asserted. That last one is the standing answer to this area's recurring problem: `:hover`,
`position: sticky` and `overflow` are **not observable in jsdom**, so a passing suite says nothing
about whether any of it works. Open a browser.

### The queue

**10c-2 is next and nothing blocks it.** ⚠ **Updated 2026-09-08 by 10c-1's reconciliation** —
this list was originally written before 10a and most of it is now closed. The wiring is done;
below is what is left, and `HANDOVER.md` §9 is the authoritative form of it.

| item | owner |
|---|---|
| ~~wire the nine panels into `app/dashboard-shell.tsx`~~ · ~~Q2-S2's toggle needs an `app/` home~~ · ~~10a-F4's alarm-forcing hatch~~ | ✅ **closed by 10c-1** |
| **10a-F17** `pnpm verify`'s non-determinism · **Q1-F4** the cross-harness ledger runner · **10b-F1-guard** the document-wide-`toContain` lint · **L11** the unit-name constant · **S-G-A11** `exactOptionalPropertyTypes` (measured free) · ⚠ **10c1-A8-audit** every `styles.X` against its sibling stylesheet | **10c-2** |
| **L9** sizing (with **10b-F14b**: no gap hatching at 1280–1599px) · SCOPE 2.5f's `max-height` · **Q2-F9** clamp-vs-drop · **10a-F4**'s remaining half (seven viewport measurements, headless) · **O14** the formatter `parts` variant (re-checked by 10b and 10c-1; **still has not arisen**) · whether a banner item may wrap mid-condition | **10c-3**, with a browser |
| **D1** S40's third event-log feed (`LogEntryKind` is `lib/client/events.ts`'s; the panel's exhaustive switch will force the case) | 10c-2 / owner |
| **Q2-S1** the per-mark tooltip clause · **Q2-S2** the table view's height — ⚠ **now reachable**, 10c-1 gave the toggle a home | owner, then 10c-3 |
| **10a-S-A/S-B/S-C/S-D** and **10b-S-E/S-F/S-H** — seven spec questions, five implemented conservatively (**S-G is RULED, implemented and closed**) | **owner** |
| ⚠ **S-G-Q1 · S-G-Q2 · S-G-Q3 · S-G-Q4** — the four questions implementing S-G raised. None implemented; `HANDOVER.md` §8 carries each with the code that stands today | **owner** |
| **S-G-A10** the session log's per-source fold vs the panel's per-instance one | 10c-2 / owner |

~~D2~~ and ~~D6~~ are **closed by 10a**; ~~D3~~, ~~O12~~, ~~O13~~ and ~~S11/G5~~ by **10b**;
the **wiring**, **Q2-S2's toggle home** and **10a-F4's alarm hatch** by **10c-1**.
`D8` remains step 11's. ⚠ **10c-1 raised no new spec question** — its two invariant-7 candidates
(the banner-item wrapping rule, and where an escape hatch's defence belongs) are recorded above
and in `10c1-reconciliation.md` §5 rather than answered.

## 3. Toolchain

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
```

- **The `nvm` path must come first.** `$HOME/.local/bin/node` is a symlink to
  `~/.hermes/node` (**v26.8.1**) and shadows the pin. The image ships `node:24-slim` and
  `.nvmrc` pins 24; testing on 26 is the skew step 1 removed and step 4 found reintroduced.
- `~/.local/bin` is still needed — `pnpm` (12.3.4) lives there, activated via
  `corepack enable --install-directory ~/.local/bin`.
- Dependencies: **`next`, `react`, `react-dom` only**, plus five dev. No native modules. Auth
  uses Node's built-in `scrypt` precisely to keep it that way.

---

## 4. What "green" means, and how to verify integrity

**Green is `pnpm verify` exiting 0. Never a printed summary.** Three separate failure shapes
were found where the counters read clean on a failing run — including one where a
non-compiling test file silently drops its tests from the total. `verify` is
`tsc --noEmit && vitest run` and now runs **cold** (it clears `tsconfig.tsbuildinfo` first,
after a false *pass* was observed on a tree with a real `TS2305`).

### Integrity procedure

**`git status` now works** — the tree is committed (`71a2f7d`), so a stranded mutation from a
killed harness shows as a modified file. That is the primary check; use `git diff --stat`.
Before the commit it did not work, because an untracked `dashboard/` collapses to `?? ./`,
and the phases used an md5 manifest instead. That manifest form still works and is what the
step-8 progress brief references:

```bash
find lib app proxy.ts -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | xargs md5 > /tmp/manifest.before
# ... run phase ...
find lib app proxy.ts -type f \( -name '*.ts' -o -name '*.tsx' \) | sort | xargs md5 | diff - /tmp/manifest.before
```

**Never run `pnpm verify` concurrently with a `regressions.py` harness.** It produces a
plausible false `TS6133` and a ledger that falsely reports ⚠ tests as uncovered. Run serially.

---

## 5. The process

Each step runs **build → adversarial → review → reconciliation**, each phase a **fresh agent
with clean context**, receiving only `PLAN.md`, `SPEC.md`, `HANDOVER.md`, and the earlier
phases' notes for that step.

- **build** implements and writes tests. **adversarial** tries to break it and fixes nothing.
- **review** reads the build *and* the adversarial findings, adjudicates each
  UPHELD/OVERSTATED/REJECTED, and adds its own. **reconciliation** applies what survived,
  rejects the rest with reasons, re-runs everything, rewrites `HANDOVER.md`.
- **The parent (you) owns `SPEC.md`.** Phases record gaps; they never edit the spec. Apply
  accepted wording yourself, then tell the next phase the spec changed.
- A later phase overriding an earlier one **on measurement** is normal and has happened four
  times, including reconciliation correctly overruling its own review.

### The seven invariants (full text in `PLAN.md`)

1. **`null` is not `0`.** `null` renders `—`; zero renders the numeral with its unit.
2. **Read-only.** Nothing writes to the server, ever.
3. **`ENODATA` from `pwm5` means "EC auto", which is HEALTHY.**
4. **`fanN_input` is the only trustworthy fan telemetry** — `pwmN_enable` lies, `fanN_target` clamps.
5. **A failed reading is a partial snapshot plus an `errors[]` entry — never a 500.**
6. **Node 24, TypeScript strict, pnpm, Vitest.** No dependency without recorded reason.
7. **If the spec is silent, STOP and record it.** Do not invent. This is how ~100 gaps were found.

### Structural rules the pipeline learned the hard way

- **Every boundary guard needs a fixture on both sides.** Three steps shipped a guard tested
  in one direction only.
- **Mark load-bearing tests `⚠` and run the red-test ledger** — it records which tests go red
  per mutation and fails if a ⚠ test never reddens. It has found inert tests in every step.
- **A mutation that reddens probabilistically is worse than none** — the ledger cannot tell it
  from a sound one.
- **A test may consume entropy only for an assertion that holds for every value it could
  draw.** A 1-in-16 flake shipped this way.
- **Every `catch` added for a "never throw" rule removes a distinction.** Assert what was
  *written*, not what was *returned*.
- **Guards over globals** (`setInterval`, `fetch`, `document`) are not soundly fixable by
  source text; pair them with a behavioural test. The runtime globals guard also **voids
  itself under `isolate: false`** — which Vitest's own reporter recommends on every run.
- **A test that names a property it does not check has appeared in every single step.** Read
  each test name against its body.

---

## 6. Module map (`dashboard/`)

```
lib/types.ts            the §4 contract; every reading `T | null`; branded units
lib/format.ts           §6.6 formatters        lib/severity.ts   §6.3 bands
lib/throttle.ts         §3.7 mask decoder      lib/conditions.ts §6.4 observePoll (debounce+ledger)
lib/fixtures.ts  lib/units.ts  lib/source-text.ts  lib/guardrails.test.ts
lib/collectors/         io, deadline, numbers, proc, nvidia-smi, deltas, hwmon, dell-smm,
                        cooling, dbus-wire, dbus, llama, http, statvfs, safety-checks,
                        serving, storage, safety, collect, result, errors
lib/telemetry/          cache, gate, ceiling, source, snapshot, handler
lib/auth/               scrypt, base64url, config, cookie, session, revocations,
                        rate-limit, authorize, handler, login-view
lib/client/             prefs, wire, ring, series, backoff, observations, events, env,
                        runtime, use-telemetry, fake-env
app/                    api/telemetry, api/session, login/, layout.tsx, page.tsx
proxy.ts                the auth gate — Next 16 renamed `middleware.ts`; the old name NEVER RUNS
```

---

## 7. Where the open work is recorded

**`HANDOVER.md` is authoritative** for open obligations (`O*`) — it is rewritten each
reconciliation and has been found stale in the *safe* direction three times (entries already
answered by the spec). **Re-check every entry against `SPEC.md` before trusting it.**

Also mine: each step's `review.md` §DEFER table (names an owning step) and each
`reconciliation.md` "new spec gaps for you" section.

⚠ **Beware the id namespaces, and the warning that used to sit here understated the problem.**
It said *"the `S*` namespace is polluted: some `S`-prefixed ids in steps 3–5 are harness mutation
ids, not gaps."* Widened 2026-09-07 by Q1's reconciliation (adversarial F5): the pollution is
**not confined to `S` and not confined to steps 3–5**. `S11/G5` is one open obligation, cited in
this file, `HANDOVER.md`, `WORK-ITEMS.md` and `UI-BACKEND-GAPS.md` — and step 7's harness holds a
mutation id for `S11` *and* one for `G5`. `S12` is both a step-3/5/8 mutation id and a step-5 gap
id. Q1 renamed the one it created (`S11` → `SC1`) and left `G5` alone, because step 7's own notes
cite it. **A grep for an id can land in a harness; read what you hit.** The cheap fix — a
reserved prefix for mutation ids, which are already per-harness scoped — is recorded for the
owner in Q1's `reconciliation.md` §7 and not taken.

A cached extract of the DEFER tables for steps 1–7 may still exist at
`/private/tmp/claude-501/.../scratchpad/defers.md`; regenerate it if not.

### ⚠ S49–S53 are CLOSED — the owner ruled on all five and `SPEC.md` was edited

That was the first time the spec had ever been changed in this project. **`SPEC.md` is no
longer frozen**: the owner delegates wording, and ten edits are logged in
`pipeline/WORK-ITEMS.md` §9. So when the spec is silent, invariant 7 still says STOP and
record — but the recording now has somewhere to go, and the owner answers.

The amendments worth knowing before touching the UI: §6.7's 600-point budget is **per
series**; a stale row's clock is the **browser's** and its value is the **last reading**;
§6.2 gained a panel-head convention (`title · subtitle · chip`), an exhaustive header list, the
GPU↔instance join, and — added late, after step 9's primitives were already built — **a hover
layer and a table view as accepted defaults** (the owner's ruling: *do not fight `dataviz` to
strip its defaults; amend the spec instead*). That last one is why Q2 exists.

**Deferred work items with owning steps** (from step 8's §9.4 list):

- **Backend, still open:** **D8** `STANDING` env plumbing → step 11, verified step 12. ⚠ That is
  now the *only* backend item here — the **red-test ledger retrofit for step 3's harness** was
  listed beside it as "still has none, folded into Q1" and **that was wrong: it was done during
  step 8.** Q1's build phase confirmed it (`LEDGER_FILES` at line 71, a wired-up coverage check,
  a comment at line 43 saying so) and Q1's reconciliation re-ran it clean — 72 mutations, 24 ⚠
  marks, exit 0. Corrected 2026-09-07; also corrected in `WORK-ITEMS.md` §2 (A6) and
  `HANDOVER.md`.
- **Closed 2026-09-07:** ~~O19~~ (GB→GiB, a §4 wire change), ~~D4~~ `errorsForPanel`,
  ~~D5~~ `traceFor`, ~~A6~~ (step 3's ledger retrofit — see above), ~~the six unbacked
  `severity.ts` marks~~. **D7 is narrowed, not closed:** ~~S19~~ and ~~S30~~ are settled in
  `SPEC.md` (lines 1327 and 780, both marked *settled 2026-09-07*), and **S11/G5's collector half
  is settled too** (line 1208 — `collectCooling` files the entry). What remains of D7 is
  S11/G5's **panel-rendering** residue, owned by step 10.
- **Still open for steps 10–12:** D1 S40's third event-log feed · D2 the independent age tick ·
  D3 rendering `unknownStanding` · D6 jsdom + `useTelemetry` unmount · L9 sparkline sizing ·
  L11 the unit-name constant guard.

---

## 8. The plan from here

Steps 1–8's sweep and step 9 are done. The queue is `pipeline/WORK-ITEMS.md` §10 (see §2.2).

### ⚠ The loop the owner wants, and it is not PLAN.md's

Each work item is **one agent loop**, one item at a time, each phase a **fresh agent with clean
context** receiving a written handoff:

| phase | model | runs as | does |
|---|---|---|---|
| **build** | **Sonnet 5, high effort** | subagent | implements + tests. Load the `dataviz` skill for anything with a chart, meter or stat row |
| **test** | **Sonnet 5, high effort** | subagent | reads every test name against its body; fixture symmetry; hunts equivalent and probabilistic mutations |
| **adversarial** | default | subagent | tries to break it, **fixes nothing**, writes findings with concrete failure scenarios |
| **reconcile** | default | **background subagent** — changed 2026-09-07 | adjudicates every finding ACCEPTED/REJECTED/DEFERRED **with reasons**, applies what survives, re-runs everything, writes `reconciliation.md` and rewrites `HANDOVER.md` |
| **review** | — | **the parent, always** — added 2026-09-08 | re-runs `pnpm verify` itself, **audits the reconciliation's adjudication table**, spot-checks its headline claims against the tree, then commits. **The loop is not closed until this runs.** |

### ⚠ PROJECT RULE — the parent reviews every reconciliation. Added 2026-09-08, owner's instruction.

**A reconciliation is not finished when the agent reports. It is finished when the parent has
reviewed it.** This is a fifth phase, it is never delegated, and it is the counterweight to
having moved the reconcile seat into an agent at all.

What the review must actually do — all four, every time:

1. **Re-run `pnpm verify` yourself** on the tree the agent left. Its green is not the green.
2. **Read the adjudication table in full** — every ACCEPTED, REJECTED and DEFERRED row with its
   reason. **Rejections and deferrals are the priority**: an accepted fix leaves a diff you can
   see, a rejected finding leaves nothing at all. A run with *zero* rejections gets the same
   scrutiny, not less — zero is the shape a rubber-stamp makes, so audit the deferrals instead.
3. **Spot-check the headline claims against the tree**, not against the report. Q1's review
   checked the generic-`test.each` syntax at the named line numbers and the duplicate test name
   in both files before believing either. Two `grep`s; it is not expensive.
4. **Then commit**, and say in the message what was verified by the parent versus reported.

**What made Q1's loop work is worth copying:** the parent verified F1 and F2 *itself* before
writing the reconcile handoff, so the agent inherited facts rather than claims, and its handoff
said which was which. Do that — a phase that must re-derive its own inputs spends its budget
there instead of on the work.

### ⚠ Reconciliation moved out of the parent — 2026-09-07, at the owner's instruction

It used to be the parent's own work. It is now **a background subagent like every other phase**,
for one reason: reconciliation is the most context-expensive phase in the loop — it reads the
build, the test pass, every adversarial finding, and the code each finding names, and step 9's
ran to 25 findings. Doing that in the parent burned the session that has to survive the *whole*
queue. The parent now spends its context on judgment and sequencing, not on re-reading.

**What the parent keeps, and must not delegate:**

1. **Green.** `pnpm verify` exiting 0, run *by the parent*, on the tree the agent left behind,
   before any commit. §4 and §9 both say this and they were written because an agent claimed
   green on a failing tree. A background agent reporting "verify passes" is a claim, not
   evidence.
2. **The commit.** Repo convention is commit-only-when-asked (root `CLAUDE.md`), and every
   reconciliation so far has been an explicit ask. The agent stages nothing.
3. **`SPEC.md`.** Unchanged from §5 — phases record gaps, the parent writes wording. A
   reconciliation agent that wants a spec change says so in its report.
4. **Audit of the adjudication table.** Read every REJECTED and DEFERRED row and its reason.
   Accepting a fix costs a diff you can see; rejecting a finding costs nothing visible, which
   makes rejection the failure mode to check.

**The honest cost of this change.** The parent's judgment in the reconcile seat was load-bearing:
this project has a reconciliation correctly overruling its own review, and four occasions where
an agent corrected the parent and was right. Moving the seat to an agent means the parent
*audits* an adjudication it did not produce — weaker than producing it, and the mitigation is
rule 4 above, not optimism. If a reconcile agent's rejections start reading thin, pull the phase
back into the parent for that item and say so here.

**Mechanics.** Spawn it with `Agent`, and let it run in the background — do not block on it. The
handoff must name: the item, the branch (`dashboard-frontend`), the files in play, the phases'
notes to read, **what the parent has already verified** (§8's rule below), and the four
non-delegable items above so the agent does not commit or edit `SPEC.md`. It reports back a
summary; the transcript stays out of the parent's context, which is the entire point.

**Handoffs live in `pipeline/handoffs/`.** Write one before spawning; the agent's quality tracks
the handoff's. The step 9 handoff is the model to copy.

⚠ **Write down what you have already verified yourself**, so the agent does not re-litigate it —
and be honest when the agent corrects you. It did, four times this session, and every correction
was right.

### ⚠ Scope — the backend-only constraint is LIFTED, and a new one replaces it

Steps 1–8 are closed, so the old "do not touch steps 9–12" rule has expired. **The live
constraint is the branch**: UI work belongs on `dashboard-frontend`, and nothing outside
`dashboard/` changes. Q1 is the exception worth naming — it edits the *harnesses* of steps
2–8, which live on the backend branch's history but are inherited here; do it on
`dashboard-frontend` like everything else and let the merge sort it out.

Invariant 7 still binds: **if the spec is silent, STOP and record it.** What changed is that
recording it now leads somewhere — see §7.

---

## 9. Standing constraints

- ⚠ **Mutation ids carry their creating step's id as a prefix** — `07-R3`, `Q1-SC1` — added
  2026-09-08 at the owner's instruction. The bare namespace collided with the gap/work-item
  namespace: `S11` and `G5` were each simultaneously a step-7 mutation id and half of the open
  `S11/G5` work item, and `S12` collided too. §7's old warning that "the `S*` namespace is
  polluted" understated it — it was never confined to `S`, nor to steps 3–5. The prefix is the
  **creating** step, not the harness the mutation currently lives in, so it never changes.
- **Commit only when asked** (repo convention, root `CLAUDE.md`). Each reconciliation has been
  an explicit ask; `git push` is separately gated and needs its own.
- **The server `ai-server` is reachable over SSH and is read-only to this work.** Reads are
  encouraged — several findings were settled by measuring the real box. **Never write to it**:
  no `pwmN`, no mutating D-Bus call (`LoadUnit` is forbidden — `GetUnit` is the read-only
  one), no `/v1/chat/completions`.
- **`ufw` now enforces on the box** (`ENABLED=yes`, verified 2026-09-06). Port **8090 has no
  allow rule**, so the dashboard will be unreachable until step 12 adds one. Do not add it now.
- Nothing outside `dashboard/` should change, except the root `.gitignore` (already modified).
- **`pnpm verify` exiting 0 is the only definition of green.** Not a printed summary, not an
  agent's report. Re-run it yourself before every commit — an agent has claimed green on a
  tree that failed.
- **Never `sleep`-poll a background harness.** `until ! pgrep -f regressions.py` never exits:
  the pattern matches the waiting shell's own command line. Write `pgrep -f "regressions[.]py"`.
- ⚠ **THE BRACKET IS NOT ENOUGH, and this cost five hours on 2026-09-08.** `regressions[.]py`
  stops the pattern matching *itself*, but a wait loop written as part of the **same `bash -c`
  string** that also ran the harness has the literal text `python3 …/regressions.py` in its own
  command line — so `pgrep -f` matches the waiter, and it spins forever. Two shells sat in that
  state for five hours with **no harness running at all**; the tell is `pgrep` matching while
  `pgrep -fl "vitest|node"` shows no child doing work. It was written into a subagent handoff by
  the parent, who had quoted the bracket rule while introducing the very bug it warns about.
  **The fix is to not wait at all**: run harnesses as plain sequential foreground commands in one
  call — `python3 …/07.py; python3 …/08.py` — which are serial by construction and need no poll.
  If you must poll, poll from a shell that has never mentioned the harness.
  Seven orphaned shells were found this way.
