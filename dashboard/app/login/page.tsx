import { EXPIRED_PARAM } from '@/lib/auth/login-view';

import { LoginForm } from './login-form';

/**
 * `/login` (§5.2) — the only route reachable unauthenticated.
 *
 * A server component whose whole job is to decide *one* thing: did this visitor arrive from a
 * session that stopped verifying? `proxy.ts` says so with `?expired=1`, and §5.2's *Session
 * expired* state is the only one that cannot be reached from the form itself.
 *
 * ---
 *
 * ### ⚠ The styles are a `style` element in the page, not a stylesheet
 *
 * There is no CSS pipeline in this project yet — steps 9 and 10 build the panel chrome and
 * will own one — and `/login` must not be the thing that decides its shape. A scoped block
 * here is self-contained, needs no build configuration, cannot leak into the dashboard, and
 * is a straightforward move into whatever steps 9/10 choose.
 *
 * The tokens and the card's geometry are lifted from `MOCK.html`'s state C by eye. The CSS
 * text deliberately contains no `<`, `>` or `&`: React escapes text children, and a
 * descendant combinator would come out as `&gt;` and silently stop matching.
 *
 * ### ⚠ `force-dynamic`
 *
 * The screen has no build-time content and reads `searchParams`. Prerendering it would bake
 * one state — and `/login` is the route that must work when everything else is refusing.
 */

export const dynamic = 'force-dynamic';

const LOGIN_CSS = `
.loginPage {
  --ground: #07090c;
  --panel: #0d1116;
  --sunken: #090c11;
  --hairline: #1c232c;
  --hairline-lo: #151b23;
  --hairline-hi: #28313d;
  --ink: #e4eaf1;
  --ink-3: #6b7889;
  --warn-ink: #fab219;
  --crit-ink: #ef6a6a;
  --accent: #3987e5;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas,
          "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color-scheme: dark;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  box-sizing: border-box;
}
.loginPage :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.login {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 100%;
  max-width: 320px;
  padding: 17px 15px 13px;
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 3px;
  box-sizing: border-box;
}
.login__mark { font-size: 17px; font-weight: 600; letter-spacing: .02em; line-height: 1.1; }
.login__addr { font-size: 11px; color: var(--ink-3); margin-top: 3px; }
.login__lbl {
  font-family: var(--sans); font-size: 9.5px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--ink-3); margin-bottom: -4px;
}
.login__in {
  font-family: var(--mono); font-size: 13px; letter-spacing: .14em;
  width: 100%; padding: 7px 9px; box-sizing: border-box;
  color: var(--ink); background: var(--sunken);
  border: 1px solid var(--hairline-hi); border-radius: 2px;
}
.login__in:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(57,135,229,.45);
}
.login__in[disabled] { opacity: .75; }
.login__go {
  font-family: var(--sans); font-size: 10.5px; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase;
  padding: 8px 10px;
  color: #eaf2fd; background: rgba(57,135,229,.22);
  border: 1px solid rgba(57,135,229,.65); border-radius: 2px; cursor: pointer;
}
.login__go:hover:not([disabled]) { background: rgba(57,135,229,.32); }
.login__go[disabled] { opacity: .42; cursor: not-allowed; }
.login__msg { display: flex; gap: 7px; font-size: 11px; line-height: 1.35; min-height: 15px; }
.login__msg i { font-style: normal; }
.login__msg[data-sev="crit"] { color: var(--crit-ink); }
.login__msg[data-sev="warn"] { color: var(--warn-ink); }
.login__disc {
  margin: 0; padding-top: 9px;
  border-top: 1px solid var(--hairline-lo);
  display: flex; gap: 7px;
  font-size: 10px; line-height: 1.45; color: var(--ink-3);
}
.login__disc i { font-style: normal; color: var(--warn-ink); }
`;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <main className="loginPage">
      <style>{LOGIN_CSS}</style>
      <LoginForm expired={params[EXPIRED_PARAM] !== undefined} />
    </main>
  );
}
