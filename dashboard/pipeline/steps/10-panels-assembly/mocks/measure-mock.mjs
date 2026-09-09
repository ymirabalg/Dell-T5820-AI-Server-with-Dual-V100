// Measures a self-contained mock HTML at the three §6.1 viewports. Usage: node measure-mock.mjs <file> [state]
import { chromium } from 'playwright-core';
const file = process.argv[2]; const state = process.argv[3] || 'a';
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: exe, headless: true });
try {
  for (const [w, h] of [[1280,1024],[1600,1024],[1920,1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + file);
    if (state !== 'a') { await page.click(`.mockstrip__btn[data-go="${state}"]`); }
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const d = document.documentElement;
      const grid = document.querySelector('.grid'); const g = grid?.getBoundingClientRect();
      const strip = document.querySelector('.mockstrip')?.getBoundingClientRect();
      const slots = {};
      for (const id of ['gpu0','gpu1','cool','cpu','ram','safe','store','serv','log']) {
        const e = document.getElementById(id); if (e) slots[id] = Math.round(e.getBoundingClientRect().height);
      }
      return { sh: d.scrollHeight, ch: d.clientHeight, gridBottom: g ? Math.round(g.bottom) : null,
               mockstrip: strip ? Math.round(strip.height) : 0, slots };
    });
    console.log(`${w}x${h}  scrollHeight=${r.sh} viewport=${r.ch} overflow=${r.sh - r.ch}  gridBottom=${r.gridBottom}  (mock-viewer strip adds ${r.mockstrip}px that the real app will not have)`);
    console.log('   slot heights:', JSON.stringify(r.slots));
    await page.close();
  }
} finally { await browser.close(); }
