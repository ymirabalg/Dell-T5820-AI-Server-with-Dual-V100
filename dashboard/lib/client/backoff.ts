/**
 * §6.7's failed-poll backoff — **1×, 2×, 4× the cadence, capped at 30 s**.
 *
 * §6.7: *"Failed poll: exponential backoff at 1×, 2×, 4× the cadence, capped at 30 s. The
 * header dot goes grey, the age counts up, traces freeze rather than plotting zeros, and a
 * banner names the failure. Recovery resets the backoff."*
 *
 * ### What counts as a failure here, and what does not
 *
 * Only a **server** failure: the request never answered, answered with a status this client
 * does not understand, or answered 200 with a body that is not §4's snapshot. Two things
 * that look like failures are not:
 *
 * - ⚠ **A repeated `ts` is not a failed poll** (§6.7). §4's 2 s cache serves the same
 *   snapshot two or three times in a row at the 1 s cadence. The dot stays green, the age
 *   counts from that `ts`, and the backoff is **not** engaged. That decision is made in
 *   `ring.ts` — a repeat returns the ring by identity — and honoured in `runtime.ts`.
 * - ⚠ **A 401 is not a failed poll** (§5.2, HANDOVER §6.3). It means *sign in again*, and it
 *   routes to `/login`. Sending it down this path would back off against a server that is
 *   answering perfectly, and would leave the operator watching a grey dot instead of a login
 *   screen.
 *
 * ### The reading of "1×, 2×, 4× … capped at 30 s"
 *
 * ⚠ §6.7 enumerates three multipliers and then a cap, and the two readings of that sentence
 * — *keep doubling until the cap* and *stop at 4×, capped* — **agree on every delay it
 * writes down**. They differ only from the fourth consecutive failure at a cadence below 8 s,
 * where doubling gives 8× and holding gives 4×. This implements the first: "exponential
 * backoff … capped at" is the standard idiom for doubling until a ceiling, and it is the
 * reading that makes the cap do work at every cadence rather than only at the slow ones.
 * Recorded in the step notes as the one place §6.7 admits two readings.
 */

/** §6.7's ceiling. It is also exactly the slowest cadence §6.2 offers, which is not chance. */
export const BACKOFF_CAP_MS = 30_000;

/**
 * How long to wait before the next poll.
 *
 * `consecutiveFailures` is 0 while polling is healthy — and the answer is then the cadence
 * itself, so the caller has one scheduling call rather than a branch. 1 failure is 1× the
 * cadence, 2 is 2×, 3 is 4×, and so on to {@link BACKOFF_CAP_MS}.
 *
 * ⚠ **Recovery resets the counter, not this function.** A successful poll sets
 * `consecutiveFailures` back to 0 in `runtime.ts`; there is deliberately no decay or partial
 * reset here, because §6.7 says "recovery resets the backoff" and a half-reset would leave a
 * recovered server being polled at 4× the cadence the operator selected.
 */
export const backoffDelayMs = (cadenceMs: number, consecutiveFailures: number): number => {
  // Clamped so a pathological failure count cannot produce `Infinity` and, with a zero
  // cadence, `NaN` — `Math.min(NaN, 30000)` is `NaN`, and `setTimeout(NaN)` fires in 1 ms.
  const exponent = Math.min(Math.max(0, consecutiveFailures - 1), 31);
  return Math.min(cadenceMs * 2 ** exponent, BACKOFF_CAP_MS);
};
