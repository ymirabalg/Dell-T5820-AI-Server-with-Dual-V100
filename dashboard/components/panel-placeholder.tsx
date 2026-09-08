/**
 * ⚠ **The 10a/10b seam, decided and recorded here rather than left implicit.**
 *
 * SCOPE.md §2 (10a's handoff, "belongs to 10b: the nine panel bodies") asks 10a to leave
 * "something in the grid cells to lay out against" and to decide, on the record, whether that
 * is a minimal stub, `PanelShell` used directly, or a fixture.
 *
 * **Decision: `PanelShell` used directly, with a fixed placeholder body and no live
 * telemetry in the head.** Concretely: `title` is the real §6.2 panel name (the one fact
 * about a panel's identity that cannot be wrong), `subtitle` is a literal placeholder string
 * rather than a computed one, and `chip` is always `null` (§6.3's "no band" state, never a
 * guessed colour). Two decisions this rules out, and why:
 *
 * - **Not a bare `<div>` stub.** `PanelShell` already owns the `title · subtitle · chip`
 *   head convention (§6.2) and its CSS; a bare stub would make 10b re-derive that shape
 *   inside every one of the nine panel bodies instead of inheriting it once.
 * - **Not a real, telemetry-driven subtitle/chip.** Computing a GPU's `<name> · <bus>` or a
 *   panel's own §6.3 severity is domain logic that belongs to the specific panel body — e.g.
 *   the GPU↔instance join, or COOLING's channel-5 reasoning — and none of it is in 10a's
 *   scope (SCOPE §2.1). Wiring it here would be 10b's job done early and worse, against a
 *   guess about what each panel needs rather than what its body actually turns out to need.
 *
 * What this buys 10b: the grid slot, the panel-head chrome, and — since 10a's reconciliation
 * (adversarial F16) — `PanelProps` as a **real exported type this component implements**,
 * with `state`, `nowMs` and `panelId` genuinely passed from `dashboard-shell.tsx` to all nine
 * slots. The earlier version of this paragraph claimed that wiring existed when it did not:
 * the props were local `const`s in the shell that reached nothing. Replacing
 * `<PanelPlaceholder title="GPU 0" {...props} />` with `<GpuPanel {...props} index={0} />` is
 * now a genuine one-line swap, and a panel that invents its own prop names fails `tsc`.
 *
 * ⚠ It renders `data-panel-id` so the id namespace is **observable**, not merely declared —
 * `dashboard-shell.test.tsx` asserts all nine are present, distinct, and match their grid
 * slot. 10b's panels should keep prefixing their SVG ids with the same value (L4).
 */

import type { PanelProps } from './panel-props';
import { PanelShell } from './panel-shell';
import styles from './panel-placeholder.module.css';
import './tokens.css';

export interface PanelPlaceholderProps extends PanelProps {
  /** The real §6.2 title, exactly as 10b's panel will use it — casing included. */
  readonly title: string;
}

const PLACEHOLDER_SUBTITLE = 'assembled in step 10b';

// `state` and `nowMs` are deliberately not destructured: a placeholder has no body to read
// them with, and 10a must not guess at what a panel will do with them (SCOPE §2.1). They are
// in the TYPE, and really passed, which is the part that had to be true before 10b starts.
export function PanelPlaceholder({ title, panelId }: PanelPlaceholderProps) {
  return (
    <PanelShell title={title} subtitle={PLACEHOLDER_SUBTITLE} chip={null}>
      <p className={styles.pending} data-panel-id={panelId}>
        panel body pending — see pipeline/steps/10-panels-assembly
      </p>
    </PanelShell>
  );
}
