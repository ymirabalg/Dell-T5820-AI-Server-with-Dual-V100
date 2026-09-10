# ai-server dashboard — specification

Status: **draft, pre-implementation.** Written 2026-09-06. No code exists yet.
This document is the input to a visual mock; the mock is the input to implementation.

The dashboard is a **self-contained project inside this repo**, rooted at `dashboard/`.
It is the first thing here that is not a shell script, and it stays walled off from them —
see §2.4.

A single-screen web dashboard, served from `ai-server` and reached over the LAN, showing
the live state of both GPUs, the host, the fan service, the inference endpoints, and the
handful of things on this box that break silently.

---

## 1. Decisions locked

Settled with the owner on 2026-09-06. Re-open any of these deliberately, not by drift.

| # | Question | Decision |
|---|---|---|
| 1 | Panels | GPUs, CPU, RAM, fan service, **plus** llama-server instances, disk & network, service/safety status |
| 2 | Chassis `tempN` sensors | **Out of scope.** `temp5` is dead, `temp1` is noise; `temp2` may return later as an ambient proxy |
| 3 | Control actions | **None. Read-only.** No writes to hwmon, no `systemctl`, no `set-model` |
| 4 | History | **Live only.** No server-side storage. The browser holds a rolling window |
| 5 | Cadence | **5 s default**, user-selectable; **30 min** chart window |
| 6 | Access | **LAN + password** |
| 7 | Layout | **Single-screen wall panel** — fixed grid, no scrolling at target size |
| 8 | Responsive | **Must work on all displays** — fluid grid, 4 → 2 → 1 columns |
| 9 | Style | **Dark instrument panel** |
| 10 | Alarms | **Colour scale + sticky banner + session event log** |
| 11 | Stack | **Next.js full-stack** (App Router, React, Turbopack — *not* Vite) |
| 12 | Deployment | **Docker container** on the server |
| 13 | Serving depth | **`/health` + model identity only.** No API key, no `/metrics`, no probe button |
| 14 | Image build host | **On `ai-server`.** Native amd64, no cross-arch risk, no Node toolchain on the host |
| 15 | Language / packages | **TypeScript + pnpm** |
| 16 | Client controls | Cadence selector, manual refresh, pause/resume, logout. **All client-side; none write to the server** |
| 17 | Alarm debounce | **Fixed 10 s of wall time**, independent of cadence |
| 18 | Chart window | **User-selectable** 10 min / 30 min / 2 h, default 30 min, independent of cadence |
| 19 | Background tab | **Pause when hidden**, resume on focus, gap drawn with the "no reading" hatch |
| 20 | Units | **Each source's native unit** — VRAM MiB, RAM GiB, disk **GiB**, net MB/s |
| 21 | Login screen | **Specified and mocked** as a third mock state |
| 22 | Standing conditions | Declared in `/etc/ai-dashboard.env`. **None is live today** — `ufw` was the only candidate and it now reads `ENABLED=yes` |
| 23 | Panel layout | Cooling spans two rows beside stacked CPU/RAM and SAFETY/STORAGE — **supersedes §6.1's ASCII** |
| 24 | Fan service state | Lives in **COOLING**, not SERVING — §6.2's prose wins over §6.1's sketch |

### Non-goals

Naming these now so they do not creep in later:

- Not a control panel. It never changes fan state, service state, or a loaded model.
- Not a historian. It answers "what is happening" and "what happened while this tab was
  open", never "what happened last Tuesday". If long-term trending is ever wanted, that is
  Prometheus scraping the same JSON endpoint, not a feature bolted onto this.
- Not an inference console. Token rates, KV utilisation and queue depth are deliberately
  excluded (decision 13) — adding them means giving the dashboard the API key.
- Not multi-host. One box, hard-coded. No agent/server split, no host picker.
- Not authenticated per-user. One shared password, no accounts, no roles, no audit log.

---

## 2. Architecture

```
                    ai-server (192.168.4.71)
  ┌───────────────────────────────────────────────────────────┐
  │  docker container  "ai-dashboard"   --network host        │
  │  ┌─────────────────────────────────────────────────────┐  │
  │  │  Next.js (standalone output)  :8090                 │  │
  │  │                                                     │  │
  │  │   /              → React panel (client component)   │  │
  │  │   /api/telemetry → JSON snapshot (server, cached)   │  │
  │  │   /api/session   → login / logout                   │  │
  │  └──────────────────┬──────────────────────────────────┘  │
  └─────────────────────┼─────────────────────────────────────┘
                        │ read-only
     ┌──────────────────┼───────────────────┬──────────────┐
     ▼                  ▼                   ▼              ▼
  nvidia-smi        /sys, /proc      dbus (systemd)   /etc/ufw/ufw.conf
  (NVML via         hwmon dell_smm   unit ActiveState  ENABLED=yes|no
   container                                          
   toolkit)
```

The browser polls `/api/telemetry` every `N` seconds and keeps the last 30 minutes of
snapshots in memory. The server holds no history at all — one snapshot, cached briefly.

### 2.1 Why `--network host`, and the trap it avoids

**⚠ Docker bypasses ufw.** Publishing a port with `-p 8090:8090` inserts rules into the
`DOCKER`/`FORWARD` chains, which are evaluated *before* ufw's `INPUT` rules. The port
becomes reachable from the whole LAN — and from anywhere routable — no matter what ufw
says. On a box whose firewall has already been found silently not enforcing once
(2026-09-04, `serve-llm.sh` trusting `systemctl is-active ufw`), shipping a second
firewall-invisible listener is not acceptable.

`--network host` makes the container's listener bind in the host network namespace, so it
arrives on `INPUT` and ufw governs it exactly like `llama-server`'s 8080/8081. It also
gives `/proc/net/dev` for `eno1` throughput without extra mounts.

Consequence to write down, and it has **reversed** since this spec was drafted:
`/etc/ufw/ufw.conf` now reads `ENABLED=yes` (verified 2026-09-06, and SSH survived), so ufw
*is* enforcing. The risk is no longer that 8090 is silently open — it is that **8090 is
silently unreachable.** `--network host` puts the listener on `INPUT`, where a firewall with
no rule for it drops the connection, and the container will start, bind, log nothing and
answer nobody.

Note the limit of what the dashboard can say about this: `ufw.conf` is world-readable and
`/etc/ufw/user.rules` is root-only, so the SAFETY row answers *"is the firewall on"* and
never *"is this port allowed"*. It reports the box's posture — which is what 8080/8081 need
— not its own reachability, and a dashboard you can load is already evidence of that.

### 2.2 Container access requirements

Every one of these is read-only. The container runs as a non-root user.

| Need | Mechanism | Notes |
|---|---|---|
| GPU telemetry | NVIDIA Container Toolkit, `--gpus all`, `NVIDIA_DRIVER_CAPABILITIES=utility` | Brings `nvidia-smi` + NVML in. **`nvidia-container-toolkit` must be installed on the host** |
| Fan RPM / PWM | `-v /sys:/sys:ro` | `dell_smm` hwmon node; discovered by name, not by fixed `hwmonN` index |
| CPU / RAM / load | `--pid host` + `/proc` via host namespace | `/proc/stat`, `/proc/meminfo`, `/proc/loadavg`, `/proc/net/dev` |
| CPU temperature | `/sys/class/hwmon` → `coretemp` | `Package id 0`; see §3.2 on why not `temp1` from `dell_smm` |
| Disk usage | `-v /:/host/root:ro -v /home:/host/home:ro` | `statvfs` on the mount points |
| systemd unit state | `-v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro` | Query `ActiveState` over D-Bus. Read-only and unprivileged — no `systemctl` shelling out, no root |
| Serving instances | `-v /etc/llama-server:/etc/llama-server:ro` | §3.4 enumerates `<i>.env` for `PORT=` and `CTX=`. **Without it every poll yields `serving: null`** and the SERVING panel reads "could not enumerate instances" on a perfectly healthy box |
| ufw enforcement | `-v /etc/ufw/ufw.conf:/etc/ufw/ufw.conf:ro` | Reads `ENABLED=`. `ufw status` needs root; `ufw.conf` does not. Same fallback `serve-llm.sh`'s `ufw_enforcing()` already uses |
| DKMS / kernel state | `-v /lib/modules:/lib/modules:ro` | Presence of `updates/dkms/dell-smm-hwmon.ko*` for the running kernel |
| Hostname | `-v /etc/hostname:/etc/hostname:ro` | `os.hostname()` returns the container's UTS hostname, not the host's. See §3.2 |

**Docker is not currently installed on the box.** Adding it is a prerequisite task, and it
is the first container runtime on a machine documented as deliberately bare. Flagged, not
argued — the decision is made.

### 2.3 Deployment

- **Built on `ai-server`, never on the Mac.** The Mac is arm64 and the box is x86_64;
  building on the target removes cross-arch emulation and any chance of an arch-specific
  npm binary that only fails at runtime. `docker build` needs no Node toolchain on the
  host — the build happens inside the image. Multi-stage, `output: 'standalone'`,
  `node:24-slim` for both stages.
- Run under a systemd unit that wraps `docker run`, matching this repo's existing pattern
  (`llama-server@.service`, `gpu-fan-control.service`) so it starts on boot and is visible
  to `systemctl status` like everything else.
- **`After=` must not name a target that `Wants` this unit.** Order after
  `docker.service` and `sysinit.target`. The ordering-cycle bug that silently deleted both
  `llama-server` start jobs on the 2026-08-28 boot came from exactly this, and it is
  invisible until a real boot. After installing, check:
  `journalctl -b | grep "ordering cycle"`.
- The dashboard must never be a dependency of anything that serves or cools. If it fails,
  nothing else notices.

### 2.4 Repo layout

The dashboard is an independent folder. Nothing outside it changes, and nothing inside it
is imported by the existing scripts.

```
ai-server/
├─ CLAUDE.md                 project notes — gains a short pointer, not a copy of this
├─ serve-llm.sh              unchanged
├─ gpu-fan-control.sh        unchanged
├─ …                         the other scripts, unchanged
└─ dashboard/                ← everything for this project, self-contained
   ├─ SPEC.md                this document
   ├─ AGENTS.md              generated and re-added by `next dev`; committed, not ignored
   ├─ CLAUDE.md              one line, `@AGENTS.md` — points agents at the Next guidance
   ├─ MOCK.html              the visual mock (step 2 of §8)
   ├─ README.md              how to build, run and deploy it
   ├─ dashboard.sh           install / status / uninstall, repo conventions
   ├─ Dockerfile
   ├─ .dockerignore
   ├─ package.json
   ├─ next.config.mjs        output: 'standalone'
   ├─ app/                   App Router — page, api/telemetry, api/session
   ├─ components/            panels
   ├─ lib/                   collectors: nvidia-smi, hwmon, proc, dbus, ufw
   └─ systemd/
      └─ ai-dashboard.service
```

Boundary rules, so the separation actually holds:

- **The dashboard never sources or invokes the repo's shell scripts.** It reads the same
  underlying sources they read (`nvidia-smi`, hwmon, `/proc`, D-Bus, `/etc/llama-server/`)
  and re-derives what it needs. Calling `serve-llm.sh status` and parsing coloured terminal
  output would couple a web service to a human-facing format — and those scripts are
  installed at absolute paths on the host anyway, out of reach of the container.
- **The traps in §3.3 are duplicated knowledge, and that is accepted.** `pwmN_enable`
  lying, `fanN_target` clamping, `ENODATA` meaning healthy — the dashboard has to know all
  of it independently. It is written down in this spec so the duplication is deliberate
  rather than rediscovered.
- **`dashboard.sh` follows the repo's script conventions**, not Node conventions:
  `set -euo pipefail`, the `bold`/`info`/`ok`/`warn`/`die` helpers, `usage()` re-reading
  its own header comment, `--dry-run` on every subcommand. It is the only part of the
  project a person on the server touches directly.
- **`.gitignore` gains** `dashboard/node_modules/`, `dashboard/.next/`, `dashboard/out/`
  and `dashboard/.env*` — the last one matters, since the password hash and session secret
  live in an env file and must never be committed.
- **`dashboard/AGENTS.md` and `dashboard/CLAUDE.md` are generated by `next dev` and are
  committed, not ignored.** Next rewrites only the text between its
  `BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules` markers, so project-specific agent
  notes may be added outside them and will survive. They are agent guidance, not design.
  Ignoring them would hide permanent churn, and a blanket `CLAUDE.md` ignore would later
  swallow a hand-written file.
- **CLAUDE.md gets a pointer to this file**, not a summary of it. One document owns the
  dashboard's design; a second copy would go stale and then mislead.

### 2.5 Runtime contract

Fixed values, so nothing here is a judgement call at implementation time.

| | |
|---|---|
| Node | **24 LTS** (`node:24-slim`, builder and runner) — matches the dev machine, so tests run on the major that serves |
| Packages | pnpm via `corepack enable`; `pnpm-lock.yaml` committed |
| Framework | Next.js App Router, `output: 'standalone'`, React 19 |
| Image | `ai-dashboard:<git-short-sha>`, also tagged `:latest` |
| Container | name `ai-dashboard`, `--network host`, `--read-only` with a tmpfs `/tmp` |
| Port | **8090** |
| Container user | non-root, uid/gid 10001, no shell |
| libuv thread pool | **`UV_THREADPOOL_SIZE=16`**, via `docker run -e` | `readFile`, `readdir` and `statfs` all run on it and an in-flight one cannot be cancelled; the default of **4** is below `collectHost`'s own nine concurrent reads on a healthy poll. **Margin behind §4's outstanding-call rule, not a substitute for it** — measured, raising the size moves the saturation threshold and does not remove it |
| Credentials & config | **`--env-file /etc/ai-dashboard.env`** | ⚠ Docker reads this file **once, at container creation**, and copies the values into the environment. `PASSWORD_HASH`, `SESSION_SECRET` and `STANDING` (§5.1) arrive as `process.env` and nothing tracks the file afterwards — which is why §4 says a `STANDING` change needs a restart. **Docker's grammar is not a shell's**: it splits on the first `=`, takes the rest of the line verbatim, expands nothing and **keeps quotes**, so every value must be single-line, unquoted, and free of surrounding whitespace |
| Logging | `json-file`, `max-size=10m`, `max-file=3` |
| Unit | `ai-dashboard.service`, `ExecStart` runs `docker run` in the foreground |

Unit rules, all of them lessons this repo has already paid for:

- **`Restart=on-failure`, `RestartSec=10`, `StartLimitIntervalSec=300`,
  `StartLimitBurst=5` — and the two `StartLimit*` keys go in `[Unit]`, not `[Service]`.**
  systemd moved them in v229 and silently ignores them in `[Service]`.
  Verify with `systemctl show ai-dashboard -p StartLimitIntervalUSec`.
- `Wants=docker.service`, `After=docker.service sysinit.target`,
  `WantedBy=multi-user.target`. **Never `After=multi-user.target`** — that is the ordering
  cycle that deleted the `llama-server` start jobs on 2026-08-28.
- `ExecStartPre=-/usr/bin/docker rm -f ai-dashboard` so a stale container cannot block a
  restart.
- **`--read-only` means no `next/image`.** Next's image optimiser writes to a cache
  directory at runtime and will fail on a read-only filesystem. There are no raster images
  in this UI — every graphic is inline SVG — so the constraint costs nothing, but it has to
  be a stated rule or someone will reach for `next/image` and spend an afternoon on it.
- **No Docker `HEALTHCHECK` that restarts the container.** A dashboard that cannot read a
  sensor must stay up and say so; restarting it would destroy the browser's whole session
  buffer to fix nothing.

---

## 3. Data model

One snapshot object per poll. Every field carries an explicit `null` when unreadable —
the UI distinguishes *absent* from *zero*, which matters enormously on this box.

### 3.1 GPUs

Source: `nvidia-smi --query-gpu=... --format=csv,noheader,nounits`, one row per card.

**⚠ `nvidia-smi` is bounded at 4 s, and the bound must settle the request INDEPENDENTLY of
the child process. Sending a signal is not a bound.** §4 samples per request, so an
unbounded collector hangs the telemetry route and every browser polling it. Measured:
`execFile`'s own `timeout` only destroys the pipes and signals the child, while its callback
waits for `'close'` — a child that ignores `SIGTERM` ran **9015 ms against a 300 ms
timeout and still resolved**. `killSignal: 'SIGKILL'` does **not** fix the real case: a
wedged NVIDIA driver leaves `nvidia-smi` in uninterruptible sleep, where no signal is
delivered at all. **An `AbortSignal` alone is not sufficient either.** Node drops its abort listener once the
child exits, so a child that exits immediately while a *descendant* keeps the inherited
stdout pipe open is never reached — measured **9020 ms against a 300 ms abort, and it
RESOLVED rather than erroring**, which silently yields a truncated CSV parsed as real rows.
The deadline must therefore do four things itself, each load-bearing:

1. **abort** — bounds a live child, and reaps a killable one;
2. **destroy stdout and stderr** — bounds the descendant-holding-the-pipe case, which abort
   no longer reaches;
3. **settle the promise at the deadline**, whatever the child and its pipes do;
4. **`unref()` the child** — an abandoned process must not hold the event loop open
   (measured: 9021 ms of lingering becomes 649 ms).

4 s sits under §6.7's 5 s default cadence and well above the ~250 ms this call actually
takes.

**⚠ Bounding the promise ABANDONS the process, and §4 samples per request.** At a 5 s
cadence against a wedged driver, every poll would fork another `nvidia-smi` that never
exits. **§4's cache must therefore hold the in-flight promise, not only the finished
result** — concurrent and successive callers within the window join the existing call
instead of starting a new one.

**Exit codes, measured on driver 580.173.02:** `0` ran; `2` invalid query field; `6` no
devices (`No devices were found`). **Every non-zero exit yields `gpus: null`**, carrying the
driver's own text into `errors[]`.

| Field | Query field | Notes |
|---|---|---|
| `index` | `index` | 0, 1 |
| `name` | `name` | Returns **`Tesla PG500-216`** on this hardware, not the marketing name. Carry it raw |
| `bus` | `pci.bus_id` | Full domain form — GPU 0 `00000000:17:00.0`, GPU 1 `00000000:97:00.0`. **Carry it raw**; do not trim to the short form |
| `tempC` | `temperature.gpu` | Primary metric. Spec 83 °C, slowdown 87 °C |
| `powerW` | `power.draw` | Cap is 250 W |
| `powerCapW` | `power.limit` | |
| `memUsedMiB` | `memory.used` | |
| `memTotalMiB` | `memory.total` | 32768 |
| `utilPct` | `utilization.gpu` | Range-checked to **0–100**; outside that is `null`. 0–100 *is* the unit, so this is not an invented bound |
| `smClockMHz` | `clocks.sm` | |
| `throttleReasons` | `clocks_throttle_reasons.active` | `0x4` = power cap, normal here. Thermal throttle is an alarm. Driver 580 also accepts `clocks_event_reasons.active`; **both return identical values**, so either name is correct |

**`null` and `[]` mean different things.** `gpus: null` = the enumeration could not be
performed, **including a box with genuinely no cards**. `gpus: []` = the command succeeded
and produced no parseable rows, and **always carries an `errors[]` entry**, so it is never
silent. Both render "no GPUs enumerated"; only the second is evidence of a bug in us.

⚠ **A card ABSENT from a `gpus[]` that was read renders `card not enumerated` — ruled 2026-09-08
(10b-S-E).** It is a body takeover with **no served-model row**, and it is a different fact from
the whole enumeration failing: §6.5 already rules the condition (*"absent from a collection that
was read → the subject has left the machine, and that is an answer"*), so the panel must not
borrow `no GPUs enumerated`, which says the read failed when it succeeded. Rendering the ordinary
body of em dashes was rejected: it is **byte-identical** to a present card whose readings all
failed, which collapses the retired/stale distinction §3.1 and §9 spend paragraphs on.

**Degraded case:** `nvidia-smi` missing or returning nothing is not an error state to hide.
The GPU panels render as "no GPUs enumerated" with the timestamp of the last successful
read — **or, when there has been no successful read this session at all, "never read this
session"**. The buffer is empty on reload by design (§6.4), so a fresh load with
`nvidia-smi` already absent has no such timestamp and must not print a blank or an epoch. This box has a documented history of booting with no compute GPU at all.

### 3.2 Host

| Field | Source | Notes |
|---|---|---|
| `cpuPct` | `/proc/stat` delta between polls | Aggregate; per-core not shown at panel size. **busy = `user+nice+system+irq+softirq+steal`, idle = `idle+iowait`. `guest`/`guest_nice` are already counted inside `user`/`nice` and must NOT be added again** — double-counting them is the classic way this figure stops agreeing with `top` |
| `loadAvg` | `/proc/loadavg` | 1/5/15 |
| `cpuTempC` | `coretemp` hwmon, `Package id 0` | Tjmax 100 °C |
| `memUsedGiB` / `memTotalGiB` | `/proc/meminfo` | `MemTotal - MemAvailable`; 61 GiB total |
| `swapUsedGiB` / `swapTotalGiB` | `/proc/meminfo` | 8 GiB total. Any swap in use is notable on this box |
| `uptimeSec` | `/proc/uptime` | |
| `kernel` | `/proc/version` or `uname` | Needed by the DKMS check |
| `cpuModel` | `/proc/cpuinfo` `model name`, first entry | `Intel(R) Xeon(R) W-2135` — trimmed to `Xeon W-2135` for display |
| `cores` / `threads` | `/proc/cpuinfo`: distinct `core id`+`physical id` pairs, and the `processor` count | 6 / 12. §6.2's CPU panel requires this; it had no field until now |
| `hostname` | **`/etc/hostname`, bind-mounted read-only** — not `os.hostname()` | Collected here, but carried at the **top level** of the snapshot (§4), not inside `host` |

**⚠ `os.hostname()` inside the container returns the CONTAINER's hostname, not
`ai-server`.** `--network host` shares the *network* namespace; the hostname lives in the
**UTS** namespace, which is still the container's own. §4's example and §6.2's header both
show `ai-server`, so this would silently display a random container id. Fix by reading a
read-only bind of `/etc/hostname` (see §2.2). Passing `--uts=host` would also work but
grants more than is needed for one string.

**`uptimeSec` is displayed in the header**, beside the hostname. Four forms, so a freshly
rebooted box is not shown as `up 0 d 00:14`: `up 2 d 02:01` at a day or more, `up 02:01`
between an hour and a day, `up 14 min` below an hour, and `up <1 min` below a minute.

**⚠ Do not use `dell_smm`'s `temp1` as the CPU sensor.** Measured 2026-08-18: it swung
43–54 °C during pure idle while the CPU package held 35–37 °C, and read 59 °C during
cooldown with the CPU at 43 °C. `coretemp` is the correct source.

### 3.3 Cooling

Source: the `dell_smm` hwmon node, located by reading `name` — never by a fixed `hwmonN`
index, which is not stable across boots.

| Field | Source | Notes |
|---|---|---|
| `fan5Rpm` | `fan5_input` | The GPU/PCIe header (`FAN_HDD`). Only exists with the DKMS 5-fan module loaded |
| `fan2Rpm` | `fan2_input` | GPU-area OEM fan. Present but **not driven** in the current config |
| `fan1Rpm`, `fan3Rpm`, `fan4Rpm` | `fanN_input` | Shown small; they do not modulate under GPU load |
| `ch5Mode` | derived — see below | `'manual'` \| `'ec-auto'` \| **`null`** when the channel does not exist at all |
| `ch5Pwm` | `pwm5` | Only meaningful when `manual` |
| `serviceState` | D-Bus `ActiveState` of `gpu-fan-control.service` | |

**⚠ Three telemetry traps, all previously measured on this exact board. The spec depends
on getting these right:**

1. **`fanN_input` is the only trustworthy fan telemetry.** Everything else lies.
2. **`pwmN_enable` reads back `2` ("EC auto") even while a manual state is in force** —
   the driver never disables BIOS fan control on this board, so the EC reports its own
   mode. **Never derive the mode from it.**
3. **`fanN_target` clamps instead of erroring**, so in AUTO every channel reports its HIGH
   nominal (5100 for ch5) as though it were a live setpoint. **Never display it.**

**Correct mode derivation:** read `pwm5`. A successful numeric read means the channel is
under manual control. `ENODATA` means the channel is in EC auto — the driver returns it
because state 3 (AUTO) exceeds `i8k_fan_max` (2). So `ENODATA` is the *healthy auto*
signal, not a fault, and must not be rendered as an error.

**⚠ The whole `dell_smm` probe shares ONE 2 s budget, measured on a MONOTONIC clock.**
These reads go through SMM into the EC and can block; the driver serialises them behind a
mutex, so they are issued sequentially rather than in parallel. Use `performance.now()`, not
`Date.now()` — a backward NTP step extends a wall-clock bound by the size of the step, and a
one-hour correction was measured turning a 50 ms budget into a request for a 3,600,050 ms
timer.

**`fanN_input` is an unsigned revolution count.** `-0` compares equal to `0` and is a stopped
fan (§6.3). `-1` or below is a corrupt read: `null`, with **no** `errors[]` entry, since the
read itself succeeded.

**Reference readings for the mock:** LOW ≈ 989 RPM, EC auto ≈ 2210 RPM, HIGH ≈ 4300–4470
RPM, SMM nominal max 5100. Engage at ≥ 55 °C, release at ≤ 51 °C, `HIGH_DWELL=30`.

### 3.4 Serving

| Field | Source | Auth |
|---|---|---|
| `unitState` | D-Bus `ActiveState` of `llama-server@N.service` | none |
| `health` | `GET http://127.0.0.1:PORT/health` — see §3.7 for the value set | **none — returns 200 unauthenticated** |
| `model` | `GET /v1/models` | **none — returns 200 unauthenticated** ⚠ carried RAW on the wire; **rendered as its filename** — see below |
| `port` | `/etc/llama-server/<i>.env` (`PORT=`) — **the file only**; the unit's `EnvironmentFile` *is* that file on this box | none |

| `ctx` | same env file (`CTX=`) | none |

⚠ **`model` is RENDERED AS ITS FILENAME — ruled 2026-09-10 (10g-A1).** `/v1/models` returns
`data[0].id`, which is llama.cpp's `-m` argument: **the full weights path** unless `ALIAS` is set
in that instance's env file, and `ALIAS` is optional in `serve-llm.sh set-model`. Measured, a
path-valued `model` costs **+21 px per SERVING row** and **+17.9 px per GPU card** through the
`served by instance N` strip, and it was the last unbounded string on the page. The wire carries
it raw, as §3.1 requires of every reading; the **rendering** shows the path's final segment
(`Qwen3.6-27B-Q4_K_M.gguf`), with the whole string reachable in the row's `title` and the table
view. A path's identity is its filename, and an alias is already a filename-shaped word, so the
two forms render alike. This is the one place a reading is shortened for layout; it is not a
lookup, not a prettification, and nothing is invented — compare §6.2's raw driver name, which
stays whole because it is not a path.

**The filename must parse as a bare non-negative integer.** `01.env`, `+1.env` and `1 .env`
are **rejected**, not read as instance 1 — §6.4 makes the condition subject a bare integer,
so two spellings of one index would be two conditions for one instance.

Instances are discovered, not hard-coded: enumerate `/etc/llama-server/*.env`. Today that
is 0 and 1; a third card must appear without a code change.

By llama.cpp's design `/health` and `/v1/models` answer without the API key while
`/v1/chat/completions` returns 401 — which is precisely why decision 13 is cheap. The
dashboard needs no secret.

### 3.5 Disk & network

| Field | Source |
|---|---|
| `/` used / total | `statvfs` — the **232.6 GiB root filesystem** on the 238.5 GiB NVMe. `total = blocks × bsize`, `used = (blocks − bfree) × bsize`; **`bavail` is deliberately not used** — it excludes root-reserved space and would not match `df` |
| `/home` used / total | `statvfs` — the **915.8 GiB `/home` filesystem** on the 931.5 GiB Crucial, holds `~/models`. Conflating a device size with a filesystem size is how a correct reading gets called wrong |
| `eno1` rx/tx bytes-per-sec | `/proc/net/dev` delta between polls |
| `eno1` link state | `/sys/class/net/eno1/operstate` |

`/home` is the one to watch: the GGUF collection there is already ~80 GB across five
model files, and `hf-get.sh` writes by source filename with no space check.

### 3.6 Safety

Not hardware — the four things on this box that fail silently. This panel exists because
each of them has already cost real time.

| Check | Source | Healthy | Failure meaning |
|---|---|---|---|
| ufw enforcing | `/etc/ufw/ufw.conf` `ENABLED=` | `yes` | Inference ports and this dashboard are open to anything routable |
| `pwm5` present | `/sys/.../pwm5` exists — **three-valued, see §3.7** | `true` | `false` = DKMS 5-fan module did not load, **GPU fan control is gone**. `null` = the check could not be run, which is NOT the alarm |
| DKMS built for running kernel | `/lib/modules/$(uname -r)/updates/dkms/` | present | Next boot loses `pwm5`. The documented kernel-upgrade failure |
| Fan service active | D-Bus `ActiveState` | `active` | Cards are on the EC's curve, which ignores GPU temperature entirely |

### 3.7 Closed vocabularies

Every enumerated value in the contract, in one place. **These are closed sets.** A field
typed as a bare `string` where this section names a vocabulary is a defect, because the UI
switches on these values and an unmatched one falls through silently.

**`ch5Mode`** — `'manual'` | `'ec-auto'` | `null`. `null` means channel 5 is not
enumerated at all. `'ec-auto'` is what `ENODATA` from `pwm5` means, and it is healthy.

**`pwm5Present`** — `true` | `false` | `null`, and the three are genuinely different:

| value | meaning | SAFETY row |
|---|---|---|
| `true` | the `pwm5` node exists | pass |
| `false` | `dell_smm` was read, `pwm5` is absent | **alarm** — the 5-fan module did not load |
| `null` | the check could not be performed (`/sys` not mounted, no `dell_smm` hwmon, `EACCES`) | **unknown, not alarm** |

Two read outcomes that are easy to classify wrongly:

- **The read succeeds but the text is not an integer in 0–255.** `pwm5Present: true`,
  `ch5Mode: null`. **Junk text carries an `errors[]` entry; an in-format but out-of-register
  value does not** — the first says the interface is not what we think it is, the second is
  an impossible reading of a working one (§6.7).
- **`ENOENT` on the read, after a listing that showed `pwm5`.** Folded into "the read failed
  some other way" — one stale poll, not a module-missing alarm. The node can disappear
  between the listing and the read, and a single poll is not evidence of removal.

**`pwm5Present: false` carries an `errors[]` entry naming the missing node**, and it persists
for as long as the module is absent. An alarm with no explanation beside it is not
actionable.

**⚠ `pwm5Present` and `ch5Mode` must both be derived from ONE three-valued probe, never
from each other.** `ch5Mode !== null` implies `pwm5Present === true`, but the converse does
not hold, and neither does the reverse: a `pwm5` that exists but returns `EACCES` has
`pwm5Present === true` with `ch5Mode === null`. Deriving one from the other turns an
unreadable sensor into an alarm claiming GPU fan control is gone — invariant 1 inverted, on
the panel that earns this dashboard's existence.

**`health`** — `'ok'` | `'unhealthy'` | `'unreachable'` | `null`. `ok` = HTTP 200.
`unhealthy` = answered but not ready (llama.cpp returns **503 while a model loads**).
`unreachable` = connection refused, reset, or timed out. `null` = not probed this cycle.

**`unitState`** — the six systemd `ActiveState` values, with their severity (§6.3):

| value | severity |
|---|---|
| `active` | ok |
| `reloading` | ok — it is running, and re-reading config is not a fault |
| `activating` | watch |
| `deactivating` | watch |
| `inactive` | alarm |
| `failed` | alarm |

**A unit systemd has not loaded reads `inactive`, not `null`.** The dashboard reads
`ActiveState` over the read-only `Manager.GetUnit`. `systemctl show` uses `Manager.LoadUnit`,
which *loads* the unit as a side effect and is therefore closed to this project by decision
3. For a unit that exists but has never been loaded — `gpu-fan-control.service` on a box
where it was installed and left disabled, this box's documented state from 2026-08-15 to
2026-08-27 — `GetUnit` answers `org.freedesktop.systemd1.NoSuchUnit` where `LoadUnit` would
answer `inactive`. **Report `inactive`, and carry a `dbus` entry naming the unit and the
`NoSuchUnit` reply.** That entry **persists** for as
long as the condition does, on the same terms as `pwm5Present: false` — it explains a row
that would otherwise read as an ordinary stopped service, and an explanation that appears
once and vanishes is worse than none.

This is not inferring a state from an absence. An unloaded unit has no `ActiveState` because
it has no object; `inactive` is the state that loading it would report, and loading is what
creates the object, not what sets the state. The dashboard never asks speculatively — only
about `gpu-fan-control.service` and one unit per discovered `<i>.env` — so "systemd has no
record of this unit" about a unit the box's own configuration declares is itself the news.

**`unitState: null` means the state could not be READ, and nothing else.** The only routes to
it: the bus socket was unreachable, the conversation failed or was cut short by its bound,
the reply was not a D-Bus message, or `ActiveState` came back as a seventh value. It carries
**no severity**, renders `—`, and always has a `dbus` entry. **A unit that is not running is
never `null`.**

**GPU throttle mask** — `clocks_throttle_reasons.active` is a bitmask. Decode and render
by name, never as a bare hex string:

| bit | name | treatment |
|---|---|---|
| `0x1` | GPU idle | neutral |
| `0x2` | applications clocks setting | neutral |
| `0x4` | **SW power cap** | **neutral — the normal 250 W cap, never styled as a warning** |
| `0x8` | HW slowdown | **alarm** |
| `0x20` | **SW thermal slowdown** | **alarm** |
| `0x40` | **HW thermal slowdown** | **alarm** |
| `0x80` | HW power brake slowdown | alarm |
| `0x100` | display clock setting | neutral |

§6.3's alarm set is **`0x8`, `0x20`, `0x40`, `0x80`** — the three thermal bits plus the
power brake, which is an external electrical fault and no less serious. All four raise
§6.4's banner. Render each active bit as code + name (`0x20 sw thermal slowdown`); a mask
of `0` or `0x4` alone carries the note "normal, not a fault".

**A bit not in this table is rendered `0x<hex> unknown` and treated as WATCH.** NVML has
values this table does not list (`0x10` among them) and may gain more. Silently dropping an
unrecognised bit is exactly the failure that decoding the mask exists to prevent: it would
report a throttling card as unthrottled. Watch rather than alarm, because an unknown reason
is not evidence of a thermal event.

**⚠ `errors[].instance` — an OPTIONAL subject, ruled 2026-09-08 (10b-S-G).** §6.5 requires that
one `llama-server` instance's row show *"the unit state and the reason"* while the other is
unaffected. That is a **structural** requirement, and until now §4's error shape could not express
it: an entry carries a `source` and no subject, so a panel could only attribute a reason by
**reading the message text** for a unit name, an `<i>.env` path or a port. That heuristic was
implemented and tested and it is still a heuristic — it mis-attributes silently the moment a
collector rewords a message, because a substring match cannot fail loudly. An entry that concerns
one instance now names it. It is **optional**: most sources have no instance, and an absent field
means the entry concerns the panel rather than one row.

⚠ **This is a §4 wire change, and it is NOT O19's kind.** O19 renamed a field, so an old server
produced a snapshot the new client refused. `instance` is **added and optional**, so an old
server's snapshot still validates and simply carries no instance — every entry then falls back to
the panel-level rendering, which is the same behaviour as a source that genuinely has no subject.
**The redeploy is required for the feature to work, not to avoid a refusal**, and that distinction
matters: it means this change can land ahead of the deploy without breaking the running box, which
O19 could not. The deploy is already scheduled for step 10's completion.

**`errors[].source`** — a **closed vocabulary**, because §6.5 requires matching an error to
the figure it explains: `nvidia-smi`, `coretemp`, `proc-stat`, `proc-meminfo`,
`proc-loadavg`, `proc-uptime`, `proc-net-dev`, `net-operstate`, `proc-cpuinfo`,
`hostname`, `dell-smm`, `dbus`, `llama-env`, `llama-health`, `llama-models`, `statvfs`,
`ufw`, `dkms`.

`net-operstate` is deliberately separate from `proc-net-dev`: the link state comes from
sysfs and the throughput counters from `/proc`, so folding them together would attribute a
failed link read to the byte counters and point the UI at the wrong figure.

**Safety field names** on the wire: `ufwEnforcing`, `pwm5Present`, `dkmsForRunningKernel`,
`fanServiceState`. The last is the unit's `ActiveState` string, **not** a boolean — the
SAFETY panel shows which state, and a boolean would collapse `failed` and `inactive`.

---

## 4. API surface

Three endpoints. That is the whole server.

### `GET /api/telemetry`

Returns the full snapshot. Requires a valid session cookie; returns 401 otherwise.

```jsonc
{
  "ts": "2026-09-06T14:02:11.482Z",
  "hostname": "ai-server",
  "standing": ["ufw_enforcing", "unit:llama-server@1.service"],
  "gpus":    [ { "index": 0, "tempC": 66, "powerW": 247.1, ... } ],
  "host":    { "cpuPct": 18.4, "cpuTempC": 42, "memUsedGiB": 12.1, ... },
  "cooling": { "fan5Rpm": 4308, "ch5Mode": "manual", "ch5Pwm": 255, ... },
  "serving": [ { "instance": 0, "port": 8080, "unitState": "active", ... } ],
  "storage": { "root": {...}, "home": {...}, "net": {...} },
  "safety":  { "ufwEnforcing": false, "pwm5Present": true,
               "dkmsForRunningKernel": true, "fanServiceState": "active" },
  "errors":  [ { "source": "coretemp", "message": "no hwmon named coretemp" } ]
}
```

**`standing` is configuration, not a reading, and it is the only such field.** §6.4 puts the
list in `/etc/ai-dashboard.env` and applies the suppression in the browser, and the snapshot is
the only authenticated, validated, per-poll payload that reaches the browser — so the list rides
it rather than earning a fourth endpoint. It is **echoed verbatim and never parsed
server-side**: the ids are validated in the client by the same code that would have read the
file, so §6.4's *"an id that matches no kind is reported as unknown"* stays a client-side fact
and one malformed entry cannot fail a poll. Unset `STANDING` sends `[]` — the safe direction,
since a missing list can only make the dashboard **louder**. **The key is required, like every
other key in this contract.** **It is never rendered on the server-side shell** — §5 leaves `/`
reachable with a revoked cookie, and the list of alarms an operator has chosen to silence is not
something to hand an unauthenticated caller.

**⚠ A change to `STANDING` takes effect on the next container RESTART, not on the next poll.**
This paragraph said "the next poll" until 2026-09-07, and it was not achievable: §2.5 passes the
env file with `docker run --env-file`, which reads `/etc/ai-dashboard.env` **once, at container
creation**, and copies the values into the container's environment. A running process does not
track the host file afterwards, so a server that re-read the value on every sample would answer
the same value every time while implying it might not — which is exactly what the implementation
did, with a comment saying otherwise. The value is now read **once, at construction**.

The client half is unchanged and *is* per-poll: `standing` rides every snapshot and the browser
judges the ids on each one, so a *changed snapshot* changes the suppression immediately. Only
the server cannot produce a changed snapshot without a restart. **If a live edit is ever wanted,
the mechanism has to change** — bind-mount the file and read it per sample, with its own
monotonic budget and a place in this section's outstanding-call rule — **not merely re-read
`process.env`, which would still be a snapshot.**

**`errors` is part of the contract, not an afterthought.** A partial snapshot is the normal
case on this machine, and the UI must be able to say *which* reading failed rather than
rendering a plausible-looking zero.

**Server-side cache: 2 s, and it caches the IN-FLIGHT PROMISE, not only the finished
result.** Multiple browser tabs must not each fork `nvidia-smi`. The cache floor is below the
5 s **default** cadence, so a client at the default or slower never receives a repeated
snapshot, while ten clients still cost one sample. **At the 1 s selection a client will always
receive the same snapshot two or three times in a row, and at 2 s occasionally**, with an
identical `ts` — which is correct, and is exactly what stops five tabs at 1 s from forking
five `nvidia-smi` a second. Callers arriving while a sample is in flight join it.

**`ts` is the instant the poll BEGAN** — not when it finished, and not when any particular
counter was read. It is stamped once, at the start, and the same reading times the 2 s window,
so the age indicator and the window the server serves from cannot disagree. Stamping at the
end would make a 6 s poll's snapshot look up to 6 s fresher than its readings are;
start-stamping can only over-state age, which is the direction every reading here must err in.

**⚠ The poll's ceiling is per collector, and a collector that has not answered is not asked
again.** Five of the six collectors carry a monotonic budget of their own (§6.7) and are
guaranteed to settle. `collectHost` does not — its `/proc` and `/sys` reads carry no bound —
so it alone carries a **6 s ceiling at the assembly**. **This is a rule, not a census:
*every* collector that cannot guarantee it settles carries the assembly ceiling, and any
collector added later either brings its own monotonic budget or inherits this one.** Today
`collectHost` is the only member, equal to the poll's blessed worst case,
so it can neither shorten a healthy poll nor pre-empt a collector that is merely slow. A
tighter ceiling would fire during thread-pool contention *caused by another collector* and
blank nine host figures on another subject's account, which §6.7 forbids.

**A ceiling settles the request; it does not reclaim the work.** `readFile`, `readdir` and
`statfs` run on libuv's thread pool and an in-flight one cannot be cancelled: measured on this
project, an `AbortSignal` neither frees the worker nor settles the read's own promise, and
**four concurrently blocked pool operations block every subsequent read in the process
indefinitely**. The ceiling must therefore be paired with the rule that makes it safe: **at
most one call to a given collector may be outstanding at a time.** A poll that finds one
outstanding does not issue a second — it uses that collector's "could not report" collection
for this poll. A source that stops answering then costs a bounded number of workers, once,
instead of one more on every poll for as long as the container runs, and it recovers on the
first poll after the call returns.

**⚠ The ceiling goes OUTSIDE the gate, not inside.** `oneAtATime(withHostCeiling(c))` looks
equivalent and is not: the gate would release its slot when the ceiling's race settles at 6 s
rather than when the underlying read returns, so the next poll issues another call into the
same wedged source — reintroducing exactly the unbounded leak the pair exists to prevent.

**Neither half ships without the other.** With neither, a wedged collector wedges the whole
snapshot and the in-flight cache stops all further work: the endpoint dies, but nothing
accumulates. **A ceiling alone would be worse than nothing** — it restarts the polling and
lets blocked reads, orphaned `nvidia-smi` processes and abandoned sockets accumulate without
limit, turning a dead endpoint into a leak that looks healthy.

**The outstanding-call rule is also what closes §3.1's accumulation.** The in-flight cache
stops ten tabs forking ten `nvidia-smi`; it does not stop *successive* polls from doing so,
because a wedged `nvidia-smi` is abandoned at its 4 s bound, the sample settles, the 2 s window
has already elapsed, and the next poll forks another. One outstanding call per collector is
what makes §3.1's sentence true.

**A ceiling and a skipped call are reported as that collector's own failure, never as the
route's.** Both yield the collection that collector produces when it learns nothing — every
reading `null`, one `errors[]` entry per §3.7 source that collector can file, naming the
bound. **No nineteenth `errors[].source` is introduced.** A skipped call mints no verdict of
failure: `serving: null` stays *"which instances exist is unknown"*, and no instance is marked
`unreachable` or `inactive` by a call that was not made.

**Sampling is per-request, not a background loop.** With no clients connected the container
does no work at all — it must never itself become load on a box whose thermal margin is
the thing being watched.

### `POST /api/session`  ·  `DELETE /api/session`

Login and logout. See §5.

---

## 5. Authentication

Deliberately minimal — one shared password, matching how this box is actually used.

- Password supplied at deploy time as a **scrypt or argon2id hash** in an env file
  (`/etc/ai-dashboard.env`, `root:root` 0600, bind-mounted read-only). Never a plaintext
  password in the unit file, never in `docker run` arguments — the same reasoning behind
  `--api-key-file` rather than `--api-key`, since arguments are visible in `ps`.
- `POST /api/session` verifies, sets an **httpOnly, SameSite=Strict, 30-day** session
  cookie signed with a server secret from the same env file.
- **Rate-limit login globally — deliberately NOT per IP.** §2.5 runs the container with
  `--network host` and no reverse proxy, so there is no client address to key on: Next fills
  `X-Forwarded-For` from the socket **only when the client omits it**, and an App Router route
  handler is never handed the socket. Nothing legitimate sets that header on this deployment,
  so it is not merely untrustworthy — it is *meaningless*, and keying on it is **worse than not
  keying at all**: an attacker can rotate it to escape their own limit **and** forge the
  operator's value to occupy theirs, while the operator can do neither in return. **One bucket
  for the whole service: five attempts per minute, then a 60 s lockout.** Being a single bucket
  is also what keeps the password-hashing queue bounded (§5.2). The cost is that any LAN host
  can hold the login screen closed for 60 s at a time — but the per-IP form has that property
  already, at the same price, so nothing is given up. **If a reverse proxy that overwrites
  `X-Forwarded-For` is ever put in front of the container, a per-source key becomes
  implementable and this paragraph should be revisited — not before.**
- **No TLS.** Plain HTTP on the LAN, so the password crosses the wire in the clear. Stated
  explicitly so it is a choice rather than an oversight. Do not reuse a password of any
  consequence here. If this ever leaves the LAN, that decision must be revisited first.
- **A session check that cannot reach a verdict DENIES.** A cookie that is missing,
  malformed, truncated, or whose signature cannot be verified — **and any error raised while
  deciding** — is **401**, never 500. §5.2 routes a 401 to `/login`; a 500 puts the client on
  §6.7's failed-poll path instead, where it backs off, greys the header dot and names a server
  failure, so the user is never sent to sign in and never recovers without clearing the cookie
  by hand. The 401 carries **no body**: the status is the whole contract, and the client tells
  *expired* from *never authenticated* using its own state.
- **`POST /api/session` requires `Content-Type: application/json`** and refuses anything else
  with the same empty 401 as a wrong password. Without that requirement the request is a CORS
  *simple request* needing no preflight, so any page the operator's browser happens to load
  could spend the login rate limit and queue password hashing on the dashboard's behalf.
  **The media type is compared ignoring parameters and case** — `application/json;
  charset=utf-8` is accepted, because clients add that parameter unbidden and rejecting it
  would break the real one. **This check runs FIRST, before the rate limit and before the body
  is read**, so a refused request costs neither a slot in §5's global budget nor any hashing
  work — otherwise the check meant to stop a cross-origin page from spending the budget would
  itself be the thing spending it.
- **The login screen is the only *page* reachable unauthenticated**, and exactly two other
  things are: `POST`/`DELETE /api/session`, because there is no other way to obtain or discard
  a session; and the static assets under `_next/static`, `_next/image` and `favicon.ico`,
  because the login screen is a client component and its own JavaScript is served from there.
  **The gate's matcher must exempt all three, and nothing else.** No route that returns a
  reading is ever exempt.
- **`DELETE /api/session` invalidates the session on the server, not only in the browser.** A
  signed cookie is stateless, so clearing the browser's copy does nothing to a copy someone else
  holds; logout records the session id in memory and every `/api/*` check consults it. **On the
  same terms as the rate limiter, that record is lost on container restart** — a cookie logged
  out of before a restart is live again afterwards until its own 30 days run out. Accepted for
  the same reason: no writable store. **The gate in front of pages makes the cryptographic
  verdict only** (signature, shape, thirty days); the revocation check belongs on every route
  that returns a reading, because a proxy cannot honestly read process-local state. The
  consequence — a revoked cookie can still fetch the HTML shell — is acceptable **only while
  that shell carries no telemetry and no secrets**.
- **There is no way to invalidate a session you do not hold.** Logging in again mints a new
  session and disturbs no other; `DELETE` revokes only the session presenting itself; and §5.1
  forbids `install` from rotating `SESSION_SECRET`. So a captured cookie has no in-product
  remedy: the procedure is to rotate `SESSION_SECRET` by hand and restart the container, which
  invalidates every session at once. Written down here because there is no button for it.

### 5.1 Credentials are set by the install script, never by hand

- `dashboard.sh set-password` **prompts** (never takes the password as an argument, which
  would land in shell history and `ps`), hashes with **scrypt**, and writes the hash to
  `/etc/ai-dashboard.env`.
  **⚠ Use `hashPassword()` from `lib/auth/scrypt.ts` as the producer; do not reimplement the
  encoder.** §5 permits scrypt *or* argon2id and the server implements **scrypt**, in the
  exact six-field encoding §5.1's sibling paragraph describes. `parseScryptHash` returns
  `null` for anything else — **including a perfectly correct argon2id hash** — and `null` is
  not an error: it is a clean, empty 401 on every login attempt, with nothing logged anywhere,
  because §5 deliberately logs nothing about authentication. The symptom is *a dashboard that
  will not open and will not say why*, and this sentence used to point straight at it.
- `dashboard.sh install` generates a 32-byte random `SESSION_SECRET` into the same file if
  one is not already present, and **never overwrites an existing one** — rotating it would
  log out every open session. Same principle as `install` never repointing a live
  `llama-server` model.
- Env file keys: `PASSWORD_HASH`, `SESSION_SECRET`, `STANDING` (see §6.4).

### 5.2 The login screen

One route, `/login`. It is the first thing anyone sees, so it is specified rather than
left to fall out of the implementation.

| Element | Content |
|---|---|
| Identity | `ai-server` wordmark, and `192.168.4.71:8090` beneath it |
| Field | One password input. `type=password`, autofocused, `autocomplete="current-password"` |
| Submit | `Unlock` |
| Disclosure | **"Plain HTTP on the LAN — this password crosses the wire in the clear."** Stated on the screen itself, not buried in a doc |
| Absent | No username, no "remember me" (the cookie is already 30 days), no password reset, no account creation |

States:

| State | Behaviour |
|---|---|
| Idle | Field focused, submit enabled |
| Submitting | Submit disabled, field stays readable |
| Wrong password | `Password not recognised.` The field is **not** cleared — retyping a long password because of a typo is worse than the marginal shoulder-surfing risk on a LAN box |
| Rate-limited | `Too many attempts. Try again in Ns.`, counting down, submit disabled |
| Session expired | Arrived here from an expired session: `Session expired — sign in again.` |
| Could not reach the dashboard | **A response that is neither a success nor a refusal is not a wrong password.** If the request fails at the network, or the server answers with anything other than 302/2xx, 401 or 429, the screen says `Could not reach the dashboard.` and leaves submit enabled. Rendering `Password not recognised.` for a server that never answered sends the operator to retype a password that was correct — and §5's other half, that the server never logs, means there is nothing else for them to look at. **Tone is `warn`, not `error`** (⚠ S30, settled 2026-09-07) — the same as *session expired*, because nothing the operator did is wrong. `error` was rejected for reading as *you did something wrong* in the one state where they did not, and for making this row and *Password not recognised.* visually identical; a toneless row was rejected because every other row in this table has one. **The screen never retries on its own**: submit stays enabled and the operator decides, since an automatic retry against a dead container is indistinguishable from a scripted guess and would spend §5's global budget |

**The countdown is server-supplied, never client-invented.** A 429 carries a
`Retry-After` header and the screen renders its countdown from that value. A client-side
timer would drift, and §6.7 pauses timers on a hidden tab — so a resumed tab could show
`0 s` while the server still refuses. When the countdown reaches zero the client re-enables
submit but does **not** assume success: the next 429 simply restarts it from a fresh
`Retry-After`.

**Rate limit:** 5 attempts per minute **for the whole service**, then a 60 s lockout — §5 says
why the limit is global rather than per source IP. Counted in memory; it resets on container
restart, which is acceptable for a LAN service and avoids giving the dashboard a writable store
it otherwise does not need. **The limit is also the only bound on password-hashing work**: it
is checked before the request body is read and long before the KDF, and one bucket is what keeps
the number of queued hashes bounded by the limit itself rather than by the number of distinct
values a caller cares to invent.

**On success:** 302 to `/`. **On expiry:** every `/api/*` returns 401, and the client
routes to `/login` with the expired message rather than continuing to display a snapshot
that is no longer being refreshed.

---

## 6. Interface

### 6.1 Grid

Target layout — the single-screen wall panel. **This supersedes every earlier sketch**;
it is the authoritative placement and maps 1:1 onto CSS grid columns and rows.

```
header ┌──────────────────────────────────────────────────────────────────────┐
       │ ai-server · up 2 d 02:01    ● 1 warning   14:47:31 EDT · 2 s ago     │
       │                     5 s ▾   30 min ▾   ⟳   ❙❙   │   ⏻ logout        │
       └──────────────────────────────────────────────────────────────────────┘

              column 1         column 2    │    column 3        column 4
            ┌──────────────────────────────┬──────────────────────────────┐
      row 1 │ GPU 0                        │ GPU 1                        │
            ├──────────────────────────────┼──────────────┬───────────────┤
      row 2 │                              │ CPU          │ MEMORY        │
            │ COOLING                      ├──────────────┼───────────────┤
      row 3 │ (spans rows 2–3)             │ SAFETY       │ STORAGE & NET │
            ├──────────────────────────────┼──────────────┴───────────────┤
      row 4 │ SERVING                      │ SESSION EVENT LOG            │
            └──────────────────────────────┴──────────────────────────────┘
```

Two placements that earlier drafts got wrong, and that are settled here:

- **COOLING spans rows 2–3 in columns 1–2**, because its shared-time chart needs the
  height. Auto-placement leaves a column of dead ground under the two short panels.
- **The fan service state belongs to COOLING, not SERVING.** SERVING is `llama-server`
  instances only. (Decision 24.)

Breakpoints, since it must survive every display:

| Width | Behaviour |
|---|---|
| ≥ 1600px | Above, with sparklines promoted to full line charts inside the GPU cards |
| 1280–1599px | Above exactly. The design target |
| 900–1279px | 2 columns: GPU cards stack side by side, the four small panels become 2×2, storage and safety stack below. Scrolling begins here and that is accepted |
| < 900px | 1 column, panels in priority order: GPUs → cooling → safety → serving → host → storage |

The "no scroll" promise holds at ≥1280px **wide and ≥1024px tall**. Below either bound,
legibility wins, so a 1280×800 display does scroll.

**⚠ Measured, not estimated — rewritten 2026-09-09.** The earlier sentence here ("~1026px tall
at 1280 wide … fits comfortably at 1920×1080") was never measured, and the first build of this
grid overflowed the fold by **356 / 418 / 362 px** at 1280×1024 / 1600×1024 / 1920×1080 with
healthy telemetry. The grid was not the cause. `MOCK.html` — this same four-row, nine-panel
grid — **fits at all three** (healthy: ~19 / ~90 / ~159 px to spare; per panel at 1920: GPU 220,
COOLING 472, CPU 204, MEMORY 195, SAFETY 259, STORAGE 182, SERVING 140, LOG 134). The built
panels were 1.8–2.4× those heights because they stacked one reading per 24 px line at a 16 px
base where the mock lays readings out horizontally at 12 px. Three rules fall out of that:

- **`MOCK.html` is the source for FORM** — density, anatomy, type scale, spacing, chart sizes —
  **and for nothing else.** Data, strings and rules come from this document, and where the two
  disagree this document wins (owner, 2026-09-09: *"if the mock says V100 but the data says
  PG500-216 then it is PG500-216"*). The builder specification is
  `pipeline/steps/10-panels-assembly/10e-match-the-mock.md`; its §6 enumerates the places the
  mock's data or rules predate this document.
- **The promise is unconditional on the banner** (owner, 2026-09-09). The page must fit the
  viewport at all three sizes with §6.4's alarm banner pinned, not only when healthy. The
  spec-only density leaves ~250–310 px spare healthy, which is what the degraded states —
  a throttle row, `errors[]` lines under SAFETY rows, a six-alarm banner — spend.
- **Acceptance is a browser measurement, never arithmetic**: `documentElement.scrollHeight ≤
  clientHeight` at 1280×1024, 1600×1024 and 1920×1080, with and without the banner, on the
  real app under fabricated healthy telemetry
  (`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` measurement 9 and
  `mocks/check-density.mjs`).

**Rulings on what the mock draws that this document does not require (owner, 2026-09-09; 10e's
§9 questions).** Declined, so not built: the min/max/now caption under traces (OQ-1); per-panel
note footers (OQ-2); count chips such as `1 of 4 failing` — a panel's chip is its severity word
only (OQ-3); a paused banner — the header pill and the counting age are the announcement (OQ-5);
the `engage 55` / `EC auto 2210` reference lines — only §6.3's 70/80 are drawn, and only on the
GPU sparkline's ≥1600 form (OQ-6). The SESSION EVENT LOG renders **no head chip** — it has no
severity and no reading that can fail, so neither a hatched `—` nor a debounce constant belongs
there (OQ-4). The CPU panel **keeps both traces** — utilisation and temperature — so its height
target is the mock's plus one sparkline (OQ-7; see the CPU entry in §6.2). The `standing` pill's
form (OQ-8) is recorded for the loop that owns §6.4's SAFETY rendering.

⚠ **The promise is about the PAGE, not about every component** — clarified 2026-09-08. A
component whose content is unbounded by nature may scroll inside its own fixed-size box: the
session event log below is specified that way, and §6.2's table view is ruled the same. What
the promise forbids is the *grid* growing past the viewport and the reader having to scroll
the dashboard to see a panel.

⚠ **"Its own fixed-size box" means a box the PANEL already has — ruled 2026-09-09 (10f-Q1).**
The table view had been bounded at `40vh` per component, and five are reachable at once, so a
healthy page with them open overflowed by ~851 px. **A table view replaces its chart inside the
chart's own box and scrolls there**; opening one changes no panel's height, and the page grows by
zero. The `--table-scroll-max: 40vh` stopgap (SCOPE 2.5f) is retired by that rule.

⚠ **The remaining unbounded terms are bounded the same way — ruled 2026-09-09 (10f-Q3 and
10e-Q2).** The GPU card's throttle line is a **one-line well** like the notes blocks (its chips
scroll within it), so a notable mask costs a fixed height rather than +44 px per card. To buy the
margin back, a `roomy` notes well is **three lines (46 px), not four (60 px)**. Acceptance after
this: the all-sources-explained page with a two-alarm banner (measured 1 px over at 1600×1024
before the ruling) fits at all three viewports, re-measured.

⚠⚠ **THE GRID ITSELF IS BOUNDED — ruled 2026-09-10 (10g-A1), and this supersedes the
term-by-term approach above.** Four loops bounded one term each — notes blocks, the throttle
line, table views, the banner — and each time a new unbounded term appeared. Measured on the
all-sources-explained page, which had 6 px of spare at 1600×1024, **any one** of these ordinary
changes broke the fold: a notable throttle mask (−16), §6.3's four alarm bits (−40), **a third
`llama-server` instance, which §3.4 requires to work** (−42), or a `model` that is a path (−19 at
1280). Together: −113 / −64 / −8. Bounding terms one at a time is not convergent, so:

**Every panel has a maximum height derived from its grid row, and its body scrolls inside that
height when the content exceeds it.** The page then fits at every §6.1 viewport **for any
telemetry whatsoever** — no fixture, no compound case, no future field can break it — and the
per-term wells above become a legibility choice rather than the thing holding the promise up.
This is 10d's deferred "stage 2 — bound the grid", now taken. Consequences to honour:

- **The head of a panel never scrolls away**: title, subtitle and chip stay pinned; only the body
  scrolls. A reader must always be able to see which panel is which and what its severity is.
- **A panel that is scrolling says so** — the same fade and `… N more` affordance as a well.
- **The row model still governs**: rows 2 and 3 size independently, so a max-height is per panel,
  computed from its row's share, not one global number.
- **Acceptance is a browser measurement on hostile telemetry**, not on a healthy fixture: the
  every-source-explained page with a notable throttle mask, four alarm bits, three serving
  instances and path-valued models must fit at 1280×1024, 1600×1024 and 1920×1080. ⚠ **Every
  browser fixture in this project hard-codes `throttleReasons: '0x…04'`, which is not notable**,
  so the throttle line has never appeared on a measured page. The fixtures are part of the work.

⚠ **A well whose content overflows says so — ruled 2026-09-09 (10f-Q4/Q5).** The wall panel
has no pointer, so a bounded well draws a **bottom fade and a small `… N more` marker** whenever
`scrollHeight > clientHeight`, and nothing when it does not. The heights stay as budgeted; the
full text remains reachable by scrolling the well and in the event log. This is the one place
the UI adds copy that is not a reading, and it is a count, never a sentence.

⚠ **The promise holds on a DEGRADED page too, and `errors[]` blocks are bounded** — owner's
ruling 2026-09-09 (10e-Q1). Nothing in the density build capped a panel's `errors[]` notes or a
row's explanation, so a page on which every collector has failed missed the fold by 27 px at
1280×1024 and 49 px at 1600×1024, and this box's own 152-character DKMS failure message alone
costs 65.6 px in a 285 px column against the 14.2 px budgeted. The ruling: the promise is
**unconditional on telemetry**, and each panel's notes block (`PanelNotes`, and a `StatusRow`'s
`detail`) becomes a **fixed-height scroll box** in the same way the session event log is — the
messages stay whole and readable by scrolling within the panel, and the grid never grows. The
height per panel is a builder decision measured against §2.11's budgets; acceptance is measurement
9 of `measure-breakpoints.mjs` passing at all three viewports on the **all-collectors-failed
fixture as well as the healthy one**.

### 6.2 Panels

**Header** — hostname, **`uptimeSec` beside it** in §3.2's four forms, an aggregate status
dot, the snapshot timestamp and the age of the last successful snapshot, then four controls:
the **cadence selector** (1/2/5/10/30 s, default 5), the **window selector**
(10 min / 30 min / 2 h, default 30), **refresh now**, and **pause/resume**. A **logout**
control sits at the end, visually separated from the four.

**⚠ That is the whole header, and the list is exhaustive** (settled 2026-09-07, because four
places described it and none agreed). In particular it carries **no IP address** and **no
kernel release**. `MOCK.html`'s meta line — `192.168.4.71 · kernel 7.0.0-30 · up 2 d 02:01` —
is a mock-only rendering; the mock is a reference, never a source. The address is not on §4's
snapshot at all and would have to come from `window.location.host`, and the kernel has a better
home: the `dkms` `errors[]` entry already names the running release, so §6.5 puts it beside the
SAFETY row that is actually about it.

⚠ **`host.kernel` is therefore carried on the wire and rendered nowhere, deliberately.** §1
says long-term trending is *"Prometheus scraping the same JSON endpoint, not a feature bolted
onto this"* — so §4's snapshot is a contract for consumers beyond this UI, and provenance in a
raw `/api/telemetry` response is worth one string. It is **the only field with that
justification**; a second one is a defect, not a precedent.

Two rules on those controls:

- **None of them touches the server.** They change the browser's timer, its rendering
  window, or its session. "Read-only" is about the box, and it is not weakened by any of
  them.
- **A paused dashboard must announce it loudly** — the aggregate status area switches to a
  paused state and the age indicator keeps counting. A frozen display that looks live is
  precisely the failure the age indicator exists to prevent.

**Paused is a display mode, not a severity.** It is shown *alongside* the aggregate
severity, never instead of it — `❙❙ paused · 6 alarms`, so a paused dashboard cannot hide
an alarm count. **The count is omitted when it is zero** (§9) — the header reads
`● all healthy`, never `● 0 alarms`. Same for a failed poll: `⊘ stale · 6 alarms`. The severity glyph answers
"how is the machine", the mode answers "how current is this"; collapsing the two loses one
of them.

The age indicator is not decoration: when polling fails, the page must visibly stop
claiming to be live.

**⚠ A fourth literal, ruled 2026-09-08 (S-A).** The three above do not cover `severity === null`
with `alarms === 0` — the state of every page load between hydration and the first poll, and of
any poll that produces no banded reading. It reads **`● no readings`**. §9 forbids the obvious
alternative: *"not `'normal'`, which would claim health for a poll that produced nothing."* `● —`
was rejected because the status line already carries `— — · —` beside it and a fourth dash is
mush, and keeping `all healthy` was rejected because it is the dot and the text disagreeing three
pixels apart — precisely what §9's "one reduction" forbids.

**⚠ Invariant 1 governs the pre-first-poll frame, ruled 2026-09-08 (S-D).** In a browser the
client state is non-null from the first render while individual header fields are legitimately
`null`, and those render `—` exactly as they would on poll 400 after a collector fails. The
"before the first poll" rule governs only the frame where the client state **itself** is null,
which the connecting shell covers. There is **one** vocabulary for "no reading", not two: a
second one for "not yet" is the conflation invariant 1 exists to prevent.

**Every panel is `title · subtitle · chip`.** Added 2026-09-07: the panel list below describes
panel **bodies**, and until now said nothing about the head — which left four fields §3 insists
on carrying with nowhere to be rendered.

- **title** — the panel's name, lower case: `GPU 0`, `cpu`, `cooling`, `serving`.
- **subtitle** — **identity, never measurement.** It answers *what am I looking at*, not *how is
  it doing*, so it must not change on a poll except when the machine itself changes. Two panels
  take live telemetry here and the rest take a fixed source label:

  | panel | subtitle |
  |---|---|
  | **GPU 0 / GPU 1** | **`<name> · <bus>`** — the two §3.1 fields, both **raw** |
  | **CPU** | **`<cpuModel> · <cores>C / <threads>T`** — `cpuModel` trimmed per §3.2 |
  | cooling | `dell_smm · channel 5 = FAN_HDD (PCIe/GPU)` |
  | memory · serving · safety · storage & network | a fixed source label — `/proc/meminfo`, `statvfs · eno1` |

- ⚠ **chip — never green over its own em dash. Ruled 2026-09-08 (10b-S-F).** The head is the
  **worst band among the readings that exist**, skipping `null`s — but a panel that would read
  **`normal` while any of its own readings is `—` shows no band instead.** §9's *"a dashboard that
  goes green because it stopped being able to look"* is written about the aggregate, which
  conditions protect; this applies the same refusal one level down, to the specific claim §9
  objects to. It deliberately does **not** drop to no-band for `warn` or `alarm`: a panel must not
  lose its alarm colour because one unrelated field failed to parse. So a red GPU stays red with an
  unreadable SM clock, and a MEMORY panel with `RAM — / —` and a healthy swap shows **no band**,
  never a green tick.
- **chip** — the panel's own severity, from §6.3 on the current reading (§6.4: a cell's colour
  is not debounced).

⚠ **A subtitle is `—` when its field is `null`, like any other reading** (invariant 1). A GPU
whose `name` failed to parse does not lose its subtitle; it shows what it has.

**GPU card ×2** — temperature as the dominant figure with a 30-minute trace behind it,
power against the 250 W cap, VRAM as a bar with absolute MiB, utilisation, SM clock, and
the model currently served on that card (joined from the serving data by instance index).
Throttle reasons appear only when something other than `0x4` is active; the normal power
cap is not news and must not be styled as a warning. ⚠ **Nor as a verdict** — owner's ruling
2026-09-09 (10e-Q3): when another bit makes the line notable, `0x4` is listed beside it as a
**neutral, unbanded code chip** (no colour, no glyph); only the notable bits carry their
severity colour. Colour on this line, as everywhere, is spent on state.

**⚠ The card's name is the driver's own string, and it is not prettified.** `nvidia-smi`
returns **`Tesla PG500-216`** on this hardware — the board code, not the marketing name — and
§3.1 says carry it raw. The subtitle shows exactly that. It will not say "V100" anywhere, and
that is deliberate: there is no lookup table, so the panel cannot go stale against a card the
table does not know, and a driver reporting something unexpected is visible rather than
laundered. ⚠ `MOCK.html` shows `Tesla V100-PCIE-32GB`, **a string this box never produces**.

**⚠ The bus id is rendered RAW, in the full domain form** — `00000000:17:00.0`, not `17:00.0`.
§3.1 already forbids trimming it on the wire; this says the rendering does not trim it either,
so the figure on screen can be compared with `nvidia-smi` and `lspci` without arithmetic, which
is §6.6's whole principle. ⚠ `MOCK.html` renders the short form; the mock is a source for
form only, never for data (§6.1). §6.6 carries the formatting row.

**⚠ The GPU↔instance join is `gpu.index === serving.instance`, and it is a fact about the
deployment that the dashboard cannot verify.** `llama-server@.service` carries
`Environment=CUDA_VISIBLE_DEVICES=%i`, so instance N is pinned to GPU N by the unit template
itself (verified read-only on the box, 2026-09-07). Nothing the dashboard reads says so: it
reads `/etc/llama-server/<i>.env`, which carries `PORT`, `MODEL`, `ALIAS`, `CTX`, `FA` and
`SPEC` and **no device**, and §2.2 mounts no unit files. So the join is correct here and is
**not derivable from the snapshot** — which matters because getting it wrong prints the wrong
model name on a card rather than failing visibly.

Two consequences. **The GPU card labels the model as served by instance N, not as "on this
card"** — the honest claim, and the one the data supports. And **if a third card or a
`CUDA_VISIBLE_DEVICES` that is not `%i` ever appears, this join breaks silently**; closing it
would mean either collecting `nvidia-smi --query-compute-apps` (a new field list, and decision
13 keeps the dashboard out of the inference process) or mounting the unit file. Neither is
worth it today; the assumption is written down here so it is a decision rather than a habit.

**CPU** — package temperature, aggregate utilisation with a trace, and load average. **The
model and the core/thread count are the subtitle**, not body rows: they are identity, they
never change while the box is up, and the panel is short. ⚠ **Both temperature and
utilisation carry a trace** (owner's ruling 2026-09-09, 10e OQ-7): the mock draws one spark
and the wording above attaches the trace to utilisation, but the built temperature trace
stays. It costs the CPU panel one sparkline (38 px below 1600, 50 px at ≥1600, plus the 5 px
gap) over the mock's height, and §6.1's budget carries it.

**RAM** — used against 61 GiB as a bar, plus swap. Swap gets its own row because any swap
in use is meaningful here, where 12 GiB × 2 of host RAM prompt cache is configured.

**⚠ Charts carry a hover layer and a table view, and both are DEFAULTS rather than requests.**
Added 2026-09-07. An HTML/SVG chart is interactive whether or not anyone planned for it, and the
established practice for one is a crosshair + tooltip on a line or area plot, a per-mark tooltip
on bars and dots, and a table view so the numbers are reachable without reading pixels. Earlier
drafts of this section listed exactly four controls and said nothing about any of that, which
made the silence read as a prohibition — it was not one.

The reasoning for accepting them, since decision 7 makes this a **wall panel** nobody hovers:

- **They cost nothing when unused.** A tooltip that never fires renders nothing and occupies no
  space in the grid, so §6.1's no-scroll promise is untouched.
- **The wall is not the only viewer.** The same page is opened on a laptop when something is
  wrong, and that is precisely when reading a value off a 600-point trace by eye is worst.
- **The table view is an accessibility floor**, not a convenience: it is what makes a chart's
  content reachable when colour, size or vision make the marks unreadable — and §9 already
  requires identity never to rest on colour alone.

⚠ **They remain outside §6.2's four controls**, which govern the *dashboard* — cadence, window,
refresh, pause. A tooltip is part of a chart, not a control of the page, and neither writes to
the server (invariant 2).

**⚠ Ruled 2026-09-08, after Q2 built it and found the two requirements incompatible.**

- **On a line or area plot the crosshair's own tooltip discharges the per-mark requirement.**
  They cannot both be reached: a full-body crosshair needs hover zones tiling the plot, and
  those zones necessarily occlude every mark beneath them. The crosshair tooltip is the more
  useful of the two on a 600-point trace — it reports every series at one instant — so it is
  the one that stays. **The "per-mark on bars and dots" clause governs bar and dot charts**,
  which `components/` does not yet contain; it becomes live when one is built, and it is not
  unmet in the meantime. A per-mark `<title>` may still be emitted on discrete marks: correct
  markup that costs nothing and becomes reachable if paint order ever changes.
- **The table view scrolls within its own container** — `max-height` plus `overflow-y`. §6.1's
  no-scroll promise governs the **page**, not a component: this section already specifies the
  session event log as "a compact scrolling list". The alternative was capping or decimating
  rows, and that was rejected because a decimated table is no longer a complete substitute for
  the chart — which is the whole ground on which the table is an accessibility floor, and the
  ground on which keyboard parity with the chart was declined.

**COOLING** — `fan5` RPM as the headline, the derived mode (`HIGH pwm 255` / `EC auto`),
`fan2` and the remaining channels smaller, and the fan service state. When the GPU
temperature trace and the fan RPM trace are drawn on shared time, the engage/release
behaviour is legible at a glance — which is the single most useful thing this panel can do.

**SERVING** — one row per discovered instance: unit state dot, port, model alias, context,
`/health` result. No token rates (decision 13).

**STORAGE & NETWORK** — `/` and `/home` as bars with absolute figures, `eno1` throughput
with direction, link state.

**SAFETY** — the four checks from §3.6 as a compact list with pass/warn/fail glyphs. This
is the panel that earns the dashboard's existence, so it does not get hidden behind a tab.

**⚠ Each row carries its `errors[]` explanation beside it, and that is not decoration.** §3.7
requires it in as many words — *"`pwm5Present: false` carries an `errors[]` entry naming the
missing node … an alarm with no explanation beside it is not actionable"* — and the same is
true of the `NoSuchUnit` entry and of the DKMS check, whose entry **names the running kernel
release**, which is where that string belongs. The text comes from §6.5's `source` match, not
from copy written here.

### 6.3 Colour and thresholds

Dark instrument panel. Near-black ground, tabular monospace numerals, hairline rules.
Colour is spent almost entirely on state, so a single amber cell is the only thing pulling
the eye on an otherwise neutral screen. Chart series get restrained hues; GPU 0 and GPU 1
must be distinguishable without relying on colour alone (dash pattern or label).

**Where a boundary is named by two bands** — `≤ 90 % normal` next to `90–95 % watch` names
90 twice — **the less-severe clause wins**: 90 % is normal. Strict inequalities (`> 95 %`,
`< 3000`) are exact. This one sentence pins VRAM 90, RAM 85 and disk-free 15, which would
otherwise each be a coin flip.

Thresholds, from measurements on this machine rather than generic defaults:

| Metric | Normal | Watch | Alarm | Basis |
|---|---|---|---|---|
| GPU temp | ≤ 69 °C | 70–79 °C | ≥ 80 °C | Spec 83, slowdown 87. Production mean 66.2, worst measured 75.3 |
| GPU throttle | no bit whose §3.7 treatment is `alarm`, and no unlisted bit — so `0x1`, `0x2`, `0x4`, `0x100` alone are normal | any bit not in §3.7's table | `0x8`, `0x20`, `0x40`, `0x80` (§3.7) | Thermal throttle has never been observed here; if it appears, something changed |
| GPU VRAM | ≤ 90 % | 90–95 % | > 95 % | 128K ctx sits at ~81 %; 256K is a confirmed OOM |
| CPU temp | ≤ 79 °C | 80–89 °C | ≥ 90 °C | Tjmax 100 |
| RAM | ≤ 85 % | 85–95 % | > 95 %, or swap > 1 GiB | |
| `fan5` while **engaged** | ≥ 3500 RPM | 3000–3499 | < 3000 | Engaged means `ch5Mode === 'manual'` **and** `ch5Pwm ≥ 192` (the HIGH quantisation band). HIGH measures 4300–4470; a large shortfall means a failing fan or a lost hub |
| `fan5` absolute | 1–5100 RPM | — | **`0` RPM, or > 5100 RPM** | Two-sided, and unconditional. Nominal max 5100; **14451 RPM once hung POST**. `0` is the other impossible end: no state this channel can be commanded into produces it — LOW is 989, EC auto measures 1900–2250, HIGH 4300–4470, and `validate_curve` refuses a curve that would write OFF |
| `fan1`–`fan4` stopped | ≥ 1 RPM | — | **`0` RPM** | Every one of these headers has a fan attached, and `fan1` is the CPU heatsink fan. `0` is a stopped fan or a lost tach; `null` is a channel that did not enumerate and carries no severity. Idle readings run as low as 604, so `0` is the only value on these channels that can be judged. **No upper row** — the EC does not modulate them under GPU load and no nominal is documented. **An em dash on channels 1–4 always has an `errors[]` entry behind it**; one on channel 5 may not, because channel 5 has a documented absent state and these do not |

**⚠ The absolute row is unconditional — it fires in every mode, including `ec-auto` and
whenever `ch5Mode` is `null`, and including when the duty is unreadable.** The engaged band
needs `ch5Mode` and `ch5Pwm` and yields no severity without them; the absolute row needs only
the tach. It is **two-sided** because the tach has two impossible ends. `> 5100 RPM` is the
early warning for the condition that once hung POST. `0 RPM` is a stopped fan or a lost tach
— §6.5 already states that meaning, and this row is where §6.3 gives it a colour. Discarding
either because an *unrelated* field failed to parse would trade a real alarm for tidiness.

Note what `fan5_input` actually is: the tach of the **reference fan on port 1 of the hub**,
not of the GPU shroud fans. A `0` there says the channel's one instrument has failed, which
is why it is an alarm; a healthy reading is not by itself evidence that the cards are getting
air.

**⚠ `0` is a reading; `null` is not this row.** `fan5Rpm: null` is a channel that produced no
reading: it carries **no severity at all** and renders `—` (§6.5, invariant 1). Only the
numeral `0` alarms. In JavaScript `-0 === 0`, so a corrupt `-0` is correctly treated as a
stopped fan — the comparison must be `===`, never `Object.is`, which would let it through.

**⚠ Zero is the only low reading that alarms, and it is the only one that can be.** There is
no band between `0` and the engaged floor. LOW (989 RPM) is a state the driver can
legitimately be in; EC auto measures 1900–2250 rather than a stable 2210 (1922 on the box
today, 1915 and 1903 in step 4's captures); channel 3 has been observed at 604, below its own
LOW preset. Any threshold in that range would fire on a healthy box, and this table's
thresholds are *from measurements on this machine rather than generic defaults*. `0` is safe
because the channel never passes through it: an engage takes the tach **up**, from ~2210 to
4300+.

**⚠ The engaged band alarms for the whole spin-up after an engage, and that is not a fault.**
`pwm5` reads back the commanded duty immediately while the tach climbs from ~2210 to 4300+,
so `fan5` bands **alarm** across the ramp (measured: duty 255 with the tach at 2210 →
`alarm`). §6.4 deliberately does not debounce cell colour, so the cell **will** flash red on
every engage — and on this box an engage happens whenever the GPUs cross 55 °C. Whether it
also *banners* depends on whether the ramp exceeds §6.4's 10 s hold, **which has never been
measured here**: `CLAUDE.md` records only the ~50 s spin-down. Measuring it requires
commanding an engage, so it stays open rather than being guessed.

**⚠ The engaged band applies ONLY while engaged.** In EC auto the channel's healthy reading
is ~2210 RPM, which is `< 3000` — applying the engaged band there would raise a permanent
alarm on a perfectly healthy box. In `ec-auto`, and whenever `ch5Mode` is `null`, the only
rule that applies is the absolute one.

| Disk free | ≥ 15 % | 5–15 % | < 5 % | |
| ufw enforcing | `yes` | `null` — `ufw.conf` unreadable | `no` | Alarm severity. **`no` is not this box's state today** — `ufw.conf` reads `ENABLED=yes` as of 2026-09-06 — so this row bands normal and §6.4's standing machinery has no live subject. `null` is watch, matching `pwm5Present`. ⚠ The check reads `ENABLED=` only; `/etc/ufw/user.rules` is root-only, so `yes` means the firewall is on and says **nothing about which ports it allows** |
| `dkmsForRunningKernel` | `true` | `null` — check could not run | `false` | Mirrors the `pwm5 present` row exactly. Without it the SAFETY panel has an uncoloured row and §9's dot cannot see it |
| `/health` per instance | `ok` | `unhealthy` (503, still loading) | `unreachable` | `null` = not probed this cycle, which carries **no severity** rather than a good or bad one |
| `eno1` link | `up` | `dormant`, `testing`, `unknown` | `down`, `lowerlayerdown`, `notpresent` | The seven `operstate` values. `up` is the only healthy one; the middle three are transient or unreportable |
| `pwm5` present | `true` | `null` — check could not run | `false` | Three-valued (§3.7). `null` is *unknown*, never the alarm |
| Any unit | `active`, `reloading` | `activating`, `deactivating` | `failed`, `inactive` — **including a unit systemd has not loaded, which reads `inactive` (§3.7)** | `null` is **not a band**: the state could not be read, carries no severity, always has a `dbus` entry. ⚠ Without this the *Fan service active* row renders an uncoloured em dash for a service installed and never started |

### 6.4 Alarm behaviour

**Sticky banner.** Any alarm-level condition pins a banner to the top naming the condition,
the value, and when it started **as an elapsed form** (`for 2 d 06:00`, ruled 2026-09-08 — see below). It stays until the condition clears — so a 03:00 excursion
is still on screen at 09:00 even though nothing is stored. Multiple conditions collapse
into one banner with a count. Watch-level conditions colour their cell but never raise a
banner.

⚠ **The banner shows what fits and counts the rest — ruled 2026-09-10 (10g-A6), replacing the
scrolling form below.** Once the banner was fixed-height and scrolling, **16 of 21 conditions were
unreachable at 1280**: a wall panel has no pointer, and no scrollbar was drawn. So the banner
renders the conditions that fit its two lines and a **`+N more`** count for the remainder. Nothing
is lost — every condition is in its own panel and in the session event log, both reachable — and
what the banner claims is now what a reader can actually see. The fixed height and the pinned
alarm count below still hold.

⚠ **The banner has a FIXED height — ruled 2026-09-09 (10f-Q2).** Measured, it was unbounded:
65.7 px at two and at six alarms, 92.5 at twelve, 173 at twenty-one at 1280, and every §6.1
budget had been drawn against it as though it were a constant. It is now a **two-line
(~66 px) scrolling box**: the lead with the **count** (`6 alarms`) is always visible, and
conditions beyond the second line scroll within the banner. Nothing is dropped; the page grows
by zero past six alarms. The event log and the panels still carry every condition in full.

**⚠ The "since" is ELAPSED, not a clock time — ruled 2026-09-08 (S-C).** `since 03:00:14` on a
wall panel that has been open since Friday is indistinguishable from six hours ago, and decision 7
makes multi-day the expected case. The banner renders **`for 2 d 06:00`**, using `formatUptime`'s
existing vocabulary — §6.5's stale-age text already puts an elapsed figure in this banner, so the
two agree rather than mixing forms. A date prefix on the clock time was the alternative and was
not taken: it preserves the exact instant but answers "when did it start" when the operator's
question is "how long has this been wrong".

**Standing conditions.** A condition that is genuinely alarm-severity but *known,
persistent and already understood* must not hold the banner open indefinitely — a banner
that is always there is a banner nobody reads. The archetype is `ufw enforcing = no`, which was exactly this between
2026-09-04 and 2026-09-06. **It no longer holds, so this mechanism currently has no live
subject** — worth stating rather than leaving as a stale example, because steps 8 and 10
implement the ledger, the suppression, the once-per-session log and the "returns to full
alarm the moment it changes" rule against a condition that does not presently occur. They
must be proved by fixture and cannot be confirmed against the running box.

Such a condition is declared **standing** in
config; it shows at watch colour in SAFETY with its real severity named in the row, logs
once per session, and never raises the banner. It returns to full alarm behaviour the
moment it *changes* — including when it clears and later regresses. Nothing becomes
standing implicitly; each one is an explicit entry, so the list is short and auditable.

**⚠ "Once per session" is a fact about the SESSION, not about the configuration.** The record
of what has already been logged belongs to the page load and is **not reset** when the
`STANDING` list changes: a condition that has already spent its one line does not get a second
one because an unrelated id was added or removed. §4 makes a `STANDING` change require a
container restart, so in practice the list is fixed for the life of a page — but the rule is
stated for the case where that stops being true, because "reset the ledger when the config
changes" is the plausible wrong reading and it would hand back one extra log line per standing
condition on every edit. A condition that *gains* standing mid-session begins logging once from
then on; one that *loses* it returns to full alarm behaviour, which is already this section's
rule for a standing condition that changes.

**Session event log.** A compact scrolling list of state transitions observed since page
load, newest first:

```
14:07:22  GPU0 crossed 75 °C  (watch)
14:02:10  fan5  EC auto → HIGH   2210 → 4308 RPM
13:58:04  llama-server@1  active
13:57:41  page loaded
```

Transitions are computed in the browser by diffing consecutive snapshots. It is lost on
reload, by design — decision 4. Cap it at a few hundred entries.

**Debouncing.** A metric must hold a new band for **10 seconds of wall time** before it
logs or banners — not for a number of polls. A poll-count rule would mean 2 s at the
fastest cadence and 60 s at the slowest, so the same written rule would behave completely
differently depending on a dropdown. Ten seconds is comfortably inside the ~39 s thermal
time constant, so nothing real is missed at any cadence, while a 79→80→79 flicker stays
quiet. At the 30 s cadence a single sample can therefore confirm a transition, which is
correct: the condition genuinely has held for 30 s.

**What the debounce gates, and what it does not.** The confirmed band feeds **the condition
ledger, the banner, the event log, and §9's dot and count** — everything that makes a claim
about state over time. **A cell's colour is not debounced**: it tracks the current reading
directly, because a cell is showing you the number next to it and a colour that disagreed
with its own figure would be a worse lie than a colour that flickers.

**⚠ A condition's severity is the CONFIRMED band, never a raw per-poll severity.** Feeding
raw severities into the ledger destroys standing suppression permanently on the first
flicker: one `watch` poll at the 79/80 knee sets the "changed" flag, the standing condition
un-suppresses, and the banner it was written to prevent becomes permanent. The two
mechanisms in this section are one pipeline, not two independent ones.

**A poll in which a condition does not appear steps nothing.** Its hold is frozen rather than
advanced: the confirmed band and its "since" are preserved, and no interval in which the
condition was not read may confirm or reject a band on its behalf. §6.5 governs what such a
condition displays.

**⚠ Ten seconds of wall time means ten seconds the client was SAMPLING.** A hidden tab, a paused
dashboard and a run of failed polls are wall time with no readings behind them and must not
advance a hold: one sample either side of an hour-long gap has confirmed nothing, and dating the
band to the first of the two puts the banner's *when it started* an hour before the only other
evidence for it. The mirror case is worse — a band the intervening readings would have
**rejected** is confirmed instead, because there were no intervening readings. **A gap (§6.7)
therefore ends any pending run:** a band that has not yet confirmed restarts its ten seconds at
the first reading after the gap, and **the banner's "when it started" may never name an instant
on the far side of a gap.** A band that had already confirmed is not disturbed.

**Standing conditions are configured, not inferred.** `STANDING` in
`/etc/ai-dashboard.env` is a comma-separated list of condition ids.

**Condition ids.** One **kind** per row of §6.3's threshold table:

| kind | subject | singleton? |
|---|---|---|
| `gpu_temp`, `gpu_throttle`, `gpu_vram` | GPU index — `gpu_temp:0` | no |
| `disk_free` | `root` \| `home` | no |
| `unit` | the unit name — `unit:llama-server@1.service` | no |
| `health` | instance index — `health:0` | no |
| `fan_stopped` | channel index, a **bare integer** — `fan_stopped:3` | no |
| `cpu_temp`, `ram`, `fan5_engaged`, `fan5_absolute`, `ufw_enforcing`, `pwm5_present`, `dkms_for_running_kernel`, `link` | — | **yes** |

Rules, each of which closes a real hole:

- A bare kind in `STANDING` matches **every** subject of that kind. This is right for
  `gpu_temp` (two identical cards) and wrong for `unit` (heterogeneous subjects, one of them
  safety-critical) — so **`unit` requires a subject.** A bare `unit` would silence
  `gpu-fan-control.service`.
- **A subject on a singleton kind is malformed**, not a narrower match. `ufw_enforcing:yes`
  must be reported as unknown, not silently suppress nothing.
- An empty subject (`gpu_temp:`, `unit:`) is malformed.
- **Subjects that are indices are written as bare integers** — `gpu_temp:0`, `health:1`,
  `fan_stopped:3` — no padding, no prefix. All three share one `STANDING` namespace, so the
  kind alone distinguishes them.
- **A duplicate entry means nothing.** `STANDING=ufw_enforcing,ufw_enforcing` declares
  exactly what one entry declares. The list is a set once read, and the server echoes it
  verbatim without collapsing it — so nobody should "fix" a duplicate server-side.
- **Channel 5's zero is NOT a `fan_stopped` subject.** It is carried by `fan5_absolute`,
  whose row now has two sides. One tach must never produce two conditions, and
  `fan5_absolute` is already in `STANDING`'s vocabulary.
- **The join key between a serving instance and its unit is `llama-server@<i>.service`.**
  `health` is subscripted by instance index and `unit` by full unit name, so the SERVING
  panel derives the unit name from the index rather than the two being matched by string.
- An id that matches no kind is reported as unknown. Silence is not acceptable
  for a mechanism whose whole job is suppressing alarms.

**⚠ One source that blanks several figures states its message ONCE — ruled 2026-09-08
(10b-S-H).** `errorsForPanel`'s granularity is per **source**, not per figure, so a source
blanking several readings on one panel is *one fact, stated once*, placed under the figures it
blanks. §3.7's *"beside it"* is satisfied by the panel, not by each cell. **The consequence,
stated plainly rather than discovered:** with `dell-smm` down, fans 1–4 read `—` with the
explanation sitting on fan 5. Repeating the same sentence six times in one panel was rejected —
repetition in an alarm panel is its own kind of noise, and §3.7 exists so an alarm is actionable,
not so every cell carries prose.

**The banner's "when it started" is the first observation of the CONFIRMED band** — not the
instant confirmation completed, which would always read 10 s late.

### 6.5 Degraded states

These are the normal operating states of this machine, not edge cases:

| Condition | Presentation |
|---|---|
| Poll fails / server unreachable | Header dot goes grey, last-successful age counts up, charts freeze rather than plotting zeros, banner explains |
| `nvidia-smi` absent | GPU panels show "no GPUs enumerated" with an explanatory line, and **no other panel is affected**. §9's dot and count **are** affected, and must be: every GPU condition this session had confirmed becomes **stale** (§9) — it keeps its last severity and its place in the count until a reading replaces it or the card is observed gone. A dashboard that goes green because it stopped being able to look is the one failure this row must never cause |
| `pwm5` absent | Cooling panel shows the channel as unavailable and the safety check fails — never a blank RPM that reads as zero |
| `pwm5` returns `ENODATA` | Renders as **"EC auto"**, healthy. Never as an error |
| An `llama-server` instance is down | Its row shows the unit state and the reason; **the other instance is unaffected, and that is a structural requirement, not an observation about current scheduling.** No instance's probe may spend another's budget, and no collector-wide bound may blank a per-instance verdict |
| A single sensor read fails | That figure shows `—`, its `errors` entry is available, the rest of the panel renders |
| A condition's subject stops being reported, and the collection it belongs to could **not** be read | **Stale.** It keeps its last confirmed band and its "since", still counts (§9), and its row and the banner name the age of the reading **as `last read 6:12 ago`** (ruled 2026-09-08, S-B), coloured `--status-watch` rather than `--status-alarm` — the condition is still an alarm, and what this text says is that nobody has been able to look since, which is a different fact and must not read as a second alarm. **SAFETY's row uses the same words.** **It also keeps its last VALUE, rendered unchanged** — see below. One `watch`-toned event-log entry when it goes stale — after the same ten seconds of **sampled** wall time §6.4 requires — and one when a reading returns. Never a silent removal |
| A condition's subject is absent from a collection that **was** read | **Retired.** The subject has left the machine, and that is an answer: the condition leaves the ledger, the dot and the count, and one `normal`-toned entry records it. Confirmed over the same ten seconds, so one flickering enumeration cannot retire a card |
| An `—` whose cause is already shown beside it | **No second explanation.** When a coloured neighbour in the same panel already names the cause — a red *channel unavailable* chip next to a `—` fan reading — the em dash needs no entry of its own and no separate treatment. One fact, stated once. This is the only exception to the rule above, and it applies when the neighbour is in the same panel and either carries a severity **or names a documented absent state** — ⚠ **widened 2026-09-08 (S11/G5's panel residue)**. Channel 5's neighbour reads `unavailable`, which O13 says is **not** a severity, so the original wording did not reach it and a `fan5` em dash with `pwm5Present: true` owed an entry nothing files. The two alternatives were both worse: a fallback sentence written in the panel violates §3.7, which requires the text to come from the `errors[]` source match and never from copy written in the UI; and filing an entry from the collector would report a failure for a state the machine documents as normal. `unavailable` **is** the explanation — it is one fact, stated once, which is exactly what this row is for |

**⚠ S11/G5, settled 2026-09-07: the exception has ONE hole and the collector closes it, not the
panel.** `fan5` reading `—` while `pwm5Present` is `true` has a neighbour that renders
**`unavailable`**, and O13 says `unavailable` is not a severity — so the exception above does not
reach it, and until now no collector filed an entry either. That is an em dash with nothing
behind it, in the panel this dashboard exists for.

**`collectCooling` files the entry.** When `pwm5` is in the listing but `fan5_input` is not,
channel 5 no longer has the documented absent state that excuses its silence — the module is
loaded and the tach is missing, which is news. The alternative, a fixed note rendered by the
COOLING panel, was rejected: it turns *"an em dash always has an entry behind it"* into *"always,
except here"*, and a qualified rule is one a future reader has to know the exceptions to. **The
rule stays one rule.**

**A reading that stopped and a subject that left must never look alike either.** *We stopped
being able to look* is not *it got better*. Every rule in this section blanks **the figure it
names**; none of them may quietly lower §9's aggregate, because the aggregate is the one thing
on this page an operator reads from across the room.

**Zero and unknown must never look alike.** A fan reading 0 RPM is a dead fan on a box with
two passively-cooled 250 W cards. A fan reading nothing is a driver that did not load.
Those demand different reactions and must be visually unambiguous.

**⚠ A stale condition's age is measured by the BROWSER's clock, not the server's `ts`.** §6.7
splits the two — a reading's *position in time* is the server's `ts`, the *session* is the
browser's — and "the age of a reading we did not take" is cleanly neither. It is the elapsed
time since the last poll that still carried the condition, which is a fact about **this
session's ability to see**, in the same family as the banner's "since" and an event-log line's
time. It is not the age of the reading on the axis; that reading is still positioned by its own
`ts` and the trace still stops where it stopped.

**⚠ A stale condition shows its LAST VALUE, unchanged — not an em dash.** §6.6's law that
`null` renders `—` governs *a reading that is absent*; a stale condition's reading is not
absent, it is **old**, and blanking it would throw away the only number an operator has while
telling them nothing new. The figure stands, the staleness is what the row and the banner name,
and the two together say *this is what it was, and this is how long ago*. Blanking it would also
contradict the row above, which keeps the band and the "since" — a value hidden beside a
severity that is still counted would be the worst of both.

### 6.6 Units, formatting and locale

Each quantity is shown in **the unit its own source reports**, so any figure on screen can
be checked against the command that produced it without arithmetic.

| Quantity | Unit | Format | Checks against |
|---|---|---|---|
| GPU temp, CPU temp | °C | integer | `nvidia-smi`, `coretemp` |
| GPU power | W | 1 dp | `power.draw` |
| VRAM | MiB | thousands separated — `26,452 / 32,768 MiB`. A pair with one side `null` renders per figure: `26,452 / — MiB`, so which half is missing survives | `memory.used` |
| SM clock | MHz | integer, thousands separated — `1,290 MHz` | `clocks.sm` |
| RAM | GiB | 1 dp | `/proc/meminfo` |
| Swap | GiB | 2 dp — small values must not round to `0.0` | `/proc/meminfo` |
| Disk | **GiB** | 1 dp | `df -h` — powers of 1024, which is what `df -h` and `lsblk` print. `/` is 232.6 GiB, not 249.8 GB |
| Network | KB/s or MB/s, auto-scaled | 2 significant figures | `/proc/net/dev` |
| Fan speed | RPM | integer, thousands separated | `fanN_input` |
| Percentages | % | 1 dp | |
| Load average | — | three values, 2 dp, ` / `-separated — `1.24 / 1.08 / 0.91` | `/proc/loadavg` |
| Context length | tokens | thousands separated — `131,072` | `CTX=` in the env file |
| TCP port | — | bare integer, **never** thousands separated — `8080`, not `8,080` | `PORT=` in the env file |
| **GPU name** | — | **the driver's string, verbatim** — `Tesla PG500-216`. No lookup table, no marketing name, no truncation | `nvidia-smi --query-gpu=name` |
| **PCI bus id** | — | **raw, full domain form** — `00000000:17:00.0`. Never trimmed to `17:00.0`, never thousands separated. It is an identifier, so the locale bullet below does not govern it, exactly as for a TCP port | `nvidia-smi --query-gpu=pci.bus_id`, `lspci` |
| **CPU model** | — | trimmed to the marketing name — `Intel(R) Xeon(R) W-2135` renders `Xeon W-2135` (§3.2) | `/proc/cpuinfo` |
| Channel-5 PWM | — | state name then raw value — `HIGH pwm 255`. States are `OFF` (0–63), `LOW` (64–191), `HIGH` (192–255), per the driver's 3-state quantisation. **A duty that is not a reading leaves the MODE undetermined, not merely the duty** — the contract cannot represent `manual` with an absent duty, so the probe yields `ch5Mode: null` and the cell renders `unavailable`, not `—` | `pwm5` |

- **Locale `en-US`** for separators, on every viewer, so a screenshot always reads the same.
- **Times are rendered in the browser's local timezone**, with the zone abbreviation shown
  once in the header. The server sends ISO-8601 UTC in `ts`.
- ⚠ **The clock is 24-hour, with seconds** — `14:47:31`, never `2:47:31 PM`. Stated because
  **`en-US` defaults to 12-hour**, so a formatter written from the locale bullet alone is wrong
  by default, and until 2026-09-07 the only place 24-hour appeared anywhere in this document was
  §6.2's *example*. Seconds are shown because a 5 s cadence with a minute-resolution clock looks
  frozen. ⚠ In `Intl` terms this is **`hourCycle: 'h23'`**, not `hour12: false`: the two are not
  synonyms, `hour12` wins when both are given, and `hour12: false` has resolved to `h24` on
  `en-US` — which renders midnight as **`24:00:00`**, the same bug from the other side.
- **`null` renders as an em dash `—`. Never `0`, never blank, never `N/A`.**
- **A negative age never renders as a negative number.** A `ts` ahead of the browser's clock is
  clock skew, not a reading from the future: the age reads `0 s`, and §6.7's `stale` mode says
  the rest.
- **Zero renders as the numeral with its unit** — `0 RPM`, never `—`. This is the §6.5 rule
  expressed as a formatting law, because it is where it will actually be broken.

### 6.7 Client runtime behaviour

- **Poll** `GET /api/telemetry` on the selected cadence. Default 5 s.
- **Preferences** live in `localStorage` — `aid.cadence`, `aid.window`. Every read and
  write is wrapped in `try/catch`, and any failure falls back to the defaults silently; a
  private window with storage blocked must render a correct dashboard.
- **Buffer** is a ring capped at **8192 samples**. The worst case the selectors allow is
  2 h at 1 s = 7200; the cap sits deliberately *above* that rather than exactly equal to it,
  so a late-landing poll on the backoff path cannot silently evict the oldest sample while
  the window still needs it. Samples carry their real timestamps and traces are drawn
  **against time, not index**, so changing cadence mid-session neither clears the buffer nor
  distorts the axis.
- **The client keys its buffer on `ts` and ignores a snapshot whose `ts` it already holds.**
  At the 1 s and 2 s cadences §4's cache serves the same sample more than once; appending it
  twice would put duplicate points in the ring, flatten the min/max decimation over a bucket,
  and double-count an event in the log. **A repeated `ts` is not a failed poll** — the header
  dot stays green, the age counts from that `ts`, and the backoff is not engaged.
- **⚠ A repeated `ts` is normal; a RUN of them is not.** §4's cache produces two or three
  repeats in a row at the 1 s cadence and occasionally at 2 s, never at 5 s or slower — a run
  bounded by the contract. A server whose wall clock steps **backwards** produces an unbounded
  one, and every snapshot in it is a *different* reading wearing a timestamp the client already
  holds, so each is correctly dropped while the page learns nothing and stays green. **The mode
  is therefore a function of the AGE of the newest reading, not of the failure counter:** the
  dashboard is `stale` when a poll has failed, **or** when the newest reading is older than
  three cadences (at least 10 s), **or** when its `ts` is ahead of the browser's clock. One
  event-log entry marks the crossing and one the recovery.
- **⚠ Which clock governs what.** A reading carries exactly one timestamp — the server's `ts`.
  **Everything that positions a reading in time uses it and nothing else:** the ring's key, the
  x-axis, the window's bounds, a gap's endpoints, and the horizon past which a gap is pruned.
  **Everything that measures the session uses the browser's clock:** §6.4's ten-second hold, an
  event-log line's time, the banner's "since". **The age indicator is the one place the two are
  compared, and that is its whole job.** A window anchored on the browser's clock blanks every
  trace once the server is behind by more than the window — while the ring is full of good data
  and the header still reads `live`. **The rendering window is anchored on the newest sample's
  `ts`**, which is also what makes §6.5's "charts freeze rather than plotting zeros" true.
- **A skipped call and a failed call must not read alike.** Both blank the same figures, but
  they are different facts: *failed* means we asked and learned nothing; *skipped* means we
  did not ask, because an earlier call to that collector has still not returned. The
  distinction lives in the `errors[]` message text, and it is the only signal that a source
  is wedged rather than merely broken — a run of `skipped` entries is what a reader needs to
  see before reaching for the container.
  ⚠ **S19, settled 2026-09-07: the message text carries it and the RENDERING does not.** One em
  dash and one entry either way — no fourth display state beside §6.3's three-valued `Severity`,
  no separate glyph, no colour. The two mean the same thing to the panel (*this figure is not
  current*) and differ only in the remedy, which is a sentence to read rather than a shape to
  recognise. A distinct visual state was rejected for needing an axis §6.3 does not have, and
  raising the panel to `watch` for a skipped call was rejected because it colours a fact about
  **the dashboard's ability to look**, which §9 keeps out of the aggregate deliberately.
- **A collector that has stopped answering produces the same `errors[]` entries on every poll**
  for as long as it does — the third persistent-entry case, on the same terms as
  `pwm5Present: false` (§3.6) and the `NoSuchUnit` entry (§3.7). **The event log records the
  transition, not the poll**: one entry when a collector stops answering and one when it
  resumes, never one every five seconds.
- **Downsample above 600 rendered points, PER SERIES**, using min/max decimation per bucket so
  a one-sample spike survives rather than being averaged away. A thermal spike that vanishes
  because of rendering is a lie. **Per series, not per chart**: §6.2's stacked cooling chart
  carries three traces and may therefore draw up to 1,800 points. A per-chart budget would
  silently coarsen a two-card temperature plot to 300 points each the moment a third trace was
  added, which is a rendering decision disguised as a constant.
- **Background tab:** pause polling on `document.hidden`, resume on visibility. The
  un-sampled span is drawn with the same hatched "no reading" treatment a lost channel
  gets — the data genuinely is absent, and it must not be interpolated across.
  **A gap is a span the client was not sampling, and it stays open while ANY reason to have one
  is still in force** — hidden, paused, or a run of failed polls — **not until the next sample
  arrives.** It closes at the `ts` of the first reading taken while none of them is. A poll
  already in flight when the tab is hidden, a poll in flight when the operator pauses, and a
  *refresh now* taken while paused all land **inside** the gap: the reading is kept, and the gap
  is neither closed nor split, because one reading does not make the hour around it observed.
  Without this, an hour of hidden time is recorded as the five seconds before the in-flight poll
  landed, and the chart draws a straight line across 3,600 s of ground nobody measured.
- **Failed poll:** exponential backoff at 1×, 2×, 4× the cadence, capped at 30 s. The
  header dot goes grey, the age counts up, traces freeze rather than plotting zeros, and a
  banner names the failure. Recovery resets the backoff.
- **401 at any time** → session expired → `/login`, per §5.2.
- **First sample:** `cpuPct` and network rates are deltas and need two samples. They render
  `—` until the second poll arrives, never `0`.
- **A collector's budget bounds the collector's wall clock; it is never evidence about a
  subject.** Any per-subject verdict a collector could not afford to obtain is `null` — *not
  read this cycle* — and its `errors[]` entry names the budget rather than the subject. A
  verdict of *failure* — `unreachable`, `false`, `inactive` — may be minted only from an
  answer, or from a bound that applied to that subject **and to nothing else**. Every
  collector that leaves the process carries one monotonic budget: `nvidia-smi` 4 s (§3.1),
  the whole `dell_smm` probe 2 s (§3.3), the D-Bus conversation 2 s, both `statvfs` calls
  2 s, the two safety file reads 2 s, `/etc/llama-server` discovery 2 s, and **each
  instance's** `/health` + `/v1/models` 4 s — the last is larger because it is the only probe
  against a process under load, and a cold prefill on this box measures 14 s.
- **A poll may legitimately take longer than the cadence, and that is not a fault.**
  Discovery must finish before an instance's port is known, so `collectServing`'s worst case
  is 2 s + 4 s = **6 s**, above the 5 s default cadence. This is intended and needs no
  shorter collector-wide bound — §6.5 forbids one anyway. §4's cache holds the **in-flight
  promise**, so a client arriving mid-sample joins it rather than starting a second: the
  page shows the older `ts` and the age indicator counts up, which is precisely what §6.2
  designed that indicator to say. Overlapping polls must never become overlapping samples.
- **An out-of-range reading carries no `errors[]` entry either.** A `utilization.gpu` of
  `150` becomes `null` and renders `—`, on the same terms as a rejected delta. A `pwm5` of
  `999` is the same kind of event but has a different rendering: it leaves the mode
  undetermined, so the cooling cell reads **`unavailable`** rather than `—` (§6.6). Reserve `errors[]` for reads that
  failed.
- **The collector owns `previous` across a failed read.** A failed poll must not discard the
  last good counters, or one transient failure costs two polls of every delta — the failed
  one and the one after it. Keep the last successful sample and its timestamp until a newer
  successful sample replaces it.
- **A rejected delta renders `—` on the same terms.** When a counter goes backwards, wraps,
  or is reset by a reboot, the rate is not computable — but the *read* succeeded, so there
  is **no `errors[]` entry and no new `ErrorSource`**, and it self-heals on the next poll.
  §6.5's rows govern failed reads; this is not one.
- **Event log** holds 500 entries, newest first, then discards the oldest.
- **The client never writes to the server.** There is no endpoint that would accept it.

---

## 7. Risks and open items

1. **Docker on a deliberately bare box.** First container runtime here. It brings its own
   iptables behaviour (§2.1), its own upgrade cadence, and its own failure modes onto a
   machine that has so far had none of them.
2. **NVIDIA Container Toolkit is a second host dependency**, and it is coupled to the
   driver version. A driver upgrade that breaks it takes the dashboard's GPU panels with
   it — the toolkit must be added to the post-kernel-upgrade check alongside DKMS.
3. **ufw is enforcing, and 8090 has no rule yet.** `ENABLED=yes` as of 2026-09-06, so the
   exposure this entry originally recorded is closed. The live risk is its mirror image: the
   dashboard binds 8090 in the host namespace and is **unreachable from the LAN until an
   allow rule exists** (§2.1). Add it from a session that stays open, and run
   `sudo ufw show added` first — `ufw enable` without a port-22 rule is what took this box
   off the network on 2026-09-04, and `show added` lists rules without activating anything.
4. **No TLS**, so that password crosses the LAN in the clear (§5).
5. **`fan2` is reported but never driven.** The panel must not imply the dashboard or the
   service controls it; it is displayed because it sits in the GPU airflow path.
6. **Chassis ambient is not measured** (decision 2), yet it is the dominant variable in
   single-GPU thermals — roughly 1:1, so a room 10 °C warmer puts sustained single-GPU work
   near 84 °C. If ambient context is ever wanted, `temp2` is the least-bad proxy and this
   decision reopens.
7. **The dashboard is not a watchdog.** Nothing is alerted when the tab is closed. If
   unattended alerting is wanted, that is a separate always-on component and should not be
   grown out of this one.

---

## 8. Deliverable sequence

1. **This spec** — done.
2. **Visual mock** — a static, non-functional HTML page with realistic frozen values drawn
   from the measurements above, in **three states**: (A) healthy steady state, (B) degraded
   — alarm banner, a lost channel, a failed instance, populated event log, and (C) the
   §5.2 login screen. Reviewed and iterated before any application code is written.
3. **Implementation** — Next.js app, Dockerfile, systemd unit, install script following
   this repo's conventions (`set -euo pipefail`, `bold`/`info`/`ok`/`warn`/`die`, `usage()`
   re-reading the header comment, `--dry-run` on every subcommand).
4. **Verification on a real boot** — check the ordering cycle, **add and confirm the ufw
   rule for 8090** (`sudo ufw allow from 192.168.4.0/22 to any port 8090 proto tcp`, then
   `sudo ufw status numbered`) — without it the container comes up healthy and answers
   nobody, which looks exactly like a broken build —
   confirm the container survives a reboot and a `docker` restart.

> Standing rule from this repo, and it applies to every step above:
> **writing the config is not evidence it took.** Ask the system what it actually ended up
> with before believing it.

---

## 9. Resolved defaults

Settled by convention or by evidence already in this repo rather than by a decision the
owner had to make. Listed so that nothing in this document requires an implementer to
guess — if a question is not answered here or above, it is a genuine gap and should be
raised, not assumed.

| Question | Resolution | Because |
|---|---|---|
| Aggregate status dot **and count** | **One reduction over each condition's `displaySeverity`** (§6.4), which is the debounced band after standing suppression. A suppressed standing condition is therefore neither red nor counted — its truth is named in its SAFETY row instead. The count is **omitted when zero**, so the header reads `● all healthy`, never `0 alarms`. **Paused/stale is a mode shown alongside it, never instead of it** | Reducing over `displaySeverity` is what keeps the dot, the count and the banner from ever disagreeing. A mode that hid the count would be a lying dashboard |
| One reading shown in two panels | **One condition, counted once.** Deduplicate by condition id, **taking the WORST severity, not the first** — otherwise the panel that happens to be assembled first decides, and a `failed` service behind an `active` reading renders a red cell under a green dot | `gpu-fan-control.service` appears in both COOLING and SAFETY; it is one fact about the machine and must not inflate the header count to two |
| A condition whose subject stops being reported | **The reduction runs over every condition the session has confirmed, not only those in this poll.** A condition absent from a poll is **stale**: it keeps its last confirmed `displaySeverity`, keeps its "since", keeps counting toward the dot and the count, and shows the age of the reading behind it. It leaves the reduction only when **retired** — the collection that would have contained it was read successfully and it was not in it (`gpus: [{index:0}]` for GPU 1, `serving: []`). A collection that could **not** be read (`gpus: null`) retires nothing. Staleness never raises a severity and never lowers one | An unobservable alarm is **unknown**, not resolved. Without this, a card at 90 °C whose `nvidia-smi` then fails takes the header from `● 1 alarm` to `● all healthy` with no log line — the dashboard turns green at the moment it loses the ability to look. The `null` ≠ `[]` distinction §3.1 already carries is exactly what separates *not read* from *not there* |
| Event log cap | 500 entries | §6.4 said "a few hundred" |
| `fan1`–`fan4` when the 5-fan module is absent | They survive; only channel 5 disappears | CLAUDE.md: a DKMS failure means "you silently drop to four fans" |
| A channel lost mid-session | Same rule as a failed poll — the trace stops, the gap is hatched, nothing is drawn to zero | §6.5's intent, extended |
| Chart form for temp + fan | **Two stacked plots on one shared x-axis.** Never a dual y-axis on one plot | Two scales on one frame make a crossing look meaningful when it is an artefact of scaling |
| Chart interaction | **Hover layer and table view are the default** — crosshair + tooltip on a line plot, per-mark on bars and dots **once such a chart exists** (§6.2's 2026-09-08 ruling: on a line plot the crosshair's tooltip discharges it, since hover zones necessarily occlude the marks), and a table view of the series, **scrolling within its own container**. See §6.2 | They cost nothing on a wall nobody touches, and the same page is opened on a laptop exactly when reading a value off a trace by eye is hardest. The table view is an accessibility floor, not a convenience |
| Series colours | GPU 0 `#3987e5` solid · GPU 1 `#199e70` dashed · fan 5 `#d95926` | Validated all-pairs against the panel ground, worst protan/deutan ΔE 9.4. GPU 1 is deliberately not orange — an orange line on a temperature chart reads as "hot" |
| Series distinguishability | Colour **plus** dash pattern **plus** a direct end-label | §6.3 requires it without relying on colour alone |
| Numerals | Monospace, `tabular-nums`, throughout | At a 5 s refresh, digits that jitter in place are worse than optically even ones |
| Theme | **Single dark theme**, background painted explicitly | Decision 9. There is no light variant to design |
| GPU 1 PCI bus id | Read at runtime from `pci.bus_id`; the mock's `17:00.0` is a **placeholder** | CLAUDE.md records only `97:00.0`, from when one card was installed |
| Mock data | Frozen, deterministic (seeded LCG), regenerated identically on every open | A mock whose numbers move is a mock people start trusting |
| Repo hygiene | `dashboard/` is self-contained; `.gitignore` covers `node_modules/`, `.next/`, `out/`, `.env*` | §2.4 |
