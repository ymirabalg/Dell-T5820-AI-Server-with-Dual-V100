import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero, servingInstances, servingIdentityOnly, servingPopulated } from '@/lib/fixtures';
import type { TelemetrySnapshot } from '@/lib/types';

import { ServingPanel } from './serving-panel';
import { allReadingsNull, displayedConditionOf, emptyState, stateWith, valueCells } from './test-support';

describe('§6.2 — SERVING', () => {
  test('one compact row per instance: unit state, port, model, context and health', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    expect(html).toContain('llama-server@0');
    expect(html).toContain(':8080');
    expect(html).toContain('qwen3.6-27b');
    expect(html).toContain('131,072');
    expect(html).toContain('ok');
    expect(html).toContain('llama-server@1');
    expect(html).toContain('unreachable');
  });

  test('⚠ decision 13 — no token rate ever appears', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    expect(html).not.toMatch(/t\/s|tokens\/s|tok\/s/i);
  });

  test('§3.4 — an identity-only instance (env parsed, unit down) shows — for the rest', () => {
    const snapshot = { ...everythingZero, serving: [servingIdentityOnly] };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(html).toContain('llama-server@2');
    expect(html).toContain('—');
  });

  test('⚠ serving: null renders "unknown", never zero rows silently', () => {
    const snapshot = { ...everythingZero, serving: null };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(html).toContain('serving instances unknown');
  });

  test('serving: [] (enumerated, nothing discovered) reads differently from serving: null', () => {
    const snapshot = { ...everythingZero, serving: [] };
    const nullHtml = renderToStaticMarkup(<ServingPanel state={stateWith({ ...everythingZero, serving: null })} nowMs={0} panelId="serving" />);
    const emptyHtml = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(emptyHtml).toContain('no llama-server instances discovered');
    expect(emptyHtml).not.toBe(nullHtml);
  });

  test('the panel chip is the worse of every instance’s unit state and health', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    // instance 1 is `failed`/`unreachable` — both alarm — so the head chip must be alarm too.
    expect(html.slice(0, html.indexOf('<div'))).toContain('data-severity="alarm"');
  });

  test("⚠ a stale instance uses S-B's exact wording, watch-toned", () => {
    const displayed = [
      displayedConditionOf({
        kind: 'unit',
        subject: 'llama-server@0.service',
        id: 'unit:llama-server@0.service',
        label: 'llama-server@0.service',
        value: 'active',
        severity: 'normal',
        displaySeverity: 'normal',
        stale: true,
        lastSeenMs: 0,
      }),
    ];
    const state = stateWith(servingPopulated, { displayed });
    const html = renderToStaticMarkup(<ServingPanel state={state} nowMs={372_000} panelId="serving" />);
    expect(html).toContain('last read 6:12 ago');
  });

  test('before the first poll, "serving instances unknown" renders — rather than throwing', () => {
    const html = renderToStaticMarkup(<ServingPanel state={emptyState()} nowMs={0} panelId="serving" />);
    expect(html).toContain('serving instances unknown');
  });
});

describe("⚠ §6.5 — an instance's row carries ITS reason, and no other instance's", () => {
  const rowContaining = (html: string, needle: string): string => {
    const at = html.indexOf(needle);
    return html.slice(html.lastIndexOf('<div', at), html.indexOf('</div>', at));
  };

  test("⚠ the shipped fixture no longer prints instance 1's ECONNREFUSED beside healthy instance 0", () => {
    // `errors[0]?.message` was hung on EVERY row: rendered from `servingPopulated`, the healthy
    // `llama-server@0` carried `connect ECONNREFUSED 127.0.0.1:8081` — instance 1's port — while
    // §6.5 says *"the other instance is unaffected"* (10b-reconcile, adversarial F2).
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('ECONNREFUSED');
    expect(rowContaining(html, 'llama-server@1')).toContain('connect ECONNREFUSED 127.0.0.1:8081');
  });

  test('⚠ a dbus entry naming instance 1 does not displace the llama-health entry that explains it', () => {
    // With a `dbus` entry first, BOTH rows printed it and the `llama-health` message that
    // actually explained instance 1's `unreachable` was never rendered at all.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [
        { source: 'dbus', message: 'NoSuchUnit llama-server@1.service' },
        { source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081' },
      ],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('llama-server@1.service');
    const row1 = rowContaining(html, 'llama-server@1');
    // LAST per instance, as `events.ts` reads it — and nothing is dropped.
    expect(row1).toContain('connect ECONNREFUSED 127.0.0.1:8081');
    expect(html).toContain('NoSuchUnit llama-server@1.service');
  });

  test('an entry naming no instance is collector-wide and renders once, under the rows', () => {
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [{ source: 'llama-env', message: '/etc/llama-server: EACCES' }],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('EACCES');
    expect(rowContaining(html, 'llama-server@1')).not.toContain('EACCES');
    expect(html).toContain('/etc/llama-server: EACCES');
  });
});

describe('⚠ invariant 1, across EVERY reading on this panel', () => {
  test('⚠ with every instance field null, no value cell prints a numeral', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="serving" />);
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
  });
});
