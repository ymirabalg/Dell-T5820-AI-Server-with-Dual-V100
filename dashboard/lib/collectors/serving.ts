/**
 * §3.4's IO wrapper: discover the instances, read their env files, ask systemd and ask the
 * servers themselves.
 *
 * ⚠ **The first collector in this project with more than one `ErrorSource` on one
 * wrapper**, which is why the parser/wrapper split matters more here than anywhere. Four of
 * §3.7's eighteen names are produced in this file and each blanks a different column of the
 * SERVING panel:
 *
 * | source | blanks | reached when |
 * |---|---|---|
 * | `llama-env` | `port`, `ctx` — and therefore `health` and `model` | the directory or an env file would not read, or a value would not parse |
 * | `dbus` | `unitState` | tagged inside {@link collectUnitStates}, never here |
 * | `llama-health` | `health` | `/health` refused, reset, timed out, or answered something other than 200/503 |
 * | `llama-models` | `model` | `/v1/models` answered 200 with a body that is not a model list |
 *
 * None of the parsers knows any of those names. `llama.ts` returns `problems`; this file
 * decides which figure each one explains, because it is the only layer that knows what it
 * just tried to read.
 *
 * ⚠ **10b-S-G: this is also the only layer that knows which instance.** `readEnv` and
 * `probe` run inside a per-instance closure, so every `llama-env`, `llama-health` and
 * `llama-models` entry they produce is attached to `TelemetryError.instance` right there —
 * never guessed downstream by matching a unit name, an `<i>.env` path or a port back out of
 * the message text. The `dbus` entries this file's own `unitInstances` map makes possible
 * are attached inside {@link collectUnitStates} for the same reason: only the caller that
 * built `servingUnitName(instance)` in the first place can say which instance a
 * `llama-server@<i>` unit failure is about.
 *
 * ### Read-only, and narrower than that
 *
 * Invariant 2 forbids writing. §13 of the decisions goes further and excludes a probe
 * endpoint: `/v1/chat/completions` is never called even though it would answer, because a
 * token consumes a slot and evicts the KV cache — and §4 samples per request, so it would
 * happen on every poll of every open tab. The two endpoints used here are the two llama.cpp
 * answers **without** the API key, which is why this dashboard needs no secret.
 */

import type { ServingInstance, TelemetryError } from '../types';
import { DEFAULT_PATHS } from './collect';
import type { CollectorPaths } from './collect';
import { DBUS_TIMEOUT_MS, collectUnitStates, nodeDbus, servingUnitName } from './dbus';
import type { DbusIo } from './dbus';
import { boundedTimeoutMs, deadline } from './deadline';
import type { Within } from './deadline';
import { errnoCodeOf, reason, tag } from './errors';
import { nodeHttp } from './http';
import type { HttpIo } from './http';
import {
  LLAMA_ENV_SUFFIX,
  NO_LLAMA_ENV,
  discoverInstances,
  healthFromStatus,
  healthUrl,
  modelsUrl,
  parseLlamaEnv,
  parseModelsBody,
} from './llama';
import type { LlamaEnv } from './llama';
import { nodeIo } from './io';
import type { CollectorIo } from './io';

/**
 * ### ⚠ Three budgets, not one — and one of them is minted PER INSTANCE
 *
 * §6.7 states the rule this file is shaped by:
 *
 * > **A collector's budget bounds the collector's wall clock; it is never evidence about a
 * > subject.** Any per-subject verdict a collector could not afford to obtain is `null` —
 * > *not read this cycle* — and its `errors[]` entry names the budget rather than the
 * > subject. A verdict of *failure* — `unreachable`, `false`, `inactive` — may be minted
 * > only from an answer, or from a bound that applied to that subject **and to nothing
 * > else.**
 *
 * This collector shipped with **one** budget across the listing, every env read and every
 * HTTP probe, and `probe`'s catch mapped any rejection to `health: 'unreachable'` — §6.3's
 * **alarm**. Measured: a `readDir` of `/etc/llama-server` taking 95 ms of a 100 ms budget,
 * two env files that parsed perfectly, and an HTTP fake answering every request in 20 ms
 * reported **both healthy instances unreachable**, with both entries filed against
 * `llama-health` and nothing anywhere naming the slow directory.
 *
 * Splitting the budget makes that mapping **structurally unreachable** rather than caught:
 *
 * | budget | covers | a failure means |
 * |---|---|---|
 * | {@link SERVING_DISCOVERY_TIMEOUT_MS} | the `readDir` and every env `readFile` | `port`/`ctx` `null` + an `llama-env` entry, and therefore `health: null` down the existing `env.port === null` path |
 * | {@link SERVING_PROBE_TIMEOUT_MS} | **one instance's** `/health` then `/v1/models`, opened fresh inside the per-instance closure | `health: 'unreachable'` + an `llama-health` entry — correct, and §3.7 names it: *"connection refused, reset, or timed out"* |
 * | {@link DBUS_TIMEOUT_MS} | the `llama-server@<i>` conversation, inside `collectUnitStates` | `unitState: null` + a `dbus` entry |
 *
 * ⚠ **§6.5's "the other instance is unaffected" is a STRUCTURAL requirement**, not an
 * observation about scheduling. It held before only because `Promise.all` ran the instances
 * concurrently; a sequential loop — a plausible refactor for *"do not open N sockets at once
 * against a box whose thermal margin is the thing being watched"* — would have let a wedged
 * instance 0 blank instances 1..N with no test failing. A per-instance budget holds under
 * any ordering.
 *
 * ⚠ **The wall-clock ceiling is therefore `discovery + max(per-instance)` = 6 s, not 4 s**,
 * because discovery is necessarily sequenced before the probes. That is a ceiling reached
 * only when both halves wedge, and the aggregate poll deadline is step 6's — which must be
 * a per-collector ceiling returning the partial snapshot it has, **never one shared budget**,
 * or this same defect reappears at the route with a slow `statvfs` alarming a healthy
 * `llama-server`.
 *
 * The three numbers are still chosen rather than derived from a measurement; §6.7 now states
 * them, which is what step 5 reported as gap S10.
 */
export const SERVING_DISCOVERY_TIMEOUT_MS = 2000;

/**
 * One instance's two probes.
 *
 * ⚠ **4 s rather than the 2 s used for `dell_smm`, D-Bus and `statvfs`**, because this is
 * the one collector that talks to a *process under load*: a `llama-server` in the middle of
 * a prefill answers `/health` from the same HTTP thread, and the measured cold-start prefill
 * on this box is 14 s. §6.7 states it. Do not shrink it to make the 6 s ceiling look
 * tidier — it is the only number here derived from a measurement.
 */
export const SERVING_PROBE_TIMEOUT_MS = 4000;

/**
 * Arguments to {@link collectServing}. Options object, like every collector.
 *
 * ⚠ **Three bounds, named separately.** A single `timeoutMs` set all three — the collector's
 * deadline, the D-Bus conversation's, and the per-request HTTP bound — so a caller writing
 * `timeoutMs: 3000` to tighten one tightened two it did not know existed.
 */
export interface CollectServingOptions {
  readonly io?: CollectorIo;
  readonly paths?: CollectorPaths;
  readonly http?: HttpIo;
  readonly dbus?: DbusIo;
  /** The `readDir` and every env `readFile`, shared. Never reaches a `health` verdict. */
  readonly discoveryTimeoutMs?: number;
  /** **Per instance.** That instance's `/health` and `/v1/models`, and nothing else. */
  readonly probeTimeoutMs?: number;
  /** The whole `llama-server@<i>` conversation. Blanks `unitState` only. */
  readonly dbusTimeoutMs?: number;
}

/**
 * What {@link collectServing} yields — §3.4's list, ready for the snapshot with no adapter.
 *
 * ⚠ **`serving: null` is not `serving: []`.** `null` is "the discovery directory could not
 * be listed, so which instances exist is unknown"; `[]` is "it listed, and it declares
 * none". The SERVING panel says *"no instances configured"* for one and *"could not
 * enumerate instances"* for the other, and a collector that collapsed them would make the
 * first sentence a lie on a box whose `/etc/llama-server` failed to mount.
 */
export interface ServingCollection {
  readonly serving: readonly ServingInstance[] | null;
  readonly errors: readonly TelemetryError[];
}

/** One instance's env file, read and parsed. Problems come back tagged `llama-env`. */
const readEnv = async (
  io: CollectorIo,
  within: Within,
  dir: string,
  instance: number,
): Promise<{ env: LlamaEnv; errors: TelemetryError[] }> => {
  const path = `${dir}/${String(instance)}${LLAMA_ENV_SUFFIX}`;
  let text: string;
  try {
    text = await within(() => io.readFile(path));
  } catch (e) {
    return { env: NO_LLAMA_ENV, errors: tag('llama-env', [`${path}: ${reason(e)}`]) };
  }
  const parsed = parseLlamaEnv(text);
  // ⚠ The path is prefixed here, not in the parser. `CollectorPaths` is injectable and the
  // directory is discovered, so a parser holding the literal would name a file it never saw.
  return { env: parsed.value, errors: tag('llama-env', parsed.problems.map((p) => `${path}: ${p}`)) };
};

/**
 * Describe a failed probe: **the errno first, then the prose**.
 *
 * ⚠ `errnoCodeOf` reads `error.code`; it never matches on message text (HANDOVER). §6.5
 * wants the reader to know *which* failure blanked the cell — `ECONNREFUSED` is a stopped
 * instance and a timeout is a wedged one, and they need different reactions — and Node's
 * message is localised prose around a URL that a future release may reword. The code is
 * the stable half, so it is stated separately rather than left to be read out of a
 * sentence.
 */
const probeFailure = (url: string, e: unknown): string => {
  const code = errnoCodeOf(e);
  return code === null ? `${url}: ${reason(e)}` : `${url}: ${code}: ${reason(e)}`;
};

/** What the two HTTP probes yield for one instance. */
interface Probed {
  readonly health: ServingInstance['health'];
  readonly model: string | null;
  readonly errors: readonly TelemetryError[];
}

/** Not probed at all — §3.7's fourth `health` value, and the only place it is minted. */
const NOT_PROBED: Probed = { health: null, model: null, errors: [] };

/**
 * `/health`, then `/v1/models` **only on a 200**.
 *
 * ⚠ Three separate rules live in this one function and each is a documented trap:
 *
 * 1. **A rejection is `unreachable`, an answer never is** (§3.7). `errnoCodeOf` names the
 *    errno in the entry — `ECONNREFUSED` for a stopped instance, a timeout otherwise —
 *    because §6.5 wants the reader to know which, and `reason()` alone gives prose that
 *    varies with the platform.
 * 2. **A 503 body is not a model list.** llama.cpp answers 503 for *every* endpoint while a
 *    model loads, so `/v1/models` during a restart returns `{"error":{…}}`. Parsing it
 *    would file an `llama-models` entry saying the model list is malformed, blaming the
 *    wrong thing for a server that is merely still starting.
 * 3. **`model` is left `null` with no entry when health is not `ok`.** The read was not
 *    attempted, and the `health` cell in the same row already carries the explanation —
 *    `unreachable` or `unhealthy`, in colour. An entry per non-ok instance per poll would
 *    add one `errors[]` line every five seconds for a state the panel already states.
 *
 * ⚠ **`within` here is THIS instance's budget and nothing else's**, which is what makes
 * rule 1 honest: a rejection reaching this catch is always evidence about this instance —
 * either the socket said so, or this instance's own two requests exhausted a bound that
 * applied to them alone (§6.7). See the module doc for the shape that was wrong.
 */
const probe = async (http: HttpIo, within: Within, env: LlamaEnv, timeoutMs: number): Promise<Probed> => {
  if (env.port === null) return NOT_PROBED;

  const health = healthUrl(env.port);
  let status: number;
  try {
    // ⚠ Only the status is read. `/health`'s body is `{"status":"ok"}` and adds nothing
    // §3.7's vocabulary does not already carry; parsing it would be a second, undocumented
    // source of truth for the same cell.
    status = (await within(() => http.get(health, timeoutMs))).status;
  } catch (e) {
    return {
      health: 'unreachable',
      model: null,
      errors: tag('llama-health', [probeFailure(health, e)]),
    };
  }
  const state = healthFromStatus(status);
  const healthErrors = tag('llama-health', state.problems.map((p) => `${health}: ${p}`));
  if (state.value !== 'ok') return { health: state.value, model: null, errors: healthErrors };

  const models = modelsUrl(env.port);
  let modelsBody: string;
  let modelsStatus: number;
  try {
    const answer = await within(() => http.get(models, timeoutMs));
    modelsStatus = answer.status;
    modelsBody = answer.body;
  } catch (e) {
    return {
      health: 'ok',
      model: null,
      errors: [...healthErrors, ...tag('llama-models', [probeFailure(models, e)])],
    };
  }
  if (modelsStatus !== 200) {
    // Reachable in one real window: `/health` answered 200 and the instance began a
    // `set-model` restart before the second request landed. Not a parse failure.
    return {
      health: 'ok',
      model: null,
      errors: [...healthErrors, ...tag('llama-models', [`${models}: answered HTTP ${String(modelsStatus)}`])],
    };
  }
  const parsed = parseModelsBody(modelsBody);
  return {
    health: 'ok',
    model: parsed.value,
    errors: [...healthErrors, ...tag('llama-models', parsed.problems.map((p) => `${models}: ${p}`))],
  };
};

/**
 * Collect §3.4.
 *
 * The order is forced by the data and is not an implementation detail:
 *
 * 1. **List `/etc/llama-server`.** This is the only thing that knows how many instances
 *    exist. Failing here is `serving: null` — *unknown*, never an empty list.
 * 2. **Ask systemd and the servers concurrently.** The unit states need only the instance
 *    *indices* (§6.4 fixes the join key as `llama-server@<i>.service`, derived rather than
 *    matched by string), and the probes need only the env files, so neither waits on the
 *    other.
 * 3. **Per instance, `/health` then `/v1/models`**, the second only on a 200, **under a
 *    budget opened for that instance alone.**
 *
 * ⚠ **`gpu-fan-control.service` is NOT read here** even though this file opens a D-Bus
 * connection. O9 makes it one read rendered in two panels, and its owner is
 * {@link collectSafety} — the panel §3.6 lists it under. Reading it in both places is how
 * two panels come to disagree.
 */
export const collectServing = async ({
  io = nodeIo,
  paths = DEFAULT_PATHS,
  http = nodeHttp,
  dbus = nodeDbus,
  discoveryTimeoutMs = SERVING_DISCOVERY_TIMEOUT_MS,
  probeTimeoutMs = SERVING_PROBE_TIMEOUT_MS,
  dbusTimeoutMs = DBUS_TIMEOUT_MS,
}: CollectServingOptions = {}): Promise<ServingCollection> => {
  const discovery = deadline(discoveryTimeoutMs, SERVING_DISCOVERY_TIMEOUT_MS);
  // ⚠ Sanitised ONCE, here, and handed to both the per-instance `deadline()` and the seam.
  // `nodeHttp` validates its own argument too — but a raw `NaN` travelling this far would
  // still be unobservable at the collector, and `serving.test.ts` asserts the recorded
  // number precisely because a fake that ignored it proved nothing.
  const probeBudget = boundedTimeoutMs(probeTimeoutMs, SERVING_PROBE_TIMEOUT_MS);
  const dir = paths.etcLlamaServer;

  let entries: string[];
  try {
    entries = await discovery(() => io.readDir(dir));
  } catch (e) {
    return { serving: null, errors: tag('llama-env', [`${dir}: ${reason(e)}`]) };
  }

  const found = discoverInstances(entries);
  const errors: TelemetryError[] = [...tag('llama-env', found.problems.map((p) => `${dir}: ${p}`))];
  const instances = found.value;

  // ⚠ 10b-S-G: the ONLY place that knows which unit name is which instance, so it is the
  // one place that builds the map `collectUnitStates` needs to attach `instance`
  // structurally to a per-unit `dbus` entry, rather than `collectUnitStates` (or anything
  // downstream) re-deriving it from `servingUnitName`'s own text.
  const unitInstances = new Map(instances.map((instance) => [servingUnitName(instance), instance]));

  const [units, rows] = await Promise.all([
    collectUnitStates({
      dbus,
      paths,
      units: instances.map(servingUnitName),
      unitInstances,
      timeoutMs: dbusTimeoutMs,
    }),
    Promise.all(
      instances.map(async (instance) => {
        const { env, errors: envErrors } = await readEnv(io, discovery, dir, instance);
        // ⚠ Minted HERE, inside the per-instance closure, so it starts after this
        // instance's env read and is spent by this instance's two requests and nothing
        // else. This line is §6.5's "the other instance is unaffected".
        const probed = await probe(http, deadline(probeBudget, SERVING_PROBE_TIMEOUT_MS), env, probeBudget);
        // ⚠ 10b-S-G: every `llama-env`/`llama-health`/`llama-models` entry this instance's
        // own read and probe produced is about THIS instance — attached here, once, from
        // the `instance` this closure already runs under, never guessed from the message.
        const rowErrors = [...envErrors, ...probed.errors].map((e) => ({ ...e, instance }));
        return { instance, env, probed, errors: rowErrors };
      }),
    ),
  ]);

  const serving: ServingInstance[] = rows.map(({ instance, env, probed }) => ({
    instance,
    port: env.port,
    // §6.4's join key, derived from the index. The two are never matched by string.
    unitState: units.states.get(servingUnitName(instance)) ?? null,
    model: probed.model,
    ctx: env.ctx,
    health: probed.health,
  }));

  for (const row of rows) errors.push(...row.errors);
  errors.push(...units.errors);
  return { serving, errors };
};
