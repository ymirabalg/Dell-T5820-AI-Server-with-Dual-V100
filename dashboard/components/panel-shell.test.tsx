import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { PanelShell } from './panel-shell';

describe('title, subtitle and children render verbatim', () => {
  /*
   * ⚠ §6.2's own prose is internally inconsistent ("lower case: `GPU 0`"), so the resolved
   * reading is: the CALLER decides casing, and this component must not "fix" it either way.
   */
  test('⚠ "GPU 0" is rendered with its capitals intact — no lowercasing applied', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="GPU 0" subtitle="Tesla PG500-216 · 00000000:17:00.0" chip="normal">
        body
      </PanelShell>,
    );
    expect(html).toContain('>GPU 0<');
    expect(html).not.toContain('>gpu 0<');
  });

  test('a lower-case title stays lower case', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="cooling" subtitle="dell_smm · channel 5 = FAN_HDD (PCIe/GPU)" chip={null}>
        body
      </PanelShell>,
    );
    expect(html).toContain('>cooling<');
  });

  test('children render inside the body', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135 · 6C / 12T" chip="watch">
        <span>a row</span>
      </PanelShell>,
    );
    expect(html).toContain('a row');
  });

  /*
   * ⚠ §6.2: "A GPU whose `name` failed to parse does not lose its subtitle; it shows what it
   * has." An em-dash subtitle must render, not disappear.
   */
  test('⚠ a subtitle of "—" still renders — it is not suppressed as "empty"', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="GPU 1" subtitle={EM_DASH} chip="normal">
        body
      </PanelShell>,
    );
    // Scoped to the <p> element itself — `chip=null` would also put an em dash in the
    // Chip's own glyph, which must not make this assertion pass for the wrong reason.
    const subtitleParagraph = /<p[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? '';
    expect(subtitleParagraph).toBe(EM_DASH);
  });
});

describe('the chip carries the panel’s own severity', () => {
  test('a real band', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="safety" subtitle="4 checks" chip="alarm">
        body
      </PanelShell>,
    );
    expect(html).toContain('data-severity="alarm"');
  });

  /*
   * ⚠ O12: a panel with nothing that bands must not read as healthy. The section root and
   * the chip both carry the explicit "none" state, never "normal".
   */
  test('⚠ chip=null renders "none" on both the section and the chip, never "normal"', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="serving" subtitle="llama-server" chip={null}>
        body
      </PanelShell>,
    );
    const occurrences = html.match(/data-severity="none"/g) ?? [];
    expect(occurrences.length).toBe(2); // the <section> and the head Chip
    expect(html).not.toContain('data-severity="normal"');
  });
});

// ---------------------------------------------------------------------------------------
// 10e §2.0 — `chip` becomes OPTIONAL: omitting it is a THIRD state, distinct from `null`.
// OQ-4 (declined): SESSION EVENT LOG's head renders NO chip element at all — not the hatched
// `—`, not an invented debounce constant.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e/OQ-4 — an OMITTED chip renders no chip element at all, distinct from chip={null}', () => {
  test('⚠ chip omitted: no Chip element anywhere in the head — zero data-severity occurrences on a chip', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="session event log" subtitle="state transitions since page load">
        body
      </PanelShell>,
    );
    // The <section> itself still carries the attribute (chip ?? 'none' — unaffected by
    // whether the prop was omitted or explicitly null; both are nullish). Exactly ONE
    // occurrence — the section's own — proves no <Chip> rendered at all.
    const occurrences = html.match(/data-severity="none"/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  test('⚠ chip={null} still renders the hatched no-band CHIP — the two states are not the same', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="serving" subtitle="llama-server" chip={null}>
        body
      </PanelShell>,
    );
    const occurrences = html.match(/data-severity="none"/g) ?? [];
    expect(occurrences.length).toBe(2); // section + the Chip that chip={null} DOES render
  });

  test('omitting chip still renders the title, subtitle and children normally', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="session event log" subtitle="state transitions since page load">
        <span>an entry</span>
      </PanelShell>,
    );
    expect(html).toContain('session event log');
    expect(html).toContain('state transitions since page load');
    expect(html).toContain('an entry');
  });
});

describe('⚠ 10e §2.0 — headControl renders in the head, costing nothing in the body', () => {
  test('⚠ headControl renders between the subtitle and the chip', () => {
    const html = renderToStaticMarkup(
      <PanelShell
        title="gpu0"
        subtitle="Tesla PG500-216 · 00000000:17:00.0"
        chip="normal"
        headControl={<button type="button">table</button>}
      >
        body
      </PanelShell>,
    );
    expect(html).toContain('<button');
    expect(html).toContain('>table<');
    // Order: subtitle text, then the control, then the chip's own data-severity attribute.
    const subtitleAt = html.indexOf('Tesla PG500-216');
    const controlAt = html.indexOf('<button');
    const chipAt = html.indexOf('data-severity="normal"', controlAt);
    expect(subtitleAt).toBeLessThan(controlAt);
    expect(controlAt).toBeLessThan(chipAt);
  });

  test('omitted by default — no extra element between subtitle and chip', () => {
    const withControl = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135 · 6C / 12T" chip="normal" headControl={<i>x</i>}>
        body
      </PanelShell>,
    );
    const without = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135 · 6C / 12T" chip="normal">
        body
      </PanelShell>,
    );
    expect(withControl).not.toBe(without);
    expect(without).not.toContain('<i>x</i>');
  });
});
