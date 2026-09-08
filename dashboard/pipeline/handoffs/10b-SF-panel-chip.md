# Handoff — 10b-S-F: a panel head is never green over its own em dash

**Written by the parent, 2026-09-08, implementing an owner ruling.** Fresh agent, no memory of
this project. Read this file, then `SPEC.md` §6.2's **chip** bullet (the **ruled 2026-09-08
(10b-S-F)** block) and §6.3, then `steps/10-panels-assembly/10b-reconciliation.md` (**F11**), then
`ANCHOR.md` §4/§9.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree has **`SPEC.md` modified by the
parent** — that is the ruling. **Do not edit it.** 10b is committed at `bdc1c5c`.

## Why this is not a four-phase loop

10b already ran build → test → adversarial → reconcile → parent review and is committed. F11 was
**deferred to the owner**, not rejected, because it changes what every panel head means and that
was not a reconciler's call. The owner has ruled. One build pass plus the parent's review.

## The finding

MEMORY with `RAM — / —` and a healthy swap renders a **green ✓ above an em dash**. Reproduced by
the adversarial. Today's behaviour is `worstSeverity` over the bands that exist, skipping `null`s
— which is what §6.3 literally supports, and is why it was not treated as a defect.

## The ruling — implement exactly this

**The head is the worst band among the readings that exist, skipping `null`s — EXCEPT that a panel
which would read `normal` while any of its own readings is `—` shows NO BAND instead.**

- ⚠ **It does not drop to no-band for `warn` or `alarm`.** That was the rejected alternative and
  the reason matters: a panel must not lose its alarm colour because one unrelated field failed to
  parse. **A red GPU stays red with an unreadable SM clock.** Only the `normal` case changes.
- The rule applies to a panel's **own** readings. §9's *"a dashboard that goes green because it
  stopped being able to look"* governs the **aggregate**, which conditions already protect; this
  applies the same refusal one level down, to the specific claim §9 objects to.
- MEMORY with `RAM — / —` and a healthy swap must show **no band**, never a green tick.

⚠ **"Any of its own readings" needs a definition and the spec does not give you one.** Decide it
deliberately and **write it down**: does a subtitle field count? A reading the panel does not
render? A row that is `—` because its whole collection was absent rather than because one figure
failed? Pick the reading that the panel actually *displays* unless you have a better argument, and
record the choice — 10c and any future panel inherit it.

## The bar

- **Mark the load-bearing test `⚠`**, back it with a **`10b-`**-prefixed mutation in
  `pipeline/steps/10-panels-assembly/regressions.py` (ids carry their creating step).
- **Both directions, and the third:** `normal` + a null → **no band**; `normal` + no nulls →
  green; **`alarm` + a null → still alarm.** That third case is the ruling's whole point and is
  the one a careless implementation breaks.
- ⚠ **Beware the equivalent mutation** — four reconciliations have now caught mutations turning
  vacuous when a new guard subsumed an old one. They print `DID NOT BITE`, which reads as an inert
  test when the truth is a vacuous mutation.
- ⚠ **Scope assertions to the panel HEAD, not the document.** `expect(html).toContain('—')` is
  satisfied by any em dash on the page — that exact shape has now fooled three loops
  (`toContain('paused')`, `toContain('refresh')`, `toContain('—')`). Assert on the head's own
  element.
- Applies to **all nine panels**, not only MEMORY. Say which ones can actually reach the case.

## Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 129 mutations before your change
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ **Do not poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; orphans killed twice).
  Plain **sequential foreground commands**.
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`** — no hooks in
  `components/`. Scope: `components/panels/`, `components/`, step 10's harness.
- ⚠ **Do NOT touch `lib/` or `app/`.** A separate §4 wire change (10b-S-G) is queued and will
  edit `lib/`; keep out of its way.

## Deliverable

`steps/10-panels-assembly/10b-sf-panel-chip.md`: your definition of "its own readings" and why,
which panels can reach the case, the three-case fixtures, your ⚠ test and its mutation. End with
`pnpm verify`, the harness result, and `git status`. Report back briefly.
