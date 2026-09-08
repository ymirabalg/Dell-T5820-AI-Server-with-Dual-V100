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

import type { Severity } from '../types';

import type { RuntimeMode } from './mode';

/** What the header's status area renders: a glyph, and the text beside it. */
export interface AggregateStatus {
  /** `●` live (coloured by `state.severity` at render time — this function does not colour
   *  anything), `❙❙` paused, `⊘` stale or expired. Never a `Severity`'s own glyph (`✓▲✕`) —
   *  those belong to `Chip`, on an individual reading, not to the page's own mode. */
  readonly glyph: string;
  /** `'all healthy'` · `'no readings'` · `'N alarms'` · `'paused'` · `'paused · N alarms'` ·
   *  `'stale'` · `'stale · N alarms'` · `'signed out'`. Never contains the literal `0`. */
  readonly text: string;
}

const alarmsWord = (alarms: number): string => (alarms === 1 ? '1 alarm' : `${alarms} alarms`);

/** One glyph and one text-builder per {@link RuntimeMode} — exhaustive by construction: an
 *  object literal typed `Record<RuntimeMode, …>` cannot omit a key without a compile error,
 *  so a fifth mode added to `mode.ts` fails here at `tsc`, not silently at runtime. */
const BY_MODE: Readonly<
  Record<RuntimeMode, (alarms: number, severity: Severity | null) => AggregateStatus>
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
 * §6.2/§9's header line. `alarms` is `RuntimeState.alarms` (or `0`), never negative and never
 * read as anything but a count — this function does not know or care what is alarming.
 * `severity` is `RuntimeState.severity`, the SAME value the caller colours the dot with, so
 * the glyph, its colour and the words beside it are one reduction rather than two (§9, O2).
 */
export const aggregateStatus = (
  mode: RuntimeMode,
  alarms: number,
  severity: Severity | null,
): AggregateStatus => BY_MODE[mode](alarms, severity);
