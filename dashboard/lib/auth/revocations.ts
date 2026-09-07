/**
 * What makes `DELETE /api/session` mean something.
 *
 * A signed cookie is *stateless*: clearing the browser's copy does nothing to a copy someone
 * else already has. So logout revokes the session's `sid` here, and every `/api/*` check
 * consults it.
 *
 * ---
 *
 * ### ⚠ In memory, and that is the same trade §5 already made for the rate limiter
 *
 * §2.5 runs the container `--read-only` with a tmpfs `/tmp`, and §5 accepts the consequence
 * for the limiter in as many words: *"Counted in memory; it resets on container restart,
 * which is acceptable for a LAN service and avoids giving the dashboard a writable store it
 * otherwise does not need."* The same sentence governs this store, and the same limitation
 * follows: **a container restart forgets every revocation**, so a captured cookie held
 * across a restart is live again until its own 30 days run out. Rotating `SESSION_SECRET`
 * is the escape hatch, and §5.1 is explicit that `dashboard.sh install` must never do it by
 * accident, because it logs out every session.
 *
 * ### ⚠ Bounded without a timer
 *
 * Nothing sweeps on a schedule — §4 forbids background work in this process outright and
 * `lib/guardrails.test.ts` enforces it over the source text. Entries are dropped lazily: on
 * read when the underlying session would have expired anyway, and on write once the map
 * grows past {@link SWEEP_AT}.
 *
 * The store cannot be grown by an attacker: `revoke` is only ever reached from a **validly
 * signed** cookie, which needs `SESSION_SECRET`. Its size is therefore the number of real
 * logouts inside one 30-day window, which on this box is a number like ten.
 *
 * ### ⚠ `proxy.ts` does not consult this, on purpose
 *
 * Next's own documentation for the proxy file says it "is meant to be invoked separately of
 * your render code … you should not attempt relying on shared modules or globals." So the
 * proxy makes the **cryptographic** verdict (signature + expiry, `session.ts`) and the
 * `/api/*` routes make the **full** one (signature + expiry + revocation, `authorize.ts`).
 * The consequence is stated rather than hidden: a revoked cookie can still fetch the
 * dashboard's HTML shell, which carries no telemetry, and the first `GET /api/telemetry`
 * that shell makes is a 401 that §5.2 routes to `/login`. Every *reading* is behind the full
 * verdict.
 */

/** Sweep the map on the next write once it holds more than this many entries. */
export const SWEEP_AT = 256;

/** The revocation store. One instance per process — see {@link productionRevocations}. */
export interface Revocations {
  /**
   * Revoke a session until it would have expired on its own.
   *
   * @param expMs the session's own `exp`, so the entry can never outlive the cookie it bans
   * @param nowMs wall-clock milliseconds, used only to decide what to prune
   */
  revoke(sid: string, expMs: number, nowMs: number): void;
  /** Has this session been revoked, and is that revocation still meaningful at `nowMs`? */
  isRevoked(sid: string, nowMs: number): boolean;
  /** How many entries are held. Exists so a test can observe the pruning rather than infer it. */
  readonly size: number;
}

/** A fresh store. Injected in tests; the process's own is {@link productionRevocations}. */
export const createRevocations = (): Revocations => {
  const until = new Map<string, number>();

  const sweep = (nowMs: number): void => {
    for (const [sid, expMs] of until) {
      if (expMs <= nowMs) until.delete(sid);
    }
  };

  return {
    revoke(sid: string, expMs: number, nowMs: number): void {
      until.set(sid, expMs);
      // ⚠ Lazily, on write, and only past the threshold: a sweep on every call would be
      // O(n) per logout for no benefit, and a sweep on a timer is forbidden (§4). The clock
      // is the caller's — this module never reads one, so a test drives the pruning instead
      // of waiting for it.
      if (until.size > SWEEP_AT) sweep(nowMs);
    },

    isRevoked(sid: string, nowMs: number): boolean {
      const expMs = until.get(sid);
      if (expMs === undefined) return false;
      if (expMs <= nowMs) {
        // The cookie is past its own expiry, so `verifySessionToken` has already refused it
        // and the entry is dead weight.
        until.delete(sid);
        return false;
      }
      return true;
    },

    get size(): number {
      return until.size;
    },
  };
};

/**
 * The process-wide store.
 *
 * ⚠ One instance, built at module load, for the same reason `handler.ts` builds one
 * `TelemetrySource`: the state is only meaningful if every request meets the same one.
 */
export const productionRevocations: Revocations = createRevocations();
