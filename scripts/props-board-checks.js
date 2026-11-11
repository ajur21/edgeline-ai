/* Behaviour checks for the props page, the ranked board (2026-11-10), run by scripts/behavior.js (npm test) with its
   server, clock and check(). The page is props.html; the grade it presents is js/props-grade.js, required here too so a
   check can compare the board with the module's own answer. Data is scripts/fixtures/sample-props.js (which carries the
   two contract pieces, leagues.<league>.stats and results) and variants of it built below: no results and no stats,
   no lines in either league, an NFL morning, two game days, a stat the page has never seen, other prices, a graded game.
   ESPN's image CDN is answered from here: a stalled headshot would otherwise hold a page's load event (2026-11-10). */
const vm = require('vm');
const G = require('../js/props-grade.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ATL_WSH = '401909923', MIL_BOS = '401909924', JAX_BAL = '401873037';
const GEORGE = '4251', WALKER = '4278039', FLEMINGS = '5149077', BRISSETT = '2578570';
const STARTED = Date.parse('2026-11-04T19:10:00-05:00');      /* ATL @ WSH tipped at 7:00, MIL @ BOS tips at 7:30 */
const NEXT_MORNING = Date.parse('2026-11-05T08:00:00-05:00'); /* both NBA games long over; the NFL game is that night */

async function run(h) {
  const { browser, url, check, pinClock, sampleSrc, FIXTURE_NOW } = h;
  const SRC = sampleSrc('sample-props.js');
  const sample = () => { const s = { window: {} }; vm.runInNewContext(SRC, s); return JSON.parse(JSON.stringify(s.window.PROPS_DATA)); };
  const body = d => 'window.PROPS_DATA = ' + JSON.stringify(d) + ';';
  const errors = [];
  /* a page on its own context: the clock pinned, ESPN answered, optionally another props file */
  const open = async (query, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
    await ctx.route('**/site.api.espn.com/**', route => route.fulfill({ contentType: 'application/json', body: '{"events":[]}' }));
    await ctx.route('**/a.espncdn.com/**', route => (opts.noImages ? route.abort() : route.fulfill({ contentType: 'image/png', body: PNG })));
    if (opts.data) await ctx.route('**/data/props.js', route => route.fulfill({ contentType: 'text/javascript', body: body(opts.data) }));
    const page = await ctx.newPage(); await pinClock(page, opts.at);
    if (!opts.noImages) { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); }
    await page.goto(url('props.html' + (query ? '?' + query : ''))); await page.waitForSelector('#props-ctl', { state: 'attached' }); await page.waitForTimeout(250);
    return page;
  };
  const rowsOf = page => page.$$eval('#props-board tr.pr', els => els.map(e => ({ id: e.dataset.player, stat: e.dataset.stat, side: e.dataset.side, line: Number(e.dataset.line), prob: e.dataset.prob, rank: Number(e.dataset.rank), league: e.dataset.league, day: e.dataset.day, game: e.querySelector('.pr-match').textContent, best: e.querySelector('.pr-best').textContent })));
  const params = page => Object.fromEntries(new URL(page.url()).searchParams);
  const text = (page, sel) => page.$eval(sel, n => n.textContent.replace(/\s+/g, ' ').trim());
  const shown = (page, sel) => page.$$eval(sel, els => els.filter(n => !n.hidden && n.getClientRects().length).length);
  const strip = page => page.$$eval('.subnav a', els => els.filter(a => !a.hidden).map(a => a.getAttribute('href')).join(' '));
  /* the module's own board for a league at a clock: what the page must show, in order */
  const board = (D, lg, at, opt) => { const ctx = G.context(D); return D.players.filter(p => G.leagueOf(p) === lg).map(p => G.bestSide(p, Object.assign({ now: at, ctx }, opt || {}))).filter(Boolean).sort((a, b) => G.better(a, b, ctx)); };
  const same = (rows, want) => rows.length === want.length && rows.every((r, i) => r.id === String(want[i].p.id) && r.stat === want[i].k && r.side === want[i].side && r.line === want[i].line && r.prob === want[i].prob.toFixed(4));
  const dialog = page => page.evaluate(() => {
    const d = document.querySelector('dialog#pd'), all = s => Array.from(d.querySelectorAll(s)), one = s => { const n = d.querySelector(s); return n && !n.hidden ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
    if (!d || !d.open) return null;
    return { name: one('#pd-name'), stat: d.dataset.stat, side: d.dataset.side || null, prob: d.dataset.prob || null, tier: d.dataset.tier || null, line: d.querySelector('#pd-line').value, head: one('.pd-chart-head .pd-h'), meta: one('.pd-meta'),
      bars: all('.hist-bar').length, over: all('.hist-bar.over').length, under: all('.hist-bar.under').length, neutral: all('.hist-bar.neutral').length, lineLabel: one('.hist-line-label'), avgLine: all('.hist-line.avg').length, opps: all('.hist-opp').map(n => n.textContent),
      sides: all('.pd-side').map(n => ({ side: n.dataset.side, lean: n.classList.contains('is-lean'), badge: (n.querySelector('.badge') || {}).textContent || null, prob: n.querySelector('.pd-side-prob strong').textContent, prices: Array.from(n.querySelectorAll('.shop-chip')).map(c => c.textContent), best: Array.from(n.querySelectorAll('.shop-chip.best')).length })),
      note: one('.pd-note'), reset: one('#pd-reset'), why: all('.pd-why li').map(n => n.textContent), whyHead: one('.pd-body > h3.pd-h'), opp: one('.pd-opp'), chips: all('.pd-stats button').map(n => n.textContent + (n.getAttribute('aria-pressed') === 'true' ? '*' : '')),
      logHead: (d.querySelector('.pd-log thead') || {}).textContent || '', logRows: all('.pd-log tbody tr').length, rule: one('.bd-rule'), state: one('.pd-name-row .badge-state'), rank: one('.pd-name-row .rank'), focusIn: d.contains(document.activeElement) };
  });
  /* text cut off inside its own box, text past the edge of the screen, and tables or the dialog that scroll sideways */
  const clipped = page => page.evaluate(() => {
    const bad = [], vw = document.documentElement.clientWidth, roots = [document.getElementById('main'), document.querySelector('dialog#pd[open]')].filter(Boolean);
    const name = n => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : '') + ' "' + n.textContent.trim().slice(0, 30) + '"';
    roots.forEach(root => root.querySelectorAll('*').forEach(n => {
      if (n.closest('.subnav') || n.closest('svg') || n.closest('.visually-hidden') || !n.getClientRects().length) return;
      if (!Array.from(n.childNodes).some(c => c.nodeType === 3 && c.textContent.trim())) return;
      const cs = getComputedStyle(n), r = n.getBoundingClientRect();
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') && n.scrollWidth > n.clientWidth + 1) bad.push('cut: ' + name(n));
      if (r.right > vw + 0.5 || r.left < -0.5) bad.push('off screen: ' + name(n));
    }));
    document.querySelectorAll('#main .table-wrap, dialog#pd[open] .table-wrap, dialog#pd[open] .pd-body, dialog#pd[open] .hist-host').forEach(w => { if (w.getClientRects().length && w.scrollWidth > w.clientWidth + 1) bad.push('scrolls sideways: ' + w.className + ' ' + w.scrollWidth + ' in ' + w.clientWidth); });
    if (document.documentElement.scrollWidth > vw) bad.push('page ' + document.documentElement.scrollWidth + ' in ' + vw);
    return bad;
  });

  const D = sample();

  /* ---------- the head and the board ---------- */
  const a = await open('');
  const upd = await a.$$eval('#props-updated .update-line > span', els => els.map(n => n.textContent));
  check('props head: the title for tonight, the slate league by league with the league that plays soonest first, when lines were read and when they are read next', (await text(a, '#props-title')) === 'Tonight’s props, likeliest first' && (await text(a, '#props-slate')) === 'NBA tonight: 2 games. NFL tomorrow: 1 game.' && upd.length === 2 && upd[0] === 'Lines read 1:00 PM ET (4 hr ago)' && upd[1] === 'Next read tomorrow about 9:00 AM ET', (await text(a, '#props-slate')) + ' / ' + upd.join(' | '));
  check('props: the rule under the title, the how-to and the explanation all say the grade is game data only, never other books’ prices', /Graded on game data only, never against other books’ prices/.test(await text(a, '#props-rule')) && /from game data only/.test(await text(a, '#props-how')) && /No book’s price takes part in the probability, the side or the rank/.test(await text(a, '#how')) && !/placeholder|replace with your own|edit these/i.test(await a.$eval('main', n => n.innerText)));
  const tabs = await a.$$eval('#p-leagues a', els => els.map(e => ({ lg: e.dataset.league, n: (e.querySelector('.seg-count') || {}).textContent || null, on: e.getAttribute('aria-current') === 'true' })));
  check('props tabs: NFL then NBA, each with its count on the board; the default is the league that plays soonest', tabs.map(t => t.lg).join() === 'NFL,NBA' && tabs[0].n === '9' && tabs[1].n === '5' && tabs[1].on && !tabs[0].on, JSON.stringify(tabs));
  const rows = await rowsOf(a), want = board(D, 'NBA', FIXTURE_NOW);
  check('props board: the rows are js/props-grade.js’s best side for each player, in its order (game day, then our probability)', want.length === 5 && same(rows, want), rows.map(r => r.id + ':' + r.side + r.line + r.stat + '@' + r.prob).join(' '));
  check('props board: rank chips number the board in order, #1 marked on top', rows.every((r, i) => r.rank === i + 1) && (await a.$$eval('#props-board tr.pr .rank', els => els.map(e => e.textContent).join())) === '#1,#2,#3,#4,#5' && (await a.locator('#props-board tr.pr').first().locator('.rank.rank-top').count()) === 1 && (await a.locator('#props-board .rank-top').count()) === 1);
  const first = await a.locator('#props-board tr.pr').first().evaluate(tr => {
    const t = s => { const n = tr.querySelector(s); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
    return { cells: tr.children.length, face: tr.querySelectorAll('.pr-face').length, name: t('a.pr-open'), sub: Array.from(tr.querySelectorAll('.pr-sub > span')).map(n => n.textContent).join(' | '), match: t('.pr-match'), start: t('.pr-start'), stat: t('.pr-stat'), line: t('.pr-line'), side: t('.pr-side'), prob: t('.pr-prob'), bar: tr.querySelectorAll('.pr-hit .prob-bar .prob-fill').length, tier: t('.pr-hit .badge'), l5: t('.pr-l5'), l10: t('.pr-l10'), odds: t('.pr-best .mono'), book: t('.pr-best .pr-book'), bookName: tr.querySelector('.pr-best .pr-book').title, label: tr.querySelector('a.pr-open').getAttribute('aria-label'), popup: tr.querySelector('a.pr-open').getAttribute('aria-haspopup') };
  });
  const top = want[0];
  check('props board: a row carries the rank, the face, the name with position and team, the matchup and start, the stat and line, the lean, To hit with its bar and tier, L5 and L10, the best price and its book', first.cells === 9 && first.face === 1 && first.name === 'N. Alexander-Walker' && first.sub === 'G | ATL' && first.match === 'ATL @ WSH' && first.start === 'Today 7:00 PM ET' && first.stat === 'Assists' && first.line === '3.5' && first.side === 'Under' && first.prob === (top.prob * 100).toFixed(1) + '%' && first.bar === 1 && first.tier === 'Medium' && first.l5 === top.hit.l5.join('/') && first.l10 === top.hit.l10.join('/') && first.odds === '-110' && first.book === 'DK' && first.bookName === top.book && /^Nickeil Alexander-Walker, under 3\.5 assists, to hit [\d.]+%\./.test(first.label) && first.popup === 'dialog', JSON.stringify(first));
  check('props board: every start label is EdgeLine.startLabel on the site’s clock, never the file’s own label', await a.evaluate(() => { const E = window.EdgeLine, G = window.EdgeLineProps, ctx = G.context(window.PROPS_DATA); return Array.from(document.querySelectorAll('#props-board tr.pr')).every(tr => { const p = window.PROPS_DATA.players.find(x => String(x.id) === tr.dataset.player); return tr.querySelector('.pr-start').textContent === E.startLabel({ commence: G.startOf(p, ctx) }); }); }));
  check('props board: the lowest tier reads Low, never Lean (the selections are leans; owner decision 2026-11-08)', await a.$$eval('#props-board .pr-hit .badge', els => els.some(e => e.textContent === 'Low') && els.some(e => e.textContent === 'Coin flip') && !els.some(e => e.textContent === 'Lean')));
  check('props board: the summary counts the props and names the scope; the sample badge shows on sample data', (await text(a, '#pb-summary')) === '5 NBA props, each player’s likeliest stat.' && (await shown(a, '[data-sample-flag="props"]')) === 1, await text(a, '#pb-summary'));
  check('props: the strip links every section on the page, in page order', (await strip(a)) === '#board #record #no-line #played #how' && (await a.$$eval('.subnav a', els => els.every(l => l.hidden || !!document.querySelector(l.getAttribute('href'))))), await strip(a));

  /* ---------- filters, each written into the address ---------- */
  await a.click('#p-games [data-game="' + ATL_WSH + '"]'); await a.waitForTimeout(120);
  let r = await rowsOf(a), q = params(a);
  check('props filters: a game chip keeps that game’s props, renumbers the ranks from 1 and lands in the address', r.length === 3 && r.every(x => x.game === 'ATL @ WSH') && r.map(x => x.rank).join() === '1,2,3' && same(r, board(D, 'NBA', FIXTURE_NOW).filter(s => s.p.gameId === ATL_WSH)) && q.league === 'NBA' && q.game === ATL_WSH && (await a.getAttribute('#p-games [data-game="' + ATL_WSH + '"]', 'aria-pressed')) === 'true' && (await text(a, '#p-games [data-game="' + ATL_WSH + '"]')) === 'ATL @ WSH 7:00 PM', JSON.stringify(q));
  await a.click('#p-games [data-game=""]'); await a.click('#p-stats [data-stat="pts"]'); await a.waitForTimeout(120);
  r = await rowsOf(a); q = params(a);
  check('props filters: a stat tab ranks every player on that stat and lands in the address', r.length === 5 && r.every(x => x.stat === 'pts') && same(r, board(D, 'NBA', FIXTURE_NOW, { stat: 'pts' })) && q.stat === 'pts' && !q.game && (await text(a, '#pb-summary')) === '5 NBA props, points.' && (await a.$$eval('#props-board .pr-stat', els => els.every(e => e.textContent === 'Points'))), await text(a, '#pb-summary'));
  await a.selectOption('#p-side', 'under'); await a.waitForTimeout(120);
  r = await rowsOf(a); q = params(a);
  check('props filters: the Side filter keeps only that side and lands in the address', r.length >= 1 && r.length < 5 && r.every(x => x.side === 'under') && r.map(x => x.rank).join() === r.map((x, i) => i + 1).join() && q.side === 'under' && /unders only\.$/.test(await text(a, '#pb-summary')), await text(a, '#pb-summary'));
  await a.selectOption('#p-side', ''); await a.click('#p-stats [data-stat=""]'); await a.fill('#p-search', 'George'); await a.waitForTimeout(120);
  r = await rowsOf(a); q = params(a);
  check('props filters: the search narrows the board without renumbering it, and lands in the address', r.length === 1 && r[0].id === GEORGE && r[0].rank === 2 && q.q === 'George' && (await text(a, '#pb-summary')) === '1 of 5 NBA props, each player’s likeliest stat.' && (await shown(a, '#no-line')) === 0 && (await shown(a, '#played')) === 0, await text(a, '#pb-summary'));
  await a.fill('#p-search', 'Lawrence'); await a.waitForTimeout(120);
  check('props filters: a search that matches only in the other league says so and offers the way over', (await rowsOf(a)).length === 0 && /“Lawrence” matches 1 player in the NFL/.test(await a.textContent('#props-board')) && (await a.locator('#props-board [data-switch="NFL"]').count()) === 1);
  await a.click('#props-board [data-switch="NFL"]'); await a.waitForTimeout(120);
  r = await rowsOf(a);
  check('props filters: taking it switches the league and keeps the search', r.length === 1 && r[0].league === 'NFL' && params(a).league === 'NFL' && params(a).q === 'Lawrence');
  await a.fill('#p-search', 'zzzz'); await a.waitForTimeout(120);
  check('props filters: a search with no match says so, with a way back', (await rowsOf(a)).length === 0 && /No prop on this board matches “zzzz”/.test(await a.textContent('#props-board')) && (await a.locator('#pb-clear').count()) === 1);
  await a.click('#pb-clear'); await a.waitForTimeout(120);
  r = await rowsOf(a);
  check('props filters: clearing them restores the league’s whole board', r.length === 9 && (await a.inputValue('#p-search')) === '' && !params(a).q && same(r, board(D, 'NFL', FIXTURE_NOW)));
  check('props NFL: the tab keeps NFL props only, under its own stat tabs', r.every(x => x.league === 'NFL') && (await a.$$eval('#p-stats button', els => els.map(e => e.textContent).join())) === 'All stats,Pass yards,Pass TDs,Rush yards,Rec yards,Receptions' && (await text(a, '#props-board tr.pr .pr-start')) === 'Tomorrow 8:15 PM ET' && (await shown(a, '#p-games')) === 0);
  await a.click('#p-stats [data-stat="passYds"]'); await a.waitForTimeout(120);
  r = await rowsOf(a);
  check('props NFL: a passing-yards board lists the two quarterbacks only', r.length === 2 && r.every(x => x.stat === 'passYds') && params(a).stat === 'passYds');
  await a.click('#p-leagues [data-league="NBA"]'); await a.waitForTimeout(120);
  r = await rowsOf(a); q = params(a);
  check('props tabs: switching league clears the other league’s stat and game and lands in the address', r.length === 5 && r.every(x => x.league === 'NBA') && q.league === 'NBA' && !q.stat && !q.game && (await a.getAttribute('#p-stats [data-stat=""]', 'aria-pressed')) === 'true');
  await a.selectOption('#p-sort', 'form'); await a.waitForTimeout(120);
  r = await rowsOf(a);
  const l10 = await a.$$eval('#props-board tr.pr .pr-l10', els => els.map(e => { const p = e.textContent.split('/'); return Number(p[0]) / Number(p[1]); }));
  check('props filters: another order is opt-in: by hit rate the rows reorder and each keeps its likeliest-first rank', l10.every((v, i) => i === 0 || v <= l10[i - 1] + 1e-9) && r.map(x => x.rank).join() !== '1,2,3,4,5' && r.map(x => x.rank).sort().join() === '1,2,3,4,5' && params(a).sort === 'form' && /by hit rate over the last ten\.$/.test(await text(a, '#pb-summary')), r.map(x => x.rank).join());
  await a.close();

  const b = await open('league=NFL&stat=recYds&side=under');
  r = await rowsOf(b);
  check('props address: a shared view opens as it was: the league, the stat and the side', r.length === 4 && r.every(x => x.league === 'NFL' && x.stat === 'recYds' && x.side === 'under') && (await b.inputValue('#p-side')) === 'under' && (await b.getAttribute('#p-stats [data-stat="recYds"]', 'aria-pressed')) === 'true' && (await b.getAttribute('#p-leagues [data-league="NFL"]', 'aria-current')) === 'true' && (await text(b, '#pb-summary')) === '4 NFL props, receiving yards, unders only.', await text(b, '#pb-summary'));
  await b.close();
  const b2 = await open('game=' + JAX_BAL);
  const b3 = await open('stat=recYds');
  check('props address: a link that names only a game, or only a stat, still lands on its league', (await rowsOf(b2)).every(x => x.league === 'NFL') && (await b2.getAttribute('#p-games [data-game="' + JAX_BAL + '"]', 'aria-pressed')) === 'true' && (await rowsOf(b3)).every(x => x.league === 'NFL' && x.stat === 'recYds') && (await rowsOf(b3)).length > 0);
  await b2.close(); await b3.close();

  /* ---------- the two deep links ---------- */
  const c = await open('q=Paul%20George');
  r = await rowsOf(c);
  check('props deep link: ?q=<name> (the site search and the game page) opens with the search filled in and the player’s row', (await c.inputValue('#p-search')) === 'Paul George' && r.length === 1 && r[0].id === GEORGE && (await c.getAttribute('#p-leagues [data-league="NBA"]', 'aria-current')) === 'true' && (await dialog(c)) === null);
  await c.close();
  const c2 = await open('q=Lawrence');
  check('props deep link: ?q= lands on the league that has the player', (await rowsOf(c2)).length === 1 && (await rowsOf(c2))[0].league === 'NFL' && (await c2.getAttribute('#p-leagues [data-league="NFL"]', 'aria-current')) === 'true');
  await c2.close();
  const c3 = await open('q=Kingston');
  check('props deep link: ?q= for a player with no line says where he is and opens that list on him', (await rowsOf(c3)).length === 0 && /No prop on this board matches “Kingston”\. 1 player under No line yet does\./.test(await c3.textContent('#props-board')) && (await c3.$eval('#no-line', n => n.open)) && (await c3.$$eval('#nl-list li', els => els.length === 1 && /^Kingston Flemings/.test(els[0].textContent))));
  await c3.close();

  /* ---------- the detail ---------- */
  const d = await open('p=' + GEORGE + '&stat=pts');
  const pg = D.players.find(p => String(p.id) === GEORGE), ctxD = G.context(D), pgSide = G.sideFor(pg, 'pts', 19.5, ctxD), pgVals = pg.log.map(x => x.pts);
  let dd = await dialog(d);
  check('props deep link: ?p=<player>&stat=<key> opens that player’s detail on that stat, at its posted line, with the board behind it', !!dd && dd.name === 'Paul George' && dd.stat === 'pts' && dd.line === '19.5' && (await rowsOf(d)).length === 5 && params(d).p === GEORGE && params(d).stat === 'pts' && dd.focusIn, JSON.stringify(dd && { name: dd.name, stat: dd.stat, line: dd.line }));
  check('props detail: the head names the player, his matchup and start; a chip per stat carries its posted line', dd.meta.indexOf('BOS vs MIL') !== -1 && dd.meta.indexOf('Today 7:30 PM ET') !== -1 && dd.chips.join() === 'PTS 19.5*,REB 5.5,AST 3.5,3PM 2.5,PRA 28.5' && dd.rank === null, dd.meta + ' / ' + dd.chips.join());
  check('props detail: the chart has a bar a game, the line drawn across and labelled, green over it and red under', dd.bars === pgVals.length && dd.over === pgVals.filter(v => v > 19.5).length && dd.under === pgVals.filter(v => v < 19.5).length && dd.neutral === 0 && dd.lineLabel === '19.5' && dd.avgLine === 0 && dd.head === 'Points, last 6 games' && (await d.getAttribute('#pd svg.hist', 'aria-label')).indexOf('against a line of 19.5') !== -1, JSON.stringify({ bars: dd.bars, over: dd.over, under: dd.under, head: dd.head }));
  const lean = dd.sides.find(s => s.lean), other = dd.sides.find(s => !s.lean);
  check('props detail: both sides are graded by the shared module; the lean is marked with its tier and the two add up', dd.sides.length === 2 && lean.side === pgSide.side && dd.side === pgSide.side && dd.prob === pgSide.prob.toFixed(4) && lean.prob === (pgSide.prob * 100).toFixed(1) + '%' && other.prob === ((1 - pgSide.prob) * 100).toFixed(1) + '%' && lean.badge === 'Coin flip' && other.badge === null, JSON.stringify(dd.sides.map(s => s.side + ' ' + s.prob + ' ' + s.badge)));
  const dec = o => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);
  const priceOk = s => { const books = pg.lines.pts[s.side].books, odds = s.prices.map(t => Number(t.replace(/^[A-Z0-9]+/, '').replace('+', ''))); return s.prices.length === Object.keys(books).length && s.best === 1 && odds.every((o, i) => i === 0 || dec(o) <= dec(odds[i - 1]) + 1e-9) && Math.max.apply(null, Object.values(books).map(dec)) === dec(odds[0]); };
  check('props detail: every book’s price on each side, best first, the best marked', dd.sides.every(priceOk) && dd.sides[0].prices.length === 8 && /takes no part in the grade/.test(dd.rule), dd.sides.map(s => s.prices.join(' ')).join(' / '));
  const others = (pg.signals || []).filter(s => ['reb', 'ast', 'threes'].indexOf(s.key) !== -1).map(s => s.label);
  check('props detail: one Why list: the history against the number first, the projection, his own trend merged in, caveats after as “But:”, each fact once', /^Stayed under 19\.5 in \d of the last 6 \(\d of the last 5\)$/.test(dd.why[0]) && dd.why.some(t => /^Projects [\d.]+ points$/.test(t)) && dd.why.indexOf('Points down 17% last 5') !== -1 && others.length > 0 && others.every(l => dd.why.indexOf(l) === -1) && new Set(dd.why).size === dd.why.length && dd.why.findIndex(t => /^But: /.test(t)) > dd.why.map(t => /^But: /.test(t)).lastIndexOf(false) && dd.whyHead === 'Why under 19.5 points', dd.why.join(' | '));
  check('props detail: a caveat keeps a club’s abbreviation in capitals and prose keeps its typographic apostrophe', dd.why.indexOf('But: MIL allows 105 a game, 3rd most') !== -1 && dd.why.indexOf('But: 4 days’ rest') !== -1 && dd.why.every(t => t.indexOf("'") === -1), dd.why.join(' | '));
  check('props detail: the matchup is said once: as a reason when it leans the grade, else as its own sentence', dd.why.filter(t => /allows/.test(t)).length + (dd.opp ? 1 : 0) === 1, String(dd.opp));
  check('props detail: the game log lists his games with the box-score columns', dd.logRows === pg.log.length && /Date.*Opp.*W\/L.*Min.*Pts.*Reb.*Ast.*3PM/.test(dd.logHead));
  check('props detail: where the data does not say home or away (the sample’s NBA logs carry no home game) the chart and the log say neither', dd.opps.every(t => t.charAt(0) !== '@') && !/Home or away/.test(dd.logHead) && !/At home|On the road/.test(await text(d, '.pd-cap')), dd.opps.join(' '));
  await d.click('#pd .pd-spans [data-span="5"]'); await d.waitForTimeout(80);
  dd = await dialog(d);
  check('props detail: Last 5 shows five bars and says so', dd.bars === 5 && dd.head === 'Points, last 5 games' && (await d.getAttribute('#pd .pd-spans [data-span="5"]', 'aria-pressed')) === 'true');
  await d.click('#pd .pd-spans [data-span="10"]'); await d.fill('#pd-line', '-0.5'); await d.waitForTimeout(80);
  dd = await dialog(d);
  check('props detail: a typed line regrades everything from the game data: below zero every game clears it, the over is High, and prices stay with the posted line', dd.side === 'over' && dd.tier === 'High' && dd.over === 6 && dd.under === 0 && dd.lineLabel === '-0.5' && /^Cleared -0\.5 in 6 of the last 6/.test(dd.why[0]) && dd.sides.every(s => s.prices.length === 0) && dd.note === 'Prices are quoted at the posted line, 19.5. At -0.5 only the grade changes.' && dd.reset === 'Posted line 19.5' && dd.whyHead === 'Why over -0.5 points', JSON.stringify({ side: dd.side, tier: dd.tier, note: dd.note, reset: dd.reset }));
  await d.click('#pd-reset'); await d.waitForTimeout(80);
  dd = await dialog(d);
  check('props detail: the reset puts the posted line back, hides itself and brings the prices back', dd.line === '19.5' && dd.reset === null && dd.sides.every(s => s.prices.length === 8) && dd.note === null && dd.side === pgSide.side);
  await d.fill('#pd-line', '22.5'); await d.waitForTimeout(80);
  await d.click('#pd .pd-stats [data-stat="reb"]'); await d.waitForTimeout(80);
  dd = await dialog(d);
  check('props detail: a stat chip switches the chart, the line and the address to that stat', dd.stat === 'reb' && dd.head === 'Rebounds, last 6 games' && dd.line === '5.5' && dd.chips.indexOf('REB 5.5*') !== -1 && params(d).stat === 'reb' && params(d).p === GEORGE);
  await d.keyboard.press('Escape'); await d.waitForTimeout(120);
  check('props detail: Esc closes it, the address drops the player, and on a page that opened straight on the detail focus goes to his row', (await dialog(d)) === null && !params(d).p && !params(d).stat && (await d.evaluate(() => document.activeElement.matches('a.pr-open') && document.activeElement.dataset.open)) === GEORGE);
  await d.reload(); await d.waitForSelector('#props-board tr.pr'); await d.waitForTimeout(200);
  await d.click('#props-board tr.pr[data-player="' + GEORGE + '"] .pr-prob'); await d.waitForTimeout(150);
  dd = await dialog(d);
  const opened = dd && { stat: dd.stat, line: dd.line, rank: dd.rank };
  await d.click('#pd .pd-stats [data-stat="pts"]'); await d.waitForTimeout(80);
  dd = await dialog(d);
  check('props detail: a click anywhere on a row opens it on the stat the board ranked, with its rank; a typed line is kept on the device for that stat only', !!opened && opened.stat === 'ast' && opened.line === '3.5' && opened.rank === '#2' && dd.line === '22.5' && dd.reset === 'Posted line 19.5' && (await d.evaluate(id => localStorage.getItem('prop-line:' + id + ':pts'), GEORGE)) !== null, JSON.stringify(opened) + ' ' + dd.line);
  await d.click('#pd-reset'); await d.waitForTimeout(80);
  check('props detail: resetting forgets the typed line', (await d.evaluate(id => localStorage.getItem('prop-line:' + id + ':pts'), GEORGE)) === null && (await dialog(d)).line === '19.5');
  await d.close();

  const e = await open('p=' + BRISSETT + '&stat=passYds');
  dd = await dialog(e);
  check('props NFL detail: his position’s stats, the pipeline’s projection named with his usage, and a log with the week and the passer’s columns', dd.chips.join() === 'PASS YDS 235.5*,PASS TD 1.5' && dd.why.some(t => /^Projects 260\.8 passing yards: 37\.8 attempts a game at 5\.7 yards an attempt/.test(t)) && /Wk.*Opp.*W\/L.*C\/Att.*Pass yds.*TD.*Int.*Rush yds/.test(dd.logHead) && dd.meta.indexOf('38.1 attempts a game') !== -1 && dd.head === 'Passing yards, last 8 games', dd.chips.join() + ' / ' + dd.logHead);
  check('props NFL detail: where the log knows it, road games are marked on the chart and the log has a home-or-away column', dd.opps.some(t => t.charAt(0) === '@') && dd.opps.some(t => t.charAt(0) !== '@') && /Home or away/.test(dd.logHead) && /At home 219\.7/.test(await text(e, '.pd-cap')), dd.opps.join(' '));
  await e.close();

  const f = await open('p=' + FLEMINGS);
  dd = await dialog(f);
  const bare = dd && { line: dd.line, note: dd.note, neutral: dd.neutral, bars: dd.bars, avg: dd.avgLine, sides: dd.sides.length };
  await f.fill('#pd-line', '12.5'); await f.waitForTimeout(80);
  dd = await dialog(f);
  check('props detail: a player with no line opens on an empty line box with neutral bars; a typed number grades it from his games and says no book has a line', !!bare && bare.line === '' && bare.note === 'Type a line and both sides are graded from his games.' && bare.neutral === bare.bars && bare.bars > 0 && bare.avg === 1 && bare.sides === 0 && dd.sides.length === 2 && !!dd.side && dd.neutral === 0 && dd.note === 'No book line yet: this is graded at the number you typed.' && dd.sides.every(s => s.prices.length === 0), JSON.stringify(bare) + ' ' + dd.note);
  await f.close();

  /* ---------- keyboard ---------- */
  const k = await open('');
  await k.focus('#p-search'); await k.keyboard.press('Tab');
  const tabTo = await k.evaluate(() => { const n = document.activeElement; return n.matches('a.pr-open') ? n.closest('tr').dataset.rank : n.tagName; });
  await k.keyboard.press('Enter'); await k.waitForTimeout(150);
  dd = await dialog(k);
  const viaEnter = !!dd && dd.focusIn && dd.name === 'Nickeil Alexander-Walker';
  await k.keyboard.press('Escape'); await k.waitForTimeout(150);
  const back = await k.evaluate(() => { const n = document.activeElement; return n.matches('a.pr-open') ? n.closest('tr').dataset.rank : n.tagName; });
  check('props keyboard: Tab reaches the first row from the controls, Enter opens its detail with focus inside, Esc closes it and focus returns to that row', tabTo === '1' && viaEnter && (await dialog(k)) === null && back === '1', tabTo + ' ' + viaEnter + ' ' + back);
  await k.keyboard.press('Tab'); await k.keyboard.press(' '); await k.waitForTimeout(150);
  dd = await dialog(k);
  const viaSpace = !!dd && dd.name === 'Paul George';
  await k.click('#pd [data-pd-close]'); await k.waitForTimeout(150);
  check('props keyboard: Space opens a row like a button, and Close hands focus back to it', viaSpace && (await dialog(k)) === null && (await k.evaluate(() => document.activeElement.matches('a.pr-open') && document.activeElement.closest('tr').dataset.rank)) === '2');
  await k.focus('#props-board tr.pr[data-rank="3"] a.pr-open'); await k.keyboard.press('Enter'); await k.waitForTimeout(150);
  const third = await k.$eval('#props-board tr.pr[data-rank="3"]', tr => tr.dataset.player);
  await k.evaluate(() => { const old = document.querySelector('#props-board tr.pr[data-rank="3"] a.pr-open'); window.EdgeLinePropsPage.render(); window.__redrawn = !old.isConnected; });
  await k.keyboard.press('Escape'); await k.waitForTimeout(150);
  check('props keyboard: if the board was redrawn while the detail was open, focus still returns to that player’s row', (await k.evaluate(() => window.__redrawn)) === true && (await k.evaluate(() => document.activeElement.matches('a.pr-open') && document.activeElement.dataset.open)) === third);
  await k.close();

  /* ---------- a game starts ---------- */
  const s = await open('', { at: STARTED });
  r = await rowsOf(s);
  /* a results row, part by part: its chips, the prop, the meta line's parts, the outcome */
  const played = (page, sel) => page.$$eval(sel, els => els.map(n => ({ id: n.dataset.player, result: n.dataset.result, state: n.dataset.state, chip: (n.querySelector('.badge-state') || {}).textContent, rank: (n.querySelector('.rank') || {}).textContent || null, pick: n.querySelector('.played-pick strong').textContent, meta: Array.from(n.querySelectorAll('.played-pick .meta > span')).map(o => o.textContent).join(' | '), out: n.querySelector('.played-result').textContent.trim(), detail: n.querySelectorAll('a[data-open]').length, all: n.textContent, day: n.previousElementSibling && n.previousElementSibling.classList.contains('day-divider') ? n.previousElementSibling.textContent : null })));
  const live = await played(s, '#played-host .played[data-state="live"]');
  check('props started: a game that has started leaves the board, the rest renumber from 1, and its chip and the tab count say so', r.length === 2 && r.every(x => x.game === 'MIL @ BOS') && r.map(x => x.rank).join() === '1,2' && same(r, board(D, 'NBA', STARTED)) && (await text(s, '#p-games [data-game="' + ATL_WSH + '"]')) === 'ATL @ WSH Live' && (await s.$eval('#p-games [data-game="' + ATL_WSH + '"]', n => n.classList.contains('is-started'))) && (await text(s, '#p-leagues [data-league="NBA"] .seg-count')) === '2' && (await text(s, '#props-slate')) === 'NBA tonight: 2 games, 1 started. NFL tomorrow: 1 game.', await text(s, '#props-slate'));
  check('props started: its props land under In progress and results as the board ranked them, Live, with no price and no rank they no longer hold', live.length === 3 && live.every(x => x.chip === 'Live' && x.rank === null && x.out === 'In progress' && !/[+-]\d{3}/.test(x.all)) && live[0].id === WALKER && live[0].pick === 'Nickeil Alexander-Walker: under 3.5 assists' && live[0].meta === 'ATL @ WSH | To hit 64.1% as ranked | Medium | Started 7:00 PM ET' && /^3 live, /.test(await text(s, '#pl-summary')), live.map(x => x.pick + ' [' + x.meta + '] ' + x.out).join(' || '));
  await s.click('#played-host .played[data-player="' + WALKER + '"] a[data-open]'); await s.waitForTimeout(150);
  dd = await dialog(s);
  check('props started: its detail says lines closed at the start, shows no price and offers nothing to bet', !!dd && dd.note === 'Lines closed at the start. This is the prop as the board ranked it.' && dd.sides.length === 2 && dd.sides.every(x => x.prices.length === 0) && dd.state === 'Live' && dd.rank === null, dd && dd.note);
  await s.close();
  const t = await open('', { at: Date.parse('2026-11-04T18:59:00-05:00') });
  const before = (await rowsOf(t)).length;
  await t.evaluate(at => { window.EDGELINE_NOW = at; window.EdgeLinePropsPage.tick(); }, STARTED); await t.waitForTimeout(120);
  check('props started: the page follows the clock without a reload', before === 5 && (await rowsOf(t)).length === 2 && (await t.locator('#played-host .played[data-state="live"]').count()) === 3 && (await text(t, '#p-leagues [data-league="NBA"] .seg-count')) === '2');
  await t.close();
  const u = await open('league=NBA', { at: NEXT_MORNING });
  check('props started: with every game of the league started the board says so and points at the results; nothing is offered as bettable', (await rowsOf(u)).length === 0 && /Every NBA game on this slate has started, so nothing is left to bet\./.test(await u.textContent('#props-board')) && (await u.locator('#props-board .props-empty a[href="#played"]').count()) === 1 && (await strip(u)) === '#board #record #played #how' && (await text(u, '#p-leagues [data-league="NBA"] .browse-next')) === 'started' && (await text(u, '#props-title')) === 'Today’s props, likeliest first' && /^5 awaiting a result, 2 won, 2 lost, 1 void$/.test(await text(u, '#pl-summary')), await text(u, '#pl-summary'));
  await u.close();

  /* ---------- results and the record (PROPS_DATA.results) ---------- */
  const R = D.results, v = await open('');
  const rec = await v.evaluate(() => { const box = document.getElementById('record'); return { on: !box.hidden, h: box.querySelector('h2').textContent, lead: Array.from(box.querySelectorAll('.props-rec-lead > span')).map(n => n.textContent), tiers: Array.from(box.querySelectorAll('tbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent)), how: box.querySelector('.how-to').textContent }; });
  check('props record: the last slate of the league, the run since the first graded day and each league, with hit rates', rec.on && rec.h === 'Record' && rec.lead.join(' | ') === 'Last NBA slate, yesterday: 2-2 (50.0%) | Since Wed Oct 28: 22-17-1 (56.4%) | NFL 5-3-1 (62.5%) | NBA 17-14 (54.8%)' && /graded from the box score at its posted line, through 3:10 AM ET\. No price takes part\./.test(rec.how) && R.record.w === 22 && R.byLeague.NBA.l === 14, rec.lead.join(' | '));
  check('props record: every tier against what it claims, the lowest read as Low', JSON.stringify(rec.tiers) === JSON.stringify([['High', '5-1', '83.3%', '70% or better'], ['Medium', '8-5', '61.5%', '62% to 70%'], ['Low', '6-6-1', '50.0%', '56% to 62%'], ['Coin flip', '3-5', '37.5%', 'Under 56%']]), JSON.stringify(rec.tiers));
  const res = await played(v, '#played-host .played');
  const nbaRecent = R.recent.filter(x => x.league === 'NBA');
  check('props results: the league’s graded props, in rank order, each with its result, what he finished with and how it was ranked; a player who sat is void', res.length === nbaRecent.length && res.every((x, i) => x.id === String(nbaRecent[i].playerId) && x.result === nbaRecent[i].result && x.rank === '#' + nbaRecent[i].rank && x.detail === 0) && res.map(x => x.chip).join() === 'Won,Won,Lost,Lost,Void' && res[0].pick === 'Nickeil Alexander-Walker: over 19.5 points' && res[0].meta === 'ATL @ IND | To hit 71.2% as ranked | High' && res[0].out === 'Finished with 34' && res[3].meta === 'ATL @ IND | To hit 57.8% as ranked | Low' && res[4].out === 'No action: he did not play' && res.every(x => !/[+-]\d{3}/.test(x.all)) && (await text(v, '#pl-summary')) === '2 won, 2 lost, 1 void' && /graded from the box score at its posted line, never from a price/.test(await text(v, '#pl-how')), JSON.stringify(res.map(x => x.chip + ' ' + x.pick + ' [' + x.meta + '] ' + x.out)));
  await v.click('#p-leagues [data-league="NFL"]'); await v.waitForTimeout(120);
  const capped = await v.$$eval('#played-host .played', els => els.length), moreText = await text(v, '#pl-more');
  await v.click('#pl-more'); await v.waitForTimeout(100);
  check('props results: each league shows its own last slate and results, a push among them; the list shows five and offers the rest, while its summary counts them all', (await v.$eval('#record .props-rec-lead > span', n => n.textContent)) === 'Last NFL slate, Sun Nov 1: 4-1-1 (80.0%)' && (await text(v, '#pl-summary')) === '4 won, 1 lost, 1 push' && capped === 5 && moreText === 'Show all 6' && (await v.locator('#pl-more').count()) === 0 && (await v.$$eval('#played-host .played', els => els.length === 6 && els.some(n => n.dataset.result === 'Push' && /Derrick Henry: under 53 rushing yards/.test(n.textContent) && /Finished with 53/.test(n.textContent)))), capped + ' ' + moreText);
  await v.close();
  const graded = sample();
  graded.players.filter(p => p.gameId === ATL_WSH && p.lines).forEach((p, i) => graded.results.recent.unshift({ league: 'NBA', date: '2026-11-04', gameId: p.gameId, playerId: p.id, name: p.name, teamAbbr: p.teamAbbr, oppAbbr: p.oppAbbr, home: p.home, stat: 'pts', side: 'over', line: 9.5, prob: 0.6, grade: 'Lean', rank: i + 1, actual: 12 + i, result: i === 1 ? 'Loss' : 'Win' }));
  const w = await open('league=NBA', { at: NEXT_MORNING, data: graded });
  await w.click('#pl-more'); await w.waitForTimeout(100);
  const mine = await played(w, '#played-host .played');
  check('props results: once a game still in the file is graded its results replace the as-ranked rows (never both), newest day first under day headings, with the way into the detail', mine.filter(x => x.id === WALKER).length === 2 && mine.filter(x => x.id === WALKER).every(x => x.result !== '') && mine.filter(x => x.id === GEORGE).length === 1 && mine.find(x => x.id === GEORGE).state === 'awaiting' && mine.filter(x => x.result && x.detail === 1).length === 3 && (await w.$$eval('#played-host .day-divider', els => els.map(n => n.textContent).join(' | '))) === 'Wednesday Nov 4 | Tuesday Nov 3' && mine[0].day === 'Wednesday Nov 4' && (await text(w, '#pl-summary')) === '2 awaiting a result, 4 won, 3 lost, 1 void', JSON.stringify(mine.map(x => x.id + ':' + (x.result || x.state))));
  await w.close();

  /* ---------- without results and without the stat lists (the file as the pipeline writes it today) ---------- */
  const plain = sample(); delete plain.results; delete plain.leagues.NBA.stats; delete plain.leagues.NFL.stats;
  const x = await open('', { data: plain });
  r = await rowsOf(x);
  check('props without results: no record and no results section, nor their strip links, rather than empty boxes; the board is unchanged', same(r, want) && (await x.$eval('#record', n => n.hidden && n.children.length === 0)) && (await x.$eval('#played', n => n.hidden)) && (await x.$eval('#played-host', n => n.hidden && n.children.length === 0)) && (await strip(x)) === '#board #no-line #how', await strip(x));
  check('props without stat lists: the built-in names stand for both leagues', (await x.$$eval('#p-stats button', els => els.map(n => n.textContent).join())) === 'All stats,Points,Rebounds,Assists,Threes,PRA' && (await x.$$eval('#props-board .pr-stat', els => els.map(n => n.textContent).join())) === 'Assists,Assists,Points,Threes,Points');
  await x.close();
  const x2 = await open('', { data: plain, at: STARTED });
  check('props without results: a started game still shows its props as ranked, and one line says props are not graded yet', (await x2.locator('#played-host .played[data-state="live"]').count()) === 3 && /Props are not graded after the game yet, so there is no result or record here so far\./.test(await text(x2, '#pl-how')) && (await text(x2, '#pl-summary')) === '3 live' && (await strip(x2)) === '#board #played #how' && (await x2.$eval('#record', n => n.hidden)));
  await x2.close();
  const x3 = await open('league=NBA', { data: plain, at: NEXT_MORNING });
  check('props without results: a finished game reads “not graded”, never “awaiting a result” that will not come', (await text(x3, '#pl-summary')) === '5 finished, not graded' && (await x3.$$eval('#played-host .played .played-note', els => els.length === 5 && els.every(n => n.textContent === 'Not graded yet'))));
  await x3.close();

  /* ---------- the stat lists (PROPS_DATA.leagues.<league>.stats) and a stat the page has never seen ---------- */
  const stl = sample();
  stl.leagues.NBA.stats[0].label = 'Points scored';
  stl.leagues.NBA.stats.push({ key: 'stl', label: 'Steals', short: 'STL' });
  const pg2 = stl.players.find(p => String(p.id) === GEORGE);
  pg2.log.forEach((row, i) => { row.stl = [2, 1, 3, 0, 2, 1][i % 6]; });
  pg2.stats.stl = { season: 1.5, l5: 1.6, l10: 1.5, home: 0, away: 1.5, sd: 1, last: [2, 1, 3, 0, 2, 1] };
  pg2.lines.stl = { line: 1.5, fairLine: 1.5, openLine: 1.5, over: { fair: 0.5, odds: 110, book: 'FanDuel', n: 2, books: { FanDuel: 110, DraftKings: 105 } }, under: { fair: 0.5, odds: -130, book: 'DraftKings', n: 2, books: { FanDuel: -135, DraftKings: -130 } } };
  delete stl.leagues.NFL.stats;
  const qb = stl.players.find(p => String(p.id) === BRISSETT);
  qb.keys.push('passAtt'); qb.stats.passAtt = { season: 34.2, l5: 33, l10: 34.2, home: 35, away: 33.5, sd: 6 };
  qb.proj.passAtt = { mean: 35.5, dist: 'poisson', why: '35.5 attempts a game as the starter', reasons: [] };
  qb.lines.passAtt = { line: 33.5, fairLine: 33.5, openLine: 33.5, over: { fair: 0.5, odds: -115, book: 'FanDuel', n: 1, books: { FanDuel: -115 } }, under: { fair: 0.5, odds: -105, book: 'DraftKings', n: 1, books: { DraftKings: -105 } } };
  const y = await open('stat=stl', { data: stl });
  r = await rowsOf(y);
  await y.click('#props-board a.pr-open'); await y.waitForTimeout(150);
  dd = await dialog(y);
  check('props stat lists: a stat the data names and the page has never seen gets a tab, a row and, in the detail, a chart, a chip and a log column', (await y.$$eval('#p-stats button', els => els.map(n => n.textContent).join())) === 'All stats,Pts,Rebounds,Assists,Threes,PRA,Steals' && r.length === 1 && r[0].stat === 'stl' && (await text(y, '#props-board .pr-stat')) === 'Steals' && (await text(y, '#pb-summary')) === '1 NBA prop, steals.' && !!dd && dd.head === 'Steals, last 6 games' && dd.chips.indexOf('STL 1.5*') !== -1 && /3PM.*Stl/.test(dd.logHead) && /^Cleared 1\.5 in 3 of the last 6/.test(dd.why[0]), (await y.$$eval('#p-stats button', els => els.map(n => n.textContent).join())) + ' / ' + (dd && dd.logHead));
  await y.keyboard.press('Escape'); await y.click('#p-stats [data-stat="pts"]'); await y.waitForTimeout(120);
  check('props stat lists: the data’s name for a stat wins over the built-in one', (await text(y, '#pb-summary')) === '5 NBA props, points scored.' && (await y.getAttribute('#props-board .pr-stat', 'title')) === 'Points scored' && /over 19\.5 points scored/.test(await y.textContent('#played-host')));
  await y.close();
  const y2 = await open('league=NFL&stat=passAtt', { data: stl });
  r = await rowsOf(y2);
  await y2.click('#props-board a.pr-open'); await y2.waitForTimeout(150);
  dd = await dialog(y2);
  check('props stat lists: with no list at all, a key only a player carries is still named from the key itself and graded', (await y2.$$eval('#p-stats button', els => els.map(n => n.textContent).join())) === 'All stats,Pass yards,Pass TDs,Rush yards,Rec yards,Receptions,Pass att' && r.length === 1 && r[0].id === BRISSETT && (await text(y2, '#props-board .pr-stat')) === 'Pass att' && !!dd && dd.head === 'Pass att, last 8 games' && dd.bars === 8 && /Rush yds.*Pass att/.test(dd.logHead) && dd.sides.length === 2, dd && dd.logHead);
  await y2.close();

  /* ---------- the owner's rule: a book's price takes no part in the probability, the side or the rank ---------- */
  const priced = sample();
  priced.players.forEach((p, i) => Object.keys(p.lines || {}).forEach(key => { const ln = p.lines[key]; ['over', 'under'].forEach((sd, j) => { if (!ln[sd] || !ln[sd].books) return; const o = j === 0 ? 150 + 35 * (i % 7) : -260 - 20 * (i % 5); Object.keys(ln[sd].books).forEach(bk => { ln[sd].books[bk] = o; }); ln[sd].odds = o; ln[sd].fair = j === 0 ? 0.2 : 0.8; }); }));
  const z = await open('', { data: priced });
  const zr = await rowsOf(z);
  check('props grade: with every book’s price changed the board is the same rows in the same order at the same probabilities; only the price column moves', same(zr, want) && zr.map(o => o.rank).join() === rows.map(o => o.rank).join() && zr.every((o, i) => o.best !== rows[i].best), zr.map(o => o.best).join(' '));
  await z.close();

  /* ---------- game day first: a board that spans two days ---------- */
  const two = sample();
  two.games.find(g => g.id === MIL_BOS).start = '2026-11-06T00:30Z';
  two.players.forEach(p => { if (p.gameId === MIL_BOS && p.commence) p.commence = '2026-11-06T00:30Z'; });
  const dz = await open('', { data: two });
  r = await rowsOf(dz);
  const heads = await dz.$$eval('#props-board tbody > tr', els => els.map(e => (e.classList.contains('day-divider') ? 'D:' + e.textContent : e.dataset.day)));
  check('props board: today’s games before tomorrow’s whatever the probability, a day heading where the day changes, ranks running through', same(r, board(two, 'NBA', FIXTURE_NOW)) && r.map(o => o.day).join() === '2026-11-04,2026-11-04,2026-11-04,2026-11-05,2026-11-05' && Number(r[3].prob) > Number(r[2].prob) && heads.join() === 'D:Today Wed Nov 4,2026-11-04,2026-11-04,2026-11-04,D:Tomorrow Thu Nov 5,2026-11-05,2026-11-05' && r.map(o => o.rank).join() === '1,2,3,4,5' && (await text(dz, '#p-games [data-game="' + MIL_BOS + '"]')) === 'MIL @ BOS Tomorrow 7:30 PM', heads.join());
  await dz.selectOption('#p-sort', 'form'); await dz.waitForTimeout(120);
  check('props board: an opt-in order that is not by day carries no day heading', (await dz.locator('#props-board tr.day-divider').count()) === 0);
  await dz.close();

  /* ---------- no lines in either league ---------- */
  const none = sample();
  none.players.forEach(p => { delete p.lines; }); delete none.results;
  none.lines = { skipped: 'off' }; none.leagues.NBA.lines = { skipped: 'off' }; none.leagues.NFL.lines = { skipped: 'not a game day', next: '2026-11-05' };
  const n = await open('', { data: none });
  const nl = await n.evaluate(() => { const box = document.getElementById('no-line'); return { open: box.open, hidden: box.hidden, count: document.getElementById('nl-count').textContent, items: Array.from(box.querySelectorAll('#nl-list li')).map(li => li.textContent.replace(/\s+/g, ' ')), how: document.getElementById('nl-how').textContent }; });
  check('props with no lines: the board says when the league’s lines are read and points at the players; the head says no lines were read yet', (await rowsOf(n)).length === 0 && (await n.textContent('#props-board')) === 'No NBA lines yet. The books post most of them in the afternoon, and ours are read tomorrow about 3:30 PM ET. Until then, every player is listed under No line yet: open one and type a line to grade it.' && (await n.locator('#props-board a[href="#no-line"]').count()) === 1 && (await n.$$eval('#props-updated .update-line > span', els => els.map(o => o.textContent).join(' | '))) === 'Research updated 1:00 PM ET, no lines read yet | Next read tomorrow about 9:00 AM ET' && (await n.$$eval('#p-leagues .browse-next', els => els.map(o => o.textContent).join())) === 'no lines yet,no lines yet', await n.textContent('#props-board'));
  check('props with no lines: the page is still useful: every player is listed, open, with his matchup, start and season averages', !nl.hidden && nl.open && nl.count === '6' && nl.items.length === 6 && /^Nickeil Alexander-Walker ?G ATL ?ATL @ WSH ?Today 7:00 PM ET ?Points 21\.1 ?Rebounds 3\.3 ?Assists 2\.8$/.test(nl.items[0]) && /season averages/.test(nl.how) && (await strip(n)) === '#board #no-line #how', nl.items[0]);
  await n.click('#nl-list a[data-open="' + WALKER + '"]'); await n.waitForTimeout(150);
  await n.fill('#pd-line', '20.5'); await n.waitForTimeout(80);
  dd = await dialog(n);
  check('props with no lines: any player’s detail grades a typed line from his games', !!dd && dd.name === 'Nickeil Alexander-Walker' && dd.sides.length === 2 && !!dd.side && dd.note === 'No book line yet: this is graded at the number you typed.' && dd.bars === 8);
  await n.keyboard.press('Escape'); await n.click('#p-leagues [data-league="NFL"]'); await n.waitForTimeout(120);
  check('props with no lines: the NFL says its lines come on the next game day’s morning run, naming the day and the game', (await n.textContent('#props-board')) === 'No NFL lines yet. They are read on the next game day, tomorrow (JAX @ BAL), on that morning’s run, about 9 AM ET. Until then, every player is listed under No line yet: open one and type a line to grade it.' && (await n.$eval('#nl-count', o => o.textContent)) === '20' && (await n.$$eval('#nl-list li', els => els.length)) === 20, await n.textContent('#props-board'));
  await n.close();

  /* an NFL game-day morning: the NFL's lines are in (the morning run reads only them), the NBA's are not yet */
  const am = sample();
  am.players.forEach(p => { if (G.leagueOf(p) === 'NBA') { delete p.lines; if (p.commence) p.commence = p.gameId === ATL_WSH ? '2026-11-06T00:00Z' : '2026-11-06T00:30Z'; } });
  am.games.forEach(g => { if (G.leagueOf(g) === 'NBA') g.start = g.id === ATL_WSH ? '2026-11-06T00:00Z' : '2026-11-06T00:30Z'; });
  am.lines = { skipped: 'off' }; am.leagues.NBA.lines = { skipped: 'off' }; am.leagues.NBA.date = '2026-11-05'; am.date = '2026-11-05'; am.leagues.NFL.today = true;
  const m = await open('', { data: am, at: Date.parse('2026-11-05T09:30:00-05:00') });
  const amHead = await m.$$eval('#props-updated .update-line > span', els => els.map(o => o.textContent).join(' | '));
  const amTabs = await m.$$eval('#p-leagues a', els => els.map(o => o.textContent.replace(/\s+/g, ' ') + (o.getAttribute('aria-current') ? '*' : '')).join(' | '));
  await m.click('#p-leagues [data-league="NBA"]'); await m.waitForTimeout(120);
  check('props head: on an NFL game day the title is for today and the NFL leads; with its lines in and none for the NBA yet, each league says its own state and neither speaks for the other', (await text(m, '#props-title')) === 'Today’s props, likeliest first' && amTabs === 'NFL9* | NBAno lines yet' && amHead === 'Lines read 9:00 AM ET (30 min ago) | Next read about 3:30 PM ET' && (await m.textContent('#props-board')).indexOf('No NBA lines yet. The books post most of them in the afternoon, and ours are read about 3:30 PM ET.') === 0, amTabs + ' / ' + amHead + ' / ' + (await m.textContent('#props-board')));
  await m.close();

  /* ---------- phone width ---------- */
  const ph = await open('', { viewport: { width: 400, height: 860 } });
  const cards = await ph.evaluate(() => { const tr = document.querySelector('#props-board tr.pr'), box = tr.getBoundingClientRect(); return { head: getComputedStyle(document.querySelector('.props-table thead')).display, cells: Array.from(tr.children).map(td => { const b = td.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left >= box.left - 0.5 && b.right <= box.right + 0.5 && b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5; }), h: Math.round(box.height), labels: [getComputedStyle(tr.querySelector('.pr-l5'), '::before').content, getComputedStyle(tr.querySelector('.pr-hit'), '::before').content].join() }; });
  check('props phone: at 400px a row is a card with all nine cells inside it and the cells that need a name carry one', cards.head === 'none' && cards.cells.length === 9 && cards.cells.every(Boolean) && cards.h < 200 && /L5/.test(cards.labels) && /To hit/.test(cards.labels), JSON.stringify(cards));
  let cut = await clipped(ph);
  check('props phone: no horizontal overflow, no clipped text and no table that scrolls sideways (board, record, results)', cut.length === 0, cut.join(' | '));
  await ph.click('#props-board a.pr-open'); await ph.waitForTimeout(200);
  cut = await clipped(ph);
  const stack = await ph.$$eval('#pd .pd-side', els => els.length === 2 && els[1].getBoundingClientRect().top >= els[0].getBoundingClientRect().bottom - 0.5);
  check('props phone: the detail fits the screen: nothing clipped, the chart and the log inside it, the two sides stacked', cut.length === 0 && stack && (await ph.$eval('#pd', o => o.getBoundingClientRect().right <= 400 && o.getBoundingClientRect().left >= 0)), cut.join(' | '));
  await ph.keyboard.press('Escape'); await ph.click('#p-leagues [data-league="NFL"]'); await ph.waitForTimeout(150);
  cut = await clipped(ph);
  const nflRows = (await rowsOf(ph)).length;
  await ph.fill('#p-search', 'Henry'); await ph.waitForTimeout(120); await ph.click('#props-board a.pr-open'); await ph.waitForTimeout(200);
  const cut2 = await clipped(ph);
  check('props phone: the NFL board and a back’s detail (the widest log, ten columns) fit as well', nflRows === 9 && cut.length === 0 && cut2.length === 0 && /Car.*Rush yds.*Tgt.*Rec.*Rec yds.*TD/.test((await dialog(ph)).logHead), cut.concat(cut2).join(' | '));
  await ph.close();
  const ph2 = await open('', { viewport: { width: 400, height: 860 }, data: none });
  cut = await clipped(ph2);
  check('props phone: the no-lines page fits too', cut.length === 0 && (await ph2.$$eval('#nl-list li', els => els.length)) === 6, cut.join(' | '));
  await ph2.close();

  /* ---------- a face that will not load ---------- */
  const im = await open('', { noImages: true });
  await im.waitForTimeout(300);
  check('props: a headshot that will not load becomes the player’s initials, never a broken image', (await im.$$eval('#props-board .pr-face', els => els.length === 5 && els.every(o => o.tagName === 'SPAN' && o.classList.contains('headshot-fallback') && /^[A-Z]{1,2}$/.test(o.textContent)))) && (await im.$eval('#props-board .pr-face', o => o.textContent)) === 'NA');
  await im.close();

  check('props board checks: no page errors', errors.length === 0, errors.join(' | '));
}

module.exports = { run };
