/**
 * §6.4's event log, driven end to end through O11's one projection.
 *
 * Nothing here builds a `DisplayedCondition` by hand: every fixture is a snapshot, run through
 * `conditionsFrom` and `observePoll`, so what is tested is the log the dashboard would actually
 * show rather than a shape `observePoll` never produces.
 */

import { describe, expect, test } from 'vitest';

import type { ConditionState } from '../conditions';
import { EMPTY_CONDITION_STATE, observePoll, standingIdsFrom } from '../conditions';
import type { StandingIds } from '../conditions';
import { everythingZero, nothingReadable } from '../fixtures';
import { celsius } from '../types';
import type { TelemetryError, TelemetrySnapshot, UnitState } from '../types';
import { MAX_EVENTS, observeEvents, observeStaleness, startEventLog } from './events';
import type { EventState, LogEntry } from './events';
import { conditionsFrom, enumerationsRead } from './observations';

/** One session: the condition state and the log, stepped by (snapshot, wall clock). */
class Session {
  conditions: ConditionState = EMPTY_CONDITION_STATE;
  events: EventState;

  constructor(
    startedAtMs = 0,
    private readonly standing: StandingIds = standingIdsFrom([]),
  ) {
    this.events = startEventLog(startedAtMs);
  }

  poll(snapshot: TelemetrySnapshot, nowMs: number, afterGap = false): readonly LogEntry[] {
    const before = this.events.entries;
    const result = observePoll(this.conditions, conditionsFrom(snapshot), this.standing, nowMs, {
      enumerationsRead: enumerationsRead(snapshot),
      afterGap,
    });
    this.conditions = result.state;
    this.events = observeEvents(this.events, result, snapshot.errors, nowMs, afterGap);
    return this.events.entries.slice(0, this.events.entries.length - before.length);
  }
}

const withGpuTemp = (tempC: number): TelemetrySnapshot => {
  const card = everythingZero.gpus?.[0];
  if (card === undefined) throw new Error('the everythingZero fixture lost its GPU');
  return { ...everythingZero, gpus: [{ ...card, tempC: celsius(tempC) }] };
};

const withFanService = (state: UnitState): TelemetrySnapshot => ({
  ...everythingZero,
  cooling: { ...everythingZero.cooling, serviceState: state },
  safety: { ...everythingZero.safety, fanServiceState: state },
});

const withErrors = (errors: readonly TelemetryError[]): TelemetrySnapshot => ({
  ...everythingZero,
  errors,
});

describe('the session opens with one line', () => {
  test('⚠ §6.4’s log starts with page loaded, so an empty log is not an ambiguous one', () => {
    const state = startEventLog(1234);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ seq: 0, atMs: 1234, source: 'session', kind: 'page-loaded' });
  });

  test('⚠ the cap is 500 entries', () => {
    expect(MAX_EVENTS).toBe(500);
  });
});

describe('⚠ §6.4: a band must hold ten seconds of wall time before it logs', () => {
  /*
   * ⚠ 69 °C is normal and 70 °C is watch (§6.3). The transition is logged only once the new
   * band has held for ten seconds — "not for a number of polls", so the fixture polls three
   * times inside the window and once outside it.
   */
  test('⚠ a band that has not held for ten seconds logs nothing', () => {
    const session = new Session();
    session.poll(withGpuTemp(69), 0);
    expect(session.poll(withGpuTemp(70), 1_000)).toEqual([]);
    expect(session.poll(withGpuTemp(70), 5_000)).toEqual([]);
    expect(session.poll(withGpuTemp(70), 9_999)).toEqual([]);
  });

  test('⚠ the same band at ten seconds exactly logs the transition', () => {
    const session = new Session();
    session.poll(withGpuTemp(69), 0);
    session.poll(withGpuTemp(70), 1_000);
    const logged = session.poll(withGpuTemp(70), 11_000);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      source: 'gpu 0',
      label: 'GPU 0 temperature',
      severity: 'watch',
      from: 'normal',
      to: 'watch',
      detail: '70 °C',
    });
  });

  /*
   * ⚠ §6.4's own reason for the debounce: "a 79→80→79 flicker stays quiet". The fixture is
   * exactly that flicker at the alarm knee, and the assertion is that the whole session
   * produces no entry at all.
   */
  test('⚠ a 79 → 80 → 79 flicker at the knee never reaches the log', () => {
    const session = new Session();
    session.poll(withGpuTemp(79), 0);
    for (let i = 1; i <= 20; i += 1) {
      const logged = session.poll(withGpuTemp(i % 2 === 0 ? 79 : 80), i * 1_000);
      expect(logged).toEqual([]);
    }
  });

  test('a first sighting at a healthy band is not a transition and is not logged', () => {
    const session = new Session();
    const logged = session.poll(withGpuTemp(40), 0);
    expect(logged.filter((entry) => entry.id === 'gpu_temp:0')).toEqual([]);
  });

  /*
   * ⚠ The other half of that rule: a dashboard opened *during* an alarm must not show an empty
   * log. The first sighting is logged when it is already something worth seeing.
   */
  test('⚠ a first sighting at an alarming band is logged, with no previous band', () => {
    const session = new Session();
    const logged = session.poll(withGpuTemp(84), 0);
    const entry = logged.find((e) => e.id === 'gpu_temp:0');
    expect(entry).toMatchObject({ from: null, to: 'alarm', severity: 'alarm' });
  });
});

describe('⚠ §6.4’s log is of STATE transitions, not only of severity transitions', () => {
  /*
   * ⚠ §6.4's own example is `13:58:04  llama-server@1  active`. `active → reloading` is
   * `normal → normal`: a log keyed on severity alone would never show it, and §6.4's example
   * column would be missing exactly the lines it is drawn with.
   */
  test('⚠ active → reloading logs, even though both bands are normal', () => {
    const session = new Session();
    session.poll(withFanService('active'), 0);
    session.poll(withFanService('reloading'), 1_000);
    const logged = session.poll(withFanService('reloading'), 12_000);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      source: 'cooling',
      label: 'gpu-fan-control.service',
      severity: 'normal',
      from: 'active',
      to: 'reloading',
    });
  });

  test('⚠ active → failed logs ONCE, not once for the state and once for the severity', () => {
    const session = new Session();
    session.poll(withFanService('active'), 0);
    session.poll(withFanService('failed'), 1_000);
    const logged = session.poll(withFanService('failed'), 12_000);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ severity: 'alarm', from: 'active', to: 'failed' });
  });

  test('a continuous metric logs its band, not its reading, so it does not log every poll', () => {
    const session = new Session();
    session.poll(withGpuTemp(40), 0);
    for (let i = 1; i <= 30; i += 1) {
      expect(session.poll(withGpuTemp(40 + i * 0.5), i * 1_000)).toEqual([]);
    }
  });
});

describe('⚠ O5: a standing condition logs once per session', () => {
  // `everythingZero` carries `ufwEnforcing: false` — §6.3's alarm, and §6.4's archetype.
  const standing = standingIdsFrom(['ufw_enforcing']);

  test('⚠ a suppressed standing condition logs once, at watch, and never banners', () => {
    const session = new Session(0, standing);
    const logged = session.poll(everythingZero, 0);
    const entry = logged.find((e) => e.id === 'ufw_enforcing');
    expect(entry).toMatchObject({ kind: 'standing', severity: 'watch', to: 'no' });
  });

  test('⚠ it does not log again, however many polls follow', () => {
    const session = new Session(0, standing);
    session.poll(everythingZero, 0);
    for (let i = 1; i <= 50; i += 1) {
      expect(session.poll(everythingZero, i * 30_000).filter((e) => e.id === 'ufw_enforcing')).toEqual(
        [],
      );
    }
  });

  /*
   * ⚠ §6.4: "It returns to full alarm behaviour the moment it *changes* — including when it
   * clears and later regresses." Four observations, because that is where the two plausible
   * wrong ledgers diverge (see `lib/conditions.ts`). The once-per-session set must not swallow
   * the regression.
   */
  test('⚠ once it clears and regresses it logs again, at full alarm severity', () => {
    const session = new Session(0, standing);
    const enforcing: TelemetrySnapshot = {
      ...everythingZero,
      safety: { ...everythingZero.safety, ufwEnforcing: true },
    };

    session.poll(everythingZero, 0);
    session.poll(enforcing, 1_000);
    const cleared = session.poll(enforcing, 12_000).filter((e) => e.id === 'ufw_enforcing');
    expect(cleared[0]).toMatchObject({ kind: 'band', to: 'yes', severity: 'normal' });

    session.poll(everythingZero, 20_000);
    const regressed = session.poll(everythingZero, 31_000).filter((e) => e.id === 'ufw_enforcing');
    expect(regressed[0]).toMatchObject({ kind: 'band', to: 'no', severity: 'alarm' });
  });

  /*
   * ⚠ The case O5's set actually exists for, and the one the harness found missing: a standing
   * condition whose **rendered value** moves while its severity does not. `failed → inactive`
   * is alarm → alarm, so the ledger's `changed` flag stays false and the condition stays
   * suppressed — but the value band moved, and without the once-per-session set that is a
   * second line in a log §6.4 says gets exactly one.
   */
  test('⚠ a suppressed standing condition whose value moves inside its band logs only once', () => {
    const unitStanding = standingIdsFrom(['unit:gpu-fan-control.service']);
    const session = new Session(0, unitStanding);
    const first = session.poll(withFanService('failed'), 0);
    expect(first.filter((e) => e.id === 'unit:gpu-fan-control.service')).toHaveLength(1);

    session.poll(withFanService('inactive'), 1_000);
    const again = session.poll(withFanService('inactive'), 12_000);
    expect(again.filter((e) => e.id === 'unit:gpu-fan-control.service')).toEqual([]);
  });

  test('⚠ with nothing declared standing the same condition logs as a plain alarm', () => {
    const session = new Session();
    const logged = session.poll(everythingZero, 0).filter((e) => e.id === 'ufw_enforcing');
    expect(logged[0]).toMatchObject({ kind: 'band', severity: 'alarm' });
  });
});

describe('⚠ §6.7: the log records a collector’s transition, not its every poll', () => {
  const wedged: readonly TelemetryError[] = [
    { source: 'dell-smm', message: 'skipped: an earlier read has not returned' },
  ];
  const broken: readonly TelemetryError[] = [
    { source: 'dell-smm', message: 'no hwmon named dell_smm' },
  ];

  test('⚠ a collector that stops answering logs one entry, not one every five seconds', () => {
    const session = new Session();
    session.poll(everythingZero, 0);
    session.poll(withErrors(broken), 1_000);
    const lost = session.poll(withErrors(broken), 12_000).filter((e) => e.kind === 'source-lost');
    // …then nothing more, however long it stays broken.
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ source: 'dell-smm', detail: 'no hwmon named dell_smm' });

    for (let i = 2; i <= 20; i += 1) {
      expect(session.poll(withErrors(broken), i * 12_000).filter((e) => e.kind === 'source-lost')).toEqual(
        [],
      );
    }
  });

  test('⚠ and one when it resumes, once the recovery has held ten seconds too', () => {
    const session = new Session();
    session.poll(withErrors(broken), 0);
    expect(session.poll(withErrors(broken), 11_000).filter((e) => e.kind === 'source-lost')).toHaveLength(
      1,
    );
    expect(session.poll(everythingZero, 12_000)).toEqual([]);
    const back = session.poll(everythingZero, 23_000).filter((e) => e.kind === 'source-recovered');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ source: 'dell-smm', severity: 'normal', from: 'lost', to: 'answering' });
  });

  /*
   * ⚠ §6.7: "A skipped call and a failed call must not read alike … The distinction lives in
   * the `errors[]` message text, and it is the only signal that a source is wedged rather than
   * merely broken." The log carries the message verbatim, so the distinction survives.
   */
  test('⚠ the entry carries the errors[] message, which is where skipped and failed differ', () => {
    const session = new Session();
    session.poll(everythingZero, 0);
    session.poll(withErrors(wedged), 1_000);
    const lost = session.poll(withErrors(wedged), 12_000).filter((e) => e.kind === 'source-lost');

    expect(lost[0]?.detail).toBe('skipped: an earlier read has not returned');
  });

  /*
   * ⚠ A collector already failing at page load is logged too, but only once its failure has
   * held for §6.4's ten seconds. It is seeded *answering*, so its first appearance in
   * `errors[]` is a transition rather than a fact about the session's first millisecond — a
   * source that failed on one poll and recovered on the next must not produce two lines.
   */
  test('⚠ a collector already failing when the page opens is logged after the debounce', () => {
    const session = new Session();
    expect(session.poll(nothingReadable, 0).filter((e) => e.kind === 'source-lost')).toEqual([]);
    const logged = session.poll(nothingReadable, 11_000).filter((e) => e.kind === 'source-lost');
    expect(logged.map((e) => e.source)).toEqual(['dell-smm']);
  });

  test('⚠ a collector that fails on one poll and recovers on the next logs nothing at all', () => {
    const session = new Session();
    session.poll(everythingZero, 0);
    session.poll(withErrors(broken), 2_000);
    expect(session.poll(everythingZero, 4_000)).toEqual([]);
    expect(session.poll(everythingZero, 30_000)).toEqual([]);
  });

  test('a source that never fails is never logged', () => {
    const session = new Session();
    session.poll(everythingZero, 0);
    session.poll(everythingZero, 12_000);
    expect(session.events.entries.filter((e) => e.kind === 'source-recovered')).toEqual([]);
  });
});

describe('⚠ the log is newest first and capped', () => {
  const run = (): EventState => {
    const session = new Session();
    let at = 0;
    for (let i = 0; i < 1_400; i += 1) {
      at += 11_000;
      session.poll(withFanService(i % 4 < 2 ? 'active' : 'reloading'), at);
    }
    return session.events;
  };

  test('⚠ the log never grows past 500 entries', () => {
    expect(run().entries).toHaveLength(MAX_EVENTS);
  });

  test('⚠ the newest entry is first, and the oldest — page loaded — is the one discarded', () => {
    const entries = run().entries;
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i - 1]!.seq).toBeGreaterThan(entries[i]!.seq);
    }
    expect(entries.some((e) => e.kind === 'page-loaded')).toBe(false);
  });

  test('several entries from one poll are ordered newest first among themselves', () => {
    const session = new Session();
    // Two GPUs both alarming on their first sighting: two entries, one poll.
    const card = everythingZero.gpus?.[0];
    if (card === undefined) throw new Error('the everythingZero fixture lost its GPU');
    const hot: TelemetrySnapshot = {
      ...everythingZero,
      gpus: [
        { ...card, index: 0, tempC: celsius(84) },
        { ...card, index: 1, tempC: celsius(85) },
      ],
    };
    const logged = session.poll(hot, 0).filter((e) => e.kind === 'band' && e.id?.startsWith('gpu_temp'));
    expect(logged).toHaveLength(2);
    expect(logged[0]!.seq).toBeGreaterThan(logged[1]!.seq);
  });
});

// ---------------------------------------------------------------------------
// §6.5's three edges — never a silent removal
// ---------------------------------------------------------------------------

/** The same box, with `nvidia-smi` no longer answering: `gpus: null`, not `[]`. */
const blind = (snapshot: TelemetrySnapshot): TelemetrySnapshot => ({
  ...snapshot,
  gpus: null,
  errors: [{ source: 'nvidia-smi', message: 'nvidia-smi: exit 6' }],
});

/** The same box with one fewer card: `gpus` was read, and GPU 0 is not in it. */
const noCards = (snapshot: TelemetrySnapshot): TelemetrySnapshot => ({ ...snapshot, gpus: [] });

describe('⚠ §6.5: a reading that stopped and a subject that left do not look alike', () => {
  /*
   * ⚠ **F3's counter-signal.** §6.5: "Never a silent removal." An operator must be able to see
   * in the log that a reading *stopped*, because the alternative reading of a disappearing
   * alarm is that the machine got better — and it did not.
   */
  test('⚠ a condition going stale logs once, at watch, after ten sampled seconds', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);

    expect(session.poll(blind(withGpuTemp(90)), 20_000).filter((e) => e.kind === 'stale')).toEqual([]);
    const stale = session.poll(blind(withGpuTemp(90)), 32_000).filter((e) => e.kind === 'stale');
    expect(stale.map((e) => e.id)).toContain('gpu_temp:0');
    expect(stale[0]).toMatchObject({ severity: 'watch', to: 'stale' });

    // …and once only, however long it stays unreadable.
    expect(session.poll(blind(withGpuTemp(90)), 60_000).filter((e) => e.kind === 'stale')).toEqual([]);
  });

  /*
   * ⚠ Toned `normal`, deliberately. A retirement is not a loss of sight — the collection was
   * read and the subject was not in it, which is an answer about the machine rather than about
   * the dashboard.
   */
  test('⚠ a subject observed gone is retired, and logs at normal', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);

    session.poll(noCards(withGpuTemp(90)), 20_000);
    const retired = session.poll(noCards(withGpuTemp(90)), 32_000).filter((e) => e.kind === 'retired');
    expect(retired.map((e) => e.id)).toContain('gpu_temp:0');
    expect(retired[0]).toMatchObject({ severity: 'normal', to: 'retired' });
  });

  test('⚠ a stale condition being read again logs exactly one line', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);
    session.poll(blind(withGpuTemp(90)), 20_000);
    session.poll(blind(withGpuTemp(90)), 32_000);

    const back = session.poll(withGpuTemp(90), 40_000).filter((e) => e.id === 'gpu_temp:0');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ kind: 'reading-returned', from: 'stale' });
  });

  /*
   * ⚠ …and **one**, not two. A reading that comes back in a different band already logs that
   * band change, and §6.5 asks for one entry when a reading returns, not a pair that would
   * have to be read together to make sense.
   */
  test('⚠ a reading that returns in a different band logs the band change, once', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);
    session.poll(blind(withGpuTemp(90)), 20_000);
    session.poll(blind(withGpuTemp(90)), 32_000);

    session.poll(withGpuTemp(40), 40_000);
    const settled = session.poll(withGpuTemp(40), 55_000).filter((e) => e.id === 'gpu_temp:0');
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ kind: 'band', to: 'normal' });
  });

  /*
   * ⚠ **The reachable case for "one entry, not two", which the fixture above does not reach.**
   *
   * `observePoll` does not touch a condition's band hold while its subject is absent, so a
   * **pending run started before the outage survives it**. Here the card drops to 40 °C, going
   * pending `normal` at 20 s; the collector then fails for long enough to be confirmed absent;
   * and when the reading comes back at 50 s the hold sees the same pending band with thirty
   * seconds behind it and confirms `normal` **on the same poll the condition returns**. Both
   * the band loop and §6.5's returned feed have something to say about `gpu_temp:0` in that one
   * poll, and §6.5 asks for one line.
   *
   * The fixture above cannot reach it: it returns and settles in two separate polls, so the two
   * feeds never coincide and the guard is never consulted.
   */
  test('⚠ a band confirmed by the very poll that ends the outage still logs one line', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);
    // A cooler reading: pending `normal`, not yet confirmed, so nothing is logged.
    expect(session.poll(withGpuTemp(40), 20_000).filter((e) => e.id === 'gpu_temp:0')).toEqual([]);

    session.poll(blind(withGpuTemp(40)), 25_000);
    session.poll(blind(withGpuTemp(40)), 36_000);

    const back = session.poll(withGpuTemp(40), 50_000).filter((e) => e.id === 'gpu_temp:0');
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ kind: 'band', to: 'normal' });
  });

  /*
   * ⚠ **A retirement clears the ledger, so a subject that comes back is a FIRST sighting.**
   * `observePoll` drops a retired condition's hold, its ledger entry and its presence — it has
   * left the machine — so when the card returns it is confirmed at once at whatever it reads.
   * The event log has to forget it in the same breath. If it does not, the returning card's
   * band equals the band still recorded against it, the `previousBand === band` early-out
   * fires, and **a card that left at 90 °C and came back at 90 °C is logged nowhere at all** —
   * §6.5's "never a silent removal", failing on the return leg instead of the departure.
   */
  test('⚠ a card that is retired and comes back is logged again, as a first sighting', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);

    session.poll(noCards(withGpuTemp(90)), 20_000);
    const retired = session.poll(noCards(withGpuTemp(90)), 32_000).filter((e) => e.kind === 'retired');
    expect(retired.map((e) => e.id)).toContain('gpu_temp:0');

    const returned = session.poll(withGpuTemp(90), 40_000).filter((e) => e.id === 'gpu_temp:0');
    expect(returned).toHaveLength(1);
    // `from: null` is what "first sighting" reads as — not a transition out of a band nobody
    // has measured since the card left.
    expect(returned[0]).toMatchObject({ kind: 'band', from: null, to: 'alarm' });
  });

  /*
   * ⚠ **The reachable case for "a poll in which a condition does not appear steps nothing",
   * which a `gpu_temp` fixture cannot reach.** For a continuous metric the band is
   * `displaySeverity`, which is frozen while stale and therefore always equals the band
   * already logged — so the `condition.stale` guard is invisible there, defended a second time
   * by the `previousBand === band` early-out below it.
   *
   * A **value-band** condition (§6.4's closed vocabularies — a unit state) is different: its
   * band comes from `valueHolds`, which lives here and is stepped by this loop. A unit that
   * goes `active → failed` and then becomes unreadable **five seconds into its ten-second
   * run** carries a pending value across the outage. Without the guard the loop keeps stepping
   * it against the browser's clock, confirms `failed` on the strength of time nobody was
   * sampling, and logs a state transition for a unit the dashboard has not been able to read
   * since before the transition would have been confirmed.
   *
   * That is §6.4's ten seconds of *sampled* time (F7) and §6.5's stale rule meeting in the one
   * place they overlap, and the ledger found it: the mutation that removes the guard passed
   * every other fixture in this file.
   */
  test('⚠ a value-band condition that went stale mid-run does not confirm across the outage', () => {
    const unreadable: TelemetrySnapshot = {
      ...everythingZero,
      cooling: { ...everythingZero.cooling, serviceState: null },
      safety: { ...everythingZero.safety, fanServiceState: null },
    };
    const session = new Session();
    session.poll(withFanService('active'), 0);
    // The change starts a pending run. Five seconds is half of §6.4's hold, so nothing logs.
    expect(session.poll(withFanService('failed'), 5_000).filter((e) => e.kind === 'band')).toEqual([]);

    // Both panels lose the reading, so the condition leaves the poll and is confirmed absent.
    session.poll(unreadable, 8_000);
    const stale = session.poll(unreadable, 20_000);
    // Fifteen seconds after the pending run began — the poll on which an unguarded loop
    // confirms it — so this is the assertion that matters, not the ones after it.
    expect(stale.map((e) => e.kind)).toContain('stale');
    expect(stale.filter((e) => e.kind === 'band')).toEqual([]);

    // Well past ten seconds of wall time, and none of it sampled.
    for (let i = 1; i <= 5; i += 1) {
      expect(session.poll(unreadable, 20_000 + i * 5_000).filter((e) => e.kind === 'band')).toEqual([]);
    }
  });

  /*
   * §6.4: "A poll in which a condition does not appear steps nothing." A stale condition is
   * carried in `displayed` so it keeps counting toward §9's dot — and if the log treated that
   * as a fresh sighting it would restate the same band on every poll for as long as the
   * collector stayed down, which is exactly what §6.7's "the transition, not the poll" forbids.
   *
   * ⚠ **The mark was dropped from this test, deliberately, and the property it was claiming
   * lives on the value-band fixture above.** For a continuous metric this is defended **twice**
   * — the `condition.stale` short-circuit skips the loop, and even without it the frozen band
   * equals the band already logged, so the `previousBand === band` early-out fires. `E19` and
   * `E21` each remove one guard and this test stays green under both; removing both at once is
   * not an implementation anybody would write. HANDOVER §5.2 rule 1: where a property has no
   * plausible wrong implementation, **drop the ⚠ rather than the standard**. The test stays —
   * it is a true statement about the log, and it is the fixture that would catch a third guard
   * being added and then removed.
   */
  test('a stale condition produces no log entry on any poll, however long it lasts', () => {
    const session = new Session();
    session.poll(withGpuTemp(90), 0);
    session.poll(withGpuTemp(90), 11_000);
    session.poll(blind(withGpuTemp(90)), 20_000);
    session.poll(blind(withGpuTemp(90)), 32_000);
    for (let i = 1; i <= 20; i += 1) {
      const logged = session.poll(blind(withGpuTemp(90)), 32_000 + i * 5_000);
      expect(logged.filter((e) => e.id === 'gpu_temp:0')).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// §9's dedupe, reporting where it had to choose
// ---------------------------------------------------------------------------

describe('⚠ §9: COOLING and SAFETY disagreeing is a server defect worth one line', () => {
  const disagreeing: TelemetrySnapshot = {
    ...everythingZero,
    cooling: { ...everythingZero.cooling, serviceState: 'active' },
    safety: { ...everythingZero.safety, fanServiceState: 'failed' },
  };

  test('⚠ it is logged once per session, at watch, naming what was kept', () => {
    const session = new Session();
    const first = session.poll(disagreeing, 0).filter((e) => e.kind === 'conflict');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: 'unit:gpu-fan-control.service',
      severity: 'watch',
      to: 'failed',
      from: 'active',
    });

    for (let i = 1; i <= 5; i += 1) {
      expect(session.poll(disagreeing, i * 30_000).filter((e) => e.kind === 'conflict')).toEqual([]);
    }
  });

  test('an agreeing pair logs nothing at all', () => {
    const session = new Session();
    expect(session.poll(everythingZero, 0).filter((e) => e.kind === 'conflict')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §6.7's staleness crossing
// ---------------------------------------------------------------------------

describe('⚠ §6.7: one line when the dashboard goes stale, one when it recovers', () => {
  test('⚠ the crossing and the recovery, and nothing in between', () => {
    let state = startEventLog(0);
    expect(observeStaleness(state, false, '', 1_000)).toBe(state);

    state = observeStaleness(state, true, 'ECONNREFUSED', 5_000);
    expect(state.entries[0]).toMatchObject({
      kind: 'mode-stale',
      severity: 'watch',
      from: 'live',
      to: 'stale',
      detail: 'ECONNREFUSED',
    });

    const held = observeStaleness(state, true, 'ECONNREFUSED', 10_000);
    expect(held).toBe(state);

    const recovered = observeStaleness(held, false, '', 20_000);
    expect(recovered.entries[0]).toMatchObject({ kind: 'mode-current', severity: 'normal', to: 'live' });
  });
});

// ---------------------------------------------------------------------------
// §6.7's skipped-versus-failed message
// ---------------------------------------------------------------------------

describe('⚠ §6.7: which errors[] message reaches the log', () => {
  /*
   * ⚠ §6.7 makes this text carry the one distinction an operator needs — "A skipped call and a
   * failed call must not read alike … it is the only signal that a source is wedged rather
   * than merely broken" — and §4 contemplates a collector filing its own entry *plus* the
   * assembly's ceiling entry for the same source. The assembly appends after the collector, so
   * the **last** entry is the outer, more recent verdict. Keeping the first inherited a
   * concatenation order §4 explicitly declines to fix.
   */
  test('⚠ the last message per source wins, so the outer verdict is the one shown', () => {
    const twice: readonly TelemetryError[] = [
      { source: 'dell-smm', message: 'dell_smm: EIO' },
      { source: 'dell-smm', message: 'skipped: an earlier call has not returned' },
    ];
    const session = new Session();
    const healthy: TelemetrySnapshot = { ...everythingZero, errors: [] };
    session.poll(healthy, 0);
    session.poll({ ...everythingZero, errors: twice }, 1_000);
    const lost = session.poll({ ...everythingZero, errors: twice }, 12_000).filter(
      (e) => e.kind === 'source-lost',
    );
    expect(lost[0]?.detail).toBe('skipped: an earlier call has not returned');
  });
});
