# Handoff — 11b BUILD: the three rulings after step 11. **Secrets off the environment; `Restart=always`; container-vs-unit drift.**

**Written by the parent, 2026-09-11.** Fresh agent, no memory of this project. Read: this file →
**`SPEC.md` §5.1's ⚠⚠ 2026-09-11 ruling** (the secrets), §2.5's `--env-file` row, §5 (auth) →
**`pipeline/INSTALL-SPEC.md` §11.2** (all three rulings) and §7, §9 → `pipeline/HANDOVER.md` §0.0,
§0.13, §1, §8 → `steps/11-packaging/reconciliation.md` §1–§2 →
`lib/auth/config.ts` **in full** (its header states the rule this ruling deliberately changes) →
`lib/auth/authorize.ts`, `lib/auth/handler.ts` (the composition root) → `ANCHOR.md` §4/§5/§8/§9 →
`PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `dc4aad1`.
⚠ **The parent's demo server is on :39174/:39175 — do not kill it, do not start a second
`next dev`.** Docker is **not installed** on this Mac; label every container claim
*reasoned, not run*.

## 1. Verified by the parent

`pnpm verify` exit 0, **102 files, 3121 tests**; `shellcheck dashboard.sh` exit 0; step 11's
harness 130 mutations, exit 0. The parent re-ran the reconcile's headline sweep by hand: removing
`check_one_process` from `cmd_check` now fails two tests where it used to pass.

## 2. 11-Q2 — the secrets leave the environment (the big one)

**Today** `--env-file` copies `PASSWORD_HASH` and `SESSION_SECRET` into the container's
environment, where `docker inspect` and `/proc/1/environ` expose them to anything that can reach
the Docker socket. `readAuthConfig(env)` reads `process.env` and the module header says *"a third
parser is not written"*.

**Build:** mount `/etc/ai-dashboard.env` **read-only** into the container; the server reads both
secrets from it **at startup**; neither appears in the environment. `STANDING` **stays** an
environment variable — configuration, not a secret.

Non-negotiable, each needing a test:

1. ⚠ **The new reader must be STRICTER than Docker's grammar, never looser.** Docker splits on the
   first `=`, keeps quotes, expands nothing. Ours **refuses** — loudly, at startup, naming the key
   and the reason — a quoted value, a value with leading/trailing whitespace, a multi-line value,
   a `$`, a backtick, a CRLF line ending, a BOM. That is the point of the ruling: **O21 stops being
   a silent failure and becomes a startup refusal.** The "stricter, never looser" property has been
   falsified twice by measurement in this project (the `awk -v` escape, the twelve Unicode spaces)
   — **fixture the comparison against Docker's own rules, both directions.**
2. **`readAuthConfig`'s signature and its `Environment` seam should survive** if that is the honest
   design — the file-backed source is a different `Environment`, built once at the composition
   root. If you conclude otherwise, say why. ⚠ **Read at startup, once**: §4 already says a
   `STANDING` change needs a restart, and a secret re-read per request is a new failure mode.
3. **Nothing may log, print or error-message either secret** — §5 logs nothing about
   authentication, and a refusal message names the **key and the reason, never the value**.
4. **`check` must verify the secrets are ABSENT from `docker inspect`'s `Env`** — the ruling is
   worthless if a later edit puts them back and nothing notices.
5. **O20's cross-check and O21's `configure` writer both move with it.** `configure` still writes
   the file; what changes is who parses it. Keep `dashboard.sh` and the TypeScript equal, and keep
   the call-site assertions the reconcile just built — ⚠ **a cross-check is only worth the call
   site it is wired into** (HANDOVER §0.13).

## 3. 11-Q1 — `Restart=always`

One line in the unit, plus the reasoning in its comment: a `docker stop` exits 0, so `on-failure`
left the monitor down until a human noticed. `systemctl stop` stays the deliberate way down.
⚠ Check it cannot fight `ExecStopPost`/`ExecStartPre=-docker rm -f` into a restart loop, and that
`StartLimitIntervalSec`/`Burst` in `[Unit]` still bound it.

## 4. 11-Q3 — container-vs-unit drift

`check` already reads `.HostConfig.DeviceRequests` for the GPU mode. Extend to the **whole flag
set**: mounts (source, target, read-only), published ports, name, restart policy, network mode,
and the env keys present. Report drift per flag, not as one boolean. ⚠ **Derive the expectation
from the unit file itself** rather than retyping the flags — two producers of one list is the
shape this project has been bitten by repeatedly.

## 5. Acceptance

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify            # exit 0
shellcheck dashboard.sh                # clean
python3 pipeline/steps/11-packaging/regressions.py
# plus every other harness whose LEDGER_FILES you touch — lib/auth/ is step 07's
```

- ⚠ **`lib/auth/` belongs to step 07's harness.** Touching it means running that one too, and any
  ⚠ mark you add there carries a `11b-` id with a matchable prefix ≥12 chars.
- The refusal paths need fixtures on **both** sides (a good file starts; each bad shape refuses).
- If anything cannot be done as ruled, **record it; do not improvise** (invariant 7).

## 6. Rules

- **Do not commit. Do not edit `SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md`** — record disagreements.
- ⚠ **Never `git checkout --` while this item is uncommitted.** Never `pnpm verify` alongside a
  harness; ⚠ never poll with `pgrep`. No `.env`; **never print a secret**; `next-env.d.ts`
  byte-identical. Do not weaken a guard.

## 7. Deliverable

`pipeline/steps/11-packaging/11b-build.md`: the reader and exactly how it is stricter than Docker's
(a table, both directions); where the file is read and why once; what `check` asserts about `Env`;
the unit change and its restart-loop reasoning; the drift comparison and where its expectation is
derived from; harness totals; every spec silence. Short summary back. The parent will not read your
transcript.
