# Serving modes — specification

**Two mutually exclusive ways to use the two V100s, each entered by running one script.**

| mode | processes | GPUs | ports | what it is for |
|---|---|---|---|---|
| **`per-gpu`** (today, and the default) | two | one card each, `--split-mode none` | 8080 **and** 8081 | two independent agents, or one agent per port with its own KV cache |
| **`split`** (new) | **one** | **both cards**, `--split-mode layer` | 8080 only | a model too large for one card, or one agent that wants the whole box |

```
sudo ./serving-mode.sh split      # -> one Gemma 4 31B across both cards
sudo ./serving-mode.sh per-gpu    # -> back to one Qwen3.6-27B per card
sudo ./serving-mode.sh status     # which mode is in force, and what is actually running
```

Written 2026-09-14, §4 ruled 2026-09-15. **The scripts are being built; the dashboard half of §4 is
its own loop.** §7 lists what is still open.

---

## 1. Why split mode is worth having, and it is not only about size

Measured on this box (root `CLAUDE.md`, the 2026-08-27 soak), the same work in the two modes:

| | `-sm layer` (split) | `-sm none` (per-GPU) |
|---|---|---|
| plateau temperature | **65.4 °C** | 74.2 °C |
| margin to the 83 °C spec | 17.6 °C | 8.8 °C |
| sustained per-card power | ~150 W, alternating 250/50 | 232 W |
| prefill | **~34 % faster** | — |

**Split is both faster at prefill and 9 °C cooler**, because llama.cpp's layer split runs the cards
sequentially, so each alternates between working and idling instead of one card being pinned at a
sustained 250 W. That is a rare case where the fast option is also the safe one, and it matters
on a chassis whose ambient sensitivity is roughly 1:1 — the 74 °C single-card plateau was measured
with the chassis at 37 °C, so a room 10 °C warmer puts sustained single-card work near the
operating limit, and split absorbs the same swing with room to spare.

**What split costs** is the thing per-GPU exists for: one process means one KV cache and one slot,
so two agents share it and every switch between them repays a prefill. §6 of the dashboard spec's
reasoning applies unchanged — *assign one agent per port* — and in split mode there is one port.

## 2. The mechanism, and why it cannot be a config value

`/etc/systemd/system/llama-server@.service` bakes in **both** facts that would have to change:

```
Environment=CUDA_VISIBLE_DEVICES=%i     # instance N sees exactly card N
  --split-mode none \                   # literal, not a variable
```

and `serve-llm.sh`'s `instances()` is `seq 0 $(( $(gpu_count) - 1 ))` — the instance count **is**
the GPU count. A single process spanning two cards does not fit that shape, so split mode gets its
own unit rather than a new environment variable:

- **`llama-split.service`** — not templated, one instance. `CUDA_VISIBLE_DEVICES=0,1`,
  `--split-mode layer`, no `--main-gpu` (layer split does not need one), the same
  `--api-key-file`, `--metrics`, `--host 0.0.0.0` and template kwargs as the per-GPU unit.
  Config in **`/etc/llama-server/split.env`**, same grammar as the numbered ones.
- ⚠ **`Conflicts=llama-server@0.service llama-server@1.service`**, and the same `Conflicts=` back
  from the template. Both modes claim the same hardware; a second claimant does not fail politely,
  it OOMs or takes a card that is already busy. **Mutual exclusion belongs in systemd, not in the
  script**, because the script is not present at boot and systemd is.
- ⚠ **The scripts must `enable`/`disable`, not merely `start`/`stop`.** Otherwise the box reboots
  into whichever mode was enabled last time, which is the mode the operator thought they left.
  That is the same class as this project's ordering-cycle incident: the wrong thing at boot, with
  nothing on screen saying so.
- **`After=gpu-fan-control.service`** as the template has, and ⚠ **never `After=multi-user.target`**
  — root `CLAUDE.md` documents what that cost here.

## 3. The two scripts, and their contract

One script, two subcommands, because a shared preflight and a shared rollback written twice is two
things to keep in agreement. It follows this repo's conventions: `set -euo pipefail`,
`bold`/`info`/`ok`/`warn`/`die`, `usage()` re-reading the header comment, `--dry-run` on every
subcommand, and a `trap` that restores on failure.

**`serving-mode.sh split`** must, in this order:

1. **Preflight, and refuse rather than half-switch:** the model file exists and is readable; the
   build knows its architecture (`strings …/libllama.so* | grep -x gemma4` — present on this
   build, checked 2026-09-14); both cards are visible and idle; the API key file exists; the ufw
   rule for the port exists. ⚠ **A preflight that cannot evaluate a check reports `unknown` and
   refuses — never a tick.** This project has shipped the opposite four times.
2. Record the mode it is leaving, so `status` and the rollback can name it.
3. `disable --now` both `llama-server@N`, and **wait for the VRAM to actually free** rather than
   assuming — poll `nvidia-smi` until both cards are near idle, with a timeout that fails loudly.
4. Write `/etc/llama-server/split.env`, `enable --now llama-split`.
5. **Poll `/health` until it answers, and roll back on failure** exactly as `serve-llm.sh
   set-model` does today: restore the previous mode and say why. A context or a quantisation that
   does not fit must leave the box serving, not dark.
6. Print what is now true: mode, model, context, ports live and ports now dark.

**`serving-mode.sh per-gpu`** is the same in reverse, and **restores the arrangement recorded in
§8** rather than whatever happens to be in the env files.

**`serving-mode.sh status`** answers, from the system rather than from a file: which unit is
enabled, which is active, what each card holds, and ⚠ **whether the enabled mode and the running
mode agree** — disagreement is the interesting state and it is the one a naive check misses.

## 4. ✅ RULED — the dashboard states the mode, honestly

**Owner's ruling, 2026-09-15: the dashboard shows what mode the GPUs are running in, honestly.**
Option 1 of the three that were offered. It is the most work and the only one that is true.

⚠ **And it fixes something that was never sound.** The join is
`gpu.index === serving.instance` — which is not a fact about the system, it is a **coincidence of
per-GPU mode**. Instance N happens to sit on card N because the unit template pins it there with
`CUDA_VISIBLE_DEVICES=%i`. Nothing on §4's wire says so; the dashboard's own spec already admits
the join *"is a fact about the deployment that the dashboard cannot verify"*. Split mode does not
break the join — **it exposes that there was never one**.

**The fix is to invert it: an instance declares the cards it serves, and a card asks which instance
lists it.**

- §4's `serving[]` entry gains **`gpus: readonly number[]`** — sourced from the unit's own
  `CUDA_VISIBLE_DEVICES` (`%i` → `[N]`; the split unit → `[0, 1]`), which is the thing that
  actually decides it.
- The GPU card's line becomes *"served by instance N"* when that instance lists **this card alone**,
  and *"served jointly with GPU M"* (or the mode's own word) when it lists more than one. **No em
  dash**, because the reading is not missing — it is different.
- The SERVING panel shows **one row per process**, which is two rows in per-GPU mode and one in
  split, with the cards it spans named on the row.
- ⚠ **This is now true in BOTH modes rather than assumed in one**, and it is checkable: a
  mis-pinned instance would show the wrong card instead of being invisible.

Consequences that must be honoured when it is built: `gpus` is a **reading like any other**, so an
absent one is an em dash and `null` is not `[]` (invariant 1); the dashboard must not infer the
mode from the *count* of instances, because one instance can also mean one card failed; and §6.4's
condition ids must not change meaning when an instance's card list does.

## 5. Ports, and who breaks

Per-GPU serves **8080 and 8081**; split serves **8080 only**. Anything pointing at 8081 stops
working the moment the mode changes, and it stops working by connection refused rather than by
anything explanatory. The ufw rules already admit both ports from the LAN, so nothing firewall-side
changes.

**The switch script must say which clients it is about to break**, by name if the box knows them
and by port if it does not. ⚠ **It must not silently rebind 8081 to the split instance** to paper
over this: one process cannot serve two ports, and a proxy that forwards 8081 to 8080 would give
two agents one KV cache while looking like two independent endpoints — the *correctness* failure
the one-agent-per-port rule exists to prevent, not merely an efficiency one.

## 6. Gemma 4 31B — downloaded and MEASURED, 2026-09-14

`~/models/gemma-4-31B-it-Q8_0.gguf`, **32.64 GB**, from `ggml-org/gemma-4-31B-it-GGUF` (the same
org the 12B came from; `unsloth` publishes a byte-identical Q8_0). Fetched with `hf-get.sh` into
`~/models/.staging` and renamed on success, GGUF magic verified, no name collision.

**Read from its own GGUF header, not assumed:**

| | |
|---|---|
| architecture | `gemma4` — this build knows it (`strings libllama.so* \| grep -x gemma4`) |
| layers | **60: 10 global, 50 sliding-window** (window 1024) |
| KV heads | global **4** at head dim 512; SWA **16** at head dim 256 |
| native context | **262144** |
| **global KV** | **80.0 KiB per token** |
| **SWA KV** | **0.78 GiB in total, fixed** — it does not grow with context |

⚠ **Context is NOT nearly free on the 31B, and scaling the 12B's number would have been wrong by
5×.** The 12B costs ~16 KiB/token because it has **one** global layer with **one** KV head. The
31B has **ten** global layers with **four** KV heads each, so 10 × 4 × (512+512) × 2 B = **80
KiB/token**. This is exactly the trap §6 was written to avoid; the answer came from the file.

**Footprint across the two cards (64 GiB total), weights 30.4 GiB + KV:**

| context | KV | total | of 64 GiB |
|---|---|---|---|
| 65536 | 5.78 GiB | 36.2 GiB | 57 % |
| 131072 | 10.78 GiB | 41.2 GiB | 64 % |
| 163840 | 13.28 GiB | 43.7 GiB | 68 % |
| **262144** (native) | 20.78 GiB | **51.2 GiB** | **80 %** |

**The full native 262K window fits with ~13 GiB to spare** — which is the whole argument for split
mode on this model. Q8_0 at 32.64 GB cannot go on one 32 GiB card at all; Q4_K_M (18.32 GB) could,
and if that is ever preferred then split mode is not needed for it.

⚠ **Two things those totals do NOT include, and acceptance must:**

1. **Compute buffers at a deep prefill**, which are on top. On Qwen at 160K these measured only
   ~196 MiB, but that is a different architecture and has not been measured here.
2. ⚠ **Layer split divides by LAYER, not evenly by bytes**, so the two cards will not hold half
   each. **Check both cards, never the sum** — a total that fits inside 64 GiB says nothing about
   whether the busier card fits inside 32.

## 7. ⚠ Open — must be settled before this is built

1. ~~**Which model, exactly.**~~ **CLOSED 2026-09-14** — see §6. Downloaded, verified and its
   geometry measured. The repo also carries a **vision tower** (`mmproj-*`) and a **multi-token
   prediction head** (`mtp-*`); **neither is fetched and neither should be loaded** without a
   reason — the instance is text-only without `--mmproj`, and speculative decoding measured a
   **20× wall-clock LOSS** on these Volta cards (root `CLAUDE.md`), while reporting healthy
   internal metrics throughout.
2. **The dashboard question in §4** — owner's, and it decides whether split mode ships honest.
3. **Which mode is the default at boot** if both end up enabled or neither does.
4. **`--cache-reuse` is still in the INSTALLED per-GPU unit.** It was removed from `serve-llm.sh`
   on 2026-09-14 (it is architecturally dead on a hybrid model) but `serve-llm.sh install` has not
   been re-run, so the running unit still passes it. ⚠ It is **not** known to be dead on Gemma 4,
   which is not hybrid in the same way — so the split unit must decide deliberately rather than
   copy either answer.
5. **`--cache-ram 12288` per process.** One split process instead of two halves the host cache the
   box reserves; whether to raise it is a measurement, not a guess.

## 8. The `per-gpu` arrangement this must restore, exactly

Verified on the box 2026-09-14:

| | |
|---|---|
| model | `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf` |
| alias | `qwen3.6-27b` |
| context | **163840** |
| flash attention | `auto` |
| speculation | `none` |
| ports | 8080 (GPU 0), 8081 (GPU 1) |
| VRAM, idle | 28532 MiB of 32768 per card |

## 9. Acceptance

- Both switches run to completion from either starting state, and **twice in a row** — a switch
  that only works once is a switch that has not been tested.
- ⚠ **A reboot in each mode comes back in that mode**, with `journalctl -b | grep "ordering cycle"`
  empty. This class of bug appears only on a real boot.
- A deliberately impossible split (a context that cannot fit) **rolls back** and leaves the box
  serving, proven by forcing it.
- `status` reports a disagreement between enabled and running when one is forced.
- `shellcheck` clean; `--dry-run` on every subcommand writes nothing and prints what it would do.
- The dashboard's behaviour in split mode matches whichever §4 option was chosen, and is measured
  rather than assumed.
