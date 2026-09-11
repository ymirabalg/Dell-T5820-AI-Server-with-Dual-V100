# Handoff — 11b, TEST phase

**Written by the parent, 2026-09-11.** Fresh agent, no memory of this project. Read this file, then
`steps/11-packaging/11b-build.md` (**primary subject**), `handoffs/11b-secrets-and-drift.md`,
**`SPEC.md` §5 (the ⚠ 2026-09-11 file-mode correction) and §5.1's ⚠⚠ secrets ruling**,
`INSTALL-SPEC.md` §11.2/§11.3, `HANDOVER.md` §0.13, §4.1, §1, §8, `lib/auth/config.ts` and the new
`lib/auth/secret-file.ts`, `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 11b uncommitted on `dc4aad1`.
⚠ **The parent's demo server is on :39174/:39175 — do not kill it.** Docker is **not installed**.

## 1. Verified by the parent

`pnpm verify` exit 0, **104 files, 3144 tests**; `shellcheck` clean. The unit no longer passes
`--env-file`. The parent has **already resolved** the build's open question: the file is
**`root:<container gid>` 0640**, matching `/etc/llama-server.apikey`; `SPEC.md` §5 and
`INSTALL-SPEC.md` §11.3 now say so. **Do not re-litigate the mode.**

## 2. ⚠ Priorities

1. **"Stricter than Docker, never looser" has been falsified twice in this project by
   measurement** (an `awk -v` interpreting escapes; twelve Unicode spaces). The build claims 26
   shapes and an implication test. **Attack it**: generate shapes rather than listing them — every
   ASCII control character, every Unicode space and format character, `=` in the value, an empty
   value, a key with a leading space, `export KEY=…`, a line of only whitespace, a very long line,
   a file with no trailing newline, a NUL byte, a value that is exactly the 32-char floor, a
   duplicate key where the *second* is valid. For each: what does Docker do, what do we do, and is
   ours never the more permissive?
2. **Both spellings must agree** — the TypeScript reader and `secret_value_error` in bash are
   asserted equal "message for message". Can one be edited so they diverge while the table passes?
   That is the exact hole the previous loop found one layer down (a cross-check not wired to its
   call site). **Check the call sites, not just the functions.**
3. **Startup vs request path.** The build says startup throws/exits and the request path returns an
   empty environment and never throws, because §5 needs 401 not 500. Prove both: a malformed file
   at boot must not start; a file that becomes unreadable *after* boot must still 401 rather than
   500, and must not re-read per request.
4. **No secret may reach a log, an error message, a thrown stack, or `--dry-run` output.** Grep is
   not enough — construct a refusal for each bad shape and assert the *value* never appears in what
   is printed, including when the value is what makes the line malformed.
5. **`check_drift`'s expectation is derived from `ExecStart=`.** Can it be fooled by a comment, a
   line continuation, a second `ExecStart`, or an `ExecStart` in a drop-in? ⚠ The build already
   found this row **failing open** once (absence was its pass condition). Look for other rows with
   the same shape — a check whose pass condition is "nothing found".
6. **`11-R2` stopped biting** and was re-aimed at a second call. Verify the re-aim catches the
   property it names, and sweep for other mutations whose first-call anchor may now be ambiguous.
7. **`instrumentation.ts` is a new Next surface.** Does it run exactly once, before requests, in
   the standalone build? What happens if it throws — does the server exit, or serve 500s? Is it
   traced into `.next/standalone` (the build says yes; confirm)?
8. Test names against bodies in the new files; the `toContain` shape (twelve instances so far);
   ⚠ names with a matchable prefix ≥12 chars; entropy or clocks.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
shellcheck dashboard.sh
python3 pipeline/steps/07-auth-login/regressions.py; python3 pipeline/steps/11-packaging/regressions.py
```

- **nvm path first**; never `pnpm verify` alongside a harness; ⚠ never poll with `pgrep`;
  ⚠ **never `git checkout --` while this item is uncommitted**. No `.env`; **never print a secret**;
  `next-env.d.ts` byte-identical. New ids `11b-`.
- **Fixing IS in scope. Do not commit. Do not edit `SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md`.**

## 4. Deliverable

`steps/11-packaging/11b-test.md`, leading with §2 in order; short summary; end with `pnpm verify`,
`shellcheck`, both harness results, and `git status`. The parent will not read your transcript.
