import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { startEventLog } from '@/lib/client/events';
import type { LogEntry } from '@/lib/client/events';

import { SessionEventLogPanel } from './session-event-log-panel';
import { emptyState } from './test-support';

/**
 * §6.4's *"a compact scrolling list of state transitions … newest first"*. This panel has no
 * §6.3 reading of its own — its tests are about ORDER, presence, and the scroll container's
 * accessible shape, not about severity bands.
 */

/** The full markup of the `<li>` containing `needle` — chip included (10c2's toContain-scope
 *  guard: this panel's own head chip is a hardcoded `chip={null}`, so a whole-document check
 *  is safe for THIS panel's constant, but scoping past it is still the honest way to assert
 *  "this entry's chip", robust to a future entry being added to the same fixture). */
const entryContaining = (html: string, needle: string): string => {
  const at = html.indexOf(needle);
  return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at));
};

const entry = (overrides: Partial<LogEntry>): LogEntry => ({
  seq: 1,
  atMs: 0,
  source: 'gpu 0',
  severity: 'watch',
  id: 'gpu_temp:0',
  label: 'GPU 0 temperature',
  kind: 'band',
  from: 'normal',
  to: 'watch',
  detail: '75 °C',
  ...overrides,
});

describe('§6.4 — SESSION EVENT LOG', () => {
  test('the page-load line renders on a fresh session', () => {
    const state = { ...emptyState(), events: startEventLog(0) };
    const html = renderToStaticMarkup(<SessionEventLogPanel state={state} nowMs={0} panelId="session-event-log" />);
    expect(html).toContain('page loaded');
  });

  test('every entry renders its time, its sentence, and its source', () => {
    const events = {
      ...startEventLog(0),
      entries: [entry({ seq: 2, atMs: 1_000, source: 'gpu 0' })],
    };
    const html = renderToStaticMarkup(
      <SessionEventLogPanel state={{ ...emptyState(), events }} nowMs={0} panelId="session-event-log" />,
    );
    expect(html).toContain('GPU 0 temperature 75 °C (normal → watch)');
    expect(html).toContain('gpu 0');
  });

  test('⚠ entries render newest-first — the order state.events.entries is already in', () => {
    const events = {
      ...startEventLog(0),
      entries: [
        entry({ seq: 3, atMs: 2_000, label: 'newest' }),
        entry({ seq: 2, atMs: 1_000, label: 'oldest' }),
      ],
    };
    const html = renderToStaticMarkup(
      <SessionEventLogPanel state={{ ...emptyState(), events }} nowMs={0} panelId="session-event-log" />,
    );
    expect(html.indexOf('newest')).toBeLessThan(html.indexOf('oldest'));
  });

  test('the chip carries the entry’s own severity, not a suppressed/derived one', () => {
    const events = {
      ...startEventLog(0),
      entries: [entry({ severity: 'alarm' })],
    };
    const html = renderToStaticMarkup(
      <SessionEventLogPanel state={{ ...emptyState(), events }} nowMs={0} panelId="session-event-log" />,
    );
    expect(entryContaining(html, 'GPU 0 temperature')).toContain('data-severity="alarm"');
  });

  // ⚠ 10e-A4, reconciliation. This test used to be named *"chip renders the explicit no-band
  // state"* and asserted `toContain('data-severity="none"')` over everything before
  // `</header>` — which includes the `<section>`'s OWN `data-severity` attribute, so it was
  // satisfied whether or not a `<Chip>` rendered at all. OQ-4's ruling is the opposite of what
  // the old name claimed: this head renders NO chip, *"neither a hatched `—` nor a debounce
  // constant"* (SPEC §6.1). `panel-shell.test.tsx` fixtures the PRIMITIVE's three states with
  // exact counts; nothing asserted that the LOG is the caller that omits it, so putting
  // `chip={null}` back at the call site left all 2892 tests green and the hatched pill back in
  // the head. The 1-vs-2 occurrence count is the only thing in the DOM that separates the two.
  test('⚠ OQ-4 — the log’s head renders NO chip element at all, not the hatched no-band pill', () => {
    const html = renderToStaticMarkup(<SessionEventLogPanel state={emptyState()} nowMs={0} panelId="session-event-log" />);
    const head = html.slice(0, html.indexOf('</header>'));
    // Exactly one: the `<section>`'s own attribute. `chip={null}` would add the `Chip`'s.
    expect((head.match(/data-severity="none"/g) ?? []).length).toBe(1);
    // …and the panel still has no severity of its own, which is what the section carries.
    expect(head).toContain('data-severity="none"');
  });

  /**
   * ⚠ 10e-A1/A6 — the three declarations on `.scroll` that a render test structurally cannot
   * see, and that six one-line CSS reverts each left the whole suite green on.
   * `renderToStaticMarkup` emits class names and lays nothing out, so this asserts the CSS
   * TEXT, exactly as `components/styles.test.ts` does for its own rule.
   *
   * Each is load-bearing and each was measured in a real browser on 2026-09-09:
   *
   * - **`position: relative`** is F1's ONLY fix. `Chip` renders a `position: absolute`
   *   `.sr-only` span per entry; a scroll container clips such a descendant only when it is in
   *   that descendant's containing-block chain, and a `position: static` box is in no chain, so
   *   the hidden spans escaped the well and grew `documentElement.scrollHeight` by 21.85px per
   *   entry past the fold (measured 5189 at 200 entries on a 1024px viewport, 1024 with this
   *   line) — the page acquiring a scrollbar at ~15 entries, which is what
   *   §6.1 promises will not happen. (`panel-shell.module.css`'s `.panel { position: relative }`
   *   does NOT close it; 10e-A1 measured both.)
   * - **`height`, not `max-height`** is what makes §2.8's well fixed, i.e. what makes this
   *   panel 133.8px whether the log holds one entry or five hundred.
   * - **`box-sizing: border-box`** is what makes that 84 the mock's TOTAL box rather than 86
   *   (`MOCK.html` is globally border-box; this app is not — the builder spec's silence #6).
   */
  test('⚠ the log well is a bounded, positioned, border-box container — F1 and §2.8, in CSS text', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./session-event-log-panel.module.css', import.meta.url)),
      'utf8',
      // Declarations only: a rule quoted inside a comment must not satisfy the guard.
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const scroll = css.slice(css.indexOf('.scroll {'), css.indexOf('}', css.indexOf('.scroll {')));

    expect(scroll).toMatch(/position:\s*relative/);
    expect(scroll).toMatch(/box-sizing:\s*border-box/);
    expect(scroll).toMatch(/(^|[^-])height:\s*84px/);
    expect(scroll).not.toMatch(/max-height/);
    // Not vacuous: this really is the scroll container the three declarations are about.
    expect(scroll).toMatch(/overflow-y:\s*auto/);
  });

  test('the scroll container is reachable by keyboard and named', () => {
    const html = renderToStaticMarkup(<SessionEventLogPanel state={emptyState()} nowMs={0} panelId="session-event-log" />);
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="0"');
    // ⚠ NOT `${panelId} session event log` — that read aloud as "session-event-log session
    // event log", the slot id and its hyphens in front of a name that already said it.
    // `panelId` is the SVG-id namespace, not a display string (10b-reconcile, adversarial F13).
    expect(html).toContain('aria-label="session event log"');
    expect(html).not.toContain('session-event-log session event log');
  });
});
