import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { ErrorSource, TelemetryError } from '@/lib/types';

import { PanelNotes, hiddenMessageCount } from './panel-notes';

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
    // ⚠ 10g/Q4 — the well is now WRAPPED (`.well` gives the `… N more` marker a positioned box
    // that is not the scroller), so the messages are the wrapper's first child's children. The
    // property is unchanged; only the depth moved.
    const wrapper = PanelNotes({
      subject: 'storage & network',
      messages: [
        { source: 'statvfs', message: '/: ENOENT' },
        { source: 'statvfs', message: '/home: ENOENT' },
      ],
    }) as React.ReactElement<{ children: readonly React.ReactElement[] }>;
    const el = wrapper.props.children[0] as React.ReactElement<{
      children: readonly React.ReactElement[];
    }>;
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
    // ⚠ 10g/Q3 — 60 -> 46, owner's ruling 2026-09-09 (SPEC §6.1: "a `roomy` notes well is
    // three lines (46 px), not four (60 px)"). Re-aimed at the ruled number, not weakened:
    // both heights are still asserted exactly, and the ordering below still holds.
    expect(heightIn(roomy)).toBe(46);
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

// ---------------------------------------------------------------------------------------
// ⚠ 10g/Q4/Q5 — a well whose content overflows SAYS SO (SPEC §6.1, ruled 2026-09-09).
//
// 10f measured the affordance the bounded wells shipped with as exactly zero — `offsetHeight −
// clientHeight = 0` on every one of them, with 7.7 % of CPU's four-source explanation visible.
// The ruling is a bottom fade plus a small `… N more` marker, *"a count, never a sentence"*.
//
// The two halves are asserted differently because they ARE different: the fade is CSS and is
// exact (a cover layer attached to the content over a fade attached to the container — the
// declarations are asserted below, the behaviour is a browser measurement), and the count is
// data, because `components/` is hook-free and cannot read `scrollHeight`.
// ---------------------------------------------------------------------------------------

/** N distinct §3.7 sources, so the keys differ and every message is its own line. */
const SOURCES = [
  'coretemp',
  'proc-stat',
  'proc-loadavg',
  'proc-cpuinfo',
  'proc-meminfo',
  'statvfs',
  'proc-net-dev',
  'net-operstate',
  'dell-smm',
  'dbus',
] as const satisfies readonly ErrorSource[];

const errorsOf = (n: number): TelemetryError[] =>
  Array.from({ length: n }, (_, i) => ({
    source: SOURCES[i % SOURCES.length]!,
    message: `message ${i}`,
  }));

describe('⚠ 10g/Q4 — the `… N more` marker is a COUNT, from the panel’s own data', () => {
  test.each([
    ['tight' as const, 1, ''],
    ['tight' as const, 2, '… 1 more'],
    ['tight' as const, 5, '… 4 more'],
    ['roomy' as const, 3, ''],
    ['roomy' as const, 4, '… 1 more'],
    ['roomy' as const, 9, '… 6 more'],
  ])('⚠ the marker counts ENTRIES, not lines — %s with %i messages marks %s', (bound, n, expected) => {
    const html = renderToStaticMarkup(
      <PanelNotes subject="cpu" bound={bound} messages={errorsOf(n)} />,
    );
    if (expected === '') {
      // "and nothing when it does not" — a marker on a well with nothing hidden is a lie in the
      // one place §6.1 lets the UI add copy that is not a reading.
      expect(html).not.toContain('data-role="notes-more"');
      expect(html).not.toContain('more');
    } else {
      expect(html).toContain(expected);
      expect(html).toContain('data-role="notes-more"');
    }
  });

  test('⚠ the two bounds have DIFFERENT budgets — the count is not one constant', () => {
    // Three messages: over the tight budget, exactly at the roomy one. A marker that ignored
    // `bound` would say the same thing about both, and one of the two would be wrong.
    const three = errorsOf(3);
    expect(renderToStaticMarkup(<PanelNotes subject="cpu" bound="tight" messages={three} />)).toContain('… 2 more');
    expect(renderToStaticMarkup(<PanelNotes subject="cpu" bound="roomy" messages={three} />)).not.toContain('notes-more');
  });

  test('⚠ hiddenMessageCount is the exported arithmetic, and it never goes negative', () => {
    expect(hiddenMessageCount(0, 'tight')).toBe(0);
    expect(hiddenMessageCount(1, 'tight')).toBe(0);
    expect(hiddenMessageCount(4, 'tight')).toBe(3);
    expect(hiddenMessageCount(1, 'roomy')).toBe(0);
    expect(hiddenMessageCount(3, 'roomy')).toBe(0);
    expect(hiddenMessageCount(4, 'roomy')).toBe(1);
  });

  test('⚠ the marker is aria-hidden — nothing is hidden from a screen reader, only from the wall', () => {
    // Every message is in the DOM inside a named, focusable `role="group"`. Announcing "… 4
    // more" to a reader who is about to be read all five is noise, and worse, it is untrue.
    const html = renderToStaticMarkup(<PanelNotes subject="cpu" messages={errorsOf(5)} />);
    expect(/<span[^>]*data-role="notes-more"[^>]*>/.exec(html)?.[0] ?? '').toContain('aria-hidden="true"');
    for (const e of errorsOf(5)) expect(html).toContain(e.message);
  });

  test('⚠ the marker sits OUTSIDE the scroll box — inside it, it would scroll away', () => {
    // An absolutely-positioned child of a scroll container scrolls with the content. The
    // marker is a sibling of the well, anchored to a wrapper that adds no height of its own.
    const html = renderToStaticMarkup(<PanelNotes subject="cpu" messages={errorsOf(3)} />);
    const wellEnd = html.indexOf('</div>');
    expect(html.indexOf('data-role="notes-more"')).toBeGreaterThan(wellEnd);
    expect(html.indexOf('role="group"')).toBeLessThan(wellEnd);
  });
});

// ⚠ RENAMED by 10g's TEST phase. It said "and it is inert when nothing is hidden", which is
// two claims this body cannot make: it reads DECLARATIONS, and the paint was measured at
// 9/255 with nothing hidden rather than nothing at all (`tokens.css` carries the numbers).
// What these tests really own is that the two layers and their attachments are present and
// that the cover is painted in the well's own ground.
describe('⚠ 10g/Q4 — the fade is CSS: both layers, the two attachments, and the well’s own ground', () => {
  const declarations = (): string =>
    readFileSync(fileURLToPath(new URL('./panel-notes.module.css', import.meta.url)), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      ' ',
    );

  test('⚠ the well carries BOTH fade layers, and the attachments are what make it conditional', () => {
    const css = declarations();
    const body = css.slice(css.indexOf('.notes {'), css.indexOf('}', css.indexOf('.notes {')));
    // The cover moves with the CONTENT and the fade is pinned to the CONTAINER. With both
    // `local` the fade never shows; with both `scroll` it always does — either way the rule
    // reads as "there is a fade" and is wrong in one of the two states.
    expect(body).toMatch(/background-attachment:\s*local,\s*scroll/);
    expect(body).toMatch(/background-image:\s*var\(--well-fade-cover\),\s*var\(--well-fade-edge\)/);
    expect(body).toMatch(/background-size:\s*100% var\(--well-fade-height\)/);
    expect(body).toMatch(/background-repeat:\s*no-repeat/);
    expect(body).toMatch(/background-position:\s*bottom/);
  });

  test('⚠ the cover is painted in the well’s OWN ground, or it is a bar rather than a cover', () => {
    // The cover only disappears when its colour is the ground it sits on. `.notes` sets
    // `--surface-sunken`, and `--well-fade-cover` must end at that same token.
    const tokens = readFileSync(
      fileURLToPath(new URL('../tokens.css', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(tokens).toMatch(/--well-fade-cover:\s*linear-gradient\(to top, var\(--surface-sunken\), transparent\)/);
    expect(declarations()).toMatch(/background:\s*var\(--surface-sunken\)/);
  });

  // ⚠ ADDED 2026-09-10 by 10g's RECONCILIATION (adversarial A3/R1). Every test in the project
  // asserted `background-size: 100% var(--well-fade-height)` and NOT ONE asserted the token's
  // value, so `--well-fade-height: 9px` -> `0px` — one line, one file — deleted §6.1's ruled
  // affordance from ALL FOUR wells at once with `pnpm verify` green. `10g-PN7` mutates
  // `--well-fade-cover`, one line above it, which is why the hole looked covered.
  test('⚠ 10g/Q4 — the fade has a REAL height: --well-fade-height is a positive px, not 0', () => {
    const tokens = readFileSync(
      fileURLToPath(new URL('../tokens.css', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const declared = /--well-fade-height:\s*([\d.]+)px/.exec(tokens);
    expect(declared).not.toBeNull();
    // 9 px is the measured band the cover has to travel before the affordance is fully on
    // (`tokens.css` carries the per-channel numbers). What must never be true is zero: the
    // background-size collapses, and all four wells lose the fade in one edit.
    expect(Number(declared![1])).toBe(9);
    expect(Number(declared![1])).toBeGreaterThan(0);
  });

  test('⚠ the marker adds no HEIGHT — the wrapper is positioned and the marker is out of flow', () => {
    const css = declarations();
    const wrapper = css.slice(css.indexOf('.well {'), css.indexOf('}', css.indexOf('.well {')));
    const marker = css.slice(css.indexOf('.more {'), css.indexOf('}', css.indexOf('.more {')));
    expect(wrapper).toMatch(/position:\s*relative/);
    expect(marker).toMatch(/position:\s*absolute/);
    expect(marker).toMatch(/bottom:\s*0/);
  });
});
