/**
 * §6.2's SERVING card — one row per discovered `llama-server` instance: unit state dot, port,
 * model alias, context, `/health` result. **No token rates** (decision 13) — nothing here
 * reads or renders anything about generation speed.
 *
 * §6.4 fixes the join key between an instance and its unit as `llama-server@<i>.service`
 * (`lib/units.ts`'s `servingUnitName`), derived from the index rather than matched by string —
 * this file reuses that function rather than building the name a second time.
 *
 * Instances are compacted into ONE row each rather than a separate row per fact, matching
 * §6.2's own phrasing ("one row per discovered instance") and this panel's "compact list"
 * sibling, SAFETY. The row's own chip is the worse of the unit's state and its `/health` —
 * both are §6.3 rows, and neither may be silently dropped in favour of the other, so
 * {@link worstSeverity} is what §9's own dedupe uses for the same reason.
 *
 * `serving: null` ("which instances exist is unknown" — not derivable from an empty
 * `/etc/llama-server/`) and `serving: []` (enumerated, and there is nothing there) are both
 * rendered as one explanatory line rather than a table with no rows, since neither is this
 * panel's fault to explain away silently.
 *
 * ### ⚠ An `errors[]` entry reaches a row only when it NAMES that instance
 *
 * Added 2026-09-08 by 10b's reconciliation (adversarial F2). The first draft read
 * `servingErrors[0]?.message` once and hung it on **every** row: rendered from the shipped
 * `servingPopulated` fixture, the healthy `llama-server@0` carried
 * `connect ECONNREFUSED 127.0.0.1:8081` — instance 1's port, beside instance 0's `health ok`
 * row — and with a `dbus` entry first, both rows named instance 1 while the `llama-health`
 * message that actually explained instance 1 was never rendered at all. §6.5 is explicit that
 * *"an `llama-server` instance is down → **its** row shows the unit state and the reason; the
 * other instance is unaffected"*, and §3.7's whole point is that an alarm carries the
 * explanation that fits it.
 *
 * `errors[]` carries a `source`, not a subject (§4), so the attribution is derived from the
 * identity **this panel already holds**: an entry belongs to instance `i` when its message
 * names `llama-server@i` (D-Bus's own unit name, from `lib/units.ts` — not spelled a second
 * time here), that instance's `<i>.env` file, or its port. Nothing else is guessed: an entry
 * naming no instance is collector-wide (*"`/etc/llama-server`: EACCES"*) and renders once under
 * the rows via {@link PanelNotes}, and an entry naming a DIFFERENT instance never appears on
 * this row. Nothing is dropped, which the old `errors[0]` also did to every entry after the
 * first.
 *
 * ⚠ **Recorded for the owner, invariant 7**: matching on the message text is the finest join
 * §4 offers, and it is a heuristic. The clean fix is a subject on the wire — an optional
 * `instance` on a `TelemetryError` — which is a §4 change and not this loop's.
 */

import type { DisplayedCondition } from '@/lib/conditions';
import { conditionId } from '@/lib/conditions';
import { errorsForPanel } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatPort, formatText, formatTokens } from '@/lib/format';
import { severityHealth, severityUnitState, worstSeverity } from '@/lib/severity';
import type { ServingInstance, TelemetryError, TelemetrySnapshot } from '@/lib/types';
import { servingUnitName } from '@/lib/units';

import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { findDisplayed, staleAgeNote } from './condition-lookup';
import { PanelNotes } from './panel-notes';
import { StatusRow } from './status-row';

import styles from './serving-panel.module.css';

/**
 * Whether one `errors[]` entry is about this instance. Three spellings, each of which the
 * collectors actually emit: the D-Bus unit name (`collectServing` reads
 * `llama-server@1.service`), the env file the instance was discovered from
 * (`/etc/llama-server/1.env`), and the probe URL's port (`connect ECONNREFUSED
 * 127.0.0.1:8081`). An entry matching none of them names no instance.
 */
const namesInstance = (error: TelemetryError, instance: ServingInstance): boolean => {
  const message = error.message;
  if (message.includes(servingUnitName(instance.instance))) return true;
  if (message.includes(`/${String(instance.instance)}.env`)) return true;
  return instance.port !== null && message.includes(`:${String(instance.port)}`);
};

const instanceRow = (
  instance: ServingInstance,
  displayed: readonly DisplayedCondition[],
  nowMs: number,
  errorMessage: string | null,
) => {
  const unitSeverity = severityUnitState(instance.unitState);
  const healthSeverity = severityHealth(instance.health);
  const severity = worstSeverity(unitSeverity, healthSeverity);

  const unitCondition = findDisplayed(displayed, conditionId('unit', servingUnitName(instance.instance)));
  const healthCondition = findDisplayed(displayed, conditionId('health', String(instance.instance)));
  const age = staleAgeNote(unitCondition, nowMs) ?? staleAgeNote(healthCondition, nowMs);

  const value = [
    `:${formatPort(instance.port)}`,
    formatText(instance.model),
    `ctx ${formatTokens(instance.ctx)}`,
    `health ${formatText(instance.health)}`,
  ].join(' · ');

  return (
    <StatusRow
      key={instance.instance}
      label={`llama-server@${instance.instance}`}
      value={value}
      severity={severity}
      note={age}
      noteTone={age === null ? 'muted' : 'watch'}
      detail={errorMessage}
    />
  );
};

export function ServingPanel({ state, nowMs }: PanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const instances = snapshot?.serving ?? null;

  const chip =
    instances === null || instances.length === 0
      ? null
      : worstSeverity(
          ...instances.flatMap((i) => [severityUnitState(i.unitState), severityHealth(i.health)]),
        );

  const servingErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'serving');
  // ⚠ The LAST message PER SOURCE that names this instance — `events.ts:400` folds `errors[]`
  // into a `Map` keyed by source and so shows the last per source, and a panel that showed the
  // first (or only one of two sources) would print a different sentence for the same fault in
  // the same session (adversarial F10). Both facts survive: a `dbus` "NoSuchUnit" and the
  // `llama-health` probe failure explain different halves of one dead instance, and dropping
  // either is what §3.7 calls not actionable.
  const errorFor = (instance: ServingInstance): string | null => {
    const bySource = new Map<string, string>();
    for (const e of servingErrors) if (namesInstance(e, instance)) bySource.set(e.source, e.message);
    return bySource.size === 0 ? null : [...bySource.values()].join(' · ');
  };
  const unattributed = servingErrors.filter(
    (e) => !(instances ?? []).some((instance) => namesInstance(e, instance)),
  );

  return (
    <PanelShell title="serving" subtitle="llama-server instances" chip={chip}>
      {instances === null || instances.length === 0 ? (
        <div>
          <p className={styles.empty}>
            {instances === null ? 'serving instances unknown' : 'no llama-server instances discovered'}
          </p>
          {servingErrors.map((e) => (
            <p key={`${e.source}:${e.message}`} className={styles.emptyNote}>
              {e.message}
            </p>
          ))}
        </div>
      ) : (
        <>
          {instances.map((instance) =>
            instanceRow(instance, state.displayed, nowMs, errorFor(instance)),
          )}
          <PanelNotes messages={unattributed} />
        </>
      )}
    </PanelShell>
  );
}
