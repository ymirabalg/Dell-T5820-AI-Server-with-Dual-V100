import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero, nothingReadable, servingInstances } from '@/lib/fixtures';
import { GPU_TEMP_ALARM_C, GPU_TEMP_WATCH_C } from '@/lib/severity';
import { celsius, mib, throttleMask, watts } from '@/lib/types';
import type { Gpu, ServingInstance, TelemetrySnapshot } from '@/lib/types';

import { CHART_SIZE } from '../grid';
import { GpuPanel } from './gpu-panel';
import { BASE_MS, allReadingsNull, emptyState, ringOfSeries, stateOf, stateWith, valueCells } from './test-support';
import type { Gap } from '@/lib/client/gaps';

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

/**
 * ⚠ These are built with `new RegExp` over single-quoted strings rather than `/…/` literals,
 * and the reason is a real trap found by 10e's reconciliation (HANDOVER §0.9).
 * `lib/source-text.ts`'s `codeOnly` — the comment-stripper every `lib/*` guard runs over these
 * files — has no regex-literal state, so a regex containing an ODD number of `"` characters
 * leaves it stuck in string mode: it silently stops stripping comments for the rest of the
 * file, and a dangerous literal quoted in prose then reads as live code. `class="X[^"]*"` has
 * exactly three. A `'…'` string is read correctly whatever it contains.
 */
const FIGURE_CAPTION_CAP = new RegExp('class="_figureCaption[^"]*"[^>]*>cap 250\\.0 W<');
const FIGURE_CAPTION_DASH = new RegExp('class="_figureCaption[^"]*"[^>]*>cap —<');
const FIGURE_VALUE = new RegExp('class="_figureValue[^"]*"[^>]*>([^<]*)<');

// `new RegExp` for the reason given with the other regex consts in this file: an odd number
// of `"` in a regex LITERAL desynchronises `lib/source-text.ts`'s comment-stripper.
const TICK_CLASS = new RegExp('class="_tick', 'g');

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

  // ⚠ 10g/Q3 — the throttle line is a BOUNDED ONE-LINE WELL (SPEC §6.1, ruled 2026-09-09).
  // `caption.test.tsx` owns the primitive's half (the box, the name, the label staying
  // outside); this is the WIRING, which is its own property — HANDOVER §0.8, and the reason
  // 10e shipped `0X4 SW POWER CAP`: the modifier existed and the call site did not pass it.
  // Measured before: a third notable bit takes this caption to 44 px, +27 px on the row that
  // sets the page's first term, on BOTH cards.
  test('⚠ the throttle caption is a well, and the well is named per CARD', () => {
    const snapshot = rawGpuSnapshot({ throttleReasons: throttleMask('0x0000000000000024') });
    const zero = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    // The second card is the SAME reading at index 1 — `GpuPanel` finds its card by index, so
    // a snapshot whose only card is 0 sends this down the "card not enumerated" branch and the
    // assertion below would be vacuous.
    const asCardOne: TelemetrySnapshot = {
      ...snapshot,
      gpus: [{ ...snapshot.gpus![0]!, index: 1 }],
    };
    const one = renderToStaticMarkup(
      <GpuPanel state={stateWith(asCardOne)} nowMs={0} panelId="gpu1" />,
    );
    expect(zero).toContain('data-role="caption-well"');
    expect(zero).toContain('aria-label="GPU 0 throttle"');
    // ⚠ The subject, not a constant: both cards are on the page at once and `PanelShell` gives
    // its contents no accessible context of their own (10f-A6, measured at seven collisions).
    expect(one).toContain('aria-label="GPU 1 throttle"');
    expect(zero).not.toContain('aria-label="GPU 1 throttle"');
    // ⚠ And the chips are INSIDE it — a well beside the chips bounds nothing.
    const wellAt = zero.indexOf('data-role="caption-well"');
    expect(zero.indexOf('sw thermal slowdown')).toBeGreaterThan(wellAt);
  });

  // ⚠ RENAMED by 10g's TEST phase, and the property it was named for moved to the panel that
  // has it. It was `⚠ STORAGE's link caption is NOT a well` — but it renders a GPU CARD, which
  // has no link line, so no defect in STORAGE could ever redden it (its ⚠ mark was covered by
  // `10g-CP1`, a defect in the opposite direction: HANDOVER §5.2 rule 2 exactly). What this
  // body really checks is worth keeping — the card boxes the throttle line and nothing else —
  // and STORAGE's half is now `storage-network-panel.test.tsx`'s own ⚠ test, where a defaulted
  // `well` reddens it.
  test('⚠ the GPU card boxes its throttle line and NOTHING else — exactly one caption well', () => {
    const snapshot = rawGpuSnapshot({ throttleReasons: throttleMask('0x0000000000000024') });
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect((html.match(/data-role="caption-well"/g) ?? []).length).toBe(1);
  });

  // ⚠ 10e-A5 (mutation E), reconciliation. `chip.tsx`'s own doc names this by hand: *"`code` …
  // `text-transform: none` and the monospace face, so `0x4` cannot render `0X4`"*. `10e-C1`
  // backs the PRIMITIVE's modifier in step 9's harness; nothing backed the WIRING, so dropping
  // `code` at the only call site in the tree shipped `0X4 SW POWER CAP` /
  // `0X20 SW THERMAL SLOWDOWN` — a mask uppercased into something that is not a mask — with
  // every harness green. HANDOVER §0.8: wiring a prop is a property.
  test('⚠ every throttle chip carries `code`, the modifier that stops `0x4` rendering as `0X4`', () => {
    const snapshot = rawGpuSnapshot({ throttleReasons: throttleMask('0x0000000000000024') });
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    const chips = [...html.matchAll(/<span[^>]*data-size="md"[^>]*>/g)].map((m) => m[0]);
    const throttleChips = chips.filter((c) => c.includes('data-code'));
    // Two reasons on this mask, and BOTH must be code-typeset — not just the first.
    expect(throttleChips.length).toBe(2);
    for (const chip of throttleChips) expect(chip).toContain('data-code="true"');
    expect((html.match(/data-code="true"/g) ?? []).length).toBe(2);
  });

  /**
   * ⚠ 10f/Q3 — owner's ruling 2026-09-09, `SPEC.md` §6.2's GPU card paragraph: *"when another
   * bit makes the line notable, `0x4` is listed beside it as a **neutral, unbanded code chip**
   * (no colour, no glyph); only the notable bits carry their severity colour."*
   *
   * Before this, `0x4` painted a green `✓ NORMAL` pill (10e-A11) — a verdict asserting the
   * routine 250 W cap is *healthy*, on a line §6.2 says is not news. Both sides are asserted,
   * because they are two different rules and each has its own way of going wrong: `0x4` ALONE
   * must still render no line at all (`notable` is false, so the neutral chip must not become
   * an excuse to start drawing one), and `0x4 | 0x20` must render exactly one unbanded chip
   * and exactly one banded one.
   */
  test('⚠ 10f/Q3 — beside a notable bit, 0x4 is a NEUTRAL unbanded chip and only 0x20 keeps its band', () => {
    const snapshot = rawGpuSnapshot({ throttleReasons: throttleMask('0x0000000000000024') });
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    // Scoped to the throttle CAPTION and then to each chip inside it — never whole-document.
    // A chip's band cannot be read off a document that holds other chips carrying the same
    // attribute (the panel head's own, the VRAM meter's), which is 10c-2's toContain rule.
    const CHIP_OPEN = '<span class="_chip';
    const throttleAt = html.indexOf('>throttle<');
    const caption = html.slice(html.lastIndexOf('<p', throttleAt), html.indexOf('</p>', throttleAt));
    const chips = caption.split(CHIP_OPEN).slice(1);
    expect(chips.length).toBe(2);
    const chipWith = (needle: string): string => chips.find((c) => c.includes(needle)) ?? '';
    const cap = chipWith('0x4 sw power cap');
    const thermal = chipWith('0x20 sw thermal slowdown');
    expect(cap).not.toBe('');
    expect(thermal).not.toBe('');

    // The routine cap: no band attribute, no glyph, and no announced band word.
    expect(cap).not.toContain('data-severity');
    expect(cap).not.toContain('✓');
    expect(cap).not.toContain('normal<');
    // The notable bit keeps its own severity band, glyph and word.
    expect(thermal).toContain('data-severity="alarm"');
    expect(thermal).toContain('✕');
    expect(thermal).toContain('alarm<');
    // Exactly one of the two reasons is banded — a mutation that bands both, or neither,
    // fails here rather than only in one of the two chips above.
    expect(chips.filter((c) => c.includes('data-severity')).length).toBe(1);
  });

  test('⚠ 10f/Q3 — 0x4 ALONE still renders no throttle line: a neutral chip is not a reason to draw one', () => {
    // The other side of the ruling. `decodeThrottleMask(...).notable` is what gates the line,
    // and Q3 changed only how a `normal` reason is PAINTED once the line is already drawn.
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).not.toContain('throttle');
    expect(html).not.toContain('sw power cap');
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

  /**
   * ⚠⚠ 10h/§3.4 — `model` renders as its FILENAME here too (owner's ruling, 2026-09-10). The
   * `served by instance N` strip is the GPU card's half of the ruling, measured at **+17.9 px
   * per card** in the path form (strip 14.8 -> 32.7) — on the row that sets §6.1's first term.
   */
  test('⚠ a path-valued model renders its FILENAME in the strip, with the raw path as its title', () => {
    const snapshot: TelemetrySnapshot = {
      ...rawGpuSnapshot(),
      serving: [
        {
          ...servingInstances[0]!,
          instance: 0,
          model: '/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf',
        },
      ],
    };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('served by instance 0');
    expect(html).toContain('>Qwen3.6-27B-Q4_K_M.gguf<');
    // ⚠ The directory is gone from the visible text — the assertion a raw render would fail.
    expect(html).not.toContain('>/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf<');
    // ⚠ And the whole reading is still on the page, in the attribute §3.4 names.
    expect(html).toContain('title="/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf"');
  });

  test('⚠ a card with no matching instance carries NO title — there is no raw reading to keep', () => {
    // The other side of the boundary: an optional prop is an untested one (HANDOVER §0.8), and
    // `title="undefined"` on an em-dash cell is exactly the shape that ships unnoticed.
    const snapshot: TelemetrySnapshot = { ...rawGpuSnapshot(), serving: [] };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(html).toContain('served by instance 0');
    expect(html).not.toContain('title=');
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

  test('⚠ the join is by instance NUMBER, never by array POSITION — a sparse serving[] must not shift a model onto the wrong card', () => {
    // 10c1-A1. `lib/collectors/llama.ts:61 discoverInstances()` returns `[...found].sort()` —
    // the SET of instance indices whose `<i>.env` was read, not a dense array from zero. If
    // `0.env` is missing (a `set-model` rollback mid-write, a `.bak` left in the scanned
    // directory) the snapshot carries `serving: [{ instance: 1, … }]` alone. Under
    // `serving[index]` GPU 0's card then prints instance 1's model under an honest-looking
    // `served by instance 0` label — §6.2's own named failure, *"prints the wrong model on a
    // card rather than failing visibly"*. Every fixture in the project has `serving` dense and
    // in order, so positional indexing passed the whole suite (adversarial 10c1-A1, EXECUTED).
    const card0 = rawGpuSnapshot().gpus?.[0] as Gpu;
    const snapshot: TelemetrySnapshot = {
      ...rawGpuSnapshot(),
      gpus: [card0, { ...card0, index: 1 }],
      serving: [{ ...(servingInstances[1] as ServingInstance), model: 'gemma-4-12b' }],
    };
    const html0 = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(rowContaining(html0, 'served by instance 0')).toContain('—');
    expect(html0).not.toContain('gemma-4-12b');
    // ⚠ The POSITIVE direction, for the card the join exists to distinguish — unasserted
    // anywhere before this: no test rendered GPU 1 with instance 1 actually present.
    const html1 = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu1" />);
    expect(rowContaining(html1, 'served by instance 1')).toContain('gemma-4-12b');
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

describe('⚠ 10c1-A2/A11 — this card is found by gpu.index, and its TRACE is its own', () => {
  test('⚠ a gpus[] whose only member is index 1 leaves GPU 0 unenumerated, and GPU 1 renders that card', () => {
    // 10c1-A2. `lib/collectors/nvidia-smi.ts:147` documents it: *"a row whose `index` will not
    // parse is a `problems` entry and not a GPU"*, and line 171 pushes `row with unreadable
    // index skipped`. So `gpus: [{ index: 1, … }]` is a shape the collector is DESIGNED to
    // produce. Under `snapshot.gpus[index]` the GPU 0 panel renders GPU 1's die — its
    // temperature, its VRAM, its throttle mask — titled `GPU 0`, while GPU 1 reads *"card not
    // enumerated"*. Both directions are asserted here, per ANCHOR §5's boundary-fixture rule.
    const card1: Gpu = { ...(rawGpuSnapshot().gpus?.[0] as Gpu), index: 1, tempC: celsius(55) };
    const snapshot: TelemetrySnapshot = { ...rawGpuSnapshot(), gpus: [card1] };
    const html0 = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    expect(html0).toContain('card not enumerated');
    // ⚠ 10e's test phase: the POSITIVE half of this pair moved to `>55<` + `°C` when `Hero`
    // split value from unit; the negative half was left on the pre-10e concatenated form,
    // which the Hero can no longer emit at all (only the chart tooltip's `formatValue` can).
    // Both forms are asserted so the negative side reads on the same markup as the positive.
    expect(html0).not.toContain('55 °C');
    expect(html0).not.toContain('>55<');
    const html1 = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu1" />);
    expect(html1).not.toContain('card not enumerated');
    const hero1 = rowContaining(html1, 'temperature');
    expect(hero1).toContain('>55<');
    expect(hero1).toContain('°C');
  });

  test('⚠ GPU 1’s temperature trace carries GPU 1’s own history, not GPU 0’s redrawn in GPU 1’s colour', () => {
    // 10c1-A11 — `10c-CO4`'s exact twin in the other file. The cooling panel's `g.index === 1`
    // was found unexercised by the test phase and fixed; `gpu-panel.tsx`'s own
    // `g.index === index` trace lambda has the same hole, and no test in this file asserts on
    // trace CONTENT at any index. Hard-coding it to `0` draws GPU 0's history under the label
    // *"GPU 1 temperature over the selected window"*, with GPU 1's own current reading in the
    // headline above it — the number and the line beneath it describing different cards.
    const card0 = rawGpuSnapshot().gpus?.[0] as Gpu;
    const snapshot: TelemetrySnapshot = {
      ...rawGpuSnapshot(),
      gpus: [
        { ...card0, tempC: celsius(66) },
        { ...card0, index: 1, tempC: celsius(55) },
      ],
    };
    // Table view renders each trace point as a plain `<td>` — no SVG geometry to reverse, the
    // same method `cooling-panel.test.tsx`'s `10c-CO4` test uses.
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu1" view="table" />,
    );
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>') + '</table>'.length);
    expect(table).toContain('<td>55 °C</td>');
    expect(table).not.toContain('<td>66 °C</td>');
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

  test('⚠ 10f/Q1 — the takeover explanation renders through the bounded PanelNotes, ROOMY here', () => {
    // ⚠ This branch used to map `errorsForPanel` into its own `<p className={styles.takeoverNote}>`
    // list — a second, bespoke copy of `PanelNotes` and so a second UNBOUNDED `errors[]` block,
    // which is exactly what the ruling closes ("bound every notes block"). It renders through the
    // one primitive that owns the bounded well now. `roomy` costs the page nothing here: this
    // branch draws no chart, so the card is far under the 176 px its healthy form sets row 1 to.
    const snapshot: TelemetrySnapshot = {
      ...nothingReadable,
      errors: [{ source: 'nvidia-smi', message: 'nvidia-smi: ENOENT' }],
    };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    const at = html.indexOf('nvidia-smi: ENOENT');
    expect(at).toBeGreaterThan(-1);
    const well = html.slice(html.lastIndexOf('<div', at), at);
    expect(well).toContain('data-bound="roomy"');
    expect(well).toContain('role="group"');
  });

  /*
   * ⚠ 10f/Q1, added by the TEST phase — the OTHER side of the same boundary, and it is the
   * ENUMERATED card rather than the takeover. Row 1 is `max(gpu0, gpu1)` and nothing else, so a
   * GPU card's notes block costs the page 1:1: `roomy` here is +42 px on a page whose worst case
   * already lands 1-8 px over budget at 1600x1024 (10f-build.md §1.4). Only the takeover branch
   * — which draws no chart and sits far under the height the healthy card sets row 1 to — can
   * afford the taller well. Nothing asserted this and no mutation reached it.
   */
  test('⚠ 10f/Q1 — the ENUMERATED card takes the TIGHT bound: row 1 is max(gpu0, gpu1), so it pays 1:1', () => {
    const snapshot: TelemetrySnapshot = {
      ...rawGpuSnapshot(),
      errors: [{ source: 'nvidia-smi', message: 'nvidia-smi: query failed for utilization.gpu' }],
    };
    const html = renderToStaticMarkup(<GpuPanel state={stateWith(snapshot)} nowMs={0} panelId="gpu0" />);
    // The card is enumerated, not taken over — this is the branch with the chart in it.
    expect(html).not.toContain('no GPUs enumerated');
    const at = html.indexOf('nvidia-smi: query failed');
    expect(at).toBeGreaterThan(-1);
    const well = html.slice(html.lastIndexOf('<div', at), at);
    expect(well).toContain('data-bound="tight"');
    expect(well).not.toContain('data-bound="roomy"');
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
    expect(row).toContain('>0<');
    expect(row).toContain('°C');
    expect(row).toContain('data-severity="normal"');
  });
});

// ⚠ 10e-A8, added by the RECONCILIATION. `Hero` now renders `role="group"` beside its
// `aria-label` (the attribute was inert on a role-less `<div>`), and this card used to pass the
// CHART's own name — `GPU 0 temperature over the selected window` — to a single instantaneous
// numeral. That string is already the accessible name of both `<svg role="img">` mounts and of
// `ChartViewToggle`, so an exposed hero label would have announced it a third time, wrongly.
describe('⚠ 10e-A8 — the hero is named as the point reading it is, not as the window behind it', () => {
  test('⚠ the hero’s accessible name is the point reading, and it carries a role that permits naming', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="GPU 0 temperature"[^>]*>/);
    // The window sentence still names the CHART — three times over, and never the hero.
    expect(html).toContain('GPU 0 temperature over the selected window');
    expect(html).not.toContain('aria-label="GPU 0 temperature over the selected window"><span');
  });
});

describe('VRAM meter', () => {
  test('the fill is drawn from the absolute MiB pair, banded by §6.3', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toContain('26,452 / 32,768 MiB');
  });

  // ⚠ 10e-A5 (mutation B), reconciliation. `10e-ME1` backs `Meter`'s `tickPercent` prop in step
  // 9's harness; nothing backed this CALL SITE, so deleting `tickPercent={90}` here left all
  // 2892 tests green while the card silently lost §6.3's own VRAM watch threshold — the mark
  // that says "90 %" on a bar whose numbers are MiB. The tick is a fixed position on the track
  // and the fill is the live reading: 80.7 % here, a different number, so this cannot pass by
  // matching the fill.
  test('⚠ the VRAM track carries §6.3’s 90 % watch tick, at 90 and not at the fill’s position', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toMatch(/class="_tick[^"]*"[^>]*style="left:90%[^"]*"/);
    expect(html).not.toMatch(/class="_tick[^"]*"[^>]*style="left:80\.[0-9]+%[^"]*"/);
    // Exactly one tick on this card: the power meter above has no §6.3 band and takes none.
    expect((html.match(TICK_CLASS) ?? []).length).toBe(1);
  });
});

// ⚠ 10e-A5 (mutation N), reconciliation. Deleting the `caption` prop from the power `Figure`
// left the whole suite green: `hero.test.tsx` fixtures the PRIMITIVE's optional caption, and
// the only assertion on this card that mentioned `cap 250.0 W` was a comment explaining why a
// substring check would be wrong. §6.2 wants power *against the 250 W cap*, and this is the
// half of that pair the meter's own head does not carry in the hero row.
describe('⚠ 10e-A5 — the power Figure states the cap, not just the draw', () => {
  test('⚠ the Figure’s caption is the formatted cap, beneath the reading', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toMatch(FIGURE_CAPTION_CAP);
  });

  test('⚠ an unreadable cap still renders the caption, with an em dash — never a missing line', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot({ powerCapW: null }))} nowMs={0} panelId="gpu0" />,
    );
    expect(html).toMatch(FIGURE_CAPTION_DASH);
  });
});

// ⚠ 10e — the power `Figure`'s own value/unit (the mock's `.gpuTop__pw`, hero.tsx). Not
// caught by `valueCells` (its CSS class is `figureValue`, deliberately distinct from `Hero`'s
// own `value` class since the two sizes differ — 18px vs 34px — so this needs its own fixture
// rather than relying on the panel-wide "no digit in any value cell" sweep below.
describe('⚠ invariant 1 — the power Figure: null and 0.0 W must never look alike', () => {
  test('⚠ a missing power reading renders — in the Figure’s own value span, never a fabricated 0.0', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot({ powerW: null }))} nowMs={0} panelId="gpu0" />,
    );
    // Scoped to the `.figureValue` span itself — the caption beneath it legitimately prints
    // `cap 250.0 W` (the CAP, not the reading), which contains "0.0" as an innocent substring
    // of "250.0" and would make a looser check pass for the wrong reason.
    const valueSpan = FIGURE_VALUE.exec(html)?.[1];
    expect(valueSpan).toBe('—');
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

describe('⚠ 10c1 — the chart/table toggle (Q2-S2), now shell-owned', () => {
  test('⚠ with no `view` given, both chart elements render as CHARTS, not tables', () => {
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(html).not.toContain('data-role="table-view"');
  });

  test('⚠ `view="table"` switches BOTH the sparkline and its ≥1600px promotion to tables', () => {
    // Both chart elements are always in the DOM (CSS picks which one paints, per this file's
    // own ≥1600px-promotion note) — so one `view` value reaching this panel must flip both.
    const html = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" view="table" />,
    );
    expect(html.split('data-role="table-view"').length - 1).toBe(2);
  });

  test('⚠ the toggle control renders ONLY when the caller supplies onToggleView', () => {
    const withoutHandler = renderToStaticMarkup(
      <GpuPanel state={stateWith(rawGpuSnapshot())} nowMs={0} panelId="gpu0" />,
    );
    expect(withoutHandler).not.toContain('show as table');
    const withHandler = renderToStaticMarkup(
      <GpuPanel
        state={stateWith(rawGpuSnapshot())}
        nowMs={0}
        panelId="gpu0"
        onToggleView={() => undefined}
      />,
    );
    expect(withHandler).toContain('show as table');
  });
});

// ---------------------------------------------------------------------------------------
// ⚠ 10c-3 reconciliation / A6 — the same wiring check `cpu-panel.test.tsx` carries, for this
// panel's THIRD `<Sparkline>` mount (rendered twice, as GPU 0 and GPU 1). See that file's
// header block for why the primitive's own tests are not enough.
//
// Note this panel ALSO mounts `StackedTimeSeriesChart` for the ≥1600px promotion, whose `gaps`
// is a required prop — so only the sparkline half can regress silently, which is the half
// asserted here.
// ---------------------------------------------------------------------------------------

describe('⚠ 10c-3/A6 — state.gaps reaches the GPU card’s sparkline', () => {
  const GAP: readonly Gap[] = [
    { fromMs: BASE_MS + 10_000, toMs: BASE_MS + 1_490_000, reason: 'paused' },
  ];

  const gappyState = (gaps: readonly Gap[]) =>
    stateOf(
      ringOfSeries(
        [rawGpuSnapshot({ tempC: celsius(60) }), rawGpuSnapshot({ tempC: celsius(70) })],
        1_500_000,
      ),
      { gaps },
    );

  // ⚠ RENAMED BY 10e's TEST PHASE, 2026-09-09: 10e replaced the promoted
  // `StackedTimeSeriesChart` with a second `Sparkline`, so nothing hatches any more — the
  // body's own comment says so while the name still promised a hatch.
  test('⚠ both sizes mark the same gap — one `data-role="gap"` each, neither hatched', () => {
    const html = renderToStaticMarkup(<GpuPanel state={gappyState(GAP)} nowMs={0} panelId="gpu0" />);
    // 10e: BOTH the non-promoted and promoted forms are the SAME `Sparkline` primitive now
    // (no separate `StackedTimeSeriesChart` promotion), so both mark the gap with their own
    // flat tint (`data-role="gap"`) rather than one using a hatch with `data-gap-reason`.
    expect((html.match(/data-role="gap"/g) ?? []).length).toBe(2);
  });

  test('with no gap in state the sparkline invents none', () => {
    const html = renderToStaticMarkup(<GpuPanel state={gappyState([])} nowMs={0} panelId="gpu0" />);
    expect(html).not.toContain('data-role="gap"');
  });
});

// ---------------------------------------------------------------------------------------
// ⚠ ADDED BY 10e's TEST PHASE, 2026-09-09. `domain` / `refs` / `timeLabels` are optional props
// on `Sparkline`, and HANDOVER §0.8's rule is that *wiring a prop is a property, and an optional
// prop makes it an untested one* — the same shape that let `gaps={state.gaps}` be deleted from
// both CPU call sites with 2801/2801 green. 10e wired all three here and asserted none of them
// outside `sparkline.test.tsx` (the PRIMITIVE), so deleting `refs={TEMP_REFS}` and `timeLabels`
// from the promoted mount left `pnpm verify` green, both harnesses green, and `check-density`
// blind (neither prop changes the svg's `height` attribute, which is all the anatomy scan
// reads) — while silently dropping what SPEC §6.1's OQ-6 ruling REQUIRES to be drawn, and the
// only consumer of the `GPU_TEMP_WATCH_C`/`GPU_TEMP_ALARM_C` constants four mutations across two
// harnesses defend.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e §3.2 / OQ-6 — the ≥1600px promotion carries the reference lines and the time axis; the 1280 form carries neither', () => {
  const SMALL = 'data-role="gpu-sparkline-wrap"';
  const PROMOTED = 'data-role="gpu-full-chart-wrap"';

  /** A two-reading window, so both mounts draw a real polyline rather than a lone point. */
  const html = (): string =>
    renderToStaticMarkup(
      <GpuPanel
        state={stateOf(
          ringOfSeries(
            [rawGpuSnapshot({ tempC: celsius(60) }), rawGpuSnapshot({ tempC: celsius(70) })],
            1_500_000,
          ),
        )}
        nowMs={0}
        panelId="gpu0"
      />,
    );

  /** The 1280 mount's markup, bounded at both ends by the two wrappers' own `data-role`s. */
  const smallWrapper = (markup: string): string =>
    markup.slice(markup.indexOf(SMALL), markup.indexOf(PROMOTED));

  /** The ≥1600 mount's markup. The two wrappers are the last chart emitters on this card, so
   *  everything after the promoted wrapper's own `data-role` belongs to it. */
  const promotedWrapper = (markup: string): string => markup.slice(markup.indexOf(PROMOTED));

  // `new RegExp` for the reason given at the top of this file.
  const POINTS = new RegExp('points="([^"]+)"', 'g');

  /** Every plotted y in one mount's markup. */
  const ysIn = (markup: string): number[] =>
    [...markup.matchAll(POINTS)].flatMap((m) =>
      (m[1] as string).split(' ').map((pair) => Number(pair.split(',')[1])),
    );

  test('⚠ exactly ONE reference group is drawn, and it is the promoted mount, not the 1280 one', () => {
    const markup = html();
    expect((markup.match(/data-role="sparkline-refs"/g) ?? []).length).toBe(1);
    expect(smallWrapper(markup)).not.toContain('data-role="sparkline-refs"');
    expect(markup.indexOf('data-role="sparkline-refs"')).toBeGreaterThan(markup.indexOf(PROMOTED));
  });

  test('⚠ the two reference lines are §6.3’s own boundaries, read from the exported constants', () => {
    const markup = html();
    const at = markup.indexOf('data-role="sparkline-refs"');
    const refs = markup.slice(at, markup.indexOf('data-role="sparkline-gaps"', at));
    expect((refs.match(/data-role="sparkline-ref"/g) ?? []).length).toBe(2);
    expect(refs).toContain(`>${GPU_TEMP_ALARM_C}<`);
    expect(refs).toContain(`>${GPU_TEMP_WATCH_C}<`);
  });

  test('⚠ exactly ONE time axis is drawn, and it is the promoted mount, not the 1280 one', () => {
    const markup = html();
    expect((markup.match(/data-role="sparkline-time-labels"/g) ?? []).length).toBe(1);
    expect(smallWrapper(markup)).not.toContain('data-role="sparkline-time-labels"');
    expect(markup.indexOf('data-role="sparkline-time-labels"')).toBeGreaterThan(markup.indexOf(PROMOTED));
  });

  // ⚠ 10e-A14, fixed by the reconciliation: this pair used to be ONE test asserting
  // `0 < y < 38` over BOTH mounts' `points=`. `38` is `CHART_SIZE.gpuSparkline.height`, but the
  // promoted mount is **50** px with `padT 4 / padB 10`, so its honest plot range is 4…40 —
  // the assertion bit on the promoted mount only because autoscaling happens to land its lower
  // point at `y = 40`, which clears 38 by 2 px. Raise `padB`, drop `gpuPromoted.height` to 48
  // or move the baseline and the mutation stops biting while the defect is unchanged;
  // conversely a legitimate promoted-geometry change turns it red for no defect. Each mount is
  // now checked against ITS OWN rails, the way the refs/time-label tests above are scoped by
  // `data-role`. Autoscaled, the small mount's two readings land exactly on 0 and 38 and the
  // promoted mount's exactly on 4 and 40, so the strict inequalities still catch a dropped
  // `domain` on either one.
  test('⚠ the 1280 mount plots on the fixed 30–90 scale — a 60→70 window is not autoscaled to its 0/38 rails', () => {
    const ys = ysIn(smallWrapper(html()));
    expect(ys.length).toBe(2);
    for (const y of ys) {
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(CHART_SIZE.gpuSparkline.height);
    }
  });

  test('⚠ the ≥1600 mount plots on the same fixed 30–90 scale — not autoscaled to its own 4/40 rails', () => {
    // `timeLabels` reserves 4px at the top and 10px at the bottom of the 50px box, so this
    // mount's rails are 4 and 40 — not 0 and its height.
    const PAD_TOP = 4;
    const PAD_BOTTOM = 10;
    const ys = ysIn(promotedWrapper(html()));
    expect(ys.length).toBe(2);
    for (const y of ys) {
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThan(PAD_TOP);
      expect(y).toBeLessThan(CHART_SIZE.gpuPromoted.height - PAD_BOTTOM);
    }
  });
});
