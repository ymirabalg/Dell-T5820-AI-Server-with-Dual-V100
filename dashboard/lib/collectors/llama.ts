/**
 * §3.4's pure half: instance discovery, the env file, and what the two HTTP answers mean.
 *
 * Text in, typed values out. No IO, no paths, nothing thrown — `serving.ts` fetches the
 * bytes and tags each failure with the right one of §3.7's three sources (`llama-env`,
 * `llama-health`, `llama-models`), which is knowledge a parser is deliberately denied.
 *
 * ⚠ **Instances are discovered, never hard-coded.** §3.4: *"enumerate
 * `/etc/llama-server/*.env`. Today that is 0 and 1; a third card must appear without a code
 * change."* {@link discoverInstances} is a pure function of a directory listing, so "a
 * third card appears" is a fixture, not a deployment.
 */

import type { HealthState, Port, Tokens } from '../types';
import { port, tokens } from '../types';
import { compareInstances, isInstanceId } from '../units';
import { lines, parseIntegerStrict, parseText } from './numbers';
import { clean } from './result';
import type { ParseResult } from './result';

/** §3.4's discovery glob, as a suffix. */
export const LLAMA_ENV_SUFFIX = '.env';

/** §3.4 fixes the probe host: the endpoints are read from the box itself, over loopback. */
export const LLAMA_PROBE_HOST = '127.0.0.1';

/** The lowest and highest a TCP port can be. Not a spec number — a protocol one. */
export const MIN_PORT = 1;
export const MAX_PORT = 65535;

/** `GET http://127.0.0.1:PORT/health` (§3.4). */
export const healthUrl = (value: Port): string => `http://${LLAMA_PROBE_HOST}:${String(value)}/health`;
/** `GET http://127.0.0.1:PORT/v1/models` (§3.4). */
export const modelsUrl = (value: Port): string => `http://${LLAMA_PROBE_HOST}:${String(value)}/v1/models`;

/**
 * ⚠⚠ **12c — `<id>.env` → `id`, or `null` for a filename that is not an instance.**
 *
 * The identity is now a **string**: `serving-mode.sh` writes `/etc/llama-server/split.env`,
 * and the bare-integer rule this function used to enforce rejected it outright — so split mode
 * could not be rendered at all, on any box, however healthy.
 *
 * The rule is {@link isInstanceId}, in `lib/units.ts` — **the same predicate `wire.ts` applies
 * to a wire value**, so what a filename may say and what a server may say are one rule and not
 * two that agree today. It refuses `0.env.bak.2026-09-04` (dots), `1 .env` (a space), `.env`
 * (empty) and `01.env` (a non-canonical numeral) exactly as the integer rule did, and admits
 * `split`.
 */
export const parseInstanceId = (filename: string): string | null => {
  if (!filename.endsWith(LLAMA_ENV_SUFFIX)) return null;
  const stem = filename.slice(0, -LLAMA_ENV_SUFFIX.length);
  return isInstanceId(stem) ? stem : null;
};

/**
 * A directory listing → the instances it declares, **in {@link compareInstances}' order**.
 *
 * ⚠⚠ **12c — the order is SPECIFIED, not inherited.** This function used to end in
 * `sort((a, b) => a - b)`, which was quietly doing two jobs: presenting §6.2's rows in an
 * order a human reads, and fixing which instance wins §6.2's join when two of them claim one
 * card. A numeric subtraction has no string equivalent, so the rule is written out in
 * `lib/units.ts` and imported — see {@link compareInstances} for the rule, and for why the
 * result is a function of the SET of identities rather than of the listing order.
 *
 * Non-`.env` entries are ignored silently — they are not claims about an instance. A `.env`
 * file whose stem is *not* a legal identity is reported, because it sits in the directory §3.4
 * says holds instances and looks like one.
 *
 * ⚠ **`default.env` is now an INSTANCE, and that is the ruling rather than a regression.**
 * `LLAMA_SERVER_ENTRIES_NOISY` asserted it rejected; §3.4's 2026-09-17 ruling accepts named
 * instances and `default.env` has exactly the shape of `split.env`. It gets **no unit name**
 * — `servingUnitName` returns `null` for it — which `collectServing` turns into a loud
 * `errors[]` entry rather than a silent misread, which is the whole point of the mapping.
 */
export const discoverInstances = (entries: readonly string[]): ParseResult<string[]> => {
  const problems: string[] = [];
  const found = new Set<string>();
  for (const entry of entries) {
    if (!entry.endsWith(LLAMA_ENV_SUFFIX)) continue;
    const id = parseInstanceId(entry);
    if (id === null) {
      problems.push(`\`${entry}\` is not \`<instance>${LLAMA_ENV_SUFFIX}\` and was not treated as an instance`);
      continue;
    }
    found.add(id);
  }
  return { value: [...found].sort(compareInstances), problems };
};

/** The two fields §3.4 takes from `/etc/llama-server/<i>.env`. */
export interface LlamaEnv {
  readonly port: Port | null;
  readonly ctx: Tokens | null;
}

/** Neither field read. The value returned whenever the env file could not be parsed. */
export const NO_LLAMA_ENV: LlamaEnv = { port: null, ctx: null };

/**
 * `KEY=VALUE` lines → a map. Comments and blank lines are skipped; **the last assignment
 * to a key wins**, which is what systemd's `EnvironmentFile` does and therefore what the
 * running `llama-server@N` itself sees.
 *
 * Surrounding single or double quotes are stripped, again matching systemd. That is
 * leniency about *framing* only — the value inside is still parsed strictly, so
 * `PORT="abc"` is `null` and not `0`.
 */
const assignments = (text: string): Map<string, string> => {
  const found = new Map<string, string>();
  for (const line of lines(text)) {
    const trimmed = line.trim();
    // Belt-and-braces, as in `safety-checks.ts`: a comment containing `=` would otherwise
    // become a key like `#PORT`, which no lookup asks for. Stated, not relied on.
    if (trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at <= 0) continue;
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    found.set(key, value);
  }
  return found;
};

/**
 * Read one field, distinguishing §6.7's three outcomes, which have three different
 * consequences:
 *
 * | outcome | value | `errors[]` |
 * |---|---|---|
 * | absent | `null` | **yes** — the file is not what §3.4 describes |
 * | present, not a number | `null` | **yes** — "reserve `errors[]` for reads that failed", and a junk value is a failed read of that field |
 * | present, a number outside its range | `null` | **no** — §6.7: "An out-of-range reading carries no `errors[]` entry either" |
 */
const numericField = (
  found: Map<string, string>,
  key: string,
  low: number,
  high: number,
  problems: string[],
): number | null => {
  const raw = found.get(key);
  if (parseText(raw) === null) {
    problems.push(`no \`${key}=\` assignment`);
    return null;
  }
  const value = parseIntegerStrict(raw);
  if (value === null) {
    problems.push(`\`${key}=${String(raw)}\` is not an integer`);
    return null;
  }
  // Out of range: §6.7 — `null`, and deliberately no entry.
  return value >= low && value <= high ? value : null;
};

/**
 * Parse `/etc/llama-server/<i>.env` for `PORT=` and `CTX=` (§3.4).
 *
 * `MODEL`, `ALIAS`, `FA` and `SPEC` are present in the real file and are **not** read:
 * §3.4 takes `model` from `/v1/models`, which reports what the process actually loaded
 * rather than what its config file asks for. On this box those agree; the point of the
 * distinction is the poll where they do not — during a `set-model` rollback, for instance.
 */
export const parseLlamaEnv = (text: string): ParseResult<LlamaEnv> => {
  const problems: string[] = [];
  const found = assignments(text);
  const portValue = numericField(found, 'PORT', MIN_PORT, MAX_PORT, problems);
  // §6.6 renders `CTX` as a token count; 0 tokens is not a context, so 1 is the floor.
  const ctxValue = numericField(found, 'CTX', 1, Number.MAX_SAFE_INTEGER, problems);
  return {
    value: { port: portValue === null ? null : port(portValue), ctx: ctxValue === null ? null : tokens(ctxValue) },
    problems,
  };
};

/** The environment key §3.4's `gpus` is read from. Spelled once. */
export const CUDA_VISIBLE_DEVICES = 'CUDA_VISIBLE_DEVICES';

/**
 * A unit's `Environment=` directives → §3.4's `gpus`.
 *
 * The input is exactly what `org.freedesktop.systemd1.Service`'s `Environment` property
 * answers: `KEY=VALUE` strings, already specifier-expanded, so `llama-server@0.service` says
 * `CUDA_VISIBLE_DEVICES=0` and the split unit says `CUDA_VISIBLE_DEVICES=0,1`.
 *
 * | input | value | `problems` |
 * |---|---|---|
 * | `['CUDA_VISIBLE_DEVICES=0']` | `[0]` | — |
 * | `['CUDA_VISIBLE_DEVICES=1,0']` | `[0, 1]` | — (see the ordering note) |
 * | `['CUDA_VISIBLE_DEVICES=']` | `[]` | — |
 * | no such key | `null` | **yes** |
 * | `CUDA_VISIBLE_DEVICES=GPU-3f2b…` | `null` | **yes** |
 *
 * ⚠ **The LAST assignment wins**, matching what systemd itself does with repeated
 * `Environment=` lines and therefore what the running process actually sees — the same rule
 * {@link parseLlamaEnv}'s `assignments` already applies to the env file.
 *
 * ⚠ **An unparseable entry makes the WHOLE list `null`, never a partial one.** `nvidia-smi`'s
 * UUID form (`CUDA_VISIBLE_DEVICES=GPU-3f2b…`) and MIG identifiers are both legal for CUDA and
 * neither is a card index this dashboard can join on; returning the indices we *did*
 * understand would put a card under "served by instance N" on the strength of a list we
 * admit we could not read. §3.4's `null` is exactly that state, and it renders an em dash
 * with the entry beside it.
 *
 * ⚠ **`[]` is a value, not a failure.** `CUDA_VISIBLE_DEVICES=` is how CUDA is told *no
 * device is visible*; the unit exists, the property was read, and the answer is "this
 * instance serves no card". §3.1's `null` ≠ `[]` discipline, at the level below it.
 *
 * ⚠ **Sorted ascending and de-duplicated, and that discards something on purpose.**
 * `CUDA_VISIBLE_DEVICES=1,0` makes the process see card 1 as its *device 0* — an ordering the
 * dashboard neither renders nor joins on, since §6.2 asks only *which cards does this
 * instance serve*. Sorting makes `1,0` and `0,1` one rendering instead of two, and a repeated
 * index is reported rather than counted twice.
 */
export const parseVisibleDevices = (environment: readonly string[]): ParseResult<number[] | null> => {
  const problems: string[] = [];
  let raw: string | null = null;
  for (const entry of environment) {
    const at = entry.indexOf('=');
    if (at <= 0) continue;
    if (entry.slice(0, at) !== CUDA_VISIBLE_DEVICES) continue;
    raw = entry.slice(at + 1);
  }
  if (raw === null) {
    return {
      value: null,
      problems: [`the unit declares no \`${CUDA_VISIBLE_DEVICES}=\`, so which cards it serves is unknown`],
    };
  }
  if (raw.trim() === '') return { value: [], problems };

  // ⚠ Named `cards`, not `found`: `discoverInstances` above has a `found` of its own and the
  // two functions end in the same line of code. One mutation anchor in step 5's harness
  // (`05-L2`) matched both the moment this function was written, and an anchor that matches
  // twice is a mutation that silently tests whichever site comes first.
  const cards = new Set<number>();
  for (const piece of raw.split(',')) {
    const text = piece.trim();
    const index = parseIntegerStrict(text);
    // ⚠ Canonical decimal only, exactly as `parseInstanceIndex` insists: `01` and `+1` are
    // refused rather than read as 1, because this value is compared against `Gpu.index` and
    // two spellings of one card would be two answers to "which instance lists me".
    if (index === null || index < 0 || String(index) !== text) {
      return {
        value: null,
        problems: [
          `\`${CUDA_VISIBLE_DEVICES}=${raw}\` is not a list of card indices ` +
            `(\`${text}\` is not one), so which cards this instance serves cannot be read`,
        ],
      };
    }
    if (cards.has(index)) problems.push(`\`${CUDA_VISIBLE_DEVICES}=${raw}\` names card ${text} more than once`);
    cards.add(index);
  }
  return { value: [...cards].sort((a, b) => a - b), problems };
};

/**
 * HTTP status → §3.7's `HealthState`.
 *
 * | status | value | entry |
 * |---|---|---|
 * | `200` | `ok` | no |
 * | `503` | `unhealthy` | **no** — llama.cpp answers 503 for *every* endpoint while a model loads. It is the normal state during a restart, not a fault to report |
 * | anything else answered | `unhealthy` | yes |
 *
 * ⚠ **A status is never `unreachable`.** §3.7 reserves that for "connection refused, reset,
 * or timed out" — cases where nothing answered. A server that answers 404 has been reached;
 * calling it unreachable would band an alarm (§6.3) on a live process and point the reader
 * at the network instead of at the port number.
 *
 * Confirmed against this build's own source, 2026-09-06: `middleware_server_state` in
 * `tools/server/server-http.cpp` sets `res.status = 503` with body `{"error":{"message":
 * "Loading model", …}}` for every path while `is_ready` is false. That closes O15, and it
 * is also why {@link parseModelsBody} must never be handed a non-200 body.
 */
export const healthFromStatus = (status: number): ParseResult<HealthState> => {
  if (status === 200) return clean<HealthState>('ok');
  if (status === 503) return clean<HealthState>('unhealthy');
  return { value: 'unhealthy', problems: [`answered HTTP ${String(status)}`] };
};

/**
 * `GET /v1/models` → the model alias.
 *
 * The OpenAI-compatible `data[0].id` is the single source. llama.cpp also emits a
 * `models[0].name` carrying the identical string; reading both would be a hedge that hides
 * a change in either.
 *
 * ⚠ **Only ever called on a 200.** A 503 body is `{"error":{…}}` — it has no `data`, so
 * feeding it here would produce "the model list did not parse", an `llama-models` entry
 * blaming the model list for a server that is simply still loading.
 *
 * ⚠ A list with more than one model is reported. `ServingInstance.model` is a single
 * `string | null` (§3.4), so a multi-model server is a state the contract cannot express;
 * the first entry is shown and the discrepancy is named rather than hidden. Raised as a
 * spec gap.
 */
export const parseModelsBody = (text: string): ParseResult<string | null> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { value: null, problems: [`not JSON: ${e instanceof Error ? e.message : 'parse failed'}`] };
  }
  if (typeof parsed !== 'object' || parsed === null) return { value: null, problems: ['not a JSON object'] };
  const data = (parsed as { readonly data?: unknown }).data;
  if (!Array.isArray(data)) return { value: null, problems: ['no `data` array'] };
  const problems: string[] = [];
  if (data.length > 1) problems.push(`\`data\` lists ${String(data.length)} models; showing the first`);
  const first: unknown = data[0];
  if (typeof first !== 'object' || first === null) {
    // ⚠ Two different bodies reach here and the message must not conflate them: `data: []`
    // is an empty list, `data: [null]` is a list whose first entry is not an object. The
    // second used to be reported as "`data` is empty", which sends the reader looking for a
    // model that is not loaded when the server in fact answered with a malformed entry.
    problems.push(data.length === 0 ? '`data` is empty' : '`data[0]` is not an object');
    return { value: null, problems };
  }
  // ⚠ `typeof` first, then `parseText`. A JSON `id` of `5` is not a string, and casting a
  // number into `parseText` would call `.trim()` on it — a throw from a module whose whole
  // contract is that it does not throw, reached from a body a stranger on the port controls.
  const rawId: unknown = (first as { readonly id?: unknown }).id;
  const id = typeof rawId === 'string' ? parseText(rawId) : null;
  if (id === null) problems.push('`data[0].id` is missing, empty, or not a string');
  return { value: id, problems };
};
