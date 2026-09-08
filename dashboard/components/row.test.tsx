import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { Row } from './row';

describe('label and value render verbatim', () => {
  test('a plain fact row — no severity, no note', () => {
    const html = renderToStaticMarkup(<Row label="link" value="up" />);
    expect(html).toContain('link');
    expect(html).toContain('up');
    expect(html).not.toContain('data-severity');
  });

  test('⚠ the value is never reformatted — an em dash passes straight through', () => {
    const html = renderToStaticMarkup(<Row label="fan3" value={EM_DASH} />);
    expect(html).toContain(`>${EM_DASH}<`);
  });
});

describe('the optional severity chip', () => {
  test('omitted entirely when the prop is omitted', () => {
    const html = renderToStaticMarkup(<Row label="fan1" value="1,005 RPM" />);
    expect(html).not.toContain('data-severity');
  });

  /*
   * ⚠ `severity={null}` (no band, O12) is a DIFFERENT thing from omitting the prop — it
   * still renders a chip, in the explicit no-band state, rather than rendering nothing.
   */
  test('⚠ severity={null} still renders a chip, in the no-band state — it is not the same as omitting the prop', () => {
    const html = renderToStaticMarkup(<Row label="fan3" value={EM_DASH} severity={null} />);
    expect(html).toContain('data-severity="none"');
  });

  test('a real band renders that band', () => {
    const html = renderToStaticMarkup(<Row label="fan5" value="4,308 RPM" severity="alarm" />);
    expect(html).toContain('data-severity="alarm"');
  });
});

describe('the optional trailing note', () => {
  test('absent when omitted', () => {
    const html = renderToStaticMarkup(<Row label="fan3" value="740 RPM" />);
    expect(html.match(/<span/g)?.length).toBe(2); // label + value only
  });

  test('absent when explicitly null or empty, not rendered as an empty element', () => {
    expect(renderToStaticMarkup(<Row label="fan3" value="740 RPM" note={null} />).match(/<span/g)?.length).toBe(2);
    expect(renderToStaticMarkup(<Row label="fan3" value="740 RPM" note="" />).match(/<span/g)?.length).toBe(2);
  });

  /*
   * ⚠ §6.5's "already shown beside it" exception is a decision about WHICH rows to compose
   * together, made where the panel is assembled (step 10) — not a policy Row invents for
   * itself by looking at whether `value` happens to already be an em dash.
   */
  test('⚠ a note renders even beside a value that is already an em dash — Row does not suppress it', () => {
    const html = renderToStaticMarkup(
      <Row label="fan5" value={EM_DASH} severity={null} note="dell-smm: no pwm5 on hwmon dell_smm" />,
    );
    expect(html).toContain('dell-smm: no pwm5 on hwmon dell_smm');
  });

  test('rendered verbatim when given, alongside a real value', () => {
    const html = renderToStaticMarkup(<Row label="fan stopped:3" value="0 RPM" severity="alarm" note="since 14:02:11" />);
    expect(html).toContain('since 14:02:11');
  });
});
