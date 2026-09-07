/**
 * §3.4's pure half: discovery, the env file, and what an HTTP answer means.
 *
 * Everything here is a pure function of text, so the whole of §3.4's failure surface —
 * a third card, a missing `PORT=`, a 503 body, a model list that is not one — is exercised
 * with no `llama-server`, no port and no network.
 */

import { describe, expect, test } from 'vitest';

import {
  MAX_PORT,
  MIN_PORT,
  discoverInstances,
  healthFromStatus,
  healthUrl,
  modelsUrl,
  parseInstanceIndex,
  parseLlamaEnv,
  parseModelsBody,
} from './llama';
import {
  CAPTURED_LLAMA_ENV_0,
  CAPTURED_LLAMA_ENV_1,
  CAPTURED_LLAMA_SERVER_ENTRIES,
  CAPTURED_MODELS_BODY,
  LLAMA_ENV_JUNK_PORT,
  LLAMA_ENV_MESSY,
  LLAMA_ENV_NO_PORT,
  LLAMA_ENV_PORT_HIGH,
  LLAMA_ENV_PORT_LOW,
  LLAMA_ENV_PORT_OVER,
  LLAMA_ENV_PORT_ZERO,
  LLAMA_LOADING_503_BODY,
  LLAMA_SERVER_ENTRIES_NOISY,
  LLAMA_SERVER_ENTRIES_TENTH,
  LLAMA_SERVER_ENTRIES_THIRD_CARD,
  MODELS_BODY_EMPTY_DATA,
  MODELS_BODY_NOT_JSON,
  MODELS_BODY_NO_DATA,
  MODELS_BODY_NUMERIC_ID,
  MODELS_BODY_TWO_MODELS,
} from './samples';

describe('instance discovery — §3.4’s "never hard-coded"', () => {
  test('the live directory yields instances 0 and 1', () => {
    expect(discoverInstances(CAPTURED_LLAMA_SERVER_ENTRIES)).toEqual({ value: [0, 1], problems: [] });
  });

  test('⚠ a third card appears with no code change', () => {
    // §3.4 states this as a requirement, not an aspiration: "Today that is 0 and 1; a third
    // card must appear without a code change." This fixture is that acceptance test.
    expect(discoverInstances(LLAMA_SERVER_ENTRIES_THIRD_CARD).value).toEqual([0, 1, 2]);
  });

  test('⚠ instances sort numerically, so a tenth card does not land between 0 and 1', () => {
    // Lexical order puts `10.env` second. §6.2's SERVING panel is one row per instance in
    // an order a human reads down.
    expect(discoverInstances(LLAMA_SERVER_ENTRIES_TENTH).value).toEqual([0, 2, 10]);
  });

  test('an empty directory is an empty list, with nothing to report', () => {
    expect(discoverInstances([])).toEqual({ value: [], problems: [] });
  });

  test('non-`.env` files are ignored silently; a `.env` that is not an instance is reported', () => {
    const found = discoverInstances(LLAMA_SERVER_ENTRIES_NOISY);
    expect(found.value).toEqual([0, 1]);
    // `README` and `0.env.bak.2026-09-04` do not end in `.env` and make no claim.
    // `default.env` and `01.env` do, and are named.
    expect(found.problems).toHaveLength(2);
    expect(found.problems.join(' ')).toContain('default.env');
    expect(found.problems.join(' ')).toContain('01.env');
  });

  test('a duplicate filename cannot produce a duplicate instance', () => {
    expect(discoverInstances(['1.env', '1.env']).value).toEqual([1]);
  });

  test.each([
    ['0.env', 0],
    ['1.env', 1],
    ['10.env', 10],
    ['.env', null],
    ['01.env', null],
    ['+1.env', null],
    ['-1.env', null],
    ['1.ENV', null],
    ['1env', null],
    ['1.env.bak', null],
    ['x.env', null],
    ['1 .env', null],
    ['1.0.env', null],
  ])('parseInstanceIndex(%j) is %j', (filename, expected) => {
    expect(parseInstanceIndex(filename)).toBe(expected);
  });

  test('⚠ `01.env` is rejected rather than read as instance 1', () => {
    // §6.4 fixes condition subjects as bare integers (`health:1`), and §9 deduplicates by
    // condition id — so two filenames mapping to one subject would make one of the two
    // instances silently vanish from the header's alarm count.
    expect(parseInstanceIndex('01.env')).toBeNull();
    expect(parseInstanceIndex('1.env')).toBe(1);
  });
});

describe('the env file — §3.4’s PORT and CTX', () => {
  test('the live files parse to the live configuration', () => {
    expect(parseLlamaEnv(CAPTURED_LLAMA_ENV_0)).toEqual({
      value: { port: 8080, ctx: 131072 },
      problems: [],
    });
    expect(parseLlamaEnv(CAPTURED_LLAMA_ENV_1).value).toEqual({ port: 8081, ctx: 131072 });
  });

  test('⚠ MODEL and ALIAS are present and deliberately not read', () => {
    // §3.4 takes `model` from `/v1/models`, which reports what the process loaded rather
    // than what its config asks for. They agree on this box; the distinction is the poll
    // where they do not — mid `set-model`, for instance.
    const parsed: unknown = parseLlamaEnv(CAPTURED_LLAMA_ENV_0).value;
    expect(Object.keys(parsed as object).sort()).toEqual(['ctx', 'port']);
  });

  test('a missing key is null WITH an entry — the file is not what §3.4 describes', () => {
    const parsed = parseLlamaEnv(LLAMA_ENV_NO_PORT);
    expect(parsed.value.port).toBeNull();
    expect(parsed.value.ctx).toBe(131072);
    expect(parsed.problems).toEqual(['no `PORT=` assignment']);
  });

  test('a junk value is null WITH an entry — §6.7 reserves entries for reads that failed', () => {
    const parsed = parseLlamaEnv(LLAMA_ENV_JUNK_PORT);
    expect(parsed.value.port).toBeNull();
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain('eight-thousand');
  });

  test('⚠ an out-of-range port is null with NO entry, and both sides of the range are fixtured', () => {
    // §6.7: "An out-of-range reading carries no `errors[]` entry either… Reserve `errors[]`
    // for reads that failed." HANDOVER §5.1: a boundary needs a fixture on both sides, and
    // the two sides differ at a panel — one probes a port, the other renders an em dash.
    expect(parseLlamaEnv(LLAMA_ENV_PORT_ZERO)).toEqual({ value: { port: null, ctx: 131072 }, problems: [] });
    expect(parseLlamaEnv(LLAMA_ENV_PORT_OVER)).toEqual({ value: { port: null, ctx: 131072 }, problems: [] });
    expect(parseLlamaEnv(LLAMA_ENV_PORT_LOW).value).toEqual({ port: MIN_PORT, ctx: 1 });
    expect(parseLlamaEnv(LLAMA_ENV_PORT_HIGH).value.port).toBe(MAX_PORT);
  });

  test('⚠ a fractional PORT is not a port — the field is an integer, strictly', () => {
    // §6.6 renders a port as a bare integer. `parseFloat`/`Number` would accept `8080.5`
    // and the dashboard would then probe a URL no socket can be bound to.
    const parsed = parseLlamaEnv('PORT=8080.5\nCTX=131072\n');
    expect(parsed.value.port).toBeNull();
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain('8080.5');
  });

  test('⚠ a CTX of 0 is out of range, not a context of zero tokens', () => {
    expect(parseLlamaEnv('PORT=8080\nCTX=0\n')).toEqual({ value: { port: 8080, ctx: null }, problems: [] });
    expect(parseLlamaEnv('PORT=8080\nCTX=1\n').value.ctx).toBe(1);
  });

  test('⚠ an empty value is a missing key, not the number zero', () => {
    // `Number('')` is `0` — invariant 1's headline case, and the reason `numbers.ts` is the
    // only door. A `PORT=` with nothing after it would otherwise probe port 0.
    const parsed = parseLlamaEnv('PORT=\nCTX=   \n');
    expect(parsed.value).toEqual({ port: null, ctx: null });
    expect(parsed.problems).toHaveLength(2);
  });

  test('comments, blank lines, spacing, quotes and a duplicate key all behave as systemd does', () => {
    // The last assignment wins, which is what the running `llama-server@N` itself sees.
    expect(parseLlamaEnv(LLAMA_ENV_MESSY)).toEqual({ value: { port: 8080, ctx: 4096 }, problems: [] });
  });

  test('a commented-out assignment is not an assignment', () => {
    expect(parseLlamaEnv('#PORT=8080\nCTX=4096\n').value.port).toBeNull();
  });

  test('quoting is stripped but the value inside is still parsed strictly', () => {
    expect(parseLlamaEnv('PORT="8080"\nCTX=\'4096\'\n').value).toEqual({ port: 8080, ctx: 4096 });
    expect(parseLlamaEnv('PORT="abc"\nCTX=4096\n').value.port).toBeNull();
  });

  test('an empty file is two problems and no values, and does not throw', () => {
    const parsed = parseLlamaEnv('');
    expect(parsed.value).toEqual({ port: null, ctx: null });
    expect(parsed.problems).toHaveLength(2);
  });

  test('the probe URLs are loopback and carry the port unpadded', () => {
    const { port } = parseLlamaEnv(CAPTURED_LLAMA_ENV_0).value;
    expect(port).not.toBeNull();
    if (port === null) return;
    expect(healthUrl(port)).toBe('http://127.0.0.1:8080/health');
    expect(modelsUrl(port)).toBe('http://127.0.0.1:8080/v1/models');
  });
});

describe('§3.7’s HealthState, from an HTTP status', () => {
  test('200 is ok', () => {
    expect(healthFromStatus(200)).toEqual({ value: 'ok', problems: [] });
  });

  test('⚠ 503 is `unhealthy` with NO entry — it is the normal state while a model loads', () => {
    // Confirmed from the running build's source (O15): `middleware_server_state` returns
    // 503 for every path while `is_ready` is false. A restart therefore produces this on
    // every poll for tens of seconds, and an entry per poll would be noise about health.
    expect(healthFromStatus(503)).toEqual({ value: 'unhealthy', problems: [] });
  });

  test('⚠ no status is ever `unreachable` — that word is reserved for nothing answering', () => {
    // §3.7: "`unreachable` = connection refused, reset, or timed out." A server answering
    // 404 has been reached; §6.3 bands `unreachable` as an alarm and would point the reader
    // at the network instead of at the port number.
    for (const status of [0, 100, 200, 301, 401, 404, 500, 502, 503, 599]) {
      expect(healthFromStatus(status).value, String(status)).not.toBe('unreachable');
    }
  });

  test('any other answered status is `unhealthy` WITH an entry', () => {
    for (const status of [301, 404, 500]) {
      const parsed = healthFromStatus(status);
      expect(parsed.value).toBe('unhealthy');
      expect(parsed.problems).toHaveLength(1);
      expect(parsed.problems[0]).toContain(String(status));
    }
  });
});

describe('/v1/models', () => {
  test('the live body yields the configured alias', () => {
    expect(parseModelsBody(CAPTURED_MODELS_BODY)).toEqual({ value: 'qwen3.6-27b', problems: [] });
  });

  test('⚠ a 503 loading body is NOT a model list, and says so as a parse failure', () => {
    // This is the shape the wrapper must never reach: it only calls this on a 200. The
    // assertion records what would happen if that rule were broken — an `llama-models`
    // entry blaming the model list for a server that is merely still starting.
    const parsed = parseModelsBody(LLAMA_LOADING_503_BODY);
    expect(parsed.value).toBeNull();
    expect(parsed.problems).toEqual(['no `data` array']);
  });

  test('a body that is not JSON is one problem and no throw', () => {
    const parsed = parseModelsBody(MODELS_BODY_NOT_JSON);
    expect(parsed.value).toBeNull();
    expect(parsed.problems[0]).toContain('not JSON');
  });

  test.each([
    ['no `data`', MODELS_BODY_NO_DATA],
    ['an empty `data`', MODELS_BODY_EMPTY_DATA],
    ['a non-string id', MODELS_BODY_NUMERIC_ID],
    ['`data` is not an array', '{"data":{"id":"x"}}'],
    ['a JSON scalar', '7'],
    ['JSON null', 'null'],
  ])('%s yields null with a problem', (_name, body) => {
    const parsed = parseModelsBody(body);
    expect(parsed.value).toBeNull();
    expect(parsed.problems).not.toHaveLength(0);
  });

  test('⚠ an empty list and a list of junk are DIFFERENT problems — F11', () => {
    // `data: [null]` used to report "`data` is empty". The array is not empty; its first
    // entry is not an object. §6.5 puts these strings in front of a person, and the two
    // send them looking in different places: one at a server with no model loaded, the
    // other at a server whose answer is malformed.
    expect(parseModelsBody(MODELS_BODY_EMPTY_DATA).problems).toEqual(['`data` is empty']);
    expect(parseModelsBody('{"data":[null]}').problems).toEqual(['`data[0]` is not an object']);
    expect(parseModelsBody('{"data":["qwen3.6-27b"]}').problems).toEqual(['`data[0]` is not an object']);
    // Both are still `null`, which was always right.
    expect(parseModelsBody('{"data":[null]}').value).toBeNull();
  });

  test('⚠ more than one model is reported, because the contract holds only one', () => {
    // `ServingInstance.model` is a single `string | null` (§3.4), so a multi-model server
    // is a state the contract cannot express. Raised as a spec gap; the first is shown and
    // the discrepancy is named rather than hidden.
    const parsed = parseModelsBody(MODELS_BODY_TWO_MODELS);
    expect(parsed.value).toBe('qwen3.6-27b');
    expect(parsed.problems).toEqual(['`data` lists 2 models; showing the first']);
  });

  test('`models[].name` carries the same value and is deliberately not the source', () => {
    // One source of truth. If `data[0].id` disappears the row goes blank with an entry,
    // rather than quietly falling back to a field nothing tests.
    const onlyLegacy = '{"models":[{"name":"qwen3.6-27b"}],"object":"list"}';
    expect(parseModelsBody(onlyLegacy).value).toBeNull();
  });

  test('an empty body does not throw', () => {
    expect(parseModelsBody('').value).toBeNull();
  });
});
