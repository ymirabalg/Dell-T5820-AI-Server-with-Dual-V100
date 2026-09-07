#!/usr/bin/env python3
"""Step 7's deliberate regressions — evidence that the auth and login tests bite.

Same harness as steps 2–6, including step 4's per-mutation **red-test ledger**. Each entry
replaces one exact string in one source file with a plausible *wrong* implementation — the
wrong thing someone would actually write, not a syntax error — runs the affected check, and
restores the file. **Every one must exit 1.**

Two kinds of check:

* ``test``  — ``pnpm vitest run <file>``. Runtime behaviour.
* ``types`` — ``pnpm typecheck``. Vitest's ``typecheck`` block only covers ``*.test-d.ts``,
  so a loosened type shows up only under ``tsc``.

An "ANCHOR NOT FOUND" line means the implementation moved and the mutation needs re-aiming;
it does not mean the test is fine.

⚠ HANDOVER §5.1 is honoured: **no mutation anchors on the comparison it means to weaken**
without a sibling pointing the other way. The comparisons that decide behaviour here —
``attempts.length > maxAttempts``, ``lockedUntilMs > nowMs``, ``exp > nowMs``,
``expMs <= nowMs``, ``length < MIN_SESSION_SECRET_CHARS`` — each carry a fixture on **both**
sides in the test files, and the mutations below weaken them from outside the comparison
where possible.

⚠ Rewritten in step 7's **reconciliation**, which changed enough to re-aim thirteen mutations
and add fifteen. What moved, and why, so an ``ANCHOR NOT FOUND`` here is read correctly:

* ``base64url.ts`` is new — the **one** canonical decoder, shared by ``scrypt.ts`` and
  ``session.ts``. ``S3``/``S4`` fire at it now, and ``S3`` reddens both consumers because the
  verifier used to omit exactly that check (``E9`` is the regression that re-omits it).
* ``rate-limit.ts`` has **no key**: §5 makes the bucket global, so ``sourceKeyOf``,
  ``MAX_KEY_CHARS``, ``UNKNOWN_SOURCE``, the ``Map`` and its sweep are gone, and with them the
  old ``L6``/``L8``/``L9``.
* ``handler.ts`` requires ``Content-Type: application/json`` **before** the limiter
  (``P15``/``P16``/``P21``), wraps the limiter and ``DELETE``'s verdict (``P17``/``P18``), and
  counts the body cap in bytes (``P20``).
* ``login-view.ts`` gained §5.2's sixth state, ``loginOutcome`` and the two path constants
  (``W12``-``W18``, ``X9``).

⚠ Four mutations here point at files other steps own (``G1``/``G2`` at
``lib/guardrails.test.ts``, and step 6's ``H3`` which this step **re-aimed** in step 6's own
harness because ``lib/telemetry/handler.test.ts`` is in step 6's ``LEDGER_FILES``). Ledger
ownership follows the FILE, not the step (HANDOVER §5.2).

⚠ Properties with **no mutation**, recorded here rather than papered over:

* ``session.ts``'s signature-length guard, which now lives inside ``decodeExact``. Removing
  it is behaviour-preserving *for the session path*, because the surrounding ``try``/``catch``
  — which §5 requires independently — swallows the ``RangeError`` that ``timingSafeEqual``
  throws on a length mismatch and returns the same ``null``. (``S4`` does bite the *scrypt*
  path, where there is no such catch to hide it.) The guard is what makes the refusal a
  *decision* rather than a caught exception, and it is exercised from both sides by
  ``⚠ a signature of the wrong length is refused on both sides of 32 bytes``.
* **"One bucket for the whole service"** (§5) has no single-file wrong implementation. The
  version it replaced keyed on ``X-Forwarded-For``, and restoring that is a *two-file* change
  — a key parameter in ``rate-limit.ts`` and a key at the call site in ``handler.ts`` — which
  this harness cannot express, since every mutation mutates one file. The ⚠ tests that assert
  it (``⚠ the lockout is global …``, ``⚠ a flood of invented sources …``) are kept honest by
  ``P19``, which proves they are not inert; that they point at *global* rather than *per
  source* is carried by reading them, which is the half §5.2's ledger rules already say is
  irreducible.
* ``session.ts``'s ``Number.isFinite`` guards on ``iat``/``exp``. **Measured:**
  ``JSON.stringify({ exp: Infinity })`` is ``{"exp":null}`` — JSON has no way to express
  ``Infinity`` or ``NaN`` — so no signed payload can ever carry one, and the ``typeof
  … === 'number'`` guard beside it refuses the ``null`` that arrives instead. The finiteness
  guard is unreachable defence against a future payload source that is not JSON, and the two
  test cases that look like they exercise it are named for what they actually check.
* ``proxy.test.ts``'s *"the gate is at proxy.ts, and there is no stale middleware.ts beside
  it"*. Next 16 renamed the convention and a file left at the old name simply never runs — an
  open dashboard with nothing in any log. The property is about which files **exist**, and
  this harness mutates the *contents* of one file, so no mutation can express it. Per
  HANDOVER §5.2 the ⚠ was dropped rather than the standard.
* ⚠ ``login-form.tsx``'s ``opaqueredirect`` branch **is no longer on this list.** It was
  unmutatable only because it was buried in a component's submit handler; step 7's
  reconciliation lifted the response→state mapping into ``login-view.ts``'s ``loginOutcome``,
  where it is a table test and ``W15`` reddens it. The lesson is worth keeping: an untestable
  branch is often a placement problem rather than a testing one.

Run from ``dashboard/`` with pnpm on PATH, and **never concurrently with `pnpm verify`**:

    export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
    python3 pipeline/steps/07-auth-login/regressions.py
"""

import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]

SCRYPT = "lib/auth/scrypt.test.ts"
COOKIE = "lib/auth/cookie.test.ts"
CONFIG = "lib/auth/config.test.ts"
SESSION = "lib/auth/session.test.ts"
LIMIT = "lib/auth/rate-limit.test.ts"
REVOKE = "lib/auth/revocations.test.ts"
AUTHZ = "lib/auth/authorize.test.ts"
LOGIN = "lib/auth/handler.test.ts"
VIEW = "lib/auth/login-view.test.ts"
PYHASH = "lib/auth/hash-password-script.test.ts"
ROUTE = "app/api/session/route.test.ts"
FORM = "app/login/login-form.test.tsx"
PAGE = "app/login/page.test.tsx"
PROXY = "proxy.test.ts"
GUARD = "lib/guardrails.test.ts"

# ---------------------------------------------------------------------------
# ⚠ The per-mutation red-test ledger  (copied verbatim from steps 4–6; only
#    LEDGER_FILES changes)
# ---------------------------------------------------------------------------
#
# Six consecutive steps shipped a test that NAMES a property it does not check. So:
#
#     Every ⚠-marked test must appear in at least one mutation's RED set.
#
# The harness runs each mutation, records which test names went red, unions those sets, and
# fails if a ⚠-marked test never appears. A test that no mutation can distinguish is a test
# that cannot fail for any wrong implementation anyone was willing to write.
#
# ⚠ What this CANNOT catch, and the limit is irreducible: a test that goes red for the WRONG
# reason. Mechanise the necessary condition; keep reading each test against its own name for
# the sufficient one.
#
# ⚠ A failure here is NOT "add a mutation until it goes green". The first hypothesis is that
# the test is inert and should be given a body matching its name, or renamed to what it
# actually checks. The second is that the property has no plausible wrong implementation, in
# which case drop the ⚠ rather than the standard.
#
# ⚠ `lib/guardrails.test.ts` is deliberately NOT here even though step 7 widened the scope of
# two ⚠ tests in it (`lib/auth/` and `proxy.ts` joined `lib/collectors/`, `lib/telemetry/` and
# `app/api/`). Ledger ownership follows the FILE, so those two live in step 4's harness —
# `T56` and `T67` already redden them, and both survived the rename. `G1` and `G2` below fire
# at them from this side, proving the *widening* rather than the rule.
LEDGER_FILES = [
    SCRYPT, COOKIE, CONFIG, SESSION, LIMIT, REVOKE, AUTHZ, LOGIN, VIEW, ROUTE, FORM, PAGE,
    PROXY, PYHASH
]

# `test('…')`, `it('…')` and `test.each(…)('…')`, single- or double-quoted.
MARKED = re.compile(
    r"""(?:^|\s)(?:test|it)(?:\.each\([^\n]*\))?\(\s*(['"])((?:(?!\1).)*⚠(?:(?!\1).)*)\1"""
)


def marked_tests():
    """Every ⚠-marked test name, as (file, name, matchable-prefix) triples."""
    found = []
    for rel in LEDGER_FILES:
        text = pathlib.Path(rel).read_text()
        for m in MARKED.finditer(text):
            name = m.group(2)
            prefix = name.split("%")[0].strip()
            if len(prefix) < 12:
                print(f"!!! {rel}: ⚠ test name is unmatchably short: {name!r}")
            found.append((rel, name, prefix))
    return found


def red_test_lines(out):
    """The `FAIL <file> > <suite> > <test>` lines vitest prints, one per failing test."""
    return [l.strip() for l in out.splitlines() if l.strip().startswith("FAIL ")]


BASE64URL_SRC = "lib/auth/base64url.ts"
SCRYPT_SRC = "lib/auth/scrypt.ts"
COOKIE_SRC = "lib/auth/cookie.ts"
CONFIG_SRC = "lib/auth/config.ts"
SESSION_SRC = "lib/auth/session.ts"
LIMIT_SRC = "lib/auth/rate-limit.ts"
REVOKE_SRC = "lib/auth/revocations.ts"
AUTHZ_SRC = "lib/auth/authorize.ts"
LOGIN_SRC = "lib/auth/handler.ts"
VIEW_SRC = "lib/auth/login-view.ts"
ROUTE_SRC = "app/api/session/route.ts"
FORM_SRC = "app/login/login-form.tsx"
PAGE_SRC = "app/login/page.tsx"
PROXY_SRC = "proxy.ts"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ================================================================ §5 — the KDF
    ("S1 the derived keys are compared with Buffer.equals — variable time, classic defect",
     SCRYPT_SRC,
     "  return derived.length === stored.key.length && timingSafeEqual(derived, stored.key);",
     "  return derived.length === stored.key.length && derived.equals(stored.key);",
     [SCRYPT]),
    ("S2 the memory ceiling is dropped, so the shipped parameters throw on every login",
     SCRYPT_SRC,
     "            { N: 2 ** params.logN, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },",
     "            { N: 2 ** params.logN, r: params.r, p: params.p },",
     [SCRYPT]),
    # ⚠ Both now fire at the SHARED decoder (`base64url.ts`), which is where step 7's
    # reconciliation put the one definition of canonical base64url. S3 reddens BOTH consumers,
    # which is the point: `session.ts` used to omit exactly this check.
    ("S3 the shared decoder drops its canonical re-encode — Buffer.from is lenient",
     BASE64URL_SRC, "  if (decoded.toString('base64url') !== field) return null;\n", "",
     [SCRYPT, SESSION]),
    ("S4 the decoded field's length is not checked, so a short salt is accepted",
     BASE64URL_SRC, "  if (decoded.length !== expectedBytes) return null;\n", "", [SCRYPT]),
    ("S5 the cost bounds are widened, so a typo'd logN asks OpenSSL for 8 GiB",
     SCRYPT_SRC,
     "const LIMITS = { logN: { min: 1, max: 20 }, r: { min: 1, max: 32 }, p: { min: 1, max: 16 } };",
     "const LIMITS = { logN: { min: 1, max: 64 }, r: { min: 1, max: 64 }, p: { min: 1, max: 64 } };",
     [SCRYPT]),
    ("S6 the serialiser is a pass-through, so a login flood takes libuv's whole thread pool",
     SCRYPT_SRC,
     "    const started = tail.then(work);",
     "    const started = work();",
     [SCRYPT]),
    ("S7 the queue's tail keeps the rejection, so one failed hash hangs every later login",
     SCRYPT_SRC,
     "    tail = started.then(\n      () => undefined,\n      () => undefined,\n    );",
     "    tail = started;",
     [SCRYPT]),
    ("S8 the encoding becomes PHC, whose $ and = are hazards in every KEY=VALUE grammar",
     SCRYPT_SRC,
     "  [\n    SCRYPT_TAG,\n    hash.params.logN,\n    hash.params.r,\n    hash.params.p,\n"
     "    hash.salt.toString('base64url'),\n    hash.key.toString('base64url'),\n  ].join('.');",
     "  `$${SCRYPT_TAG}$ln=${hash.params.logN},r=${hash.params.r},p=${hash.params.p}`"
     " + `$${hash.salt.toString('base64url')}$${hash.key.toString('base64url')}`;",
     [SCRYPT]),
    ("S9 scrypt's SYNCHRONOUS throw on bad parameters is left uncaught — a 500, not a 401",
     SCRYPT_SRC,
     "        } catch {\n"
     "          // ⚠ Synchronous, and measured — see the module doc. Deliberately swallowed: §5\n"
     "          // makes every failure to reach a verdict a denial.\n"
     "          resolve(null);\n"
     "        }",
     "        } finally {\n          /* nothing */\n        }",
     [SCRYPT]),
    ("S10 the algorithm tag is not checked, so an argon2id-shaped value is read as scrypt",
     SCRYPT_SRC, "  if (tag !== SCRYPT_TAG) return null;\n", "", [SCRYPT]),

    # ============================================================= §5 — the cookie
    ("K1 the 30-day Max-Age is dropped, so the session dies with the browser",
     COOKIE_SRC,
     "  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict`;",
     [COOKIE]),
    ("K2 httpOnly is dropped, so any script on the page can read the session",
     COOKIE_SRC,
     "  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "  `${SESSION_COOKIE}=${value}; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     [COOKIE]),
    ("K3 SameSite is relaxed to Lax, which is what carries CSRF protection without TLS",
     COOKIE_SRC, "SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;", [COOKIE]),
    ("K4 Secure is added, so the cookie is never sent over §5's plain HTTP",
     COOKIE_SRC, "; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;", [COOKIE]),
    ("K5 the clearing cookie loses Path, so the browser deletes a different cookie",
     COOKIE_SRC,
     "  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;",
     "  `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Max-Age=0`;",
     [COOKIE]),
    ("K6 the reader splits on every = and percent-decodes — a lone % is then a URIError",
     COOKIE_SRC,
     "  for (const pair of header.split(';')) {\n"
     "    const eq = pair.indexOf('=');\n"
     "    if (eq < 0) continue;\n"
     "    if (pair.slice(0, eq).trim() !== name) continue;\n\n"
     "    const value = pair.slice(eq + 1).trim();\n"
     "    return value === '' ? null : value;\n  }",
     "  for (const pair of header.split(';')) {\n"
     "    const [rawName, rawValue] = pair.split('=');\n"
     "    if ((rawName ?? '').trim() !== name) continue;\n"
     "    const value = decodeURIComponent((rawValue ?? '').trim());\n"
     "    return value === '' ? null : value;\n  }",
     [COOKIE]),
    ("K7 thirty days becomes seven",
     COOKIE_SRC, "export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;",
     "export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;", [COOKIE]),

    # ============================================================ §5 — the token
    ("E1 the signature is not verified, so any payload at all is a session",
     SESSION_SRC,
     "    if (!timingSafeEqual(given, sign(secret, payload))) return null;\n", "",
     [SESSION, AUTHZ, PROXY]),
    ("E2 the outer catch is removed — a signed non-JSON payload becomes a 500",
     SESSION_SRC,
     "  } catch {\n"
     "    // ⚠ §5: any error raised while deciding is a denial. Nothing here is expected to throw —\n"
     "    // every step above is guarded — and this is the second lock, not the first.\n"
     "    return null;\n  }",
     "  } finally {\n    /* nothing */\n  }",
     [SESSION]),
    ("E3 the expiry boundary is inclusive, so a token is live for one tick past its exp",
     SESSION_SRC, "    return session.exp > nowMs ? session : null;",
     "    return session.exp >= nowMs ? session : null;", [SESSION]),
    ("E4 expiry is not enforced server-side at all — a 30-day cookie becomes forever",
     SESSION_SRC, "    return session.exp > nowMs ? session : null;", "    return session;",
     [SESSION, AUTHZ, PROXY]),
    ("E5 the session id is derived from the clock, so two logins can share a revocation",
     SESSION_SRC,
     "    sid: randomBytes(SESSION_ID_BYTES).toString('base64url'),",
     "    sid: Buffer.from(String(nowMs), 'utf8').toString('base64url'),",
     [SESSION]),
    ("E6 the payload version is not checked, so a future token shape is read as this one",
     SESSION_SRC, "  if (candidate['v'] !== SESSION_VERSION) return null;\n", "", [SESSION]),
    ("E9 the signature is decoded leniently again, so 1 tag in 16 has four accepted spellings",
     SESSION_SRC,
     "    const given = decodeExact(signature, SIGNATURE_BYTES);\n    if (given === null) return null;",
     "    const given = Buffer.from(signature, 'base64url');\n"
     "    if (given.length !== SIGNATURE_BYTES) return null;",
     [SESSION]),
    ("E8 the wrong cookie is read, so a session is never found",
     SESSION_SRC,
     "  verifySessionToken(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret, nowMs);",
     "  verifySessionToken(readCookie(request.headers.get('cookie'), 'session'), secret, nowMs);",
     [SESSION, AUTHZ]),

    # ====================================================== §5.1 — the env contract
    # ⚠ Added in step 8's reconciliation, with §4's `standing` field. §5.1 lists `STANDING`
    # in this env file and §4 says the list is "echoed verbatim and never parsed
    # server-side" — so this module splits on §6.4's comma and stops. Every entry below is
    # one an operator could plausibly type and one §6.4 requires the **browser** to report as
    # unknown; a server that tidied them would turn the loudest rule in §6.4 into silence.
    ("C10 the server tidies STANDING, so a malformed id never reaches the operator",
     CONFIG_SRC,
     "  return raw.split(STANDING_SEPARATOR);",
     "  return raw.split(STANDING_SEPARATOR).map((e) => e.trim()).filter((e) => e !== '');",
     [CONFIG]),
    ("C11 an unset STANDING sends one empty id rather than an empty list",
     CONFIG_SRC,
     "  if (raw === undefined || raw === '') return [];",
     "  if (raw === undefined) return [];",
     [CONFIG]),
    ("C12 STANDING is split on the wrong separator, so a two-entry list becomes one unknown id",
     CONFIG_SRC,
     "export const STANDING_SEPARATOR = ',';",
     "export const STANDING_SEPARATOR = ';';",
     [CONFIG]),
    ("F1 any secret at all is accepted, so a hand-written one makes the cookie forgeable",
     CONFIG_SRC, "export const MIN_SESSION_SECRET_CHARS = 32;",
     "export const MIN_SESSION_SECRET_CHARS = 0;", [CONFIG]),
    ("F2 an empty PASSWORD_HASH is a config, so an unconfigured server is loggable-into",
     CONFIG_SRC, "  if (passwordHash === '') return null;\n", "", [CONFIG, LOGIN]),
    ("F4 an env key is renamed, so `dashboard.sh` and the verifier stop reading the same file",
     CONFIG_SRC, "export const PASSWORD_HASH_KEY = 'PASSWORD_HASH';",
     "export const PASSWORD_HASH_KEY = 'DASHBOARD_PASSWORD_HASH';", [CONFIG]),
    ("F3 the values are not trimmed, so a trailing newline in the env file breaks login",
     CONFIG_SRC,
     "  const passwordHash = env[PASSWORD_HASH_KEY]?.trim() ?? '';\n"
     "  const sessionSecret = env[SESSION_SECRET_KEY]?.trim() ?? '';",
     "  const passwordHash = env[PASSWORD_HASH_KEY] ?? '';\n"
     "  const sessionSecret = env[SESSION_SECRET_KEY] ?? '';",
     [CONFIG]),

    # ======================================================== §5 — the rate limit
    # ⚠ Every mutation below fires at a limiter with **no key**. §5 makes the bucket global,
    # so `sourceKeyOf`, `MAX_KEY_CHARS`, `UNKNOWN_SOURCE`, the `Map` and its O(n) sweep are
    # gone, and with them `L6`/`L8`/`L9`'s old targets.
    ("L1 the fifth attempt is refused — off by one against §5's five per minute",
     LIMIT_SRC, "      if (attempts.length > maxAttempts) {",
     "      if (attempts.length >= maxAttempts) {", [LIMIT, LOGIN]),
    ("L2 the lockout keeps the attempts that caused it, so release relocks immediately",
     LIMIT_SRC, "        attempts = [];\n", "", [LIMIT]),
    ("L3 a refused attempt is recorded, so a retrying tab extends the lockout for ever",
     LIMIT_SRC,
     "      if (lockedUntilMs > nowMs) {\n"
     "        return { allowed: false, retryAfterSeconds: retryAfterSeconds(lockedUntilMs - nowMs) };\n"
     "      }",
     "      if (lockedUntilMs > nowMs) {\n"
     "        lockedUntilMs = nowMs + lockoutMs;\n"
     "        return { allowed: false, retryAfterSeconds: retryAfterSeconds(lockedUntilMs - nowMs) };\n"
     "      }",
     [LIMIT]),
    ("L4 the lockout boundary is inclusive, so it lasts one tick longer than §5.2 says",
     LIMIT_SRC, "      if (lockedUntilMs > nowMs) {",
     "      if (lockedUntilMs >= nowMs) {", [LIMIT]),
    ("L5 Retry-After is floored, so the last second of a lockout is advertised as 0",
     LIMIT_SRC,
     "const retryAfterSeconds = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / 1000));",
     "const retryAfterSeconds = (remainingMs: number): number => Math.floor(remainingMs / 1000);",
     [LIMIT]),
    # ⚠ The state is hoisted to module scope, so every limiter in the process shares one
    # bucket. Behaviour-identical for the single production instance and wrong for a test —
    # and it is the shape that would hide the *opposite* failure step 11 owns: a second module
    # instance makes §5's global limit N× looser, silently.
    ("L6 the bucket is module-level, so two limiters are one and a test cannot see the limit",
     LIMIT_SRC,
     [("export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {",
       "let attempts: number[] = [];\nlet lockedUntilMs = 0;\n\n"
       "export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {"),
      ("  /** Monotonic instants of the attempts inside the current window. */\n"
       "  let attempts: number[] = [];\n"
       "  /** Monotonic instant the lockout ends, or `0`. */\n"
       "  let lockedUntilMs = 0;\n\n",
       "")],
     [LIMIT]),
    ("L7 the window filter is inverted, so only stale attempts are kept and nothing locks",
     LIMIT_SRC, "      attempts = attempts.filter((at) => at > since);",
     "      attempts = attempts.filter((at) => at < since);", [LIMIT, LOGIN]),
    ("L8 clearing forgets the attempts but not the lockout, so a correct password still waits",
     LIMIT_SRC,
     "    clear(): void {\n      attempts = [];\n      lockedUntilMs = 0;\n    },",
     "    clear(): void {\n      attempts = [];\n    },",
     [LIMIT]),
    ("L10 the lockout is five seconds rather than §5.2's sixty",
     LIMIT_SRC, "export const LOCKOUT_MS = 60_000;", "export const LOCKOUT_MS = 5_000;",
     [LIMIT, LOGIN]),

    # ============================================================ DELETE's revocation
    ("V1 a revocation ignores its own expiry, so the map grows without bound",
     REVOKE_SRC,
     "      if (expMs <= nowMs) {\n"
     "        // The cookie is past its own expiry, so `verifySessionToken` has already refused it\n"
     "        // and the entry is dead weight.\n"
     "        until.delete(sid);\n"
     "        return false;\n      }\n",
     "",
     [REVOKE]),
    ("V2 revoke records nothing, so DELETE is cosmetic and the token replays",
     REVOKE_SRC, "      until.set(sid, expMs);\n", "", [REVOKE, AUTHZ, LOGIN]),
    ("V3 the sweep reads its own wall clock instead of the caller's",
     REVOKE_SRC, "      if (until.size > SWEEP_AT) sweep(nowMs);",
     "      if (until.size > SWEEP_AT) sweep(Date.now());", [REVOKE]),

    # =========================================================== the session verdict
    ("A1 the verdict skips revocation, so a logged-out cookie still reads telemetry",
     AUTHZ_SRC,
     "  return deps.revocations.isRevoked(session.sid, nowMs) ? null : session;",
     "  return session;",
     [AUTHZ, LOGIN]),
    ("A2 an unconfigured server mints a session of its own — the placeholder made permissive",
     AUTHZ_SRC,
     "  const config = readAuthConfig(deps.env);\n  if (config === null) return null;\n\n"
     "  const nowMs = deps.nowMs();",
     "  const nowMs = deps.nowMs();\n  const config = readAuthConfig(deps.env);\n"
     "  if (config === null) return { v: 1, sid: 'unconfigured', iat: nowMs, exp: nowMs + 60_000 };\n",
     [AUTHZ]),
    ("A3 verifySession is permissive — HANDOVER §6 item 1, arriving through step 7",
     AUTHZ_SRC, "    return liveSessionOf(request, deps) !== null;", "    return true;",
     [AUTHZ, LOGIN]),
    ("A4 the deny-on-error catch is removed, so a broken dependency is a 500",
     AUTHZ_SRC,
     "  } catch {\n"
     "    // ⚠ Unreachable by construction, and kept anyway — §5 makes every failure to reach a\n"
     "    // verdict a denial, and this is the layer that owns that promise for its own callers.\n"
     "    return false;\n  }",
     "  } finally {\n    /* nothing */\n  }",
     [AUTHZ]),

    # ============================================== POST / DELETE /api/session (§5)
    ("P1 the rate limit is checked AFTER the KDF — five answers a minute, unlimited work",
     LOGIN_SRC,
     [("  // 2. Before the body, and long before the KDF. One bucket for the service, so at most\n"
       "  //    MAX_ATTEMPTS hashes can be queued behind this line.\n"
       "  let verdict: RateVerdict;\n"
       "  try {\n"
       "    verdict = deps.limiter.attempt(deps.monotonicMs());\n"
       "  } catch {\n",
       "  if (false) {\n"),
      ("    // ⚠ Fail closed. The limiter is a seam, and §5's rule — a refusal that cannot reach a\n"
       "    // verdict denies, never 500s — has to hold at the seam and not merely inside the Map.\n"
       "    // A 500 here would render as \"Password not recognised.\" on §5.2's own screen were it not\n"
       "    // for the *Could not reach the dashboard.* branch, and neither is a thing to leave to\n"
       "    // the client to make right.\n"
       "    return refused();\n"
       "  }\n"
       "  if (!verdict.allowed) {\n"
       "    return new Response(null, {\n"
       "      status: 429,\n"
       "      headers: {\n"
       "        // §5.2: \"the screen renders its countdown from that value\". Whole seconds, never 0.\n"
       "        'retry-after': String(verdict.retryAfterSeconds),\n"
       "        'cache-control': NO_STORE,\n"
       "      },\n"
       "    });\n"
       "  }\n\n",
       "  }\n\n"),
      ("  if (!ok) return refused();\n",
       "  const verdict: RateVerdict = deps.limiter.attempt(deps.monotonicMs());\n"
       "  if (!verdict.allowed) {\n"
       "    return new Response(null, {\n"
       "      status: 429,\n"
       "      headers: {\n"
       "        'retry-after': String(verdict.retryAfterSeconds),\n"
       "        'cache-control': NO_STORE,\n"
       "      },\n"
       "    });\n"
       "  }\n\n"
       "  if (!ok) return refused();\n")],
     [LOGIN]),
    ("P2 the 429 carries no Retry-After, so §5.2's countdown has nothing to render",
     LOGIN_SRC,
     "        'retry-after': String(verdict.retryAfterSeconds),\n", "", [LOGIN]),
    ("P3 success answers 200, so §5.2's \"302 to /\" never happens",
     LOGIN_SRC, "    status: 302,\n    headers: {\n      location: '/',",
     "    status: 200,\n    headers: {\n      location: '/',", [LOGIN]),
    ("P4 a successful login leaves the attempts standing, one typo short of a lockout",
     LOGIN_SRC, "  deps.limiter.clear();\n", "", [LOGIN]),
    ("P5 DELETE forgets to revoke, so the token is replayable after logout",
     LOGIN_SRC,
     "    if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());",
     "    void session;",
     [LOGIN]),
    ("P6 DELETE refuses when the cookie is unreadable — the client that most needs it cleared",
     LOGIN_SRC,
     "    const session = liveSessionOf(request, authorizeDepsOf(deps));\n"
     "    if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());\n",
     "    const session = liveSessionOf(request, authorizeDepsOf(deps));\n"
     "    if (session === null) return new Response(null, { status: 401 });\n"
     "    deps.revocations.revoke(session.sid, session.exp, deps.nowMs());\n",
     [LOGIN]),
    ("P7 a throwing verifier propagates — §5's 401 becomes §6.7's failed-poll path",
     LOGIN_SRC,
     "  let ok = false;\n  try {\n    ok = await deps.verify(password, config.passwordHash);\n"
     "  } catch {\n"
     "    // ⚠ Fail closed. `verifyPassword` is total, but the seam is injectable and §5's rule —\n"
     "    // any error while deciding is a denial — is the one that must hold at the boundary.\n"
     "    ok = false;\n  }",
     "  const ok = await deps.verify(password, config.passwordHash);",
     [LOGIN]),
    ("P8 a malformed body answers 400, a sixth state §5.2's screen has no copy for",
     LOGIN_SRC,
     "  const password = await passwordFrom(request);\n  if (password === null) return refused();",
     "  const password = await passwordFrom(request);\n"
     "  if (password === null) return new Response(null, { status: 400 });",
     [LOGIN]),
    ("P9 the body cap is gone, so an attempt can make this process hold a megabyte",
     LOGIN_SRC,
     "    if (bytes === 0 || bytes > MAX_BODY_BYTES) return null;",
     "    if (bytes === 0) return null;",
     [LOGIN]),
    ("P10 a missing PASSWORD_HASH is verified against the empty string rather than refused",
     LOGIN_SRC,
     "  const config = readAuthConfig(deps.env);\n  if (config === null) return refused();",
     "  const config = readAuthConfig(deps.env) ?? { passwordHash: '', sessionSecret: '' };",
     [LOGIN]),
    ("P13 the limiter is handed the wall clock, so an NTP step ends or extends a lockout",
     LOGIN_SRC, "  monotonicMs: () => performance.now(),", "  monotonicMs: () => Date.now(),",
     [LOGIN]),
    ("P14 an unconfigured server logs everyone in — the \"make it work locally\" edit",
     LOGIN_SRC,
     "  const config = readAuthConfig(deps.env);\n  if (config === null) return refused();",
     "  const config = readAuthConfig(deps.env);\n  if (config === null) {\n"
     "    return new Response(null, {\n"
     "      status: 302,\n"
     "      headers: { location: '/', 'cache-control': NO_STORE },\n"
     "    });\n  }",
     [LOGIN, ROUTE]),
    ("P11 the 302 arrives without the cookie it exists to set",
     LOGIN_SRC, "      'set-cookie': sessionCookieHeader(token),\n", "", [LOGIN]),
    ("P12 the declared content-length is ignored, so an oversized body is read anyway",
     LOGIN_SRC,
     "    const declared = Number(request.headers.get('content-length') ?? '0');\n"
     "    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;\n\n", "",
     [LOGIN]),

    # ------------------------------- §5's Content-Type requirement, and the two open seams
    ("P15 any Content-Type is accepted, so any page the operator visits can spend the budget",
     LOGIN_SRC,
     "const isJson = (request: Request): boolean => {\n"
     "  const header = request.headers.get('content-type');\n"
     "  if (header === null) return false;\n"
     "  return (header.split(';')[0] ?? '').trim().toLowerCase() === REQUIRED_CONTENT_TYPE;\n"
     "};",
     "const isJson = (request: Request): boolean => {\n  void request;\n  return true;\n};",
     [LOGIN]),
    ("P16 Content-Type is checked AFTER the limiter, so a CORS simple request spends the budget",
     LOGIN_SRC,
     [("  // 1. §5's request grammar, before any budget is spent on this caller.\n"
       "  if (!isJson(request)) return refused();\n\n",
       ""),
      ("  const password = await passwordFrom(request);\n",
       "  if (!isJson(request)) return refused();\n\n"
       "  const password = await passwordFrom(request);\n")],
     [LOGIN]),
    ("P17 the limiter call is unwrapped, so a throwing limiter is a 500 §5 forbids",
     LOGIN_SRC,
     "  let verdict: RateVerdict;\n"
     "  try {\n"
     "    verdict = deps.limiter.attempt(deps.monotonicMs());\n"
     "  } catch {\n"
     "    // ⚠ Fail closed. The limiter is a seam, and §5's rule — a refusal that cannot reach a\n"
     "    // verdict denies, never 500s — has to hold at the seam and not merely inside the Map.\n"
     "    // A 500 here would render as \"Password not recognised.\" on §5.2's own screen were it not\n"
     "    // for the *Could not reach the dashboard.* branch, and neither is a thing to leave to\n"
     "    // the client to make right.\n"
     "    return refused();\n"
     "  }",
     "  const verdict: RateVerdict = deps.limiter.attempt(deps.monotonicMs());",
     [LOGIN]),
    ("P18 DELETE's verdict is unwrapped, so a throwing store is a 500 instead of a logout",
     LOGIN_SRC,
     "  try {\n"
     "    const session = liveSessionOf(request, authorizeDepsOf(deps));\n"
     "    if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());\n"
     "  } catch {\n"
     "    // ⚠ See the doc above: `liveSessionOf` is not total by catch, and a logout must clear the\n"
     "    // cookie whatever the store says.\n"
     "  }\n",
     "  const session = liveSessionOf(request, authorizeDepsOf(deps));\n"
     "  if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());\n",
     [LOGIN]),
    ("P19 a limiter is built per request, so §5's five per minute counts nothing at all",
     LOGIN_SRC,
     [("import { productionRateLimiter } from './rate-limit';",
       "import { createRateLimiter, productionRateLimiter } from './rate-limit';"),
      ("    verdict = deps.limiter.attempt(deps.monotonicMs());",
       "    verdict = createRateLimiter().attempt(deps.monotonicMs());")],
     [LOGIN]),
    ("P20 the body cap counts UTF-16 code units again, so multi-byte bodies are twice the cap",
     LOGIN_SRC,
     "    const bytes = Buffer.byteLength(text, 'utf8');",
     "    const bytes = text.length;",
     [LOGIN]),
    ("P21 Content-Type is compared whole, so \"application/json; charset=utf-8\" cannot log in",
     LOGIN_SRC,
     "  return (header.split(';')[0] ?? '').trim().toLowerCase() === REQUIRED_CONTENT_TYPE;",
     "  return header === REQUIRED_CONTENT_TYPE;",
     [LOGIN]),

    # ============================================================ §5 — the gate
    ("X1 an unauthenticated /api/* is redirected, so a poll parses HTML as a snapshot",
     PROXY_SRC, "  return isApi ? refuse() : toLogin(request, hadCookie);",
     "  return toLogin(request, hadCookie);", [PROXY]),
    ("X2 every redirect claims the session expired, including a first-ever visit",
     PROXY_SRC, "  if (hadCookie) target.searchParams.set(EXPIRED_PARAM, '1');",
     "  target.searchParams.set(EXPIRED_PARAM, '1');", [PROXY]),
    ("X3 the redirect keeps NextResponse's 307 default, so a POST is re-POSTed at /login",
     PROXY_SRC, "  return NextResponse.redirect(target, 302);",
     "  return NextResponse.redirect(target);", [PROXY]),
    ("X4 the matcher stops excluding Next's static assets, so the login page loses its CSS",
     PROXY_SRC, "  matcher: ['/((?!_next/static|_next/image|favicon\\\\.ico).*)'],",
     "  matcher: ['/:path*'],", [PROXY]),
    ("X5 the whole of /api is exempt rather than just /api/session",
     PROXY_SRC, "  if (pathname === LOGIN_PATH || pathname === SESSION_PATH) return NextResponse.next();",
     "  if (pathname === LOGIN_PATH || pathname.startsWith('/api')) return NextResponse.next();",
     [PROXY]),
    ("X6 an unconfigured server lets everything through instead of nothing",
     PROXY_SRC,
     "    const credentials = readAuthConfig(process.env);\n    if (credentials !== null) {",
     "    const credentials = readAuthConfig(process.env);\n"
     "    if (credentials === null) return NextResponse.next();\n    if (credentials !== null) {",
     [PROXY]),
    ("X8 the gate reaches for the revocation store Next's own docs say it cannot share",
     PROXY_SRC,
     "import { verifiedSessionOf } from '@/lib/auth/session';",
     "import { productionRevocations } from '@/lib/auth/revocations';\n"
     "import { verifiedSessionOf } from '@/lib/auth/session';\nvoid productionRevocations;",
     [PROXY]),
    ("X9 the gate spells the two paths itself, so step 8 inherits a second definition",
     PROXY_SRC,
     "import { EXPIRED_PARAM, LOGIN_PATH, SESSION_PATH } from '@/lib/auth/login-view';",
     "import { EXPIRED_PARAM } from '@/lib/auth/login-view';\n\n"
     "const LOGIN_PATH = '/login';\nconst SESSION_PATH = '/api/session';",
     [VIEW]),
    ("X7 /login is gated too, so the login screen redirects to itself for ever",
     PROXY_SRC, "  if (pathname === LOGIN_PATH || pathname === SESSION_PATH) return NextResponse.next();",
     "  if (pathname === SESSION_PATH) return NextResponse.next();", [PROXY]),

    # ======================================================== §5.2 — the screen's copy
    ("W1 the wrong-password copy is reworded",
     VIEW_SRC, "export const WRONG_PASSWORD_MESSAGE = 'Password not recognised.';",
     "export const WRONG_PASSWORD_MESSAGE = 'Incorrect password. Please try again.';",
     [VIEW, FORM]),
    ("W2 the countdown copy is reworded, so \"Try again in Ns.\" stops being §5.2's sentence",
     VIEW_SRC,
     "  `Too many attempts. Try again in ${secondsRemaining}s.`;",
     "  `Too many attempts. Try again in ${secondsRemaining} seconds.`;",
     [VIEW, FORM]),
    ("W3 the expired copy loses §5.2's em dash",
     VIEW_SRC, "export const SESSION_EXPIRED_MESSAGE = 'Session expired — sign in again.';",
     "export const SESSION_EXPIRED_MESSAGE = 'Session expired - sign in again.';",
     [VIEW, FORM, PAGE]),
    ("W4 the field is disabled while submitting — §5.2 says it stays readable",
     VIEW_SRC,
     "    case 'submitting':\n      return { message: null, submitDisabled: true, fieldDisabled: false };",
     "    case 'submitting':\n      return { message: null, submitDisabled: true, fieldDisabled: true };",
     [VIEW, FORM]),
    ("W5 submit stays disabled after a wrong password, so one typo ends the session attempt",
     VIEW_SRC,
     "        message: { text: WRONG_PASSWORD_MESSAGE, tone: 'crit' },\n        submitDisabled: false,",
     "        message: { text: WRONG_PASSWORD_MESSAGE, tone: 'crit' },\n        submitDisabled: true,",
     [VIEW, FORM]),
    ("W6 submit is left enabled while rate-limited, so the client keeps hitting a 429",
     VIEW_SRC,
     "        message: { text: rateLimitedMessage(state.secondsRemaining), tone: 'warn' },\n"
     "        submitDisabled: true,",
     "        message: { text: rateLimitedMessage(state.secondsRemaining), tone: 'warn' },\n"
     "        submitDisabled: false,",
     [VIEW, FORM]),
    ("W7 Retry-After is parsed with Number(), so \"1.5\" becomes one and a half seconds",
     VIEW_SRC,
     "  const trimmed = header.trim();\n"
     "  if (!/^(?:0|[1-9][0-9]*)$/.test(trimmed)) return null;\n"
     "  const seconds = Number(trimmed);\n"
     "  return Number.isFinite(seconds) ? seconds : null;",
     "  const seconds = Number(header.trim());\n"
     "  return Number.isFinite(seconds) ? seconds : null;",
     [VIEW]),
    ("W9 the submit button is relabelled, so §5.2's \"Unlock\" stops being what it says",
     VIEW_SRC, "export const LOGIN_SUBMIT_LABEL = 'Unlock';",
     "export const LOGIN_SUBMIT_LABEL = 'Sign in';", [VIEW, FORM]),
    ("W10 the plain-HTTP disclosure is softened, so §5's stated choice stops being stated",
     VIEW_SRC,
     "  'Plain HTTP on the LAN — this password crosses the wire in the clear.';",
     "  'This connection is not encrypted.';", [VIEW, FORM, PAGE]),
    ("W11 submit is disabled at rest, so the idle screen offers no way in",
     VIEW_SRC,
     "    case 'idle':\n      return { message: null, submitDisabled: false, fieldDisabled: false };",
     "    case 'idle':\n      return { message: null, submitDisabled: true, fieldDisabled: false };",
     [VIEW, FORM]),
    ("W12 §5.2's sixth row says the same thing as its third — a dead server \"is\" a wrong password",
     VIEW_SRC, "export const UNREACHABLE_MESSAGE = 'Could not reach the dashboard.';",
     "export const UNREACHABLE_MESSAGE = 'Password not recognised.';", [VIEW, FORM]),
    ("W13 every unexpected status is a wrong password again — the defect §5.2's sixth row names",
     VIEW_SRC,
     "  return { kind: 'unreachable' };\n};",
     "  return { kind: 'wrong' };\n};",
     [VIEW]),
    ("W14 a network failure is a wrong password, so a stopped container blames the operator",
     VIEW_SRC,
     "  if (response === null) return { kind: 'unreachable' };",
     "  if (response === null) return { kind: 'wrong' };",
     [VIEW]),
    ("W15 the opaque-redirect spelling of success is dropped, so a browser login never lands",
     VIEW_SRC,
     "  if (response.type === 'opaqueredirect' || response.status === 302 || response.ok) return null;",
     "  if (response.status === 302 || response.ok) return null;",
     [VIEW]),
    ("W16 a 401 stops meaning \"not recognised\", so a wrong password reads as an outage",
     VIEW_SRC, "  if (response.status === 401) return { kind: 'wrong' };\n\n", "", [VIEW]),
    ("W17 the countdown becomes a constant this file invented — §5.2 forbids exactly that",
     VIEW_SRC,
     "    return { kind: 'rate-limited', secondsRemaining: retryAfterSeconds(response.retryAfter) ?? 0 };",
     "    return { kind: 'rate-limited', secondsRemaining: 60 };",
     [VIEW]),
    ("W18 the client-safe module grows an import, dragging node:crypto toward the browser",
     VIEW_SRC,
     "/** §5.2's route — the only *page* reachable unauthenticated. */",
     "import { SESSION_COOKIE } from './cookie';\n\nvoid SESSION_COOKIE;\n\n"
     "/** §5.2's route — the only *page* reachable unauthenticated. */",
     [VIEW]),
    ("W8 the address beneath the wordmark is wrong",
     VIEW_SRC, "export const LOGIN_ADDRESS = '192.168.4.71:8090';",
     "export const LOGIN_ADDRESS = '192.168.4.31:3000';", [VIEW, FORM]),

    # ======================================================= §5.2 — the screen itself
    ("C1 the field is disabled from the submit state, so it greys while a login is in flight",
     FORM_SRC, "        disabled={view.fieldDisabled}", "        disabled={view.submitDisabled}",
     [FORM]),
    ("C2 the field is cleared once there is a message — §5.2 forbids exactly this",
     FORM_SRC, "        value={password}",
     "        value={view.message === null ? password : ''}", [FORM]),
    ("C3 autocomplete is turned off, so no password manager can fill the field",
     FORM_SRC, '        autoComplete="current-password"', '        autoComplete="off"', [FORM]),
    ("C4 the field is no longer autofocused",
     FORM_SRC, "        autoFocus\n", "", [FORM]),
    ("C5 the plain-HTTP disclosure is dropped from the screen",
     FORM_SRC,
     "      <p className=\"login__disc\">\n        <i>▲</i>\n        {PLAIN_HTTP_DISCLOSURE}\n      </p>\n",
     "", [FORM, PAGE]),
    ("C6 the expired prop is ignored, so a 401 hand-off shows the idle screen",
     FORM_SRC, "useState<LoginState>(expired ? { kind: 'expired' } : { kind: 'idle' })",
     "useState<LoginState>({ kind: 'idle' })", [FORM]),
    ("C8 the screen always opens expired, so a first-ever visit is told its session ran out",
     FORM_SRC, "useState<LoginState>(expired ? { kind: 'expired' } : { kind: 'idle' })",
     "useState<LoginState>({ kind: 'expired' })", [FORM, PAGE]),
    ("C7 a remember-me checkbox appears — §5.2's \"Absent\" row, added while tidying",
     FORM_SRC,
     "      <button className=\"login__go\" type=\"submit\" disabled={view.submitDisabled}>",
     "      <label>\n        <input type=\"checkbox\" name=\"remember\" /> Remember me\n      </label>\n"
     "      <button className=\"login__go\" type=\"submit\" disabled={view.submitDisabled}>",
     [FORM]),

    # ============================================================= /login, the route
    ("G3 ?expired must equal 1, so an empty value silently shows the idle screen",
     PAGE_SRC, "expired={params[EXPIRED_PARAM] !== undefined}",
     "expired={params[EXPIRED_PARAM] === '1'}", [PAGE]),
    ("G4 the stylesheet leaves the markup-safe subset — one renderer change from selecting nothing",
     PAGE_SRC, ".login__msg i { font-style: normal; }",
     ".login__msg > i { font-style: normal; }", [PAGE]),
    ("G5 /login is prerendered, so the one route that must always work is baked",
     PAGE_SRC, "export const dynamic = 'force-dynamic';",
     "export const dynamic = 'force-static';", [PAGE]),

    # ===================================================== the Next route file (§4)
    ("N1 POST is aliased to the handler, so Next's context lands where the deps go",
     ROUTE_SRC,
     "export const POST = (request: Request): Promise<Response> => handleSessionPost(request);",
     "export const POST = handleSessionPost;", [ROUTE]),
    ("N2 DELETE is aliased the same way",
     ROUTE_SRC,
     "export const DELETE = (request: Request): Response => handleSessionDelete(request);",
     "export const DELETE = handleSessionDelete;", [ROUTE]),
    ("N3 the session route loses force-dynamic",
     ROUTE_SRC, "export const dynamic = 'force-dynamic';", "export const dynamic = 'auto';",
     [ROUTE]),
    ("N4 a GET is added that reports whether a session is live — an oracle §5 does not want",
     ROUTE_SRC,
     "export const DELETE = (request: Request): Response => handleSessionDelete(request);",
     "export const DELETE = (request: Request): Response => handleSessionDelete(request);\n\n"
     "export const GET = (): Response => new Response(null, { status: 204 });",
     [ROUTE]),

    # ============================== the widened source-text guard (step 4 owns the ledger)
    # ⚠ Both are the measured shape of HANDOVER §5.3's third note — "enumerate inputs by
    # walking the tree, never by listing files". Step 7 added two server-side locations, and
    # the guard's scope list had to grow with them or the rule would silently stop covering
    # the code most likely to break it: `rate-limit.ts` and `revocations.ts` each hold a `Map`
    # that has to be pruned, and `proxy.ts` runs on every request.
    ("G1 the rate limiter sweeps its map on an interval — §4 forbids background work",
     LIMIT_SRC,
     "export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {",
     "setInterval(() => {\n  /* sweep the buckets */\n}, 60_000).unref();\n\n"
     "export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {",
     GUARD),
    ("G2 the gate hand-rolls an unvalidated setTimeout, the fifth in this tree",
     PROXY_SRC,
     "const refuse = (): NextResponse =>",
     "const idle = setTimeout(() => undefined, Number(process.env['GATE_MS']));\nvoid idle;\n\n"
     "const refuse = (): NextResponse =>",
     GUARD),

    # ====================================================================== type-level
    # ⚠ Not written as a cast: `x as T` always type-checks, so a cast mutation can never fail
    # `tsc` and would be an inert entry. Widen or narrow the declaration instead.
    ("T1 LoginState's discriminant is widened to string, so the switch stops being exhaustive",
     VIEW_SRC,
     "export type LoginState =\n  | { readonly kind: 'idle' }",
     "export type LoginState =\n  | { readonly kind: string }\n  | { readonly kind: 'idle' }",
     "types"),
    ("T2 DELETE becomes async while the route still declares it synchronous",
     LOGIN_SRC,
     "export const handleSessionDelete = (\n  request: Request,\n"
     "  deps: SessionHandlerDeps = productionSessionDeps,\n): Response => {",
     "export const handleSessionDelete = async (\n  request: Request,\n"
     "  deps: SessionHandlerDeps = productionSessionDeps,\n): Promise<Response> => {",
     "types"),
    ("T3 the parsed hash's params lose their shape, so a cost field can go missing unnoticed",
     SCRYPT_SRC,
     "export interface ScryptHash {\n  readonly params: ScryptParams;",
     "export interface ScryptHash {\n  readonly params: Partial<ScryptParams>;",
     "types"),
]



# ---------------------------------------------------------------------------
# ⚠ `scripts/hash-password.py` — the host-side producer, added 2026-09-07
# ---------------------------------------------------------------------------
#
# The box has python3 and **no Node**, so nothing there can call `hashPassword()`. The install
# script produces `PASSWORD_HASH` with a python implementation of the same encoding, and that
# is a second producer of a format whose only failure mode is a **silent 401**. The defence is
# `lib/auth/hash-password-script.test.ts`, which runs the real file and asserts this module's
# own verifier accepts what it wrote.
#
# These mutations are what make that defence load-bearing rather than decorative: each is a
# plausible divergence between the two implementations, and every one of them produces a hash
# that LOOKS fine.

REGRESSIONS += [
    # ⚠ The one that does not fail a login: a weaker cost parameter parses, verifies, and is
    # simply not what §5.1 specifies. Only reading the parameters back can catch it.
    ("Y1 the python producer drops a cost parameter, so the hash is weaker and still verifies",
     "scripts/hash-password.py", "LOG_N = 15", "LOG_N = 14", [PYHASH]),
    ("Y2 the salt shrinks, so every hash is cheaper to attack and nothing rejects it",
     "scripts/hash-password.py", "SALT_BYTES = 16", "SALT_BYTES = 8", [PYHASH]),
    # ⚠ Node's `Buffer.toString('base64url')` is UNPADDED. Keeping the `=` is the single most
    # likely divergence, and it fails at the parser — a clean, empty, unlogged 401.
    ("Y3 base64url keeps its padding, and every login is refused with nothing logged",
     "scripts/hash-password.py",
     'return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")',
     'return base64.urlsafe_b64encode(raw).decode("ascii")', [PYHASH]),
    ("Y4 standard base64 instead of the URL alphabet — `+` and `/` are outside the alphabet",
     "scripts/hash-password.py",
     'return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")',
     'return base64.b64encode(raw).rstrip(b"=").decode("ascii")', [PYHASH]),
    ("Y5 the salt is reused across runs, so two identical passwords hash identically",
     "scripts/hash-password.py",
     "    print(hash_password(password, os.urandom(SALT_BYTES)))",
     "    print(hash_password(password, b'0123456789abcdef'))", [PYHASH]),
    # ⚠ §5.1's policy, both sides. It is enforced here and nowhere else: the server is handed a
    # hash and can never afterwards tell whether the policy was met.
    ("Y6 the length floor is dropped, so a two-character password is accepted",
     "scripts/hash-password.py", "MIN_LENGTH = 6", "MIN_LENGTH = 0", [PYHASH]),
    ("Y7 the letter rule is dropped, so an all-digit password passes",
     "scripts/hash-password.py",
     '    if not any(c.isalpha() for c in password):\n        return "at least one letter"\n',
     "", [PYHASH]),
    ("Y8 the digit rule is dropped, so an all-letter password passes",
     "scripts/hash-password.py",
     '    if not any(c.isdigit() for c in password):\n        return "at least one digit"\n',
     "", [PYHASH]),
    # ⚠ A rejected password must produce NO hash. Printing one anyway would write a credential
    # the operator was told was refused.
    ("Y9 a refused password still prints a hash, which the script then writes",
     "scripts/hash-password.py",
     '        print(f"password rejected: needs {failure}", file=sys.stderr)\n        return 2',
     '        print(f"password rejected: needs {failure}", file=sys.stderr)\n'
     '        print(hash_password(password, os.urandom(SALT_BYTES)))\n        return 2',
     [PYHASH]),
]


def main() -> int:
    os.chdir(ROOT)
    bad = []
    moved = []
    covered = set()
    for entry in REGRESSIONS:
        if len(entry) == 5:
            name, src, old, new, check = entry
            pairs = [(old, new)]
        else:
            name, src, pairs, check = entry
        checks = check if isinstance(check, list) else [check]
        path = pathlib.Path(src)
        original = path.read_text()
        mutated = original
        missing = [old for old, _ in pairs if old not in mutated]
        if missing:
            print(f"--- {name}\n    ANCHOR NOT FOUND in {src} — the implementation moved")
            moved.append(name)
            continue
        for old, new in pairs:
            mutated = mutated.replace(old, new, 1)
        path.write_text(mutated)
        try:
            if checks == ["types"]:
                cmd = ["pnpm", "typecheck"]
            else:
                cmd = ["pnpm", "vitest", "run", *checks]
            run = subprocess.run(cmd, capture_output=True, text=True)
        finally:
            path.write_text(original)
        out = run.stdout + run.stderr
        if checks == ["types"]:
            tally = next(
                (l.strip() for l in out.splitlines() if ".ts(" in l and "error TS" in l), "?"
            )[:150]
        else:
            tally = next(
                (l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")), "?"
            )
        fails = red_test_lines(out)
        covered.update(fails)
        print(f"--- {name}\n    exit={run.returncode}  {tally}  red={len(fails)}")
        for f in fails[:3]:
            print("     ", f[:150])
        if run.returncode == 0:
            bad.append(name)

    # ⚠ HANDOVER §1: `ANCHOR NOT FOUND` and `DID NOT BITE` are different findings with
    # different first hypotheses — one means the implementation moved and the mutation needs
    # re-aiming, the other means the mutation applied and no test noticed. This summary used
    # to print both under "DID NOT BITE", which is the more alarming of the two labels and
    # sends a reader hunting for a missing test that is not missing. Found 2026-09-07, when
    # an edit to `cooling.ts` moved `T31`'s anchor and the run reported it as inert.
    if moved:
        print("\nANCHORS MOVED — re-aim these, they did not run:", ", ".join(moved))
    if bad:
        print("\nDID NOT BITE:", ", ".join(bad))
    if moved or bad:
        return 1

    # ------------------------------------------------------------------ the ledger
    marked = marked_tests()
    joined = "\n".join(covered)
    uncovered = [(rel, nm) for rel, nm, prefix in marked if prefix not in joined]
    print(
        f"\nRed-test ledger: {len(covered)} distinct failing tests across "
        f"{len(REGRESSIONS)} mutations; {len(marked)} ⚠-marked tests checked."
    )
    if uncovered:
        print("\nNO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:")
        for rel, nm in uncovered:
            print(f"  {rel}\n    {nm}")
        return 1
    print("Every ⚠-marked test went red under at least one mutation.")

    print(f"\nAll {len(REGRESSIONS)} regressions failed their check, as they must.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
