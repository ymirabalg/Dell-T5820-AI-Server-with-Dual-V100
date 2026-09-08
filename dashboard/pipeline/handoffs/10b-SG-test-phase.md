# Handoff — 10b-S-G, TEST phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project. Read this file,
then `steps/10-panels-assembly/10b-sg-error-instance.md` (**your primary subject**), then
`SPEC.md` §4's `errors[].instance` block and §6.5, then `ANCHOR.md` §4/§5/§8, `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree dirty: S-G's build is uncommitted.

---

## 1. What S-G built

`TelemetryError` gained an **optional `instance?: number`** — the contract's first genuinely
optional field — replacing the text-heuristic join between `errors[]` and `llama-server` rows with
a structural one. `wire.ts` validates it via a new `optionalInteger` helper; `collectServing`
attaches it in its per-instance closure; `collectUnitStates` gained an optional `unitInstances`
map that `collectSafety` deliberately omits; `errors.ts`'s `tag()` gained an optional parameter.

## 2. Verified by the parent — do not re-derive

| | |
|---|---|
| `pnpm verify` exit **0**, **93 files, 2586 tests**, no type errors | parent, this tree |
| **The heuristic is GONE, not supplemented** | `namesInstance` is now `error.instance === instance.instance` — one comparison. The only surviving mention of unit names / `<i>.env` / ports is a **doc comment** recording what it used to be |
| `SPEC.md` untouched by the build | the only diff is the parent's own correction |
| verify is deterministic | 10a-F17 is committed — **if a test fails, believe it** |

## 3. ⚠ Your highest-priority question: does a malformed `instance` LOSE an error?

The build reports `optionalInteger` distinguishing three states: **key absent** → valid, no-op;
**key present and invalid** → *"refuse the whole entry"*; **key present and valid** → keep.

That third branch is right. **The middle one needs hard scrutiny.** An `errors[]` entry *is the
explanation for an em dash* — §3.7: *"an alarm with no explanation beside it is not actionable"* —
and invariant 5 says a failed reading is *"a partial snapshot plus an `errors[]` entry, never a
500"*. So ask:

- When the whole entry is refused, **what happens to its `message`?** Is it dropped from the
  snapshot the panels see? If so, a malformed *optional* field **destroys a diagnostic that has
  nothing to do with attribution** — trading a wrong attribution for a missing explanation, which
  is arguably the worse failure.
- Would keeping the entry and **discarding only the bad `instance`** be better — the entry then
  behaves exactly like one from a source with no subject, which is a defined, rendered state?
- What does the rest of `wire.ts` do with a malformed **required** field, and is this consistent
  with it? Consistency matters more than either answer in isolation.

Establish what the code actually does, with a fixture. If you conclude the current behaviour is
right, say so with the argument — a clean defence is as valuable as a finding. If it is wrong,
**this is a finding, not necessarily yours to fix**: it may be a spec question, since §4's block
does not say what a malformed optional field costs.

## 4. The rest, in priority order

### 4.1 The enumeration

The build says 4 sources can carry an instance (`llama-env`, `llama-health`, `llama-models`,
`dbus` for a per-unit `llama-server@<i>` failure) and **14 cannot**. Verify against `ErrorSource`'s
closed vocabulary — is any source that *could* name an instance missing? Is any that cannot now
able to get one by accident?

⚠ **`collectSafety` deliberately omits `unitInstances`.** SAFETY reads the fan service over the
same `dbus` path; an instance attached there would be **wrong**, not merely absent. Confirm the
omission is enforced by something other than the author's memory — is there a test that fails if a
future edit passes the map?

### 4.2 Both sides of every new boundary

`optionalInteger` has three branches; the field is absent, present-valid, present-invalid. **Every
one needs a fixture.** "Every boundary guard needs a fixture on both sides" is a rule three steps
here have already broken, and this guard has three sides.

### 4.3 The old-server case

An old server sends no `instance`; the client must accept the snapshot and fall back to
panel-level rendering. **Is that tested, or only asserted?** It is the behaviour that lets this
land before the box is redeployed.

### 4.4 F2's regression must be genuinely covered

An error naming instance 1 **must not** appear on instance 0's row. The build says the fixture
`servingPopulated` now carries `instance: 1`. Would the test fail without the change? Construct a
message that *would* have fooled the old heuristic and confirm it no longer does.

### 4.5 The two re-aimed step-5 anchors

Two pre-existing mutations were re-aimed because the code shape moved. ⚠ **A re-anchored mutation
can end up testing something narrower than before and the ledger will not notice** — it only asks
whether *some* ⚠ test reddened. Read both against what they were written to catch.

### 4.6 Names against bodies

Four loops here have been fooled by a document-wide `toContain`. Read every new test name against
its body; scope assertions to the row you mean.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/05-collectors-serving-storage-safety/regressions.py
python3 pipeline/steps/08-client-runtime/regressions.py
python3 pipeline/steps/10-panels-assembly/regressions.py
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; **never two harnesses at once** —
  run them **sequentially in the foreground**. ⚠ **Never poll** — the `pgrep` loop self-matches and
  spins forever (ANCHOR §9). `git status` after each for a stranded mutation.
- Re-run **only** the harnesses whose `LEDGER_FILES` you touch, and say which and why.
- New mutations are **`10b-`** prefixed.
- **Fixing IS in scope** — say what you changed and why.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 6. Deliverable

`steps/10-panels-assembly/10b-sg-test.md`, leading with §3's answer. Then a short summary. End
with `pnpm verify`, the harness results, and `git status`.
