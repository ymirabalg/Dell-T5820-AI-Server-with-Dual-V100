/**
 * §6.7's preferences — `aid.cadence` and `aid.window` in `localStorage`.
 *
 * §6.7, in full: *"Preferences live in `localStorage` — `aid.cadence`, `aid.window`. Every
 * read and write is wrapped in `try/catch`, and any failure falls back to the defaults
 * silently; a private window with storage blocked must render a correct dashboard."*
 *
 * ### ⚠ Three ways `localStorage` fails, and only one of them is `null`
 *
 * 1. **The key is absent** — `getItem` returns `null`. First visit.
 * 2. **The value is not one of §6.2's options** — a hand-edited value, or a preference
 *    written by an older build. Falls back, silently.
 * 3. **The accessor itself throws.** Safari with *Block all cookies*, a `file://` document,
 *    and Chrome's *Block third-party cookies* in an iframe all make the **property access**
 *    `window.localStorage` throw a `SecurityError` — before `getItem` is ever reached. A
 *    private window can also throw from `setItem` on quota. That is why the seam here is a
 *    *nullable* {@link PrefStorage} and why every call is wrapped: neither the getter nor
 *    the method can be trusted.
 *
 * All three land on the same defaults, which is what §6.7 asks for.
 *
 * ### The stored representation
 *
 * ⚠ §6.7 names the two keys and nothing else, so the encoding is this project's choice:
 * **the number of seconds / minutes, as a bare decimal integer string** — `'5'`, `'30'`.
 * The parse is exact (`/^(?:0|[1-9][0-9]*)$/`, no leading `+`, no whitespace, no `5.0`),
 * then checked against §6.2's closed option list. Anything else is case 2 above. Recorded
 * in the step notes as a decision rather than a gap: nothing outside this browser can
 * observe it, and a value that fails to parse is required to fall back silently anyway.
 *
 * Nothing here reads a clock or a global. `readPreferences(null)` is the whole of the
 * storage-blocked path, and it is a real fixture rather than a mock.
 */

/** §6.7's key for the cadence selector. */
export const CADENCE_KEY = 'aid.cadence';

/** §6.7's key for the window selector. */
export const WINDOW_KEY = 'aid.window';

/** §6.2's cadence selector: "1/2/5/10/30 s, default 5". */
export const CADENCE_SECONDS = [1, 2, 5, 10, 30] as const;

/** §6.2's window selector: "10 min / 30 min / 2 h, default 30". */
export const WINDOW_MINUTES = [10, 30, 120] as const;

/** One of §6.2's five cadences. */
export type CadenceSeconds = (typeof CADENCE_SECONDS)[number];

/** One of §6.2's three windows. */
export type WindowMinutes = (typeof WINDOW_MINUTES)[number];

/** §6.2: "the cadence selector (1/2/5/10/30 s, **default 5**)". */
export const DEFAULT_CADENCE_SECONDS: CadenceSeconds = 5;

/** §6.2: "the window selector (10 min / 30 min / 2 h, **default 30**)". */
export const DEFAULT_WINDOW_MINUTES: WindowMinutes = 30;

/**
 * The longest window a selector can ask for, in ms — 2 h.
 *
 * ⚠ This is the number §6.7's ring cap is *above*: "The worst case the selectors allow is
 * 2 h at 1 s = 7200; the cap sits deliberately above that." Derived from
 * {@link WINDOW_MINUTES} rather than written twice, so adding a window moves both.
 */
export const LONGEST_WINDOW_MS = Math.max(...WINDOW_MINUTES) * 60_000;

/**
 * The half of `Storage` this module uses.
 *
 * Structural, and **nullable at the call site**: `window.localStorage` is a property access
 * that can itself throw, so the adapter answers `null` rather than handing over a getter
 * that explodes later (see `env.ts`).
 */
export interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** §6.2's two selectors, as the runtime holds them. */
export interface Preferences {
  readonly cadenceSeconds: CadenceSeconds;
  readonly windowMinutes: WindowMinutes;
}

/** The dashboard a browser with no usable storage renders — §6.7's "correct dashboard". */
export const DEFAULT_PREFERENCES: Preferences = {
  cadenceSeconds: DEFAULT_CADENCE_SECONDS,
  windowMinutes: DEFAULT_WINDOW_MINUTES,
};

/** A bare decimal integer. `' 5'`, `'+5'`, `'5.0'` and `'0x5'` are all refused. */
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;

/**
 * Read one key and match it against a closed option list.
 *
 * ⚠ The `try` wraps `getItem` **and** the parse, because §6.7 asks for a correct dashboard
 * whatever storage does, and a `Storage` proxy can throw from either.
 */
const readOption = <T extends number>(
  storage: PrefStorage | null,
  key: string,
  options: readonly T[],
  fallback: T,
): T => {
  if (storage === null) return fallback;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return fallback;
  }
  if (raw === null || !DECIMAL.test(raw)) return fallback;
  const value = Number(raw);
  return options.find((option) => option === value) ?? fallback;
};

/**
 * Write one key, and say nothing if storage refuses.
 *
 * ⚠ Returns `void` deliberately: a caller that branched on "did the write land" would be
 * the beginning of a second source of truth for a preference whose only job is to survive a
 * reload. The tests assert **what was written**, not what this returned — HANDOVER's lesson
 * that "every `catch` added for a *never throw* rule removes a distinction", and that the
 * fix is to assert the write rather than the return value.
 */
const writeOption = (storage: PrefStorage | null, key: string, value: number): void => {
  if (storage === null) return;
  try {
    storage.setItem(key, String(value));
  } catch {
    // Quota, a private window, a blocked origin. §6.7: fall back silently.
  }
};

/** §6.7's `aid.cadence`, or 5 s. */
export const readCadenceSeconds = (storage: PrefStorage | null): CadenceSeconds =>
  readOption(storage, CADENCE_KEY, CADENCE_SECONDS, DEFAULT_CADENCE_SECONDS);

/** §6.7's `aid.window`, or 30 min. */
export const readWindowMinutes = (storage: PrefStorage | null): WindowMinutes =>
  readOption(storage, WINDOW_KEY, WINDOW_MINUTES, DEFAULT_WINDOW_MINUTES);

/** Both selectors, as one read. */
export const readPreferences = (storage: PrefStorage | null): Preferences => ({
  cadenceSeconds: readCadenceSeconds(storage),
  windowMinutes: readWindowMinutes(storage),
});

/** Persist the cadence selector. */
export const writeCadenceSeconds = (
  storage: PrefStorage | null,
  value: CadenceSeconds,
): void => {
  writeOption(storage, CADENCE_KEY, value);
};

/** Persist the window selector. */
export const writeWindowMinutes = (
  storage: PrefStorage | null,
  value: WindowMinutes,
): void => {
  writeOption(storage, WINDOW_KEY, value);
};

/** §6.2's cadence, as the poll interval the runtime schedules. */
export const cadenceMs = (seconds: CadenceSeconds): number => seconds * 1000;

/** §6.2's window, as the span of time a trace covers. */
export const windowMs = (minutes: WindowMinutes): number => minutes * 60_000;
