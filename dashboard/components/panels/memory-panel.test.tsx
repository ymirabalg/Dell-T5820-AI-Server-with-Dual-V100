import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero } from '@/lib/fixtures';
import { gib } from '@/lib/types';
import type { TelemetrySnapshot } from '@/lib/types';

import { MemoryPanel } from './memory-panel';
import { allReadingsNull, emptyState, stateWith, valueCells } from './test-support';

const snapshotWith = (overrides: Partial<TelemetrySnapshot['host']>): TelemetrySnapshot => ({
  ...everythingZero,
  host: { ...everythingZero.host, ...overrides },
});

describe('§6.2 — the MEMORY card', () => {
  test('subtitle is the fixed source label', () => {
    const html = renderToStaticMarkup(<MemoryPanel state={emptyState()} nowMs={0} panelId="memory" />);
    expect(html).toContain('/proc/meminfo');
  });

  test('RAM renders as a bar with absolute GiB figures', () => {
    const snapshot = snapshotWith({ memUsedGiB: gib(24.3), memTotalGiB: gib(61) });
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).toContain('24.3 GiB');
    expect(html).toContain('61.0 GiB');
  });

  test('⚠ swap gets its own row, at 2dp — a tiny amount must not round to 0.0', () => {
    const snapshot = snapshotWith({ memUsedGiB: gib(24.3), swapUsedGiB: gib(0.04) });
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).toContain('swap');
    expect(html).toContain('0.04 GiB');
    // A 1dp rendering of the same reading would print 0.0 GiB and lose the whole point of the
    // 2dp row — assert the swap VALUE specifically, not merely that "swap" appears somewhere.
    const swapLine = html.slice(html.indexOf('>swap<'));
    expect(swapLine).not.toContain('0.0 GiB');
  });

  test('⚠ the HEAD chip alarms from swap alone even while RAM% is fine (§6.3’s second trigger)', () => {
    const snapshot = snapshotWith({ memUsedGiB: gib(10), memTotalGiB: gib(61), swapUsedGiB: gib(2) });
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    // Scoped to the panel HEAD (before `</header>`) — the swap Row's own chip would still
    // show alarm even if the panel forgot to fold swap into its own head severity, so a test
    // that checked the whole document could not tell the two apart.
    expect(html.slice(0, html.indexOf('</header>'))).toContain('data-severity="alarm"');
  });

  test('exactly 1 GiB of swap is NOT an alarm — §6.3 writes "> 1 GiB"', () => {
    const snapshot = snapshotWith({ memUsedGiB: gib(10), memTotalGiB: gib(61), swapUsedGiB: gib(1) });
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).not.toContain('data-severity="alarm"');
  });

  test('⚠ invariant 1 — a missing RAM reading renders — with the no-band track, not 0.0 GiB', () => {
    // The only Meter/Row pair on this panel that could conflate the two: `used`/`total` are
    // computed once, inline, as `host?.memUsedGiB ?? null` — a panel-level typo of `?? gib(0)`
    // there would have passed every other test in this file, since every fixture above gives
    // `memUsedGiB` a real, non-null value.
    const snapshot = snapshotWith({ memUsedGiB: null, memTotalGiB: gib(61), swapUsedGiB: gib(0) });
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).toContain('— / 61.0 GiB');
    expect(html).not.toContain('0.0 GiB / 61.0 GiB');
    // ⚠ This unscoped assertion is true for the WRONG reason before 10b-S-F: the Meter's own
    // `severity={severityRam(used, total)}` is `null` regardless of the HEAD chip, so this line
    // alone would have kept passing under the finding's exact bug (RAM —/— rendering a GREEN
    // head over it) — the same document-wide `toContain` shape ANCHOR §9 has now caught three
    // times elsewhere in this project. The head-scoped assertion below is the one that matters.
    expect(html).toContain('data-severity="none"');
  });

  describe('⚠ 10b-S-F — the panel HEAD never bands normal over its own em dash', () => {
    test('⚠ the finding, reproduced and fixed: RAM —/— with a healthy (normal) swap → head shows NO BAND, never green', () => {
      const snapshot = snapshotWith({ memUsedGiB: null, memTotalGiB: gib(61), swapUsedGiB: gib(0) });
      const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
      const head = html.slice(0, html.indexOf('</header>'));
      expect(head).toContain('data-severity="none"');
      expect(head).not.toContain('data-severity="normal"');
    });

    // Not ⚠: the mirror case — every reading present and normal still bands green ordinarily.
    // Documentation that the downgrade does not over-fire, not a ledger obligation (same
    // reasoning as this file's other "Not ⚠" mirror notes).
    test('RAM readable and normal, swap readable and normal → head bands normal, ordinarily', () => {
      const snapshot = snapshotWith({ memUsedGiB: gib(10), memTotalGiB: gib(61), swapUsedGiB: gib(0) });
      const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
      const head = html.slice(0, html.indexOf('</header>'));
      expect(head).toContain('data-severity="normal"');
    });

    test('⚠ RAM unreadable + an ALARM-band swap → head STAYS ALARM — a null does not erase an alarm', () => {
      // The ruling's whole point, and the case a careless "any null anywhere ⇒ no band" fix
      // breaks: "it does not drop to no-band for warn or alarm … a red GPU stays red with an
      // unreadable SM clock." MEMORY's own version: it stays alarm with an unreadable RAM pair
      // and 2 GiB of swap in use.
      const snapshot = snapshotWith({ memUsedGiB: null, memTotalGiB: gib(61), swapUsedGiB: gib(2) });
      const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
      const head = html.slice(0, html.indexOf('</header>'));
      expect(head).toContain('data-severity="alarm"');
      expect(head).not.toContain('data-severity="none"');
    });
  });

  // Not ⚠: the mirror case — documentation, not a ledger obligation (see gpu-panel.test.tsx's
  // identical note; `severityRam`'s own zero-percent-is-normal behaviour is severity.test.ts's).
  test('a genuine 0.0 GiB RAM reading renders the numeral, banded normal — never blanked', () => {
    const snapshot = snapshotWith({ memUsedGiB: gib(0), memTotalGiB: gib(61), swapUsedGiB: gib(0) });
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).toContain('0.0 GiB / 61.0 GiB');
    expect(html).toContain('data-severity="normal"');
  });

  test('before the first poll, both the bar and the swap row render — rather than throwing', () => {
    const html = renderToStaticMarkup(<MemoryPanel state={emptyState()} nowMs={0} panelId="memory" />);
    expect(html).toContain('—');
  });
});

describe("⚠ §6.5 — proc-meminfo is this panel's only source and it must reach the screen", () => {
  test('⚠ a /proc/meminfo failure renders its message, once, under the two figures it blanks', () => {
    // The panel never called `errorsForPanel`, so `RAM — / —` was rendered with no explanation
    // anywhere on the page — §6.5's unexplained em dash, in the one panel where the source is
    // unambiguous (10b-reconcile, adversarial F5).
    const snapshot: TelemetrySnapshot = {
      ...snapshotWith({ memUsedGiB: null, memTotalGiB: null, swapUsedGiB: null }),
      errors: [{ source: 'proc-meminfo', message: '/proc/meminfo: EACCES' }],
    };
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).toContain('/proc/meminfo: EACCES');
    expect(html.split('/proc/meminfo: EACCES').length - 1).toBe(1);
  });

  test("another panel's errors[] entry never leaks in", () => {
    const snapshot: TelemetrySnapshot = {
      ...snapshotWith({ memUsedGiB: null }),
      errors: [{ source: 'statvfs', message: '/home: ENOENT' }],
    };
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(snapshot)} nowMs={0} panelId="memory" />);
    expect(html).not.toContain('/home: ENOENT');
  });
});

describe('⚠ invariant 1, across EVERY reading on this panel', () => {
  test('⚠ with every reading null, no value cell prints a numeral', () => {
    const html = renderToStaticMarkup(<MemoryPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="memory" />);
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
  });
});
