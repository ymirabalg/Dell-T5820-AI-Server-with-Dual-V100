#!/usr/bin/env node
/**
 * 10a-F4's remaining half, closed by 10c-3 — the seven §6.1 breakpoint measurements, run
 * headlessly and repeatably, replacing the interactive `resize_window` tool 10c-1 found
 * broken (`window.innerWidth` read a constant 3440 across every resize call — a tooling
 * limit of that OS-level-window automation, not a finding about the app; see `10c1-build.md`
 * §3.1/§3.3, which named the fix as "a headless test runner's `setViewportSize`").
 *
 * ⚠ NOT wired into `pnpm verify`. `ANCHOR.md` §9 / §4: green is `pnpm verify` exiting 0, one
 * deterministic command, never dependent on a real browser binary being present — and this
 * project's own standing rule is "never run two harnesses at once". This is a **separate,
 * opt-in, slower command**, exactly what 10c-1's §3.3 recommended for "a future loop":
 *
 *     export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
 *     node pipeline/steps/10-panels-assembly/measure-breakpoints.mjs
 *
 * ### ⚠ What 10c-3's RECONCILIATION changed here, and why each was load-bearing
 *
 * The first version of this script reported `6/7 PASS`. Two of those numbers were wrong:
 *
 * - **A3 — measurement 6 was VACUOUS.** It asked for `[data-slot="storage"]` and
 *   `[data-slot="log"]`; the grid renders `storage-and-network` and `session-event-log`. Both
 *   `querySelector`s returned `null`, the ordering predicate skipped `null`s, and it printed
 *   `PASS … -> STORAGE -> LOG` having compared nothing. Fixed at both ends: real names, and a
 *   missing slot is now a hard failure, plus a new **measurement 0** that asserts all nine
 *   render at all. Measurement 4 had the same shape — `gridTemplateColumns` computes to
 *   `'none'` on a non-grid, which split to length 1 and "passed" the 1-column assertion.
 * - **A1 — §6.1's one quantitative promise was never measured**, and the 1280 checkpoint ran at
 *   height 900, below the ≥1024 the promise is conditioned on. **Measurement 9** measures it.
 * - **A2 — the sparkline↔chart promotion had never been observed in EITHER direction.** A
 *   response-interception fixture (`installGpuFabrication`) makes both sides observable on a
 *   GPU-less machine, and **measurement 8** is the design-target side that nothing ever checked.
 *   The two wrappers are also identified by `data-role` now rather than by `svgs[0]`/`svgs[1]`.
 * - **A10 — `BLOCKED` is now distinct from `FAIL`** and the exit code means something again.
 * - **A11 — `next-env.d.ts` is restored** by this script instead of by a prose instruction.
 *
 * ### The dependency, and what it costs (invariant 6 — verify, don't assert)
 *
 * `playwright-core` (devDependency, ~1.1s to install, no native modules) — deliberately NOT
 * plain `playwright`, which bundles a Chromium download. This script launches the SYSTEM
 * Google Chrome already on the machine (`executablePath` below) over CDP, so nothing is
 * downloaded and no browser binary is vendored into this repo.
 *
 * Verified, not assumed, exactly the way 10a proved jsdom absent from `.next/standalone`:
 *
 *     pnpm build && grep -rl playwright-core .next/standalone   # -> no matches (see build notes)
 *
 * `playwright-core` is imported by NOTHING under `app/`, `lib/`, `components/` or `proxy.ts` —
 * only by this script, which `next build`'s tracer never walks — so the same "test-only code
 * never reaches the production bundle" argument that cleared jsdom and `force-alarm.ts`
 * applies here without qualification (unlike `force-alarm.ts`'s own code, which DID ship
 * despite being unreachable — that was about a *reachable* module; this one is not imported by
 * the app at all).
 *
 * ### Why not add it to `pnpm verify`
 *
 * A `getBoundingClientRect`/`getComputedStyle` assertion here is real signal a text-only guard
 * cannot produce (HANDOVER §0.6's three-tier CSS table: this is a "paint" question). But it
 * needs a real Chrome present, a spawned `next dev` server, and a generated credential pair —
 * three things `pnpm verify`'s single deterministic command has never needed. Keeping it
 * separate keeps `pnpm verify` exactly as fast and as free of a browser-runtime prerequisite as
 * it has always been; a future CI step can run this one explicitly when a real browser is
 * available, the same way `dashboard.sh check` (step 11) is a distinct command from the
 * build.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright-core';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const PORT = 39173; // an unlikely-to-collide, fixed port for this one-shot script
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

// `scripts/hash-password.py` requires >=6 chars, at least one letter AND one digit — a
// random base64url slice alone occasionally lacks a digit (measured: it happened on the
// second real run of this script). `measure1-` guarantees both unconditionally.
const PASSWORD = `measure1-${randomBytes(9).toString('base64url')}`;

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    const probe = spawnSync('test', ['-x', candidate]);
    if (probe.status === 0) return candidate;
  }
  return null;
}

function hashPassword(password) {
  const result = spawnSync('python3', [path.join(ROOT, 'scripts/hash-password.py')], {
    input: password,
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`hash-password.py failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`server did not come up at ${url} within ${timeoutMs}ms`);
    await delay(300);
  }
}

/**
 * ⚠ 10c-3/A3 — THESE ARE THE NAMES `grid.tsx` ACTUALLY RENDERS, and the two at the end are the
 * whole reason this constant now exists separately from the prose.
 *
 * This list used to end `'storage', 'log'`. The grid renders `data-slot="storage-and-network"`
 * and `data-slot="session-event-log"`. Attribute selectors are exact-match, so both
 * `querySelector` calls returned `null`, `rectsOf` mapped both to `null`, and the ordering
 * predicate — which skipped a `null` rather than failing on it — printed
 * `PASS  6. … -> STORAGE -> LOG` having compared neither. **Two phases read that PASS line as
 * evidence.** The two positions it skipped are exactly the two §6.1 is silent about and
 * `grid.module.css` had to decide by hand under invariant 7.
 *
 * The fix is two-part and both halves matter: the names are right now, AND `rectsOf` fails
 * loudly on a slot it cannot find instead of returning a `null` a predicate can step over.
 * `SLOTS` is the full set §6.1 places; a rename in `grid.tsx` now breaks this script visibly.
 */
const SLOTS = [
  'gpu0',
  'gpu1',
  'cooling',
  'cpu',
  'memory',
  'safety',
  'storage-and-network',
  'serving',
  'session-event-log',
];

/** §6.1's `<900px` row, as the slot-name order the priority band asserts. */
const PRIORITY_ORDER_900 = [
  'gpu0',
  'gpu1',
  'cooling',
  'safety',
  'serving',
  'cpu',
  'memory',
  'storage-and-network',
  'session-event-log',
];

/**
 * §6.1's ONLY quantitative promise, and the three sizes it applies to.
 *
 * ⚠ 10c-3/A1 — none of measurements 1-7 checked this, and the 1280 checkpoint used to be
 * measured at height **900**, below the ≥1024 the promise is explicitly conditioned on, so it
 * could not have observed it even incidentally. §6.1: *"The 'no scroll' promise holds at
 * ≥1280px wide and ≥1024px tall … At 1920×1080 it fits comfortably"*, clarified 2026-09-08 to
 * *"what the promise forbids is the GRID growing past the viewport."*
 */
const NO_SCROLL_VIEWPORTS = [
  { width: 1280, height: 1024 },
  { width: 1600, height: 1024 },
  { width: 1920, height: 1080 },
];

async function measure(page) {
  const results = { pass: [], fail: [], blocked: [] };
  /** ⚠ A10: `blocked` is a THIRD state, distinct from `fail`. A FAIL used to mean either "the
   *  layout regressed" or "this dev machine cannot produce the precondition", and the two
   *  printed identically. Only a real disagreement with §6.1 now sets a non-zero exit code. */
  const record = (name, status, detail) => results[status].push({ name, detail });
  const ok = (cond) => (cond ? 'pass' : 'fail');

  const columnsOf = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-slot="gpu0"]');
      const grid = el ? el.parentElement : null;
      if (!grid) return { error: 'no [data-slot="gpu0"] in the document' };
      const style = getComputedStyle(grid);
      // ⚠ 10c-3/A3b: `gridTemplateColumns` computes to the literal `'none'` on any element that
      // is not a grid, and `'none'.split(/\s+/).filter(Boolean).length === 1` — so the old
      // reading "passed" measurement 4 (1 column) on a non-grid element. Wrap the grid in one
      // extra div and it kept saying PASS. Ask whether it is a grid at all, first.
      if (!style.display.includes('grid')) return { error: `parent is display:${style.display}, not a grid` };
      const tracks = style.gridTemplateColumns.trim();
      if (tracks === 'none' || tracks === '') return { error: `gridTemplateColumns: ${tracks || '(empty)'}` };
      return { columns: tracks.split(/\s+/).filter(Boolean).length, tracks };
    });

  /** Every named slot's rect. ⚠ A missing slot is an ERROR carried in the result, never a
   *  `null` a caller's predicate can skip — see `SLOTS`. */
  const rectsOf = async (slots) =>
    page.evaluate(
      (names) =>
        Object.fromEntries(
          names.map((n) => {
            const el = document.querySelector(`[data-slot="${n}"]`);
            if (!el) return [n, { missing: true }];
            const r = el.getBoundingClientRect();
            return [n, { x: r.x, y: r.y, width: r.width, height: r.height }];
          }),
        ),
      slots,
    );

  const missingIn = (rects) => Object.keys(rects).filter((k) => rects[k]?.missing === true);

  // ---- 0. every slot §6.1 places is actually in the document --------------------------
  // The anti-vacuity net for measurements 1, 5 and 6: they all read rects by slot name, and
  // an assertion whose subject does not render cannot fail (HANDOVER §0.6).
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(120);
  const allSlots = await rectsOf(SLOTS);
  const missingSlots = missingIn(allSlots);
  record('0. every §6.1 slot is present in the DOM (the anti-vacuity net for 1, 5 and 6)', ok(missingSlots.length === 0), {
    missingSlots,
    found: Object.keys(allSlots).filter((k) => allSlots[k]?.missing !== true),
  });

  // ---- 1600px: sparkline promoted to full chart inside GPU 0 --------------------------
  const promotionAt = async () =>
    page.evaluate(() => {
      // ⚠ A2: BY NAME, not `svgs[0]`/`svgs[1]` positionally. See `gpu-panel.tsx`'s comment.
      const spark = document.querySelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]');
      const full = document.querySelector('[data-slot="gpu0"] [data-role="gpu-full-chart-wrap"]');
      if (spark === null || full === null) {
        const el = document.querySelector('[data-slot="gpu0"]');
        return {
          blocked: true,
          sparklineWrapPresent: spark !== null,
          fullChartWrapPresent: full !== null,
          gpu0Text: (el?.textContent ?? '').slice(0, 200),
        };
      }
      return {
        blocked: false,
        sparklineDisplay: getComputedStyle(spark).display,
        fullChartDisplay: getComputedStyle(full).display,
        sparklineSvgs: spark.querySelectorAll('svg').length,
        fullChartSvgs: full.querySelectorAll('svg').length,
      };
    });

  const promo1920 = await promotionAt();
  record(
    '7. >=1600px: GPU 0 shows the promoted chart, not the sparkline',
    promo1920.blocked
      ? 'blocked'
      : ok(
          promo1920.sparklineDisplay === 'none' &&
            promo1920.fullChartDisplay !== 'none' &&
            promo1920.fullChartSvgs > 0,
        ),
    promo1920,
  );

  // ---- 1280-1599px: the OTHER side of the same media query ---------------------------
  // ⚠ A2: two sides, and neither had ever been observed — including the design target. Both
  // failure modes (two charts stacked, or none at all) are silent in `pnpm verify`.
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.waitForTimeout(120);
  const promo1280 = await promotionAt();
  record(
    '8. 1280-1599px (the design target): GPU 0 shows the sparkline, not the promoted chart',
    promo1280.blocked
      ? 'blocked'
      : ok(
          promo1280.fullChartDisplay === 'none' &&
            promo1280.sparklineDisplay !== 'none' &&
            promo1280.sparklineSvgs > 0,
        ),
    promo1280,
  );

  // ---- 1280px: the design target, 4 columns, COOLING spans rows 2-3 in cols 1-2 -------
  // ⚠ A1: measured at height 1024, not 900 — the height §6.1's promise is conditioned on.
  const cols1280 = await columnsOf();
  const rects1280 = await rectsOf(['gpu0', 'gpu1', 'cooling', 'cpu', 'safety']);
  const missing1280 = missingIn(rects1280);
  const coolingSpans =
    missing1280.length === 0 &&
    Math.abs(rects1280.cooling.x - rects1280.gpu0.x) < 2 &&
    Math.abs(rects1280.cooling.width - rects1280.gpu0.width) < 2 &&
    rects1280.cooling.height > rects1280.cpu.height * 1.5;
  record('3. 1280px: 4-column layout (the design target)', ok(cols1280.columns === 4), cols1280);
  record('1. >=1280px: COOLING spans rows 2-3 in columns 1-2', ok(coolingSpans), { missing1280, rects1280 });

  // ---- 1279px: still the 2-column band ------------------------------------------------
  await page.setViewportSize({ width: 1279, height: 1024 });
  await page.waitForTimeout(120);
  const cols1279 = await columnsOf();
  record('2. 1279px side of the 900/1280 breakpoint: 2-column layout', ok(cols1279.columns === 2), cols1279);

  // ---- 900px: 2-column layout begins, COOLING full width ------------------------------
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(120);
  const cols900 = await columnsOf();
  const rects900 = await rectsOf(['gpu0', 'gpu1', 'cooling']);
  const missing900 = missingIn(rects900);
  const coolingFullWidth900 =
    missing900.length === 0 &&
    Math.abs(rects900.cooling.width - (rects900.gpu1.x + rects900.gpu1.width - rects900.gpu0.x)) < 2;
  record('5. 900px side: 2-column layout, COOLING full width', ok(cols900.columns === 2 && coolingFullWidth900), {
    cols900,
    missing900,
    rects900,
  });

  // ---- 899px: back to 1 column, priority order ----------------------------------------
  await page.setViewportSize({ width: 899, height: 1400 });
  await page.waitForTimeout(120);
  const cols899 = await columnsOf();
  record('4. 899px side of the 900px breakpoint: 1-column layout', ok(cols899.columns === 1), cols899);

  // ---- <900px priority order, e.g. 500px ----------------------------------------------
  await page.setViewportSize({ width: 500, height: 2400 });
  await page.waitForTimeout(120);
  const rectsAll = await rectsOf(PRIORITY_ORDER_900);
  const missingAll = missingIn(rectsAll);
  // ⚠ A3: NO null tolerance. Every one of the nine must be present and in order, or this fails.
  const ys = PRIORITY_ORDER_900.map((n) => rectsAll[n]?.y);
  const orderedCorrectly =
    missingAll.length === 0 && ys.every((y, i) => i === 0 || (typeof y === 'number' && y >= ys[i - 1]));
  record(
    '6. <900px: panel priority order (GPUs -> COOLING -> SAFETY -> SERVING -> CPU/MEMORY -> STORAGE & NETWORK -> SESSION EVENT LOG)',
    ok(orderedCorrectly),
    { missingAll, ys, rectsAll },
  );

  // ---- 9. §6.1's no-scroll promise ----------------------------------------------------
  await recordFit(page, record, '9');

  return results;
}

/**
 * §6.1's no-scroll promise at each of the three viewports, recorded under `label`.
 *
 * ⚠ 10c-3/A1. One `page.evaluate` per size. This is the number §6.1 actually commits to and the
 * only one in this file that can put the SPEC, rather than the build, in the wrong. ⚠ Extracted
 * from `measure` by 10f so measurement **10** — the real-box degraded fixture — grades the page
 * with the identical primitives rather than a second, agreeing implementation of them
 * (HANDOVER §0.8: *"two views of one dataset must be computed from ONE derivation"*).
 */
async function recordFit(page, record, label) {
  for (const vp of NO_SCROLL_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const children = [...document.body.children].map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), y: Math.round(r.y), height: Math.round(r.height) };
      });
      const grid = document.querySelector('[data-slot="gpu0"]')?.parentElement ?? null;
      const gridRect = grid ? grid.getBoundingClientRect() : null;
      // Per-slot heights, so a reader deciding what would have to change can see WHICH panels
      // the overflow is in rather than only that there is some.
      const slots = Object.fromEntries(
        [...document.querySelectorAll('[data-slot]')].map((el) => [
          el.getAttribute('data-slot'),
          Math.round(el.getBoundingClientRect().height),
        ]),
      );
      return {
        scrollHeight: doc.scrollHeight,
        clientHeight: doc.clientHeight,
        grid: gridRect ? { y: Math.round(gridRect.y), height: Math.round(gridRect.height) } : null,
        bodyChildren: children.filter((c) => c.height > 0),
        slotHeights: slots,
      };
    });
    // ⚠ `spare` is measured from the CONTENT bottom, never from `scrollHeight`:
    // `documentElement.scrollHeight` is defined as at least the viewport height, so on any page
    // that FITS it equals `clientHeight` and the difference is a constant 0. The grid's bottom
    // is the page's bottom here (the sticky band is the only other body child, and it sits
    // above the grid). Reported on PASS as well as FAIL — a promise met by 2 px and one met by
    // 100 are the same word and very different facts. Same correction `check-density.mjs`
    // carries for its own spare check, 2026-09-09.
    const contentBottom = overflow.grid === null ? null : overflow.grid.y + overflow.grid.height;
    record(
      `${label}. ${vp.width}x${vp.height}: §6.1's no-scroll promise — the grid does not grow past the viewport`,
      overflow.scrollHeight <= overflow.clientHeight ? 'pass' : 'fail',
      {
        ...overflow,
        overflowPx: overflow.scrollHeight - overflow.clientHeight,
        contentBottom,
        spare: contentBottom === null ? null : overflow.clientHeight - contentBottom,
      },
    );
  }
}

/**
 * ⚠ 10c-3/A2 — the fixture that makes measurement 7 (and its 1280-1599px twin) OBSERVABLE on a
 * GPU-less machine, and why it lives HERE rather than in `lib/client/`.
 *
 * `/api/telemetry` on this dev Mac returns `gpus: null` (no NVIDIA driver — `CLAUDE.md`: "there
 * is no compute GPU"), which sends `GpuPanel` down its `snapshot.gpus === null` takeover branch:
 * one `<p>` and an error note, and NEITHER wrapper in the DOM. So the media query the
 * measurement is about has nothing to measure, in either direction.
 *
 * `force-alarm.ts` cannot help: it returns the body unchanged unless `gpus` is already a
 * non-empty array, so it is structurally inert here. The adversarial's recommendation was to
 * extend that seam to FABRICATE a `gpus` array — correct about the need, and this does it a
 * cheaper way that costs the product nothing: **intercept the response in the measuring browser
 * itself.** No production code learns a new behaviour, nothing new ships in `.next/static`, and
 * no second `NODE_ENV`/query-flag gate has to be reasoned about. The client, the wire validator,
 * the ring, `traceFor` and the panel all run completely unmodified against a real response body
 * with one collection rewritten in flight.
 *
 * Invariant 2 is untouched — this rewrites a RESPONSE in the browser's memory and never builds
 * a request; the box is read-only here as everywhere.
 *
 * ⚠ Every field is present, because `wire.ts`'s `gpuOf` rejects a card missing any key (each is
 * `T | null`, and `undefined` is not `null`). Values are ordinary, not alarming: an alarm would
 * pin §6.4's banner and add height, and measurement 9 is deliberately the MOST FAVOURABLE case.
 */
const fabricatedCard = (index) => ({
  index,
  name: 'Tesla PG500-216',
  bus: `00000000:${index === 0 ? '17' : '65'}:00.0`,
  tempC: 62 + index,
  powerW: 231,
  powerCapW: 250,
  memUsedMiB: 26452,
  memTotalMiB: 32768,
  utilPct: 97,
  smClockMHz: 1290,
  throttleReasons: '0x0000000000000004',
});

/**
 * ⚠ 10f/Q1 — THE REAL-BOX DEGRADED FIXTURE, and why it is not the dev Mac's.
 *
 * Measurement 9 grades a page on which all seven non-GPU collectors have failed, because that
 * is what `/api/telemetry` returns on THIS Mac (no Linux, no hwmon, no `/proc/meminfo`) — and
 * every one of those messages is a long absolute path. It is a real and useful worst case, but
 * it is not the machine the dashboard is for, and 10e's build argued the residual overflow away
 * on exactly that ground (*"the messages that wrap are dev-Mac paths … that the real box does
 * not produce"*). 10e-A10 measured that argument false: **`lib/collectors/safety.ts`'s DKMS
 * failure is the box's own documented failure mode** — `CLAUDE.md`: *"DKMS only builds for the
 * RUNNING kernel … the next reboot would have landed on a kernel with no `pwm5`"* — it is 150
 * characters, and it measured **65.6 px** in the 285 px SAFETY column against §2.11's 14.2 px
 * budget.
 *
 * So this fixture is that failure, and nothing else: a healthy box (`fixtureBox` below carries
 * `CLAUDE.md`'s own figures) on which DKMS has not built for the running kernel, so `pwm5` is
 * gone. It puts the DKMS message under SAFETY, `collectCooling`'s own `pwm5`-node message under
 * COOLING **and** on SAFETY's `pwm5` row, and blanks `fan5`. Both strings are copied from the
 * collectors that emit them, so a reworded message changes this fixture rather than silently
 * leaving it grading something the box no longer says.
 */
const DKMS_RELEASE = '7.0.0-31-generic';
const DKMS_MESSAGE =
  `/lib/modules/${DKMS_RELEASE}/updates/dkms: does not exist — DKMS has not built the 5-fan ` +
  `module for \`${DKMS_RELEASE}\`, so the next boot loses \`pwm5\``;
const DELL_SMM_MESSAGE =
  '/sys/class/hwmon/hwmon3: no `pwm5` node — the DKMS 5-fan module did not load, ' +
  'so channel 5 is uncontrollable';

/** The healthy box, from `CLAUDE.md` — the same values `mocks/measure-arrangements.mjs` uses. */
const fixtureBox = () => ({
  ts: new Date().toISOString(),
  hostname: 'ai-server',
  standing: [],
  gpus: [fabricatedCard(0), fabricatedCard(1)],
  host: {
    cpuPct: 31.4,
    loadAvg: [2.14, 1.87, 1.62],
    cpuTempC: 47,
    memUsedGiB: 33.2,
    memTotalGiB: 61.6,
    swapUsedGiB: 0,
    swapTotalGiB: 8,
    uptimeSec: 180_063,
    kernel: DKMS_RELEASE,
    cpuModel: 'Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz',
    cores: 6,
    threads: 12,
  },
  cooling: {
    fan1Rpm: 1001,
    fan2Rpm: 725,
    fan3Rpm: 716,
    fan4Rpm: 1102,
    fan5Rpm: 4308,
    ch5Mode: 'manual',
    ch5Pwm: 255,
    serviceState: 'active',
  },
  serving: [
    { instance: 0, port: 8080, unitState: 'active', model: 'qwen3.6-27b', ctx: 131072, health: 'ok' },
    { instance: 1, port: 8081, unitState: 'active', model: 'qwen3.6-27b', ctx: 131072, health: 'ok' },
  ],
  storage: {
    root: { usedGiB: 41.7, totalGiB: 233.1 },
    home: { usedGiB: 312.4, totalGiB: 915.8 },
    net: { rxBytesPerSec: 184_320, txBytesPerSec: 2_621_440, link: 'up' },
  },
  safety: { ufwEnforcing: true, pwm5Present: true, dkmsForRunningKernel: true, fanServiceState: 'active' },
  errors: [],
});

const fixtureBoxDegraded = () => {
  const box = fixtureBox();
  return {
    ...box,
    cooling: { ...box.cooling, fan5Rpm: null, ch5Mode: null, ch5Pwm: null },
    safety: { ...box.safety, pwm5Present: false, dkmsForRunningKernel: false },
    errors: [
      { source: 'dell-smm', message: DELL_SMM_MESSAGE },
      { source: 'dkms', message: DKMS_MESSAGE },
    ],
  };
};

/** Which body the route handler serves. Read on every poll, so it can be switched mid-run. */
const fabrication = { mode: 'gpus-only' };

async function installGpuFabrication(page) {
  await page.route('**/api/telemetry**', async (route) => {
    const response = await route.fetch();
    if (response.status() !== 200) {
      await route.fulfill({ response });
      return;
    }
    let body;
    try {
      body = await response.json();
    } catch {
      await route.fulfill({ response });
      return;
    }
    const replaced =
      fabrication.mode === 'box-degraded'
        ? { ...fixtureBoxDegraded(), ts: body.ts ?? new Date().toISOString() }
        : { ...body, gpus: [fabricatedCard(0), fabricatedCard(1)] };
    await route.fulfill({
      response,
      contentType: 'application/json',
      body: JSON.stringify(replaced),
    });
  });
}

/**
 * Measurement 10 — §6.1's promise on the REAL BOX's own degraded page.
 *
 * ⚠ It asserts its own precondition FIRST (HANDOVER §0.8: *"a measurement that names a subject
 * must prove the subject EXISTS"*). A fixture that failed to take — a wire-validation refusal, a
 * route that stopped matching — would otherwise be graded as a healthy page and reported PASS,
 * which is the shape 10c-3/A3 found twice in this very file. Proved non-vacuous by breaking the
 * fixture on purpose (`10f-test.md` §5): the precondition FAILS and the script exits 1, while
 * the three fit measurements under it still say PASS — which is exactly why it exists.
 *
 * ### ⚠ What this PASS does and does not mean (10f-A9, recorded 2026-09-09)
 *
 * Three limits, none of them errors, all of them worth knowing before quoting the line:
 *
 * 1. **It is a CONTAINMENT check, not an exclusivity one.** It asserts the DKMS text is under
 *    SAFETY, not that it is under SAFETY *only*. `panelsForSource` maps `dkms -> ['safety']`
 *    today, so it can land nowhere else — but adding a second panel to that list is a one-line
 *    edit in `lib/client/observations.ts` and this would still report PASS with an extra well on
 *    the page. Deliberately not tightened: exclusivity is `panelsForSource`'s own property,
 *    guarded by `lib/client/observations.test.ts` under step 8's harness, and a second
 *    derivation of a guarded fact is what HANDOVER §0.8 tells this project not to build. The
 *    same check is already half-blind the other way: `dell-smm -> ['cooling', 'safety']`, so
 *    `DELL_SMM_MESSAGE` renders in TWO panels and the precondition names only COOLING.
 * 2. **It is evaluated ONCE**, at `NO_SCROLL_VIEWPORTS[0]`, before `recordFit` changes the
 *    viewport three times. A fixture that took at 1280 and stopped taking at 1920 would not be
 *    seen — nothing makes that possible today (the response is the same at every size).
 * 3. **`textContent` sees text that is not visible**: a `display: none` subtree, or a message
 *    scrolled out of one of Q1's bounded wells. So "the fixture took" is strictly weaker than
 *    "the fixture is on screen". The fit is measured separately and does not depend on it.
 */
async function measureBoxDegraded(page, record) {
  await page.setViewportSize(NO_SCROLL_VIEWPORTS[0]);
  await page.waitForTimeout(200);
  const present = await page.evaluate(
    ([dkms, dellSmm]) => {
      const textOf = (slot) =>
        document.querySelector(`[data-slot="${slot}"]`)?.textContent?.replace(/\s+/g, ' ') ?? '';
      const safety = textOf('safety');
      const cooling = textOf('cooling');
      const flat = (s) => s.replace(/\s+/g, ' ');
      return {
        dkmsUnderSafety: safety.includes(flat(dkms)),
        dellSmmUnderCooling: cooling.includes(flat(dellSmm)),
        safetySample: safety.slice(0, 240),
        coolingSample: cooling.slice(0, 240),
      };
    },
    [DKMS_MESSAGE, DELL_SMM_MESSAGE],
  );
  record(
    "10. the real-box degraded fixture TOOK — the DKMS message is under SAFETY and dell-smm's under COOLING",
    present.dkmsUnderSafety && present.dellSmmUnderCooling ? 'pass' : 'fail',
    present,
  );
  await recordFit(page, record, '10');
}

async function main() {
  const chromePath = findChrome();
  if (chromePath === null) {
    console.error('No system Chrome/Chromium found at the expected install paths — see CHROME_CANDIDATES.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = hashPassword(PASSWORD);
  const sessionSecret = randomBytes(32).toString('base64url');

  // ⚠ 10c-3/A11: `next dev` rewrites this TRACKED file on every run. Two phases documented a
  // manual `git checkout -- next-env.d.ts` afterwards, which is prose standing in for the one
  // check ANCHOR §4 calls "the primary check" — so restore it here instead, byte for byte.
  const nextEnvPath = path.join(ROOT, 'next-env.d.ts');
  const nextEnvBefore = readFileSync(nextEnvPath, 'utf8');

  console.log(`Starting next dev on :${PORT} with an ephemeral credential pair (not written to disk)...`);
  // ⚠ `detached: true` so this spawns its OWN process group: `pnpm exec next dev` spawns
  // `next dev` as a grandchild, and a plain `server.kill()` only ever reached the `pnpm`
  // process, leaving `next dev` (and the port) alive — measured here, the hard way, on the
  // second run of this script, which left a `next dev` bound to :39173 after "successful"
  // exit. Killing the NEGATIVE pid below signals the whole group.
  const server = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      PASSWORD_HASH: passwordHash,
      SESSION_SECRET: sessionSecret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  let browser = null;
  try {
    await waitForServer(`http://localhost:${PORT}/login`, 60_000);

    browser = await chromium.launch({ headless: true, executablePath: chromePath });
    const page = await browser.newPage();
    await installGpuFabrication(page);

    await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-slot="gpu0"]', { timeout: 15_000 });
    // Let the client hydrate and the grid settle before the first measurement.
    await page.waitForTimeout(500);

    // The GPU cards must be the REAL body, not the takeover branch, before anything is
    // measured — otherwise measurements 7/8 are blocked and 9 measures a page two panels short.
    await page.waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { timeout: 15_000 }).catch(() => {
      console.warn('⚠ GPU fabrication did not take — the takeover branch is still rendering. 7/8 will report BLOCKED.');
    });

    const results = await measure(page);

    // ---- 10f/Q1: the same promise, on the REAL BOX's own degraded page --------------------
    // Switch the fabricated body, reload so the client's ring starts clean, and re-grade.
    fabrication.mode = 'box-degraded';
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page
      .waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { state: 'attached', timeout: 20_000 })
      .catch(() => {
        console.warn('⚠ the box-degraded fixture did not take — measurement 10 will report it.');
      });
    await page.waitForTimeout(1200);
    const record10 = (name, status, detail) => results[status].push({ name, detail });
    await measureBoxDegraded(page, record10);

    console.log('\n=== 10a-F4 / §6.1 breakpoint measurements ===\n');
    for (const { name, detail } of results.pass) {
      console.log(`PASS     ${name}`);
      if (detail && typeof detail.spare === 'number') {
        console.log(`         spare ${detail.spare} px (content bottom ${detail.contentBottom}, viewport ${detail.clientHeight}); slots ${JSON.stringify(detail.slotHeights)}`);
      }
    }
    for (const { name, detail } of results.blocked) {
      console.log(`BLOCKED  ${name}`);
      console.log(`         ${JSON.stringify(detail)}`);
    }
    for (const { name, detail } of results.fail) {
      console.log(`FAIL     ${name}`);
      console.log(`         ${JSON.stringify(detail)}`);
    }
    const total = results.pass.length + results.fail.length + results.blocked.length;
    console.log(
      `\n${results.pass.length} passed, ${results.fail.length} failed, ${results.blocked.length} blocked by this environment, ${total} total.\n`,
    );
    // ⚠ A10: a BLOCKED measurement is not a failure — it is a precondition this machine cannot
    // produce, and it used to pin the exit code to 1 permanently, which meant the code carried
    // no information at all. Only a real disagreement with §6.1 is non-zero now.
    process.exitCode = results.fail.length === 0 ? 0 : 1;
  } finally {
    if (browser !== null) await browser.close();
    try {
      if (readFileSync(nextEnvPath, 'utf8') !== nextEnvBefore) {
        writeFileSync(nextEnvPath, nextEnvBefore);
        console.log('Restored next-env.d.ts (rewritten by `next dev`).');
      }
    } catch {
      // the file is generated; if it cannot be read back, `next build` regenerates it
    }
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // already gone
    }
    await delay(300);
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // already gone — the common case, this is a backstop
    }
  }
}

await main();
