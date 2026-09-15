# 12a — ADVERSARIAL. **The shim is honest; the two new records are falsifiable; but 15d and 16 print nothing when green, and §11.4 has a ninth arm that scores a tick.**

**Written by the ADVERSARIAL phase, 2026-09-15.** Branch `dashboard-frontend`, working dir
`dashboard/`. **Nothing fixed, nothing committed, nothing deployed, nothing written to the box.**
Every deliberate break was made, measured, and reverted byte-for-byte from copies in the
scratchpad; `git status` at the end is the eleven modified + two untracked files this phase
inherited, plus this file.

Four full `measure-breakpoints.mjs` runs were made, strictly one at a time, never beside
`pnpm verify` or another harness. Logs: `…/scratchpad/adv-R1.log` … `adv-R4.log`. The test
phase's own green baseline (`breakpoints4.log`, 67/0/0) and its two red ones
(`breakpoints2/3.log`) were still on disk and are used as the control.

---

## 1. Findings

### ⚠⚠ 12a-A1 — **15d and 16 print NO numbers when they pass, and §1.4's numbers were transcribed from the run where the record FAILED.** Severity: HIGH (a standing measurement that says nothing while standing). *Measured.*

`measure-breakpoints.mjs:2063-2124` prints a PASS's `detail` only when it carries one of eight
recognised shapes — `spare`, `heights`, `gridOpen`, `boundary`, `bands`, `tightest`,
`clippedRings`, `scrolling`, `unreadable`. Record **15d**'s detail is
`{text, textWidth, headerHeight, oneRow, children, tops, dotSeverity, calibration}` and record
**16**'s is `{gpu0Takeover … gpu0Sample}`. **Neither matches any of the eight**, so both print a
bare `PASS` line and nothing else. Confirmed in the test phase's own green log:

```
PASS     15. 12a’s status line at its CEILING — … and a longer string really would break it
PASS     16. the RETIRED fixture TOOK — both cards draw the takeover, both say WHY, …
```

— two consecutive lines, no detail between them (`breakpoints4.log:106-107`).

That is the rule the same file states three times in the printer it sits in: *"a PASS that is a
measured EQUALITY has to print the value it is equal to … a bare PASS on either is a claim with
no number behind it: the next loop would have to re-run the browser to learn what the height
WAS"* (`:2069-2072`), and again for the band and for the clipping margin.

**And it already bit.** `12a-test.md` §1.4's table — *status text 208.6 px, header 43.0 px,
absurd string 98.1 px* — does not appear in the green run at all. It appears verbatim in
`breakpoints3.log:120`, the run where **15d FAILED**:

```
FAIL     15. 12a’s status line at its CEILING …
  {"text":"529 alarms · 18 sources unread","textWidth":208.6,"headerHeight":43,"oneRow":false,
   "children":5,"tops":[11.4,21.5,10.1,14.1,10],"dotSeverity":"alarm",
   "calibration":{"oneRow":false,"headerHeight":98.1}}
```

So the record's own standing numbers are currently readable **only by breaking it**, and the
numbers now written into the phase notes were taken from a run whose metric the phase then
changed (`children:5` there, 4 in the repaired metric — see R3 below). The *values* quoted are
not wrong; the *provenance* is a failing run, and nothing in a green run can reproduce them.
Measurement 16's `84 px` survives only by luck: it is carried by `recordFit`'s `slotHeights`,
which is one of the eight recognised shapes.

⚠ Note the shape of the trap: the printer is a **whitelist of detail keys**, so every future
record added with a new detail shape is silently a bare PASS. Nothing warns.

### ⚠⚠ 12a-A2 — **§11.4's ninth arm: two `RC=` markers whose LAST one is `0` scores a green tick**, and two more arms behind it. Severity: HIGH (a false green on the one row that exists to catch a false green). *Measured.*

`dashboard.sh:2249` still takes `${out##*RC=}` — *everything after the **last** marker*. The
eighth-arm fix (`:2271-2275`) constrained the token's **shape** and left the choice of **which
marker** untouched. Probed by sourcing `dashboard.sh` with `DASHBOARD_SH_LIB=1` and a stubbed
`docker` (`…/scratchpad/adv9/`), one real bash subprocess per case:

| `.HostConfig.DeviceRequests` | `docker exec` printed | `rc` | row today |
|---|---|---|---|
| `[{"Driver":"nvidia"}]` | `RC=255\nRC=0` | `0` | **✓ "the container ran nvidia-smi and read the cards"** |
| `[{"Driver":"nvidia"}]` | `RC=0\nRC=255` | `255` | ✗ the production FAIL |
| `[{"Driver":"nvidia"}]` | `RC=0 RC=255` (one line) | `255` | ✗ the production FAIL |
| `[{"Driver":"nvidia"}]` | `RC=127` | `127` | ✗ the production FAIL, *"Fix: sudo ./dashboard.sh restart"* |
| `[{"Driver":"nvidia"}]` | `RC=126` | `126` | ✗ same |
| `[{"Driver":"nvidia"}]` | `RC=300` | `300` | ✗ same |

Three separate defects fall out:

1. **Last-marker-wins resolves the ambiguous case toward the tick.** Anything that emits a
   second marker after the real one — an `ENV`/profile in the image, a shell exit trap, a
   `docker exec` that retried, an operator's own instrumentation — turns a genuine `255` into
   `✓ read the cards`. This is the *same* family as the eighth arm (a marker that is not a
   verdict) approached from the other side, and the eighth-arm fix's own reasoning
   (*"a marker is not a verdict unless an exit status came with it"*) does not cover it:
   here **two** exit statuses came with it and the row silently prefers the later. The safe
   reading of two disagreeing markers is `noexec`/unknown, which the guard already has.
2. **127 and 126 are the SHELL's statuses, not nvidia-smi's** — *command not found* and *not
   executable* — and both are diagnosed as *"THE CONTAINER CANNOT SEE THE GPUs … Fix: sudo
   ./dashboard.sh restart"*. A restart cannot put a binary into an image. The `gpu:*` arm
   cannot distinguish "the NVIDIA runtime did not inject `nvidia-smi`" (a toolkit/install
   fault) from "the devices were revoked" (the 2026-09-14 fault), and prescribes the second
   fix for both.
3. **`nvidia-smi -L >/dev/null` throws the list away, so a container that talks to the driver
   and enumerates ZERO cards is `RC=0` → ✓ "read the cards".** That is precisely the shape
   `gpus: []` — the shape measurement 16 was added this phase to grade in the browser, and the
   one §9 calls *retired*. The row's sentence claims it *read the cards*; the only thing
   measured is an exit status. Capturing `nvidia-smi -L`'s line count would make the sentence
   true; nothing does. *(Reasoned for the zero-GPU exit status itself — no hardware here can
   produce it; measured for the scoring: `gpu:0` prints the tick.)*

### ⚠ 12a-A3 — **the shim's absence fails loudly and names the WRONG cause; the spawned server's own stderr — which names the right one — is piped and never read.** Severity: HIGH-MED. *Measured.*

Run R4: the shim was moved aside and `measure-breakpoints.mjs` run unchanged. Result, verbatim
and complete (`adv-R4.log`):

```
Starting next dev on :39173 with an ephemeral credential pair (not written to disk)...
Error: server did not come up at http://localhost:39173/login within 60000ms
    at waitForServer (…measure-breakpoints.mjs:122:38)
```

Exit 1 — so **the absence does not degrade quietly**, which is the good half and the thing the
shim's header claims. But:

- **Not one line of the spawned server's output appears.** `spawn(… stdio: ['ignore','pipe','pipe'])`
  (`:1946`) and nothing anywhere in either harness ever reads `server.stdout` / `server.stderr`
  (grep: the only `stderr` references in both files are `hash-password.py`'s). Node's
  `Cannot find module '…/secret-file-shim.cjs'`, and the shim's own carefully-worded
  `MEASURE_PASSWORD_HASH and MEASURE_SESSION_SECRET must both be set` throw, are both written
  into a pipe with no reader. **The shim's "refuses loudly rather than falling through" is loud
  inside a pipe nobody reads.** The operator sees a 60-second timeout naming the port.
- This matters because it is the *same* diagnosis problem that cost four days: the previous
  failure also exited non-zero, at `waitForSelector('[data-slot="gpu0"]')`, naming a selector.
  Loud is not the property that was missing; **naming its own cause** is, and it is still
  missing one layer down.
- ⚠ Latent, pre-existing: an unread `pipe` blocks its writer once the OS buffer (64 KiB on
  macOS) fills. A chattier `next dev` — a compile error loop, a deprecation warning per route —
  hangs the harness rather than failing it. Not observed in four runs; named because the fix
  for the bullet above (drain both streams, print them on a startup failure) also removes it.

### ⚠ 12a-A4 — **the shim is a third, untethered producer of `/etc/ai-dashboard.env`.** Severity: MED. *Measured (grep).*

`secret-file-shim.cjs:49` re-types the path as a literal, with a comment saying it is *"the one
path `lib/auth/secrets.ts` reads — `SECRET_ENV_FILE`, hard-coded there by §5.1"*. The real one
is `lib/auth/secret-file.ts:82`; `dashboard.sh:55` carries a third (`ENV_FILE=`). **Nothing ties
them**: `packaging.test.ts` overrides `ENV_FILE` with a temp path in every one of its cases
(`:182, :483, :826, :1099, :1359, :1485, :2203`), so no test asserts the three literals agree.

If §5.1's path ever moves, the shim stops intercepting and every browser measurement dies with
`12a-A3`'s misleading message — i.e. the drift reproduces the exact four-day outage the shim was
written to end. Two producers of one constant is the failure mode this repo names in
`dashboard.sh`'s own §11.2 comment (*"THE EXPECTATION IS DERIVED FROM THE UNIT FILE, never
retyped"*) and in `CLAUDE.md`. A `.cjs` cannot import the TS constant, but it can read
`lib/auth/secret-file.ts` and refuse to start if the literal is not in it — the same shape as
`unit_exec_start`.

### ⚠ 12a-A5 — **`12a-Q10` confirmed independently, dated, and swept for siblings: it was born dead, and it is the ONLY one.** Severity: MED. *Measured.*

Confirmed without reading the test phase's reasoning: `components/header.tsx:161` renders
`<div className={styles.status} role="status">` with **no** `data-mode`; `data-mode={mode}` is on
the child `<span className={styles.dot}>` at `:175`. `header.module.css:127-129`'s
`.status[data-mode='paused'], .status[data-mode='stale']` therefore matches nothing.
`--nodata` is a real token (`tokens.css:78`, a repeating-linear-gradient), so the declaration
would paint if the selector could match — the rule is dead at the selector, not at the value.

**How long:** `data-mode` has been on `.dot` since `b4ffa3e` (10a, **2026-09-08**); the CSS rule
arrived at `8ad8b9c` (10e, **2026-09-09**), one day later. It has therefore **never matched, in
any commit** — it was born dead, and has been so for 16 commits / 6 days.

**Siblings — swept, and there are none.** All 22 CSS modules (`components/`, `components/panels/`,
`app/`) were parsed for (a) every attribute-qualified selector and (b) every selector with a
descendant/child/sibling combinator, and each was checked against the component that owns the
class:

| selector family | verdict |
|---|---|
| `.chip[data-size='md'\|'sm'][data-severity=…][data-code='true']` (13 rules) | reachable — `chip.tsx:142-145` stamps all three; both sizes have real call sites (`cooling-panel.tsx:111/194`, `status-row.tsx:169/186`) |
| `.dot[data-severity='normal'\|'watch'\|'alarm'\|'none']` | reachable — `header.tsx:176`, `?? 'none'` |
| `.controls button[aria-pressed='true']` | reachable — the pause button, `header.tsx:225` |
| `.panel[data-severity=…]`, `.track[data-severity=…] .fill`, `.hero[data-severity=…] .value` | reachable |
| `.notes[data-bound='roomy']`, `.row[data-severity=…]`, `.entry[data-severity=…] .sentence`, `.toggle[aria-pressed='true']` | reachable |
| `.lead b`, `.hoverZone:hover + .crosshairGroup`, `.table tbody th`, `.gapRow td`, `.<slot> > *` | reachable — each confirmed against its JSX |
| **`.status[data-mode='paused'\|'stale']`** | **unsatisfiable — the only one** |

So the mirror-image guard the handoff asks about would today have exactly one finding, which is
the strongest possible argument for writing it: it is cheap and it is not noisy.
`lib/dangling-css-class.test.ts` cannot see it — it resolves `.chip[data-size='sm']` to the class
`.chip` and asks only whether `.chip` exists (its own test at `:249` is this shape).

⚠ Found in the same sweep, unrelated to CSS: **`components/panels/panel-notes.tsx`'s module doc
is now false about its own callers.** It states *"GPU, CPU and SERVING take `'tight'` because
each costs the page 1:1 (GPU sets row 1)"*. 12a gave **both** GPU takeover branches `bound="roomy"`
(`gpu-panel.tsx:193` and `:204`). The doc is the place a future caller looks to decide a bound.

### ⚠ 12a-A6 — **the "0…18 × 4 × 4 crossing" is two 2-D slices, not a crossing, and the fourth input is pinned at zero throughout.** Severity: MED. *Measured (read against the file).*

`lib/client/header-status.test.ts`, the new describe *"zero through all eighteen, crossed with
every mode and every band"*:

- **`alarms` is `0` in every generated case.** The count test calls
  `aggregateStatus(mode, 0, 'normal', failing)`; the band test calls
  `aggregateStatus('live', 0, band, failing)`. The only non-zero `alarms` anywhere in the new
  block is one literal, `aggregateStatus('paused', 6, 'alarm', 18)`. So the branch
  `BY_MODE[mode](alarms, severity)` takes with `alarms > 0` — `alarmsWord`, `paused · N alarms`,
  `stale · N alarms` — is swept at **one** point of the 19 × 4 × 4 space, not 304.
- **Mode × band is never crossed at all.** The count test fixes `band = 'normal'`; the band test
  fixes `mode = 'live'` **and inspects only `severity`, never `text`**. Coverage is 4 + 4 slices,
  not 16. `12a-test.md` §2's table says *"All 4 bands × 19 counts"* — true of the returned
  `severity`, false of the returned `text`. The reachable, untested shape it hides:
  `live`, `alarms 0`, `severity null`, `failing 3` → `no readings · 3 sources unread`, a string
  no test in the tree asserts.
- **`glyph` is never asserted in the sweep**, in any mode — so a `BY_MODE` table whose `paused`
  and `stale` glyphs were swapped passes all of it.
- The sweep is over **scalars handed to `aggregateStatus`**, so it structurally cannot express
  anything about where those scalars come from — which is the same blind spot §2.1 found for the
  126-case sweep (recovery), one module over, and it is still open on this axis: nothing crosses
  `failingSourceCount(snapshot)` with `alarmCount`/`aggregateSeverity` from the **same** snapshot.
  It also freely asserts unreachable points (`alarms = 0` with `severity = 'alarm'`), so "every
  crossing" buys coverage of states the system cannot produce while missing the ones it can.

### ⚠ 12a-A7 — **measurement 16 asserts co-presence where it means containment, and grades the easy half of the branch it was built for.** Severity: MED. *Measured + reasoned.*

`measure-breakpoints.mjs:1877-1903`. `gpu0Reason` is `textOf('gpu0').includes(nvidia)` — the
**whole slot's** text — and `gpu0RoomyWells` is
`querySelectorAll('[data-slot="gpu0"] [data-bound="roomy"]').length`. The two are independent, so
the record's headline claim *"the reason is in the bounded well"* is not what it measures: a
regression that renders the message in a bespoke unbounded `<p>` **and** leaves any `roomy` well
in the slot satisfies both terms. That is 10f/Q1's own defect, and it is the reason this branch
exists. The jsdom test does check containment (`lastIndexOf('<div', at)`); the browser record —
the one added *because* jsdom could not see the page — does not. `>= 1` rather than `=== 1` also
lets a second well through.

What measurement 16 does **not** cover, in order of how likely it is to matter:

1. **One card absent, one enumerated.** This is the configuration `roomy`'s own justification
   rests on — `gpu-panel.tsx:190-192`: *"A card absent from a `gpus[]` that WAS read is the
   retired case, so at least one card is normally still enumerated and sets the row on its own."*
   Measurement 16 grades `gpus: []`, where **no** healthy card sets row 1 and every takeover is
   84 px. The mixed page — gpu0 at the healthy 176 px, gpu1 a takeover with a 46 px roomy well —
   is the one the comment argues about and the one nobody has measured. (`10e-Q4` lived for a
   month in exactly this gap: the branch that is not measured.)
2. **`gpus: null`** — the *other* takeover (`no GPUs enumerated`, `:197-204`), also `roomy`, also
   never rendered in a browser by any fixture.
3. **A long message.** The well is bounded, but `NVIDIA_MESSAGE` is 22 characters. The wrapping
   term §6.1's arithmetic cares about (`PanelNotes`' own doc: a 152-character DKMS message costs
   65.6 px in a 285 px column) is not exercised on this branch.
4. `errors[]` carrying *several* gpu-source entries, where `hiddenMessageCount` and the fade
   engage.

### ⚠ 12a-A8 — **measurement 16's three `recordFit` rows are near-unfalsifiable on this page: the row caps convert overflow into clipping.** Severity: MED. *Measured.*

Run R2: `.takeover { min-height: 400px }` — a takeover card ~4.7× its measured height, i.e. a
`gpus: []` page that should scroll. Result:

| record | R2 |
|---|---|
| `16. … the RETIRED fixture TOOK` | **PASS** (correctly — it did take) |
| `16. 1280/1600/1920 … the grid does not grow past the viewport` | **PASS, all three** |
| `16. 1280/1600/1920 … NO panel body hides a reading` | **FAIL, all three** — `gpu0 hides 268px vertically`, slot pinned at its 199.8 px cap |

So the handoff's *"a `gpus: []` page that scrolls"* **cannot be produced by content** — the row
caps absorb it and the page keeps fitting. §6.1's promise is kept by clipping, which is by design;
the consequence for the record is that of measurement 16's seven rows, **three carry almost no
signal on this page** and the anti-vacuity work is done entirely by `recordNoClipping`. That is
worth knowing before anyone reads "245 / 221 / 277 px spare" as headroom the branch could spend:
it is headroom against a page that cannot grow.

### ⚠ 12a-A9 — **one-line reverts of the 12a diff that keep everything green.** Severity: MED (the coverage statement, not any one line).

Two whole regions of this loop's diff are covered by **nothing**, and that is the finding behind
most of the list: (i) `measure-breakpoints.mjs`, `mocks/measure-arrangements.mjs` and
`secret-file-shim.cjs` appear in **no** harness's `LEDGER_FILES` and in no mutation in any of the
ten `regressions.py` (grep: no `.mjs` or `.cjs` anywhere in any of them), so every browser record
can be weakened at will; (ii) `serve-llm.sh` and `gpu-fan-control.sh` are executed by no test —
`packaging.test.ts`'s only mentions of them are three comment strings (`:866, :2220, :2824`).

| # | one-line revert | stays green because | proof |
|---|---|---|---|
| 1 | `secret-file-shim.cjs:53-58` — delete the `if (!hash \|\| !secret) throw` | nothing references the shim but the two harnesses (grep), and both always set the vars | grep, measured |
| 2 | `secret-file-shim.cjs:64-77` — delete every `fakeStat` field except `isFile` | `secrets.ts:104` calls only `.isFile()` | read, measured |
| 3 | `measure-breakpoints.mjs:1819` — drop `rects.length > 1 &&` | no mutation covers the file | grep, measured |
| 4 | `:1850` — drop `statusLine.dotSeverity === 'alarm' &&` | same — 15d loses `12a-Q2`'s painted half silently | grep, measured |
| 5 | `:1853` — drop `calibration.headerHeight > statusLine.headerHeight` | same — the calibration keeps only its one-sided term | grep, measured |
| 6 | `:1898/:1899` — `>= 1` → `>= 0` on either roomy-well term | same — the bound assertion becomes vacuous, record still passes | grep, measured |
| 7 | `:1896-1897` — drop `gpu1Takeover`/`gpu1Reason` | same — 16 stops being a claim about *both* cards | grep, measured |
| 8 | `serve-llm.sh:240-244` — delete the whole `if (( DRY ))` block | no test runs the file | grep, measured |
| 9 | `gpu-fan-control.sh` — the same block in its `restart_ai_dashboard` | same | grep, measured |
| 10 | `dashboard.sh:2273` — `????*` → `??????*` (accept a 5-digit "exit status") | the new guard rows test a truncated marker and a non-numeric one; nothing tests the 0-255 boundary the comment claims | **run: `vitest run packaging.test.ts` → 85 passed, 0 failed** |
| 11 | `measure-breakpoints.mjs:1941-1943` — replace the `.filter(…)` with a plain template | cosmetic on this machine (`NODE_OPTIONS` unset) | reasoned |

⚠ #10 is the only one on the list that is *inside a file a harness owns* and still green, which
is why it was run rather than reasoned. #1 is the one that matters most: the shim's loud refusal
— the property its header spends a paragraph on, and the property `12a-A3` shows is already
half-inaudible — is guarded by nothing at all.

### 12a-A10 — `rc` accepts `256`…`999` as an exit status. Severity: LOW. *Measured.*

`dashboard.sh:2273`'s `????*` rejects four or more characters, so 1-3 digits pass — but the
comment says *"it must be an exit status — 1 to 3 digits, **since a status is 0-255**"*. `RC=300`
and `RC=999` are verdicts today (probed: both print the production FAIL). Harmless in direction
(it fails rather than ticks), but the constraint the comment claims is not the constraint written,
and #10 above shows the boundary is untested in either direction.

---

## 2. What held

**The shim does not leak, and its bound is exactly what its header claims.** Checked four ways:

- **No production file is involved.** `git status` shows nothing under `lib/`, `app/`,
  `components/`, `proxy.ts`, `instrumentation.ts` or `systemd/` in this loop's diff.
- **Nothing but the two harnesses can reach it.** The only references to `secret-file-shim` in
  the entire tree are `measure-breakpoints.mjs`, `mocks/measure-arrangements.mjs`, the shim
  itself, and two documents. It is not a test file, not in `tsconfig`'s type-check of `.ts`, not
  imported by anything.
- **`NODE_OPTIONS` is set on the `spawn` env only** (`:1938-1945`), never on the harness's own
  `process.env`, so Playwright, Chrome and anything the phase ran afterwards are untouched. It
  *is* inherited by every descendant of `pnpm exec next dev` — which is the intended scope, and
  the shim's effect inside any of them is confined to one exact path string.
- **It cannot reach the image.** `.dockerignore` excludes `pipeline` (and `.env`/`**/.env`), so
  the build context never carries it; the runtime stage copies only `.next/standalone` and
  `.next/static`.
- **It fakes an input, not the authentication**, and it fakes exactly the two calls production
  makes: `secrets.ts:103` `statSync(SECRET_ENV_FILE)` → `.isFile()`, `:109`
  `readFileSync(SECRET_ENV_FILE)`. `parseSecretFile`, `readAuthConfig`, scrypt and the cookie all
  run unmodified. The alternative, candidate (b), would have added an entrance to
  `secret-file.ts`; (a) is the right choice and 11b's rule 2 is the right reason.

**Both new records are falsifiable, and each goes red for its own reason.** Three deliberate
breaks, one per run, each reverted:

| run | break | result |
|---|---|---|
| **R1** | the `absent` takeover renders neither `card not enumerated` nor its `PanelNotes` (`gpu-panel.tsx:177-193`) | **exit 1, 66/1** — only `16. the RETIRED fixture TOOK` red, detail `{"gpu0Takeover":false,"gpu1Takeover":false,"gpu0Reason":false,"gpu1Reason":false,"gpu0RoomyWells":0,"gpu1RoomyWells":0}`. All six conjuncts bit. |
| **R2** | `.takeover { min-height: 400px }` — the retired page overflows | **exit 1, 64/3** — 16's three no-clipping rows red (`gpu0 hides 268px`); see `12a-A8`. |
| **R3** | an 80-character prefix on `aggregateStatus`'s text, suffix preserved so `endsWith('18 sources unread')` still holds | **exit 1, 61/6** — 15d red on **`oneRow:false`, `headerHeight` 43 → 71.8**, plus 14's two fit rows, 15's two scroll rows and 15a's band row. The wrap detector fires on a real regression, and it fires for the reason it claims. |
| **R4** | the shim moved aside | **exit 1** at `waitForServer`; the absence does not degrade quietly. See `12a-A3` for the cause it names. |

Two further things this confirms about 15d: the metric's third spelling really does discriminate
(R3's `children: 4` is the `height > 0` filter working, against `children: 5` in the failing
`breakpoints3.log` that included the zero-height spacer), and the `endsWith` term and the `oneRow`
term are independent — R3 kept the first and broke the second.

**Everything else checked and found sound:**

- `12a-Q10` is real and independently confirmed (`12a-A5`), and the test phase was right not to
  fix it: `MOCK.html` renders a **second** pill rather than hatching the status one, so
  "make the rule match" and "match the mock" are genuinely different changes.
- **`.status[data-mode]` is the only unsatisfiable rule in the tree.** 22 modules swept.
- `aggregateStatus`'s rule itself is correct at every point the sweep does reach; the
  `failing && severity === 'normal' → null` line and the `watch`/`alarm` invariance are right.
- **Nothing else consumes the aggregate severity.** `lib/client/runtime.ts:544-545` produces
  `state.severity`/`state.alarms`; `app/dashboard-shell.tsx:221` is its only reader;
  `components/header.tsx:176` is the only `data-severity` the header stamps. No title, favicon or
  body class. §9 row 1's *reason* (nothing disagrees) survives 12a's change; its *definition*
  does not — the amendment the test phase asks the parent for is the right ask.
- `check_container_gpu_access`'s eighth-arm fix is real and does what it says: `RC=`, `RC=oops`
  and a marker-free capture all answer `unknown` in the probe, and trailing container chatter is
  no longer pasted into the operator's terminal.
- The tree was left exactly as inherited: all seven files touched during the breaks compare
  byte-identical (`cmp`) to the copies taken before, and `git status` is unchanged apart from this
  file. `next-env.d.ts` was restored by each harness run's own `finally`, and is clean.

---

## 3. What could not be verified, and why

1. **Whether `nvidia-smi -L` exits 0 with zero GPUs visible** — `12a-A2`'s third defect. No
   hardware here can produce the state, and the box is live and must not be written to. What is
   measured is the *scoring*: given `gpu:0` the row prints the tick, and the list that would
   distinguish two cards from none is discarded at `dashboard.sh:2249`.
2. **Whether the test-file weakenings in `12a-A9` survive the mutation harnesses.** Only #10 was
   run (`vitest run packaging.test.ts`). Items 1-9 are proven green by *coverage*, not by a
   harness run: no `regressions.py` names any `.mjs`/`.cjs`, and no test executes the two sibling
   scripts. Running `regressions.py` for either step would have taken the phase past its budget
   and could not run beside the browser runs.
3. **The mixed page (one card enumerated, one absent)** — `12a-A7`'s first gap. Adding a fixture
   is a change to the harness, which is the TEST phase's to make, not this one's; and the row-1
   arithmetic it would settle is exactly the claim `gpu-panel.tsx:190-192` makes in prose.
4. **Whether measurement 16's 800 ms settle is enough.** Every other alarm-bearing fixture waits
   13 s *"because §6.4's ten seconds of SAMPLING … is part of what is measured"*; the retired page
   waits 800 ms (`:2059`), inherited from measurement 10's 1 200 ms without a stated reason. The
   band did read 102 px on that page, so a banner was drawn, and 10g's *"the banner is one
   height"* record bounds how much it could still move — so this is probably benign. Not tested:
   isolating it needs a fifth run and a timing change.
5. **Whether an unread `stdout`/`stderr` pipe can actually fill** (`12a-A3`'s last bullet). Four
   runs did not reach the buffer. Reasoned from the 64 KiB macOS pipe buffer and the absence of
   any reader, not reproduced.
6. **Anything on the box.** Read nothing, wrote nothing; 8080/8081/8090 untouched.
