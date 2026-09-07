# `dashboard.sh` — specification

**Draft 1, 2026-09-07. Not built.** This is step 11's deliverable, specified now so it can be
reviewed against the finished backend and UI rather than written under deadline at the end.

`dashboard/dashboard.sh` (§2.4). **The only part of this project a person on the server touches
directly**, so it follows the repo's script conventions and not Node's: `set -euo pipefail`,
`bold`/`info`/`ok`/`warn`/`die`, `usage()` re-reading its own header comment, and **`--dry-run`
on every subcommand**.

It installs a container runtime, adds a third-party apt source, writes a credential, opens a
firewall port and installs a systemd unit — on a box documented as deliberately bare, whose one
hard outage was a script-shaped firewall change. Every one of those is enumerated below, and
every one is refusable.

---

## 0. The four decisions this spec rests on

Taken by the owner, 2026-09-07, after the facts were measured on the box.

| | Decision | The fact behind it |
|---|---|---|
| **GPU in the container** | **Add NVIDIA's apt repo** and install `nvidia-container-toolkit` | `docker.io` 29.1.3 **is** in Ubuntu 26.04's archive; `nvidia-container-toolkit` is **not**, and `apt-cache search nvidia-container` is empty. Without it every poll is `gpus: null` and both headline panels are permanently blank |
| **Source delivery** | **rsync from the Mac** | §2.3 requires the build on `ai-server` (arm64 Mac, x86_64 box). There is **no checkout on the box** — only loose `.sh` copies in `~` — and `dashboard-backend` has never been pushed |
| **ufw** | **The script adds the rule, defensively** | ufw reads `ENABLED=yes` and 8090 has no rule, so the container would start, bind, log nothing and answer nobody — which §8 notes looks exactly like a broken build |
| **Shape** | **Subcommands, with `install` orchestrating**, and **`install` fails on a failed `check`** | Matches `serve-llm.sh` and `gpu-fan-control.sh`. Every row of `check` detects something that produces no diagnostic anywhere else, so a warning at the end of a long run is a warning nobody reads |
| **The password hash** | **`python3` on the host**, via `scripts/hash-password.py` | The box has python3 and no Node. **This closes O23 entirely** — no CLI entry in the image, no `outputFileTracingIncludes`, no ordering constraint — at the price of a second producer, which is paid for by a cross-check test and nine mutations rather than by a warning |
| **Password policy** | **≥ 6 characters, at least one letter and one digit** | Enforced at `set-password` and unverifiable afterwards |

⚠ **`sudo` on this box requires a password** (measured). Nothing here can be driven
non-interactively from the Mac; the script is run **on the box, by a person**. That is also why
every prompt must be legible and every destructive step must announce itself first.

---

## 1. Subcommands

```
./dashboard.sh deps            # Docker + NVIDIA Container Toolkit          [root]
./dashboard.sh build [--tag SHA]  # docker build, tag :SHA and :latest      [root]
./dashboard.sh set-password    # prompt, hash, write PASSWORD_HASH          [root]
./dashboard.sh install         # everything, in order                       [root]
./dashboard.sh check           # the silent-failure detector                [no root needed for most]
./dashboard.sh status          # unit, container, port, image, env file
./dashboard.sh logs [-f]       # journalctl -u ai-dashboard
./dashboard.sh restart         # systemctl restart, then check              [root]
./dashboard.sh uninstall       # unit + container + rule; KEEPS the env file [root]
```

**Every one takes `--dry-run`**, which prints each intended write, command and file mode and
changes nothing. `install --dry-run` must be a complete, readable account of everything the
real run would do — it is the review surface for an operator who is about to hand a script
root on their only inference box.

### `install` runs, in this order, and the order is load-bearing

```
1. preflight          §2
2. deps               §3   ── apt, a new source, a daemon restart
3. build              §4   ── docker build from the rsync'd tree
4. set-password       §5   ── needs the image to exist  ⚠ O23
5. configure          §6   ── env file, SESSION_SECRET, STANDING
6. unit               §7   ── ai-dashboard.service
7. firewall           §8   ── ufw, defensively
8. start              §7
9. check              §9   ── ⚠ install FAILS if any row fails
```

⚠ **The order is a convenience, not a constraint — and that is a change.** It was a
constraint while the hasher lived in the image: the box has **no Node** (measured: `node
ABSENT`), so `set-password` could not run until `build` had produced something to run it in.
**`scripts/hash-password.py` removes that** (§5). `set-password` now works on a box with
nothing installed but python3, so it can be run first, alone, or long before any image exists.
`install` keeps this order because deps-then-build-then-credential reads correctly and fails
early, not because anything forces it.

**Idempotent throughout.** Re-running `install` on a working deployment must be a no-op plus a
`check`. Specifically: an existing `PASSWORD_HASH` is **kept, not re-prompted**; an existing
`SESSION_SECRET` is **never overwritten** (§5.1 — rotating it logs out every open session, the
same principle as `install` never repointing a live `llama-server` model); an existing ufw rule
is not duplicated; an unchanged image is not rebuilt unless `--force`.

---

## 2. Preflight — what it refuses to start on

Preflight runs **before anything slow or interactive**, so a failure names its cause instead of
timing out generically (repo convention). Every check prints what it found.

| Check | Refuse if |
|---|---|
| OS | not Ubuntu 24.04+ on x86_64 — the image is `node:24-slim`, glibc, amd64 |
| root | the subcommand needs it and `id -u` ≠ 0 |
| source tree | `~/ai-dashboard-src/package.json` missing, or its `name` is not `ai-dashboard` |
| disk | `/var/lib` has < 10 GB free — the build plus the image needs room (201 GB free today) |
| **NVIDIA driver** | `nvidia-smi` absent or non-zero **and** the toolkit is wanted. Warn, do not refuse: §3.1's "no compute GPU" is a documented state of this box |
| **ufw** | `ufw status` is enforcing **and** no rule covers port 22 — see §8. **Hard refusal** |
| **python3** | absent, and the subcommand is `set-password` or `install`. §5's producer is python; there is no fallback and no reimplementation in bash |
| conflicting listener | something already bound on 8090 that is not our container |

⚠ **It does not check the BIOS, the DKMS module or the fan service.** Those are
`gpu-fan-control.sh`'s and `dell-smm-5fan.sh`'s, and the dashboard **must never be a dependency
of anything that serves or cools** (§2.3). It reports their state in `check`; it never touches
them.

---

## 3. `deps` — Docker and the NVIDIA Container Toolkit

**Docker comes from Ubuntu's own archive.** `apt-get install -y docker.io`. No third-party
source, no `get.docker.com | sh`.

**The toolkit does not exist there**, so this adds the one third-party source on this box:

```
/etc/apt/keyrings/nvidia-container-toolkit.gpg          the dearmoured key
/etc/apt/sources.list.d/nvidia-container-toolkit.sources  deb822, with Signed-By pinned to it
```

Rules, each of which the repo has already paid for:

- ⚠ **A backup never goes inside a scanned `.d` directory.** Root `CLAUDE.md`, learned by doing
  exactly this to `ubuntu.sources`: `apt` warns on *every* invocation about an unrecognised
  extension there. Backups go to `/root/` with a timestamp.
- **`Signed-By` pins the key to that one source.** A key in `trusted.gpg.d` signs the whole
  archive list, which is how a third-party repo becomes able to replace `libc6`.
- **The `.sources` file is written whole, never appended to**, and its content is printed under
  `--dry-run`.
- **`nvidia-ctk runtime configure --runtime=docker` edits `/etc/docker/daemon.json`.** Back it
  up first (timestamped, to `/root/`), print the before and after, then
  `systemctl restart docker`.
- **Report the toolkit version and the driver version together**, and say plainly that they are
  coupled (§7 risk 2): **a driver upgrade that breaks the toolkit takes the GPU panels with
  it**, so it joins DKMS on the post-kernel-upgrade check. `check` prints both.

`deps --dry-run` prints the key fingerprint, the exact `.sources` content, the package list,
and the `daemon.json` diff — and installs nothing.

---

## 4. `build` — the image

Built **on the box**, from `~/ai-dashboard-src/`, which the operator rsyncs from the Mac:

```bash
# on the Mac, before running the script on the box
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude '*.tsbuildinfo' \
  dashboard/ ai-server:~/ai-dashboard-src/
```

- Multi-stage, `node:24-slim` for both stages (§2.5), `output: 'standalone'`.
- Tag **`ai-dashboard:<sha>` and `ai-dashboard:latest`** (§2.5). ⚠ **The box's copy is not a
  git checkout**, so the sha cannot come from `git rev-parse`. `build --tag <sha>` takes it as
  an argument; with no `--tag` it uses `notag-<UTC date>` and **warns loudly**, because an
  untagged image cannot be traced back to a commit.
- ⚠ **`.dockerignore` must exclude `node_modules`, `.next`, `out` and `*.test.ts`.** Route
  tests are colocated with routes (the Next convention) and nothing imports them, so they are
  not traced into `.next/standalone` — but `next build` type-checks everything in `tsconfig`'s
  `include`, so a build context carrying them needs `vitest` resolvable. Excluding them settles
  both.
- The build runs as root inside the image, so a plain `corepack enable` works (§10).
- **`pnpm install --frozen-lockfile`.** The lockfile carries every linux/x64 variant needed.

---

## 5. `set-password` — python3 on the host, cross-checked by the suite

**Decided 2026-09-07: the hash is produced by `python3` on the box, not inside the image.**
`scripts/hash-password.py` is the producer and it is version-controlled beside the app.

**The flow:**

1. Prompt twice with `read -rs`, no echo, and compare. **Never an argument** — it would land in
   shell history and `ps` (§5.1, the same reasoning as `--api-key-file`).
2. Pipe it **on stdin** into the script, which validates the policy and prints one line:
   `printf '%s' "$pw" | python3 scripts/hash-password.py`
3. **Exit 2 means the policy refused it** — reprompt, printing the script's own message, which
   names the rule that failed.
4. Write `PASSWORD_HASH=<hash>` into `/etc/ai-dashboard.env`, `install -m 0600 -o root -g root`.

### What this buys, and it is not small

**O23 dissolves.** Running the hasher inside the image needed a `dashboard-cli.js` kept in
`.next/standalone` by `outputFileTracingIncludes`, and it forced `set-password` to happen
*after* `build` — so an operator could not set a password until an image existed. **Neither
constraint survives.** `set-password` now works on a box with nothing installed but python3,
and `install`'s ordering is a convenience rather than a requirement.

### ⚠ What it costs, and how that cost is paid

**A second producer of a format whose only failure mode is a silent 401.** `parseScryptHash`
returns `null` for anything it does not recognise — including a hash that is correct but
spelled differently — and `null` is not an error: §5 logs nothing about authentication, so the
entire symptom is a clean empty 401 on every attempt and *a dashboard that will not open and
will not say why*.

This project has shipped that exact shape once: two base64url decoders diverged, and 1 tag in
16 had four accepted spellings. The lesson on HANDOVER's do-not-copy list is **never a second
implementation of a canonical format**.

**So the rule is kept by measurement rather than by discipline.**
`lib/auth/hash-password-script.test.ts` **runs the real file** and asserts that
`verifyPassword` — the server's own consumer — accepts what it produced. It also reads the
parameters back out of the encoded form, because a weaker `logN` is the divergence that *does
not* fail a login: it parses, it verifies, and it is simply not what §5.1 specifies.

**Nine mutations back it** (`Y1`–`Y9` in step 7's harness), each a plausible divergence that
produces a hash which looks fine: a dropped cost parameter, a shorter salt, base64url keeping
its padding, the standard alphabet instead of the URL one, a reused salt, each of the three
policy rules, and a refused password that prints a hash anyway.

⚠ **The two implementations share five constants** — `LOG_N`, `R`, `P`, `KEY_BYTES`,
`SALT_BYTES` — plus `MAXMEM`, and **nothing in either language holds them equal**. The
cross-check is what holds them equal. If `scripts/hash-password.py` is ever edited, that test
is the thing that must stay green.

⚠ **`MAXMEM` is not a tuning knob.** At these parameters the allocation is
`128 · 2^15 · 8` = **32 MiB exactly**, and OpenSSL's default ceiling is also 32 MiB — under
which `hashlib.scrypt` raises, exactly as `crypto.scrypt` does. Node hit it first;
`SCRYPT_MAXMEM` in `scrypt.ts` and `MAXMEM` here exist for the same reason and must agree.

### §5.1's password policy

**At least 6 characters, containing at least one letter and at least one digit.**

Enforced in `scripts/hash-password.py` and **nowhere else**, because that is the only moment
anyone sees the password. ⚠ **A policy applied at set time is unverifiable at every later
time**: `dashboard.sh check` is handed a *hash*, so it can confirm the hash parses and can
never confirm the password behind it met the rule. Said plainly here because "check validates
the password" is the natural wrong assumption.

The script exits **2** and names the failing rule on stderr; it prints **no hash at all**, so a
refused password can never be written by a caller that ignored the exit code.

## 6. `configure` — the env file

`/etc/ai-dashboard.env`, **`root:root` 0600**, written with `install -m 0600 -o root -g root`.

| key | written by | rule |
|---|---|---|
| `PASSWORD_HASH` | `set-password` | §5 |
| `SESSION_SECRET` | `install`, **once** | 32 random bytes as **hex** (64 chars). Never overwritten — rotating it logs out every session (§5.1) |
| `STANDING` | the operator, by hand | Comma-separated condition ids (§6.4). `install` writes `STANDING=` if absent |

⚠ **Docker's `--env-file` grammar is not a shell's** (§2.5, O21). It splits on the **first**
`=`, takes the rest of the line verbatim, expands nothing and **keeps quotes**. So
`SESSION_SECRET="…32 chars…"` is a 34-character secret with two quote characters baked in: it
**passes** the length floor, produces a working dashboard, and every session dies the moment
anyone rewrites the file unquoted. **Every value is single-line, unquoted, no surrounding
whitespace, and free of `$`.** Hex for the secret is deliberate — `[0-9a-f]` cannot collide
with any of that.

⚠ **A change to `STANDING` needs a container restart, not a poll** (§4, corrected 2026-09-07).
`--env-file` is read once at `docker run`. `dashboard.sh restart` is the supported way to apply
one, and `check` says so when `STANDING` is non-empty.

**Backups:** before any rewrite, copy to `/root/ai-dashboard.env.bak.<timestamp>`, **mode 0600**
— it carries a password hash. Not into `/etc/` beside the original, where a future `.d`-style
glob or a careless `cat /etc/ai-dashboard.env*` would find it.

---

## 7. The container and the unit

### The `docker run` line, and why each flag is there

| flag | source | note |
|---|---|---|
| `--name ai-dashboard` | §2.5 | |
| `--network host` | §2.1 | ⚠ **Not `-p 8090:8090`.** Publishing inserts rules into `DOCKER`/`FORWARD`, evaluated **before** ufw's `INPUT` — the port becomes reachable from anywhere routable whatever ufw says. On a box whose firewall has already been found silently not enforcing once, a second firewall-invisible listener is not acceptable. Host networking also gives `/proc/net/dev` for `eno1` |
| `--read-only --tmpfs /tmp` | §2.5 | ⚠ **means no `next/image`** — the optimiser writes a runtime cache. There are no raster images in this UI; `lib/contract.test.ts` fails the suite if `next/image` ever appears |
| `--user 10001:10001` | §2.5 | non-root, no shell |
| `--pid host` | §2.2 | `/proc/stat`, `/proc/meminfo`, `/proc/loadavg`, `/proc/net/dev` |
| `--gpus all -e NVIDIA_DRIVER_CAPABILITIES=utility` | §2.2 | brings `nvidia-smi` + NVML |
| `-e UV_THREADPOOL_SIZE=16` | §2.5 | ⚠ **Margin behind §4's outstanding-call rule, not a substitute for it.** libuv's default 4 is below `collectHost`'s nine concurrent reads on a healthy poll; raising it moves the saturation threshold and does not remove it |
| `--env-file /etc/ai-dashboard.env` | §2.5 | read by the **client**, as root, on the host — which is why 0600 root:root is correct and the container never sees the file |
| `--log-driver json-file --log-opt max-size=10m --log-opt max-file=3` | §2.5 | |
| `--rm` | — | with `ExecStartPre=-docker rm -f`, so a stale container cannot block a restart |
| the ten `-v … :ro` mounts | §2.2 | `/sys`, `/`, `/home`, the D-Bus socket, `/etc/llama-server`, `/etc/ufw/ufw.conf`, `/lib/modules`, `/etc/hostname` |

⚠ **No `--restart` policy, and no `HEALTHCHECK` that restarts.** systemd owns restarts; a Docker
policy would fight it and restart outside its control. And §2.5: *"a dashboard that cannot read
a sensor must stay up and say so — restarting it would destroy the browser's whole session
buffer to fix nothing."*

### `ai-dashboard.service`

```ini
[Unit]
Description=ai-server dashboard
Wants=docker.service
After=docker.service sysinit.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
ExecStartPre=-/usr/bin/docker rm -f ai-dashboard
ExecStart=/usr/bin/docker run … (foreground)
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Three traps, all of which this repo has already paid for in full:

1. ⚠ **`StartLimitIntervalSec` and `StartLimitBurst` go in `[Unit]`, not `[Service]`.** systemd
   moved them in v229 and **silently ignores them** in `[Service]`, falling back to a 10 s
   window that `RestartSec=10` can never fill — so a broken instance retries for ever. Verify
   with `systemctl show ai-dashboard -p StartLimitIntervalUSec`, and `install` must do that
   check rather than trusting the file it just wrote.
2. ⚠ **Never `After=multi-user.target`.** A unit that is `After=` a target that `Wants` it is an
   ordering cycle, and systemd breaks a cycle by **silently deleting the start job** — which is
   how both `llama-server` instances failed to come up on 2026-08-28 with no failed unit and no
   error anywhere. **This class of bug only appears on a real boot**; `systemctl restart` can
   never reproduce it. `install` runs `journalctl -b | grep "ordering cycle"` afterwards and
   `check` repeats it.
3. ⚠ **Nothing that serves or cools may depend on this unit** (§2.3). No other unit gains a
   `Wants=` or `After=` naming it.

---

## 8. `firewall` — the one step that has already taken this box off the network

**Hard refusal first.** If ufw is enforcing and **no rule covers port 22**, the script
**stops** and prints why. `ufw enable` without a port-22 rule is exactly what made this box
unreachable on 2026-09-04, and a Precision 5820 is a workstation with **no iDRAC/BMC** —
recovery is a keyboard and a monitor.

Then, in order:

```bash
sudo ufw show added                                            # lists rules, activates nothing
sudo ufw allow from 192.168.4.0/22 to any port 8090 proto tcp  # applies immediately
sudo ufw status numbered
```

- **`show added` first, and its output printed**, because it is the one command that tells you
  what is there without changing anything.
- **The script never runs `ufw enable`.** ufw already reads `ENABLED=yes`; if it ever does not,
  the script says so and stops. Enabling a firewall is not something this script does.
- **The source range is `192.168.4.0/22`**, matching the rule `serve-llm.sh` writes for
  8080/8081. `install --lan-cidr` overrides it.
- Under `--dry-run`, all three commands are printed and none is run.

⚠ **What the dashboard can and cannot say about this afterwards.** `/etc/ufw/ufw.conf` is
world-readable and `/etc/ufw/user.rules` is root-only, so §3.6's SAFETY row answers *"is the
firewall on"* and **never** *"is this port allowed"*. It reports the box's posture — which is
what 8080/8081 need — not its own reachability. A dashboard you can load is already the
evidence for that.

---

## 9. `check` — the silent-failure detector

**This is the most valuable subcommand, because §5 logs nothing about authentication.** An
unparseable hash, a quoted secret and a second process all produce a dashboard that misbehaves
with **no diagnostic anywhere**. `check` is the only place any of them can be noticed.

| # | Check | Why it cannot be caught any other way |
|---|---|---|
| **O20** | `PASSWORD_HASH` parses as `scrypt.<log2N>.<r>.<p>.<salt>.<key>` — verified by running it through the image, not by a regex here | A correct **argon2id** hash is refused by the server and produces a clean empty 401 on every attempt, with nothing logged. *A dashboard that will not open and will not say why* |
| **O21** | `SESSION_SECRET` is ≥ 32 chars **and contains no quote character** and no `$` | A quoted 32-char secret **passes** the floor as a different secret, works, and dies the moment the file is rewritten unquoted |
| **O22** | **Exactly one** container and one node process serves every request — `docker ps` and `docker top ai-dashboard` | Three process-global objects depend on it and two fail **open**: `DELETE /api/session` stops working for requests landing on the other instance, and §5's global rate limit becomes N× looser. **Nothing in the test suite can see this**, because the suite runs one process by construction |
| **O23** | ~~The image contains the CLI entry~~ — **closed.** `scripts/hash-password.py` needs nothing from the image | — |
| **new** | `scripts/hash-password.py` is present and executable on the host, and `python3 --version` answers | §5's producer is the only way to set a password; its absence is discovered at the moment someone needs it |
| **D8** | Every `STANDING` entry matches a condition kind or id | A typo suppresses **nothing** and the banner stays nailed open, with no error. The client already computes this list as `state.unknownStanding` |
| — | env file is `root:root 0600`, single-line, unquoted values | |
| — | `journalctl -b \| grep "ordering cycle"` is empty | Only observable on a real boot |
| — | `systemctl show ai-dashboard -p StartLimitIntervalUSec` is 300 s | Proves the keys landed in `[Unit]` |
| — | ufw enforcing, and a rule covers 8090 and 22 | |
| — | toolkit version **and** driver version, side by side | They are coupled; a driver upgrade can take the GPU panels |
| — | `GET /api/telemetry` without a cookie is **401** | The gate is `proxy.ts`; a file left at `middleware.ts` **simply never runs** and every route is open with nothing in any log |

⚠ **What `check` structurally cannot do: validate the password.** It is handed a *hash*. It
confirms the hash parses as §5.1's encoding and that the server would accept its shape; it can
never confirm the password behind it was six characters with a letter and a digit. §5.1's policy
is enforced once, at `set-password`, and is unverifiable at every later time.

**The standing rule from this repo applies to every row: writing the config is not evidence it
took. Ask the system what it actually ended up with.**

`check` exits non-zero if any row fails, so it is usable from `install` and by hand.

---

## 10. `uninstall`

Stops and disables the unit, removes it, `docker rm -f ai-dashboard`, `daemon-reload`, and
removes the ufw rule for 8090.

**It keeps `/etc/ai-dashboard.env`** — the same choice `serve-llm.sh uninstall` makes about the
API key. Deleting a password hash and a session secret because someone was reinstalling is not
a decision a script should take. `--purge` removes it, after printing the path and requiring a
typed confirmation.

**It does not remove Docker, the NVIDIA toolkit, the apt source, or the image.** `--purge-image`
removes the images; the apt source and the runtime stay, because uninstalling a container
runtime from under whatever else may have started using it is not this script's call.

---

## 11. What this spec asks of the dashboard code

Two prerequisites that are **not** script work and must land in step 11 alongside it:

1. ~~`dashboard-cli.js` and `outputFileTracingIncludes`~~ — **no longer needed.** §5's producer
   is `scripts/hash-password.py`, which needs nothing from the image. **O23 is closed**, and
   with it the tracing dependency and the ordering constraint.
2. **`.dockerignore`** excluding `node_modules`, `.next`, `out`, `*.test.ts`.
3. ⚠ **`scripts/hash-password.py` must ship to the box** alongside `dashboard.sh`. It is
   excluded from the *image* (nothing in the container hashes a password) but it is **required
   on the host**, so the rsync in §4 must carry it — a `--exclude` that dropped `scripts/`
   would leave `set-password` broken with a clear error rather than a silent one, which is the
   right failure but still a failure.

And one that is already recorded and unblocked: **D8**, the `STANDING` plumbing, verified in
step 12.

---

## 12. Open questions for review

Recorded rather than guessed (invariant 7).

1. ~~Is there a minimum password length?~~ **Answered 2026-09-07: at least 6 characters, with
   at least one letter and at least one digit.** Implemented in `scripts/hash-password.py`,
   tested on both sides of each boundary, and backed by `Y6`–`Y8`. ⚠ It is unverifiable
   afterwards — see §5.
2. ~~Should `install` run `check` and fail, or warn?~~ **Answered: `install` FAILS on a failed
   `check`.** It runs `check` as its last step and exits non-zero if any row fails, leaving the
   unit installed and running so the operator can read `status` and `logs`. The reasoning is
   §9's: every row of `check` detects something that produces **no diagnostic anywhere else**,
   so a warning printed at the end of a long run is a warning nobody reads. ⚠ **Consequence to
   accept:** a box with a pre-existing `STANDING` typo, or a second container someone started
   by hand, cannot be installed onto until that is fixed — which is the point.
3. **`--lan-cidr` default.** `192.168.4.0/22` matches `serve-llm.sh`. Worth confirming it is
   still right at deploy time — the box's address has already drifted once, when the reinstall
   regenerated `/etc/machine-id` and the DHCP reservation stopped binding.
4. **Where does `~/ai-dashboard-src/` live, and who owns it?** Written as the operator's home;
   the build runs as root. A root-owned tree in a user's home is mildly untidy, and the
   alternative (`/opt/ai-dashboard-src`) needs the rsync target to change.
5. **Log retention.** `max-size=10m max-file=3` is 30 MB of container logs on top of journald's
   own copy of the same lines, since `ExecStart` runs in the foreground. Possibly redundant.
