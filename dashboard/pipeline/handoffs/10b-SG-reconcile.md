# Handoff — 10b-S-G, RECONCILE phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

⚠ Background subagent. `ANCHOR.md` §8 lists **four things the parent does not delegate** (§4) and
defines the **parent's review** as the phase that closes this. Read §8 first.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `SPEC.md` §4's `errors[].instance` block
and §6.5 → `10b-sg-error-instance.md` → `10b-sg-test.md` → `10b-sg-adversarial.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. S-G uncommitted; everything else at `da78491`.

## 1. The item

`TelemetryError` gained an optional `instance?: number`, making the `errors[]`→`llama-server` join
structural instead of a substring match on message text. Adversarial raised **11 findings, 9
EXECUTED**. Adjudicate **every one** ACCEPTED / REJECTED / DEFERRED **with a reason**.

## 2. ⚠ Confirmed by the parent

| | |
|---|---|
| **A1** | `namesInstance` is called at `serving-panel.tsx:130` **and** `:134`. Only the first has a mutation. The adversarial replaced the `:134` filter with `servingErrors` — **full suite green, 93 files / 2587 tests** |
| **A2** | `panelsForSource('dbus')` returns `['cooling','serving','safety']` (`observations.ts:310`), and `cooling-panel.tsx:113` does `findLast(e => e.source === 'dbus')` with **no instance filter** |
| green | `pnpm verify` exit **0**, 93 files, 2587 tests — parent, on the tree adversarial left |
| **My strongest lead did NOT land** | an orphaned `instance` degrades correctly to `PanelNotes`; the explanation never vanishes. It is **untested**, and the missing fixture is the same uncovered line as A1. Do not let anyone "fix" a non-bug |

## 3. The two that decide this

### 3.1 A1 — the untested direction

The "too few" direction is covered; **"too many" has no assertion anywhere.** Dropping the filter
ships every attributed message **twice** — on its own row *and* again as a panel-level note
asserting a collector-wide fault. This is the ledger's blind spot in its purest form: a line with
no mutation, in a file that has one.

### 3.2 A2 — F2's disease, alive in two other panels

The exact entry `collectServing` files when systemd has no record of instance 1 renders as
`fan service | active | llama-server@1.service: NoSuchUnit: systemd has no record` on **COOLING
and SAFETY**, beside a healthy `gpu-fan-control.service` row.

⚠ **Pre-existing, and that is the interesting part.** S-G is the change that *put the
discriminator in the entry* and then used it in **one place out of three**. Judge honestly whether
completing it is this item's job or 10c's — both are defensible — but **an entry that now carries
a subject and is rendered by two panels that ignore it is a worse state than before the field
existed**, because the fix looks done. If you defer, `HANDOVER.md` must say that plainly.

## 4. The rest

- **Two entries sharing `source` *and* `instance`:** the first **vanishes from the page**, and the
  module doc says *"Nothing is dropped"*. `readEnv` files one entry per parse problem, so this is
  reachable. A doc contradicting its code is the shape this project has corrected repeatedly —
  decide which one is wrong.
- **The 4-of-18 enumeration is enforced by nothing.** `wire.ts` accepts `instance` on `ufw`,
  `coretemp`, `nvidia-smi`, `statvfs`; the two `llama-env` directory-level paths that must never
  carry one have **no test**, unlike `collectSafety` (which now has `10b-SF1`). Is a type-level
  constraint possible, or is a test per path the honest answer?
- **`dbus` with no instance** now conflates a bus-wide failure with `collectSafety`'s per-unit one,
  so SERVING prints `gpu-fan-control.service`'s failure under its rows.
- **Duplicate `instance` values in `serving[]`** validate and render one message twice under a
  single React key.
- **`optionalInteger`'s value edges are fully consistent with `integer()`** — accepts `0`, `-1`,
  `-0`, `2^53`, `1e21`; refuses float / NaN / Infinity / string / null / bool. That is a clean
  negative; don't spend budget there.
- **A9 settles the F2 attribution by execution:** restoring the old three-`.includes` heuristic
  reddens **exactly the two tests the test phase named**, and the build-credited fixture test stays
  green. **The feature is proven; `10b-sg-error-instance.md` §7's attribution is wrong** — correct
  it as a marked correction, do not edit the claim away.

**Settled, do not re-open:** the whole-snapshot blast radius on a malformed `instance` (uniform
`wire.ts` behaviour, defended by the test phase, accepted by the parent).

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. Do not commit or stage. 2. Your green is not the green. 3. Do not edit `SPEC.md` — record spec
questions. 4. Nothing outside `dashboard/`; do not weaken `purity.test.ts`.

Invariant 7 binds: if the spec is silent, **STOP and record it**.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py    # 128
python3 pipeline/steps/08-client-runtime/regressions.py                       # 174
python3 pipeline/steps/10-panels-assembly/regressions.py                      # 133
```

⚠ Never `pnpm verify` alongside a harness; **never two at once** — sequential foreground. ⚠ **Never
poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9). `git status` after each.
Re-run only the harnesses whose `LEDGER_FILES` you touch, and say which. New mutations `10b-`.

## 7. Deliverables

1. `steps/10-panels-assembly/10b-sg-reconciliation.md` — adjudication table with **all 11**,
   verdicts and reasons; what you applied; what you re-ran; gaps for the owner.
2. **Rewrite `pipeline/HANDOVER.md`** — carry every deferral with an owner, and the A2 statement
   if you defer it.
3. **Correct `10b-sg-error-instance.md` §7's F2 attribution** as a marked correction.
4. Update `ANCHOR.md` §2.2 — after this, **10c** is next and step 10 closes with it.

## 8. Report back

One line per finding with its verdict, what you applied, what you re-ran and its result, spec
questions handed up, anything left open. The parent never reads your transcript.
