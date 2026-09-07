/**
 * **One** canonical base64url decoder, shared by everything in `lib/auth/` that reads a
 * field somebody else encoded.
 *
 * ---
 *
 * ### ⚠ Why this is a module rather than two private helpers
 *
 * It was two. `scrypt.ts` decoded its salt and key with the alphabet, the decoded length
 * **and** a re-encode compared byte for byte; `session.ts` decoded the signature with the
 * first two and not the third. Two modules in one directory disagreeing about what
 * "canonical base64url" means is the wart step 7's review named, and the divergence had a
 * measurable cost: 1 token in 16 had three alternate spellings that the verifier accepted
 * and one of its own tests then failed on (see `session.test.ts`). One definition is the
 * only shape in which that cannot recur in a third place — the same family as HANDOVER's
 * *"a second `errnoCodeOf`"* prohibition.
 *
 * ### ⚠ `Buffer.from(s, 'base64url')` is lenient, and that is the whole reason for this
 *
 * It **skips** characters outside the alphabet rather than failing, so
 * `Buffer.from('!!!!', 'base64url')` is an empty buffer and not an error. And even inside
 * the alphabet the encoding is not injective: an encoded field whose length is not a
 * multiple of 4 ends on a character carrying **unused low bits**, so several spellings
 * decode to the identical bytes. 32 bytes is 43 characters, of which the last carries 6 bits
 * with only 4 significant — four spellings per tag. 16 bytes is 22 characters, of which the
 * last carries 4 significant bits.
 *
 * Three checks close both holes, and none of them is redundant:
 *
 * | check | what it catches |
 * |---|---|
 * | the alphabet | `!`, `=`, `+`, `/`, whitespace — the lenient skip |
 * | the decoded length | a truncated or extended field that is still in the alphabet |
 * | the re-encode | a **non-canonical spelling** of exactly the right bytes |
 *
 * ⚠ The third is not defence in depth over the first two: it is the only one that sees a
 * field of the right length, in the right alphabet, decoding to the right bytes, spelled a
 * way this project never writes.
 */

/** base64url's alphabet, unpadded. Anything else is not something we wrote. */
export const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Decode one base64url field to exactly `expectedBytes` bytes, **canonically** — or `null`.
 *
 * ⚠ Total: every input maps to a `Buffer` or to `null`, and none of them raises. That is what
 * lets `verifySessionToken` and `parseScryptHash` be total in turn, which is what makes §5's
 * 401 a decision rather than a caught throw.
 */
export const decodeExact = (field: string, expectedBytes: number): Buffer | null => {
  if (!BASE64URL.test(field)) return null;
  const decoded = Buffer.from(field, 'base64url');
  if (decoded.length !== expectedBytes) return null;
  if (decoded.toString('base64url') !== field) return null;
  return decoded;
};
