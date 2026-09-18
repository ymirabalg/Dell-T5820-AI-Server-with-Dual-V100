# Handoff — 12c, TEST phase

**Written by the parent, 2026-09-17.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12c-build.md` (**your primary subject**), `handoffs/12c-named-instances.md`,
**`SPEC.md` §3.4's two ⚠⚠ 2026-09-17 rulings, §4, §6.2, §6.4, §9**, `SERVING-MODES.md` §4,
`HANDOVER.md` §0.16, §5, §8, `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 12c's build, on `cb8a3c7`.
⚠ **The box is LIVE** — read it, write nothing, open no D-Bus connection you do not close.

## 1. ⚠ Verified by the parent — including one claim of the build's that does NOT hold

`pnpm verify` exit 0, **109 files, 3743 tests**.

⚠ **The build reports that step 5's harness "printed `ANCHORS MOVED` and exited 0", and calls it a
fail-open in the tooling. The parent read the code: it does not.** `regressions.py:1509` is
`if moved or bad or ambiguous: return 1`, before the ledger. **Establish what actually happened
before acting on it** — the most likely explanation is the exit code was captured through a pipe
(`… | tail` yields *tail's* status), which is the trap this repo's own conventions warn about and
which the parent has fallen into once already this month. **If the harness really can exit 0 with
moved anchors, that is a finding above everything else in this file and it affects all ten. If it
cannot, say so plainly so nobody re-hunts it.**

## 2. ⚠ Priorities

1. **The claim above, settled first**, because everything else's evidence depends on the harnesses.
2. **The unit-name mapping's MISS path**, which is the loop's stated risk. The build says a miss is
   loud four ways — the unit is not asked about, a `dbus` entry names it, `unitState`/`gpus` are
   `null`, and **no `unit:` condition is minted**. Fixture every one, and find the fifth thing a
   miss could do that nobody listed. ⚠ **Assert on the units REQUESTED**, not on the answer: a
   guessed name returns an ordinary `inactive`, which is why this defect is silent by nature.
3. **The ordering rule.** "Numbered by value, then named by code point" must make the result a
   function of the **set**. The build asserts the same rows in two orders render identically —
   **extend it**: three instances, a numeric and a named claimant of the same card, ids that sort
   differently as strings than as numbers (`2` vs `10`), and an id that is numeric-looking but not
   canonical. ⚠ **Prove `servedBy` no longer depends on array position at all**, rather than that
   two particular orders agree.
4. **Row refusal.** One bad row drops and the rest render; `gpus[]`, `errors[]` and `standing`
   still refuse wholesale. Fixture the boundary in both directions, and confirm a dropped row
   cannot read healthy anywhere — `failingSourceCount`, §9's aggregate, and §6.2's "N of M" counts,
   where **M must not silently shrink**.
5. ⚠ **The number bridge.** `instanceId` accepts a JSON number as the canonical spelling of a
   numeric id, without which the live box loses every row of every poll. **Test it as the
   compatibility shim it is**: `0` vs `"0"` vs `"00"` vs `" 0"` vs `0.0` vs `-0` vs `1e1`. And
   confirm the build's skew claim in both directions — a newer client with an older server, and an
   older client meeting `"split"`.
6. **Five of the build's own mutations were inert**, three of them for this project's recurring
   reason (a fixture whose two candidate answers coincide). **Sweep for the sixth**, and check the
   three were fixed in the *fixture* rather than by weakening the assertion.
7. ⚠ **`measure-breakpoints.mjs` failed its first run on a 401 at its own login and passed on the
   immediate re-run**, unexplained. Nothing under `lib/auth/` was touched. **Reproduce it or bound
   it** — an unexplained flake in the one harness that grades the page is not acceptable evidence,
   and this project has already had a measurement pass vacuously twice.
8. Test names against bodies; the `toContain` shape; entropy or clocks; ⚠ names with a matchable
   prefix ≥12 chars; a guard whose pass condition is "nothing found" judging its own failure.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
# the five harnesses 12c touches — SERIALLY, one at a time, and read the ANCHOR report, not just $?
for s in 03-collectors-gpu-host 05-collectors-serving-storage-safety 06-telemetry-route \
         08-client-runtime 10-panels-assembly; do python3 "pipeline/steps/$s/regressions.py"; done
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness. ⚠ **Never capture a harness's exit
  status through a pipe.**
- **Fixing IS in scope. Do not edit any spec file.** Do not deploy.

## 4. Deliverable

`steps/12-deploy/12c-test.md`, leading with §2 in order; short summary; end with `pnpm verify`, all
five harness results **with their anchor reports**, the measurements, and `git status`.
The parent will not read your transcript.
