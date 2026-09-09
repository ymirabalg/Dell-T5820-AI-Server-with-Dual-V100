/**
 * §6.2's STORAGE & NETWORK card — `/` and `/home` as bars with absolute figures, `eno1`
 * throughput with direction, and link state.
 *
 * See `memory-panel.tsx`'s module doc for why the disk pairs are composed from two
 * {@link formatGiB} calls rather than a joint formatter that does not exist in
 * `lib/format.ts` — the same reasoning applies here verbatim.
 *
 * ⚠ **Every source that reaches this panel is rendered somewhere** (added 2026-09-08 by 10b's
 * reconciliation, adversarial F5). `net-operstate` sits in its own `PanelNotes` block directly
 * under the link caption (10f/Q1 — see the second half of this doc),
 * `proc-net-dev` moves into `PanelNotes` (10e §2.6 — the `Strip` line it used to sit beside as
 * a `Row` note has no note slot of its own), and `statvfs` — which blanks BOTH mounts and files
 * one entry per mount — renders in the SAME `PanelNotes` call (§6.5's "one fact, stated once",
 * applied across the two sources that now share the one note slot this panel has left).
 *
 * The link row is the one reading on this panel whose §6.3 function ({@link severityLink})
 * returns `null` for an unreadable input, so it is the one that can go stale (see
 * `condition-lookup.ts`'s module doc); the two throughput figures are not banded by §6.3 at
 * all and render as plain `Strip` text.
 *
 * ⚠ **10e / invariant 7 — the link's stale age and its `errors[]` detail move onto two extra
 * sibling lines**, since `Caption` (unlike `StatusRow`) has no `note`/`detail` slots of its
 * own. Both are degraded-only (0px healthy, absent from every fixture `check-density.mjs`
 * grades) — `staleValueOr` still supplies the LAST VALUE inside the same pill (§6.5), it is
 * only the two supplementary facts that move to sibling lines.
 *
 * ⚠ **10f/Q1 corrected the second of those two.** The stale age is still a `Caption`; the
 * `errors[]` detail is **not** — it was a bare `<Caption>{linkError}</Caption>`, a fourth
 * unbounded `errors[]` block measured at 43 px (three wrapped lines) on a failed
 * `net-operstate`, and it now renders through `PanelNotes` (the TIGHT default — see the
 * comment at the call site for why this one block is not `roomy`) in the same position.
 * `linkError` is therefore a `TelemetryError`, not a `string`.
 */

import { errorsForPanel } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatBytesPerSecond, formatGiB, formatText } from '@/lib/format';
import { severityDiskFree, severityLink } from '@/lib/severity';
import type { Storage, TelemetrySnapshot } from '@/lib/types';

import { Meter } from '../meter';
import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { Strip } from '../strip';
import { Chip } from '../chip';
import { Caption } from './caption';
import { findDisplayed, staleAgeNote, staleValueOr } from './condition-lookup';
import { PanelNotes } from './panel-notes';
import { panelChip } from './panel-chip';

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
  const linkError = storageErrors.findLast((e) => e.source === 'net-operstate') ?? null;
  // ⚠ 10e-A13: this was `.find` — the FIRST — two lines under a comment that says LAST, and it
  // is the only reader in the loop that disagreed with its siblings (`cooling-panel.tsx:148,159`,
  // `safety-panel.tsx:75` and `linkError` above all use `findLast`). `events.ts` folds by
  // source and keeps the last, so with two `proc-net-dev` entries the panel showed one message
  // and the session event log showed a different one — F10's exact disease.
  const netError = storageErrors.findLast((e) => e.source === 'proc-net-dev') ?? null;
  // §6.5's "is available" half. `statvfs` cannot be attributed to one mount — `collectStorage`
  // files an entry per mount under one source — so both it and `proc-net-dev` (10e: no longer
  // has its own row note slot) render together, once, under the whole card.
  const diskErrors = storageErrors.filter((e) => e.source === 'statvfs');
  const notes = netError === null ? diskErrors : [...diskErrors, netError];

  return (
    <PanelShell title="storage & network" subtitle="statvfs · eno1" chip={chip}>
      <Meter
        label="/"
        formattedValue={`${formatGiB(storage?.root.usedGiB ?? null)} / ${formatGiB(storage?.root.totalGiB ?? null)}`}
        used={storage?.root.usedGiB ?? null}
        total={storage?.root.totalGiB ?? null}
        severity={rootSeverity}
        tickPercent={85}
      />
      <Meter
        label="/home"
        formattedValue={`${formatGiB(storage?.home.usedGiB ?? null)} / ${formatGiB(storage?.home.totalGiB ?? null)}`}
        used={storage?.home.usedGiB ?? null}
        total={storage?.home.totalGiB ?? null}
        severity={homeSeverity}
        tickPercent={85}
      />
      {/* 10f/Q1 — `roomy`: same column as MEMORY, ~94 px under the one that sets rows 2-3. */}
      <PanelNotes subject="storage & network" bound="roomy" messages={notes} />
      <Strip
        items={[
          { k: 'eno1 ↓ rx', v: formatBytesPerSecond(storage?.net.rxBytesPerSec ?? null) },
          { k: 'eno1 ↑ tx', v: formatBytesPerSecond(storage?.net.txBytesPerSec ?? null) },
        ]}
      />
      <Caption label="link">
        <Chip
          severity={linkSeverity}
          size="md"
          label={staleValueOr(linkCondition, formatText(storage?.net.link ?? null))}
        />
      </Caption>
      {/* S-B: the stale age is watch-toned, matching `status-row.module.css`'s `.noteWatch`
          and `alarm-banner.module.css`'s `.stale` exactly — inline since `Caption` has no
          tone variant of its own and this is the one caller that needs one. */}
      {linkAge === null ? null : (
        <Caption>
          <span style={{ color: 'var(--status-watch)' }}>{linkAge}</span>
        </Caption>
      )}
      {/* ⚠ 10f/Q1 — this was `<Caption>{linkError}</Caption>`: one more unbounded `errors[]`
          block, measured 43 px (three wrapped lines) on a failed `net-operstate`. It keeps its
          position — §6.5 puts the explanation beside the figure it blanks, and this one blanks
          the link line rather than the two mounts above — and gains the bounded well every
          other block has.

          ⚠ TIGHT, unlike the block above it, and the reason is measured. §6.1's rows 2 and 3
          size INDEPENDENTLY (row 3 = max(SAFETY, STORAGE)), so STORAGE's slack is SAFETY's
          height, not the whole column's: 159.4 healthy, 239.4 with all four rows explained.
          Two roomy wells here are 130 px and take STORAGE to 274.1 — past SAFETY, so STORAGE
          would set row 3 and the page would grow 34.7 px it has nowhere to put at 1600x1024.
          One roomy (this panel's `statvfs`/`proc-net-dev` block, up to three messages) plus
          one tight (this one, which holds exactly one `net-operstate` message) is 88 px and
          stays under. `10f-build.md` §2 has the sum. */}
      <PanelNotes subject="link" messages={linkError === null ? [] : [linkError]} />
    </PanelShell>
  );
}
