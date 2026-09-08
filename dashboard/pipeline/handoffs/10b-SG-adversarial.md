# Handoff — 10b-S-G, ADVERSARIAL phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10b-sg-error-instance.md` and `10b-sg-test.md`, then `SPEC.md` §4's
`errors[].instance` block and §6.5, then `ANCHOR.md` §4/§5/§8 and `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: S-G uncommitted.

## ⚠ You fix NOTHING

Findings only; reconcile adjudicates each. Every finding needs a **concrete failure scenario** —
input or state, and the wrong output or missed detection. Mark each **EXECUTED** or **REASONED**.

---

## 1. What S-G is

`TelemetryError` gained an **optional `instance?: number`**, replacing a text-heuristic join
between `errors[]` and `llama-server` rows with a structural one. `wire.ts` validates via
`optionalInteger`; `collectServing` attaches it in its per-instance closure; `collectUnitStates`
gained an optional `unitInstances` map that `collectSafety` omits.

## 2. Settled — do not re-open without new evidence

| | |
|---|---|
| `pnpm verify` exit **0**, **93 files, 2587 tests** | parent |
| The heuristic is **gone**, not supplemented | `namesInstance` is one field comparison; the old matching survives only as a doc comment |
| **A malformed `instance` voids the WHOLE SNAPSHOT** | Parent confirmed the mechanism: `arrayOf` returns `undefined` on any bad item (`wire.ts:245`), and `errors === undefined` fails the snapshot. **The test phase defended this and I agree**: it is the uniform behaviour `wire.ts` already applies to every field including required ones, and a present-but-invalid value can only be a server bug, which deserves the loudest signal. **Do not re-file it as "an optional field should degrade gracefully" without a new argument** — but note both the handoff and the build's write-up had *undersold* the blast radius as "losing an entry", which the test phase corrected |
| `collectSafety`'s omission is now **enforced by a test**, not memory | `10b-SF1` |
| 4 sources carry an instance, 14 cannot | verified by reading every `tag()` call site |

## 3. Where I would look

### 3.1 ⚠ An instance that matches NO row — the same disease, one step along

The join is now `error.instance === instance.instance`. So what renders for an entry whose
`instance` matches **no serving row**? Instance 5 when two are configured; an instance that
existed at collection and is gone from `serving[]`; `serving: null` with instance-tagged errors
still present.

**The failure this change exists to remove was a diagnostic attached to the wrong row. An
orphaned instance is a diagnostic attached to NO row — the explanation vanishes entirely**, which
§3.7 calls unactionable. Does it fall back to panel-level, or disappear? Construct it and say.

Related: **two entries with the same `instance` and the same `source`** — `bySource` is a `Map`,
so does the second silently overwrite the first?

### 3.2 The enumeration's future, not its present

4-of-18 is verified correct **today**. The interesting question is whether it stays: `tag()` takes
an optional parameter, so any collector *can* pass one. Is there anything stopping a source that
must never carry an instance from acquiring one — a type, a guard, a test — or only the
enumeration in a document? `collectSafety` now has a test; the other 13 do not.

### 3.3 `unitInstances`, built by `collectServing`

How is that map derived? If a unit name is parsed to an index, what happens with a name that does
not parse, a non-contiguous set (`@0` and `@2`), or a duplicate? And does an error about a
**unit** that is not a `llama-server@<i>` ever pick up an instance by accident?

### 3.4 `optionalInteger`'s edges

Three branches are fixtured. What about the **values**: negative, zero, a float, `NaN`, a numeric
string, `Infinity`, a number beyond safe-integer range? Which of those does `wire.ts` refuse, and
is the refusal consistent with how it treats other integers?

### 3.5 The F2 test the test phase already corrected

It found the build's credited regression test **does not discriminate** the old heuristic from the
new join — the port substring matches either way — and says two *other* tests carry the proof.
**Verify that claim.** If those two also fail to discriminate, the feature is unproven and nobody
has noticed.

### 3.6 Free hunting

Not limited to the above. Invariant 5 (partial snapshot, never a 500), invariant 2 (read-only),
§6.5's rendering rules, and the three harnesses' ledgers are all fair game.

## 4. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py    # 128
python3 pipeline/steps/08-client-runtime/regressions.py                       # 174
python3 pipeline/steps/10-panels-assembly/regressions.py                      # 133
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; **never two at once** — sequential
  foreground. ⚠ **Never poll** — the `pgrep` loop self-matches and spins forever (ANCHOR §9).
- Experiments are fine; **revert them and confirm with `git status`**, leaving the tree exactly as
  found so reconcile knows what build and test left.
- **Fix nothing. Commit nothing. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 5. Deliverable

`steps/10-panels-assembly/10b-sg-adversarial.md`: numbered findings, each EXECUTED or REASONED
with a concrete failure scenario, plus **"what I attacked and could NOT break"**.

Report back a short summary. The parent will not read your transcript.
