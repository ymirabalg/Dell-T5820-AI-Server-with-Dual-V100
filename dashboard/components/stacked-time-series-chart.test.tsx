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
      ariaLabel="cooling: temperature and fan speed over the selected window"
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

  /*
   * ⚠ The name is the assertion. `toBeGreaterThan(0)` was satisfied by `toX = fromX + 1`,
   * which contradicts "out to the domain end" — do-not-copy #3, a test naming a property it
   * does not check. The property is that the rect REACHES the right-hand edge of the plot.
   */
  test('⚠ an OPEN gap (toMs: null) is drawn out to the domain end, not zero-width', () => {
    const gaps: Gap[] = [{ fromMs: 50_000, toMs: null, reason: 'failed' }];
    const html = render({ gaps });
    const rect = /<rect[^>]*data-gap-reason="failed"[^>]*>/.exec(html)?.[0] ?? '';
    const x = Number(/x="([\d.]+)"/.exec(rect)?.[1] ?? '-1');
    const width = Number(/width="([\d.]+)"/.exec(rect)?.[1] ?? '0');
    expect(width).toBeGreaterThan(0);
    // 600 − END_LABEL_MARGIN(46): the last drawable x. The gap ends at "now", nowhere short.
    expect(x + width).toBeCloseTo(554, 5);
  });

  test('a CLOSED gap stops where it says it does, well short of the domain end', () => {
    const gaps: Gap[] = [{ fromMs: 10_000, toMs: 20_000, reason: 'failed' }];
    const html = render({ gaps });
    const rect = /<rect[^>]*data-gap-reason="failed"[^>]*>/.exec(html)?.[0] ?? '';
    const x = Number(/x="([\d.]+)"/.exec(rect)?.[1] ?? '-1');
    const width = Number(/width="([\d.]+)"/.exec(rect)?.[1] ?? '0');
    expect(x + width).toBeCloseTo(554 / 3, 5);
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

// ---------------------------------------------------------------------------------------
// Step 9 RECONCILIATION — the adversarial findings, each with a fixture on both sides.
// ---------------------------------------------------------------------------------------

/** Every `x,y` pair of the first polyline, as numbers. */
const coordsOf = (html: string, index = 0): [number, number][] => {
  const all = [...html.matchAll(/<polyline[^>]*points="([^"]*)"/g)];
  return (all[index]?.[1] ?? '')
    .trim()
    .split(' ')
    .filter((s) => s.length > 0)
    .map((pair) => pair.split(',').map(Number) as [number, number]);
};

/** Every y-axis tick as `[baselineY, label]` — they are the only `<text x="2">` nodes. */
const yTicksOf = (html: string): [number, string][] =>
  [...html.matchAll(/<text x="2" y="([-\d.]+)"[^>]*>([^<]*)</g)].map((m) => [
    Number(m[1]),
    m[2] as string,
  ]);

const rpm = (v: number): string => `${Math.round(v)} RPM`;
const celsius = (v: number): string => `${Math.round(v)} C`;

describe('⚠ H1 — the chart announces itself as whatever the CALLER says it is', () => {
  test('⚠ the aria-label is the caller’s, with no built-in “cooling” sentence anywhere', () => {
    const html = render({
      id: 'gpu0-temp',
      plots: [gpuPlot()],
      ariaLabel: 'GPU 0: temperature over the selected window',
    });
    expect(html).toContain('aria-label="GPU 0: temperature over the selected window"');
    // §6.1 promotes this same component to a per-GPU-card line chart at ≥1600px; a hard-coded
    // sentence would announce all three charts on screen as the cooling one.
    expect(html).not.toContain('cooling');
  });

  test('⚠ the empty state names the same chart, rather than an anonymous placeholder', () => {
    const html = render({ plots: [], ariaLabel: 'GPU 1: temperature over the selected window' });
    expect(html).toContain('data-empty="true"');
    expect(html).toContain('GPU 1: temperature over the selected window');
  });
});

describe('⚠ H3 — the end dot marks WHEN the last reading was, not "now"', () => {
  test('⚠ a trace that stopped early puts its dot at that point’s x, not at the right edge', () => {
    // §9: "A channel lost mid-session — the trace stops, the gap is hatched." Ten samples
    // over 9 s inside a 30-minute window: the dot belongs at ~2.8px, not on the "now" tick.
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [
        { id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: tempSeries(10, 0), endLabel: '69 °C' },
      ],
    };
    const html = render({ plots: [plot], domainStartMs: 0, domainEndMs: 1_800_000 });
    const circle = /<circle[^>]*>/.exec(html)?.[0] ?? '';
    const cx = Number(/cx="([\d.]+)"/.exec(circle)?.[1] ?? '-1');
    const lastCoord = coordsOf(html).at(-1) as [number, number];
    expect(cx).toBeCloseTo(lastCoord[0], 5);
    expect(cx).toBeLessThan(10);
    // …and the value label travels with its dot rather than staying at the edge.
    expect(html).toContain(`<text x="${cx + 6}"`);
  });

  test('⚠ a trace that runs to the window’s end still ends at the right edge', () => {
    const points: SeriesPoint[] = [
      { tMs: 0, v: 60 },
      { tMs: DOMAIN_END, v: 69 },
    ];
    const plot: ChartPlot = {
      id: 'temp',
      formatTick,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points, endLabel: '69 °C' }],
    };
    const html = render({ plots: [plot] });
    const circle = /<circle[^>]*>/.exec(html)?.[0] ?? '';
    expect(circle).toContain('cx="554"');
  });
});

describe('⚠ M1 — a reading outside the caller’s scale pegs at the rail, it is never clipped away', () => {
  /*
   * §6.3: `> 5100 RPM` is "the early warning for the condition that once hung POST" (14,451
   * RPM). Unclamped, that point was drawn at y = −201 in a 110px plot and the UA's default
   * `svg:not(:root) { overflow: hidden }` cropped the whole apex: the alarm cell went red and
   * the chart showed two diagonals leaving the frame.
   */
  test('⚠ a 14,451 RPM spike above yMax is drawn at the top of the plot, not off-canvas', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 0,
      yMax: 5100,
      series: [
        {
          id: 'fan5',
          label: 'fan 5',
          color: '#d95926',
          points: [
            { tMs: 0, v: 4300 },
            { tMs: 30_000, v: 14451 },
            { tMs: 60_000, v: 4300 },
          ],
          endLabel: '14,451 RPM',
        },
      ],
    };
    const html = render({ plots: [plot] });
    const ys = coordsOf(html).map(([, y]) => y);
    expect(Math.min(...ys)).toBe(0);
    expect(ys.every((y) => y >= 0 && y <= 110)).toBe(true);
  });

  test('⚠ a reading BELOW yMin pegs at the floor, the other side of the same clamp', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 3000,
      yMax: 5100,
      series: [
        {
          id: 'fan5',
          label: 'fan 5',
          color: '#d95926',
          points: [
            { tMs: 0, v: 4300 },
            { tMs: 30_000, v: 0 },
          ],
          endLabel: '0 RPM',
        },
      ],
    };
    const html = render({ plots: [plot] });
    const ys = coordsOf(html).map(([, y]) => y);
    expect(Math.max(...ys)).toBe(110);
    expect(ys.every((y) => y >= 0 && y <= 110)).toBe(true);
  });

  test('a reading inside the scale is untouched by the clamp', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 0,
      yMax: 5100,
      series: [
        {
          id: 'fan5',
          label: 'fan 5',
          color: '#d95926',
          points: [
            { tMs: 0, v: 4300 },
            { tMs: 60_000, v: 4300 },
          ],
          endLabel: '4,300 RPM',
        },
      ],
    };
    const ys = coordsOf(render({ plots: [plot] })).map(([, y]) => y);
    expect(ys[0]).toBeCloseTo(110 - (4300 / 5100) * 110, 5);
  });
});

describe('⚠ M2 — a flat series never fabricates a negative axis, and 0 does not draw like 4,300', () => {
  const flatPlot = (v: number, formatter: (n: number) => string): ChartPlot => ({
    id: 'fan',
    formatTick: formatter,
    series: [
      {
        id: 'fan5',
        label: 'fan 5',
        color: '#d95926',
        points: Array.from({ length: 6 }, (_, i) => ({ tMs: i * 1000, v })),
        endLabel: formatter(v),
      },
    ],
  });

  /*
   * §6.3: `0` RPM is an alarm — "no state this channel can be commanded into produces it".
   * `[min − 1, max + 1]` labelled the axis `-1 RPM`, a reading a tach cannot produce, and put
   * the dead fan at the exact vertical centre, where a healthy flat 4,300 also lands.
   */
  test('⚠ an all-zero fan series draws no negative tick label', () => {
    const html = render({ plots: [flatPlot(0, rpm)] });
    expect(yTicksOf(html).every(([, label]) => !label.startsWith('-'))).toBe(true);
  });

  test('⚠ a stopped fan does not draw where a healthy one draws', () => {
    const stopped = coordsOf(render({ plots: [flatPlot(0, rpm)] })).map(([, y]) => y);
    const healthy = coordsOf(render({ plots: [flatPlot(4300, rpm)] })).map(([, y]) => y);
    expect(stopped[0]).not.toBeCloseTo(healthy[0] as number, 1);
    expect(stopped[0]).toBe(110); // the floor: the lowest reading a tach can report
  });

  test('a flat NEGATIVE value keeps its real domain — the floor is 0 only when 0 is real', () => {
    const html = render({ plots: [flatPlot(-5, celsius)] });
    expect(yTicksOf(html).some(([, label]) => label.startsWith('-'))).toBe(true);
  });

  test('a flat ordinary reading is still centred, so nothing else moved', () => {
    const ys = coordsOf(render({ plots: [flatPlot(66, celsius)] })).map(([, y]) => y);
    expect(ys[0]).toBe(55);
  });
});

describe('⚠ M3 — y-axis ticks are round numbers, and no two gridlines carry the same label', () => {
  /*
   * An idle box holds 66 °C (§6.3 records a production mean of 66.2). Evenly-divided raw
   * ticks gave 65 / 65.667 / 66.333 / 67, integer-formatted — two gridlines 36.7px apart
   * both reading `66 C`, neither of them at 66.
   */
  test('⚠ a flat 66 °C series produces distinct labels, each on its own round value', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick: celsius,
      series: [
        {
          id: 'gpu0',
          label: 'GPU 0',
          color: '#3987e5',
          points: Array.from({ length: 4 }, (_, i) => ({ tMs: i * 1000, v: 66 })),
        },
      ],
    };
    const labels = yTicksOf(render({ plots: [plot] })).map(([, l]) => l);
    expect(labels).toEqual(['65 C', '66 C', '67 C']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('⚠ a wide fan domain also gets round, distinct ticks', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 0,
      yMax: 5100,
      series: [{ id: 'fan5', label: 'fan 5', color: '#d95926', points: [{ tMs: 0, v: 4300 }] }],
    };
    const labels = yTicksOf(render({ plots: [plot] })).map(([, l]) => l);
    expect(labels).toEqual(['0 RPM', '2000 RPM', '4000 RPM']);
  });
});

describe('⚠ M4/M5 — labels stay inside the box they belong to', () => {
  const flatThree = (): ChartPlot => ({
    id: 'p',
    formatTick: rpm,
    yMin: 0,
    yMax: 100,
    series: ['A', 'B', 'C'].map((id, i) => ({
      id,
      label: id,
      color: ['#3987e5', '#199e70', '#d95926'][i] as string,
      points: [
        { tMs: 0, v: 1 },
        { tMs: 60_000, v: 1 },
      ],
      endLabel: `${id} 1`,
    })),
  });

  /*
   * Three coincident end-labels were pushed 12px apart with no bound: the third landed 23px
   * below its own plot's floor, on top of the NEXT plot's legend band.
   */
  test('⚠ three coincident end-labels stay within their own plot, never over the next one', () => {
    const html = render({ plots: [flatThree(), flatThree()] });
    const plotHtml = html.split('data-role="plot"')[1] ?? '';
    const labelYs = [...plotHtml.matchAll(/<text x="[\d.]+" y="([-\d.]+)" class="_endLabel[^"]*"/g)].map(
      (m) => Number(m[1]),
    );
    expect(labelYs).toHaveLength(3);
    // chartHeight = plotHeight(110) − LEGEND_HEIGHT(16), since three series carry a legend.
    expect(labelYs.every((y) => y >= 0 && y <= 94)).toBe(true);
  });

  test('⚠ a label that had to move carries a leader line back to its own dot', () => {
    const html = render({ plots: [flatThree()] });
    expect((html.match(/class="_leader[^"]*"/g) ?? []).length).toBe(3);
  });

  test('a single end-label sits on its own dot and needs no leader line', () => {
    const html = render({ plots: [fanPlot()] });
    expect(html).not.toContain('_leader');
    const circle = /<circle[^>]*>/.exec(html)?.[0] ?? '';
    const cy = Number(/cy="([-\d.]+)"/.exec(circle)?.[1] ?? '-1');
    const labelY = Number(/<text x="[\d.]+" y="([-\d.]+)" class="_endLabel[^"]*"/.exec(html)?.[1] ?? '-1');
    expect(labelY).toBeCloseTo(cy, 5);
  });

  /*
   * The top y-tick's baseline was `0 − 2 = −2`: the whole 9px glyph sat above the viewBox,
   * so the MAXIMUM of the scale — the number a temperature chart is read for — was invisible.
   */
  test('⚠ the top y-tick label is inside the canvas, not two pixels above it', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 0,
      yMax: 100,
      series: [{ id: 'fan5', label: 'fan 5', color: '#d95926', points: [{ tMs: 0, v: 50 }], endLabel: '50 RPM' }],
    };
    const ticks = yTicksOf(render({ plots: [plot] }));
    expect(ticks.every(([y]) => y >= 0)).toBe(true);
    // The top gridline is at y = 0, so its label drops BELOW its own line rather than off.
    expect(ticks.some(([y, label]) => label === '100 RPM' && y > 0)).toBe(true);
  });

  test('a tick that is not at the top still labels ABOVE its own gridline', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 0,
      yMax: 100,
      series: [{ id: 'fan5', label: 'fan 5', color: '#d95926', points: [{ tMs: 0, v: 50 }], endLabel: '50 RPM' }],
    };
    const ticks = yTicksOf(render({ plots: [plot] }));
    const mid = ticks.find(([, label]) => label === '50 RPM') as [number, string];
    expect(mid[0]).toBeCloseTo(55 - 2, 5);
  });

  /*
   * `text-anchor="middle"` at x = 0 hung ~21px of an 8-character timestamp left of the
   * viewBox, where the UA's default overflow cropped it: the window's start time rendered
   * as `7:31`.
   */
  test('⚠ the first and last time ticks anchor inward so neither is cropped', () => {
    const axis = render().split('data-role="x-axis"')[1] ?? '';
    const anchors = [...axis.matchAll(/text-anchor="(\w+)"/g)].map((m) => m[1]);
    expect(anchors[0]).toBe('start');
    expect(anchors.at(-1)).toBe('end');
    expect(anchors.slice(1, -1).every((a) => a === 'middle')).toBe(true);
  });
});

describe('⚠ M9 — a gap is never drawn too narrow to see', () => {
  /*
   * §6.7 offers a 2h window. One failed poll at the 5s cadence is 10s — 0.77px of a 6px 45°
   * hatch, which renders as nothing. "A gap that cannot be seen is the un-hatched line by
   * another name" (§6.5, HANDOVER rule 3).
   */
  test('⚠ a 10-second gap inside a 2-hour window is still visible', () => {
    const gaps: Gap[] = [{ fromMs: 1_000_000, toMs: 1_010_000, reason: 'failed' }];
    const html = render({ gaps, domainStartMs: 0, domainEndMs: 7_200_000 });
    const rect = /<rect[^>]*data-gap-reason="failed"[^>]*>/.exec(html)?.[0] ?? '';
    const width = Number(/width="([\d.]+)"/.exec(rect)?.[1] ?? '0');
    expect(width).toBeGreaterThanOrEqual(2);
  });

  test('⚠ a gap wide enough already keeps its true width — the floor is a floor, not a resize', () => {
    const gaps: Gap[] = [{ fromMs: 0, toMs: 3_600_000, reason: 'failed' }];
    const html = render({ gaps, domainStartMs: 0, domainEndMs: 7_200_000 });
    const rect = /<rect[^>]*data-gap-reason="failed"[^>]*>/.exec(html)?.[0] ?? '';
    expect(Number(/width="([\d.]+)"/.exec(rect)?.[1] ?? '0')).toBeCloseTo(277, 5);
  });

  test('⚠ a gap entirely outside the window is not hatched at all', () => {
    const gaps: Gap[] = [{ fromMs: -50_000, toMs: -10_000, reason: 'failed' }];
    expect(render({ gaps })).not.toContain('data-gap-reason');
  });
});

describe('⚠ M10 — a window holding exactly one reading draws that reading', () => {
  test('⚠ a single-point run is drawn as a dot at its own time, not left invisible', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick: celsius,
      series: [{ id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: [{ tMs: 30_000, v: 66 }] }],
    };
    const html = render({ plots: [plot] });
    const lone = /<circle[^>]*data-role="lone-point"[^>]*>/.exec(html)?.[0] ?? '';
    expect(lone).toContain('cx="277"');
  });

  test('a run with two points needs no lone-point dot', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick: celsius,
      series: [
        { id: 'gpu0', label: 'GPU 0', color: '#3987e5', points: [{ tMs: 0, v: 60 }, { tMs: 1000, v: 61 }] },
      ],
    };
    expect(render({ plots: [plot] })).not.toContain('lone-point');
  });
});

describe('⚠ L1 — an explicit bound survives having nothing to draw', () => {
  const allNull: SeriesPoint[] = [
    { tMs: 0, v: null },
    { tMs: 1000, v: null },
  ];

  test('⚠ yMin is honoured when every reading in the window failed', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 3000,
      series: [{ id: 'fan5', label: 'fan 5', color: '#d95926', points: allNull }],
    };
    const ticks = yTicksOf(render({ plots: [plot] }));
    expect(ticks.every(([, label]) => Number.parseInt(label, 10) >= 3000)).toBe(true);
  });

  test('yMin is honoured when readings DO exist — the other side of the same branch', () => {
    const plot: ChartPlot = {
      id: 'fan',
      formatTick: rpm,
      yMin: 3000,
      series: [{ id: 'fan5', label: 'fan 5', color: '#d95926', points: [{ tMs: 0, v: 4300 }] }],
    };
    const ticks = yTicksOf(render({ plots: [plot] }));
    expect(ticks.every(([, label]) => Number.parseInt(label, 10) >= 3000)).toBe(true);
  });
});

describe('⚠ L3 — no plot is left identified by colour alone', () => {
  test('⚠ a lone series with no end-label still gets a legend, so it carries text', () => {
    const plot: ChartPlot = {
      id: 'temp',
      formatTick: celsius,
      series: [{ id: 'gpu0', label: 'GPU 0 temperature', color: '#3987e5', points: tempSeries(3, 0) }],
    };
    const html = render({ plots: [plot] });
    expect(html).toContain('data-role="legend"');
    expect(html).toContain('GPU 0 temperature');
  });

  test('a lone series that DOES carry an end-label needs no legend', () => {
    const html = render({ plots: [fanPlot()] });
    expect(html).not.toContain('data-role="legend"');
  });
});

describe('⚠ L8 — legend entries are laid out by their labels’ widths, not a fixed pitch', () => {
  test('⚠ three long labels do not overlap at a narrow width', () => {
    const labels = ['GPU 0 temperature', 'GPU 1 temperature', 'fan 5 RPM'];
    const plot: ChartPlot = {
      id: 'temp',
      formatTick: celsius,
      series: labels.map((label, i) => ({
        id: `s${i}`,
        label,
        color: ['#3987e5', '#199e70', '#d95926'][i] as string,
        points: [{ tMs: 0, v: 60 + i }],
      })),
    };
    const legend = (render({ plots: [plot], width: 320 }).split('data-role="legend"')[1] ?? '').slice(0, 1200);
    const xs = [...legend.matchAll(/transform="translate\(([\d.]+), 0\)"/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(3);
    // Each entry starts past the previous entry's swatch + text — 16 + 4 + 5.4px per glyph.
    xs.forEach((x, i) => {
      if (i === 0) return;
      const previous = xs[i - 1] as number;
      expect(x).toBeGreaterThan(previous + 16 + 4 + (labels[i - 1] as string).length * 5.4);
    });
  });
});
