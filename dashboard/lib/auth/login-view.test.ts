import { describe, expect, test } from 'vitest';

import { readFileSync } from 'node:fs';

import {
  EXPIRED_PARAM,
  LOGIN_ADDRESS,
  LOGIN_PATH,
  LOGIN_SUBMIT_LABEL,
  LOGIN_WORDMARK,
  PLAIN_HTTP_DISCLOSURE,
  SESSION_EXPIRED_MESSAGE,
  SESSION_PATH,
  UNREACHABLE_MESSAGE,
  WRONG_PASSWORD_MESSAGE,
  loginOutcome,
  loginView,
  rateLimitedMessage,
  retryAfterSeconds,
} from './login-view';
import type { LoginState } from './login-view';

/**
 * §5.2's table, verbatim. Every string the spec fixes is asserted against the spec's own
 * wording, not against a paraphrase — the point of pulling the copy out of the component is
 * that this can be a table test rather than a rendering test.
 */

describe('the copy §5.2 fixes', () => {
  test('⚠ the identity block is the wordmark and the address', () => {
    expect(LOGIN_WORDMARK).toBe('ai-server');
    expect(LOGIN_ADDRESS).toBe('192.168.4.71:8090');
  });

  test('⚠ the submit button says Unlock', () => {
    expect(LOGIN_SUBMIT_LABEL).toBe('Unlock');
  });

  /*
   * ⚠ §5.2 puts the disclosure "on the screen itself, not buried in a doc", because §5's "No
   * TLS" is a decision rather than an oversight: the password crosses the LAN in the clear
   * and the person typing it is entitled to know before they type it.
   */
  test('⚠ the plain-HTTP disclosure is §5.2’s sentence, exactly', () => {
    expect(PLAIN_HTTP_DISCLOSURE).toBe(
      'Plain HTTP on the LAN — this password crosses the wire in the clear.',
    );
  });

  test('⚠ the wrong-password and expired messages are §5.2’s, exactly', () => {
    expect(WRONG_PASSWORD_MESSAGE).toBe('Password not recognised.');
    expect(SESSION_EXPIRED_MESSAGE).toBe('Session expired — sign in again.');
  });

  /*
   * ⚠ §5.2's sixth row, and the distinction it exists to draw: "**A response that is neither
   * a success nor a refusal is not a wrong password.**" A stopped container and a correct
   * password used to be the same sentence on this screen.
   */
  test('⚠ the unreachable message is §5.2’s, and is not the wrong-password one', () => {
    expect(UNREACHABLE_MESSAGE).toBe('Could not reach the dashboard.');
    expect(UNREACHABLE_MESSAGE).not.toBe(WRONG_PASSWORD_MESSAGE);
  });

  test('⚠ the rate-limited message is §5.2’s, with the server’s number in it', () => {
    expect(rateLimitedMessage(43)).toBe('Too many attempts. Try again in 43s.');
    expect(rateLimitedMessage(1)).toBe('Too many attempts. Try again in 1s.');
    expect(rateLimitedMessage(0)).toBe('Too many attempts. Try again in 0s.');
  });
});

describe('§5.2’s six states', () => {
  /*
   * ⚠ All six rows of §5.2's state table, in one place: which message shows, and whether
   * submit is enabled. There is no seventh — the handler answers 401 rather than 400 for a
   * malformed body precisely so that none is needed.
   */
  test.each<[string, LoginState, string | null, boolean]>([
    ['Idle — field focused, submit enabled', { kind: 'idle' }, null, false],
    ['Submitting — submit disabled', { kind: 'submitting' }, null, true],
    ['Wrong password', { kind: 'wrong' }, 'Password not recognised.', false],
    [
      'Rate-limited — counting down, submit disabled',
      { kind: 'rate-limited', secondsRemaining: 43 },
      'Too many attempts. Try again in 43s.',
      true,
    ],
    ['Session expired', { kind: 'expired' }, 'Session expired — sign in again.', false],
    [
      'Could not reach the dashboard — submit stays enabled',
      { kind: 'unreachable' },
      'Could not reach the dashboard.',
      false,
    ],
  ])('⚠ §5.2 state — %s', (_name, state, message, submitDisabled) => {
    const view = loginView(state);

    expect(view.message?.text ?? null).toBe(message);
    expect(view.submitDisabled).toBe(submitDisabled);
  });

  /*
   * ⚠ §5.2, twice over: "Wrong password … The field is **not** cleared" and "Submitting —
   * Submit disabled, **field stays readable**". Asserted for every state, because the way this
   * gets broken is a `disabled` added to the input for the submitting case and left there.
   *
   * The field's *value* is the component's business and `login-form.test.tsx` covers it; this
   * is the half that belongs to the view.
   */
  test.each<[string, LoginState]>([
    ['idle', { kind: 'idle' }],
    ['submitting', { kind: 'submitting' }],
    ['wrong', { kind: 'wrong' }],
    ['rate-limited', { kind: 'rate-limited', secondsRemaining: 5 }],
    ['expired', { kind: 'expired' }],
    ['unreachable', { kind: 'unreachable' }],
  ])('⚠ the password field is never disabled — %s', (_name, state) => {
    expect(loginView(state).fieldDisabled).toBe(false);
  });

  test('the two message tones are the mock’s, and are not §6.3’s reading severities', () => {
    expect(loginView({ kind: 'wrong' }).message?.tone).toBe('crit');
    expect(loginView({ kind: 'expired' }).message?.tone).toBe('warn');
    expect(loginView({ kind: 'rate-limited', secondsRemaining: 3 }).message?.tone).toBe('warn');
  });
});

describe('reading Retry-After', () => {
  /*
   * ⚠ §5.2: "The countdown is server-supplied, never client-invented." This is the only door
   * that number comes through, so what it accepts *is* the contract.
   */
  test.each([
    ['whole seconds', '60', 60],
    ['one second', '1', 1],
    ['zero', '0', 0],
    ['padded by a proxy', ' 30 ', 30],
  ])('⚠ Retry-After parses as whole seconds — %s', (_name, header, expected) => {
    expect(retryAfterSeconds(header)).toBe(expected);
  });

  /*
   * ⚠ Delta-seconds only. RFC 9110 also allows an HTTP-date and this server never sends one;
   * a date must read as "no countdown" rather than as `NaN` seconds, which would render
   * "Try again in NaNs." — the exact class of lie §6.6's `null` rule exists to prevent.
   */
  test.each([
    ['a missing header', null],
    ['an HTTP-date', 'Wed, 21 Oct 2026 07:28:00 GMT'],
    ['a decimal', '1.5'],
    ['a negative', '-5'],
    ['a padded integer', '007'],
    ['nonsense', 'soon'],
    ['an empty string', ''],
  ])('⚠ Retry-After reads as null, never NaN — %s', (_name, header) => {
    expect(retryAfterSeconds(header)).toBeNull();
  });
});

describe('what an answer means (§5.2’s three outcomes)', () => {
  const answer = (
    over: Partial<Parameters<typeof loginOutcome>[0] & object> = {},
  ): Parameters<typeof loginOutcome>[0] => ({
    type: 'basic',
    status: 200,
    ok: true,
    retryAfter: null,
    ...over,
  });

  /*
   * ⚠ §5.2: "**On success:** 302 to `/`." Three spellings of it, and the opaque one is the
   * only one a browser can actually produce: `fetch` with `redirect: 'manual'` yields
   * `type: 'opaqueredirect'`, `status: 0`, no headers. Node's fetch returns the readable 302,
   * so a test can never see the browser's spelling — which is precisely why the mapping was
   * lifted out of the component, where that branch had no test and no mutation at all.
   */
  test.each([
    ['a readable 302, which is what Node’s fetch gives', { type: 'basic', status: 302, ok: false }],
    ['an opaque redirect, which is what a browser gives', { type: 'opaqueredirect', status: 0, ok: false }],
    ['a 2xx', { type: 'basic', status: 204, ok: true }],
  ])('⚠ it is a successful login, so the screen navigates — %s', (_name, over) => {
    expect(loginOutcome(answer(over))).toBeNull();
  });

  test('⚠ a 401 is the only status that means the password was not recognised', () => {
    expect(loginOutcome(answer({ status: 401, ok: false }))).toEqual({ kind: 'wrong' });
  });

  test('⚠ a 429 carries §5.2’s countdown, from the server’s own header', () => {
    expect(loginOutcome(answer({ status: 429, ok: false, retryAfter: '43' }))).toEqual({
      kind: 'rate-limited',
      secondsRemaining: 43,
    });
    // A 429 with no usable header still re-enables submit rather than parking on a number
    // nobody sent — §5.2's "the next 429 simply restarts it from a fresh Retry-After".
    expect(loginOutcome(answer({ status: 429, ok: false, retryAfter: 'soon' }))).toEqual({
      kind: 'rate-limited',
      secondsRemaining: 0,
    });
  });

  /*
   * ⚠ §5.2's sixth row, and the defect it was written for: every one of these used to render
   * `Password not recognised.`, so a stopped container, a crashed handler and a correct
   * password were the same sentence — and §5's other half, that nothing is logged, meant
   * there was nothing else for the operator to look at.
   */
  test.each([
    ['the request never got an answer', null],
    ['a 500 from the handler', answer({ status: 500, ok: false })],
    ['a 502 from something in front of it', answer({ status: 502, ok: false })],
    ['a 404, so this is not the dashboard', answer({ status: 404, ok: false })],
    ['a 403, which this server never sends', answer({ status: 403, ok: false })],
  ])('⚠ it is not a wrong password — %s', (_name, response) => {
    expect(loginOutcome(response)).toEqual({ kind: 'unreachable' });
  });
});

describe('the client-safe surface step 8 imports', () => {
  /*
   * ⚠ One spelling of each path, in the one module a browser bundle may import.
   *
   * Step 8 routes a 401 to `/login?expired=1` and step 10 needs `DELETE /api/session`, both
   * from **client** code. These constants used to be exported from `proxy.ts`, which imports
   * `next/server` and `@/lib/auth/session` (and therefore `node:crypto`), so step 8 would
   * have had to pull the server auth graph toward the browser or invent a third spelling —
   * and `/api/session` already had two.
   *
   * The literals are asserted here **and** their absence is asserted in the two files that
   * consume them, because "one definition" is only true while nobody writes a second.
   */
  test('⚠ the two paths are defined once, here, and nowhere else spells them', () => {
    expect(LOGIN_PATH).toBe('/login');
    expect(SESSION_PATH).toBe('/api/session');

    const consumers = ['../../proxy.ts', '../../app/login/login-form.tsx'] as const;
    for (const relative of consumers) {
      const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
      // Quoted string literals only: both files discuss these paths in prose, where they are
      // written inside backticks.
      expect(source, relative).not.toMatch(/['"]\/login['"]/);
      expect(source, relative).not.toMatch(/['"]\/api\/session['"]/);
      expect(source, relative).toMatch(/from '@\/lib\/auth\/login-view'/);
    }
  });

  /*
   * ⚠ The property that makes this module safe to import from a client component: it has no
   * imports at all. Everything else under `lib/auth/` reaches `node:crypto` or process-global
   * state, and an import added here would drag one of them into the browser bundle silently —
   * the build would still succeed.
   */
  test('⚠ this module imports nothing, which is what makes it client-safe', () => {
    const source = readFileSync(new URL('login-view.ts', import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(/^import[\s\S]*?from '([^']+)';/gm)];

    expect(specifiers).toEqual([]);
  });
});

describe('the expired hand-off', () => {
  /*
   * §5.2's *Session expired* state is the only one the form cannot reach on its own — it is
   * reached by arriving at `/login` from somewhere else. `proxy.ts` sets this parameter when a
   * request carried a cookie that did not verify, and step 8's client will use the same door
   * after a 401.
   */
  test('the query parameter that carries it is one name, defined once', () => {
    expect(EXPIRED_PARAM).toBe('expired');
  });
});
