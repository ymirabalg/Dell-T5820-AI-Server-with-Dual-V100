import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { Caption } from './caption';

/**
 * 10e §2.0's shared caption line — GPU's throttle row, STORAGE's link row. A pure layout
 * wrapper: it formats nothing and decides no severity.
 */

describe('an optional bold lead label, and arbitrary children', () => {
  test('a label renders as its own bold element, ahead of the children', () => {
    const html = renderToStaticMarkup(
      <Caption label="throttle">
        <span>0x20 sw thermal slowdown</span>
      </Caption>,
    );
    expect(html).toContain('<b');
    expect(html).toContain('throttle');
    expect(html).toContain('0x20 sw thermal slowdown');
    expect(html.indexOf('throttle')).toBeLessThan(html.indexOf('0x20 sw thermal slowdown'));
  });

  test('⚠ omitted label renders no <b> element at all', () => {
    const html = renderToStaticMarkup(
      <Caption>
        <span>up</span>
      </Caption>,
    );
    expect(html).not.toContain('<b');
    expect(html).toContain('up');
  });

  test('renders with no children at all, without throwing', () => {
    expect(() => renderToStaticMarkup(<Caption label="link" />)).not.toThrow();
  });
});
