# Handoff — 10h, ADVERSARIAL phase. **Break it. Fix nothing.**

**Written by the parent, 2026-09-10.** Fresh agent, no memory of this project. Read this file, then
`steps/10-panels-assembly/10h-build.md` and `steps/10-panels-assembly/10h-test.md` (**your
subjects**), `handoffs/10h-bound-the-grid.md`, `SPEC.md` §6.1's ⚠⚠ 2026-09-10 grid paragraph,
§6.4, §3.4, §3.2 (`hostname`), `HANDOVER.md` §0.11, §5, §8, `ANCHOR.md` §4/§5/§9, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: 10h build + test, uncommitted on
`29e2240`. Ports free (:8391/:8392 are the user's).

## 1. Verified by the parent

`pnpm verify` exit 0, 101 files, **3056** tests. The four row shares sum to exactly **1.0**
(computed by the parent from `tokens.css`). The test phase reports 44/44 measurements, nine
harnesses at **1170** mutations, hostile page **+28 / +4 / +36**, healthy density unchanged.

⚠ **The test phase already found the fifth unbounded term and did not fix it**: `--band-reserve:
102px` is a *measurement*, `.header` is `flex-wrap: wrap`, and §3.2's `hostname` is unbounded — a
79-character FQDN takes the band to **130.7 px** and the hostile page **1 px over at 1280×1024**
with every row cap holding. The owner is being asked about it in parallel. **Do not treat it as
your finding; go past it.**

## 2. Where to aim

1. **The other three premises of the fit.** The test phase proved the page fits iff the band ≤
   `--band-reserve` **and** padding = `--grid-pad-v` **and** gaps = `--grid-row-gaps`, and says
   **none of the three was checked against the thing it names**. Break each: a banner that changes
   the band, a padding or gap edit, a `:root` font-size change, a browser zoom level. Measure.
2. **Rows at exactly their caps.** At 1600×1024 rows 1, 2 and 4 sit AT their caps. Anything that
   adds a sub-pixel — a different font stack, `zoom`, a 125 % display scale, `prefers-reduced-motion`,
   a scrollbar that takes layout space — is an overflow. Test at **fractional viewport heights**
   (1024.5) and at device pixel ratios ≠ 1 if you can drive them.
3. **Scrolled panels.** Nine bodies scroll now. Does any of them scroll *horizontally*? Does a
   scrolled body clip a focus ring, a hover tooltip, a sticky table head, or the chart's own
   crosshair layer? Does keyboard focus inside a scrolled body scroll the PAGE (the classic
   `scrollIntoView` leak that defeats an overflow bound)?
4. **The head is pinned** — but is it pinned *visually* only? Scroll a body and check the head's
   own background is opaque over the scrolling content, and that a `Chip`'s absolute `.sr-only`
   span inside a scrolled body does not escape (the F1 family, three loops running).
5. **The cliff at 1279 px / 1023 px.** No caps at all below the bound: page 1606 at 1279 wide and
   1115 at 1023 tall. Is anything *worse* than uncapped there — a panel that now scrolls internally
   AND the page scrolls, i.e. two scrollbars for one overflow?
6. **`formatModelName`** and the `title` fallback: a name that is only a slash, a trailing slash, a
   URL, a name with a newline, a 4 KB string. Does the `title` ever show something different from
   the wire value?
7. **The banner's `+N more`** at 1, 2, 3, 4 conditions — is `N` ever 0 and still drawn?
8. **Anything in the 10h diff you can revert one line of and keep the suite green.** The last two
   loops found six and three; the test phase closed two holes of exactly this shape (a stylesheet
   read that a CSS comment satisfied, a `querySelector('header')` that took the first match).
9. **The four `test.each` literals pin the shares** — so a compensating pair still summing to 1
   passes the sum test and is caught only by the healthy-height test. Is that second net real?
   Break it.

## 3. Rules

- **Fix nothing.** Findings `10h-A1…`, most severe first, each with scenario, severity, file:line,
  and how proven ("measured" / "reasoned, not run"). Throwaway scripts in
  `/private/tmp/claude-501/-Users-yorman-Projects-DevelopmentLabs-ai-server/b15af190-e6f3-43ea-8483-0876feef2922/scratchpad`;
  `git status` at the end must match what you inherited.
- ⚠ **Never `git checkout --` while this item is uncommitted.** ⚠ The nine harnesses take ~11 min
  and the foreground tool caps at 10 — run them as ONE detached, strictly serial command and read
  the log; **never poll with `pgrep`**.
- `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"`; never `pnpm verify`
  alongside a harness. Close only browsers you launch; no `.env`. No commit; no `SPEC.md` /
  `MOCK.html` edits.

## 4. Deliverable

`steps/10-panels-assembly/10h-adversarial.md`: findings first; then what held; then what you could
not verify. Short summary back. The parent will not read your transcript.
