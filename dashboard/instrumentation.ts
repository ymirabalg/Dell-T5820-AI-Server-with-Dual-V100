/**
 * Next's server-startup hook — the one place `/etc/ai-dashboard.env` is read **loudly**.
 *
 * SPEC.md §5.1 (⚠⚠ 2026-09-11, `11-Q2`) requires that a quoted, padded, multi-line or
 * otherwise unusable secret be refused *at startup*, naming the key and the reason. From
 * Next's own bundled docs (`01-app/03-api-reference/03-file-conventions/instrumentation.md`):
 * *"The file exports a `register` function that is called **once** when a new Next.js server
 * instance is initiated, and must complete before the server is ready to handle requests."*
 * That is the only hook in this framework with those two properties, which is why the check
 * lives here rather than at the top of `proxy.ts` (loaded on the first request, not at
 * startup) or in a route module (loaded per route).
 *
 * ⚠ **The dynamic import is not a style choice.** The same doc: *"Next.js calls `register` in
 * all environments, so it's important to conditionally import any code that doesn't support
 * specific runtimes."* `lib/auth/secrets.ts` imports `node:fs`; importing it at the top of
 * this file would pull `node:fs` into the edge copy of the instrumentation bundle. The guard
 * below and `startupAction`'s own `nextRuntime` arm are two locks on one door — this one is
 * the only line of the feature no test can reach, because there is no edge runtime here to
 * run it in.
 *
 * ⚠ **This file must stay four lines of wiring.** Everything decidable is `lib/auth/startup.ts`
 * and is driven from `lib/auth/startup.test.ts`; a `register` that grew a branch would be a
 * branch nothing measures.
 */

export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;
  const { runStartupCheck } = await import('@/lib/auth/startup');
  runStartupCheck();
}
