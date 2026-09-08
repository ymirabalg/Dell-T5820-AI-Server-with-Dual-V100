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
