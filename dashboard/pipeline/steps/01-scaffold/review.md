# Step 1 — Scaffold & contract · review notes

Written 2026-09-06. **No source, test, config or spec file was modified.** Verification was
done in a throwaway copy of the project (`lib/`, `app/`, the four configs, `node_modules`
symlinked) under the session scratchpad, deleted afterwards. Before and after: `md5` of
`lib/types.ts`, `lib/types.test-d.ts`, `lib/contract.test.ts` and `tsconfig.json` unchanged,
repo `git status` still `M .gitignore` + `?? dashboard/`, `pnpm test` still 34 passed.

The sandbox reproduces the real project exactly (34 passed, exit 0, same two files), so
every mutation below is a faithful measurement of the real suite.

---

## Verdict in one paragraph

The step is good work and the contract is the right shape. Illegal channel-5 states really
are unrepresentable, invariant 4's lying fields really are absent, the toolchain really is
reproducible, and the three claimed regressions really do reproduce. What the adversarial
phase found is one class of defect stated four ways — **the type tests assert properties of
*aliases*, and the fixtures are what actually pin *fields*** — plus one documented invariant
that is wrong in a direction that inverts invariant 1 on the SAFETY panel. Both are cheap to
fix and both must be fixed before step 2 inherits them. Nothing in the step needs redesign.

I could not reject any finding outright: every one I could execute, I executed, and every
one reproduced. Where I disagree it is about **severity, framing, or the proposed remedy**,
and those disagreements are recorded rather than smoothed over — see F6, F7, F8, F9 and F12.

---

## 1. Adjudication of the 14 adversarial findings

| # | Adversarial severity | My verdict | My severity |
|---|---|---|---|
| F1 | HIGH | **UPHELD** | HIGH |
| F2 | HIGH | **UPHELD** (one defect with F3/F4) | HIGH |
| F3 | HIGH | **UPHELD** (same defect) | HIGH |
| F4 | HIGH | **UPHELD** (same defect) | HIGH |
| F5 | MEDIUM | **UPHELD**, verified twice | MEDIUM |
| F6 | MEDIUM | **UPHELD as fact · OVERSTATED as consequence** | LOW–MEDIUM |
| F7 | MEDIUM | **UPHELD**, but it is an *instance* of F2/F4, not a separate defect | MEDIUM |
| F8 | MEDIUM | **PARTLY UPHELD** — right about `fanServiceActive`, wrong to imply step 1 could have typed `pwm5Present` out of the problem | MEDIUM |
| F9a | LOW | **UPHELD, UNDERSTATED** | MEDIUM |
| F9b | LOW | **UPHELD**, with a small over-read noted | LOW |
| F10 | LOW | **UPHELD**, with one gap added and one re-weighted | LOW |
| F11 | LOW | **UPHELD** | LOW |
| F12 | LOW | **UPHELD as "needs a ruling"** — I rule KEEP, so no change | LOW |
| F13 | LOW | **UPHELD**, defer to steps 6 and 8 | LOW |
| F14 | LOW | **UPHELD** | LOW |

### F1 — the `pwm5Present ⟺ ch5Mode === null` invariant · **UPHELD, HIGH**

The biconditional is **genuinely wrong**, not loosely stated, and the wrong half is the one
`lib/types.ts:421` instructs a later step to compute.

`ch5Mode === null` is the union of two facts that `Safety`'s own doc comment
(`lib/types.ts:398-402`) insists on keeping apart:

| what happened | correct `pwm5Present` | `ch5Mode` |
|---|---|---|
| `dell_smm` hwmon found, no `pwm5` node (DKMS module not loaded) | `false` | `null` |
| `dell_smm` hwmon not found — `/sys` not mounted, driver absent, hwmon renamed | `null` | `null` |

So `ch5Mode === null ⟹ pwm5Present === false` does not hold. The fixture at
`lib/contract.test.ts:143-182` is right and the comment is wrong.

**The correct rule, and it should replace the comment verbatim:**

> `ch5Mode !== null ⟹ pwm5Present === true`.
> Contrapositive: if `pwm5Present` is `false` **or** `null`, `ch5Mode` is `null`.
> The converse does **not** hold: `ch5Mode === null` says only that the mode could not be
> determined, which includes the case where the probe itself could not be performed.

I considered the tighter `pwm5Present === true ⟺ ch5Mode !== null` and rejected it: a `pwm5`
node that exists but fails to read with something other than `ENODATA` (`EACCES`, `EIO`)
gives `pwm5Present === true` with `ch5Mode === null`. Only the one-directional form survives
every case, so only it should be written down.

**The derivation direction must also be reversed.** The comment tells step 6 to derive one
field from the other. That is exactly how the bug ships: `pwm5Present = cooling.ch5Mode !==
null` turns an unmounted `/sys` into `pwm5Present: false`, which §3.6 defines as *"DKMS
5-fan module did not load — GPU fan control is gone"*, which §6.3 makes an alarm with no
watch band, which §6.4 pins as a sticky banner on the panel §6.2 calls "the panel that earns
the dashboard's existence". Absent becomes a definite negative. That is invariant 1 inverted
in the one place it is defended everywhere else. Both fields must be derived from **one
three-valued probe outcome** ("could not look" / "not there" / "there, and here is the
mode"), never from each other.

**Where I disagree with the write-up, mildly:** the fixture docstring is *loose*, not
"self-contradictory". `errors: [{ source: 'dell_smm', message: 'no hwmon named dell_smm' }]`
makes the fixture's values unambiguously correct; only the prose sentence "The DKMS module is
not loaded" is imprecise shorthand for "the driver is not there at all". Fix the sentence,
keep the values.

**Cost to close:** a corrected comment, a corrected docstring, a HANDOVER obligation, and one
new fixture (below). Minutes. The consequence if missed is the worst bug in the project.

### F2 / F3 / F4 — **one defect, stated in three places** · UPHELD, HIGH

These are not three findings. They are one: **`lib/types.test-d.ts` asserts properties of
type *aliases*, while the only thing pinning a *field* is whether some fixture or bespoke
assertion happens to touch it.** F7 is a fourth instance of the same thing (§3.4 has no
fixture at all, so nothing pins any `ServingInstance` field).

Every mutation reproduced in my sandbox, applied to `lib/types.ts` alone:

| mutation | `pnpm test` | exit |
|---|---|---|
| `Network.link: LinkState \| null` → `string \| null` | 34 passed · no errors | **0** |
| `ServingInstance.unitState: UnitState \| null` → `string \| null` | 34 passed · no errors | **0** |
| `Host.memTotalGiB: GiB \| null` → `GiB \| null \| undefined` | 34 passed · no errors | **0** |
| `export type MiB = Brand<number,'MiB'>` → `export type MiB = number` | 34 passed · no errors | **0** |
| `ServingInstance.port: Port \| null` → `number \| null` | 34 passed · no errors | **0** |
| `Ch5Mode` gains a third member (F11) | 34 passed · no errors | **0** |

`pnpm typecheck` is exit 0 on the brand removal too — I ran it separately.

**The minimal correct fix is three properties, not a rewrite.** I built and ran each one in
the sandbox; each catches exactly its loosening and nothing else. Reconciliation implements;
this is the specification of what must hold:

- **Property A — every brand is nominal.** For each of the fifteen brands, the underlying
  primitive must not be assignable to it. Without this, a field-level assertion written in
  terms of the alias degrades in lockstep with the alias and proves nothing.
  *Verified mechanism:* `Assert<Equals<number extends MiB ? true : false, false>>` — passes
  today, fails the moment `MiB` becomes `number`.
- **Property B — every field's exact type is pinned by name.** An assertion about an alias
  constrains no field; an assertion comparing a field to an alias is only as strong as
  Property A makes the alias. The census must enumerate **every** field of every contract
  type, not the ones a fixture happens to reach.
  *Verified mechanism:* per-field `Assert<Equals<Network['link'], LinkState | null>>` etc.
- **Property C — no field of any contract type admits `undefined`.** `NonNullableKeys` is
  structurally blind to this: `null extends (T | null | undefined)` is `true`, so a field
  that admits `undefined` is silently excluded from the census it was built to police.
  *Verified mechanism:* a parallel `UndefinedKeys<T>` census asserting `never` per type.

Property B subsumes Property C if it is written as exact-type equality per field, but I
recommend keeping C as its own named assertion — `undefined` is the specific thing
`JSON.stringify` drops, and a separately-named failing test says so out loud.

**One caveat on Property B's cost.** Enumerating ~45 fields restates the contract in the test
file. That duplication is the point — an independent restatement is what makes the census a
test rather than a tautology — but it means `types.test-d.ts` grows and must be kept in step
with `types.ts`. Adding a field without adding its census line is caught by the existing
`NonNullableKeys` assertion only if the new field is non-nullable. Accept that residual; the
alternative is a whole-interface `Equals` against a literal shape, which is the same
duplication with a worse failure message.

### F5 — the summary lies on a failing run · **UPHELD, MEDIUM**

Reproduced exactly. A type error in `app/page.tsx` (a file no test imports):

```
 Test Files  2 passed (2)
      Tests  34 passed (34)
Type Errors  no errors
     Errors  1 error
vitest EXIT=1
```

And a failing assertion at module scope in `lib/types.test-d.ts`:

```
 Test Files  1 failed | 1 passed (2)
      Tests  34 passed (34)
Type Errors  no errors
vitest EXIT=1
```

I found a **third and worse shape** the adversarial phase did not report. When a test file
fails to *compile*, its tests do not fail — they disappear from the count entirely:

```
--- mutation: memTotalGiB admits undefined, with a census probe added
 Test Files  1 failed | 2 passed (3)
      Tests  27 passed (27)      <-- ten assertions silently vanished; none failed
Type Errors  no errors
EXIT=1
```

So `Tests N passed (N)` is not merely wrong about failures, it is wrong about **how many
tests ran**. There is no counter in the summary that can be trusted, and "34 passed" is not
even a stable baseline to compare against.

**The durable guard, since a note is not enough:**

1. Add a single `verify` script — `tsc --noEmit && vitest run` — and make HANDOVER declare
   that a step is green **only** when `pnpm verify` exits 0. Shell `&&` enforces exit status
   by construction, and it removes the "which of the two commands is authoritative" question
   from every later step.
2. HANDOVER must state, as a rule and not an anecdote: **quoting the Vitest summary is not
   evidence of green. Quote `exit=N`.** Build.md §6's house style of pasting the summary is
   what propagates this, and eleven more build phases are about to copy it.
3. Step 11's Dockerfile must gate on exit status. `pnpm test | tee log && grep -q "no errors"
   log` — the plausible thing to write after reading these notes — passes on a broken build.

### F6 — the build's *reason* for the `test()`-body restructuring is wrong · UPHELD as fact, OVERSTATED as consequence

Reproduced: a failing `Assert<>` at module scope in `lib/types.test-d.ts` gives
`Test Files 1 failed | 1 passed (2)` and **exit 1**. The suite is not blind to it.

So build.md §5 and §8's "or `pnpm test` will not run them" is false as written, and it is
about to enter HANDOVER as fact for eleven steps. That must be corrected.

**But the consequence is overstated.** The write-up projects a later agent that "stops
treating a green suite as meaningful". The narrower truth is F5's: module-scope errors are
not *attributed* to a test, so the counters stay clean while the run goes red. The tests as
written are correct, the restructuring is worth keeping for legibility, and **no test needs
to change**. This is a one-sentence documentation fix, not a MEDIUM structural problem. I
would rate it LOW but for the fact that it propagates through HANDOVER, which is what keeps
it at LOW–MEDIUM.

### F7 — §3.4 has no runtime fixture · **UPHELD, MEDIUM**, but reclassified

Reproduced: `port: Port | null` → `number | null` passes 34/34 at exit 0.

The write-up's own diagnosis is the important part and it is correct: *"The fixtures, not the
assertions, are doing most of the unit enforcement, and they skip §3.4 entirely."* That makes
F7 an instance of F2/F4 rather than a separate defect — once Property B holds, `port` is
pinned whether or not a fixture exists. The **independent** increment is the missing fixture,
which is worth adding anyway because it is the only thing that exercises §3.4 at runtime and
because steps 5, 6 and 10 will all want it.

### F8 — COOLING and SAFETY can contradict · **PARTLY UPHELD, MEDIUM**

The contradiction is real and the types permit it: two independent `boolean | null` fields
with no relationship the compiler can see.

**Upheld for `fanServiceActive`, and I endorse the proposed remedy: remove it from the
contract.** It is a pure duplicate of `cooling.serviceState === 'active'`, it appears nowhere
in §4's example JSON, its name is the build's own invention (its gap 6 concedes this), and
the SAFETY panel can render its row from `cooling.serviceState` with no loss. Deleting it
removes an entire class of "fan service · failed" beside "Fan service active ✓" — which on a
box with two passive 250 W cards is the worst ambiguity this dashboard can produce. One
source of truth beats a documented obligation not to diverge, and step 1 exists to make
later steps hard to get wrong.

**Not upheld for `pwm5Present`.** It is named explicitly in §4's example JSON, so it stays on
the wire. And the implied criticism — that step 1 should have made the pair
non-contradictory in the type system — does not survive contact with the alternative: a
discriminated union over the whole snapshot, which the build considered and rejected. I agree
with the build. The right remedy there is F1's: one probe, three outcomes, both fields
derived from it, stated as an obligation in HANDOVER where steps 4, 5 and 6 will actually
read it — not in a comment in `types.ts` (see my finding R1).

### F9 — two unrecorded spec gaps · **(a) UNDERSTATED at LOW, (b) UPHELD at LOW**

**(a) Throttle-mask decoding.** Verified by grep: `throttle` appears at SPEC.md lines 248,
527 and 562 and nowhere else. Between them the spec requires step 2 to (i) recognise `0x4`,
(ii) decide which bits count as "thermal", and (iii) render a non-`0x4` mask as text — while
supplying only (i). Sourcing NVML's bit definitions from outside the spec is precisely
invariant 7's case, it is the same class as the build's gaps 1 and 2 which it correctly
refused to fill, and it has a real failure on both sides: a thermal slowdown rendered normal,
or the routine 250 W cap styled as a warning, which §6.2 explicitly forbids. **This should
have been in the build's gap list and it should be MEDIUM.**

**(b) Missing §6.6 format rows.** Confirmed: load average, context length and PWM have no
row. One small over-read to note — the preamble ("Each quantity is shown in the unit its own
source reports") is a statement about *units*, not a claim that the table is exhaustive. The
rows are genuinely missing regardless. The `uptimeSec` observation is also correct and is the
weakest item on my consolidated list below.

### F10 — the build's six gaps · **UPHELD**, with one addition and one re-weighting

I agree with all six verdicts. Two amendments:

- **Gap 6 is worth one line of spec, not zero.** The adversarial calls it "not worth a step's
  attention". §4's example is the only place the wire spelling of the safety block is fixed,
  and it currently elides half of it. If F8 is applied, only one name needs adding.
- **A seventh gap the build demoted and the adversarial missed: `hostname` has no source, and
  the obvious source is wrong in a container.** See item 7 of the consolidated list. This is
  stronger than the build's "minor observation" treatment.

The residual F10 raises — no last-successful timestamp on a fresh page load — is real, is a
§3.1 gap, and is on my list.

### F11 — `Ch5Mode` is dead and unasserted · **UPHELD, LOW**

Reproduced: adding a third member passes 34/34, exit 0. **Recommend deleting the alias**
rather than wiring the variants to it. `Cooling['ch5Mode']` is already the asserted authority
and reads correctly at every use site; an alias that must be kept in sync with three
interfaces is a second place for the vocabulary to live, which is how F11's own failure
scenario starts.

### F12 — `gpus`/`serving` nullability · **UPHELD as "needs a ruling" — I rule KEEP**

The adversarial does not demand removal; it demands a decision. Here it is.

**Keep both nullable.** Reasons:

- The cost is smaller than stated. `noUncheckedIndexedAccess` already forces `?.[0]?.` on a
  non-nullable array, so the `| null` adds one `?? []` at each consumer, not a new class of
  ceremony.
- `[]` is the list-shaped zero, and invariant 1 is about not conflating zero with absent. For
  `serving` the two facts are materially different on this box: `[]` means
  `/etc/llama-server/` was read and holds no env files — itself alarming — while `null` means
  it could not be read at all. §6.5 has no row for either, so the contract is the only place
  the distinction survives.
- The `errors[]` fallback the write-up leans on is not machine-readable: `source` has no
  closed vocabulary (gap 5), so "which happened" cannot be recovered from it programmatically
  today.

Reconciliation must record the ruling and the idiom (`for (const g of snapshot.gpus ?? [])`)
in HANDOVER so eleven steps do not each re-litigate it.

### F13 — no decoder; the tests model the `as` cast · **UPHELD, LOW, deferred**

Correct, and correctly framed as a note: the spec does not ask for a validator, and server
and client share one type and one build. The durable part is the instruction, which belongs
in HANDOVER: **step 8 must not `as`-cast a `fetch` response and treat the result as proven**,
and step 6 owns the decision about whether a validator is wanted at the route boundary.
Related to my R4 below — the brand constructors are unchecked identity functions and give no
runtime guarantee at all.

### F14 — §2.4's root `CLAUDE.md` pointer is unowned · **UPHELD, LOW**

Confirmed by grep: `/Users/yorman/Projects/DevelopmentLabs/ai-server/CLAUDE.md` contains no
occurrence of `dashboard` or `SPEC.md`. Step 1 was right not to touch a file outside
`dashboard/`. It needs an owner or it falls off the plan; I would attach it to step 11, which
already owns `README.md` and `dashboard.sh` and is the step where the project becomes
something a person operates.

---

## 2. Consolidated spec-gap list

Everything genuinely missing from `SPEC.md`, merged from the build's six, the adversarial's
two, and two of my own. Each row names the section that should carry it and what it should
say. I have checked every one against the document; none is a restatement of something the
spec already covers elsewhere.

**Blocking — a later step cannot proceed without inventing domain knowledge:**

| # | Section | What it should say |
|---|---|---|
| 1 | **§3.1 + §6.3** | Give the `clocks_throttle_reasons.active` bit→name mapping, name which bits count as "thermal" for §6.3's alarm row (NVML: `HW_SLOWDOWN 0x8`, `SW_THERMAL 0x20`, `HW_THERMAL 0x40`), and say how a non-`0x4` mask renders as text in §6.2. Blocks step 2. |
| 2 | **§3.2** | Add a core/thread-count row with a named source (`/proc/cpuinfo`), or strike "core/thread count" from §6.2's CPU panel. §6.2 requires a figure §3.2 has no field for. Blocks step 3 and step 10. |
| 3 | **§3.6 + §6.3** | Say what the `pwm5` check reports when it **cannot be performed** (`/sys` unmounted, no `dell_smm` hwmon): a third state, distinct from "absent", rendered as unknown and **not** as the alarm. §6.3's row has only yes/no. This is the gap that made F1 possible. Blocks steps 4, 5, 6. |
| 4 | **§3.3** | Name the wire value for a channel 5 that does not exist. §3.3 fixes `ch5Mode` at `manual \| ec-auto`; §6.5 requires a third presentation and §3.6 makes it an alarm, but the JSON spelling is nowhere. Blocks step 4. |
| 5 | **§3.4** | Enumerate the `/health` result values — the source is fixed, the vocabulary is not. Suggested and currently implemented: `ok` / `unhealthy` (answered but not ready; llama.cpp returns 503 while loading) / `unreachable`, with `null` reserved for "not probed". Blocks step 5. |
| 6 | **§6.3** | Extend the "Any unit" row to all six systemd `ActiveState` values — `reloading` and `deactivating` are unmapped. Blocks step 2. |

**Needed, non-blocking:**

| # | Section | What it should say |
|---|---|---|
| 7 | **§3.2 (+ §2.2)** | Add a `hostname` row with a source. §4's example and §6.2's header both carry it and §3.2 names nothing. **`os.hostname()` inside a container returns the container's UTS hostname, not `ai-server`** — `--network host` shares the network namespace, not UTS — so the spec should name either `--uts=host`, a read-only `/etc/hostname` mount, or an explicit `--hostname ai-server`, and §2.2's access table should gain the row. |
| 8 | **§6.6** | Add the three missing format rows: **load average** (§6.2's CPU panel shows it; `LoadAverage` is three bare numbers with no format), **context length** (§6.2's SERVING row shows it — `131072` vs `131,072` vs `128K`), and **channel-5 PWM** (§6.2 fixes the literal string `HIGH pwm 255`, so the row must give both the state name and the raw value). |
| 9 | **§4 (or §6.5)** | Say whether `errors[].source` is a closed vocabulary the UI keys off — §6.5's "its `errors` entry is available" implies matching an error to a figure, which needs a stable id — or free text for display only. Either answer unblocks step 6; the absence of an answer is what leaves it as `string`. |
| 10 | **§4** | Name the remaining safety field(s) in the example JSON. Only `ufwEnforcing` and `pwm5Present` appear; §3.6's other checks exist there as prose labels, so their wire spelling is invented downstream. (If `fanServiceActive` is dropped per F8, only the DKMS field needs naming.) |
| 11 | **§3.1** | Say what the GPU panel shows when there has been **no** successful read this session. §3.1 asks for "the timestamp of the last successful read"; §6.4 makes the ring empty on reload by design, so on a fresh load with `nvidia-smi` already absent there is no such timestamp. |

**Weakest item — include only if you agree it matters:**

| # | Section | What it should say |
|---|---|---|
| 12 | **§6.2 or §3.2** | `uptimeSec` is collected in §3.2 and displayed in no §6.2 panel and has no §6.6 format row. Either give it a home in the header or the CPU panel, or note in §3.2 that it is collected and not displayed. This is the one row on this list I would not fight for. |

---

## 3. My own findings

### R1 — `lib/types.ts` carries *normative instructions to later steps*, and one is already wrong · **MEDIUM**

The file is 503 lines: **138 lines of code, 330 of comment, 35 blank.** A 2.4:1 comment ratio
is not automatically ceremony — in a pipeline where every phase is a fresh agent with clean
context, encoding "why this is nullable" and "which sensor lies" next to the field is exactly
right, and most of the prose is that.

The problem is the minority that is not descriptive but **directive**:

- `lib/types.ts:421-423` — "whoever assembles the snapshot derives one from the other rather
  than reading twice" (wrong, F1)
- `lib/types.ts:436-439` — the same instruction for `fanServiceActive` (removable, F8)
- `lib/types.ts:84-85` — "the decoding lives in one place (step 2)" (assigns work, and the
  vocabulary it assigns does not exist, F9a)
- `lib/types.ts:172-173` — "step 5 owns the collector and should confirm it"

A wrong descriptive comment misinforms. A wrong **directive** comment gets *obeyed* — which
is precisely how F1 becomes a fabricated hardware alarm. Directives also escape review: the
pipeline reviews `HANDOVER.md` at every step boundary and reviews `types.ts` once, here.

**Recommendation:** keep every descriptive comment. Move the four directives into
`HANDOVER.md` as named obligations on named steps, leaving behind at most a pointer. That is
where steps 4, 5 and 6 are contractually required to read, and it is the document that gets
re-read eleven more times.

### R2 — the two fixtures are the step's most reusable artefact and they are private · **MEDIUM**

`nothingReadable` and `everythingZero` (`lib/contract.test.ts:144` and `:185`) are exactly
what step 2's formatter tables, step 6's route tests, step 8's ring-buffer tests and step 9's
render tests all need: one canonical all-null snapshot and one canonical all-zero snapshot,
which together *are* invariant 1. They are module-local `const`s in a test file.

Four later steps will each rebuild them by copy-paste, and they will drift — and the moment
they drift, "null renders as `—`, zero renders as `0 RPM`" is being tested against four
different definitions of null and zero.

**Recommendation:** export them from a shared module (`lib/fixtures.ts` or
`lib/__fixtures__/snapshots.ts`) and have `contract.test.ts` import them. They are not
imported by app code, so nothing ships. This is the single highest-leverage thing step 1 can
still do for steps 2–10, and it costs a file move.

Add to it the **two fixtures the adversarial's findings imply**: one with a populated
`serving` array (F7 — §3.4 has no runtime coverage at all), and one representing "the cooling
probe could not be performed" — `ch5Mode: null` **with** `pwm5Present: null` — asserted
distinct from a fixture with `ch5Mode: null` and `pwm5Present: false`. That second pair pins
F1's semantics by example, which is more durable than any comment.

### R3 — `types.ts` is starting to become a junk drawer · **LOW**

`Severity` is not a field of the snapshot; it is step 2's derived vocabulary, parked in the
wire contract. That is defensible today (one shared spelling, one import) and I am not asking
for it to move now. But steps 2, 8 and 9 each arrive with vocabularies of their own —
condition ids for §6.4's `STANDING` list, display modes (`paused`/`stale`), chart series ids
— and the path of least resistance puts every one of them here. Then the file that claims in
its header to describe "the shape of the JSON returned by `GET /api/telemetry`" no longer
does.

**Recommendation:** state the boundary in HANDOVER now — `lib/types.ts` is the wire contract
and nothing else; derived and UI vocabularies live in the module that owns them.

### R4 — the brand constructors are naming, not validation, and nothing says so · **MEDIUM**

`percent(-5)`, `rpm(NaN)`, `port(999999)`, `celsius(Infinity)` and
`isoTimestamp('banana')` all type-check and all pass through unchanged — the constructors are
`v as T`, verified by `lib/contract.test.ts:102`. This is correct and intended (branding is
erased; the JSON must stay plain), but it is a shape that *looks* like validation, and a
step-3 collector author who writes `celsius(parseFloat(field))` has written no check at all
while feeling like they did. `NaN` then flows to §6.6's formatter and renders "NaN °C" — a
figure that is neither `—` nor a numeral, which is a state §6.6 does not contemplate.

**Recommendation:** one sentence in HANDOVER — *the brand constructors are identity functions;
they name a unit and check nothing. Parsing and range-checking belong in the collector, and a
value that failed to parse is `null`, never `celsius(NaN)`.* Do not add validation to the
constructors at step 1; that is a step-2/3 decision and adding it here would make branded
values non-erasable in ways the wire test would have to chase.

### R5 — the test file split is right; the contents of one file are not · **LOW**

The type-level / runtime split is correct and should stand. But `lib/contract.test.ts` mixes
two unrelated things: three **project-configuration guardrails** (`tsconfig` strictness,
`output: 'standalone'`, no `next/image`) and the **contract** tests proper. Only the first
group has a project-wide scope, and only the first group is what catches the `TS5052`
invalid-config case where `tsc` bails and Vitest reports "no errors" on a compiler that never
ran — which makes it the most load-bearing test in the step and the least obviously named.

**Recommendation, low priority:** move the three configuration tests to their own file
(`config.test.ts` at the project root, or `lib/guardrails.test.ts`) so that as steps 2–11 add
guardrails they have an obvious home and the contract file stays about the contract. Do not
lose them in the move.

### R6 — the strictness assertion covers five flags of eight · **LOW, cheap**

`lib/contract.test.ts:42-49` pins `strict`, `!strict:false`, `!strictNullChecks:false`,
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Unpinned: `noImplicitOverride`,
`noUnusedLocals`, `noUnusedParameters`, and — the one that matters — **`noFallthroughCases
InSwitch`**, which is what will catch a missing `break` in step 2's severity bands and step
9's channel-5 mode switch. Since `next build` demonstrably rewrites this file, the flags that
later steps depend on should all be asserted, not just the ones invariant 1 needs.

### R7 — `paths: { "@/*": ["./*"] }` is an unused convention waiting to be applied inconsistently · **LOW**

Nothing imports through it today. Eleven steps from now some files will say
`@/lib/types` and some `../../lib/types`. Either state the rule in HANDOVER (*`@/` for
cross-directory imports, relative within a directory*) or drop the alias. Either is fine;
leaving it undeclared is what produces the mess.

### R8 — `pnpm start` is not the deployment path and currently pretends to be · **LOW**

`next start` prints `⚠ "next start" does not work with "output: standalone"` and then serves
correctly anyway — from a different code path than the container will use. build.md records
this in §6, but it lives in a step-1 note that step 11 is not required to read. It belongs in
HANDOVER: **the container runs `node .next/standalone/server.js` after copying `.next/static`
and `public` in; `pnpm start` is a local convenience and is not what is deployed.**

### R9 — scope conformance: clean · **no action**

Checked as a unit against PLAN.md's step-1 row and SPEC.md §2.4/§2.5:

- `next.config.mjs` carries exactly one setting. Nothing unasked-for.
- `vitest.config.mts` has no `environment`, no jsdom, no coverage provider, no React plugin —
  correct, those become justifiable at step 9.
- `app/` is two placeholder files. `layout.tsx` paints the dark ground explicitly per §9,
  which is the minimum needed for `next build` to have something to build; `page.tsx` says it
  is a placeholder. Neither anticipates step 10.
- Eight dependencies, each with a recorded reason, all pinned exactly. No linter — correctly
  argued, and the two rules a linter would carry (strictness, no `next/image`) are enforced
  by failing tests instead, which is stronger.
- Nothing outside `dashboard/` was created or modified.

### R10 — one hypothesis of mine that did **not** hold, recorded so nobody re-chases it

I suspected that `"exclude": ["node_modules"]` (which does not exclude
`.next/standalone/node_modules`) would pull a traced copy of Next's `.d.ts` files into the
program after a build, making `pnpm typecheck` behave differently before and after
`pnpm build`. **It does not.** `tsc --noEmit --listFiles` reports 575 files, of which exactly
8 are under `.next/` and all 8 are Next's generated route/param/validator types. TypeScript's
include globs skip `node_modules` directories at any depth. The build's change to `exclude`
is sound.

### R11 — nothing is committed, and the `.gitignore` edit is orphaned · **LOW, not step 1's call**

`git status` at the repo root is still `M .gitignore` + `?? dashboard/`. PLAN.md and the
repo's own CLAUDE.md both say commit only when asked, so the build was right not to. But the
pre-existing `.gitignore` edit (which adds `dashboard/node_modules/`, `.next/`, `out/`,
`.env*` per §2.4) is uncommitted and unattributed, and step 12's "survives a reboot"
verification is not something to attempt from an untracked tree. Reconciliation should record
the state in HANDOVER and flag that a commit point is needed before step 11, without taking
it.

### R12 — an option, not a recommendation

`Gpu.index` and `ServingInstance.instance` are both bare `number`, and §6.2's join is
`gpu.index === serving.instance`. Branding both as one `CardIndex` would make the join
self-documenting and make joining on the wrong field a compile error. I am **not** asking for
it: it adds a sixteenth brand for a one-line join, and the build's own note — that nothing
asserts instance N is pinned to GPU N — is a runtime concern a type cannot fix. Recorded so
the option is visible if step 10 finds the join fragile.

---

## 4. The two open questions

### Ruling 1 — `AGENTS.md` / `CLAUDE.md` inside `dashboard/`: **COMMIT them**

I read both files and the generator. The decisive detail is one neither the build nor the
adversarial phase mentions: **`AGENTS.md` is delimited.**

```
<!-- BEGIN:nextjs-agent-rules -->
… Next's warning that Next 16 differs from training data, pointing at node_modules/next/dist/docs/ …
<!-- END:nextjs-agent-rules -->
```

Next manages only the text *between* the markers (`node_modules/next/dist/server/lib/
generate-agent-files.js`), so the file is stable, self-describing, and safe to extend.
Contents are 678 bytes of generic Next guidance and 11 bytes of `@AGENTS.md` — no machine
state, no secrets, nothing local to this Mac.

Commit both, and remove `AGENTS.md` / `CLAUDE.md` from `dashboard/.gitignore`. Reasons:

1. **They are a real input to the ten remaining agent-run steps.** The pipeline's premise is a
   fresh agent with clean context at every phase; a file telling that agent "this is not the
   Next.js you know, read the bundled docs first" is the single cheapest defence against a
   step-9 or step-10 agent writing Next 14 idioms from memory. Ignoring it means that defence
   exists only on this machine, only until someone cleans the tree.
2. **Ignored means invisible, and the file is regenerated on every `next dev`.** An ignored
   file that a tool rewrites is permanent untracked churn that no `git status` will ever
   surface. Next's own text makes the same argument.
3. **The ignore pattern is dangerously broad.** `CLAUDE.md` in `dashboard/.gitignore` would
   also silently swallow a *hand-written* `dashboard/CLAUDE.md` if anyone ever adds one — and
   §2.4 is a section that talks about CLAUDE.md files, so someone will.

**No conflict with §2.4.** Its rule is *"CLAUDE.md gets a pointer to this file, not a summary
of it — one document owns the dashboard's design"*. `dashboard/CLAUDE.md` contains
`@AGENTS.md` and duplicates no design. The rule is about not forking the spec, and nothing
here forks it.

**What §2.4 should record** — one bullet under the boundary rules, plus two lines in the tree:

```
   ├─ AGENTS.md              generated and re-added by `next dev`; committed, not ignored
   ├─ CLAUDE.md              one line, `@AGENTS.md` — points agents at the Next guidance above
```

> **`dashboard/AGENTS.md` and `dashboard/CLAUDE.md` are generated by `next dev` and are
> committed.** Next rewrites only the text between its `BEGIN:nextjs-agent-rules` /
> `END:nextjs-agent-rules` markers, so project-specific agent notes may be added outside them
> and will survive. They are agent guidance, not design: `SPEC.md` remains the one document
> that owns the dashboard's design, and the root `CLAUDE.md` still gets only a pointer to it.

That last sentence matters because it closes the ambiguity F14 exposes — the repo now has two
`CLAUDE.md` files and the spec should say what each is for.

### Ruling 2 — the `tsconfig.json` rewrite: **CONFIRMED harmless. Do not pin the file; pin the properties.**

I verified the current file myself rather than trusting the adjudication. `next build` set
`jsx: "react-jsx"` (required — Next uses the automatic runtime; the alternative is a build
failure) and appended `.next/dev/types/**/*.ts` to `include`. **All eight strictness settings
survive**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, and `allowJs: false`. The comment block explaining them
survives. The added `include` entry resolves to 4 generated files and to nothing at all in a
fresh clone, where TypeScript tolerates a non-matching glob — the adversarial phase verified
that with `.next/` removed entirely, and my `--listFiles` run confirms the entry pulls in
nothing else (R10). A second `pnpm build` makes no further change, so the rewrite is
idempotent.

**Do not pin the file.** Pinning bytes would fight a tool that will simply rewrite them again,
and it would fail the build the first time Next legitimately needs a new `include` path. The
correct pin already exists and is the right shape: `lib/contract.test.ts` asserts the *values
that matter* as text, and it is specifically the only thing that catches the nastiest case —
`strict: false` with `exactOptionalPropertyTypes: true` is an **invalid** config (`TS5052`),
so `tsc` bails before checking anything and Vitest cheerfully reports `Type Errors no errors`
on a compiler that never ran.

Two things to do rather than pinning:

1. **Widen the assertion to the remaining flags** (R6) — `noFallthroughCasesInSwitch` above
   all, since step 2's severity bands and step 9's mode switches depend on it.
2. **Record the behaviour in HANDOVER**: `next build` edits `tsconfig.json` in place. Step 11
   should expect a modified `tsconfig.json` inside the Docker build stage, and should run
   `pnpm verify` **before** `next build` so the checks run against the file as committed.

---

## 5. Priority-ordered work list for reconciliation

Scope is exactly this list. Nothing else. Anything not here is either deferred to a named step
below or deliberately not being done.

### MUST — the step does not close until these are done

| # | Work | Source | Files |
|---|---|---|---|
| M1 | **Replace the `pwm5Present` invariant with the one-directional rule.** `ch5Mode !== null ⟹ pwm5Present === true`; the converse does not hold. Delete the "derives one from the other" instruction. Both fields must come from **one three-valued probe outcome** (could not look / not there / there + mode), never from each other. Fix the `nothingReadable` docstring's second sentence. | F1 | `lib/types.ts:418-425`, `lib/contract.test.ts:143` |
| M2 | **Close the alias-vs-field gap.** Implement Properties A (every brand nominal), B (every field's exact type pinned by name, all ~45 of them), C (no field admits `undefined`). Mechanisms verified in this review; do not settle for pinning only the fields a fixture happens to reach. | F2, F3, F4, F7 | `lib/types.test-d.ts` |
| M3 | **Add a `verify` script** — `tsc --noEmit && vitest run` — and make HANDOVER state that green means `pnpm verify` **exit 0**, that the Vitest summary's `Tests` and `Type Errors` counters are unreliable (a file that fails to compile *loses* its tests from the count rather than failing them), and that step 11 must gate the Docker build on exit status and never on grepping output. | F5 | `package.json`, `pipeline/HANDOVER.md` |
| M4 | **Remove `Safety.fanServiceActive`.** Derive the SAFETY row from `cooling.serviceState === 'active'`. It is absent from §4's example, its name is invented, and removing it removes an entire contradiction class between two adjacent panels. | F8 | `lib/types.ts:433-444`, `lib/contract.test.ts`, `lib/types.test-d.ts` |
| M5 | **Delete the `Ch5Mode` alias.** `Cooling['ch5Mode']` is already the asserted authority. | F11 | `lib/types.ts:177-180` |
| M6 | **Correct the F6 claim before it enters HANDOVER.** A module-scope type error in a `*.test-d.ts` **does** fail `pnpm test` (exit 1, file marked failed); what it does not do is show up in the counters. Keep the `test()`-body structure — the reason changes, the practice does not. | F6 | `lib/types.test-d.ts:74-80`, `pipeline/HANDOVER.md` |
| M7 | **Rewrite HANDOVER.md as the pipeline's fact base**, carrying at minimum: M1's probe rule as a named obligation on steps 4/5/6; M3's exit-code rule; the M6 correction; the F12 ruling (keep `gpus`/`serving` nullable, use `?? []`); R4 (brands name, they do not validate); R8 (`pnpm start` is not the deployment path); Ruling 2's note that `next build` rewrites `tsconfig.json`; the six blocking spec gaps with the step each blocks; and F14's unowned root-`CLAUDE.md` pointer assigned to step 11. | F1, F5, F6, F12, F13, F14, R1, R4, R8 | `pipeline/HANDOVER.md` |

### SHOULD — do these now; they get materially more expensive later

| # | Work | Source |
|---|---|---|
| S1 | **Export the fixtures** to a shared module and import them in `contract.test.ts`, so steps 2/6/8/9 share one all-null and one all-zero snapshot instead of four copies. Add two more: a populated `serving` array (closes §3.4's total absence of runtime coverage), and a pair distinguishing `ch5Mode: null` + `pwm5Present: false` from `ch5Mode: null` + `pwm5Present: null` (pins M1 by example). | F7, R2 |
| S2 | **Widen the tsconfig text assertion** to the remaining strictness flags, `noFallthroughCasesInSwitch` first. | R6, Ruling 2 |
| S3 | **Commit `dashboard/AGENTS.md` and `dashboard/CLAUDE.md`** and remove both from `dashboard/.gitignore` — the `CLAUDE.md` pattern is broad enough to swallow a hand-written file later. | Ruling 1 |
| S4 | **Move the four directive comments out of `lib/types.ts`** into HANDOVER as obligations on named steps. Keep every descriptive comment. | R1 |
| S5 | **Declare the import convention** for `@/*` in HANDOVER, or drop `paths` from `tsconfig.json`. | R7 |

### DEFER — named step, recorded so nothing is silently dropped

| Work | Owner | Blocked on |
|---|---|---|
| Throttle-mask bit vocabulary and "which bits are thermal" | step 2 | spec gap 1 |
| `reloading` / `deactivating` severity | step 2 | spec gap 6 |
| Format rules for load average, context length, PWM | step 2 | spec gap 8 |
| Condition-id vocabulary for §6.4's `STANDING` list | step 2 | — |
| Core/thread count field and source | step 3 | spec gap 2 |
| The three-valued `pwm5` probe that M1's rule requires | step 4 | spec gap 3 |
| `/health` vocabulary — confirm or replace `HealthState` | step 5 | spec gap 5 |
| `errors[].source` vocabulary | step 6 | spec gap 9 |
| Wire validation: no `as TelemetrySnapshot` on a `fetch` response without a decode step | steps 6, 8 | F13 |
| Splitting the configuration guardrails out of `contract.test.ts` | whichever step next adds one | R5 |
| Rendering for "no successful read this session" | step 10 | spec gap 11 |
| Standalone server invocation (`node .next/standalone/server.js` + the `cp` of `.next/static`) | step 11 | R8 |
| Root `CLAUDE.md` pointer to `SPEC.md` (§2.4) | step 11 | F14 |
| `jsdom`, React plugin, coverage provider, ESLint | whichever step first needs one | — |

### EXPLICITLY NOT DOING

- **Not changing `gpus`/`serving` to non-nullable.** Ruled on above (F12): keep, record the
  ruling and the `?? []` idiom in HANDOVER.
- **Not making `pwm5Present`/`ch5Mode` structurally consistent in the type system.** A
  discriminated union over the whole snapshot is worse than the problem; the build's judgement
  stands. M1 plus the HANDOVER obligation is the fix.
- **Not pinning `tsconfig.json` against `next build`.** Pin the properties (S2), not the bytes.
- **Not adding validation to the brand constructors.** They must stay erasable identity
  functions; parsing belongs in the collectors (R4).
- **Not restructuring `lib/types.test-d.ts`'s `test()`-body layout.** The practice is right;
  only its stated justification was wrong (M6).
- **Not committing the project.** Outside this phase's authority; flagged in HANDOVER (R11).
