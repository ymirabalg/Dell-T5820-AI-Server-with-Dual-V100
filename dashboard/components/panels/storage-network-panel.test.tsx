import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero } from '@/lib/fixtures';
import { bytesPerSecond, gib } from '@/lib/types';
import type { TelemetrySnapshot } from '@/lib/types';

/** The `/` meter's own markup, up to (not including) `/home`'s — the two meters are adjacent
 *  siblings, so a whole-document check could not tell which one a bug hit. */
const rootMeterOf = (html: string): string => html.slice(html.indexOf('>/<'), html.indexOf('>/home<'));

/** The full markup of the row/div containing `needle` — hoisted to module scope (was local to
 *  the `§6.5` describe below) so the `§6.2` tests can scope past the PanelShell HEAD too
 *  (10c2's toContain-scope guard: the head is a reduction over root/home/link, so it can
 *  independently satisfy the same `data-severity` value a row's own bug would fail to). */
/**
 * ⚠ 10e §2.6 — the link row is no longer a `StatusRow` `<div>`: it is a `Caption` `<p>`
 * (`link` + a `Chip md` pill), with the stale age and the `net-operstate` detail as their own
 * SIBLING `<p>` lines rather than nested inside it (`Caption` has no note/detail slot).
 * Scoped to the LINK caption's own `<p>`, not its siblings — a `<div>`-based search would
 * otherwise return an unrelated ancestor (or nothing) once the row is a `<p>`.
 */
const linkCaptionOf = (html: string): string => {
  const at = html.indexOf('>link<');
  return html.slice(html.lastIndexOf('<p', at), html.indexOf('</p>', at));
};

import { StorageNetworkPanel } from './storage-network-panel';
import { allReadingsNull, displayedConditionOf, emptyState, stateWith, valueCells } from './test-support';

const snapshotWith = (overrides: Partial<TelemetrySnapshot['storage']>): TelemetrySnapshot => ({
  ...everythingZero,
  storage: { ...everythingZero.storage, ...overrides },
});

// `new RegExp` for the reason given with the other regex consts in this file: an odd number
// of `"` in a regex LITERAL desynchronises `lib/source-text.ts`'s comment-stripper.
const TICK_CLASS = new RegExp('class="_tick', 'g');

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
    // Scoped to root's own meter — the PanelShell HEAD reduces over root/home/link and would
    // show the identical alarm regardless (10c2's toContain-scope guard).
    expect(rootMeterOf(html)).toContain('data-severity="alarm"');
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
    // Scoped to the link row — same head-reduction risk as the disk test above (10c2's
    // toContain-scope guard).
    const row = linkCaptionOf(html);
    expect(row).toContain('data-severity="alarm"');
    expect(row).toContain('down');
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
    // ⚠ 10e-A7, reconciliation: this test said "watch-toned" in its name and asserted only the
    // WORDING, so deleting the tone left it green. S-B (SPEC §6.5) requires the age to read
    // `--status-watch` and NOT `--status-alarm` — the condition is still an alarm, and what
    // this text says is that nobody has been able to look since. `Caption` has no tone variant
    // (the build recorded it as silence #4), so this one caller carries an inline style; the
    // one-off is exactly why nothing else can guard it.
    expect(html).toMatch(/<span style="color:var\(--status-watch\)">last read 6:12 ago<\/span>/);
    expect(html).not.toContain('var(--status-alarm)');
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
    // 10e §2.6: `eno1 rx`/`tx` move into a `Strip` line with no note slot of its own —
    // `proc-net-dev`'s message now renders once, in `PanelNotes`, under the whole card.
    expect(html).toContain('/proc/net/dev: EACCES');
  });

  // ⚠ 10e-A13, fixed by the reconciliation. This panel read the FIRST `proc-net-dev` entry —
  // `.find` — two lines under its own ⚠ comment saying LAST, and while every sibling in the
  // loop (`cooling-panel.tsx:148,159`, `safety-panel.tsx:75`, and `linkError` on the line
  // directly above it) uses `findLast`. `lib/client/events.ts` folds `errors[]` into a `Map`
  // keyed by source and keeps the LAST, so with two entries the panel showed one message and
  // the session event log showed a different one — 10b's F10 exactly. Both directions were
  // green before this fixture existed.
  test('⚠ with two proc-net-dev entries the panel shows the LAST — the one the event log shows', () => {
    const snapshot: TelemetrySnapshot = {
      ...snapshotWith({ net: { rxBytesPerSec: null, txBytesPerSec: null, link: 'up' } }),
      errors: [
        { source: 'proc-net-dev', message: '/proc/net/dev: EACCES' },
        { source: 'proc-net-dev', message: 'eno1 vanished from /proc/net/dev' },
      ],
    };
    const html = renderToStaticMarkup(<StorageNetworkPanel state={stateWith(snapshot)} nowMs={0} panelId="storage-and-network" />);
    expect(html).toContain('eno1 vanished from /proc/net/dev');
    expect(html).not.toContain('/proc/net/dev: EACCES');
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
    // 10e §2.6: the link's LAST VALUE stays inside the pill on the `link` caption itself; the
    // stale age and the errors[] detail are sibling `<p>` lines now (`Caption` has neither
    // slot), so they are checked over the whole render rather than nested inside one row.
    const row = linkCaptionOf(html);
    expect(valueCells(row)).toEqual(['up']);
    expect(html).toContain('last read 6:12 ago');
    expect(html).toContain('eno1/operstate: ENOENT');
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

// ⚠ 10e-A5 (mutation D2), added by 10e's RECONCILIATION, 2026-09-09. BOTH `tickPercent={85}`
// wirings could be deleted together with all 2892 tests green. §6.3 bands disk on FREE space
// (`≥ 15 %` normal), so the mark sits at 85 % USED — the one place on this panel where the two
// readings of the same bar meet, and the reason a single shared fixture is not enough: the
// mutation deleted both, so a test asserting "a tick exists" would have to count them.
describe('⚠ 10e-A5 — both disk bars carry the 85 %-used watch tick', () => {
  test('⚠ exactly two ticks, both at 85 %', () => {
    const html = renderToStaticMarkup(
      <StorageNetworkPanel state={stateWith(everythingZero)} nowMs={0} panelId="storage-and-network" />,
    );
    expect((html.match(/class="_tick[^"]*"[^>]*style="left:85%[^"]*"/g) ?? []).length).toBe(2);
    expect((html.match(TICK_CLASS) ?? []).length).toBe(2);
  });
});
