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
 */

import styles from './strip.module.css';
import './tokens.css';

export interface StripItem {
  readonly k: string;
  readonly v: string;
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
          <dd className={styles.v}>{item.v}</dd>
        </div>
      ))}
    </dl>
  );
}
