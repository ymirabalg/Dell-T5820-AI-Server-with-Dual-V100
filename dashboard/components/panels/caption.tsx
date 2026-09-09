/**
 * 10e §2.0 — the mock's `.caption`: a muted 10.5px line with an optional bold lead label,
 * used for the GPU throttle line (`throttle` + one `Chip code` per reason) and STORAGE's link
 * line (`link` + a state pill). A plain function of already-built children — this file formats
 * nothing and decides no severity; it only lays out a label beside whatever it is given.
 */

import type { ReactNode } from 'react';

import styles from './panel-text.module.css';

export interface CaptionProps {
  /** The bold lead word — `throttle`, `link`. Omit for a caption with no lead label. */
  readonly label?: string;
  readonly children?: ReactNode;
}

export function Caption({ label, children }: CaptionProps) {
  return (
    <p className={styles.caption}>
      {label === undefined ? null : <b className={styles.label}>{label}</b>}
      {children}
    </p>
  );
}
