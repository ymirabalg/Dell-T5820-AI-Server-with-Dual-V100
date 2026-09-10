/**
 * 10e §2.0 — the mock's `.caption`: a muted 10.5px line with an optional bold lead label,
 * used for the GPU throttle line (`throttle` + one `Chip code` per reason) and STORAGE's link
 * line (`link` + a state pill). A plain function of already-built children — this file formats
 * nothing and decides no severity; it only lays out a label beside whatever it is given.
 *
 * ### ⚠ 10g/Q3 — `well` makes the children a ONE-LINE BOUNDED WELL
 *
 * Owner's ruling 2026-09-09 (`SPEC.md` §6.1): *"the GPU card's throttle line is a one-line well
 * like the notes blocks (its chips scroll within it), so a notable mask costs a fixed height
 * rather than +44 px per card."* Measured on this tree before the change: two notable bits are
 * one 17 px line, a third takes the caption to **44 px** — three lines, +27 px on row 1, and
 * `10e-Q2` measured a further bit taking it to 71. Unbounded, on the row that sets the page's
 * first term.
 *
 * Two details that are not incidental:
 *
 * - **The LABEL stays outside the well.** `throttle` is this line's equivalent of §6.4's
 *   pinned count: a well that scrolled its own name away would be a box with nothing saying
 *   what it is. So `well` wraps only the children, and the caption's own flex line puts the
 *   label beside it.
 * - **The well is a NAMED, focusable `role="group"`**, like every other bounded box on this
 *   page (10f-A6) — and the name is the caller's, required, because `PanelShell` gives its
 *   contents no accessible context and two GPU cards would otherwise announce the same words.
 *   ⚠ It gets the fade and NO `… N more`: chips wrap, so the number of chips PAST the first
 *   line is not derivable from data, and `components/` cannot measure. Recorded as a spec
 *   silence in `10g-build.md` §6.
 */

import type { ReactNode } from 'react';

import styles from './panel-text.module.css';

export interface CaptionProps {
  /** The bold lead word — `throttle`, `link`. Omit for a caption with no lead label. */
  readonly label?: string;
  /**
   * ⚠ 10g/Q3. When given, the children render inside a one-line bounded well that scrolls,
   * and this string is its accessible name (`role="group"`, `tabIndex={0}`). Omit for a
   * caption whose content is bounded by its own construction — STORAGE's link line is one
   * pill and one age, and a well round that is chrome spent on nothing. There is no default:
   * a well with a defaulted name is how nine wells came to announce the same three words.
   */
  readonly well?: string;
  readonly children?: ReactNode;
}

export function Caption({ label, well, children }: CaptionProps) {
  return (
    <p className={styles.caption}>
      {label === undefined ? null : <b className={styles.label}>{label}</b>}
      {well === undefined ? (
        children
      ) : (
        <span className={styles.well} role="group" tabIndex={0} aria-label={well} data-role="caption-well">
          {children}
        </span>
      )}
    </p>
  );
}
