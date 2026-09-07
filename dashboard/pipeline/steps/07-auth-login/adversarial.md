# Step 7 — adversarial findings

Phase: adversarial (the auth step; a defect here is a vulnerability, not a wrong number).
I edited no source. Every experiment was reverted; the only filesystem delta from this
phase is `tsconfig.tsbuildinfo` (a tsc-regenerated, git-ignored build cache) and my
scratchpad. Tracked/source files are byte-for-byte unchanged (md5 diff before/after: only
`tsconfig.tsbuildinfo`).

## Baseline re-run (under Node 24, per HANDOVER §1's nvm-first PATH)

```
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
node -v                       # v24.16.0
pnpm verify                   # Test Files 44 passed (44) · Tests 1603 passed (1603) · exit=0
```

All six regression harnesses re-run (464 mutations). Every one exited 0:

| harness | mutations | exit |
|---|---|---|
| 02-format-severity | 40 | 0 |
| 03-collectors-gpu-host | 64 | 0 |
| 04-collector-cooling | 76 + ledger | 0 |
| 05-collectors-serving-storage-safety | 127 + ledger | 0 |
| 06-telemetry-route | 59 + ledger | 0 |
| 07-auth-login | 98 + ledger | 0 |

The harnesses are sound. The suite's *green-ness*, however, is not reliable — see F1.

---

# Findings, ranked

## F1 — THE FLAKE IS A REAL FAILING TEST, and I identified it. `session.test.ts:121` reddens ~1 run in 16 (SEV: HIGH — trust-anchor)

**Confirmed by execution.** The flake the build reported ("`pnpm verify` exited 1 once,
output ended with the `Isolate 44 workers…` hint then `[ELIFECYCLE]`, no failing test named,
could not reproduce") is **not** a worker-spawn resource limit, **not** a reporter
interaction, and **not** related to `tsconfig.tsbuildinfo`. It is a genuinely failing test
that fires intermittently because its assertion depends on `randomBytes`:

`lib/auth/session.test.ts:121` — `⚠ flipping one character of the signature invalidates it`:

```js
const { token } = mintSession(SECRET, NOW);           // sid = randomBytes(16) → signature is random
const [payload = '', signature = ''] = token.split('.');
const flipped = `${payload}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
expect(verifySessionToken(flipped, SECRET, NOW)).toBeNull();
```

Root cause: a 32-byte HMAC is 43 base64url chars = 258 bits, so the **last character encodes
only 4 significant bits** (2 are unused padding). `verifySessionToken` decodes the signature
with `Buffer.from(sig,'base64url')` and compares the **bytes** — it does **not** re-encode and
compare the string the way `scrypt.ts`'s `decodeField` does (see F2). When the canonical
signature ends in `A` (value 0), flipping to `B` (value 1) produces a *non-canonical spelling
of the identical 32 bytes*, the signature still verifies, `verifySessionToken` returns the
session, and `toBeNull()` fails.

Measured failure rate (100 000 trials, real HMAC): **6 148 / 100 000 = 6.15 %**, and every
failing trial had a signature ending in `A` — i.e. exactly the 1-of-16 canonical last
characters. Reproduced live: **1 of 10** warm full-suite runs went to exit 1 on this test.

Why the human saw "no test named": the failure structure puts the named `FAIL` line ~30 lines
**above** the summary tail. The last six lines of a red run are:

```
   Duration  3.12s ...
    Isolate  44 workers spawned · ~72ms startup each ...
             at least ~279ms faster with isolate: false ...
[ELIFECYCLE] Test failed. See above for more details.
```

A tail capture (or scrollback where the `⎯ Failed Tests ⎯` block scrolled off) shows the
Isolate hint + ELIFECYCLE with the named test gone. The counts are honest
(`Tests 1 failed | 1602 passed (1603)`) — this is the *mirror* of step 1's "counters lie on a
failing run": here the counters tell the truth, but the human's capture truncated the one line
that named the culprit. The 9 subsequent clean runs the build reported are fully consistent
with a 6 % per-run rate (P(0 fails in 9) = 0.94⁹ ≈ 0.57).

**Why it matters beyond one test.** "Green means exit 0" is this pipeline's only trust anchor.
A test that false-reds 6 % of runs means every phase from here on has a ~1-in-16 chance of a
red run that is *not* its fault — inviting either "just re-run until green" (which would mask a
real regression the next time) or a wasted bisect. It should be fixed before step 8 inherits
it.

**Fix (for reconciliation/build — not applied here):** make the assertion deterministic and
correct. Flip a byte of the **decoded** signature buffer (`given[0] ^= 1`, re-encode) or flip a
**non-tail** character, or seed a fixed `sid`. The current test does not actually test what it
claims: 1/16 of the time it demonstrates the *opposite* (a mutated signature *string* being
accepted). Note the length-guard property the harness lists as "no mutation" is only
behaviour-preserving *because* the `try/catch` swallows the `RangeError`; that is correct, but
it is why this class of bug hides.

**What would catch it in future:** a lint/CI rule that runs the crypto tests N times, or making
any test that consumes `randomBytes` output deterministic. A single green run is not evidence a
`randomBytes`-derived assertion is sound.

## F2 — `verifySessionToken` accepts non-canonical signature spellings (SEV: LOW — benign for auth, but it is F1's root and a known-fixed defect left un-fixed here)

**Confirmed by execution, live against the built standalone server.** For a real session cookie,
three alternate last-characters of the signature (the ones sharing the same 4 significant bits)
all authenticate identically:

```
canonical (…U)  → 200
variant  (…V)   → 200      variant (…W) → 200      variant (…X) → 200
GET / with a variant → 200 (page gate accepts it too)
DELETE of the canonical then variant → 401 (revocation is by sid, so all spellings die together)
```

This is **not a forgery vector**: producing any of these still requires a valid signature, and
the variants are cryptographically the same token for the same `sid`; `DELETE`/revocation
covers all of them. But it is the *same defect class the build closed in `scrypt.ts` (S3)* —
`decodeField` there re-encodes and compares byte-for-byte to reject non-canonical base64url —
and `session.ts` deliberately does not (it compares decoded bytes). The consequence is cosmetic
(one logical cookie has up to 4 wire forms) *except* that it is exactly what makes F1's test
flaky. If a canonical-form check is wanted for defence-in-depth, it belongs on `signature`
before `Buffer.from`, mirroring `decodeField`.

## F3 — Login-function DoS via the documented XFF bypass + the serial KDF (SEV: MEDIUM; S21 is under-stated)

**Confirmed by execution, live.** S21 correctly notes an attacker who rotates
`X-Forwarded-For` is not rate-limited (I re-confirmed the `??=` reading in
`next/dist/server/base-server.js:612` for 16.3.4, and live: 8 attempts with 8 fresh forged XFFs
all returned 401 with no lockout, while 8 from one address locked at the 6th). The build frames
`exclusively()` (one scrypt at a time) as the mitigation for the resulting unlimited path. It
does bound **work** — during a flood telemetry stayed 1 ms and `/login` 3 ms, so the libuv pool
is protected as claimed — but it does **not** bound login **latency/availability** or queue
**depth**:

```
control: honest login              → 302 in 66 ms
flood 1500 forged-XFF attempts (attacker spends ~1.5 s, fire-and-forget)
  operator's own login             → 302 after 84.7 SECONDS   (queued behind 1500 scrypts)
  GET /api/telemetry meanwhile     → 401 in 1 ms
  GET /login meanwhile             → 200 in 3 ms
```

So the endpoint the operator needs is deniable for arbitrary duration at near-zero attacker
cost, and the FIFO scrypt queue grows unbounded (each pending job retains a closure + password
+ promise). S21 reads this as "a nuisance, not an escalation"; the accurate statement is
"login can be made unavailable, and the queue is an unbounded-memory sink," both reachable
unauthenticated. **Fix options:** cap the scrypt queue depth and shed with 503/429 when deep;
or add a global (not per-key) concurrent-hash budget that rejects rather than enqueues; or gate
`POST` behind a global attempt ceiling in addition to the per-source one. **This is the spec
gap S21 flags — §5/§2.5 would need either a proxy that overwrites XFF or a global admission
control; recording it, not fixing it (invariant 7).**

## F4 — Rate-limiter map grows unbounded and its sweep is O(n)-per-write (SEV: LOW–MEDIUM)

**Confirmed by execution.** `MAX_KEY_CHARS` caps key *width* but nothing caps key *count*, and
the key is the attacker-controlled XFF (S21). 50 000 distinct sources inside one window →
`size == 50 000`; the sweep deletes nothing because every attempt is still "live" within
`windowMs`. Worse, once `size > SWEEP_AT` every subsequent `attempt()` runs a full O(n) sweep
that frees nothing, so cost is quadratic in distinct sources:

```
 1000 keys →   8 µs/req      10000 keys →  43 µs/req      40000 keys → 166 µs/req (6.6 s of CPU)
40000 requests on ONE key → 1.5 ms total   (control: linear when keys don't accumulate)
```

In the live flood the KDF queue dominated so this was not the binding constraint, but on any
future build where hashing is cheaper or parallel it becomes one, and it is a second unbounded
allocation from unauthenticated input. `revocations.ts` has the same SWEEP_AT shape but is safe
(build is right: `revoke` needs a valid signature, so an attacker cannot grow it). **Fix:** cap
the key count (LRU eviction), or stop sweeping on every write past the threshold.

## F5 — `UNKNOWN_SOURCE` is a shared lockout bucket (SEV: LOW)

**Confirmed by execution.** An empty, whitespace, `,`, or leading-comma `X-Forwarded-For` maps
to the single `'unknown'` key. Live: an empty XFF returned 429 once the shared bucket was
locked by earlier empty-XFF attempts. So one client sending a blank XFF can lock out *every*
other client that also sends a blank/absent one — which, on this `--network host` deployment,
is anyone for whom Next could not fill a socket address. Minor relative to S21's targeted
lockout, but note it: the "unknown" bucket conflates unrelated clients.

## F6 — `handleSessionPost` (limiter) and `handleSessionDelete`/`liveSessionOf` are outside any try/catch (SEV: LOW — contract gap, not reachable with production deps)

**Confirmed by execution.**

```
POST with a throwing limiter          → ESCAPES handleSessionPost (would be 500)
DELETE with a throwing revocation      → escapes via liveSessionOf when a valid cookie is present
liveSessionOf(throwing dep)            → THROWS  (it is NOT total)
verifySession(throwing dep)            → false   (the telemetry GET path DOES wrap — correct)
```

`handler.ts`'s module doc says it fails closed and §5 states the rule absolutely ("any error
raised while deciding … is 401, never 500"). The telemetry path honours it (`verifySession`
catches; that is the path a 500 would misroute to §6.7). But `POST`'s `deps.limiter.attempt(...)`
(line 154) and `DELETE`'s `liveSessionOf(...)` (line 213) run raw. **Not reachable with the
production wiring** — `process.env` reads, the platform `headers.get('cookie')`, `Date.now`,
and the Map-based limiter/store do not throw — so this is defence-in-depth, not a live 500. But
two of the module's three entry points do not wrap the verdict the doc says they wrap. If the
build wants the invariant to be structural rather than "true because today's deps happen not to
throw," wrap both. (`session.ts`'s `verifySessionToken` and `authorize.ts`'s `verifySession`
are the only two that are genuinely total-by-catch.)

## F7 — the `LIMITS` "DoS guard" ceiling is ~1.7 s/hash, not ~60 ms (SEV: LOW — operator-only)

**Confirmed by execution.** The build's core claims hold: `crypto.scrypt` throws
*synchronously* on bad params (confirmed), the default `maxmem` is 32 MiB and `128·2^15·8` is
32 MiB *exactly* so the shipped params need the explicit 64 MiB ceiling (confirmed — refused
under default, accepted under `SCRYPT_MAXMEM`), and `maxmem` *does* bound work because OpenSSL
counts `p` (logN=19,r=1,p=16 is **refused**, so the "one step up in logN" headroom claim is
sound). But the worst params still *accepted* under `LIMITS`+`maxmem` — logN=14, r=31, p=16 —
measured **1720 ms vs 58 ms** shipped (**29.5×**). Only the operator writes `PASSWORD_HASH`
(root:root 0600), so this is misconfiguration territory, but it interacts with F3: a single
aggressive/typo'd hash makes every login 1.7 s and the queue 30× worse. Record the true
ceiling: the guard bounds *memory* well but leaves a 30× *time* spread.

## F8 — TRACE returns 500 on every route (SEV: LOW — informational, not a bypass)

**Confirmed by execution.** `TRACE /api/telemetry`, `TRACE /login`, `TRACE /` all → **500**
(`TypeError: 'TRACE' HTTP method is unsupported.` thrown by Next/Node before the proxy runs).
No data is exposed and no auth is bypassed (TRACE carries no body), and this is a Next 16 /
Node http-server behaviour, not step-7 code — but it is an unauthenticated input producing a
500, which is worth one line given §5's "never 500" spirit. Every other method
(GET/HEAD/OPTIONS/POST/PUT/DELETE/PATCH) on `/api/telemetry` correctly returns 401.

## F9 — scrypt treats trailing NUL bytes as absent (SEV: INFORMATIONAL — OpenSSL, negligible impact)

**Confirmed by execution.** OpenSSL's scrypt (and pbkdf2) hash `"abc"`, `"abc\0"`, `"abc\0\0"`
identically (SHA-256 does not). So `password ` would authenticate as `password`. Impact is
negligible: an attacker gains nothing without knowing the prefix, NULs are not typeable, and a
JSON body *can* carry ` ` but only helps someone who already knows the password. It is
OpenSSL behaviour, not project code. Noting it because it is a KDF-equivalence surprise a future
maintainer could trip over; no action needed.

---

# Attacked and found SOUND

Each of these I tried to break and could not.

- **Cookie forgery / tamper / truncate / strip / algorithm-swap / rotate / replay** (unit + live).
  Fabricated signatures (empty-secret HMAC, `HMAC-md5`/`sha512` of wrong length, all-zero,
  random) → 401. Payload tamper with a kept signature → 401. Truncation at *every* length (front
  and back) → null, no throw. Stripped signature, missing dot, extra dots, padded (`=`) or
  standard-base64 (`+`/`/`) signatures → 401. Secret rotation invalidates the old cookie. The
  30-day life is enforced **server-side against the token's `exp`** with strict `>` (`exp ==
  now` is refused), not merely as the cookie `Max-Age`. Type coercion (`undefined`, numbers,
  objects, `Buffer`, `Symbol`, functions, `NaN`, `true`) → null, no throw. Hostile `Cookie`
  headers (64 KiB value, duplicate cookie names — first wins, tab-padded name, lone `%`) are
  total. Constant-time compare is present (`timingSafeEqual` with the length-32 guard first).

- **`//api/telemetry` and friends — no path-normalisation bypass** (live). `//api/telemetry`,
  `///api/telemetry`, `/api//telemetry`, `/api/telemetry/`, `/.//api/telemetry` all → **308** to
  the canonical `/api/telemetry` (Next normalises *before* the proxy), which is 401.
  `/API/telemetry`, `/api%2ftelemetry`, `/api/./telemetry`, `/_next/static/../api/telemetry`,
  `/_next/static/%2e%2e/api/telemetry`, `/login/../api/telemetry`, `/favicon.ico/../api/telemetry`,
  `/api/session/../telemetry`, `/api/telemetry;x=1`, `%00`, `%20` → all 401 or 302→/login. No
  spelling reached telemetry unauthenticated. The matcher `/((?!_next/static|_next/image|favicon\.ico).*)`
  plus the `pathname === LOGIN_PATH || pathname === SESSION_PATH` exact-match exemptions hold.

- **CVE-2025-29927-class header bypass — not exploitable on Next 16.3.4** (live). Every spelling
  of `x-middleware-subrequest` (`middleware`, `proxy`, `src/middleware`, `src/proxy`,
  `pages/_middleware`, 5×-colon-repeated), plus `x-middleware-prefetch`, `x-nextjs-data`,
  `x-invoke-path`, `x-middleware-override-headers`, `x-forwarded-host` → all still 401. The proxy
  runs and refuses.

- **Server Actions / methods on the exempt paths** (live). `POST /login` with a forged
  `Next-Action` → 404 (no action defined). `POST /` with `Next-Action` → 302→/login (gated).
  No unauthenticated server-action surface.

- **The scrypt encoding** (unit). `parseScryptHash` returns `null` (never throws) for: wrong
  field count, non-numeric / leading-zero / `+`-signed / scientific-notation / space-padded
  `logN`, out-of-range params, empty salt, `+`/`/`, unicode, the argon2id tag, uppercase
  `SCRYPT`, a PHC `$scrypt$…` string, and — the check `session.ts` lacks — **non-canonical
  base64url** (proven with the 4-unused-bits salt spelling `A×21+B`). A malformed `PASSWORD_HASH`
  yields a clean, permanent 401, never a 500 or a boot crash. The derived-key comparison is
  constant-time (`timingSafeEqual` + length guard). The three measured traps all reproduced.

- **Deny-on-error for the session-check path** (unit + live). A throwing verifier → 401 (POST).
  A throwing clock / env / header-getter through `verifySession` → `false` → 401 (telemetry).
  Every POST refusal (no body, empty, non-JSON, `[]`, `null`, `"x"`, `{}`, `{"password":""}`,
  `{"password":123|null|object}`, oversized) is **401 with an empty body and only a
  `cache-control` header** — no 400, no error text, no timing/shape leak of malformed-vs-wrong.
  (The two unwrapped call-sites are F6.)

- **Secrets hygiene** (grep + live). No `console`/`stdout`/`stderr` of secrets anywhere in
  `lib/auth` or `proxy.ts`. `SESSION_SECRET` and `PASSWORD_HASH` *values* appear in **no** served
  HTML and **no** client chunk; the key *names* appear in no client chunk; **no** source maps are
  emitted. `readAuthConfig` reads `process.env` per call and logs nothing.

- **`exclusively()` is one mechanism, not two half-mechanisms** (unit). Survives a synchronous
  throw from `work`, an async rejection, and preserves ordering; the settled-either-way `tail`
  normalisation genuinely prevents queue poisoning.

- **The login screen §5.2** (live-rendered HTML). All copy present verbatim (`ai-server`,
  `192.168.4.71:8090`, `Unlock`, the plain-HTTP disclosure, `Password not recognised.`,
  `Session expired — sign in again.`, `Too many attempts. Try again in Ns.`). The rendered
  `<input>` carries `type="password"`, `autoComplete="current-password"`, `autofocus`, and
  `value=""`; the field is never disabled and never cleared (S24/§5.2's retention rule).
  **The build's measured fact is confirmed: React does not escape `<style>` children** — `<style>`
  is a raw-text element, so a `>` in the CSS *would* emit literally and a `</style` could break
  out — but the shipped `LOGIN_CSS` contains no `<`, `>`, or `&` (verified on the rendered page),
  so the markup-safe-subset mitigation holds. The error strings are static constants; the only
  interpolation is `rateLimitedMessage(n)` where `n` is a server integer already validated by
  `/^(?:0|[1-9][0-9]*)$/` in `retryAfterSeconds` — no injection channel.

- **Retry-After accuracy and lockout arithmetic** (unit + live). 5 attempts → 6th is 429 with
  `retry-after: 60`; the countdown is accurate (`30 000 ms → 30`, `59 999 ms → 30`… `1`, never 0)
  and releases at exactly `lockoutMs`. A refused attempt during a lockout does **not** extend it
  (S27); a correct password clears the key. Live: 6 wrong logins from one XFF → 401×5 then 429×2;
  a different address → 401.

- **DELETE replay / revocation** (live). `DELETE` → 204, clears the cookie, revokes the `sid`;
  replay at `/api/telemetry` → 401. The documented asymmetry (a revoked cookie still GETs `/` →
  200) holds and is harmless **today** because `app/page.tsx` is the scaffold ("Scaffold only",
  no telemetry). See the forward obligation below.

---

# Adjudication of S21–S29

| # | Verdict | Note |
|---|---|---|
| **S21** | **Valid, but under-stated** | The `??=` reading is correct (confirmed in 16.3.4 + live) and there is no missed peer-address source in an App-Router route handler. But the consequence is not merely "not rate-limited": with the serial KDF it is a login-availability DoS (F3) and an unbounded-map vector (F4/F5). The one-line spec fix S21 asks for should also mention admission control, not just the key. |
| **S22** | Sound | JSON-only, 4 KiB cap, `content-length` then `text.length`. I could not OOM the handler; a chunked/no-`content-length` body is still bounded by `text.length > MAX_BODY_BYTES → null`. What the *platform* buffers before the handler is upstream, as the build says. |
| **S23** | Sound | 204 always, cookie cleared unconditionally, revoked when valid, never rate-limited. Confirmed live. |
| **S24** | Sound | Every refusal is 401 with an empty body and only `cache-control`. Confirmed across 11 malformed shapes. |
| **S25** | Sound | `/login?expired=1`, set only when a cookie was present. Presence-based (`!== undefined`), so step 8 must set the param — any value triggers the state, including `?expired=0`; matches `proxy.ts`. |
| **S26** | Sound | `/login` is always 200 even when authenticated; deliberate and harmless. |
| **S27** | Sound | Refused attempts are not recorded (countdown can reach zero); success clears the key. Both confirmed. |
| **S28** | Sound decision, **loud obligation on step 11** | scrypt chosen, zero deps. **O20 is load-bearing:** if `dashboard.sh set-password` does not emit *this exact* `scrypt.<logN>.<r>.<p>.<salt>.<key>` format, `parseScryptHash` returns `null` and **every** login is a clean 401 with nothing logged — a "dashboard that won't open" with no diagnostic. An argon2id hash denies all logins silently. Step 11 must use `hashPassword()` as the producer and `dashboard.sh check` should surface a `PASSWORD_HASH` that fails `parseScryptHash`. |
| **S29** | Sound floor, **quoting caveat** | 31 chars → null, 32 → ok (confirmed). But Docker `--env-file` keeps quotes, so `SESSION_SECRET="a…"` (32 chars + 2 quotes = 34) **passes** the floor with the quotes baked into the key (confirmed live). Consistent with the build's own "values must be unquoted" warning; it is an O20-adjacent obligation on step 11's generator, and the floor cannot catch a *quoted short* secret cleanly. |

The three "properties with no mutation" the build lists (the length guard before
`timingSafeEqual`, the `Number.isFinite` guards, the `opaqueredirect` branch) are all correctly
un-mutatable — I confirmed removing the length guard is behaviour-preserving (the `try/catch`
swallows the `RangeError`), that `JSON.stringify(Infinity)` is `null` so no signed payload
carries a non-finite number, and that the `opaqueredirect` branch needs a browser fetch Node
does not produce. **However**, the *fourth* untested-for-the-right-reason property — "a modified
signature is rejected" — has a test (F1) that is both flaky and, 1/16 of the time, actually
demonstrates the opposite. Other tests (the forge cases, the payload-edit case) would still
catch a mutation that removed signature verification entirely, so the suite's *detection* of
that regression is intact; F1's harm is purely the false-red.

---

# Forward obligations (reasoned, for later steps)

- **Step 10** must keep the server-rendered shell free of telemetry and secrets. The revocation
  asymmetry (F-sound: revoked cookie still GETs `/`) is harmless only while `/` carries no data.
  All readings must stay behind `GET /api/telemetry`, which runs the full (revocation-aware)
  verdict; the shell must remain safe to hand to a revoked or stale session.
- **Step 11** owns O20 (S28) and the unquoted-secret generation (S29). Both are silent-failure
  traps of exactly the class this repo keeps paying for.
- **Before step 8 inherits the suite**, F1 should be fixed — a 6 % false-red rate on the only
  trust anchor is corrosive.

---

# Reasoned but not proven

- **That F1 is the *identical* instance the build saw** is a high-confidence inference, not a
  certainty: I reproduced *a* flake that matches the count (1603), the exit (1), the
  Isolate+ELIFECYCLE tail, and the `pnpm verify` wording, on the file the build most recently
  wrote — but I cannot prove it is the same physical run. It is by far the most parsimonious
  explanation, and no other exit-1-with-clean-tail appeared in 10 warm + 8 cold runs.
- **F9's negligible impact** is reasoned from the KDF's structure, not from an exploit (and
  writing one is out of scope by the rules).
- The step-7 files were exercised on macOS/Node 24.16.0; `node:24-slim`/glibc behaviour for
  `crypto.scrypt` and `timingSafeEqual` is assumed identical (they are OpenSSL-backed and
  ABI-stable), not re-measured on the target image.
