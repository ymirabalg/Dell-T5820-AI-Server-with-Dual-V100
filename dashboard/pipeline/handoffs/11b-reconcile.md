# Handoff — 11b, RECONCILE phase (background agent)

**Written by the parent, 2026-09-11.** Fresh agent, no memory of this project. Read this file, then
`steps/11-packaging/11b-adversarial.md` (**14 findings — primary subject**),
`steps/11-packaging/11b-test.md`, `steps/11-packaging/11b-build.md`,
`handoffs/11b-secrets-and-drift.md`, **`SPEC.md` §5 (⚠ the file-mode correction), §5.1's ⚠⚠ secrets
ruling**, §2.5, §5's auth rules, `INSTALL-SPEC.md` §11.2/§11.3, `HANDOVER.md` in full (you rewrite
it), `steps/11-packaging/reconciliation.md` (the model), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 11b build + test + adversarial,
on `dc4aad1`. ⚠ **The parent's demo server is on :39174/:39175 — do not kill it.** Docker is **not
installed**.

## 1. Verified by the parent

`pnpm verify` exit 0, **104 files, 3149 tests**. ⚠ **A9 confirmed by the parent**: `SecretSource
.require()` — the build's documented startup entrance — has **zero production callers**
(`grep` over `lib`, `app`, `proxy.ts`, `instrumentation.ts` excluding tests returns nothing). Treat
that as fact.

## 2. ⚠ The finding that governs this loop

**`11b-A3` — the secrets ruling introduced a NEW silent failure, inside the guard built to remove
one.** Measured: startup validates the file and the server goes ready; an **in-place append** then
makes the gate's and the routes' bundled copies memoise an **empty `Environment`**; every login
returns **401 with nothing logged**, and the process never exits, so `Restart=always` never fires.
That is O20's exact symptom — *a dashboard that will not open and will not say why* — reached
through the mechanism whose purpose was to make O21 loud.

**Fix the cause.** Two honest shapes, and the choice is yours to make and to justify:

- **One read, shared** — the startup read is the only read, and the request paths use its result
  (a module-level value the three bundles cannot each re-derive, or a source injected at the
  composition roots). Then a post-boot edit cannot change behaviour at all, which matches §4's
  "a `STANDING` change needs a restart" precedent.
- **Re-read, but never silently degrade** — a request-path read that fails keeps the last good
  configuration and makes the failure visible, rather than memoising empty.

⚠ **Whatever you choose, the 401-vs-500 rule stands** (§5: the request path must not throw), and
**"never silently degrade" is the property to test**, not "reads once". `SecretSource.require()`
being dead (A9) is part of this same fix — either wire it or delete it, and say which.

## 3. Then the second structural one

**`11b-A1`/`A2` — the check-vs-server differential is a 21-row literal list**, and 45 generated
files found **11 that pass every `check` row while the container refuses to start**. This is the
*same* shape the test phase fixed for the reader-vs-Docker comparison in the same document, left
unfixed one table over. Three causes named: no whole-file `\r` rule, no whole-file BOM rule, and
the 64 KiB bound checked **after** the comment/blank skip so a large comment is never measured.
**Generate the corpus; do not extend the list.**

## 4. Adjudicate all fourteen; fix what is 11b's

Each ACCEPTED / REJECTED / DEFERRED with a checkable reason; a REJECTED row names the refuting line.
Also: **A4** `env_set`'s `mv` renaming onto the bind-mount source, so `set-password` can never reach
a running container and nothing compares the two inodes. **A5** `check_env_file` printing a bash
arithmetic error and then a **green tick** when `$ENV_FILE` is a directory — the shape Docker
creates for a missing bind-mount source — a row the test phase's own sweep had declared sound.
**A6** `container_gid` reading the **repo's** unit while every drift expectation reads the
**installed** one (measured to disagree). **A7** `configure` never repairing an existing file's
mode. **A8** `check_drift` comparing 6 of ~14 flags, omitting `--read-only` and `--user`.
**A10** the line-length model one byte looser than real `bufio`.

## 5. Then

`pnpm verify` cold; `shellcheck dashboard.sh`; the harnesses for everything you touch — **step 07
owns `lib/auth/`**, step 11 owns the packaging files — **serially, foreground, one at a time.**
⚠ **Never run two harnesses at once and never kill one**: the restore is in a `finally` that
`SIGKILL` skips, and the test phase stranded nine mutations that way. Then `git status`.

Write `steps/11-packaging/11b-reconciliation.md` (adjudication table first) and **rewrite
`HANDOVER.md`**: §0.0 = 11b's state and, plainly, **whether the secrets ruling now costs a silent
failure or not**; §8 the open questions; §1 the totals; §0.14 this loop's rules — including the one
this loop earned twice: **a hand-written table cannot falsify its own property; generate the
corpus.**

## 6. Not yours (ANCHOR §8)

No commit. No `SPEC.md` / `MOCK.html` / `INSTALL-SPEC.md` edits — quote wording you want. No
claiming green: paste exit codes.

## 7. Rules

`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
alongside a harness; ⚠ never poll with `pgrep`; ⚠ **never `git checkout --` while this item is
uncommitted**. New ids `11b-`, unique, ⚠ names ≥12 matchable chars. No `.env`; **never print a
secret**; `next-env.d.ts` byte-identical. Do not weaken a guard.

## 8. Report

Adjudication counts; **how A3 was closed and which shape you chose, with the property you test**;
the generated-corpus result for A1/A2 (how many of the 45 now fail `check`); what was fixed;
harness and verify exit codes; what step 12 inherits; the owner questions. The parent will not read
your transcript.
