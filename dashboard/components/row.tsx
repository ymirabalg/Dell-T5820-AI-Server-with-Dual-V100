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
 * ### 10e §2.0/§7(F5) — the value becomes a pill when `severity` is given, and always wraps
 *
 * When `severity` is passed (even `null`, the explicit no-band state), the value no longer
 * renders as plain text: it becomes a `Chip md` pill — `label={value}`, banded by `severity`
 * — inside a right-aligned `.end` group, the mock's own `chip(sev, state)` form (§2.0). A
 * left-edge `Chip sm` glyph still names the row's own band, so the two together read as
 * "here is the state, and here is how it should be judged" rather than one glyph doing both
 * jobs. Without `severity`, `.value` stays the plain 12px text it always was — there is
 * nothing to badge and no glyph to pair it with.
 *
 * **F5** (10e §7): SERVING's composite row (`:8080 · qwen3.6-27b · ctx 131,072 · health ok`)
 * overflowed a narrow column because `.value` could neither shrink nor wrap. `.value`/`.end`
 * are now `flex: 0 1 auto; min-width: 0` with `white-space: normal; overflow-wrap: anywhere`,
 * so a long value wraps onto a second line inside the row rather than spilling past it.
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
    <div
      className={styles.row}
      data-severity={severity === undefined ? undefined : (severity ?? 'none')}
    >
      {severity === undefined ? null : (
        <span className={styles.chip}>
          <Chip severity={severity} size="sm" />
        </span>
      )}
      <span className={styles.label}>{label}</span>
      {severity === undefined ? (
        <span className={styles.value}>{value}</span>
      ) : (
        <span className={styles.end}>
          <Chip severity={severity} size="md" label={value} />
        </span>
      )}
      {note === undefined || note === null || note === '' ? null : (
        <span className={styles.note}>{note}</span>
      )}
    </div>
  );
}
