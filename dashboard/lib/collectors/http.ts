/**
 * The HTTP seam — §3.4's two probes and nothing else.
 *
 * `GET http://127.0.0.1:PORT/health` and `GET .../v1/models`, both of which llama.cpp
 * answers **without the API key** (§3.4). That is why decision 13 is cheap and why this
 * dashboard holds no secret.
 *
 * ⚠ **`/v1/chat/completions` is never called, and there is no probe endpoint.** §13 of the
 * decisions excludes one deliberately: a token through the server consumes a slot and
 * evicts the KV cache a real agent is relying on, and §4 samples per request, so a probe
 * would do it on every poll of every open tab.
 *
 * ### What a probe must do that a file read does not
 *
 * | rule | why |
 * |---|---|
 * | **Its own bound** | `CollectorIo` bounds `run` only (O17). A socket to a wedged process blocks the per-request route |
 * | **No redirects** | A redirect is a different server's answer to a different question. `node:http` follows none by design, which is the reason it is used here rather than `fetch` |
 * | **No retry inside one poll** | §6.7 owns retry, as backoff *between* polls. A retry here would multiply the bound it sits inside and hide a flapping instance behind an average |
 * | **A capped body** | An unbounded read of an unbounded body is an unbounded operation wearing a bound |
 *
 * ### Why `node:http` and not `fetch`
 *
 * `fetch` wraps a connection failure in a `TypeError` whose `cause` carries the errno, so
 * `errnoCodeOf` — which reads `error.code` and is forbidden from matching message text —
 * would have to be given a second, undocumented shape to unwrap. `node:http` rejects with
 * the errno *on the error*, which is what §3.7 needs to tell `unreachable` (refused, reset,
 * timed out) from `unhealthy` (answered, 503).
 */

import { request } from 'node:http';

import { boundedTimeoutMs } from './deadline';

/**
 * This seam's own fallback bound, for a caller that hands it a number `setTimeout` will not
 * honour.
 *
 * ⚠ 4 s, matching §6.7's *"each instance's `/health` + `/v1/models` 4 s — the last is larger
 * because it is the only probe against a process under load, and a cold prefill on this box
 * measures 14 s"*. It is a **fallback**, not the operating bound: `collectServing` passes its
 * own per-instance budget down, and this number is reached only when that budget is itself
 * unusable.
 */
export const HTTP_TIMEOUT_MS = 4000;

/**
 * One answer from a server. **A status and a body, never a parsed object** — the parsing is
 * a pure function elsewhere, and §3.7's `unhealthy` case exists precisely so that a 503
 * body is not fed to a model-list parser.
 */
export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

/**
 * Bytes-over-TCP, injectable. Rejects on refusal, reset and timeout; **resolves on every
 * status**, because a 503 is an answer and §3.7 gives it its own vocabulary value.
 */
export interface HttpIo {
  /** ⚠ `timeoutMs` is a hard bound on the returned promise, exactly like `CollectorIo.run`. */
  get(url: string, timeoutMs: number): Promise<HttpResponse>;
}

/**
 * The cap on a response body.
 *
 * `/health` is 15 bytes on this box and `/v1/models` is 603; 64 KiB is ~100× the larger.
 * Exceeding it **rejects** rather than truncating: a truncated JSON body parses as junk,
 * and "the model list did not parse" would be a misleading way to report "this is not
 * llama.cpp".
 */
export const HTTP_MAX_BODY_BYTES = 65536;

/**
 * The real implementation.
 *
 * ⚠ **`agent: false`, so every probe is its own connection and closes with the response.**
 * llama.cpp offers `Keep-Alive: timeout=5, max=100`, and pooling would be marginally
 * cheaper — but the global agent holds sockets open on the event loop, and a dashboard that
 * kept two idle sockets per instance into the process it is watching is a worse trade than
 * one connection per five seconds.
 *
 * ⚠ **The deadline destroys the request and settles the promise itself**, for the same
 * reason `io.ts` does it for `execFile`: a bound that only asks nicely is not a bound. A
 * peer that accepts the connection and then never answers is the case this covers, and it
 * is exactly what a `llama-server` mid-`set-model` looks like from outside.
 *
 * ⚠ **The delay goes through {@link boundedTimeoutMs}, and it did not until step 5's
 * reconciliation.** A bare `setTimeout(…, timeoutMs)` turns `Infinity`, `NaN`, a negative
 * and anything at or above 2³¹ into a **1 ms** bound. Measured end to end against a healthy
 * server answering in 5 ms: `timeoutMs: Infinity` produced `health: 'unreachable'` — §6.3's
 * **alarm** on a working instance — with the entry *"timed out after Infinity ms"*, while
 * the collector's own `deadline()` believed it still had 4 s. Same defect as `io.ts:191`,
 * and both are closed by the same call plus the source-text guardrail in
 * `lib/guardrails.test.ts`.
 *
 * ⚠ **The two messages this function builds do NOT name the URL** (F7). The project's own
 * rule is that the wrapper prefixes the path and the layer below holds no literal; `probe`
 * in `serving.ts` prefixes `${url}: `, so naming it here produced
 * `http://…/health: http://…/health: timed out after …`. Node's own connection errors keep
 * their own text, which is theirs to phrase.
 */
export const nodeHttp: HttpIo = {
  get: (url, timeoutMs) =>
    new Promise<HttpResponse>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // One bound for the timer AND the message. Reporting the raw argument while timing
      // the clamped one is how `timed out after Infinity ms` came to describe 1 ms.
      const bound = boundedTimeoutMs(timeoutMs, HTTP_TIMEOUT_MS);
      const finish = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outcome();
      };

      const req = request(
        url,
        { method: 'GET', agent: false, headers: { accept: 'application/json', connection: 'close' } },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > HTTP_MAX_BODY_BYTES) {
              res.destroy();
              finish(() => {
                reject(new Error(`response body exceeded ${HTTP_MAX_BODY_BYTES} bytes`));
              });
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            finish(() => {
              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') });
            });
          });
          res.on('error', (e: Error) => {
            finish(() => {
              reject(e);
            });
          });
        },
      );

      // ⚠ Not `req.setTimeout`, which is an *inactivity* timeout: a peer dribbling one byte
      // per second resets it forever and the promise never settles.
      timer = setTimeout(() => {
        req.destroy();
        finish(() => {
          reject(new Error(`timed out after ${bound} ms`));
        });
      }, bound);

      req.on('error', (e: Error) => {
        finish(() => {
          reject(e);
        });
      });
      req.end();
    }),
};
