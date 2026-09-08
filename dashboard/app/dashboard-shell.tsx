'use client';

/**
 * The step 10a assembly seam — §6.1's header, §6.4's banner and §6.1's grid, wired to exactly
 * one `useTelemetry()`. See `pipeline/steps/10-panels-assembly/10a-build.md` §1 for the
 * hook-boundary decision this follows: everything under `components/` (including
 * `components/panels/`, once 10b creates it) is pure and prop-driven, and this file — under
 * `app/`, where hooks are allowed — is the one place state is called.
 *
 * ### The assembly seams this file closes (SCOPE §2.5)
 *
 * - **2.5a — `state === null` is handled ONCE, here.** Everything below the early return sees
 *   a real, non-null `RuntimeState`; a `null` field on it (no sample yet) is a legitimate
 *   "no reading" that formatters already render as `—` — nine panels do not each need their
 *   own `if (state === null)` branch.
 * - **2.5b — the age indicator's own interval.** `useNowTick` is a second, independent hook
 *   call, never derived from `state`. `ageText` is recomputed every tick regardless of
 *   whether a poll landed, which is the whole point (D2).
 * - **2.5d — unique SVG ids.** `panelId` — the grid slot's own name — is passed to all nine
 *   slots as part of `components/panel-props.ts`'s `PanelProps`, and every SVG id a panel
 *   mints is prefixed with it (`` `${panelId}-temp-trace` ``). No chart is mounted until 10b's
 *   panels replace `PanelPlaceholder`, but the namespace is real, threaded and asserted now
 *   rather than described in a document — that gap was adversarial F16.
 * - **2.5e — chart sizing.** `components/grid.tsx`'s `CHART_SIZE` is exported for 10b to
 *   import; this file does not otherwise decide a size.
 *
 * ### Formatting convention
 *
 * Every string handed to `Header` and `AlarmBanner` is already run through `lib/format.ts` —
 * neither component imports a formatter itself, the same rule `PanelShell.subtitle` set in
 * step 9. That keeps the header, the banner and (once 10b lands) the panels from ever
 * disagreeing about how one reading reads.
 */

import { AlarmBanner } from '@/components/alarm-banner';
import type { AlarmBannerItem } from '@/components/alarm-banner';
import { Grid } from '@/components/grid';
import { Header } from '@/components/header';
import { PanelPlaceholder } from '@/components/panel-placeholder';
import type { PanelProps } from '@/components/panel-props';
import type { BannerCondition } from '@/lib/client/banner';
import { bannerView } from '@/lib/client/banner';
import { ageMs, latestSample } from '@/lib/client/runtime';
import { useTelemetry } from '@/lib/client/use-telemetry';
import {
  formatAge,
  formatText,
  formatTimeOfDay,
  formatUptime,
  formatZoneAbbreviation,
} from '@/lib/format';
import { LOGIN_PATH, SESSION_PATH } from '@/lib/auth/login-view';
import { seconds } from '@/lib/types';

import styles from './dashboard-shell.module.css';
import { useNowTick } from './use-now-tick';

/** §6.2's age indicator ticks every second — the same granularity `formatAge` renders at. */
const AGE_TICK_MS = 1000;

/**
 * §6.4's banner "since", as an ELAPSED duration — `'for 2 d 06:00'` — ruled 2026-09-08 (S-C).
 *
 * ⚠ **This used to be a clock time** (`` `since ${formatTimeOfDay(...)}` ``, F12/10a-reconcile).
 * `since 03:00:14` on a wall panel open since Friday is indistinguishable from six hours ago,
 * and decision 7 makes multi-day the expected case for this machine — §6.4's own justifying
 * example never leaves one day. A date prefix on the clock time was the alternative considered
 * and explicitly NOT taken: it preserves the exact instant but answers "when did it start" when
 * the operator's question is "how long has this been wrong".
 *
 * ⚠ **Reuses `formatUptime`'s vocabulary, not a new formatter** (§6.6 pins the locale once, and
 * this project has already had to fix a locale in four places) — `'for'` is `formatUptime`'s
 * own day/hour/minute arithmetic with a different leading word, added to `lib/format.ts` for
 * exactly this call.
 *
 * ⚠ **Must AGREE IN FORM with F10's stale-age text** (`'last read 6:12 ago'`, ruled S-B, below)
 * — both name an elapsed duration now, never a clock time.
 *
 * ⚠ **Changes the RENDERING only.** `sinceMs` is still §6.4's "first observation of the
 * CONFIRMED band" (O4); only `nowMs − sinceMs` is now formatted as a duration instead of
 * `sinceMs` alone being formatted as an instant. Clamped at zero — the same convention
 * `formatAge` uses for a clock-skewed `ts` (§6.6) — since `sinceMs` is a browser-clock value
 * that should never be later than `nowMs`, but a negative duration must never render as one.
 */
const sinceText = (sinceMs: number, nowMs: number): string =>
  formatUptime(seconds(Math.max(0, nowMs - sinceMs) / 1000), 'for');

/**
 * §6.5's stale age, for §6.4's banner — `'last read 6:12 ago'`.
 *
 * ⚠ **Only for a STALE condition** (10a-reconcile, adversarial F10). §6.5: a condition whose
 * subject stopped being reported "keeps its last confirmed band and its 'since', still counts
 * (§9), and **its row and the banner name the age of the reading**." Without this the banner
 * presents a six-minute-old 82 °C exactly as it presents a live one, and §6.5's closing rule is
 * that "a reading that stopped and a subject that left must never look alike". A live condition
 * gets `null` — its value IS this poll's, and an age beside it would be noise.
 */
const staleAgeText = (c: BannerCondition, nowMs: number): string | null =>
  c.stale ? `last read ${formatAge(nowMs - c.lastSeenMs)} ago` : null;

const toBannerItem = (c: BannerCondition, nowMs: number): AlarmBannerItem => ({
  id: c.id,
  label: c.label,
  value: c.value,
  since: sinceText(c.sinceMs, nowMs),
  age: staleAgeText(c, nowMs),
});

/** 2.5a's wrapper: before the first client render settles, or on the server, there is nothing
 *  to format — and nothing here may render `—` for a reading that simply has not been asked
 *  for yet. No telemetry, no formatter, no numbers: this is "the page has not started" itself,
 *  not "the machine has no reading". */
function ConnectingShell() {
  return (
    <main
      // ⚠ Tokens, not literals (10a-reconcile, adversarial F18): `#7c848e` and a hand-copied
      // font stack were a second source of truth for values `components/tokens.css` already
      // owns, and this is the ONE thing a user sees during the server-rendered frame.
      // `app/layout.tsx` imports `tokens.css` globally, so `var()` resolves here even though
      // no `components/` file has rendered yet.
      style={{
        fontFamily: 'var(--font-mono)',
        padding: '2rem',
        color: 'var(--ink-muted)',
      }}
    >
      <p style={{ margin: 0 }}>ai-server dashboard — connecting…</p>
    </main>
  );
}

export function DashboardShell() {
  const { state, runtime } = useTelemetry();
  const nowMs = useNowTick(AGE_TICK_MS);

  // ⚠ 2.5a, and the ONLY place in this assembly this check is made. `runtime` is checked
  // alongside `state` defensively — both come from the same hook and become non-null
  // together in practice, but nothing downstream should have to re-derive that.
  if (state === null || runtime === null) return <ConnectingShell />;

  const sample = latestSample(state);
  const snapshot = sample?.snapshot ?? null;

  const banner = bannerView(state.displayed);

  const onLogout = (): void => {
    // ⚠ `keepalive: true` is load-bearing, and the comment that used to sit here was FALSE
    // (10a-reconcile, adversarial F15). A plain `fetch` is terminated when its document
    // unloads, and `window.location.assign` on the next line starts exactly that — so the
    // `DELETE` was racing the navigation. Nothing is "abandoned client-side": the session
    // cookie is `httpOnly` (§5), so only the server's `Set-Cookie` on this response can clear
    // it, and §5's revocation ("logout records the session id in memory and every `/api/*`
    // check consults it") never happens either. A dropped DELETE leaves a valid cookie for its
    // full 30 days while the operator is looking at a login screen — `proxy.ts` lets `/login`
    // through unconditionally — and §5 notes there is no other way to invalidate a session you
    // do not hold short of rotating `SESSION_SECRET` by hand. `keepalive` is what lets the
    // request outlive the document; the browser guarantees delivery is attempted.
    void fetch(SESSION_PATH, { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(
      () => {
        // Still best-effort: a network that is down cannot be made to deliver. What changed is
        // that OUR OWN navigation no longer cancels it.
      },
    );
    window.location.assign(LOGIN_PATH);
  };

  // ⚠ F16: the props contract 10b writes against, built once and spread into every slot, so
  // `state`/`nowMs`/`panelId` are genuinely threaded rather than described in a document.
  const panel = (panelId: PanelProps['panelId']): PanelProps => ({ state, nowMs, panelId });

  const age = ageMs(state, nowMs);

  return (
    <>
      {/* ⚠ ONE sticky band, not two sticky siblings (F13) — see `dashboard-shell.module.css`. */}
      <div className={styles.stickyBand}>
        <Header
          hostname={formatText(snapshot?.hostname ?? null)}
          uptime={formatUptime(snapshot?.host.uptimeSec ?? null)}
          severity={state.severity}
          mode={state.mode}
          alarms={state.alarms}
          timeOfDay={formatTimeOfDay(sample?.ts ?? null)}
          zoneAbbreviation={formatZoneAbbreviation(sample?.ts ?? null)}
          // ⚠ The trailing word is composed HERE, not in `Header` (F9): `formatAge(null)` is
          // `—`, and appending inside the component rendered `— ago` — an em dash wearing a
          // unit word, which no other formatter output in this project produces.
          ageText={age === null ? formatAge(null) : `${formatAge(age)} ago`}
          cadenceSeconds={state.preferences.cadenceSeconds}
          windowMinutes={state.preferences.windowMinutes}
          paused={state.paused}
          onSetCadence={(seconds) => runtime.setCadence(seconds)}
          onSetWindow={(minutes) => runtime.setWindow(minutes)}
          onRefreshNow={() => runtime.refreshNow()}
          onPauseResume={() => (state.paused ? runtime.resume() : runtime.pause())}
          onLogout={onLogout}
        />
        {/* ⚠ No `count` prop (F14): `AlarmBanner` derives its own from the list it renders, so
            the number it announces cannot drift from the conditions it names. */}
        <AlarmBanner
          lead={banner.lead ? toBannerItem(banner.lead, nowMs) : null}
          rest={banner.rest.map((c) => toBannerItem(c, nowMs))}
        />
      </div>
      <Grid
        gpu0={<PanelPlaceholder title="GPU 0" {...panel('gpu0')} />}
        gpu1={<PanelPlaceholder title="GPU 1" {...panel('gpu1')} />}
        cpu={<PanelPlaceholder title="cpu" {...panel('cpu')} />}
        memory={<PanelPlaceholder title="memory" {...panel('memory')} />}
        cooling={<PanelPlaceholder title="cooling" {...panel('cooling')} />}
        safety={<PanelPlaceholder title="safety" {...panel('safety')} />}
        storageAndNetwork={
          <PanelPlaceholder title="storage & network" {...panel('storage-and-network')} />
        }
        serving={<PanelPlaceholder title="serving" {...panel('serving')} />}
        sessionEventLog={
          <PanelPlaceholder title="session event log" {...panel('session-event-log')} />
        }
      />
    </>
  );
}
