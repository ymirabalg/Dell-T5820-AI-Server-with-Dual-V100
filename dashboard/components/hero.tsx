/**
 * §6.1's dominant figure — the mock's `.hero`: a big numeral with its unit, for GPU/CPU
 * temperature, RAM used and the fan5 headline. New in 10e (§2.0), which is also where
 * {@link Figure} lives — the GPU hero row's smaller power block, `.gpuTop__pw`.
 *
 * A pure function of already-formatted strings — `value`/`unit` come from one of
 * `lib/format.ts`'s `parts` variants (`formatCelsiusParts`, `formatRpmParts`, `formatGiBParts`,
 * `formatWattsParts` — O14), never from splitting a formatter's output on whitespace. Neither
 * this file nor its caller formats a number.
 *
 * ### ⚠ `value === EM_DASH` is its own rendered form, not a styled version of the normal one
 *
 * §6.6/invariant 1: `null` renders `—`. A hero showing that dash at the SAME 34px weight as a
 * real reading would read, at a glance, like an unusually large or small numeral rather than
 * "no reading" — exactly the ambiguity a wall panel cannot afford. So an unavailable reading
 * gets its own smaller, hatched, bordered form (the mock's `.hero--unk`) — the same diagonal
 * hatch a chart's gap mark and a no-band chip use, so "no reading" reads as ONE texture across
 * the whole page rather than three different ones. **The unit still renders** (`°C`, `RPM`) —
 * it is a fact about what WOULD have been measured, not a reading itself, so it survives
 * exactly as it does beside a readable value; only the numeral gets the hatch.
 *
 * ### Severity recolours the numeral only on watch/alarm
 *
 * `normal` and the no-band case both stay `--ink-primary` — colour on this wall is spent on
 * state (§6.3), so a healthy hero is not shouted at with a colour either. `watch` and `alarm`
 * both promote the numeral to `--ink-max` (pure white — reserved for exactly this, the banner
 * lead and the alarm log sentence); `alarm` adds a soft red glow so the worst reading on the
 * page is legible before the eye reaches its chip.
 */

import { EM_DASH } from '@/lib/format';
import type { Severity } from '@/lib/types';

import styles from './hero.module.css';
import './tokens.css';

export interface HeroProps {
  /** From a `parts` formatter's `.value` — the rounded numeral, or `EM_DASH`. */
  readonly value: string;
  /** From the same `parts` formatter's `.unit` — always the real unit, even beside `EM_DASH`. */
  readonly unit: string;
  /** The reading's own band (§6.3). `null`/omitted both render the unrecoloured form. */
  readonly severity?: Severity | null;
  /**
   * Optional accessible name for the whole figure, when the visible text alone would not say
   * what it is (most callers sit beside a panel title that already does).
   *
   * ⚠ 10e-A8: it renders `role="group"` alongside `aria-label`, and it must. A `<div>` with no
   * role maps to ARIA's `generic`, for which *ARIA in HTML* lists `aria-label` as PROHIBITED —
   * assistive technology is not required to expose it and generally does not (this is what
   * axe-core reports as `aria-prohibited-attr`). Before this the attribute was inert, and two
   * tests were defending an attribute that did nothing. `group` is used rather than `img`
   * because `img` would replace the figure's own numeral and unit with the label instead of
   * naming them.
   */
  readonly ariaLabel?: string;
}

export function Hero({ value, unit, severity, ariaLabel }: HeroProps) {
  const unknown = value === EM_DASH;
  return (
    <div
      className={styles.hero}
      data-severity={severity ?? 'none'}
      {...(ariaLabel === undefined ? {} : { role: 'group', 'aria-label': ariaLabel })}
    >
      <span className={unknown ? styles.valueUnknown : styles.value}>{value}</span>
      <span className={styles.unit}>{unit}</span>
    </div>
  );
}

export interface FigureProps {
  /** From a `parts` formatter's `.value`. */
  readonly value: string;
  readonly unit: string;
  /** The mock's `cap 250.0 W` line beneath — already-formatted, verbatim. Omit for no caption. */
  readonly caption?: string;
}

/** The GPU hero row's power block (10e §2.0) — right-aligned, a smaller sibling of `Hero`. */
export function Figure({ value, unit, caption }: FigureProps) {
  return (
    <div className={styles.figure}>
      <div className={styles.figureTop}>
        <span className={styles.figureValue}>{value}</span>
        <span className={styles.figureUnit}>{unit}</span>
      </div>
      {caption === undefined ? null : <p className={styles.figureCaption}>{caption}</p>}
    </div>
  );
}
