/**
 * §6.2's STORAGE & NETWORK card — `/` and `/home` as bars with absolute figures, `eno1`
 * throughput with direction, and link state.
 *
 * See `memory-panel.tsx`'s module doc for why the disk pairs are composed from two
 * {@link formatGiB} calls rather than a joint formatter that does not exist in
 * `lib/format.ts` — the same reasoning applies here verbatim.
 *
 * ⚠ **Every source that reaches this panel is rendered somewhere** (added 2026-09-08 by 10b's
 * reconciliation, adversarial F5). `net-operstate` sits on the link row, `proc-net-dev` on the
 * `rx` row (it blanks rx and tx together; §6.5's "one fact, stated once" says once, and rx is
 * the first figure it blanks), and `statvfs` — which blanks BOTH mounts and files one entry per
 * mount — renders once beneath the two bars via {@link PanelNotes}. Before that, a `statvfs`
 * failure showed `/` and `/home` as `— / —` with no message anywhere on the page, and a
 * `proc-net-dev` failure blanked both counters silently.
 *
 * The link row is the one reading on this panel whose §6.3 function ({@link severityLink})
 * returns `null` for an unreadable input, so it is the one that can go stale (see
 * `condition-lookup.ts`'s module doc) and carries `StatusRow`'s treatment; the two throughput
 * figures are not banded by §6.3 at all and render as plain rows.
 */

import { errorsForPanel } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatBytesPerSecond, formatGiB, formatText } from '@/lib/format';
import { severityDiskFree, severityLink } from '@/lib/severity';
import type { Storage, TelemetrySnapshot } from '@/lib/types';

import { Meter } from '../meter';
import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { Row } from '../row';
import { findDisplayed, staleAgeNote, staleValueOr } from './condition-lookup';
import { PanelNotes } from './panel-notes';
import { panelChip } from './panel-chip';
import { StatusRow } from './status-row';

export function StorageNetworkPanel({ state, nowMs }: PanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const storage: Storage | null = snapshot?.storage ?? null;

  const rootSeverity = severityDiskFree(storage?.root.usedGiB ?? null, storage?.root.totalGiB ?? null);
  const homeSeverity = severityDiskFree(storage?.home.usedGiB ?? null, storage?.home.totalGiB ?? null);
  const linkSeverity = severityLink(storage?.net.link ?? null);
  // ⚠ 10b-S-F: `panelChip`, not `worstSeverity` — a panel that would read `normal` while one
  // of the three leaves (root free%, home free%, link state) is `null` shows no band instead.
  const chip = panelChip(rootSeverity, homeSeverity, linkSeverity);

  const linkCondition = findDisplayed(state.displayed, 'link');
  const linkAge = staleAgeNote(linkCondition, nowMs);
  const storageErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'storage');
  // ⚠ LAST, not first — `events.ts` keys a `Map` by source (10b-reconcile, adversarial F10),
  // and `collectStorage` concatenates root's and home's `statvfs` entries, so more than one
  // entry per source is the ordinary case on this panel rather than a hypothetical.
  const linkError = storageErrors.findLast((e) => e.source === 'net-operstate')?.message ?? null;
  const netError = storageErrors.findLast((e) => e.source === 'proc-net-dev')?.message ?? null;
  // §6.5's "is available" half for the source that blanks BOTH mounts. `statvfs` cannot be
  // attributed to one of them — `collectStorage` files an entry per mount under one source —
  // so it is rendered once under the two bars it explains, per `errorsForPanel`'s own
  // "granularity is per source, not per figure" (10b-reconcile, adversarial F5).
  const diskErrors = storageErrors.filter((e) => e.source === 'statvfs');

  return (
    <PanelShell title="storage & network" subtitle="statvfs · eno1" chip={chip}>
      <Meter
        label="/"
        formattedValue={`${formatGiB(storage?.root.usedGiB ?? null)} / ${formatGiB(storage?.root.totalGiB ?? null)}`}
        used={storage?.root.usedGiB ?? null}
        total={storage?.root.totalGiB ?? null}
        severity={rootSeverity}
      />
      <Meter
        label="/home"
        formattedValue={`${formatGiB(storage?.home.usedGiB ?? null)} / ${formatGiB(storage?.home.totalGiB ?? null)}`}
        used={storage?.home.usedGiB ?? null}
        total={storage?.home.totalGiB ?? null}
        severity={homeSeverity}
      />
      <PanelNotes messages={diskErrors} />
      <Row
        label="eno1 rx"
        value={formatBytesPerSecond(storage?.net.rxBytesPerSec ?? null)}
        note={netError}
      />
      <Row label="eno1 tx" value={formatBytesPerSecond(storage?.net.txBytesPerSec ?? null)} />
      <StatusRow
        label="eno1 link"
        value={staleValueOr(linkCondition, formatText(storage?.net.link ?? null))}
        severity={linkSeverity}
        note={linkAge}
        noteTone={linkAge === null ? 'muted' : 'watch'}
        detail={linkError}
      />
    </PanelShell>
  );
}
