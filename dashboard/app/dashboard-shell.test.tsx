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
import { celsius, isoTimestamp, mhz, mib, percent, watts } from '@/lib/types';
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

// ⚠ 10e §4 — every header button is glyph-only now (`⟳`, `❙❙`/`▶`, `⏻`); the word that used to
// be in `textContent` lives in `aria-label` instead. Looked up by that name, not by text.
const buttonWith = (accessibleName: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${accessibleName}"]`);

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
      buttonWith('Pause polling')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(live.spies.pause).toHaveBeenCalledTimes(1);
    expect(live.spies.resume).not.toHaveBeenCalled();
    unmount();

    const paused = runtimeStub();
    handle = { state: stateOf({ paused: true, mode: 'paused' }), runtime: paused.runtime };
    unmount = mount();
    act(() => {
      buttonWith('Resume polling')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
      buttonWith('Refresh now')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
      buttonWith('Log out')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

/** The full markup of one grid slot — from its `data-slot` marker up to the next one (or the
 *  end of the document for the last slot in DOM order). Scoped assertions over the SLOT, not
 *  the document — the exact rule `HANDOVER.md` §0.4 draws after three separate document-wide
 *  `toContain`s turned out to be inert. */
const cellFor = (html: string, slot: string): string => {
  const from = html.indexOf(`data-slot="${slot}"`);
  const next = html.indexOf('data-slot=', from + 1);
  return html.slice(from, next === -1 ? undefined : next);
};

/** §6.2's own title for each grid slot, exactly as each real panel renders it (10c1). This
 *  replaces `PanelPlaceholder`'s old `data-panel-id` marker: once the nine real panels are
 *  wired, the panel's own head IS the observable fact — a genuinely stronger assertion than a
 *  marker that only ever existed for the test. */
const SLOT_TITLE: Readonly<Record<string, string>> = {
  gpu0: 'GPU 0',
  gpu1: 'GPU 1',
  cpu: 'cpu',
  memory: 'memory',
  cooling: 'cooling',
  safety: 'safety',
  'storage-and-network': 'storage &amp; network',
  serving: 'serving',
  'session-event-log': 'session event log',
};

/**
 * `everythingZero` enumerates only GPU 0 (§6.5's "not enumerated" shape) — several tests below
 * need a genuine SECOND card, or `GpuPanel` takes the "card not enumerated" branch for `gpu1`
 * and renders no chart at all, which is a real fixture fact rather than a test bug.
 *
 * ⚠ **The two cards must DIFFER in the fields the panel renders** (10c1-A10, and it is the
 * finding that explains three others). This helper originally built card 1 as
 * `{ ...gpu0, index: 1 }` — identical `name`, `bus`, `tempC`, VRAM, everything. Two
 * indistinguishable subjects make a positional read observationally identical to an
 * index read, so `gpus[index]`, `serving[index]` and a trace lambda hard-coded to card 0 all
 * shipped green through a file that already had a two-GPU helper. The rule this loop leaves
 * behind: **a fixture whose two subjects are identical cannot discriminate between them.**
 */
const GPU0_TEMP_C = celsius(66);
const GPU1_TEMP_C = celsius(55);
// ⚠ WIDENED BY 10e's TEST PHASE, 2026-09-09. The rule above was applied to four fields only —
// `index`, `name`, `bus`, `tempC` — while `powerW`, `memUsedMiB`, `utilPct` and `smClockMHz`
// stayed identical (all zero, from `everythingZero`). A positional read of ANY of those four is
// still observationally identical here, which is the same defect the doc above describes, at
// the fields it did not reach. Every value below is chosen to keep card 1's §6.3 bands equal to
// card 0's (VRAM 16,384/32,768 = 50 %, normal, as 0 % is), so widening the fixture cannot move
// a chip, the aggregate dot or the alarm count in any other test in this file.
const stateOfTwoGpus = (): RuntimeState => {
  const gpu0 = everythingZero.gpus?.[0];
  if (gpu0 === undefined) throw new Error('fixture invariant: everythingZero.gpus[0] must exist');
  return stateOf({
    ring: ringWithSample({
      gpus: [
        { ...gpu0, tempC: GPU0_TEMP_C },
        {
          ...gpu0,
          index: 1,
          name: 'Tesla PG500-216',
          bus: '00000000:65:00.0',
          tempC: GPU1_TEMP_C,
          powerW: watts(231),
          memUsedMiB: mib(16384),
          utilPct: percent(97),
          smClockMHz: mhz(1290),
        },
      ],
    }),
  });
};

describe('⚠ F16 — all nine slots really receive PanelProps, panelId included', () => {
  test('⚠ every grid slot renders the §6.2 panel titled for THAT slot, never a swapped neighbour', () => {
    // 10c1 replaced `PanelPlaceholder` with the nine real panels — this is the wiring-level
    // guard 10a-PP2 used to carry via the placeholder's marker attribute, now checked against
    // real production content instead. A slot fed the wrong component (a copy-paste in the
    // `<Grid>` JSX) or the wrong literal `panelId` both show up here as the wrong title inside
    // the right cell.
    const html = render(stateOf());
    for (const [slot, title] of Object.entries(SLOT_TITLE)) {
      expect(cellFor(html, slot)).toContain(`>${title}<`);
    }
  });

  test('⚠ GPU 0 and GPU 1 mint DISTINCT, index-derived accessible names — the namespace 10b-F12 protects', () => {
    // `GpuPanel` derives its card index FROM `panelId` (10b-F12) — this is the one place a
    // wrong literal `panelId="gpu0"` reaching the `gpu1` slot in `dashboard-shell.tsx` itself
    // (as opposed to inside `GpuPanel`) would be caught: it fails here, not in `gpu-panel.test.tsx`,
    // because that file cannot see which literal the SHELL chose to pass.
    // ⚠ 10e replaced the ≥1600px promotion's `StackedTimeSeriesChart` (whose `id` prop used to
    // surface as `${id}-hatch` on its gap pattern) with the SAME `Sparkline` primitive GPU
    // already used below 1600px — and `Sparkline` mints no ids at all (its own module doc:
    // "this component draws no `<pattern>`... it has never needed one"). The index-derived
    // `aria-label` (`Hero`'s and both `Sparkline`s') is the namespace that survives instead —
    // still index-derived, still asserted here rather than in `gpu-panel.test.tsx`, for the
    // same reason the id used to be.
    const html = render(stateOfTwoGpus());
    expect(cellFor(html, 'gpu0')).toContain('aria-label="GPU 0 temperature over the selected window"');
    expect(cellFor(html, 'gpu1')).toContain('aria-label="GPU 1 temperature over the selected window"');
    expect(cellFor(html, 'gpu0')).not.toContain('aria-label="GPU 1 temperature over the selected window"');
    expect(cellFor(html, 'gpu1')).not.toContain('aria-label="GPU 0 temperature over the selected window"');
  });

  test('⚠ each GPU cell renders ITS OWN card’s readings — the two slots are not one card twice', () => {
    // 10c1-A10. The only per-card fact this file could observe before was the hatch id, which
    // is derived from `panelId` rather than from the data — so a shell that fed both slots the
    // same card, or a panel that read `gpus[position]`, was invisible here. These assertions
    // are over the SLOT (`cellFor`), never the document, per HANDOVER §0.4.
    const html = render(stateOfTwoGpus());
    // ⚠ 10e's test phase: `66 °C` as ONE string is now only reachable through the chart
    // tooltip's `formatValue` — `Hero` renders the value and the unit as two sibling spans —
    // so these four lines discriminate the TRACE and no longer the headline figure. `>66<` /
    // `>55<` are the Hero's own element, added beside them rather than instead of them.
    expect(cellFor(html, 'gpu0')).toContain('66 °C');
    expect(cellFor(html, 'gpu0')).not.toContain('55 °C');
    expect(cellFor(html, 'gpu1')).toContain('55 °C');
    expect(cellFor(html, 'gpu1')).not.toContain('66 °C');
    expect(cellFor(html, 'gpu0')).toContain('>66<');
    expect(cellFor(html, 'gpu1')).toContain('>55<');
    // The four readings the fixture used to share, now per card — a positional read of any of
    // them was invisible here until 10e's test phase widened `stateOfTwoGpus`.
    expect(cellFor(html, 'gpu1')).toContain('231.0');
    expect(cellFor(html, 'gpu0')).not.toContain('231.0');
    expect(cellFor(html, 'gpu1')).toContain('1,290 MHz');
    expect(cellFor(html, 'gpu0')).not.toContain('1,290 MHz');
    expect(cellFor(html, 'gpu1')).toContain('16,384');
    expect(cellFor(html, 'gpu0')).not.toContain('16,384');
    // Identity, not just measurement: the subtitle is the driver's raw name/bus per card.
    expect(cellFor(html, 'gpu1')).toContain('00000000:65:00.0');
    expect(cellFor(html, 'gpu0')).not.toContain('00000000:65:00.0');
  });

  test('⚠ COOLING mints its shared-time chart id under its own panelId prefix', () => {
    const html = render(stateOf());
    expect(cellFor(html, 'cooling')).toContain('id="cooling-chart-hatch"');
  });
});

describe('⚠ 10c1 — the chart/table toggle is shell state, per PANEL, not one flag for the page', () => {
  test('⚠ every chart-bearing panel starts in chart view, with its own toggle control present', () => {
    const html = render(stateOfTwoGpus());
    expect(html).not.toContain('data-role="table-view"');
    // The control itself: `chart-view-toggle.tsx` renders `aria-label="…: show as table"` only
    // when a caller supplies `onToggleView` — GPU 0, GPU 1, CPU and COOLING all wire it, so the
    // sentence appears at least that many times. (10e §2.0 shortened the VISIBLE label to
    // `table`/`chart`, which is too short a substring to count reliably on its own; the fuller
    // aria-label sentence is unchanged and unambiguous.)
    expect(html.split('show as table').length - 1).toBeGreaterThanOrEqual(4);
  });

  /** Click the chart/table toggle inside one grid slot, and return the markup the shell
   *  re-rendered. ⚠ 10e §2.0 moved the control into the panel HEAD and shortened its visible
   *  label to `table`/`chart` — too short and too generic a substring to match reliably (the
   *  word "chart" appears elsewhere in this markup). `aria-pressed` is the toggle's own,
   *  stable hook: it is the only button in a chart-bearing panel that carries it. */
  const clickToggleIn = (slot: string): void => {
    const button = container.querySelector(`[data-slot="${slot}"] button[aria-pressed]`);
    expect(button, `no chart/table toggle rendered in the ${slot} slot`).not.toBeNull();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  test('⚠ toggling GPU 0 to table view does NOT flip GPU 1, CPU or COOLING — independent state', () => {
    // ⚠ `stateOfTwoGpus()`, NOT `stateOf()` (10c1-A3). Under the one-card state `everythingZero`
    // provides, the `gpu1` slot renders §6.5's "card not enumerated" takeover — no `<svg>`, no
    // button, no `data-role="table-view"` — so the negative assertion below could not fail
    // under ANY mutation of the shell's GPU 1 wiring. It read as independence and asserted the
    // fixture. Same species as A10: an assertion whose subject does not exist is not a guard.
    handle = { state: stateOfTwoGpus(), runtime: runtimeStub().runtime };
    const unmount = mount();
    // The precondition the old version silently lacked, asserted rather than assumed.
    expect(cellFor(container.innerHTML, 'gpu1')).not.toContain('card not enumerated');
    clickToggleIn('gpu0');
    const html = container.innerHTML;
    expect(cellFor(html, 'gpu0')).toContain('data-role="table-view"');
    expect(cellFor(html, 'gpu1')).not.toContain('data-role="table-view"');
    expect(cellFor(html, 'cpu')).not.toContain('data-role="table-view"');
    expect(cellFor(html, 'cooling')).not.toContain('data-role="table-view"');
    unmount();
  });

  test('⚠ GPU 1’s own toggle flips GPU 1 — the slot’s wiring, not the shared mechanism', () => {
    // 10c1-A3. `10c-DS2/3/4` mutate `toggleChartView`/`INITIAL_CHART_VIEWS` — the mechanism the
    // four slots share. They say nothing about the four PER-SLOT wirings, and only `gpu0` and
    // `cpu` were ever clicked. A `gpu1` slot fed `chartViews.gpu0`/`toggleChartView('gpu0')`
    // ships green: on the real box an operator clicks GPU 1's button, GPU 0's chart becomes a
    // table, and the card they were reading changes underneath them.
    handle = { state: stateOfTwoGpus(), runtime: runtimeStub().runtime };
    const unmount = mount();
    clickToggleIn('gpu1');
    const html = container.innerHTML;
    expect(cellFor(html, 'gpu1')).toContain('data-role="table-view"');
    expect(cellFor(html, 'gpu0')).not.toContain('data-role="table-view"');
    unmount();
  });

  test('⚠ COOLING’s own toggle flips COOLING — the fourth wiring, previously never clicked', () => {
    // 10c1-A4, the same defect at the fourth call site. COOLING's `view=` is guarded by the
    // independence test above (feeding it another panel's entry would flip it when GPU 0 is
    // clicked); its `onToggleView=` was guarded by nothing, because nothing clicked it.
    handle = { state: stateOfTwoGpus(), runtime: runtimeStub().runtime };
    const unmount = mount();
    clickToggleIn('cooling');
    const html = container.innerHTML;
    expect(cellFor(html, 'cooling')).toContain('data-role="table-view"');
    expect(cellFor(html, 'gpu0')).not.toContain('data-role="table-view"');
    expect(cellFor(html, 'gpu1')).not.toContain('data-role="table-view"');
    expect(cellFor(html, 'cpu')).not.toContain('data-role="table-view"');
    unmount();
  });

  test('⚠ toggling GPU 0 then CPU leaves GPU 0 STILL in table view — one flip must not reset another', () => {
    // The mutation this defends: `setChartViews` spreading `INITIAL_CHART_VIEWS` instead of
    // `prev` would silently reset every OTHER panel back to chart view on each toggle — invisible
    // if only ever one panel is toggled per test.
    handle = { state: stateOf(), runtime: runtimeStub().runtime };
    const unmount = mount();
    const toggleFor = (slot: string) =>
      container.querySelector(`[data-slot="${slot}"] button[aria-pressed]`);
    act(() => {
      toggleFor('gpu0')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      toggleFor('cpu')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const html = container.innerHTML;
    expect(cellFor(html, 'gpu0')).toContain('data-role="table-view"');
    expect(cellFor(html, 'cpu')).toContain('data-role="table-view"');
    unmount();
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

describe('⚠ S-C — the banner names "since" as an ELAPSED duration, never a clock time', () => {
  test('⚠ a multi-day confirmation reads "for 2 d 06:00"; a same-day one reads the hour form, both from the same clock', () => {
    // §6.4's own justifying example never leaves one day; decision 7 makes multi-day the
    // expected case here, and `since 03:00:14` on a wall panel open since Friday is
    // indistinguishable from six hours ago. Both sides of the day boundary are fixtured, per
    // ANCHOR §5's "every boundary guard needs a fixture on both sides" — one step in this
    // pipeline shipped it in one direction only.
    vi.useFakeTimers();
    vi.setSystemTime(BASE_MS);
    handle = {
      state: stateOf({
        alarms: 2,
        severity: 'alarm',
        displayed: [
          // 2 d 06:00 ago — SPEC §6.4's own literal example for the ruling.
          alarmCondition({ label: 'GPU 0 temperature', sinceMs: BASE_MS - (2 * 86_400 + 6 * 3_600) * 1_000 }),
          // 06:00 ago, same day — the "under one day" side of the boundary.
          alarmCondition({ label: 'fan5', sinceMs: BASE_MS - 6 * 3_600 * 1_000 }),
        ],
      }),
      runtime: runtimeStub().runtime,
    };
    const unmount = mount();
    expect(container.textContent).toContain('for 2 d 06:00');
    expect(container.textContent).toContain('for 06:00');
    // ⚠ Never a clock time — F12's exact defect, and the alternative the ruling explicitly
    // declined (a date prefix on the clock instant).
    expect(container.textContent).not.toMatch(/since \d{2}:\d{2}:\d{2}/);
    unmount();
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

/**
 * ⚠ 10f-A6, 2026-09-09 — **a bounded well's accessible NAME must be unique on the page.**
 *
 * 10f's build gave every `PanelNotes` block the constant name `collector messages` and every
 * `StatusRow` well `` `${label} explanation` ``. Measured by the adversarial phase on the
 * all-collectors-failed page at 1280×1024: **seven** wells announced `collector messages`
 * (GPU 0, GPU 1, COOLING, CPU, MEMORY, SERVING, and STORAGE twice — its panel block and its
 * link block, adjacent in the same panel), and `fan service explanation` named two different
 * units in two different panels (COOLING's `gpu-fan-control.service` row and SAFETY's own
 * row, both labelled `fan service`, both explained by `dbus` at once). That page has 25 tab
 * stops, 16 of them wells, and it is the page an operator only reaches BECAUSE something is
 * wrong.
 *
 * ⚠ Why it belongs HERE rather than in either primitive's own test file: uniqueness is a
 * property of the assembled PAGE. `panel-notes.test.tsx` can prove the name is the subject's,
 * and `status-row.test.tsx` can prove it carries the panel's — neither can see that nine call
 * sites chose nine different subjects, which is the property that actually holds the guarantee.
 * `PanelShell` renders a bare `<section>` with no accessible name (ARIA maps it to `generic`),
 * so a well's own name is the whole of what a screen reader announces about where it is.
 *
 * Backed by `10f-PN5` (the primitive's name goes back to a constant), `10f-SR8` (a row's well
 * drops its panel qualifier) and `10f-SN4` (two wells in ONE panel are given one subject).
 */
describe('⚠ 10f-A6 — every bounded well on the page announces a DIFFERENT name', () => {
  /** One entry per §3.7 source that reaches a well, so every well on the page renders at once. */
  const EVERY_WELL_ERRORS = [
    { source: 'nvidia-smi', message: 'nvidia-smi: ENOENT' },
    { source: 'coretemp', message: 'coretemp: no hwmon of that name' },
    { source: 'proc-meminfo', message: '/proc/meminfo: EACCES' },
    { source: 'dell-smm', message: 'no hwmon named dell_smm' },
    { source: 'dbus', message: 'dbus: connection refused' },
    { source: 'statvfs', message: '/home: ENOENT' },
    { source: 'net-operstate', message: 'eno1/operstate: ENOENT' },
    { source: 'llama-env', message: '/etc/llama-server: ENOENT' },
    { source: 'ufw', message: '/etc/ufw/ufw.conf: ENOENT' },
    { source: 'dkms', message: 'dkms: not built for 7.0.0-31-generic' },
  ] as const;

  const degradedPage = (): string =>
    render(
      stateOf({
        ring: ringWithSample({
          errors: [...EVERY_WELL_ERRORS],
          // Both cards enumerated, so BOTH GPU wells render — the retired-card branch renders
          // no `errors[]` at all (10e-Q4), which would hide half of this property.
          gpus: [
            { ...everythingZero.gpus![0]!, index: 0 },
            { ...everythingZero.gpus![0]!, index: 1, bus: '98:00.0' },
          ],
          // A real instance row, so SERVING renders rows rather than its takeover branch.
          serving: [
            { instance: 0, port: null, unitState: null, model: null, ctx: null, health: null },
          ],
        }),
      }),
    );

  test('⚠ no two role="group" wells share an accessible name', () => {
    const html = degradedPage();
    const names = [...html.matchAll(/role="group"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]!);
    // Non-vacuity: this fixture must actually put the wells on the page. Ten sources reach a
    // well; a run that finds a handful is a run measuring the wrong page.
    expect(names.length).toBeGreaterThanOrEqual(12);
    const seen = new Map<string, number>();
    for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
    const duplicated = [...seen].filter(([, n]) => n > 1).map(([name, n]) => `${name} ×${n}`);
    expect(duplicated).toEqual([]);
  });

  test('⚠ the names are the PANELS’ own, not one constant repeated', () => {
    // The positive half: a run in which every well were named `collector messages` would
    // satisfy "distinct" only by accident of some other group. These are the subjects the
    // nine call sites pass, and they are the panel titles already on the screen.
    const html = degradedPage();
    for (const name of [
      'GPU 0 messages',
      'GPU 1 messages',
      'cpu messages',
      'memory messages',
      'cooling messages',
      'storage &amp; network messages',
      'link messages',
      'serving messages',
      'safety ufw enforcing explanation',
      'cooling fan service explanation',
      'safety fan service explanation',
    ]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(html).not.toContain('aria-label="collector messages"');
  });
});
