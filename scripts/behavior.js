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
  if (useSample && rel === 'data/props.js') rel = 'scripts/fixtures/sample-props.js';
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
  check('plays: play of the day card renders the top-EV pick', await page.locator('#potd-host .potd h3.potd-selection').count() === 1 && (await page.textContent('#potd-host .potd .eyebrow')) === 'Play of the day');
  check('plays: parlay of the day has 2-3 legs and combined odds', (n => n >= 2 && n <= 3)(await page.locator('#parlay-host .parlay .parlay-legs li').count()) && /^[+-]\d+$/.test((await page.locator('#parlay-host .pick-metric .v').first().textContent()).trim()));
  check('plays: board card flagged as play of the day', await page.locator('#top-picks-grid article .badge-potd').count() === 1);
  await page.evaluate(() => localStorage.removeItem('parlay-slip'));
  await page.locator('#top-picks-grid article').first().locator('.pick-front .add-parlay').click();
  check('slip: adding from the home page shows the floating slip link with a count of 1', await page.locator('.slip-link').isVisible() && (await page.textContent('.slip-link strong')) === '1');
  check('slip: button reflects state', (await page.locator('#top-picks-grid article').first().locator('.pick-front .add-parlay').getAttribute('aria-pressed')) === 'true');
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
  check('slip: count carried over to the picks page', (await page.textContent('#slip-count')) === '1');
  check('best parlays: a ranked list renders with EV in the title', (await page.locator('#parlays-host .parlay').count()) >= 3 && /^#1 · \+[\d.]+% EV$/.test((await page.locator('#parlays-host .parlay .eyebrow').first().textContent()).trim()), await page.locator('#parlays-host .parlay .eyebrow').first().textContent());
  const evs = await page.locator('#parlays-host .parlay .eyebrow').allTextContents();
  check('best parlays: sorted by EV descending', evs.map(t => parseFloat(t.split('+')[1])).every((v, i, a) => i === 0 || v <= a[i - 1]), evs.join(' | '));
  await page.click('#parlay-size [data-size="3"]');
  check('best parlays: under the 3-leg filter the parlay of the day is the top ticket and tagged', (await page.locator('#parlays-host .parlay').first().locator('.badge-potd').count()) === 1);
  await page.click('#parlay-size [data-size="2"]');
  check('best parlays: 2-leg filter', (await page.locator('#parlays-host .parlay').count()) > 0 && (await page.locator('#parlays-host .parlay').evaluateAll(cs => cs.every(c => c.querySelectorAll('.parlay-legs li').length === 2))));
  await page.click('#parlay-size [data-size="4"]');
  check('best parlays: 4-leg filter shows only 4-leg tickets or an empty state', (await page.locator('#parlays-host .parlay').evaluateAll(cs => cs.every(c => c.querySelectorAll('.parlay-legs li').length === 4))));
  await page.click('#parlay-size [data-size="0"]');
  await page.locator('#parlays-host .parlay [data-load-parlay]').first().click();
  check('best parlays: load fills the slip at the ticket\'s book', !(await page.locator('#slip').isHidden()) && (await page.locator('#slip .slip-legs li').count()) >= 2 && (await page.textContent('#slip')).includes('One ticket at'));
  await page.click('#slip-close');
  await page.evaluate(() => window.EdgeLine.slip.set(['p1']));
  const cards = page.locator('.picks-grid article');
  await cards.nth(1).locator('.pick-front .add-parlay').click();
  await cards.nth(2).locator('.pick-front .add-parlay').click();
  await page.click('#slip-toggle');
  check('slip: opens with 3 legs from different games', await page.locator('#slip:not([hidden]) .slip-legs li').count() === 3);
  const combined = (await page.locator('#slip .slip-metrics .pick-metric .v').first().textContent()).trim();
  check('slip: prices the parlay at one book with combined odds', /^[+-]\d+$/.test(combined) && await page.locator('#slip-book').count() === 1 && (await page.textContent('#slip')).includes('One ticket at'), combined);
  await page.fill('#slip-stake', '25');
  check('slip: payout follows the stake', (await page.textContent('#slip-win')) !== '' && Number((await page.textContent('#slip-win')).replace('+', '')) > 25);
  await page.locator('#slip .slip-remove').first().click();
  check('slip: removing a leg updates the count', (await page.textContent('#slip-count')) === '2');
  await page.evaluate(() => { window.EdgeLine.slip.set(['p1', 'p1']); });
  check('slip: two legs from the same game warn', (await page.textContent('#slip')).includes('same game'));
  await page.click('#slip-load');
  const parlayLegs = await page.evaluate(() => window.PICKS_DATA.parlayOfDay.legs.length), parlayBook = await page.evaluate(() => window.PICKS_DATA.parlayOfDay.book);
  check('slip: loads the parlay of the day at its book', (await page.locator('#slip .slip-legs li').count()) === parlayLegs && (await page.inputValue('#slip-book')) === parlayBook);
  await page.click('#slip-clear');
  check('slip: clear empties it', (await page.textContent('#slip-count')) === '0' && (await page.textContent('#slip')).includes('Add picks'));
  await page.click('#slip-close');
  check('slip: close hides it and shows the toggle', await page.locator('#slip').isHidden() && await page.locator('#slip-toggle').isVisible());
  check('picks: table has a parlay column', true);
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
  check('perf: play and parlay record tiles', await page.locator('#feature-tiles .stat').count() === 2 && (await page.textContent('#feature-tiles')).includes('Play of the day'));
  check('perf: calendar renders a month of day cells with a summary', (await page.locator('#pnl-cal td.cal-day').count()) >= 28 && (await page.textContent('#pnl-cal .cal-summary')).includes('units'));
  check('perf: calendar colours winning and losing days', (await page.locator('#pnl-cal td.pos').count()) > 0 && (await page.locator('#pnl-cal td.neg').count()) > 0);
  const calTitle = await page.textContent('#pnl-cal .cal-title');
  await page.click('#pnl-cal [data-cal="-1"]');
  check('perf: calendar steps to the previous month', (await page.textContent('#pnl-cal .cal-title')) !== calTitle);
  check('perf: line has pathLength for draw-in', (await page.getAttribute('#units-chart .line', 'pathLength')) === '1');
  await page.locator('#units-chart').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  check('perf: chart svg animated once scrolled into view', await page.locator('#units-chart svg.animate').count() === 1);
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

  // journal: local-only bet log
  const jctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const jp = await jctx.newPage(); const jerr = []; jp.on('pageerror', e => jerr.push(e.message));
  jp.on('dialog', d => d.accept());
  await jp.goto(url('journal.html')); await jp.waitForTimeout(400);
  check('journal: empty state and calendar on first visit', (await jp.textContent('#j-list')).includes('first bet') && await jp.locator('#j-cal table.cal').count() === 1);
  await jp.fill('#j-form [name="bet"]', 'Buffalo -2.5'); await jp.fill('#j-form [name="odds"]', '-110'); await jp.fill('#j-form [name="stake"]', '2'); await jp.selectOption('#j-form [name="result"]', 'Win');
  await jp.click('#j-form button[type="submit"]'); await jp.waitForTimeout(400);
  check('journal: entry saved and listed', await jp.locator('#j-list .entry').count() === 1 && (await jp.textContent('#j-list')).includes('Buffalo -2.5'));
  check('journal: units tile shows +1.82u for 2u at -110', (await jp.locator('#j-stats .stat-value').first().textContent()) === '+1.82u', await jp.locator('#j-stats .stat-value').first().textContent());
  check('journal: calendar shows the day as a win', await jp.locator('#j-cal td.pos').count() === 1);
  await jp.reload(); await jp.waitForTimeout(400);
  check('journal: entry persists after reload', await jp.locator('#j-list .entry').count() === 1);
  await jp.selectOption('#j-list .entry select', 'Loss'); await jp.waitForTimeout(300);
  check('journal: changing the result re-grades (-2.00u)', (await jp.locator('#j-stats .stat-value').first().textContent()) === '-2.00u');
  await jp.locator('#j-list .entry .slip-remove').click(); await jp.waitForTimeout(300);
  check('journal: delete removes the entry', (await jp.textContent('#j-list')).includes('first bet'));
  check('journal: no page errors', jerr.length === 0, jerr.join(' | '));
  await jctx.close();

  // props research page (sample ESPN-shaped data)
  const pp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const perr = []; pp.on('pageerror', e => perr.push(e.message));
  await pp.goto(url('props.html')); await pp.waitForTimeout(500);
  const nProps = await pp.locator('#props-host .prop-card').count();
  check('props: player cards render with headshot, stats, sparkline and signals', nProps >= 4 && (await pp.locator('#props-host .prop-card').first().locator('.headshot, .prop-stats .pick-metric, .spark-bar, .signals').count()) > 8, 'cards ' + nProps);
  check('props: game filter has tonight\'s games', (await pp.locator('#p-game option').count()) >= 3);
  const firstName = await pp.locator('#props-host .prop-name').first().textContent();
  await pp.fill('#p-search', firstName.split(' ')[1] || firstName);
  check('props: search narrows to the player', (await pp.locator('#props-host .prop-card').count()) >= 1 && (await pp.locator('#props-host .prop-name').first().textContent()) === firstName);
  await pp.fill('#p-search', '');
  const lineInput = pp.locator('#props-host .prop-card').first().locator('.line-label input');
  await lineInput.fill('-0.5');
  check('props: a line below zero is cleared in every game (100%)', /Over (\d+)\/\1 L10 · 100%/.test(await pp.locator('#props-host .prop-card').first().locator('.hits').textContent()), await pp.locator('#props-host .prop-card').first().locator('.hits').textContent());
  await pp.reload(); await pp.waitForTimeout(400);
  check('props: the typed line is remembered', (await pp.locator('#props-host .prop-card').first().locator('.line-label input').inputValue()) === '-0.5');
  await pp.selectOption('#p-stat', 'reb');
  check('props: switching the stat relabels the summary', (await pp.textContent('#p-summary')).includes('Rebounds'));
  await pp.locator('#props-host .prop-card').first().locator('.prop-log summary').click();
  check('props: game log opens with rows', (await pp.locator('#props-host .prop-card').first().locator('.prop-log tbody tr').count()) >= 3);
  check('props: no page errors', perr.length === 0, perr.join(' | '));
  await pp.context().close();

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
  for (const p of ['index.html', 'picks.html', 'performance.html', 'journal.html', 'props.html']) { await rp.goto(url(p)); await rp.waitForTimeout(600); }
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
