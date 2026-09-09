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
 *
 * ### 10e — two forms by `size`, plus an orthogonal `code` modifier
 *
 * `size="md"` is the mock's `.chip` **pill**: a bordered, tinted, uppercase badge whose whole
 * body — border, background and text — carries the band, not merely its 9px glyph. That is a
 * deliberate departure from the dataviz "glyph-only colour" rule this component followed
 * before: a 9.5px uppercase word on a wall panel is read by its tint at a glance, and the
 * sr-only word still carries the fact for anyone who cannot see colour at all. `size="sm"` is
 * the mock's `.row__glyph` — a bare, unbordered glyph, colour-only on the glyph itself, which
 * is what a `Row`'s left edge and a log entry's severity tag both want.
 *
 * `code` (10e §2.0) is the mock's `.chip--code`: a throttle reason (`0x20 sw thermal
 * slowdown`) printed as data, never shouted into uppercase — `text-transform: none` and the
 * monospace face, so `0x4` cannot render `0X4`. It modifies the `md` pill's typography only;
 * the border/background/padding it sits inside are unchanged, which is why `code` is a
 * boolean modifier rather than a third `size`.
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

/**
 * The accessible word behind each glyph, read by assistive tech even with colour removed.
 * Exported so `Meter` — which otherwise carries its band as a fill colour and nothing else —
 * announces a band in the same words rather than a second spelling of them.
 */
export const SEVERITY_WORD: Readonly<Record<Severity, string>> = {
  normal: 'normal',
  watch: 'watch',
  alarm: 'alarm',
};

/**
 * ⚠ The no-band case says **"no severity band"**, not "no reading".
 *
 * `severity === null` means this reading has no §6.3 row to band it — which is NOT the same
 * as there being no reading. §6.3 is full of readings that exist and carry no severity:
 * `/health: null` is *"not probed this cycle"*, `ch5Mode: null` renders **`unavailable`, not
 * `—`** (§6.6), and invariant 3 says *"`EC auto` and `unavailable` are not severities"*. A
 * `Row` with `value="unavailable"` and `severity={null}` announced "no reading" beside a
 * value that is a reading. The chip only ever knows about bands, so that is all it claims.
 */
const NO_BAND_WORD = 'no severity band';

export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  /** The band this instant, undebounced — never a held/confirmed condition (rule 1). */
  readonly severity: Severity | null;
  /** Visible text beside the glyph — a value, a state word. Omit for a bare dot. */
  readonly label?: string;
  readonly size?: ChipSize;
  /** 10e §2.0 — the mock's `.chip--code`: `text-transform: none`, monospace, for a throttle
   *  reason (`0x20 sw thermal slowdown`) that must never be shouted into uppercase. Modifies
   *  a `size="md"` pill's typography only; omit (or `false`) for the ordinary uppercase pill. */
  readonly code?: boolean;
}

/** §6.2/§6.3's severity indicator — a glyph, an accessible word, and an optional label. */
export function Chip({ severity, label, size = 'md', code = false }: ChipProps) {
  const glyph = severity === null ? EM_DASH : GLYPH[severity];
  const word = severity === null ? NO_BAND_WORD : SEVERITY_WORD[severity];

  return (
    <span
      className={styles.chip}
      data-severity={severity ?? 'none'}
      data-size={size}
      data-code={code ? 'true' : undefined}
    >
      <span aria-hidden="true" className={styles.glyph}>
        {glyph}
      </span>
      <span className="sr-only">{word}</span>
      {label === undefined ? null : <span className={styles.label}>{label}</span>}
    </span>
  );
}
