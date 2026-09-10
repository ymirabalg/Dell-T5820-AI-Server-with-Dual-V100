# Handoff — Step 11, TEST phase

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/11-packaging/build.md` (**primary subject**), `handoffs/11-packaging.md`,
**`pipeline/INSTALL-SPEC.md` (the spec the build follows)**, `HANDOVER.md` **§4.1** (O20/O21/O22/D8),
§0.12, §1, §8, `SPEC.md` §2.2/§2.4/§2.5/§5.1 and §6.1's ⚠ browser-defaults requirement, the
**repo-root `CLAUDE.md`** (the systemd traps, the box), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: step 11 uncommitted on `3f152b0`.
⚠ **The parent's demo server is on :39174/:39175 — do not kill it, do not start a second
`next dev`.** Nothing in this step runs against the box.

## 1. Verified by the parent

`pnpm verify` exit 0, **102 files, 3085 tests**. `dashboard.sh`, `Dockerfile`, `.dockerignore`
exist; the unit carries `StartLimitIntervalSec`/`Burst` in **`[Unit]`** and
`After=docker.service sysinit.target` — both traps addressed in the text. The build's other claims
(37/37 mutations, shellcheck clean, 13 dry-runs writing nothing, the 130-file context) are its own.

## 2. ⚠ Priorities

1. **The four silent failures are the point of this step.** For each of O20, O21, O22 and D8,
   ask: *what exactly happens on the box if it is wrong, and does anything here SAY SO?* The build
   holds `dashboard.sh` equal to the TypeScript by sourcing it under `DASHBOARD_SH_LIB=1` and
   comparing verdicts over fixture tables — **check that instrument itself**: can the shell half be
   broken while the table still passes? Is every fixture in the table reachable from a real
   `configure` run, and are there real inputs the table omits (a hash with a trailing newline, a
   value with a trailing space, CRLF line endings, a UTF-8 BOM, `STANDING` with an unknown id)?
2. **O21 is about a quoted value that WORKS.** Prove `check` fails on `SESSION_SECRET="…"` and on
   a value with surrounding whitespace, and that `configure` cannot write one.
3. **O22 — "assert one process" is three mechanisms.** Try to defeat each: two `docker run`s with
   different `--name`s, the unit started while a manual container is up, a restart racing
   `ExecStopPost`. Does `check` actually count what it claims (containers, processes, listeners),
   and would it notice a second process on a different port?
4. **The unit.** Trap 1 is in the text — but does anything *verify* it? Trap 3 (an ordering cycle)
   can only appear on a real boot, so what does this step leave for step 12 to check, and is it
   written down? Is there any `Wants=`/`After=` that could re-create the cycle
   `gpu-fan-control` and `llama-server` already paid for?
5. **`--dry-run` on 13 subcommands.** Assert it writes nothing *and* that its printed intent
   matches what the real run does — a dry-run that prints a different command than it would execute
   is worse than none. Diff the two where you can.
6. **The image.** The build says the context is 130 files / 1216 KiB. Verify what actually lands in
   the image rather than what `.dockerignore` says: no test files, no `pipeline/`, no `MOCK.html`,
   no `SPEC.md`, no secret. ⚠ 10c-3's precedent: *"absent from the image" was right about the
   package and wrong about a grep* — say precisely what you checked.
7. **Test names against bodies** in `packaging.test.ts` (24 ⚠ tests, all new); the `toContain`
   shape (eleven instances so far); entropy/timers; and that every ⚠ name has a matchable prefix
   ≥12 chars.
8. **The eleven spec silences in build.md §9** — is each a real silence, or a choice the builder
   made and then labelled? Two are flagged for the owner already (INSTALL-SPEC §9's O20 row being
   impossible as written; `--gpus all` being unconditional) — **do not re-litigate those two**.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
shellcheck dashboard.sh
python3 pipeline/steps/11-packaging/regressions.py
```

- **nvm path first**; never `pnpm verify` alongside a harness; ⚠ never poll with `pgrep`;
  ⚠ **never `git checkout --` while this item is uncommitted**. No `.env`; no secret printed;
  `next-env.d.ts` byte-identical. Docker may not be installed on this Mac — say so rather than
  faking a result.
- **Fixing IS in scope. Do not commit. Do not edit `SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md`.**

## 4. Deliverable

`steps/11-packaging/test.md`, leading with §2 in order; short summary; end with `pnpm verify`,
`shellcheck`, the harness result, and `git status`. The parent will not read your transcript.
