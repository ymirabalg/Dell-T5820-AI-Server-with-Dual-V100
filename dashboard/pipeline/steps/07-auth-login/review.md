# Step 7 — Auth & login · **review**

I edited no source, no test, no config and no spec. Every experiment ran in the scratchpad
against `node:crypto` or against the built modules; the only filesystem delta from this phase
is `tsconfig.tsbuildinfo` (git-ignored). `git status --short` is `M .gitignore` / `?? dashboard/`
— byte-identical to HANDOVER §11's baseline.

Baseline re-run under Node 24 (HANDOVER §1's nvm-first `PATH`), cold:

```
rm -f tsconfig.tsbuildinfo && pnpm verify
  Tests  1603 passed (1603) · Type Errors  no errors · Duration 3.21s
exit=0
```

---

# Part 1 — Adjudication of the adversarial findings

## F1 + F2 — **one defect, two faces. Both are real. My ruling differs from both prior phases.**

### The measurement, re-derived rather than accepted

I reproduced this from first principles rather than trusting the adversarial's number.

A 32-byte HMAC is 43 base64url characters. 43 = 10×4 + 3, so the final group is three
characters encoding two bytes: **the last character carries 6 bits of which only 4 are
significant.** The 64 characters therefore fall into 16 equivalence classes of 4, and a
*canonical* encoding always lands on the class representative — the character whose index has
its low two bits zero (`A`, `E`, `I`, `M`, `Q`, `U`, `Y`, `c`, `g`, `k`, `o`, `s`, `w`, `0`,
`4`, `8`).

That is the whole mechanism, and it explains a result that otherwise looks arbitrary:

```
200 000 real HMACs:  last char == 'A'                       12 467  (6.23 %)
                     flip A→B decodes to identical bytes    12 467  (6.23 %)
                     flip <anything else>→A                      0
identical-decode broken down by canonical last char:  { A: 12526 }   ← only 'A'
sample: sig …k  →  equivalent spellings  k l m n   (n = 4)
```

Only `A` collides, because the test's flip is `endsWith('A') ? 'B' : 'A'` and `A`/`B` share a
class while `E`→`A`, `I`→`A` … do not. So the failure rate is exactly **1/16 = 6.25 %**, not a
coincidence and not machine-dependent.

Empirically, 24 consecutive runs of the file:

```
× ⚠ flipping one character of the signature invalidates it   3ms
FAILED 1 of 24 runs of session.test.ts
```

**The adversarial's identification is correct in every particular** — mechanism, rate, and the
reason the human's capture named no test. I confirm it independently.

### F1 — the test. **Real. MUST fix. It is worse than "flaky".**

1/16 of the time the assertion `expect(verifySessionToken(flipped, …)).toBeNull()` is **false**,
so the test does not merely fail — on those runs it is *demonstrating the opposite of its own
name*, and on the other 15/16 it is passing for a reason it does not state (it flipped into a
different class, not because "one character was flipped"). The name over-claims the body. That
is the sixth occurrence of HANDOVER's most-repeated defect and it is the first one that could
be caught by execution rather than by reading.

### F2 — the verifier. **Real, and I rule it a correctness wart, NOT a vulnerability.**

I am deliberate about this because the prompt asks me not to inflate it and not to wave it away.

**What it is not.** It is not a forgery vector, and the reasoning is not "the bytes match" — it
is that the *tag space is unchanged*. Producing any of the four spellings still requires
`HMAC-SHA256(SESSION_SECRET, payload)`; the multiplicity is in the encoding, not in the 256-bit
tag. Nothing downstream is keyed on the cookie string: revocation is keyed on `sid`, which lives
inside the signed payload, so all four spellings die together (the adversarial verified this
live). The rate limiter is not keyed on the cookie. There is no cache keyed on it. **A LOW
severity is the honest one.**

**What it is.** Three things, in ascending order of how much they should matter to the owner:

1. `scrypt.ts`'s `decodeField` performs exactly this check — alphabet, decoded length, **and a
   re-encode compared byte-for-byte** — and `session.ts` performs the first two and omits the
   third. **Two modules in one directory disagree about what canonical base64url means, and one
   of them is missing the check the other's own harness mutation (`S3`) exists to defend.** A
   future reader must decide which is right; that is the wart.
2. `session.ts`'s module doc asserts *"there is no canonicalisation gap to exploit."* That
   sentence is true of the **payload** (the HMAC covers the payload *string*, so a non-canonical
   payload spelling changes the signed input and is refused) and false of the **signature**. The
   doc does not say which field it is about. HANDOVER's rule — *"a wrong descriptive comment
   misinforms"* — applies.
3. It is what makes F1 flaky.

### ⚠ Where the fix belongs — and why fixing only the test is the wrong call

Three candidate sites; I rule on each.

| site | ruling |
|---|---|
| **the cookie decoder** (`readCookie`) | **No.** It is a generic `Cookie`-header reader that must stay total and must not know a token grammar. Adding base64url knowledge there would put the check in the one module that also serves `proxy.ts`'s `hadCookie` decision, where any value at all is the right answer |
| **the verifier** (`verifySessionToken`) | **Yes.** The token grammar is defined here. Three lines mirroring `decodeField`: `if (given.toString('base64url') !== signature) return null;` after the length guard |
| **the payload field too** | **No** — and record why. A non-canonical payload spelling already fails the signature, so a canonical check there is unreachable code with no possible mutation. This project has a rule about recording unmutatable properties rather than shipping them silently |

**The decisive argument for fixing the verifier and not just the test** is that fixing the test
alone leaves the project with two contradictory base64url decoders and one comment that
mis-describes its own module — and it does not make the property *testable*. Fixing the verifier
makes the test's own claim true for every character, which is the only version of that test
worth having.

### ⚠ But the verifier fix alone re-creates the same trap one level up — **neither prior phase saw this**

If `session.ts` gains the canonical check and the test keeps its `endsWith('A') ? 'B' : 'A'`
flip, then the harness mutation that *removes* that check goes red **1 run in 16**. A mutation
that bites 6 % of the time exits 1 and is indistinguishable from one that always bites: the
ledger cannot tell them apart, and `regressions.py` would report a green ledger over a mutation
that is almost never caught. **A probabilistic red is a silent `DID NOT BITE`.**

So the fix is a pair, and both halves are required:

- **`session.ts`** — reject a signature that is not its own canonical spelling.
- **`session.test.ts`** — build the alternate spelling **deterministically from the character
  that is actually there** rather than hard-coding `A`/`B`. The low bit of a canonical last
  character is always an unused bit, so `ALPHABET[ALPHABET.indexOf(last) ^ 1]` yields a
  same-class character for *every* token. The test is then 100 % green with the check and 100 %
  red without it, with no seeding and no fixed vector.
- And **split the test in two**, because the current one conflates two properties under one
  name: *"a different tag is refused"* (flip a byte of the decoded signature and re-encode) and
  *"a non-canonical spelling of the same tag is refused"*. Those are different claims about
  different mechanisms and they want different mutations.

## F3 — **Real. The adversarial is right that S21 under-states it, and I go further on the fix.**

I confirmed the `??=` reading myself at `next/dist/server/base-server.js:612` (16.3.4):

```js
req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress;
```

and confirmed there is no other peer-address source in the file and none in the bundled docs.
`x-forwarded-host`, `-port` and `-proto` are filled the same way three lines above. The build's
reading is correct and the adversarial's re-confirmation is correct.

**The deployment fact the prompt names is the one that settles it, and it is stronger than
either phase stated.** §2.5 runs the container `--network host` with **no reverse proxy**.
Therefore **nothing legitimate ever sets `X-Forwarded-For` on this box.** It is not
"untrustworthy" in the ordinary sense — where a header sometimes carries real information and
sometimes does not — it is *meaningless*: every value that ever appears is either Next's
socket fill-in, or a lie. And the asymmetry is total:

- an attacker can **evade** their own bucket, by rotating the header;
- an attacker can **occupy** the operator's bucket, by forging the operator's address;
- the operator can do **neither** in reverse, because their own value is the one Next supplies.

A key with that shape is not a weak key. It is a key that works only for the party who is not
attacking.

**On severity.** The measured 84.7 s of denial for ~1.5 s of attacker effort is real and I accept
it. Two things the adversarial's write-up leaves on the table:

1. **The queue retains the password.** `deriveKey`'s closure captures `password` (a JS string of
   up to `MAX_BODY_BYTES`, so ≤ 8 KiB in UTF-16), `salt`, `params`, plus the pending handler's
   whole async frame and its `Request`. At the request rates this box can accept, a sustained
   flood is tens of thousands of retained frames per minute.
2. **§2.5 sets no container memory limit.** The runtime-contract table fixes the network mode,
   the read-only root, the tmpfs, `UV_THREADPOOL_SIZE`, the logging driver and the user — and
   there is no `--memory`. So the unbounded queue's terminal state is an OOM of the dashboard
   process, not merely latency. That is an availability failure reachable unauthenticated.

**So: "a nuisance" (build) is wrong; "MEDIUM" (adversarial) is right.** Not an escalation — the
password is still behind scrypt and nothing here gets an attacker in — but login availability
and process memory are both deniable by an unauthenticated caller at near-zero cost.

### ⚠ The fix, and why it is smaller than either phase proposed

The adversarial offers three fixes (cap the queue and shed; a global concurrent-hash budget; a
global attempt ceiling *in addition to* the per-source one). All three add machinery. **There is
a smaller fix that closes F3, F4 and F5 at once and removes code rather than adding it: make the
limiter key a constant.**

One global bucket, 5 attempts per minute, 60 s lockout. Then:

- **F3 dies** — the KDF queue is structurally bounded at ≤ 5 pending, because the limiter runs
  before the body read and long before the KDF (the build's ordering is already correct and must
  not change). No queue cap, no admission controller, no second budget.
- **F4 dies** — the map holds one key. `MAX_KEY_CHARS` and the O(n) sweep become unreachable and
  can go.
- **F5 dies** — there is no `UNKNOWN_SOURCE` bucket to share.
- `sourceKeyOf`, `MAX_KEY_CHARS` and `UNKNOWN_SOURCE` are deleted. `rate-limit.ts` loses ~40
  lines and its longest doc comment.

**The objection I have to answer, because it is the real one:** under a global bucket, an
attacker locks *everyone* out with six requests a minute, permanently. Doesn't that make denial
*cheaper*?

**No — it is already that cheap today.** To deny login today the attacker forges the operator's
address and burns six attempts against it: same six requests a minute, same permanent denial.
Even if the operator's address were unknown, the box lives on a `/22` (4096 addresses), so
spraying every bucket costs 24 576 requests once a minute — trivial. **The per-source key buys
the defender nothing against denial and costs them the ability to bound the attacker at all.**
A global bucket strictly dominates it.

What a global bucket genuinely costs: a second LAN host that mistypes five times inside a minute
locks the operator out for 60 s. §5's own framing — *"one shared password, matching how this box
is actually used"* — says there is one legitimate user, so this is a hypothetical against a
measured DoS.

**Optional refinement, flagged as going beyond §5's letter** (owner's call, and I am not pushing
it): the residual property a global bucket does *not* fix is that login stays deniable. It could
be fixed by replacing the hard 60 s lockout with a **post-threshold throttle** — after five
failures, accept one attempt per 10 s globally, still answering 429 with `Retry-After: 10`, so
§5.2's five states and its server-supplied countdown are untouched in shape. An attacker then
gets 6 guesses/min instead of 5 (no worse) and the operator, who types the *correct* password,
gets in on their first try. This is a better design for a single-shared-password service. It is
also more invention than a review phase should push, so it is offered, not recommended.

## F4 — **Real. Subsumed by the F3 fix; independently real if that fix is declined.**

The build's claim that `MAX_KEY_CHARS` bounds the map is a bound on **width**, not on **count**,
and the adversarial is right that the sweep past `SWEEP_AT` frees nothing while every attempt is
still inside its own window — so the cost is quadratic in distinct attacker-chosen keys
(measured: 40 000 keys → 166 µs/request, 6.6 s of CPU). Correctly diagnosed.

I add one thing: `revocations.ts` has the identical `SWEEP_AT`/lazy-sweep shape and the
adversarial is right that it is safe — but the *reason* deserves to be stated as the general
rule, because it is the rule that tells the two apart: **a lazily-swept unbounded map is safe
exactly when its keys require a secret to mint.** `revoke` needs a validly signed cookie;
`attempt` needs an HTTP request. Same code shape, opposite security properties.

## F5 — **Real, and slightly over-stated. Subsumed by the F3 fix.**

The mechanism is right: empty / whitespace / `,` / leading-comma `X-Forwarded-For` all collapse
to `'unknown'`, and that bucket is shared. But the adversarial's impact sentence — *"anyone for
whom Next could not fill a socket address"* — describes a population that is empty on this
deployment: `--network host` means every connection is TCP over `eno1` and
`socket.remoteAddress` is always present, so the *only* clients that land in `'unknown'` are
ones that deliberately send a blank header. **LOW is right; the reason is not.**

## F6 — **Real, and MORE serious than "defence-in-depth". Neither phase found the consequence.**

The two unwrapped sites are confirmed by reading: `handler.ts:154`
(`deps.limiter.attempt(sourceKeyOf(request), deps.monotonicMs())`) and `handler.ts:213`
(`liveSessionOf(...)` in `handleSessionDelete`). `liveSessionOf` is genuinely not total —
`verifySession` is the only member of that pair that catches. All correct.

The adversarial rates it "contract gap, not reachable with production deps". I agree it is not
reachable today. **But the consequence if it ever becomes reachable is not a generic 500 — it is
a specific lie, in §5.2's own vocabulary.** `app/login/login-form.tsx:110-129`:

```ts
if (response.type === 'opaqueredirect' || response.status === 302 || response.ok) { … }
if (response.status === 429) { … }
setState({ kind: 'wrong' });          // ← every other status, including 500
} catch { setState({ kind: 'wrong' }); }   // ← and every network failure
```

So a 500 from `POST /api/session` renders **`Password not recognised.`** The operator retypes a
correct password, is told it is wrong, and has nothing anywhere to look at (§5 logs nothing —
see R8). This is exactly the failure §5 wrote the 401-never-500 rule to prevent, arriving through
the login screen instead of through the telemetry poller. **That raises F6 from "wrap it for
tidiness" to "wrap it because the one 500 this module can produce is undiagnosable by
construction."** SHOULD, not DEFER.

## F7 — **Real, LOW, and I would fix it differently from the adversarial.**

`LIMITS` is `logN 1–20 · r 1–32 · p 1–16`, and the adversarial's measurement (logN 14, r 31,
p 16 → 1720 ms vs 58 ms shipped, 29.5×) is sound. The build's own doc calls `LIMITS` "a
denial-of-service guard, not a strength guard", so the finding is that the guard bounds the wrong
quantity: `maxmem` bounds **memory** correctly, and nothing bounds **time**.

The adversarial says "record the true ceiling". I would rather **bound the product**: scrypt's
work is `O(N · r · p)`, so one guard — reject unless `2^logN · r · p ≤ 2^15 · 8 · 4` (four times
the shipped cost) — replaces three independent range checks with the quantity that actually
matters, and it is one line. Only the operator writes `PASSWORD_HASH`, so this is
misconfiguration territory; it earns its place because a typo'd hash multiplies F3's queue by 30
and because step 11's `dashboard.sh check` (see O20) should be able to say *why* a hash is
refused. **SHOULD-lite; acceptable to defer to step 11 with the check.**

## F8 — **Real, not step 7's, and I rule EXPLICITLY-NOT-DOING.**

`TRACE` → 500 is thrown by Node/Next before `proxy.ts` runs. It bypasses nothing (the 500 is a
refusal, not a pass-through), leaks nothing (TRACE carries no body and nothing is echoed), and
there is no step-7 code path that could intercept it. §5's "never 500" is scoped to a **session
check that cannot reach a verdict**; this is not one. Recording it is right; acting on it inside
this project is not. If it ever matters it is a ufw or reverse-proxy concern for step 12.

## F9 — **Real, confirmed independently, INFORMATIONAL, no action.**

```
scrypt('abc') == scrypt('abc\0') == scrypt('abc\0\0')   CONFIRMED
sha256('abc') != sha256('abc\0')                        (control)
```

OpenSSL treats the password as NUL-terminated. The adversarial's impact assessment is right and
its scope caveat ("reasoned, not exploited") is the right level of confidence. A JSON body can
carry ` `, but only someone who already knows the password gains anything. No action, and I
would keep the note: it is the kind of KDF surprise that costs an afternoon when rediscovered.

---

# Part 2 — Consolidated spec gaps: **Take / Decline**, with exact wording

`SPEC.md` is 1179 lines. Line numbers below are current.

## TAKE

### T1 — §5 line 656 and §5.2 line 711: **"per source IP" is not implementable and must go**

*This is the one the prompt flags as most needed, and it is the one I am most confident about.*

**Replace line 656**, currently:

> `- Rate-limit login to a few attempts per minute per IP. It is a LAN service, not a public one; this is to blunt scripted guessing, not a serious auth boundary.`

**with:**

> - **Rate-limit login globally — deliberately not per IP.** §2.5 runs the container with
>   `--network host` and no reverse proxy, so there is no client address to key on. Next fills
>   `X-Forwarded-For` from the socket **only when the client omits it** (`??=`, in
>   `base-server.js`), and an App Router route handler is never handed the socket. On this
>   deployment nothing legitimate sets that header, so it is not merely untrustworthy — it is
>   *meaningless*, and keying on it is worse than not keying at all: an attacker can rotate it to
>   escape their own limit **and** forge the operator's value to occupy theirs, while the
>   operator can do neither in return. **One bucket for the whole service: five attempts per
>   minute, then a 60 s lockout.** That is what this limit is for — blunting scripted guessing
>   against one shared password with one legitimate user — and being a single bucket is also
>   what keeps the password-hashing queue bounded (see §5.2). The cost is that any LAN host can
>   hold the login screen closed for 60 s at a time; the per-IP form has that property already,
>   at the same price, so nothing is given up. It is a LAN service, not a public one; this is to
>   blunt scripted guessing, not a serious auth boundary. **If a reverse proxy that overwrites
>   `X-Forwarded-For` is ever put in front of §2.5's container, a per-source key becomes
>   implementable and this paragraph should be revisited — not before.**

**Replace line 711**, currently:

> `**Rate limit:** 5 attempts per minute per source IP, then a 60 s lockout. Counted in memory; …`

**with:**

> **Rate limit:** 5 attempts per minute **for the whole service**, then a 60 s lockout — §5 says
> why the limit is global rather than per source IP. Counted in memory; it resets on container
> restart, which is acceptable for a LAN service and avoids giving the dashboard a writable store
> it otherwise does not need. **The limit is also the only bound on password-hashing work**: it
> is checked before the request body is read and long before the KDF, and one bucket is what
> keeps the number of queued hashes bounded by the limit itself rather than by the number of
> distinct values a caller cares to invent.

### T2 — §5 (new bullet, after line 656): **`POST /api/session` must require `Content-Type: application/json`**

Neither prior phase raised this and I confirmed there is **no** `content-type`, `Origin` or
`Sec-Fetch-*` check anywhere in `lib/auth/`, `proxy.ts` or `app/api/session/`. Consequence: a
POST carrying `text/plain` is a CORS **simple request** — no preflight — so **any web page the
operator's browser visits can fire login attempts at the dashboard**, from off the LAN, from the
operator's own source address. It cannot read the response, but it does not need to: it consumes
the limit and enqueues KDF work. Under T1's global bucket this becomes the cheapest way to hold
the dashboard closed, so T2 is a *precondition* of T1, not an independent nicety.

The fix costs nothing: `app/login/login-form.tsx:104` already sends
`'content-type': 'application/json'`, and requiring it makes any cross-origin POST preflighted
and therefore refused.

> - **`POST /api/session` requires `Content-Type: application/json`** and refuses anything else
>   with the same empty 401 as a wrong password. Without that requirement the request is a CORS
>   "simple request" and needs no preflight, so any page the operator's browser happens to load
>   could spend the login rate limit and queue password hashing on the dashboard's behalf.
>   Requiring the header makes a cross-origin attempt preflighted, and the preflight is refused.

### T3 — §5 line 668: **"the only route reachable unauthenticated" is false as written, and must be**

Line 668 reads *"The login screen is the only route reachable unauthenticated."* The shipped
gate necessarily exempts three more things and each exemption is load-bearing:

- **`/api/session`** — there is no other way to obtain a session.
- **`_next/static`, `_next/image`, `favicon.ico`** — `login-form.tsx` is a client component, so
  the login screen's own JavaScript is served from `_next/static`. Gate it and the login screen
  renders but cannot submit.

Someone reading line 668 literally will tighten `proxy.ts`'s matcher, and the failure will be a
login page that looks fine and does nothing.

> - **The login screen is the only *page* reachable unauthenticated**, and exactly two other
>   things are: `POST`/`DELETE /api/session`, because there is no other way to obtain or discard
>   a session; and the static assets under `_next/static` / `_next/image` / `favicon.ico`,
>   because the login screen is a client component and its own JavaScript is served from there.
>   **The gate's matcher must exempt all three.** Nothing else is, and no route that returns a
>   reading ever is.

### T4 — §5: **logout must invalidate the session server-side, and it forgets on restart**

The spec never mentions revocation. §4 calls `DELETE /api/session` "logout" and §5 says nothing
more, so `revocations.ts` — a whole module, a process-wide `Map`, and the entire two-verdict
split between `session.ts` and `authorize.ts` — rests on an inference. **It is the right
inference** (a stateless 30-day cookie that survives its own logout, on a plain-HTTP LAN where
that cookie crosses the wire in the clear, is a genuine surprise), but under invariant 7 an
inference of that size belongs in the spec. It also needs writing down so that step 11 or 12
does not "fix" the restart behaviour by giving the container a writable store, which §2.5's
`--read-only` forbids.

> - **`DELETE /api/session` invalidates the session on the server, not only in the browser.** A
>   signed cookie is stateless, so clearing the browser's copy does nothing to a copy someone
>   else holds; logout records the session id in memory and every `/api/*` check consults it.
>   **On the same terms as the rate limiter, that record is lost on container restart** — a
>   cookie logged out of before a restart is live again afterwards, until its own 30 days run
>   out. This is accepted for the same reason: no writable store. Rotating `SESSION_SECRET` is
>   the only durable revocation, and §5.1 is explicit that `install` must never do it by
>   accident. **The gate in front of pages may make the cryptographic verdict only** (signature,
>   shape, thirty days); the revocation check belongs on every route that returns a reading,
>   because a proxy cannot honestly read process-local state. The consequence — a revoked cookie
>   can still fetch the dashboard's HTML shell — is acceptable **only while that shell carries no
>   telemetry and no secrets**, which §6.1's assembly must preserve.

### T5 — §5.2: **there is no state for "the server did not answer", and the code currently lies**

`login-form.tsx` maps every non-302/non-`ok`/non-429 response *and* every network failure to
`{ kind: 'wrong' }` → **`Password not recognised.`** So a stopped container, a 500 (F6), and a
correct password are indistinguishable on screen. The build argued the choice in a code comment
(*"§5.2 has no state for it"*) but did **not** list it in §10's gap table — so a decision of that
weight is recorded only where nobody will look for it. This is the same class as §6.5's rule that
an em dash must never be a plausible-looking wrong number.

I do not think this needs a sixth state. One sentence separating "refused" from "did not answer"
is enough:

> **A response that is neither a success nor a refusal is not a wrong password.** If the request
> fails at the network, or the server answers with anything other than 302/2xx (success), 401
> (refused) or 429 (rate-limited), the screen says **`Could not reach the dashboard.`** and
> leaves submit enabled. Rendering `Password not recognised.` for a server that never answered
> sends the operator to retype a password that was correct, and §5's other half — that the server
> never logs — means there is nothing else for them to look at.

### T6 — §5: **a stolen cookie has no in-product remedy, and the procedure should be written down**

§5 chose plain HTTP and said so. It follows that the session cookie is interceptable on the LAN,
and the build handles the *forgery* half well. What is missing is the operator procedure: logging
in again does **not** invalidate existing sessions (each login mints a new `sid` and touches no
other), `DELETE` only revokes the session that presents itself, and §5.1 forbids `install` from
rotating `SESSION_SECRET`. So "I think my cookie was captured" has no answer inside the product.

> - **There is no way to invalidate a session you do not hold.** Logging in again mints a new
>   session and does not disturb any other; `DELETE /api/session` revokes only the session that
>   presented itself. If a cookie is believed to be captured, the remedy is to replace
>   `SESSION_SECRET` in `/etc/ai-dashboard.env` by hand and restart the container, which logs
>   out every session — the reason §5.1 forbids `install` from ever doing it by accident.

### T7 — §5: **nothing is logged, and that is a choice**

`config.ts` states it (*"Nothing is logged, because the only thing worth logging would sit one
edit away from logging the value"*) and I agree with the reasoning about **values**. But the
result is that a login flood, a lockout, a malformed `PASSWORD_HASH` and a stopped KDF are all
invisible: §2.5 configures `json-file` logging with rotation for a process that writes nothing
about the one subsystem an outsider can reach. F3 is undiagnosable and T5's "could not reach"
state is the operator's only signal. §5 is silent; report it rather than fill it.

> - **The dashboard logs nothing about authentication** — no attempt, no lockout, no
>   misconfiguration — because anything worth logging sits one edit away from logging a
>   credential. The consequence is accepted and stated: a login flood or a `PASSWORD_HASH` the
>   server cannot parse produces a dashboard that will not open and **no diagnostic anywhere**.
>   `dashboard.sh check` (§5.1) is the intended place to notice the second of those.

### T8 — §5.1 vs §5: **the argon2id / scrypt tension, resolved in the spec rather than in a comment**

The build's S28 is right that this is a tension and not a silence, and the adversarial is right
that it is the loudest silent-failure trap in the step. §5 says *"a scrypt **or** argon2id
hash"*; §5.1 says `set-password` *"hashes with argon2id"*. The build implements scrypt. If §5.1
is taken literally by step 11, `parseScryptHash` returns `null` and **every login is a clean,
empty 401 with nothing logged** (T7) — a dashboard that will not open, with no diagnostic.

> - `dashboard.sh set-password` **prompts** (never takes the password as an argument, which would
>   land in shell history and `ps`), hashes with **scrypt**, and writes the hash to
>   `/etc/ai-dashboard.env` in the exact encoding the server parses:
>   `scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>`, six dot-separated fields over
>   `[A-Za-z0-9._-]`. **The script and the verifier must produce and accept the same format**, so
>   `set-password` calls the server's own `hashPassword()` rather than reimplementing it. Any
>   other format — including a correct argon2id hash — makes every login a clean 401 with nothing
>   logged, so `dashboard.sh check` must report a `PASSWORD_HASH` the server cannot parse.

### T9 — §5.1: **the env file's grammar is Docker's, and both values must be unquoted**

The build answered HANDOVER §7's open question well (no third parser: Docker parses `--env-file`
and the values arrive in `process.env`) and the adversarial found the sharp edge: Docker does not
strip quotes, so `SESSION_SECRET="…32 chars…"` passes the 32-character floor **with the quotes
inside the key**. That is not caught by any check and cannot cleanly be — a quoted short secret
looks long. It belongs in §5.1 as a constraint on the generator.

> - `/etc/ai-dashboard.env` is read by Docker's `--env-file`, which splits on the **first** `=`,
>   takes the rest of the line verbatim, **does not strip quotes**, and expands nothing. Every
>   value in it must therefore be single-line, **unquoted**, with no surrounding whitespace, and
>   must avoid `$` in case the file is ever sourced by a shell. `SESSION_SECRET` is generated as
>   32 random bytes in base64url or hex for exactly that reason. A quoted value is not an error
>   Docker or the dashboard can detect — `SESSION_SECRET="…"` simply becomes a different secret
>   with two extra characters — so `dashboard.sh` must never write one.

## DECLINE

| # | Proposed | Why I decline it |
|---|---|---|
| **D1** | Add a spec line for a scrypt-queue cap / admission controller (adversarial's F3 fix) | Correct problem, wrong lever. T1's global bucket bounds the queue at five pending by construction. A cap is machinery that exists only because the key was wrong; fix the key |
| **D2** | Add a `Retry-After`-bearing 503 shed path | Same. And a shed path is a sixth §5.2 state with no copy — the exact objection the build raised against a 400 (S24), which I agree with |
| **D3** | Spec a `--memory` limit on the container (§2.5) | Real gap, but it is **step 11's**, not §5's, and once T1 lands the unbounded-queue reason for it is gone. It should be raised on its own merits (a dashboard that OOMs the box it watches), not as an auth fix |
| **D4** | Spec anything about `TRACE` (F8) | Not this project's code and not a session check. §5's "never 500" does not reach it |
| **D5** | Spec `Secure` on the cookie, or TLS | §5 already chose plain HTTP explicitly and §5.2 discloses it on screen. `Secure` over plain HTTP is a login loop with nothing in any log. Decline until the "if this ever leaves the LAN" clause is triggered |
| **D6** | A distinct status for a malformed login body (S24) | The build's reasoning is right and I ratify it: a distinct status tells an unauthenticated caller which guess was better formed. Every refusal stays 401 with no body |
| **D7** | Change `POST` to accept form encoding as a fallback (S22) | Ratify the build. One grammar; and §5.2's server-supplied countdown needs JavaScript anyway, so a no-JS form could never reach a working state |
| **D8** | Redirect an authenticated visitor away from `/login` (S26) | Ratify the build. Deliberate re-login is useful and the screen leaks nothing |

**S23, S25, S27** I ratify as the adversarial did, with one note on S25: because `page.tsx`
tests `params[EXPIRED_PARAM] !== undefined`, **any** value triggers the expired state, including
`?expired=0`. That is fine and matches `proxy.ts` — but it is a presence check, and step 8 must
set the parameter rather than a value (R3 below makes that mechanically possible).

---

# Part 3 — My own findings

## R1 — `POST /api/session` accepts any `Content-Type` → a CORS simple request

Covered as **T2** above; listed here so it appears in the findings ledger. Confirmed by reading:
no `content-type`, `Origin` or `Sec-Fetch-*` check exists anywhere in the auth code. The client
already sends the right header, so the server-side requirement is free. **SHOULD, and it becomes
MUST if T1 is taken**, because a global bucket that any visited web page can spend is a worse
bargain than a per-source one.

## R2 — the login screen calls a dead server a wrong password

Covered as **T5**. The code half is one branch in `login-form.tsx`; the spec half is the copy.

## R3 — ⚠ `LOGIN_PATH` and `SESSION_PATH` live in `proxy.ts`, and **step 8 cannot import them**

This is the sharpest composition problem I found and neither phase raised it.

```
proxy.ts:61            export const LOGIN_PATH   = '/login';
proxy.ts:64            export const SESSION_PATH = '/api/session';
login-form.tsx:63      const SESSION_ENDPOINT    = '/api/session';   ← second spelling already
lib/auth/login-view.ts:61  export const EXPIRED_PARAM = 'expired';   ← the client-safe module
```

Step 8 must, per §6.7 and S25, route a 401 to `/login?expired=1` from **client** code, and step
10's header needs a logout that calls `DELETE /api/session`. Both constants are exported from
`proxy.ts`, which imports `next/server` **and** `@/lib/auth/session` (and therefore
`node:crypto`). Importing it from a client component pulls the whole server auth graph toward
the browser bundle. So step 8 will either do that (bad) or write a third spelling of `/login`
and a third of `/api/session` (worse — and `/api/session` already has two).

**`lib/auth/login-view.ts` is the module that already solves this**: it is pure strings, has no
imports at all, is already imported by both `proxy.ts` (for `EXPIRED_PARAM`) and
`login-form.tsx`, and already holds exactly one member of this family. Move `LOGIN_PATH` and
`SESSION_PATH` there and have `proxy.ts` and `login-form.tsx` import them. Three literals become
one; the client-safe boundary becomes a property of the module graph rather than of a comment.

**SHOULD, and do it in step 7's reconciliation rather than step 8's** — it is a five-line move
inside step 7's own files, and after step 8 has written its own copies it stops being a move and
becomes a refactor across two steps.

## R4 — `MAX_BODY_BYTES` is compared against two different units

```ts
const declared = Number(request.headers.get('content-length') ?? '0');
if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;   // bytes
const text = await request.text();
if (text.length === 0 || text.length > MAX_BODY_BYTES) return null;        // UTF-16 code units
```

One constant, two units. A 4096-character body of three-byte UTF-8 characters is 12 KiB and
passes. Harmless at these magnitudes and the real bound (`text.length`) is the conservative
direction for count — but this project renames `GB` to `GiB` across 98 occurrences for exactly
this reason (O19), and it has a rule that a comment which mis-describes its module misinforms.
Either rename the constant to `MAX_BODY_CHARS` and drop the `content-length` comparison, or keep
both and compare bytes on both sides. **SHOULD-lite.**

## R5 — `sourceKeyOf(request)` is computed twice per successful login

`handler.ts:154` and `handler.ts:184`. Same input, same result, no bug — but a second call is a
second opportunity for the key that was *counted* and the key that is *cleared* to diverge.
Compute once. **Vanishes entirely if T1 is taken**, so: fold into that change or drop.

## R6 — two exports named `SWEEP_AT`, same value, same directory

`rate-limit.ts:71` and `revocations.ts:45`, both `256`. Not a bug — different modules, different
maps, and both are `export`ed for their own tests. But a file importing both gets a collision and
a reader gets a false sense that they are one tunable. Rename one, or don't; **noted, not
recommended.**

## R7 — is `revocations.ts` sound? **Yes. Does it survive a restart "in a way §5 expects"? §5 has no expectation.**

The prompt asks both halves and they have different answers.

**Sound, yes:**

- `revoke(sid, expMs, nowMs)` never stores an entry that can outlive the cookie it bans, because
  the entry's own expiry *is* the cookie's `exp`.
- `isRevoked` prunes on read when the underlying session has expired anyway — correct, because
  `verifySessionToken` has already refused that cookie by then, so the entry is dead weight.
- Clock discipline is right: wall clock on both sides, matching `session.ts`'s `exp`; the
  monotonic clock is confined to the limiter. `handler.ts:214` passes `deps.nowMs()`, the wall
  clock. Consistent.
- Unbounded growth is genuinely closed, and for the right reason: **`revoke` is reachable only
  from a validly signed cookie**, so minting a key costs `SESSION_SECRET`. This is the property
  F4 shows `rate-limit.ts` lacks, in identical code.
- Sweep-on-write past 256 is O(n) and frees real entries (unlike the limiter's, which frees
  nothing under attack). Bounded by real logouts inside 30 days.
- One instance per process, built at module load, and `proxy.ts` deliberately does not import it.
  The build's live check (replay after `DELETE` → 401 in the real standalone server) is the
  evidence that the route handlers share one instance.

**"In a way §5 expects": no, because §5 expects nothing.** §5 never mentions revocation at all —
that is **T4**, and it is the gap I most want written down after T1. Two consequences worth
stating explicitly:

- §2.5 gives the unit `Restart=on-failure`, so **a crash silently un-revokes every logged-out
  session.** Not a bug; it is the accepted trade, but it is currently accepted only in a code
  comment.
- The store's whole correctness rests on **one process, one module instance** — which is
  HANDOVER §9's step-11 obligation, previously a cache-coherence concern. See R8.

## R8 — ⚠ step 7 promoted step 11's "one process, one cache" from performance to **security**

HANDOVER §9 lists *"One process, one cache, one `previous` — no Next workers"* as a step-11 item.
Before step 7 the cost of getting it wrong was two 2 s caches and a doubled `nvidia-smi` fork
rate — a performance regression.

After step 7, **three process-global objects depend on that same invariant**, and two of them are
not performance:

| object | built at | what a second instance costs |
|---|---|---|
| `TelemetrySource` (step 6) | `lib/telemetry/handler.ts` load | a second cache — performance |
| `productionRevocations` | `lib/auth/revocations.ts` load | **`DELETE` stops working** for requests that land on the other instance — a security regression, silent |
| `productionRateLimiter` | `lib/auth/rate-limit.ts` load | the limit becomes N× looser, and under T1 the global bucket is no longer global — an availability and anti-guessing regression, silent |

Both new failures are **silent and directional**: they fail open, they produce no error, and
nothing in the suite can see them because the suite runs one process by construction. This is
exactly the shape of the ufw incident (`is-active` green on a disabled firewall) that this repo's
`CLAUDE.md` opens with. Step 11 must assert one process, and step 12 must verify it on the box.

## R9 — thirteen modules: **weight, not ceremony**

Nine under `lib/auth/` (1 296 lines of source) plus `proxy.ts`, the route, the page and the form.
That is ~144 lines per module, in line with `lib/telemetry/`'s six modules for ~1 100 lines, and
each has a distinct failure mode and a distinct fake — which is step 6's stated test for whether
a split earns its keep.

Two splits carry real weight and would be a mistake to fold:

- **`session.ts` (pure crypto) vs `authorize.ts` (stateful verdict).** This is the load-bearing
  one. It is what lets `proxy.ts` reach a verdict it can *honestly* make without importing
  process-local state Next says it may not rely on. Merge them and the proxy either imports the
  revocation store (dishonest) or the gate has no cryptographic check at all.
- **`login-view.ts` (data) vs `login-form.tsx` (markup).** This is what makes §5.2's five states
  a table test instead of a rendering test, and it is why **no jsdom and no testing library were
  added** — HANDOVER §9 leaves jsdom to "the first step that needs one" and step 7 correctly did
  not become that step.

Two I probed and would keep:

- **`cookie.ts` vs `session.ts`.** `proxy.ts` uses `readCookie` **alone**, for the `hadCookie`
  decision behind `?expired=1`, without touching the token. That is a real second consumer.
- **`config.ts`** is 87 lines for two `process.env` reads, which looks like ceremony — but it
  carries `MIN_SESSION_SECRET_CHARS` and the Docker `--env-file` grammar contract that step 11
  must obey (T9). Folding it into `authorize.ts` would bury step 11's contract inside a verdict
  module.

**The one consolidation I would make adds a module and removes a divergence:** a single canonical
base64url decoder (`decodeExact(field, bytes)`) used by both `scrypt.ts` and `session.ts`, so F2
cannot recur in a third place. That is the same family as HANDOVER's *"a second `errnoCodeOf`"*
prohibition. Either that, or the three-line check inlined in `session.ts` — but **"two
implementations of canonical base64url, one of which is missing" is not an option.**

## R10 — spec-conformance as a unit: **conformant except in one place, and that place is the spec's fault**

| §5 / §5.2 requirement | verdict |
|---|---|
| scrypt **or** argon2id hash, in `/etc/ai-dashboard.env` | ✅ scrypt, and §5's "or" makes it legal (T8 records the §5.1 tension) |
| httpOnly · SameSite=Strict · 30-day · signed with `SESSION_SECRET` | ✅ and the 30 days are enforced **server-side against `exp`**, not left to `Max-Age`, which is more than §5 asked for and is right |
| Rate limit, few per minute, **per source IP** | ❌ **the only non-conformance**, and it is not implementable on §2.5's deployment. **T1** |
| No TLS, disclosure on the screen | ✅ verbatim, and `Secure` is deliberately absent with a test pinning its absence |
| Cannot reach a verdict → 401, never 500, no body | ✅ on every path that decides a session; ⚠ two paths that decide something *else* are unwrapped (**F6**) |
| The login screen is the only unauthenticated route | ❌ **as written, necessarily.** **T3** |
| §5.2's table: identity, one field, `Unlock`, disclosure, four Absents | ✅ all present in rendered markup, verified live by the adversarial |
| §5.2's five states and their exact copy | ✅ table-tested and rendered; ⚠ a sixth condition exists and is mapped onto *Wrong password* (**T5**) |
| Server-supplied countdown, never client-invented | ✅ seeded from `Retry-After`, counts down only, background throttling errs slow |
| 302 to `/` on success | ✅ including the opaque-redirect case |
| Every `/api/*` returns 401 on expiry | ✅ at the proxy **and** at the route; the ordering test still pins auth-before-sample |

Two structural obligations from HANDOVER §6 I checked directly and both hold: `proxy.ts` imports
neither `lib/telemetry/handler.ts` nor `revocations.ts`; and `lib/telemetry/handler.test.ts`
still asserts by call count that an unauthenticated request never reaches the source.

## R11 — security posture as a unit: **sound where it is cryptographic, weak where it is about identity of the caller**

**Strong, and I tried to break each of these:**

- **The token has no algorithm agility and no self-describing header.** It is not a JWT; there is
  no `alg` field to confuse, no `none`, and no parser reachable before the MAC. Verification
  order is signature → shape → expiry, so the only JSON this process parses out of a cookie is
  JSON it wrote. That ordering is worth more than it looks and should not be "simplified".
- **The MAC covers the exact string the verifier parses.** No canonicalisation gap on the
  payload. (F2 is the *signature* field, which is a different and much smaller thing.)
- **`timingSafeEqual` with the length compared first**, in both `session.ts` and `scrypt.ts` —
  the constant-time defence not turned into a 500.
- **CSRF:** `SameSite=Strict` with no `Secure` to lean on. I checked the two directions that
  matter. `DELETE` cannot be driven cross-site (no cookie is sent). Login-CSRF is *possible* and
  *meaningless* here — there is one shared password and no per-user state to poison. The one
  cross-site vector that does bite is **R1/T2**, which is not CSRF but budget consumption.
- **Secrets hygiene:** `readAuthConfig` reads per call and logs nothing; the adversarial verified
  no secret values or key names reach any client chunk and no source maps are emitted.
- **Fail-closed by construction, not by catch.** Every parser in the path (`readCookie`,
  `verifySessionToken`, `parseScryptHash`, `readAuthConfig`, `passwordFrom`) is total, and the
  catches are second locks. That is the right order of defences and it is what makes the 401 a
  401 *for the right reason*.
- **No `PASSWORD_HASH` / no `SESSION_SECRET` ⇒ deny everything**, including a cookie a correct
  server would accept. Deny-by-default survived the removal of `noSessionVerifierYet`.

**Weak, and all of it is one root:** the service cannot identify who is calling it. That single
fact produces F3, F4, F5 and R1, and T1 + T2 are its treatment. It is a deployment property
(§2.5), not a coding error, which is why the fix is a spec edit and not a patch.

**One posture-level observation neither phase made:** the system has **no observability of its
own security surface at all** (T7). Combine that with T5 (a dead server says "wrong password")
and the failure mode of every finding in this document is the same — *silent*. This step's real
risk is not that something is broken; it is that if something breaks, nothing anywhere says so.

## R12 — will step 8 compose against this cleanly? **Yes, after R3.**

What step 8 needs and what it finds:

| step 8 needs | status |
|---|---|
| 401 from `/api/telemetry` → `/login` with the expired message | ✅ `EXPIRED_PARAM` exported from a client-safe module; ⚠ `LOGIN_PATH` is not — **R3** |
| A 401 must **not** engage §6.7's backoff | ✅ nothing in step 7 interferes; §6.7 already states it. Step 8 owns the branch |
| A logout control (step 10's header) | ⚠ `SESSION_PATH` is in `proxy.ts` — **R3** |
| `Retry-After` parsing | ✅ `retryAfterSeconds` exported from `login-view.ts`, client-safe, and rejects HTTP-dates deliberately |
| No timer rules inherited from step 7 | ✅ `app/login/` is outside `guardrails.test.ts`'s scope by design; `serverSideFiles()` now covers `lib/collectors`, `lib/telemetry`, `lib/auth`, `app/api`, `proxy.ts` — a correct widening. Step 8 still writes its own guard |
| The `/login` countdown as a model for step 8's timers | ✅ I read it: `useEffect` keyed on `[state]`, one one-shot `setTimeout` per tick, `clearTimeout` in the cleanup, and zero → *Idle*. No leak on unmount, correct restart on a fresh 429. The build's open question 6 is answered: it is sound |

---

# Part 4 — The trust anchor: does `pnpm verify` need a determinism requirement?

## What the pipeline now knows

Step 1 found counters that **lie on a failing run**. Step 7 found a test that **fails on its own
randomness**. Both directions of "green is not simple" have now been paid for, and there is a
third on the books that is worse than either: the build's §9 observation that
**`pnpm typecheck` exited 0 on a tree carrying a `TS2305`**, reproduced by nobody, mitigated by
`rm -f tsconfig.tsbuildinfo`. A false-red costs a bisect. **A false-pass ships the bug.**

## Is F1 the only instance? — **Yes, for the entropy shape. I checked exhaustively.**

Every entropy consumer in the suite, and whether its assertion can depend on the draw:

| site | draw | assertion depends on the value? |
|---|---|---|
| `session.test.ts` × 12 `mintSession` calls | `sid` = `randomBytes(16)` | **only at :121** — the rest assert round-trips, refusals of *constructed* tokens, or `Buffer.alloc` lengths |
| `session.test.ts:50-51` "two mints at the same instant differ" | `sid` | no — holds for every pair short of a 128-bit collision |
| `scrypt.test.ts:296` random 12-byte password round-trip | `randomBytes(12)` | no — an all-inputs property, and strictly **better** than a fixed vector |
| `hashPassword`'s internal `randomBytes(16)` salt | salt | no — every assertion is a round-trip |

So a blanket "no test may depend on generated entropy" would be **wrong**: it would forbid
`scrypt.test.ts:296`, which is a property test and is the strongest thing in that file.

I also checked the *other* nondeterminism class — wall-clock elapsed assertions — because it
would be a mistake to answer the question only for entropy. Four exist
(`http.test.ts:121`, `storage.test.ts:192`, `dbus.test.ts:498/521`) and all four carry **30–50×
margins** (a 60 ms bound asserted `< 3000`; a 40 ms bound asserted `< 2000`; a 1500 ms budget
asserted `< 500`). Those are not the same defect and are not a realistic flake source. Steps 3–5
sized them correctly.

## The requirement I would state — a rule, not tooling

> **A test may consume entropy only for an assertion that holds for every value it could draw.**
> If the truth of an assertion depends on *which* value was drawn, the value is not entropy — it
> is a fixture, and it must be constructed in the test.

That is one sentence, it is checkable by reading, and it distinguishes the two cases above
correctly. It is the same discipline as HANDOVER §5.2 note 2 (*read each test against its own
name*), applied to a second axis, and it belongs beside it.

**I recommend against the three mechanical alternatives**, having considered each:

- **Seeding.** `crypto.randomBytes` is not seedable; making it so means monkey-patching
  `node:crypto` in tests, which is a larger and more dangerous mechanism than the bug.
- **Running the crypto tests N times.** This is "re-run until green" wearing a lab coat, it
  multiplies suite time, and it only lowers the false-red rate — it never reaches zero.
- **A source-text guard on `randomBytes`.** Unsound by HANDOVER §5.3 note 4: it is an import, it
  is aliasable, and there is no last spelling.

## ⚠ And one new rule for §5.2's ledger, which F1 exposed

**The red-test ledger cannot see a probabilistic red.** A mutation that reddens its target 15
runs in 16 exits 1 and is indistinguishable in the harness output from one that always does. So
the harness would happily report a clean ledger over a property that is almost never actually
checked — a `DID NOT BITE` that never announces itself.

This has teeth right now: if F2 is fixed in `session.ts` and the test keeps its hard-coded
`A`/`B` flip, the mutation covering the new canonical check bites 6 % of the time and the ledger
says it is fine. That is why the F1/F2 fix is specified as a **pair** in Part 1 and why the test
must build its alternate spelling from the character that is present.

> Add to HANDOVER §5.2: **a mutation whose RED set depends on a value the test drew is a
> probabilistic mutation, and the harness cannot tell it from a sound one.** The only defence is
> the same reading discipline note 2 already requires — extended to ask, of each ⚠ test, *would
> this be red for every input, or only for most of them?*

## Does `pnpm verify` itself need to change?

**Not for F1** — that is a test bug and a verifier bug, fixed in code, not in the script.

**Yes for the false-pass**, and I rate this higher than F1 because its failure direction is
worse. The build observed it once, could not reproduce it in three attempts, and attached no
rule. Its own mitigation is one line and was applied to every green measurement it quoted:

```
rm -f tsconfig.tsbuildinfo && pnpm verify
```

I recommend making that the script rather than the ritual — `"verify": "rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run"` — and updating `lib/guardrails.test.ts:126`, which pins the script's exact text, **in the same change**. That test exists to prevent a *silent weakening*; strengthening it deliberately, with the assertion updated in the same commit, is exactly what it is designed to permit. `pnpm typecheck` stays incremental for iteration, which HANDOVER §1 already says is not the green signal.

I deliberately do **not** recommend `"incremental": false` in `tsconfig.json`: that file is
asserted byte-for-byte across `next build` (md5 `8b6e358b0e19ad663d554dc8310c6da0`) and its flags
are asserted as text, so changing it costs more and buys the same thing.

---

# Part 5 — What must not leak into steps 8 and 11

## Into step 8

1. **`LOGIN_PATH` / `SESSION_PATH` must be importable without `next/server`.** R3. Fix in step
   7's reconciliation; after step 8 writes its own copies it is no longer a five-line move.
2. **Set the `expired` parameter, do not invent a message.** `EXPIRED_PARAM` is the door;
   presence is the trigger, so `?expired=1` (never `?expired=0`, which also triggers it and reads
   as a bug).
3. **A 401 is not a failed poll.** §6.7's backoff, grey dot and failure banner are for a *server*
   failure. A 401 routes to `/login`. Getting this wrong produces the exact outcome §5 wrote the
   401-never-500 rule to prevent, from the other end.
4. **Do not import `lib/auth/handler.ts`, `authorize.ts`, `revocations.ts` or `rate-limit.ts`
   from client code.** They reach `node:crypto` and process-global state. `login-view.ts` is the
   client-safe surface and is the only one.
5. **The dashboard shell must stay free of telemetry and secrets** — the adversarial's forward
   obligation, and it is the standing condition under which T4's proxy/route asymmetry is
   acceptable. It is a step-10 obligation that step 8 must not undermine by rendering a first
   snapshot server-side.

## Into step 11 — **the two silent-failure obligations, and I ratify both as load-bearing**

6. **O20 / S28 — `dashboard.sh set-password` must emit exactly
   `scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>`.** Anything else — including a
   perfectly correct argon2id hash, which is what §5.1's current wording asks for — makes
   `parseScryptHash` return `null` and **every login a clean, empty 401 with nothing logged**.
   No error, no log line, no failed unit: a dashboard that will not open and will not say why.
   Use `hashPassword()` as the producer; do not reimplement the encoder. **T8 fixes the spec
   wording so step 11 is not asked to do the wrong thing.**
7. **S29 — `SESSION_SECRET` must be written unquoted.** Docker's `--env-file` does not strip
   quotes, so `SESSION_SECRET="…"` silently becomes a different secret two characters longer,
   passes the 32-character floor, and produces a working dashboard whose sessions all die the
   moment anyone rewrites the file without quotes. Single line, unquoted, no surrounding space,
   no `$`. **T9.**
8. **`dashboard.sh check` is the only place either of those can be caught**, because the server
   logs nothing (T7). It should report: `PASSWORD_HASH` that fails `parseScryptHash`;
   `SESSION_SECRET` shorter than 32 characters **or containing a quote character**; and the env
   file's mode and owner.
9. **One process, one module instance — now a security requirement.** R8. `productionRevocations`
   and `productionRateLimiter` join `TelemetrySource` on this invariant, and the two new ones
   fail *open* and *silently*.
10. **`--read-only` still forbids a writable store**, so nobody may "fix" the restart-forgets-
    revocations behaviour with a file. T4 writes that down so the temptation is pre-answered.
11. **Consider `--memory` on `docker run`** (D3). Not an auth fix once T1 lands, but a dashboard
    that can OOM the box whose thermal margin it exists to watch is worth one line in §2.5.

---

# Priority list

## MUST — before step 7 closes

- **M1. Fix F1 and F2 as one pair.** Add the canonical re-encode to `verifySessionToken`'s
  signature field (mirroring `scrypt.ts`'s `decodeField`), **and** rebuild
  `session.test.ts:121`'s alternate spelling deterministically as `ALPHABET[index ^ 1]` rather
  than hard-coding `A`/`B`, **and** split it into two tests with two names. Add the harness
  mutation for the new check and confirm it bites on repeated runs, not once. Fixing only the
  test is a decline: it leaves two contradictory base64url decoders and makes the property
  untestable.
- **M2. Take T1 — §5 lines 656 and 711.** Exact wording in Part 2. Then key the limiter globally
  and delete `sourceKeyOf`, `MAX_KEY_CHARS` and `UNKNOWN_SOURCE`. This closes F3, F4 and F5 with
  a net removal of code. **T2 must land with it, not after it.**
- **M3. Take T2 — require `Content-Type: application/json` on `POST /api/session`.** Free (the
  client already sends it), and it is a precondition of M2 rather than an independent hardening.
- **M4. Correct `session.ts`'s module doc.** The "no canonicalisation gap" sentence must say it
  is about the payload, now that the signature has its own check. HANDOVER: a wrong descriptive
  comment misinforms.

## SHOULD — in step 7's reconciliation

- **S-a. R3 — move `LOGIN_PATH` and `SESSION_PATH` into `lib/auth/login-view.ts`** and have
  `proxy.ts` and `login-form.tsx` import them. Three literals become one; step 8 gets a
  client-safe door.
- **S-b. F6 — wrap `handleSessionPost`'s limiter call and `handleSessionDelete`'s
  `liveSessionOf`.** Not because it is reachable today, but because the one 500 this module can
  produce renders as `Password not recognised.` on §5.2's own screen.
- **S-c. Take T5 and add the "could not reach the dashboard" branch** to `login-form.tsx`'s
  non-2xx/401/429 and `catch` paths, once the copy is in §5.2.
- **S-d. Make `verify` cold** — `rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run`, with
  `lib/guardrails.test.ts:126` updated in the same change. The false-pass is a worse failure
  direction than F1.
- **S-e. Add the determinism rule and the probabilistic-mutation rule to HANDOVER** (§5.2's
  ledger rules and the "do not copy" list). Part 4 has both sentences.
- **S-f. R4 — one unit for `MAX_BODY_BYTES`.** Rename to `MAX_BODY_CHARS` and drop the
  `content-length` comparison, or convert both to bytes.
- **S-g. One canonical base64url decoder** shared by `scrypt.ts` and `session.ts`, if M1 is
  implemented as a shared helper rather than three inline lines. Either shape is fine; two
  divergent implementations is not.

## DEFER — to a named step

- **D-i → step 8.** The `/login` countdown is sound and needs no jsdom; step 8 decides for its
  own timers whether jsdom finally earns its place. The `LoginForm` transition paths
  (`submitting → wrong`, `submitting → rate-limited`) remain untested at the DOM level and that
  is acceptable while `LoginCard` is pure and covered.
- **D-ii → step 10.** Keep the server-rendered shell free of telemetry and secrets. T4's
  proxy/route asymmetry is acceptable only while that holds.
- **D-iii → step 11.** O20 (T8), the unquoted `SESSION_SECRET` (T9), `dashboard.sh check`'s three
  assertions, the one-process guarantee (R8), and F7's product bound on the scrypt parameters —
  which belongs with `check`, since `check` is the thing that must explain a refused hash.
- **D-iv → step 11 / §2.5.** A container memory limit (D3). Raise on its own merits.
- **D-v → step 12.** Verify on the box that one container process serves every request, so the
  revocation store and the global limiter are actually global.

## EXPLICITLY NOT DOING

- **N1. F8 (`TRACE` → 500).** Not this project's code, not a session check, leaks nothing.
  Recorded, not acted on.
- **N2. F9 (trailing NULs).** Confirmed by me, OpenSSL behaviour, no impact. Keep the note.
- **N3. A scrypt-queue cap or admission controller** (D1/D2). T1's global bucket bounds the queue
  by construction; a cap is machinery that exists only because the key was wrong.
- **N4. Any per-source rate-limit key**, including a "best effort" one, until §2.5 gains a
  reverse proxy that overwrites `X-Forwarded-For`. A key the attacker controls and the defender
  does not is worse than no key.
- **N5. A `Secure` cookie or TLS** (D5). §5 chose plain HTTP explicitly and discloses it on the
  screen.
- **N6. A 400 for a malformed login body, or a form-encoded fallback** (D6/D7). The build's
  reasoning is right and I ratify it.
- **N7. Seeding, N-times repetition, or a source-text guard for test entropy.** Part 4 gives the
  reason for each. The rule is a reading rule.
- **N8. Editing anything.** No source, no test, no config, no spec was touched by this phase.
