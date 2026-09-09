import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ch5EcAuto, ch5Manual, everythingZero, pwm5NodeAbsent } from '@/lib/fixtures';
import { celsius, rpm } from '@/lib/types';
import type { TelemetrySnapshot } from '@/lib/types';

import { CoolingPanel } from './cooling-panel';
import { allReadingsNull, displayedConditionOf, emptyState, stateWith, valueCells } from './test-support';

const withCooling = (cooling: TelemetrySnapshot['cooling']): TelemetrySnapshot => ({
  ...everythingZero,
  cooling,
});

/** The full markup of the row/div containing `needle`, chip included — the chip precedes the
 *  label/value in DOM order, so slicing forward from the text alone would miss it. Also keeps
 *  a row-level mutation from being masked by an unrelated alarm elsewhere on the page (e.g.
 *  the panel head, which derives its own chip from a different piece of state). */
const rowContaining = (html: string, needle: string): string => {
  const at = html.indexOf(needle);
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end);
};

/**
 * ⚠ 10e — `Hero` (fan5's headline, §2.2) renders `{ value, unit }` as TWO sibling `<span>`s
 * (O14), never one concatenated string like `"4,308 RPM"`. `rowContaining` above would also
 * catch the MODE pill sitting beside it in the same `.heroRow` (a `<div>`-then-`<span>` sibling
 * pair confuses "nearest preceding `<div`" once the mode chip's own text sits after Hero's own
 * closing tag).
 *
 * ⚠ 10e-A8, reconciliation: this used to anchor on `aria-label="fan 5"` — an attribute that,
 * on a role-less `<div>`, ARIA prohibits and assistive technology does not expose. The words
 * `fan 5` are now VISIBLE beside the hero (`.heroKey`) and the attribute is gone, so the
 * anchor is `Hero`'s own root class instead. `_hero_` with the trailing underscore does not
 * match this panel's `_heroRow_…` wrapper, and COOLING mounts exactly one `Hero`.
 */
/** The whole hero row — key, `Hero` and the mode pill — bounded by the next sibling section's
 *  own class. `coolingHero` below is the `Hero` alone. */
/**
 * ⚠ These are built with `new RegExp` over single-quoted strings rather than `/…/` literals,
 * and the reason is a real trap found by 10e's reconciliation (HANDOVER §0.9).
 * `lib/source-text.ts`'s `codeOnly` — the comment-stripper every `lib/*` guard runs over these
 * files — has no regex-literal state, so a regex containing an ODD number of `"` characters
 * leaves it stuck in string mode: it silently stops stripping comments for the rest of the
 * file, and a dangerous literal quoted in prose then reads as live code. `class="X[^"]*"` has
 * exactly three. A `'…'` string is read correctly whatever it contains.
 */
const HERO_ROW_OPEN = new RegExp('<div class="_heroRow_[^"]*"[^>]*>');
const HERO_ROW_END = new RegExp('<(?:p|div) class="_(?:staleCaption|chart)_[^"]*"[^>]*>');
const HERO_OPEN = new RegExp('<div class="_hero_[^"]*"[^>]*>');
const CHAN_VALUE_SPAN = new RegExp('<span class="([^"]*)"[^>]*>');
const STALE_CAPTION_AGE = new RegExp('class="_staleCaption[^"]*"[^>]*>last read 6:12 ago<');

const heroRowOf = (html: string): string => {
  const at = html.search(HERO_ROW_OPEN);
  const end = html.search(HERO_ROW_END);
  return html.slice(at, end === -1 ? undefined : end);
};

const coolingHero = (html: string): string => {
  const at = html.search(HERO_OPEN);
  const end = html.indexOf('</div>', at);
  return html.slice(at, end);
};

/**
 * ⚠ 10e — the chan table (fan2/1/3/4, §2.0) is ONE `<div class="chan">` with all four
 * channels' glyph/id/value/note laid out as flat CSS-grid children (no per-row wrapper
 * element to scope on, unlike `Row`/`StatusRow`). This finds ONE channel's own leading `Chip`
 * — the nearest `data-severity="…"` attribute BEFORE that channel's id text — so a bug on fan
 * 2 cannot be masked by (or mistaken for) fan 1's, 3's or 4's.
 */
const chanSeverityFor = (html: string, channelLabel: string): string | undefined => {
  const idAt = html.indexOf(`>${channelLabel}<`);
  const sevAt = html.lastIndexOf('data-severity="', idAt);
  return /data-severity="([^"]+)"/.exec(html.slice(sevAt, idAt))?.[1];
};

/** The chan table's own value cell for one channel — between its id and the next channel's
 *  (or the table's own close). */
const chanValueFor = (html: string, channelLabel: string): string => {
  const idAt = html.indexOf(`>${channelLabel}<`);
  const afterId = html.indexOf('</span>', idAt) + '</span>'.length;
  const valueMatch = /<span class="[^"]*">([^<]*)<\/span>/.exec(html.slice(afterId));
  return valueMatch?.[1] ?? '';
};

/**
 * ⚠ 10e-A3 — the same cell's CLASS, which `chanValueFor` deliberately discards.
 *
 * `chanValueClass` (`cooling-panel.tsx`) has three branches and §2.11 requires all three:
 * unreadable is `--ink-muted` and letter-spaced, a genuine `0 RPM` is `--status-alarm-ink`,
 * and an ordinary reading is the row's primary ink. Nothing asserted any of them — the two
 * tests below `chanValueFor` fixture `'0 RPM'` vs `'—'`, the STRINGS, which `formatRpm`
 * already guarantees, and `chanSeverityFor` reads the sibling `Chip`, which comes from
 * `severityFanStopped`. So deleting `if (value === 0) return styles.valueZero` — a dead fan
 * printing in the same ink as a healthy one, on a box with two passively-cooled 250 W cards —
 * left all 2892 tests green. The class names are the CSS module's own hashed forms
 * (`_valueZero_xxxxxx`); the hash is not asserted, only the local name it is built from.
 */
const chanValueClassFor = (html: string, channelLabel: string): string => {
  const idAt = html.indexOf(`>${channelLabel}<`);
  const afterId = html.indexOf('</span>', idAt) + '</span>'.length;
  return CHAN_VALUE_SPAN.exec(html.slice(afterId))?.[1] ?? '';
};

describe('§6.1/§6.2 — COOLING', () => {
  test('subtitle names the exact channel', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={emptyState()} nowMs={0} panelId="cooling" />);
    expect(html).toContain('dell_smm · channel 5 = FAN_HDD (PCIe/GPU)');
  });

  test('fan 5 is the headline reading, banded by the absolute row', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />);
    // 10e: `Hero` renders the value and unit as two sibling spans (O14), never one
    // concatenated string.
    const hero = coolingHero(html);
    expect(hero).toContain('4,308');
    expect(hero).toContain('RPM');
  });

  // ⚠ 10e-A8, added by the RECONCILIATION. 10e moved the fan-5 reading out of a
  // `<Row label="fan 5" …>` into a `Hero` and put the words in an `aria-label` on a role-less
  // `<div>`, where ARIA prohibits them — so `fan 5` appeared NOWHERE in this panel's body: the
  // head reads `cooling`, the chan table reads `fan 2 / fan 1 / fan 3 / fan 4`, and a 34px
  // numeral sat unlabelled beside a pill. The words are visible again, at 0px of height.
  test('⚠ the headline names its subject VISIBLY — `fan 5` is body text, not an aria-label', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />);
    const heroRow = heroRowOf(html);
    expect(heroRow).toMatch(/>fan 5</);
    // …and it precedes the reading it names.
    expect(heroRow.indexOf('>fan 5<')).toBeLessThan(heroRow.indexOf('4,308'));
    // The prohibited-attribute form is gone, on this panel and on the Hero itself.
    expect(html).not.toContain('aria-label="fan 5"');
  });

  test('⚠ invariant 3 — EC auto is HEALTHY, never styled as an error', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5EcAuto))} nowMs={0} panelId="cooling" />);
    expect(html).toContain('EC auto');
    // The mode row carries no severity chip of its own — `EC auto` and `unavailable` are not
    // §6.3 bands (O13); only the numeric fan5 reading above it is banded. Scoped to the row
    // itself, not the whole document — the head's own chip is a different computation and
    // must not be able to mask a bug in this row's.
    expect(rowContaining(html, 'EC auto')).not.toContain('data-severity="alarm"');
  });

  // ⚠ 10e-A5 (mutation F), added by 10e's RECONCILIATION, 2026-09-09. Turning this call site's
  // `size="md"` into `size="sm"` — the bare glyph, no pill — left all 2892 tests green. §2.2
  // makes the mode a `Chip md` whose LABEL is `formatCh5Pwm` verbatim; an `sm` chip renders no
  // label at all, so the mode string would vanish from the panel with nothing red. Scoped to
  // the hero row, because the panel head's own chip is `md` too and a document-wide count
  // could not tell the two apart.
  test('⚠ 10e-A5 — the mode is a labelled `md` pill in the hero row, never the bare `sm` glyph', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />);
    const heroRow = heroRowOf(html);
    expect(heroRow).toContain('HIGH pwm 255');
    expect((heroRow.match(/data-size="md"/g) ?? []).length).toBe(1);
    expect(heroRow).not.toContain('data-size="sm"');
    // invariant 3 / O13 again, from the other side: the pill is unbanded whatever it prints.
    expect(heroRow).toMatch(/data-severity="none" data-size="md"/);
  });

  test('unavailable channel 5 renders "unavailable", not a blank RPM that reads as zero', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(pwm5NodeAbsent)} nowMs={0} panelId="cooling" />);
    expect(html).toContain('unavailable');
  });

  test('⚠ S11/G5, settled 2026-09-08: a fan5 em dash beside "unavailable" needs NO entry of its own', () => {
    // `pwm5Present: true` (the module loaded and the node is listed) but `ch5Mode: null` and
    // `fan5Rpm: null` — reading BOTH `pwm5` and `fan5_input` failed for a reason other than the
    // module being absent, and §6.5's widened exception (S-B/S11-G5, ruled 2026-09-08) says the
    // "unavailable" mode neighbour IS the explanation: no errors[] entry is filed for it and no
    // fallback sentence may be written here — "one fact, stated once."
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      cooling: {
        fan1Rpm: rpm(1005),
        fan2Rpm: rpm(720),
        fan3Rpm: rpm(740),
        fan4Rpm: rpm(1111),
        fan5Rpm: null,
        ch5Mode: null,
        ch5Pwm: null,
        serviceState: 'active',
      },
      safety: { ...everythingZero.safety, pwm5Present: true },
      errors: [],
    };
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(snapshot)} nowMs={0} panelId="cooling" />);
    expect(rowContaining(html, 'unavailable')).toBeTruthy();
    // ⚠ The RULING is "no fallback sentence written in the panel, AT ALL" — so this asserts the
    // SHAPE of the row: with neither a stale age nor an `errors[]` entry, the fan5 row carries
    // no note element whatsoever. The previous form of this test listed the three substrings
    // `10b-CO5` happens to inject (`no reading` / `no pwm5` / `EACCES`), and a fallback sentence
    // with different words — `'channel 5 is not reporting a tach'` — passed it with the file's
    // 11 tests green (10b-reconcile, adversarial F6). A guard that tracks the wording of one
    // mutation is a guard for that mutation, not for the rule.
    const fan5Hero = coolingHero(html);
    expect(fan5Hero).toContain('—');
    expect(html).not.toMatch(/class="_note/);
  });

  test('⚠ invariant 1 — fan5 reading 0 RPM alarms; fan5 reading null does not', () => {
    const dead = withCooling({ ...ch5Manual, fan5Rpm: rpm(0) });
    const unread = withCooling({ ...ch5Manual, fan5Rpm: null });
    const deadHtml = renderToStaticMarkup(<CoolingPanel state={stateWith(dead)} nowMs={0} panelId="cooling" />);
    const unreadHtml = renderToStaticMarkup(<CoolingPanel state={stateWith(unread)} nowMs={0} panelId="cooling" />);
    // Scoped to the fan5 HERO itself — the panel HEAD derives its own chip from the same
    // underlying severity independently, so a whole-document check could not tell "the row
    // shows it" from "something else on the page happens to". 10e: value/unit are two spans.
    const deadHero = coolingHero(deadHtml);
    expect(deadHero).toContain('>0<');
    expect(deadHero).toContain('data-severity="alarm"');
    // ⚠ On the fan5 hero's VALUE CELL, not the document. `expect(unreadHtml).toContain('—')` —
    // what this line used to say — is satisfied by `Chip`'s own no-band glyph beside the row,
    // whatever the value cell prints: under `?? rpm(0)` the panel rendered **`fan 5  0 RPM`**
    // and this test stayed green (10b-reconcile, adversarial F1a — the parent reproduced it).
    expect(valueCells(coolingHero(unreadHtml))).toEqual(['—']);
    expect(unreadHtml.slice(0, unreadHtml.indexOf('</header>'))).not.toContain('data-severity="alarm"');
  });

  test('⚠ invariant 1 on fan1–4 too — a 0 reading on fan2 alarms', () => {
    const dead = withCooling({ ...ch5Manual, fan2Rpm: rpm(0) });
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(dead)} nowMs={0} panelId="cooling" />);
    // 10e: the chan table prints the value WITH its unit as one string (`formatRpm`, unlike
    // `Hero`'s split parts) — only the wrapping element changed, not this formatter call.
    expect(chanValueFor(html, 'fan 2')).toBe('0 RPM');
    expect(chanSeverityFor(html, 'fan 2')).toBe('alarm');
  });

  test('⚠ invariant 1 on fan1–4 too — an UNREAD fan2 renders — and does NOT alarm', () => {
    // ⚠ The null side of the pair above, which did not exist: no fixture anywhere set a
    // `fanNRpm` to `null` with the rest of the snapshot present, so `?? rpm(0)` on fan 2 passed
    // all 105 tests in `components/panels` while rendering a FABRICATED RED ALARM on a chassis
    // fan whose tach simply could not be read (10b-reconcile, adversarial F1b). Every boundary
    // guard needs a fixture on both sides — this project's own structural rule.
    const unread = withCooling({ ...ch5Manual, fan2Rpm: null });
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(unread)} nowMs={0} panelId="cooling" />);
    expect(chanValueFor(html, 'fan 2')).toBe('—');
    expect(chanSeverityFor(html, 'fan 2')).toBe('none');
  });

  test('⚠ 10e-A3 — invariant 1’s THREE chan inks are three different classes, one per branch', () => {
    // `0 RPM` and `—` must not merely READ differently, they must be INKED differently
    // (§2.11: "the numeral turns `--status-alarm-ink`"; `.valueUnknown` is muted and spaced).
    // Each of the three branches is fixtured, and each is asserted to be distinct from the
    // other two — an implementation collapsing any pair (`if (!value)`, or dropping the zero
    // branch) reddens this.
    const zero = renderToStaticMarkup(
      <CoolingPanel state={stateWith(withCooling({ ...ch5Manual, fan2Rpm: rpm(0) }))} nowMs={0} panelId="cooling" />,
    );
    const unread = renderToStaticMarkup(
      <CoolingPanel state={stateWith(withCooling({ ...ch5Manual, fan2Rpm: null }))} nowMs={0} panelId="cooling" />,
    );
    const ordinary = renderToStaticMarkup(
      <CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />,
    );

    const zeroClass = chanValueClassFor(zero, 'fan 2');
    const unreadClass = chanValueClassFor(unread, 'fan 2');
    const ordinaryClass = chanValueClassFor(ordinary, 'fan 2');

    expect(zeroClass).toMatch(/(^|_)valueZero_/);
    expect(unreadClass).toMatch(/(^|_)valueUnknown_/);
    expect(ordinaryClass).toMatch(/(^|_)value_/);

    expect(new Set([zeroClass, unreadClass, ordinaryClass]).size).toBe(3);
  });

  test('the fan service state renders and is banded', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />);
    expect(html).toContain('fan service');
    expect(html).toContain('active');
  });

  test('the shared-time chart draws both GPU cards and fan 5, unique-id-prefixed by panelId', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />);
    expect(html).toContain('GPU 0');
    expect(html).toContain('GPU 1');
    expect(html).toContain('fan 5');
    // §6.1's "unique SVG id" obligation — L4 — is 10b's.
    expect(html).toContain('cooling-chart');
  });

  test("⚠ GPU 1's trace carries GPU 1's OWN reading, not GPU 0's — every fixture up to now had only one GPU", () => {
    // 10c1's test phase (dashboard-shell composition finally mounting a real second card) found
    // that `everythingZero` — and every fixture derived from it — enumerates only GPU 0, so the
    // test above only ever proved the "GPU 1" LEGEND LABEL renders (a hard-coded string), never
    // that `gpu1Trace`'s `g.index === 1` lookup actually reads a distinct card's data. A mutation
    // that read `g.index === 0` for BOTH series (duplicating GPU 0's trace onto the GPU 1 line)
    // passed every existing test in this file, this suite, and the harness — a two-GPU snapshot
    // is the only thing that can tell the two lookups apart.
    const gpu0 = everythingZero.gpus?.[0];
    if (gpu0 === undefined) throw new Error('fixture invariant: everythingZero.gpus[0] must exist');
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      gpus: [
        { ...gpu0, tempC: celsius(66) },
        { ...gpu0, index: 1, tempC: celsius(55) },
      ],
    };
    // The table view renders each series' reading as a plain `<td>` in reading order — no SVG
    // geometry to reverse-engineer, and a stronger assertion than the chart view's tooltip text.
    const html = renderToStaticMarkup(
      <CoolingPanel state={stateWith(snapshot)} nowMs={0} panelId="cooling" view="table" />,
    );
    const tempTable = html.slice(html.indexOf('<table'), html.indexOf('</table>') + '</table>'.length);
    expect(tempTable).toContain('<td>66 °C</td><td>55 °C</td>');
  });

  test("⚠ a stale fan service condition uses S-B's exact wording, watch-toned", () => {
    const displayed = [
      displayedConditionOf({
        kind: 'unit',
        subject: 'gpu-fan-control.service',
        id: 'unit:gpu-fan-control.service',
        label: 'gpu-fan-control.service',
        value: 'active',
        severity: 'normal',
        displaySeverity: 'normal',
        stale: true,
        lastSeenMs: 0,
      }),
    ];
    const state = stateWith(withCooling(ch5Manual), { displayed });
    const html = renderToStaticMarkup(<CoolingPanel state={state} nowMs={372_000} panelId="cooling" />);
    expect(html).toContain('last read 6:12 ago');
  });

  test('before the first poll, the panel renders — rather than throwing', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={emptyState()} nowMs={0} panelId="cooling" />);
    expect(html).toContain('—');
  });
});

describe('⚠ §6.5 on a COOLING row — the stale rule has two halves and both are load-bearing', () => {
  const staleFan5 = displayedConditionOf({ id: 'fan5_absolute', value: '4,308 RPM', stale: true, lastSeenMs: 0 });

  test('⚠ a stale fan5 row keeps its LAST VALUE, matching the banner rather than contradicting it', () => {
    // §6.5, in bold: *"A stale condition shows its LAST VALUE, unchanged — not an em dash."*
    // `components/alarm-banner.tsx` renders `lead.value` for the same condition in the same
    // frame, so before this the banner said `fan 5  4,308 RPM · last read 6:12 ago` while the
    // row said `fan 5  — · last read 6:12 ago` — two different numbers for one condition, one
    // screen apart (10b-reconcile, adversarial F4).
    const snapshot = withCooling({ ...ch5Manual, fan5Rpm: null });
    const html = renderToStaticMarkup(
      <CoolingPanel state={stateWith(snapshot, { displayed: [staleFan5] })} nowMs={372_000} panelId="cooling" />,
    );
    const row = rowContaining(html, 'fan 5');
    expect(valueCells(row)).toEqual(['4,308 RPM']);
    // 10e §2.2: the stale age is no longer NESTED inside the hero (Hero has no note slot of
    // its own) — it is the sibling `<p>` directly under the hero row, degraded-only. Checked
    // over the whole render rather than the hero's own div for that reason.
    expect(html).toContain('last read 6:12 ago');
    // ⚠ 10e-A7, reconciliation: `.staleCaption` is the THIRD copy of S-B's `--status-watch`
    // (after `status-row.module.css`'s `.noteWatch` and `alarm-banner.module.css`'s `.stale`)
    // and was the only one nothing asserted, on any surface. §6.5: watch, never alarm — the
    // condition is still an alarm and this text is about not being able to LOOK.
    expect(html).toMatch(STALE_CAPTION_AGE);
    const staleCaptionCss = readFileSync(
      fileURLToPath(new URL('./cooling-panel.module.css', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rule = staleCaptionCss.slice(
      staleCaptionCss.indexOf('.staleCaption {'),
      staleCaptionCss.indexOf('}', staleCaptionCss.indexOf('.staleCaption {')),
    );
    expect(rule).toMatch(/color:\s*var\(--status-watch\)/);
  });

  test('⚠ a stale row still shows its errors[] cause — the age must not displace it', () => {
    // `note={age ?? message}` dropped the explanation in exactly the case that produces one: a
    // source stops answering, so `errors[]` gains an entry AND the conditions it fed go stale.
    // Rendered, `no hwmon named dell_smm` appeared nowhere on the panel at the moment it was
    // the answer (10b-reconcile, adversarial F3).
    const snapshot: TelemetrySnapshot = {
      ...withCooling({ ...ch5Manual, fan5Rpm: null }),
      errors: [{ source: 'dell-smm', message: 'no hwmon named dell_smm' }],
    };
    const html = renderToStaticMarkup(
      <CoolingPanel state={stateWith(snapshot, { displayed: [staleFan5] })} nowMs={372_000} panelId="cooling" />,
    );
    // 10e §2.2: the stale age is the sibling `<p>` under the hero row and the errors[] cause
    // is `PanelNotes`, once per panel (S-H) — neither is nested inside the Hero div any more,
    // so both are checked over the whole render. Both still being present, together, is the
    // property this test is actually about.
    expect(html).toContain('last read 6:12 ago');
    expect(html).toContain('no hwmon named dell_smm');
  });

  test('⚠ the errors[] message is the LAST entry for the source, as the event log reads it', () => {
    // `lib/client/events.ts:400` folds `errors[]` into a `Map` keyed by source, so the log shows
    // the LAST message; a panel reading the FIRST shows a different sentence for one fault in
    // one session. `collectCooling` accumulates a `problems: string[]` into a single
    // `tag('dell-smm', …)`, so multi-entry-per-source is routine (adversarial F10).
    const snapshot: TelemetrySnapshot = {
      ...withCooling({ ...ch5Manual, fan5Rpm: null }),
      errors: [
        { source: 'dell-smm', message: 'FIRST dell-smm problem' },
        { source: 'dell-smm', message: 'LAST dell-smm problem' },
      ],
    };
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(snapshot)} nowMs={0} panelId="cooling" />);
    // 10e §2.2: the dell-smm message renders once, in `PanelNotes`, not nested in the Hero.
    expect(html).toContain('LAST dell-smm problem');
    expect(html).not.toContain('FIRST dell-smm problem');
  });

  test('⚠ 10b-S-G — a dbus entry that names an llama-server instance never explains THIS fan service', () => {
    // `panelsForSource('dbus')` fans out to COOLING, SERVING and SAFETY, and 10b-S-G taught
    // only SERVING to read `instance`. So the exact entry `collectServing` files when systemd
    // has no record of instance 1 rendered here, under a `fan service | active` row whose
    // subject is `gpu-fan-control.service` — F2's disease (an explanation beside a row it is
    // not about) in a second panel, on a row that reads healthy (adversarial A2).
    const snapshot: TelemetrySnapshot = {
      ...withCooling(ch5Manual),
      errors: [
        {
          source: 'dbus',
          message: 'llama-server@1.service: NoSuchUnit: systemd has no record',
          instance: 1,
        },
      ],
    };
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(snapshot)} nowMs={0} panelId="cooling" />);
    expect(html).not.toContain('llama-server@1.service');
  });

  test('⚠ 10b-S-G — a dbus entry with NO instance still explains the fan-service row', () => {
    // The other side of the same guard: filtering by `instance` must not silence the entries
    // this row exists to show. A bus-wide failure carries no instance, and `gpu-fan-control`'s
    // own per-unit failure carries none either (they are not yet distinguishable — A8).
    const snapshot: TelemetrySnapshot = {
      ...withCooling({ ...ch5Manual, serviceState: null }),
      errors: [{ source: 'dbus', message: 'D-Bus: connection refused' }],
    };
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(snapshot)} nowMs={0} panelId="cooling" />);
    expect(rowContaining(html, 'fan service')).toContain('D-Bus: connection refused');
  });
});

describe('⚠ invariant 1, across EVERY reading on this panel', () => {
  test('⚠ with every reading null, no value cell prints a numeral', () => {
    // fan1–fan5 and the fan service at once — the honest answer to "is invariant 1 guarded on
    // this panel", which before this loop was *no*, on the panel `PLAN.md` uses as its own
    // example (10b-reconcile, adversarial F1a/F1b).
    const html = renderToStaticMarkup(
      <CoolingPanel state={stateWith(allReadingsNull)} nowMs={0} panelId="cooling" />,
    );
    const cells = valueCells(html);
    expect(cells.length).toBeGreaterThanOrEqual(6);
    for (const cell of cells) expect(cell).not.toMatch(/[0-9]/);
  });
});

describe('⚠ 10c1 — the chart/table toggle (Q2-S2), now shell-owned', () => {
  test('⚠ with no `view` given, the shared-time chart renders as a CHART, not a table', () => {
    const html = renderToStaticMarkup(
      <CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />,
    );
    expect(html).not.toContain('data-role="table-view"');
  });

  test('⚠ `view="table"` switches the shared-time chart to its table view', () => {
    const html = renderToStaticMarkup(
      <CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" view="table" />,
    );
    expect(html).toContain('data-role="table-view"');
  });

  test('⚠ the toggle control renders ONLY when the caller supplies onToggleView', () => {
    // 10e §2.0 shortened the visible label `table view` → `table`; the aria-label sentence is
    // unchanged and is what this checks, so it is unaffected by that rewording.
    const withoutHandler = renderToStaticMarkup(
      <CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />,
    );
    expect(withoutHandler).not.toContain('show as table');
    const withHandler = renderToStaticMarkup(
      <CoolingPanel
        state={stateWith(withCooling(ch5Manual))}
        nowMs={0}
        panelId="cooling"
        onToggleView={() => undefined}
      />,
    );
    expect(withHandler).toContain('show as table');
  });
});
