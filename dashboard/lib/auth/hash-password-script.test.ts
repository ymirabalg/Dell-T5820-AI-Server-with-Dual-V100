/**
 * ⚠ **The cross-check that makes a second producer safe.**
 *
 * `scripts/hash-password.py` produces `PASSWORD_HASH` on the box, because the box has
 * **python3 and no Node** — so nothing on the host can call {@link hashPassword}. That is a
 * second implementation of an encoding whose **only failure mode is a silent 401**: §5 logs
 * nothing about authentication, so a hash that is correct-but-spelled-differently is refused
 * by `parseScryptHash`, returns `null`, and produces *a dashboard that will not open and will
 * not say why*.
 *
 * This project has shipped that shape once already — two base64url decoders that diverged, so
 * 1 tag in 16 had four accepted spellings — and the lesson recorded in HANDOVER's do-not-copy
 * list is **never a second implementation of a canonical format**. The rule is kept here by
 * measurement rather than by discipline: **the script is executed, and the server's own
 * verifier must accept what it wrote.**
 *
 * ⚠ It runs the **real file**, not a copy of its logic. A test that reimplemented the
 * encoding to compare against would be a third producer and would prove nothing.
 *
 * ⚠ `python3` is a hard requirement of this suite, deliberately un-skipped. A skipped test is
 * exactly the inert test the red-test ledger exists to catch, and the install script cannot
 * work at all on a host without python3 — so a machine that cannot run this cannot deploy.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { DEFAULT_SCRYPT_PARAMS, KEY_BYTES, SALT_BYTES, parseScryptHash, verifyPassword } from './scrypt';

/** The real script, resolved from this file so a move breaks the test rather than the deploy. */
const SCRIPT = fileURLToPath(new URL('../../scripts/hash-password.py', import.meta.url));

interface Run {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const run = (password: string): Run => {
  try {
    const stdout = execFileSync('python3', [SCRIPT], { input: password, encoding: 'utf8' });
    return { status: 0, stdout: stdout.trim(), stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
};

describe('⚠ scripts/hash-password.py — the host-side producer', () => {
  test('⚠ a hash it produced is accepted by this module’s own verifier', async () => {
    const password = 'correct horse battery 9';
    const encoded = run(password).stdout;

    expect(await verifyPassword(password, encoded)).toBe(true);
    // …and it is not accepting everything, which would make the assertion above vacuous.
    expect(await verifyPassword('correct horse battery 8', encoded)).toBe(false);
  });

  /*
   * ⚠ The parameters are the divergence that would NOT show up as a rejected login — a hash
   * with `logN` 14 parses, verifies, and is simply weaker than §5.1 says. So they are read out
   * of the encoded form and compared against this module's constants rather than eyeballed.
   */
  test('⚠ it encodes THIS module’s parameters, not its own', () => {
    const parsed = parseScryptHash(run('parameters 1').stdout);
    expect(parsed).not.toBeNull();
    expect(parsed?.params).toEqual(DEFAULT_SCRYPT_PARAMS);
    expect(parsed?.salt).toHaveLength(SALT_BYTES);
    expect(parsed?.key).toHaveLength(KEY_BYTES);
  });

  test('⚠ every hash has a fresh salt, so two runs of one password differ', () => {
    const first = run('same password 1').stdout;
    const second = run('same password 1').stdout;
    expect(first).not.toBe(second);
    expect(parseScryptHash(first)?.salt).not.toEqual(parseScryptHash(second)?.salt);
  });

  /*
   * §5.1's policy — six characters, at least one letter and at least one digit. Enforced in
   * the script because that is the only moment anyone sees the password; `dashboard.sh check`
   * sees a hash and can never afterwards tell whether the policy was met.
   *
   * ⚠ Both sides of each boundary (HANDOVER §5.1): five characters and six, letters-only and
   * digits-only against a password carrying both.
   */
  test.each([
    ['five characters is one short', 'ab12c', 'at least 6 characters'],
    ['no letter at all', '123456', 'at least one letter'],
    ['no digit at all', 'abcdefgh', 'at least one digit'],
    ['empty', '', 'at least 6 characters'],
  ])('⚠ the policy refuses %s, and says which rule', (_name, password, expected) => {
    const result = run(password);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
    expect(result.stdout).toBe('');
  });

  test('⚠ six characters with a letter and a digit is accepted — the other side of the boundary', () => {
    const result = run('abcde1');
    expect(result.status).toBe(0);
    expect(parseScryptHash(result.stdout)).not.toBeNull();
  });
});
