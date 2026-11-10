/* Behaviour checks for the 2026-11-10 work, run by scripts/behavior.js (npm test) with its server, clock and check():
   start labels built on the site's clock, the bar wording, the held state and the availability flag, the clearing
   price, and the watchlist. The sample fixtures stand; scripts/fixtures/watch-fixtures.js adds a held game, a side on
   watch and a flagged lean to them where a check needs one. */
const PIPE = require('./update-data.js');
const WF = require('./fixtures/watch-fixtures.js');

/* the pipeline's own label for a start, read at a clock (publicPick writes `start` with its startLabel) */
const pipeLabel = (commence, at) => PIPE.publicPick({ id: 'x', commence: commence, odds: -110, modelProb: 0.55 }, new Date(at)).start;

async function run(h) {
  const { browser, url, check, pinClock, sampleSrc } = h;
  const MARKET = sampleSrc('sample-market.js'), PICKS = sampleSrc('sample-picks.js');
  const errors = [];
  const open = async (opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
    await ctx.route('**/site.api.espn.com/**', route => route.fulfill({ contentType: 'application/json', body: '{"events":[]}' }));
    for (const f of Object.keys(opts.data || {})) await ctx.route('**/data/' + f + '.js', route => route.fulfill({ contentType: 'text/javascript', body: opts.data[f] }));
    const page = await ctx.newPage(); await pinClock(page, opts.at);
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    return { ctx, page };
  };

  /* ---------- start labels (defect, 2026-11-10): the file's label is written at generation time, so after midnight ET a
     game played today still read "Tomorrow". Every page builds it from commence against EdgeLine.now() ---------- */
  const GAME = '2026-11-11T01:10:00Z'; /* Tue Nov 10, 8:10 PM ET, labelled "Tomorrow 8:10 PM ET" by the Monday afternoon run */
  const clocks = { eveningBefore: '2026-11-09T21:00:00Z', lateBefore: '2026-11-10T04:59:00Z', afterMidnight: '2026-11-10T05:01:00Z', twoAM: '2026-11-10T07:00:00Z', nextDay: '2026-11-11T05:30:00Z', earlier: '2026-11-07T12:00:00Z' };
  const a = await open();
  await a.page.goto(url('picks.html')); await a.page.waitForTimeout(400);
  const labels = await a.page.evaluate(([game, clocks]) => {
    const E = window.EdgeLine, keep = window.EDGELINE_NOW, out = {};
    Object.keys(clocks).forEach(k => { window.EDGELINE_NOW = Date.parse(clocks[k]); out[k] = E.startLabel({ commence: game, start: 'Tomorrow 8:10 PM ET' }); });
    window.EDGELINE_NOW = Date.parse(clocks.earlier);
    out.dated = E.startLabel({ commence: game }, { date: true });
    out.noCommence = E.startLabel({ start: 'Tomorrow 8:10 PM ET' });
    out.none = E.startLabel({});
    window.EDGELINE_NOW = keep;
    return out;
  }, [GAME, clocks]);
  check('labels: the start is read against the clock, so the game the file calls "Tomorrow" is Tomorrow until midnight ET, Today from 12:01 AM and Yesterday the day after',
    labels.eveningBefore === 'Tomorrow 8:10 PM ET' && labels.lateBefore === 'Tomorrow 8:10 PM ET' && labels.afterMidnight === 'Today 8:10 PM ET' && labels.twoAM === 'Today 8:10 PM ET' && labels.nextDay === 'Yesterday 8:10 PM ET' && labels.earlier === 'Tue 8:10 PM ET', JSON.stringify(labels));
  check('labels: the wording is the pipeline\'s own at every clock (scripts/update-data.js startLabel)', Object.keys(clocks).every(k => labels[k] === pipeLabel(GAME, clocks[k])), JSON.stringify(Object.keys(clocks).map(k => [labels[k], pipeLabel(GAME, clocks[k])])));
  check('labels: a row with no commence keeps the file\'s label, a game page can ask for the date, and nothing reads undefined', labels.noCommence === 'Tomorrow 8:10 PM ET' && labels.dated === 'Tue Nov 10, 8:10 PM ET' && labels.none === '', JSON.stringify(labels));
  await a.ctx.close();

  /* the pages, 12:30 AM ET on Sunday Nov 8: the sample's Sunday games are labelled "Sun 4:25 PM ET" in the files */
  const SUN = Date.parse('2026-11-08T00:30:00-05:00');
  const b = await open({ at: SUN });
  await b.page.goto(url('picks.html')); await b.page.waitForTimeout(500);
  const onPicks = await b.page.evaluate(() => ({
    file: window.PICKS_DATA.picks.find(p => p.id === 'p1').start,
    card: [...document.querySelectorAll('#picks-host article[data-id="p1"] .pick-front .pick-foot .meta > span')].map(s => s.textContent).join('|'),
    feet: [...document.querySelectorAll('#picks-host article .pick-front .pick-foot .meta > span:last-child')].map(s => s.textContent),
    board: [...new Set([...document.querySelectorAll('#market-host .mkt-start')].map(s => s.textContent.replace(/ \d.*$/, '')))].join()
  }));
  check('labels: after midnight the cards and the market board say Today for the games the files call "Sun"', onPicks.file === 'Sun 4:25 PM ET' && onPicks.card === 'NFL|Today 4:25 PM ET' && onPicks.feet.length === 4 && onPicks.feet.every(t => /^Today \d/.test(t)) && onPicks.board === 'Today', JSON.stringify(onPicks));
  await b.page.click('#view-table'); await b.page.waitForTimeout(150);
  check('labels: the table view\'s Start column reads the same', (await b.page.locator('#picks-host tbody tr td:nth-child(4)').allTextContents()).every(t => /^Today \d/.test(t)));
  await b.page.goto(url('games.html')); await b.page.waitForTimeout(400);
  const gameMeta = await b.page.locator('#g-g5 .game-meta > span').first().textContent();
  await b.page.goto(url('digest.html')); await b.page.waitForTimeout(400);
  const digest = await b.page.evaluate(() => ({ row: [...document.querySelectorAll('.digest-row[data-id="p1"] .leg-event > span')].pop().textContent, text: window.EdgeLineDigest.asText(), title: document.getElementById('digest-title').textContent }));
  await b.page.goto(url('game.html?id=g5')); await b.page.waitForTimeout(500);
  const gameSub = await b.page.textContent('#game-page .game-sub');
  await b.page.click('[data-search-open]'); await b.page.waitForTimeout(300); await b.page.keyboard.type('kansas city'); await b.page.waitForTimeout(250);
  const found = await b.page.locator('.search-option[href="game.html?id=g5"] .search-sub').textContent();
  check('labels: the Games page, the digest (its copied text and its title\'s day too), the game page and the search carry the same label',
    gameMeta === 'Today 4:25 PM ET' && digest.row === 'Today 4:25 PM ET' && /Kansas City @ Buffalo · Today 4:25 PM ET/.test(digest.text) && !/· Sun \d/.test(digest.text) && digest.title === 'The slate for Sunday, November 8' && /Today 4:25 PM ET/.test(gameSub) && /Today 4:25 PM ET/.test(found),
    JSON.stringify([gameMeta, digest.row, digest.title, gameSub, found]));
  await b.ctx.close();

  /* ---------- the bar wording (defect, 2026-11-10): "0.5 past of its bar" ---------- */
  const NO_PICKS = WF.NO_PICKS;
  const c = await open({ data: { picks: NO_PICKS } });
  await c.page.goto(url('index.html')); await c.page.waitForTimeout(500);
  const gap = await c.page.evaluate(() => { const E = window.EdgeLine, row = (edge, bar) => ({ modelProb: 0.6, odds: -110, edge: edge, bar: bar });
    return { past: E.barGap(row(0.1376, 0.1324)), short: E.barGap(row(0.0484, 0.057)), briefPast: E.barGap(row(0.1376, 0.1324), true), briefShort: E.barGap(row(0.0484, 0.057), true), floor: E.barGap(row(0.02, null), true), none: E.barGap({ odds: -110 }) }; });
  check('wording: a side past its bar reads "0.5 past its bar", a short one "0.9 short of its bar" (never "past of")', gap.past === '0.5 past its bar of 13.2 points' && gap.short === '0.9 short of its bar of 5.7 points' && gap.briefPast === '0.5 past its bar' && gap.briefShort === '0.9 short of its bar' && gap.floor === '1.0 short of the 3-point bar' && gap.none === '', JSON.stringify(gap));
  const cal = await c.page.textContent('#sub-preview-host .cal-meta'), pulse = await c.page.textContent('#parlay-host .pulse-lede');
  await c.page.goto(url('picks.html')); await c.page.waitForTimeout(400);
  const fieldLabels = await c.page.evaluate(() => [...document.querySelectorAll('#field-host .star[aria-label]')].map(g => g.getAttribute('aria-label')));
  check('wording: the home page\'s daily card, the no-parlay card and the edge field say it right', /Closest: .+, [+-][\d.]+ pts, [\d.]+ (past|short of) its bar$/.test(cal) && /Closest: .+ edge [+-][\d.]+, [\d.]+ (past|short of) its bar of [\d.]+ points\./.test(pulse) && fieldLabels.length > 0 && fieldLabels.every(t => /points, [\d.]+ (past|short of) (its bar of [\d.]+ points|the [\d.]+-point bar)$/.test(t)) && ![cal, pulse].concat(fieldLabels).some(t => /past of|short its/.test(t)), JSON.stringify([cal, pulse, fieldLabels[0]]));
  await c.ctx.close();

  /* ---------- "Why this lean" on a card that is not a lean (defect, 2026-11-10) ---------- */
  const d = await open({ data: { picks: NO_PICKS } });
  await d.page.goto(url('picks.html')); await d.page.waitForTimeout(400);
  const marketLinks = await d.page.locator('article.market-card .pick-front .flip-btn').allTextContents();
  await d.ctx.close();
  const d2 = await open();
  await d2.page.goto(url('picks.html')); await d2.page.waitForTimeout(400);
  const leanLinks = await d2.page.locator('#picks-host article.card.pick:not(.market-card) .pick-front .flip-btn').allTextContents();
  await d2.ctx.close();
  check('cards: a card that is not a lean links to "Why no lean"; a lean keeps "Why this lean"', marketLinks.length >= 6 && marketLinks.every(t => t === 'Why no lean') && leanLinks.length === 12 && leanLinks.every(t => t === 'Why this lean'), JSON.stringify([marketLinks, leanLinks.slice(0, 2)]));

  /* ---------- the no-parlay card (defect, 2026-11-10): "Colum…", "Florida Pant", "Tomorro" at a third of the page ---------- */
  const ONE_LEAN = PICKS + '\nwindow.PICKS_DATA.picks = window.PICKS_DATA.picks.filter(function (p) { return p.id === "p1"; }); window.PICKS_DATA.parlayOfDay = null;\n';
  for (const [w, label] of [[1280, 'desktop'], [400, 'phone']]) {
    const k = await open({ viewport: { width: w, height: 900 }, data: { picks: ONE_LEAN, market: WF.marketOnly(MARKET) } });
    await k.page.goto(url('picks.html')); await k.page.waitForTimeout(500);
    const legs = await k.page.evaluate(() => [...document.querySelectorAll('#parlays-host .pulse .parlay-legs li')].map(li => {
      const cut = [...li.querySelectorAll('.leg-pick strong, .leg-event, .leg-event > span, .leg-price, .badge')].filter(n => n.scrollWidth > n.clientWidth + 1 || n.getBoundingClientRect().right > li.getBoundingClientRect().right + 1).map(n => n.textContent);
      return { name: li.querySelector('.leg-pick strong').textContent, cut: cut };
    }));
    check('no-parlay card (' + label + '): the three sides, their games and starts are shown whole, nothing cut', legs.length === 3 && legs[0].name === 'Columbus Blue Jackets +1.5' && legs.every(l => l.cut.length === 0) && (await k.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), JSON.stringify(legs));
    await k.ctx.close();
  }

  /* ---------- held games (2026-11-10): the rows' `waiting`, read as data ---------- */
  const WHEN = 'Decided at the next NBA pricing run, tomorrow about 3:30 PM ET.';
  const e = await open({ data: { picks: NO_PICKS, market: WF.marketOnly(MARKET) } });
  await e.page.goto(url('picks.html')); await e.page.waitForTimeout(500);
  const heldState = await e.page.evaluate(() => {
    const E = window.EdgeLine, rows = window.MARKET_DATA.rows, find = pick => rows.find(r => r.pick === pick), s = E.marketSummary();
    const goalie = Object.assign({}, find('Columbus Blue Jackets ML'), { waiting: ['starting goalie not confirmed'], edge: 0.09 });
    return { celtics: E.chipStatus(find('Boston Celtics ML')), knicks: E.chipStatus(find('New York Knicks ML')), knicksHeld: E.isHeld(find('New York Knicks ML')), spread: E.chipStatus(find('Boston Celtics -1.5')), spreadEdge: find('Boston Celtics -1.5').edge, open: E.chipStatus(find('Nashville Predators ML')),
      note: E.heldNote(find('Boston Celtics ML')), shortNote: E.heldNote(find('New York Knicks ML')), none: E.heldNote(find('Nashville Predators ML')), goalie: E.chipStatus(goalie), goalieNote: E.heldNote(goalie),
      counts: [s.picks, s.held, s.clearOff, s.watch, s.heldGames].join() };
  });
  check('held: a row that carries `waiting` is held; past its bar it is Held, short of it still Watch; a side the pipeline rules out is never on watch',
    heldState.celtics === 'held' && heldState.knicks === 'watch' && heldState.knicksHeld === true && heldState.open === 'watch' && heldState.spreadEdge >= 0.015 && heldState.spread === 'none', JSON.stringify(heldState));
  check('held: the note gives the reason from the data and when it is decided (the sport\'s next pricing run before the start)',
    heldState.note === 'Clears its bar but is held: report not in for both clubs. ' + WHEN && heldState.shortNote === 'This game is held: report not in for both clubs. ' + WHEN && heldState.none === '', JSON.stringify([heldState.note, heldState.shortNote]));
  check('held: it is read from the field, not the sport: a hockey row with a reason is held the same way, and says so when no run is left before the start',
    heldState.goalie === 'held' && heldState.goalieNote === 'Clears its bar but is held: starting goalie not confirmed. No pricing run is left before the start, so nothing posts from this game.', heldState.goalieNote);
  const sub = await e.page.textContent('#market-sub');
  check('held: the board counts news-held and cap-held sides apart, and the held one out of the watch count',
    heldState.counts === '0,1,0,5,2' && /0 leans on the board; 1 side clears its bar but its game is held \(report not in for both clubs; decided at the next NBA pricing run, tomorrow about 3:30 PM ET\); 5 on watch, at least halfway to their bar\./.test(sub) && !/caps|held off the board/.test(sub), heldState.counts + ' ' + sub.slice(0, 330));
  const heldRow = await e.page.evaluate(() => {
    const tr = pick => [...document.querySelectorAll('#market-host tbody tr')].find(t => t.children[3] && t.children[3].textContent === pick), c = tr('Boston Celtics ML'), k = tr('New York Knicks ML'), sp = tr('Boston Celtics -1.5');
    return { cls: c.className, chip: c.children[9].textContent, title: c.querySelector('.badge-held').getAttribute('title'), why: c.querySelector('.mkt-why').textContent, knicks: k.children[9].textContent, knicksWhy: !!k.querySelector('.mkt-why'), spread: sp.children[9].textContent, start: c.querySelector('.mkt-start').textContent };
  });
  check('held: its market board row carries a Held chip, the reason under the game and when it is decided on the chip',
    /\bmkt-held\b/.test(heldRow.cls) && heldRow.chip === 'Held' && heldRow.why === 'Held: report not in for both clubs' && heldRow.title === 'Clears its bar but is held: report not in for both clubs. ' + WHEN && heldRow.knicks === 'Watch' && !heldRow.knicksWhy && heldRow.spread === 'No bet' && heldRow.start === 'Tomorrow 8:10 PM ET', JSON.stringify(heldRow));
  const heldCard = await e.page.evaluate(() => {
    const card = [...document.querySelectorAll('#picks-host article.market-card')].find(a => a.querySelector('.pick-selection').textContent === 'Boston Celtics ML');
    const other = [...document.querySelectorAll('#picks-host article.market-card')].find(a => a.querySelector('.pick-selection').textContent === 'Nashville Predators ML');
    return card && other ? { badge: card.querySelector('.pick-front .badge-status').textContent, cls: card.querySelector('.pick-front .badge-status').className, note: card.querySelector('.pick-front .pick-held').textContent, link: card.querySelector('.pick-front .flip-btn').textContent, back: card.querySelector('.pick-back .pick-rationale').textContent, factors: [...card.querySelectorAll('.pick-factors li')].map(l => l.textContent), otherNote: !!other.querySelector('.pick-held'), otherLink: other.querySelector('.pick-front .flip-btn').textContent } : null;
  });
  check('held: its card is chipped Held, says why and when under its numbers, and links to "Why it is held"; the back gives the held reason, not the caps',
    !!heldCard && heldCard.badge === 'Held' && /\bbadge-held\b/.test(heldCard.cls) && heldCard.note === 'Clears its bar but is held: report not in for both clubs. ' + WHEN && heldCard.link === 'Why it is held' && /Clears its bar of 13\.2 points but its game is held: report not in for both clubs\. Decided at the next NBA pricing run/.test(heldCard.back) && !/ten a day/.test(heldCard.back) && heldCard.factors.includes('Held: report not in for both clubs') && !heldCard.otherNote && heldCard.otherLink === 'Why no lean', JSON.stringify(heldCard));
  await e.page.goto(url('index.html')); await e.page.waitForTimeout(500);
  const homeHeld = { pulse: await e.page.textContent('#parlay-host .pulse-lede'), potd: await e.page.textContent('#potd-host .pick-rationale'), chip: await e.page.textContent('#potd-host .badge-status') };
  check('held: the home page\'s nearest-miss card and its market card say held, not "was not posted"', /None is on the board; 1 held past its bar; 5 on watch, at least halfway to their bar\./.test(homeHeld.pulse) && homeHeld.chip === 'Held' && /This side clears its bar of 13\.2 points, but its game is held: report not in for both clubs\. Decided at the next NBA pricing run, tomorrow about 3:30 PM ET\. Not a lean until then\./.test(homeHeld.potd) && !/was not posted/.test(homeHeld.potd), JSON.stringify(homeHeld));
  await e.page.goto(url('game.html?id=wheld0001')); await e.page.waitForTimeout(500);
  const gHeld = { lean: await e.page.textContent('#lean .game-none'), chip: await e.page.locator('#sides tr', { hasText: 'Boston Celtics ML' }).locator('.badge-held').count(), chips: await e.page.locator('#sides .badge-held').count(), how: await e.page.textContent('#sides .how-to'), next: await e.page.textContent('#game .gb-updated') };
  check('held: the game page says the side clears its bar and why the game is held, marks it Held among the sides, and names the sport\'s own next pricing run',
    gHeld.lean === 'No lean on this game: Boston Celtics ML clears its bar of 13.2 points, but the game is held: report not in for both clubs. ' + WHEN + ' It posts then only if it still clears its bar.' && gHeld.chip === 1 && gHeld.chips === 1 && /none is posted while the game is held \(report not in for both clubs\)/.test(gHeld.how) && /Next pricing tomorrow about 3:30 PM ET/.test(gHeld.next), JSON.stringify(gHeld));
  await e.page.goto(url('game.html?id=wheld0002')); await e.page.waitForTimeout(500);
  const gShort = await e.page.textContent('#lean .game-none');
  check('held: a held game whose closest side is short says both', gShort === 'No lean on this game: no side cleared its own bar. The closest, New York Knicks ML at +150 (FanDuel), is 5.0 short of its bar of 12 points. It clears its bar from +186. The game is held too: report not in for both clubs. ' + WHEN && (await e.page.locator('#sides .badge-held').count()) === 0, gShort);
  await e.page.goto(url('games.html')); await e.page.waitForTimeout(500);
  const gamesHeld = await e.page.evaluate(() => { const c = document.getElementById('g-wheld0001'), o = document.getElementById('g-wnsh00001'); return { note: c.querySelector('.game-held').textContent, cell: c.querySelector('.line-cell.st-held .badge-held').textContent, cells: c.querySelectorAll('.badge-held').length, other: !!o.querySelector('.game-held'), watch: document.getElementById('g-wheld0002').querySelector('.line-cell.st-watch .badge').textContent, short: document.getElementById('g-wheld0002').querySelector('.game-held').textContent }; });
  check('held: the Games page chips the held side Held, and the game says why and when under its title', gamesHeld.note === 'HeldReport not in for both clubs. ' + WHEN && gamesHeld.cell === 'Held' && gamesHeld.cells === 2 && !gamesHeld.other && gamesHeld.watch === 'Watch' && /^HeldReport not in for both clubs\./.test(gamesHeld.short), JSON.stringify(gamesHeld));
  await e.ctx.close();
  /* with the sample board: the sample's own side past its bar is kept off by the caps, the fixture's by the hold */
  const e2 = await open({ data: { market: WF.marketWith(MARKET) } });
  await e2.page.goto(url('picks.html')); await e2.page.waitForTimeout(500);
  const sub2 = await e2.page.textContent('#market-sub');
  check('held: with both kinds on the board the line says each, in its own words', /2 leans on the board; 1 side clears its bar but its game is held \(report not in for both clubs; decided at the next NBA pricing run, tomorrow about 3:30 PM ET\); 1 more side clears its bar but the caps keep it off the board \(one lean a game, ten a day, five a sport\); 9 on watch, at least halfway to their bar\./.test(sub2), sub2.slice(0, 420));
  await e2.ctx.close();
  const e3 = await open({ data: { picks: NO_PICKS } });
  await e3.page.goto(url('game.html?id=g7')); await e3.page.waitForTimeout(500);
  const capText = await e3.page.textContent('#lean .game-none');
  check('held: a side the caps kept off still says the caps, never a hold', capText === 'No lean on this game: NY Yankees +1.5 cleared its bar of 3 points but the caps kept it off the board: one lean a game, ten a day and five per sport.', capText);
  await e3.ctx.close();

  /* ---------- who plays changed after a lean was posted (the pipeline's availability flag) ---------- */
  const NOTE = 'Jamal Murray ruled out at 3:30 PM ET (official report), after this lean was posted at 4:30 PM ET; about 2.1 points of margin against this side on our numbers. It stays posted and is graded at the posted price.';
  const f = await open({ data: { picks: WF.picksFlagged(PICKS) } });
  await f.page.goto(url('picks.html')); await f.page.waitForTimeout(500);
  const flagCard = await f.page.evaluate(() => { const c = document.querySelector('#picks-host article[data-id="p6"]'), E = window.EdgeLine, P = window.PICKS_DATA.picks;
    return { chip: c.querySelector('.pick-front .pick-flag .badge-flag').textContent, cls: c.querySelector('.pick-front .badge-flag').className, note: c.querySelector('.pick-front .pick-flag > span:last-child').textContent, flags: document.querySelectorAll('#picks-host .pick-flag').length, unchanged: !!E.flagOf(P.find(p => p.id === 'p2')), none: !!E.flagOf(P.find(p => p.id === 'p1')), market: !!E.flagOf(Object.assign({ isMarket: true }, P.find(p => p.id === 'p6'))) }; });
  check('flag: a lean posted before who plays changed carries the chip and the pipeline\'s note on its card; an unchanged lean and a market card carry none',
    flagCard.chip === 'Who plays changed' && /\bis-against\b/.test(flagCard.cls) && flagCard.note === NOTE && flagCard.flags === 1 && !flagCard.unchanged && !flagCard.none && !flagCard.market, JSON.stringify(flagCard));
  await f.page.click('#view-table'); await f.page.waitForTimeout(150);
  const flagRow = await f.page.evaluate(() => { const tr = [...document.querySelectorAll('#picks-host tbody tr')].find(t => t.children[5].querySelector('strong').textContent === 'Denver +3.5'); return { chip: (tr.querySelector('.row-note .badge-flag') || {}).textContent, note: (tr.querySelector('.row-note > span:last-child') || {}).textContent, others: document.querySelectorAll('#picks-host tbody .row-note').length }; });
  check('flag: the table row shows it too', flagRow.chip === 'Who plays changed' && flagRow.note === NOTE && flagRow.others === 1, JSON.stringify(flagRow));
  await f.page.click('#view-cards'); await f.page.waitForTimeout(150);
  await f.page.evaluate(() => window.EdgeLine.openBreakdown(['p6'])); await f.page.waitForTimeout(250);
  const bdFlag = { head: await f.page.textContent('#bd .bd-flag'), who: await f.page.locator('#bd .bd-avail p').allTextContents() };
  await f.page.keyboard.press('Escape');
  await f.page.evaluate(() => window.EdgeLine.openBreakdown(['p2'])); await f.page.waitForTimeout(250);
  const bdSame = { flag: await f.page.locator('#bd .bd-flag').count(), who: await f.page.locator('#bd .bd-avail p').allTextContents() };
  await f.page.keyboard.press('Escape');
  check('flag: the breakdown leads with the flag and lists who the lean was posted knowing about; an unchanged lean says so with the time of the check',
    bdFlag.head === 'Who plays changed' + NOTE && bdFlag.who[0] === 'Posted on the 4:15 PM ET official injury report: Jamal Murray (Denver) questionable; Bradley Beal (Phoenix) out.' && bdFlag.who[1] === NOTE && bdSame.flag === 0 && bdSame.who[0] === 'Posted on the 8:45 AM ET official injury report: no one listed who moves the number.' && bdSame.who[1] === 'No change since, checked 4:00 PM ET.', JSON.stringify([bdFlag, bdSame]));
  await f.page.goto(url('game.html?id=g1')); await f.page.waitForTimeout(500);
  check('flag: the game page shows it on the lean\'s card and at the head of Why', (await f.page.locator('#lean article[data-id="p6"] .pick-flag .badge-flag').count()) === 1 && (await f.page.textContent('#why .why-flag')) === 'Who plays changed' + NOTE);
  await f.ctx.close();

  /* ---------- the price that would make a side a lean: the client's clearPrice against the pipeline's valueTo ---------- */
  const u = await open();
  await u.page.goto(url('journal.html')); await u.page.waitForTimeout(300); /* a page with no market file: the arithmetic alone */
  const probs = [], bars = [null, 0, 0.03, 0.045, 0.057, 0.0742, 0.11, 0.1324, 0.25];
  for (let i = 0; i <= 250; i++) probs.push(Math.round((0.004 * i) * 1e4) / 1e4);
  [0.6474, 0.7499, 0.5583, 0.63, 0.53, 0.5041, 0.9999, 0.0301].forEach(v => probs.push(v));
  const client = await u.page.evaluate(([probs, bars]) => ({ noData: !window.MARKET_DATA, grid: probs.map(p => bars.map(b => window.EdgeLine.clearPrice(p, b))), odd: [window.EdgeLine.clearPrice(null, 0.05), window.EdgeLine.clearPrice('', 0.05), window.EdgeLine.clearPrice('x', 0.05), window.EdgeLine.clearPrice(0.02, 0.03), window.EdgeLine.clearPrice(1.2, 0.03)] }), [probs, bars]);
  const diffs = [];
  probs.forEach((p, i) => bars.forEach((b, j) => { const want = PIPE.valueTo(p, b); if (client.grid[i][j] !== want) diffs.push([p, b, client.grid[i][j], want]); }));
  const at = (p, b) => client.grid[probs.indexOf(p)][bars.indexOf(b)];
  check('clearing price: the client\'s arithmetic is the pipeline\'s valueTo on ' + (probs.length * bars.length) + ' pairs of probability and bar, the floor standing in for a missing bar', client.noData && diffs.length === 0 && client.grid.some(r => r.some(v => v == null)) && client.grid.some(r => r.some(v => v > 0)) && client.grid.some(r => r.some(v => v < 0)), JSON.stringify(diffs.slice(0, 5)));
  check('clearing price: whole American prices on the side that still clears (-225, +107), an exact price kept (-150), even money written +100, and nothing when there is no finite answer',
    at(0.7499, 0.057) === -225 && at(0.5583, 0.0742) === 107 && at(0.63, 0.03) === -150 && at(0.53, 0.03) === 100 && client.odd.every(v => v === null), JSON.stringify([at(0.7499, 0.057), at(0.5583, 0.0742), at(0.63, 0.03), at(0.53, 0.03), client.odd]));
  await u.ctx.close();

  /* ---------- the watchlist (2026-11-10): a night with no lean ---------- */
  const w = await open({ data: { picks: NO_PICKS, market: WF.marketOnly(MARKET) } });
  await w.page.goto(url('picks.html')); await w.page.waitForTimeout(600);
  const wl = await w.page.evaluate(() => window.EdgeLine.watchlist().map(e => ({ pick: e.row.pick, game: e.row.eventId, kind: e.kind, more: e.more, price: e.price, held: e.held, prob: e.row.modelProb, bar: e.row.bar, status: e.row.status, open: window.EdgeLine.isOpen(e.row), day: window.EdgeLine.dayKey(e.row), id: e.pick.id })));
  check('watchlist: one entry a game, the side nearest its bar among those on watch, plus the held side past its bar; today first, then our probability',
    wl.map(e => e.pick).join('|') === 'Columbus Blue Jackets ML|Nashville Predators ML|Boston Celtics ML|New York Knicks ML' && new Set(wl.map(e => e.game)).size === 4 && wl.map(e => e.kind).join() === 'short,short,held,short' && wl.map(e => e.more).join() === '2,0,0,0' && wl.map(e => e.held).join() === 'false,false,true,true'
    && wl.every((e, i) => i === 0 || e.day > wl[i - 1].day || (e.day === wl[i - 1].day && e.prob <= wl[i - 1].prob)) && wl.map(e => e.id).join() === 'w0,w1,w2,w3', JSON.stringify(wl));
  check('watchlist: nothing started is listed, nor a side the pipeline rules out, and each price is the pipeline\'s valueTo on the same probability and bar',
    wl.every(e => e.open && e.status !== 'none') && !wl.some(e => e.game === 'wlive0001') && wl.filter(e => e.kind === 'short').every(e => e.price === PIPE.valueTo(e.prob, e.bar)) && wl.map(e => e.price).join() === '107,143,,186', JSON.stringify(wl.map(e => [e.price, PIPE.valueTo(e.prob, e.bar)])));
  const wPage = await w.page.evaluate(() => {
    const q = (s, r) => (r || document).querySelector(s), all = (s, r) => [...(r || document).querySelectorAll(s)], sec = q('#watch-sec'), cards = all('#watch-host article.card.pick');
    const card = c => ({ pick: q('.pick-selection', c).textContent, rank: q('.rank', c).textContent, chip: q('.pick-front .badge-status', c).textContent, clear: all('.pick-front .price-clear > span', c).map(x => x.textContent).join('|'), bar: all('.pick-front .pick-bar > span', c).map(x => x.textContent).join('|'), held: (q('.pick-front .pick-held', c) || {}).textContent || '', more: q('.pick-more a', c) ? q('.pick-more a', c).textContent + ' ' + q('.pick-more a', c).getAttribute('href') : '', game: (q('.pick-front a.pick-game-link', c) || { getAttribute: () => '' }).getAttribute('href'), foot: all('.pick-front .pick-foot .meta > span', c).map(x => x.textContent).join('|'), hit: q('.pick-metric.lead .v', c).textContent, link: q('.pick-front .flip-btn', c).textContent, lean: !!q('.add-parlay', c), kind: c.getAttribute('data-kind') });
    return { cards: cards.map(card), days: all('#watch-host .day-divider').map(d => d.textContent.trim()), lead: q('#watch-lead').textContent, how: q('#watch-sec .how-to').textContent, first: sec.compareDocumentPosition(q('#parlays')) & Node.DOCUMENT_POSITION_FOLLOWING ? 'watch' : 'parlays', isLead: sec.classList.contains('is-lead'),
      strip: all('.subnav a').map(a => a.textContent).join('|'), none: all('#parlays-host > *').map(n => n.className).join(), noneText: (q('#parlays-host .parlays-none') || {}).textContent, noneHref: (q('#parlays-host .parlays-none a') || { getAttribute: () => '' }).getAttribute('href'), size: q('#parlay-size').hidden, fallback: all('#picks-host article.market-card').length, wide: document.documentElement.scrollWidth <= window.innerWidth };
  });
  const c0 = wPage.cards[0] || {}, cHeld = wPage.cards[2] || {}, cKnicks = wPage.cards[3] || {};
  check('watchlist: with no open lean it leads the page and the strip, and the best tickets collapse to one sentence that links to it',
    wPage.first === 'watch' && wPage.isLead && /^Watchlist\|Best parlays\|All leans\|In progress and results\|Market board$/.test(wPage.strip) && wPage.none === 'parlays-none' && /^No tickets right now\. A parlay needs two leans from different games, and none is on the board\. What came closest is on the watchlist\.$/.test(wPage.noneText) && wPage.noneHref === '#watchlist' && wPage.size === true && wPage.fallback === 6, JSON.stringify([wPage.first, wPage.strip, wPage.none, wPage.noneText, wPage.fallback]));
  check('watchlist: the line above the list says what it is and that these are not leans, and counts held sides apart',
    /^No lean on the board right now\. 3 games have a side on watch, short of its bar; 1 game has a side past its bar that is held for news\. Today’s games first, then likeliest; none is a lean\.$/.test(wPage.lead) && /None is a lean\./.test(wPage.how) && /price that would clear/.test(wPage.how), wPage.lead);
  check('watchlist: rank chips in the visible order and a heading for each game day', wPage.cards.map(c => c.rank).join('|') === '#1 Likeliest|#2|#3|#4' && wPage.days.length === 2 && /^Today/.test(wPage.days[0]) && /^Tomorrow/.test(wPage.days[1]) && wPage.cards.map(c => c.kind).join() === 'short,short,held,short', JSON.stringify([wPage.cards.map(c => c.rank), wPage.days]));
  check('watchlist: an entry gives the side, its game (linked), the start, our probability, the bar and how far short, the price that clears it beside the best price now, and its game\'s other sides on watch',
    c0.pick === 'Columbus Blue Jackets ML' && c0.game === 'game.html?id=wcbj00001' && c0.foot === 'NHL|Today 7:40 PM ET' && c0.hit === '55.8%' && c0.bar === 'Bar 7.4 pts|0.6 short' && c0.clear === 'Clears its bar from +107|best now +104' && c0.more === '+2 more sides on watch in this game game.html?id=wcbj00001' && c0.chip === 'Watch' && c0.link === 'Why no lean' && !c0.lean && wPage.cards[1].more === '', JSON.stringify(c0));
  check('watchlist: a held side past its bar gives the reason and when it is decided in place of a price; a short side of a held game gives both',
    cHeld.pick === 'Boston Celtics ML' && cHeld.chip === 'Held' && cHeld.clear === '' && cHeld.held === 'Clears its bar but is held: report not in for both clubs. ' + WHEN && cHeld.link === 'Why it is held' && cKnicks.chip === 'Watch' && cKnicks.clear === 'Clears its bar from +186|best now +150' && cKnicks.held === 'This game is held: report not in for both clubs. ' + WHEN, JSON.stringify([cHeld, cKnicks]));
  /* 7:45 PM ET: the Columbus game has started, so its side leaves the list at the next check */
  const later = await w.page.evaluate(() => { window.EDGELINE_NOW = Date.parse('2026-11-04T19:45:00-05:00'); window.EdgeLine.checkStates(true); return { picks: [...document.querySelectorAll('#watch-host .pick-front .pick-selection')].map(n => n.textContent), list: window.EdgeLine.watchlist().map(e => e.row.pick), ranks: [...document.querySelectorAll('#watch-host .rank')].map(n => n.textContent) }; });
  check('watchlist: a game that starts leaves it at the next check, and the ranks close up', later.picks.join('|') === 'Nashville Predators ML|Boston Celtics ML|New York Knicks ML' && later.list.join('|') === later.picks.join('|') && later.ranks.join('|') === '#1 Likeliest|#2|#3', JSON.stringify(later));
  /* the same night on the cards that are not on the watchlist, the game page and the board */
  await w.page.goto(url('picks.html')); await w.page.waitForTimeout(500);
  const shortCards = await w.page.evaluate(() => [...document.querySelectorAll('#picks-host article.market-card')].map(c => ({ pick: c.querySelector('.pick-selection').textContent, short: !!c.querySelector('.pick-front .bar-short'), clear: [...c.querySelectorAll('.pick-front .price-clear .mono')].map(x => x.textContent).join('|') })));
  const rowsByPick = {}; WF.rows.forEach(r => { rowsByPick[r.pick] = r; });
  const fmt = o => (o > 0 ? '+' : '') + o;
  check('clearing price: every card that describes a side short of its bar gives the price that clears it, and a side past its bar gives none',
    shortCards.length === 6 && shortCards.some(c => c.short) && shortCards.every(c => { const r = rowsByPick[c.pick]; return c.short ? c.clear === fmt(PIPE.valueTo(r.modelProb, r.bar)) + '|' + fmt(r.odds) : c.clear === ''; }) && /; clears its bar from [+-]\d+$/.test(await w.page.locator('#market-host tbody tr', { hasText: 'Nashville Predators ML' }).locator('td').nth(8).getAttribute('title')), JSON.stringify(shortCards));
  await w.page.goto(url('game.html?id=wcbj00001')); await w.page.waitForTimeout(500);
  const gClear = await w.page.evaluate(() => ({ lean: document.querySelector('#lean .game-none').textContent, head: [...document.querySelectorAll('#sides thead th')].map(t => t.textContent).join('|'), col: [...document.querySelectorAll('#sides tbody tr')].map(tr => tr.children[2].querySelector('strong').textContent + '=' + tr.children[8].textContent), label: document.querySelector('#sides tbody tr').children[8].getAttribute('data-label') }));
  check('clearing price: the game page\'s "Our lean" paragraph and its table give it for each side short of its bar',
    gClear.lean === 'No lean on this game: no side cleared its own bar. The closest, Columbus Blue Jackets ML at +104 (FanDuel), is 0.6 short of its bar of 7.4 points. It clears its bar from +107.' && /\|Edge\|Clears from$/.test(gClear.head) && gClear.label === 'Clears from' && gClear.col.length === 6 && gClear.col.every(t => { const [pick, v] = t.split('='), r = rowsByPick[pick]; return v === fmt(PIPE.valueTo(r.modelProb, r.bar)); }), JSON.stringify(gClear));
  await w.page.goto(url('game.html?id=wheld0001')); await w.page.waitForTimeout(500);
  check('clearing price: a side already past its bar says so in the table', (await w.page.locator('#sides tbody tr', { hasText: 'Boston Celtics ML' }).locator('td').nth(8).textContent()) === 'Past its bar');
  await w.page.goto(url('index.html')); await w.page.waitForTimeout(500);
  const board = await w.page.evaluate(() => ({ title: document.getElementById('board-title').textContent, rows: [...document.querySelectorAll('#board-rows .board-row.board-watch')].map(r => ({ sel: r.querySelector('.sel').textContent, game: r.querySelector('.board-game').textContent, ev: [...r.querySelectorAll('.ev > span')].map(x => x.textContent).join('|'), need: r.querySelector('.board-need').textContent, href: r.getAttribute('href'), rank: r.querySelector('.rank').textContent })), all: document.querySelectorAll('#board-rows .board-row').length, text: document.getElementById('board-rows').textContent, foot: document.getElementById('board-foot').textContent }));
  check('home board: with no open lean and sides on watch it is titled for what it is and lists the watchlist with what each side needs',
    board.title === 'On watch, no lean yet' && board.all === 4 && board.rows.length === 4 && board.rows.map(r => r.sel).join('|') === wl.map(e => e.pick).join('|') && board.rows[0].game === 'Florida Panthers @ Columbus Blue Jackets' && board.rows[0].ev === 'Today 7:40 PM ET|Watch' && board.rows[0].need === 'Clears its bar from +107.' && board.rows[2].ev === 'Tomorrow 8:10 PM ET|Held' && board.rows[2].need === 'Report not in for both clubs; decided at the next NBA pricing run, tomorrow about 3:30 PM ET.' && board.rows.every(r => r.href === 'picks.html#watchlist') && !/No bet/.test(board.text) && /These are from the watchlist\./.test(board.foot), JSON.stringify(board));
  await w.page.goto(url('digest.html')); await w.page.waitForTimeout(500);
  const dg = await w.page.evaluate(() => ({ h2: document.querySelector('.digest-slate h2').textContent, rows: [...document.querySelectorAll('.digest-row .digest-pick strong')].map(n => n.textContent), bar: document.querySelector('.digest-row .digest-bar').textContent, chips: [...document.querySelectorAll('.digest-row .badge-status')].map(n => n.textContent).join(), lede: document.getElementById('digest-lede').textContent, text: window.EdgeLineDigest.asText(), top: document.getElementById('top3').tagName + document.querySelectorAll('#top3 > li').length + document.querySelector('#top3-head h2').children.length, tile: document.querySelectorAll('#digest-tiles .stat')[2].textContent }));
  check('digest: with no lean its slate is the same watchlist, with the clearing price and the held reason on the page and in the copied text',
    dg.h2 === 'The watchlist, likeliest first' && dg.rows.join('|') === wl.map(e => e.pick).join('|') && dg.bar === 'bar 7.4, 0.6 short, clears from +107' && dg.chips === 'Watch,Watch,Held,Watch' && /Below is the watchlist, not a card: the side nearest its bar in each of the 4 games with a side at least halfway there; 1 is past its bar and held for news\./.test(dg.lede)
    && /Watchlist \(the side nearest its bar in each game, not leans\):/.test(dg.text) && /Columbus Blue Jackets ML \+104 @ FanDuel .* 0\.6 short, clears its bar from \+107 · /.test(dg.text) && /Boston Celtics ML .* 0\.5 past · held: report not in for both clubs; decided at the next NBA pricing run, tomorrow about 3:30 PM ET · /.test(dg.text) && /^On watch5Sides at least halfway to their bar; 1 more past its bar, held for news$/.test(dg.tile), JSON.stringify([dg.h2, dg.rows, dg.bar, dg.chips, dg.tile, dg.lede]));
  check('digest: the three likeliest are a list of their own, not rows inside the heading', dg.top === 'OL30', dg.top);
  await w.ctx.close();
  /* phone width: the watchlist leads there too, nothing wider than the screen and no card text cut */
  const wp = await open({ viewport: { width: 400, height: 860 }, data: { picks: NO_PICKS, market: WF.marketOnly(MARKET) } });
  await wp.page.goto(url('picks.html')); await wp.page.waitForTimeout(600);
  const phone = await wp.page.evaluate(() => ({ wide: document.documentElement.scrollWidth, cards: document.querySelectorAll('#watch-host article.card.pick').length, cut: [...document.querySelectorAll('#watch-host .pick-front .pick-selection, #watch-host .pick-front .pick-event, #watch-host .pick-front .price-clear, #watch-host .pick-front .pick-note, #watch-host .pick-front .pick-bar, #watch-host .pick-front .pick-foot .meta')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent) }));
  await wp.page.goto(url('index.html')); await wp.page.waitForTimeout(500);
  const phoneBoard = await wp.page.evaluate(() => ({ wide: document.documentElement.scrollWidth, cut: [...document.querySelectorAll('#board-rows .board-watch .sel, #board-rows .board-watch .board-game, #board-rows .board-watch .board-need')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent) }));
  check('watchlist (phone): four cards and the home board at 400 wide, nothing wider than the screen and nothing cut', phone.wide <= 400 && phone.cards === 4 && phone.cut.length === 0 && phoneBoard.wide <= 400 && phoneBoard.cut.length === 0, JSON.stringify([phone, phoneBoard]));
  await wp.ctx.close();

  /* with leans on the board: today's order stands and the watchlist sits after the leans grid; a game with a lean is not on it */
  const x = await open({ data: { market: WF.marketWith(MARKET) } });
  await x.page.goto(url('picks.html')); await x.page.waitForTimeout(600);
  const withLeans = await x.page.evaluate(() => { const E = window.EdgeLine, kids = [...document.querySelector('#watch-sec').parentNode.children], at = id => kids.indexOf(document.getElementById(id));
    return { order: [at('parlays'), at('picks-host'), at('watch-sec'), at('played'), at('market')], isLead: document.getElementById('watch-sec').classList.contains('is-lead'), parlays: document.querySelectorAll('#parlays-host .parlay').length, size: document.getElementById('parlay-size').hidden, leans: document.querySelectorAll('#picks-host article.card.pick:not(.market-card)').length,
      strip: [...document.querySelectorAll('.subnav a')].map(a => a.textContent).join('|'), list: E.watchlist().map(e => e.row.pick + '@' + e.row.eventId), cards: document.querySelectorAll('#watch-host article.card.pick').length, lead: document.getElementById('watch-lead').textContent, sampleWatch: window.MARKET_DATA.rows.filter(r => r.eventId === 'g4' && E.rowStatus(r) === 'watch').length }; });
  check('watchlist: with open leans the page keeps its order (best tickets, the leans, then the watchlist, then In progress and results) and the strip follows',
    withLeans.order.every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1])) && !withLeans.isLead && withLeans.parlays > 0 && withLeans.size === false && withLeans.leans === 12 && withLeans.strip === 'Best parlays|All leans|Watchlist|In progress and results|Market board', JSON.stringify(withLeans));
  check('watchlist: a game that already has a lean gets no entry, whatever its other sides read',
    withLeans.sampleWatch === 1 && withLeans.list.join('|') === 'Columbus Blue Jackets ML@wcbj00001|Nashville Predators ML@wnsh00001|Boston Celtics ML@wheld0001|New York Knicks ML@wheld0002' && withLeans.cards === 4 && /^Beyond the leans above \(a game with one gets no second\): 3 games have a side on watch, short of its bar; 1 game has a side past its bar that is held for news\./.test(withLeans.lead), JSON.stringify([withLeans.list, withLeans.lead]));
  await x.ctx.close();
  const y = await open();
  await y.page.goto(url('picks.html')); await y.page.waitForTimeout(500);
  check('watchlist: with nothing on watch it says so in one line, never an empty section', (await y.page.locator('#watch-host article').count()) === 0 && (await y.page.textContent('#watch-lead')) === 'Nothing else is on watch: no game without a lean has a side at least halfway to its bar.' && (await y.page.locator('.subnav a[href="#watchlist"]').count()) === 1 && (await y.page.locator('#watchlist').isVisible()));
  await y.ctx.close();
  /* the sample board with no leans: its sides past their bars are kept off by the caps, and say so */
  const z = await open({ data: { picks: NO_PICKS } });
  await z.page.goto(url('picks.html')); await z.page.waitForTimeout(500);
  const caps = await z.page.evaluate(() => ({ kinds: window.EdgeLine.watchlist().map(e => e.row.pick + ':' + e.kind + ':' + e.more).join('|'), note: (document.querySelector('#watch-host article[data-kind="caps"] .pick-off') || {}).textContent, clear: document.querySelectorAll('#watch-host article[data-kind="caps"] .price-clear').length, lead: document.getElementById('watch-lead').textContent }));
  check('watchlist: a side past its bar that the caps keep off says the caps, with no price to wait for', /Over 226\.5:caps:0/.test(caps.kinds) && /NY Yankees \+1\.5:caps:1/.test(caps.kinds) && /Toronto ML:short:0/.test(caps.kinds) && caps.note === 'Clears its bar, but the caps keep it off the board: one lean a game, ten a day, five a sport.' && caps.clear === 0 && /2 games have a side on watch, short of its bar; 3 games have a side past its bar that the caps keep off the board\./.test(caps.lead), JSON.stringify(caps));
  await z.ctx.close();
  /* nothing on watch and no lean: the home board keeps its old fallback */
  const none = WF.rows.filter(r => r.status === 'none' && !r.waiting && r.eventId !== 'wlive0001');
  const v = await open({ data: { picks: NO_PICKS, market: WF.marketOnly(MARKET, none) } });
  await v.page.goto(url('index.html')); await v.page.waitForTimeout(500);
  check('home board: with nothing on watch it keeps the likeliest-sides fallback', (await v.page.textContent('#board-title')) === 'Worth a look tonight' && (await v.page.locator('#board-rows .board-watch').count()) === 0 && (await v.page.locator('#board-rows .board-row.board-market').count()) === 4);
  await v.page.goto(url('picks.html')); await v.page.waitForTimeout(500);
  check('watchlist: with no lean and nothing on watch it still leads with one line', (await v.page.textContent('#watch-lead')) === 'No lean on the board right now. No side of a game still to start is at least halfway to its bar either. Every side we priced is on the market board below.' && (await v.page.locator('#watch-host article').count()) === 0);
  await v.ctx.close();

  check('watch checks: no page errors', errors.length === 0, errors.join(' | '));
}

module.exports = { run };
