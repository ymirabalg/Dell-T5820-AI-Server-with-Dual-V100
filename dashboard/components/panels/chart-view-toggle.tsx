/**
 * §6.2's chart/table toggle, as a pure control — built by 10c1 because the placement question
 * (SCOPE handoff §2.2) has an explicit answer in the spec, and this file exists to render at
 * that answer rather than at the header.
 *
 * ⚠ **Where this renders, and why it is not a header control.** §6.2, amended 2026-09-07/08:
 * "That is the whole header, and the list is exhaustive" (cadence, window, refresh,
 * pause/resume, logout) — and separately, of the hover layer and table view: "They remain
 * outside §6.2's four controls, which govern the *dashboard* … A tooltip is part of a chart,
 * not a control of the page." So this control is rendered by each chart-bearing PANEL, next
 * to its own chart, never threaded up into `Header`. That the table view is per-chart rather
 * than per-page is the same reasoning `HANDOVER.md` §3.5 gives for the toggle's STATE: "a
 * primitive that picked its own size would be deciding layout from a leaf, one level up" —
 * putting the switch in the header would be deciding a chart's own affordance from the top,
 * one level down.
 *
 * ⚠ **The state itself cannot live here.** `purity.test.ts` forbids every hook in
 * `components/`, so this is a pure function of `view` and `onToggle` — both the caller's
 * (`app/dashboard-shell.tsx`), exactly as `Sparkline`/`StackedTimeSeriesChart` already
 * document for `view` itself. This file only renders the affordance; it never remembers
 * which state was last shown.
 *
 * ⚠ **Granularity, invariant 7 — the spec does not say whether a toggle governs one chart or
 * a whole panel's charts, and this is recorded rather than guessed at silently.** §6.2 says a
 * panel may draw more than one chart (CPU has two independent sparklines: temperature and
 * utilisation) without saying whether each gets its own switch. This build gives ONE toggle
 * per PANEL, governing every chart that panel draws, because: (1) a reader who wants the
 * numbers usually wants all of a panel's numbers, not one trace at a time; (2) a
 * two-button CPU card doubles the control surface for a panel that is already the shortest
 * card on the page; (3) GPU's own promoted-chart mechanism (§6.1's ≥1600px rule) already
 * shows exactly one of two chart elements at a time by CSS, so a single `view` value naturally
 * covers whichever one is visible. If a future panel's charts turn out to want independent
 * toggles, that is a new decision, not an extension of this one.
 */

import styles from './chart-view-toggle.module.css';

export interface ChartViewToggleProps {
  readonly view: 'chart' | 'table';
  /** Always provided in production (`dashboard-shell.tsx` owns the state); a caller with
   *  nothing to toggle simply omits this component rather than passing a no-op. */
  readonly onToggle: () => void;
  /** What this control switches — used only for the accessible name, e.g. "GPU 0 temperature"
   *  or "CPU charts" — never rendered as visible copy beyond the button's own short label. */
  readonly label: string;
}

/** §6.2's chart/table switch. Pure; mints no id, reads no clock, remembers nothing. */
export function ChartViewToggle({ view, onToggle, label }: ChartViewToggleProps) {
  const isTable = view === 'table';
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={isTable}
      onClick={onToggle}
      aria-label={`${label}: show as ${isTable ? 'chart' : 'table'}`}
    >
      {isTable ? 'chart view' : 'table view'}
    </button>
  );
}
