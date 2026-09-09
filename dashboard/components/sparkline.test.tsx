import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { Sparkline } from './sparkline';
import type { SparklineGap, SparklinePoint } from './sparkline';

const polylineCount = (html: string): number => (html.match(/<polyline/g) ?? []).length;

/** The caller's own accessible name — required since Q2 reconciliation (F12). */
const ARIA = 'GPU 0: temperature over the selected window';

const formatValue = (v: number): string => `${v} u`;
const formatTime = (ms: number): string => `TIME(${ms})`;

describe('boundary: empty, one point, many points (HANDOVER §5.1)', () => {
  test('⚠ zero points renders without throwing, and draws nothing', () => {
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={[]} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(html).toContain('data-empty="true"');
    expect(polylineCount(html)).toBe(0);
  });

  test('⚠ all-null points renders the empty state, not a crash from an empty min/max', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: null },
      { tMs: 1000, v: null },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(html).toContain('data-empty="true"');
  });

  test('⚠ a single readable point renders without dividing by zero — and is actually DRAWN', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={[{ tMs: 0, v: 42 }]} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(polylineCount(html)).toBe(1);
    // ⚠ The polyline stands for the run, but an SVG polyline with ONE vertex paints nothing.
    // The name used to stop at "without dividing by zero", which a blank box satisfies.
    expect(html).toContain('data-role="lone-point"');
  });

  test('a flat series (every value equal) does not divide by a zero span', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 60 },
      { tMs: 2000, v: 60 },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(html).not.toContain('NaN');
  });
});

describe('⚠ a null reading breaks the line rather than being bridged across', () => {
  test('⚠ one gap in the middle produces two polylines, not one continuous line', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 62 },
      { tMs: 2000, v: null },
      { tMs: 3000, v: null },
      { tMs: 4000, v: 65 },
      { tMs: 5000, v: 66 },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(polylineCount(html)).toBe(2);
  });

  test('no gap at all is one polyline', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 61 },
      { tMs: 2000, v: 62 },
    ];
    expect(polylineCount(renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />))).toBe(1);
  });
});

describe('⚠ the end dot marks the last READABLE point, not the last point overall', () => {
  test('⚠ a trailing null does not move the dot to an unreadable position', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 70 }, // the true last reading — should be the dot's y
      { tMs: 2000, v: null }, // trailing gap
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} width={100} height={100} />);
    const circle = /<circle[^>]*>/.exec(html)?.[0] ?? '';
    // v=70 is the series maximum, so its y is 0 (the top) under this scale — a dot placed on
    // the trailing null would compute NaN instead.
    expect(circle).toContain('cy="0"');
    expect(circle).not.toContain('NaN');
  });
});

describe('⚠ invariant 1 — a v=0 point is a real reading, not a gap', () => {
  test('⚠ zero does not break the run — it renders in the same polyline as its neighbours', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 0 },
      { tMs: 2000, v: 65 },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(polylineCount(html)).toBe(1);
  });
});

describe('colour is the caller’s, applied verbatim', () => {
  test('the stroke and fill use the given hex', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={[{ tMs: 0, v: 1 }, { tMs: 1, v: 2 }]} color="#199e70" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain('stroke="#199e70"');
    expect(html).toContain('fill="#199e70"');
  });
});

// ---------------------------------------------------------------------------------------
// Step 9 RECONCILIATION — M6 and M10's sparkline half.
// ---------------------------------------------------------------------------------------

const ysOf = (html: string): number[] =>
  [...html.matchAll(/<polyline[^>]*points="([^"]*)"/g)]
    .flatMap((m) => (m[1] ?? '').trim().split(' '))
    .filter((s) => s.length > 0)
    .map((pair) => Number(pair.split(',')[1]));

describe('⚠ M6 — a flat series is not drawn along the bottom edge', () => {
  /*
   * `(v − min) / 1` is 0 for every point of a flat series, which put the whole line on
   * `y = height` — the position that in every other frame of the same trace means "coldest
   * reading in the window". A GPU idling at a constant 66 °C is not at the bottom of
   * anything, and `StackedTimeSeriesChart` draws the identical input mid-plot.
   */
  test('⚠ a flat series draws on the centre line, where the full chart draws it', () => {
    const points: SparklinePoint[] = Array.from({ length: 6 }, (_, i) => ({ tMs: i * 1000, v: 66 }));
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(ysOf(html)).toEqual([12, 12, 12, 12, 12, 12]);
    expect(/<circle[^>]*cy="12"/.test(html)).toBe(true);
  });

  test('a series that is NOT flat still spans the full box — the other side of the same branch', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 70 },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(ysOf(html)).toEqual([24, 0]);
  });
});

describe('⚠ M10 — an isolated readable point is drawn rather than lost', () => {
  test('⚠ two one-point runs either side of a null are both visible', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: null },
      { tMs: 2000, v: 62 },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect((html.match(/data-role="lone-point"/g) ?? []).length).toBe(2);
  });

  test('a run of two or more points needs no lone-point dot', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 62 },
      { tMs: 2000, v: 64 },
    ];
    const html = renderToStaticMarkup(<Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />);
    expect(html).not.toContain('lone-point');
  });
});

// ---------------------------------------------------------------------------------------
// Q2 — the hover layer (crosshair + native tooltip), CSS/SVG-native, no hook.
// ---------------------------------------------------------------------------------------

const hoverZoneCount = (html: string): number => (html.match(/data-role="hover-zone"/g) ?? []).length;
const crosshairCount = (html: string): number => (html.match(/data-role="crosshair"/g) ?? []).length;
const titles = (html: string): string[] =>
  [...html.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => m[1] ?? '');

describe('Q2 — one hover zone per point, readable or not', () => {
  test('⚠ a null point still gets its own hover zone — it is not silently absorbed by a neighbour', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: null },
      { tMs: 2000, v: 62 },
    ];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(hoverZoneCount(html)).toBe(3);
    expect(crosshairCount(html)).toBe(3);
  });

  test('empty points render no hover layer at all', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={[]} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(hoverZoneCount(html)).toBe(0);
  });
});

describe('Q2 — a hover tooltip never fabricates a reading', () => {
  test('⚠ a null point’s tooltip renders the em dash, never the caller’s formatter', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: null },
    ];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    const t = titles(html);
    // One title from the hover zone at index 1 — the null reading.
    const nullTooltip = t.find((s) => s.startsWith('TIME(1000)'));
    expect(nullTooltip).toContain(EM_DASH);
    expect(nullTooltip).not.toContain('null u');
  });

  test('a readable point’s tooltip carries the caller’s formatted value and real time', () => {
    const points: SparklinePoint[] = [{ tMs: 4200, v: 73 }, { tMs: 5200, v: 74 }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    const t = titles(html);
    expect(t.some((s) => s.includes('TIME(4200)') && s.includes('73 u'))).toBe(true);
  });
});

describe('Q2 — hover columns partition the width exactly, with no gap and no overlap', () => {
  test('⚠ the first column starts at 0 and the last ends at the drawn width', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 10 },
      { tMs: 1000, v: 20 },
      { tMs: 2000, v: 30 },
    ];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" width={90} formatValue={formatValue} formatTime={formatTime} />,
    );
    const rects = [...html.matchAll(/<rect[^>]*data-role="hover-zone"[^>]*\/?>/g)].map((m) => m[0]);
    expect(rects.length).toBe(3);
    const firstX = Number(/x="([-\d.]+)"/.exec(rects[0] as string)?.[1]);
    const lastRect = rects[rects.length - 1] as string;
    const lastX = Number(/x="([-\d.]+)"/.exec(lastRect)?.[1]);
    const lastW = Number(/width="([-\d.]+)"/.exec(lastRect)?.[1]);
    expect(firstX).toBe(0);
    expect(lastX + lastW).toBeCloseTo(90, 5);
  });
});

// ---------------------------------------------------------------------------------------
// Q2 — the table view (a PROP, not internal state — `purity.test.ts`).
// ---------------------------------------------------------------------------------------

describe('Q2 — view="table" renders a table instead of an svg', () => {
  test('⚠ table view draws no <svg> at all, and chart view (the default) draws no <table>', () => {
    const points: SparklinePoint[] = [{ tMs: 0, v: 60 }, { tMs: 1000, v: 61 }];
    const table = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    const chart = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(table).not.toContain('<svg');
    expect(table).toContain('<table');
    expect(chart).not.toContain('<table');
    expect(chart).toContain('<svg');
  });

  test('⚠ invariant 1 in the table: a null reading renders the em dash, not the numeral 0', () => {
    const points: SparklinePoint[] = [{ tMs: 0, v: null }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain(`<td>${EM_DASH}</td>`);
    expect(html).not.toContain('<td>0 u</td>');
  });

  test('⚠ invariant 1’s other half: a v=0 reading renders the numeral WITH its unit, not the em dash', () => {
    const points: SparklinePoint[] = [{ tMs: 0, v: 0 }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain('<td>0 u</td>');
    expect(html).not.toContain(`<td>${EM_DASH}</td>`);
  });

  test('an empty series renders the "no readings" note, not an empty table', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={[]} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('<table');
    expect(html).toContain('no readings in the selected window');
  });

  test('the table has one row per point, in order, using the caller’s real formatTime', () => {
    const points: SparklinePoint[] = [
      { tMs: 100, v: 1 },
      { tMs: 200, v: 2 },
      { tMs: 300, v: 3 },
    ];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
    expect((tbody.match(/<tr>/g) ?? []).length).toBe(3);
    expect(html.indexOf('TIME(100)')).toBeLessThan(html.indexOf('TIME(200)'));
    expect(html.indexOf('TIME(200)')).toBeLessThan(html.indexOf('TIME(300)'));
  });
});

// ---------------------------------------------------------------------------------------
// Q2 test-phase addition — see the identical rationale in
// `stacked-time-series-chart.test.tsx`: `.hoverZone:hover + .crosshairGroup` only fires when
// the crosshair group is the hover zone's immediately-following DOM sibling. Every other Q2
// hover test here renders through the one loop that already keeps these paired, so none of
// them can distinguish "the CSS mechanism actually works" from "the counts happen to match."
// ---------------------------------------------------------------------------------------

describe('Q2 — the hover zone and its crosshair must be adjacent DOM siblings, not merely equal in count', () => {
  test('⚠ every hover-zone rect is immediately followed by its OWN crosshair group, with nothing between', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 61 },
      { tMs: 2000, v: 62 },
    ];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    const zones = hoverZoneCount(html);
    const adjacentPairs = (
      html.match(/<rect[^>]*data-role="hover-zone"[^>]*>[\s\S]*?<\/rect><g[^>]*data-role="crosshair"/g) ?? []
    ).length;
    expect(zones).toBe(3);
    expect(adjacentPairs).toBe(zones);
  });
});

// ---------------------------------------------------------------------------------------
// Q2 RECONCILIATION, 2026-09-08 — the sparkline's half of the adversarial's F1. `Q2-SP3` pins
// only the two OUTER edges, so mutation C (`xEnd = xFor(index + 1)` instead of the midpoint)
// survived it: the first column still starts at 0 and the last still ends at `width`, while
// every interior column OVERLAPS its neighbour and the later-painted rect wins hit testing —
// "snap to nearest" becomes "snap to next". Nothing read a coordinate in between.
// ---------------------------------------------------------------------------------------

const hoverZones = (html: string): [number, number][] =>
  [...html.matchAll(/<rect[^>]*data-role="hover-zone"[^>]*x="([-\d.]+)"[^>]*width="([-\d.]+)"/g)].map(
    (m) => [Number(m[1]), Number(m[2])],
  );

const crosshairXs = (html: string): number[] =>
  [...html.matchAll(/data-role="crosshair"[^>]*>\s*<line x1="([-\d.]+)"[^>]*x2="([-\d.]+)"/g)].map(
    (m) => {
      expect(Number(m[1])).toBe(Number(m[2]));
      return Number(m[1]);
    },
  );

describe('⚠ Q2/F1 — the sparkline’s hover columns are a partition, not merely bounded at the ends', () => {
  const points: SparklinePoint[] = [
    { tMs: 0, v: 10 },
    { tMs: 1000, v: 20 },
    { tMs: 2000, v: 30 },
    { tMs: 3000, v: 40 },
    { tMs: 4000, v: 50 },
  ];
  // width 80, 5 points positioned by INDEX: x = index/4 × 80 = 0, 20, 40, 60, 80.
  const xOf = (index: number): number => index * 20;

  test('⚠ every interior bound is the MIDPOINT to its neighbour, so the columns tile the width with no overlap', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" width={80} formatValue={formatValue} formatTime={formatTime} />,
    );
    const zones = hoverZones(html);
    expect(zones.length).toBe(5);
    zones.forEach(([x, w], i) => {
      expect(x).toBeCloseTo(i === 0 ? 0 : (xOf(i - 1) + xOf(i)) / 2, 5);
      expect(x + w).toBeCloseTo(i === 4 ? 80 : (xOf(i) + xOf(i + 1)) / 2, 5);
      const next = zones[i + 1];
      if (next) expect(x + w).toBeCloseTo(next[0], 5);
    });
  });

  test('⚠ every crosshair sits on its OWN point’s x, inside its own zone — not on a column boundary', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" width={80} formatValue={formatValue} formatTime={formatTime} />,
    );
    const zones = hoverZones(html);
    const xs = crosshairXs(html);
    expect(xs.length).toBe(5);
    xs.forEach((x, i) => {
      const [zx, zw] = zones[i] as [number, number];
      expect(x).toBeCloseTo(xOf(i), 5);
      expect(x).toBeGreaterThanOrEqual(zx);
      expect(x).toBeLessThanOrEqual(zx + zw);
      if (i > 0 && i < 4) {
        expect(x).toBeGreaterThan(zx);
        expect(x).toBeLessThan(zx + zw);
      }
    });
  });
});

// ---------------------------------------------------------------------------------------
// Q2 RECONCILIATION — F12 (the accessible name is the caller's, in both views), F4 (a row
// header per row) and F6 (a non-finite reading is not a reading).
// ---------------------------------------------------------------------------------------

describe('⚠ Q2/F12 — a sparkline is named by its caller, not by a built-in sentence', () => {
  test('⚠ the chart view announces the caller’s own name, so three cards are not three identical trends', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel="CPU: temperature over the selected window" points={[{ tMs: 0, v: 1 }, { tMs: 1, v: 2 }]} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain('aria-label="CPU: temperature over the selected window"');
    expect(html).not.toContain('trend over the selected window');
  });

  test('⚠ the table view’s <caption> is that same caller name, not one shared by every sparkline on the page', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel="CPU: temperature over the selected window" points={[{ tMs: 0, v: 1 }]} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain('<caption class="sr-only">CPU: temperature over the selected window</caption>');
    expect(html).not.toContain('trend over the selected window');
  });

  test('the empty state names the same trend too, rather than an anonymous placeholder', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel="CPU: temperature over the selected window" points={[]} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain('CPU: temperature over the selected window');
    expect(html).toContain('no readings in the selected window');
  });
});

describe('⚠ Q2/F4 — the table’s time cell is a row header', () => {
  test('⚠ each row’s time cell is a <th scope="row">, so a reading announces which instant it belongs to', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={[{ tMs: 100, v: 1 }]} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).toContain('<th scope="row">TIME(100)</th>');
    expect(html).not.toContain('<td>TIME(100)</td>');
  });
});

describe('⚠ Q2/F6 — a non-finite reading is not a reading', () => {
  const points: SparklinePoint[] = [
    { tMs: 0, v: 5 },
    { tMs: 1000, v: Number.NaN },
    { tMs: 2000, v: Number.POSITIVE_INFINITY },
  ];

  test('⚠ NaN and Infinity render the em dash in the hover tooltip, never through the caller’s formatter', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    const t = titles(html);
    expect(t.some((s) => s.includes('TIME(1000)') && s.includes(EM_DASH))).toBe(true);
  });

  test('⚠ NaN and Infinity render the em dash in the table too — the polyline already breaks there', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect((html.match(new RegExp(`<td>${EM_DASH}</td>`, 'g')) ?? []).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------
// Q2-S2 — the table view SCROLLS within its own container (SPEC §6.2, ruled 2026-09-08), the
// same ruling as `StackedTimeSeriesChart`'s. See that file's identical Q2-S2 test for why the
// scrolling/sticky CSS itself is not asserted here: it is CSS-only and this suite renders no
// DOM at all.
// ---------------------------------------------------------------------------------------

describe('⚠ Q2-S2 — the scrolling table view is reachable by keyboard', () => {
  test('⚠ the table view’s own group is a keyboard-focusable scroll container, not merely a styled box', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel="CPU: temperature over the selected window" points={[{ tMs: 100, v: 1 }]} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    // The whole OPENING TAG of the group carrying `data-role="table-view"` — all three
    // attributes on the SAME tag, so a wrong implementation putting `tabindex` on some other
    // element (e.g. a row) cannot pass this.
    const opening = /<div[^>]*data-role="table-view"[^>]*>/.exec(html)?.[0] ?? '';
    expect(opening).toContain('role="group"');
    expect(opening).toContain('aria-label="CPU: temperature over the selected window"');
    expect(opening).toContain('tabindex="0"');
  });
});

// ---------------------------------------------------------------------------------------
// 10c-3 / F14b — `gaps` closes the failure index-positioning left open: two READABLE points
// straddling a real sampling gap used to draw one smooth, unbroken line between them, which
// reads as a genuine continuous reading over ground nobody measured. See the module doc's
// F14b section for the full argument.
// ---------------------------------------------------------------------------------------

const gapRectCount = (html: string): number => (html.match(/data-role="gap"/g) ?? []).length;

describe('⚠ 10c-3/F14b — a gap between two readable points breaks the run, even though neither point is null', () => {
  const points: SparklinePoint[] = [
    { tMs: 0, v: 60 },
    { tMs: 1000, v: 62 },
    // A real sampling gap sits between 1000 and 100000 — the ring simply has no samples
    // there, so these two points are ADJACENT in the array despite being 99 seconds apart.
    { tMs: 100_000, v: 90 },
    { tMs: 101_000, v: 91 },
  ];

  test('without a matching gap entry, the four points still draw as ONE polyline — the pre-existing (wrong) behaviour, kept as the baseline this fix changes', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(polylineCount(html)).toBe(1);
    expect(gapRectCount(html)).toBe(0);
  });

  test('⚠ a gap overlapping the span between two points breaks the polyline into two AND draws a gap mark', () => {
    const gaps: SparklineGap[] = [{ fromMs: 5000, toMs: 90_000, reason: 'hidden' }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(polylineCount(html)).toBe(2);
    expect(gapRectCount(html)).toBe(1);
  });

  // ⚠ 10c-3 reconciliation / A5 — REPLACES a test whose fixture was byte-identical to the ⚠
  // test above it and whose assertions were a strict subset of that test's, so it could not go
  // red independently of it, while its NAME promised a property (unrelated pairs are not
  // double-broken) that no assertion in its body distinguished. The fixture the name described
  // is this one: a gap spanning SEVERAL adjacent pairs.
  test('⚠ ONE gap spanning several pairs draws ONE mark, not one per pair — §6.7: a reading landing inside a gap leaves it "neither closed nor split"', () => {
    // §6.7's blessed case, verbatim: paused at 1 s, `refresh now` taken twice while paused
    // (both readings kept, neither closing nor splitting the gap), resumed at 60 s.
    const acrossRefreshes: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 20_000, v: 61 },
      { tMs: 40_000, v: 62 },
      { tMs: 60_000, v: 63 },
    ];
    const gaps: SparklineGap[] = [{ fromMs: 1000, toMs: 60_000, reason: 'paused' }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={acrossRefreshes} color="#3987e5" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    // One gap in, one mark out — `StackedTimeSeriesChart` draws exactly one `<rect>` for this
    // same input, and the two forms of the same data must not disagree about how many outages
    // there were.
    expect(gapRectCount(html)).toBe(1);
    // ⚠ And it spans the WHOLE range the gap covers, not just the last pair it straddles: a
    // mark collapsed onto one pair would still count as "one mark" while lying about extent.
    const mark = /<rect[^>]*data-role="gap"[^>]*>/.exec(html)?.[0] ?? '';
    const markWidth = Number(/width="([\d.]+)"/.exec(mark)?.[1] ?? '0');
    // The default width is 96px and the gap covers all three intervals, so the mark must be
    // essentially the full canvas — a per-pair mark would be a third of it.
    expect(markWidth).toBeGreaterThan(90);

    // ⚠ And the TABLE says it once too. This is the half an operator actually counts: the
    // per-pair implementation listed `gap (paused) — TIME(1000) to TIME(60000)` three times,
    // identically worded, for one outage — three rows on a 1280px display against the promoted
    // chart's one on a 1600px display, for the same data.
    const table = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={acrossRefreshes} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect((table.match(/data-role="gap-row"/g) ?? []).length).toBe(1);
  });

  test('⚠ a gap abutting a NULL reading is still marked and still listed — the table is the accessibility floor and must not say less than the chart', () => {
    // 10c-3/A4: one poll returned no reading (invariant 5's ordinary partial snapshot), then
    // the tab was hidden for the rest of the span. The `null` breaks the LINE, which the chart
    // form makes visible — but the table has no line to break, so suppressing the gap there
    // left a reader unable to tell "one reading failed" from "thirty minutes went unsampled".
    const withNull: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: null },
      { tMs: 100_000, v: 90 },
    ];
    const gaps: SparklineGap[] = [{ fromMs: 5000, toMs: 90_000, reason: 'hidden' }];
    const chart = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={withNull} color="#3987e5" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(gapRectCount(chart)).toBe(1);
    const table = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={withNull} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(table).toContain(`gap (hidden) — ${formatTime(5000)} to ${formatTime(90_000)}`);
  });

  test('⚠ an OPEN gap (toMs: null) still breaks the boundary into it — a reading landing INSIDE an ongoing gap (gaps.ts rule 3) is not bridged to what came before', () => {
    const beforeAndInsideOpenGap: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 62 },
      // A reading landed INSIDE the still-open gap without closing it — real per gaps.ts's
      // own rule 3 ("a reading may land inside a gap, and does not split it").
      { tMs: 6000, v: 61 },
    ];
    const gaps: SparklineGap[] = [{ fromMs: 5000, toMs: null, reason: 'failed' }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={beforeAndInsideOpenGap} color="#3987e5" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(polylineCount(html)).toBe(2);
  });

  test('a gap that resolved entirely BEFORE the first point does not break anything — no adjacent pair straddles it', () => {
    const gaps: SparklineGap[] = [{ fromMs: -500, toMs: -100, reason: 'paused' }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(polylineCount(html)).toBe(1);
    expect(gapRectCount(html)).toBe(0);
  });

});

// ---------------------------------------------------------------------------------------
// 10e §3.2 — the three optional additions for the ≥1600px promoted form: `domain` (a fixed
// y-scale), `refs` (dashed threshold lines) and `timeLabels`. Fixture symmetry throughout
// (HANDOVER §5.1): every prop is tested WITH and WITHOUT, and "without" must still be
// byte-for-byte what this file's tests above already prove.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e — domain clamps a reading INTO a fixed y-scale, never dropping the point', () => {
  const points: SparklinePoint[] = [
    { tMs: 0, v: 60 },
    { tMs: 1000, v: 95 }, // above the domain max
    { tMs: 2000, v: 70 },
  ];

  test('without domain: autoscale, exactly as before — the values ARE the scale', () => {
    const withDomain = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    // 95 is the series max here, so it draws at y=0 (the top) under autoscale.
    expect(ysOf(withDomain)[1]).toBeCloseTo(0, 5);
  });

  test('⚠ with domain {min:30,max:90}: a reading of 95 clamps to the max rail, y=0 — never NaN, never dropped', () => {
    const html = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={points}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
        domain={{ min: 30, max: 90 }}
      />,
    );
    expect(html).not.toContain('NaN');
    // Three points still drawn — the clamp changes the Y position, not whether it is drawn.
    expect(ysOf(html).length).toBe(3);
    // Clamped to the top rail (padT is 0 here — no timeLabels), same as a real 90 would be.
    expect(ysOf(html)[1]).toBeCloseTo(0, 5);
  });

  // ⚠ ADDED BY 10e's TEST PHASE, 2026-09-09 — HANDOVER §5.1, fixture symmetry. Every `domain`
  // fixture in this file sat ABOVE the rail (95 against a max of 90); nothing anywhere sat
  // below the min. A one-sided clamp (`Math.min(domainMax, v)`, dropping the `Math.max`) passed
  // the entire suite and both harnesses, and `10e-SP6` could not see it either because it
  // removes BOTH rails at once. Not hypothetical: `gpu-panel.tsx`'s `TEMP_DOMAIN.min` is 30 °C
  // and this room is ~25, so a cold power-on reads under the rail — with no lower clamp its
  // vertex is at y > height and the trace leaves the viewBox entirely.
  test('⚠ with domain {min:30,max:90}: a reading of 25 clamps to the MIN rail, y=height — the other side of the same clamp', () => {
    const cold: SparklinePoint[] = [
      { tMs: 0, v: 25 }, // below the domain min
      { tMs: 1000, v: 60 },
    ];
    const html = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={cold}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
        domain={{ min: 30, max: 90 }}
      />,
    );
    expect(html).not.toContain('NaN');
    expect(ysOf(html).length).toBe(2);
    // The default height is 24 and padT/padB are 0 without `timeLabels`, so the bottom rail
    // is exactly y = 24 — the same y a real 30 would draw at, never below it.
    expect(ysOf(html)[0]).toBeCloseTo(24, 5);
  });

  test('⚠ two cards share ONE scale: a 66°C reading on a 30–90 domain is NOT drawn at the same y a 90°C reading would be under autoscale', () => {
    const flatIsh: SparklinePoint[] = [{ tMs: 0, v: 66 }, { tMs: 1000, v: 66 }];
    const html = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={flatIsh}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
        domain={{ min: 30, max: 90 }}
        height={60}
      />,
    );
    // 66 is 60% of the way from 30 to 90, so y = (1 - 0.6) * 60 = 24 — NOT the centre line
    // (30) autoscale would draw a flat series at.
    expect(ysOf(html)).toEqual([24, 24]);
  });
});

describe('⚠ 10e — refs draw only when given, and reserve room on the right', () => {
  const points: SparklinePoint[] = [{ tMs: 0, v: 60 }, { tMs: 1000, v: 70 }];

  test('without refs: no reference line or label in the markup', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('data-role="sparkline-ref"');
    expect(html).not.toContain('80');
  });

  test('⚠ refs render one line+label per entry, coloured by alarm', () => {
    const html = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={points}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
        domain={{ min: 30, max: 90 }}
        refs={[
          { v: 80, label: '80', alarm: true },
          { v: 70, label: '70' },
        ]}
      />,
    );
    expect((html.match(/data-role="sparkline-ref"/g) ?? []).length).toBe(2);
    expect(html).toContain('>80<');
    expect(html).toContain('>70<');
  });

  test('⚠ an empty refs array behaves exactly like omitting refs — no reserved width', () => {
    const withEmpty = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} refs={[]} width={90} />,
    );
    const withoutProp = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} width={90} />,
    );
    expect(withEmpty).toBe(withoutProp);
  });
});

describe('⚠ 10e — timeLabels draws the window’s first and last real instants', () => {
  const points: SparklinePoint[] = [
    { tMs: 1000, v: 60 },
    { tMs: 2000, v: 62 },
    { tMs: 3000, v: 61 },
  ];

  const timeLabelGroup = (html: string): string =>
    /<g data-role="sparkline-time-labels">[\s\S]*?<\/g>/.exec(html)?.[0] ?? '';

  test('without timeLabels: no time-axis group at all', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('data-role="sparkline-time-labels"');
  });

  test('⚠ timeLabels renders the FIRST and LAST point’s real time, not the visually-last-drawn one', () => {
    const html = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={points}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
        timeLabels
      />,
    );
    // Scoped to the time-axis group itself — the hover layer's own per-point tooltips also
    // contain every TIME(...) string, so an unscoped `toContain` would pass vacuously.
    const group = timeLabelGroup(html);
    expect(group).toContain('TIME(1000)');
    expect(group).toContain('TIME(3000)');
    expect(group).not.toContain('TIME(2000)');
  });

  test('empty points with timeLabels renders the empty state, never throws', () => {
    expect(() =>
      renderToStaticMarkup(
        <Sparkline ariaLabel={ARIA} points={[]} color="#3987e5" formatValue={formatValue} formatTime={formatTime} timeLabels />,
      ),
    ).not.toThrow();
  });
});

// ⚠ RENAMED BY 10e's TEST PHASE, 2026-09-09. This described itself as proving output
// "byte-identical to today's" and asserted nothing of the kind — and byte-identity is FALSE
// anyway (the area path and the r=4.5 end dot are unconditional 10e additions, and `yFor`'s
// rewrite is not bit-equal in IEEE754). The ⚠ also sat on the DESCRIBE, where no ledger in the
// project can see it (HANDOVER §5.3). Renamed to what the body actually proves.
describe('10e — with none of the three props given, neither optional group is emitted (10e §3.2)', () => {
  test('a plain call with only the required props emits no refs group and no time-label group', () => {
    const points: SparklinePoint[] = [{ tMs: 0, v: 60 }, { tMs: 1000, v: 62 }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('data-role="sparkline-ref"');
    expect(html).not.toContain('data-role="sparkline-time-labels"');
  });
});

// ---------------------------------------------------------------------------------------
// 10e §3.2 — the area fill and the enlarged end dot (form only, 0px of layout height).
// ---------------------------------------------------------------------------------------

describe('⚠ 10e — the area fill is one path per run, breaking at the same points the line does', () => {
  test('⚠ a single run draws one area path; a gap in the middle draws two', () => {
    const onePiece = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={[{ tMs: 0, v: 60 }, { tMs: 1000, v: 62 }]}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
      />,
    );
    const twoPieces = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={[{ tMs: 0, v: 60 }, { tMs: 1000, v: null }, { tMs: 2000, v: 62 }]}
        color="#3987e5"
        formatValue={formatValue}
        formatTime={formatTime}
      />,
    );
    const areaCount = (html: string): number => (html.match(/data-role="area"/g) ?? []).length;
    expect(areaCount(onePiece)).toBe(1);
    expect(areaCount(twoPieces)).toBe(2);
  });
});

describe('⚠ 10e — the table view is unaffected by domain/refs/timeLabels — decoration never grows the accessibility floor', () => {
  // ⚠ NOT marked — structurally guaranteed rather than mutation-tested: `Sparkline`'s table
  // branch returns before `domain`/`refs`/`timeLabels` are even read, so `SparklineTableView`
  // has no code path that could see them at all. Recorded per HANDOVER's "properties with no
  // mutation" pattern rather than given a ⚠ with nothing plausible to break it.
  test('the table has the SAME row count with or without every new prop', () => {
    const points: SparklinePoint[] = [{ tMs: 0, v: 60 }, { tMs: 1000, v: 95 }];
    const plain = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    const decorated = renderToStaticMarkup(
      <Sparkline
        ariaLabel={ARIA}
        points={points}
        color="#3987e5"
        view="table"
        formatValue={formatValue}
        formatTime={formatTime}
        domain={{ min: 30, max: 90 }}
        refs={[{ v: 80, label: '80', alarm: true }]}
        timeLabels
      />,
    );
    const rowsOf = (html: string): number => (html.match(/<tr/g) ?? []).length;
    expect(rowsOf(decorated)).toBe(rowsOf(plain));
    // And the printed VALUE is the caller's real reading, not clamped — the domain clamp is a
    // CHART-geometry decision (§6.3's Y-axis clamp), never a change to the reported number.
    expect(decorated).toContain('95 u');
  });
});

describe('⚠ 10c-3/F14b — the table view now carries a gap row, matching the chart form', () => {
  const points: SparklinePoint[] = [
    { tMs: 0, v: 60 },
    { tMs: 100_000, v: 90 },
  ];

  test('⚠ a gap between two table rows renders as its own row, spanning both columns', () => {
    const gaps: SparklineGap[] = [{ fromMs: 5000, toMs: 90_000, reason: 'hidden' }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(html).toContain('data-role="gap-row"');
    expect(html).toContain('colSpan="2"');
    expect(html).toContain(`gap (hidden) — ${formatTime(5000)} to ${formatTime(90_000)}`);
    // Three rows total: sample, gap, sample — in that order.
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
    expect((tbody.match(/<tr/g) ?? []).length).toBe(3);
    expect(html.indexOf(`${formatTime(0)}`)).toBeLessThan(html.indexOf('gap (hidden)'));
    expect(html.indexOf('gap (hidden)')).toBeLessThan(html.indexOf(formatTime(100_000)));
  });

  test('⚠ an OPEN gap’s row reads "ongoing" rather than formatting a null time', () => {
    const gaps: SparklineGap[] = [{ fromMs: 5000, toMs: null, reason: 'failed' }];
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} gaps={gaps} />,
    );
    expect(html).toContain('to ongoing');
  });

  test('no `gaps` prop at all renders exactly as before — no gap row, two sample rows only', () => {
    const html = renderToStaticMarkup(
      <Sparkline ariaLabel={ARIA} points={points} color="#3987e5" view="table" formatValue={formatValue} formatTime={formatTime} />,
    );
    expect(html).not.toContain('data-role="gap-row"');
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
    expect((tbody.match(/<tr/g) ?? []).length).toBe(2);
  });
});
