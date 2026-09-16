# Handoff — `serving-mode.sh`, TEST phase

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read: this file →
`dashboard/pipeline/steps/12-deploy/serving-mode-build.md` (**your primary subject**) →
**`SERVING-MODES.md`** (the specification it was built to) → `dashboard/pipeline/handoffs/serving-mode-build.md`
→ the repo-root **`CLAUDE.md`** (the box's history, the script conventions, the systemd traps, and
the loop rule) → `serve-llm.sh` and `gpu-fan-control.sh` (its siblings).

Working dir: the **repo root**. Branch `dashboard-frontend`, tree **clean** at `b69f81b`.

⚠ **The box is LIVE** — inference on 8080/8081, the dashboard on 8090. **Read it; write nothing.**
`sudo` needs a password you do not have, which is the only reason this is safe.
⚠ **Do not touch `dashboard/`** except to write your notes. ⚠ **Do not run `pnpm verify` or any
`regressions.py`** — they are that tree's, and acting beside a harness corrupted a commit this week.
Your suite is `shellcheck`, `bash -n`, `--dry-run`, and harnesses of your own under the scratchpad.

## 1. Verified by the parent

`shellcheck serving-mode.sh` clean, `bash -n` clean, and the unit's ordering is one-way as the
build claims. `4a2f47a` committed it **build-phase only**, explicitly untested. The box is
untouched: no `llama-split.service`, no drop-in, no `split.env`, all three services active.

## 2. ⚠ Priorities

1. **A `--dry-run` THAT IS NOT DRY.** 12a found exactly this in the sibling script:
   `serve-llm.sh uninstall --dry-run` genuinely restarted the live dashboard, because one line did
   not go through the printing helper. **Audit every side-effecting call in this script the same
   way** — `systemctl`, `install`, `mv`, `tee`, `rm`, `docker`, any redirection that writes a file.
   Prove it by running every subcommand with `--dry-run` under a harness that makes each of those
   commands **fail loudly if invoked for real**, and confirm the printed intent matches what a real
   run would execute. A dry run that prints a different command than it would run is worse than none.
2. **The three rollback paths**, exercised rather than reasoned: a failed `/health`, a VRAM timeout,
   and a signal mid-switch. Does each leave the box in the mode it started in, with both units'
   enablement restored? ⚠ **The trap must not read a `local`** — an EXIT handler runs after the
   frame is gone and `set -u` kills it, a bug this repo has already had twice.
3. **The eleven refusals.** Fixture each, and find the twelfth. Especially: the `ufw status` parser
   is **unverified** (its output shape needs root), and the build says so — construct its real
   output from `man ufw`/the box's rule set and test the parser against it, including the
   destination-qualified form that already fooled a matcher in step 11.
4. **`detect_mode` and `status`.** The build says `systemctl is-enabled` prints `disabled` *and*
   exits non-zero and that this broke every comparison. Check every other place a command's
   **output and exit status** are both consumed. Does `status` really report enabled-vs-running
   disagreement in all four combinations?
5. **The two flag decisions.** `--cache-reuse` omitted and `--cache-ram 24576`, both justified from
   llama.cpp source on the box. **Re-derive them from that source yourself** — the build read
   `llama_kv_cache_iswa::get_can_shift()` and `server_prompt_cache::alloc()`. If either reading is
   wrong the decision flips, and this project has had a hand-transcribed model of upstream be
   wrong twice in one week.
6. **Idempotence.** `split` twice, `per-gpu` twice, and `split` while already split. The build
   claims it; prove it, including that the second run does not re-write the env file with a
   different value or leave a stale backup.
7. **What it writes to the box, read against `SERVING-MODES.md` §8.** The `per-gpu` restore must
   reproduce that table exactly — model, alias, **ctx 163840**, FA, SPEC, both ports.

## 3. Rules

```bash
shellcheck serving-mode.sh && bash -n serving-mode.sh
./serving-mode.sh --help; ./serving-mode.sh status          # read-only, safe
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Scratch harnesses under
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`.
- **Fixing IS in scope.** Do not edit `SERVING-MODES.md` (record disagreements). Do not deploy.

## 4. Deliverable

`dashboard/pipeline/steps/12-deploy/serving-mode-test.md`, leading with §2 in order; short summary;
end with `shellcheck`, your harness totals, and `git status`. The parent will not read your transcript.
