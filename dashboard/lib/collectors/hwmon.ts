/**
 * Locate an hwmon node **by its `name` file**, and say *why* when it is not found.
 *
 * §3.2 and §3.3 both require this — `coretemp` for the CPU package, `dell_smm` for the
 * fans — and both for the same reason: **`hwmonN` is not stable across boots.** On this box
 * today `coretemp` is `hwmon2` and `dell_smm` is `hwmon3`, with two `nvme` nodes either
 * side; nothing holds them there.
 *
 * ### ⚠ Why this returns a reason and not just a directory
 *
 * HANDOVER: *"make the extracted version return the reason it did not find a node, because
 * O8's probe branches on exactly that."* §3.7's three-valued `pwm5Present` needs to tell
 * three failures apart that all look like "no node":
 *
 * | this returns | `safety.pwm5Present` | because |
 * |---|---|---|
 * | `root-unreadable` | `null` — unknown | `/sys` was not mounted, or is not traversable |
 * | `indeterminate` | `null` — unknown | a node's `name` would not read; it may have been the one |
 * | `absent` | `null` — unknown | every node identified itself and none was `dell_smm` |
 *
 * All three are `null` for `pwm5Present` (§3.7 lists "`/sys` not mounted, no `dell_smm`
 * hwmon, `EACCES`" together), so the *value* does not branch — but the **message** does,
 * and §6.5 exists to put the right one in front of a human. The distinction is also load
 * bearing for the case that is NOT here: `pwm5Present: false` is reached only after this
 * function returns `found`, so "I could not look" can never be reported as "the DKMS
 * 5-fan module did not load".
 *
 * ### The reader
 *
 * {@link HwmonReader} is the two methods of `CollectorIo` this needs, so a caller can pass
 * `nodeIo`, a fake, **or a deadline-wrapped reader** — which is what `cooling.ts` does,
 * because O17 says only `run` is bounded and `dell_smm` reads are SMM BIOS calls.
 *
 * ### Both callers now use it — keep it that way
 *
 * `collectCpuTemp` (§3.2, `coretemp`) and `collectCooling` (§3.3, `dell_smm`) are the two
 * callers. `collectCpuTemp` carried its own copy until step 4's reconciliation adopted this
 * one; {@link describeHwmonMiss} reproduces step 3's three message strings **byte for
 * byte**, which is why the adoption changed no assertion in `collect.test.ts`.
 *
 * ⚠ A third copy is the hazard, not a third caller. If step 5 or 6 needs another node,
 * call this — do not re-walk `/sys/class/hwmon` by hand, and above all do not re-derive the
 * miss reasons, because the value `false` for `pwm5Present` is reachable **only** after
 * this function returns `found`.
 */

import { reason } from './errors';
import { parseText } from './numbers';

/**
 * The file every hwmon node carries its identity in — the whole reason this walk exists,
 * since `hwmonN` is not stable across boots.
 *
 * Exported because `cooling.ts` needs it for a second purpose: having *read* it out of a
 * directory, it can assert the directory's own listing contains it before treating that
 * listing as evidence that some other file is absent.
 */
export const HWMON_NAME_FILE = 'name';

/** The slice of `CollectorIo` an hwmon walk needs. `nodeIo` satisfies it structurally. */
export interface HwmonReader {
  readFile(path: string): Promise<string>;
  readDir(path: string): Promise<string[]>;
}

/** The node was found; `dir` is its full path, ready to have `/fan5_input` appended. */
export interface HwmonNodeFound {
  readonly found: true;
  readonly dir: string;
}

/**
 * The node was not found, and **which of the three ways matters** (see the module doc).
 *
 * `scanned` and `unidentified` are carried rather than pre-formatted so that a caller can
 * count, log or branch on them; {@link describeHwmonMiss} turns them into §6.5's sentence.
 */
export type HwmonNodeMissing =
  | { readonly found: false; readonly why: 'root-unreadable'; readonly error: unknown }
  | { readonly found: false; readonly why: 'absent'; readonly scanned: number }
  | {
      readonly found: false;
      readonly why: 'indeterminate';
      readonly scanned: number;
      /** `hwmon2 (EACCES: permission denied…)` — one per node whose `name` would not read. */
      readonly unidentified: readonly string[];
    };

export type HwmonLookup = HwmonNodeFound | HwmonNodeMissing;

/**
 * Walk `root`, reading each entry's `name`, and return the first node called `name`.
 *
 * ⚠ **"I could not read it" is not "it is not there."** A node whose `name` rejects is
 * skipped — it might be any node — but it is *recorded*, and the walk then reports
 * `indeterminate` rather than asserting absence. §2.2 runs the container non-root, so
 * `EACCES` under `/sys` is the plausible case and not a theoretical one. Step 3 fixed
 * exactly this defect in `collectCpuTemp`; here it is the difference between a SAFETY row
 * reading *unknown* and one alarming that GPU fan control is gone.
 *
 * Nothing throws: every rejection becomes one of the {@link HwmonNodeMissing} shapes.
 */
export const findHwmonNode = async (
  reader: HwmonReader,
  root: string,
  name: string,
): Promise<HwmonLookup> => {
  let entries: string[];
  try {
    entries = await reader.readDir(root);
  } catch (error) {
    return { found: false, why: 'root-unreadable', error };
  }

  /** Nodes that could not be identified — NOT nodes known to be something else. */
  const unidentified: string[] = [];

  for (const entry of entries) {
    const dir = `${root}/${entry}`;
    let read: string | null;
    try {
      read = parseText(await reader.readFile(`${dir}/${HWMON_NAME_FILE}`));
    } catch (e) {
      unidentified.push(`${entry} (${reason(e)})`);
      continue;
    }
    if (read === name) return { found: true, dir };
  }

  return unidentified.length === 0
    ? { found: false, why: 'absent', scanned: entries.length }
    : { found: false, why: 'indeterminate', scanned: entries.length, unidentified };
};

/**
 * §6.5's sentence for a walk that found nothing.
 *
 * ⚠ **The text is step 3's, exactly** — `collectCpuTemp` produces these three strings
 * today and `collect.test.ts` asserts them. Keeping them identical is what makes adopting
 * this module there a no-op rather than a test rewrite.
 */
export const describeHwmonMiss = (miss: HwmonNodeMissing, root: string, name: string): string => {
  switch (miss.why) {
    case 'root-unreadable':
      return `${root}: ${reason(miss.error)}`;
    case 'absent':
      return `no hwmon named \`${name}\` under ${root}`;
    case 'indeterminate':
      return (
        `no hwmon named \`${name}\` under ${root}, and ` +
        `${miss.unidentified.length} of ${miss.scanned} node(s) could not be identified: ` +
        `${miss.unidentified.join(', ')}`
      );
  }
};
