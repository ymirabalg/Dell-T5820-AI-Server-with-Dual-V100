/**
 * §6.2/§9's header aggregate status — mode and severity, folded into one glyph and one line
 * of text, **without ever hiding either fact**.
 *
 * This is half of `PLAN.md`'s green criterion for step 10: *"paused shows mode **and** alarm
 * count."* §6.2 states three literal shapes and no more — `● all healthy`, `❙❙ paused ·
 * 6 alarms`, `⊘ stale · 6 alarms` — and §9 adds the rule behind them: **the count is omitted
 * when it is zero**, in the rendering, never in `RuntimeState.alarms` itself.
 *
 * ⚠ **Decision, invariant 7.** Nothing in `SPEC.md` says what a paused-and-healthy or a
 * stale-and-healthy dashboard reads, only what a paused-or-stale-and-alarming one does. This
 * fills the silence conservatively: the same collapsing rule (omit the count at zero) applies
 * to every mode, so `❙❙ paused` and `⊘ stale` stand alone rather than claiming `· 0 alarms`
 * or inventing a word §6.2 never uses. Recorded here rather than guessed at inside a
 * component, per the project's own repeated finding that a spec gap discovered inside a
 * render function gets fixed once and never written down.
 *
 * ⚠ **`expired` has no §6.2 wording at all** — the mode exists only for the instant between a
 * 401 landing and `runtime.navigate()` completing the hand-off to `/login` (`runtime.ts`'s
 * `expire()`), and no snapshot describes what the header should say during it. `'signed out'`
 * is this decision's answer: distinct from every other word here, and never seen in practice
 * for longer than one paint.
 *
 * ⚠ **Decision, invariant 7 — and it is why this function takes `severity` (10a-reconcile,
 * adversarial F5).** §9: *"Aggregate status dot **and count** — **one reduction** over each
 * condition's `displaySeverity` … Reducing over `displaySeverity` is what keeps the dot, the
 * count and the banner from ever disagreeing."* The first version of this function took only
 * `(mode, alarms)`, which made that rule **structurally impossible to honour**: the dot's
 * colour comes from `RuntimeState.severity` and the text came from `alarms` alone, so the two
 * were two reductions and they disagreed in exactly the state §9 wrote the rule for —
 * `severity === null` with `alarms === 0` rendered a grey "no band" dot beside the words
 * **all healthy**. `lib/conditions.ts`'s `aggregateSeverity`: *"`null` when there are no
 * conditions at all — not `'normal'`, which would claim health for a poll that produced
 * nothing."* The text may not claim what the dot refuses to.
 *
 * So `severity === null` is a THIRD input, and in the one mode whose text makes a health
 * claim (`live`), it suppresses that claim. `'no readings'` is this decision's literal:
 * §6.2 gives three literal strings and none of them covers "nothing has a band yet", so the
 * wording is **recorded as a spec question for the owner** (10a's reconciliation notes) and
 * this is the conservative interim — it claims nothing, invents no severity word, and is
 * distinct from every other string here. `paused`, `stale` and `signed out` make no health
 * claim to begin with, so they are unchanged in the null case.
 *
 * ### ⚠⚠ 12a — the header may not read healthy while any collector is failing (§6.2, 2026-09-14)
 *
 * Ruled after the first production failure: a `daemon-reload` revoked the container's GPU
 * device access, `nvidia-smi` failed inside it, `errors[]` carried `nvidia-smi: exited 255`,
 * and **the header read `● all healthy` throughout.** §9's aggregate is computed from
 * readings, and a source that could not be read produces no reading — `severityGpuTemp(null)`
 * is `null` and O12 mints no condition for it — so a half-blind machine reduces to exactly
 * the same three inputs as a healthy one. *An absent reading is not a healthy one.*
 *
 * So {@link aggregateStatus} takes a FOURTH input: how many §3.7 **sources** filed an
 * `errors[]` entry on the latest snapshot ({@link failingSourceCount}). Three decisions, all
 * recorded under invariant 7 because §6.2's ruling fixes the RULE and not the wording:
 *
 * 1. **The unit is the source, not the entry.** §3.7's granularity is per source
 *    (`errorsForPanel`'s own doc: *"a source can blank several figures on one panel … the
 *    granularity is per source, not per figure"*), and `collectCooling` routinely files
 *    several messages under one `dell-smm`. Counting entries would make one wedged collector
 *    read as five faults.
 * 2. **The word is `unread`, and it is a count.** `● 2 sources unread` / `● 1 source unread`,
 *    with the same omit-at-zero collapsing rule §9 already applies to the alarm count. It
 *    claims nothing, invents no severity word, is distinct from every other literal here, and
 *    pairs with §6.2's existing `no readings` — the total case of the same fact. The
 *    alternatives were `partial`, `degraded` and `N collectors failing`; the first two are
 *    severity words §6.3 does not define, and the third names a thing §3.7 does not have (a
 *    collector files several sources).
 * 3. **`all healthy` is REPLACED, never suffixed; every other text is suffixed.** `all
 *    healthy · 2 sources unread` is the one shape the ruling forbids in as many words. The
 *    others make no health claim, so they keep theirs and take the clause: `3 alarms · 2
 *    sources unread`, `paused · 1 source unread`, `no readings · 2 sources unread`. `expired`
 *    is untouched for the reason its `alarms` is: the hand-off to `/login` has begun.
 *
 * ⚠ **And the DOT moves with the text, because §9 makes them one reduction.** A green `✓`
 * beside `2 sources unread` is the dot and the text disagreeing three pixels apart —
 * precisely what §6.2 rejected `all healthy` for in the `severity === null` case, and what
 * 10a-F5 fixed by giving this function `severity` in the first place. So
 * {@link AggregateStatus} now carries the severity the caller paints, and a `normal`
 * reduction with any failing source is downgraded to **no band**. `watch` and `alarm` are
 * left exactly as they are: this is 10b-S-F's panel-head rule (*"a panel that would read
 * `normal` while any of its own readings is `—` shows no band instead … it deliberately does
 * NOT drop to no-band for `warn` or `alarm`"*) applied one level up, to the summary §9 says
 * an operator reads from across the room. Recorded as an owner question — §6.2's ruling
 * governs what the header SAYS and is silent on what it paints.
 *
 * ⚠ **The word is "alarm"/"alarms", never "warning".** `RuntimeState.alarms` is
 * `alarmCount(displayed)` — §9's `bannerConditions(displayed).length` — which counts only
 * conditions that pin the banner (alarm-severity, unsuppressed). A `watch`-only poll (`state
 * .severity === 'watch'`, `state.alarms === 0`) renders `● all healthy` here, same as a
 * perfectly quiet one: the watch-level cell colours its own row (HANDOVER rule 1), and the
 * header's count is specifically the ALARM count, not a second severity readout. §6.1's own
 * ASCII sketch shows `● 1 warning` at the top of the file, but `MOCK.html` is a reference and
 * this sketch is the same kind of illustrative shorthand — no `RuntimeState` field carries a
 * separate watch count for a header to print, and §9's normative sentences all use "alarms".
 * Recorded so nobody "fixes" this file to match the sketch instead of the rule.
 */

import type { Severity, TelemetrySnapshot } from '../types';

import type { RuntimeMode } from './mode';

/** What the header's status area renders: a glyph, the text beside it, and the band both
 *  are painted with — ONE reduction, so the dot and the words can never disagree (§9). */
export interface AggregateStatus {
  /** `●` live, `❙❙` paused, `⊘` stale or expired. Never a `Severity`'s own glyph (`✓▲✕`) —
   *  those belong to `Chip`, on an individual reading, not to the page's own mode. */
  readonly glyph: string;
  /** `'all healthy'` · `'no readings'` · `'N alarms'` · `'paused'` · `'paused · N alarms'` ·
   *  `'stale'` · `'stale · N alarms'` · `'signed out'`, each optionally suffixed with
   *  `' · N sources unread'` (12a). Never contains the literal `0`. */
  readonly text: string;
  /**
   * ⚠ 12a — what the caller paints the dot with, and it is NOT always the `severity` handed
   * in: a `normal` reduction with any failing source is downgraded to `null` (no band). See
   * the module doc. Returned from here rather than computed beside the render so that §9's
   * *"one reduction"* is one function.
   */
  readonly severity: Severity | null;
}

const alarmsWord = (alarms: number): string => (alarms === 1 ? '1 alarm' : `${alarms} alarms`);

/**
 * ⚠ 12a — `'1 source unread'` / `'N sources unread'`. The count is of §3.7 SOURCES, never of
 * `errors[]` entries; see the module doc for why, and {@link failingSourceCount} for the
 * projection that produces it.
 */
const unreadWord = (sources: number): string =>
  sources === 1 ? '1 source unread' : `${sources} sources unread`;

/**
 * ⚠⚠ 12a — how many distinct §3.7 sources filed an `errors[]` entry on this snapshot.
 *
 * The header's fourth input (§6.2's ruling of 2026-09-14). `null` — no snapshot has landed —
 * is **0**, not "unknown": before the first poll there is nothing to be failing, and the
 * `severity === null` path already says `no readings` for that frame (S-D). A snapshot with
 * an empty `errors[]` is also 0, which is knowledge rather than a gap, the same way
 * `errorsForPanel` returns `[]` rather than `null`.
 *
 * ⚠ It counts sources rather than entries **and it is deliberately blind to which panel they
 * reach**. `errorsForPanel` is §6.5's per-panel join; this is §9's whole-machine one, and the
 * `'header'` fan-out is exactly why they cannot be the same function — a `hostname` failure
 * belongs to no grid panel and must still stop the header claiming health.
 */
export const failingSourceCount = (snapshot: TelemetrySnapshot | null): number =>
  snapshot === null ? 0 : new Set(snapshot.errors.map((e) => e.source)).size;

/** What a MODE says on its own, before 12a's failing-source clause and before the band. */
interface ModeStatus {
  readonly glyph: string;
  readonly text: string;
}

/** One glyph and one text-builder per {@link RuntimeMode} — exhaustive by construction: an
 *  object literal typed `Record<RuntimeMode, …>` cannot omit a key without a compile error,
 *  so a fifth mode added to `mode.ts` fails here at `tsc`, not silently at runtime. */
const BY_MODE: Readonly<
  Record<RuntimeMode, (alarms: number, severity: Severity | null) => ModeStatus>
> = {
  // ⚠ `live` is the ONLY mode whose zero-alarm text makes a health claim, so it is the only
  // one `severity === null` changes. See the decision at the head of this file.
  live: (alarms, severity) => ({
    glyph: '●',
    text: alarms === 0 ? (severity === null ? 'no readings' : 'all healthy') : alarmsWord(alarms),
  }),
  paused: (alarms) => ({
    glyph: '❙❙',
    text: alarms === 0 ? 'paused' : `paused · ${alarmsWord(alarms)}`,
  }),
  stale: (alarms) => ({
    glyph: '⊘',
    text: alarms === 0 ? 'stale' : `stale · ${alarmsWord(alarms)}`,
  }),
  // `alarms` is intentionally unread: §5.2's hand-off has already begun, and every other
  // fact on the page is about to be replaced by the login screen.
  expired: () => ({ glyph: '⊘', text: 'signed out' }),
};

/**
 * ⚠⚠ 12a — the one literal §6.2's ruling of 2026-09-14 forbids while any collector is
 * failing. Named rather than inlined so the rule has an anchor a regression can aim at, and
 * so that a future loop renaming the healthy text cannot leave this branch matching nothing.
 */
const ALL_HEALTHY = 'all healthy';

/**
 * ⚠ 12a — the mode this rule does NOT reach, and why it is a list of one rather than a
 * condition written inline. `expired` exists only between a 401 landing and
 * `runtime.navigate()` completing the hand-off to `/login`; every fact on the page is about
 * to be replaced by the login screen, which is the same reason its `alarms` is unread.
 */
const MODES_WITHOUT_THE_CLAUSE: readonly RuntimeMode[] = ['expired'];

/**
 * §6.2/§9's header line. `alarms` is `RuntimeState.alarms` (or `0`), never negative and never
 * read as anything but a count — this function does not know or care what is alarming.
 * `severity` is `RuntimeState.severity`, the SAME value §9 reduces the conditions to, so the
 * glyph, its colour and the words beside it are one reduction rather than two (§9, O2).
 *
 * ⚠⚠ `failingSources` is 12a's fourth input — {@link failingSourceCount} of the latest
 * snapshot. It is **required, not defaulted**: a defaulted `0` is the value a call site that
 * forgot the prop would silently get, which is exactly the header that shipped `all healthy`
 * over a blind `nvidia-smi` (HANDOVER §0.8 — an optional prop is an untested one).
 */
export const aggregateStatus = (
  mode: RuntimeMode,
  alarms: number,
  severity: Severity | null,
  failingSources: number,
): AggregateStatus => {
  const base = BY_MODE[mode](alarms, severity);
  const failing = failingSources > 0 && !MODES_WITHOUT_THE_CLAUSE.includes(mode);
  // ⚠ `all healthy` is REPLACED; every other text keeps its own words and takes the clause.
  // `filter` rather than a nested ternary so that dropping the healthy claim and appending
  // the clause are two independent facts about one string. See the module doc.
  const words = [failing && base.text === ALL_HEALTHY ? '' : base.text, failing ? unreadWord(failingSources) : '']
    .filter((part) => part !== '')
    .join(' · ');
  return {
    glyph: base.glyph,
    text: words,
    // ⚠ 10b-S-F's rule, one level up (see the module doc): `normal` over a machine with an
    // unread source is no band, `watch` and `alarm` are untouched.
    severity: failing && severity === 'normal' ? null : severity,
  };
};
