# 12c TEST — the harness never lied, and a dropped row was retiring the instance

**Written by the TEST phase, 2026-09-18.** Branch `dashboard-frontend`, working dir `dashboard/`,
12c's build uncommitted on `cb8a3c7`. Nothing committed, nothing staged, nothing deployed, and
**this phase did not contact `192.168.4.71` at all** — no SSH, no HTTP, no D-Bus socket opened and
therefore none left open. No spec file was edited.

---

## The eight priorities, in the handoff's order

### 1. ⚠⚠ The harness CANNOT exit 0 with moved anchors. The build's §8.2 claim is false, and the cause is the pipe.

**Settled first, and settled three ways.** This is the finding everything else's evidence rests on,
so it was not left at "the code reads `return 1`".

**(a) The code, at `cb8a3c7` and now.** `if moved or bad or ambiguous: return 1` sits **before** the
ledger in all ten harnesses, and `sys.exit(main())` is the entry point in all ten. `git show
cb8a3c7:…` confirms the guard was already there in every one, and `git diff cb8a3c7` over the three
harnesses 12c edited touches **no exit-path line** — only mutation entries and one id-prefix
allow-list.

**(b) Empirically, on all ten.** A probe imports each `regressions.py` verbatim, replaces
`REGRESSIONS` with one entry whose anchor cannot match, and exits with `main()`'s own return. That
takes the `moved` path, runs no vitest, and writes no source file:

```
02-format-severity                    exit=1  printed_ANCHORS_MOVED=1
03-collectors-gpu-host                exit=1  printed_ANCHORS_MOVED=1
04-collector-cooling                  exit=1  printed_ANCHORS_MOVED=1
05-collectors-serving-storage-safety  exit=1  printed_ANCHORS_MOVED=1
06-telemetry-route                    exit=1  printed_ANCHORS_MOVED=1
07-auth-login                         exit=1  printed_ANCHORS_MOVED=1
08-client-runtime                     exit=1  printed_ANCHORS_MOVED=1
09-ui-primitives                      exit=1  printed_ANCHORS_MOVED=1
10-panels-assembly                    exit=1  printed_ANCHORS_MOVED=1
11-packaging                          exit=1  printed_ANCHORS_MOVED=1
```

**(c) The pipe reproduced, on the same run.** The parent's hypothesis is exactly right:

| how the status was read | reported |
|---|---|
| `python3 probe.py > file; echo $?` | **1** |
| `python3 probe.py 2>&1 \| tail -3; echo $?` | **0** ← the build's number |
| same run, `${PIPESTATUS[0]}` | **1** |
| `python3 probe.py 2>&1 \| grep -c "ANCHORS MOVED"; echo $?` | **0** |
| with `set -o pipefail` | **1** |

**So: there is no fail-open in the tooling, it does not affect all ten, and nobody should hunt it
again.** What is true is the *lesson* the build drew — read the anchor report — and it is true for a
different reason: a run whose status is taken through a pipe reports the pipe's last stage. This
repo's own conventions already warn about it (`AGENTS.md`'s `grep -q` note), the handoff forbids it,
and every harness in this phase was run as `python3 …/regressions.py > log 2>&1` with `$?` read
directly. ⚠ **`12c-build.md` §8.2's row "step 05, first — 3 ANCHORS MOVED, exit 0" and the ⚠⚠
paragraph under it should be corrected**: the run exited 1; the operator's shell reported 0.

### 2. The unit-name MISS — the four mechanisms fixtured, and a fifth nobody listed

The build's four are real and now each has a test that fails without it. Added on top:

**⚠⚠ The scripted silent wrong answer** (`lib/collectors/serving.test.ts`). Every existing miss test
scripts a bus that does **not** know `llama-server@default.service`, so a guessing implementation
gets `NoSuchUnit` back and files a `dbus` error — loud *by accident*. The new fixture scripts the
fabricated name as a real, ordinary unit (`inactive`, with a `CUDA_VISIBLE_DEVICES` of its own), so
a template now produces a row plausible in every cell. `unitState` and `gpus` must be `null`
*although a perfectly good answer was available to be taken*, and `asked` must be `[]`. This is the
handoff's rule applied to its own conclusion: assert on the units **requested**, and make the
guessed answer *attractive* rather than absent.

**⚠ The miss is appended AFTER the bus's own entries.** Both are `dbus`, `events.ts` folds by source
taking the **last** message, so their order decides which sentence the event log quotes. It was a
consequence of two adjacent `push` statements and nothing asserted it.

**⚠⚠ THE FIFTH THING — the entry is offered to THREE panels, and one field is why it shows on one.**
`panelsForSource('dbus')` is `['cooling', 'serving', 'safety']`. So the sentence *"no systemd unit
is known for instance `default`…"* is handed to COOLING and SAFETY as well, and the only thing
keeping it off them is that the entry carries an `instance` — 10b-S-G's filter, written for a
different failure in 2026-09-08, silently load-bearing for this one. Nothing said so; `12c-build.md`
argues the `dbus` source choice purely from *which columns it blanks* and never from *which panels
it reaches*, which is the other half of §3.7's table. Now asserted in three places, in both
directions (a `dbus` entry with **no** instance must still reach both panels, or the test would pass
on a panel that had simply dropped the source).

**And a sixth, priced in the header** (`lib/client/header-status.test.ts`): `failingSourceCount`
counts §3.7 *sources*, so **one** unrecognised `*.env` in `/etc/llama-server` puts `dbus` in the
failing set on **every poll, indefinitely**, and in the header it is indistinguishable from a real
bus outage. Correct — the dashboard did fail to read something — and worth knowing before an
operator drops a `backup.env` beside `0.env`, which is exactly `12c-build.md` §10's box-side item 3
seen from the header.

### 3. The ordering rule — proved a function of the SET, over every permutation

The build's evidence is *"the same rows in two orders agree"*. Two orders agreeing is not the
property: a join reading `serving[1]` rather than `serving[0]` agrees on a two-element reversal too.

`lib/client/observations.test.ts` now builds a four-row fixture and tests **all 24 permutations**,
generated rather than listed (with an anti-vacuity check that the generator really yields 24
distinct orders — deliberately *not* ⚠-marked, since no source change can falsify it):

| card | claimants | winner | what that kills |
|---|---|---|---|
| 0 | `10`, `2` | **`2`** | a lexical order over numbers — `'10' < '2'` |
| 1 | `2`, `split` | **`2`** | names sorted in with numbers, and `Number('split')` |
| 2 | `split`, `01` | **`01`** | any `Number()` — `01` is a NAME here, and the lower one |
| 3 | none | `unserved` | a winner chosen before the claim was checked |

Each card is asserted for identity, **model** (§6.2's named failure is the *wrong* model, not a
missing one) and `alongside` across all 24, plus a `toEqual` of the whole `ServedBy` against the
canonical order — 72 comparisons that say nothing else moved either.

At the comparator (`lib/units.test.ts`), three more, and one of them found a real gap:

- **⚠⚠ transitivity**, which totality and antisymmetry do **not** imply. `Array.sort` is only defined
  for a consistent comparator; an intransitive one gives an order depending on which pairs the
  engine happened to compare — the same non-determinism §1.4 exists to remove, by a route the two
  properties already tested cannot see. ⚠ The set needs `1x` to be able to fail: drop the
  numbers-before-names branch into one lexical comparison and `10 < 1x < 2 < 10` is a **cycle** on
  three legal identities. A set of round numbers and word-shaped names cannot produce one.
- **⚠⚠ a numeric-LOOKING identity that is not canonical sorts as a NAME.** `isNumericInstance('01')`
  is false, so `01` follows every number and precedes `split`. A comparator asking `/^[0-9]+$/`
  instead makes `Number('01') - Number('1')` **zero** — two distinct identities comparing equal,
  which is the totality the join is not allowed to lose.
- **⚠ all 24 orderings of `{2, 10, 01, split}` sort identically.**

### 4. Row refusal — ⚠⚠ and the loop's principal finding: a dropped row was RETIRING the instance

The boundary holds in both directions and is now fixtured: one bad row drops and the rest render;
`gpus[]`, `errors[]`, `standing`, `serving: null` and a non-array `serving` all still refuse
wholesale. `failingSourceCount` and §9's aggregate were already asserted by the build.

**But "a dropped row cannot read healthy anywhere" did not hold, and the handoff's *"M must not
silently shrink"* is exactly where it broke.**

`servingListOf` drops a row, so `serving[]` comes out **shorter than the server sent**. A subject
absent from an enumeration that *was read* is §9's **retired** — `lib/conditions.ts`'s own table
says *"`serving: []` → **retired** — it has left the machine, and it leaves the ledger, the dot and
the count"*. Measured before any change, on `servingPopulated` with both rows refused for a bad
`port`, stepping `observePoll` past §6.4's ten-second debounce:

```
poll@21000ms retired=[]  stale=[]  displayed=[unit:llama-server@0.service, health:0,
                                              unit:llama-server@1.service, health:1]
poll@26000ms retired=[]  stale=[]  displayed=[…same…]
poll@31000ms retired=["unit:llama-server@0.service/normal", "health:0/normal",
                      "unit:llama-server@1.service/alarm", "health:1/alarm"]   ← left the ledger
poll@36000ms displayed=[]
```

**A row refused for a bad `port` deleted a live `alarm`**, and `events.ts` logs a retirement at
severity `normal` — *the subject left, and that is an answer*. `wire.ts`'s own doc gives the argument
against this one array over: *"§9 makes a card's absence from a `gpus[]` that was read mean retired —
the card has left the machine — so silently dropping a malformed GPU row would mint that verdict
from a validation failure."* `serving[]`'s equivalent verdict is minted through
`SERVING_ENUMERATION`, which the very next sentence names. Filing an `errors[]` entry does not
answer it: the entry keeps §9's **header** honest, which is a different claim from what §9 does to
the **row**.

**Fixed, structurally.** `WireSnapshot` gains `servingRowsRefused: number`; `enumerationsRead` takes
it and does not report the serving enumeration as read when it is non-zero; `runtime.ts` passes it.
After the fix the same sequence gives `retired=[]`, `wentStale=[all four]`, and the alarm stays in
`displayed` marked stale — keeping its band and its place in the count.

Four things about the shape, all deliberate:

- **A count on `WireSnapshot`, not a message match.** The refusals are in `errors[]`, but recovering
  the fact from them means matching `serving[…] was dropped` in text — what `collectServing`'s own
  doc forbids (*"never guessed downstream by matching … out of the message text"*) — and `llama-env`
  is also the **server's** source for ordinary env problems, which must not suppress anything.
- **One refusal suppresses the whole enumeration.** A row may have been refused *for its `instance`*,
  so there is no identity to exclude; the client knows only that it failed to read some.
- **`0` for a genuinely empty `serving: []`.** That array *was* read and declares none, so retiring
  is right there — and a pair of mutations, one per direction, pins both halves.
- **Required, not optional.** `HANDOVER §0.8`: an optional prop is an untested one. Nine hand-built
  `WireSnapshot`s in tests now state their value.

⚠ **Carried, not fixed:** `12c-build.md` §6 Q7 — a snapshot whose only row was refused yields
`serving: []`, and `gpu-panel.tsx`'s `indexed` branch still prints `served by instance 0` from the
card's own index. That is a rendering ruling with four tests pinning the current text, and it is
wrong independently of identities.

### 5. The number bridge, tested as the compatibility shim it is

`lib/client/wire.test.ts` gains a table split by outcome rather than one mixed list:

| sent | read as | why it is in this half |
|---|---|---|
| `0` | `'0'` | the old contract, and what the live box sends |
| `"0"` | `'0'` | the new contract |
| `0.0` | `'0'` | ⚠ `JSON.parse` has already made it `0` — there is no `"0.0"` to refuse |
| `-0` | `'0'` | ⚠ `-0 < 0` is **false**, `String(-0)` is `'0'`; same number, same identity |
| `1e1` | `'10'` | ⚠ likewise already the number `10` |
| `"0x0"` | `'0x0'` | ⚠⚠ a legal **named** identity whose `Number()` is **0** — a bridge written "coerce then check" merges it INTO instance `0` and loses a row |
| `"00"` | refused | a digits-only string must be canonical; `Number('00')` is 0 |
| `" 0"` | refused | `Number(' 0')` is 0; the grammar excludes whitespace |
| `"+0"` | refused | the grammar excludes a leading `+` |
| `1e21` | refused | `String()` is `'1e+21'`, no identity at all |
| `2**53` | refused | not a **safe** integer |

Plus `toEqual` over the whole parsed row for `0` vs `"0"` — the claim is that *nothing else about
the row moved either*, which is what "the live box renders as it does today" means.

**On skew, both directions, honestly.** The reachable one is tested: the frozen
`LIVE_BOX_SERVING_WIRE` validates, and its identities are asserted to still be **numbers in the
fixture** — the anti-vacuity term, because a fixture "fixed" to strings would leave the first
assertion passing and testing nothing. The other direction — a pre-12c client meeting
`"instance": "split"` — **is not testable in this tree**, because the code that would refuse it is
`integer()` in a build that no longer exists here. That is stated in the test rather than asserted
around. `12c-build.md` §6 Q8 (does skew exist on this deployment at all?) is unresolved and remains
the owner's.

### 6. The inert-mutation sweep, and how the three were fixed

**The three were fixed in the FIXTURE, not by weakening an assertion** — checked by reading each:
`12c-OB11b` gained a sparse fixture and a *stronger* pair of assertions; `12c-OB12` gained
`unitState: 'failed'` plus an added `not.toContain`; `12c-OB13` gained a label assertion where
**none existed**. Step 10's `12c-SP21`/`SP22` likewise (a directly-supplied `displayed`, and a stale
`health:split`); `12c-GP20` was deleted as a duplicate rather than kept. No mutation was re-aimed
away from its defect.

**The sweep is the five ledgers' own run, below.** This phase added six mutations, each verified to
bite before the full runs were paid for — applied to the source, one test file run, the source
restored and the restore checked by SHA-256:

| id | harness | the wrong implementation |
|---|---|---|
| `12c-T01` | 08 | any digits-only identity is numeric, so `01` and `1` compare **equal** |
| `12c-T02` | 08 | the refused-row count is thrown away |
| `12c-T03` | 08 | a refused row still counts as a read enumeration → §9 retires the instance |
| `12c-T04` | 08 | the enumeration is suppressed by an **empty** list instead → a box whose instances really left never retires them |
| `12c-T05` | 08 | numbers and names share one lexical fall-through → **intransitive** |
| `12c-T06` | 10 | the header's count skips entries that name a row → a unit-name miss never reaches it |

⚠ `T03`/`T04` are a pair, one per direction, per HANDOVER §5: a single mutation of a clause proves
only that *a* clause is there, never that it points the right way.

⚠ Two tests were **removed** for being unfalsifiable rather than given a mutation: one asserted a
property of its own literal, one duplicated an assertion the build already makes. A ⚠ no ledger can
redden is a claim with no evidence, and the answer is not always a new mutation.

**Three anchors moved, all three this phase's own**, re-aimed at the same defects rather than
dropped: `08-O14` (the `null`-enumeration guard, moved by `servingRowsRefused`) and `12a-MH8` /
`12a-MH9` (the two browser harnesses' `server-log.mjs` import line, moved by the port guards). Each
re-aim keeps the mutation removing exactly what its name says.

### 6a. ⚠⚠ A finding the sweep produced that is nobody's change: step 05's ledger is LOAD-DEPENDENT

Step 05's first run reported two ⚠ tests inert — **both in `lib/collectors/io.test.ts`**, a file
this loop never touched, under a mutation this loop never touched:

```
NO MUTATION REDDENS THESE ⚠ TESTS — each one is inert until it does:
  lib/collectors/io.test.ts
    ⚠ run bounds the PROMISE against a child that ignores SIGTERM
  lib/collectors/io.test.ts
    ⚠ run bounds the PROMISE when a descendant still holds stdout
```

`05-I2` is the mutation written for exactly those two — its own name ends *"inert against a child
that ignores SIGTERM"*. Applied twice, back to back, on the same tree, with nothing else running:

| run of `05-I2` | tests red | which |
|---|---|---|
| attempt 1 | **2** | *…descendant still holds stdout*, *the timeout message…* |
| attempt 2 | **3** | **both** PROMISE tests **and** the message test |

**Same mutation, same source, same command — different coverage.** Both tests spawn a real child
(`trap "" TERM; sleep 9`) and assert a 300 ms bound settles in under a second, so whether the
mutant misbehaves *in time* depends on how loaded the machine is. Inside a full harness run — 174
mutations of vitest churn, 625 s — neither reddened; run alone, one or both do.

⚠ **So the build's recorded `05 … exit 0` was a lucky run, not a stable one**, and the same is true
of any future green on this harness. It is pre-existing, it is not caused by 12c, and it is not
fixed here — `io.ts`'s bound is a step-5 concern with its own blast radius and this loop has no
business changing its timing. It is recorded because **a ledger whose verdict depends on machine
load is evidence that sometimes is not there**, which is the same standard the handoff applies to
the browser harness's 401, and it should be someone's next item.

### 7. ⚠⚠ The 401 flake: bounded, and a mechanism that produces it exactly — reproduced twice

**Bounded.** A probe running only the harness's login prefix — spawn, `waitForServer`, fill, click,
wait for `[data-slot="gpu0"]` — **6 of 6 clean**, `/api/session = POST 302` every time, 2.3–3.8 s.

**The stale-process lead in `12c-build.md` §8.3 is a red herring.** The three `next-server` processes
are still here, 10–11 days old, and they listen on **8391, 8392 and 8091** — not on the harness's
:39173. They cannot have answered anything.

**But the harness has a real fail-open, and it was reproduced.** `waitForServer` accepts any answer
under 500 from a **fixed** port, and `next dev` does **not** shift port — it prints `EADDRINUSE` and
dies. Put a second `next dev` on :39173 with its own credential pair and run the login prefix:

```
attempt 1: FAIL (no grid)  (16.8s)  port-was-busy-before-spawn=YES (status 200)
                                    /api/session=POST 401
  [err] ⨯ Failed to start server
  [err] Error: listen EADDRINUSE: address already in use :::39173
```

Every symptom the build recorded, and the cause sitting in a log the harness prints **only when
`waitForServer` fails** — which here it did not.

**And the first half of the loop was found by accident, in this phase's own first run.** A
`route.fetch: read ECONNRESET` inside `installGpuFabrication`'s route handler is an **unhandled
promise rejection in a Playwright event handler**: it escapes `main`'s `try/finally` entirely, so
Node kills the process, `next-env.d.ts` is never restored and `process.kill(-server.pid)` never
runs. Measured — `lsof` showed four pids still bound to :39173 afterwards and `git status` showed
`next-env.d.ts` modified. **That is the leak that occupies the port for the next run.** Run, crash,
leak; next run, 401 at its own login; kill the stray, next run passes — which is precisely the
pattern §8.3 describes.

⚠ **It is not proof of what happened on 2026-09-17**, and that is stated rather than glossed: the
build quoted `POST /api/session 401` from *the spawned server's own output*, and a server that never
won the bind logs no requests at all. So that occurrence stays unexplained; what is closed is a
certain, reproducible hole either side of it.

**Fixed, in both browser harnesses, with all four changes guarded by `measurement-harness.test.ts`:**

1. `assertPortFree(PORT)` **before** the spawn — refuses loudly and names `lsof`. Verified against
   the real harness with the port occupied: **exit 1 in under two seconds**, naming its own cause,
   instead of dying 15 s later on a selector.
2. `assertServerAlive(server, log, PORT)` **after** `waitForServer` — the preflight races anything
   that binds in between; this says the thing that answered is the thing this run spawned.
3. `route.fetch()` wrapped, so a transient network error aborts **one poll** (which §6.7 absorbs)
   instead of the run — closing the leak.
4. `/api/session`'s status recorded and printed at the failure, so a 401, a 429 and a genuinely
   broken page stop reporting as the same *"the grid never appeared"*.

⚠ `mocks/measure-arrangements.mjs` got 1–3 as well. The two scripts fail identically, and a hole
closed in one and left in the other is this project's most-repeated shape.

### 8. Names against bodies, and the smaller guards

- **No clocks, no entropy** in any test file this phase touched (`Date.now`, `Math.random`: none).
- **Every ⚠ name added here is far past the 12-character floor**, and each harness's own
  `UNMATCHABLE` check ran clean.
- **`nothing found` guards are paired.** The two `not.toContain` panel tests each ship an
  anti-vacuity companion asserting that a `dbus` entry with **no** instance *does* reach the same
  panel — otherwise a panel that had simply dropped the source would pass both.
- ⚠ **Pre-existing, unchanged, and reported rather than fixed:** step 03 prints
  `!!! lib/collectors/proc.test.ts:516: a test/it call the ⚠-scanner cannot read —
  test(`${name} survives every one`, …)`. A template-literal test name is invisible to the ledger,
  so a ⚠ placed there would never be checked. It is not 12c's, it does not fail the run, and it is
  one line to see.

---

## Measurements

Every figure is quoted from the command's own output. **All five harnesses were run serially, one
at a time, never two at once, none killed, and no exit status was ever read through a pipe** — each
was `python3 …/regressions.py > log 2>&1` with `$?` taken directly.

### `pnpm verify` — **exit 0**

```
Test Files  109 passed (109)
      Tests  3786 passed (3786)
Type Errors  no errors
```

**3786, up from the build's 3743** — 43 tests added by this phase across seven files. File count is
unchanged at 109; no new test file was needed.

### The five harnesses, with their anchor reports

| harness | run | exit | mutations | red | ⚠ checked | what the report said |
|---|---|---|---|---|---|---|
| `03-collectors-gpu-host` | 1st | **0** | 73 | 115 | 25 | clean — identical to 12b's and the build's columns |
| `05-collectors-serving-storage-safety` | 1st | **1** | 174 | 278 | 173 | `NO MUTATION REDDENS` — two ⚠ tests in `io.test.ts` (§6a) |
| | 2nd | **0** | 174 | 280 | 173 | clean, same tree, nothing changed between them |
| `06-telemetry-route` | 1st | **0** | 63 | 88 | 56 | clean — identical to 12b's and the build's columns |
| `08-client-runtime` | 1st | **1** | — | — | — | `ANCHORS MOVED: 08-O14` — moved by `servingRowsRefused`; re-aimed |
| | 2nd | **1** | — | — | — | `UNMATCHABLE LEDGER KEYS … ledger key '⚠⚠' (2 chars)` — this phase's own `test.each` name; placeholder moved |
| | 3rd | **0** | 219 | 398 | 287 | clean |
| `10-panels-assembly` | 1st | **1** | — | — | — | `ANCHORS MOVED: 12a-MH8, 12a-MH9` — moved by the port guards; re-aimed |
| | 2nd | **0** | 351 | 537 | 369 | clean |

**Zero `ANCHOR NOT FOUND` / `ANCHOR AMBIGUOUS` / `DID NOT BITE` / `NO MUTATION REDDENS` /
unmatchable keys on the final run of every harness, and every ⚠-marked test went red under at
least one mutation** — read off each log, not off an exit code.

⚠⚠ **Three of those five exit-1 outcomes printed `ANCHORS MOVED` and exited 1**, live, in this
run's own logs. That is §1's claim demonstrated a fourth time, by the harnesses themselves, without
being asked.

**1554 mutations across the ten harnesses, 1554 unique ids, zero cross-harness collisions** —
re-derived by importing each `regressions.py` and reading `len(REGRESSIONS)`, never by `grep -c`.
1548 at the end of the build, so **this phase wrote 6** (`12c-T01`…`T06`) and re-aimed 3
(`08-O14`, `12a-MH8`, `12a-MH9`):

| harness | build | now | this phase |
|---|---|---|---|
| 02 / 03 / 04 / 06 / 07 / 09 / 11 | 66 / 73 / 94 / 63 / 158 / 153 / 203 | unchanged | 0 |
| 05 | 174 | 174 | 0 (tests only) |
| 08 | 214 | **219** | 5 |
| 10 | 350 | **351** | 1 |

### The browser measurements

**`measure-breakpoints.mjs` — exit 0, `102 passed, 0 failed, 0 blocked, 102 total`.** Unchanged
count, which is the point: this phase changed no record and every existing one still holds.
`next-env.d.ts` restored (the harness says so, and `git status` agrees), nothing left on :39173.

⚠ It took **two runs**, and the first one is §7's evidence rather than a nuisance: it died on an
unhandled `route.fetch: read ECONNRESET`, leaked four pids onto the port and left `next-env.d.ts`
rewritten. That crash is what the `route.fetch` guard now prevents; the guards were written, the
port was cleared by hand, and the second run is the one above.

The figures the build's §8.3 named, from this run — all four reproduce:

| claim | measured here |
|---|---|
| the panel 0.8 px from its cap at 1600 | **`gpu0 by 0.8 px`** |
| the tightest of all | **`cpu by 0.7 px`**; `serving by 1.3 px`, `gpu0 by 1 px` |
| §6.1's no-scroll promise in split mode | **`spare 263 px`** at 1280, **228** at 1600, **284** at 1920 |
| SERVING's own slot | **103.8–104 px** per-GPU, **97 px** split at 1280, **76 px** at 1600 |

⚠ The tightest page in the whole run is **`spare 4 px`** at 1600x1024 (the hostile arrangement) —
worth knowing before anything is added to row 4.

### `git status` — 45 entries, and nothing is staged or committed

40 modified, 5 untracked (`lib/units.test.ts`, the two handoffs, `12c-build.md`, and this file).
⚠ **No source file is left mutated and `next-env.d.ts` is not in the list** — every harness restored
what it touched, and each of this phase's own bite-checks verified its restore by SHA-256.

⚠ A `git status` taken *during* a harness run shows transiently-mutated sources
(`lib/collectors/dbus-wire.ts` appeared in one such reading). The listing above was taken after the
last run finished, which is the only time it means anything.

**`SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` and `SERVING-MODES.md` are untouched.** `pnpm build` was
not run and neither were the harnesses for steps 2, 4, 7, 9 and 11 — this phase changed no file any
of their `LEDGER_FILES` contains, derived the same way §8.4 of the build derived it.

### Files this phase changed

| file | what |
|---|---|
| **`lib/client/wire.ts`** | ⚠⚠ `WireSnapshot.servingRowsRefused`, and `parseSnapshot` fills it |
| **`lib/client/observations.ts`** | ⚠⚠ `enumerationsRead` takes the refusal count and does not report the serving enumeration as read |
| `lib/client/runtime.ts` | passes it at the one call site |
| `lib/client/wire.test.ts` | ⚠ the number-bridge table; the refused-row/retirement block (4 tests) |
| `lib/client/observations.test.ts` | ⚠ the 24-permutation join proof; the three-panel fan-out |
| `lib/client/header-status.test.ts` | ⚠ what a miss and a refused row cost the header |
| `lib/units.test.ts` | ⚠ transitivity, the non-canonical identity, all 24 orderings |
| `lib/collectors/serving.test.ts` | ⚠ the scripted silent wrong answer; the miss's place in `errors[]` |
| `components/panels/cooling-panel.test.tsx`, `safety-panel.test.tsx` | ⚠ the miss never lands on either, plus the anti-vacuity half |
| `app/collector-visibility.test.tsx`, `app/dashboard-shell.test.tsx`, `components/panels/panel-chart.test.ts`, `components/panels/test-support.ts`, `lib/client/ring.test.ts`, `lib/client/series.test.ts` | the nine hand-built `WireSnapshot`s now state `servingRowsRefused` |
| **`pipeline/steps/10-…/server-log.mjs`** | ⚠⚠ `assertPortFree`, `assertServerAlive` |
| `pipeline/steps/10-…/measure-breakpoints.mjs` | the two guards, the `route.fetch` wrap, the `/api/session` record |
| `pipeline/steps/10-…/mocks/measure-arrangements.mjs` | the two guards and the `route.fetch` wrap |
| `measurement-harness.test.ts` | 6 graded terms for the four changes above |
| `pipeline/steps/08-…/regressions.py` | +5, 1 re-aimed |
| `pipeline/steps/10-…/regressions.py` | +1, 2 re-aimed |

### Left on the box

**Nothing.** This phase did not contact `192.168.4.71` — no SSH, no HTTP, no D-Bus socket opened and
therefore none left open. Every claim about the live box comes from `LIVE_BOX_SERVING_WIRE` and
`lib/collectors/samples.ts`, both frozen in the repo. `12c-build.md` §10's three box-side items
stand, and §2 above adds a fourth thing to expect when one of them is done: an unrecognised `*.env`
takes the header out of `all healthy` on every poll until it is removed.

---

## Summary

Priority one is closed in the harmless direction and needs a correction to `12c-build.md` §8.2 so
nobody re-hunts it — the harness returns 1 on a moved anchor, proved by reading, by a probe against
all ten, by reproducing the pipe that swallowed the status, and finally three more times by this
phase's own runs.

The loop's substantive defect is in priority four: **a wire-refused `serving[]` row was being read
by §9 as an instance that had left the machine, dropping a live alarm out of the ledger, the dot and
the count at severity `normal`** — the exact verdict `wire.ts`'s own doc refuses to mint for
`gpus[]`, reached through the one array it does drop. Fixed structurally on `WireSnapshot`, and
pinned by a mutation in each direction so neither half can be lost.

Two things are closed that nobody had asked about: the mapping miss reaches **three** panels and is
kept off two of them by a single field, and it takes the header out of `all healthy` for as long as
the file exists. Two are reported and **not** fixed, because both belong to someone else's blast
radius: step 05's ledger is load-dependent (§6a), and `12c-build.md` §6's Q7 is unchanged.

`pnpm verify` exit 0 at 109 files / 3786 tests; all five harnesses green on their final run with
clean anchor reports; the browser harness 102/102; nothing staged, nothing committed, nothing
deployed, and nothing left on the box.
