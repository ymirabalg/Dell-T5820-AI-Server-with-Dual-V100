# Handoff — BUILD `serving-mode.sh`: switch the box between split and per-GPU serving

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read: this file →
**`SERVING-MODES.md` in the repo root — it is the specification and it is authoritative** →
the repo-root **`CLAUDE.md`** (the box, its history, the script conventions, the systemd traps) →
`serve-llm.sh` **in full** (you are writing its sibling and must not duplicate it) →
`gpu-fan-control.sh` (for the conventions, and for the SIGTERM lesson in its `run` cleanup).

Working dir: the **repo root**, not `dashboard/`. Branch `dashboard-frontend`. Tree clean at
`7275e12`.

⚠ **Do NOT touch anything under `dashboard/`.** A separate loop (12a) owns that tree and its
phases are still to run. ⚠ **Do not run `pnpm verify` or any `regressions.py`** — they belong to
that loop, and the parent has already corrupted one commit this week by acting beside a running
harness. Your suite is `shellcheck` and `--dry-run`.

## 1. What exists, verified by the parent

- **The model is on the box and measured**: `~/models/gemma-4-31B-it-Q8_0.gguf`, 32.64 GB, GGUF
  magic verified. 60 layers (10 global, 50 sliding-window), native context **262144**, global KV
  **80 KiB/token**, SWA KV a fixed 0.78 GiB. `SERVING-MODES.md` §6 has the footprint table; the
  full 262K window is 51.2 GiB of the 64 GiB across both cards.
- **The per-GPU arrangement to restore** is `SERVING-MODES.md` §8, verified on the box.
- **The unit template** hardcodes `CUDA_VISIBLE_DEVICES=%i` and a literal `--split-mode none`, and
  `instances()` derives the instance count from the GPU count. That is why split needs its own
  unit (§2 of the spec).

## 2. Build exactly what §2, §3 and §9 of the spec describe

`serving-mode.sh` in the repo root, with `split`, `per-gpu` and `status`, plus the
`llama-split.service` unit it installs. **The spec is the contract; follow it to the dot** and
record anything you cannot do rather than improvising (invariant 7).

⚠ **The five things most likely to be got wrong, all already written in the spec:**

1. **`Conflicts=` in BOTH directions**, and `enable`/`disable` rather than `start`/`stop` — a mode
   that does not survive a reboot is the failure this box has already had, silently.
2. **Wait for VRAM to actually free** before starting the other mode; do not assume a stopped unit
   has released its cards. Poll, with a timeout that fails loudly.
3. **Roll back on a failed `/health`**, exactly as `serve-llm.sh set-model` does — read that code
   and reuse its shape. A switch that fails must leave the box serving, not dark.
4. **A preflight check that cannot be evaluated is `unknown` and refuses — never a tick.** This
   project has shipped the opposite four times; the most recent cost a day.
5. ⚠ **Print the dashboard caveat** (spec §4): in split mode the card-to-instance join has no
   answer and GPU 1 misreports. Until the owner rules, the script says so on every switch into
   split. Do not "fix" it by inventing a rendering.

**Also decide, with the reasoning recorded** (spec §7 items 4 and 5): whether the split unit passes
`--cache-reuse` (it is architecturally dead on the hybrid Qwen; Gemma 4 is sliding-window, which is
**not** the same thing — check the load log rather than assuming either way) and what `--cache-ram`
should be for one process instead of two.

## 3. What you may and may not do to the box

- **You MAY read**: `ssh ai-server` for `systemctl show`, `nvidia-smi`, file listings, unit text.
- ⚠ **You MAY NOT write.** No `sudo`, no installs, no unit changes, no service restarts. It is
  **serving live inference and a live dashboard**, and `sudo` needs a password you do not have.
  The parent and the owner run the switch.
- ⚠ **Nothing you write may run a `daemon-reload` without restarting `ai-dashboard`** — a reload
  revokes the running container's GPU access on this box (cgroup v2; `INSTALL-SPEC.md` §11.4). The
  sibling scripts already do this; match them.

## 4. Acceptance

- `shellcheck` clean. `--dry-run` on every subcommand prints its intent and writes nothing, and its
  printed intent **matches what a real run would execute** — a dry run that prints a different
  command than it would run is worse than none (this was a real finding in step 11).
- The script refuses, with a named reason, from every state it cannot safely act on: both modes
  enabled, neither enabled, a model file missing, a card busy, no API key, no ufw rule.
- `status` reports **disagreement between enabled and running**, which is the state a naive check
  misses.
- Spec §9's acceptance list is what the owner will run on the box; make each item checkable and say
  in your notes which ones only a real run can settle.

## 5. Deliverable

`dashboard/pipeline/steps/12-deploy/serving-mode-build.md` (the pipeline dir is fine for notes;
the **script** goes in the repo root): what each subcommand does, the unit text and why each
directive is there, the rollback path, the two decisions from §2 with reasoning, every refusal and
its trigger, what `--dry-run` prints, and every spec silence. Short summary back. The parent will
not read your transcript.
