import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { EMPTY_CONDITION_STATE } from '@/lib/conditions';
import { startEventLog } from '@/lib/client/events';
import { DEFAULT_CADENCE_SECONDS, DEFAULT_WINDOW_MINUTES } from '@/lib/client/prefs';
import { EMPTY_RING, appendSample } from '@/lib/client/ring';
import type { RuntimeState, TelemetryRuntime } from '@/lib/client/runtime';
import { ERROR_SOURCES } from '@/lib/client/wire';
import { everythingZero, servingInstances, wireRead } from '@/lib/fixtures';
import { celsius, isoTimestamp, mhz, mib, percent, throttleMask, watts } from '@/lib/types';
import type { ErrorSource, Gpu, TelemetrySnapshot } from '@/lib/types';

import { DashboardShell } from './dashboard-shell';

/**
 * ⚠⚠ 12a — **a collector that cannot read must be visible at a glance.** §6.2's ruling of
 * 2026-09-14, generated rather than listed.
 *
 * ### What happened, and why this file is a GENERATOR
 *
 * A `systemd daemon-reload` revoked the running container's GPU device access (cgroup v2 +
 * the systemd cgroup driver). `nvidia-smi` inside the container then failed, the snapshot
 * carried `{"source":"nvidia-smi","message":"nvidia-smi: exited 255"}` — and **nothing on
 * screen said so.** The operator found it by reading the raw `/api/telemetry` response. Two
 * defects, both already written down and neither built: the GPU *absent* branch drew
 * `card not enumerated` and nothing else (recorded as `10e-Q4` in 10g, deferred, and then it
 * bit on day one), and the header read `● all healthy` for the whole outage.
 *
 * Both were **reachable by one hand-written test each**, and neither existed, because a
 * hand-written table only ever asks about the cases whoever wrote it already thought of
 * (HANDOVER §0.14 — this project earned that rule twice in one loop, the second time inside
 * the document that wrote it down the first time). So this file does not list branches. It
 * takes the **product** of:
 *
 * - every §3.7 source, read from `lib/client/wire.ts`'s `ERROR_SOURCES` — the project's only
 *   runtime enumeration of the closed union, so a nineteenth source reaches this sweep
 *   without anybody editing this file; and
 * - every SHAPE of the two enumerated collections (§9: `gpus` and `serving` are the only two
 *   members whose membership can change), plus the all-null poll — which is exactly the axis
 *   the takeover branches live on.
 *
 * …and renders **the real `DashboardShell`**, not a panel in isolation. The 2026-09-14
 * failure was visible only in the assembly: `gpu-panel.tsx`'s two branches were each tested,
 * and so was `aggregateStatus`, and the page still said nothing.
 *
 * ### The two properties, and why one has an exclusion the other does not
 *
 * 1. **The machine's own words reach the screen.** For every (source, shape), the collector's
 *    message is somewhere in the page. ⚠ Two sources are excluded, ASSERTED to be exactly
 *    those two below: `hostname` and `proc-uptime` land on §6.2's header, whose height is
 *    `--band-reserve: 102px` — a measured constant §6.1's row arithmetic subtracts from
 *    `100vh` before dividing what is left (10h: a 79-character FQDN wrapping that band put the
 *    page over at 1280×1024). There is nowhere bounded to put a message there, and inventing
 *    one is a §6.1 decision, not this loop's. Recorded as an owner question in
 *    `12a-build.md`; property 2 is what those two still get.
 * 2. **The header does not read `all healthy`.** For every (source, shape) — the two excluded
 *    sources included — with no exception, because this is the property the ruling states and
 *    the one the operator reads from across the room.
 *
 * `useTelemetry` is mocked exactly as `dashboard-shell.test.tsx` mocks it, and for the same
 * reason: what is under test is this assembly's wiring, not the poll loop.
 */

let handle: { state: RuntimeState | null; runtime: TelemetryRuntime | null };

vi.mock('@/lib/client/use-telemetry', () => ({
  useTelemetry: () => handle,
}));

const BASE_MS = Date.UTC(2026, 8, 6, 14, 0, 0, 0);

/** This box's real card, so a fixture cannot pass by being unlike the machine. */
const card = (index: number): Gpu => ({
  index,
  name: 'Tesla PG500-216',
  bus: index === 0 ? '00000000:17:00.0' : '00000000:97:00.0',
  tempC: celsius(66),
  powerW: watts(249.8),
  powerCapW: watts(250),
  memUsedMiB: mib(26452),
  memTotalMiB: mib(32768),
  utilPct: percent(97),
  smClockMHz: mhz(1290),
  throttleReasons: throttleMask('0x0000000000000004'),
});

/**
 * The shapes of §9's two enumerated collections, plus the poll in which nothing read.
 *
 * ⚠ `null` is not `[]`, and the two takeover branches this loop is about are on opposite
 * sides of that line: `gpus: null` is *"we could not enumerate"* and `gpus: []` / a card
 * missing from a list that WAS read is §6.5's *retired* case. `absentCard` is the exact
 * production-adjacent shape — one card enumerated, the other not — because it is the only one
 * in which a takeover branch and a fully-drawn card are on the page at the same time.
 */
const SHAPES: Readonly<Record<string, Partial<TelemetrySnapshot>>> = {
  healthy: { gpus: [card(0), card(1)], serving: [...servingInstances] },
  gpusNull: { gpus: null, serving: [...servingInstances] },
  gpusEmpty: { gpus: [], serving: [...servingInstances] },
  absentCard: { gpus: [card(0)], serving: [...servingInstances] },
  servingNull: { gpus: [card(0), card(1)], serving: null },
  servingEmpty: { gpus: [card(0), card(1)], serving: [] },
  nothingRead: { gpus: null, serving: null },
};

/**
 * ⚠ The two sources property 1 cannot reach, and this list is asserted to be EXACTLY the set
 * that fails it — so a third one appearing is a red test rather than a quiet hole. See the
 * module doc: §6.2's header carries the hostname and the uptime, and its height is a measured
 * constant §6.1's arithmetic depends on.
 */
const NO_MESSAGE_SURFACE: readonly ErrorSource[] = ['hostname', 'proc-uptime'];

const sources = Object.keys(ERROR_SOURCES) as readonly ErrorSource[];
const shapeNames = Object.keys(SHAPES);

/**
 * A message no other string in the page can be. `errors[]` text is the COLLECTOR's own (S-H)
 * and is never rewritten by the UI, so a marker carried on the wire must appear verbatim.
 */
const marker = (source: ErrorSource): string => `MARKER-${source}-could-not-be-read`;

const stateFor = (shape: string, source: ErrorSource): RuntimeState => ({
  preferences: { cadenceSeconds: DEFAULT_CADENCE_SECONDS, windowMinutes: DEFAULT_WINDOW_MINUTES },
  ring: appendSample(
    EMPTY_RING,
    wireRead(
      {
        ...everythingZero,
        ts: isoTimestamp(new Date(BASE_MS).toISOString()),
        ...SHAPES[shape],
        errors: [{ source, message: marker(source) }],
      },
      BASE_MS,
    ),
  ),
  conditions: EMPTY_CONDITION_STATE,
  displayed: [],
  events: startEventLog(BASE_MS),
  gaps: [],
  paused: false,
  hidden: false,
  consecutiveFailures: 0,
  lastFailure: null,
  mode: 'live',
  // ⚠ `'normal'` and 0 alarms deliberately: the production case is a box every OTHER collector
  // read fine, which is precisely the three inputs a perfectly healthy machine has. A fixture
  // with a null severity would pass the header property for the wrong reason (`no readings`).
  severity: 'normal',
  alarms: 0,
  unknownStanding: [],
});

/** The rendered page for one (shape, source). */
const pageFor = (shape: string, source: ErrorSource): string => {
  handle = { state: stateFor(shape, source), runtime: {} as TelemetryRuntime };
  return renderToStaticMarkup(<DashboardShell />);
};

/**
 * Every (shape, source) pair, as `[shape, source]` rows.
 *
 * ⚠ TUPLES with `%s` placeholders, not objects with `$shape` ones, and the reason is the red-
 * test ledger rather than style: every harness keys a ⚠ mark by `name.split('%')[0]` and
 * matches that prefix against vitest's `FAIL …` lines. A `$shape` placeholder is not split on,
 * so the key would carry the literal `$shape` that vitest has already substituted away — an
 * UNMATCHABLE key, which is 10g-A7's finding and the exact shape three names across the nine
 * harnesses had on 2026-09-10 while both phases reported "every ⚠ mark reddened".
 */
const CASES: readonly (readonly [string, ErrorSource])[] = shapeNames.flatMap((shape) =>
  sources.map((source): readonly [string, ErrorSource] => [shape, source]),
);

describe('⚠⚠ 12a — every collector that cannot read says so, across every takeover branch', () => {
  test('the sweep is not vacuous: 18 sources × 7 shapes, read from the closed union itself', () => {
    // A generator that generated nothing would pass every property below. `ERROR_SOURCES` is
    // `Record<ErrorSource, true>`, so this count tracks `lib/types.ts` rather than this file.
    expect(sources).toHaveLength(18);
    expect(shapeNames).toHaveLength(7);
    expect(CASES).toHaveLength(126);
  });

  // ⚠ 12a/TEST — the name carries the exclusion, because the body does. For `hostname` and
  // `proc-uptime` this test asserts the NEGATIVE (see `NO_MESSAGE_SURFACE`), so a name that
  // promised only "reaches the page" described 112 of its 126 cases and misdescribed the other
  // 14 — and a FAIL line naming one of those two would have sent the next reader looking for
  // the opposite defect to the one that broke.
  test.each(CASES)(
    '⚠ the collector message reaches the page, or the source is one of the two with no surface — shape %s, source %s',
    (shape, source) => {
      const html = pageFor(shape, source);
      if (NO_MESSAGE_SURFACE.includes(source)) {
        // Asserted in the NEGATIVE, so the exclusion list stays honest: the day one of these
        // does gain a surface, this goes red and the list is edited on purpose.
        expect(html).not.toContain(marker(source));
        return;
      }
      expect(html).toContain(marker(source));
    },
  );

  test.each(CASES)(
    '⚠ the header refuses to read healthy — shape %s, source %s',
    (shape, source) => {
      // §6.2, 2026-09-14: *"the header may not read healthy while any collector is failing."*
      // This half holds for the two sources above as well — a `hostname` failure has no
      // message surface and must still stop the page claiming health.
      const html = pageFor(shape, source);
      expect(html).not.toContain('all healthy');
      expect(html).toContain('1 source unread');
    },
  );

  test('⚠ a collector that RECOVERED stops being counted — the clause follows the LATEST snapshot, not the ring', () => {
    // ⚠ 12a/TEST — the other side of the ruling, and nothing in this loop measured it: every
    // fixture here holds a ring of ONE sample, in which "the latest snapshot" and "the ring"
    // are the same object, so a shell that counted the OLDEST sample's errors would pass all
    // 126 cases above. A header that keeps accusing a collector after it recovers is the same
    // defect as one that never accused it — an operator learns the clause means nothing.
    const ringOf = (...snapshots: readonly TelemetrySnapshot[]) =>
      snapshots.reduce(
        (ring, snapshot, i) =>
          appendSample(ring, wireRead(snapshot, BASE_MS + i * 5_000)),
        EMPTY_RING,
      );
    const at = (i: number, errors: TelemetrySnapshot['errors']): TelemetrySnapshot => ({
      ...everythingZero,
      ts: isoTimestamp(new Date(BASE_MS + i * 5_000).toISOString()),
      ...SHAPES.healthy,
      errors,
    });
    const failed = [{ source: 'nvidia-smi' as const, message: 'nvidia-smi: exited 255' }];

    handle = { state: { ...stateFor('healthy', 'nvidia-smi'), ring: ringOf(at(0, failed), at(1, [])) }, runtime: {} as TelemetryRuntime };
    const recovered = renderToStaticMarkup(<DashboardShell />);
    expect(recovered).toContain('all healthy');
    expect(recovered).not.toContain('unread');

    handle = { state: { ...stateFor('healthy', 'nvidia-smi'), ring: ringOf(at(0, []), at(1, failed)) }, runtime: {} as TelemetryRuntime };
    const justFailed = renderToStaticMarkup(<DashboardShell />);
    expect(justFailed).toContain('1 source unread');
    expect(justFailed).not.toContain('all healthy');
  });

  test('⚠ and the healthy page still says all healthy, or the property above is vacuous', () => {
    // The other side of every boundary in this file. Without it, "never says healthy" is
    // satisfied by a build that deleted the words.
    handle = {
      state: {
        ...stateFor('healthy', 'dbus'),
        ring: appendSample(
          EMPTY_RING,
          wireRead(
            {
              ...everythingZero,
              ts: isoTimestamp(new Date(BASE_MS).toISOString()),
              ...SHAPES.healthy,
              errors: [],
            },
            BASE_MS,
          ),
        ),
      },
      runtime: {} as TelemetryRuntime,
    };
    const html = renderToStaticMarkup(<DashboardShell />);
    expect(html).toContain('all healthy');
    expect(html).not.toContain('unread');
  });
});

/**
 * ⚠⚠ The acceptance the handoff names, written out as itself rather than left implicit in the
 * matrix above: *"`gpus: []` and `gpus: null`, each carrying an `nvidia-smi` entry, both put
 * the reason on screen; the header says something other than healthy for both. Render them, do
 * not reason about them."* The message is the real one the box produced on 2026-09-14.
 */
describe('⚠⚠ 12a — the production case, fabricated and rendered', () => {
  const NVIDIA = 'nvidia-smi: exited 255';

  const pageWith = (gpus: TelemetrySnapshot['gpus']): string => {
    handle = {
      state: {
        ...stateFor('healthy', 'nvidia-smi'),
        ring: appendSample(
          EMPTY_RING,
          wireRead(
            {
              ...everythingZero,
              ts: isoTimestamp(new Date(BASE_MS).toISOString()),
              gpus,
              serving: [...servingInstances],
              errors: [{ source: 'nvidia-smi', message: NVIDIA }],
            },
            BASE_MS,
          ),
        ),
      },
      runtime: {} as TelemetryRuntime,
    };
    return renderToStaticMarkup(<DashboardShell />);
  };

  test('⚠ gpus: [] — the RETIRED branch, which drew "card not enumerated" and nothing else', () => {
    const html = pageWith([]);
    expect(html).toContain('card not enumerated');
    expect(html).toContain(NVIDIA);
    expect(html).not.toContain('all healthy');
  });

  test('⚠ gpus: null — the branch that always showed it, unchanged by this loop', () => {
    const html = pageWith(null);
    expect(html).toContain('no GPUs enumerated');
    expect(html).toContain(NVIDIA);
    expect(html).not.toContain('all healthy');
  });

  test('⚠ one card enumerated and one not — the takeover and a live card on one page', () => {
    // The shape nothing in the project rendered before: GPU 0 draws its chart and its
    // readings, GPU 1 takes over, and the reason is on BOTH — on GPU 1 because its readings
    // are gone, on GPU 0 because `nvidia-smi` is its only source and it is failing too.
    const html = pageWith([card(0)]);
    expect(html).toContain('card not enumerated');
    expect(html).toContain('66'); // GPU 0's temperature still renders
    // Twice: once under the takeover, once under the enumerated card's own readings.
    expect(html.split(NVIDIA)).toHaveLength(3);
    expect(html).not.toContain('all healthy');
  });
});
