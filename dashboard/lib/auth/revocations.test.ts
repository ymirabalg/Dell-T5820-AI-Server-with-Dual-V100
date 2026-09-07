import { describe, expect, test } from 'vitest';

import { SWEEP_AT, createRevocations, productionRevocations } from './revocations';

/** What makes `DELETE /api/session` mean something to a token that is still validly signed. */

const NOW = 1_757_000_000_000;

describe('revoking', () => {
  /*
   * ⚠ A signed cookie is stateless: clearing the browser's copy does nothing to a copy
   * somebody else already holds. This store is the whole of the "not replayable after DELETE"
   * promise, and its scope is stated where it is made — `revocations.ts` — because a container
   * restart forgets it.
   */
  test('⚠ a revoked session id stays revoked until its own expiry', () => {
    const revocations = createRevocations();

    expect(revocations.isRevoked('sid', NOW)).toBe(false);
    revocations.revoke('sid', NOW + 10_000, NOW);
    expect(revocations.isRevoked('sid', NOW)).toBe(true);
    expect(revocations.isRevoked('sid', NOW + 9_999)).toBe(true);
  });

  test('one revocation does not touch another session', () => {
    const revocations = createRevocations();
    revocations.revoke('mine', NOW + 10_000, NOW);

    expect(revocations.isRevoked('yours', NOW)).toBe(false);
  });

  /*
   * ⚠ Fixture symmetry on the entry's own expiry (HANDOVER §5.1). At `exp` the token is
   * already refused by `verifySessionToken` — `exp > nowMs` — so the entry is dead weight and
   * is dropped on read. One case each side.
   */
  test('⚠ an entry is live up to its exp and dropped at it', () => {
    const revocations = createRevocations();
    revocations.revoke('sid', NOW + 1000, NOW);

    expect(revocations.isRevoked('sid', NOW + 999)).toBe(true);
    expect(revocations.size).toBe(1);
    expect(revocations.isRevoked('sid', NOW + 1000)).toBe(false);
    expect(revocations.size).toBe(0);
  });
});

describe('memory, without a timer', () => {
  /*
   * ⚠ §4: "with no clients connected the container does no work at all". Nothing here runs on
   * a schedule; entries are dropped on read when they expire, and on write once the map grows
   * past {@link SWEEP_AT}. `lib/guardrails.test.ts` enforces the no-timer half over the source
   * text; this is the half that shows the pruning actually happens.
   */
  test('⚠ the store is swept on write once it grows past its threshold', () => {
    const revocations = createRevocations();

    for (let i = 0; i <= SWEEP_AT; i += 1) revocations.revoke(`sid-${i}`, NOW + 1000, NOW);
    expect(revocations.size).toBeGreaterThan(1);

    // One more write, after everything held has expired.
    revocations.revoke('fresh', NOW + 100_000, NOW + 2000);
    expect(revocations.size).toBe(1);
  });

  test('the sweep keeps entries that have not expired', () => {
    const revocations = createRevocations();

    for (let i = 0; i <= SWEEP_AT; i += 1) revocations.revoke(`sid-${i}`, NOW + 100_000, NOW);
    revocations.revoke('fresh', NOW + 100_000, NOW + 1000);
    expect(revocations.size).toBe(SWEEP_AT + 2);
  });

  /*
   * ⚠ The store cannot be grown by an attacker: `revoke` is reached only from a validly
   * signed cookie, which needs `SESSION_SECRET`. Its size is the number of real logouts
   * inside one 30-day window. This pins the clock the sweep uses as the *caller's*, so the
   * module reads no clock of its own and a test drives the pruning rather than waiting for it.
   */
  test('⚠ the sweep is measured on the clock the caller supplies', () => {
    const revocations = createRevocations();

    for (let i = 0; i <= SWEEP_AT; i += 1) revocations.revoke(`sid-${i}`, 1000, 0);
    // A `nowMs` before every entry's expiry: nothing may be dropped, whatever the wall clock
    // of the machine running the test says.
    revocations.revoke('fresh', 1000, 0);
    expect(revocations.size).toBe(SWEEP_AT + 2);
  });
});

describe('the process-wide store', () => {
  test('exists, and starts empty', () => {
    expect(productionRevocations.size).toBe(0);
  });
});
