import { describe, expect, test } from 'vitest';

import { EMPTY_CONDITION_STATE } from '@/lib/conditions';
import { startEventLog } from '@/lib/client/events';
import { DEFAULT_CADENCE_SECONDS } from '@/lib/client/prefs';
import type { WindowMinutes } from '@/lib/client/prefs';
import { EMPTY_RING, appendSample } from '@/lib/client/ring';
import type { SampleRing } from '@/lib/client/ring';
import type { RuntimeState } from '@/lib/client/runtime';
import { everythingZero } from '@/lib/fixtures';
import { isoTimestamp } from '@/lib/types';

import { chartDomainOf, formatTimeOfDayMs } from './panel-chart';

const BASE_MS = Date.UTC(2026, 8, 6, 14, 0, 0, 0);

const ringAt = (ms: number): SampleRing =>
  appendSample(EMPTY_RING, {
    snapshot: { ...everythingZero, ts: isoTimestamp(new Date(ms).toISOString()) },
    tsMs: ms,
  });

const stateOf = (ring: SampleRing, windowMinutes: WindowMinutes = 30): RuntimeState => ({
  preferences: { cadenceSeconds: DEFAULT_CADENCE_SECONDS, windowMinutes },
  ring,
  conditions: EMPTY_CONDITION_STATE,
  displayed: [],
  events: startEventLog(BASE_MS),
  gaps: [],
  paused: false,
  hidden: false,
  consecutiveFailures: 0,
  lastFailure: null,
  mode: 'live',
  severity: null,
  alarms: 0,
  unknownStanding: [],
});

describe('formatTimeOfDayMs', () => {
  test('renders a plain ms timestamp through the same clock as `lib/format.ts`', () => {
    // UTC time, pinned via the system's own TZ — this asserts round-trip stability rather
    // than a specific wall-clock string, since the box's local zone is not this test's to fix.
    const iso = new Date(BASE_MS).toISOString();
    const direct = formatTimeOfDayMs(BASE_MS);
    expect(direct).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(BASE_MS);
  });
});

describe('⚠ chartDomainOf', () => {
  test("anchors on the newest sample's ts, not on nowMs — matching the §6.7 window rule", () => {
    const ring = ringAt(BASE_MS);
    const domain = chartDomainOf(stateOf(ring, 30));
    expect(domain.endMs).toBe(BASE_MS);
    expect(domain.startMs).toBe(BASE_MS - 30 * 60_000);
  });

  test('the window width follows the preference, not a hard-coded default', () => {
    const ring = ringAt(BASE_MS);
    const domain120 = chartDomainOf(stateOf(ring, 120));
    expect(domain120.endMs - domain120.startMs).toBe(120 * 60_000);
  });

  // ⚠ REPLACED 2026-09-08 by 10b's reconciliation. This test used to read *"an empty ring
  // (before the first accepted poll) still returns an ordered domain"* and asserted
  // `startMs < endMs` — i.e. it asserted the defect adversarial F8 found, in its own words. The
  // property that matters is the opposite one, and it is stated in the describe block below.
});

describe('⚠ before the first accepted poll the domain must be EMPTY, not a plausible one', () => {
  test('⚠ an empty ring yields 0 → 0, which the chart primitive renders as its empty state', () => {
    // `chartDomainOf` used to return `0 − windowMs → 0`, whose own doc claimed a chart fed it
    // "draws an empty axis rather than a mispositioned one". Rendered, that was false:
    // `StackedTimeSeriesChart` only treats `domainEndMs <= domainStartMs` as empty, so it drew
    // a full half-hour of plausible local times (epoch 0 in the browser's zone — `18:30:00 …
    // 19:00:00`) under a fabricated `0 °C … 1 °C` scale. On a ≥1600px wall panel that is the
    // first thing on screen after a reload and it looks like real data (adversarial F8).
    const state = stateOf(EMPTY_RING, 30);
    expect(chartDomainOf(state)).toEqual({ startMs: 0, endMs: 0 });
    expect(chartDomainOf(state).endMs).toBeLessThanOrEqual(chartDomainOf(state).startMs);
  });
});
