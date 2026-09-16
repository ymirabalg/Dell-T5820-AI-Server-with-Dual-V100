# Handoff — `serving-mode.sh`, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read: this file →
`dashboard/pipeline/steps/12-deploy/serving-mode-test.md` and `…/serving-mode-build.md` (**your
subjects**) → **`SERVING-MODES.md`** (the spec; ⚠ §6's SWA figure was **corrected by the parent
today** after the test phase found it 50 % low) → the repo-root **`CLAUDE.md`** → `serve-llm.sh`,
`gpu-fan-control.sh`.

Working dir: the **repo root**. Tree dirty: the test phase's fixes to `serving-mode.sh`, on `b69f81b`.

⚠ **The box is LIVE.** Read it; **write nothing**. ⚠ **Do not touch `dashboard/`** except your
notes. ⚠ **Do not run `pnpm verify` or any `regressions.py`.**

## 1. Verified by the parent

`shellcheck` clean (and `-S style`), `bash -n` clean, the `Status: inactive` and `not-found` arms
present in the source, and the box untouched — three services active, no split unit.

## 2. ⚠ Where to aim

**The test phase's own best find is your template**: it did not trust the build's model of `ufw
status`, derived fixtures from the real output shapes, and **9 of 18 failed — two false ticks and,
worst, a false statement.** Do that to everything the script models but cannot see.

1. **`nvidia-smi`'s output, modelled.** The VRAM poll parses it. What does it print when: a card is
   in a bad state (`ERR!`), the driver is mid-reload, MIG is on, a process is a *zombie*, the query
   returns `[N/A]`, or there are more cards than expected? ⚠ **`[N/A]` and `[Unknown Error]` are
   real `nvidia-smi` outputs this project has already had to handle elsewhere** — does the poll
   treat an unparseable number as **zero free VRAM** (safe) or as **all free** (a false go)?
2. **`systemctl show`'s output, modelled.** `--value` on a property that does not exist prints an
   empty line and exits 0. Where is an empty answer taken as a real one? The test phase fixed
   `is-enabled`'s `not-found`; find the rest — `ActiveState`, `UnitFileState`, `LoadState`,
   `SubState`, and a unit that is `masked`, `static`, `linked` or `alias`.
3. **`curl`'s `/health`**, which decides rollback. What if it answers 200 with a body that is not
   what the caller thinks, answers 000, hangs past the timeout, is answered by the **old**
   process still shutting down, or is answered on 8080 by an instance of the **other** mode?
4. **The rollback, adversarially.** Interrupt at each of its own steps, not just once: after the
   disable but before the VRAM drains; after `split.env` is written; after `enable` but before
   `/health`; during the rollback itself. Does a **second** failure during rollback leave the box
   dark, and does it say so?
5. **The switch under a concurrent actor**: a `serve-llm.sh set-model` running, a reboot mid-switch,
   the dashboard's `check` restarting the container, two `serving-mode.sh` invocations at once.
   ⚠ There is no lock — decide whether that is a finding.
6. **One-line reverts of the test phase's 11 fixes.** Four loops running this has found 6, 3, 8,
   49 and 11. The dry-run fidelity harness, the ufw arms and the argument parsing are prime.
7. **Read it against `SERVING-MODES.md` clause by clause** and report anything the script does that
   the spec does not license, or the spec requires that the script omits. ⚠ The spec is not
   presumed right: the parent has already had to correct §6 today.

## 3. Rules

- **Fix nothing.** Findings `sm-A1…`, most severe first, each with a scenario, severity, file:line,
  and how proven ("measured" / "reasoned, not run"). Scratch work under
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git add`, commit, or `git checkout --`.** No writes to the box, no `sudo`, no deploy.
  Do not edit `SERVING-MODES.md`.

## 4. Deliverable

`dashboard/pipeline/steps/12-deploy/serving-mode-adversarial.md`: findings first; then what held;
then what you could not verify and why. Short summary back. The parent will not read your transcript.
