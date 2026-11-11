/* Behaviour checks for the NFL week hub (2026-11-10): js/nfl.js in the NFL panel of picks.html?sport=NFL and its
   forecast block on game.html. Run by scripts/behavior.js (npm test) with its server, clock and check().
   Data is scripts/fixtures/sample-nfl-week.js, a sample NFL_WEEK_DATA in the pipeline's shape for the sample fixtures'
   own week (the NFL's week 9, the suite's clock pinned to Wed 2026-11-04, 4:45 PM ET), and variants of it built below:
   a game under way, finals with a right and a wrong forecast, a tie, a postponed game, a filled record, a file with no
   week, a sample file, no file at all. The suite's own server serves no NFL week (every other check sees the pages as
   they were); each page here routes data/nfl-week.js itself. ESPN is answered from here, never asked.
   The clearing prices are checked against the pipeline's own valueTo (scripts/update-data.js), required here. */
const vm = require('vm');
const BOARD = require('./update-data.js');
const BF = require('./fixtures/browse-fixtures.js');

const JAX_BAL = '401900001', DAL_PHI = '401900002', SF_SEA = '401900003', KC_BUF = '401900004', CHI_GB = '401900005', LV_DEN = '401900006', ATL_NO = '401900007';
const THU_810PM = Date.parse('2026-11-05T20:10:00-05:00'), THU_9PM = Date.parse('2026-11-05T21:00:00-05:00'), FRI_9AM = Date.parse('2026-11-06T09:00:00-05:00'), SUN_730PM = Date.parse('2026-11-08T19:30:00-05:00'), TUE_8AM = Date.parse('2026-11-10T08:00:00-05:00');
const dayET = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

async function run(h) {
  const { browser, url, check, pinClock, sampleSrc } = h;
  const SRC = sampleSrc('sample-nfl-week.js');
  const sample = () => { const s = { window: {} }; vm.runInNewContext(SRC, s); return JSON.parse(JSON.stringify(s.window.NFL_WEEK_DATA)); };
  const errors = [];
  /* a page on its own context: the clock pinned, ESPN answered, the NFL week file routed.
     opts.nfl: an NFL_WEEK_DATA object (default: the sample), a script body, 404 (no file), or null (the suite's own: no week) */
  const open = async (path, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, colorScheme: opts.scheme || 'dark', reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
    if (opts.scheme) await ctx.addInitScript(s => { try { localStorage.setItem('theme', s); } catch (e) { /* no storage */ } }, opts.scheme);
    await ctx.route('**/site.api.espn.com/**', route => (opts.espn ? opts.espn(route) : route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"events":[]}' })));
    const nfl = opts.nfl === undefined ? sample() : opts.nfl;
    if (nfl !== null) await ctx.route('**/data/nfl-week.js', route => (nfl === 404 ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }) : route.fulfill({ contentType: 'text/javascript', body: typeof nfl === 'string' ? nfl : 'window.NFL_WEEK_DATA = ' + JSON.stringify(nfl) + ';' })));
    if (opts.real) {
      await ctx.route('**/data/picks.js', route => route.fulfill({ contentType: 'text/javascript', body: BF.withAppended(sampleSrc('sample-picks.js'), 'window.PICKS_DATA.sample = false;') }));
      await ctx.route('**/data/market.js', route => route.fulfill({ contentType: 'text/javascript', body: BF.withAppended(sampleSrc('sample-market.js'), 'window.MARKET_DATA.sample = false;') }));
    }
    const page = await ctx.newPage(); await pinClock(page, opts.at);
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(url(path)); await page.waitForTimeout(opts.wait || 450);
    return { page, ctx, errs, close: async () => { if (!opts.ownErrors) errs.forEach(e => errors.push(path + ': ' + e)); await ctx.close(); } };
  };
  /* the hub as the page shows it */
  const hubOf = page => page.evaluate(() => {
    const sec = document.getElementById('nfl-week'); if (!sec) return null;
    const txt = n => (n ? n.textContent.replace(/\s+/g, ' ').trim() : null), all = (s, r) => Array.from((r || sec).querySelectorAll(s)), attr = (n, a) => (n ? n.getAttribute(a) : null);
    return {
      title: txt(sec.querySelector('.nfl-hub-title')), how: all('.nfl-how').map(txt), checks: all('.nfl-check').map(txt), record: txt(sec.querySelector('.nfl-record')), recordEmpty: sec.querySelector('.nfl-record').classList.contains('is-empty'), recordParts: all('.nfl-record-line > span').map(txt), stamp: all('.nfl-stamp > span').map(txt),
      order: all('.nfl-grid > *').map(n => (n.classList.contains('day-divider') ? 'day:' + txt(n) : n.getAttribute('data-game'))),
      cards: all('.nfl-game').map(c => ({ id: c.dataset.game, state: c.dataset.state, day: c.dataset.day, prob: c.dataset.prob, rank: txt(c.querySelector('.rank')), rankTop: !!c.querySelector('.rank-top'), sel: txt(c.querySelector('.pick-selection')), selTag: (c.querySelector('.pick-selection') || {}).tagName, score: all('.nfl-score > span', c).map(txt),
        fill: c.querySelector('.prob-fill') ? c.querySelector('.prob-fill').style.width : null, tick: c.querySelector('.prob-tick') ? c.querySelector('.prob-tick').style.left : null, barLabel: attr(c.querySelector('.prob'), 'aria-label'), metrics: all('.pick-metric', c).map(txt),
        qb: all('.nfl-qb > span', c).map(txt), inj: all('.nfl-inj > summary .meta > span, .nfl-inj-none .meta > span', c).map(txt), hasFold: !!c.querySelector('details.nfl-inj'), injOpen: !!(c.querySelector('details.nfl-inj') || {}).open, injNames: all('.nfl-inj-list li', c).map(txt), injChips: all('.nfl-inj-list .inj-status', c).map(n => n.className.replace('inj-status', '').trim() + ':' + txt(n)),
        wx: all('.nfl-wx > span', c).map(txt), lean: all('.nfl-lean > span', c).map(txt), from: all('.nfl-from', c).map(n => ({ side: n.dataset.side, price: n.dataset.price, text: txt(n) })), leanHref: attr(c.querySelector('.nfl-lean-link'), 'href'), hasLean: c.classList.contains('has-lean'),
        foot: all('.pick-foot .meta > span', c).map(txt), links: all('.pick-foot a', c).map(a => txt(a) + '>' + a.getAttribute('href')), event: attr(c.querySelector('.pick-event a'), 'href'), eventText: txt(c.querySelector('.pick-event')), badges: all('.pick-head .badge', c).map(txt), lit: all('.mu-team.is-pick .mu-abbr', c).map(txt), dim: all('.mu-team.is-off .mu-abbr', c).map(txt), tinted: c.classList.contains('has-team') })),
      rows: all('.nfl-played').map(r => ({ id: r.dataset.game, state: r.dataset.state, call: r.dataset.call, chip: txt(r.querySelector('.played-id .badge-state')), chipClass: r.querySelector('.played-id .badge-state').className, sel: txt(r.querySelector('.played-pick strong')), meta: all('.leg-event > span', r).map(txt), score: txt(r.querySelector('.played-score')), notes: all('.played-note', r).map(txt), live: attr(r.querySelector('[data-live]'), 'data-live'), links: all('a', r).map(a => a.getAttribute('href')), offers: r.querySelectorAll('.nfl-from, .nfl-lean, .prob-bar').length })),
      playedOrder: all('.nfl-played-list > *').map(n => (n.classList.contains('day-divider') ? 'day:' + txt(n) : n.getAttribute('data-game'))),
      sub: txt(sec.querySelector('.nfl-sub')), none: txt(sec.querySelector('.nfl-none')), text: txt(sec)
    };
  });
  const panelOf = page => page.evaluate(() => ({ hub: !!document.getElementById('nfl-week'), schedule: document.querySelectorAll('#browse-panel .browse-games').length, rows: document.querySelectorAll('#browse-panel .browse-game').length, leans: [...document.querySelectorAll('#browse-panel > .picks-grid article.pick')].map(a => a.getAttribute('data-id')), text: document.getElementById('browse-panel').textContent.replace(/\s+/g, ' ').trim(), head: document.getElementById('all-picks').textContent, how: document.querySelector('.picks-head .how-to').textContent, strip: [...document.querySelectorAll('.subnav a')].map(a => a.textContent + (a.hidden ? ' (hidden)' : '')).join('|'), hasData: typeof window.NFL_WEEK_DATA }));
  const cardOf = (hub, id) => hub.cards.find(c => c.id === id), rowOf = (hub, id) => hub.rows.find(r => r.id === id);
  const D = sample(), game = id => D.games.find(g => g.id === id);

  /* ---------- the hub on the NFL tab: order, day headings, rank chips ---------- */
  const a = await open('picks.html?sport=NFL');
  const A = await hubOf(a.page), AP = await panelOf(a.page);
  const want = D.games.slice().sort((x, y) => (dayET(x.kickoff) < dayET(y.kickoff) ? -1 : dayET(x.kickoff) > dayET(y.kickoff) ? 1 : ((y.projection ? y.projection.prob : -1) - (x.projection ? x.projection.prob : -1)) || (Date.parse(x.kickoff) - Date.parse(y.kickoff))));
  check('nfl hub: the NFL tab shows the week hub under the leans, titled by ESPN’s week, with every game of the week as a card', !!A && A.title === 'Week 9 forecasts: every game, likeliest first' && A.cards.length === 7 && A.rows.length === 0 && AP.leans.length === 3 && (await a.page.evaluate(() => { const hub = document.getElementById('nfl-week'), grid = document.querySelector('#browse-panel > .picks-grid'); return hub.parentNode.id === 'browse-panel' && !!(grid.compareDocumentPosition(hub) & Node.DOCUMENT_POSITION_FOLLOWING) && hub.querySelector('h3#nfl-week-h') !== null && hub.getAttribute('aria-labelledby') === 'nfl-week-h'; })), A && A.title);
  check('nfl hub: game day first, then the likeliest projected winner within a day (the order the data’s own probabilities give), a game with no forecast last in its day', A.cards.map(c => c.id).join() === want.map(g => g.id).join() && A.cards.map(c => c.id).join() === [JAX_BAL, SF_SEA, KC_BUF, DAL_PHI, ATL_NO, LV_DEN, CHI_GB].join() && A.cards.every((c, i) => c.day === dayET(want[i].kickoff) && c.prob === (want[i].projection ? String(want[i].projection.prob) : '')), A.cards.map(c => c.id + ':' + c.prob).join(' '));
  check('nfl hub: a day heading opens each game day, in the site’s own words against the clock', A.order.join('|') === ['day:Tomorrow Thu Nov 5', JAX_BAL, 'day:Sunday Nov 8', SF_SEA, KC_BUF, DAL_PHI, ATL_NO, LV_DEN, 'day:Monday Nov 9', CHI_GB].join('|'), A.order.join('|'));
  check('nfl hub: rank chips number the forecasts in display order, so #1 is the first day’s likeliest (64.2% on Thursday), not the week’s (70.1% on Sunday is #2); a game with no forecast has no chip', A.cards.map(c => c.rank).join('|') === '#1 Likeliest|#2|#3|#4|#5||#6' && A.cards[0].rankTop && !A.cards[1].rankTop && Number(A.cards[1].prob) > Number(A.cards[0].prob), A.cards.map(c => c.rank).join('|'));
  check('nfl hub: one line under the heading says what the order is and what the numbers mean', A.how.length === 1 && /^By game day, then by how likely the projected winner is: #1 is the first day’s likeliest\./.test(A.how[0]) && /“To win” are the model’s probability for that club, from game data alone/.test(A.how[0]) && /projected score is its average result/.test(A.how[0]) && /“Give or take” its own error on the margin/.test(A.how[0]) && /locked at kickoff and graded straight up: did the projected winner win/.test(A.how[0]) && /“Moneyline lean from” is the price at which a side would clear its own bar/.test(A.how[0]), A.how.join(' || '));

  /* ---------- the projection and its bar ---------- */
  const bal = cardOf(A, JAX_BAL), sf = cardOf(A, SF_SEA), buf = cardOf(A, KC_BUF), phi = cardOf(A, DAL_PHI), no = cardOf(A, ATL_NO), den = cardOf(A, LV_DEN), gb = cardOf(A, CHI_GB);
  check('nfl hub (projection): the projected winner as the card’s headline, the projected score with the winner first, and three numbers: To win, the margin and the model’s own give or take', bal.sel === 'Ravens to win' && bal.selTag === 'H4' && bal.score.join('|') === 'Projected score|BAL 24.6|JAX 19.3' && bal.metrics.join('|') === 'To win64.2%|Margin5.3 pts|Give or take4.4 pts' && bal.eventText === 'Jacksonville Jaguars @ Baltimore Ravens', JSON.stringify([bal.sel, bal.score, bal.metrics]));
  check('nfl hub (projection): an away side projected to win reads the same way, its logo ringed and the other club dimmed, and the card takes its colour', sf.sel === '49ers to win' && sf.score.join('|') === 'Projected score|SF 26.0|SEA 19.2' && sf.metrics[0] === 'To win70.1%' && sf.metrics[1] === 'Margin6.8 pts' && sf.lit.join() === 'SF' && sf.dim.join() === 'SEA' && bal.lit.join() === 'BAL' && sf.tinted, JSON.stringify([sf.sel, sf.score, sf.lit, sf.dim]));
  check('nfl hub (bar): the probability bar’s fill is our probability for the projected winner; with no price read there is no tick, and its label says so in words', bal.fill === '64.2%' && bal.tick === null && sf.fill === '70.1%' && bal.barLabel === 'Our probability that the Ravens win: 64.2%, from the game data', bal.barLabel);
  check('nfl hub (bar): on a game the board has priced the tick is what the best moneyline price on the projected winner implies (-140: 58.3%)', phi.fill === '58.8%' && phi.tick === '58.3%' && /the best moneyline price implies 58\.3%$/.test(phi.barLabel) && buf.tick === '58.3%', phi.barLabel);
  check('nfl hub: every card is marked a forecast, and a game with no forecast says so plainly with no bar, no numbers and nothing offered', A.cards.every(c => c.badges.indexOf('Forecast') !== -1 && c.badges.indexOf('NFL') !== -1) && den.sel === 'No forecast yet' && den.fill === null && den.metrics.length === 0 && den.from.length === 0 && den.lit.length === 0 && den.dim.length === 0 && den.rank === null, JSON.stringify(den.badges));

  /* ---------- the quarterbacks, the injuries, the weather ---------- */
  check('nfl hub (quarterbacks): the matchup the model assumed, away then home: a usual starter by name, a backup with whom he replaces and why, his own listing, a change from last week, a starter listed questionable', bal.qb.join('|') === 'Quarterbacks|JAX: Trevor Lawrence|BAL: Tyler Huntley, in for Lamar Jackson (out), listed questionable himself' && no.qb.join('|') === 'Quarterbacks|ATL: Michael Penix Jr.|NO: Spencer Rattler, a change from Tyler Shough' && buf.qb.join('|') === 'Quarterbacks|KC: Patrick Mahomes, listed questionable|BUF: Josh Allen', bal.qb.join('|'));
  check('nfl hub (quarterbacks): a game that ran on the margin model says the quarterbacks were not read, never a name it did not use', gb.qb.join('|') === 'Quarterbacks|not read for this game: it ran on the margin model, which has no quarterback term', gb.qb.join('|'));
  check('nfl hub (injuries): what the model charged each club, in points, with how many are listed; the names sit one tap away, folded by default', bal.inj.join('|') === 'Injuries charged|JAX 1.9 pts, 6 listed|BAL 1.0 pts, 2 listed' && bal.hasFold && !bal.injOpen && sf.inj.join('|') === 'Injuries charged|SF none|SEA 2.4 pts, 7 listed', bal.inj.join('|'));
  check('nfl hub (injuries): the fold names up to four a club with status and position (out in one colour, limited in another) and counts the rest; a game with no charge is one plain line with no fold', bal.injNames.join('|') === 'Injured Reserve Travis Hunter (WR)|Doubtful Walker Little (OT)|Questionable Devin Lloyd (LB)|Questionable Tyson Campbell (CB)|and 2 more|Out Kyle Hamilton (S)|Questionable Nate Wiggins (CB)' && bal.injChips.slice(0, 3).join('|') === 'inj-out:Injured Reserve|inj-out:Doubtful|inj-q:Questionable' && no.inj.join('|') === 'Injuries charged|ATL none|NO none' && !no.hasFold, bal.injNames.join('|'));
  await a.page.click('.nfl-game[data-game="' + JAX_BAL + '"] details.nfl-inj > summary');
  check('nfl hub (injuries): the fold opens with a click or the keyboard (a native details)', await a.page.evaluate(id => { const d = document.querySelector('.nfl-game[data-game="' + id + '"] details.nfl-inj'); return d.open && d.querySelector('.nfl-inj-list').getClientRects().length > 0 && d.querySelector('summary').tabIndex === 0; }, JAX_BAL));
  check('nfl hub (weather): the hour of kickoff at an outdoor stadium: temperature, wind and the forecast’s own words when dry, the chance of rain or snow when it is a real one; indoors says so', bal.wx.join('|') === 'Weather|48°F|wind 12 mph NW|mostly cloudy' && sf.wx.join('|') === 'Weather|51°F|wind 9 mph S|70% chance of rain' && gb.wx.join('|') === 'Weather|31°F|wind 18 mph NW|40% chance of snow' && no.wx.join('|') === 'Weather|indoors' && phi.wx.join('|') === 'Weather|55°F|wind 6 mph W|sunny', [bal.wx, sf.wx, gb.wx, no.wx].map(x => x.join('|')).join(' || '));

  /* ---------- the posted lean, and the price that would make one ---------- */
  const priced = A.cards.filter(c => c.from.length);
  check('nfl hub (clearing price): a game with no lean shows, for each moneyline side, the price at which it would clear its own bar: EdgeLine.clearPrice of the data’s probability and bar, the pipeline’s valueTo of the same two numbers, and the price the pipeline wrote, all three the same',
    priced.length === 5 && priced.every(c => c.from.length === 2 && c.from.map(f => f.side).join() === 'away,home' && c.from.every(f => { const x = game(c.id).leanFrom[f.side]; return Number(f.price) === BOARD.valueTo(x.prob, x.bar) && Number(f.price) === x.price; }))
    && (await a.page.evaluate(d => d.games.filter(g => g.leanFrom).every(g => ['home', 'away'].every(s => window.EdgeLine.clearPrice(g.leanFrom[s].prob, g.leanFrom[s].bar) === g.leanFrom[s].price)), D)), priced.map(c => c.from.map(f => f.price).join('/')).join(' '));
  check('nfl hub (clearing price): it reads as a price to clear, away then home, and says when a game not yet priced will be; on a priced game each side also shows the best price now and its book', bal.lean.join('|') === 'Moneyline lean from|JAX +290|BAL -117|no price read yet' && sf.lean.join('|') === 'Moneyline lean from|SF -154|SEA +388|priced from Saturday afternoon' && phi.lean.join('|') === 'Moneyline lean from|DAL +229, best now +120 at FanDuel|PHI +109, best now -140 at DraftKings' && gb.lean.join('|') === 'Moneyline lean from|CHI +212|GB +135|priced from Sunday afternoon', [bal.lean, sf.lean, phi.lean, gb.lean].map(x => x.join('|')).join(' || '));
  check('nfl hub (posted lean): a game with a lean on the board shows it, marked, with its price and book and a link to its card, and no clearing prices beside it', buf.lean.join('|') === 'Our lean|Buffalo -2.5|-110 at DraftKings' && buf.leanHref === 'picks.html?sport=NFL#p1' && buf.from.length === 0 && buf.hasLean && !phi.hasLean, buf.lean.join('|'));
  await a.page.click('.nfl-game[data-game="' + KC_BUF + '"] a.nfl-lean-link'); await a.page.waitForTimeout(200);
  check('nfl hub (posted lean): the link rings the lean’s own card in the panel above, without leaving the tab', (await a.page.evaluate(() => { const c = document.querySelector('#browse-panel .card.pick[data-id="p1"]'); return !!c && c.classList.contains('highlight'); })) && /picks\.html\?sport=NFL$/.test(a.page.url()), a.page.url());
  check('nfl hub: the spread and the total are never offered: two moneyline prices a game at most, and no card or line speaks of a spread, a total, an over or an under', A.cards.every(c => c.from.length === 0 || c.from.length === 2) && (await a.page.evaluate(() => [...document.querySelectorAll('#nfl-week .nfl-game')].every(c => !/\b(spreads?|totals?|over|under)\b/i.test(c.textContent)))) && !/\b(spreads?|totals?)\b/i.test(A.how.join(' ') + A.record), A.how.join(' '));
  check('nfl hub (links): every card opens its game page (the board’s page for a priced game, ESPN’s for the rest) from its title and its foot, and that game’s props', bal.event === 'game.html?espn=401900001&league=americanfootball_nfl&date=20261105' && bal.links.join('|') === 'Game page>game.html?espn=401900001&league=americanfootball_nfl&date=20261105|Props>props.html?league=NFL&game=401900001' && buf.event === 'game.html?id=g5' && phi.event === 'game.html?id=g6' && sf.event === 'game.html?id=p12' && A.cards.every(c => c.links.length === 2 && /^Props>props\.html\?league=NFL&game=\d+$/.test(c.links[1])) && bal.foot.join('|') === 'Tomorrow 8:15 PM ET|Prime Video' && sf.foot[0] === 'Sun 4:05 PM ET', bal.links.join('|'));

  /* ---------- the record (empty), the held-out check, the wording ---------- */
  check('nfl hub (record, empty): before any game is graded the strip says so, names the week the record starts with and says nothing is backfilled', A.recordEmpty && A.record === 'No forecast graded yet. The record starts with Week 9: every forecast made before its kickoff is graded straight up when the game ends. Nothing earlier is backfilled.' && A.stamp.join('|') === 'Projected 2:02 PM ET|On a bye: CAR, TB', A.record);
  check('nfl hub (held-out check): said once, plainly, from the numbers in the data: calibrated against results, no information beyond the closing price, and no better than a coin flip at the books’ spread and total', A.checks.length === 1 && A.checks[0] === 'What the held-out check found, over 3,532 games from 2012 to 2026: these win probabilities were calibrated against results (a slope of 1.08, where 1 is exact) and carried no information beyond the closing price. At the books’ spread and total the model did no better than a coin flip, so neither is shown here.', A.checks.join(' || '));
  check('nfl hub (wording): the projected winner is a forecast: outside the lean line and the sentence that names it, nothing calls it a lean, a pick, a play or a bet, and nothing claims an edge, value or a lock', (await a.page.evaluate(() => {
    const sec = document.getElementById('nfl-week').cloneNode(true);
    sec.querySelectorAll('.nfl-lean').forEach(n => n.remove());
    const how = sec.querySelector('.nfl-how'); how.textContent = how.textContent.replace('“Moneyline lean from” is the price at which a side would clear its own bar and be posted.', '');
    const text = sec.textContent, titles = [...sec.querySelectorAll('[title]')].map(n => n.getAttribute('title')).join(' ');
    return !/\b(leans?|picks?|plays?|bets?|betting|wager|edges?|value|locks?|best bet)\b/i.test(text + ' ' + titles) && [...document.querySelectorAll('#nfl-week .pick-selection')].every(n => /^(.+ to win|No forecast yet)$/.test(n.textContent));
  })));
  check('nfl hub: with the hub listing every NFL game the schedule would, the schedule block stands down, the list’s own how-to points at the forecasts, and the leans above are as they were', AP.schedule === 0 && AP.rows === 0 && /Below them, every game of the NFL week with the model’s forecast: the projected winner and score, graded straight up, each linked to its game page\.$/.test(AP.how) && AP.head === 'NFL leans, likeliest first' && AP.leans.length === 3, AP.how.slice(-140));
  check('nfl hub (strip): “On this page” gains an NFL week link after the list’s own, only on the NFL tab', AP.strip === 'Best parlays|All leans|NFL week|Watchlist|In progress and results|Market board', AP.strip);
  await a.page.click('.subnav a[href="#nfl-week"]'); await a.page.waitForTimeout(500);
  check('nfl hub (strip): the link brings the hub under the header and is marked as the section in view', await a.page.evaluate(() => { const top = document.getElementById('nfl-week').getBoundingClientRect().top; return top >= 0 && top < 220 && document.querySelector('.subnav a[href="#nfl-week"]').getAttribute('aria-current') === 'true'; }));
  await a.page.click('.browse-tabs a[data-sport="NHL"]'); await a.page.waitForTimeout(250);
  const nhl = await panelOf(a.page);
  await a.page.click('.browse-tabs a[data-sport=""]'); await a.page.waitForTimeout(250);
  const allTab = await panelOf(a.page);
  check('nfl hub: another sport’s tab and the All view have no hub, and the strip link hides again', !nhl.hub && nhl.schedule === 1 && /NFL week \(hidden\)/.test(nhl.strip) && !allTab.hub && /NFL week \(hidden\)/.test(allTab.strip), nhl.strip);
  check('nfl hub: nothing in the hub carries an inline style but the bar’s fill and tick and the club colour the team components set', await (async () => { await a.page.click('.browse-tabs a[data-sport="NFL"]'); await a.page.waitForTimeout(250); return a.page.evaluate(() => [...document.querySelectorAll('#nfl-week [style]')].every(n => n.matches('.prob-fill, .prob-tick, .mu-team, .nfl-game.has-team') && /^(width|left|--team):/.test(n.getAttribute('style').trim()))); })());
  await a.close();
  {
    /* data is text, never markup */
    const X = sample(); X.games[0].qb.away.name = '<img src=x onerror="window.__nflx=1">'; X.games[0].home.short = '<b>Ravens</b>'; X.games[0].injuries.away.list[0].name = '<script>window.__nflx=2</script>';
    const x = await open('picks.html?sport=NFL', { nfl: X }), hx = await hubOf(x.page);
    check('nfl hub: every value from the file goes in as text: a name that looks like markup is shown as written and never becomes an element', cardOf(hx, JAX_BAL).qb[1] === 'JAX: <img src=x onerror="window.__nflx=1">' && cardOf(hx, JAX_BAL).sel === '<b>Ravens</b> to win' && (await x.page.evaluate(() => window.__nflx === undefined && !document.querySelector('#nfl-week img[src="x"], #nfl-week b, #nfl-week script'))), cardOf(hx, JAX_BAL).qb[1]);
    await x.close();
  }

  /* ---------- a started game is never shown as something to bet ---------- */
  {
    const s = await open('picks.html?sport=NFL', { at: THU_9PM }), S = await hubOf(s.page), r = rowOf(S, JAX_BAL);
    check('nfl hub (started): at kickoff by the visitor’s clock, before the file knows it, the game leaves the cards and lands under “Under way and finished” as a live row with its forecast as it stood', !cardOf(S, JAX_BAL) && S.cards.length === 6 && S.sub === 'Under way and finished' && S.rows.length === 1 && r.state === 'live' && r.chip === 'Live' && /badge-live/.test(r.chipClass) && r.sel === 'Ravens to win' && r.meta.join('|') === 'JAX @ BAL|64.2% to win|projected BAL 24.6, JAX 19.3|Started 8:15 PM ET' && r.notes.join('|') === 'Forecast locked at kickoff', JSON.stringify(r));
    check('nfl hub (started): nothing is offered on it (no clearing price, no lean line, no bar), its row still opens its game page, and the ranks renumber the games still to start (#1 is now Sunday’s likeliest)', r.offers === 0 && r.links.join() === 'game.html?espn=401900001&league=americanfootball_nfl&date=20261105' && S.cards[0].id === SF_SEA && S.cards[0].rank === '#1 Likeliest' && S.cards.map(c => c.rank).join('|') === '#1 Likeliest|#2|#3|#4||#5' && S.order[0] === 'day:Sunday Nov 8', S.cards.map(c => c.rank).join('|'));
    await s.close();
    const X = sample(), g = X.games.find(x => x.id === JAX_BAL);
    Object.assign(g, { state: 'in', status: 'STATUS_IN_PROGRESS', detail: '8:21 - 2nd', score: { home: 10, away: 7 }, leanFrom: null, board: null }); g.projection.locked = true; X.checkedAt = '2026-11-06T02:00:30.000Z';
    const t = await open('picks.html?sport=NFL', { at: THU_9PM, nfl: X }), T = await hubOf(t.page), tr = rowOf(T, JAX_BAL);
    check('nfl hub (live): once the hourly run has written it, the live row carries the score from the data, away first, and the clock; the stamp says when scores were checked', tr.chip === 'Live' && tr.score === 'JAX 7–10 BAL' && tr.notes.join('|') === '8:21 - 2nd|Forecast locked at kickoff' && T.stamp.join('|') === 'Projected yesterday 2:02 PM ET|Scores checked 9:00 PM ET|On a bye: CAR, TB', JSON.stringify([tr.score, tr.notes, T.stamp]));
    await t.close();
    /* the minute timer: a page left open across a kickoff */
    const m = await open('picks.html?sport=NFL', { at: THU_810PM }), M0 = await hubOf(m.page);
    await m.page.evaluate(t2 => { window.EDGELINE_NOW = t2; window.EdgeLineNFL.tick(); }, THU_810PM + 6 * 60e3); await m.page.waitForTimeout(200);
    const M1 = await hubOf(m.page);
    check('nfl hub (clock): a game within 90 minutes says “Starts soon”; a page left open across the kickoff redraws on the minute timer and the game moves to its live row', cardOf(M0, JAX_BAL).badges.join('|') === 'NFL|Starts soon|Forecast' && cardOf(M0, JAX_BAL).state === 'soon' && cardOf(M0, JAX_BAL).foot[0] === 'Today 8:15 PM ET' && !cardOf(M1, JAX_BAL) && rowOf(M1, JAX_BAL).chip === 'Live', JSON.stringify(cardOf(M0, JAX_BAL).badges));
    await m.close();
    /* ESPN's fresher read (real data: js/browse.js reads the week from ESPN) beats the file's hour-old score */
    const week = JSON.parse(JSON.stringify(BF.nflWeek)), ev = week.events.find(e => e.id === JAX_BAL), comp = ev.competitions[0];
    comp.status.type = { state: 'in', completed: false, shortDetail: '2:00 - 3rd' }; comp.competitors.forEach(c => { c.score = c.homeAway === 'home' ? '17' : '14'; });
    const e2 = await open('picks.html?sport=NFL', { at: THU_9PM, nfl: X, real: true, wait: 900, espn: route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(/football\/nfl/.test(route.request().url()) ? week : { events: [] }) }) });
    const E2 = await hubOf(e2.page), er = rowOf(E2, JAX_BAL), ep = await panelOf(e2.page);
    check('nfl hub (live): with ESPN’s schedule read by the page, its fresher score and clock stand in for the file’s, and the hub still lists every game of ESPN’s week, so the schedule stays down', er.score === 'JAX 14–17 BAL' && er.notes[0] === '2:00 - 3rd' && ep.schedule === 0 && E2.cards.length === 6 && cardOf(E2, CHI_GB).event === 'game.html?espn=401900005&league=americanfootball_nfl&date=20261109', JSON.stringify([er.score, er.notes]));
    await e2.close();
    const Y = sample(); Y.games = Y.games.filter(x => x.id !== CHI_GB); Y.week.games = Y.games.length;
    const e3 = await open('picks.html?sport=NFL', { nfl: Y, real: true, wait: 900, espn: BF.espnRoute }), ep3 = await panelOf(e3.page);
    check('nfl hub: while the hub does not list every game of ESPN’s week (the week has turned, or a game is missing from the file), the schedule block shows too, so no game goes unlisted', ep3.hub && ep3.schedule === 1 && ep3.rows === 5 && (await e3.page.locator('#browse-panel .browse-game[data-game="espn-' + CHI_GB + '"]').count()) === 1, JSON.stringify([ep3.schedule, ep3.rows]));
    await e3.close();
  }

  /* ---------- finals: a right and a wrong forecast, a tie, a game never forecast; the record filled ---------- */
  const finals = () => {
    const X = sample(), g = id => X.games.find(x => x.id === id);
    const lock = x => { if (x.projection) x.projection.locked = true; x.leanFrom = null; x.board = null; };
    const fin = (id, home, away, call) => { const x = g(id); lock(x); Object.assign(x, { state: 'post', status: 'STATUS_FINAL', detail: 'Final', score: { home: home, away: away }, result: call ? { home: home, away: away, winner: home > away ? 'home' : away > home ? 'away' : 'tie', call: call, gradedAt: '2026-11-08T23:00:40.000Z' } : null }); };
    const live = (id, home, away, detail) => { const x = g(id); lock(x); Object.assign(x, { state: 'in', status: 'STATUS_IN_PROGRESS', detail: detail, score: { home: home, away: away } }); };
    fin(JAX_BAL, 24, 17, 'Win'); fin(DAL_PHI, 20, 27, 'Loss'); fin(ATL_NO, 20, 20, 'Push');
    live(SF_SEA, 10, 21, '4:10 - 4th'); live(KC_BUF, 13, 13, '9:02 - 3rd'); live(LV_DEN, 3, 6, '1:55 - 3rd');
    X.checkedAt = '2026-11-09T00:00:40.000Z';
    const tally = { w: 1, l: 1, p: 1, pending: 3, pct: 0.5, avgProb: 0.615 };
    X.record = { since: X.record.since, week: Object.assign({ label: 'Week 9' }, tally), season: tally };
    return X;
  };
  {
    const f = await open('picks.html?sport=NFL', { at: SUN_730PM, nfl: finals() }), F = await hubOf(f.page);
    const win = rowOf(F, JAX_BAL), loss = rowOf(F, DAL_PHI), push = rowOf(F, ATL_NO), nof = rowOf(F, LV_DEN), liveLean = rowOf(F, KC_BUF);
    check('nfl hub (results): started games run live first (by kickoff), then the finished ones newest day first under day headings, the likelier forecast first within a day', F.playedOrder.join('|') === [SF_SEA, LV_DEN, KC_BUF, 'day:Today Sun Nov 8', DAL_PHI, ATL_NO, 'day:Thursday Nov 5', JAX_BAL].join('|') && F.cards.map(c => c.id).join() === CHI_GB && F.cards[0].rank === '#1 Likeliest' && F.order.length === 1, F.playedOrder.join('|'));
    check('nfl hub (results): a right forecast: the final score, a green Right chip and “Forecast right”', win.state === 'final' && win.call === 'Win' && win.chip === 'Right' && /badge-won/.test(win.chipClass) && win.score === 'Final JAX 17–24 BAL' && win.notes.join('|') === 'Forecast right' && win.sel === 'Ravens to win' && win.meta[1] === '64.2% to win', JSON.stringify(win));
    check('nfl hub (results): a wrong forecast: the final score, a red Wrong chip and “Forecast wrong”', loss.call === 'Loss' && loss.chip === 'Wrong' && /badge-lost/.test(loss.chipClass) && loss.score === 'Final DAL 27–20 PHI' && loss.notes.join('|') === 'Forecast wrong' && loss.sel === 'Eagles to win', JSON.stringify(loss));
    check('nfl hub (results): a tie is a push, said as one and counted apart; a game that was never forecast shows its score and says nothing is counted', push.chip === 'Tie' && /badge-push/.test(push.chipClass) && push.notes.join('|') === 'A tie: a push, counted apart' && nof.sel === 'No forecast' && nof.chip === 'Live' && nof.notes.join('|') === '1:55 - 3rd|No forecast was made before kickoff, so nothing is counted' && nof.score === 'LV 6–3 DEN', JSON.stringify([push.notes, nof.notes]));
    check('nfl hub (results): a live game with a lean on the board carries that lean’s own live slot (js/live.js fills it), and no row offers anything', liveLean.live === 'p1' && liveLean.chip === 'Live' && liveLean.score === 'KC 13–13 BUF' && F.rows.every(r => r.offers === 0) && F.rows.length === 6, JSON.stringify(liveLean));
    check('nfl hub (record, filled): this week and the season to date since the log began, ties counted apart, the rate beside what the forecasts averaged, and no backfill', !F.recordEmpty && F.recordParts.join('|') === 'Forecasts, straight up|Week 9 1-1-1, 3 to come|Season to date 1-1-1 (the third number is ties)|50.0% right, where the forecasts averaged 61.5%|since Week 9, when the log began; nothing backfilled' && F.stamp[1] === 'Scores checked 7:00 PM ET', F.recordParts.join('|'));
    check('nfl hub (results): one line says what the block is and its order', F.how.length === 2 && /^A game leaves the list above at kickoff and lands here with its forecast as it stood then: live games first, then the finished ones, newest day first, each with whether the projected winner won\.$/.test(F.how[1]), F.how[1]);
    await f.close();
    /* a final the hourly run has not graded yet, a postponed game, and a week with every game started */
    const X = sample(), g = X.games.find(x => x.id === JAX_BAL), p = X.games.find(x => x.id === CHI_GB);
    Object.assign(g, { state: 'post', status: 'STATUS_FINAL', detail: 'Final', score: { home: 24, away: 17 }, leanFrom: null, board: null }); g.projection.locked = true;
    Object.assign(p, { status: 'STATUS_POSTPONED', detail: 'Postponed', projection: null, qb: null, injuries: null, weather: null, leanFrom: null });
    const u = await open('picks.html?sport=NFL', { at: FRI_9AM, nfl: X }), U = await hubOf(u.page), ur = rowOf(U, JAX_BAL), pr = rowOf(U, CHI_GB);
    check('nfl hub (results): a final not yet graded shows its score and says the grade comes at the next hourly check: the page never grades a forecast itself', ur.state === 'final' && ur.chip === 'Final' && /badge-final/.test(ur.chipClass) && ur.call === '' && ur.score === 'Final JAX 17–24 BAL' && ur.notes.join('|') === 'Graded straight up at the next hourly check', JSON.stringify(ur));
    check('nfl hub (results): a postponed game is not a card to follow and not a result: it sits last, marked Postponed, its forecast waiting for a new date', !cardOf(U, CHI_GB) && pr.chip === 'Postponed' && /badge-void/.test(pr.chipClass) && pr.notes.join('|') === 'Postponed: the forecast waits for a new date' && U.playedOrder[U.playedOrder.length - 1] === CHI_GB, JSON.stringify(pr));
    await u.close();
    const v = await open('picks.html?sport=NFL', { at: TUE_8AM }), V = await hubOf(v.page);
    check('nfl hub: once every game of the week has started there are no cards, and the hub says when the next week’s forecasts come', V.cards.length === 0 && V.none === 'Every game of Week 9 has started. Next week’s forecasts are posted on Tuesday morning.' && V.rows.length === 7 && V.rows.every(r => r.state === 'awaiting' && r.chip === 'Awaiting result'), V.none);
    await v.close();
  }

  /* ---------- no file, a sample file, a file with no week: the pages are exactly as they were ---------- */
  {
    const base = await open('picks.html?sport=NFL', { nfl: null }), B = await panelOf(base.page), baseErr = base.errs.slice();
    await base.close();
    const same = async (name, nfl) => { const x = await open('picks.html?sport=NFL', { nfl: nfl, ownErrors: true }), P = await panelOf(x.page), errs = x.errs.slice(); await x.close(); return { name: name, P: P, errs: errs, ok: !P.hub && P.text === B.text && P.strip === B.strip && P.how === B.how && P.schedule === 1 && P.rows === B.rows }; };
    const off = Object.assign(sample(), { week: null, games: [] }), samp = Object.assign(sample(), { sample: true }), empty = Object.assign(sample(), { games: [] });
    const cases = [await same('a sample file', samp), await same('a file with no week', off), await same('a week with no games', empty), await same('a file that sets nothing', '/* nothing */'), await same('a broken file', 'window.NFL_WEEK_DATA = {"games": 7, "week": {}, "sample": false};')];
    check('nfl hub (fallback): the suite’s own page, with no NFL week served, is the page as it was: no hub, the schedule block with its rows, the strip without an NFL week link', !B.hub && B.schedule === 1 && B.rows === 3 && B.strip === 'Best parlays|All leans|Watchlist|In progress and results|Market board' && B.hasData === 'undefined' && /every NFL game on the schedule, by start time/.test(B.how) && baseErr.length === 0, B.strip);
    check('nfl hub (fallback): a sample file, a file with no week, a week with no games, a file that sets nothing and a malformed file each leave the NFL tab word for word as it is without the hub, with no console error', cases.every(c => c.ok && c.errs.length === 0), cases.filter(c => !c.ok || c.errs.length).map(c => c.name + ' ' + c.errs.join(';')).join(' | '));
    const gone = await same('no file', 404);
    check('nfl hub (fallback): with the file missing altogether the page is the same again and no script fails; the one console line is the browser’s own note that the file was not found', gone.ok && gone.errs.every(e => !/^PAGEERROR/.test(e) && /404/.test(e)) && gone.errs.length <= 1, gone.errs.join(' | '));
    /* a file nobody has rewritten: the week it holds ended on Wednesday Nov 11; by Saturday it is no longer shown */
    const SAT = Date.parse('2026-11-14T12:00:00-05:00'), FRI = Date.parse('2026-11-13T12:00:00-05:00');
    const stale = await open('picks.html?sport=NFL', { at: SAT }), staleP = await panelOf(stale.page); await stale.close();
    const staleBase = await open('picks.html?sport=NFL', { at: SAT, nfl: null }), staleB = await panelOf(staleBase.page); await staleBase.close();
    const kept = await open('picks.html?sport=NFL', { at: FRI }), keptP = await panelOf(kept.page); await kept.close();
    check('nfl hub (fallback): a file left behind is not passed off as this week’s: three days after its week ended the tab is as it is without the hub; until then the finished week stays on view', !staleP.hub && staleP.text === staleB.text && staleP.strip === staleB.strip && keptP.hub, staleP.strip);
    const gp = await open('game.html?id=g5', { nfl: null }), gpStrip = await gp.page.evaluate(() => ({ forecast: !!document.getElementById('forecast'), strip: [...document.querySelectorAll('.subnav a')].filter(x => !x.hidden).map(x => x.textContent).join('|'), secs: [...document.querySelectorAll('#game-page .game-sec')].map(s => s.id).join() }));
    check('game page (fallback): with no NFL week an NFL game’s page has no forecast block and its strip has no Forecast link', !gpStrip.forecast && !/Forecast/.test(gpStrip.strip) && /^lean,sides/.test(gpStrip.secs), JSON.stringify(gpStrip));
    await gp.close();
  }

  /* ---------- the NFL tab itself: there whenever the hub has a week, with no NFL game on the board and ESPN unread ---------- */
  {
    const noNfl = route => route.fulfill({ contentType: 'text/javascript', body: BF.withAppended(sampleSrc(/market/.test(route.request().url()) ? 'sample-market.js' : 'sample-picks.js'), /market/.test(route.request().url()) ? 'window.MARKET_DATA.rows = window.MARKET_DATA.rows.filter(function (r) { return r.sport !== "NFL"; });' : 'window.PICKS_DATA.picks = window.PICKS_DATA.picks.filter(function (p) { return p.sport !== "NFL"; });') });
    const tabs = async nfl => { const x = await open('picks.html', { nfl: nfl }); await x.ctx.route('**/data/picks.js', noNfl); await x.ctx.route('**/data/market.js', noNfl); await x.page.reload(); await x.page.waitForTimeout(450); const r = await x.page.evaluate(() => ({ tabs: [...document.querySelectorAll('.browse-tabs a')].map(t => t.getAttribute('data-sport')).join(','), nfl: (document.querySelector('.browse-tabs a[data-sport="NFL"]') || { textContent: null }).textContent, next: window.EdgeLineNFL ? window.EdgeLineNFL.next() : null })); await x.page.click('.browse-tabs a[data-sport="NFL"]').catch(() => {}); await x.page.waitForTimeout(250); r.panel = await panelOf(x.page); r.lead = await x.page.evaluate(() => (document.querySelector('#browse-panel .browse-lead') || { textContent: '' }).textContent); await x.close(); return r; };
    const withHub = await tabs(undefined), without = await tabs(null);
    check('nfl hub (tab): with no NFL game on the board and no schedule read, the NFL tab is still there because the hub knows the week, saying when the next game is; without the hub there is no NFL tab, as before', /^,NFL,/.test(withHub.tabs) && withHub.nfl === 'NFLnext game tomorrow 8:15 PM' && withHub.next === Date.parse('2026-11-06T01:15Z') && !/NFL/.test(without.tabs), withHub.tabs + ' | ' + withHub.nfl + ' | ' + without.tabs);
    check('nfl hub (tab): opened that way the tab leads with a line that fits (no leans yet, the forecasts below), never “no games” above the week', withHub.panel.hub && withHub.lead === 'No NFL leans on the board yet. A lean is posted only where a side clears its bar at a pricing run; every game of the week is below with the model’s forecast.' && withHub.panel.leans.length === 0 && withHub.panel.schedule === 0, withHub.lead);
  }

  /* ---------- game.html: the same block for one NFL game ---------- */
  const blockOf = page => page.evaluate(() => {
    const sec = document.getElementById('forecast'); if (!sec) return null;
    const txt = n => (n ? n.textContent.replace(/\s+/g, ' ').trim() : null), all = s => Array.from(sec.querySelectorAll(s));
    const c = sec.querySelector('.nfl-game'), r = sec.querySelector('.nfl-played');
    return { h2: txt(sec.querySelector('h2')), secs: [...document.querySelectorAll('#game-page .game-sec')].map(s => s.id).join(), strip: [...document.querySelectorAll('.subnav a')].filter(x => !x.hidden).map(x => x.textContent).join('|'), how: txt(sec.querySelector('.how-to')), checks: all('.nfl-check').map(txt), state: sec.dataset.state,
      card: c ? { sel: txt(c.querySelector('.pick-selection')), selTag: c.querySelector('.pick-selection').tagName, metrics: [...c.querySelectorAll('.pick-metric')].map(txt), injOpen: !!(c.querySelector('details.nfl-inj') || {}).open, lean: [...c.querySelectorAll('.nfl-lean > span')].map(txt), leanHref: (c.querySelector('.nfl-lean-link') || { getAttribute: () => null }).getAttribute('href'), links: [...c.querySelectorAll('.pick-foot a')].map(x => txt(x)), rank: txt(c.querySelector('.rank')), qb: [...c.querySelectorAll('.nfl-qb > span')].map(txt) } : null,
      row: r ? { chip: txt(r.querySelector('.badge-state')), sel: txt(r.querySelector('.played-pick strong')), score: txt(r.querySelector('.played-score')), notes: [...r.querySelectorAll('.played-note')].map(txt), links: r.querySelectorAll('a').length } : null,
      parts: all('.nfl-parts li').map(txt), partsHow: txt(sec.querySelector('.nfl-parts p')), record: txt(sec.querySelector('.nfl-record')), more: (sec.querySelector('.nfl-week-link') || { getAttribute: () => null }).getAttribute('href'), moreText: txt(sec.querySelector('.nfl-week-link')), offers: sec.querySelectorAll('.nfl-from').length };
  });
  {
    const g = await open('game.html?id=g5'), G = await blockOf(g.page);
    check('game page: an NFL game of the week gets “Our forecast” after its lean and before every side, with a strip link in the same place', !!G && G.h2 === 'Our forecast' && /^lean,forecast,sides/.test(G.secs) && /Our lean\|Forecast\|Every side/.test(G.strip) && G.state === 'upcoming', G && G.secs + ' ' + G.strip);
    check('game page: the block is the hub’s card for that game, a heading level up, with the injuries open, no rank and no link to the page it is on; its posted lean points at the lean on this page', G.card.sel === 'Bills to win' && G.card.selTag === 'H3' && G.card.metrics.join('|') === 'To win61.2%|Margin4.0 pts|Give or take4.1 pts' && G.card.injOpen && G.card.rank === null && G.card.links.join('|') === 'Props' && G.card.lean.join('|') === 'Our lean|Buffalo -2.5|-110 at DraftKings' && G.card.leanHref === '#lean' && G.card.qb[1] === 'KC: Patrick Mahomes, listed questionable', JSON.stringify(G.card));
    check('game page: beside it, how the margin is built, part by part in points toward the home club, adding up to the projection and its give or take', G.parts.join('|') === 'Home field +2.1|Results against the schedule +1.2|EPA a play, offence net of defence +0.4|The quarterbacks +0.9|Rest 0.0|Other injuries -0.7|In all, the Bills by 4.0, give or take 4.1' && /^In points toward the Bills \(a minus is toward the Chiefs\), from the football model on nflverse data, with 8 and 8 games behind the two clubs\.$/.test(G.partsHow), G.parts.join('|'));
    check('game page: it says it is a forecast graded straight up, gives the held-out check once, the record, and the way back to the whole week', /It is a forecast, graded straight up: did the projected winner win\. The spread and the total are never offered\.$/.test(G.how) && G.checks.length === 1 && /calibrated against results/.test(G.checks[0]) && /^No forecast graded yet\./.test(G.record) && G.more === 'picks.html?sport=NFL#nfl-week' && G.moreText === 'Every Week 9 forecast', G.how);
    await g.close();
    const g6 = await open('game.html?id=g6'), G6 = await blockOf(g6.page);
    check('game page: a priced game with no lean shows each moneyline side’s clearing price beside the best price now', G6.card.sel === 'Eagles to win' && G6.card.lean.join('|') === 'Moneyline lean from|DAL +229, best now +120 at FanDuel|PHI +109, best now -140 at DraftKings' && G6.offers === 2, G6.card.lean.join('|'));
    await g6.close();
    const ge = await open('game.html?espn=401900001&league=americanfootball_nfl&date=20261105', { espn: BF.espnRoute, wait: 900 }), GE = await blockOf(ge.page);
    check('game page: a game outside the pricing window (ESPN’s page) gets its forecast too, joined by ESPN’s id, under “We price this game…”', !!GE && GE.card.sel === 'Ravens to win' && /^lean,forecast/.test(GE.secs) && GE.card.qb[2] === 'BAL: Tyler Huntley, in for Lamar Jackson (out), listed questionable himself' && (await ge.page.textContent('#game-page h1')) === 'Jacksonville Jaguars @ Baltimore Ravens', GE && GE.secs);
    await ge.close();
    const mm = await open('game.html?espn=401900005&league=americanfootball_nfl&date=20261109', { espn: BF.espnRoute, wait: 900 }), MM = await blockOf(mm.page);
    check('game page: a game on the margin model lists only the parts that model has (no EPA, no quarterbacks) and says which model it was', MM.parts.join('|') === 'Home field +2.3|Results against the schedule +0.4|Rest 0.0|Other injuries -0.9|In all, the Packers by 1.8, give or take 5.0' && /from the margin model, the fallback when nflverse’s data does not hold the game/.test(MM.partsHow), MM.parts.join('|'));
    await mm.close();
    const nba = await open('game.html?id=g0'), NB = await nba.page.evaluate(() => ({ forecast: !!document.getElementById('forecast'), strip: [...document.querySelectorAll('.subnav a')].filter(x => !x.hidden).map(x => x.textContent).join('|'), sport: (document.querySelector('.game-sub .badge-sport') || {}).textContent }));
    check('game page: a game of another sport has no forecast block, whatever the NFL file holds', !NB.forecast && !/Forecast/.test(NB.strip) && NB.sport !== 'NFL', JSON.stringify(NB));
    await nba.close();
    const gf = await open('game.html?id=g6', { at: SUN_730PM, nfl: finals() }), GF = await blockOf(gf.page);
    check('game page: once the game is over the block is the forecast as it stood at kickoff with whether it was right; no card, no clearing price, nothing to bet', GF.card === null && GF.row.chip === 'Wrong' && GF.row.sel === 'Eagles to win' && GF.row.score === 'Final DAL 27–20 PHI' && GF.row.notes.join('|') === 'Forecast wrong' && GF.offers === 0 && GF.state === 'final' && /as they stood at kickoff, when the forecast was locked/.test(GF.how) && /^Forecasts, straight up/.test(GF.record), JSON.stringify(GF.row));
    await gf.close();
  }

  /* ---------- 400px, reduced motion, both themes ---------- */
  const fits = page => page.evaluate(() => {
    const vw = document.documentElement.clientWidth, bad = [];
    document.querySelectorAll('#nfl-week *, #forecast *').forEach(n => {
      if (!n.getClientRects().length) return;
      const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
      if (r.right > vw + 0.5 || r.left < -0.5) bad.push('off screen: ' + n.className + ' "' + n.textContent.trim().slice(0, 30) + '"');
      if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && n.scrollWidth > n.clientWidth + 1) bad.push('cut: ' + n.className);
    });
    return { vw: vw, sw: document.documentElement.scrollWidth, bad: bad };
  });
  {
    const p = await open('picks.html?sport=NFL', { viewport: { width: 400, height: 860 } });
    await p.page.evaluate(() => document.querySelectorAll('#nfl-week details').forEach(d => { d.open = true; }));
    const P = await fits(p.page), cols = await p.page.evaluate(() => new Set([...document.querySelectorAll('#nfl-week .nfl-game')].map(c => Math.round(c.getBoundingClientRect().left))).size);
    check('nfl hub (400px): one card a row, every fold open, nothing past the edge of the screen, nothing cut off and no sideways scroll', P.sw <= 400 && P.bad.length === 0 && cols === 1, JSON.stringify(P).slice(0, 300));
    await p.close();
    const pf = await open('picks.html?sport=NFL', { viewport: { width: 400, height: 860 }, at: SUN_730PM, nfl: finals() }), PF = await fits(pf.page);
    /* a long note beside the forecast once squeezed it to nothing and the two overprinted: no two parts of a row may overlap */
    const rowsOk = await pf.page.evaluate(() => [...document.querySelectorAll('#nfl-week .nfl-played')].every(r => {
      const kids = [...r.children].filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect());
      const apart = kids.every((a, i) => kids.every((b, j) => i >= j || a.bottom <= b.top + 1 || b.bottom <= a.top + 1 || a.right <= b.left + 1 || b.right <= a.left + 1));
      const sel = r.querySelector('.played-pick strong');
      return apart && sel.scrollWidth <= sel.clientWidth + 1 && sel.getBoundingClientRect().height < 30;
    }));
    check('nfl hub (400px): the results rows stack inside the screen too: the forecast on one line, the score and its note on their own row, no part of a row printed over another', PF.sw <= 400 && PF.bad.length === 0 && rowsOk, JSON.stringify(PF).slice(0, 300));
    await pf.close();
    const pg = await open('game.html?id=g5', { viewport: { width: 400, height: 860 } }), PG = await fits(pg.page);
    check('game page (400px): the forecast block stacks its card over the parts list with no overflow', PG.sw <= 400 && PG.bad.length === 0 && (await pg.page.evaluate(() => { const c = document.querySelector('#forecast .nfl-game').getBoundingClientRect(), l = document.querySelector('#forecast .nfl-parts').getBoundingClientRect(); return l.top >= c.bottom - 1; })), JSON.stringify(PG).slice(0, 300));
    await pg.close();
    const wide = await open('picks.html?sport=NFL'), colsWide = await wide.page.evaluate(() => new Set([...document.querySelectorAll('#nfl-week .nfl-game')].map(c => Math.round(c.getBoundingClientRect().left))).size);
    const feet = await wide.page.evaluate(() => { const row = [...document.querySelectorAll('#nfl-week .nfl-game')].slice(1, 4); return new Set(row.map(c => Math.round(c.querySelector('.pick-foot').getBoundingClientRect().bottom))).size === 1 && new Set(row.map(c => Math.round(c.getBoundingClientRect().height))).size === 1; });
    check('nfl hub (desktop): three cards a row in the leans’ own grid, each row’s cards the same height with their feet in line', colsWide === 3 && feet && (await wide.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
    await wide.close();
    const rm = await open('picks.html?sport=NFL', { reduced: true }), RM = await rm.page.evaluate(() => { const cards = [...document.querySelectorAll('#nfl-week .nfl-game')]; return { n: cards.length, still: cards.every(c => { const cs = getComputedStyle(c); return cs.animationName === 'none' && cs.transitionDuration.split(',').every(t => parseFloat(t) === 0); }), fill: getComputedStyle(document.querySelector('#nfl-week .prob-fill')).transitionDuration }; });
    check('nfl hub (reduced motion): the hub adds no motion of its own: its cards neither animate in nor transition, and the bar never animates its width', RM.n === 7 && RM.still && parseFloat(RM.fill) === 0, JSON.stringify(RM));
    await rm.close();
    const tone = async scheme => { const x = await open('picks.html?sport=NFL', { scheme: scheme }); const r = await x.page.evaluate(() => { const c = document.querySelector('#nfl-week .nfl-game'), cs = getComputedStyle(c), k = getComputedStyle(c.querySelector('.pick-selection')), rec = getComputedStyle(document.querySelector('#nfl-week .nfl-record')); return { theme: document.documentElement.getAttribute('data-theme'), bg: cs.backgroundColor, ink: k.color, border: rec.borderTopColor, cards: document.querySelectorAll('#nfl-week .nfl-game').length }; }); await x.close(); return r; };
    const dark = await tone('dark'), light = await tone('light');
    check('nfl hub (themes): it renders in both themes from the tokens: the same seven cards, with the card surface, the ink and the hairline each changing with the theme', dark.cards === 7 && light.cards === 7 && dark.theme === 'dark' && light.theme === 'light' && dark.bg !== light.bg && dark.ink !== light.ink && dark.border !== light.border, JSON.stringify([dark, light]));
  }
  check('nfl hub: no console errors on any page of these checks (the missing-file page aside, whose one line is the browser’s own)', errors.length === 0, errors.slice(0, 4).join(' | '));
}
module.exports = { run };
