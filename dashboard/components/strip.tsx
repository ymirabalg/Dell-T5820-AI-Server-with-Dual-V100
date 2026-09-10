/**
 * §6.1's compact key/value line — the mock's `.strip`: GPU's `util · SM clk · served by
 * instance N` and CPU's `load`, each three readings costing one 14.8px line instead of three
 * 23px `Row`s. New in 10e (§2.0).
 *
 * A pure function of already-formatted `{ k, v }` pairs, rendered as a `<dl>` — semantically a
 * description list, which is what a strip of labelled facts actually is. Wraps onto more than
 * one line rather than truncating when the panel is narrow: `flex-wrap: wrap` on the list
 * breaks BETWEEN items, and `.v`'s `overflow-wrap: anywhere` breaks WITHIN one — which is not
 * decoration, because GPU's `served by instance N` carries `/v1/models`'s model id and that is
 * an absolute `.gguf` path whenever `serve-llm.sh set-model` was given no alias (10e-A2, and
 * F5 one primitive over). This is the only way this primitive grows, and it costs nothing when
 * everything fits on one line at the design width.
 *
 * ⚠ **10h — that path no longer reaches this primitive whole.** §3.4's ruling of 2026-09-10
 * renders `model` as its FILENAME (`lib/format.ts`'s `formatModelName`), so `gpu-panel.tsx`
 * passes the last segment as `v` and the raw string as {@link StripItem.title}. The wrapping
 * above stays exactly as it is: it is what happens to any long reading, and a long GPU name or
 * bus id can still reach it.
 */

import styles from './strip.module.css';
import './tokens.css';

export interface StripItem {
  readonly k: string;
  readonly v: string;
  /**
   * ⚠ 10h — the WHOLE reading behind a `v` the caller shortened, as the `<dd>`'s `title`.
   *
   * §3.4's ruling of 2026-09-10 renders `model` as its filename and keeps the raw value
   * *"reachable in the row's `title`"*; the GPU card's `served by instance N` is the other
   * place that reading appears. Optional and never derived from `v`: a `title` that repeats
   * the visible text is noise on every one of the other strip items.
   */
  readonly title?: string | null;
}

export interface StripProps {
  readonly items: readonly StripItem[];
}

export function Strip({ items }: StripProps) {
  return (
    <dl className={styles.strip}>
      {items.map((item) => (
        <div key={item.k} className={styles.item}>
          <dt className={styles.k}>{item.k}</dt>
          <dd className={styles.v} title={item.title ?? undefined}>
            {item.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
