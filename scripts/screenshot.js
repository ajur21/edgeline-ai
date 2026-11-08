/* Renders every page at desktop and phone width, light and dark, into ./screenshots,
   and fails loudly on console errors or horizontal overflow.
   Requires Playwright with Chromium:  npm i -D playwright && npx playwright install chromium
   Run from the project root:          node scripts/screenshot.js */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'screenshots');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const pages = ['index.html', 'picks.html', 'games.html', 'digest.html', 'performance.html', 'journal.html', 'props.html'];
  const problems = [];
  for (const scheme of ['light', 'dark']) {
    for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 400, height: 860 }]]) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1 });
      /* the site defaults to dark; the light run opts in the way a visitor would, via the saved preference */
      await ctx.addInitScript(s => { try { localStorage.setItem('theme', s); } catch (e) {} }, scheme);
      /* never call ESPN from here: on a game day the pages ask its scoreboard for live scores and ESPN refuses a headless
         browser (a 403 with no CORS header), which failed this check with console errors (2026-11-08); an empty board instead */
      await ctx.route(/^https:\/\/site\.api\.espn\.com\//, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"events":[]}' }));
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error') problems.push(`${scheme}/${name}: ${m.text()}`); });
      page.on('pageerror', e => problems.push(`${scheme}/${name}: PAGEERROR ${e.message}`));
      for (const p of pages) {
        await page.goto('file://' + path.join(root, p), { waitUntil: 'load' });
        /* scroll through so scroll-revealed sections are in their final state */
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 60)); } window.scrollTo({ top: 0, behavior: 'instant' }); });
        await page.waitForTimeout(900);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > vp.width) problems.push(`${scheme}/${name}/${p}: horizontal overflow scrollWidth=${sw}`);
        await page.screenshot({ path: path.join(out, `${p.replace('.html', '')}-${name}-${scheme}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log('OK: no console errors, no overflow. Screenshots in', out);
})();
