#!/usr/bin/env node
/**
 * 10e — per-element anatomy of `MOCK.html`, so a builder gets a height budget PER ROW rather
 * than per panel. Companion to `measure-mock.mjs` (which reports only per-panel totals).
 *
 * For every panel at every §6.1 viewport, in the mock's states `a` (healthy), `ap` (paused)
 * and `b` (6-alarm banner): the panel's own box, padding and flex gap; every DIRECT child of
 * the panel `<section>` (head, hero row, caption, meter rows, strip, throttle line, chart,
 * legend, channel table, rows, note) with its class, height, computed font-size and a text
 * preview; and, one level down, the children of composite rows (`.gpuTop`, `.rows`, `.chan`)
 * plus the `<svg>` box of every chart. The topbar and the banner(s) are measured the same way,
 * and a handful of computed styles (body font-size / line-height, panel padding, grid gap) are
 * read back so the token table is measured rather than transcribed from the CSS.
 *
 * Usage (from `dashboard/`):
 *
 *     export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
 *     node pipeline/steps/10-panels-assembly/mocks/measure-mock-anatomy.mjs [--json out.json]
 *
 * Launches the system Chrome headless over CDP (playwright-core), opens `MOCK.html` from
 * `file://`, and closes ONLY the browser it launched. Touches no production code.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright-core';

const HERE = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = path.resolve(HERE, '../../../..');
const MOCK = path.join(ROOT, 'MOCK.html');
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const VIEWPORTS = [
  { width: 1280, height: 1024 },
  { width: 1600, height: 1024 },
  { width: 1920, height: 1080 },
];
const STATES = ['a', 'ap', 'b'];
const PANELS = ['gpu0', 'gpu1', 'cool', 'cpu', 'ram', 'safe', 'store', 'serv', 'log'];

const args = process.argv.slice(2);
const jsonOut = (() => {
  const i = args.indexOf('--json');
  return i === -1 ? null : args[i + 1];
})();

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (spawnSync('test', ['-x', c]).status === 0) return c;
  return null;
}

async function measure(page) {
  return page.evaluate((panels) => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { h: r1(r.height), w: r1(r.width), y: r1(r.y) };
    };
    const fs = (el) => getComputedStyle(el).fontSize;
    const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const cls = (el) => (el.getAttribute('class') ?? el.tagName.toLowerCase()).split(' ').slice(0, 3).join(' ');

    const describe = (el, depth) => {
      const d = { cls: cls(el), ...box(el), fs: fs(el), text: text(el) };
      const svg = el.matches('svg') ? el : el.querySelector(':scope > svg, :scope > .chart > svg');
      if (svg) d.svg = { w: svg.getAttribute('width'), h: svg.getAttribute('height'), box: box(svg) };
      if (depth > 0 && (el.classList.contains('gpuTop') || el.classList.contains('rows') || el.classList.contains('chan') || el.classList.contains('meterRow') || el.classList.contains('panel__hd') || el.classList.contains('logWrap') || el.classList.contains('legend') || el.classList.contains('caption') || el.classList.contains('strip'))) {
        d.children = [...el.children].map((c) => describe(c, depth - 1));
      }
      return d;
    };

    const out = { doc: {}, styles: {}, topbar: null, banners: [], grid: null, panels: {} };
    const doc = document.documentElement;
    out.doc = { scrollHeight: doc.scrollHeight, clientHeight: doc.clientHeight, overflow: doc.scrollHeight - doc.clientHeight };
    const body = getComputedStyle(document.body);
    const app = document.querySelector('.app');
    const grid = document.querySelector('.grid');
    const panel0 = document.getElementById('gpu0');
    const ps = getComputedStyle(panel0);
    const gs = getComputedStyle(grid);
    out.styles = {
      bodyFontSize: body.fontSize,
      bodyLineHeight: body.lineHeight,
      appPadding: getComputedStyle(app).padding,
      appGap: getComputedStyle(app).rowGap,
      gridGap: gs.rowGap + ' / ' + gs.columnGap,
      gridColumns: gs.gridTemplateColumns,
      panelPadding: ps.padding,
      panelGap: ps.rowGap,
      panelBorder: ps.borderTopWidth,
      panelRadius: ps.borderRadius,
      titleFont: fs(document.querySelector('.panel__title')),
      subFont: fs(document.querySelector('.panel__sub')),
      chipFont: fs(document.querySelector('.chip')),
      heroFont: fs(document.querySelector('.hero__v')),
      heroUnitFont: fs(document.querySelector('.hero__u')),
      captionFont: fs(document.querySelector('.caption')),
      meterLblFont: fs(document.querySelector('.meterRow__lbl')),
      stripFont: fs(document.querySelector('.strip')),
      rowFont: fs(document.querySelector('.row')),
      rowNoteFont: fs(document.querySelector('.row__note')),
      noteFont: fs(document.querySelector('.note')),
      chanFont: fs(document.querySelector('.chan')),
      logFont: fs(document.querySelector('.logTable')),
      legendFont: fs(document.querySelector('.legend')),
      topbarHostFont: fs(document.querySelector('.brand__host')),
      aggFont: fs(document.querySelector('.agg__text')),
      snapFont: fs(document.querySelector('.snap')),
      ctlFont: fs(document.querySelector('.ctl__v')),
    };
    const mockstrip = document.querySelector('.mockstrip');
    out.mockstrip = box(mockstrip).h;
    const topbar = document.querySelector('.topbar');
    out.topbar = { ...box(topbar), padding: getComputedStyle(topbar).padding, children: [...topbar.children].map((c) => describe(c, 1)) };
    for (const b of document.querySelectorAll('#bannerHost > .banner')) {
      out.banners.push({ ...box(b), cls: cls(b), children: [...b.querySelectorAll('.banner__head, .banner__rest, .banner__item')].map((c) => ({ cls: cls(c), ...box(c), fs: fs(c) })) });
    }
    out.grid = { ...box(grid), bottom: r1(grid.getBoundingClientRect().bottom) };
    for (const id of panels) {
      const el = document.getElementById(id);
      const cs = getComputedStyle(el);
      out.panels[id] = {
        ...box(el),
        padding: cs.padding,
        gap: cs.rowGap,
        children: [...el.children].map((c) => describe(c, 2)),
      };
    }
    return out;
  }, PANELS);
}

async function main() {
  const chrome = findChrome();
  if (chrome === null) throw new Error('no system Chrome found');
  const browser = await chromium.launch({ headless: true, executablePath: chrome });
  const report = {};
  try {
    for (const state of STATES) {
      report[state] = {};
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        await page.goto(pathToFileURL(MOCK).href, { waitUntil: 'load' });
        if (state !== 'a') {
          if (state === 'ap') {
            await page.click('.mockstrip__btn[data-go="a"]');
            await page.click('#ctlPause');
          } else {
            await page.click(`.mockstrip__btn[data-go="${state}"]`);
          }
        }
        await page.waitForTimeout(400);
        const m = await measure(page);
        report[state][`${vp.width}x${vp.height}`] = m;
        const slots = Object.fromEntries(Object.entries(m.panels).map(([k, v]) => [k, v.h]));
        console.log(
          `[mock ${state}] ${vp.width}x${vp.height} overflow=${m.doc.overflow} (mockstrip ${m.mockstrip}) topbar=${m.topbar.h} banners=${m.banners.map((b) => b.h).join('+') || 0} grid=${m.grid.h} slots=${JSON.stringify(slots)}`,
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(`wrote ${jsonOut}`);
  }
}

await main();
