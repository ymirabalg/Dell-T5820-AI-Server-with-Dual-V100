# Handoff — S-C: the banner's "since" becomes an elapsed form

**Written by the parent, 2026-09-08, implementing an owner ruling.** Fresh agent, no memory of
this project. Read this file, then `SPEC.md` §6.4 (the **ruled 2026-09-08 (S-C)** block) and §6.5's
stale row, then `steps/10-panels-assembly/10a-reconciliation.md` §3.4 and §5 (finding **F12**),
then `ANCHOR.md` §4/§8/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. **`SPEC.md` and `SCOPE.md` are modified by
the parent** — those are the rulings you implement. **Do not edit either.**

## Why this is not a four-phase loop

10a already ran build → test → adversarial → reconcile → parent review and is **committed**
(`b4ffa3e`). F12 was **deferred to the owner**, not rejected, because §6.4 never contemplated the
case and inventing a rendering would be inventing spec. The owner has ruled. This is the
implementation of a settled decision: one build pass plus the parent's review.

## The finding

`since 03:00:14` on a wall panel open since Friday is **indistinguishable from six hours ago**.
§6.4's own example stays inside one day; decision 7 makes multi-day the expected case for this
machine.

## The ruling — implement exactly this

**The banner's "since" renders as an ELAPSED form: `for 2 d 06:00`.**

- Use **`formatUptime`'s existing vocabulary** (`lib/format.ts`, §3.2's four forms). ⚠ **Do not
  write a new duration formatter** — §6.6 pins the locale once and this project has already had to
  fix a locale in four places. If `formatUptime`'s shape does not fit, say so in your notes rather
  than inventing a fifth form.
- ⚠ **F10 already put elapsed text in this banner** (`last read 6:12 ago`, the stale age, ruled as
  S-B). The two must **agree in form** rather than mixing a clock time with an elapsed one. Read
  what F10 shipped before you choose your rendering.
- **A date prefix on the clock time was the alternative and was NOT taken.** It preserves the exact
  instant but answers *"when did it start"* when the operator's question is *"how long has this
  been wrong"*. Do not implement it, and do not add it "as well".

⚠ **`sinceMs` is when the CONFIRMED band was first observed** (O4), not when the reading first
crossed. You are changing the *rendering*, not the semantics — if your change would alter which
instant is displayed, stop and report.

## The bar

- **Mark the load-bearing test `⚠`** and back it with a mutation in
  `pipeline/steps/10-panels-assembly/regressions.py`, prefixed **`10a-`** (ids carry their creating
  step, and this closes 10a's own deferred finding).
- ⚠ **Beware the equivalent mutation.** 10a's reconciliation and Q2's both caught mutations turning
  vacuous when a new guard subsumed an old one; they print `DID NOT BITE`, which reads as an inert
  test when the truth is a vacuous mutation. Yours must be a **wrong implementation somebody would
  plausibly write** and must redden **deterministically**.
- **Both directions.** A duration under one day and a duration over it — "every boundary guard
  needs a fixture on both sides" is a rule three steps here have already broken.
- **A test that names a property it does not check has appeared in every step.** Read the name
  against the body.

## Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 70 mutations before your change
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ **`pnpm verify` is NOT deterministic today** — `lib/collectors/serving.test.ts` has a
  wall-clock-flaky ⚠ test (95 ms sleep in a 100 ms budget, reproduced 2/6 under load), deferred to
  10c. **If a `serving` test fails, re-run before believing it**, and do not "fix" it here.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9). Plain **sequential
  foreground commands**. The parent has already killed two orphans from this.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit. Do not edit `SPEC.md` or `SCOPE.md`. Do not weaken `purity.test.ts`.**
- Scope: `components/`, `app/`, `lib/format.ts` if genuinely required, and step 10's harness.

## Deliverable

`steps/10-panels-assembly/10a-sc-elapsed-since.md`: what you changed, whether `formatUptime` fitted
and what you did if not, how your rendering agrees with F10's stale-age text, your ⚠ test and its
mutation, and both-sides fixtures. End with `pnpm verify`, the harness result, and `git status`.
Report back briefly.
