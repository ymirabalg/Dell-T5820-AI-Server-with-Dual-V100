# Handoff — D4: `errorsForPanel`, the `ErrorSource → panel` selector

**BUILD phase, clean context.** Read this, then `HANDOVER.md` §1, §5, §7, and
`pipeline/UI-BACKEND-GAPS.md` §2.2. `SPEC.md` §6.5 and §3.7 are the authority.

---

## What it is for

§6.5: *"A single sensor read fails → that figure shows `—`, **its `errors` entry is
available**, the rest of the panel renders."* And its one exception — *"an `—` whose cause is
already shown beside it"* — applies **only when the coloured neighbour is in the same panel**.

Both sentences need a function from an `errors[]` entry to the panel it explains. **There is
none.** `grep -rn ErrorSource lib/ --include=*.ts` outside `types.ts`, `wire.ts` and `events.ts`
is empty.

Without it every panel invents its own filter, and §6.5's exception cannot be implemented at all
because nothing knows what "the same panel" means.

## ⚠ The trap: `conditionSource` is NOT the panel list, and reusing it is wrong

`lib/client/observations.ts` already maps `ConditionKind → string`:

```
gpu_temp|gpu_throttle|gpu_vram → `gpu ${subject}`      cpu_temp|ram → 'host'
fan_stopped|fan5_engaged|fan5_absolute → 'cooling'     health → 'serving'
unit → subject === FAN_SERVICE_UNIT ? 'cooling' : 'serving'
disk_free|link → 'storage'   ufw_enforcing|pwm5_present|dkms_for_running_kernel → 'safety'
```

**That is the EVENT LOG's source column** (§6.4's sketch: `GPU0`, `fan5`, `llama-server@1`), and
it is deliberately coarser than §6.1's grid:

| §6.1's grid | `conditionSource` says |
|---|---|
| **CPU** and **MEMORY** are two panels | both are `'host'` |
| the **header** carries hostname and uptime | no value at all |

So `conditionSource` cannot place an em dash: it cannot tell a failed `/proc/meminfo` (MEMORY)
from a failed `coretemp` (CPU), and it has nowhere to put a failed `hostname`.

⚠ **Do not "reuse" it by widening it, and do not copy its switch.** HANDOVER's do-not-copy list
says a second mapping of a join that already exists is second-worst — so decide deliberately
which of these you are doing, and write the reason down:

- **(a)** a separate `Panel` union for the grid, with `conditionSource` left alone as the log's
  vocabulary — two vocabularies, different on purpose, each with one definition; or
- **(b)** one `Panel` type that both use, with the log rendering a coarser label from it.

I lean **(a)**: the log reads better coarse (`host` beats `cpu`), §6.4's own sketch is coarse,
and (b) makes one type serve two audiences with different needs. But it is your call, it must be
argued at the code, and the adversarial phase will challenge it.

## ⚠ The mapping is not 1:1, and three sources are the reason

Work from §3.7's eighteen sources. Three do not map to one panel, and a naive switch gets them
wrong:

| source | panel | why it is not simple |
|---|---|---|
| **`dbus`** | **`cooling` AND `serving`** | It is filed by **two** collectors: `collectSafety` for `gpu-fan-control.service` and `collectServing` for the llama units. A D-Bus failure genuinely blanks readings on both panels — and on **safety** too, since `fanServiceState` is a SAFETY row |
| **`nvidia-smi`** | **both GPU panels** | It is the whole enumeration, not one card. `gpus: null` blanks GPU 0 and GPU 1 together |
| **`hostname`, `proc-uptime`** | the **header** | §6.2's header carries hostname and uptime (settled 2026-09-07). The header is not in §6.1's panel grid, so `Panel` needs a member for it or those two entries are unreachable |

The rest, for completeness — check each against §3.2/§3.5/§3.6 rather than trusting this table:
`coretemp`, `proc-stat`, `proc-loadavg`, `proc-cpuinfo` → CPU · `proc-meminfo` → MEMORY ·
`proc-net-dev`, `net-operstate`, `statvfs` → STORAGE & NETWORK · `dell-smm` → COOLING ·
`llama-env`, `llama-health`, `llama-models` → SERVING · `ufw`, `dkms` → SAFETY.

⚠ **`proc-cpuinfo` feeds the CPU panel's SUBTITLE** (`cpuModel · 6C / 12T`, §6.2), not a body
row. It still belongs to CPU; noted because it is the one whose figure is not a measurement.

## What to build

In `lib/client/observations.ts`, beside `conditionSource`:

```ts
export type Panel = …            // the grid's panels, plus the header
export const errorsForPanel = (
  snapshot: TelemetrySnapshot,
  panel: Panel,
) => readonly TelemetryError[]
```

- **Exhaustive `switch` over `ErrorSource`.** It is a closed vocabulary of 18 (§3.7) and
  `noFallthroughCasesInSwitch` is on, so a nineteenth source becomes a compile error. **Do not
  use a `Record` with a default, and do not use a lookup object keyed by string** — either turns
  a new source into silence.
- Preserve the order of `snapshot.errors`. It is fixed deliberately (see `snapshot.ts`) and
  `events.ts` reads the **last** message per source.
- Return `[]`, never `null`, for a panel with no entries.

## Rules

- `pnpm verify` exiting 0 is the only green. Never a printed summary.
- ⚠ Never run a harness concurrently with `verify` or another harness. Serially; they take
  minutes and buffer their output.
- Mark load-bearing tests `⚠` and **back each with a mutation** in the harness owning that FILE
  — `observations.test.ts` is **step 8's**.
- **Every boundary needs a fixture on both sides.** Here that means: for each panel, an entry
  that belongs to it *and* one that does not.
- ⚠ **The `dbus` fan-out is the thing most likely to be got wrong and least likely to be
  noticed.** Give it its own ⚠ test and its own mutation.
- Do not touch `SPEC.md`, `MOCK.html`, `PLAN.md`. Do not commit. Do not touch the box.

## Report back

What you built, which of (a)/(b) you chose and why, the mapping you settled for all eighteen
sources, anything you found that is wrong but out of scope, and the real evidence output.
