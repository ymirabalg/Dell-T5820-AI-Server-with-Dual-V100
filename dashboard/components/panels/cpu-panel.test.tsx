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
    expect(row).toContain('>95<');
    expect(row).toContain('°C');
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
    expect(row).toContain('>0<');
    expect(row).toContain('°C');
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

  // ⚠ 10e §2.3: the hero and the strip have no note slot of their own (unlike the built `Row`s
  // this panel used to carry), so EVERY CPU source's message now lands together in one
  // `PanelNotes` call under the whole card (S-H: "the panel satisfies 'beside it'") rather than
  // attributed to individual rows. This still proves the property that matters — every one of
  // the three sources reaches the screen, none silently dropped — just not per-row any more.
  test('⚠ coretemp, proc-stat and proc-loadavg all reach the screen, together, under the card', () => {
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
    expect(html).toContain('no hwmon named coretemp');
    expect(html).toContain('/proc/stat: EACCES');
    expect(html).toContain('/proc/loadavg: EACCES');
  });

  /*
   * ⚠ 10f/Q1, added by the TEST phase — the OTHER side of the `bound` boundary, which nothing
   * asserted and no mutation reached. MEMORY, STORAGE, COOLING and the two takeovers each have
   * a test proving they take `roomy`; the three call sites that must take the TIGHT default had
   * none, and CPU is the one that matters most. §6.1's rows 2 and 3 size independently, so
   * `row 2 = max(CPU, MEMORY)` and CPU governs it: CPU's notes block costs the page 1:1, where
   * MEMORY's costs it nothing (10f-build.md §1.3/§1.4). `roomy` here is +42 px straight onto a
   * page whose worst case already lands 1-8 px over budget at 1600x1024. HANDOVER §0.8: wiring
   * a prop is a property, and an optional prop makes it an untested one.
   */
  test('⚠ 10f/Q1 — CPU takes the TIGHT notes bound: it governs row 2, so its growth costs the page 1:1', () => {
    const html = renderToStaticMarkup(
      <CpuPanel
        state={stateWith(withErrors([{ source: 'coretemp', message: 'no hwmon named coretemp' }]))}
        nowMs={0}
        panelId="cpu"
      />,
    );
    const at = html.indexOf('no hwmon named coretemp');
    expect(at).toBeGreaterThan(-1);
    const well = html.slice(html.lastIndexOf('<div', at), at);
    expect(well).toContain('data-bound="tight"');
    expect(well).not.toContain('data-bound="roomy"');
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
    // 10e/OQ-7: CPU carries BOTH traces (temperature + utilisation) at BOTH sizes — 4
    // `Sparkline` mounts, not 2 — so one `view` reaching this panel flips all four.
    expect(html.split('data-role="table-view"').length - 1).toBe(4);
  });

  test('⚠ the toggle control renders ONLY when the caller supplies onToggleView', () => {
    const withoutHandler = renderToStaticMarkup(<CpuPanel state={stateWith(everythingZero)} nowMs={0} panelId="cpu" />);
    expect(withoutHandler).not.toContain('show as table');
    const withHandler = renderToStaticMarkup(
      <CpuPanel state={stateWith(everythingZero)} nowMs={0} panelId="cpu" onToggleView={() => undefined} />,
    );
    expect(withHandler).toContain('show as table');
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
    // 10e/OQ-7: 4 `Sparkline` mounts (2 traces x 2 sizes), each marking the gap once.
    expect((html.match(/data-role="gap"/g) ?? []).length).toBe(4);
  });

  test('⚠ and both list it in the table view, the accessibility floor', () => {
    const html = renderToStaticMarkup(
      <CpuPanel state={gappyState(GAP)} nowMs={0} panelId="cpu" view="table" />,
    );
    expect((html.match(/data-role="gap-row"/g) ?? []).length).toBe(4);
  });

  test('with no gap in state, neither sparkline invents one — the negative half of the fixture', () => {
    const html = renderToStaticMarkup(<CpuPanel state={gappyState([])} nowMs={0} panelId="cpu" />);
    expect(html).not.toContain('data-role="gap"');
  });
});

// ---------------------------------------------------------------------------------------
// ⚠ 10e-A5 (mutation A), added by 10e's RECONCILIATION, 2026-09-09. This is the GPU hole the
// test phase closed (`10e-GP1`..`GP5`), left open on CPU: deleting `timeLabels` from BOTH
// promoted mounts left all 2892 tests green and both harnesses green. `10c-P2`/`P3`'s anchors
// merely CONTAIN the `timeLabels` token as surrounding context, so they still match after it is
// deleted. The scoping below is by `data-role` wrapper, never document-wide — the four mounts
// are two traces x two sizes and only the ≥1600 pair carries the axis.
// ---------------------------------------------------------------------------------------
describe('⚠ 10e §3.2 — the ≥1600px CPU promotion carries the time axis; the 1280 pair does not', () => {
  const SMALL = 'data-role="cpu-sparkline-wrap"';
  const PROMOTED = 'data-role="cpu-full-chart-wrap"';

  const html = (): string =>
    renderToStaticMarkup(
      <CpuPanel
        state={stateOf(
          ringOfSeries(
            [
              snapshotWith({ cpuTempC: celsius(60), cpuPct: percent(20) }),
              snapshotWith({ cpuTempC: celsius(70), cpuPct: percent(40) }),
            ],
            1_500_000,
          ),
        )}
        nowMs={0}
        panelId="cpu"
      />,
    );

  test('⚠ exactly TWO time axes are drawn — one per promoted trace, none on the 1280 pair', () => {
    const markup = html();
    expect((markup.match(/data-role="sparkline-time-labels"/g) ?? []).length).toBe(2);
    const small = markup.slice(markup.indexOf(SMALL), markup.indexOf(PROMOTED));
    expect(small).not.toContain('data-role="sparkline-time-labels"');
    expect(small).toContain('<svg'); // not vacuous: the 1280 pair really is in this slice
  });

  test('⚠ both time axes sit inside the promoted wrapper', () => {
    const markup = html();
    const promotedAt = markup.indexOf(PROMOTED);
    for (const m of markup.matchAll(/data-role="sparkline-time-labels"/g)) {
      expect(m.index).toBeGreaterThan(promotedAt);
    }
  });
});

// ⚠ 10e-A8, added by 10e's RECONCILIATION — the CPU twin of the GPU note in
// `gpu-panel.test.tsx`. The hero is a point reading and must not be named with the chart's
// window sentence, which already names both `<svg role="img">` temperature mounts.
describe('⚠ 10e-A8 — the CPU hero is named as a point reading, with a role that permits naming', () => {
  test('⚠ role="group" and the package-temperature name, on the hero’s own element', () => {
    const html = renderToStaticMarkup(
      <CpuPanel state={stateWith(snapshotWith({ cpuTempC: celsius(55), cpuPct: percent(20) }))} nowMs={0} panelId="cpu" />,
    );
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="CPU package temperature"[^>]*>/);
    expect(html).not.toContain('aria-label="CPU temperature over the selected window"><span');
    // The chart keeps the window sentence — this is not a rename of that one.
    expect(html).toContain('CPU temperature over the selected window');
  });
});
