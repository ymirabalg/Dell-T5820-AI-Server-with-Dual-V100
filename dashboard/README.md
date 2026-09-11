# ai-server dashboard

A read-only wall-panel view of `ai-server`: two V100s, the CPU and memory, the Dell EC fan
channels, both `llama-server` instances, disk and network, and the box's safety posture.
One page, one poll, no history on the server.

**`SPEC.md` is the design and it wins every disagreement.** `pipeline/INSTALL-SPEC.md`
specifies the install script; `pipeline/HANDOVER.md` is the running record of what exists.
This file is only how to build it, run it and deploy it.

---

## Develop

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
pnpm install
pnpm verify        # tsc --noEmit && vitest run — THE definition of green, exit code only
pnpm dev           # http://localhost:3000
```

⚠ **Green is `pnpm verify` exiting 0, never a printed summary.** A test file that fails to
compile does not fail its tests — it silently drops them from the count, and the summary
still reads `passed`. See `pipeline/HANDOVER.md` §1.

Node 24 is pinned in three files (`engines.node`, `.nvmrc`, `.node-version`) and this
machine has two Nodes installed; the `PATH` line above selects the pinned one.

## Deploy

The box is x86_64 and the Mac is arm64, so **the image is built on the box** (`SPEC.md`
§2.3). There is no checkout on the box; the source arrives by rsync.

```bash
# on the Mac — deploy a COMMIT, not a working tree
git archive HEAD:dashboard | ssh ai-server 'rm -rf ~/ai-dashboard-src && mkdir -p ~/ai-dashboard-src && tar -x -C ~/ai-dashboard-src'

# …or, while iterating:
rsync -a --delete --exclude node_modules --exclude .next --exclude .git \
      --exclude '*.tsbuildinfo' dashboard/ ai-server:~/ai-dashboard-src/
```

⚠ The rsync **must** carry `scripts/` — `scripts/hash-password.py` is the only thing on the
box that can produce a `PASSWORD_HASH`, and the box has no Node.

Then, **on the box, as a person** (sudo needs a password here, so none of this can be
driven from the Mac):

⚠ **Read the sha on the Mac, not on the box.** There is no checkout here — the tree
arrives by rsync — so `git rev-parse` on the box has nothing to read: with git absent the
command substitution is empty and `--tag` dies on bash's own `--tag needs a value`. Take it
from the Mac's checkout and paste the literal value:

```bash
# on the Mac, in the repo
git rev-parse --short HEAD          # -> e.g. 3f152b0
```

```bash
# on the box
cd ~/ai-dashboard-src
./dashboard.sh install --dry-run     # read this first. It is the review surface
sudo ./dashboard.sh install --tag 3f152b0
```

⚠ **Without `--tag` the image is tagged `notag-<UTC date>`, which names a DAY and not a
tree** — so a second build on the same day would find that tag already present. `build`
rebuilds it rather than shipping whatever was built earlier; with an explicit `--tag` it
does **not** rebuild, says so loudly, and `--force` is how you override that.

`install` runs: preflight → `deps` → `build` → `set-password` → `configure` → `unit` →
`firewall` → `start` → `check`, and **fails if `check` fails**. Every step is also a
subcommand of its own, and every subcommand takes `--dry-run`.

| | |
|---|---|
| `./dashboard.sh check` | the silent-failure detector. Exit 0 all rows pass · 1 a row failed · 2 a row could not be evaluated (re-run with sudo) |
| `./dashboard.sh status` | unit, container, port, image, env file |
| `./dashboard.sh logs [-f]` | `journalctl -u ai-dashboard` |
| `sudo ./dashboard.sh restart` | restart, prove the container id changed, then `check` |
| `sudo ./dashboard.sh uninstall` | unit + the `ai-dashboard` container + the ufw rule it wrote. **Keeps** `/etc/ai-dashboard.env`. ⚠ It **names, and does not remove**, any other container running an `ai-dashboard` image under a different name; and the ufw rule is matched by text, CIDR included, so an install made with `--lan-cidr` needs the same flag here |

### Credentials — `/etc/ai-dashboard.env`, `root:10001` 0640, **mounted, not exported**

| key | set by | notes |
|---|---|---|
| `PASSWORD_HASH` | `set-password` | scrypt, `scrypt.<log2N>.<r>.<p>.<salt>.<key>`. At least 6 characters with a letter and a digit, enforced once and unverifiable afterwards |
| `SESSION_SECRET` | `configure`, **once** | 32 random bytes as hex. **Never rotated by the script** — rotating it logs out every open session |
| `STANDING` | you, by hand | comma-separated §6.4 condition ids to suppress. `check` reports any entry that matches nothing — including one padded with a non-breaking space or a BOM, which a paste from a document carries and which the browser trims and this cannot |

⚠ **`--purge` deletes the backups too.** Every write to this file first copies it to
`/root/ai-dashboard.env.bak.<timestamp>`, and those copies carry the same hash and the same
secret. `uninstall --purge` lists them and removes them with the file, after one typed
`DELETE`.

⚠⚠ **The two secrets are NOT environment variables — ruled 2026-09-11** (SPEC §5.1,
INSTALL-SPEC §11.2). `--env-file` copied `PASSWORD_HASH` and `SESSION_SECRET` into the
container's environment, where `docker inspect` shows them to every member of the `docker`
group and `/proc/1/environ` shows them to root. The unit now **bind-mounts this file
read-only** and the server parses it at startup; `check` asserts from the other side that
neither key is in `docker inspect`'s `Env`. `STANDING` stays an environment variable — it is
configuration, not a secret — and reaches the container as `docker run -e STANDING`.

⚠ **The mode is `0640 root:<the container's gid>`, not `0600 root:root`.** A container that
runs as `--user 10001:10001` cannot read a root-only file, and the dashboard would then deny
every login with nothing logged. Same shape as `/etc/llama-server.apikey`'s `root:yorman
0640`. The `/root` backups stay `0600`: nothing mounts those.

⚠ **The server's reader is STRICTER than Docker's grammar, and refuses at startup.** Docker
splits on the first `=`, takes the rest of the line verbatim, expands nothing and **keeps
quotes** — so `SESSION_SECRET="…"` is a secret with two quote characters baked into it, which
works today and kills every open session the moment the file is rewritten unquoted.
`lib/auth/secret-file.ts` refuses that, and a padded, multi-line, CRLF, BOM-bearing,
`$`-bearing, backtick-bearing, backslash-bearing or non-printable value, **naming the key and
the reason and never the value** — the container exits, systemd retries five times and the
unit lands in `failed`. `dashboard.sh check` applies the identical rule before writing, so
`configure` cannot produce a file the server will not start on.

⚠ **The file is read once, at startup — once for the PROCESS, not once per request.** A
`STANDING` change, or a new password, takes effect on `dashboard.sh restart` and never on the
next poll. That is a guarantee rather than a hope since 2026-09-11: the server's copies of the
reader share one read through a process-wide cell, because `next build` bundles the reader into
three server chunks and three independent memos meant that a file edited **in place** after
startup could make the gate and the routes deny every login while the startup check had already
passed and nothing was logged. If the file is ever refused by whichever entrance reads it first,
the reasons reach `journalctl` — at startup as a refusal to start, and from a request path as
*"the server is RUNNING and EVERY login … is now denied"*, once.

⚠ **A running container holds the file by INODE, so `set-password` cannot reach it.** Every
write here is a rename onto the path (which is what makes it atomic), and a bind mount pins the
inode the container opened at creation. `check` reads the new file, so **every row is green
while the container still has the old one** — `dashboard.sh` says so whenever a container is
running, and `restart` is the only thing that closes the gap.

### ⚠ Things that have already gone wrong on this box

- **`ufw enable` without a rule for port 22 took the machine off the network** (2026-09-04).
  A Precision 5820 has no BMC: recovery is a keyboard and a monitor. `dashboard.sh` never
  enables ufw and refuses to touch a firewall that is one rule away from locking you out.
  Check first, from a session you keep open: `sudo ufw show added`.
- **`systemctl is-active ufw` is green on a disabled firewall.** Ask ufw, not systemd.
- **An ordering cycle deletes a start job silently**, and only on a real boot. After any
  unit change: `journalctl -b | grep "ordering cycle"`.
- **After a kernel upgrade**, check DKMS for the 5-fan module (`dell-smm-5fan.sh status`)
  and the NVIDIA toolkit together: without the toolkit there is no GPU in the container.
  The dashboard **stays up** — the unit probes with `nvidia-container-cli info` and starts
  without `--gpus all` if it does not answer (INSTALL-SPEC §11.1), so the eight non-GPU
  panels keep working and the GPU panels read `—`. ⚠ **That fallback is decided once, at
  container creation, and outlives the fix**: fixing the toolkit changes nothing until
  `sudo ./dashboard.sh restart`. `check` reads the mode off the running container
  (`docker inspect … .HostConfig.DeviceRequests`), re-probes, and **fails** the row when the
  container is in fallback while the toolkit answers — that is the one actionable state.

## Configuring the wall panel

⚠ **§6.1's promise — no scrollbar and nothing clipped at 1280×1024 and 1600×1024 — holds
for any telemetry, but it assumes the browser's own defaults. That is an operating
requirement, ruled 2026-09-10, not a nicety.**

The browser showing this page must run at:

- **default font size** — a minimum-font-size setting of 16 px, with no telemetry involved
  at all, takes the alarm band from its 102 px reserve to 105.6 px: the page goes 2–3 px
  over at 1600×1024 and **27 px of the SAFETY panel disappears at 1280**;
- **100 % zoom.**

Both are checkable rather than hoped for: ten records in
`pipeline/steps/10-panels-assembly/measure-breakpoints.mjs` fail if they are not honoured.
If the panel must run at a larger font, re-run that measurement and treat the result as the
new promise — do not assume the layout absorbed it.

The page itself needs no configuration: log in once, and the browser keeps polling. Prefer
a kiosk profile whose settings cannot drift, and leave the tab visible — polling pauses on
`document.hidden` by design (§6.7).
