# Step 7 — Auth & login · **build**

Green: `pnpm verify` → **44 files, 1603 tests, exit 0**, under **Node v24.16.0**.
`pnpm build` → exit 0, route table now shows `ƒ /api/session`, `ƒ /login` and
`ƒ Proxy (Middleware)`. Six regression harnesses, **464 mutations**, all bite; both ledgers
that cover this step's files are clean.

---

## 0. Which interpreter every command ran under

**Every command in this phase was run with nvm's Node 24 first on `PATH`**, using
HANDOVER §1's corrected incantation. Nothing was run under the Hermes Node 26 that
`$HOME/.local/bin/node` points at.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd /Users/yorman/Projects/DevelopmentLabs/ai-server/dashboard
node -v                              # v24.16.0
pnpm -v                              # 12.3.4
pnpm exec node -p "process.version + ' modules=' + process.versions.modules"
                                     # v24.16.0 modules=137
```

`NODE_MODULE_VERSION` is **137** on this interpreter. That number is the reason the pin
exists — and it is also the reason it stopped mattering: **this step added no native module
and no dependency at all.** See §1.

Everything below ran under that shell: `pnpm verify`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, every `pnpm vitest run <file>`, all six `regressions.py` harnesses, and the
live smoke test in §9 (`node .next/standalone/server.js`).

---

## 1. The KDF decision: **scrypt**, and the argument for it

§5 says *"a scrypt **or** argon2id hash"*. §5.1 says `dashboard.sh set-password` *"hashes
with argon2id"*. HANDOVER §1 flagged this as a real fork and asked for the choice to be
recorded either way. **This build implements scrypt**, via Node 24's own
`crypto.scrypt`.

**What argon2id would have cost, in the order that decided it:**

1. **It would be this project's first dependency and its only native/ABI surface.** Steps
   1–6 added **zero** — step 5 hand-wrote a 509-line D-Bus codec rather than take one. A
   binary resolved on this Mac under one Node major is not the one that runs in
   `node:24-slim`, and the failure would surface in step 11's image or on the box.
2. **`crypto.scrypt` is built in.** Nothing for step 11's Dockerfile to compile, no prebuild
   to resolve, and no `linux-x64-gnu` artefact that has to be in `pnpm-lock.yaml` before
   step 12's `--frozen-lockfile` install runs on the box.
3. **scrypt is memory-hard, standardised (RFC 7914), and named by §5 itself.** At the shipped
   parameters it is 32 MiB and **~60 ms measured on this Mac** — expect ~2–3× on the box's
   Xeon W-2135, which is well inside a login's budget at five attempts a minute.

**What it would have bought:** a better side-channel story on shared hardware, and finer
control of the time/memory trade-off. Neither is worth an ABI on a single-tenant LAN box
behind a rate limit.

**Measured, on Node v24.16.0, to choose the parameters** (`128·N·r` is the allocation):

| logN | r | p | time | memory |
|---|---|---|---|---|
| 14 | 8 | 1 | 29.8 ms | 16 MiB |
| **15** | **8** | **1** | **59.4 ms** | **32 MiB** |
| 16 | 8 | 1 | 125.4 ms | 64 MiB |
| 17 | 8 | 1 | 255.0 ms | 128 MiB |

Shipped: **N = 2¹⁵, r = 8, p = 1, 32-byte key, 16-byte salt.**

### ⚠ Three things measured while building it, each of which would have shipped a bug

- **`crypto.scrypt` throws SYNCHRONOUSLY on bad parameters**, not through its callback.
  Node's *default* `maxmem` is 32 MiB and `128·2¹⁵·8` is 32 MiB exactly, so the shipped
  parameters raise `RangeError: ERR_CRYPTO_INVALID_SCRYPT_PARAMS` from the call itself.
  `SCRYPT_MAXMEM` (64 MiB) is passed explicitly **and** the call sits in a `try`/`catch`
  **and** the costs read out of the env file are range-checked (logN 1–20, r 1–32, p 1–16).
  Without the catch a hostile or typo'd `PASSWORD_HASH` would be a **500**, which §5 forbids.
- **`Buffer.from(s, 'base64url')` is lenient** — it drops characters outside the alphabet
  rather than failing, so `Buffer.from('!!!!','base64url')` is an empty buffer, not an error.
  Every field is checked three ways: the alphabet, the decoded length, and a re-encode that
  must reproduce the input byte for byte.
- **`crypto.scrypt` runs on libuv's thread pool** — the same pool §4 spends four paragraphs
  protecting, because `readFile`/`readdir`/`statfs` run there and four concurrently blocked
  operations block every subsequent read in the process **indefinitely**. A login flood would
  otherwise cost one worker and 32 MiB per attempt against a telemetry poll that needs nine
  concurrent `/proc` reads. `exclusively()` serialises the KDF: **at most one scrypt is ever
  outstanding**, whatever arrives. That is the second line; the rate limit is the first, and
  it runs before any hashing.

### ⚠ The encoding is deliberately NOT the PHC string format

PHC would write `$scrypt$ln=15,r=8,p=1$<salt>$<hash>`. Three characters in that string are
hazards in the exact places this value has to survive:

| character | what it breaks |
|---|---|
| `$` | a `dashboard.sh` that ever *sources* `/etc/ai-dashboard.env` expands `$scrypt` to nothing, silently |
| `=` | a `KEY=VALUE` reader that splits on **every** `=` rather than the first |
| `,` | one more thing a hand-rolled parser can disagree about |

Nothing outside this project reads this hash, so interoperability buys nothing and the safe
alphabet removes a whole category of silence. The format is

```
scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>
```

— six dot-separated fields over `[A-Za-z0-9._-]`, asserted by a test.

### ⚠ Obligation on step 11 (new: **O20**)

**`dashboard.sh set-password` must produce this format, not argon2id.** §5.1's wording says
argon2id; §5's "or" is what makes this legal, and the script and the verifier must agree or
the dashboard cannot be logged into. `hashPassword()` is exported from
`lib/auth/scrypt.ts` for exactly that purpose and is the producer half of the contract. It
is the only export in `lib/auth/` that the running server never calls, and it is kept beside
the verifier so the two cannot drift.

Node 24 runs TypeScript directly (type stripping), so a producer is one line —
`node --input-type=module -e "import {hashPassword} from './lib/auth/scrypt.ts'; …"` worked
here — but step 11 should decide its own path from inside the image. **`set-password` must
prompt, never take the password as an argument** (§5.1; the same reasoning as
`--api-key-file`), and this step deliberately provides no CLI that could be misused that way.

---

## 2. What was built

| Path | Lines | What it is |
|---|---|---|
| `lib/auth/scrypt.ts` | 306 | The KDF: encode/parse, constant-time verify, the single-slot serialiser, `hashPassword` for step 11 |
| `lib/auth/config.ts` | 87 | The `/etc/ai-dashboard.env` contract: `PASSWORD_HASH`, `SESSION_SECRET` (`STANDING` is §6.4's) |
| `lib/auth/cookie.ts` | 94 | A total `Cookie` reader, and §5's `Set-Cookie` |
| `lib/auth/session.ts` | 175 | Mint and verify the signed token. **Pure crypto — imports no state** |
| `lib/auth/revocations.ts` | 106 | What makes `DELETE` mean something. In memory, swept lazily |
| `lib/auth/rate-limit.ts` | 189 | §5.2's 5/min + 60 s lockout, `Retry-After`, and the source key |
| `lib/auth/authorize.ts` | 112 | The **full** verdict, and the `SessionCheck` that replaced step 6's placeholder |
| `lib/auth/handler.ts` | 220 | `POST`/`DELETE /api/session` as functions of a `Request` |
| `lib/auth/login-view.ts` | 134 | §5.2's five states and every string the spec fixes |
| `app/api/session/route.ts` | 25 | `dynamic`, `POST`, `DELETE`, and nothing else |
| `app/login/page.tsx` | 128 | `/login`: the one `?expired` decision, and the scoped stylesheet |
| `app/login/login-form.tsx` | 208 | `LoginForm` (stateful) + `LoginCard` (**pure**, so all five states render in a test) |
| `proxy.ts` | 124 | §5's gate. **`proxy.ts`, not `middleware.ts`** — see §5 |
| 13 test files | 1 833 | **252 new tests** |

**Changed:** `lib/telemetry/handler.ts` (the placeholder replaced), its two step-6 test files
(one renamed test each), `lib/guardrails.test.ts` (scope widened — §6), and step 6's harness
(one mutation **re-aimed**, §8).

**No dependency was added.** Invariant 6 needs no entry: the count is still eight, all pinned.

---

## 3. The cookie: exact construction, and why it is not forgeable

```
aid_session = <payload-base64url> "." <hmac-sha256-base64url>
payload     = {"v":1,"sid":"<16 random bytes, base64url>","iat":<ms>,"exp":<ms>}
hmac        = HMAC-SHA256(SESSION_SECRET, <payload-base64url>)

Set-Cookie: aid_session=…; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000
```

**Why it cannot be forged without `SESSION_SECRET`:** the signature covers **the exact bytes
the verifier parses** — the encoded payload, not a re-serialisation of it — so there is no
canonicalisation gap, and every field a forger would want (`exp`, `sid`) is inside the signed
region. `config.ts` refuses a secret shorter than 32 characters, which is the only way this
project could realistically weaken the PRF assumption. Three tests attack it directly: a
payload re-signed with another key, an extended `exp`, and a changed `sid` — and the
re-signed one is additionally shown to verify *under the key it was signed with*, so the
failure is the signature check and not something incidental.

**Verification order, and it matters:** signature → shape → expiry. An unsigned payload never
reaches `JSON.parse`, so the only JSON this process parses out of a cookie is JSON it wrote.

**Constant time:** `timingSafeEqual` over the two 32-byte digests, with the **length compared
first** — `timingSafeEqual` throws on a mismatch, which is the classic constant-time defence
turning into the classic 500. 32 is a constant and leaks nothing.

**Attributes:**

- `HttpOnly` — out of reach of `document.cookie`.
- `SameSite=Strict` — with **no TLS there is no `Secure` to lean on**, so this is what carries
  CSRF protection: no cross-site request, including a `DELETE /api/session` from an
  attacker's page, ever carries this cookie.
- **No `Secure`, and that is §5's decision, not an omission.** §5 chose plain HTTP; a
  `Secure` cookie is never sent over it, so setting it would produce a dashboard that logs in
  and bounces straight back to `/login` for ever with nothing in any log. A test asserts its
  absence, so the day TLS arrives it has to be changed deliberately.
- `Path=/` on **both** the setting and the clearing cookie — a browser matches a deletion by
  name, path and domain, and a mismatched `Path` is a logout that looks like it worked.
- **Server-enforced 30 days.** `exp` is checked against the clock, not left to the browser's
  `Max-Age`: a client that keeps sending an expired cookie is the normal case for anything
  that is not a browser.

**Not replayable after `DELETE`.** A signed cookie is stateless, so clearing the browser's
copy does nothing to a copy someone else holds. `DELETE` revokes the `sid` in
`revocations.ts` and every `/api/*` verdict consults it — **measured live in §9: replaying a
logged-out cookie against the running server returns 401.** Scope, stated where the promise
is made: the store is in memory, so a **container restart forgets every revocation**, on the
same terms §5 already accepts for the rate limiter. Rotating `SESSION_SECRET` is the escape
hatch, and §5.1 is explicit that `install` must never do it by accident.

### ⚠ Two verdicts, and the split is structural

| | checks | used by |
|---|---|---|
| `verifiedSessionOf` (`session.ts`) | signature · shape · 30 days | `proxy.ts` |
| `liveSessionOf` (`authorize.ts`) | that **plus revocation** | every `/api/*` route |

The proxy cannot honestly consult the revocation store: Next's own proxy documentation says
it *"is meant to be invoked separately of your render code … you should not attempt relying
on shared modules or globals."* So the proxy makes the verdict it can make, and every path
that reaches a **reading** makes the full one. The consequence is stated rather than hidden,
and was measured in §9: a revoked cookie can still fetch the dashboard's HTML **shell**,
which carries no telemetry, and the first `GET /api/telemetry` that shell makes is a 401 that
§5.2 routes to `/login`.

---

## 4. Deny-on-error: how it is enforced, and how it is tested

§5: *"A session check that cannot reach a verdict DENIES … and any error raised while
deciding — is **401**, never 500."* HANDOVER §3.2 rule 2 adds the half that decides the
design: *"do not rely on [the handler's catch] either: an `authorize` that throws on ordinary
input is still a bug, it just is not a 500."*

**So the rule is enforced in four places, and the first three are the real ones:**

1. **Every parser is total by construction.** `readCookie`, `verifySessionToken`,
   `parseScryptHash`, `readAuthConfig` and `passwordFrom` each map **every** input to a value
   or to `null`/`false`. No ordinary input raises.
2. **`verifySession` catches anyway**, for a dependency that throws.
3. **`proxy.ts` catches**, because a throw there is Next's own 500 page.
4. **`lib/telemetry/handler.ts`'s `authorized()` still catches**, untouched — HANDOVER says
   do not remove it, and it was not removed.

**Tested, deliberately from both directions:**

| what | where |
|---|---|
| 12 malformed `Cookie` headers → `null`, and `expect(...).not.toThrow()` | `cookie.test.ts` |
| 11 malformed tokens (no separator, three fields, non-base64url, a 64 KiB blob) → `null`, no throw | `session.test.ts` |
| a **validly signed payload that is not JSON** → `null`, not a `SyntaxError` | `session.test.ts` |
| 8 malformed cookies through the real `verifySession` → `false`, no throw | `authorize.test.ts` |
| a **throwing revocation store** and a **throwing header accessor** → `false`, no throw | `authorize.test.ts` |
| a verifier that **throws** and one that **rejects** → `POST` answers 401, never 500 | `handler.test.ts` |
| 5 unparseable `PASSWORD_HASH` values (including a real argon2id PHC string) → `false` | `scrypt.test.ts` |
| the gate: 5 bad-cookie shapes → 302 / 401, never a 500 | `proxy.test.ts` |

Mutations `E2`, `A4`, `P7` and `S9` each remove one of those catches and each goes red.

---

## 5. The gate — and it is `proxy.ts`, not `middleware.ts`

**Next 16 renamed the convention.** From the bundled docs
(`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`): *"Starting with
Next.js 16, Middleware is now called Proxy … The functionality remains the same."*
`middleware.ts` is deprecated. This is exactly what `AGENTS.md` warns about, and the docs
were read before the file was written. **A file left at the old name is not an error — it
simply never runs**: every route open, nothing in any log, and a test suite that still passes
because it imported the module directly. `pnpm build` confirms the file is picked up
(`ƒ Proxy (Middleware)` in the route table) and a test asserts both that `proxy.ts` exists
and that no `middleware.ts` sits beside it.

Other facts read out of the docs rather than assumed:

- **Proxy defaults to the Node.js runtime** in Next 16, and setting `runtime` there throws.
  So `node:crypto` is available and there is one runtime, not two.
- **Without a `matcher` it runs on every request including `_next/static`** — the gate would
  302 the login screen's own assets. The negative pattern is Next's own shape for this, and
  `matcher` must be a literal because Next reads it at build time and silently ignores
  anything it cannot statically analyse.

Behaviour: `/login` and `/api/session` pass through unconditionally (there is no other way to
obtain a session); a valid session passes through; otherwise **`/api/*` is 401 with no body**
and a page request is **302** to `/login`.

- **401 rather than a redirect for `/api/*`**, and the difference is larger than it looks: a
  redirect is followed by `fetch`, the client receives a 200 carrying the login page's HTML,
  `response.ok` is true, and step 8's poller would try to parse a document as a snapshot —
  landing on §6.7's failed-poll path with a banner naming a *server* failure, never telling
  the user to sign in.
- **302 rather than `NextResponse.redirect`'s 307 default**, because 307 preserves the
  method and a POST to a gated page would be re-POSTed at `/login`.
- **`?expired=1` only when a cookie was actually present.** §5.2's *Session expired* means
  "arrived here from an expired session"; telling a first-time visitor their session expired
  is the kind of lie §6.5 exists to prevent.
- **It does not import `lib/telemetry/handler.ts`** (HANDOVER §6 item 8 — one process, one
  cache, one `previous`) **and does not import `revocations.ts`** (§3 above). Both are
  asserted over the module's import specifiers, parsed as imports rather than as text,
  because this module explains both rules in prose.
- **The route-level check stays.** HANDOVER §3.2 rule 4 — middleware is not a reason to relax
  an ordering a test pins. `handler.test.ts` still asserts by call count that an
  unauthenticated request never reaches the telemetry source.

---

## 6. The rate limit: its clock, and its `Retry-After`

**§5.2's numbers, unchanged:** 5 attempts per minute per source IP, then a 60 s lockout, in
memory, no writable store.

**The clock is monotonic** (`performance.now()`), supplied by the caller. A 60 s lockout on
the wall clock can be ended early by a forward NTP step and extended indefinitely by a
backward one — mutation `R14`'s lesson from step 6 (§4's cache timed on `Date.now()`),
applied to the other place in this project that measures an interval. The session cookie is
the opposite case and deliberately uses the **wall** clock, because a 30-day life is stored
in a browser and must survive restarts; `performance.now()` cannot express that. One test
pins both wirings at once.

**`Retry-After` is whole seconds and never `0`** — a client told to wait zero seconds retries
immediately, which is the busy-loop the header exists to prevent — and it **counts down with
the lockout** rather than being a constant 60.

**Decisions §5.2 does not make, made here and recorded:**

- **A refused attempt is not recorded**, so a lockout cannot be rolled forward for ever by a
  hidden tab retrying on a timer. §5.2 has the countdown reach zero and the client re-enable
  submit; a self-extending lockout could never reach it.
- **A successful login clears the key.** A correct password is not a guess; without this a
  user who mistyped four times and then succeeded would spend the rest of the minute one
  attempt from a lockout.
- **The lockout clears the attempts that caused it**, so release starts a fresh window. At the
  shipped constants `LOCKOUT_MS == ATTEMPT_WINDOW_MS`, which makes that unobservable — so the
  test drives it with a **shorter lockout than the window**, because the equality is a
  property of two numbers and not of the limiter.
- **Ordering:** the limit is checked **before the body is read and long before the KDF**. A
  rate limit that hashed first would be "five *answers* per minute, unlimited work".

**No timer anywhere.** Both maps here (`rate-limit.ts`, `revocations.ts`) are swept **lazily**
— on read when an entry is dead, and on write once the map passes a threshold. §4 forbids
background work in this process outright, HANDOVER §5.3 named this limiter as the thing most
likely to reach for `setInterval`, and `lib/guardrails.test.ts` now enforces it over
`lib/auth/` too (§7).

### ⚠ What "per source IP" can actually mean on this deployment — an observation against §5

§2.5 runs the container `--network host` with **no reverse proxy**, and Next 15 removed
`NextRequest.ip`. Measured in `next/dist/server/base-server.js`:

```js
req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress;
```

`??=` is the whole story: **Next fills the header from the socket only when the client did
not send one.** So `X-Forwarded-For` is the real peer address for every ordinary client and
is whatever it likes for a client that sets it, and a route handler in the App Router is not
given the socket. Two consequences, neither hidden:

1. **A caller that rotates the header is not rate-limited.** §5 anticipates the shape of this
   — *"It is a LAN service, not a public one; this is to blunt scripted guessing, not a
   serious auth boundary"* — and a fixed key is exactly what stops scripted guessing. The
   password stays behind scrypt, and the KDF serialiser is what stops the unlimited path from
   becoming unlimited **work**.
2. **A caller that forges the operator's address can lock the operator out** for 60 s at a
   time. A nuisance, not an escalation; the alternative — no per-IP key — fails §5 outright.

A trustworthy key needs either a reverse proxy that overwrites the header or a custom server
that reads the socket, and **both are outside §2.5's runtime contract**. Recorded here as an
observation rather than fixed, because fixing it would change the deployment §2.5 fixes. See
§10, **S21**.

---

## 7. §5.2's five states, each mapped to its test

The wording lives in `lib/auth/login-view.ts`, not in the component, so "the five states say
what §5.2 says" is a table test rather than a rendering test. `LoginCard` was then split out
as a **pure function of a `LoginView`** so that all five also render — `react-dom/server`'s
`renderToStaticMarkup` runs in plain Node against `react-dom`, which is already a dependency,
so **no jsdom and no testing library were added** (HANDOVER §9 leaves jsdom to "the first
step that needs one"; step 7 does not).

| §5.2 state | copy asserted | behaviour asserted | rendered |
|---|---|---|---|
| Idle | (no message) | submit enabled, field focused | `⚠ Idle — no message, submit enabled` |
| Submitting | (no message) | submit disabled, **field stays readable and populated** | `⚠ Submitting — submit disabled, field still readable…` |
| Wrong password | `Password not recognised.` | submit enabled, **field NOT cleared** | `⚠ Wrong password — the message shows and the field is NOT cleared` |
| Rate-limited | `Too many attempts. Try again in 43s.` | submit disabled, number from `Retry-After` | `⚠ Rate-limited — the server's countdown shows and submit is disabled` |
| Session expired | `Session expired — sign in again.` | submit enabled | `⚠ Session expired — the message shows and submit stays enabled` |

All five are also table-tested in `login-view.test.ts` (`⚠ §5.2 state — …`), and
`⚠ the password field is never disabled — <state>` runs over all five, because the way this
gets broken is a `disabled` added for the submitting case and left there.

Also asserted on the rendered markup: one password input with `type=password`, `autofocus`
and `autocomplete="current-password"`; the `Unlock` button; the plain-HTTP disclosure **on
the screen**; and §5.2's **"Absent"** row — no username, no remember-me, no reset, no account
creation, no checkbox, no text or email input.

⚠ Attribute names are matched **case-insensitively**: React 19's server renderer emits some
props in their JSX spelling (`autoComplete`, `readOnly`). HTML attribute names are
case-insensitive so both behave identically — confirmed in §9, where the live Next render
also emits `autoComplete="current-password"` and `autofocus=""`. Pinning one spelling would
pin React's internals rather than §5.2.

**The countdown.** Seeded from the 429's `Retry-After` and counted down by a chain of
one-shot `setTimeout`s; at zero the card returns to **Idle**, which re-enables submit without
assuming anything, and the next 429 seeds a fresh number — §5.2's stated recovery. A
background tab throttles `setTimeout`, so the countdown there runs **slower** than the
server's lockout, which is the safe direction: it can only over-state the wait, never show
`0 s` while the server still refuses. `app/login/` is deliberately outside the source-text
timer guard's scope (§6.7's timers are the browser's), which HANDOVER §5.3 already states.

**Reading a 302 a browser will not show us.** §5.2 says *"On success: 302 to `/`"*, and the
route returns exactly that. A browser `fetch` with `redirect: 'manual'` yields an **opaque**
response (`type: 'opaqueredirect'`, `status: 0`, no headers) while Node's fetch hands back
the real 302; the form treats both as success. The `Set-Cookie` is applied by the user agent
when the response arrives, before any redirect handling, so an opaque response still logs the
user in. That branch is one of two properties recorded as having **no mutation** (§8).

---

## 8. Regression evidence

### Step 7's own harness — `pipeline/steps/07-auth-login/regressions.py`

```
All 98 regressions failed their check, as they must.
Red-test ledger: 159 distinct failing tests across 98 mutations; 94 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
                                                             exit=0
```

Grouped: `S1–S10` the KDF · `K1–K7` the cookie · `E1–E8` the token · `F1–F4` the env contract
· `L1–L10` the rate limit · `V1–V3` revocation · `A1–A4` the verdict · `P1–P14` the two
endpoints · `X1–X8` the gate · `W1–W11` the copy · `C1–C8` the screen · `G3–G5` the route ·
`N1–N4` the Next file · `G1–G2` the widened source-text guard · `T1–T3` type-level.

**The ledger's first run failed, and it was right to.** Seven mutations did not bite and
**five of the seven were bad TESTS, not bad mutations** — the recurring defect HANDOVER names:

| mutation | what the test actually checked | fix |
|---|---|---|
| `S3` (drop the canonical base64url re-encode) | `${salt}=` was caught by the **alphabet** and `${key}A` by the **length** — the re-encode was never reached | added the real case: 16 bytes is 22 base64url characters whose last carries **four unused bits**, so `A×21 + B` decodes to the same sixteen zero bytes at the right length through the right alphabet |
| `S10` (drop the algorithm tag check) | `argon2id.1.1.1.…AAAA` was caught by the **key length** | gave the case a full-length key, so only the tag distinguishes |
| `L2` (lockout keeps its attempts) | at the shipped constants `LOCKOUT_MS == ATTEMPT_WINDOW_MS`, so the attempts are always outside the window when it releases and the clear is unobservable | the test now drives a **shorter lockout than the window**; the equality is a property of two numbers, not of the limiter |
| `E7` (drop `Number.isFinite` on `exp`) | **`JSON.stringify({exp: Infinity})` is `{"exp":null}`** — JSON cannot express `Infinity` or `NaN`, so the case was refused by the `typeof` guard beside it | the two cases were **renamed for what they check**; the finiteness guard is recorded as a property with no mutation |
| `G4` (a `>` in the stylesheet) | the comment claimed React escapes `<style>` children. **Measured: it does not** — `style` is a raw-text element and `<style>{'.a > i{}'}</style>` emits a literal `>`, while the same string in a `div` becomes `&gt;` | the test now asserts a **markup-safe subset** (`no <, >, &`) as a deliberate constraint, and the comment says what was measured |

The other two were bad mutations: `S6` was an `ANCHOR NOT FOUND` after `exclusively()` was
simplified, and `P1` moved the limiter above the *body read* rather than above the *KDF* —
it never actually crossed the thing it claimed to cross.

**Ledger, second round:** eleven ⚠ tests had no mutation. Nine got one (`F4`, `P13`, `P14`,
`W9`, `W10`, `W11`, `C8`, `X8`, and `E1` once its test was fixed). One test was **rewritten**
because it could pass for the wrong reason — `⚠ flipping one character of the payload…`
usually corrupted the JSON, so it went red under `JSON.parse` rather than under the signature
check; it now edits `sid` inside valid JSON and pairs it with the original signature, and
proves the edited payload is well-formed by re-signing it. One ⚠ was **dropped rather than
the standard**: *"the gate is at proxy.ts, and there is no stale middleware.ts beside it"* is
a fact about the file **tree**, and this harness mutates the **contents** of one file.

**Properties with no mutation, recorded rather than papered over** (three, all in the harness
docstring): `session.ts`'s length guard before `timingSafeEqual` (removing it is
behaviour-preserving, because the `try`/`catch` §5 requires independently swallows the
`RangeError` and returns the same `null`); the `Number.isFinite` guards (unreachable while
the payload is JSON); and `login-form.tsx`'s `opaqueredirect` branch (reaching it needs a
*browser* fetch; Node's returns a readable 302 that the adjacent branch already covers).

### The other five harnesses, re-run after this step's changes

| harness | mutations | result |
|---|---|---|
| `02-format-severity` | 40 | exit 0 |
| `03-collectors-gpu-host` | 64 | exit 0 |
| `04-collector-cooling` | 76 + ledger | exit 0 — **`T56`/`T67` still redden the two guard tests after their rename** |
| `05-collectors-serving-storage-safety` | 127 + ledger | exit 0 |
| `06-telemetry-route` | 59 + ledger | exit 0 — **`H3` re-aimed**, see below |
| `07-auth-login` | 98 + ledger | exit 0 |
| | **464** | |

**`H3` was re-aimed, not deleted.** Its anchor was
`export const noSessionVerifierYet: SessionCheck = () => false;`, which step 7 removed — an
exported, tested, unused seam is its own hazard. The *property* is unchanged and is still
step 6's to keep red, because `lib/telemetry/handler.test.ts` is in step 6's `LEDGER_FILES`,
so `H3` now mutates `lib/auth/authorize.ts`'s `verifySession` to `() => true`. ⚠ `ROUTE` was
dropped from its check list on purpose: `route.test.ts` calls the **real** `GET`, and under a
permissive verifier that would fork `nvidia-smi` and open two D-Bus connections on whatever
machine runs the harness. `handler.test.ts` now runs the real verifier against a **fake**
source, which tells the two implementations apart without that.

### The two step-6 tests that had to change

| was | is |
|---|---|
| `⚠ the shipped default denies every request until step 7 replaces it` | `⚠ the production session check refuses a request carrying no session cookie` |
| `⚠ the shipped route answers 401 until step 7 supplies a session check` | `⚠ the shipped route answers 401 to a request with no session cookie` |

Both still assert 401 and the call count; the first now also asserts
`productionTelemetryDeps.authorize === verifySession`.

---

## 9. Green, and a live end-to-end check

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ rm -f tsconfig.tsbuildinfo && pnpm verify
$ tsc --noEmit && vitest run

 Test Files  44 passed (44)
      Tests  1603 passed (1603)
Type Errors  no errors
   Duration  3.35s

exit=0
```

```
$ pnpm build
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/session
├ ƒ /api/telemetry
└ ƒ /login

ƒ Proxy (Middleware)
exit=0
```

`tsconfig.json` is byte-identical across the build (`md5 8b6e358b0e19ad663d554dc8310c6da0`).

**Writing the config is not evidence it took**, so the whole thing was run:
`node .next/standalone/server.js` on 127.0.0.1:8091 with a real `PASSWORD_HASH` and a real
32-byte `SESSION_SECRET`.

| probe | result |
|---|---|
| `GET /` unauthenticated | **302 → /login** |
| `GET /login` | **200**, disclosure present, `?expired=1` renders `Session expired — sign in again.` |
| `GET /api/telemetry` unauthenticated | **401** |
| `POST /api/session` wrong password | **401** |
| `POST /api/session` right password | **302**, `location: /`, `cache-control: no-store`, `set-cookie: aid_session=…; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000` |
| `GET /` with the cookie | **200** |
| `GET /api/telemetry` with the cookie | **200**, a partial snapshot with `errors[]` (invariant 5, on a Mac with no `nvidia-smi`) |
| `DELETE /api/session` | **204** |
| **replay the cookie at `/api/telemetry` after `DELETE`** | **401** ← the revocation store, in the real server process |
| `GET /` with the revoked cookie | **200** — the documented asymmetry: the shell, which carries no telemetry, and whose first poll is the 401 above |
| six wrong logins from one `X-Forwarded-For` | 401 ×5, then **429 with `retry-after: 60`**, and the seventh likewise |
| the same attempt from another address | **401** — the lockout is per source |

The rendered `/login` carries `autoComplete="current-password"` and `autofocus=""` under the
real Next renderer, which is what the case-insensitive assertions were written for.

### ⚠ One toolchain observation, reported without a rule attached

While wiring the verifier, **`pnpm typecheck` exited 0 on a tree that had a `TS2305`**
(`handler.test.ts` still imported the just-deleted `noSessionVerifierYet`). `pnpm test` then
failed at *runtime* with `noSessionVerifierYet is not a function`, and Vitest's own typecheck
block also printed `Type Errors  no errors`. Deleting `tsconfig.tsbuildinfo` and re-running
produced the error immediately.

HANDOVER §1 documents the **false-failure** direction of a stale build-info file. This was the
**false-pass** direction, which is worse — `pnpm verify` exited 0 on a broken tree. **Three
attempts to reproduce it failed** (removing an export with a warm build-info; the same plus a
newly added file; the same after a Vitest run, which does not touch the file). So it is
recorded as *observed once, circumstances noted, not reproduced* rather than as a rule. The
mitigation costs one line and was applied to every green measurement quoted above:
`rm -f tsconfig.tsbuildinfo && pnpm verify`.

---

## 10. Underspecified — reported, not filled in (invariant 7)

Nothing here blocked the step; each is a place the spec is silent and a choice had to exist
for the endpoint to exist at all. Choices are stated in the code and repeated here.

| # | Gap | What was chosen, and why |
|---|---|---|
| **S21** | **§5 says "per source IP", and §2.5's deployment cannot supply a trustworthy one.** No reverse proxy, and Next 15 removed `NextRequest.ip`; `X-Forwarded-For` is filled from the socket **only when the client omits it** (`??=`, measured in `base-server.js`) | Keyed on the first `X-Forwarded-For` entry, truncated to 100 characters. §5's own threat model ("to blunt scripted guessing, not a serious auth boundary") is what makes this adequate; the KDF serialiser bounds the work on the unlimited path. **The spec would need one line either accepting the header as the key or adding a proxy to §2.5** |
| **S22** | **§5 does not give `POST /api/session` a request grammar.** The endpoint cannot exist without one | JSON `{"password": "…"}`, capped at 4 KiB, `content-length` checked first. **No form-encoded fallback**: one grammar is one thing to get wrong, and §5.2's server-supplied countdown needs JavaScript regardless, so a no-JS form could not reach a working state |
| **S23** | **§5 gives no status for `DELETE /api/session`, and does not say whether logout requires a session** | **204, always**, cookie cleared unconditionally — a client whose cookie is malformed is the one that most needs it gone — and the `sid` revoked when the cookie verifies. Never rate-limited: a logout is not a guess |
| **S24** | **§5.2 has five states and no state for a malformed request.** A 400 would be a sixth with no copy | Every refusal is **401 with no body**: wrong password, absent body, non-JSON body, no `password` field, oversized body, unconfigured server. Truthful (none supplied a password this server recognises) and safe (a distinct status would tell an unauthenticated caller which guess was better formed — the same reasoning §5 gives for the empty 401 body) |
| **S25** | **§5.2's *Session expired* state has no stated transport.** It is "arrived here from an expired session", and something has to carry that across a redirect | `/login?expired=1`, set by `proxy.ts` **only when a cookie was present**. `EXPIRED_PARAM` is exported from `lib/auth/login-view.ts`; **step 8 must use the same door** when it routes a 401 to `/login` |
| **S26** | **§5 does not say what happens to an already-authenticated visitor at `/login`** | The screen is shown. Harmless, and useful for re-authenticating; a redirect to `/` would make a deliberate re-login impossible |
| **S27** | **§5.2 does not say whether a lockout can be extended, or whether success clears the counter** | A refused attempt is **not** recorded (otherwise the countdown could never reach zero, which §5.2 requires it to); success **clears** the key. Both are argued in §6 |
| **S28** | **§5.1 says `set-password` "hashes with argon2id" while §5 permits scrypt.** Not silence — a tension | Resolved in favour of §5's "or" and zero dependencies (§1). **Recorded as obligation O20 on step 11**: the script and the verifier must agree, and `hashPassword()` is the producer half |
| **S29** | **`SESSION_SECRET` has no stated minimum.** §5.1 says the install script generates 32 bytes, but nothing constrains a hand-written one, and the cookie's unforgeability rests entirely on it | A floor of **32 characters** (32 random bytes is 43 base64url or 64 hex). Below it, every session is refused — a dashboard that will not open, which is the loud, immediate, harmless direction. **Step 11 should surface it in `dashboard.sh check`**, since nothing here logs |

**HANDOVER §7's open question is answered, and the answer is that no parser was written.**
*"Which `KEY=VALUE` grammar is `/etc/ai-dashboard.env`?"* — **Docker's**. §2.5 deploys with
`docker run`, so Docker parses `--env-file` and the values arrive in `process.env`; this step
reads `process.env` and nothing else, so the project still has exactly two `KEY=VALUE`
parsers and neither was reached for. What step 7 owes step 11 is the constraint that makes
that safe, because Docker's grammar is unlike both of the others: it splits on the **first**
`=`, takes the rest of the line verbatim, and **does not strip quotes** —
`SESSION_SECRET="abc"` yields four characters including the quotes. Both values must be
single-line, unquoted, with no surrounding space, and must avoid `$`; the hash encoding in §1
is chosen to satisfy that, and `SESSION_SECRET` must be generated in the same alphabet.

---

## 11. For the adversarial phase — where to push

1. **The `X-Forwarded-For` key (S21).** The honest limit of §5's rate limit on this
   deployment. Is the reading of `??=` right, and is there a source of the peer address in a
   Next 16 App Router route handler that was missed?
2. **The revocation asymmetry.** The proxy makes the cryptographic verdict and the routes make
   the full one. Is "the HTML shell carries no telemetry" true today, and does it stay true
   through step 10?
3. **`exclusively()`.** One slot for the whole process. Does the queue behave under a
   synchronous throw from `work`, and is `tail.then(work)` + normalisation genuinely one
   mechanism rather than two half-mechanisms?
4. **The body cap.** `content-length` then `text.length`. What does a chunked body with no
   `content-length` cost this process before the handler sees it?
5. **The five states.** `LoginCard` is pure and covered; `LoginForm`'s **transitions** are not
   — the `submitting → wrong`, `submitting → rate-limited` and countdown-to-idle paths have no
   DOM test. Is that the point at which jsdom earns its place, or is the split enough?
6. **`app/login/` is outside the timer guard's scope.** The countdown is a chain of one-shot
   `setTimeout`s in a client component. Does the effect leave a timer behind on unmount, and
   does a state change mid-countdown restart it correctly?
7. **The three properties with no mutation.** Each is argued in the harness docstring. Is any
   of them actually mutatable?
