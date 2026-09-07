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
 * `<i>.env` → `i`, or `null` for a filename that is not an instance.
 *
 * ⚠ Canonical decimal only. `01.env` and `+1.env` are rejected rather than read as 1,
 * because §6.4 fixes the condition subject as a **bare integer** (`health:1`) and two
 * filenames mapping to one subject would make two rows share one condition id — which §9
 * resolves by *deduplicating*, so one of the two instances would silently vanish from the
 * header count.
 */
export const parseInstanceIndex = (filename: string): number | null => {
  if (!filename.endsWith(LLAMA_ENV_SUFFIX)) return null;
  const stem = filename.slice(0, -LLAMA_ENV_SUFFIX.length);
  const value = parseIntegerStrict(stem);
  if (value === null || value < 0) return null;
  return String(value) === stem ? value : null;
};

/**
 * A directory listing → the instances it declares, ascending.
 *
 * Sorted **numerically**, not by filename: a tenth card would list as `10.env` between
 * `0.env` and `1.env`, and §6.2's SERVING panel is one row per instance in an order a human
 * reads. Non-`.env` entries are ignored silently — they are not claims about an instance.
 * A `.env` file whose stem is *not* an instance index is reported, because it sits in the
 * directory §3.4 says holds instances and looks like one.
 */
export const discoverInstances = (entries: readonly string[]): ParseResult<number[]> => {
  const problems: string[] = [];
  const found = new Set<number>();
  for (const entry of entries) {
    if (!entry.endsWith(LLAMA_ENV_SUFFIX)) continue;
    const index = parseInstanceIndex(entry);
    if (index === null) {
      problems.push(`\`${entry}\` is not \`<instance>${LLAMA_ENV_SUFFIX}\` and was not treated as an instance`);
      continue;
    }
    found.add(index);
  }
  return { value: [...found].sort((a, b) => a - b), problems };
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
