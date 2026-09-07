/**
 * Step 8's own guards — **the client's timers, and the client's module boundary.**
 *
 * HANDOVER §5.3 scopes the *server-side* timer rule to `lib/collectors/`, `lib/telemetry/`,
 * `lib/auth/`, `app/api/` and `proxy.ts`, and says step 8 "writes its own guard for its own
 * timers; it does not loosen this one". It also says what that guard has to be about:
 *
 * > not "is the delay bounded" but "is every timer cleared on unmount, and does a hidden tab
 * > schedule nothing".
 *
 * And it says why one kind of guard is not enough:
 *
 * > A text guard is sound only over a vocabulary that cannot be aliased. A **global**
 * > (`setInterval`, `fetch`, `require`) is **not guardable by text at all** —
 * > `globalThis.setInterval`, a destructured alias and a computed property are three
 * > spellings with no last one. That needs a **behavioural** test and a **runtime** one.
 *
 * So this file carries all three, and they see different things:
 *
 * | guard | catches | blind to |
 * |---|---|---|
 * | **text** (below) | a global written plainly in a new module | every alias of it, and every file it exempts |
 * | **runtime** (below) | any spelling of a global **it wraps** | a global it does not wrap, and a path the fixture never walks |
 * | **behavioural** (`runtime.test.ts`) | a timer that is scheduled but never cleared | a timer created outside `env` |
 *
 * ⚠ The middle row used to read *"any spelling at all"*. That was a documentation claim
 * naming a property the test did not check: the guard wrapped four schedulers, and `fetch` —
 * named in the same breath by §5.3 note 4 — was not one of them. `const go = fetch;` followed
 * by `go(TELEMETRY_PATH)` passed **all three** guards, so a new module could reach the network
 * outside the `RuntimeEnv` seam — no visibility pause, no backoff, no 401 hand-off, no
 * `parseSnapshot` — with the suite green. {@link NETWORK_GLOBALS} closes it, and the row above
 * now says what the code does.
 *
 * ⚠ The text guard has **three** exemptions, not two: `env.ts` (the seam itself),
 * `fake-env.ts` (test scaffolding) and `use-telemetry.ts` (the hook must reach `window`).
 * The third was undocumented, and it exempts the one file in this step with no test of its
 * own — worth naming rather than discovering.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, test } from 'vitest';

// ⚠ One definition of "the code, with the prose blanked out". Every module in this tree
// explains its own bugs at length — `backoff.ts` discusses `setTimeout(NaN)`, `wire.ts`
// quotes O10's "no `as TelemetrySnapshot`" — so a guard that read comments would be
// defeated by the very sentences that document the rule.
import { codeOnly, projectRoot, sourceFiles } from '../source-text';

import { FakeEnv, MemoryStorage, tsAt, wireBodyOf } from './fake-env';
import { everythingZero } from '../fixtures';
import { atTs } from './fake-env';
import { TelemetryRuntime } from './runtime';

const clientRoot = join(projectRoot, 'lib', 'client');

/** Every global scheduler, by name. Wrapped wholesale; the runtime must reach none of them. */
const SCHEDULER_GLOBALS = ['setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask'] as const;

/**
 * Every global that reaches the network.
 *
 * ⚠ `fetch` belongs here and used to belong nowhere: §5.3 note 4 names it in the same breath
 * as `setInterval`, and the text guard's clause matched a **call** (`fetch(`) where the
 * scheduler clause matched a bare identifier — so `const go = fetch;` escaped it. Wrapping it
 * is four lines. `XMLHttpRequest` is the one other spelling of the same capability and is what
 * a copy-pasted snippet reaches for; it is not a global in Node, so the wrapper below defines
 * it for the window and deletes it afterwards, which means an attempt is *recorded* rather
 * than throwing a `ReferenceError` that could be mistaken for an unrelated failure.
 */
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest'] as const;

/**
 * A stack frame inside a hand-written client module — not a test, and not the scaffolding.
 *
 * The `(?!…)` is what keeps this honest: `guardrails.test.ts` and `fake-env.ts` both live
 * under `lib/client/` and both legitimately schedule, so a frame from either says nothing
 * about the code under test.
 */
const CLIENT_FRAME = /[\\/]lib[\\/]client[\\/](?!fake-env\.ts)(?![\w-]+\.test)[\w-]+\.tsx?/;

/** Every hand-written client-runtime module, tests and test scaffolding excluded. */
function clientFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) found.push(full);
    }
  };
  walk(clientRoot);
  return found.filter(
    (file) =>
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx') &&
      !file.endsWith('.test-d.ts') &&
      !file.endsWith('fake-env.ts'),
  );
}

/** Every hand-written source file, tests and type-tests excluded. */
const productionFiles = (): string[] =>
  sourceFiles().filter((file) => !/\.test(-d)?\.tsx?$/.test(file));

const shortName = (file: string): string => relative(projectRoot, file);

/** `'gpu-fan-control.service'` as a literal, or a template building `llama-server@<i>.service`. */
const UNIT_NAME = /['"]gpu-fan-control\.service['"]|llama-server@\$\{[^}]*\}\.service/;

describe('⚠ step 8’s timers are the browser’s, and they go through one seam', () => {
  /*
   * ⚠ Enumerated by **walking**, never by listing — HANDOVER §5.3 note 3: "a guard over a
   * hard-coded file list is defeated by *adding a file*, measured in step 6, where a new
   * module containing a literal `setInterval(` passed 71 of 71."
   *
   * `env.ts` is the single exemption, and it is the whole point of `env.ts` existing: it is
   * where `window.setTimeout` is reached, once, behind a parameter a test can substitute.
   */
  test('⚠ nothing under lib/client/ but env.ts names a scheduler', () => {
    const schedulers = /\b(setInterval|setTimeout|setImmediate|queueMicrotask|requestAnimationFrame)\b/;
    const offenders = clientFiles()
      .filter((file) => !file.endsWith('env.ts'))
      .filter((file) => schedulers.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });

  test('⚠ nothing under lib/client/ but env.ts names document, localStorage, fetch or location', () => {
    // ⚠ A property access or a lone identifier, never a substring of one and never the tail
    // of a dotted name: `aid.window` is a **preference key**, and a guard that read it as a
    // global would fail on the very string §6.7 names.
    // ⚠ `fetch` is matched as a bare **identifier**, not as a call. `(?<![.\w$])fetch\s*\(`
    // was the original clause and `const go = fetch;` walked straight past it — an alias that
    // then reached the network outside the seam with all three guards green (F9). The
    // scheduler clause above always matched identifiers; this one now agrees with it.
    // `fetchTelemetry` is not a match: `\b` needs a word boundary and `h`→`T` is not one.
    const globals =
      /(?<![.\w$'"])(document|localStorage|sessionStorage|window|globalThis|navigator)\b|(?<![.\w$])fetch\b/;
    // ⚠ Three exemptions, all deliberate and all named here rather than left to be discovered:
    // `env.ts` is the seam, `fake-env.ts` is scaffolding (excluded by `clientFiles`), and
    // `use-telemetry.ts` must reach `window` to decide whether there is a browser at all.
    const exempt = ['env.ts', 'use-telemetry.ts'];
    const offenders = clientFiles()
      .filter((file) => !exempt.some((name) => file.endsWith(name)))
      .filter((file) => globals.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });

  /*
   * ⚠ The runtime half of §5.3 note 4, and the only guard that survives an alias. Every global
   * scheduler **and every global that reaches the network** is wrapped for the whole of a
   * session — start, poll, cadence change, hide, show, pause, refresh, fail, recover, stop —
   * and the assertion is that not one of them was reached, by any spelling of the names it
   * wraps. A text guard cannot say this; a behavioural test with a fake `env` cannot either,
   * because it never looks at the globals at all.
   *
   * ⚠ **The measurement verifies itself, because it can otherwise be voided in silence.**
   * The wrappers are installed for the length of the session and restored in a `finally`, and
   * that is only meaningful while they are still ours. `vitest.config.mts` sets no `pool` or
   * `isolate`, so one file per worker holds today — but this run's own reporter recommends
   * `isolate: false` on every invocation ("~420ms faster … reuses workers across files"), and
   * step 11 will want that when it starts caring about CI time. Under it another file's own
   * patch-and-restore can interleave with this one and leave the globals un-wrapped for part
   * of the window: the runtime's calls would go unrecorded, the guard would still pass, and it
   * would no longer measure its own property. So the window ends by asserting the globals are
   * **still the wrappers this test installed** — a configuration change turns the guard red
   * rather than hollow, which is the only acceptable direction. The attribution below covers
   * the mirror case, where a shared worker's unrelated timer would otherwise redden this.
   */
  test('⚠ a whole session reaches no global scheduler or network call, by any spelling', async () => {
    const names = [...SCHEDULER_GLOBALS, ...NETWORK_GLOBALS];
    const original = new Map(names.map((name) => [name, Reflect.get(globalThis, name) as unknown]));
    const installed = new Map<string, unknown>();
    const calls: { name: string; stack: string }[] = [];
    for (const name of names) {
      const real = original.get(name);
      const wrapper = (...args: unknown[]): unknown => {
        calls.push({ name, stack: new Error('reached a global').stack ?? '' });
        if (typeof real !== 'function') throw new Error(`${name} is not callable here`);
        return (real as (...a: unknown[]) => unknown)(...args);
      };
      installed.set(name, wrapper);
      Reflect.set(globalThis, name, wrapper);
    }

    try {
      const env = new FakeEnv(new MemoryStorage({ 'aid.cadence': '1' }));
      const advance = (ms: number): Promise<void> => env.advance(ms);
      env.replySnapshot(atTs(everythingZero, tsAt(0)));
      const runtime = new TelemetryRuntime(env);
      runtime.start();
      await advance(0);

      env.replySnapshot(atTs(everythingZero, tsAt(1)));
      await advance(1_000);
      runtime.setCadence(10);
      await env.setHidden(true);
      await advance(60_000);
      await env.setHidden(false);
      await advance(0);
      runtime.pause();
      runtime.refreshNow();
      await advance(0);
      runtime.resume();
      env.reply({ kind: 'error', detail: 'down' });
      await advance(10_000);
      env.reply({ kind: 'ok', body: wireBodyOf(atTs(everythingZero, tsAt(90))) });
      await advance(20_000);
      runtime.stop();

      // ⚠ Attributed by stack, not merely counted. The property is "the code under test
      // reached no global", which is stronger than "this worker saw no call" and is the same
      // statement whether or not files share a worker. `fake-env.ts` captures `setImmediate`
      // at module load, so the harness's own draining never passes through a wrapper.
      const fromClient = calls.filter((call) => CLIENT_FRAME.test(call.stack));
      expect(fromClient.map((call) => call.name)).toEqual([]);

      // ⚠ And the measurement was live for the whole window — see the block comment.
      for (const name of names) {
        expect(Reflect.get(globalThis, name)).toBe(installed.get(name));
      }
    } finally {
      for (const name of names) {
        const was = original.get(name);
        if (was === undefined) Reflect.deleteProperty(globalThis, name);
        else Reflect.set(globalThis, name, was);
      }
    }
  });

  /*
   * ⚠ The behavioural half, stated here as well as in `runtime.test.ts` because it is the
   * property HANDOVER actually names: "is every timer cleared on unmount, and does a hidden
   * tab schedule nothing".
   */
  test('⚠ every timer the runtime scheduled is cleared by stop(), and none outlives it', async () => {
    const env = new FakeEnv();
    env.replySnapshot(atTs(everythingZero, tsAt(0)));
    const runtime = new TelemetryRuntime(env);
    runtime.start();
    await env.advance(0);
    expect(env.pending).toHaveLength(1);

    runtime.stop();
    expect(env.pending).toEqual([]);
    expect(env.visibilityUnsubscribes).toBe(env.visibilitySubscribes);

    const fetches = env.fetches;
    await env.advance(3_600_000);
    expect(env.fetches).toBe(fetches);
  });
});

describe('⚠ the client-safe module boundary', () => {
  /*
   * ⚠ HANDOVER §3.2: "Do not import anything else from `lib/auth/` in client code."
   * `handler.ts`, `authorize.ts`, `revocations.ts`, `rate-limit.ts`, `session.ts`,
   * `scrypt.ts`, `cookie.ts`, `config.ts` and `base64url.ts` reach `node:crypto` and
   * process-global state. The bundle would still **build**; it would fail in the browser, at
   * runtime, on the one page the operator needs.
   */
  test('⚠ nothing under lib/client/ imports a server module', () => {
    const forbidden = /from '(node:[^']*|next\/[^']*|@\/lib\/collectors\/[^']*|\.\.\/collectors\/[^']*|@\/lib\/telemetry\/[^']*|\.\.\/telemetry\/[^']*)'/;
    const offenders = clientFiles()
      .filter((file) => forbidden.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });

  test('⚠ the only lib/auth module the client imports is login-view', () => {
    const authImports = /from '(?:@\/lib|\.\.)\/auth\/([a-z-]+)'/g;
    const imported = new Set<string>();
    for (const file of clientFiles()) {
      for (const match of codeOnly(readFileSync(file, 'utf8')).matchAll(authImports)) {
        imported.add(match[1] ?? '?');
      }
    }
    expect([...imported]).toEqual(['login-view']);
  });

  /*
   * ⚠ `lib/units.ts` exists **because** of this: §6.4's condition ids are built in the browser
   * and `lib/collectors/dbus.ts`, where the two unit names used to live, opens a unix socket
   * on its first line. It is client-safe on the same terms `login-view.ts` is — no imports at
   * all — and that is the property, not the file's contents.
   */
  test('⚠ lib/units.ts imports nothing, which is what makes it client-safe', () => {
    const source = readFileSync(join(projectRoot, 'lib', 'units.ts'), 'utf8');
    expect([...source.matchAll(/^import[\s\S]*?from '([^']+)';/gm)]).toEqual([]);
  });

  test('⚠ the two unit names are defined once, in lib/units.ts, and nowhere else spells them', () => {
    const offenders = productionFiles()
      .filter((file) => !file.endsWith(join('lib', 'units.ts')))
      .filter((file) => UNIT_NAME.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });
});

describe('⚠ one spelling of every path this client asks for', () => {
  /*
   * ⚠ A **template literal counts**: `` `/login?${EXPIRED_PARAM}=1` `` is a second spelling
   * every bit as much as `'/login'` is, and the first version of this guard matched only
   * quotes. The harness's `U29` writes exactly that template and is what found it.
   *
   * ⚠ Step 7 pinned `/login` and `/api/session` against a **fixed list** of two consumers.
   * This walks the tree instead, so the rule survives step 8 adding a client and steps 9–10
   * adding panels — §5.3 note 3 again, applied to the rule step 7 wrote rather than to its own.
   */
  test('⚠ /login and /api/session are spelled only in lib/auth/login-view.ts', () => {
    const offenders = productionFiles()
      .filter((file) => !file.endsWith(join('lib', 'auth', 'login-view.ts')))
      .filter((file) => /['"`]\/login\b|['"`]\/api\/session\b/.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });

  test('⚠ /api/telemetry is spelled only in lib/client/env.ts', () => {
    const offenders = productionFiles()
      .filter((file) => !file.endsWith(join('lib', 'client', 'env.ts')))
      .filter((file) => /['"`]\/api\/telemetry\b/.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });
});

describe('⚠ O10: the wire is validated, never asserted', () => {
  /*
   * ⚠ HANDOVER: "no `as TelemetrySnapshot` on a `fetch` response". Brands are erased at
   * runtime, so a cast asserts nothing at all — and the compiler stops helping the moment one
   * is written. This is a text guard over a **module-local** vocabulary (a type name in this
   * project's own source), which §5.3 note 4 says is the guardable kind.
   */
  test('⚠ no client module casts anything to a snapshot or to a collection of readings', () => {
    const casts = /\bas\s+(TelemetrySnapshot|Gpu|Host|Cooling|Storage|Safety|ServingInstance)\b/;
    const offenders = clientFiles()
      .filter((file) => casts.test(codeOnly(readFileSync(file, 'utf8'))))
      .map(shortName);
    expect(offenders).toEqual([]);
  });
});
