import { describe, expect, test } from 'vitest';

import { aggregateStatus, failingSourceCount } from './header-status';
import { everythingZero, nothingReadable } from '../fixtures';
import type { TelemetryError, TelemetrySnapshot } from '../types';
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
          { source: 'llama-env', message: '1.env: no MODEL', instance: 1 },
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

describe('12a — the status text is an UNBOUNDED string in a band whose height is a constant', () => {
  test('the longest text this function can produce stays far inside the measured wrap threshold', () => {
    // ⚠ Why this exists. `--band-reserve: 102px` is a CONSTANT §6.1's row arithmetic subtracts
    // from `100vh`, and `.status` in `header.module.css` is `white-space: nowrap` with no
    // `max-width` — so a longer status string is the same class of hazard as the unbounded
    // hostname 10h had to truncate. 12a makes this string longer, so it was measured in real
    // headless Chrome at 1280×1024 (the tightest viewport §6.1 names), against the header
    // markup and this project's own `tokens.css` + `header.module.css`:
    //
    //   | `.statusText`                             | width   | header |
    //   |-------------------------------------------|---------|--------|
    //   | `all healthy` (today, healthy)            |  76.5px | 43.0px |
    //   | `6 alarms` (today, worst)                 |  55.6px | 43.0px |
    //   | `1 source unread` (12a)                   | 104.3px | 43.0px |
    //   | `paused · 6 alarms · 18 sources unread`   | 257.3px | 43.0px |  ← 12a's WORST
    //   | the wrap threshold at 1280                | 500.6px | 43.0px |
    //   | one character past it                     | 507.5px | 71.8px |  ← the band breaks
    //
    // 18 is every §3.7 source failing at once, so that row is the ceiling and not an estimate.
    // 243px / 36 characters of margin at 1280; the header does not wrap at all at 1600 or 1920
    // within 60 extra characters. The budget below is a cheap proxy for that paint measurement
    // — it cannot see a font change or a CSS edit, and it is not marked ⚠ for that reason —
    // but it is what turns a word added here into a decision rather than an accident.
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
