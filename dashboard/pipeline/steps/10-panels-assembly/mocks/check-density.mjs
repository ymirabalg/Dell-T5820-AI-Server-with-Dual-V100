#!/usr/bin/env node
/**
 * 10e — grade a real-app measurement against the density targets in `10e-match-the-mock.md` §8.
 *
 * Input is the JSON `measure-arrangements.mjs` writes (`--only baseline --anatomy --json out.json`,
 * `--fixture box`), i.e. the REAL app, logged in, healthy box-faithful telemetry, at the three
 * §6.1 viewports, with and without §6.4's banner pinned. Output is one line per slot per viewport:
 * measured height, target, delta, PASS/FAIL — plus the page-level checks (no scroll, spare
 * height, banner still fits).
 *
 *     export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
 *     node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs \
 *          --fixture box --only baseline --anatomy --no-capture --json /tmp/density.json
 *     node pipeline/steps/10-panels-assembly/mocks/check-density.mjs /tmp/density.json [--oq caption,notes,...]
 *
 * `--oq` names the owner questions from §9 the owner has ACCEPTED, so the target table grows
 * by exactly those rows (§8 gives both numbers). With no `--oq` the targets are the spec-only
 * anatomy, which is what a builder must hit before any ruling.
 *
 * Every number here is derived in §2/§8 of the report from measured mock sub-elements — the
 * arithmetic is shown there; this file only encodes it. Tolerance is ±10 % per panel (handoff §8).
 */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: check-density.mjs <measure-arrangements json> [--oq caption,notes,paused-banner]');
  process.exit(2);
}
const oqArg = args[args.indexOf('--oq') + 1];
const OQ = new Set(args.includes('--oq') && oqArg ? oqArg.split(',') : []);

// ---- the measured mock budgets (§2), in px ------------------------------------------------
const HEAD = 25.8; // title/sub/chip line + 6 pad + 1 rule
const PANEL_OVERHEAD = 8 + 9 + 2; // padding-top + padding-bottom + 2 borders
const GAP = 5;
const HERO = 32.3; // 34 px figure at line-height .95
const SPARK = { narrow: 38.5, wide: 50 }; // GPU hero row: pw block (38.5) sets it at 1280; the 50 px chart at >=1600
const CAPTION = 14.2; // 10.5 px line (OQ-1: min/max/now readout)
const METER = 23.2; // 14.2 label line + 3 + 6 track
const STRIP = 14.8; // 11 px line
const ROW = 26.8; // one-line row carrying an 18.8 px pill
const ROWS_GAP = 1;
const NOTE2 = 32.6; // two-line 9.5 px note footer (OQ-2)
const NOTE1 = 19.3;
const CHAN = 68.4; // 4 x 14.8 + 3 x 3
const COOLING_CHART = 174; // 2 x 72 + 10 + 20 (legend inside the first plot)
const LOG_BOX = 84;
const LINK_LINE = 18.8; // caption holding an 18.8 px pill

const panel = (rows) => rows.reduce((a, b) => a + b, 0) + GAP * (rows.length - 1) + PANEL_OVERHEAD;
const caption = OQ.has('caption') ? [CAPTION] : [];
const note2 = OQ.has('notes') ? [NOTE2] : [];

/** Spec-only targets, per §2 — healthy telemetry, so no throttle row and no errors[] notes. */
const targets = (wide) => {
  const spark = wide ? SPARK.wide : SPARK.narrow;
  const gpu = panel([HEAD, spark, ...caption, METER, METER, STRIP]);
  // OQ-7 RULED 2026-09-09: CPU keeps BOTH traces (temperature + utilisation), so two sparklines are the spec target.
  const cpu = panel([HEAD, HERO, ...caption, wide ? 50 : 38, wide ? 50 : 38, METER, STRIP]);
  const memory = panel([HEAD, HERO, METER, METER, ...note2]);
  const safety = panel([HEAD, 4 * ROW + 3 * ROWS_GAP]);
  const storage = panel([HEAD, METER, METER, STRIP, LINK_LINE, ...note2]);
  const serving = panel([HEAD, 2 * ROW + ROWS_GAP, ...note2]);
  const log = panel([HEAD, LOG_BOX]);
  const coolingIntrinsic = panel([HEAD, HERO, COOLING_CHART, CHAN, ROW, ...note2]);
  return { gpu0: gpu, gpu1: gpu, cpu, memory, safety, 'storage-and-network': storage, serving, 'session-event-log': log, coolingIntrinsic };
};

const TOL = 0.1;
const BAND = 10 + 43; // sticky band: 10 px top gutter + 43 px header
const GRID_PAD = 9 + 12; // grid padding top + bottom
const GRID_GAP = 9;

const R = JSON.parse(readFileSync(file, 'utf8'));
const B = R.arrangements?.baseline ?? Object.values(R.arrangements ?? {})[0];
if (!B) throw new Error('no arrangement in the JSON');

let failures = 0;
const line = (ok, text) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
};

for (const [vp, m] of Object.entries(B.viewports)) {
  const width = Number(vp.split('x')[0]);
  const height = Number(vp.split('x')[1]);
  const t = targets(width >= 1600);
  console.log(`\n=== ${vp}  (OQ accepted: ${[...OQ].join(',') || 'none'})`);
  const measured = {};
  for (const [slot, target] of Object.entries(t)) {
    if (slot === 'coolingIntrinsic') continue;
    const h = m.slots[slot]?.height;
    measured[slot] = h;
    const delta = h === undefined ? NaN : (h - target) / target;
    line(Number.isFinite(delta) && Math.abs(delta) <= TOL, `${slot.padEnd(20)} measured ${String(h).padStart(6)}  target ${target.toFixed(1).padStart(6)}  ${(delta * 100).toFixed(1)} %`);
  }
  // COOLING is align-self: stretch — its slot equals rows 2+3, which is the taller of its own
  // intrinsic height and CPU + gap + SAFETY (whichever the grid had to honour).
  const rows23 = Math.max(t.coolingIntrinsic, (measured.cpu ?? 0) + GRID_GAP + (measured.safety ?? 0));
  const cool = m.slots.cooling?.height;
  const coolDelta = (cool - rows23) / rows23;
  line(Math.abs(coolDelta) <= TOL, `${'cooling'.padEnd(20)} measured ${String(cool).padStart(6)}  target ${rows23.toFixed(1).padStart(6)}  ${(coolDelta * 100).toFixed(1)} %  (rows 2-3: max(intrinsic ${t.coolingIntrinsic.toFixed(1)}, cpu+gap+safety))`);
  // ⚠ The line above is structural (a stretched cell always equals its rows) — it cannot fail on
  // its own. What CAN fail is the painted chart box, read from the anatomy: COOLING's stacked
  // chart must paint 174 px (2 × 72 + 10 + 20) and the GPU cards' visible chart 38 px below
  // 1600 / 50 px at and above it. Needs `--anatomy` in the measuring run.
  // ⚠ 2026-09-09: `matchAll`, not `exec`. A part can hold MORE THAN ONE svg — the GPU card's
  // two promotion wrappers both live inside its hero row — and reading only the first meant
  // the hidden narrow chart (0 px) shadowed the visible promoted one at >=1600.
  const svgHeights = (slot) =>
    (m.anatomy?.[slot]?.parts ?? []).flatMap((p) => [...p.part.matchAll(/\(svg \d+x(\d+)\)/g)].map((mm) => Number(mm[1])));
  if (m.anatomy) {
    line(svgHeights('cooling').includes(COOLING_CHART), `cooling chart paints ${COOLING_CHART} px → svg heights seen ${JSON.stringify(svgHeights('cooling'))}`);
    const wantGpu = width >= 1600 ? 50 : 38;
    line(svgHeights('gpu0').includes(wantGpu), `gpu0 visible chart paints ${wantGpu} px → svg heights seen ${JSON.stringify(svgHeights('gpu0'))} (a hidden wrapper reports 0)`);
    line(svgHeights('cpu').includes(wantGpu), `cpu visible chart paints ${wantGpu} px → svg heights seen ${JSON.stringify(svgHeights('cpu'))}`);
  } else {
    line(false, 'anatomy missing — run measure-arrangements.mjs with --anatomy so chart boxes can be checked');
  }
  // page
  const r1 = Math.max(measured.gpu0 ?? 0, measured.gpu1 ?? 0);
  const r4 = Math.max(measured.serving ?? 0, measured['session-event-log'] ?? 0);
  const expectedPage = BAND + GRID_PAD + r1 + rows23 + r4 + 2 * GRID_GAP;
  line(m.overflow <= 0, `page: scrollHeight ${m.scrollHeight} vs viewport ${m.clientHeight} → overflow ${m.overflow} (band ${m.band}, grid ${m.grid?.height}; expected page ≈ ${expectedPage.toFixed(0)})`);
  // ⚠ 2026-09-09: spare is measured from the CONTENT bottom, not from `scrollHeight`.
  // `document.documentElement.scrollHeight` is defined as at least the viewport height, so on
  // any page that fits it equals `clientHeight` and `height - scrollHeight` is 0 — the check
  // was unsatisfiable for exactly the state it grades, and only ever ran against an
  // overflowing tree where it happened to look right. The bottom of the grid IS the bottom of
  // the page here (the band is the only other body child and it sits above the grid), which is
  // the number §2.10's "spare" column predicts (249 / 213 / 269 under OQ-7).
  const contentBottom = m.grid?.bottom;
  line(
    Number.isFinite(contentBottom) && height - contentBottom >= 200,
    contentBottom === undefined
      ? 'page: spare ≥ 200 px — NOT MEASURED: the run recorded no grid box, so there is no content bottom to measure from'
      : `page: spare ≥ 200 px for degraded states → ${(height - contentBottom).toFixed(1)} px (content bottom ${contentBottom}, viewport ${height})`,
  );
  const wb = B.withBanner?.[vp];
  if (wb) line(wb.overflow <= 0, `page with §6.4 banner pinned: overflow ${wb.overflow} (band ${wb.band})`);
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAIL`}`);
process.exitCode = failures === 0 ? 0 : 1;
