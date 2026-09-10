/**
 * §6.4's sticky alarm banner — naming the condition, the value, and when it started, and
 * collapsing more than one into a lead item plus a count.
 *
 * A pure function of an already-reduced view. `lib/client/banner.ts`'s `bannerView` decides
 * WHICH condition leads and what the count is; this component only lays the result out, and
 * — the same convention `Header` and `PanelShell.subtitle` follow — every string here is
 * **pre-formatted by the caller**. `since` in particular is a formatted ELAPSED duration
 * (`'for 2 d 06:00'`, ruled 2026-09-08 S-C — it used to be a clock string, `'since 15:10:40'`),
 * not a raw `sinceMs`: this file does not import `lib/format.ts`, so it cannot disagree with
 * anything else on the page about how a duration reads.
 *
 * ⚠ **Renders nothing at all when there is no lead.** §6.4 never asks for an empty banner
 * shell, and an always-present-but-empty `<div role="alert">` would be exactly the kind of
 * landmark a screen reader announces for no reason on every single page.
 *
 * ⚠ **The count is DERIVED from the list, never passed in (10a-reconcile, adversarial F14).**
 * It used to be a third independent prop, so a caller could announce "7 active alarms" while
 * naming three — a lying banner in the one component whose entire job is an honest count,
 * with nothing enforcing the relation. `bannerView` still computes its own `count` (it is
 * §9's reduction, and it carries a mutation); this component simply cannot disagree with what
 * it renders.
 *
 * ⚠ **A stale item names the age of its reading (§6.5, adversarial F10).** `age` is
 * non-`null` exactly when the condition is stale, and pre-formatted like everything else
 * here. §6.5: "a reading that stopped and a subject that left must never look alike."
 *
 * ### ⚠ 10g/Q2 — the banner is a FIXED TWO-LINE BOX, and NOTHING is dropped to make it one
 *
 * Owner's ruling 2026-09-09 (`SPEC.md` §6.4): *"it is now a two-line (~66 px) scrolling box:
 * the lead with the count is always visible, and conditions beyond the second line scroll
 * within the banner. Nothing is dropped; the page grows by zero past six alarms."*
 *
 * The component's own contract is UNCHANGED and that is the point: `rest` is still rendered in
 * full, one `.item` per condition, so every condition's text is in the DOM at any count and
 * `lib/client/banner.ts`'s `rest: mapped.slice(1)` still needs no cap. What changed is one
 * stylesheet rule — `.rest` is a fixed one-line scrolling well — plus the name and tab stop
 * below that make the well reachable. Capping the LIST was the alternative and was not taken:
 * a banner that renders fewer conditions than it counts is the lying banner 10a-F14 already
 * removed from this file once.
 *
 * Measured before: 65.7 px at two alarms and at six, 92.5 at twelve, 173.1 / 146.2 / 119.4 at
 * twenty-one. After: one height at every count (`10g-build.md` §3).
 */

import styles from './alarm-banner.module.css';
import './tokens.css';

/** One alarm-level condition, laid out. */
export interface AlarmBannerItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Pre-formatted — `'for 2 d 06:00'`, an ELAPSED duration (ruled 2026-09-08, S-C), not a
   *  clock time: `since 03:00:14` on a wall panel open since Friday is indistinguishable from
   *  six hours ago. (This field used to carry a clock string, `'since 15:10:40'`, with no
   *  timezone — two doc comments here and in `dashboard-shell.tsx` used to claim one anyway,
   *  `'since 15:10:40 EDT'`, that the code never emitted — 10a-reconcile, adversarial F11.) */
  readonly since: string;
  /** §6.5's stale case, pre-formatted — `'last read 6:12 ago'`. `null` when the condition was
   *  carried by the most recent poll, which is the ordinary case and adds nothing. */
  readonly age: string | null;
}

export interface AlarmBannerProps {
  /** The oldest-standing one (`lib/client/banner.ts`'s ordering) — `null` renders nothing. */
  readonly lead: AlarmBannerItem | null;
  /** Every other alarm-level condition. Empty when exactly one is standing. */
  readonly rest: readonly AlarmBannerItem[];
}

export function AlarmBanner({ lead, rest }: AlarmBannerProps) {
  if (lead === null) return null;
  const count = 1 + rest.length;

  return (
    <div className={styles.banner} role="alert">
      <span aria-hidden="true" className={styles.glyph}>
        ✕
      </span>
      <div className={styles.body}>
        <div className={styles.head}>
          <span className={styles.count}>
            {count} active alarm{count === 1 ? '' : 's'}
          </span>
          <span className={styles.lead}>
            <b>
              {lead.label} {lead.value}
            </b>
          </span>
          <span className={styles.since}>{lead.since}</span>
          {lead.age === null ? null : <span className={styles.stale}>{lead.age}</span>}
        </div>
        {rest.length > 0 ? (
          // ⚠ 10g/Q2 — the SCROLLING half of §6.4's fixed two-line banner. Named and
          // `tabIndex={0}` for the same reason every other bounded box on this page is
          // (10f-A6): a scroll region nobody can reach hides what it holds, and here what it
          // holds is every alarm past the first line. The lead above is deliberately outside
          // it, so §6.4's *"the count is always visible"* needs no sticky positioning.
          <div
            className={styles.rest}
            role="group"
            tabIndex={0}
            aria-label="other alarm conditions"
            data-role="banner-rest"
          >
            {rest.map((item) => (
              // 10e §5 — `.item` is a REAL class now (10c1-A8's dangling `styles.item` was
              // fixed by removing the reference; this loop restores it as a genuine rule,
              // since the mock's `.item` carries its own border/background/padding — see
              // `alarm-banner.module.css`).
              <span key={item.id} className={styles.item}>
                {item.label} {item.value} <i className={styles.itemSince}>{item.since}</i>
                {item.age === null ? null : <i className={styles.stale}>{item.age}</i>}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
