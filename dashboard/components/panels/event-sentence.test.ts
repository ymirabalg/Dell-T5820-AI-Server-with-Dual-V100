import { describe, expect, test } from 'vitest';

import type { LogEntry } from '@/lib/client/events';

import { describeEvent } from './event-sentence';

/**
 * `lib/client/events.ts`'s own module doc: "a `LogEntry` carries the FACTS … and step 10
 * writes the sentence." This is that sentence, tested against every {@link LogEntryKind}.
 */

const entryOf = (overrides: Partial<LogEntry>): LogEntry => ({
  seq: 0,
  atMs: 0,
  source: 'gpu 0',
  severity: 'normal',
  id: null,
  label: 'GPU 0 temperature',
  kind: 'band',
  from: null,
  to: 'normal',
  detail: '80 °C',
  ...overrides,
});

describe('describeEvent — every LogEntryKind', () => {
  test('page-loaded', () => {
    expect(describeEvent(entryOf({ kind: 'page-loaded', label: 'page loaded', to: 'loaded' }))).toBe(
      'page loaded',
    );
  });

  test('⚠ a first sighting (from === null) omits the transition arrow entirely', () => {
    expect(
      describeEvent(entryOf({ kind: 'band', from: null, to: 'watch', detail: '75 °C' })),
    ).toBe('GPU 0 temperature 75 °C');
  });

  test('⚠ a transition (from !== null) names both bands it moved between', () => {
    expect(
      describeEvent(
        entryOf({ kind: 'band', from: 'normal', to: 'watch', detail: '75 °C' }),
      ),
    ).toBe('GPU 0 temperature 75 °C (normal → watch)');
  });

  test('⚠ standing carries the same shape as band, plus a visible "standing" marker', () => {
    const band = describeEvent(entryOf({ kind: 'band', from: 'normal', to: 'alarm', detail: 'no' }));
    const standing = describeEvent(
      entryOf({ kind: 'standing', from: 'normal', to: 'alarm', detail: 'no' }),
    );
    expect(standing).toBe(`${band} · standing`);
  });

  test('source-lost with a detail message', () => {
    expect(
      describeEvent(
        entryOf({ kind: 'source-lost', label: 'nvidia-smi', detail: 'exit 6', from: 'answering', to: 'lost' }),
      ),
    ).toBe('nvidia-smi stopped answering — exit 6');
  });

  test('⚠ source-lost with no detail omits the dangling " — "', () => {
    expect(
      describeEvent(
        entryOf({ kind: 'source-lost', label: 'nvidia-smi', detail: '', from: 'answering', to: 'lost' }),
      ),
    ).toBe('nvidia-smi stopped answering');
  });

  test('source-recovered', () => {
    expect(
      describeEvent(entryOf({ kind: 'source-recovered', label: 'nvidia-smi', from: 'lost', to: 'answering' })),
    ).toBe('nvidia-smi answering again');
  });

  test('stale', () => {
    expect(
      describeEvent(entryOf({ kind: 'stale', label: 'GPU 0 temperature', from: 'watch', to: 'stale', detail: '75 °C' })),
    ).toBe('GPU 0 temperature stale — last value 75 °C');
  });

  test('⚠ retired names the band it left; a never-confirmed retirement omits the parenthetical', () => {
    expect(describeEvent(entryOf({ kind: 'retired', from: 'normal', to: 'retired' }))).toBe(
      'GPU 0 temperature retired (was normal)',
    );
    expect(describeEvent(entryOf({ kind: 'retired', from: null, to: 'retired' }))).toBe(
      'GPU 0 temperature retired',
    );
  });

  test('reading-returned', () => {
    expect(
      describeEvent(entryOf({ kind: 'reading-returned', from: 'stale', to: 'normal', detail: '65 °C' })),
    ).toBe('GPU 0 temperature reading returned — 65 °C');
  });

  test('conflict', () => {
    expect(
      describeEvent(
        entryOf({
          kind: 'conflict',
          label: 'unit:gpu-fan-control.service',
          detail: 'two panels disagreed; the worse severity was kept',
        }),
      ),
    ).toBe('unit:gpu-fan-control.service: two panels disagreed; the worse severity was kept');
  });

  test('mode-stale with a reason', () => {
    expect(
      describeEvent(
        entryOf({ kind: 'mode-stale', label: 'dashboard', from: 'live', to: 'stale', detail: 'the request seam threw' }),
      ),
    ).toBe('dashboard stale — the request seam threw');
  });

  test('⚠ mode-stale with no reason omits the dangling " — "', () => {
    expect(
      describeEvent(entryOf({ kind: 'mode-stale', label: 'dashboard', from: 'live', to: 'stale', detail: '' })),
    ).toBe('dashboard stale');
  });

  test('mode-current', () => {
    expect(
      describeEvent(entryOf({ kind: 'mode-current', label: 'dashboard', from: 'stale', to: 'live' })),
    ).toBe('dashboard live again');
  });
});

describe('⚠ every branch that appends an em-dashed detail guards an EMPTY detail', () => {
  // `source-lost` and `mode-stale` were written that way; `stale` and `reading-returned` were
  // not, and ended their sentence with a dangling `— ` (10b-reconcile, adversarial F14). Not a
  // live defect — the adversarial could not construct an empty detail from `events.ts` — but
  // `describeEvent` is a total function of an ENTRY, not of what `events.ts` emits this month,
  // and the inconsistency is what makes the next reader guess which branches are safe.
  test('⚠ a stale entry with no detail never ends in a dangling dash', () => {
    expect(describeEvent(entryOf({ kind: 'stale', label: 'fan 5', detail: '' }))).toBe('fan 5 stale');
  });

  test('a stale entry WITH a detail still names the last value', () => {
    expect(describeEvent(entryOf({ kind: 'stale', label: 'fan 5', detail: '4,308 RPM' }))).toBe(
      'fan 5 stale — last value 4,308 RPM',
    );
  });

  test('⚠ a reading-returned entry with no detail never ends in a dangling dash', () => {
    expect(describeEvent(entryOf({ kind: 'reading-returned', label: 'fan 5', detail: '' }))).toBe(
      'fan 5 reading returned',
    );
  });
});
