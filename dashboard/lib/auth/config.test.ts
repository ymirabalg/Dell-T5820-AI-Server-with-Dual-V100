import { describe, expect, test } from 'vitest';

import {
  MIN_SESSION_SECRET_CHARS,
  PASSWORD_HASH_KEY,
  SESSION_SECRET_KEY,
  STANDING_KEY,
  readAuthConfig,
  readStandingList,
} from './config';

/**
 * §5.1's env-file contract, as this build reads it: two keys out of `process.env`, and a
 * `null` for anything that is not usable.
 */

const SECRET = 'k'.repeat(MIN_SESSION_SECRET_CHARS);
const HASH = 'scrypt.15.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('reading the credentials', () => {
  test('both keys present is a config', () => {
    expect(readAuthConfig({ [PASSWORD_HASH_KEY]: HASH, [SESSION_SECRET_KEY]: SECRET })).toEqual({
      passwordHash: HASH,
      sessionSecret: SECRET,
    });
  });

  test('surrounding whitespace is trimmed, because an env file collects it', () => {
    const config = readAuthConfig({
      [PASSWORD_HASH_KEY]: `  ${HASH}  `,
      [SESSION_SECRET_KEY]: `\t${SECRET}\n`,
    });
    expect(config).toEqual({ passwordHash: HASH, sessionSecret: SECRET });
  });

  /*
   * ⚠ Deny-by-default, in the shape it now takes. Step 6 shipped a constant `false`; step 7
   * deleted it, and this is the property that replaced it — an unconfigured container refuses
   * every request rather than serving telemetry to the LAN.
   *
   * The failure is a dashboard that will not open: loud, immediate, harmless. The other
   * direction is `serve-llm.sh` writing a ufw rule into a firewall that was never enabled.
   */
  test.each([
    ['nothing at all', {}],
    ['only a hash', { [PASSWORD_HASH_KEY]: HASH }],
    ['only a secret', { [SESSION_SECRET_KEY]: SECRET }],
    ['an empty hash', { [PASSWORD_HASH_KEY]: '', [SESSION_SECRET_KEY]: SECRET }],
    ['a whitespace hash', { [PASSWORD_HASH_KEY]: '   ', [SESSION_SECRET_KEY]: SECRET }],
    ['an empty secret', { [PASSWORD_HASH_KEY]: HASH, [SESSION_SECRET_KEY]: '' }],
  ])('⚠ the credentials read as null, so nothing downstream is authorised — %s', (_name, env) => {
    expect(readAuthConfig(env)).toBeNull();
  });

  /*
   * ⚠ Fixture symmetry on the one length bound in this module (HANDOVER §5.1): one case each
   * side of {@link MIN_SESSION_SECRET_CHARS}, because a guard tested from one side proves
   * only that *a* comparison exists.
   *
   * The floor is well below what §5.1's install script produces — 32 random bytes is 43
   * base64url characters — so it exists to refuse a hand-written secret, not to grade a
   * generated one. §5's whole unforgeability claim rests on the HMAC key.
   */
  test('⚠ a secret shorter than the floor is refused, and one exactly at it is accepted', () => {
    const short = 'k'.repeat(MIN_SESSION_SECRET_CHARS - 1);
    const exact = 'k'.repeat(MIN_SESSION_SECRET_CHARS);

    expect(readAuthConfig({ [PASSWORD_HASH_KEY]: HASH, [SESSION_SECRET_KEY]: short })).toBeNull();
    expect(readAuthConfig({ [PASSWORD_HASH_KEY]: HASH, [SESSION_SECRET_KEY]: exact })).not.toBeNull();
  });

  test('⚠ the two key names are the ones §5.1 fixes', () => {
    expect(PASSWORD_HASH_KEY).toBe('PASSWORD_HASH');
    expect(SESSION_SECRET_KEY).toBe('SESSION_SECRET');
  });

  /*
   * §5.1 lists three keys, and `STANDING` is §6.4's. It is read by {@link readStandingList},
   * never by the credential reader — two mechanisms sharing a file is not two mechanisms
   * sharing an opinion.
   */
  test('STANDING is not part of the credentials', () => {
    const config = readAuthConfig({
      [PASSWORD_HASH_KEY]: HASH,
      [SESSION_SECRET_KEY]: SECRET,
      [STANDING_KEY]: 'fan5_engaged',
    });
    expect(config === null ? [] : Object.keys(config).sort()).toEqual([
      'passwordHash',
      'sessionSecret',
    ]);
  });
});

describe('⚠ §4’s `standing`: split on the separator, and judged nowhere near here', () => {
  test('the entry §6.4 names', () => {
    expect(readStandingList({ [STANDING_KEY]: 'ufw_enforcing' })).toEqual(['ufw_enforcing']);
  });

  test('a comma-separated list — §6.4’s own grammar, and the whole of the server’s role', () => {
    expect(readStandingList({ [STANDING_KEY]: 'ufw_enforcing,unit:llama-server@1.service' })).toEqual(
      ['ufw_enforcing', 'unit:llama-server@1.service'],
    );
  });

  /*
   * ⚠ §4: "echoed verbatim and never parsed server-side". Every entry below is one an operator
   * could plausibly type and one the *client* must be able to report as unknown — a subject on
   * a singleton kind, a bare `unit`, an empty subject, whitespace an env file collected. A
   * server that trimmed or filtered would turn §6.4's "reported as unknown" into silence, and
   * the mechanism whose whole job is suppressing alarms would fail quietly. That is the
   * `ufw is-active` shape: the config looks applied and is not.
   */
  test('⚠ nothing is trimmed, filtered, validated or deduplicated', () => {
    const raw = 'ufw_enforcing, ufw_enforcing:yes ,unit,gpu_temp:,gpu_fan_speed,ufw_enforcing';
    expect(readStandingList({ [STANDING_KEY]: raw })).toEqual([
      'ufw_enforcing',
      ' ufw_enforcing:yes ',
      'unit',
      'gpu_temp:',
      'gpu_fan_speed',
      'ufw_enforcing',
    ]);
  });

  /*
   * ⚠ §4: "Unset `STANDING` sends `[]` — the safe direction, since a missing list can only make
   * the dashboard **louder**." `''.split(',')` is `['']`, which is not an entry an operator
   * wrote; it is the absence of the key spelled differently.
   */
  test.each([
    ['unset', undefined],
    ['empty', ''],
  ])('⚠ %s means nothing is standing, never an empty id', (_name, value) => {
    const env = value === undefined ? {} : { [STANDING_KEY]: value };
    expect(readStandingList(env)).toEqual([]);
  });

  test('the key is exactly §5.1’s', () => {
    expect(STANDING_KEY).toBe('STANDING');
  });
});
