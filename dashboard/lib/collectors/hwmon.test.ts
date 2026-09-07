/**
 * The hwmon node walk — §3.2's and §3.3's "found by `name`, never by a fixed `hwmonN`
 * index", and the three ways it can fail to find one.
 *
 * The reader is a fake, so nothing here needs `/sys`. What matters is that the walk
 * returns **why** it did not find a node: §3.7's `pwm5Present` is `null` (*unknown*) for
 * every one of these, and `false` (*the alarm*) for none of them.
 */

import { describe, expect, test } from 'vitest';

import { describeHwmonMiss, findHwmonNode } from './hwmon';
import type { HwmonReader } from './hwmon';

const ROOT = '/sys/class/hwmon';

/** The box's own enumeration: two nvme, coretemp in the middle, dell_smm last. */
const REAL_NODES: Readonly<Record<string, string>> = {
  hwmon0: 'nvme\n',
  hwmon1: 'nvme\n',
  hwmon2: 'coretemp\n',
  hwmon3: 'dell_smm\n',
};

interface FakeOptions {
  readonly nodes?: Readonly<Record<string, string>>;
  /** Node names whose `name` file rejects — the `EACCES`-under-`/sys` case. */
  readonly unreadable?: readonly string[];
  readonly rootFails?: string;
}

const fake = (o: FakeOptions = {}): HwmonReader => {
  const nodes = o.nodes ?? REAL_NODES;
  return {
    readDir: async (path) => {
      if (o.rootFails !== undefined) throw new Error(o.rootFails);
      if (path !== ROOT) throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
      return Object.keys(nodes);
    },
    readFile: async (path) => {
      const entry = path.slice(`${ROOT}/`.length).replace('/name', '');
      if ((o.unreadable ?? []).includes(entry)) {
        throw new Error(`EACCES: permission denied, open '${path}'`);
      }
      const text = nodes[entry];
      if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return text;
    },
  };
};

describe('findHwmonNode', () => {
  test('⚠ finds the node by its `name`, at whatever index it happens to sit', async () => {
    // §3.3: never by a fixed `hwmonN`. The index is not stable across boots.
    const found = await findHwmonNode(fake(), ROOT, 'dell_smm');
    expect(found).toEqual({ found: true, dir: `${ROOT}/hwmon3` });
  });

  test('⚠ the same name at a different index is still found', async () => {
    // The whole point. A reboot that renumbers the nvme controllers must not lose the fans.
    const moved = await findHwmonNode(
      fake({ nodes: { hwmon0: 'dell_smm\n', hwmon1: 'nvme\n', hwmon2: 'coretemp\n' } }),
      ROOT,
      'dell_smm',
    );
    expect(moved).toEqual({ found: true, dir: `${ROOT}/hwmon0` });
  });

  test('the trailing newline of a sysfs `name` is not part of the name', async () => {
    expect(await findHwmonNode(fake(), ROOT, 'dell_smm\n')).toMatchObject({ found: false });
    expect(await findHwmonNode(fake(), ROOT, 'dell_smm')).toMatchObject({ found: true });
  });

  test('it matches exactly — a prefix is a different node', async () => {
    const node = await findHwmonNode(fake({ nodes: { hwmon0: 'dell_smm_extra\n' } }), ROOT, 'dell_smm');
    expect(node).toMatchObject({ found: false, why: 'absent' });
  });

  test('coretemp and dell_smm are told apart in the same directory', async () => {
    expect(await findHwmonNode(fake(), ROOT, 'coretemp')).toEqual({
      found: true,
      dir: `${ROOT}/hwmon2`,
    });
  });

  test('an unreadable root is `root-unreadable` — never "absent"', async () => {
    const node = await findHwmonNode(fake({ rootFails: 'EACCES: permission denied' }), ROOT, 'dell_smm');
    expect(node).toMatchObject({ found: false, why: 'root-unreadable' });
  });

  test('every node identified, none matching, is `absent`', async () => {
    const node = await findHwmonNode(
      fake({ nodes: { hwmon0: 'nvme\n', hwmon1: 'coretemp\n' } }),
      ROOT,
      'dell_smm',
    );
    expect(node).toEqual({ found: false, why: 'absent', scanned: 2 });
  });

  test('an empty root is `absent`, with nothing scanned', async () => {
    const node = await findHwmonNode(fake({ nodes: {} }), ROOT, 'dell_smm');
    expect(node).toEqual({ found: false, why: 'absent', scanned: 0 });
  });

  test('⚠ "I could not read it" is NOT "it is not there"', async () => {
    // §2.2 runs the container non-root, so EACCES under /sys is the plausible case. A
    // swallowed one here is what turns an unreadable sensor into §3.6's alarm.
    const node = await findHwmonNode(
      fake({ nodes: { hwmon0: 'nvme\n', hwmon1: 'coretemp\n' }, unreadable: ['hwmon1'] }),
      ROOT,
      'dell_smm',
    );
    expect(node).toMatchObject({ found: false, why: 'indeterminate', scanned: 2 });
    if (node.found || node.why !== 'indeterminate') throw new Error('wrong branch');
    expect(node.unidentified).toEqual(['hwmon1 (EACCES: permission denied, open \'/sys/class/hwmon/hwmon1/name\')']);
  });

  test('⚠ both sides of that boundary, so neither answer can be the default', async () => {
    const absent = await findHwmonNode(fake({ nodes: { hwmon0: 'nvme\n' } }), ROOT, 'dell_smm');
    const cannotSay = await findHwmonNode(
      fake({ nodes: { hwmon0: 'nvme\n' }, unreadable: ['hwmon0'] }),
      ROOT,
      'dell_smm',
    );
    expect(absent).toMatchObject({ why: 'absent' });
    expect(cannotSay).toMatchObject({ why: 'indeterminate' });
  });

  test('an unreadable node that is NOT the one wanted still finds the wanted one', async () => {
    const node = await findHwmonNode(fake({ unreadable: ['hwmon0'] }), ROOT, 'dell_smm');
    expect(node).toEqual({ found: true, dir: `${ROOT}/hwmon3` });
  });

  test('an empty `name` file is not a match for the empty string, nor for anything else', async () => {
    const node = await findHwmonNode(fake({ nodes: { hwmon0: '\n' } }), ROOT, 'dell_smm');
    expect(node).toMatchObject({ found: false, why: 'absent' });
  });

  test('the first match wins, deterministically', async () => {
    const node = await findHwmonNode(
      fake({ nodes: { hwmon0: 'dell_smm\n', hwmon1: 'dell_smm\n' } }),
      ROOT,
      'dell_smm',
    );
    expect(node).toEqual({ found: true, dir: `${ROOT}/hwmon0` });
  });

  test('nothing throws, whatever the reader does', async () => {
    const hostile: HwmonReader = {
      readDir: async () => ['a', 'b'],
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a rejection is not always an Error
      readFile: async () => {
        throw 'a string, not an Error';
      },
    };
    await expect(findHwmonNode(hostile, ROOT, 'dell_smm')).resolves.toMatchObject({
      why: 'indeterminate',
    });
  });
});

describe('describeHwmonMiss (§6.5)', () => {
  test('an unreadable root names the path and the reason', async () => {
    const node = await findHwmonNode(fake({ rootFails: 'EACCES: permission denied' }), ROOT, 'dell_smm');
    if (node.found) throw new Error('unexpected');
    expect(describeHwmonMiss(node, ROOT, 'dell_smm')).toBe(`${ROOT}: EACCES: permission denied`);
  });

  test('⚠ absence and indeterminacy read differently — that is the whole point', async () => {
    const absent = await findHwmonNode(fake({ nodes: { hwmon0: 'nvme\n' } }), ROOT, 'dell_smm');
    const cannotSay = await findHwmonNode(
      fake({ nodes: { hwmon0: 'nvme\n', hwmon1: 'nvme\n' }, unreadable: ['hwmon1'] }),
      ROOT,
      'dell_smm',
    );
    if (absent.found || cannotSay.found) throw new Error('unexpected');
    expect(describeHwmonMiss(absent, ROOT, 'dell_smm')).toBe(
      'no hwmon named `dell_smm` under /sys/class/hwmon',
    );
    expect(describeHwmonMiss(cannotSay, ROOT, 'dell_smm')).toContain(
      'and 1 of 2 node(s) could not be identified: hwmon1 (',
    );
  });

  test('⚠ the text is byte-identical to step 3’s, so collectCpuTemp can adopt this walk', () => {
    // `collect.ts` produces these two sentences today and `collect.test.ts` asserts them.
    // Keeping them identical is what makes the adoption mechanical rather than a rewrite.
    expect(describeHwmonMiss({ found: false, why: 'absent', scanned: 4 }, ROOT, 'coretemp')).toBe(
      'no hwmon named `coretemp` under /sys/class/hwmon',
    );
    expect(
      describeHwmonMiss(
        {
          found: false,
          why: 'indeterminate',
          scanned: 4,
          unidentified: ['hwmon2 (EACCES: permission denied)'],
        },
        ROOT,
        'coretemp',
      ),
    ).toBe(
      'no hwmon named `coretemp` under /sys/class/hwmon, and 1 of 4 node(s) could not be ' +
        'identified: hwmon2 (EACCES: permission denied)',
    );
  });
});
