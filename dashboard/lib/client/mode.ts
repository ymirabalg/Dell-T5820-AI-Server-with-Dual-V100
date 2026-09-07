/**
 * §6.2's display mode — **`live` · `paused` · `stale` · `expired`**, as one function.
 *
 * §9: *"Paused/stale is a mode shown alongside [the aggregate], never instead of it."* §6.2:
 * *"The severity glyph answers 'how is the machine', the mode answers 'how current is this';
 * collapsing the two loses one of them."* So nothing here touches a severity.
 *
 * ---
 *
 * ### ⚠ `stale` is a function of the newest reading's AGE, not of the failure counter
 *
 * §6.7, and the reason is a failure the failure counter cannot see:
 *
 * > **A repeated `ts` is normal; a RUN of them is not.** §4's cache produces two or three
 * > repeats in a row at the 1 s cadence and occasionally at 2 s, never at 5 s or slower — a
 * > run bounded by the contract. A server whose wall clock steps **backwards** produces an
 * > unbounded one, and every snapshot in it is a *different* reading wearing a timestamp the
 * > client already holds, so each is correctly dropped while the page learns nothing and
 * > stays green.
 *
 * Measured before the fix: thirty polls, thirty correct answers, **nothing on screen**, mode
 * `live`, and `getState()` identical by identity throughout — so `useSyncExternalStore` never
 * fired and a store-driven re-render could not tick the age either. The dashboard was frozen
 * and the dot was green.
 *
 * ⚠ The narrow fix — count consecutive repeats — covers one cause. This covers four with one
 * number the page already computes: **the server is not answering, the server is answering
 * with a `ts` the client already holds, the server has simply gone quiet, or the server's
 * clock is ahead of the browser's.** All four say the same thing to an operator: what you are
 * looking at is not current.
 *
 * ### ⚠ Which clock, and why the age is the one place they meet
 *
 * §6.7: *"The age indicator is the one place the two are compared, and that is its whole
 * job."* The age is `browser now − server ts`, and §4 blesses the direction of its error —
 * `ts` is stamped when the poll **began**, so the age can only over-state. A **negative** age
 * is therefore not a reading from the future but clock skew, and it is not `live` by any
 * reading. §6.6 governs how it renders: never as a negative number.
 *
 * ### ⚠ `paused` outranks `stale`
 *
 * An operator who stopped the polling knows why the reading is old; telling them it is stale
 * would hide the mode they chose. `expired` outranks everything: the browser is on its way to
 * `/login` and no other mode will be seen.
 */

/** §6.2's four display modes. `expired` is terminal. */
export type RuntimeMode = 'live' | 'paused' | 'stale' | 'expired';

/**
 * How many cadences of silence make a reading stale.
 *
 * Three, because §4's cache can legitimately repeat a snapshot "two or three times in a row"
 * at the 1 s cadence — a run bounded by the contract — and the mode must not fire on the
 * contract's own behaviour. Expressed as a multiple of the *selected* cadence rather than as
 * a constant, so the same written rule means the same thing at 1 s and at 30 s.
 */
export const STALE_CADENCE_MULTIPLE = 3;

/**
 * The floor under {@link staleAfterMs}.
 *
 * At the 1 s cadence three cadences is 3 s, which a single slow poll can exceed — §6.7
 * blesses a 6 s poll against a 5 s cadence. Ten seconds is §6.4's own hold, and using it here
 * keeps the two thresholds from disagreeing about what "a moment" is.
 */
export const MIN_STALE_AGE_MS = 10_000;

/** How old the newest reading may be before §6.2 calls the dashboard `stale`. */
export const staleAfterMs = (cadenceMs: number): number =>
  Math.max(MIN_STALE_AGE_MS, STALE_CADENCE_MULTIPLE * cadenceMs);

/** Everything {@link modeOf} needs. All four are facts the runtime already holds. */
export interface ModeInput {
  /** A 401 has been seen. Terminal (§5.2). */
  readonly expired: boolean;
  /** §6.2's pause control. The operator's, not the browser's. */
  readonly paused: boolean;
  /** §6.7's backoff counter. */
  readonly consecutiveFailures: number;
  /**
   * `browser now − newest ts`, or `null` before the first sample.
   *
   * `null` is **not** stale: before the first poll there is no reading to be old, and §6.7's
   * "first sample" rules already describe that state.
   */
  readonly ageMs: number | null;
  /** The selected cadence, in ms. */
  readonly cadenceMs: number;
}

/** Is the newest reading old enough — or impossible enough — to say so? */
export const isStale = (input: ModeInput): boolean => {
  if (input.consecutiveFailures > 0) return true;
  if (input.ageMs === null) return false;
  // A `ts` ahead of the browser's clock is skew, and skew is not currency.
  if (input.ageMs < 0) return true;
  return input.ageMs > staleAfterMs(input.cadenceMs);
};

/** §6.2's mode. See the module doc for the precedence. */
export const modeOf = (input: ModeInput): RuntimeMode => {
  if (input.expired) return 'expired';
  if (input.paused) return 'paused';
  return isStale(input) ? 'stale' : 'live';
};
