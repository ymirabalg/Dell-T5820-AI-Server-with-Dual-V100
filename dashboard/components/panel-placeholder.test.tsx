import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EMPTY_CONDITION_STATE } from '@/lib/conditions';
import { startEventLog } from '@/lib/client/events';
import { DEFAULT_CADENCE_SECONDS, DEFAULT_WINDOW_MINUTES } from '@/lib/client/prefs';
import { EMPTY_RING } from '@/lib/client/ring';
import type { RuntimeState } from '@/lib/client/runtime';

import { PanelPlaceholder } from './panel-placeholder';

/**
 * The 10a/10b seam (see the component's own doc for the decision). This only proves the
 * placeholder does what it claims: the real title renders, the chip never claims a band it
 * has not earned, the placeholder text is visibly a placeholder rather than a value that could
 * be mistaken for a reading, and — since 10a's reconciliation (F16) — it really implements
 * `PanelProps`, carrying the `panelId` that is 10b's SVG-id namespace.
 */

/** A whole `RuntimeState`, written out rather than cast: `series.test.ts`'s precedent, and for
 *  its reason — a field added to the contract has to be confronted here rather than silently
 *  satisfied by a partial object. */
const STATE: RuntimeState = {
  preferences: { cadenceSeconds: DEFAULT_CADENCE_SECONDS, windowMinutes: DEFAULT_WINDOW_MINUTES },
  ring: EMPTY_RING,
  conditions: EMPTY_CONDITION_STATE,
  displayed: [],
  events: startEventLog(0),
  gaps: [],
  paused: false,
  hidden: false,
  consecutiveFailures: 0,
  lastFailure: null,
  mode: 'live',
  severity: null,
  alarms: 0,
  unknownStanding: [],
};

describe('the 10a/10b seam', () => {
  test('the real §6.2 title renders verbatim, casing included', () => {
    const html = renderToStaticMarkup(<PanelPlaceholder title="GPU 0" state={STATE} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('GPU 0');
  });

  test('⚠ the chip never claims a severity band it has not earned', () => {
    const html = renderToStaticMarkup(<PanelPlaceholder title="cooling" state={STATE} nowMs={0} panelId="cooling" />);
    expect(html).toContain('data-severity="none"');
    expect(html).not.toContain('data-severity="normal"');
  });

  test('the subtitle is visibly a placeholder, not a value a reader could mistake for a reading', () => {
    const html = renderToStaticMarkup(<PanelPlaceholder title="SAFETY" state={STATE} nowMs={0} panelId="safety" />);
    expect(html).toContain('assembled in step 10b');
  });
});

describe('⚠ F16 — PanelProps is a real contract, and `panelId` is 10b’s SVG-id namespace', () => {
  test('⚠ the panel renders its own panelId, so the namespace is observable rather than declared', () => {
    const html = renderToStaticMarkup(
      <PanelPlaceholder title="GPU 1" state={STATE} nowMs={0} panelId="gpu1" />,
    );
    expect(html).toContain('data-panel-id="gpu1"');
  });
});
