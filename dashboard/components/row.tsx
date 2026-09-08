/**
 * A labelled key/value line for a panel body — `fan1  1,005 RPM`, `link  up`, `ufw enforcing
 * yes`. The SAFETY panel's "pass/warn/fail" list and most of COOLING/MEMORY/STORAGE's bodies
 * are rows.
 *
 * A pure function of already-rendered strings. `value` is whatever `lib/format.ts` produced
 * — this component never formats, parses or re-derives it (HANDOVER §3: "Never format a
 * number yourself"). `severity` is optional and, when given, renders a {@link Chip} — the
 * same undebounced-current-reading contract as `Chip` itself; `Row` adds nothing to it.
 *
 * ### ⚠ `note` is shown whenever given, with no policy about when it is redundant
 *
 * §6.5 has an exception — "an `—` whose cause is already shown beside it needs no entry of
 * its own" — but that rule needs to know about a *different, coloured* row in the *same
 * panel*, which is knowledge this leaf component does not have and must not guess at. Row
 * renders exactly the `note` it is given, including beside a value that is already `—`;
 * deciding when a note is redundant is §6.5's rule and belongs to whatever composes several
 * rows into a panel (step 10), not to the row itself.
 */

import type { Severity } from '@/lib/types';

import { Chip } from './chip';
import styles from './row.module.css';
import './tokens.css';

export interface RowProps {
  readonly label: string;
  /** Pre-formatted by `lib/format.ts`. Rendered verbatim. */
  readonly value: string;
  /**
   * Renders a leading {@link Chip} when given. Omit entirely for a row with no severity of
   * its own — that is a different thing from `severity={null}`, which renders a chip in the
   * explicit no-band state (O12).
   */
  readonly severity?: Severity | null;
  /** A trailing detail — an `errors[]` explanation, a staleness age. Omitted when empty. */
  readonly note?: string | null;
}

export function Row({ label, value, severity, note }: RowProps) {
  return (
    <div className={styles.row}>
      {severity === undefined ? null : (
        <span className={styles.chip}>
          <Chip severity={severity} size="sm" />
        </span>
      )}
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {note === undefined || note === null || note === '' ? null : (
        <span className={styles.note}>{note}</span>
      )}
    </div>
  );
}
