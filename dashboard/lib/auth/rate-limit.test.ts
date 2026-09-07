import { describe, expect, test } from 'vitest';

import {
  ATTEMPT_WINDOW_MS,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  createRateLimiter,
} from './rate-limit';

/**
 * §5's limit: "five attempts per minute **for the whole service**, then a 60 s lockout", the
 * `Retry-After` the screen counts down from, and the clock it is measured on.
 *
 * ⚠ There is no key here, and no test for one. §5 makes the bucket global — see the module
 * doc for why `X-Forwarded-For` is meaningless on §2.5's deployment — so "one bucket for the
 * whole service" is a property of this module's *shape*, not of a value it computes. The
 * observable half is asserted where it is observable: `handler.test.ts` locks the service
 * from one source address and finds a second one refused.
 */

describe('§5’s five per minute', () => {
  /*
   * ⚠ Fixture symmetry over the one comparison that decides the whole feature
   * (HANDOVER §5.1): the fifth attempt inside the window is allowed and the sixth is not.
   * The two sides differ at the panel — one is a login form, the other is a countdown.
   */
  test('⚠ the fifth attempt in a window is allowed and the sixth is refused', () => {
    const limiter = createRateLimiter();

    for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
      expect(limiter.attempt(i), `attempt ${i}`).toEqual({ allowed: true });
    }
    expect(limiter.attempt(MAX_ATTEMPTS + 1)).toEqual({
      allowed: false,
      retryAfterSeconds: LOCKOUT_MS / 1000,
    });
  });

  test('⚠ the window slides — attempts older than a minute do not count', () => {
    const limiter = createRateLimiter();

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) expect(limiter.attempt(i).allowed).toBe(true);
    // The first five are now all strictly older than the window, so this is attempt one.
    expect(limiter.attempt(ATTEMPT_WINDOW_MS + MAX_ATTEMPTS).allowed).toBe(true);
  });

  /*
   * ⚠ Two limiters are two buckets, which is what makes "one process, one instance" a
   * *security* requirement rather than a performance one: a second instance of this module
   * makes §5's global limit N× looser, silently and in the failing-open direction. Step 11
   * owns the guarantee; this is the property it has to guarantee.
   */
  test('⚠ each limiter is its own bucket, so a second instance doubles the limit', () => {
    const first = createRateLimiter();
    const second = createRateLimiter();

    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) first.attempt(i);
    expect(first.attempt(10).allowed).toBe(false);
    expect(second.attempt(10).allowed).toBe(true);
  });
});

describe('the 60 s lockout and its Retry-After', () => {
  const locked = (options: Parameters<typeof createRateLimiter>[0] = {}): ReturnType<
    typeof createRateLimiter
  > => {
    const limiter = createRateLimiter(options);
    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) limiter.attempt(0);
    return limiter;
  };

  /*
   * ⚠ §5.2: "**The countdown is server-supplied, never client-invented.**" The header's value
   * is this number, so it has to count down in step with the lockout rather than being a
   * constant 60.
   */
  test('⚠ Retry-After counts down with the lockout', () => {
    const limiter = locked();

    expect(limiter.attempt(0)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(limiter.attempt(30_000)).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(limiter.attempt(59_500)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  /*
   * ⚠ Fixture symmetry on the lockout's own boundary: refused at one millisecond before it
   * ends, allowed at the instant it ends.
   */
  test('⚠ the lockout ends exactly when it says it will', () => {
    const limiter = locked();

    expect(limiter.attempt(LOCKOUT_MS - 1).allowed).toBe(false);
    expect(limiter.attempt(LOCKOUT_MS).allowed).toBe(true);
  });

  /*
   * ⚠ `Retry-After` is whole seconds and must never be `0` — a client told to wait zero
   * seconds retries immediately, which is the busy-loop the header exists to prevent. 1 ms
   * remaining is one second.
   */
  test('⚠ Retry-After is never zero, however little time is left', () => {
    const limiter = locked();
    expect(limiter.attempt(LOCKOUT_MS - 1)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  /*
   * ⚠ A locked service is refused **without** recording the attempt. §5.2 has the countdown
   * reach zero and the client re-enable submit; a lockout that every refused request pushed
   * forward could never be reached — and a hidden tab retrying on a timer would hold the
   * operator out for ever.
   */
  test('⚠ attempts made during a lockout do not extend it', () => {
    const limiter = locked();

    for (let at = 0; at < LOCKOUT_MS; at += 1000) limiter.attempt(at);
    expect(limiter.attempt(LOCKOUT_MS).allowed).toBe(true);
  });

  /*
   * ⚠ After the lockout a fresh window starts rather than relocking on the attempts that
   * caused it. Without the reset the first attempt after release would be the sixth in a
   * still-populated list and the user would be locked out again immediately.
   */
  test('⚠ a released service gets a whole fresh window, not one attempt', () => {
    // ⚠ A **shorter lockout than the window**, deliberately. At the shipped constants the two
    // are both 60 s, so every attempt that caused a lockout is already outside the window when
    // it releases and the clear is unobservable. That equality is a property of two numbers,
    // not of the limiter — and a limiter that relied on it would relock instantly the moment
    // either constant moved. This drives the mechanism instead of the coincidence.
    const limiter = locked({ lockoutMs: 10_000 });

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(limiter.attempt(10_000 + i).allowed, `attempt ${i}`).toBe(true);
    }
    expect(limiter.attempt(10_000 + MAX_ATTEMPTS).allowed).toBe(false);
  });

  /*
   * ⚠ A correct password is not a guess. Without this, a user who mistyped four times and
   * then succeeded would be one attempt from a lockout for the rest of the minute.
   */
  test('⚠ clearing forgets the attempts, and the lockout with them', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) limiter.attempt(i);

    limiter.clear();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(limiter.attempt(MAX_ATTEMPTS + i).allowed).toBe(true);
    }

    // …and from a locked state too: `clear` is the whole state, not half of it.
    const relocked = createRateLimiter();
    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) relocked.attempt(0);
    expect(relocked.attempt(1).allowed).toBe(false);
    relocked.clear();
    expect(relocked.attempt(1).allowed).toBe(true);
  });
});

/*
 * ⚠ There is deliberately no "the map does not grow" test here any more, and that is a
 * finding rather than an omission.
 *
 * The keyed limiter had an observable `size`, a `SWEEP_AT` threshold and a lazy sweep — all
 * of which existed because its keys were attacker-chosen. §5's global bucket has two
 * variables and no map, so "bounded state" is a property of the module's *shape* and is not
 * observable through its interface: a version that kept every attempt for ever and filtered
 * at decision time behaves identically through `attempt`, which is exactly the "green for the
 * wrong reason" a test cannot distinguish. The behavioural half that *is* observable — that
 * the window is applied at all — is `⚠ the window slides` above.
 *
 * The no-timer half is enforced where it can be: `lib/guardrails.test.ts` scans this file's
 * source for `setInterval`/`setImmediate`/`queueMicrotask` (mutation `G1`).
 */
