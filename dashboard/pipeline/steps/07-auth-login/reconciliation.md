# Step 7 — Auth & login · **reconciliation**

Green: `pnpm verify` → **44 files, 1626 tests, exit 0**, under Node v24.16.0, and **20
consecutive runs, all exit 0** — because F1 was a 1-in-16 failure and three runs would not have
found it.

Six harnesses, **479 mutations**, every one bites; both ledgers that cover this step's files are
clean. `pnpm build` → exit 0, route table unchanged
(`ƒ /api/session`, `ƒ /login`, `ƒ Proxy (Middleware)`), `tsconfig.json` byte-identical
(`md5 8b6e358b0e19ad663d554dc8310c6da0`).

**The review is the plan of record and I did not deviate from it.** Two things it left to
judgement I decided one way rather than the other, and both are argued below: the shared
base64url decoder was taken as a *module* rather than as three inline lines (S-g), and the
limiter dropped its key **parameter** rather than passing a constant through it (M2). One
thing the review did not anticipate turned up while executing it, and it is the most
interesting result in this phase — see **§3, the N2 collapse**.

---

## 1. What changed

| File | Change |
|---|---|
| `lib/auth/base64url.ts` | **NEW, 57 lines.** The one canonical base64url decoder: alphabet, decoded length, re-encode. `scrypt.ts` and `session.ts` both use it |
| `lib/auth/session.ts` | The signature goes through `decodeExact` (**F2**). Module doc corrected: the no-canonicalisation-gap claim is about the *payload*, and the signature's own gap is described and closed (**M4**) |
| `lib/auth/session.test.ts` | The flaky test split in two, and the alternate spelling built as `ALPHABET[index ^ 1]` (**F1**) |
| `lib/auth/scrypt.ts` | `decodeField` deleted; uses the shared decoder |
| `lib/auth/rate-limit.ts` | **One global bucket, no key.** `sourceKeyOf`, `MAX_KEY_CHARS`, `UNKNOWN_SOURCE`, `SWEEP_AT`, the `Map` and its sweep all deleted (**F3/F4/F5**). 189 → 159 lines — the executable part roughly halved; the doc grew, because the deletion is the thing a future reader will want to undo |
| `lib/auth/handler.ts` | `Content-Type: application/json` required, **before** the limiter (**T2/R1**); the limiter call and `DELETE`'s verdict wrapped (**F6**); the body cap counts bytes on both sides (**R4**) |
| `lib/auth/login-view.ts` | Gains `LOGIN_PATH`, `SESSION_PATH` (**R3**), §5.2's sixth state and `UNREACHABLE_MESSAGE`, and `loginOutcome` — the response→state mapping lifted out of the component (**T5/F6**) |
| `proxy.ts` | Imports the two paths instead of exporting them; the exemption doc now quotes §5's enumeration |
| `app/login/login-form.tsx` | Uses `SESSION_PATH` and `loginOutcome`; a dead server no longer reads as a wrong password |
| `package.json` · `lib/guardrails.test.ts` | `verify` is **cold**: `rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run`, with the assertion that pins it updated in the same change (**S-d**) |
| `lib/auth/*.test.ts`, `app/**/*.test.*`, `proxy.test.ts` | **1603 → 1626 tests**: 24 added, one removed (§4a), one strengthened (§3) |
| `pipeline/steps/07-auth-login/regressions.py` | **98 → 113 mutations**: nineteen added, four retired with the code they aimed at, thirteen re-aimed |

**No dependency was added.** The count is still eight, all pinned. **`SPEC.md`, `MOCK.html` and
`PLAN.md` were not touched.**

---

## 2. The MUST list

### M1 — F1 + F2 as a pair. **Done, and the pair is the whole point.**

`session.ts` now decodes the signature with `decodeExact`, which re-encodes and compares byte
for byte. `session.test.ts:121` became two tests with two names:

- `⚠ a signature whose bytes differ by one bit does not verify` — flips a bit of the *decoded*
  tag and re-encodes, so the bytes really differ and the spelling is canonical. Only the HMAC
  comparison can refuse it.
- `⚠ a non-canonical spelling of a valid signature does not verify` — builds the alternate
  spelling with `ALPHABET[ALPHABET.indexOf(last) ^ 1]`, asserts the premise (a different
  string, identical bytes), and asserts the canonical token still verifies so the refusal is
  the spelling and nothing else.

**Measured, and this is the number that matters:** with the verifier reverted to
`Buffer.from(...)` + a length guard, the new test failed **20 runs out of 20**. The hard-coded
`A`→`B` flip the review warned about would have failed ~1 in 16. Determinism is not a
stylistic preference here — the harness cannot tell a probabilistic red from a sound one, so a
6 % mutation would have been reported as a clean ledger over a property that is almost never
checked.

Mutations added: **`E9`** (the verifier goes back to lenient decoding — reddens the new test
only) and **`S3` re-aimed** at `base64url.ts`, where it now reddens **both** consumers, which
is exactly the divergence that existed before.

### M2 — the global bucket (T1, already in §5 when this phase started)

`§5` now says the limit is global, so `rate-limit.ts` has **no key parameter at all**:
`attempt(nowMs)` and `clear()`. The review asked for "the key as a constant"; passing a
constant through a `Map` keeps the shape that invites re-keying and keeps a map that never
needs sweeping. Deleting the parameter makes globality **structural** — there is no argument a
future edit can vary — and it is what actually removed the forty lines: `sourceKeyOf`,
`MAX_KEY_CHARS`, `UNKNOWN_SOURCE`, `SWEEP_AT`, the `Map`, the sweep and its two tests.

The cost is one honestly-recorded gap: **"one bucket for the whole service" has no single-file
wrong implementation**, because restoring a per-source key is a two-file change and this
harness mutates one file per mutation. The two ⚠ tests that assert it live in
`handler.test.ts` and are kept non-inert by `P19` (a limiter built per request); that they
point at *global* rather than *per source* is carried by reading them. Recorded in the harness
docstring under "properties with no mutation", per §5.2's rule.

What is now proven by execution rather than by argument:

- `⚠ the lockout is global — a second source is refused by it too`, including a forged
  address;
- `⚠ a flood of invented sources still queues only five hashes` — a thousand attempts from a
  thousand claimed addresses reach the verifier **five** times. That is F3's 84.7-second
  denial closed by construction, with no queue cap and no admission controller (**N3**).

### M3 — `Content-Type: application/json`, and it is checked **first**

The order is the finding. §5 says the requirement exists so that "any page the operator's
browser happens to load" cannot "spend the login rate limit"; a check that ran *after* the
limiter would refuse the request and spend the budget anyway, which is the whole cost under
one global bucket. So it is step 1 of `POST`, and
`⚠ a refused content type does not spend the login budget` fires fifty CORS-simple requests
and then shows all five real attempts still available. `P16` is the mutation that moves the
check below the limiter; `P15` removes it; `P21` compares the header whole, which would break
`application/json; charset=utf-8`.

Parameters are allowed and the comparison is case-insensitive. Neither loosens the property:
no spelling of `application/json` is a CORS simple request.

### M4 — `session.ts`'s module doc

The "no canonicalisation gap to exploit" sentence now says **payload**, and a new section
states what the signature's gap was, that it was not a forgery vector (the tag space is
unchanged; revocation keys on `sid` inside the signed payload), and why the payload
deliberately does *not* get the same check — a non-canonical payload spelling changes the
signed input, so a check there is unreachable code with no possible mutation.

---

## 3. ⚠ The one thing neither the review nor I predicted: fixing F6 killed a mutation

`N2` — `export const DELETE = handleSessionDelete` — **stopped biting** the moment
`handleSessionDelete` wrapped its verdict in the `try`/`catch` F6 asked for.

The mechanism: under the alias, Next's `context` arrives as the deps, `readAuthConfig(undefined)`
throws — and the new catch swallows it. Both implementations then answer **204**, and the test
asserted only the status.

This is step 6's `N2` lesson arriving a second time in the same shape: *a test that asserts a
status both implementations produce cannot tell them apart.* HANDOVER's rule says the first
hypothesis is a weak test, not a bad mutation, and that is what it was. The test now passes a
context that is **shaped like real deps and would revoke**, and asserts the store stays empty:
the shipped handler uses the production deps, which have no `SESSION_SECRET` in the test
environment, so nothing verifies and nothing is revoked; an alias would have verified the
cookie against the secret in the context and pushed a `sid`.

Worth stating as a general shape, because it will recur: **adding a catch removes a
distinction.** Every `try`/`catch` added for a "never 500" rule makes two implementations
agree on a status that used to tell them apart, and any test asserting only that status
quietly goes inert. The harness is what caught it — a `DID NOT BITE` on a mutation nobody had
touched.

---

## 4. The SHOULD list

| # | Disposition |
|---|---|
| **S-a (R3)** | **Done.** `LOGIN_PATH`/`SESSION_PATH` moved to `lib/auth/login-view.ts`; `proxy.ts` and `login-form.tsx` import them; `proxy.test.ts` imports them from there too. Went further than the review asked, deliberately: `⚠ the two paths are defined once, here, and nowhere else spells them` reads both consumers' source and refuses a quoted `'/login'` or `'/api/session'` in either, and `⚠ this module imports nothing, which is what makes it client-safe` pins the property that makes the module importable from a browser bundle. Mutations `X9` and `W18`. Without the guard, "one definition" would have been true only until step 8 wrote its own |
| **S-b (F6)** | **Done**, both sites, and each has a test and a mutation (`P17`, `P18`). The limiter fails **closed** (401, the module's empty refusal); `DELETE` fails **open in the right direction** — it still clears the cookie, because refusing to log out is the wrong failure |
| **S-c (T5)** | **Done**, and larger than a branch. The mapping moved into `loginOutcome`, so §5.2's outcomes are a table test: three spellings of success (including the opaque redirect), 401 → *wrong*, 429 → the server's countdown, and five ways of not answering → *Could not reach the dashboard.* Mutations `W12`–`W17` |
| **S-d** | **Done.** `verify` is cold and `lib/guardrails.test.ts` was updated in the same change, with the reasoning in the test's own comment: a false red costs a bisect, a false pass ships the bug |
| **S-e** | **Done** — both rules are in the rewritten `HANDOVER.md` (§5.2 and §5.4) |
| **S-f (R4)** | **Done**, keeping both checks rather than dropping the `content-length` one: the early refusal has its own test and its own mutation (`P12`), and losing it to fix a unit mismatch would trade a real property for a cosmetic one. `text.length` became `Buffer.byteLength(text, 'utf8')`. New test + `P20` |
| **S-g** | **Done as a module.** `lib/auth/base64url.ts`. See below |

### 4a — the one test I removed, and why that is a finding rather than a deletion

`⚠ stale keys are swept on write, with no timer involved` went with the map it observed, and I
did **not** replace it with an equivalent over the global bucket. I tried: the replacement
asserted "unbounded attempts leave bounded state", and while writing its mutation I could not
find a wrong implementation it would catch — a limiter that kept every attempt for ever and
filtered at *decision* time behaves identically through `attempt`. That is a test whose name
over-claims its body, which is the defect this pipeline has now shipped seven times, so it was
written out rather than in.

What is left in its place is a comment in `rate-limit.test.ts` saying exactly that, and two
things that do carry the property: `⚠ the window slides` (the filter-on-write is what makes it
true, and `L7` reddens it), and `lib/guardrails.test.ts`'s source-text timer rule with `G1`.
The keyed limiter needed a sweep because its keys were attacker-chosen; the global one holds
two variables.

**Why the shared module rather than three inline lines.** The review allowed either and forbade
divergence. Inlining would have produced two *identical* implementations, which is the state
that diverged in the first place — `scrypt.ts` and `session.ts` were written a day apart by the
same phase. One definition also gives the harness one anchor: `S3` now reddens both consumers,
so the property is defended once instead of twice. It has **no test file of its own**, and that
is deliberate: every path through it is exercised from both sides by `scrypt.test.ts` (a
non-canonical salt, a short salt, a padded field) and `session.test.ts` (a non-canonical
signature, wrong lengths on both sides of 32). A third file would have restated the same three
cases in a third place.

---

## 5. Every finding, with its disposition

### The adversarial's nine

| # | Verdict | Disposition |
|---|---|---|
| **F1** | Real, MUST | **Fixed** as half of M1. Deterministic for every token, verified 20/20 |
| **F2** | Real, LOW | **Fixed** as the other half, in the verifier, via the shared decoder |
| **F3** | Real, MEDIUM | **Closed by construction** — the global bucket bounds the KDF queue at five pending. Not by a queue cap (**N3** declined, correctly) |
| **F4** | Real | **Closed** — the map is gone entirely |
| **F5** | Real, LOW | **Closed** — there is no `unknown` bucket, because there is no key |
| **F6** | Real, raised by the review | **Fixed**, both sites. And it turned out to have a second-order cost: §3 |
| **F7** | Real, LOW | **Deferred to step 11**, as the review ruled. The `LIMITS` guard still bounds memory and not time (measured 1 720 ms vs 58 ms at the worst accepted parameters). Carried in HANDOVER as an obligation on `dashboard.sh check`, which is the thing that has to explain a refused hash. Not fixed here because only the operator writes `PASSWORD_HASH`, and because F3's queue — the reason a slow hash mattered — is now bounded at five |
| **F8** | Real, not ours | **Explicitly not doing** (**N1**). `TRACE` → 500 is thrown by Node/Next before `proxy.ts` runs; it bypasses nothing and leaks nothing |
| **F9** | Real, informational | **No action** (**N2**). OpenSSL treats the password as NUL-terminated. The note is kept in `scrypt.ts` |

### The build's S21–S29

| # | Disposition |
|---|---|
| **S21** | **Resolved, and in the opposite direction to the one it proposed.** The build keyed on `X-Forwarded-For` and asked the spec for one line accepting it. §5 now says the key is *meaningless* on this deployment and makes the bucket global. The module doc records what was deleted and why |
| **S22** | Ratified. JSON only, 4 KiB — now genuinely 4 KiB (R4) — with §5's `Content-Type` requirement added on top |
| **S23** | Ratified. 204 always, cookie cleared unconditionally, revoked when valid, never rate-limited. Now also 204 when the verdict throws |
| **S24** | Ratified (**N6**). Every refusal is 401 with no body, including a wrong `Content-Type` |
| **S25** | Ratified. `/login?expired=1`, presence-checked. Step 8 must set the parameter, not a value |
| **S26** | Ratified (**D8**) |
| **S27** | Ratified. A refused attempt is not recorded; success clears |
| **S28** | Ratified as a decision, **and its obligation is now spec text**: §5.1 says scrypt and names the exact encoding. O20 is carried into HANDOVER as a load-bearing step-11 obligation |
| **S29** | Ratified, with the quoting caveat now in §5.1. Carried into HANDOVER: Docker's `--env-file` does not strip quotes, so a quoted 32-character secret passes the floor as a different secret |

### The review's own findings

| # | Disposition |
|---|---|
| **R1** | = T2. **Done** (M3) |
| **R2** | = T5. **Done** (S-c) |
| **R3** | **Done**, with a guard (S-a) |
| **R4** | **Done** (S-f) |
| **R5** | **Vanished with M2**, exactly as the review predicted: there is no key to compute twice |
| **R6** | **Vanished with M2**: `rate-limit.ts` has no `SWEEP_AT` any more, so there is only one |
| **R7** | Ratified — `revocations.ts` is sound, and §5 now states what it does and that a restart forgets it |
| **R8** | **Carried into HANDOVER as a security obligation on step 11**, promoted from performance, with the third global (`productionRateLimiter`) named. A new ⚠ test pins the mechanism it rests on: `⚠ each limiter is its own bucket, so a second instance doubles the limit` |
| **R9** | Ratified. The module count went to ten (`base64url.ts`), and the two loadbearing splits (`session`/`authorize`, `login-view`/`login-form`) are untouched — the second one is what made T5 testable |
| **R10** | The two non-conformances are closed: the rate limit is global (§5 rewritten), and §5's "only route" sentence is now an enumeration the gate matches exactly |
| **R11** | Ratified. The "weak where it is about identity of the caller" root is treated by T1 + T2, both landed |
| **R12** | Step 8 composes cleanly, and R3 was the only blocker |

### The review's eight declines, and its eight "explicitly not doing"

All honoured, none re-litigated: **D1**/**D2** (queue cap, 503 shed path) — the global bucket
bounds the queue, and a shed path would be a seventh §5.2 state with no copy. **D3**
(`--memory`) — carried to step 11 on its own merits. **D4** (`TRACE`). **D5** (`Secure`/TLS) —
a test still pins the cookie's absence of `Secure`, so the day TLS arrives it is a deliberate
change. **D6** (a 400 for a malformed body). **D7** (form-encoded fallback) — and §5's
`Content-Type` requirement now makes JSON-only a *stated* contract rather than an
implementation choice. **D8** (redirect an authenticated visitor away from `/login`).
**N1**, **N2**, **N3**, **N4** (no per-source key at all, until §2.5 gains a proxy that
overwrites the header), **N5**, **N6**, **N7** (no seeding, no N-times repetition, no
source-text guard for entropy — the rule is a reading rule, and it is in HANDOVER).

### Deferred, with owners

**D-i** → step 8 (jsdom, and `LoginForm`'s transitions at the DOM level — narrowed: the
response mapping is now covered without one). **D-ii** → step 10 (the shell carries no
telemetry). **D-iii** → step 11 (O20, the unquoted secret, `dashboard.sh check`'s three
assertions, R8, F7's product bound). **D-iv** → step 11 (`--memory`). **D-v** → step 12 (one
container process on the box).

---

## 6. Spec gaps — for the owner (invariant 7)

Nothing here blocked the step. `SPEC.md` was not edited.

| # | Gap |
|---|---|
| **S30** | **§5.2's sixth row has no `data-sev` tone.** The table fixes the copy and the submit state for *Could not reach the dashboard.* but not its emphasis. `warn` was chosen — it is a condition of the *server*, like *Session expired*, not a rejection of the credential like *Wrong password* — and `MOCK.html`'s state C predates the row, so there is no reference rendering for it. One word in §5.2 would settle it |
| **S31** | **§5 does not say whether a refused `Content-Type` counts against the rate limit.** It says the requirement exists so a visited page cannot "spend the login rate limit", which decides it — the check must come *first* — but the ordering is inferred from the rationale rather than stated. One clause ("checked before the limit, so a refused grammar spends nothing") would make it explicit, and it is the kind of ordering a later refactor moves without noticing |
| **S32** | **§5.2 does not say what the screen does while it cannot reach the dashboard.** Submit stays enabled, which the spec does say — but a client that retries into a dead server sees the same sentence with no indication anything changed. Step 8 owns retry behaviour for *polling*; whether the login screen should back off at all is unstated. Recorded rather than invented: the current behaviour is one attempt per click, which is honest |
| **S33** | **§5 requires `Content-Type: application/json` but does not say whether the *client* may send parameters.** `application/json; charset=utf-8` is accepted here, and the reasoning is in `handler.ts` — but a stricter reading of §5 ("requires `Content-Type: application/json`") would refuse it, and refusing it would be a login screen that works in one browser and not another. Worth one parenthesis |

**Carried forward, unchanged:** S11/G5 (steps 9/10), S19, S20 (both non-blocking), and F7's
observation that `LIMITS` bounds memory rather than time (step 11).

---

## 7. Evidence

### `pnpm verify`, cold, under the pinned Node

```
$ export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
$ node -v
v24.16.0
$ pnpm verify
> ai-dashboard@0.1.0 verify
> rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run

 Test Files  44 passed (44)
      Tests  1626 passed (1626)
Type Errors  no errors
   Duration  3.22s (tests 66%, transform 18%, import 12%, typecheck 2%, worker 1%)

exit=0
```

### Twenty consecutive runs

```
run 1  exit=0       Tests  1626 passed (1626)
run 2  exit=0       Tests  1626 passed (1626)
…
run 19 exit=0       Tests  1626 passed (1626)
run 20 exit=0       Tests  1626 passed (1626)
PASS=20 FAIL=0
```

Every run deleted `tsconfig.tsbuildinfo` first, so all twenty were cold typechecks.

### The F1 fix, proved the way the review asked for

```
# verifier reverted to Buffer.from(...) + a length guard:
runs=20 failed_without_fix=20
```

**20 out of 20**, not 1 in 16. The mutation that re-introduces the defect is `E9`, and the
harness records it reddening exactly one test:

```
--- E9 the signature is decoded leniently again, so 1 tag in 16 has four accepted spellings
    exit=1  Tests  1 failed | 38 passed (39)  red=1
      FAIL  lib/auth/session.test.ts > what it takes to forge one >
            ⚠ a non-canonical spelling of a valid signature does not verify
```

…and `S3`, at the shared decoder, reddening **both** consumers — which is the divergence that
existed before:

```
--- S3 the shared decoder drops its canonical re-encode — Buffer.from is lenient
    exit=1  Tests  2 failed | 70 passed (72)  red=2
      FAIL  lib/auth/scrypt.test.ts  > ⚠ a non-canonical base64url field is rejected even when …
      FAIL  lib/auth/session.test.ts > ⚠ a non-canonical spelling of a valid signature does not …
```

### The six harnesses

| harness | mutations | result |
|---|---|---|
| `02-format-severity` | 40 | exit 0 |
| `03-collectors-gpu-host` | 64 | exit 0 |
| `04-collector-cooling` | 76 | exit 0 — ledger: 163 red tests, 66 ⚠ checked |
| `05-collectors-serving-storage-safety` | 127 | exit 0 — ledger: 183 red tests, 94 ⚠ checked |
| `06-telemetry-route` | 59 | exit 0 — ledger: 85 red tests, 53 ⚠ checked |
| `07-auth-login` | **113** | exit 0 — ledger: **182 red tests, 103 ⚠ checked** |
| | **479** | |

```
Red-test ledger: 182 distinct failing tests across 113 mutations; 103 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 113 regressions failed their check, as they must.
```

**Every new mutation reddens the test it was written for, and only sensible neighbours.** The
ones that matter:

```
--- P16 Content-Type is checked AFTER the limiter, so a CORS simple request spends the budget
    exit=1  red=1   ⚠ a refused content type does not spend the login budget
--- P17 the limiter call is unwrapped, so a throwing limiter is a 500 §5 forbids
    exit=1  red=1   ⚠ a limiter that throws is a 401, never a 500
--- P18 DELETE's verdict is unwrapped, so a throwing store is a 500 instead of a logout
    exit=1  red=1   ⚠ a revocation store that throws still logs the browser out with 204
--- P19 a limiter is built per request, so §5's five per minute counts nothing at all
    exit=1  red=9   ⚠ the lockout is global …  ⚠ a flood of invented sources still queues five
--- P20 the body cap counts UTF-16 code units again
    exit=1  red=1   ⚠ the body cap counts bytes, not UTF-16 code units
--- W13 every unexpected status is a wrong password again
    exit=1  red=4   ⚠ it is not a wrong password — a 500 / a 502 / a 404 / a 403
--- W15 the opaque-redirect spelling of success is dropped
    exit=1  red=1   ⚠ it is a successful login … — an opaque redirect
--- X9 the gate spells the two paths itself
    exit=1  red=1   ⚠ the two paths are defined once, here, and nowhere else spells them
--- N2 DELETE is aliased the same way            ← biting again after §3's stronger test
    exit=1  red=1   ⚠ DELETE ignores the context argument too
```

### `pnpm build`

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/session
├ ƒ /api/telemetry
└ ƒ /login

ƒ Proxy (Middleware)
exit=0
```

`tsconfig.json` byte-identical before and after (`md5 8b6e358b0e19ad663d554dc8310c6da0`).

### What was NOT run

The box. Step 7 needs it for nothing, and invariant 2 was not approached: no `systemctl`, no
hwmon write, no `set-model`. No live standalone server was started in this phase either — the
build phase's end-to-end run stands, and every behaviour changed here is covered in-process.
`git commit` was not run.
