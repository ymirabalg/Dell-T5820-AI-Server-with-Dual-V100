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
 *   mints is prefixed with it (`` `${panelId}-temp-trace` ``), genuinely — 10c1 wired the nine
 *   real panels in place of `PanelPlaceholder`, so this is now observable in a mounted chart's
 *   own `id` attribute rather than only in a marker `panel-placeholder.tsx` rendered on the
 *   type's behalf. See `10c1-build.md` §1 for what composing them for the first time found.
 * - **2.5e — chart sizing.** `components/grid.tsx`'s `CHART_SIZE` is exported for 10b to
 *   import; this file does not otherwise decide a size.
 *
 * ### 10c1 — the chart/table toggle (Q2-S2) is owned HERE, not by a panel
 *
 * `components/panels/gpu-panel.tsx`, `cpu-panel.tsx` and `cooling-panel.tsx` are the only
 * panels that draw a chart, and each takes an optional `view`/`onToggleView` pair. This file
 * is the one place `components/` is not — `app/` — so `chartViews` below is a plain `useState`,
 * one entry per chart-bearing panel, and `toggleChartView` is the only thing that ever changes
 * it. §6.2 (amended 2026-09-07/08) rules the control itself OUT of the header's four — "a
 * tooltip is part of a chart, not a control of the page" — which is why it is threaded down to
 * each panel instead of appearing beside `⟳`/`❙❙` below. `10c1-build.md` records the
 * granularity decision (one toggle per PANEL, not per chart) as invariant 7, since §6.2 does
 * not say.
 *
 * ### Formatting convention
 *
 * Every string handed to `Header` and `AlarmBanner` is already run through `lib/format.ts` —
 * neither component imports a formatter itself, the same rule `PanelShell.subtitle` set in
 * step 9. That keeps the header, the banner and the panels from ever disagreeing about how one
 * reading reads.
 */

import { useState } from 'react';

import { AlarmBanner } from '@/components/alarm-banner';
import type { AlarmBannerItem } from '@/components/alarm-banner';
import { Grid } from '@/components/grid';
import { Header } from '@/components/header';
import type { PanelProps } from '@/components/panel-props';
import type { BannerCondition } from '@/lib/client/banner';
import { bannerView } from '@/lib/client/banner';
import { ageMs, latestSample } from '@/lib/client/runtime';
import { useTelemetry } from '@/lib/client/use-telemetry';
import { GpuPanel } from '@/components/panels/gpu-panel';
import { CpuPanel } from '@/components/panels/cpu-panel';
import { MemoryPanel } from '@/components/panels/memory-panel';
import { CoolingPanel } from '@/components/panels/cooling-panel';
import { SafetyPanel } from '@/components/panels/safety-panel';
import { StorageNetworkPanel } from '@/components/panels/storage-network-panel';
import { ServingPanel } from '@/components/panels/serving-panel';
import { SessionEventLogPanel } from '@/components/panels/session-event-log-panel';
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

/** The four panels that draw a chart (§6.2) — the only ones Q2-S2's toggle reaches. */
type ChartPanelId = 'gpu0' | 'gpu1' | 'cpu' | 'cooling';
type ChartViewMap = Readonly<Record<ChartPanelId, 'chart' | 'table'>>;
const INITIAL_CHART_VIEWS: ChartViewMap = { gpu0: 'chart', gpu1: 'chart', cpu: 'chart', cooling: 'chart' };

export function DashboardShell() {
  const { state, runtime } = useTelemetry();
  const nowMs = useNowTick(AGE_TICK_MS);
  // ⚠ 10c1 — Q2-S2's table toggle. A `useState` call, unconditional and above the 2.5a early
  // return below (the Rules of Hooks bind even though `state` is `null` on a server render and
  // for one client frame): every hook in this file runs every render regardless of what it
  // renders. One entry per chart-bearing panel, not one flag for the whole page — flipping GPU
  // 0 to a table must not also flip GPU 1 or COOLING, which a single boolean could not express.
  const [chartViews, setChartViews] = useState<ChartViewMap>(INITIAL_CHART_VIEWS);
  const toggleChartView = (id: ChartPanelId): void =>
    setChartViews((prev) => ({ ...prev, [id]: prev[id] === 'chart' ? 'table' : 'chart' }));

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
          // ⚠ 10h — the RAW reading, kept whole in the item's `title` because the header
          // TRUNCATES the visible hostname to bound §6.1's `--band-reserve` (owner's ruling
          // 2026-09-10; a 79-character FQDN took the band 101.8 → 130.7 px and the page over).
          // `null` here renders no attribute at all, which is the shape §3.4's `model` uses.
          hostnameTitle={snapshot?.hostname ?? null}
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
        // ⚠ GPU is not built from `panel()`: `GpuPanelProps` narrows `panelId` to
        // `'gpu0' | 'gpu1'` (10b-F12), and `panel()`'s return type carries the full `PanelId`
        // union — spreading it would widen the literal back out and let a swapped slot
        // typecheck. Writing the two calls directly keeps the narrowing load-bearing.
        gpu0={
          <GpuPanel
            state={state}
            nowMs={nowMs}
            panelId="gpu0"
            view={chartViews.gpu0}
            onToggleView={() => toggleChartView('gpu0')}
          />
        }
        gpu1={
          <GpuPanel
            state={state}
            nowMs={nowMs}
            panelId="gpu1"
            view={chartViews.gpu1}
            onToggleView={() => toggleChartView('gpu1')}
          />
        }
        cpu={
          <CpuPanel
            {...panel('cpu')}
            view={chartViews.cpu}
            onToggleView={() => toggleChartView('cpu')}
          />
        }
        memory={<MemoryPanel {...panel('memory')} />}
        cooling={
          <CoolingPanel
            {...panel('cooling')}
            view={chartViews.cooling}
            onToggleView={() => toggleChartView('cooling')}
          />
        }
        safety={<SafetyPanel {...panel('safety')} />}
        storageAndNetwork={<StorageNetworkPanel {...panel('storage-and-network')} />}
        serving={<ServingPanel {...panel('serving')} />}
        sessionEventLog={<SessionEventLogPanel {...panel('session-event-log')} />}
      />
    </>
  );
}
