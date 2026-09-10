# Handoff — Step 11, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/11-packaging/build.md` and `steps/11-packaging/test.md` (**your subjects** — the test phase
found the build's own instrument measuring validators while nothing measured the rows calling them;
assume nothing it did not check), **`pipeline/INSTALL-SPEC.md` including its new §11.1 owner
rulings**, `HANDOVER.md` §4.1, §0.12, §1, §8, `SPEC.md` §2.2/§2.4/§2.5/§5.1, the **repo-root
`CLAUDE.md`**, `ANCHOR.md` §4/§5/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: step 11 build + test.
⚠ **The parent's demo server is on :39174/:39175 — do not kill it.** Docker is **not installed**
on this Mac: reason about the image and the container from the files, and say so.

## 1. Verified by the parent

`pnpm verify` exit 0, **102 files, 3092 tests**; `shellcheck dashboard.sh` **clean**. The unit's
`StartLimit*` are in `[Unit]` and it orders after `sysinit.target`. The test phase's own figures
(52 mutations, 31 ⚠) are its claims.

## 2. Where to aim

1. **The test phase's headline was that a cross-check is only worth its call site.** Do the same
   sweep it did, one layer out: for **every** validator, guard and `check` row in `dashboard.sh`,
   can you delete or disconnect it and keep `pnpm verify` + the harness green? It found eight; find
   the ones it did not. Report each as a one-line edit.
2. **The four silent failures, from the operator's side.** Write the sequence of commands a person
   would actually run on the box and find the one that produces a **working-looking, wrong**
   system: a hash from the wrong tool, a hand-edited env file, a container started by hand beside
   the unit, `STANDING` with a typo, a `set-password` interrupted midway, a `configure` run twice,
   an `install` over an existing install, an `uninstall` that leaves a mount or a rule.
3. **⚠ `--gpus all` now falls back** (owner ruling, INSTALL-SPEC §11.1) — **and it is NOT yet
   implemented**; the reconcile does it. Say what a correct implementation must not get wrong:
   how a fallback start is distinguished from a healthy one, what `check` must report, and whether
   anything could make the fallback path silently permanent.
4. **The unit and the box's own history.** Trap 3 (an ordering cycle) deleted start jobs silently
   on this exact machine. Is there any path — `Wants=`, `After=`, `Requires=`, a `.wants` symlink
   `install` creates — that could recreate it against `docker.service`, `gpu-fan-control.service`
   or `llama-server@.service`? What does step 12 have to check on a real boot, and is it written?
5. **Secrets.** Trace every path a password, hash or session secret can take: argv (visible in
   `ps`), a temp file, a backup in `/root`, `set -x`, an error message, a `--dry-run` print, the
   journal. The repo's own rule is `--api-key-file`, never `--api-key`, for exactly this reason.
6. **`--dry-run` fidelity.** The test phase found the env-file backup missing from the dry surface
   and a `gpg` command printed differently from the one run. Diff *every* subcommand's printed
   intent against what it would execute.
7. **The image.** Two `COPY` lines, not `.dockerignore`, are what keep the spec and the tests out.
   What else could a future edit drag in? Is `NODE_ENV`, the user, the port, the healthcheck and
   the signal handling right for a standalone Next 16 server?
8. **Anything in the step-11 diff you can revert one line of and keep everything green.** The last
   four loops found six, three, four and eight.

## 3. Rules

- **Fix nothing.** Findings `11-A1…`, most severe first, each with a concrete scenario, severity,
  file:line, and how proven ("measured" / "reasoned, not run" — and Docker being absent means much
  will be the latter; label it honestly). Throwaway scripts in
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git checkout --` while this item is uncommitted.** Never `pnpm verify` alongside a
  harness; ⚠ never poll with `pgrep`. No `.env`; never print a secret. No commit; no `SPEC.md`,
  `MOCK.html` or `INSTALL-SPEC.md` edits.

## 4. Deliverable

`steps/11-packaging/adversarial.md`: findings first; then what held; then what you could not verify
and why. Short summary back. The parent will not read your transcript.
