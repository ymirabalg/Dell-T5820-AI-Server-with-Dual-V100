import { describe, expect, test } from 'vitest';

import { FORCE_ALARM_PARAM, forceAlarmForTesting } from './force-alarm';

/**
 * 10a-F4's alarm-forcing escape hatch. Every test here is plain Node — no DOM — because the
 * function reads no global; `use-telemetry.ts`'s own wiring (the one place `window.location`
 * and `process.env.NODE_ENV` are actually read) is exercised only by inspection and by
 * `10c1-build.md`'s `pnpm build` + grep verification, the same split `env.ts`'s own module doc
 * draws between "what this builds" (tested here) and "the one call no test executes"
 * (`createBrowserEnv(window)`, verified by other means).
 */

const okSnapshot = {
  ts: '2026-09-08T00:00:00.000Z',
  gpus: [
    { index: 0, tempC: 40, name: 'Tesla PG500-216' },
    { index: 1, tempC: 41, name: 'Tesla PG500-216' },
  ],
};

const SEARCH_ON = `?${FORCE_ALARM_PARAM}=1`;
const SEARCH_OFF = '?other=1';

describe('⚠ the production gate wins over everything else', () => {
  test('⚠ nodeEnv "production" returns the SAME reference, even with the flag present', () => {
    const result = forceAlarmForTesting(okSnapshot, SEARCH_ON, 'production');
    expect(result).toBe(okSnapshot);
  });
});

describe('⚠ the query-string gate — absent flag changes nothing, in a non-production env', () => {
  test('⚠ no flag in the search string returns the SAME reference', () => {
    const result = forceAlarmForTesting(okSnapshot, SEARCH_OFF, 'development');
    expect(result).toBe(okSnapshot);
  });

  test('⚠ an empty search string returns the SAME reference', () => {
    const result = forceAlarmForTesting(okSnapshot, '', 'development');
    expect(result).toBe(okSnapshot);
  });
});

describe('⚠ with both gates open, GPU 0 is forced into §6.3’s alarm band and nothing else moves', () => {
  test('⚠ gpus[0].tempC becomes an alarm-level reading', () => {
    const result = forceAlarmForTesting(okSnapshot, SEARCH_ON, 'development') as typeof okSnapshot;
    expect(result.gpus[0]?.tempC).toBeGreaterThanOrEqual(80);
  });

  test('⚠ GPU 0’s other fields and every other GPU are carried through untouched', () => {
    const result = forceAlarmForTesting(okSnapshot, SEARCH_ON, 'development') as typeof okSnapshot;
    expect(result.gpus[0]?.name).toBe('Tesla PG500-216');
    expect(result.gpus[1]).toEqual(okSnapshot.gpus[1]);
  });

  test('⚠ `undefined` nodeEnv (the shape `process.env.NODE_ENV` actually has outside a build) still forces', () => {
    const result = forceAlarmForTesting(okSnapshot, SEARCH_ON, undefined) as typeof okSnapshot;
    expect(result.gpus[0]?.tempC).toBeGreaterThanOrEqual(80);
  });
});

describe('⚠ malformed bodies are left alone rather than thrown at — wire.ts still decides validity', () => {
  test('⚠ `null` body', () => {
    expect(forceAlarmForTesting(null, SEARCH_ON, 'development')).toBeNull();
  });

  test('⚠ a body with no `gpus` field', () => {
    const body = { ts: 'x' };
    expect(forceAlarmForTesting(body, SEARCH_ON, 'development')).toBe(body);
  });

  test('⚠ `gpus: null` (§6.5’s "no GPUs enumerated")', () => {
    const body = { ts: 'x', gpus: null };
    expect(forceAlarmForTesting(body, SEARCH_ON, 'development')).toBe(body);
  });

  // ⚠ Deliberately UNMARKED (ANCHOR §5: "if the property has no plausible wrong
  // implementation, drop the ⚠ rather than the standard"). `firstGpu === null || typeof
  // firstGpu !== 'object'` is a SECOND, independent guard a few lines below the length check —
  // `snapshot.gpus[0]` on an empty array is `undefined`, which that guard already returns
  // `body` for. Disabling only the length check still passes this case through the second
  // guard, so no single-line mutation distinguishes "correct" from "this check removed" here;
  // the case is covered in depth rather than by one line this test could catch breaking.
  test('`gpus: []`', () => {
    const body = { ts: 'x', gpus: [] };
    expect(forceAlarmForTesting(body, SEARCH_ON, 'development')).toBe(body);
  });
});
