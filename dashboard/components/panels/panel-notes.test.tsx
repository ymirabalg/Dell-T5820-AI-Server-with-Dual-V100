import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { PanelNotes } from './panel-notes';

/**
 * The panel-level half of §6.5's *"its `errors` entry is available"* — see the component's own
 * module doc for why eight of §3.7's eighteen sources previously had no rendering path at all.
 */

describe('§6.5 — PanelNotes', () => {
  test('renders one line per message, in the order given', () => {
    const html = renderToStaticMarkup(
      <PanelNotes
        messages={[
          { source: 'statvfs', message: '/: ENOENT' },
          { source: 'statvfs', message: '/home: ENOENT' },
        ]}
      />,
    );
    expect(html.indexOf('/: ENOENT')).toBeLessThan(html.indexOf('/home: ENOENT'));
  });

  test('⚠ an empty list renders NOTHING — not an empty element, not a separator', () => {
    // `errorsForPanel` returns `[]`, never `null`, for a panel with nothing to explain: that is
    // knowledge rather than a gap, and knowledge renders as silence.
    expect(renderToStaticMarkup(<PanelNotes messages={[]} />)).toBe('');
  });

  test('two entries with the same source and different messages both render', () => {
    // `collectStorage` concatenates root's and home's `statvfs` entries under one source, so a
    // key of `source` alone would drop one of them.
    const html = renderToStaticMarkup(
      <PanelNotes
        messages={[
          { source: 'dell-smm', message: 'fan3_input: ENODATA' },
          { source: 'dell-smm', message: 'fan4_input: ENODATA' },
        ]}
      />,
    );
    expect(html).toContain('fan3_input: ENODATA');
    expect(html).toContain('fan4_input: ENODATA');
  });
});
