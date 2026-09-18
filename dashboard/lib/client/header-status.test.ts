import { describe, expect, test } from 'vitest';

import { aggregateStatus, failingSourceCount } from './header-status';
import { ERROR_SOURCES } from './wire';
import { everythingZero, nothingReadable } from '../fixtures';
import type { ErrorSource, Severity, TelemetryError, TelemetrySnapshot } from '../types';
import type { RuntimeMode } from './mode';

/**
 * ⚠ `severity` is the third argument as of 10a's reconciliation (adversarial F5): §9 makes the
 * dot and the count ONE reduction, and a `(mode, alarms)` signature made that impossible to
 * honour — `severity === null` with `alarms === 0` put a grey "no band" dot beside the words
 * "all healthy". Most cases below pass `'normal'` because they are about the mode/count axis;
 * the null axis has its own describe block at the end.
 */
const BANDED = 'normal' as const;

/**
 * §6.2/§9: *"paused shows mode **and** alarm count"* — half of `PLAN.md`'s green criterion
 * for step 10, and one of the two things a draft has already gotten wrong (per the handoff).
 * Every test in this file is ⚠: there is no part of this function that is not load-bearing.
 */

describe('⚠ the count is omitted at zero, in every mode', () => {
  test('⚠ live + zero alarms renders "all healthy", never "0 alarms"', () => {
    expect(aggregateStatus('live', 0, BANDED, 0)).toEqual({ glyph: '●', text: 'all healthy', severity: 'normal' });
  });

  test('⚠ paused + zero alarms renders bare "paused", never "paused · 0 alarms"', () => {
    const { text } = aggregateStatus('paused', 0, BANDED, 0);
    expect(text).toBe('paused');
    expect(text).not.toContain('0');
  });

  test('⚠ stale + zero alarms renders bare "stale", never "stale · 0 alarms"', () => {
    const { text } = aggregateStatus('stale', 0, BANDED, 0);
    expect(text).toBe('stale');
    expect(text).not.toContain('0');
  });
});

describe('⚠ paused and stale show the mode ALONGSIDE the count, never instead of it', () => {
  test('⚠ paused with alarms keeps both the word "paused" and the count', () => {
    const { text } = aggregateStatus('paused', 6, BANDED, 0);
    expect(text).toBe('paused · 6 alarms');
    expect(text).toContain('paused');
    expect(text).toContain('6');
  });

  test('⚠ stale with alarms keeps both the word "stale" and the count', () => {
    const { text } = aggregateStatus('stale', 6, BANDED, 0);
    expect(text).toBe('stale · 6 alarms');
    expect(text).toContain('stale');
    expect(text).toContain('6');
  });

  test('a single alarm is singular: "1 alarm", not "1 alarms"', () => {
    expect(aggregateStatus('live', 1, BANDED, 0).text).toBe('1 alarm');
    expect(aggregateStatus('paused', 1, BANDED, 0).text).toBe('paused · 1 alarm');
  });
});

describe('⚠ the glyph names the MODE, never the severity', () => {
  test.each([
    ['live', '●'],
    ['paused', '❙❙'],
    ['stale', '⊘'],
  ] satisfies [RuntimeMode, string][])(
    '⚠ the aggregate glyph for mode %s is %s regardless of alarm count',
    (mode, glyph) => {
      expect(aggregateStatus(mode, 0, BANDED, 0).glyph).toBe(glyph);
      expect(aggregateStatus(mode, 6, BANDED, 0).glyph).toBe(glyph);
    },
  );

  test('⚠ paused and stale never share live’s dot glyph', () => {
    expect(aggregateStatus('paused', 0, BANDED, 0).glyph).not.toBe('●');
    expect(aggregateStatus('stale', 0, BANDED, 0).glyph).not.toBe('●');
  });
});

describe('expired — the terminal mode, no §6.2 wording to violate', () => {
  test('⚠ expired never mentions the alarm count, live or not', () => {
    const withAlarms = aggregateStatus('expired', 6, BANDED, 0);
    expect(withAlarms.text).toBe('signed out');
    expect(withAlarms.text).not.toContain('6');
  });
});

describe('exhaustiveness — the guard a fifth RuntimeMode would trip', () => {
  test('all four modes produce a distinct glyph/text pairing', () => {
    const modes: RuntimeMode[] = ['live', 'paused', 'stale', 'expired'];
    const texts = modes.map((m) => aggregateStatus(m, 0, BANDED, 0).text);
    expect(new Set(texts).size).toBe(modes.length);
  });
});

describe('⚠ F5 — the dot and the words are ONE reduction: `severity === null` never claims health', () => {
  test('⚠ live + zero alarms + no band renders "no readings", NOT "all healthy"', () => {
    // The state every page load passes through between hydration and the first poll landing
    // (`runtime.ts`'s initial state is `mode: 'live'`, `displayed: []`, `severity: null`,
    // `alarms: 0`), and the state §9 wrote its rule for: "null when there are no conditions at
    // all — not 'normal', which would claim health for a poll that produced nothing." The dot
    // beside this text is grey (`data-severity="none"`); the words may not disagree with it.
    const { glyph, text } = aggregateStatus('live', 0, null, 0);
    expect(glyph).toBe('●');
    expect(text).toBe('no readings');
    expect(text).not.toContain('healthy');
  });

  test('⚠ live + zero alarms + a confirmed band still renders "all healthy"', () => {
    // The other side of the same guard — §6.2's own literal must survive the F5 fix.
    expect(aggregateStatus('live', 0, 'normal', 0).text).toBe('all healthy');
  });

  test('⚠ a band with alarms is unaffected — the count still wins over both', () => {
    expect(aggregateStatus('live', 6, null, 0).text).toBe('6 alarms');
    expect(aggregateStatus('live', 6, 'alarm', 0).text).toBe('6 alarms');
  });

  test('⚠ paused and stale make no health claim, so a null band leaves them unchanged', () => {
    expect(aggregateStatus('paused', 0, null, 0).text).toBe('paused');
    expect(aggregateStatus('stale', 0, null, 0).text).toBe('stale');
    expect(aggregateStatus('expired', 0, null, 0).text).toBe('signed out');
  });
});

/**
 * ⚠⚠ 12a — §6.2's ruling of 2026-09-14, after the first production failure.
 *
 * A `daemon-reload` revoked the container's GPU device access; `nvidia-smi` then failed inside
 * it, `errors[]` carried `nvidia-smi: exited 255`, and this function returned `all healthy`
 * for the whole outage — because §9's aggregate is computed from readings and a source that
 * could not be read produces none. Every test below is ⚠ for the reason the rest of this file
 * is: there is no part of this rule that is not the rule.
 */
describe('⚠⚠ 12a — the header may not read healthy while any collector is failing', () => {
  test('⚠ the production case: live, zero alarms, a banded poll, one failing source', () => {
    // The exact shape of 2026-09-14: every OTHER collector read fine, so `severity` is a
    // confirmed `normal` and `alarms` is 0 — the three inputs of a perfectly healthy machine.
    const { text, severity } = aggregateStatus('live', 0, 'normal', 1);
    expect(text).toBe('1 source unread');
    expect(text).not.toContain('healthy');
    // ⚠ And the DOT moves with it: a green ✓ three pixels from those words is the
    // disagreement §6.2 rejected `all healthy` for in the `severity === null` case.
    expect(severity).toBeNull();
  });

  test('⚠ the count is plural above one, and is a count of SOURCES rather than entries', () => {
    expect(aggregateStatus('live', 0, 'normal', 2).text).toBe('2 sources unread');
    expect(aggregateStatus('live', 0, 'normal', 9).text).toBe('9 sources unread');
  });

  test('⚠ zero failing sources changes nothing at all — the healthy page is untouched', () => {
    // The other side of the boundary. Without this, "never says healthy" is satisfiable by a
    // function that never says healthy.
    expect(aggregateStatus('live', 0, 'normal', 0)).toEqual({
      glyph: '●',
      text: 'all healthy',
      severity: 'normal',
    });
  });

  test('⚠ every other mode keeps its own words and takes the clause as a suffix', () => {
    // Only `all healthy` is a claim the ruling forbids; the rest make none, so they are
    // suffixed rather than replaced. Losing the word `paused` would be 10a-HS4 by another
    // route: a frozen display that no longer says it is frozen.
    expect(aggregateStatus('paused', 0, 'normal', 1).text).toBe('paused · 1 source unread');
    expect(aggregateStatus('stale', 0, 'normal', 2).text).toBe('stale · 2 sources unread');
    expect(aggregateStatus('live', 6, 'alarm', 2).text).toBe('6 alarms · 2 sources unread');
    expect(aggregateStatus('paused', 6, 'alarm', 2).text).toBe('paused · 6 alarms · 2 sources unread');
    // `no readings` already claims nothing, so it keeps its words too — the clause says WHY.
    expect(aggregateStatus('live', 0, null, 2).text).toBe('no readings · 2 sources unread');
  });

  test('⚠ an alarming or watching machine keeps its BAND — only a normal one loses it', () => {
    // 10b-S-F's rule one level up, both halves: a red dashboard must not go grey because one
    // unrelated collector failed, or the failing collector would HIDE the alarm it is beside.
    expect(aggregateStatus('live', 6, 'alarm', 3).severity).toBe('alarm');
    expect(aggregateStatus('live', 0, 'watch', 3).severity).toBe('watch');
    expect(aggregateStatus('live', 0, null, 3).severity).toBeNull();
  });

  test('⚠ the expired hand-off is untouched, for the reason its alarm count is', () => {
    // Every fact on the page is about to be replaced by the login screen.
    expect(aggregateStatus('expired', 0, 'normal', 4).text).toBe('signed out');
  });
});

describe('⚠⚠ 12a — failingSourceCount is a count of SOURCES, and never of entries', () => {
  const withErrors = (errors: readonly TelemetryError[]): TelemetrySnapshot => ({
    ...everythingZero,
    errors,
  });

  test('⚠ several entries from one source are ONE failing source', () => {
    // `collectCooling` accumulates a `problems: string[]` into one `tag('dell-smm', …)`, so
    // more than one entry per source is the ordinary case rather than a hypothetical. Counting
    // entries would make one wedged collector read as five faults.
    expect(
      failingSourceCount(
        withErrors([
          { source: 'dell-smm', message: 'fan1_input: ENOENT' },
          { source: 'dell-smm', message: 'fan2_input: ENOENT' },
          { source: 'dell-smm', message: 'pwm5: EACCES' },
        ]),
      ),
    ).toBe(1);
  });

  test('⚠ entries from different sources each count once, instance or no instance', () => {
    // ⚠ FOUR entries, THREE sources — and the fourth is there because of the red-test ledger,
    // not for realism. With one entry per source this test's answer is also `errors.length`,
    // so `12a-HS6` (the count becomes a count of entries) could not redden it: the fixture
    // could not tell the property from its most likely wrong implementation. The `dbus` pair
    // is the real shape anyway — `collectUnitStates` files one entry per unit.
    expect(
      failingSourceCount(
        withErrors([
          { source: 'nvidia-smi', message: 'nvidia-smi: exited 255' },
          { source: 'dbus', message: '/run/dbus/system_bus_socket: read ECONNRESET' },
          { source: 'dbus', message: '/run/dbus/system_bus_socket: read ECONNRESET' },
          { source: 'llama-env', message: '1.env: no MODEL', instance: '1' },
        ]),
      ),
    ).toBe(3);
  });

  test('⚠ a healthy snapshot is 0, and so is a snapshot that has not landed yet', () => {
    // `null` is 0 rather than "unknown": before the first poll there is nothing to be failing,
    // and `severity === null` already renders `no readings` for that frame (S-D).
    expect(failingSourceCount(withErrors([]))).toBe(0);
    expect(failingSourceCount(null)).toBe(0);
  });

  test('⚠ the production snapshot counts the source that blanked the GPUs', () => {
    // `nothingReadable` carries one `dell-smm` entry; the outage of 2026-09-14 added an
    // `nvidia-smi` one beside it.
    expect(failingSourceCount(nothingReadable)).toBe(1);
    // ⚠ THREE entries, TWO sources — see the four-entry fixture above for why the extra
    // `dell-smm` line is load-bearing rather than decorative.
    expect(
      failingSourceCount({
        ...nothingReadable,
        errors: [
          ...nothingReadable.errors,
          { source: 'dell-smm', message: 'fan5_input: ENOENT' },
          { source: 'nvidia-smi', message: 'nvidia-smi: exited 255' },
        ],
      }),
    ).toBe(2);
  });
});

/**
 * ⚠⚠ 12a/TEST — the whole range, generated rather than sampled.
 *
 * The cases above pin the shapes that matter one at a time: one failing source, two, the
 * production case, each band. That leaves the rule stated at three points of a nineteen-point
 * axis and on four of sixteen (mode × band) crossings, and a rule tested at its examples is a
 * rule that holds at its examples — HANDOVER §0.14, the reason `collector-visibility.test.tsx`
 * is a product rather than a list. The counts below run from ZERO through **all eighteen**
 * §3.7 sources, read from `ERROR_SOURCES` so the ceiling tracks `lib/types.ts` rather than a
 * number typed here, and cross every count with every mode and every band.
 */
describe('⚠⚠ 12a — zero through all eighteen, crossed with every mode and every band', () => {
  const SOURCES = Object.keys(ERROR_SOURCES) as readonly ErrorSource[];
  const COUNTS = SOURCES.map((_, i) => i + 1);
  const MODES: readonly RuntimeMode[] = ['live', 'paused', 'stale', 'expired'];
  const BANDS: readonly (Severity | null)[] = [null, 'normal', 'watch', 'alarm'];

  test('the axis is the closed union itself, not a number typed here', () => {
    // Anti-vacuity: a `COUNTS` that generated nothing would satisfy every loop below.
    expect(SOURCES).toHaveLength(18);
    expect(COUNTS[0]).toBe(1);
    expect(COUNTS.at(-1)).toBe(18);
  });

  test('⚠ every count from 1 to 18 carries the clause, and zero carries nothing, in every mode', () => {
    for (const mode of MODES) {
      const clauseless = mode === 'expired';
      expect(aggregateStatus(mode, 0, 'normal', 0).text).not.toContain('unread');
      for (const failing of COUNTS) {
        const { text } = aggregateStatus(mode, 0, 'normal', failing);
        if (clauseless) {
          // The hand-off to `/login` has begun; every fact on the page is about to be replaced.
          expect(text).toBe('signed out');
          continue;
        }
        // ⚠ Singular at exactly one, plural everywhere else — the one place this axis has a
        // boundary, asserted at the boundary rather than at a sample near it.
        expect(text).toContain(failing === 1 ? '1 source unread' : `${failing} sources unread`);
        expect(text).not.toContain('sources unread · ');
        // §6.2's one forbidden shape, at every count rather than at the two that were fixtured.
        expect(text).not.toContain('all healthy');
      }
    }
  });

  test('⚠ every band crossed with every count: only a normal one loses its band, and only when failing', () => {
    for (const band of BANDS) {
      for (const failing of [0, ...COUNTS]) {
        const { severity } = aggregateStatus('live', 0, band, failing);
        // 10b-S-F one level up: `normal` over an unread source is no band; `watch` and `alarm`
        // keep theirs, or a failing collector would HIDE the alarm it is standing beside.
        expect(severity).toBe(band === 'normal' && failing > 0 ? null : band);
      }
    }
  });

  /**
   * ⚠⚠ 12a/RECONCILE (`12a-A6`) — **THE CROSSING, which the two tests above are not.**
   *
   * Measured against this file rather than reasoned: the count test calls
   * `aggregateStatus(mode, 0, 'normal', failing)` and the band test
   * `aggregateStatus('live', 0, band, failing)`, so **`alarms` is 0 in every generated case**,
   * mode × band is never crossed at all (4 + 4 slices, not 16), and `glyph` is never asserted
   * anywhere in the block — a `BY_MODE` table whose `paused` and `stale` glyphs were swapped
   * passed all of it. The name said *"crossed with every mode and every band"*.
   *
   * This is the product: 4 modes × 4 bands × 3 alarm counts × 19 failing counts = 912 points,
   * every one of them asserted on all three returned fields.
   *
   * ⚠ The expectations are STRUCTURAL, deliberately — "does the clause end the string", "is the
   * alarm word present", "is the mode's own word there" — rather than a second copy of
   * `aggregateStatus`'s own string building. A test that re-implements the function it tests
   * agrees with every bug it has. The exact literals are pinned at the named points below,
   * where a human chose the string.
   */
  test('⚠ the real crossing: 4 modes × 4 bands × 3 alarm counts × 0…18 unread sources', () => {
    const GLYPH: Readonly<Record<RuntimeMode, string>> = {
      live: '●',
      paused: '❙❙',
      stale: '⊘',
      expired: '⊘',
    };
    let points = 0;
    for (const mode of MODES) {
      for (const band of BANDS) {
        for (const alarms of [0, 1, 6]) {
          for (const failing of [0, ...COUNTS]) {
            const at = `${mode}/${String(band)}/${alarms}/${failing}`;
            const { glyph, text, severity } = aggregateStatus(mode, alarms, band, failing);
            points += 1;

            // 1. The GLYPH is the mode's, in every band and at every count — nothing asserted
            //    this in the sweep, and it is how §6.2's "❙❙ paused" is told from "⊘ stale".
            expect(glyph, at).toBe(GLYPH[mode]);

            // 2. §9's omit-at-zero, everywhere: the literal 0 never reaches the header.
            expect(text, at).not.toMatch(/(^|\s)0\s/);
            expect(text, at).not.toContain('0 alarms');

            if (mode === 'expired') {
              // §5.2's hand-off has begun: no count, no clause, and the band untouched.
              expect(text, at).toBe('signed out');
              expect(severity, at).toBe(band);
              continue;
            }

            // 3. 10b-S-F one level up, now at every alarm count rather than at zero.
            expect(severity, at).toBe(band === 'normal' && failing > 0 ? null : band);

            // 4. The clause is a SUFFIX and appears exactly when a source is unread.
            const clause = failing === 1 ? '1 source unread' : `${failing} sources unread`;
            expect(text.endsWith(clause), `${at}: ${text}`).toBe(failing > 0);

            // 5. The alarm count survives every other rule — a failing collector may never
            //    hide an alarm (`12a-HS5`), and neither may a paused or stale mode (§6.2).
            expect(text.includes(alarms === 1 ? '1 alarm' : `${alarms} alarms`), at).toBe(alarms > 0);

            // 6. The mode's own word is there in every mode that has one, and §6.2's one
            //    forbidden shape is absent whenever any source is unread.
            if (mode !== 'live') expect(text.startsWith(mode), at).toBe(true);
            expect(text.includes('all healthy'), at).toBe(
              mode === 'live' && alarms === 0 && band !== null && failing === 0,
            );
            expect(text.includes('no readings'), at).toBe(mode === 'live' && alarms === 0 && band === null);
          }
        }
      }
    }
    expect(points).toBe(4 * 4 * 3 * 19);
  });

  test('⚠ the shapes the two slices could not reach, pinned as literals', () => {
    // ⚠ `12a-A6` named this one: `live`, no alarms, no band, three sources unread is reachable
    // — it is the first frames of any page load on a half-blind box — and NO test in the tree
    // asserted the string it produces. The slices could not: one pinned the band at `normal`,
    // the other read only `severity`.
    expect(aggregateStatus('live', 0, null, 3).text).toBe('no readings · 3 sources unread');
    // The mode × band corners, which 4 + 4 slices never visit.
    expect(aggregateStatus('paused', 0, null, 2).text).toBe('paused · 2 sources unread');
    expect(aggregateStatus('stale', 6, 'alarm', 1).text).toBe('stale · 6 alarms · 1 source unread');
    expect(aggregateStatus('stale', 6, 'alarm', 1).severity).toBe('alarm');
    expect(aggregateStatus('live', 1, 'watch', 18).text).toBe('1 alarm · 18 sources unread');
    // And the glyphs, as literals, so the table cannot be swapped silently.
    expect(aggregateStatus('paused', 0, 'normal', 0).glyph).toBe('❙❙');
    expect(aggregateStatus('stale', 0, 'normal', 0).glyph).toBe('⊘');
  });

  test('⚠ every §3.7 source failing at once is eighteen, and a second entry on each is still eighteen', () => {
    // The ceiling of the axis, taken from a real snapshot rather than from the number 18 — and
    // doubled, because "distinct sources" and "entries" agree on the first list and not on the
    // second. This is the same discrimination the four-entry fixture above exists for, applied
    // to the whole union at once.
    const one: TelemetryError[] = SOURCES.map((source) => ({ source, message: `${source}: unreadable` }));
    expect(failingSourceCount({ ...everythingZero, errors: one })).toBe(18);
    expect(failingSourceCount({ ...everythingZero, errors: [...one, ...one] })).toBe(18);
    expect(aggregateStatus('live', 0, 'normal', 18).text).toBe('18 sources unread');
    expect(aggregateStatus('paused', 6, 'alarm', 18).text).toBe('paused · 6 alarms · 18 sources unread');
  });
});

describe('12a — the status text is an UNBOUNDED string in a band whose height is a constant', () => {
  test('the longest text this function can produce stays far inside the measured wrap threshold', () => {
    // ⚠ Why this exists. `--band-reserve: 102px` is a CONSTANT §6.1's row arithmetic subtracts
    // from `100vh`, and `.status` in `header.module.css` is `white-space: nowrap` with no
    // `max-width` — so a longer status string is the same class of hazard as the unbounded
    // hostname 10h had to truncate. 12a makes this string longer, so it is measured in real
    // headless Chrome at 1280×1024, the tightest viewport §6.1 names.
    //
    // ⚠⚠ RE-TRANSCRIBED 2026-09-15 BY THE RECONCILIATION, FROM A PASSING RUN (`12a-A1`). This
    // comment used to carry a six-row table hand-measured by the BUILD phase in a scratch page,
    // because `measure-breakpoints.mjs` could not log in that day. Four of its six rows —
    // `all healthy` 76.5 px, `6 alarms` 55.6 px, `1 source unread` 104.3 px,
    // `paused · 6 alarms · 18 sources unread` 257.3 px, and the 500.6/507.5/71.8 px wrap
    // threshold — **cannot be reproduced from any passing run in this repository**: the scratch
    // page is gone and no standing record measures those strings. Under this loop's own rule
    // (*a number transcribed from a run nobody can repeat is not evidence*) they are STRUCK
    // rather than re-justified. What replaces them is record 15 of `measure-breakpoints.mjs`,
    // which re-measures on every run, and its numbers from the green run of 2026-09-15:
    //
    //   | measured on the HOSTILE page, 1280×1024   | value  |
    //   |-------------------------------------------|--------|
    //   | the status text on screen                 | `529 alarms · 18 sources unread` |
    //   | its width                                 | 208.6 px |
    //   | the header                                | 43.0 px — ONE row (4 painting children) |
    //   | the same header, absurd status string     | 98.1 px — wrapped |
    //
    // 18 is every §3.7 source failing at once, so the clause is at its ceiling and not an
    // estimate. The budget below is a cheap proxy for that paint measurement — it cannot see a
    // font change or a CSS edit, and it is not marked ⚠ for that reason — but it is what turns
    // a word added here into a decision rather than an accident.
    const longest = (['live', 'paused', 'stale', 'expired'] as const).flatMap((mode) =>
      [0, 6, 999].flatMap((alarms) =>
        ([null, 'normal', 'watch', 'alarm'] as const).flatMap((severity) =>
          [0, 1, 18].map((failing) => aggregateStatus(mode, alarms, severity, failing).text),
        ),
      ),
    ).reduce((a, b) => (b.length > a.length ? b : a), '');
    expect(longest).toBe('paused · 999 alarms · 18 sources unread');
    expect(longest.length).toBeLessThanOrEqual(45);
  });
});

/**
 * ⚠⚠ **12c/TEST — what §3.4's two rulings of 2026-09-17 cost the header, priced here.**
 *
 * Both new failure modes file an `errors[]` entry, so both reach this function — and
 * `failingSourceCount` counts §3.7 SOURCES, not entries. That makes the header's behaviour
 * under them worth stating rather than inferring:
 *
 * - a unit-name MISS is a `dbus` entry filed **on every poll for as long as the file exists**;
 * - a wire-REFUSED row is an `llama-env` entry, filed by the client itself.
 */
describe('⚠⚠ 12c/TEST — what a mapping miss and a refused row do to §9’s header line', () => {
  const withErrors = (errors: readonly TelemetryError[]): TelemetrySnapshot => ({ ...everythingZero, errors });

  test('⚠⚠ ONE unmappable `*.env` keeps the header out of `all healthy`, indefinitely', () => {
    // The consequence nobody costed. An operator who leaves a `backup.env` beside `0.env` gets
    // a loud row — which is the ruling working — and also loses the header's health claim on
    // every poll from then on, indistinguishably from a real D-Bus outage. Correct, and worth
    // knowing before it is met on the box.
    const miss = withErrors([
      {
        source: 'dbus',
        message: 'no systemd unit is known for instance `default` (`default.env` in /etc/llama-server), ' +
          'so its unit state and the cards it serves were not read',
        instance: 'default',
      },
    ]);
    expect(failingSourceCount(miss)).toBe(1);
    expect(aggregateStatus('live', 0, BANDED, failingSourceCount(miss)).text).not.toContain('all healthy');
    // ⚠ `all healthy` is REPLACED rather than appended to, so what is left is the clause alone.
    expect(aggregateStatus('live', 0, BANDED, failingSourceCount(miss)).text).toBe('1 source unread');
  });

  test('⚠⚠ a REFUSED row is `>= 1`, not an increment — a second entry from one source adds nothing', () => {
    // ⚠ The build's §2.2 reads *"a clean snapshot scores 0, a snapshot with one dropped row
    // scores 1"*, which is true only when the server filed nothing itself. `llama-env` is
    // already §3.4's source for the server's own env problems, so on a box that has one, a
    // dropped row moves the count by **zero**. The header is still not `all healthy` — the
    // count was already non-zero — and that is what the claim rests on. A future reader
    // tempted to display "N problems" from this number needs to know it is a source count.
    const serverAlready = withErrors([
      { source: 'llama-env', message: '/etc/llama-server/2.env: ENOENT' },
    ]);
    expect(failingSourceCount(serverAlready)).toBe(1);
    const plusRefusal = withErrors([
      { source: 'llama-env', message: '/etc/llama-server/2.env: ENOENT' },
      { source: 'llama-env', message: 'serving[1] was dropped: `port` did not validate' },
    ]);
    expect(failingSourceCount(plusRefusal)).toBe(1);
    expect(aggregateStatus('live', 0, BANDED, failingSourceCount(plusRefusal)).text).not.toContain('all healthy');
  });
});
