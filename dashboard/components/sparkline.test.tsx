import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { Sparkline } from './sparkline';
import type { SparklinePoint } from './sparkline';

const polylineCount = (html: string): number => (html.match(/<polyline/g) ?? []).length;

describe('boundary: empty, one point, many points (HANDOVER §5.1)', () => {
  test('⚠ zero points renders without throwing, and draws nothing', () => {
    const html = renderToStaticMarkup(<Sparkline points={[]} color="#3987e5" />);
    expect(html).toContain('data-empty="true"');
    expect(polylineCount(html)).toBe(0);
  });

  test('⚠ all-null points renders the empty state, not a crash from an empty min/max', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: null },
      { tMs: 1000, v: null },
    ];
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
    expect(html).toContain('data-empty="true"');
  });

  test('⚠ a single readable point renders without dividing by zero — and is actually DRAWN', () => {
    const html = renderToStaticMarkup(
      <Sparkline points={[{ tMs: 0, v: 42 }]} color="#3987e5" />,
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
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
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
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
    expect(polylineCount(html)).toBe(2);
  });

  test('no gap at all is one polyline', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 61 },
      { tMs: 2000, v: 62 },
    ];
    expect(polylineCount(renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />))).toBe(1);
  });
});

describe('⚠ the end dot marks the last READABLE point, not the last point overall', () => {
  test('⚠ a trailing null does not move the dot to an unreadable position', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 70 }, // the true last reading — should be the dot's y
      { tMs: 2000, v: null }, // trailing gap
    ];
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" width={100} height={100} />);
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
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
    expect(polylineCount(html)).toBe(1);
  });
});

describe('colour is the caller’s, applied verbatim', () => {
  test('the stroke and fill use the given hex', () => {
    const html = renderToStaticMarkup(
      <Sparkline points={[{ tMs: 0, v: 1 }, { tMs: 1, v: 2 }]} color="#199e70" />,
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
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
    expect(ysOf(html)).toEqual([12, 12, 12, 12, 12, 12]);
    expect(/<circle[^>]*cy="12"/.test(html)).toBe(true);
  });

  test('a series that is NOT flat still spans the full box — the other side of the same branch', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 70 },
    ];
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
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
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
    expect((html.match(/data-role="lone-point"/g) ?? []).length).toBe(2);
  });

  test('a run of two or more points needs no lone-point dot', () => {
    const points: SparklinePoint[] = [
      { tMs: 0, v: 60 },
      { tMs: 1000, v: 62 },
      { tMs: 2000, v: 64 },
    ];
    const html = renderToStaticMarkup(<Sparkline points={points} color="#3987e5" />);
    expect(html).not.toContain('lone-point');
  });
});
