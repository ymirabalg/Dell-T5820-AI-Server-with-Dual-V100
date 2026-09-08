/**
 * §6.2's panel head — `title · subtitle · chip` — plus the body container every panel wraps
 * its rows/meters/charts in.
 *
 * A pure function of already-decided strings and a severity. `PanelShell` does not know
 * which panel it is: the nine panels (GPU ×2, CPU, MEMORY, COOLING, SERVING, STORAGE &
 * NETWORK, SAFETY) and the grid that places them are step 10's job — building them here
 * would be exactly the "stop, you're doing step 10's job out of order" the handoff warns
 * about. This is the shell, nothing more.
 *
 * ### ⚠ `title` is never transformed
 *
 * §6.2's own prose is internally inconsistent — "the panel's name, **lower case**: `GPU 0`,
 * `cpu`, `cooling`, `serving`" lists `GPU 0` as an example of lower case, which it is not.
 * Reading that literally rather than "fixing" it: the CASING DECISION is the caller's
 * (`GPU 0`/`GPU 1` keep their acronym capitals; the rest are written lower case), and this
 * component renders whatever string it is handed without applying `.toLowerCase()` or any
 * other transform. Recorded per invariant 7 rather than guessed at silently.
 *
 * ### `subtitle` is rendered even when it is `—`
 *
 * §6.2: *"A subtitle is `—` when its field is `null`, like any other reading … A GPU whose
 * `name` failed to parse does not lose its subtitle; it shows what it has."* So there is no
 * branch here that hides an empty-looking subtitle — the caller has already run it through
 * `lib/format.ts`, and whatever comes back is what renders.
 */

import type { Severity } from '@/lib/types';
import type { ReactNode } from 'react';

import { Chip } from './chip';
import styles from './panel-shell.module.css';
import './tokens.css';

export interface PanelShellProps {
  /** The panel's name, exactly as the caller decided to case it — never transformed here. */
  readonly title: string;
  /** Identity, never measurement (§6.2) — pre-formatted, `—` when its source field is `null`. */
  readonly subtitle: string;
  /** The panel's own severity (§6.3), on the current reading — `null` when nothing bands. */
  readonly chip: Severity | null;
  readonly children: ReactNode;
}

export function PanelShell({ title, subtitle, chip, children }: PanelShellProps) {
  return (
    <section className={styles.panel} data-severity={chip ?? 'none'}>
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{subtitle}</p>
        <Chip severity={chip} />
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
