/**
 * §3.4's wrapper — {@link collectServing}.
 *
 * ⚠ **This is the first collector with several `ErrorSource`s on one wrapper**, so a large
 * share of these tests are about attribution: which of `llama-env`, `dbus`, `llama-health`
 * and `llama-models` explains which blanked column. §6.5 requires it — "that figure shows
 * `—`, its `errors` entry is available" — and an entry filed against the wrong source
 * points the reader at the wrong fix.
 *
 * The three fixtures HANDOVER names as this step's acceptance criteria —
 * `servingInstances`, `servingPopulated` and `servingIdentityOnly` — are produced from
 * fakes below, byte for byte.
 */

import { describe, expect, test, vi } from 'vitest';

import { servingIdentityOnly, servingInstances, servingPopulated } from '../fixtures';
import { severityHealth, severityUnitState } from '../severity';
import { port } from '../types';
import { DEFAULT_PATHS } from './collect';
import { DBUS_TIMEOUT_MS, FAN_SERVICE_UNIT, servingUnitName } from './dbus';
import type { DbusIo, DbusStream } from './dbus';
import { DBUS_MESSAGE_TYPE, decodeMessage } from './dbus-wire';
import type { HttpIo, HttpResponse } from './http';
import type { CollectorIo } from './io';
import { healthUrl, modelsUrl } from './llama';
import {
  CAPTURED_LLAMA_ENV_0,
  CAPTURED_LLAMA_ENV_1,
  CAPTURED_LLAMA_SERVER_ENTRIES,
  CAPTURED_MODELS_BODY,
  LLAMA_ENV_JUNK_PORT,
  LLAMA_ENV_NO_PORT,
  LLAMA_LOADING_503_BODY,
  LLAMA_SERVER_ENTRIES_THIRD_CARD,
  MODELS_BODY_NOT_JSON,
} from './samples';
import { MAX_TIMEOUT_MS } from './deadline';
import { SERVING_PROBE_TIMEOUT_MS, collectServing } from './serving';

const DIR = DEFAULT_PATHS.etcLlamaServer;
const errno = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/** Every command any fake `CollectorIo` in this file was asked to run. Must stay empty. */
const ran: string[] = [];

// --------------------------------------------------------------------- fakes

interface FakeIoOptions {
  readonly entries?: readonly string[] | Error;
  readonly files?: Readonly<Record<string, string | Error>>;
}

const fakeIo = (o: FakeIoOptions = {}): CollectorIo => ({
  readFile: (path) => {
    const found = o.files?.[path];
    if (found === undefined) return Promise.reject(errno('ENOENT', `ENOENT: no such file, open '${path}'`));
    if (found instanceof Error) return Promise.reject(found);
    return Promise.resolve(found);
  },
  readDir: (path) => {
    if (path !== DIR) return Promise.reject(errno('ENOENT', `ENOENT: scandir '${path}'`));
    const entries = o.entries ?? CAPTURED_LLAMA_SERVER_ENTRIES;
    return entries instanceof Error ? Promise.reject(entries) : Promise.resolve([...entries]);
  },
  run: (command) => {
    ran.push(command);
    return Promise.reject(new Error('collectServing must not run a command'));
  },
  unameRelease: () => '7.0.0-30-generic',
});

const ENCODER = new TextEncoder();
const le32 = (v: number): readonly number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const pad = (out: number[], to: number): void => {
  while (out.length % to !== 0) out.push(0);
};
const putString = (out: number[], text: string): void => {
  pad(out, 4);
  const e = ENCODER.encode(text);
  out.push(...le32(e.length), ...e, 0);
};
const frame = (type: number, replySerial: number, signature: string, body: readonly number[], errorName?: string): Uint8Array => {
  const fields: number[] = [5, 1, 0x75, 0, ...le32(replySerial)];
  if (errorName !== undefined) {
    pad(fields, 8);
    fields.push(4, 1, 0x73, 0);
    putString(fields, errorName);
  }
  pad(fields, 8);
  const sig = ENCODER.encode(signature);
  fields.push(8, 1, 0x67, 0, sig.length, ...sig, 0);
  const out: number[] = [0x6c, type, 0, 1, ...le32(body.length), ...le32(77), ...le32(fields.length)];
  out.push(...fields);
  pad(out, 8);
  out.push(...body);
  return Uint8Array.from(out);
};
const stringBody = (text: string): readonly number[] => {
  const out: number[] = [];
  putString(out, text);
  return out;
};
const variantBody = (text: string): readonly number[] => {
  const out: number[] = [1, 0x73, 0];
  putString(out, text);
  return out;
};

/** A scripted systemd: a state per unit name, or `undefined` for `NoSuchUnit`. */
const fakeDbus = (
  units: Readonly<Record<string, string>>,
  asked?: string[],
  connectError?: Error,
  connectTimeouts?: number[],
): DbusIo => ({
  uid: () => 1000,
  connect: (_path, timeoutMs): Promise<DbusStream> => {
    connectTimeouts?.push(timeoutMs);
    if (connectError) return Promise.reject(connectError);
    const queue: Uint8Array[] = [];
    let waiting: ((b: Uint8Array) => void) | null = null;
    let begun = false;
    let lastUnit = '';
    const emit = (chunk: Uint8Array): void => {
      const w = waiting;
      if (w !== null) {
        waiting = null;
        w(chunk);
      } else queue.push(chunk);
    };
    return Promise.resolve({
      write: (written) => {
        if (!begun) {
          const text = new TextDecoder().decode(written);
          if (text.includes('AUTH')) emit(ENCODER.encode('OK abc\r\n'));
          else if (text.includes('BEGIN')) begun = true;
          return Promise.resolve();
        }
        const decoded = decodeMessage(written);
        if (decoded.kind !== 'message') return Promise.resolve();
        const { serial, body } = decoded.message;
        if (body.length === 0) {
          emit(frame(DBUS_MESSAGE_TYPE.methodReturn, serial, 's', stringBody(':1.9')));
        } else if (body.length === 1) {
          const unit = String(body[0]);
          asked?.push(unit);
          lastUnit = unit;
          if (units[unit] === undefined) {
            emit(
              frame(
                DBUS_MESSAGE_TYPE.error,
                serial,
                's',
                stringBody(`Unit ${unit} not loaded.`),
                'org.freedesktop.systemd1.NoSuchUnit',
              ),
            );
          } else {
            emit(frame(DBUS_MESSAGE_TYPE.methodReturn, serial, 'o', stringBody(`/unit/${unit.replace(/\W/g, '_')}`)));
          }
        } else {
          emit(frame(DBUS_MESSAGE_TYPE.methodReturn, serial, 'v', variantBody(units[lastUnit] ?? '')));
        }
        return Promise.resolve();
      },
      next: () => {
        const queued = queue.shift();
        if (queued !== undefined) return Promise.resolve(queued);
        return new Promise<Uint8Array>((resolve) => {
          waiting = resolve;
        });
      },
      close: () => undefined,
    });
  },
});

const fakeHttp = (
  answers: Readonly<Record<string, HttpResponse | Error>>,
  requested?: string[],
): HttpIo => ({
  get: (url) => {
    requested?.push(url);
    const answer = answers[url];
    if (answer === undefined) {
      return Promise.reject(errno('ECONNREFUSED', `connect ECONNREFUSED ${url.replace('http://', '')}`));
    }
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(answer);
  },
});

const ok = (body: string): HttpResponse => ({ status: 200, body });

/** The box exactly as it stands: two instances, both serving Qwen3.6-27B. */
const liveBox = {
  io: (): CollectorIo =>
    fakeIo({ files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0, [`${DIR}/1.env`]: CAPTURED_LLAMA_ENV_1 } }),
  dbus: (): DbusIo => fakeDbus({ 'llama-server@0.service': 'active', 'llama-server@1.service': 'active' }),
  http: (requested?: string[]): HttpIo =>
    fakeHttp(
      {
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
        'http://127.0.0.1:8081/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8081/v1/models': ok(CAPTURED_MODELS_BODY),
      },
      requested,
    ),
};

// --------------------------------------------------------------------- tests

describe('the live box', () => {
  test('two instances, both active, both serving qwen3.6-27b', async () => {
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: liveBox.dbus(),
      http: liveBox.http(),
    });
    expect(errors).toEqual([]);
    expect(serving).toEqual([
      { instance: 0, port: 8080, unitState: 'active', model: 'qwen3.6-27b', ctx: 131072, health: 'ok' },
      { instance: 1, port: 8081, unitState: 'active', model: 'qwen3.6-27b', ctx: 131072, health: 'ok' },
    ]);
  });

  test('⚠ only /health and /v1/models are ever requested — never an inference endpoint', async () => {
    // §13 of the decisions excludes a probe endpoint deliberately: a token consumes a slot
    // and evicts the KV cache, and §4 samples per request, so it would happen on every poll
    // of every open tab. A full 128K re-prefill costs ~140 s on this box.
    const requested: string[] = [];
    await collectServing({ io: liveBox.io(), dbus: liveBox.dbus(), http: liveBox.http(requested) });
    expect(requested.sort()).toEqual([
      'http://127.0.0.1:8080/health',
      'http://127.0.0.1:8080/v1/models',
      'http://127.0.0.1:8081/health',
      'http://127.0.0.1:8081/v1/models',
    ]);
    for (const url of requested) {
      expect(url).not.toContain('completion');
      expect(url).not.toContain('/props');
      expect(url).not.toContain('/metrics');
    }
  });

  test('⚠ `gpu-fan-control.service` is NOT asked about here — O9 gives it one owner', async () => {
    // Reading it in both collectors is how `cooling.serviceState` and
    // `safety.fanServiceState` come to disagree; `lib/contract.test.ts` asserts they never do.
    const asked: string[] = [];
    await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({ 'llama-server@0.service': 'active', 'llama-server@1.service': 'active' }, asked),
      http: liveBox.http(),
    });
    expect(asked).toEqual([servingUnitName(0), servingUnitName(1)]);
    expect(asked).not.toContain(FAN_SERVICE_UNIT);
  });

  test('⚠ a third card appears in the SERVING list with no code change', async () => {
    // §3.4 requires it. Nothing below mentions the number 2 except the fixture.
    const { serving, errors } = await collectServing({
      io: fakeIo({
        entries: LLAMA_SERVER_ENTRIES_THIRD_CARD,
        files: {
          [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0,
          [`${DIR}/1.env`]: CAPTURED_LLAMA_ENV_1,
          [`${DIR}/2.env`]: 'PORT=8082\nCTX=131072\n',
        },
      }),
      dbus: fakeDbus({
        'llama-server@0.service': 'active',
        'llama-server@1.service': 'active',
        'llama-server@2.service': 'active',
      }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
        'http://127.0.0.1:8081/health': ok('{}'),
        'http://127.0.0.1:8081/v1/models': ok(CAPTURED_MODELS_BODY),
        'http://127.0.0.1:8082/health': ok('{}'),
        'http://127.0.0.1:8082/v1/models': ok('{"object":"list","data":[{"id":"gemma-4-12b"}]}'),
      }),
    });
    expect(errors).toEqual([]);
    expect(serving).toHaveLength(3);
    expect(serving?.[2]).toEqual({
      instance: 2,
      port: 8082,
      unitState: 'active',
      model: 'gemma-4-12b',
      ctx: 131072,
      health: 'ok',
    });
  });
});

describe('the canonical fixtures HANDOVER names as this step’s acceptance criteria', () => {
  test('⚠ `servingInstances` is produced exactly — one healthy, one failed and refusing', async () => {
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({ 'llama-server@0.service': 'active', 'llama-server@1.service': 'failed' }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
        // 8081 is absent, so the fake refuses the connection — a stopped instance.
      }),
    });
    expect(serving).toEqual(servingInstances);
    // §6.5: "An `llama-server` instance is down — its row shows the unit state and the
    // reason; the other instance is unaffected."
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('llama-health');
    expect(errors[0]?.message).toContain('ECONNREFUSED');
    expect(severityUnitState(serving?.[1]?.unitState ?? null)).toBe('alarm');
    expect(severityHealth(serving?.[1]?.health ?? null)).toBe('alarm');
    expect(severityHealth(serving?.[0]?.health ?? null)).toBe('normal');
  });

  test('⚠ `servingPopulated` carries the same list and the same single error', () => {
    // The snapshot fixture wraps the same two instances plus one `llama-health` entry
    // naming `ECONNREFUSED 127.0.0.1:8081`. Asserting it here ties the collector's output
    // to the value every later step's render tests are written against.
    expect(servingPopulated.serving).toEqual(servingInstances);
    expect(servingPopulated.errors).toEqual([
      { source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081' },
    ]);
  });

  test('⚠ `servingIdentityOnly` is produced exactly — known by its filename and nothing more', async () => {
    // The env file could not be read and D-Bus did not answer, so every field except the
    // identity is null. HANDOVER: "the shape of a stopped `llama-server@N`".
    const { serving, errors } = await collectServing({
      io: fakeIo({
        entries: ['2.env'],
        files: { [`${DIR}/2.env`]: errno('EACCES', 'EACCES: permission denied') },
      }),
      dbus: fakeDbus({}, undefined, errno('ENOENT', 'connect ENOENT /run/dbus/system_bus_socket')),
      http: fakeHttp({}),
    });
    expect(serving).toEqual([servingIdentityOnly]);
    expect(errors.map((e) => e.source).sort()).toEqual(['dbus', 'llama-env']);
  });
});

describe('discovery failures', () => {
  test('⚠ a directory that will not list is `serving: null`, NOT an empty list', async () => {
    // `null` is "which instances exist is unknown"; `[]` is "it listed and declares none".
    // The panel says "could not enumerate instances" for one and "no instances configured"
    // for the other, and collapsing them makes the second sentence a lie.
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: errno('ENOENT', `ENOENT: scandir '${DIR}'`) }),
      dbus: liveBox.dbus(),
      http: liveBox.http(),
    });
    expect(serving).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('llama-env');
  });

  test('⚠ a directory that lists nothing is `[]`, which is a reading', async () => {
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: [] }),
      dbus: liveBox.dbus(),
      http: liveBox.http(),
    });
    expect(serving).toEqual([]);
    expect(serving).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('a listing with no instances opens no D-Bus connection and makes no request', async () => {
    let connects = 0;
    const requested: string[] = [];
    await collectServing({
      io: fakeIo({ entries: ['README'] }),
      dbus: {
        uid: () => 1000,
        connect: () => {
          connects += 1;
          return Promise.reject(new Error('should not connect'));
        },
      },
      http: fakeHttp({}, requested),
    });
    expect(connects).toBe(0);
    expect(requested).toEqual([]);
  });
});

describe('per-instance failures, and which source explains each blank', () => {
  test('⚠ no `PORT=` means the instance is NOT PROBED — `health: null`, and no request made', async () => {
    // HANDOVER's do-not-copy #4: `health: null` is a legitimate value with real semantics
    // ("not probed this cycle"), not a placeholder. An instance with no port was genuinely
    // not probed, and saying `unreachable` instead would band an alarm (§6.3) against a
    // process that may be running perfectly.
    const requested: string[] = [];
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: LLAMA_ENV_NO_PORT } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({}, requested),
    });
    expect(serving?.[0]).toEqual({
      instance: 0,
      port: null,
      unitState: 'active',
      model: null,
      ctx: 131072,
      health: null,
    });
    expect(requested).toEqual([]);
    expect(severityHealth(null)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('llama-env');
  });

  test('a junk `PORT=` is `llama-env`, and the instance is not probed', async () => {
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: LLAMA_ENV_JUNK_PORT } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({}),
    });
    expect(serving?.[0]?.port).toBeNull();
    expect(serving?.[0]?.health).toBeNull();
    expect(errors.map((e) => e.source)).toEqual(['llama-env']);
  });

  test('⚠ a 503 is `unhealthy`, and /v1/models is NOT requested', async () => {
    // llama.cpp answers 503 for every endpoint while a model loads, so `/v1/models` would
    // return `{"error":{…}}`. Parsing it files an `llama-models` entry blaming the model
    // list for a server that is merely still starting — and 503 is the NORMAL state during
    // a restart, so that entry would appear on every poll for tens of seconds.
    const requested: string[] = [];
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'activating' }),
      http: fakeHttp({ 'http://127.0.0.1:8080/health': { status: 503, body: LLAMA_LOADING_503_BODY } }, requested),
    });
    expect(serving?.[0]?.health).toBe('unhealthy');
    expect(serving?.[0]?.model).toBeNull();
    expect(requested).toEqual(['http://127.0.0.1:8080/health']);
    expect(requested).not.toContain('http://127.0.0.1:8080/v1/models');
    // A restart is not a fault to report: watch colour, and nothing in `errors[]`.
    expect(errors).toEqual([]);
    expect(severityHealth('unhealthy')).toBe('watch');
    expect(severityUnitState('activating')).toBe('watch');
  });

  test('a refused /health is `unreachable` with an `llama-health` entry naming the errno', async () => {
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'inactive' }),
      http: fakeHttp({}),
    });
    expect(serving?.[0]?.health).toBe('unreachable');
    expect(errors.map((e) => e.source)).toEqual(['llama-health']);
    expect(errors[0]?.message).toContain('ECONNREFUSED');
    expect(errors[0]?.message).toContain(healthUrl(port(8080)));
  });

  test('⚠ the errno comes from `error.code`, never from the message prose', () => {
    // HANDOVER's do-not-copy #2. Node's message is localised prose around a URL and a
    // future release may reword it; the code is the stable half, and §6.5 needs the reader
    // to tell a refused connection (a stopped instance) from a timeout (a wedged one).
    // This rejection's message mentions no errno at all.
    const silent = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    return collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({ 'http://127.0.0.1:8080/health': silent }),
    }).then(({ serving, errors }) => {
      expect(serving?.[0]?.health).toBe('unreachable');
      expect(errors[0]?.message).toContain('ECONNRESET');
      expect(errors[0]?.message).toContain('socket hang up');
    });
  });

  test('a 404 on /health is `unhealthy` with an entry — something else is on that port', async () => {
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({ 'http://127.0.0.1:8080/health': { status: 404, body: 'not found' } }),
    });
    expect(serving?.[0]?.health).toBe('unhealthy');
    expect(errors.map((e) => e.source)).toEqual(['llama-health']);
    expect(errors[0]?.message).toContain('404');
  });

  test('⚠ a 200 whose body is not a model list is `llama-models`, and health stays ok', async () => {
    // The two figures fail independently: `/health` answered 200, so the health cell is
    // right and only the model cell is blank. An entry against `llama-health` would point
    // the reader at a server that is working.
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(MODELS_BODY_NOT_JSON),
      }),
    });
    expect(serving?.[0]?.health).toBe('ok');
    expect(serving?.[0]?.model).toBeNull();
    expect(errors.map((e) => e.source)).toEqual(['llama-models']);
    expect(errors[0]?.message).toContain(modelsUrl(port(8080)));
  });

  test('/v1/models refusing after /health answered is `llama-models`, not `llama-health`', async () => {
    // The window is real: `set-model` restarts the instance between the two requests.
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({ 'http://127.0.0.1:8080/health': ok('{"status":"ok"}') }),
    });
    expect(serving?.[0]?.health).toBe('ok');
    expect(serving?.[0]?.model).toBeNull();
    expect(errors.map((e) => e.source)).toEqual(['llama-models']);
  });

  test('a 503 on /v1/models after a 200 /health is `llama-models`, not a parse failure', async () => {
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': { status: 503, body: LLAMA_LOADING_503_BODY },
      }),
    });
    expect(serving?.[0]?.model).toBeNull();
    expect(errors.map((e) => e.source)).toEqual(['llama-models']);
    expect(errors[0]?.message).toContain('503');
    expect(errors[0]?.message).not.toContain('JSON');
  });

  test('⚠ an unreadable D-Bus blanks `unitState` only — every HTTP figure survives', async () => {
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({}, undefined, errno('ENOENT', 'connect ENOENT')),
      http: liveBox.http(),
    });
    expect(serving?.map((s) => s.unitState)).toEqual([null, null]);
    expect(serving?.map((s) => s.health)).toEqual(['ok', 'ok']);
    expect(serving?.map((s) => s.model)).toEqual(['qwen3.6-27b', 'qwen3.6-27b']);
    // One entry for the bus, not one per instance.
    expect(errors.map((e) => e.source)).toEqual(['dbus']);
  });

  test('⚠ one instance down leaves the other completely unaffected (§6.5)', async () => {
    const { serving } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    expect(serving?.[0]).toEqual({
      instance: 0,
      port: 8080,
      unitState: 'active',
      model: 'qwen3.6-27b',
      ctx: 131072,
      health: 'ok',
    });
    // ⚠ The fake has no `llama-server@1.service`, so the bus answers `NoSuchUnit` — which
    // §3.7 reads as `inactive`, not `null`. That is the third card whose `1.env` exists and
    // whose unit was never enabled, and it now colours **alarm** instead of rendering a
    // colourless em dash.
    expect(serving?.[1]?.unitState).toBe('inactive');
    expect(severityUnitState(serving?.[1]?.unitState ?? null)).toBe('alarm');
    expect(serving?.[1]?.health).toBe('unreachable');
    expect(serving?.[1]?.ctx).toBe(131072);
  });
});

describe('the budget is never evidence about a subject (§6.7)', () => {
  /*
   * ⚠ F1, the finding this step's reconciliation exists for.
   *
   * `collectServing` shipped with ONE budget across the listing, every env read and every
   * HTTP probe, and `probe`'s catch mapped any rejection — including the shared deadline's
   * own — to `health: 'unreachable'`, which `severityHealth` bands **alarm**. Measured: a
   * 95 ms `readDir` inside a 100 ms budget, two env files that parsed perfectly, and an
   * HTTP fake answering in 20 ms reported BOTH healthy instances unreachable, with both
   * entries filed against `llama-health` and nothing naming the slow directory.
   *
   * ⚠ The "rejected without being started" discriminator was measured NOT to cover this:
   * with ~5 ms left both probes are *started* and killed 5 ms in, so a not-started flag
   * classifies them as "started and timed out" and reports `unreachable` again. The fix is
   * structural — whose budget ran out — and it makes the mapping unreachable rather than
   * caught.
   *
   * ⚠ 10a-F17, 2026-09-08: this test used to sleep a REAL 95 ms inside a REAL 100 ms budget
   * — i.e. it raced `deadline()`'s own `setTimeout(reject, 100)` against a second, unrelated
   * timer for margin, on the OS scheduler. `setTimeout` is a *minimum* delay, not an exact
   * one, so under CPU contention the 95 ms sleep could itself take >100 ms of wall clock and
   * lose a race the test meant to always win — measured 2/6 under load, 0/10 idle, and it
   * failed one unprompted `pnpm verify`. **Do not "fix" this by widening the 95/100 margin**
   * — that only makes the flake rarer.
   *
   * The fix is `vi.useFakeTimers()`, not a clock argument threaded into `deadline()`.
   * Vitest's fake timers replace `setTimeout` **and** `performance.now()` together, advanced
   * in lockstep by `vi.advanceTimersByTimeAsync()` (verified directly against this file's
   * `deadline()` before relying on it here — see the harness notes) — so the 95-vs-100
   * relationship becomes an EXACT ordering fact (95 fires before 100, always) instead of two
   * independent clocks racing. `deadline.ts` itself is untouched: it still reads the real
   * `performance.now()` in production, and its monotonic-vs-wall-clock property (see its
   * docstring) is not exercised by this test at all. This seam is entirely test-side.
   */
  test('⚠ a slow discovery cannot band an alarm on a healthy instance', async () => {
    vi.useFakeTimers();
    try {
      const slowIo: CollectorIo = {
        ...liveBox.io(),
        readDir: async (path) => {
          await new Promise((resolve) => setTimeout(resolve, 95));
          return liveBox.io().readDir(path);
        },
      };
      const requested: string[] = [];
      // ⚠ The probes must take measurable (virtual) time. With an instant fake, a probe
      // handed the ~5 ms left of a REINTRODUCED shared budget would still WIN the race, and
      // the defect would be invisible again — the adversarial's own reproduction used a
      // 20 ms fake for exactly this reason, and it stays 20 ms here.
      const unhurried: HttpIo = {
        get: async (url, timeoutMs) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return liveBox.http(requested).get(url, timeoutMs);
        },
      };
      const collected = collectServing({
        io: slowIo,
        dbus: liveBox.dbus(),
        http: unhurried,
        discoveryTimeoutMs: 100,
      });
      // Enough virtual time for the 95 ms readDir plus two SEQUENTIAL 20 ms probes per
      // instance (both instances run concurrently) — comfortably short of the 4 s default
      // probe budget, which must never fire either.
      await vi.advanceTimersByTimeAsync(1000);
      const { serving, errors } = await collected;

      // Both instances answered. Nothing about them was in doubt, and nothing may say it was.
      expect(serving?.map((s) => s.health)).toEqual(['ok', 'ok']);
      expect(serving?.map((s) => s.model)).toEqual(['qwen3.6-27b', 'qwen3.6-27b']);
      expect(requested).toHaveLength(4);
      expect(errors.filter((e) => e.source === 'llama-health')).toEqual([]);
      expect(severityHealth(serving?.[0]?.health ?? null)).toBe('normal');
      expect(severityHealth(serving?.[1]?.health ?? null)).toBe('normal');
    } finally {
      vi.useRealTimers();
    }
  });

  test('⚠ a discovery budget spent on the env files blanks the port, and health is `null`', async () => {
    // The honest degradation: the collector could not afford to read the env file, so
    // `port` is null with an `llama-env` entry, and `health` is null down the EXISTING
    // `env.port === null` path — §3.7's "not probed this cycle", not a placeholder, and
    // never `unreachable`. `severityHealth(null)` is null: no colour, no alarm.
    const requested: string[] = [];
    const { serving, errors } = await collectServing({
      io: {
        ...liveBox.io(),
        readFile: () => new Promise<string>(() => undefined),
      },
      dbus: liveBox.dbus(),
      http: liveBox.http(requested),
      discoveryTimeoutMs: 40,
    });
    expect(serving?.map((s) => s.health)).toEqual([null, null]);
    expect(serving?.map((s) => s.port)).toEqual([null, null]);
    expect(requested).toEqual([]);
    expect(errors.every((e) => e.source === 'llama-env')).toBe(true);
    expect(errors.some((e) => e.message.includes('timed out'))).toBe(true);
    expect(severityHealth(null)).toBeNull();
  });

  test('⚠ a LATE-starting instance gets a whole probe budget, not what is left of one', async () => {
    /*
     * §6.5 calls "the other instance is unaffected" a structural requirement, not an
     * observation about the current scheduling — so the property has to hold for an
     * instance whose probe starts long after the collector did.
     *
     * The discriminator: instance 1's env file takes 200 ms, so its probe starts at
     * t ≈ 200 ms. Its two requests take 10 ms each. Under a budget **minted inside the
     * per-instance closure** it has a fresh 120 ms and answers `ok`. Under any budget
     * opened once for the collector — which is what this step shipped, and what hoisting
     * `deadline()` above `instances.map` would restore — 120 ms is already gone at t = 200
     * and instance 1 bands §6.3's alarm while serving perfectly.
     *
     * Instance 0 answers either way, which is the point: only the late one moves.
     */
    const slowSecondEnv: CollectorIo = {
      ...liveBox.io(),
      readFile: async (path) => {
        if (path.endsWith('1.env')) await new Promise((resolve) => setTimeout(resolve, 200));
        return liveBox.io().readFile(path);
      },
    };
    const unhurried: HttpIo = {
      get: async (url, timeoutMs) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return liveBox.http().get(url, timeoutMs);
      },
    };
    const { serving, errors } = await collectServing({
      io: slowSecondEnv,
      dbus: liveBox.dbus(),
      http: unhurried,
      discoveryTimeoutMs: 2000,
      probeTimeoutMs: 120,
    });
    expect(serving?.map((s) => s.health)).toEqual(['ok', 'ok']);
    expect(serving?.map((s) => s.model)).toEqual(['qwen3.6-27b', 'qwen3.6-27b']);
    expect(errors).toEqual([]);
  });

  test('⚠ a wedged instance spends only its OWN budget — the other still answers', async () => {
    // The complement, and the case §6.5 names: instance 0's `/health` never answers, so it
    // is `unreachable` on its own bound and carries the one entry. Instance 1 is untouched
    // — not one figure of its row is blanked, and no entry is filed against it.
    const wedgedFirst: HttpIo = {
      get: (url, timeoutMs) =>
        url.startsWith('http://127.0.0.1:8080')
          ? new Promise<HttpResponse>(() => undefined)
          : liveBox.http().get(url, timeoutMs),
    };
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: liveBox.dbus(),
      http: wedgedFirst,
      probeTimeoutMs: 60,
    });
    expect(serving?.[0]?.health).toBe('unreachable');
    expect(serving?.[1]).toEqual({
      instance: 1,
      port: 8081,
      unitState: 'active',
      model: 'qwen3.6-27b',
      ctx: 131072,
      health: 'ok',
    });
    expect(errors.map((e) => e.source)).toEqual(['llama-health']);
    expect(errors[0]?.message).toContain('8080');
    expect(errors[0]?.message).not.toContain('8081');
  });
});

describe('bounds and hygiene', () => {
  test('⚠ a server that answers nothing is bounded, not a hang', async () => {
    // §4 samples per request, so an unbounded probe hangs the telemetry route and every
    // browser polling it. The bound is on the promise, whatever the socket does.
    const wedged: HttpIo = { get: () => new Promise<HttpResponse>(() => undefined) };
    const started = performance.now();
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: liveBox.dbus(),
      http: wedged,
      probeTimeoutMs: 60,
    });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(3000);
    expect(serving?.every((s) => s.health === 'unreachable')).toBe(true);
    expect(errors.every((e) => e.source === 'llama-health')).toBe(true);
  });

  test('a wedged env file does not stop the other instance from being read', async () => {
    const { serving } = await collectServing({
      io: {
        ...fakeIo({ files: { [`${DIR}/1.env`]: CAPTURED_LLAMA_ENV_1 } }),
        readFile: (path) =>
          path.endsWith('0.env')
            ? new Promise<string>(() => undefined)
            : Promise.resolve(CAPTURED_LLAMA_ENV_1),
      },
      dbus: liveBox.dbus(),
      http: liveBox.http(),
      discoveryTimeoutMs: 80,
    });
    expect(serving?.[0]?.port).toBeNull();
    expect(serving?.[1]?.port).toBe(8081);
  });

  test('a `.env` that is not an instance reaches errors[] as `llama-env`', async () => {
    // `discoverInstances` reports it; the wrapper is what turns that into an entry and
    // prefixes the directory. Dropping the problems would lose the only signal that a file
    // in §3.4's discovery directory was ignored.
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env', 'default.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: liveBox.http(),
    });
    expect(serving).toHaveLength(1);
    expect(errors.map((e) => e.source)).toEqual(['llama-env']);
    expect(errors[0]?.message).toContain('default.env');
    expect(errors[0]?.message).toContain(DIR);
  });

  test('⚠ collectServing never runs a command — unit state comes over D-Bus, not systemctl', async () => {
    // §2.2 forbids shelling out for unit state and `node:24-slim` has no systemd binaries.
    // ⚠ Asserted on a RECORD of what was run rather than on the absence of errors.
    ran.length = 0;
    const { errors } = await collectServing({ io: liveBox.io(), dbus: liveBox.dbus(), http: liveBox.http() });
    expect(ran).toEqual([]);
    expect(errors).toEqual([]);
  });

  /*
   * ⚠ F9 — this test used to assert `serving` had two rows after passing `timeoutMs: NaN`,
   * and it proved **nothing**: the fake `HttpIo` never looked at its `timeoutMs`, so the
   * only thing under test was `deadline()`'s fallback, which `deadline.test.ts` already
   * covers directly. The path that actually carries the number — `nodeHttp`'s `setTimeout` —
   * was untouched, and was broken (F2): a bare `setTimeout(…, NaN)` clamps to **1 ms** and
   * bands `unreachable` on a healthy instance.
   *
   * It is one finding with F2, not two. It was not ⚠-marked, so the ledger never asked for
   * it; marking it would have demanded a mutation, and the only mutation that could redden
   * it lived at the missing call site. The fake now **records** the number, so the assertion
   * can see it.
   */
  test('⚠ a nonsense probe timeout reaches the seam as the module default, not as NaN', async () => {
    const handed: number[] = [];
    const recording: HttpIo = {
      get: (url, timeoutMs) => {
        handed.push(timeoutMs);
        return liveBox.http().get(url, timeoutMs);
      },
    };
    const { serving } = await collectServing({
      io: liveBox.io(),
      dbus: liveBox.dbus(),
      http: recording,
      probeTimeoutMs: Number.NaN,
    });
    expect(serving).toHaveLength(2);
    // Four requests — two instances × (`/health`, `/v1/models`) — every one of them bounded.
    expect(handed).toHaveLength(4);
    expect(handed).toEqual([
      SERVING_PROBE_TIMEOUT_MS,
      SERVING_PROBE_TIMEOUT_MS,
      SERVING_PROBE_TIMEOUT_MS,
      SERVING_PROBE_TIMEOUT_MS,
    ]);
    expect(handed.every((ms) => Number.isFinite(ms) && ms > 0 && ms <= MAX_TIMEOUT_MS)).toBe(true);
  });

  test('the three budgets are separate — tightening one does not tighten the others', async () => {
    // R5: one `timeoutMs` used to set the collector's deadline, the D-Bus conversation's
    // deadline AND the per-request HTTP bound, so a caller narrowing one narrowed two it
    // did not know existed.
    const handed: number[] = [];
    const recording: HttpIo = {
      get: (url, timeoutMs) => {
        handed.push(timeoutMs);
        return liveBox.http().get(url, timeoutMs);
      },
    };
    const connectTimeouts: number[] = [];
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus(
        { 'llama-server@0.service': 'active', 'llama-server@1.service': 'active' },
        undefined,
        undefined,
        connectTimeouts,
      ),
      http: recording,
      discoveryTimeoutMs: 1500,
      probeTimeoutMs: 250,
      dbusTimeoutMs: 900,
    });
    expect(errors).toEqual([]);
    expect(serving).toHaveLength(2);
    // ⚠ Both observable bounds are asserted, not just the HTTP one — the test names three
    // budgets, so a body that could only see one would be naming a property it does not
    // check. The discovery budget is the one that cannot be read off a seam; it is covered
    // instead by the two tests above, which measure what it does.
    expect(new Set(handed)).toEqual(new Set([250]));
    expect(connectTimeouts).toEqual([900]);
  });

  test('⚠ DBUS_TIMEOUT_MS is the real default for the conversation, not merely a fallback', async () => {
    // R5's measured symptom: the constant's doc argued at length for 2 s while
    // `collectServing` handed the conversation its own 4 s, so the number the doc defended
    // was reached only when the caller's argument was unusable. Asserted at the seam, which
    // is the only place the conversation's bound is observable.
    const connectTimeouts: number[] = [];
    await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus(
        { 'llama-server@0.service': 'active', 'llama-server@1.service': 'active' },
        undefined,
        undefined,
        connectTimeouts,
      ),
      http: liveBox.http(),
    });
    expect(connectTimeouts).toEqual([DBUS_TIMEOUT_MS]);
    expect(DBUS_TIMEOUT_MS).not.toBe(SERVING_PROBE_TIMEOUT_MS);
  });

  test('every error carries one of §3.7’s four serving sources and no other', async () => {
    const { errors } = await collectServing({
      io: fakeIo({
        entries: ['0.env', '1.env', 'default.env'],
        files: { [`${DIR}/0.env`]: LLAMA_ENV_NO_PORT, [`${DIR}/1.env`]: errno('EACCES', 'EACCES: denied') },
      }),
      dbus: fakeDbus({}, undefined, new Error('no bus')),
      http: fakeHttp({}),
    });
    const allowed = new Set(['llama-env', 'dbus', 'llama-health', 'llama-models']);
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) expect(allowed.has(e.source), e.source).toBe(true);
  });
});
