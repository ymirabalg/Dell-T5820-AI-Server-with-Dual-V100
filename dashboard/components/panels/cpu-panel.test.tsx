import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero } from '@/lib/fixtures';
import { celsius, percent } from '@/lib/types';
import type { TelemetrySnapshot } from '@/lib/types';

import { CpuPanel } from './cpu-panel';
import { BASE_MS, allReadingsNull, emptyState, ringOfSeries, stateOf, stateWith, valueCells } from './test-support';
import type { Gap } from '@/lib/client/gaps';

const snapshotWith = (overrides: Partial<TelemetrySnapshot['host']>): TelemetrySnapshot => ({
  ...everythingZero,
  host: { ...everythingZero.host, ...overrides },
});

/** The full markup of the row/div containing `needle`, chip included. Same helper as
 *  `cooling-panel.test.tsx`/`safety-panel.test.tsx` — scoping to the row matters here because
 *  this panel's head chip and the temperature row's own chip are the SAME `chip` variable, so
 *  a whole-document check would still pass even if only one of the two call sites regressed. */
const rowContaining = (html: string, needle: string): string => {
  const at = html.indexOf(needle);
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end);
};

describe('§6.2 — the CPU card', () => {
  test('⚠ the subtitle carries model and core/thread count, trimmed per §3.2 — not a body row', () => {
    const snapshot = snapshotWith({
      cpuModel: 'Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz',
      cores: 6,
      threads: 12,
    });
    const html = renderToStaticMarkup(<CpuPanel state={stateWith(snapshot)} nowMs={0} panelId="cpu" />);
    expect(html).toContain('Xeon W-2135');
    expect(html).toContain('6C / 12T');
    // The untrimmed marketing string must not leak through unmodified.
    expect(html).not.toContain('Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz');
  });

  test('title is lower case', () => {
    const html = renderToStaticMarkup(<CpuPanel state={emptyState()} nowMs={0} panelId="cpu" />);
    expect(html).toContain('>cpu<');
  });

  test('⚠ null cores/threads render — , not "undefinedC / undefinedT"', () => {
    const snapshot = snapshotWith({ cores: null, threads: null });
    const html = renderToStaticMarkup(<CpuPanel state={stateWith(snapshot)} nowMs={0} panelId="cpu" />);
    expect(html).toContain('—C / —T');
    expect(html).not.toContain('undefined');
  });

  test('temperature is banded by §6.3, and the chip matches the row', () => {
    const hot = stateWith(snapshotWith({ cpuTempC: celsius(95) }));
    const html = renderToStaticMarkup(<CpuPanel state={hot} nowMs={0} panelId="cpu" />);
    // Scoped to the row — the PanelShell HEAD renders the identical `data-severity="alarm"`
    // from the same `chip` value, so a whole-document check cannot tell "the row shows it"
    // from "only the head does" (10c2's toContain-scope guard; proven live by mutation —
    // `10c2-build.md` §1 — that a Row wired to `severity={null}` while `chip` stays alarm
    // still satisfies a document-wide `toContain('data-severity="alarm"')`).
    const row = rowContaining(html, 'temperature');
    expect(row).toContain('data-severity="alarm"');
    expect(row).toContain('95 °C');
  });

  test('load average renders §6.6’s 2dp / -separated form', () => {
    const snapshot = snapshotWith({ loadAvg: [1.24, 1.08, 0.91] });
    const html = renderToStaticMarkup(<CpuPanel state={stateWith(snapshot)} nowMs={0} panelId="cpu" />);
    expect(html).toContain('1.24 / 1.08 / 0.91');
  });

  test('utilisation renders as a percentage, unbanded (no §6.3 row for it)', () => {
    const snapshot = snapshotWith({ cpuPct: percent(42.3) });
    const html = renderToStaticMarkup(<CpuPanel state={stateWith(snapshot)} nowMs={0} panelId="cpu" />);
    expect(html).toContain('42.3 %');
  });

  test('⚠ invariant 1 — a missing CPU temperature renders — with the no-band chip, not 0 °C', () => {
    const html = renderToStaticMarkup(
      <CpuPanel state={stateWith(snapshotWith({ cpuTempC: null }))} nowMs={0} panelId="cpu" />,
    );
    const row = rowContaining(html, 'temperature');
    expect(row).toContain('—');
    expect(row).not.toContain('0 °C');
    expect(row).toContain('data-severity="none"');
  });

  // Not ⚠: the mirror case, kept as documentation rather than a ledger obligation — see
  // gpu-panel.test.tsx's identical note.
  test('a genuine 0 °C CPU reading renders the numeral, banded normal', () => {
    const html = renderToStaticMarkup(
      <CpuPanel state={stateWith(snapshotWith({ cpuTempC: celsius(0) }))} nowMs={0} panelId="cpu" />,
    );
    const row = rowContaining(html, 'temperature');
    expect(row).toContain('0 °C');
    expect(row).toContain('data-severity="normal"');
  });

  test('before the first poll, every field renders — rather than throwing', () => {
    const html = renderToStaticMarkup(<CpuPanel state={emptyState()} nowMs={0} panelId="cpu" />);
    expect(html).toContain('—');
  });
});

describe('⚠ §6.5 — every source routed to this panel reaches the screen', () => {
  // `lib/client/observations.ts` routes four sources here BY THE FIGURE EACH BLANKS, and its
  // own doc says `collectHost` files nine sources for one crash *"precisely so this split is
  // possible"*. This panel then never called `errorsForPanel` at all: `coretemp` failing gave
  // a `—` temperature with no message anywhere on the page (10b-reconcile, adversarial F5).
  const withErrors = (errors: TelemetrySnapshot['errors']): TelemetrySnapshot => ({
    ...snapshotWith({ cpuTempC: null, cpuPct: null, loadAvg: null, cpuModel: null }),
    errors,
  });

  test('⚠ coretemp lands on the temperature row, proc-stat on utilisation, proc-loadavg on load average', () => {
    const html = renderToStaticMarkup(
      <CpuPanel
        state={stateWith(
          withErrors([
            { source: 'coretemp', message: 'no hwmon named coretemp' },
            { source: 'proc-stat', message: '/proc/stat: EACCES' },
            { source: 'proc-loadavg', message: '/proc/loadavg: EACCES' },
          ]),
        )}
        nowMs={0}
        panelId="cpu"
      />,
    );
    expect(rowContaining(html, 'temperature')).toContain('no hwmon named coretemp');
    expect(rowContaining(html, 'utilisation')).toContain('/proc/stat: EACCES');
    expect(rowContaining(html, 'load average')).toContain('/proc/loadavg: EACCES');
  });

  test('⚠ proc-cpuinfo blanks the SUBTITLE, which has no note slot, so it renders under the rows', () => {
    const html = renderToStaticMarkup(
      <CpuPanel
        state={stateWith(withErrors([{ source: 'proc-cpuinfo', message: '/proc/cpuinfo: EACCES' }]))}
        nowMs={0}
        panelId="cpu"
      />,
    );
    expect(html).toContain('/proc/cpuinfo: EACCES');
  });

  test('an errors[] entry for another panel never leaks in', () => {
    const html = renderToStaticMarkup(
      <CpuPanel
        state={stateWith(withErrors([{ source: 'dell-smm', message: 'no hwmon named dell_smm' }]))}
        nowMs={0}
        panelId="cpu"
      />,
    );
    expect(html).not.toContain('no hwmon named dell_smm');
  });
});

describe('⚠ invariant 1, across EVERY reading on this panel', () => {
  test('⚠ with every reading null, no value cell prints a numeral', () => {
    const html = renderToStaticMarkup(<CpuPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="cpu" />);
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(3);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
  });
});

describe('⚠ 10c1 — the chart/table toggle (Q2-S2), now shell-owned', () => {
  test('⚠ with no `view` given, both sparklines render as CHARTS, not tables', () => {
    const html = renderToStaticMarkup(<CpuPanel state={stateWith(everythingZero)} nowMs={0} panelId="cpu" />);
    expect(html).not.toContain('data-role="table-view"');
  });

  test('⚠ `view="table"` switches BOTH the temperature and utilisation sparklines to tables', () => {
    // One toggle governs the whole panel (`chart-view-toggle.tsx`'s recorded granularity
    // decision) — this is the test that would catch only ONE of the two sparklines being wired.
    const html = renderToStaticMarkup(
      <CpuPanel state={stateWith(everythingZero)} nowMs={0} panelId="cpu" view="table" />,
    );
    expect(html.split('data-role="table-view"').length - 1).toBe(2);
  });

  test('⚠ the toggle control renders ONLY when the caller supplies onToggleView', () => {
    const withoutHandler = renderToStaticMarkup(<CpuPanel state={stateWith(everythingZero)} nowMs={0} panelId="cpu" />);
    expect(withoutHandler).not.toContain('table view');
    const withHandler = renderToStaticMarkup(
      <CpuPanel state={stateWith(everythingZero)} nowMs={0} panelId="cpu" onToggleView={() => undefined} />,
    );
    expect(withHandler).toContain('table view');
  });
});

// ---------------------------------------------------------------------------------------
// ⚠ 10c-3 reconciliation / A6 — THE WIRING, not the primitive.
//
// `Sparkline` learned to hatch `state.gaps` this loop and `sparkline.test.tsx` proves the
// primitive does it. Nothing proved the PANEL hands it down: deleting `gaps={state.gaps}` from
// both of this file's call sites left `pnpm verify` fully green (2801/2801, measured) and both
// harnesses silent, restoring the exact F14b defect — a smooth line drawn across ground nobody
// sampled — on CPU temperature and CPU utilisation, at the 1280-1599px band §6.1 calls the
// design target.
//
// The build's answer was "worth a code-review habit, not a guard". This project's own precedent
// says otherwise twice: L11 was the same shape ("nothing stops a component hard-coding ' RPM'")
// and got a guard in 10c-2, and `StackedTimeSeriesChart.gaps` is a REQUIRED prop for the
// identical fact. A behavioural fixture is the cheapest of the three options and the only one
// that also proves the value arrives intact rather than merely being mentioned.
// ---------------------------------------------------------------------------------------

describe('⚠ 10c-3/A6 — state.gaps reaches BOTH sparklines, or the design-target band lies about unsampled ground', () => {
  /** Two readable samples 30 minutes apart with a gap between them: the F14b fixture, at the
   *  panel level. Both traces (temperature and utilisation) are readable at both instants, so
   *  each sparkline has exactly one adjacent pair for the gap to fall between. */
  const gappyState = (gaps: readonly Gap[]) =>
    stateOf(
      ringOfSeries(
        [
          snapshotWith({ cpuTempC: celsius(60), cpuPct: percent(20) }),
          snapshotWith({ cpuTempC: celsius(70), cpuPct: percent(40) }),
        ],
        1_500_000,
      ),
      { gaps },
    );

  const GAP: readonly Gap[] = [
    { fromMs: BASE_MS + 10_000, toMs: BASE_MS + 1_490_000, reason: 'hidden' },
  ];

  test('⚠ both sparklines mark the gap — one `data-role="gap"` each', () => {
    const html = renderToStaticMarkup(<CpuPanel state={gappyState(GAP)} nowMs={0} panelId="cpu" />);
    expect((html.match(/data-role="gap"/g) ?? []).length).toBe(2);
  });

  test('⚠ and both list it in the table view, the accessibility floor', () => {
    const html = renderToStaticMarkup(
      <CpuPanel state={gappyState(GAP)} nowMs={0} panelId="cpu" view="table" />,
    );
    expect((html.match(/data-role="gap-row"/g) ?? []).length).toBe(2);
  });

  test('with no gap in state, neither sparkline invents one — the negative half of the fixture', () => {
    const html = renderToStaticMarkup(<CpuPanel state={gappyState([])} nowMs={0} panelId="cpu" />);
    expect(html).not.toContain('data-role="gap"');
  });
});
