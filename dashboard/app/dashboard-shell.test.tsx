// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { EMPTY_CONDITION_STATE, conditionId } from '@/lib/conditions';
import type { DisplayedCondition } from '@/lib/conditions';
import { startEventLog } from '@/lib/client/events';
import { DEFAULT_CADENCE_SECONDS, DEFAULT_WINDOW_MINUTES } from '@/lib/client/prefs';
import { EMPTY_RING, appendSample } from '@/lib/client/ring';
import type { SampleRing } from '@/lib/client/ring';
import type { RuntimeState, TelemetryRuntime } from '@/lib/client/runtime';
import { everythingZero } from '@/lib/fixtures';
import { isoTimestamp } from '@/lib/types';
import type { TelemetrySnapshot } from '@/lib/types';

import { DashboardShell } from './dashboard-shell';
import shellStyles from './dashboard-shell.module.css';

/**
 * ⚠ **THE JOIN.** `PLAN.md` makes step 10 green when *"grid matches §6.1 placement; **paused
 * shows mode and alarm count**"* — and before this file existed, the entire non-null branch of
 * `dashboard-shell.tsx` was executed by nothing (10a-adversarial F7/F8, the two findings 10a's
 * reconciliation treated as deciding whether the step could close at all).
 *
 * The adversarial phase shipped four simultaneous wrong edits — `mode={'live'}`, `alarms={0}`,
 * an inverted pause/resume, and a dead cadence handler — and `pnpm verify` **exited 0 across
 * all 77 files**. That build ships a header which can never say "paused" or "stale" and reads
 * `● all healthy` on a box with six alarms: the step's own acceptance criterion, unable to
 * fail. `lib/client/header-status.ts` and `components/header.tsx` were each well tested **in
 * isolation**; nothing asserted the two are ever handed the real values. Q1's lesson exactly —
 * a mutation harness over the parts does not cover the join.
 *
 * ⚠ **How, and why not the real runtime.** `useTelemetry` is mocked, so this file drives the
 * shell with a `RuntimeState` it constructs and a runtime of `vi.fn()`s. No fetch, no poll
 * loop, no real cadence timer — the runtime's own behaviour is `lib/client/runtime.test.ts`'s
 * job and re-driving it here would buy nothing and cost the risk profile 10a already measured
 * once (the 506 s/OOM in `use-telemetry.test.tsx`'s note). What is under test is *this file's
 * wiring*: that each control reaches the right method, and that each displayed fact comes from
 * the state rather than a literal.
 */

vi.mock('@/lib/client/use-telemetry', () => ({
  useTelemetry: () => handle,
}));

const BASE_MS = Date.UTC(2026, 8, 6, 14, 0, 0, 0);

/** A ring holding one sample at `BASE_MS`, so `ageMs` has something to measure from. */
const ringWithSample = (over: Partial<TelemetrySnapshot> = {}): SampleRing =>
  appendSample(EMPTY_RING, {
    snapshot: { ...everythingZero, ts: isoTimestamp(new Date(BASE_MS).toISOString()), ...over },
    tsMs: BASE_MS,
  });

/** A whole `RuntimeState`, written out rather than partially cast — `series.test.ts`'s
 *  precedent, for its reason: a field added to the contract must be confronted here. */
const stateOf = (over: Partial<RuntimeState> = {}): RuntimeState => ({
  preferences: { cadenceSeconds: DEFAULT_CADENCE_SECONDS, windowMinutes: DEFAULT_WINDOW_MINUTES },
  ring: ringWithSample(),
  conditions: EMPTY_CONDITION_STATE,
  displayed: [],
  events: startEventLog(BASE_MS),
  gaps: [],
  paused: false,
  hidden: false,
  consecutiveFailures: 0,
  lastFailure: null,
  mode: 'live',
  severity: 'normal',
  alarms: 0,
  unknownStanding: [],
  ...over,
});

let counter = 0;
const alarmCondition = (over: Partial<DisplayedCondition> = {}): DisplayedCondition => {
  counter += 1;
  return {
    kind: 'disk_free',
    subject: `fixture-${counter}`,
    id: conditionId('disk_free', `fixture-${counter}`),
    label: `condition ${counter}`,
    value: '82 °C',
    severity: 'alarm',
    displaySeverity: 'alarm',
    declaredStanding: false,
    suppressed: false,
    banner: true,
    sinceMs: BASE_MS,
    stale: false,
    lastSeenMs: BASE_MS,
    enumeration: null,
    ...over,
  };
};

/** The four §6.2 controls, as spies. Cast because `TelemetryRuntime` is a class with private
 *  fields no stub can reproduce — and because the alternative, constructing a real one, is the
 *  poll loop this file exists to keep out. Only these five members are ever called. */
const runtimeStub = () => {
  const stub = {
    setCadence: vi.fn(),
    setWindow: vi.fn(),
    refreshNow: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return { spies: stub, runtime: stub as unknown as TelemetryRuntime };
};

let handle: { state: RuntimeState | null; runtime: TelemetryRuntime | null };
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = (): (() => void) => {
  const root = createRoot(container);
  act(() => {
    root.render(<DashboardShell />);
  });
  return () => {
    act(() => {
      root.unmount();
    });
  };
};

const render = (state: RuntimeState, runtime: TelemetryRuntime = runtimeStub().runtime): string => {
  handle = { state, runtime };
  const unmount = mount();
  const html = container.innerHTML;
  unmount();
  return html;
};

const buttonWith = (text: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

describe('⚠ PLAN.md’s green criterion, through the shell that actually renders it', () => {
  test('⚠ a paused dashboard on six alarms shows the MODE and the COUNT, from the state', () => {
    // The literal `PLAN.md` names. `mode={'live'}` or `alarms={0}` hard-coded in the shell
    // both fail here; both shipped green before this file existed.
    const html = render(
      stateOf({
        mode: 'paused',
        paused: true,
        alarms: 6,
        severity: 'alarm',
        displayed: Array.from({ length: 6 }, () => alarmCondition()),
      }),
    );
    expect(html).toContain('paused · 6 alarms');
  });

  test('⚠ a failed poll shows "stale" and the count, not a frozen "live"', () => {
    const html = render(stateOf({ mode: 'stale', alarms: 2, severity: 'alarm' }));
    expect(html).toContain('stale · 2 alarms');
  });

  test('⚠ a quiet live dashboard reads "all healthy" — the count omitted, not printed as 0', () => {
    const html = render(stateOf({ mode: 'live', alarms: 0, severity: 'normal' }));
    expect(html).toContain('all healthy');
    expect(html).not.toContain('0 alarm');
  });

  test('⚠ the dot’s colour comes from state.severity, and the words agree with it (F5/O2)', () => {
    // One reduction: `severity: null` is "nothing has a band", so the text may not claim
    // health. This is the shell's half of the join `header-status.test.ts` proves in isolation.
    const html = render(stateOf({ severity: null, alarms: 0, mode: 'live' }));
    expect(html).toContain('data-severity="none"');
    expect(html).toContain('no readings');
    expect(html).not.toContain('all healthy');
  });

  test('⚠ every displayed alarm reaches the banner, with the same count the header announces', () => {
    const html = render(
      stateOf({
        alarms: 3,
        severity: 'alarm',
        displayed: [
          alarmCondition({ label: 'GPU 0 temperature' }),
          alarmCondition({ label: 'GPU 1 temperature' }),
          alarmCondition({ label: 'fan 5' }),
        ],
      }),
    );
    expect(html).toContain('3 active alarms');
    expect(html).toContain('GPU 0 temperature');
    expect(html).toContain('GPU 1 temperature');
    expect(html).toContain('fan 5');
  });

  test('⚠ nothing alarm-level renders no banner at all', () => {
    expect(render(stateOf())).not.toContain('active alarm');
  });
});

describe('⚠ every §6.2 control reaches the right runtime method', () => {
  test('⚠ pause/resume is not inverted: paused=false pauses, paused=true resumes', () => {
    // The adversarial's third edit swapped these two and nothing went red. Inverted, the
    // button can never un-stick a paused dashboard — the one control whose whole purpose is
    // getting out of the state it puts you in.
    const live = runtimeStub();
    handle = { state: stateOf({ paused: false }), runtime: live.runtime };
    let unmount = mount();
    act(() => {
      buttonWith('pause')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(live.spies.pause).toHaveBeenCalledTimes(1);
    expect(live.spies.resume).not.toHaveBeenCalled();
    unmount();

    const paused = runtimeStub();
    handle = { state: stateOf({ paused: true, mode: 'paused' }), runtime: paused.runtime };
    unmount = mount();
    act(() => {
      buttonWith('resume')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(paused.spies.resume).toHaveBeenCalledTimes(1);
    expect(paused.spies.pause).not.toHaveBeenCalled();
    unmount();
  });

  test('⚠ the cadence select reaches setCadence with the chosen value, not a dropped handler', () => {
    const { spies, runtime } = runtimeStub();
    handle = { state: stateOf(), runtime };
    const unmount = mount();
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="refresh cadence"]');
    act(() => {
      if (select) {
        select.value = '10';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    expect(spies.setCadence).toHaveBeenCalledWith(10);
    unmount();
  });

  test('⚠ the window select reaches setWindow with the chosen value', () => {
    const { spies, runtime } = runtimeStub();
    handle = { state: stateOf(), runtime };
    const unmount = mount();
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="chart window"]');
    act(() => {
      if (select) {
        select.value = '120';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    expect(spies.setWindow).toHaveBeenCalledWith(120);
    unmount();
  });

  test('⚠ refresh now reaches refreshNow', () => {
    const { spies, runtime } = runtimeStub();
    handle = { state: stateOf(), runtime };
    const unmount = mount();
    act(() => {
      buttonWith('⟳ refresh')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(spies.refreshNow).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('⚠ the selects show the state’s OWN preferences, not a hard-coded default', () => {
    handle = { state: stateOf({ preferences: { cadenceSeconds: 30, windowMinutes: 10 } }), runtime: runtimeStub().runtime };
    const unmount = mount();
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="refresh cadence"]')?.value).toBe('30');
    expect(container.querySelector<HTMLSelectElement>('select[aria-label="chart window"]')?.value).toBe('10');
    unmount();
  });
});

describe('⚠ D2/F8 — the age indicator moves because TIME passed, not because a poll landed', () => {
  test('⚠ the age advances on the tick with the store completely unchanged', () => {
    // ⚠ This is the whole point of `useNowTick` (SCOPE §2.5b), and F8 showed nothing noticed
    // when the hook was DELETED and replaced with a render-time `Date.now()`: with the store
    // constant, React never re-renders, so the age freezes at whatever it was when the last
    // poll landed — "looks right in a fast-cadence fixture and freezes on a real failure, the
    // one thing the indicator exists to prevent". The state object below is referentially
    // identical across every advance; only the clock moves.
    vi.useFakeTimers();
    vi.setSystemTime(BASE_MS + 2_000);
    handle = { state: stateOf(), runtime: runtimeStub().runtime };
    const unmount = mount();
    expect(container.textContent).toContain('2 s ago');

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(container.textContent).toContain('7 s ago');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.textContent).toContain('1:07 ago');
    unmount();
  });

  test('⚠ with no sample yet the age is a bare em dash — never a unit word glued to one (F9)', () => {
    const html = render(stateOf({ ring: EMPTY_RING }));
    expect(html).toContain('—');
    expect(html).not.toContain('— ago');
  });
});

describe('⚠ F13 — the header and the banner are ONE sticky band, not two sticky siblings', () => {
  test('⚠ both live inside a single wrapper element, so they cannot pin to the same rectangle', () => {
    handle = {
      state: stateOf({ alarms: 1, severity: 'alarm', displayed: [alarmCondition()] }),
      runtime: runtimeStub().runtime,
    };
    const unmount = mount();
    // The CSS itself is unobservable in jsdom; what IS observable, and what the fix depends
    // on, is the DOM shape: one element containing both. Two `position: sticky; top: 0`
    // siblings occupy the same viewport rectangle and the opaque one wins — which is why the
    // banner vanished the moment the page scrolled, invisibly at scroll 0.
    const header = container.querySelector('header');
    const banner = container.querySelector('[role="alert"]');
    expect(header).not.toBeNull();
    expect(banner).not.toBeNull();
    const band = header?.parentElement;
    expect(band).toBe(banner?.parentElement);
    // Not merely "some shared parent" — the mount container is also that. It must be the
    // element carrying `.stickyBand`, which is the one thing `position: sticky` is on.
    expect(band).not.toBe(container);
    expect(band?.className).toBe(shellStyles.stickyBand);
    unmount();
  });
});

describe('⚠ F15 — logout must survive its own navigation', () => {
  test('⚠ the DELETE is keepalive, or the navigation on the next line can cancel it', () => {
    // Without `keepalive`, the fetch is terminated when the document unloads — which
    // `window.location.assign` starts immediately. The cookie is `httpOnly`, so a dropped
    // DELETE leaves a live 30-day session behind a login screen (§5), and the code comment
    // used to assert the opposite.
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchSpy);
    // jsdom's `location.assign` is non-configurable (so `vi.spyOn` throws) but `window
    // .location` itself is — replace the whole object, and restore it after. Without a stub
    // jsdom would emit a real "Not implemented: navigation" error into every run.
    const realLocation = Object.getOwnPropertyDescriptor(window, 'location');
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } });

    handle = { state: stateOf(), runtime: runtimeStub().runtime };
    const unmount = mount();
    act(() => {
      buttonWith('logout')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [path, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe('/api/session');
    expect(init.method).toBe('DELETE');
    expect(init.keepalive).toBe(true);
    expect(assign).toHaveBeenCalledWith('/login');
    unmount();
    vi.unstubAllGlobals();
    if (realLocation) Object.defineProperty(window, 'location', realLocation);
  });
});

describe('⚠ F16 — all nine slots really receive PanelProps, panelId included', () => {
  test('⚠ nine distinct panel ids render, one per grid slot', () => {
    const html = render(stateOf());
    const ids = [...html.matchAll(/data-panel-id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(9);
    expect(ids.sort()).toEqual(
      [
        'cooling',
        'cpu',
        'gpu0',
        'gpu1',
        'memory',
        'safety',
        'serving',
        'session-event-log',
        'storage-and-network',
      ].sort(),
    );
  });

  test('⚠ each panel id sits inside the grid slot of the same name', () => {
    // The id is the SVG-id namespace (L4). If it did not track the slot, two mounted copies of
    // one panel component could still collide — which is the collision the namespace exists to
    // prevent, and it is invisible to `tsc`.
    const html = render(stateOf());
    for (const slot of ['gpu0', 'gpu1', 'cpu', 'memory', 'cooling', 'safety', 'serving']) {
      const from = html.indexOf(`data-slot="${slot}"`);
      const next = html.indexOf('data-slot=', from + 1);
      const cell = html.slice(from, next === -1 ? undefined : next);
      expect(cell).toContain(`data-panel-id="${slot}"`);
    }
  });
});

describe('⚠ F10 — a stale alarm reaches the banner carrying the age of its reading', () => {
  test('⚠ the shell formats the stale age from its own tick, not from `sinceMs`', () => {
    // §6.5's archetype: GPU confirmed at alarm, then `nvidia-smi` dies. The condition keeps
    // pinning the banner (§9: staleness never lowers a severity) — what it must not do is look
    // like a live reading. `sinceMs` here is 10 minutes before the last observation, so a
    // formatter that used the wrong field renders a visibly different number.
    vi.useFakeTimers();
    vi.setSystemTime(BASE_MS + 130_000);
    handle = {
      state: stateOf({
        alarms: 1,
        severity: 'alarm',
        displayed: [
          alarmCondition({
            label: 'GPU 0 temperature',
            sinceMs: BASE_MS - 600_000,
            lastSeenMs: BASE_MS + 10_000,
            stale: true,
          }),
        ],
      }),
      runtime: runtimeStub().runtime,
    };
    const unmount = mount();
    expect(container.textContent).toContain('last read 2:00 ago');
    unmount();
  });

  test('⚠ a LIVE alarm’s banner carries no age at all — the two must not look alike', () => {
    const html = render(
      stateOf({ alarms: 1, severity: 'alarm', displayed: [alarmCondition()] }),
    );
    expect(html).toContain('active alarm');
    expect(html).not.toContain('last read');
  });
});

describe('⚠ the identity fields come from the snapshot, not from a placeholder', () => {
  test('⚠ the hostname is the snapshot’s own, not a literal', () => {
    // Deliberately NOT `ai-server`: the fixture's own value is `ai-server`, so asserting that
    // would pass against a hard-coded string — the exact inert shape this project has found in
    // every step. A distinctive value is what makes the assertion mean anything.
    const html = render(stateOf({ ring: ringWithSample({ hostname: 'probe-host-42' }) }));
    expect(html).toContain('probe-host-42');
  });

  test('⚠ a null hostname renders the em dash, not a blank or a fallback name (invariant 1)', () => {
    const html = render(stateOf({ ring: ringWithSample({ hostname: null }) }));
    expect(html).toContain('>—<');
    expect(html).not.toContain('ai-server');
  });
});
