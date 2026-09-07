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

## 4. ⚠ The one real finding: `DEFAULT_PATHS` are CONTAINER paths, with no override

```
"root": { "usedGB": null, "totalGB": null },
"home": { "usedGB": null, "totalGB": null },
"errors": [
  { "source": "statvfs", "message": "/host/root: ENOENT: no such file or directory, statfs '/host/root'" },
  { "source": "statvfs", "message": "/host/home: ENOENT: no such file or directory, statfs '/host/home'" }
]
```

`collect.ts` fixes `rootMount: '/host/root'` and `homeMount: '/host/home'`, because §2.2 mounts
them there — `-v /:/host/root:ro -v /home:/host/home:ro`. **Nothing reads an environment
variable for them**, so outside a container the two filesystems cannot be read at all.

**This is correct behaviour for an unsupported configuration, and it is not being "fixed".**
The app is specified to run in a container with those mounts; running it natively is this
deploy's choice, not a supported mode. What matters is *how* it failed:

⚠ **It reported a partial snapshot with an `errors[]` entry per filesystem and a 200 —
invariant 5, exactly.** No 500, no fabricated zero, and the em dash on screen has an entry
behind it (§6.5). **The two `—` in STORAGE are the system working, not failing.**

**Recorded for step 11/12:** a non-container run cannot see disks, so any future native
debugging run will show those two em dashes, and that is expected. If a native mode is ever
wanted, `CollectorPaths` is already threaded through every collector — it needs a source, not a
redesign.

---

## 5. A small defect the run found in nothing but itself

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
