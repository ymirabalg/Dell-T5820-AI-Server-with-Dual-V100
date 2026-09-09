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
 *
 * ### ⚠ 10f/Q3 — `band={false}`: a chip that carries a FACT, not a verdict
 *
 * Owner's ruling 2026-09-09 (`SPEC.md` §6.2's GPU card paragraph): when another bit makes the
 * throttle line notable, the routine `0x4 sw power cap` *"is listed beside it as a **neutral,
 * unbanded code chip** (no colour, no glyph); only the notable bits carry their severity
 * colour."* Before this it painted a green `✓ NORMAL` pill — not styled as a *warning*, which
 * §6.2 forbids, but styled as a **verdict**, asserting the routine 250 W cap is healthy, and
 * `lib/throttle.ts`'s per-bit `normal` is that module's own construction rather than a §6.3
 * band (10e-A11). The same loop had already decided a `normal` `Meter` is deliberately grey
 * (*"colour is spent almost entirely on state"*), which this makes consistent.
 *
 * ⚠ **`band={false}` is NOT `severity={null}`, and the difference is the whole point.**
 * `severity={null}` is O12's *"this reading has no §6.3 row to band it"*: it renders the em
 * dash glyph on a hatched `--nodata` ground, and announces *"no severity band"* — the
 * vocabulary of a reading that could not be judged. `0x4` is not that. It was read, it is
 * known, and what it says is not a claim about state. So an unbanded chip drops the glyph, the
 * band word and the `data-severity` attribute entirely, and takes the base pill's own neutral
 * border and ground. Nothing else changes: it is still the same `code` pill in the same place.
 *
 * The default is `true`, so a caller that says nothing gets the banded chip it always got.
 *
 * ⚠ **`band` is a `md`-only modifier, and an `sm` chip is banded whatever it is passed
 * (10f-A6/A8, 2026-09-09).** An `sm` chip has no `label` slot at any call site: its entire
 * VISIBLE content is the glyph and its entire ANNOUNCED content is the `sr-only` band word, and
 * `.chip[data-size='sm']` fixes `width: 11px`. So `band={false}` there would render an empty
 * 11 px box with no `data-severity`, no glyph and nothing announced — a severity indicator that
 * says nothing, in the four places `sm` is used (`status-row.tsx`, `cooling-panel.tsx`,
 * `session-event-log-panel.tsx`, `safety-panel.tsx`). Nothing in the type forbade it and no
 * caller does it today (`band` is passed at exactly ONE site in the tree), which is precisely
 * why nothing would have caught it. `md` still honours `band={false}` — that is Q3's whole
 * point, and both directions are asserted in `chip.test.tsx` behind `10f-C5`.
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
  /**
   * 10f/Q3 — `false` renders §6.2's **neutral, unbanded** chip: no glyph, no colour, no
   * announced band word. See the module doc. Defaults to `true`, so every chip is banded
   * unless a caller says the fact it carries is not a state claim. ⚠ `md` only: an `sm` chip
   * is banded whatever this says, because the band is all it has (10f-A8).
   */
  readonly band?: boolean;
}

/** §6.2/§6.3's severity indicator — a glyph, an accessible word, and an optional label. */
export function Chip({ severity, label, size = 'md', code = false, band = true }: ChipProps) {
  const glyph = severity === null ? EM_DASH : GLYPH[severity];
  const word = severity === null ? NO_BAND_WORD : SEVERITY_WORD[severity];
  // ⚠ 10f-A8 — an `sm` chip IS its band: unbanding one leaves an empty 11px box that says
  // nothing at all. See the module doc; `md` still honours the prop, which is Q3's point.
  const banded = band || size === 'sm';

  return (
    <span
      className={styles.chip}
      data-severity={banded ? (severity ?? 'none') : undefined}
      data-size={size}
      data-code={code ? 'true' : undefined}
    >
      {!banded ? null : (
        <>
          <span aria-hidden="true" className={styles.glyph}>
            {glyph}
          </span>
          <span className="sr-only">{word}</span>
        </>
      )}
      {label === undefined ? null : <span className={styles.label}>{label}</span>}
    </span>
  );
}
