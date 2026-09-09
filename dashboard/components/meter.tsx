/**
 * §6.2's VRAM/RAM/disk bar — "the fill carries severity … the unfilled track is a lighter
 * step of the same ramp" (dataviz).
 *
 * A pure function of `used`/`total` (for the geometry) and a caller-supplied `severity` (for
 * the colour) plus an already-formatted `formattedValue` (for the text). This component
 * never formats a number — `formattedValue` comes from `lib/format.ts`'s `formatMiBPair` /
 * `formatGiB` pair-printing, and `used`/`total` here feed only the fill's WIDTH, a rendering
 * computation, not a displayed numeral.
 *
 * ### ⚠ Boundary behaviour, each with a fixture on both sides (HANDOVER §5.1)
 *
 * - `used`/`total` both readable → a fill clamped to `[0, 100]`.
 * - Either `null`, non-finite, or `total <= 0` → **no fill at all** (width 0), never `NaN%`
 *   or a fill that silently claims 100%. A percentage that cannot be computed is not zero
 *   usage — it is unknown, and unknown draws an empty bar, not an empty-*looking* full one.
 * - `used === 0` is a real reading (a fresh reboot, an idle card) and renders a genuine
 *   zero-width fill on a track that is otherwise fully drawn — invariant 1's "zero is a
 *   reading" applies to the geometry exactly as it does to a formatted numeral.
 * - `used > total` (should not happen upstream, but this is a leaf component with no
 *   authority over its caller) clamps to 100 rather than overflowing the track.
 *
 * `severity` colours the fill via `data-severity`, the same closed, finite vocabulary `Chip`
 * selects on — never an inline colour, because unlike a chart series this is one of three
 * fixed bands, not an arbitrary hex (see the step notes on the CSS approach).
 *
 * ### 10e §2.0 — a `normal` meter is NOT green, and an optional tick mark
 *
 * The fill's colour is now the mock's own rule (§6.3: *"colour is spent almost entirely on
 * state"*): `normal` and the no-band case both draw the SAME neutral `--meter` fill —
 * everything is grey until something is actually wrong, and only `watch`/`alarm` recolour
 * the bar. The built `color-mix`-tinted track (a different shade of green/amber/red behind
 * every fill) is gone; the track is one flat sunken ground in every band. `tickPercent`
 * (optional) draws the mock's watch-threshold mark — VRAM 90, RAM 85, disk-free 15 (as
 * `100 − free`) — a thin rule at a fixed position, independent of the fill: it never claims a
 * value of its own, so it needs no severity and no formatted text.
 *
 * ### ⚠ The band is a WORD as well as a colour, and the bar itself is not announced twice
 *
 * The track used to carry `role="img"` with `aria-label={`${label}: ${formattedValue}`}` —
 * the label and the value that are already visible text directly above it, so a screen
 * reader read the whole meter twice. Worse, everything the bar added over that text was the
 * **colour of the fill**: unlike `Chip`, `Meter` paired its band with no glyph and no word,
 * which is precisely the colour-only encoding §6.3 ("distinguishable without relying on
 * colour alone") and the dataviz reference ("status colours … always ship with an icon +
 * label, never colour alone") both forbid. The bar is now `aria-hidden` — it is a picture of
 * text that is already present — and the band travels as a visually-hidden word beside the
 * value, in `Chip`'s own vocabulary. `severity === null` adds nothing: there is no band to
 * name, and the value is already there.
 */

import type { Severity } from '@/lib/types';

import { SEVERITY_WORD } from './chip';
import styles from './meter.module.css';
import './tokens.css';

export interface MeterProps {
  readonly label: string;
  /** Pre-formatted — e.g. `26,452 / 32,768 MiB`, or `—` (never computed here). */
  readonly formattedValue: string;
  readonly used: number | null;
  readonly total: number | null;
  readonly severity: Severity | null;
  /** 10e §2.0 — the mock's watch-threshold mark (VRAM 90, RAM 85, disk-free 15). A fixed
   *  position on the track, independent of the fill; omit for a track with no such mark. */
  readonly tickPercent?: number;
}

/** `null` when no fill can be honestly drawn; otherwise a percentage clamped to `[0, 100]`. */
const fillPercentOf = (used: number | null, total: number | null): number | null => {
  if (used === null || total === null) return null;
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.max(0, (used / total) * 100));
};

export function Meter({ label, formattedValue, used, total, severity, tickPercent }: MeterProps) {
  const fillPercent = fillPercentOf(used, total);

  return (
    <div className={styles.meter}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{formattedValue}</span>
        {severity === null ? null : <span className="sr-only">{SEVERITY_WORD[severity]}</span>}
      </div>
      <div className={styles.track} data-severity={severity ?? 'none'} aria-hidden="true">
        <div
          className={styles.fill}
          style={{ width: fillPercent === null ? '0%' : `${fillPercent}%` }}
        />
        {tickPercent === undefined ? null : (
          <div className={styles.tick} style={{ left: `${tickPercent}%` }} />
        )}
      </div>
    </div>
  );
}
