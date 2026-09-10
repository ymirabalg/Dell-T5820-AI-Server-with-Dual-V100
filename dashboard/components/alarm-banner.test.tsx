import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { AlarmBanner, BANNER_REST_SHOWN } from './alarm-banner';
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
  since: 'for 2 d 06:00',
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
    expect(html).toContain('for 2 d 06:00');
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
    // ⚠ And every one of them is ACCOUNTED FOR — a count with a hidden list is the same lie
    // from the other direction. Re-aimed by 10h, not weakened: §6.4's 2026-09-10 ruling caps
    // what the one-line well DRAWS at `BANNER_REST_SHOWN`, so past that the remainder is named
    // by `+N more` instead of by its label. Both halves are still asserted, and the drawn ones
    // are still checked by name.
    for (const r of rest.slice(0, BANNER_REST_SHOWN)) expect(html).toContain(r.label);
    const hidden = Math.max(0, n - BANNER_REST_SHOWN);
    if (hidden === 0) expect(html).not.toContain('data-role="banner-more"');
    else expect(html).toContain(`+${hidden} more`);
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

// ---------------------------------------------------------------------------------------
// ⚠ 10g/Q2 — §6.4's banner is a FIXED TWO-LINE SCROLLING BOX (ruled 2026-09-09).
//
// Measured before: 65.7 px at two alarms AND at six, 92.5 at twelve, 173.1 / 146.2 / 119.4 at
// twenty-one — it grows with its TEXT, not its count, and every §6.1 budget was drawn against
// it as a constant. The fix is one bounded, named, reachable well round `.rest`; the LIST is
// untouched, because a banner that renders fewer conditions than it counts is the lying banner
// 10a-F14 already removed from this component once.
//
// The HEIGHT is a browser measurement (`measure-breakpoints.mjs` measurement 12, at 2 / 6 / 12
// / 21). What this file owns is the half that decides whether that measurement is honest:
// every condition still in the DOM, and the count still on the pinned line.
// ---------------------------------------------------------------------------------------

describe('⚠ 10g/Q2 — the banner scrolls, and drops NOTHING to do it', () => {
  const itemsOf = (n: number): AlarmBannerItem[] =>
    Array.from({ length: n }, (_, i) =>
      item({ id: `k:${i}`, label: `condition ${i}`, value: `${i} u` }),
    );

  // ⚠ 10h — RE-AIMED from *"every condition is in the DOM"* to the property that replaced it
  // when §6.4 was ruled again on 2026-09-10: the banner draws what fits and COUNTS the rest.
  // The old assertion is now false BY DESIGN (16 of 21 conditions were in the DOM and
  // unreachable on a wall panel, which is what the owner ruled against), and the successor is
  // the stronger of the two claims a banner can make — **nothing is unaccounted for**:
  // `1 (lead) + drawn + hidden === the count it announces`, checked arithmetically at every
  // count rather than by looking for labels.
  test.each([2, 6, 12, 21])(
    '⚠ every condition is either drawn or counted by +N more, at %i conditions',
    (n) => {
      const all = itemsOf(n);
      const html = renderToStaticMarkup(<AlarmBanner lead={all[0]!} rest={all.slice(1)} />);
      expect(html).toContain(`${n} active alarms`);
      // Every DRAWN condition is named, and the tail is not.
      const drawn = Math.min(n - 1, BANNER_REST_SHOWN);
      for (const c of all.slice(0, drawn + 1)) expect(html).toContain(c.label);
      for (const c of all.slice(drawn + 1)) expect(html).not.toContain(c.label);
      // ⚠ One rendered ITEM per DRAWN condition, counted rather than sampled: every item
      // renders exactly one `<i>` (its elapsed form, `age` being null in this fixture), so a
      // cap that drew more or fewer than it counts is visible here even if the labels happened
      // to appear elsewhere in the markup.
      expect((html.match(/<i /g) ?? []).length).toBe(drawn);
      expect((html.match(/data-role="banner-rest"/g) ?? []).length).toBe(1);
      // ⚠ THE ACCOUNTING: lead + drawn + `+N more` must reconcile with the announced count.
      const hidden = n - 1 - drawn;
      if (hidden === 0) expect(html).not.toContain('data-role="banner-more"');
      else expect(html).toContain(`+${hidden} more`);
      expect(1 + drawn + hidden).toBe(n);
    },
  );

  test('⚠ the +N more count is OUTSIDE the scrolling well, so it cannot itself be scrolled out', () => {
    const all = itemsOf(21);
    const html = renderToStaticMarkup(<AlarmBanner lead={all[0]!} rest={all.slice(1)} />);
    const well = /<div[^>]*data-role="banner-rest"[^>]*>([\s\S]*?)<\/div>\s*<span[^>]*data-role="banner-more"/.exec(html);
    expect(well).not.toBeNull();
    // And it is NOT `aria-hidden`: unlike a well's `… N more`, the conditions this counts are
    // absent from the DOM entirely, so this marker is the only thing a screen reader has.
    const tag = /<span[^>]*data-role="banner-more"[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).not.toContain('aria-hidden');
  });

  test('⚠ BANNER_REST_SHOWN is the measured design-width count, and it is three', () => {
    // ⚠ A token's VALUE needs its own assertion (10g's lesson): every other test here reads
    // the constant, so all of them would follow it anywhere it moved. Measured at 1280x1024:
    // four `.rest` items are fully visible, and `+N more` takes one of those slots.
    expect(BANNER_REST_SHOWN).toBe(3);
  });

  test('⚠ the COUNT is outside the scrolling region — §6.4’s "always visible"', () => {
    const all = itemsOf(21);
    const html = renderToStaticMarkup(<AlarmBanner lead={all[0]!} rest={all.slice(1)} />);
    // The count, the lead and its elapsed form all precede the well in document order, so no
    // amount of scrolling inside it can take them off screen.
    expect(html.indexOf('21 active alarms')).toBeLessThan(html.indexOf('data-role="banner-rest"'));
    expect(html.indexOf('for 2 d 06:00')).toBeLessThan(html.indexOf('data-role="banner-rest"'));
  });

  test('⚠ the well is NAMED and keyboard-reachable — all three attributes on one tag', () => {
    const all = itemsOf(3);
    const html = renderToStaticMarkup(<AlarmBanner lead={all[0]!} rest={all.slice(1)} />);
    const tag = /<div[^>]*data-role="banner-rest"[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).toContain('role="group"');
    expect(tag).toContain('aria-label="other alarm conditions"');
    expect(tag).toContain('tabindex="0"');
  });

  test('⚠ ONE standing condition renders no well at all — an empty scroll box is not a banner', () => {
    const html = renderToStaticMarkup(<AlarmBanner lead={item()} rest={[]} />);
    expect(html).not.toContain('data-role="banner-rest"');
    expect(html).toContain('1 active alarm');
  });

  test('⚠ role="alert" is unchanged — the ruling bounds the box, not the announcement', () => {
    const all = itemsOf(12);
    const html = renderToStaticMarkup(<AlarmBanner lead={all[0]!} rest={all.slice(1)} />);
    expect(html).toContain('role="alert"');
  });

  test('⚠ the stylesheet is where the bound lives, and `height` is deliberate, not `max-height`', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./alarm-banner.module.css', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const body = css.slice(css.indexOf('.rest {'), css.indexOf('}', css.indexOf('.rest {')));
    // ⚠ `height`, not `max-height`: at `max-height` a two-alarm banner measures the chip line's
    // own 20.8 px and a twenty-one-alarm one the full 21, so "identical at 2 / 6 / 12 / 21"
    // would fail by 0.2 px on a rule that is working. 21 is the whole pixel above 20.8.
    expect(body).toMatch(/(?:^|[^-])height:\s*21px/);
    expect(body).not.toMatch(/max-height/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/position:\s*relative/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
    // ⚠ The 7 px margin is GONE: it separated the head from an unbounded block, and its removal
    // is the 6.9 px that takes the all-sources-explained page from 1 px over to fitting.
    expect(body).not.toMatch(/margin-top/);
    // ⚠ 10g/Q4 — the continuation fade, and its cover must be this well's OWN ground or it
    // paints a bar instead of vanishing.
    expect(body).toMatch(/background-attachment:\s*local,\s*scroll/);
    expect(body).toMatch(/background-color:\s*var\(--surface-sunken\)/);
    expect(body).toMatch(/background-image:\s*var\(--well-fade-cover\),\s*var\(--well-fade-edge\)/);
  });
});
