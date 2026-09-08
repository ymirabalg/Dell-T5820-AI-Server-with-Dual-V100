# Handoff — Q1, ADVERSARIAL phase

**Written by the parent, 2026-09-07,** after build and test closed. You are a fresh agent with no
memory of this project. Read this file, then `pipeline/steps/Q1-ledger-scanner/build.md` and
`test.md`, then `pipeline/ANCHOR.md` §4/§5/§8 and `pipeline/PLAN.md`.

Branch `dashboard-frontend`, working directory `dashboard/`. The tree is intentionally dirty.

## ⚠ You fix NOTHING

This phase writes findings and changes no code. That separation is deliberate and this project
enforces it: the reconcile phase adjudicates each of your findings ACCEPTED / REJECTED /
DEFERRED with reasons. A finding you fix yourself is a finding nobody adjudicates.

Every finding needs a **concrete failure scenario** — the input, the state, and the wrong output
or missed detection. "This could be fragile" is not a finding. "A ⚠ mark written as
`` test(`⚠ …${x}`) `` is never checked by the ledger and nothing warns" is.

---

## 1. What Q1 did

Steps 2–8's `regressions.py` each run a **red-test ledger**: apply every mutation, record which
tests vitest reports `FAIL`, and fail the run if a `⚠`-marked test never reddened. The scanner
that finds ⚠ names used a regex whose `.each(…)` matcher was `[^\n]*` — it stopped at the first
newline, so a ⚠ name on a **multi-line `test.each([...])(...)`** was invisible: uncounted, and
never required to redden. **The ledger was silently reporting success over a set smaller than the
real one.** Step 9 had a corrected scanner; steps 2–8 did not.

Build back-ported the corrected scanner (paren-balanced, string-aware, comment-aware) into all
seven, re-ran them, and adjudicated: **37 marks surfaced**, 35 already backed incidentally, **5
genuinely unbacked in step 7 (auth)** → three new mutations (`S11` scrypt, `K8` cookie, `W19`
login-view), one backed incidentally by `K8`, one ⚠ dropped as having no plausible single wrong
implementation. Four `test.each` names were reworded to move a `%s` later so a ≥12-char prefix
survives.

## 2. Verified by the parent and by the test phase — attack these only with EVIDENCE

Not off-limits. But they have been checked, so overturning one needs a demonstration, not a doubt.

| Fact | Evidence |
|---|---|
| `pnpm verify` exit **0**, 67 files, 2210 tests, no type errors | run by the parent, twice, on a tree with no harness running |
| Scanner block **byte-identical across steps 2–9** | md5 `644e2f98…` of the `CALL`…`red_test_lines` span in all eight |
| Step 7's ledger genuinely passes | **parent's own re-run**: 128 mutations all bit, 128 ⚠ marks checked, every one reddened, exit 0 |
| `S11`, `K8`, `W19` are real, deterministic, plausible | test phase applied each by hand, ran the affected files, reverted. `K8` produced **two independent stack traces** — through `readCookie`, and through `verifiedSessionOf → readCookie` — so its two-mark claim is real reddening, not a prefix-match artefact |
| The dropped ⚠ is safe to drop | its 11 fixtures each fail ≥2 independent total guards before `JSON.parse` is reachable; the outer catch's real job is covered by the `E2` test (a validly HMAC-signed non-JSON payload), itself ⚠-marked and backed by mutation `E2` |

## 3. Where I think the value is — but hunt wherever you like

### 3.1 ⚠ The scanner's remaining blind spot, which I believe is under-rated

The test phase found that `FIRST_STRING` matches only `'` and `"`. A test whose name is a
**backtick template literal** is invisible to `marked_tests()` entirely. Five such tests exist
today; none currently carries a `⚠`, so nothing is broken right now, and the test phase left it
alone as an untriggered theoretical hole — which was the guidance I gave it.

**I now think that guidance was wrong for this specific case, and I want you to test my
reasoning rather than agree with it.** The argument: the scanner already *warns* when a name's
prefix is too short to match (`⚠ test name is unmatchably short`). It is **silent** for a
backtick name. So the failure mode is not "a hole exists" — it is "a hole exists that reproduces
Q1's exact defect class, silently, in the very mechanism Q1 was fixing." Someone writing
`` test(`⚠ …`) `` next month gets a ⚠ that is never checked and no diagnostic at all.

Assess honestly, and disagreeing with me is a fine outcome:
- Is that failure actually reachable in this codebase's conventions, or do the ⚠ marks live
  exclusively in quoted names by habit strong enough to rely on?
- Is the cheap fix a **pure diagnostic** — warn when a `test`/`it` call's first argument is a
  backtick containing `⚠` — rather than trying to *parse* template literals, which reintroduces
  interpolation-parsing risk into eight steps' harnesses at once?
- Is there a reason a warning is worse than nothing here?

### 3.2 The ledger's prefix matching

`uncovered` is computed by `prefix not in joined`, a **substring test over concatenated vitest
output**, where `prefix` is the name up to the first `%`. Two distinct ⚠ tests whose names share
a leading substring can therefore be conflated: one reddens, both are counted covered. The test
phase checked this for `K8` specifically and cleared it. **Nobody has checked it globally.**
Across all eight steps' `LEDGER_FILES`, is any ⚠ prefix a substring of another ⚠ name? That is a
mechanical question with a definite answer, and it is the same species of silent under-checking
as Q1 itself.

### 3.3 The three new mutations, from the other side

The test phase confirmed each reddens deterministically. The question it did **not** ask: does
each redden the test whose *name claims that property*, or merely some test? A mutation that
reddens the right file for the wrong reason satisfies the ledger and teaches nothing. Also worth
asking whether any is subsumed by an existing mutation — a redundant mutation costs runtime on
every future run of a 128-mutation harness.

### 3.4 The comment-awareness, adversarially

`_skip_balanced` handles `//`, `/* */`, and quotes. Consider: a `//` inside a string (a URL) —
does it wrongly start a comment? A quote inside a `//` comment — handled, that was the original
bug. A regex literal containing an unmatched `)` or a lone quote. Template-literal `${…}`
containing parens or quotes. **For each hole, say whether it occurs in the eight steps'
`LEDGER_FILES` today** — that distinction decides whether it is a bug or a note.

### 3.5 Free hunting

The above is where I would look. You are not limited to it, and a finding I did not anticipate is
worth more than a confirmation of one I did.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0, never a printed summary
```

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never run `pnpm verify` alongside a harness; never two harnesses at once. Serially.
- ⚠ Never sleep-poll `pgrep -f regressions.py` — it matches your own shell. Use
  `pgrep -f "regressions[.]py"`.
- **You may run harnesses and experiments read-only**; if an experiment mutates a source file,
  revert it (`git checkout --`) and confirm with `git status`. **Leave the tree exactly as you
  found it** — that is how the reconcile phase knows what build and test actually left behind.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`.** Invariant 7: if the spec is silent,
  record it.

## 5. Deliverable

`pipeline/steps/Q1-ledger-scanner/adversarial.md`. Findings numbered for adjudication, each with
a concrete failure scenario and what you actually ran. Include a section on **what you attacked
and could NOT break** — that section has been load-bearing in every step of this project, because
it tells the reconcile phase where not to spend its budget.

Report back a short summary. The parent will not read your transcript.
