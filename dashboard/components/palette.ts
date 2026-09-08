/**
 * The three chart series colours SPEC.md §9 already resolved, in one place.
 *
 * §9: *"GPU 0 `#3987e5` solid · GPU 1 `#199e70` dashed · fan 5 `#d95926`. Validated all-pairs
 * against the panel ground, worst protan/deutan ΔE 9.4. GPU 1 is deliberately not orange — an
 * orange line on a temperature chart reads as 'hot'."*
 *
 * These are exactly the dataviz skill's dark categorical slots 1 (blue), 3 (aqua) and 2
 * (orange) — re-purposed 1/3/2 rather than 1/2/3, which is consistent with the skill's own
 * "first three slots validate all-pairs" result (`references/palette.md`). Nothing here was
 * re-chosen; both sources agree and this module exists only so step 10 has one place to
 * import them from rather than re-typing hex.
 *
 * ⚠ **Do not add a fourth entry by generating a hue.** The skill's all-pairs floor holds for
 * exactly three slots in both modes; a fourth categorical series on this dashboard needs a
 * design decision (fold to "Other", facet), not a new hex here.
 */

export const SERIES_COLORS = {
  gpu0: '#3987e5',
  gpu1: '#199e70',
  fan5: '#d95926',
} as const;

export interface SeriesStyle {
  readonly color: string;
  readonly dashed: boolean;
}

/** §9's dash assignment. GPU 1 is the only dashed series; identity is colour + dash + label. */
export const SERIES_STYLES: Readonly<Record<keyof typeof SERIES_COLORS, SeriesStyle>> = {
  gpu0: { color: SERIES_COLORS.gpu0, dashed: false },
  gpu1: { color: SERIES_COLORS.gpu1, dashed: true },
  fan5: { color: SERIES_COLORS.fan5, dashed: false },
};
