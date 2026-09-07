# Step 1 — Scaffold & contract · adversarial notes

Written 2026-09-06. No source, test or config file was modified in a way that survived this
phase. Every mutation below was applied, measured, and reverted; `md5` of `lib/types.ts`,
`lib/types.test-d.ts`, `lib/contract.test.ts`, `tsconfig.json`, `next.config.mjs`,
`package.json`, `vitest.config.mts`, `app/page.tsx`, `app/layout.tsx` and `next-env.d.ts`
match the values taken before I started. `git status` at the repo root is `M .gitignore`
(pre-existing) + `?? dashboard/`, identical before and after. Two throwaway probe files
(`lib/__adv_probe.ts`, `lib/__adv_probe2.ts`) were created and deleted; `lib/` holds three
files again. `.next/` was moved aside for a clean-tree experiment, restored, and then
regenerated with `pnpm build`.

**Confirmed by execution** and **reasoned but unverified** are marked per finding.

---

## Summary

The step is substantially solid. Illegal channel-5 states really are unrepresentable, the
branded units really do block cross-unit assignment, invariant 4's forbidden fields really
are absent, the toolchain really is reproducible on linux/x64, and all three claimed
regressions reproduce exactly. The tests are load-bearing, not decorative.

But the *enforcement is uneven*, and the unevenness is invisible: the tests protect the
fields that happen to appear in a fixture or a bespoke assertion and leave the rest open.
Four distinct loosenings pass the full suite at 34/34 with `typecheck` exit 0. And one
documented cross-field invariant is simply false — the build's own fixture disproves it —
in a way that will manufacture a hardware alarm out of a `null` when step 6 obeys it.

---

## F1 — HIGH · The `pwm5Present ⟺ ch5Mode === null` invariant is false, and following it fabricates a SAFETY alarm from a null reading

**Claim it breaks.** `lib/types.ts:421` and build.md §4.6:

> Invariant: `pwm5Present === false` ⟺ `cooling.ch5Mode === null`. Both come from the same
> probe and must agree; whoever assembles the snapshot derives one from the other rather
> than reading twice.

**The build's own fixture disproves it.** `lib/contract.test.ts:143-182`, `nothingReadable`:

```ts
cooling: { …, ch5Mode: null, ch5Pwm: null, … },
safety:  { ufwEnforcing: null, pwm5Present: null, … },
errors:  [{ source: 'dell_smm', message: 'no hwmon named dell_smm' }],
```

Under `⟺`, `ch5Mode === null` forces `pwm5Present === false`. The fixture says `null`.
The fixture's own docstring is self-contradictory too — "Every reading failed" (so the
check could not be performed → `null`) and "The DKMS module is not loaded" (so the check
was performed and failed → `false`) in one sentence.

**Why the fixture is right and the invariant is wrong.** `ch5Mode === null` is the union of
two distinct facts:

| what happened | `pwm5Present` | `ch5Mode` |
|---|---|---|
| `dell_smm` hwmon found, no `pwm5` node — DKMS module not loaded | `false` | `null` |
| `dell_smm` hwmon not found at all — `/sys` not mounted, module absent, name changed | `null` | `null` |

`Safety`'s own doc comment (`lib/types.ts:398-402`) states the second row's rule
explicitly: "`null` means the check could not be performed … A missing
`/etc/ufw/ufw.conf` is not evidence that ufw is enforcing, and it is not evidence that it
is not." The same reasoning applies to a missing hwmon node and to `pwm5Present`.

Only one direction holds: **`pwm5Present === false` ⟹ `ch5Mode === null`**. The converse
does not.

**Concrete failure scenario.** Step 6 obeys the instruction and writes
`pwm5Present = cooling.ch5Mode !== null`. Someone typos the `-v /sys:/sys:ro` mount in
`dashboard.sh` (step 11), or `dell_smm_hwmon` is not loaded on a rescue boot into
`7.0.0-14-generic` — the kernel `/lib/modules` still carries with no DKMS line, per
CLAUDE.md. The cooling collector correctly reports `ch5Mode: null` ("unknown"). The safety
field is then derived as `false`, which §3.6 defines as *"DKMS 5-fan module did not load —
**GPU fan control is gone**"* and §6.3 makes an alarm with no watch band. §6.4 pins a
sticky banner asserting a hardware failure the dashboard has no evidence for, on the panel
§6.2 calls "the panel that earns the dashboard's existence". Absent silently became a
definite negative — invariant 1 inverted, in the one place it was most carefully defended
everywhere else.

**Established by.** Reading `lib/types.ts:418-425`, `lib/contract.test.ts:143-182`,
build.md §4.6, SPEC §3.6 / §6.3 / §6.5. Plus compile probe P9 (below), confirming the type
system permits any combination of the two fields. **Reasoned, with the contradiction
confirmed by reading.**

---

## F2 — HIGH · Closed vocabularies are asserted as aliases, never as field types; four fields widen to `string` with the suite fully green

**Claim it breaks.** build.md §4.5 ("No bare `string` where the spec fixes values") and
`lib/types.test-d.ts:172-177`:

> Widening any of these to `string` — the easy thing to do when a collector meets a value
> it did not expect — fails here.

It does not. `ClosedVocabularies` asserts `Equals<UnitState, 'active' | …>` — a property of
the **alias**. No test requires any *field* to use that alias. Only one field is pinned:
`Cooling['ch5Mode']` at line 193.

**Confirmed by execution.** Each mutation applied to `lib/types.ts` alone, then reverted:

| mutation | `pnpm test` | `pnpm typecheck` |
|---|---|---|
| `Network.link: LinkState \| null` → `string \| null` | 34 passed, exit 0 | exit 0 |
| `ServingInstance.unitState: UnitState \| null` → `string \| null` | 34 passed, exit 0 | exit 0 |
| `ServingInstance.health: HealthState \| null` → `string \| null` | 34 passed, exit 0 | exit 0 |
| `CoolingChannels.serviceState: UnitState \| null` → `string \| null` | 34 passed, exit 0 | exit 0 |

`noUnusedLocals` does not fire, because the aliases stay exported.

**Concrete failure scenario.** Step 5 owns the D-Bus collector, and D-Bus hands back
`ActiveState` as a raw string. The shortest path is `unitState: raw`, which needs either
this widening or a `raw as UnitState` cast — the contract stops neither. §6.3's band is
`active` normal / `activating` watch / `failed`,`inactive` alarm; step 2 will write a
`switch` over it. A value outside the set — `reloading` (systemd returns it, and §6.3 does
not map it: the build's own gap 4), or `"active "` with trailing whitespace off a naive
line split — falls to the `default` arm and renders as *normal*. A `failed`
`llama-server@1` shows a green dot. Same shape for `operstate` returning `"UP"` where
`LinkState` expects `"up"`, and for `/health` returning any body the collector did not
anticipate.

---

## F3 — HIGH · `T | null | undefined` passes every gate, and `undefined` is exactly what the wire test exists to forbid

**Claim it breaks.** build.md §5:

> **`null` survives the wire.** A 31-path census … This is what catches `field?: T` —
> `JSON.stringify` drops `undefined` properties entirely.

`OptionalKeys` catches `field?: T`. `NonNullableKeys` is
`{ [K in keyof T]-?: null extends T[K] ? never : K }` — `null extends (T | null | undefined)`
is **true**, so a *required* property whose type admits `undefined` is excluded from the
census and passes. The runtime 31-path census then passes too, because it walks a
hand-written fixture that assigns `null` explicitly; it never constructs the `undefined`
case that the mechanism was built to catch.

**Confirmed by execution.**

| mutation | result |
|---|---|
| `Host.memTotalGiB: GiB \| null` → `GiB \| null \| undefined` | **34 passed, exit 0; typecheck exit 0** |
| `Gpu.tempC: Celsius \| null` → `… \| undefined` | caught (1 failure) — but only via `toEqualTypeOf<Celsius \| null>()` on line 286 |
| `Network.rxBytesPerSec` → `… \| undefined` | caught — but only via `expect<number \| null>(…)` on `contract.test.ts:331` |

So protection exists exactly where a bespoke assertion happens to sit. Unprotected today:
`memTotalGiB`, `swapTotalGiB`, `uptimeSec`, `kernel`, `loadAvg`, `fan1Rpm`–`fan4Rpm`,
`serviceState`, `Filesystem.totalGB`, `Network.link`, every member of `Safety`, and every
member of `ServingInstance`.

**Concrete failure scenario.** `noUncheckedIndexedAccess` is on. A step-3 collector parsing
`/proc/meminfo` into a `Record<string, number>` and writing
`memTotalGiB: gib(fields['MemTotal'])` gets a compile error today. The shortest fix an
agent reaches for is to let the field admit `undefined`. `JSON.stringify` then omits the
key; the client reads `snapshot.host.memTotalGiB` as `undefined`; §6.6's `null → —` branch
never runs and the RAM bar renders **blank** against a missing denominator. §6.6:
"`null` renders as an em dash `—`. Never `0`, **never blank**, never `N/A`."

---

## F4 — HIGH · Removing a brand is invisible, and readmits the exact unit confusion branding was added to stop

**Claim it breaks.** build.md §4.4: "Branding makes `memUsedMiB` unable to reach a GiB
formatter."

The unit assertions read `expectTypeOf<Gpu['memUsedMiB']>().toEqualTypeOf<MiB | null>()` —
field compared against alias. Degrade the alias and both sides degrade together. Nothing
asserts that any `Brand<…>` is actually nominal.

**Confirmed by execution.** `export type MiB = Brand<number, 'MiB'>` → `export type MiB = number`:
`pnpm test` 34 passed exit 0, `pnpm typecheck` exit 0. With that in place I appended to
`lib/contract.test.ts`:

```ts
memUsedMiB: gib(12.1),   // 12.1 GiB assigned into a MiB field
memTotalMiB: 32768,      // raw unbranded number
```

`pnpm typecheck` exit **0**, `pnpm test` **34 passed**. Both mutations reverted.

**Concrete failure scenario.** Step 9 owns the VRAM meter. With `MiB` degraded, a collector
that read `memory.used` after a unit conversion assigns cleanly and the card renders
`12 / 32,768 MiB` for 12.4 GiB actually resident — a card at 39 % displayed at 0.04 %.
§6.3 bands VRAM at 90 / 95 %, so the OOM warning that "262144 is a confirmed OOM" exists to
give never fires.

A per-brand nominality assertion closes it, e.g.
`Assert<Equals<number extends MiB ? true : false, false>>` for each of the fifteen brands.

---

## F5 — MEDIUM · `pnpm test` prints `Tests 34 passed (34)` and `Type Errors no errors` on runs that exit 1

**Confirmed by execution**, twice, in different ways:

| what I broke | printed summary | exit |
|---|---|---|
| `const broken: number = 'not a number'` in `app/page.tsx` | `Test Files 2 passed (2)` · `Tests 34 passed (34)` · `Type Errors no errors` · `Errors 1 error` | **1** |
| failing `Assert<>` at module scope in `lib/types.test-d.ts` | `Test Files 1 failed \| 1 passed (2)` · `Tests 34 passed (34)` · `Type Errors no errors` | **1** |

In both cases the `Tests` counter and the `Type Errors` line are wrong. Only the exit code
is trustworthy.

**Concrete failure scenario.** build.md §6 establishes the house style of proving green by
quoting this summary. Every remaining build phase (steps 2–12) will do the same, and a run
whose counters read `34 passed` / `no errors` can be a **failing** run. More concretely
still: step 11 owns the Dockerfile and step 12 the deploy. A build stage that runs
`pnpm test 2>&1 | tee log && grep -q "no errors" log` — a plausible thing to write after
reading these notes — passes on a broken build. Gate on exit status, and say so in
HANDOVER.md.

---

## F6 — MEDIUM · The build's stated reason for putting assertions inside `test()` bodies is wrong

**Claim it breaks.** build.md §5 and §8:

> A compile error at module scope in a `*.test-d.ts` file does not fail `pnpm test`.
> … Type-level assertions must live inside `test()` callbacks **or `pnpm test` will not
> run them**.

**Confirmed by execution.** I appended a deliberately failing module-scope assertion to
`lib/types.test-d.ts`, with every real test still passing:

```ts
type _ProbeShouldFail = Assert<Equals<Severity, 'this-is-not-severity'>>;
export type _Probe = _ProbeShouldFail;
```

Result: `Test Files 1 failed | 1 passed (2)`, a `TypeCheckError` reported as an unhandled
source error, and **exit 1**. Repeated with a differently-shaped alias: same outcome.
Reverted.

What is actually true is narrower: a module-scope error is not *attributed to a test*, so
the `Tests` counter and the `Type Errors` line stay clean (F5) — but the file is marked
failed and the run goes red. The restructuring is still worth keeping, for legibility and
so a failure names itself. The justification is not.

**Concrete failure scenario.** HANDOVER.md is about to carry "or `pnpm test` will not run
them" to every remaining step as fact. A later agent that believes there is a class of type
error the suite cannot see will either contort its test layout for no reason, or stop
treating a green suite as meaningful and start hand-verifying with `pnpm typecheck` —
which is the opposite of what a 12-step pipeline needs.

---

## F7 — MEDIUM · §3.4 has no runtime coverage at all — no fixture ever constructs a `ServingInstance`

`nothingReadable.serving` is `null`; `everythingZero.serving` is `[]`. `NULLABLE_PATHS`
(`lib/contract.test.ts:244-276`) contains no `serving[…]` entry. So the entire serving
contract is exercised only by the type-level census.

**Confirmed by execution.** `port: Port | null` → `number | null` and
`health: HealthState | null` → `string | null` both pass at 34/34, exit 0. Contrast
`Filesystem.totalGB: GB | null` → `GiB | null`, which **was** caught — solely because
`everythingZero` assigns `gb(931.5)` to it. The fixtures, not the assertions, are doing
most of the unit enforcement, and they skip §3.4 entirely.

**Concrete failure scenario.** `port` is what step 5 uses to build
`GET http://127.0.0.1:PORT/health` and `GET /v1/models` (§3.4). Nothing in the suite would
notice it becoming `string | null` and the collector passing the raw `PORT=8080` text
straight through from `/etc/llama-server/<i>.env` — the URL still concatenates correctly by
coincidence, so it works, until step 10 renders the SERVING row and sorts or compares
ports, or step 6 does arithmetic on one. A third `ServingInstance` fixture in
`contract.test.ts` costs ten lines and closes this.

---

## F8 — MEDIUM · COOLING and SAFETY can contradict each other on the same snapshot, in adjacent panels

**Confirmed by execution.** Both of these compile clean (`pnpm typecheck` exit 0):

```ts
// P9 — safety says pwm5 exists while cooling says the channel does not
{ cooling: { …chans, ch5Mode: null, ch5Pwm: null },
  safety:  { …, pwm5Present: true, fanServiceActive: true } }

// P10 — the fan service is failed in COOLING and active in SAFETY
{ cooling: { …chans, serviceState: 'failed', ch5Mode: 'manual', ch5Pwm: pwm(255) },
  safety:  { …, fanServiceActive: true } }
```

build.md §4.6 acknowledges this and says step 6 must derive rather than read twice. But per
PLAN.md the cooling reads belong to **step 4** and the safety reads to **step 5** — two
different agents with clean contexts — and nothing in step 1 stops them disagreeing: not a
type, not a test, not a `satisfies`.

**Concrete failure scenario.** §6.2 places SAFETY directly beside COOLING. One snapshot
renders "fan service · failed" in COOLING and a green "Fan service active ✓" in SAFETY,
simultaneously. On a box whose two passive 250 W cards depend entirely on
`gpu-fan-control.service` — CLAUDE.md: the EC "ignores GPU temperature on every header it
owns" — a green safety glyph beside a failed unit is the worst ambiguity this dashboard can
produce, and it is the specific thing the SAFETY panel exists to prevent.

Cheapest fix available to step 1 and not taken: drop `Safety.fanServiceActive` from the
wire and derive it in the UI from `cooling.serviceState` — one source of truth, no possible
disagreement. Note that unlike `pwm5Present`, `fanServiceActive` does **not** appear in
§4's example JSON; it is entirely the build's own addition (its gap 6 concedes the name is
invented), so removing it costs nothing against the spec.

---

## F9 — LOW · Two spec gaps the build did not record, one of which forces step 2 to invent domain knowledge

**(a) Throttle-mask decoding has no vocabulary anywhere in the spec.** §3.1 stores
`clocks_throttle_reasons.active`. §6.3 requires distinguishing "`0x4` or none" (normal) from
"any thermal reason" (alarm). §6.2 says throttle reasons "appear only when something other
than `0x4` is active". The spec never gives the bit→name mapping, never says which bits
count as thermal, and never says how a mask is rendered as text. `ThrottleMask`'s own
docstring (`lib/types.ts:79-87`) hands the decoding to step 2 — which will have to source
NVML's bit definitions (`HW_SLOWDOWN 0x8`, `SW_THERMAL 0x20`, `HW_THERMAL 0x40`, …) from
outside the spec and decide which are "thermal". That is squarely invariant 7's case and it
is absent from the build's gap list. It also carries real consequence: get the mask wrong
and either a thermal slowdown renders as normal, or the routine 250 W power cap gets styled
as a warning — which §6.2 explicitly forbids.

**(b) §6.6's format table is incomplete**, despite its preamble presenting it as covering
each quantity. Missing rows: **load average** (§6.2's CPU panel shows it; `LoadAverage` is
three bare `number`s with no format), **context length** (§6.2's SERVING row shows it;
`Tokens` is branded but unformatted — `131072` or `131,072` or `128K`?), and **PWM**
(§6.2 asks for the literal string `HIGH pwm 255`, so a `Pwm` must render both a state name
and a raw value). Separately, `Seconds` / `uptimeSec` is in §3.2 but appears in **no** §6.2
panel — either a field with no consumer or a panel element the spec forgot.

**Established by** reading §3.1, §6.2, §6.3 and §6.6 against the fifteen branded types.

---

## F10 — LOW · Adjudicating the build's six recorded gaps

| # | verdict | reasoning |
|---|---|---|
| 1 · core/thread count | **genuine** | §6.2's CPU panel names it; §3.2's field table has neither a field nor a source. Correctly not filled |
| 2 · `/health` vocabulary | **genuine** | §3.4 fixes the source, §6.2 says "the `/health` result", §6.5 says "the unit state and the reason". No values enumerated anywhere |
| 3 · wire value for an unavailable channel 5 | **genuine** | §3.3 gives two values, §6.5 requires a third *presentation*, §3.6 makes it an alarm; the wire spelling is nowhere |
| 4 · `reloading` / `deactivating` severity | **genuine** | §6.3's last row maps four of systemd's six. Step 2's to close, correctly deferred |
| 5 · `errors[].source` vocabulary | **genuine but weaker than stated** | §6.5's "its `errors` entry is available" implies a UI match, but the spec nowhere says the UI *keys off* `source`. `string` is a defensible reading, not a blocked step |
| 6 · `dkmsBuiltForRunningKernel` / `fanServiceActive` names | **genuine but not worth a step's attention** | §3's Field columns are field names elsewhere; §3.6's column is "Check" with prose labels, and §4's example already camelCases two of them (`ufwEnforcing`, `pwm5Present`). Applying the same convention to the other two labels is mechanical. But see F8 — `fanServiceActive` should arguably not exist at all |

**Not a gap, correctly dismissed:** §3.1's "timestamp of the last successful read". §2's
"The server holds no history at all" and §6.7's ring buffer make it client-derivable, as
build.md §4.2 argues. One residual the build does not mention: after a page reload the ring
is empty (§6.4, "lost on reload, by design"), so on a fresh load with `nvidia-smi` already
absent there is no last-successful timestamp to show at all. Step 10 needs a rendering for
that case and the spec gives none.

---

## F11 — LOW · `Ch5Mode` is dead code and unasserted

`export type Ch5Mode = 'manual' | 'ec-auto'` (`lib/types.ts:180`) is referenced by nothing.
The three `Cooling` variants spell their discriminants as inline literals, and
`ClosedVocabularies` asserts `Cooling['ch5Mode']`, not `Ch5Mode`.

**Confirmed by execution.** Adding a third member — `'manual' | 'ec-auto' | 'anything'` —
passes 34/34, typecheck exit 0. Reverted.

**Concrete failure scenario.** Step 2 or step 9 imports `Ch5Mode` believing it to be the
authority for the mode vocabulary, drifts it (adding `'unavailable'` to model the third
state as a string, which build.md gap 3 says was considered), and writes a `switch` over
that alias. The compiler never connects the two, so the UI switch and the wire union say
different things. Either delete the alias or make the variants use it.

---

## F12 — LOW · `gpus`/`serving` nullability buys a distinction nothing can render

build.md §4.2 flags this as the build's own extension and explicitly invites rejection.
§3.1 gives one presentation for both facts ("no GPUs enumerated") and §6.5 does not separate
them; the `errors[]` entry already carries which happened.

**Concrete cost.** Every consumer from step 8 onward writes `snapshot.gpus?.[0]?.tempC` —
one null check plus two `noUncheckedIndexedAccess` optionals — for a distinction the UI
never shows. `lib/types.test-d.ts:226` already has to write exactly that to make its point.
Not a spec violation and not wrong; it deserves an explicit ruling rather than being
inherited by eleven more steps. Rejecting it costs one type change and no behaviour, as the
build says.

---

## F13 — LOW · No decoder, and the tests model the cast that will hide shape drift

`lib/contract.test.ts:328` does `wire as TelemetrySnapshot` after `JSON.parse`. Steps 6 and
8 will copy that line. Nothing in the contract validates a parsed body, so every brand is a
compile-time fiction the moment data crosses the wire — `isoTimestamp('banana')` and
`rpm(NaN)` both type-check, and a `fetch` response cast to `TelemetrySnapshot` inherits
whatever the server actually sent.

Low today, because server and client share one type and one build. Named so that step 8
does not `as`-cast a `fetch` response and treat the result as proven. The spec does not ask
for a validator, so this is a note, not a defect.

---

## F14 — LOW · §2.4's "CLAUDE.md gets a pointer to this file" is unowned by any step

Confirmed: `grep -n "SPEC.md" /Users/yorman/Projects/DevelopmentLabs/ai-server/CLAUDE.md`
returns nothing. PLAN.md's step 1 scope does not include it, and no later step's scope names
it either (step 11 owns `README.md`, not the root notes). It will fall off the plan unless
reconciliation assigns it. Correctly outside step 1's scope — the build was right not to
touch a file outside `dashboard/` — but it needs an owner.

---

## What I attacked and found sound

1. **All three claimed regressions reproduce exactly as build.md reports.** REG-A
   (`strict: false`, `exactOptionalPropertyTypes` dropped): 12 named test failures — the
   same 12 the notes list — plus a TS2578 unused-directive cascade and TS2344 on the census.
   REG-B (`Host.cpuTempC` loses `| null`): 2 failures, 4 typecheck errors including
   `lib/contract.test.ts(151,5)` exactly as quoted. REG-C (`next/image` import in
   `app/page.tsx`): 1 failure, `the image component is imported nowhere in the source`. The
   `@ts-expect-error`-becomes-unused mechanism is genuinely load-bearing and cannot survive
   strictness being turned off.
2. **The `test()`-body fix was applied everywhere.** Read all 417 lines of
   `lib/types.test-d.ts`: every `Assert<>` and every `expectTypeOf(…)` sits inside a
   `test()` callback. The only module-scope constructs are the `Equals` / `Assert` /
   `NonNullableKeys` / `OptionalKeys` aliases and six `declare function` helpers, none of
   which assert anything. No stragglers.
3. **Illegal channel-5 states are genuinely unrepresentable (invariant 3).** Probes that
   fail to compile, as they must: `ec-auto` carrying a `Pwm`; `manual` with a null pwm;
   `null` mode carrying a `Pwm`. The three-variant union is doing real work, and the
   `switch` exhaustiveness test at line 338 has no `default`.
4. **Branded units block every cross-unit assignment I tried, while the brands are
   intact.** `GiB` → `memUsedMiB`, `Rpm` → `tempC`, `Watts` → `tempC`, raw `26452` → `MiB`,
   `Celsius` → `MiB`: all TS2322. (The caveat is F4 — the *brands themselves* are not
   defended.)
5. **`pwmN_enable` and `fanN_target` are genuinely absent (invariant 4).** The only
   occurrences anywhere in `lib/types.ts` are lines 262-263, inside a warning comment
   explaining why they are excluded. No member, no optional member, nothing commented out,
   nothing under another name.
6. **`pnpm test` is not blind to the rest of the project.** A type error in `app/page.tsx`
   — a file no test imports — makes `pnpm test` exit 1. (Its *summary* lies about it: F5.)
7. **Fresh-clone reproducibility holds.** With `.next/` and `tsconfig.tsbuildinfo` moved
   away entirely, `pnpm typecheck` and `pnpm test` both exit 0. `next-env.d.ts`'s hard
   `import "./.next/types/routes.d.ts"` does not break a checkout that has never been built,
   because `skipLibCheck: true` suppresses checking of declaration files. I expected this to
   be a finding and it is not.
8. **`pnpm install --frozen-lockfile` succeeds** from the committed lockfile: exit 0,
   "Lockfile is up to date, resolution step is skipped".
9. **The lockfile carries every linux/x64 variant step 12 needs.**
   `@typescript/typescript-linux-x64` (20 TS platform packages total),
   `@next/swc-linux-x64-gnu` **and** `-musl` (8 total), `@rolldown/binding-linux-x64-gnu`
   (15 total), `@pnpm/exe.linux-x64` glibc. `node:24-slim` is Debian/glibc, so the `-gnu`
   builds are the right ones and they are present. The build's claim is correct and I
   verified it rather than trusting it.
10. **No package resolves through a private registry.** The lockfile contains no `tarball:`
    entries and no URLs at all, despite `~/.npmrc` on this Mac carrying three registries with
    auth tokens (`10.8.0.1:4873`, `192.168.15.10:4873`, `npm.pkg.github.com`). Nothing will
    try to reach a host `ai-server` cannot see. This was my strongest "works here, fails on
    the box" hypothesis and it is clean.
11. **The lockfile's unusual shape is a pnpm 12 format, not damage.** It is a two-document
    YAML: document 1 pins the package manager itself
    (`packageManagerDependencies: pnpm@12.3.4`), document 2 carries the project's importers
    with all eight dependencies pinned exactly and matching `package.json`. I initially read
    the first document's empty `importers` as a missing dependency graph; it is not.
12. **`output: 'standalone'` is valid on Next 16**, verified against the bundled docs at
    `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`
    as `dashboard/AGENTS.md` instructs — not from training data. `.next/standalone/` is
    emitted with `server.js`, `package.json` and a traced `node_modules` containing
    next/react/react-dom. The docs' caveat that `public` and `.next/static` are **not**
    copied is real (confirmed: `.next/standalone/.next/` has no `static/`), and build.md §6
    already records it as step 11's job with the right `cp` incantation.
13. **`next build`'s rewrite of `tsconfig.json` weakened nothing.** It set
    `jsx: "react-jsx"` and appended `.next/dev/types/**/*.ts` to `include`. All seven
    strictness flags survive — `strict`, `noUncheckedIndexedAccess`,
    `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`,
    `noUnusedParameters`, `noFallthroughCasesInSwitch` — and the first three are pinned by a
    text assertion that fires immediately (`TS5052` makes a `strict:false` +
    `exactOptionalPropertyTypes:true` config *invalid*, so `tsc` bails and reports "no
    errors"; the text match is the only thing that catches that, and it does).
14. **`next.config.mjs` carries exactly one setting**, `output: 'standalone'`. Nothing
    unasked-for, no `images` block, and the prose explaining the `next/image` rule does not
    trip the import-shaped regex that enforces it.
15. **Scope was respected.** `app/` is two placeholder files — no collectors, no routes, no
    components, no auth. Nothing outside `dashboard/` was created or modified.
16. **Field-by-field, §3.1–§3.6 and §4 are fully covered.** Every field in every §3 table has
    a member with the spec's own name, and the only member without a §3 home is `hostname`,
    which §4's example JSON does carry. No invented fields beyond the two §3.6 names the
    build flags itself.
17. **Invariant 1 holds at the type level.** Every non-nullable member is an identity
    (`Gpu.index`, `ServingInstance.instance`), a container (`Storage.{root,home,net}`, the
    four snapshot containers), non-null by construction (`CoolingManual.ch5Pwm`), or
    structurally always-present (`ts`, `errors`, `TelemetryError.{source,message}`). No
    *reading* is reachable without confronting `null`. `LoadAverage` being a tuple is not
    weakened by `noUncheckedIndexedAccess` — verified by probe: `la[0]` is `number`, not
    `number | undefined` — while `s.gpus[0].index` is correctly rejected.
