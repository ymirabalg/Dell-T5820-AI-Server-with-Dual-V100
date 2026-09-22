import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import {
  LIVE_BOX_SERVING_WIRE,
  everythingZero,
  servingCrossPinned,
  servingGpusUnreadableSnapshot,
  servingInstances,
  servingIdentityOnly,
  servingPerGpu,
  servingPopulated,
  servingSplit,
  servingUnmapped,
  servingUnmappedSnapshot,
} from '@/lib/fixtures';
import { parseSnapshot } from '@/lib/client/wire';
import type { ServingInstance, TelemetrySnapshot } from '@/lib/types';

import { ServingPanel } from './serving-panel';
import { allReadingsNull, displayedConditionOf, emptyState, servingReadCases, stateFromWire, stateWith, valueCells } from './test-support';
import type { WireSnapshot } from '@/lib/client/wire';

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

  /**
   * ⚠⚠ 10h/§3.4 — `model` is RENDERED AS ITS FILENAME (owner's ruling, 2026-09-10), raw on the
   * wire. `/v1/models` returns llama.cpp's `-m` argument, which is the whole weights path
   * unless `ALIAS` is set — and `ALIAS` is optional in `serve-llm.sh set-model`. Measured cost
   * of the path form: **+21 px per row**, on the panel that governs §6.1's row 4 as soon as a
   * third instance exists.
   */
  const rowFor = (html: string, needle: string): string => {
    const at = html.indexOf(needle);
    expect(at).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf('<div', at), html.indexOf('</div>', at));
  };

  test('⚠ a path-valued model renders its FILENAME, with the raw path in the row’s title', () => {
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: [
        { ...servingInstances[0]!, model: '/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf' },
      ],
    };
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);
    const row = rowFor(html, 'llama-server@0');
    expect(row).toContain('Qwen3.6-27B-Q4_K_M.gguf · ctx 131,072');
    // ⚠ The DIRECTORY is gone from the visible text — the assertion that fails if the raw
    // string is simply rendered whole (which contains the filename too).
    expect(row).not.toContain('>/home/yorman/models/');
    // ⚠ And nothing is LOST: the whole reading is on the row, in the attribute §3.4 names.
    expect(row).toContain('title="/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf"');
  });

  test('⚠ an ALIAS model is unchanged, and still carries its own title — one code path, not two', () => {
    const html = renderToStaticMarkup(<ServingPanel state={stateWith(servingPopulated)} nowMs={0} panelId="serving" />);
    const row = rowFor(html, 'llama-server@0');
    expect(row).toContain('qwen3.6-27b · ctx 131,072');
    expect(row).toContain('title="qwen3.6-27b"');
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
      errors: [{ source: 'llama-health', message: 'the model failed to answer in time', instance: '1' }],
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
        { source: 'dbus', message: 'NoSuchUnit llama-server@1.service', instance: '1' },
        { source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081', instance: '1' },
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
        { source: 'llama-health', message: 'the probe never answered', instance: '0' },
        { source: 'llama-env', message: '/etc/llama-server/5.env: ENOENT', instance: '5' },
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
        errors: [{ source: 'llama-env', message: '/etc/llama-server: EACCES', instance: '1' }],
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

describe('⚠⚠ 12b — the row names the cards it spans (§6.2)', () => {
  const render = (serving: readonly ServingInstance[] | null, errors: TelemetrySnapshot['errors'] = []): string =>
    renderToStaticMarkup(
      <ServingPanel
        state={stateWith({ ...everythingZero, serving, errors })}
        nowMs={0}
        panelId="serving"
      />,
    );

  test('⚠ SHAPE 1 of 4 — `gpus: [N]`: one row per process, each naming its own card', () => {
    // ⚠⚠ 12b-TEST — **the DEFAULT subject is the cross-pinned fixture, where the instance
    // number and the card number disagree.** On `servingPerGpu` (instance N on card N, which
    // is what this box runs) this assertion is satisfied by three different wrong
    // implementations — naming the card from `gpus`, from `instance`, or from the row's
    // position — and 12b's build measured exactly that: `12b-SP3`, `SP4` and `SP5` all render
    // `GPU 0` for instance 0, so none of them could redden this test. The per-GPU arrangement
    // is asserted too, second, because it is the one the box is actually in.
    const crossed = render(servingCrossPinned);
    expect(crossed).toContain(':8080 · GPU 1');
    expect(crossed).toContain(':8081 · GPU 0');
    expect(crossed).not.toContain(':8080 · GPU 0');

    const perGpu = render(servingPerGpu);
    expect(perGpu).toContain(':8080 · GPU 0');
    expect(perGpu).toContain(':8081 · GPU 1');
  });

  test('⚠ SHAPE 2 of 4 — `gpus: [0,1]`: ONE row spanning both cards, plural', () => {
    // ⚠ And the mode is read from the ARRAY, never from the row count: this snapshot has one
    // row because one process is serving, and a snapshot with one row because the other
    // card's unit failed would say `GPU 0`, not `GPUs 0, 1`.
    const html = render(servingSplit);
    expect(html).toContain(':8080 · GPUs 0, 1');
    expect(html).not.toContain('llama-server@1');
    const failedSibling = render([{ ...(servingPerGpu[0] as ServingInstance), gpus: [0] }]);
    expect(failedSibling).toContain(':8080 · GPU 0');
    expect(failedSibling).not.toContain('GPUs');
  });

  test('⚠ SHAPE 3 of 4 — `gpus: null`: an em dash, with the `dbus` entry already on the row', () => {
    // §3.7: "an alarm with no explanation beside it is not actionable". The entry carries
    // `instance: 0`, so it lands on this row structurally rather than by reading its text.
    const html = render(servingGpusUnreadableSnapshot.serving, servingGpusUnreadableSnapshot.errors);
    expect(html).toContain(':8080 · —');
    expect(html).toContain('AccessDenied');
  });

  test('⚠ SHAPE 4 of 4 — ABSENT: nothing extra at all, and the row is what it was', () => {
    // §3.4's fallback, on the panel. An em dash here would report a failed reading on a box
    // that is simply running the container it was given.
    const html = render(servingInstances);
    expect(html).toContain(':8080');
    expect(html).not.toContain('GPU');
    expect(html).not.toContain(':8080 · ');
  });

  test('⚠⚠ ABSENT and `[N]` differ ONLY by the cards — nothing else on the row moves', () => {
    // The additivity claim, rendered on this panel: the two fixtures differ in one key, so
    // the two renders must differ only where that key is shown.
    const declared = render(servingPerGpu);
    const older = render(servingInstances);
    expect(declared).not.toBe(older);
    expect(declared.replace(' · GPU 0', '').replace(' · GPU 1', '')).toBe(older);
  });

  test('⚠⚠ 12b-TEST — the four shapes are four different TEXTS, not four different markups', () => {
    // ⚠ §3.4 forbids collapsing `null` and absent, and a difference that exists only in an
    // attribute or a class is not a difference a person reading the screen — or a screen
    // reader reading it aloud — can act on. So the comparison here is on the rendered TEXT
    // with every tag removed, which is what the accessibility tree carries.
    const textOf = (serving: readonly ServingInstance[] | null, errors: TelemetrySnapshot['errors'] = []): string =>
      render(serving, errors).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    const one = textOf([{ ...(servingPerGpu[0] as ServingInstance), gpus: [0] }]);
    const both = textOf([{ ...(servingPerGpu[0] as ServingInstance), gpus: [0, 1] }]);
    const unreadable = textOf(servingGpusUnreadableSnapshot.serving, servingGpusUnreadableSnapshot.errors);
    const absent = textOf([servingInstances[0] as ServingInstance]);
    expect(new Set([one, both, unreadable, absent]).size).toBe(4);
    // ⚠ And the pair §3.4 names, stated directly rather than inferred from the set size: the
    // em dash is IN the text of the failed read and the text of the older server has nothing
    // where the cards would be.
    expect(unreadable).toContain(':8080 · —');
    // ⚠ Scoped to the port, not to the whole panel: the row's VALUE column legitimately
    // carries both a `·` (between model and ctx) and an em dash (a null reading), so a
    // panel-wide assertion would be a test naming one property while checking another.
    expect(absent).not.toContain(':8080 ·');
    expect(one).toContain(':8080 · GPU 0');
  });

  test('⚠ an instance declaring NO card says so — `[]` is an answer, not a gap', () => {
    // `CUDA_VISIBLE_DEVICES=` is how CUDA is told no device is visible. It must not read as
    // an em dash, which says the property could not be read.
    const html = render([{ ...(servingPerGpu[0] as ServingInstance), gpus: [] }]);
    expect(html).toContain(':8080 · no GPUs');
    expect(html).not.toContain(':8080 · —');
  });

  test('⚠⚠ the DEPLOYED server’s own bytes render exactly as they do today', () => {
    // `LIVE_BOX_SERVING_WIRE` is the PRE-CHANGE collector's output on the box's real env
    // files and `/v1/models` bodies, taken through the same validator a browser uses. The
    // row must carry the port and no card text at all.
    const wire = parseSnapshot({
      ...(JSON.parse(JSON.stringify(everythingZero)) as Record<string, unknown>),
      serving: JSON.parse(LIVE_BOX_SERVING_WIRE) as unknown,
    });
    expect(wire).not.toBeNull();
    const html = renderToStaticMarkup(
      <ServingPanel state={stateWith(wire?.snapshot as TelemetrySnapshot)} nowMs={0} panelId="serving" />,
    );
    expect(html).toContain(':8080');
    expect(html).toContain(':8081');
    expect(html).not.toContain('GPU');
    // ⚠ The port span carries NOTHING after it. (The row's value column does show `—`, for
    // `unitState`: the capture had no bus to ask systemd. That is a different cell, and
    // asserting the absence of every em dash on the panel would have been a test naming one
    // property while checking another.)
    expect(html).not.toContain(':8080 · ');
    expect(html).not.toContain(':8081 · ');
  });
});

describe('⚠⚠ 12c — a NAMED instance, and the unit-name mapping made visible', () => {
  const render = (snapshot: TelemetrySnapshot): string =>
    renderToStaticMarkup(<ServingPanel state={stateWith(snapshot)} nowMs={0} panelId="serving" />);

  const rowContaining = (html: string, needle: string): string => {
    const at = html.indexOf(needle);
    expect(at).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf('<div', at), html.indexOf('</div>', at));
  };
  const occurrences = (html: string, needle: string): number => html.split(needle).length - 1;

  test('⚠⚠ THE SPLIT ROW — labelled `llama-split`, the unit that actually serves it', () => {
    // The render §3.4's first ruling exists for. Until 12c this page could not be produced at
    // ALL: discovery rejected `split.env`, so `serving[]` carried instances 0 and 1 — both
    // inactive — and the process serving the box appeared nowhere.
    //
    // ⚠ `llama-server@split` is asserted ABSENT, not merely "the right label is present".
    // Both can be true at once, and the wrong one is what a template produces.
    const html = render({ ...everythingZero, serving: servingSplit });
    expect(html).toContain('llama-split');
    expect(html).not.toContain('llama-server@split');
    expect(html).toContain(':8080 · GPUs 0, 1');
    expect(html).toContain('gemma-4-31b');
  });

  test('⚠⚠ THE MAPPING MISS — the row is labelled by its bare identity, never by a unit that does not exist', () => {
    // `default.env` is a legal instance filename and `lib/units.ts` has no unit for it. The
    // label is `default`, full stop — 12b's survey named the cost of the alternative exactly:
    // "four operator-facing strings would NAME A UNIT THAT DOES NOT EXIST."
    const html = render(servingUnmappedSnapshot);
    expect(html).toContain('>default<');
    expect(html).not.toContain('llama-server@default');
    expect(html).not.toContain('llama-default');
  });

  test('⚠⚠ THE MISS IS LOUD ON THE PAGE — the `dbus` entry sits on that row and no other', () => {
    // Without this the row is indistinguishable from a stopped service: both em dashes, no
    // explanation. §6.5: "an alarm with no explanation beside it is not actionable."
    const html = render(servingUnmappedSnapshot);
    expect(rowContaining(html, '>default<')).toContain('no systemd unit is known for instance');
    expect(rowContaining(html, 'llama-server@0')).not.toContain('no systemd unit is known');
    expect(occurrences(html, 'no systemd unit is known for instance')).toBe(1);
  });

  test('⚠ the unmappable row still shows everything that did NOT need a unit name', () => {
    // §6.5's rule at row granularity: a failed reading blanks the figure it explains and
    // nothing else. The port, model, context and health all came from places that never
    // needed a unit name.
    const row = rowContaining(render(servingUnmappedSnapshot), '>default<');
    expect(row).toContain(':8082');
    expect(row).toContain('qwen3.6-27b');
    expect(row).toContain('131,072');
    expect(row).toContain('health ok');
  });

  test('⚠⚠ 12c — the row never picks up a condition keyed on a unit name the system cannot PRODUCE', () => {
    // ⚠ The step-10 ledger reported `12c-SP21` DID NOT BITE, and it was right: asking
    // `findDisplayed` for `unit:llama-server@default.service` finds nothing today, because
    // `conditionsFrom` never mints that id — so a fabricated lookup key and the correct
    // `undefined` are indistinguishable on any fixture where `displayed` comes from our own
    // projection. This supplies `displayed` DIRECTLY, which is what the prop's type allows,
    // and the fabricated id is the only thing in it.
    //
    // The rule: an identity with no unit name has no `unit:` condition, so its row must show
    // no unit-derived stale age. A lookup under a guessed name would show one — a *last read*
    // note sourced from a unit that has never existed.
    const displayed = [
      displayedConditionOf({
        kind: 'unit',
        subject: 'llama-server@default.service',
        id: 'unit:llama-server@default.service',
        label: 'llama-server@default.service',
        value: 'active',
        severity: 'normal',
        displaySeverity: 'normal',
        stale: true,
        lastSeenMs: 0,
      }),
    ];
    const state = stateWith(servingUnmappedSnapshot, { displayed });
    const html = renderToStaticMarkup(<ServingPanel state={state} nowMs={372_000} panelId="serving" />);
    expect(html).not.toContain('last read 6:12 ago');
  });

  test('⚠⚠ 12c — the health condition is looked up by the IDENTITY, not by anything else on the row', () => {
    // `12c-SP22` did not bite either: nothing asserted that the `health:` note reaches the row
    // at all, so a lookup keyed on the port (or on the array position, or on a stringified
    // anything) was indistinguishable from the right one. ⚠ The subject is a NAMED instance,
    // because for `0` the identity and half the plausible wrong keys still coincide.
    const displayed = [
      displayedConditionOf({
        kind: 'health',
        subject: 'split',
        id: 'health:split',
        label: 'llama-split /health',
        value: 'ok',
        severity: 'normal',
        displaySeverity: 'normal',
        stale: true,
        lastSeenMs: 0,
      }),
    ];
    const state = stateWith({ ...everythingZero, serving: servingSplit }, { displayed });
    const html = renderToStaticMarkup(<ServingPanel state={state} nowMs={372_000} panelId="serving" />);
    expect(rowContaining(html, '>llama-split<')).toContain('last read 6:12 ago');
  });

  test('⚠ a NAMED identity is a valid React key and a valid `errors[]` join — the row is not duplicated or orphaned', () => {
    // The identity is the React key and the `error.instance === instance.instance` join. A
    // key collision would duplicate or drop a row; a join that stringified one side and not
    // the other would orphan the entry into `PanelNotes` under the rows.
    const html = render({
      ...everythingZero,
      serving: [...servingSplit, ...servingUnmapped],
      errors: [{ source: 'llama-health', message: 'the split process never answered', instance: 'split' }],
    });
    // ⚠ `>llama-split<`, the rendered TEXT: `StatusRow` also puts the label in a `title`, so
    // a bare `toContain` count would be 2 for one row and would read as a duplicate.
    expect(occurrences(html, '>llama-split<')).toBe(1);
    expect(rowContaining(html, '>llama-split<')).toContain('the split process never answered');
    expect(rowContaining(html, '>default<')).not.toContain('the split process never answered');
    expect(occurrences(html, '>default<')).toBe(1);
  });
});

/**
 * ⚠⚠ **12d — the same five reads, rendered on the SERVING panel.**
 *
 * §3.4's ruling of 2026-09-22 puts a third form on the GPU card and says *"the full reason
 * stays on SERVING beside the refused row"*. This is the other half of that sentence, and it
 * is asserted rather than assumed: the GPU card says only that the question is open, so if
 * the explanation is not HERE it is nowhere on the page.
 *
 * The bodies are the same five `test-support.ts` builds for the GPU acceptance, taken through
 * the real `parseSnapshot`, so the `llama-env` sentence below is the validator's own.
 */
describe('⚠⚠ 12d — the five reads, rendered on the SERVING panel', () => {
  const cases = servingReadCases();
  const render = (wire: WireSnapshot): string =>
    renderToStaticMarkup(<ServingPanel state={stateFromWire(wire)} nowMs={0} panelId="serving" />);
  const rowsIn = (html: string): number => html.split('llama-server@').length - 1;

  test('⚠⚠ RENDER 1 of 5 — a COMPLETE list renders both processes and explains nothing, because nothing failed', () => {
    const html = render(cases.complete);
    expect(html).toContain('>llama-server@0<');
    expect(html).toContain('>llama-server@7<');
    expect(html).toContain(':8080 · GPU 0');
    expect(html).toContain(':8081 · GPU 1');
    // ⚠ The anchor the other four are read against: no refusal note on a clean read.
    expect(html).not.toContain('was dropped');
  });

  test('⚠⚠ RENDER 2 of 5 — a refused row is GONE from the rows and its reason is under them, naming which row and why', () => {
    const html = render(cases.refusedNamed);
    expect(html).toContain('>llama-server@0<');
    expect(html).not.toContain('>llama-server@7<');
    // ⚠⚠ The sentence itself, quoted: this is the explanation the GPU card sends the reader
    // here for. It names the row by its position in the array the server sent — not by the
    // identity, which may be the reason for the refusal.
    expect(html).toContain('serving[1] was dropped: `port` did not validate');
  });

  test('⚠⚠ RENDER 3 of 5 — an anonymous refusal is on this panel too, and it names the field that failed', () => {
    const html = render(cases.refusedAnonymous);
    expect(html).toContain('>llama-server@0<');
    // ⚠ Exactly ONE row survives — the refused one is not rendered as a blank or a ghost.
    expect(rowsIn(html)).toBe(1);
    expect(html).toContain('serving[1] was dropped: `instance` did not validate');
    // ⚠ The pair with render 2: the two refusals differ HERE, on the panel that can say which
    // field failed, while the GPU card renders them identically. That asymmetry is the ruling
    // — the card says the question is open, the panel says why.
    expect(html).not.toContain('`port` did not validate');
  });

  test('⚠⚠ RENDER 4 of 5 — an unreadable `gpus` keeps its row and shows an em dash beside the port', () => {
    const html = render(cases.gpusUnreadable);
    expect(html).toContain('>llama-server@7<');
    expect(html).toContain(':8081 · —');
    // ⚠ Nothing was discarded here, so there is no refusal sentence. This is what separates a
    // failed READING from a cut LIST on this panel, one row apart from the GPU card's own two
    // forms.
    expect(html).not.toContain('was dropped');
  });

  test('⚠⚠ RENDER 5 of 5 — an ABSENT `gpus` renders the row exactly as an older server always did', () => {
    const html = render(cases.gpusAbsent);
    expect(html).toContain('>llama-server@0<');
    expect(html).toContain('>llama-server@7<');
    expect(html).toContain(':8080');
    // ⚠ No card text at all — not `—`, which would claim a reading failed on a server that
    // has never published the field (§3.4 forbids collapsing absent and `null`).
    expect(html).not.toContain(':8080 · ');
    expect(html).not.toContain(':8081 · ');
  });

  test('⚠⚠ every refusal reaches THIS panel, which is what lets the GPU card keep its answer short', () => {
    // The property behind §3.4's *"the full reason stays on SERVING"*: for both partial reads
    // the explaining sentence is on this panel, and the row it was about is not.
    for (const wire of [cases.refusedNamed, cases.refusedAnonymous]) {
      const html = render(wire);
      expect(html).toContain('was dropped');
      expect(html).not.toContain('>llama-server@7<');
      // ⚠⚠ 12d/TEST — and the CARD's four words are not here. §3.4 splits the two statements
      // deliberately: the card says the question is open, this panel says which row and why.
      // A panel that also printed `list not fully read` would be the second spelling of one
      // fact that the ruling's own wording exists to prevent.
      expect(html).not.toContain('list not fully read');
    }
    // ⚠ …and the twin, so this is not "the panel always says something was dropped": the
    // three non-partial reads carry no refusal sentence at all.
    for (const wire of [cases.complete, cases.gpusUnreadable, cases.gpusAbsent]) {
      expect(render(wire)).not.toContain('was dropped');
    }
  });
});
