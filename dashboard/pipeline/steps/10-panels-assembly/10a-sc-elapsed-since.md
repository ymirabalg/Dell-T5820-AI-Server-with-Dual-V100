# 10a — S-C: the banner's "since" becomes an elapsed form

Implements the owner's ruling on F12 (deferred by 10a's reconciliation, `10a-reconciliation.md`
§3.4/§5): §6.4's sticky alarm banner names when a confirmed alarm-level condition started, and
that used to be a wall-clock time (`since 03:00:14`). Ruled 2026-09-08 (S-C): it renders as an
**elapsed** duration instead — `for 2 d 06:00` — because a clock time on a wall panel open since
Friday is indistinguishable from six hours ago, and decision 7 makes multi-day the expected case
for this machine.

## What changed

- **`lib/format.ts` — `formatUptime`** gained an optional second parameter, `prefix: 'up' | 'for'
  = 'up'`. The day/hour/minute arithmetic is untouched; only the leading word is now a parameter.
  Every existing call site (the header, `scripts/api.probe.ts`, every existing test) is
  unaffected — the default keeps them at `'up'`.
- **`app/dashboard-shell.tsx` — `sinceText`** used to be
  `` `since ${formatTimeOfDay(isoTimestamp(new Date(ms).toISOString()))}` ``. It is now:

  ```ts
  const sinceText = (sinceMs: number, nowMs: number): string =>
    formatUptime(seconds(Math.max(0, nowMs - sinceMs) / 1000), 'for');
  ```

  The `isoTimestamp` import (only used by the old `sinceText`) was removed; `seconds` (from
  `lib/types`) was added. The call site in `toBannerItem` now passes `nowMs` through:
  `since: sinceText(c.sinceMs, nowMs)`.
- **`components/alarm-banner.tsx`** — two doc comments (module doc and
  `AlarmBannerItem.since`'s own) updated from the `'since 15:10:40'` example to
  `'for 2 d 06:00'`, with a note on why (S-C) and what it used to be. No functional change: this
  component only lays out a pre-formatted string, exactly as before.
- **`components/alarm-banner.test.tsx`** — the fixture `since` value and its assertion were
  updated from `'since 15:10:40'` to `'for 2 d 06:00'`, so the file's own example text is not a
  stale artifact of the old rendering. This component's tests are still testing "renders whatever
  string it's given" — no logic in that file changed.

## `formatUptime` fitted

Its four day/hour/minute forms answer exactly the question the banner needs ("how long has this
been going"), so no fifth formatter was written. The only shape mismatch was the fixed word
`'up'`, which is why the function took a `prefix` parameter rather than duplicating the
day/hour/minute arithmetic in `dashboard-shell.tsx`. §6.6 pins the locale once and this project
has already had to fix a locale bug in four places — a second implementation of this arithmetic
would have been exactly that risk again.

## Agreement with F10 (S-B)

F10 (ruled S-B) already put an elapsed form in this same banner for the stale-reading case:
`last read 6:12 ago`, built from `formatAge`. S-C's `for 2 d 06:00`, built from `formatUptime`,
is a second and distinct elapsed form — the two do not share a formatter — but they now **agree
in kind**: both name a duration, never an instant. Before this change the banner could show a
clock time (`since 03:00:14`) beside an elapsed age (`last read 6:12 ago`) on the very same line,
mixing forms in exactly the way the handoff warned against. That is now impossible: neither
`since` nor `age` on `AlarmBannerItem` can be a clock time.

The date-prefix alternative (`since Fri 03:00:14`) was **not** implemented and was not added
alongside the elapsed form either — per the ruling, it answers "when did it start" where the
operator's question is "how long has this been wrong", and SPEC §6.4 says explicitly it "was not
taken".

## Semantics unchanged

`sinceMs` is still exactly what `lib/conditions.ts` sets it to: the first observation of the
CONFIRMED band (O4). Nothing in `lib/conditions.ts`, `lib/client/banner.ts`, or the
`BannerCondition`/`DisplayedCondition` types changed. The only thing that changed is how
`nowMs − sinceMs` is rendered — from `formatTimeOfDay(sinceMs)` (an instant) to
`formatUptime(nowMs − sinceMs, 'for')` (a duration). The instant displayed elsewhere on the page
(nothing else displays `sinceMs` directly) is unaffected, and no code path that reads or compares
`sinceMs` numerically was touched.

One clamp was added that has no old analogue: `Math.max(0, nowMs − sinceMs)`, the same convention
`formatAge` already uses for a clock-skewed `ts` (§6.6) — `sinceMs` is a browser-clock value that
should never be later than `nowMs`, but a negative duration must never render as one.

## The ⚠ test and its mutation

New describe block in `app/dashboard-shell.test.tsx`:

```
describe('⚠ S-C — the banner names "since" as an ELAPSED duration, never a clock time', () => {
  test('⚠ a multi-day confirmation reads "for 2 d 06:00"; a same-day one reads the hour form, both from the same clock', ...)
```

It pins the clock with `vi.useFakeTimers()` / `vi.setSystemTime(BASE_MS)` (the same pattern F10's
own test uses, since `useNowTick` reads `Date.now()` at mount) and renders **two** alarm-level
conditions in one banner:

- `sinceMs = BASE_MS − (2 d + 6 h)` → asserts the rendered text contains **`for 2 d 06:00`** —
  SPEC §6.4's own literal example, and the "over one day" side of the boundary.
- `sinceMs = BASE_MS − 6 h` → asserts the rendered text contains **`for 06:00`** — the "under one
  day" side.

It also asserts the text does **not** match `/since \d{2}:\d{2}:\d{2}/`, i.e. F12's exact original
defect (and the not-taken date-prefix alternative) cannot silently coexist with the fix.

Backing mutation, `10a-SC1` in `pipeline/steps/10-panels-assembly/regressions.py`:

```python
("10a-SC1 the elapsed \"since\" subtracts in the wrong order, so every alarm reads \"for <1 min\" no matter how long it has stood",
 DASHBOARD_SHELL_SRC,
 "formatUptime(seconds(Math.max(0, nowMs - sinceMs) / 1000), 'for');",
 "formatUptime(seconds(Math.max(0, sinceMs - nowMs) / 1000), 'for');",
 [DASHBOARD_SHELL_TEST]),
```

Swapping the subtraction order is a plausible mistake for exactly the reason given in the
mutation's own comment: this file computes two similarly-shaped elapsed values in a few lines
(`nowMs − sinceMs` here, `nowMs − c.lastSeenMs` in `staleAgeText` just below it) and the mnemonic
that makes "age = now − last-seen" hard to get backwards does not carry over to "elapsed = now −
since" as obviously. Under the mutation every duration clamps to zero (`sinceMs ≤ nowMs` always),
so **both** fixtures in the ⚠ test collapse to `for <1 min` — it reddens deterministically, not
probabilistically, and is not an equivalent mutation: it changes the value on every input where
the correct code would produce something else.

## Both-sides fixtures

Both the "under one day" and "over one day" cases are exercised in the single ⚠ test above, per
ANCHOR §5/§9's "every boundary guard needs a fixture on both sides" (a rule this pipeline has
broken three times already). No exact-boundary fixture (23:59:59 vs 24:00:00) was added on top of
that: the risk this change introduces is in `dashboard-shell.tsx`'s new elapsed computation (the
subtraction, the clamp, the `'for'` word), not in `formatUptime`'s own day/hour transition, which
is pre-existing code already covered by `lib/format.test.ts`'s own boundary tests
(`formatUptime(seconds(119))` / `formatUptime(seconds(3_600 + 119))`, etc.) and untouched by this
change beyond the added parameter.

## Verification

```
$ pnpm verify
 Test Files  79 passed (79)
      Tests  2400 passed (2400)
Type Errors  no errors
```

Exit 0, both before and after the harness run below (the second run confirms no mutation was left
stranded).

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
...
Red-test ledger: 93 distinct failing tests across 71 mutations; 87 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 71 regressions failed their check, as they must.
```

70 mutations existed before this change (per the handoff); 71 after — `10a-SC1` is the only
addition. Every mutation, including `10a-SC1`, exited non-zero (bit its test); no `DID NOT BITE`,
no `ANCHORS MOVED`, no `ANCHORS AMBIGUOUS`; every ⚠-marked test, including the new one, reddened
under at least one mutation.

```
$ git status --porcelain
 M dashboard/SPEC.md                                            # parent's ruling, pre-existing, not touched
 M dashboard/app/dashboard-shell.test.tsx                       # this change
 M dashboard/app/dashboard-shell.tsx                            # this change
 M dashboard/components/alarm-banner.test.tsx                   # this change
 M dashboard/components/alarm-banner.tsx                        # this change
 M dashboard/lib/format.ts                                      # this change
 M dashboard/pipeline/steps/10-panels-assembly/SCOPE.md         # parent's ruling, pre-existing, not touched
 M dashboard/pipeline/steps/10-panels-assembly/regressions.py   # this change
?? dashboard/pipeline/handoffs/10a-SC-elapsed-since.md          # this handoff, pre-existing
```

No stranded mutation from the harness run — the diff above is exactly the intended change set,
and the harness reverts each mutation itself around its check (verified: nothing outside the
files this note names is modified). `SPEC.md` and `SCOPE.md` were not edited by this agent.
