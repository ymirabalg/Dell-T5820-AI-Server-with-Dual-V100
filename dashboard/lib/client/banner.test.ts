import { describe, expect, test } from 'vitest';

import type { DisplayedCondition } from '../conditions';
import { conditionId } from '../conditions';
import { EMPTY_BANNER, bannerView } from './banner';

/**
 * §6.4: "Multiple conditions collapse into one banner with a count." §9: "Watch-level
 * conditions colour their cell and never raise a banner." These tests build
 * {@link DisplayedCondition} fixtures by hand rather than driving `observePoll` — the ledger
 * and the debounce are `lib/conditions.test.ts`'s job; this file only exercises the reduction
 * `bannerView` adds on top of an already-confirmed list.
 *
 * `id` is a `ConditionId` (`ConditionKind | \`${ConditionKind}:${string}\``), not a bare
 * string, so every distinct test id below goes through {@link conditionId} on the
 * non-singleton `disk_free` kind rather than an arbitrary literal — `bannerView` never reads
 * `kind`/`subject` itself, only `id`/`label`/`value`/`sinceMs`/`banner`.
 */

let counter = 0;

/** A distinct, validly-shaped `ConditionId` for a test that only cares that ids differ. */
const id = (subject: string) => conditionId('disk_free', subject);

/** A minimal, valid `DisplayedCondition` — override only what a test cares about. */
const condition = (over: Partial<DisplayedCondition> = {}): DisplayedCondition => {
  counter += 1;
  return {
    kind: 'disk_free',
    subject: `fixture-${counter}`,
    id: id(`fixture-${counter}`),
    label: 'CPU temperature',
    value: '82 °C',
    severity: 'alarm',
    displaySeverity: 'alarm',
    declaredStanding: false,
    suppressed: false,
    banner: true,
    sinceMs: 1_000,
    stale: false,
    lastSeenMs: 1_000,
    enumeration: null,
    ...over,
  };
};

describe('no alarm-level condition', () => {
  test('⚠ an empty list produces the shared EMPTY_BANNER — count 0, no lead', () => {
    expect(bannerView([])).toBe(EMPTY_BANNER);
  });

  test('⚠ a watch-level condition never leads or counts, even alone in the list', () => {
    const watch = condition({ id: id('a'), banner: false, displaySeverity: 'watch' });
    expect(bannerView([watch])).toEqual(EMPTY_BANNER);
  });
});

describe('one alarm-level condition', () => {
  test('leads, and the rest list is empty', () => {
    const only = condition({ id: id('gpu-0-temp'), label: 'GPU 0 temperature', value: '82 °C' });
    const view = bannerView([only]);
    expect(view.count).toBe(1);
    expect(view.lead).toEqual({
      id: id('gpu-0-temp'),
      label: 'GPU 0 temperature',
      value: '82 °C',
      sinceMs: 1_000,
      // ⚠ Carried, not dropped (F10) — §6.5 makes the banner name the age of a stale reading,
      // and this exact-match assertion is what proves the reduction hands the caller the two
      // fields it needs to. `toEqual` on the WHOLE object is deliberate: a field silently
      // dropped again would pass any subset assertion.
      stale: false,
      lastSeenMs: 1_000,
    });
    expect(view.rest).toEqual([]);
  });
});

describe('⚠ multiple alarm-level conditions collapse into one banner with a count', () => {
  test('⚠ the count is every banner-worthy condition, not just the lead', () => {
    const a = condition({ id: id('a'), sinceMs: 3_000 });
    const b = condition({ id: id('b'), sinceMs: 1_000 });
    const c = condition({ id: id('c'), sinceMs: 2_000 });
    const view = bannerView([a, b, c]);
    expect(view.count).toBe(3);
    expect(view.rest).toHaveLength(2);
  });

  test('⚠ the OLDEST-standing alarm leads, not the first in the input array', () => {
    const newest = condition({ id: id('newest'), sinceMs: 5_000 });
    const oldest = condition({ id: id('oldest'), sinceMs: 1_000 });
    const middle = condition({ id: id('middle'), sinceMs: 3_000 });
    // Deliberately NOT in sinceMs order, to prove the reduction sorts rather than trusts input.
    const view = bannerView([newest, middle, oldest]);
    expect(view.lead?.id).toBe(id('oldest'));
    expect(view.rest.map((r) => r.id)).toEqual([id('middle'), id('newest')]);
  });

  test('a suppressed standing alarm-level condition never has `banner: true`, so it is invisible here', () => {
    // §6.4: a standing condition "never raises the banner". `observePoll` is what sets
    // `banner: false` for a suppressed condition; this fixture asserts the CONSUMER side —
    // that `bannerView` trusts the flag rather than re-deriving suppression from `suppressed`.
    const suppressed = condition({ id: 'ufw_enforcing', kind: 'ufw_enforcing', subject: null, banner: false, suppressed: true });
    expect(bannerView([suppressed])).toEqual(EMPTY_BANNER);
  });
});

describe('a watch-level condition mixed with alarm-level ones', () => {
  test('⚠ is excluded from both the count and the rest list', () => {
    const watch = condition({ id: id('watch-one'), banner: false, displaySeverity: 'watch' });
    const alarm = condition({ id: id('alarm-one') });
    const view = bannerView([watch, alarm]);
    expect(view.count).toBe(1);
    expect(view.lead?.id).toBe(id('alarm-one'));
    expect(view.rest).toEqual([]);
  });
});

describe('deterministic tie-break', () => {
  test('two conditions confirmed at the identical sinceMs order by id', () => {
    const b = condition({ id: id('b'), sinceMs: 1_000 });
    const a = condition({ id: id('a'), sinceMs: 1_000 });
    const view = bannerView([b, a]);
    expect(view.lead?.id).toBe(id('a'));
  });
});

/**
 * ⚠ F10 — the `stale` axis had no fixture at all: `condition()` hard-coded `stale: false,
 * lastSeenMs: 1_000` and no test overrode either, which is the handoff's own warning ("stale
 * behaviour exists only as fixtures") landing exactly where it said it would.
 */
describe('⚠ §6.5 — a stale condition keeps counting AND carries the age of its reading', () => {
  test('⚠ a stale alarm still leads and still counts — staleness lowers nothing', () => {
    // §9: "Staleness never raises a severity and never lowers one." `observePoll` leaves
    // `banner: true`, so the archetype — GPU at 82 °C, then `nvidia-smi` dies — keeps pinning
    // the banner. What must not happen is it doing so while looking live.
    const stale = condition({ id: id('gpu-0-temp'), stale: true, sinceMs: 1_000, lastSeenMs: 2_000 });
    const view = bannerView([stale]);
    expect(view.count).toBe(1);
    expect(view.lead?.stale).toBe(true);
    expect(view.lead?.lastSeenMs).toBe(2_000);
  });

  test('⚠ `lastSeenMs` is distinct from `sinceMs` and neither is substituted for the other', () => {
    // The failure this guards is a plausible one-line "fix": naming the age from `sinceMs`,
    // which is when the BAND was first confirmed, not when it was last observed. On the
    // archetype those differ by the whole outage.
    const stale = condition({ id: id('a'), stale: true, sinceMs: 1_000, lastSeenMs: 9_000 });
    const lead = bannerView([stale]).lead;
    expect(lead?.sinceMs).toBe(1_000);
    expect(lead?.lastSeenMs).toBe(9_000);
  });

  test('⚠ a live condition reports `stale: false`, so the two cases are distinguishable', () => {
    expect(bannerView([condition({ id: id('a') })]).lead?.stale).toBe(false);
  });
});
