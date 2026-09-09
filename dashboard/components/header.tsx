/**
 * §6.2's header — the exhaustive control set, settled 2026-09-07: hostname · `uptimeSec` ·
 * aggregate status dot · snapshot timestamp · age of the last successful snapshot · cadence ·
 * window · refresh now · pause/resume · a visually separated logout. **No IP address, no
 * kernel release** — `MOCK.html`'s meta line is a mock-only rendering the spec explicitly
 * rejects (§6.2).
 *
 * A pure function of already-decided strings, numbers and callbacks — no clock, no store, no
 * `useState`. Every unit-bearing string (`hostname`, `uptime`, `timeOfDay`, `ageText`) is
 * **pre-formatted by the caller**, the same convention `PanelShell.subtitle` set: this
 * component never imports `lib/format.ts`, so the header and whatever else reads the same
 * snapshot cannot disagree about how a reading reads.
 *
 * ⚠ **The age text is a prop, not a tick.** D2/2.5b requires the age indicator to run off its
 * OWN interval rather than off store changes — that interval lives in `app/`, the one place
 * hooks are allowed, and it recomputes `ageText` on every tick. This component just renders
 * whatever string it is handed; it has no way to get the "own interval" rule wrong because it
 * has no interval of its own to get wrong.
 *
 * ⚠ **`aggregateStatus` is imported and called directly** — a plain function, not a hook — to
 * turn `mode`, `alarms` and `severity` into the glyph/text pair `PLAN.md`'s green criterion
 * names. It takes `severity` because §9 makes the dot and the count one reduction (F5). Calling
 * a pure function is not a violation of `purity.test.ts`'s guard; the guard is about React
 * hooks specifically (`components/purity.test.ts`'s own doc: matched by the shape React
 * mandates for a hook call, not by "any imported function").
 *
 * ### 10e §4 — glyph-only buttons, and two renamed things
 *
 * The five buttons/selects lose their visible words (`⟳ refresh` → `⟳`, `❙❙ pause` → `❙❙` /
 * `▶`, `⏻ logout` → `⏻`) — the mock's form, a control row read by its `aria-label`/`title`
 * rather than by squeezed-in text. `header.test.tsx`'s old `toContain('⟳ refresh')` /
 * `toContain('pause')` / `toContain('logout')` move to the accessible names
 * (`aria-label="Refresh now"`, `"Pause polling"`/`"Resume polling"`, `"Log out"`) — the visible
 * glyph alone was never a safe substring to test against once every button shares a one- or
 * two-character label. **The cadence select's key is now `cadence`**, the mock's word and
 * §6.2's own ("the cadence selector") — the built label was `refresh`, which this file's own
 * history already flagged as ambiguous beside the refresh-NOW button.
 */

import { aggregateStatus } from '@/lib/client/header-status';
import type { RuntimeMode } from '@/lib/client/mode';
import { CADENCE_SECONDS, WINDOW_MINUTES } from '@/lib/client/prefs';
import type { CadenceSeconds, WindowMinutes } from '@/lib/client/prefs';
import type { Severity } from '@/lib/types';

import styles from './header.module.css';
import './tokens.css';

/** §6.2's cadence selector label — `'5 s'`. A bare number reads as unitless in a `<select>`. */
const cadenceLabel = (seconds: CadenceSeconds): string => `${seconds} s`;

/** §6.2's window selector label — `'10 min'` / `'30 min'` / `'2 h'`. */
const windowLabel = (minutes: WindowMinutes): string => (minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`);

export interface HeaderProps {
  /** `formatText(snapshot.hostname)` — `—` when unread. */
  readonly hostname: string;
  /** `formatUptime(snapshot.host.uptimeSec)`. */
  readonly uptime: string;
  /** §9's dot colour. `null` when nothing has confirmed a band yet (before the first poll's
   *  conditions have settled) — rendered as the chip's own "no band" treatment, never green. */
  readonly severity: Severity | null;
  readonly mode: RuntimeMode;
  /** `RuntimeState.alarms`, raw. Never pre-omitted — `aggregateStatus` owns that rule. */
  readonly alarms: number;
  /** `formatTimeOfDay(latestSample(state)?.ts ?? null)`. */
  readonly timeOfDay: string;
  /** `formatZoneAbbreviation(...)`, shown once beside the clock. */
  readonly zoneAbbreviation: string;
  /** The age of the last good snapshot, **fully formatted including its trailing word** —
   *  `'2 s ago'`, or a bare `—` when nothing has landed yet. The suffix is the caller's
   *  because `formatAge(null)` is `—`, and this component used to append ` ago` to whatever
   *  it was handed, which rendered the em dash with a unit word glued to it (`— ago`) — a
   *  shape no other formatter output in this project produces (10a-reconcile, F9). `nowMs`
   *  comes from `app/`'s own tick (D2). */
  readonly ageText: string;
  readonly cadenceSeconds: CadenceSeconds;
  readonly windowMinutes: WindowMinutes;
  /** `RuntimeState.paused` — the operator's own flag, distinct from `mode === 'paused'` only
   *  in that this is never `true` while `mode` is `'expired'` on the way out. Used to label
   *  the button; `mode` is what is announced. */
  readonly paused: boolean;
  readonly onSetCadence: (seconds: CadenceSeconds) => void;
  readonly onSetWindow: (minutes: WindowMinutes) => void;
  readonly onRefreshNow: () => void;
  readonly onPauseResume: () => void;
  /** `DELETE /api/session`, then navigate to `/login` — both `app/`'s job (invariant 2: this
   *  never reaches the box itself, only the session). */
  readonly onLogout: () => void;
}

export function Header({
  hostname,
  uptime,
  severity,
  mode,
  alarms,
  timeOfDay,
  zoneAbbreviation,
  ageText,
  cadenceSeconds,
  windowMinutes,
  paused,
  onSetCadence,
  onSetWindow,
  onRefreshNow,
  onPauseResume,
  onLogout,
}: HeaderProps) {
  // ⚠ `severity` is passed here, not only to `data-severity` below: §9 makes the dot and the
  // count ONE reduction, and splitting them let the words say "all healthy" beside a grey
  // "no band" dot (10a-reconcile, adversarial F5). Both now come from the same three inputs.
  const status = aggregateStatus(mode, alarms, severity);

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <span className={styles.hostname}>{hostname}</span>
        <span className={styles.uptime}>{uptime}</span>
      </div>

      <span aria-hidden="true" className={styles.spacer} />

      <div className={styles.status} role="status">
        {/* ⚠ `data-severity` is set from `severity` UNCONDITIONALLY — §6.2: "shown *alongside*
            the … severity, never instead of it." `data-mode` picks the GLYPH (❙❙/⊘/●); colour
            still tracks the current severity in every mode, so a paused dashboard sitting on
            an alarm stays visibly red rather than fading to neutral the moment it is paused. */}
        <span
          aria-hidden="true"
          className={styles.dot}
          data-mode={mode}
          data-severity={severity ?? 'none'}
        >
          {status.glyph}
        </span>
        <span className={styles.statusText}>{status.text}</span>
      </div>

      <span className={styles.time}>
        {timeOfDay} {zoneAbbreviation} · {ageText}
      </span>

      <div className={styles.controls}>
        <label className={styles.control}>
          <span className={styles.controlLabel}>cadence</span>
          <select
            aria-label="refresh cadence"
            value={cadenceSeconds}
            onChange={(event) => onSetCadence(Number(event.target.value) as CadenceSeconds)}
          >
            {CADENCE_SECONDS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {cadenceLabel(seconds)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.control}>
          <span className={styles.controlLabel}>window</span>
          <select
            aria-label="chart window"
            value={windowMinutes}
            onChange={(event) => onSetWindow(Number(event.target.value) as WindowMinutes)}
          >
            {WINDOW_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {windowLabel(minutes)}
              </option>
            ))}
          </select>
        </label>

        {/* 10e §4 — glyph-only; the accessible name carries what the visible word used to. */}
        <button type="button" aria-label="Refresh now" title="Refresh now" onClick={onRefreshNow}>
          ⟳
        </button>

        <button
          type="button"
          aria-pressed={paused}
          aria-label={paused ? 'Resume polling' : 'Pause polling'}
          title={paused ? 'Resume polling' : 'Pause polling'}
          onClick={onPauseResume}
        >
          {paused ? '▶' : '❙❙'}
        </button>

        <span aria-hidden="true" className={styles.separator} />

        <button
          type="button"
          className={styles.logout}
          aria-label="Log out"
          title="Log out"
          onClick={onLogout}
        >
          ⏻
        </button>
      </div>
    </header>
  );
}
