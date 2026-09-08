import { describe, expect, test } from 'vitest';

import { panelChip } from './panel-chip';

describe('§6.2 — panelChip, ruled 2026-09-08 (10b-S-F)', () => {
  // ⚠ The three cases the ruling is actually about. Named individually rather than
  // `test.each`-d together because the third is the one a careless implementation breaks, and a
  // reader should be able to see it fail on its own rather than as one row of a table.
  test('⚠ normal + a null reading → NO BAND (the finding: MEMORY with RAM —/— and healthy swap)', () => {
    expect(panelChip('normal', null)).toBeNull();
  });

  test('⚠ normal + no nulls → normal (the downgrade never fires on a clean read)', () => {
    expect(panelChip('normal', 'normal')).toBe('normal');
  });

  test('⚠ alarm + a null reading → STILL ALARM — the rejected alternative, and the ruling’s whole point', () => {
    // "A red GPU stays red with an unreadable SM clock." A careless implementation that bails
    // out the moment it sees ANY null — rather than checking the null only when the worst band
    // turns out to be 'normal' — would turn this alarm into no band too.
    expect(panelChip('alarm', null)).toBe('alarm');
  });

  // Not ⚠: the mirror of the alarm case, same reasoning, not the one a careless fix breaks.
  test('watch + a null reading → still watch', () => {
    expect(panelChip('watch', null)).toBe('watch');
  });

  test('every reading null → no band, same as worstSeverity — nothing to downgrade FROM', () => {
    expect(panelChip(null, null)).toBeNull();
  });

  test('no readings at all → no band', () => {
    expect(panelChip()).toBeNull();
  });

  test('the worst of several non-null readings still wins ordinarily', () => {
    expect(panelChip('normal', 'watch', 'alarm')).toBe('alarm');
    expect(panelChip('normal', 'watch')).toBe('watch');
  });

  test('a single null reading alone is no band, not normal', () => {
    expect(panelChip(null)).toBeNull();
  });
});
