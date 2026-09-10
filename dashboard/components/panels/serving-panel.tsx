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
 * ### An `errors[]` entry reaches a row only when it NAMES that instance
 *
 * Added 2026-09-08 by 10b's reconciliation (adversarial F2); made structural the same day by
 * the owner's ruling (10b-S-G). `TelemetryError` carries an optional `instance` (§4), and this
 * file matches on that field alone — an entry belongs to instance `i` when
 * `error.instance === i`, full stop. Nothing about the message is read to decide attribution;
 * the message is only ever displayed. An entry with no `instance` is collector-wide and
 * renders once under the rows via {@link PanelNotes}.
 *
 * ⚠ **"Nothing is dropped" is true ACROSS sources and false WITHIN one.** {@link errorFor} folds
 * by `source`, so two entries with the same `source` **and** the same `instance` collapse to
 * the last: `readEnv` files one entry per parse problem, so a `1.env` missing `MODEL` *and*
 * carrying an unparseable `CTX` yields two `llama-env` entries for instance 1 and only the
 * second is rendered. Whether the row should join them (as it already joins across sources) is
 * a §6.5 question the spec does not answer; it is recorded for the owner rather than decided
 * here.
 *
 * ### 10e §2.7 — the composite value becomes three separate `StatusRow` slots
 *
 * F5 found that `:${port} · ${model} · ctx ${ctx} · health ${health}` as ONE hand-joined
 * string could neither shrink nor wrap in a narrow column. It is now three pieces, none of
 * them forced onto their own line: `secondaryLabel` (the port, right after the unit-name
 * label), `inline` (`model · ctx`, wraps naturally with the row), and `endPrefix` (`health
 * …`, ahead of the unit-state pill inside `.end`) — the three slots `status-row.tsx` built
 * for exactly this row. `note`/`detail` are UNCHANGED: S-B's stale age and the S-G-attributed
 * `errors[]` message still force their own full-width line.
 */

import type { DisplayedCondition } from '@/lib/conditions';
import { conditionId } from '@/lib/conditions';
import { errorsForPanel } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatModelName, formatPort, formatText, formatTokens } from '@/lib/format';
import { severityHealth, severityUnitState, worstSeverity } from '@/lib/severity';
import type { ServingInstance, TelemetryError, TelemetrySnapshot } from '@/lib/types';
import { servingUnitName } from '@/lib/units';

import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { findDisplayed, staleAgeNote } from './condition-lookup';
import { PanelNotes } from './panel-notes';
import { panelChip } from './panel-chip';
import { StatusRow } from './status-row';

import styles from './serving-panel.module.css';

/**
 * Whether one `errors[]` entry is about this instance (10b-S-G) — the STRUCTURAL join,
 * comparing `TelemetryError.instance` to `ServingInstance.instance` directly. §4 fixes
 * `instance` as the same non-null integer identity on both sides, so this is an equality
 * check and nothing else: no message text is read, so a collector rewording a message cannot
 * silently move it to the wrong row or drop it to none.
 */
const namesInstance = (error: TelemetryError, instance: ServingInstance): boolean =>
  error.instance === instance.instance;

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

  return (
    <StatusRow
      panel="serving"
      key={instance.instance}
      label={`llama-server@${instance.instance}`}
      secondaryLabel={`:${formatPort(instance.port)}`}
      // ⚠ 10h/§3.4 — the model renders as its FILENAME (ruled 2026-09-10), with the raw value
      // in the row's `title`. Measured cost of the path form: +21 px per row, on the panel
      // that sets §6.1's row 4 whenever a third instance exists.
      inline={`${formatModelName(instance.model)} · ctx ${formatTokens(instance.ctx)}`}
      inlineTitle={instance.model}
      endPrefix={`health ${formatText(instance.health)}`}
      value={formatText(instance.unitState)}
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

  // ⚠ 10b-S-F: `panelChip`, not `worstSeverity` — each instance already contributes its
  // `unitState`/`health` as two separate leaves via `flatMap`, so a panel that would read
  // `normal` while one instance's `health` (say) is unreadable shows no band instead. The
  // per-row severity below (`instanceRow`'s own `worstSeverity` call) is untouched: the ruling
  // is about the panel HEAD, not a row's own colour.
  const chip =
    instances === null || instances.length === 0
      ? null
      : panelChip(
          ...instances.flatMap((i) => [severityUnitState(i.unitState), severityHealth(i.health)]),
        );

  const servingErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'serving');
  // ⚠ The LAST message PER SOURCE that names this instance — see the module doc.
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
          {/* ⚠ 10f/Q1 — this was a second, bespoke copy of `PanelNotes` (`.emptyNote`) and so a
              second UNBOUNDED `errors[]` block: with `serving: null` and several `llama-env`
              entries this branch grew row 4 without limit. Rendered through the one primitive
              that owns the bounded well. `roomy` is free here — the SESSION EVENT LOG sets row
              4 at 129.8 px and this takeover body is well under it. */}
          <PanelNotes subject="serving" bound="roomy" messages={servingErrors} />
        </div>
      ) : (
        <>
          <div className={styles.rows}>
            {instances.map((instance) =>
              instanceRow(instance, state.displayed, nowMs, errorFor(instance)),
            )}
          </div>
          <PanelNotes subject="serving" messages={unattributed} />
        </>
      )}
    </PanelShell>
  );
}
