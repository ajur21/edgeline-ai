/* Behaviour checks for the home page as today's card (2026-11-11; the owner: "make the homepage better. the UI is
   terrible and the picks for parlays or plays of the day can also be props. its ANY play"). Run by scripts/behavior.js
   (npm test) with its server, clock and check().

   The page: the play and the parlay of the day open it, then one ranked list of every play (game leans and player props
   in one order, js/plays.js), the record, three ways in. Data is the sample fixtures (the suite's clock pinned to Wed
   2026-11-04, 4:45 PM ET: the day is locked on a game lean and a two-lean parlay) and variants built below: a player
   prop as the play of the day with a prop leg in the parlay, published through scripts/of-day.js itself so the shapes
   are the pipeline's; the morning before the lock (front-runners); the lock time passed with no locking run; a day
   closed with nothing named; a night with props and no lean; the morning after (yesterday's play leaves the card);
   no props file. The other pages that show the day's play are checked on the same variants: the digest, the leans
   page's best tickets and builder, the performance tile. */
const vm = require('vm');
const P = require('../js/plays.js');
const OFDAY = require('./of-day.js');
const PIPE = require('./update-data.js');

const LOCKED = '2026-11-04T20:42:00.000Z'; /* 3:42 PM ET: the afternoon run of the sample day */
const MORNING = Date.parse('2026-11-04T11:00:00-05:00'), LATE = Date.parse('2026-11-04T23:30:00-05:00'), NEXT = Date.parse('2026-11-05T09:00:00-05:00');
const LOCK_LINE = 'Locked 3:42 PM ET. One a day, never swapped.';
const FRONT_LINE = 'Front-runner, not final. It locks about 3:30 PM ET, once game lines and prop lines are both in, and is never swapped after.';
const DUE_LINE = 'Front-runner, not final. The lock run is due: it locks when that run lands, and is never swapped after.';

async function run(h) {
  const { browser, url, check, pinClock, sampleSrc, FIXTURE_NOW } = h;
  const read = (file, name) => { const s = { window: {} }; vm.runInNewContext(sampleSrc(file), s); return JSON.parse(JSON.stringify(s.window[name])); };
  const picks = () => read('sample-picks.js', 'PICKS_DATA'), props = () => read('sample-props.js', 'PROPS_DATA');
  const js = (name, obj) => 'window.' + name + ' = ' + JSON.stringify(obj) + ';\n';
  const errors = [];
  /* a page on its own context: the clock pinned, ESPN answered, data files swapped. opts: at, viewport, picks (object),
     props (object or 404), nfl (script body), ownErrors (a missing file logs a console error that is the point of the check) */
  const open = async (path, opts) => {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 } });
    await ctx.route('**/site.api.espn.com/**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"events":[]}' }));
    if (opts.picks) await ctx.route('**/data/picks.js', route => route.fulfill({ contentType: 'text/javascript', body: js('PICKS_DATA', opts.picks) }));
    if (opts.props === 404) await ctx.route('**/data/props.js', route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' }));
    else if (opts.props) await ctx.route('**/data/props.js', route => route.fulfill({ contentType: 'text/javascript', body: js('PROPS_DATA', opts.props) }));
    if (opts.nfl) await ctx.route('**/data/nfl-week.js', route => route.fulfill({ contentType: 'text/javascript', body: opts.nfl }));
    const page = await ctx.newPage(); await pinClock(page, opts.at);
    const errs = [], thrown = [];
    page.on('pageerror', e => { errs.push('PAGEERROR ' + e.message); thrown.push(e.message); });
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(url(path)); await page.waitForTimeout(opts.wait || 450);
    return { page, ctx, thrown, close: async () => { (opts.ownErrors ? thrown : errs).forEach(e => errors.push(path + ': ' + e)); await ctx.close(); } };
  };
  /* what the page shows, read the same way for every state */
  const playCard = pg => pg.evaluate(() => {
    const c = document.querySelector('#potd-host > *'), q = s => c.querySelector(s), t = s => (q(s) ? q(s).textContent : null);
    return { cls: c.className, kind: c.dataset.kind || null, state: c.dataset.state || null, eyebrow: t('.eyebrow'), badges: [...c.querySelectorAll('.pick-head-right .badge')].map(x => x.textContent).join('|'), title: t('h3'),
      name: t('.potd-player-name'), faces: c.querySelectorAll('.potd-player .face-img').length, toHit: t('.pick-metric .v'), why: t('.pick-rationale'), reasons: c.querySelectorAll('.potd-reasons li').length, lock: t('.potd-lock'),
      link: q('.pick-foot a.flip-btn') ? q('.pick-foot a.flip-btn').getAttribute('href') : null, add: c.querySelectorAll('.add-parlay').length, bd: c.querySelectorAll('[data-breakdown]').length, live: c.querySelectorAll('[data-live]').length, foot: t('.potd-state'), text: c.textContent };
  });
  const parlayCard = pg => pg.evaluate(() => {
    const c = document.querySelector('#parlay-host > *'), q = s => c.querySelector(s), t = s => (q(s) ? q(s).textContent : null), legs = [...c.querySelectorAll('.parlay-legs li')];
    return { cls: c.className, eyebrow: t('.eyebrow'), badges: [...c.querySelectorAll('.pick-head-right .badge')].map(x => x.textContent).join('|'), title: t('h3'), kinds: legs.map(l => l.dataset.kind).join(), picks: legs.map(l => l.querySelector('strong').textContent),
      propLink: q('li[data-kind="prop"] a.leg-prop') ? q('li[data-kind="prop"] a.leg-prop').getAttribute('href') : null, propFaces: c.querySelectorAll('li[data-kind="prop"] .leg-id .face-img').length, propLive: c.querySelectorAll('li[data-kind="prop"] [data-live]').length,
      leanMatchups: c.querySelectorAll('li[data-kind="lean"] .matchup-sm').length, why: t('.pick-rationale'), lock: t('.potd-lock'), bd: [...c.querySelectorAll('[data-breakdown]')].map(x => x.textContent + ':' + x.getAttribute('data-breakdown')).join(), load: c.querySelectorAll('[data-load-parlay]').length };
  });
  const tabs = pg => pg.evaluate(() => [...document.querySelectorAll('#board-tools [data-kind-tab]')].map(b => b.getAttribute('data-kind-tab') + ':' + b.querySelector('.play-tab-n').textContent + ':' + b.getAttribute('aria-pressed')).join(' '));
  const rowsOf = pg => pg.evaluate(() => [...document.querySelectorAll('#board-rows .play-row')].map(r => ({ kind: r.dataset.kind, sport: r.dataset.sport, rank: r.querySelector('.rank').textContent, sel: r.querySelector('.sel').textContent, pct: parseFloat(r.querySelector('.play-pct').textContent), href: r.getAttribute('href') })));
  const foot = pg => pg.evaluate(() => [...document.querySelectorAll('#board-foot > span')].map(s => s.textContent));

  /* the sample day as js/plays.js ranks it at the suite's clock: what the page must agree with */
  const CHECK = P.checkOf(props());
  const listAt = (D, PR, at) => P.all(D, PR, at, { check: P.checkOf(PR) });
  const NOW_LIST = listAt(picks(), props(), FIXTURE_NOW), N_LEAN = NOW_LIST.filter(x => x.kind === 'lean').length, N_PROP = NOW_LIST.filter(x => x.kind === 'prop').length;
  const PRICED = P.propPlays(props(), FIXTURE_NOW, { all: true, check: CHECK });

  /* ---------- the locked day: a game lean and a two-lean parlay (the sample as it stands) ---------- */
  const a = await open('index.html');
  const hero = await a.page.evaluate(() => ({ kick: document.querySelector('#plays .today-kick .eyebrow').textContent, date: document.getElementById('today-date').textContent, lock: document.getElementById('lock-clock').textContent,
    order: [...document.querySelectorAll('main > section')].map(s => s.id).join(), strip: [...document.querySelectorAll('.subnav a')].map(l => l.getAttribute('href')), missing: [...document.querySelectorAll('.subnav a')].filter(l => !document.querySelector(l.getAttribute('href'))).length }));
  check('home: the hero is today\'s card (its kicker, the Eastern date, the lock time), the sections run card, list, record, ways in, then the reference ones, and every strip link has its section',
    hero.kick === 'Today’s card' && hero.date === 'Wed Nov 4' && hero.lock === '3:30 PM ET' && hero.order === 'plays,board,record,more,field,how,subscribe,pricing,faq' && hero.strip.slice(0, 4).join() === '#plays,#board,#record,#more' && hero.strip.length === 9 && hero.missing === 0, JSON.stringify(hero));
  const lockedPlay = await playCard(a.page), lockedParlay = await parlayCard(a.page);
  check('home (locked): the play of the day is the card the pipeline locked, with its breakdown, the builder button, a live slot and the lock line, and no "Not final" mark',
    /\bpotd\b/.test(lockedPlay.cls) && !/potd-front|potd-prop/.test(lockedPlay.cls) && lockedPlay.kind === 'lean' && lockedPlay.title === 'Over 226.5' && lockedPlay.badges === 'NBA' && lockedPlay.lock === LOCK_LINE && lockedPlay.add === 1 && lockedPlay.bd === 1 && lockedPlay.live === 1, JSON.stringify(lockedPlay).slice(0, 400));
  check('home (locked): the parlay of the day is two game leans at one book with the leg breakdowns, the lock line and no "Not final" mark',
    !/potd-front/.test(lockedParlay.cls) && lockedParlay.kinds === 'lean,lean' && lockedParlay.picks.join('|') === 'Over 226.5|Colorado ML' && lockedParlay.badges === '2 legs' && lockedParlay.lock === LOCK_LINE && lockedParlay.bd === 'Leg breakdowns:p2,p3' && /Priced as one ticket at DraftKings\./.test(lockedParlay.why) && !/prop leg/.test(lockedParlay.why), JSON.stringify(lockedParlay));

  /* the ranked list: one order for leans and props, tabs and chips that narrow it, eight rows before "Show all" */
  const title = await a.page.textContent('#board-title'), how = await a.page.textContent('#board-how');
  const first = await rowsOf(a.page);
  check('home list: titled for what it holds, with one line on how to read it, and its first eight rows are the first eight of the one ranked list (js/plays.js), leans and props together',
    title === 'Every lean and prop, likeliest first' && /Game leans and player props in one order: today’s games first, then the chance to hit\./.test(how) && /The bar is our chance; the tick is what the price implies\./.test(how) && first.length === 8 && first.map(r => r.sel).join('|') === NOW_LIST.slice(0, 8).map(x => x.pick).join('|') && first.map(r => r.kind).join() === NOW_LIST.slice(0, 8).map(x => x.kind).join() && first.every((r, i) => Math.abs(r.pct - NOW_LIST[i].prob * 100) < 0.06),
    first.map(r => r.rank + ' ' + r.kind + ' ' + r.sel + ' ' + r.pct).join(' | '));
  const sports = []; NOW_LIST.forEach(x => { if (sports.indexOf(x.sport) < 0) sports.push(x.sport); });
  const chips = await a.page.evaluate(() => [...document.querySelectorAll('#board-tools [data-sport-chip]')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed')).join(' '));
  check('home list: three kind tabs with their counts and a chip per sport in the list, the first of each pressed', (await tabs(a.page)) === 'all:' + NOW_LIST.length + ':true lean:' + N_LEAN + ':false prop:' + N_PROP + ':false' && chips === ['All sports:true'].concat(sports.map(s => s + ':false')).join(' ') && N_LEAN >= 5 && N_PROP >= 5, (await tabs(a.page)) + ' / ' + chips);
  await a.page.click('#board-tools [data-kind-tab="prop"]');
  const propRows = await rowsOf(a.page), propMore = await a.page.textContent('#board-more [data-more]');
  check('home list: the Player props tab lists props only, numbered from #1, each linked to its player on the props board, and keeps the keyboard on the tab',
    propRows.length === Math.min(8, N_PROP) && propRows.every(r => r.kind === 'prop' && /^props\.html\?p=\d+&stat=\w+$/.test(r.href)) && propRows[0].rank === '#1' && propMore === 'Show all ' + N_PROP + ' props' && (await tabs(a.page)).endsWith('prop:' + N_PROP + ':true') && await a.page.evaluate(() => document.activeElement.getAttribute('data-kind-tab') === 'prop'), propMore);
  await a.page.click('#board-tools [data-kind-tab="lean"]');
  const leanRows = await rowsOf(a.page);
  check('home list: the Game leans tab lists leans only, each linked to its card on the leans page', leanRows.length === Math.min(8, N_LEAN) && leanRows.every(r => r.kind === 'lean' && /^picks\.html#p\d+$/.test(r.href)) && (await a.page.textContent('#board-more [data-more]')) === 'Show all ' + N_LEAN + ' leans');
  const nhl = NOW_LIST.filter(x => x.sport === 'NHL'), nhlLeans = nhl.filter(x => x.kind === 'lean').length;
  await a.page.click('#board-tools [data-sport-chip="NHL"]');
  const nhlRows = await rowsOf(a.page);
  check('home list: a sport chip narrows the list and the tab counts to that sport, and there is no "Show all" under eight rows',
    nhlRows.length === nhlLeans && nhlLeans > 0 && nhlRows.every(r => r.sport === 'NHL') && (await tabs(a.page)) === 'all:' + nhl.length + ':false lean:' + nhlLeans + ':true prop:' + (nhl.length - nhlLeans) + ':false' && (await a.page.locator('#board-more [data-more]').count()) === 0, await tabs(a.page));
  await a.page.click('#board-tools [data-sport-chip="all"]'); await a.page.click('#board-tools [data-kind-tab="all"]');
  await a.page.click('#board-more [data-more]');
  const whole = await a.page.evaluate(() => {
    const kids = [...document.getElementById('board-rows').children], rows = kids.filter(k => k.classList.contains('play-row')), btn = document.querySelector('#board-more [data-more]');
    let day = -1; const dayOf = []; kids.forEach(k => { if (k.classList.contains('day-divider')) day++; else if (k.classList.contains('play-row')) dayOf.push(day); });
    const pr = rows.map(r => parseFloat(r.querySelector('.play-pct').textContent));
    return { n: rows.length, dividers: day + 1, firstIsDivider: kids[0].classList.contains('day-divider'), firstDivider: kids[0].textContent, ranks: rows.map(r => r.querySelector('.rank').textContent).join(), ordered: pr.every((v, i) => i === 0 || dayOf[i] !== dayOf[i - 1] || v <= pr[i - 1] + 0.05), btn: btn.textContent, expanded: btn.getAttribute('aria-expanded'), focus: document.activeElement === btn };
  });
  const days = new Set(NOW_LIST.map(x => x.day)).size;
  check('home list: "Show all" lists every play under a heading per game day, today first, numbered through, likeliest first within a day, and the button stays focused and offers the way back',
    whole.n === NOW_LIST.length && whole.dividers === days && days >= 2 && whole.firstIsDivider && /^Today/.test(whole.firstDivider) && whole.ranks === NOW_LIST.map((x, i) => '#' + (i + 1)).join() && whole.ordered && whole.btn === 'Show the top 8' && whole.expanded === 'true' && whole.focus, JSON.stringify(Object.assign({}, whole, { ranks: whole.ranks.slice(0, 20) })));
  const openLeans = P.leanPlays(picks(), FIXTURE_NOW, { slipped: true }).length, slipped = openLeans - N_LEAN, short = PRICED.filter(x => !x.worth).length;
  const lines = await foot(a.page);
  check('home list: the foot counts what is listed and what is left out, with the way to each (leans that slipped under their bar, priced props with no edge)',
    lines.length === 3 && lines[0] === N_LEAN + ' game leans and ' + N_PROP + ' player props have an edge at their price right now.' && slipped > 0 && lines[1] === slipped + ' more open leans have slipped under their bar and are not listed here. All leans' && short > 0 && lines[2] === short + (short === 1 ? ' priced prop has no edge at its price and is' : ' priced props have no edge at their price and are') + ' not listed. Props board', JSON.stringify(lines));

  /* the record and the ways in */
  const record = await a.page.evaluate(() => ({ tiles: [...document.querySelectorAll('#record-grid .stat')].map(s => s.querySelector('.stat-label').textContent + '=' + s.querySelector('.stat-value').textContent + '=' + [...s.querySelectorAll('.stat-sub .meta > span')].map(x => x.textContent).join('|')), last: [...document.querySelectorAll('#record-last p')].map(p => p.textContent), link: document.querySelector('#record .head-actions a').getAttribute('href') }));
  check('home record: four tiles (the play of the day with how many were player props, the parlay, the leans of 30 days, the graded props) and the last play and parlay with their results',
    record.tiles.length === 4 && record.tiles[0] === 'Lean of the day=16-12-2=+4.10u|30 days|9 player props' && /^Parlay lean of the day=5-19=\+7\.90u\|24 days$/.test(record.tiles[1]) && /^Leans, last 30 days=54-47-5=/.test(record.tiles[2]) && /^Player props graded=22-17-1=56\.4% hit\|since Oct 28$/.test(record.tiles[3]) &&
    record.last.length === 2 && record.last[0] === 'Last lean of the day, Tue Nov 3: Paul George over 3.5 assists -105, won +0.95u.' && /^Last parlay lean of the day, Tue Nov 3: 2 legs at \+248, lost [-−]1\.00u\.$/.test(record.last[1]) && record.link === 'performance.html', JSON.stringify(record));
  const doors = await a.page.evaluate(() => [...document.querySelectorAll('#more .door')].map(d => d.dataset.door + '>' + d.getAttribute('href') + '>' + d.querySelector('.door-n').textContent));
  check('home ways in: the NFL week, the props board and every game, each a link with what it holds right now', doors.length === 3 && doors[0] === 'nfl>picks.html?sport=NFL>Every game of the week' && doors[1] === 'props>props.html>' + PRICED.length + ' props priced now' && doors[2] === 'games>games.html>48 markets priced in 8 games', JSON.stringify(doors));
  await a.close();
  const NW = read('sample-nfl-week.js', 'NFL_WEEK_DATA');
  const an = await open('index.html', { nfl: sampleSrc('sample-nfl-week.js') });
  check('home ways in: with an NFL week on file its door names the week and counts its games', (await an.page.textContent('#door-nfl-n')) === NW.week.label + ', ' + NW.week.games + ' games' && NW.week.games > 0, await an.page.textContent('#door-nfl-n'));
  await an.close();

  /* ---------- a player prop as the play of the day, and a prop leg in the parlay (published by scripts/of-day.js) ---------- */
  const propVariant = () => {
    const D = picks(), PR = props(), t = Date.parse(LOCKED), now = new Date(t), day = P.dayOf(t), check = P.checkOf(PR);
    const list = P.all(D, PR, t, { check: check }).filter(x => x.day === day), lean = list.find(x => x.kind === 'lean');
    let prop = null, par = null;
    for (const x of list.filter(x => x.kind === 'prop')) { const two = P.parlay([lean, x], day); if (two) { prop = x; par = two; break; } }
    if (!prop) throw new Error('home-checks: no game lean and player prop of the sample day share a book');
    const entry = OFDAY.propEntry(prop, day, now, check);
    const log = [{ id: lean.id, pick: lean.pick, event: lean.event, sport: lean.sport, commence: lean.commence }, entry];
    D.playOfDay = OFDAY.publicProp(entry, now, PIPE.OFDAY_DEPS);
    D.parlayOfDay = OFDAY.publicParlay({ type: 'parlay', id: 'parlay-' + day, date: day, status: 'pending', units: 0, loggedAt: LOCKED, book: par.book, legs: par.legs.map(l => l.id), legPrices: par.legPrices, decimal: par.decimal, odds: par.odds, fairProb: par.fairProb, ev: par.ev }, log, now);
    return { D: D, prop: prop, lean: lean, par: par, n: (check[prop.league] || check.all).n };
  };
  const V = propVariant(), cap = s => s.charAt(0).toUpperCase() + s.slice(1), propHref = 'props.html?p=' + V.prop.player.id + '&stat=' + V.prop.stat;
  const b = await open('index.html', { picks: V.D });
  const pc = await playCard(b.page);
  check('home (a prop play): the card is the player (name, face, team), his side and line as the heading, the chance as checked against the graded props and why, the board\'s reasons, the lock line and a link to him on the props board; no breakdown, builder button or live slot',
    /potd-prop/.test(pc.cls) && !/potd-front/.test(pc.cls) && pc.kind === 'prop' && pc.eyebrow === 'Lean of the day' && pc.badges === 'Player prop|' + V.prop.sport && pc.name === V.prop.player.name && pc.faces === 1 && pc.title === cap(V.prop.side) + ' ' + V.prop.line + ' ' + V.prop.statLabel.toLowerCase() &&
    pc.toHit === (V.prop.prob * 100).toFixed(1) + '%' && pc.why === 'The props board gives this side ' + (V.prop.stated * 100).toFixed(1) + '%. Graded props have landed nearer a coin flip than the board says, so it counts here at ' + (V.prop.prob * 100).toFixed(1) + '%, checked against ' + V.n + ' graded props.' && V.prop.stated > V.prop.prob &&
    pc.reasons >= 1 && pc.reasons <= 3 && pc.lock === LOCK_LINE && pc.link === propHref && pc.add === 0 && pc.bd === 0 && pc.live === 0, JSON.stringify(Object.assign({}, pc, { text: undefined })));
  const pp = await parlayCard(b.page);
  check('home (a prop leg): the parlay shows the prop leg with the player\'s face and a link to the props board and no live slot, the lean leg with its matchup, says how a prop leg counts and voids, and offers the lean\'s breakdown only, never the builder',
    pp.kinds === V.par.legs.map(l => l.kind).join() && pp.kinds.split(',').sort().join() === 'lean,prop' && pp.picks.join('|') === V.par.legs.map(l => l.pick).join('|') && pp.propLink === propHref && pp.propFaces === 1 && pp.propLive === 0 && pp.leanMatchups === 1 &&
    /A prop leg counts at its checked chance; if its player does not play, the ticket is void\.$/.test(pp.why) && pp.bd === 'Leg breakdown:' + V.lean.id && pp.load === 0 && pp.lock === LOCK_LINE, JSON.stringify(pp));
  await b.page.click('#parlay-host [data-breakdown]'); await b.page.waitForTimeout(300);
  check('home (a prop leg): the leg breakdown opens the lean\'s section alone', (await b.page.locator('#bd[open] .bd-pick').count()) === 1 && (await b.page.textContent('#bd .bd-title')) === V.lean.pick);
  await b.close();
  const bphone = await open('index.html', { picks: V.D, viewport: { width: 400, height: 860 } });
  const propPhone = await bphone.page.evaluate(() => ({ wide: document.documentElement.scrollWidth, cut: [...document.querySelectorAll('#potd-host .potd-player-name, #potd-host .potd-selection, #parlay-host .leg-prop strong')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent) }));
  check('home (a prop play, phone): at 400 wide nothing is wider than the screen and the player, his line and the prop leg are not cut', propPhone.wide <= 400 && propPhone.cut.length === 0, JSON.stringify(propPhone));
  await bphone.close();
  /* once his game is over the card says how it finished */
  const G = propVariant(); Object.assign(G.D.playOfDay, { status: 'graded', started: true, result: 'Win', actual: 2, units: 0.91 });
  const g = await open('index.html', { picks: G.D, at: LATE });
  const gc = await playCard(g.page);
  check('home (a prop play, graded): the card stays for the day with Won, what the player finished on and the units, still linked to the props board', gc.state === 'final' && /Won/.test(gc.foot) && new RegExp('Finished on 2 ' + G.prop.statLabel.toLowerCase()).test(gc.foot) && /\+0\.91u/.test(gc.foot) && gc.link === 'props.html?p=' + G.prop.player.id + '&stat=' + G.prop.stat && gc.add === 0, JSON.stringify(gc.foot));
  await g.close();
  /* the other pages on the same day */
  const bd = await open('digest.html', { picks: V.D });
  const digestText = await bd.page.evaluate(() => window.EdgeLineDigest.asText());
  check('digest (a prop play): Start here shows the player\'s card and the prop leg, and the copied text names the prop', (await bd.page.locator('#potd-host .potd-prop').count()) === 1 && (await bd.page.locator('#parlay-host .parlay li[data-kind="prop"]').count()) === 1 && digestText.includes('Lean of the day: ' + V.prop.pick + ' ' + (V.prop.odds > 0 ? '+' : '') + V.prop.odds) && !/front-runner/.test(digestText), digestText.split('\n').filter(l => /of the day/.test(l)).join(' / '));
  await bd.close();
  const bt = await open('picks.html#parlay', { picks: V.D });
  const tickets = await bt.page.evaluate(() => { const c = [...document.querySelectorAll('#parlays-host > .parlay')]; return { n: c.length, firstTitle: c[0].querySelector('.eyebrow').textContent, firstKinds: [...c[0].querySelectorAll('.parlay-legs li')].map(l => l.dataset.kind).sort().join(), firstLoad: c[0].querySelectorAll('[data-load-parlay]').length, second: c[1].querySelector('.eyebrow').textContent, tagged: document.querySelectorAll('#parlays-host .badge-potd').length }; });
  check('best tickets (a prop leg): the parlay of the day is no ranked ticket of game leans, so it leads the section as it was locked, unranked and not loadable; the ranked tickets follow from #1',
    tickets.n >= 2 && tickets.firstTitle === 'Parlay lean of the day' && tickets.firstKinds === 'lean,prop' && tickets.firstLoad === 0 && /^#1: /.test(tickets.second) && tickets.tagged === 0, JSON.stringify(tickets));
  await bt.page.click('#slip-load'); await bt.page.waitForTimeout(200);
  check('builder (a prop leg): "Load the parlay of the day" loads nothing and says why', /has a player prop leg, and the builder prices game leans only\. The whole ticket leads the best tickets on this page\./.test(await bt.page.textContent('#slip .slip-warn')) && (await bt.page.textContent('#slip-count')) === '0' && await bt.page.evaluate(() => window.EdgeLine.slip.get().length === 0), await bt.page.textContent('#slip'));
  await bt.close();

  /* ---------- before the lock: the front-runner, marked not final ---------- */
  const F = picks(); F.playOfDay = null; F.parlayOfDay = null;
  F.ofDay = { date: '2026-11-04', lockAt: '2026-11-04T20:30:00.000Z', playLocked: false, parlayLocked: false, closed: false, checkedAt: '2026-11-04T14:05:00.000Z', last: null };
  const FR = P.frontRunner(listAt(F, props(), MORNING), MORNING);
  const c = await open('index.html', { picks: F, at: MORNING });
  const fc = await playCard(c.page), fp = await parlayCard(c.page), fRows = await rowsOf(c.page);
  check('home (before the lock): the play of the day is the first of the ranked list, dashed, marked "Not final", and says when it locks and that it is never swapped after',
    !!FR.play && FR.play.kind === 'lean' && /potd-front/.test(fc.cls) && fc.badges === 'Not final|' + FR.play.sport && fc.title === FR.play.pick && fRows[0].sel === FR.play.pick && fc.lock === FRONT_LINE && FR.late === false, JSON.stringify({ cls: fc.cls, badges: fc.badges, title: fc.title, lock: fc.lock, first: fRows[0] }));
  check('home (before the lock): the parlay is the likeliest two plays from different games at one book, marked "Not final" with the same lock line',
    !!FR.parlay && /potd-front/.test(fp.cls) && fp.badges === 'Not final|2 legs' && fp.picks.join('|') === FR.parlay.legs.map(l => l.pick).join('|') && fp.lock === FRONT_LINE && new Set(FR.parlay.legs.map(l => l.gameKey)).size === 2, JSON.stringify(fp));
  check('home (before the lock): nothing is left on the record\'s last line when the file names no earlier play', await c.page.locator('#record-last').isHidden());
  await c.close();
  const cd = await open('digest.html', { picks: F, at: MORNING });
  const frontText = await cd.page.evaluate(() => window.EdgeLineDigest.asText());
  check('digest (before the lock): Start here shows the same front-runners, and the copied text says they are not final and when they lock',
    (await cd.page.locator('#potd-host .potd-front .badge-front').count()) === 1 && (await cd.page.locator('#parlay-host .potd-front .badge-front').count()) === 1 && (await cd.page.textContent('#potd-host .potd-selection')) === FR.play.pick && frontText.includes('Lean of the day: ' + FR.play.pick) && (frontText.match(/ · front-runner, not final: it locks about 3:30 PM ET/g) || []).length === 2, frontText.split('\n').filter(l => /of the day/.test(l)).join(' / '));
  await cd.close();
  /* the lock time has passed and the locking run has not landed (GitHub starts scheduled runs late) */
  const due = await open('index.html', { picks: F });
  const dc = await playCard(due.page);
  check('home (lock run late): past the lock time with the day still open the front-runner says the lock run is due', /potd-front/.test(dc.cls) && dc.lock === DUE_LINE && (await parlayCard(due.page)).lock === DUE_LINE, dc.lock);
  await due.close();

  /* ---------- the locking run has happened and named nothing ---------- */
  const N = picks(); N.playOfDay = null; N.parlayOfDay = null; N.ofDay = Object.assign({}, N.ofDay, { playLocked: false, parlayLocked: false, closed: true });
  const n = await open('index.html', { picks: N });
  const nc = await playCard(n.page), np = await parlayCard(n.page);
  check('home (closed with none): both slots say none was named and why, with no front-runner standing in', /potd-none/.test(nc.cls) && nc.title === 'No lean of the day today' && /had an edge at its price, so none was named\. Nothing is forced\./.test(nc.text) && /potd-none/.test(np.cls) && np.title === 'No parlay today' && (await n.page.locator('#plays .badge-front').count()) === 0, JSON.stringify([nc.title, np.title]));
  await n.close();
  const nd = await open('digest.html', { picks: N });
  check('digest (closed with none): the copied text says no play was named', (await nd.page.evaluate(() => window.EdgeLineDigest.asText())).includes('No lean of the day today: nothing had an edge at its price at the lock.') && (await nd.page.locator('#potd-host .potd-none').count()) === 1);
  await nd.close();

  /* ---------- a night with props and no lean: the list is the props', the front-runner a prop ---------- */
  const O = picks(); O.picks = []; O.playOfDay = null; O.parlayOfDay = null; delete O.ofDay;
  const ONLY = listAt(O, props(), FIXTURE_NOW);
  const o = await open('index.html', { picks: O });
  const oc = await playCard(o.page), oRows = await rowsOf(o.page), oFoot = await foot(o.page);
  check('home (props, no lean): the list is every prop with an edge, the tabs count no game lean, the foot points at the watchlist, and the front-runner is a player prop',
    ONLY.length > 0 && ONLY.every(x => x.kind === 'prop') && (await o.page.textContent('#board-title')) === 'Every lean and prop, likeliest first' && oRows.length === Math.min(8, ONLY.length) && oRows.every(r => r.kind === 'prop') && (await tabs(o.page)) === 'all:' + ONLY.length + ':true lean:0:false prop:' + ONLY.length + ':false' &&
    oFoot[0] === ONLY.length + ' player props have an edge at their price right now. No game lean is on the board. Watchlist' && /potd-prop/.test(oc.cls) && /potd-front/.test(oc.cls) && oc.badges === 'Not final|Player prop|' + ONLY[0].sport && oc.name === ONLY[0].player.name, JSON.stringify({ cls: oc.cls, badges: oc.badges, name: oc.name, foot: oFoot }));
  await o.page.click('#board-tools [data-kind-tab="lean"]');
  check('home (props, no lean): the Game leans tab says none is on the board and links the watchlist', /^No game lean is on the board right now\./.test(await o.page.textContent('#board-rows .board-empty')) && (await o.page.getAttribute('#board-rows .board-empty a', 'href')) === 'picks.html#watchlist' && (await o.page.locator('#board-rows .play-row').count()) === 0);
  await o.close();

  /* ---------- the morning after: yesterday's finished play and parlay leave the card for the record's last line ---------- */
  const Y = picks(), won = { status: 'graded', result: 'Win', units: 0.93, started: true };
  Object.assign(Y.playOfDay, won); Object.assign(Y.picks.find(p => p.id === 'p2'), won);
  Object.assign(Y.parlayOfDay, { status: 'graded', result: 'Loss', units: -1 }); Y.parlayOfDay.legs[0].result = 'Win'; Y.parlayOfDay.legs[1].result = 'Loss'; Y.parlayOfDay.legs.forEach(l => { l.started = true; });
  const y = await open('index.html', { picks: Y, at: NEXT });
  const yc = await playCard(y.page), yLast = await y.page.evaluate(() => [...document.querySelectorAll('#record-last p')].map(p => p.textContent));
  check('home (the next morning): yesterday\'s finished play and parlay are off the card (today\'s slot waits for its lock) and are the record\'s last line, ahead of the file\'s older one',
    (await y.page.textContent('#today-date')) === 'Thu Nov 5' && !/Over 226\.5/.test(yc.title || '') && yc.lock !== LOCK_LINE && yLast.length === 2 && yLast[0] === 'Last lean of the day, Wed Nov 4: Over 226.5 -108, won +0.93u.' && /^Last parlay lean of the day, Wed Nov 4: 2 legs at \+235, lost [-−]1\.00u\.$/.test(yLast[1]), JSON.stringify({ title: yc.title, eyebrow: yc.eyebrow, last: yLast }));
  await y.close();

  /* ---------- a phone, and a page with no props file ---------- */
  const ph = await open('index.html', { viewport: { width: 400, height: 860 } });
  const phone = await ph.page.evaluate(() => {
    const top = s => document.querySelector(s).getBoundingClientRect().top, shown = n => !!n && getComputedStyle(n).display !== 'none';
    return { wide: document.documentElement.scrollWidth, head: shown(document.getElementById('board-head')), kinds: [...document.querySelectorAll('#board-rows .play-kind')].filter(k => k.getBoundingClientRect().width > 0).length, rows: document.querySelectorAll('#board-rows .play-row').length,
      cut: [...document.querySelectorAll('#board-rows .play-row .sel, #board-rows .play-row .board-odds, #board-rows .play-row .play-pct')].filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent), cardsBeforeLead: top('#potd-host') < top('#plays p.lead'), labels: [...document.querySelectorAll('#board-rows .play-row')][0].querySelector('.board-edge .play-k').getBoundingClientRect().width > 0 };
  });
  check('home (phone): at 400 wide nothing is wider than the screen, the two cards come before the sentence about the rule, a row drops the column heads and the kind label, names its numbers itself and cuts nothing',
    phone.wide <= 400 && phone.rows === 8 && !phone.head && phone.kinds === 0 && phone.cut.length === 0 && phone.cardsBeforeLead && phone.labels, JSON.stringify(phone));
  await ph.close();
  const np2 = await open('index.html', { props: 404, ownErrors: true });
  const bare = await np2.page.evaluate(() => ({ kinds: [...new Set([...document.querySelectorAll('#board-rows .play-row')].map(r => r.dataset.kind))].join(), tile: document.querySelectorAll('#record-grid .stat')[3].textContent, door: document.getElementById('door-props-n').textContent, foot: [...document.querySelectorAll('#board-foot > span')].map(s => s.textContent) }));
  check('home (no props file): the page stands on the game leans alone, with no line about props in the foot, a 0-0 props tile and the door saying when lines arrive',
    bare.kinds === 'lean' && (await tabs(np2.page)) === 'all:' + N_LEAN + ':true lean:' + N_LEAN + ':false prop:0:false' && /^Player props graded0-0/.test(bare.tile) && bare.door === 'Lines arrive with the 3:30 PM ET run' && bare.foot.length === 2 && bare.foot[0] === N_LEAN + ' game leans have an edge at their price right now.' && np2.thrown.length === 0, JSON.stringify(bare));
  await np2.close();

  /* ---------- the performance page's tile ---------- */
  const pf = await open('performance.html');
  check('performance: the play-of-the-day tile says how many of the graded ones were player props', (await pf.page.locator('#feature-tiles .stat-sub').first().textContent()) === '+4.10u over 30 graded, last 30 days, 9 of them player props', await pf.page.locator('#feature-tiles .stat-sub').first().textContent());
  await pf.close();

  check('home checks: no page errors', errors.length === 0, errors.join(' | '));
}

module.exports = { run };
