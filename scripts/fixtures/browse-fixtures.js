/* Fixtures for the browse checks in scripts/behavior.js (league tabs, the sport weeks, game.html).
   ESPN's public scoreboard, trimmed to the fields js/browse.js reads, for the sample fixtures' week
   (the suite's clock is pinned to Wed 2026-11-04, 4:45 PM ET): the NFL's week 9, Thursday to Monday,
   holding the sample board's NFL games plus two it does not carry, and college football's week 10 with
   a MACtion Wednesday, a Saturday of twelve games (one with no time set) and the one game the board
   carries. Plus a college football market row set and a lean on it, so the College football tab and its
   game page are tested before the pipeline produces real NCAAF data (owner, 2026-11-08). */
const CDN = 'https://a.espncdn.com/i/teamlogos/';
function team(id, location, nick, abbr, opts) {
  opts = opts || {};
  return { id: String(id), location: location, name: nick, abbreviation: abbr, displayName: location + ' ' + nick, shortDisplayName: opts.short || location, color: opts.color || '333333', logo: opts.logo === false ? undefined : (opts.logo || CDN + (opts.league || 'nfl') + '/500/' + abbr.toLowerCase() + '.png') };
}
function event(id, date, away, home, opts) {
  opts = opts || {};
  const comp = (t, side) => Object.assign({ homeAway: side, team: t, score: opts.score ? String(opts.score[side]) : '0' }, opts.rank && opts.rank[side] ? { curatedRank: { current: opts.rank[side] } } : { curatedRank: { current: 99 } });
  return {
    id: String(id), date: date, name: away.displayName + ' at ' + home.displayName, shortName: away.abbreviation + ' @ ' + home.abbreviation, week: { number: opts.week || 9 },
    competitions: [{ id: String(id), date: date, timeValid: opts.timeValid !== false, neutralSite: false, venue: { fullName: opts.venue || 'Stadium' }, broadcasts: [{ names: [opts.tv || 'CBS'] }],
      status: { displayClock: '0:00', period: 0, type: { state: opts.state || 'pre', completed: opts.state === 'post', shortDetail: opts.detail || 'Scheduled' } },
      competitors: [comp(home, 'home'), comp(away, 'away')] }]
  };
}
const NFL = {
  JAX: team(30, 'Jacksonville', 'Jaguars', 'JAX'), BAL: team(33, 'Baltimore', 'Ravens', 'BAL'), DAL: team(6, 'Dallas', 'Cowboys', 'DAL'), PHI: team(21, 'Philadelphia', 'Eagles', 'PHI'),
  SF: team(25, 'San Francisco', '49ers', 'SF'), SEA: team(26, 'Seattle', 'Seahawks', 'SEA'), KC: team(12, 'Kansas City', 'Chiefs', 'KC'), BUF: team(2, 'Buffalo', 'Bills', 'BUF'),
  CHI: team(3, 'Chicago', 'Bears', 'CHI'), GB: team(9, 'Green Bay', 'Packers', 'GB')
};
const calendar = (entries) => [{ label: 'Regular Season', value: '2', entries: entries.map(([v, s, e]) => ({ label: 'Week ' + v, alternateLabel: 'Week ' + v, value: String(v), startDate: s, endDate: e })) }];
/* the NFL's week 9: Thursday's game and Monday's are outside the board (the sample board priced only Sunday) */
const nflWeek = {
  leagues: [{ id: '28', abbreviation: 'NFL', calendar: calendar([[9, '2026-11-04T08:00Z', '2026-11-11T07:59Z'], [10, '2026-11-11T08:00Z', '2026-11-18T07:59Z']]) }],
  season: { type: 2, year: 2026 }, week: { number: 9 },
  events: [
    event(401900001, '2026-11-06T01:15Z', NFL.JAX, NFL.BAL, { tv: 'Prime Video', venue: 'M&T Bank Stadium' }),
    event(401900002, '2026-11-08T18:00Z', NFL.DAL, NFL.PHI, { venue: 'Lincoln Financial Field' }),
    event(401900003, '2026-11-08T21:05Z', NFL.SF, NFL.SEA, { venue: 'Lumen Field' }),
    event(401900004, '2026-11-08T21:25Z', NFL.KC, NFL.BUF, { venue: 'Highmark Stadium' }),
    event(401900005, '2026-11-10T01:15Z', NFL.CHI, NFL.GB, { tv: 'ESPN, ABC', venue: 'Lambeau Field' })
  ]
};
const C = (id, loc, nick, abbr, short) => team(id, loc, nick, abbr, { short: short || loc, league: 'ncaa', logo: false });
const CFB = {
  M_OH: C(193, 'Miami (OH)', 'RedHawks', 'M-OH', 'Miami OH'), OHIO: C(195, 'Ohio', 'Bobcats', 'OHIO'), ALA: C(333, 'Alabama', 'Crimson Tide', 'ALA'), LSU: C(99, 'LSU', 'Tigers', 'LSU'),
  MIA: C(2390, 'Miami', 'Hurricanes', 'MIA'), ND: C(87, 'Notre Dame', 'Fighting Irish', 'ND'), USC: C(30, 'USC', 'Trojans', 'USC'), SC: C(2579, 'South Carolina', 'Gamecocks', 'SC'),
  OSU: C(194, 'Ohio State', 'Buckeyes', 'OSU'), MICH: C(130, 'Michigan', 'Wolverines', 'MICH'), UGA: C(61, 'Georgia', 'Bulldogs', 'UGA'), MISS: C(145, 'Ole Miss', 'Rebels', 'MISS'),
  TEX: C(251, 'Texas', 'Longhorns', 'TEX'), OU: C(201, 'Oklahoma', 'Sooners', 'OU'), ORE: C(2483, 'Oregon', 'Ducks', 'ORE'), WASH: C(264, 'Washington', 'Huskies', 'WASH'),
  PSU: C(213, 'Penn State', 'Nittany Lions', 'PSU'), IOWA: C(2294, 'Iowa', 'Hawkeyes', 'IOWA'), FLA: C(57, 'Florida', 'Gators', 'FLA'), TENN: C(2633, 'Tennessee', 'Volunteers', 'TENN'),
  KENT: C(2309, 'Kent State', 'Golden Flashes', 'KENT'), BGSU: C(189, 'Bowling Green', 'Falcons', 'BGSU'), NAVY: C(2426, 'Navy', 'Midshipmen', 'NAVY'), ARMY: C(349, 'Army', 'Black Knights', 'ARMY'),
  UCLA: C(26, 'UCLA', 'Bruins', 'UCLA'), STAN: C(24, 'Stanford', 'Cardinal', 'STAN')
};
/* college football's week 10: Wednesday's MACtion game, then a Saturday of twelve (noon, 3:30, 7:30 and one with no time set) */
const cfbWeek = {
  leagues: [{ id: '23', abbreviation: 'NCAAF', calendar: calendar([[10, '2026-11-02T08:00Z', '2026-11-09T07:59Z'], [11, '2026-11-09T08:00Z', '2026-11-16T07:59Z']]) }],
  season: { type: 2, year: 2026 }, week: { number: 10 },
  events: [
    event(401910001, '2026-11-05T00:00Z', CFB.M_OH, CFB.OHIO, { week: 10, tv: 'ESPN2' }),
    event(401910002, '2026-11-07T17:00Z', CFB.OSU, CFB.MICH, { week: 10, rank: { away: 3, home: 11 } }),
    event(401910003, '2026-11-07T17:00Z', CFB.PSU, CFB.IOWA, { week: 10 }),
    event(401910004, '2026-11-07T17:00Z', CFB.KENT, CFB.BGSU, { week: 10 }),
    event(401910005, '2026-11-07T17:00Z', CFB.NAVY, CFB.ARMY, { week: 10 }),
    event(401910006, '2026-11-07T20:30Z', CFB.ALA, CFB.LSU, { week: 10, rank: { away: 5, home: 14 }, venue: 'Tiger Stadium' }),
    event(401910007, '2026-11-07T20:30Z', CFB.UGA, CFB.MISS, { week: 10, rank: { away: 2, home: 9 } }),
    event(401910008, '2026-11-07T20:30Z', CFB.TEX, CFB.OU, { week: 10 }),
    event(401910009, '2026-11-07T20:30Z', CFB.USC, CFB.UCLA, { week: 10 }),
    event(401910010, '2026-11-08T00:30Z', CFB.MIA, CFB.ND, { week: 10, rank: { away: 1, home: 7 } }),
    event(401910011, '2026-11-08T00:30Z', CFB.SC, CFB.TENN, { week: 10 }),
    event(401910012, '2026-11-08T03:30Z', CFB.ORE, CFB.WASH, { week: 10 }),
    event(401910013, '2026-11-07T05:00Z', CFB.FLA, CFB.STAN, { week: 10, timeValid: false })
  ]
};
/* the College football rows the pipeline will write (sport "NCAAF", league "NCAAF"), on Alabama at LSU, and a lean on LSU +3.5 */
const cfbBase = { eventId: 'cfb1', sport: 'NCAAF', league: 'NCAAF', sportKey: 'americanfootball_ncaaf', event: 'Alabama Crimson Tide @ LSU Tigers', home: 'LSU Tigers', away: 'Alabama Crimson Tide', commence: '2026-11-07T20:30:00Z', start: 'Sat 3:30 PM ET', books: 6, anchor: 'Pinnacle', anchorShift: 0, modelled: true, model: { margin: -1.2, total: 52.5, gp: 9, thin: false } };
const cfbRow = (o) => Object.assign({}, cfbBase, o);
const cfbRows = [
  cfbRow({ marketKey: 'spreads', market: 'Spread', outcome: { name: 'LSU Tigers', point: 3.5 }, pick: 'LSU Tigers +3.5', odds: -110, book: 'FanDuel', prices: { FanDuel: -110, DraftKings: -112, BetMGM: -115 }, modelProb: 0.585, edge: 0.0612, ev: 0.117, marketFair: 0.52, marketEdge: -0.004, bar: 0.04, past: 0.0212, pickId: 'pcfb1', status: 'pick' }),
  cfbRow({ marketKey: 'h2h', market: 'Moneyline', outcome: { name: 'LSU Tigers', point: null }, pick: 'LSU Tigers ML', odds: 140, book: 'DraftKings', prices: { FanDuel: 135, DraftKings: 140, BetMGM: 130 }, modelProb: 0.44, edge: 0.0233, ev: 0.056, marketFair: 0.405, marketEdge: -0.012, bar: 0.09, past: -0.0667, pickId: null, status: 'none' }),
  cfbRow({ marketKey: 'totals', market: 'Total', outcome: { name: 'Under', point: 54.5 }, pick: 'Under 54.5', odds: -108, book: 'BetMGM', prices: { FanDuel: -110, DraftKings: -110, BetMGM: -108 }, modelProb: 0.5, edge: -0.0192, ev: -0.037, marketFair: 0.5, marketEdge: -0.019, bar: 0.03, past: -0.0492, pickId: null, status: 'none' }),
  cfbRow({ marketKey: 'totals', market: 'Total', outcome: { name: 'Over', point: 54.5 }, pick: 'Over 54.5', odds: -112, book: 'FanDuel', prices: { FanDuel: -112, DraftKings: -114, BetMGM: -115 }, modelProb: 0.5, edge: -0.0283, ev: -0.054, marketFair: 0.5, marketEdge: -0.028, bar: 0.03, past: -0.0583, pickId: null, status: 'none' }),
  cfbRow({ marketKey: 'h2h', market: 'Moneyline', outcome: { name: 'Alabama Crimson Tide', point: null }, pick: 'Alabama Crimson Tide ML', odds: -165, book: 'FanDuel', prices: { FanDuel: -165, DraftKings: -170, BetMGM: -175 }, modelProb: 0.56, edge: -0.0626, ev: -0.1, marketFair: 0.595, marketEdge: -0.028, bar: 0.09, past: -0.1526, pickId: null, status: 'none' }),
  cfbRow({ marketKey: 'spreads', market: 'Spread', outcome: { name: 'Alabama Crimson Tide', point: -3.5 }, pick: 'Alabama Crimson Tide -3.5', odds: -108, book: 'DraftKings', prices: { FanDuel: -110, DraftKings: -108, BetMGM: -110 }, modelProb: 0.415, edge: -0.1043, ev: -0.2, marketFair: 0.48, marketEdge: -0.039, bar: 0.04, past: -0.1443, pickId: null, status: 'none' })
];
const cfbPick = {
  id: 'pcfb1', sport: 'NCAAF', league: 'NCAAF', sportKey: 'americanfootball_ncaaf', event: 'Alabama Crimson Tide @ LSU Tigers', home: 'LSU Tigers', away: 'Alabama Crimson Tide', marketKey: 'spreads', outcome: { name: 'LSU Tigers', point: 3.5 },
  commence: '2026-11-07T20:30:00Z', start: 'Sat 3:30 PM ET', market: 'Spread', pick: 'LSU Tigers +3.5', odds: -110, book: 'FanDuel', prices: { FanDuel: -110, DraftKings: -112, BetMGM: -115 }, books: 6,
  modelProb: 0.585, ev: 0.117, confidence: 'Lean', basis: 'game', model: { margin: -1.2, total: 52.5, gp: 9, thin: false, reasons: { for: ['Projected margin 1.2 for Alabama against a 3.5-point number'], against: [] } },
  marketFair: 0.52, marketEdge: -0.004, rationale: 'Our probability is 58.5%, from the game data. FanDuel offers -110, which implies 52.4%. Not graded against other books’ prices.',
  factors: ['Best price -110 at FanDuel', 'Probability 58.5% from game data, not other books', 'Edge 6.1 points over the price'],
  breakdown: { tier: 'Lean', tierWhy: 'Its bar is 4.0 points: the model’s own margin of error on this side. It clears it by 2.1.', price: 'FanDuel offers -110, which implies 52.4%; we make it 58.5%.', support: ['LSU at home, 3.5 points against a projected 1.2'], risks: ['A thin conference sample'], notes: [], verdict: 'A lean on LSU +3.5.' },
  context: null, movement: null, status: 'pending', started: false, result: null, units: null, score: null, loggedAt: '2026-11-04T09:00:00-05:00', valueTo: -126, bar: 0.04, past: 0.0212, barParts: null, now: null, standing: null
};
/* the body of a data file with extra statements after it (the sample files assign window.MARKET_DATA / window.PICKS_DATA) */
function withAppended(src, js) { return src + '\n' + js + '\n'; }
function espnRoute(route) {
  const u = route.request().url();
  const body = /college-football/.test(u) ? cfbWeek : /football\/nfl/.test(u) ? nflWeek : { events: [] };
  return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
}
module.exports = { nflWeek, cfbWeek, cfbRows, cfbPick, withAppended, espnRoute };
