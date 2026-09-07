import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'ai-server',
  description: 'Read-only telemetry for ai-server',
};

/**
 * Placeholder shell. The real chrome — header, grid, panels — is steps 9 and 10.
 *
 * The background is painted explicitly (SPEC.md §9: single dark theme, no light variant),
 * so nothing here inherits a light ground from the browser default while the rest is
 * being built.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0d10', color: '#c8cdd4' }}>{children}</body>
    </html>
  );
}
