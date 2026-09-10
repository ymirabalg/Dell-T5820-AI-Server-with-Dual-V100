/**
 * §6.2's `label · value · chip` line — every row on every panel, and the one carrier of §6.5's
 * stale age and its `errors[]` explanation.
 *
 * ### ⚠ It began as a sibling of step 9's `Row`, and it is now the only one (10f/Q12)
 *
 * `components/row.tsx` was step 9's primitive, and this file was written beside it rather than
 * as a prop added to it: S-B's ruling (`SPEC.md` §6.5, ruled 2026-09-08) requires a stale row's
 * age text to read `--status-watch` — matching `AlarmBanner`'s own `.stale` span exactly, *"the
 * CONDITION is still whatever it was … which must not read as a second alarm"* — where `Row`'s
 * `note` was one fixed `--ink-secondary` for every caller, and adding `noteTone` there would
 * have entangled an already-reconciled step-9 primitive, and its harness, with 10b's churn.
 *
 * 10e then converted all seven remaining `Row` call sites to this component, leaving `Row`
 * green, mutation-backed and defending no shipped rendering at all — `<Row` appeared only in
 * its own test file. **The owner ruled it deleted on 2026-09-09 (10e-Q12)**, so `row.tsx`,
 * `row.module.css`, `row.test.tsx` and their mutations are gone, and this is the row.
 *
 * Every rule `Row` documented applies unchanged here: `value` is pre-formatted by
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
 *
 * ### ⚠ 10f/Q1 — `detail` renders inside a BOUNDED scroll box (SPEC §6.1, ruled 2026-09-09)
 *
 * `detail` carries the collector's own message (S-H), so its length is not this component's to
 * choose and was not bounded by anything: four explained SAFETY rows measured **+143 px** at
 * 1280×1024 against §2.11's budgeted +76.4, and the page missed the fold. The ruling makes it a
 * fixed-height scroll box — the message stays whole and is read by scrolling — and the height
 * lives in `status-row.module.css`'s `.note`, with the arithmetic beside it.
 *
 * Two consequences visible here: the well is a named, keyboard-reachable `role="group"` (a
 * scroll box no one can scroll hides the very text §3.7 requires beside the alarm), and the
 * WATCH-toned `note` deliberately does not get one — S-B's `last read 6:12 ago` is bounded by
 * its own construction. A muted `note` renders through the same bounded class as `detail`,
 * since nothing distinguishes the two as text: both are a trailing explanation.
 *
 * ### ⚠ `panel` — a well's name must be unique on the PAGE, not within its row (10f-A6)
 *
 * 10f first named both wells `` `${label} explanation` ``. Measured on the all-collectors-failed
 * page: that name is announced by **two different units in two different panels** — COOLING's
 * `gpu-fan-control.service` row and SAFETY's own `fan service` row are both labelled
 * `fan service`, and both render a `dbus` explanation at the same time. `PanelShell` renders a
 * bare `<section>` with no accessible name, so ARIA maps it to `generic` and the panel supplies
 * the well no context at all: the well's name is the whole announcement. Hence `panel`, which
 * every caller fills with its own `PanelShell` title, and hence two different words for the two
 * slots — a row carrying a muted `note` AND a `detail` would otherwise put two identically-named
 * groups side by side inside one row (no caller does today: every call site passes `note` as
 * S-B's age with `noteTone="watch"`, which is not a well — but nothing forbids it, and the
 * collision would be silent). `panel` is required for the same reason `PanelNotes.subject` is:
 * a defaulted one lets the next call site re-create the collision without a test noticing.
 */

import type { Severity } from '@/lib/types';

import { Chip } from '../chip';
import styles from './status-row.module.css';
import '../tokens.css';

export type StatusRowNoteTone = 'muted' | 'watch';

export interface StatusRowProps {
  /**
   * The panel this row is in — its `PanelShell` title, used only to make the well's accessible
   * name unique on the page (`` `${panel} ${label} explanation` ``). ⚠ Required, not defaulted:
   * see the module doc (10f-A6). It renders no visible text.
   */
  readonly panel: string;
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
  /**
   * ⚠ 10h — the WHOLE string behind a shortened `inline`, as the element's `title`.
   *
   * §3.4's ruling of 2026-09-10 shortens `model` to its filename on screen and says the full
   * value stays *"reachable in the row's `title`"*. This is that attribute, and it is separate
   * from `inline` rather than derived from it because only the caller knows whether what it
   * shortened HAS a longer form: passing `inline` twice would put a `title` on every row that
   * merely repeats what is already rendered.
   */
  readonly inlineTitle?: string | null;
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
  panel,
  label,
  value,
  severity,
  secondaryLabel,
  inline,
  inlineTitle,
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
      {!shown(inline) ? null : (
        <span className={styles.inline} title={inlineTitle ?? undefined}>
          {inline}
        </span>
      )}
      <span className={styles.end}>
        {endPrefix === undefined ? null : <span className={styles.endPrefix}>{endPrefix}</span>}
        {severity === undefined ? (
          <span className={styles.value}>{value}</span>
        ) : (
          <Chip severity={severity} size="md" label={value} />
        )}
      </span>
      {!shown(note) ? null :
        noteTone === 'watch' ? (
          <span className={styles.noteWatch}>{note}</span>
        ) : (
          <span className={styles.note} role="group" tabIndex={0} aria-label={`${panel} ${label} note`}>
            {note}
          </span>
        )}
      {!shown(detail) ? null : (
        <span className={styles.note} role="group" tabIndex={0} aria-label={`${panel} ${label} explanation`}>
          {detail}
        </span>
      )}
    </div>
  );
}
