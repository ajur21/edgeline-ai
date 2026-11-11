/* Offline test of the NFL week hub's pipeline (scripts/nfl-week.js) against scripts/fixtures/nfl-week/ and
   scripts/fixtures/nflverse/. Run: node scripts/nfl-week-test.js (npm test runs it).
   The fixtures are real ESPN and National Weather Service responses read 2026-11-11 02:50 UTC, trimmed to the fields the
   script and the model read (research/handoff/nfl-hub/trim-fixtures.js): week 10 as four games (Washington at the
   Giants on Thursday, New England v Detroit in Munich, Buffalo at the Jets, the Chargers at Baltimore on Monday), week 11
   as two, six clubs' schedules, their injury listings with each player's game log, the standings and the forecast for
   three kickoffs. Buffalo at the Jets is the one game the nflverse fixture knows, so it runs on the football model and
   the others on the margin model; New England v Detroit has no schedule here, so it has no model at all.
   Finals, a game under way, a tie and a game called off are written over those responses in this file: the week had not
   been played when they were read. Nothing here touches the network (a fetch would fail the run). */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const W = require("./nfl-week.js");
const props = require("./nfl-props.js");
const model = require("./model.js");
const context = require("./context.js");
const nfl = require("./nfl.js");
const board = require("./update-data.js");
const fails = [];
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) fails.push(name); };
const FX = path.join(__dirname, "fixtures", "nfl-week");
const WSH_NYG = "401873052", NE_DET = "401873053", BUF_NYJ = "401873054", LAC_BAL = "401873065", IND_HOU = "401873066", NYJ_LAC = "401873074";
/* Eastern times that week (EST, UTC-5) */
const WED_10AM = "2026-11-11T15:00:00Z", THU_830PM = "2026-11-13T01:30:00Z", THU_1145PM = "2026-11-13T04:45:00Z", SUN_8PM = "2026-11-16T01:00:00Z",
  MON_1159PM = "2026-11-17T04:59:00Z", TUE_10AM = "2026-11-17T15:00:00Z", THU_NEXT = "2026-11-19T15:00:00Z";
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol);
const clone = x => JSON.parse(JSON.stringify(x));
const keys = o => Object.keys(o).join(",");
const final = (home, away) => ({ state: "post", completed: true, name: "STATUS_FINAL", detail: "Final", score: { home: home, away: away } });

/* ---------- sources: the fixture files, with a week's games rewritten per test and every request counted ---------- */
const baseWeek = props.fixtureSource(FX), baseCtx = W.fixtureCtx(FX);
/* edits: { <event id>: { state, completed, name, detail, score: { home, away }, date } } written over ESPN's week;
   opt.later: a week the fixtures do not hold comes back with no games (a later week of the season), not unreadable */
function weekSource(edits, opt) {
  let n = 0;
  return Object.assign({}, baseWeek, {
    scoreboard: async () => { n++; return baseWeek.scoreboard("20261111"); }, /* the season's calendar, whatever the day */
    week: async function (season, type, wk) {
      n++;
      const sb = await baseWeek.week(season, type, wk); if (!sb) return opt && opt.later ? { season: { type: type, year: season }, week: { number: wk }, events: [] } : null;
      const c = clone(sb);
      c.events.forEach(function (e) {
        const x = (edits || {})[e.id]; if (!x) return;
        const comp = e.competitions[0];
        comp.status.type = { name: x.name, state: x.state, completed: !!x.completed, shortDetail: x.detail || "" };
        if (x.date) { e.date = x.date; comp.date = x.date; }
        if (x.score) comp.competitors.forEach(function (t) { t.score = String(x.score[t.homeAway]); });
      });
      return c;
    },
    count: () => n
  });
}
/* the model's ESPN reads, counted; `injuries` adds listings to a club's report (the inputs changing between two runs) */
function ctxSource(opt) {
  let n = 0; const o = {};
  Object.keys(baseCtx).forEach(function (k) { o[k] = async function () { n++; return baseCtx[k].apply(null, arguments); }; });
  if (opt && opt.injuries) o.injuries = async function () {
    n++;
    const inj = clone(await baseCtx.injuries());
    Object.keys(opt.injuries).forEach(function (club) { const t = inj.injuries.find(x => x.displayName === club); opt.injuries[club].forEach(i => t.injuries.push({ status: i.status, athlete: { displayName: i.name, position: { abbreviation: i.pos }, links: [] } })); });
    return inj;
  };
  o.count = () => n;
  return o;
}
const nflFetcher = nfl.fixtureFetcher(path.join(__dirname, "fixtures", "nflverse"));
const run = (dir, now, o) => W.run(Object.assign({ out: dir, now: now, week: weekSource((o && o.edits) || null), ctx: ctxSource(o && o.ctx), nflFetcher: nflFetcher }, (o && o.opts) || {}));
const readData = dir => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(dir, "nfl-week.js"), "utf8"), sb); return sb.window.NFL_WEEK_DATA; };
const readLog = dir => JSON.parse(fs.readFileSync(path.join(dir, "nfl-week-log.json"), "utf8"));
const bytes = dir => fs.readFileSync(path.join(dir, "nfl-week.js"), "utf8") + "\u0000" + fs.readFileSync(path.join(dir, "nfl-week-log.json"), "utf8");
const gameOf = (d, id) => d.games.find(g => g.id === id);
const tmpDirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-nflweek-")); tmpDirs.push(d); return d; };

(async () => {
  /* the whole file runs with the network cut: this feature spends nothing, and the test must not reach ESPN either */
  const realFetch = global.fetch, asked = [];
  global.fetch = async function (url) { asked.push(String(url)); throw new Error("the nfl-week test must not touch the network: " + url); };

  /* ---------- a week's forecasts and the file's shape ---------- */
  const A = tmp();
  /* the board on disk: Buffalo at the Jets priced (moneyline, spread and total rows), and a lean posted on the Jets */
  const row = (mk, name, point, odds, book) => ({ eventId: "ab12cd34ef56ab12cd34ef56ab12cd34", sport: "NFL", sportKey: W.KEY, home: "New York Jets", away: "Buffalo Bills", commence: "2026-11-15T18:00:00Z", marketKey: mk, outcome: { name: name, point: point }, pick: name + (mk === "h2h" ? " ML" : " " + point), odds: odds, book: book, pricedAt: "2026-11-11T14:02:00.000Z" });
  const market = { sample: false, generatedAt: "2026-11-11T14:05:00.000Z", rows: [row("spreads", "New York Jets", 2.5, -110, "BetMGM"), row("h2h", "Buffalo Bills", null, -135, "DraftKings"), row("h2h", "New York Jets", null, 120, "FanDuel"), row("totals", "Over", 44.5, -108, "Caesars"),
    { eventId: "ffff", sport: "NHL", sportKey: "icehockey_nhl", home: "New York Rangers", away: "Buffalo Sabres", commence: "2026-11-15T18:00:00Z", marketKey: "h2h", outcome: { name: "New York Rangers", point: null }, odds: -120, book: "DraftKings" }] };
  fs.writeFileSync(path.join(A, "market.js"), "window.MARKET_DATA = " + JSON.stringify(market) + ";\n");
  const lean = { id: "ab12cd34ef-h2h-New-York-Jets", sport: "NFL", sportKey: W.KEY, eventId: "ab12cd34ef56ab12cd34ef56ab12cd34", home: "New York Jets", away: "Buffalo Bills", commence: "2026-11-15T18:00:00Z", market: "Moneyline", marketKey: "h2h", pick: "New York Jets ML", odds: 120, book: "FanDuel", status: "pending" };
  fs.writeFileSync(path.join(A, "picks-log.json"), JSON.stringify([{ type: "parlay", id: "parlay-2026-11-11", status: "pending" }, Object.assign({}, lean, { id: "void-one", status: "void" }), lean]));
  const r1 = await run(A, WED_10AM), D1 = readData(A), L1 = readLog(A), text1 = bytes(A);
  check("run: Wednesday morning of week 10 projects every game still to start with a model: four games, three projected (one on nflverse's football model, two on the margin model), one with no model, nothing graded",
    r1.week === "Week 10" && !r1.rolled && r1.games === 4 && r1.projected === 3 && r1.counts.nflverse === 1 && r1.counts.margin === 2 && r1.counts.none === 1 && r1.counts.kept === 0 && r1.graded === 0 && r1.changed === true, JSON.stringify(r1.counts));
  check("file: data/nfl-week.js sets window.NFL_WEEK_DATA with exactly the contract's top-level keys, real (not sample), the run's time, no hourly check yet, and the season",
    keys(D1) === "sample,source,attribution,generatedAt,checkedAt,season,week,model,record,games" && D1.sample === false && D1.generatedAt === new Date(WED_10AM).toISOString() && D1.checkedAt === null && D1.season === 2026 && /nflverse/.test(D1.attribution) && /CC BY 4\.0/.test(D1.attribution) && /National Weather Service/.test(D1.attribution) && /^\/\* Generated by scripts\/nfl-week\.js/.test(fs.readFileSync(path.join(A, "nfl-week.js"), "utf8")), keys(D1));
  check("file: the week is ESPN's own (its type, number, label and span), with the first and last kickoff, the game count and the clubs on a bye in a fixed order",
    keys(D1.week) === "type,number,label,start,end,from,to,games,byes" && D1.week.type === 2 && D1.week.number === 10 && D1.week.label === "Week 10" && D1.week.start === "2026-11-11T08:00Z" && D1.week.from === "2026-11-13T01:15:00.000Z" && D1.week.to === "2026-11-17T01:15:00.000Z" && D1.week.games === 4 && D1.week.byes.join() === "CHI,DEN,PHI,TB", JSON.stringify(D1.week));
  const HO = D1.model.heldOut;
  check("file: the held-out check travels with the numbers it speaks of (CLAUDE.md, NFL model): the moneyline calibrated against results (slope 1.08 ± 0.10 over 3,532 games, 2012-2026) with log-loss 0.6234 against the close's 0.6094, and the spread and the total worse than a coin flip's 0.693",
    keys(D1.model) === "name,basis,heldOut" && HO.asOf === "2026-11-08" && HO.coin === 0.693 && HO.moneyline.model === 0.6234 && HO.moneyline.close === 0.6094 && HO.moneyline.games === 3532 && HO.moneyline.seasons === "2012-2026" && HO.moneyline.slope === 1.08 && HO.moneyline.slopeSe === 0.1 && HO.spread.from === 0.7 && HO.spread.to === 0.712 && HO.total.from === 0.709 && HO.total.to === 0.713 && HO.spread.from > HO.coin && HO.total.from > HO.coin);
  const GAME_KEYS = "id,week,kickoff,timeValid,state,status,detail,score,home,away,venue,neutral,tv,projection,qb,injuries,weather,leanFrom,board,posted,result";
  check("file: every game carries the same keys in the same order, in kickoff order, with both clubs' ESPN id, abbreviation, names and record, the venue and the broadcast; none has started, so no score and no result",
    D1.games.map(g => g.id).join() === [WSH_NYG, NE_DET, BUF_NYJ, LAC_BAL].join() && D1.games.every(g => keys(g) === GAME_KEYS && g.week === 10 && g.state === "pre" && g.score === null && g.result === null && keys(g.home) === "id,abbr,name,short,record" && /^\d+-\d+/.test(g.home.record) && g.venue.name && g.tv)
    && gameOf(D1, WSH_NYG).home.abbr === "NYG" && gameOf(D1, WSH_NYG).away.name === "Washington Commanders" && gameOf(D1, WSH_NYG).venue.city === "East Rutherford" && gameOf(D1, NE_DET).neutral === true && gameOf(D1, NE_DET).venue.country === "Germany", D1.games.map(g => keys(g) === GAME_KEYS).join());
  const PROJ_KEYS = "model,at,locked,margin,total,marginSd,home,away,winner,prob,probHome,probAway,games,thin,parts,ratings,epa,rest";
  const projected = D1.games.filter(g => g.projection);
  check("projection: a projected score and a winner with its probability for each side: the two probabilities add to one, the winner is the likelier side, the scores are the total split by the margin, and the parts add up to the margin",
    projected.length === 3 && projected.every(function (g) {
      const p = g.projection, sum = ["home", "rating", "epa", "qb", "rest", "injuries"].reduce((s, k) => s + (p.parts[k] || 0), 0);
      return keys(p) === PROJ_KEYS && p.at === D1.generatedAt && p.locked === false && near(p.probHome + p.probAway, 1, 1e-4) && p.prob === Math.max(p.probHome, p.probAway) && p.prob >= 0.5 && p.winner === (p.probHome >= p.probAway ? "home" : "away") && (p.margin > 0) === (p.winner === "home")
        && near(p.home - p.away, p.margin, 0.11) && near(p.home + p.away, p.total, 0.11) && near(sum, p.margin, 0.03) && p.marginSd > 3 && p.marginSd < 7 && p.games.home >= 8 && p.games.away >= 8 && p.thin === false;
    }), projected.map(g => g.away.abbr + "@" + g.home.abbr + " " + g.projection.margin + " " + JSON.stringify(g.projection.parts)).join(" | "));
  /* the same game through the production model, asked the way the board asks it */
  const jets = gameOf(D1, BUF_NYJ), giants = gameOf(D1, WSH_NYG), ravens = gameOf(D1, LAC_BAL), munich = gameOf(D1, NE_DET);
  const direct = await (async function () {
    const dir = tmp(), wkSb = await baseWeek.week(2026, 2, 10), now = new Date(WED_10AM);
    const cache = { ppgOf: null, officialReport: false, nfl: nfl.lazy({ file: path.join(dir, "nflverse.json"), now: now, fetcher: nflFetcher }) };
    const gm = await model.forEvent(Object.assign({}, baseCtx, { scoreboard: async () => wkSb }), context, { sportKey: W.KEY, home: "New York Jets", away: "Buffalo Bills", commence: "2026-11-15T18:00Z" }, now, cache);
    const o = { name: "New York Jets", point: null };
    return { gm: gm, p: model.sideProb(gm, "h2h", o, "New York Jets", "Buffalo Bills"), noise: model.noise(gm, "h2h", o, "New York Jets", "Buffalo Bills") };
  })();
  check("projection: it is the production model's own call (model.forEvent, which hands NFL games to scripts/nfl.js): the Jets' probability, the margin, the total and the margin's error are the ones the board would price on, and the football model's parts are its own (home field 2.146, the quarterbacks, rest)",
    direct.gm.nflverse === true && jets.projection.model === "nflverse" && jets.projection.probHome === direct.p && jets.projection.margin === Math.round(direct.gm.margin * 100) / 100 && jets.projection.total === Math.round(direct.gm.total * 10) / 10 && near(jets.projection.marginSd, direct.gm.marginSd, 0.006)
    && jets.projection.parts.home === 2.15 && near(jets.projection.parts.qb, jets.qb.points, 0.051) && jets.projection.rest.home === 7 && jets.projection.rest.away === 6 && near(jets.projection.parts.rest, nfl.BETA.rest * 1, 0.006), JSON.stringify([jets.projection.probHome, direct.p, jets.projection.parts, jets.projection.rest]));
  check("projection: a game nflverse's data does not know keeps the margin model (its parts: the home edge 2.3, the ratings, rest, injuries; no EPA and no quarterback term), and a game with no results behind a club has no projection at all, so nothing is said for it",
    giants.projection.model === "margin" && ravens.projection.model === "margin" && giants.projection.parts.home === 2.3 && giants.projection.parts.epa === null && giants.projection.parts.qb === null && giants.qb === null && giants.projection.epa === null
    && munich.projection === null && munich.qb === null && munich.injuries === null && munich.weather === null && munich.leanFrom === null);
  check("quarterbacks: the matchup the football model assumed, each with his EPA a dropback, the level his club's numbers were built on, the points that gap is worth, his starts this season and what kind of start it is",
    jets.qb && keys(jets.qb) === "home,away,points" && keys(jets.qb.home) === "id,name,epa,ref,points,starts,games,kind,replaces,replacesStatus,lastStarter,status" && jets.qb.home.name === "Geno Smith" && jets.qb.away.name === "Josh Allen" && jets.qb.home.kind === "starter" && jets.qb.away.kind === "starter" && jets.qb.home.starts === 2 && jets.qb.home.games === 2 && jets.qb.home.replaces === null && jets.qb.home.status === null
    && near(jets.qb.home.points, nfl.BETA.qb * nfl.PARAMS.dropbacks * (jets.qb.home.epa - jets.qb.home.ref), 0.06) && near(jets.qb.points, jets.qb.home.points - jets.qb.away.points, 0.11), JSON.stringify(jets.qb));
  const names = side => side.list.map(x => x.name).join(", ");
  check("injuries: each club's listings the model charged for (name, position, status, the games he played), the ones a fan knows first, at most four named and the rest counted, with the points charged; a listed player who has not played this season costs nothing and is not named",
    keys(jets.injuries.home) === "list,more,points" && keys(jets.injuries.home.list[0]) === "name,pos,status,played" && names(jets.injuries.home) === "Max Mitchell, Garrett Wilson, Trevin Wallace" && jets.injuries.home.list[0].status === "Injured Reserve" && jets.injuries.home.list[0].played === 6 && jets.injuries.home.points === 0.7
    && !/VJ Payne/.test(names(jets.injuries.home)) && !/Adam Randall/.test(names(ravens.injuries.home)) && !/Denzel Perryman/.test(names(ravens.injuries.away))
    && giants.injuries.away.list.length === 4 && giants.injuries.away.more === 1 && ravens.injuries.away.more === 1 && D1.games.every(g => !g.injuries || ["home", "away"].every(s => g.injuries[s].list.length <= W.RULES.injuriesShown && g.injuries[s].points >= 0)), names(jets.injuries.home) + " | " + names(giants.injuries.away) + " +" + giants.injuries.away.more);
  check("injuries: the quarterback counts once a club. On the football model a quarterback is the quarterback term's business and is never listed as an injury charge; on the margin model only the costliest quarterback listing is charged (Baltimore lists two on injured reserve: one is named, and its 3.1 points are his 2.7 and two questionable starters)",
    D1.games.filter(g => g.projection && g.projection.model === "nflverse").every(g => ["home", "away"].every(s => g.injuries[s].list.every(x => x.pos !== "QB")))
    && ravens.injuries.home.list.filter(x => x.pos === "QB").length === 1 && ravens.injuries.home.list[0].name === "Tyler Huntley" && ravens.injuries.home.points === 3.1 && ravens.injuries.away.list[0].name === "Justin Herbert" && giants.injuries.home.list[0].name === "J.J. McCarthy", names(ravens.injuries.home));
  {
    const pure = W.injurySide([{ i: { name: "A Passer", pos: "QB", status: "Out", played: 8 }, cost: 4 }, { i: { name: "B Passer", pos: "QB", status: "Out", played: 2 }, cost: 1 }, { i: { name: "A Guard", pos: "G", status: "Questionable", played: 8 }, cost: 0.25 }, { i: { name: "Unseen", pos: "WR", status: "Out", played: 0 }, cost: 0 }], -4.25, false);
    const nv = W.injurySide([{ i: { name: "A Passer", pos: "QB", status: "Out", played: 8 }, cost: 4 }, { i: { name: "A Guard", pos: "G", status: "Questionable", played: 8 }, cost: 0.25 }], -0.25, true);
    check("injuries (the rule itself): margin model, two quarterbacks out: the costlier one and the guard; football model: the guard alone; a listing that costs nothing is never named", pure.list.map(x => x.name).join() === "A Passer,A Guard" && pure.points === 4.3 && nv.list.map(x => x.name).join() === "A Guard" && nv.points === 0.3, JSON.stringify([pure, nv]));
  }
  check("weather: an outdoor U.S. stadium gets the National Weather Service's hour of kickoff (wind, direction, temperature, chance of rain, a few words); a neutral site abroad gets none",
    keys(giants.weather) === "mph,dir,temp,unit,precip,text,at,source" && giants.weather.mph === 9 && giants.weather.dir === "N" && giants.weather.temp === 52 && giants.weather.unit === "F" && giants.weather.precip === 61 && giants.weather.text === "Light Rain Likely" && giants.weather.source === "National Weather Service" && Date.parse(giants.weather.at) <= Date.parse(giants.kickoff) && jets.weather.mph === 14 && munich.weather === null, JSON.stringify(giants.weather));
  {
    const src = weekSource(), g = { home: { abbr: "NYJ" }, start: "2026-11-15T18:00Z", neutral: false, venue: { city: "East Rutherford", country: "USA", indoor: false } }, now = new Date(WED_10AM);
    const dome = await W.weatherAt(src, { home: { abbr: "DET" }, start: g.start, neutral: false, venue: { city: "Detroit", country: "USA", indoor: true } }, now);
    const far = await W.weatherAt(src, Object.assign({}, g, { start: "2026-11-22T18:00Z" }), now), ok = await W.weatherAt(src, g, now);
    const hole = await W.weatherAt(Object.assign({}, src, { hourly: async u => { const f = clone(await src.hourly(u)); f.properties.periods.forEach(p => { p.probabilityOfPrecipitation = { value: null }; p.temperature = null; }); return f; } }), g, now);
    check("weather: a dome has none, a kickoff past the forecast's week has none, and a forecast hour with no temperature or no chance of rain says null, never zero", dome === null && far === null && ok.mph === 14 && hole.mph === 14 && hole.precip === null && hole.temp === null, JSON.stringify(hole));
  }
  const implied = o => o < 0 ? -o / (-o + 100) : 100 / (o + 100);
  check("the price that would make each moneyline side a lean: the board's own bar (the model's error on that side, never under the 3-point floor) and its own valueTo, so the worst whole price that still clears the bar; one tick shorter no longer clears it",
    projected.every(function (g) {
      return ["home", "away"].every(function (s) {
        const x = g.leanFrom[s], p = s === "home" ? g.projection.probHome : g.projection.probAway;
        if (keys(x) !== "prob,bar,price" || x.prob !== p || !(x.bar >= board.RULES.minEdge) || x.price !== board.valueTo(x.prob, x.bar)) return false;
        const shorter = x.price === 100 ? -101 : x.price - 1 === 99 ? -101 : x.price - 1;
        return implied(x.price) <= x.prob - x.bar + 1e-9 && implied(shorter) > x.prob - x.bar - 1e-9;
      });
    }) && near(jets.leanFrom.home.bar, Math.round(board.barOf(direct.noise) * 1e4) / 1e4, 1e-9) && jets.leanFrom.home.price === 134 && jets.leanFrom.away.price === 232, JSON.stringify(jets.leanFrom));
  check("the board, from disk: a game the odds run has priced carries its event id, when it was priced and the best moneyline price and book for each side; a game it has not priced carries none; an NHL game between two New York and Buffalo clubs is never taken for it",
    keys(jets.board) === "eventId,pricedAt,home,away" && jets.board.eventId === "ab12cd34ef56ab12cd34ef56ab12cd34" && jets.board.pricedAt === "2026-11-11T14:02:00.000Z" && jets.board.home.odds === 120 && jets.board.home.book === "FanDuel" && jets.board.away.odds === -135 && jets.board.away.book === "DraftKings" && giants.board === null && ravens.board === null, JSON.stringify(jets.board));
  check("no spread and no total anywhere: the board entry holds moneylines only, and no key in the file or the log names a spread, a total, a line or a point (the markets the replay found no signal in are never offered)",
    !/"(spread|spreads|total[A-Za-z]*|line|point|over|under)"\s*:/.test(JSON.stringify(D1.games.map(g => [g.board, g.leanFrom, g.posted]))) && !/"(spread|spreads|line|point|over|under|odds|book|price)"\s*:/.test(fs.readFileSync(path.join(A, "nfl-week-log.json"), "utf8")));
  check("the posted lean, from the log on disk: its id (the card's), the side, market, price, book and status; a void entry and the parlay of the day are passed over; a game with none says null",
    keys(jets.posted) === "id,pick,market,marketKey,odds,book,status,result" && jets.posted.id === "ab12cd34ef-h2h-New-York-Jets" && jets.posted.pick === "New York Jets ML" && jets.posted.odds === 120 && jets.posted.status === "pending" && jets.posted.result === null && giants.posted === null, JSON.stringify(jets.posted));
  {
    const B = tmp();
    fs.writeFileSync(path.join(B, "market.js"), "window.MARKET_DATA = " + JSON.stringify(Object.assign({}, market, { sample: true })) + ";\n");
    await run(B, WED_10AM);
    check("the board, from disk: the sample market file is never read as prices, and a run with no market file and no log still writes the week", gameOf(readData(B), BUF_NYJ).board === null && gameOf(readData(B), BUF_NYJ).posted === null && gameOf(readData(B), BUF_NYJ).projection.prob === jets.projection.prob);
  }
  check("the log: one entry a forecast game (never one for a game with no forecast), each with the projected winner, his club, the probability, the margin, the total and the score, unlocked and ungraded; the record's start is the first forecast's week",
    L1.v === 1 && keys(L1) === "v,note,startedAt,since,games" && Object.keys(L1.games).join() === [WSH_NYG, BUF_NYJ, LAC_BAL].join() && !L1.games[NE_DET] && keys(L1.games[BUF_NYJ]) === "id,season,type,week,kickoff,home,away,forecast,locked,result" && keys(L1.games[BUF_NYJ].forecast) === "at,winner,team,prob,margin,total,home,away,model,marginSd"
    && L1.games[BUF_NYJ].forecast.team === "NYJ" && L1.games[BUF_NYJ].forecast.prob === jets.projection.prob && L1.games[BUF_NYJ].locked === false && L1.games[BUF_NYJ].result === null && L1.games[WSH_NYG].forecast.team === "NYG" && L1.games[LAC_BAL].forecast.team === "BAL" && L1.since.week === 10 && L1.since.date === "2026-11-11" && L1.since.label === "Week 10", Object.keys(L1.games).join());
  check("the record before any game: this week and the season to date both empty, every forecast pending, no rate and no average yet, and since when the log has run",
    keys(D1.record) === "since,week,season" && keys(D1.record.week) === "label,w,l,p,pending,pct,avgProb" && D1.record.week.label === "Week 10" && [D1.record.week, D1.record.season].every(t => t.w === 0 && t.l === 0 && t.p === 0 && t.pending === 3 && t.pct === null && t.avgProb === null) && D1.record.since.label === "Week 10" && D1.record.since.date === "2026-11-11", JSON.stringify(D1.record));

  /* ---------- idempotence: the same inputs write the same bytes ---------- */
  const r1b = await run(A, WED_10AM);
  check("idempotence: the same run again (same clock, same responses, same files on disk) changes nothing: both files byte for byte, and the run says so", r1b.changed === false && bytes(A) === text1);
  {
    /* the log's games held in another order on disk (a hand edit, another writer): the record and the bytes do not move */
    const log = readLog(A), turned = { v: log.v, note: log.note, startedAt: log.startedAt, since: log.since, games: {} };
    const text = JSON.stringify(log, null, 1), ids = Object.keys(log.games).reverse();
    const pieces = ids.map(id => JSON.stringify(id) + ": " + JSON.stringify(log.games[id]));
    fs.writeFileSync(path.join(A, "nfl-week-log.json"), JSON.stringify({ v: log.v, note: log.note, startedAt: log.startedAt, since: log.since }).replace(/}$/, ",\"games\":{" + pieces.join(",") + "}}"));
    const r = await run(A, WED_10AM);
    check("idempotence: with the log's games written in the reverse order on disk the run rewrites the same bytes as before (tallies and the file are built in one fixed order, whatever order the games are held in)", ids.length === 3 && bytes(A) === text1 && r.changed === true && text.length > 0 && turned.v === 1);
  }

  /* ---------- locking at kickoff: a run after kickoff never changes a forecast ---------- */
  const before = clone(readData(A)), logBefore = clone(readLog(A));
  /* Thursday 8:30 PM ET: Washington at the Giants is under way, and the inputs have changed (the Jets' and the Giants'
     quarterbacks are now listed out) */
  const out = { "New York Jets": [{ name: "Geno Smith", pos: "QB", status: "Out" }], "New York Giants": [{ name: "Jaxson Dart", pos: "QB", status: "Out" }, { name: "A New Tackle", pos: "OT", status: "Out" }] };
  const r2 = await run(A, THU_830PM, { edits: { [WSH_NYG]: { state: "in", completed: false, name: "STATUS_IN_PROGRESS", detail: "8:21 - 1st", score: { home: 7, away: 3 } } }, ctx: { injuries: out } });
  const D2 = readData(A), L2 = readLog(A), g2 = gameOf(D2, WSH_NYG), j2 = gameOf(D2, BUF_NYJ);
  check("locking: a full run after kickoff, with a new injury report, leaves the started game's forecast exactly as the last run before kickoff left it (in the file and in the log), marks it locked at its kickoff, and counts nothing yet",
    JSON.stringify(Object.assign({}, g2.projection, { locked: false })) === JSON.stringify(gameOf(before, WSH_NYG).projection) && g2.projection.locked === true && JSON.stringify(g2.injuries) === JSON.stringify(gameOf(before, WSH_NYG).injuries) && JSON.stringify(g2.weather) === JSON.stringify(gameOf(before, WSH_NYG).weather)
    && JSON.stringify(L2.games[WSH_NYG].forecast) === JSON.stringify(logBefore.games[WSH_NYG].forecast) && L2.games[WSH_NYG].locked === true && L2.games[WSH_NYG].lockedAt === g2.kickoff && L2.games[WSH_NYG].result === null && r2.graded === 0 && D2.record.week.pending === 3);
  check("locking: a started game is never offered: no price that would make a lean, no board price, its state and score from ESPN",
    g2.leanFrom === null && g2.board === null && g2.state === "in" && g2.status === "STATUS_IN_PROGRESS" && g2.detail === "8:21 - 1st" && g2.score.home === 7 && g2.score.away === 3 && g2.result === null);
  check("locking: the games still to start did move with the new report (the Jets' quarterback is out, so the model starts the club's next one and says whom he replaces): only kickoff freezes a forecast",
    j2.qb.home.kind === "backup" && j2.qb.home.replaces === "Geno Smith" && j2.qb.home.replacesStatus === "Out" && j2.qb.home.name !== "Geno Smith" && j2.projection.prob !== jets.projection.prob && j2.projection.locked === false && j2.projection.at === new Date(THU_830PM).toISOString() && L2.games[BUF_NYJ].forecast.prob === j2.projection.prob && L2.games[BUF_NYJ].locked === false && j2.leanFrom !== null, JSON.stringify(j2.qb.home));
  check("locking (the rule itself): a game is started once ESPN has it under way or over, or once the run's clock is past its kickoff even while ESPN still says scheduled; a postponed game has not started",
    W.hasStarted({ state: "in", status: "STATUS_IN_PROGRESS", start: "2026-11-13T01:15Z" }, new Date("2026-11-13T01:00:00Z")) && W.hasStarted({ state: "pre", status: "STATUS_SCHEDULED", start: "2026-11-13T01:15Z" }, new Date("2026-11-13T01:15:00Z")) && !W.hasStarted({ state: "pre", status: "STATUS_SCHEDULED", start: "2026-11-13T01:15Z" }, new Date("2026-11-13T01:14:59Z")) && W.hasStarted({ state: "post", status: "STATUS_FINAL", start: "2026-11-13T01:15Z" }, new Date("2026-11-12T00:00:00Z")) && !W.hasStarted({ state: "pre", status: "STATUS_POSTPONED", start: "2026-11-13T01:15Z" }, new Date("2026-11-14T00:00:00Z")));
  {
    /* a cold start after a kickoff: the first run ever is Thursday 8:30 PM */
    const C = tmp();
    await run(C, THU_830PM, { edits: { [WSH_NYG]: { state: "in", completed: false, name: "STATUS_IN_PROGRESS", detail: "8:21 - 1st", score: { home: 7, away: 3 } } } });
    const c1 = gameOf(readData(C), WSH_NYG), l1 = readLog(C);
    const rr = await W.run({ out: C, now: THU_1145PM, track: true, week: weekSource({ [WSH_NYG]: final(24, 17) }), ctx: ctxSource() });
    const c2 = gameOf(readData(C), WSH_NYG), rec = readData(C).record;
    check("never forecast, never counted: a run that first sees a game after its kickoff makes no forecast for it (no projection, no log entry); when it ends the file shows the final score and no result, and the record does not count it",
      c1.projection === null && !l1.games[WSH_NYG] && Object.keys(l1.games).length === 2 && c2.state === "post" && c2.score.home === 24 && c2.result === null && c2.projection === null && rec.week.w === 0 && rec.week.l === 0 && rec.week.pending === 2 && rr.graded === 0 && !readLog(C).games[WSH_NYG], JSON.stringify(rec.week));
  }

  /* ---------- the hourly run: states, scores and grades; no projection is touched ---------- */
  {
    const none = await W.run({ out: tmp(), now: THU_1145PM, track: true, week: weekSource(), ctx: ctxSource() });
    check("--track: with no week file yet it does nothing and asks for nothing", none.track === true && none.changed === false && none.requests === 0 && /no week file/.test(none.why));
  }
  /* back to the run before kickoff, then the hourly runs */
  const T = tmp();
  fs.copyFileSync(path.join(A, "market.js"), path.join(T, "market.js")); fs.copyFileSync(path.join(A, "picks-log.json"), path.join(T, "picks-log.json"));
  await run(T, WED_10AM);
  const T0 = readData(T), textT0 = bytes(T);
  {
    const src = weekSource(), ctx = ctxSource();
    const quiet = await W.run({ out: T, now: "2026-11-12T20:00:00Z", track: true, week: src, ctx: ctx });
    check("--track: before the week's first kickoff there is no game in play: no request at all, and both files stay byte for byte", quiet.changed === false && quiet.requests === 0 && src.count() === 0 && ctx.count() === 0 && /no game in play/.test(quiet.why) && bytes(T) === textT0);
  }
  const untouched = (a, b, ids) => ids.every(id => ["projection", "qb", "injuries", "weather", "leanFrom", "board"].every(k => JSON.stringify(gameOf(a, id)[k]) === JSON.stringify(gameOf(b, id)[k])));
  {
    const src = weekSource({ [WSH_NYG]: { state: "in", completed: false, name: "STATUS_IN_PROGRESS", detail: "2:00 - 2nd", score: { home: 10, away: 10 } } }), ctx = ctxSource();
    const live = await W.run({ out: T, now: THU_830PM, track: true, week: src, ctx: ctx }), d = readData(T), g = gameOf(d, WSH_NYG);
    check("--track: a game under way: one request (the week's scoreboard), none to the model; its state and score are written, its forecast is locked with not a number changed, nothing is offered on it, and the file says when it was checked",
      live.changed === true && live.requests === 1 && src.count() === 1 && ctx.count() === 0 && live.live === 1 && live.graded === 0 && g.state === "in" && g.score.home === 10 && g.detail === "2:00 - 2nd" && g.projection.locked === true && JSON.stringify(Object.assign({}, g.projection, { locked: false })) === JSON.stringify(gameOf(T0, WSH_NYG).projection)
      && g.leanFrom === null && g.board === null && g.result === null && d.checkedAt === new Date(THU_830PM).toISOString() && d.generatedAt === T0.generatedAt && readLog(T).games[WSH_NYG].locked === true);
    check("--track: every game still to start is left exactly as the full run wrote it: projection, quarterbacks, injuries, weather, the prices that would make a lean and the board's prices", untouched(d, T0, [NE_DET, BUF_NYJ, LAC_BAL]) && gameOf(d, BUF_NYJ).posted.id === "ab12cd34ef-h2h-New-York-Jets" && gameOf(d, BUF_NYJ).projection.locked === false);
  }

  /* ---------- grading straight up ---------- */
  check("grading (the rule itself): the projected winner won, lost, or the game was a tie (a push)", (function () {
    const f = { winner: "home" }, a = W.gradeForecast(f, 24, 17), b = W.gradeForecast(f, 17, 24), c = W.gradeForecast(f, 20, 20), d = W.gradeForecast({ winner: "away" }, 17, 24);
    return a.call === "Win" && a.winner === "home" && b.call === "Loss" && b.winner === "away" && c.call === "Push" && c.winner === "tie" && d.call === "Win" && a.home === 24 && a.away === 17;
  })());
  /* Thursday 11:45 PM ET: the Giants (projected, 63.8%) won 24-17 */
  const thu = { [WSH_NYG]: final(24, 17) };
  {
    const src = weekSource(thu), ctx = ctxSource();
    const r = await W.run({ out: T, now: THU_1145PM, track: true, week: src, ctx: ctx }), d = readData(T), g = gameOf(d, WSH_NYG), e = readLog(T).games[WSH_NYG];
    check("grading: a win. The hourly run after the final grades the forecast straight up from ESPN's score (the Giants, projected at 63.8%, won 24-17): the result with the score, the winner and when it was graded, in the file and the log; one request",
      r.graded === 1 && r.requests === 1 && ctx.count() === 0 && keys(g.result) === "home,away,winner,call,gradedAt" && g.result.call === "Win" && g.result.home === 24 && g.result.away === 17 && g.result.winner === "home" && g.result.gradedAt === new Date(THU_1145PM).toISOString() && g.state === "post" && g.score.home === 24 && e.result.call === "Win" && e.locked === true && e.forecast.prob === gameOf(T0, WSH_NYG).projection.prob, JSON.stringify(g.result));
    check("record: this week 1-0 with two forecasts still pending, the rate 100% beside the 63.8% the forecast gave its winner; the season to date is the same, since the log began this week", d.record.week.w === 1 && d.record.week.l === 0 && d.record.week.p === 0 && d.record.week.pending === 2 && d.record.week.pct === 1 && d.record.week.avgProb === g.projection.prob && JSON.stringify(Object.assign({ label: "Week 10" }, d.record.season)) === JSON.stringify(d.record.week) && untouched(d, T0, [NE_DET, BUF_NYJ, LAC_BAL]), JSON.stringify(d.record.week));
    const textT1 = bytes(T), src2 = weekSource(thu);
    const again = await W.run({ out: T, now: "2026-11-13T05:45:00Z", track: true, week: src2, ctx: ctxSource() });
    check("idempotence (hourly): the next hourly run, with nothing in play and nothing left to grade, asks for nothing and leaves both files byte for byte; a graded forecast is never graded twice", again.changed === false && again.requests === 0 && src2.count() === 0 && again.graded === 0 && bytes(T) === textT1);
  }
  /* Sunday 8 PM ET: Munich is over (no forecast was made for it), Buffalo won at the Jets 27-20 (the Jets were projected) */
  const sun = Object.assign({}, thu, { [NE_DET]: final(17, 23), [BUF_NYJ]: final(20, 27) });
  {
    const r = await W.run({ out: T, now: SUN_8PM, track: true, week: weekSource(sun), ctx: ctxSource() }), d = readData(T), j = gameOf(d, BUF_NYJ), m = gameOf(d, NE_DET);
    check("grading: a loss (the Jets, projected at 56.3%, lost 20-27), and a finished game that was never forecast gets its score and no result",
      r.graded === 1 && j.result.call === "Loss" && j.result.winner === "away" && j.result.home === 20 && j.result.away === 27 && j.projection.locked === true && j.leanFrom === null && j.board === null && m.state === "post" && m.score.home === 17 && m.score.away === 23 && m.result === null && m.projection === null && !readLog(T).games[NE_DET]);
    check("record: this week 1-1 with one pending, the rate 50% beside the average the two forecasts gave their winners", d.record.week.w === 1 && d.record.week.l === 1 && d.record.week.pending === 1 && d.record.week.pct === 0.5 && near(d.record.week.avgProb, (gameOf(T0, WSH_NYG).projection.prob + jets.projection.prob) / 2, 1e-4), JSON.stringify(d.record.week));
  }
  /* Monday 11:59 PM ET: the Chargers and Baltimore finished level */
  const mon = Object.assign({}, sun, { [LAC_BAL]: final(20, 20) });
  {
    const r = await W.run({ out: T, now: MON_1159PM, track: true, week: weekSource(mon), ctx: ctxSource() }), d = readData(T), b = gameOf(d, LAC_BAL);
    check("grading: a tie is a push. Baltimore, projected, finished level at 20: neither a win nor a loss, counted apart, and the rate is still over the decided games only",
      r.graded === 1 && b.result.call === "Push" && b.result.winner === "tie" && d.record.week.w === 1 && d.record.week.l === 1 && d.record.week.p === 1 && d.record.week.pending === 0 && d.record.week.pct === 0.5 && d.week.number === 10, JSON.stringify(d.record.week));
  }
  {
    /* a game called off, and a game postponed: its own folder, from the run before kickoff */
    const V = tmp();
    await run(V, WED_10AM);
    const off = Object.assign({}, sun, { [LAC_BAL]: { state: "post", completed: false, name: "STATUS_CANCELED", detail: "Canceled" } });
    const r = await run(V, MON_1159PM, { edits: off }), d = readData(V), b = gameOf(d, LAC_BAL), e = readLog(V).games[LAC_BAL];
    check("grading: a game called off is void: its forecast is neither a win, a loss nor a push, it is no longer pending, and the week's record is the other games'",
      e.result.call === "Void" && b.result.call === "Void" && b.result.home === null && b.result.winner === null && b.projection === null && b.leanFrom === null && d.record.week.w === 1 && d.record.week.l === 1 && d.record.week.p === 0 && d.record.week.pending === 0 && r.graded === 2, JSON.stringify([b.result, d.record.week]));
    const P = tmp();
    await run(P, WED_10AM);
    await run(P, MON_1159PM, { edits: Object.assign({}, sun, { [LAC_BAL]: { state: "pre", completed: false, name: "STATUS_POSTPONED", detail: "Postponed" } }) });
    const pd = readData(P), pb = gameOf(pd, LAC_BAL), pe = readLog(P).games[LAC_BAL];
    check("grading: a postponed game is not graded and not locked: the file shows it postponed with nothing projected or offered, its forecast waits in the log, and the record still counts it as pending",
      pb.status === "STATUS_POSTPONED" && pb.projection === null && pb.leanFrom === null && pb.board === null && pb.result === null && pe.result === null && pe.locked === false && pe.forecast.team === "BAL" && pd.record.week.pending === 1);
    /* eleven days on it has still not been played: set aside, never guessed */
    const stuck = weekSource(Object.assign({}, sun, { [LAC_BAL]: { state: "pre", completed: false, name: "STATUS_POSTPONED", detail: "Postponed" } }), { later: true });
    const hourly = await W.run({ out: P, now: "2026-11-28T14:00:00Z", track: true, week: stuck, ctx: ctxSource() }), still = readLog(P).games[LAC_BAL].result;
    const later = await W.run({ out: P, now: "2026-11-28T15:00:00Z", week: stuck, ctx: ctxSource(), nflFetcher: nflFetcher });
    check("grading: a forecast whose game has no final " + W.RULES.voidAfterDays + " days after its kickoff is set aside as void (never a win or a loss), by the full run only: the hourly run before it voids nothing",
      hourly.graded === 0 && still === null && readLog(P).games[LAC_BAL].result.call === "Void" && readLog(P).games[LAC_BAL].result.why === "no final score" && later.data.record.season.w === 1 && later.data.record.season.l === 1 && later.data.record.season.p === 0 && later.data.record.season.pending === 0 && later.data.week.number === 12 && later.data.games.length === 0, JSON.stringify(later.data.record));
  }

  /* ---------- the week rolling over, and the record by week and season to date ---------- */
  check("rolling (the rule itself): the hub moves on once this week's games are all over and it is Tuesday in the East, or the small hours of Wednesday before ESPN's own week turns; never on a Monday night",
    W.rollDay(new Date(TUE_10AM)) && W.rollDay(new Date("2026-11-18T06:00:00Z")) && !W.rollDay(new Date(MON_1159PM)) && !W.rollDay(new Date("2026-11-16T15:00:00Z")) && !W.rollDay(new Date("2026-11-19T15:00:00Z")));
  {
    /* a full run on Monday night, every game final: the week stays on view with its results */
    const r = await run(T, MON_1159PM, { edits: mon }), d = readData(T);
    check("rolling: a full run on Monday night with every game final stays on the finished week (its results stay on view), every forecast locked as it was and nothing re-projected",
      r.week === "Week 10" && !r.rolled && r.projected === 0 && d.week.number === 10 && d.games.length === 4 && gameOf(d, WSH_NYG).result.call === "Win" && gameOf(d, BUF_NYJ).result.call === "Loss" && gameOf(d, LAC_BAL).result.call === "Push" && gameOf(d, WSH_NYG).projection.prob === gameOf(T0, WSH_NYG).projection.prob && d.games.every(g => g.leanFrom === null && g.board === null));
    const textMon = bytes(T), again = await run(T, MON_1159PM, { edits: mon });
    check("idempotence: that Monday-night run again leaves both files byte for byte", again.changed === false && bytes(T) === textMon);
  }
  {
    const src = weekSource(mon);
    const r = await W.run({ out: T, now: TUE_10AM, week: src, ctx: ctxSource(), nflFetcher: nflFetcher }), d = readData(T), l = readLog(T), g = gameOf(d, NYJ_LAC), h = gameOf(d, IND_HOU);
    check("rolling: Tuesday morning's full run moves on to week 11: ESPN's next week with its own games, kickoffs and byes, every game still to start projected where it has a model",
      r.rolled === true && r.week === "Week 11" && d.week.number === 11 && d.week.label === "Week 11" && d.week.games === 2 && d.games.map(x => x.id).join() === [IND_HOU, NYJ_LAC].join() && d.games.every(x => x.week === 11 && x.state === "pre" && x.result === null) && g.projection && g.projection.locked === false && g.leanFrom && h.projection === null && r.projected === 1, JSON.stringify([r.week, r.projected]));
    check("record by week and season: the new week starts empty with its one forecast pending, while the season to date keeps last week's 1-1 and a push, the 50% rate beside the forecasts' average, and still says the log began in week 10",
      d.record.week.label === "Week 11" && d.record.week.w === 0 && d.record.week.l === 0 && d.record.week.p === 0 && d.record.week.pending === 1 && d.record.week.pct === null && d.record.season.w === 1 && d.record.season.l === 1 && d.record.season.p === 1 && d.record.season.pending === 1 && d.record.season.pct === 0.5 && d.record.season.avgProb > 0.5 && d.record.since.label === "Week 10", JSON.stringify(d.record));
    check("rolling: the log keeps last week's graded forecasts beside the new week's (the record is built from it alone), each under its own week",
      Object.keys(l.games).length === 4 && l.games[NYJ_LAC].week === 11 && l.games[NYJ_LAC].result === null && l.games[WSH_NYG].week === 10 && l.games[WSH_NYG].result.call === "Win" && l.games[LAC_BAL].result.call === "Push");
  }
  {
    /* a run was missed: the last run was Wednesday of week 10 and the next is Thursday of week 11 */
    const M = tmp();
    await run(M, WED_10AM);
    const src = weekSource(mon);
    const r = await W.run({ out: M, now: THU_NEXT, week: src, ctx: ctxSource(), nflFetcher: nflFetcher }), d = readData(M);
    check("a missed week: forecasts of an earlier week still waiting for a final are graded on the next full run, which reads that week once; they count in the season to date and not in the new week",
      r.week === "Week 11" && !r.rolled && r.graded === 3 && d.week.number === 11 && d.record.week.w === 0 && d.record.week.pending === 1 && d.record.season.w === 1 && d.record.season.l === 1 && d.record.season.p === 1 && readLog(M).games[BUF_NYJ].result.call === "Loss", JSON.stringify(d.record));
  }
  check("fixed order (the rule itself): a log holding the same games in another order gives the same record and the same text, to the byte", (function () {
    const e = (id, prob, call) => ({ id: id, season: 2026, type: 2, week: 10, forecast: { prob: prob, winner: "home" }, result: { call: call } });
    const list = [e("g-c", 0.1, "Win"), e("g-a", 0.2, "Win"), e("g-b", 0.3, "Loss"), e("g-d", 0.7, "Win"), e("g-e", 0.9, "Loss")];
    const logOf = l => { const games = {}; l.forEach(x => { games[x.id] = x; }); return { v: 1, since: null, games: games }; };
    const a = logOf(list), b = logOf(list.slice().reverse()), cur = { type: 2, week: 10, label: "Week 10" };
    return Object.keys(a.games).join() !== Object.keys(b.games).join() && JSON.stringify(W.recordOf(a, 2026, cur)) === JSON.stringify(W.recordOf(b, 2026, cur)) && W.serialise(a) === W.serialise(b) && Object.keys(JSON.parse(W.serialise(b)).games).join() === "g-a,g-b,g-c,g-d,g-e";
  })());
  check("record (the rule itself): only this season's forecasts count, a void is in no tally, and the start of the log qualifies the season to date only in the season it began in", (function () {
    const e = (id, season, week, prob, call) => ({ id: id, season: season, type: 2, week: week, forecast: { prob: prob, winner: "home" }, result: call ? { call: call } : null });
    const log = { since: { season: 2026, label: "Week 10" }, games: { a: e("a", 2026, 10, 0.6, "Win"), b: e("b", 2026, 10, 0.7, "Loss"), c: e("c", 2026, 10, 0.55, "Void"), d: e("d", 2026, 11, 0.8, "Win"), x: e("x", 2025, 10, 0.9, "Loss"), n: { id: "n", season: 2026, type: 2, week: 10, forecast: null, result: null }, p: e("p", 2026, 11, 0.6, null) } };
    const r = W.recordOf(log, 2026, { type: 2, week: 11, label: "Week 11" }), next = W.recordOf(log, 2027, { type: 2, week: 1, label: "Week 1" });
    return r.season.w === 2 && r.season.l === 1 && r.season.p === 0 && r.season.pending === 1 && r.season.pct === 0.6667 && r.season.avgProb === 0.7 && r.week.w === 1 && r.week.l === 0 && r.week.pending === 1 && r.since.label === "Week 10" && next.since === null && next.season.w === 0 && next.season.pending === 0 && next.week.label === "Week 1";
  })());
  {
    /* between seasons: no week within reach */
    const O = tmp(), src = Object.assign(weekSource(), { scoreboard: async () => ({ leagues: [{ season: { year: 2026 }, calendar: [] }], events: [] }) });
    const r = await W.run({ out: O, now: "2027-03-10T15:00:00Z", week: src, ctx: ctxSource(), nflFetcher: nflFetcher }), d = readData(O);
    check("no week: between seasons the file says so (week null, no games), which the pages read as no hub", r.week === null && d.week === null && d.games.length === 0 && d.sample === false && d.record.season.w === 0);
  }
  {
    /* ESPN cannot be read: the run fails loudly (the workflow step turns that into a warning) and the files stay */
    const E = tmp();
    await run(E, WED_10AM);
    const kept = bytes(E);
    let threw = "";
    try { await W.run({ out: E, now: THU_830PM, week: Object.assign(weekSource(), { scoreboard: async () => { throw new Error("HTTP 503"); } }), ctx: ctxSource(), nflFetcher: nflFetcher }); } catch (err) { threw = err.message; }
    let threwTrack = "";
    try { await W.run({ out: E, now: THU_830PM, track: true, week: Object.assign(weekSource(), { week: async () => { throw new Error("HTTP 503"); } }), ctx: ctxSource() }); } catch (err) { threwTrack = err.message; }
    check("ESPN unreadable: the full run and the hourly run both stop with an error and leave the last files exactly as they were", /could not be read/.test(threw) && /could not be read/.test(threwTrack) && bytes(E) === kept, threw + " | " + threwTrack);
    /* one game's model fails on a later run: the last run's projection stands, with its own time */
    const ctx = ctxSource(); const sched = ctx.schedule; ctx.schedule = async function (s, id) { if (String(id) === "20") throw new Error("HTTP 500"); return sched(s, id); };
    const r = await W.run({ out: E, now: "2026-11-12T15:00:00Z", week: weekSource(), ctx: ctx, nflFetcher: nflFetcher }), j = gameOf(readData(E), BUF_NYJ);
    check("one game's model fails: its last projection is kept, with the time it was made, and the others are projected afresh", r.counts.kept === 1 && r.projected === 2 && j.projection.at === new Date(WED_10AM).toISOString() && j.projection.prob === jets.projection.prob && gameOf(readData(E), WSH_NYG).projection.at === "2026-11-12T15:00:00.000Z" && readLog(E).games[BUF_NYJ].forecast.at === new Date(WED_10AM).toISOString());
  }

  /* ---------- it spends nothing, and it is wired into both workflows ---------- */
  const src = fs.readFileSync(path.join(__dirname, "nfl-week.js"), "utf8");
  check("spends nothing: the script names no odds vendor, key or adapter (no Odds API request and no SportsGameOdds call; a priced game is read from data/market.js and data/picks-log.json on disk), and this whole test made no request of any kind",
    !/the-odds-api|sportsgameodds\.com|ODDS_API_KEY|SGO_API_KEY|require\("\.\/sgo\.js"\)|require\("\.\/surplus\.js"\)/.test(src) && /marketFile\(dataDir\)/.test(src) && /picksLog\(dataDir\)/.test(src) && asked.length === 0, asked.slice(0, 3).join(" "));
  const wf = n => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", n), "utf8");
  const full = wf("update-data.yml"), hourly = wf("track-prices.yml");
  check("workflows: the full run projects the week after the odds run, in a step that can never fail the job; the hourly run tracks it the same way and commits both files when they change",
    /run: node scripts\/nfl-week\.js \|\| echo "::warning::/.test(full) && full.indexOf("node scripts/update-data.js --slot") < full.indexOf("node scripts/nfl-week.js") && full.indexOf("node scripts/nfl-week.js") < full.indexOf("Commit data if it changed")
    && /run: node scripts\/nfl-week\.js --track \|\| echo "::warning::/.test(hourly) && hourly.indexOf("node scripts/update-data.js --track") < hourly.indexOf("node scripts/nfl-week.js --track") && /git status --porcelain -- [^)]*data\/nfl-week\.js data\/nfl-week-log\.json/.test(hourly));
  check("npm test runs this file", /node scripts\/nfl-week-test\.js/.test(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).scripts.test));

  global.fetch = realFetch;
  tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
