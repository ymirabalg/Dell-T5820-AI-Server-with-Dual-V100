'use client';

/**
 * §5.2's login card — all six states, one card.
 *
 * `MOCK.html`'s state C is the visual reference and shows five of them side by side so a
 * reviewer can see them without driving the form; the live route renders one. The class
 * names, tokens and structure here match that mock. **It is a reference, not a source:
 * nothing is imported from it.** ⚠ The mock predates §5.2's sixth row, so there is no
 * reference rendering for *Could not reach the dashboard.* — it borrows the `warn` tone,
 * which is a decision this project made rather than one the mock shows (see the step notes).
 *
 * ---
 *
 * ### ⚠ The wording is not in this file
 *
 * Every string §5.2 fixes lives in `@/lib/auth/login-view`, so that "the six states say what
 * §5.2 says" is a table-driven test rather than a rendering test. This component owns markup
 * and event handling.
 *
 * ### ⚠ The countdown is the server's number, never one this file computes
 *
 * §5.2: *"**The countdown is server-supplied, never client-invented.** … §6.7 pauses timers
 * on a hidden tab — so a resumed tab could show `0 s` while the server still refuses."* The
 * number is seeded from the 429's `Retry-After` and only ever counts **down** from it; when
 * it reaches zero the card returns to *Idle*, which re-enables submit without assuming
 * anything, and the next 429 seeds a fresh number.
 *
 * A background tab throttles `setTimeout`, so the countdown there runs *slower* than the
 * server's lockout rather than faster. That is the safe direction — it can only ever
 * over-state the wait — and it is why the timer is a chain of one-shot timeouts anchored to
 * the server's value instead of arithmetic against a local deadline.
 *
 * ### ⚠ What an answer means is not decided here
 *
 * `loginOutcome` in `@/lib/auth/login-view` maps a response — or a network failure — onto
 * §5.2's states, including the opaque-redirect spelling of "logged in" and §5.2's *Could not
 * reach the dashboard.* row. It lives there so it can be table-tested without a DOM; this
 * file keeps the fetch, the state and the markup.
 *
 * ⚠ Until step 7's reconciliation this file mapped **every** non-302/`ok`/429 response *and*
 * every network failure to `Password not recognised.` — so a stopped container, a 500 and a
 * correct password were indistinguishable on screen, and the operator was sent to retype a
 * password that was right, with §5's "nothing is logged" leaving nowhere else to look.
 *
 * ### ⚠ The field is never cleared
 *
 * §5.2: *"The field is **not** cleared — retyping a long password because of a typo is worse
 * than the marginal shoulder-surfing risk on a LAN box."* Nothing in this file writes `''`
 * into `password` after the initial state, and `login-view.ts` carries `fieldDisabled: false`
 * for every state so *Submitting* leaves the field readable too.
 */

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import {
  LOGIN_ADDRESS,
  LOGIN_SUBMIT_LABEL,
  LOGIN_WORDMARK,
  PLAIN_HTTP_DISCLOSURE,
  SESSION_PATH,
  loginOutcome,
  loginView,
} from '@/lib/auth/login-view';
import type { LoginState, LoginView } from '@/lib/auth/login-view';

/** Where §5.2 sends a successful login. */
const AFTER_LOGIN = '/';

export interface LoginFormProps {
  /** Arrived from a session that no longer verifies — §5.2's *Session expired* state. */
  readonly expired: boolean;
}

export function LoginForm({ expired }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<LoginState>(expired ? { kind: 'expired' } : { kind: 'idle' });
  const view = loginView(state);

  useEffect(() => {
    if (state.kind !== 'rate-limited') return undefined;

    // §5.2: at zero, re-enable submit and assume nothing. *Idle* is that, exactly.
    if (state.secondsRemaining <= 0) {
      setState({ kind: 'idle' });
      return undefined;
    }

    const remaining = state.secondsRemaining;
    const timer = window.setTimeout(() => {
      setState({ kind: 'rate-limited', secondsRemaining: remaining - 1 });
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [state]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (view.submitDisabled) return;

    setState({ kind: 'submitting' });

    // ⚠ What each answer means is `loginOutcome`'s, not this file's — including the two
    // §5.2 rows that used to be conflated here. See `login-view.ts`.
    let outcome: LoginState | null;
    try {
      const response = await fetch(SESSION_PATH, {
        method: 'POST',
        // ⚠ §5 **requires** this header, and the server refuses without it: it is what makes
        // a cross-origin login attempt preflighted rather than a CORS simple request that
        // any visited page could fire. Removing it does not merely change a content type —
        // it stops the dashboard being able to log in at all.
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
        redirect: 'manual',
        credentials: 'same-origin',
      });
      outcome = loginOutcome({
        type: response.type,
        status: response.status,
        ok: response.ok,
        retryAfter: response.headers.get('retry-after'),
      });
    } catch {
      // §5.2's *Could not reach the dashboard.* — the request never got an answer.
      outcome = loginOutcome(null);
    }

    if (outcome === null) {
      window.location.assign(AFTER_LOGIN);
      return;
    }
    setState(outcome);
  };

  return (
    <LoginCard
      view={view}
      password={password}
      onPasswordChange={setPassword}
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    />
  );
}

export interface LoginCardProps {
  readonly view: LoginView;
  readonly password: string;
  readonly onPasswordChange: (next: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/**
 * The card itself — **a pure function of a {@link LoginView}**, so every one of §5.2's five
 * states can be rendered and read without driving a form.
 *
 * ⚠ That is the whole reason it is a separate component. There is no jsdom in this project
 * (HANDOVER §9: added by "the first step that needs one"), and `react-dom/server`'s
 * `renderToStaticMarkup` runs in plain Node with no dependency at all — but it renders the
 * *initial* state, so a stateful form could only ever be tested in the two states its props
 * can reach. Splitting the markup out means `login-form.test.tsx` asserts §5.2's table
 * against real markup for all five, including the two properties the spec calls out: the
 * field is not cleared, and the field is not disabled while submitting.
 */
export function LoginCard({ view, password, onPasswordChange, onSubmit }: LoginCardProps) {
  return (
    <form className="login" onSubmit={onSubmit} noValidate>
      <div className="login__id">
        <div className="login__mark">{LOGIN_WORDMARK}</div>
        <div className="login__addr">{LOGIN_ADDRESS}</div>
      </div>

      <label className="login__lbl" htmlFor="password">
        Password
      </label>
      <input
        className="login__in"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        disabled={view.fieldDisabled}
        value={password}
        onChange={(event) => {
          onPasswordChange(event.target.value);
        }}
      />

      <button className="login__go" type="submit" disabled={view.submitDisabled}>
        {LOGIN_SUBMIT_LABEL}
      </button>

      <div className="login__msg" data-sev={view.message?.tone} role="alert">
        {view.message === null ? null : (
          <>
            <i>{view.message.tone === 'crit' ? '✕' : '▲'}</i>
            {view.message.text}
          </>
        )}
      </div>

      <p className="login__disc">
        <i>▲</i>
        {PLAIN_HTTP_DISCLOSURE}
      </p>
    </form>
  );
}
