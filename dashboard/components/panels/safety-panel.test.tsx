import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { everythingZero, pwm5NodeAbsent, pwm5Unreadable } from '@/lib/fixtures';
import type { TelemetrySnapshot } from '@/lib/types';

import { SafetyPanel } from './safety-panel';
import { displayedConditionOf, emptyState, stateWith } from './test-support';

/** The full markup of the row/div containing `needle`, chip included (the chip precedes the
 *  label in DOM order, so slicing forward from the label text alone would miss it). */
const rowContaining = (html: string, needle: string): string => {
  const at = html.indexOf(needle);
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('</div>', at);
  return html.slice(start, end);
};

/**
 * §3.6/§6.2 — *"the panel that earns the dashboard's existence."* Every trap named for it:
 * each row's own `errors[]` explanation, S-B's exact stale wording, and D3's `unknownStanding`
 * rows rendered but kept out of the panel's own chip.
 */

describe('§6.2 — SAFETY: the four checks', () => {
  test('subtitle names all four checks', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={emptyState()} nowMs={0} panelId="safety" />);
    expect(html).toContain('ufw');
    expect(html).toContain('pwm5');
    expect(html).toContain('dkms');
    expect(html).toContain('fan service');
  });

  test('a healthy box renders yes/yes/yes and the fan service state', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(everythingZero)} nowMs={0} panelId="safety" />);
    expect(html).toContain('ufw enforcing');
    expect(html).toContain('>no<'); // everythingZero.safety.ufwEnforcing is false
    expect(html).toContain('pwm5 present');
    expect(html).toContain('DKMS for running kernel');
    expect(html).toContain('active');
  });

  test('⚠ booleans render yes/no, never true/false', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(everythingZero)} nowMs={0} panelId="safety" />);
    // Scoped to the VALUE cells, not the whole document — `aria-hidden="true"` is legitimate
    // markup on every chip glyph and has nothing to do with how a boolean READING renders.
    expect(rowContaining(html, 'ufw enforcing')).not.toMatch(/class="[^"]*value[^"]*">(?:true|false)</);
    expect(rowContaining(html, 'pwm5 present')).not.toMatch(/class="[^"]*value[^"]*">(?:true|false)</);
    expect(rowContaining(html, 'DKMS for running kernel')).not.toMatch(
      /class="[^"]*value[^"]*">(?:true|false)</,
    );
  });

  test('§6.3 — pwm5Present: false is the ALARM, and it carries its own errors[] explanation', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(pwm5NodeAbsent)} nowMs={0} panelId="safety" />);
    expect(html).toContain('data-severity="alarm"');
    expect(html).toContain('no pwm5 on hwmon dell_smm');
  });

  test('⚠ pwm5Present: null (could not check) is WATCH, never the alarm', () => {
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      safety: { ...everythingZero.safety, pwm5Present: null },
    };
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(snapshot)} nowMs={0} panelId="safety" />);
    expect(rowContaining(html, 'pwm5 present')).toContain('data-severity="watch"');
  });

  // Not ⚠: `severityPwm5Present` depends only on the boolean itself, never on `ch5Mode` — this
  // panel has no ch5Mode-dependent logic for the pwm5 row to get wrong, so there is no
  // plausible PANEL-level implementation that would fail this and pass the mark-2 mutation
  // above. Kept as a documentation/regression test rather than a ledger obligation (HANDOVER
  // §5.2 rule 1: "the property has no plausible wrong implementation … drop the ⚠").
  test('pwm5Present: true with ch5Mode unreadable (EACCES) is NOT the alarm', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(pwm5Unreadable)} nowMs={0} panelId="safety" />);
    expect(rowContaining(html, 'pwm5 present')).not.toContain('data-severity="alarm"');
  });

  test('the DKMS row shows the collector’s own errors[] message, which names the running kernel', () => {
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      safety: { ...everythingZero.safety, dkmsForRunningKernel: false },
      errors: [
        { source: 'dkms', message: '/lib/modules/7.0.0-30-generic/updates/dkms: does not exist — DKMS has not built the 5-fan module for `7.0.0-30-generic`, so the next boot loses `pwm5`' },
      ],
    };
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(snapshot)} nowMs={0} panelId="safety" />);
    expect(html).toContain('7.0.0-30-generic');
  });
});

describe('D3 — unknownStanding', () => {
  test('renders one row per malformed STANDING entry, worded as a configuration defect', () => {
    const html = renderToStaticMarkup(
      <SafetyPanel state={stateWith(everythingZero, { unknownStanding: ['gpu_fan_speed'] })} nowMs={0} panelId="safety" />,
    );
    expect(html).toContain('unknown STANDING entry');
    expect(html).toContain('gpu_fan_speed');
  });

  test('⚠ O12 — the unknownStanding row carries the explicit no-band chip, never a colour', () => {
    const html = renderToStaticMarkup(
      <SafetyPanel state={stateWith(everythingZero, { unknownStanding: ['ufw_enforcing:yes'] })} nowMs={0} panelId="safety" />,
    );
    const row = rowContaining(html, 'unknown STANDING entry');
    expect(row).toContain('data-severity="none"');
    expect(row).not.toContain('data-severity="alarm"');
    expect(row).not.toContain('data-severity="watch"');
  });

  test('an empty unknownStanding renders no such section at all', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(everythingZero)} nowMs={0} panelId="safety" />);
    expect(html).not.toContain('unknown STANDING entry');
  });
});

describe('⚠ S-B — a stale row uses the exact banner wording, watch-toned', () => {
  test('⚠ the fan service row, the one check that can structurally go stale', () => {
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
    const state = stateWith(everythingZero, { displayed });
    const html = renderToStaticMarkup(<SafetyPanel state={state} nowMs={372_000} panelId="safety" />);
    expect(html).toContain('last read 6:12 ago');
  });
});

describe('before the first poll', () => {
  test('every row renders — rather than throwing, and the three total checks read watch', () => {
    const html = renderToStaticMarkup(<SafetyPanel state={emptyState()} nowMs={0} panelId="safety" />);
    expect(html).toContain('—');
    expect(html).toContain('data-severity="watch"');
  });
});

describe('⚠ §6.5 — a stale SAFETY row shows BOTH facts, and its last value', () => {
  test('⚠ the stale age does not displace the errors[] explanation', () => {
    // `note={age ?? messageFor('dbus')}` dropped the cause exactly when there was one
    // (10b-reconcile, adversarial F3). SAFETY is the panel §6.2 calls the one that earns this
    // dashboard's existence, and *"an alarm with no explanation beside it is not actionable"*.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      safety: { ...everythingZero.safety, fanServiceState: null },
      errors: [{ source: 'dbus', message: 'D-Bus: connection refused' }],
    };
    const displayed = [
      displayedConditionOf({
        kind: 'unit',
        subject: 'gpu-fan-control.service',
        id: 'unit:gpu-fan-control.service',
        label: 'gpu-fan-control.service',
        value: 'active',
        stale: true,
        lastSeenMs: 0,
      }),
    ];
    const html = renderToStaticMarkup(
      <SafetyPanel state={stateWith(snapshot, { displayed })} nowMs={372_000} panelId="safety" />,
    );
    // ⚠ Search the BODY, not the document: this panel's subtitle is `ufw · pwm5 · dkms · fan
    // service`, so `indexOf('fan service')` lands in the head and `rowContaining` would return
    // the header instead of the row. Same family as the finding this test exists for.
    const body = html.slice(html.indexOf('</header>'));
    const row = rowContaining(body, 'fan service');
    expect(row).toContain('last read 6:12 ago');
    expect(row).toContain('D-Bus: connection refused');
    // §6.5's other half: the last confirmed value stands rather than blanking to an em dash.
    expect(row).toContain('active');
  });

  test('⚠ 10b-S-G — a dbus entry naming an llama-server instance never explains the fan-service row', () => {
    // SAFETY's `fan service` row is `gpu-fan-control.service` and nothing else. `dbus` reaches
    // this panel, SERVING and COOLING alike, so before this filter the entry `collectServing`
    // files when systemd has no record of `llama-server@1.service` was printed here, beside a
    // healthy `active` value — an explanation attached to a row it is not about, which is F2
    // exactly, in the panel §6.2 calls the one that earns this dashboard's existence
    // (adversarial A2). SERVING still renders it, on the row it names.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      errors: [
        {
          source: 'dbus',
          message: 'llama-server@1.service: NoSuchUnit: systemd has no record',
          instance: 1,
        },
      ],
    };
    const html = renderToStaticMarkup(<SafetyPanel state={stateWith(snapshot)} nowMs={0} panelId="safety" />);
    expect(html).not.toContain('llama-server@1.service');
  });
});
