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
  parseVisibleDevices,
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

  /*
   * ⚠⚠ 12b-TEST — **§7.9: what discovery accepts and rejects TODAY, established rather than
   * argued.** `serving-mode.sh` writes `/etc/llama-server/split.env` and installs
   * `llama-split.service`, so the one arrangement §6.2's inverted join was built FOR cannot
   * be discovered on this box at all. The tests below do not change that — the shape is an
   * owner's ruling (§3.4 would have to say how a non-numeric instance is discovered and what
   * its `instance` identity is, and §6.4 fixes condition subjects as bare integers). They
   * pin the facts the ruling needs under it, so the next reader does not have to re-derive
   * them from two files and a shell script.
   *
   * Confirmed read-only on the live box 2026-09-17: `/etc/llama-server/` holds `0.env` and
   * `1.env` and nothing else, so discovery is at its accepting case today.
   */
  test('⚠ §7.9 — `split.env`, the file `serving-mode.sh` writes, is REJECTED and REPORTED', () => {
    // Not silently ignored: it ends in `.env` and sits in the directory §3.4 says holds
    // instances, so it is a claim about an instance that could not be read — which is the
    // `llama-env` problem below. And not accepted either: the split process is therefore
    // invisible to the dashboard, which is the gap §7.9 records.
    expect(parseInstanceIndex('split.env')).toBeNull();
    const found = discoverInstances(['0.env', '1.env', 'split.env']);
    // ⚠ And what the panel therefore shows in split mode: the per-card env files are not
    // deleted by a mode switch, so `serving[]` carries instances 0 and 1 — honest about them
    // — while the process actually serving the box appears nowhere at all.
    expect(found.value).toEqual([0, 1]);
    expect(found.problems).toHaveLength(1);
    expect(found.problems[0]).toContain('split.env');
  });

  test.each([
    ['0.env', 0],
    ['7.env', 7],
    ['123.env', 123],
    ['split.env', null],
    ['SPLIT.env', null],
    ['split.ENV', null],
    ['llama-split.env', null],
    ['0-split.env', null],
    ['split0.env', null],
    ['0.split.env', null],
  ])('§7.9 — discovery accepts a BARE non-negative integer stem and nothing else: %j -> %j', (
    filename,
    expected,
  ) => {
    // The whole acceptance rule in one table, for the owner's ruling to read. Everything §3.4
    // rejects is rejected for the same reason `01.env` is (below): §6.4 fixes the condition
    // subject as a bare integer, and a second spelling would either collide with an existing
    // subject or produce one §6.4 has no form for. `llama-split.service` is neither
    // `unit:llama-server@<i>.service` nor `health:<i>`, which is the other half of what a
    // ruling has to settle.
    //
    // ⚠ **Deliberately NOT ⚠-marked, and the ledger is why.** Step 5's red-test ledger found
    // it inert on its first run and the harness's own rule says the answer is to drop the
    // mark rather than invent a mutation for it: there is no plausible wrong implementation
    // that accepts `split` as an integer stem, so this table restates the boundary rather
    // than guarding it. The guard is `05-L1` plus the test above, both of which bite.
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

describe('⚠⚠ 12b — §3.4’s `gpus`: a unit’s Environment= directives → the cards it serves', () => {
  test('⚠ the box as it stands: the template’s %i, ALREADY EXPANDED by systemd', () => {
    // Read from the live bus 2026-09-17: `llama-server@0.service` answers
    // `CUDA_VISIBLE_DEVICES=0` and `@1` answers `=1`. That the two differ is the whole
    // point — this is the wire saying which card each instance serves, where before the
    // dashboard assumed it from the index.
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES=0']).value).toEqual([0]);
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES=1']).value).toEqual([1]);
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES=0']).problems).toEqual([]);
  });

  test('⚠ the split unit: one process across both cards', () => {
    // `SERVING-MODES.md` §2 — `llama-split.service` carries `CUDA_VISIBLE_DEVICES=0,1`.
    const parsed = parseVisibleDevices(['CUDA_VISIBLE_DEVICES=0,1']);
    expect(parsed.value).toEqual([0, 1]);
    expect(parsed.problems).toEqual([]);
  });

  test('⚠ other Environment= entries are ignored, and only the key §3.4 names is read', () => {
    const parsed = parseVisibleDevices(['LC_ALL=C', 'CUDA_VISIBLE_DEVICES=1', 'GGML_CUDA_NO_PINNED=1']);
    expect(parsed.value).toEqual([1]);
  });

  test('⚠ the LAST assignment wins, which is what the running process actually sees', () => {
    // systemd's own rule for repeated `Environment=` lines, and the same rule `parseLlamaEnv`
    // applies to the env file. Taking the first would report a card the process cannot see.
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES=0', 'CUDA_VISIBLE_DEVICES=1']).value).toEqual([1]);
  });

  test('⚠ an empty assignment is `[]` — a value, never null', () => {
    // `CUDA_VISIBLE_DEVICES=` is how CUDA is told no device is visible. The unit exists and
    // the property was read; the answer is "this instance serves no card". §3.1's `null` ≠
    // `[]` discipline, one level down — collapsing it would report a failed read.
    const parsed = parseVisibleDevices(['CUDA_VISIBLE_DEVICES=']);
    expect(parsed.value).toEqual([]);
    expect(parsed.value).not.toBeNull();
    expect(parsed.problems).toEqual([]);
  });

  test('⚠ no assignment at all is `null` WITH a problem — an em dash always has an entry', () => {
    // Not `[]`: a unit that never pins devices is not a unit that pins none of them. The
    // problem is what `collectServing` turns into the `dbus` entry beside the em dash.
    const parsed = parseVisibleDevices(['LC_ALL=C']);
    expect(parsed.value).toBeNull();
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]).toContain('CUDA_VISIBLE_DEVICES');
  });

  test('⚠ an empty environment is `null` with a problem, not `[]`', () => {
    // The shape `gpu-fan-control.service` really answers (captured). For a unit that is
    // supposed to pin cards, "no such directive" is the same news as for any other unit.
    expect(parseVisibleDevices([]).value).toBeNull();
  });

  test.each([
    ['a CUDA UUID', 'GPU-3f2bd0e1-0000-0000-0000-000000000000'],
    ['a MIG identifier', 'MIG-GPU-3f2b/1/0'],
    ['a half-parseable list', '0,GPU-3f2b'],
    ['a non-canonical index', '01'],
    ['a signed index', '+1'],
    ['a negative index', '-1'],
    ['a fractional index', '0.5'],
    ['an empty member', '0,,1'],
  ])('⚠ the WHOLE list is null, never a partial one, for %s', (_name, value) => {
    // Both UUID and MIG forms are legal for CUDA and neither is a card index this dashboard
    // can join on. Returning the indices we DID understand would put a card under "served by
    // instance N" on the strength of a list we admit we could not read — §3.4's `null` is
    // exactly that state. `01`/`+1` follow `parseInstanceIndex`: two spellings of one card
    // would be two answers to "which instance lists me".
    const parsed = parseVisibleDevices([`CUDA_VISIBLE_DEVICES=${value}`]);
    expect(parsed.value).toBeNull();
    expect(parsed.problems).toHaveLength(1);
  });

  test('⚠ whitespace around an index is tolerated; the value itself still parses strictly', () => {
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES= 0 , 1 ']).value).toEqual([0, 1]);
  });

  test('⚠ the list is sorted and de-duplicated, and a repeat is REPORTED rather than counted', () => {
    // `1,0` and `0,1` are the same set of cards — the ordering only remaps device numbers
    // inside the process, which nothing here renders or joins on. A repeat is not a card.
    const reversed = parseVisibleDevices(['CUDA_VISIBLE_DEVICES=1,0']);
    expect(reversed.value).toEqual([0, 1]);
    expect(reversed.problems).toEqual([]);
    const repeated = parseVisibleDevices(['CUDA_VISIBLE_DEVICES=1,1']);
    expect(repeated.value).toEqual([1]);
    expect(repeated.problems).toHaveLength(1);
  });

  test('⚠ an entry with no `=` at all, and one whose key is empty, are not assignments', () => {
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES']).value).toBeNull();
    expect(parseVisibleDevices(['=0']).value).toBeNull();
  });

  test('⚠ a key that merely CONTAINS the name is not the name', () => {
    // `indexOf('CUDA_VISIBLE_DEVICES')` would match `MY_CUDA_VISIBLE_DEVICES_BACKUP=0,1`
    // and hand a card list to an instance from a variable nothing reads.
    expect(parseVisibleDevices(['MY_CUDA_VISIBLE_DEVICES_BACKUP=0,1']).value).toBeNull();
    expect(parseVisibleDevices(['CUDA_VISIBLE_DEVICES_OLD=0,1']).value).toBeNull();
  });
});
