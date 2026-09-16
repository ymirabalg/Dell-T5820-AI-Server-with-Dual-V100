# Handoff — `serving-mode.sh`, RECONCILE phase (background agent)

**Written by the parent, 2026-09-15.** Fresh agent, no memory of this project. Read: this file →
`dashboard/pipeline/steps/12-deploy/serving-mode-adversarial.md` (**16 findings — primary
subject**) → `…/serving-mode-test.md` → `…/serving-mode-build.md` → **`SERVING-MODES.md`** (⚠ §4
was **RULED 2026-09-15**, §6's SWA figure **corrected the same day**) → the repo-root
**`CLAUDE.md`** → `serve-llm.sh`, `gpu-fan-control.sh`.

Working dir: the **repo root**. Tree dirty on `b69f81b`. ⚠ **The box is LIVE — read it, write
nothing.** ⚠ **Do not touch `dashboard/`** except your notes. ⚠ **No `pnpm verify`, no
`regressions.py`.**

## 1. ⚠ The finding that governs this loop

**`sm-A1` — the rollback can leave the box DARK and report that it did not.** `do_rollback` runs
`systemctl enable --now … || true` and the next line asserts the previous mode is back. Measured:
with that enable failing, both per-GPU instances **and** the split unit end `disabled inactive` —
dark now and dark after a reboot — while the final line says the old mode was restored.

**A rollback that lies is worse than no rollback**, because it is reached only when something has
already gone wrong, and it is the last thing standing between a failed switch and an unserved box.
**Fix it so the rollback verifies its own result and says plainly when it could not restore** — and
`sm-A2` with it: `on_exit` clears the traps before calling the rollback and `restore_backups`' `cp`
is unguarded, so a failure mid-rollback prints a raw `cp:` line and exits 1 without ever saying the
rollback failed. ⚠ **A second failure during rollback is the case to design for, not the first.**

## 2. Then, in order

- **`sm-A3`** — units, ports, firewall rows and the mode verdict are enumerated from **`nvidia-smi`'s
  card list**, not from systemd. With one card off the bus, `status` prints *"enabled and running
  agree: per-gpu", exit 0* while omitting instance 1 entirely, and `per-gpu` rewrites only `0.env`
  and claims success. **Enumerate from systemd** (what units exist and are enabled) and use the
  card list only where cards are the subject.
- **`sm-A4`** — `detect_mode` has no `unknown`; the test phase fixed the display helper and left the
  decision. A `systemctl` that cannot answer produces *"this box is NOT serving"* and a refusal
  whose printed remedy is the flag that removes the guard. **Unknown must refuse without a false
  reason**, and must never recommend `--bootstrap`.
- **The VRAM poll**, from the handoff's own question: unparseable is safe, but **absent or short is
  a false go** — one line for two cards reads as "all idle". **Assert one reading per card**, and
  wrap the call in `timeout`, since a wedged NVML currently hangs past `VRAM_TIMEOUT` with the
  cards already stopped.
- **Two more `ufw` defects of the class the test phase already found nine of**: a `limit` rule
  yields the false statement *"NO inbound ALLOW rule covers 8080/tcp"* (the code comment about
  LIMIT is wrong), and an IPv6-only row is a **false tick** for the IPv4 port the box listens on.
- **`status` exits 0 while its own closing line claims unknown checks exit 2** — and that is the
  live-box case, not a hypothetical.
- **A masked unit makes `ensure_file` write into `/dev/null` and `chmod 644 /dev/null`** while
  printing `✓ wrote …`.
- ⚠ **`dashboard_caveat` still tells the operator that §4's choice "is the owner's".** **It was
  ruled on 2026-09-15**: the dashboard will state the mode honestly, via `serving[].gpus`, in loop
  12b. Rewrite the caveat to say what is true — *the dashboard does not yet know about split mode;
  until 12b lands, GPU 1's served-by line will read as an unread reading* — and give it an expiry:
  it must name the thing that retires it.
- **The remaining findings**, each ACCEPTED / REJECTED / DEFERRED with a checkable reason.

## 3. Then

`shellcheck serving-mode.sh` (and `-S style`), `bash -n` on both bash versions, and **re-run the
test phase's harnesses** (104 cases: fidelity, refusals+status, ufw, rollback, idempotence) plus
whatever you add. ⚠ **Re-run the adversarial's own sweep against your fixes and report the count
before and after** — the last two loops went 11→11 caught and 48→48, and the number is the
evidence.

Write `dashboard/pipeline/steps/12-deploy/serving-mode-reconciliation.md`, adjudication table
first. **You do not rewrite `HANDOVER.md`** — that is the dashboard pipeline's file and this is a
root script; put what a future session must know in your own notes and say so.

## 4. Not yours

No commit. No `SERVING-MODES.md` edits — quote wording you want; the parent has already corrected
it once this week. No claiming green: paste exit codes. No writes to the box. ⚠ Never `git add`;
never `git checkout --`.

## 5. Report

Adjudication counts; how `sm-A1` was closed and what now proves the rollback restored the mode; the
sweep count before and after; exit codes; the caveat's new text; the owner questions. The parent
will not read your transcript.
