/**
 * §6.2's MEMORY card — RAM against 61 GiB as a bar, and swap on its own row: *"any swap in
 * use is meaningful on this box, where 2 × 12 GiB of host RAM prompt cache is configured."*
 *
 * ⚠ **No `formatGiBPair` exists in `lib/format.ts`.** §6.6 spells a compact joint form only
 * for the VRAM MiB pair (`26,452 / 32,768 MiB`, one unit suffix); it does not say a GiB pair
 * shares that shape, and inventing one here would be writing a formatting law `lib/format.ts`
 * does not state (L11/O14: use the canonical formatters, do not hand-roll a unit string).
 * Recorded per invariant 7 rather than guessed at: this composes the pair from two calls to
 * {@link formatGiB}, each already unit-bearing (`24.3 GiB / 61.0 GiB`), which costs a repeated
 * suffix rather than a fabricated formatting rule.
 *
 * 10e §2.4: RAM used moves from a `Row` into the dominant `Hero` figure (unit `GiB used`, the
 * mock's own form — composed from `formatGiBParts`'s own unit plus that literal word, never a
 * split string, O14); swap stays a `Meter` (§6.2: "its own row"). `panelChip`, the severity
 * functions and the RAM/swap 10b-S-F leaf-severity argument are all UNCHANGED — 10e touches
 * density, never data or rules.
 */

import { PanelShell } from '../panel-shell';
import { Hero } from '../hero';
import { Meter } from '../meter';
import type { PanelProps } from '../panel-props';
import { errorsForPanel } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatGiB, formatGiBParts, formatSwapGiB } from '@/lib/format';
import { severityRam, severitySwap } from '@/lib/severity';
import type { Host, TelemetrySnapshot } from '@/lib/types';

import { PanelNotes } from './panel-notes';
import { panelChip } from './panel-chip';

export function MemoryPanel({ state }: PanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const host: Host | null = snapshot?.host ?? null;
  const used = host?.memUsedGiB ?? null;
  const total = host?.memTotalGiB ?? null;
  const swap = host?.swapUsedGiB ?? null;
  const swapTotal = host?.swapTotalGiB ?? null;
  const ramSeverity = severityRam(used, total);
  const swapSeverity = severitySwap(swap);
  // ⚠ 10b-S-F: the two LEAF severities, never `severityMemory` — that helper's own
  // `worstSeverity` already discards a `null` RAM reading in favour of a present, normal swap
  // reading before this file ever sees the result. `panelChip` needs to see both leaves itself
  // to catch the case the ruling is about (`panel-chip.ts`'s module doc has the full argument).
  const chip = panelChip(ramSeverity, swapSeverity);
  const usedParts = formatGiBParts(used);

  return (
    <PanelShell title="memory" subtitle="/proc/meminfo" chip={chip}>
      <Hero value={usedParts.value} unit={`${usedParts.unit} used`} severity={ramSeverity} ariaLabel="memory used" />
      <Meter
        label="RAM"
        formattedValue={`${formatGiB(used)} / ${formatGiB(total)}`}
        used={used}
        total={total}
        severity={ramSeverity}
        tickPercent={85}
      />
      <Meter
        label="swap"
        formattedValue={`${formatSwapGiB(swap)} / ${formatSwapGiB(swapTotal)}`}
        used={swap}
        total={swapTotal}
        severity={swapSeverity}
      />
      {/* §6.5's "is available" half. `proc-meminfo` is this panel's ONLY source and it blanks
          BOTH figures at once, so it is rendered once under them rather than twice beside them
          — `errorsForPanel`'s "granularity is per source, not per figure". */}
      <PanelNotes messages={snapshot === null ? [] : errorsForPanel(snapshot, 'memory')} />
    </PanelShell>
  );
}
