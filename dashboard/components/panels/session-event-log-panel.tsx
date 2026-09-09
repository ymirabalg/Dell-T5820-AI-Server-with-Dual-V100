/**
 * §6.4's SESSION EVENT LOG — *"a compact scrolling list of state transitions observed since
 * page load, newest first … lost on reload, by design."*
 *
 * ⚠ **§6.1's no-scroll promise governs the PAGE, not this component** (clarified 2026-09-08 —
 * see the handoff and §6.2's own COOLING table-view ruling, which draws the identical
 * distinction for a chart's table view). This panel scrolls within its own bounded container;
 * the page around it does not.
 *
 * `state.events.entries` is already newest-first and capped at 500 (`lib/client/events.ts`'s
 * `MAX_EVENTS`) — this file renders exactly what it is given and caps nothing a second time.
 * `event-sentence.ts`'s `describeEvent` turns each entry's facts into the line shown; see that
 * file's module doc for why the wording lives there and not in `lib/client/events.ts`.
 *
 * ### ⚠ Invariant 7 — two things §6.2 does not name, recorded rather than guessed
 *
 * 1. **§6.2's fixed-subtitle table lists a label for MEMORY / SERVING / SAFETY / STORAGE &
 *    NETWORK and says nothing about this panel at all.** `"state transitions since page load"`
 *    is chosen here as an identity string in the same register as the others — it answers
 *    *what am I looking at*, not *how many entries are there* — and is recorded as a decision
 *    for the owner to confirm or overrule, not asserted as settled spec text.
 * 2. **§6.2 gives every panel a chip, and this one has no §6.3 reading to band.** `chip={null}`
 *    is the explicit no-band state (O12) rather than an invented "all clear" green — the log
 *    is not itself a measurement, so there is nothing for §6.3 to have an opinion about.
 *
 * ⚠ **10b-S-F does not reach this panel.** Its chip is the constant `null`, never `'normal'`,
 * so the ruling's downgrade (`normal` + a null reading → no band) has no `'normal'` to ever
 * downgrade. Recorded rather than left to be re-derived the next time this file is read next
 * to the ruling.
 *
 * ### 10e/OQ-4 — the chip is OMITTED, not `chip={null}`
 *
 * §9's ruling on OQ-4 (declined): the head renders NOTHING in the chip slot — not the hatched
 * `—` `chip={null}` would draw (which reads as "this panel HAS readings and none of them
 * band"), and not an invented debounce constant either. `PanelShell`'s `chip` prop is now
 * OPTIONAL for exactly this: omitting it entirely renders no `<Chip>` element at all, which is
 * this file's only change from the pre-10e version — the log itself, and this rationale, are
 * otherwise the same as before this loop (§6.1's `PanelShell` docs have the full contrast
 * between "omitted" and "null").
 *
 * ### 10e §2.8 — the fixed-height well, and the row's new column order
 *
 * `.scroll` becomes a genuinely bounded well (`height: 84px`, not `max-height`) with its own
 * border and sunken ground, so the panel is 133.8px whether the log holds one entry or five
 * hundred (F1, §7, already closed by `panel-shell.module.css`'s `position: relative`). Each
 * row's column order moves from `time · chip · sentence · source` to the mock's
 * `time · source · chip · sentence` — `describeEvent`'s sentences and `entry.source` are
 * unchanged, only where they sit.
 */

import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { Chip } from '../chip';
import { describeEvent } from './event-sentence';
import { formatTimeOfDayMs } from './panel-chart';

import styles from './session-event-log-panel.module.css';

// ⚠ `nowMs` is not read: every entry's own `atMs` is the wall-clock fact §6.4 asks this panel
// to show, and none of it is an age that would need "now" to compute.
// ⚠ `panelId` is not read (10b-reconcile, adversarial F13). It is the SVG-id NAMESPACE
// (`panel-props.ts`), not a display string, and this file used to interpolate it into the
// scroll region's accessible name — which a screen reader read aloud as
// "session-event-log session event log", the slot id, hyphens and all, in front of a name that
// already said the same thing. This panel mints no ids, so the namespace has nothing to prefix
// here; no other panel puts `panelId` in user-visible text either.
export function SessionEventLogPanel({ state }: PanelProps) {
  return (
    <PanelShell title="session event log" subtitle="state transitions since page load">
      <div
        className={styles.scroll}
        role="group"
        aria-label="session event log"
        tabIndex={0}
      >
        <ul className={styles.list}>
          {state.events.entries.map((entry) => (
            <li key={entry.seq} className={styles.entry} data-severity={entry.severity ?? 'none'}>
              <span className={styles.time}>{formatTimeOfDayMs(entry.atMs)}</span>
              <span className={styles.source}>{entry.source}</span>
              <Chip severity={entry.severity} size="sm" />
              <span className={styles.sentence}>{describeEvent(entry)}</span>
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
}
