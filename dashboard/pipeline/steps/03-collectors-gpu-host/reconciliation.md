# Step 3 — GPU & host collectors · reconciliation phase

**Green, by exit code.** `pnpm verify` → **exit 0, 837 tests, 13 files** (from 807).
`pnpm build` → exit 0. Both regression harnesses pass: step 2 at **40** mutations, step 3
at **64** (from 51). Verbatim output in §6.

The review's list was executed as written except in one place, where its central factual
claim did not reproduce on this toolchain and I measured the correction rather than shipping
the recommendation. That is §1.

Every finding is dispositioned below: the adversarial's **11**, the build's **9**
underspecified items plus its **2** own findings, and the review's **6**. Nothing dropped.
New spec gaps for the owner are in §5 — including one that contradicts a sentence §3.1 now
carries.

---

## 1. ⚠ A1 — the fix is not the one the review specified, and I have the measurements

**The finding is entirely upheld, and its severity was understated if anything.** The
mechanism is exactly as the review described: `execFile`'s callback fires on `'close'`,
which needs both that the process exited *and* that its stdio closed, so `timeout:` — which
signals the child and does not settle the promise — is decoration against a child that does
not die.

**Where the review is wrong is which single option fixes it.** §3.1 now states, and the
review measured, that `AbortSignal` "settles the promise while the child is still running
**and also destroys the pipes**", closing the second unbounded path where a grandchild holds
stdout. On Node 24 it does not. I reproduced both hang shapes against all the candidates:

| 300 ms deadline | `trap "" TERM; sleep 9` | `sleep 9 & exit 0` — descendant holds stdout |
|---|---|---|
| `timeout:` alone (as shipped) | **9015 ms, and RESOLVED** | 305 ms, resolved with truncated stdout |
| `killSignal: 'SIGKILL'` alone | 307 ms | **never — nothing is left to signal** |
| `signal:` an `AbortSignal` alone | 305 ms | **9043 ms** |
| **what I shipped** | **306 ms, rejected** | **306 ms, rejected** |

The reason is visible once stated: **Node drops its abort listener when the child exits.**
`signal:` therefore bounds the promise *only while the child is alive*, which is precisely
the condition the orphan-pipe case violates. The review's own recommended shape, pasted
verbatim into `io.ts`, fails the orphan-pipe test — I wrote that test first and watched it
time out at 5000 ms before diagnosing it.

**So the deadline does the work itself, and each of its four actions is load-bearing:**

```ts
timer = setTimeout(() => {
  ac.abort();                 // bounds a LIVE child, and SIGKILL reaps a killable one
  child.stdout?.destroy();    // bounds the descendant-holding-stdout case; abort cannot
  child.stderr?.destroy();
  child.unref();              // an abandoned process must not hold the event loop open
  finish(() => { reject(expired()); });   // settles AT the deadline, unconditionally
}, timeoutMs);
```

This is **not** the bare `Promise.race` the review ruled out. Its objection to a race was
that it "abandons the promise without touching the streams and would leak the pipe" — that
is the exact failure the `destroy()` calls close, and it is the only reason `signal:` was
preferred. Every property the review argued for is present; one of them just is not
delivered by the option it named. `signal:` and `killSignal:` are both kept: they are what
reaches a live child, which is the common case and the one a wedged driver produces.

`finish()` is why the promise settles rather than resolving late: without it the orphan case
comes back as a **success** carrying a truncated CSV, which the parser would then read as
rows. `child.unref()` is measured, not decorative — a call bounded at 306 ms left the
process alive for **9021 ms** without it and **649 ms** with it, and it is what keeps the
Vitest worker from hanging.

**All three properties are pinned by tests that fail without them** (`S47`, `S47b`, `S47c`),
and the third needed inventing: a leaked pipe is invisible to an elapsed-time assertion, so
the test measures `process.getActiveResourcesInfo()` across the call. Two extra `PipeWrap`
handles appear when the streams are not destroyed and none when they are.

**R6's rewrite went with it, and the old tests were worse than absent:**

- `io.test.ts:142` *"run enforces its timeout"* drove `/bin/sleep 5` — a child that
  **honours SIGTERM**, the one input class where the broken and the correct implementation
  are indistinguishable — and asserted only `rejects`. It now drives a SIGTERM-ignoring
  child *and* an orphan-pipe child, and asserts **elapsed time**, because the broken
  implementation rejects too.
- `collect.test.ts:143` was named *"a timeout is reported with the driver's own text"* and
  exercised no timeout at all. Renamed to what it does, with the rename explained in place,
  and joined by a test that the §3.1 bound is what `collectGpus` actually passes.

---

## 2. The rest of the MUST list

### A2 + A8 — the rule, not just the fixtures

Both fixtures added and both directions mutated. `NVIDIA_SMI_WIDE_ROW` uses the quoted-name
form, which is the worse of the two ways to reach twelve columns: every field shifts one
place left with `problems: []`, and a card at 38 °C reports `0x20 sw thermal slowdown |
0x40 hw thermal slowdown`. A test asserts that decode explicitly, so the cost of losing the
guard sits in the suite rather than only in a note. `PROC_NET_DEV_WIDE` is the 17-column
`eno1` line; per the review it is milder — the byte counters sit at fixed offsets from the
left and nothing shifts — and the fixture says so rather than implying a hazard it does not
have.

**S8 was re-aimed off the operator**, which was the actual finding: a mutation anchored on
`!==` can only ever prove *a guard exists here*, never that it is an equality. It now
anchors on the guard's body, and **S8a/S8b** mutate the comparison in each direction
separately. Same for the `/proc/net/dev` guard (**S54a/S54b**), and for the new `utilPct`
range (**S52/S53**, the second being an off-by-one at 100).

**The rule is in HANDOVER §5, where steps 4–12 read it**, with the reason the harness cannot
supply it.

### A5 — an unreadable node is no longer reported as an absent one

`collectCpuTemp`'s walk records the nodes whose `name` would not read and, if it then finds
no `coretemp`, says so instead of asserting absence. Fixtures on **both** sides: one where
every `name` throws `EACCES` (message names it), one where the names read cleanly and none
matched (message stays unqualified). The value is `null` either way, so in step 3 this only
corrects §6.5's explanation — **the reason it was MUST is step 4**, and the doc comment now
carries that: the same loop locates `dell_smm`, where the swallowed error flips O8's probe
from `null` to a SAFETY alarm claiming GPU fan control is gone.

Deliberately **not** generalised into a shared walk — that is DEFER-16, owned by step 4,
which is the second caller and the first point at which the right abstraction is visible.

### F1 — the fourth uptime form

`formatUptime` gains `if (total < UPTIME_SUB_MINUTE) return 'up <1 min';`. Step 2's files,
crossed deliberately, and **three** test sites moved rather than the two the review found:

- `format.test.ts:196` — the law-2 table's `Uptime` row, `up 0 min` → `up <1 min`.
- `format.test.ts:667` — `'under a minute is still a reading'`, replaced by four cases
  spanning the boundary (0 s, 11 s, 59 s, 60 s).
- The `describe` name and *"the reason there are three forms"* → four.

**The §6.6 collision needed more than changing a string, and this is the one place I went
beyond the review.** The law-2 table's shared assertion was `expect(rendered).toMatch(/0/)`,
which `up <1 min` fails. §6.6 states its own purpose — it is "the §6.5 rule expressed as a
formatting law", and that rule is *"zero and unknown must never look alike"* — so the law is
now asserted as its purpose (`not.toBe(EM_DASH)`, `not.toBe('')`, and
`not.toBe(fromNull())`), with "contains the numeral" kept as a proxy for every row but the
named exception. A companion test pins the exception list to `['Uptime']`, mirroring how law
1 already pins Channel-5 PWM, so a **second** row acquiring it fails rather than passing
quietly. The mutations live in step 2's harness (**R30/R31**), since it is step 2's file.

### F2 — the alias, guarded by a real import

`resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } }` in
`vitest.config.mts`. `fileURLToPath`, not `.pathname`, which percent-encodes.

The guardrail is an **actual `@/` import at the top of `lib/guardrails.test.ts`** — the only
one in the project. If the alias is missing the file does not resolve and the suite is red
before any assertion runs. A text assertion would have been this box's own recurring mistake
in a new place. **S59** deletes the alias and confirms it bites (`FAIL … no tests`). A
companion test keeps `tsconfig.json`'s `paths` present, since that is what the *other two*
toolchains read and two-of-three agreeing is the failure mode.

### A4 + A6 — prose corrected, code unmoved

`lib/types.ts`'s claim that `[]` is "the enumeration ran and found nothing — a real,
previously-observed state of this box" was false: that state exits 6, which maps to `null`.
Rewritten to §3.1's vocabulary, including an explicit note that the old claim was wrong and
why, so it is not re-derived. `collect.ts`'s "could not be measured on a box with two
working cards" is gone — `nvidia-smi -i 5` reproduces it read-only — replaced by the
measured exit codes and by the argument for *not* remapping exit 6.

A6: `describeExecFailure(command, error, stderr)` keeps stderr first (S46 still bites) and,
when stderr said nothing, reports `killed by SIGQUIT` / `exited 6` / `ENOENT` against the
command instead of a 230-character argv dump. Two tests drive real processes for both
branches.

### A3 — REJECTED, as ruled, and the residue recorded

No `errors[]` entry for a rejected delta and **no nineteenth `ErrorSource`**. §6.7 now
carries the clause explicitly, so this is settled rather than merely decided. The real
residue — **nobody owns `previous` across a failed read** — is HANDOVER obligation **O16**,
owned by step 6, with both defensible choices spelled out.

---

## 3. The SHOULD list

| # | Item | Done |
|---|---|---|
| 9 | **A9** — parse-failure path prefix moved into `readAndParse`; every literal stripped from the parsers | ✅ and `collectCpuTemp` prefixes the **discovered** hwmon directory, which is step 4's case. Two tests drive the parse branch specifically (the read succeeds), because the pre-existing tests all removed the file and so only exercised the read branch. S56/S57 |
| 10 | **A7** — `utilPct` range-checked to 0–100 | ✅ Required by §3.1's new row. `null`, **no** `problems` entry, matching `cpuPct` exactly. The decision that no other numeric gets a range is recorded at the function *and* pinned by a test that a `-500 °C` reading is still carried |
| 11 | **R4** — options objects | ✅ `collectGpus({ io, paths, timeoutMs })`, `collectCpuTemp({ io, paths })`, both with `= {}` defaults. `collectHost` already had one |
| 12 | **R3** — rename | ✅ `lib/collectors/fixtures.ts` → **`samples.ts`**, with a header note saying why so it is not reintroduced |
| 13 | **A11** — the alias note | ✅ Corrected in `nvidia-smi.ts` **and** `samples.ts`, which carried the same misstatement. `build.md` left as written — it is a prior phase's record; the correction is here and in the code |
| 14 | **R1** — `parseKernelRelease` | ✅ Warning carried on the **barrel**, not only in `io.ts`. Kept exported rather than dropped: it is a tested hedge, and a later step that wants `/proc/version` needs to see *why* it is unused (U5's missing `ErrorSource`) at the point it reaches for it |

Also implemented because the new spec rows require it here: the **`cpuPct` accounting
sentence was verified against the implementation, not assumed.** `CPU_BUSY_FIELDS` is
`user+nice+system+irq+softirq+steal`, `CPU_IDLE_FIELDS` is `idle+iowait`, and
`guest`/`guest_nice` are absent from `CPU_FIELD_ORDER` entirely — so they are never parsed,
let alone summed, which is stronger than excluding them from `busy` alone (`total` is
`busy + idle`). The doc no longer calls this an interpretation. A test for the half no
captured fixture pins — **`iowait` is idle, not busy** — was added; the box's own
`/proc/stat` has too little iowait for that column's classification to be visible.

---

## 4. Every finding, with its disposition

### The adversarial's eleven

| # | Ruling | What I did |
|---|---|---|
| **A1** | UPHELD, HIGH | Fixed — see §1. The review's recommended mechanism was insufficient; measured and corrected. Three mutations, one driving a SIGTERM-ignoring child |
| **A2** | UPHELD as coverage, severity downgraded | `NVIDIA_SMI_WIDE_ROW` + two-direction mutations + **the rule in HANDOVER**. Shipped code unchanged — it was correct |
| **A3** | **REJECTED** | No error entry, no new `ErrorSource`. §6.7's new clause settles it. Residue → **O16** (step 6) |
| **A4** | Prose defect only | `types.ts` and `collect.ts` corrected. **Mapping unchanged** — exit 6 stays `null` so `No devices were found` survives |
| **A5** | UPHELD | Fixed, both sides fixtured. Doc names step 4 as the reason |
| **A6** | UPHELD (low) | `describeExecFailure` carries `error.signal` / `error.code` |
| **A7** | Consistency half TAKEN, spec change DECLINED | `utilPct` 0–100 only. No invented ranges; the decision is pinned by a test |
| **A8** | UPHELD, folded into A2's rule | `PROC_NET_DEV_WIDE` + two-direction mutations. No independent severity, as ruled |
| **A9** | UPHELD (low) | Prefix moved into the wrapper; parsers hold no literal paths. Seam intact |
| **A10** | **REJECTED as a finding** | No investigation. Recovery line (`rm tsconfig.tsbuildinfo`) kept in HANDOVER §1. Not observed again across ~90 runs this phase |
| **A11** | UPHELD (info) | Code comments corrected in two files |

### The build's own two, and its nine underspecified items

| # | Ruling | Disposition |
|---|---|---|
| **F1** | Confirmed both halves | Code moved, three test sites, law-2 table reformulated. Owner edits §3.2's count word — **already done**, §3.2 reads "Four forms" |
| **F2** | Confirmed, narrower than stated | Alias added, proven by import |
| **U1** cpuPct idle fields | Genuine gap, **now closed by §3.2** | Verified against the spec sentence rather than assumed; doc rewritten from "interpretation" to spec fact; `iowait`-is-idle test added |
| **U2** no `nvidia-smi` time limit | Genuine gap, **now closed by §3.1** | 4000 ms kept. `io.ts`'s "an invented number" note replaced by §3.1's semantics |
| **U3** which exit codes mean `[]` | Genuine gap, **now closed by §3.1**; its stated blocker was never real | Mapping unchanged; the false "could not be measured" note deleted |
| **U4** `bus` carried raw | **Not a gap** — closed | Removed from the open list. §6.6 + §9 mandate raw; §3.1's example is an example, and it now shows the full domain form |
| **U5** no `ErrorSource` for `/proc/version` | **Not a gap** — closed | `os.release()` stays. Warning promoted to the barrel (R1) |
| **U6** only `Package id 0` | **Not a gap** — closed | §3.2 names the sensor exactly. Verified not index-dependent |
| **U7** no ranges on numerics | Genuine gap; **ruled** | `utilPct` only. Recorded as a decision, not left open |
| **U8** floor vs round | **Not a gap** — closed | `parseUptime` matches `formatUptime`'s policy; the double-floor is a no-op |
| **U9** clamp or `null` | **Not a gap at all** | It was a HANDOVER **choice** (O7), and step 3 took `null`. Moved to the decisions list |

### The review's six

| # | Disposition |
|---|---|
| **R1** fifteen files, `index.ts` the exception | Barrel kept; `parseKernelRelease`'s warning moved onto it. The eight source modules kept, `result.ts` included — its argument (a shared `ParseResult` avoids a dependency between two parsers that should not know about each other) is right |
| **R2** `collectCpuTemp` is not a thin wrapper | **Acknowledged, not fixed here.** A5's fix is in place; the extraction is DEFER-16, owned by step 4. Named explicitly in HANDOVER's "do not copy" list, since step 4 will read the walk first |
| **R3** the `fixtures.ts` collision | Renamed to `samples.ts` before steps 4–5 import it |
| **R4** calling conventions disagree | All three collectors take options objects |
| **R5** `CollectorIo` bounds `run`, not `readFile` | **Written into the `CollectorIo` doc comment itself**, not only into HANDOVER — step 4 reads the interface before it reads a handover — and into HANDOVER as **O17** |
| **R6** the two timeout tests | Both rewritten. See §1 |

### Deferred, to the step the review named

**DEFER-15** `throttle.ts`'s optional `0x` prefix (step 2's file, owner's call) ·
**DEFER-16** extract the hwmon walk (step 4) · **DEFER-17** an aggregate poll deadline
(step 6) · **DEFER-18** `netRatesBetween` and a forward NTP step (step 6). All four are in
HANDOVER §7 with owners. **Nothing on the "explicitly not doing" list was done**, including
the two dependencies that were never added.

---

## 5. New spec gaps, for the owner

Three, and the first is a correction rather than a gap.

### ⚠ G1 — §3.1's timeout sentence overstates what an `AbortSignal` does

§3.1 reads: *"Use an `AbortSignal`, which settles the promise while the child is still
running **and also destroys the pipes** — a bare `Promise.race` leaves a second unbounded
path open, where a grandchild holds stdout (measured at 8019 ms)."*

**Measured on Node 24: `signal:` alone does not close that path.** Against
`sh -c 'sleep 9 & exit 0'` with a 300 ms signal it settled at **9043 ms** — Node removes its
abort listener once the child exits, so nothing destroys the streams. `timeout:` *does*
bound that shape (305 ms), which is the reverse of the SIGTERM case. Neither option covers
both.

The **requirement** the sentence states is right and is what I implemented; only the claim
about the mechanism is wrong. Suggested replacement for the parenthetical: *"the deadline
must itself settle the promise, abort the child and destroy its stdio — no single `execFile`
option does all three: `signal:` reaches only a child that is still running, and `timeout:`
does not settle the promise."*

Reproduction is two shell scripts and a Node file, and takes under a minute.

### G2 — §3.1 does not say whether an out-of-range `utilization.gpu` carries an `errors[]` entry

The new row says only "outside that is `null`". I took **no entry**, matching `cpuPct`,
which is checked the same way and reports nothing — and matching §6.7's principle that a
figure that cannot be computed from a *successful* read renders `—` without an error. The
alternative is defensible (the `nvidia-smi` source exists and the value is evidence of a
real problem). Worth one sentence, because step 6 will otherwise re-decide it for `pwm5`'s
0–255 check in step 4.

### G3 — nothing says who owns `previous` across a failed read

The A3 residue, and it is a genuine hole rather than a preference. `collectHost` returns
`sample: { cpu: null, … }` when `/proc/stat` failed. Step 6 can store that (poll 3 → `null`,
today's behaviour) or keep the last **good** sample (poll 3 → a delta over a 10 s span, and
a `cpuPct` that is correct but averaged over an interval the user did not choose). Both are
defensible, neither is written down, and the choice is visible on the CPU panel after any
transient read failure. Carried as **O16** so step 6 cannot take it silently, but §6.7 is
where it belongs.

**Not new, and closed by this step:** U4, U5, U6, U8 and U9 should leave build.md's
underspecified table — four are answered by the spec and one was never a spec question.

---

## 6. The evidence, verbatim

```
$ export PATH="$HOME/.local/bin:$PATH"
$ pnpm verify
$ tsc --noEmit && vitest run
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.0 /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard


 Test Files  13 passed (13)
      Tests  837 passed (837)
Type Errors  no errors
   Start at  19:31:46
   Duration  1.80s (tests 55%, transform 31%, import 8%, typecheck 5%, worker 1%)

VERIFY_EXIT=0
```

```
$ pnpm build
▲ Next.js 16.3.4 (Turbopack)
✓ Compiled successfully in 296ms
  Running TypeScript ...
  Finished TypeScript in 263ms ...
✓ Generating static pages using 4 workers (3/3) in 227ms

Route (app)
┌ ○ /
└ ○ /_not-found

BUILD_EXIT=0
```

`pnpm verify` was re-run **after** `pnpm build` (which has rewritten `tsconfig.json` before)
and stayed at exit 0, 837 tests.

```
$ python3 pipeline/steps/03-collectors-gpu-host/regressions.py
...
All 64 regressions failed their check, as they must.

$ python3 pipeline/steps/02-format-severity/regressions.py
...
All 40 regressions failed their check, as they must.
```

Three mutations that did **not** bite on the first run, all three fixed rather than removed:

| | why it did not bite | what changed |
|---|---|---|
| `S15` | its anchor carried the `/proc/stat:` literal A9 had just stripped | anchor re-aimed |
| `S46` | anchored on a line that moved into `describeExecFailure` | anchor re-aimed |
| `S47c` (pipes leaked) | **no test could see it** — the promise still settled at the deadline | new test measuring `getActiveResourcesInfo()` across the call |

`S47c` is the one worth reading twice: it is A2's pattern in a new place — an implementation
line with no observable consequence in the suite. The fix was a test, not a smaller
mutation.

**One property is deliberately not pinned by a mutation:** `child.unref()`. Its consequence
is that the *process* exits promptly after an abandoned call (measured 9021 ms → 649 ms),
which is not observable from inside a test that has to keep running. Recorded here rather
than left implied.

```
$ git status --short
 M .gitignore
?? dashboard/
```

**No commit was made.** Read-only work against `ai-server`: none this phase — every
measurement in §1 was local, against shell scripts in the scratchpad, and no probe touched
the box (invariant 2).

---

## 7. What changed, as a list

**New:** nothing — no new module, no new dependency (invariant 6 untouched).

**Renamed:** `lib/collectors/fixtures.ts` → `lib/collectors/samples.ts`.

| File | Change |
|---|---|
| `lib/collectors/io.ts` | `nodeIo.run` rewritten (A1); `describeExecFailure` added (A6); `NVIDIA_SMI_TIMEOUT_MS` and `CollectorIo.run` docs rewritten against §3.1; R5's asymmetry documented on the interface |
| `lib/collectors/collect.ts` | Options objects (R4); `collectCpuTemp`'s unidentified-node tracking (A5); path prefix in `readAndParse` and for the discovered hwmon dir (A9); exit-code prose (A4) |
| `lib/collectors/nvidia-smi.ts` | `utilisationReading` 0–100 (A7/§3.1); alias note corrected (A11) |
| `lib/collectors/proc.ts` | Every literal path stripped from `problems` (A9); `cpuPct` accounting doc rewritten against §3.2 |
| `lib/collectors/samples.ts` | `NVIDIA_SMI_WIDE_ROW`, `NVIDIA_SMI_UTIL_{OVER,UNDER}_RANGE`, `NVIDIA_SMI_UTIL_AT_BOUNDS`, `PROC_NET_DEV_WIDE`; rename note; alias note |
| `lib/collectors/index.ts` | Two option types exported; `parseKernelRelease` warning (R1) |
| `lib/types.ts` | The `null`-vs-`[]` prose (A4) |
| `lib/format.ts` | The fourth uptime form (F1) |
| `lib/format.test.ts` | Three uptime sites; law-2 table reformulated around §6.6's stated purpose |
| `lib/guardrails.test.ts` | A real `@/` import + two tests (F2) |
| `vitest.config.mts` | `resolve.alias` (F2) |
| `*.test.ts` under `lib/collectors/` | 30 tests added; two renamed; all call sites moved to options objects |
| both `regressions.py` | 13 mutations added, 2 re-aimed, 1 replaced |
