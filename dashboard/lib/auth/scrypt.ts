/**
 * §5's password hash — **scrypt**, from Node's own `crypto`, with **no dependency at all**.
 *
 * > §5: "Password supplied at deploy time as a **scrypt or argon2id hash** in an env file."
 *
 * ---
 *
 * ### ⚠ Why scrypt and not argon2id — the choice §5 offers, made once, here
 *
 * §5 accepts either. §5.1 says `dashboard.sh set-password` "hashes with argon2id", so the
 * choice is not free: **the script and the verifier must agree**, and step 11 inherits this
 * decision (see this step's notes, obligation O20). The reasons, in the order that decided
 * it:
 *
 * 1. **argon2id would be this project's first dependency and its only native/ABI surface.**
 *    `NODE_MODULE_VERSION` is 137 on Node 24 and different on 26; a binary resolved on the
 *    developer's Mac is not the one that runs in `node:24-slim`. Steps 1–6 added **zero**
 *    dependencies — step 5 hand-wrote a 509-line D-Bus codec rather than take one.
 * 2. **`crypto.scrypt` is in Node 24.** Nothing for step 11's Dockerfile to compile, no
 *    prebuild to resolve, no `linux-x64-gnu` artefact that must be in the lockfile before
 *    step 12's `pnpm install --frozen-lockfile` runs on the box.
 * 3. **scrypt is memory-hard and standardised** (RFC 7914) and is named by §5 itself. At the
 *    parameters below it costs 32 MiB and ~60 ms on this Mac (measured), which is the right
 *    order for one shared password behind a 5-per-minute rate limit.
 *
 * What argon2id would have bought: a better side-channel story on shared hardware and finer
 * control of the time/memory trade-off. Neither is worth an ABI on a single-tenant LAN box.
 *
 * ### ⚠ The encoding is deliberately NOT the PHC string format
 *
 * PHC would write `$scrypt$ln=15,r=8,p=1$<salt>$<hash>`. Three characters in that string are
 * hazards in the exact places this value has to survive:
 *
 * | character | what it breaks |
 * |---|---|
 * | `$` | a `dashboard.sh` that ever *sources* `/etc/ai-dashboard.env` expands `$scrypt` to the empty string, silently |
 * | `=` | a `KEY=VALUE` reader that splits on **every** `=` rather than the first |
 * | `,` | nothing here, but it is one more thing a hand-rolled parser can disagree about |
 *
 * This repo's history is exactly that class of bug — `is-active` green on a disabled ufw,
 * `StartLimit*` silently ignored in `[Service]`, `${PORT_BASE}%i` concatenating to `80800`.
 * Nothing outside this project ever reads this hash, so interoperability buys nothing and
 * the safe alphabet buys a whole category of silence. The format is therefore
 *
 * ```
 * scrypt.<log2N>.<r>.<p>.<salt-base64url>.<key-base64url>
 * ```
 *
 * — six dot-separated fields over `[A-Za-z0-9._-]`, which is safe in Docker's `--env-file`
 * grammar, in systemd's `EnvironmentFile`, in a shell-sourced file, and in `ps`.
 *
 * ### ⚠ `crypto.scrypt` throws SYNCHRONOUSLY on bad parameters
 *
 * Measured on Node 24: `scrypt(pw, salt, 32, { N: 32768, r: 8, p: 1 })` with the **default**
 * `maxmem` throws `RangeError: Invalid scrypt params … memory limit exceeded` from the call
 * itself, not through the callback. Two consequences, both load-bearing:
 *
 * 1. {@link SCRYPT_MAXMEM} is passed explicitly. The default is 32 MiB and `128·N·r` at
 *    these parameters is 32 MiB exactly, which does not fit under it.
 * 2. The call is wrapped in `try`/`catch` **and** the parameters read out of the env file
 *    are range-checked first. A `PASSWORD_HASH` carrying `ln=30` would otherwise throw
 *    synchronously inside the login route — and §5 says every failure to reach a verdict is
 *    a denial, never a 500.
 *
 * ### ⚠ One hash at a time, project-wide
 *
 * `crypto.scrypt` runs on **libuv's thread pool** — the same pool §4 spends four paragraphs
 * protecting, because `readFile`, `readdir` and `statfs` run there too and four concurrently
 * blocked operations block every subsequent read in the process indefinitely. A login flood
 * would otherwise put 32 MiB and one worker per attempt against a telemetry poll that needs
 * nine concurrent `/proc` reads. {@link exclusively} serialises them: at most one scrypt is
 * ever outstanding, so the KDF costs the pool exactly one worker no matter what arrives.
 *
 * The rate limiter is the first line and runs **before** any hashing. It is also, since §5
 * made the limit **global**, a real bound on the number of *queued* hashes — five — rather
 * than a bound on the number of distinct keys a caller cares to invent. This serialiser is
 * the second line and remains worth having: it bounds the pool cost of those five to one
 * worker, and it is what would still hold if the limit ever moved. See `rate-limit.ts`.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { decodeExact } from './base64url';

/** The tag every encoded hash starts with. Also what tells a scrypt hash from an argon2id one. */
export const SCRYPT_TAG = 'scrypt';

/** scrypt's cost parameters, as they appear in the encoded hash. */
export interface ScryptParams {
  /** log2 of the CPU/memory cost `N`. `128 · 2^logN · r` bytes are allocated. */
  readonly logN: number;
  /** Block size. */
  readonly r: number;
  /** Parallelisation. */
  readonly p: number;
}

/**
 * What {@link hashPassword} writes: **N = 2^15, r = 8, p = 1** — 32 MiB and ~60 ms on this
 * Mac, measured; expect ~2-3× that on the box's Xeon W-2135, which is still well inside a
 * login's budget at 5 attempts a minute.
 *
 * ⚠ Verification does **not** use these. It uses whatever the stored hash carries, so an
 * older hash keeps working when this constant moves.
 */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { logN: 15, r: 8, p: 1 };

/** Derived-key length, in bytes. */
export const KEY_BYTES = 32;

/** Salt length, in bytes. */
export const SALT_BYTES = 16;

/**
 * The memory ceiling handed to OpenSSL, in bytes.
 *
 * ⚠ Not a tuning knob and not decoration: at {@link DEFAULT_SCRYPT_PARAMS} the allocation is
 * `128 · 2^15 · 8` = 32 MiB, and Node's **default** `maxmem` is 32 MiB, under which the call
 * throws synchronously. 64 MiB leaves headroom for one step up in `logN` without a second
 * edit, and is still bounded because {@link exclusively} allows one hash at a time.
 */
export const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/**
 * Bounds on the parameters read out of `/etc/ai-dashboard.env`.
 *
 * ⚠ These are a **denial-of-service** guard, not a strength guard. The operator writes that
 * file, so a weak `logN` is their business; a typo'd `logN` of 30 would ask OpenSSL for
 * 8 GiB, and the honest answer to that is "this hash is not usable", not an allocation.
 */
const LIMITS = { logN: { min: 1, max: 20 }, r: { min: 1, max: 32 }, p: { min: 1, max: 16 } };

/** A parsed {@link SCRYPT_TAG} hash. */
export interface ScryptHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly key: Buffer;
}

/** A decimal integer with no sign, no padding and no surprises. `Number()` accepts far more. */
const decimal = (field: string, { min, max }: { min: number; max: number }): number | null => {
  if (!/^(?:0|[1-9][0-9]*)$/.test(field)) return null;
  const value = Number(field);
  return value >= min && value <= max ? value : null;
};

/**
 * Parse an encoded hash. **Returns `null` rather than throwing, for every input.**
 *
 * That includes an argon2id hash, which parses as `null` here — §5 allows either algorithm
 * and this build implements one, so an argon2id `PASSWORD_HASH` denies every login rather
 * than being silently mis-verified. See the module doc and step 7's notes.
 */
export const parseScryptHash = (encoded: string): ScryptHash | null => {
  const fields = encoded.split('.');
  if (fields.length !== 6) return null;

  const [tag, logNField, rField, pField, saltField, keyField] = fields as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (tag !== SCRYPT_TAG) return null;

  const logN = decimal(logNField, LIMITS.logN);
  const r = decimal(rField, LIMITS.r);
  const p = decimal(pField, LIMITS.p);
  if (logN === null || r === null || p === null) return null;

  const salt = decodeExact(saltField, SALT_BYTES);
  const key = decodeExact(keyField, KEY_BYTES);
  if (salt === null || key === null) return null;

  return { params: { logN, r, p }, salt, key };
};

/** The inverse of {@link parseScryptHash}. */
export const formatScryptHash = (hash: ScryptHash): string =>
  [
    SCRYPT_TAG,
    hash.params.logN,
    hash.params.r,
    hash.params.p,
    hash.salt.toString('base64url'),
    hash.key.toString('base64url'),
  ].join('.');

/**
 * A serialiser: at most one of the wrapped operations is outstanding at any moment.
 *
 * ⚠ Returned by a **factory** rather than being a module-level singleton, so a test can
 * observe the property directly (HANDOVER: "guards over globals are not soundly fixable by
 * text — pair one with a behavioural test"). The module's own instance is
 * {@link oneHashAtATime}.
 *
 * The queue holds promises, not work: a rejected job must not poison the chain, so the tail
 * is always a settled-either-way promise.
 */
export const exclusively = (): (<T>(work: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(work: () => Promise<T>): Promise<T> => {
    const started = tail.then(work);
    // ⚠ The tail is normalised to a **settled-either-way** promise. Without it a rejected job
    // leaves `tail` rejected, `tail.then(work)` never calls `work`, and every login after the
    // first failure hangs for ever — the queue poisoned by one bad hash.
    tail = started.then(
      () => undefined,
      () => undefined,
    );
    return started;
  };
};

/** The project's single scrypt slot — see the module doc's thread-pool note. */
const oneHashAtATime = exclusively();

/**
 * Derive a key. Resolves `null` for any parameter set OpenSSL will not accept, so the
 * caller never has to distinguish a rejection from a mismatch.
 */
const deriveKey = (
  password: string,
  salt: Buffer,
  params: ScryptParams,
  keyBytes: number,
): Promise<Buffer | null> =>
  oneHashAtATime(
    () =>
      new Promise<Buffer | null>((resolve) => {
        try {
          scrypt(
            password,
            salt,
            keyBytes,
            { N: 2 ** params.logN, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
            (error, derived) => {
              resolve(error ? null : derived);
            },
          );
        } catch {
          // ⚠ Synchronous, and measured — see the module doc. Deliberately swallowed: §5
          // makes every failure to reach a verdict a denial.
          resolve(null);
        }
      }),
  );

/**
 * Hash a password for `/etc/ai-dashboard.env`.
 *
 * ⚠ Nothing in the running server calls this — it is the **producer** half of the env-file
 * contract, kept beside the verifier so the two cannot drift, and it is what step 11's
 * `dashboard.sh set-password` invokes (§5.1: it *prompts*; the password is never an
 * argument, for the same reason `llama-server` takes `--api-key-file` and not `--api-key`).
 */
export const hashPassword = async (
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> => {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, params, KEY_BYTES);
  if (key === null) throw new Error('scrypt refused these parameters');
  return formatScryptHash({ params, salt, key });
};

/**
 * Is `password` the one behind `encoded`?
 *
 * ⚠ **Constant-time**, via `timingSafeEqual` over the two derived keys. A byte-by-byte
 * comparison — or `===` on the encoded strings — leaks the length of the matching prefix,
 * which is the classic defect in exactly this function.
 *
 * ⚠ **Never throws, for any input.** An unparseable hash, an argon2id hash, a hash whose
 * parameters OpenSSL refuses, and a password of any length all resolve `false`.
 */
export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => {
  const stored = parseScryptHash(encoded);
  if (stored === null) return false;

  const derived = await deriveKey(password, stored.salt, stored.params, stored.key.length);
  if (derived === null) return false;

  // `timingSafeEqual` throws on a length mismatch, so the lengths are compared first. They
  // cannot differ here — `deriveKey` was asked for `stored.key.length` bytes — but the guard
  // is what makes that a fact rather than an assumption.
  return derived.length === stored.key.length && timingSafeEqual(derived, stored.key);
};
