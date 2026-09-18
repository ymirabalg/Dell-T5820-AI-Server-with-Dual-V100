/**
 * §6.2's SERVING card — one row per discovered `llama-server` instance: unit state dot, port,
 * model alias, context, `/health` result. **No token rates** (decision 13) — nothing here
 * reads or renders anything about generation speed.
 *
 * ### ⚠⚠ 12b — the row names the cards it spans (§6.2, ruled 2026-09-15)
 *
 * *"The SERVING panel shows one row per process, naming the cards it spans."* §3.4's `gpus`
 * is the reading, and its four shapes are four different renderings that must not be
 * collapsed: `[0]` → `GPU 0`, `[0, 1]` → `GPUs 0, 1`, `null` → `—` (the unit exists and its
 * `CUDA_VISIBLE_DEVICES` could not be read, with the `dbus` entry already beside it through
 * `errors[].instance`), and **absent** → nothing at all, because the key's absence means an
 * older SERVER rather than a failed reading, and such a server's rows must render exactly as
 * they did before this file changed.
 *
 * ⚠ **The mode is never inferred from the number of rows.** One row can equally mean one
 * card's service failed; the cards come from the arrays themselves and nowhere else.
 *
 * ### ⚠⚠ 12c — the identity is a STRING and the unit name is a MAPPING that can miss
 *
 * §6.4 fixed the join key as `llama-server@<i>.service`; §3.4's ruling of 2026-09-17 makes it
 * `lib/units.ts`'s `servingUnitName`, a mapping — `split` is served by `llama-split.service`,
 * not `llama-server@split.service`, and an identity the mapping does not know gets `null`.
 * This file reuses that function rather than building any name a second time, and it renders a
 * miss as the bare identity rather than inventing a unit that does not exist. The loud half —
 * one `errors[]` entry per poll naming the instance — is `collectServing`'s, and it arrives on
 * this row through `errors[].instance` like every other per-instance entry.
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
import { errorsForPanel, servedCards } from '@/lib/client/observations';
import { latestSample } from '@/lib/client/runtime';
import { formatModelName, formatPort, formatText, formatTokens } from '@/lib/format';
import { severityHealth, severityUnitState, worstSeverity } from '@/lib/severity';
import type { ServingInstance, TelemetryError, TelemetrySnapshot } from '@/lib/types';
import { servingUnitLabel, servingUnitName } from '@/lib/units';

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
 * `instance` as the same non-null identity on both sides — ⚠ a **string** since 12c — so this
 * is an equality check and nothing else: no message text is read, so a collector rewording a message cannot
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
  // ⚠ 12b — §3.4's four shapes, as one string or none. `null` here means the key is ABSENT
  // (an older server), which renders nothing; a `gpus` that is `null` renders an em dash,
  // and those are two different facts (§3.4 forbids collapsing them).
  const cards = servedCards(instance.gpus);

  // ⚠⚠ 12c — `servingUnitName` MISSES for an identity it cannot map, and a miss has no `unit:`
  // condition at all (`observations.ts` does not push one). `findDisplayed` is not asked for
  // one in that case; asking with a fabricated id would quietly find nothing and look the same
  // as a healthy unit, which is the silence this whole mapping exists to break.
  const unit = servingUnitName(instance.instance);
  const unitCondition = unit === null ? undefined : findDisplayed(displayed, conditionId('unit', unit));
  const healthCondition = findDisplayed(displayed, conditionId('health', instance.instance));
  const age = staleAgeNote(unitCondition, nowMs) ?? staleAgeNote(healthCondition, nowMs);

  return (
    <StatusRow
      panel="serving"
      key={instance.instance}
      // ⚠⚠ 12c — the LABEL is the unit name without `.service` (`lib/units.ts`'s
      // `servingUnitLabel`), so `0` still reads `llama-server@0` and `split` reads
      // `llama-split` — the unit that actually serves it. An identity with no unit name
      // renders BARE rather than as `llama-server@<id>`: 12b's survey named the alternative's
      // cost exactly, *"four operator-facing strings would NAME A UNIT THAT DOES NOT EXIST"*.
      label={servingUnitLabel(instance.instance)}
      // ⚠⚠ 12b — §6.2: *"The SERVING panel shows one row per process, naming the cards it
      // spans."* The cards go in `secondaryLabel`, beside the port, because both answer
      // *where is this process* — identity, not measurement — and because that slot wraps
      // with the row rather than forcing a line of its own (10e §2.7).
      //
      // ⚠ On a server that does not publish `gpus`, `servedCards` returns `null` and this is
      // the string it has always been. That is what keeps the running box's rows
      // byte-identical across a client-only deploy.
      secondaryLabel={cards === null ? `:${formatPort(instance.port)}` : `:${formatPort(instance.port)} · ${cards}`}
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
