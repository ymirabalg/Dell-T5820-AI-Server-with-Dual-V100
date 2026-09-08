/**
 * Shared `RuntimeState` builders for the nine panels' test files. Not a `.test.ts` file, so
 * Vitest's `include` never runs it directly; every panel test imports from here rather than
 * re-deriving the same eleven-field object literal `panel-placeholder.test.tsx` and
 * `lib/client/series.test.ts` both write out by hand, for the same reason those two give: a
 * field added to `RuntimeState` has to be confronted at every call site that builds one.
 */

import type { DisplayedCondition } from '@/lib/conditions';
import { EMPTY_CONDITION_STATE } from '@/lib/conditions';
import { startEventLog } from '@/lib/client/events';
import { DEFAULT_CADENCE_SECONDS } from '@/lib/client/prefs';
import type { WindowMinutes } from '@/lib/client/prefs';
import { EMPTY_RING, appendSample } from '@/lib/client/ring';
import type { SampleRing } from '@/lib/client/ring';
import type { RuntimeState } from '@/lib/client/runtime';
import { nothingReadable } from '@/lib/fixtures';
import { isoTimestamp } from '@/lib/types';
import type { Gpu, ServingInstance, TelemetrySnapshot } from '@/lib/types';

export const BASE_MS = Date.UTC(2026, 8, 6, 14, 0, 0, 0);

/** A ring holding exactly one accepted sample: `snapshot`, stamped at `ms`. */
export const ringOf = (snapshot: TelemetrySnapshot, ms: number = BASE_MS): SampleRing =>
  appendSample(EMPTY_RING, {
    snapshot: { ...snapshot, ts: isoTimestamp(new Date(ms).toISOString()) },
    tsMs: ms,
  });

export interface StateOverrides {
  readonly windowMinutes?: WindowMinutes;
  readonly displayed?: readonly DisplayedCondition[];
  readonly unknownStanding?: readonly string[];
}

/** A full `RuntimeState`, exactly as `dashboard-shell.tsx` would hand it to a panel. */
export const stateOf = (ring: SampleRing, overrides: StateOverrides = {}): RuntimeState => ({
  preferences: { cadenceSeconds: DEFAULT_CADENCE_SECONDS, windowMinutes: overrides.windowMinutes ?? 30 },
  ring,
  conditions: EMPTY_CONDITION_STATE,
  displayed: overrides.displayed ?? [],
  events: startEventLog(BASE_MS),
  gaps: [],
  paused: false,
  hidden: false,
  consecutiveFailures: 0,
  lastFailure: null,
  mode: 'live',
  severity: null,
  alarms: 0,
  unknownStanding: overrides.unknownStanding ?? [],
});

/** The state before the first accepted poll — `latestSample` is `null`, the ring is empty. */
export const emptyState = (overrides: StateOverrides = {}): RuntimeState => stateOf(EMPTY_RING, overrides);

/** A `RuntimeState` carrying `snapshot` as its one and only sample. */
export const stateWith = (snapshot: TelemetrySnapshot, overrides: StateOverrides = {}): RuntimeState =>
  stateOf(ringOf(snapshot), overrides);

const conditionDefaults: DisplayedCondition = {
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
};

/** One `DisplayedCondition`, overridden as needed — the fixture every panel's stale test wants. */
export const displayedConditionOf = (overrides: Partial<DisplayedCondition>): DisplayedCondition => ({
  ...conditionDefaults,
  ...overrides,
});

/** A card the enumeration listed and every reading of which failed. Identity only. */
const gpuWithNoReadings = (index: number): Gpu => ({
  index,
  name: null,
  bus: null,
  tempC: null,
  powerW: null,
  powerCapW: null,
  memUsedMiB: null,
  memTotalMiB: null,
  utilPct: null,
  smClockMHz: null,
  throttleReasons: null,
});

/** An instance discovered from its env filename and nothing more (§3.4's nullability case). */
const instanceWithNoReadings = (instance: number): ServingInstance => ({
  instance,
  port: null,
  unitState: null,
  model: null,
  ctx: null,
  health: null,
});

/**
 * ⚠ **Every value cell in a rendered panel, in DOM order** — added 2026-09-08 by 10b's
 * reconciliation, and it is the fix for the finding at the centre of that loop.
 *
 * `Row`, `StatusRow` and `Meter` all render the reading itself into a `class="_value…"` span
 * (CSS-module class names are hashed, hence the prefix match), so this is *what the panel
 * actually printed as a reading* — as opposed to the whole document, which also contains the
 * head, the labels, the chart's tick labels and, decisively, `Chip`'s own no-band glyph.
 *
 * **That last one is why a document-wide `expect(html).toContain('—')` cannot test invariant 1.**
 * `chip.tsx:75` renders `EM_DASH` whenever `severity === null`, so the assertion is satisfied by
 * the chip beside a row no matter what the row's value cell says. `cooling-panel.test.tsx`'s
 * ⚠ test named *"fan5 reading null does not alarm"* passed with the panel printing
 * **`fan 5  0 RPM`** for a `dell_smm` that loaded and could not read the tach — invariant 1's
 * own example sentence, in the panel `PLAN.md` names, with the whole suite green.
 *
 * This is the THIRD document-wide `toContain` this project has found inert (10a's
 * `toContain('paused')`, its test phase's `toContain('refresh')`, now `toContain('—')`), so the
 * rule is worth stating rather than just the fix: **assert over the element that carries the
 * claim, never over the document that contains it.**
 */
export const valueCells = (html: string): string[] =>
  [...html.matchAll(/class="_value[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1] ?? '');

/**
 * ⚠ A snapshot whose COLLECTIONS were all read and whose every READING is `null` — the
 * mid-session single-sensor failure §6.5 calls normal, at full width.
 *
 * `lib/fixtures.ts`'s {@link nothingReadable} cannot serve here: its `gpus` and `serving` are
 * `null`, which sends the GPU and SERVING panels down their takeover branches instead of
 * through the rows the guard is about. This one keeps both enumerations populated with
 * identity-only members, so every panel renders its ordinary body with nothing in it.
 */
export const allReadingsNull: TelemetrySnapshot = {
  ...nothingReadable,
  gpus: [gpuWithNoReadings(0), gpuWithNoReadings(1)],
  serving: [instanceWithNoReadings(0), instanceWithNoReadings(1)],
  errors: [],
};
