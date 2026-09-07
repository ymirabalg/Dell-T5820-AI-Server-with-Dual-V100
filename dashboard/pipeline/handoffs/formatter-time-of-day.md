# Handoff — the missing §6.6 formatter: time of day, with its zone

**BUILD phase, clean context.** Read this, then `HANDOVER.md` §1, §5, and `SPEC.md` §6.6 and
§6.2's header paragraph.

---

## What is missing

§6.2's header reads `14:47:31 EDT · 2 s ago`. `formatAge` covers the second half. **Nothing
renders the first**, and `lib/format.ts` has no time-of-day formatter at all.

§6.6 states the rules and they are not defaults:

- **Locale `en-US`, on every viewer**, *"so a screenshot always reads the same"*.
- **Times render in the browser's local timezone**, with **the zone abbreviation shown once in
  the header**.
- The server sends ISO-8601 UTC in `ts`.

## Why it belongs in `lib/format.ts` and not in a component

`format.ts` is where §6.6 is implemented **once** — the locale is pinned there, and every one of
its ~20 formatters goes through the same `render`. A component reaching for
`toLocaleTimeString` directly would be the fourth place this project has had to fix a locale,
and it would put a §6.6 rule somewhere §6.6's tests do not look.

## What to build

Something of this shape — the exact split is yours to argue:

```ts
export const formatTimeOfDay = (ts: IsoTimestamp | null): string
export const formatZoneAbbreviation = (ts: IsoTimestamp | null): string
```

Two functions rather than one string, because §6.6 says the zone appears **once in the header**
while the time appears next to it — a single `14:47:31 EDT` would force a caller to split on
whitespace, which is precisely what O14 exists to forbid. If you disagree, argue it at the code.

## ⚠ Five things that will bite

1. **Invariant 1.** `null` renders `—`. Never a blank, never `Invalid Date`, never the epoch.
   Every other formatter in that file already does this through `render`; match it.
2. **`en-US` is pinned, the ZONE is not.** The locale fixes the *format*; the zone comes from
   the viewer. `Intl.DateTimeFormat('en-US', { timeZone: … })` with no `timeZone` uses the
   host's — that is what §6.6 wants, and it means **the test must pin a zone explicitly** or it
   passes in one timezone and fails in another. That is HANDOVER §5.4's determinism rule in a
   new costume: *a test may consume entropy only for an assertion that holds for every value it
   could draw*, and the machine's timezone is entropy.
3. **`timeZoneName: 'short'` gives `EDT`/`EST`/`GMT+2` depending on the zone** — it is not
   always three letters, and it is not always alphabetic. Do not assume a shape; assert against
   a fixed zone.
4. **Seconds are shown** — §6.2's header is `14:47:31`, not `14:47`. A 5 s cadence with no
   seconds would look frozen.
5. ⚠ **Hour cycle.** `en-US` defaults to 12-hour (`2:47:31 PM`), and §6.2's header shows
   `14:47:31` — **24-hour**. `hourCycle: 'h23'` or `hour12: false`. This is the one that will
   ship wrong, because it looks right in a mock and is wrong on the wall.

## Rules

- `pnpm verify` exiting 0 is the only green.
- ⚠ Never run a harness concurrently with `verify` or another harness. Serially.
- Mark load-bearing tests `⚠` and back each with a mutation. `format.test.ts` is **step 2's**.
- **Both sides of every boundary**: midnight and noon (the 12/24-hour trap), a zone with a
  letter abbreviation and one without, `null` and a real value.
- Do not touch `SPEC.md`, `MOCK.html`, `PLAN.md`. Do not commit. Do not touch the box.

## Report back

What you built, how you pinned the timezone in the tests and why that is not a skipped
assertion, anything out of scope you found, and the real evidence output.
