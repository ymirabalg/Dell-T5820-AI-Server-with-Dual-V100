# Step 10a — the shell: RECONCILIATION

Fresh agent, background subagent, no memory of this project. Read `pipeline/handoffs/10a-reconcile.md`,
`ANCHOR.md` §4/§5/§8/§9, `PLAN.md`, `SCOPE.md`, `10a-build.md`, `10a-test.md`, `10a-adversarial.md`,
and the code each finding names.

**Nothing was committed or staged. `SPEC.md` and `purity.test.ts` are untouched. Nothing outside
`dashboard/` changed.** Four spec questions are recorded in §5 for the owner.

---

## 1. Results

```
$ pnpm verify
 Test Files  79 passed (79)          (was 77)
      Tests  2399 passed (2399)      (was 2343)
Type Errors  no errors
exit 0

$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 92 distinct failing tests across 70 mutations; 86 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 70 regressions failed their check, as they must.
exit 0                               (was 34 mutations, 42 ⚠ marks)

$ pnpm build                         (run once, deliberately — see §4.4)
✓ Compiled successfully
```

⚠ **My green is not the green** (ANCHOR §8). The parent re-runs `pnpm verify` itself. `git status`
after every harness run showed no stranded mutation; the only modified tracked files are
`app/layout.tsx`, `app/page.tsx`, `package.json`, `pnpm-lock.yaml`. No `pgrep` wait loop was used;
`pnpm verify` never ran alongside a harness.

**New files:** `app/dashboard-shell.test.tsx` (the join), `app/page.test.tsx`,
`app/dashboard-shell.module.css`, `components/panel-props.ts`.

---

## 2. The adjudication — all 18

| # | Verdict | What was done |
|---|---|---|
| **F1** | **ACCEPTED** | `grid.test.tsx` gained tier 2: the rendered `className` must equal the imported `styles.<name>`. Mutation `10a-GR2` is the adversarial's own edit |
| **F2** | **ACCEPTED** | Tier 3: a *source-text* test over `grid.module.css`, named as one. Six CSS mutations, `10a-GR3`–`GR8` |
| **F3** | **ACCEPTED** | The describe was renamed to what it checks, **and** the name it used to claim was made true by F1 |
| **F4** | **DEFERRED → 10c** | Agreed with the parent; carried in `HANDOVER.md` §4. Not silently dropped — see §3.1 |
| **F5** | **ACCEPTED** | `aggregateStatus(mode, alarms, severity)`. The wording is **spec question S-A** |
| **F6** | **ACCEPTED** | `severity: null` now has a fixture; mutation `10a-H14` |
| **F7** | **ACCEPTED** | `app/dashboard-shell.test.tsx` — 21 tests, 11 mutations. §3.2 |
| **F8** | **ACCEPTED** | Same file; mutation `10a-DS6` deletes `useNowTick` exactly as the adversarial did |
| **F9** | **SPLIT — accepted in part, rejected in part** | `— ago` fixed (`10a-DS10`). The "2.5a is violated" half **rejected**; the doc tension is **spec question S-D**. §3.3 |
| **F10** | **ACCEPTED** | `stale`/`lastSeenMs` carried through the reduction and rendered. Wording is **spec question S-B** |
| **F11** | **ACCEPTED** | Both doc comments corrected. The code was right; the docs lied |
| **F12** | **DEFERRED** | **Spec question S-C.** No code. §3.4 |
| **F13** | **ACCEPTED** | One sticky band wrapping header + banner; both children lost `position: sticky`. `10a-DS7` |
| **F14** | **ACCEPTED, and further than proposed** | `count` is no longer a prop at all — the component derives it. `10a-AB4` |
| **F15** | **ACCEPTED** | `keepalive: true`, the false comment replaced, and `onLogout` is now tested. `10a-DS8` |
| **F16** | **ACCEPTED** | `components/panel-props.ts` is a real exported type, threaded to all nine slots and asserted |
| **F17** | **DEFERRED → 10c** | Outside 10a's scope (step 5's `LEDGER_FILES`). **`HANDOVER.md` now says plainly that `pnpm verify` is not deterministic, and why.** §3.5 |
| **F18** | **ACCEPTED** | `app/page.test.tsx` created; `app/layout.tsx` and `ConnectingShell` moved onto `tokens.css` |

**Sixteen accepted, two deferred, one half-rejected, none dropped.** That ratio deserves the
scrutiny ANCHOR §8 rule 2 demands of it, so §3.6 says plainly why it is this high and where I
think the adversarial was weakest.

---

## 3. The reasoning that is not visible in a diff

### 3.1 F4 — deferred to 10c, explicitly, not dropped

The adversarial proposed a repeatable browser step and argued it belongs to **10c**, not 10a; the
parent's handoff says it agrees and asks me to say so out loud rather than let it vanish. **I
agree too, and the reason is not scheduling.** A browser step run today measures nine
`PanelPlaceholder`s — the row heights, the wrap points and the scroll behaviour it would record
are all properties of a box that does not yet contain what it will contain. Worse, the test
phase's own manual pass proved the trap: the one element §6.4 makes normative, the alarm banner,
**could not be exercised at all** because no live alarm exists on that machine. A browser step
without a way to inject a fixture state will keep missing exactly the class of bug F13 turned out
to be. So 10c's step owes two things, not one: the seven measurements, **and** a way to force an
alarm-level condition client-side. Both are in `HANDOVER.md` §4.

What 10a gives it in the meantime is two honest automated tiers (F1, F2) that would have caught
every edit F1/F2 named — and neither is described anywhere as evidence of paint.

### 3.2 F7/F8 — the centre, and what the new file does and does not do

The adversarial's demonstration is the whole argument: four plausible wrong edits, applied
together, and `pnpm verify` exiting 0 across 77 files on a build whose header **can never say
"paused" or "stale"** and reads `● all healthy` on six alarms. That is `PLAN.md`'s own green
criterion for step 10 unable to fail.

`app/dashboard-shell.test.tsx` closes it with jsdom and a mocked `useTelemetry`, driving the shell
with a hand-built `RuntimeState` and a runtime of `vi.fn()`s. **Eleven mutations now bite on this
file** (`10a-DS2`–`DS16`), including each of the adversarial's four verbatim.

Three judgment calls inside it, stated because they bound what it proves:

- **The real `TelemetryRuntime` is not used**, so this is not an integration test. The runtime's
  own behaviour is `runtime.test.ts`'s, and re-driving it here would re-enter the risk profile the
  build measured once at 506 s and an OOM. What is under test is *this file's wiring* — that each
  control reaches the right method, and that each displayed fact comes from the state.
- **`runtimeStub()` is cast** (`as unknown as TelemetryRuntime`). `TelemetryRuntime` is a class
  with private fields no stub can satisfy structurally. The cast is confined to the test, the stub
  implements exactly the five members the shell calls, and the alternative was the poll loop.
- **The build's stated reason for skipping this was overstated, and the adversarial was right
  about that too.** No fake timers matched to a real cadence and no mocked `fetch` were needed for
  most of it; a module mock was enough. Fake timers appear only in the two tests that are *about*
  time (F8's tick, F10's stale age).

F8's mutation deserves its own line: deleting `useNowTick` and reading `Date.now()` at render is
the single most plausible "simplification" anyone would make to this file, and it is invisible in
a fast-cadence fixture. The test advances fake timers with the state object **referentially
unchanged** and asserts the age moves from `2 s ago` to `7 s ago` to `1:07 ago`. That is D2's whole
point, expressed as something that can fail.

### 3.3 F9 — why half of it is rejected

**Accepted half.** `formatAge(null)` is `—`, and `Header` appended ` ago` to whatever it was
handed, so a dashboard with no sample rendered `— ago`: an em dash wearing a unit word, a shape no
other formatter output in this project produces. The suffix now belongs to the caller, which
composes it only when there is an age. Mutation `10a-DS10`.

**Rejected half: the browser's pre-first-poll frame is not a 2.5a violation.** The adversarial
observed that after hydration `state` is non-null and five fields render `—`, and read that
against SCOPE §2.5a's "must not render `—`". I do not think those are the same claim.
Invariant 1 is the older and stronger rule — *"`null` renders as `—`"*, applied to a **reading**
— and every one of those five fields genuinely has no reading. What 2.5a forbids is the *page*
looking like a machine reporting nothing when in fact nothing has been asked yet, and the guard
that prevents it (`ConnectingShell`) does exactly that in the only frame where `state` is null.
Rendering `—` for `hostname` on poll 0 is the same correct answer the same field gives on poll 400
if the collector fails; making it a special case would mean inventing a second "no reading"
vocabulary, which is precisely the conflation invariant 1 exists to prevent.

**But the two documents do disagree in wording**, and that is not mine to resolve — recorded as
**spec question S-D**. I have also made `dashboard-shell.ssr.test.tsx`'s doc say plainly what
`10a-DS1` proves: the guard against the *server* frame, which is real HTML a user is served, and
**not** evidence about 2.5a's stated purpose.

### 3.4 F12 — deferred, and why this one is not F10

F10 and F12 look alike and are not. §6.5 contains a **normative sentence** the code was breaking —
"its row and the banner name the age of the reading" — so F10 is a defect, and it is fixed. F12
describes a case §6.4 never contemplates: a wall panel open since Friday, an alarm confirmed
Saturday 03:00, `since 03:00:14` on screen Monday morning. The current rendering satisfies §6.4's
own words ("when it started") and §6.4's justifying example stays inside one day. Inventing a date
prefix or an elapsed form would be inventing spec, and invariant 7 says stop and record.

Two candidate resolutions for the owner are in §5 (S-C). Worth noting for whoever answers: F10's
fix has already introduced elapsed-age vocabulary into the banner (`last read 6:12 ago`), so the
elapsed option now costs nothing new.

### 3.5 F17 — deferred to 10c, and the honest statement that goes with it

`lib/collectors/serving.test.ts:592` sleeps a **real** 95 ms inside a **real** 100 ms budget, with
20 ms HTTP fakes on top. I did not need to reproduce it under load to accept the finding: a
wall-clock sleep at 95 % of a wall-clock budget is a race by construction, and the adversarial
observed it failing an unprompted `pnpm verify` plus 2 of 6 runs under contention.

Why it is not fixed here: it is **step 5's** test, in **step 5's** `LEDGER_FILES`, and 10a's scope
is the shell. Editing another step's harness coverage from inside this loop is the kind of
scope drift the phase protocol exists to prevent, and 10c is already the loop that owns
cross-harness work (Q1 F4's runner).

Why deferring it is not the same as ignoring it — and this is the part that matters:

> **`pnpm verify` is not currently deterministic.** A ⚠-marked test that reddens probabilistically
> is worse than a mutation that does: `regressions.py` unions every red test name across all
> mutations into `covered`, so a contention-driven failure of this test during *any* mutation run
> credits it as covered by a mutation that never touched it. Every harness in the project shares
> that exposure, including this one. ANCHOR §5 already says a probabilistic *mutation* is worse
> than none; this is the same disease one level over.

That paragraph is now in `HANDOVER.md` §3, not only here. 10a raised the file count 77→79 and adds
a fifth jsdom environment, which increases per-run worker contention — it plausibly makes an
existing latent flake likelier, and that is a reason to say so loudly rather than to leave it
unstated. **The fix belongs with an injected clock, not a wider margin**: the 95-vs-100
relationship is the property under test, so widening it weakens the test rather than steadying it.

**Operational, from the adversarial's own notes:** it found a live `until … sleep 5; done` wait
loop from a *different* session still spinning (ANCHOR §9's exact pattern). The parent said it
killed two orphans. I started no background process and left none.

### 3.6 On the near-absence of rejections

ANCHOR §8 rule 2: *"a run with zero rejections gets the same scrutiny, not less — zero is the
shape a rubber-stamp makes."* So, plainly:

**Eleven of the eighteen findings were EXECUTED** — the adversarial ran the wrong edit and pasted
the green output. There is nothing to adjudicate in "I made this change and 19/19 passed"; the
only question left is whether the change is one anyone would plausibly make, and in every case it
was either a simplification (F8), a copy-paste (F1), or a hard-coded literal (F7). The seven
reasoned findings are where judgment was actually needed, and that is where the two deferrals and
the one rejection sit (F4, F12, F17, and half of F9).

Where I think the adversarial was **weakest**, recorded so the parent can weigh it:

- **F9** conflated a rendering wart with a spec violation, and the violation half does not survive
  contact with invariant 1.
- **F14** was filed as "not urgent … a contract with no enforcement". I went *further* than it
  proposed (removing the prop entirely rather than asserting the relation) because the finding's
  own framing — a lying count in a component whose job is a count — argues for making it
  unrepresentable rather than tested. That is me extending a finding, and it should be read as my
  call, not the adversarial's.
- **F18's second half** (layout colours) was correct but under-argued: the real reason it matters
  is not tidiness, it is that `ConnectingShell` is the only thing a user sees during the
  server-rendered frame, and it was painting itself in colours no panel uses.

And where the adversarial was **strongest**: F1 and F7 are the two findings that change what this
step's green *means*. Both were executed, both were reproduced by me as mutations, and both now
have coverage that would have failed on the exact edit it demonstrated.

---

## 4. What changed, file by file

### 4.1 The green criterion

| File | Change |
|---|---|
| `app/dashboard-shell.test.tsx` | **New.** 21 tests. The join: mode/alarms/severity/preferences threading, all four controls, the D2 tick, the stale banner age, the sticky band's DOM shape, logout's `keepalive`, the nine `panelId`s |
| `app/dashboard-shell.ssr.test.tsx` | Doc corrected: its "what this does not cover" note pointed at a gap that is now closed elsewhere, and `10a-DS1` is named for what it proves (the SSR frame, not 2.5a's browser case) |
| `components/grid.test.tsx` | Tier 2 (`className` = `styles.<name>`) and tier 3 (the stylesheet's own area maps and breakpoints). The misnamed describe renamed. One ⚠ **dropped** — the nine-distinct-identifiers check is a vacuity guard on the technique, which no source mutation can redden; `purity.test.ts`'s own unmarked guards are the precedent |

### 4.2 The reductions

| File | Change |
|---|---|
| `lib/client/header-status.ts` | `aggregateStatus(mode, alarms, severity)`. `live` + 0 alarms + `severity === null` → `'no readings'`, never `'all healthy'`. Every other mode is unchanged: none of them makes a health claim |
| `lib/client/banner.ts` | `BannerCondition` carries `stale` and `lastSeenMs` |
| `components/alarm-banner.tsx` | `count` removed from the props and derived from the list; `AlarmBannerItem.age` renders for a stale condition, on the lead **and** in the rest list |
| `components/header.tsx` | Passes `severity` to `aggregateStatus`; no longer appends ` ago` |

### 4.3 The assembly

| File | Change |
|---|---|
| `app/dashboard-shell.tsx` | One sticky band around header + banner (F13); `keepalive: true` and a corrected comment (F15); the age suffix composed here (F9); `staleAgeText` (F10); `PanelProps` threaded to all nine slots (F16); `ConnectingShell` on tokens (F18) |
| `app/dashboard-shell.module.css` | **New.** `.stickyBand` — the one sticky element on the page |
| `components/header.module.css`, `components/alarm-banner.module.css` | `position: sticky` removed from both, with the reason written where the wrong comment used to be |
| `components/panel-props.ts` | **New.** `PanelProps` and `PanelId` — the contract 10b typechecks against |
| `components/panel-placeholder.tsx` | Implements `PanelProps`; renders `data-panel-id` so the namespace is observable |
| `app/layout.tsx` | Imports `tokens.css`; body colours are `var(--surface-0)` / `var(--ink-secondary)` |
| `app/page.test.tsx` | **New.** The entry point had no test at all |

### 4.4 One `pnpm build`, deliberately

F13 and F18 add the first CSS module under `app/` and the first global stylesheet import in the
root layout. Both are ordinary Next features, but "writing the config is not evidence it took" is
this repo's own house rule, so I ran `next build` once: it compiles, all five routes still build,
and the standalone output is unchanged in shape. The build's jsdom trace claim (`10a-build.md`
§4.5) is not re-verified here — nothing about it changed, and no non-test file imports jsdom.

---

## 5. ⚠ New spec questions for the owner — four, invariant 7

Each is implemented conservatively **or** left alone, and each names what the code does today so
the owner is ruling on a real string rather than a hypothetical.

**S-A — what the header reads when nothing has a band yet.** §6.2 gives three literals
(`● all healthy`, `❙❙ paused · 6 alarms`, `⊘ stale · 6 alarms`) and none covers `severity === null`
with `alarms === 0` — the state of every page load between hydration and the first poll, and of
any poll that produces no banded reading. §9 forbids the obvious answer: *"not `'normal'`, which
would claim health for a poll that produced nothing."* **Implemented as `● no readings`.**
Alternatives considered: `● —` (rejected — the status line already carries `— — · —` beside it and
a fourth dash is mush) and leaving `all healthy` (rejected — it is the dot and the text disagreeing
three pixels apart, which is exactly what §9's "one reduction" forbids).

**S-B — how the banner names a stale reading's age.** §6.5 requires "its row and the banner name
the age of the reading" and gives no wording. **Implemented as `last read 6:12 ago`**, coloured
`--status-watch` rather than `--status-alarm` — the condition is still an alarm; what this says is
that nobody has been able to look since, which is a different fact and must not read as a second
alarm. The row half is 10b's (SAFETY) and should use the same words.

**S-C — a "since" older than a day (F12, NOT implemented).** `since 03:00:14` on a wall panel open
since Friday is indistinguishable from six hours ago. §6.4's example stays inside one day and
decision 7 makes multi-day the expected case. Candidates: an elapsed form (`for 2 d 06:00` —
`formatUptime`/`formatAge` already have the vocabulary, and F10 has now put elapsed text in this
banner anyway) or a date prefix when the instant is not today. **Nothing changed pending a ruling.**

**S-D — does SCOPE §2.5a govern the browser's pre-first-poll frame?** SCOPE says `state === null`
is "before the first poll … must not render `—`"; in a browser `state` is non-null from the first
render, five header fields are legitimately `null`, and invariant 1 says they render `—`. The two
readings are both defensible and they are in different documents. My reading is in §3.3. A
sentence in §6.2 or in SCOPE would settle it; today the code follows invariant 1.

---

## 6. What 10a still cannot prove — carried forward unchanged

Restated so 10b and 10c inherit it as fact rather than as a claim that quietly aged out:

- **No test in this project proves a browser paints §6.1's grid where §6.1 says.** Three tiers now
  guard the wiring, the class binding and the stylesheet's own text. None of them is paint. The
  one measured browser pass (`10a-test.md` §1.2) is a fact about one commit of one file, not a
  regression guard. **F4, owned by 10c.**
- **The sticky band's `position: sticky` is unobservable in jsdom.** What is asserted is the DOM
  shape the fix depends on — header and banner inside one element carrying `.stickyBand`. Whether
  it pins correctly needs 10c's browser step, **with an injectable alarm state**, or F13's
  successor will be found the same way.
- **`--table-scroll-max: 40vh`** is still Q2-S2's recorded stopgap (SCOPE 2.5f). 10a's grid gives a
  panel body a bounded ancestor for the first time, so the replacement is now *possible*; it is
  10c's, and it wants a browser to confirm.
