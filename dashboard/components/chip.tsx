/**
 * §6.2's panel-head chip and §6.3's inline severity indicator, in one primitive.
 *
 * A pure function of a {@link Severity}: no clock, no debounce, no store. §6.4 is explicit
 * that **a cell's colour is not `displayed`** — it comes from `lib/severity.ts` on the
 * current reading, undebounced — so this component takes the band it is given and does not
 * infer, hold or compare one. Whether the caller passes a debounced or undebounced band is
 * the caller's decision to get right (HANDOVER §6 rule 1); this file has no way to get it
 * wrong because it never sees a second reading to compare against.
 *
 * ### ⚠ `null` is not `'normal'` — O12, rendered
 *
 * A reading with no §6.3 band (an unobserved GPU, a metric with no threshold row) must not
 * be painted green. `severity === null` renders a distinct, uncoloured state — data-severity
 * `"none"` — never the good colour. "Do not invent a band" (HANDOVER O12) is a rule about
 * *severity.ts*; this is its rendering half, and it is exactly the thing a "helpful" default
 * of `severity ?? 'normal'` would violate.
 *
 * ### Colour is never the only channel
 *
 * dataviz: *"status colours … always ship with an icon + label, never colour alone."* Each
 * band gets its own glyph (already the app's vocabulary — `▲` and `✕` are `login-form.tsx`'s)
 * plus a visually-hidden word for assistive tech, so the same fact survives greyscale,
 * forced-colors and a screen reader.
 */

import { EM_DASH } from '@/lib/format';
import type { Severity } from '@/lib/types';

import styles from './chip.module.css';
import './tokens.css';

/** One glyph per band, plus the no-band case. Shared with any inline severity dot. */
const GLYPH: Readonly<Record<Severity, string>> = {
  normal: '✓', // ✓
  watch: '▲', // ▲ — login-form.tsx's own watch/warn glyph
  alarm: '✕', // ✕ — login-form.tsx's own alarm glyph
};

/** The accessible word behind each glyph, read by assistive tech even with colour removed. */
const WORD: Readonly<Record<Severity, string>> = {
  normal: 'normal',
  watch: 'watch',
  alarm: 'alarm',
};

export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  /** The band this instant, undebounced — never a held/confirmed condition (rule 1). */
  readonly severity: Severity | null;
  /** Visible text beside the glyph — a value, a state word. Omit for a bare dot. */
  readonly label?: string;
  readonly size?: ChipSize;
}

/** §6.2/§6.3's severity indicator — a glyph, an accessible word, and an optional label. */
export function Chip({ severity, label, size = 'md' }: ChipProps) {
  const glyph = severity === null ? EM_DASH : GLYPH[severity];
  const word = severity === null ? 'no reading' : WORD[severity];

  return (
    <span className={styles.chip} data-severity={severity ?? 'none'} data-size={size}>
      <span aria-hidden="true" className={styles.glyph}>
        {glyph}
      </span>
      <span className="sr-only">{word}</span>
      {label === undefined ? null : <span className={styles.label}>{label}</span>}
    </span>
  );
}
