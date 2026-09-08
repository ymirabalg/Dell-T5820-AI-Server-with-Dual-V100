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

  test('a single readable point renders without dividing by zero', () => {
    const html = renderToStaticMarkup(
      <Sparkline points={[{ tMs: 0, v: 42 }]} color="#3987e5" />,
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(polylineCount(html)).toBe(1);
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
