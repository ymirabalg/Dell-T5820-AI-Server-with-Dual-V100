import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ch5EcAuto, ch5Manual, everythingZero, pwm5NodeAbsent } from '@/lib/fixtures';
import { rpm } from '@/lib/types';
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

describe('§6.1/§6.2 — COOLING', () => {
  test('subtitle names the exact channel', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={emptyState()} nowMs={0} panelId="cooling" />);
    expect(html).toContain('dell_smm · channel 5 = FAN_HDD (PCIe/GPU)');
  });

  test('fan 5 is the headline reading, banded by the absolute row', () => {
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(withCooling(ch5Manual))} nowMs={0} panelId="cooling" />);
    expect(html).toContain('4,308 RPM');
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
    const fan5Row = rowContaining(html, 'fan 5');
    expect(fan5Row).toContain('—');
    expect(fan5Row).not.toMatch(/class="_note/);
  });

  test('⚠ invariant 1 — fan5 reading 0 RPM alarms; fan5 reading null does not', () => {
    const dead = withCooling({ ...ch5Manual, fan5Rpm: rpm(0) });
    const unread = withCooling({ ...ch5Manual, fan5Rpm: null });
    const deadHtml = renderToStaticMarkup(<CoolingPanel state={stateWith(dead)} nowMs={0} panelId="cooling" />);
    const unreadHtml = renderToStaticMarkup(<CoolingPanel state={stateWith(unread)} nowMs={0} panelId="cooling" />);
    expect(deadHtml).toContain('0 RPM');
    // Scoped to the fan5 row itself — the panel HEAD derives its own chip from the same
    // underlying severity independently, so a whole-document check could not tell "the row
    // shows it" from "something else on the page happens to".
    expect(rowContaining(deadHtml, '0 RPM')).toContain('data-severity="alarm"');
    // ⚠ On the fan5 row's VALUE CELL, not the document. `expect(unreadHtml).toContain('—')` —
    // what this line used to say — is satisfied by `Chip`'s own no-band glyph beside the row,
    // whatever the value cell prints: under `?? rpm(0)` the panel rendered **`fan 5  0 RPM`**
    // and this test stayed green (10b-reconcile, adversarial F1a — the parent reproduced it).
    expect(valueCells(rowContaining(unreadHtml, 'fan 5'))).toEqual(['—']);
    expect(unreadHtml.slice(0, unreadHtml.indexOf('</header>'))).not.toContain('data-severity="alarm"');
  });

  test('⚠ invariant 1 on fan1–4 too — a 0 reading on fan2 alarms', () => {
    const dead = withCooling({ ...ch5Manual, fan2Rpm: rpm(0) });
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(dead)} nowMs={0} panelId="cooling" />);
    expect(html).toContain('0 RPM');
    expect(rowContaining(html, '0 RPM')).toContain('data-severity="alarm"');
  });

  test('⚠ invariant 1 on fan1–4 too — an UNREAD fan2 renders — and does NOT alarm', () => {
    // ⚠ The null side of the pair above, which did not exist: no fixture anywhere set a
    // `fanNRpm` to `null` with the rest of the snapshot present, so `?? rpm(0)` on fan 2 passed
    // all 105 tests in `components/panels` while rendering a FABRICATED RED ALARM on a chassis
    // fan whose tach simply could not be read (10b-reconcile, adversarial F1b). Every boundary
    // guard needs a fixture on both sides — this project's own structural rule.
    const unread = withCooling({ ...ch5Manual, fan2Rpm: null });
    const html = renderToStaticMarkup(<CoolingPanel state={stateWith(unread)} nowMs={0} panelId="cooling" />);
    const row = rowContaining(html, 'fan 2');
    expect(valueCells(row)).toEqual(['—']);
    expect(row).not.toContain('data-severity="alarm"');
    expect(row).toContain('data-severity="none"');
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
    expect(row).toContain('last read 6:12 ago');
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
    const row = rowContaining(html, 'fan 5');
    expect(row).toContain('last read 6:12 ago');
    expect(row).toContain('no hwmon named dell_smm');
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
    const row = rowContaining(html, 'fan 5');
    expect(row).toContain('LAST dell-smm problem');
    expect(row).not.toContain('FIRST dell-smm problem');
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
