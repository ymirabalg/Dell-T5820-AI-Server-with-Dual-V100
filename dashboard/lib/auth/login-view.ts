/**
 * §5.2's login screen as **data**: the six states, and the copy each one shows.
 *
 * ---
 *
 * ### ⚠ Why this is a module and not just JSX
 *
 * §5.2 fixes the wording — *"`Password not recognised.`"*, *"`Too many attempts. Try again in
 * Ns.`"*, *"`Session expired — sign in again.`"* — and wording that only exists inside a
 * component can only be tested by rendering one. Pulling it out means the six states and
 * their copy are covered by ordinary table-driven tests, exactly as §6.6's formatters are,
 * and `app/login/login-form.tsx` is left with nothing but markup and event handling.
 *
 * ### ⚠ `crit` / `warn` are NOT §6.3's `Severity`
 *
 * `lib/types.ts` closes `Severity` over `'normal' | 'watch' | 'alarm'` and those are bands a
 * **reading** falls into. A wrong password is not a reading and has no band; borrowing the
 * vocabulary would invite exactly the confusion O13 warns about ("`EC auto` and `unavailable`
 * are not severities"). These two tokens are the login card's own, and they are the ones
 * `MOCK.html`'s state C writes into `data-sev`.
 *
 * ### ⚠ It also holds the two paths, and that is a module-graph decision
 *
 * {@link LOGIN_PATH} and {@link SESSION_PATH} were exported from `proxy.ts`, which imports
 * `next/server` **and** `@/lib/auth/session` (and therefore `node:crypto`). Step 8 has to
 * route a 401 to `/login?expired=1` from **client** code and step 10 needs a logout that
 * calls `DELETE /api/session`, so leaving them there meant either pulling the whole server
 * auth graph toward the browser bundle or writing a third spelling of each literal — and
 * `/api/session` already had two.
 *
 * This module is the client-safe surface of `lib/auth/`: **pure strings and pure functions,
 * with no imports at all**, already imported by both `proxy.ts` and `login-form.tsx`, and
 * already the home of {@link EXPIRED_PARAM}. Nothing else in `lib/auth/` may be imported from
 * client code — the rest reach `node:crypto` and process-global state.
 *
 * ### ⚠ The countdown's number comes from the server
 *
 * §5.2: *"**The countdown is server-supplied, never client-invented.** A 429 carries a
 * `Retry-After` header and the screen renders its countdown from that value. A client-side
 * timer would drift, and §6.7 pauses timers on a hidden tab — so a resumed tab could show
 * `0 s` while the server still refuses."* {@link rateLimitedMessage} therefore takes the
 * number rather than computing one, and `login-form.tsx` seeds it from the header and
 * restarts it from a fresh header on every subsequent 429.
 */

/** §5.2's route — the only *page* reachable unauthenticated. */
export const LOGIN_PATH = '/login';

/** §4's login/logout endpoint, and the second thing §5 exempts from the gate. */
export const SESSION_PATH = '/api/session';

/** §5.2's identity block. */
export const LOGIN_WORDMARK = 'ai-server';

/** §5.2: "`192.168.4.71:8090` beneath it". §2.5 fixes the port. */
export const LOGIN_ADDRESS = '192.168.4.71:8090';

/** §5.2's submit label. */
export const LOGIN_SUBMIT_LABEL = 'Unlock';

/**
 * §5.2's disclosure, verbatim, and it is shown **on the screen itself**.
 *
 * > §5: "**No TLS.** Plain HTTP on the LAN, so the password crosses the wire in the clear.
 * > Stated explicitly so it is a choice rather than an oversight."
 */
export const PLAIN_HTTP_DISCLOSURE =
  'Plain HTTP on the LAN — this password crosses the wire in the clear.';

/** §5.2's wrong-password copy. */
export const WRONG_PASSWORD_MESSAGE = 'Password not recognised.';

/** §5.2's expired-session copy. The dash is an em dash, as the spec writes it. */
export const SESSION_EXPIRED_MESSAGE = 'Session expired — sign in again.';

/**
 * §5.2's copy for a server that did not answer.
 *
 * > §5.2: "**A response that is neither a success nor a refusal is not a wrong password.** If
 * > the request fails at the network, or the server answers with anything other than
 * > 302/2xx, 401 or 429, the screen says `Could not reach the dashboard.` and leaves submit
 * > enabled. Rendering `Password not recognised.` for a server that never answered sends the
 * > operator to retype a password that was correct — and §5's other half, that the server
 * > never logs, means there is nothing else for them to look at."
 */
export const UNREACHABLE_MESSAGE = 'Could not reach the dashboard.';

/** §5.2's rate-limited copy, with the server's own number in it. */
export const rateLimitedMessage = (secondsRemaining: number): string =>
  `Too many attempts. Try again in ${secondsRemaining}s.`;

/** The query parameter that puts the screen in its expired state. See `proxy.ts`. */
export const EXPIRED_PARAM = 'expired';

/**
 * §5.2's six states, and no seventh.
 *
 * ⚠ `unreachable` is §5.2's *Could not reach the dashboard.* row. It is deliberately **not**
 * a state for a malformed request — every refusal this server makes is a 401, so a malformed
 * body renders as *Wrong password* and needs no state of its own. It is the state for a
 * server that did not answer at all.
 */
export type LoginState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'wrong' }
  | { readonly kind: 'rate-limited'; readonly secondsRemaining: number }
  | { readonly kind: 'expired' }
  | { readonly kind: 'unreachable' };

/** The card's own two-token emphasis — see the module doc; not §6.3's `Severity`. */
export type LoginTone = 'warn' | 'crit';

/** Everything the card renders that varies by state. */
export interface LoginView {
  /** `null` when the state has nothing to say. The row is still laid out, so the card does not jump. */
  readonly message: { readonly text: string; readonly tone: LoginTone } | null;
  /** §5.2: submit is disabled while submitting and while rate-limited, and enabled otherwise. */
  readonly submitDisabled: boolean;
  /**
   * ⚠ Always `false`.
   *
   * §5.2: *"Wrong password … The field is **not** cleared — retyping a long password because
   * of a typo is worse than the marginal shoulder-surfing risk on a LAN box."* And for
   * *Submitting*: *"Submit disabled, **field stays readable**"*. The property is stated as a
   * field rather than left implicit so that a test can assert it for every state, including
   * the two the spec calls out.
   */
  readonly fieldDisabled: boolean;
}

/** What §5.2's table says, for one state. */
export const loginView = (state: LoginState): LoginView => {
  switch (state.kind) {
    case 'idle':
      return { message: null, submitDisabled: false, fieldDisabled: false };
    case 'submitting':
      return { message: null, submitDisabled: true, fieldDisabled: false };
    case 'wrong':
      return {
        message: { text: WRONG_PASSWORD_MESSAGE, tone: 'crit' },
        submitDisabled: false,
        fieldDisabled: false,
      };
    case 'rate-limited':
      return {
        message: { text: rateLimitedMessage(state.secondsRemaining), tone: 'warn' },
        submitDisabled: true,
        fieldDisabled: false,
      };
    case 'expired':
      return {
        message: { text: SESSION_EXPIRED_MESSAGE, tone: 'warn' },
        submitDisabled: false,
        fieldDisabled: false,
      };
    case 'unreachable':
      // §5.2: "…and leaves submit enabled." Retrying is the only thing the operator can do,
      // and the thing that was wrong may already have been fixed.
      return {
        message: { text: UNREACHABLE_MESSAGE, tone: 'warn' },
        submitDisabled: false,
        fieldDisabled: false,
      };
  }
};

/**
 * The `Retry-After` value a 429 carried, as whole seconds — or `null` if there wasn't one.
 *
 * ⚠ Delta-seconds only. RFC 9110 also allows an HTTP-date, and this server never sends one;
 * a date would parse as `NaN` here and yield `null`, which the caller renders as a lockout it
 * cannot count down rather than as `0s`. §5.2's fallback is the same either way: at zero the
 * client re-enables submit and assumes nothing.
 */
export const retryAfterSeconds = (header: string | null): number | null => {
  if (header === null) return null;
  const trimmed = header.trim();
  if (!/^(?:0|[1-9][0-9]*)$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : null;
};

/**
 * What a login attempt's answer means, as data.
 *
 * ⚠ This is `login-form.tsx`'s decision, lifted out for the same reason the copy was: a
 * mapping that only exists inside a component's `async` submit handler can only be tested by
 * driving a form, and this project has no jsdom. Out here it is a table test, it has a
 * mutation, and §5.2's three outcomes are read against §5.2's own words rather than against
 * a chain of `if`s.
 *
 * `null` means **logged in** — navigate. Everything else is a state to render.
 *
 * ⚠ `type === 'opaqueredirect'` is not redundant with `status === 302`. §5.2 says *"On
 * success: 302 to `/`"*, and a browser `fetch` with `redirect: 'manual'` yields an **opaque**
 * response — `type: 'opaqueredirect'`, `status: 0`, no headers — while Node's fetch (and
 * therefore a test) hands back the real 302. The `Set-Cookie` is applied by the user agent
 * when the response arrives, before any redirect handling, so an opaque response has still
 * logged the user in. Both spellings are success, and lifting this out is what finally made
 * the opaque branch assertable at all.
 */
export interface LoginResponse {
  /** `Response.type` — `'opaqueredirect'` is the browser's spelling of §5.2's 302. */
  readonly type: string;
  readonly status: number;
  readonly ok: boolean;
  /** The `Retry-After` header, verbatim, or `null`. Parsed by {@link retryAfterSeconds}. */
  readonly retryAfter: string | null;
}

/**
 * @param response the answer, or `null` when the request failed at the network
 * @returns `null` on success, otherwise the {@link LoginState} §5.2 asks for
 */
export const loginOutcome = (response: LoginResponse | null): LoginState | null => {
  // ⚠ §5.2: "If the request fails at the network …". A dead container, a pulled cable and a
  // DNS failure all arrive here, and none of them is a wrong password.
  if (response === null) return { kind: 'unreachable' };

  if (response.type === 'opaqueredirect' || response.status === 302 || response.ok) return null;

  if (response.status === 429) {
    // ⚠ `?? 0` is not a countdown this file invented: it is what happens when the header is
    // absent, which this server never does. Zero re-enables submit at once so the next
    // attempt collects a real `Retry-After` rather than leaving the card on a number nobody
    // sent.
    return { kind: 'rate-limited', secondsRemaining: retryAfterSeconds(response.retryAfter) ?? 0 };
  }

  // ⚠ Only a 401 is a wrong password. §5 makes **every** refusal this server issues a 401
  // with no body — wrong password, malformed body, oversized body, wrong content type,
  // unconfigured server — so 401 is exactly "the dashboard refused this attempt", and
  // anything else (500, 502, a proxy's 404, an HTML error page) is a server that did not
  // answer the question.
  if (response.status === 401) return { kind: 'wrong' };

  return { kind: 'unreachable' };
};
