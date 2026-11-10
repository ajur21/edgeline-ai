/* Fixtures for scripts/watch-checks.js (2026-11-10): the states the sample files do not carry, added to them per check
   so the rest of the suite keeps its counts. The numbers are the real ones from the 2026-11-09 afternoon run, moved to
   the suite's week (its clock is pinned to Wed 2026-11-04, 4:45 PM ET):
   - a held NBA game (every row carries `waiting`) with a side past its bar, and a spread the pipeline rules out
     (status "none", no signal) at a price that would otherwise read as on watch;
   - a hockey game with three sides on watch, one with one, a held game whose best side is short of its bar, and a game
     that has already started;
   - an NBA lean flagged after posting (who plays changed) and one checked and unchanged. */
const implied = o => (o < 0 ? -o / (-o + 100) : 100 / (o + 100));
const r4 = n => Math.round(n * 1e4) / 1e4;
function game(eventId, sport, sportKey, away, home, commence, start, waiting) {
  return { eventId: eventId, sport: sport, league: sport, sportKey: sportKey, event: away + ' @ ' + home, home: home, away: away, commence: commence, start: start, waiting: waiting || null };
}
/* one market row as the pipeline writes it: the edge is our probability less what the best price implies, `past` the edge less the bar */
function row(g, marketKey, name, point, odds, book, modelProb, bar, status, prices) {
  const market = marketKey === 'h2h' ? 'Moneyline' : marketKey === 'spreads' ? (g.sport === 'NHL' ? 'Puck line' : 'Spread') : 'Total';
  const pick = marketKey === 'h2h' ? name + ' ML' : marketKey === 'spreads' ? name + ' ' + (point > 0 ? '+' : '') + point : name + ' ' + point;
  const edge = r4(modelProb - implied(odds));
  return Object.assign({}, g, { marketKey: marketKey, market: market, outcome: { name: name, point: point }, pick: pick, odds: odds, book: book, prices: prices || { [book]: odds }, books: 6, anchor: null, anchorShift: 0,
    modelProb: modelProb, edge: edge, ev: r4(modelProb * (odds < 0 ? 1 + 100 / -odds : 1 + odds / 100) - 1), marketFair: null, marketEdge: null, modelled: true, model: { margin: -4.4, total: 219.1, gp: 10, thin: false }, bar: bar, past: r4(edge - bar), pickId: null, status: status });
}
const HELD_WHY = 'report not in for both clubs';
const held = game('wheld0001', 'NBA', 'basketball_nba', 'Boston Celtics', 'Philadelphia 76ers', '2026-11-06T01:10:00Z', 'Tomorrow 8:10 PM ET', [HELD_WHY]);
const cbj = game('wcbj00001', 'NHL', 'icehockey_nhl', 'Florida Panthers', 'Columbus Blue Jackets', '2026-11-05T00:40:00Z', 'Today 7:40 PM ET');
const nsh = game('wnsh00001', 'NHL', 'icehockey_nhl', 'Nashville Predators', 'Los Angeles Kings', '2026-11-05T03:10:00Z', 'Today 10:10 PM ET');
const heldShort = game('wheld0002', 'NBA', 'basketball_nba', 'New York Knicks', 'Miami Heat', '2026-11-06T00:40:00Z', 'Tomorrow 7:40 PM ET', [HELD_WHY]);
const started = game('wlive0001', 'NHL', 'icehockey_nhl', 'Dallas Stars', 'Chicago Blackhawks', '2026-11-04T21:00:00Z', 'Today 4:00 PM ET');
const rows = [
  /* held, and 0.5 points past its 13.2 bar: last night's Celtics moneyline */
  row(held, 'h2h', 'Boston Celtics', null, -104, 'BetRivers', 0.6474, 0.1324, 'watch', { FanDuel: -120, DraftKings: -109, BetRivers: -104, Bovada: -105, BetMGM: -115 }),
  row(held, 'h2h', 'Philadelphia 76ers', null, 102, 'FanDuel', 0.3526, 0.1324, 'none'),
  /* 1.6 points of edge at +105 on a market with no signal: the pipeline says none, so it is never on watch */
  row(held, 'spreads', 'Boston Celtics', -1.5, 105, 'DraftKings', 0.5041, 0.03, 'none'),
  row(held, 'spreads', 'Philadelphia 76ers', 1.5, -110, 'FanDuel', 0.4959, 0.03, 'none'),
  /* three sides on watch in one game; the moneyline is the nearest its bar (0.6 short) */
  row(cbj, 'h2h', 'Columbus Blue Jackets', null, 104, 'FanDuel', 0.5583, 0.0742, 'watch', { FanDuel: 104, DraftKings: 100, BetMGM: -105 }),
  row(cbj, 'spreads', 'Columbus Blue Jackets', 1.5, -235, 'BetMGM', 0.7499, 0.057, 'watch'),
  row(cbj, 'totals', 'Over', 5.5, -130, 'DraftKings', 0.5826, 0.03, 'watch'),
  row(cbj, 'spreads', 'Florida Panthers', -1.5, 230, 'BetRivers', 0.2501, 0.057, 'none'),
  row(cbj, 'totals', 'Under', 5.5, 110, 'DraftKings', 0.4174, 0.03, 'none'),
  row(cbj, 'h2h', 'Florida Panthers', null, -110, 'BetRivers', 0.4417, 0.0742, 'none'),
  /* one side on watch, 3.7 short */
  row(nsh, 'h2h', 'Nashville Predators', null, 123, 'BetOnline.ag', 0.4869, 0.075, 'watch'),
  row(nsh, 'h2h', 'Los Angeles Kings', null, -135, 'theScore Bet', 0.5131, 0.075, 'none'),
  /* a held game whose best side is still 5 points short */
  row(heldShort, 'h2h', 'New York Knicks', null, 150, 'FanDuel', 0.47, 0.12, 'watch'),
  row(heldShort, 'h2h', 'Miami Heat', null, -170, 'DraftKings', 0.53, 0.12, 'none'),
  /* on watch when it was priced, but the game started at 4:00 PM ET */
  row(started, 'h2h', 'Chicago Blackhawks', null, 140, 'FanDuel', 0.47, 0.07, 'watch'),
  row(started, 'h2h', 'Dallas Stars', null, -160, 'DraftKings', 0.53, 0.07, 'none')
];
/* the pipeline's flag on a posted NBA lean (publicAvailability in scripts/update-data.js): p6 is Denver +3.5 at Phoenix, posted 4:30 PM ET on Nov 3 */
const flagged = {
  changed: true, swing: -2.1, checkedAt: '2026-11-04T20:30:00Z',
  note: 'Jamal Murray ruled out at 3:30 PM ET (official report), after this lean was posted at 4:30 PM ET; about 2.1 points of margin against this side on our numbers',
  changes: [{ side: 'away', name: 'Jamal Murray', from: 'Questionable', to: 'Out', fromMiss: 0.42, toMiss: 1, delta: 2.1, at: '2026-11-04T20:30:00Z', source: 'official', report: '3:30 PM ET' }],
  posted: { read: '2026-11-03T21:30:00Z', report: { source: 'official', label: '4:15 PM ET', at: '2026-11-03T21:15:00Z', url: null }, players: [{ side: 'away', name: 'Jamal Murray', status: 'Questionable', source: 'official', at: '2026-11-03T21:15:00Z' }, { side: 'home', name: 'Bradley Beal', status: 'Out', source: 'official', at: '2026-11-03T21:15:00Z' }] }
};
const unchanged = { changed: false, note: null, swing: null, changes: [], checkedAt: '2026-11-04T21:00:00Z', posted: { read: '2026-11-04T14:00:00Z', report: { source: 'official', label: '8:45 AM ET', at: '2026-11-04T13:45:00Z', url: null }, players: [] } };

/* the sample files with these added (appended JavaScript, like scripts/fixtures/browse-fixtures.js) */
const append = (src, js) => src + '\n' + js + '\n';
const marketWith = (src, extra) => append(src, 'window.MARKET_DATA.sample = false; Array.prototype.push.apply(window.MARKET_DATA.rows, ' + JSON.stringify(extra || rows) + ');');
const marketOnly = (src, only) => append(src, 'window.MARKET_DATA.sample = false; window.MARKET_DATA.rows = ' + JSON.stringify(only || rows) + '; window.MARKET_DATA.games = ' + new Set((only || rows).map(r => r.eventId)).size + '; window.MARKET_DATA.sports = ["NBA", "NHL"];');
const picksFlagged = src => append(src, 'window.PICKS_DATA.sample = false; window.PICKS_DATA.picks.forEach(function (p) { if (p.id === "p6") p.availability = ' + JSON.stringify(flagged) + '; if (p.id === "p2") p.availability = ' + JSON.stringify(unchanged) + '; });');
const NO_PICKS = 'window.PICKS_DATA = { sample: false, generatedAt: "2026-11-04T16:20:00Z", playOfDay: null, parlayOfDay: null, picks: [] };';

module.exports = { rows, held, cbj, nsh, heldShort, started, flagged, unchanged, HELD_WHY, marketWith, marketOnly, picksFlagged, NO_PICKS };
