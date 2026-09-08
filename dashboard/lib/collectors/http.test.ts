/**
 * {@link nodeHttp}, against **real HTTP servers on loopback**.
 *
 * Every other test in this step drives a fake seam, which is right for the collectors — but
 * the whole value of this module is what it does with a real socket, and a fake `HttpIo`
 * cannot tell you whether redirects are followed or whether a bound is really a bound. So
 * these tests start `node:http` servers, exactly as `io.test.ts` spawns real processes.
 *
 * Nothing here touches `ai-server`, and nothing anywhere touches `/v1/chat/completions`.
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { afterEach, describe, expect, test } from 'vitest';

import { errnoCodeOf } from './errors';
import { HTTP_MAX_BODY_BYTES, HTTP_TIMEOUT_MS, nodeHttp } from './http';
import { CAPTURED_HEALTH_BODY, CAPTURED_MODELS_BODY, LLAMA_LOADING_503_BODY } from './samples';

const running: Server[] = [];

/** Start a server on an ephemeral loopback port and return its base URL. */
const serve = async (handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> => {
  const server = createServer(handler);
  running.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${String(address.port)}`;
};

/** A port nothing is listening on — bound, read, and released before the test runs. */
const closedPort = async (): Promise<string> => {
  const server = createServer(() => undefined);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const url = `http://127.0.0.1:${String(address.port)}`;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return url;
};

afterEach(async () => {
  await Promise.all(
    running.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

describe('nodeHttp', () => {
  test('a 200 comes back with its status and its body', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(CAPTURED_HEALTH_BODY);
    });
    expect(await nodeHttp.get(`${base}/health`, 1000)).toEqual({ status: 200, body: CAPTURED_HEALTH_BODY });
  });

  test('⚠ a 503 RESOLVES with its status and body — it is an answer, not a failure', async () => {
    // §3.7 maps it to `unhealthy`, which is a value, not an error. A client that rejected
    // on non-2xx would turn "the model is loading" into `unreachable`, which §6.3 alarms.
    const base = await serve((_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(LLAMA_LOADING_503_BODY);
    });
    const answer = await nodeHttp.get(`${base}/health`, 1000);
    expect(answer.status).toBe(503);
    expect(answer.body).toBe(LLAMA_LOADING_503_BODY);
  });

  test('⚠ a redirect is NOT followed — the 302 itself is the answer', async () => {
    // A redirect is a different server's answer to a different question. Both endpoints
    // here are on loopback and are the box's own, so a followed redirect would silently
    // report someone else's model list as this instance's.
    let redirectTargetHits = 0;
    const target = await serve((_req, res) => {
      redirectTargetHits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(CAPTURED_MODELS_BODY);
    });
    const base = await serve((_req, res) => {
      res.writeHead(302, { location: `${target}/v1/models` });
      res.end('');
    });
    const answer = await nodeHttp.get(`${base}/v1/models`, 1000);
    expect(answer.status).toBe(302);
    expect(answer.body).toBe('');
    expect(redirectTargetHits).toBe(0);
  });

  test('⚠ a refused connection rejects with its errno on `error.code`', async () => {
    // The reason this module uses `node:http` rather than `fetch`: `errnoCodeOf` reads
    // `error.code` and is forbidden from matching message text, and `fetch` buries the
    // errno inside a `TypeError`'s `cause`.
    const url = await closedPort();
    await expect(nodeHttp.get(`${url}/health`, 1000)).rejects.toThrow();
    const failure = await nodeHttp.get(`${url}/health`, 1000).catch((e: unknown) => e);
    expect(errnoCodeOf(failure)).toBe('ECONNREFUSED');
  });

  test('⚠ a server that accepts and never answers is bounded, and the bound is the promise', async () => {
    // Not `req.setTimeout`, which is an inactivity timeout a dribbling peer resets forever.
    const base = await serve(() => {
      /* accept the connection and answer nothing, ever */
    });
    const started = performance.now();
    await expect(nodeHttp.get(`${base}/health`, 60)).rejects.toThrow(/timed out/);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(3000);
  });

  test('a body over the cap rejects rather than being truncated into junk', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('x'.repeat(HTTP_MAX_BODY_BYTES + 1024));
    });
    await expect(nodeHttp.get(`${base}/v1/models`, 2000)).rejects.toThrow(/exceeded/);
  });

  test('a body exactly at the cap is returned whole — the other side of the boundary', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(200);
      res.end('y'.repeat(HTTP_MAX_BODY_BYTES));
    });
    const answer = await nodeHttp.get(`${base}/v1/models`, 5000);
    expect(answer.body).toHaveLength(HTTP_MAX_BODY_BYTES);
  });

  test('⚠ one call is one request — there is no retry inside a probe', async () => {
    // §6.7 owns retry, as backoff *between* polls. A retry here would multiply the bound it
    // sits inside and hide a flapping instance behind an average.
    let requests = 0;
    const base = await serve((_req, res) => {
      requests += 1;
      res.writeHead(500);
      res.end('nope');
    });
    await nodeHttp.get(`${base}/health`, 1000);
    expect(requests).toBe(1);
  });

  test('the request is a GET and carries no credentials', async () => {
    // §3.4: both endpoints answer without the API key, which is why this dashboard holds
    // no secret. Sending one would be a secret to configure, store and leak.
    let seen: { method: string | undefined; auth: string | undefined; apiKey: string | undefined } = {
      method: undefined,
      auth: undefined,
      apiKey: undefined,
    };
    const base = await serve((req, res) => {
      seen = {
        method: req.method,
        auth: req.headers.authorization,
        apiKey: req.headers['x-api-key'] as string | undefined,
      };
      res.writeHead(200);
      res.end('{}');
    });
    await nodeHttp.get(`${base}/health`, 1000);
    expect(seen.method).toBe('GET');
    expect(seen.auth).toBeUndefined();
    expect(seen.apiKey).toBeUndefined();
  });

  /*
   * ⚠ F2 — the defect this file had no test for, and the one that put §6.3's ALARM on a
   * healthy server.
   *
   * `setTimeout` clamps a delay outside `(0, 2³¹−1]` to **1 ms** and warns on stderr, so a
   * bare `setTimeout(…, timeoutMs)` turned `Infinity` — HANDOVER's "obvious way to write
   * 'do not bound this'" — into the tightest possible bound. Measured end to end before the
   * fix: `timeoutMs: Infinity` against a server answering in 5 ms gave
   * `health: 'unreachable'` with the entry *"timed out after Infinity ms"*, while the
   * collector's own `deadline()` believed it still had 4 s.
   *
   * ⚠ The assertion is that the call **completes**, not that it rejects. A broken bound
   * rejects too — 1 ms in — so `rejects.toThrow()` is the shape that let this ship. The
   * server deliberately answers *later* than 1 ms so the two implementations differ.
   *
   * ⚠ The name deliberately says which seam this is. It was character-identical to
   * `io.test.ts`'s until 2026-09-07, and the ledger matches a mark by its
   * literal prefix — so one mutation reddening either file scored BOTH marks covered,
   * and the other could have gone inert in silence (Q1 adversarial F2).
   */
  test.each([
    ['Infinity', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
    ['a negative', -1],
    ['above 2^31-1', 2 ** 31],
    ['zero', 0],
  ])('⚠ an HTTP timeout of %s falls back to the module default, never to setTimeout’s 1 ms', async (_name, ms) => {
    const base = await serve((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(CAPTURED_HEALTH_BODY);
      }, 60);
    });
    const answer = await nodeHttp.get(`${base}/health`, ms);
    expect(answer).toEqual({ status: 200, body: CAPTURED_HEALTH_BODY });
  });

  /*
   * ⚠ The name is deliberately narrower than "names the bound rather than the argument".
   *
   * The two differ only when the argument is INVALID, and an invalid argument means the 4 s
   * fallback — so observing the difference costs a four-second wall-clock test, in a suite
   * that runs in under two and is re-run once per mutation by the harness. The ledger's own
   * second rule applies: mechanise what is cheap to mechanise, and say plainly what is not.
   *
   * What is covered: the message carries a millisecond figure and no URL, and the bound the
   * timer used is that figure. What is not: that `timeoutMs: Infinity` reports `4000` rather
   * than `Infinity`. The *harm* from that case — a 1 ms bound and an `unreachable` alarm —
   * is covered by the table above, which is the half that reaches a panel.
   */
  test('⚠ the timeout message is a millisecond figure, and the timer used it', async () => {
    const base = await serve(() => {
      /* accept and answer nothing */
    });
    const failure = await nodeHttp
      .get(`${base}/health`, 60)
      .then(() => null)
      .catch((e: unknown) => e);
    expect((failure as Error).message).toBe('timed out after 60 ms');
    expect(HTTP_TIMEOUT_MS).toBe(4000);
  });

  test('⚠ the two messages this seam writes do NOT name the URL — the wrapper prefixes it', async () => {
    // F7: `probeFailure` in `serving.ts` prefixes `${url}: `, so naming it here produced
    // `http://…/health: http://…/health: timed out after …`. The project's own rule is that
    // the wrapper prefixes the path and the layer below holds no literal.
    const silent = await serve(() => {
      /* accept and answer nothing */
    });
    const timedOut = await nodeHttp
      .get(`${silent}/health`, 40)
      .then(() => null)
      .catch((e: unknown) => e);
    expect((timedOut as Error).message).not.toContain('http://');

    const huge = await serve((_req, res) => {
      res.writeHead(200);
      res.end('x'.repeat(HTTP_MAX_BODY_BYTES + 1024));
    });
    const tooBig = await nodeHttp
      .get(`${huge}/v1/models`, 2000)
      .then(() => null)
      .catch((e: unknown) => e);
    expect((tooBig as Error).message).toBe(`response body exceeded ${String(HTTP_MAX_BODY_BYTES)} bytes`);
    expect((tooBig as Error).message).not.toContain('http://');
  });

  test('a body of zero bytes is an empty string, not a failure', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(204);
      res.end();
    });
    expect(await nodeHttp.get(`${base}/health`, 1000)).toEqual({ status: 204, body: '' });
  });
});
