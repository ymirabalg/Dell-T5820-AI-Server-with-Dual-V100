# 12a — TEST. **The browser harness measures again after four days, and the §11.4 row had an eighth arm that scored a partial write as a pass.**

**Written by the TEST phase, 2026-09-15.** Branch `dashboard-frontend`, working dir `dashboard/`.
**Nothing committed** (the parent commits). `SPEC.md`, `MOCK.html` and `INSTALL-SPEC.md` untouched.
Nothing deployed.

Two findings are the ones to read if you read nothing else: **§1** (the harness is repaired and
every browser measurement is green, including one new record that turns `12a-build.md` §3.4's hand
measurement into a standing one) and **§4** (`check_container_gpu_access` could be made to print a
green tick, and separately the production failure's own red row, from a marker with no exit status
behind it — measured both ways).

---

## 1. Priority 1 — the browser measurement harness: CONFIRMED broken, FIXED, and RUN

### 1.1 The breakage, reproduced rather than inherited

Spawned `next dev` exactly as the harnesses do — `PASSWORD_HASH` / `SESSION_SECRET` in the
environment — and posted the harness's own password to `/api/session`:

```
ai-dashboard: REFUSING TO START — /etc/ai-dashboard.env is not readable as §5.1 requires
  the file: could not be read (ENOENT) …
 POST /api/session 401 in 37ms
```

**401 to the correct password**, which is §5 behaving exactly as ruled — *no `PASSWORD_HASH` is a
denial, not a bypass* — and why both scripts died at
`waitForSelector('[data-slot="gpu0"]')`. The build's diagnosis (§7.1, `12a-Q4`) is confirmed in
every particular, including that nothing but the credential path changed.

### 1.2 The repair — candidate (a), and it touches no production file

`pipeline/steps/10-panels-assembly/secret-file-shim.cjs` (new, harness-only). Both scripts now
spawn `next dev` with `MEASURE_PASSWORD_HASH` / `MEASURE_SESSION_SECRET` and
`NODE_OPTIONS=--require …/secret-file-shim.cjs`; the shim fakes the **one `statSync` + one
`readFileSync` of `/etc/ai-dashboard.env`** that `lib/auth/secrets.ts` performs, inside that
spawned process tree and nowhere else.

- This is `12a-Q4`'s candidate **(a)**, the one the build named first and the one 11b's own rule 2
  argues for: candidate (b) — a path override inside `lib/auth/secret-file.ts` — adds a new
  entrance to the module 11b spent a loop hardening, and an override that exists for a test is an
  override a deployment can be misconfigured through. **No file under `lib/`, `app/`, `proxy.ts` or
  `systemd/` changed.**
- Same bound as `installGpuFabrication`: it fabricates an **input** the real deployment supplies and
  leaves every line under measurement running unmodified. The login still runs `parseSecretFile`,
  `readAuthConfig`, real scrypt and the real cookie — **verified in both directions**: the correct
  password now answers `302` + `Set-Cookie: aid_session=…`, and a wrong one still answers **401**.
- The two variables are deliberately **not** spelled `PASSWORD_HASH`/`SESSION_SECRET`, so a grep for
  the old names cannot find something that looks like the environment path coming back, and
  `authorize.test.ts`'s planted-`process.env.PASSWORD_HASH` guard keeps meaning what it says.
- The shim **throws** if either variable is absent rather than falling through — a shim that
  silently did nothing would reproduce the failure it exists to remove, which is what cost four
  days here.
- **Its blast radius was measured, not asserted.** Under `--require`, one path is faked and
  nothing else moves: `readFileSync('/etc/ai-dashboard.env')` returns the two lines and
  `statSync(...).isFile()` is true, while `readFileSync('package.json')` still reads the real file,
  `statSync('/etc/hosts')` still succeeds, and a missing path still throws `ENOENT`. Without the
  two variables the preload throws at load.

### 1.3 The measurements, run — the first since 2026-09-10

| harness | result |
|---|---|
| `measure-breakpoints.mjs` | **exit 0 — 67 passed, 0 failed, 0 blocked** (59 of them the records that existed before this phase, all green on the first repaired run) |
| `mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json` | **exit 0** |
| `mocks/check-density.mjs` | **exit 0 — ALL PASS**, three viewports |

§6.1's promise holds on every graded page: 1280×1024 spare 28 px on the hostile fixture, 1600×1024
spare 4 px, 1920×1080 spare 36 px; the sticky band measures **101.8 of `--band-reserve: 102`** at
all three. `check-density` is inside 0.6 % of target on every panel but SESSION EVENT LOG (−3.0 %,
its standing figure).

### 1.4 ⚠ And the one at-risk property the build had to measure BY HAND is now measured by the harness

`12a-build.md` §3.4 measured 12a's longest status string in a scratch page because
`measure-breakpoints.mjs` could not log in. That measurement is now a **standing record 15d**, on
the real assembly:

- the **hostile** fixture files an `errors[]` entry for **all eighteen** §3.7 sources
  (`EVERY_SOURCE`), so the clause on screen is the widest `aggregateStatus` can produce;
- the record asserts the status text **ends `18 sources unread`**, that the header is **one row**
  (distinct `top` positions among the header's own children — the *cause*, where 15a measures the
  *consequence*), and that the dot still paints `alarm` — `12a-Q2`'s other half, painted rather
  than asserted in jsdom.

**Measured, on the hostile page at 1280×1024:**

| | |
|---|---|
| the status text on screen | **`529 alarms · 18 sources unread`** — 12a's clause at its ceiling, beside a four-digit-capable alarm count |
| its width | **208.6 px** |
| the header | **43.0 px — one row** |
| the same header with a deliberately absurd status string | **98.1 px — wrapped**, so the record can tell the difference it exists to tell |
| the dot | **`alarm`** — a red dashboard keeps its band while eighteen sources are unread |

That confirms `12a-build.md` §3.4's hand measurement in the real assembly (43.0 px), and it is
corroborated independently by 15a: the band measured **101.8 px of `--band-reserve: 102`** at all
three viewports on that same page — 43.0 header + 58.8 banner.

⚠ **This record was wrong twice before it was right, and both times the harness said so rather
than the page.** Its first spelling counted *distinct `top` positions* among the header's children
and failed on a healthy 43.0 px header, because the five children are centre-aligned at four
different heights. Its second counted whether every child overlaps every other vertically, and
failed for a different reason: `.header` carries an `aria-hidden` flex **spacer with no height**,
whose bottom equals its top. The third — overlap among the children that actually paint, plus the
in-run calibration above — passes, and the two false starts are recorded because *"a measurement
that fails on the healthy case is a metric, not a finding"* is the same lesson 10c-3/A3 wrote and
this file nearly repeated.

### 1.5 ⚠⚠ And a page this project has never graded: the RETIRED takeover — **measurement 16**

`12a-build.md` §7.2 derives that this loop's rendering change cannot move a graded number, and the
derivation is sound — but read what it rests on: *"every fixture in both scripts enumerates cards
0 and 1 … **that is also why `10e-Q4` was never caught by a browser measurement in the first
place: no page this project has ever measured renders `gpus: []`**."* 12a added a bounded notes
well to that branch and left the branch itself unmeasured, which is the condition the last
production failure lived in for a month.

So `measure-breakpoints.mjs` gains **measurement 16**: `fixtureRetired()` — the degraded box with
`gpus: []` and the real `nvidia-smi: exited 255` entry, which is the production shape — graded the
same way every other page is. Its precondition is asserted first (HANDOVER §0.8): **both** cards
draw `card not enumerated`, **both** carry the collector's own sentence, and the sentence is inside
a `data-bound="roomy"` well — the three things `12a-GP1`…`GP3` mutate away, now measured in a
browser rather than only in jsdom. Then `recordFit` and `recordNoClipping` at all three viewports.

⚠ It waits for the **takeover**, not for a sparkline: this page has no chart, and the
copy-pasted `waitForSelector('[data-role="gpu-sparkline-wrap"]')` would have timed out on a
fixture that took perfectly — 10c-3/A3's exact shape.

**It passed on its first run, and the numbers are worth keeping:** §6.1's promise holds with
**245 / 221 / 277 px spare** at 1280 / 1600 / 1920, no panel body hides a reading, and each GPU
slot measures **84 px** against the 164–176 px a healthy card sets. That is the build's §2.1
arithmetic — *"this branch draws no chart, and a takeover card sits far under the 176 px the
healthy card sets row 1 to"* — measured rather than derived, and it is why `roomy` was the right
bound for the new well.

### 1.6 One thing NOT changed, recorded rather than fixed

Both scripts restore `next-env.d.ts` **before** killing their `next dev`, so a rewrite in that
window would survive the restore. It did not bite here (the tree is clean of that file after both
runs), so it is left alone rather than reordered on a hunch. ⚠ Separately: any *other* `next dev`
run by hand — including the reproduction in §1.1 — rewrites that tracked file and does not restore
it. It was restored here by writing `HEAD`'s bytes back, never by `git checkout --`.

---

## 2. Priority 2 — `aggregateStatus`'s fourth input, fixtured across the whole axis

**The build's answers are correct, and they were tested at their examples rather than across their
range.** The existing tests pin one failing source, two, nine, the four bands, and the paused /
stale / expired forms; that leaves the rule asserted at three points of a nineteen-point axis and
on four of sixteen mode × band crossings. Three tests added to `lib/client/header-status.test.ts`
(new describe: *zero through all eighteen, crossed with every mode and every band*):

| question the parent asked | answer, and where it is now measured |
|---|---|
| **zero through all eighteen** | Every count 1…18 in every mode carries the clause; 0 carries nothing; `expired` carries none of it at any count. The ceiling is read from `ERROR_SOURCES`, not typed — a nineteenth source moves the axis on its own |
| **each severity band crossed with a failing source** | All 4 bands × 19 counts: `severity` is `null` **iff** the band is `normal` and the count is > 0; `watch` and `alarm` keep theirs, `null` stays `null` |
| **`paused` and `stale` forms** | Already covered, and now at every count rather than at one |
| **distinct SOURCES, not entries?** | **Yes.** `new Set(errors.map(e => e.source)).size`. Measured on the whole union: eighteen sources filing one entry each is 18, and **the same eighteen filing two entries each is still 18** — the discrimination `12a-HS6` needs, applied to the ceiling |
| **what does it say at exactly one?** | **`1 source unread`**, singular, and the boundary is now asserted at the boundary (`failing === 1` vs every other count) rather than sampled near it |

Nothing in the build's rule turned out to be wrong. One shape worth naming because it is *not* a
defect: `llama-env` failing on instance 0 and instance 1 counts **once**, because the unit is the
source. That follows from the recorded decision and is what `errorsForPanel`'s own granularity
says; it is stated here so the next reader does not "fix" it.

⚠ **One wording risk, for `12a-Q1`'s owner rather than for this phase.** `unread` is the right
*claim* — it says a reading was not obtained and asserts nothing about why — but in an interface it
collides with the "unread messages" idiom, so `● 2 sources unread` can be read as *"two notices
you have not looked at"*, which is the opposite of urgent. Every argument in `header-status.ts`'s
module doc survives a swap to a phrasing without that idiom (`2 sources not read`, `2 sources
silent`); the tests key on the literal, so it is a one-line change plus fixtures. Recorded, not
taken — the literal is the owner's.

### 2.1 ⚠ One thing the 126-case sweep structurally could not see: RECOVERY

Every fixture in `collector-visibility.test.tsx` holds a ring of **one** sample, in which *"the
latest snapshot"* and *"the ring"* are the same object. So a shell that counted the **oldest**
sample's `errors[]` passes all 126 cases and the healthy control — and the header then goes on
accusing a collector after it recovers, which teaches an operator that the clause means nothing:
the same defect as never accusing it, arrived at from the other side. One ⚠ test added (a
two-sample ring, both orderings: recovered ⇒ `all healthy` and no `unread`; just-failed ⇒
`1 source unread`), backed by mutation **`12a-DS2`**. The shell's own code was already right; what
did not exist was anything that could tell.

---

## 3. Priority 3 — the dot moving with the text: **the claim of silence is NOT quite true, and the choice is stronger than the build claimed**

The build says *"§6.2's ruling governs what the header says and is silent on what it paints"*.
Checked against the spec itself:

| what the spec actually says | where | effect on `12a-Q2` |
|---|---|---|
| *"Aggregate status dot **and count** — **one reduction over each condition's `displaySeverity`**"* | §9, row 1 | ⚠ **Not silence — a positive definition**, and 12a's painted dot is no longer that reduction. §9 row 1 is now literally false as written |
| *"keeping `all healthy` was rejected because it is the dot and the text disagreeing three pixels apart — precisely what §9's 'one reduction' forbids"* | §6.2 (S-A, 2026-09-08) | The precedent points **at** the build's choice: the same objection, one case over |
| *"a panel that would read `normal` while any of its own readings is `—` shows no band instead … §9's 'a dashboard that goes green because it stopped being able to look' **is written about the aggregate**, which conditions protect; this applies the same refusal one level down"* | §6.2 (10b-S-F, 2026-09-08) | The chip rule declares itself **derived from a principle about the aggregate**. 12a applies it back up to its origin — an inheritance, not an invention |

**Verdict: accept the choice, and sharpen the owner question.** What the spec is silent on is the
*literal* — which colour a partial case paints — and there the build's decision is the one its own
precedents point to, and it does not contradict §9's stated *reason* (nothing disagrees: with
`alarms === 0` there is no banner to disagree with). What the spec is **not** silent on is §9 row
1's definition, which 12a has outgrown. So `12a-Q2` is not merely an unruled silence: **it is a
line in §9 that now needs amending**, and that is the parent's to make, not this loop's.

Two supporting checks, because a second painter would have re-created the disagreement:

- **Nothing else paints `state.severity`.** `app/dashboard-shell.tsx:221` hands it to `Header` and
  that is the only consumer; `components/header.tsx:176` is the only `data-severity` the header
  stamps. There is no document title, favicon or body class taking the raw value.
- **`watch` and `alarm` really are untouched** — asserted at every count in §2's crossing, so a
  failing collector can never grey out a red dashboard (`12a-HS5`'s property).

---

## 4. Priority 4 — ⚠⚠ the eighth guard row: **a marker with no exit status behind it was a verdict**

`container_nvidia_smi_rc` took `${out##*RC=}` — everything after the last marker — and handed it
straight to `case "${mode}:${rc}"`. Every arm the parent named was probed in a real bash subprocess
with a stubbed `docker`. Six behaved. The seventh — **a partial write, the marker written and the
status not** — produced **two different confident verdicts, both wrong**:

| `.HostConfig.DeviceRequests` | `docker exec` printed | verdict BEFORE | why it is wrong |
|---|---|---|---|
| `null` (fallback) | `RC=` | **✓ pass** — *"nvidia-smi exited &nbsp; inside it, which is the fallback"* | A tick nobody measured. `rc` was the empty string and `fallback:*` matched it |
| `[{"Driver":"nvidia"}]` | `RC=` | **✗ FAIL** — *"THE CONTAINER CANNOT SEE THE GPUs … Fix: sudo ./dashboard.sh restart"* | The production failure's own message, from a container whose devices may be fine — the wrong diagnosis the `noexec` arm exists to prevent |
| `null` | `RC=oops` | **✓ pass** | Same shape; nothing required the marker to carry a number |
| `[{"Driver":"nvidia"}]` | `RC=255 and some container chatter` | ✗ fail, message reading `exited 255 and some container chatter` | Right verdict, untrusted container output pasted into the operator's terminal |

**Fixed in `dashboard.sh`**: the first whitespace-delimited token after the last marker, and it must
be an exit status — 1 to 3 digits, since a status is 0–255. Anything else is `noexec`, the arm that
already means *nobody looked*. The direction is deliberate: `unknown` is a `?` row and a `check`
exit of 2 — loud and harmless — while both readings above were confident and wrong. The `noexec`
row's sentence now covers both ways of getting there (*"the 'docker exec' either never ran, or came
back with no exit status behind its marker"*) and keeps the phrase the guard table keys on.

Re-probed after the fix: all three bad markers answer **unknown**; `RC=0`/`RC=255` still answer;
trailing chatter is no longer printed.

**Four rows added to `packaging.test.ts`'s guard-refusal table** (truncated marker in *both* modes —
because the two failures are opposite and only one of them looks like a bug — a non-numeric marker,
and a real status with trailing noise), and **two mutations** to the step-11 harness: `12a-SH9` (the
validation is removed) and the re-aim of `12a-SH2`, whose anchor gained a `return 0`.

The other arms the parent named were probed and were already right: **docker absent**, **daemon
unreachable**, **no container** (`container_ids` is `docker ps`, so a container that exists but is
STOPPED is not listed and the row says *"no container … is running"* — `unknown`, never a tick),
**exec exits non-zero with a marker** (a verdict, correctly), and **exec produces nothing at all**
(`noexec`). **Stderr was reproduced rather than reasoned**: the capture line is
`out="$(docker exec … 2>/dev/null || true)"`, so a stub printing `RC=0` to **stderr** yields an
empty capture and `noexec` → `unknown`, while the same stub on stdout yields a verdict. A marker
that arrives on the wrong stream is *nobody looked*, which is the correct reading.

---

## 5. Priority 5 — the restart guard: three arms fixtured, and **the inactive arm is reachable in two states where leaving it alone is wrong**

Each arm now has a fixture (the build had four tests; there are now seven):

| arm | fixture | behaviour |
|---|---|---|
| not installed | `NO_UNIT` | `info`, exit 0, no restart — `systemctl restart` on an absent unit would abort `unit` under `set -e` |
| installed, **not active** | `ACTIVE=inactive` | left alone — a restart would **start** it, before `cmd_firewall` has written its rule (11-A9) |
| failed restart | `systemctl restart` returns 1 | reported, names the consequence and the fix |

⚠ **And the arm's own justification is a claim about the container taken from a reading of the
unit** — *"nothing that is not running has lost its devices"*. That is §11.4's lesson one level up:
on 2026-09-14 every host-side reading agreed while the container was blind. Two states reach that
arm and are indistinguishable from `inactive` by the reading it makes:

1. **`ActiveState` could not be read at all** — `systemctl` missing, refused, or no systemd. The
   guard printed `is unknown, not active — nothing to restart`, an `info`. A row nobody could
   evaluate is not a row that passed.
2. **The unit is inactive or failed while a container of that name is still running** — which this
   box can produce and `check_one_process` exists because of. That container HAS just lost device
   access, and the operator was told *nothing to restart*.

**Fixed, without weakening the guard:** the unit is still **not** restarted (the reason for that is
unchanged), but when `container_ids` is non-empty the line becomes a `warn` that says the container
is running, that systemd has been reloaded, that this step may not restart the unit, and what to run
by hand. Three tests added — the running-container case, the unreadable-`ActiveState` case, and the
other side of the boundary (no container ⇒ the quiet `info` it always was, so the warning cannot be
satisfied by warning always) — plus mutation `12a-SH10`.

**Every `systemctl daemon-reload` in this repo is accounted for**, which is the procedural half of
§11.4 and is worth stating as a closed set rather than a spot check: `dashboard.sh` reloads in
`cmd_unit` (restarts — §5 above) and in `cmd_uninstall` (nothing to restart: it has just stopped,
disabled and removed its own unit, and removes the container next); `gpu-fan-control.sh` and
`serve-llm.sh` reload in `install` and `uninstall`, and all four call `restart_ai_dashboard`.

### 5.1 ⚠ The sibling scripts, which this loop also touched — one of them restarted a LIVE service under `--dry-run`

`serve-llm.sh cmd_uninstall` routes every line through `run`, which prints instead of acting when
`DRY=1` — and then called `restart_ai_dashboard`, which consulted nothing. So
`./serve-llm.sh uninstall --dry-run` on the box would have taken the live dashboard down and back
up **for real**. `dashboard.sh`'s own `restart_after_daemon_reload` has always had that branch; the
port dropped it. Added to both siblings (`serve-llm.sh` reads `DRY`, `gpu-fan-control.sh` reads
`DRY_RUN`) and **exercised rather than reasoned** — both functions were sourced out of their
scripts with `systemctl` stubbed and the unit path redirected: dry-run prints and does not restart,
`DRY=0`/`DRY_RUN=0` restarts, an inactive unit is left alone, all three exiting 0. (Neither script
is in any harness's `LEDGER_FILES`, so that probe is the only coverage those two functions have —
which is its own standing gap, and the reason `CLAUDE.md`'s 2026-09-15 note that *"the loop applies
to the root scripts too"* exists.)

⚠ Recorded, not widened: `gpu-fan-control.sh`'s `cmd_install`/`cmd_uninstall` do not consult
`DRY_RUN` **at all** — they `install`, `cat >` and `rm -f` unconditionally — so that script's
`--dry-run` promise (its own header, and `CLAUDE.md`'s *"--dry-run works on every subcommand"*) is
already false for those two subcommands, and was before this loop. Fixing it is a root-script loop
of its own.

---

## 6. Priority 6 — the five re-aims and the four inert tests

**All five re-aims keep their property.** Read against the sentence each mutation's name makes:

| mutation | anchor now | property |
|---|---|---|
| `10a-H12` | `data-severity={status.severity ?? 'none'}` | unchanged — a paused dashboard still hides its severity colour under the mutation |
| `10a-H14` | same line, `?? 'normal'` | unchanged — a null band still paints green under the mutation |
| `10a-H15` | `aggregateStatus(mode, alarms, severity, failingSources)` → `'normal'` | unchanged — the header stops handing the function the severity it paints |
| `11b-K5` | the new `check_container_gpu_access` / `check_drift` neighbours | unchanged — `check_drift` still leaves `cmd_check` |
| `10f-GP1` | pinned by the trailing `) : (` | unchanged, and **necessarily** pinned: item 1 gave the other branch the identical call, so the bare text matched twice. `12a-GP3` is the same property on the other branch |

**The four inert ⚠ tests were repaired in the right direction, and the file proves it rather than
the prose.** In both fixture cases the **assertion literal did not move** and the fixture grew:

- *entries from different sources each count once* — four entries, **three** sources, `toBe(3)`.
  With one entry per source the answer was also `errors.length`, so `12a-HS6` produced the identical
  number; the second `dbus` line is what separates the property from its most likely wrong
  implementation (and is the real shape — `collectUnitStates` files one entry per unit).
- *the production snapshot counts the source that blanked the GPUs* — three entries, **two**
  sources, `toBe(2)`.
- The other two got mutations rather than fixtures (`12a-HS7`, `12a-HS8`), which is correct: both
  are genuine properties whose wrong implementation nobody had yet written.

§2's new tests strengthen the same discrimination at the ceiling: eighteen sources twice over is
still 18, where `errors.length` would say 36.

---

## 7. Priority 7 — names against bodies, `toContain`, entropy, ledger keys

- **One name did not match its body, and it is fixed.** The sweep's first property is
  `test.each` over 126 cases named *"⚠ the collector message reaches the page"* — but for
  `hostname` and `proc-uptime` (14 of the 126) the body asserts the **negative**. A FAIL line naming
  one of those two would have sent the next reader looking for the opposite defect. Renamed to
  carry the exclusion: *"…, or the source is one of the two with no surface"*. The ledger key
  (`name.split('%')[0]`) stays matchable and well over 12 characters.
- **Every other new name checks out.** `⚠⚠ 12a — the RETIRED takeover shows WHY, in the same bounded
  well, ROOMY` asserts `data-bound="roomy"` and `role="group"` on the well that actually contains the
  message (`lastIndexOf('<div', at)`), not on the document; `⚠ one card enumerated and one not`
  asserts **two** occurrences by `split().toHaveLength(3)`, which is the count the generated row
  cannot make (§2.3 of the build); the header tests assert the dot's attribute in both directions.
- **`toContain` shape.** The new whole-document `toContain`s are all on strings only one element can
  produce: a per-case `MARKER-<source>-could-not-be-read`, `'1 source unread'`, `'all healthy'`,
  `'card not enumerated'`. The two `data-severity` ones are in `header.test.tsx`, which
  `lib/tocontain-scope.test.ts` exempts by scope **for a reason that still holds** — `Header` stamps
  `data-severity` in exactly one place — and they are paired with the negative (`not.toContain(
  'data-severity="normal"')`), so they discriminate.
- **No entropy and no clocks.** `Date.now`, `new Date()` and `Math.random` appear nowhere in the
  three new/changed test files; `collector-visibility.test.tsx` pins `BASE_MS` and `header-status`'s
  tests are pure.
- **Ledger keys.** Both harnesses' `UNMATCHABLE` check passed on the runs below, and
  `app/collector-visibility.test.tsx` is in step 10's `LEDGER_FILES` (and in no other's), so its ⚠
  marks are checked rather than merely written.

### 7.1 ⚠ Found while checking §3.4's premise: a CSS rule in the header that can never match

`header.module.css` ends with

```css
/* §6.2's paused/stale mode adds the mock's hatch to the same pill, over its severity colour. */
.status[data-mode='paused'],
.status[data-mode='stale'] { background: var(--nodata), var(--surface-2); }
```

…and `header.tsx` stamps `data-mode` on **`.dot`**, a child of `.status`, not on `.status` itself.
**Both selectors are unreachable**, so §6.2's *"a paused dashboard must announce it loudly"* is
carried today by the `❙❙` glyph and the word alone; the hatch the comment describes has never
painted. Pre-existing — `data-mode` has been on the dot since 10a and 12a did not move it — and
invisible to `lib/dangling-css-class.test.ts`, which resolves `.chip[data-size='sm']` to the CLASS
`.chip` and asks only whether *that* exists (its own test at line 249 is this exact shape). **Not
changed here**: the fix is one line, but it has two plausible spellings (stamp `data-mode` on the
pill as well, or `.status:has(.dot[data-mode='paused'])`), nothing currently asserts the hatch in
either direction, and a TEST phase inventing the first assertion of an unruled paint is the shape
invariant 7 exists to stop. ⚠ And the target is not obvious either: `MOCK.html` does not hatch the
status pill at all — it renders a **second** pill (`.agg__mode`) beside the severity one, *"the
neutral 'no reading' hatch rather than a status hue"* — so "make the rule match" and "match the
mock" are not the same change. Recorded as `12a-Q10`.

### 7.2 Two of the build's claims from outside the seven, spot-checked

- **§6.1's *"two entries in one response is structural"*** rests on `collectUnitStates` having
  exactly two callers. It does: `lib/collectors/safety.ts:221` (`FAN_SERVICE_UNIT`) and
  `lib/collectors/serving.ts:328` (the `llama-server@<i>` units), each opening its own connection
  per poll. Nothing else in `lib/` calls it outside tests, so one bus-side event really does yield
  exactly two identically worded entries.
- **§7.2's *"no graded fixture can reach the absent branch"*** is true as stated — every `gpus:`
  in both scripts enumerates cards 0 and 1 — and it is exactly the sentence that should have been
  a work item rather than a reassurance. §1.5 closes it.

---

## 8. ⚠ The `ebc60c6` sweep — no second corrupted file, and the check is mechanical rather than a reading

The parent's first lead: the same `git add -A` that captured `gpu-panel.tsx` mid-mutation may have
caught another file **in a way that is green by luck**. Answered by asking every harness rather than
by reading diffs:

- **Every mutation anchor in all ten harnesses is present in the working tree exactly once** —
  **1 412** mutations across `steps/02` … `steps/11` as the tree stood on arrival (this phase has
  added three since), `missing=0 ambiguous=0`. An applied mutation removes its own anchor, so a
  file carrying one shows up here as `ANCHOR NOT FOUND`. Nothing does. ⚠ The same check run
  *during* a harness does show one — it caught `11-U3`'s and then `11-H10`'s anchor missing while
  the step-11 run held those files mutated, which is what says the check can see the thing it is
  looking for.
- The complementary direction was checked too: for every mutation whose replacement text *contains*
  its anchor (an addition, where the anchor survives the mutation), the mutated form is absent.
  **0 suspicions.**
- ⚠ `lib/client/wire.ts` — changed by this loop and owned by **step 08's** harness, which
  `12a-build.md` §7.3 does not list as run — is included in that sweep and is intact.
- The source diffs of `5481665..HEAD` for the loop's six code files were then read: `gpu-panel.tsx`
  (repaired, `roomy`, one call), `header.tsx`, `dashboard-shell.tsx`, `wire.ts`,
  `header-status.ts`, `dashboard.sh`. Nothing else from `ebc60c6` differs from what the build notes
  describe.
- **One blemish from that window, fixed:** `header-status.ts` carried `BY_MODE`'s doc comment
  duplicated above `interface ModeStatus`, immediately followed by that interface's own. Cosmetic,
  not a mutation; removed.
- ⚠ **The build's own harness logs are still on disk** (`…/scratchpad/step10c.log`,
  `step11b.log`, timestamped 21:48 and 21:44 on 2026-09-14) and corroborate §7.3 directly rather
  than on its word: *"All 312 regressions failed their check"* with 322 ⚠ tests checked, and
  *"All 189"* with 82. They also confirm §0's account of the timing — the step-10 run was still
  going at 21:48, and the commit landed at 21:46:57, inside it.
- The shared red-test-ledger block is still byte-identical **in all ten harnesses** —
  HANDOVER §5.2's AST digest prints `3c8de25c7136209b2a89526f649b381f`, 8 symbols, ten times,
  unchanged from 2026-09-10. A mid-harness capture of a `regressions.py` would have shown here.

⚠ **One number in the build notes is wrong and it is worth correcting because a later loop will
diff against it.** §5 says `serve-llm.sh` carries *"6 pre-existing SC2015 info notices, 6 before
and 6 after"*. Measured against `git show HEAD:serve-llm.sh`: **5 before and 5 after**. The claim
that its change adds none is correct; the count is not.

---

## 9. What changed in this phase

| file | change |
|---|---|
| `pipeline/steps/10-panels-assembly/secret-file-shim.cjs` | **new** — harness-only `/etc/ai-dashboard.env` shim (§1.2) |
| `pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` | logs in through the shim; **new record 15d** (§1.4) and **new measurement 16**, the retired page (§1.5) |
| `pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs` | logs in through the shim |
| `dashboard.sh` | §11.4's marker must carry an exit status (§4); the non-active restart arm notices a running container (§5) |
| `packaging.test.ts` | 4 guard-table rows, 3 restart tests |
| `lib/client/header-status.ts` | duplicated doc comment removed (§8) |
| `lib/client/header-status.test.ts` | the zero-through-eighteen crossing (§2) |
| `app/collector-visibility.test.tsx` | the recovery test (§2.1); the sweep's first property renamed to match its body (§7) |
| `pipeline/steps/10-panels-assembly/regressions.py` | `12a-DS2` |
| `pipeline/steps/11-packaging/regressions.py` | `12a-SH9`, `12a-SH10`; `12a-SH2` re-aimed |
| `../serve-llm.sh`, `../gpu-fan-control.sh` | `restart_ai_dashboard` honours `--dry-run` (§5.1) |

**Not changed:** `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md`, anything under `systemd/`, and every
production module in the auth path. Nothing was committed and nothing was deployed.

---

## 10. Spec silences and owner questions this phase leaves

| # | Question | State |
|---|---|---|
| **12a-Q2** (amended) | The build recorded it as a silence. §3 above finds that **§9 row 1 positively defines the dot** as *"one reduction over each condition's `displaySeverity`"*, which 12a's painted dot no longer is | The choice stands and is well-founded; **§9 row 1 needs the parent's wording**, which a phase may not write |
| **12a-Q4** | *How should the browser harness authenticate under §5.1?* | **TAKEN — candidate (a)**, harness-only, no production change (§1.2). If the owner prefers (b), the shim is one file and one `NODE_OPTIONS` to delete |
| **12a-Q9** (new) | `gpu-fan-control.sh install`/`uninstall` ignore `DRY_RUN` entirely, so that script's `--dry-run` promise is false for its two most destructive subcommands (§5.1) | Untouched beyond the one new function; a root-script loop |
| **12a-Q10** (new) | `.status[data-mode='paused'\|'stale']` in `header.module.css` cannot match — the attribute is on the child `.dot` — so §6.2's paused/stale hatch has never painted (§7.1) | Unfixed. Two spellings, nothing asserts it either way, and `lib/dangling-css-class.test.ts` is structurally blind to it |
| 12a-Q1, Q3, Q5, Q6, Q7, Q8 | unchanged by this phase | — |

---

## 11. Run log

⚠ Strictly serial, one at a time, and **serialised by construction rather than by care**: each
run waited on the previous process's own exit marker before starting, so no two harnesses and no
`pnpm verify` were ever alive together — which is §0's lesson applied to this phase's own tooling.
Nothing was committed and nothing was `git checkout --`'d; `next-env.d.ts`, which a hand-run
`next dev` rewrites, was restored by writing `HEAD`'s bytes back.

| command | result |
|---|---|
| `pnpm verify` (on arrival, unchanged tree) | exit 0 — 106 files, 3447 tests |
| `pnpm verify` (final) | **exit 0 — 106 files, 3455 tests, no type errors** (+8 tests: 4 header-status, 3 packaging, 1 collector-visibility) |
| `shellcheck dashboard.sh` | **clean** |
| `shellcheck ../gpu-fan-control.sh` | clean |
| `shellcheck ../serve-llm.sh` | 5 SC2015 *info* notices — 5 before this phase and 5 after |
| `pipeline/steps/11-packaging/regressions.py` | **exit 0 — 191 mutations, all bit; 85 ⚠-marked tests checked, every one reddened** (189/82 before this phase). `12a-SH9` reddens the guard table, `12a-SH10` reddens exactly the two new restart tests, and the re-aimed `12a-SH2` still bites |
| `pipeline/steps/10-panels-assembly/regressions.py` | **exit 0 — 313 mutations, all bit; 326 ⚠-marked tests checked, every one reddened** (312/322 before this phase). `12a-DS2` reddens exactly the new recovery test |
| `measure-breakpoints.mjs` | **exit 0 — 67 passed, 0 failed, 0 blocked** (§1.3–§1.5). ⚠ Two earlier runs returned 1, both on record 15d's own metric and neither on the page — see §1.4 |
| `measure-arrangements.mjs` + `check-density.mjs` | **exit 0 / ALL PASS** at 1280, 1600 and 1920 |
| `git status` | 11 modified, 2 untracked (the shim and this file); **nothing committed, nothing staged**, `HEAD` still `4a2f47a`; no stranded mutation — all 504 anchors in the two touched harnesses present exactly once afterwards |
