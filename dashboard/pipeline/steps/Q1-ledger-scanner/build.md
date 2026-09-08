# Q1 — back-port the corrected ⚠-scanner, re-run all seven, adjudicate — BUILD

Branch `dashboard-frontend`. Nothing outside `dashboard/` changed. No commit made — the tree
is left dirty for the parent, per the handoff.

---

## 1. Before/after table — measured by this run, next to §10.1's prediction

The scanner was back-ported verbatim (`CALL`, `FIRST_STRING`, `_skip_balanced`,
`marked_tests()`) from `pipeline/steps/09-ui-primitives/regressions.py` into all seven of
steps 2–8's `regressions.py`, byte-identical across all seven (diffed to confirm). Only
`LEDGER_FILES` differs between them, as required. Each harness was then run to completion,
one at a time, nothing else touching the tree concurrently.

> ⚠⚠ **CORRECTED BY THE RECONCILIATION, 2026-09-07. Two rows and both totals below were
> wrong, and the way they were wrong is the interesting part — see the note under the table.**
> The table is left in its original form with the corrections marked, per this project's rule
> that a wrong number is amended in place rather than quietly replaced.

| step | mutations | old scanner marks | new scanner marks | measured Δ | §10.1 predicted Δ | agree? |
|---|---:|---:|---:|---:|---:|---|
| 02-format-severity | 55 | 11 | 13 | **2** | 2 | yes |
| 03-collectors-gpu-host | 72 | 22 | 24 | **2** | 2 | yes |
| 04-collector-cooling | 92 | 83 | 83 | **0** | 0 | yes |
| 05-collectors-serving-storage-safety | 127 | 94 | 97 | **3** | 3 | yes |
| 06-telemetry-route | 63 | 56 | 56 | **0** | 0 | yes |
| 07-auth-login | 125 → **128** | 108 | ~~129 → 128~~ **131 → 130** | ~~21~~ **23** | 21 | **no** — see below |
| 08-client-runtime | 172 → **173** | 210 | 219 | **9** | 9 | yes |
| **total** | ~~706 → 709~~ **→ 710** | 584 | ~~621 → 620~~ **623 → 622** | ~~37~~ **39** | **37** | **no** |

### ⚠ Why "every count matches the prediction exactly" was the wrong conclusion

This section originally read: *"Every step's raw invisible-mark count matches §10.1's predicted
column exactly — no disagreement to call out on the counting."* That agreement was not evidence.

**§10.1's predicted column was produced by running step 9's scanner. This build measured with
the same scanner, back-ported. Both are blind to `test.each<T>(…)`** — a generic type argument
between `.each` and its `(` defeats the `CALL` regex so completely that it matches nothing at
all and takes none of the scanner's skip paths, so nothing is printed either. Two numbers that
agree because they share a defect are one number computed twice.

Q1's adversarial phase (F1) found it, and the reconciliation reproduced it independently. Two ⚠
marks in `lib/auth/login-view.test.ts` (`:78` and `:110`, six rows each) are inside step 7's
`LEDGER_FILES` and were invisible to the pre-Q1 regex **and** to the back-ported one. So the true
invisible-mark count is **39, not 37**, and step 7's is **23, not 21**. Both marks turned out to
be backed incidentally, and step 7's re-run after the fix reports **130 ⚠-marked tests checked**,
every one reddened, exit 0.

Step 8's mutation count also moved, 172 → **173**: the reconciliation's re-run exposed a
genuinely inert ⚠ mark that this build's four renames had unmasked and that nobody re-ran step 8
to see. `W21` backs it. See §7 below, and `reconciliation.md` §4.

Steps 04 and 06 gained no marks — their fixtures never had a multi-line `test.each` to begin
with, so the old and new scanners agree by construction. This matches §10.1's table exactly
(both listed as 0 invisible).

## 2. Every newly-exposed unreddened ⚠ mark

Six of the seven steps' newly-visible marks (02, 03, 04, 05, 06, 08 — 35 marks total) were
**already backed incidentally**: some existing mutation elsewhere in that harness happened to
redden them, and the harness's own ledger check confirmed it on the first run (exit 0, "Every
⚠-marked test went red under at least one mutation"). No action was needed on any of those 35.

**07-auth-login was the one real find**: its first run (125 mutations, unmodified from the
back-port) exited 1 with **5 unbacked ⚠ marks**. Each was individually investigated by tracing
every guard the mark's fixtures pass through, to establish whether a *single, plausible* wrong
implementation exists that would redden it — not by guessing mutations until the ledger went
green (forbidden by the handoff and by HANDOVER §5.2 rule 3).

| # | file | mark | disposition |
|---|---|---|---|
| 1 | `lib/auth/scrypt.test.ts` | `⚠ verification of %s resolves false rather than throwing` | **fixed** — new mutation `S11`, ⚠ **renamed `SC1` by the reconciliation** (F5: `S11` is an open work-item id) |
| 2 | `lib/auth/cookie.test.ts` | `⚠ answers null for %s, and never throws` | **fixed** — new mutation `K8` |
| 3 | `lib/auth/session.test.ts` | `⚠ no session is found on the request — %s` | **fixed incidentally** — backed by the same `K8` |
| 4 | `lib/auth/session.test.ts` | `⚠ the token verifies as null rather than throwing — %s` | **dropped** — no plausible single wrong implementation exists (see below) |
| 5 | `lib/auth/login-view.test.ts` | `⚠ Retry-After parses as whole seconds — %s` | **fixed** — new mutation `W19` |

### #1 — `S11` (now `SC1`), `lib/auth/scrypt.ts`

`parseScryptHash` (and the shared `decodeExact` it calls) is total — it returns `null` for
every malformed hash in the fixture, never throws. The one line standing between that and
`verifyPassword` throwing is the guard that reads its result:

```python
# added to REGRESSIONS in pipeline/steps/07-auth-login/regressions.py
("S11 the parsed-hash null check is dropped, so a malformed encoded value throws",
 SCRYPT_SRC, "  if (stored === null) return false;\n", "", [SCRYPT]),
```

Removing it makes `stored.salt` (the very next line) throw `TypeError: Cannot read
properties of null` for all five fixtures, turning `verifyPassword`'s resolved `false` into
a rejected promise — exactly what the mark's name claims a wrong implementation would do.
This is a one-line omission a refactor could plausibly make (e.g. inlining `stored!.salt`
and dropping the `!` under time pressure, or moving the check without noticing it guards a
dereference three lines down).

### #2 and #3 — `K8`, `lib/auth/cookie.ts`

`readCookie`'s first line is a total-input guard:

```python
("K8 the type/empty guard is dropped, so a null or undefined header throws",
 COOKIE_SRC, "  if (typeof header !== 'string' || header === '') return null;\n", "",
 [COOKIE, SESSION]),
```

Removing it makes `readCookie(null, …)` throw at `header.split(';')`. That backs **two**
marks with one mutation, because `verifiedSessionOf` calls `readCookie` directly with
whatever `request.headers.get('cookie')` returns — including `null` for "no cookie header
at all", one of `session.test.ts`'s three fixtures. The other two fixtures in that block
(`'other=1'`, a junk cookie value) don't reach this guard at all — they're valid strings —
so they stay covered by ordinary correctness, not by this mutation; one row failing is
sufficient to back the whole `test.each` mark (the ledger matches on the shared prefix, not
per-row).

### #4 — dropped, `lib/auth/session.test.ts`

This is the one mark this build **removed** rather than backed, per HANDOVER §5.2 rule 1's
second branch: *"the property has no plausible wrong implementation, in which case drop the
⚠ rather than the standard."*

`verifySessionToken` is doubly guarded for every one of the eleven fixtures in this block
(`null`, empty string, no/leading/trailing/double dot, out-of-alphabet payload or signature,
a truncated token, `'...'`, and a 64 KiB blob): the dot-placement check, `BASE64URL.test`,
and `decodeExact` (alphabet + length + canonical-re-encode, all in `base64url.ts`, all
themselves total — proven by inspection, not assumed) reject every one of them **before**
the only operation in the function that can throw at all, `JSON.parse`. Reaching
`JSON.parse` additionally requires a signature that verifies against a real HMAC of the
payload under `SECRET` — something none of these eleven un-signed fixtures can produce
without the secret itself. Traced case by case (including the 64 KiB blob, the one fixture
structurally closest to slipping through: its signature decodes to exactly 32 bytes but
fails the canonical-re-encode check, confirmed with `Buffer.from('B'.repeat(43),
'base64url').toString('base64url') !== 'B'.repeat(43)`), no single-line mutation anywhere
in the guard chain makes any fixture reach `JSON.parse`, let alone throw there. Reddening
this mark mechanically would need at least two independent defects at once (e.g. bypass the
signature check *and* remove the outer catch) — not something the handoff or HANDOVER §5.2
rule 3 permits manufacturing.

The outer catch's real job — a **validly-signed** payload that isn't JSON — already has its
own dedicated test right below this one (`'⚠ a validly signed payload that is not JSON is a
null, not a SyntaxError'`), backed by the pre-existing `E2` mutation. That test is the
correct, minimal claim; this one over-claimed reachability. The ⚠ was removed from the test
name and a comment was added explaining why (`lib/auth/session.test.ts`); the test itself
was **not** deleted — it still documents and checks real behaviour, just not behaviour a
mutation can certify.

### #5 — `W19`, `lib/auth/login-view.ts`

The pre-existing `W7` mutation already covers the *other* `retryAfterSeconds` test.each
block (rejecting non-delta-seconds forms like `"1.5"`), but nothing touched the block this
mark belongs to (whole-seconds parsing). Its one realistic edge case is a proxy that pads
the header with whitespace:

```python
("W19 the header is validated unwrapped, so a proxy's padding is rejected as malformed",
 VIEW_SRC, "  const trimmed = header.trim();\n", "  const trimmed = header;\n", [VIEW]),
```

Dropping the `.trim()` call makes the regex reject `' 30 '` (spaces aren't in
`/^(?:0|[1-9][0-9]*)$/`), turning the expected `30` into `null` — a forgotten-trim bug that
is entirely plausible in a hand-written parser.

**Step 7 after these four changes**: 128 mutations (125 + `S11`/`SC1` + `K8` + `W19`), 128
⚠-marks checked (129 − the one dropped), every mark backed, exit 0. ⚠ **The mark count is
corrected to 130** by the reconciliation's F1 fix — see §1. Re-run confirmed
(`pipeline/steps/07-auth-login/regressions.py`, log tail: `All 128 regressions failed their
check, as they must.`).

## 3. Unmatchably-short names fixed

The real list, from this run, matches §10.1's predicted four files exactly:

| file | old name | new name |
|---|---|---|
| `lib/collectors/collect.test.ts` | `⚠ an %s value is not an override` | `⚠ ROOT_MOUNT and HOME_MOUNT ignore a blank value — the %s case` |
| `lib/collectors/safety.test.ts` | `` ⚠ %s `no` is unknown, not the alarm — the accepted form is the one `ufw` writes `` | `` ⚠ a `no` spelled a form `ufw` itself never writes reads unknown — %s `` |
| `lib/auth/config.test.ts` | `⚠ %s means nothing is standing, never an empty id` | `⚠ STANDING means nothing is standing, never an empty id — %s` |
| `lib/client/wire.test.ts` | `⚠ %s is refused rather than rolled forward` | `⚠ an impossible calendar date is refused, never rolled forward — %s` |

All four now report a ≥12-character literal prefix before the first `%s` (54–65 characters,
checked against the scanner's own `len(prefix) < 12` rule). No `!!! … unmatchably short`
warning appears in any of the seven harnesses' final logs. Only the row's own name changed
in each case — no test body, fixture, or assertion was touched.

> ⚠⚠ **CORRECTED BY THE RECONCILIATION, 2026-09-07.** These four renames were treated here as a
> cosmetic tidy-up. **They are not: a rename changes the string the ledger matches on, and the
> owning harness must be re-run.** Only step 7 was re-run after them. The `wire.test.ts` rename
> turned a prefix of the single character `⚠` — which is a substring of *every* ⚠ FAIL line, so
> the mark scored covered for free in every harness run this project has ever done — into a real
> string, and the mark behind it proved **inert**. See §7. The remaining three were verified
> genuinely backed by the reconciliation's re-run of steps 3, 5 and 7.

## 4. A6 / the step-3 ledger retrofit

**Already closed. No work was needed or invented.** `pipeline/steps/03-collectors-gpu-host/regressions.py`
already has:

- `LEDGER_FILES = [NUM, NV, PROC, DELTA, COL, IO]` (line 71, pre-existing)
- A working `marked_tests()` / ledger-coverage check wired into `main()` (`marked =
  marked_tests()`, the `covered` accumulator, and the `uncovered` report), confirmed
  functioning by this run: the harness reported "24 ⚠-marked tests checked … Every
  ⚠-marked test went red under at least one mutation" (after the one rename in §3).
- A comment at line 43 stating the retrofit was "done during step 8."

`WORK-ITEMS.md` §2 (A6) and HANDOVER's "still open" list can be marked closed for the
ledger-retrofit half of D8. Q1's own scope (back-porting the *scanner*) applied to step 3
exactly like the other six steps, and is reflected in its row of the table in §1.

## 5. Open questions — not resolved by guess

- **The session.test.ts drop (§2, #4) is a judgment call, not a mechanical one**, and it is
  the only place this build removed a ⚠ rather than adding a mutation for it. The reasoning
  is laid out in full above and in the file itself; flagging it explicitly in case the owner
  wants a second opinion on whether "no plausible single wrong implementation" was drawn
  correctly, since getting it wrong in either direction has different costs (dropping a mark
  that *did* have a fix is silently losing coverage; inventing a two-defect mutation to keep
  it would violate the harness's own honesty rule).
- Nothing else was left unresolved. No spec question came up — this item never touched
  `SPEC.md` or product behaviour, only the harnesses and four test names.

## 6. Final `pnpm verify` and `git status` at handover

```
$ pnpm verify
 Test Files  67 passed (67)
      Tests  2210 passed (2210)
Type Errors  no errors
EXIT: 0
```

(Same file/test counts as the parent's pre-verified baseline at `391d17f` — this item added
no tests and deleted none, only renamed four and added a documenting comment to a fifth.)

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
```

12 files changed (497 insertions, 47 deletions), all under `dashboard/`. Nothing outside it
touched. `SPEC.md` untouched. No commit made — left for the parent per the handoff's rule 2.


---

## 7. ⚠ Added by the reconciliation, 2026-09-07 — the rename that was never re-validated

`build.md` §3 renamed four test names and §1 reported all seven harnesses green. Those two facts
were established in that order, and only step 7 was re-run in between (§2). The reconciliation's
re-run of step 8 exited **1**:

```
NO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:
  lib/client/wire.test.ts
    ⚠ an impossible calendar date is refused, never rolled forward — %s
```

The old name was `⚠ %s is refused rather than rolled forward`, whose ledger prefix —
`name.split("%")[0].strip()` — is the single character `⚠`. That is a substring of every ⚠ FAIL
line any run produces, so the mark had been scoring **covered for free** since it was written.
§10.1 predicted this rename as a smaller defect riding along; it was load-bearing.

What was actually unbacked is `wire.ts`'s `calendarMatches` guard — the 19-character round-trip
that catches a `Date.parse` result which rolled an impossible date forward. Step 8's own harness
docstring records that F13 added that guard and that it silently voided `W4`'s coverage; step 8's
reconciliation fixed `W4`'s side and never gave the new guard a mutation of its own. `W21` does,
and it reddens two of the four table rows deterministically (`2026-02-30` → `2026-03-02`,
`2026-04-31` → `2026-05-01`). Step 8 is 173 mutations and exits 0.

Full account in `reconciliation.md` §4. The general rule is now `HANDOVER.md` §5.2 rule 8.
