# Handoff — Step 11 BUILD: **packaging.** `Dockerfile`, `dashboard.sh`, the systemd unit.

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read, in order:
this file → **`pipeline/INSTALL-SPEC.md` (447 lines — the specification for `dashboard.sh`;
follow it to the dot, and its §12 open questions are for the owner, not for you to answer)** →
`SPEC.md` §2.2, §2.4, §2.5 (runtime contract), §5.1 (env keys), §6.1's ⚠ **browser-defaults
operating requirement** (2026-09-10) → `pipeline/HANDOVER.md` **§4.1 in full** (O20, O21, O22, D8
— the four obligations that fail SILENTLY), §0.12, §1, §8 → `pipeline/FIRST-DEPLOY.md` →
**the repo-root `CLAUDE.md`** (the box, and the systemd traps below) → `ANCHOR.md` §4/§5/§8/§9 →
`PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `3f152b0`, pushed.
⚠ **A demo server of the parent's is running on :39174 (next dev) and :39175 (a proxy)** so the
owner can click through the UI. **Do not kill it**, and do not start a second `next dev` in this
directory — Next 16 refuses one. `next build` is fine (it writes `.next/server`, `.next/standalone`;
dev uses `.next/dev`). If you truly need those ports, say so in your notes and stop, do not kill.

## 1. What exists and what does not

Steps 1–10 are done and committed: the app, the auth gate, the telemetry endpoint, the client
runtime and all nine panels. `pnpm verify` is **exit 0, 101 files, 3061 tests** (parent-run).
**Nothing of step 11 exists** — `dashboard.sh`, `Dockerfile` and `.dockerignore` are all absent.
You are writing them from `INSTALL-SPEC.md`.

## 2. The four silent-failure obligations — HANDOVER §4.1 is the full text, this is the shape

Each one produces a **working-looking system that is wrong**, with nothing in any log:

- **O20 — the hash format.** The server verifies `scrypt.<log2N>.<r>.<p>.<salt>.<key>` and
  `parseScryptHash` returns `null` for anything else, *including a correct argon2id hash*. `null`
  is a clean empty **401 with nothing logged** — a dashboard that will not open and will not say
  why. **`set-password` must use the project's own encoder** (`scripts/hash-password.py`, whose
  output the suite cross-checks against `lib/auth/scrypt.ts`). Do not reimplement it.
- **O21 — Docker's `--env-file` does not strip quotes.** `SESSION_SECRET="…32…"` becomes a
  34-character secret with the quotes baked in: it passes the length floor, works today, and every
  session dies the moment anyone rewrites the file unquoted. `configure` must write unquoted,
  single-line, no surrounding whitespace, no `$`, and **`check` must detect a quoted value**.
- **O22 — one process, one cache.** A second instance means a second telemetry cache, a doubled
  `nvidia-smi` fork rate, **`DELETE /api/session` silently failing** for requests landing on the
  other process, and §5's global rate limit becoming N× looser. Nothing in the suite can see this.
  **Assert one process** (the `docker run` line and the unit must make a second instance
  impossible, and `check` must verify it).
- **D8 — `STANDING`.** Absent or misspelled, §6.4's suppression silently never applies. `configure`
  writes it; `check` reports what the running container actually has.

## 3. ⚠ The systemd traps this repo has already paid for — root `CLAUDE.md` states all three

1. **`StartLimitIntervalSec` / `StartLimitBurst` belong in `[Unit]`, not `[Service]`.** systemd
   moved them in v229 and **ignores them in `[Service]`**. Verify with
   `systemctl show <unit> -p StartLimitIntervalUSec`. This is in PLAN's acceptance for step 11.
2. **systemd does no arithmetic.** `--port ${BASE}%i` concatenates. Compute in bash, pass via
   `EnvironmentFile`.
3. ⚠ **An ordering cycle deletes jobs SILENTLY.** `gpu-fan-control.service` shipped
   `WantedBy=multi-user.target` *and* `After=multi-user.target`; when a later unit ordered itself
   after it, systemd broke the loop by **deleting the llama-server start jobs** — no failed unit,
   no error except one `journalctl` line. **Order after `sysinit.target`**, and step 12 checks
   `journalctl -b | grep "ordering cycle"`. **This class of bug only appears on a real boot.**

## 4. Also yours

- **§6.1's promise is conditioned on browser defaults** (font size, 100 % zoom) — ruled
  2026-09-10 and now an operating requirement. **Put it in the deploy/README notes** the operator
  reads when configuring the wall panel's browser. A 16 px minimum-font-size setting alone puts the
  page 2–3 px over at 1600×1024.
- **`--dry-run` on every subcommand**, printing intended writes rather than making them (repo
  convention; PLAN's acceptance).
- **shellcheck clean** (PLAN's acceptance). Match the repo's script conventions: `set -euo
  pipefail`; `bold`/`info`/`ok`/`warn`/`die`; `usage()` re-reads the header comment via `sed`;
  a `trap … EXIT INT TERM` for anything that changes state; ⚠ **a cleanup registered on `EXIT`
  must not read a `local`** (it fires after the frame is gone and `set -u` kills the handler);
  ⚠ **never `if cmd | grep -q …` under `pipefail`** — capture first, then match.
- ⚠ **`ufw` and port 8090 are STEP 12, not yours.** `firewall` is specified in INSTALL-SPEC §8;
  write it, but **the box has no 8090 rule today and enabling ufw without a port-22 rule has
  already taken this machine off the network once** (root `CLAUDE.md`). Nothing you write runs
  against the box in this step.
- **The box is read-only to this work and you do not need it.**

## 5. Acceptance

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard
pnpm verify                      # still exit 0 — packaging must not touch app behaviour
shellcheck dashboard.sh          # clean
./dashboard.sh --dry-run …       # every subcommand prints intent and writes nothing
```

- `pnpm build` succeeds and `.next/standalone` is what the image ships. ⚠ **Verify the image
  contents rather than asserting them** — 10c-3 claimed playwright was "absent from the image" and
  the honest statement is that the *package directory* does not exist while four files still
  mention the string. Say what you checked and how.
- Runtime dependencies stay exactly `next`, `react`, `react-dom`.
- If anything in `INSTALL-SPEC.md` cannot be done as written, **record it; do not improvise**
  (invariant 7).

## 6. Rules

- **Do not commit. Do not edit `SPEC.md` or `MOCK.html`.** `INSTALL-SPEC.md` is a spec too —
  record disagreements rather than editing it.
- ⚠ **Never `git checkout --` while this item is uncommitted** — undo with the reversing edit.
- Never `pnpm verify` alongside a harness; ⚠ never poll with `pgrep`. No `.env` left behind; no
  secret printed to a terminal or a log (root `CLAUDE.md`); `next-env.d.ts` byte-identical.
- New mutation ids `11-`, unique across all harnesses; ⚠ names need a matchable prefix ≥12 chars.

## 7. Deliverable

`pipeline/steps/11-packaging/build.md`: what each file does and why each flag is there; how each of
O20/O21/O22/D8 is made loud; the unit file with the three traps addressed and how you verified each;
what `--dry-run` prints; the image-contents check with its method; the browser-defaults note and
where you put it; every spec silence. Short summary back. The parent will not read your transcript.
