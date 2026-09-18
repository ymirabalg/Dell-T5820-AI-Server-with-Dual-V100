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

import { servingIdentityOnly, servingInstances, servingPerGpu, servingPopulated } from '../fixtures';
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
/**
 * ⚠ 12b — a `VARIANT` holding an `as`, which is what `Properties.Get(Service, Environment)`
 * answers. The element bytes are built first so the array's own length field is the COUNT OF
 * BYTES, not of elements — the one thing a hand-rolled `as` writer gets wrong, and the exact
 * distinction `samples.ts`'s captured frame settles (`1b000000` for one 22-character string).
 */
const variantStringArrayBody = (values: readonly string[]): readonly number[] => {
  const out: number[] = [2, 0x61, 0x73, 0];
  pad(out, 4);
  const elements: number[] = [];
  for (const value of values) putString(elements, value);
  out.push(...le32(elements.length), ...elements);
  return out;
};
/**
 * ⚠ 12b — what a `llama-server@N.service` unit really declares, from the box (2026-09-17):
 * the template's `Environment=CUDA_VISIBLE_DEVICES=%i`, expanded by systemd before the
 * property is read. `fakeDbus` uses it so every existing test keeps describing THIS box.
 */
const templateEnvironment = (unit: string): readonly string[] => {
  const at = /@(\d+)\.service$/.exec(unit);
  return at === null ? [] : [`CUDA_VISIBLE_DEVICES=${at[1] ?? ''}`];
};

/** A scripted systemd: a state per unit name, or `undefined` for `NoSuchUnit`. */
const fakeDbus = (
  units: Readonly<Record<string, string>>,
  asked?: string[],
  connectError?: Error,
  connectTimeouts?: number[],
  /**
   * ⚠ 12b — what `Properties.Get(Service, Environment)` answers, per unit. Omit a unit and it
   * gets {@link templateEnvironment}, which is what this box's units really hold; an `Error`
   * value scripts an ERROR reply instead, and `null` scripts a well-formed reply whose body
   * is not a list of strings at all.
   */
  environments?: Readonly<Record<string, readonly string[] | Error | null>>,
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
        } else if (String(body[1]) === 'Environment') {
          const scripted = environments?.[lastUnit];
          if (scripted instanceof Error) {
            emit(
              frame(
                DBUS_MESSAGE_TYPE.error,
                serial,
                's',
                stringBody(scripted.message),
                'org.freedesktop.DBus.Error.AccessDenied',
              ),
            );
          } else if (scripted === null) {
            emit(frame(DBUS_MESSAGE_TYPE.methodReturn, serial, 'v', variantBody('not-a-list')));
          } else {
            emit(
              frame(
                DBUS_MESSAGE_TYPE.methodReturn,
                serial,
                'v',
                variantStringArrayBody(scripted ?? templateEnvironment(lastUnit)),
              ),
            );
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
      // ⚠ 12b — `gpus` comes from each unit's OWN `CUDA_VISIBLE_DEVICES`, read over the same
      // connection as `ActiveState`. `[0]`/`[1]` here is not the old index join wearing a new
      // name: the fake answers the frame this box's bus really sends (`samples.ts`'s
      // `CAPTURED_DBUS_ENVIRONMENT_REPLY`), so the two happening to agree is the ARRANGEMENT
      // being per-GPU, which is what the wire now says rather than what we assumed.
      { instance: '0', port: 8080, unitState: 'active', model: 'qwen3.6-27b', ctx: 131072, health: 'ok', gpus: [0] },
      { instance: '1', port: 8081, unitState: 'active', model: 'qwen3.6-27b', ctx: 131072, health: 'ok', gpus: [1] },
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
    expect(asked).toEqual([servingUnitName('0'), servingUnitName('1')]);
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
      instance: '2',
      port: 8082,
      unitState: 'active',
      model: 'gemma-4-12b',
      ctx: 131072,
      health: 'ok',
      // ⚠ 12b — and the third card's `gpus` is read the same way as the first two's, from
      // `llama-server@2.service`'s own environment. Nothing below mentions the number 2
      // except the fixture, which is the property this test exists for.
      gpus: [2],
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
    // ⚠ 12b — `servingPerGpu`, not `servingInstances`. They differ in exactly one key: this
    // is what the CURRENT server emits, and `servingInstances` is what the one running on the
    // box emits — §3.4's absent case, kept as a fixture precisely so the additivity claim has
    // something real to be tested against (`lib/client/wire.test.ts`).
    expect(serving).toEqual(servingPerGpu);
    // §6.5: "An `llama-server` instance is down — its row shows the unit state and the
    // reason; the other instance is unaffected."
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('llama-health');
    expect(errors[0]?.message).toContain('ECONNREFUSED');
    // 10b-S-G: attached structurally from the per-instance closure, not read back out of
    // the message this same failure already put "8081" into.
    expect(errors[0]?.instance).toBe('1');
    expect(severityUnitState(serving?.[1]?.unitState ?? null)).toBe('alarm');
    expect(severityHealth(serving?.[1]?.health ?? null)).toBe('alarm');
    expect(severityHealth(serving?.[0]?.health ?? null)).toBe('normal');
  });

  test('⚠ `servingPopulated` carries the same list and the same single error', () => {
    // The snapshot fixture wraps the same two instances plus one `llama-health` entry
    // naming `ECONNREFUSED 127.0.0.1:8081`. Asserting it here ties the collector's output
    // to the value every later step's render tests are written against.
    expect(servingPopulated.serving).toEqual(servingInstances);
    // ⚠ 12b — and `servingPerGpu` is the same two instances with §3.4's `gpus` declared, so
    // the pair differs in that key and NOTHING else. Both render identically (that is §3.4's
    // fallback ruling); a fixture drift that made them differ elsewhere would make every
    // "renders exactly as today" assertion in `components/panels/` measure two changes at once.
    expect(servingPerGpu.map((i) => ({ ...i, gpus: undefined }))).toEqual(
      servingInstances.map((i) => ({ ...i, gpus: undefined })),
    );
    expect(servingPopulated.errors).toEqual([
      { source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081', instance: '1' },
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
      instance: '0',
      port: null,
      unitState: 'active',
      model: null,
      ctx: 131072,
      health: null,
      gpus: [0],
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
    // 10b-S-G: a bus-wide connect failure explains BOTH rows at once, which is not one
    // row's fact — it must carry no instance rather than guess either one.
    expect(errors[0]?.instance).toBeUndefined();
  });

  test('⚠ 10b-S-G — a per-unit dbus failure carries ITS instance, and only its own', async () => {
    // systemd has no record of `llama-server@1.service`; instance 0's is untouched. The
    // structural join (`instance`) has to land on row 1 even though nothing in the message
    // says "1" — it says the unit name, and only `collectServing` knows which index that is.
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: liveBox.http(),
    });
    expect(serving?.map((s) => s.unitState)).toEqual(['active', 'inactive']);
    expect(errors.map((e) => e.source)).toEqual(['dbus']);
    expect(errors[0]?.message).toContain('llama-server@1.service');
    expect(errors[0]?.instance).toBe('1');
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
      instance: '0',
      port: 8080,
      unitState: 'active',
      model: 'qwen3.6-27b',
      ctx: 131072,
      health: 'ok',
      gpus: [0],
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
      instance: '1',
      port: 8081,
      unitState: 'active',
      model: 'qwen3.6-27b',
      ctx: 131072,
      health: 'ok',
      gpus: [1],
    });
    expect(errors.map((e) => e.source)).toEqual(['llama-health']);
    expect(errors[0]?.message).toContain('8080');
    expect(errors[0]?.message).not.toContain('8081');
    // 10b-S-G: the entry is instance 0's own, structurally — not merely a message that
    // happens to say "8080" and not "8081".
    expect(errors[0]?.instance).toBe('0');
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
      io: fakeIo({ entries: ['0.env', '01.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: liveBox.http(),
    });
    expect(serving).toHaveLength(1);
    expect(errors.map((e) => e.source)).toEqual(['llama-env']);
    expect(errors[0]?.message).toContain('01.env');
    expect(errors[0]?.message).toContain(DIR);
  });

  test('⚠ 10b-S-G — the two DIRECTORY-level `llama-env` entries carry no instance', async () => {
    // Two paths file an entry about the directory rather than about an instance: the `readDir`
    // failure (nothing was enumerated at all, `serving: null`) and `discoverInstances`'
    // malformed-filename problems (a listed `.env` that is explicitly NOT an instance).
    // Neither may name one — attaching, say, `instances[0]` would render "`default.env` is not
    // `<instance>.env`", a fact about the DIRECTORY, as instance 0's own reason beside instance
    // 0's healthy readings. Until this test the build's "4 of 18 sources may carry an instance"
    // enumeration was enforced for `collectSafety` (10b-SF1) and by nothing at all for these
    // two (adversarial A4); the type cannot express it, `tag()`'s third parameter is on the
    // shared minting helper, and `wire.ts` accepts `instance` on any source.
    const listFailed = await collectServing({
      io: fakeIo({ entries: errno('ENOENT', `ENOENT: scandir '${DIR}'`) }),
      dbus: liveBox.dbus(),
      http: liveBox.http(),
    });
    expect(listFailed.serving).toBeNull();
    expect(listFailed.errors).toHaveLength(1);
    // ⚠ `Object.hasOwn`, not `=== undefined`: a key PRESENT and holding `undefined` reads the
    // same way through `?.instance`, and is exactly what a careless `{ ...e, instance }` spread
    // produces if it slips past the type system (A11). Corrected 2026-09-08 by 10c-2's test
    // phase: `exactOptionalPropertyTypes` is ON, not off — has been since the first commit — so
    // `tsc` itself now rejects that spread when the type is visible; this assertion is the
    // runtime backstop for a path where it is not (an `any`, a cast, a JSON.parse result).
    expect(Object.hasOwn(listFailed.errors[0] ?? {}, 'instance')).toBe(false);

    const notAnInstance = await collectServing({
      io: fakeIo({ entries: ['0.env', '01.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }),
      http: liveBox.http(),
    });
    const dirEntry = notAnInstance.errors.find((e) => e.message.includes('01.env'));
    expect(dirEntry).toBeDefined();
    expect(Object.hasOwn(dirEntry ?? {}, 'instance')).toBe(false);
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

describe('⚠⚠ 12c — named instances, and the unit-name mapping that can MISS', () => {
  test('⚠⚠ `split.env` is discovered and asked about under `llama-split.service`', async () => {
    // The whole ruling, end to end. Until 12c `discoverInstances` refused this filename, so
    // the process actually serving the box appeared NOWHERE — and the per-card env files
    // survive a mode switch, so the panel confidently showed two inactive instances instead.
    const asked: string[] = [];
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['split.env'], files: { [`${DIR}/split.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-split.service': 'active' }, asked, undefined, undefined, {
        'llama-split.service': ['CUDA_VISIBLE_DEVICES=0,1'],
      }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    expect(errors).toEqual([]);
    // ⚠ The unit ASKED ABOUT is the assertion that matters. A template would have asked about
    // `llama-server@split.service`, systemd would have answered `inactive` without complaint,
    // and every reading below would be the same shape with the wrong values in it.
    expect(asked).toEqual(['llama-split.service']);
    expect(serving).toEqual([
      {
        instance: 'split',
        port: 8080,
        unitState: 'active',
        model: 'qwen3.6-27b',
        ctx: 131072,
        health: 'ok',
        gpus: [0, 1],
      },
    ]);
  });

  test('⚠⚠ THE MISS IS LOUD — an identity with no unit name files a `dbus` entry NAMING it', async () => {
    // `default.env` is a legal instance filename (§3.4's ruling) and there is no
    // `llama-default.service` in `lib/units.ts`'s table. Everything that does not need a unit
    // name is read normally; the two columns that do are `null`, and the entry says why.
    //
    // ⚠ Without the entry this row is INDISTINGUISHABLE from a stopped service: `unitState`
    // `null` renders an em dash, `gpus` `null` renders an em dash, and nothing anywhere says
    // the dashboard never asked. That is the silence the mapping exists to break.
    const asked: string[] = [];
    const { serving, errors } = await collectServing({
      io: fakeIo({
        entries: ['0.env', 'default.env'],
        files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0, [`${DIR}/default.env`]: CAPTURED_LLAMA_ENV_1 },
      }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }, asked, undefined, undefined, {
        'llama-server@0.service': ['CUDA_VISIBLE_DEVICES=0'],
      }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
        'http://127.0.0.1:8081/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8081/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    // ⚠ The unmappable instance is NOT asked about: there is no unit to ask about, and a
    // guessed name gets a perfectly ordinary answer back.
    expect(asked).toEqual(['llama-server@0.service']);
    expect(serving).toHaveLength(2);
    const unmapped = serving?.find((row) => row.instance === 'default');
    expect(unmapped?.unitState).toBeNull();
    expect(unmapped?.gpus).toBeNull();
    // …and everything that did NOT need a unit name was read normally.
    expect(unmapped?.port).toBe(8081);
    expect(unmapped?.ctx).toBe(131072);
    expect(unmapped?.health).toBe('ok');
    expect(unmapped?.model).toBe('qwen3.6-27b');

    const miss = errors.filter((e) => e.instance === 'default');
    expect(miss).toHaveLength(1);
    expect(miss[0]?.source).toBe('dbus');
    expect(miss[0]?.message).toContain('`default`');
    expect(miss[0]?.message).toContain('default.env');
    expect(miss[0]?.message).toContain(DIR);
    // ⚠ ONE entry, not two: `gpusFor` must not file a second `dbus` sentence about the same
    // fact (§6.5, "one fact, stated once").
    expect(errors.filter((e) => e.instance === 'default')).toHaveLength(1);
  });

  test('⚠ the OTHER instance is completely unaffected by a neighbour the mapping cannot name', async () => {
    // §6.5's structural requirement, applied to the new failure: an unmappable identity must
    // not cost the instances beside it their unit state or their cards.
    const { serving, errors } = await collectServing({
      io: fakeIo({
        entries: ['0.env', 'default.env'],
        files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0, [`${DIR}/default.env`]: CAPTURED_LLAMA_ENV_1 },
      }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }, undefined, undefined, undefined, {
        'llama-server@0.service': ['CUDA_VISIBLE_DEVICES=1'],
      }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
        'http://127.0.0.1:8081/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8081/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    const numbered = serving?.find((row) => row.instance === '0');
    expect(numbered?.unitState).toBe('active');
    // ⚠ `[1]` and not `[0]`: the fixture makes the identity and the card DISAGREE, so a
    // reading taken from the instance number instead of the unit would still say `[0]`.
    expect(numbered?.gpus).toEqual([1]);
    expect(errors.filter((e) => e.instance === '0')).toEqual([]);
  });

  test('⚠⚠ THE SILENT WRONG ANSWER, scripted: the guessed unit EXISTS and is still not asked about', () => {
    // ⚠⚠ The fixture the whole mapping exists for, and the one the other tests cannot be.
    // Everywhere else the bus is scripted WITHOUT `llama-server@default.service`, so a guessing
    // implementation gets `NoSuchUnit` back and files a `dbus` error — loud by accident. Here
    // the fabricated name is scripted as a real, ordinary unit: `inactive`, with a
    // `CUDA_VISIBLE_DEVICES` of its own. A template would now produce a row that is plausible
    // in every cell — a stopped service serving card 0 — with nothing anywhere saying the
    // dashboard asked about a unit that has never existed.
    //
    // ⚠ So this asserts the READINGS as well as `asked`: `unitState` and `gpus` must be `null`
    // even though a perfectly good answer for the guessed name was available to be taken.
    const asked: string[] = [];
    return collectServing({
      io: fakeIo({
        entries: ['default.env'],
        files: { [`${DIR}/default.env`]: CAPTURED_LLAMA_ENV_0 },
      }),
      dbus: fakeDbus(
        { 'llama-server@default.service': 'inactive', 'llama-default.service': 'active' },
        asked,
        undefined,
        undefined,
        {
          'llama-server@default.service': ['CUDA_VISIBLE_DEVICES=0'],
          'llama-default.service': ['CUDA_VISIBLE_DEVICES=1'],
        },
      ),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    }).then(({ serving, errors }) => {
      // Nothing was asked about at all — there is no unit name to ask about.
      expect(asked).toEqual([]);
      expect(serving).toHaveLength(1);
      expect(serving?.[0]?.instance).toBe('default');
      expect(serving?.[0]?.unitState).toBeNull();
      expect(serving?.[0]?.gpus).toBeNull();
      // ⚠ `'inactive'` and `[0]` are the answers a guess would have produced. Asserting them
      // ABSENT is the half that discriminates: `null` and a guessed value are both "not
      // active", and only one of them is a reading.
      expect(serving?.[0]?.unitState).not.toBe('inactive');
      expect(serving?.[0]?.gpus).not.toEqual([0]);
      // …and the one entry that says why.
      expect(errors).toHaveLength(1);
      expect(errors[0]?.source).toBe('dbus');
      expect(errors[0]?.instance).toBe('default');
    });
  });

  test('⚠ the miss is APPENDED after the bus’s own entries, so last-per-source still reads the bus', () => {
    // §4 pins `errors[]`'s order and `events.ts` folds by source taking the LAST message. The
    // miss and a genuine bus failure are both `dbus`, so their relative order decides which
    // sentence the event log quotes. `collectServing` pushes `units.errors` first and the
    // unit-name problems after — asserted here rather than left to the order of two `push`
    // statements, because swapping them is a one-line edit that changes what an operator reads
    // and breaks no other test.
    return collectServing({
      io: fakeIo({
        entries: ['0.env', 'default.env'],
        files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0, [`${DIR}/default.env`]: CAPTURED_LLAMA_ENV_1 },
      }),
      // `llama-server@0.service` is NOT on this bus, so the unit conversation files its own
      // `dbus` entry — a real failure, beside the lookup miss.
      dbus: fakeDbus({}),
      http: fakeHttp({}),
    }).then(({ errors }) => {
      const dbusEntries = errors.filter((e) => e.source === 'dbus');
      expect(dbusEntries.length).toBeGreaterThanOrEqual(2);
      expect(dbusEntries[0]?.instance).toBe('0');
      expect(dbusEntries.at(-1)?.instance).toBe('default');
      expect(dbusEntries.at(-1)?.message).toContain('no systemd unit is known');
    });
  });

  test('⚠⚠ the rows come back in `compareInstances` order whatever order the DIRECTORY listed', () => {
    // Asserted through the collector rather than through the comparator, because the order of
    // `serving[]` is what *first claimant wins* means downstream and `readDir` promises
    // nothing about its own order.
    const listings = [
      ['split.env', '10.env', '0.env', '2.env'],
      ['0.env', '2.env', '10.env', 'split.env'],
      ['2.env', 'split.env', '0.env', '10.env'],
    ];
    return Promise.all(
      listings.map(async (entries) => {
        const { serving } = await collectServing({
          io: fakeIo({ entries, files: {} }),
          dbus: fakeDbus({}),
          http: fakeHttp({}),
        });
        expect(serving?.map((row) => row.instance)).toEqual(['0', '2', '10', 'split']);
      }),
    );
  });
});

describe('⚠⚠ 12b — §3.4’s `gpus`: the instance declares the cards it serves', () => {
  test('⚠ SPLIT MODE: one process, both cards, and the wire says so', async () => {
    // `SERVING-MODES.md` §2 — one unit with `CUDA_VISIBLE_DEVICES=0,1`. Under the join this
    // replaces, there was no answer at all for GPU 1: one instance, two cards, and `split`
    // is not an index. `serving-mode.sh`'s own caveat says so in as many words.
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus(
        { 'llama-server@0.service': 'active' },
        undefined,
        undefined,
        undefined,
        { 'llama-server@0.service': ['CUDA_VISIBLE_DEVICES=0,1'] },
      ),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    expect(errors).toEqual([]);
    expect(serving?.[0]?.gpus).toEqual([0, 1]);
  });

  test('⚠ a unit whose environment names NO CUDA_VISIBLE_DEVICES is null WITH a `dbus` entry', async () => {
    // Invariant 1's other half: an em dash always has an entry behind it. The source is
    // `dbus` because that is where the reading came from — the env file §2.2 mounts has
    // never carried a device, and §3.4 says so.
    const { serving, errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }, undefined, undefined, undefined, {
        'llama-server@0.service': ['LC_ALL=C'],
      }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    expect(serving?.[0]?.gpus).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('dbus');
    expect(errors[0]?.instance).toBe('0');
    expect(errors[0]?.message).toContain('llama-server@0.service');
    expect(errors[0]?.message).toContain('CUDA_VISIBLE_DEVICES');
  });

  test('⚠ a bus that refuses the connection leaves `gpus` null and files NO second entry', async () => {
    // One fact, stated once (§6.5). The connect failure already explains every unit at
    // once; a per-instance "could not read CUDA_VISIBLE_DEVICES" beside it would be the
    // same outage reported twice on the same panel.
    const { serving, errors } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({}, undefined, errno('ENOENT', 'connect ENOENT /run/dbus/system_bus_socket')),
      http: liveBox.http(),
    });
    expect(serving?.map((i) => i.gpus)).toEqual([null, null]);
    expect(errors.filter((e) => e.source === 'dbus')).toHaveLength(1);
  });

  test('⚠ the key is PRESENT on every row the collector emits, even when its value is null', async () => {
    // §3.4 makes absent and `null` two different facts, and only the SERVER may produce the
    // absent one. A collector that omitted the key on a failed read would tell every client
    // "this server has never heard of the field" — and silently restore the index join,
    // which is the coincidence this whole change exists to stop relying on.
    const { serving } = await collectServing({
      io: liveBox.io(),
      dbus: fakeDbus({}, undefined, errno('ENOENT', 'connect ENOENT /run/dbus/system_bus_socket')),
      http: liveBox.http(),
    });
    for (const row of serving ?? []) expect(Object.hasOwn(row, 'gpus')).toBe(true);
  });

  test('⚠ a `gpus` entry is filed AFTER the llama-* and dbus unit entries, never in the middle', async () => {
    // §4 pins `errors[]`'s order and `events.ts` reads the LAST message per source, so a
    // `dbus` sentence emitted from inside the per-instance map would re-order the list for
    // every consumer of the snapshot.
    const { errors } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: 'CTX=131072\n' } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }, undefined, undefined, undefined, {
        'llama-server@0.service': ['LC_ALL=C'],
      }),
      http: fakeHttp({}),
    });
    expect(errors.map((e) => e.source)).toEqual(['llama-env', 'dbus']);
    expect(errors.at(-1)?.message).toContain('CUDA_VISIBLE_DEVICES');
  });

  test('⚠ the cards are read from the UNIT, not from the instance number', async () => {
    // The property the whole inversion buys: a mis-pinned instance now shows the WRONG CARD
    // rather than being invisible. Instance 0's unit here declares card 1 — under the join
    // this replaces, nothing on the wire could have said so.
    const { serving } = await collectServing({
      io: fakeIo({ entries: ['0.env'], files: { [`${DIR}/0.env`]: CAPTURED_LLAMA_ENV_0 } }),
      dbus: fakeDbus({ 'llama-server@0.service': 'active' }, undefined, undefined, undefined, {
        'llama-server@0.service': ['CUDA_VISIBLE_DEVICES=1'],
      }),
      http: fakeHttp({
        'http://127.0.0.1:8080/health': ok('{"status":"ok"}'),
        'http://127.0.0.1:8080/v1/models': ok(CAPTURED_MODELS_BODY),
      }),
    });
    expect(serving?.[0]?.instance).toBe('0');
    expect(serving?.[0]?.gpus).toEqual([1]);
  });
});
