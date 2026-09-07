/**
 * §6.7's runtime, end to end, on a fake clock.
 *
 * Every rule §6.7 states about *time* is asserted here, because none of them can be asserted
 * anywhere else: the cadence, the backoff sequence, the visibility pause, the 401 hand-off,
 * and — first, because HANDOVER puts it first — the `ts` dedupe.
 *
 * The clock is `FakeEnv`'s, not `vi.useFakeTimers`'. See `fake-env.ts` for why: the runtime
 * takes its scheduler as a parameter, so a test can read the pending timers rather than infer
 * them, and `setImmediate` is still available to drain the poll's own `await`.
 */

import { describe, expect, test } from 'vitest';

import { everythingZero, servingPopulated } from '../fixtures';
import { celsius, isoTimestamp } from '../types';
import type { TelemetrySnapshot } from '../types';
import { FakeEnv, MemoryStorage, ThrowingStorage, atTs, tsAt, wireBodyOf } from './fake-env';
import { latestSample } from './runtime';
import { TelemetryRuntime, ageMs, expiredLoginUrl } from './runtime';
import { newestSample } from './ring';

const card = everythingZero.gpus?.[0];
if (card === undefined) throw new Error('the everythingZero fixture lost its GPU');

/** A snapshot at a given `ts`, optionally with GPU 0 at a given temperature. */
const snap = (secondsPastTheHour: number, tempC = 60): TelemetrySnapshot => ({
  ...atTs(everythingZero, tsAt(secondsPastTheHour)),
  gpus: [{ ...card, tempC: celsius(tempC) }],
});

/** Start a runtime whose queue already holds `count` distinct snapshots, one per second. */
const started = async (
  env: FakeEnv,
  count = 1,
): Promise<TelemetryRuntime> => {
  for (let i = 0; i < count; i += 1) env.replySnapshot(snap(i));
  const runtime = new TelemetryRuntime(env);
  runtime.start();
  await env.advance(0);
  return runtime;
};

describe('polling on the selected cadence', () => {
  test('⚠ start polls at once and then schedules the default 5 s cadence', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 3);
    expect(env.fetches).toBe(1);
    expect(env.pending).toEqual([5_000]);

    await env.advance(5_000);
    expect(env.fetches).toBe(2);
    await env.advance(5_000);
    expect(env.fetches).toBe(3);
    runtime.stop();
  });

  test('⚠ a stored cadence is used, and §6.2’s selector changes it mid-session', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
    const runtime = await started(env, 6);
    expect(env.pending).toEqual([1_000]);

    runtime.setCadence(30);
    expect(env.pending).toEqual([30_000]);
    runtime.stop();
  });

  /*
   * ⚠ §6.7: "changing cadence mid-session neither clears the buffer nor distorts the axis."
   * The most tempting wrong implementation is to reset the ring so the trace's point spacing
   * stays uniform, which would throw away the two hours the operator was watching.
   */
  test('⚠ changing the cadence keeps every sample already in the ring', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 4);
    await env.advance(5_000);
    await env.advance(5_000);
    expect(runtime.getState().ring.samples).toHaveLength(3);

    runtime.setCadence(1);
    expect(runtime.getState().ring.samples).toHaveLength(3);
    runtime.stop();
  });

  test('the cadence and window selectors are persisted', async () => {
    const storage = new MemoryStorage();
    const env = new FakeEnv(storage);
    const runtime = await started(env, 2);
    runtime.setCadence(10);
    runtime.setWindow(120);
    expect(storage.writes).toEqual([
      ['aid.cadence', '10'],
      ['aid.window', '120'],
    ]);
    runtime.stop();
  });

  test('⚠ storage that is blocked still renders a correct dashboard at the defaults', async () => {
    const env = new FakeEnv(new ThrowingStorage());
    const runtime = await started(env, 2);
    expect(runtime.getState().preferences).toEqual({ cadenceSeconds: 5, windowMinutes: 30 });
    expect(env.pending).toEqual([5_000]);
    expect(runtime.getState().ring.samples).toHaveLength(1);
    runtime.stop();
  });
});

describe('⚠ §6.7: a repeated ts is ignored, and is NOT a failed poll', () => {
  /*
   * ⚠ §4's cache serves the same snapshot two or three times in a row at the 1 s cadence.
   * This is the fixture for exactly that: three identical answers, then a new one.
   */
  test('⚠ three arrivals of one ts are one sample in the ring', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
    env.replySnapshot(snap(0)).replySnapshot(snap(0)).replySnapshot(snap(0)).replySnapshot(snap(1));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    await env.advance(1_000);
    await env.advance(1_000);
    await env.advance(1_000);

    expect(env.fetches).toBe(4);
    expect(runtime.getState().ring.samples).toHaveLength(2);
    runtime.stop();
  });

  test('⚠ a repeat leaves the dot green, the backoff idle and the mode live', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.replySnapshot(snap(0));
    await env.advance(5_000);

    const state = runtime.getState();
    expect(state.mode).toBe('live');
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastFailure).toBeNull();
    // ⚠ The next poll is one cadence away, not a backed-off one. Treating the repeat as a
    // failure would put a perfectly healthy 1 s dashboard on a 30 s backoff within seconds.
    expect(env.pending).toEqual([5_000]);
    runtime.stop();
  });

  /*
   * ⚠ The strongest form of "ignores": nothing observable changed at all, so React is not
   * re-rendered and none of the condition, event or gap machinery ran. §6.7's three named
   * consequences of getting this wrong — duplicate ring points, a flattened bucket and a
   * double-counted event — are all downstream of this one identity.
   */
  test('⚠ a repeat leaves the state identical by identity, so nothing downstream re-runs', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    const before = runtime.getState();
    let notifications = 0;
    runtime.subscribe(() => {
      notifications += 1;
    });

    env.replySnapshot(snap(0));
    await env.advance(5_000);

    expect(runtime.getState()).toBe(before);
    expect(notifications).toBe(0);
    runtime.stop();
  });

  /*
   * No ⚠, and the reason is worth keeping: this property is defended **twice** — the ring
   * returns by identity so `observeEvents` is never called for a repeat, and `observeEvents`
   * would emit nothing anyway because the band it holds has not moved. No single-file mutation
   * can distinguish either defence while the other stands, so the harness cannot redden it.
   * The end-to-end assertion is still worth having; the ⚠ would have been a claim the ledger
   * could not back.
   */
  test('a repeat does not double-count an event in the log', async () => {
    const env = new FakeEnv();
    const alarming = { ...snap(0, 84) };
    env.replySnapshot(alarming).replySnapshot(alarming).replySnapshot(alarming);
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    await env.advance(5_000);
    await env.advance(5_000);

    const logged = runtime.getState().events.entries.filter((e) => e.id === 'gpu_temp:0');
    expect(logged).toHaveLength(1);
    runtime.stop();
  });

  test('⚠ a new ts after a run of repeats is appended, so the dedupe is not refusing everything', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.replySnapshot(snap(0)).replySnapshot(snap(7));
    await env.advance(5_000);
    await env.advance(5_000);
    expect(runtime.getState().ring.samples.map((s) => s.ts)).toEqual([
      isoTimestamp(tsAt(0)),
      isoTimestamp(tsAt(7)),
    ]);
    runtime.stop();
  });

  /*
   * ⚠ §4: "`ts` is the instant the poll BEGAN … start-stamping can only over-state age, which
   * is the direction every reading here must err in." The age is measured from the server's
   * own stamp and nothing here re-stamps it on arrival.
   */
  test('⚠ the age counts from the server’s ts, and a repeat does not refresh it', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    const tsMs = Date.parse(tsAt(0));
    expect(ageMs(runtime.getState(), tsMs + 12_000)).toBe(12_000);

    env.replySnapshot(snap(0));
    await env.advance(5_000);
    expect(newestSample(runtime.getState().ring)?.tsMs).toBe(tsMs);
    expect(ageMs(runtime.getState(), tsMs + 30_000)).toBe(30_000);
    runtime.stop();
  });
});

describe('⚠ §6.7’s backoff, and what resets it', () => {
  test('⚠ consecutive failures wait 1×, 2× and 4× the cadence', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'error', detail: 'ECONNREFUSED' });

    await env.advance(5_000);
    expect(env.pending).toEqual([5_000]);
    await env.advance(5_000);
    expect(env.pending).toEqual([10_000]);
    await env.advance(10_000);
    expect(env.pending).toEqual([20_000]);
    expect(runtime.getState().consecutiveFailures).toBe(3);
    runtime.stop();
  });

  test('⚠ the mode goes stale and the failure is named', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'error', detail: 'ECONNREFUSED' });
    await env.advance(5_000);
    expect(runtime.getState().mode).toBe('stale');
    expect(runtime.getState().lastFailure).toBe('ECONNREFUSED');
    runtime.stop();
  });

  test('⚠ recovery resets the backoff to the cadence, not to a half-way delay', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'error', detail: 'down' });
    await env.advance(5_000);
    await env.advance(5_000);
    await env.advance(10_000);
    expect(runtime.getState().consecutiveFailures).toBe(3);

    // ⚠ Stamped at the instant the poll lands — 5 + 5 + 10 + 20 s after the session began. A
    // server whose `ts` lagged the browser by half a minute would still be `stale` here, and
    // correctly so: recovery resets the *backoff*, and currency is a separate question.
    env.replySnapshot(snap(40));
    await env.advance(20_000);
    expect(runtime.getState().consecutiveFailures).toBe(0);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().lastFailure).toBeNull();
    expect(env.pending).toEqual([5_000]);
    runtime.stop();
  });

  /*
   * ⚠ A 200 carrying something that is not §4's snapshot is a server this client cannot read.
   * It must not become a partial snapshot: a partial snapshot is a well-formed 200 with
   * `errors[]`, and it is the normal case on this machine (invariant 5).
   */
  /*
   * ⚠ The seam is specified never to reject, and a specification is not a proof. An escaped
   * rejection would leave the runtime with a request permanently in flight and **no timer
   * pending** — polling stops with nothing on screen to say so, which is worse than any failure
   * §6.7 describes because it never recovers. It becomes a failed poll instead: named, backed
   * off, and retried.
   */
  test('⚠ a request seam that rejects is a failed poll, not a runtime that stops for ever', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.fetchTelemetry = () => Promise.reject(new Error('seam broke'));
    await env.advance(5_000);

    expect(runtime.getState().mode).toBe('stale');
    expect(runtime.getState().consecutiveFailures).toBe(1);
    expect(env.pending).toEqual([5_000]);

    env.fetchTelemetry = () => Promise.resolve({ kind: 'ok', body: wireBodyOf(snap(10)) });
    await env.advance(5_000);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().ring.samples).toHaveLength(2);
    runtime.stop();
  });

  test('⚠ a 200 that is not §4’s snapshot is a failed poll, not an empty dashboard', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'ok', body: { ts: 'yesterday' } });
    await env.advance(5_000);
    expect(runtime.getState().mode).toBe('stale');
    expect(runtime.getState().lastFailure).toBe('malformed snapshot');
    expect(runtime.getState().ring.samples).toHaveLength(1);
    runtime.stop();
  });

  test('⚠ a partial snapshot with errors[] is a successful poll, because it is the normal case', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.replySnapshot(atTs(servingPopulated, tsAt(5)));
    await env.advance(5_000);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().ring.samples).toHaveLength(2);
    runtime.stop();
  });

  test('⚠ the trace freezes rather than plotting zeros — a failure appends nothing', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'error', detail: 'down' });
    await env.advance(5_000);
    await env.advance(5_000);
    expect(runtime.getState().ring.samples).toHaveLength(1);
    runtime.stop();
  });

  test('a failure opens a hatched gap, and the next good sample closes it at its own ts', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'error', detail: 'down' });
    await env.advance(5_000);
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: null, reason: 'failed' },
    ]);

    env.replySnapshot(snap(30));
    await env.advance(5_000);
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: Date.parse(tsAt(30)), reason: 'failed' },
    ]);
    runtime.stop();
  });
});

describe('⚠ §6.7: a hidden tab schedules nothing and asks nothing', () => {
  test('⚠ going hidden clears the pending timer and issues no further poll', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 5);
    expect(env.pending).toEqual([5_000]);

    await env.setHidden(true);
    expect(env.pending).toEqual([]);

    const before = env.fetches;
    await env.advance(600_000);
    expect(env.fetches).toBe(before);
    expect(env.pending).toEqual([]);
    runtime.stop();
  });

  test('⚠ a runtime that starts hidden never polls at all', async () => {
    const env = new FakeEnv();
    env.hidden = true;
    env.replySnapshot(snap(0));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(60_000);
    expect(env.fetches).toBe(0);
    expect(env.pending).toEqual([]);
    runtime.stop();
  });

  /*
   * ⚠ The path a `document.hidden` check in the listener alone cannot cover: the tab goes
   * hidden **while a request is in flight**. The answer still arrives and is still recorded —
   * it is real data, asked for while the tab was visible — but nothing may be scheduled off
   * the back of it, or a hidden tab polls for ever one poll behind the listener.
   */
  test('⚠ a poll that lands after the tab went hidden schedules nothing', async () => {
    const env = new FakeEnv();
    const held: { settle?: () => void } = {};
    env.fetchTelemetry = () =>
      new Promise((resolve) => {
        held.settle = () => {
          resolve({ kind: 'ok', body: wireBodyOf(snap(0)) });
        };
      });
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);

    await env.setHidden(true);
    held.settle?.();
    await env.advance(0);

    expect(runtime.getState().ring.samples).toHaveLength(1);
    expect(env.pending).toEqual([]);
    runtime.stop();
  });

  test('⚠ becoming visible polls immediately rather than waiting out a cadence', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    await env.setHidden(true);
    await env.advance(300_000);
    const before = env.fetches;

    env.replySnapshot(snap(300));
    await env.setHidden(false);
    expect(env.fetches).toBe(before + 1);
    expect(env.pending).toEqual([5_000]);
    runtime.stop();
  });

  /*
   * ⚠ §6.7: "The un-sampled span is drawn with the same hatched 'no reading' treatment a lost
   * channel gets — the data genuinely is absent, and it must not be interpolated across." The
   * span is recorded from what the runtime did, so no amount of decimation can lose it.
   */
  test('⚠ the un-sampled span is recorded, from the last reading to the one that resumes', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    await env.setHidden(true);
    await env.advance(300_000);

    env.replySnapshot(snap(300));
    await env.setHidden(false);

    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: Date.parse(tsAt(300)), reason: 'hidden' },
    ]);
    runtime.stop();
  });
});

describe('⚠ §5.2: a 401 is a session to sign in to, not a poll that failed', () => {
  test('⚠ a 401 routes to /login with the expired parameter set', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'unauthorized' });
    await env.advance(5_000);
    expect(env.navigations).toEqual(['/login?expired=1']);
    expect(expiredLoginUrl()).toBe('/login?expired=1');
    runtime.stop();
  });

  test('⚠ a 401 engages no backoff, raises no failure and stops polling', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'unauthorized' });
    await env.advance(5_000);

    expect(runtime.getState().consecutiveFailures).toBe(0);
    expect(runtime.getState().lastFailure).toBeNull();
    expect(runtime.getState().mode).toBe('expired');
    expect(env.pending).toEqual([]);

    const after = env.fetches;
    await env.advance(600_000);
    expect(env.fetches).toBe(after);
    runtime.stop();
  });

  test('⚠ a second navigation is never issued, however long the page takes to unload', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({ kind: 'unauthorized' });
    await env.advance(5_000);
    runtime.refreshNow();
    await env.advance(60_000);
    expect(env.navigations).toHaveLength(1);
    runtime.stop();
  });
});

describe('§6.2’s controls', () => {
  test('⚠ pause stops the timer and announces itself as a mode', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 5);
    runtime.pause();
    expect(runtime.getState().mode).toBe('paused');
    expect(env.pending).toEqual([]);

    const before = env.fetches;
    await env.advance(600_000);
    expect(env.fetches).toBe(before);
    runtime.stop();
  });

  test('⚠ the age keeps counting while paused, which is what the indicator is for', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    runtime.pause();
    expect(ageMs(runtime.getState(), Date.parse(tsAt(0)) + 120_000)).toBe(120_000);
    runtime.stop();
  });

  test('resume polls at once', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    runtime.pause();
    // A minute of paused wall time. No timer is pending, so this only moves the clock — which
    // is the point: the reading that resumes must be stamped where the clock now is, or §6.2
    // would rightly call a minute-old snapshot stale the instant it arrived.
    await env.advance(60_000);
    env.replySnapshot(snap(60));
    runtime.resume();
    await env.advance(0);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().ring.samples).toHaveLength(2);
    runtime.stop();
  });

  test('⚠ refresh now polls even while paused, and does not silently resume', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    runtime.pause();
    await env.advance(60_000);
    env.replySnapshot(snap(60));
    runtime.refreshNow();
    await env.advance(0);
    expect(runtime.getState().ring.samples).toHaveLength(2);
    expect(runtime.getState().mode).toBe('paused');
    expect(env.pending).toEqual([]);
    runtime.stop();
  });

  test('the window selector changes what is drawn and nothing about polling', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 3);
    runtime.setWindow(10);
    expect(runtime.getState().preferences.windowMinutes).toBe(10);
    expect(env.pending).toEqual([5_000]);
    expect(env.fetches).toBe(1);
    runtime.stop();
  });
});

describe('⚠ nothing outlives stop()', () => {
  test('⚠ stop clears the pending timer and removes the visibility listener', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 3);
    expect(env.pending).toHaveLength(1);
    expect(env.visibilitySubscribes).toBe(1);

    runtime.stop();
    expect(env.pending).toEqual([]);
    expect(env.visibilityUnsubscribes).toBe(1);

    await env.advance(600_000);
    expect(env.fetches).toBe(1);
  });

  test('⚠ a poll that lands after stop() cannot write to the store', async () => {
    const env = new FakeEnv();
    const held: { settle?: () => void } = {};
    env.fetchTelemetry = () =>
      new Promise((resolve) => {
        held.settle = () => {
          resolve({ kind: 'ok', body: wireBodyOf(snap(9)) });
        };
      });

    const runtime = new TelemetryRuntime(env);
    runtime.start();
    const before = runtime.getState();
    runtime.stop();
    held.settle?.();
    await env.advance(0);

    expect(runtime.getState()).toBe(before);
    expect(runtime.getState().ring.samples).toEqual([]);
  });

  test('starting twice does not start two loops', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 4);
    runtime.start();
    expect(env.pending).toHaveLength(1);
    expect(env.visibilitySubscribes).toBe(1);
    runtime.stop();
  });

  test('a subscriber that unsubscribes stops hearing about polls', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 4);
    let heard = 0;
    const off = runtime.subscribe(() => {
      heard += 1;
    });
    await env.advance(5_000);
    expect(heard).toBe(1);
    off();
    await env.advance(5_000);
    expect(heard).toBe(1);
    runtime.stop();
  });
});

describe('⚠ §6.4 and §9 are driven, never re-derived', () => {
  test('⚠ the aggregate dot and the count come from one reduction over displaySeverity', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    // `everythingZero` carries `ufwEnforcing: false` — §6.3's alarm.
    expect(runtime.getState().severity).toBe('alarm');
    expect(runtime.getState().alarms).toBeGreaterThan(0);
    expect(runtime.getState().displayed.filter((d) => d.banner)).toHaveLength(
      runtime.getState().alarms,
    );
    runtime.stop();
  });

  /*
   * ⚠ §6.4: "A condition's severity is the CONFIRMED band, never a raw per-poll severity."
   * The runtime hands `observePoll` a wall clock and reads back `displayed`; the ten-second
   * hold is entirely `lib/conditions.ts`'s, and this fixture proves the runtime is driving it
   * rather than passing raw severities through.
   */
  test('⚠ a band that has not held ten seconds is not yet the condition’s severity', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
    env.replySnapshot(snap(0, 60));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    expect(runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0')?.severity).toBe('normal');

    for (let i = 1; i <= 10; i += 1) {
      env.replySnapshot(snap(i, 84));
      await env.advance(1_000);
      expect(runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0')?.severity).toBe('normal');
    }

    env.replySnapshot(snap(11, 84));
    await env.advance(1_000);
    expect(runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0')?.severity).toBe('alarm');
    runtime.stop();
  });

  /*
   * ⚠ **S34, closed end to end.** The mechanism used to be a constructor option nothing outside
   * a test ever set, so on a real deployment nothing was ever standing and §6.4's suppression
   * — written so that a permanently-true `ufw enforcing = no` does not nail the banner open —
   * could not fire the day it was next needed. It now rides §4's snapshot, so this fixture is
   * the wire, not a hand-set field.
   */
  test('⚠ a standing condition is declared, never inferred, and defaults to nothing standing', async () => {
    const env = new FakeEnv();
    env.replySnapshot(snap(0));
    const plain = new TelemetryRuntime(env);
    plain.start();
    await env.advance(0);
    expect(plain.getState().displayed.find((d) => d.id === 'ufw_enforcing')?.suppressed).toBe(false);
    plain.stop();

    const other = new FakeEnv();
    other.replySnapshot({ ...snap(0), standing: ['ufw_enforcing'] });
    const suppressed = new TelemetryRuntime(other);
    suppressed.start();
    await other.advance(0);
    const condition = suppressed.getState().displayed.find((d) => d.id === 'ufw_enforcing');
    expect(condition?.suppressed).toBe(true);
    expect(condition?.displaySeverity).toBe('watch');
    expect(condition?.severity).toBe('alarm');
    suppressed.stop();
  });

  test('⚠ a malformed STANDING entry is reported rather than silently suppressing nothing', async () => {
    const env = new FakeEnv();
    env.replySnapshot({ ...snap(0), standing: ['ufw_enforcing:yes', 'unit'] });
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    expect(runtime.getState().unknownStanding).toEqual(['ufw_enforcing:yes', 'unit']);
    runtime.stop();
  });

  /*
   * ⚠ §4: "A change takes effect on the next poll." The list is per-poll state, so a condition
   * that *gains* standing is suppressed from then on and one that *loses* it returns to full
   * alarm behaviour — which is already §6.4's rule for a standing condition that changes.
   */
  test('⚠ STANDING is read from every snapshot, so an operator’s edit lands on the next poll', async () => {
    const env = new FakeEnv();
    env.replySnapshot(snap(0));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    expect(runtime.getState().displayed.find((d) => d.id === 'ufw_enforcing')?.suppressed).toBe(false);

    env.replySnapshot({ ...snap(5), standing: ['ufw_enforcing'] });
    await env.advance(5_000);
    expect(runtime.getState().displayed.find((d) => d.id === 'ufw_enforcing')?.suppressed).toBe(true);

    env.replySnapshot(snap(10));
    await env.advance(5_000);
    expect(runtime.getState().displayed.find((d) => d.id === 'ufw_enforcing')?.suppressed).toBe(false);
    runtime.stop();
  });

  test('the event log opens with page loaded and grows with the session', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    expect(runtime.getState().events.entries.at(-1)?.kind).toBe('page-loaded');
    runtime.stop();
  });
});

// ---------------------------------------------------------------------------
// §6.7 — a gap closes when a REASON goes away, not when a SAMPLE arrives
// ---------------------------------------------------------------------------

/** A fetch seam a test can hold open, so a poll can be in flight across another event. */
const heldFetch = (env: FakeEnv): { settle: (snapshot: TelemetrySnapshot) => void } => {
  const held: { resolve?: (r: { kind: 'ok'; body: unknown }) => void } = {};
  env.fetchTelemetry = () =>
    new Promise((resolve) => {
      held.resolve = resolve;
    });
  return {
    settle: (snapshot) => {
      held.resolve?.({ kind: 'ok', body: wireBodyOf(snapshot) });
    },
  };
};

describe('⚠ §6.7: a gap stays open while any reason to have one is in force', () => {
  /*
   * ⚠ **F1**, end to end, and the fixture the old suite did not have. The one hidden-tab test
   * that checked gaps hid the tab with **no poll in flight**, so `closeGap` never ran during
   * the gap and the erasure could not happen. §6.7 blesses a poll that outlives its cadence —
   * `collectServing`'s worst case is 6 s against a 5 s default — so a poll is in flight for a
   * large fraction of every cadence, and most often exactly when somebody backgrounds a
   * slow-looking dashboard. Measured before the fix: a one-hour hidden span recorded as five
   * seconds, and the chart drawing a straight line across 3,600 s of ground nobody measured.
   */
  test('⚠ a poll landing after the tab went hidden does not close the hidden gap', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    const held = heldFetch(env);

    await env.advance(5_000); // poll 2 leaves, and does not answer
    await env.setHidden(true);
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: null, reason: 'hidden' },
    ]);

    held.settle(snap(5));
    await env.advance(0);

    // The reading is kept — it is real data, asked for while the tab was visible…
    expect(runtime.getState().ring.samples).toHaveLength(2);
    // …and it does not make the hour around it observed.
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: null, reason: 'hidden' },
    ]);

    // An hour later the tab comes back, and *that* reading closes it.
    await env.advance(3_600_000);
    env.fetchTelemetry = () =>
      Promise.resolve({ kind: 'ok', body: wireBodyOf(snap(3_605)) });
    await env.setHidden(false);
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: Date.parse(tsAt(3_605)), reason: 'hidden' },
    ]);
    runtime.stop();
  });

  /* ⚠ **F2**, first half: the same mechanism reached by the operator pausing. */
  test('⚠ a poll landing after the operator paused does not close the paused gap', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    const held = heldFetch(env);

    await env.advance(5_000);
    runtime.pause();
    held.settle(snap(5));
    await env.advance(0);

    expect(runtime.getState().ring.samples).toHaveLength(2);
    expect(runtime.getState().paused).toBe(true);
    expect(runtime.getState().gaps.at(-1)?.toMs).toBeNull();
    runtime.stop();
  });

  /*
   * ⚠ **F2**, second half. *Refresh now* while paused is blessed behaviour — an explicit
   * request for a reading is answered and the mode the operator chose survives their own click
   * — and the runtime invented `reason: 'paused'` precisely because it intended to hatch the
   * paused span. Closing it on the refresh meant however long the operator left it paused,
   * nothing marked the span.
   */
  test('⚠ a refresh taken while paused lands inside the gap and does not close it', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    runtime.pause();

    await env.advance(60_000);
    env.replySnapshot(snap(60));
    runtime.refreshNow();
    await env.advance(0);

    expect(runtime.getState().ring.samples).toHaveLength(2);
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: null, reason: 'paused' },
    ]);
    runtime.stop();
  });

  /*
   * ⚠ The seam neither earlier phase reached: a gap opened by one reason, outlived by another.
   * A rule phrased as "the reason that opened it" closes this on `resume()`, on a tab that is
   * still hidden.
   */
  test('⚠ pause → hide → resume leaves the gap open, because hidden is still in force', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    // ⚠ A poll must be IN FLIGHT across the whole sequence, and the ledger is what found that
    // it was not. Without one, the gap survives `resume()` for a reason that has nothing to do
    // with the predicate this test is named after: a hidden tab schedules nothing and
    // `refreshNow` is a no-op there, so **no sample arrives to close it either way**. The test
    // read green under an `anyGapReason` that had lost its `hidden` arm entirely.
    const held = heldFetch(env);
    await env.advance(5_000); // poll 2 leaves, and does not answer

    runtime.pause();
    await env.setHidden(true);
    runtime.resume();

    // The gap's recorded reason is `paused` — why it BEGAN — while the reason actually in force
    // is now `hidden`. A rule phrased as "the reason that opened it" closes this gap here, on a
    // tab that is still hidden.
    held.settle(snap(5));
    await env.advance(0);

    expect(runtime.getState().ring.samples).toHaveLength(2);
    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(0)), toMs: null, reason: 'paused' },
    ]);
    expect(env.pending).toEqual([]);
    runtime.stop();
  });

  /*
   * ⚠ **F7, end to end — and only the runtime can be asked this question.** §6.4's ten seconds
   * are ten seconds the client was **sampling**, and the hold is measured on the browser's
   * clock. A tab hidden for a minute in the middle of a pending run therefore comes back with
   * `nowMs − pendingSinceMs` far past ten seconds, and the first reading after the gap would
   * confirm a band on the strength of a minute nobody measured — dating an alarm to ground the
   * chart draws hatched. `runtime.ts` reads `gapIsOpen` **before** folding the sample in and
   * hands the answer to `observePoll`, which restarts every pending run.
   *
   * `gaps.test.ts` owns "was a gap open" and `conditions.test.ts` owns "a gap restarts the
   * run". Neither can see that the runtime joins them, and `const afterGap = false` passed both
   * suites until this fixture existed.
   */
  test('⚠ a gap restarts §6.4’s pending run, so a hidden minute confirms nothing', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
    const bandOf = (): string | undefined =>
      runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0')?.severity;

    env.replySnapshot(snap(0, 60));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);

    // Five seconds of alarming readings: a pending run, half-way to confirmation.
    for (let i = 1; i <= 5; i += 1) {
      env.replySnapshot(snap(i, 84));
      await env.advance(1_000);
    }
    expect(bandOf()).toBe('normal');

    // A minute hidden. The browser's clock runs; nothing is sampled.
    // ⚠ Queued BEFORE the tab comes back. `FakeEnv` repeats its last answer once the queue
    // runs dry, and that answer carries a `ts` the ring already holds — so resuming without a
    // fresh snapshot takes the repeat branch, which returns before `afterGap` is even computed
    // and would make this fixture pass under either implementation.
    await env.setHidden(true);
    await env.advance(60_000);
    env.replySnapshot(snap(66, 84));
    await env.setHidden(false);

    // The first reading back closes the gap and RESTARTS the run. It must not confirm it.
    await env.advance(0);
    expect(bandOf()).toBe('normal');

    // Ten more sampled seconds, and now it is earned.
    for (let i = 67; i <= 77; i += 1) {
      env.replySnapshot(snap(i, 84));
      await env.advance(1_000);
    }
    expect(bandOf()).toBe('alarm');
    runtime.stop();
  });

  /*
   * ⚠ **The prune horizon is a server `ts`, and this is the fixture that can tell.** Every
   * other gap fixture runs a server and a browser whose clocks agree, where `nowMs` and the
   * newest `ts` are the same number and the two horizons are indistinguishable. Here the server
   * is three hours behind — the same backwards-clock condition §6.7 writes `stale` for — so a
   * horizon anchored on the browser's clock lands **past every reading the ring holds** and
   * prunes the whole gap list on the first successful poll. The hatching disappears in one
   * frame and the chart silently claims it measured ground it did not.
   */
  test('⚠ a closed gap survives a server three hours behind the browser', async () => {
    const behind = -10_800; // three hours, half again the two-hour longest window
    const env = new FakeEnv();
    env.replySnapshot(snap(behind));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);

    await env.setHidden(true);
    await env.advance(30_000);
    env.replySnapshot(snap(behind + 30));
    await env.setHidden(false);
    await env.advance(0);

    expect(runtime.getState().gaps).toEqual([
      { fromMs: Date.parse(tsAt(behind)), toMs: Date.parse(tsAt(behind + 30)), reason: 'hidden' },
    ]);
    runtime.stop();
  });

  /*
   * ⚠ A gap endpoint is a server `ts`, and before the first sample there is no `ts` — the
   * previous implementation fell back to the browser's clock, putting one number from each of
   * §6.7's two clocks into the same list. Nothing has been drawn yet either, so there is
   * nothing for a hatch to meet.
   */
  test('⚠ no gap is opened before the first sample lands', async () => {
    // A tab that was already hidden at construction: `syncHidden` sees no change, so this half
    // asserts that nothing opens a gap on a path that never calls `openGap` at all.
    const env = new FakeEnv();
    env.hidden = true;
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(60_000);
    expect(runtime.getState().gaps).toEqual([]);
    runtime.stop();

    // ⚠ …and the half that actually reaches `openGap` with no `ts` to hatch back to. A first
    // poll that FAILS calls it with `fromMs === null`, and the fallback the previous
    // implementation had — the browser's clock — put one number from each of §6.7's two clocks
    // into the same list, for a span with nothing drawn at either end. Without this fixture the
    // test's own name was inert: the half above exercises no code path that could get it wrong.
    const failing = new FakeEnv();
    failing.reply({ kind: 'error', detail: 'down' });
    const second = new TelemetryRuntime(failing);
    second.start();
    await failing.advance(0);
    expect(second.getState().consecutiveFailures).toBe(1);
    expect(second.getState().gaps).toEqual([]);
    second.stop();
  });
});

// ---------------------------------------------------------------------------
// §9 — an unobservable alarm is unknown, not resolved
// ---------------------------------------------------------------------------

describe('⚠ §9: the dot does not go green when the dashboard stops being able to look', () => {
  /** GPU 0 at 90 °C — §9's own example — with every other reading healthy. */
  const hot = (secondsPastTheHour: number): TelemetrySnapshot => ({
    ...snap(secondsPastTheHour, 90),
    safety: { ...everythingZero.safety, ufwEnforcing: true },
  });

  /*
   * ⚠ **F3.** Measured before the fix: `dot = alarm, alarms = 1` with the card hot, then
   * `dot = normal, alarms = 0` the moment `gpus` went `null` — the header reading
   * `● all healthy` about a card that had been at 90 °C and was now simply unreadable, with a
   * `watch`-toned collector line arriving ten seconds later as the only counter-signal. §6.5's
   * "nothing else is affected" governs the GPU **panels**; the dot is something else, and it
   * moved in the reassuring direction.
   */
  test('⚠ a card at 90 °C whose nvidia-smi then fails keeps its alarm and its count', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '30' }));
    env.replySnapshot(hot(0));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);

    env.replySnapshot(hot(30));
    await env.advance(30_000);
    expect(runtime.getState().severity).toBe('alarm');
    // `everythingZero` is a box of dead fans, so the card is one alarm among several. What
    // matters is that the **count does not move** when the card stops being readable.
    const withCard = runtime.getState().alarms;
    expect(runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0')?.banner).toBe(true);

    // `gpus: null` — the enumeration could not be read. Nothing was learned about the card.
    env.replySnapshot({
      ...hot(60),
      gpus: null,
      errors: [{ source: 'nvidia-smi', message: 'nvidia-smi: exit 6' }],
    });
    await env.advance(30_000);

    expect(runtime.getState().severity).toBe('alarm');
    expect(runtime.getState().alarms).toBe(withCard);
    const gpu = runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0');
    expect(gpu?.stale).toBe(true);
    expect(gpu?.value).toBe('90 °C');
    runtime.stop();
  });

  /*
   * ⚠ And the mirror, which is as bad: a dashboard that latches an alarm about a card somebody
   * pulled is un-clearable without a reload, which §6.4's session log is explicitly designed
   * around. `gpus: []` is a positive observation that there is no card.
   */
  test('⚠ a card observed gone takes its alarm with it, and says so in the log', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '30' }));
    env.replySnapshot(hot(0));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);

    env.replySnapshot(hot(30));
    await env.advance(30_000);
    const withCard = runtime.getState().alarms;

    for (const at of [60, 90]) {
      env.replySnapshot({ ...hot(at), gpus: [] });
      await env.advance(30_000);
    }
    expect(runtime.getState().alarms).toBe(withCard - 1);
    expect(runtime.getState().displayed.find((d) => d.id === 'gpu_temp:0')).toBeUndefined();
    expect(runtime.getState().events.entries.some((e) => e.kind === 'retired')).toBe(true);
    runtime.stop();
  });
});

// ---------------------------------------------------------------------------
// §6.7 — a RUN of repeated `ts` values
// ---------------------------------------------------------------------------

describe('⚠ §6.7: a repeated ts is normal; a run of them is not', () => {
  /*
   * ⚠ **F4.** §6.7's dedupe is correct and is untouched here: a repeat is dropped and is not a
   * failed poll. What §6.7 had no rule for is a **run**. §4's cache bounds one at two or three
   * at the 1 s cadence; a server whose wall clock steps backwards produces an unbounded one,
   * and every snapshot in it is a *different* reading wearing a timestamp the client already
   * holds. Measured before the fix: thirty polls, thirty correct answers, nothing on screen,
   * `mode: 'live'`, `consecutiveFailures: 0`, and `getState()` identical **by identity** to the
   * state thirty seconds earlier — so `useSyncExternalStore` never fired and a store-driven
   * re-render could not tick the age either. Frozen, and green.
   */
  test('⚠ a backwards server clock is reported as stale rather than frozen and green', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
    for (let i = 0; i < 12; i += 1) env.replySnapshot(snap(i));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    for (let i = 1; i < 12; i += 1) await env.advance(1_000);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().ring.samples).toHaveLength(12);

    // The server's clock steps back thirty seconds: every answer is now a `ts` already held.
    for (let i = 0; i < 30; i += 1) {
      env.replySnapshot(snap(i % 12));
      await env.advance(1_000);
    }

    expect(runtime.getState().ring.samples).toHaveLength(12);
    expect(runtime.getState().consecutiveFailures).toBe(0);
    expect(runtime.getState().mode).toBe('stale');
    expect(runtime.getState().events.entries.some((e) => e.kind === 'mode-stale')).toBe(true);
    runtime.stop();
  });

  /*
   * ⚠ …and §4's own behaviour is still not a fault. Two or three repeats at the 1 s cadence is
   * what the 2 s cache produces by design, and the dashboard must stay `live` through them or
   * the mode fires on the contract rather than on a breach of it.
   */
  test('⚠ §4’s cache repeating a snapshot three times at 1 s stays live', async () => {
    const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
    env.replySnapshot(snap(0)).replySnapshot(snap(0)).replySnapshot(snap(0)).replySnapshot(snap(3));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    for (let i = 0; i < 3; i += 1) await env.advance(1_000);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().events.entries.some((e) => e.kind === 'mode-stale')).toBe(false);
    runtime.stop();
  });

  /*
   * ⚠ **F5**, from the runtime's side. Step 10 colours every cell from `latestSample`, and the
   * chart's last point comes from `samplesWithin`, which is `ts`-ordered. If the accessor
   * answered *newest by arrival*, one backwards step would put an older figure beside a newer
   * trace — §6.4: "a colour that disagreed with its own figure would be a worse lie than a
   * colour that flickers."
   */
  test('⚠ the cell and the chart read the same sample after a backwards clock step', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.replySnapshot(snap(100, 84));
    await env.advance(5_000);
    env.replySnapshot(snap(50, 0));
    await env.advance(5_000);

    expect(runtime.getState().ring.samples).toHaveLength(3);
    expect(latestSample(runtime.getState())?.tsMs).toBe(Date.parse(tsAt(100)));
    expect(latestSample(runtime.getState())?.snapshot.gpus?.[0]?.tempC).toBe(84);
    runtime.stop();
  });
});

// ---------------------------------------------------------------------------
// §6.7 — the arrival path, and *refresh now* while hidden
// ---------------------------------------------------------------------------

describe('⚠ nothing on the arrival path can stop the loop silently', () => {
  /*
   * ⚠ **C1.** The `try` used to cover `env.fetchTelemetry()` and nothing else, while
   * `reschedule()` is the **last** statement of the poll. A throw anywhere after the `await`
   * would leave `inFlight` already false, **no timer pending**, `running` true and the mode
   * still `live`: polling stops with nothing on screen to say so, and unlike every failure
   * §6.7 describes it never recovers. No reachable trigger was found, which is why this
   * fixture manufactures one — the exposure is structural, and one edit closes it.
   */
  test('⚠ a body that throws while being read is a failed poll, not a runtime that stops', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    env.reply({
      kind: 'ok',
      body: new Proxy(
        {},
        {
          getOwnPropertyDescriptor(): never {
            throw new Error('the body fought back');
          },
        },
      ),
    });
    await env.advance(5_000);

    expect(runtime.getState().mode).toBe('stale');
    expect(runtime.getState().consecutiveFailures).toBe(1);
    expect(env.pending).toEqual([5_000]);

    env.replySnapshot(snap(10));
    await env.advance(5_000);
    expect(runtime.getState().mode).toBe('live');
    expect(runtime.getState().ring.samples).toHaveLength(2);
    runtime.stop();
  });

  /*
   * ⚠ **F12.** §6.7's pause is that a hidden tab schedules nothing *and asks nothing*. A hidden
   * tab cannot receive a click, so the only caller here is programmatic — which is exactly
   * what step 10 will write. Left unguarded it takes a reading inside a hidden gap and can
   * leave `stale` on a tab nobody is looking at.
   */
  test('⚠ refresh now does nothing while the tab is hidden', async () => {
    const env = new FakeEnv();
    const runtime = await started(env, 1);
    await env.setHidden(true);
    const before = env.fetches;

    runtime.refreshNow();
    await env.advance(0);
    expect(env.fetches).toBe(before);
    expect(env.pending).toEqual([]);
    runtime.stop();
  });
});
