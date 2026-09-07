import { describe, expect, test } from 'vitest';

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  SESSION_TTL_MS,
  clearedCookieHeader,
  readCookie,
  sessionCookieHeader,
} from './cookie';

/** §5's cookie: its attributes, and a reader that is total over every string a client can send. */

describe('reading a cookie out of a header', () => {
  test.each([
    ['the only cookie', 'aid_session=abc', 'abc'],
    ['the first of several', 'aid_session=abc; other=1', 'abc'],
    ['the last of several', 'other=1; aid_session=abc', 'abc'],
    ['padded with spaces', '  aid_session   =   abc  ', 'abc'],
    ['a value containing a dot', 'aid_session=payload.signature', 'payload.signature'],
  ])('finds it when it is %s', (_name, header, expected) => {
    expect(readCookie(header, SESSION_COOKIE)).toBe(expected);
  });

  /*
   * ⚠ §5: "A cookie that is missing, malformed, truncated … is 401, never 500", and
   * HANDOVER §3.2 rule 2 adds that leaning on the handler's `try/catch` for ordinary input is
   * still a bug. A hand-edited or proxy-truncated cookie is the **ordinary** way a bad
   * session arrives, so this reader has to be total: every string maps to a value or `null`
   * and none of them raises.
   *
   * The lone `%` — the input that would throw if this ever reached for
   * `decodeURIComponent`, the obvious "improvement" someone makes to a cookie reader — has
   * its own case below, because it must come back *verbatim* rather than as `null`.
   */
  test.each([
    ['no header at all', null],
    ['an undefined header', undefined],
    ['an empty header', ''],
    ['a header with no separator', 'aid_session'],
    ['a different cookie', 'other=1'],
    ['an empty value', 'aid_session='],
    ['a value that is only spaces', 'aid_session=   '],
    ['a prefix of the name', 'aid_sessio=abc'],
    ['a suffix of the name', 'xaid_session=abc'],
    ['nothing but separators', ';;;;'],
    ['an equals with no name', '=abc'],
  ])('⚠ answers null for %s, and never throws', (_name, header) => {
    expect(readCookie(header, SESSION_COOKIE)).toBeNull();
  });

  test('⚠ a lone percent sign is returned verbatim rather than decoded', () => {
    // The value is not decoded, so it reaches the signature check and fails there. The point
    // is that it fails as a *signature*, not as a `URIError`.
    expect(readCookie('aid_session=100%', SESSION_COOKIE)).toBe('100%');
  });

  test('the first occurrence wins, so an appended forgery cannot displace the real one', () => {
    expect(readCookie('aid_session=real; aid_session=forged', SESSION_COOKIE)).toBe('real');
  });

  test('a very long header is answered rather than refused', () => {
    const noise = Array.from({ length: 2000 }, (_, i) => `k${i}=v${i}`).join('; ');
    expect(readCookie(`${noise}; aid_session=found`, SESSION_COOKIE)).toBe('found');
  });
});

describe('the Set-Cookie §5 specifies', () => {
  /*
   * ⚠ Every attribute §5 names, asserted individually rather than as one string match, so a
   * failure says which one went missing.
   *
   * `HttpOnly` is what keeps the token out of `document.cookie` and therefore out of reach of
   * any script on the page. `SameSite=Strict` is what carries CSRF protection — with no TLS
   * there is no `Secure` to lean on, so no cross-site request, including a
   * `DELETE /api/session` from an attacker's page, ever carries this cookie.
   */
  test('⚠ the session cookie is httpOnly, SameSite=Strict, path-wide and 30 days', () => {
    const header = sessionCookieHeader('token-value');

    expect(header.startsWith(`${SESSION_COOKIE}=token-value;`)).toBe(true);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
    expect(header).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
  });

  test('⚠ 30 days is 30 days, in both units', () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(SESSION_TTL_MS).toBe(SESSION_MAX_AGE_SECONDS * 1000);
  });

  /*
   * ⚠ **No `Secure`, and that is §5's decision rather than an omission.** §5: "**No TLS.**
   * Plain HTTP on the LAN, so the password crosses the wire in the clear." A `Secure` cookie
   * is never sent over plain HTTP, so setting it would produce a dashboard that logs in and
   * bounces straight back to `/login`, for ever, with nothing in any log to say why.
   *
   * The day TLS arrives this assertion is the thing that has to be changed deliberately.
   */
  test('⚠ the cookie is NOT Secure, because §5 chose plain HTTP', () => {
    expect(sessionCookieHeader('t')).not.toContain('Secure');
    expect(clearedCookieHeader()).not.toContain('Secure');
  });

  /*
   * ⚠ A browser matches a deletion to the cookie it deletes by name, path and domain. Get
   * `Path` wrong and the original survives while a second, empty cookie appears at another
   * path — a logout that looks like it worked.
   */
  test('⚠ the clearing cookie matches the setting cookie in every attribute but Max-Age', () => {
    const set = sessionCookieHeader('t');
    const cleared = clearedCookieHeader();

    for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Strict']) {
      expect(set).toContain(attribute);
      expect(cleared).toContain(attribute);
    }
    expect(cleared).toContain('Max-Age=0');
    expect(cleared.startsWith(`${SESSION_COOKIE}=;`)).toBe(true);
  });
});
