import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// ⚠ The token palette, imported once at the root (10a-reconcile, adversarial F18). Every
// `components/` primitive imports this file too (repeated imports of identical global CSS are
// idempotent), but the root layout and `DashboardShell`'s "connecting…" frame both paint
// ground colours BEFORE any component has rendered — so without this import their `var()`
// references would resolve to nothing on exactly the first frame a user sees.
import '@/components/tokens.css';

export const metadata: Metadata = {
  title: 'ai-server',
  description: 'Read-only telemetry for ai-server',
};

/**
 * The document shell. The chrome inside it — header, banner, grid, panels — is step 10's.
 *
 * The background is painted explicitly (SPEC.md §9: single dark theme, no light variant), so
 * nothing inherits a light ground from the browser default.
 *
 * ⚠ **The values are tokens, not literals (10a-reconcile, adversarial F18).** This used to
 * hard-code `#0b0d10` / `#c8cdd4` — a blue-tinted ground and ink that matched NEITHER
 * `tokens.css`'s `--surface-0: #0d0d0d` nor `--ink-secondary: #c3c2b7`. So the page had two
 * sources of truth for the same ground, the panels sat on a colour no panel used (visible
 * through the grid's own gap and padding), and a future change to `--surface-0` would have
 * left this behind. §9 asks for the background to be painted explicitly; it does not ask for
 * it to be painted twice, differently.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: 'var(--surface-0)', color: 'var(--ink-secondary)' }}>
        {children}
      </body>
    </html>
  );
}
