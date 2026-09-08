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
 * the owner's ruling (10b-S-G). The first draft read `servingErrors[0]?.message` once and hung
 * it on **every** row: rendered from the shipped `servingPopulated` fixture, the healthy
 * `llama-server@0` carried `connect ECONNREFUSED 127.0.0.1:8081` — instance 1's port, beside
 * instance 0's `health ok` row. §6.5 is explicit that *"an `llama-server` instance is down →
 * **its** row shows the unit state and the reason; the other instance is unaffected"*, and
 * §3.7's whole point is that an alarm carries the explanation that fits it.
 *
 * The second draft (10b's reconciliation) fixed the symptom by matching the message text for
 * a unit name, an `<i>.env` path or a port — honest, tested, and a heuristic: a collector
 * rewording a message mis-attributes it silently, because a substring match cannot fail
 * loudly. **`TelemetryError` now carries an optional `instance` (§4), and this file matches on
 * that field alone** — an entry belongs to instance `i` when `error.instance === i`, full
 * stop. Nothing about the message is read to decide attribution any more; the message is only
 * ever displayed. An entry with no `instance` (most sources, and any old server that predates
 * this field) is collector-wide and renders once under the rows via {@link PanelNotes}, on the
 * same terms as before.
 *
 * ⚠ **"Nothing is dropped" is true ACROSS sources and false WITHIN one** — corrected
 * 2026-09-08 by this ruling's reconciliation (adversarial A3), because the sentence that used
 * to stand here claimed otherwise and a reader would have concluded the case was closed.
 * {@link errorFor} folds by `source`, so two entries with the same `source` **and** the same
 * `instance` collapse to the last: `readEnv` files one entry per parse problem, so a `1.env`
 * missing `MODEL` *and* carrying an unparseable `CTX` yields two `llama-env` entries for
 * instance 1 and only the second is rendered — on the row or anywhere else, since the first
 * also matched an instance and so is excluded from `unattributed`. Whether the row should
 * join them (as it already joins across sources) is a §6.5 question the spec does not answer;
 * it is recorded for the owner rather than decided here. What is fixed is the claim.
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
  // ⚠ The LAST message PER SOURCE that names this instance. A panel that showed the first (or
  // only one of two sources) would print a different sentence for the same fault in the same
  // session (adversarial F10). Both sources survive: a `dbus` "NoSuchUnit" and the
  // `llama-health` probe failure explain different halves of one dead instance, and dropping
  // either is what §3.7 calls not actionable. ⚠ Two entries from the SAME source about the
  // same instance still collapse to the last — see this module's doc; that is the known
  // limit of this fold, not something the fold's justification covers.
  //
  // ⚠ The `events.ts:400` citation this comment used to lean on is only HALF true since
  // 10b-S-G (adversarial A10, corrected 2026-09-08). That fold is last-per-source across
  // **all** instances; this one is last-per-source **per instance**. With instance 0 and
  // instance 1 both failing their `/health` probe, the log's single `llama-health` sentence
  // is instance 1's (array order) while row 0 shows instance 0's — so the log and this panel
  // now legitimately differ, which is the outcome the citation was invoked to rule out.
  // Whether the session log should itself be per-instance is 10c's question; the reason the
  // fold reads LAST rather than FIRST is unaffected either way.
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
