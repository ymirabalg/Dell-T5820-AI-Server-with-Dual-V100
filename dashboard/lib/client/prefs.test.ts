/**
 * §6.7's preferences: the two keys, the closed option lists, and the three ways storage
 * fails.
 *
 * The property under test throughout is §6.7's last clause — *"a private window with storage
 * blocked must render a correct dashboard"* — so every failure path is asserted to produce
 * **the defaults**, and the write path is asserted on **what was written**, never on what the
 * writer returned. HANDOVER: "every `catch` added for a *never throw* rule removes a
 * distinction … the fix was to assert what was *written*, not what was *returned*."
 */

import { describe, expect, test } from 'vitest';

import { MemoryStorage, ThrowingStorage } from './fake-env';
import {
  CADENCE_KEY,
  CADENCE_SECONDS,
  DEFAULT_CADENCE_SECONDS,
  DEFAULT_WINDOW_MINUTES,
  DEFAULT_PREFERENCES,
  LONGEST_WINDOW_MS,
  WINDOW_KEY,
  WINDOW_MINUTES,
  cadenceMs,
  readCadenceSeconds,
  readPreferences,
  readWindowMinutes,
  windowMs,
  writeCadenceSeconds,
  writeWindowMinutes,
} from './prefs';

describe('§6.2 fixes the option lists and the defaults', () => {
  test('⚠ the cadence selector offers 1/2/5/10/30 s and defaults to 5', () => {
    expect(CADENCE_SECONDS).toEqual([1, 2, 5, 10, 30]);
    expect(DEFAULT_CADENCE_SECONDS).toBe(5);
  });

  test('⚠ the window selector offers 10 min / 30 min / 2 h and defaults to 30', () => {
    expect(WINDOW_MINUTES).toEqual([10, 30, 120]);
    expect(DEFAULT_WINDOW_MINUTES).toBe(30);
  });

  test('⚠ §6.7’s two keys are spelled aid.cadence and aid.window', () => {
    expect(CADENCE_KEY).toBe('aid.cadence');
    expect(WINDOW_KEY).toBe('aid.window');
  });

  test('cadence and window convert to the units the runtime schedules and draws in', () => {
    expect(cadenceMs(1)).toBe(1000);
    expect(cadenceMs(30)).toBe(30_000);
    expect(windowMs(10)).toBe(600_000);
    expect(windowMs(120)).toBe(7_200_000);
  });

  /*
   * ⚠ §6.7's ring cap is justified against this number — "the worst case the selectors allow
   * is 2 h at 1 s = 7200" — so if a fourth window were added without moving the cap, this is
   * the assertion that would notice.
   */
  test('⚠ the longest window the selectors allow is two hours', () => {
    expect(LONGEST_WINDOW_MS).toBe(7_200_000);
    expect(LONGEST_WINDOW_MS / cadenceMs(1)).toBe(7200);
  });
});

describe('reading a stored preference', () => {
  test('a stored option is used', () => {
    const storage = new MemoryStorage({ 'aid.cadence': '1', 'aid.window': '120' });
    expect(readPreferences(storage)).toEqual({ cadenceSeconds: 1, windowMinutes: 120 });
  });

  test('an absent key falls back', () => {
    expect(readPreferences(new MemoryStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  /*
   * ⚠ Every row here is a **near-miss of a real option that is not the default** — `' 1 '`,
   * not `' 5 '`. A lenient parse turns each of them into 1, and 1 ≠ 5, so the assertion can
   * tell the two implementations apart. Written the other way round the rows were *inert*:
   * `Number(' 5 ')` is 5 and the fallback is also 5, so a `Number()`-based parser passed a
   * table that named it. The ledger caught it, which is exactly what the ledger is for.
   */
  test.each([
    ['not a number', 'ninety'],
    ['not an option', '7'],
    ['an option with whitespace', ' 1 '],
    ['an option written as a float', '1.0'],
    ['an option written with a sign', '+1'],
    ['an option in hexadecimal', '0x1'],
    ['empty', ''],
  ])('⚠ a cadence that is not one of §6.2’s options falls back — %s', (_name, stored) => {
    expect(readCadenceSeconds(new MemoryStorage({ 'aid.cadence': stored }))).toBe(5);
  });

  test.each([
    ['not an option', '45'],
    ['zero', '0'],
    ['a float', '10.0'],
    ['whitespace around an option', ' 10 '],
  ])('⚠ a window that is not one of §6.2’s options falls back — %s', (_name, stored) => {
    expect(readWindowMinutes(new MemoryStorage({ 'aid.window': stored }))).toBe(30);
  });

  /*
   * §5.1's fixture symmetry, on the option list rather than on a comparison: `'30'` is inside
   * it and `'45'` is outside, and they differ at a panel — one changes what a trace covers,
   * the other must not.
   */
  test('a valid neighbour of an invalid value is still accepted', () => {
    expect(readWindowMinutes(new MemoryStorage({ 'aid.window': '30' }))).toBe(30);
    expect(readWindowMinutes(new MemoryStorage({ 'aid.window': '45' }))).toBe(30);
    expect(readWindowMinutes(new MemoryStorage({ 'aid.window': '10' }))).toBe(10);
  });
});

describe('⚠ §6.7: storage that is blocked must not stop the dashboard rendering', () => {
  /*
   * ⚠ The three failures §6.7 lumps together, kept apart here because they arrive by
   * different doors: no storage object at all (the property access threw at construction),
   * a storage object whose methods throw, and a storage object that simply has nothing.
   */
  /*
   * No ⚠, for the same reason as the null write below: narrowing `PrefStorage | null` before
   * `.getItem` is what the compiler requires, so weakening it is a `tsc` error rather than a
   * behaviour change. Covered by the harness's `P12` as a `types` mutation.
   */
  test('no storage object at all yields the defaults', () => {
    expect(readPreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  test('⚠ a storage whose getItem throws yields the defaults rather than propagating', () => {
    const storage = new ThrowingStorage();
    expect(() => readPreferences(storage)).not.toThrow();
    expect(readPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });

  test('⚠ a storage whose setItem throws swallows it, and the caller carries on', () => {
    const storage = new ThrowingStorage();
    expect(() => {
      writeCadenceSeconds(storage, 30);
      writeWindowMinutes(storage, 120);
    }).not.toThrow();
  });
});

describe('writing a preference', () => {
  /*
   * ⚠ Asserted on the WRITE, not on a return value — the whole point of HANDOVER's note that
   * a `catch` added for a "never throw" rule erases the distinction between a write that
   * landed and one that did not. `writeCadenceSeconds` returns `void` on purpose; the only
   * evidence it did anything is the storage.
   */
  test('⚠ the cadence is written to aid.cadence as a bare decimal', () => {
    const storage = new MemoryStorage();
    writeCadenceSeconds(storage, 10);
    expect(storage.writes).toEqual([['aid.cadence', '10']]);
    expect(readCadenceSeconds(storage)).toBe(10);
  });

  test('⚠ the window is written to aid.window as a bare decimal', () => {
    const storage = new MemoryStorage();
    writeWindowMinutes(storage, 120);
    expect(storage.writes).toEqual([['aid.window', '120']]);
    expect(readWindowMinutes(storage)).toBe(120);
  });

  /*
   * No ⚠, deliberately. There is no *runtime* wrong implementation of "do not write to a
   * storage that is not there": narrowing `PrefStorage | null` before `.setItem` is required
   * by the compiler, and weakening the narrowing is a `tsc` error rather than a behaviour
   * change — because the `try`/`catch` §6.7 requires would swallow the `TypeError` that
   * followed. HANDOVER's rule: drop the ⚠ rather than the standard, and say why.
   * The harness's `P9` covers it as a `types` mutation instead.
   */
  test('writing with no storage at all is a no-op rather than a throw', () => {
    expect(() => {
      writeCadenceSeconds(null, 2);
      writeWindowMinutes(null, 10);
    }).not.toThrow();
  });

  test('the two keys do not collide', () => {
    const storage = new MemoryStorage();
    writeCadenceSeconds(storage, 2);
    writeWindowMinutes(storage, 10);
    expect(readPreferences(storage)).toEqual({ cadenceSeconds: 2, windowMinutes: 10 });
  });
});
