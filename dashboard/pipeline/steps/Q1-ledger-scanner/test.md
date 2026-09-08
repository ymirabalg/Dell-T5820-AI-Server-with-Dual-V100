# Q1 — back-port the corrected ⚠-scanner — TEST

Branch `dashboard-frontend`. Read the handoff (`pipeline/handoffs/Q1-test-phase.md`), `build.md`,
`ANCHOR.md` §4/§5/§8, `PLAN.md`. Everything below was checked directly against the tree, not
assumed from `build.md`'s prose. One fix was made (§3.2); everything else is a clean result with
its evidence.

---

## 3.1 The three new mutations — S11, K8, W19

Method: for each, applied the mutation **manually** (Python string-replace on the exact
before/after text `build.md` and `regressions.py` claim) with the tree otherwise clean, ran
`pnpm vitest run <affected file(s)>` directly, read the actual FAIL output, then reverted with
`git checkout --`. This is more granular than the harness's own summary (which only prints the
first 3 FAIL lines per mutation) and does not touch the harness at all, so there was never a risk
of two harnesses or a harness-plus-verify running concurrently. `git status` was checked clean
after every revert.

### S11 — `lib/auth/scrypt.ts`, removing `if (stored === null) return false;`

Traced `parseScryptHash`: all 5 fixtures in the target test (`''`, an argon2id string, a
5-field truncated line, `logN=30` (over the `max: 20` bound), and `'.....'`) fail one of
`parseScryptHash`'s own total checks (field count, tag, decimal bounds) and return `null` —
confirmed by inspection of `decimal()` and the field-count/tag checks, not assumed. With the
guard removed, `stored.salt` on the very next line dereferences `null`.

Ran it:

```
❯ lib/auth/scrypt.test.ts (33 tests | 5 failed)
  × ⚠ verification of an empty hash resolves false rather than throwing
  × ⚠ verification of an argon2id hash resolves false rather than throwing
  × ⚠ verification of a truncated line resolves false rather than throwing
  × ⚠ verification of a hash with impossible costs resolves false rather than throwing
  × ⚠ verification of a hash of only separators resolves false rather than throwing
Caused by: TypeError: Cannot read properties of null (reading 'salt')
 ❯ verifyPassword lib/auth/scrypt.ts:283:52
```

All 5 rows of the mark's `test.each` reddened, deterministically (no timing, no randomness —
`parseScryptHash` is pure and the dereference either throws or doesn't, every time). **Plausible**:
a one-line omission a refactor could make while inlining the null check into a non-null
assertion. Not equivalent (behaviour genuinely changes: resolved `false` → rejected promise),
not probabilistic. Verdict: **sound**.

### K8 — `lib/auth/cookie.ts`, removing the type/empty guard in `readCookie`

This is the one the handoff singled out for the prefix-matching risk, so it got the most
scrutiny. Ran **both** target files in one `vitest` invocation (matching exactly how the harness
invokes it — `checks = [COOKIE, SESSION]` becomes one `pnpm vitest run <file> <file>` call):

```
❯ lib/auth/cookie.test.ts (23 tests | 2 failed)
  × ⚠ answers null for no header at all, and never throws
  × ⚠ answers null for an undefined header, and never throws
❯ lib/auth/session.test.ts (39 tests | 1 failed)
  × ⚠ no session is found on the request — no cookie header

FAIL lib/auth/cookie.test.ts > ... > ⚠ answers null for no header at all, and never throws
TypeError: Cannot read properties of null (reading 'split')
 ❯ readCookie lib/auth/cookie.ts:64:29

FAIL lib/auth/session.test.ts > ... > ⚠ no session is found on the request — no cookie header
TypeError: Cannot read properties of null (reading 'split')
 ❯ readCookie lib/auth/cookie.ts:64:29
 ❯ verifiedSessionOf lib/auth/session.ts:196:22
```

This settles the specific worry: the `session.test.ts` failure carries its **own** stack trace
through `verifiedSessionOf`, distinct from and independent of the `cookie.test.ts` failure — it
is not the ledger's substring match crediting one file's FAIL line to the other's mark. Both
marks genuinely and independently redden under this one mutation, for the reason `build.md`
gives: `verifiedSessionOf` calls `readCookie` with whatever `request.headers.get('cookie')`
returns, and the `'no cookie header'` fixture is exactly `null`, hitting the same removed guard
a second time from a second call site.

I also checked the *un*-reddened rows for a false negative in the other direction: of
`cookie.test.ts`'s 11-row block, only `null` and `undefined` reddened (2 of 11) — every other
row is already a non-empty string and never touched the removed guard, confirmed by re-reading
`readCookie`'s remaining body (the `for` loop over `header.split(';')` handles `''`, `'a=b;
;=;x'` etc. without needing the guard). That is expected and is exactly what `build.md` says
("one row failing is sufficient... the other two fixtures... stay covered by ordinary
correctness"); it is not a sign of a weak mutation, since the ledger only requires one row per
`test.each` block to redden.

Verdict: **sound, and the two-mark claim is real, not a scanner artefact.**

### W19 — `lib/auth/login-view.ts`, dropping `.trim()` before the `Retry-After` regex

```
❯ lib/auth/login-view.test.ts (43 tests | 1 failed)
  × ⚠ Retry-After parses as whole seconds — padded by a proxy

FAIL ... > ⚠ Retry-After parses as whole seconds — padded by a proxy
AssertionError: expected null to be 30
```

Exactly the one row (`' 30 '` → `30`) reddened; the other three (`'60'`, `'1'`, `'0'`) are
already unpadded and pass the regex with or without `.trim()`. Deterministic, and a forgotten
`.trim()` on a hand-rolled header parser is an entirely ordinary slip. Verdict: **sound**.

**Summary for 3.1: all three mutations are plausible wrong implementations, redden
deterministically, and redden the specific test their name claims. No equivalent or
probabilistic mutation found. K8's two-mark claim is genuine, evidenced by two independent stack
traces through two different call sites, not a ledger substring collision.**

---

## 3.2 The four renamed test names

Read each renamed test's full body against its new name.

| file | new name | body checked | verdict |
|---|---|---|---|
| `lib/collectors/collect.test.ts` | `⚠ ROOT_MOUNT and HOME_MOUNT ignore a blank value — the %s case` | sets **both** `ROOT_MOUNT` and `HOME_MOUNT` to the same blank value, expects `DEFAULT_PATHS` (both defaulted) | accurate |
| `lib/auth/config.test.ts` | `⚠ STANDING means nothing is standing, never an empty id — %s` | `readStandingList` on unset/empty input, expects `[]` | accurate |
| `lib/client/wire.test.ts` | `⚠ an impossible calendar date is refused, never rolled forward — %s` | 4 impossible-but-`Date.parse`-accepted timestamps, expects `parseSnapshot` → `null` | accurate |
| `lib/collectors/safety.test.ts` | (old) `⚠ a `no` spelled a form `ufw` itself never writes reads unknown — %s` | asserts `parsed.value` is `null` (not `false`), severity is `watch`, one problem recorded | **broken grammar, fixed — see below** |

Three of the four renames are clean and describe exactly what the body checks. The fourth is a
genuine finding: **"a `no` spelled a form `ufw` itself never writes reads unknown"** does not
parse as English — it reads like two clauses spliced without the words that join them ("in a
form", "reads **as** unknown"). It's exactly the kind of defect the handoff warned a rename is a
chance to introduce ("a test that names a property it does not check has appeared in every
single step") — here the property is checked correctly, but the *name* fails to communicate it
to a reader.

**Fixed.** Changed the name to:

```
⚠ a `no` spelled in a form `ufw` itself never writes is unknown, not the alarm — %s
```

This is the old (pre-rename, working) sentence — `"⚠ %s `no` is unknown, not the alarm — the
accepted form is the one `ufw` writes"` — restructured so the placeholder falls at the end
(needed for the scanner's ≥12-character-prefix rule) without losing either clause ("is unknown"
/ "not the alarm") that the body actually asserts (`toBeNull()` / `.not.toBe(false)`).
Re-ran `pnpm vitest run lib/collectors/safety.test.ts`: 34/34 pass, same test count, only the
title text changed. Confirmed the new prefix is 80 characters (`name.split('%')[0].strip()`),
well over the scanner's 12-character floor, so this does not create a new `!!! unmatchably
short` warning. Grepped the whole tree for the old string — the only two occurrences were the
test file itself and `build.md`'s own diff table (a historical record, left as-is; `build.md` is
not something this phase edits).

---

## 3.3 The dropped ⚠ — `lib/auth/session.test.ts`, "the token verifies as null rather than throwing"

The parent verified the backstop (`E2`, a validly-signed non-JSON payload) exists and is
mutation-backed. What was **not** yet independently verified: that all 11 fixtures in the block
this mark used to cover are rejected before `JSON.parse`, for every single-line mutation, not
just the ones already in the harness.

Traced `verifySessionToken` against each of the 11 fixtures by hand (`null`, `''`, `'justoneblob'`
(no dot), `'.signature'` (leading dot), `'payload.'` (trailing dot), `'a.b.c'` (two dots), `'!!!!.
AAAA'` (payload outside the alphabet), `'AAAA.!!!!'` (signature outside the alphabet), a
23-char single-blob "truncated token" with no dot at all, `'...'`, and the 64 KiB blob whose
43-`B` signature decodes to exactly 32 bytes but fails `decodeExact`'s canonical-re-encode
check). For each, I asked: if exactly **one** guard in the chain (the dot-placement check,
`BASE64URL.test(payload)`, `decodeExact`'s alphabet check, its length check, its re-encode check,
or the `timingSafeEqual` signature comparison) is weakened or removed, does this specific fixture
reach `JSON.parse`?

The answer is no in every case I traced, and for a structural reason, not eleven separate
coincidences: **each fixture is over-determined** — it fails at least two of these checks
independently (e.g. `'a.b.c'` fails the dot-placement check *and*, if that's bypassed, its
resulting mis-sliced payload/signature fails `decodeExact`'s length check anyway). The closest
call is the 64 KiB blob: even with the re-encode check removed (which is `S3`'s actual mutation,
already in the harness, run against exactly this file), `decodeExact` would then return a real
32-byte buffer, but it's the decode of `'B'.repeat(43)` — arbitrary bytes with no relationship to
the real HMAC of `'A'.repeat(65536)` under the test's secret — so `timingSafeEqual` still refuses
it deterministically. I confirmed `S3`'s own target line lives in `base64url.ts` and its checks
list is `[SCRYPT, SESSION]`, i.e. it does run against this exact file, and it does not appear in
`uncovered` for this mark — consistent with the trace, not contradicting it.

Reaching `JSON.parse` **with a wrong result** (not just reaching it and having the outer `catch`
paper over a `SyntaxError`, which the test would not even notice — `.not.toThrow()` would still
hold) needs the signature check bypassed **and** a fixture whose payload happens to decode to
valid JSON shaped like a session; none of the 11 do, by construction (most decode to binary
garbage or an empty string). This confirms `build.md`'s claim: reddening this mark needs at
least two independent defects composed, which is outside what a single plausible mutation can
express, and outside what the harness's own rules permit inventing.

**Verdict: the drop was correct.** No fixture reaches the fallible path by a single plausible
defect. I did not restore the mark.

---

## 3.4 The scanner itself — adversarial read of `_skip_balanced` and `marked_tests()`

Reproduced the exact scanner (byte-identical across all eight `regressions.py`, confirmed by the
parent's md5) in a standalone script and ran it against **all 62** `.test.ts(x)` files reachable
from every step's `LEDGER_FILES` (1432 `test`/`it` calls, 123 of them `.each`). Zero anomalies:
`_skip_balanced` never returned `None`, every `.each(...)` skip landed on a following `(`, and no
`!!! unmatchably short` warning fired anywhere in the corpus.

Then went looking for the specific hazards the handoff named, by grep and by hand:

- **A regex literal containing a quote character, inside a `.each([...])` fixture array.** This
  would break the naive scanner: `_skip_balanced` treats any `'`/`"`/`` ` `` character as the
  start of a string with no awareness that it might be sitting inside a regex literal instead,
  so it would swallow everything up to the *next* occurrence of that quote character anywhere
  later in the array, shifting where the test name is found. **Real instances exist in this
  codebase** — `lib/auth/login-view.test.ts:242-243` (`/['"]\/login['"]/`) and
  `lib/client/guardrails.test.ts:110,140` (`/['"]gpu-fan-control...['"]/`,
  `/(?<![.\w$'"]).../`) — **but every one sits inside a plain `test('name', () => {...})`
  callback body, never inside a `.each([...])` fixture array.** `_skip_balanced` is only ever
  invoked to skip a `.each(...)` argument list; for a plain `test(`/`it(` call the marked name is
  read immediately after the opening paren, before the callback (and its regexes) are reached.
  So this hazard is real but **not currently triggered** anywhere in the eight steps.
- **A nested template literal** (a backtick containing another backtick inside a `${…}`). Grepped
  for the shape across every ledger file — none found.
- **`test.skip(`/`test.only(`/`.concurrent(`/`.todo(`.** The `CALL` regex only recognises bare
  `test(`/`it(`/`test.each(`/`it.each(`; any of these modifiers would silently fall outside it,
  with no warning — the same failure shape as the bug Q1 exists to fix. Grepped for all of them
  across every ledger file — none found.
- **A backtick-quoted test title itself** (e.g. `` test(`${x} is not a reading`, ...) ``), which
  `FIRST_STRING` cannot match at all (its character class is `['"]` only, deliberately excluding
  `` ` ``). **Five real instances exist** — `lib/collectors/numbers.test.ts:50,90,115,156` and
  `lib/collectors/proc.test.ts:516` — all using a `for (const x of …) test(\`${x}...\`, …)`
  pattern rather than `test.each`. I read all five: **none carries a ⚠.** So today this causes no
  missed mark, but it is a live blind spot of the same shape as the defect Q1 back-ported a fix
  for — a future test written this way with a ⚠ in its name would be silently invisible to the
  ledger, with no warning of any kind (not even the "unmatchably short" print, since the call is
  skipped before a prefix is ever computed).

Per the handoff's own instruction not to fix a theoretical hole no fixture triggers, **none of
these were changed.** Recorded here so they don't have to be rediscovered: the scanner's
soundness currently rests on "no marked test uses a `.each` fixture containing a raw quote-bearing
regex, and no marked test is named with a template literal," which holds today but is not
enforced by anything.

---

## What was changed, and why

| file | change | reason |
|---|---|---|
| `lib/collectors/safety.test.ts` | one `test.each` title reworded (line ~226) | the %s-repositioning rename in the build phase produced ungrammatical text that no longer clearly stated what the test checks (§3.2) |

Nothing else was touched. No mutation was added, removed, or re-aimed — the three new mutations
and the one drop all stood up to independent, from-scratch verification. `SPEC.md` untouched.
No file outside `dashboard/` touched. No commit made.

## Gaps / spec silence

None found. This item is entirely internal to the harnesses and four test names; it never
touches product behaviour or `SPEC.md`. The scanner blind spots in §3.4 are process/tooling
findings, not spec gaps — recording them here rather than inventing a spec citation for them
(invariant 7).

## Final state

```
$ pnpm verify
 Test Files  67 passed (67)
      Tests  2210 passed (2210)
Type Errors  no errors
EXIT: 0
```

(Same 67/2210 as the build phase's handover — the one renamed test is still one test, not a new
one.)

```
$ git status --short
 M lib/auth/config.test.ts
 M lib/auth/session.test.ts
 M lib/client/wire.test.ts
 M lib/collectors/collect.test.ts
 M lib/collectors/safety.test.ts
 M pipeline/steps/02-format-severity/regressions.py
 M pipeline/steps/03-collectors-gpu-host/regressions.py
 M pipeline/steps/04-collector-cooling/regressions.py
 M pipeline/steps/05-collectors-serving-storage-safety/regressions.py
 M pipeline/steps/06-telemetry-route/regressions.py
 M pipeline/steps/07-auth-login/regressions.py
 M pipeline/steps/08-client-runtime/regressions.py
?? pipeline/handoffs/Q1-ledger-scanner-backport.md
?? pipeline/handoffs/Q1-test-phase.md
?? pipeline/steps/Q1-ledger-scanner/
```

Same 12 modified files as the build phase's handover, plus this phase's one additional line in
`lib/collectors/safety.test.ts`, plus this deliverable and the handoff file the parent wrote for
this phase. No stray mutation anywhere — checked after every manual mutation/revert cycle above,
and no `regressions.py` harness was run in this phase (targeted `vitest` runs on named files were
used instead, which is strictly narrower and never touches more than the one or two files named
on the command line). No commit made, per the handoff's rule 2.
