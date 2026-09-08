// @vitest-environment jsdom
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

  test('⚠ every cadence option renders — 1/2/5/10/30 s', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    for (const s of [1, 2, 5, 10, 30]) expect(html).toContain(`>${s} s<`);
  });

  test('⚠ every window option renders — 10 min/30 min/2 h', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('>10 min<');
    expect(html).toContain('>30 min<');
    expect(html).toContain('>2 h<');
  });

  test('⚠ refresh now and a pause control both render', () => {
    // `toContain('refresh')` alone is inert here — it is also satisfied by the cadence
    // control's own label (`<span>refresh</span>`, §6.2's name for the cadence selector) and
    // by that select's `aria-label="refresh cadence"`, so it would still pass with the actual
    // refresh-now button deleted entirely. Assert the button's own glyph+text, which nothing
    // else in the markup produces (found the same way `10a-HS4` found the sibling on
    // "paused · 6 alarms" above — a second `toContain` this loose, checked because the first
    // one turned out real).
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('⟳ refresh');
    expect(html).toContain('pause');
  });

  test('⚠ logout renders behind a visual separator element', () => {
    const html = renderToStaticMarkup(<Header {...BASE} />);
    expect(html).toContain('logout');
    // The separator is its own element between the four controls and logout — not merely a
    // margin, so it survives independent of exact spacing values (unverifiable in jsdom).
    const controlsIndex = html.indexOf('pause');
    const separatorIndex = html.indexOf('aria-hidden="true"', controlsIndex);
    const logoutIndex = html.indexOf('logout');
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

  test('⚠ clicking refresh calls onRefreshNow', () => {
    const onRefreshNow = vi.fn();
    mount({ ...BASE, onRefreshNow });
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('refresh'));
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRefreshNow).toHaveBeenCalledTimes(1);
  });

  test('⚠ clicking pause/resume calls onPauseResume, and the label tracks `paused`', () => {
    const onPauseResume = vi.fn();
    mount({ ...BASE, onPauseResume, paused: false });
    const pauseButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('pause'),
    );
    expect(pauseButton?.textContent).toContain('pause');
    act(() => {
      pauseButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onPauseResume).toHaveBeenCalledTimes(1);
  });

  test('⚠ `paused=true` labels the same control "resume", not "pause"', () => {
    mount({ ...BASE, paused: true });
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('resume'));
    expect(button).toBeDefined();
    expect(button?.textContent).not.toContain('❙❙ pause');
  });

  test('⚠ clicking logout calls onLogout', () => {
    const onLogout = vi.fn();
    mount({ ...BASE, onLogout });
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('logout'));
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
