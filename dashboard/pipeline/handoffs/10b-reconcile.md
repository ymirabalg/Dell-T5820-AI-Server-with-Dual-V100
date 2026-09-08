# Handoff — Step 10b, RECONCILE phase

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

⚠ Background subagent. `ANCHOR.md` §8 lists **four things the parent does not delegate** (§5
below) and defines the **parent's review** as the phase that closes this loop. Read §8 first.

Read: this file → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md` → `SCOPE.md` → `10b-build.md` →
`10b-test.md` → `10b-adversarial.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. 10b is uncommitted; 10a and F17 are committed.

## 1. The item

The nine panel bodies. Adversarial raised **14 findings, 12 EXECUTED**. Adjudicate **every one**
ACCEPTED / REJECTED / DEFERRED **with a reason**, apply what survives, re-run, write the notes.

⚠ **This is a large finding set and deferring is legitimate** — but a deferral needs the same
quality of reason as a fix, and it must land in `HANDOVER.md` with a named owner (10c, or the
owner). Do not silently shrink the list.

## 2. ⚠ Confirmed by the parent — build on these

| | |
|---|---|
| **F1a** | `cooling-panel.test.tsx:94` asserts `expect(unreadHtml).toContain('—')` **document-wide**, and `chip.tsx:75` renders `EM_DASH` whenever `severity === null`. **The assertion passes on the chip alone, whatever the value cell renders.** A test named for invariant 1 that does not check it |
| **F9** | The two S-B strings are held together by **a doc comment and nothing else** (`condition-lookup.ts:8` "Two independently…", `dashboard-shell.tsx:76` "Must AGREE IN FORM"). The adversarial executed the drift: renamed to "last seen", **2483/2483 green**, banner still saying "last read" |
| green | `pnpm verify` exit **0**, 91 files, 2520 tests — parent, on the tree the adversarial left |
| determinism | 10a-F17 is committed. **A failing test now means something** |

## 3. The centre: invariant 1's coverage is largely illusory

This is `PLAN.md`'s **first** invariant and the project calls conflating `0` with `null` *"the
single worst bug this project can ship"*. The adversarial's F1 group says the coverage that was
supposed to protect it mostly does not:

- **F1a** — COOLING's `fan5` headline takes `?? rpm(0)` with the **whole suite green**, printing
  `fan 5  0 RPM` for a `dell_smm` that loaded but could not read `fan5_input`. That is invariant
  1's own example sentence, in the panel it names.
- **F1b** — `fan1`–`fan4` have **no null fixture at all**; `?? rpm(0)` on fan 2 renders a
  **fabricated red alarm** at 105/105 green.
- **F1c** — the four panels the test phase "fixed" are fixed on **one field each**. GPU power, CPU
  utilisation, MEMORY swap and STORAGE rx all take `?? <zero>` green **simultaneously**.
- **F1d** — `10b-CO2`/`CO3` are `severity → null` mutations, i.e. the *zero* side. **Both the build
  and test notes describe them as the null-vs-zero pair.** They are not. Two documents assert a
  coverage that does not exist — correct both.

SERVING and SESSION EVENT LOG are a **clean N/A** (no banded numeric reading) and SAFETY's
three-valued booleans are tested on all three sides. Those are answers, not gaps.

⚠ **The assertion shape is the root cause, and this is its third appearance.** 10a found
`toContain('paused')` inert (satisfied by an unrelated attribute), its test phase found
`toContain('refresh')` inert the same way, and now `toContain('—')` is satisfied by the chip.
**A document-wide `toContain` is a weak assertion wearing a strong name.** Consider whether the
fix is per-finding or whether this warrants a guard — and if a guard belongs to 10c, say so.

## 4. The rest — judge each on its own evidence

- **F2 (executed, user-facing).** SERVING attaches `errors[0]` to **every** instance row: the
  shipped fixture prints `connect ECONNREFUSED 127.0.0.1:8081` beside the **healthy**
  `llama-server@0`. With a `dbus` entry first, both rows show an error naming instance 1 and the
  message that actually explains instance 1 is never rendered. §3.7 exists so an alarm carries the
  explanation that fits it.
- **F5.** §6.5's em-dash→`errors[]` join reaches **4 panels of 9**; **8 of 18 error sources have no
  rendering path** (CPU and MEMORY never call `errorsForPanel`; STORAGE renders only
  `net-operstate`, so `statvfs` is invisible). COOLING attaches its one `dell-smm` entry to fan 5
  only, leaving fans 1–4 silent — that answers the granularity question §3.4 asked.
- **F3/F4.** `note={age ?? error}` discards the `errors[]` cause exactly when a source dies. And a
  stale row renders `—` while §6.5 says a stale condition **keeps its last value** — the banner
  *does* render `c.value`, so **banner and row show two different numbers for one condition**.
  Check F4 against §6.5's actual words before accepting; it is quoted in the finding.
- **F6.** `10b-CO5` guards three substrings, not the S11/G5 ruling — a differently worded fallback
  passes. The owner's ruling deserves a guard that tracks the rule.
- **F7.** GPU 1 prints `served by instance 1  gemma-4-12b` for a card **absent from the
  enumeration**, and absent renders **byte-identically** to present-with-all-nulls. §6.2 names this
  failure mode: it prints the wrong model rather than failing visibly.
- **F8.** Before the first poll the promoted chart draws a real-looking axis (epoch 0 in local
  time, 0–1 °C), contradicting `panel-chart.ts`'s own doc. **The sparkline handles it correctly** —
  so this is the sibling-case defect this project has hit repeatedly: fixed where reported, missed
  one branch over.
- **F10.** Panels read the **first** `errors[]` entry per source; `events.ts:400` reads the
  **last**. Multi-entry-per-source is routine today.

**Its could-not-break section is substantial** — SVG/DOM id uniqueness across all nine mounted
(`panelId` really is used everywhere), CSS collisions, invariants 3 and 4, decision 13, the GPU
name/bus/throttle traps, `serving: null` vs `[]`, purity, `describeEvent` totality, SAFETY's rows,
the log's ordering and cap. **Do not re-spend budget there.**

## 5. ⚠ The four you must NOT do — ANCHOR §8

1. **Do not commit or stage.** 2. **Your green is not the green.** 3. **Do not edit `SPEC.md`** —
record spec questions (F4 and F5 may produce one). 4. **Nothing outside `dashboard/`**, and **do
not weaken `purity.test.ts`**.

Invariant 7 binds: if the spec is silent, **STOP and record it**.

## 6. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify
python3 pipeline/steps/10-panels-assembly/regressions.py       # 105 mutations
```

- **nvm path first**; ⚠ never `pnpm verify` alongside a harness; ⚠ **never poll for a harness** —
  the `pgrep` loop self-matches and spins forever (ANCHOR §9, orphans killed twice). Sequential
  foreground commands. `git status` after each harness for a stranded mutation.
- New mutations are **`10b-`** prefixed.
- ⚠ **`app/` and `lib/` are 10a's and are committed.** If a fix genuinely needs one — F9's guard or
  F10's first/last mismatch might — say so and **scope it minimally**, or defer it to 10c.

## 7. Deliverables

1. `steps/10-panels-assembly/10b-reconciliation.md` — adjudication table with **all 14**, verdicts
   and reasons; what you applied; what you re-ran; a "new gaps for the owner" section.
2. **Rewrite `pipeline/HANDOVER.md`** — authoritative for open obligations, stale in the safe
   direction seven times; re-check against `SPEC.md`. It must carry every deferral with an owner.
3. **Correct `10b-build.md` and `10b-test.md` where F1d shows they assert coverage that does not
   exist.** Do not edit the claim away silently — mark it as a correction.
4. Update `ANCHOR.md` §2.2 — 10b closing means **10c** is next.

## 8. Report back

One line per finding with its verdict, what you applied, what you re-ran and its result, spec
questions handed up, anything left open. The parent never reads your transcript.
