# Handoff — 10f, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-09.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10f-build.md` and `steps/10-panels-assembly/10f-test.md` (**your
subjects**), `handoffs/10f-degraded-fit.md` (the four rulings), `SPEC.md` §6.1 (last ⚠ paragraph),
§6.2 GPU paragraph, §6.5, `HANDOVER.md` §0.9, §5, §8, `ANCHOR.md` §4/§5/§9, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10f build + test, uncommitted.
**Ports 39173/39174 are free — the browser scripts are available to you and you should use them.**

## 1. Verified by the parent

`pnpm verify` exit 0, 101 files, 2957 tests on the build tree; `row.tsx` deleted. The test phase
reports 2960 / exit 0, harnesses 02 60, 09 128, 10 233 all exit 0, `measure-breakpoints.mjs` 16/16,
`check-density.mjs` byte-identical to 10e's — those are its claims.

## 2. Where to aim

1. **The wells under real content.** Forty one-line messages is not the hard case. Try: one
   600-character message with no spaces (a path); a message with `\n`; RTL text; a message that is
   a 2 KB `journalctl` line; an `errors[]` of 100 entries from one source (S-H says one message per
   source — does the well or the dedupe bound it?). Does anything escape the well horizontally?
2. **Scroll inside a scroll.** A well inside SAFETY's row list, the chart table view open, the log
   scrolled — does any combination re-grow `documentElement.scrollHeight`? The 10e adversarial
   found A1 this way; do it again at 200 log entries **with every well full**.
3. **The compound case, MEASURED.** The test phase says the 1600×1024 compound (all collectors
   failed + both instances erroring + six-alarm banner) is arithmetic, and that a stale-and-explained
   row costs 39 px so the worst case is ≈278 px, not 163. **Fabricate it and measure it** at all
   three viewports with `measure-arrangements.mjs`'s route hook or a copy of it. Report the number;
   do not rule.
4. **Keyboard and screen reader.** Wells are `role="group"` with `tabindex`: tab order through a
   page with nine wells; does focus get trapped or skip content; is a well that does not overflow
   still a tab stop (a tab stop that scrolls nothing is noise)? Are names duplicated across
   panels?
5. **`Chip band={false}`** in every other caller — can anything else pass it by accident? Does the
   table view / hover layer of the throttle chips change?
6. **Q13's re-aims**: apply each of the three re-aimed mutations by hand and confirm the reddening
   test is the one the mutation names, not a neighbour.
7. **`PanelNotes` consolidation**: with `errors[]` carrying entries for the SAME source with and
   without `instance`, do GPU takeover / SERVING empty / STORAGE link each show the right one and
   only once (S-G, S-H)?
8. **Measurement 10's fixture**: could the app render the injected DKMS message somewhere other
   than SAFETY (a second panel subscribing to `dkms`) and still pass?
9. Anything in the diff you can revert one line of and keep the suite green (the 10e adversarial's
   A6 method). Name each.

## 3. Rules

- **Fix nothing.** Findings `10f-A1…` each with a concrete scenario, severity, file:line, and how
  proven ("measured" / "reasoned, not run"). Throwaway scripts in
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
  alongside a harness; harnesses serially, foreground, one call; ⚠ never poll with `pgrep`.
  Close only browsers you launch; kill only `next dev` you started (two unrelated `next-server`
  processes on :8391/:8392 are the user's — leave them); no `.env`. No commit; no `SPEC.md` /
  `MOCK.html` edits. `ai-server` is read-only and not needed.

## 4. Deliverable

`steps/10-panels-assembly/10f-adversarial.md`: findings first, most severe first; then what held;
then what you could not verify. Short summary back. The parent will not read your transcript.
