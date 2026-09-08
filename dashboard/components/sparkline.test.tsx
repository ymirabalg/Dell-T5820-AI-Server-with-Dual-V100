import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { Sparkline } from './sparkline';
import type { SparklinePoint } from './sparkline';

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
