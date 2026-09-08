/**
 * §6.5's *"its `errors` entry is available"* half, for the messages a panel has no single row
 * to hang them on.
 *
 * ### Why this exists (10b-reconcile, adversarial F5)
 *
 * `lib/client/observations.ts` splits §3.7's eighteen sources across panels **by the figure
 * each one blanks** — `coretemp`/`proc-stat`/`proc-loadavg`/`proc-cpuinfo` → CPU,
 * `proc-meminfo` → MEMORY, `statvfs`/`proc-net-dev`/`net-operstate` → STORAGE — and its own doc
 * says `collectHost` files nine sources for one crash *"precisely so this split is possible"*.
 * It was built for a consumer that then did not consume it: 10b's first draft never called
 * `errorsForPanel` from CPU or MEMORY at all, and STORAGE rendered only `net-operstate`. Eight
 * of the eighteen sources had **no rendering path to the screen**: `/proc/meminfo` failing gave
 * `RAM — / —` with nothing beside it anywhere on the page, which is precisely the unexplained
 * em dash §6.5 exists to forbid and §3.7 calls *"not actionable"*.
 *
 * ### Once per source, not once per figure
 *
 * `errorsForPanel`'s own doc settles the granularity: *"a source can blank several figures on
 * one panel — `dell-smm` blanks five channels and the mode — and §3.7's granularity is per
 * source, not per figure."* So a source that blanks exactly one row is rendered **on that
 * row** (`Row`/`StatusRow`'s own `note`/`detail`), and a source that blanks several is rendered
 * **once** here, under the rows it explains — matching COOLING's existing choice to attach its
 * one `dell-smm` entry once rather than repeat it beside five fans. One fact, stated once.
 *
 * Renders nothing at all for an empty list: `[]` from `errorsForPanel` means "no entry explains
 * this panel", which is knowledge, and knowledge renders as silence rather than as an empty
 * element with a stray separator.
 */

import type { TelemetryError } from '@/lib/types';

import styles from './panel-notes.module.css';

export interface PanelNotesProps {
  /** Already filtered by `errorsForPanel` and, where a row took one, by source. */
  readonly messages: readonly TelemetryError[];
}

export function PanelNotes({ messages }: PanelNotesProps) {
  if (messages.length === 0) return null;
  return (
    <div className={styles.notes}>
      {messages.map((e) => (
        <p key={`${e.source}:${e.message}`} className={styles.note}>
          {e.message}
        </p>
      ))}
    </div>
  );
}
