# Q3 — prefix every mutation id with its creating step's id

Agent notes. Scope was the eight `regressions.py` harnesses only (`02` through `09`); no `.md`
file's mutation ids were touched, per the handoff. One paragraph was added to
`pipeline/HANDOVER.md` §5.2 (rule 10) recording the convention.

## 1. What was renamed, per step

The transform was mechanical and AST-located: for every tuple in each file's `REGRESSIONS` list
(including the `REGRESSIONS +=` continuations in `03` and `07`), the first element — a plain
string constant — had its leading whitespace-delimited token (the id) prefixed with
`{step}-` or `Q1-`. Nothing else in any tuple changed. Verified line-for-line: the number of
changed lines in every file equals exactly that file's mutation count (one line touched per
mutation, the line carrying the id), and every file still parses (`ast.parse`) and has the same
line count as before.

| step | file | mutations | prefix used |
|---|---|---:|---|
| 02 | `02-format-severity/regressions.py` | 55 | all `02-` |
| 03 | `03-collectors-gpu-host/regressions.py` | 72 | all `03-` |
| 04 | `04-collector-cooling/regressions.py` | 92 | all `04-` |
| 05 | `05-collectors-serving-storage-safety/regressions.py` | 127 | all `05-` |
| 06 | `06-telemetry-route/regressions.py` | 63 | all `06-` |
| 07 | `07-auth-login/regressions.py` | 128 | 125 × `07-`, 3 × `Q1-` |
| 08 | `08-client-runtime/regressions.py` | 173 | 172 × `08-`, 1 × `Q1-` |
| 09 | `09-ui-primitives/regressions.py` | 61 | all `09-` |
| **total** | | **771** | |

**The four Q1-provenance mutations took `Q1-`, confirmed individually:**

| mutation | lives in | became |
|---|---|---|
| `SC1` | `07-auth-login/regressions.py` | `Q1-SC1` |
| `K8` | `07-auth-login/regressions.py` | `Q1-K8` |
| `W19` | `07-auth-login/regressions.py` | `Q1-W19` |
| `W21` | `08-client-runtime/regressions.py` | `Q1-W21` |

Everything else in each file took its own host step's prefix, per the handoff's rule that
provenance (the file/id pair), not a bare id match, decides the exception. This mattered
concretely: **`W19` also exists, independently, as an ordinary step-08 mutation** in
`08-client-runtime/regressions.py` — a different mutation with a different anchor, created by
step 8 itself, not by Q1. It correctly became `08-W19`, not `Q1-W19`. Had the exception been
applied by bare id instead of by (file, id), this one would have been mis-prefixed. Grepped for
before applying the exception table and confirmed the id collision is real and pre-existing (it
does not violate any harness's own `_assert_unique_ids()`, since that check is per-file).

## 2. Every place that parses or prints a mutation id

Audited all eight files for anything touching `entry[0]`, fixed-width slicing, or a split on
`-`. Result is identical across all eight harnesses:

- **The only place an id is *parsed*** is `_assert_unique_ids()`:
  ```python
  eid = entry[0].split()[0]
  ```
  This is exactly the mechanism the handoff describes, and prefixing is injective (two distinct
  ids get two distinct prefixed ids within the same file, since the prefix is the same for all
  non-exception entries in a file and the exception set is a fixed small table), so uniqueness
  within each file is preserved by construction. No change to this function was needed or made.
- **`name` (the full `entry[0]` string, not the split id) is what gets *printed*** — in the
  per-mutation `--- {name}` line, and joined into the three summary lists:
  `ANCHORS MOVED — re-aim these, they did not run: …`, `ANCHORS AMBIGUOUS — pin these to one
  site, they did not run: …` (or `ANCHOR AMBIGUOUS` inline per-entry in some files), and
  `DID NOT BITE: …`. These now print the prefixed name (e.g. `07-K4 Secure is added, …`) — that
  is expected and correct, not a defect, since nothing else parses those lines back out.
- **Nothing slices a fixed width, and nothing else splits on `-`.** Grepped every file for
  `[:N]` / `[0:N]`-style slicing near id handling and for `.split("-")` / `.split('-')` —
  none exists. Several mutation names themselves *already* contained a `-` before this change
  (e.g. `07`'s original `"fan1-fan4 …"`-style names in `04`, and `08`'s `E1`/`U`-series names),
  so `-` was never a safe delimiter to split on and nothing in these harnesses ever did. This
  means the new `{step}-{id}` hyphen introduces no ambiguity for any downstream code, because
  there was no downstream code reading anything past `.split()[0]`.
- No other id-shaped comparisons (equality checks against a mutation id, dict keys by id, sorted
  output by id, etc.) exist outside `_assert_unique_ids()`. The ledger (`covered`, `marked`,
  `uncovered`) is keyed entirely on **⚠ test names** pulled from vitest's own `FAIL …` lines and
  from `marked_tests()`, never on mutation ids — this is the fact the whole verification below
  leans on.

## 3. Verification — harness runs, before/after

**Method, stated plainly.** All eight harnesses were run to completion, one at a time (never
concurrently with each other or with `pnpm verify`), against the tree *after* the rename. Steps
02–06 were run and captured by this agent; step 07 was run and captured by both this agent and
the coordinator independently (results agree exactly); steps 08–09 were run by the coordinator
after a process problem (see §5) cost real time on this agent's own attempt. This agent did
**not** additionally do a literal `git stash` / re-run of the pre-rename tree to capture a
byte-for-byte "before" log per file — given the time already spent, the check actually performed
was: (a) a full code audit (§2) proving the ledger's inputs (`covered`, `marked`) cannot depend
on `entry[0]`'s content beyond mutation *count*, only on vitest's own FAIL-line test names; and
(b) confirming the **measured, post-rename** per-step and total figures against the handoff's
pre-registered baseline, which is the pre-rename ledger state recorded before this item began.
If that baseline is wrong this finding is void, but it was supplied by the process that owns the
ledger (Q1's reconciliation), not invented for this comparison.

**Every harness exited 0. Every one printed both closing lines**
(`Every ⚠-marked test went red under at least one mutation.` and
`All N regressions failed their check, as they must.`) with no `ANCHORS MOVED`, `ANCHORS
AMBIGUOUS`, `DID NOT BITE`, or `NO MUTATION REDDENS THESE ⚠ TESTS` output — i.e. no branch that
would return 1 ever fired.

| step | mutations | distinct failing tests | ⚠-marked tests checked | exit |
|---|---:|---:|---:|---:|
| 02 | 55 | 256 | 13 | 0 |
| 03 | 72 | 114 | 24 | 0 |
| 04 | 92 | 183 | 83 | 0 |
| 05 | 127 | 184 | 97 | 0 |
| 06 | 63 | 88 | 56 | 0 |
| 07 | 128 | 202 | 130 | 0 |
| 08 | 173 | 280 | 219 | 0 |
| 09 | 61 | 89 | 67 | 0 |
| **total** | **771** | — | **689** | all 0 |

**Totals match the handoff's expected figures exactly: 771 mutations (55+72+92+127+63+128+173+61)
and 689 ⚠ marks (13+24+83+97+56+130+219+67). Nothing moved.** Per §2's argument this is expected
rather than coincidental — the ledger keys off test names emitted by vitest, which never see a
mutation's name string at all, only whichever `old`/`new` text substitution the harness makes
into the actual `.ts` source before running the check.

**Stranded-mutation check.** `git status --short -- lib app proxy.ts` (or the unfiltered
equivalent) was checked after every harness run this agent performed (02–07) and after each of
the coordinator's (08–09, per its report). Clean every time — each harness's `finally:
path.write_text(original)` restored the mutated file before the next step began.

## 4. What surprised me

- **The `Q1-` exception is keyed by (file, id), not by bare id, and this is load-bearing rather
  than a formality.** `W19` exists twice across the eight harnesses — once in `07-auth-login`
  (Q1 provenance, → `Q1-W19`) and once, unrelated, in `08-client-runtime` (step 8's own, →
  `08-W19`). A prefixing rule that matched on the bare id string would have wrongly given both
  the `Q1-` prefix. Checked this explicitly before running the rename, not after.
- **The existing numbered list in `HANDOVER.md` §5.2 is already out of sequence** (1, 2, 3, 4, 5,
  8, 9, 6, 7) before this edit. The new paragraph was appended as `10.` at the end rather than
  renumbering the existing rules, to avoid an unrelated diff.
- **Several mutation names already contained a literal `-` before this change** (e.g. several
  `fan1-fan4 …` names). That made it easy to *assume* something downstream might already split on
  `-` and need care — it doesn't; confirmed nothing does (§2).
- **The rename is genuinely a no-op for every check the harnesses perform.** The only thing a
  reader sees differently is the human-readable mutation name in the terminal output (now
  `07-K4 …` instead of `K4 …`) — every mechanical behaviour (which file gets mutated, which check
  runs, which tests go red, what the ledger counts) is unchanged, which is exactly what "the id
  is parsed as `entry[0].split()[0]`, so the edit is textual" in the handoff meant in practice.

## 5. Process finding — the wait-loop deadlock

The coordinator's `pgrep -f "regressions[.]py"` wait-loop pattern, while correct in isolation,
**deadlocked when embedded in the same `bash -c` script as the harness invocation it was meant
to wait for.** The failure: a single script of the shape

```bash
python3 pipeline/steps/07-auth-login/regressions.py > log 2>&1
while pgrep -f "regressions[.]py" >/dev/null 2>&1; do sleep 20; done
```

is itself one long argument to `bash -c`, and that whole string — including the literal
substring `pipeline/steps/07-auth-login/regressions.py` from the first line — remains present in
the *waiting shell's own command line* for as long as that shell is alive (which, since the
`while` loop is later in the same script, is exactly the loop's own execution). `pgrep -f`
matches against the full command line of every process, including the shell running the pattern
itself, so once the harness process actually exited, the loop kept matching **itself** and never
terminated — even with the `[.]` bracket trick that correctly stops it from matching a *literal
`regressions.py`* typed as a bare polling command. The bracket defends against the shell
re-matching its own bare `pgrep` invocation; it does not defend against the shell's *own script
body* containing the harness's path as plain text earlier in the same `-c` argument. Two shells
spun this way for roughly five hours with no harness actually running, which the coordinator
identified, killed, and has recorded in `pipeline/ANCHOR.md` §9. Noted here as well since it cost
real wall-clock time on this item and the failure mode is subtle enough to recur: **the safe
form keeps the wait loop in a separate command from the harness invocation it is waiting on**, or
avoids `pgrep -f` self-matching entirely by tracking the harness's own PID (`$!`) and `wait`ing on
it instead of pattern-matching the process table.

## 6. Not done / left alone

- No `.md` file's mutation ids were rewritten (`build.md`, `review.md`, `adversarial.md`,
  `reconciliation.md`, `WORK-ITEMS.md`, `ANCHOR.md`) — out of scope per the handoff.
- `pipeline/ANCHOR.md` was not touched by this agent at any point.
- Nothing was staged or committed. `pnpm verify` was not run by this agent (the coordinator runs
  it before commit, per the handoff).
