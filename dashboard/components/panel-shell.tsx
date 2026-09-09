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
 *
 * ### `data-severity` on the `<section>` now PAINTS (10e §2.0)
 *
 * `panel-shell.module.css` used to carry no `.panel[data-severity=…]` selector, so the
 * attribute was a contract with nothing behind it — `PS3` guarded that it never defaulted
 * `null` to the good band, but nothing was painted from it either. It now carries the mock's
 * severity stripe: a tinted border on `watch`/`alarm`, and — for `alarm` — a faint gradient
 * wash from the top of the panel, so a red panel is legible even before the eye reaches its
 * head chip. `chip ?? 'none'` computes the section's attribute exactly as before, and that
 * expression is unaffected by `chip` becoming optional below: `undefined ?? 'none'` is
 * `'none'`, the same as `null ?? 'none'` always was.
 *
 * ### 10e §2.0 — `chip` is now OPTIONAL, and omitting it is a THIRD state distinct from `null`
 *
 * `chip={null}` still renders today's hatched `—` pill — "no severity band", O12's explicit
 * no-band state, on a panel that HAS readings. Omitting `chip` entirely renders **no chip
 * element at all** — SESSION EVENT LOG's ruling (OQ-4, declined): the log has no §6.3 reading
 * to band and nothing that can fail in the way a blank em-dash pill would imply, so neither
 * the hatched `—` nor an invented debounce constant belongs in its head. The two states share
 * nothing in the DOM: `chip={null}` is `<Chip severity={null} />`; an omitted `chip` renders
 * no `<Chip>` at all. A caller that wants the old behaviour keeps writing `chip={null}` or
 * `chip={someSeverity}`, exactly as every panel but the log still does.
 *
 * ### 10e §2.0 — `headControl`
 *
 * An optional `ReactNode` rendered between the subtitle and the chip — `10e-match-the-mock`'s
 * home for the chart/table toggle (`ChartViewToggle`, restyled as a `Chip md` pill). Costs
 * **0px of body height**: the control lives in the 25.8px head row alongside the title and
 * chip rather than as its own line in the body, which is the whole point of moving it here
 * from a body-row button.
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
  /**
   * The panel's own severity (§6.3), on the current reading. `null` renders the explicit
   * no-band chip (O12). **Omitted entirely renders NO chip at all** — SESSION EVENT LOG's
   * only caller of that form (OQ-4); every other panel keeps passing `Severity | null`.
   */
  readonly chip?: Severity | null;
  /** 10e §2.0 — the chart/table toggle's home; 0px of body height. See the module doc. */
  readonly headControl?: ReactNode;
  readonly children: ReactNode;
}

export function PanelShell({ title, subtitle, chip, headControl, children }: PanelShellProps) {
  return (
    <section className={styles.panel} data-severity={chip ?? 'none'}>
      <header className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{subtitle}</p>
        <span className={styles.spacer} />
        {headControl}
        {chip === undefined ? null : <Chip severity={chip} />}
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
