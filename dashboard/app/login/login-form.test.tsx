import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, test } from 'vitest';

import { loginView } from '@/lib/auth/login-view';
import type { LoginState } from '@/lib/auth/login-view';

import { LoginCard, LoginForm } from './login-form';

/**
 * §5.2's screen, as markup.
 *
 * ⚠ **No jsdom and no testing library.** `react-dom/server`'s `renderToStaticMarkup` runs in
 * plain Node against `react-dom`, which is already a dependency, so this file adds nothing to
 * the tree. HANDOVER §9 leaves jsdom to "the first step that needs one" and step 7 does not:
 * `LoginCard` is a pure function of a `LoginView`, so all six states render without a DOM.
 *
 * ⚠ What the form does with an *answer* is not here either: `loginOutcome` in
 * `@/lib/auth/login-view` maps a response onto §5.2's states and is table-tested there, which
 * is what made the opaque-redirect branch assertable without a browser.
 *
 * ⚠ Attribute names are matched case-insensitively. React 19's server renderer emits some
 * property names in their JSX spelling (`autoComplete`, `readOnly`) rather than lowercased;
 * HTML attribute names are case-insensitive so both behave identically in a browser, and an
 * assertion that pinned one spelling would be pinning React's internals rather than §5.2.
 */

const PASSWORD = 'correct horse battery staple';

const cardFor = (state: LoginState, password = PASSWORD): string =>
  renderToStaticMarkup(
    <LoginCard
      view={loginView(state)}
      password={password}
      onPasswordChange={() => undefined}
      onSubmit={() => undefined}
    />,
  );

/** The `<input>` element's markup, so an assertion about the field cannot match the button. */
const inputOf = (html: string): string => /<input\b[^>]*>/.exec(html)?.[0] ?? '';

/** The `<button>`'s opening tag. */
const buttonOf = (html: string): string => /<button\b[^>]*>/.exec(html)?.[0] ?? '';

describe('the elements §5.2 specifies', () => {
  const html = cardFor({ kind: 'idle' }, '');

  test('⚠ the identity block carries the wordmark and the address', () => {
    expect(html).toContain('ai-server');
    expect(html).toContain('192.168.4.71:8090');
  });

  /*
   * ⚠ §5.2: "One password input. `type=password`, autofocused,
   * `autocomplete="current-password"`." All three, on the input itself.
   */
  test('⚠ there is one password input, autofocused, with autocomplete=current-password', () => {
    const input = inputOf(html);

    expect(html.match(/<input\b/g)).toHaveLength(1);
    expect(input).toContain('type="password"');
    expect(input.toLowerCase()).toContain('autofocus');
    expect(input.toLowerCase()).toContain('autocomplete="current-password"');
  });

  test('⚠ the submit control says Unlock', () => {
    expect(buttonOf(html)).toContain('type="submit"');
    expect(html).toContain('Unlock');
  });

  /*
   * ⚠ §5.2 requires the disclosure "on the screen itself, not buried in a doc". Rendered,
   * not merely exported.
   */
  test('⚠ the plain-HTTP disclosure is rendered on the screen', () => {
    expect(html).toContain('Plain HTTP on the LAN — this password crosses the wire in the clear.');
  });

  /*
   * ⚠ §5.2's "Absent" row: "No username, no 'remember me' (the cookie is already 30 days), no
   * password reset, no account creation." A screen that grows any of them stops being the
   * screen §5.2 specified, and each is the kind of thing added "while we are here".
   */
  test('⚠ there is no username, no remember-me, no reset and no account creation', () => {
    const lower = html.toLowerCase();

    expect(lower).not.toContain('username');
    expect(lower).not.toContain('remember');
    expect(lower).not.toContain('forgot');
    expect(lower).not.toContain('reset');
    expect(lower).not.toContain('sign up');
    expect(lower).not.toContain('create account');
    expect(lower).not.toContain('type="checkbox"');
    expect(lower).not.toContain('type="email"');
    expect(lower).not.toContain('type="text"');
  });
});

describe('§5.2’s six states, rendered', () => {
  test('⚠ Idle — no message, submit enabled', () => {
    const html = cardFor({ kind: 'idle' }, '');

    expect(buttonOf(html)).not.toContain('disabled');
    expect(html).not.toContain('data-sev');
  });

  /*
   * ⚠ §5.2: "Submitting | Submit disabled, **field stays readable**." Both halves, and the
   * second is the one that gets broken — disabling the input is the reflexive way to stop a
   * second submit, and it hides the password the user is waiting on.
   */
  test('⚠ Submitting — submit disabled, field still readable and still populated', () => {
    const html = cardFor({ kind: 'submitting' });

    expect(buttonOf(html)).toContain('disabled');
    expect(inputOf(html)).not.toContain('disabled');
    expect(inputOf(html)).toContain(`value="${PASSWORD}"`);
  });

  /*
   * ⚠ §5.2: "Wrong password | `Password not recognised.` The field is **not** cleared —
   * retyping a long password because of a typo is worse than the marginal shoulder-surfing
   * risk on a LAN box." The value surviving into the markup is the whole assertion.
   */
  test('⚠ Wrong password — the message shows and the field is NOT cleared', () => {
    const html = cardFor({ kind: 'wrong' });

    expect(html).toContain('Password not recognised.');
    expect(inputOf(html)).toContain(`value="${PASSWORD}"`);
    expect(buttonOf(html)).not.toContain('disabled');
  });

  /*
   * ⚠ §5.2: "Rate-limited | `Too many attempts. Try again in Ns.`, counting down, submit
   * disabled." The number is the server's, from `Retry-After`.
   */
  test('⚠ Rate-limited — the server’s countdown shows and submit is disabled', () => {
    const html = cardFor({ kind: 'rate-limited', secondsRemaining: 43 });

    expect(html).toContain('Too many attempts. Try again in 43s.');
    expect(buttonOf(html)).toContain('disabled');
    expect(inputOf(html)).not.toContain('disabled');
  });

  test('⚠ Session expired — the message shows and submit stays enabled', () => {
    const html = cardFor({ kind: 'expired' }, '');

    expect(html).toContain('Session expired — sign in again.');
    expect(buttonOf(html)).not.toContain('disabled');
  });

  /*
   * ⚠ §5.2: "the screen says `Could not reach the dashboard.` and **leaves submit enabled**."
   * Enabled matters as much as the sentence: the server that did not answer may be answering
   * by now, and retrying is the only thing the operator can do. The field keeps its value for
   * the same reason the wrong-password row does.
   */
  test('⚠ Could not reach the dashboard — the message shows and submit stays enabled', () => {
    const html = cardFor({ kind: 'unreachable' });

    expect(html).toContain('Could not reach the dashboard.');
    expect(html).not.toContain('Password not recognised.');
    expect(buttonOf(html)).not.toContain('disabled');
    expect(inputOf(html)).toContain(`value="${PASSWORD}"`);
  });

  test('the message row is present in every state, so the card does not jump', () => {
    for (const state of [
      { kind: 'idle' },
      { kind: 'submitting' },
      { kind: 'wrong' },
      { kind: 'rate-limited', secondsRemaining: 1 },
      { kind: 'expired' },
      { kind: 'unreachable' },
    ] satisfies LoginState[]) {
      expect(cardFor(state)).toContain('class="login__msg"');
    }
  });
});

describe('the stateful form', () => {
  /*
   * ⚠ The one state the form cannot reach by itself: §5.2's "Session expired | Arrived here
   * from an expired session". `proxy.ts` sets `?expired=1` and `page.tsx` turns it into this
   * prop, so this is the seam between the gate and the screen.
   */
  test('⚠ it opens in the expired state when it is told it arrived from one', () => {
    expect(renderToStaticMarkup(<LoginForm expired />)).toContain('Session expired — sign in again.');
  });

  test('⚠ it opens idle otherwise, with an empty field', () => {
    const html = renderToStaticMarkup(<LoginForm expired={false} />);

    expect(html).not.toContain('Session expired');
    expect(html).not.toContain('data-sev');
    expect(inputOf(html)).toContain('value=""');
  });
});
