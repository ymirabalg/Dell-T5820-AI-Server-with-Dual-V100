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

Written 2026-09-14. **Nothing here is built yet.** §7 lists what must be decided or confirmed
before it can be, and two of those items are not mine to settle.

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

## 4. ⚠ What this does to the dashboard, and it is not cosmetic

The dashboard discovers instances from `/etc/llama-server/*.env` and joins a card to an instance by
`gpu.index === serving.instance` (its `SPEC.md` §3.4, §6.2). **In split mode that join has no
answer**: there is one instance and two cards, and instance `split` is not an index.

Left alone, GPU 1's *served by instance 1* becomes an em dash, which by invariant 1 reads as *this
reading could not be taken* — when the truth is *this card is serving, jointly, and the question
does not apply*. **That is a false statement by omission, and it is exactly the failure class this
project spent twelve steps removing.** Three honest options, and the choice is the owner's:

1. **Teach the dashboard the mode.** `split.env` is discoverable; the panel says *served jointly
   with GPU 0* on both cards. Most work, most honest.
2. **Name the mode without the join.** The SERVING panel shows one row, `split · both cards`, and
   the GPU cards drop the served-by line entirely in that mode rather than showing an em dash.
3. **Accept the em dash** and write it down in the spec as a known, deliberate inaccuracy.

**Until one is chosen, split mode ships with a dashboard that misreports GPU 1.** That must be
stated in the switch script's own output, not left to be discovered.

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

## 6. Sizing Gemma 4 31B, and what is genuinely known

**Known, measured on this box:** Gemma 4 is 5:1 sliding-window — for the 12B, 40 of 48 layers are
SWA with a 1024-token window and only 8 are global with **one** KV head, so KV costs **~16 KiB per
token** against Qwen3.6-27B's ~61.5. Context is nearly free on this architecture, which is why the
12B's full 262K window fits one card.

**Not known, and not to be assumed:** the 31B's layer counts, its KV geometry, its native context,
and therefore its actual footprint. **Do not scale the 12B's numbers by parameter count.** The
method that works here is in root `CLAUDE.md`: load it CPU-only and read `RssAnon`, ⚠ **with
`--no-repack`**, without which llama.cpp's CPU-optimised weight rewrite lands in `RssAnon` and
inflates the answer — measured at 13.87 GiB against a true 2.74 GiB on one model.

Across two cards there is 64 GiB of VRAM, so Q8_0 (~33 GiB of weights) is plausible where it is not
on one card, and Q4_K_M has room to spare. **Choose the quantisation after measuring, not before**,
and remember the measured rule from this box: decode is bandwidth-bound, so Q6_K costs ~26 % of
generation for ~1–2 benchmark points.

## 7. ⚠ Open — must be settled before this is built

1. **Which model, exactly.** `Gemma 4 31B` is not on the box and I have not confirmed the repo or
   filename upstream. The build knows the `gemma4` architecture, which is necessary and not
   sufficient. Needed: the Hugging Face repo, the file, the quantisation, and its size.
   ⚠ **`hf-get.sh` writes by SOURCE filename** — stage into a scratch directory and rename on
   success, because a name collision here has already nearly overwritten a live model.
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
