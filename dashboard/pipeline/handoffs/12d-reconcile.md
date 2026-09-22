# Handoff — 12d, RECONCILIATION phase

**Written by the parent, 2026-09-22.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12d-adversarial.md` (**your primary subject — all ten findings**),
`steps/12-deploy/12d-build.md`, `steps/12-deploy/12d-test.md`, `handoffs/12d-partial-reads.md`,
**`SPEC.md` §3.4 and §9 row 1 AND row 2 — read them in the spec itself, never as quoted by a phase
note (a phase was caught this loop quoting a sentence the spec does not contain)** — then §4, §6.2,
§6.4, §6.5, `HANDOVER.md` §0.0, §0.17, §5, §8, and the source: `lib/client/wire.ts`,
`lib/client/observations.ts`, `lib/conditions.ts`, `lib/client/events.ts`,
`components/panels/gpu-panel.tsx`.

Branch `dashboard-frontend`, working dir `dashboard/`. **Tree dirty: 12d's build + test, on
`9fcff77`** — 15 modified, 4 untracked (three phase notes + this handoff).
⚠ **The box is LIVE** — read it; write nothing. You do not deploy.

## 1. Your job

**Adjudicate every one of the ten findings ACCEPTED / REJECTED / DEFERRED, each with a CHECKABLE
reason** — one a later reader can verify against the code or the spec without re-deriving it.
Then **apply what survives** and **re-run everything**.

⚠ **"Pre-existing" is NOT by itself a rejection reason.** Neither is "out of scope". Both may be
correct conclusions, but each needs the reason that makes it correct *here*, stated so the parent
can check it. The parent audits **rejections and deferrals FIRST**, because an accepted fix leaves a
visible diff and a rejected finding leaves nothing.

## 2. ⚠⚠ Findings 1 and 2 are the loop. Everything else is housekeeping beside them

**Finding 1 (HIGH, pre-existing):** `observePoll` decides retirement from *was a condition observed
this poll*, never from *is this subject in the collection we just read*. So a subject **still
enumerated** whose reading went `null` is retired — and §9 row 2's own "Because" column describes
exactly that scenario as the thing the rule exists to prevent. Measured: a GPU alarm retired at poll
6 while `gpus` carried `[0,1]` throughout.

**Finding 2 (HIGH, and it is 12d's own):** because a named refusal now reports the enumeration READ,
12d makes Finding 1 fire **during a partial read**, where 12c's global freeze incidentally blocked
it. Measured on identical wire bytes: instance `'7'` present in `serving[]` on every poll loses both
alarms at poll 6 under 12d (alarms 8→6) and keeps them under the 12c rule.

**So you must answer, explicitly and with a measurement, the question the parent will be asked:**

> **Does 12d as it currently stands leave the production dashboard better or worse than 12c?**

It fixes an unbounded stuck alarm and it widens a path that deletes a live one. Those are not
comparable by assertion. **Say which, on evidence.**

Three courses are open and **you choose, with your reasoning written down**:

- **(a) Fix Finding 1 inside 12d.** The adversarial sketches the shape: compare against the
  collection's membership this poll rather than against whether a condition was emitted;
  `enumerationsRead` already holds the snapshot and could carry the members it saw, with `held` a
  narrower exclusion on top. This is scope growth beyond the two rulings — but if 12d cannot ship
  safely without it, that is the honest answer and the growth is justified.
- **(b) Ship 12d with Finding 1 open**, only if you can measure that the net effect is an
  improvement, and only with the regression recorded in `HANDOVER.md` §8 as an owner question.
- **(c) Hold 12d** and put both findings to the owner as a ruling.

⚠ **Do not pick (b) by default because it is the smallest diff.** And if you pick (a), the
per-subject rulings of §3.4 and §9 row 2 must still be exactly what ships — a Finding-1 fix that
quietly re-freezes everything has undone the loop.

## 3. The other eight, with what the parent expects

- **3 (MEDIUM) — a fabricated quotation in production source.** `gpu-panel.tsx:197` puts quotation
  marks around a sentence `SPEC.md` does not contain, and the section number was changed from the
  handoff's §3.7 to §6.4, whose real sentence is about repeating an explanation across cells, not
  about length. ⚠ **This one is not cosmetic** — this project follows its own citations. Fix the
  comment and every phase note that repeats it, and **rewrite `12d-Q3`'s recorded reason**, which
  currently rests on text nobody wrote. The four-word form itself may well survive on its own merits;
  say so if it does.
- **4 (MEDIUM) — §3.4 is less silent than `12d-Q1` claims.** Its table assigns `gpus: null` the em
  dash unconditionally, so the build's precedence choice is an **override of the spec, not a
  silence**. ⚠ Invariant 7 says a spec silence must be recorded; an override is a different and
  larger act. Decide whether `incomplete`-wins survives, and if it does, it goes to the owner as an
  override rather than sitting in a silences table.
- **5 (MEDIUM) — the two panels contradict each other in prose** when every row is refused: SERVING
  says "no llama-server instances discovered" above two "was dropped" sentences while both cards say
  the list was not fully read. `12c-Q5` was carried as "unchanged"; the adversarial shows it is not.
- **6 (LOW-MED, spec question) — the mirror failure is unbounded.** Nothing ages a stale condition
  out, so a permanently malformed row keeps its alarm in the count forever — the very defect §9's
  ruling removed, reproduced for one subject by design. The adversarial calls it a spec consequence
  rather than a defect and asks only that it be **recorded**. Judge that, and record it if you agree.
- **7 (LOW)** `{read:'partial', refused: []}` unreachable but expressible — a one-token type fix.
- **8 (LOW)** the GPU `member` is inert by measurement and by structure; the pinning test documents
  intent without checking the `member` half. **Label it honestly; do not add a mutation for an inert
  value.**
- **9 (LOW)** `12d-Q2`'s cost estimate for changing the copy is wrong by an order of magnitude.
- **10** is the adversarial's own "could not break" list. ⚠ **Spot-check it rather than inheriting
  it** — it is the only part of that phase nobody has reviewed.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
# the FOUR exposed harnesses — SERIALLY, one at a time, read each ANCHOR report
for s in 02-conditions-severity 04-collector-cooling 08-client-runtime 10-panels-assembly; do
  python3 "pipeline/steps/$s/regressions.py"; done
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json
```

⚠ Confirm step 02's directory name before using that line. **Any source change obliges you to
re-run every exposed harness**, and a change to `lib/conditions.ts` or `observePoll` may expose a
fifth — re-derive the set by intersecting each `regressions.py`'s mutations and `LEDGER_FILES` with
the dirty files, as the test phase did, rather than trusting this list.

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness. ⚠ **Never capture a harness's exit
  status through a pipe.**
- **Do not edit `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` or `SERVING-MODES.md`.** Anything needing
  a spec change is an owner question — write it into `HANDOVER.md` §8 with an id.
- Any new mutation: id prefix `12d-`, unique across all ten harnesses, ⚠ a **wrong implementation**
  and not a deletion, name with a matchable prefix ≥12 chars, fixtures on both sides.
- Do not deploy. Do not contact the box except to read.

## 5. Deliverable

`steps/12-deploy/12d-reconciliation.md`:

1. **§1 — the adjudication table: all ten, ACCEPTED / REJECTED / DEFERRED, each with its checkable
   reason.** This is what the parent reads first.
2. **§2 — the Findings 1+2 decision**, the course you chose, the measurement behind it, and the
   before/after numbers on the same wire.
3. What you applied, what you re-ran, every harness result with its anchor report, the browser
   measurements, `pnpm verify`, and `git status`.
4. Every owner question with an id, mirrored into `HANDOVER.md` §8.

Short summary back. **The parent will not read your transcript**, will re-run the checks itself, and
will audit your rejections and deferrals before anything is committed.
