/**
 * §5's login rate limit: **five attempts per minute for the whole service, then a 60 s
 * lockout**, in memory, with the `Retry-After` the login screen counts down from.
 *
 * > §5: "**Rate-limit login globally — deliberately NOT per IP.** … **One bucket for the
 * > whole service: five attempts per minute, then a 60 s lockout.** Being a single bucket is
 * > also what keeps the password-hashing queue bounded (§5.2)."
 * > §5.2: "**The countdown is server-supplied, never client-invented.** A 429 carries a
 * > `Retry-After` header and the screen renders its countdown from that value."
 *
 * ---
 *
 * ### ⚠ There is no key, and that is the design — not a simplification of one
 *
 * §2.5 runs the container `--network host` with **no reverse proxy**, and Next 15 removed
 * `NextRequest.ip`. The only thing resembling a client address is `X-Forwarded-For`, and
 * measured in `next/dist/server/base-server.js`:
 *
 * ```js
 * req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress;
 * ```
 *
 * `??=` — Next fills it from the socket **only when the client did not send one**, and an App
 * Router route handler is never handed the socket. So on this deployment nothing legitimate
 * ever sets that header: it is not merely untrustworthy, it is *meaningless*. Keying on it is
 * worse than not keying at all, because the asymmetry is total — an attacker can rotate it to
 * escape their own bucket **and** forge the operator's value to occupy theirs, while the
 * operator can do neither in return.
 *
 * This module therefore has **one bucket and no key parameter**. What that removed, measured
 * against the keyed version it replaced:
 *
 * | gone with the key | what it was for |
 * |---|---|
 * | `sourceKeyOf` | reading a header that means nothing here |
 * | `MAX_KEY_CHARS` | stopping a 64 KiB header becoming a 64 KiB map key |
 * | `UNKNOWN_SOURCE` | a shared bucket for blank headers, which conflated unrelated clients |
 * | the `Map` and its lazy sweep | an unbounded, attacker-grown allocation whose O(n) sweep past 256 keys freed nothing while every attempt was still inside its own window |
 *
 * ⚠ And the one that matters most: **the KDF queue is now bounded by the limit itself.**
 * `handler.ts` checks this before it reads the body and long before scrypt runs, so at most
 * {@link MAX_ATTEMPTS} hashes can ever be pending. With a key the caller chose, a flood of
 * forged addresses queued one scrypt each — measured on the built server: 1 500 forged
 * attempts cost the attacker ~1.5 s and delayed the operator's own correct login by **84.7
 * seconds**, with every queued job retaining its password and request frame and §2.5 setting
 * no container memory limit. No queue cap and no admission controller are needed to close
 * that; deleting the key closes it by construction.
 *
 * The cost is stated in §5: any LAN host can hold the login screen closed for 60 s at a time.
 * The per-source form had that property already — forge the operator's address, or spray a
 * /22 — so nothing is given up. If a reverse proxy that overwrites `X-Forwarded-For` is ever
 * put in front of §2.5's container, a per-source key becomes implementable and §5 says to
 * revisit this then, not before.
 *
 * ### ⚠ A monotonic clock, not `Date.now()`
 *
 * A 60 s lockout timed on the wall clock can be ended early by a forward NTP step and
 * extended indefinitely by a backward one. `nowMs` is supplied by the caller and the caller
 * passes `performance.now()`. This is mutation `R14`'s lesson — §4's cache was timed on
 * `Date.now()` and a backward step held a stale snapshot — applied to the one other place in
 * this project that measures an interval.
 *
 * The session cookie is the opposite case and deliberately uses the wall clock; `session.ts`
 * says why.
 *
 * ### ⚠ No timer, anywhere
 *
 * There is nothing to sweep: the state is two variables, and the window is applied by
 * filtering on read. §4 forbids background work in this process ("with no clients connected
 * the container does no work at all"), `lib/guardrails.test.ts` enforces it over the source
 * text, and HANDOVER named this module as the thing most likely to reach for `setInterval`.
 */

/** §5.2: five attempts. The sixth inside the window is the one that locks the service. */
export const MAX_ATTEMPTS = 5;

/** §5.2: "per minute". */
export const ATTEMPT_WINDOW_MS = 60_000;

/** §5.2: "then a 60 s lockout". */
export const LOCKOUT_MS = 60_000;

/** The limiter's answer. `retryAfterSeconds` is exactly what goes in the `Retry-After` header. */
export type RateVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/** Tunables. Defaults are §5.2's; a test overrides them so it does not have to run for a minute. */
export interface RateLimiterOptions {
  readonly maxAttempts?: number;
  readonly windowMs?: number;
  readonly lockoutMs?: number;
}

export interface RateLimiter {
  /**
   * Consume one attempt.
   *
   * ⚠ Consuming and deciding are **one** call on purpose. Two — a `check` then a `record` —
   * is a lock that a caller can forget to arm on the path where the body was malformed,
   * which is precisely the path a script hits.
   */
  attempt(nowMs: number): RateVerdict;
  /** Forget every attempt. Called when a login succeeds — a correct password is not a guess. */
  clear(): void;
}

/** `Retry-After` takes whole seconds, and never `0` — a client told to wait 0 s would retry at once. */
const retryAfterSeconds = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / 1000));

export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? ATTEMPT_WINDOW_MS;
  const lockoutMs = options.lockoutMs ?? LOCKOUT_MS;

  /** Monotonic instants of the attempts inside the current window. */
  let attempts: number[] = [];
  /** Monotonic instant the lockout ends, or `0`. */
  let lockedUntilMs = 0;

  return {
    attempt(nowMs: number): RateVerdict {
      // ⚠ A locked service is refused **without** recording the attempt, so a hidden tab
      // retrying every second cannot roll the lockout forward for ever. §5.2 says the
      // countdown reaches zero and the client re-enables submit; a self-extending lockout
      // would make that impossible to reach.
      if (lockedUntilMs > nowMs) {
        return { allowed: false, retryAfterSeconds: retryAfterSeconds(lockedUntilMs - nowMs) };
      }

      const since = nowMs - windowMs;
      attempts = attempts.filter((at) => at > since);
      attempts.push(nowMs);

      if (attempts.length > maxAttempts) {
        lockedUntilMs = nowMs + lockoutMs;
        // Cleared, so that when the lockout ends a fresh window starts rather than relocking
        // on the stale attempts that caused it.
        attempts = [];
        return { allowed: false, retryAfterSeconds: retryAfterSeconds(lockoutMs) };
      }

      return { allowed: true };
    },

    clear(): void {
      attempts = [];
      lockedUntilMs = 0;
    },
  };
};

/**
 * The process-wide limiter. **One instance, and that is now a security property**: a second
 * one makes the global limit N× looser, silently and in the failing-open direction. Step 11
 * owes "one process, one module instance" (HANDOVER), and this joins `productionRevocations`
 * and the `TelemetrySource` on it.
 */
export const productionRateLimiter: RateLimiter = createRateLimiter();
