// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { CadenceSeconds, WindowMinutes } from '@/lib/client/prefs';

import { Header } from './header';
import type { HeaderProps } from './header';

/**
 * §6.2's header. Structural checks use `react-dom/server`'s `renderToStaticMarkup`, the
 * pattern every other `components/` test follows. The five controls also carry real `onChange`
 * / `onClick` wiring, which no amount of markup-string matching can prove — so this file is
 * `@vitest-environment jsdom` throughout (D6 is what first justified adding jsdom to this
 * project; this reuses it rather than asking for a second reason) and mounts with
 * `react-dom/client` to fire real DOM events and assert the right callback ran with the right
 * argument.
 */

const BASE: HeaderProps = {
  hostname: 'ai-server',
  hostnameTitle: 'ai-server',
  uptime: 'up 2 d 02:01',
  severity: 'normal',
  mode: 'live',
  alarms: 0,
  timeOfDay: '14:47:31',
  zoneAbbreviation: 'EDT',
  ageText: '2 s ago',
  cadenceSeconds: 5,
  windowMinutes: 30,
  paused: false,
  onSetCadence: () => undefined,
  onSetWindow: () => undefined,
  onRefreshNow: () => undefined,
  onPauseResume: () => undefined,
  onLogout: () => undefined,
};

describe('§6.2 — the header list is EXHAUSTIVE', () => {
  test('hostname and uptime both render', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('ai-server');
    expect(html).toContain('up 2 d 02:01');
  });

  /**
   * ⚠⚠ 10h RECONCILE — §3.2's `hostname` is TRUNCATED for layout (owner's ruling 2026-09-10),
   * which makes the `title` the only place the whole reading survives. It is the same rule
   * §3.4 already applies to `model`, and it is here for a measured reason, not a stylistic
   * one: `header.module.css` caps this span at 320px because `--band-reserve: 102px` is a
   * CONSTANT the row arithmetic subtracts, and a 79-character FQDN wrapped the header, took
   * the band to 130.7 px and put §6.1's page 1 px over with every row cap holding.
   *
   * Both sides are fixtured, because an optional prop is an untested one until they are
   * (HANDOVER §0.8): a reading present keeps its `title`, and a reading ABSENT renders no
   * attribute at all — `title=""` and `title="undefined"` are the two ways this ships
   * unnoticed, and `formatText`'s em dash is a rendering, never a reading to hover.
   */
  // The span holding a given hostname string, so both assertions below are about THAT element
  // rather than about the whole header — which also carries five `title`-bearing controls.
  const hostnameSpan = (html: string, text: string): string => {
    const found = [...html.matchAll(new RegExp(`<span[^>]*>${text}</span>`, 'g'))].map((m) => m[0]);
    expect(found).toHaveLength(1);
    return found[0] ?? '';
  };

  test('⚠ the truncated hostname keeps its whole reading in a title — §3.4’s rule, applied to §3.2', () => {
    const fqdn = 'ai-server.rack14.row-c.datacenter-east.corp.internal.example-holdings-group.com';
    const html = renderToStaticMarkup(<Header {...BASE} hostname={fqdn} hostnameTitle={fqdn} />);
    expect(hostnameSpan(html, fqdn)).toContain(`title="${fqdn}"`);
  });

  test('⚠ a header with no hostname READING renders no title attribute at all, not an empty one', () => {
    const html = renderToStaticMarkup(<Header {...BASE} hostname="—" hostnameTitle={null} />);
    expect(hostnameSpan(html, '—')).not.toContain('title');
  });

  /**
   * ⚠⚠ 10h RECONCILE — the truncation itself, which is CSS and therefore invisible to every
   * assertion above: a `title` on a span that still renders its whole string bounds nothing.
   * All three declarations are load-bearing and the FIRST one is the bound —
   *
   * - `max-width` is what stops the wrap. A wrapping flex container breaks lines on each item's
   *   HYPOTHETICAL main size, so `min-width: 0` (which only lets an item shrink inside a line
   *   it has already been given) cannot prevent it; only clamping the hypothetical size can.
   * - `overflow: hidden` is what makes `text-overflow` apply at all, and
   * - `text-overflow: ellipsis` is the affordance — without it the string is cut mid-glyph with
   *   nothing saying so, which is the same failure §6.1 rules against for a scrolling well.
   *
   * Declarations only, never the raw file: the rule is QUOTED in this stylesheet's own module
   * doc, and reading the raw text is how `10h-GR10` came to not bite.
   */
  test('⚠ the hostname is BOUNDED in CSS — a title on an unbounded span still wraps the band', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'header.module.css'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rule = /\.hostname\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/max-width:\s*[0-9]/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
  });

  test('⚠ every cadence option renders — 1/2/5/10/30 s', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    for (const s of [1, 2, 5, 10, 30]) expect(html).toContain(`>${s} s<`);
  });

  // ⚠ ADDED BY 10e's TEST PHASE, 2026-09-09. 10e §4 renamed the cadence control's visible key
  // `refresh` -> `cadence` (§6.2's own word for it), and nothing asserted the rename. It is
  // load-bearing beyond cosmetics: this span reading `refresh` is exactly what made
  // `toContain('refresh')` inert in 10a (HANDOVER §0.4's second founding instance), and it is
  // the whole ground on which `10a-H13` was retired this loop. Backed by `10e-H3`.
  test('⚠ the cadence control is labelled "cadence", not "refresh" — the rename 10a-H13 was retired on', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('>cadence<');
    expect(html).not.toContain('>refresh<');
  });

  test('⚠ every window option renders — 10 min/30 min/2 h', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('>10 min<');
    expect(html).toContain('>30 min<');
    expect(html).toContain('>2 h<');
  });

  /*
   * ⚠ 10e §4 — the five controls lose their visible words (`⟳ refresh` → `⟳`, `❙❙ pause` →
   * `❙❙`, `⏻ logout` → `⏻`): the mock's glyph-only form, read by `aria-label`/`title` rather
   * than squeezed-in text. `toContain('refresh')`/`toContain('pause')`/`toContain('logout')`
   * are no longer safe substrings at all — `pause`, for one, is also satisfied by nothing else
   * in the markup once the button's own visible text is gone, so the assertion now targets the
   * ACCESSIBLE NAME, which is where the word actually lives post-10e.
   */
  test('⚠ refresh now and a pause control both render, named by their accessible names', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('aria-label="Refresh now"');
    expect(html).toContain('aria-label="Pause polling"');
  });

  test('⚠ logout renders behind a visual separator element', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('aria-label="Log out"');
    // The separator is its own element between the four controls and logout — not merely a
    // margin, so it survives independent of exact spacing values (unverifiable in jsdom).
    const controlsIndex = html.indexOf('aria-label="Pause polling"');
    const separatorIndex = html.indexOf('aria-hidden="true"', controlsIndex);
    const logoutIndex = html.indexOf('aria-label="Log out"');
    expect(separatorIndex).toBeGreaterThan(controlsIndex);
    expect(logoutIndex).toBeGreaterThan(separatorIndex);
  });
});

describe('⚠ no IP address and no kernel release — settled 2026-09-07', () => {
  test('⚠ the header never renders an IPv4-shaped string', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
  });

  test('⚠ the header never renders the word "kernel"', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html.toLowerCase()).not.toContain('kernel');
  });
});

describe('⚠ paused is a display mode, shown ALONGSIDE severity, never instead of it', () => {
  // ⚠ `data-mode="paused"` is ALSO in the markup whenever `mode="paused"`, independent of
  // `aggregateStatus`'s own output — a loose `toContain('paused')` passes on that attribute
  // alone and proves nothing about the visible status TEXT. Assert the literal joined string
  // `aggregateStatus` is documented to produce, not two substrings that can each be satisfied
  // by something else on the page. (Caught by this step's own harness: `10a-HS4`'s mutation,
  // which drops the word "paused" from the text while alarms remain nonzero, did not redden
  // the original loose version of this test.)
  test('⚠ paused with alarms renders the literal "paused · 6 alarms", not just the two halves', () => {
    const html = renderToStaticMarkup(<Header {...BASE} mode="paused" alarms={6} paused />);
    expect(html).toContain('paused · 6 alarms');
  });

  test('⚠ stale with alarms renders the literal "stale · 6 alarms", not just the two halves', () => {
    const html = renderToStaticMarkup(<Header {...BASE} mode="stale" alarms={6} />);
    expect(html).toContain('stale · 6 alarms');
  });

  test('⚠ zero alarms renders "all healthy", never the literal "0 alarms"', () => {
    const html = renderToStaticMarkup(<Header {...BASE} mode="live" alarms={0} />);
    expect(html).toContain('all healthy');
    expect(html).not.toContain('0 alarm');
  });

  test('⚠ a paused dashboard on an alarm still colours the dot by severity, not by mode', () => {
    const html = renderToStaticMarkup(
      <Header {...BASE} mode="paused" alarms={2} severity="alarm" paused />,
    );
    expect(html).toContain('data-severity="alarm"');
  });
});

/**
 * ⚠ F6 — `severity: Severity | null` is a boundary and every fixture above is on ONE side of
 * it (`BASE.severity` is `'normal'`; two tests pass `'alarm'`). ANCHOR §5: "every boundary
 * guard needs a fixture on both sides. Three steps shipped a guard tested in one direction
 * only." This is the missing side, and it is the side the prop's own doc forbids getting
 * wrong — `null` is "nothing has confirmed a band", **never green**.
 */
describe('⚠ severity === null — the "no band" side of the guard', () => {
  test('⚠ a null severity renders the "no band" treatment, never a severity word', () => {
    const html = renderToStaticMarkup(<Header {...BASE} severity={null} />);
    expect(html).toContain('data-severity="none"');
    expect(html).not.toContain('data-severity="normal"');
    expect(html).not.toContain('data-severity="watch"');
    expect(html).not.toContain('data-severity="alarm"');
  });

  test('⚠ a null severity with zero alarms does NOT claim "all healthy" beside a grey dot (F5)', () => {
    // The dot and the words are one reduction (§9). This is the join the two files make
    // together: `header-status.test.ts` proves the reduction, this proves the header hands it
    // the same `severity` it colours the dot with rather than a second, disagreeing input.
    const html = renderToStaticMarkup(<Header {...BASE} severity={null} mode="live" alarms={0} />);
    expect(html).toContain('data-severity="none"');
    expect(html).toContain('no readings');
    expect(html).not.toContain('all healthy');
  });
});

describe('interaction — real DOM events, real callbacks', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    container.remove();
  });

  const mount = (props: HeaderProps): (() => void) => {
    const root = createRoot(container);
    act(() => {
      root.render(<Header {...props} />);
    });
    return () => {
      act(() => {
        root.unmount();
      });
    };
  };

  test('⚠ changing the cadence select calls onSetCadence with the numeric value', () => {
    const onSetCadence = vi.fn();
    mount({ ...BASE, onSetCadence });
    const select = container.querySelector('select[aria-label="refresh cadence"]') as HTMLSelectElement;
    act(() => {
      select.value = '10';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSetCadence).toHaveBeenCalledWith(10 satisfies CadenceSeconds);
  });

  test('⚠ changing the window select calls onSetWindow with the numeric value', () => {
    const onSetWindow = vi.fn();
    mount({ ...BASE, onSetWindow });
    const select = container.querySelector('select[aria-label="chart window"]') as HTMLSelectElement;
    act(() => {
      select.value = '120';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSetWindow).toHaveBeenCalledWith(120 satisfies WindowMinutes);
  });

  // ⚠ 10e §4 — every button is glyph-only now, so lookups go through `aria-label`, not
  // `textContent`: a `textContent?.includes('refresh')` search finds nothing once the visible
  // word is gone, which would silently leave every one of these tests clicking `undefined`.
  test('⚠ clicking refresh calls onRefreshNow', () => {
    const onRefreshNow = vi.fn();
    mount({ ...BASE, onRefreshNow });
    const button = container.querySelector('button[aria-label="Refresh now"]');
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRefreshNow).toHaveBeenCalledTimes(1);
  });

  test('⚠ clicking pause/resume calls onPauseResume, and the accessible name tracks `paused`', () => {
    const onPauseResume = vi.fn();
    mount({ ...BASE, onPauseResume, paused: false });
    const pauseButton = container.querySelector('button[aria-label="Pause polling"]');
    expect(pauseButton).not.toBeNull();
    act(() => {
      pauseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPauseResume).toHaveBeenCalledTimes(1);
  });

  test('⚠ `paused=true` labels the same control "Resume polling", not "Pause polling"', () => {
    mount({ ...BASE, paused: true });
    const resumeButton = container.querySelector('button[aria-label="Resume polling"]');
    expect(resumeButton).not.toBeNull();
    expect(container.querySelector('button[aria-label="Pause polling"]')).toBeNull();
    // ⚠ The accessible name is one guard; the VISIBLE glyph is a separate piece of markup
    // (`{paused ? '▶' : '❙❙'}`) that a bug could leave stuck on `❙❙` while the aria-label
    // above still correctly says "Resume polling" — the two are computed independently.
    expect(resumeButton?.textContent).toBe('▶');
  });

  test('⚠ clicking logout calls onLogout', () => {
    const onLogout = vi.fn();
    mount({ ...BASE, onLogout });
    const button = container.querySelector('button[aria-label="Log out"]');
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
