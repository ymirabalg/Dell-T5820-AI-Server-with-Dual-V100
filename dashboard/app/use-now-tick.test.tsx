// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useNowTick } from './use-now-tick';

/**
 * D2/SCOPE §2.5b: "the age indicator needs its OWN interval … do not tick it off store
 * changes." This hook is that interval, in isolation from `useTelemetry` entirely — the
 * property under test is exactly that it advances from time passing alone, with nothing else
 * changing at all: no new props, no re-render forced from outside, no store to subscribe to.
 */

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function Probe({ intervalMs, values }: { intervalMs: number; values: number[] }) {
  const now = useNowTick(intervalMs);
  values.push(now);
  return null;
}

const mount = (intervalMs: number, values: number[]): void => {
  root = createRoot(container);
  act(() => {
    root.render(<Probe intervalMs={intervalMs} values={values} />);
  });
};

describe('⚠ the tick advances from time passing alone — no prop change, no store', () => {
  test('⚠ three interval advances produce three distinct, increasing values', () => {
    vi.setSystemTime(0);
    const values: number[] = [];
    mount(1000, values);
    expect(values).toEqual([0]);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The same component, same props, three re-renders with no external input — the tick's
    // own clock is the only thing that moved.
    expect(values).toEqual([0, 1000, 2000, 3000]);
  });

  test('a tick shorter than one interval produces no additional render', () => {
    vi.setSystemTime(0);
    const values: number[] = [];
    mount(1000, values);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(values).toEqual([0]);
  });
});

describe('⚠ unmount stops the timer — a leaked interval would poll a dead tree forever', () => {
  test('⚠ clearInterval is called on unmount, before the next tick would have fired', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    vi.setSystemTime(0);
    const values: number[] = [];
    mount(1000, values);

    act(() => {
      root.unmount();
    });
    // `afterEach`'s own `unmount()` would double-call; make this call the only one it counts.
    root = createRoot(container);

    expect(clearSpy).toHaveBeenCalled();

    // Advancing time after unmount must not schedule another render — if it did, `values`
    // would grow even though nothing is mounted to receive the update meaningfully.
    const before = values.length;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(values.length).toBe(before);
    clearSpy.mockRestore();
  });
});
