# First deploy — the backend on `ai-server`, 2026-09-07

**The backend ran against the real machine for the first time and worked on the first attempt.**
This records how, what it returned, and the four things the run taught us that fixtures could
not.

⚠ **This is NOT §2.5's deployment.** No container, no systemd unit, no ufw rule, nothing
installed with root. It is the cheapest arrangement that exercises the **real endpoint** —
route, session gate, cache, every collector — against the real box.

---

## 1. What was done, and what it changed on the box

| step | what | root? |
|---|---|---|
| Node | `node-v24.16.0-linux-x64.tar.xz` from nodejs.org into `~/.local/node24`, **SHA256 verified** against the published `SHASUMS256.txt` | no |
| pnpm | `corepack enable --install-directory ~/.local/node24/bin` → pnpm 12.3.4 | no |
| source | `rsync -a --delete --exclude node_modules --exclude .next --exclude .git` → `~/ai-dashboard-src/` (4.1 MB) | no |
| build | `pnpm install --frozen-lockfile` then `pnpm build` — **native amd64, on the box**, per §2.3 | no |
| standalone | `cp -r .next/static .next/standalone/.next/` — §10: Next does not copy it | no |
| credentials | `scripts/hash-password.py` for `PASSWORD_HASH`, 32 hex bytes from `/dev/urandom` for `SESSION_SECRET`, written to `~/.ai-dashboard.env` at **0600** | no |
| run | `PORT=8090 HOSTNAME=127.0.0.1 node .next/standalone/server.js` | no |

⚠ **`HOSTNAME=127.0.0.1` — loopback only.** Nothing is exposed to the LAN, so **no ufw change
was needed or made**, and the 2026-09-04 lockout risk was never in play.

**Everything lives under `~`.** To undo: `rm -rf ~/.local/node24 ~/ai-dashboard-src
~/.ai-dashboard.env ~/aid.cookies ~/aid-server.log` and kill the node process. **Invariant 2
holds**: nothing was written to hwmon, no unit was started or stopped, no model was repointed.

**It changes one recorded fact:** `CLAUDE.md` and `HANDOVER.md` both say *"Node absent"* on the
box. It is now present, under `~/.local/node24`, unprivileged and reversible.

---

## 2. The gate, before anything else

```
GET  /api/telemetry   (no cookie)   → 401
GET  /login                          → 200
POST /api/session  {"password":…}    → 302, sets the cookie
GET  /api/telemetry   (cookie)       → 200, 1629 bytes
```

⚠ **`proxy.ts` runs.** §7's trap — *"Next 16 renamed `middleware.ts`; a file left at the old
name is not an error, it simply never runs"* — would have shown here as a 200 on an
unauthenticated telemetry request. It did not.

---

## 3. What the API returned

Rendered by `pnpm probe`, which validates with **the client's own `parseSnapshot`** and formats
with **the real formatters** — so this is what the UI will print, from the same code:

```
GPU 0  ·  Tesla PG500-216 · 00000000:17:00.0
  temp        39 °C          power 39.2 W / 250.0 W     vram 26,650 / 32,768 MiB
  util        0.0 %          sm clock 1,260 MHz         throttle 0x0  normal, not a fault
GPU 1  ·  Tesla PG500-216 · 00000000:97:00.0
  temp        39 °C          power 40.0 W / 250.0 W     vram 26,452 / 32,768 MiB

CPU  ·  Xeon W-2135 · 6C / 12T      32 °C   1.8 %   0.08 / 0.12 / 0.09
MEMORY                              10.1 GiB / 61.2 GiB   swap 0.02 GiB / 8.00 GiB
COOLING   fan 5 2,276 RPM  EC auto  ·  fan 1·2·3·4  1,029 / 719 / 672 / 1,047 RPM  ·  active
SERVING   llama-server@0 :8080 active qwen3.6-27b ctx 131,072 health ok
          llama-server@1 :8081 active qwen3.6-27b ctx 131,072 health ok
SAFETY    ufw true · pwm5 true · dkms true · fan service active
§6.3      23 conditions — every one bands normal
```

**Four things fixtures could not have told us:**

1. ⚠ **`ENODATA` → `ec-auto` works on the real driver.** `ch5Mode: "ec-auto"`, `ch5Pwm: null`,
   `fan5Rpm: 2276` — invariant 3, on the actual `dell_smm` node, against `CLAUDE.md`'s
   documented EC-auto reading of ~2210. The DKMS 5-fan module is loaded and channel 5 answers.
2. ⚠ **The VRAM figures are exactly `CLAUDE.md`'s.** 26,650 and 26,452 MiB — the two recorded
   per-card totals for Qwen3.6-27B at 128K. The collector is reading the machine this project
   documented, not a plausible-looking one.
3. ⚠ **The GPU name really is `Tesla PG500-216`.** §3.1 predicted the board code rather than the
   marketing name, and §6.2 was written on 2026-09-07 to render it raw. Confirmed live.
   `MOCK.html`'s `Tesla V100-PCIE-32GB` is a string this box does not produce.
4. ⚠ **The D-Bus and HTTP probes reached the live `llama-server`s** — `unitState: active` over
   `Manager.GetUnit`, `health: ok` and `model: qwen3.6-27b` from ports 8080/8081, without an API
   key, exactly as decision 13 assumed.

### Two rules proved live, not by fixture

**§6.7's delta rule.** First poll `cpuPct: null`, `rxBytesPerSec: null`. Second poll, three
seconds later: `cpuPct 0.90`, `rx 1185.8 B/s`, `tx 399.2 B/s`. *"They render `—` until the
second poll arrives, never `0`."*

**§4's 2 s cache.** Three rapid polls returned the **identical `ts`**:

```
2026-09-07T21:12:15.485Z   2026-09-07T21:12:15.485Z   2026-09-07T21:12:15.485Z
```

---

## 4. The one real finding, and the fix — `ROOT_MOUNT` / `HOME_MOUNT`

The first run returned:

```
"root": { "usedGB": null, "totalGB": null },
"errors": [ { "source": "statvfs", "message": "/host/root: ENOENT: … statfs '/host/root'" }, … ]
```

`collect.ts` fixes `rootMount: '/host/root'` and `homeMount: '/host/home'`, because §2.2 mounts
them there — `statvfs('/')` **inside a container measures the container's own overlay**, a
plausible-looking number about the wrong filesystem. Outside a container those paths do not
exist, and nothing read an environment variable for them.

⚠ **How it failed is the point: a partial snapshot, one `errors[]` entry per filesystem, and a
200.** Invariant 5 exactly, with the em dash on screen having an entry behind it (§6.5). The
two `—` were the system working.

**The fix is `pathsFrom(env)`, and it is deliberately narrow.** `ROOT_MOUNT` and `HOME_MOUNT`
override those two paths and **nothing else**, because they are the only two entries in
`CollectorPaths` that differ between the container and the host — everything else is mounted at
its own name (`-v /sys:/sys:ro`, `/etc/llama-server`, `/etc/ufw/ufw.conf`, `/lib/modules`, the
D-Bus socket) or arrives via `--pid host`. **The native run proved that**: every other collector
read correctly and exactly these two failed.

⚠ **The container sets neither key and gets the defaults.** Setting them *inside* the container
is a way to measure the wrong filesystem, and `S69` mutates the defaults to the host paths to
keep that from being an easy mistake. An empty or whitespace value is **not** an override — it
is the absence of the key spelled differently, exactly as `readStandingList` treats `STANDING`.

### The native run, with the mounts set

```
STORAGE & NETWORK  ·  statvfs · eno1
  /                    20.7 GB / 232.6 GB
  /home                127.9 GB / 915.8 GB
  eno1                 rx 3.0 KB/s  tx 2.2 KB/s     link up

§6.3 BANDS  ·  25 conditions projected — every one bands normal
ERRORS[]   ·  0 entries
```

⚠ **The totals match `SPEC.md` §3.5 to the decimal** — *"the **232.6 GiB** root filesystem"* and
*"the **915.8 GiB** `/home` filesystem"* — and `df -h` agrees at its own resolution (`233G`,
`916G`). The collector reproduces `df` because it uses `bfree`, not `bavail`.

⚠ **This run is what made O19 concrete, and O19 is now closed.** The figures above read ` GB`
while §6.6 says **GiB** — the number right, the label wrong, and the only false thing the
dashboard printed. Closed the same day by *deleting* the `GB` brand rather than renaming it
(`GiB` already existed), which made `Filesystem.usedGB`/`totalGB` a **wire** change. The box was
redeployed in the same change, because an old server against the new client yields a snapshot
the browser refuses. It now reads:

```
/        20.7 GiB / 232.6 GiB
/home    127.9 GiB / 915.8 GiB
ERRORS[]  ·  0 entries
```

⚠ **The payload quoted earlier in this file uses the OLD field names.** It is kept as the
historical record of the first deploy; the client in this tree can no longer parse it.

## 5. Two small defects the run found

### 5.1 ⚠ The standalone server renames its process, so `pkill -f "node server.js"` misses it

Restarting it appeared to work and did nothing: the old process was still serving, and the probe
still showed the old paths. `ss -ltnp` explains it —

```
LISTEN 127.0.0.1:8090   users:(("next-server (v",pid=1490802,...))
```

Next's standalone server **sets its own process title** to `next-server (v16.3.4)`. Any restart
that matches on `node server.js` silently no-ops. Irrelevant to §2.5's deployment, where
`ExecStartPre=-/usr/bin/docker rm -f ai-dashboard` handles it — **recorded because it is exactly
the shape of a `dashboard.sh restart` that reports success and changes nothing**, which is this
repo's most-repeated failure mode.

### 5.2 A defect the run found in nothing but itself

The probe first printed **`up up 1 d 21:45`**. `formatUptime` already carries the word — §3.2's
four forms are `up 2 d 02:01`, `up 02:01`, `up 14 min`, `up <1 min` — and the probe added its
own. Fixed there, and noted at the call site, because **§6.2's header will make the same mistake
if it composes a label around the formatter's output.**

---

## 6. How to run it again

```bash
# on the Mac
pnpm probe                     # validates + renders the live snapshot
PROBE_HOST=ai-server pnpm probe

# on the box — the server, if it is not running
cd ~/ai-dashboard-src/.next/standalone
set -a; . ~/.ai-dashboard.env; set +a
PATH="$HOME/.local/node24/bin:$PATH" PORT=8090 HOSTNAME=127.0.0.1 UV_THREADPOOL_SIZE=16 \
  nohup node server.js > ~/aid-server.log 2>&1 &
```

⚠ **`pnpm probe` is a separate vitest config** (`vitest.probe.mts`), so a network probe can
never be swept into `pnpm test`. It is allowed to fail because the box is off.


---

## 7. Redeploy at `b3969cd` — the three backend items, on the box

**2026-09-07, after O19, D4 and D5.** Deployed from **`git archive HEAD:dashboard`** rather than
by rsyncing the working tree: a build agent was mid-edit on `lib/format.ts`, and rsync would
have shipped a half-written file. ⚠ **Deploy a commit, not a working tree** — the box then holds
something with a name, and `git rev-parse` says exactly what is running.

```
unauthenticated /api/telemetry = 401     ← proxy.ts runs
POST /api/session               = 302
```

```
GPU 0 · Tesla PG500-216 · 00000000:17:00.0     38 °C   39.2 W / 250.0 W   26,650 / 32,768 MiB
CPU   · Xeon W-2135 · 6C / 12T                 43 °C   1.7 %   0.48 / 0.19 / 0.08
COOLING  fan 5 2,201 RPM  EC auto  ·  fan 1·2·3·4  1,029 / 718 / 658 / 1,038 RPM
SERVING  llama-server@0 :8080 active qwen3.6-27b ctx 131,072 health ok
STORAGE  /  20.7 GiB / 232.6 GiB   ·   /home  128.3 GiB / 915.8 GiB   ·   rx 3.1 KB/s tx 2.2 KB/s
SAFETY   ufw true · pwm5 true · dkms true · fan service active
§6.3     25 conditions — every one bands normal
ERRORS[] 0 entries
```

**What this run confirms that the earlier ones could not:**

1. ⚠ **O19's contract change works end to end.** The server serves `usedGiB`/`totalGiB`, the
   client's own `parseSnapshot` accepts it, and the figures render **`232.6 GiB`** — §6.6's own
   *"`/` is 232.6 GiB, not 249.8 GB"*, on the machine. The dashboard now prints nothing false.
2. **Zero `errors[]`**, twice in a row. Every collector on this box reads.
3. **§6.7's delta rule, again on a fresh process**: first poll `cpuPct —` and `rx/tx —`, second
   poll `1.7 %` and `3.1 / 2.2 KB/s`.
4. **§4's cache**: three rapid polls, one identical `ts`.

⚠ **`errorsForPanel` and `traceFor` are not exercised by this probe**, and cannot be: the probe
consumes the API, and both are client-side selectors with no server half. They are covered by
their own suites and harness mutations. Said here so the green above is not read as evidence
about them.
