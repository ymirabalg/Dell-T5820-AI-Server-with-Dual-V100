/**
 * The contract every one of 10b's nine panels is written against — **a real exported type, not
 * prose** (10a-reconcile, adversarial F16).
 *
 * `10a-build.md` §2.2 stated this shape in a document and `panel-placeholder.tsx`'s own doc
 * claimed it was "already wired end to end from the telemetry hook down". Neither was true in
 * code: there was no `PanelProps` anywhere, `PanelPlaceholder` took `{ title }` alone, and
 * `GridProps`'s nine slots are `ReactNode`, which **any** element satisfies. Nine panels could
 * each have invented a different prop name and shape and every one would have typechecked —
 * including the one fact a panel cannot derive for itself (§2.4/L4: *which instance am I*),
 * which is what stops two mounted copies of one `GpuPanel` from minting the same SVG `id`.
 *
 * So the contract is a type, and `dashboard-shell.tsx` really does pass all three to all nine
 * slots. 10b wrote the nine real panels against it; 10c1 did the swap — every
 * `<PanelPlaceholder …props />` is now the real panel (`<GpuPanel …props panelId="gpu0" />`,
 * `GpuPanel` deriving its own card index from `panelId` rather than taking a second, separately
 * mistakable `index` prop) — and `PanelPlaceholder` itself is deleted rather than kept around
 * implying a "pending" state that no longer exists (`10c1-build.md` §2). A panel that invents
 * its own prop names still fails `tsc`.
 *
 * ⚠ **The full `RuntimeState`, deliberately, not a pre-sliced subset.** Computing a panel's
 * slice IS its body's domain logic — the GPU↔instance join (`gpu.index === serving.instance`),
 * COOLING's channel-5 reasoning, SAFETY's `errorsForPanel` join — and all of it belongs to 10b.
 * The panel-body rules that bind on top of this type (HANDOVER §6): read `state.displayed`,
 * never `conditionsFrom`; a cell's colour is `lib/severity.ts` on the current reading, never
 * the debounced `displayed` severity; hatch `state.gaps`, never a hole in a series; 600 points
 * **per series**.
 */

import type { RuntimeState } from '@/lib/client/runtime';

/** Every grid slot's name, exactly as `GridProps` spells it — and the SVG-id namespace. */
export type PanelId =
  | 'gpu0'
  | 'gpu1'
  | 'cpu'
  | 'memory'
  | 'cooling'
  | 'safety'
  | 'storage-and-network'
  | 'serving'
  | 'session-event-log';

export interface PanelProps {
  /** The full, non-null `RuntimeState`. `app/`'s one 2.5a guard has already run (SCOPE §2.5a),
   *  so a panel never asks "has the hook mounted"; a `null` FIELD is an ordinary "no reading"
   *  and renders `—` exactly as invariant 1 requires, on poll 400 as on poll 1. */
  readonly state: RuntimeState;
  /** This tick's wall clock, from `app/use-now-tick.ts` (D2/2.5b). A panel that needs an age
   *  derives it from this and never reads a clock of its own — `components/` is hook-free and
   *  `Date.now()` inside a render would freeze exactly as F8 showed the shell's own would. */
  readonly nowMs: number;
  /** ⚠ **The SVG-id namespace (2.5d/L4).** The grid slot's own name, unique across the page.
   *  Every `id` a panel mints — a gradient, a clip path, an `aria-labelledby` — is prefixed
   *  with it (`` `${panelId}-temp-trace` ``). Two mounted instances of one component (`GpuPanel`
   *  at `gpu0` and `gpu1`) would otherwise collide, and a colliding SVG id surfaces as a chart
   *  painted with the wrong gradient — a bug that looks like a styling accident. */
  readonly panelId: PanelId;
}
