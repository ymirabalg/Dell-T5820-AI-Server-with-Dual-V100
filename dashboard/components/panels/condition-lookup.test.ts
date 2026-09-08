import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import type { DisplayedCondition } from '@/lib/conditions';
import { codeOnly, projectRoot } from '@/lib/source-text';

import { findDisplayed, staleAgeNote, staleValueOr } from './condition-lookup';

/**
 * ⚠ Load-bearing: `staleAgeNote` reproduces `app/dashboard-shell.tsx`'s `staleAgeText`
 * byte-for-byte (S-B, ruled 2026-09-08 — "the banner and the row use the same words"). A
 * panel and the banner disagreeing about this sentence is the exact failure `HANDOVER.md`
 * §0.3 point 3 records for `since 15:10:40` vs `since 15:10:40 EDT`.
 */

const conditionAt = (overrides: Partial<DisplayedCondition> = {}): DisplayedCondition => ({
  kind: 'fan5_absolute',
  subject: null,
  id: 'fan5_absolute',
  label: 'fan 5',
  value: '4,308 RPM',
  severity: 'normal',
  displaySeverity: 'normal',
  declaredStanding: false,
  suppressed: false,
  banner: false,
  sinceMs: 0,
  stale: false,
  lastSeenMs: 0,
  enumeration: null,
  ...overrides,
});

describe('findDisplayed', () => {
  test('finds a condition by its exact id', () => {
    const c = conditionAt({ id: 'unit:gpu-fan-control.service' });
    expect(findDisplayed([c], 'unit:gpu-fan-control.service')).toBe(c);
  });

  test('returns undefined for an id the session has never confirmed', () => {
    expect(findDisplayed([conditionAt()], 'unit:llama-server@1.service')).toBeUndefined();
  });
});

describe('⚠ staleAgeNote', () => {
  test("renders S-B's exact wording — last read 6:12 ago", () => {
    // 6:12 = 372 000 ms.
    const c = conditionAt({ stale: true, lastSeenMs: 1_000 });
    expect(staleAgeNote(c, 1_000 + 372_000)).toBe('last read 6:12 ago');
  });

  test('a non-stale condition never gets an age note, however old lastSeenMs is', () => {
    const c = conditionAt({ stale: false, lastSeenMs: 0 });
    expect(staleAgeNote(c, 999_999)).toBeNull();
  });

  test('an id with no confirmed condition renders no note — the ordinary pre-first-poll case', () => {
    expect(staleAgeNote(undefined, 1_000)).toBeNull();
  });

  test('⚠ the age is measured from lastSeenMs, not from sinceMs', () => {
    // If this ever collapsed onto `sinceMs`, a condition confirmed long ago but read again
    // recently would report a stale age of "how long since it was CONFIRMED" instead of "how
    // long since it was last SEEN" — the exact distinction §6.5 draws between the two clocks.
    const c = conditionAt({ stale: true, sinceMs: 0, lastSeenMs: 500_000 });
    expect(staleAgeNote(c, 501_000)).toBe('last read 1 s ago');
  });
});

describe("⚠ staleValueOr — §6.5's other half", () => {
  test("⚠ a stale condition's LAST VALUE replaces the em dash the current reading renders", () => {
    // §6.5, in bold: *"A stale condition shows its LAST VALUE, unchanged — not an em dash."*
    // `components/alarm-banner.tsx` renders `lead.value` for the same condition in the same
    // frame, so without this the banner and the row printed two different numbers for one
    // condition (10b-reconcile, adversarial F4).
    expect(staleValueOr(conditionAt({ stale: true }), '—')).toBe('4,308 RPM');
  });

  test('a NON-stale condition never substitutes anything', () => {
    expect(staleValueOr(conditionAt({ stale: false }), '—')).toBe('—');
  });

  test('⚠ a present current reading always wins — "unchanged" is about a value nobody could re-read', () => {
    expect(staleValueOr(conditionAt({ stale: true }), '4,144 RPM')).toBe('4,144 RPM');
  });

  test('an id the session never confirmed leaves the reading alone', () => {
    expect(staleValueOr(undefined, '—')).toBe('—');
  });
});

describe("⚠ S-B — the two copies of the stale sentence cannot drift apart unnoticed", () => {
  /**
   * ⚠ The gap this closes, measured: the adversarial reworded `condition-lookup.ts`'s template
   * to `last seen …` and updated the six panel-side tests that assert the literal — exactly the
   * diff a maintainer rewording S-B inside 10b's file scope would produce — and the ENTIRE
   * SUITE stayed green at 2483/2483 with the panels saying "last seen 6:12 ago" and the banner
   * saying "last read 6:12 ago", live, on the same page, for the same condition. The two
   * behavioural tests (this file's, and `dashboard-shell.test.tsx`'s) each pin their own file's
   * wording; nothing pinned them to EACH OTHER but a doc comment.
   *
   * A source-text guard is the right shape here and not a substitute for behaviour: both
   * sentences are already asserted behaviourally, so this only has to say they are the same
   * sentence. It needs no change to `app/dashboard-shell.tsx`, which is 10a's committed file.
   */
  const sentenceIn = (relativePath: string): string => {
    const text = codeOnly(readFileSync(join(projectRoot, relativePath), 'utf8'));
    const match = /`(last [^`]*ago)`/.exec(text);
    expect(match, `no stale-age template literal found in ${relativePath}`).not.toBeNull();
    return match?.[1] ?? '';
  };

  test('⚠ condition-lookup.ts and app/dashboard-shell.tsx spell it identically', () => {
    const panelSide = sentenceIn('components/panels/condition-lookup.ts');
    const bannerSide = sentenceIn('app/dashboard-shell.tsx');
    // Variable names differ between the two files and never reach the rendered string, so the
    // comparison is on the sentence with the interpolations normalised away.
    const shape = (s: string): string => s.replace(/\$\{[^}]*\}/g, '${AGE}');
    expect(shape(panelSide)).toBe(shape(bannerSide));
    // And it is still the sentence S-B ruled on, in both.
    expect(shape(panelSide)).toBe('last read ${AGE} ago');
  });
});
