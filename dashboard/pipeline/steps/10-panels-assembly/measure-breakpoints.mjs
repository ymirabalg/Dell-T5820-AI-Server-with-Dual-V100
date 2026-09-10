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
  // ⚠ 10h RECONCILE — and the half the caps made necessary: the page fitting is worth nothing
  // if a panel bought the fit by hiding a reading. See {@link recordNoClipping}.
  await recordNoClipping(page, record, '9');

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
        // ⚠ 10g — the sticky band, printed with the spare. It is the term §6.4's banner moves,
        // and it is NOT a slot: 10g's re-measurement of measurement 10 came back 7 px kinder
        // than 10f's with every one of the nine slots identical to the pixel, and the only
        // place the 7 px could be was here (a 65.7 px banner became 58.8). A page total whose
        // terms are all published except one is a page total nobody can reconcile.
        bandHeight: overflow.grid === null ? null : overflow.grid.y,
      },
    );
  }
}

/**
 * ⚠⚠ 10h RECONCILE — **THE OTHER HALF OF THE ACCEPTANCE, and the one this project did not
 * have.** No panel body hides a reading, at any of §6.1's three viewports, on `label`'s page.
 *
 * Why it exists, stated as plainly as it can be: **the row caps turned a VISIBLE failure into
 * an INVISIBLE one, and until this record nothing graded the new one.** Before 10h, too much
 * content made the PAGE scroll — loud, and measured by nine fit records. After 10h, too much
 * content makes a panel BODY scroll, which hides readings behind a fade on a wall panel with no
 * pointer, and every fit record still says PASS. The adversarial proved it end to end: a
 * compensating share pair (`--row1-max` 0.2286 → 0.2200 with `--row2-max` 0.3019 → 0.3105 — the
 * sum still exactly 1, both shares still clearing their healthy constants) clipped 7 px of GPU
 * readings off measurement 11's page while this script reported **44 passed, 0 failed**, and
 * m11's printed `spare` IMPROVED from 6 px to 12 px **because a panel had been clipped**. The
 * project's tightest fit number rewarded the defect.
 *
 * So: *"the page fits"* is necessary and no longer sufficient. This is the sufficient half.
 *
 * ⚠ **BOTH AXES.** `panel-shell.module.css` sets `overflow-y: auto` and nothing else, so CSS
 * computes `overflow-x: visible → auto`: every one of the nine bodies is a HORIZONTAL scroller
 * too (measured `auto/auto` on all nine, `10h-A5`). Nothing reaches it on today's content — a
 * 220-character ext4-legal filename and a 4000-character alias both wrap — but the fade is
 * `background-position: bottom` only, so a single `white-space: nowrap` child would put a
 * reading somewhere no affordance points and no record looked. It is graded here, on the axis
 * as well as the page.
 *
 * ⚠ **Anti-vacuity:** nine bodies must be FOUND. A selector that stopped matching would report
 * "nothing is clipped" forever, which is exactly the shape 10c-3/A3 and 10g's two vacuous
 * measurements had.
 *
 * ⚠ **Scope, deliberately: NOT the hostile page.** The caps exist so that hostile telemetry
 * clips instead of overflowing — clipping there is the ruling working, and measurement 14
 * reports what it clips rather than grading it away. What this grades is the pages the design
 * is SUPPOSED to hold whole: healthy, the real box's degraded page, and the arithmetic worst
 * case the shares were derived against.
 */
async function recordNoClipping(page, record, label) {
  for (const vp of NO_SCROLL_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(200);
    const bodies = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot]')].map((slot) => {
        const body = slot.querySelector('[data-role="panel-body"]');
        const cap = Number.parseFloat(getComputedStyle(slot).maxHeight);
        const round = (n) => Math.round(n * 10) / 10;
        return {
          slot: slot.getAttribute('data-slot'),
          found: body !== null,
          hiddenY: body === null ? null : body.scrollHeight - body.clientHeight,
          hiddenX: body === null ? null : body.scrollWidth - body.clientWidth,
          client: body === null ? null : body.clientHeight,
          scroll: body === null ? null : body.scrollHeight,
          // ⚠ The margin that MATTERS, and it is not the body's own: a body whose content is
          // shorter than its box reports `scrollHeight === clientHeight`, so "content vs box"
          // is 0 on every healthy panel and says nothing. What says how close this page is to
          // hiding a reading is how far each SLOT sits below its row's cap — the panel is its
          // own intrinsic height until it reaches that number, and clips from there on.
          cap: Number.isFinite(cap) ? round(cap) : null,
          slotHeight: round(slot.getBoundingClientRect().height),
          capMargin: Number.isFinite(cap) ? round(cap - slot.getBoundingClientRect().height) : null,
        };
      }),
    );
    const found = bodies.filter((b) => b.found).length;
    const clipped = bodies.filter((b) => (b.hiddenY ?? 0) > 1 || (b.hiddenX ?? 0) > 1);
    const margins = bodies.map((b) => b.capMargin).filter((m) => m !== null);
    record(
      `${label}. ${vp.width}x${vp.height}: NO panel body hides a reading — the page fits AND everything on it is on screen`,
      found === 9 && clipped.length === 0 ? 'pass' : 'fail',
      {
        bodiesFound: found,
        // Printed on PASS as well, and it is the number this record exists for. A page that
        // clips nothing by 0.8 px and one that clips nothing by 90 are the same word and very
        // different facts — and 0.8 px is what measurement 11 actually has.
        tightest: margins.length === 0 ? null : Math.min(...margins),
        tightestSlot:
          margins.length === 0
            ? null
            : (bodies.find((b) => b.capMargin === Math.min(...margins))?.slot ?? null),
        clipped: clipped.map(
          (b) => `${b.slot} hides ${b.hiddenY}px vertically and ${b.hiddenX}px horizontally`,
        ),
        bodies,
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

/**
 * ⚠ 10g/Q3 — MEASUREMENT 11'S FIXTURE: every source explained AND every reading present.
 *
 * This is NOT the all-collectors-failed page measurements 9 and 10 grade — a collector that
 * fails BLANKS its readings, which makes its panel shorter. This one keeps every reading and
 * adds every explanation, which is the arithmetic worst case: 10f's reconciliation measured it
 * **1 px OVER at 1600 x 1024** (spare 34.6 / -1.0 / 55.0) with §6.4's ordinary two-alarm
 * banner pinned, and that 1 px is what `10f-Q3`'s ruling was written to close. It was measured
 * from a scratch script that was never committed; it is a graded measurement now, so the next
 * loop re-measures it rather than re-deriving the fixture.
 *
 * All eighteen of §3.7's sources, each carrying the real 150-character DKMS message, plus the
 * two GPU temperatures held in the alarm band past §6.4's 10 s debounce (which is what pins
 * the banner — the 86/84 below, not a fabricated banner).
 */
const EVERY_SOURCE = [
  'nvidia-smi',
  'coretemp',
  'proc-stat',
  'proc-loadavg',
  'proc-cpuinfo',
  'proc-meminfo',
  'hostname',
  'proc-uptime',
  'proc-net-dev',
  'net-operstate',
  'dell-smm',
  'dbus',
  'llama-env',
  'llama-health',
  'llama-models',
  'statvfs',
  'ufw',
  'dkms',
];

const fixtureAllExplained = () => {
  const box = fixtureBox();
  return {
    ...box,
    gpus: [
      { ...box.gpus[0], tempC: 86 },
      { ...box.gpus[1], tempC: 84 },
    ],
    errors: [
      ...EVERY_SOURCE.map((source) => ({ source, message: DKMS_MESSAGE })),
      // ⚠ The two INSTANCE-TAGGED entries 10f's A3 fixture carried, and they are not
      // decoration: §4's `TelemetryError.instance` is what puts an explanation on a SERVING
      // ROW rather than in the panel's own block (10b-S-G), and two row wells are +40 px on
      // row 4 — the term that took that measurement's SERVING to 166.8 and made it, not the
      // session event log, the row's governor. Without them this fixture is 37 px kinder than
      // the one it is meant to reproduce.
      { source: 'llama-health', instance: 0, message: DKMS_MESSAGE },
      { source: 'llama-health', instance: 1, message: DKMS_MESSAGE },
    ],
  };
};

/**
 * ⚠ 10g/Q2 — MEASUREMENT 12'S FIXTURES: 2, 6, 12 and 21 alarm-level conditions.
 *
 * §6.4's banner was measured growing with its TEXT — 65.7 px at two alarms AND at six, 92.5 at
 * twelve, 173.1 / 146.2 / 119.4 at twenty-one — while every §6.1 budget treated it as a
 * constant. The ruling makes it a fixed two-line scrolling box, and the acceptance is EQUALITY
 * of the band height across those four counts with every condition still in the DOM.
 *
 * Each stage is a SUPERSET of the one before, and they are applied to a live page without a
 * reload: a condition that has already confirmed stays confirmed, so the four stages cost four
 * debounce waits rather than four page loads. The counts are exact and are asserted from the
 * banner's own count line, not assumed — `lib/client/observations.ts`'s `conditionsFrom` is
 * what turns these readings into conditions, and a fixture that produced 13 where this claims
 * 12 would otherwise be graded as though it had produced 12.
 *
 *  2 = gpu_temp x2
 *  6 = + gpu_vram x2, cpu_temp, ram (swap > 1 GiB)
 * 12 = + disk_free x2, unit:llama-server@{0,1}.service, health x2
 * 21 = + fan_stopped 1-4, fan5_absolute, link, ufw_enforcing, pwm5_present, dkms_for_running_kernel
 */
const BANNER_STAGES = [2, 6, 12, 21];

const fixtureAlarms = (count) => {
  const box = fixtureBox();
  const hot = (gpu, over = {}) => ({ ...gpu, ...over });
  const out = {
    ...box,
    gpus: [hot(box.gpus[0], { tempC: 86 }), hot(box.gpus[1], { tempC: 84 })],
  };
  if (count >= 6) {
    out.gpus = out.gpus.map((g) => ({ ...g, memUsedMiB: 32_200 }));
    out.host = { ...out.host, cpuTempC: 92, swapUsedGiB: 2 };
  }
  if (count >= 12) {
    out.storage = {
      ...out.storage,
      root: { usedGiB: 230, totalGiB: 233.1 },
      home: { usedGiB: 900, totalGiB: 915.8 },
    };
    out.serving = out.serving.map((i) => ({ ...i, unitState: 'failed', health: 'unreachable' }));
  }
  if (count >= 21) {
    out.cooling = {
      ...out.cooling,
      fan1Rpm: 0,
      fan2Rpm: 0,
      fan3Rpm: 0,
      fan4Rpm: 0,
      // ⚠ `fan5_absolute` alarms on the 0; `ch5Mode: null` keeps `fan5_engaged` out of the
      // count (§6.3's engaged band applies ONLY while engaged), so 21 really is 21.
      fan5Rpm: 0,
      ch5Mode: null,
      ch5Pwm: null,
    };
    out.storage = { ...out.storage, net: { ...out.storage.net, link: 'down' } };
    out.safety = {
      ...out.safety,
      ufwEnforcing: false,
      pwm5Present: false,
      dkmsForRunningKernel: false,
    };
  }
  return out;
};

/**
 * ⚠⚠ 10h — MEASUREMENT 14'S FIXTURE: the HOSTILE page, and it is the acceptance for §6.1's
 * 2026-09-10 ruling (*"the page then fits at every §6.1 viewport for any telemetry
 * whatsoever"*).
 *
 * ⚠ **Every browser fixture in this project hard-codes `throttleReasons: '0x…04'`, which is
 * not `notable`** (`fabricatedCard` above, `mocks/measure-arrangements.mjs`), so
 * `gpu-panel.tsx`'s `decode.notable` guard has meant that **no page this project has ever
 * measured rendered a throttle line at all** — which is exactly why 10g's four independent
 * ways to break the fold were invisible until an adversarial phase fabricated the mask by
 * hand. The fixtures were part of 10h's work; this is that work.
 *
 * Every hostile term, and what each one is:
 *
 * - **all eighteen of §3.7's sources explained**, each carrying the real 150-character DKMS
 *   message, plus the three instance-tagged `llama-health` entries that put an explanation on
 *   a SERVING *row* rather than in the panel block (§4's `TelemetryError.instance`, 10b-S-G);
 * - **a notable multi-bit mask on BOTH cards** — `0x…ec` is §6.3's four alarm bits plus the
 *   routine 250 W cap, measured at −40 px at 1600×1024 on its own (10g-A1);
 * - **three `llama-server` instances**, which §3.4 requires to work (*"a third card must
 *   appear without a code change"*) and which cost **+48 px** on SERVING, not the +20 that was
 *   once predicted;
 * - **path-valued models** on all three, the last unbounded string on the page (+21 px per
 *   SERVING row, +17.9 px per GPU card) — now rendered as filenames, so this fixture is also
 *   what proves that ruling is doing work;
 * - **every §6.3 alarm band standing at once** — the 21-condition set measurement 12 uses,
 *   verbatim, so the banner is pinned at its widest and every panel wears its alarm ground;
 * - **the session event log at its 500-entry cap** — see {@link HOSTILE_EXTRA_GPUS}.
 *
 * Measurement 14 additionally opens **every table view** before it grades the fit.
 */
const HOSTILE_MODEL_PATHS = [
  '/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf',
  '/home/yorman/models/Qwen3.5-35B-A3B-UD-Q4_K_M.gguf',
  '/home/yorman/models/gemma-4-12B-it-Q8_0.gguf',
];

/**
 * ⚠ How the log is driven to `lib/client/events.ts`'s `MAX_EVENTS` (500) inside a graded run.
 *
 * It cannot be done by churning the readings: §6.4 debounces every transition by **ten seconds
 * of wall time the client was SAMPLING**, so each confirmed band costs ~10 s and 500 entries
 * would cost minutes. What DOES log immediately is a **first sighting that is already
 * non-normal** (`events.ts`: *"a dashboard opened during an alarm must not show an empty
 * log"*), so one poll carrying N alarming subjects writes N entries.
 *
 * Extra GPU indices are the cheapest such subject: §3.1's `gpus` is an array of any length and
 * §6.1's grid renders GPU 0 and GPU 1 only, so an extra card adds three alarm conditions
 * (`gpu_temp`, `gpu_vram`, `gpu_throttle`) and **no panel**. 168 of them plus the 21 ordinary
 * conditions is past 500, so the log fills to its cap on the first poll — and, as a second
 * effect worth having, §6.4's banner is asked to account for five hundred conditions rather
 * than twenty-one, which is the direction that matters for the `+N more` ruling.
 *
 * ⚠ It is a fixture device, not a plausible machine: it manufactures the log's own documented
 * cap, which `session-event-log-panel.module.css` claims to absorb at `height: 84px`
 * (*"133.8 px whether the log holds one entry or five hundred"*, 10e — asserted, never measured
 * on a graded page until now).
 */
const HOSTILE_EXTRA_GPUS = 168;

/**
 * ⚠⚠ 10h RECONCILE — §3.2's `hostname`, the FIFTH unbounded term, now part of the hostile page.
 *
 * `--band-reserve: 102px` is a measured CONSTANT the row arithmetic subtracts from `100vh`, so
 * §6.1's promise holds only while the real band fits inside it — and `header.module.css`'s
 * `.header` is `flex-wrap: wrap` carrying this string, which §3.2 does not bound and no
 * formatter shortened. Measured by 10h's TEST phase, one field changed on this fixture:
 * `ai-server` (9 chars) and a 53-character FQDN both leave the band at **101.8 of 102** and the
 * page passing at +28; the 79-character FQDN below wrapped the header, took the band to
 * **130.7** and put measurement 14 at **1 px OVER** at 1280x1024 with every row cap holding and
 * every slot height identical to the passing run.
 *
 * The owner ruled the truncation on 2026-09-10 (*"one line, ellipsis, full string in the
 * `title` — the same rule as `model`"*) and it is built. This value is that measured breaker
 * with a second label chain appended, so the fixture proves the BOUND rather than a threshold:
 * it is roughly twice the length that used to break the fold, and the band record (m15) and the
 * fit records grade it at all three viewports.
 */
const HOSTILE_HOSTNAME =
  'ai-server.rack14.row-c.datacenter-east.corp.internal.example-holdings-group.com' +
  '.failover.pod7.mgmt.lab.example-holdings-group-international.example.com';

const hostileCard = (index) => ({
  ...fabricatedCard(index),
  bus: `00000000:${(index % 200).toString(16).padStart(2, '0')}:00.0`,
  tempC: 86,
  memUsedMiB: 32_200,
  // §6.3's four alarm bits beside the routine 250 W cap: the mask no measured page has ever
  // carried, and −16 px at 1600×1024 with only ONE notable bit set (10g-A1).
  throttleReasons: '0x00000000000000ec',
});

const fixtureHostile = () => {
  const alarms = fixtureAlarms(21);
  return {
    ...alarms,
    hostname: HOSTILE_HOSTNAME,
    gpus: [
      { ...hostileCard(0), tempC: 86 },
      { ...hostileCard(1), tempC: 84 },
      ...Array.from({ length: HOSTILE_EXTRA_GPUS }, (_, i) => hostileCard(i + 2)),
    ],
    serving: HOSTILE_MODEL_PATHS.map((model, instance) => ({
      instance,
      port: 8080 + instance,
      unitState: 'failed',
      model,
      ctx: 131072,
      health: 'unreachable',
    })),
    errors: [
      ...EVERY_SOURCE.map((source) => ({ source, message: DKMS_MESSAGE })),
      ...HOSTILE_MODEL_PATHS.map((_, instance) => ({
        source: 'llama-health',
        instance,
        message: DKMS_MESSAGE,
      })),
    ],
  };
};

/** Which body the route handler serves. Read on every poll, so it can be switched mid-run. */
const fabrication = { mode: 'gpus-only', alarms: 2 };

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
    const now = body.ts ?? new Date().toISOString();
    const replaced =
      fabrication.mode === 'box-degraded'
        ? { ...fixtureBoxDegraded(), ts: now }
        : fabrication.mode === 'box'
          ? { ...fixtureBox(), ts: now }
          : fabrication.mode === 'all-explained'
            ? { ...fixtureAllExplained(), ts: now }
            : fabrication.mode === 'alarms'
              ? { ...fixtureAlarms(fabrication.alarms), ts: now }
              : fabrication.mode === 'hostile'
                ? { ...fixtureHostile(), ts: now }
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
  // ⚠ 10h RECONCILE — the ORDINARY DEGRADED page. This one is the strongest of the four: the
  // four row shares are `healthy + surplus x growth / total growth`, and `growth` is exactly
  // the degraded growth 10f measured. A degraded page that clips is the derivation being wrong.
  await recordNoClipping(page, record, '10');
}

/**
 * Measurement 11 — §6.1's promise on the arithmetic worst case (10g/Q3).
 *
 * ⚠ Its own precondition first, like measurement 10's: the fixture is graded as a healthy page
 * if it fails to take, and this is the page the whole of 10g/Q3 is about. Three things are
 * asserted — the DKMS text really is under CPU (a source `panelsForSource` maps there) AND
 * under SAFETY, and §6.4's banner really is pinned with the count it should have. The banner
 * matters because the page is measured WITH it: a run in which the debounce had not elapsed
 * would measure a page 59 px shorter and call it a pass.
 */
async function measureAllExplained(page, record) {
  await page.setViewportSize(NO_SCROLL_VIEWPORTS[0]);
  await page.waitForTimeout(200);
  const present = await page.evaluate((dkms) => {
    const flat = (s) => s.replace(/\s+/g, ' ');
    const textOf = (slot) =>
      flat(document.querySelector(`[data-slot="${slot}"]`)?.textContent ?? '');
    const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
    const banner = band?.children[1] ?? null;
    const bannerText = banner ? flat(banner.textContent ?? '') : '';
    return {
      dkmsUnderCpu: textOf('cpu').includes(flat(dkms)),
      dkmsUnderSafety: textOf('safety').includes(flat(dkms)),
      bannerPinned: bannerText.includes('2 active alarms'),
      bannerHeight: banner ? Math.round(banner.getBoundingClientRect().height * 10) / 10 : null,
      bannerSample: bannerText.slice(0, 120),
    };
  }, DKMS_MESSAGE);
  record(
    '11. the all-sources-explained fixture TOOK — every source is explained, every reading present, and the two-alarm banner is pinned',
    present.dkmsUnderCpu && present.dkmsUnderSafety && present.bannerPinned ? 'pass' : 'fail',
    present,
  );
  await recordFit(page, record, '11');
  // ⚠⚠ 10h RECONCILE — THE record `10h-A3` asked for, on the page the adversarial clipped while
  // this script reported 44/44 and m11's printed spare IMPROVED. Its margins are the tightest
  // on any page this project grades — 0.8 / 0.8 / 2.9 / 1.3 px per row at 1600x1024 — so a
  // share moved by 0.002, which is exactly what an author edits when the task is "adjust the
  // shares", clips it. Until this line existed the four `test.each` literals in
  // `grid.test.tsx` were the entire defence of that page.
  await recordNoClipping(page, record, '11');
}

/**
 * Measurement 12 — §6.4's banner is a FIXED height whatever the count (10g/Q2).
 *
 * The stages are applied without a reload (see {@link fixtureAlarms}), each held past the 10 s
 * debounce. Two things are recorded per stage and both are preconditions of the third: the
 * count the banner itself prints (so a fixture that produced a different number of conditions
 * is caught rather than averaged in) and every condition's label still being in the DOM.
 *
 * ⚠ The equality check is per VIEWPORT, not across them: the banner's width differs at 1280 /
 * 1600 / 1920, and it is the count it must be independent of.
 */
async function measureBannerHeights(page, record) {
  const measured = {};
  for (const stage of BANNER_STAGES) {
    fabrication.alarms = stage;
    // ⚠ WAIT FOR THE COUNT, do not sleep a guessed interval. §6.4 confirms a band on ten
    // seconds of wall time the client was SAMPLING, and the first poll carrying a new reading
    // arrives up to a cadence late — so a fixed 13 s wait reached 12 of the 21 and the run
    // measured a page it then described as twenty-one alarms. Measured, first try.
    await page
      .waitForFunction(
        (want) => {
          const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
          const text = (band?.children[1]?.textContent ?? '').replace(/\s+/g, ' ');
          return Number(/(\d+) active alarm/.exec(text)?.[1] ?? -1) === want;
        },
        stage,
        { timeout: 45_000, polling: 500 },
      )
      .catch(() => {
        console.warn(`⚠ the ${stage}-alarm stage did not confirm within 45 s — measurement 12 will report it.`);
      });
    for (const vp of NO_SCROLL_VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(250);
      const seen = await page.evaluate(() => {
        const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
        const banner = band?.children[1] ?? null;
        const rest = banner?.querySelector('[data-role="banner-rest"]') ?? null;
        const text = (banner?.textContent ?? '').replace(/\s+/g, ' ');
        const count = /(\d+) active alarm/.exec(text)?.[1] ?? null;
        return {
          height: banner ? Math.round(banner.getBoundingClientRect().height * 10) / 10 : null,
          count: count === null ? null : Number(count),
          // Every condition past the lead is one `.item`; they are in the DOM whether or not
          // they are inside the visible line, which is the half of the ruling that says
          // "nothing is dropped".
          itemsInDom: rest ? rest.children.length : 0,
          restClientHeight: rest ? rest.clientHeight : null,
          restScrollHeight: rest ? rest.scrollHeight : null,
          // ⚠ Added by 10g's TEST phase, because everything above this line passes on a
          // `display: none` well — measured: `.rest { display: none }` kept all four counts,
          // all four item totals and the height EQUALITY, and the whole run still reported
          // 29/29 while every condition past the lead was invisible. A count of children is
          // not evidence that a reader can see or reach them. These four are:
          //   `itemsWithText`  — an item that renders empty is dropped in every sense but the
          //                      DOM's, so the text is counted, not the element;
          //   `lastItemText`   — the TAIL is what a bounded box loses first;
          //   `lastItemBottom` — its bottom edge inside the scroller's own content box, so
          //                      "reachable by scrolling" is a number rather than a hope;
          //   `restVisible`    — the well really occupies its one line.
          itemsWithText: rest
            ? [...rest.children].filter((c) => (c.textContent ?? '').trim().length > 0).length
            : 0,
          lastItemText: rest?.lastElementChild
            ? (rest.lastElementChild.textContent ?? '').replace(/\s+/g, ' ').trim()
            : '',
          lastItemBottom: rest?.lastElementChild
            ? Math.round(rest.lastElementChild.offsetTop + rest.lastElementChild.offsetHeight)
            : null,
          restVisible: rest ? getComputedStyle(rest).display !== 'none' && rest.clientHeight > 0 : false,
          // ⚠ 10h — the remainder §6.4 now counts instead of drawing. `-1` when the marker is
          // absent, so a missing marker can never be read as "nothing is hidden".
          more: Number(
            /\+(\d+) more/.exec(banner?.querySelector('[data-role="banner-more"]')?.textContent ?? '')?.[1] ?? -1,
          ),
        };
      });
      measured[`${stage}@${vp.width}`] = seen;
    }
  }
  // Preconditions: the fixtures produced the counts they claim, and nothing was dropped.
  const counts = BANNER_STAGES.map((stage) => measured[`${stage}@1280`]?.count ?? null);
  record(
    `12. the banner fixtures TOOK — ${BANNER_STAGES.join(' / ')} conditions really stand`,
    counts.every((c, i) => c === BANNER_STAGES[i]) ? 'pass' : 'fail',
    { wanted: BANNER_STAGES, got: counts, measured },
  );
  // ⚠⚠ 10h — THESE TWO RECORDS ARE RE-AIMED, NOT WEAKENED, and the reason is that §6.4 was
  // ruled again on 2026-09-10, one day after the ruling they were written for. 10g made the
  // banner a fixed-height SCROLLING well and this pair graded *"nothing is dropped"* (one item
  // per condition, in the DOM, reachable by scrolling). The owner then measured the screen
  // rather than the DOM: **16 of 21 conditions were unreachable at 1280** — `offsetHeight -
  // clientHeight = 0`, so no scrollbar occupied layout, on a wall panel with no pointer and no
  // keyboard. So the banner now draws what fits and COUNTS the rest, and *"nothing is dropped"*
  // is false BY DESIGN. What replaces it is the stronger claim a capped banner can make:
  //
  //   1. NOTHING IS UNACCOUNTED FOR — `1 (the lead) + drawn + '+N more' === the announced
  //      count`, arithmetic rather than a search for labels; and
  //   2. what it DOES draw is really on screen — every drawn item carries text, and the last
  //      of them ENDS INSIDE the well's one visible line rather than below its fold, which is
  //      exactly the failure the ruling removed and is a strictly harder test than 10g's
  //      "reachable by scrolling".
  //
  // ⚠ Both still refuse the `display: none` pass that 10g's TEST phase found (`restVisible`
  // and `restClientHeight`), because that hole is orthogonal to which ruling is in force.
  const unaccounted = BANNER_STAGES.filter((stage) => {
    const m = measured[`${stage}@1280`];
    if (m === undefined) return true;
    if ((m.itemsWithText ?? -1) !== (m.itemsInDom ?? -2)) return true; // an empty span is dropped
    if ((m.itemsInDom ?? 0) > 0 && (m.lastItemText ?? '') === '') return true;
    // ⚠ No marker means nothing is hidden — and that reading is safe rather than generous,
    // because the equation below is what decides: a banner that dropped conditions AND drew no
    // marker fails here, since `1 + drawn` would then be short of the count it announces.
    const more = (m.more ?? -1) === -1 ? 0 : m.more;
    return 1 + (m.itemsInDom ?? -1) + more !== stage;
  });
  record(
    '12. §6.4 ACCOUNTS for every condition — lead + drawn + `+N more` is the count it announces, at every count',
    unaccounted.length === 0 ? 'pass' : 'fail',
    { unaccounted, measured },
  );
  // ⚠ And what it draws is VISIBLE, not merely present. This is the record that refuses the
  // vacuous pass: a hidden, collapsed or below-the-fold well satisfies every count above it
  // and the equality below it.
  const unreadable = BANNER_STAGES.filter((stage) => {
    const m = measured[`${stage}@1280`];
    if (!m?.restVisible) return true;
    if ((m.restClientHeight ?? 0) < 20) return true; // §6.4's one line, 21 px
    // ⚠ The point of the 2026-09-10 ruling: the LAST drawn condition must end inside the one
    // visible line. 10g's version asked only that it be inside the SCROLLABLE content, which
    // is what let sixteen of twenty-one sit below the fold and still report PASS.
    return (m.lastItemBottom ?? Infinity) > (m.restClientHeight ?? 0) + 1;
  });
  record(
    '12. every condition the banner DRAWS is on screen — the last one ends inside the well’s one visible line, not below its fold',
    unreadable.length === 0 ? 'pass' : 'fail',
    { unreadable, measured },
  );
  // The ruling itself.
  for (const vp of NO_SCROLL_VIEWPORTS) {
    const heights = BANNER_STAGES.map((stage) => measured[`${stage}@${vp.width}`]?.height ?? null);
    const same = heights.every((h) => h !== null && h === heights[0]);
    record(
      `12. ${vp.width}x${vp.height}: §6.4's banner is ONE height at ${BANNER_STAGES.join(' / ')} conditions`,
      same ? 'pass' : 'fail',
      { heights, stages: BANNER_STAGES },
    );
  }
}

/**
 * Put every chart on the page into chart or table view, and return how many controls there
 * were — shared by measurements 13 and 14 so the two cannot disagree about what "open" means.
 *
 * ⚠ The CHART toggles, not `button[aria-pressed]` (10g TEST phase). `header.tsx`'s pause
 * control carries `aria-pressed` too, so the broad selector clicked PAUSE on the way into the
 * table pass and un-paused it on the way out — the two sides of the comparison were taken with
 * the client polling and not polling, and `controls` counted five where measurement 13's
 * precondition means the four chart controls. `ChartViewToggle` is the only control whose
 * accessible name is "<subject>: show as chart|table".
 */
async function setViews(page, view) {
  const wanted = view === 'table';
  const buttons = await page.$$('button[aria-pressed][aria-label*="show as"]');
  for (const b of buttons) {
    if (((await b.getAttribute('aria-pressed')) === 'true') !== wanted) await b.click();
  }
  await page.waitForTimeout(250);
  return buttons.length;
}

/**
 * Measurement 13 — opening every table view changes no slot height (10g/Q1).
 *
 * §6.1, ruled 2026-09-09: *"a table view replaces its chart inside the chart's own box and
 * scrolls there; opening one changes no panel's height, and the page grows by zero."* Before
 * it, the five table views one page can have open measured **+851 / +851 / +862 px** on a
 * healthy page, and GPU 0's alone +371.1 against 263.2 px of spare.
 *
 * ⚠ Driven through the REAL toggle buttons, not by setting a prop — the state is the shell's
 * (10c-1), and a measurement that bypassed the control would not be measuring what a click
 * does. The button count is asserted first: four controls (GPU 0, GPU 1, COOLING, and CPU's
 * one for both its traces) over five charts, and a run that found none would report a page
 * that "did not grow" because nothing opened.
 */
async function measureTableViews(page, record) {
  const heightsAt = async () =>
    await page.evaluate(() => {
      const slots = Object.fromEntries(
        [...document.querySelectorAll('[data-slot]')].map((el) => [
          el.getAttribute('data-slot'),
          Math.round(el.getBoundingClientRect().height * 10) / 10,
        ]),
      );
      const grid = document.querySelector('[data-slot="gpu0"]')?.parentElement ?? null;
      return {
        slots,
        gridHeight: grid ? Math.round(grid.getBoundingClientRect().height * 10) / 10 : null,
        tables: document.querySelectorAll('[data-role="table-view"]').length,
        // ⚠ VISIBLE table views, and the two numbers differ by four (10g TEST phase, measured
        // 9 against 5). A GPU card renders BOTH its sparkline and its promoted full chart and
        // lets the media query hide one — `measurement 7`/`8` are about exactly that — so the
        // DOM count double-counts every promoted trace. The ruling's "five table views are
        // reachable at once" means five a reader can see, which is this number.
        tablesVisible: [...document.querySelectorAll('[data-role="table-view"]')].filter(
          (el) => el.getClientRects().length > 0,
        ).length,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      };
    });
  const closed = {};
  const open = {};
  let controls = 0;
  for (const vp of NO_SCROLL_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(250);
    closed[vp.width] = await heightsAt();
    controls = await setViews(page, 'table');
    open[vp.width] = await heightsAt();
    await setViews(page, 'chart');
  }
  // ⚠ BOTH SIDES, exactly (10g TEST phase). `tablesClosed` was recorded and never graded, and
  // that is a vacuous pass waiting to happen: measured by starting the shell in table view,
  // this measurement compared five open tables against five open tables, reported PASS on all
  // four of its records — and the run still said 29/29. "Closed" has to be closed.
  record(
    '13. the table-view fixture TOOK — four chart controls, five table views open and NONE closed',
    controls === 4 &&
      (open[1280]?.tablesVisible ?? 0) === 5 &&
      (closed[1280]?.tablesVisible ?? -1) === 0
      ? 'pass'
      : 'fail',
    {
      controls,
      tablesOpen: open[1280]?.tablesVisible ?? 0,
      tablesClosed: closed[1280]?.tablesVisible ?? 0,
      tableViewsInDom: open[1280]?.tables ?? 0,
    },
  );
  for (const vp of NO_SCROLL_VIEWPORTS) {
    const a = closed[vp.width];
    const b = open[vp.width];
    const moved = Object.keys(a?.slots ?? {}).filter(
      (slot) => Math.abs((a.slots[slot] ?? 0) - (b.slots[slot] ?? 0)) > 0.5,
    );
    record(
      `13. ${vp.width}x${vp.height}: every table view open measures the SAME page as every one closed`,
      moved.length === 0 && Math.abs((a?.gridHeight ?? 0) - (b?.gridHeight ?? -1)) <= 0.5 ? 'pass' : 'fail',
      {
        moved,
        gridClosed: a?.gridHeight ?? null,
        gridOpen: b?.gridHeight ?? null,
        slotsClosed: a?.slots ?? null,
        slotsOpen: b?.slots ?? null,
        overflowOpen: (b?.scrollHeight ?? 0) - (b?.clientHeight ?? 0),
      },
    );
  }
}

/**
 * ⚠⚠ Measurement 14 — §6.1's promise on HOSTILE telemetry (the owner's 2026-09-10 ruling).
 *
 * This is the acceptance for 10h. Everything above it grades a page whose shape someone chose;
 * this one grades the page that broke every earlier bound, with every one of those terms
 * present AT ONCE and every table view open. See {@link fixtureHostile} for what is in it and
 * why each term is there.
 *
 * ⚠ **It asserts eight preconditions before it grades anything** (HANDOVER §0.8: *"a
 * measurement that names a subject must prove the subject EXISTS"*, and §0.11: *"a new browser
 * measurement must be probed by BREAKING it before it is trusted"*). Each one is a term this
 * fixture claims to carry, and every one of them has silently failed to take at least once in
 * this project's history — a fixture that stops taking otherwise reports a plausible number.
 *
 * It also records, on PASS as well as FAIL, WHICH panel bodies are scrolling and by how much:
 * a page that fits because every panel is clipped to nothing is the vacuous pass this
 * measurement would otherwise be, and the numbers are how a reader tells the two apart.
 */
async function measureHostile(page, record) {
  await page.setViewportSize(NO_SCROLL_VIEWPORTS[0]);
  await page.waitForTimeout(200);
  const controls = await setViews(page, 'table');
  const present = await page.evaluate(
    ([dkms, paths, hostname]) => {
      const flat = (s) => (s ?? '').replace(/\s+/g, ' ');
      const textOf = (slot) => flat(document.querySelector(`[data-slot="${slot}"]`)?.textContent);
      const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
      const banner = band?.children[1] ?? null;
      const bannerText = flat(banner?.textContent);
      const serving = textOf('serving');
      const filenames = paths.map((p) => p.slice(p.lastIndexOf('/') + 1));
      // The header's own hostname span, found by the reading it carries rather than by a hashed
      // CSS-module class name: the `title` is the whole string, so the element that has it is
      // the one this fixture is about.
      const hostnameSpan =
        [...(band?.querySelectorAll('span') ?? [])].find((el) => el.getAttribute('title') !== null) ??
        null;
      return {
        // 1-2. The throttle line renders on BOTH cards — the term no measured page has ever had.
        throttleOnGpu0: textOf('gpu0').includes('hw thermal slowdown'),
        throttleOnGpu1: textOf('gpu1').includes('hw thermal slowdown'),
        // 3. §3.4's third instance really is on the page.
        thirdInstance: serving.includes('llama-server@2'),
        // 4-5. §3.4's filename rendering is doing work: the filename shows and the DIRECTORY
        //      does not. Asserting only the filename would pass on a raw path, which contains it.
        modelsAsFilenames: filenames.every((f) => serving.includes(f)),
        noDirectoriesRendered: !serving.includes('/home/yorman/models/'),
        // 6. Every source is explained, in two different panels.
        dkmsUnderCpu: textOf('cpu').includes(flat(dkms)),
        dkmsUnderSafety: textOf('safety').includes(flat(dkms)),
        // 7. §6.4's banner is pinned, and is accounting for what it does not draw.
        bannerAlarms: Number(/(\d+) active alarm/.exec(bannerText)?.[1] ?? 0),
        bannerMore: Number(/\+(\d+) more/.exec(bannerText)?.[1] ?? -1),
        bannerDrawn: banner?.querySelector('[data-role="banner-rest"]')?.children.length ?? -1,
        bannerHeight: banner ? Math.round(banner.getBoundingClientRect().height * 10) / 10 : null,
        // 8. The session event log is at `MAX_EVENTS`.
        logEntries: document.querySelectorAll('[data-slot="session-event-log"] li').length,
        tablesVisible: [...document.querySelectorAll('[data-role="table-view"]')].filter(
          (el) => el.getClientRects().length > 0,
        ).length,
        // ⚠ 9. 10h RECONCILE — the fifth unbounded term, and the owner's truncation ruling on
        //    it. THREE facts, because any one alone passes on a defect: the whole reading is in
        //    the `title` (the half that makes shortening legitimate at all), the element is
        //    really OVERFLOWING its box (so the ellipsis is doing work rather than the string
        //    happening to fit), and the drawn width is inside the declared bound. A `title` on
        //    an unbounded span bounds nothing, and a bound with no `title` loses the reading.
        hostnameTitleWhole: hostnameSpan?.getAttribute('title') === hostname,
        hostnameTruncated:
          hostnameSpan !== null && hostnameSpan.scrollWidth > hostnameSpan.clientWidth + 1,
        hostnameWidth: hostnameSpan === null ? null : Math.round(hostnameSpan.clientWidth * 10) / 10,
        // ⚠ The bound is read off the ELEMENT, not restated here: a measurement that hard-codes
        // 320 would agree with a stylesheet that had stopped saying it. `maxWidth` computing to
        // `none` fails this outright, which is the revert `10h-HD1` makes.
        hostnameInsideBound:
          hostnameSpan !== null &&
          Number.isFinite(Number.parseFloat(getComputedStyle(hostnameSpan).maxWidth)) &&
          hostnameSpan.clientWidth <= Number.parseFloat(getComputedStyle(hostnameSpan).maxWidth) + 1,
      };
    },
    [DKMS_MESSAGE, HOSTILE_MODEL_PATHS, HOSTILE_HOSTNAME],
  );
  const took =
    present.throttleOnGpu0 &&
    present.throttleOnGpu1 &&
    present.thirdInstance &&
    present.modelsAsFilenames &&
    present.noDirectoriesRendered &&
    present.dkmsUnderCpu &&
    present.dkmsUnderSafety &&
    present.bannerAlarms > 21 &&
    present.logEntries >= 500 &&
    present.tablesVisible === 5 &&
    present.hostnameTitleWhole &&
    present.hostnameTruncated &&
    present.hostnameInsideBound &&
    controls === 4;
  record(
    '14. the HOSTILE fixture TOOK — a notable mask on both cards, three instances, path-valued models, every source explained, the banner pinned, 500 log entries, a 150-character hostname truncated with its reading kept, and every table view open',
    took ? 'pass' : 'fail',
    { ...present, controls },
  );
  // ⚠ §6.4's `+N more` must ACCOUNT for every condition it does not draw: 1 (the lead) + the
  // items rendered + the remainder counted has to be the number the banner announces. That is
  // the property the 2026-09-10 ruling replaced *"nothing is dropped"* with, and it is the one
  // that keeps a capped banner from being 10a-F14's lying banner again.
  record(
    '14. §6.4’s banner ACCOUNTS for every condition — lead + drawn + `+N more` is the count it announces',
    present.bannerDrawn >= 0 &&
      1 + present.bannerDrawn + Math.max(0, present.bannerMore) === present.bannerAlarms
      ? 'pass'
      : 'fail',
    {
      announced: present.bannerAlarms,
      drawn: present.bannerDrawn,
      more: present.bannerMore,
      bannerHeight: present.bannerHeight,
    },
  );
  await recordFit(page, record, '14');
  // ⚠ The anti-vacuity half of the fit above, and the thing to read first when this passes.
  // A page fits trivially if every panel has been clipped to nothing, so this records the head
  // and body geometry of all nine: the head must still be its whole self (nothing scrolls a
  // panel's identity away, which is the ruling's own first consequence), and the bodies that
  // are scrolling are named with how much they hide.
  for (const vp of NO_SCROLL_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(250);
    const panels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot]')].map((slot) => {
        const body = slot.querySelector('[data-role="panel-body"]');
        const head = slot.querySelector('header');
        const round = (n) => Math.round(n * 10) / 10;
        return {
          slot: slot.getAttribute('data-slot'),
          slotHeight: round(slot.getBoundingClientRect().height),
          headHeight: head ? round(head.getBoundingClientRect().height) : null,
          // ⚠ TWO facts, and the structural one is the ruling's ("the head never scrolls
          // away"): the head must not be INSIDE the scrolling body at all. A head that is a
          // descendant of the scroller looks perfectly intact at scroll 0, which is every
          // screenshot — the same shape as 10a-F13's two stacked stickies.
          headOutsideScroller: head !== null && body !== null && !body.contains(head),
          headVisible: head ? head.getBoundingClientRect().height > 10 : false,
          bodyClient: body ? body.clientHeight : null,
          bodyScroll: body ? body.scrollHeight : null,
          hidden: body ? body.scrollHeight - body.clientHeight : null,
          // ⚠ 10h RECONCILE (`10h-A5`) — the OTHER axis. `overflow-y: auto` computes
          // `overflow-x` to `auto` as well, so all nine bodies are horizontal scrollers; the
          // fade is `background-position: bottom` only, so a reading pushed sideways has no
          // affordance at all. Nothing reaches it on today's content (measured: a 220-char
          // ext4-legal filename and a 4000-char alias both wrap), which is exactly why it needs
          // a number in the record rather than a note in a document.
          hiddenX: body ? body.scrollWidth - body.clientWidth : null,
        };
      }),
    );
    const headsIntact = panels.every((p) => p.headVisible && p.headOutsideScroller);
    const scrolling = panels.filter((p) => (p.hidden ?? 0) > 1 || (p.hiddenX ?? 0) > 1);
    record(
      `14. ${vp.width}x${vp.height}: every panel HEAD is intact, and the bodies that scroll are named`,
      headsIntact ? 'pass' : 'fail',
      {
        headsIntact,
        scrolling: scrolling.map(
          (p) =>
            `${p.slot} hides ${p.hidden}px (body ${p.bodyClient} of ${p.bodyScroll})${(p.hiddenX ?? 0) > 1 ? ` and ${p.hiddenX}px HORIZONTALLY` : ''}`,
        ),
        panels,
      },
    );
    // ⚠ 10h RECONCILE (`10h-A6`) — an accessibility regression THIS loop introduced, graded
    // rather than described. `.body` was `overflow: visible` before 10h; making it the scroller
    // clips the app-wide `outline-offset: 2px` ring off every focusable child flush with its
    // padding edge, and 10 of the 15 such children on this page are flush. Measured
    // pixel-exact by the adversarial: the 3 x 14 px strip outside CPU's first focusable well is
    // byte-identical focused and unfocused. Those tab stops exist so that clipped content stays
    // REACHABLE — the ring is what says where the keyboard is once you are there.
    //
    // ⚠ Each element is FOCUSED before it is read, and this is the whole difficulty: the ring
    // lives in a `:focus-visible` rule, so an unfocused element computes `outline-offset: 0px`
    // and a record that reads the resting state grades every element as broken. (It did, on
    // this measurement's first run — 28 of 28 at every viewport, on a tree whose rule is
    // correct.) One `Tab` first puts Chrome into keyboard modality, without which programmatic
    // focus does not match `:focus-visible` at all — which is why `focusVisible` is counted and
    // asserted rather than assumed: a run where the modality did not take would otherwise
    // report "no outset rings found" on zero samples.
    await page.keyboard.press('Tab');
    const rings = await page.evaluate(() => {
      const out = [];
      for (const slot of document.querySelectorAll('[data-slot]')) {
        const body = slot.querySelector('[data-role="panel-body"]');
        if (body === null) continue;
        const top = body.scrollTop;
        const left = body.scrollLeft;
        for (const el of body.querySelectorAll('[tabindex="0"], button, a[href], input, select, textarea')) {
          el.focus({ preventScroll: true });
          const cs = getComputedStyle(el);
          out.push({
            slot: slot.getAttribute('data-slot'),
            tag: `${el.tagName.toLowerCase()}${el.getAttribute('data-role') === null ? '' : `[${el.getAttribute('data-role')}]`}`,
            offset: Number.parseFloat(cs.outlineOffset),
            width: Number.parseFloat(cs.outlineWidth),
            style: cs.outlineStyle,
            focusVisible: el.matches(':focus-visible'),
          });
          el.blur();
        }
        // Focusing can move a scroller even with `preventScroll`; put it back so the geometry
        // this measurement recorded above is still the geometry the next viewport starts from.
        body.scrollTop = top;
        body.scrollLeft = left;
      }
      return out;
    });
    const painted = rings.filter((r) => r.focusVisible && r.style !== 'none' && r.width > 0);
    const clippedRings = painted.filter((r) => r.offset >= 0).map((r) => `${r.slot} +${r.offset}px`);
    // ⚠ The graded property is *"no ring inside a scroller is painted OUTSIDE its own border
    // box"*, on a sample that is not empty. It is deliberately NOT "every focusable child
    // paints a ring": whether Chrome's `:focus-visible` heuristic engages for a given element
    // under PROGRAMMATIC focus is a property of the browser's modality tracking, not of this
    // stylesheet, and grading it here would make an accessibility record fail for a reason that
    // is not an accessibility fact. The two counts are printed side by side so the sample size
    // is visible rather than implied, and `unpainted` names which elements did not engage.
    record(
      `14. ${vp.width}x${vp.height}: every focusable child INSIDE a scrolling body has an inset focus ring, so the clip cannot erase it`,
      painted.length > 0 && clippedRings.length === 0 ? 'pass' : 'fail',
      {
        focusables: rings.length,
        ringsPainted: painted.length,
        clippedRings,
        offsets: [...new Set(painted.map((r) => r.offset))],
        unpainted: rings.filter((r) => !painted.includes(r)).map((r) => `${r.slot} ${r.tag}`),
      },
    );
  }
}

/**
 * ⚠⚠ Measurement 15 — the MECHANISM behind measurement 14, and the premise its arithmetic
 * rests on. Added by 10h's TEST phase, 2026-09-10.
 *
 * Measurement 14 grades the hostile PAGE, and on it only three of the nine panels have enough
 * content to scroll (`gpu0`, `gpu1`, `serving`). So the ruling's first consequence —
 * *"every panel has a maximum height derived from its grid row, and its body scrolls inside
 * that height when the content exceeds it … the head never scrolls away"* — was measured on
 * one third of its subjects, and `min-height: 0` / `flex: 0 1 auto` could be deleted from
 * `panel-shell.module.css` on six of nine panels without any measured page noticing.
 *
 * This one puts **3000 px into every panel body in turn** and asks the three questions the
 * ruling actually makes:
 *
 *   1. the SLOT does not grow past its own row cap (the panel is bounded, not the content);
 *   2. the BODY scrolls (it is the scroller, and it really shrank below its content); and
 *   3. the HEAD is intact **with the body scrolled to its bottom** — full height, outside the
 *      scroller, and still inside the slot's own rectangle. A head measured at scroll 0 is
 *      every screenshot, and 10a-F13's two stacked stickies looked perfect there too.
 *
 * ⚠ The stuffer is a fixture device, like `HOSTILE_EXTRA_GPUS`: it is not telemetry, and it is
 * not claiming a panel can reach that height from data. It is how the four declarations that
 * hold the ruling up are made observable **on all nine panels** rather than on the three the
 * hostile fixture happens to overflow.
 *
 * ⚠ And record 15a is the one the arithmetic needs and nothing else asserts: `tokens.css`
 * subtracts a **measured constant** (`--band-reserve: 102px`) for the sticky band before
 * sharing the rest between the rows, so *"the page fits by construction"* is true only while
 * the band really is within it. The band is `flex-wrap: wrap` and carries §3.2's `hostname`,
 * which is telemetry of unbounded length — see this loop's TEST notes.
 */
async function measureBoundMechanism(page, record) {
  const STUFFER_PX = 3000;
  const bands = [];
  const perViewport = [];
  for (const vp of NO_SCROLL_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(250);
    const seen = await page.evaluate((stuffPx) => {
      const round = (n) => Math.round(n * 10) / 10;
      const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
      const reserve = getComputedStyle(document.documentElement).getPropertyValue('--band-reserve').trim();
      const doc = document.documentElement;
      const panels = [];
      for (const slot of document.querySelectorAll('[data-slot]')) {
        const name = slot.getAttribute('data-slot');
        const body = slot.querySelector('[data-role="panel-body"]');
        const head = slot.querySelector('header');
        if (body === null || head === null) {
          panels.push({ slot: name, missing: true });
          continue;
        }
        const cap = Number.parseFloat(getComputedStyle(slot).maxHeight);
        const headBefore = round(head.getBoundingClientRect().height);
        const stuffer = document.createElement('div');
        stuffer.style.cssText = `height:${stuffPx}px;flex:0 0 auto`;
        body.appendChild(stuffer);
        // Force layout before reading, then scroll the body to its very bottom — the position
        // at which a head that is inside the scroller has left the screen.
        void slot.getBoundingClientRect().height;
        body.scrollTop = body.scrollHeight;
        void body.scrollTop;
        const slotRect = slot.getBoundingClientRect();
        const headRect = head.getBoundingClientRect();
        panels.push({
          slot: name,
          cap: Number.isFinite(cap) ? round(cap) : null,
          slotHeight: round(slotRect.height),
          bodyClient: body.clientHeight,
          bodyScroll: body.scrollHeight,
          scrolledTo: body.scrollTop,
          headHeight: round(headRect.height),
          headHeightBefore: headBefore,
          headOutsideScroller: !body.contains(head),
          // ⚠ `slot.querySelector('header')` returns the FIRST header in document order, so
          // `!body.contains(head)` answers *"the head this measurement found is outside the
          // scroller"* and NOT *"no head is inside it"*. Measured by 10h's TEST phase: adding a
          // SECOND `<header>` inside `.body` left every head record on measurement 14 and this
          // one green, because the outer head is still the one both of them read. This is the
          // other half, and it is the shape §6.1's ruling actually forbids — anything that
          // names the panel must not be scrollable away.
          noHeadInsideScroller: body.querySelector('header') === null,
          headInsideSlot: headRect.top >= slotRect.top - 1 && headRect.bottom <= slotRect.bottom + 1,
          // ⚠ §6.1 names three things — *"title, subtitle and chip stay pinned"* — so the
          // head's BOX being intact is not the claim. Each named part must still have a
          // rectangle of its own inside the slot with the body scrolled to its end. The
          // SESSION EVENT LOG renders no chip at all (§6.1's OQ-4: it has no severity), so the
          // chip is counted where it exists rather than demanded of all nine.
          headParts: ['h2', 'p', '[data-severity]']
            .map((sel) => head.querySelector(sel))
            .filter((el) => el !== null)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                onScreen:
                  el.getClientRects().length > 0 &&
                  r.height > 0 &&
                  r.top >= slotRect.top - 1 &&
                  r.bottom <= slotRect.bottom + 1,
              };
            }),
          headTitle: (head.querySelector('h2')?.textContent ?? '').trim(),
          docFits: doc.scrollHeight <= doc.clientHeight,
        });
        body.scrollTop = 0;
        stuffer.remove();
      }
      return {
        bandHeight: band ? round(band.getBoundingClientRect().height) : null,
        bandReserve: Number.parseFloat(reserve),
        panels,
      };
    }, STUFFER_PX);
    bands.push({ viewport: `${vp.width}x${vp.height}`, band: seen.bandHeight, reserve: seen.bandReserve });
    const broken = seen.panels.filter(
      (p) =>
        p.missing === true ||
        p.cap === null ||
        p.slotHeight > p.cap + 0.5 ||
        p.bodyScroll <= p.bodyClient + 1 ||
        p.headOutsideScroller !== true ||
        p.noHeadInsideScroller !== true ||
        p.headInsideSlot !== true ||
        p.headHeight < 10 ||
        p.headHeight !== p.headHeightBefore ||
        p.headParts.length < 2 ||
        p.headParts.some((part) => part.onScreen !== true) ||
        p.headTitle === '' ||
        p.docFits !== true,
    );
    perViewport.push({ viewport: `${vp.width}x${vp.height}`, broken, panels: seen.panels });
    record(
      `15. ${vp.width}x${vp.height}: ${STUFFER_PX} px into EVERY panel body — the body scrolls, the slot stays inside its row cap, and the head is intact at the scroll bottom`,
      broken.length === 0 ? 'pass' : 'fail',
      {
        broken: broken.map((p) => p.slot),
        // ⚠ Printed on PASS as well: "nine panels scrolled" is worthless without the caps they
        // stopped at, and this is the list that says the bound is per ROW rather than global.
        scrolling: seen.panels.map(
          (p) =>
            `${p.slot} ${p.slotHeight} of cap ${p.cap} (body ${p.bodyClient} of ${p.bodyScroll}, head ${p.headHeight} showing ${p.headParts.map((x) => x.tag).join('+')})`,
        ),
        panels: seen.panels,
      },
    );
  }
  // ⚠ 15a — the term the row arithmetic SUBTRACTS. `--rows-available` is
  // `100vh - --band-reserve - --grid-pad-v - --grid-row-gaps`, and the four shares sum to
  // exactly 1 of what is left; so `band + padding + gaps + sum(rows) <= 100vh` holds **only
  // while the real band is within the reserve**. Nothing else in this project measures that,
  // and the band is a `flex-wrap: wrap` row carrying §3.2's `hostname`.
  record(
    '15. the sticky band fits inside --band-reserve — the term the row arithmetic subtracts, measured rather than assumed',
    bands.every((b) => b.band !== null && Number.isFinite(b.reserve) && b.band <= b.reserve)
      ? 'pass'
      : 'fail',
    { bands },
  );
  // ⚠ 15b — §6.4's cap, graded on the page that carries FIVE HUNDRED conditions rather than
  // measurement 12's twenty-one. `+N more` is exact arithmetic, so what is left to go wrong is
  // the other half: a drawn condition whose TEXT is wide enough to wrap the one-line well, at
  // which point the reader sees fewer than the three the marker says are drawn. m12 grades
  // this at 2/6/12/21 with two-word labels; the hostile page's subjects run to three digits.
  const drawn = await page.evaluate(() => {
    const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
    const well = band?.querySelector('[data-role="banner-rest"]') ?? null;
    if (well === null) return null;
    const items = [...well.children];
    const last = items.at(-1) ?? null;
    const wellTop = well.getBoundingClientRect().top;
    return {
      items: items.length,
      restClientHeight: well.clientHeight,
      restScrollHeight: well.scrollHeight,
      lastItemBottom: last === null ? null : Math.round(last.getBoundingClientRect().bottom - wellTop),
      more: Number(
        /\+(\d+) more/.exec(band?.querySelector('[data-role="banner-more"]')?.textContent ?? '')?.[1] ?? -1,
      ),
      texts: items.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()),
    };
  });
  // ⚠ 15c — BOTH SIDES of §6.1's own bound, in a browser (§5.1's fixture-symmetry rule applied
  // to a media query). `grid.test.tsx` asserts the query's TEXT; this asserts what a browser
  // does with it: at 1280x1024 every slot carries a computed cap, and at 1279x1024 or
  // 1280x1023 — one pixel outside either bound — every cap is `none` and the page is allowed to
  // scroll, which is what *"below either bound, legibility wins"* asks for. Printed with the
  // page height at each, because the discontinuity is the fact worth seeing: the same telemetry
  // is 92 px of scroll one pixel below the height bound.
  const boundary = [];
  for (const vp of [
    { width: 1280, height: 1024 },
    { width: 1279, height: 1024 },
    { width: 1280, height: 1023 },
  ]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(250);
    boundary.push({
      viewport: `${vp.width}x${vp.height}`,
      ...(await page.evaluate(() => {
        const doc = document.documentElement;
        const caps = [...document.querySelectorAll('[data-slot]')].map(
          (el) => getComputedStyle(el).maxHeight,
        );
        return {
          capped: caps.filter((c) => c !== 'none').length,
          slots: caps.length,
          pageHeight: doc.scrollHeight,
          viewportHeight: doc.clientHeight,
        };
      })),
    });
  }
  record(
    '15. the row caps exist at 1280x1024 and at NEITHER side of §6.1’s bound — 1279 wide and 1023 tall both keep every panel its own height',
    boundary[0]?.capped === boundary[0]?.slots &&
      boundary[0]?.slots === 9 &&
      boundary[1]?.capped === 0 &&
      boundary[2]?.capped === 0
      ? 'pass'
      : 'fail',
    { boundary },
  );
  record(
    '15. every condition the banner DRAWS is on screen on the 500-condition page — the last one ends inside the well’s one visible line',
    drawn !== null &&
      drawn.items > 0 &&
      drawn.restClientHeight >= 20 &&
      (drawn.lastItemBottom ?? Infinity) <= drawn.restClientHeight + 1
      ? 'pass'
      : 'fail',
    drawn ?? { well: null },
  );
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

    // ---- 10g/Q3: the ARITHMETIC worst case — every source explained, every reading present,
    // §6.4's ordinary two-alarm banner pinned. 10f's reconciliation measured this page 1 px
    // over at 1600x1024 from a scratch script; it is graded here so it stays measured.
    fabrication.mode = 'all-explained';
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page
      .waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { state: 'attached', timeout: 20_000 })
      .catch(() => {
        console.warn('⚠ the all-explained fixture did not take — measurement 11 will report it.');
      });
    // §6.4's ten seconds of SAMPLING, plus a margin: the banner is part of what is measured.
    await page.waitForTimeout(13_000);
    await measureAllExplained(page, record10);

    // ---- 10g/Q2: §6.4's banner at 2 / 6 / 12 / 21 conditions, one page load, four waits.
    fabrication.mode = 'alarms';
    fabrication.alarms = BANNER_STAGES[0];
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page
      .waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { state: 'attached', timeout: 20_000 })
      .catch(() => {});
    await measureBannerHeights(page, record10);

    // ---- 10g/Q1: every table view open measures the same page as every one closed.
    fabrication.mode = 'box';
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page
      .waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { state: 'attached', timeout: 20_000 })
      .catch(() => {
        console.warn('⚠ the healthy-box fixture did not take — measurement 13 will report it.');
      });
    await page.waitForTimeout(1500);
    await measureTableViews(page, record10);
    // ⚠ 10h RECONCILE — the HEALTHY page, graded with every table view open (the state m13
    // leaves it in, and the harder of the two). `check-density.mjs` grades this page's slot
    // heights; nothing graded whether a slot was showing all of its own content.
    await recordNoClipping(page, record10, '13');

    // ---- 10h: §6.1's promise on HOSTILE telemetry. This is the acceptance for the grid bound.
    fabrication.mode = 'hostile';
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page
      .waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { state: 'attached', timeout: 20_000 })
      .catch(() => {
        console.warn('⚠ the hostile fixture did not take — measurement 14 will report it.');
      });
    // §6.4's ten seconds of SAMPLING, plus a margin: the banner is part of what is measured.
    await page.waitForTimeout(13_000);
    await measureHostile(page, record10);

    // ---- 10h TEST: the mechanism behind measurement 14, on all nine panels, plus the one
    // term the row arithmetic subtracts and nothing else measures.
    await measureBoundMechanism(page, record10);

    console.log('\n=== 10a-F4 / §6.1 breakpoint measurements ===\n');
    for (const { name, detail } of results.pass) {
      console.log(`PASS     ${name}`);
      if (detail && typeof detail.spare === 'number') {
        console.log(`         spare ${detail.spare} px (content bottom ${detail.contentBottom}, viewport ${detail.clientHeight}, band+gutter ${detail.bandHeight}); slots ${JSON.stringify(detail.slotHeights)}`);
      }
      // ⚠ 10g — a PASS that is a measured EQUALITY has to print the value it is equal to.
      // "the banner is one height" and "the page did not move" are the two claims 10g is
      // accepted on, and a bare PASS on either is a claim with no number behind it: the next
      // loop would have to re-run the browser to learn what the height WAS.
      if (detail && Array.isArray(detail.heights)) {
        console.log(`         heights ${JSON.stringify(detail.heights)} px at ${JSON.stringify(detail.stages)} conditions`);
      }
      if (detail && typeof detail.gridOpen === 'number') {
        console.log(`         grid ${detail.gridClosed} px closed / ${detail.gridOpen} px open; slots open ${JSON.stringify(detail.slotsOpen)}`);
      }
      // ⚠ Same rule, applied to the record that refuses the vacuous pass (10g TEST phase): the
      // well's own geometry at each count, at the design width. "Scrolled, not hidden" is a
      // claim about three numbers, so it prints them.
      // ⚠ 10h — the same rule for the hostile page's anti-vacuity record: "the page fits" and
      // "every head is intact" mean very little without the list of what is being scrolled.
      // ⚠ 10h TEST — the same rule for the band: `--band-reserve` is a MEASURED constant that
      // the row arithmetic subtracts, so the record that says it still holds has to print the
      // two numbers it compared. A bare PASS here is the claim with its evidence removed.
      if (detail && Array.isArray(detail.boundary)) {
        console.log(
          `         ${detail.boundary.map((b) => `${b.viewport}: ${b.capped}/${b.slots} capped, page ${b.pageHeight} of ${b.viewportHeight}`).join(' · ')}`,
        );
      }
      if (detail && Array.isArray(detail.bands)) {
        console.log(
          `         band ${detail.bands.map((b) => `${b.viewport}: ${b.band} of ${b.reserve}`).join(' · ')}`,
        );
      }
      // ⚠ 10h RECONCILE — the same rule for the record that says nothing is clipped: "no panel
      // body hides a reading" is a claim about a margin, and a page that clips nothing by
      // 0.4 px and one that clips nothing by 90 are the same word and very different facts.
      // The bodies-found count is printed with it because it is the record's anti-vacuity term.
      if (detail && typeof detail.tightest === 'number') {
        console.log(
          `         ${detail.bodiesFound} bodies, none hiding a reading; closest to its cap: ${detail.tightestSlot} by ${detail.tightest} px`,
        );
      }
      // ⚠ 10h RECONCILE — same rule again, for the focus-ring record: "every ring is inset" is
      // a claim about a NUMBER and a SAMPLE SIZE, and a bare PASS hides both. `ringsPainted` is
      // the anti-vacuity term (a run where Chrome's keyboard modality did not engage paints
      // nothing and would otherwise report "no outset rings found" on an empty set).
      if (detail && Array.isArray(detail.clippedRings)) {
        console.log(
          `         focus rings: ${detail.ringsPainted} painted of ${detail.focusables} focusable children, offsets ${JSON.stringify(detail.offsets)}${detail.unpainted.length === 0 ? '' : `; not engaged: ${detail.unpainted.join(', ')}`}`,
        );
      }
      if (detail && Array.isArray(detail.scrolling)) {
        console.log(`         scrolling bodies: ${detail.scrolling.length === 0 ? 'none' : detail.scrolling.join(' · ')}`);
      }
      if (detail && Array.isArray(detail.unreadable) && detail.measured) {
        const shape = BANNER_STAGES.map((s) => {
          const m = detail.measured[`${s}@1280`] ?? {};
          return `${s}: drawn ${m.itemsInDom} + ${m.more} more / client ${m.restClientHeight} / scroll ${m.restScrollHeight} / last item bottom ${m.lastItemBottom}`;
        });
        console.log(`         .rest at 1280 — ${shape.join(' · ')}`);
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
