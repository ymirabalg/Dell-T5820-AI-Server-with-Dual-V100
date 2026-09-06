# CLAUDE.md

## What this repo is

Early-stage, and still only shell scripts that set up a remote box:

- `setup-ssh-key.sh` — authorizes this Mac's SSH key on the server (default
  `192.168.4.31`) so Claude and the user can run commands there non-interactively.
- `provision-base.sh` — grows the root LV and installs base tooling. Runs on the server.
- `gpu-fan-control.sh` — drives a chassis fan header from GPU temperature. Runs on the
  server. See *Fan control* below; it encodes a lot of hard-won Dell EC detail.
- `dell-smm-5fan.sh` + `dell-smm-5fan.patch` — rebuilds `dell-smm-hwmon` out of tree with
  `DELL_SMM_NO_FANS=5` so the board's 5th (PCIe/GPU) fan header becomes addressable at
  all. Runs on the server; only `load`/`unload` need root. See *The 5th fan header*.
- `serve-llm.sh` — one `llama-server` systemd instance per GPU, each with its own model.
  Runs on the server. See *Serving*.
- `hf-get.sh` — multi-stream Hugging Face downloader with per-chunk resume and
  verification. HF throttles a single connection to ~5 MB/s; this is the way to fetch a
  model. Runs anywhere.
- `gpu-bench.sh` / `thermal-soak.sh` — load generators used to measure the thermal
  numbers throughout this file. Run on the server. (`~/serve-soak.sh` on the box loads
  the LIVE endpoints instead, and needs no service stop.)

There is no application code, build system, test suite, or package manifest yet — do
not assume one exists.

It IS a git repository (branch `main`) as of 2026-08-27 — an earlier version of this
file said otherwise. Commit only when asked.

## The remote host

The intended workflow is *local Mac drives a remote Linux server over SSH*. Work that
belongs on the server (installing services, running models, editing server-side config)
should be done with `ssh`, not by creating local files that someone then has to copy.

Bootstrap, from the Mac (not on the server):

```bash
./setup-ssh-key.sh                          # prompts for user, defaults to 192.168.4.31
./setup-ssh-key.sh yorman@192.168.4.31      # explicit user@host
./setup-ssh-key.sh -a ai-server yorman@...  # also writes a ~/.ssh/config alias
./setup-ssh-key.sh --print-key              # no network; prints commands to paste on the server
```

The script is idempotent: if the key is already authorized it skips `ssh-copy-id`
entirely and only verifies. Re-running it is safe.

Once it succeeds, non-interactive SSH works and is the normal way to touch the server:

```bash
ssh yorman@192.168.4.31 'uname -a'
```

A `Host ai-server` alias exists in `~/.ssh/config` as of 2026-08-15, so `ssh ai-server`
is the preferred form — it pins `HostName`, `User`, `IdentityFile` and `IdentitiesOnly`,
and means a future IP change is a one-line edit there rather than a repo-wide
find-and-replace.

Key auth confirmed 2026-08-17. Account `yorman`, hostname now **`ai-server`** (renamed
from `aiserver` during the reinstall). Current address is **`192.168.4.71`**, and the key
is **`~/.ssh/id_github`**, not `id_ed25519` — the `ai-server` alias in `~/.ssh/config` is
set to both.

**Ubuntu was reinstalled on 2026-08-16** (legacy BIOS → UEFI). That wiped everything
built on the box: DKMS 5-fan module, `gpu-fan-control` service and config, the `~/`
scripts, and the authorised SSH key. All of it rebuilds from this repo; none of it has
been redone yet, deliberately, until the V100 boot problem is settled.

**The DHCP reservation no longer binds.** The box was pinned to `192.168.4.31`, but the
reinstall regenerated `/etc/machine-id`, which changes the DHCP client identifier; the
router keys the reservation on client-ID rather than MAC, so it landed on `.71` instead.
The MAC is unchanged (see `ip link show eno1`). To pin it again either set
`dhcp-identifier: mac` in netplan so the existing MAC-based reservation applies, or
re-reserve `.71`. Until one of those is done, expect the address to drift.

## Server specs (surveyed 2026-08-08)

| | |
|---|---|
| Chassis | **Dell Precision 5820 Tower**, board 002KVM, BIOS 2.48.0 (see below — do not "update") |
| OS | Ubuntu 26.04 LTS, kernel 7.0.0-29-generic |
| CPU | Intel Xeon W-2135 — 6C/12T @ 3.7 GHz, 4.5 GHz boost, x86_64 |
| RAM | 61 GiB + 8 GiB swap |
| GPU | GT 1030 (temporary display card). 1× V100 32 GB owned but **will not POST** — see below. 2× planned |
| Storage | `nvme1n1` 238.5 GB = `/` + `/boot/efi`; `nvme0n1` 931.5 GB Crucial = `/home` (enumeration order flipped after the reinstall) |
| Network | `eno1`, **192.168.4.71**/22, wired (MAC via `ip link show eno1`) |
| Cooling | 4 EC fan channels, all manually controllable (see *Fan control*) |

## The V100 POST problem — SOLVED 2026-08-17

**Symptom:** with one V100 (32 GB) installed the machine power-cycles 3–4 times, then sits
on a black screen. It **never reaches POST or GRUB** — no Dell logo. This is the documented
Precision 5820 + Tesla boot loop.

**CONFIRMED CLEANLY 2026-08-17, after eliminating every confound.** The earlier rounds were
muddied by two independent problems masquerading as one: a *video-routing* fault (Primary
Video had been pointed at an empty slot, so nothing reached the monitor even when firmware
was healthy) and the POST failure itself. After an RTCRST clear and re-applying all
settings, a verified-good baseline was established — GT 1030 only, Dell logo shown, Ubuntu
booted, SSH reachable, both NVMe visible. Installing the V100 into that known-good state
reproduced the failure: **no Dell logo.** One variable, one result.

Two lessons worth keeping: **"fans steady" is NOT a POST indicator on this box** — it looks
identical whether firmware completed or hung, and judging by it produced a false "the V100
alone POSTed" conclusion that wasted hours. Use the **power-button blink code** (solid white
= S0, no fault; 3-2 = PCI/video) and a **USB keyboard's Num Lock LED** instead. And a
missing Dell logo says nothing on its own while Primary Video may be misrouted.

### THE FIX (verified working)

Dell zeroes `SocketCommonRcConfig.MmiohBase`/`MmiohSize`, disabling the 64-bit
prefetchable MMIO window, and removed the menu that would set them. Write the variable
directly from a UEFI Shell. **On this machine, after the fix:**

```
97:00.0 3D controller: NVIDIA GV100GL [Tesla PG500-216]
  Memory at 38b000000000 (64-bit, prefetchable) [size=32G]   <-- BAR1, full size
```

Variable: `SocketCommonRcConfig`, GUID `4402ca38-808f-4279-bcec-5baf8d59092f`,
**DataSize `0x73` (115 bytes)** on this board.

| offset | field | shipped | set to |
|---|---|---|---|
| bytes 0–1 | `MmiohBase` | `00 00` | `00 02` (0x0200 = 512 GB) |
| bytes 4–5 | `MmiohSize` | `00 00` | `04 00` (0x0004 = 256 GB) |

**Change ONLY those four bytes; preserve everything else.** This board's bytes 12–13 are
`08 06` — different from both the BIOS defaults (`00 00`) and the 7920T (`06 06`), and
its DataSize is 115 bytes vs the 7920T's 114. Pasting a payload from any other model
corrupts platform topology. Always `dmpstore` first and edit your own bytes.

Working command (this machine's exact payload):

```
setvar SocketCommonRcConfig -guid 4402ca38-808f-4279-bcec-5baf8d59092f -bs -rt -nv =H0002000004000102000100000806000000...(zeros to 115 bytes)
```

`apply.nsh` / `restore.nsh` on the DELL USB stick automate apply and rollback, and both
re-dump the variable to verify. Boot the stick via F12 (it has `/EFI/BOOT/BOOTX64.EFI`,
UEFI Shell 2.2).

**⚠ Entering BIOS Setup can reset this variable.** Apply all Setup changes FIRST, then
write the variable, then do not re-enter Setup. If you must, re-run `apply.nsh` after.

**Do this work with the V100 removed** — with it installed there is no video at all.

The BIOS image itself was extracted with BIOSUtilities (`main.py -u DellPfsExtract`) from
`Precision_5820_2.48.0.exe`; Dell wraps firmware in a PFS container, which is why
UEFITool/IFRExtractor alone find nothing. The `NVAR` entry sits at `0x2305`.

**Therefore the failure is entirely in firmware, and nothing OS-side can help.**
`pci=realloc=on`, kernel parameters, driver versions and Secure Boot are all irrelevant —
they only matter for the *different* failure where the machine boots but the driver
reports `BAR1 is 0M @ 0x0`. Do not spend time there while the symptom is a boot loop.

**Root cause (confirmed on the 7920T, the Purley-generation sibling):** Dell ships
`SocketCommonRcConfig.MmiohBase = 0` and `MmiohSize = 0`, disabling the 64-bit
prefetchable MMIO window the V100 needs for its 16/32 GB BAR1 — *even with* "Memory Map
IO above 4GB" enabled. Dell kept the variable functional but removed its BIOS menu.

Already done and ruled out: UEFI mode, Memory Map IO above 4GB enabled, Intel VMD
disabled, SATA in AHCI, Primary Video hard-set to Slot 2 (the display card), genuine
CPU/EPS 8-pin power cable, BIOS at its safe ceiling of 2.48.0. Not present in this
board's menu: "BIOS Hot-Plug Support", "Limit System Memory to less than 1TB" (the latter
is irrelevant anyway at 61 GiB — it exists to relocate the memory map on dual-socket
boards addressing >1 TB).

Still untried, cheapest first: **PCIe Bus Allocation → Option 1** (directly governs PCIe
resource allocation), then the **other x16 slot**. After that, writing
`SocketCommonRcConfig` from a UEFI Shell — but extract *this* board's variable layout with
IFRExtractor-RS first rather than reusing the 7920T payload, since it is a dual-socket
board. **Undo path: the RTCRST jumper** (PSWD cap → RTCRST, power 10 s, unplug, restore)
clears NVRAM per Dell's documented procedure, so a bad `setvar` is physically
recoverable. Have the case open before starting.

Note the 7810/7910 are *not* a safer platform: no V100 success stories exist for them,
and they are a generation older, so none of the Purley-era fix transfers.

## BIOS: 2.48.0 is the ceiling — do not chase a newer one

**Never install BIOS 2.50.1.** It exists, it is newer than 2.48.0, and Dell **withdrew
it**: *"BIOS 2.50.1 has been removed from the Dell website and support applications."*
It breaks **USB keyboard input inside BIOS Setup** — menu navigation dead, F12 boot menu
unresponsive, BitLocker PIN unenterable; mice still work and the Caps/Num Lock LEDs still
respond, so it looks like a dead keyboard rather than a BIOS bug. On a machine whose GPU
problems are being chased *through BIOS settings*, losing Setup navigation would be
severe. 2.48.0 is named in Dell's own thread as the last good version. A parallel 2.52.1
problem hit the 7820/7920. Dell announced no replacement (checked 2026-08-17).

Consequence: BIOS updates are **not** an available lever for the V100 boot problem, and
`fwupdmgr` cannot help either — there is an open fwupd issue that 5820 BIOS updates are
absent from LVFS. Re-check only if Dell publishes something above 2.50.1.

## Serving (commissioned 2026-08-27)

`serve-llm.sh` runs **one `llama-server` instance per GPU**, each pinned to its own card,
as a systemd template unit. Runs on the server; install/uninstall/set-model need root.

**This box does not run Ollama and never has** — `which ollama` is empty. The stack is
llama.cpp's `llama-server` behind systemd, and models are plain GGUF files in
`~/models/`. Ollama-style tags (`gemma4:12b-it-q8_0`) have to be translated to a repo
and filename before `hf-get.sh` can fetch them.

```bash
./serve-llm.sh check              # preflight: binary, models, per-card fit, ufw, cooling
sudo ./serve-llm.sh install       # key + template + env files + ufw, enable & start all
sudo ./serve-llm.sh set-model N MODEL [ALIAS] [CTX]   # repoint ONE instance
./serve-llm.sh status             # every instance, port, model, VRAM, temperature
./serve-llm.sh test               # round-trip through each instance
sudo ./serve-llm.sh uninstall     # remove units and ufw rule (keeps the key)
```

**Each instance carries its own model**, since 2026-09-04. `MODEL`/`ALIAS`/`CTX` live
next to `PORT` in `/etc/llama-server/<i>.env` and the single template unit substitutes
`${MODEL}` etc. from the `EnvironmentFile`; the cards no longer have to serve the same
thing. Two rules that fall out of that:

- **`install` never repoints a live instance.** It rewrites `PORT` (which it owns) but
  keeps any `MODEL`/`ALIAS`/`CTX` already in the env file, so re-running it to fix a
  unit or a firewall rule cannot silently swap a card's model. `set-model` is the only
  thing that changes one.
- **`set-model` rolls back.** It backs up the env file, restarts, and polls `/health`;
  if the instance dies — a bad path, an OOM at that context — it restores the old env
  and restarts on the previous model rather than leaving the card with no server while
  systemd burns through its start limit.

Live configuration (2026-09-06):

| instance | endpoint | GPU | model | ctx | VRAM |
|---|---|---|---|---|---|
| `llama-server@0` | `http://192.168.4.71:8080/v1` | 0 | Qwen3.6-27B Q4_K_M (`qwen3.6-27b`) | 131072 | 26452 / 32768 MiB |
| `llama-server@1` | `http://192.168.4.71:8081/v1` | 1 | Qwen3.6-27B Q4_K_M (`qwen3.6-27b`) | 131072 | 26650 / 32768 MiB |

Both `--split-mode none`, `--parallel 1`, `FA=auto`, `SPEC=none`. Verified end to end
from another LAN host: authenticated chat completions work on both, inference without the
key is 401, and wall-clock generation is **31-32 t/s** on both within 4 %.

Gemma 4 12B and Qwen3.5-35B-A3B were both run on instance 0 during 2026-09-04/06 and both
returned to the dense 27B; their measurements are below and the weights are still in
`~/models`. **When the ports carry DIFFERENT models the "one agent per port" rule stops
being about efficiency and becomes about correctness** — round-robin would swap models
mid conversation, not merely lose the KV cache. With both on the same model it is back to
being only a prefill cost.

**⚠ THE FIREWALL WAS NEVER ENFORCING — found 2026-09-04, and the check that hid it was
ours.** `serve-llm.sh` gated its ufw work on `systemctl is-active --quiet ufw`, which was
green. `ufw status` said `Status: inactive`, and `/etc/ufw/ufw.conf` said `ENABLED=no`:

```
systemctl is-active ufw   -> active      systemctl is-enabled ufw -> enabled
/etc/ufw/ufw.conf         -> ENABLED=no  /etc/ufw/user.rules      -> rule present, unused
```

**`ufw.service` is a oneshot that applies rules only when `ENABLED=yes` and reports
`active (exited)` either way**, so `is-active` is green on a disabled firewall. `install`
had written the `allow from 192.168.4.0/22` rule successfully into a firewall that never
loaded it, and 8080/8081 sat open to anything routable — with only the API key gating
inference — from 2026-08-27 to 2026-09-04. Ask ufw, not systemd: `ufw_enforcing()` now
reads `ufw status` as root and `ufw.conf` otherwise, and `install` still writes the rule
but says loudly when it is not in force. **Not yet fixed on the box — `sudo ufw enable`
is still outstanding.** Textbook case of the rule below: writing the config is not
evidence it took.

**⚠ ENABLING IT LOCKED SSH OUT — 2026-09-04, same day.** `sudo ufw enable` was run
without an allow rule for port 22, and the box went unreachable. Read the symptom
carefully, because it names its own cause:

| observation | what it means |
|---|---|
| `ping` 0 % loss | machine is up; ufw's `before.rules` permits ICMP echo |
| tcp/22 **times out** | a DROP rule. A dead `sshd` gives *connection refused* instantly |
| 8080/8081 still answer | ufw IS enforcing, and the LAN rule works — only 22 was missed |

**An already-established SSH session survives `ufw enable`** — `before.rules` permits
`ESTABLISHED,RELATED` — so the fix is to run this in a session you already have open,
and NOT disconnect until a fresh connection is verified:

```bash
sudo ufw allow from 192.168.4.0/22 to any port 22 proto tcp   # applies immediately
sudo ufw status numbered
```

**With no session left open there is no remote path back.** The only reachable ports are
the inference endpoints, which cannot run commands, and a Precision 5820 is a
workstation with **no iDRAC/BMC** — recovery is the keyboard and monitor on the display
card. Before ever running `ufw enable` here, check the rule exists first:
**`sudo ufw show added` lists added rules without activating anything.**

**The API key does not gate everything, by llama.cpp's design.** Measured 2026-09-04:

| endpoint | no key |
|---|---|
| `/v1/chat/completions`, `/v1/completions`, `/completion`, `/props` | **401** |
| `/health`, `/v1/models` | **200** |

So an unauthenticated host can discover that the server is up and what the model is
called, but cannot run a token through it. Do not describe the endpoints as "401 without
a key" without that qualification.

**Why these choices, all measured — do not "optimise" them without re-measuring:**

- **`-sm none`, not layer-split.** Splitting gains nothing for a per-GPU instance and
  adds cross-card traffic. (It *does* help when one instance spans both cards.)
- **Q4_K_M, not Q6_K/Q8_0.** Decode is bandwidth-bound, so Q6_K costs ~26 % generation
  for ~1-2 points of benchmark. Q8_0 (~31 GiB) does not fit one card alongside KV.
- **128K context.** Per card: 18211 MiB weights + ~370 MiB fixed buffers + **~65 KiB per
  token** of KV (GQA, few KV heads). 131072 -> 26452 MiB with ~6.3 GiB spare; **262144
  is a confirmed OOM.**
- **`--api-key-file`, never `--api-key`.** The latter is visible in `ps` to every user.
  Key at `/etc/llama-server.apikey`, `root:yorman` 0640 so the unprivileged service can
  read it and no other account can.
- **`--chat-template-kwargs '{"enable_thinking":false}'`.** Qwen3.6 is a reasoning model:
  without this it fills `reasoning_content` and leaves `content` EMPTY until it finishes
  thinking, which most OpenAI-compatible clients read as a broken server. Clients that
  want thinking send `"chat_template_kwargs":{"enable_thinking":true}` per request —
  verified to work in both directions.
- **No load balancer.** `llama-server` caches KV per slot, so a request landing on the
  same instance as the previous turn skips prefill entirely. A full 128K re-prefill costs
  ~140 s at 930 t/s. Round-robin would destroy that every turn. **Assign one agent per
  port.** Note `ip_hash` stickiness fails if all agents share one client machine.

### Gemma 4 12B on GPU 0 — added 2026-09-04

`ggml-org/gemma-4-12B-it-GGUF` / `gemma-4-12B-it-Q8_0.gguf`, 12.67 GB, fetched with
`hf-get.sh` and verified by size + GGUF magic. That repo also holds a `mmproj-*` (vision
tower — Gemma 4 is `any-to-any`, and the instance is TEXT-ONLY without `--mmproj`) and
`mtp-*` files for the multi-token-prediction head; neither is loaded.

**Context is nearly free on this model, unlike Qwen — the architectures are not
comparable.** Gemma 4 is 5:1 sliding-window: of 48 layers, 40 are SWA with a 1024-token
window (8 KV heads x 256) and only 8 are global (**one** KV head x 512). So the term
that scales with context is 8 x 1 x 512 x 2 x 2 B = **16 KiB/token**, against Qwen's
~65 KiB. Measured by loading it CPU-only and reading `RssAnon` — 4.66 GiB of KV +
compute buffers at the full **262144**, over 11.84 GiB of Q8_0 weights, ~16.5 GiB total.
**Its entire native 262K window fits on one V100**; 131072 is what is configured, and
lands at a measured 15188 MiB.

**⚠ THE CPU-LOAD SIZING TRICK NEEDS `--no-repack`, or it lies.** The method is: load the
model CPU-only and read `RssAnon` from `/proc/<pid>/status` — `RssFile` comes out as the
mmap'd weights, `RssAnon` as everything allocated. It sizes a model **without touching the
GPUs or stopping a live instance**, which is its whole value. But llama.cpp rewrites
quantized weights into a CPU-optimised layout on load (`--repack`, **on by default**),
and that allocation lands in `RssAnon` where it looks exactly like KV cache. It does NOT
happen on CUDA. Measured on Qwen3.5-35B-A3B at ctx 131072, 2026-09-06:

| | RssAnon |
|---|---|
| default (repack on) | 13.87 GiB |
| `--no-repack` | **2.74 GiB** |

The first number would have said the model needed 34.4 GiB and could not run at 131072;
the truth was 23.6 GiB measured on the card. Gemma escaped this — Q8_0 is barely
repacked, so its numbers above are sound — which is exactly why the bug stayed hidden.
**Always pass `--no-repack` when sizing.**

**Check the build knows the architecture before planning around a new model:**
`strings llama.cpp/build/bin/libllama.so.* | grep -x gemma4` — this build has `gemma4`
and `gemma4-assistant`. A missing arch fails at load, after the download is paid for.

**Gemma 4 uses the SAME `enable_thinking` template variable as Qwen, and defaults it to
false** (`{%- set enable_thinking = enable_thinking | default(false) -%}`). So the unit's
`--chat-template-kwargs '{"enable_thinking":false}'` is correct for it rather than dead
Qwen-specific config, and clients opt in per request with
`"chat_template_kwargs":{"enable_thinking":true}`. Verified both directions: off gives
populated `content` and empty `reasoning_content`; on fills `reasoning_content`
separately while `content` still carries the answer.

`--jinja` is **on by default** in this build (`--jinja, --no-jinja ... (default:
enabled)`), so the model's own template — including Gemma 4's tool-calling macros — is
what runs, and `--chat-template-kwargs` reaches it.

**Measured against the live endpoint 2026-09-04**, single slot, `--parallel 1`, a
21397-token prompt (this file) at `temperature 0`:

| | Gemma 4 12B-it Q8_0 | Qwen3.6-27B Q4_K_M | ratio |
|---|---|---|---|
| prefill | **1526 t/s** (21396 tok in 14.0 s) | 930.5 t/s | 1.64x |
| generation | **46.2 t/s** | 34.18 t/s | 1.35x |

**The decode gap is far smaller than the parameter counts suggest, and that is
expected** — decode is bandwidth-bound and Q8_0 costs twice the bytes per weight, so
Gemma moves ~12 GB against Qwen's ~18 GB. 18/12 = 1.5, near the 1.35x measured. Do not
read 12B-vs-27B as a 2x decode win; the quant cancels most of it. Both rates come from a
21k prompt, and prefill will fall off approaching 128K as the attention term grows.

**KV cache reuse CONFIRMED for this model, not merely inherited from the Qwen result.**
A second request sharing the same 21k-token document prefix and differing only in the
trailing question prefilled **39 tokens** — 3.1 s wall against 16.9 s cold. That is the
measurement behind "assign one agent per port": round-robin would repay the full 14 s
prefill every turn.

Thermally, a full-tilt 14 s prefill took GPU 0 to 55 C, engaging channel 5 and then
releasing it through the 30 s `HIGH_DWELL`. 28 C inside the 83 C spec, and the card never
came near the 250 W cap.

**⚠ ORDERING CYCLE — a unit must not be `After=` a target that `Wants` it.**
`gpu-fan-control.service` shipped with both `WantedBy=multi-user.target` and
`After=multi-user.target`. That is a cycle, and it was invisible for as long as nothing
else ordered itself after that unit. The moment `llama-server@.service` added
`After=gpu-fan-control.service`, systemd broke the loop by **silently deleting the
llama-server start jobs** — so on 2026-08-28's boot neither endpoint came up, with no
failed unit and no error anywhere except one line:

```
multi-user.target: Found ordering cycle: llama-server@0.service/start after
  gpu-fan-control.service/start after multi-user.target/start - after llama-server@0.service
multi-user.target: Job llama-server@0.service/start deleted to break ordering cycle
```

Fixed by ordering `After=sysinit.target` instead. **This class of bug only appears on a
real boot** — and it held on one: after the 2026-09-04 12:46 boot,
`journalctl -b | grep "ordering cycle"` was empty and the units started themselves,
`gpu-fan-control` at 12:46:13 with both `llama-server` instances at 12:46:18.
`systemctl restart` can never reproduce it, because the cycle exists only
while the target is doing the starting. Check after any unit-ordering change with:
`journalctl -b | grep "ordering cycle"`.

**⚠ Two systemd traps hit while building this — both silently "succeeded":**

1. **`StartLimitIntervalSec`/`StartLimitBurst` must be in `[Unit]`, not `[Service]`.**
   systemd moved them in v229 and *ignores* them in `[Service]`, falling back to a 10 s
   window that `RestartSec=10` can never fill — so a broken instance retries forever.
   Check with `systemctl show <unit> -p StartLimitIntervalUSec`.
2. **systemd does no arithmetic in unit files.** `--port ${PORT_BASE}%i` CONCATENATES:
   8080 + instance 0 became port `80800`, above the 65535 limit, and both instances
   failed to start. Ports are computed in bash and passed via
   `/etc/llama-server/<i>.env` (`EnvironmentFile`).

General lesson from both, and from the `$HOME`-under-`sudo` bug in `dell-smm-5fan.sh`:
**writing the config is not evidence it took.** Ask the system what it actually ended up
with — `systemctl show -p <property>`, `serve-llm.sh status` — before believing it.

**⚠ Thermals: both instances busy reaches ~77-80 C against an 83 C spec.** `check` warns
about this every run. Fine on a cool day, marginal on a warm one — see *Fan control*.

### Serving flags added 2026-09-06

Applied to the template after reading `tools/server` upstream and cross-checking every
flag against THIS build (`0.1.1-dev`, commit `01818e4`) rather than master's docs:

- **`--cache-reuse 256`** — was `0` (off). Plain prefix caching is on by default and
  measured working (a second request sharing a 21k prefix re-prefilled 39 tokens). This
  is the increment: KV reuse via shifting when the prompt's MIDDLE changes — an agent
  dropping old turns, a system prompt carrying a timestamp. No VRAM cost.
- **`--cache-ram 12288`** — host-RAM prompt cache, default 8192 MiB. States evicted from
  a slot get restored instead of re-prefilled, against a ~140 s cost for a full 128K
  re-prefill. 2 x 12 GiB of the box's 61 GiB.
- **`--metrics`** — Prometheus endpoint. **Requires the API key (401 without)**, unlike
  `/health` and `/v1/models`.
- **`FA` and `SPEC` are PER-INSTANCE env values**, defaulting to `auto` and `none`.

**`-fa on` was deliberately NOT pinned globally.** It only fails at *startup*, so a bad
value on a shared template is invisible until the next reboot — the exact failure class
this box has been bitten by twice (the ordering cycle, the DKMS kernel skew). Per-instance
means one card can be tested behind `set-model`'s rollback before the other follows.

### Qwen3.5-35B-A3B evaluated and rejected — 2026-09-06

`unsloth/Qwen3.5-35B-A3B-GGUF` Q4_K_M, 22.02 GB. **Hybrid architecture, and the KV maths
is nothing like a normal transformer:** 40 blocks with `full_attention_interval = 4`, so
only **10 full-attention layers** keep a context-growing cache (2 KV heads x 256) while
the other 30 are linear attention holding a fixed-size recurrent state (`ssm.conv_kernel`
4, `ssm.state_size` 128, `ssm.inner_size` 4096). That is **20 KiB/token** against
Qwen3.6-27B's ~65. At 131072 it measured **23630 MiB on the card** — 8 GiB spare despite
carrying 8 GiB more weights than the 27B.

Measured against the dense 27B, same 21589-token prompt:

| | Qwen3.5-35B-A3B MoE | Qwen3.6-27B dense |
|---|---|---|
| prefill | 648.6 t/s | 660.0 t/s |
| generation | **92.0 t/s** | 29.3 t/s |
| VRAM | 23630 MiB | 26452 MiB |

**Generation 3.1x, prefill identical.** That split is inherent to A3B: decode touches only
8 of 256 experts so it moves ~3B parameters per token, but prefill batches activate
essentially every expert. **An agent that reads long contexts and writes short answers
gains nothing here; one that writes a lot gains 3x.** Consistent with the earlier finding
that an MoE was ~3.5x faster and ~27 points worse on SWE-bench — quality was NOT measured
for this one, and instance 0 was returned to the dense 27B.

### ⚠ MTP speculative decoding is a 20x LOSS on this box — 2026-09-06

`unsloth/Qwen3.6-27B-MTP-GGUF` (17.11 GB, MTP head at `blk.64.nextn.*`, verified present
by tensor dump) with `--spec-type draft-mtp --spec-draft-n-max 6`. Unsloth claim
~1.5-2x generation. Measured, wall-clock, client side:

| | wall | tokens | REAL t/s | llama.cpp *reported* |
|---|---|---|---|---|
| spec on, short prompt | 91.8 s | 133 | **1.4** | 28.3 |
| spec on, 21k prompt | 191.9 s | 239 | **1.2** | 31.4 |
| spec off, short prompt | 3.8-4.9 s | 121 | **24.8-32.2** | 33.6 |

**Speculation was working correctly by every internal metric while costing 20x the
wall-clock time.** Draft acceptance 75-95%, mean accepted run 5.5-6.7 tokens, draft
context created against the target model, `-ngld` defaults to `auto` so the draft was on
the GPU (confirmed: 97 % util, 246 W throughout). Not a misconfiguration — each draft
step simply costs far more than the pass it replaces on this build/hardware.

Scope: this is Volta plus `0.1.1-dev`, where the MTP path merged only 2026-05-16. It is
not a claim that MTP is broken generally. Untried: a lower `--spec-draft-n-max`.

**⚠ THE GENERAL LESSON — `predicted_per_second` IS NOT ELAPSED TIME.** It reported 28.3
t/s while the client waited 91.8 s for 133 tokens. It measures the target model's decode
time and excludes draft work, so it is fine with speculation off and actively misleading
with it on. **Benchmark wall-clock from the client.** Note the honest wall-clock figure
for the dense 27B is 31-32 t/s, slightly BETTER than the 29.3 recorded from that field.

Files kept in `~/models` after the experiment (nothing deleted):
`Qwen3.6-27B-MTP-Q4_K_M.gguf` 17.11 GB, `Qwen3.5-35B-A3B-UD-Q4_K_M.gguf` 22.63 GB (MTP,
head at `blk.40`), `mtp-gemma-4-12B-it-Q8_0.gguf` 0.47 GB (a standalone 49-tensor draft
for `--spec-draft-model`, not a full model).

**⚠ hf-get.sh writes by SOURCE filename — check for collisions.** Upstream's MTP build is
also called `Qwen3.6-27B-Q4_K_M.gguf`, the exact name of the working 19.10 GB model. A
direct fetch would have overwritten a model serving both ports. Stage into a scratch dir
and rename on success.

## Server Administration & Infrastructure Guardrails

### 🚨 Critical Safety & Security Rules
*   **No Destructive Commands:** NEVER run `rm -rf` on root, `mkfs`, or raw block device overwrites without explicit, multi-turn human confirmation.
*   **Backup First:** Before modifying any configuration file under `/etc/`, copying, or updating an application, create a `.bak` copy with a timestamp (e.g., `cp nginx.conf nginx.conf.bak.$(date +%F)`).
    *   **But never leave the backup inside a scanned `.d` directory.** Tools that glob a whole directory — `apt` on `/etc/apt/sources.list.d/`, `sudo` on `/etc/sudoers.d/`, `systemd` on unit dirs — will pick up or complain about the copy. `apt` warns on *every* invocation about an unrecognised extension there. Write the backup one level up (`/etc/apt/ubuntu.sources.bak.$(date +%F)`) or to `/root/`. Learned 2026-08-15 by doing exactly this to `ubuntu.sources`.
*   **Production Guard:** Check the active hostname (`hostname`) and environment variables before running any service restarts or database migrations.
*   **Secret Management:** NEVER hardcode, print, or output API keys, passwords, or SSH tokens to the terminal or logs. Use environment variables or local secret vaults.

## Three facts shape most decisions here:

**There is no compute GPU.** The W-2135 has no integrated graphics, and as of the
2026-08-08 survey there were zero display-class devices among 106 enumerated PCI
devices. A temporary display card may be fitted at times for bring-up work; it is not
part of the build, is not a compute resource, and should not be planned around. Any
inference is CPU-only until the real cards are installed. Do not suggest CUDA,
`nvidia-smi`, or GPU-backed runtimes as if they were available — a `nouveau` hwmon node
is a display card, not compute. The 61 GiB of RAM does make CPU inference of quantized
models practical.

As of 2026-08-09 the plan is **2× Tesla V100 32 GB**. Those are passively cooled, so
they depend on chassis airflow the stock Dell fan curve knows nothing about — hence
`gpu-fan-control.sh`. Until the cards and driver are actually installed, that script
exits 0 with a warning rather than running.

**Most of the disk is unused.** `nvme1n1` (931.5 GB) has no partition table or
filesystem and is not mounted. Additionally the boot drive's LVM claimed only 100 GB of
its 236.5 GB partition, leaving roughly 136 GB unallocated in the volume group (derived
from `lsblk`; `vgs` needs sudo and was not run). Of ~1.17 TB of NVMe, only 100 GB is
mounted. Model weights and datasets belong on `nvme1n1` once it is formatted and
mounted.

**The box is nearly bare.** Present: `git` 2.53.0, `curl` 8.18.0, `python3` 3.14.4,
plus `pciutils`, `htop`, `tmux`. Absent: Docker, `pip`, `venv`, Node, `nvcc`.
Verified 2026-08-15 while scoping the module rebuild: `gcc`, `make` and
`linux-headers-7.0.0-29-generic` **are** present, `dkms` is **not**, and `lm-sensors`
was installed that day. Note that Python 3.14 is new enough that some ML wheels may not publish
builds for it — check availability before committing to the system interpreter rather
than a pinned older one. Ubuntu also marks the system Python externally managed
(PEP 668), so `pip install` outside a virtualenv is refused by design.

## Provisioning

`provision-base.sh` extends the root logical volume into the unallocated VG space and
installs base tooling. It must run **on the server** with sudo — this repo's SSH access
is non-interactive, so a remote `sudo` password prompt would hang. A copy lives at
`~/provision-base.sh` on the box.

```bash
sudo ./provision-base.sh --dry-run    # safe to run without sudo; reports intent only
sudo ./provision-base.sh              # LV extend + packages
sudo ./provision-base.sh --packages   # skip the disk change
```

Idempotent: already-installed packages are skipped, and a volume group with no free
extents is left alone. The LV step asserts the root filesystem is ext4 before calling
`lvextend -r`, since xfs would need `xfs_growfs` instead.

## Fan control (investigated 2026-08-09)

`gpu-fan-control.sh` reads every GPU's temperature, takes the hottest, maps it through
a curve and writes one PWM channel. A copy lives at `~/gpu-fan-control.sh` on the box.

```bash
./gpu-fan-control.sh list             # channels, RPM, PWM state — no root needed
./gpu-fan-control.sh monitor 300      # no root: CSV of RPM vs temps over time
sudo ./gpu-fan-control.sh probe [CH]  # ramp a channel to identify its physical header
sudo ./gpu-fan-control.sh install     # /usr/local/sbin + /etc/gpu-fan-control.conf + unit
sudo ./gpu-fan-control.sh restore     # hand the channel back to the Dell EC
```

Everything below is established fact, verified on this machine. Re-deriving it is
expensive, so trust it rather than re-testing.

**There are no PWM registers.** Dell exposes no memory-mapped or port-I/O fan
registers on the 5820. Control goes through SMM BIOS calls, and Dell publishes no SMM
datasheet — the codes come from the Linux `dell-smm-hwmon` driver. EAX holds the
command, EBX the fan index: `0x00a3` get fan state, `0x01a3` set fan state
(`EBX = fan_index | (state << 8)`), `0x02a3` get RPM, `0x03a3` get fan type,
`0x04a3` get nominal speed, `0x30a3`/`0x34a3` disable BIOS fan control,
`0x31a3`/`0x35a3` re-enable it.

**Fan speed is three states, not a duty cycle.** The value is 2-bit: `0` OFF, `1` LOW,
`2` HIGH, `3` AUTO. The 0–255 `pwm` sysfs range is a fiction the driver maintains —
`i8k_pwm_mult = DIV_ROUND_UP(255, 2) = 128`, and writes do
`clamp(DIV_ROUND_CLOSEST(val, 128), 0, 2)`. So **0–63 → OFF, 64–191 → LOW,
192–255 → HIGH**, and nothing in between exists. Any fan curve here quantizes onto two
usable speeds. A curve whose floor lands at or under 25% (pwm 63) silently stops the
fans; `validate_curve` refuses to start in that case.

**The 5820 is not in `i8k_whitelist_fan_control`, and that is fine.** The whitelist's
Precision entries (5530, 7510, 7540) are all mobile workstations. Consequences, all
confirmed at runtime:

- The driver never sends `0x30a3`/`0x34a3`, so **BIOS automatic fan control is never
  actually disabled**. The EC could in principle re-assert itself, so the control loop
  re-writes its value every `INTERVAL` seconds. Not yet observed happening.
- Instead of the whitelist path, `pwmN_enable` writes are emulated with plain SET_FAN:
  `1` → `SET_FAN(N-1, state 2)` = HIGH, `2` → `SET_FAN(N-1, state 3)` = AUTO.
- Four *readable* `pwmN_enable` at mode 0644 is the signature of this fallback path; a
  whitelisted machine gets a single **write-only** `pwm1_enable`.

**`cat pwmN` returning ENODATA is normal and means nothing is wrong.** It is literally
`if (ret > data->i8k_fan_max) return -ENODATA;` — the fan is in state 3 (AUTO), which
exceeds `i8k_fan_max` (2). It is not a permission error and not an unsupported call.
Reading `pwmN_enable` as `2` proves the SMM interface answers.

**Probe results, 2026-08-09.** All four channels take manual PWM and return to auto
cleanly (verified: RPM back to baseline afterwards). Channel N drives `fanN` only.

| ch | idle (auto) | LOW (pwm 128) | HIGH (pwm 255) | nominal max | likely header |
|---|---|---|---|---|---|
| 1 | ~2160 | 999 | 2933 (still ramping) | 4050 | CPU heatsink |
| 2 | ~890 | 729 | 2886 | 3000 | smallest — *not* the centre/HDD fan, see below |
| 3 | ~1375 | 986 | 4050 | 4100 | front SYS |
| 4 | ~1475 | 1013 | 4139 | 4100 | front SYS |

The header identification is inference from RPM ceilings, **not confirmed physically**.
The 2026-08-09 guess that channel 2 was the centre/HDD fan is now known to be **wrong**:
`FAN_HDD` is silkscreened on the board and is the *fifth* header, which no channel maps
to (see below). Channels 1–4 are the CPU port and the system fan ports. All four of
those headers already have fans attached, so repurposing one means unplugging something
— which the fifth header makes unnecessary.

**The EC runs a CLOSED LOOP on tach — discovered 2026-08-17.** This is separate from,
and not contradicted by, the flat-temperature-curve finding below. The EC has a target
RPM for a header and *raises duty until the tach reports it*. Put a fan on that header
whose maximum is well under the EC's expectation and the loop never converges: it drives
duty to maximum permanently.

This bites hard with a fan hub, because **every hub port shares one PWM line**. A slow
reference fan on port 1 makes the EC scream every other fan on the hub. Observed with a
2000 RPM reference fan against channel 5's **5100 RPM nominal max**; the GPU shroud fans
were driven far harder than intended. Match the reference fan to the channel's nominal
max (~5000 RPM, e.g. Arctic P8 Max, 500–5000 RPM, 0.19 A) so the loop settles.

**Scope this correctly before spending time on it.** The closed loop only applies while
the **EC owns the channel**. Once `gpu-fan-control.sh` sets `pwmN_enable=1` it writes duty
directly and the loop is irrelevant. So a mismatched reference fan affects: POST, early
boot before the service starts, `STOP_STATE`/failsafe, and any period where DKMS has
failed after a kernel upgrade — but never steady-state operation under the script.

The real fix, if it ever matters enough: **synthesize the tach** (a microcontroller
feeding the header whatever pulse rate keeps the EC content). That also delivers true
per-fan RPM for failure detection, which the reference-fan arrangement structurally
cannot — see the monitoring blind spot noted above.

**The EC does NOT respond to CPU temperature — but it is not curve-less.** A 300 s
experiment (`~/fan-experiment.sh`, CSV at `~/fan-experiment.csv`) drove the CPU from
24 °C to 79 °C and held it above 74 °C for 130 s. Not one channel moved more than
sampling jitter. That result stands, and the practical lesson stands with it: do not
expect a CPU-temperature stimulus to move these fans. But the conclusion originally
drawn from it — "the EC's curve is nearly flat" — was an over-generalisation. See
*How the EC actually drives the fans* below.

Three reasons that experiment saw nothing, none of which require a flat curve:

- **Wrong stimulus.** The system fans are mapped to board/ambient sensors, not the CPU
  DTS. A CPU spike heats a heatsink; it does not heat the chassis air an ambient sensor
  sits in. 500 W of passive V100 is a completely different input.
- **Thermal margin, not absolute temperature.** Dell tables key off headroom to Tjmax.
  The W-2135's Tjmax is 100 °C, so 79 °C still left ~21 °C of margin — plausibly below
  the first ramp step.
- **Time constants.** EC tables carry dwell and hysteresis in tens of seconds to
  minutes. A 130 s excursion is short.

### How the EC actually drives the fans — researched 2026-08-18

**The three-state model is the SMM *interface*, not the hardware.** The EC owns the PWM
generators and drives arbitrary duty. `SET_FAN` (`0x01a3`) offers only a 2-bit override
vocabulary (OFF/LOW/HIGH/AUTO), and the driver's `i8k_pwm_mult = 128` quantises the
sysfs `pwm` range onto it. Linux has no call that asks the EC what duty it is *currently*
using — which is exactly why reading `pwmN` in AUTO returns `-ENODATA`
(`if (ret > data->i8k_fan_max) return -ENODATA;`, state 3 > 2). **`fanN_input` is the
only window into what the EC is really doing, and it is continuous.**

**Proved from this machine's own probe table, not from theory.** In EC auto, three of
four channels sit at an RPM *no manual state can produce*:

| ch | EC auto (idle) | manual LOW | manual HIGH |
|---|---|---|---|
| 1 | **2160** | 999 | 2933 |
| 2 | 890 | 729 | 2886 |
| 3 | **1375** | 986 | 4050 |
| 4 | **1475** | 1013 | 4139 |

A genuine three-position device would have to land on OFF, LOW or HIGH. It lands
between them. During the 2026-08-18 benchmark channel 3 read **599** — *below* its own
LOW preset. That is continuous duty control, measured here.

**The EC is the SMSC part at `0x2e/0x2f`, ID `0x3082`.** Linux cannot claim it:
`sch56xx-common.c` probes `0x4e` then `0x2e` and accepts only `0xC6` (SCH5627) or `0xC7`
(SCH5636) at register `0x20`; this board answers `0x30`. So it is an SMSC EC of the same
family Dell uses across Precision workstations, but a variant with no public register
map — SMM is the only door. This is *why* `sensors-detect` found nothing usable, and it
closes that avenue for good.

The sibling `sch5627` driver shows the architecture to assume for ours: each PWM output
carries a **`pwmN_auto_channels_temp` bitmask** (`SCH5627_REG_PWM_MAP`) naming which
temperature channels feed that fan's automatic curve. EC firmware runs the curve; the
host can read the mapping but never the curve. Per-fan automatic control, driven by a
mapped subset of thermal sources.

The driver *can* enumerate sources — `GET_TEMP_TYPE` (`0x11a3`) returns 1=CPU, 2=GPU,
3=SODIMM, 4=Other, 5=Ambient, 6=Other, and `GET_FAN_TYPE` (`0x03a3`) labels each fan
Processor / Motherboard / **Video** / Power Supply / Chipset / Other — but **both calls
FAIL on this board** (verified 2026-08-18). No `tempN_label` files are created at all,
and `cat fan1_label` returns `EINVAL`. There is no way to ask which sensor is ambient or
which fan is the video fan; it has to be inferred from behaviour.

Four temperature sensors answer at all: `temp1 temp2 temp5 temp7`. Sensors 3, 4, 6 and
8-10 return errors and get no sysfs node.

**WARNING: `fanN_target` is a TRAP in auto mode — it is not a setpoint.** `fan_target`
*clamps* where `pwm` *errors*:

```c
case hwmon_fan_target:
    if (ret > data->i8k_fan_max)
        ret = data->i8k_fan_max;      /* clamp - no error */
    *val = data->fan_nominal_speed[channel][ret] * mult;
...
case hwmon_pwm_input:
    if (ret > data->i8k_fan_max)
        return -ENODATA;              /* error */
```

So in AUTO (state 3) every channel reports its HIGH nominal — 4050 / 3000 / 4100 / 4100
here — as though that were a live target. `pwmN` = ENODATA plus `pwmN_enable` = 2 are the
only trustworthy "this channel is in EC auto" signals.

**MEASURED 2026-08-18: channels 1-4 do not modulate under GPU load. At all.**
`~/fan-study.sh` (CSV `~/fan-study.csv`) logged all four fans plus every thermal source
at 5 s through 60 s idle -> 124 s of dual-V100 split-mode soak (~470 W, both cards
35 -> 62/60 °C, CPU 36 -> 60 °C) -> 180 s cooldown. Per-phase fan means:

| ch | idle | LOAD | cooldown | own idle jitter |
|---|---|---|---|---|
| 1 | 1001 | 1005 | 1001 | 0.1 % |
| 2 | 725 | 720 | 725 | 0.1 % |
| 3 | 716 | 740 | 734 | 5.9 % |
| 4 | 1102 | 1111 | 1116 | 3.3 % |

Every load-vs-idle difference is inside that channel's own jitter band. **Nothing ramped,
nothing decayed.** Meanwhile the sensors the EC could plausibly be watching barely moved:
`temp2` 30 -> 35 °C and `temp7` 28 -> 30 °C, both lagging badly; `temp5` sat at **25 °C
for the entire six minutes** without changing once. `temp1` is load-correlated but far
too noisy to use — it swung 43-54 °C during pure idle while the CPU package held
35-37 °C, and read up to 59 °C during cooldown with the CPU at 43 °C. Do not treat
`temp1` as the CPU sensor.

Consequence: **the earlier worry that manual override sacrifices a useful continuous
curve does not apply.** There is no modulation to lose. Rebuilding the 5-fan module and
running `gpu-fan-control.sh` is not redundant with the EC — on this evidence it is the
only thing that will cool the cards.

**Scope limit — this says nothing about channel 5.** The DKMS module is still absent, so
`fan5` does not exist and the study covered channels 1-4 only. The GPU shroud fans hang
off `FAN_HDD`, which *is* channel 5. Whether the EC modulates that header is still
unmeasured and needs the module rebuilt first.

Two explanations remain for channels 1-4, and **they do not change what to do**: either
the BIOS `Fan Speed Control` is on `Low` (see below), or the EC's thresholds on
`temp2`/`temp7` sit far above the 35 °C those sensors reached. Under either, chassis
ambient will never rise enough to trigger a ramp before the GPUs hit their own limit.

**⚠ BIOS settings CANNOT be read from the OS on this box — all three routes are closed
(tested 2026-08-27). Do not retry them.**

- `smbios-thermal-ctl` — a mobile-workstation feature; a fixed tower has no thermal-mode
  SMI token, so there is nothing on the other end.
- `libsmbios` / `libsmbios-bin` — **not in the Ubuntu 26.04 (resolute) archive at all**.
  `apt-cache search smbios` returns only `dmidecode` and unrelated Rust/Go crates.
- `dell-wmi-sysman` — module is on disk but `modprobe` gives `No such device`. It
  requires BOTH the set interface (`F1DDEE52-…`) and the password object
  (`70FE8229-…`); this board's WMI bus exposes neither, only the descriptor, a BMOF
  block, and the three read-only attribute GUIDs (`9DBB5994`/`8D9DDCBC`/`A80593CE`).
  `dcdbas` carrying a refcount from `dell_smbios` confirms this machine uses the legacy
  SMI path, not the WMI management path the driver targets.

Consolation: because the WMI *write* path does not exist here, there is no way to make
the firmware commit NVRAM from userspace, so `SocketCommonRcConfig` cannot be clobbered
that way. Checking or changing any BIOS value needs a physical trip to the machine — and
per the V100 section, take the USB stick and be ready to re-run `apply.nsh` afterwards.

**⚠ CHANNEL 2 CANNOT BE DRIVEN STABLY — do not re-add it without fixing the EC first
(2026-08-27).** It oscillated 716-2869 RPM continuously while the tier stayed engaged
(one engage event, zero releases in the journal), and the oscillation **erased its whole
benefit**: GPU0 plateaued at 76.2 C, identical to not driving it at all, versus 74.3 C on
the one run where it happened to hold steady. Neither faster re-assertion nor a changed
write pattern beat it:

| channel | INTERVAL=5 spread | INTERVAL=1 spread |
|---|---|---|
| 5 (FAN_HDD hub) | ~130 RPM | **47 RPM (1.1 %)** |
| 2 (chassis header) | ~2100 RPM | **2010 RPM — no better** |

Best explanation, consistent with the documented closed-loop-on-tach behaviour: the EC
holds a target RPM for a plain chassis header and pulls duty back down when tach exceeds
it, so every HIGH command gets undone. Channel 5 escapes this because it drives a
SATA-powered hub whose speed does not track EC duty the way the loop expects.

**The real fix is a DMI quirk** adding this board to `i8k_whitelist_fan_control` in the
patched module, so the driver actually sends `0x30a3`/`0x34a3` and BIOS fan control is
genuinely disabled. Untried: every existing whitelist entry is a mobile workstation and
there are two different command pairs, so pick carefully and be near the machine.

**Two telemetry traps found the same day.** `pwmN_enable` reads back as **2 ("EC auto")
even while a manual state is in force** — the driver never disables BIOS fan control on
this board, so the EC reports its own mode. Trusting that readback made every cycle issue
two `SET_FAN` calls (`enable=1` then `pwm`) instead of one; the script now claims a
channel once on engage and writes only `pwm` afterwards. Together with `pwmN` (ENODATA in
auto) and `fanN_target` (clamps to the HIGH nominal), **`fanN_input` is the only
trustworthy fan telemetry on this board.**

**Working configuration as of 2026-08-27:** `PWM_TIERS="5:55:51"`, `INTERVAL=1`.
Channel 5 alone, engage 55 C, release 51 C, `HIGH_DWELL=30`. Verified 47 RPM spread
(1.1 %) both over 15 s at 60 C and across a full dual-card soak. Audibly smooth. The
multi-tier machinery remains in the script and is inert with one tier configured.

**INTERVAL=1 is what makes channel 5 steady, and that is worth more than a second fan.**
Full dual-instance soak comparison, same workload every time:

| run | ch5 | ch2 | GPU0 mean | outcome | chassis start |
|---|---|---|---|---|---|
| ch5, INTERVAL=5 | sagging 4016-4144 | — | 76.2 | aborted 289 s | 34 |
| ch5 + ch2, INTERVAL=5 | sagging | steady 2879 | 74.3 | completed 404 s | **31** |
| ch5 + ch2 tiered | sagging | oscillating | 76.2 | aborted 405 s | 34 |
| **ch5, INTERVAL=1** | **steady 4308** | — | **75.3** | **completed 405 s** | 34 |

**The earlier "fan 2 is worth 1.9 C" conclusion does not survive.** That run started from
a chassis reading of 31 vs 34 here — three degrees of ambient advantage for a one degree
better result. Once channel 5 is held steady, fan 2's marginal contribution is inside
ambient noise. What was actually being measured was **steady airflow**, which
`INTERVAL=1` delivers from channel 5 alone. Consistent with the single-vs-split finding
that per-card duty dominates and chassis airflow barely matters on this machine.

**Consequence: the planned chassis exhaust fans are very unlikely to be worth buying.**
Run the free side-panel-off soak first if you want to confirm there is no headroom left.

**⚠ Channel 2 is the GPU-area OEM fan on a SINGLE-SOCKET 5820 — the 5810 map is wrong
here.** The dual-socket 5810 layout calls that position the secondary CPU fan. With one
socket there is no second CPU and the position sits in the PCIe airflow path. Confirmed
physically 2026-08-27; `gpu-fan-control.sh` now drives `PWM_CHANNELS="5 2"`.

Adding it made two-instance serving converge for the first time: same workload, GPU0 mean
76.2 -> **74.3 C**, GPU1 74.5 -> **71.4 C**, and the run **completed at 404 s** where it had
aborted at 289 s still rising. The curve is flat across t=228-404 s, so ~75 C is measured
equilibrium rather than extrapolation — 8.7 C inside the 83 C spec. Ambient was ~2 C more
favourable that run, so fan 2's own contribution is likely 1-2 C; the change in *shape*
(rising -> flat) is not explained by ambient. Fan 2 runs 725 -> 2879 RPM while engaged,
which is audible; idle is unchanged.

**⚠ Suspect the BIOS `Fan Speed Control` setting first.** The 5820 owner's manual
documents it with two values — *Low* ("Fans run low and quiet. System performance may
decrease.") and *Auto*, the default ("Fans run at optimal speed based on environmental
data."). Idle-auto channel 1 was **2160** in August but only **1002** during the
2026-08-18 GPU benchmark: the fans ran *slower* under 500 W of GPU load than they had at
idle. Every BIOS setting was re-applied by hand after the RTCRST clear, and this is
exactly the kind of option that could have come back as `Low`. **Check it before doing
any more fan work** — if it is on Low, every thermal number recorded on 2026-08-18 is
against a deliberately crippled curve and the baseline needs re-taking.

**The measurements that settle this**, next time the box is up (no root needed):

```bash
sensors                                  # tempN_label: look for Ambient / GPU / Other
cat /sys/class/hwmon/hwmon*/fan?_label   # is any channel "Video Fan"?
cat /sys/class/hwmon/hwmon*/pwm?         # ENODATA on all = every channel in EC auto
                                         # (NOT fan?_target - it clamps, see above)
```

Then log `fanN_input` + every `tempN_input` + `nvidia-smi` GPU temp at 5 s through a
soak and correlate. The question is whether any chassis fan RPM tracks an ambient sensor
with a lag. `smbios-thermal-ctl --get-thermal-info` is a long shot on a desktop (it is a
mobile-workstation feature) but costs one command.

### Channel 5 characterised and the service commissioned — 2026-08-27

**The full calibration.** With a ~5000 RPM reference fan on hub port 1 (fitted to fix
the POST tach check), channel 5 measures:

| state | fan5 RPM | fraction of full | est. 15k shroud fans |
|---|---|---|---|
| LOW (pwm 128) | 989 | 22 % | ~3,300 |
| **EC automatic** | **2210** | **50 %** | ~7,400 |
| HIGH (pwm 255) | 4465 | 100 % | ~15,000 |
| nominal max (SMM) | 5100 | — | — |

Shroud estimates are first-order only — RPM ratio is not duty ratio and the curves
diverge most at the bottom, where a 15k server fan may not start reliably. **HIGH at 4465
is comfortably under the 5100 nominal, so POST accepts it** — the 14451 RPM that hung
POST is fully closed out.

**Channel 5 does not modulate in EC auto either.** Measured through 90 s idle -> a
dual-V100 soak (38 -> 62 C) -> 240 s cooldown: fan5 mean **2212 idle / 2217 LOAD /
2224 cooldown**, i.e. +0.23 % under a 500 W load against a 4 % jitter band. The EC
ignores GPU temperature on every header it owns, including the one physically dedicated
to PCIe cooling. This was the last open question from the resume checklist and it is now
answered: `gpu-fan-control.sh` must drive the channel.

**⚠ LOW IS WORSE THAN DOING NOTHING — this changed the design.** 989 RPM is less than
half the EC's own 2210. The shipped `CURVE="60:50 72:100"` with `MIN_PCT=50` writes
pwm 127 (= LOW) below ~66 C, so the stock config would have *degraded* cooling versus
leaving the service uninstalled. Only two states on this channel are useful: EC auto and
HIGH.

Hence **`AUTO_BELOW`** (added 2026-08-27): below that GPU temperature the channel is
handed back to the EC rather than forced to LOW; at or above it, HIGH. `CURVE="55:100"`
is deliberately binary — an interpolated curve would pretend to a resolution the hardware
does not have. `validate_curve` refuses `AUTO_BELOW <= HYSTERESIS`, since the release
threshold (`AUTO_BELOW - HYSTERESIS`) would go negative and the channel would never
return to auto. The band is skipped entirely while the failsafe is engaged: if GPU
temperature cannot be read, the EC is precisely what must not be trusted.

Commissioned config: `PWM_CHANNEL=5  CURVE="55:100"  AUTO_BELOW=55  HYSTERESIS=4
STOP_STATE="high"`. Engages at >=55 C, releases at <=51 C. Verified in the journal:
`gpu=57C -> 100% (pwm 255)` then `gpu=50C -> EC auto`, with fan5 2243 -> 4380 and a clean
~50 s spin-down. No flapping at the knee.

**How much it buys, same workload all three times:**

| run | channel 5 | compute before 63 C |
|---|---|---|
| 2026-08-18 (pre fan swap) | unknown, running hard | 109 s |
| 2026-08-27, EC auto | 2210 | 44 s |
| 2026-08-27, service active | 2210 -> 4380 | 70 s |

Heating rate over comparable bands: **0.32 C/s on EC auto vs 0.137 C/s under HIGH — 2.4x
slower.** Fitting the HIGH segment gives **Teq ~= 65 C, tau ~= 39 s** (RMSE 1.0 C), versus
~72 C and probably higher for passive airflow. Treat that as 65-70: it is 51 s of noisy
data across ~1.3 time constants.

**⚠ Fitting the reference fan REDUCED GPU cooling.** Before the swap the cards took 109 s
to reach 63 C; on EC auto afterwards, 44 s. Either the EC had been chasing an unreachable
tach and driving duty to maximum, or the hub's control lead was off `FAN_HDD` and the fans
free-ran at 100 %. Either way the fan swap traded airflow for a POST that works — which is
the whole reason the service is not optional.

**The 65 C watchdog is now the binding constraint, not the hardware.** V100 spec is 83 C
operating / 87 C slowdown. If the plateau really is ~65 C, every soak aborts just as it
reaches steady state and the flat part of the curve is never observed. Raising
`gpu-bench.sh --limit` to 75 for one run would settle it, still 8 C inside spec.

**PRODUCTION thermals, measured 2026-08-28 against the LIVE endpoints: 66.2 C.** Both
`llama-server` instances hammered concurrently for 410 s — GPU0 mean 66.2 C (64-67),
GPU1 63.2 C, fan5 4273 RPM, ran to term. **16.8 C inside the 83 C spec.**

**Every synthetic figure below is ~9 C pessimistic for real use.** Across that run the
cards were above 200 W for only **77 % of samples** and combined draw averaged **389 W**
against the ~500 W `llama-bench` sustains — real requests have gaps (client round-trip,
the prefill-to-generation transition, a slot falling idle) that a synthetic stream never
has. Use **66 C** as the number describing the machine in service and 75.3 C as the worst
case. Harness: `~/serve-soak.sh`, which loads the endpoints and needs no service stop.

**PLATEAU MEASURED 2026-08-27 — the cooling is sufficient.** `-p 32768 -n 128 -r 8
-sm layer` at `--limit 75` ran to completion, 318 s of compute, both cards at ~250 W:

| plateau (t=150-360 s, 42 samples) | mean | min | max |
|---|---|---|---|
| GPU0 | **65.4 C** | 61 | 68 |
| GPU1 | 62.1 C | 59 | 65 |
| fan5 | 4366 RPM | — | — |

**15 C of margin to the 83 C spec, 19 C to the 87 C slowdown. No power capping needed**,
and throughput is untouched: `pp32768 = 930.5 ± 1.6 t/s`, `tg128 = 34.18 ± 0.03` versus
935 / 34.2 in the 2026-08-18 baseline. Only throttle code observed was `0x4` (the normal
250 W power cap), never thermal.

The single-exponential fit from 51 s of data predicted 64.9 C and measured 65.4 C. The
slow chassis pole is real — `temp2` 32 -> 37 C and `temp7` 28 -> 31 C across the soak —
but it contributed about **2 C**, not the ten the earlier hedge allowed for. Trust the
fit; the second pole is small on this chassis.

**SINGLE-GPU plateau: 74.2 C — a ~9 C penalty over split.** Same `-r 8` soak with
`-sm none -mg 0` at `--limit 78`. Held 73-75 C for 180 s (mean 74.2, 232 W) before a
single excursion to 76 tripped the guard, so the flat part was measured cleanly.

| config | plateau | margin to 83 C spec | per-card duty |
|---|---|---|---|
| split (`-sm layer`) | **65.4 C** | 17.6 C | ~150 W avg (alternates 250/50) |
| single (`-sm none`) | **74.2 C** | 8.8 C | 232 W sustained |

**Chassis air is NOT the constraint — sustained per-card power is.** Single-GPU puts far
less heat into the case (~290 W vs ~500 W) and `smm_t2` reads the same 37 C, yet the die
runs 9 C hotter. llama.cpp's layer split runs the cards sequentially, so in split mode
each alternates 250/50 W and averages ~150; `-sm none` pins one card at a sustained 250.

**`-sm layer` is therefore the default on both axes**: ~34 % faster prefill *and* 9 C
cooler. Rare case where the fast option is also the safe one.

**⚠ Ambient sensitivity is the real single-GPU risk.** 74 C plateau was measured with the
chassis sensor at 37 C. Ambient scales through roughly 1:1, so a room 10 C warmer puts
sustained single-GPU work near 84 C — past the operating limit and into throttling. Split
absorbs the same swing with room to spare. Do not leave long unattended single-GPU jobs
running in a warm room.

**⚠ The 65 C watchdog was set BELOW this machine's normal operating temperature.** That
is why every soak before this one aborted — each was killed at the moment it reached
steady state, never a cooling failure. `gpu-bench.sh` defaults to `LIMIT=65`; raise it to
~78 for any run meant to measure rather than abort.

**`HIGH_DWELL` verified in a real decay** (not just the cold-start case): the card hit the
release point at 50 C, held HIGH, and handed back 32 s later at **43 C** — 7 C of extra
purge the plain hysteresis would have discarded.

**⚠ DKMS only builds for the RUNNING kernel.** `install` registered
`dell-smm-hwmon-5fan/1.0` for 7.0.0-29-generic while **7.0.0-30-generic was already
installed** and `GRUB_DEFAULT=0` boots the newest — so the next reboot would have landed
on a kernel with no `pwm5`, and the service would have hit its start limit and sat in
`failed`. Fix, and the thing to check after every kernel upgrade:

```bash
dkms status -m dell-smm-hwmon-5fan          # one line per kernel, compare with ls /lib/modules
sudo dkms install -m dell-smm-hwmon-5fan -v 1.0 -k <NEW-KVER>
```

**Worked example, 2026-09-04:** the box rebooted onto 7.0.0-30-generic and channel 5 came
back intact, because that `dkms install -k` had been run ahead of time. `dkms status` now
shows a line per kernel and `modinfo -n` points into `7.0.0-30-generic/updates/dkms/`.
`/lib/modules` also still carries 7.0.0-14-generic with no DKMS line — harmless while
`GRUB_DEFAULT=0` boots the newest, but it is what a rescue boot would land on.

**Getting kernel source without root, and without touching `/etc/apt`.** Point apt at
user-owned directories instead of enabling `deb-src` system-wide:

```bash
mkdir -p ~/aptsrc/lists/partial ~/aptsrc/archives/partial
printf 'deb-src http://us.archive.ubuntu.com/ubuntu/ resolute main\n' > ~/aptsrc/src.list
apt-get -o Dir::Etc::sourcelist=$HOME/aptsrc/src.list -o Dir::Etc::sourceparts=/dev/null \
        -o Dir::State::lists=$HOME/aptsrc/lists -o Dir::Cache::archives=$HOME/aptsrc/archives \
        -o APT::Get::List-Cleanup=0 update
```

The archive drops superseded kernels, so 7.0.0-29.29 was already gone when we needed it.
Single files come from Launchpad by tag, which is faster than a 250 MB source package:

```
https://git.launchpad.net/~ubuntu-kernel/ubuntu/+source/linux/+git/resolute/plain/drivers/hwmon/dell-smm-hwmon.c?h=Ubuntu-7.0.0-29.29
```

Drop it in `<tree>/drivers/hwmon/` and use `dell-smm-5fan.sh build --source <tree>`.
Note `dell-smm-hwmon.c` is **byte-identical between 7.0.0-29.29 and 7.0.0-30.30**, so the
"DKMS ships a pinned copy that goes stale" worry did not bite for this upgrade. Re-diff
at the next one.

### The 5th fan header — investigated 2026-08-15

**The driver caps at 4 fans; the board has 5 headers. The missing one is the GPU fan.**
This is the single most important fact in this section, and it explains a chain of
observations that otherwise look contradictory.

`dell-smm-hwmon` defines `DELL_SMM_NO_FANS = 4`, so it never issues an SMM call for fan
index 4. Precision Tower boards have **five** fan connectors. The fifth — the centre
position, silkscreened `FAN_HDD`, which the service manual calls the "center system
fan/HDD fan" — is physically the **PCIe/GPU cooling fan**. It cannot appear in sysfs no
matter what is plugged into it, because nothing ever asks the EC about it.

Confirmed on this kernel (7.0.0-29-generic, `linux-image` 7.0.0-29.29): exactly
`fan1_input`–`fan4_input` and `pwm1`–`pwm4`. The PWM channel list is *static* in the
driver's config array, so four `pwm*` entries is direct evidence the constant is still
4 — not merely that a fifth fan failed to answer.

**The fix exists upstream but is not in this kernel.** [LKML patch v2, Andrew Mark,
2026-01-13](https://lkml.org/lkml/2026/1/14/157), tested on a Precision Tower 5810 (the
5820's direct sibling), raises `DELL_SMM_NO_FANS` to 5 and adds the fifth PWM channel —
5 insertions, one file. Its stated motivation is verbatim this project's problem: *"The
PCIe/GPU cooling fan (fan 5) was uncontrollable, risking overheating with high-power
GPUs."* Getting `fan5_input`/`pwm5` means an out-of-tree rebuild of the module.
Prerequisites as of 2026-08-15: `gcc`, `make` and `linux-headers-7.0.0-29-generic` are
present; **`dkms` is not** — it is needed only so the change survives kernel upgrades.

**The header itself works — this was verified empirically.** A fan on port 1 of a
SATA-powered hub attached to `FAN_HDD` ran *quieter* than free-running, which proves the
header delivers a real EC-driven PWM signal and that port 1 passes tach back. Two
consequences: the old worry that the Dell 5-pin pinout might not carry PWM where a
standard hub expects it is **resolved — it does**; and the hypothesis that SATA power
bypasses a voltage-based control path is **disproven**. Do not re-litigate either.

**Why `probe` appears to do nothing on that header.** It is not a wiring fault and not a
wrong channel guess: channels 1–4 are the *other* headers, so probing them moves other
fans and leaves the hub fan alone. Expect exactly this result until the module is
rebuilt. Equally, none of the four baselines shift when something is plugged into
`FAN_HDD` — all four enumerated fans are elsewhere.

**There is no alternative sysfs path — stop looking for one.** `sensors-detect` 3.6.2
(run 2026-08-15, log at `~/sensors-detect.log`) found **no hardware-monitoring
Super-I/O**. It reports one SMSC chip at `0x2e/0x2f`, ID `0x3082`, which lm-sensors
cannot identify; these non-compliant SMSC parts put their ID register at `0x0d` instead
of `0x20` and carry no hwmon block. That chip is almost certainly the EC itself — the
same silicon `dell_smm` already reaches over SMM. Nothing was persisted: `--auto`
declines the risky probes and defaults the `/etc/modules` question to NO. `lm-sensors`
is now installed; re-running it will only reproduce this.

**CoolerControl was evaluated 2026-08-15 and not installed.** Its one decisive advantage
here would have been built-in Super-I/O detection, which the finding above rules out. It
remains reasonable *purely* as a monitoring layer (`coolercontrold`, Web UI on port
11987, REST API, Mix profiles with a Max function over several temp sources). Two caveats
if it is ever adopted: it has **no equivalent of `validate_curve`**, so an ordinary-looking
curve with a 20–25 % floor maps to pwm ≤ 63 and *stops* the fan on this 3-state driver;
and it must never drive the same channel as `gpu-fan-control.sh` — two writers on one
`pwmN` will fight.

**Fan layout per the patch author's 5810** (informative — the 5820 may differ, and
hwmon `fanN_input` is 1-indexed against these 0-indexed driver slots): fan0 CPU
heatsink, fan1 secondary CPU (dual-socket only), fan2 right DIMM bank, fan3 left DIMM
bank, **fan4 PCIe/GPU cooling**. So the new channel surfaces as `fan5_input`/`pwm5`.
This also supersedes the 2026-08-09 guess that channels 3 and 4 were "front SYS".

**CONFIRMED 2026-08-15: the rebuild works and channel 5 drives the GPU fan.** The
patched module built clean against `linux-7.0.0` source (vermagic matches
`7.0.0-29-generic`, `mod_unload` present), `list` now shows five channels, and probing
channel 5 moved the hub fan decisively:

| ch 5 | reading |
|---|---|
| EC automatic | ~2820–2880 |
| LOW (pwm 128) | 2586 |
| HIGH (pwm 255) | 14451 |
| nominal max | 5100 |

`PWM_CHANNEL=5` is now the default in `gpu-fan-control.sh`.

**⚠️ A SATA-powered hub on `FAN_HDD` HANGS POST — confirmed 2026-08-15.** The BIOS runs a
system-fan check during POST and cannot pass `FAN_HDD`: the machine hangs before the
bootloader and eventually beeps, with no network at all (ARP incomplete, router shows
the reservation but no lease). This is invisible until the first reboot, because
everything works perfectly at runtime.

The cause is that HIGH reading of 14451 RPM against a nominal max of 5100. A hub powered
from SATA does not change speed with the commanded duty the way the EC expects, and the
tach it reports back is out of range. The control loop never cares — it ignores tach
entirely — but **the BIOS reads the same tach at POST and rejects it.** Do not dismiss an
implausible `fan5_input` as cosmetic; it is the early warning for this.

Recovery: unplug the hub's control lead from `FAN_HDD` and the box boots (that header was
empty for weeks). The DKMS module and the service are irrelevant to POST — beeps happen
before any module loads, so never suspect software for this.

The fix that keeps both POST and control: a 4-pin **Y-splitter** on `FAN_HDD` — one
branch to a plain fan whose tach the BIOS accepts, the other feeding only the hub's PWM
input with its tach wire disconnected. Suppressing the BIOS fan check instead would
trade away real protection on a box destined for two passive V100s.

**Persistent via DKMS since 2026-08-15.** `sudo dell-smm-5fan.sh install` registers the
patched source as `dell-smm-hwmon-5fan/1.0` in `/usr/src/`, and DKMS rebuilds it
automatically on kernel upgrades. Verified end to end:

```
dkms status → dell-smm-hwmon-5fan/1.0, 7.0.0-29-generic, x86_64: installed (Original modules exist)
modinfo -n dell_smm_hwmon → /lib/modules/7.0.0-29-generic/updates/dkms/dell-smm-hwmon.ko.zst
/sys/module/dell_smm_hwmon/srcversion == the installed .ko's srcversion  (so the DKMS
  build really is the running module, not a leftover insmod)
```

Why the override works on an **in-tree** module: `DEST_MODULE_LOCATION=/updates/dkms`
puts the `.ko` in `/lib/modules/$KVER/updates/dkms/`, and `/etc/depmod.d/ubuntu.conf`
says `search updates ubuntu built-in` — `updates` outranks `kernel`. DKMS archives
Ubuntu's original module ("Original modules exist") and restores it on removal, which
the install run demonstrated in both directions. `sudo dell-smm-5fan.sh uninstall`
reverses everything. Module signing is skipped (`update-secureboot-policy not found`);
irrelevant here because the box is legacy-BIOS with no Secure Boot.

**The DKMS copy is pinned to 7.0.0 source, and that is the thing to watch.** It ships a
full copy of this kernel's driver, so a future kernel rebuilds *old* code against new
headers. If that fails, DKMS leaves the stock module alone and you silently drop to four
fans — `gpu-fan-control.sh run` then dies naming exactly that cause, so it announces
itself. If it succeeds, you are quietly running an outdated driver. **After any kernel
upgrade, check whether the stock driver already exposes five fans**; once the patch
lands upstream, `uninstall` is correct and the override becomes dead weight.
`dell-smm-5fan.sh status` reports where you stand.

`channels()` needed no change — it enumerates `fan*_input` from sysfs, so it picked up
the fifth channel on its own. Only the `PWM_CHANNEL` default moved.

**The service is installed as of 2026-08-15** (`sudo gpu-fan-control.sh install`):
`/usr/local/sbin/gpu-fan-control.sh`, `/etc/gpu-fan-control.conf` with `PWM_CHANNEL=5`,
and the systemd unit. It is **disabled and inactive** — deliberately, since with no
`nvidia-smi` the `run` loop warns, restores EC automatic and exits 0.

The unit carries `StartLimitIntervalSec=300` / `StartLimitBurst=5`. Without them, a
missing `pwm5` makes `run` die, and `Restart=on-failure` would retry every 10 s forever.
Now it gives up after five tries and sits visibly in `failed`. The realistic trigger is
DKMS failing to rebuild after a kernel upgrade; losing GPU fan control should be loud,
but it should not spin.

**`install` never overwrites an existing `/etc/gpu-fan-control.conf`** ("keeping
existing"). The config wins over the script's defaults, so after changing a default in
the script, edit the config too or the change has no effect on the service.

Sanity-check any curve against the quantisation: `MIN_PCT=50` → pwm 127 → LOW, and 100%
→ pwm 255 → HIGH. Both clear the pwm ≤ 63 cliff that would stop the fan.

**CONFIRMED ACROSS A REBOOT 2026-09-04 — and on a DIFFERENT kernel than it was built
against.** The box rebooted at 12:46 (first boot since 2026-08-28) and came up on
**7.0.0-30-generic**, not the 7.0.0-29 everything was originally built for. `fan5_input`
exists and is driven, `modinfo -n dell_smm_hwmon` resolves to
`/lib/modules/7.0.0-30-generic/updates/dkms/dell-smm-hwmon.ko.zst`, and `dkms status`
lists both kernels `installed (Original modules exist)`. That is precisely the failure
the DKMS warning above predicts, and the pre-emptive
`dkms install -k 7.0.0-30-generic` is what stopped it — so treat that step as load
bearing, not as belt-and-braces.

**Open items.** The 3-state quantisation still applies to fan 5: it gets
OFF/LOW/HIGH like the
rest, so the curve-floor guard matters *more* there, not less, since a floor at or below
pwm 63 would stop the GPU fan outright. Still unconfirmed physically: which fan is
channel 2. Power any fan hub from SATA rather than the header, which is likely rated
around 1 A; the script never reads tach to make decisions, so a hub reporting 0 or one
fan is harmless.

## Conventions in the scripts

Worth matching if extending `setup-ssh-key.sh` / `provision-base.sh` /
`gpu-fan-control.sh` or adding siblings:

- `set -euo pipefail`, bash (not sh).
- Output helpers `bold`/`info`/`ok`/`warn`/`die` for consistent colored status lines;
  `die` writes to stderr and exits.
- `usage()` re-reads the comment header at the top of the file (`sed -n '3,12p'` in
  `setup-ssh-key.sh`, `'3,21p'` in `gpu-fan-control.sh`), so the usage block and the
  header comment are the same text — update the header, not a separate string. Adding
  a header line means bumping that range.
- `--dry-run` prints intended writes instead of making them, on every subcommand.
- Anything that changes hardware state installs a `trap ... EXIT INT TERM` that puts it
  back, and the systemd unit repeats the same cleanup in `ExecStopPost` to cover
  SIGKILL.
- **`$HOME` is not stable across `sudo`.** Ubuntu's sudo resets HOME to `/root`, so a
  script whose `build` runs unprivileged and whose `load`/`install` need root will
  disagree with itself about where its output lives — `dell-smm-5fan.sh` reported "no
  rebuilt module" for a module it had just built (fixed 2026-08-27 by resolving against
  `SUDO_USER`'s home). Same family as the two bugs below: fine until the execution
  context shifts underneath it.
- **A cleanup function registered on `EXIT` must not read `local` variables.** The trap
  fires after the enclosing function has returned, so the local is out of scope and
  `set -u` kills the handler — turning a successful run into exit 1. This bit
  `probe_cleanup` (fixed 2026-08-15 by promoting `targets` to the global
  `PROBE_TARGETS`). Signal traps are subtler: on `INT`/`TERM` the frame is still live,
  so the same bug is invisible until the normal exit path runs.
- Don't write `if cmd | grep -q ...` under `set -o pipefail`: `grep -q` exits on first
  match and SIGPIPEs the producer, so the pipeline reports failure and the branch
  silently inverts. Capture the output first, then match against it.
- Preflight before anything slow or interactive (e.g. `nc` reachability check before
  `ssh`), so failures name their cause instead of timing out generically.
- Error messages explain the ambiguous cases rather than passing OpenSSH's wording
  through — e.g. that "Permission denied" cannot distinguish a wrong password from a
  nonexistent account.

## Permissions

`.claude/settings.local.json` grants `Read(//Users/yorman/.ssh/**)` — reading key and
config files under `~/.ssh` is pre-approved.
