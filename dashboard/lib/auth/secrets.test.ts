/**
 * `lib/auth/secrets.ts` — **the process's ONE read, across module instances that do not share
 * a module-level binding.**
 *
 * ### ⚠⚠ Why this file exists, and what it is simulating
 *
 * `next build` bundles `lib/auth/secrets.ts` into **three** server chunks of
 * `.next/standalone` — the instrumentation entry, the gate (`proxy.ts`) and the route handlers
 * — measured by the test phase on 2026-09-11. A module-level `makeSecretSource(…)` therefore
 * gives each chunk its own memo, filled at its own moment, and the adversarial measured what
 * that costs (`11b-A3`): startup validates the file and the server goes ready; an **in-place**
 * append then makes the gate's and the routes' copies read a refused file; both memoise an
 * **empty** `Environment`; every login is a 401; **nothing is logged**; and the process never
 * exits, so `Restart=always` never fires. O20's symptom, reached through the guard built to
 * make O21 loud.
 *
 * A bundle boundary and `vi.resetModules()` produce **the same thing** — a second, independent
 * instance of one module graph in one process — so the property is measurable here, without a
 * container and without a build. Every test below imports the module **twice** and treats the
 * two copies as the gate and the route.
 *
 * ⚠ `node:fs` is mocked because the subject is *how many times the file is read and by whom*,
 * which the real filesystem cannot be asked; the parser itself is measured over real bytes in
 * `secret-file.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PASSWORD_HASH_KEY, SESSION_SECRET_KEY } from './config';

const HEX64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HASH = 'scrypt.15.8.1.c2FsdHNhbHRzYWx0c2FsdA.a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5';
const GOOD = `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${HEX64}\n`;

/** What the mocked `readFileSync` will return next, and how often it has been asked. */
const disk = { contents: GOOD, reads: 0, regular: true };

vi.mock('node:fs', () => ({
  readFileSync: (): Uint8Array => {
    disk.reads += 1;
    return new TextEncoder().encode(disk.contents);
  },
  statSync: (): { isFile: () => boolean } => ({ isFile: () => disk.regular }),
}));

/** The cell's key, spelled here so a rename of it cannot leave this suite passing vacuously. */
const CELL = Symbol.for('ai-dashboard.credentials.2026-09-11');

type Holder = Record<symbol, unknown>;

/** A second, independent instance of the module graph — one bundle's worth. */
const loadSecrets = async (): Promise<typeof import('./secrets')> => {
  vi.resetModules();
  return import('./secrets');
};

beforeEach(() => {
  disk.contents = GOOD;
  disk.reads = 0;
  disk.regular = true;
  delete (globalThis as Holder)[CELL];
});

afterEach(() => {
  delete (globalThis as Holder)[CELL];
  vi.restoreAllMocks();
});

describe('⚠⚠ one read for the PROCESS, not one read per bundle', () => {
  test('⚠⚠ two module instances read the file ONCE between them', async () => {
    const gate = await loadSecrets();
    const routes = await loadSecrets();
    // Two instances, exactly as `next build` produces — if this were one object the test
    // below would be measuring nothing.
    expect(gate).not.toBe(routes);

    expect(gate.credentialEnvironment()[SESSION_SECRET_KEY]).toBe(HEX64);
    expect(routes.credentialEnvironment()[SESSION_SECRET_KEY]).toBe(HEX64);
    expect(disk.reads).toBe(1);
  });

  test('⚠⚠ an IN-PLACE rewrite after the first read changes nothing — 11b-A3', async () => {
    // The startup arm reads a good file and the server goes ready…
    const startup = await loadSecrets();
    expect(startup.productionSecrets.refusal()).toBeNull();

    // …then the file is appended to IN PLACE (`>>`, `tee -a`, an editor with
    // backupcopy=yes). `dashboard.sh` itself always renames, so it cannot cause this;
    // anything else can.
    disk.contents = `${GOOD}${SESSION_SECRET_KEY}=${HEX64}\n`;

    const gate = await loadSecrets();
    const routes = await loadSecrets();
    // Before the fix: both of these were `{}` and every login was a 401 with nothing logged.
    expect(gate.credentialEnvironment()[SESSION_SECRET_KEY]).toBe(HEX64);
    expect(routes.credentialEnvironment()[PASSWORD_HASH_KEY]).toBe(HASH);
    expect(disk.reads).toBe(1);
  });

  test('⚠ the gate and the route cannot straddle a rewrite — they hold ONE answer', async () => {
    // `makeSecretSource`'s own comment gives this as the reason for the memo — "a file
    // rewritten mid-flight by `set-password` would change the answer between the gate and the
    // route" — and with a memo per bundle it was NOT delivered.
    const gate = await loadSecrets();
    expect(gate.credentialEnvironment()[SESSION_SECRET_KEY]).toBe(HEX64);
    disk.contents = `${PASSWORD_HASH_KEY}=${HASH}\n${SESSION_SECRET_KEY}=${'f'.repeat(64)}\n`;
    const routes = await loadSecrets();
    expect(routes.credentialEnvironment()[SESSION_SECRET_KEY]).toBe(HEX64);
  });
});

describe('⚠⚠ it never degrades SILENTLY, whichever entrance reads first', () => {
  test('⚠⚠ a request path that reads a refused file first WRITES the refusal to stderr', async () => {
    disk.contents = `${PASSWORD_HASH_KEY}=\n${SESSION_SECRET_KEY}=${HEX64}\n`;
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    const routes = await loadSecrets();
    expect(routes.credentialEnvironment()).toEqual({});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(PASSWORD_HASH_KEY);
    expect(errors[0]).toContain('the server is RUNNING');
    // ⚠ Never a value, on this path as on every other.
    expect(errors[0]).not.toContain(HEX64);
  });

  test('⚠ it is written ONCE, not once per request', async () => {
    disk.contents = `${SESSION_SECRET_KEY}=${HEX64}\n`;
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    const gate = await loadSecrets();
    const routes = await loadSecrets();
    for (let i = 0; i < 20; i += 1) {
      gate.credentialEnvironment();
      routes.credentialEnvironment();
    }
    expect(errors).toHaveLength(1);
  });

  test('⚠ a GOOD file writes nothing — §5 logs nothing about authentication', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    const gate = await loadSecrets();
    expect(gate.credentialEnvironment()[PASSWORD_HASH_KEY]).toBe(HASH);
    expect(errors).toEqual([]);
  });

  test('⚠ the REQUEST path never throws, on any file — §5 makes it a 401, never a 500', async () => {
    disk.contents = 'not a key at all\n';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const routes = await loadSecrets();
    expect(() => routes.credentialEnvironment()).not.toThrow();
    expect(routes.credentialEnvironment()).toEqual({});
  });
});

describe('⚠ a path that is not a regular file is a refusal, not a read that blocks', () => {
  test('⚠ 11b-A13 — a FIFO would block readFileSync for ever, so it is never opened', async () => {
    disk.regular = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const startup = await loadSecrets();
    const refusal = startup.productionSecrets.refusal();
    expect(refusal).toContain('could not be read');
    expect(refusal).toContain('ENOTREG');
    // ⚠ And the bytes were never asked for: `readFileSync` on a FIFO blocks until a writer
    // appears, `register()` then never returns, and systemd reports `active (running)` while
    // nothing answers on 8090.
    expect(disk.reads).toBe(0);
  });
});
