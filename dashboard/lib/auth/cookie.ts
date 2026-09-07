/**
 * The session cookie's wire form: reading one out of a `Cookie` header, and writing the
 * `Set-Cookie` §5 specifies.
 *
 * > §5: "sets an **httpOnly, SameSite=Strict, 30-day** session cookie signed with a server
 * > secret from the same env file."
 *
 * ---
 *
 * ### ⚠ A hand-written reader, and it must never throw
 *
 * §5: "A cookie that is missing, malformed, truncated, or whose signature cannot be
 * verified — **and any error raised while deciding** — is **401**, never 500." The handler
 * already catches (`authorized()` in `lib/telemetry/handler.ts`), but HANDOVER §3.2 rule 2
 * is explicit that leaning on that catch is still a bug: *"an `authorize` that throws on
 * ordinary input is still a bug, it just is not a 500."* A hand-edited or proxy-truncated
 * cookie is the **ordinary** way a bad session arrives, so {@link readCookie} is total —
 * every string maps to a value or to `null`, and there is no input that raises.
 *
 * `decodeURIComponent` is deliberately **not** called on the value: it throws on a lone `%`,
 * which is one keystroke away in a hand-edited cookie, and the value this project writes is
 * base64url and a dot, none of which needs encoding. A cookie that arrives percent-encoded
 * simply fails its signature check, which is the correct outcome for a value we did not
 * write.
 *
 * ### ⚠ No `Secure` attribute, and that is §5's decision rather than an omission
 *
 * §5: "**No TLS.** Plain HTTP on the LAN, so the password crosses the wire in the clear.
 * Stated explicitly so it is a choice rather than an oversight." A `Secure` cookie is never
 * sent over plain HTTP, so setting it here would produce a dashboard that logs in and then
 * immediately bounces back to `/login` for ever. It is omitted **because** there is no TLS,
 * and the day TLS arrives it must be added in the same commit. §5.2's on-screen disclosure
 * is the user-visible half of the same fact.
 *
 * `SameSite=Strict` is what carries CSRF protection in its absence: no cross-site request,
 * including a `DELETE /api/session` from an attacker's page, ever carries this cookie.
 */

/**
 * The cookie's name.
 *
 * `aid_` matches §6.7's `aid.` prefix for `localStorage` keys, with `_` because a `.` in a
 * cookie name, while legal, is the kind of thing intermediaries have been known to rewrite.
 */
export const SESSION_COOKIE = 'aid_session';

/** §5's thirty days, in seconds — the cookie's `Max-Age`. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** §5's thirty days, in milliseconds — the server-side life the token itself carries. */
export const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;

/**
 * The value of one cookie from a `Cookie` header, or `null`.
 *
 * First occurrence wins, which is what a browser sending a duplicate would have the server
 * do anyway; a second, forged copy appended by a client cannot displace the first.
 *
 * ⚠ Total: `null`, `''`, `'garbage'`, `'a=b; ; =; x'` and a 64 KiB line all return a value
 * or `null` and none of them raises.
 */
export const readCookie = (header: string | null | undefined, name: string): string | null => {
  if (typeof header !== 'string' || header === '') return null;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() !== name) continue;

    const value = pair.slice(eq + 1).trim();
    return value === '' ? null : value;
  }
  return null;
};

/**
 * §5's `Set-Cookie`, in full.
 *
 * `Path=/` so one session covers `/`, `/login` and `/api/*`; without it the cookie's path
 * would default to the directory of the request that set it (`/api`), and the dashboard at
 * `/` would never see it.
 */
export const sessionCookieHeader = (value: string): string =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;

/**
 * The `Set-Cookie` that removes it.
 *
 * ⚠ Every attribute except `Max-Age` must match the one that set it, or the browser treats
 * it as a *different* cookie and leaves the original in place — a logout that appears to
 * work and does not. `Max-Age=0` is the expiry.
 */
export const clearedCookieHeader = (): string =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
