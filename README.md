# ai-server

Shell scripts and notes for turning a **Dell Precision 5820 Tower** into a headless
LLM inference server with **2 × Tesla V100 32 GB**.

Everything here was written against one specific machine and every number in the
notes was measured on it. The scripts run on the server; the workflow is *local Mac
drives the remote box over SSH*.

## What's here

| file | runs on | what it does |
|---|---|---|
| `setup-ssh-key.sh` | Mac | authorises this Mac's key on the server, optionally writes an `~/.ssh/config` alias |
| `provision-base.sh` | server | grows the root LV into free VG space, installs base tooling |
| `dell-smm-5fan.sh` | server | rebuilds `dell-smm-hwmon` with `DELL_SMM_NO_FANS=5` so the board's 5th (PCIe/GPU) fan header becomes addressable, and registers it with DKMS |
| `dell-smm-5fan.patch` | — | the upstream LKML patch the rebuild applies |
| `gpu-fan-control.sh` | server | drives the GPU fan header from GPU temperature, with a hand-back band and release dwell |
| `gpu-bench.sh` | server | runs a GPU workload under a thermal watchdog, with per-second telemetry |
| `serve-llm.sh` | server | runs one `llama-server` instance per GPU as a systemd template unit, key-gated, firewalled to the LAN |
| `thermal-soak.sh` | server | loads every GPU at once under a watchdog and logs GPU temp/power plus every fan channel and thermal sensor; reports the plateau and whether the run completed |
| `hf-get.sh` | anywhere | chunked parallel download from Hugging Face with per-chunk resume and verification — a single stream settles to ~5 MB/s no matter your link |

`article/precision-5820-field-notes.html` is a written-up account of the whole build —
self-contained, photos embedded, no external assets.

## Read this first

**`CLAUDE.md` is the real documentation.** It carries the findings that took the longest
to establish and are expensive to re-derive:

- the UEFI variable that makes the machine POST with a V100 at all, and why you must
  never reuse another board's payload
- why BIOS 2.48.0 is the ceiling and 2.50.1 must not be installed
- how the embedded controller actually drives the fans, and which of its telemetry
  attributes lie
- measured thermal plateaus for every serving configuration
- benchmark results and the model-selection reasoning

Read it before changing anything in these scripts.

## Conventions

`bash` with `set -euo pipefail`; `bold`/`info`/`ok`/`warn`/`die` output helpers;
`usage()` re-reads the comment header so help text and header never drift; `--dry-run`
on every subcommand; anything that changes hardware state installs a restoring trap and
repeats the cleanup in the unit's `ExecStopPost`.

Several hard-won gotchas are recorded in `CLAUDE.md` under *Conventions in the scripts* —
`$HOME` shifting under `sudo`, `set -u` and `EXIT` traps, `pipefail` with `grep -q`, and
`pkill -f` matching the shell that invoked it.

## Contributions

**Forks welcome, pull requests are not.** This documents one specific machine and is
kept as a stable reference rather than a collaborative project. A repository ruleset
blocks branch creation, updates and deletion for everyone but the owner, so nothing can
be pushed or merged here.

GitHub offers no way to turn the pull-request button off, so you can still open one —
it will not be merged. Fork it and take it wherever you need; that is what forks are for,
and the licence permits it.

If you have the same hardware and something here is wrong, an issue is the useful channel.

## Not included

No credentials. The serving API key is generated on the server into `/etc` at install
time and never leaves it.
