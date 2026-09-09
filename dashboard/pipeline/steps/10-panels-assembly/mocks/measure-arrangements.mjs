#!/usr/bin/env node
/**
 * 10d — measure candidate grid arrangements against the REAL app, in real headless Chrome.
 *
 * Reuses `../measure-breakpoints.mjs`'s machinery (ephemeral credentials, `next dev` in its
 * own process group, system Chrome over CDP, `page.route` telemetry fabrication) and adds:
 *
 * - a BOX-FAITHFUL fabricated snapshot (`fixtureBox`): every collector succeeding, `errors: []`,
 *   the values `CLAUDE.md` records for the live machine — the state a wall panel shows almost
 *   all of the time. The 10c-3 numbers were taken against this dev Mac's own `/api/telemetry`
 *   (every Linux-only collector failing, so every row carried an `errors[]` note); that state
 *   is kept selectable (`--fixture mac`) so the two can be compared.
 * - per-arrangement CSS overrides injected into the live page (`<style id="tend-override">`)
 *   so panel CONTENT is genuine and only the grid / chart sizing is changed — the handoff's
 *   "cheapest honest route".
 * - chart-box overrides via CSS on the chart `<svg>` elements — the pixel box `CHART_SIZE`
 *   would produce, without editing `components/grid.tsx`.
 * - static, self-contained HTML captures of each arrangement under `mocks/`, then a
 *   RE-MEASUREMENT of those captures from `file://` so the mock is proved to reproduce the
 *   live numbers rather than assumed to.
 *
 * Usage (from `dashboard/`):
 *
 *     export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$HOME/.local/bin:$PATH"
 *     node pipeline/steps/10-panels-assembly/mocks/measure-arrangements.mjs [--fixture box|mac]
 *          [--only name,name] [--anatomy] [--no-capture] [--json out.json]
 *
 * ⚠ Touches NO production code. Closes only the browser it launched. Kills its own `next dev`
 * process group and restores `next-env.d.ts`.
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { chromium } from 'playwright-core';

import { ARRANGEMENTS } from './arrangements.mjs';

const HERE = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = path.resolve(HERE, '../../../..');
const PORT = 39174;
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const PASSWORD = `measure1-${randomBytes(9).toString('base64url')}`;

const VIEWPORTS = [
  { width: 1280, height: 1024 },
  { width: 1600, height: 1024 },
  { width: 1920, height: 1080 },
];

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

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
};
const FIXTURE = argValue('--fixture') ?? 'box';
const ONLY = argValue('--only')?.split(',') ?? null;
const ANATOMY = args.includes('--anatomy');
const CAPTURE = !args.includes('--no-capture');
const JSON_OUT = argValue('--json');

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (spawnSync('test', ['-x', candidate]).status === 0) return candidate;
  }
  return null;
}

function hashPassword(password) {
  const result = spawnSync('python3', [path.join(ROOT, 'scripts/hash-password.py')], {
    input: password,
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`hash-password.py failed: ${result.stderr}`);
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
    if (Date.now() > deadline) throw new Error(`server did not come up at ${url}`);
    await delay(300);
  }
}

// ---------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------

/** The two cards exactly as `measure-breakpoints.mjs` fabricates them (10c-3/A2). */
const card = (index, tempC) => ({
  index,
  name: 'Tesla PG500-216',
  bus: `00000000:${index === 0 ? '17' : '65'}:00.0`,
  tempC,
  powerW: 231,
  powerCapW: 250,
  memUsedMiB: index === 0 ? 26452 : 26650,
  memTotalMiB: 32768,
  utilPct: 97,
  smClockMHz: 1290,
  throttleReasons: '0x0000000000000004',
});

/**
 * Box-faithful: the machine `CLAUDE.md` describes, every collector succeeding. Values are
 * the ones recorded there (fan RPMs from the 2026-08-27 characterisation, the serving table
 * of 2026-09-06, 61 GiB + 8 GiB swap, the W-2135). `errors: []` because that is what a healthy
 * poll returns; the Mac's own response carries one `errors[]` entry per failed Linux collector
 * and every one of them renders as a note line somewhere in the grid.
 */
const fixtureBox = (opts = {}) => ({
  ts: new Date().toISOString(),
  hostname: 'ai-server',
  standing: [],
  gpus: [card(0, opts.gpu0TempC ?? 62), card(1, opts.gpu1TempC ?? 60)],
  host: {
    cpuPct: 31.4,
    loadAvg: [2.14, 1.87, 1.62],
    cpuTempC: 47,
    memUsedGiB: 33.2,
    memTotalGiB: 61.6,
    swapUsedGiB: 0,
    swapTotalGiB: 8,
    uptimeSec: 180_063,
    kernel: '7.0.0-30-generic',
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
  safety: {
    ufwEnforcing: true,
    pwm5Present: true,
    dkmsForRunningKernel: true,
    fanServiceState: 'active',
  },
  errors: [],
});

/** A mutable knob the route handler reads on every poll, so a test can flip to alarm. */
const fabrication = { mode: FIXTURE, alarm: false };

async function installFabrication(page) {
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
    const gpuTemps = fabrication.alarm ? { gpu0TempC: 86, gpu1TempC: 84 } : {};
    const replaced =
      fabrication.mode === 'mac'
        ? { ...body, gpus: [card(0, gpuTemps.gpu0TempC ?? 62), card(1, gpuTemps.gpu1TempC ?? 63)] }
        : { ...fixtureBox(gpuTemps), ts: body.ts ?? new Date().toISOString() };
    await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(replaced) });
  });
}

// ---------------------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------------------

const OVERRIDE_ID = 'tend-override';

async function applyOverride(page, css) {
  await page.evaluate(
    ({ id, css }) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
      }
      el.textContent = css;
    },
    { id: OVERRIDE_ID, css },
  );
}

/**
 * The measurement. Same primitives as `measure-breakpoints.mjs` measurement 9:
 * `documentElement.scrollHeight` vs `clientHeight`, the sticky band, the grid rect, every
 * slot's rect — plus, per slot, the panel's own content height vs its box (a bounded cell
 * that clips is a different failure from a page that scrolls, and both must be visible).
 */
async function measurePage(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const round = (n) => Math.round(n * 10) / 10;
    const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
    const bandRect = band ? band.getBoundingClientRect() : null;
    const gpu0 = document.querySelector('[data-slot="gpu0"]');
    const grid = gpu0 ? gpu0.parentElement : null;
    const gridRect = grid ? grid.getBoundingClientRect() : null;
    const gridStyle = grid ? getComputedStyle(grid) : null;
    const slots = {};
    for (const el of document.querySelectorAll('[data-slot]')) {
      const r = el.getBoundingClientRect();
      const panel = el.firstElementChild;
      const hidden = getComputedStyle(el).display === 'none';
      slots[el.getAttribute('data-slot')] = hidden
        ? { hidden: true }
        : {
            x: round(r.x),
            y: round(r.y),
            width: round(r.width),
            height: round(r.height),
            bottom: round(r.bottom),
            // the panel's intrinsic content height, so a bounded cell's clipping is visible
            contentHeight: panel ? panel.scrollHeight : null,
            panelBox: panel ? round(panel.getBoundingClientRect().height) : null,
            // horizontal overflow: content wider than the panel (a chart wider than its column)
            overflowX: panel ? Math.max(0, panel.scrollWidth - panel.clientWidth) : null,
          };
    }
    // Diagnostic: the five elements reaching furthest below the viewport, so an overflow can
    // be attributed to a specific box rather than only to "the page".
    const past = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > doc.clientHeight + 40) past.push({ bottom: Math.round(r.bottom), tag: el.tagName.toLowerCase(), slot: el.closest('[data-slot]')?.getAttribute('data-slot') ?? null, cls: (el.getAttribute('class') ?? '').slice(0, 40) });
    }
    past.sort((a, b) => b.bottom - a.bottom);
    const scrollBoxes = [...document.querySelectorAll('[role="group"], [tabindex="0"]')].map((el) => {
      const cs = getComputedStyle(el);
      return { slot: el.closest('[data-slot]')?.getAttribute('data-slot') ?? null, tag: el.tagName.toLowerCase(), overflowY: cs.overflowY, maxHeight: cs.maxHeight, height: Math.round(el.getBoundingClientRect().height), scrollHeight: el.scrollHeight, display: cs.display };
    });
    const extras = {};
    for (const id of ['tend-details', 'tend-strip']) {
      const el = document.getElementById(id);
      if (el) extras[id] = { height: round(el.getBoundingClientRect().height), bottom: round(el.getBoundingClientRect().bottom), open: el.open ?? null };
    }
    // The builder's real disclosure (spec §7.4 gives it `data-role="more"`) is reported under
    // the same key, so the acceptance run needs no override at all.
    const real = document.querySelector('details[data-role="more"]');
    if (real && !extras['tend-details']) extras['tend-details'] = { height: round(real.getBoundingClientRect().height), bottom: round(real.getBoundingClientRect().bottom), open: real.open };
    return {
      extras,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pastViewport: past.slice(0, 6),
      diag: (() => {
        const ul = document.querySelector('[data-slot="session-event-log"] ul');
        const box = ul ? ul.parentElement : null;
        const before = { docSH: doc.scrollHeight, bodySH: document.body.scrollHeight, bodyRect: Math.round(document.body.getBoundingClientRect().height), scrollingEl: document.scrollingElement.scrollHeight };
        if (!ul) return { before };
        ul.style.display = 'none';
        const ulHidden = { docSH: doc.scrollHeight, bodySH: document.body.scrollHeight };
        ul.style.display = '';
        const prevOv = box.style.overflow;
        box.style.overflow = 'hidden';
        const boxHidden = { docSH: doc.scrollHeight };
        box.style.overflow = prevOv;
        const prevPos = box.style.position;
        box.style.position = 'static';
        const boxStatic = { docSH: doc.scrollHeight };
        box.style.position = 'relative';
        const boxRelative = { docSH: doc.scrollHeight };
        box.style.position = prevPos;
        const chain = [];
        let el = box;
        while (el && el !== document.body) { const cs = getComputedStyle(el); chain.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-slot') ?? el.getAttribute('role') ?? ''}] d=${cs.display} ov=${cs.overflowY} h=${Math.round(el.getBoundingClientRect().height)} sh=${el.scrollHeight} pos=${cs.position}`); el = el.parentElement; }
        return { before, ulHidden, boxHidden, boxStatic, boxRelative, chain };
      })(),
      scrollBoxes,
      scrollHeight: doc.scrollHeight,
      clientHeight: doc.clientHeight,
      overflow: doc.scrollHeight - doc.clientHeight,
      band: bandRect ? round(bandRect.height) : null,
      grid: gridRect
        ? {
            y: round(gridRect.y),
            height: round(gridRect.height),
            bottom: round(gridRect.bottom),
            columns: gridStyle.gridTemplateColumns,
            rows: gridStyle.gridTemplateRows,
          }
        : null,
      slots,
    };
  });
}

/** Per-panel anatomy: each direct child of the panel `<section>` and of its body, with heights. */
async function anatomy(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[data-slot]')) {
      const section = el.firstElementChild;
      if (!section) continue;
      const parts = [];
      const head = section.firstElementChild;
      parts.push({ part: 'head', height: Math.round(head.getBoundingClientRect().height) });
      const body = section.children[1];
      if (body) {
        for (const child of body.children) {
          const r = child.getBoundingClientRect();
          const text = (child.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
          const svg = child.matches('svg') ? child : child.querySelector('svg');
          parts.push({
            part: child.tagName.toLowerCase() + (svg ? '(svg ' + svg.getAttribute('width') + 'x' + Math.round(svg.getBoundingClientRect().height) + ')' : ''),
            height: Math.round(r.height),
            text,
          });
        }
      }
      const cs = getComputedStyle(section);
      out[el.getAttribute('data-slot')] = {
        total: Math.round(section.getBoundingClientRect().height),
        padding: cs.paddingTop + '/' + cs.paddingBottom,
        gap: cs.rowGap,
        parts,
      };
    }
    return out;
  });
}

/** Toggle every chart panel to its table view (or back) via the real buttons. */
async function setAllViews(page, view) {
  const wanted = view === 'table';
  const buttons = await page.$$('button[aria-pressed]');
  for (const b of buttons) {
    const pressed = (await b.getAttribute('aria-pressed')) === 'true';
    if (pressed !== wanted) await b.click();
  }
  await page.waitForTimeout(150);
}

/**
 * Capture the live DOM as a self-contained HTML file: stylesheets inlined, scripts dropped,
 * the override `<style>` kept. Opening it in any browser reproduces the arrangement's
 * geometry (verified below by re-measuring it from `file://`).
 */
async function captureStatic(page, name, note) {
  const html = await page.evaluate(async (note) => {
    const clone = document.documentElement.cloneNode(true);
    // Inline every stylesheet so the file stands alone.
    const links = [...clone.querySelectorAll('link[rel="stylesheet"]')];
    for (const link of links) {
      const href = link.getAttribute('href');
      try {
        const css = await (await fetch(href)).text();
        const style = document.createElement('style');
        style.setAttribute('data-inlined-from', href);
        style.textContent = css;
        link.replaceWith(style);
      } catch {
        link.remove();
      }
    }
    for (const s of clone.querySelectorAll('script, link[rel="preload"], link[rel="modulepreload"], noscript')) s.remove();
    // Freeze the page: nothing polls, nothing ticks. Add a banner explaining what this is.
    const marker = document.createElement('div');
    marker.id = 'tend-mock-note';
    marker.setAttribute(
      'style',
      'position:fixed;right:8px;bottom:8px;z-index:99;font:11px ui-monospace,Menlo,monospace;color:#898781;background:#1a1a19;border:1px solid rgba(255,255,255,.1);padding:4px 8px;border-radius:4px;max-width:420px',
    );
    marker.textContent = note;
    clone.querySelector('body').appendChild(marker);
    return '<!doctype html>\n' + clone.outerHTML;
  }, note);
  const file = path.join(HERE, `${name}.html`);
  writeFileSync(file, html);
  return file;
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------

async function main() {
  const chromePath = findChrome();
  if (chromePath === null) throw new Error('no system Chrome found');

  const passwordHash = hashPassword(PASSWORD);
  const sessionSecret = randomBytes(32).toString('base64url');
  const nextEnvPath = path.join(ROOT, 'next-env.d.ts');
  const nextEnvBefore = readFileSync(nextEnvPath, 'utf8');

  console.log(`[10d] next dev on :${PORT}, fixture=${FIXTURE}`);
  const server = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), PASSWORD_HASH: passwordHash, SESSION_SECRET: sessionSecret },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  let browser = null;
  const report = { fixture: FIXTURE, arrangements: {}, extras: {} };
  try {
    await waitForServer(`http://localhost:${PORT}/login`, 90_000);
    browser = await chromium.launch({ headless: true, executablePath: chromePath });
    const page = await browser.newPage();
    await installFabrication(page);
    await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { timeout: 20_000 });
    // let a couple of polls land so traces have points and the log has its first entries
    await page.waitForTimeout(1200);

    const names = Object.keys(ARRANGEMENTS).filter((n) => ONLY === null || ONLY.includes(n));

    /** Reload the dashboard (session cookie persists) and wait for real GPU cards. */
    const reload = async () => {
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      // `attached`, not visible: at >=1600 the sparkline wrapper is display:none by design.
      await page.waitForSelector('[data-slot="gpu0"] [data-role="gpu-sparkline-wrap"]', { state: 'attached', timeout: 20_000 });
      await page.waitForTimeout(1200);
    };

    /** Pin §6.4's banner: two alarm-band GPU temperatures, then the 10 s wall-clock debounce. */
    const pinBanner = async () => {
      fabrication.alarm = true;
      await page.waitForSelector('[data-slot="gpu0"] >> text=/86 °C/', { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(12_500);
      const bannerText = await page.evaluate(() => {
        const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
        const banner = band?.children[1];
        return banner
          ? { text: banner.textContent.replace(/\s+/g, ' ').trim().slice(0, 160), height: Math.round(banner.getBoundingClientRect().height) }
          : null;
      });
      if (!bannerText) console.warn('⚠ banner did not pin');
      return bannerText;
    };

    /** One arrangement, all three viewports; `withTables` also toggles every chart to its table. */
    const measureArrangement = async (name, { withTables, anatomyToo }) => {
      const arr = ARRANGEMENTS[name];
      await applyOverride(page, arr.css);
      if (arr.dom) await page.evaluate(arr.dom);
      await page.waitForTimeout(150);
      const perViewport = {};
      for (const vp of VIEWPORTS) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(250);
        const m = await measurePage(page);
        if (anatomyToo) m.anatomy = await anatomy(page);
        perViewport[`${vp.width}x${vp.height}`] = m;
      }
      let tableView = null;
      if (withTables) {
        tableView = {};
        await setAllViews(page, 'table');
        for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
          await page.setViewportSize(vp);
          await page.waitForTimeout(250);
          tableView[`${vp.width}x${vp.height}`] = await measurePage(page);
        }
        await setAllViews(page, 'chart');
      }
      return { title: arr.title, viewports: perViewport, tableView };
    };

    const line = (name, per) =>
      `[10d] ${name}: ` +
      VIEWPORTS.map((vp) => {
        const m = per[`${vp.width}x${vp.height}`];
        return `${vp.width}x${vp.height} band=${m.band} grid=${m.grid?.height} overflow=${m.overflow}`;
      }).join(' | ');

    // ---- pass 1: no banner -------------------------------------------------------------
    for (const name of names) {
      const result = await measureArrangement(name, { withTables: true, anatomyToo: ANATOMY });
      report.arrangements[name] = result;
      if (CAPTURE) {
        await page.setViewportSize(VIEWPORTS[2]);
        await page.waitForTimeout(200);
        const file = await captureStatic(
          page,
          name,
          `10d mock "${name}" — static capture of the real app with the arrangement's CSS injected; fixture=${FIXTURE}. Chart interiors are letterboxed where a CHART_SIZE change is emulated by CSS; the boxes are exact.`,
        );
        result.mock = path.relative(ROOT, file);
      }
      console.log(line(name, result.viewports));
      if (ARRANGEMENTS[name].dom) await reload();
    }

    // ---- pass 2: with §6.4's banner pinned ----------------------------------------------
    // The banner is page state (debounced per page load), so DOM-mutating arrangements —
    // which need a reload — re-pin it each time.
    await applyOverride(page, '');
    let banner = await pinBanner();
    report.extras.banner = banner;
    console.log('[10d] banner:', JSON.stringify(banner));
    for (const name of names) {
      const result = await measureArrangement(name, { withTables: false, anatomyToo: false });
      report.arrangements[name].withBanner = result.viewports;
      console.log(line(`${name}+banner`, result.viewports));
      if (ARRANGEMENTS[name].dom) {
        await reload();
        banner = await pinBanner();
      }
    }
    fabrication.alarm = false;

    // ---- extras: re-measure the static captures from file:// ------------------------
    if (CAPTURE) {
      const check = {};
      for (const name of names) {
        const file = path.join(HERE, `${name}.html`);
        const p2 = await browser.newPage();
        await p2.goto(pathToFileURL(file).href, { waitUntil: 'load' });
        const per = {};
        for (const vp of VIEWPORTS) {
          await p2.setViewportSize(vp);
          await p2.waitForTimeout(150);
          const m = await measurePage(p2);
          const live = report.arrangements[name].viewports[`${vp.width}x${vp.height}`];
          per[`${vp.width}x${vp.height}`] = {
            grid: m.grid?.height,
            overflow: m.overflow,
            liveGrid: live.grid?.height,
            liveOverflow: live.overflow,
            delta: (m.grid?.height ?? 0) - (live.grid?.height ?? 0),
          };
        }
        await p2.close();
        check[name] = per;
      }
      report.extras.staticCheck = check;
      console.log('[10d] static-vs-live:', JSON.stringify(check));
    }

    if (JSON_OUT) {
      writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
      console.log(`[10d] wrote ${JSON_OUT}`);
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    if (browser !== null) await browser.close();
    try {
      if (readFileSync(nextEnvPath, 'utf8') !== nextEnvBefore) writeFileSync(nextEnvPath, nextEnvBefore);
    } catch {
      // generated file
    }
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // gone
    }
    await delay(300);
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // gone
    }
  }
}

mkdirSync(HERE, { recursive: true });
await main();
