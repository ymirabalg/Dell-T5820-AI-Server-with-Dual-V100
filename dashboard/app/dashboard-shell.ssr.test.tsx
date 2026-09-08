import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { DashboardShell } from './dashboard-shell';

/**
 * 10a-test finding: `dashboard-shell.tsx` had NO test file at all before this one, despite
 * being where 2.5a's *only* `state === null` guard lives — the one place invariant 1's
 * "before the first poll, never render `—`" rule can be gotten wrong for the whole assembly.
 *
 * `use-telemetry.ts`'s own contract (`held.current === null && typeof window !== 'undefined'`)
 * means `runtime`/`state` are `null` **only when there is no `window`** — i.e. only during a
 * server render. In jsdom or a real browser, `held.current` is populated synchronously on the
 * very first render, so `ConnectingShell` is unreachable there (confirmed empirically: loading
 * the real dev server in a browser never showed "connecting…", not even for one frame — the
 * grid was already live on first paint). So the ONLY environment that can exercise this branch
 * at all is `renderToStaticMarkup` with no `window`, which is exactly what
 * `use-telemetry.ssr.test.tsx` already established as this project's pattern for that half of
 * D6. This file is the missing other half: it proves the ASSEMBLY, not just the hook, honours
 * 2.5a's rule that a server render — or a client's first paint before hydration — shows
 * "connecting…" and NOTHING that could be mistaken for a reading.
 *
 * ⚠ **What this file does NOT cover, and where it now IS covered.** Once `state` is non-null
 * (every client render), this component's field-by-field wiring — `Header`'s
 * `ageText`/`severity`/`mode`/`alarms`, every control callback, the banner's `toBannerItem`
 * mapping, `onLogout` — is not exercised here at all. That was a real hole: the adversarial
 * phase hard-coded `mode={'live'}` and `alarms={0}`, inverted pause/resume and killed the
 * cadence handler, and `pnpm verify` still exited 0 across all 77 files, on a build that can
 * never say "paused" and reads `● all healthy` on six alarms — `PLAN.md`'s own green
 * criterion, unable to fail. **`app/dashboard-shell.test.tsx` closes it** (jsdom, a mocked
 * `useTelemetry`, no real poll loop). This file stays what it always was: the SERVER frame.
 *
 * ⚠ So read `10a-DS1` for exactly what it is — the guard proved against a condition a browser
 * never reaches. The SSR frame is real HTML a user is served, so it is worth its mutation, but
 * it is not evidence about 2.5a's stated purpose (the browser's pre-first-poll frame, where
 * `state` is non-null and every field is legitimately `—`).
 */

describe('⚠ 2.5a on the server — no window — the ONE null guard in the whole assembly', () => {
  test('⚠ renders "connecting…" and nothing else — no em dash, no numbers, no panel', () => {
    const html = renderToStaticMarkup(<DashboardShell />);
    expect(html).toContain('connecting');
  });

  test('⚠ never renders the invariant-1 "no reading" glyph before the first poll has even started', () => {
    // This is NOT the "no reading yet" case invariant 1 already covers (a formatter turning a
    // null FIELD into a standalone `—`) — it is "the page has not started," which must not look
    // like a reading at all. `ConnectingShell`'s own prose uses an em dash as ordinary
    // punctuation ("ai-server dashboard — connecting…"), which is not this rule's concern; what
    // would BE a violation is a formatter's own `—` sitting inside a rendered element on its
    // own, `>—<`, which is what every null-field formatter in this project actually emits.
    const html = renderToStaticMarkup(<DashboardShell />);
    expect(html).not.toContain('>—<');
  });

  test('⚠ renders none of the assembly it wraps — no header, no grid, no panel placeholders', () => {
    const html = renderToStaticMarkup(<DashboardShell />);
    expect(html).not.toContain('GPU 0');
    expect(html).not.toContain('all healthy');
    expect(html).not.toContain('assembled in step 10b');
  });
});
