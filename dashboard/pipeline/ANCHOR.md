# ANCHOR — resume point for the ai-server dashboard build

**Written 2026-09-07 by the session that ran steps 1–8, and updated after step 8's
reconciliation stopped part-way. It is the only inheritance:
the next session has no memory of that conversation.** Read this file, then `PLAN.md`, then
`HANDOVER.md`, then `SPEC.md`. Everything below is fact unless marked otherwise.

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

## 2. State at the moment of writing — READ CAREFULLY

**Steps 1–7 are closed and verified.** Step 8 is **not**.

| Step | Scope | State |
|---|---|---|
| 1 | Scaffold & contract (`lib/types.ts`) | **closed** |
| 2 | Format & severity (`format/severity/throttle/conditions`) | **closed** |
| 3 | GPU & host collectors | **closed** |
| 4 | Cooling collector | **closed** |
| 5 | Serving / storage / safety collectors | **closed** |
| 6 | Telemetry route (`/api/telemetry`, cache, gate, ceiling) | **closed** |
| 7 | Auth & login (scrypt, cookie, limiter, `/login`, `proxy.ts`) | **closed** |
| 8 | Client runtime (`lib/client/`) | **build + adversarial + review done; RECONCILIATION IN FLIGHT** |
| 9–12 | UI primitives, panels, packaging, deploy | **not started — OUT OF SCOPE, see §8** |

### Step 8 stopped part-way, and this is the exact position

Step 8's reconciliation agent **ran out of context at roughly 60 %**. Its code work is
**complete and green**; its harness re-aiming and its two closing documents are **not done**.

| Piece | State |
|---|---|
| All 12 MUSTs + 14 SHOULDs from `review.md` | **implemented, with tests** |
| `pnpm verify` | **green — 1982 tests, 57 files, exit 0** (verified 6× across two sessions) |
| `lib/client/gaps.ts`, `lib/client/mode.ts` | new, landed |
| Harnesses 2–7 (47/64/90/127/61/116) | all exit 0, ledgers clean |
| Step 8's own harness — **20 moved anchors to re-aim, ~20 mutations to add** | **outstanding** |
| `steps/08-client-runtime/reconciliation.md` | **does not exist** |
| `pipeline/HANDOVER.md` | **still says "after step 7, before step 8" — NOT rewritten** |

**Therefore `HANDOVER.md` does not describe step 8.** Until it is rewritten, the authoritative
record is `steps/08-client-runtime/reconciliation-progress.md` (26 KB) — it carries every
finding's disposition, the corrected surface for steps 9/10, and a restart brief. A manifest
snapshot is at `steps/08-client-runtime/manifest-baseline.txt`.

#### Exactly what is left of step 8 (its §9, summarised so this file stands alone)

| | Work | Notes |
|---|---|---|
| **9.1** | **Re-aim 20 moved harness anchors.** `python3 pipeline/steps/08-client-runtime/regressions.py` reports **20 `ANCHOR NOT FOUND`** until done | The brief ships a script that lists them without running vitest |
| **9.2** | **Add ~20 mutations**, and add `gaps.test.ts` + `mode.test.ts` to `LEDGER_FILES` | The brief enumerates every one. **The most important is the hidden-gap erasure the old suite missed**: mutate `observeSample`'s `anyGapReason(state) === null` to `true`, which must redden the ⚠ test of that name in *both* `gaps.test.ts` and the runtime fixture |
| **9.3** | **Write `reconciliation.md`** | Needs the final harness numbers and the pasted verify output |
| **9.4** | **Rewrite `HANDOVER.md` for step 9** | Currently 56 KB describing the pre-fix world. The brief lists nine things it must carry — including the corrected surface, the twelve "must not leak into 9/10" rules, the four composition gaps, and **the three `build.md` over-claims that must never be repeated in their original form** |
| **9.5** | **Evidence** — `pnpm verify` ×10 serially, then step 8's harness last and alone, manifest diffed after | |

**Do not start 9.2's `fetch` mutations casually**: one of them (`Function('return fetch')()`)
names neither `fetch` nor `globalThis` and exists specifically to demonstrate what the text
guard cannot catch.

Two findings from the completed part worth carrying forward:

- Retrofitting the red-test ledger to **step 2's** harness found **six pre-existing ⚠ marks
  with no mutation behind them**, five on `severity.ts`'s fan-stopped rows — including the
  `-0` / `Object.is` trap. All six are now backed. **Step 3's harness still has no ledger.**
- `FakeEnv`'s two fake clocks were **in different years** (browser 2023, server 2026).
  Invisible until `mode` became a function of `now − ts`. Now coupled.

### The commit is taken

```
branch   dashboard-backend      (branched from main; main is untouched)
commit   71a2f7d                183 files, working tree clean
```

**The next session is on `dashboard-backend`, not `main`.** Nothing has been pushed.

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
`reconciliation.md` "new spec gaps for you" section. Beware — the `S*` namespace is polluted:
some `S`-prefixed ids in steps 3–5 are *harness mutation ids*, not gaps.

A cached extract of the DEFER tables for steps 1–7 may still exist at
`/private/tmp/claude-501/.../scratchpad/defers.md`; regenerate it if not.

### Already-identified and still open — the sweep at (3) should start here, not rediscover them

**Spec gaps awaiting the owner's wording** (found in step 8's reconciliation; `SPEC.md` was
not edited, and the code's current choice is recorded beside each in that brief's §4):

| # | Gap |
|---|---|
| **S49** | §6.7 does not say whether the 600-point decimation budget is **per series or per chart**. The review ruled per series; the sentence never reached the spec. Code draws up to 1,800 points on §6.2's stacked chart |
| **S50** | §6.5 says a stale condition's row "names the age of the reading" but **not which clock measures it** — §6.7 splits server `ts` from browser `now`, and "the age of a reading we did not take" is cleanly neither |
| **S51** | §6.5 does not say what a stale condition's **value** shows. Code keeps the last reading; §6.6's "`null` renders `—`" could be misread as requiring a blank |
| **S52** | §6.4 does not say whether `loggedStanding` **survives a mid-session `STANDING` change**. Code does not reset it — it belongs to the session, not the configuration |
| **S53** | §4 does not say what a **duplicate entry in `STANDING`** means. Echoed verbatim; harmless because the client builds a `Set`. Recorded so nobody "fixes" it server-side |

**Deferred work items with owning steps** (from step 8's §9.4 list — most are 9/10 and
therefore **out of scope**, listed only so they are not lost):

- **In scope (backend):** **D8** `STANDING` env plumbing → step 11, verified step 12 · the
  **red-test ledger retrofit for step 3's harness**, which still has none · the six ⚠ marks
  on `severity.ts` that step 2's retrofit found unbacked (now backed — confirm) .
- **Out of scope (UI, steps 9–12):** D1 S40's third event-log feed · D2 the independent age
  tick · D3 rendering `unknownStanding` · D4 `errorsForPanel` · D5 `traceFor` · D6 jsdom +
  `useTelemetry` unmount · D7 S11/G5, S19, S30 · **O19** the GB→GiB brand rename.

---

## 8. The plan from here — this is what "start 3" means

The owner's instruction, numbered as given:

0. **Prerequisite, not in the owner's numbering: finish step 8's reconciliation** — §2 above
   lists the five pieces. `HANDOVER.md` cannot be trusted until 9.4 is done, and the harness
   is reporting 20 missing anchors until 9.1 is. Use the restart brief in
   `steps/08-client-runtime/reconciliation-progress.md` §9. **Alternatively**, fold this into
   the work-item list at (4) as its own item — but do not begin (7) with `HANDOVER.md` still
   describing a step that has since changed underneath it.
1. ~~Commit `dashboard/`~~ — **done**, `71a2f7d` on `dashboard-backend`.
2. ~~Write this anchor~~ — done, and updated.
3. **Read `SPEC.md` and resolve remaining ambiguities in the steps 1–8 surface only.**
4. **Create atomic work items** from those ambiguities *plus* every open finding and
   obligation recorded by the adversarial and review phases across steps 1–8.
5. **Run an adversarial review of the work-item list itself** — complete? genuinely atomic?
   anything wrong, unnecessary, or missing?
6. **Reconcile** those findings into the final list.
7. **Execute one item at a time**, each in a **fresh context with a hand-off from the
   previous**, in the loop: **build → test → adversarial review → reconciliation**.

### ⚠ Scope constraint — absolute

**Backend only. Do not touch anything belonging to steps 9–12**: UI primitives, charts,
panels, packaging (Dockerfile, `dashboard.sh`, systemd), or deployment to the box. Roughly
eleven deferred items name those steps — **record them, do not build them.** If a work item
turns out to be UI-shaped, defer it explicitly rather than starting it.

Sections of `SPEC.md` in scope for the sweep: **§1–§5, §6.3, §6.4, §6.6, §6.7, §9, §3.x**.
Out of scope: §6.1, §6.2's panel list, §6.5's *rendering* prescriptions, §2.3/§2.5's
packaging rows, §8.

---

## 9. Standing constraints

- **Commit only when asked** (repo convention, root `CLAUDE.md`). The commit in §8.1 *was*
  asked for.
- **The server `ai-server` is reachable over SSH and is read-only to this work.** Reads are
  encouraged — several findings were settled by measuring the real box. **Never write to it**:
  no `pwmN`, no mutating D-Bus call (`LoadUnit` is forbidden — `GetUnit` is the read-only
  one), no `/v1/chat/completions`.
- **`ufw` now enforces on the box** (`ENABLED=yes`, verified 2026-09-06). Port **8090 has no
  allow rule**, so the dashboard will be unreachable until step 12 adds one. Do not add it now.
- Nothing outside `dashboard/` should change, except the root `.gitignore` (already modified).
