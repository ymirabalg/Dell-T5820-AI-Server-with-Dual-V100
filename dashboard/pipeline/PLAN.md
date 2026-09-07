# Build pipeline — ai-server dashboard

The spec (`dashboard/SPEC.md`, 749 lines) is built in **12 atomic steps**, in order.
Each step runs a four-phase loop. Every phase is a **fresh agent with clean context** and
receives only: this plan, `SPEC.md`, `HANDOVER.md`, and the prior phases' notes for the
current step.

## The loop

```
build  ─→  adversarial  ─→  review  ─→  reconciliation  ─→  HANDOVER.md updated
```

| Phase | Does | Must NOT do |
|---|---|---|
| **build** | Implements the step. Writes code **and** its tests. Leaves everything green. | Touch files outside the step's scope. Skip tests. |
| **adversarial** | Tries to break it: spec violations, untested paths, wrong edge cases, lying tests. Writes findings with a concrete failure scenario each. | Fix anything. Refactor. Edit source. |
| **review** | Reads the build **and** the adversarial findings. Judges each finding real or not. Adds quality/simplification/spec-conformance findings of its own. | Fix anything. Rubber-stamp the adversarial list. |
| **reconciliation** | Applies what survived, rejects what didn't (with reasons), re-runs the suite, updates `HANDOVER.md`. | Add scope. Leave the suite red. Silently drop a finding. |

## Global invariants — every phase of every step

1. **`null` is not `0`.** `null` renders as `—`. Zero renders as the numeral with its unit
   (`0 RPM`). A fan reading 0 is a dead fan; a fan reading nothing is a driver that did not
   load. Conflating them is the single worst bug this project can ship.
2. **Read-only.** Nothing writes to the server. No `systemctl`, no hwmon write, no
   `set-model`. There is no endpoint that would accept it.
3. **`ENODATA` from `pwm5` means "EC auto", which is HEALTHY.** Never an error.
4. **`fanN_input` is the only trustworthy fan telemetry.** `pwmN_enable` lies (reads `2`
   even under manual control) and `fanN_target` clamps. Never derive from either.
5. **A failed reading is a partial snapshot plus an `errors[]` entry — never a 500.**
   Partial snapshots are the normal case on this machine.
6. **Node 24, TypeScript `strict`, pnpm, Vitest.** No dependency added without recording
   why in the step's notes.
7. **If the spec is silent, STOP and say so in your notes.** Do not assume. The spec was
   explicitly built to have no gaps; a gap you find is a defect to report, not a blank to
   fill. This overrides any instinct to keep moving.

## Steps

| # | Step | Scope | Green when |
|---|---|---|---|
| 1 | Scaffold & contract | pnpm/TS/Next/Vitest, `lib/types.ts` (§4 snapshot, every field nullable), scripts | `pnpm build` + `pnpm test` pass; a type test proves nullability is enforced |
| 2 | Format & severity core | §6.6 formatters, §6.3 severity bands, §6.4 standing conditions. Pure functions | table-driven tests incl. `null`→`—`, `0`→`0 RPM`, swap 2 dp, en-US separators |
| 3 | GPU & host collectors | `nvidia-smi` CSV, `coretemp`, `/proc/{stat,meminfo,loadavg,uptime,net/dev}` + delta maths | fixture-driven; first sample yields `null`, never `0` |
| 4 | Cooling collector | `dell_smm` found by name, fan1–5, the three traps, `pwm5`→mode | fixtures: module loaded, module absent, ENODATA, 0 RPM, >5100 RPM |
| 5 | Serving / storage / safety | D-Bus `ActiveState`, `/etc/llama-server/*.env` discovery, `/health` + `/v1/models`, statvfs, `ufw.conf`, DKMS path | fakes for dbus + http; ufw absent ≠ ufw disabled |
| 6 | Telemetry route | `GET /api/telemetry`, 2 s cache, `errors[]`, 401 | one collector throwing still returns 200 + errors; cache proven by call count |
| 7 | Auth & login | argon2id, session cookie, rate limit + `Retry-After`, middleware, `/login` per §5.2 | five login states; cookie flags; lockout countdown from the header |
| 8 | Client runtime | polling, `localStorage` prefs, 8192 ring, min/max decimation, backoff, visibility pause, 10 s debounce, event log | fake timers; decimation preserves a one-sample spike; hidden tab stops polling |
| 9 | UI primitives & charts | panel shell, chips, meters, rows, sparkline, stacked cooling chart | render tests: `null`→`—` vs `0 RPM`; two stacked plots, never a dual axis |
| 10 | Panels & assembly | nine panels, header controls, banner, grid + breakpoints | grid matches §6.1 placement; paused shows mode **and** alarm count |
| 11 | Packaging | Dockerfile, `dashboard.sh`, systemd unit | `--dry-run` prints intent; `StartLimit*` asserted in `[Unit]`; shellcheck clean |
| 12 | Deploy & verify | install on the box, run, verify | ufw governs 8090; no ordering cycle; survives a reboot |

## Handover contract

After each reconciliation, `HANDOVER.md` is rewritten to state: what now exists, the public
surface the next step may rely on, decisions taken and why, findings rejected and why, and
anything the spec left open. The next step's agents read it as fact.
