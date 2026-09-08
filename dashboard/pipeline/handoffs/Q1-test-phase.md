# Handoff — Q1, TEST phase

**Written by the parent, 2026-09-07,** after the build phase closed. You are a fresh agent with
no memory of this project. Read this file, then `pipeline/steps/Q1-ledger-scanner/build.md`
(the build phase's own notes — your primary subject), then `pipeline/ANCHOR.md` §4, §5 and §8,
then `pipeline/PLAN.md`.

Branch `dashboard-frontend`, working directory `dashboard/`. **The tree is intentionally dirty**
— the build phase does not commit. 12 modified files plus two untracked directories.

---

## 1. What Q1 was, and what the build phase did

Every step's `regressions.py` runs a **red-test ledger**: apply each mutation, record which test
names vitest reports `FAIL`, union them, and fail if a test whose name carries `⚠` never
reddened. The scanner finding those ⚠ names had a regex whose `.each(…)` matcher was `[^\n]*`,
so it **stopped at the first newline** — a ⚠ name on a multi-line `test.each([...])(...)` was
invisible, uncounted, and never required to redden. Step 9 wrote a corrected scanner; steps 2–8
still carried the broken one.

The build phase back-ported the corrected scanner into all seven, re-ran all seven, and
adjudicated the fallout. Its results, from `build.md`:

- **37 previously-invisible ⚠ marks** surfaced, matching the prediction in `WORK-ITEMS.md`
  §10.1 step-for-step.
- **35 were already backed incidentally** by existing mutations — no action.
- **Step 7 (auth) was the real find**: 5 genuinely unbacked marks. Three got new mutations
  (`S11` scrypt, `K8` cookie, `W19` login-view); one was backed incidentally by `K8`; **one had
  its ⚠ dropped** as having no plausible single wrong implementation.
- Four "unmatchably short" `test.each` names were fixed by moving the `%s` placeholder later.

## 2. What the parent has ALREADY VERIFIED — do not spend effort re-deriving

| Fact | How, 2026-09-07 |
|---|---|
| `pnpm verify` exits **0**, 67 files, 2210 tests, no type errors | run by the parent on the handover tree, no harness running |
| The ported scanner block is **byte-identical across all eight** steps 2–9 | md5 of the `CALL`…`red_test_lines` span: `644e2f98…` in every one |
| The dropped ⚠'s backstop is real | `session.test.ts`'s `E2` test mints a genuinely HMAC-signed non-JSON payload, carries its own ⚠, and step 7's mutation `E2` ("the outer catch is removed") backs it. So the never-throw guarantee is still mutation-backed |
| Step 7's harness passes on a re-run | re-run by the parent, independently of the build agent |

## 3. Your job

Per ANCHOR §8, the test phase **reads every test name against its body, checks fixture symmetry,
and hunts equivalent and probabilistic mutations.** Applied to this item, in priority order:

### 3.1 The three new mutations are the highest-risk artefact here

`S11`, `K8` and `W19` were written *to make a ledger go green*. That is the exact circumstance
in which a bad mutation gets written, and this project's own rules name the two failure modes:

- **An equivalent mutation** — one that does not actually change behaviour, so the "test went
  red" is coming from somewhere else, or the mutation is theatre.
- **A probabilistic mutation** — one that reddens a test only sometimes. `PLAN.md` is explicit
  that this is **worse than no mutation at all**, because the ledger cannot tell it from a sound
  one. This project has already shipped a 1-in-16 flake.

For each of the three: read the mutation, read the test it is claimed to redden, and satisfy
yourself that (a) it is a **wrong implementation somebody would plausibly write** — not an
arbitrary corruption, (b) it reddens **deterministically**, and (c) the test that reddens is the
one whose name claims the property. Re-run step 7's harness if you need the evidence; it is 128
mutations, so run it in the background and do not run anything else against the tree while it
goes.

⚠ **`K8` is claimed to back two marks at once**, in `cookie.test.ts` and `session.test.ts`. A
single mutation covering two ⚠ marks is legitimate but is worth checking specifically: confirm
both tests genuinely redden under it, rather than one reddening and the other being matched by
the ledger's **prefix** match. The ledger matches a name's prefix up to the first `%`, so two
tests with similar leading text can be conflated — that is a defect class this scanner work
should be alert to, not one it is immune from.

### 3.2 The four renamed test names

Moving a `%s` placeholder changes the string the ledger matches on. For each of the four
(`collect.test.ts`, `safety.test.ts`, `config.test.ts`, `wire.test.ts`): does the new name still
**describe what the body asserts**? "A test that names a property it does not check has appeared
in every single step" — a rename is a chance to introduce exactly that, and the rename was made
for the scanner's benefit, not the reader's.

### 3.3 The dropped ⚠

The parent has verified the backstop exists (§2). What is **not** verified is the wider claim
that all eleven fixtures in that block are rejected by a total check before `JSON.parse` is
reachable. Trace it yourself against `session.ts` and `base64url.ts`. If even one fixture can
reach the fallible path by a single plausible defect, the mark should come back.

### 3.4 The scanner itself

It is now the mechanism all eight steps depend on. Read `_skip_balanced` adversarially: template
literals with `${…}` interpolation containing parens or quotes, a regex literal containing an
unmatched paren or quote character, a `//` sequence inside a string (a URL), nested block
comments. **Find cases where it mis-parses**, and say whether any such case actually occurs in
the eight steps' `LEDGER_FILES` today — a theoretical hole in a scanner that no fixture triggers
is a finding worth recording but not worth a fix that risks the ones that do work.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0. Never a printed summary.
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ **Never run `pnpm verify` concurrently with a harness, and never two harnesses at once.**
  They mutate the same working tree. Serially, always.
- ⚠ **Never sleep-poll with `pgrep -f regressions.py`** — it matches your own shell. Use
  `pgrep -f "regressions[.]py"`.
- After any harness, `git status` / `git diff --stat` for a stranded mutation in `lib/`;
  `git checkout --` it. A stranded mutation makes a later `pnpm verify` lie.
- **Do not commit. Do not edit `SPEC.md`.** Nothing outside `dashboard/` changes.
- Invariant 7: **if the spec is silent, STOP and record it.** Do not invent.

## 5. Deliverable

`pipeline/steps/Q1-ledger-scanner/test.md` — findings with concrete detail, each marked with
what you actually ran. **Fixing is in scope for this phase** (unlike adversarial, which fixes
nothing), but say what you changed and why. If you find nothing wrong with the three mutations,
say so plainly and show the evidence — a clean result stated with its evidence is worth more
than a manufactured finding.

End with the final `pnpm verify` result and `git status`. Report back a short summary; the
parent will not read your transcript.
