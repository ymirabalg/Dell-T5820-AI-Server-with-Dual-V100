import { describe, expect, test } from 'vitest';

import { verifySession } from '@/lib/auth/authorize';
import { everythingZero, nothingReadable } from '@/lib/fixtures';
import type { TelemetrySnapshot } from '@/lib/types';

import { handleTelemetry, productionTelemetryDeps } from './handler';
import type { TelemetryHandlerDeps } from './handler';

/**
 * `GET /api/telemetry` as a function: §4's status codes, §4's body, and the ordering rule
 * that keeps an unauthenticated caller from making this box run `nvidia-smi`.
 */

const request = (): Request => new Request('http://ai-server:8090/api/telemetry');

/** A source that hands back one snapshot and counts how often it was asked. */
const sourceOf = (snapshot: TelemetrySnapshot) => {
  const asked: number[] = [];
  return {
    get calls(): number {
      return asked.length;
    },
    source: {
      snapshot: async (): Promise<TelemetrySnapshot> => {
        asked.push(1);
        return snapshot;
      },
    },
  };
};

const deps = (
  authorize: TelemetryHandlerDeps['authorize'],
  snapshot: TelemetrySnapshot = everythingZero,
) => {
  const spy = sourceOf(snapshot);
  return { spy, deps: { authorize, source: spy.source } satisfies TelemetryHandlerDeps };
};

describe('the 401 path (§4, §5)', () => {
  /*
   * ⚠ §4: "Requires a valid session cookie; returns 401 otherwise." §5.2: "every `/api/*`
   * returns 401, and the client routes to `/login` with the expired message".
   *
   * No body: §4 and §5 specify the status and nothing else, and inventing an error envelope
   * here would be a second, unspecified contract for step 8 to depend on.
   */
  test('⚠ a request without a valid session is refused with 401 and no body', async () => {
    const { deps: refusing } = deps(() => false);
    const response = await handleTelemetry(request(), refusing);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  /*
   * ⚠ The ordering rule. An unauthenticated request must not be able to make this box run
   * `nvidia-smi`, open two D-Bus connections and probe both `llama-server` instances — and
   * "the check is written above the sample" is a fact about the code, so it is asserted by
   * call count instead.
   */
  test('⚠ an unauthorised request never reaches the telemetry source', async () => {
    const { spy, deps: refusing } = deps(() => false);
    await handleTelemetry(request(), refusing);

    expect(spy.calls).toBe(0);
  });

  /*
   * ⚠ **Fail closed, now through the real verifier.** Step 6 shipped
   * `noSessionVerifierYet`, a constant `false`; step 7 deleted it — an exported, tested,
   * unused seam is its own hazard — and wired `verifySession` into the same slot.
   *
   * The property under test is unchanged and is the one that matters on this box: a request
   * carrying **no session cookie** is refused, and the refusal happens before the source is
   * touched. The alternative — a permissive check — is an unauthenticated telemetry endpoint
   * on a LAN box, the same shape as `serve-llm.sh` writing a ufw rule into a firewall that
   * was never enabled, which left 8080/8081 open for a week.
   *
   * ⚠ The **real** `verifySession` runs here against a **fake** source, deliberately. Using
   * `productionTelemetryDeps` wholesale would mean that a permissive verifier turns this
   * assertion into a live `nvidia-smi` fork on whatever machine is running the suite.
   */
  test('⚠ the production session check refuses a request carrying no session cookie', async () => {
    expect(productionTelemetryDeps.authorize).toBe(verifySession);

    const { spy, deps: real } = deps(verifySession);
    const response = await handleTelemetry(request(), real);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(spy.calls).toBe(0);
  });

  /*
   * ⚠ §5: "A session check that cannot reach a verdict DENIES … **and any error raised
   * while deciding** — is **401**, never 500."
   *
   * This is step 7's routine path: its `authorize` is cookie read → decode → HMAC verify,
   * and every one of those throws on malformed input. A truncated or hand-edited cookie is
   * the ordinary way a bad session arrives, not an exotic one.
   *
   * The status is not the whole of the damage. §5.2 routes a 401 to `/login`; a 500 puts
   * the client on §6.7's failed-poll path — grey dot, frozen traces, backoff to 30 s, a
   * banner naming a *server* failure — and the user is never told to sign in and never
   * recovers without clearing the cookie by hand. Measured on the shipped handler before
   * this was fixed: both shapes of failure below made `handleTelemetry` **reject**.
   */
  test('⚠ a session check that throws is a 401, never a 500', async () => {
    const { spy, deps: exploding } = deps(() => {
      throw new Error('malformed cookie');
    });
    const response = await handleTelemetry(request(), exploding);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(spy.calls).toBe(0);
  });

  test('⚠ a session check that rejects is a 401, and never reaches the source', async () => {
    const { spy, deps: exploding } = deps(async () => Promise.reject(new Error('hmac failed')));
    const response = await handleTelemetry(request(), exploding);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(spy.calls).toBe(0);
  });

  test('the session check is handed the request itself', async () => {
    const seen: Request[] = [];
    const given = request();
    const { deps: refusing } = deps((r) => {
      seen.push(r);
      return false;
    });

    await handleTelemetry(given, refusing);
    expect(seen).toEqual([given]);
  });

  test('a session check that answers asynchronously is awaited', async () => {
    const { deps: eventually } = deps(async () => Promise.resolve(true));
    const response = await handleTelemetry(request(), eventually);

    expect(response.status).toBe(200);
  });
});

describe('the 200 path (§4)', () => {
  test('⚠ an authorised request receives the snapshot as JSON', async () => {
    const { spy, deps: allowing } = deps(() => true);
    const response = await handleTelemetry(request(), allowing);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(await response.text()).toBe(JSON.stringify(everythingZero));
    expect(spy.calls).toBe(1);
  });

  /*
   * ⚠ Invariant 5 and PLAN's green criterion, at the HTTP boundary: "A failed reading is a
   * partial snapshot plus an `errors[]` entry — **never a 500**." `nothingReadable` is the
   * canonical every-reading-failed snapshot; it is a 200.
   */
  test('⚠ a snapshot in which every reading failed is still a 200 with errors', async () => {
    const { deps: allowing } = deps(() => true, nothingReadable);
    const response = await handleTelemetry(request(), allowing);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(nothingReadable)));
    expect((body as { errors: readonly unknown[] }).errors).toHaveLength(1);
  });

  /*
   * Not spec'd and chosen: §4 samples per request and §6.7 polls on a cadence, so an
   * intermediary or heuristic browser cache holding a telemetry response would freeze the
   * dashboard on a stale snapshot while the age indicator kept counting — a lie of exactly
   * the kind §6.5 exists to prevent.
   */
  test('neither response may be cached by anything between here and the browser', async () => {
    const { deps: allowing } = deps(() => true);
    const { deps: refusing } = deps(() => false);

    expect((await handleTelemetry(request(), allowing)).headers.get('cache-control')).toBe('no-store');
    expect((await handleTelemetry(request(), refusing)).headers.get('cache-control')).toBe('no-store');
  });

  /*
   * HANDOVER §3.3: the brands are compile-time fictions and must leave the process as plain
   * numbers and strings, "readable by anything". This is that property observed on the wire
   * rather than in the type system.
   */
  test('branded readings arrive as plain JSON numbers', async () => {
    const { deps: allowing } = deps(() => true);
    const body: unknown = await (await handleTelemetry(request(), allowing)).json();
    const gpu = (body as { gpus: readonly { tempC: unknown }[] }).gpus[0];

    expect(typeof gpu?.tempC).toBe('number');
  });
});
