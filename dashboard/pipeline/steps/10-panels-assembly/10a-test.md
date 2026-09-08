# Step 10a — the shell: TEST phase

Fresh agent, no memory of this project or of the build phase. Read the handoff, `10a-build.md`,
`SCOPE.md`, `SPEC.md` §6.1/6.2/6.4, `ANCHOR.md` §4/5/8, and `PLAN.md` before doing anything else.
This document re-derives the build's three self-reported findings, answers the handoff's
highest-priority question with real evidence (not just re-reading the build's claim), and closes
two gaps the build did not name.

---

## 1. ⚠ THE ANSWER: the grid half of the green criterion IS now genuinely tested — in a real
   browser, which I opened. Before this pass it was not, and the build's own admission of that
   was accurate.

**Short version.** I ran `pnpm dev` (with a generated `PASSWORD_HASH`/`SESSION_SECRET`), opened
the real dashboard in Chrome, logged in, and read `getBoundingClientRect()`/`getComputedStyle()`
off the live DOM at seven widths. Every claim SPEC §6.1 makes about placement is now backed by
measured pixels, not by authorship-against-ASCII. I also independently re-derived, rather than
took on trust, that jsdom cannot see any of this — so the choice to open a browser was not
optional colour, it was the only way to check the claim at all.

### 1.1 jsdom genuinely cannot see any of this — re-derived, not assumed

Three checks, each a standalone probe run against this exact `vitest.config.ts` and then deleted:

1. `import styles from './grid.module.css'` inside a jsdom test resolves `styles.gpu0` to a real,
   Vite-generated locally-scoped class name (`_gpu0_e75739`) — so a className-based assertion is
   *possible* in principle — **but the CSS rules themselves are never injected into the jsdom
   document**: `document.querySelectorAll('style')` and `('link')` are both empty after mounting
   `<Grid/>`. There is nothing for a computed style to read.
2. `window.matchMedia` **is not a function** in this project's jsdom setup — throws
   `TypeError: window.matchMedia is not a function`. The three breakpoints cannot be evaluated at
   all, by anything, in this environment.
3. `getBoundingClientRect()` on a real jsdom element returns all-zero (`{x:0,y:0,width:0,
   height:0,...}`) unconditionally — jsdom has no layout engine, confirmed empirically rather than
   quoted from jsdom's own docs.

So `components/grid.test.tsx`'s own doc comment (*"CSS grid placement is not observable in
jsdom"*) is not a hedge — it is exactly true, in three independent ways, for this codebase's
actual test configuration. **A source-text or `data-slot` assertion is an honest proxy for "the
CSS file says the right thing," never for "a browser paints it there."** They are different
claims and the second one needs a browser. This closes the "could jsdom secretly do this if
configured differently" question the handoff left open — the answer for *this* project's config
is no, on all three counts.

### 1.2 What I did in the real browser

`pnpm dev` (Next 16, Turbopack) needs `PASSWORD_HASH`/`SESSION_SECRET` in the environment or the
login page refuses everything (by design — §5.1). I generated both locally
(`echo pw | python3 scripts/hash-password.py`, `openssl rand -hex 32`), started the dev server,
logged in via `claude-in-chrome`, and drove `window.innerWidth`/`getBoundingClientRect()`/
`getComputedStyle()` directly through the JS console tool. **No server code, config, or fixture
was modified; nothing was written to the box (there is no box involved — this is the Next dev
server on the Mac); the dev server and the browser tab were both torn down before finishing, and
`next-env.d.ts`'s incidental `next dev` rewrite was reverted** (`git status` below is clean of it).

**≥1280px (3440px actual, but CSS-identical to 1280–1599 and the shared ≥1600 config):**

| slot | x | y | w | h |
|---|---|---|---|---|
| gpu0 | 12 | 61 | 1702 | 99 |
| gpu1 | 1726 | 61 | 1702 | 99 |
| cooling | 12 | **172** | 1702 | **210** |
| cpu | 1726 | 172 | 845 | 99 |
| memory | 2583 | 172 | 845 | 99 |
| safety | 1726 | 283 | 845 | 99 |
| storage-and-network | 2583 | 283 | 845 | 99 |
| serving | 12 | 394 | 1702 | 99 |
| session-event-log | 1726 | 394 | 1702 | 99 |

`cooling`'s box starts at the same `y` as row 2 (`cpu`/`memory`, y=172) and its height (210 =
99 + 12 gap + 99) reaches exactly to the bottom of row 3 (`safety`/`storage`, y=283, height 99 →
bottom 382; `cooling` bottom = 172+210 = 382). Its `x`/width match `gpu0`'s (columns 1–2). **This
is COOLING spanning rows 2–3 in columns 1–2, measured, not inferred from the CSS text.**

**900–1279px (measured at 1150px):** `gpu0`/`gpu1` side by side (row 1); `cooling` full width,
ONE row only, `y=172,h=99` (row 2 — no span here, correctly, since §6.1's span is specific to
≥1280px and the build's own 900–1279 decision doesn't claim one); `cpu`/`memory` (row 3);
`safety`/`storage` (row 4); `serving` full width (row 5); `session-event-log` full width, last
(row 6). **Exact match to `grid.module.css`'s documented 900–1279 decision** (§5.4 of
`10a-build.md`).

**<900px (measured at 820px):** every slot full width, one column, and the render order by `y`
is: `gpu0(88) < gpu1(199) < cooling(310) < safety(421) < serving(533) < cpu(644) < memory(755) <
storage(866) < log(977)`. **This is exactly** §6.1's stated order (`GPUs → cooling → safety →
serving → host → storage`, with `GPUs = gpu0,gpu1` and `host = cpu,memory`) **with the build's
own `log`-last decision**, measured end to end.

**Breakpoint boundaries, checked at the pixel:**

| width | columns | cooling height |
|---|---|---|
| 899px | 1 (`875px`) | — |
| 900px | 2 (`432px 432px`) | — |
| 1279px | 2 (`621.5px 621.5px`) | — |
| 1280px | 4 (`305px×4`) | **242px** (spans) |

The breakpoints fire at exactly 900px and exactly 1280px — not "near" those numbers, not off by
a scrollbar width, not gated on some other computed value. This directly answers the handoff's
"what would have to break for a test to go red" framing: today, a media-query typo (`899px`
instead of `900px`, or vice versa), a `grid-template-areas` string that dropped `cooling`'s
second row, or a swapped priority order at <900px would all have shown up as a wrong number or a
wrong `y`-order in the table above. None did.

**Sticky, checked as a bonus** (Q2-S2's own precedent, since I had the browser open): scrolled
the page 400px at a narrow width; `getComputedStyle(header).position === 'sticky'` and
`header.getBoundingClientRect().top === 0` while scrolled — the header genuinely stays pinned.
**I could not exercise the banner's sticky behaviour**: this dev session has no real hardware
behind it, so every condition is healthy and the banner never mounts (`count === 0` → renders
`null`, correctly, per §4.2). Confirming the banner's sticky CSS needs either a live alarm on the
real box or a way to fake one client-side, and I did not build that fixture — recorded as the one
piece of the "what this suite cannot prove" list (`10a-build.md` §7) that is **still** unverified
after this pass, honestly, rather than silently dropped.

### 1.3 Verdict

**Before this pass:** the grid half of `PLAN.md`'s green criterion was asserted (by authorship
against the ASCII) but not tested by anything that could go red for a real placement bug. The
build said so plainly and that was correct.

**After this pass:** it is measured, in a real browser, at all three CSS configurations and both
of their exact boundary pixels, plus the two decisions §6.1 leaves silent (900–1279 placement,
<900 ordering). This was a manual verification this session performed, not a new automated test
— it does not run under `pnpm verify` and will not catch a future regression by itself. I did not
wire it into `regressions.py` because a browser-driven check does not fit that harness's
`pnpm vitest run <file>` shape, and inventing a Playwright/Chrome harness is bigger than this
phase's remit. **Recorded as a real finding for reconciliation**: the grid's correctness is now
established for this specific commit of `grid.module.css`, but nothing automated will notice if
it regresses. If that risk matters enough to the owner, the fix is a small Playwright (or
equivalent) suite asserting the same seven measurements above — not a jsdom trick, because §1.1
shows jsdom structurally cannot do this in this project's configuration.

---

## 2. The build's three self-reported findings — re-derived, not trusted

### 2.1 The inert `toContain('paused')` fix — confirmed correct, AND a sibling found and fixed

Re-derived by mutating `header.tsx`'s `data-mode="paused"` path independently and confirming the
*fixed* test (`toContain('paused · 6 alarms')`) reddens while the *original* loose shape would
not have — matches the build's account exactly.

**A sibling exists, and I found and fixed it.** `header.test.tsx`'s `'refresh now and a pause
control both render'` test asserted `expect(html).toContain('refresh')`. This is inert:
`header.tsx` also renders `<span className={styles.controlLabel}>refresh</span>` (the cadence
control's own §6.2 label) and `aria-label="refresh cadence"` on the cadence `<select>`, both of
which independently satisfy the substring. **Proved by mutation**: I changed the refresh-now
button's visible text to `⟳ MUTATED-NO-REFRESH-TEXT` and re-ran the test file — the render test
stayed green; only the separate interaction test (which locates the button by
`textContent?.includes('refresh')`) went red. Fixed the assertion to check the button's own
unique glyph+text (`toContain('⟳ refresh')`), re-verified it reddens under the same mutation,
restored the source file (`git status` confirms clean), and added a new mutation,
**`10a-H13`**, to `regressions.py` so this is now covered by the ledger rather than trusted by
inspection. I grepped every other `toContain(...)` call across all nine of 10a's new test files
for the same shape (a literal substring that also occurs in an unrelated attribute or label) and
found no second instance — `'pause'`, `'logout'`, `'stale'`, etc. are each unique to their own
control in the rendered markup.

### 2.2 The removed `useSyncExternalStore` mutation — the build's decision is correct, and I
   found something worth recording alongside it

I did not re-run the actual dangerous mutation (dropping `held.current === null &&` in
`use-telemetry.ts`) — the project's own history (the five-hour `pgrep` loop, this exact 506
s/OOM) argues against re-triggering a reportedly catastrophic failure just to watch it happen
again, and the build's account (unstable `getSnapshot` identity tripping React's tearing-retry
path) is mechanically the right shape of explanation.

Instead I built an **isolated, safe** repro of the general mechanism: a bare component calling
`useSyncExternalStore(subscribe, () => ({}), () => ({}))` (a getSnapshot returning a fresh object
every call — the same instability class, with none of `TelemetryRuntime`'s real timers/fetches).
Mounted with `act()`/`createRoot()` in jsdom, **this failed in 494 ms** with a clean, thrown
`Error: Maximum update depth exceeded` — not a hang.

This is a genuinely useful data point the build did not have: **the bare React mechanism fails
fast and cleanly; only the combination with `TelemetryRuntime`'s real effect (a real
`runtime.start()`/`stop()` pair re-firing on every forced re-render, plus whatever timers/promises
that spawns) turns it into the reported 506 s OOM.** That means the pathology is not an inherent,
unavoidable property of "test this exact bug" — in principle, a mutation against a *narrower* unit
(the ref-guard alone, decoupled from `useSyncExternalStore` and from `TelemetryRuntime`'s side
effects) could plausibly redden cleanly. But building that would mean either extracting the guard
into its own tiny testable function (a small refactor of "the thinnest thing in this project",
which `use-telemetry.ts`'s own doc explicitly argues against doing for twelve rule-free lines) or
accepting the same risk profile that already cost 506 seconds once. **I did not attempt it.**

**Judgment: leave it unmarked, as the build did — but for a slightly sharper reason than "no
mutation is possible."** The accurate statement is "no mutation *of this exact code, tested this
way* is safe to attempt twice," not "the property is untestable in principle." I recorded this
distinction because a future phase might legitimately revisit it via a refactor; today, redoing
the experiment to find out is not worth the risk for a twelve-line hook with one already-recorded
catastrophic data point.

### 2.3 The `@vitest-environment` pragma-anywhere-in-file bug — reproduced independently, confirmed real, no other file at risk

Built a throwaway test file whose only docblock mentions `@vitest-environment jsdom` in prose
(quoting it the way an early draft apparently did), with no real pragma at the top. Vitest pulled
it into jsdom anyway — `typeof window` was `'object'`, not `'undefined'`. This is a real defect
in Vitest's docblock scanner (matches the whole file, not just a pragma-position comment), exactly
as the build described. Grepped every `.test.ts`/`.test.tsx` in the repo for the string
`vitest-environment`: only three files contain it, and all three are legitimate — two carry it as
their own real pragma with no other mention (`app/use-now-tick.test.tsx`,
`lib/client/use-telemetry.test.tsx`), and `components/header.test.tsx` carries both a real pragma
*and* a prose mention of its own filename's requirement, which is harmless (it already needs
jsdom regardless of the prose). **No other file at risk; the fix (`use-telemetry.ssr.test.tsx`
describing its sibling by name rather than by pasting its pragma) is sufficient and the doc
comment explaining why is accurate.**

---

## 3. Mutation count — reconciled

`grep -c '("10a-'` returns one more than the harness's reported mutation count because line
`bad_prefix = sorted(k for k in seen if not k.startswith("10a-"))` (part of `_assert_unique_ids`,
not a mutation entry) also matches the literal substring `("10a-` inside `startswith("10a-")`.
**Not a missing mutation — a grep false positive against guard code.** The harness's own printed
count is correct and computed from `len(REGRESSIONS)`, not from a hand-maintained number.

I then added two mutations of my own (§2.1, §4 below), so the count is no longer 32 either way:
**34 mutations, 42 ⚠-marked tests, all covered**, confirmed by a full harness run (§6).

---

## 4. A gap the build did not name: `dashboard-shell.tsx` had no test at all

`app/dashboard-shell.tsx` is, in the build's own words, "the entire stateful surface of the
dashboard" and owns 2.5a's one `state === null` guard — the guard invariant 1 depends on to keep
"before the first poll" from ever rendering an em dash. There was no `dashboard-shell.test.*` of
any kind. `10a-build.md` §7 ("what this suite cannot prove") lists CSS/grid/sticky as the known
gaps but does not mention this one.

**Re-deriving why the guard is hard to hit, rather than assuming it needs a heavy integration
test:** `use-telemetry.ts`'s own contract makes `state`/`runtime` null **only when `window` is
undefined** — i.e. only during a server render. `held.current` is populated synchronously on the
very first client render, so in a real browser (confirmed directly: the live dashboard never
showed "connecting…", not even for one frame) `ConnectingShell` is unreachable outside SSR. That
means the guard is fully testable, cheaply, with `renderToStaticMarkup` and no `window` at all —
exactly `use-telemetry.ssr.test.tsx`'s own pattern for the other half of D6.

**Added `app/dashboard-shell.ssr.test.tsx`**: proves a server render shows "connecting…" and
nothing else (no formatted `—`, no header, no grid, no panel placeholder). Verified it reddens
cleanly and fast (no OOM risk here — this is a synchronous null-dereference, not an unstable
snapshot) by temporarily changing the guard to `if (false)`: `latestSample(state)` threw
`Cannot read properties of null (reading 'ring')` and all three new tests failed immediately.
Restored the source (`git status` clean). Wired it into `regressions.py` as **`10a-DS1`** and
added the file to `LEDGER_FILES`.

**What is still NOT covered, named plainly rather than left implicit a second time:** once
`state` is non-null (every real client render), `DashboardShell`'s field-by-field wiring —
`Header`'s `ageText`/`severity`/`mode` props, the banner's `toBannerItem` mapping, `onLogout`'s
fetch-then-navigate — has no automated test. Doing that properly needs jsdom, fake timers matched
to `useTelemetry`'s real poll cadence, and a mocked `fetch`; it is a reasonable follow-up, not
something I attempted here given the risk profile already established for anything that drives
the real runtime's timers (§2.2).

---

## 5. The props contract, read as 10b would read it

Two things are genuinely precise and 10b can typecheck against them without asking a question:
`components/grid.tsx`'s exported `GridProps` (nine named slots, exact spelling) and `CHART_SIZE`
(a real exported const with two named sizes). `PanelShell`'s `title · subtitle · chip` contract
is inherited from step 9 and unchanged.

**One real ambiguity, worth flagging rather than fixing speculatively.** `10a-build.md` §2.2's
`PanelProps { state, nowMs, ... }` and §2.4's "SVG id discriminator, the grid slot's own name"
are **prose-only decisions with no corresponding code artifact** — there is no exported
`PanelProps` type anywhere in the repo, and `PanelPlaceholder`'s actual props
(`{ title: string }`) do not carry `state`, `nowMs`, or any id-discriminator at all today. The
build's own doc claims "the exact prop shape (`RuntimeState`, `nowMs`) are already wired end to
end from the telemetry hook down" — this overstates the code: `state` and `nowMs` exist as local
variables inside `dashboard-shell.tsx`, but nothing threads them to any placeholder yet. The
"one-line swap" 10b is promised is still basically accurate (adding two props alongside the
component swap is small), but the **name** of the id-discriminator prop (`panelId`? `idPrefix`?
`slot`?) is not decided anywhere a compiler would catch a mismatch — nine independently-written
panels could each invent a different convention. I did not add a speculative `PanelProps` type or
thread a discriminator prop myself: doing so would mean guessing at 10b's actual shape needs,
which is precisely the failure mode `SCOPE.md` warns 10a itself against ("against a guess about
what each panel needs rather than what its body actually turns out to need"). Recorded as a
finding for reconciliation to decide: either 10b picks the name itself (fine, and worth saying so
explicitly rather than leaving it silently implied to be "already wired"), or a follow-up adds
the real `PanelProps` type before 10b starts.

Everything else in the contract (read `state.displayed` never `conditionsFrom`; a chip's colour
is undebounced; hatch `state.gaps`; 600 points per series) is inherited prose from earlier steps,
restated correctly and not new ambiguity.

---

## 6. D2's age tick — confirmed independent, by direct inspection and the existing test

`app/use-now-tick.ts` is a plain `useState`/`useEffect`/`setInterval` reading `Date.now()`; it
imports nothing from `useTelemetry`, `RuntimeState`, or any store. `app/use-now-tick.test.tsx`
proves three interval advances produce three distinct increasing values with the exact same
component/props mounted throughout (`mount(1000, values)` once, then only `vi.advanceTimersByTime`
— no re-render forced from outside). A rewiring to derive from the store would necessarily add
either a `useSyncExternalStore`/`useTelemetry` call or a `state` dependency to this file, and
`purity.test.ts`'s own hook-shape scanner would not stop that (it only forbids hooks in
`components/`, not `app/`) — but the existing `10a-NT1`/`NT2` mutations only touch this file's own
`setInterval` logic, so a *rewiring* mutation (make the tick derive from a mock store instead) is
not covered. I judged this low-value to add: the doc-level argument for why a store-driven tick is
wrong is solid and the file's total independence from any store import is visible by inspection
in twelve lines — a mutation harness earns less here than it does for logic with a real branch to
get wrong.

---

## 7. Invariant 1, both directions

- **Wrapper direction (null = before first poll, must not render `—`):** now tested — §4 above.
- **Everywhere else (null = no reading = `—`; zero = the numeral with its unit):** delegated to
  `lib/format.ts`'s formatters, already tested in step 2, and 10a's new code (`header-status.ts`,
  `banner.ts`, `dashboard-shell.tsx`) never re-implements a formatter — confirmed by reading every
  import in those three files. No new violation surface.

---

## 8. Scope call on `lib/client/header-status.ts`/`banner.ts` — code assessed, not the scope question

Not mine to rule on (the parent owns that), but the code itself is sound: both are pure,
hook-free, exhaustively-typed (`Record<RuntimeMode, ...>` forces a compile error on a missing
mode), and their tests use exact-match assertions (`toBe`/`toEqual`) throughout rather than the
loose `toContain` shape that caused §2.1's bug — so whatever the scope ruling, the code quality is
not in question.

---

## 9. Results

```
$ pnpm verify
 Test Files  77 passed (77)
      Tests  2343 passed (2343)
Type Errors  no errors
```

(76→77 files, 2340→2343 tests: `app/dashboard-shell.ssr.test.tsx`, new, +3 tests.)

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 46 distinct failing tests across 34 mutations; 42 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 34 regressions failed their check, as they must.
[exit 0]
```

(32→34 mutations: `10a-H13` for §2.1's sibling fix, `10a-DS1` for §4's new file. `42` marked
tests, up from the build's 38, for the same two additions plus the fixed test's own ⚠.)

```
$ git status --short
 M app/page.tsx
 M package.json
 M pnpm-lock.yaml
?? app/dashboard-shell.ssr.test.tsx
?? app/dashboard-shell.tsx
?? app/use-now-tick.test.tsx
?? app/use-now-tick.ts
?? components/alarm-banner.module.css
?? components/alarm-banner.test.tsx
?? components/alarm-banner.tsx
?? components/grid.module.css
?? components/grid.test.tsx
?? components/grid.tsx
?? components/header.module.css
?? components/header.test.tsx
?? components/header.tsx
?? components/panel-placeholder.module.css
?? components/panel-placeholder.test.tsx
?? components/panel-placeholder.tsx
?? lib/client/banner.test.ts
?? lib/client/banner.ts
?? lib/client/header-status.test.ts
?? lib/client/header-status.ts
?? lib/client/use-telemetry.ssr.test.tsx
?? lib/client/use-telemetry.test.tsx
?? pipeline/handoffs/10a-shell.md
?? pipeline/handoffs/10a-test-phase.md
?? pipeline/steps/10-panels-assembly/10a-build.md
?? pipeline/steps/10-panels-assembly/regressions.py
```

`app/page.tsx`/`package.json`/`pnpm-lock.yaml` are exactly the build's original diff (unchanged by
this pass). `next-env.d.ts` was transiently modified by running `pnpm dev` for §1's browser check
and was reverted (`git checkout -- next-env.d.ts`) before finishing — it does not appear above.
`purity.test.ts` remains untouched (`git diff --stat` empty) and passing (36/36). No stranded
mutation from any experiment in this pass — every source file I temporarily edited
(`components/header.tsx`, `app/dashboard-shell.tsx`) was backed up first, restored after, and
confirmed identical via `git status`/`git diff` before moving on. No `pnpm verify` was ever run
concurrently with a harness; the harness was never polled with `pgrep`.

Not committed, per the rules. `SPEC.md` and `purity.test.ts` untouched.
