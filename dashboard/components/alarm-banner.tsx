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
 * Measured before: 65.7 px at two alarms and at six, 92.5 at twelve, 173.1 / 146.2 / 119.4 at
 * twenty-one. After: one height at every count (`10g-build.md` §3).
 *
 * ### ⚠⚠ 10h — the banner SHOWS WHAT FITS AND COUNTS THE REST (`SPEC.md` §6.4, 2026-09-10)
 *
 * 10g deliberately did NOT cap the list — *"a banner that renders fewer conditions than it
 * counts is the lying banner 10a-F14 already removed from this component once"* — and one day
 * later the owner ruled the other way, on a measurement that settles it: with the well fixed
 * at one line, **16 of 21 conditions were unreachable at 1280**. `offsetHeight − clientHeight`
 * was 0 at every count, so no scrollbar occupied layout, and §6.1's subject is *"the
 * single-screen wall panel"*, which has no pointer and no keyboard. *"Nothing is dropped"* was
 * true of the DOM and false of the screen.
 *
 * So the banner renders {@link BANNER_REST_SHOWN} conditions past the lead and a **`+N more`**
 * for the remainder. The two properties that keep it from being 10a-F14's lying banner again:
 *
 * - the pinned count is still 1 + `rest.length`, DERIVED from the whole list, so it is the
 *   number of standing conditions and never the number drawn; and
 * - every condition is accounted for on screen — `1 + shown + hidden === count`, exactly —
 *   rather than silently absent. What F14 removed was a count that could disagree with its own
 *   list; what this adds is a second count that reconciles with it.
 *
 * Nothing is lost: every condition is still in its own panel and in the session event log,
 * both of which the ruling names as the places it remains readable. `lib/client/banner.ts`
 * still returns `rest` uncapped — the cap is a RENDERING decision and lives with the box whose
 * width decides it, not in the reduction.
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

/**
 * ⚠ 10h/§6.4 — how many conditions past the lead the banner's one line RENDERS.
 *
 * Measured, not chosen (10g-A6, `adv-banner.mjs` B1, at 1280x1024): with `.rest` taking the
 * banner's full width, **four items are fully visible** at 6, 12 AND 21 conditions — the rest
 * were scrolled out of a well with no scrollbar in layout, on a wall panel with no pointer, so
 * at 21 conditions 16 of the 20 were unreadable. The `+N more` marker takes one of those four
 * slots, which leaves **three**.
 *
 * ⚠ It is a CONSTANT, and it has to be: what actually fits is a function of the rendered text
 * width, which `components/` cannot measure (`purity.test.ts`), and this is the design width
 * §6.1 names. At >=1600px more would fit — measured, the first hidden condition appeared at
 * twelve rather than at six — so this is a floor there rather than the exact answer, and that
 * is recorded as a spec silence in `10h-build.md` §6 rather than papered over with a
 * viewport-tracking hook.
 */
export const BANNER_REST_SHOWN = 3;

export function AlarmBanner({ lead, rest }: AlarmBannerProps) {
  if (lead === null) return null;
  // ⚠ The count is still DERIVED from the WHOLE list (10a-F14): `rest` arrives uncapped and
  // this is the total number of standing conditions, never the number rendered. The cap below
  // decides only how many are DRAWN, and the remainder is stated beside them — so the banner
  // still cannot claim a number it is not accounting for.
  const count = 1 + rest.length;
  const shown = rest.slice(0, BANNER_REST_SHOWN);
  const hidden = rest.length - shown.length;

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
          // ⚠ 10h/§6.4 — the second line is the well PLUS the `+N more` count, and the count
          // is a SIBLING of the well rather than a child of it. Inside, it would be one more
          // flex item competing for the same line and could itself be the item pushed out of
          // view — a marker that says how much you cannot see, which you cannot see.
          <div className={styles.restLine}>
            {/* ⚠ 10g/Q2 — the SCROLLING half of §6.4's fixed two-line banner. Named and
                `tabIndex={0}` for the same reason every other bounded box on this page is
                (10f-A6): a scroll region nobody can reach hides what it holds. The lead above
                is deliberately outside it, so §6.4's *"the count is always visible"* needs no
                sticky positioning. It stays a scroller after 10h's cap: the cap is a constant
                and a long enough label can still overflow one line, and then the fade says so
                rather than the tail vanishing silently. */}
            <div
              className={styles.rest}
              role="group"
              tabIndex={0}
              aria-label="other alarm conditions"
              data-role="banner-rest"
            >
              {shown.map((item) => (
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
            {hidden === 0 ? null : (
              // ⚠ SPEC §6.4's `+N more`, ruled 2026-09-10. A count, never a sentence — and NOT
              // `aria-hidden`, unlike a well's marker: these conditions really are absent from
              // the banner's DOM, so this is the only thing that tells a screen-reader user the
              // list it just read is partial. They remain in their own panels and in the
              // session event log, which is why the ruling permits dropping them here at all.
              <span className={styles.more} data-role="banner-more">{`+${hidden} more`}</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
