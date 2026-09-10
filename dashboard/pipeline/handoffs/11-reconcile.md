# Handoff — Step 11, RECONCILE phase (background agent)

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/11-packaging/adversarial.md` (**18 findings — primary subject**),
`steps/11-packaging/test.md`, `steps/11-packaging/build.md`, `handoffs/11-packaging.md`,
**`pipeline/INSTALL-SPEC.md` including §11.1's owner rulings**, `HANDOVER.md` in full (you rewrite
it), `SPEC.md` §2.2/§2.4/§2.5/§5.1, the **repo-root `CLAUDE.md`**, `ANCHOR.md` §4/§5/§8/§9,
`steps/10-panels-assembly/10h-reconciliation.md` (the model).

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: step 11, uncommitted on
`3f152b0`. ⚠ **The parent's demo server is on :39174/:39175 — do not kill it.** Docker is **not
installed** on this Mac; nothing here runs against the box.

## 1. Verified by the parent

`pnpm verify` exit 0, **102 files, 3092 tests**; `shellcheck` clean. The unit's `StartLimit*` are in
`[Unit]`, ordered after `sysinit.target`.

⚠ **One adversarial claim the parent has already checked and NARROWED — do not inherit it as
written.** A8 says the ufw matcher "blocks every root subcommand on a correctly firewalled box".
The box's own documented rule is `ufw allow from 192.168.4.0/22 to any port 22 proto tcp`, which
`ufw status` renders as `22/tcp  ALLOW  192.168.4.0/22` — `$1` **is** the port and the matcher
**does** catch it. The real blind spot is a *destination-qualified* rule (`to <ip> port 22`), which
renders the address in `$1`; this box does not use that form today. So A8 is a **latent** hazard,
not a live blocker for step 12. Fix it, and state it accurately.

## 2. ⚠ The finding that governs this loop

**49 of 63 one-line edits keep the whole suite green**, including every `check` row the test phase
did not wire, `check_one_process` deleted from `cmd_check` outright, `cmd_check` made unable to
return 1, and **all seven preflight refusals**. The adversarial names the two structural causes:

1. **Nothing asserts WHICH functions `cmd_check` calls.**
2. **Nothing asserts THAT A GUARD REFUSES** — only that it can be called.

**Fix the causes, not the 49 instances.** Two general mechanisms — a call-graph assertion over
`cmd_check`'s body, and a "this guard refuses on bad input and permits on good" table over every
preflight and every `check` row — subsume nearly all of it. Then re-run the adversarial's sweep
yourself on a sample and report how many of the 63 now fail. **A count is the evidence here.**

## 3. Adjudicate all eighteen; fix what is step 11's

Each ACCEPTED / REJECTED / DEFERRED with a checkable reason; a REJECTED row names the refuting line.
Priorities after §2:

- **A3** `build` skipping a rebuild with a green tick, then `restart` proving the container changed
  and `check` passing **on old code** — that is the silent-failure shape this whole step exists to
  prevent, on the deploy path itself.
- **A12** a failed `systemctl enable` prints a green tick and nothing checks the unit is enabled —
  **PLAN row 12's "survives a reboot" has no detector.** Step 12 depends on this.
- **A4** a changed unit file installed, ticked, and not in force. **A9** `install` dying at step 7
  of 9 leaving the unit enabled but never started. **A10** `uninstall` leaving a rule, a container
  and every `/root` copy of the secrets.
- **A2** D8's judge looser than the browser for twelve Unicode spaces — the same "stricter, never
  looser" test falsified twice now. **A5** a non-root `check` reporting credentials absent on a
  healthy box with the wrong exit code. **A6** printing a 64-hex line that is `SESSION_SECRET`'s
  exact shape followed by an ellipsis implying redaction. **A7** `set-password --dry-run` still
  hiding the `/root` backup.
- **A14 is advisory and it is your implementation brief**: `--gpus all` **falls back** per
  INSTALL-SPEC §11.1 and is **not yet built**. Implement it, honouring A14's list — one `ExecStart`,
  argv splitting, no `EnvironmentFile=-` making the fallback the silent default, no probe that
  trips O22, mode read from `docker inspect .HostConfig.DeviceRequests` and never from the unit
  text or from `gpus: null`, a three-state `check` row with its own test, and a re-probe so a
  fallback cannot outlive the fix. ⚠ Six existing texts assert the old behaviour — fix them all.

## 4. Then

`pnpm verify` cold, `shellcheck dashboard.sh`, `python3 pipeline/steps/11-packaging/regressions.py`,
and **all nine other harnesses** if you touch anything under `lib/`. Then `git status`.

Write `steps/11-packaging/reconciliation.md` (adjudication table first, and §2's before/after count)
and **rewrite `HANDOVER.md`**: §0.0 = step 11's state and what step 12 must verify on the box;
§8 the open questions; §1 the totals; a §0.13 with this loop's rules — including the general one
this step earned: **a cross-check is only worth the call site it is wired into, and a guard is only
worth an assertion that it refuses.**

## 5. Not yours (ANCHOR §8)

No commit. No `SPEC.md` / `MOCK.html` / `INSTALL-SPEC.md` edits — quote wording you want. No
claiming green: paste exit codes.

## 6. Rules

`export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
alongside a harness; ⚠ never poll with `pgrep`; ⚠ **never `git checkout --` while this item is
uncommitted**. New ids `11-`, unique across all harnesses; ⚠ names ≥12 matchable chars. No `.env`;
never print a secret; `next-env.d.ts` byte-identical. Do not weaken a guard.

## 7. Report

Adjudication counts; **the sweep count before and after**; what was fixed; the `--gpus all`
implementation and how its mode is detected; harness and verify exit codes; what step 12 inherits;
the owner questions. The parent will not read your transcript.
