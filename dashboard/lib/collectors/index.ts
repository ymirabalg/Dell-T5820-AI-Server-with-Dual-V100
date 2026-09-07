/**
 * Step 3's public surface — GPU and host collectors (§3.1, §3.2, and §3.5's network half).
 *
 * The split every consumer should know about:
 *
 * - **Parsers** (`nvidia-smi.ts`, `proc.ts`, `deltas.ts`) are pure. Text in, typed values
 *   out, nothing thrown, no IO. They are where the tests live.
 * - **Wrappers** (`collect.ts`) fetch bytes through the injectable {@link CollectorIo} and
 *   turn any failure into an `errors[]` entry. `collectGpus` and `collectHost` are what a
 *   route calls.
 *
 * Step 4 added §3.3's cooling side on the same split: `dell-smm.ts` is pure, `cooling.ts`
 * is the wrapper, and `hwmon.ts` is the node walk both it and `collectCpuTemp` need.
 *
 * Deliberately absent: `statvfs`, D-Bus, `/health`, ufw and DKMS (step 5), the snapshot
 * assembly and the 2 s cache (step 6).
 *
 * ⚠ **`collectCooling` never reads D-Bus**, so the `Cooling` it returns carries
 * `serviceState: null`. O9 makes `cooling.serviceState` and `safety.fanServiceState` one
 * read rendered in two panels; step 5 takes it and step 6 writes it to both, through
 * {@link withServiceState}.
 */

export { NVIDIA_SMI_ARGS, NVIDIA_SMI_FIELDS, parseNvidiaSmiCsv } from './nvidia-smi';
/**
 * ⚠ **`parseKernelRelease` is exported, tested, and called by NOTHING.** It parses
 * `/proc/version`, which §3.2 permits as an alternative to `uname` — but §3.7's
 * `ErrorSource` vocabulary is closed at eighteen names and **has no member for
 * `/proc/version`**, so a failed read of it cannot be reported without inventing one, which
 * invariant 7 forbids. `Host.kernel` therefore comes from `os.release()`, which cannot fail.
 *
 * It is kept as a tested hedge, not as an invitation. A later step that reaches for it is
 * choosing a source it cannot report a failure against; raise the vocabulary gap first.
 */
export {
  PACKAGE_LABEL,
  parseCpuinfo,
  parseHostname,
  parseKernelRelease,
  parseLoadavg,
  parseMeminfo,
  parseNetDev,
  parseOperstate,
  parsePackageTempC,
  parseProcStat,
  parseUptime,
} from './proc';
export type { CpuInfo, CpuTimes, MemInfo, NetCounters } from './proc';
export { NO_DELTAS, advanceDeltas, cpuPctBetween, netRatesBetween } from './deltas';
export type { DeltaReadings, DeltaSample } from './deltas';
export {
  CORETEMP_NAME,
  DEFAULT_INTERFACE,
  DEFAULT_PATHS,
  HOME_MOUNT_KEY,
  ROOT_MOUNT_KEY,
  pathsFrom,
  collectCpuTemp,
  collectGpus,
  collectHost,
} from './collect';
export type {
  CollectCpuTempOptions,
  CollectGpusOptions,
  CollectHostOptions,
  CollectorPaths,
  GpuCollection,
  HostCollection,
} from './collect';
export { NVIDIA_SMI_TIMEOUT_MS, nodeIo } from './io';
export type { CollectorIo } from './io';
export { clean } from './result';
export type { ParseResult } from './result';
export {
  fields,
  isNotAReading,
  lines,
  parseCounter,
  parseDecimalStrict,
  parseIntegerStrict,
  parseText,
} from './numbers';

// --------------------------------------------------------------- step 4, §3.3 cooling
export { errnoCodeOf, reason, tag } from './errors';
/**
 * ⚠ **Step 5 bounds D-Bus, `/health`, `/v1/models` and `statvfs` — call `deadline` for
 * each, do not copy `cooling.ts`.** `CollectorIo` bounds `run` only (O17), and the two
 * properties this module carries are the ones a hand-rolled bound gets wrong: a
 * **monotonic** clock (a `Date.now()` deadline grew to an hour under a backward NTP step)
 * and a **validated** budget (`setTimeout` turns an out-of-range delay into 1 ms).
 */
export { MAX_TIMEOUT_MS, boundedReader, boundedTimeoutMs, deadline } from './deadline';
export type { Within } from './deadline';
export { HWMON_NAME_FILE } from './hwmon';
export { describeHwmonMiss, findHwmonNode } from './hwmon';
export type { HwmonLookup, HwmonNodeFound, HwmonNodeMissing, HwmonReader } from './hwmon';
export {
  DELL_SMM_NAME,
  FAN_CHANNELS,
  NO_FANS,
  PWM5_EC_AUTO_ERRNO,
  PWM5_FILE,
  ch5ModeFrom,
  classifyPwm5Read,
  coolingFrom,
  fanInputFile,
  parseDellSmmFans,
  pwm5PresentFrom,
  withServiceState,
} from './dell-smm';
export type { FanReadings, Pwm5Probe, Pwm5Read } from './dell-smm';
export { DELL_SMM_TIMEOUT_MS, collectCooling } from './cooling';
export type { CollectCoolingOptions, CoolingCollection } from './cooling';

// ------------------------------- step 5, §3.4 serving · §3.5 disk · §3.6 safety
/**
 * ⚠ **The three new seams are separate from {@link CollectorIo}, on purpose.** A socket, an
 * HTTP client and `statvfs` are not "the contents of a path", and widening `CollectorIo`
 * would have turned ten object-literal fakes in steps 3 and 4 red for a change with nothing
 * to do with them. Each collector takes the seams it needs and nothing else.
 *
 * ⚠ **All three seams bound their own work AND close their own handle.** `CollectorIo.run`
 * aborts, destroys both pipes and `unref()`s; `HttpIo.get` destroys its request; and
 * `DbusIo.connect` takes a `timeoutMs` and destroys its socket. The shared `deadline()`
 * settles the *promise* — only the seam can release the resource, and each of the three was
 * separately found not doing it. All three delays go through `boundedTimeoutMs`, which
 * `lib/guardrails.test.ts` asserts over the source text.
 *
 * ⚠ **`collectStorage` and `collectSafety` return their readings NESTED**, under
 * `filesystems` and `checks`. Step 6 destructures; it must not spread the whole collection
 * into a `Storage`/`Safety`, which typechecks and ships `errors` onto the wire.
 */
export { nodeHttp, HTTP_MAX_BODY_BYTES, HTTP_TIMEOUT_MS } from './http';
export type { HttpIo, HttpResponse } from './http';
export {
  DBUS_AUTH_BEGIN,
  DBUS_AUTH_NUL,
  DBUS_BIG_ENDIAN,
  DBUS_HEADER_BYTES,
  DBUS_HEADER_FIELD,
  DBUS_LITTLE_ENDIAN,
  DBUS_MAX_FIELDS_BYTES,
  DBUS_MAX_MESSAGE_BYTES,
  DBUS_MESSAGE_TYPE,
  DBUS_PROTOCOL_VERSION,
  authExternalLine,
  classifyAuthReply,
  decodeMessage,
  encodeMethodCall,
  hexAscii,
} from './dbus-wire';
export type { DbusAuthReply, DbusDecode, DbusMessage, DbusMethodCall } from './dbus-wire';
export {
  ACTIVE_STATE_PROPERTY,
  DBUS_TIMEOUT_MS,
  FAN_SERVICE_UNIT,
  NO_SUCH_UNIT_ERROR,
  NO_SUCH_UNIT_STATE,
  PROPERTIES_IFACE,
  SYSTEMD_DESTINATION,
  SYSTEMD_MANAGER_IFACE,
  SYSTEMD_MANAGER_PATH,
  SYSTEMD_UNIT_IFACE,
  asUnitState,
  collectUnitStates,
  nodeDbus,
  servingUnitName,
} from './dbus';
export type { CollectUnitStatesOptions, DbusIo, DbusStream, UnitStateCollection } from './dbus';
export {
  LLAMA_ENV_SUFFIX,
  LLAMA_PROBE_HOST,
  MAX_PORT,
  MIN_PORT,
  NO_LLAMA_ENV,
  discoverInstances,
  healthFromStatus,
  healthUrl,
  modelsUrl,
  parseInstanceIndex,
  parseLlamaEnv,
  parseModelsBody,
} from './llama';
export type { LlamaEnv } from './llama';
export { SERVING_DISCOVERY_TIMEOUT_MS, SERVING_PROBE_TIMEOUT_MS, collectServing } from './serving';
export type { CollectServingOptions, ServingCollection } from './serving';
export { BYTES_PER_GIB, NO_FILESYSTEM, filesystemFrom, nodeStatvfs } from './statvfs';
export type { StatvfsBlocks, StatvfsIo } from './statvfs';
export { STATVFS_TIMEOUT_MS, collectStorage } from './storage';
export type { CollectStorageOptions, Filesystems, StorageCollection } from './storage';
export {
  DKMS_MODULE_PREFIX,
  DKMS_SUBPATH,
  UFW_ENABLED_KEY,
  dkmsPresentFrom,
  parseUfwConf,
} from './safety-checks';
export { SAFETY_TIMEOUT_MS, collectSafety } from './safety';
export type { CollectSafetyOptions, SafetyChecks, SafetyCollection } from './safety';
