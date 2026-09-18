# Handoff — 12b, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-17.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12b-test.md` and `steps/12-deploy/12b-build.md` (**your subjects**),
`handoffs/12b-honest-mode.md`, **`SPEC.md` §3.4's `gpus` table, §6.2's inverted join, §2.2, §4**,
`SERVING-MODES.md` §4, `HANDOVER.md` §0.15, §5, §8, `ANCHOR.md` §4/§5/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 12b build + test, on `f6f3101`.
⚠ **The box is LIVE.** Read it; write nothing; **open no D-Bus connection you do not close** — the
build leaked one and the parent had to kill it.

## 1. Verified by the parent

`pnpm verify` exit 0, **108 files, 3634 tests**; the frame-bounding fix is in the source. The test
phase's other figures — 691 mutations across three harnesses, 95 browser measurements — are its own.

## 2. ⚠ Where to aim

**The test phase found two real bugs in the D-Bus codec that the build's own module doc claimed
were already covered**, including one where a corrupted message returned a **well-formed message
assembled from the next message's bytes**. That is cross-message contamination in a parser reading
a privileged bus, and it survived a build plus that build's own fuzzing.

1. **Keep going on the codec, from a different angle than the test phase's.** It fuzzed by
   corruption; try by **construction**: hand-build frames that are individually legal but
   pathological in sequence — two messages where the first's declared length lands mid-header of
   the second; a legal message followed by one byte; a stream where `byteLength` is exactly the
   buffer; a reply whose serial matches a *different* pending call; `av` nesting reachable through
   a variant (the test phase pinned it as wider than the doc says — is it bounded?).
   ⚠ **Does anything still read outside `frame`?** One place was fixed; prove there is not a second.
2. **`malformed` vs `incomplete` decides whether the client waits.** The fix maps one case; find a
   case still mapped the wrong way, and one where `malformed` is returned for something that
   genuinely needs more bytes (the mirror error, which would drop a legitimate reply).
3. **The cross-pinned fixture is now the default subject.** Good — so **find the join assertions it
   does NOT reach**: anything keyed on `instance` rather than on `gpus`, anywhere in the tree,
   including the event log, conditions, and `errorsForPanel`'s attribution.
4. **Byte-identity was measured against `f6f3101`'s own components.** Try to make the absent-`gpus`
   render diverge anyway: a snapshot with `gpus` present on *one* instance and absent on the other;
   `gpus: []` (an empty array is neither absent nor null — what does it render?); duplicate indices;
   an index naming a card that is not in `gpus[]`.
5. **§7.9 — `split.env` is rejected by discovery**, so split mode cannot be rendered on the real
   box. **Do not fix it.** Establish what else breaks if the parent rules one way or the other, and
   whether anything already assumes bare-integer instance ids beyond discovery (condition ids,
   React keys, the event log, `errorsForPanel`'s `instance` join).
6. **One-line reverts of the 12b diff that keep everything green.** Running total across this
   project's loops: 6, 3, 8, 49, 11, 30. The codec fixes, the cross-pinned default and the frozen
   live-box fixture are prime.
7. **The frozen `LIVE_BOX_SERVING_WIRE`** was verified honest by the test phase against the box.
   **Can the suite still edit it?** A fixture the change can mutate proves nothing, and this
   project has shipped a fixture that encoded a bug as an expectation.

## 3. Rules

- **Fix nothing.** Findings `12b-A1…`, most severe first, each with a scenario, severity, file:line
  and how proven ("measured" / "reasoned, not run"). Scratch work under
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness. Do not edit any spec. Do not deploy.

## 4. Deliverable

`steps/12-deploy/12b-adversarial.md`: findings first; then what held; then what you could not
verify and why. Short summary back. The parent will not read your transcript.
