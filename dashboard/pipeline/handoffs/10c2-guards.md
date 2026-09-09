# Handoff — Step 10c-2: the guards (BUILD phase)

**Written by the parent, 2026-09-08.** Fresh agent, no memory of this project.

Read: this file → `steps/10-panels-assembly/SCOPE.md` (**you are 10c, second of three**) →
`pipeline/HANDOVER.md` §0.3, §0.5, §0.6 → `ANCHOR.md` §4/§5/§8/§9 → `PLAN.md`.

Branch `dashboard-frontend`, working dir `dashboard/`. Tree **clean** at `a0c2c0e`.

---

## 1. What this loop is

**Five guards, all mechanism work.** Every one exists because a mechanism in this project failed to
catch something, repeatedly. **Expect them to fail on existing code when you first run them — that
is the point**, exactly as Q1's corrected scanner did.

⚠ **This loop's own defect class is the false positive.** A guard that fires on prose or on a
legitimate pattern will be silenced by the next person and the project is worse off than before.
10a's F3 diagnostic had to suppress in-comment matches or it printed three false positives every
run. **For every guard: report its output on today's tree, and if it fires, say whether each hit is
real.**

## 2. The five

### 2.1 The `toContain` lint — the highest value, because it has fooled FOUR loops

`expect(html).toContain('paused')` was satisfied by an unrelated attribute (10a). Then
`toContain('refresh')`, the same way (10a's test phase). Then `toContain('—')`, satisfied by
`Chip`'s own null glyph (10b). Then `toContain('data-severity="none"')` (10b-S-F). **Four loops,
four inert assertions, one shape.**

Build a mechanical guard. ⚠ **The hard part is the rule, not the code.** A document-wide
`toContain` is not always wrong — plenty of tests legitimately assert a string appears *somewhere*.
Candidate discriminators, and you must pick and defend one: an assertion whose subject is a
**whole-document render** (`renderToStaticMarkup(...)` unscoped) rather than a scoped slice; a
`toContain` on a ⚠-marked test; a `toContain` whose argument is a substring of something the page
renders unconditionally. **State the rule, its false-positive rate on today's tree, and what it
cannot catch.**

### 2.2 Q1-F4 — the cross-harness runner

Nothing asserts that a ⚠-bearing test file belongs to **some** step's `LEDGER_FILES`. Q1 deferred
it because *"no harness knows the union"* and the available fixes were bad: a per-harness
approximation needs a 9-entry exemption list, and a hardcoded orphan guard would be **"a check
green over a subset of the real set — Q1's own defect wearing a different hat."**

⚠ **That reasoning still binds. Do not hardcode a list of orphan files.** The union has now
genuinely changed — step 10 added the **ninth** harness and hand-wrote its `LEDGER_FILES` — so a
real cross-harness runner finally has something to check. Two orphan files were named in an earlier
`HANDOVER` §0.1; **re-derive them rather than trusting the names.**

### 2.3 The dangling-class audit (10c1-A8)

Verified by the parent: a CSS-module import is a **Proxy** — `styles.gpu0` returns
`_gpu0_e75739`, and `styles.zzzNoSuchRule` returns `_zzzNoSuchRule_e75739`. **Every key resolves**,
so a deleted or misspelled class is invisible to `tsc` **and** to the entire suite. One live
instance was found and removed in 10c-1 (`alarm-banner.tsx`'s `styles.item`).

Build the static check: every `styles.X` in a `.tsx` has a matching rule in its sibling
`.module.css`. Watch for composed selectors, `:global`, and rules only referenced dynamically.

### 2.4 L11 — the unit-name guard

No guard stops a component hard-coding `' RPM'` instead of calling a formatter. Step 9 deferred it
because **there is no canonical unit-name constant in `lib/` to point a guard at**. So this is two
pieces: **create the constant**, then guard against literals that bypass it. ⚠ **The constant is a
design decision** — where it lives, what it covers, whether `lib/units.ts` is already its home.
Decide and record.

### 2.5 `exactOptionalPropertyTypes`

**Measured free today**: `npx tsc --noEmit --exactOptionalPropertyTypes` exits 0 on this tree, and
I confirmed it. It matters because S-G added the contract's first genuinely optional field, and
this flag is what stops `{ instance: undefined }` being conflated with an absent key. Turn it on in
`tsconfig.json` and confirm `pnpm verify` stays green. **If it is not free after all, stop and
report** rather than fixing a cascade under a guard-shaped handoff.

## 3. Not yours

**10c-3:** L9 · F14b's gap hatching · `--table-scroll-max` → `max-height: 100%` · Q2-F9's
clamp-vs-drop · the browser step's **paint** half (10c1-A9 established binding is observable today
and only paint needs a browser). **Owner:** S-G-Q1…Q4, F14a, D1.

## 4. The bar

- Mark load-bearing tests `⚠`; back each with a **`10c-`**-prefixed mutation.
- ⚠ **HANDOVER §0.5:** a harness proves every ⚠ test *can* fail, never that every branch *has* one.
  A guard is code; **its own branches need mutations** — including the branch where it finds
  nothing.
- ⚠ **A guard that cannot fail is not a guard.** For each, demonstrate it firing: introduce the
  defect it exists to catch, watch it fail, revert, confirm with `git status`.
- **Invariant 6:** no dependency without a recorded reason.
- **Invariant 7:** if the spec is silent, record it. These are pipeline conventions, not `SPEC.md`
  matters — but say so rather than assuming.

## 5. Rules

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
cd dashboard && pnpm verify                                    # green is EXIT 0
python3 pipeline/steps/10-panels-assembly/regressions.py       # 168 mutations
```

- **nvm path first** — `$HOME/.local/bin/node` is v26.8.1 and shadows the Node 24 pin.
- ⚠ Never `pnpm verify` alongside a harness; never two at once — **sequential foreground**.
- ⚠ **Never poll for a harness** — a `pgrep -f "regressions[.]py"` loop inside the same `bash -c`
  that ran it matches its own command line and spins forever (ANCHOR §9; orphans killed twice).
- After a harness: `git status` for a stranded mutation; `git checkout --` it.
- ⚠ **If a guard you add makes another step's harness fail, that is a finding, not a licence to
  edit nine harnesses.** Report it and scope your fix.
- **Do not commit. Do not edit `SPEC.md`. Do not weaken `purity.test.ts`.**

## 6. Deliverable

`steps/10-panels-assembly/10c2-build.md`: for **each** of the five — the rule, its output on
today's tree, whether each hit is real, the demonstration that it can fail, and what it cannot
catch. Plus the L11 constant decision and the `exactOptionalPropertyTypes` result. End with
`pnpm verify`, the harness result, and `git status`.

Report back a short summary. The parent will not read your transcript.
