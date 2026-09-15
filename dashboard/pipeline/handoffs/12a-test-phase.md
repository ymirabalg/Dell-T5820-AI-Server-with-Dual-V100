# Handoff — 12a, TEST phase

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12a-build.md` (**your primary subject**), `handoffs/12a-visible-failure.md`,
**`SPEC.md` §6.2's ⚠⚠ 2026-09-14 ruling** and §9's aggregate, `INSTALL-SPEC.md` §11.4,
`HANDOVER.md` §0.14, §5, §8, `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. **12a's build is already COMMITTED** (it was
swept into `ebc60c6` by the parent and repaired in `7275e12` — see §1). Tree clean at `218d2ed`.

## 1. ⚠ Verified by the parent, including one thing that went wrong

- `pnpm verify` exit 0, **106 files, 3447 tests**; `shellcheck dashboard.sh` clean.
- ⚠ **The parent committed this tree while a harness was running**, capturing
  `gpu-panel.tsx` with mutation `10e-GP8` applied. Repaired in `7275e12`, verified both directions.
  **Look for a second instance**: the same `git add -A` may have caught another file mid-mutation
  in a way that is green by luck. Diff every file in `ebc60c6`'s stat against what the build notes
  say it should contain.
- The build's other claims — step 10 at 312 mutations, step 11 at 189, the 257.3 px header
  measurement — are its own.

## 2. ⚠ Priorities

1. **The browser measurement harness has been unrunnable since 11b** (2026-09-11): both scripts log
   in with env-var credentials, and the secrets moved out of the environment, so they get a 401.
   The build measured the one at-risk property by hand instead. **Confirm the breakage, fix it if
   it is small** (the credential path is the only thing that changed), and if you fix it, **run the
   measurements** — nothing has measured this page in four days.
2. **`aggregateStatus` gained a fourth input.** Fixture every combination: zero failing sources
   through all eighteen; each severity band crossed with a failing source; the `paused` and
   `stale` forms. Does `N sources unread` count **distinct sources** as claimed, not entries? What
   does it say at exactly one?
3. **The dot moves with the text** — the build calls this `12a-Q2` and says §6.2 rules the words
   and is silent on the paint. Check the claim of silence is true before accepting the choice.
4. **`check_container_gpu_access` takes its verdict from a marker the inner shell prints.** Try to
   make it pass when it should not: docker absent, container absent, container present but stopped,
   `docker exec` succeeding with the marker absent, the marker appearing in *stderr* rather than
   stdout, a partial write. Seven guard rows exist; find the eighth.
5. **The restart-after-reload guard has three arms** (not installed, installed-but-inactive, failed
   restart). Fixture each, and check the inactive arm cannot be reached in a state where leaving it
   alone is wrong.
6. **Five mutations were re-aimed and four inert ⚠ tests were found.** Read each re-aim against the
   property it names; for the four inert ones, confirm the fix was to the fixture rather than to
   the assertion — a test made to pass is not a test made to work.
7. Test names against bodies in the new files (`collector-visibility.test.tsx` is 285 lines and
   entirely new); the `toContain` shape; entropy or clocks; ⚠ names with a matchable prefix ≥12.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify && shellcheck dashboard.sh
python3 pipeline/steps/10-panels-assembly/regressions.py
python3 pipeline/steps/11-packaging/regressions.py
```

- ⚠ **Never `git checkout --` while this item is uncommitted**; never two harnesses at once and
  never kill one; never poll with `pgrep`; never `pnpm verify` beside a harness; ⚠ **never
  `git add` or commit at all** — the parent commits, and doing it beside a harness is what caused §1.
- **Fixing IS in scope. Do not edit `SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md`.** Do not deploy.
  The box is live. Do not weaken a guard.

## 4. Deliverable

`steps/12-deploy/12a-test.md`, leading with §2 in order; short summary; end with `pnpm verify`,
`shellcheck`, both harness results, and `git status`. The parent will not read your transcript.
