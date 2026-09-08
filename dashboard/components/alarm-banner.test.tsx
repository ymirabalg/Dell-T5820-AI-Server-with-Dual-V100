import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { AlarmBanner } from './alarm-banner';
import type { AlarmBannerItem } from './alarm-banner';

/**
 * §6.4: "Any alarm-level condition pins a banner … naming the condition, the value, and when
 * it started … Multiple conditions collapse into one banner with a count." Pure render tests,
 * `react-dom/server`'s pattern like every other primitive in this directory.
 */

const item = (over: Partial<AlarmBannerItem> = {}): AlarmBannerItem => ({
  id: 'gpu_temp:0',
  label: 'GPU 0 temperature',
  value: '82 °C',
  since: 'since 15:10:40',
  // ⚠ `null` is the LIVE case — a condition this poll carried. The stale case has its own
  // fixtures below; §6.5's rule is that the two must not look alike, so both sides are here
  // rather than the default standing in for both (ANCHOR §5's boundary-fixture rule).
  age: null,
  ...over,
});

describe('⚠ nothing alarm-level renders no banner at all', () => {
  test('⚠ no lead renders null, not an empty landmark', () => {
    const html = renderToStaticMarkup(<AlarmBanner lead={null} rest={[]} />);
    expect(html).toBe('');
  });
});

describe('one alarm-level condition', () => {
  test('names the condition, the value, and when it started', () => {
    const html = renderToStaticMarkup(
      <AlarmBanner lead={item()} rest={[]} />,
    );
    expect(html).toContain('GPU 0 temperature');
    expect(html).toContain('82 °C');
    expect(html).toContain('since 15:10:40');
  });

  test('carries an alert landmark, since this is the sticky alarm banner', () => {
    const html = renderToStaticMarkup(<AlarmBanner lead={item()} rest={[]} />);
    expect(html).toContain('role="alert"');
  });
});

describe('⚠ multiple conditions collapse into one banner WITH A COUNT', () => {
  test('⚠ the count text is present and matches the total', () => {
    const html = renderToStaticMarkup(
      <AlarmBanner lead={item({ id: 'a' })}
        rest={[item({ id: 'b', label: 'GPU 1 temperature' }), item({ id: 'c', label: 'fan5' })]}
      />,
    );
    expect(html).toContain('3 active alarms');
  });

  test('⚠ the rest list names every remaining condition, not just the lead', () => {
    const html = renderToStaticMarkup(
      <AlarmBanner lead={item({ id: 'a', label: 'GPU 0 temperature' })}
        rest={[
          item({ id: 'b', label: 'GPU 1 temperature', value: '81 °C' }),
          item({ id: 'c', label: 'fan5', value: '0 RPM' }),
        ]}
      />,
    );
    expect(html).toContain('GPU 0 temperature');
    expect(html).toContain('GPU 1 temperature');
    expect(html).toContain('fan5');
    expect(html).toContain('0 RPM');
  });

  test('a single alarm renders "1 active alarm", singular', () => {
    const html = renderToStaticMarkup(<AlarmBanner lead={item()} rest={[]} />);
    expect(html).toContain('1 active alarm');
    expect(html).not.toContain('1 active alarms');
  });
});

/**
 * ⚠ F14 — the count is derived from the list, so the two cannot disagree. It used to be a
 * third independent prop: `count={7}` beside three items announced "7 active alarms" and named
 * three, in the component whose entire job is an honest count, with nothing enforcing the
 * relation and no test asserting it.
 */
describe('⚠ the announced count IS the number of conditions named', () => {
  test.each([0, 1, 2, 5])('⚠ a lead plus %i more announces exactly that many alarms', (n) => {
    const rest = Array.from({ length: n }, (_, i) => item({ id: `r${i}`, label: `cond ${i}` }));
    const html = renderToStaticMarkup(<AlarmBanner lead={item({ id: 'lead' })} rest={rest} />);
    const total = n + 1;
    expect(html).toContain(`${total} active alarm${total === 1 ? '' : 's'}`);
    // And every one of them is actually named — a count with a hidden list is the same lie
    // from the other direction.
    for (const r of rest) expect(html).toContain(r.label);
  });
});

/**
 * ⚠ F10 — §6.5: a condition whose subject stopped being reported "keeps its last confirmed
 * band and its 'since', still counts (§9), and **its row and the banner name the age of the
 * reading**." Before this, `BannerCondition` and `AlarmBannerItem` both dropped `stale` and
 * `lastSeenMs`, so a six-minute-old 82 °C pinned the banner looking exactly like a live one —
 * "we stopped being able to look" presented as "it is still 82 °C right now".
 */
describe('⚠ a stale condition names the age of the reading behind it', () => {
  test('⚠ the lead’s age renders when the condition is stale', () => {
    const html = renderToStaticMarkup(
      <AlarmBanner lead={item({ age: 'last read 6:12 ago' })} rest={[]} />,
    );
    expect(html).toContain('last read 6:12 ago');
  });

  test('⚠ a stale condition in the REST list names its age too, not only the lead', () => {
    const html = renderToStaticMarkup(
      <AlarmBanner
        lead={item({ id: 'a' })}
        rest={[item({ id: 'b', label: 'GPU 1 temperature', age: 'last read 2:04 ago' })]}
      />,
    );
    expect(html).toContain('last read 2:04 ago');
  });

  test('⚠ a live condition adds no age text at all — the two must not look alike', () => {
    // The other side of the guard: `age: null` is every condition this poll carried, and an
    // age beside a current reading would be noise that trains an operator to ignore it.
    const html = renderToStaticMarkup(
      <AlarmBanner lead={item()} rest={[item({ id: 'b', label: 'GPU 1 temperature' })]} />,
    );
    expect(html).not.toContain('last read');
  });
});
