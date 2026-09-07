import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  DEFAULT_SCRYPT_PARAMS,
  KEY_BYTES,
  SALT_BYTES,
  SCRYPT_MAXMEM,
  SCRYPT_TAG,
  exclusively,
  formatScryptHash,
  hashPassword,
  parseScryptHash,
  verifyPassword,
} from './scrypt';

/**
 * §5's "scrypt or argon2id hash", built on Node's own `crypto` and therefore on no
 * dependency at all.
 *
 * Cheap parameters everywhere except the two cases that are *about* the shipped parameters —
 * scrypt at `logN: 15` costs ~60 ms a call and a suite that paid that per case would be a
 * suite nobody runs.
 */

const CHEAP = { logN: 1, r: 1, p: 1 } as const;

const hashOf = (password: string): Promise<string> => hashPassword(password, CHEAP);

describe('the encoded hash (the env-file contract)', () => {
  test('round-trips through format and parse', async () => {
    const encoded = await hashOf('correct horse battery staple');
    const parsed = parseScryptHash(encoded);

    expect(parsed).not.toBeNull();
    expect(parsed?.params).toEqual(CHEAP);
    expect(parsed?.salt).toHaveLength(SALT_BYTES);
    expect(parsed?.key).toHaveLength(KEY_BYTES);
    expect(formatScryptHash(parsed!)).toBe(encoded);
  });

  /*
   * ⚠ The whole reason the PHC string format was not used. `/etc/ai-dashboard.env` is read by
   * Docker's `--env-file` (§2.5), could be read by systemd, and will be *written* by a bash
   * script in step 11 — and a `$` in the value is one `source` away from expanding to
   * nothing. `=` is one `KEY=VALUE` splitter away from truncating.
   *
   * This asserts the alphabet rather than the intent, because the intent is what silently
   * stops being true when someone "standardises" the encoding.
   */
  test('⚠ an encoded hash is safe in every KEY=VALUE grammar this project touches', async () => {
    const encoded = await hashPassword('a password with spaces', DEFAULT_SCRYPT_PARAMS);

    expect(encoded).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(encoded).not.toContain('$');
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain(',');
    expect(encoded).not.toContain(' ');
    expect(encoded.split('\n')).toHaveLength(1);
    expect(encoded.startsWith(`${SCRYPT_TAG}.`)).toBe(true);
  });

  test('the salt is fresh per call, so two hashes of one password differ', async () => {
    const [a, b] = await Promise.all([hashOf('same'), hashOf('same')]);
    expect(a).not.toBe(b);
  });

  test.each([
    ['an empty string', ''],
    ['the tag alone', 'scrypt'],
    ['five fields', 'scrypt.1.1.1.AAAAAAAAAAAAAAAAAAAAAA'],
    ['seven fields', 'scrypt.1.1.1.AAAAAAAAAAAAAAAAAAAAAA.AAAA.AAAA'],
    ['a different algorithm at the right shape', `argon2id.1.1.1.${'A'.repeat(22)}.${'A'.repeat(43)}`],
    ['a PHC-format argon2id hash', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA'],
    ['a non-numeric cost', 'scrypt.x.1.1.AAAAAAAAAAAAAAAAAAAAAA.AAAA'],
    ['a padded cost', 'scrypt.01.1.1.AAAAAAAAAAAAAAAAAAAAAA.AAAA'],
    ['a signed cost', 'scrypt.-1.1.1.AAAAAAAAAAAAAAAAAAAAAA.AAAA'],
    ['a salt outside base64url', 'scrypt.1.1.1.****************scrypt.AAAA'],
  ])('parses %s as null', (_name, encoded) => {
    expect(parseScryptHash(encoded)).toBeNull();
  });

  /*
   * ⚠ Fixture symmetry (HANDOVER §5.1) for the three cost bounds. Each is fixtured on both
   * sides, because a guard tested from one side proves only that *a* comparison exists —
   * step 3's `nvidia-smi` column check was mutated from `!==` to `<` and passed 807 tests.
   *
   * The bound is a denial-of-service guard, not a strength grade: `logN: 30` asks OpenSSL
   * for 8 GiB.
   */
  test.each([
    ['logN', 0, 1, 20, 21],
    ['r', 0, 1, 32, 33],
    ['p', 0, 1, 16, 17],
  ])('⚠ the cost is bounded on both sides — %s', (field, belowMin, min, max, aboveMax) => {
    const costs = { logN: 4, r: 8, p: 1 };
    const encode = (c: typeof costs): string =>
      formatScryptHash({
        params: c,
        salt: Buffer.alloc(SALT_BYTES),
        key: Buffer.alloc(KEY_BYTES),
      });

    expect(parseScryptHash(encode({ ...costs, [field]: belowMin }))).toBeNull();
    expect(parseScryptHash(encode({ ...costs, [field]: min }))).not.toBeNull();
    expect(parseScryptHash(encode({ ...costs, [field]: max }))).not.toBeNull();
    expect(parseScryptHash(encode({ ...costs, [field]: aboveMax }))).toBeNull();
  });

  /*
   * ⚠ `Buffer.from(s, 'base64url')` is **lenient** — it drops characters outside the alphabet
   * instead of failing — so a length check alone would accept `AAAA!AAAA…`. The canonical
   * re-encode is what closes it, and this fixtures both sides of the salt's length.
   */
  test('⚠ a salt of the wrong decoded length is rejected on both sides of 16 bytes', () => {
    const key = Buffer.alloc(KEY_BYTES).toString('base64url');
    const withSalt = (bytes: number): string =>
      `scrypt.4.8.1.${Buffer.alloc(bytes).toString('base64url')}.${key}`;

    expect(parseScryptHash(withSalt(SALT_BYTES - 1))).toBeNull();
    expect(parseScryptHash(withSalt(SALT_BYTES))).not.toBeNull();
    expect(parseScryptHash(withSalt(SALT_BYTES + 1))).toBeNull();
  });

  test('⚠ a non-canonical base64url field is rejected even when it decodes to the right length', () => {
    const salt = Buffer.alloc(SALT_BYTES).toString('base64url');
    const key = Buffer.alloc(KEY_BYTES).toString('base64url');

    // ⚠ The case the re-encode exists for, and the only one that reaches it. 16 bytes is 22
    // base64url characters, whose last character carries **four unused bits** — so
    // `AAAAAAAAAAAAAAAAAAAAAB` decodes to the same sixteen zero bytes as
    // `AAAAAAAAAAAAAAAAAAAAAA`, at the right length, through the right alphabet. Measured on
    // Node 24: it re-encodes to the `…AA` form, which is how it is caught.
    const nonCanonicalSalt = `${'A'.repeat(SALT_BYTES === 16 ? 21 : 0)}B`;
    expect(Buffer.from(nonCanonicalSalt, 'base64url')).toHaveLength(SALT_BYTES);
    expect(parseScryptHash(`scrypt.4.8.1.${nonCanonicalSalt}.${key}`)).toBeNull();

    // And the two cheaper cases: padding is not base64url, and trailing junk changes the
    // decoded length.
    expect(parseScryptHash(`scrypt.4.8.1.${salt}=.${key}`)).toBeNull();
    expect(parseScryptHash(`scrypt.4.8.1.${salt}.${key}A`)).toBeNull();
  });
});

describe('verification', () => {
  test('accepts the password it was given, and nothing else', async () => {
    const encoded = await hashOf('hunter2');

    expect(await verifyPassword('hunter2', encoded)).toBe(true);
    expect(await verifyPassword('hunter3', encoded)).toBe(false);
    expect(await verifyPassword('hunter2 ', encoded)).toBe(false);
    expect(await verifyPassword('', encoded)).toBe(false);
  });

  /*
   * ⚠ §5's parameters, exercised once at full cost so that the shipped `logN: 15` is proved
   * to work rather than assumed. Node's **default** `maxmem` is 32 MiB and `128 · 2^15 · 8`
   * is 32 MiB exactly — measured on Node 24, that combination throws
   * `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` **synchronously**, which is why `SCRYPT_MAXMEM` is
   * passed explicitly. Without it every login on the box would be a 500.
   */
  test('⚠ the shipped parameters verify, and their memory ceiling is above what they need', async () => {
    const encoded = await hashPassword('shipped', DEFAULT_SCRYPT_PARAMS);

    expect(parseScryptHash(encoded)?.params).toEqual(DEFAULT_SCRYPT_PARAMS);
    expect(await verifyPassword('shipped', encoded)).toBe(true);
    expect(128 * 2 ** DEFAULT_SCRYPT_PARAMS.logN * DEFAULT_SCRYPT_PARAMS.r).toBeLessThan(
      SCRYPT_MAXMEM,
    );
  });

  /*
   * ⚠ §5: "any error raised while deciding — is **401**, never 500." This function is the
   * first place that promise has to hold, and the inputs below are the ordinary ways it is
   * tested: an operator who put an argon2id hash in the file, a truncated line, and a hash
   * whose costs OpenSSL will refuse.
   *
   * `expect(...).resolves` rather than a try/catch, so a throw fails the test rather than
   * being caught by it.
   */
  test.each([
    ['an empty hash', ''],
    ['an argon2id hash', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA'],
    ['a truncated line', 'scrypt.15.8.1.AAAA'],
    ['a hash with impossible costs', `scrypt.30.32.16.${'A'.repeat(22)}.${'A'.repeat(43)}`],
    ['a hash of only separators', '.....'],
  ])('⚠ verification of %s resolves false rather than throwing', async (_name, encoded) => {
    await expect(verifyPassword('anything', encoded)).resolves.toBe(false);
  });

  test('a very long password is answered rather than refused', async () => {
    const long = 'x'.repeat(100_000);
    const encoded = await hashPassword(long, CHEAP);

    expect(await verifyPassword(long, encoded)).toBe(true);
    expect(await verifyPassword(`${long}y`, encoded)).toBe(false);
  });

  /*
   * ⚠ The comparison is `timingSafeEqual` over the derived keys, not `===` over the encoded
   * strings and not a loop that stops at the first differing byte. A source assertion, and
   * an honest one: a timing measurement on a 60 ms KDF cannot distinguish the two
   * implementations, so there is no behavioural test that could carry this — which is exactly
   * why it is worth pinning in the one way that can.
   */
  test('⚠ the derived keys are compared in constant time', () => {
    const source = readSource();

    expect(source).toContain('timingSafeEqual(derived, stored.key)');
    // No hand-rolled comparison of the secret material anywhere in the module.
    expect(source).not.toMatch(/derived\s*===\s*stored/);
    expect(source).not.toMatch(/\.equals\(/);
  });
});

describe('the serialiser that keeps scrypt off libuv’s thread pool', () => {
  /*
   * ⚠ HANDOVER's rule for a guard over shared state: "pair it with a behavioural test."
   *
   * `crypto.scrypt` runs on the same libuv pool as every `readFile`, `readdir` and `statfs`
   * in this process, and §4 spends four paragraphs on what happens when that pool saturates —
   * measured: four concurrently blocked operations block **every** subsequent read
   * indefinitely. A login flood would otherwise cost one worker and 32 MiB per attempt.
   *
   * The property is observed rather than asserted about the source: three jobs are started at
   * once and each records the depth it saw on entry. Any overlap makes `peak` exceed 1.
   */
  test('⚠ at most one wrapped operation is outstanding at a time', async () => {
    const runExclusively = exclusively();
    let running = 0;
    let peak = 0;

    const job = (ms: number) => async (): Promise<number> => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return ms;
    };

    const results = await Promise.all([
      runExclusively(job(6)),
      runExclusively(job(1)),
      runExclusively(job(3)),
    ]);

    expect(results).toEqual([6, 1, 3]);
    expect(peak).toBe(1);
  });

  test('⚠ a rejected job does not poison the queue behind it', async () => {
    const runExclusively = exclusively();

    const failed = runExclusively(async () => Promise.reject(new Error('boom')));
    await expect(failed).rejects.toThrow('boom');
    await expect(runExclusively(async () => 'after')).resolves.toBe('after');
  });

  test('each call to the factory has its own queue', async () => {
    const first = exclusively();
    const second = exclusively();
    let concurrent = 0;
    let peak = 0;

    const job = async (): Promise<void> => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 4));
      concurrent -= 1;
    };

    await Promise.all([first(job), second(job)]);
    expect(peak).toBe(2);
  });

  test('the KDF itself is serialised, not merely serialisable', async () => {
    // Two real verifications started together. If `deriveKey` did not go through the
    // module's own slot they would overlap; the observable here is only that both answer,
    // because overlap inside `node:crypto` is not visible from JavaScript. The source
    // assertion below is what pins the wiring.
    const encoded = await hashOf('parallel');
    const [a, b] = await Promise.all([
      verifyPassword('parallel', encoded),
      verifyPassword('wrong', encoded),
    ]);

    expect([a, b]).toEqual([true, false]);
    expect(readSource()).toContain('oneHashAtATime(');
  });
});

describe('hashing for the env file', () => {
  test('a fresh hash verifies with the password it was made from', async () => {
    const password = randomBytes(12).toString('base64url');
    expect(await verifyPassword(password, await hashOf(password))).toBe(true);
  });

  test('parameters OpenSSL refuses are a throw here, not a silently weak hash', async () => {
    await expect(hashPassword('x', { logN: 20, r: 32, p: 16 })).rejects.toThrow(/parameters/);
  });
});

/** The module's own text — used only by the two structural assertions above. */
function readSource(): string {
  return readFileSync(new URL('scrypt.ts', import.meta.url), 'utf8');
}
