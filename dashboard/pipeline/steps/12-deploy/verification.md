# Step 12 — deployed to ai-server, and what is verified versus what is not

**2026-09-11.** The owner ran `sudo ./deploy-step12.sh` on the box. This file records what the
parent verified afterwards **from the Mac, without root**, and — more importantly — what is *not*
verified, because a deploy note that blurs the two is the failure this project has spent twelve
steps removing.

## 1. Verified

| what | how | result |
|---|---|---|
| reachable over the LAN | `curl http://192.168.4.71:8090/login` from the Mac | **HTTP 200**, 27 ms |
| the auth gate holds | `curl .../api/telemetry` with no session | **HTTP 401** |
| the unit is enabled and running | `systemctl is-enabled` / `is-active ai-dashboard` | **enabled**, **active** |
| ⚠ **trap 1 is in force, not merely written** | `systemctl show ai-dashboard -p StartLimitIntervalUSec -p StartLimitBurst` | **5min / 5** |
| `Restart=always` (11-Q1) is in force | `systemctl show -p Restart` | **always** |
| port 8090 is listening | `ss -ltn` | `0.0.0.0:8090` |
| ⚠ **the env file mode (SPEC §5's 2026-09-11 correction)** | `ls -l /etc/ai-dashboard.env` | **`-rw-r----- root 10001`** — 0640, group = the container's uid/gid, exactly as ruled |
| no collateral damage to production | `systemctl is-active llama-server@0 llama-server@1` | **active active**, throughout |
| no ordering cycle **in the current boot** | `journalctl -b \| grep "ordering cycle"` | nothing — but see §2.1 |

## 2. NOT verified — do not read the above as more than it says

### 2.1 ✅ CLOSED — the reboot passed, 2026-09-11 22:13 UTC

**PLAN row 12's *"survives a reboot"* is VERIFIED.** The owner rebooted; the parent checked the
new boot directly. `journalctl -b | grep "ordering cycle"` found **nothing**, and every unit came
back **by itself**, in the right order, within seven seconds of userspace:

| | timestamp | Δ from boot |
|---|---|---|
| userspace | 22:13:37 | — |
| `gpu-fan-control` | 22:13:38 | +1 s |
| `llama-server@0` / `@1` | 22:13:43 | +6 s |
| `ai-dashboard` | 22:13:44 | +7 s |

All four `enabled` and `active`. `fan5_input` present, so the DKMS module followed kernel
7.0.0-31 across the reboot. Port 8090 listening; from the Mac, `/login` **200** and
`/api/telemetry` **401**; both inference endpoints **200** on `/health`.

That is the failure this repo has actually been bitten by — an ordering cycle deleting
`llama-server`'s start jobs with no failed unit and no error anywhere except one journal line —
and adding a unit that orders itself after `gpu-fan-control` is exactly the change that triggered
it before. It did not recur. The original text follows, for the reasoning.

### 2.1.1 (historical) The reboot, which is the only real test of trap 3

`journalctl -b` was clean, **but this boot predates the install**: the box has been up since before
`ai-dashboard` existed, so the current journal could not contain a cycle involving it either way.
**An ordering cycle deletes start jobs silently and appears only on a real boot** — `systemctl
restart` can never reproduce it (root `CLAUDE.md`; it cost this box both `llama-server` instances
once). PLAN row 12's *"survives a reboot"* is **open**. After a reboot:

```bash
journalctl -b | grep "ordering cycle"     # expect nothing
systemctl is-enabled ai-dashboard          # expect enabled
systemctl is-active  ai-dashboard          # expect active
```

### 2.2 ⚠ A FALSE PASS the parent caught in its own check, and the shape is the point

The parent ran, as an unprivileged user:

```bash
docker inspect ai-dashboard --format '{{json .Config.Env}}' | grep -iE 'PASSWORD_HASH|SESSION_SECRET' \
  && echo LEAK || echo "neither secret in Config.Env"
```

It printed **"neither secret in Config.Env"** — and that was **worthless**. `docker inspect` had
already failed with *permission denied while trying to connect to the docker API*, so `grep` had no
input, found nothing, and the `||` arm printed a pass. **A check whose pass condition is "nothing
found" passes hardest when it cannot look.** This is the same defect the 10f, 11 and 11b loops each
found and fixed in `cmd_check`'s rows — reproduced here by the parent, by hand, one command after
verifying those fixes. It is recorded rather than quietly re-run because the lesson is the shape,
not the instance.

**So 11-Q2's ruling — neither secret in the container's environment — is UNVERIFIED on the box.**
It must be checked as root, with the read judging its own failure:

```bash
sudo docker inspect ai-dashboard --format '{{json .Config.Env}}'   # then read it
sudo ./dashboard.sh check                                          # the row that does this properly
```

### 2.3 Everything else that needs root

`sudo ./dashboard.sh check` is the detector and **it has not been run since the deploy**. Until it
has, these are unverified: the ufw rule actually governing 8090 (PLAN row 12's first acceptance
item), the GPU mode from `.HostConfig.DeviceRequests` (full or the 11-Q1 fallback), O22's one
process, the drift comparison against the unit's own `ExecStart`, and the credentials rows.

### 2.4 The browser condition

§6.1's no-scroll promise is conditioned on **default font size and 100 % zoom** (ruled 2026-09-10,
10h-Q1). Whatever browser the wall panel runs must honour that; a 16 px minimum-font-size setting
alone puts the page 2–3 px over at 1600×1024.

## 3. The one-line summary

**The dashboard is deployed, reachable, gated, enabled, running, has not disturbed inference, and
SURVIVES A REBOOT with no ordering cycle.** What remains unverified needs one root run of
`dashboard.sh check`: the ufw rule actually governing 8090, both secrets absent from the
container's environment, the GPU mode, the one-process assertion and the drift comparison. One of
those was nearly reported as verified by a check that could not see (§2.2).
