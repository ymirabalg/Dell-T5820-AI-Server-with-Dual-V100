# 10c1-reconciliation — the composed render, adjudicated

**Run 2026-09-08.** Fresh agent, RECONCILE phase of 10c-1. Branch `dashboard-frontend`; 10c-1
uncommitted, everything else at `be53c8d`. **Nothing committed, nothing staged, `SPEC.md`
untouched, `purity.test.ts` unweakened, nothing outside `dashboard/` changed.**

12 adversarial findings, **all 12 adjudicated: 10 ACCEPTED, 0 REJECTED, 2 DEFERRED** (both
deferrals are the *guard-shaped half* of a finding whose live instance was fixed here).

---

## 0. The headline, and why it is one finding rather than four

**A1, A2 and A11 are the same defect at three sites in one file**, and A10 explains why all
three shipped green:

> `components/panels/` assumed `snapshot.gpus` and `snapshot.serving` are **dense arrays indexed
> from zero**. Both collectors document, in their own source, that they are not.

- `lib/collectors/llama.ts:61 discoverInstances()` returns `[...found].sort()` — the **set** of
  instance indices whose `<i>.env` was read. `serving: [{ instance: 1, … }]` is a shape the
  collector is *designed* to produce.
- `lib/collectors/nvidia-smi.ts:147` states *"a row whose `index` will not parse is a `problems`
  entry and not a GPU"*, and line 171 implements it. `gpus: [{ index: 1, … }]` is likewise real.

A hard-coded `=== 0` **was** already caught by the existing tests. Only the **positional**
variant escaped — and it escaped because **`stateOfTwoGpus()` built card 1 as
`{ ...gpu0, index: 1 }`**: same name, same bus, same temperature, same VRAM. Two
indistinguishable subjects make a positional read observationally identical to an index read.

⚠ **The rule this loop leaves behind, and it is the transferable part:
a fixture whose two subjects are identical cannot discriminate between them.** A two-GPU helper
existed, was used by two tests, and still hid three of the adversarial's four simultaneous wrong
edits. Fixture *presence* is not fixture *power*.

A3/A4 are the same species one level out (an assertion whose subject does not render cannot
fail), and A10 is the finding that had to be acted on hardest because it is what made the other
four cheap to ship.

---

## 1. The adjudication table — all 12

| # | finding | verdict | reason, and what was done |
|---|---|---|---|
| **A1** | §6.2's `gpu.index === serving.instance` join replaced by `serving[index]`, whole suite green | **ACCEPTED** | Reachable, not hypothetical — `discoverInstances` returns the sorted *set* of found indices, so a missing `0.env` gives `serving: [{instance: 1}]` and GPU 0's card then prints instance 1's model under an honest-looking `served by instance 0` label. That is §6.2's named failure verbatim. **Fix:** a test rendering a sparse `serving[]` into **both** slots (em dash on `gpu0`, the model on `gpu1` — the positive direction was unasserted anywhere), plus mutation **`10c-GP4`**. Verified reddening by hand before wiring the anchor |
| **A2** | `gpuAt` has the identical hole; `gpus[index]` renders GPU 1's die titled *GPU 0* | **ACCEPTED** | Same class, same file, same evidence (`nvidia-smi.ts` documents skipping an unparseable row). The adversarial's own asymmetry note is right: a hard-coded `=== 0` **is** caught; only positional escapes. **Fix:** a test with `gpus: [{index: 1}]` asserting both directions (`gpu0` → *card not enumerated* and no 55 °C; `gpu1` → its own card), plus mutation **`10c-GP5`** |
| **A3** | GPU 1's toggle wiring has zero coverage — both toggle tests use the one-GPU `stateOf()`, so `gpu1` renders §6.5's takeover and the negative assertion cannot fail | **ACCEPTED** | Measured, not argued: under `stateOf()` the `gpu1` cell has no `<svg>`, no button and no `table-view`. The assertion read as independence and asserted the fixture. **Fix:** the independence test now drives `stateOfTwoGpus()` and asserts its own precondition (`not.toContain('card not enumerated')`); a new test **clicks GPU 1's own button**; mutations **`10c-DS5`** (slot fed `chartViews.gpu0`) and **`10c-DS6`** (click routed to `gpu0`) |
| **A4** | COOLING's toggle wiring unasserted for the same reason — only `gpu0` and `cpu` were ever clicked | **ACCEPTED** | HANDOVER §0.5's *"used more than once, mutated once"* at a fourth call site. COOLING's `view=` was in fact guarded (feeding it another panel's entry flips it when GPU 0 is clicked); its `onToggleView=` was guarded by nothing. **Fix:** a test clicking COOLING's own button, plus mutation **`10c-DS7`**. All four per-slot wirings are now clicked |
| **A5** | The production gate rests on one undefended token; replacing `process.env.NODE_ENV` with `'development'` reached a real `pnpm build` chunk with everything green | **ACCEPTED** (as a behavioural test, **not** a source-text guard) | The parent's settled fact and A5 are both true and not in tension: the call *does* bake `"production"` today, and *nothing defended it*. This is 10c-1's own new code, and the test phase had already flagged the wiring as having zero test and zero mutation coverage — so it is this loop's, not 10c-2's. A source-text lint **would** have been 10c-2's; a behavioural test is not guard-shaped. **Fix:** `lib/client/use-telemetry.force-alarm.test.tsx` mounts the hook against a mocked runtime, captures the `fetchTelemetry` it *builds*, and asserts that with `NODE_ENV` stubbed to `production` the flagged query string does nothing. Mutation **`10c-UT1`** is the adversarial's exact edit |
| **A6** | The escape hatch's *development* path had never been shown to work — the one live trial ran on a GPU-less Mac where a broken hatch looks identical | **ACCEPTED** | Correct and cheap to close alongside A5, exactly as the adversarial predicted. **Fix:** same new file — with the flag set and `NODE_ENV` not production, GPU 0's `tempC` is forced to 95; without the flag the body is handed on as the *same reference*. Mutations **`10c-UT2`** (`location.search` → `location.hash`) and **`10c-UT3`** (wrapper dropped); **`10c-FA2`**'s file list widened so removing the query gate reddens the no-flag case too |
| **A7** | The test phase's central CSS claim is false — `.module.css` resolves to a **Proxy**, not `{}`; two live guards depend on it | **ACCEPTED** | Verified by the adversarial **and independently by the parent** before this phase started. `Object.keys` is `[]` (hence `console.log` printing `{}`) but `styles.gpu0` → `_gpu0_e75739`. `grid.test.tsx`'s tier-2 placement guard and `dashboard-shell.test.tsx`'s sticky-band assertion **would fail** if the claim were true — a green suite refutes it. Acting on §1.2 as written would have weakened the guard 10a added to close its own F1. **Fix:** `10c1-test.md` §1.2 rewritten as a **marked correction** with the original text struck, not deleted, and the §1 headline sentence withdrawn in the same block. No code change — there was nothing wrong with the code |
| **A8** | The real void is the opposite one: **every key resolves, including keys with no rule**; `alarm-banner.tsx` uses `styles.item` against a stylesheet declaring no `.item` | **ACCEPTED in part** — live instance fixed; the mechanical audit **DEFERRED to 10c-2** | The instance is real and pre-existing (10a). Neither `tsc` (the module is typed as an index signature) nor any test can see it. **Fix:** the dangling `className={styles.item}` is removed — a **behaviour-preserving** change, since in production `styles.item` was already `undefined` and React dropped the attribute; the layout is `.rest`'s own `flex-wrap: wrap; gap: .4em 1em`. A comment at the site records why the attribute is absent. ⚠ **Not invented:** declaring an `.item` rule would have been a design decision the spec is silent on. **Deferred:** the ~15-line static audit (every `styles.X` against its sibling stylesheet's selectors) is a mechanical lint and belongs beside `10b-F1-guard` and `L11` in **10c-2** |
| **A9** | The browser is not the only answer to the CSS question — three tiers, only *paint* needs a browser | **ACCEPTED** as scope guidance; recorded, no code | The tiering is right and sharpens 10c-3 rather than expanding this loop. **binding** is observable in jsdom today (A7 proves it, `grid.test.tsx` tier 2 does it); **reference** is statically checkable with no runtime (A8's audit → 10c-2); **paint** — cascade, specificity, media queries, `display:none` at ≥1600px, overflow, stacking — genuinely needs a real browser and is **10c-3's, and only that**. Written into `HANDOVER.md` so 10c-3's scope is not re-derived |
| **A10** | The two-GPU fixture that exists is indistinguishable from one card, which is why A1/A2/A11 all shipped green | **ACCEPTED** — and acted on hardest | Not a bug report; the *explanation*. **Fix:** `stateOfTwoGpus()` now differs in the fields the panel renders (`tempC` 66 / 55, and a distinct `name`/`bus` on card 1), and a new shell test asserts **each GPU cell carries its own card's readings and identity**, scoped with `cellFor` per HANDOVER §0.4. The lesson is written into `HANDOVER.md` as a standing rule |
| **A11** | GPU 1's temperature *trace* can read GPU 0's card — `10c-CO4`'s exact twin in the other file | **ACCEPTED** | The sibling-case rule this project keeps paying for: the test phase fixed COOLING's `g.index === 1` and stopped. `gpu-panel.test.tsx` asserted trace *content* at no index. **Fix:** a test rendering `panelId="gpu1"` in table view against a 66/55 two-card snapshot, asserting `<td>55 °C</td>` and **not** `<td>66 °C</td>`, plus mutation **`10c-GP6`** |
| **A12** | `regressions.py:437` cites `10c-DS-WIRE*` mutations that do not exist | **ACCEPTED** | Confirmed by grep — zero occurrences of that id anywhere. It is the only place a future reader is told where `10a-PP2`'s coverage went, and it was written by the phase that also wrote the correct mutations. **Fix:** the comment now names `10c-DS1` plus `10c-DS5/6/7`, and carries its own correction note |

**Zero rejections, and that deserves the scrutiny ANCHOR §8 rule 2 demands.** The reason is
structural rather than generous: ten of the twelve were **EXECUTED** — the adversarial applied
the edit and pasted the green run — so the question for each was not *is this real* but *whose
loop closes it*. The two findings with judgement in them (A5's guard placement, A8's audit) are
the two that were split, and both splits are recorded above with the line drawn and why.

---

## 2. What was applied — the whole diff, by file

| file | change |
|---|---|
| `components/panels/gpu-panel.test.tsx` | **+3 ⚠ tests** — the sparse-`serving` join (A1, both directions), the sparse-`gpus` card lookup (A2, both directions), GPU 1's own trace (A11) |
| `app/dashboard-shell.test.tsx` | `stateOfTwoGpus()` **made discriminating** (A10); a `clickToggleIn(slot)` helper that matches on the shared `view` word rather than `table view` (the label tracks the current view — matching the label would silently find nothing on a second click); the independence test moved onto the two-GPU state and given an explicit precondition (A3); **+3 ⚠ tests** — per-card readings and identity (A10), GPU 1's own toggle (A3), COOLING's own toggle (A4) |
| `lib/client/use-telemetry.force-alarm.test.tsx` | **NEW, +4 tests (3 ⚠)** — the escape hatch's *wiring* (A5/A6). Mocks `./runtime` and `./env` to capture the `fetchTelemetry` the hook builds, so the real poll loop stays out (`use-telemetry.test.tsx` records a mutation there costing 506 s and a heap OOM) |
| `components/alarm-banner.tsx` | the dangling `className={styles.item}` removed, with the reasoning recorded at the site (A8) |
| `pipeline/steps/10-panels-assembly/regressions.py` | **+9 mutations** — `10c-GP4/5/6`, `10c-DS5/6/7`, `10c-UT1/2/3`; `FORCE_ALARM_WIRING_TEST` added to `LEDGER_FILES`; `10c-FA2`'s file list widened; the `10c-DS-WIRE*` comment corrected (A12) |
| `pipeline/steps/10-panels-assembly/10c1-test.md` | §1.2 replaced by a **marked correction**, original struck (A7); the §5 `!==`→`===` justification corrected in place, finding upheld |

**No production `.tsx`/`.ts` behaviour changed except A8's one attribute.** A1/A2/A11 were
already *correct* in the source — what was missing was anything that could tell if they stopped
being correct. That is the honest shape of this loop: it bought falsifiability, not fixes.

⚠ **`10c-GP6` is `10c-CO4`'s twin and they were written a phase apart.** When a lookup keyed on
a card index is found unguarded in one file, **grep the other panels for the same lambda before
closing the finding.** This is the third loop in a row where a sweep stopped at the first
instance (10b's four-of-nine invariant-1 sweep, the test phase's cooling-only fix, and now this).

---

## 3. Verification

Sequential foreground, never concurrent (ANCHOR §4/§9). No `pgrep` wait loop was written.

```
$ pnpm verify
 Test Files  95 passed (95)          (was 94)
      Tests  2627 passed (2627)      (was 2617: +3 gpu-panel, +3 shell, +4 wiring)
Type Errors  no errors
   EXIT 0
```

**Harnesses re-run: step 10's only** (`pipeline/steps/10-panels-assembly/regressions.py`). It is
the only harness whose `LEDGER_FILES` this phase touched — verified by grepping every
`pipeline/steps/*/regressions.py` for the four files changed; step 8's is the only other hit and
it is a docstring mention of `use-telemetry.ts`, not a ledger entry or a mutation anchor.

```
$ python3 pipeline/steps/10-panels-assembly/regressions.py
Red-test ledger: 215 distinct failing tests across 168 mutations; 196 ⚠-marked tests checked.
Every ⚠-marked test went red under at least one mutation.
All 168 regressions failed their check, as they must.
```

168 = the test phase's 159 + 9. 196 ⚠ marks = 187 + 9.

**Each of the nine new mutations was also verified reddening by hand, before its anchor was
written into the harness** — mutate, run the one test file, restore, diff against a backup. The
harness confirming them afterwards is a second, independent check, not the only one.

```
$ git status --short      # after the harness: no stranded mutation
   ... identical to the phase's list, plus
 M components/alarm-banner.tsx
?? lib/client/use-telemetry.force-alarm.test.tsx
```

`gpu-panel.tsx`, `dashboard-shell.tsx` and `use-telemetry.ts` were each `diff`ed byte-for-byte
against a pre-experiment backup after the hand mutations and again after the harness.

⚠ **This green is not the green** (ANCHOR §8). The parent re-runs `pnpm verify` itself.

---

## 4. Deferred, with owners

| id | item | owner |
|---|---|---|
| **10c1-A8-audit** | The static CSS-reference audit — for each `.tsx`, every `styles.X` against the selectors its sibling `.module.css` declares. ~15 lines, no browser, no runtime. Its live instance is fixed; the *mechanism* that let it hide is not | **10c-2** (guards), beside `10b-F1-guard` and `L11` |
| **10c1-A9-paint** | The browser step owns **paint only** — cascade, specificity, media queries, the ≥1600px `display:none` promotion, overflow, stacking. It must not be asked to carry binding (jsdom, today) or reference (a static check) | **10c-3** (sizing/visual) |

Nothing else was deferred. The other ten findings are closed in the tree.

---

## 5. Spec questions handed up — none new

Invariant 7 was checked at the two places this phase came near a silence, and neither is one:

1. **A8's `.item`.** Whether a multi-condition banner should be forbidden from wrapping
   mid-condition (`white-space: nowrap` on each item) **is** a spec silence — and this phase did
   **not** answer it. Declaring a rule would have been inventing; the reference was removed
   instead, which is behaviour-preserving. Recorded for **10c-3's browser pass** as a question to
   *look at*, not a decision to take here: today the layout works on `.rest`'s gap, by luck
   rather than design.
2. **A5's guard placement.** §6.2 and §9 say nothing about a test-only escape hatch, but nothing
   here required them to — the question was which loop owns a defence, which is process, not spec.

The build phase's own four invariant-7 recordings (toggle granularity, the browser step's
manual-procedure status, the corrected minifier claim, the dev-Mac `/api/telemetry` anomaly) are
re-read and **stand as written**; none is contradicted by anything found this loop.

---

## 6. What is still open in this area, and is nobody's finding

- **The dev-Mac anomaly** (`10c1-build.md` §1 item 4): every panel renders its pre-first-poll
  body against this machine's own `/api/telemetry`, suggesting the response fails `wire.ts`
  validation wholesale. A collectors/wire question (steps 3–6), out of 10c's scope, still
  recorded for whoever next runs the app locally without `ai-server`'s hardware.
- **Measurements 1–4 and 6** of the seven-viewport browser check remain unexercised — the
  build phase's remote-Chrome session could not set viewport width (`window.innerWidth` read a
  constant 3440 across every `resize_window` call). That is a tooling limit, correctly separated
  from the app, and it is the concrete argument for giving 10c-3 a purpose-built harness.
