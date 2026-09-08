import { describe, expect, test } from 'vitest';

import { aggregateStatus } from './header-status';
import type { RuntimeMode } from './mode';

/**
 * ⚠ `severity` is the third argument as of 10a's reconciliation (adversarial F5): §9 makes the
 * dot and the count ONE reduction, and a `(mode, alarms)` signature made that impossible to
 * honour — `severity === null` with `alarms === 0` put a grey "no band" dot beside the words
 * "all healthy". Most cases below pass `'normal'` because they are about the mode/count axis;
 * the null axis has its own describe block at the end.
 */
const BANDED = 'normal' as const;

/**
 * §6.2/§9: *"paused shows mode **and** alarm count"* — half of `PLAN.md`'s green criterion
 * for step 10, and one of the two things a draft has already gotten wrong (per the handoff).
 * Every test in this file is ⚠: there is no part of this function that is not load-bearing.
 */

describe('⚠ the count is omitted at zero, in every mode', () => {
  test('⚠ live + zero alarms renders "all healthy", never "0 alarms"', () => {
    expect(aggregateStatus('live', 0, BANDED)).toEqual({ glyph: '●', text: 'all healthy' });
  });

  test('⚠ paused + zero alarms renders bare "paused", never "paused · 0 alarms"', () => {
    const { text } = aggregateStatus('paused', 0, BANDED);
    expect(text).toBe('paused');
    expect(text).not.toContain('0');
  });

  test('⚠ stale + zero alarms renders bare "stale", never "stale · 0 alarms"', () => {
    const { text } = aggregateStatus('stale', 0, BANDED);
    expect(text).toBe('stale');
    expect(text).not.toContain('0');
  });
});

describe('⚠ paused and stale show the mode ALONGSIDE the count, never instead of it', () => {
  test('⚠ paused with alarms keeps both the word "paused" and the count', () => {
    const { text } = aggregateStatus('paused', 6, BANDED);
    expect(text).toBe('paused · 6 alarms');
    expect(text).toContain('paused');
    expect(text).toContain('6');
  });

  test('⚠ stale with alarms keeps both the word "stale" and the count', () => {
    const { text } = aggregateStatus('stale', 6, BANDED);
    expect(text).toBe('stale · 6 alarms');
    expect(text).toContain('stale');
    expect(text).toContain('6');
  });

  test('a single alarm is singular: "1 alarm", not "1 alarms"', () => {
    expect(aggregateStatus('live', 1, BANDED).text).toBe('1 alarm');
    expect(aggregateStatus('paused', 1, BANDED).text).toBe('paused · 1 alarm');
  });
});

describe('⚠ the glyph names the MODE, never the severity', () => {
  test.each([
    ['live', '●'],
    ['paused', '❙❙'],
    ['stale', '⊘'],
  ] satisfies [RuntimeMode, string][])(
    '⚠ the aggregate glyph for mode %s is %s regardless of alarm count',
    (mode, glyph) => {
      expect(aggregateStatus(mode, 0, BANDED).glyph).toBe(glyph);
      expect(aggregateStatus(mode, 6, BANDED).glyph).toBe(glyph);
    },
  );

  test('⚠ paused and stale never share live’s dot glyph', () => {
    expect(aggregateStatus('paused', 0, BANDED).glyph).not.toBe('●');
    expect(aggregateStatus('stale', 0, BANDED).glyph).not.toBe('●');
  });
});

describe('expired — the terminal mode, no §6.2 wording to violate', () => {
  test('⚠ expired never mentions the alarm count, live or not', () => {
    const withAlarms = aggregateStatus('expired', 6, BANDED);
    expect(withAlarms.text).toBe('signed out');
    expect(withAlarms.text).not.toContain('6');
  });
});

describe('exhaustiveness — the guard a fifth RuntimeMode would trip', () => {
  test('all four modes produce a distinct glyph/text pairing', () => {
    const modes: RuntimeMode[] = ['live', 'paused', 'stale', 'expired'];
    const texts = modes.map((m) => aggregateStatus(m, 0, BANDED).text);
    expect(new Set(texts).size).toBe(modes.length);
  });
});

describe('⚠ F5 — the dot and the words are ONE reduction: `severity === null` never claims health', () => {
  test('⚠ live + zero alarms + no band renders "no readings", NOT "all healthy"', () => {
    // The state every page load passes through between hydration and the first poll landing
    // (`runtime.ts`'s initial state is `mode: 'live'`, `displayed: []`, `severity: null`,
    // `alarms: 0`), and the state §9 wrote its rule for: "null when there are no conditions at
    // all — not 'normal', which would claim health for a poll that produced nothing." The dot
    // beside this text is grey (`data-severity="none"`); the words may not disagree with it.
    const { glyph, text } = aggregateStatus('live', 0, null);
    expect(glyph).toBe('●');
    expect(text).toBe('no readings');
    expect(text).not.toContain('healthy');
  });

  test('⚠ live + zero alarms + a confirmed band still renders "all healthy"', () => {
    // The other side of the same guard — §6.2's own literal must survive the F5 fix.
    expect(aggregateStatus('live', 0, 'normal').text).toBe('all healthy');
  });

  test('⚠ a band with alarms is unaffected — the count still wins over both', () => {
    expect(aggregateStatus('live', 6, null).text).toBe('6 alarms');
    expect(aggregateStatus('live', 6, 'alarm').text).toBe('6 alarms');
  });

  test('⚠ paused and stale make no health claim, so a null band leaves them unchanged', () => {
    expect(aggregateStatus('paused', 0, null).text).toBe('paused');
    expect(aggregateStatus('stale', 0, null).text).toBe('stale');
    expect(aggregateStatus('expired', 0, null).text).toBe('signed out');
  });
});
