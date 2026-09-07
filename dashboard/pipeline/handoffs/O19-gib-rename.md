# Handoff — O19: collapse the `GB` brand into `GiB`

**You are the BUILD phase for one work item.** You have clean context. Read this, then
`dashboard/pipeline/HANDOVER.md` (§1 how to run, §5 the four structural rules, §7's do-not-copy
list). `SPEC.md` §6.6 and §3.5 are the authority for the unit itself.

---

## ⚠ Read this first: it is NOT a rename

**`GiB` already exists as a brand** and is used for RAM and swap:

```ts
export type GiB = Brand<number, 'GiB'>;   // lib/types.ts:68
export type GB  = Brand<number, 'GB'>;    // lib/types.ts:70   ← this one goes away
export const gib = (v: number): GiB => v as GiB;
export const gb  = (v: number): GB  => v as GB;   // ← goes away
```

And the two formatters are **identical but for the suffix**:

```ts
export const formatGiB = (v: GiB | null): string => render(v, ONE_DP, ' GiB');
export const formatGB  = (v: GB  | null): string => render(v, ONE_DP, ' GB');   // ← goes away
```

So this item is a **deletion, not a rename**: remove `GB`, `gb()` and `formatGB`, and make disk
use the `GiB` brand and `formatGiB`. Anyone who tries to "rename `GB` → `GiB`" hits a collision
with the existing type and invents a workaround. **Do not.**

## Why, and why it is not cosmetic

§6.6: *"Disk | **GiB** | 1 dp | `df -h` — powers of 1024 … `/` is **232.6 GiB, not 249.8 GB**"*.
Decision 20 agrees. **The value is already correct** — `statvfs.ts` divides by `BYTES_PER_GIB`
(`1024³`) and step 5 measured it reproducing `df -B1` to the byte. Only the *names and the
printed suffix* are wrong.

⚠ **It is currently visible on the live box.** The deployed backend prints
`/  20.7 GB / 232.6 GB`, and `232.6` is a GiB figure wearing a GB label. **It is the only false
thing the dashboard prints.**

## Exact inventory — every site, measured 2026-09-07

**Source (non-test):**

| file | what |
|---|---|
| `lib/types.ts` | `export type GB` (70), `export const gb` (128), `Filesystem.usedGB`/`totalGB` (545–546), and the units prose at 18 |
| `lib/format.ts` | the `GB` import (34), `formatGB` (156), and the doc at 7 / 142 / 147–148 |
| `lib/severity.ts` | the `GB` import (34), `severityDiskFree(used: GB, total: GB)` (185) |
| `lib/collectors/statvfs.ts` | `import type { Filesystem, GB }` (37), `NO_FILESYSTEM` (83), `totalGB`/`usedGB` locals (108–110), and the doc at 8 / 16–17 / 46 / 90 |
| `lib/client/wire.ts` | `usedGB`/`totalGB` validation (426–429) — ⚠ **these are the WIRE names** |
| `lib/client/observations.ts` | the `formatGB` import (53) and both calls (300–301) |
| `lib/fixtures.ts` | four literals (80–81, 139–140) |

**Tests that will need updating:** `lib/severity.test.ts`, `lib/types.test-d.ts`,
`lib/contract.test.ts`, `lib/format.test.ts`, `lib/collectors/storage.test.ts`,
`lib/telemetry/snapshot.test.ts`.

## ⚠ Three things that make this more than a find-and-replace

1. **`Filesystem.usedGB`/`totalGB` are ON THE WIRE.** Renaming them to `usedGiB`/`totalGiB` is a
   **§4 contract change**. Server and client are one repo, so it is atomic — but `wire.ts`'s
   validator, `fixtures.ts`, `snapshot.test.ts` and every fixture literal must move together, or
   the client will refuse the server's payload and the dashboard will show a failed poll with no
   field saying why.
2. **`formatGB` and `formatGiB` become the same function.** Delete `formatGB` and call
   `formatGiB`. ⚠ Do **not** keep both — HANDOVER's do-not-copy #9 is "a parser that is tested,
   exported and unused", and two identical formatters is that with extra steps. Check whether
   `format.test.ts`'s `formatGB` cases duplicate `formatGiB`'s and merge rather than keep both.
3. **Three comments claim this is done or pending, and all three are wrong after you finish:**
   - `lib/auth/handler.ts:111` says *"this project renamed 98 occurrences of `GB` to `GiB`"* —
     **past tense, and it has not happened.** Fix it either way.
   - `lib/collectors/statvfs.ts:16` says *"the rest of the rename is OUTSTANDING and belongs to
     step 9"*.
   - `lib/format.ts:147–148` says *"Only the names still say GB … 98 occurrences across 10
     files"*.

   This project has shipped a stale doc claim four times now. Leave none behind.

## Rules

- **`pnpm verify` exiting 0 is the only definition of green.** Never a printed summary.
- ⚠ **Do not run a harness concurrently with `pnpm verify` or with another harness.** Serially.
- **Mark load-bearing tests `⚠` and back each one with a mutation.** If you add a ⚠ test, add a
  mutation to the harness that owns that FILE (ledger ownership follows the file, not the step):
  `format.test.ts`/`severity.test.ts` → step 2; `storage.test.ts` → step 5; `snapshot.test.ts` →
  step 6; `wire.test.ts`/`observations.test.ts` → step 8; `types.test-d.ts`/`contract.test.ts` →
  step 1 has no harness, so a `types`-kind mutation goes where the file's owner is.
- **Every boundary guard needs a fixture on both sides.**
- **Do not touch `SPEC.md`** — the parent owns it, and §6.6 already says GiB, so nothing is owed.
- **Do not touch `MOCK.html`, `PLAN.md`, or anything under `pipeline/steps/*/` except a
  `regressions.py` you are adding a mutation to.**
- **Do not commit.** Leave the tree dirty; the parent commits.
- **Do not deploy or touch the box.** A running server on `ai-server` serves the OLD field
  names; that is the parent's problem, not yours. Do not run `pnpm probe`.

## Evidence to produce, and paste real output

1. `pnpm verify` — **exit 0**, at least twice.
2. Every harness whose files you touched, run **serially**, each reporting all mutations bit and
   the ledger clean. At minimum steps 2, 5, 6 and 8; run 1's absence is expected (step 1 has no
   harness).
3. `grep -rn "\bGB\b\|\bgb(\|usedGB\|totalGB\|formatGB" lib/ app/ proxy.ts --include=*.ts
   --include=*.tsx` — and account for **every** remaining hit. Legitimate survivors exist:
   prose contrasting GiB with GB (`"232.6 GiB, not 249.8 GB"`) is correct and should stay.

## Report back

- What you changed, file by file.
- The three stale comments, and what they say now.
- Any place the deletion was **not** mechanical, and the judgement you made.
- Anything you found that is wrong but out of scope — record it, do not fix it.
