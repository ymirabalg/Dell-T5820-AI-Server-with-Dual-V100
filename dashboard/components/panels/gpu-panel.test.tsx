import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero, nothingReadable, servingInstances } from '@/lib/fixtures';
import { celsius, mib, throttleMask, watts } from '@/lib/types';
import type { Gpu, TelemetrySnapshot } from '@/lib/types';

import { GpuPanel } from './gpu-panel';
import { allReadingsNull, emptyState, stateWith, valueCells } from './test-support';

/**
 * §6.2's GPU card, the traps the handoff names each already having bitten a draft:
 *
 * - the name/bus render RAW, in full, never prettified or trimmed to the short bus form;
 * - a throttle row appears only when something other than `0x4` is active;
 * - the served-model row is joined by `gpu.index === serving.instance`, not "on this card";
 * - `gpus: null` takes the whole body over with §6.5's message, and every other field is
 *   still shown as `—` rather than reused from a stale-looking previous render.
 */

/** The full markup of the row/div containing `needle`, chip included (the chip precedes the
 *  label in DOM order, so slicing forward from the label text alone would miss it). Copied
 *  from `cooling-panel.test.tsx`/`safety-panel.test.tsx`, which found the whole-document
 *  check masks a row bug when the panel HEAD derives its own chip from the same severity. */
const rowContaining = (html: string, needle: string): string => {
  const at = html.indexOf(needle);
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end);
};

/** This box's real values — the exact string a draft mock (`MOCK.html`) gets wrong both ways. */
const rawGpuSnapshot = (overrides: Partial<Gpu> = {}): TelemetrySnapshot => ({
  ...everythingZero,
  gpus: [
    {
      index: 0,
      name: 'Tesla PG500-216',
      bus: '00000000:17:00.0',
      tempC: celsius(66),
      powerW: watts(249.8),
      powerCapW: watts(250),
      memUsedMiB: mib(26452),
      memTotalMiB: mib(32768),
      utilPct: everythingZero.gpus?.[0]?.utilPct ?? null,
      smClockMHz: everythingZero.gpus?.[0]?.smClockMHz ?? null,
      throttleReasons: throttleMask('0x0000000000000004'),
      ...overrides,
    },
  ],
});

describe('§6.2 — the GPU card head', () => {
  test('⚠ the subtitle renders the RAW name and FULL bus form, untrimmed', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toContain('Tesla PG500-216');
    // The FULL domain form, with its leading zeros — never trimmed to the short `17:00.0`
    // `MOCK.html` renders. The short form is a substring of the full one, so a bare
    // `.toContain('17:00.0')` could never fail under a trimming bug; this instead checks
    // what immediately PRECEDES the bus id, which differs between the two: `· 00000000:…`
    // if untrimmed, `· 17:00.0` if a draft "helpfully" stripped the domain.
    expect(html).toContain('· 00000000:17:00.0');
    expect(html).not.toContain('· 17:00.0');
  });

  test('title keeps its GPU-N capitalisation, per index', () => {
    const html0 = renderToStaticMarkup(<GpuPanel state={emptyState()} nowMs={0} panelId="gpu0" />);
    const html1 = renderToStaticMarkup(<GpuPanel state={emptyState()} nowMs={0} panelId="gpu1" />);
    expect(html0).toContain('GPU 0');
    expect(html1).toContain('GPU 1');
  });
});

describe('⚠ throttle — the normal power cap must never be styled as a warning', () => {
  test('0x4 alone renders NO throttle row at all', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).not.toContain('throttle');
  });

  test('a mask of 0 also renders no throttle row', () => {
    const snapshot = rawGpuSnapshot({ throttleReasons: throttleMask('0x0000000000000000') });
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(html).not.toContain('throttle');
  });

  test('a notable bit (0x20, sw thermal slowdown) DOES render, alongside 0x4', () => {
    const snapshot = rawGpuSnapshot({ throttleReasons: throttleMask('0x0000000000000024') });
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('throttle');
    expect(html).toContain('sw thermal slowdown');
  });
});

describe('⚠ the GPU↔instance join is gpu.index === serving.instance', () => {
  test('the served model renders as "served by instance N", never "on this card"', () => {
    const snapshot: TelemetrySnapshot = { ...rawGpuSnapshot(), serving: servingInstances };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('served by instance 0');
    expect(html).toContain('qwen3.6-27b');
    expect(html).not.toContain('on this card');
  });

  test('a card with no matching instance (index 1, no serving[1]) shows an em dash, not instance 0’s model', () => {
    // ⚠ Card 1 must be IN the enumeration for this test to be about the join at all — with
    // `gpus: [card0]` the panel takes §6.5's absent-card branch instead, and this test would
    // silently stop exercising `servingFor` (10b-reconcile, adversarial F7).
    const snapshot: TelemetrySnapshot = {
      ...rawGpuSnapshot(),
      gpus: [...(rawGpuSnapshot().gpus ?? []), { ...(rawGpuSnapshot().gpus?.[0] as Gpu), index: 1 }],
      serving: [servingInstances[0]!],
    };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu1" />);
    expect(html).toContain('served by instance 1');
    expect(html).not.toContain('qwen3.6-27b');
  });

  test('⚠ a card ABSENT from a gpus[] that WAS read never asserts a served model', () => {
    // §3.1/§9 spend paragraphs keeping *retired* (absent from a collection that was read) apart
    // from *stale* (the collection could not be read); before this branch existed the panel
    // collapsed them, rendering `served by instance 1  gemma-4-12b` for a card the enumeration
    // says is not there — §6.2's own named failure mode, *"prints the wrong model on a card
    // rather than failing visibly"* (10b-reconcile, adversarial F7).
    const snapshot: TelemetrySnapshot = {
      ...rawGpuSnapshot(),
      serving: [servingInstances[0]!, { ...servingInstances[1]!, model: 'gemma-4-12b' }],
    };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu1" />);
    expect(html).toContain('card not enumerated');
    expect(html).not.toContain('gemma-4-12b');
    expect(html).not.toContain('served by instance 1');
  });

  test('⚠ absent-from-the-enumeration and present-with-every-reading-null do not render alike', () => {
    // These two rendered BYTE-IDENTICALLY before the branch above: `a === b` was `true`.
    const absent = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu1" />,
    );
    const presentButUnread = renderToStaticMarkup(
      <GpuPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="gpu1" />,
    );
    expect(absent).not.toBe(presentButUnread);
  });
});

describe('§6.5 — gpus: null takes the whole body over', () => {
  test('renders "no GPUs enumerated" and the errors[] explanation, never a stale reading', () => {
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(nothingReadable)} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('no GPUs enumerated');
    // `nothingReadable`'s one error is filed under `dell-smm`, not `nvidia-smi` — so this GPU
    // panel must show no error line, proving the panel-source filter really is `'gpu'`-scoped.
    expect(html).not.toContain('no hwmon named dell_smm');
  });

  test('before the first poll (empty ring), the panel renders without throwing and shows —', () => {
    const html = renderToStaticMarkup(<GpuPanel state={emptyState()} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('—');
  });
});

describe('⚠ invariant 1 — GPU temperature: null and 0 °C must never look alike', () => {
  // Unlike COOLING/SAFETY, no test in this file had exercised `gpu?.tempC ?? null` with a
  // GPU actually present but its OWN temperature reading missing (a single-sensor failure,
  // §6.5 — distinct from the whole-card `gpus: null` takeover tested above). A panel-level
  // typo of `?? celsius(0)` for the missing-reading fallback — the exact conflation invariant
  // 1 exists to forbid — would have passed every other test in this file, since
  // `rawGpuSnapshot()`'s default `tempC` is always a real, non-null 66.
  test('⚠ a missing temperature reading renders — with the explicit no-band chip, not 0 °C', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot({ tempC: null }))} nowMs={0} panelId="gpu0" />,
    );
    const row = rowContaining(html, 'temperature');
    expect(row).toContain('—');
    expect(row).not.toContain('0 °C');
    expect(row).toContain('data-severity="none"');
  });

  // Not ⚠: the mirror of the test above. `formatCelsius`/`severityGpuTemp` are already
  // tested for the zero case at `lib/format.test.ts`/`lib/severity.test.ts`, and this file
  // has no falsy-checking logic of its own between the reading and those calls (unlike the
  // fallback above, there is no plausible one-line panel bug this uniquely catches) — kept as
  // a documentation/regression fixture, not a ledger obligation (HANDOVER §5.2 rule 1).
  test('a genuine 0 °C reading renders the numeral, banded normal — never blanked to —', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot({ tempC: celsius(0) }))} nowMs={0} panelId="gpu0" />,
    );
    const row = rowContaining(html, 'temperature');
    expect(row).toContain('0 °C');
    expect(row).toContain('data-severity="normal"');
  });
});

describe('VRAM meter', () => {
  test('the fill is drawn from the absolute MiB pair, banded by §6.3', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toContain('26,452 / 32,768 MiB');
  });
});

describe('⚠ invariant 1, across EVERY reading on this card — not just the temperature', () => {
  // The four-panel sweep the test phase made was one field per panel: `powerW`, `utilPct`,
  // `smClockMHz` and `memUsedMiB` all still took a `?? <zero-of-their-unit>` mutation with the
  // whole suite green (10b-reconcile, adversarial F1c). This asserts over every value cell at
  // once, so a new row is covered the day it is added rather than the day someone remembers.
  test('⚠ with every reading null, no value cell prints a numeral', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="gpu0" />,
    );
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(4);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
  });
});
