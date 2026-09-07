/**
 * §6.4 — alarm behaviour: the condition ledger, standing conditions and the 10-second
 * debounce, **composed into one entry point**.
 *
 * Both mechanisms exist to stop the banner lying in opposite directions. A banner that is
 * always on screen is a banner nobody reads, so a **standing** condition — genuinely
 * alarm-severity, but known, persistent and already understood — shows at watch colour
 * with its real severity named in the row and never banners. A banner that flickers with a
 * 79→80→79 reading is noise, so a new band must **hold for 10 seconds of wall time**
 * before it logs or banners.
 *
 * ⚠ **They are one pipeline, not two.** §6.4: "A condition's severity is the CONFIRMED
 * band, never a raw per-poll severity. Feeding raw severities into the ledger destroys
 * standing suppression permanently on the first flicker: one `watch` poll at the 79/80
 * knee sets the *changed* flag, the standing condition un-suppresses, and the banner it
 * was written to prevent becomes permanent."
 *
 * That is why {@link observePoll} exists and why the ledger fold and the standing rule are
 * **not exported**. This module used to expose both halves and leave the wiring to the
 * caller; the phase that built both halves then wired them together wrongly in its own
 * tests. There is now nothing to wire: a poll goes in, {@link DisplayedCondition}s come
 * out, and the debounce is not skippable.
 *
 * **What the debounce does NOT gate** (§6.4): "A cell's colour is not debounced: it tracks
 * the current reading directly, because a cell is showing you the number next to it and a
 * colour that disagreed with its own figure would be a worse lie than a colour that
 * flickers." So a cell calls `lib/severity.ts` directly on the current reading. Nothing in
 * *this* module is a cell colour.
 *
 * Everything here is pure. The debounce takes wall-clock milliseconds as an *argument*;
 * it never reads a clock, so step 8 can drive it from fake timers and step 10 can render
 * it. State is threaded through explicit, immutable values rather than held in a module.
 *
 * ⚠ **Standing is configured, never inferred** (§6.4). `STANDING` in
 * `/etc/ai-dashboard.env` is a comma-separated list of condition ids; nothing becomes
 * standing because it has been true for a while. That is what keeps the list short and
 * auditable, and it is why {@link standingIdsFrom} is the only way into the mechanism —
 * {@link observePoll} takes its result, not a bare set of strings. The list reaches the
 * browser on §4's snapshot, split by the server and judged **only** here.
 *
 * ### ⚠ A condition that stops being reported is UNKNOWN, not resolved
 *
 * §9 and §6.5, and it is the failure this dashboard exists to prevent: *"a card at 90 °C
 * whose `nvidia-smi` then fails takes the header from `● 1 alarm` to `● all healthy` with no
 * log line — the dashboard turns green at the moment it loses the ability to look."*
 *
 * So {@link observePoll}'s `displayed` is **the session's confirmed conditions, not this
 * poll's observations**. A condition absent from a poll is one of two things, and §4's
 * `null` ≠ `[]` distinction is exactly what separates them:
 *
 * | the collection that would have listed the subject | verdict |
 * |---|---|
 * | could **not** be read (`gpus: null`, `serving: null`) | **stale** — keeps its last confirmed band, its "since" and its place in §9's count |
 * | **was** read, and the subject was not in it (`gpus: [{index:0}]`, `serving: []`) | **retired** — it has left the machine, and it leaves the ledger, the dot and the count |
 *
 * Both are confirmed over the same ten seconds of *sampled* wall time §6.4 requires, so one
 * flickering enumeration cannot retire a card. Staleness never raises a severity and never
 * lowers one — it is the **mode** and the reading's age that say how current it is, not the
 * band (§6.2: "the severity glyph answers *how is the machine*, the mode answers *how current
 * is this*; collapsing the two loses one of them").
 *
 * ⚠ **Staleness is deliberately unbounded.** An expiry would be a clock that silently turns
 * an alarm green — the bug above, reintroduced with a `setTimeout`. §6.4's banner is already
 * explicitly sticky across hours; what bounds a stale condition is *visibility*, which is why
 * {@link DisplayedCondition.lastSeenMs} is on the wire to the panel.
 */

import { worstSeverity } from './severity';
import type { Severity } from './types';

// ---------------------------------------------------------------------------
// §6.4's condition-id vocabulary
// ---------------------------------------------------------------------------

/**
 * The kinds of condition that can carry a severity — **§6.4's table verbatim**, one kind
 * per row of §6.3's threshold table.
 *
 * A **singleton** kind is one the box has exactly one of, so its id is the bare kind and
 * a subject on it is malformed (§6.4: "`ufw_enforcing:yes` must be reported as unknown,
 * not silently suppress nothing"). A non-singleton kind's id is `kind:subject`, and a bare
 * kind in `STANDING` matches every subject of that kind.
 *
 * `unit` is the one non-singleton kind that **requires** a subject in `STANDING`, because
 * its subjects are heterogeneous and one of them is safety-critical: §6.4, "A bare `unit`
 * would silence `gpu-fan-control.service`" — the unit whose failure puts two passively
 * cooled 250 W cards on an EC curve measured to ignore GPU temperature.
 *
 * ⚠ **`fan_stopped` is subscripted by CHANNEL index and covers channels 1–4 only.**
 * Channel 5's zero is carried by `fan5_absolute`, whose §6.3 row is two-sided — one tach
 * must never produce two conditions (O3), and `fan5_absolute` is already in `STANDING`'s
 * vocabulary. A bare `fan_stopped` in `STANDING` is allowed: unlike `unit`'s subjects the
 * four chassis headers are homogeneous, and none of them is the GPU cooling path.
 */
export type ConditionKind =
  | 'gpu_temp'
  | 'gpu_throttle'
  | 'gpu_vram'
  | 'disk_free'
  | 'unit'
  | 'health'
  | 'fan_stopped'
  | 'cpu_temp'
  | 'ram'
  | 'fan5_engaged'
  | 'fan5_absolute'
  | 'ufw_enforcing'
  | 'pwm5_present'
  | 'dkms_for_running_kernel'
  | 'link';

/** What §6.4's table says about one kind. */
export interface ConditionKindRule {
  /** §6.4's "singleton?" column. A subject on a singleton kind is malformed. */
  readonly singleton: boolean;
  /** May a bare kind appear in `STANDING`? False for `unit` only (§6.4). */
  readonly bareKindAllowedInStanding: boolean;
}

/**
 * {@link ConditionKind} as a runtime table — §6.4's three columns, for
 * {@link parseStandingIds} to validate against.
 *
 * A `Record<ConditionKind, …>` rather than a list, so adding a kind to the union without
 * deciding whether it is a singleton is a compile error rather than a silent default.
 */
export const CONDITION_KIND_RULES: Readonly<Record<ConditionKind, ConditionKindRule>> = {
  gpu_temp: { singleton: false, bareKindAllowedInStanding: true },
  gpu_throttle: { singleton: false, bareKindAllowedInStanding: true },
  gpu_vram: { singleton: false, bareKindAllowedInStanding: true },
  disk_free: { singleton: false, bareKindAllowedInStanding: true },
  unit: { singleton: false, bareKindAllowedInStanding: false },
  health: { singleton: false, bareKindAllowedInStanding: true },
  fan_stopped: { singleton: false, bareKindAllowedInStanding: true },
  cpu_temp: { singleton: true, bareKindAllowedInStanding: true },
  ram: { singleton: true, bareKindAllowedInStanding: true },
  fan5_engaged: { singleton: true, bareKindAllowedInStanding: true },
  fan5_absolute: { singleton: true, bareKindAllowedInStanding: true },
  ufw_enforcing: { singleton: true, bareKindAllowedInStanding: true },
  pwm5_present: { singleton: true, bareKindAllowedInStanding: true },
  dkms_for_running_kernel: { singleton: true, bareKindAllowedInStanding: true },
  link: { singleton: true, bareKindAllowedInStanding: true },
};

/** Every {@link ConditionKind}, derived from the rule table so the two cannot diverge. */
export const CONDITION_KINDS: readonly ConditionKind[] = Object.keys(
  CONDITION_KIND_RULES,
) as ConditionKind[];

/**
 * A condition's id: the kind alone for a singleton, or `kind:subject` for a kind the box
 * has several of — `gpu_temp:0`, `disk_free:home`, `unit:llama-server@1.service`.
 *
 * §6.4 fixes the subjects: GPU index for the three `gpu_*` kinds, `root` | `home` for
 * `disk_free`, the unit name for `unit`, the instance index for `health`.
 */
export type ConditionId = ConditionKind | `${ConditionKind}:${string}`;

/** `kind` alone, or `kind:subject`. */
export const conditionId = (kind: ConditionKind, subject: string | null): ConditionId =>
  subject === null ? kind : `${kind}:${subject}`;

// ---------------------------------------------------------------------------
// What one poll observed
// ---------------------------------------------------------------------------

/**
 * One §6.3 row evaluated against **this poll's** reading.
 *
 * ⚠ `rawSeverity` is the undebounced band, and it is named that way on purpose: it is
 * **not** what banners, logs or counts. Only {@link observePoll} consumes it, and what it
 * hands back is the confirmed band. §6.4 requires exactly that separation.
 *
 * Step 8 builds these from a snapshot — one per reading, **not one per rendered cell**
 * (§9: "One reading shown in two panels … Deduplicate by condition id"), since
 * `gpu-fan-control.service` appears in both COOLING and SAFETY and is one fact about the
 * machine.
 */
export interface ConditionObservation {
  readonly kind: ConditionKind;
  /** `null` for a singleton kind; `'0'`, `'home'`, `'llama-server@1.service'` otherwise. */
  readonly subject: string | null;
  /** {@link conditionId} of `kind` and `subject`. The `STANDING`, ledger and dedupe key. */
  readonly id: ConditionId;
  /** What the banner calls it — `'ufw enforcing'`, `'GPU 0 temperature'`. */
  readonly label: string;
  /** The value the banner shows, already formatted by `lib/format.ts` — `'82 °C'`. */
  readonly value: string;
  /** This poll's §6.3 band, **undebounced**. */
  readonly rawSeverity: Severity;
  /**
   * The §4 collection whose enumeration produced this subject — `'gpus'`, `'serving'` — or
   * `null` when nothing enumerates it.
   *
   * ⚠ This is what makes §9's *retired* decidable without a second copy of any subject's
   * naming rule. `unit:llama-server@0.service` and `unit:gpu-fan-control.service` are the
   * same kind with different answers, and the projection that emitted them is the only place
   * that knows which is which — asking later would mean re-deriving the join key by pattern,
   * which is the second spelling `lib/units.ts` exists to prevent.
   *
   * `null` (or absent) means the subject cannot be retired: nothing enumerates it, so its
   * disappearance is always *we stopped being able to look*.
   */
  readonly enumeration?: string | null;
}

/** Build a {@link ConditionObservation}, deriving its {@link ConditionId}. */
export const observation = (
  init: Omit<ConditionObservation, 'id'>,
): ConditionObservation => ({
  ...init,
  id: conditionId(init.kind, init.subject),
});

// ---------------------------------------------------------------------------
// Parsing the STANDING list
// ---------------------------------------------------------------------------

/** The outcome of reading `STANDING` — see {@link standingIdsFrom}. */
export interface StandingIds {
  /** The well-formed ids, matched against {@link ConditionObservation.id} and its kind. */
  readonly ids: ReadonlySet<string>;
  /**
   * Every malformed entry, verbatim (§6.4's four rules). Returned rather than thrown or
   * ignored: a mistyped id silently suppressing nothing is the *safe* failure, but "an id
   * that matches no kind is reported as unknown. Silence is not acceptable for a mechanism
   * whose whole job is suppressing alarms."
   */
  readonly unknown: readonly string[];
}

/**
 * Judge `STANDING`'s entries — the ids as §4's snapshot delivered them.
 *
 * ⚠ **This is the only place an entry is judged, and that is §4's design.** The list is
 * "echoed verbatim and never parsed server-side", so `lib/auth/config.ts` splits on §6.4's
 * comma and stops; every rule below runs in the browser, where §6.4's *"an id that matches
 * no kind is reported as unknown"* can actually reach a reader. A server that filtered
 * would turn the loudest rule in §6.4 into silence.
 *
 * An empty list means nothing is standing, which is the correct default: a missing config
 * file can only ever make the dashboard *louder*, never quieter. Entries are trimmed of
 * surrounding whitespace (an env file's separator invites `a, b`), and matching is then
 * exact and case-sensitive; the ids are literals from a fixed vocabulary, not user prose.
 *
 * **§6.4's four malformedness rules, each of which closes a real hole:**
 *
 * | entry | outcome | why |
 * |---|---|---|
 * | `gpu_fan_speed` | unknown | matches no kind |
 * | `ufw_enforcing:yes` | unknown | a subject on a singleton kind — "must be reported as unknown, not silently suppress nothing" |
 * | `gpu_temp:` , `unit:` | unknown | an empty subject |
 * | `unit` | unknown | "`unit` requires a subject. A bare `unit` would silence `gpu-fan-control.service`" |
 * | `gpu_temp` | accepted | a bare kind matches **every** subject — right for two identical cards |
 *
 * `ufw_enforcing:yes` is the entry an operator will actually type, because every other
 * line of an env file is `KEY=value` and `ufw_enforcing` reads like a key.
 */
export const standingIdsFrom = (entries: readonly string[]): StandingIds => {
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    const colon = trimmed.indexOf(':');
    const kind = colon === -1 ? trimmed : trimmed.slice(0, colon);
    const subject = colon === -1 ? null : trimmed.slice(colon + 1);
    const rule = Object.hasOwn(CONDITION_KIND_RULES, kind)
      ? CONDITION_KIND_RULES[kind as ConditionKind]
      : undefined;
    if (rule === undefined) {
      unknown.push(trimmed);
    } else if (subject === null) {
      if (rule.bareKindAllowedInStanding) ids.add(trimmed);
      else unknown.push(trimmed);
    } else if (subject === '' || rule.singleton) {
      unknown.push(trimmed);
    } else {
      ids.add(trimmed);
    }
  }
  return { ids, unknown };
};

/** Nothing declared standing — every alarm at full volume. The safe direction, and the default. */
export const NOTHING_STANDING: StandingIds = standingIdsFrom([]);

// ---------------------------------------------------------------------------
// The session ledger — what each condition has done since page load
// ---------------------------------------------------------------------------

/**
 * What one condition has done this session, in **confirmed** bands.
 *
 * `changed` is **sticky**: once a standing condition's severity has moved at all, it is no
 * longer the understood, unchanging fact it was declared to be, and it gets full alarm
 * behaviour for the rest of the session. §6.4: "It returns to full alarm behaviour the
 * moment it changes — **including when it clears and later regresses**."
 *
 * Both wrong implementations are worth naming, because each looks right:
 *
 * - Comparing against `firstSeverity` calls `alarm → normal → alarm` unchanged and
 *   swallows exactly the case §6.4 spells out.
 * - Dropping the `prev.changed ||` — "differs from the previous poll" — banners the
 *   regression for one poll and then re-suppresses it for the rest of the session. The two
 *   differ only at a **fourth** observation, which is why the test that pins this uses
 *   four.
 *
 * The tracked quantity is the **severity**, not the rendered value: "clears" and
 * "regresses" are severity words, and a value-based ledger would break the moment a
 * continuous metric was declared standing, since its formatted value changes every poll.
 */
export interface StandingEntry {
  readonly firstSeverity: Severity;
  readonly lastSeverity: Severity;
  readonly changed: boolean;
}

/** The session's ledger, keyed by {@link ConditionId}. Immutable; replaced, not mutated. */
export type StandingLedger = ReadonlyMap<string, StandingEntry>;

/** A session that has observed nothing yet. */
export const EMPTY_LEDGER: StandingLedger = new Map<string, StandingEntry>();

/**
 * Fold one **confirmed** band into a condition's ledger entry.
 *
 * Exported for testing the sticky rule in isolation; {@link observePoll} is the only thing
 * that calls it in anger, and it only ever passes a confirmed band.
 */
export const observeSeverity = (
  prev: StandingEntry | undefined,
  severity: Severity,
): StandingEntry =>
  prev === undefined
    ? { firstSeverity: severity, lastSeverity: severity, changed: false }
    : {
        firstSeverity: prev.firstSeverity,
        lastSeverity: severity,
        changed: prev.changed || prev.lastSeverity !== severity,
      };

// ---------------------------------------------------------------------------
// §6.4's debounce — 10 seconds of wall time, not a number of polls
// ---------------------------------------------------------------------------

/**
 * §6.4: "A metric must hold a new band for **10 seconds of wall time** before it logs or
 * banners — not for a number of polls."
 *
 * A poll-count rule would mean 2 s at the fastest cadence and 60 s at the slowest, so the
 * same written rule would behave completely differently depending on a dropdown. Ten
 * seconds is comfortably inside the ~39 s thermal time constant, so nothing real is
 * missed, while a 79→80→79 flicker stays quiet.
 */
export const DEBOUNCE_MS = 10_000;

/**
 * The debounce state for one metric's band.
 *
 * `confirmed` is what the UI may log or banner. `pending` is what the readings currently
 * say; it becomes `confirmed` once it has survived {@link DEBOUNCE_MS} of wall time.
 *
 * `confirmedSinceMs` is **when the confirmed band was first observed**, not when it was
 * confirmed — §6.4: "The banner's *when it started* is the first observation of the
 * CONFIRMED band, not the instant confirmation completed, which would always read 10 s
 * late."
 *
 * Generic over the band, not fixed to {@link Severity}: §6.4's own event-log example is a
 * non-severity transition (`fan5  EC auto → HIGH`), which step 8 debounces with this same
 * machine.
 */
export interface BandHold<T> {
  readonly confirmed: T;
  readonly confirmedSinceMs: number;
  readonly pending: T;
  readonly pendingSinceMs: number;
}

/** Seed a hold from the first reading of a session. The first band is confirmed at once. */
export const startBandHold = <T>(band: T, nowMs: number): BandHold<T> => ({
  confirmed: band,
  confirmedSinceMs: nowMs,
  pending: band,
  pendingSinceMs: nowMs,
});

/**
 * Fold one reading into a hold. Pure — `nowMs` is the caller's wall clock.
 *
 * At a 30 s cadence a single further sample confirms a transition, "which is correct: the
 * condition genuinely has held for 30 s"; at 1 s it takes ten. That difference is the
 * point of measuring wall time rather than counting polls.
 *
 * The state object is returned **unchanged by identity** when nothing moved, so step 8 and
 * step 10 can compare with `===` instead of deep-diffing every metric each poll. That
 * holds on the clock-backwards path too: a backwards clock with no pending run has nothing
 * to restart.
 */
export const stepBandHold = <T>(
  state: BandHold<T>,
  band: T,
  nowMs: number,
  holdMs: number = DEBOUNCE_MS,
): BandHold<T> => {
  if (!Object.is(band, state.pending)) {
    return { ...state, pending: band, pendingSinceMs: nowMs };
  }
  const settled = Object.is(state.pending, state.confirmed);
  // A clock that went backwards (a wall-clock adjustment mid-session) must not be able to
  // confirm a band early or strand one forever; restart the pending run from now. With no
  // pending run there is nothing to restart, so the state is returned by identity.
  if (nowMs < state.pendingSinceMs) {
    return settled ? state : { ...state, pendingSinceMs: nowMs };
  }
  if (settled) return state;
  if (nowMs - state.pendingSinceMs < holdMs) return state;
  return {
    confirmed: state.pending,
    confirmedSinceMs: state.pendingSinceMs,
    pending: state.pending,
    pendingSinceMs: state.pendingSinceMs,
  };
};

// ---------------------------------------------------------------------------
// The composed pipeline — the only way in
// ---------------------------------------------------------------------------

/** A condition after §6.4's debounce and its standing rule. Never built by hand. */
export interface DisplayedCondition {
  readonly kind: ConditionKind;
  readonly subject: string | null;
  readonly id: ConditionId;
  readonly label: string;
  readonly value: string;
  /**
   * The **confirmed** band (§6.4) — and the truth the SAFETY row names, which standing
   * never overwrites: "the severity is the truth; the display is the concession".
   */
  readonly severity: Severity;
  /** Watch while the condition is suppressed; otherwise {@link severity}. */
  readonly displaySeverity: Severity;
  /** Is this id (or its kind) in the `STANDING` list at all? */
  readonly declaredStanding: boolean;
  /** Declared standing, still at alarm, and unchanged this session. */
  readonly suppressed: boolean;
  /** Does it pin §6.4's sticky banner? Watch-level conditions never do. */
  readonly banner: boolean;
  /**
   * §6.4's "when it started": the wall-clock ms at which the **confirmed** band was first
   * observed — not the instant confirmation completed.
   */
  readonly sinceMs: number;
  /**
   * §6.5: **this poll did not carry the condition**, so every figure above is the last one
   * read rather than a current one.
   *
   * ⚠ It changes nothing about the band. Staleness "never raises a severity and never lowers
   * one" (§9) — a stale `alarm` still counts, and a stale `normal` stays `normal` rather than
   * being promoted to watch, because a subject that was fine when it was last read is not
   * evidence of harm. What the operator needs is the *age*, which is why {@link lastSeenMs}
   * is here, and the mode, which §6.2 shows alongside the dot rather than instead of it.
   */
  readonly stale: boolean;
  /**
   * The browser wall clock at which a poll last carried this condition.
   *
   * §6.5 requires a stale condition's "row and the banner to name the age of the reading",
   * and §6.7's clock rule puts it on this side: this measures the **session**, so it is the
   * browser's clock, like {@link sinceMs} and an event-log line's time.
   */
  readonly lastSeenMs: number;
  /** {@link ConditionObservation.enumeration}, carried forward so §9 can retire it later. */
  readonly enumeration: string | null;
}

/** No collection was read, so nothing may be retired. */
const EMPTY_ENUMERATIONS: ReadonlySet<string> = new Set<string>();

/**
 * Two observations of one id that did not agree — §9's dedupe, reporting its own work.
 *
 * `gpu-fan-control.service` reaches the browser twice (`cooling.serviceState` and
 * `safety.fanServiceState`). The server writes both from one D-Bus read, so they *should*
 * not differ — but "should not" is an assertion about the server made inside the client,
 * which is the posture O10 exists to forbid. The reduction takes the worst; this records
 * that it had to.
 */
export interface ConditionConflict {
  readonly id: ConditionId;
  readonly label: string;
  /** The value carried by the observation whose severity won. */
  readonly kept: string;
  /** Every other value this poll carried for the same id, in the order they arrived. */
  readonly others: readonly string[];
}

/** Everything one session remembers about its conditions. Immutable; replaced per poll. */
export interface ConditionState {
  /** One {@link BandHold} per {@link ConditionId} — §6.4's debounce, per condition. */
  readonly holds: ReadonlyMap<string, BandHold<Severity>>;
  /** The session ledger, in confirmed bands. */
  readonly ledger: StandingLedger;
  /**
   * Every condition the session has confirmed, as it was last displayed — **§9's reduction
   * runs over this, not over one poll's observations.**
   *
   * Insertion-ordered, and rebuilt each poll in that order, so a stale condition keeps its
   * place in the banner rather than jumping to the end the moment its collector fails.
   */
  readonly remembered: ReadonlyMap<string, DisplayedCondition>;
  /**
   * §6.5's ten seconds on *was this condition in the poll* — one hold per id.
   *
   * ⚠ **Asymmetric on purpose.** Absence is debounced ("Confirmed over the same ten seconds,
   * so one flickering enumeration cannot retire a card"); a reading that comes back is not.
   * Waiting ten seconds to believe a card that is answering would be the same lie in the
   * other direction.
   */
  readonly presence: ReadonlyMap<string, BandHold<boolean>>;
}

/** A session that has polled nothing yet. */
export const EMPTY_CONDITION_STATE: ConditionState = {
  holds: new Map<string, BandHold<Severity>>(),
  ledger: EMPTY_LEDGER,
  remembered: new Map<string, DisplayedCondition>(),
  presence: new Map<string, BandHold<boolean>>(),
};

/** {@link observePoll}'s result: the next state, and what to display now. */
export interface PollResult {
  readonly state: ConditionState;
  /**
   * §9's reduction input, and the banner's: every condition the session has confirmed,
   * **including the ones this poll did not carry**, each marked {@link
   * DisplayedCondition.stale}. Retired conditions are not here — they have left.
   */
  readonly displayed: readonly DisplayedCondition[];
  /** Ids that crossed into confirmed absence this poll while their collection was unreadable. */
  readonly wentStale: readonly DisplayedCondition[];
  /** Ids whose subject a readable collection no longer holds. They have left the ledger. */
  readonly retired: readonly DisplayedCondition[];
  /** Ids that were confirmed absent and are being read again. */
  readonly returned: readonly DisplayedCondition[];
  /** §9's dedupe, reporting where two observations of one id disagreed. */
  readonly conflicts: readonly ConditionConflict[];
}

/** What {@link observePoll} needs to know about the poll beyond its observations. */
export interface PollOptions {
  /**
   * Which of §4's enumerated collections this poll **read** — §9's *not read* versus *not
   * there*, as evidence rather than as a guess.
   *
   * A remembered condition is retired only when the enumeration it came from
   * ({@link ConditionObservation.enumeration}) is in this set and the condition is not in
   * this poll. `gpus: null` and `serving: null` therefore retire nothing, and a condition
   * that no enumeration produced — `ufw_enforcing`, `unit:gpu-fan-control.service` — can
   * never be retired at all, because nothing enumerates its subject.
   *
   * ⚠ Defaults to empty, so a caller that supplies nothing can only make the dashboard
   * **louder**. An alarm is never dropped by silence.
   */
  readonly enumerationsRead?: ReadonlySet<string>;
  /**
   * §6.4: **a gap (§6.7) ends any pending run.** True when the client was not sampling
   * immediately before this reading — hidden, paused, or a run of failed polls.
   *
   * ⚠ It restarts every band that has not yet confirmed and disturbs none that has. "One
   * sample either side of an hour-long gap has confirmed nothing, and dating the band to the
   * first of the two puts the banner's *when it started* an hour before the only other
   * evidence for it. The mirror case is worse — a band that the intervening readings would
   * have **rejected** is confirmed instead, because there were no intervening readings."
   */
  readonly afterGap?: boolean;
}

/**
 * §6.4's ten seconds, restarted for every band that has not yet confirmed.
 *
 * Returns the map **by identity** when no run was pending, so a gap that spans a quiet
 * dashboard costs nothing and `patch()`'s identity comparison still sees no change.
 */
export const restartPendingRuns = <T>(
  holds: ReadonlyMap<string, BandHold<T>>,
  nowMs: number,
): ReadonlyMap<string, BandHold<T>> => {
  let changed = false;
  const next = new Map<string, BandHold<T>>();
  for (const [key, hold] of holds) {
    if (Object.is(hold.pending, hold.confirmed)) {
      next.set(key, hold);
      continue;
    }
    changed = true;
    next.set(key, { ...hold, pendingSinceMs: nowMs });
  }
  return changed ? next : holds;
};

/**
 * Is `candidate` a worse band than `incumbent`?
 *
 * Expressed through {@link worstSeverity} rather than through a second ordering: §6.3's
 * ranking is `lib/severity.ts`'s, and a comparison written here would be a copy of it that
 * could drift.
 */
const isWorse = (candidate: Severity, incumbent: Severity): boolean =>
  candidate !== incumbent && worstSeverity(incumbent, candidate) === candidate;

/**
 * §6.5's absence hold. Present is confirmed at once; absent is held for {@link DEBOUNCE_MS}.
 */
const presenceHold = (
  previous: BandHold<boolean> | undefined,
  here: boolean,
  nowMs: number,
): BandHold<boolean> =>
  here
    ? startBandHold(true, nowMs)
    : stepBandHold(previous ?? startBandHold(true, nowMs), false, nowMs);

/**
 * Fold one poll's observations into the session, applying §6.4 **in the required order**:
 * dedupe → debounce → ledger → standing.
 *
 * 1. **Dedupe by id, taking the WORST severity.** §9: "One reading shown in two panels …
 *    One condition, counted once. Deduplicate by condition id — and when two observations
 *    share an id, the condition takes the **worst** of their severities, with the value that
 *    carries it." Taking the first would let whichever panel happens to be projected first
 *    decide, and a `failed` service behind an `active` reading would render a red cell under
 *    a green dot. The order in `conditionsFrom` is therefore **not** load-bearing.
 * 2. **Debounce.** Each id's {@link BandHold} is seeded on first sight and stepped from
 *    that poll's `rawSeverity`. The **confirmed** band is what continues.
 * 3. **Ledger.** The confirmed band — never the raw one — is folded in, so a single-poll
 *    flicker cannot set `changed` and cannot un-suppress a standing condition.
 * 4. **Standing.** Suppress only when all three hold: declared standing, confirmed
 *    severity is `alarm`, and the severity has not changed this session.
 * 5. **Stale or retired.** Every condition the session has confirmed that this poll did not
 *    carry is carried forward, marked stale, unless `hasLeft` says its subject has gone.
 *
 * `nowMs` is the caller's wall clock (the browser's in step 8, a fake timer in its tests).
 *
 * ⚠ **A poll in which a condition does not appear steps nothing** (§6.4). Its `BandHold` and
 * its ledger entry are frozen, not advanced: the confirmed band and its "since" are
 * preserved, and no interval in which the condition was not read may confirm or reject a
 * band on its behalf.
 */
export const observePoll = (
  state: ConditionState,
  observations: readonly ConditionObservation[],
  standing: StandingIds,
  nowMs: number,
  options: PollOptions = {},
): PollResult => {
  const enumerationsRead = options.enumerationsRead ?? EMPTY_ENUMERATIONS;
  // §6.4: a gap ends any pending run. Applied before anything is stepped, so the ten seconds
  // restart *at this reading* rather than being measured across ground nobody sampled.
  const priorHolds = options.afterGap ? restartPendingRuns(state.holds, nowMs) : state.holds;
  const priorPresence = options.afterGap
    ? restartPendingRuns(state.presence, nowMs)
    : state.presence;

  const holds = new Map(priorHolds);
  const ledger = new Map(state.ledger);
  const presence = new Map(priorPresence);
  const conflicts: ConditionConflict[] = [];
  const wentStale: DisplayedCondition[] = [];
  const retired: DisplayedCondition[] = [];
  const returned: DisplayedCondition[] = [];

  // ---- 1. one group per id, in arrival order -------------------------------
  const grouped = new Map<string, ConditionObservation[]>();
  for (const o of observations) {
    const group = grouped.get(o.id);
    if (group === undefined) grouped.set(o.id, [o]);
    else group.push(o);
  }

  // ---- 2. the conditions this poll carried ---------------------------------
  const current = new Map<string, DisplayedCondition>();
  for (const [id, group] of grouped) {
    let chosen = group[0] as ConditionObservation;
    for (const o of group) if (isWorse(o.rawSeverity, chosen.rawSeverity)) chosen = o;
    const others = group.filter((o) => o !== chosen).map((o) => o.value);
    if (group.some((o) => o.rawSeverity !== chosen.rawSeverity || o.value !== chosen.value)) {
      conflicts.push({ id: chosen.id, label: chosen.label, kept: chosen.value, others });
    }

    const prevHold = holds.get(id);
    const hold =
      prevHold === undefined
        ? startBandHold<Severity>(chosen.rawSeverity, nowMs)
        : stepBandHold(prevHold, chosen.rawSeverity, nowMs);
    holds.set(id, hold);

    const severity = hold.confirmed;
    const entry = observeSeverity(ledger.get(id), severity);
    ledger.set(id, entry);

    const declaredStanding = standing.ids.has(id) || standing.ids.has(chosen.kind);
    const suppressed = declaredStanding && severity === 'alarm' && !entry.changed;
    const displaySeverity: Severity = suppressed ? 'watch' : severity;

    const displayedCondition: DisplayedCondition = {
      kind: chosen.kind,
      subject: chosen.subject,
      id: chosen.id,
      label: chosen.label,
      value: chosen.value,
      severity,
      displaySeverity,
      declaredStanding,
      suppressed,
      banner: displaySeverity === 'alarm',
      sinceMs: hold.confirmedSinceMs,
      stale: false,
      lastSeenMs: nowMs,
      enumeration: chosen.enumeration ?? null,
    };
    current.set(id, displayedCondition);

    const before = priorPresence.get(id);
    if (before !== undefined && !before.confirmed) returned.push(displayedCondition);
    presence.set(id, presenceHold(before, true, nowMs));
  }

  // ---- 3. the conditions it did not (§6.5) ---------------------------------
  const carried = new Map<string, DisplayedCondition>();
  for (const [id, previous] of state.remembered) {
    if (current.has(id)) continue;
    const before = priorPresence.get(id);
    const hold = presenceHold(before, false, nowMs);
    const confirmedAbsent = !hold.confirmed;

    const enumerated = previous.enumeration !== null && enumerationsRead.has(previous.enumeration);
    if (confirmedAbsent && enumerated) {
      // §6.5: **retired.** The subject has left the machine, and that is an answer.
      retired.push(previous);
      holds.delete(id);
      ledger.delete(id);
      presence.delete(id);
      continue;
    }

    presence.set(id, hold);
    const stale: DisplayedCondition = previous.stale ? previous : { ...previous, stale: true };
    carried.set(id, stale);
    if (confirmedAbsent && (before === undefined || before.confirmed)) wentStale.push(stale);
  }

  // ---- 4. one stable order: remembered first, then whatever is new ---------
  const remembered = new Map<string, DisplayedCondition>();
  for (const id of state.remembered.keys()) {
    const next = current.get(id) ?? carried.get(id);
    if (next !== undefined) remembered.set(id, next);
  }
  for (const [id, condition] of current) if (!remembered.has(id)) remembered.set(id, condition);

  return {
    state: { holds, ledger, remembered, presence },
    displayed: [...remembered.values()],
    wentStale,
    retired,
    returned,
    conflicts,
  };
};

// ---------------------------------------------------------------------------
// §9's aggregate — one reduction, read twice
// ---------------------------------------------------------------------------

/**
 * The conditions that pin §6.4's banner — "multiple conditions collapse into one banner
 * with a count".
 */
export const bannerConditions = (
  displayed: readonly DisplayedCondition[],
): readonly DisplayedCondition[] => displayed.filter((d) => d.banner);

/**
 * §9's alarm **count** — and it is the same reduction as {@link aggregateSeverity},
 * deliberately: "Reducing over `displaySeverity` is what keeps the dot, the count and the
 * banner from ever disagreeing."
 *
 * A suppressed standing condition is **not** counted; its truth is named in its SAFETY row
 * instead. §9 requires the count to be **omitted when zero** — `● all healthy`, never
 * `0 alarms` — which is step 10's rendering, not a different number.
 */
export const alarmCount = (displayed: readonly DisplayedCondition[]): number =>
  bannerConditions(displayed).length;

/**
 * §9's aggregate dot: "One reduction over each condition's `displaySeverity`."
 *
 * `null` when there are no conditions at all — not `'normal'`, which would claim health
 * for a poll that produced nothing. §6.5's paused/stale mode is shown *alongside* this,
 * never instead of it.
 *
 * ⚠ This reduction only sees readings that have a §6.3 band and therefore a condition id.
 * It is complete as of §6.3's `dkmsForRunningKernel`, `/health` and `eno1` link rows; if a
 * future panel shows a reading with no band, the dot cannot go red for it.
 */
export const aggregateSeverity = (
  displayed: readonly DisplayedCondition[],
): Severity | null => worstSeverity(...displayed.map((d) => d.displaySeverity));
