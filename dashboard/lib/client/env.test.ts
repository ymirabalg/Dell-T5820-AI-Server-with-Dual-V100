/**
 * The browser adapter, against a hand-built `window`.
 *
 * `BrowserWindow` is structural, so this is not a mock of a seam — it is the seam, exercised.
 * `client.test-d.ts` asserts separately that the **real** `Window` satisfies the same
 * interface, which is the half a fake can never prove.
 */

import { describe, expect, test } from 'vitest';

import { MemoryStorage } from './fake-env';
import { TELEMETRY_PATH, createBrowserEnv } from './env';
import type { BrowserWindow, FetchResponse, TelemetryRequestInit } from './env';
import type { PrefStorage } from './prefs';

interface Call {
  readonly input: string;
  readonly init: TelemetryRequestInit;
}

class FakeWindow implements BrowserWindow {
  hidden = false;
  readonly calls: Call[] = [];
  readonly assigned: string[] = [];
  readonly listeners = new Set<() => void>();
  readonly timers: { readonly run: () => void; readonly delayMs: number }[] = [];
  readonly clearedTimers: unknown[] = [];
  answer: () => Promise<FetchResponse> = () => Promise.resolve(json(200, {}));
  localStorage: PrefStorage | null = new MemoryStorage();

  readonly document = {
    hidden: false,
    addEventListener: (_type: 'visibilitychange', listener: () => void): void => {
      this.listeners.add(listener);
    },
    removeEventListener: (_type: 'visibilitychange', listener: () => void): void => {
      this.listeners.delete(listener);
    },
  };

  readonly location = {
    assign: (url: string): void => {
      this.assigned.push(url);
    },
  };

  setTimeout = (run: () => void, delayMs: number): unknown => {
    this.timers.push({ run, delayMs });
    return this.timers.length - 1;
  };

  clearTimeout = (handle: unknown): void => {
    this.clearedTimers.push(handle);
  };

  fetch = (input: string, init: TelemetryRequestInit): Promise<FetchResponse> => {
    this.calls.push({ input, init });
    return this.answer();
  };
}

const json = (status: number, body: unknown): FetchResponse => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(body),
});

describe('⚠ the poll’s three outcomes are three, not two', () => {
  test('⚠ a 200 is an unvalidated body, and this module does not assert what it is', async () => {
    const win = new FakeWindow();
    win.answer = () => Promise.resolve(json(200, { ts: 'anything' }));
    await expect(createBrowserEnv(win).fetchTelemetry()).resolves.toEqual({
      kind: 'ok',
      body: { ts: 'anything' },
    });
  });

  /*
   * ⚠ §5.2 and HANDOVER §6.3: "A 401 is not a failed poll. It routes to `/login`". Folding it
   * into the error path would back off against a server that is answering perfectly and leave
   * the operator watching a grey dot instead of a login screen.
   */
  test('⚠ a 401 is its own outcome and is never an error', async () => {
    const win = new FakeWindow();
    win.answer = () => Promise.resolve(json(401, null));
    await expect(createBrowserEnv(win).fetchTelemetry()).resolves.toEqual({ kind: 'unauthorized' });
  });

  test.each([[500], [502], [404], [418], [403]])(
    '⚠ any other status is a failed poll naming itself — %s',
    async (status) => {
      const win = new FakeWindow();
      win.answer = () => Promise.resolve(json(status, null));
      await expect(createBrowserEnv(win).fetchTelemetry()).resolves.toEqual({
        kind: 'error',
        detail: `HTTP ${status}`,
      });
    },
  );

  test('⚠ a request that never answered is a failed poll carrying the reason', async () => {
    const win = new FakeWindow();
    win.answer = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(createBrowserEnv(win).fetchTelemetry()).resolves.toEqual({
      kind: 'error',
      detail: 'Failed to fetch',
    });
  });

  test('⚠ a 200 whose body is not JSON is a failed poll, not an empty snapshot', async () => {
    const win = new FakeWindow();
    win.answer = () =>
      Promise.resolve({ status: 200, ok: true, json: () => Promise.reject(new SyntaxError('bad')) });
    await expect(createBrowserEnv(win).fetchTelemetry()).resolves.toEqual({
      kind: 'error',
      detail: 'response was not JSON',
    });
  });

  test('a thrown non-Error still produces a detail rather than crashing the poll', async () => {
    const win = new FakeWindow();
    win.answer = () => Promise.reject('nope');
    await expect(createBrowserEnv(win).fetchTelemetry()).resolves.toEqual({
      kind: 'error',
      detail: 'request failed',
    });
  });
});

describe('⚠ the request itself', () => {
  test('⚠ it asks §4’s endpoint, with the session cookie and no cache', async () => {
    const win = new FakeWindow();
    await createBrowserEnv(win).fetchTelemetry();
    expect(win.calls).toHaveLength(1);
    expect(win.calls[0]?.input).toBe(TELEMETRY_PATH);
    expect(win.calls[0]?.init.credentials).toBe('same-origin');
    expect(win.calls[0]?.init.cache).toBe('no-store');
  });

  test('⚠ §4’s endpoint is spelled /api/telemetry, once, here', () => {
    expect(TELEMETRY_PATH).toBe('/api/telemetry');
  });
});

describe('⚠ §6.7: storage that is blocked must not stop the dashboard', () => {
  test('a working localStorage is handed straight through', () => {
    const win = new FakeWindow();
    expect(createBrowserEnv(win).storage).toBe(win.localStorage);
  });

  test('a window with no localStorage at all yields null rather than undefined', () => {
    const win = new FakeWindow();
    win.localStorage = null;
    expect(createBrowserEnv(win).storage).toBeNull();
  });

  /*
   * ⚠ The failure that is easy to miss: it is the **property access** that throws, before
   * `getItem` is ever reached — Safari's "Block all cookies", a `file://` document, a blocked
   * third-party iframe. A `try` around `getItem` alone would not catch it, and constructing
   * the env would throw during the first render.
   */
  test('⚠ a localStorage getter that throws yields null, and constructing does not throw', () => {
    const win = new FakeWindow();
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(() => createBrowserEnv(win)).not.toThrow();
    expect(createBrowserEnv(win).storage).toBeNull();
  });
});

describe('visibility, timers and navigation are delegated, not reimplemented', () => {
  test('⚠ isHidden reads document.hidden every time it is asked', () => {
    const win = new FakeWindow();
    const env = createBrowserEnv(win);
    expect(env.isHidden()).toBe(false);
    win.document.hidden = true;
    expect(env.isHidden()).toBe(true);
  });

  test('⚠ the visibility listener is added on subscribe and removed on unsubscribe', () => {
    const win = new FakeWindow();
    const unsubscribe = createBrowserEnv(win).onVisibilityChange(() => undefined);
    expect(win.listeners.size).toBe(1);
    unsubscribe();
    expect(win.listeners.size).toBe(0);
  });

  test('the timer seam is window.setTimeout and window.clearTimeout', () => {
    const win = new FakeWindow();
    const env = createBrowserEnv(win);
    const handle = env.setTimer(() => undefined, 5_000);
    expect(win.timers[0]?.delayMs).toBe(5_000);
    env.clearTimer(handle);
    expect(win.clearedTimers).toEqual([handle]);
  });

  test('navigate assigns the location, which is what leaves the page', () => {
    const win = new FakeWindow();
    createBrowserEnv(win).navigate('/login?expired=1');
    expect(win.assigned).toEqual(['/login?expired=1']);
  });

  test('nowMs is the wall clock', () => {
    const before = Date.now();
    const now = createBrowserEnv(new FakeWindow()).nowMs();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
