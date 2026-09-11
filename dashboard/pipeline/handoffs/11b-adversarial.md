# Handoff — 11b, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-11.** Fresh agent, no memory of this project. Read this file, then
`steps/11-packaging/11b-test.md` and `steps/11-packaging/11b-build.md` (**your subjects**),
`handoffs/11b-secrets-and-drift.md`, **`SPEC.md` §5 (⚠ the file-mode correction), §5.1's ⚠⚠ secrets
ruling**, §2.5, `INSTALL-SPEC.md` §11.2/§11.3, `HANDOVER.md` §0.13, §4.1, §8, `lib/auth/config.ts`,
`lib/auth/secret-file.ts`, `instrumentation.ts`, `ANCHOR.md` §4/§5/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 11b build + test, on `dc4aad1`.
⚠ **The parent's demo server is on :39174/:39175 — do not kill it.** Docker is **not installed**.

## 1. Verified by the parent

`pnpm verify` exit 0, **104 files, 3149 tests**; `shellcheck` clean; the tree carries no stranded
mutation from the test phase's killed-harness incident (`node:24-slim`, `--read-only` both present).

⚠ **The test phase's own headline is your best lead, because it succeeded by REFUSING to trust a
transcription.** It fetched `docker/cli`'s real `kvfile.Parse` and found a rule the build's
hand-transcribed model had missed (a max line length), which made this server start on a file
`docker run --env-file` refuses. **Do the same thing to the test phase's model.** Its corpus is now
986 generated shapes and 249 values; find what its *generator* cannot express.

## 2. Where to aim

1. **The grammar, from upstream rather than from the notes.** Read `kvfile.Parse` and its callers
   yourself. Line endings, the lookup callback (`os.LookupEnv` — a bare `KEY` inherits from the
   *host's* environment: what does ours do?), whitespace classes, the `#` rule's exact position,
   how a `\r` inside a value is treated, what happens at EOF without a newline, and what
   `bufio.MaxScanTokenSize` actually counts. Anything the generator cannot produce is a hole.
2. **Three copies of the reader.** The test phase found it bundled into instrumentation, the gate
   and the routes, so *"the process's one read"* is false in the container. It recorded this rather
   than fixing it. **Measure the consequence**: can the request-path copies read the file at all,
   and if so when? Can they disagree with the startup copy about the same file? What if the file
   changes, becomes unreadable, or grows a duplicate key after boot? Is a 401-vs-500 promise kept
   in every one of those?
3. **The startup guarantee.** Production `register()` exits 1 — but what actually happens in the
   *container*: does the unit see a non-zero exit, does `Restart=always` then loop, and does
   `StartLimit` bound it? What if `register()` is slow (a huge file), or the file is a FIFO, a
   symlink, a directory, a device node, or 0 bytes?
4. **Rows whose pass condition is "nothing found."** The test phase fixed three failing open and
   found a seventh with the mirror defect. **Sweep every row in `cmd_check` for that shape** and
   for any read that does not judge its own failure.
5. **One-line reverts.** Four loops running: 6, 3, 8, then 49 survivors. Apply the sweep to
   everything 11b added — `secret-file.ts`, `instrumentation.ts`, `check_drift`, `check_env_file`,
   `secret_value_error`, the unit's mount and `Restart=always`.
6. **Secrets in output, adversarially.** Construct a value whose *content* is what makes the line
   malformed (a secret containing `=`, `#`, a quote, a newline) and prove the refusal never echoes
   it — including through bash's own error paths, `set -x`, a `--dry-run`, and a stack trace.
7. **`check_drift` does not read drop-ins** (recorded, fail-closed). Confirm the direction, and
   find anything else that reads the unit file textually and could be fooled.
8. **The file mode is 0640 with the container's gid.** What breaks if the gid is wrong, the group
   does not exist, the file is 0644, or SELinux/AppArmor is in the way? Is a wrong mode *detected*,
   or does it surface as the same clean 401 O20 was about?

## 3. Rules

- **Fix nothing.** Findings `11b-A1…`, most severe first, each with scenario, severity, file:line,
  and how proven ("measured" / "reasoned, not run"). Throwaway scripts in
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git checkout --` while this item is uncommitted.** ⚠ **Never run two harnesses at
  once, and never kill one** — the test phase stranded nine mutations that way (`write_text` is in
  a `finally`, which `SIGKILL` skips). Run them serially, foreground, and let them finish.
- Never `pnpm verify` alongside a harness; ⚠ never poll with `pgrep`. No `.env`; **never print a
  secret**. No commit; no `SPEC.md` / `MOCK.html` / `INSTALL-SPEC.md` edits.

## 4. Deliverable

`steps/11-packaging/11b-adversarial.md`: findings first; then what held; then what you could not
verify and why. Short summary back. The parent will not read your transcript.
