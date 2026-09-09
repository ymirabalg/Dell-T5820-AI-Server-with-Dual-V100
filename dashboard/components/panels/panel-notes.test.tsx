import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
      <PanelNotes subject="cpu"
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
    expect(renderToStaticMarkup(<PanelNotes subject="cpu" messages={[]} />)).toBe('');
  });

  test('two entries with the same source and different messages both render', () => {
    // `collectStorage` concatenates root's and home's `statvfs` entries under one source, so a
    // key of `source` alone would drop one of them.
    const html = renderToStaticMarkup(
      <PanelNotes subject="cpu"
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

/**
 * ⚠ 10f/Q1 — `SPEC.md` §6.1's last ⚠ paragraph, ruled 2026-09-09: this block is a **bounded
 * scroll box**. Nothing capped it before, and an all-collectors-failed page missed §6.1's fold
 * by 27 px at 1280×1024 and 49 px at 1600×1024 (92 and 115 with §6.4's banner pinned) — CPU's
 * four sources alone measured a **123 px** notes block against §2.11's 14.2 px per message.
 *
 * Three properties, and each needs its own kind of assertion because they live in three
 * different places: the height is CSS text (a render test cannot see `max-height`), the
 * per-panel choice is an attribute on the markup, and the default is a fact about the function
 * signature — a call site that forgets the prop must get the SMALLER height, never the larger.
 */
const ONE = [{ source: 'proc-stat', message: '/proc/stat: ENOENT' }] as const;

describe('⚠ 10f/Q1 — the notes block is a bounded, reachable scroll box', () => {
  test('⚠ the well is a NAMED, keyboard-reachable group — a scroll box no one can scroll hides §3.7’s text', () => {
    const html = renderToStaticMarkup(<PanelNotes subject="cpu" messages={[...ONE]} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="cpu messages"');
  });

  test('⚠ 10f-A6 — the name is the SUBJECT’s, so two panels’ wells are never announced alike', () => {
    // The constant this shipped with — `collector messages` — was announced by SEVEN wells at
    // once on the all-collectors-failed page, measured. The page-wide property (nine call
    // sites, nine subjects) is `app/dashboard-shell.test.tsx`'s; this is the primitive's half.
    const cpu = renderToStaticMarkup(<PanelNotes subject="cpu" messages={[...ONE]} />);
    const gpu = renderToStaticMarkup(<PanelNotes subject="GPU 1" messages={[...ONE]} />);
    expect(cpu).toContain('aria-label="cpu messages"');
    expect(gpu).toContain('aria-label="GPU 1 messages"');
    expect(cpu).not.toContain('aria-label="GPU 1 messages"');
    // ...and the subject is the only thing that moved: same messages, same box.
    expect(cpu.replace('cpu messages', 'X')).toBe(gpu.replace('GPU 1 messages', 'X'));
  });

  test('⚠ two entries from ONE source get DISTINCT React keys — the key is source AND message', () => {
    // A key of `e.source` alone collides for the ordinary case (`collectStorage` files one
    // `statvfs` entry per mount), and React's own recovery from a duplicate key is to reuse the
    // first element — invisible in static markup, which is why this reads the KEYS rather than
    // the HTML. The rendered-both-messages test above passes either way; this one does not.
    const el = PanelNotes({
      subject: 'storage & network',
      messages: [
        { source: 'statvfs', message: '/: ENOENT' },
        { source: 'statvfs', message: '/home: ENOENT' },
      ],
    }) as React.ReactElement<{ children: readonly React.ReactElement[] }>;
    const keys = el.props.children.map((c) => c.key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  test('⚠ bound is per panel and OMITTING it gives the TIGHT height, never the roomy one', () => {
    // The safe direction: a forgotten prop must not be the one that breaks §6.1's promise.
    const omitted = renderToStaticMarkup(<PanelNotes subject="cpu" messages={[...ONE]} />);
    const tight = renderToStaticMarkup(<PanelNotes subject="cpu" messages={[...ONE]} bound="tight" />);
    const roomy = renderToStaticMarkup(<PanelNotes subject="cpu" messages={[...ONE]} bound="roomy" />);
    expect(omitted).toBe(tight);
    expect(omitted).not.toBe(roomy);
    expect(tight).toContain('data-bound="tight"');
    expect(roomy).toContain('data-bound="roomy"');
  });

  test('⚠ .notes is a bounded, positioned, border-box well, and roomy is the TALLER of the two — Q1, in CSS text', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./panel-notes.module.css', import.meta.url)),
      'utf8',
      // Declarations only: a rule quoted inside a comment must not satisfy the guard.
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const bodyOf = (selector: string): string =>
      css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
    const notes = bodyOf('.notes {');
    const roomy = bodyOf(".notes[data-bound='roomy'] {");

    // `max-height` bounds the PAGE; `overflow-y` keeps the message WHOLE rather than truncated;
    // `position` is what makes the box actually clip a `.sr-only` descendant (10e-A1);
    // `border-box` puts the padding inside the budget rather than beside it.
    expect(notes).toMatch(/overflow-y:\s*auto/);
    expect(notes).toMatch(/position:\s*relative/);
    expect(notes).toMatch(/box-sizing:\s*border-box/);

    const heightIn = (body: string): number =>
      Number(/max-height:\s*([0-9]+)px/.exec(body)?.[1] ?? NaN);
    // The DEFAULT rule must carry the tight height — an unbounded `.notes` with the bound only
    // on `[data-bound='roomy']` would leave every tight caller growing without limit.
    expect(heightIn(notes)).toBe(18);
    expect(heightIn(roomy)).toBe(60);
    expect(heightIn(roomy)).toBeGreaterThan(heightIn(notes));

    // ⚠ 10f-A4, 2026-09-09 — three more declarations in these two rules, each of which could be
    // deleted with `pnpm verify` and all nine harnesses green. They are not decoration:
    //   · the well's GROUND is the only cue that the box is a box and that text may be hidden
    //     inside it — with it gone the well reads as ordinary body text that simply stops;
    //   · its PADDING is what `box-sizing: border-box` above is about: 18 = 4 + 14, and at
    //     `padding: 0` the border-box declaration has no subject left and the text sits against
    //     the panel edge;
    //   · `.note`'s `overflow-wrap: anywhere` is what keeps a 600-character unbroken path INSIDE
    //     the well. Measured by 10f's adversarial: with it, the widest overhang past the panel
    //     is 0.0 px at all three viewports; it is the only declaration doing that.
    expect(notes).toMatch(/background:\s*var\(--surface-sunken\)/);
    const padding = /padding:\s*([^;]+);/.exec(notes)?.[1] ?? '';
    expect(padding).not.toBe('');
    expect(padding).not.toMatch(/^0[a-z%]*$/);
    const line = bodyOf('.note {');
    expect(line).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
