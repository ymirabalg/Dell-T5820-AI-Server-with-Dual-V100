/**
 * The shape every parser in this step returns.
 *
 * A collector is split in two (the step's whole design constraint): a **pure parser**,
 * text in and typed values out, and a **thin IO wrapper** that fetches the bytes and
 * catches failure. This type is the seam between them.
 *
 * `problems` rather than `errors` because a parser does not know its own
 * {@link ErrorSource} — the same `parseHwmonMilliCelsius` serves `coretemp` today and
 * would serve any other hwmon node — and inventing one inside the parser would put a
 * §3.7 vocabulary value somewhere no test of the wrapper can see it. The wrapper tags
 * the messages, which is also the only place that knows *which* file it just failed to
 * read.
 *
 * ⚠ `problems` is not an error channel that replaces the value. Invariant 5 and §6.5: a
 * failed reading is a **partial** result plus an entry, never an exception and never an
 * empty result — `value` is always populated, with `null` in the fields that did not
 * parse. Nothing in this step throws.
 */
export interface ParseResult<T> {
  readonly value: T;
  /** Human-readable, one per failed *field*, so §6.5 can match an error to a figure. */
  readonly problems: readonly string[];
}

/** A successful parse with nothing to report. */
export const clean = <T>(value: T): ParseResult<T> => ({ value, problems: [] });
