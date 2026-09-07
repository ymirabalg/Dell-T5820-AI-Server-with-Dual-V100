/**
 * §3.6's two file-based safety checks, pure.
 *
 * Both are three-valued and both have the same shape as §3.7's `pwm5Present`, which is the
 * archetype this project keeps getting wrong:
 *
 * > `null` is **unknown**, and it is never the alarm.
 *
 * §6.3 gives `ufwEnforcing` and `dkmsForRunningKernel` a row each that puts `null` in the
 * **watch** column, so an unreadable check is a visible "could not check" rather than a
 * blank — and `severityUfw`/`severityDkms` are total for exactly that reason.
 *
 * No IO. `safety.ts` reads the bytes and tags `ufw` or `dkms` (§3.7).
 */

import { lines, parseText } from './numbers';
import { clean } from './result';
import type { ParseResult } from './result';

/** The assignment `ufw_enforcing()` in `serve-llm.sh` already greps for. */
export const UFW_ENABLED_KEY = 'ENABLED';

/**
 * §3.6's DKMS check: *"presence of `updates/dkms/dell-smm-hwmon.ko*` for the running
 * kernel"*. A prefix, because the module ships compressed — `dell-smm-hwmon.ko.zst` on this
 * box — and a future kernel could stop compressing it.
 */
export const DKMS_MODULE_PREFIX = 'dell-smm-hwmon.ko';

/** The subdirectory of `/lib/modules/<release>/` that DKMS installs into. */
export const DKMS_SUBPATH = 'updates/dkms';

/**
 * `/etc/ufw/ufw.conf` → is ufw enforcing?
 *
 * ⚠ **`ufw.conf` and not `systemctl is-active ufw`** — §2.2 chose the file, and the repo's
 * `CLAUDE.md` records why in full: `ufw.service` is a oneshot that reports
 * `active (exited)` whether or not it applied any rules, so `is-active` was green on a
 * firewall that had `ENABLED=no` and had never loaded a rule. Both inference endpoints sat
 * open to anything routable for a week behind that green light. This dashboard exists in
 * part to make that visible, so it must not re-import the check that hid it.
 *
 * ⚠ **Absent is not disabled.** A file that is missing, unreadable, or has no `ENABLED=`
 * line is `null` — *watch* — because "I could not read the firewall config" is not evidence
 * about the firewall in either direction.
 *
 * The **last** assignment wins, matching `serve-llm.sh`'s own non-root check
 * (`sed -n 's/^ENABLED=//p' | tail -1`). `yes`/`no` are matched case-insensitively; any
 * other value is `null` with a problem, which is the conservative direction — an
 * unrecognised value cannot mint the `false` that §6.3 bands as an alarm.
 *
 * ### ⚠ The grammar accepted is **the exact form `ufw` itself writes**, and nothing else
 *
 * This doc used to claim the shell reading — *"`ufw` sources this file as shell"* — while
 * implementing a stricter subset, which is the same "names a property it does not check"
 * defect one layer up, in a comment. Measured, the four forms shell honours and this
 * function does **not**: `ENABLED="no"`, `ENABLED='no'`, `ENABLED=no # off for now`, and
 * `export ENABLED=no`. Each reads `null`, so §6.3's ufw **alarm quietly does not fire** on a
 * firewall that is demonstrably off.
 *
 * The direction is safe — every miss lands on *watch*, never on a false alarm — and the
 * behaviour is deliberately kept rather than widened, for two reasons. `ufw` writes this
 * file itself, unquoted and uncommented, so the missed forms are hand edits; and the
 * lenient `KEY=VALUE` grammar in `llama.ts` is systemd's `EnvironmentFile`, which has
 * neither `export` nor trailing comments. **They are different languages and must not share
 * a parser.** `UFW_CONF_QUOTED_NO` is fixtured so the limit is a tested fact rather than a
 * claim.
 */
export const parseUfwConf = (text: string): ParseResult<boolean | null> => {
  let raw: string | null = null;
  for (const line of lines(text)) {
    const trimmed = line.trim();
    // The `#` test is belt-and-braces: the exact-key test below already excludes a
    // commented line, since `#ENABLED=yes` does not start with `ENABLED=`. It is kept
    // because it states the intent at the point a future edit would loosen the key match.
    if (trimmed.startsWith('#')) continue;
    if (!trimmed.startsWith(`${UFW_ENABLED_KEY}=`)) continue;
    raw = parseText(trimmed.slice(UFW_ENABLED_KEY.length + 1));
  }
  if (raw === null) return { value: null, problems: [`no \`${UFW_ENABLED_KEY}=\` assignment`] };
  const said = raw.toLowerCase();
  if (said === 'yes') return clean<boolean | null>(true);
  if (said === 'no') return clean<boolean | null>(false);
  return { value: null, problems: [`\`${UFW_ENABLED_KEY}=${raw}\` is neither \`yes\` nor \`no\``] };
};

/**
 * A listing of `<release>/updates/dkms/` → is the patched module built for this kernel?
 *
 * ⚠ **The listing is the oracle, exactly as it is for `pwm5`** (§3.7, step 4). This
 * function is only reached when that directory listed successfully; a directory that could
 * not be listed is `null` at the wrapper and never arrives here, so this function has no
 * `null` to return and is deliberately total over the evidence it is given.
 *
 * `false` here is §3.6's alarm: *"next boot loses `pwm5`"* — the documented kernel-upgrade
 * failure that a pre-emptive `dkms install -k <NEW-KVER>` exists to prevent, and which the
 * 2026-09-04 reboot onto 7.0.0-30 would otherwise have hit.
 */
export const dkmsPresentFrom = (entries: readonly string[]): boolean =>
  entries.some((entry) => entry.startsWith(DKMS_MODULE_PREFIX));
