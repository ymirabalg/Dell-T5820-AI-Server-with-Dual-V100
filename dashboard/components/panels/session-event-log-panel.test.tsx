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
    expect(html).toContain('data-severity="alarm"');
  });

  test('⚠ the panel head has no severity of its own — chip renders the explicit no-band state', () => {
    const html = renderToStaticMarkup(<SessionEventLogPanel state={emptyState()} nowMs={0} panelId="session-event-log" />);
    const headEnd = html.indexOf('</header>');
    expect(html.slice(0, headEnd)).toContain('data-severity="none"');
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
