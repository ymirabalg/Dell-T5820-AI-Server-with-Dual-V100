/**
 * Placeholder page. Step 1 delivers the scaffold and the type contract only — no
 * collectors, no panels, no auth. The dashboard proper is assembled in step 10.
 */
export default function Page() {
  return (
    <main
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '2rem',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>ai-server dashboard</h1>
      <p style={{ margin: '0.75rem 0 0', color: '#7c848e' }}>
        Scaffold only. The telemetry contract lives in <code>lib/types.ts</code>.
      </p>
    </main>
  );
}
