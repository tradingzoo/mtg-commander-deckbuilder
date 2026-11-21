// LAYOUT BOT (from the Master Backbone app-tests kit): runs the app on mock data and checks every main
// screen at 320/360/390/412 px phones, an 800 px tablet and landscape.
// Fails on: a screen that will not open, anything spilling off the side, a script error.
// Run: npm run test:layout   (needs Playwright + Chromium; screenshots go to test/out/)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright'); // CommonJS, so a global install is found too
const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });
const PORT = 3456;
const SIZES = [[320, 568], [360, 740], [390, 844], [412, 915], [800, 1280], [780, 360]];

const server = spawn(process.execPath, ['server.js', '--mock'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

// Everything wider than the screen, except inside a sideways-scrolling box.
const spill = (p, w) => p.evaluate((w) => [...document.querySelectorAll('body *')]
  .filter(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || el.closest('.scroll, datalist, script, style')) return false;
    return r.right > w + 1 || r.left < -1;
  })
  .slice(0, 5).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : '')), w);

const fails = [];
const browser = await chromium.launch();
try {
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', e => fails.push(`${tag}: script error: ${e.message}`));
    try {
      await p.goto(`http://localhost:${PORT}/`);
      if ((await spill(p, w)).length) fails.push(`${tag} home spills: ${(await spill(p, w)).join(', ')}`);
      await p.fill('#commander', 'https://edhrec.com/commanders/krenko-mob-boss/core');
      await p.click('#go');
      await p.waitForSelector('#results:not([hidden])', { timeout: 5000 });
      await p.fill('#mydeck', '1 Krenko, Mob Boss\n1 Rhystic Study\n1 Sol Ring\n35 Mountain');
      await p.click('#compare');
      await p.waitForFunction(() => /Compared/.test(document.querySelector('#compareStatus').textContent), null, { timeout: 5000 });
      await p.click('#crossGo');
      await p.waitForSelector('table.cross', { timeout: 5000 });
      await p.click('#table tr.cat');
      const sp = await spill(p, w);
      if (sp.length) fails.push(`${tag} results spill: ${sp.join(', ')}`);
      if (w === 390 || w === 800) await p.screenshot({ path: `${out}layout-${tag}.png`, fullPage: true });
      await p.goto(`http://localhost:${PORT}/find.html`);
      if ((await spill(p, w)).length) fails.push(`${tag} finder spills: ${(await spill(p, w)).join(', ')}`);
      await p.fill('#card', 'Gimli of the Glittering Caves');
      await p.click('#go');
      await p.waitForSelector('#results:not([hidden]) .store', { timeout: 5000 });
      const fsp = await spill(p, w);
      if (fsp.length) fails.push(`${tag} finder results spill: ${fsp.join(', ')}`);
      await p.waitForTimeout(700); // let the fade-in finish
      if (w === 390 || w === 800) await p.screenshot({ path: `${out}find-${tag}.png`, fullPage: true });
      for (const pg of ['find-sealed', 'find-deals']) {
        await p.goto(`http://localhost:${PORT}/${pg}.html`);
        await p.waitForSelector('#offers .card', { timeout: 8000 });
        const ssp = await spill(p, w);
        if (ssp.length) fails.push(`${tag} ${pg} spills: ${ssp.join(', ')}`);
        if (w === 390 || w === 800) await p.screenshot({ path: `${out}${pg}-${tag}.png`, fullPage: true });
      }
      // Game tracker: setup, the table (no scrolling allowed), a player's sheet and the game log.
      await p.goto(`http://localhost:${PORT}/tracker.html`);
      await p.evaluate(() => localStorage.clear());
      await p.reload();
      if ((await spill(p, w)).length) fails.push(`${tag} tracker setup spills: ${(await spill(p, w)).join(', ')}`);
      await p.locator('#seats .nm').first().fill('A very long player name here');
      await p.locator('#seats .cm').first().fill('Dáin of the Ancient Halls');
      await p.click('#start');
      await p.waitForSelector('.panel');
      const tsp = await spill(p, w);
      if (tsp.length) fails.push(`${tag} tracker table spills: ${tsp.join(', ')}`);
      const over = await p.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1);
      if (over) fails.push(`${tag} tracker table scrolls`);
      if (w === 390 || w === 800) await p.screenshot({ path: `${out}tracker-${tag}.png` });
      await p.locator('.panel .badges').first().click();
      await p.waitForSelector('#sheet:not([hidden]) .step');
      const shp = await spill(p, w);
      if (shp.length) fails.push(`${tag} tracker sheet spills: ${shp.join(', ')}`);
      await p.click('#sheetClose');
      await p.click('#menuBtn'); await p.click('#endBtn');
      await p.locator('[data-w="0"]').click(); await p.click('#saveGame');
      await p.waitForSelector('#historyView:not([hidden]) .game-row');
      const hsp = await spill(p, w);
      if (hsp.length) fails.push(`${tag} tracker log spills: ${hsp.join(', ')}`);
    } catch (e) {
      fails.push(`${tag}: ${e.message.split('\n')[0]}`);
    }
    await p.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(fails.length ? 'LAYOUT FAILED:\n  ' + fails.join('\n  ') : `LAYOUT PASSED: ${SIZES.length} sizes`);
process.exit(fails.length ? 1 : 0);
