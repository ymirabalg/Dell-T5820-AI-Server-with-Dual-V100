# Handoff — 12c, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-18.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12c-test.md` and `steps/12-deploy/12c-build.md` (**your subjects** — ⚠ the build's
§8.2 is **known wrong**, see §1), `handoffs/12c-named-instances.md`, **`SPEC.md` §3.4's two ⚠⚠
2026-09-17 rulings, §4, §6.2, §6.4, §9 (rows 1 and 2)**, `SERVING-MODES.md` §4, `HANDOVER.md`
§0.16, §5, §8, `ANCHOR.md` §4/§5/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 12c build + test, on `cb8a3c7`.
⚠ **The box is LIVE** — read it, write nothing, open no D-Bus connection you do not close.

## 1. Verified by the parent

`pnpm verify` exit 0, **109 files, 3786 tests**; the refused-row plumbing is in `conditions.ts` and
`wire.ts`. **Settled and closed: a harness CANNOT exit 0 with moved anchors** — the parent read the
code, the test phase proved it four ways, and the cause was an exit status read through a pipe.
**`12c-build.md` §8.2 is wrong and is being corrected; do not re-hunt it.**

## 2. ⚠ Where to aim

**The test phase found the defect this loop actually introduced, and it is your template.** The
owner's ruling — *drop the bad row, render the rest* — made a refused row **indistinguishable from
a retired one**, and §9 treats retirement as *"it has left the machine"*. Measured: a bad `port`
refused both rows, and past the debounce a **live `alarm` silently left the ledger, the dot and the
count**. A validation failure deleting an alarm is the exact failure this project exists to
prevent, introduced by a ruling meant to make it more resilient.

**So: hunt the second-order consequences of both rulings, not the rulings.**

1. **What else reads "absent from the array" as a fact?** The fix routes `servingRowsRefused` →
   `enumerationsRead`. Find every other place a shorter array means something: `errorsForPanel`'s
   attribution, §6.2's "N of M" counts, the event log's transitions, `observePoll`'s debounce
   ledger, the hover layer, the table view. ⚠ **Does a refused row make anything read `0 of 0 up`
   or `all healthy` anywhere?**
2. **The stale path the fix now takes.** A condition that goes stale keeps its last value and
   counts. What if the row is refused **for many polls**, or refused on the **first ever** poll (no
   last value), or refused then valid then refused? Can a condition be stale forever with nothing
   saying why?
3. **The ordering comparator** was proved over 24 permutations and its **transitivity** pinned.
   Attack it from outside the fixture: ids that differ only by case, by Unicode normalisation, by a
   leading zero, by length (`9` vs `10` vs `1_0`), an empty-ish id, an id that is a prefix of
   another. ⚠ **Is `isInstanceId`'s grammar the same on both sides** (discovery and `wire.ts`), and
   can a server send one the client's own discovery would refuse?
4. **The unit-name mapping's miss**, with the test phase's own bus fixture: the guessed name
   *exists* and answers. It found a fifth consequence (the miss reaches three panels) and a sixth
   (one unrecognised `.env` takes the header out of `all healthy` **indefinitely**). **Find the
   seventh**, and decide whether the sixth is correct or a denial-of-service on the header.
5. **The number bridge** (`0` accepted as `"0"`). Find where the two spellings can diverge: as a
   React key, in a condition id, in `errorsForPanel`'s join, in the event log's text, across a poll
   boundary where the server changes spelling.
6. **The browser harness now guards against binding a port it does not own.** Try to defeat it:
   a server that starts slowly, one that dies after binding, a proxy in front, the port freed
   between the check and the bind.
7. ⚠ **Step 05's ledger is LOAD-DEPENDENT** (the test phase found `05-I2` reddening 2 tests then 3;
   the recorded green was a lucky run). **Establish the blast radius**: how many ⚠ marks in that
   harness could be certified by a timing-sensitive test, and is any other harness the same? This
   is evidence integrity, not this loop's code.
8. **One-line reverts of the 12c diff that stay green.** Running total: 6, 3, 8, 49, 11, 30, 5.

## 3. Rules

- **Fix nothing.** Findings `12c-A1…`, most severe first, each with a scenario, severity, file:line
  and how proven ("measured" / "reasoned, not run"). Scratch work under
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness, **never read a harness's exit
  status through a pipe**. Do not edit any spec. Do not deploy.

## 4. Deliverable

`steps/12-deploy/12c-adversarial.md`: findings first; then what held; then what you could not
verify and why. Short summary back. The parent will not read your transcript.
