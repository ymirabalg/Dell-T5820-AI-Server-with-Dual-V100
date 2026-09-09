/**
 * A {@link Row}-shaped line that can carry a WATCH-coloured trailing note, for the one case
 * `Row` was never built to say: §6.5's stale row.
 *
 * `Row`'s own `note` (`components/row.tsx`) is one fixed colour (`--ink-secondary`) for every
 * caller — right for an `errors[]` explanation, which is informational rather than a claim
 * about state. But S-B's ruling (`SPEC.md` §6.5, ruled 2026-09-08) requires a stale row's age
 * text to read `--status-watch`, matching `AlarmBanner`'s own `.stale` span exactly: *"the
 * CONDITION is still whatever it was — what this says is that nobody has been able to look
 * since, which is a different fact and must not read as a second alarm."*
 *
 * ### Why this is a new component instead of a prop added to `Row`
 *
 * `components/row.tsx` is step 9's, tested and mutation-backed by
 * `pipeline/steps/09-ui-primitives/regressions.py` — a harness this step does not own (ledger
 * ownership follows the FILE, per `HANDOVER.md` §5.2 rule 6). Adding a `noteTone` prop there
 * would need a mutation backed in THAT harness under a `10b-` id, which the id-prefix rule
 * (ANCHOR §9: "the prefix names the step that CREATED the mutation") does not forbid outright
 * but which risks entangling a foundational, already-reconciled primitive with this loop's
 * churn for a need only a handful of 10b rows have. A sibling component under `components/panels/`
 * — new, and squarely this loop's to own and to back — is the smaller, more reversible change.
 *
 * Every other rule `Row` documents applies unchanged here: `value` is pre-formatted by
 * `lib/format.ts` and rendered verbatim; `severity` omitted (not `null`) renders no chip at
 * all, `severity={null}` renders the explicit no-band state (O12); `note` is shown exactly as
 * given, with no redundancy policy (that is the caller's, per §6.5's "already shown beside it"
 * exception, which needs knowledge of a *different* row this component cannot have).
 *
 * ### ⚠ Why there are TWO note slots, added 2026-09-08 (10b-reconcile, adversarial F3)
 *
 * Every stale-capable row was originally written `note={age ?? errorsMessage}`, and `??` makes
 * the age **displace** the explanation. Those two co-occur precisely in the case that matters:
 * a source stops answering, so `errors[]` gains an entry *and* the conditions it fed go stale.
 * Rendered, `no hwmon named dell_smm` appeared **nowhere on the COOLING panel** at the exact
 * moment it was the answer, while the identical snapshot without the staleness showed it
 * correctly — §3.7's *"an alarm with no explanation beside it is not actionable"*, inverted by
 * an operator-precedence choice.
 *
 * They are two different facts and both fit on the row, so the row carries both: `note` is
 * S-B's stale age (watch-toned when `noteTone` says so) and `detail` is the `errors[]`
 * explanation, always muted — an explanation is informational and must never read as a second
 * alarm, which is the same reasoning `noteTone` itself was built on.
 *
 * ### 10e §2.0/§2.7 — the value becomes a pill, and three SERVING-only slots
 *
 * When `severity` is given (§2.0, matching `Row`'s identical rule), `value` no longer renders
 * as plain text: it becomes a `Chip md` pill inside a right-aligned `.end` group — the mock's
 * `chip(sev, state)`. `note`/`detail` are UNCHANGED: both still force their own full line
 * (the mock's `.row__note--full`, +13.1px each) exactly as before this loop.
 *
 * SERVING's row (§2.7) needs three more pieces `Row`/`StatusRow` never had, because its value
 * used to be one hand-joined string (`:8080 · qwen3.6-27b · ctx 131,072 · health ok`) that F5
 * found could neither shrink nor wrap. It is now three separate pieces, none of them forced
 * onto their own line the way `note`/`detail` are — they wrap naturally WITH the row's first
 * line, which is what keeps a healthy instance on one line at 1280px and lets a narrow column
 * wrap it instead of overflowing:
 *
 * - `secondaryLabel` — a second name span right after `label` (the port, `:8080`).
 * - `inline` — plain supplementary text (model · ctx), positioned like `.note` but WITHOUT
 *   `note`'s forced-full-width rule — the mock's plain, non-`--full` `.note`.
 * - `endPrefix` — plain muted text inside `.end`, before the value/pill (`health ok`, ahead
 *   of the unit-state pill).
 *
 * All three are optional and unused by every caller but SERVING, which is why they do not
 * disturb SAFETY, COOLING or STORAGE's simpler rows.
 */

import type { Severity } from '@/lib/types';

import { Chip } from '../chip';
import styles from './status-row.module.css';
import '../tokens.css';

export type StatusRowNoteTone = 'muted' | 'watch';

export interface StatusRowProps {
  readonly label: string;
  /** Pre-formatted by `lib/format.ts`. Rendered verbatim. */
  readonly value: string;
  /** Omit for a row with no severity of its own. `null` renders the explicit no-band chip. */
  readonly severity?: Severity | null;
  /** 10e §2.7 — a second name span right after `label` (SERVING's `:${port}`). Non-full-width,
   *  wraps naturally with the row rather than forcing its own line. */
  readonly secondaryLabel?: string;
  /** 10e §2.7 — plain supplementary text (SERVING's `model · ctx`), positioned like `.note`
   *  but never forced onto its own line — the mock's plain `.note`, distinct from `note`/
   *  `detail` below, which ARE forced full-width. */
  readonly inline?: string | null;
  /** 10e §2.7 — plain muted text inside `.end`, ahead of the value/pill (SERVING's `health
   *  ok`, ahead of the unit-state pill). */
  readonly endPrefix?: string;
  /** A trailing detail — an `errors[]` explanation, or S-B's stale-age text. Forces its own
   *  full-width line (the mock's `.row__note--full`), unlike `inline` above. */
  readonly note?: string | null;
  /** `'watch'` for S-B's stale-age text; `'muted'` (default) for everything else. */
  readonly noteTone?: StatusRowNoteTone;
  /**
   * A SECOND trailing detail, always muted — §6.5's `errors[]` explanation, shown *alongside*
   * a stale age rather than displaced by it. See the module doc: `note={age ?? message}` drops
   * the cause exactly when the cause exists.
   */
  readonly detail?: string | null;
}

const shown = (text: string | null | undefined): text is string =>
  text !== undefined && text !== null && text !== '';

export function StatusRow({
  label,
  value,
  severity,
  secondaryLabel,
  inline,
  endPrefix,
  note,
  noteTone = 'muted',
  detail,
}: StatusRowProps) {
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
      {secondaryLabel === undefined ? null : (
        <span className={styles.secondaryLabel}>{secondaryLabel}</span>
      )}
      {!shown(inline) ? null : <span className={styles.inline}>{inline}</span>}
      <span className={styles.end}>
        {endPrefix === undefined ? null : <span className={styles.endPrefix}>{endPrefix}</span>}
        {severity === undefined ? (
          <span className={styles.value}>{value}</span>
        ) : (
          <Chip severity={severity} size="md" label={value} />
        )}
      </span>
      {!shown(note) ? null : (
        <span className={noteTone === 'watch' ? styles.noteWatch : styles.note}>{note}</span>
      )}
      {!shown(detail) ? null : <span className={styles.note}>{detail}</span>}
    </div>
  );
}
