/**
 * §6.2's SAFETY card — §3.6's four checks as a compact list. *"This is the panel that earns
 * the dashboard's existence, so it does not get hidden behind a tab."*
 *
 * ⚠ **Each row carries its `errors[]` explanation beside it, from `errorsForPanel`, never copy
 * written here** (§3.7: "an alarm with no explanation beside it is not actionable"). The DKMS
 * row's explanation is where the running kernel release actually appears — the collector bakes
 * it into the message text (`lib/collectors/safety.ts`'s `checkDkms`), so this file only has to
 * show the message, never re-derive or restate the release itself.
 *
 * ⚠ **A stale row uses S-B's exact words**, `--status-watch` not `--status-alarm`
 * (`condition-lookup.ts`). Structurally this can only fire on the fan-service row: `ufw
 * enforcing`, `pwm5 present` and `DKMS for running kernel` all call TOTAL §6.3 functions
 * (`severityUfw`, `severityPwm5Present`, `severityDkms`) that never return `null`, so
 * `conditionsFrom` observes them on every successful poll and `observePoll` can never confirm
 * them absent long enough to go stale — see `condition-lookup.ts`'s module doc for the full
 * argument. The lookup is still run for all four, uniformly, because it costs nothing on the
 * three that can never fire it and it is the one thing standing between a silent blank and an
 * honest "could not check" if that ever stops being true.
 *
 * ⚠ **D3 — `unknownStanding` renders here, per the decision already recorded in `HANDOVER.md`
 * §3.6.** Each malformed `STANDING` entry gets its own row, worded as a configuration defect
 * rather than a machine reading, with `severity={null}` — the EXPLICIT no-band state (O12: "do
 * not invent a band") — so it reads as visually distinct from the four checks above it without
 * claiming a colour §6.3 never assigned it, and it is **not** folded into this panel's own chip
 * or into §9's dot/count, exactly as the decision requires.
 */

import { errorsForPanel } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatText } from '@/lib/format';
import { severityDkms, severityPwm5Present, severityUfw, severityUnitState } from '@/lib/severity';
import type { Safety, TelemetrySnapshot } from '@/lib/types';
import { FAN_SERVICE_UNIT } from '@/lib/units';
import { conditionId } from '@/lib/conditions';

import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { Chip } from '../chip';
import { findDisplayed, staleAgeNote, staleValueOr } from './condition-lookup';
import { panelChip } from './panel-chip';
import { StatusRow } from './status-row';

import styles from './safety-panel.module.css';

/** §6.3's three-valued checks render `yes` / `no` / `—`, never `true` / `false`. */
const yesNo = (value: boolean | null): string => (value === null ? formatText(null) : value ? 'yes' : 'no');

export function SafetyPanel({ state, nowMs }: PanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const safety: Safety | null = snapshot?.safety ?? null;

  const ufwSeverity = severityUfw(safety?.ufwEnforcing ?? null);
  const pwm5Severity = severityPwm5Present(safety?.pwm5Present ?? null);
  const dkmsSeverity = severityDkms(safety?.dkmsForRunningKernel ?? null);
  const fanServiceSeverity = severityUnitState(safety?.fanServiceState ?? null);
  // ⚠ 10b-S-F: `ufwSeverity`/`pwm5Severity`/`dkmsSeverity` are TOTAL (§6.3 puts `null` in
  // their own watch column, so they never contribute a `null` here) — `fanServiceSeverity` is
  // the one leaf that can, when `fanServiceState` is unreadable. `panelChip` downgrades a
  // resulting `normal` to no band in exactly that case; it leaves `watch`/`alarm` untouched.
  const chip = panelChip(ufwSeverity, pwm5Severity, dkmsSeverity, fanServiceSeverity);

  const safetyErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'safety');
  // ⚠ LAST, not first — `lib/client/events.ts:400` keys a `Map` by source, so the log shows the
  // last message a source filed. A panel reading the first shows a different sentence for the
  // same fault in the same session (10b-reconcile, adversarial F10).
  // ⚠ 10b-S-G's reconciliation (adversarial A2): an entry carrying an `instance` (§3.7)
  // names one `llama-server` instance, and this panel has no row for that subject — `dbus`
  // reaches all three of COOLING/SERVING/SAFETY, so without this the `fan service` row
  // prints `llama-server@1.service: NoSuchUnit` beside a healthy `gpu-fan-control.service`.
  // Nothing is lost: SERVING renders it on the row it names. A `dbus` entry with NO
  // instance still lands here — bus-wide and `collectSafety`'s per-unit failure are not yet
  // distinguishable (A8, recorded as open).
  const messageFor = (source: string): string | null =>
    safetyErrors.findLast((e) => e.source === source && e.instance === undefined)?.message ?? null;

  const fanServiceCondition = findDisplayed(state.displayed, conditionId('unit', FAN_SERVICE_UNIT));
  const fanServiceAge = staleAgeNote(fanServiceCondition, nowMs);

  return (
    <PanelShell title="safety" subtitle="ufw · pwm5 · dkms · fan service" chip={chip}>
      <StatusRow
        label="ufw enforcing"
        value={yesNo(safety?.ufwEnforcing ?? null)}
        severity={ufwSeverity}
        note={staleAgeNote(findDisplayed(state.displayed, 'ufw_enforcing'), nowMs)}
        noteTone={staleAgeNote(findDisplayed(state.displayed, 'ufw_enforcing'), nowMs) === null ? 'muted' : 'watch'}
        detail={messageFor('ufw')}
      />
      <StatusRow
        label="pwm5 present"
        value={yesNo(safety?.pwm5Present ?? null)}
        severity={pwm5Severity}
        note={staleAgeNote(findDisplayed(state.displayed, 'pwm5_present'), nowMs)}
        noteTone={staleAgeNote(findDisplayed(state.displayed, 'pwm5_present'), nowMs) === null ? 'muted' : 'watch'}
        detail={messageFor('dell-smm')}
      />
      <StatusRow
        label="DKMS for running kernel"
        value={yesNo(safety?.dkmsForRunningKernel ?? null)}
        severity={dkmsSeverity}
        note={staleAgeNote(findDisplayed(state.displayed, 'dkms_for_running_kernel'), nowMs)}
        noteTone={
          staleAgeNote(findDisplayed(state.displayed, 'dkms_for_running_kernel'), nowMs) === null
            ? 'muted'
            : 'watch'
        }
        detail={messageFor('dkms')}
      />
      <StatusRow
        label="fan service"
        value={staleValueOr(fanServiceCondition, formatText(safety?.fanServiceState ?? null))}
        severity={fanServiceSeverity}
        note={fanServiceAge}
        noteTone={fanServiceAge === null ? 'muted' : 'watch'}
        detail={messageFor('dbus')}
      />
      {state.unknownStanding.length === 0 ? null : (
        <div className={styles.unknownStanding}>
          {state.unknownStanding.map((id) => (
            <div key={id} className={styles.unknownRow}>
              <Chip severity={null} size="sm" />
              <span className={styles.unknownLabel}>unknown STANDING entry</span>
              <span className={styles.unknownValue}>{id}</span>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
