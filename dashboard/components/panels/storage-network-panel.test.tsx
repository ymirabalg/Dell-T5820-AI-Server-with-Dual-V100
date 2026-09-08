import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero } from '@/lib/fixtures';
import { bytesPerSecond, gib } from '@/lib/types';
import type { TelemetrySnapshot } from '@/lib/types';

/** The `/` meter's own markup, up to (not including) `/home`'s — the two meters are adjacent
 *  siblings, so a whole-document check could not tell which one a bug hit. */
const rootMeterOf = (html: string): string => html.slice(html.indexOf('>/<'), html.indexOf('>/home<'));

import { StorageNetworkPanel } from './storage-network-panel';
import { allReadingsNull, displayedConditionOf, emptyState, stateWith, valueCells } from './test-support';

const snapshotWith = (overrides: Partial<TelemetrySnapshot['storage']>): TelemetrySnapshot => ({
  ...everythingZero,
  storage: { ...everythingZero.storage, ...overrides },
});

describe('§6.2 — STORAGE & NETWORK', () => {
  test('subtitle names both sources', () => {
    const html = renderToStaticMarkup(<StorageNetworkPanel state={emptyState()} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('statvfs');
    expect(html).toContain('eno1');
  });

  test('/ and /home render as bars with absolute GiB figures', () => {
    const snapshot = snapshotWith({
      root: { usedGiB: gib(50), totalGiB: gib(232.6) },
      home: { usedGiB: gib(400), totalGiB: gib(915.8) },
      net: everythingZero.storage.net,
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('50.0 GiB');
    expect(html).toContain('232.6 GiB');
    expect(html).toContain('400.0 GiB');
    expect(html).toContain('915.8 GiB');
  });

  test('disk is banded on FREE space, not used — 96% used (4% free) alarms', () => {
    const snapshot = snapshotWith({
      root: { usedGiB: gib(223.3), totalGiB: gib(232.6) },
      home: everythingZero.storage.home,
      net: everythingZero.storage.net,
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('data-severity="alarm"');
  });

  test('⚠ root’s meter shows ROOT’s own severity, never home’s (and vice versa)', () => {
    const snapshot = snapshotWith({
      root: { usedGiB: gib(223.3), totalGiB: gib(232.6) }, // ~96% used → alarm
      home: { usedGiB: gib(50), totalGiB: gib(915.8) }, // ~5.5% used → normal
      net: everythingZero.storage.net,
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    const rootMeter = html.slice(html.indexOf('>/<'), html.indexOf('>/home<'));
    const homeMeter = html.slice(html.indexOf('>/home<'));
    expect(rootMeter).toContain('data-severity="alarm"');
    expect(homeMeter).not.toContain('data-severity="alarm"');
  });

  test('network throughput renders with direction, auto-scaled', () => {
    const snapshot = snapshotWith({
      root: everythingZero.storage.root,
      home: everythingZero.storage.home,
      net: { rxBytesPerSec: bytesPerSecond(1_243_000), txBytesPerSec: bytesPerSecond(0), link: 'up' },
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('1.2 MB/s');
    expect(html).toContain('0 KB/s');
  });

  test('link state is banded — "up" is normal, "down" is alarm', () => {
    const down = snapshotWith({
      root: everythingZero.storage.root,
      home: everythingZero.storage.home,
      net: { ...everythingZero.storage.net, link: 'down' },
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(down)} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('data-severity="alarm"');
    expect(html).toContain('down');
  });

  test("⚠ a stale link condition renders S-B's exact wording, watch-toned", () => {
    const nullLinkSnapshot = snapshotWith({
      root: everythingZero.storage.root,
      home: everythingZero.storage.home,
      net: { ...everythingZero.storage.net, link: null },
    });
    const displayed = [
      displayedConditionOf({
        kind: 'link',
        subject: null,
        id: 'link',
        label: 'eno1 link',
        value: 'up',
        severity: 'normal',
        displaySeverity: 'normal',
        stale: true,
        lastSeenMs: 0,
      }),
    ];
    const state = stateWith(nullLinkSnapshot, { displayed });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={state} nowMs={372_000} panelId="storage-and-network" />);
    expect(html).toContain('last read 6:12 ago');
  });

  test('⚠ invariant 1 — a missing root-disk reading renders — with the no-band track, not 0.0 GiB', () => {
    // `storage?.root.usedGiB ?? null` is inlined at three separate call sites (the severity
    // calc and the Meter's `formattedValue`/`used` props) — a panel-level typo of `?? gib(0)`
    // at any of them would have passed every other test in this file, since none gives
    // `root.usedGiB` a null reading while the rest of `storage` is present.
    const snapshot = snapshotWith({
      root: { usedGiB: null, totalGiB: gib(232.6) },
      home: everythingZero.storage.home,
      net: everythingZero.storage.net,
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    const root = rootMeterOf(html);
    expect(root).toContain('— / 232.6 GiB');
    expect(root).not.toContain('0.0 GiB / 232.6 GiB');
    expect(root).toContain('data-severity="none"');
  });

  // Not ⚠: the mirror case — documentation, not a ledger obligation (see gpu-panel.test.tsx's
  // identical note; `severityDiskFree`'s own zero-used behaviour is severity.test.ts's).
  test('a genuine 0.0 GiB root-disk reading renders the numeral, banded normal', () => {
    const snapshot = snapshotWith({
      root: { usedGiB: gib(0), totalGiB: gib(232.6) },
      home: everythingZero.storage.home,
      net: everythingZero.storage.net,
    });
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    const root = rootMeterOf(html);
    expect(root).toContain('0.0 GiB / 232.6 GiB');
    expect(root).toContain('data-severity="normal"');
  });

  test('before the first poll, both meters and the link row render — rather than throwing', () => {
    const html = renderToStaticMarkup(<StorageNetworkPanel state={emptyState()} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('—');
  });
});

describe('⚠ §6.5 — statvfs and proc-net-dev had no rendering path at all', () => {
  const rowContaining = (html: string, needle: string): string => {
    const at = html.indexOf(needle);
    return html.slice(html.lastIndexOf('<div', at), html.indexOf('</div>', at));
  };

  test('⚠ a statvfs failure renders once beneath the two bars it blanks', () => {
    // Both mounts read `— / —` with no message anywhere on the page. `statvfs` blanks BOTH, and
    // `collectStorage` files an entry per mount under the one source, so it cannot be attributed
    // to one bar — §3.7's granularity is per source, so it is stated once (adversarial F5).
    const snapshot: TelemetrySnapshot = {
      ...snapshotWith({ root: { usedGiB: null, totalGiB: null }, home: { usedGiB: null, totalGiB: null } }),
      errors: [{ source: 'statvfs', message: '/home: ENOENT' }],
    };
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('/home: ENOENT');
    expect(html.split('/home: ENOENT').length - 1).toBe(1);
  });

  test('⚠ a proc-net-dev failure explains the blanked counters', () => {
    const snapshot: TelemetrySnapshot = {
      ...snapshotWith({ net: { rxBytesPerSec: null, txBytesPerSec: null, link: 'up' } }),
      errors: [{ source: 'proc-net-dev', message: '/proc/net/dev: EACCES' }],
    };
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    expect(rowContaining(html, 'eno1 rx')).toContain('/proc/net/dev: EACCES');
  });

  test('⚠ a stale link row keeps its LAST VALUE and still shows its errors[] cause', () => {
    // §6.5 in bold — the last value stands — and the age must not displace the explanation
    // (adversarial F3/F4).
    const snapshot: TelemetrySnapshot = {
      ...snapshotWith({ net: { rxBytesPerSec: null, txBytesPerSec: null, link: null } }),
      errors: [{ source: 'net-operstate', message: 'eno1/operstate: ENOENT' }],
    };
    const displayed = [displayedConditionOf({ kind: 'link', id: 'link', label: 'eno1 link', value: 'up', stale: true, lastSeenMs: 0 })];
    const html = renderToStaticMarkup(
      <StorageNetworkPanel state={stateWith(snapshot, { displayed })} nowMs={372_000} panelId="storage-and-network" />,
    );
    const row = rowContaining(html, 'eno1 link');
    expect(valueCells(row)).toEqual(['up']);
    expect(row).toContain('last read 6:12 ago');
    expect(row).toContain('eno1/operstate: ENOENT');
  });
});

describe('⚠ invariant 1, across EVERY reading on this panel', () => {
  test('⚠ with every reading null, no value cell prints a numeral', () => {
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="storage-and-network" />);
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(5);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
  });
});
