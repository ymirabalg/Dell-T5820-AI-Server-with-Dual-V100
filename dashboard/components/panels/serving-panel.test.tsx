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
    // Scoped to the VALUE cells rather than the whole document, per 10c2's toContain-scope
    // guard — "shows — for the rest" is a claim about a READING, not merely that the glyph
    // appears somewhere (which `Chip`'s own no-band state could also satisfy).
    expect(valueCells(html).some((cell) => cell.includes('—'))).toBe(true);
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

  /** How many times a message is on the page — the "too many" direction, which `toContain`
   *  cannot see (10b-S-G reconcile, adversarial A1). */
  const occurrences = (html: string, needle: string): number => html.split(needle).length - 1;

  test("⚠ the shipped fixture no longer prints instance 1's ECONNREFUSED beside healthy instance 0", () => {
    // `errors[0]?.message` was hung on EVERY row: rendered from `servingPopulated`, the healthy
    // `llama-server@0` carried `connect ECONNREFUSED 127.0.0.1:8081` — instance 1's port — while
    // §6.5 says *"the other instance is unaffected"* (10b-reconcile, adversarial F2).
    // `servingPopulated`'s entry now carries `instance: 1` structurally (10b-S-G).
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('ECONNREFUSED');
    expect(rowContaining(html, 'llama-server@1')).toContain('connect ECONNREFUSED 127.0.0.1:8081');
  });

  test('⚠ 10b-S-G — the join is `instance`, not the message: a misleading message text does not fool it', () => {
    // The regression F2 found, made impossible rather than merely fixed: this message names
    // "instance 0" nowhere and could equally well be misread by a text heuristic as being
    // about NEITHER row, or (worse) about a wrong one if it happened to share a substring.
    // With a structural `instance: 1`, it renders on row 1 regardless of what the prose says.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [{ source: 'llama-health', message: 'the model failed to answer in time', instance: 1 }],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('the model failed to answer in time');
    expect(rowContaining(html, 'llama-server@1')).toContain('the model failed to answer in time');
  });

  test('⚠ a dbus entry naming instance 1 does not displace the llama-health entry that explains it', () => {
    // With a `dbus` entry first, BOTH rows printed it and the `llama-health` message that
    // actually explained instance 1's `unreachable` was never rendered at all.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [
        { source: 'dbus', message: 'NoSuchUnit llama-server@1.service', instance: 1 },
        { source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081', instance: 1 },
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
    // ⚠ "renders ONCE" is what the name promises, so count it rather than `toContain` it
    // (10b-S-G reconcile, adversarial A1 — the same weak-assertion shape ANCHOR §2.2 names).
    expect(occurrences(html, '/etc/llama-server: EACCES')).toBe(1);
  });

  test('⚠ 10b-S-G — an ATTRIBUTED entry renders on its row and never again as a panel note', () => {
    // The "too many" direction, which had no assertion anywhere until this reconciliation
    // (adversarial A1): `unattributed`'s filter is a second `namesInstance` call site with no
    // mutation of its own, and replacing the whole filter with `servingErrors` left the full
    // suite green at 93 files / 2587 tests. Shipped, that prints every attributed message
    // twice — once as its row's own `detail`, and again as a panel-level note, which
    // `PanelNotes` defines as "this entry explains the panel, not a row". One fact, once.
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@1')).toContain('connect ECONNREFUSED 127.0.0.1:8081');
    expect(occurrences(html, 'connect ECONNREFUSED 127.0.0.1:8081')).toBe(1);
  });

  test('⚠ 10b-S-G — an entry naming an instance that is not on the page falls to the panel note', () => {
    // The orphan: `instance: 5` against rows 0 and 1. The behaviour was already right —
    // `unattributed`'s `.some(...)` makes an entry matching no row `!some(...)` by
    // construction, so it degrades to the panel-level rendering §6.5 already licenses — and
    // it was untested, on the same uncovered line as the case above (adversarial A5). This
    // fixture exists so nobody "fixes" a non-bug, and so the explanation cannot start
    // vanishing. Reachable from a server whose `serving[]` and `errors[]` disagree: an
    // `install`/`set-model` between polls, an old row count, any index bug.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [
        { source: 'llama-health', message: 'the probe never answered', instance: 0 },
        { source: 'llama-env', message: '/etc/llama-server/5.env: ENOENT', instance: 5 },
      ],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('5.env');
    expect(rowContaining(html, 'llama-server@1')).not.toContain('5.env');
    expect(occurrences(html, '/etc/llama-server/5.env: ENOENT')).toBe(1);
    // ...and the entry that DOES name a row is still on that row alone.
    expect(rowContaining(html, 'llama-server@0')).toContain('the probe never answered');
    expect(occurrences(html, 'the probe never answered')).toBe(1);
  });

  test('⚠ 10b-S-G — serving: null and serving: [] still show an instance-tagged entry', () => {
    // The takeover branch renders `servingErrors` whole, so an entry that names an instance
    // no row exists for is displayed rather than swallowed — the third orphan shape
    // (adversarial A5). §6.5's own rule: an alarm with no explanation is not actionable, and
    // "which instances exist is unknown" is exactly when the reason matters most.
    for (const serving of [null, []] as const) {
      const snapshot: TelemetrySnapshot = {
        ...everythingZero,
        serving,
        errors: [{ source: 'llama-env', message: '/etc/llama-server: EACCES', instance: 1 }],
      };
      const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
      expect(occurrences(html, '/etc/llama-server: EACCES')).toBe(1);
    }
  });

  test('⚠ 10f/Q1 — the takeover explanation renders through the bounded PanelNotes, ROOMY here', () => {
    // ⚠ This branch used to map `servingErrors` into its own `<p className={styles.emptyNote}>`
    // list — a second, bespoke copy of `PanelNotes` and so a second UNBOUNDED `errors[]` block:
    // with `serving: null` and several `llama-env` entries it grew row 4 without limit, which is
    // what the ruling closes ("bound every notes block"). `roomy` is free here — the SESSION
    // EVENT LOG sets row 4 at 129.8 px and this takeover body is well under it.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: null,
      errors: [{ source: 'llama-env', message: '/etc/llama-server: EACCES' }],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    const at = html.indexOf('/etc/llama-server: EACCES');
    expect(at).toBeGreaterThan(-1);
    const well = html.slice(html.lastIndexOf('<div', at), at);
    expect(well).toContain('data-bound="roomy"');
    expect(well).toContain('role="group"');
  });

  /*
   * ⚠ 10f/Q1, added by the TEST phase — the OTHER side of the same boundary. When instances DO
   * enumerate, the panel-level block holds only the entries no row claimed, and it takes the
   * TIGHT default: row 4 is `max(SERVING, SESSION EVENT LOG 129.8)` and a healthy SERVING is
   * 103.8, so it has 26 px of slack while its two per-instance explanations already spend 40
   * of it (10f-build.md §1.4's 37 px term). `roomy` here is +42 px on a page whose worst case
   * already lands 1-8 px over budget at 1600x1024. Only the TAKEOVER branch — no rows, no
   * chart — can afford the taller well. Nothing asserted this and no mutation reached it.
   */
  test('⚠ 10f/Q1 — the UNATTRIBUTED block takes the TIGHT bound: row 4 has 26 px of slack, not 42', () => {
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [{ source: 'llama-models', message: '/v1/models: connection refused' }],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    const at = html.indexOf('/v1/models: connection refused');
    expect(at).toBeGreaterThan(-1);
    const well = html.slice(html.lastIndexOf('<div', at), at);
    expect(well).toContain('data-bound="tight"');
    expect(well).not.toContain('data-bound="roomy"');
  });

  test('⚠ 10b-S-G — an entry whose MESSAGE names an instance but has no `instance` field is unattributed', () => {
    // The mirror of the case above: a message that reads as though it names instance 1 (a
    // port, a unit name) but carries no structural `instance` must NOT land on that row —
    // proving the old text heuristic is gone, not merely supplemented.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingInstances,
      errors: [{ source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081' }],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    expect(rowContaining(html, 'llama-server@0')).not.toContain('ECONNREFUSED');
    expect(rowContaining(html, 'llama-server@1')).not.toContain('ECONNREFUSED');
    expect(html).toContain('connect ECONNREFUSED 127.0.0.1:8081');
  });
});

describe('⚠ invariant 1, across EVERY reading on this panel', () => {
  test('⚠ with every instance field null, no value cell prints a numeral', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="serving" />);
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
    // ⚠ 10e §2.7: `secondaryLabel`/`inline`/`endPrefix` (port/model·ctx/health) are NOT
    // `.value`-classed spans — they are SERVING-only `StatusRow` slots with their own class
    // names — so `valueCells` above cannot see a fabricated digit inside them. Checked
    // directly, over the whole render, so this test's own name ("no value cell") stays true
    // of every reading the row prints, not only the ones `valueCells` happens to reach.
    expect(html).not.toMatch(/ctx [0-9]/);
  });

  // ⚠ 10e §2.7 — `secondaryLabel`/`inline`/`endPrefix` are NOT `.value`-classed spans (they are
  // SERVING-only `StatusRow` slots with their own class names), so `valueCells` above cannot
  // see a fabricated digit inside them — checked directly here instead.
  test('⚠ with every instance field null, port/model/ctx/health render — too, not a fabricated reading', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="serving" />);
    expect(html).toContain(':—');
    expect(html).toContain('— · ctx —');
    expect(html).toContain('health —');
    expect(html).not.toMatch(/ctx [0-9]/);
  });
});
