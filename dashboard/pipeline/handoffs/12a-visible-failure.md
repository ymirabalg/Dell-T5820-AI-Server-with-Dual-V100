# Handoff — 12a BUILD: **a collector that cannot read must be visible.** The first production failure.

**Written by the parent, 2026-09-14.** Fresh agent, no memory of this project. Read: this file →
**`SPEC.md` §6.2's ⚠⚠ 2026-09-14 ruling** (it is the brief) and §6.5, §9's aggregate →
**`pipeline/INSTALL-SPEC.md` §11.4** (the cgroup ruling) → `pipeline/HANDOVER.md` §0.0, §8 (rows
`10e-Q4`, and every `dbus` row) → `steps/10-panels-assembly/10g-adversarial.md` A-series (where
`10e-Q4` was first measured and deferred) → `components/panels/gpu-panel.tsx`,
`lib/client/observations.ts`, `components/header.tsx`, `lib/collectors/dbus*.ts` →
`ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree clean at `e1b1ff1` plus the parent's doc
edits. ⚠ **The box is LIVE and serving this dashboard at 192.168.4.71:8090.** You do not deploy;
the parent does. Docker is not installed on this Mac.

## 1. What happened, measured — this is not hypothetical

A `systemd daemon-reload` at 2026-09-14 21:00:34 revoked the running container's GPU device access
(cgroup v2 + the systemd cgroup driver). `nvidia-smi` inside the container then failed with
*"Failed to initialize NVML: Unknown Error"*, the snapshot carried
`{"source":"nvidia-smi","message":"nvidia-smi: exited 255"}`, and **the operator found it by
reading the raw API response, because the UI said nothing.** A container restart fixed the access.

⚠ **The parent has already verified, by direct render, that the `gpus: null` branch DOES show it** —
`no GPUs enumerated` then `nvidia-smi: exited 255`, no severity band. So the rendering gap is the
**absent** branch (`gpus` is an array that does not contain this index), which draws
`card not enumerated` and **nothing else**. Do not re-derive that; extend it.

## 2. What to build

1. **Every takeover branch renders its `errors[]`.** GPU's absent branch is the known one; **sweep
   for siblings** — SERVING's empty state, COOLING's unavailable channel, any panel that replaces
   its readings with a sentence. A takeover that hides the readings must still say why.
2. **The header may not read `all healthy` while any `errors[]` entry exists.** §9's aggregate is
   computed from readings, and a source that could not be read contributes none — so it currently
   summarises a half-blind machine as well. Decide the wording from §6.2's existing vocabulary
   (`● no readings` already exists for the total case) and **record the choice**; if the spec does
   not settle the partial case, that is invariant 7 and it is an owner question, not your pick.
3. ⚠ **`check` gains an IN-CONTAINER `nvidia-smi` row** (INSTALL-SPEC §11.4). Host-side health
   proved nothing here — that is the lesson. It must **judge its own failure**: unable to run is
   `unknown`, never a tick. This project has now shipped that defect four times; do not make it
   five.
4. **Unit-installing scripts restart `ai-dashboard` after reloading systemd** — `dashboard.sh`
   (`unit`, `install`), and the sibling scripts where they can reach it. Guard it: restarting a
   unit that is not installed must not fail the run.
5. **The D-Bus `ECONNRESET` entries are UNDIAGNOSED and are yours.** Two appeared in the same
   response: `/run/dbus/system_bus_socket: read ECONNRESET`. Find the cause before choosing a fix.
   ⚠ `dbus` reaches three panels, so whatever you do, check it against S-G and S-H rather than
   assuming. If the honest answer is that it is benign and should be suppressed, prove it is benign.

## 3. The bar

- **Acceptance is the production case, fabricated**: `gpus: []` and `gpus: null`, each carrying an
  `nvidia-smi` entry, both put the reason on screen; the header says something other than healthy
  for both. Render them, do not reason about them.
- ⚠ **A hand-written table cannot falsify its own property** (HANDOVER §0.14) — the last loop
  learned this twice. Generate the takeover/error combinations rather than listing the ones you
  thought of.
- Mutation ids `12a-`, unique across all harnesses, ⚠ names ≥12 matchable chars. Fixtures on both
  sides of every branch. `components/` stays hook-free.
- The browser measurements must stay green: a note added to a takeover branch changes panel height,
  and §6.1's bound is now load-bearing.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify && shellcheck dashboard.sh
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
# then every harness whose LEDGER_FILES you touch, serially, foreground, one at a time
```

- ⚠ **Never `git checkout --` while this item is uncommitted**; never two harnesses at once and
  never kill one; never poll with `pgrep`; never `pnpm verify` beside a harness.
- **Do not commit. Do not edit `SPEC.md`, `MOCK.html` or `INSTALL-SPEC.md`.** Do not deploy to the
  box. Do not weaken a guard. Invariant 7: if the spec is silent, record it.

## 5. Deliverable

`pipeline/steps/12-deploy/12a-build.md`: each takeover branch before and after; the header rule and
its wording with the reasoning; the `check` row and how it judges its own failure; the restart
guard; **the D-Bus diagnosis with evidence**; the generated combinations; measurements; harness
totals; every spec silence. Short summary back. The parent will not read your transcript.
