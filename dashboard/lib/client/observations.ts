/**
 * **O11 — `conditionsFrom(snapshot)` is ONE function**, and it is what both §6.4's banner
 * and §6.4's event log are computed from.
 *
 * HANDOVER states the obligation and the reason: two extractions would let the banner and
 * the log disagree about the same machine, and §9 says "Reducing over `displaySeverity` is
 * what keeps the dot, the count and the banner from ever disagreeing". So there is one
 * projection from a snapshot to §6.4's conditions, it produces {@link ConditionObservation}s
 * carrying **raw** per-poll bands, and everything downstream goes through `observePoll` —
 * which is where the debounce, the ledger and the standing rule live (`lib/conditions.ts`).
 *
 * ### Rules this file has to keep, each of which is a hole somewhere else
 *
 * - **O12 / §6.3: a reading with no band produces no observation.** Every `severity*`
 *   function that can answer `null` means *this row does not apply* — `health: null` is "not
 *   probed this cycle", `fan5_engaged` in `ec-auto` is "the engaged band applies ONLY while
 *   engaged". Minting `normal` for any of them would assert health nobody measured.
 * - **O3 / §6.4: one reading, one condition.** Channel 5's zero is carried by
 *   `fan5_absolute` and is never a `fan_stopped` subject, so `fan_stopped` covers channels
 *   1–4 only.
 * - **§9: one fact, counted once.** `gpu-fan-control.service` is rendered in both COOLING and
 *   SAFETY, so it is emitted **twice** here — once from `cooling.serviceState`, once from
 *   `safety.fanServiceState` — and `observePoll` deduplicates by id. That is not sloppiness:
 *   O9 makes those two fields *one* D-Bus read written to both, so they cannot disagree, and
 *   emitting from both panels is what proves the dedupe is doing its job rather than the
 *   projection quietly doing it instead.
 * - **§6.4: the join key is `llama-server@<i>.service`, derived from the index.** From
 *   `lib/units.ts`, which is the one place either unit name is spelled.
 * - **`gpus: null` and `serving: null` are not `[]`.** No GPUs enumerated means no GPU
 *   conditions — not two healthy cards. And the difference outlives the poll: it is what
 *   {@link enumerationsRead} reports, and it is what lets §9 tell a card that **left** from a
 *   card we **stopped being able to see**.
 *
 * ### ⚠ This is NOT a panel surface
 *
 * `conditionsFrom` is deliberately **un-deduplicated** — `unit:gpu-fan-control.service` comes
 * out twice, once from COOLING and once from SAFETY, and §9's reduction is what collapses
 * them. A panel that mapped this output to rows would render the fan service twice and count
 * two alarms for one fault, which is the outcome §9 forbids by name. **The panel surface is
 * `RuntimeState.displayed`**, which is `observePoll`'s output: deduplicated, debounced, with
 * standing applied and stale conditions carried. A cell's *colour* is neither — §6.4 says it
 * comes from `lib/severity.ts` on the current reading, undebounced.
 *
 * ### Labels and values
 *
 * ⚠ §6.4 fixes the condition **ids**; it does not fix the label or the rendered value, and
 * `MOCK.html`'s event log is a reference rather than a source. The strings below follow the
 * mock's spelling (`fan 5`, `gpu-fan-control.service`, `llama-server@1`) and every value
 * goes through `lib/format.ts`, so invariant 1's `—`-not-`0` law is applied once, where it
 * is tested. Recorded in the step notes as copy this step chose.
 */

import { EM_DASH, formatCelsius, formatCh5Pwm, formatGiB, formatMiBPair, formatRpm, formatSwapGiB, formatText } from '../format';
import type {
  ConditionKind,
  ConditionObservation,
  EnumerationMembership,
  EnumerationRead,
  EnumerationsRead,
} from '../conditions';
import { observation } from '../conditions';
import {
  severityCpuTemp,
  severityDiskFree,
  severityDkms,
  severityFan5Absolute,
  severityFan5Engaged,
  severityFanStopped,
  severityGpuTemp,
  severityHealth,
  severityLink,
  severityMemory,
  severityPwm5Present,
  severityThrottle,
  severityUfw,
  severityUnitState,
  severityVram,
} from '../severity';
import type {
  CoolingChannels,
  ErrorSource,
  Rpm,
  ServingInstance,
  TelemetryError,
  TelemetrySnapshot,
} from '../types';
import { FAN_SERVICE_UNIT, compareInstances, servingUnitLabel, servingUnitName } from '../units';
// ⚠ Type-only, and the direction is one-way: `wire.ts` imports nothing from this module, so
// the seam that produces a `ServingEnumeration` and the two functions that consume one cannot
// become a cycle. `wire.ts` has no `node:` imports either — see its own header.
import type { ServingEnumeration } from './wire';

/**
 * §4's two enumerated collections, named once.
 *
 * These are the only two members of a snapshot whose *membership* can change — a card is
 * pulled, an instance is removed — and therefore the only two that can ever retire a
 * condition (§9). Every other reading either has a value or is `null`; nothing enumerates
 * `ufw_enforcing` or `unit:gpu-fan-control.service`, so those can only ever go **stale**.
 */
export const GPU_ENUMERATION = 'gpus';

/** §4's other enumerated collection. See {@link GPU_ENUMERATION}. */
export const SERVING_ENUMERATION = 'serving';

/**
 * ⚠ 12d — the ordinary case: this collection was read and **nothing** in it is held back from
 * retirement. Frozen and shared, because it is the value almost every poll produces.
 */
const NOTHING_HELD_BACK: ReadonlySet<string> = new Set<string>();

/**
 * ⚠⚠ **12d/RECONCILE — the membership this poll SAW, spelled the way the projection spells it.**
 *
 * §9 row 2 retires a subject only when the collection *"was read successfully **and it was not
 * in it**"*, and these two expressions are the *"in it"*. They are deliberately the same
 * expressions {@link conditionsFrom} passes as {@link EnumerationMembership.member} —
 * `String(gpu.index)` and `instance.instance` — because the comparison is only meaningful
 * while the two spellings agree, and reading them off the **same arrays** `conditionsFrom`
 * walks (`snapshot.gpus`, `snapshot.serving`) is what makes that structural rather than a
 * convention two files have to keep.
 */
const gpuMembersOf = (snapshot: TelemetrySnapshot): ReadonlySet<string> =>
  new Set((snapshot.gpus ?? []).map((gpu) => String(gpu.index)));

/** {@link gpuMembersOf}, for §4's other enumerated collection. */
const servingMembersOf = (snapshot: TelemetrySnapshot): ReadonlySet<string> =>
  new Set((snapshot.serving ?? []).map((instance) => instance.instance));

/**
 * Which enumerations this poll **read** — §9's evidence that a subject has left rather than
 * merely stopped answering — and, ⚠ 12d, what it saw in each: the members that were IN it and
 * the members whose row this client refused. {@link EnumerationRead} carries both, and §9
 * retires only a subject that is in neither.
 *
 * ⚠ `null` is not `[]`, and this is where the whole cost of keeping them apart is repaid:
 * `gpus: null` means *we could not enumerate*, so a card that was at 90 °C keeps its alarm;
 * `gpus: []` means *we enumerated and there are none*, so it is gone and the alarm goes with
 * it. §3.1 spends a paragraph on the distinction and §9 says "this is what it is for".
 */
export const enumerationsRead = (
  snapshot: TelemetrySnapshot,
  /**
   * ⚠⚠ **12c — §4's `serving[]` as this client HAS it, and the enumeration is NOT read when
   * part of it was refused.**
   *
   * §3.4's second ruling of 2026-09-17 drops an invalid `serving[]` row and renders the rest,
   * so `serving[]` can now be **shorter than what the server sent**. A subject missing from an
   * enumeration that was read is §9's *retired* — *it has left the machine* — and that verdict
   * was being minted out of a validation failure: measured on `servingPopulated` with both rows
   * refused, all four serving conditions retired at the ten-second debounce and the `alarm` on
   * instance 1 left the ledger, the dot and the count with them.
   *
   * A refused row is *not read*, which is precisely what `serving: null` already means here, so
   * the conditions go **stale** — keeping their band, still counted — instead. `wire.ts` carries
   * the count structurally rather than leaving it to be recovered from a message.
   *
   * ⚠⚠ **12d SUPERSEDES the paragraph below — one refusal no longer suppresses the whole
   * enumeration unless it has to.** §9's ruling of 2026-09-22: *a partial read retires what it
   * can*. 12c's all-or-nothing was safe and unbounded — an instance that genuinely left the
   * machine kept its alarm in the count indefinitely because an unrelated row failed
   * validation, measured still there at 20 minutes. The rule is now per subject and turns on
   * whether the refused row's own `instance` parsed; the sentence below is exactly right about
   * the case where it did **not**, and that case is still all-or-nothing.
   *
   * ⚠ **One refusal suppresses the WHOLE enumeration, and that is not laziness.** A refused row
   * may have been refused *for its `instance`*, so there is no identity to exclude: the client
   * cannot know which subjects it failed to read, only that it failed to read some.
   *
   * ⚠⚠ **REQUIRED, and 12c/RECONCILE is why.** It arrived as `servingRowsRefused = 0`, which
   * defaults the **unsafe** way: `0` asserts *the enumeration WAS read*, so a call site that
   * had not been updated retired an instance for a validation failure — the exact defect the
   * argument exists to close (`12c-A5`). Its doc claimed the opposite by analogy with
   * `PollOptions.enumerationsRead`, which defaults to the EMPTY set and therefore retires
   * NOTHING; the two point in opposite directions. There is now no default to get wrong, and
   * the value is a {@link ServingEnumeration} rather than a number so the same fact answers
   * §6.2's join (`servedBy`) and this ledger from one place.
   */
  serving: ServingEnumeration,
): EnumerationsRead => {
  const read = new Map<string, EnumerationRead>();
  // ⚠ `gpus[]` has no row-level refusal — `wire.ts` argues at length why `serving[]` is the one
  // array whose members may be dropped — so a `gpus` that was read holds nothing back.
  if (snapshot.gpus !== null) {
    read.set(GPU_ENUMERATION, { members: gpuMembersOf(snapshot), held: NOTHING_HELD_BACK });
  }
  if (serving.read === 'all') {
    read.set(SERVING_ENUMERATION, { members: servingMembersOf(snapshot), held: NOTHING_HELD_BACK });
  }
  if (serving.read === 'partial') {
    // ⚠⚠ 12d / §9's ruling of 2026-09-22 — the two branches, and the second is the one that
    // must not be optimised away.
    //
    // Every refused row named its subject → the enumeration IS read, and exactly those
    // subjects are held back. An instance that genuinely left the machine retires on this
    // poll like any other, which is what the first cut could not do.
    //
    // Any refused row named NOBODY (`null`) → we cannot tell who is missing, so no subject may
    // be shown absent and the key is not added at all. That is the same suppression 12c
    // shipped, now confined to the case that actually warrants it.
    const held = new Set<string>();
    let anonymous = false;
    for (const identity of serving.refused) {
      if (identity === null) anonymous = true;
      else held.add(identity);
    }
    if (!anonymous) read.set(SERVING_ENUMERATION, { members: servingMembersOf(snapshot), held });
  }
  return read;
};

/**
 * Whether a kind's **rendered value** is drawn from a closed vocabulary, and is therefore
 * itself a band the event log can debounce and log a transition of.
 *
 * §6.4's event log shows `llama-server@1  active` and `throttle 0x4 → 0x24` — transitions of
 * a *state*, not of a severity band. `active → reloading` is `normal → normal` and would be
 * invisible to a log keyed on severity alone, yet it is exactly what that column is for. A
 * continuous metric has no such vocabulary: its value changes every poll, so its band is its
 * §6.3 severity and nothing else.
 *
 * A `Record<ConditionKind, boolean>` rather than a list, so a kind added to §6.4's table
 * without a decision here is a compile error.
 */
export const VALUE_IS_A_BAND: Readonly<Record<ConditionKind, boolean>> = {
  gpu_temp: false,
  gpu_throttle: true,
  gpu_vram: false,
  disk_free: false,
  unit: true,
  health: true,
  fan_stopped: false,
  cpu_temp: false,
  ram: false,
  fan5_engaged: false,
  fan5_absolute: false,
  ufw_enforcing: true,
  pwm5_present: true,
  dkms_for_running_kernel: true,
  link: true,
};

/** Which panel a condition belongs to — the event log's `source` column (`MOCK.html`). */
export const conditionSource = (kind: ConditionKind, subject: string | null): string => {
  switch (kind) {
    case 'gpu_temp':
    case 'gpu_throttle':
    case 'gpu_vram':
      return `gpu ${subject ?? '?'}`;
    case 'cpu_temp':
    case 'ram':
      return 'host';
    case 'fan_stopped':
    case 'fan5_engaged':
    case 'fan5_absolute':
      return 'cooling';
    case 'unit':
      return subject === FAN_SERVICE_UNIT ? 'cooling' : 'serving';
    case 'health':
      return 'serving';
    case 'disk_free':
    case 'link':
      return 'storage';
    case 'ufw_enforcing':
    case 'pwm5_present':
    case 'dkms_for_running_kernel':
      return 'safety';
  }
};

/**
 * Where a reading can appear on screen: §6.1's grid, plus §6.2's header.
 *
 * ### ⚠ This is a SECOND vocabulary, on purpose. It is not `conditionSource`'s.
 *
 * The handoff put the choice as (a) two vocabularies, each with one definition, or (b) one
 * `Panel` type that the event log renders a coarser label from. **(a)**, and the argument is
 * not "the log reads better coarse" — it is that these are two *different joins* and neither
 * key set is a subset of the other:
 *
 * | | key | codomain | consumer |
 * |---|---|---|---|
 * | {@link conditionSource} | `ConditionKind` + subject | a **label**, `string`, with the subject interpolated (`gpu 0`) | §6.4's event-log source column |
 * | {@link errorsForPanel} | `ErrorSource` | a **closed set of places**, switched over exhaustively | §6.5's em-dash → `errors[]` join |
 *
 * HANDOVER's do-not-copy list forbids *a second mapping of a join that already exists*.
 * `ConditionKind → log label` and `ErrorSource → panel` are not the same join: they have
 * different keys, different codomains, and — decisively — a different *granularity that is
 * forced by the data*. Three places show that (b) cannot be made to work without inventing
 * something:
 *
 * - **`conditionSource` returns `string`, not a closed type**, because `gpu ${subject}` is
 *   interpolated per card. An exhaustive `switch` needs a closed codomain; a `string` one
 *   would make a nineteenth source a silent blank, which is exactly what §3.7's closed
 *   vocabulary exists to prevent.
 * - **CPU and MEMORY are two panels in §6.1 and one `'host'` in `conditionSource`.** Under
 *   (b) `cpu_temp` and `ram` would map to *different* members and the log would then
 *   re-collapse them — a mapping of a mapping, and two functions where (a) has two.
 * - **The header is not in §6.1's grid at all**, and `conditionSource` has no value for it,
 *   so `hostname` and `proc-uptime` would have nowhere to go. (a) gives the header a member;
 *   (b) would have to add one to the log's vocabulary that the log never renders.
 *
 * The cost of (a) is two vocabularies that could drift. It is paid the way this project pays
 * for `scripts/hash-password.py`: by measurement, not by a comment — every member below is
 * reached by a fixture on both sides, and `conditionSource` is unchanged, so there is nothing
 * to keep in step.
 *
 * ### Why `'gpu'` is one member and not one per card
 *
 * `nvidia-smi` is the **whole enumeration**, not a card: `gpus: null` blanks GPU 0 and GPU 1
 * together, and it is the only source either card has. A per-card member would make
 * {@link panelsForSource} a function of *how many cards answered*, which is not a fact about
 * a source — and there is no `errors[]` entry it could ever return for one card and not the
 * other. Both GPU panels ask for `'gpu'` and get the same answer, which is the truth.
 *
 * ### What is deliberately absent
 *
 * **§6.1's session event log is not a `Panel`.** It renders no reading, so it has no em dash
 * and nothing to explain; §6.5's join has no meaning there. Its feed is `state.events`.
 */
export type Panel =
  /** §6.2's header — hostname and uptime. Not in §6.1's grid, and it still shows readings. */
  | 'header'
  /** §6.1 row 1, both cards. See above: `nvidia-smi` cannot be attributed to one of them. */
  | 'gpu'
  /** §6.2's CPU panel: package temperature, utilisation, load average, and its subtitle. */
  | 'cpu'
  /** §6.2's MEMORY panel: RAM against 61 GiB, and swap on its own row. */
  | 'memory'
  /** §6.1's COOLING panel, spanning rows 2–3: five channels, the derived mode, the service. */
  | 'cooling'
  /** §6.2's SERVING panel: one row per `llama-server` instance. */
  | 'serving'
  /** §6.2's STORAGE & NETWORK panel: both mounts, `eno1` throughput and link state. */
  | 'storage'
  /** §6.2's SAFETY panel: §3.6's four checks. */
  | 'safety';

/**
 * Which panels one §3.7 source blanks when it fails.
 *
 * ⚠ **An exhaustive `switch`, and not a `Record` or a lookup object.** §3.7's eighteen
 * sources are a closed set and `noFallthroughCasesInSwitch` is on, so a nineteenth source is
 * a compile error here — under `strictNullChecks` a missing case makes the function able to
 * return `undefined` against a declared `readonly Panel[]`. A `Record` with a default, or
 * anything keyed by `string`, turns that compile error into a silently unexplained em dash,
 * which is the one outcome §6.5 exists to prevent.
 *
 * ### ⚠ Three sources are not 1:1, and each is a real fan-out rather than an ambiguity
 *
 * - **`dbus` reaches THREE panels.** It is filed by two collectors and consumed by three
 *   figures: `collectSafety` reads `gpu-fan-control.service` once (O9) and that one read is
 *   written to **`cooling.serviceState`** and to **`safety.fanServiceState`**, while
 *   `collectServing` reads the `llama-server@<i>` units into **`serving[].unitState`**. One
 *   D-Bus failure genuinely blanks a figure on COOLING, on SERVING **and** on SAFETY.
 * - **`dell-smm` reaches TWO.** ⚠ This one is *not* in the handoff's table and was found by
 *   reading `lib/telemetry/snapshot.ts`: the assembly writes
 *   `assembledSafety.pwm5Present = cooling.pwm5Present`, so the cooling collector's probe is
 *   what stands behind §6.2's SAFETY `pwm5 present` row as well as every fan channel and the
 *   derived mode. §3.7 requires that row to carry an explanation beside it —
 *   *"an alarm with no explanation beside it is not actionable"* — and `dell-smm` is the only
 *   source that can supply one.
 * - **`hostname` and `proc-uptime` reach the HEADER**, which §6.1's grid does not contain.
 *   Without {@link Panel}'s `'header'` member both entries would be unreachable: filed by a
 *   collector, carried on the wire, and matched to nothing.
 *
 * ### And one source that looks like a fan-out and is not
 *
 * ⚠ **`nvidia-smi` does NOT reach COOLING**, even though §6.2 draws the GPU temperature trace
 * and the fan RPM trace on shared time inside the COOLING panel. §6.5 is explicit: when
 * `nvidia-smi` is absent the GPU panels say so and *"no other panel is affected"*. The
 * cooling chart losing a trace is the GPU panel's outage rendered again, not a second fault
 * for COOLING to explain, and duplicating the entry would state one fact twice — the thing
 * §6.5's own exception is written to stop.
 *
 * Each list is in §4's field order (gpus, host, cooling, serving, storage, safety), matching
 * `errors[]`'s own documented order so nothing here re-sorts anything.
 */
const panelsForSource = (source: ErrorSource): readonly Panel[] => {
  switch (source) {
    // ---- §3.1. The enumeration, not a card.
    case 'nvidia-smi':
      return ['gpu'];

    // ---- §3.2, split across three panels and the header by the FIGURE each one blanks.
    // ⚠ `collectHost` files nine sources for one crash precisely so this split is possible;
    // folding them back onto one `'host'` panel is the mistake `conditionSource` cannot make
    // because it is not asked this question.
    case 'coretemp':
    case 'proc-stat':
    case 'proc-loadavg':
      return ['cpu'];
    // ⚠ The CPU panel's SUBTITLE — `<cpuModel> · 6C / 12T` (§6.2) — not a body row. It is
    // identity rather than measurement, and a subtitle is `—` when its field is `null` like
    // any other reading, so it owes an entry on the same terms.
    case 'proc-cpuinfo':
      return ['cpu'];
    case 'proc-meminfo':
      return ['memory'];
    // §6.2's header carries the hostname and the uptime, and that list is exhaustive.
    case 'hostname':
    case 'proc-uptime':
      return ['header'];
    // §3.7 keeps these two apart deliberately — sysfs for the link, /proc for the counters —
    // so that a failed link read is not attributed to the byte counters. Both land on the
    // same panel, and separating them still buys the message beside the right figure.
    case 'proc-net-dev':
    case 'net-operstate':
      return ['storage'];

    // ---- §3.3 + §3.6's `pwm5Present`. See the fan-out note above.
    case 'dell-smm':
      return ['cooling', 'safety'];

    // ---- §3.3 + §3.4 + §3.6. The three-panel fan-out. See the note above.
    case 'dbus':
      return ['cooling', 'serving', 'safety'];

    // ---- §3.4.
    case 'llama-env':
    case 'llama-health':
    case 'llama-models':
      return ['serving'];

    // ---- §3.5.
    case 'statvfs':
      return ['storage'];

    // ---- §3.6.
    case 'ufw':
    case 'dkms':
      return ['safety'];
  }
};

/**
 * §6.5's join: the `errors[]` entries that explain this panel's em dashes.
 *
 * *"A single sensor read fails → that figure shows `—`, its `errors` entry is available, the
 * rest of the panel renders."* This is the "is available" half. It is written **once**,
 * beside {@link conditionSource}, so no panel invents its own filter — and it is what makes
 * §6.5's one exception (*"an `—` whose cause is already shown beside it"*, and only when the
 * coloured neighbour is **in the same panel**) expressible at all.
 *
 * - **Order is `snapshot.errors`' own order**, preserved by filtering rather than rebuilt.
 *   §4's concatenation order is a decision pinned by a test (`snapshot.ts`), and `events.ts`
 *   reads the **last** message per source — so a panel that re-sorted would show a different
 *   D-Bus sentence than the event log for the same fault.
 * - **`[]`, never `null`**, for a panel with nothing to explain. `null` on this project means
 *   *unknown*, and "no entry explains this panel" is knowledge, not a gap.
 *
 * ⚠ This answers *which entries exist*, not *which em dash they belong to*. A source can
 * blank several figures on one panel — `dell-smm` blanks five channels and the mode — and
 * §3.7's granularity is per source, not per figure. A panel showing an entry beside a row is
 * therefore showing the entry for that row's **source**, which is the finest join §4 offers.
 */
export const errorsForPanel = (
  snapshot: TelemetrySnapshot,
  panel: Panel,
): readonly TelemetryError[] =>
  snapshot.errors.filter((error) => panelsForSource(error.source).includes(panel));

// ---------------------------------------------------------------------------
// ⚠⚠ §6.2's INVERTED GPU↔instance join (ruled 2026-09-15, built 12b)
// ---------------------------------------------------------------------------

/**
 * What a GPU card can say about who serves it.
 *
 * ### Why the old join had to go, in one paragraph
 *
 * `gpu.index === serving.instance` was **not a fact about this system**. It is a coincidence
 * of the one serving arrangement that has ever run here: `llama-server@.service` pins
 * instance N to card N with `CUDA_VISIBLE_DEVICES=%i`, and **nothing on §4's wire ever said
 * so** — §6.2 admitted it in its own words, *"a fact about the deployment that the dashboard
 * cannot verify"*. A second arrangement does not break that join; it reveals there was never
 * one. So §3.4's `gpus` carries the declaration and the question runs the other way: **a card
 * asks which instance lists it.**
 *
 * ### The four answers, and why none of them is the others
 *
 * | variant | reached when | the card renders |
 * |---|---|---|
 * | `declared` | some instance's `gpus` contains this index | *served by instance N* when it lists this card alone, *served jointly with GPU M* when it lists more |
 * | `indexed` | **no** instance in the snapshot carries the key | §3.4's fallback: *served by instance `index`*, byte-identical to what shipped before this file changed |
 * | `unknown` | every list was consulted, none claims this card, and at least one is `null` — **or the list itself was incomplete** (12c/RECONCILE) | invariant 1 — an em dash. The entry that blanked it is on the SERVING panel: `dbus` beside the row it names, or the `llama-env` refusal under the rows |
 * | `unserved` | every list was read **in full** and none of them names this card | not a gap: §6.5's *"absent from a collection that was read … the subject has left, and that is an answer"*, one level down |
 *
 * ⚠⚠ **`unknown` has TWO producers and one rendering, and that is correct rather than a
 * conflation.** *An instance's `gpus` could not be read* and *a row of the list was refused*
 * are different failures with the same honest answer — we could not read enough to say who
 * serves this card — and §6.2 gives that answer one spelling, the em dash. What tells them
 * apart is the `errors[]` entry, and both land on the SERVING panel, which is where this
 * cell's explanation has always lived. Splitting them would need a fifth variant and new panel
 * copy, which is a rendering ruling and is written up as an owner question instead.
 *
 * ⚠ **An em dash for `declared` would be a LIE** (§6.2 says so in as many words): the reading
 * is not missing, it is different. That is the whole reason `unknown` and `unserved` are
 * separate variants rather than one `null`.
 *
 * ⚠ **`unserved` is the case a mis-pinned instance produces**, and producing it visibly is the
 * point of the inversion: an instance pinned to the wrong card now shows the WRONG CARD
 * rather than being invisible.
 */
export type ServedBy =
  | {
      readonly kind: 'declared';
      readonly instance: ServingInstance;
      /** The OTHER cards this instance lists. `[]` when it serves this card alone. */
      readonly alongside: readonly number[];
    }
  | { readonly kind: 'indexed'; readonly instance: ServingInstance | null }
  | { readonly kind: 'unknown' }
  /**
   * ⚠⚠ **12d — §3.4's ruling of 2026-09-22: a partially-read list says so.** Not *this reading
   * could not be taken* (`unknown`, the em dash) and not *nobody claims this card*
   * (`unserved`): **we did not read the whole list**, so the question of who serves this card
   * is open. It is a statement about our own knowledge rather than about the machine, and the
   * card must render it as one.
   */
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'unserved' };

/**
 * Whether an instance carries §3.4's `gpus` key at all — the ONE test that separates an older
 * server from a current one reporting a failure.
 *
 * ⚠ `Object.hasOwn`, never `instance.gpus === undefined`. HANDOVER §0.5 records the same
 * choice for `TelemetryError.instance`: the two differ the moment anything in this project
 * spreads a row (`{ ...instance, gpus: undefined }` is a present key), and `wire.ts` omits the
 * key rather than setting it for exactly that reason.
 */
const declaresGpus = (instance: ServingInstance): boolean => Object.hasOwn(instance, 'gpus');

/**
 * §6.2's join, inverted: which instance lists this card.
 *
 * ⚠ **The fallback is chosen by the SNAPSHOT, not by the row.** `indexed` is returned only
 * when *no* instance carries the key, because "this server does not publish `gpus`" is a
 * property of the server and a snapshot in which some rows declare and others do not is not
 * something `collectServing` can produce — it fills the field for every row it emits. Deciding
 * per row instead would let one unreadable unit silently re-enable the index join for its own
 * card, which is the coincidence this whole change exists to stop relying on.
 *
 * ⚠ **`serving: null` is `indexed` with no instance**, which renders exactly as it does
 * today: *served by instance N* with an em dash for the model. *"Which instances exist is
 * unknown"* cannot be turned into a claim about cards, and the `llama-env` entry explaining it
 * already sits on the SERVING panel — the same place this card's model has always borrowed its
 * explanation from.
 *
 * ⚠⚠ **The first claimant wins, and "first" is `compareInstances`' order rather than the
 * array's** (12c). Two instances listing one card is a real state during a bad mode switch
 * (systemd's `Conflicts=` is what normally prevents it), and §3.4 says nothing about it; the
 * card names the lower instance rather than inventing a rendering. 12b said "`serving[]`'s own
 * ascending order", which was the same thing only because the collector sorted it — this
 * states the rule so the answer does not depend on the layout of the list. Still a spec
 * silence; re-recorded in `12c-build.md`.
 *
 * ⚠⚠ **12c/RECONCILE — it takes a {@link ServingEnumeration}, not an array, and that is the
 * fix for `12c-A1`.** A shortened array means two things — *the server listed fewer* and *we
 * refused some of what it listed* — and this join was being handed the second as though it
 * were the first. The rule, in one sentence:
 *
 * > **An incomplete list may only produce a POSITIVE answer.** `declared` and an `indexed`
 * > that actually found its row rest on a row this client read; `unserved` ("we looked, and
 * > nobody claims it") and an `indexed` with no instance are claims about rows that are not
 * > here, and after a refusal we do not know what was in them. Both become `unknown` — §6.2's
 * > em dash, invariant 1, the honest branch that already existed one line away.
 *
 * ⚠⚠ **12d — the rule stands and its ANSWER changed.** `12c-Q1` asked what a card may say when
 * the list was read in part, and the owner ruled on 2026-09-22 (§3.4): not the em dash. An em
 * dash already means *this reading could not be taken*, which is what an unreadable `gpus`
 * shows; *we discarded part of the list* is a different fact and rendering the two identically
 * is invariant 1's own failure one level up. The negative branches below therefore return
 * {@link ServedBy} `incomplete`, a fifth variant, and nothing else about the rule moves.
 *
 * Measured before the change, three rendered pages differing only in row 1's `port`: a valid
 * pair gave `served by instance 1 · gemma-4-31b`, a refused row gave **`served by · no
 * instance`**, and an instance that had genuinely left the machine gave the same strip byte
 * for byte. The ratified §9 sentence — *"the collection was read successfully and the client
 * discarded part of it, which is not the same as the server not reporting it"* — now holds on
 * this panel too.
 *
 * ⚠ It also closes the new path `12c-build.md` §6 Q7 flagged and left open: a snapshot whose
 * ONLY row was refused arrives here as `read: 'partial'` with `rows: []`, and no longer falls
 * through the old-server fallback to print `served by instance 0` for a row just dropped. Q7's
 * own case — a genuinely empty or `null` `serving` on a pre-`gpus` server — is `read: 'all'`
 * and `read: 'none'` respectively, and is untouched.
 */
export const servedBy = (serving: ServingEnumeration, index: number): ServedBy => {
  if (serving.read === 'none') return { kind: 'indexed', instance: null };
  const rows = serving.rows;
  // ⚠ Only `'all'` supports a negative claim. See the rule in this function's doc.
  const complete = serving.read === 'all';
  if (!rows.some(declaresGpus)) {
    // ⚠ 12c — §3.4's fallback compares the card index to the identity as its CANONICAL
    // DECIMAL STRING. A named instance can never match, which is right: a server old enough
    // not to publish `gpus` is one whose discovery could not admit a named instance at all.
    const matched = rows.find((s) => s.instance === String(index)) ?? null;
    // ⚠ 12d — `incomplete`, not `unknown`. Nothing failed to be READ here; we simply do not
    // have the whole list, and §3.4's 2026-09-22 ruling forbids spelling those two alike.
    if (matched === null && !complete) return { kind: 'incomplete' };
    return { kind: 'indexed', instance: matched };
  }
  // ⚠⚠ 12c — the claimant is chosen by `compareInstances`, NOT by position in `serving[]`.
  //
  // 12b wrote this as "the first claimant wins, in `serving[]`'s own ascending order", which
  // was true only while the collector's own sort was the only thing that could produce the
  // array. With identities as strings the order had to be specified anyway (`lib/units.ts`),
  // and specifying it here as well costs one `reduce` and buys a property worth having: **the
  // same rows in a different order give the same answer.** A snapshot re-ordered by a proxy, a
  // future collector, or a hand-written fixture cannot silently move a model onto another
  // card — which is §6.2's named failure mode for this join.
  const claimants = rows.filter((s) => s.gpus != null && s.gpus.includes(index));
  const winner = claimants.reduce<ServingInstance | null>(
    // ⚠ Strictly `< 0`, so a TIE keeps the earlier element. Two rows can only tie by carrying
    // the same identity, which `discoverInstances` cannot produce (it dedupes through a `Set`)
    // and which `wire.ts` does not police; array order is consulted in that case and nowhere
    // else, and it is the only remaining place this function reads the layout at all.
    (best, s) => (best === null || compareInstances(s.instance, best.instance) < 0 ? s : best),
    null,
  );
  if (winner !== null) {
    const gpus = winner.gpus as readonly number[];
    return { kind: 'declared', instance: winner, alongside: gpus.filter((g) => g !== index) };
  }
  // ⚠⚠ `unserved` is a POSITIVE CLAIM — `gpu-panel.tsx` renders it as `no instance` and says so
  // in its own comment: *"every list was READ and none of them names this card"*. It is
  // available only when every row is here. A refusal makes it false, and the honest answer for
  // "we could not read enough to say" is the one the next line already gives an unreadable
  // `gpus`: invariant 1's em dash.
  //
  // ⚠⚠ 12d — the two non-answers are now SPELLED APART, and the order below is a decision.
  // `incomplete` wins when the list was cut, even if a row we DID read also has an unreadable
  // `gpus`: both are true, and the more specific statement about our knowledge is the one
  // §3.4's ruling asked for. A refused row has no row on SERVING to sit beside, whereas an
  // unreadable `gpus` already carries its `dbus` entry on the row it belongs to — so folding
  // the refusal back into the em dash is the collapse the ruling exists to stop. ⚠ §6.2 does
  // not say which wins when both hold; recorded as a spec silence in `12d-build.md`.
  if (!complete) return { kind: 'incomplete' };
  return rows.some((s) => declaresGpus(s) && s.gpus === null)
    ? { kind: 'unknown' }
    : { kind: 'unserved' };
};

/**
 * §3.4's `gpus` as the SERVING row's own words — *which cards does this process span*.
 *
 * | `gpus` | returns |
 * |---|---|
 * | absent (`undefined`) | `null` — render nothing at all, so an older server's row is byte-identical to what it was |
 * | `null` | `—` (invariant 1; the `dbus` entry is already on the row, carried by `errors[].instance`) |
 * | `[]` | `no GPUs` — the unit declares `CUDA_VISIBLE_DEVICES=`, which is an answer |
 * | `[0]` | `GPU 0` |
 * | `[0, 1]` | `GPUs 0, 1` |
 *
 * ⚠ The singular/plural split is not decoration: `GPU 0` and `GPUs 0, 1` are the two
 * arrangements this box can be in, and a row that read `GPUs 0` for the ordinary case would
 * make the interesting one harder to spot at a glance across a room, which is §6.1's whole
 * premise.
 */
export const servedCards = (gpus: readonly number[] | null | undefined): string | null => {
  if (gpus === undefined) return null;
  if (gpus === null) return EM_DASH;
  if (gpus.length === 0) return 'no GPUs';
  return gpus.length === 1 ? `GPU ${String(gpus[0])}` : `GPUs ${gpus.join(', ')}`;
};

/** §6.3's three-valued safety checks render `yes` / `no` / `—`, never `true` / `false`. */
const yesNo = (value: boolean | null): string => (value === null ? EM_DASH : value ? 'yes' : 'no');

/** §6.4's `disk_free` subjects, and the mount point each one names on screen. */
const DISKS = [
  { subject: 'root', label: '/' },
  { subject: 'home', label: '/home' },
] as const;

/** §6.3's `fan1`–`fan4` row. ⚠ Channel 5 is **not** a subject of this kind (O3). */
const CHASSIS_CHANNELS: readonly (readonly [number, (c: CoolingChannels) => Rpm | null])[] = [
  [1, (c) => c.fan1Rpm],
  [2, (c) => c.fan2Rpm],
  [3, (c) => c.fan3Rpm],
  [4, (c) => c.fan4Rpm],
];

/**
 * Every §6.3 row this snapshot has a band for, in §4's own field order — gpus, host,
 * cooling, serving, storage, safety.
 *
 * The order is the order `observePoll`'s dedupe resolves ties in (first wins) and the order
 * the event log reads, so it is fixed here rather than left to whichever loop happens to run
 * first. It matches `errors[]`'s documented order, which is the order §6.5 already matches
 * a `—` to its explanation in.
 */
export const conditionsFrom = (snapshot: TelemetrySnapshot): readonly ConditionObservation[] => {
  const out: ConditionObservation[] = [];
  const push = (
    kind: ConditionKind,
    subject: string | null,
    label: string,
    value: string,
    rawSeverity: ReturnType<typeof severityGpuTemp>,
    // ⚠ Which enumeration produced this subject **and which member of it this is**, or `null`
    // for one nothing enumerates. §9 reads it back to decide *retired* against *stale*; see
    // {@link enumerationsRead}.
    //
    // ⚠⚠ 12d — the member is NOT the condition's subject. `unit:llama-server@0.service` is
    // enumerated as instance `'0'`, and `'0'` is what a refused `serving[]` row can name.
    enumeration: EnumerationMembership | null = null,
  ): void => {
    // O12: no band, no condition. Never invent one.
    if (rawSeverity === null) return;
    out.push(observation({ kind, subject, label, value, rawSeverity, enumeration }));
  };

  // ---- GPUs (§3.1). `gpus: null` is "not enumerated", and is not two healthy cards.
  for (const gpu of snapshot.gpus ?? []) {
    const at = String(gpu.index);
    push(
      'gpu_temp',
      at,
      `GPU ${at} temperature`,
      formatCelsius(gpu.tempC),
      severityGpuTemp(gpu.tempC),
      { name: GPU_ENUMERATION, member: at },
    );
    push(
      'gpu_throttle',
      at,
      `GPU ${at} throttle`,
      formatText(gpu.throttleReasons),
      severityThrottle(gpu.throttleReasons),
      { name: GPU_ENUMERATION, member: at },
    );
    push(
      'gpu_vram',
      at,
      `GPU ${at} VRAM`,
      formatMiBPair(gpu.memUsedMiB, gpu.memTotalMiB),
      severityVram(gpu.memUsedMiB, gpu.memTotalMiB),
      { name: GPU_ENUMERATION, member: at },
    );
  }

  // ---- Host (§3.2)
  const host = snapshot.host;
  push('cpu_temp', null, 'CPU temperature', formatCelsius(host.cpuTempC), severityCpuTemp(host.cpuTempC));
  push(
    'ram',
    null,
    'RAM',
    // ⚠ §6.3's RAM row has two independent triggers — used % and swap above 1 GiB — so the
    // banner has to show both or it names a value that did not move.
    `${formatGiB(host.memUsedGiB)} used · swap ${formatSwapGiB(host.swapUsedGiB)}`,
    severityMemory(host),
  );

  // ---- Cooling (§3.3)
  const cooling = snapshot.cooling;
  for (const [channel, read] of CHASSIS_CHANNELS) {
    const value = read(cooling);
    push('fan_stopped', String(channel), `fan ${channel}`, formatRpm(value), severityFanStopped(value));
  }
  push('fan5_absolute', null, 'fan 5', formatRpm(cooling.fan5Rpm), severityFan5Absolute(cooling));
  push(
    'fan5_engaged',
    null,
    'fan 5 engaged',
    `${formatRpm(cooling.fan5Rpm)} · ${formatCh5Pwm(cooling)}`,
    severityFan5Engaged(cooling),
  );
  // §9's "one reading shown in two panels": emitted here from COOLING and again from SAFETY.
  push(
    'unit',
    FAN_SERVICE_UNIT,
    FAN_SERVICE_UNIT,
    formatText(cooling.serviceState),
    severityUnitState(cooling.serviceState),
  );

  // ---- Serving (§3.4). `serving: null` is "which instances exist is unknown", not none.
  for (const instance of snapshot.serving ?? []) {
    // ⚠⚠ 12c — `servingUnitName` is a MAPPING and it can MISS, so there is not always a
    // `unit:` condition to push. An identity with no unit name has no unit whose `ActiveState`
    // could be banded, and minting `unit:llama-server@split.service` here would put a §6.3 row
    // — and a `STANDING`-suppressible id — against a unit that has never existed.
    // `collectServing` files the `errors[]` entry that says so; this loop stays silent rather
    // than inventing a second, contradictory account of the same instance.
    const unit = servingUnitName(instance.instance);
    if (unit !== null) {
      push(
        'unit',
        unit,
        unit,
        formatText(instance.unitState),
        severityUnitState(instance.unitState),
        // ⚠⚠ 12d — the member is the INSTANCE IDENTITY, not `unit` (this condition's own
        // subject). A refused `serving[]` row names an identity; comparing it against a unit
        // name would protect nothing and retire the alarm §9's ruling exists to keep.
        { name: SERVING_ENUMERATION, member: instance.instance },
      );
    }
    push(
      'health',
      // §6.4's subject IS the identity, verbatim — `health:0`, `health:split`. ⚠ `String()` is
      // gone: it used to convert a number and would now silently accept anything.
      instance.instance,
      `${servingUnitLabel(instance.instance)} /health`,
      formatText(instance.health),
      severityHealth(instance.health),
      { name: SERVING_ENUMERATION, member: instance.instance },
    );
  }

  // ---- Storage & network (§3.5)
  for (const disk of DISKS) {
    const filesystem = disk.subject === 'root' ? snapshot.storage.root : snapshot.storage.home;
    push(
      'disk_free',
      disk.subject,
      `${disk.label} free`,
      `${formatGiB(filesystem.usedGiB)} of ${formatGiB(filesystem.totalGiB)} used`,
      severityDiskFree(filesystem.usedGiB, filesystem.totalGiB),
    );
  }
  push('link', null, 'eno1 link', formatText(snapshot.storage.net.link), severityLink(snapshot.storage.net.link));

  // ---- Safety (§3.6). All three checks are total: they always carry a band.
  const safety = snapshot.safety;
  push('ufw_enforcing', null, 'ufw enforcing', yesNo(safety.ufwEnforcing), severityUfw(safety.ufwEnforcing));
  push(
    'pwm5_present',
    null,
    'pwm5 present',
    yesNo(safety.pwm5Present),
    severityPwm5Present(safety.pwm5Present),
  );
  push(
    'dkms_for_running_kernel',
    null,
    'DKMS for running kernel',
    yesNo(safety.dkmsForRunningKernel),
    severityDkms(safety.dkmsForRunningKernel),
  );
  push(
    'unit',
    FAN_SERVICE_UNIT,
    FAN_SERVICE_UNIT,
    formatText(safety.fanServiceState),
    severityUnitState(safety.fanServiceState),
  );

  return out;
};
