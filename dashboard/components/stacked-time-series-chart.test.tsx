import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { Gap } from '@/lib/client/gaps';
import type { SeriesPoint } from '@/lib/client/series';

import type { ChartPlot } from './stacked-time-series-chart';
import { StackedTimeSeriesChart } from './stacked-time-series-chart';

const DOMAIN_START = 0;
const DOMAIN_END = 60_000;

const tempSeries = (n: number, from: number): SeriesPoint[] =>
  Array.from({ length: n }, (_, i) => ({ tMs: from + i * 1000, v: 60 + i }));

const formatTick = (v: number): string => `TICK(${Math.round(v)})`;
const formatTime = (ms: number): string => `TIME(${Math.round(ms)})`;

const gpuPlot = (): ChartPlot => ({
  id: 'temp',
  formatTick,
  series: [
    { id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: tempSeries(10, 0), endLabel: '69 °C' },
    {
      id: 'gpu1',
      label: 'GPU 1',
      color: '#199e70',
      dashed: true,
      points: tempSeries(10, 0),
      endLabel: '65 °C',
    },
  ],
});

const fanPlot = (): ChartPlot => ({
  id: 'fan',
  formatTick,
  series: [
    { id: 'fan5', label: 'fan 5', color: '#d95926', points: tempSeries(10, 0), endLabel: '4,308 RPM' },
  ],
});

const render = (props: Partial<Parameters<typeof StackedTimeSeriesChart>[0]> = {}) =>
  renderToStaticMarkup(
    <StackedTimeSeriesChart
      id="cooling"
      plots={[gpuPlot(), fanPlot()]}
      gaps={[]}
      domainStartMs={DOMAIN_START}
      domainEndMs={DOMAIN_END}
      formatTime={formatTime}
      {...props}
    />,
  );

describe('⚠ one shared x-axis, however many plots', () => {
  test('⚠ exactly one x-axis group with two plots', () => {
    const html = render();
    expect((html.match(/data-role="x-axis"/g) ?? []).length).toBe(1);
    expect((html.match(/data-role="plot"/g) ?? []).length).toBe(2);
  });

  test('a single plot still gets exactly one x-axis, and time ticks appear', () => {
    const html = render({ plots: [gpuPlot()] });
    expect((html.match(/data-role="x-axis"/g) ?? []).length).toBe(1);
    expect(html).toContain('TIME(');
  });
});

describe('⚠ identity: colour + dash pattern + a direct end-label', () => {
  test('⚠ GPU 1 is drawn dashed, GPU 0 is not', () => {
    const html = render();
    const gpu0 = /<g data-series="gpu0">.*?<\/g>/s.exec(html)?.[0] ?? '';
    const gpu1 = /<g data-series="gpu1">.*?<\/g>/s.exec(html)?.[0] ?? '';
    expect(gpu0).not.toContain('stroke-dasharray');
    expect(gpu1).toContain('stroke-dasharray');
  });

  test('every series with an endLabel carries it in the markup', () => {
    const html = render();
    expect(html).toContain('69 °C');
    expect(html).toContain('65 °C');
    expect(html).toContain('4,308 RPM');
  });

  test('a series with no endLabel draws no end-label text for it', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: tempSeries(3, 0) }],
    };
    const html = render({ plots: [plot] });
    const endLabelsGroup = /<g data-role="end-labels">(.*?)<\/g>/s.exec(html)?.[1] ?? '<not found>';
    expect(endLabelsGroup).toBe('');
  });
});

describe('⚠ a legend for two or more series, none for exactly one', () => {
  test('⚠ the temperature plot (2 series) has a legend', () => {
    const html = render();
    const [tempPlotHtml] = html.split('data-role="plot"').slice(1);
    expect(tempPlotHtml).toContain('data-role="legend"');
  });

  test('⚠ the fan plot (1 series) has none', () => {
    const html = render();
    const fanPlotHtml = html.split('data-role="plot"')[2] ?? '';
    expect(fanPlotHtml).not.toContain('data-role="legend"');
  });
});

describe('⚠ gaps are hatched from the `gaps` prop, never inferred from a series’ own nulls', () => {
  test('⚠ a gap with no corresponding null in any series is still hatched', () => {
    const gaps: Gap[] = [{ fromMs: 20_000, toMs: 30_000, reason: 'hidden' }];
    const html = render({ gaps });
    expect(html).toContain('data-gap-reason="hidden"');
  });

  test('⚠ an OPEN gap (toMs: null) is drawn out to the domain end, not zero-width', () => {
    const gaps: Gap[] = [{ fromMs: 50_000, toMs: null, reason: 'failed' }];
    const html = render({ gaps });
    const rect = /<rect[^>]*data-gap-reason="failed"[^>]*>/.exec(html)?.[0] ?? '';
    const width = Number(/width="([\d.]+)"/.exec(rect)?.[1] ?? '0');
    expect(width).toBeGreaterThan(0);
  });

  test('no gaps at all renders no gap rects', () => {
    const html = render({ gaps: [] });
    expect(html).not.toContain('data-gap-reason');
  });
});

describe('boundary: an empty or inverted domain renders safely (HANDOVER §5.1)', () => {
  test('⚠ domainEndMs === domainStartMs renders a placeholder, not NaN geometry', () => {
    const html = render({ domainStartMs: 1000, domainEndMs: 1000 });
    expect(html).toContain('data-empty="true"');
    expect(html).not.toContain('NaN');
  });

  test('domainEndMs > domainStartMs (the normal case) renders the real chart', () => {
    const html = render({ domainStartMs: 0, domainEndMs: 1000 });
    expect(html).not.toContain('data-empty="true"');
  });

  test('no plots at all renders a placeholder rather than a zero-height svg', () => {
    const html = render({ plots: [] });
    expect(html).toContain('data-empty="true"');
  });
});

describe('a flat y-domain (every value equal) does not divide by zero', () => {
  test('no NaN in the markup', () => {
    const plot: ChartPlot = {
      id: 'flat',
      formatTick,
      series: [{ id: 'a', label: 'a', color: '#3987e5', points: [{ tMs: 0, v: 60 }, { tMs: 1000, v: 60 }] }],
    };
    const html = render({ plots: [plot] });
    expect(html).not.toContain('NaN');
  });
});

describe('⚠ a null value inside a series behaves exactly like it does in a sparkline (invariant 1, and rule 3’s reverse direction)', () => {
  const seriesWithGap = (): SeriesPoint[] => [
    { tMs: 0, v: 60 },
    { tMs: 1000, v: 61 },
    { tMs: 2000, v: null },
    { tMs: 3000, v: null },
    { tMs: 4000, v: 65 },
  ];

  test('⚠ the null run splits the series into two polylines, not one bridged line', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: seriesWithGap() }],
    };
    const html = render({ plots: [plot] });
    const seriesGroup = /<g data-series="gpu0">.*?<\/g>/s.exec(html)?.[0] ?? '';
    expect((seriesGroup.match(/<polyline/g) ?? []).length).toBe(2);
  });

  test('⚠ that null run draws NO gap rectangle when `gaps` is empty — nothing is inferred from the hole', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: seriesWithGap() }],
    };
    const html = render({ plots: [plot], gaps: [] });
    expect(html).not.toContain('data-gap-reason');
  });

  test('⚠ a v=0 point is a real reading and does not break the run — it is not treated as a gap', () => {
    const points: SeriesPoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 0 },
      { tMs: 2000, v: 65 },
    ];
    const plot: ChartPlot = {
      id: 'fan',
      formatTick,
      series: [{ id: 'fan5', label: 'fan 5', color: '#d95926', points }],
    };
    const html = render({ plots: [plot] });
    const seriesGroup = /<g data-series="fan5">.*?<\/g>/s.exec(html)?.[0] ?? '';
    expect((seriesGroup.match(/<polyline/g) ?? []).length).toBe(1);
  });

  test('⚠ the end-label marks the last READABLE point, not the literal last point, when a series ends in null', () => {
    const points: SeriesPoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 70 }, // the true last reading
      { tMs: 2000, v: null }, // trailing gap
    ];
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points, endLabel: '70 °C' }],
    };
    const html = render({ plots: [plot] });
    // v=70 is the series maximum under the auto y-domain [60,70], so its y is exactly 0 (the
    // top) under this scale — reading the literal last point (v=null) computes a different y.
    const circle = /<circle[^>]*>/.exec(html)?.[0] ?? '';
    expect(circle).toContain('cy="0"');
  });
});

describe('⚠ 600 points per series, not per chart (HANDOVER rule 10, the multi-series half)', () => {
  test('⚠ two 600-point series in the same plot each keep their own full 600 points, not a budget shared across the chart', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [
        { id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: tempSeries(600, 0) },
        { id: 'gpu1', label: 'GPU 1', color: '#199e70', points: tempSeries(600, 0) },
      ],
    };
    const html = render({ plots: [plot], domainStartMs: 0, domainEndMs: 600_000 });
    const counts = [...html.matchAll(/<polyline[^>]*points="([^"]*)"/g)].map(
      (m) => (m[1] ?? '').trim().split(' ').length,
    );
    expect(counts).toEqual([600, 600]);
  });
});

describe('never formats a number itself', () => {
  test('y-tick and time-tick text come from the caller’s formatters, verbatim', () => {
    const html = render();
    expect(html).toContain('TICK(');
    expect(html).toContain('TIME(');
  });
});

describe('⚠ draws whatever it is given — no internal re-decimation (HANDOVER rule 10)', () => {
  test('⚠ a 600-point series produces a polyline with 600 coordinate pairs', () => {
    const points = tempSeries(600, 0);
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points }],
    };
    const html = render({ plots: [plot], domainStartMs: 0, domainEndMs: 600_000 });
    const line = /<polyline[^>]*points="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(line.trim().split(' ')).toHaveLength(600);
  });
});
