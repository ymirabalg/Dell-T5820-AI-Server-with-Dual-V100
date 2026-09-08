import { describe, expect, test } from 'vitest';

import { SERIES_COLORS, SERIES_STYLES } from './palette';

/**
 * Pins §9's three literal hex values and its one dash assignment. There is no computation
 * here to test — the whole risk is a typo drifting away from the spec's own text — so this
 * is a values-equal-literals fixture rather than a property test.
 */
describe('§9’s series colours, pinned', () => {
  test('⚠ the three hex values match §9 exactly', () => {
    expect(SERIES_COLORS.gpu0).toBe('#3987e5');
    expect(SERIES_COLORS.gpu1).toBe('#199e70');
    expect(SERIES_COLORS.fan5).toBe('#d95926');
  });

  test('⚠ GPU 1 is the only dashed series', () => {
    expect(SERIES_STYLES.gpu0.dashed).toBe(false);
    expect(SERIES_STYLES.gpu1.dashed).toBe(true);
    expect(SERIES_STYLES.fan5.dashed).toBe(false);
  });

  test('every style carries its own colour, not a shared default', () => {
    expect(SERIES_STYLES.gpu0.color).toBe(SERIES_COLORS.gpu0);
    expect(SERIES_STYLES.gpu1.color).toBe(SERIES_COLORS.gpu1);
    expect(SERIES_STYLES.fan5.color).toBe(SERIES_COLORS.fan5);
  });
});
