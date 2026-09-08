import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { StatusRow } from './status-row';

/**
 * `StatusRow` is `Row` plus one thing `Row` cannot do: colour its trailing note
 * `--status-watch` for S-B's stale-age text without touching step 9's own `row.module.css`.
 * See the component's own module doc for why it exists as a sibling rather than a `Row` edit.
 */

describe('§6.2/§6.5 — StatusRow', () => {
  test('label, value and note all render', () => {
    const html = renderToStaticMarkup(
      <StatusRow label="fan 5" value="4,308 RPM" note="last read 6:12 ago" />,
    );
    expect(html).toContain('fan 5');
    expect(html).toContain('4,308 RPM');
    expect(html).toContain('last read 6:12 ago');
  });

  test('⚠ noteTone="watch" renders the note under a DIFFERENT class than noteTone="muted"', () => {
    const classBeforeText = (html: string, text: string): string | undefined =>
      /class="([^"]*)"[^>]*>[^<]*$/.exec(html.slice(0, html.indexOf(text)))?.[1];

    const watch = renderToStaticMarkup(
      <StatusRow label="fan 5" value="—" note="last read 6:12 ago" noteTone="watch" />,
    );
    const muted = renderToStaticMarkup(
      <StatusRow label="fan 5" value="—" note="last read 6:12 ago" noteTone="muted" />,
    );
    const watchClass = classBeforeText(watch, 'last read 6:12 ago');
    const mutedClass = classBeforeText(muted, 'last read 6:12 ago');
    expect(watchClass).toBeDefined();
    expect(mutedClass).toBeDefined();
    expect(watchClass).not.toBe(mutedClass);
  });

  test('omitting severity renders no chip at all', () => {
    const html = renderToStaticMarkup(<StatusRow label="power" value="249.8 W" />);
    expect(html).not.toContain('data-severity');
  });

  test('⚠ severity={null} renders the explicit no-band chip, distinct from omitting it', () => {
    const html = renderToStaticMarkup(<StatusRow label="x" value="—" severity={null} />);
    expect(html).toContain('data-severity="none"');
  });

  test('a null/empty note renders no trailing note element at all', () => {
    const withNull = renderToStaticMarkup(<StatusRow label="x" value="—" note={null} />);
    const withEmpty = renderToStaticMarkup(<StatusRow label="x" value="—" note="" />);
    const withoutNote = renderToStaticMarkup(<StatusRow label="x" value="—" />);
    expect(withNull).toBe(withoutNote);
    expect(withEmpty).toBe(withoutNote);
  });
});

describe('⚠ §6.5/§3.7 — the stale age and the errors[] explanation are BOTH facts', () => {
  test('⚠ a row given both renders both, the age watch-toned and the explanation muted', () => {
    // `note={age ?? message}` displaced the explanation exactly when a source died — the case
    // that produces one (10b-reconcile, adversarial F3).
    const html = renderToStaticMarkup(
      <StatusRow
        label="fan 5"
        value="4,308 RPM"
        note="last read 6:12 ago"
        noteTone="watch"
        detail="no hwmon named dell_smm"
      />,
    );
    expect(html).toContain('last read 6:12 ago');
    expect(html).toContain('no hwmon named dell_smm');
    expect(html).toMatch(/class="_noteWatch[^"]*">last read 6:12 ago</);
    expect(html).toMatch(/class="_note[^W"][^"]*">no hwmon named dell_smm</);
  });

  test('an empty or absent detail renders no second element at all', () => {
    const bare = renderToStaticMarkup(<StatusRow label="fan 5" value="—" />);
    const empty = renderToStaticMarkup(<StatusRow label="fan 5" value="—" detail="" />);
    expect(bare).not.toMatch(/class="_note/);
    expect(empty).not.toMatch(/class="_note/);
  });
});
