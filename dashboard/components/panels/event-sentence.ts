/**
 * §6.4's session event log — turning one {@link LogEntry}'s FACTS into the sentence a reader
 * sees.
 *
 * `lib/client/events.ts`'s own module doc is explicit that this is deliberately not done
 * there: *"§6.4 fixes neither the wording nor the tone of a log line, and `MOCK.html`'s column
 * layout … is a reference rather than a source. So a `LogEntry` carries the FACTS … and step
 * 10 writes the sentence. Recorded in the step notes: inventing copy here would put it out of
 * reach of the phase that owns the panel."* This is that phase, and this is that copy.
 *
 * Every branch is total over {@link LogEntryKind} — `noFallthroughCasesInSwitch` makes a new
 * kind a compile error here rather than a silent blank line in the log.
 *
 * ⚠ **Every branch that appends `— ${detail}` guards an empty `detail`** (the last two added
 * 2026-09-08 by 10b's reconciliation, adversarial F14). `source-lost` and `mode-stale` were
 * written that way from the start; `stale` and `reading-returned` were not, and interpolated
 * unguarded — a sentence ending `last value ` with a trailing space and a dangling dash. The
 * adversarial could not construct that from `events.ts` today, so this is a shape fix rather
 * than a live defect; it is worth taking because the inconsistency is the thing that makes the
 * next reader guess which branches are safe, and `describeEvent` is a total function of an
 * entry rather than of what `events.ts` happens to emit this month.
 */

import type { LogEntry } from '@/lib/client/events';

/** One line of §6.4's compact event log, from an entry's facts. */
export const describeEvent = (entry: LogEntry): string => {
  const { kind, label, from, to, detail } = entry;
  switch (kind) {
    case 'page-loaded':
      return 'page loaded';
    case 'band':
      return from === null ? `${label} ${detail}` : `${label} ${detail} (${from} → ${to})`;
    case 'standing':
      return from === null
        ? `${label} ${detail} · standing`
        : `${label} ${detail} (${from} → ${to}) · standing`;
    case 'source-lost':
      return detail === '' ? `${label} stopped answering` : `${label} stopped answering — ${detail}`;
    case 'source-recovered':
      return `${label} answering again`;
    case 'stale':
      return detail === '' ? `${label} stale` : `${label} stale — last value ${detail}`;
    case 'retired':
      return `${label} retired${from === null ? '' : ` (was ${from})`}`;
    case 'reading-returned':
      return detail === '' ? `${label} reading returned` : `${label} reading returned — ${detail}`;
    case 'conflict':
      return `${label}: ${detail}`;
    case 'mode-stale':
      return detail === '' ? 'dashboard stale' : `dashboard stale — ${detail}`;
    case 'mode-current':
      return 'dashboard live again';
  }
};
