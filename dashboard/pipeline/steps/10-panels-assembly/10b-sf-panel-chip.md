# 10b — S-F: a panel head is never green over its own em dash

Implements the owner's ruling on F11 (deferred by 10b's reconciliation,
`10b-reconciliation.md` — the adjudication table's F11 row and §7's queue entry
"F11 / 10b-S-F"). §6.2's chip bullet is ruled 2026-09-08 (10b-S-F):

> The head is the **worst band among the readings that exist**, skipping `null`s — but a
> panel that would read **`normal` while any of its own readings is `—` shows no band
> instead.** It deliberately does **not** drop to no-band for `warn` or `alarm`: a panel
> must not lose its alarm colour because one unrelated field failed to parse. So a red GPU
> stays red with an unreadable SM clock, and a MEMORY panel with `RAM — / —` and a healthy
> swap shows **no band**, never a green tick.

10b was already committed at `bdc1c5c`; this is one build pass against a spec change the
parent made, not a four-phase loop.

## "Its own readings" — the definition, and why

The ruling's sentence answers this if read as one sentence rather than two: *"the worst
band among THE READINGS that exist, skipping `null`s"* names the combination a panel
already builds (`worstSeverity`); *"any of ITS OWN readings is `—`"* points at the same
set. So a **reading**, here, is defined as: **one argument to the worst-of computation
that produces this panel's chip** — nothing wider, nothing narrower. That resolves the
three questions the handoff posed by name:

- **A subtitle never counts.** §6.2: a subtitle is "identity, never measurement" — it
  carries no §6.3 band and is never a term in a `worstSeverity` call, so it structurally
  cannot be one of "its own readings".
- **A reading with no §6.3 row never counts either** — GPU power, utilisation, SM clock; a
  served model string; a SERVING row's port and ctx — even though every one of them is
  rendered. This is also *why* the "does not lose colour to an unrelated field" half of
  the ruling needs no special-casing: those fields were never a term in the chip's
  computation to begin with, so there is no hole in it for them to leave. "A red GPU stays
  red with an unreadable SM clock" falls out of the definition rather than being coded as
  an exception.
- **A row that is `—` because its whole COLLECTION was absent** (`serving: null`, `gpus:
  null`, a retired GPU card, `cooling: null`) never reaches the new logic at all — every
  panel with such a branch already set `chip: null` directly on it, before any severity
  ran, and that is unchanged. The new logic only ever sees the case the ruling is actually
  about: a reading inside an otherwise-present collection that individually failed to
  parse.

This is recorded in `components/panels/panel-chip.ts`'s own module doc, not only here, per
the handoff's "loop 10c and any future panel inherit it."

## Which panels can reach the case

A panel can only reach "would read `normal` while one of its own readings is `null`" if
its chip is a `worstSeverity`/`panelChip` combination of **two or more independent
leaves** — a chip built from exactly one leaf can never be `'normal'` while a *different*
leaf of its own is `null`, because there is no different leaf.

| panel | reachable? | why |
|---|---|---|
| **GPU 0 / GPU 1** | **yes** | three leaves — temperature, throttle, VRAM — any one can be `null` while the other two are `normal` |
| **MEMORY** | **yes** | the finding itself: RAM% and swap are independent leaves |
| **COOLING** | **yes** | fan 5, fan 1–4 (four leaves), and the fan-service unit state |
| **SAFETY** | **yes, narrowly** | `ufwSeverity`/`pwm5Severity`/`dkmsSeverity` are §6.3's TOTAL functions (never `null` — a bad reading bands `watch`, not `null`), so only `fanServiceSeverity` can supply the `null`; reachable when the fan-service state is unreadable while the other three check out |
| **SERVING** | **yes** | each instance contributes two leaves (unit state, health); reachable across instances or within one |
| **STORAGE & NETWORK** | **yes** | root free%, home free%, link state are three independent leaves |
| **CPU** | **no** | its chip is `severityCpuTemp(cpuTempC)` alone — one leaf. If it is `null` the chip is already `null`, not a false `'normal'`; utilisation and load average are unbanded and were never terms in the chip |
| **SESSION EVENT LOG** | **no** | `chip={null}` is a constant — it has no §6.3 reading to band at all, so there is no `'normal'` to ever downgrade |

Seven of nine panels are reachable; CPU and SESSION EVENT LOG are not, and both are left
untouched with a doc comment recording why (`cpu-panel.tsx`, `session-event-log-panel.tsx`)
rather than wrapped in a no-op `panelChip` call.

## What changed

**New file, `components/panels/panel-chip.ts`** — the one shared implementation:

```ts
export const panelChip = (...severities: readonly (Severity | null)[]): Severity | null => {
  const worst = worstSeverity(...severities);
  return worst === 'normal' && severities.includes(null) ? null : worst;
};
```

It lives in `components/`, not `lib/`, because `lib/severity.ts` is out of scope for this
loop (10b-S-G's queued §4 wire change owns `lib/`) and cannot be edited to carry the
override itself. It imports and reuses `worstSeverity` from `lib/severity.ts` (reading it,
not editing it).

**⚠ Call it with LEAF severities, never one `lib/severity.ts` already folded together.**
A few `lib/severity.ts` exports already combine more than one raw reading into a single
`Severity | null` with an ordinary `worstSeverity()` call inside — `severityMemory` (RAM %
and swap) is the one the finding is about. Passing `severityMemory(host)` to `panelChip`
would be too late: its own inner `worstSeverity` has already thrown the `null` away and
returned `'normal'`, and nothing downstream can see that RAM's reading was the one
missing. Every call site below was checked against this and passes the actual leaves.
`severityFan5` is the one documented exception, passed whole: §6.3 already treats it as a
single reading (one tach, one row) and its own doc records it was written specifically not
to lose a `null` this way.

**Six panel files, each swapping `worstSeverity` → `panelChip` at the chip line, and in
COOLING's case also flattening a pre-combined intermediate that would otherwise have
hidden a null before `panelChip` ever saw it:**

- `gpu-panel.tsx` — `panelChip(severityGpuTemp(…), decode?.severity ?? null, severityVram(…))`.
- `memory-panel.tsx` — was `severityMemory(host)`; now
  `panelChip(severityRam(used, total), severitySwap(swap))` — the two leaves directly,
  since `severityMemory` is exactly the pre-combined helper the ruling's finding is about.
- `cooling-panel.tsx` — was `worstSeverity(fan5Severity, fan1234Severity, serviceSeverity)`
  where `fan1234Severity` was itself `worstSeverity` of the four `severityFanStopped`
  calls. That inner combination would have thrown away a lone `null` among fan 1–4 before
  the outer call ever saw it — the same shape of bug as `severityMemory`, one level
  further in. Flattened to `panelChip(fan5Severity, severityFanStopped(fan1), …fan4,
  serviceSeverity)`, six leaves, no intermediate.
- `safety-panel.tsx` — `panelChip(ufwSeverity, pwm5Severity, dkmsSeverity, fanServiceSeverity)`.
- `serving-panel.tsx` — `panelChip(...instances.flatMap(i => [severityUnitState(i.unitState), severityHealth(i.health)]))`
  for the panel's own chip. The per-row `severity` inside `instanceRow` (a row's own
  colour, not the head) is untouched and still calls `worstSeverity` — the ruling is about
  the panel HEAD only.
- `storage-network-panel.tsx` — `panelChip(rootSeverity, homeSeverity, linkSeverity)`.

Each edited file carries a `⚠ 10b-S-F` comment at the changed line pointing at
`panel-chip.ts`'s module doc rather than re-deriving the argument locally.

**`cpu-panel.tsx` and `session-event-log-panel.tsx`** — left calling their existing single
leaf / constant `null`, with a doc comment added recording that this ruling does not reach
them and why (see table above), so a future reader does not "fix" them into a needless
`panelChip(x)` wrapper.

**`components/panels/memory-panel.test.tsx`** — one pre-existing ⚠ test's assertion was
mis-scoped (`expect(html).toContain('data-severity="none"')`, unscoped over the whole
document) and was passing for the wrong reason: the RAM Meter's own `severity`
(`severityRam(used, total)`, independent of the head chip) is `null` in that exact
fixture, so the assertion was true even under the pre-fix chip logic — the same
document-wide `toContain` shape ANCHOR §9 already flags as having fooled three loops
(`toContain('paused')`, `toContain('refresh')`, `toContain('—')`), now caught a fourth
time inside this test rather than as a fresh finding. Left in place (still true, still
useful) and a note added explaining why it is not evidence for 10b-S-F, then a new
`describe('⚠ 10b-S-F — the panel HEAD never bands normal over its own em dash', …)` block
added with three tests, scoped to the head (`html.slice(0, html.indexOf('</header>'))`):

1. **⚠ The finding, reproduced and fixed** — `RAM: null, memTotalGiB: 61, swap: 0` (normal)
   → head is `data-severity="none"`, never `"normal"`.
2. Not ⚠, documentation — RAM and swap both present and normal → head is `"normal"`,
   ordinarily (the downgrade must not over-fire).
3. **⚠ The ruling's whole point** — `RAM: null, memTotalGiB: 61, swap: 2 GiB` (alarm) →
   head **stays** `data-severity="alarm"`, never downgraded to `"none"`.

**`components/panels/panel-chip.test.ts`** (new) — eight unit tests directly on
`panelChip`, three marked ⚠, named individually (not `test.each`-d) so each of the three
cases in the bar can be seen failing on its own:

```ts
test('⚠ normal + a null reading → NO BAND …', () => expect(panelChip('normal', null)).toBeNull());
test('⚠ normal + no nulls → normal …',        () => expect(panelChip('normal', 'normal')).toBe('normal'));
test('⚠ alarm + a null reading → STILL ALARM …', () => expect(panelChip('alarm', null)).toBe('alarm'));
```

plus non-⚠ documentation tests (`watch` + null stays `watch`; all-null and no-args both
give `null`; ordinary multi-value ranking still works).

## Beware the equivalent mutation — why three panel-chip.ts mutations, not one

A single "does the downgrade exist at all" mutation would not distinguish *how* it is
wrong, and the handoff calls out exactly this risk ("four reconciliations have now caught
mutations turning vacuous when a new guard subsumed an old one"). Three mutations, each
isolating one way to get the boolean logic wrong:

- **`10b-PH1`** — `severities.includes(null) ? null : worst` (drops the `worst === 'normal'
  &&` guard). This is the **careless fix** the handoff warns about by name: it downgrades
  `alarm`/`watch` too, not only `normal`. It reddens `panel-chip.test.ts`'s "alarm + a null
  reading → still alarm" test and `memory-panel.test.tsx`'s case 3 — confirming the third
  case is the one this specific mistake breaks.
- **`10b-PH2`** — `return worst;` (drops the downgrade entirely — the pre-ruling
  behaviour). Reddens the "normal + a null reading → no band" test and `memory-panel`'s
  case 1: exactly the original finding, reintroduced.
- **`10b-PH3`** — `worst === 'normal' ? null : worst` (drops the null check — downgrades
  *every* normal read, even a fully-present one). Reddens "normal + no nulls → normal":
  the case that proves the downgrade doesn't over-fire.

`10b-PH1` and `10b-PH2` both check `MEMORY_PANEL_TEST` alongside `PANEL_CHIP_TEST`, so the
shared helper's own mutations double as evidence that MEMORY is actually wired to it,
without a second copy of the same logic to keep in sync.

**`10b-MP6`** — a mutation on `memory-panel.tsx` itself, separate from the three above:
`panelChip(severityRam(used, total), severitySwap(swap))` → `severityRam(used, total) ??
severitySwap(swap)`, reintroducing `worstSeverity`'s exact null-skip at the *call site*
rather than inside `panelChip`. This guards the **wiring**: `10b-PH1`/`10b-PH2` would not
catch a regression where `panelChip` itself stayed correct but MEMORY stopped calling it
correctly. Reddens case 1.

**`10b-MP2`** (pre-existing, re-aimed) — its anchor was the now-deleted
`severityMemory(host)` line; updated to the new `panelChip(severityRam(…), severitySwap(…))`
line with the same intent (drop the swap leaf, band on RAM% alone) so it did not go
`ANCHOR NOT FOUND` after this change.

No other pre-existing mutation's anchor text overlapped code this loop touched (checked
by grepping `regressions.py` for every line this loop removed before editing).

## Scoping — assert on the head, not the document

Every new test that checks the chip's colour slices `html` at `indexOf('</header>')`
first, matching `memory-panel.test.tsx`'s own existing convention (`⚠ the HEAD chip
alarms from swap alone…`) rather than `expect(html).toContain(...)` over the whole
rendered panel — the shape ANCHOR §9 names as having already fooled three loops via `—`,
`paused`, and `refresh`, and now a fourth time via `data-severity="none"` inside this
file's own pre-existing test (see above).

## Verification

```
$ pnpm typecheck
$ tsc --noEmit
(clean)

$ pnpm verify
 Test Files  93 passed (93)
      Tests  2570 passed (2570)
Type Errors  no errors
```

Exit 0, both before and after the harness run below.

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
...
Red-test ledger: 173 distinct failing tests across 133 mutations; 155 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.

All 133 regressions failed their check, as they must.
```

129 mutations existed before this change (per the handoff); 133 after — `10b-PH1`,
`10b-PH2`, `10b-PH3` and `10b-MP6` are the additions (`10b-MP2` was re-aimed, not added).
Every mutation, including all four new ones, exited non-zero; no `ANCHORS MOVED`, no
`ANCHORS AMBIGUOUS`, no `DID NOT BITE`; every ⚠-marked test, including the five new ones
(three in `panel-chip.test.ts`, two in `memory-panel.test.tsx`), reddened under at least
one mutation.

```
$ git status --short
 M SPEC.md                                                    # parent's ruling, pre-existing, not touched
 M components/panels/cooling-panel.tsx                        # this change
 M components/panels/cpu-panel.tsx                            # this change (doc comment only)
 M components/panels/gpu-panel.tsx                            # this change
 M components/panels/memory-panel.test.tsx                    # this change
 M components/panels/memory-panel.tsx                         # this change
 M components/panels/safety-panel.tsx                         # this change
 M components/panels/serving-panel.tsx                        # this change
 M components/panels/session-event-log-panel.tsx              # this change (doc comment only)
 M components/panels/storage-network-panel.tsx                # this change
 M pipeline/steps/10-panels-assembly/regressions.py            # this change
?? components/panels/panel-chip.test.ts                       # this change
?? components/panels/panel-chip.ts                            # this change
?? pipeline/handoffs/10b-SF-panel-chip.md                      # this handoff, pre-existing
```

No stranded mutation from the harness run — the diff above is exactly the intended change
set (the harness reverts each mutation itself, in a `finally`, around its own check).
`SPEC.md` was not edited by this agent. `lib/` and `app/` were not touched, keeping clear
of 10b-S-G's queued §4 wire change. `purity.test.ts` (no hooks in `components/`) is
unweakened and green over both new files (`panel-chip.ts` is a plain `.ts` module with no
JSX and no hook call; `panel-chip.test.ts` is excluded from the scan like every other
`.test.ts` file).
