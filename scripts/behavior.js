/* Behaviour checks: nav state, filters, chart edge cases, keyboard access, theme toggle.
   Requires Playwright with Chromium (see README). Run from the project root: npm test */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const root = require('path').resolve(__dirname, '..');
/* Pages are served over a local HTTP server. Data files are swapped for the sample fixtures so the
   suite does not depend on whatever the pipeline last wrote; a final smoke pass uses the real data. */
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
let useSample = true;
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/^\//, '') || 'index.html';
  if (useSample && rel === 'data/picks.js') rel = 'scripts/fixtures/sample-picks.js';
  if (useSample && rel === 'data/performance.js') rel = 'scripts/fixtures/sample-performance.js';
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
let base = '';
const url = p => base + '/' + p;
const fails = [];
const check = (name, ok, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails.push(name); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // index: nav current, board, hero cards
  await page.goto(url('index.html'));
  check('index: exactly one aria-current link', await page.locator('.nav-links a[aria-current="page"]').count() === 1);
  check('index: current link is Home', (await page.locator('.nav-links a[aria-current="page"]').textContent()) === 'Home');
  check('index: 4 board rows', await page.locator('.board-row').count() === 4);
  check('index: 3 top picks, selection is h3', await page.locator('#top-picks-grid article .pick-front h3.pick-selection').count() === 3);
  check('index: card foot shows league and start', (await page.locator('#top-picks-grid .pick-foot span').first().textContent()).includes(' · '));
  check('index: no dev copy', !(await page.textContent('body')).match(/placeholder|replace with your own|edit these/i));
  check('index: primary nav landmark', await page.locator('nav[aria-label="Primary"]').count() === 1);
  check('index: favicon link', await page.locator('link[rel="icon"]').count() === 1);
  check('index: og tags', await page.locator('meta[property="og:title"]').count() === 1);
  check('index: ticker has every pick twice', await page.locator('#ticker-track .ticker-item').count() === 24);
  check('index: board rows link to picks', (await page.getAttribute('.board-row', 'href')).startsWith('picks.html#'));
  // flip card
  const firstCard = page.locator('#top-picks-grid article').first();
  await firstCard.locator('.pick-front .flip-btn').click();
  await page.waitForTimeout(700);
  check('flip: card flipped, back visible, front hidden', await firstCard.evaluate(c => c.classList.contains('flipped') && c.querySelector('.pick-back').getAttribute('aria-hidden') === 'false' && c.querySelector('.pick-front').getAttribute('aria-hidden') === 'true'));
  check('flip: back has factors', await firstCard.locator('.pick-back .pick-factors li').count() >= 2);
  check('flip: focus moved to back button', await page.evaluate(() => document.activeElement && document.activeElement.textContent === 'Back to numbers'));
  await firstCard.locator('.pick-back .flip-btn').click();
  await page.waitForTimeout(700);
  check('flip: flips back', await firstCard.evaluate(c => !c.classList.contains('flipped')));
  // calculator
  const edgeBefore = await page.textContent('#calc-edge');
  await page.locator('#calc-prob').evaluate(el => { el.value = '70'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('calc: edge updates', (await page.textContent('#calc-edge')) !== edgeBefore && (await page.textContent('#calc-verdict')) === 'High', await page.textContent('#calc-edge'));
  await page.locator('#calc-prob').evaluate(el => { el.value = '40'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('calc: negative edge -> No bet', (await page.textContent('#calc-verdict')) === 'No bet' && await page.locator('#calc-edge.neg').count() === 1);
  await page.locator('#calc-odds').evaluate(el => { el.value = '81'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  check('calc: odds slider reaches +300', (await page.textContent('#calc-odds-out')) === '+300', await page.textContent('#calc-odds-out'));
  // pricing toggle
  await page.click('[data-billing="yearly"]');
  check('pricing: yearly prices', (await page.textContent('[data-monthly="$29"]')) === '$23' && (await page.textContent('.plan-price small')).includes('yearly'));
  check('pricing: aria-pressed moved', (await page.getAttribute('[data-billing="yearly"]', 'aria-pressed')) === 'true' && (await page.getAttribute('[data-billing="monthly"]', 'aria-pressed')) === 'false');
  // theme toggle
  await page.click('.theme-toggle');
  check('theme toggle: dark by default, click -> light', await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
  check('sun icon visible in light', await page.locator('.theme-toggle .icon-sun').isVisible() && !(await page.locator('.theme-toggle .icon-moon').isVisible()));
  check('space canvas present and behind content', await page.evaluate(() => { const c = document.getElementById('space'); return !!c && c.width > 0 && getComputedStyle(c).position === 'fixed' && getComputedStyle(c).zIndex === '0'; }));
  await page.evaluate(() => localStorage.removeItem('theme'));

  // picks: filters, table, status
  await page.goto(url('picks.html'));
  check('picks: one aria-current', await page.locator('.nav-links a[aria-current="page"]').count() === 1 && (await page.locator('.nav-links a[aria-current="page"]').textContent()).includes('picks'));
  check('picks: 12 cards', await page.locator('.picks-grid article').count() === 12);
  check('picks: updated line has tz', /Updated .*\b[A-Z]{2,5}\b$/.test((await page.textContent('#generated-at')).trim()), await page.textContent('#generated-at'));
  await page.selectOption('#f-sort', 'odds');
  check('picks: sort by odds puts +145 first', (await page.locator('.picks-grid article .pick-market .mono').first().textContent()) === '+145');
  check('picks: summary names sort', (await page.textContent('#summary')).includes('sorted by odds'));
  await page.selectOption('#f-sort', 'edge');
  await page.selectOption('#f-sport', 'NFL'); await page.selectOption('#f-edge', '4');
  check('picks: filter NFL + 4% -> 1', await page.locator('.picks-grid article').count() === 1, await page.textContent('#summary'));
  check('picks: summary is status', (await page.getAttribute('#summary', 'role')) === 'status');
  await page.click('#view-table');
  check('picks: table view has region wrapper', await page.locator('#picks-host .table-wrap[role="region"][tabindex="0"] tbody tr').count() === 1);
  await page.selectOption('#f-conf', 'High'); await page.selectOption('#f-sport', 'NHL');
  check('picks: empty state', await page.locator('#picks-host .empty').count() === 1);

  // hash highlight from a board link
  await page.evaluate(() => { location.hash = '#p5'; });
  await page.waitForTimeout(300);
  check('picks: hash while filtered resets filters and highlights', await page.locator('article[data-id="p5"].highlight').count() === 1 && (await page.inputValue('#f-sport')) === '');
  await page.goto(url('index.html'));
  await page.goto(url('picks.html#p3'));
  await page.waitForTimeout(300);
  check('picks: hash on fresh load highlights the card', await page.locator('article[data-id="p3"].highlight').count() === 1);

  // performance
  await page.goto(url('performance.html'));
  check('perf: 4 stat tiles with subs', await page.locator('#stat-tiles .stat-sub').count() === 4);
  await page.waitForTimeout(1700);
  check('perf: count-up lands on final values', (await page.locator('#stat-tiles .stat-value').allTextContents()).join('|') === '+6.27u|54-47-5|53.5%|+5.9%', (await page.locator('#stat-tiles .stat-value').allTextContents()).join('|'));
  check('perf: line has pathLength for draw-in', (await page.getAttribute('#units-chart .line', 'pathLength')) === '1');
  check('perf: chart svg animated once visible', await page.locator('#units-chart svg.animate').count() === 1);
  await page.click('[data-range="7"]');
  await page.waitForTimeout(200);
  check('perf: 7d range -> 7 points', (await page.getAttribute('#units-chart .hit', 'aria-valuemax')) === '6' && (await page.getAttribute('[data-range="7"]', 'aria-pressed')) === 'true');
  check('perf: 7d re-based table has 7 rows', await page.locator('#units-table tbody tr').count() === 7);
  await page.click('[data-range="30"]');
  await page.waitForTimeout(200);
  check('perf: line chart svg role=group', (await page.getAttribute('#units-chart svg', 'role')) === 'group');
  check('perf: slider rect', (await page.getAttribute('#units-chart .hit', 'role')) === 'slider');
  await page.focus('#units-chart .hit');
  const vt1 = await page.getAttribute('#units-chart .hit', 'aria-valuetext');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  const vt2 = await page.getAttribute('#units-chart .hit', 'aria-valuetext');
  check('perf: arrow keys move valuetext', vt1 !== vt2, vt1 + ' -> ' + vt2);
  await page.keyboard.press('Home');
  check('perf: Home -> index 0', (await page.getAttribute('#units-chart .hit', 'aria-valuenow')) === '0');
  check('perf: tooltip visible while focused', await page.locator('#units-chart .tooltip').isVisible());
  const btn = page.locator('[data-toggle-table="units-table"]');
  check('perf: toggle aria-label unique', (await btn.getAttribute('aria-label')) === 'Show table for Cumulative units', await btn.getAttribute('aria-label'));
  await btn.click();
  check('perf: toggle opens table', (await btn.getAttribute('aria-expanded')) === 'true' && await page.locator('#units-table').isVisible() && (await btn.getAttribute('aria-label')).startsWith('Hide'));
  check('perf: recent table sport-appropriate', !(await page.textContent('#recent-host')).includes('215.5'));
  check('perf: tick labels no -0', !/(^|\s)-0(\s|$)/.test(await page.textContent('#units-chart svg')));

  // chart edge cases
  const edge = await page.evaluate(() => {
    const C = window.EdgeLineCharts; const out = {};
    const mk = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
    let d = mk(); C.lineChart(d, [], {}); out.lineEmpty = d.textContent;
    d = mk(); C.lineChart(d, [{ x: '2026-01-01', y: 1 }], {}); out.lineOne = d.textContent;
    d = mk(); C.lineChart(d, [{ x: '2026-01-01', y: -2 }, { x: '2026-01-02', y: -2 }], {}); out.lineFlatNeg = d.innerHTML.includes('NaN');
    d = mk(); C.lineChart(d, [{ x: '2026-01-01', y: 0.2 }, { x: '2026-01-02', y: 0.6 }], {}); out.lineSmallTicks = [...d.querySelectorAll('.tick')].map(t => t.textContent).join(',');
    d = mk(); C.barChart(d, [], {}); out.barEmpty = d.textContent;
    d = mk(); C.barChart(d, [{ label: 'A', value: 0 }, { label: 'B', value: 0 }], {}); out.barZero = d.innerHTML.includes('NaN');
    d = mk(); C.lineChart(d, [{ x: 'bogus', y: 1 }, { x: '2026-01-02', y: 2 }], {}); out.badDate = d.textContent.includes('Invalid');
    const E = window.EdgeLine;
    out.strOdds = Math.abs(E.impliedProb("+120") - 0.4545) < 0.001;
    out.invalidFiltered = E.sortByEdge([{ odds: -110, modelProb: 0.55 }, { odds: 'x', modelProb: 0.5 }, { odds: -110 }, { odds: 0, modelProb: 0.5 }]).length;
    out.signedNegZero = E.signed(-0.001, 1);
    return out;
  });
  check('charts: empty line -> message', edge.lineEmpty.includes('Not enough data'));
  check('charts: single point -> message', edge.lineOne.includes('Not enough data'));
  check('charts: flat negative line no NaN', edge.lineFlatNeg === false);
  check('charts: fractional ticks labelled', !/,0,0,/.test(',' + edge.lineSmallTicks + ','), edge.lineSmallTicks);
  check('charts: empty bars -> message', edge.barEmpty.includes('Not enough data'));
  check('charts: all-zero bars no NaN', edge.barZero === false);
  check('charts: bad date not Invalid Date', edge.badDate === false);
  check('odds: string odds coerced', edge.strOdds);
  check('picks: invalid picks filtered', edge.invalidFiltered === 1, String(edge.invalidFiltered));
  check('signed: no -0.0', edge.signedNegZero === '0.0', edge.signedNegZero);

  // phone board odds visible
  const ph = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  await ph.goto(url('index.html'));
  check('phone: board odds visible', await ph.locator('.board-odds').first().isVisible());
  check('phone: no overflow', await ph.evaluate(() => document.documentElement.scrollWidth) <= 400);
  // skip link visible on focus
  await ph.keyboard.press('Tab');
  const box = await ph.locator('a.visually-hidden').boundingBox();
  check('skip link visible on focus', box && box.width > 40 && box.height > 10, JSON.stringify(box));

  check('no page/console errors', errors.length === 0, errors.join(' | '));

  /* smoke pass over the real data files, whatever they currently hold (possibly an empty board) */
  useSample = false;
  const realErrors = []; const rp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  rp.on('pageerror', e => realErrors.push(e.message)); rp.on('console', m => { if (m.type() === 'error') realErrors.push(m.text()); });
  for (const p of ['index.html', 'picks.html', 'performance.html']) { await rp.goto(url(p)); await rp.waitForTimeout(600); }
  const realPicks = await rp.evaluate(() => (window.PICKS_DATA && window.PICKS_DATA.picks || []).length);
  await rp.goto(url('index.html')); await rp.waitForTimeout(400);
  const boardOk = await rp.evaluate(() => { const rows = document.querySelectorAll('#board-rows .board-row').length, empty = document.querySelectorAll('#board-rows .board-empty').length; return rows > 0 ? empty === 0 : empty === 1; });
  const sampleHidden = await rp.evaluate(() => { const d = window.PICKS_DATA; const flag = document.querySelector('[data-sample-flag="picks"]'); return !d || d.sample !== false ? true : (flag.hidden === true && getComputedStyle(flag).display === 'none'); });
  check('real data: all three pages load without errors (' + realPicks + ' picks on the board)', realErrors.length === 0, realErrors.join(' | '));
  check('real data: board shows rows or a single empty-state message', boardOk);
  check('real data: Sample label hidden when data is real', sampleHidden);
  await browser.close();
  server.close();
  console.log(fails.length ? 'FAILURES: ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
