# Handoff — 12b, TEST phase

**Written by the parent, 2026-09-17.** Fresh agent, no memory of this project. Read this file, then
`steps/12-deploy/12b-build.md` (**your primary subject**), `handoffs/12b-honest-mode.md`,
**`SPEC.md` §3.4's `gpus` ruling and its three-value table, §6.2's inverted join, §2.2, §4**,
`SERVING-MODES.md` §4, `HANDOVER.md` §0.15, §5, §8, `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 12b's build, on `f6f3101`.
⚠ **The box is LIVE.** Read it; write nothing. ⚠ The build left a stray process on it; **the parent
has already killed it** — if you open a D-Bus connection to that box, close it.

## 1. Verified by the parent

`pnpm verify` exit 0, **108 files, 3603 tests**. The box is healthy: all four services active.
The build's other figures — 95 browser measurements, three harnesses at 158/189/341 — are its own.

## 2. ⚠ Priorities

1. **The D-Bus codec was widened to decode arrays.** That is a **parser change on the one path that
   reads a privileged bus**, and it is the highest-risk thing in the diff. Fuzz it: an array whose
   declared length exceeds the frame; length 0; an array of arrays; `a(`/`a{` (must stay
   malformed); a length that overflows; misaligned padding; a nested type the codec does not know;
   an array inside a struct inside a variant. ⚠ **`malformed` vs `incomplete` is a real distinction
   here** — the build changed one case deliberately, so check every neighbouring case still reports
   the right one. Nothing may throw, and nothing may read past the frame.
2. **Additivity is proven with `LIVE_BOX_SERVING_WIRE`, a frozen string of the pre-change
   collector's real output.** That is the right instrument — **now check it is honest**: is it
   really the pre-change output (six keys, no `gpus`), was it captured from the box rather than
   written by hand, and does anything in the test path *mutate* it? A frozen fixture that the
   change can edit proves nothing.
3. **⚠ The coincidence reappeared inside the mutations meant to test it**: `⚠ SHAPE 1 of 4` was
   inert because three separate mutations all render `GPU 0` for instance 0. **Sweep for the same
   shape everywhere** — any ⚠ test whose subject is the join, where instance N and card N agreeing
   makes a wrong implementation look right. **Use a fixture where they disagree** (instance 1 on
   card 0) as the default, not as an extra case.
4. **All four `gpus` shapes, rendered, on both panels** — `[N]`, `[0,1]`, `null`, absent. Confirm
   `null` and absent are genuinely different in the DOM and to a screen reader, and that the
   absent case is byte-identical to today's render.
5. **Five pre-existing anchors moved, `05-L2` went ambiguous, `05-W4` went inert, `12b-D9` could not
   bite.** Read each fix against the property it names. ⚠ `05-W4` went inert *because the widening
   intercepts containers earlier* — that is a coverage loss in step 5's harness caused by this
   change; confirm what now covers it.
6. **§7.9 — `split.env` is REJECTED by §3.4's discovery**, which requires a bare-integer filename.
   So the loop's own purpose cannot yet be seen on the real box. **Do not fix it** (the parent
   rules on the shape); **do** establish exactly what discovery accepts and rejects today, with
   tests, so the ruling has facts under it.
7. Test names against bodies in every changed file; the `toContain` shape; entropy or clocks;
   ⚠ names with a matchable prefix ≥12 chars; a guard whose pass condition is "nothing found"
   judging its own failure.

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
python3 pipeline/steps/08-client-runtime/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
```

- ⚠ **Never `git add`, commit, or `git checkout --`.** Never two harnesses at once, never kill one,
  never poll with `pgrep`, never `pnpm verify` beside a harness.
- **Fixing IS in scope. Do not edit `SPEC.md`, `MOCK.html`, `INSTALL-SPEC.md` or
  `SERVING-MODES.md`.** Do not deploy.

## 4. Deliverable

`steps/12-deploy/12b-test.md`, leading with §2 in order; short summary; end with `pnpm verify`,
all three harness results, the measurements, and `git status`. The parent will not read your transcript.
