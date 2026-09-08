# Handoff — Q3: prefix every mutation id with its creating step's id

**Written by the parent, 2026-09-08, at the owner's instruction.** You are a fresh agent with no
memory of this project. Read this file, then `pipeline/ANCHOR.md` §4, §8 and §9.

Branch `dashboard-frontend`, working directory `dashboard/`. Tree is clean except for
`pipeline/ANCHOR.md`, which the parent is editing — **leave that file alone.**

---

## 1. Why

Mutation ids and work-item/gap ids share one namespace and have collided. `S11` and `G5` are each
**simultaneously** a step-7 mutation id and half of the open `S11/G5` work item; `S12` is both a
mutation id in steps 3, 5 and 8 and a step-5 gap id. `ANCHOR.md` §7 warns that "the `S*` namespace
is polluted" in steps 3–5 — the Q1 reconciliation established that this understates it: the
collision is not confined to `S`, nor to steps 3–5.

**The owner's ruling: every mutation id carries its creating step's id as a prefix.**

## 2. The rule, precisely

`{creating step id}-{mutation id}`, e.g. `07-R3`, `08-W4`, `Q1-SC1`.

- The prefix is the step that **created** the mutation, **not** the harness it currently lives in.
  Those coincide for every mutation except the four below, and provenance never changes whereas a
  mutation could in principle move.
- Step ids are the directory prefixes: `02`, `03`, `04`, `05`, `06`, `07`, `08`, `09`.
- ⚠ **Four mutations were created by work item Q1 and live in other steps' harnesses. They take
  `Q1-`, not their host step's number:**

| mutation | lives in | becomes |
|---|---|---|
| `SC1` | `07-auth-login/regressions.py` | **`Q1-SC1`** |
| `K8` | `07-auth-login/regressions.py` | **`Q1-K8`** |
| `W19` | `07-auth-login/regressions.py` | **`Q1-W19`** |
| `W21` | `08-client-runtime/regressions.py` | **`Q1-W21`** |

Everything else in `NN-*/regressions.py` takes `NN-`.

## 3. How the id is parsed — this is the whole mechanism

Each entry in `REGRESSIONS` is a tuple whose first element is a name string. The id is:

```python
eid = entry[0].split()[0]        # in _assert_unique_ids(), and the same shape elsewhere
```

— the **first whitespace-delimited token**. So the change is textual: `"R1 formatters treat 0…"`
becomes `"02-R1 formatters treat 0…"`. Nothing else about the tuple changes.

⚠ **Check every place that parses or prints an id**, not just `_assert_unique_ids()`. Some
harnesses print ids in their summary lines (`ANCHORS MOVED`, `DID NOT BITE`, `ANCHOR AMBIGUOUS`).
Any code that slices a fixed width, or assumes an id has no `-`, or splits on `-`, must still
work. If a harness derives anything from the id's shape, say so rather than quietly adapting it.

## 4. Scope — read this carefully, it is narrower than it looks

**IN scope: the eight `regressions.py` files only.**

**OUT of scope: every `.md` file.** Do not rewrite mutation ids in `build.md`, `review.md`,
`adversarial.md`, `reconciliation.md`, `HANDOVER.md`, `WORK-ITEMS.md` or `ANCHOR.md`.

The reason is not laziness — it is that **a blind rename across the docs would corrupt the record
in exactly the way this item exists to prevent.** `S11`, `G5`, `S12` and `D1` appear in the docs
as *both* mutation ids and work-item/gap ids, and no textual rule distinguishes them. Prefixing
the harnesses fixes the live artifact; a historical note inside `steps/02-format-severity/` that
says `R3` is already unambiguous, because its directory supplies the missing prefix.

**Do add one short paragraph** to `pipeline/HANDOVER.md` §5.2 (the numbered rules) recording the
convention, the `Q1-` exception, and the fact that historical step notes keep bare ids.

## 5. Verifying — the long part

Every harness must still exit 0 after the rename, and their ledgers must be unchanged.

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify        # green is EXIT 0, never a printed summary
python3 pipeline/steps/NN-*/regressions.py
```

**771 mutations across the eight**, each spawning a vitest run. Run them **strictly one at a
time**; this takes a long while and cutting it short defeats the point.

⚠ **A rename must not change any ledger outcome.** The ledger matches ⚠ *test names*, not mutation
ids, so the covered-set is independent of this change — meaning **every harness's ledger line
should read exactly as it did before.** Capture each harness's summary lines before and after and
diff them. Mutation counts: 02:55 03:72 04:92 05:127 06:63 07:128 08:173 09:61 = **771**; total
⚠ marks **689**. If any of those move, something is wrong and you should stop and report rather
than adjust the numbers to match.

- **nvm path first** — `$HOME/.local/bin/node` symlinks to v26.8.1 and shadows the Node 24 pin.
- ⚠ Never run `pnpm verify` alongside a harness; never two harnesses at once.
- ⚠ Never sleep-poll `pgrep -f regressions.py` — it matches your own shell. Use
  `pgrep -f "regressions[.]py"`.
- After each harness: `git status` for a stranded mutation in `lib/`; `git checkout --` it.

## 6. Not yours

- **Do not commit or stage.** The parent commits after re-running `pnpm verify` itself.
- **Do not edit `SPEC.md`**, or `pipeline/ANCHOR.md`, or anything outside `dashboard/`.
- Invariant 7: if the spec is silent, record it; do not invent.

## 7. Deliverable

`pipeline/steps/Q3-mutation-id-prefix/notes.md`: what you renamed and how many per step; the
before/after harness summary diff showing the ledgers are unchanged; every place that parses or
prints an id and whether it needed changing; anything that surprised you. Then report back a
short summary — the parent will not read your transcript.
