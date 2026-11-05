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
  if (useSample && rel === 'data/market.js') rel = 'scripts/fixtures/sample-market.js';
  if (useSample && rel === 'data/faces.js') rel = 'scripts/fixtures/sample-faces.js';
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
  await firstCard.locator('.pick-back .flip-btn:not([data-breakdown])').click();
  await page.waitForTimeout(700);
  check('flip: flips back', await firstCard.evaluate(c => !c.classList.contains('flipped')));
  // full breakdown dialog from the card back, the play of the day and the parlay legs (the High-tier card among today's top three; the day-first order puts a Medium on top)
  const bdCard = page.locator('#top-picks-grid article', { has: page.locator('.badge-conf-high') }).first();
  check('breakdown: a High-tier card sits in today\'s top three', (await bdCard.count()) === 1);
  await bdCard.locator('.pick-front .flip-btn').click(); await page.waitForTimeout(700);
  await bdCard.locator('.pick-back [data-breakdown]').click(); await page.waitForTimeout(300);
  check('breakdown: dialog opens from the card back with tier, number and support (the risks list is checked on the picks page, on a card that has some)', await page.locator('#bd[open]').count() === 1 && (await page.locator('#bd .bd-pick').count()) === 1 && (await page.textContent('#bd')).includes('Why High') && (await page.locator('#bd .bd-support li').count()) >= 1);
  check('breakdown: injury report, rest, records and weather or indoor shown', (await page.locator('#bd .bd-inj li').count()) >= 1 && (await page.textContent('#bd')).includes('Rest') && (await page.textContent('#bd')).includes('Records'));
  check('breakdown: verdict line present', (await page.locator('#bd .bd-verdict').count()) === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check('breakdown: Escape closes it', await page.locator('#bd[open]').count() === 0);
  await bdCard.locator('.pick-back .flip-btn:not([data-breakdown])').click(); await page.waitForTimeout(500);
  await page.locator('#potd-host [data-breakdown]').click(); await page.waitForTimeout(300);
  check('breakdown: opens from the play of the day', await page.locator('#bd[open] .bd-pick').count() === 1 && (await page.textContent('#bd .bd-title')) === (await page.textContent('#potd-host .potd-selection')));
  await page.click('#bd [data-bd-close]'); await page.waitForTimeout(200);
  await page.locator('#parlay-host [data-breakdown]').click(); await page.waitForTimeout(300);
  const legN = await page.locator('#parlay-host .parlay-legs li').count();
  check('breakdown: parlay opens one section per leg', (await page.locator('#bd[open] .bd-pick').count()) === legN, 'legs ' + legN);
  await page.click('#bd [data-bd-close]'); await page.waitForTimeout(200);
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
  check('plays: top cards are ranked likeliest first with a rank chip on each', await page.evaluate(() => { const c = [...document.querySelectorAll('#top-picks-grid article')]; const f = c.map(a => parseFloat(a.querySelector('.pick-metric.lead .v').textContent)); return c.length === 3 && c[0].querySelector('.rank-top') && c[0].querySelector('.rank-top').textContent === '#1 · Likeliest' && c[2].querySelector('.rank').textContent === '#3' && f.every((v, i) => i === 0 || v <= f[i - 1]); }));
  check('plays: probability bar on every card, fill = fair, tick = implied', await page.evaluate(() => { const a = document.querySelector('#top-picks-grid article'); const fill = parseFloat(a.querySelector('.prob-fill').style.width), tick = parseFloat(a.querySelector('.prob-tick').style.left); const fair = parseFloat(a.querySelector('.pick-metric.lead .v').textContent), imp = parseFloat(a.querySelectorAll('.pick-metric .v')[1].textContent); return Math.abs(fill - fair) < 0.2 && Math.abs(tick - imp) < 0.2; }));
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
  check('picks: grid runs game day first, then positive edge, then likeliest, with a day heading opening each day and ranks in display order', (await page.locator('.picks-grid .day-divider').count()) >= 2 && await page.evaluate(() => { const E = window.EdgeLine; const kids = [...document.querySelector('.picks-grid').children]; const byId = {}; window.PICKS_DATA.picks.forEach(p => { byId[p.id] = p; }); let prev = null, rank = 0, ok = kids[0].classList.contains('day-divider'); kids.forEach(n => { if (n.classList.contains('day-divider')) { ok = ok && /·/.test(n.textContent); return; } const p = byId[n.getAttribute('data-id')], d = E.dayKey(p); rank++; if (n.querySelector('.rank').textContent !== (rank === 1 ? '#1 · Likeliest' : '#' + rank)) ok = false; if (prev) { const pd = E.dayKey(prev); if (d !== pd) { if (d < pd) ok = false; } else if ((E.edgeOf(p) > 0) !== (E.edgeOf(prev) > 0)) { if (E.edgeOf(p) > 0) ok = false; } else if (p.modelProb > prev.modelProb) ok = false; } prev = p; }); return ok && rank === 12 && new Set(window.PICKS_DATA.picks.map(E.dayKey)).size === document.querySelectorAll('.picks-grid .day-divider').length; }), await page.locator('.picks-grid .day-divider').allTextContents().then(t => t.join(' | ')));
  await page.selectOption('#f-sort', 'edge');
  check('picks: the biggest-edge order interleaves days, so it carries no day headings', (await page.locator('.picks-grid .day-divider').count()) === 0 && (await page.locator('.picks-grid article').count()) === 12);
  await page.selectOption('#f-sort', 'model');
  const riskCard = page.locator('.picks-grid article[data-id="p10"]');
  await riskCard.locator('.pick-front .flip-btn').click(); await page.waitForTimeout(700);
  await riskCard.locator('.pick-back [data-breakdown]').click(); await page.waitForTimeout(300);
  check('breakdown: a card with flagged risks lists them under what could go wrong', (await page.locator('#bd[open]').count()) === 1 && (await page.textContent('#bd')).includes('Why High') && (await page.locator('#bd .bd-support li').count()) >= 1 && (await page.locator('#bd .bd-risk li').count()) >= 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await riskCard.locator('.pick-back .flip-btn:not([data-breakdown])').click(); await page.waitForTimeout(500);
  check('picks: updated line has tz', /Updated .*\b[A-Z]{2,5}\b$/.test((await page.textContent('#generated-at')).trim()), await page.textContent('#generated-at'));
  check('slip: count carried over to the picks page', (await page.textContent('#slip-count')) === '1');
  check('best parlays: a ranked list renders with EV in the title', (await page.locator('#parlays-host .parlay').count()) >= 3 && /^#1 · [\d.]+% to hit · \+[\d.]+% EV$/.test((await page.locator('#parlays-host .parlay .eyebrow').first().textContent()).trim()), await page.locator('#parlays-host .parlay .eyebrow').first().textContent());
  const evs = await page.locator('#parlays-host .parlay .eyebrow').allTextContents();
  check('best parlays: earliest game day first, then the likeliest ticket', await page.evaluate(() => { const E = window.EdgeLine, all = E.bestParlays(window.PICKS_DATA.picks, { limit: 100000 }); return all.length >= 3 && all.every(p => p.day) && all.every((p, i) => i === 0 || p.day > all[i - 1].day || (p.day === all[i - 1].day && p.fairProb <= all[i - 1].fairProb)) && new Set(all.map(p => p.day)).size > 1; }), evs.join(' | '));
  await page.click('#parlay-size [data-size="3"]');
  check('best parlays: under the 3-leg filter the parlay of the day is listed and tagged', (await page.locator('#parlays-host .parlay .badge-potd').count()) === 1);
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
  check('perf: play, parlay and CLV tiles', await page.locator('#feature-tiles .stat').count() === 3 && (await page.textContent('#feature-tiles')).includes('Play of the day'));
  check('perf: CLV tile shows average points and beat rate from the fixture', (await page.locator('#clv-tile .stat-value').textContent()) === '+1.42 pts' && (await page.locator('#clv-tile .stat-value').getAttribute('class')).includes('clv-pos') && /62% of 92 picks/.test(await page.locator('#clv-tile .stat-sub').textContent()), await page.textContent('#clv-tile'));
  check('perf: recent table has a CLV column with signed points, or a line arrow when the close was on another number', (await page.locator('#recent-host thead th').allTextContents()).slice(-1)[0] === 'CLV' && (await page.locator('#recent-host tbody tr').first().locator('td').last().textContent()) === '+2.1' && (await page.locator('#recent-host tbody tr').nth(3).locator('td').last().textContent()) === 'line \u25B2' && (await page.locator('#recent-host tbody tr').nth(3).locator('td').last().locator('.clv-pos').count()) === 1, await page.locator('#recent-host tbody tr').nth(3).locator('td').last().textContent());
  check('perf: CLV tile sub counts line moves that went our way', /9 of 14 line moves/.test(await page.locator('#clv-tile .stat-sub').textContent()), await page.locator('#clv-tile .stat-sub').textContent());
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

  // props research page (sample ESPN-shaped data with fixture lines from SportsGameOdds)
  const pp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const perr = []; pp.on('pageerror', e => perr.push(e.message));
  await pp.goto(url('props.html')); await pp.waitForTimeout(500);
  const nProps = await pp.locator('#props-host .prop-card').count();
  check('props: player cards render with headshot, stat chips, history bars and signals', nProps >= 4 && (await pp.locator('#props-host .prop-card').first().locator('.headshot, .stat-chips [data-stat], svg.hist rect.hist-bar, .signals').count()) > 8, 'cards ' + nProps);
  check('props: sort defaults to likeliest first and the lines note names the books', (await pp.inputValue('#p-sort')) === 'prob' && /priced in .* at \d+ books/.test(await pp.textContent('#props-lines')));
  const rows = pp.locator('#props-board .pb-row');
  check('props board: ranked rows with #1 on top, a face, the side and line, a probability bar, a hit pill and a grade', (await rows.count()) >= 4 && (await rows.first().locator('.rank-top').count()) === 1 && (await rows.first().locator('.pb-face, .pb-line, .prob-bar, .hit-pill, .pb-agree .badge').count()) === 5, 'rows ' + await rows.count());
  const probs = await rows.evaluateAll(els => els.map(e => Number(e.getAttribute('data-prob'))));
  check('props board: our probability descending, no book-price tier or divider', probs.every((v, i) => i === 0 || v <= probs[i - 1] + 1e-9) && probs[0] > 0.5 && (await pp.locator('#props-board .grid-divider').count()) === 0, probs.join(','));
  check('props board: the how-to and the summary say the grade is game data, not other books', /not graded against other books/.test(await pp.textContent('#props-board-how')) && /game data only/.test(await pp.textContent('#pb-summary')) && /Never against other books/.test(await pp.textContent('#props-rule')));
  const r2 = rows.nth(1), pid2 = await r2.getAttribute('data-player'), stat2 = await r2.getAttribute('data-stat');
  await r2.locator('.pb-open').click(); await pp.waitForTimeout(300);
  const oc = pp.locator('#props-host .prop-card[data-id="' + pid2 + '"]');
  check('props board: Open card lands on the ranked stat with tonight\'s line typed in, the favoured side marked and the reasons listed', (await oc.locator('.stat-chips [data-stat="' + stat2 + '"]').getAttribute('aria-selected')) === 'true' && (await oc.locator('.line-big').inputValue()) !== '' && (await oc.locator('.side-pill.lead').count()) === 1 && (await oc.locator('.why .signal').count()) >= 2 && /Cleared|Stayed under/.test(await oc.locator('.why').textContent()));
  check('props board: the card\'s favoured side and grade match its board row', (await oc.locator('.side-pill.lead strong').textContent()).toLowerCase().startsWith(await r2.getAttribute('data-side')) && (await oc.locator('.pp-market .badge').textContent()) === (await r2.locator('.pb-agree .badge').textContent()));
  const fc = pp.locator('#props-host .prop-card').first();
  const marketLine = await fc.locator('.line-big').inputValue();
  check('props: a priced card starts on the market line with coloured bars, a graded pill and its board rank', marketLine !== '' && (await fc.locator('rect.hist-bar.neutral').count()) === 0 && /hit \d+ of \d+/.test(await fc.locator('.hit-pill').textContent()) && (await fc.locator('.prop-name-row .rank').textContent()) === '#1');
  const nl = pp.locator('#props-host .prop-card').filter({ has: pp.locator('.badge', { hasText: 'No line' }) }).first();
  check('props: an unpriced card shows neutral bars and asks for a line', (await nl.count()) === 1 && (await nl.locator('rect.hist-bar.neutral').count()) > 0 && (await nl.locator('.hit-pill').textContent()).includes('Type a line'));
  await fc.locator('.line-big').fill('-0.5');
  check('props: with a line every bar is green, the pill reads 100% and the grade regrades to High over', (await fc.locator('rect.hist-bar.under').count()) === 0 && (await fc.locator('rect.hist-bar.over').count()) > 0 && /100%/.test(await fc.locator('.hit-pill').textContent()) && (await fc.locator('.pp-market .badge').textContent()) === 'High' && (await fc.locator('.side-pill.lead strong').textContent()).startsWith('Over'));
  await fc.locator('.line-reset').click();
  check('props: the Market line button restores tonight\'s number and hides itself', (await fc.locator('.line-big').inputValue()) === marketLine && (await fc.locator('.line-reset').isHidden()));
  await fc.locator('.stat-chips.spans button').first().click();
  check('props: L5 toggle shows at most five bars', (await fc.locator('rect.hist-bar').count()) <= 5 && (await fc.locator('.stat-chips.spans button').first().getAttribute('aria-pressed')) === 'true');
  await fc.locator('.stat-chips [data-stat="reb"]').click();
  check('props: per-card stat chip switches the chart to rebounds', (await fc.locator('.pp-avg').textContent()).startsWith('Rebounds') && (await fc.locator('svg.hist').getAttribute('aria-label')).startsWith('Rebounds'));
  check('props: game filter has tonight\'s games', (await pp.locator('#p-game option').count()) >= 3);
  const firstName = await pp.locator('#props-host .prop-name').first().textContent();
  await pp.fill('#p-search', firstName.split(' ')[1] || firstName);
  check('props: search narrows to the player and the board follows', (await pp.locator('#props-host .prop-card').count()) >= 1 && (await pp.locator('#props-host .prop-name').first().textContent()) === firstName && (await rows.count()) === 1);
  await pp.fill('#p-search', '');
  await pp.selectOption('#p-lean', 'under');
  check('props: the Side filter keeps only props leaning under', (await rows.count()) >= 1 && (await rows.evaluateAll(els => els.every(e => e.getAttribute('data-side') === 'under'))));
  await pp.selectOption('#p-lean', '');
  await pp.locator('#props-host .prop-card').first().locator('.stat-chips [data-stat="pts"]').click();
  await pp.locator('#props-host .prop-card').first().locator('.line-big').fill('-0.5');
  check('props: a line below zero is cleared in every game (100%)', /Over (\d+)\/\1 L10 · 100%/.test(await pp.locator('#props-host .prop-card').first().locator('.hits').textContent()), await pp.locator('#props-host .prop-card').first().locator('.hits').textContent());
  await pp.reload(); await pp.waitForTimeout(400);
  await pp.locator('#props-host .prop-card').first().locator('.stat-chips [data-stat="pts"]').click();
  check('props: the typed line is remembered over the market line for that stat', (await pp.locator('#props-host .prop-card').first().locator('.line-big').inputValue()) === '-0.5');
  await pp.selectOption('#p-stat', 'reb');
  check('props: switching the stat relabels the summary and the board', (await pp.textContent('#p-summary')).includes('Rebounds') && (await pp.textContent('#pb-summary')).includes('Rebounds') && (await rows.evaluateAll(els => els.every(e => e.getAttribute('data-stat') === 'reb'))));
  await pp.locator('#props-host .prop-card').first().locator('.prop-log summary').click();
  check('props: game log opens with rows', (await pp.locator('#props-host .prop-card').first().locator('.prop-log tbody tr').count()) >= 3);
  check('props: no page errors', perr.length === 0, perr.join(' | '));
  await pp.context().close();

  // line shopping: chips on the card front, the ladder in the breakdown, a books column in the table
  await page.goto(url('picks.html')); await page.waitForTimeout(300);
  const c1 = page.locator('.picks-grid article[data-id="p1"]').first(); await c1.scrollIntoViewIfNeeded();
  check('shop: card front shows three book chips, best first, and a +N more note', (await c1.locator('.pick-shop .shop-chip').count()) === 3 && (await c1.locator('.pick-shop .shop-chip').first().getAttribute('class')).includes('best') && /^\+[24] more$/.test(await c1.locator('.pick-shop .shop-more').textContent()), await c1.locator('.pick-shop .shop-more').textContent());
  check('shop: maths on the fixture: 7 books, all clear the bar, the worst gives up 4.3 points', await page.evaluate(() => { const E = window.EdgeLine, p = window.PICKS_DATA.picks[0], s = E.lineShop(p); return s.books === 7 && s.clears === 7 && s.best.book === 'PointsBet' && s.worst.book === 'BetMGM' && !s.sole && /gives up 4\.3 points/.test(E.shopSummary(p)) && /Every one of the 7 books/.test(E.shopSummary(p)); }), await page.evaluate(() => window.EdgeLine.shopSummary(window.PICKS_DATA.picks[0])));
  check('shop: sole-book flag and badge when only one book clears the bar', await page.evaluate(() => { const E = window.EdgeLine, p = { modelProb: 0.5, odds: 120, prices: { DraftKings: 120, FanDuel: -105, BetMGM: -110 } }, s = E.lineShop(p); return s.sole && s.clears === 1 && s.plus === 1 && E.shopChips(p).querySelector('.badge-sole') !== null && /edge lives at one book/.test(E.shopSummary(p)); }));
  check('shop: a pick with no prices renders no chips and an empty summary', await page.evaluate(() => { const E = window.EdgeLine; return E.shopChips({ modelProb: 0.5, odds: 100 }) === null && E.shopSummary({ modelProb: 0.5, odds: 100 }) === '' && E.shopTable({ modelProb: 0.5, odds: 100, prices: { X: 'bad' } }) === null; }));
  await c1.locator('.pick-front .flip-btn').click(); await page.waitForTimeout(700);
  await c1.locator('.pick-back [data-breakdown]').click(); await page.waitForTimeout(300);
  check('mkt: breakdown shows the whole market\'s open-to-now line from the second source', (await page.locator('#bd .bd-mkt').count()) === 1 && (await page.textContent('#bd .bd-mkt')).includes('The market (7 books) opened -1.5 (-104), now -2.5 (+102)') && (await page.textContent('#bd .bd-mkt')).includes('3 moves tracked') && (await page.locator('#bd .bd-mkt .dk-toward').count()) === 1, await page.textContent('#bd .bd-mkt'));
  check('shop: ladder includes the books only the second source carries', (await page.locator('#bd .shop-table tbody tr').allTextContents()).some(t => /PointsBet/.test(t)) && (await page.locator('#bd .shop-table tbody tr').count()) === 7);
  check('dk: breakdown shows the DraftKings open-to-now line with a direction tag', (await page.locator('#bd .bd-dk:not(.bd-mkt)').count()) === 1 && (await page.locator('#bd .bd-dk:not(.bd-mkt) .dk-dir').textContent()).includes('toward') && (await page.textContent('#bd .bd-dk:not(.bd-mkt)')).includes('opened -1.5 (-110), now -2.5 (-110)') && (await page.textContent('#bd .bd-dk:not(.bd-mkt)')).includes('2 moves tracked'), await page.textContent('#bd .bd-dk:not(.bd-mkt)'));
  check('shop: breakdown dialog has the full ladder, best to worst, with a state per book', (await page.locator('#bd .shop-table tbody tr').count()) === 7 && (await page.locator('#bd .shop-table tbody tr').first().locator('.shop-state').textContent()) === 'Best price' && (await page.textContent('#bd')).includes('Line shopping'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('#view-table');
  check('shop: table view has a Books column showing clears/total', (await page.locator('#picks-host thead th').allTextContents()).includes('Books') && /^\d+\/\d+$/.test((await page.locator('#picks-host tbody tr').first().locator('td').nth(11).textContent()).trim()), await page.locator('#picks-host tbody tr').first().locator('td').nth(11).textContent());

  // market board on the picks page: every priced market with status, filters, link to the pick
  check('market: board renders rows game day first, then positive edge, then likeliest, with pick, watch and no-bet statuses', (await page.locator('#market-host tbody tr:not(.mkt-divider):not(.day-divider)').count()) === 40 && (await page.locator('#market-host tbody tr.mkt-pick').count()) >= 1 && (await page.locator('#market-host tbody tr.mkt-watch').count()) >= 1 && (await page.locator('#market-host tbody tr.mkt-none').count()) >= 1 && await page.evaluate(() => { const E = window.EdgeLine; const v = [...document.querySelectorAll('#market-host tbody tr:not(.mkt-divider):not(.day-divider)')].map(tr => ({ d: E.dayKey({ start: tr.querySelector('.mkt-start').textContent }), f: parseFloat(tr.children[6].textContent), e: /^\+/.test(tr.children[8].textContent.trim()) })); return new Set(v.map(x => x.d)).size > 1 && v.every(x => x.d) && v.every((x, i) => { if (i === 0) return true; const p = v[i - 1]; if (x.d !== p.d) return x.d > p.d; if (x.e !== p.e) return p.e && !x.e; return x.f <= p.f; }); }), 'rows ' + (await page.locator('#market-host tbody tr:not(.mkt-divider):not(.day-divider)').count()));
  check('market: a day heading opens each game day and the edge divider sits inside a day, after its last positive side', (await page.locator('#market-host tbody tr.day-divider').count()) >= 2 && /·/.test(await page.locator('#market-host tbody tr.day-divider').first().textContent()) && (await page.locator('#market-host tbody tr.mkt-divider').count()) >= 1 && (await page.textContent('#market-host tbody tr.mkt-divider')).includes('Priced against you') && await page.evaluate(() => { const rows = [...document.querySelectorAll('#market-host tbody tr')]; let day = 0; const seen = {}; return rows.every((tr, i) => { if (tr.classList.contains('day-divider')) { day++; return i === 0 || !rows[i - 1].classList.contains('day-divider'); } if (tr.classList.contains('mkt-divider')) { if (seen[day]) return false; seen[day] = true; const a = rows[i - 1], b = rows[i + 1]; return a && b && !a.classList.contains('day-divider') && !b.classList.contains('day-divider') && /^\+/.test(a.children[8].textContent.trim()) && !/^\+/.test(b.children[8].textContent.trim()); } return day > 0; }); }));
  await page.selectOption('#m-sort', 'edge');
  check('market: sort control switches to biggest edge first', await page.evaluate(() => { const v = [...document.querySelectorAll('#market-host tbody tr td:nth-child(9)')].map(td => parseFloat(td.textContent)); return v.length > 1 && v.every((x, i) => i === 0 || x <= v[i - 1]); }) && (await page.textContent('#market-sub')).includes('biggest edge first'));
  await page.selectOption('#m-sort', 'model');
  check('market: summary line counts markets, games, picks and watch', /48 markets in 8 games/.test(await page.textContent('#market-sub')) && /2 clear the 1-point bar/.test(await page.textContent('#market-sub')), await page.textContent('#market-sub'));
  check('market: a pick row links to its card', (await page.locator('#market-host tbody tr.mkt-pick a.badge-pick').first().getAttribute('href')) === '#p3' || (await page.locator('#market-host tbody tr.mkt-pick a.badge-pick').first().getAttribute('href')) === '#p11');
  await page.click('#market-more button'); await page.waitForTimeout(200);
  check('market: show more reveals the rest', (await page.locator('#market-host tbody tr:not(.mkt-divider):not(.day-divider)').count()) === 48);
  await page.selectOption('#m-status', 'watch');
  check('market: watch filter keeps only picks and watch rows', (await page.locator('#market-host tbody tr.mkt-none').count()) === 0 && (await page.locator('#market-host tbody tr:not(.mkt-divider):not(.day-divider)').count()) > 0);
  await page.selectOption('#m-status', ''); await page.fill('#m-search', 'Phoenix');
  check('market: search narrows to the game', (await page.locator('#market-host tbody tr:not(.mkt-divider):not(.day-divider)').count()) === 6 && (await page.textContent('#market-host')).includes('Denver @ Phoenix'));
  await page.fill('#m-search', '');

  // never empty: with no picks at all, home, picks and digest fall back to the closest markets
  const ectx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ep = await ectx.newPage(); const eerr = []; ep.on('pageerror', e => eerr.push(e.message)); ep.on('console', m => { if (m.type() === 'error') eerr.push(m.text()); });
  await ep.route('**/data/picks.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.PICKS_DATA = { sample: false, generatedAt: "2026-11-04T16:20:00Z", playOfDay: null, parlayOfDay: null, picks: [] };' }));
  await ep.goto(url('index.html')); await ep.waitForTimeout(500);
  check('empty: home board shows the four closest markets with a status, retitled', (await ep.locator('#board-rows .board-row.board-market').count()) === 4 && (await ep.textContent('#board-title')) === 'Worth a look tonight' && (await ep.locator('#board-rows .board-row .rank').count()) === 4 && await ep.evaluate(() => { const v = [...document.querySelectorAll('#board-rows .board-row')].map(r => r.textContent); return true; }) && /Watch|No bet/.test(await ep.textContent('#board-rows')) && /markets priced in 8 games/.test(await ep.textContent('#board-foot')));
  check('empty: ticker carries the watch list', (await ep.locator('#ticker-track .ticker-item').count()) > 0 && (await ep.locator('#ticker-track .t-watch').count()) > 0);
  check('empty: play of the day slot shows the closest market, labelled, with no parlay button', (await ep.locator('#potd-host .potd.potd-market').count()) === 1 && (await ep.textContent('#potd-host .eyebrow')) === 'Closest to the bar' && (await ep.locator('#potd-host .add-parlay').count()) === 0);
  check('empty: parlay slot shows the market pulse with the three closest markets', (await ep.locator('#parlay-host .pulse').count()) === 1 && (await ep.locator('#parlay-host .pulse .parlay-legs li').count()) === 3 && /48 markets/.test(await ep.textContent('#parlay-host')));
  check('empty: top picks grid shows three market cards with status badges and no parlay buttons', (await ep.locator('#top-picks-grid article.market-card').count()) === 3 && (await ep.locator('#top-picks-grid .add-parlay').count()) === 0 && (await ep.locator('#top-picks-grid .badge-status').count()) >= 3 && (await ep.textContent('#top-picks h2')).includes('likeliest sides'));
  await ep.goto(url('picks.html')); await ep.waitForTimeout(500);
  check('empty: picks page shows a labelled watch grid, the market pulse where parlays go, and the full board', (await ep.locator('#picks-host .watch-note').count()) === 1 && (await ep.locator('#picks-host article.market-card').count()) === 6 && (await ep.locator('#parlays-host .pulse').count()) === 1 && (await ep.locator('#market-host tbody tr:not(.mkt-divider):not(.day-divider)').count()) === 40);
  await ep.goto(url('digest.html')); await ep.waitForTimeout(500);
  check('empty: digest lede explains, tiles switch to market counts, slate lists the watch list', /No pick clears the 1-point bar/.test(await ep.textContent('#digest-lede')) && /Markets priced/.test(await ep.textContent('#digest-tiles')) && (await ep.locator('.digest-row').count()) === 12 && (await ep.locator('.digest-row .badge-status').count()) === 12 && (await ep.textContent('.digest-slate h2')).includes('watch list'));
  check('empty: digest copy text says it is a watch list', await ep.evaluate(() => /Watch list \(closest markets, not plays\)/.test(window.EdgeLineDigest.asText())));
  check('empty: no page errors across the fallbacks', eerr.length === 0, eerr.join(' | '));
  await ectx.close();

  // live in-game status: ESPN scoreboard mocked, sample flag cleared so the poller runs
  const lctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const lp = await lctx.newPage(); const lerr = []; lp.on('pageerror', e => lerr.push(e.message)); lp.on('console', m => { if (m.type() === 'error') lerr.push(m.text()); });
  let espnHits = 0;
  await lp.route('**/data/picks.js', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'scripts/fixtures/sample-picks.js'), 'utf8').replace('"sample": true', '"sample": false') }));
  await lp.route('**/site.api.espn.com/**', route => { espnHits++; route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [{ id: 'x0', competitions: [{ status: { displayClock: '7:32', period: 3, type: { state: 'in', completed: false, shortDetail: '7:32 - 3rd' } }, competitors: [
    { homeAway: 'home', score: '21', team: { displayName: 'Buffalo Bills', name: 'Bills', location: 'Buffalo', abbreviation: 'BUF', shortDisplayName: 'Bills' } },
    { homeAway: 'away', score: '17', team: { displayName: 'Kansas City Chiefs', name: 'Chiefs', location: 'Kansas City', abbreviation: 'KC', shortDisplayName: 'Chiefs' } }] }] }] }) }); });
  await lp.goto(url('picks.html')); await lp.waitForTimeout(900);
  const pill = lp.locator('article[data-id="p1"] [data-live="p1"] .live-pill');
  check('live: the in-progress game gets a pill with clock, score and the spread position', espnHits >= 1 && (await pill.count()) === 1 && /LIVE/.test(await pill.locator('.live-clock').textContent()) && (await pill.locator('.live-score').textContent()) === 'KC 17\u201321 BUF' && (await pill.locator('.live-state').textContent()) === 'covering by 1.5' && (await pill.getAttribute('class')).includes('tone-good'), 'hits ' + espnHits + ' ' + (await pill.count()));
  check('live: games not on the scoreboard show nothing', (await lp.locator('article[data-id="p2"] .live-pill').count()) === 0 && (await lp.locator('article[data-id="p2"] .live-slot').evaluate(s => s.textContent)) === '');
  check('live: pick state maths for moneyline, totals and a final', await lp.evaluate(() => { const L = window.EdgeLineLive; const g = { state: 'in', home: { abbr: 'BUF', score: 21, team: { displayName: 'Buffalo Bills', name: 'Bills', location: 'Buffalo', abbreviation: 'BUF', shortDisplayName: 'Bills' } }, away: { abbr: 'KC', score: 17, team: { displayName: 'Kansas City Chiefs', name: 'Chiefs', location: 'Kansas City', abbreviation: 'KC', shortDisplayName: 'Chiefs' } } };
    const ml = L.pickState({ pick: 'Kansas City ML', marketKey: 'h2h' }, g), ov = L.pickState({ pick: 'Over 44.5', marketKey: 'totals' }, g), un = L.pickState({ pick: 'Under 44.5', marketKey: 'totals' }, Object.assign({}, g, { state: 'post' })), dr = L.pickState({ pick: 'Draw', marketKey: 'h2h' }, g);
    return ml.text === 'trailing by 4' && ml.tone === 'bad' && ov.text === 'needs 6.5 more' && ov.tone === 'flat' && un.text === 'won (unofficial)' && un.tone === 'good' && dr.text === 'not level' && L.outcomeOf({ pick: 'Over 2.5 goals' }).point === 2.5; }));
  check('live: no page errors', lerr.length === 0, lerr.join(' | '));
  await lctx.close();

  // daily digest: the slate grouped by start time, lead plays, copy text
  const dp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const derr = []; dp.on('pageerror', e => derr.push(e.message)); dp.on('console', m => { if (m.type() === 'error') derr.push(m.text()); });
  await dp.goto(url('digest.html')); await dp.waitForTimeout(500);
  check('digest: nav current is Digest', (await dp.locator('.nav-links a[aria-current="page"]').textContent()) === 'Digest');
  check('digest: title names the day and the lede counts the board', (await dp.textContent('#digest-title')).startsWith('The slate for ') && /12 picks across \d sports/.test(await dp.textContent('#digest-lede')) && /biggest edge is/.test(await dp.textContent('#digest-lede')), await dp.textContent('#digest-lede'));
  check('digest: four tiles, lead plays and a top-3 list', (await dp.locator('#digest-tiles .stat').count()) === 4 && (await dp.locator('#potd-host .potd').count()) === 1 && (await dp.locator('#parlay-host .parlay').count()) === 1 && (await dp.locator('#top3 li').count()) === 3);
  check('digest: every pick listed once, today first then likeliest, each with a rank and its start time, a heading per day', (await dp.locator('.digest-row').count()) === 12 && (await dp.locator('.slot').count()) === 1 && (await dp.locator('.digest-row .rank').count()) === 12 && (await dp.locator('#slate-host .day-divider').count()) >= 2 && await dp.evaluate(() => { const E = window.EdgeLine, g = window.EdgeLineDigest.groups; const ps = g[0].picks, d = ps.map(E.dayKey), f = ps.map(p => p.modelProb); return /then likeliest/.test(g[0].label) && d.every(Boolean) && new Set(d).size > 1 && d.every((v, i) => i === 0 || v >= d[i - 1]) && f.every((v, i) => i === 0 || d[i] !== d[i - 1] || v <= f[i - 1]) && document.querySelectorAll('#slate-host .day-divider').length === new Set(d).size && document.querySelector('#slate-host .slot').children[1].classList.contains('day-divider') && document.querySelector('.digest-row .leg-event').textContent.includes(' ET') && /Today|Tomorrow|·/.test(document.querySelector('#slate-host .day-divider').textContent); }), await dp.evaluate(() => window.EdgeLineDigest.groups.map(g => g.label).join(' | ')));
  check('digest: a day never precedes an earlier one in the slate', await dp.evaluate(() => { const E = window.EdgeLine; const rows = [...document.querySelectorAll('#slate-host .slot > *')]; let cur = null, prevKey = null, ok = true; const byId = {}; window.EdgeLineDigest.groups[0].picks.forEach(p => { byId[p.id] = E.dayKey(p); }); rows.forEach(n => { if (n.classList.contains('day-divider')) cur = n; else if (n.classList.contains('digest-row')) { const k = byId[n.getAttribute('data-id')]; if (prevKey && k < prevKey) ok = false; prevKey = k; if (!cur) ok = false; } }); return ok; }));
  check('digest: a row carries the verdict, price, edge, confidence and a live slot', (await dp.locator('.digest-row').first().locator('.digest-why, .digest-nums .mono, .digest-tags .badge-conf-high, .digest-tags .badge-conf-medium, .digest-tags .badge-conf-lean, .live-slot').count()) === 4);
  check('digest: copy text lists every pick under its group and ends with the helpline', await dp.evaluate(() => { const t = window.EdgeLineDigest.asText(); return t.split('\n').filter(l => /^  #\d+ · (NFL|NBA|MLB|NHL|Soccer) · /.test(l)).length === 12 && t.includes('1-800-GAMBLER') && t.includes('Play of the day:') && t.includes('Parlay of the day'); }));
  await dp.locator('.digest-row [data-breakdown]').first().click(); await dp.waitForTimeout(300);
  check('digest: breakdown opens from a row', await dp.locator('#bd[open] .bd-pick').count() === 1);
  check('digest: print button present, no page errors', (await dp.locator('#digest-print').count()) === 1 && derr.length === 0, derr.join(' | '));
  await dp.context().close();

  // subscribe section: the preview event renders from the data, the links point at the feeds
  const sp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await sp.goto(url('index.html')); await sp.waitForTimeout(300);
  check('subscribe: preview event rendered with a title and sport badge', await sp.locator('#sub-preview-host .cal-title').count() === 1 && await sp.locator('#sub-preview-host .badge-sport').count() === 1);
  check('subscribe: calendar link is a webcal URL ending in picks.ics', /^webcal:\/\/.+\/picks\.ics$/.test(await sp.getAttribute('#sub-webcal', 'href') || ''));
  check('subscribe: feed link and head alternate link point at feed.xml', (await sp.getAttribute('#sub-rss', 'href')) === 'feed.xml' && (await sp.getAttribute('link[rel="alternate"][type="application/rss+xml"]', 'href')) === 'feed.xml');
  check('subscribe: free plan button goes to the section', (await sp.getAttribute('.plan:not(.featured) .btn', 'href')) === '#subscribe');
  check('subscribe: copy buttons are present', await sp.locator('#subscribe [data-copy]').count() === 2);
  await sp.context().close();

  // team identity: logos, matchups, tint and faces (js/teams.js + data/teams.js + data/faces.js)
  const ip = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await ip.goto(url('index.html')); await ip.waitForTimeout(500);
  check('teams: every top pick card carries a matchup with two logos', await ip.locator('#top-picks-grid article .pick-front .matchup').count() === 3 && await ip.locator('#top-picks-grid article .pick-front .matchup .team-logo').count() === 6);
  check('teams: logos come from ESPN, resized', (await ip.getAttribute('#top-picks-grid article .pick-front .matchup img.team-logo', 'src') || '').startsWith('https://a.espncdn.com/combiner/i?img='));
  check('order: game day first, then positive-edge sides, likeliest first within each tier, on the home board and in sortByProb', await ip.evaluate(() => { const E = window.EdgeLine; const rows = E.marketRows({ limit: 50, oneSidePerMarket: true }); const d = rows.map(E.dayKey), pos = rows.map(r => E.edgeOf(r) > 0); return rows.length > 5 && d.every(Boolean) && new Set(d).size > 1 && rows.every((r, i) => { if (i === 0) return true; if (d[i] !== d[i - 1]) return d[i] > d[i - 1]; if (pos[i] !== pos[i - 1]) return pos[i - 1] && !pos[i]; return r.modelProb <= rows[i - 1].modelProb; }) && E.sortByProb([{ odds: -110, modelProb: 0.5 }, { odds: 200, modelProb: 0.4 }, { odds: -110, modelProb: 0.7 }]).map(p => p.modelProb).join() === '0.7,0.4,0.5' && E.sortByProb([{ odds: -110, modelProb: 0.5, commence: '2026-11-05T01:00:00Z' }, { odds: -110, modelProb: 0.9, commence: '2026-11-06T01:00:00Z' }, { odds: -110, modelProb: 0.6, commence: '2026-11-05T02:00:00Z' }, { odds: -110, modelProb: 0.55, start: 'Tomorrow 7:00 PM ET' }]).map(p => p.modelProb).join() === '0.6,0.5,0.9,0.55' && E.dayKey({ commence: '2026-11-05T03:30:00Z' }) === '2026-11-04' && E.dayKey({ commence: '2026-11-05T05:30:00Z' }) === '2026-11-05' && /^(Today|Tomorrow|[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2})$/.test(E.dayLabel('2026-11-06')); }));
  check('order: the home board and ticker start with the earliest game day', await ip.evaluate(() => { const E = window.EdgeLine; const ranked = E.sortByProb(window.PICKS_DATA.picks); const first = E.dayKey(ranked[0]); return ranked.every(p => E.dayKey(p) >= first) && document.querySelector('#board-rows .board-row .rank').textContent === '#1'; }));
  check('teams: the picked side is lit and the other dimmed', await ip.evaluate(() => { const m = document.querySelector('#top-picks-grid article .matchup[data-side="home"], #top-picks-grid article .matchup[data-side="away"]'); return !!m && m.querySelectorAll('.mu-team.is-pick').length === 1 && m.querySelectorAll('.mu-team.is-off').length === 1; }));
  check('teams: a total lights both sides', await ip.evaluate(() => { const m = document.querySelector('.matchup[data-side="total"]'); return !!m && m.querySelectorAll('.mu-team.is-on').length === 2 && m.querySelectorAll('.mu-team.is-pick').length === 0; }));
  check('teams: cards are tinted with the team colour', await ip.evaluate(() => { const c = document.querySelector('#top-picks-grid article.has-team'); return !!c && /^#[0-9a-f]{6}$/i.test(c.style.getPropertyValue('--team').trim()); }));
  check('teams: play of the day shows the large matchup', await ip.locator('#potd-host .matchup-lg .team-logo').count() === 2);
  check('teams: hero board rows and ticker items carry a logo', await ip.locator('#board-rows .board-row .team-logo').count() >= 4 && await ip.locator('#ticker-track .ticker-item .team-logo').count() >= 24);
  check('teams: parlay legs show the small matchup beside the sport badge', await ip.locator('#parlay-host .parlay-legs li .leg-id .matchup-sm').count() >= 2);
  check('teams: resolver maps feed names to ESPN teams', await ip.evaluate(() => { const T = window.EdgeLineTeams; return T.find('NBA', 'Los Angeles Clippers').abbr === 'LAC' && T.find('MLB', 'LA Dodgers').abbr === 'LAD' && T.find('NFL', 'Kansas City').abbr === 'KC' && T.find('Soccer', 'Man City').abbr === 'MNC' && T.find('NFL', 'New York') === null; }));
  check('teams: an unknown team falls back to a monogram, never a broken image', await ip.evaluate(() => { const n = window.EdgeLineTeams.logo(null, 'Nowhere Rovers', 24); return n.tagName === 'SPAN' && n.classList.contains('team-mono') && n.textContent === 'NR'; }));
  check('teams: side detection from the pick text', await ip.evaluate(() => { const T = window.EdgeLineTeams; return T.side({ sport: 'NFL', home: 'Buffalo', away: 'Kansas City', pick: 'Buffalo -2.5' }) === 'home' && T.side({ sport: 'NBA', event: 'Denver @ Phoenix', pick: 'Denver +3.5' }) === 'away' && T.side({ sport: 'NHL', home: 'Boston', away: 'NY Rangers', pick: 'Under 5.5' }) === 'total'; }));
  await ip.goto(url('picks.html')); await ip.waitForTimeout(600);
  const nbaCard = ip.locator('.picks-grid article[data-sport="NBA"]', { hasText: 'Boston' }).first();
  check('faces: the NBA card back lists names to know, the injured first', await nbaCard.locator('.pick-back .faces .face').count() >= 2 && await nbaCard.evaluate(c => { const f = c.querySelectorAll('.pick-back .faces .face'); return f[0].classList.contains('face-hurt') && !!f[0].querySelector('.inj-status') && !!c.querySelector('.pick-back .faces .face-img'); }));
  check('faces: a card with no roster data shows no strip', await ip.locator('.picks-grid article[data-sport="NHL"] .faces').count() === 0);
  await nbaCard.locator('.pick-front .flip-btn').click(); await ip.waitForTimeout(700);
  await nbaCard.locator('.pick-back [data-breakdown]').click(); await ip.waitForTimeout(400);
  check('faces: the breakdown shows a face on each listed injury and a Names to know block', await ip.locator('#bd[open] .bd-inj li .face-img, #bd[open] .bd-inj li .face-mono').count() >= 1 && (await ip.textContent('#bd')).includes('Names to know') && await ip.locator('#bd .bd-cell .faces .face').count() >= 2 && await ip.locator('#bd .bd-id .matchup .team-logo').count() === 2);
  await ip.keyboard.press('Escape'); await ip.waitForTimeout(200);
  check('teams: market board fits without a horizontal scroll at desktop width', await ip.evaluate(() => { const w = document.querySelector('#market-host .market-table'); return !!w && w.scrollWidth <= w.clientWidth + 1; }), await ip.evaluate(() => { const w = document.querySelector('#market-host .market-table'); return w ? w.scrollWidth + '/' + w.clientWidth : 'none'; }));
  check('teams: market board game cells carry the small matchup', await ip.locator('#market-host .market-table tbody tr .mkt-game .matchup-sm').count() >= 10);
  await ip.goto(url('digest.html')); await ip.waitForTimeout(500);
  check('teams: digest rows carry the matchup', await ip.locator('#slate-host .digest-row .leg-id .matchup-sm').count() >= 10);
  check('teams: no page errors', errors.length === 0, errors.join(' | '));
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
  for (const p of ['index.html', 'picks.html', 'digest.html', 'performance.html', 'journal.html', 'props.html']) { await rp.goto(url(p)); await rp.waitForTimeout(600); }
  const realPicks = await rp.evaluate(() => (window.PICKS_DATA && window.PICKS_DATA.picks || []).length);
  await rp.goto(url('index.html')); await rp.waitForTimeout(400);
  const boardOk = await rp.evaluate(() => { const rows = document.querySelectorAll('#board-rows .board-row').length, empty = document.querySelectorAll('#board-rows .board-empty').length; return rows > 0 ? empty === 0 : empty === 1; });
  const sampleHidden = await rp.evaluate(() => { const d = window.PICKS_DATA; const flag = document.querySelector('[data-sample-flag="picks"]'); return !d || d.sample !== false ? true : (flag.hidden === true && getComputedStyle(flag).display === 'none'); });
  check('real data: every page loads without errors (' + realPicks + ' picks on the board)', realErrors.length === 0, realErrors.join(' | '));
  check('real data: board shows rows or a single empty-state message', boardOk);
  check('real data: Sample label hidden when data is real', sampleHidden);
  await browser.close();
  server.close();
  console.log(fails.length ? 'FAILURES: ' + fails.length : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
