import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// ⚠ `codeOnly` and `sourceFiles` moved to `lib/source-text.ts` in step 8, unchanged, because
// `lib/client/guardrails.test.ts` needs the same two primitives and a second copy of a
// comment-stripper is a guard waiting to be defeated by prose in one file and not the other.
import { codeOnly, sourceFiles } from './source-text';

// ⚠ Deliberately written with the `@/` alias, and it is the only import in the project
// that is. This line IS the guardrail: if `resolve.alias` in `vitest.config.mts` is
// missing or wrong, this file fails to resolve and the suite goes red at exit code 1.
// A text assertion against the config would prove the text, not the resolution.
import { EM_DASH } from '@/lib/format';

/**
 * Project-wide guardrails — the rules that are enforced by a failing test instead of by a
 * linter or a sentence in a README.
 *
 * They are separated from `contract.test.ts` because their scope is the project, not the
 * telemetry contract, and because steps 2–11 will add more of them (a Dockerfile that must
 * gate on an exit code, a systemd unit whose `StartLimit*` keys must sit in `[Unit]`).
 * They need an obvious home, and the contract file should stay about the contract.
 *
 * The first test here is the most load-bearing in the project and the least obviously
 * named, so it is worth stating plainly: `strict: false` together with
 * `exactOptionalPropertyTypes: true` is an *invalid* tsconfig (TS5052). `tsc` bails before
 * checking anything and Vitest then reports `Type Errors  no errors` — a green typecheck
 * on a compiler that never ran. A text assertion is the only thing that catches it.
 */

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

describe('build configuration', () => {
  /*
   * The real enforcement of global invariant 1 is `strictNullChecks`, and the real proof
   * is in lib/types.test-d.ts: turn strict off and every `@ts-expect-error` there becomes
   * an unused directive, which is itself a compile error.
   *
   * This is the second lock. It is deliberately a text match rather than a JSON parse,
   * because tsconfig.json is JSONC — it carries comments — and a hand-rolled comment
   * stripper is more code to get wrong than the thing it checks.
   *
   * ⚠ `next build` rewrites tsconfig.json in place (it sets `jsx` and appends to
   * `include`). Pinning the file's bytes would fight a tool that will simply rewrite them
   * again, and would fail the first time Next legitimately needs a new `include` path.
   * Pinning the *properties* survives that — so every flag a later step depends on is
   * listed, not only the ones invariant 1 needs.
   */
  test('TypeScript is strict, and stays strict', () => {
    const raw = readFileSync(join(projectRoot, 'tsconfig.json'), 'utf8');

    expect(raw).toMatch(/"strict"\s*:\s*true/);
    expect(raw).not.toMatch(/"strict"\s*:\s*false/);
    expect(raw).not.toMatch(/"strictNullChecks"\s*:\s*false/);

    // Invariant 1: a reading cannot be reached without confronting `null`, and an index
    // into a list cannot be assumed to be inhabited.
    expect(raw).toMatch(/"noUncheckedIndexedAccess"\s*:\s*true/);
    expect(raw).toMatch(/"exactOptionalPropertyTypes"\s*:\s*true/);

    // Step 2's severity bands and step 9's channel-5 mode switch depend on this one: a
    // missing `break` in a severity switch silently reports the wrong band.
    expect(raw).toMatch(/"noFallthroughCasesInSwitch"\s*:\s*true/);

    expect(raw).toMatch(/"noImplicitOverride"\s*:\s*true/);
    expect(raw).toMatch(/"noUnusedLocals"\s*:\s*true/);
    expect(raw).toMatch(/"noUnusedParameters"\s*:\s*true/);
    expect(raw).toMatch(/"allowJs"\s*:\s*false/);
  });

  /*
   * The `@/` path alias, proven by use rather than by inspection.
   *
   * Three toolchains have to agree about it and they read three different files:
   * `tsc` and `next build` take it from `tsconfig.json`'s `paths`, and **Vitest does not
   * read `paths` at all** — it needs `resolve.alias` in `vitest.config.mts`. Two of the
   * three agreeing is the failure mode, because `pnpm build` then passes and `pnpm test`
   * fails on an import that looks correct.
   *
   * §2.4 is why the convention is worth keeping: `app/`, `components/` and `lib/` are
   * siblings, so `app/api/telemetry/route.ts` reaches the contract at `../../../lib/types`.
   */
  test('the `@/` alias resolves under Vitest, not only under tsc and next build', () => {
    // Reached through the aliased import at the top of this file. If the alias were absent
    // this assertion would never run — the module would fail to load first — which is the
    // point: the proof is the resolution, and the value only shows it is the right module.
    expect(EM_DASH).toBe('—');
  });

  test('tsconfig still declares the paths mapping the other two toolchains read', () => {
    // The companion half. The alias alone would leave `tsc` unable to resolve `@/`, which
    // is a different failure with the same cause: one of three configs out of step.
    const raw = readFileSync(join(projectRoot, 'tsconfig.json'), 'utf8');
    expect(raw).toMatch(/"@\/\*"/);
  });

  /* SPEC.md §2.5: the container copies `.next/standalone` and runs `node server.js`. */
  test('Next.js emits a standalone build', () => {
    const raw = readFileSync(join(projectRoot, 'next.config.mjs'), 'utf8');
    expect(raw).toMatch(/output:\s*'standalone'/);
  });

  /*
   * SPEC.md §2.5: "`--read-only` means no `next/image`." Next's image optimiser writes to
   * a runtime cache directory and fails on a read-only filesystem. The spec asks for this
   * to be "a stated rule or someone will reach for `next/image` and spend an afternoon on
   * it" — so it is a failing test instead of a sentence in a README.
   */
  test('the image component is imported nowhere in the source', () => {
    // Import-shaped, not a bare substring: the rule is about pulling the component in,
    // and next.config.mjs explains the rule in prose.
    const importsIt = /(?:from|require\()\s*['"]next\/image['"]/;
    const offenders = sourceFiles().filter((file) => importsIt.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  /*
   * The green signal itself. `pnpm verify` is `rm -f tsconfig.tsbuildinfo && tsc --noEmit &&
   * vitest run`: shell `&&` makes the exit status the definition of green by construction,
   * which the Vitest summary is not. Measured in step 1's sandbox — a test file that fails to
   * compile printed `Test Files 2 passed (2)` / `Tests 57 passed (57)` / `Type Errors no
   * errors` and exited 1. Step 11's Docker build gates on this exit code, never on grepping
   * output.
   *
   * ⚠ **The `rm` is the important half, and it was added in step 7's reconciliation.**
   * `incremental: true` is on, and a stale `tsconfig.tsbuildinfo` has now been observed in
   * *both* directions:
   *
   * - a **false failure** in step 3 — annoying, one line to recover from;
   * - a **false pass** in step 7's build, where `pnpm typecheck` exited 0 on a tree carrying
   *   a `TS2305` (a test file importing a just-deleted export). `pnpm test` then failed at
   *   *runtime*, and Vitest's own typecheck block printed `Type Errors no errors`. Deleting
   *   the file and re-running produced the error immediately; three attempts to reproduce the
   *   stale state failed.
   *
   * A false red costs a bisect. **A false pass ships the bug**, and this project's only trust
   * anchor is `pnpm verify`'s exit code — so the mitigation belongs in the script rather than
   * in a ritual that every future phase has to remember. `pnpm typecheck` stays incremental
   * for iteration, which HANDOVER already says is not the green signal.
   *
   * This assertion exists to prevent a **silent weakening** of that command; strengthening it
   * deliberately, with this line updated in the same change, is exactly what it is for.
   */
  test('a single command defines green, it is exit-code based, and it is cold', () => {
    const pkg: unknown = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const scripts = (pkg as { scripts?: Record<string, string> }).scripts ?? {};
    expect(scripts['verify']).toBe('rm -f tsconfig.tsbuildinfo && tsc --noEmit && vitest run');
  });

  /*
   * ⚠ The Node major, pinned in the three places that read three different files.
   *
   * `engines.node` is a declaration nothing enforces: `engine-strict` is off, and this Mac
   * has been running v26.8.1 against a manifest that says `<25.0.0` since step 4. That did
   * not bite step 4 — both Nodes ship libuv 1.52.1 and both map errno −96 to `ENODATA`,
   * measured — but **step 7 builds argon2id**, the project's only native/ABI surface, and
   * `NODE_MODULE_VERSION` differs between 24 and 26. A binary resolved on the desk under 26
   * is not the one that runs in `node:24-slim`, and the failure would surface in step 11's
   * container or on the box rather than here.
   *
   * `.nvmrc` and `.node-version` both exist because nvm reads the first and fnm/asdf read
   * the second; a project that pins only one silently pins nothing for half its readers.
   *
   * ⚠ Two things this deliberately is NOT:
   *
   * - **not `engine-strict=true`** in an `.npmrc`. That genuinely enforces — and it would
   *   make `pnpm install` refuse on this machine today, blocking every remaining step until
   *   someone switches Node mid-pipeline. Step 11's Dockerfile is the enforcement point.
   * - **not an assertion about `process.versions.node`.** That would turn the suite red
   *   right now, and "green" is this project's only signal. This is a *config-consistency*
   *   check: it is green on any machine, and it fails only when the three files disagree.
   */
  test('⚠ the Node major is pinned consistently in every file that declares it', () => {
    const pkg: unknown = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const range = (pkg as { engines?: Record<string, string> }).engines?.['node'] ?? '';

    const nvmrc = readFileSync(join(projectRoot, '.nvmrc'), 'utf8').trim();
    const nodeVersion = readFileSync(join(projectRoot, '.node-version'), 'utf8').trim();

    // Both version-manager files exist and agree with each other.
    expect(nvmrc).toBe(nodeVersion);
    expect(nvmrc).toMatch(/^\d+$/);

    // …and with `engines.node`, which is written as a half-open major range.
    const major = Number(nvmrc);
    expect(range).toBe(`>=${major}.0.0 <${major + 1}.0.0`);
  });
});

describe('source hygiene', () => {
  /*
   * ⚠ No raw control bytes in source.
   *
   * `dell-smm.test.ts` shipped a literal NUL (`ok('\0')` written as the byte rather than
   * the escape). The behaviour was identical and the cost was invisible: **`grep -rn` and
   * `ripgrep` both classify the file as binary and report it as containing nothing**, with
   * no "binary file matches" note on BSD grep. `git grep` did not save it either, because
   * `dashboard/` was untracked. So a 533-line test file — every `describe` name, every
   * `test` name, eighteen references to the function it covers — was unsearchable by every
   * tool an agent reaches for by default, on a project whose method is anchor-on-exact-
   * string and whose remaining steps are read by fresh agents who will grep before they
   * read.
   *
   * Tabs, CR and LF are allowed: the first is legitimate whitespace and the last two are
   * line endings. Everything else below 0x20 is a mistake or an invisible payload.
   */
  test('⚠ no source file contains a raw control byte', () => {
    const offenders = sourceFiles()
      .map((file) => [file, readFileSync(file, 'utf8')] as const)
      .filter(([, text]) => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
      .map(([file]) => file.slice(projectRoot.length));
    expect(offenders).toEqual([]);
  });

  /*
   * ⚠ §3.7's structural rule, which no behavioural test can carry.
   *
   * "`pwm5Present` and `ch5Mode` must both be derived from ONE three-valued probe, **never
   * from each other**." The two counter-example tests in `dell-smm.test.ts` enforce the
   * *extensional* half — that neither is a function of the other — and they are the real
   * protection. They cannot enforce the structural half: a **behaviour-preserving**
   * coupling (`if (ch5ModeFrom(probe) !== null) return true; …`) makes one read the other's
   * answer while producing the identical total function, and it passes the entire suite and
   * every mutation in step 4's harness. It is invisible today and becomes live the moment
   * either function gains an outcome.
   *
   * So it is asserted over the source text, which is how this file already enforces
   * `tsconfig`'s flags and the `verify` script. Ugly, and honest — and it is here rather
   * than in `dell-smm.test.ts` because a test that reads its own module's source belongs
   * with the other structural guardrails, not among the unit tests it is defending.
   */
  /*
   * ⚠ The project's THIRD guard rule, added in step 5's reconciliation.
   *
   * The three catch three different things and none of them subsumes another:
   *
   * - the **red-test ledger** catches a test that cannot fail;
   * - **fixture symmetry** catches a boundary tested from one side;
   * - **source-text guardrails** catch *a call that should exist and does not.*
   *
   * The first two could not have caught this one, and it is worth being exact about why.
   * The ledger's input is a ⚠-marked *test*; `http.ts`'s bare `setTimeout` had no test and
   * no mutation, so it never entered the ledger's input at all — the ledger detects an
   * inert test, never an absent one. Fixture symmetry's input is a *comparison a parser
   * already contains*; `boundedTimeoutMs`'s own `≤ 2³¹−1` boundary is correctly fixtured on
   * both sides in `deadline.test.ts`, and HANDOVER §5.1 names it as the worked example. The
   * rule cannot say "and every seam that accepts a `timeoutMs` must route it through that
   * function", because that is a statement about a call graph, not about a boundary.
   *
   * What it guards: `setTimeout` clamps a delay outside `(0, 2³¹−1]` to **1 ms**. Measured,
   * both sites, before the fix — `collectGpus({ timeoutMs: Infinity })` gave `gpus: null` at
   * 4 ms, and `nodeHttp` with the same argument gave `health: 'unreachable'`, §6.3's ALARM
   * on a server answering in 5 ms, with the entry "timed out after Infinity ms". `Infinity`
   * is HANDOVER's *"obvious way to write 'do not bound this'"*.
   *
   * Two rules come with it, mirroring the ledger's own two:
   *
   * 1. **A failure means a new unvalidated bound was added, not that this test needs
   *    loosening.** Weakening it is the exact analogue of "add a mutation until the ledger
   *    goes green", which HANDOVER already forbids. The fix is to call `boundedTimeoutMs`.
   * 2. **It is a NECESSARY condition only.** It cannot see a bound that is validated and
   *    then used wrongly, and it cannot see the next structural hole, which will be a
   *    different shape. Keep reading each seam against its own doc comment.
   *
   * `deadline.ts` is the one exemption: it is where `boundedTimeoutMs` is defined, and its
   * `setTimeout(…, left)` counts down a budget that function has already validated.
   */
  /*
   * ⚠ **Scope widened in step 6's reconciliation, and the widening is the finding.**
   *
   * Step 6 shipped its own copy of this idea over a **hard-coded five-file list**, and the
   * adversarial phase defeated it by *adding a file*: a new module under `lib/telemetry/`
   * containing a literal `setInterval(…, 5000)` passed 71 of 71 tests, including the guard
   * that existed to forbid exactly that. Hence HANDOVER §5.3's third practical note —
   * **enumerate inputs by walking the tree, never by listing files** — and hence this rule
   * now covers every server-side directory rather than only `lib/collectors/`:
   *
   * | path | why it is in scope |
   * |---|---|
   * | `lib/collectors/` | the original: four hand-rolled bounds, three of which turned `Infinity` into 1 ms |
   * | `lib/telemetry/` | §4's ceiling lives here, and §4 forbids background work outright |
   * | `app/api/` | anything that runs in the server process on behalf of a request |
   * | `lib/auth/` | **added in step 7.** HANDOVER §5.3 named the login rate limiter as the thing most likely to reach for `setInterval` to sweep its map; it and the revocation store each hold a `Map` that has to be pruned, and both sweep lazily instead |
   * | `proxy.ts` | **added in step 7.** Next 16's gate is one module at the project root, and it runs in the server process on every request that is not a static asset |
   *
   * ⚠ **Client code under `app/` other than `app/api/` is deliberately out of scope.**
   * Step 8's polling, backoff and countdown timers are legitimate and belong to the
   * browser — and so does step 7's own `Retry-After` countdown under `app/login/`. That
   * boundary is stated so the rule is not "fixed" by loosening it when step 8 arrives —
   * which would be the exact analogue of adding a mutation until the ledger goes green.
   * Step 8 writes its **own** guard for its own timers.
   */
  test('⚠ every setTimeout in the server process is a validated bound', () => {
    const offenders: string[] = [];

    for (const file of serverSideFiles()) {
      const name = file.slice(projectRoot.length);
      if (name.endsWith('deadline.ts')) continue; // the one exemption — see above
      // ⚠ Comments are blanked first. These modules explain the defect in prose — "a bare
      // `setTimeout(…, timeoutMs)` turns Infinity into 1 ms" — and a scanner that read a
      // doc comment as a call would fail on the file that documents the fix.
      const text = codeOnly(readFileSync(file, 'utf8'));

      for (const call of text.matchAll(/setTimeout\(/g)) {
        const delay = lastArgumentOf(text, (call.index ?? 0) + 'setTimeout('.length);
        // Accepted two ways, and no third: the call itself, or a local whose *initialiser*
        // is that call. `const bound = timeoutMs;` is deliberately not enough — the whole
        // defect was a plausible-looking local holding an unvalidated number.
        const direct = delay.includes('boundedTimeoutMs(');
        const viaLocal =
          /^[A-Za-z_$][\w$]*$/.test(delay) &&
          new RegExp(`const ${delay}\\s*(?::[^=]+)?=\\s*boundedTimeoutMs\\(`).test(text);
        if (!direct && !viaLocal) offenders.push(`${name}: setTimeout(…, ${delay})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
   * ⚠ §4: "Sampling is per-request, not a background loop. With no clients connected the
   * container does no work at all — it must never itself become load on a box whose thermal
   * margin is the thing being watched."
   *
   * A repeating or immediate scheduler has no legitimate use anywhere in the server
   * process: the 2 s window is a comparison made when a caller arrives, and §4's ceiling is
   * a one-shot `deadline`. This forbids the literal spellings.
   *
   * ⚠ **It is a NECESSARY condition and a weak one, and saying so is the point.**
   * `setInterval` is a *global*: `globalThis.setInterval`, `const {setInterval: every} =
   * globalThis` and `globalThis['set' + 'Interval']` are three spellings and there is no
   * last one, so **no text rule can be sound over a global**. Both evasions were measured
   * in step 6. What this catches is the *accidental* spelling — the auto-import, the
   * copy-paste, the plausible-looking warm-up in a new file — which is what a text guard is
   * for. The property itself is carried by the behavioural tests in
   * `lib/telemetry/source.test.ts`: fake timers advanced through a simulated idle minute,
   * and a spy on the global schedulers across the module load. Neither of those sees a new
   * file that is never imported; this does. They are complements, not alternatives.
   */
  test('⚠ nothing in the server process schedules a repeating or immediate timer', () => {
    const offenders: string[] = [];

    for (const file of serverSideFiles()) {
      const text = codeOnly(readFileSync(file, 'utf8'));
      for (const scheduler of ['setInterval(', 'setImmediate(', 'queueMicrotask(']) {
        if (text.includes(scheduler)) {
          offenders.push(`${file.slice(projectRoot.length)}: ${scheduler}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
   * ⚠ HANDOVER §6 item 1 — "the single most important line in this section" — asserted over
   * the assembler's own source text.
   *
   * > §6.7: "A collector's budget bounds the collector's wall clock; it is never evidence
   * > about a subject … A verdict of failure may be minted only from an answer, or from a
   * > bound that applied to that subject **and to nothing else**."
   *
   * One `deadline()` shared across the six collectors is **behaviour-preserving on every
   * healthy poll**: no fixture distinguishes it, no mutation of a comparison reaches it, and
   * it shows itself only on the poll where one collector is slow — by minting a verdict of
   * failure about five subjects the bound never applied to. On §6.7's blessed 6 s poll it
   * ships `gpus: null` plus an `nvidia-smi` entry for two cards that were answering
   * normally, because `llama-server` was slow. Measured in step 6: 59 of 59 behavioural
   * tests stay green under it.
   *
   * ⚠ **The specifier is banned by PATH PREFIX, not by name, and that is the fix.** Step 6
   * shipped this guard reading one regex — the barrel's brace block — and the adversarial
   * defeated it with `import { deadline } from '@/lib/collectors/deadline'`, which is a real
   * module, is what an editor's auto-import offers, and was 60 of 60 green. There are four
   * ways to reach a bound from this file and all four are closed here: the barrel's brace
   * block, a deeper specifier, a namespace import, and hand-rolling a timer.
   *
   * ⚠ This is soundly guardable *because the vocabulary is module-local* — `deadline` and
   * `boundedTimeoutMs` are not globals, and the companion test below proves the latter is
   * defined exactly once. Contrast the `setInterval` rule above, which guards a global and
   * therefore cannot be made sound at all. That distinction is HANDOVER §5.3's fourth
   * practical note and it decides whether a text guard is allowed to be the whole answer.
   *
   * ⚠ `lib/telemetry/ceiling.ts` legitimately imports `deadline` and is **not** in scope
   * here: §4's ceiling is a bound on ONE collector, which is the opposite of a budget shared
   * across six. The rule is about the assembler, and the assembler is `snapshot.ts`.
   */
  test('⚠ the assembler shares no budget across collectors', () => {
    const src = codeOnly(readFileSync(join(projectRoot, 'lib/telemetry/snapshot.ts'), 'utf8'));

    // 1. Deep imports are banned by prefix — the measured evasion. Only the barrel.
    expect(src).not.toMatch(/from\s+'@\/lib\/collectors\//);
    // 2. A namespace import would put every export behind a property access.
    expect(src).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s+'@\/lib\/collectors'/);

    // 3. The barrel's own brace block carries no bound.
    const imported = /import \{([^}]*)\} from '@\/lib\/collectors';/.exec(src)?.[1] ?? '';
    expect(imported, 'the collectors import block was not found').not.toBe('');
    for (const bound of ['deadline', 'boundedTimeoutMs', 'boundedReader', 'MAX_TIMEOUT_MS']) {
      expect(new RegExp(`\\b${bound}\\b`).test(imported), `${bound} is imported`).toBe(false);
    }

    // 4. And no hand-rolled one. (The tree-wide rules above say this too; it is repeated
    //    here because this test is where the reason lives.)
    expect(src).not.toContain('setTimeout(');
    expect(src).not.toContain('setInterval(');
  });

  /*
   * The companion half: the allowlist above is only meaningful while `boundedTimeoutMs` is
   * the single definition of a validated budget. A second copy anywhere would let a seam
   * pass this test with its own, weaker, coercion.
   */
  test('⚠ boundedTimeoutMs is defined exactly once in the project', () => {
    const defined = sourceFiles().filter((file) =>
      /export const boundedTimeoutMs\s*=/.test(readFileSync(file, 'utf8')),
    );
    expect(defined.map((f) => f.slice(projectRoot.length))).toEqual(['lib/collectors/deadline.ts']);
  });

  test('⚠ neither pwm5 projection calls the other — §3.7’s "never from each other"', () => {
    const src = readFileSync(join(projectRoot, 'lib/collectors/dell-smm.ts'), 'utf8');
    const bodyOf = (name: string): string => {
      const start = src.indexOf(`export const ${name} = (`);
      expect(start, name).toBeGreaterThan(-1);
      const end = src.indexOf('\n};', start);
      expect(end, name).toBeGreaterThan(start);
      return src.slice(start, end);
    };
    expect(bodyOf('pwm5PresentFrom')).not.toContain('ch5ModeFrom(');
    expect(bodyOf('ch5ModeFrom')).not.toContain('pwm5PresentFrom(');
  });
});

/**
 * The text of the **last top-level argument** of a call whose `(` has just been consumed.
 *
 * Paren-, brace- and bracket-balanced rather than a regex, because the first argument to
 * `setTimeout` is an arrow function full of both commas and parentheses, and a `}, delay)`
 * match would silently read the wrong call's argument for `setTimeout(fn, delay)`. Strings
 * are skipped so a comma inside one cannot split an argument. Returns `<unparsed>` if the
 * call is not closed, which fails the assertion rather than passing it.
 */
function lastArgumentOf(text: string, from: number): string {
  let depth = 0;
  let lastComma = from;
  let quote = '';
  for (let i = from; i < text.length; i += 1) {
    const c = text[i] ?? '';
    if (quote !== '') {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) lastComma = i + 1;
    else if (c === ')') {
      if (depth === 0) return text.slice(lastComma, i).trim();
      depth -= 1;
    }
  }
  return '<unparsed>';
}

/**
 * Every hand-written source file that runs in the **server** process, tests excluded.
 *
 * ⚠ Enumerated by walking, never by listing: a guard over a hard-coded file list is
 * defeated by adding a file, which is exactly how step 6's own copy of the timer rule was
 * defeated (a new `lib/telemetry/` module with a literal `setInterval(` passed 71 of 71).
 * `app/` other than `app/api/` is out of scope on purpose — step 8's timers are the
 * browser's and are legitimate.
 */
function serverSideFiles(): string[] {
  // ⚠ Directory prefixes **and** one exact file: Next 16's gate is a single module at the
  // project root (`proxy.ts`, renamed from `middleware.ts`) and it runs on every request that
  // is not a static asset. A scope list that could only name directories would have missed
  // it — the "guard over a hard-coded list" failure in a new shape.
  const scopes = ['lib/collectors', 'lib/telemetry', 'lib/auth', 'app/api', 'proxy.ts'].map(
    (path) => join(projectRoot, path),
  );
  return sourceFiles().filter(
    (file) =>
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx') &&
      scopes.some((scope) => file === scope || file.startsWith(`${scope}/`)),
  );
}
