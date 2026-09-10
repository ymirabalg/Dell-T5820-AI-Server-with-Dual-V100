# Handoff — 10h, TEST phase

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10h-build.md` (**primary subject**), `handoffs/10h-bound-the-grid.md`,
`SPEC.md` §6.1's ⚠⚠ 2026-09-10 grid paragraph, §6.4's `+N more` paragraph, §3.4's `model` ruling,
`HANDOVER.md` §0.11, §5, §8, `steps/10-panels-assembly/10g-test.md` §2 (**how a measurement is
probed by breaking it — two passed vacuously last loop**), `ANCHOR.md` §4/§5/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10h uncommitted on `29e2240`.

## 1. Verified by the parent

`pnpm verify` exit 0, 101 files, **3054** tests. The `max-height` caps and the four row variables
are in `grid.module.css`. Everything else is the builder's claim: 38/38 measurements, nine
harnesses at 1169 mutations, the hostile page at **+28 / +4 / +36 px**, healthy slots identical to
the digit.

## 2. ⚠ Priorities

1. **The +4 px at 1600×1024 is the whole margin.** The builder says the shares are *derived* and
   *sum to exactly 1*, so the page fits "by construction". **Test the construction, not the
   fixture**: does the sum-to-1 assertion actually constrain the shipped values, or would it pass
   for a different set that overflows? Change one share by a point and see what fails. If nothing
   fails until a browser runs, say so — that is the difference between an invariant and a comment.
2. **`min-height: 0` and `flex: 0 1 auto` are load-bearing** — a flex child's default `min-height:
   auto` refuses to shrink below content. Prove the body scrolls rather than the panel growing, for
   EVERY panel, with a fixture that overflows each one. Which panels have you actually seen scroll?
3. **The head is pinned.** Prove it for a scrolled body: title, subtitle and chip visible at scroll
   bottom, in every panel. And that the head is not itself inside the scroller anywhere.
4. **The caps sit behind `(min-width: 1280px) and (min-height: 1024px)`.** At 1279 px or 1023 px
   tall there is no cap at all — is that right per §6.1 (below the bound, "legibility wins"), and
   does anything else silently change at that boundary? Fixture both sides.
5. **The banner's `lead + drawn + N === count` is asserted arithmetically** — good, but is `N`
   ever wrong when a condition's TEXT wraps (the `… N more` lesson from 10g)? And is the marker
   reachable/announced when the list is long?
6. **`formatModelName`** — fixture: a bare alias, a deep path, a path with no basename (`/`), a
   Windows-ish path, an empty string, `null`, a name containing a slash that is not a path. Does
   the `title` carry the whole string everywhere it is truncated (row AND strip item)? Is the wire
   value untouched (§3.1)?
7. **Six new measurement records, six deliberate defects, all reversed.** Re-probe at least three
   yourself — including the hostile-page one. And check the two RE-AIMED records in measurement 12
   are not weaker than what they replaced (`git show HEAD:` for the originals).
8. **Four inert ⚠ tests were caught by the ledger and given mutations**, and `10h-GR10` did not
   bite because a module doc quoted the rule it guards. Look for the same shape elsewhere in 10h's
   new tests: a CSS-text assertion satisfied by a comment.
9. Test names against bodies; entropy/timers; the `toContain` shape (eleven so far).

## 3. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/09-ui-primitives/regressions.py; python3 pipeline/steps/10-panels-assembly/regressions.py
```

⚠ The nine harnesses take ~11 min; the foreground tool caps at 10. Run the two you need serially in
the foreground; if you must run all nine, run them as ONE detached command, strictly serial, and
**never poll with `pgrep`** — read the log when it is done.

- **nvm path first**; never `pnpm verify` alongside a harness; ⚠ **never `git checkout --` while
  this item is uncommitted**; `⚠` test names need a matchable prefix ≥12 chars. Close only browsers
  you launch; no `.env`; `next-env.d.ts` byte-identical.
- **Fixing IS in scope. Do not commit. Do not edit `SPEC.md` or `MOCK.html`. Do not weaken a guard.**

## 4. Deliverable

`steps/10-panels-assembly/10h-test.md`, leading with §2 in order; short summary; end with
`pnpm verify`, every harness result, and `git status`. The parent will not read your transcript.
