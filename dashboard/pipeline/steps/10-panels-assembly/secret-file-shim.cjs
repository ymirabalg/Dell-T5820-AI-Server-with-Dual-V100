/**
 * ⚠⚠ 12a/TEST — how the two browser measurement harnesses log in under SPEC.md §5.1.
 *
 * **Harness-only. Nothing in `lib/`, `app/` or `proxy.ts` knows this file exists**, and nothing
 * in the shipped image ever loads it: it is reached exclusively through a `NODE_OPTIONS=--require`
 * that `measure-breakpoints.mjs` and `mocks/measure-arrangements.mjs` put on the `next dev` they
 * spawn, and `next dev` is not how the dashboard runs anywhere but on this Mac.
 *
 * ### The problem it solves, and why it is this shape
 *
 * Both harnesses used to hand `next dev` a generated credential pair in `PASSWORD_HASH` /
 * `SESSION_SECRET` **environment variables**. §5.1's ruling of 2026-09-11 (`11-Q2`) took both
 * secrets out of the environment: `lib/auth/secrets.ts` reads `/etc/ai-dashboard.env` and
 * nothing in the auth path reads `process.env` any more. On a developer Mac that file does not
 * exist, so the server starts with an empty `Environment` and answers **401 to every login** —
 * §5 behaving exactly as ruled (*no `PASSWORD_HASH` is a denial, not a bypass*). The harnesses
 * have been unable to reach the dashboard since that day; nobody noticed for four days, because
 * `pnpm verify` does not run them. Recorded by the build phase as `12a-Q4`.
 *
 * Of that question's two candidates this is (a): **fake the one `statSync`/`readFileSync` the
 * production reader performs, in the harness's own process tree, and change no production code**.
 * The rejected candidate (b) — a path override inside `lib/auth/secret-file.ts` — adds a new
 * entrance to the module 11b spent a loop hardening, and 11b's own rule 2 argues against it: an
 * override that exists for a test is an override a deployment can be misconfigured through.
 *
 * ⚠ Same spirit as `installGpuFabrication`, and held to the same bound: it fabricates an INPUT
 * the real deployment supplies (there, `/api/telemetry`; here, the mounted secrets file) and
 * leaves every line of the code under measurement running unmodified. In particular the login
 * still goes through `parseSecretFile`, `readAuthConfig`, scrypt and the real cookie — what is
 * faked is the two syscalls, not the authentication.
 *
 * ⚠ **It refuses to start rather than fall through.** If the two variables are absent the
 * preload throws, which fails the spawned server loudly at boot. A shim that silently did
 * nothing would reproduce the exact failure it exists to remove — a harness that cannot log in
 * — and cost another four days to notice.
 *
 * ⚠ The value never touches disk and never reaches a production code path's `process.env` read,
 * because there is no such read: `MEASURE_PASSWORD_HASH` / `MEASURE_SESSION_SECRET` are
 * deliberately NOT spelled `PASSWORD_HASH` / `SESSION_SECRET`, so a grep for the old names
 * cannot find something that looks like the environment path coming back, and
 * `authorize.test.ts`'s planted-`process.env.PASSWORD_HASH` guard keeps meaning what it says.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** The one path the server reads — `SECRET_ENV_FILE` in `lib/auth/secret-file.ts`, per §5.1. */
const SECRET_ENV_FILE = '/etc/ai-dashboard.env';

/**
 * ⚠⚠ 12a/RECONCILE (`12a-A4`) — **this file is a SECOND producer of that constant, so it is
 * tethered to the first rather than trusted.**
 *
 * The real one is `lib/auth/secret-file.ts`'s `export const SECRET_ENV_FILE` (`dashboard.sh`
 * carries a third, `ENV_FILE=`); nothing tied them, because `packaging.test.ts` overrides
 * `ENV_FILE` with a temp path in every one of its cases. If §5.1's path ever moves, this shim
 * silently stops intercepting and every browser measurement dies with the misleading
 * `server did not come up` timeout `12a-A3` is about — i.e. the drift reproduces the exact
 * four-day outage this file was written to end.
 *
 * A `.cjs` preload cannot import the TS constant, so it reads the module's source and refuses
 * to start unless the literal is in it — the same shape as `dashboard.sh`'s `unit_exec_start`
 * rule (*"THE EXPECTATION IS DERIVED FROM THE UNIT FILE, never retyped"*). This runs before
 * any fake is installed, so a drifted path is a loud refusal and never a silent no-op.
 */
const SECRET_FILE_TS = path.resolve(__dirname, '../../../lib/auth/secret-file.ts');
{
  let source;
  try {
    source = fs.readFileSync(SECRET_FILE_TS, 'utf8');
  } catch (e) {
    throw new Error(
      `secret-file-shim.cjs: cannot read ${SECRET_FILE_TS} to confirm the path it fakes (${e.message}). ` +
        'This shim exists only to intercept the ONE file the server reads; unable to check that, it refuses.',
    );
  }
  if (!source.includes(`= '${SECRET_ENV_FILE}'`)) {
    throw new Error(
      `secret-file-shim.cjs: lib/auth/secret-file.ts no longer assigns '${SECRET_ENV_FILE}'. ` +
        'The server reads a different path now, so faking this one would intercept nothing and the ' +
        'harness would fail 60 seconds later naming a port. Update SECRET_ENV_FILE here.',
    );
  }
}

const hash = process.env['MEASURE_PASSWORD_HASH'];
const secret = process.env['MEASURE_SESSION_SECRET'];
if (!hash || !secret) {
  throw new Error(
    'secret-file-shim.cjs: MEASURE_PASSWORD_HASH and MEASURE_SESSION_SECRET must both be set. ' +
      'This file is loaded only by the browser measurement harnesses; it is never part of a deployment.',
  );
}

/** Exactly the two lines §5.1's reader expects, in the order `dashboard.sh configure` writes them. */
const CONTENT = Buffer.from(`PASSWORD_HASH=${hash}\nSESSION_SECRET=${secret}\n`, 'utf8');

/** What `readCredentialBytes`'s `statSync(...).isFile()` needs to be true of. */
const fakeStat = {
  isFile: () => true,
  isDirectory: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  size: CONTENT.length,
  mode: 0o100640,
  uid: process.getuid ? process.getuid() : 0,
  gid: process.getgid ? process.getgid() : 0,
  mtimeMs: 0,
};

const isSecretFile = (candidate) => {
  try {
    return String(candidate) === SECRET_ENV_FILE;
  } catch {
    return false;
  }
};

const realReadFileSync = fs.readFileSync;
const realStatSync = fs.statSync;

fs.readFileSync = function readFileSync(target, options) {
  if (isSecretFile(target)) {
    const encoding = typeof options === 'string' ? options : options && options.encoding;
    return encoding ? CONTENT.toString(encoding) : Buffer.from(CONTENT);
  }
  return realReadFileSync.apply(this, arguments);
};

fs.statSync = function statSync(target, options) {
  if (isSecretFile(target)) return fakeStat;
  return realStatSync.apply(this, arguments);
};
