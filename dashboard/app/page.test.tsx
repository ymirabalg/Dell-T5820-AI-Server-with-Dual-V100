import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import Page from './page';

/**
 * ⚠ **The entry point had no test of any kind** (10a-reconcile, adversarial F18): no test file
 * in the repo imported `app/page.tsx`, so mutating it to `return null` shipped a blank
 * dashboard with `pnpm verify` exiting 0. It is four lines, but they are the four lines
 * between a user and everything else — and `10a-DS1` proves the shell's own guard through a
 * DIRECT import of `DashboardShell`, which is exactly the route that skips this file.
 *
 * Rendered with no `window`, so `useTelemetry` returns `{ state: null, runtime: null }` and
 * `DashboardShell` takes 2.5a's guard — the same environment `dashboard-shell.ssr.test.tsx`
 * uses, for the same reason. What is under test here is only that the page mounts the shell:
 * the shell's own behaviour is that file's and `dashboard-shell.test.tsx`'s.
 */

describe('⚠ app/page.tsx mounts the dashboard shell', () => {
  test('⚠ the page renders the shell, not an empty document', () => {
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain('connecting');
    expect(html).not.toBe('');
  });

  test('⚠ the page itself carries no telemetry and no secret (HANDOVER §3.3 rule 16)', () => {
    // The asymmetry §3.3 documents: a revoked cookie can still fetch this HTML shell, so it
    // must contain nothing worth having until `/api/telemetry` 401s and hands off to `/login`.
    const html = renderToStaticMarkup(<Page />);
    expect(html).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(html.toLowerCase()).not.toContain('session');
    expect(html).not.toContain('°C');
  });
});
