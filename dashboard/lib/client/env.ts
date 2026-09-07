/**
 * Every global §6.7's runtime touches, behind one seam — and the browser adapter that
 * implements it.
 *
 * This is the `CollectorIo` pattern from steps 3–5, on the other side of the wire. The
 * runtime never reaches `document`, `localStorage`, `setTimeout`, `fetch` or `location`
 * itself, so its whole behaviour — the cadence, the backoff, the visibility pause, the 401
 * hand-off, the `ts` dedupe — is driven from a fake in plain Node with no jsdom.
 *
 * ⚠ HANDOVER §5.3 note 4 is the reason the seam is shaped this way rather than as a
 * source-text rule: *"A text guard is sound only over a vocabulary that cannot be aliased. A
 * module-local name is guardable; a **global** (`setInterval`, `fetch`, `require`) is not
 * guardable by text at all."* {@link BrowserWindow} makes the globals **parameters**, which
 * a type checker can see and a test can substitute, and `lib/client/guardrails.test.ts` still
 * carries the text guard **and** the behavioural one, because neither sees what the other
 * sees.
 *
 * ### What is left untested, stated plainly
 *
 * `createBrowserEnv(window)` — the call that passes the real globals in — is the one
 * expression no test in this project executes, because executing it requires a DOM.
 * Everything it *builds* is exercised against a fake window: the status mapping, the JSON
 * failure, the `localStorage` getter that throws, the visibility listener and its removal.
 * Step 8 declined to add jsdom for that single call; the reasoning, and what it would cost
 * step 11's image, is in the step notes.
 */

import type { PrefStorage } from './prefs';

/** §4's endpoint. Spelled once, here — the same rule `login-view.ts` holds for its two. */
export const TELEMETRY_PATH = '/api/telemetry';

/**
 * What one poll learned. Three outcomes, and **they are three, not two** (HANDOVER §6.3):
 *
 * - `ok` — a 200 whose body still has to be validated (O10). The body is `unknown` here on
 *   purpose: this module must not be the place a snapshot is asserted into existence.
 * - `unauthorized` — a 401. §5.2: session expired, go to `/login`. **Not** a failed poll: no
 *   backoff, no grey dot, no banner.
 * - `error` — everything else. The request never answered, or answered with a status this
 *   client has no meaning for. §6.7's failed poll.
 */
export type TelemetryResponse =
  | { readonly kind: 'ok'; readonly body: unknown }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'error'; readonly detail: string };

/** Whatever the host's timer scheduler hands back. Passed straight back to `clearTimer`. */
export type TimerHandle = unknown;

/** Every global the runtime is allowed to reach, and it reaches them only through this. */
export interface RuntimeEnv {
  /** Wall clock. §6.4's debounce is "10 seconds of **wall** time", and §6.2's age is wall too. */
  nowMs(): number;
  setTimer(run: () => void, delayMs: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
  /** `null` when storage is unreachable — §6.7's "private window with storage blocked". */
  readonly storage: PrefStorage | null;
  isHidden(): boolean;
  /** Subscribe to `visibilitychange`; the returned function unsubscribes. */
  onVisibilityChange(listener: () => void): () => void;
  fetchTelemetry(): Promise<TelemetryResponse>;
  /** §5.2's hand-off. The URL is built by the runtime, from `login-view.ts`'s constants. */
  navigate(url: string): void;
}

// ---------------------------------------------------------------------------
// The browser adapter
// ---------------------------------------------------------------------------

/** The half of `Response` this client reads. */
export interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  json(): Promise<unknown>;
}

/**
 * The half of `window` this client touches, structurally — so a test passes an object
 * literal and `createBrowserEnv` is exercised for real.
 *
 * ⚠ `localStorage` is declared as a plain property because that is what it is, and the
 * property **access** is what throws in Safari with *Block all cookies* and in a blocked
 * iframe. It is read inside a `try` exactly once, at construction.
 */
export interface BrowserWindow {
  readonly document: {
    readonly hidden: boolean;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
  };
  readonly localStorage?: PrefStorage | null | undefined;
  setTimeout(run: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  fetch(input: string, init: TelemetryRequestInit): Promise<FetchResponse>;
  readonly location: { assign(url: string): void };
}

/** The subset of the DOM's `RequestInit` this client sends. Named apart from it deliberately. */
export interface TelemetryRequestInit {
  readonly credentials: 'same-origin';
  readonly cache: 'no-store';
  readonly headers: Readonly<Record<string, string>>;
}

/** `window.localStorage`, or `null` if merely *asking* for it throws. */
const storageOf = (win: BrowserWindow): PrefStorage | null => {
  try {
    return win.localStorage ?? null;
  } catch {
    // Safari's "Block all cookies", a `file://` document, a blocked third-party iframe.
    return null;
  }
};

/**
 * §6.7's runtime, wired to a real browser.
 *
 * The one decision made here rather than in `runtime.ts` is the **status mapping**, and it
 * is made here because it is about HTTP rather than about §6.7: a 401 is `unauthorized`, a
 * 200 whose body will not parse as JSON is an `error`, and every other status is an `error`
 * naming itself. Nothing here decides what any of that *means* — `runtime.ts` does.
 */
export const createBrowserEnv = (win: BrowserWindow): RuntimeEnv => ({
  nowMs: () => Date.now(),
  setTimer: (run, delayMs) => win.setTimeout(run, delayMs),
  clearTimer: (handle) => {
    win.clearTimeout(handle);
  },
  storage: storageOf(win),
  isHidden: () => win.document.hidden,
  onVisibilityChange: (listener) => {
    win.document.addEventListener('visibilitychange', listener);
    return () => {
      win.document.removeEventListener('visibilitychange', listener);
    };
  },
  fetchTelemetry: async () => {
    let response: FetchResponse;
    try {
      response = await win.fetch(TELEMETRY_PATH, {
        credentials: 'same-origin',
        // §4 answers `Cache-Control: no-store` on 200 and 401 alike; asking as well means a
        // back/forward cache cannot hand this poll a snapshot older than its own `ts` claims.
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      return { kind: 'error', detail: error instanceof Error ? error.message : 'request failed' };
    }
    if (response.status === 401) return { kind: 'unauthorized' };
    if (!response.ok) return { kind: 'error', detail: `HTTP ${response.status}` };
    try {
      return { kind: 'ok', body: await response.json() };
    } catch {
      return { kind: 'error', detail: 'response was not JSON' };
    }
  },
  navigate: (url) => {
    win.location.assign(url);
  },
});
