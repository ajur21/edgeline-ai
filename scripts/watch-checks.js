/* Behaviour checks for the 2026-11-10 work, run by scripts/behavior.js (npm test) with its server, clock and check():
   start labels built on the site's clock, the bar wording, the held state and the availability flag, the clearing
   price, and the watchlist. The sample fixtures stand; scripts/fixtures/watch-fixtures.js adds a held game, a side on
   watch and a flagged lean to them where a check needs one. */
const PIPE = require('./update-data.js');

/* the pipeline's own label for a start, read at a clock (publicPick writes `start` with its startLabel) */
const pipeLabel = (commence, at) => PIPE.publicPick({ id: 'x', commence: commence, odds: -110, modelProb: 0.55 }, new Date(at)).start;

async function run(h) {
  const { browser, url, check, pinClock } = h;
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
  const NO_PICKS = 'window.PICKS_DATA = { sample: false, generatedAt: "2026-11-04T16:20:00Z", playOfDay: null, parlayOfDay: null, picks: [] };';
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

  check('watch checks: no page errors', errors.length === 0, errors.join(' | '));
}

module.exports = { run };
