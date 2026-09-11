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
# ⚠ loop 11b, 2026-09-11 — SPEC.md §5.1's `11-Q2`.
SECRETFILE = "lib/auth/secret-file.test.ts"
STARTUP = "lib/auth/startup.test.ts"
SECRETS = "lib/auth/secrets.test.ts"
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
#
# ⚠ SECRETFILE and STARTUP joined on 2026-09-11 (loop 11b, SPEC.md §5.1's `11-Q2`). They test
# `lib/auth/secret-file.ts` and `lib/auth/startup.ts`, which are step 11's RULING built inside
# step 7's directory — and ledger ownership follows the FILE, so they belong here and not to
# step 11's harness. `lib/cross-harness-ledger.test.ts` fails on a ⚠-bearing test file that is
# in no `LEDGER_FILES`, which is how this was noticed rather than assumed.
LEDGER_FILES = [
    SCRYPT, COOKIE, CONFIG, SESSION, LIMIT, REVOKE, AUTHZ, LOGIN, VIEW, ROUTE, FORM, PAGE,
    PROXY, PYHASH, SECRETFILE, STARTUP, SECRETS
]

# `test('…')`, `it('…')` and `test.each(…)('…')`, single- or double-quoted.
# ⚠ BACK-PORTED from step 9's reconciliation (Q1, 2026-09-07) — this step's
# ledger previously used a `MARKED` regex whose `.each([^\n]*)` could not span a
# newline, so a ⚠ name on a MULTI-LINE `test.each([...])(...)` was invisible to it: it
# never counted as marked, and nothing ever required a mutation to redden it. See
# HANDOVER §5.2 and `pipeline/steps/09-ui-primitives/regressions.py` for the full
# account.
#
# The replacement finds each `test`/`it` call, skips a `.each(...)` argument list
# PAREN-BALANCED and STRING-AWARE, then reads the first string literal of the call
# itself.
# ⚠ Q1 reconciliation, 2026-09-07 (adversarial F1): a GENERIC TYPE ARGUMENT between
# `.each` and its `(` — `test.each<[string, LoginState]>([…])('⚠ …')` — defeated
# `(?:test|it)(\.each)?\s*\(` completely. Not mis-parsed: never matched at all, because
# the empty-`(\.each)?` branch cannot get past `.each<` either. Two ⚠ marks in
# `lib/auth/login-view.test.ts` were invisible to BOTH the pre-Q1 regex and the step-9
# scanner Q1 back-ported, so the true invisible-mark count for steps 2–8 was 39, not 37.
# The optional `<…>` below closes it. Excluding `;{}()` from the type argument keeps the
# match from running away across a statement; a type argument containing a parenthesis
# (`test.each<[() => void]>`) would still be missed — and would now be REPORTED by the
# `CANDIDATE` diagnostic below rather than dropped in silence.
CALL = re.compile(r"(?:^|\s)(?:test|it)(\.each)?(?:\s*<[^;{}()]*>)?\s*\(")
FIRST_STRING = re.compile(r"""\s*(['"])((?:\\.|(?!\1).)*)\1""")

# ⚠ Q1 reconciliation, 2026-09-07 (adversarial F3): every `test`/`it` call this scanner is
# EXPECTED to be able to read. `marked_tests()` reports anything matching this that it could
# not read — a backtick-quoted name, a `.skip`/`.only`/`.concurrent` modifier, a generic type
# argument it still cannot parse, an unbalanced `.each(…)` list. Before this, EVERY one of
# those was a silent `continue`: the mark simply did not exist as far as the ledger was
# concerned, which is the exact defect Q1 was opened to fix, and F1 proved it was still live
# in the "corrected" scanner. The report is a warning, never a failure — it cannot break a
# passing run, and a run that starts failing for a new reason is the thing this project can
# least afford. Names are matched against prose-suppressed source (`_code_only`) because
# `(?:^|\s)it\s*\(` also matches English: three comments in this tree say "… through it (T52)".
CANDIDATE = re.compile(
    r"(?:^|\s)(?:test|it)\s*"
    r"(?:<|\(|\.(?:each|skip|only|todo|concurrent|fails|for|runIf|skipIf)\b)"
)


def _skip_balanced(text, i):
    """`text[i]` is `(`; index just past its matching `)`, skipping strings AND comments.

    ⚠ Comments are not decoration here: an apostrophe inside one (`step 8's runtime`) opens a
    string as far as a naive scanner is concerned, and everything after it is mis-parsed.
    """
    depth = 0
    while i < len(text):
        ch = text[i]
        if text.startswith("//", i):
            nl = text.find("\n", i)
            i = len(text) if nl == -1 else nl
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = len(text) if end == -1 else end + 2
            continue
        if ch in "'\"`":
            quote = ch
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return None


def _code_only(text):
    """`text` with every comment and every string BODY blanked, offsets preserved.

    Used ONLY by the `CANDIDATE` diagnostic, so that prose and the source-text guards that
    quote `test(` as data are not reported as calls the scanner failed to read.
    """
    out = list(text)
    i = 0
    while i < len(text):
        if text.startswith("//", i):
            nl = text.find("\n", i)
            end = len(text) if nl == -1 else nl
            out[i:end] = " " * (end - i)
            i = end
            continue
        if text.startswith("/*", i):
            e = text.find("*/", i + 2)
            end = len(text) if e == -1 else e + 2
            out[i:end] = " " * (end - i)
            i = end
            continue
        if text[i] in "'\"`":
            quote = text[i]
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    out[i] = " "
                    if i + 1 < len(text):
                        out[i + 1] = " "
                    i += 2
                    continue
                if text[i] == quote:
                    break
                out[i] = " "
                i += 1
            i += 1
            continue
        i += 1
    return "".join(out)


# ⚠ 10g/A7, 2026-09-10 — the ledger keys this scanner could not match, collected so the run
# FAILS on them instead of printing a warning nobody reads. The ledger's own check is
# `prefix not in joined`, so a key of `⚠` alone is a substring of every ⚠ FAIL line and the
# mark scores covered without any mutation touching it. Three such names existed across the
# nine harnesses on 2026-09-10 — all three added by 10g, one of them 10g's own acceptance
# test for the `… N more` marker — and both earlier phases reported "every ⚠ mark reddened"
# off runs that were printing these lines. HANDOVER §5.2 rule 5.
UNMATCHABLE = []


def marked_tests():
    """Every ⚠-marked test name, as (file, name, matchable-prefix) triples."""
    found = []
    UNMATCHABLE.clear()
    for rel in LEDGER_FILES:
        text = pathlib.Path(rel).read_text()
        read = set()
        for m in CALL.finditer(text):
            at = m.end() - 1  # the `(` of either `test(` or `test.each(`
            if m.group(1):  # `.each(…)` — skip its argument list, then expect `(`
                after = _skip_balanced(text, at)
                if after is None:
                    continue
                after = len(text) - len(text[after:].lstrip())
                if after >= len(text) or text[after] != "(":
                    continue
                at = after
            s = FIRST_STRING.match(text, at + 1)
            if s is None:
                continue
            read.add(m.start())
            name = s.group(2)
            if "⚠" not in name:
                continue
            # ⚠ Q1 reconciliation, 2026-09-07 (adversarial F7): the `%` split exists to strip a
            # `test.each` placeholder, so it applies ONLY to a `.each` call. Run on a plain
            # name it truncated the prefix at a literal percent sign (`⚠ exactly full renders
            # 100%, …` matched on `⚠ exactly full renders 100`), shortening the discriminating
            # prefix for no reason — and a short prefix is the input to F2's conflation.
            prefix = (name.split("%")[0] if m.group(1) else name).strip()
            if len(prefix) < 12:
                UNMATCHABLE.append((rel, name, prefix))
                print(f"!!! {rel}: ⚠ test name is unmatchably short: {name!r}")
            found.append((rel, name, prefix))
        for c in CANDIDATE.finditer(_code_only(text)):
            if c.start() in read:
                continue
            nl = text.find("\n", c.start())
            snippet = text[c.start(): len(text) if nl == -1 else nl].strip()[:100]
            line = text.count("\n", 0, c.start()) + 1
            print(f"!!! {rel}:{line}: a test/it call the ⚠-scanner cannot read — {snippet}")
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
SECRETFILE_SRC = "lib/auth/secret-file.ts"
STARTUP_SRC = "lib/auth/startup.ts"
SECRETS_SRC = "lib/auth/secrets.ts"

# (name, source file, old, new, check) — or (name, source file, [(old, new), …], check)
REGRESSIONS = [
    # ================================================================ §5 — the KDF
    ("07-S1 the derived keys are compared with Buffer.equals — variable time, classic defect",
     SCRYPT_SRC,
     "  return derived.length === stored.key.length && timingSafeEqual(derived, stored.key);",
     "  return derived.length === stored.key.length && derived.equals(stored.key);",
     [SCRYPT]),
    ("07-S2 the memory ceiling is dropped, so the shipped parameters throw on every login",
     SCRYPT_SRC,
     "            { N: 2 ** params.logN, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },",
     "            { N: 2 ** params.logN, r: params.r, p: params.p },",
     [SCRYPT]),
    # ⚠ Both now fire at the SHARED decoder (`base64url.ts`), which is where step 7's
    # reconciliation put the one definition of canonical base64url. S3 reddens BOTH consumers,
    # which is the point: `session.ts` used to omit exactly this check.
    ("07-S3 the shared decoder drops its canonical re-encode — Buffer.from is lenient",
     BASE64URL_SRC, "  if (decoded.toString('base64url') !== field) return null;\n", "",
     [SCRYPT, SESSION]),
    ("07-S4 the decoded field's length is not checked, so a short salt is accepted",
     BASE64URL_SRC, "  if (decoded.length !== expectedBytes) return null;\n", "", [SCRYPT]),
    ("07-S5 the cost bounds are widened, so a typo'd logN asks OpenSSL for 8 GiB",
     SCRYPT_SRC,
     "const LIMITS = { logN: { min: 1, max: 20 }, r: { min: 1, max: 32 }, p: { min: 1, max: 16 } };",
     "const LIMITS = { logN: { min: 1, max: 64 }, r: { min: 1, max: 64 }, p: { min: 1, max: 64 } };",
     [SCRYPT]),
    ("07-S6 the serialiser is a pass-through, so a login flood takes libuv's whole thread pool",
     SCRYPT_SRC,
     "    const started = tail.then(work);",
     "    const started = work();",
     [SCRYPT]),
    ("07-S7 the queue's tail keeps the rejection, so one failed hash hangs every later login",
     SCRYPT_SRC,
     "    tail = started.then(\n      () => undefined,\n      () => undefined,\n    );",
     "    tail = started;",
     [SCRYPT]),
    ("07-S8 the encoding becomes PHC, whose $ and = are hazards in every KEY=VALUE grammar",
     SCRYPT_SRC,
     "  [\n    SCRYPT_TAG,\n    hash.params.logN,\n    hash.params.r,\n    hash.params.p,\n"
     "    hash.salt.toString('base64url'),\n    hash.key.toString('base64url'),\n  ].join('.');",
     "  `$${SCRYPT_TAG}$ln=${hash.params.logN},r=${hash.params.r},p=${hash.params.p}`"
     " + `$${hash.salt.toString('base64url')}$${hash.key.toString('base64url')}`;",
     [SCRYPT]),
    ("07-S9 scrypt's SYNCHRONOUS throw on bad parameters is left uncaught — a 500, not a 401",
     SCRYPT_SRC,
     "        } catch {\n"
     "          // ⚠ Synchronous, and measured — see the module doc. Deliberately swallowed: §5\n"
     "          // makes every failure to reach a verdict a denial.\n"
     "          resolve(null);\n"
     "        }",
     "        } finally {\n          /* nothing */\n        }",
     [SCRYPT]),
    ("07-S10 the algorithm tag is not checked, so an argon2id-shaped value is read as scrypt",
     SCRYPT_SRC, "  if (tag !== SCRYPT_TAG) return null;\n", "", [SCRYPT]),
    # ⚠ Q1 back-port (2026-09-07): the corrected scanner exposed this ⚠ as unbacked.
    # `parseScryptHash` is total (returns `null`, never throws) for every malformed hash the
    # fixtures below cover — dropping the guard that reads its result is the one plausible
    # slip that turns "resolves false" into a rejected promise.
    # ⚠ Renamed `S11` → `SC1` by Q1's reconciliation (adversarial F5): `S11` is this
    # project's id for an OPEN obligation, always written `S11/G5` and cited across
    # `ANCHOR.md`, `HANDOVER.md`, `WORK-ITEMS.md` and `UI-BACKEND-GAPS.md`. A step-10 agent
    # grepping `S11` for what it must implement would land here first. `S12` was not the
    # escape — it is already a gap id in step 5's reconciliation — so the prefix changes.
    # ⚠ NOT fixed, and it is the same collision: the pre-existing `G5` below is the OTHER
    # half of `S11/G5`. Renaming it would invalidate step 7's own written record, so it is
    # recorded as a gap for the owner instead. See Q1's `reconciliation.md`.
    ("Q1-SC1 the parsed-hash null check is dropped, so a malformed encoded value throws",
     SCRYPT_SRC, "  if (stored === null) return false;\n", "", [SCRYPT]),

    # ============================================================= §5 — the cookie
    ("07-K1 the 30-day Max-Age is dropped, so the session dies with the browser",
     COOKIE_SRC,
     "  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict`;",
     [COOKIE]),
    ("07-K2 httpOnly is dropped, so any script on the page can read the session",
     COOKIE_SRC,
     "  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "  `${SESSION_COOKIE}=${value}; Path=/; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     [COOKIE]),
    ("07-K3 SameSite is relaxed to Lax, which is what carries CSRF protection without TLS",
     COOKIE_SRC, "SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;", [COOKIE]),
    ("07-K4 Secure is added, so the cookie is never sent over §5's plain HTTP",
     COOKIE_SRC, "; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;",
     "; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;", [COOKIE]),
    ("07-K5 the clearing cookie loses Path, so the browser deletes a different cookie",
     COOKIE_SRC,
     "  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;",
     "  `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Max-Age=0`;",
     [COOKIE]),
    ("07-K6 the reader splits on every = and percent-decodes — a lone % is then a URIError",
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
    ("07-K7 thirty days becomes seven",
     COOKIE_SRC, "export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;",
     "export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;", [COOKIE]),
    # ⚠ Q1 back-port (2026-09-07): the corrected scanner exposed two ⚠ marks this line backs
    # at once — `cookie.test.ts`'s own "answers null … never throws" AND
    # `session.test.ts`'s "no session is found on the request", since `verifiedSessionOf`
    # calls `readCookie` with whatever `headers.get('cookie')` returns, including `null`.
    ("Q1-K8 the type/empty guard is dropped, so a null or undefined header throws",
     COOKIE_SRC, "  if (typeof header !== 'string' || header === '') return null;\n", "",
     [COOKIE, SESSION]),

    # ============================================================ §5 — the token
    ("07-E1 the signature is not verified, so any payload at all is a session",
     SESSION_SRC,
     "    if (!timingSafeEqual(given, sign(secret, payload))) return null;\n", "",
     [SESSION, AUTHZ, PROXY]),
    ("07-E2 the outer catch is removed — a signed non-JSON payload becomes a 500",
     SESSION_SRC,
     "  } catch {\n"
     "    // ⚠ §5: any error raised while deciding is a denial. Nothing here is expected to throw —\n"
     "    // every step above is guarded — and this is the second lock, not the first.\n"
     "    return null;\n  }",
     "  } finally {\n    /* nothing */\n  }",
     [SESSION]),
    ("07-E3 the expiry boundary is inclusive, so a token is live for one tick past its exp",
     SESSION_SRC, "    return session.exp > nowMs ? session : null;",
     "    return session.exp >= nowMs ? session : null;", [SESSION]),
    ("07-E4 expiry is not enforced server-side at all — a 30-day cookie becomes forever",
     SESSION_SRC, "    return session.exp > nowMs ? session : null;", "    return session;",
     [SESSION, AUTHZ, PROXY]),
    ("07-E5 the session id is derived from the clock, so two logins can share a revocation",
     SESSION_SRC,
     "    sid: randomBytes(SESSION_ID_BYTES).toString('base64url'),",
     "    sid: Buffer.from(String(nowMs), 'utf8').toString('base64url'),",
     [SESSION]),
    ("07-E6 the payload version is not checked, so a future token shape is read as this one",
     SESSION_SRC, "  if (candidate['v'] !== SESSION_VERSION) return null;\n", "", [SESSION]),
    ("07-E9 the signature is decoded leniently again, so 1 tag in 16 has four accepted spellings",
     SESSION_SRC,
     "    const given = decodeExact(signature, SIGNATURE_BYTES);\n    if (given === null) return null;",
     "    const given = Buffer.from(signature, 'base64url');\n"
     "    if (given.length !== SIGNATURE_BYTES) return null;",
     [SESSION]),
    ("07-E8 the wrong cookie is read, so a session is never found",
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
    ("07-C10 the server tidies STANDING, so a malformed id never reaches the operator",
     CONFIG_SRC,
     "  return raw.split(STANDING_SEPARATOR);",
     "  return raw.split(STANDING_SEPARATOR).map((e) => e.trim()).filter((e) => e !== '');",
     [CONFIG]),
    ("07-C11 an unset STANDING sends one empty id rather than an empty list",
     CONFIG_SRC,
     "  if (raw === undefined || raw === '') return [];",
     "  if (raw === undefined) return [];",
     [CONFIG]),
    ("07-C12 STANDING is split on the wrong separator, so a two-entry list becomes one unknown id",
     CONFIG_SRC,
     "export const STANDING_SEPARATOR = ',';",
     "export const STANDING_SEPARATOR = ';';",
     [CONFIG]),
    ("07-F1 any secret at all is accepted, so a hand-written one makes the cookie forgeable",
     CONFIG_SRC, "export const MIN_SESSION_SECRET_CHARS = 32;",
     "export const MIN_SESSION_SECRET_CHARS = 0;", [CONFIG]),
    ("07-F2 an empty PASSWORD_HASH is a config, so an unconfigured server is loggable-into",
     CONFIG_SRC, "  if (passwordHash === '') return null;\n", "", [CONFIG, LOGIN]),
    ("07-F4 an env key is renamed, so `dashboard.sh` and the verifier stop reading the same file",
     CONFIG_SRC, "export const PASSWORD_HASH_KEY = 'PASSWORD_HASH';",
     "export const PASSWORD_HASH_KEY = 'DASHBOARD_PASSWORD_HASH';", [CONFIG]),
    ("07-F3 the values are not trimmed, so a trailing newline in the env file breaks login",
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
    ("07-L1 the fifth attempt is refused — off by one against §5's five per minute",
     LIMIT_SRC, "      if (attempts.length > maxAttempts) {",
     "      if (attempts.length >= maxAttempts) {", [LIMIT, LOGIN]),
    ("07-L2 the lockout keeps the attempts that caused it, so release relocks immediately",
     LIMIT_SRC, "        attempts = [];\n", "", [LIMIT]),
    ("07-L3 a refused attempt is recorded, so a retrying tab extends the lockout for ever",
     LIMIT_SRC,
     "      if (lockedUntilMs > nowMs) {\n"
     "        return { allowed: false, retryAfterSeconds: retryAfterSeconds(lockedUntilMs - nowMs) };\n"
     "      }",
     "      if (lockedUntilMs > nowMs) {\n"
     "        lockedUntilMs = nowMs + lockoutMs;\n"
     "        return { allowed: false, retryAfterSeconds: retryAfterSeconds(lockedUntilMs - nowMs) };\n"
     "      }",
     [LIMIT]),
    ("07-L4 the lockout boundary is inclusive, so it lasts one tick longer than §5.2 says",
     LIMIT_SRC, "      if (lockedUntilMs > nowMs) {",
     "      if (lockedUntilMs >= nowMs) {", [LIMIT]),
    ("07-L5 Retry-After is floored, so the last second of a lockout is advertised as 0",
     LIMIT_SRC,
     "const retryAfterSeconds = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / 1000));",
     "const retryAfterSeconds = (remainingMs: number): number => Math.floor(remainingMs / 1000);",
     [LIMIT]),
    # ⚠ The state is hoisted to module scope, so every limiter in the process shares one
    # bucket. Behaviour-identical for the single production instance and wrong for a test —
    # and it is the shape that would hide the *opposite* failure step 11 owns: a second module
    # instance makes §5's global limit N× looser, silently.
    ("07-L6 the bucket is module-level, so two limiters are one and a test cannot see the limit",
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
    ("07-L7 the window filter is inverted, so only stale attempts are kept and nothing locks",
     LIMIT_SRC, "      attempts = attempts.filter((at) => at > since);",
     "      attempts = attempts.filter((at) => at < since);", [LIMIT, LOGIN]),
    ("07-L8 clearing forgets the attempts but not the lockout, so a correct password still waits",
     LIMIT_SRC,
     "    clear(): void {\n      attempts = [];\n      lockedUntilMs = 0;\n    },",
     "    clear(): void {\n      attempts = [];\n    },",
     [LIMIT]),
    ("07-L10 the lockout is five seconds rather than §5.2's sixty",
     LIMIT_SRC, "export const LOCKOUT_MS = 60_000;", "export const LOCKOUT_MS = 5_000;",
     [LIMIT, LOGIN]),

    # ============================================================ DELETE's revocation
    ("07-V1 a revocation ignores its own expiry, so the map grows without bound",
     REVOKE_SRC,
     "      if (expMs <= nowMs) {\n"
     "        // The cookie is past its own expiry, so `verifySessionToken` has already refused it\n"
     "        // and the entry is dead weight.\n"
     "        until.delete(sid);\n"
     "        return false;\n      }\n",
     "",
     [REVOKE]),
    ("07-V2 revoke records nothing, so DELETE is cosmetic and the token replays",
     REVOKE_SRC, "      until.set(sid, expMs);\n", "", [REVOKE, AUTHZ, LOGIN]),
    ("07-V3 the sweep reads its own wall clock instead of the caller's",
     REVOKE_SRC, "      if (until.size > SWEEP_AT) sweep(nowMs);",
     "      if (until.size > SWEEP_AT) sweep(Date.now());", [REVOKE]),

    # =========================================================== the session verdict
    ("07-A1 the verdict skips revocation, so a logged-out cookie still reads telemetry",
     AUTHZ_SRC,
     "  return deps.revocations.isRevoked(session.sid, nowMs) ? null : session;",
     "  return session;",
     [AUTHZ, LOGIN]),
    ("07-A2 an unconfigured server mints a session of its own — the placeholder made permissive",
     AUTHZ_SRC,
     "  const config = readAuthConfig(deps.env);\n  if (config === null) return null;\n\n"
     "  const nowMs = deps.nowMs();",
     "  const nowMs = deps.nowMs();\n  const config = readAuthConfig(deps.env);\n"
     "  if (config === null) return { v: 1, sid: 'unconfigured', iat: nowMs, exp: nowMs + 60_000 };\n",
     [AUTHZ]),
    ("07-A3 verifySession is permissive — HANDOVER §6 item 1, arriving through step 7",
     AUTHZ_SRC, "    return liveSessionOf(request, deps) !== null;", "    return true;",
     [AUTHZ, LOGIN]),
    ("07-A4 the deny-on-error catch is removed, so a broken dependency is a 500",
     AUTHZ_SRC,
     "  } catch {\n"
     "    // ⚠ Unreachable by construction, and kept anyway — §5 makes every failure to reach a\n"
     "    // verdict a denial, and this is the layer that owns that promise for its own callers.\n"
     "    return false;\n  }",
     "  } finally {\n    /* nothing */\n  }",
     [AUTHZ]),

    # ============================================== POST / DELETE /api/session (§5)
    ("07-P1 the rate limit is checked AFTER the KDF — five answers a minute, unlimited work",
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
    ("07-P2 the 429 carries no Retry-After, so §5.2's countdown has nothing to render",
     LOGIN_SRC,
     "        'retry-after': String(verdict.retryAfterSeconds),\n", "", [LOGIN]),
    ("07-P3 success answers 200, so §5.2's \"302 to /\" never happens",
     LOGIN_SRC, "    status: 302,\n    headers: {\n      location: '/',",
     "    status: 200,\n    headers: {\n      location: '/',", [LOGIN]),
    ("07-P4 a successful login leaves the attempts standing, one typo short of a lockout",
     LOGIN_SRC, "  deps.limiter.clear();\n", "", [LOGIN]),
    ("07-P5 DELETE forgets to revoke, so the token is replayable after logout",
     LOGIN_SRC,
     "    if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());",
     "    void session;",
     [LOGIN]),
    ("07-P6 DELETE refuses when the cookie is unreadable — the client that most needs it cleared",
     LOGIN_SRC,
     "    const session = liveSessionOf(request, authorizeDepsOf(deps));\n"
     "    if (session !== null) deps.revocations.revoke(session.sid, session.exp, deps.nowMs());\n",
     "    const session = liveSessionOf(request, authorizeDepsOf(deps));\n"
     "    if (session === null) return new Response(null, { status: 401 });\n"
     "    deps.revocations.revoke(session.sid, session.exp, deps.nowMs());\n",
     [LOGIN]),
    ("07-P7 a throwing verifier propagates — §5's 401 becomes §6.7's failed-poll path",
     LOGIN_SRC,
     "  let ok = false;\n  try {\n    ok = await deps.verify(password, config.passwordHash);\n"
     "  } catch {\n"
     "    // ⚠ Fail closed. `verifyPassword` is total, but the seam is injectable and §5's rule —\n"
     "    // any error while deciding is a denial — is the one that must hold at the boundary.\n"
     "    ok = false;\n  }",
     "  const ok = await deps.verify(password, config.passwordHash);",
     [LOGIN]),
    ("07-P8 a malformed body answers 400, a sixth state §5.2's screen has no copy for",
     LOGIN_SRC,
     "  const password = await passwordFrom(request);\n  if (password === null) return refused();",
     "  const password = await passwordFrom(request);\n"
     "  if (password === null) return new Response(null, { status: 400 });",
     [LOGIN]),
    ("07-P9 the body cap is gone, so an attempt can make this process hold a megabyte",
     LOGIN_SRC,
     "    if (bytes === 0 || bytes > MAX_BODY_BYTES) return null;",
     "    if (bytes === 0) return null;",
     [LOGIN]),
    ("07-P10 a missing PASSWORD_HASH is verified against the empty string rather than refused",
     LOGIN_SRC,
     "  const config = readAuthConfig(deps.env);\n  if (config === null) return refused();",
     "  const config = readAuthConfig(deps.env) ?? { passwordHash: '', sessionSecret: '' };",
     [LOGIN]),
    ("07-P13 the limiter is handed the wall clock, so an NTP step ends or extends a lockout",
     LOGIN_SRC, "  monotonicMs: () => performance.now(),", "  monotonicMs: () => Date.now(),",
     [LOGIN]),
    ("07-P14 an unconfigured server logs everyone in — the \"make it work locally\" edit",
     LOGIN_SRC,
     "  const config = readAuthConfig(deps.env);\n  if (config === null) return refused();",
     "  const config = readAuthConfig(deps.env);\n  if (config === null) {\n"
     "    return new Response(null, {\n"
     "      status: 302,\n"
     "      headers: { location: '/', 'cache-control': NO_STORE },\n"
     "    });\n  }",
     [LOGIN, ROUTE]),
    ("07-P11 the 302 arrives without the cookie it exists to set",
     LOGIN_SRC, "      'set-cookie': sessionCookieHeader(token),\n", "", [LOGIN]),
    ("07-P12 the declared content-length is ignored, so an oversized body is read anyway",
     LOGIN_SRC,
     "    const declared = Number(request.headers.get('content-length') ?? '0');\n"
     "    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;\n\n", "",
     [LOGIN]),

    # ------------------------------- §5's Content-Type requirement, and the two open seams
    ("07-P15 any Content-Type is accepted, so any page the operator visits can spend the budget",
     LOGIN_SRC,
     "const isJson = (request: Request): boolean => {\n"
     "  const header = request.headers.get('content-type');\n"
     "  if (header === null) return false;\n"
     "  return (header.split(';')[0] ?? '').trim().toLowerCase() === REQUIRED_CONTENT_TYPE;\n"
     "};",
     "const isJson = (request: Request): boolean => {\n  void request;\n  return true;\n};",
     [LOGIN]),
    ("07-P16 Content-Type is checked AFTER the limiter, so a CORS simple request spends the budget",
     LOGIN_SRC,
     [("  // 1. §5's request grammar, before any budget is spent on this caller.\n"
       "  if (!isJson(request)) return refused();\n\n",
       ""),
      ("  const password = await passwordFrom(request);\n",
       "  if (!isJson(request)) return refused();\n\n"
       "  const password = await passwordFrom(request);\n")],
     [LOGIN]),
    ("07-P17 the limiter call is unwrapped, so a throwing limiter is a 500 §5 forbids",
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
    ("07-P18 DELETE's verdict is unwrapped, so a throwing store is a 500 instead of a logout",
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
    ("07-P19 a limiter is built per request, so §5's five per minute counts nothing at all",
     LOGIN_SRC,
     [("import { productionRateLimiter } from './rate-limit';",
       "import { createRateLimiter, productionRateLimiter } from './rate-limit';"),
      ("    verdict = deps.limiter.attempt(deps.monotonicMs());",
       "    verdict = createRateLimiter().attempt(deps.monotonicMs());")],
     [LOGIN]),
    ("07-P20 the body cap counts UTF-16 code units again, so multi-byte bodies are twice the cap",
     LOGIN_SRC,
     "    const bytes = Buffer.byteLength(text, 'utf8');",
     "    const bytes = text.length;",
     [LOGIN]),
    ("07-P21 Content-Type is compared whole, so \"application/json; charset=utf-8\" cannot log in",
     LOGIN_SRC,
     "  return (header.split(';')[0] ?? '').trim().toLowerCase() === REQUIRED_CONTENT_TYPE;",
     "  return header === REQUIRED_CONTENT_TYPE;",
     [LOGIN]),

    # ============================================================ §5 — the gate
    ("07-X1 an unauthenticated /api/* is redirected, so a poll parses HTML as a snapshot",
     PROXY_SRC, "  return isApi ? refuse() : toLogin(request, hadCookie);",
     "  return toLogin(request, hadCookie);", [PROXY]),
    ("07-X2 every redirect claims the session expired, including a first-ever visit",
     PROXY_SRC, "  if (hadCookie) target.searchParams.set(EXPIRED_PARAM, '1');",
     "  target.searchParams.set(EXPIRED_PARAM, '1');", [PROXY]),
    ("07-X3 the redirect keeps NextResponse's 307 default, so a POST is re-POSTed at /login",
     PROXY_SRC, "  return NextResponse.redirect(target, 302);",
     "  return NextResponse.redirect(target);", [PROXY]),
    ("07-X4 the matcher stops excluding Next's static assets, so the login page loses its CSS",
     PROXY_SRC, "  matcher: ['/((?!_next/static|_next/image|favicon\\\\.ico).*)'],",
     "  matcher: ['/:path*'],", [PROXY]),
    ("07-X5 the whole of /api is exempt rather than just /api/session",
     PROXY_SRC, "  if (pathname === LOGIN_PATH || pathname === SESSION_PATH) return NextResponse.next();",
     "  if (pathname === LOGIN_PATH || pathname.startsWith('/api')) return NextResponse.next();",
     [PROXY]),
    # ⚠ RE-AIMED 2026-09-11 (loop 11b): the gate reads the MOUNTED FILE, not `process.env`
    # — SPEC.md §5.1's `11-Q2`. The mutation is the same defect, at the same site.
    ("07-X6 an unconfigured server lets everything through instead of nothing",
     PROXY_SRC,
     "    const credentials = readAuthConfig(credentialEnvironment());\n    if (credentials !== null) {",
     "    const credentials = readAuthConfig(credentialEnvironment());\n"
     "    if (credentials === null) return NextResponse.next();\n    if (credentials !== null) {",
     [PROXY]),
    ("07-X8 the gate reaches for the revocation store Next's own docs say it cannot share",
     PROXY_SRC,
     "import { verifiedSessionOf } from '@/lib/auth/session';",
     "import { productionRevocations } from '@/lib/auth/revocations';\n"
     "import { verifiedSessionOf } from '@/lib/auth/session';\nvoid productionRevocations;",
     [PROXY]),
    ("07-X9 the gate spells the two paths itself, so step 8 inherits a second definition",
     PROXY_SRC,
     "import { EXPIRED_PARAM, LOGIN_PATH, SESSION_PATH } from '@/lib/auth/login-view';",
     "import { EXPIRED_PARAM } from '@/lib/auth/login-view';\n\n"
     "const LOGIN_PATH = '/login';\nconst SESSION_PATH = '/api/session';",
     [VIEW]),
    ("07-X7 /login is gated too, so the login screen redirects to itself for ever",
     PROXY_SRC, "  if (pathname === LOGIN_PATH || pathname === SESSION_PATH) return NextResponse.next();",
     "  if (pathname === SESSION_PATH) return NextResponse.next();", [PROXY]),

    # ======================================================== §5.2 — the screen's copy
    ("07-W1 the wrong-password copy is reworded",
     VIEW_SRC, "export const WRONG_PASSWORD_MESSAGE = 'Password not recognised.';",
     "export const WRONG_PASSWORD_MESSAGE = 'Incorrect password. Please try again.';",
     [VIEW, FORM]),
    ("07-W2 the countdown copy is reworded, so \"Try again in Ns.\" stops being §5.2's sentence",
     VIEW_SRC,
     "  `Too many attempts. Try again in ${secondsRemaining}s.`;",
     "  `Too many attempts. Try again in ${secondsRemaining} seconds.`;",
     [VIEW, FORM]),
    ("07-W3 the expired copy loses §5.2's em dash",
     VIEW_SRC, "export const SESSION_EXPIRED_MESSAGE = 'Session expired — sign in again.';",
     "export const SESSION_EXPIRED_MESSAGE = 'Session expired - sign in again.';",
     [VIEW, FORM, PAGE]),
    ("07-W4 the field is disabled while submitting — §5.2 says it stays readable",
     VIEW_SRC,
     "    case 'submitting':\n      return { message: null, submitDisabled: true, fieldDisabled: false };",
     "    case 'submitting':\n      return { message: null, submitDisabled: true, fieldDisabled: true };",
     [VIEW, FORM]),
    ("07-W5 submit stays disabled after a wrong password, so one typo ends the session attempt",
     VIEW_SRC,
     "        message: { text: WRONG_PASSWORD_MESSAGE, tone: 'crit' },\n        submitDisabled: false,",
     "        message: { text: WRONG_PASSWORD_MESSAGE, tone: 'crit' },\n        submitDisabled: true,",
     [VIEW, FORM]),
    ("07-W6 submit is left enabled while rate-limited, so the client keeps hitting a 429",
     VIEW_SRC,
     "        message: { text: rateLimitedMessage(state.secondsRemaining), tone: 'warn' },\n"
     "        submitDisabled: true,",
     "        message: { text: rateLimitedMessage(state.secondsRemaining), tone: 'warn' },\n"
     "        submitDisabled: false,",
     [VIEW, FORM]),
    ("07-W7 Retry-After is parsed with Number(), so \"1.5\" becomes one and a half seconds",
     VIEW_SRC,
     "  const trimmed = header.trim();\n"
     "  if (!/^(?:0|[1-9][0-9]*)$/.test(trimmed)) return null;\n"
     "  const seconds = Number(trimmed);\n"
     "  return Number.isFinite(seconds) ? seconds : null;",
     "  const seconds = Number(header.trim());\n"
     "  return Number.isFinite(seconds) ? seconds : null;",
     [VIEW]),
    # ⚠ Q1 back-port (2026-09-07): the corrected scanner exposed this ⚠ as unbacked — W7
    # covers the SECOND `test.each` (rejecting non-delta-seconds forms) but nothing touched
    # the FIRST (whole-seconds parsing), whose one boundary case a real header proxy actually
    # produces is leading/trailing whitespace.
    ("Q1-W19 the header is validated unwrapped, so a proxy's padding is rejected as malformed",
     VIEW_SRC, "  const trimmed = header.trim();\n", "  const trimmed = header;\n", [VIEW]),
    ("07-W9 the submit button is relabelled, so §5.2's \"Unlock\" stops being what it says",
     VIEW_SRC, "export const LOGIN_SUBMIT_LABEL = 'Unlock';",
     "export const LOGIN_SUBMIT_LABEL = 'Sign in';", [VIEW, FORM]),
    ("07-W10 the plain-HTTP disclosure is softened, so §5's stated choice stops being stated",
     VIEW_SRC,
     "  'Plain HTTP on the LAN — this password crosses the wire in the clear.';",
     "  'This connection is not encrypted.';", [VIEW, FORM, PAGE]),
    ("07-W11 submit is disabled at rest, so the idle screen offers no way in",
     VIEW_SRC,
     "    case 'idle':\n      return { message: null, submitDisabled: false, fieldDisabled: false };",
     "    case 'idle':\n      return { message: null, submitDisabled: true, fieldDisabled: false };",
     [VIEW, FORM]),
    ("07-W12 §5.2's sixth row says the same thing as its third — a dead server \"is\" a wrong password",
     VIEW_SRC, "export const UNREACHABLE_MESSAGE = 'Could not reach the dashboard.';",
     "export const UNREACHABLE_MESSAGE = 'Password not recognised.';", [VIEW, FORM]),
    ("07-W13 every unexpected status is a wrong password again — the defect §5.2's sixth row names",
     VIEW_SRC,
     "  return { kind: 'unreachable' };\n};",
     "  return { kind: 'wrong' };\n};",
     [VIEW]),
    ("07-W14 a network failure is a wrong password, so a stopped container blames the operator",
     VIEW_SRC,
     "  if (response === null) return { kind: 'unreachable' };",
     "  if (response === null) return { kind: 'wrong' };",
     [VIEW]),
    ("07-W15 the opaque-redirect spelling of success is dropped, so a browser login never lands",
     VIEW_SRC,
     "  if (response.type === 'opaqueredirect' || response.status === 302 || response.ok) return null;",
     "  if (response.status === 302 || response.ok) return null;",
     [VIEW]),
    ("07-W16 a 401 stops meaning \"not recognised\", so a wrong password reads as an outage",
     VIEW_SRC, "  if (response.status === 401) return { kind: 'wrong' };\n\n", "", [VIEW]),
    ("07-W17 the countdown becomes a constant this file invented — §5.2 forbids exactly that",
     VIEW_SRC,
     "    return { kind: 'rate-limited', secondsRemaining: retryAfterSeconds(response.retryAfter) ?? 0 };",
     "    return { kind: 'rate-limited', secondsRemaining: 60 };",
     [VIEW]),
    ("07-W18 the client-safe module grows an import, dragging node:crypto toward the browser",
     VIEW_SRC,
     "/** §5.2's route — the only *page* reachable unauthenticated. */",
     "import { SESSION_COOKIE } from './cookie';\n\nvoid SESSION_COOKIE;\n\n"
     "/** §5.2's route — the only *page* reachable unauthenticated. */",
     [VIEW]),
    ("07-W8 the address beneath the wordmark is wrong",
     VIEW_SRC, "export const LOGIN_ADDRESS = '192.168.4.71:8090';",
     "export const LOGIN_ADDRESS = '192.168.4.31:3000';", [VIEW, FORM]),

    # ======================================================= §5.2 — the screen itself
    ("07-C1 the field is disabled from the submit state, so it greys while a login is in flight",
     FORM_SRC, "        disabled={view.fieldDisabled}", "        disabled={view.submitDisabled}",
     [FORM]),
    ("07-C2 the field is cleared once there is a message — §5.2 forbids exactly this",
     FORM_SRC, "        value={password}",
     "        value={view.message === null ? password : ''}", [FORM]),
    ("07-C3 autocomplete is turned off, so no password manager can fill the field",
     FORM_SRC, '        autoComplete="current-password"', '        autoComplete="off"', [FORM]),
    ("07-C4 the field is no longer autofocused",
     FORM_SRC, "        autoFocus\n", "", [FORM]),
    ("07-C5 the plain-HTTP disclosure is dropped from the screen",
     FORM_SRC,
     "      <p className=\"login__disc\">\n        <i>▲</i>\n        {PLAIN_HTTP_DISCLOSURE}\n      </p>\n",
     "", [FORM, PAGE]),
    ("07-C6 the expired prop is ignored, so a 401 hand-off shows the idle screen",
     FORM_SRC, "useState<LoginState>(expired ? { kind: 'expired' } : { kind: 'idle' })",
     "useState<LoginState>({ kind: 'idle' })", [FORM]),
    ("07-C8 the screen always opens expired, so a first-ever visit is told its session ran out",
     FORM_SRC, "useState<LoginState>(expired ? { kind: 'expired' } : { kind: 'idle' })",
     "useState<LoginState>({ kind: 'expired' })", [FORM, PAGE]),
    ("07-C7 a remember-me checkbox appears — §5.2's \"Absent\" row, added while tidying",
     FORM_SRC,
     "      <button className=\"login__go\" type=\"submit\" disabled={view.submitDisabled}>",
     "      <label>\n        <input type=\"checkbox\" name=\"remember\" /> Remember me\n      </label>\n"
     "      <button className=\"login__go\" type=\"submit\" disabled={view.submitDisabled}>",
     [FORM]),

    # ============================================================= /login, the route
    ("07-G3 ?expired must equal 1, so an empty value silently shows the idle screen",
     PAGE_SRC, "expired={params[EXPIRED_PARAM] !== undefined}",
     "expired={params[EXPIRED_PARAM] === '1'}", [PAGE]),
    ("07-G4 the stylesheet leaves the markup-safe subset — one renderer change from selecting nothing",
     PAGE_SRC, ".login__msg i { font-style: normal; }",
     ".login__msg > i { font-style: normal; }", [PAGE]),
    ("07-G5 /login is prerendered, so the one route that must always work is baked",
     PAGE_SRC, "export const dynamic = 'force-dynamic';",
     "export const dynamic = 'force-static';", [PAGE]),

    # ===================================================== the Next route file (§4)
    ("07-N1 POST is aliased to the handler, so Next's context lands where the deps go",
     ROUTE_SRC,
     "export const POST = (request: Request): Promise<Response> => handleSessionPost(request);",
     "export const POST = handleSessionPost;", [ROUTE]),
    ("07-N2 DELETE is aliased the same way",
     ROUTE_SRC,
     "export const DELETE = (request: Request): Response => handleSessionDelete(request);",
     "export const DELETE = handleSessionDelete;", [ROUTE]),
    ("07-N3 the session route loses force-dynamic",
     ROUTE_SRC, "export const dynamic = 'force-dynamic';", "export const dynamic = 'auto';",
     [ROUTE]),
    ("07-N4 a GET is added that reports whether a session is live — an oracle §5 does not want",
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
    ("07-G1 the rate limiter sweeps its map on an interval — §4 forbids background work",
     LIMIT_SRC,
     "export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {",
     "setInterval(() => {\n  /* sweep the buckets */\n}, 60_000).unref();\n\n"
     "export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimiter => {",
     GUARD),
    ("07-G2 the gate hand-rolls an unvalidated setTimeout, the fifth in this tree",
     PROXY_SRC,
     "const refuse = (): NextResponse =>",
     "const idle = setTimeout(() => undefined, Number(process.env['GATE_MS']));\nvoid idle;\n\n"
     "const refuse = (): NextResponse =>",
     GUARD),

    # ====================================================================== type-level
    # ⚠ Not written as a cast: `x as T` always type-checks, so a cast mutation can never fail
    # `tsc` and would be an inert entry. Widen or narrow the declaration instead.
    ("07-T1 LoginState's discriminant is widened to string, so the switch stops being exhaustive",
     VIEW_SRC,
     "export type LoginState =\n  | { readonly kind: 'idle' }",
     "export type LoginState =\n  | { readonly kind: string }\n  | { readonly kind: 'idle' }",
     "types"),
    ("07-T2 DELETE becomes async while the route still declares it synchronous",
     LOGIN_SRC,
     "export const handleSessionDelete = (\n  request: Request,\n"
     "  deps: SessionHandlerDeps = productionSessionDeps,\n): Response => {",
     "export const handleSessionDelete = async (\n  request: Request,\n"
     "  deps: SessionHandlerDeps = productionSessionDeps,\n): Promise<Response> => {",
     "types"),
    ("07-T3 the parsed hash's params lose their shape, so a cost field can go missing unnoticed",
     SCRYPT_SRC,
     "export interface ScryptHash {\n  readonly params: ScryptParams;",
     "export interface ScryptHash {\n  readonly params: Partial<ScryptParams>;",
     "types"),
    # ==================================================================================
    # ⚠⚠ LOOP 11b, 2026-09-11 — SPEC.md §5.1's ruling: the two secrets leave the
    #    environment and the server parses /etc/ai-dashboard.env itself.
    # ==================================================================================
    #
    # The reader is held to ONE rule — stricter than Docker's --env-file grammar, never
    # looser — and that claim has been falsified twice by measurement in this project
    # already. Every mutation below is a way of being LOOSER, of printing a value, of
    # reading the file more than once, or of putting the credentials back where
    # `docker inspect` can see them.

    ("11b-S1 a double-quoted secret is accepted, which is O21 exactly, one level up",
     SECRETFILE_SRC,
     "  if (value.includes('\"')) {\n    return 'contains a double quote. --env-file does not strip quotes: the value would include it';\n  }\n",
     "",
     [SECRETFILE]),
    ("11b-S2 a $ is accepted, and a shell that ever sourced the file expands it away",
     SECRETFILE_SRC,
     "  if (value.includes('$')) {\n    return 'contains a $, which a shell that ever sourced this file would expand';\n  }\n",
     "",
     [SECRETFILE]),
    ("11b-S3 the printable-ASCII range is dropped, so a non-breaking space inside a secret passes",
     SECRETFILE_SRC,
     "    if (cp < 0x21 || cp > 0x7e) {",
     "    if (cp < 0x00) {",
     [SECRETFILE]),
    ("11b-S4 CRLF is tolerated because Docker tolerates it — the reader stops being stricter",
     SECRETFILE_SRC,
     "  if (text.includes('\\r')) {",
     "  if (false) {",
     [SECRETFILE]),
    ("11b-S5 the BOM is stripped the way Docker strips it, instead of refused",
     SECRETFILE_SRC,
     "  if (text.includes('\\ufeff')) {",
     "  if (false) {",
     [SECRETFILE]),
    ("11b-S6 a line with no '=' is skipped rather than refused, which is Docker's host-env rule",
     SECRETFILE_SRC,
     "    if (at < 0) {",
     "    if (false) {",
     [SECRETFILE]),
    ("11b-S7 a duplicate key silently takes the last, exactly as Docker does",
     SECRETFILE_SRC,
     "    if (seen !== undefined) {",
     "    if (false) {",
     [SECRETFILE]),
    ("11b-S8 invalid UTF-8 is decoded lossily, which makes this reader LOOSER than Docker",
     SECRETFILE_SRC,
     "    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);",
     "    return new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(bytes);",
     [SECRETFILE]),
    ("11b-S9 the bare-line refusal prints the line, and a wrapped SESSION_SECRET line IS the secret",
     SECRETFILE_SRC,
     "      refuse('', lineNumber, `has no '=' (${line.length} characters, not printed): Docker reads `",
     "      refuse('', lineNumber, `has no '=' (${line}): Docker reads `",
     [SECRETFILE]),
    ("11b-S10 the report drops the line that says values are never printed",
     SECRETFILE_SRC,
     "    '  (values are never printed; fix the file and `sudo ./dashboard.sh check`)',\n",
     "",
     [SECRETFILE]),
    ("11b-S11 the file is re-read on every call, so a rewrite mid-flight changes the answer",
     SECRETFILE_SRC,
     "    if (memo !== null) return { state: memo, fresh: false };",
     "    if (memo !== null) memo = null;",
     [SECRETFILE]),
    # ⚠⚠ 11b-A3's family. `require()` was DELETED on 2026-09-11 (it had zero production
    # callers), so the mutation that used to attack its throw is gone with it; what replaces it
    # is the property the deletion was part of — **the request path never degrades in
    # SILENCE** — plus the cell that makes three bundled copies of `secrets.ts` share one read.
    ("11b-S13 an unreadable file throws at REQUEST time, turning §5's 401 into a 500",
     SECRETFILE_SRC,
     "      if (fresh) onDegraded(refusalReport(path, state.refusals, degradedHeadline(path)));\n"
     "      return frozenEmpty;",
     "      if (fresh) onDegraded(refusalReport(path, state.refusals, degradedHeadline(path)));\n"
     "      throw new Error(refusalReport(path, state.refusals));",
     [SECRETFILE, SECRETS]),
    ("11b-N1 the degraded report fires only when it did NOT do the read, so the first request denies in silence",
     SECRETFILE_SRC,
     "      if (fresh) onDegraded(",
     "      if (!fresh) onDegraded(",
     [SECRETFILE, SECRETS]),
    ("11b-N2 the request path borrows REFUSING TO START, announcing a refusal on a server that then serves",
     SECRETFILE_SRC,
     "      if (fresh) onDegraded(refusalReport(path, state.refusals, degradedHeadline(path)));",
     "      if (fresh) onDegraded(refusalReport(path, state.refusals, refusalHeadline(path)));",
     [SECRETFILE, SECRETS]),
    ("11b-N3 the STARTUP entrance reports too, printing one refusal twice on the path that is already loud",
     SECRETFILE_SRC,
     "    refusal: (): string | null =>\n"
     "      load().state.env === null ? refusalReport(path, (memo as SecretState).refusals) : null,",
     "    refusal: (): string | null => {\n"
     "      const { state, fresh } = load();\n"
     "      if (state.env === null && fresh) onDegraded(refusalReport(path, state.refusals, degradedHeadline(path)));\n"
     "      return state.env === null ? refusalReport(path, state.refusals) : null;\n"
     "    },",
     [SECRETFILE]),
    ("11b-N7 the degraded report is written before the verdict, so a GOOD file logs a refusal too",
     SECRETFILE_SRC,
     "      const { state, fresh } = load();\n      if (state.env !== null) return state.env;",
     "      const { state, fresh } = load();\n"
     "      if (fresh) onDegraded(refusalReport(path, state.refusals, degradedHeadline(path)));\n"
     "      if (state.env !== null) return state.env;",
     [SECRETFILE, SECRETS]),
    ("11b-N4 the credential cell goes back to a module-level binding, and three bundles get three memos",
     SECRETS_SRC,
     "  const holder = globalThis as CellHolder;",
     "  const holder = {} as CellHolder;",
     [SECRETS]),
    ("11b-N5 the reader opens the path without asking whether it is a regular file — a FIFO blocks register() for ever",
     SECRETS_SRC,
     "  if (!stat.isFile()) {",
     "  if (stat.isFile() && false) {",
     [SECRETS]),
    ("11b-S14 every key in the file crosses the seam, so STANDING arrives from two sources at once",
     SECRETFILE_SRC,
     "  for (const key of SECRET_KEYS) {",
     "  for (const key of [...SECRET_KEYS, ...values.keys()]) {",
     [SECRETFILE]),
    ("11b-S15 the SESSION_SECRET floor is dropped, and a short secret makes the cookie forgeable",
     SECRETFILE_SRC,
     "    if (key === SESSION_SECRET_KEY && found.value.length < MIN_SESSION_SECRET_CHARS) {",
     "    if (false) {",
     [SECRETFILE]),

    ("11b-T1 a refused credentials file only warns in production, so the container starts denying every login",
     STARTUP_SRC,
     "  return env.nodeEnv === 'production' ? 'exit' : 'warn';",
     "  return 'warn';",
     [STARTUP]),
    ("11b-T2 next build reads the credentials file, and an exit(1) there fails the Docker build itself",
     STARTUP_SRC,
     "  if (env.nextPhase === BUILD_PHASE) return 'skip';",
     "  if (false) return 'skip';",
     [STARTUP]),
    ("11b-T3 the refusal is printed on every startup, including the healthy one §5 requires to be silent",
     STARTUP_SRC,
     "  if (action === 'exit' || action === 'warn') {",
     "  if (true) {",
     [STARTUP]),
    ("11b-T5 the warn arm stops saying it IS a warning, and a laptop reads REFUSING TO START on a server that then serves requests",
     STARTUP_SRC,
     "      action === 'warn'",
     "      false",
     [STARTUP]),
    ("11b-S16 the 64 KiB line bound goes, and this reader takes a file docker run --env-file refuses outright",
     SECRETFILE_SRC,
     "      if (i - lineStart >= MAX_LINE_BYTES) {",
     "      if (false) {",
     [SECRETFILE]),
    ("11b-T4 instrumentation.ts loses its runtime guard, and the edge bundle gets node:fs",
     "instrumentation.ts",
     "  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;",
     "  if (false) return;",
     [STARTUP]),

    ("11b-W1 the gate's deps go back to process.env, where docker inspect shows both secrets",
     AUTHZ_SRC,
     "  get env(): Environment {\n    return credentialEnvironment();\n  },",
     "  env: process.env,",
     [AUTHZ]),
    ("11b-W2 the login handler's deps go back to process.env",
     LOGIN_SRC,
     "  get env(): Environment {\n    return credentialEnvironment();\n  },",
     "  env: process.env,",
     [LOGIN]),
    ("11b-W3 the proxy reads process.env directly, and the mount becomes decoration",
     PROXY_SRC,
     "    const credentials = readAuthConfig(credentialEnvironment());",
     "    const credentials = readAuthConfig(process.env);",
     [PROXY]),
    ("11b-W4 credentialEnvironment IS process.env, so every root above it is wired to nothing",
     SECRETS_SRC,
     "export const credentialEnvironment = (): Environment => productionSecrets.environment();",
     "export const credentialEnvironment = (): Environment => process.env;",
     [PROXY, AUTHZ, LOGIN]),
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
    ("07-Y1 the python producer drops a cost parameter, so the hash is weaker and still verifies",
     "scripts/hash-password.py", "LOG_N = 15", "LOG_N = 14", [PYHASH]),
    ("07-Y2 the salt shrinks, so every hash is cheaper to attack and nothing rejects it",
     "scripts/hash-password.py", "SALT_BYTES = 16", "SALT_BYTES = 8", [PYHASH]),
    # ⚠ Node's `Buffer.toString('base64url')` is UNPADDED. Keeping the `=` is the single most
    # likely divergence, and it fails at the parser — a clean, empty, unlogged 401.
    ("07-Y3 base64url keeps its padding, and every login is refused with nothing logged",
     "scripts/hash-password.py",
     'return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")',
     'return base64.urlsafe_b64encode(raw).decode("ascii")', [PYHASH]),
    ("07-Y4 standard base64 instead of the URL alphabet — `+` and `/` are outside the alphabet",
     "scripts/hash-password.py",
     'return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")',
     'return base64.b64encode(raw).rstrip(b"=").decode("ascii")', [PYHASH]),
    ("07-Y5 the salt is reused across runs, so two identical passwords hash identically",
     "scripts/hash-password.py",
     "    print(hash_password(password, os.urandom(SALT_BYTES)))",
     "    print(hash_password(password, b'0123456789abcdef'))", [PYHASH]),
    # ⚠ §5.1's policy, both sides. It is enforced here and nowhere else: the server is handed a
    # hash and can never afterwards tell whether the policy was met.
    ("07-Y6 the length floor is dropped, so a two-character password is accepted",
     "scripts/hash-password.py", "MIN_LENGTH = 6", "MIN_LENGTH = 0", [PYHASH]),
    ("07-Y7 the letter rule is dropped, so an all-digit password passes",
     "scripts/hash-password.py",
     '    if not any(c.isalpha() for c in password):\n        return "at least one letter"\n',
     "", [PYHASH]),
    ("07-Y8 the digit rule is dropped, so an all-letter password passes",
     "scripts/hash-password.py",
     '    if not any(c.isdigit() for c in password):\n        return "at least one digit"\n',
     "", [PYHASH]),
    # ⚠ A rejected password must produce NO hash. Printing one anyway would write a credential
    # the operator was told was refused.
    ("07-Y9 a refused password still prints a hash, which the script then writes",
     "scripts/hash-password.py",
     '        print(f"password rejected: needs {failure}", file=sys.stderr)\n        return 2',
     '        print(f"password rejected: needs {failure}", file=sys.stderr)\n'
     '        print(hash_password(password, os.urandom(SALT_BYTES)))\n        return 2',
     [PYHASH]),
]


# ---------------------------------------------------------------------------
# ⚠ Mutation ids must be unique. Added 2026-09-07, after NINE duplicates were found
#    across three harnesses — every one of them pre-existing and invisible.
# ---------------------------------------------------------------------------
#
# HANDOVER §1 has warned about this since step 8 and the warning was never enforced, which is
# the whole lesson: a rule that is written down and not checked is a rule that has already been
# broken somewhere you have not looked. A duplicate is not a crash — it makes the
# `DID NOT BITE` and `ANCHORS MOVED` lists ambiguous about WHICH entry failed, so the one
# output that matters when something is wrong is the output that stops being readable.
def _assert_unique_ids() -> None:
    seen: dict[str, int] = {}
    for entry in REGRESSIONS:
        eid = entry[0].split()[0]
        seen[eid] = seen.get(eid, 0) + 1
    dupes = sorted(k for k, n in seen.items() if n > 1)
    if dupes:
        raise SystemExit(f"!!! duplicate mutation ids, which make the failure lists ambiguous: {', '.join(dupes)}")


_assert_unique_ids()


def main() -> int:
    os.chdir(ROOT)
    bad = []
    moved = []
    ambiguous = []
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
        # ⚠ Q1 reconciliation, 2026-09-07 (adversarial F6). An anchor that matches TWICE is a
        # third finding, and the most dangerous of the three because it does not look like one:
        # `str.replace(old, new, 1)` silently takes the FIRST site, so the mutation still
        # applies, a test still reddens, the ledger still goes green — and the property being
        # certified is no longer the one the mutation's name records. Reorder the two sites and
        # the mutation moves with no diff anywhere. Found on step 8's `U6`, whose name says
        # "both hidden-tab guards" while one of two identical guard sites was left standing.
        doubled = [(old, mutated.count(old)) for old, _ in pairs if mutated.count(old) > 1]
        if doubled:
            print(f"--- {name}\n    ANCHOR AMBIGUOUS in {src} — matches {doubled[0][1]}×; "
                  f"replace(…, 1) would take whichever comes first. Pin it to one site")
            ambiguous.append(name)
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
    if ambiguous:
        print("\nANCHORS AMBIGUOUS — pin these to one site, they did not run:", ", ".join(ambiguous))
    if moved:
        print("\nANCHORS MOVED — re-aim these, they did not run:", ", ".join(moved))
    if bad:
        print("\nDID NOT BITE:", ", ".join(bad))
    if moved or bad or ambiguous:
        return 1

    # ------------------------------------------------------------------ the ledger
    marked = marked_tests()
    if UNMATCHABLE:
        print(
            "\nUNMATCHABLE LEDGER KEYS — these ⚠ names cannot be matched against a FAIL line,\n"
            "so the ledger's verdict on them means nothing. Move the %-placeholder later:"
        )
        for rel, nm, prefix in UNMATCHABLE:
            print(f"  {rel}\n    {nm}\n    ledger key {prefix!r} ({len(prefix)} chars)")
        return 1
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
