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
    <PanelShell title="session event log" subtitle="state transitions since page load" chip={null}>
      <div
        className={styles.scroll}
        role="group"
        aria-label="session event log"
        tabIndex={0}
      >
        <ul className={styles.list}>
          {state.events.entries.map((entry) => (
            <li key={entry.seq} className={styles.entry}>
              <span className={styles.time}>{formatTimeOfDayMs(entry.atMs)}</span>
              <Chip severity={entry.severity} size="sm" />
              <span className={styles.sentence}>{describeEvent(entry)}</span>
              <span className={styles.source}>{entry.source}</span>
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
}
