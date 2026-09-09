# Handoff — 10e, TEST phase

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10e-build.md` (**your primary subject** — two builders wrote it; the second
half is the browser pass), then `steps/10-panels-assembly/10e-match-the-mock.md` §2.0–§2.11, §3, §6,
§8 (§9 opens with the owner's rulings), `SPEC.md` §6.1 (rewritten today), §6.2, §6.3, §6.6,
`HANDOVER.md` §0.4–§0.8, §5, `ANCHOR.md` §4/§5/§8/§9, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10e uncommitted (~77 entries).
⚠ **Ports 39174 and 39175 are in use by the parent's demo server** (`next dev` + a proxy so the
owner can see the build in a real browser). **Do not run `measure-arrangements.mjs`** (it wants
39174); `measure-breakpoints.mjs` uses 39173 and is fine. Your edits will hot-reload into the demo;
that is acceptable.

---

## 1. What 10e built

The density rebuild: 12 px base, the mock's tokens, `Hero`/`Strip`/`Caption` leaves, `Chip code`,
`Meter tickPercent`, `Row`/`StatusRow` pill values and F5 wrapping, `PanelShell` `position:
relative` (F1) + `headControl` + **optional `chip`** (omitted = no chip, OQ-4; `null` = hatched no-band
pill), `Sparkline` `domain`/`refs`/`timeLabels` + area fill, `CHART_SIZE` replaced, grid gap/padding/
`align-items: start`, header glyph buttons, banner restyle, all nine panel bodies. CPU keeps both
traces (OQ-7). Second builder: `box-sizing: border-box` on `.track` and the log `.scroll`; two harness
fixes (`anatomy()` listed only the first `<svg>`; the spare check was unsatisfiable by construction);
`10e-S3`/`S4` added to step 04's harness.

## 2. Verified by the parent

| | |
|---|---|
| `pnpm verify` exit **0**, **102 files, 2886 tests**, before the second builder's four edits | parent |
| A stranded step-05 mutation in `lib/collectors/dbus-wire.ts` (from a killed background harness run) was found and restored | parent |
| The three `02-R20`/`R30`/`R31` failures are pre-existing (HANDOVER §1) | parent |
| Everything else in the notes — check-density ALL PASS, spare 263/228/284, banner fits, 8/9 harnesses green, 04 fixed — is **the builder's claim**. Re-run what you can |

## 3. ⚠ Priorities

1. **~35 re-aimed and 3 retired mutations in step 10's harness, plus re-aims in 02 and 09.** A
   re-aimed mutation can test something *narrower* than before and the ledger will not notice.
   Read each re-aim against the property it was written to catch. **Each of the 3 retirements needs
   a reason you agree with** — "structurally superseded" is a claim.
2. **`lib/severity.test.ts` is in BOTH 02's and 04's `LEDGER_FILES` and the first builder backed it
   once.** Find every other file that appears in more than one harness's `LEDGER_FILES` and check
   every 10e ⚠ mark in it is backed in each.
3. **`PanelShell`'s three-state `chip`** (omitted / `null` / a severity): a fixture on every side, and
   the session log is the only omitted caller — prove no other panel silently lost its chip.
4. **`Sparkline`'s "byte-identical when the three props are omitted" claim** — re-derive it, and
   check the **table view** gains no rows from `refs`, `timeLabels` or the area fill. `domain`
   clamps on Y; confirm nothing re-introduced Q2-F9's rejected X-drop.
5. **`Row`/`StatusRow` now render a `Chip` when `severity` is given.** Every caller that passed a
   severity for a *stripe* now gets a *pill* — is that what §6.2 wants at each call site?
6. **`header.test.tsx` moved from visible words to accessible names.** Do the tests still prove the
   controls exist and do what the names say, or only that a label string is present?
7. **CPU has four `Sparkline` mounts** (2 traces × 2 sizes). Is the hidden pair genuinely hidden at
   both breakpoints, and does `measure-breakpoints.mjs` 7/8 cover CPU's wrappers by `data-role`?
8. **The six recorded spec silences.** For each: is it a real silence, or a choice the builder made
   and then labelled? #5 (unbounded `errors[]` height on the Mac fixture — measurement 9 fails at
   1280/1600 under `--fixture mac`) is an owner question; confirm the builder's numbers and do not
   rule on it.

## 4. The rest

- Test names against bodies, every new test file (`hero`, `strip`, `caption`, and the rewritten
  panel tests). HANDOVER §0.4's `toContain` shape has appeared nine times; look for the tenth.
- `test-support.ts` changed: what fixtures moved, and can the shared fixture still tell GPU 0 from
  GPU 1 (HANDOVER §0.6's rule)?
- `lib/dangling-css-class.test.ts`, `components/styles.test.ts`, `components/purity.test.ts` — did
  any of them need weakening to pass? They must be unchanged.
- The 26 rows of 10e §6: spot-check that the built strings are the spec's, not the mock's (raw
  driver name, full bus id, `GiB`, `served by instance N`, `for 2 d 06:00`, `0 RPM` in alarm ink).

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/02-format-severity/regressions.py; python3 pipeline/steps/04-collector-cooling/regressions.py; \
python3 pipeline/steps/09-ui-primitives/regressions.py; python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first**; never `pnpm verify` alongside a harness; harnesses serially, foreground, in ONE
  call; ⚠ **never poll with `pgrep`** (ANCHOR §9). `git status` after each; `git checkout --` a
  stranded mutation.
- Re-run every harness whose `LEDGER_FILES` you touch.
- **Fixing IS in scope. Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken
  `purity.test.ts`.** If you launch a browser close only what you launched; no `.env`.

## 6. Deliverable

`steps/10-panels-assembly/10e-test.md`, leading with §3 in order. Then a short summary. End with
`pnpm verify`, every harness result, and `git status`. The parent will not read your transcript.
