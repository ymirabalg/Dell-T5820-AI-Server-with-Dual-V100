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

## 2. State — READ CAREFULLY. Updated 2026-09-07, end of session two.

**Steps 1–8 are closed and verified. Step 9's full loop is closed.** Steps 10–12 have not started.

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
| steps 1–8 | closed. 705 mutations across seven harnesses, every one biting |
| step 9 | **closed** — build → test → adversarial → reconcile, 25 findings adjudicated |
| suite | **67 files · 2210 tests · `pnpm verify` exit 0 · `pnpm build` clean** |
| step 9's harness | 61 mutations, ledger clean over 67 ⚠ marks |
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

### 2.2 ⚠ What to do next — `pipeline/WORK-ITEMS.md` §10 is the queue

**Q1 first, and it is not step 9 work — it is a defect in the mechanism every step's evidence
rests on.** The red-test ledger's scanner cannot see a multi-line `test.each(...)`; its regex
ends the argument list at the first newline. **37 ⚠ marks across steps 2–8 are invisible to it,
21 of them in step 7** (scrypt, the cookie, the limiter, the gate). That is not a claim that 37
tests are inert — it is a claim that nobody knows, because the thing built to answer it could not
see them. Step 9's harness has the corrected scanner: paren-balanced, string-aware **and**
comment-aware. Back-port it, re-run all seven, expect failures.

Then **Q2** (§6.2 now requires a hover layer and table view; the primitives have neither, because
the build ran before the spec was amended), then **step 10**.

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

- **Backend, still open:** **D8** `STANDING` env plumbing → step 11, verified step 12 · the
  **red-test ledger retrofit for step 3's harness**, which still has none — **folded into Q1**.
- **Closed 2026-09-07:** ~~O19~~ (GB→GiB, a §4 wire change), ~~D4~~ `errorsForPanel`,
  ~~D5~~ `traceFor`, ~~D7~~ (S11/G5, S19, S30), ~~the six unbacked `severity.ts` marks~~.
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
  Seven orphaned shells were found this way.
