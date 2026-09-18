# Handoff — 12b, RECONCILE phase (background agent)

**Written by the parent, 2026-09-17.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12b-adversarial.md` (**6 findings — primary subject**), `…/12b-test.md`,
`…/12b-build.md`, `handoffs/12b-honest-mode.md`, **`SPEC.md` §3.4's `gpus` table, §6.2, §2.2, §4**,
`SERVING-MODES.md` §4, `HANDOVER.md` in full (you rewrite it),
`steps/12-deploy/12a-reconciliation.md` (the model), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`, tree dirty on `f6f3101`.
⚠ **The box is LIVE — read it, write nothing, open no D-Bus connection you do not close.**

## 1. ⚠ The finding that governs this loop

**`12b-A1` — the frame fix bounded the reads; NOTHING BOUNDS THE FRAME.** `decodeMessage` never
checks that the decoded values account for the `byteLength` it was handed. `Reader.array` enforces
exactly that invariant one level down; the message has no equivalent. Measured on the real captured
reply: **one flipped byte at offset 4 yields a perfectly well-formed message — right serial, right
object path — with `byteLength` 191 instead of 96**, and the conversation then discards 95 bytes of
the *next* message. End to end: `active` in 2 ms becomes `null` and *"timed out after 300 ms"*.

**This is the third layer of one bug.** The build shipped it; the test phase found two symptoms and
fixed them; the adversarial found the invariant that was never stated. **Fix the invariant, not a
third symptom** — and `12b-A2` with it, where a header field's value is bounded by the frame but
**not by the fields region**, so `errorName` can decode out of the body's own bytes.

⚠ **State the rule once, where `Reader.array` states its own**, and make every caller inherit it.
If you find yourself adding a third bounds check beside two others, that is the signal you are
patching symptoms again.

## 2. Then, in order

- **`12b-A5` — five one-line reverts keep the whole suite green**, three of them *inside the codec
  the test phase had just fuzzed*: both `Object.hasOwn` guards for `gpus`, `alignmentOf`'s
  `case 'v'` (a spec violation), and `Reader.string`/`signature`'s `need(length + 1)` — the two
  sites the corrected doc claims are now covered. ⚠ **The exhaustive sweep structurally cannot
  reach them**: every truncation it builds returns `incomplete` before the reader is entered. Close
  all five and **say what now reaches them**, then re-run the sweep and report the count.
- **`12b-A4`** — no message-TYPE check on a reply, so a SIGNAL or METHOD_CALL carrying our
  `REPLY_SERIAL` yields a fabricated `active`/`failed` unit state with **`errors: []`**. A
  fabricated reading with no error beside it is the failure this whole project is about.
- **`12b-A6`** — `LIVE_BOX_SERVING_WIRE`'s only evidence of being captured is asserted nowhere, and
  the six-key guard checks the *parser's* output rather than the fixture's bytes.
- **The two join gaps the cross-pinned fixture does not reach**: `measure-breakpoints.mjs:706`
  still builds `gpus: [i.instance]`, so measurement 19 would pass under the old index join; and
  `components/panels/test-support.ts:125` never got `gpus: null`, so the panel suite's
  "nothing readable" snapshot is silently an **older-server** snapshot.
- **`12b-A3`** — the ceiling's documentation overstates its own behaviour; correct it at the source.

## 3. The parent's own items — report, do not edit

- **`SPEC.md:1196` still states the retired join as the rule**, outside the inversion marker's
  scope. Quote the replacement sentence you would write; the parent writes it.
- **§7.9 — `split.env` is rejected by discovery**, so split mode cannot be rendered on the box.
  **Do not fix it.** Report what else assumes a bare-integer instance id — condition ids, React
  keys, the event log, `errorsForPanel`'s join — so the parent's ruling has the full cost under it.

## 4. Then

`pnpm verify` cold; the harnesses for everything you touch (**05, 08, 10** at least), **serially,
one at a time**; `measure-breakpoints.mjs` and the density pair. Then `git status`.

Write `steps/12-deploy/12b-reconciliation.md` (adjudication table first) and **rewrite
`HANDOVER.md`**: §0.0 = 12b's state and whether the dashboard can yet state the mode on the real
box; §8 the open questions; §1 the totals; §0.16 this loop's rules — including the one it earned:
**a bounds check that is not stated as an invariant will be re-found as a symptom, once per phase.**

## 5. Not yours

No commit. No spec edits. No claiming green — paste exit codes. ⚠ Never `git add`; never two
harnesses at once; never poll with `pgrep`.

## 6. Report

Adjudication counts; how `12b-A1` was closed and where the invariant now lives; the revert sweep
before and after; exit codes; your two spec wordings; the §7.9 cost survey; the owner questions.
The parent will not read your transcript.
