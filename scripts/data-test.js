/* Offline test of the data pipeline against scripts/fixtures. Run: node scripts/data-test.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const P = require("./update-data.js");
const fails = [];
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) fails.push(name); };
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-3);

(async () => {
  /* math */
  check("implied(-110) = 52.4%", near(P.implied(-110), 0.5238));
  check("implied(+150) = 40%", near(P.implied(150), 0.4));
  check("devig splits a -110/-110 line evenly", P.devig([-110, -110]).every(p => near(p, 0.5)));
  check("profit per unit at +150 is 1.5, at -200 is 0.5", near(P.profitPerUnit(150), 1.5) && near(P.profitPerUnit(-200), 0.5));

  /* grading */
  const ev = { completed: true, home_team: "H", away_team: "A", scores: [{ name: "H", score: "110" }, { name: "A", score: "104" }] };
  check("grade: h2h winner", P.grade({ market: "h2h", outcome: { name: "H" }, odds: -150 }, ev).result === "Win");
  check("grade: h2h loser pays -1", P.grade({ market: "h2h", outcome: { name: "A" }, odds: 140 }, ev).units === -1);
  check("grade: spread win pays by odds", (g => g.result === "Win" && near(g.units, 0.91, 0.01))(P.grade({ market: "spreads", outcome: { name: "H", point: -3.5 }, odds: -110 }, ev)));
  check("grade: spread push", P.grade({ market: "spreads", outcome: { name: "A", point: 6 }, odds: -110 }, ev).result === "Push");
  check("grade: total push on the number", P.grade({ market: "totals", outcome: { name: "Over", point: 214 }, odds: -110 }, ev).result === "Push");
  check("grade: under wins", P.grade({ market: "totals", outcome: { name: "Under", point: 220.5 }, odds: -105 }, ev).result === "Win");
  check("grade: incomplete event -> null", P.grade({ market: "h2h", outcome: { name: "H" }, odds: -150 }, { completed: false, scores: null }) === null);
  /* the pipeline logs the label in `market` and the key in `marketKey`; grading on the label sent moneylines and spreads
     down the totals branch (the away side's moneyline read as a win, an away +7.5 as a loss) */
  check("grade: reads the market key, not the label the log carries (Moneyline, Puck line, Total), and keeps the final home and away", (() => {
    const none = { result: null, units: null, final: {} };
    const ml = P.grade({ market: "Moneyline", marketKey: "h2h", outcome: { name: "A", point: null }, odds: 140 }, ev) || none;
    const sp = P.grade({ market: "Puck line", marketKey: "spreads", outcome: { name: "A", point: 7.5 }, odds: -110 }, ev) || none;
    const tot = P.grade({ market: "Total", marketKey: "totals", outcome: { name: "Under", point: 220.5 }, odds: -105 }, ev) || none;
    const labelOnly = P.grade({ market: "Run line", outcome: { name: "H", point: -1.5 }, odds: 120 }, ev) || none;
    return ml.result === "Loss" && ml.units === -1 && sp.result === "Win" && tot.result === "Win" && labelOnly.result === "Win" && near(labelOnly.units, 1.2, 1e-9) && ml.final.home === 110 && ml.final.away === 104 && ml.score === "104-110" && P.grade({ market: "Player props", outcome: { name: "H" }, odds: 100 }, ev) === null;
  })());
  check("isFinal: a completed flag settles a game at once, a false flag never; a source with no flag waits out RULES.gradeAfterHours", (() => {
    const at = iso => new Date(iso), start = "2026-11-04T00:00:00Z";
    return P.RULES.gradeAfterHours === 3 && P.isFinal(true, start, at("2026-11-04T00:30:00Z")) && !P.isFinal(false, start, at("2026-11-05T00:00:00Z")) && !P.isFinal(undefined, start, at("2026-11-04T02:59:00Z")) && P.isFinal(undefined, start, at("2026-11-04T03:01:00Z"));
  })());
  check("grading: ESPN's completed flag grades a game an hour and a half in; with no flag the score waits for the 3-hour floor; a game ESPN calls still on waits", await (async () => {
    const sb = flag => ({ events: [{ id: "1", competitions: [{ status: { type: flag === undefined ? { state: "post" } : { completed: flag } }, competitors: [{ homeAway: "home", score: "3", team: { displayName: "Boston Bruins", name: "Bruins", location: "Boston" } }, { homeAway: "away", score: "2", team: { displayName: "New York Rangers", name: "Rangers", location: "New York" } }] }] }] });
    const go = async (flag, nowIso) => {
      const l = [{ id: "x", key: "x", sportKey: "icehockey_nhl", sport: "NHL", home: "Boston Bruins", away: "New York Rangers", commence: "2026-11-04T00:00:00Z", market: "Moneyline", marketKey: "h2h", outcome: { name: "Boston Bruins", point: null }, odds: -120, status: "pending", units: 0 }];
      const r = await P.gradeStarted(l, new Date(nowIso), { ctx: { scoreboard: async () => sb(flag), odds: async () => null }, sgoSrc: { enabled: false }, sgoOk: () => false, scores: null });
      return l[0].status + ":" + r.graded + ":" + (l[0].result || "") + ":" + JSON.stringify(l[0].finalScore || null);
    };
    return (await go(true, "2026-11-04T01:30:00Z")) === 'graded:1:Win:{"home":3,"away":2}' && (await go(undefined, "2026-11-04T01:30:00Z")) === "pending:0::null" && (await go(undefined, "2026-11-04T03:30:00Z")).indexOf("graded:1:Win") === 0 && (await go(false, "2026-11-04T05:00:00Z")) === "pending:0::null";
  })());

  check("grading: a game ESPN still calls on five hours in (a postponement) is not looked up on SportsGameOdds by the hourly run, which would cost an entity an hour; the full runs still ask", await (async () => {
    const lookups = { n: 0 };
    const sgoStub = { enabled: true, usage: async () => ({ used: 0, max: 2500 }), events: async () => { lookups.n++; return []; }, stats: () => ({ requests: 0, entities: 0 }) };
    const sb = { events: [{ id: "1", competitions: [{ status: { type: { completed: false, state: "post", name: "STATUS_POSTPONED" } }, competitors: [{ homeAway: "home", score: "0", team: { displayName: "Boston Bruins", name: "Bruins", location: "Boston" } }, { homeAway: "away", score: "0", team: { displayName: "New York Rangers", name: "Rangers", location: "New York" } }] }] }] };
    const go = async track => {
      lookups.n = 0;
      const l = [{ id: "x", key: "x", sportKey: "icehockey_nhl", sport: "NHL", home: "Boston Bruins", away: "New York Rangers", commence: "2026-11-04T00:00:00Z", market: "Moneyline", marketKey: "h2h", outcome: { name: "Boston Bruins", point: null }, odds: -120, status: "pending", units: 0 }];
      await P.gradeStarted(l, new Date("2026-11-04T05:00:00Z"), { ctx: { scoreboard: async () => sb, odds: async () => null }, sgoSrc: sgoStub, sgoOk: () => true, scores: null, track: track });
      return l[0].status + ":" + lookups.n;
    };
    return (await go(true)) === "pending:0" && (await go(false)) === "pending:1";
  })());

  /* valueTo: the worst whole American price at which our probability still clears the bar (modelProb − minEdge) */
  const worse = v => v === 100 ? -101 : v - 1; /* one step worse: -255 -> -256, +139 -> +138, +100 -> -101 */
  const clears = (prob, v) => P.implied(v) <= prob - P.RULES.minEdge + 1e-12;
  check("valueTo: a favourite (74.9% -> -255: -256 would no longer clear 3 points) and an underdog (45% -> +139: +138 would not)", P.valueTo(0.749) === -255 && clears(0.749, -255) && !clears(0.749, worse(-255)) && P.valueTo(0.45) === 139 && clears(0.45, 139) && !clears(0.45, worse(139)), JSON.stringify([P.valueTo(0.749), P.valueTo(0.45)]));
  check("valueTo: even money is +100, an exact whole price is kept (63% -> -150), and nothing outside 0-1 after the bar", P.valueTo(0.53) === 100 && P.valueTo(0.63) === -150 && P.valueTo(0.03) === null && P.valueTo(0.01) === null && P.valueTo(1.04) === null && P.valueTo(null) === null && P.valueTo(undefined) === null, JSON.stringify([P.valueTo(0.53), P.valueTo(0.63), P.valueTo(0.03)]));

  /* full run on fixtures, with a pre-existing log to grade. The fixture checks below were written for the flat bar and
     one pick per market (four picks across two games, which exercise the breakdowns of a moneyline, a total and a
     three-way soccer side; five until 2026-11-05, when pricing moved to the unrounded total: the Over 2.5 goals at -120
     cleared the floor only on a total rounded up to 2.9, 3.1 points over the price; on the full 2.88 it is 2.6, a watch); they run on that rule (barZ 0 = every bar at the 3-point floor, onePerGame off), and the
     Phase 2 selection (each side's own bar, one pick a game) is checked on its own further down */
  const RULES0 = { barZ: P.RULES.barZ, onePerGame: P.RULES.onePerGame };
  P.RULES.barZ = 0; P.RULES.onePerGame = false;
  /* and on the model's own numbers: the per-league calibration (2026-11-05, model.CALIB) pulls the fixture's NBA total
     to about even, so these checks run without it and it is checked on its own further down */
  const MC = require("./model.js"), CALIB0 = JSON.parse(JSON.stringify(MC.CALIB));
  Object.keys(MC.CALIB).forEach(k => { delete MC.CALIB[k]; });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-data-"));
  const NOW = "2026-11-05T15:00:00Z";
  const pending = (id, extra) => Object.assign({ key: id, id: id, date: "2026-11-03", commence: "2026-11-04T00:00:00Z", sport: "NBA", league: "NBA", sportKey: "basketball_nba", eventId: "nba-old-1", event: "Milwaukee Bucks @ Boston Celtics", home: "Boston Celtics", away: "Milwaukee Bucks", edge: 0.03, confidence: "Medium", status: "pending", units: 0 }, extra);
  fs.writeFileSync(path.join(tmp, "picks-log.json"), JSON.stringify([
    pending("old-ml", { market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 140, history: [{ at: "2026-11-03T17:00:00Z", odds: 140, fair: 0.42 }, { at: "2026-11-03T20:30:00Z", odds: 130, fair: 0.45 }] }),
    pending("old-spread", { market: "Spread", marketKey: "spreads", outcome: { name: "Boston Celtics", point: -3 }, pick: "Boston Celtics -3", odds: -110 }),
    pending("old-total", { market: "Total", marketKey: "totals", outcome: { name: "Over", point: 214 }, pick: "Over 214", odds: -110 }),
    pending("stale", { sport: "NFL", sportKey: "americanfootball_nfl", eventId: "nfl-gone", commence: "2026-10-25T17:00:00Z", date: "2026-10-25", market: "Moneyline", marketKey: "h2h", outcome: { name: "X", point: null }, pick: "X ML", odds: 100 })
  ]));
  /* the log entries above carry the market label in `market`, as the pipeline writes them; grading reads `marketKey` */

  const r1 = await P.run({ fixture: true, out: tmp, now: NOW });
  const log = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  check("run: graded ML as a loss", byId["old-ml"].status === "graded" && byId["old-ml"].result === "Loss" && byId["old-ml"].units === -1);
  check("run: graded spread as a win at +0.91u", byId["old-spread"].result === "Win" && near(byId["old-spread"].units, 0.91, 0.01));
  check("run: graded total as a push", byId["old-total"].result === "Push" && byId["old-total"].units === 0);
  check("run: stale pick voided", byId["stale"].status === "void");
  /* closing line value (fixed 2026-11-08): the close is always a pre-game price. DraftKings' close from ESPN's core odds
     record (fixture: BOS -170 / MIL +150, BOS -3.5, total 214 at -105 / -115) comes first, then our own last
     SportsGameOdds look before the start, then our last Odds API check before the start. SportsGameOdds' record of the
     finished game (fixture sgo-nba-old-1: completed, its odds still on) gives the score at most, never a price */
  const dkFair = (a, b) => P.implied(a) / (P.implied(a) + P.implied(b));
  const mlClv = dkFair(150, -170) - P.implied(140), totClv = dkFair(-105, -115) - P.implied(-110);
  check("clv: the moneyline's close is DraftKings' close from ESPN (took +140, closed +150 de-vigged against -170: negative CLV), never SportsGameOdds' post-game record", byId["old-ml"].close && byId["old-ml"].close.source === "DraftKings close (ESPN)" && byId["old-ml"].close.odds === 150 && byId["old-ml"].close.samples === 2 && near(byId["old-ml"].clv, mlClv, 0.001) && byId["old-ml"].clv < 0 && !/SportsGameOdds/.test(JSON.stringify(log.filter(e => e.status === "graded").map(e => e.close))), JSON.stringify([byId["old-ml"].close, byId["old-ml"].clv, mlClv]));
  check("clv: a total that closed on our number gets price CLV from DraftKings' two-way close", near(byId["old-total"].clv, totClv, 0.001) && byId["old-total"].close.line === 214 && byId["old-total"].close.odds === -105 && byId["old-total"].close.source === "DraftKings close (ESPN)", JSON.stringify([byId["old-total"].close, byId["old-total"].clv]));
  check("clv: SportsGameOdds' finished record gives a score and nothing else (result(): no price, no books, no fair), and nothing for a league it does not cover", await (async () => {
    const S = require("./sgo.js"), src = S.source({ fixture: true });
    const r = await S.result(src, { id: "x-old", sportKey: "basketball_nba", home: "Boston Celtics", away: "Milwaukee Bucks", commence: "2026-11-04T00:00:00Z", marketKey: "h2h", outcome: { name: "Milwaukee Bucks" }, odds: 140 });
    const none = await S.result(src, { id: "x-epl", sportKey: "soccer_epl", home: "Arsenal", away: "Liverpool", commence: "2026-11-06T20:00:00Z", marketKey: "h2h", outcome: { name: "Draw" }, odds: 330 });
    return !!r && r.score && r.score.home === 110 && r.score.away === 104 && Object.keys(r).sort().join() === "score,sgoEventId" && none === null && typeof S.close === "undefined";
  })());
  check("grading: free scores settled the NBA picks; The Odds API scores endpoint was called once, for the stale NFL pick only", r1.scoresRequests === 1 && byId["old-ml"].score === "104-110" && byId["old-ml"].finalScore.home === 110 && byId["old-ml"].finalScore.away === 104 && r1.settled === 3, "scores calls " + r1.scoresRequests);
  check("clv: a spread that closed on a different number has no price CLV but a direction (-3 -> -3.5 is toward us)", byId["old-spread"].clv == null && byId["old-spread"].lineMove === "toward" && byId["old-spread"].close.line === -3.5 && byId["old-spread"].close.fair == null, JSON.stringify(byId["old-spread"].close));
  check("clv: ESPN open is kept alongside the close", byId["old-ml"].close.open && byId["old-ml"].close.open.odds === 130);
  /* the game model (owner rule, 2026-11-04): every side's probability comes from scripts/model.js, never from a book's price */
  check("run: added 4 picks, all graded on game data; two games modelled, the NFL game not (no ESPN record in the fixtures); the Over 2.5 goals is not one, priced on the unrounded total", r1.added === 4 && r1.modelled === 2 && r1.unmodelled === 1, "added " + r1.added + " " + JSON.stringify([r1.modelled, r1.unmodelled]));
  const added = log.filter(e => e.loggedAt);
  const bucks = added.find(e => e.pick === "Milwaukee Bucks ML"), draw = added.find(e => e.pick === "Draw"), celtics = added.find(e => e.pick === "Boston Celtics ML"), arsenal = added.find(e => e.pick === "Arsenal ML");
  check("run: the old grade's price outliers (Bucks ML +160, the Draw +330) are not picks: the model has them at 19% and 20%", !bucks && !draw);
  const M = require("./model.js"), CTX = require("./context.js");
  const modelOpts = { ppgOf: M.ppgFromFaces(path.join(__dirname, "fixtures", "sample-faces.js")) };
  const gmFix = await M.forEvent(CTX.source({ fixture: true }), CTX, { sportKey: "basketball_nba", home: "Boston Celtics", away: "Milwaukee Bucks", commence: "2026-11-06T00:00:00Z" }, new Date(NOW), modelOpts);
  const gmEpl = await M.forEvent(CTX.source({ fixture: true }), CTX, { sportKey: "soccer_epl", home: "Arsenal", away: "Liverpool", commence: "2026-11-06T20:00:00Z" }, new Date(NOW), modelOpts);
  check("run: Celtics ML at Caesars -145, High: our probability is the model's (margin 9.58 from ratings, home edge, the Bucks' back-to-back and injuries, priced whole and shown on the pick as +9.6), the edge is that over the price", !!celtics && celtics.book === "Caesars" && celtics.odds === -145 && celtics.basis === "game" && celtics.confidence === "High" && gmFix && near(celtics.modelProb, M.sideProb(gmFix, "h2h", { name: "Boston Celtics", point: null }, "Boston Celtics", "Milwaukee Bucks"), 1e-4) && near(celtics.edge, celtics.modelProb - P.implied(-145), 1e-4) && celtics.model.margin === Math.round(gmFix.margin * 10) / 10 && celtics.model.margin !== gmFix.margin && celtics.model.parts.rest === 1.5 && celtics.model.reasons.for.length >= 4, celtics && JSON.stringify([celtics.modelProb, celtics.edge, celtics.model && celtics.model.parts]));
  check("run: the market's number is kept apart as a reference (Celtics ML: the books make it 58.9%, 0.3 under the price, while ours is 15.7 over it) and plays no part in the grade", near(celtics.marketFair, 0.5885, 0.001) && celtics.marketEdge < 0 && near(celtics.edge, 0.157, 0.002));
  check("run: Arsenal ML at FanDuel +125 from the three-way model: home, draw and away sum to one", !!arsenal && arsenal.book === "FanDuel" && arsenal.odds === 125 && arsenal.sport === "Soccer" && gmEpl && near(["Arsenal", "Draw", "Liverpool"].reduce((s, n) => s + M.sideProb(gmEpl, "h2h", { name: n, point: null }, "Arsenal", "Liverpool"), 0), 1, 1e-3) && near(arsenal.modelProb, M.sideProb(gmEpl, "h2h", { name: "Arsenal", point: null }, "Arsenal", "Liverpool"), 1e-4), arsenal && String(arsenal.modelProb));
  check("run: no pick on the NFL games: without an ESPN record there is no model, so no side has a probability", !added.some(e => e.sport === "NFL"));
  check("run: never both sides of one market", !added.some(a => added.some(b => a !== b && a.eventId === b.eventId && a.marketKey === b.marketKey)));
  check("run: rationale states the rule and names the book; the market is a reference only", /^Our probability is 74\.9%, from the game data/.test(celtics.rationale) && /Caesars offers -145/.test(celtics.rationale) && /Not graded against other books' prices/.test(celtics.rationale) && /for reference the market makes it 58\.\d%/.test(celtics.rationale) && celtics.factors.some(f => /from game data, not other books/.test(f)), celtics.rationale);
  check("run: tiers are how far the edge clears the side's own bar (Lean past it, Medium 2 points past, High 5) and a thin sample never rates above Lean", P.confidence(0.1, true) === "Lean" && P.confidence(0.1, false) === "High" && P.confidence(0.05) === "High" && P.confidence(0.049) === "Medium" && P.confidence(0.02) === "Medium" && P.confidence(0.019) === "Lean" && P.confidence(0) === "Lean" && P.RULES.minEdge === 0.03);

  /* generated files load in a browser-like scope and have the site's shape */
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8") + fs.readFileSync(path.join(tmp, "performance.js"), "utf8"), sandbox);
  const PD = sandbox.window.PICKS_DATA, PF = sandbox.window.PERF_DATA;
  check("picks.js: sample=false, 4 picks on the board with start labels, every one on the game grade with the model's reasons and the market reference", PD.sample === false && PD.picks.length === 4 && /ET$/.test(PD.picks[0].start) && PD.picks.every(p => p.basis === "game" && p.model && p.model.reasons && typeof p.marketFair === "number"), PD.picks.map(p => p.start).join(", "));
  check("picks.js: pick fields match the site shape, with the pick's state through the game (status, started, result, units, score, loggedAt, valueTo)", PD.picks.every(p => ["id", "sport", "league", "event", "start", "market", "pick", "odds", "modelProb", "confidence", "rationale", "factors", "book", "basis", "model", "marketFair", "status", "started", "result", "units", "score", "loggedAt", "valueTo"].every(k => k in p)));
  check("picks.js: an upcoming pick reads pending, not started, no result, units or score yet, posted at its run, with the worst price that still clears the bar", PD.picks.every(p => p.status === "pending" && p.started === false && p.result === null && p.units === null && p.score === null && p.loggedAt === "2026-11-05T15:00:00.000Z" && p.valueTo === P.valueTo(p.modelProb) && P.implied(p.odds) <= P.implied(p.valueTo) + 1e-9) && PD.picks.find(p => p.pick === "Boston Celtics ML").valueTo === -255 && PD.parlayOfDay.units === null, JSON.stringify(PD.picks.map(p => [p.pick, p.odds, p.valueTo])));
  check("performance.js: 1-1-1 record, -0.09u, roi -3.0%", PF.record.wins === 1 && PF.record.losses === 1 && PF.record.pushes === 1 && near(PF.units, -0.09, 0.001) && near(PF.roi, -3.0, 0.01), JSON.stringify([PF.record, PF.units, PF.roi]));
  check("performance.js: one daily point, bySport NBA 1-1, 3 recent, void excluded", PF.daily.length === 1 && PF.bySport[0].record === "1-1" && PF.recent.length === 3);
  check("performance.js: clv summary: 2 of 3 with price CLV, both negative, one line moved toward us, all three closes DraftKings' from ESPN", PF.clv && PF.clv.n === 2 && PF.clv.graded === 3 && near(PF.clv.avg, (mlClv + totClv) / 2 * 100, 0.02) && PF.clv.beat === 0 && PF.clv.beatPct === 0 && PF.clv.lineToward === 1 && PF.clv.lineAway === 0 && PF.clv.sgoCloses === 0 && PF.clv.espnCloses === 3, JSON.stringify(PF.clv));
  check("performance.js: recent rows carry clv, closing price/line, source and line direction", near(PF.recent.find(r => r.pick === "Milwaukee Bucks ML").clv, mlClv, 0.001) && PF.recent.find(r => r.pick === "Milwaukee Bucks ML").closeOdds === 150 && PF.recent.find(r => r.pick === "Boston Celtics -3").clv === null && PF.recent.find(r => r.pick === "Boston Celtics -3").lineMove === "toward" && /DraftKings close \(ESPN\)/.test(PF.recent.find(r => r.pick === "Over 214").closeSource));
  check("picks.js: board picks carry commence, sportKey, outcome and book count for the digest, live status and line shopping", PD.picks.every(p => /^\d{4}-/.test(p.commence) && p.sportKey && p.outcome && p.outcome.name && p.books >= 3));
  check("performance.js: the record by grade keeps the old price-edge picks apart from the game-data picks (3 graded on price; 4 pending on game data since 2026-11-05)", PF.byBasis && PF.byBasis.price.n === 3 && PF.byBasis.price.pending === 0 && PF.byBasis.game.n === 0 && PF.byBasis.game.pending === 4 && PF.byBasis.game.since === "2026-11-05" && PF.recent.every(r => r.basis === "price"), JSON.stringify(PF.byBasis));

  /* context + breakdown (fixture ESPN scoreboard, injuries, schedules, weather), written around the model's reasons */
  const celticsPub = PD.picks.find(p => p.pick === "Boston Celtics ML"), arsenalPub = PD.picks.find(p => p.pick === "Arsenal ML"), underPub = PD.picks.find(p => p.pick === "Under 226.5");
  check("breakdown: every board pick explains its tier from our probability and the price, states the rule, and names its bar and the Medium and High steps past it", PD.picks.every(p => p.breakdown && /^Our probability for this side is \d+\.\d%, from the game data/.test(p.breakdown.tierWhy) && /Its bar is 3\.0 points: the floor/.test(p.breakdown.tierWhy) && p.breakdown.tierWhy.indexOf("Medium needs 2.0 points past the bar, High 5.0 points") !== -1 && /Nothing here is graded against other books' prices/.test(p.breakdown.tierWhy) && p.breakdown.tier === p.confidence), celticsPub && celticsPub.breakdown.tierWhy);
  check("breakdown: the model's reasons are the support and risks: ratings, form, home edge, the Bucks' back-to-back and Lillard for the Celtics; Tatum out against", celticsPub.breakdown.support.some(t => /rate \+5\.1 a game/.test(t)) && celticsPub.breakdown.support.some(t => /second night of a back-to-back/.test(t)) && celticsPub.breakdown.support.some(t => /Lillard/.test(t)) && celticsPub.breakdown.support.some(t => /Projected margin \+9\.6/.test(t)) && celticsPub.breakdown.risks.some(t => /without Jayson Tatum/.test(t)), JSON.stringify([celticsPub.breakdown.support, celticsPub.breakdown.risks]));
  check("breakdown: no line is listed twice (the context's own injury and rest rules stand down when the model carries them)", (function () { const all = celticsPub.breakdown.support.concat(celticsPub.breakdown.risks); return all.filter(t => /Tatum/.test(t)).length === 1 && all.filter(t => /back-to-back/.test(t)).length === 1; })(), JSON.stringify(celticsPub.breakdown.risks));
  check("breakdown: rest is calendar days in Eastern time (the Bucks played the night before: back-to-back; the Celtics two days ago) and the model prices it", celticsPub.context.rest["Milwaukee Bucks"].b2b === true && celticsPub.context.rest["Milwaukee Bucks"].restDays === 1 && celticsPub.context.rest["Boston Celtics"].restDays === 2 && celticsPub.model.parts.rest === 1.5, JSON.stringify(celticsPub.context.rest));
  check("breakdown: the under's case is scoring: combined scoring, the projected total against the number, scorers out and tired legs", underPub && underPub.breakdown.support.some(t => /Combined scoring/.test(t)) && underPub.breakdown.support.some(t => /Projected total 216\.8 against 226\.5/.test(t)) && underPub.breakdown.support.some(t => /Scorers out/.test(t)) && underPub.breakdown.support.some(t => /tired legs lean under/.test(t)), underPub && JSON.stringify(underPub.breakdown.support));
  check("breakdown: indoor venue, records and TV in context", celticsPub.context.indoor === true && celticsPub.context.records["Boston Celtics"].overall === "5-2" && celticsPub.context.broadcast === "ESPN");
  check("breakdown: outdoor soccer gets Open-Meteo wind and rain at kickoff", arsenalPub.context.weather && arsenalPub.context.weather.windMph === 19 && arsenalPub.context.weather.precipPct === 70 && arsenalPub.context.weather.source === "Open-Meteo", JSON.stringify(arsenalPub.context.weather));
  check("breakdown: rough weather on a side pick is listed as a risk", arsenalPub.breakdown.risks.some(t => /Weather at kickoff/.test(t)));
  check("breakdown: where the market sits is a note, for reference only, never support or risk; verdict written", celticsPub.breakdown.notes.some(t => /^Where the market sits: the de-vigged consensus of 4 books makes this side 58\.9%.*For reference only\.$/.test(t)) && !celticsPub.breakdown.support.concat(celticsPub.breakdown.risks).some(t => /fair line|sharp|consensus/i.test(t)) && typeof celticsPub.breakdown.verdict === "string" && celticsPub.breakdown.verdict.length > 10, JSON.stringify(celticsPub.breakdown.notes));
  check("movement: a fresh pick records its first price in history, with the market's fair kept for the close", celticsPub.movement === null && log.find(e => e.pick === "Boston Celtics ML" && e.loggedAt).history.length === 1 && near(log.find(e => e.pick === "Boston Celtics ML" && e.loggedAt).history[0].fair, 0.5885, 0.001));
  /* DraftKings open -> now from the scoreboard fixture: Celtics ML opened -150, now -160 (market moved toward); spread opened -3.5, now -4.5 */
  check("dk: the board pick carries DraftKings open/now, direction and one history point", celticsPub.dk && celticsPub.dk.book === "DraftKings" && celticsPub.dk.open.odds === -150 && celticsPub.dk.now.odds === -160 && celticsPub.dk.moved === "toward" && celticsPub.dkHistory.length === 1 && celticsPub.dkHistory[0].odds === -160, JSON.stringify(celticsPub.dk));
  check("dk: market movement is a note marked Market, never support or risk (prices do not grade a play)", celticsPub.breakdown.notes.some(t => /^Market: DraftKings opened -150, now -160, moving toward/.test(t)) && !celticsPub.breakdown.support.concat(celticsPub.breakdown.risks).some(t => /DraftKings/.test(t)), JSON.stringify(celticsPub.breakdown.notes));
  /* SportsGameOdds on the board: nine-book prices merged on the pick's line, the market's drift since open */
  check("sgo: board pick carries the second source: 6 books on the line (William Hill folded into Caesars), best -150 at DraftKings", celticsPub.sgo && celticsPub.sgo.n === 6 && celticsPub.sgo.best.book === "DraftKings" && celticsPub.sgo.best.odds === -150 && near(celticsPub.sgo.vendorFair, 0.6226, 0.001), JSON.stringify(celticsPub.sgo));
  check("sgo: prices map gains PointsBet and Unibet and refreshes the shared books; the logged price and book stay", celticsPub.prices.PointsBet === -195 && celticsPub.prices.Unibet === -175 && celticsPub.prices.FanDuel === -160 && celticsPub.prices.Caesars === -190 && celticsPub.odds === -145 && celticsPub.book === "Caesars" && /^2026-11-05T15/.test(celticsPub.pricesAt), JSON.stringify(celticsPub.prices));
  check("sgo: consensus drift (-150 open -> -165 now) is a Market note, not support; no book beats the logged -145", celticsPub.mkt && celticsPub.mkt.moved === "toward" && celticsPub.breakdown.notes.some(t => /^Market: The market \(6 books\) opened -150, now -165/.test(t)) && !celticsPub.breakdown.support.some(t => /better price/.test(t)) && celticsPub.sgoHistory.length === 1, JSON.stringify(celticsPub.mkt));
  check("sgo: the soccer pick is untouched (league not covered)", !arsenalPub.sgo && !arsenalPub.mkt && log.find(e => e.pick === "Arsenal ML").sgoEventId == null);
  check("sgo: the log remembers the vendor event id so later runs fetch by id", log.find(e => e.pick === "Boston Celtics ML" && e.loggedAt).sgoEventId === "sgo-nba-fix-1" && r1.sgo.enabled && r1.sgo.entities >= 1, JSON.stringify(r1.sgo));
  check("dk: context.odds holds the full DraftKings snapshot (spread -4.5, total 226.5)", celticsPub.context.odds && celticsPub.context.odds.now.spread === -4.5 && celticsPub.context.odds.now.total === 226.5 && celticsPub.context.odds.open.spread === -3.5);
  check("dk: direction maths: spreads, totals, moneylines, unchanged", (() => { const C = require("./context.js"); const sp = { marketKey: "spreads", outcome: { name: "X" } }, ov = { marketKey: "totals", outcome: { name: "Over" } }, un = { marketKey: "totals", outcome: { name: "Under" } }, ml = { marketKey: "h2h", outcome: { name: "X" } };
    return C.movedToward(sp, { line: -3, odds: -110 }, { line: -3.5, odds: -110 }) === "toward" && C.movedToward(sp, { line: 3, odds: -110 }, { line: 3.5, odds: -110 }) === "away" && C.movedToward(ov, { line: 44.5 }, { line: 46 }) === "toward" && C.movedToward(un, { line: 44.5 }, { line: 46 }) === "away" && C.movedToward(ml, { odds: 130 }, { odds: 120 }) === "toward" && C.movedToward(ml, { odds: 130 }, { odds: 130 }) === null && C.movedToward(sp, { line: -3, odds: -110 }, { line: -3, odds: -120 }) === "toward"; })());

  /* the market board file: every main-line market priced this run, pick / watch / none, best edge first */
  const mk3 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "market.js"), "utf8"), mk3);
  const MK = mk3.window.MARKET_DATA;
  check("market.js: 11 markets in 2 games (NBA 6, EPL 5), sorted by our edge, picks flagged with their id, thresholds and basis published; the Over 2.5 goals, 2.6 points over the price on the unrounded total, is a watch", MK && MK.rows.length === 11 && MK.games === 2 && MK.modelled === 2 && MK.basis === "game" && MK.rows.every((r, i) => i === 0 || r.edge <= MK.rows[i - 1].edge) && MK.rows.filter(r => r.status === "pick").length === 4 && MK.rows.find(r => r.pick === "Over 2.5 goals").status === "watch" && MK.rows.find(r => r.pick === "Boston Celtics ML").pickId === celtics.id && MK.rows.find(r => r.pick === "Milwaukee Bucks ML").status === "none" && MK.threshold === 0.03 && MK.watch === 0.015 && r1.market === 11, MK && JSON.stringify(MK.rows.map(r => r.pick + ":" + r.status)));
  check("market.js: rows carry what the board needs (start label, prices, our probability, edge, ev, the market reference, the model flag)", MK.rows.every(r => /ET$/.test(r.start) && r.prices && Object.keys(r.prices).length >= 3 && typeof r.modelProb === "number" && typeof r.ev === "number" && typeof r.marketFair === "number" && r.modelled === true && "anchor" in r && r.outcome && r.event));
  check("market.js: the Bucks side the books like (+160, market 41%) is 25% to the model: priced against you, not a pick", (r => r && near(r.modelProb, 0.251, 0.001) && near(r.marketFair, 0.4115, 0.001) && r.edge < 0)(MK.rows.find(r => r.pick === "Milwaukee Bucks ML")));

  /* play of the day and parlay of the day on the fixture board */
  check("potd: Under 226.5 (the highest EV on the model's numbers) is play of the day and is flagged in the log", PD.playOfDay && PD.playOfDay.pick === "Under 226.5" && log.find(e => e.potd === "2026-11-05").pick === "Under 226.5", PD.playOfDay && PD.playOfDay.pick);
  check("potd: board picks carry prices per book and ev", PD.picks.every(p => p.prices && Object.keys(p.prices).length >= 3 && typeof p.ev === "number"));
  check("parlay: two legs from different games at one book where both are +EV on the model (Under 226.5 and Arsenal ML at FanDuel)", PD.parlayOfDay && PD.parlayOfDay.legs.length === 2 && PD.parlayOfDay.book === "FanDuel" && PD.parlayOfDay.legs.map(l => l.pick).sort().join() === "Arsenal ML,Under 226.5", PD.parlayOfDay && JSON.stringify([PD.parlayOfDay.book, PD.parlayOfDay.legs.map(l => l.pick)]));

  /* parlay maths and grading on synthetic legs */
  const mk = (id, fair, prices, ev) => ({ id: id, eventId: "ev-" + id, modelProb: fair, prices: prices, status: "pending" });
  const A = mk("A", 0.55, { DraftKings: 100, FanDuel: -105 }), B = mk("B", 0.6, { DraftKings: -110, FanDuel: -120 }), C = mk("C", 0.5, { DraftKings: -130 });
  const par = P.bestParlay([A, B, C]);
  check("parlay: picks DraftKings A+B (C is -EV at DK), +282, EV +26%", par && par.book === "DraftKings" && par.legs.join() === "A,B" && par.odds === 282 && near(par.ev, 0.26, 0.01), JSON.stringify(par));
  check("parlay: same-event legs never combine", P.bestParlay([A, Object.assign(mk("A2", 0.6, { DraftKings: 100 }), { eventId: "ev-A" })]) === null);
  const plog = () => [Object.assign({}, A), Object.assign({}, B), { type: "parlay", id: "parlay-x", legs: ["A", "B"], legPrices: [100, -110], status: "pending", units: 0 }];
  let L = plog(); L[0].status = "graded"; L[0].result = "Win"; L[1].status = "graded"; L[1].result = "Win"; P.gradeParlays(L, new Date());
  check("parlay grading: two wins pay the combined price (+2.82u)", L[2].result === "Win" && near(L[2].units, 2.82, 0.01), String(L[2].units));
  L = plog(); L[0].status = "graded"; L[0].result = "Win"; L[1].status = "graded"; L[1].result = "Push"; P.gradeParlays(L, new Date());
  check("parlay grading: a push drops out, the rest pays as a single (+1.00u)", L[2].result === "Win" && near(L[2].units, 1.0, 0.01));
  L = plog(); L[0].status = "graded"; L[0].result = "Loss"; L[1].status = "graded"; L[1].result = "Win"; P.gradeParlays(L, new Date());
  check("parlay grading: any loss loses the parlay", L[2].result === "Loss" && L[2].units === -1);
  L = plog(); L[0].status = "void"; P.gradeParlays(L, new Date());
  check("parlay grading: a void leg voids the parlay", L[2].status === "void");
  L = plog(); L[0].status = "graded"; L[0].result = "Win"; P.gradeParlays(L, new Date());
  check("parlay grading: waits until every leg is settled", L[2].status === "pending");
  check("potd: sticks to the first choice for the day", (() => { const l = [{ id: "x", potd: "2026-11-05", ev: 0.01 }]; return P.choosePlayOfDay(l, [{ id: "y", ev: 0.5, edge: 0.1 }], "2026-11-05").id === "x"; })());

  /* pricing every outcome: the main line qualifies, alternate lines and negative edges are priced but never picked */
  const nbaEv = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "odds.json"), "utf8")).find(e => e.id === "nba-fix-1");
  const nbaCfg = P.SPORTS.find(s => s.key === "basketball_nba");
  const priced = P.priceOutcomes(nbaCfg, nbaEv);
  const celticsSide = priced.find(c => c.market === "h2h" && c.outcome.name === "Boston Celtics");
  check("priceOutcomes: six outcomes on the fixture game, all on main lines, Celtics ML priced with a negative market edge", priced.length === 6 && priced.every(c => c.qualifies) && celticsSide && celticsSide.edge < 0 && celticsSide.marketEdge < 0 && celticsSide.odds === -145, JSON.stringify(priced.map(c => c.outcome.name + ":" + c.qualifies)));
  check("priceWithModel: without a model no side has a probability or an edge and none can be a pick; with one, both sides of a market sum to one and the list is by our edge", (() => { const none = P.priceWithModel(null, nbaEv, P.priceOutcomes(nbaCfg, nbaEv)); const withM = P.priceWithModel(gmFix, nbaEv, P.priceOutcomes(nbaCfg, nbaEv)); const ml = withM.filter(c => c.market === "h2h"), sp = withM.filter(c => c.market === "spreads"), tot = withM.filter(c => c.market === "totals"); return none.every(c => c.fair === null && c.edge === null && c.model === null && typeof c.marketFair === "number") && P.analyzeEvent(nbaCfg, nbaEv, none).length === 0 && near(ml[0].fair + ml[1].fair, 1, 1e-3) && near(sp[0].fair + sp[1].fair, 1, 1e-3) && near(tot[0].fair + tot[1].fair, 1, 1e-3) && withM.every((c, i) => i === 0 || c.edge <= withM[i - 1].edge) && withM.every(c => c.model && c.model.reasons); })());
  check("model: only one goalie or quarterback plays, so a second one listed out costs nothing more; skaters and other positions still add up", (() => {
    const nhl = M.SPORT.icehockey_nhl, nfl = M.SPORT.americanfootball_nfl, nba = M.SPORT.basketball_nba;
    const g = (name, status) => ({ name: name, pos: "G", status: status }), sk = name => ({ name: name, pos: "C", status: "Out" });
    const one = M.injuryCost([g("Starter", "Out")], nhl), two = M.injuryCost([g("Starter", "Out"), g("Backup", "Out")], nhl);
    const mixed = M.injuryCost([g("Starter", "Out"), g("Backup", "Day-To-Day"), sk("Centre"), sk("Wing")], nhl);
    const qbs = M.injuryCost([{ name: "QB1", pos: "QB", status: "Out" }, { name: "QB2", pos: "QB", status: "Out" }, { name: "WR", pos: "WR", status: "Out" }], nfl);
    const nbaTwo = M.injuryCost([{ name: "A", pos: "G", status: "Out" }, { name: "B", pos: "G", status: "Out" }], nba, () => null);
    return near(one.cost, 0.5, 1e-9) && near(two.cost, 0.5, 1e-9) && two.out.length === 2 && near(mixed.cost, 0.5 + 0.24, 1e-9) && mixed.out.length === 3 && mixed.soft.length === 1 && near(qbs.cost, 4.5, 1e-9) && near(qbs.scoring, 2, 1e-9) && near(nbaTwo.cost, 2.4, 1e-9);
  })());
  check("model (fallback, no game log): by the listing date, an absence the results already show costs nothing more; one listed after the team's last game costs in full; no date counts in full", (() => {
    const nhl = M.SPORT.icehockey_nhl, day = d => Date.parse("2026-10-" + String(d).padStart(2, "0") + "T23:00:00Z");
    const form = { gp: 4, games: [day(10), day(14), day(18), day(22)].map(t => ({ date: t })) }, share = M.unseenShare(form);
    const sk = (date) => ({ name: "S", pos: "C", status: "Out", date: date });
    const before = share(sk("2026-10-01T12:00Z")), half = share(sk("2026-10-16T12:00Z")), after = share(sk("2026-10-30T12:00Z")), none = share(sk(null));
    const cost = d => M.injuryCost([sk(d)], nhl, null, share);
    return before === 0 && near(half, 0.5, 1e-9) && after === 1 && none === 1 && cost("2026-10-01T12:00Z").cost === 0 && cost("2026-10-01T12:00Z").out.length === 0 && near(cost("2026-10-16T12:00Z").cost, 0.06, 1e-9) && near(cost("2026-10-30T12:00Z").cost, 0.12, 1e-9) && M.unseenShare(null)(sk("2026-10-30T12:00Z")) === 1;
  })());
  /* the games a listed player actually played (2026-11-05): ESPN re-dates its injury entries every few days, so the
     listing date charged players who had missed every game. scripts/fixtures/espn/ctx-injuries-basketball-nba-gamelogs.json
     is the report in ESPN's live shape (no athlete.id; the id is in the player-card link), with game logs for three of
     its four players: George played all 7 Celtics games (plus a preseason game), Brown none (ESPN answers with his
     2025-26 season), Kuzma 4 of the Bucks' 8 (plus one for Cleveland before a trade), Trent has no log */
  check("game logs: the injury report's athlete id comes from the player-card link or the headshot (ESPN's report has no athlete.id)", CTX.athleteIdOf({ links: [{ href: "https://www.espn.com/nba/player/_/id/3102531/kristaps-porzingis" }] }) === "3102531" && CTX.athleteIdOf({ headshot: { href: "https://a.espncdn.com/i/headshots/nhl/players/full/3042086.png" } }) === "3042086" && CTX.athleteIdOf({ id: 7, links: [] }) === "7" && CTX.athleteIdOf({}) === null);
  check("game logs: appearances reads this season only; an older latest season (or no season at all) is no games; a newer season, an error body or nothing is unknown", (() => {
    const gl = n => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", "ctx-gamelog-basketball-nba-" + n + ".json"), "utf8"));
    const george = CTX.appearances(gl("4251"), "2027"), brown = CTX.appearances(gl("4066261"), "2027"), kuzma = CTX.appearances(gl("3134907"), "2027");
    return george.length === 8 && george.every(a => a.team === "2") && Array.isArray(brown) && brown.length === 0 && kuzma.length === 5 && kuzma.filter(a => a.team === "5").length === 1
      && CTX.appearances({ filters: [{ name: "league", value: "nba" }] }, "2027").length === 0 && CTX.appearances(gl("4251"), "2026") === null
      && CTX.appearances({ code: 404, message: "Game log not found" }, "2027") === null && CTX.appearances(null, "2027") === null && CTX.appearances(gl("4251"), null) === null;
  })());
  await (async () => {
    const injFile = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", "ctx-injuries-basketball-nba-gamelogs.json"), "utf8"));
    /* a fifth listing whose cost is zero anyway (no points a game) is never looked up */
    injFile.injuries[1].injuries.push({ status: "Out", date: "2026-11-05T14:00Z", athlete: { displayName: "Zero Points", links: [{ href: "https://www.espn.com/nba/player/_/id/9999999/zero-points" }], position: { abbreviation: "G" } }, details: {} });
    const asked = [];
    const base = CTX.source({ fixture: true });
    const src = Object.assign({}, base, { injuries: async () => injFile, gamelog: async (sport, id) => { asked.push(id); return base.gamelog(sport, id); } });
    const ppg = n => n.name === "Paul George" ? 20.7 : n.name === "Zero Points" ? 0 : null;
    const ev = { sportKey: "basketball_nba", home: "Boston Celtics", away: "Milwaukee Bucks", commence: "2026-11-06T00:00:00Z" };
    const cache = { ppgOf: ppg };
    const gm = await M.forEvent(src, CTX, ev, new Date(NOW), cache);
    const again = await M.forEvent(src, CTX, ev, new Date(NOW), cache);
    /* the same game with no game logs at all: the listing date, as before */
    const old = await M.forEvent(Object.assign({}, base, { injuries: async () => injFile, gamelog: undefined }), CTX, ev, new Date(NOW), { ppgOf: ppg });
    const nba = M.SPORT.basketball_nba, sched = n => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", "ctx-schedule-basketball-nba-" + n + ".json"), "utf8"));
    const bos = M.teamForm(sched("2"), "2", Date.parse(ev.commence)), mil = M.teamForm(sched("15"), "15", Date.parse(ev.commence));
    const L = (side, name) => gm.injuries[side].find(i => i.name === name);
    /* the points the model uses, in its order: data/faces.js (here the ppg stand-in), then the game log, then none (1.2) */
    const ppgUsed = i => ppg(i) != null ? ppg(i) : Number.isFinite(i.logPpg) ? i.logPpg : null;
    const one = (side, name, form) => M.injuryCost([L(side, name)], nba, ppgUsed, M.unseenShare(form));
    const george = one("home", "Paul George", bos), brown = one("home", "Jaylen Brown", bos), kuzma = one("away", "Kyle Kuzma", mil), trent = one("away", "Gary Trent Jr.", mil);
    const brownByDate = M.injuryCost([Object.assign({}, L("home", "Jaylen Brown"), { played: undefined })], nba, ppgUsed, M.unseenShare(bos));
    const withoutLine = gm.reasons.find(r => /^Boston Celtics without/.test(r.label));
    check("game logs: a player who missed every game costs 0 and is not named (Brown: 0 of 7; the listing date, re-dated the day before, charged him in full)", bos.gp === 7 && L("home", "Jaylen Brown").played === 0 && brown.cost === 0 && brown.out.length === 0 && near(brownByDate.cost, 1.2, 1e-9) && withoutLine && !/Brown/.test(withoutLine.label), JSON.stringify([L("home", "Jaylen Brown"), brownByDate.cost]));
    check("game logs: a player who played every game costs in full (George: 7 of 7, the preseason game left out; 12% of 20.7 points)", L("home", "Paul George").athleteId === "4251" && L("home", "Paul George").played === 7 && near(george.cost, 0.12 * 20.7, 1e-9) && /Paul George/.test(withoutLine.label), JSON.stringify(L("home", "Paul George")));
    check("game logs: half the games, half the cost (Kuzma: 4 of the Bucks' 8, the game he played for Cleveland left out; day-to-day at half weight, 12% of his own 19.5 points a game)", mil.gp === 8 && L("away", "Kyle Kuzma").played === 4 && near(kuzma.cost, 0.5 * 0.12 * 19.5 * 0.5, 1e-9), JSON.stringify(L("away", "Kyle Kuzma")));
    check("game logs: no game log falls back to the listing date (Trent, listed Oct 28: 3 of the Bucks' 8 games before it)", L("away", "Gary Trent Jr.").played === undefined && near(trent.cost, 1.2 * 3 / 8, 1e-9));
    check("game logs: one request per costed listing with an id, cached for the run; a listing that costs nothing is not looked up", asked.length === 4 && asked.indexOf("9999999") === -1 && !!again && near(again.margin, gm.margin, 1e-9), JSON.stringify(asked));
    const tot = (g, side, form) => M.injuryCost(g.injuries[side], nba, ppgUsed, M.unseenShare(form)).cost;
    check("game logs: a scorer's points come from data/faces.js first, then his own game log this season (regular-season games for this club), then the 1.2 default", near(L("home", "Paul George").logPpg, 21, 1e-9) && near(george.cost, 0.12 * 20.7, 1e-9) && near(L("away", "Kyle Kuzma").logPpg, 19.5, 1e-9) && near(one("away", "Kyle Kuzma", mil).cost, 0.5 * 0.12 * 19.5 * 0.5, 1e-9) && L("away", "Gary Trent Jr.").logPpg === undefined && near(trent.cost, 1.2 * 3 / 8, 1e-9) && L("home", "Jaylen Brown").logPpg === undefined, JSON.stringify([L("home", "Paul George").logPpg, L("away", "Kyle Kuzma").logPpg]));
    const dHome = tot(old, "home", bos) - tot(gm, "home", bos), dAway = tot(old, "away", mil) - tot(gm, "away", mil);
    check("game logs: the model moves by what changed, never by the price (the Celtics' cost falls by Brown's 1.2; the Bucks' barely, Kuzma at half his games but at his own 19.5 points a game, 0.585, against the 1.2 default in full, 0.6)", near(dHome, 1.2, 1e-9) && near(dAway, 0.6 - 0.585, 1e-9) && near(gm.parts.injuriesHome, -tot(gm, "home", bos), 0.051) && near(gm.parts.injuriesAway, tot(gm, "away", mil), 0.051) && near(gm.margin - old.margin, dHome - dAway, 1e-9), JSON.stringify([old.parts.injuriesHome, gm.parts.injuriesHome, old.parts.injuriesAway, gm.parts.injuriesAway, old.margin, gm.margin]));
  })();
  /* NBA game-day availability (2026-11-08; the owner: the model should know who actually plays tonight). The league's
     official injury report (a PDF published every 15 minutes, read with no dependency), merged with ESPN's list newest
     first, costed by how often each status misses, logged with every NBA pick and checked again by every later run (a
     flag only: the pick stays locked). The PDF fixture is the real report of 2026-11-05, 5:30 PM ET */
  const AV = require("./availability.js");
  const rep = AV.parseReport(fs.readFileSync(path.join(__dirname, "fixtures", "nba", "Injury-Report_2026-11-05_05_30PM.pdf")));
  check("official report: read with no dependency: its own time (5:30 PM ET is 22:30 UTC) and every row on all five pages (the column heads are on page one only), 15 for tonight and 49 for tomorrow", !!rep && rep.at === "2026-11-05T22:30:00.000Z" && rep.label === "5:30 PM ET" && rep.rows.length === 64 && rep.rows.filter(r => r.gameDate === "2026-11-05").length === 15 && rep.rows.filter(r => r.gameDate === "2026-11-06").length === 49, rep && JSON.stringify([rep.at, rep.rows.length]));
  check("official report: names turned round (Butler III, Jimmy; Udeh, Jr., Ernest), words spaced from the font's widths, blank cells filled from the row above, clubs that have not submitted marked", (() => {
    const f = n => rep.rows.find(r => r.name === n), p = f("Payton Pritchard");
    return !!f("Jimmy Butler III") && !!f("Ernest Udeh Jr.") && !!p && p.status === "Questionable" && p.reason === "Injury/Illness - Right Eye Abrasion" && p.team === "Boston Celtics" && p.away === "BOS" && p.home === "CHA" && p.gameDate === "2026-11-06"
      && rep.teams.length === 22 && rep.teams.filter(t => !t.submitted).length === 10 && rep.teams.find(t => t.team === "Milwaukee Bucks").submitted === false && rep.teams.find(t => t.team === "Boston Celtics").submitted === true;
  })());
  check("official report: the URL for a moment is the 15-minute slot at or before it in Eastern time, then 15 minutes back (EDT and EST; past seasons' hourly names)", AV.reportUrls(Date.parse("2026-11-08T18:44:00Z"), 2).join() === AV.REPORT_BASE + "2026-11-08_01_30PM.pdf," + AV.REPORT_BASE + "2026-11-08_01_15PM.pdf" && AV.reportName(Date.parse("2026-10-25T14:00:00Z")) === "2026-10-25_10_00AM" && AV.reportName(Date.parse("2026-11-09T05:07:00Z")) === "2026-11-09_12_00AM" && AV.reportName(Date.parse("2025-01-15T22:30:00Z"), true) === "2025-01-15_05PM" && AV.etToUtc(2026, 3, 8, 15, 0) === Date.parse("2026-03-08T19:00:00Z"));
  check("availability: how often each status misses is ordered (Out, Doubtful, Questionable, Probable, Available) and Available is nothing", AV.MISS.out >= AV.MISS.doubtful && AV.MISS.doubtful > AV.MISS.questionable && AV.MISS.questionable > AV.MISS.probable && AV.MISS.probable < M.MIN_MISS && AV.MISS.available === 0, JSON.stringify(AV.MISS));
  check("availability: report and ESPN merged newest first: ESPN's day-to-day becomes the report's Out (Nic / Nicolas Claxton), a player only the report names gets his id from the roster, one ESPN lists but a newer submitted report leaves off is available, a newer ESPN entry wins, an unsubmitted club or a game the report does not carry keeps ESPN's list", (() => {
    const club = (n, t) => CTX.teamMatches(n, { displayName: t, name: t.split(" ").pop(), location: "" });
    const row = (team, name, status) => ({ gameDate: "2026-11-05", team: team, name: name, status: status, reason: "Injury/Illness - Test" });
    const r = { at: "2026-11-05T22:30:00.000Z", label: "5:30 PM ET", rows: [row("Boston Celtics", "Nicolas Claxton", "Out"), row("Boston Celtics", "Sam Hauser", "Questionable"), row("Boston Celtics", "Payton Pritchard", "Probable")], teams: [{ team: "Boston Celtics", gameDate: "2026-11-05", submitted: true }, { team: "Milwaukee Bucks", gameDate: "2026-11-05", submitted: false }] };
    const espn = [{ name: "Nic Claxton", status: "Day-To-Day", athleteId: "1", date: "2026-11-05T15:00Z" }, { name: "Jayson Tatum", status: "Out", athleteId: "2", date: "2026-11-01T15:00Z" }, { name: "Payton Pritchard", status: "Out", athleteId: "3", date: "2026-11-05T23:10Z" }];
    const m = AV.mergeTeam(espn, r, "Boston Celtics", "2026-11-05", club, [{ name: "Sam Hauser", id: "4065804", pos: "F" }]), g = n => m.find(i => i.name === n) || {};
    const mil = AV.mergeTeam([{ name: "Damian Lillard", status: "Day-To-Day", date: "2026-11-04T15:00Z" }], r, "Milwaukee Bucks", "2026-11-05", club, null);
    const tomorrow = AV.mergeTeam(espn, r, "Boston Celtics", "2026-11-06", club, null);
    return g("Nic Claxton").status === "Out" && g("Nic Claxton").source === "official" && g("Nic Claxton").miss === 1 && g("Nic Claxton").espn.status === "Day-To-Day" && g("Nic Claxton").athleteId === "1" && g("Nic Claxton").at === r.at
      && g("Sam Hauser").athleteId === "4065804" && g("Sam Hauser").pos === "F" && g("Sam Hauser").miss === AV.MISS.questionable && g("Sam Hauser").report === "5:30 PM ET"
      && g("Jayson Tatum").status === "Available" && g("Jayson Tatum").miss === 0 && g("Payton Pritchard").source === "espn" && g("Payton Pritchard").status === "Out" && g("Payton Pritchard").official.status === "Probable"
      && mil.length === 1 && mil[0].source === "espn" && mil[0].status === "Day-To-Day" && tomorrow.length === 3 && tomorrow.every(i => i.source === "espn");
  })());
  check("availability: the cost reads how often a status misses (Out in full, Questionable at its share, Probable nothing and not named) and names the report; a player ESPN still lists whom the report has available is said so", (() => {
    const nba = M.SPORT.basketball_nba, o = (name, pos, status, extra) => Object.assign({ name: name, pos: pos, status: status, miss: AV.MISS[status.toLowerCase()], source: "official", report: "5:30 PM ET" }, extra || {});
    const c = M.injuryCost([o("A", "G", "Out"), o("B", "F", "Questionable"), o("C", "C", "Probable"), o("D", "G", "Available", { espn: { status: "Out" } })], nba, () => 20);
    return near(c.cost, 2.4 + 2.4 * AV.MISS.questionable, 1e-9) && c.out.join() === "A (G)" && c.soft.join() === "B (F) questionable" && c.cleared.length === 1 && c.cleared[0].label === "D (G)" && c.cleared[0].status === "available" && c.report === "5:30 PM ET" && c.espnToo === false && c.items.length === 4 && near(c.items[2].full, 2.4, 1e-9) && c.items[2].cost === 0;
  })());
  await (async () => {
    const am = path.join(__dirname, "fixtures", "nba", "official-2026-11-05-0930.json");
    const ev = { sportKey: "basketball_nba", home: "Boston Celtics", away: "Milwaukee Bucks", commence: "2026-11-06T00:00:00Z" };
    const ppg = M.ppgFromFaces(path.join(__dirname, "fixtures", "sample-faces.js"));
    const gm = await M.forEvent(CTX.source({ fixture: true, officialReport: am }), CTX, ev, new Date(NOW), { ppgOf: ppg });
    const base = await M.forEvent(CTX.source({ fixture: true }), CTX, ev, new Date(NOW), { ppgOf: ppg });
    const off = await M.forEvent(CTX.source({ fixture: true, officialReport: am }), CTX, ev, new Date(NOW), { ppgOf: ppg, officialReport: false });
    const given = await M.forEvent(CTX.source({ fixture: true }), CTX, Object.assign({}, ev, { availability: JSON.parse(fs.readFileSync(am, "utf8")) }), new Date(NOW), { ppgOf: ppg });
    const a = gm && gm.availability, H = n => (a.home.find(i => i.name === n) || {}), Aw = n => (a.away.find(i => i.name === n) || {});
    check("availability: forEvent reads the report as of the run, merges it with ESPN's and logs what it knew, when and from where (Lillard: ESPN's day-to-day, Out per the 9:30 AM ET report; Hauser only on the report, his id from the club's roster)", !!a && a.read === new Date(NOW).toISOString() && a.report.label === "9:30 AM ET" && a.report.at === "2026-11-05T14:30:00.000Z" && a.onReport.home === true && a.onReport.away === true
      && Aw("Damian Lillard").status === "Out" && Aw("Damian Lillard").source === "official" && Aw("Damian Lillard").miss === 1 && near(Aw("Damian Lillard").cost, 1.2, 1e-9) && H("Sam Hauser").athleteId === "4065804" && H("Sam Hauser").status === "Questionable" && H("Jayson Tatum").source === "official", JSON.stringify(a));
    check("availability: the margin moves by what the report changed (Lillard from half to full, +0.6 for the Celtics; Hauser at the questionable share of 12% of 7.1 points) and the reasons say which report", near(gm.margin - base.margin, 0.6 - 0.12 * 7.1 * AV.MISS.questionable, 1e-6) && gm.reasons.some(r => r.label === "Milwaukee Bucks without Damian Lillard (G) (+1.2), out per the 9:30 AM ET official report") && gm.reasons.some(r => r.label === "Boston Celtics have Sam Hauser (F) questionable per the 9:30 AM ET official report"), JSON.stringify([gm.margin, base.margin, gm.reasons.map(r => r.label)]));
    check("availability: with RULES.officialReport off the model reads ESPN's list alone, exactly as before; an explicit availability input stands in for the fetch; no other league reads a report", near(off.margin, base.margin, 1e-12) && off.availability.report === null && near(given.margin, gm.margin, 1e-12) && M.OFFICIAL.basketball_nba === true && Object.keys(M.OFFICIAL).length === 1);
  })();
  check("model: priced on the unrounded margin and total, shown to one decimal (the fixture's Celtics margin is 9.58, shown +9.6 on the pick, in its reasons and in its rationale; the probability is the whole number's)", (() => {
    const shown = M.publicModel(gmFix), rounded = Object.assign({}, gmFix, { margin: 9.6 }), cel = { name: "Boston Celtics", point: null };
    const full = M.sideProb(gmFix, "h2h", cel, "Boston Celtics", "Milwaukee Bucks"), atShown = M.sideProb(rounded, "h2h", cel, "Boston Celtics", "Milwaukee Bucks");
    return near(gmFix.margin, 9.5808, 1e-4) && shown.margin === 9.6 && near(gmFix.total, 216.7768, 1e-4) && shown.total === 216.8 && celtics.model.margin === 9.6 && near(celtics.modelProb, full, 1e-4) && full !== atShown
      && celtics.model.reasons.for.indexOf("Projected margin +9.6 for Boston Celtics") !== -1 && /projected margin \+9\.6 for the home side/.test(celtics.rationale || "");
  })(), JSON.stringify([gmFix.margin, gmFix.total, celtics.rationale && celtics.rationale.slice(0, 160)]));
  check("model: the EPL total is 2.88, not 2.9: the Over 2.5 goals is 57.2% on the whole number (57.7% on the rounded one), so it is a watch at -120, no longer a pick", (() => {
    const over = { name: "Over", point: 2.5 }, full = M.sideProb(gmEpl, "totals", over, "Arsenal", "Liverpool"), atShown = M.sideProb(Object.assign({}, gmEpl, { total: M.publicModel(gmEpl).total }), "totals", over, "Arsenal", "Liverpool");
    return near(gmEpl.total, 2.8789, 1e-4) && M.publicModel(gmEpl).total === 2.9 && near(full, 0.5717, 1e-4) && near(atShown, 0.5769, 1e-4) && full - P.implied(-120) < 0.03 && atShown - P.implied(-120) > 0.03;
  })());
  check("model: a number that would round onto its line is shown to two decimals, so the reason still says which side of it the projection falls", (() => {
    const g = { sportKey: "basketball_nba", margin: 0.04, total: 222.46, gp: 10, thin: false, reasons: [] };
    const over = M.sideReasons(g, "totals", { name: "Over", point: 222.5 }, "H", "A"), home = M.sideReasons(g, "h2h", { name: "H" }, "H", "A");
    const plain = M.sideReasons(Object.assign({}, g, { total: 216.7768 }), "totals", { name: "Under", point: 226.5 }, "H", "A");
    return over.against.indexOf("Projected total 222.46 against 222.5") !== -1 && home.for.indexOf("Projected margin +0.04 for H") !== -1 && plain.for.indexOf("Projected total 216.8 against 226.5") !== -1;
  })());
  check("game logs: a pitcher appears by turn, so his games are the stretch from his first appearance to his last; everyone else counts the games played", (() => {
    const games = Array.from({ length: 10 }, (_, k) => ({ id: "m" + k, date: "2026-05-" + String(k + 1).padStart(2, "0") + "T23:00Z", seasonType: { type: 2 }, competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: "home", team: { id: "1" }, score: { value: 5 } }, { homeAway: "away", team: { id: "2" }, score: { value: 3 } }] }] }));
    const sched = { events: games }, form = M.teamForm(sched, "1", Date.parse("2026-06-01T00:00Z"));
    const apps = [{ id: "m1", team: "1" }, { id: "m6", team: "1" }, { id: "m9", team: "2" }];
    return form.gp === 10 && M.playedIn(apps, sched, form, "1", "baseball_mlb", "SP") === 6 && M.playedIn(apps, sched, form, "1", "baseball_mlb", "1B") === 2 && M.playedIn(apps, sched, form, "1", "icehockey_nhl", "G") === 2 && M.playedIn([], sched, form, "1", "basketball_nba", "G") === 0 && M.playedIn(null, sched, form, "1", "basketball_nba", "G") === null;
  })());
  check("model: a team starts from part of last season instead of zero (carry-over), each league's last season named as ESPN numbers it; without one, the old shrinkage", (() => {
    const nba = M.SPORT.basketball_nba, f = { gp: 8, margin: 4, last5: 4 };
    const seasons = M.lastSeasonParam("basketball_nba", Date.parse("2026-11-05T00:00Z")) === "2026" && M.lastSeasonParam("icehockey_nhl", Date.parse("2027-02-01T00:00Z")) === "2026" && M.lastSeasonParam("americanfootball_nfl", Date.parse("2027-01-03T00:00Z")) === "2025" && M.lastSeasonParam("soccer_epl", Date.parse("2026-11-07T00:00Z")) === "2025" && M.lastSeasonParam("baseball_mlb", Date.parse("2027-06-01T00:00Z")) === "2026";
    return seasons && near(M.rating(f, nba, 2), (8 * 4 + nba.carry.k * nba.carry.c * 2) / (8 + nba.carry.k), 1e-9) && near(M.rating(f, nba), 4 * 8 / (8 + nba.k), 1e-9) && near(M.rating({ gp: 0 }, nba, 5), nba.carry.c * 5, 1e-9) && M.rating({ gp: 0 }, nba) === 0;
  })());
  check("model: a team's season counts soccer league matches (their season ids, not type 2) and leaves out US preseason and postseason", (() => {
    const ev = (id, type, date, us, them) => ({ date: date, seasonType: { type: type }, competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: "home", team: { id: "1" }, score: { value: us } }, { homeAway: "away", team: { id: "2" }, score: { value: them } }] }] });
    const soccer = M.teamForm({ events: [ev("a", 13481, "2026-10-01T15:00Z", 2, 1), ev("b", 13481, "2026-10-08T15:00Z", 0, 0)] }, "1", Date.parse("2026-11-01T00:00Z"));
    const us = M.teamForm({ events: [ev("c", 1, "2026-09-01T00:00Z", 30, 10), ev("d", 2, "2026-10-01T00:00Z", 100, 90), ev("e", 3, "2026-10-20T00:00Z", 90, 80)] }, "1", Date.parse("2026-11-01T00:00Z"));
    return soccer.gp === 2 && near(soccer.margin, 0.5, 1e-9) && us.gp === 1 && us.margin === 10;
  })());
  check("model: league scoring from standings without a games-played column (NBA, NFL) adds wins, losses and ties", near(M.leagueGoalsFrom({ children: [{ standings: { entries: [{ stats: [{ name: "pointsFor", value: 2300 }, { name: "wins", value: 6 }, { name: "losses", value: 4 }] }, { stats: [{ name: "pointsFor", value: 21000 }, { name: "wins", value: 50 }, { name: "losses", value: 40 }, { name: "ties", value: 0 }] }] } }] }), 23300 / 100, 1e-9));
  check("model: every league priced from its own calibration: NFL margins pile on 3, MLB keeps the home side's 53%, EPL draws a quarter of matches, NBA's curve is wider", (() => {
    const p = (sk, m, t, mk, o) => M.sideProb({ sportKey: sk, margin: m, total: t }, mk, o, "H", "A");
    const nfl = M.SPORT.americanfootball_nfl, across3 = p("americanfootball_nfl", 2.3, 45, "spreads", { name: "H", point: -2.5 }) - p("americanfootball_nfl", 2.3, 45, "spreads", { name: "H", point: -3.5 });
    const curve = M.Phi((2.3 - 2.5) / nfl.sd) - M.Phi((2.3 - 3.5) / nfl.sd); /* what a normal curve puts on the 3 */
    const nflOk = across3 > 1.6 * curve && p("americanfootball_nfl", 2.3, 45, "spreads", { name: "H", point: -3 }) < p("americanfootball_nfl", 2.3, 45, "spreads", { name: "H", point: -2.5 }) && near(p("americanfootball_nfl", 2.3, 45, "spreads", { name: "H", point: -3 }) + p("americanfootball_nfl", 2.3, 45, "spreads", { name: "A", point: 3 }), 1, 2e-4);
    const mlbHome = p("baseball_mlb", M.SPORT.baseball_mlb.homeEdge, 8.9, "h2h", { name: "H" });
    const mlbOk = mlbHome > 0.52 && mlbHome < 0.54 && near(mlbHome + p("baseball_mlb", 0.03, 8.9, "h2h", { name: "A" }), 1, 2e-4) && near(p("baseball_mlb", 0.03, 8.9, "spreads", { name: "H", point: -1.5 }) + p("baseball_mlb", 0.03, 8.9, "spreads", { name: "A", point: 1.5 }), 1, 2e-4) && near(p("baseball_mlb", 0.03, 8.9, "totals", { name: "Over", point: 8.5 }) + p("baseball_mlb", 0.03, 8.9, "totals", { name: "Under", point: 8.5 }), 1, 2e-4);
    const three = ["H", "Draw", "A"].map(n => p("soccer_epl", 0.24, 2.9, "h2h", { name: n }));
    const eplOk = near(three[0] + three[1] + three[2], 1, 3e-4) && three[1] > 0.22 && three[1] < 0.27 && three[0] > three[2] && near(p("soccer_epl", 0.24, 2.9, "totals", { name: "Over", point: 2.5 }) + p("soccer_epl", 0.24, 2.9, "totals", { name: "Under", point: 2.5 }), 1, 2e-4);
    const nbaOk = near(p("basketball_nba", 1.9, 228, "h2h", { name: "H" }), M.Phi(1.9 / 14.3), 2e-4);
    return nflOk && mlbOk && eplOk && nbaOk;
  })());
  check("model: hockey reads the league's own final scores moved to the game's projection; ratings lean on 35 games with a tenth on form; totals lean on the league's scoring; the standings give that scoring", (() => {
    const nhl = M.SPORT.icehockey_nhl, gm = (margin, total) => ({ sportKey: "icehockey_nhl", margin: margin, total: total });
    const ml = (g, s) => M.sideProb(g, "h2h", { name: s }, "H", "A"), pl = (g, s, pt) => M.sideProb(g, "spreads", { name: s, point: pt }, "H", "A"), ou = (g, s, pt) => M.sideProb(g, "totals", { name: s, point: pt }, "H", "A");
    const even = gm(0, 6.1), fav = gm(0.5, 6.1);
    const byTwo = nhl.shape.margin.filter(([d]) => d >= 2).reduce((s, x) => s + x[1], 0) / 2; /* an even game: the home side wins by two or more */
    const shape = near(ml(even, "H"), 0.5, 2e-4) && near(ml(fav, "H") + ml(fav, "A"), 1, 2e-4) && ml(fav, "H") > 0.5 &&
      near(pl(even, "H", -1.5), byTwo, 2e-4) && near(pl(fav, "H", -1.5) + pl(fav, "A", 1.5), 1, 2e-4) && pl(fav, "H", -1.5) > pl(even, "H", -1.5) &&
      near(ou(even, "Over", 5.5) + ou(even, "Under", 5.5), 1, 2e-4) && near(ou(even, "Over", 6) + ou(even, "Under", 6), 1, 2e-4) && ou(gm(0, 6.6), "Over", 5.5) > ou(even, "Over", 5.5) &&
      near(M.tilt(nhl.shape.total, 6.4).reduce((s, x) => s + x[0] * x[1], 0), 6.4, 1e-6);
    const rating = near(M.rating({ gp: 16, margin: 1, last5: 2 }, nhl), (0.9 * 1 + 0.1 * 2) * 16 / 51, 1e-9);
    const g = M.gameModel({ sportKey: "icehockey_nhl", home: "H", away: "A", leagueGoals: 3.1, homeForm: { gp: 10, pf: 4, pa: 2, margin: 2, last5: 2, wins: 8, losses: 2 }, awayForm: { gp: 10, pf: 3, pa: 3, margin: 0, last5: 0, wins: 5, losses: 5 } });
    const sh = x => (10 * x + 80 * 3.1) / 90, full = (sh(4) + sh(3) + sh(3) + sh(2)) / 2, total = Math.round(full * 10) / 10;
    const standings = { children: [{ standings: { entries: [{ stats: [{ name: "pointsFor", value: 64 }, { name: "gamesPlayed", value: 17 }] }, { stats: [{ name: "pointsFor", value: 300 }, { name: "gamesPlayed", value: 100 }] }] } }] };
    return shape && rating && near(g.total, full, 1e-9) && M.publicModel(g).total === total && near(M.leagueGoalsFrom(standings), 364 / 117, 1e-9) && M.leagueGoalsFrom({ children: [] }) === null;
  })());
  check("model: a whole-number spread is push-aware and a half-point is not; the draw band gives soccer three outcomes", (() => { const gm = Object.assign({}, gmFix, { margin: 3, sd: 12.5 }); const whole = M.sideProb(gm, "spreads", { name: "Boston Celtics", point: -3 }, "Boston Celtics", "Milwaukee Bucks"), half = M.sideProb(gm, "spreads", { name: "Boston Celtics", point: -3.5 }, "Boston Celtics", "Milwaukee Bucks"); const d = M.sideProb(gmEpl, "h2h", { name: "Draw", point: null }, "Arsenal", "Liverpool"); return near(whole, 0.5, 1e-3) && half < 0.5 && d > 0.15 && d < 0.3 && M.sideProb(gm, "h2h", { name: "Nobody", point: null }, "Boston Celtics", "Milwaukee Bucks") === null; })());
  const altEv = { id: "alt", bookmakers: [
    { key: "draftkings", title: "DraftKings", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3.5, price: -110 }, { name: "A", point: 3.5, price: -110 }] }] },
    { key: "fanduel", title: "FanDuel", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3.5, price: -105 }, { name: "A", point: 3.5, price: -115 }] }] },
    { key: "betmgm", title: "BetMGM", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3.5, price: -110 }, { name: "A", point: 3.5, price: -110 }] }] },
    { key: "betrivers", title: "BetRivers", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -4, price: -105 }, { name: "A", point: 4, price: -115 }] }] },
    { key: "bovada", title: "Bovada", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -4, price: 100 }, { name: "A", point: 4, price: -120 }] }] }
  ] };
  const alt = P.priceOutcomes(nbaCfg, altEv);
  check("priceOutcomes: the -3.5 line (3 books) qualifies, the -4 line (2 books) is tracked only", alt.filter(c => c.qualifies).length === 2 && alt.filter(c => !c.qualifies && c.outcome.point === -4).length === 1 && P.analyzeEvent(nbaCfg, altEv, alt).every(c => Math.abs(c.outcome.point) === 3.5), JSON.stringify(alt.map(c => c.outcome.point + ":" + c.qualifies)));
  /* Pinnacle on a neighbouring line: its price is carried across the half point so the books' shared line keeps the anchor */
  const carryEv = { id: "carry", bookmakers: [
    { key: "pinnacle", title: "Pinnacle", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3, price: -110 }, { name: "A", point: 3, price: -110 }] }, { key: "totals", outcomes: [{ name: "Over", point: 226, price: -110 }, { name: "Under", point: 226, price: -110 }] }] },
    { key: "draftkings", title: "DraftKings", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3.5, price: -105 }, { name: "A", point: 3.5, price: -115 }] }, { key: "totals", outcomes: [{ name: "Over", point: 226.5, price: -105 }, { name: "Under", point: 226.5, price: -115 }] }] },
    { key: "fanduel", title: "FanDuel", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3.5, price: -120 }, { name: "A", point: 3.5, price: 100 }] }, { key: "totals", outcomes: [{ name: "Over", point: 226.5, price: -110 }, { name: "Under", point: 226.5, price: -110 }] }] },
    { key: "betmgm", title: "BetMGM", markets: [{ key: "spreads", outcomes: [{ name: "H", point: -3.5, price: -110 }, { name: "A", point: 3.5, price: -110 }] }, { key: "totals", outcomes: [{ name: "Over", point: 226.5, price: -110 }, { name: "Under", point: 226.5, price: -110 }] }] }
  ] };
  const carried = P.priceOutcomes(nbaCfg, carryEv);
  const hSide = carried.find(c => c.market === "spreads" && c.outcome.name === "H"), aSide = carried.find(c => c.market === "spreads" && c.outcome.name === "A"), under = carried.find(c => c.market === "totals" && c.outcome.name === "Under");
  check("carry: the -3.5 line (3 books) is anchored by Pinnacle's -3 price carried half a point at 2.8%/pt (H 48.6%, A 51.4%)", hSide && hSide.qualifies && hSide.anchor === "Pinnacle" && hSide.anchorShift === 0.5 && near(hSide.fair, 0.486, 0.001) && near(aSide.fair, 0.514, 0.001) && /carried 0.5 points at 2.8% a point to the -3.5 line/.test(hSide.anchorNote), JSON.stringify([hSide && hSide.fair, aSide && aSide.fair, hSide && hSide.anchorNote]));
  check("carry: the over at a higher total loses probability, the under gains it (Under 226.5 = 50.7%)", under && near(under.fair, 0.507, 0.001) && under.anchorShift === 0.5, under && String(under.fair));
  check("carry: A +3.5 at +100 (FanDuel) shows 1.4 points of market edge (a reference now, never a grade); against the soft-book consensus it would not", (() => { const a = carried.find(c => c.market === "spreads" && c.outcome.name === "A"); const noAnchor = P.priceOutcomes(nbaCfg, { id: "na", bookmakers: carryEv.bookmakers.slice(1) }).find(c => c.market === "spreads" && c.outcome.name === "A"); return !!a && a.book === "FanDuel" && near(a.marketEdge, 0.514 - 0.5, 0.002) && noAnchor.marketEdge < 0.01 && P.analyzeEvent(nbaCfg, carryEv, P.priceWithModel(null, { home_team: "H", away_team: "A" }, carried)).length === 0; })());
  check("carry: no conversion for hockey or across more than a point", (() => { const nhl = P.SPORTS.find(s => s.key === "icehockey_nhl"); const r = P.priceOutcomes(nhl, carryEv); const far = P.priceOutcomes(nbaCfg, { id: "far", bookmakers: [carryEv.bookmakers[0]].concat(carryEv.bookmakers.slice(1).map(b => ({ key: b.key, title: b.title, markets: [{ key: "spreads", outcomes: [{ name: "H", point: -4.5, price: -110 }, { name: "A", point: 4.5, price: -110 }] }] }))) }); return r.filter(c => c.market === "spreads").every(c => c.anchor == null) && far.filter(c => c.market === "spreads").every(c => c.anchor == null) && P.shiftedAnchor(nbaCfg, "h2h", carryEv.bookmakers[0], [carryEv.bookmakers[1]]) === null; })());

  /* a logged pick keeps its price tracked up to tip-off even when it has no edge any more */
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-track-"));
  fs.writeFileSync(path.join(tmp2, "picks-log.json"), JSON.stringify([pending("bucks-ml", { key: "nba-fix-1|h2h|Milwaukee Bucks|null", eventId: "nba-fix-1", commence: "2026-11-06T00:00:00Z", date: "2026-11-05", market: "h2h", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 150, modelProb: 0.42, edge: 0.02, loggedAt: "2026-11-05T12:00:00Z", history: [{ at: "2026-11-05T12:00:00Z", odds: 150, fair: 0.42 }] })]));
  const rt = await P.run({ fixture: true, out: tmp2, now: NOW });
  const tracked = JSON.parse(fs.readFileSync(path.join(tmp2, "picks-log.json"), "utf8")).find(e => e.id === "bucks-ml");
  check("tracking: a logged pick the model now dislikes still gets its current price, our probability and a second history point (market fair, for the close)", rt.added === 4 && tracked.current && tracked.current.odds === 160 && tracked.current.edge < 0 && tracked.current.modelProb < 0.3 && near(tracked.current.fair, 0.4115, 0.001) && tracked.history.length === 2 && near(tracked.history[1].fair, 0.4115, 0.001), JSON.stringify(tracked.current));
  check("tracking: closingLine/clvOf read the last check against the market's fair, never the model's", P.closingLine(tracked).samples === 2 && near(P.clvOf(tracked), P.closingLine(tracked).fair - P.implied(150), 1e-4) && near(P.closingLine(tracked).fair, 0.4115, 0.001));
  fs.rmSync(tmp2, { recursive: true, force: true });

  /* idempotent: a second run at the same moment adds nothing and keeps the board */
  const r2 = await P.run({ fixture: true, out: tmp, now: "2026-11-05T16:00:00Z" }); /* an hour later, same day */
  check("rerun: no duplicates", r2.added === 0 && r2.board === 4);
  const log2 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8")), celtics2 = log2.find(e => e.pick === "Boston Celtics ML" && e.loggedAt);
  check("rerun: price history grows and current price is tracked", celtics2.history.length === 2 && celtics2.current && celtics2.current.odds === -145);
  const sb2 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8"), sb2);
  const celticsPub2 = sb2.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML");
  check("rerun: movement block appears once a later check exists (flat line here)", celticsPub2.movement && celticsPub2.movement.currentOdds === -145 && celticsPub2.movement.history.length === 2);
  check("rerun: DraftKings history does not grow when the number is unchanged", celticsPub2.dkHistory.length === 1);

  /* track mode: ESPN only, no Odds API; refreshes DraftKings numbers and breakdowns, keeps generatedAt, adds trackedAt */
  const perfBefore = "/* written by the last full run */\nwindow.PERF_DATA = { sample: false, asOf: \"2026-11-05\" };\n";
  fs.writeFileSync(path.join(tmp, "performance.js"), perfBefore);
  const rt2 = await P.run({ fixture: true, out: tmp, now: "2026-11-05T18:00:00Z", track: true });
  const sb3 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8"), sb3);
  const log3b = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  check("track: runs on the four board picks without touching the log size or generatedAt, and stamps trackedAt", rt2.track === true && rt2.board === 4 && log3b.length === log2.length && sb3.window.PICKS_DATA.generatedAt === sb2.window.PICKS_DATA.generatedAt && sb3.window.PICKS_DATA.trackedAt === "2026-11-05T18:00:00.000Z" && sb3.window.PICKS_DATA.picks.length === 4, JSON.stringify(rt2));
  check("track: picks keep their breakdown, model and DraftKings block", sb3.window.PICKS_DATA.picks.every(p => p.breakdown && p.breakdown.verdict && p.model && p.basis === "game") && sb3.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML").dk.moved === "toward");
  check("track: SportsGameOdds refreshed by event id with no new history point when nothing moved", rt2.sgoEntities === 1 && rt2.sgoMoved === 0 && sb3.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML").sgoHistory.length === 1 && sb3.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML").mkt.moved === "toward", JSON.stringify(rt2));
  check("track: a run that grades nothing does not touch performance.js", rt2.graded === 0 && rt2.parlaysGraded === 0 && fs.readFileSync(path.join(tmp, "performance.js"), "utf8") === perfBefore);
  check("track: market.js is left alone (no odds in a track run)", fs.readFileSync(path.join(tmp, "market.js"), "utf8").indexOf("2026-11-05T16:00:00") !== -1);

  /* who plays, after a pick is posted (2026-11-08): the morning run logs what the 9:30 AM ET report said with each NBA
     pick; at 6 PM ET the hourly run reads the 5:30 PM report (Paul George ruled out, Hauser cleared) and flags the picks
     whose game it moves by RULES.availabilityFlag points or more. The picks stay locked */
  const tmpAv = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-avail-"));
  const avAm = path.join(__dirname, "fixtures", "nba", "official-2026-11-05-0930.json"), avPm = path.join(__dirname, "fixtures", "nba", "official-2026-11-05-1730.json");
  await P.run({ fixture: true, out: tmpAv, now: NOW, officialReportFixture: avAm });
  const avLog0 = JSON.parse(fs.readFileSync(path.join(tmpAv, "picks-log.json"), "utf8")), avCel0 = avLog0.find(e => e.pick === "Boston Celtics ML");
  check("availability: an NBA pick logs what the model knew about who plays (the 9:30 AM ET report, Lillard out, Hauser questionable), unflagged; other leagues log none", !!avCel0 && avCel0.availability && avCel0.availability.posted.report.label === "9:30 AM ET" && avCel0.availability.posted.away.some(i => i.name === "Damian Lillard" && i.status === "Out" && i.source === "official") && avCel0.availability.posted.home.some(i => i.name === "Sam Hauser" && i.status === "Questionable") && avCel0.availability.changed === false && avLog0.filter(e => e.sportKey !== "basketball_nba" && !e.type).every(e => !e.availability), avCel0 && JSON.stringify(avCel0.availability));
  const avOdds0 = avLog0.filter(e => e.sportKey === "basketball_nba").map(e => [e.id, e.odds, e.modelProb, e.edge, e.confidence].join());
  const avT = await P.run({ fixture: true, out: tmpAv, now: "2026-11-05T23:00:00Z", track: true, officialReportFixture: avPm });
  const avLog1 = JSON.parse(fs.readFileSync(path.join(tmpAv, "picks-log.json"), "utf8")), avCel1 = avLog1.find(e => e.pick === "Boston Celtics ML"), avTot1 = avLog1.find(e => e.sportKey === "basketball_nba" && e.marketKey === "totals");
  const avSb = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpAv, "picks.js"), "utf8"), avSb);
  const avPub = avSb.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML");
  check("availability: the hourly run flags a posted pick when a status moves its game: George ruled out at 5:30 PM ET, after it was posted at 10:00 AM ET, about 2.5 points against the Celtics (12% of his 20.7 points, from data/faces.js); Hauser's clearance (0.4 points) is under the bar", avT.availabilityFlagged >= 2 && avCel1.availability.changed === true && avCel1.availability.changes.length === 1 && avCel1.availability.changes[0].name === "Paul George" && avCel1.availability.changes[0].to === "Out" && avCel1.availability.changes[0].from === "Not listed" && near(avCel1.availability.swing, -2.48, 1e-9)
    && avCel1.availability.note === "Paul George ruled out at 5:30 PM ET (official report), after this lean was posted at 10:00 AM ET; about 2.5 points of margin against this side on our numbers" && avCel1.availability.checkedAt === "2026-11-05T23:00:00.000Z", JSON.stringify(avCel1.availability));
  check("availability: a total is flagged with no swing (the model takes nothing off a total for injuries); the picks themselves are untouched (locked)", !!avTot1 && avTot1.availability.changed === true && avTot1.availability.swing === null && /takes nothing off a total/.test(avTot1.availability.note) && JSON.stringify(avLog1.filter(e => e.sportKey === "basketball_nba").map(e => [e.id, e.odds, e.modelProb, e.edge, e.confidence].join())) === JSON.stringify(avOdds0), avTot1 && JSON.stringify(avTot1.availability));
  check("availability: picks.js carries the flag and who the pick was posted knowing about; the breakdown lists it as a risk with the locked-pick line", !!avPub && avPub.availability.changed === true && avPub.availability.note === avCel1.availability.note && avPub.availability.posted.report.label === "9:30 AM ET" && avPub.availability.posted.players.some(p => p.name === "Damian Lillard" && p.status === "Out") && !avPub.availability.posted.players.some(p => p.name === "Sam Hauser" && p.status === "Available") && avPub.breakdown.risks.some(t => /^Paul George ruled out at 5:30 PM ET .*graded at the price it was posted at\.$/.test(t)), avPub && JSON.stringify([avPub.availability, avPub.breakdown.risks]));
  await P.run({ fixture: true, out: tmpAv, now: "2026-11-05T23:30:00Z", track: true, officialReportFixture: path.join(tmpAv, "no-report.json") });
  const avCel2 = JSON.parse(fs.readFileSync(path.join(tmpAv, "picks-log.json"), "utf8")).find(e => e.pick === "Boston Celtics ML");
  await P.run({ fixture: true, out: tmpAv, now: "2026-11-05T23:45:00Z", track: true, officialReportFixture: avAm });
  const avCel3 = JSON.parse(fs.readFileSync(path.join(tmpAv, "picks-log.json"), "utf8")).find(e => e.pick === "Boston Celtics ML");
  check("availability: when the report cannot be read the last flag stands (ESPN alone would read differently, not newer); a read that matches what the pick was posted on clears it", avCel2.availability.changed === true && avCel2.availability.checkedAt === "2026-11-05T23:00:00.000Z" && avCel3.availability.changed === false && avCel3.availability.note === null, JSON.stringify([avCel2.availability.checkedAt, avCel3.availability]));
  check("availability: what is still open about a game, by level: \"report\" a club not on the official report yet; \"open\" also a costed player questionable (Hauser, 0.85 points were he out; doubtful and out are settled, a small cost does not hold a game); no level or no readable report holds nothing", (() => {
    const av = avCel0.availability.posted, late = Object.assign({}, av, { onReport: { home: true, away: false } });
    const doubt = { report: null, home: [{ name: "D", status: "Doubtful", miss: AV.MISS.doubtful, full: 3 }], away: [{ name: "E", status: "Day-To-Day", full: 2 }] };
    return AV.unresolvedOf(av, 0.5, "open").join() === "Sam Hauser questionable" && AV.unresolvedOf(av, 0.5, "report").length === 0 && AV.unresolvedOf(av, 1, "open").length === 0 && AV.unresolvedOf(late, 1, "report").join() === "report not in for both clubs"
      && AV.unresolvedOf(doubt, 0.5, "open").join() === "E day-to-day" && AV.unresolvedOf(doubt, 0.5, "report").length === 0 && AV.unresolvedOf(av, 0.5, undefined).length === 0
      && P.RULES.availabilityHold.afternoon === "report" && P.RULES.availabilityHold.manual === "report" && P.RULES.availabilityHold.morning === "open";
  })(), JSON.stringify(AV.unresolvedOf(avCel0.availability.posted, 0.5, "open")));
  /* the afternoon run: a game whose clubs are not on the report yet (here the real 5:30 PM report of 2026-11-05, which
     carries no Bucks at Celtics that day) posts nothing and its market rows say why; on the report, it posts. A slot at
     the "open" level (a morning run, should the NBA return to it) also holds the questionable Hauser */
  const HOLD0 = P.RULES.availabilityHold;
  const tmpW = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-wait-")), tmpW2 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-wait-"));
  const rw = await P.run({ fixture: true, out: tmpW, now: "2026-11-05T20:30:00Z", slot: "afternoon", officialReportFixture: path.join(__dirname, "fixtures", "nba", "Injury-Report_2026-11-05_05_30PM.pdf") });
  const logW = JSON.parse(fs.readFileSync(path.join(tmpW, "picks-log.json"), "utf8")), mkW = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(tmpW, "market.js"), "utf8"), mkW);
  const rwA = await P.run({ fixture: true, out: tmpW, now: "2026-11-05T21:30:00Z", slot: "afternoon", officialReportFixture: avAm });
  P.RULES.availabilityHold = { manual: "open" };
  const rwO = await P.run({ fixture: true, out: tmpW2, now: NOW, slot: "manual", officialReportFixture: avAm });
  P.RULES.availabilityHold = HOLD0;
  check("availability: the afternoon run holds an NBA game until both clubs are on the official report (its own game day) and its market rows say why; once they are, it posts; at the \"open\" level a costed questionable player holds it too", rw.waited.length === 1 && rw.waited[0] === "Milwaukee Bucks @ Boston Celtics (report not in for both clubs)" && logW.filter(e => e.sportKey === "basketball_nba").length === 0 && mkW.window.MARKET_DATA.rows.filter(r => r.sportKey === "basketball_nba").every(r => r.waiting && r.waiting[0] === "report not in for both clubs")
    && rwA.waited.length === 0 && JSON.parse(fs.readFileSync(path.join(tmpW, "picks-log.json"), "utf8")).some(e => e.sportKey === "basketball_nba") && rwO.waited.length === 1 && rwO.waited[0] === "Milwaukee Bucks @ Boston Celtics (Sam Hauser questionable)", JSON.stringify([rw.waited, rwA.waited, rwO.waited]));
  check("availability: a change is weighed at the player's own cost: a star from questionable to out moves 60% of his 3 points; a player who had missed every game (cost 0) coming back moves nothing; a newly listed one is priced by fullOf", (() => {
    const posted = { report: { label: "9:30 AM ET" }, home: [{ name: "Long Absent", status: "Out", miss: 1, full: 0 }, { name: "Star", status: "Questionable", miss: 0.4, full: 3 }], away: [] };
    const read = { read: "2026-11-05T23:00:00Z", report: { label: "5:30 PM ET" }, home: [{ name: "Star", status: "Out", miss: 1, source: "official", at: "2026-11-05T22:30:00Z", report: "5:30 PM ET" }], away: [{ name: "New Guy", status: "Out", miss: 1, source: "official", at: "2026-11-05T22:30:00Z" }] };
    const ch = AV.changesSince(posted, read, { min: 0.5, fullOf: i => i.name === "New Guy" ? 2 : 9 });
    return ch.length === 2 && ch[0].name === "Star" && near(ch[0].delta, 1.8, 1e-9) && ch[0].from === "Questionable" && ch[1].name === "New Guy" && ch[1].delta === 2 && AV.changesSince(posted, Object.assign({}, read, { report: null }), {}) === null;
  })());
  check("availability: a later change keeps the time it was first read (5:30 PM ET), not the newest report's", (() => {
    const e = { marketKey: "h2h", home: "H", away: "A", outcome: { name: "H" }, loggedAt: "2026-11-05T15:00:00Z", confidence: "Lean" };
    const ch = t => [{ side: "home", name: "Star", from: "Not listed", to: "Out", fromMiss: 0, toMiss: 1, delta: 3, at: t, source: "official", report: null }];
    const first = AV.flagOf(e, ch("2026-11-05T22:30:00.000Z"), null, "x"), later = AV.flagOf(e, ch("2026-11-05T23:45:00.000Z"), first, "y");
    return later.changes[0].at === "2026-11-05T22:30:00.000Z" && later.note === "Star ruled out at 5:30 PM ET (official report), after this lean was posted at 10:00 AM ET; about 3.0 points of margin against this side on our numbers" && later.swing === -3;
  })());

  /* track mode grades (owner ask, 2026-11-05: picks "pop and go" at tip-off and results waited for the next day's run).
     The Bucks @ Celtics game of Nov 3 tipped at 7 PM ET; ESPN's scoreboard fixture calls it final, 110-104. At 9:40 PM,
     two hours forty in and under the 3-hour floor, the hourly run grades it, writes the close and CLV as a full run does,
     settles the parlay of the day and rewrites performance.js. An NHL game still on and a week-old NFL pick no free
     source can settle stay pending: a track run never asks The Odds API and never voids. */
  const tmpT = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-trackgrade-"));
  const posted = { basis: "game", loggedAt: "2026-11-03T17:00:00Z" };
  fs.writeFileSync(path.join(tmpT, "picks-log.json"), JSON.stringify([
    pending("old-ml", Object.assign({ market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 140, modelProb: 0.45, history: [{ at: "2026-11-03T17:00:00Z", odds: 140, fair: 0.42 }, { at: "2026-11-03T20:30:00Z", odds: 130, fair: 0.45 }] }, posted)),
    pending("old-spread", Object.assign({ market: "Spread", marketKey: "spreads", outcome: { name: "Boston Celtics", point: -3 }, pick: "Boston Celtics -3", odds: -110, modelProb: 0.58, potd: "2026-11-03" }, posted)),
    pending("old-total", Object.assign({ market: "Total", marketKey: "totals", outcome: { name: "Over", point: 214 }, pick: "Over 214", odds: -110, modelProb: 0.56 }, posted)),
    pending("live-nhl", Object.assign({ sport: "NHL", league: "NHL", sportKey: "icehockey_nhl", eventId: "nhl-live", event: "New York Rangers @ Boston Bruins", home: "Boston Bruins", away: "New York Rangers", commence: "2026-11-04T01:00:00Z", market: "Moneyline", marketKey: "h2h", outcome: { name: "Boston Bruins", point: null }, pick: "Boston Bruins ML", odds: -120, modelProb: 0.6 }, posted)),
    pending("stale", { sport: "NFL", sportKey: "americanfootball_nfl", eventId: "nfl-gone", commence: "2026-10-25T17:00:00Z", date: "2026-10-25", market: "Moneyline", marketKey: "h2h", outcome: { name: "X", point: null }, pick: "X ML", odds: 100 }),
    { type: "parlay", id: "parlay-2026-11-03", date: "2026-11-03", status: "pending", units: 0, loggedAt: "2026-11-03T17:00:00Z", book: "DraftKings", legs: ["old-spread", "old-total"], legPrices: [-110, -110], decimal: 3.6446, odds: 264, fairProb: 0.3248, ev: 0.1838 }
  ]));
  fs.writeFileSync(path.join(tmpT, "performance.js"), "/* the last full run's file */\nwindow.PERF_DATA = { sample: false, asOf: \"2026-11-03\" };\n");
  const rtg = await P.run({ fixture: true, out: tmpT, now: "2026-11-04T02:40:00Z", track: true });
  const logT = JSON.parse(fs.readFileSync(path.join(tmpT, "picks-log.json"), "utf8")), tById = {}; logT.forEach(e => { tById[e.id] = e; });
  check("track: grades the finished game as soon as ESPN calls it final (2h40m after tip, under the 3-hour floor): Bucks ML lost, Celtics -3 won +0.91u, Over 214 pushed, final kept home and away", rtg.graded === 3 && tById["old-ml"].status === "graded" && tById["old-ml"].result === "Loss" && tById["old-ml"].units === -1 && tById["old-spread"].result === "Win" && near(tById["old-spread"].units, 0.91, 0.001) && tById["old-total"].result === "Push" && tById["old-ml"].score === "104-110" && tById["old-ml"].finalScore.home === 110 && tById["old-ml"].finalScore.away === 104 && tById["old-ml"].gradedAt === "2026-11-04T02:40:00.000Z", JSON.stringify(rtg));
  check("track: the close and CLV are written as a full run writes them (DraftKings' close from ESPN; a spread that closed on another number gets a direction; no SportsGameOdds entity spent on a close)", tById["old-ml"].close.source === "DraftKings close (ESPN)" && tById["old-ml"].close.odds === 150 && tById["old-ml"].close.samples === 2 && near(tById["old-ml"].clv, mlClv, 0.001) && tById["old-spread"].clv == null && tById["old-spread"].lineMove === "toward" && near(tById["old-total"].clv, totClv, 0.001) && rtg.sgoEntities === 0, JSON.stringify([tById["old-ml"].close, rtg.sgoEntities]));
  check("track: the parlay of the day settles with its legs (a win and a push pay the win, +0.91u)", tById["parlay-2026-11-03"].status === "graded" && tById["parlay-2026-11-03"].result === "Win" && near(tById["parlay-2026-11-03"].units, 0.91, 0.001) && rtg.parlaysGraded === 1);
  check("track: no Odds API and no voiding in a track run: the NHL game still on and the week-old NFL pick stay pending", rtg.scoresRequests === 0 && tById["live-nhl"].status === "pending" && tById["stale"].status === "pending" && !tById["stale"].gradedAt);
  const pfT = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpT, "performance.js"), "utf8"), pfT);
  const PFT = pfT.window.PERF_DATA;
  check("track: performance.js is rewritten with the grades within the hour: 1-1-1, -0.09u, play of the day 1-0, parlays 1-0 +0.91u, CLV on two picks", PFT.asOf === "2026-11-03" && PFT.graded === 3 && PFT.record.wins === 1 && PFT.record.losses === 1 && PFT.record.pushes === 1 && near(PFT.units, -0.09, 0.001) && PFT.potd.wins === 1 && PFT.potd.n === 1 && PFT.parlays.wins === 1 && near(PFT.parlays.units, 0.91, 0.001) && PFT.clv.n === 2 && PFT.clv.espnCloses === 3 && PFT.byBasis.game.n === 3 && PFT.byBasis.game.pending === 1, JSON.stringify([PFT.asOf, PFT.record, PFT.units, PFT.potd, PFT.parlays, PFT.byBasis && PFT.byBasis.game]));
  const pkT = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpT, "picks.js"), "utf8"), pkT);
  const DT = pkT.window.PICKS_DATA, cardT = {}; DT.picks.forEach(p => { cardT[p.id] = p; });
  check("card: a started pick stays on picks.js with its status, result, units and score (Bucks ML: graded, Loss, -1, 110-104 home and away)", DT.picks.length === 4 && rtg.card === 4 && rtg.board === 0 && cardT["old-ml"].status === "graded" && cardT["old-ml"].started === true && cardT["old-ml"].result === "Loss" && cardT["old-ml"].units === -1 && cardT["old-ml"].score.home === 110 && cardT["old-ml"].score.away === 104 && cardT["old-spread"].result === "Win" && near(cardT["old-spread"].units, 0.91, 0.001) && cardT["old-total"].result === "Push" && cardT["old-total"].units === 0 && cardT["old-ml"].loggedAt === "2026-11-03T17:00:00Z" && cardT["old-ml"].valueTo === 139 && cardT["old-ml"].start === "Today 7:00 PM ET", JSON.stringify(DT.picks.map(p => [p.id, p.status, p.result, p.units, p.score, p.start])));
  check("card: the game still on reads pending and started, with no result, units or score; the week-old pick is not on the card", cardT["live-nhl"].status === "pending" && cardT["live-nhl"].started === true && cardT["live-nhl"].result === null && cardT["live-nhl"].units === null && cardT["live-nhl"].score === null && !cardT["stale"] && DT.picks.map(p => p.id).join() === "old-ml,old-spread,old-total,live-nhl");
  const perfT = fs.readFileSync(path.join(tmpT, "performance.js"), "utf8");
  const rtg2 = await P.run({ fixture: true, out: tmpT, now: "2026-11-04T05:30:00Z", track: true }); /* 12:30 AM ET: a rewrite would move asOf to Nov 4 */
  check("track: the last run of the night grades nothing new and leaves performance.js as it is (asOf stays Nov 3)", rtg2.graded === 0 && rtg2.parlaysGraded === 0 && fs.readFileSync(path.join(tmpT, "performance.js"), "utf8") === perfT && rtg2.card === 4);
  const rtg3 = await P.run({ fixture: true, out: tmpT, now: "2026-11-04T18:30:00Z", track: true });
  const pkT3 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpT, "picks.js"), "utf8"), pkT3);
  check("card: 18 hours after its start a pick leaves picks.js (the NBA picks at 18h30, the NHL game at 17h30 stays, labelled Yesterday)", rtg3.card === 1 && pkT3.window.PICKS_DATA.picks.length === 1 && pkT3.window.PICKS_DATA.picks[0].id === "live-nhl" && pkT3.window.PICKS_DATA.picks[0].start === "Yesterday 8:00 PM ET" && P.RULES.cardHours === 18, JSON.stringify(pkT3.window.PICKS_DATA.picks.map(p => [p.id, p.start])));
  fs.rmSync(tmpT, { recursive: true, force: true });

  /* the same on the live code path: ESPN served from the fixtures through fetch, an Odds API key set, no SportsGameOdds
     key. The track run grades from ESPN alone (DraftKings' close from ESPN's core odds) and never asks The Odds API;
     a full run on the same footing does, which shows the guard would catch it. */
  const espnFile = url => {
    let m = /site\.api\.espn\.com\/apis\/site\/v2\/sports\/([a-z]+)\/([a-z0-9.]+)\/scoreboard\?dates=(\d{8})$/.exec(url); if (m) return "ctx-scoreboard-" + m[1] + "-" + m[2] + "-" + m[3] + ".json";
    m = /sports\.core\.api\.espn\.com\/v2\/sports\/([a-z]+)\/leagues\/([a-z0-9.]+)\/events\/(\d+)\/competitions\/\d+\/odds\/100$/.exec(url); if (m) return "ctx-odds-" + m[1] + "-" + m[2] + "-" + m[3] + ".json";
    return null;
  };
  const requested = [], realFetch = global.fetch, savedKeys = { odds: process.env.ODDS_API_KEY, sgo: process.env.SGO_API_KEY };
  global.fetch = async function (url) {
    url = String(url); requested.push(url);
    const f = espnFile(url), file = f && path.join(__dirname, "fixtures", "espn", f);
    const body = file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    return { ok: !!body, status: body ? 200 : 404, headers: { get: () => null }, json: async () => JSON.parse(body || "{}"), text: async () => body || "not found" };
  };
  process.env.ODDS_API_KEY = "test-key"; delete process.env.SGO_API_KEY;
  const tmpL = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-tracklive-")), tmpF = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-fulllive-"));
  const liveLog = [pending("old-ml", { market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 140, modelProb: 0.45 }), pending("stale", { sport: "NFL", sportKey: "americanfootball_nfl", eventId: "nfl-gone", commence: "2026-10-25T17:00:00Z", date: "2026-10-25", market: "Moneyline", marketKey: "h2h", outcome: { name: "X", point: null }, pick: "X ML", odds: 100 })];
  fs.writeFileSync(path.join(tmpL, "picks-log.json"), JSON.stringify(liveLog));
  fs.writeFileSync(path.join(tmpF, "picks-log.json"), JSON.stringify(liveLog.slice(1)));
  let rl = null, trackAsked = null, fullAsked = null;
  try {
    rl = await P.run({ out: tmpL, now: "2026-11-04T02:40:00Z", track: true });
    trackAsked = requested.slice();
    requested.length = 0;
    try { await P.run({ out: tmpF, now: "2026-11-04T02:40:00Z", key: "test-key" }); } catch (err) { /* the stub answers The Odds API with a 404 */ }
    fullAsked = requested.slice();
  } finally {
    global.fetch = realFetch;
    if (savedKeys.odds == null) delete process.env.ODDS_API_KEY; else process.env.ODDS_API_KEY = savedKeys.odds;
    if (savedKeys.sgo != null) process.env.SGO_API_KEY = savedKeys.sgo;
  }
  const liveT = JSON.parse(fs.readFileSync(path.join(tmpL, "picks-log.json"), "utf8")), liveMl = liveT.find(e => e.id === "old-ml");
  check("track (live path): graded from ESPN's scoreboard with DraftKings' close from ESPN, performance.js written, and not one request to The Odds API", rl && rl.graded === 1 && liveMl.result === "Loss" && liveMl.close && liveMl.close.source === "DraftKings close (ESPN)" && near(liveMl.clv, dkFair(150, -170) - P.implied(140), 0.001) && fs.existsSync(path.join(tmpL, "performance.js")) && trackAsked.some(u => /site\.api\.espn\.com\/.*\/scoreboard\?dates=20261103$/.test(u)) && !trackAsked.some(u => /the-odds-api\.com/.test(u)) && liveT.find(e => e.id === "stale").status === "pending", JSON.stringify([rl, trackAsked]));
  check("track (live path): the guard sees The Odds API when a full run asks it (scores for the week-old NFL pick)", fullAsked.some(u => /api\.the-odds-api\.com\/v4\/sports\/americanfootball_nfl\/scores/.test(u)), JSON.stringify(fullAsked));
  fs.rmSync(tmpL, { recursive: true, force: true }); fs.rmSync(tmpF, { recursive: true, force: true });

  /* the internal selections stay on the board: a started pick with the best EV on file is on the card, but it is not the
     play or the parlay of the day, is not re-priced or re-written, and an hour in it costs no Odds API call */
  const tmpC = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-card-"));
  fs.writeFileSync(path.join(tmpC, "picks-log.json"), JSON.stringify([pending("hot-started", { sport: "NHL", league: "NHL", sportKey: "icehockey_nhl", eventId: "nhl-hot", event: "Visitors @ Hosts", home: "Hosts", away: "Visitors", commence: "2026-11-05T14:00:00Z", date: "2026-11-05", market: "Moneyline", marketKey: "h2h", outcome: { name: "Hosts", point: null }, pick: "Hosts ML", odds: 150, book: "FanDuel", prices: { FanDuel: 150, DraftKings: 150 }, modelProb: 0.9, edge: 0.5, ev: 1.25, basis: "game", loggedAt: "2026-11-05T12:00:00Z", breakdown: { verdict: "as logged" } })]));
  const rc = await P.run({ fixture: true, out: tmpC, now: NOW });
  const pkC = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpC, "picks.js"), "utf8"), pkC);
  const DC = pkC.window.PICKS_DATA, hot = DC.picks.find(p => p.id === "hot-started");
  check("card: a started pick is on the card after the board, but never the play or parlay of the day, never re-priced or re-written, and no Odds API call an hour in", rc.board === 4 && rc.card === 5 && DC.picks.length === 5 && DC.picks[4].id === "hot-started" && hot.status === "pending" && hot.started === true && DC.playOfDay.pick === "Under 226.5" && DC.parlayOfDay.legs.every(l => l.id !== "hot-started") && hot.breakdown.verdict === "as logged" && hot.context === null && hot.sgo === null && rc.scoresRequests === 0 && rc.settled === 0, JSON.stringify([rc.board, rc.card, DC.playOfDay && DC.playOfDay.pick, DC.parlayOfDay && DC.parlayOfDay.legs.map(l => l.id), rc.scoresRequests]));
  fs.rmSync(tmpC, { recursive: true, force: true });

  /* after the games: the board empties, grading finds no scores yet for the new events */
  const r3 = await P.run({ fixture: true, out: tmp, now: "2026-11-07T15:00:00Z" });
  const log3 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  const nfl = log3.find(e => e.eventId === "nfl-fix-far");
  const mk4 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "market.js"), "utf8"), mk4);
  const nflRows = mk4.window.MARKET_DATA.rows.filter(r => r.eventId === "nfl-fix-far");
  check("later: started events leave the board (and, more than 18 hours after their start, the card); the NFL game now inside the 36h window is priced on the market board but, with no model, has no probability and is never a pick", r3.board === 0 && r3.card === 0 && !nfl && r3.unmodelled === 1 && nflRows.length === 2 && nflRows.every(r => r.modelProb === null && r.edge === null && r.status === "none" && r.modelled === false && typeof r.marketFair === "number") && mk4.window.MARKET_DATA.rows.every((r, i) => i === 0 || r.edge !== null || mk4.window.MARKET_DATA.rows[i - 1].edge === null || true), "board " + r3.board + " " + JSON.stringify(nflRows.map(r => [r.pick, r.modelProb, r.status])));
  check("later: the finished games stay pending until scores arrive (not voided yet)", log3.filter(e => e.eventId === "nba-fix-1" || e.eventId === "epl-fix-1").every(e => e.status === "pending"));

  fs.rmSync(tmp, { recursive: true, force: true });

  /* ---------- Phase 2 (2026-11-05; the owner: one sport "favored", picks that "pop and go"; approved fewer, steadier
     picks, locked once posted): each side's own bar, one pick a game, the day's caps, and the standing of a locked pick ---------- */
  P.RULES.barZ = RULES0.barZ; P.RULES.onePerGame = RULES0.onePerGame;
  Object.assign(MC.CALIB, CALIB0);
  check("bar: the default rule is one model error (barZ 1), one pick a game, at most 10 a day and 5 a sport", P.RULES.barZ === 1 && P.RULES.onePerGame === true && P.RULES.maxPerDay === 10 && P.RULES.maxPerSportDay === 5);
  /* the model's own error: the standard error of the rating difference, from each team's games plus the prior's weight */
  const cOut = { name: "Boston Celtics", point: null };
  const nz = M.noise(gmFix, "h2h", cOut, "Boston Celtics", "Milwaukee Bucks"), cfgN = M.SPORT.basketball_nba;
  const kOf = last => last != null ? cfgN.carry.k : cfgN.k;
  const unitsWant = cfgN.sd * Math.sqrt(1 / (gmFix.gpHome + kOf(gmFix.parts.lastHome)) + 1 / (gmFix.gpAway + kOf(gmFix.parts.lastAway)));
  check("noise: the Celtics ML's error is the rating difference's standard error (14.3 × √(1/(gp+k) + 1/(gp+k)) points) moved through the side's probability, well over the floor this early", nz && near(nz.units, unitsWant, 0.01) && nz.unit === "points" && nz.gp === Math.min(gmFix.gpHome, gmFix.gpAway) && nz.p > 0.03 && nz.p < 0.25, JSON.stringify([nz, unitsWant]));
  const later = Object.assign({}, gmFix, { gpHome: 60, gpAway: 60, gp: 60 });
  check("noise: it falls as the games pile up (60 games each: a fraction of the early error), and a total has its own (the scoring averages)", M.noise(later, "h2h", cOut, "Boston Celtics", "Milwaukee Bucks").p < nz.p / 2 && M.noise(gmFix, "totals", { name: "Under", point: 226.5 }, "Boston Celtics", "Milwaukee Bucks").unit === "points" && M.noise(gmFix, "totals", { name: "Under", point: 226.5 }, "Boston Celtics", "Milwaukee Bucks").p > 0);
  check("noise: a soccer draw still gets an error (it falls whichever way the margin moves), and no model means no error", M.noise(gmEpl, "h2h", { name: "Draw", point: null }, "Arsenal", "Liverpool").p > 0 && M.noise(null, "h2h", cOut, "a", "b") === null);
  check("bar: never under the 3-point floor; otherwise barZ model errors", P.barOf({ p: 0.01 }) === 0.03 && near(P.barOf({ p: 0.11 }), 0.11, 1e-9) && P.barOf(null) === 0.03);

  /* ---------- calibration per league and market (2026-11-05; the owner: the board is "just one sport or heavily
     favorited"): fitted on held-out seasons, results only. At the books' lines the NBA's and NFL's spreads and totals
     did worse than a coin flip, so they read about even; the NBA moneyline was too flat; the NHL and EPL stay raw ---------- */
  check("calibration: the map is p' = 1/(1+e^-(a + b logit p)) on the home or over side, the other side its complement; NBA spreads and totals read about even at any line, the NBA moneyline is stretched, the NHL, MLB and EPL are left raw", (() => {
    const nba = { sportKey: "basketball_nba", margin: 6, total: 236, sd: 14.3, sdTotal: 19 }, H = { name: "H" }, A = { name: "A" };
    const raw = M.rawSideProb(nba, "h2h", H, "H", "A"), cal = M.sideProb(nba, "h2h", H, "H", "A"), c = M.CALIB.basketball_nba.h2h;
    const want = 1 / (1 + Math.exp(-(c[0] + c[1] * Math.log(raw / (1 - raw)))));
    const ml = near(cal, want, 2e-4) && cal > raw && near(cal + M.sideProb(nba, "h2h", A, "H", "A"), 1, 2e-4);
    const sp = M.rawSideProb(nba, "spreads", { name: "H", point: -1.5 }, "H", "A"), spC = M.sideProb(nba, "spreads", { name: "H", point: -1.5 }, "H", "A");
    const ov = M.rawSideProb(nba, "totals", { name: "Over", point: 222.5 }, "H", "A"), ovC = M.sideProb(nba, "totals", { name: "Over", point: 222.5 }, "H", "A");
    const even = sp > 0.6 && Math.abs(spC - 0.5) < 0.02 && ov > 0.7 && Math.abs(ovC - 0.5) < 0.02 && near(ovC + M.sideProb(nba, "totals", { name: "Under", point: 222.5 }, "H", "A"), 1, 2e-4);
    const nfl = { sportKey: "americanfootball_nfl", margin: 7, total: 52, sd: 13.3, sdTotal: 13.4 };
    const nflOk = near(M.sideProb(nfl, "totals", { name: "Over", point: 44.5 }, "H", "A"), 0.5, 1e-9) && Math.abs(M.sideProb(nfl, "spreads", { name: "H", point: -1.5 }, "H", "A") - 0.5) < 0.03 && near(M.sideProb(nfl, "h2h", H, "H", "A"), M.rawSideProb(nfl, "h2h", H, "H", "A"), 1e-9);
    const untouched = [["icehockey_nhl", 0.5, 6.4, 2.4, 2.3], ["baseball_mlb", 0.4, 8.8, 4.5, 4.5], ["soccer_epl", 0.4, 2.8, 1.7, 1.6]].every(([sk, m, t, sd, sdT]) => { const g = { sportKey: sk, margin: m, total: t, sd: sd, sdTotal: sdT }; return ["h2h", "spreads", "totals"].every(mk => { const o = mk === "totals" ? { name: "Over", point: Math.floor(t) + 0.5 } : { name: "H", point: mk === "spreads" ? -1.5 : null }; return M.sideProb(g, mk, o, "H", "A") === M.rawSideProb(g, mk, o, "H", "A"); }); });
    return ml && even && nflOk && untouched;
  })());
  check("calibration: a side the map pulls toward even says so in its reasons, with the model's own number; the bar is read on the calibrated probability (an NBA total's error is a sliver, so its bar is the floor)", (() => {
    const r = M.sideReasons(gmFix, "totals", { name: "Under", point: 226.5 }, "Boston Celtics", "Milwaukee Bucks"), n = M.noise(gmFix, "totals", { name: "Under", point: 226.5 }, "Boston Celtics", "Milwaukee Bucks");
    return r.against.some(t => /^Past seasons: our totals at the books' lines did no better than a coin flip, so this side reads \d+(\.\d)?% \(the model alone \d+(\.\d)?%\)$/.test(t)) && n && n.p < 0.01 && P.barOf(n) === 0.03 && !M.sideReasons(gmFix, "h2h", cOut, "Boston Celtics", "Milwaukee Bucks").against.some(t => /^Past seasons/.test(t));
  })(), JSON.stringify(M.sideReasons(gmFix, "totals", { name: "Under", point: 226.5 }, "Boston Celtics", "Milwaukee Bucks").against));

  check("calibration: a market with no signal (NBA and NFL spreads and totals) is never a pick or a watch, even at a plus price that would put its even number past the 3-point floor; every other market keeps its signal", (() => {
    const noSig = !M.hasSignal("basketball_nba", "totals") && !M.hasSignal("basketball_nba", "spreads") && !M.hasSignal("americanfootball_nfl", "totals") && !M.hasSignal("americanfootball_nfl", "spreads");
    const sig = M.hasSignal("basketball_nba", "h2h") && M.hasSignal("americanfootball_nfl", "h2h") && ["h2h", "spreads", "totals"].every(m => M.hasSignal("icehockey_nhl", m) && M.hasSignal("baseball_mlb", m)) && M.hasSignal("soccer_epl", "totals") && M.hasSignal("soccer_usa_mls", "h2h");
    const g = { sportKey: "basketball_nba", margin: 3, total: 236, sd: 14.3, sdTotal: 19, gp: 20, gpHome: 20, gpAway: 20, reasons: [] };
    const ev = { id: "x", home_team: "H", away_team: "A" }, over = { market: "totals", outcome: { name: "Over", point: 222.5 }, odds: 115, qualifies: true };
    const priced = P.priceWithModel(g, ev, [Object.assign({}, over)]), c = priced[0];
    return noSig && sig && c.edge > 0.03 && c.past > 0 && P.analyzeEvent({ key: "basketball_nba", markets: ["totals"] }, ev, priced).length === 0;
  })());
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-bar-"));
  const rb = await P.run({ fixture: true, out: tmpB, now: NOW });
  const logB = JSON.parse(fs.readFileSync(path.join(tmpB, "picks-log.json"), "utf8")), addedB = logB.filter(e => e.loggedAt);
  const sbB = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpB, "picks.js"), "utf8") + fs.readFileSync(path.join(tmpB, "market.js"), "utf8"), sbB);
  const PDB = sbB.window.PICKS_DATA, MKB = sbB.window.MARKET_DATA;
  check("select: one pick a game at most (the fixture's two modelled games gave four picks on the flat bar), each the side furthest past its own bar", rb.added >= 1 && rb.added <= 2 && new Set(addedB.map(e => e.eventId)).size === addedB.length && addedB.every(e => {
    const rows = MKB.rows.filter(r => r.eventId === e.eventId && r.past != null); return rows.every(r => r.past <= e.past + 1e-4); }), JSON.stringify(addedB.map(e => [e.pick, e.edge, e.bar, e.past])));
  check("select: every new pick clears its own bar, records it (bar, past, barParts) and its tier is how far past", addedB.every(e => e.past >= 0 && e.bar >= 0.03 && near(e.edge - e.bar, e.past, 2e-4) && e.barParts && near(e.bar, Math.max(0.03, e.barParts.error), 2e-4) && e.barParts.floor === 0.03 && e.confidence === P.confidence(e.past, !!(e.model && e.model.thin))), JSON.stringify(addedB.map(e => [e.pick, e.bar, e.past, e.barParts, e.confidence])));
  check("select: the rationale and factors give the bar in words, still never against other books", addedB.every(e => /Its bar is \d+\.\d points/.test(e.rationale) && /It clears it by \d+\.\d\./.test(e.rationale) && /Not graded against other books' prices/.test(e.rationale) && e.factors.some(f => /past its bar of \d+\.\d/.test(f))), addedB.map(e => e.rationale).join(" || "));
  check("market: every modelled row carries its bar and how far past it; watch is half its own bar (and 1.5 points), the file names the rule and each sport's bars", MKB.rows.filter(r => r.modelled).every(r => r.bar >= 0.03 && near(r.edge - r.bar, r.past, 2e-4) && (r.status === "pick" || (r.status === "watch") === (r.edge >= Math.max(0.015, 0.5 * r.bar) - 1e-9))) && MKB.rows.filter(r => !r.modelled).every(r => r.bar == null && r.status === "none") && MKB.barRule && MKB.barRule.floor === 0.03 && MKB.barRule.z === 1 && MKB.bars.NBA && MKB.bars.NBA.min <= MKB.bars.NBA.median && MKB.bars.NBA.median <= MKB.bars.NBA.max && MKB.threshold === 0.03, JSON.stringify(MKB.bars));
  check("market: a side over 3 points but under its own bar is not a pick (the flat bar would have taken it)", MKB.rows.some(r => r.modelled && r.edge >= 0.03 && r.past < 0 && r.status !== "pick"), JSON.stringify(MKB.rows.filter(r => r.modelled).map(r => [r.pick, r.edge, r.bar]).slice(0, 8)));
  check("calibration: in a run, the fixture's NBA total (Under 226.5, a pick and the play of the day on the model's own number) reads about even and is no pick; the NBA moneyline still prices from the stretched map", (() => {
    const u = MKB.rows.find(r => r.pick === "Under 226.5"), o = MKB.rows.find(r => r.pick === "Over 226.5"), cel = MKB.rows.find(r => r.pick === "Boston Celtics ML");
    return !!u && !!o && Math.abs(u.modelProb - 0.5) < 0.02 && near(u.modelProb + o.modelProb, 1, 2e-4) && u.status !== "pick" && !addedB.some(e => e.pick === "Under 226.5") && !!cel && near(cel.modelProb, M.sideProb(gmFix, "h2h", cOut, "Boston Celtics", "Milwaukee Bucks"), 2e-4) && cel.modelProb > M.rawSideProb(gmFix, "h2h", cOut, "Boston Celtics", "Milwaukee Bucks");
  })(), JSON.stringify(MKB.rows.filter(r => /226\.5|Celtics ML/.test(r.pick)).map(r => [r.pick, r.modelProb, r.edge, r.status])));
  check("picks.js: a fresh pick carries its bar, how far past, the parts, no later check yet (now and standing null), and the worst price that still clears its own bar", PDB.picks.every(p => p.bar >= 0.03 && p.past >= 0 && p.barParts && p.now === null && p.standing === null && p.valueTo === P.valueTo(p.modelProb, p.bar) && P.implied(p.valueTo) <= p.modelProb - p.bar + 1e-9));
  fs.rmSync(tmpB, { recursive: true, force: true });

  /* the day's caps and one pick a game, across runs: candidates furthest past first; what earlier runs posted counts */
  const cand = (id, ev, sport, date, past) => ({ id: id, key: id, eventId: ev, sport: sport, date: date, past: past, edge: past + 0.05 });
  const capLog = [{ id: "posted", eventId: "g0", sport: "NBA", date: "2026-11-05", status: "pending" }, { id: "voided", eventId: "g9", sport: "NBA", date: "2026-11-05", status: "void" }];
  const capC = [cand("a1", "g1", "NBA", "2026-11-05", 0.01), cand("a2", "g1", "NBA", "2026-11-05", 0.04), cand("b", "g0", "NBA", "2026-11-05", 0.09), cand("v", "g9", "NBA", "2026-11-05", 0.5)];
  for (let i = 0; i < 6; i++) capC.push(cand("n" + i, "gn" + i, "NBA", "2026-11-05", 0.02 + i / 1000));
  for (let i = 0; i < 6; i++) capC.push(cand("h" + i, "gh" + i, "NHL", "2026-11-05", 0.005 + i / 1000));
  capC.push(cand("tomorrow", "gt", "NBA", "2026-11-06", 0.001));
  const chosen = P.selectPicks(capLog, capC).map(c => c.id);
  check("select: a game with a pick (posted earlier, any status but void) gets no second; of two sides on one game the one further past its bar", chosen.indexOf("b") === -1 && chosen.indexOf("a2") !== -1 && chosen.indexOf("a1") === -1 && chosen.indexOf("v") !== -1, JSON.stringify(chosen));
  check("select: at most 5 a sport and 10 a day, counting what was posted earlier, furthest past first; another day has its own caps", chosen.filter(id => id !== "tomorrow").length === 9 && ["posted"].concat(chosen).filter(id => /^(posted|a|n|v)/.test(id)).length === 5 && chosen.filter(id => /^h/.test(id)).length === 5 && chosen.indexOf("h0") === -1 && chosen.indexOf("n3") === -1 && chosen.indexOf("tomorrow") !== -1 && capLog.length === 2 + chosen.length && chosen[0] === "v" && chosen[1] === "a2", JSON.stringify(chosen));
  /* locked picks: whether the edge still holds at the last full run, never a reason to pull the pick */
  const lockE = (cur, extra) => Object.assign({ loggedAt: "2026-11-05T12:00:00Z", bar: 0.08, current: cur }, extra);
  check("standing: none until a later run re-prices the pick; then clears / below / gone against the bar now (the pick's own bar, or the floor for a pick posted before bars)", P.nowOf(lockE({ at: "2026-11-05T12:00:00Z", edge: 0.1, bar: 0.08 })) === null
    && P.standingOf(P.nowOf(lockE({ at: "2026-11-05T17:00:00Z", edge: 0.09, bar: 0.08, odds: -110, book: "FanDuel", modelProb: 0.6 }))) === "clears"
    && P.standingOf(P.nowOf(lockE({ at: "2026-11-05T17:00:00Z", edge: 0.05, bar: 0.08 }))) === "below"
    && P.standingOf(P.nowOf(lockE({ at: "2026-11-05T17:00:00Z", edge: -0.01, bar: 0.08 }))) === "gone"
    && P.nowOf(lockE({ at: "2026-11-05T17:00:00Z", edge: 0.02 }, { bar: undefined })).bar === 0.03 && P.standingOf(P.nowOf(lockE({ at: "2026-11-05T17:00:00Z", edge: 0.02 }, { bar: undefined }))) === "below");
  const tmpL2 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-lock-"));
  fs.writeFileSync(path.join(tmpL2, "picks-log.json"), JSON.stringify([pending("bucks-ml", { key: "nba-fix-1|h2h|Milwaukee Bucks|null", eventId: "nba-fix-1", commence: "2026-11-06T00:00:00Z", date: "2026-11-05", market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 150, modelProb: 0.42, edge: 0.02, bar: 0.03, past: -0.01, loggedAt: "2026-11-05T12:00:00Z", current: { at: "2026-11-05T12:00:00Z", odds: 150, edge: 0.02, bar: 0.03 }, history: [{ at: "2026-11-05T12:00:00Z", odds: 150, fair: 0.42 }] })]));
  const rl2 = await P.run({ fixture: true, out: tmpL2, now: NOW });
  const sbL2 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpL2, "picks.js"), "utf8"), sbL2);
  const lockedPub = sbL2.window.PICKS_DATA.picks.find(p => p.id === "bucks-ml"), logL2 = JSON.parse(fs.readFileSync(path.join(tmpL2, "picks-log.json"), "utf8"));
  check("locked: the model now has the Bucks well under the price, yet the pick stays posted, pending, at its posted price, reads gone, and its game gets no second pick", lockedPub && lockedPub.status === "pending" && lockedPub.odds === 150 && lockedPub.standing === "gone" && lockedPub.now && lockedPub.now.edge < 0 && lockedPub.now.odds === 160 && !logL2.some(e => e.eventId === "nba-fix-1" && e.id !== "bucks-ml") && rl2.added <= 1, JSON.stringify([lockedPub && lockedPub.now, rl2.added]));
  check("locked: the breakdown says the pick stays posted and is graded at the posted price", lockedPub.breakdown.risks.some(t => /^At current prices our edge is -\d+\.\d points, under its bar of \d+\.\d points; the pick stays posted and is graded at the price it was posted at\.$/.test(t)), JSON.stringify(lockedPub.breakdown.risks));
  fs.rmSync(tmpL2, { recursive: true, force: true });

  /* ---------- which sports a run fetches (2026-11-05: NFL Thursdays, MLS, inside the free tier's 500 credits) ---------- */
  const SP = k => P.SPORTS.find(s => s.key === k);
  const nflC = SP("americanfootball_nfl"), nbaC = SP("basketball_nba"), eplC = SP("soccer_epl"), mlsC = SP("soccer_usa_mls");
  check("budget: the odds request asks only for games inside the 36-hour window (an answer with none costs nothing), in whole seconds; a sport costs its markets (3, soccer 2)", (() => {
    const q = P.oddsParams(nflC, new Date("2026-11-05T20:30:00.456Z"));
    return q.commenceTimeFrom === "2026-11-05T20:30:00Z" && q.commenceTimeTo === "2026-11-07T08:30:00Z" && q.markets === "h2h,spreads,totals" && q.bookmakers.split(",").length === 10 && !("commenceTimeFrom" in P.oddsParams(nflC, null)) && P.oddsCost(nflC) === 3 && P.oddsCost(mlsC) === 2;
  })());
  check("budget: MLS is wired like the Premier League (Soccer, league MLS, moneyline and totals, three-way), and NFL, EPL, MLS and (since 2026-11-08, on the official injury report) the NBA are fetched on the afternoon run only; morning skips them, manual runs fetch everything; the NHL and MLB on both", mlsC && mlsC.sport === "Soccer" && mlsC.league === "MLS" && mlsC.goals === true && mlsC.markets.join() === "h2h,totals"
    && [nflC, eplC, mlsC, nbaC].every(c => !P.slotAllows(c, "morning") && P.slotAllows(c, "afternoon") && P.slotAllows(c, "manual") && P.slotAllows(c, undefined)) && P.slotAllows(SP("icehockey_nhl"), "morning") && P.slotAllows(SP("baseball_mlb"), "morning"));
  /* ESPN's scoreboard decides: stub sources keyed by Eastern day */
  const sbSrc = days => ({ scoreboard: async (sport, d) => (d in days ? days[d] : null) });
  const gameAt = (iso, status) => ({ id: iso, date: iso, competitions: [{ status: { type: { name: status || "STATUS_SCHEDULED", state: "pre" } } }] });
  const tnf = { "20261105": { events: [gameAt("2026-11-06T01:15Z")] }, "20261106": { events: [] }, "20261104": { events: [] }, "20261103": { events: [] } };
  check("gate: Thursday night football is fetched on Wednesday's and Thursday's afternoon runs (it was never fetched on a Thursday) and not on Tuesday's, when the game is past the window", await (async () => {
    const at = async iso => P.fetchDecision(nflC, { slot: "afternoon", espn: await P.espnGames(sbSrc(tnf), nflC, new Date(iso)), weekday: new Date(iso).getUTCDay() });
    const thu = await at("2026-11-05T20:30:00Z"), wed = await at("2026-11-04T20:30:00Z"), tue = await at("2026-11-03T20:30:00Z");
    return thu.fetch && /1 game inside 36 hours on ESPN/.test(thu.why) && wed.fetch && !tue.fetch && /no game inside 36 hours/.test(tue.why);
  })());
  check("gate: an off-season or idle sport is skipped on ESPN's word (MLB with no games), a postponed game does not count, and a game that already started is outside the window", await (async () => {
    const now = new Date("2026-11-05T20:30:00Z");
    /* a 4:30 PM ET run's window ends at 3:30 AM ET two days on, so three Eastern days are read */
    const idle = await P.espnGames(sbSrc({ "20261105": { events: [] }, "20261106": { events: [] }, "20261107": { events: [] } }), SP("baseball_mlb"), now);
    const pp = await P.espnGames(sbSrc({ "20261105": { events: [gameAt("2026-11-06T00:00Z", "STATUS_POSTPONED"), gameAt("2026-11-05T19:00Z")] }, "20261106": { events: [] }, "20261107": { events: [] } }), nbaC, now);
    return idle.games === 0 && idle.failed === 0 && idle.days.join() === "20261105,20261106,20261107" && !P.fetchDecision(SP("baseball_mlb"), { slot: "morning", espn: idle }).fetch && pp.games === 0 && !P.fetchDecision(nbaC, { slot: "afternoon", espn: pp }).fetch;
  })());
  check("gate: when ESPN cannot be read the sport's days decide (NFL on a Friday no, a Thursday yes; NBA every day), unless a day that was read already shows a game", await (async () => {
    const down = await P.espnGames(sbSrc({}), nflC, new Date("2026-11-06T20:30:00Z"));
    const half = await P.espnGames(sbSrc({ "20261107": { events: [gameAt("2026-11-07T21:00Z")] } }), mlsC, new Date("2026-11-06T20:30:00Z"));
    return down.failed === 3 && down.games === 0 && !P.fetchDecision(nflC, { slot: "afternoon", espn: down, weekday: 5 }).fetch && P.fetchDecision(nflC, { slot: "afternoon", espn: down, weekday: 4 }).fetch && P.fetchDecision(nbaC, { slot: "afternoon", espn: down, weekday: 5 }).fetch
      && half.failed === 2 && half.games === 1 && P.fetchDecision(mlsC, { slot: "afternoon", espn: half, weekday: 2 }).fetch && P.fetchDecision(nflC, { slot: "afternoon", espn: { games: 0, failed: 1 }, weekday: 4, fixture: false }).fetch;
  })());
  check("budget: the morning run gives way first when credits run short: it keeps 10 for every afternoon run left before the reset on the 1st (plus the 25 floor); afternoon runs never yield", (() => {
    const left = P.afternoonsLeft(new Date("2026-11-05T17:00:00Z")), leftAfter = P.afternoonsLeft(new Date("2026-11-05T21:00:00Z")), lastDay = P.afternoonsLeft(new Date("2026-11-30T21:00:00Z"));
    const g = { games: 4, failed: 0 };
    const nhlC = SP("icehockey_nhl"), tight = P.fetchDecision(nhlC, { slot: "morning", espn: g, remaining: 280, afternoonsLeft: 26 }), ok = P.fetchDecision(nhlC, { slot: "morning", espn: g, remaining: 288, afternoonsLeft: 26 }), pm = P.fetchDecision(nbaC, { slot: "afternoon", espn: g, remaining: 40, afternoonsLeft: 26 });
    return left === 26 && leftAfter === 25 && lastDay === 0 && P.RULES.afternoonReserve === 10 && !tight.fetch && /morning run gives way: 280 credits left, 285 kept for the 26 afternoon runs/.test(tight.why) && ok.fetch && pm.fetch;
  })());
  check("budget: the run's spend is one line for the Actions log: what was fetched, what it cost, what was skipped and why", P.planLine({ slot: "morning", remaining: 361, used: 139, plan: [{ sport: "basketball_nba", fetch: true, cost: 3, events: 9 }, { sport: "americanfootball_nfl", fetch: false, why: "fetched on the afternoon run only" }] }) === "Odds API (morning run): NBA 3 (9 events) | skipped: NFL (fetched on the afternoon run only) | credits left 361, used 139");

  /* MLS end to end: two Decision Day games (ESPN fixtures trimmed from 2026-11-07), the feed's own club names */
  const tmpM = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-mls-"));
  const rm = await P.run({ fixture: true, oddsFixture: "odds-mls.json", out: tmpM, now: "2026-11-06T15:00:00Z", slot: "afternoon" });
  const sbM = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpM, "picks.js"), "utf8") + fs.readFileSync(path.join(tmpM, "market.js"), "utf8"), sbM);
  const PDM = sbM.window.PICKS_DATA, MKM = sbM.window.MARKET_DATA;
  const mlsPlan = rm.plan.find(p => p.sport === "soccer_usa_mls");
  check("mls: the afternoon run fetches MLS (ESPN shows Decision Day inside the window) and models both games, \"New York Red Bulls\" and \"Los Angeles FC\" matched to ESPN's Red Bull New York and LAFC", mlsPlan && mlsPlan.fetch && /2 games inside 36 hours on ESPN/.test(mlsPlan.why) && mlsPlan.events === 2 && rm.modelled === 2 && rm.unmodelled === 0 && MKM.games === 2 && MKM.modelled === 2 && MKM.rows.length === 10, JSON.stringify([mlsPlan, rm.modelled, rm.unmodelled]));
  check("mls: one pick, the Over 2.5 goals at FanDuel -125 (64.0% on a projected 3.2 goals, past its 3.8-point bar), on the Soccer chip with league MLS, matched to its ESPN game and venue; every other side is under its bar", PDM.picks.length === 1 && PDM.picks[0].pick === "Over 2.5 goals" && PDM.picks[0].odds === -125 && PDM.picks[0].book === "FanDuel" && PDM.picks[0].sport === "Soccer" && PDM.picks[0].league === "MLS" && PDM.picks[0].sportKey === "soccer_usa_mls" && PDM.picks[0].context && PDM.picks[0].context.espnEventId === "761939" && /Harrison/.test(PDM.picks[0].context.venue || "") && near(PDM.picks[0].modelProb, 0.6404, 2e-4) && MKM.rows.filter(r => r.status === "pick").length === 1, JSON.stringify(PDM.picks.map(p => [p.pick, p.odds, p.book, p.modelProb, p.bar])));
  check("mls: each game's home, draw and away sum to one, the draw near a quarter, and the moneylines' bars are wide (a parity league: about 6 to 8 points with 33 games behind each club)", (() => {
    const g = ["New York Red Bulls vs. Atlanta United FC", "Seattle Sounders FC vs. Los Angeles FC"].map(ev => MKM.rows.filter(r => r.event === ev && r.marketKey === "h2h"));
    return g.every(rows => rows.length === 3 && near(rows.reduce((s, r) => s + r.modelProb, 0), 1, 2e-3) && rows.find(r => r.pick === "Draw").modelProb > 0.24 && rows.find(r => r.pick === "Draw").modelProb < 0.28) && MKM.rows.filter(r => r.marketKey === "h2h" && r.pick !== "Draw").every(r => r.bar > 0.05 && r.bar < 0.09);
  })(), JSON.stringify(MKM.rows.filter(r => r.marketKey === "h2h").map(r => [r.pick, r.modelProb, r.bar])));
  const rn = await P.run({ fixture: true, oddsFixture: "odds-mls.json", out: fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-mls-morning-")), now: "2026-11-06T15:00:00Z", slot: "morning" });
  check("mls: the morning run leaves MLS (and NFL, the Premier League and the NBA) to the afternoon run without asking ESPN or The Odds API; the NHL is fetched", rn.added === 0 && ["soccer_usa_mls", "soccer_epl", "americanfootball_nfl", "basketball_nba"].every(k => { const p = rn.plan.find(x => x.sport === k); return p && !p.fetch && p.why === "fetched on the afternoon run only"; }) && rn.plan.find(x => x.sport === "icehockey_nhl").fetch, JSON.stringify(rn.plan));
  /* the next morning run into the same files: MLS is not fetched, but its games are still ahead, so its rows stay on the
     market board (and the Games page) with the time they were priced, the pick still flagged as one */
  const firstAt = MKM.generatedAt, rCarry = await P.run({ fixture: true, oddsFixture: "odds-mls.json", out: tmpM, now: "2026-11-06T17:00:00Z", slot: "morning" });
  const sbC = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpM, "market.js"), "utf8"), sbC);
  const kept = sbC.window.MARKET_DATA.rows.filter(r => r.sportKey === "soccer_usa_mls");
  check("market: a sport the run did not fetch keeps its rows for games still ahead, each with when it was priced, the pick still a pick (Sunday's morning run never empties the NFL from the Games page)", rCarry.plan.some(p => p.sport === "soccer_usa_mls" && !p.fetch) && kept.length === MKM.rows.filter(r => r.sportKey === "soccer_usa_mls").length && kept.length > 0 && kept.every(r => r.pricedAt === firstAt) && kept.filter(r => r.status === "pick").length === 1 && sbC.window.MARKET_DATA.games === 2, JSON.stringify(kept.map(r => [r.pick, r.status, r.pricedAt])));
  check("market: a carried row leaves once its game has started, and nothing is carried for a sport the run fetched", (() => {
    const log = JSON.parse(fs.readFileSync(path.join(tmpM, "picks-log.json"), "utf8"));
    const skip = [{ sport: "soccer_usa_mls", fetch: false }], fetched = [{ sport: "soccer_usa_mls", fetch: true }];
    return P.carriedRows(tmpM, skip, new Date("2026-11-06T18:00:00Z"), log).length === kept.length && P.carriedRows(tmpM, skip, new Date("2026-11-08T17:00:00Z"), log).length === 0 && P.carriedRows(tmpM, fetched, new Date("2026-11-06T18:00:00Z"), log).length === 0;
  })());
  fs.rmSync(tmpM, { recursive: true, force: true });
  check("model: MLS from its own calibration (results only): home edge 0.5 goals, a quarter of last season carried over 20 games, the home side's own margin table; at the league's home edge the home side wins about 48%, the draw 26%; its season is the calendar year", (() => {
    const c = M.SPORT.soccer_usa_mls, gm = { sportKey: "soccer_usa_mls", home: "H", away: "A", margin: 0.5, total: 3, sd: 1.63, sdTotal: 1.71 };
    const pr = n => M.sideProb(gm, "h2h", { name: n, point: null }, "H", "A");
    return c && c.homeEdge === 0.5 && c.carry.k === 20 && c.carry.c === 0.25 && c.kTotal === 15 && c.threeWay && c.shape && c.shape.marginHome && near(pr("H") + pr("Draw") + pr("A"), 1, 3e-4) && pr("H") > 0.46 && pr("H") < 0.5 && pr("Draw") > 0.24 && pr("Draw") < 0.28 && pr("H") > pr("A") && M.lastSeasonParam("soccer_usa_mls", Date.parse("2026-11-07T21:00Z")) === "2025" && M.noise(Object.assign({ gpHome: 33, gpAway: 33, parts: { lastHome: 0, lastAway: 0 } }, gm), "h2h", { name: "H" }, "H", "A").unit === "goals";
  })());

  /* soccer settles on 90 minutes: an MLS playoff tie that goes to extra time (ESPN's score includes it) */
  check("grading: a soccer playoff game that went to extra time is graded on the score after 90 minutes (0-0 at 90, 0-2 after extra time: the draw wins, the Over 2.5 loses); a goal list that does not add up waits", await (async () => {
    const goal = (team, secs, so) => ({ scoringPlay: true, shootout: !!so, team: { id: team }, clock: { value: secs } });
    const comp = details => ({ events: [{ id: "690126", competitions: [{ status: { period: 4, type: { completed: true, name: "STATUS_FINAL_AET" } }, details: details, competitors: [{ homeAway: "home", score: "0", team: { id: "12011", displayName: "Orlando City SC", name: "Orlando City SC", location: "Orlando City SC" } }, { homeAway: "away", score: "2", team: { id: "183", displayName: "Columbus Crew", name: "Columbus Crew", location: "Columbus Crew" } }] }] }] });
    const entry = (id, mk, name, point) => ({ id: id, key: id, sportKey: "soccer_usa_mls", sport: "Soccer", home: "Orlando City", away: "Columbus Crew SC", commence: "2023-11-25T22:30:00Z", marketKey: mk, outcome: { name: name, point: point }, odds: 250, status: "pending", units: 0, threeWay: mk === "h2h" });
    const go = async details => { const l = [entry("d", "h2h", "Draw", null), entry("o", "totals", "Over", 2.5), entry("c", "h2h", "Columbus Crew SC", null)]; await P.gradeStarted(l, new Date("2023-11-26T03:00:00Z"), { ctx: { scoreboard: async () => comp(details), odds: async () => null }, sgoSrc: { enabled: false }, sgoOk: () => false, scores: null, track: true }); return l; };
    const ok = await go([goal("183", 5563), goal("183", 7069)]), bad = await go([goal("183", 5563)]);
    const reg = CTX.regulationScore({ comp: { status: { period: 5, type: { name: "STATUS_FINAL_PEN" } }, details: [goal("9727", 2321), goal("18966", 5400), goal("9727", 7200, true)] }, home: { score: "1", team: { id: "9727" } }, away: { score: "1", team: { id: "18966" } } });
    return ok[0].result === "Win" && ok[1].result === "Loss" && ok[2].result === "Loss" && ok[0].finalScore.home === 0 && ok[0].finalScore.away === 0 && bad.every(e => e.status === "pending") && reg && reg.home === 1 && reg.away === 1 && reg.extraTime === false;
  })());
  check("context: soccer club names meet ESPN's across suffixes, accents and the two renamed MLS clubs, and never cross to another club", [["Chicago Fire", "Chicago Fire FC"], ["Los Angeles FC", "LAFC"], ["New York Red Bulls", "Red Bull New York"], ["CF Montreal", "CF Montréal"], ["DC United", "D.C. United"], ["Columbus Crew SC", "Columbus Crew"], ["St. Louis City SC", "St. Louis CITY SC"], ["Brighton and Hove Albion", "Brighton & Hove Albion"], ["AFC Bournemouth", "Bournemouth"]].every(([a, b]) => CTX.teamMatches(a, { displayName: b, name: b, location: b, shortDisplayName: b }))
    && ![["LA Galaxy", "LAFC"], ["New York City FC", "Red Bull New York"], ["Los Angeles Lakers", "LAFC"], ["Orlando City SC", "Columbus Crew"]].some(([a, b]) => CTX.teamMatches(a, { displayName: b, name: b, location: b, shortDisplayName: b })));
  check("sgo: MLS reads the 90-minute three-way moneyline and total (the reg period); the draw is de-vigged against both teams, and a playoff result is the 90-minute score, not the shootout's", (() => {
    const S = require("./sgo.js");
    const e = { sportKey: "soccer_usa_mls", home: "Seattle Sounders FC", away: "Los Angeles FC", marketKey: "h2h", outcome: { name: "Draw", point: null }, odds: 260 };
    const bk = o => ({ byBookmaker: { draftkings: { odds: String(o), available: true } } });
    const ev = { eventID: "x", odds: { "points-home-reg-ml3way-home": bk(120), "points-away-reg-ml3way-away": bk(210), "points-all-reg-ml3way-draw": bk(250) }, status: { completed: true }, results: { reg: { home: { points: 1 }, away: { points: 1 } }, game: { home: { points: 2 }, away: { points: 1 } } } };
    const s = S.snapshot(ev, e), fair = P.implied(250) / (P.implied(120) + P.implied(210) + P.implied(250));
    return S.LEAGUE.soccer_usa_mls === "MLS" && S.sideIds(e).join() === "points-all-reg-ml3way-draw,points-home-reg-ml3way-home,points-away-reg-ml3way-away" && S.sideIds(Object.assign({}, e, { marketKey: "totals", outcome: { name: "Under", point: 2.5 } })).join() === "points-all-reg-ou-under,points-all-reg-ou-over" && S.oddIdsFor("MLS").length === 5 && S.oddIdsFor("NBA") === S.ODD_IDS
      && s.books.DraftKings === 250 && near(s.fair, fair, 1e-4) && s.score.home === 1 && s.score.away === 1 && S.teamMatches("Los Angeles FC", { names: { long: "LAFC", medium: "LAFC", short: "LAF", location: "Los Angeles" } });
  })());

  /* ---------- NFL model (2026-11-08): scripts/nfl.js on nflverse data, the Sunday morning run, the day's cap ----------
     Fixtures: scripts/fixtures/nflverse, the AFC East's division games from nflverse's release files (CC BY 4.0), 2025
     and 2026 to date, plus one made-up neutral-site game (2026_10_NE_MIA). Nothing here touches the network. */
  const NFLM = require("./nfl.js"), nflFetch = NFLM.fixtureFetcher(path.join(__dirname, "fixtures", "nflverse"));
  const nflNow = new Date("2026-11-11T15:00:00Z"), nflState = await NFLM.build(nflFetch, nflNow, null), nflIx = NFLM.index(nflState);
  const ALLEN = "00-0034857", GENO = "00-0030565";
  check("nfl: the cache reads nflverse's release files (schedules, team-week EPA, player-week passing) into games, team-game EPA, each QB's seasons and last season's QB mix; past seasons it could not read count as missing", nflState.v === 1 && nflState.season === 2026 && nflState.games.length === 18 && Object.keys(nflState.epa).length === 32 && nflState.qbs[ALLEN] && nflState.qbs[ALLEN].s["2025"][0] > 100 && (nflState.mix.BUF || []).some(([q]) => q === ALLEN) && nflState.missing >= 8 && nflState.qbSeasons.join() === "2025" && /nflverse/.test(nflState.attribution) && /CC BY 4\.0/.test(nflState.attribution),
    JSON.stringify([nflState.games.length, Object.keys(nflState.epa).length, nflState.missing, nflState.qbSeasons]));
  check("nfl: the weekly refresh: fresh once read after the latest Wednesday 12:00 UTC (Monday night's game is in by then), stale a week on, and a cache still missing a finished game's stats is read again after 12 hours", (() => {
    const st = { v: 1, season: 2026, fetchedAt: "2026-11-05T09:00:00Z", missing: 0 };
    return NFLM.lastBoundary(new Date("2026-11-08T15:00:00Z")) === Date.parse("2026-11-04T12:00:00Z") && NFLM.lastBoundary(new Date("2026-11-04T11:00:00Z")) === Date.parse("2026-10-28T12:00:00Z")
      && NFLM.isFresh(st, new Date("2026-11-08T15:00:00Z")) && !NFLM.isFresh(st, new Date("2026-11-11T13:00:00Z")) && !NFLM.isFresh(Object.assign({}, st, { missing: 1 }), new Date("2026-11-05T22:00:00Z")) && NFLM.isFresh(Object.assign({}, st, { missing: 1 }), new Date("2026-11-05T20:00:00Z"))
      && !NFLM.isFresh(Object.assign({}, st, { season: 2025 }), new Date("2026-11-08T15:00:00Z")) && NFLM.seasonOf(Date.parse("2027-01-10T18:00:00Z")) === 2026;
  })());
  check("nfl: load() reads a fresh cache without a download, refreshes a stale one, keeps a stale cache when the download fails, and gives null (the old margin model) with no cache and no download", await (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-nfl-")), file = path.join(dir, "nflverse.json");
    let calls = 0; const counting = async n => { calls++; return nflFetch(n); }, broken = async () => { throw new Error("offline"); };
    const none = await NFLM.load({ file: file, now: nflNow, fetcher: broken });
    const built = await NFLM.load({ file: file, now: nflNow, fetcher: counting }), first = calls;
    const cached = JSON.parse(fs.readFileSync(file, "utf8")); cached.missing = 0; fs.writeFileSync(file, JSON.stringify(cached));
    const again = await NFLM.load({ file: file, now: new Date("2026-11-12T15:00:00Z"), fetcher: counting });
    const stale = await NFLM.load({ file: file, now: new Date("2026-11-19T15:00:00Z"), fetcher: broken });
    fs.rmSync(dir, { recursive: true, force: true });
    return none === null && built && first > 0 && again && calls === first && stale && stale.state.fetchedAt === nflNow.toISOString();
  })());
  check("nfl: rate(): a neutral site gets no home edge (the made-up London game), a home ground 2.146 points; the margin's own error is the posterior's, about 4 to 6 points this early", (() => {
    const london = NFLM.rate(nflIx, { home: "MIA", away: "NE", commenceMs: Date.parse("2026-11-15T14:30:00Z") }), home = NFLM.rate(nflIx, { home: "NYJ", away: "BUF", commenceMs: Date.parse("2026-11-15T18:00:00Z") });
    return london && london.neutral && london.part.home === 0 && home && !home.neutral && home.part.home === 2.146 && near(home.margin, home.part.home + home.part.rating + home.part.epa + home.part.qb + home.part.rest, 1e-9) && home.sd > 3.5 && home.sd < 7 && home.gpHome === 2 && home.gpAway === 1 && home.qbHome.id === GENO && home.qbAway.id === ALLEN;
  })());
  check("nfl: the starting QB moves the margin: nflverse lists Geno Smith for the Jets; with ESPN listing him out, the club's next QB by last season's dropbacks starts instead (named, with whom he replaces) and the Jets' number moves", (() => {
    const base = NFLM.rate(nflIx, { home: "NYJ", away: "BUF", commenceMs: Date.parse("2026-11-15T18:00:00Z") });
    const hurt = NFLM.rate(nflIx, { home: "NYJ", away: "BUF", commenceMs: Date.parse("2026-11-15T18:00:00Z"), homeInjuries: [{ name: "Geno Smith", pos: "QB", status: "Out" }] });
    const soft = NFLM.rate(nflIx, { home: "NYJ", away: "BUF", commenceMs: Date.parse("2026-11-15T18:00:00Z"), homeInjuries: [{ name: "Geno Smith", pos: "QB", status: "Questionable" }] });
    return hurt.qbHome.id !== GENO && hurt.qbHome.replaces === "Geno Smith" && hurt.qbHome.name && Math.abs(hurt.part.qb - base.part.qb) > 0.1 && near(hurt.part.rating, base.part.rating, 1e-9) && near(soft.margin, base.margin, 1e-9);
  })());
  check("nfl: apply() re-centres the old model's game on nflverse's margin (ESPN's WSH/LAR read as WAS/LA), prices the starting QB instead of a QB listed out (only the other listings cost points), keeps the total and the game counts, and leaves a game nflverse does not know alone", (() => {
    const form = (gp, m) => ({ gp: gp, pf: 24, pa: 24 - m, margin: m, last5: m, wins: 1, losses: 0, games: [] });
    const old = M.gameModel({ sportKey: "americanfootball_nfl", home: "New York Jets", away: "Buffalo Bills", homeForm: form(8, 2), awayForm: form(8, 5), homeInjuries: [{ name: "Geno Smith", pos: "QB", status: "Out" }], awayInjuries: [], rest: {} });
    const nonQB = { home: { cost: 0.5, out: ["A Lineman (OT)"], soft: [] }, away: { cost: 0, out: [], soft: [] } };
    const g2 = NFLM.apply(old, nflIx, { homeAbbr: "NYJ", awayAbbr: "BUF", commenceMs: Date.parse("2026-11-15T18:00:00Z"), homeInjuries: [{ name: "Geno Smith", pos: "QB", status: "Out" }], awayInjuries: [], injuries: nonQB });
    const r = NFLM.rate(nflIx, { home: "NYJ", away: "BUF", commenceMs: Date.parse("2026-11-15T18:00:00Z"), homeInjuries: [{ name: "Geno Smith", pos: "QB", status: "Out" }] });
    const unknown = NFLM.apply(old, nflIx, { homeAbbr: "WSH", awayAbbr: "LAR", commenceMs: Date.parse("2026-11-15T18:00:00Z"), injuries: nonQB });
    return g2 !== old && g2.nflverse && near(g2.margin, r.margin - 0.5, 1e-9) && near(g2.marginSd, r.sd, 1e-9) && g2.total === old.total && g2.gpHome === 8 && g2.parts.model === "nflverse" && g2.parts.injuriesHome === -0.5 && g2.reasons.some(x => /starts for New York Jets \(Geno Smith is listed out\)/.test(x.label)) && g2.reasons.some(x => /A Lineman/.test(x.label)) && !g2.reasons.some(x => /without Geno Smith/.test(x.label)) && g2.reasons.some(x => x.side === "total") && unknown === old && NFLM.apply(old, null, {}) === old;
  })());
  check("nfl: the bar reads the model's own margin error (marginSd): the posterior's 4.2 points makes a smaller bar than the old formula's, and a game without it keeps the old formula", (() => {
    const g = { sportKey: "americanfootball_nfl", margin: -2, total: 45, sd: 13.3, sdTotal: 13.4, gpHome: 8, gpAway: 8, parts: { lastHome: 1, lastAway: 1 } };
    const oldN = M.noise(g, "h2h", { name: "H" }, "H", "A"), newN = M.noise(Object.assign({}, g, { marginSd: 4.2 }), "h2h", { name: "H" }, "H", "A"), tot = M.noise(Object.assign({}, g, { marginSd: 4.2 }), "totals", { name: "Over", point: 44.5 }, "H", "A");
    return near(newN.units, 4.2, 1e-9) && newN.p < oldN.p && near(oldN.units, 13.3 * Math.sqrt(2 / 14), 0.01) && near(tot.units, M.noise(g, "totals", { name: "Over", point: 44.5 }, "H", "A").units, 1e-9);
  })());
  check("nfl: the hook in model.forEvent: an NFL game ESPN knows is re-centred on nflverse's model when its data loaded, and keeps the old margin model when it did not (download failed, no cache)", await (async () => {
    /* ESPN-shaped stubs from the fixture's 2026 games: the scoreboard for the Jets' home game and each club's schedule */
    const ids = { BUF: "2", NYJ: "20", MIA: "15", NE: "17" }, names = { BUF: "Buffalo Bills", NYJ: "New York Jets", MIA: "Miami Dolphins", NE: "New England Patriots" };
    const teamOf = c => ({ id: ids[c], abbreviation: c, displayName: names[c], name: names[c].split(" ").pop(), location: names[c].split(" ").slice(0, -1).join(" "), shortDisplayName: names[c].split(" ").pop() });
    const evOf = g => ({ id: g.id, date: g.day + "T18:00:00Z", seasonType: { type: 2 }, competitions: [{ status: { type: { completed: g.hs != null } }, neutralSite: g.neutral, competitors: [{ homeAway: "home", team: teamOf(g.home), score: g.hs == null ? undefined : { value: g.hs } }, { homeAway: "away", team: teamOf(g.away), score: g.as == null ? undefined : { value: g.as } }] }] });
    const g26 = nflIx.games.filter(g => g.season === 2026);
    const src = { scoreboard: async () => ({ events: g26.filter(g => g.id === "2026_10_BUF_NYJ").map(evOf) }), schedule: async (sport, id) => ({ events: g26.filter(g => ids[g.home] === String(id) || ids[g.away] === String(id)).map(evOf) }), injuries: async () => ({ injuries: [] }), standings: async () => null };
    const e = { sportKey: "americanfootball_nfl", home: "New York Jets", away: "Buffalo Bills", commence: "2026-11-15T18:00:00Z" };
    const withData = await M.forEvent(src, CTX, e, nflNow, { nfl: { get: async () => nflIx } });
    const without = await M.forEvent(src, CTX, e, nflNow, { nfl: { get: async () => null } });
    const plain = await M.forEvent(src, CTX, e, nflNow, {});
    return withData && withData.nflverse && Number.isFinite(withData.marginSd) && withData.parts.qbHome === "Geno Smith" && without && !without.nflverse && plain && near(without.margin, plain.margin, 1e-9) && !near(withData.margin, plain.margin, 1e-6);
  })());
  /* the Sunday morning run (owner, 2026-11-08: NFL "the same focus as NBA and NHL") */
  check("slots: the morning run asks about the NFL only on its morning days (Sunday, Thursday for Thanksgiving, Saturday late in the season), never on a Monday, Tuesday, Wednesday or Friday; the Premier League and MLS stay afternoon-only", P.slotAllows(nflC, "morning", 0) && P.slotAllows(nflC, "morning", 4) && P.slotAllows(nflC, "morning", 6) && [1, 2, 3, 5].every(d => !P.slotAllows(nflC, "morning", d)) && !P.slotAllows(nflC, "morning") && [0, 6].every(d => !P.slotAllows(eplC, "morning", d) && !P.slotAllows(mlsC, "morning", d)) && P.slotAllows(nflC, "afternoon", 3));
  check("slots: a Sunday morning (9 AM ET) counts the games kicking off before the afternoon run (London 9:30 AM, the 1 PM slate; not 4 PM, SNF or MNF) and fetches the NFL; Saturday's morning, with only Sunday's games in the window, does not; Thanksgiving's early games do; ESPN unreadable: Sundays only", await (async () => {
    const sun = { "20261108": { events: [gameAt("2026-11-08T14:30Z"), gameAt("2026-11-08T18:00Z"), gameAt("2026-11-08T18:00Z"), gameAt("2026-11-08T21:25Z"), gameAt("2026-11-09T01:20Z")] }, "20261109": { events: [gameAt("2026-11-10T01:15Z")] }, "20261107": { events: [] }, "20261110": { events: [] } };
    const espnSun = await P.espnGames(sbSrc(sun), nflC, new Date("2026-11-08T14:00:00Z")), espnSat = await P.espnGames(sbSrc(sun), nflC, new Date("2026-11-07T14:00:00Z"));
    const tg = await P.espnGames(sbSrc({ "20261126": { events: [gameAt("2026-11-26T17:30Z"), gameAt("2026-11-26T21:30Z"), gameAt("2026-11-27T01:20Z")] }, "20261127": { events: [] }, "20261125": { events: [] } }), nflC, new Date("2026-11-26T14:00:00Z"));
    const dSun = P.fetchDecision(nflC, { slot: "morning", espn: espnSun, weekday: 0 }), dSat = P.fetchDecision(nflC, { slot: "morning", espn: espnSat, weekday: 6 }), dTg = P.fetchDecision(nflC, { slot: "morning", espn: tg, weekday: 4 });
    const downSun = P.fetchDecision(nflC, { slot: "morning", espn: { games: 0, failed: 2, early: 0 }, weekday: 0 }), downSat = P.fetchDecision(nflC, { slot: "morning", espn: { games: 0, failed: 2, early: 0 }, weekday: 6 });
    const tnfMorning = P.fetchDecision(nflC, { slot: "morning", espn: { games: 1, failed: 0, early: 0 }, weekday: 4 });
    return espnSun.early === 3 && espnSun.games === 6 && dSun.fetch && espnSat.early === 0 && espnSat.games > 0 && !dSat.fetch && /no game before the afternoon run/.test(dSat.why) && tg.early === 1 && dTg.fetch && downSun.fetch && !downSat.fetch && /mornings only on Sundays/.test(downSat.why) && !tnfMorning.fetch;
  })());
  check("slots: the morning guard still protects the afternoon runs: a Sunday morning NFL fetch gives way when the month's credits run short, the afternoon run never does", (() => {
    const g = { games: 13, failed: 0, early: 11 };
    const tight = P.fetchDecision(nflC, { slot: "morning", espn: g, weekday: 0, remaining: 100, afternoonsLeft: 8 }), ok = P.fetchDecision(nflC, { slot: "morning", espn: g, weekday: 0, remaining: 120, afternoonsLeft: 8 }), pm = P.fetchDecision(nflC, { slot: "afternoon", espn: g, weekday: 6, remaining: 40, afternoonsLeft: 8 });
    return !tight.fetch && /morning run gives way: 100 credits left, 105 kept/.test(tight.why) && ok.fetch && pm.fetch;
  })());
  check("select: a Sunday morning run never posts a second pick on a game Saturday's run posted (one a game, any market), while a new game can still get one", (() => {
    const satLog = [{ id: "sat-nfl", eventId: "nfl-g1", sport: "NFL", date: "2026-11-08", status: "pending", past: 0.02 }];
    const sunC = [cand("g1-spread", "nfl-g1", "NFL", "2026-11-08", 0.06), cand("g2-ml", "nfl-g2", "NFL", "2026-11-08", 0.01)];
    return P.selectPicks(satLog, sunC).map(c => c.id).join() === "g2-ml";
  })());
  check("select: the day's cap ranks across sports and runs by points past the bar: ten NHL and soccer picks posted earlier at 1 point past do not block an NFL side 4 points past, ten further past than it do; the bar itself never moves", (() => {
    const day = "2026-11-08", posted = past => Array.from({ length: 10 }, (_, i) => ({ id: "p" + i, eventId: "e" + i, sport: i < 5 ? "NHL" : "Soccer", date: day, status: "pending", past: past }));
    const weakLog = posted(0.01), strongLog = posted(0.08), oldLog = posted(undefined);
    const nflSide = () => [cand("nfl", "nfl-g", "NFL", day, 0.04)];
    const weak = P.selectPicks(weakLog, nflSide()).map(c => c.id), strong = P.selectPicks(strongLog, nflSide()).map(c => c.id), old = P.selectPicks(oldLog, nflSide()).map(c => c.id);
    const run = P.selectPicks([], Array.from({ length: 12 }, (_, i) => cand("r" + i, "re" + i, ["NBA", "NHL", "NFL"][i % 3], day, 0.1 - i / 100))).map(c => c.id);
    return weak.join() === "nfl" && strong.length === 0 && old.length === 0 && run.length === 10 && run.indexOf("r10") === -1 && run.indexOf("r11") === -1;
  })());

  /* ---------- college football (2026-11-08, scripts/ncaaf.js): FBS ratings from game data, Friday's run, nothing posted until a replay backs it ---------- */
  const NCF = require("./ncaaf.js"), MCF = require("./model.js"), cfbCfg = SP("americanfootball_ncaaf");
  check("ncaaf: wired as NCAAF (league NCAAF; moneyline, spread and total, 3 credits) and fetched on Friday's afternoon run only: not on Saturday's or Friday's morning run, nor any other day; a manual run fetches it any day", (() => {
    const g = { games: 9, failed: 0 }, at = (slot, wd) => P.fetchDecision(cfbCfg, { slot: slot, espn: g, weekday: wd, remaining: 300, afternoonsLeft: 10 });
    return cfbCfg && cfbCfg.sport === "NCAAF" && cfbCfg.league === "NCAAF" && cfbCfg.markets.join() === "h2h,spreads,totals" && P.oddsCost(cfbCfg) === 3 && at("afternoon", 5).fetch && !at("afternoon", 6).fetch && at("afternoon", 6).why === "fetched on Friday runs only" && !at("morning", 5).fetch && !at("afternoon", 2).fetch && at("manual", 2).fetch
      && P.runDayAllows(cfbCfg, "afternoon", 5) && !P.runDayAllows(cfbCfg, "afternoon", 4) && P.runDayAllows(nbaC, "afternoon", 4) && P.planLine({ slot: "afternoon", plan: [{ sport: "americanfootball_ncaaf", fetch: false, why: "fetched on Friday runs only" }] }) === "Odds API (afternoon run): nothing fetched | skipped: NCAAF (fetched on Friday runs only)";
  })());
  /* end to end on Friday Nov 13's afternoon run: three Friday-night games and six Saturday games (ESPN fixtures trimmed from the live slate, priced at DraftKings' numbers), one earlier college pick to grade */
  const tmpCF = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-ncaaf-"));
  fs.writeFileSync(path.join(tmpCF, "picks-log.json"), JSON.stringify([{ key: "ncaaf-seed|h2h|Georgia Bulldogs|null", id: "ncaaf-seed-h2h-Georgia", date: "2026-11-07", commence: "2026-11-07T20:30:00Z", sport: "NCAAF", league: "NCAAF", sportKey: "americanfootball_ncaaf", eventId: "ncaaf-seed", home: "Ole Miss Rebels", away: "Georgia Bulldogs", event: "Georgia Bulldogs @ Ole Miss Rebels", market: "Moneyline", marketKey: "h2h", outcome: { name: "Georgia Bulldogs", point: null }, pick: "Georgia Bulldogs ML", odds: -150, book: "FanDuel", modelProb: 0.7, edge: 0.1, basis: "game", status: "pending", units: 0, loggedAt: "2026-11-06T20:30:00Z" }]));
  const rcF = await P.run({ fixture: true, oddsFixture: "odds-ncaaf.json", out: tmpCF, now: "2026-11-13T20:30:00Z", slot: "afternoon" });
  const sbNCF = { window: {} }; vm.runInNewContext(["picks.js", "market.js", "performance.js"].map(f => fs.readFileSync(path.join(tmpCF, f), "utf8")).join("\n"), sbNCF);
  const MKCF = sbNCF.window.MARKET_DATA, PDCF = sbNCF.window.PICKS_DATA, PFCF = sbNCF.window.PERF_DATA, rowsCF = MKCF.rows.filter(r => r.sportKey === "americanfootball_ncaaf");
  const cfbPlanF = rcF.plan.find(p => p.sport === "americanfootball_ncaaf");
  check("ncaaf: Friday's afternoon run fetches the college slate (ESPN shows 9 FBS games inside 36 hours) and models every game, the feed's \"Appalachian State Mountaineers\" and \"Connecticut Huskies\" matched to ESPN's App State and UConn", cfbPlanF && cfbPlanF.fetch && /9 games inside 36 hours on ESPN/.test(cfbPlanF.why) && cfbPlanF.events === 9 && rcF.modelled === 9 && rcF.unmodelled === 0 && rowsCF.length === 54 && rowsCF.every(r => r.modelled && r.sport === "NCAAF" && r.league === "NCAAF") && rowsCF.some(r => r.home === "Connecticut Huskies") && rowsCF.some(r => r.away === "Appalachian State Mountaineers"), JSON.stringify([cfbPlanF, rcF.modelled, rcF.unmodelled, rowsCF.length]));
  check("ncaaf: nothing is posted: spreads read even and totals about even (no signal at the books' lines, CALIB), and the moneyline is held (HOLD: the replay could not back it), so its sides past their bar stay plain market rows; no college pick, no watch", rowsCF.filter(r => r.marketKey === "spreads").every(r => r.modelProb === 0.5) && rowsCF.filter(r => r.marketKey === "totals").every(r => r.modelProb > 0.46 && r.modelProb < 0.54) && rowsCF.every(r => r.status === "none") && rowsCF.filter(r => r.marketKey === "h2h" && r.past >= 0).length >= 1 && !PDCF.picks.some(p => p.sportKey === "americanfootball_ncaaf" && p.status === "pending") && rcF.added === 0, JSON.stringify(rowsCF.filter(r => r.past >= 0).map(r => [r.pick, r.odds, r.modelProb, r.bar])));
  check("ncaaf: prices at the extremes parse and price (Notre Dame -9995 and +3005, a 31.5-point spread): our probability stays inside (0, 1), the edge is ours minus the price's, and every bar is at least the 3-point floor", (() => {
    const nd = rowsCF.find(r => r.pick === "Notre Dame Fighting Irish ML"), bc = rowsCF.find(r => r.pick === "Boston College Eagles ML"), sp = rowsCF.filter(r => r.marketKey === "spreads" && Math.abs(r.outcome.point) === 31.5);
    return nd && bc && nd.odds === -9995 && bc.odds === 3005 && nd.modelProb > 0.9 && nd.modelProb < 1 && near(nd.edge, nd.modelProb - P.implied(-9995), 1e-4) && near(nd.modelProb + bc.modelProb, 1, 2e-4) && sp.length === 2 && rowsCF.every(r => r.bar >= 0.03) && near(P.implied(-10000), 0.990099, 1e-6) && P.valueTo(0.97, 0.03) === -1566;
  })(), JSON.stringify(rowsCF.filter(r => /Notre Dame|Boston College/.test(r.pick)).map(r => [r.pick, r.odds, r.modelProb, r.edge, r.bar])));
  const seedCF = JSON.parse(fs.readFileSync(path.join(tmpCF, "picks-log.json"), "utf8")).find(e => e.id === "ncaaf-seed-h2h-Georgia");
  check("ncaaf: a college pick is graded from ESPN's final (Georgia 42, Ole Miss 7: the Georgia moneyline at -150 wins 0.67) and performance counts it under NCAAF", seedCF.status === "graded" && seedCF.result === "Win" && seedCF.units === 0.67 && seedCF.finalScore.away === 42 && seedCF.finalScore.home === 7 && PFCF.bySport.some(b => b.sport === "NCAAF" && b.record === "1-0" && b.units === 0.67) && rcF.settled === 1, JSON.stringify([seedCF.status, seedCF.result, seedCF.units, PFCF.bySport]));
  const rcsF = await P.run({ fixture: true, oddsFixture: "odds-ncaaf.json", out: tmpCF, now: "2026-11-14T14:00:00Z", slot: "morning" });
  const sbCF2 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpCF, "market.js"), "utf8"), sbCF2);
  const keptCF = sbCF2.window.MARKET_DATA.rows.filter(r => r.sportKey === "americanfootball_ncaaf");
  /* Texas Tech at Oklahoma State carries ESPN's kickoff-to-be-announced placeholder (05:00 UTC, midnight Eastern), so by Saturday morning it counts as started and leaves with Friday's games */
  check("ncaaf: Saturday's morning run does not fetch college football, and Saturday's games still ahead keep their rows from Friday's run with when they were priced (Friday's games, and one listed at ESPN's placeholder midnight, have started and leave)", rcsF.plan.some(p => p.sport === "americanfootball_ncaaf" && !p.fetch && p.why === "fetched on the afternoon run only") && keptCF.length === 30 && keptCF.length === rowsCF.filter(r => Date.parse(r.commence) > Date.parse("2026-11-14T14:00:00Z")).length && keptCF.every(r => r.pricedAt === MKCF.generatedAt && Date.parse(r.commence) > Date.parse("2026-11-14T14:00:00Z")), JSON.stringify([keptCF.length, rcsF.plan.find(p => p.sport === "americanfootball_ncaaf")]));
  fs.rmSync(tmpCF, { recursive: true, force: true });
  check("ncaaf: a game with an FCS team is not modelled (no probability, never a lean), and the season's weeks are not even asked for", await (async () => {
    let weeks = 0;
    const t = (id, name, conf) => ({ id: id, displayName: name, name: name.split(" ").pop(), location: name.split(" ")[0], shortDisplayName: name.split(" ")[0], conferenceId: conf });
    const sb = { events: [{ id: "1", date: "2026-11-21T19:00Z", competitions: [{ neutralSite: false, competitors: [{ homeAway: "home", team: t("333", "Alabama Crimson Tide", "8") }, { homeAway: "away", team: t("236", "Chattanooga Mocs", "29") }] }] }] };
    const src = { scoreboard: async () => sb, week: async () => { weeks++; return null; } };
    const gm = await MCF.forEvent(src, CTX, { sportKey: "americanfootball_ncaaf", home: "Alabama Crimson Tide", away: "Chattanooga Mocs", commence: "2026-11-21T19:00:00Z" }, new Date("2026-11-20T20:30:00Z"), {});
    return gm === null && weeks === 0 && NCF.isFbsConf("8") && !NCF.isFbsConf("29") && !NCF.isFbsConf(null);
  })());
  check("ncaaf: the ratings are schedule-adjusted: on a round robin with known strengths the fit recovers each gap, the home edge applies only away from a neutral site, a blowout counts only to the 35-point cap; a bowl in January belongs to the autumn's season", (() => {
    const tr = { a: 14, b: 7, c: 0, d: -7 }, ids = Object.keys(tr), games = [];
    let n = 0;
    ids.forEach(h => ids.forEach(a => { if (h === a) return; const neutral = h === "a" && a === "d"; const m = tr[h] - tr[a] + (neutral ? 0 : 2.8); games.push({ id: String(n++), date: n * 864e5, done: true, home: h, away: a, hs: 30 + m / 2, as: 30 - m / 2, neutral: neutral }); }));
    const R = NCF.fit(games, new Set(ids), null, { k: 0.01 });
    const gaps = ids.every(x => near(R.r[x] - R.r.d, tr[x] - tr.d, 0.2));
    const pj = NCF.project(R, "a", "d", false, null), pjN = NCF.project(R, "a", "d", true, null);
    const blow = NCF.fit([{ id: "x", date: 1, done: true, home: "a", away: "b", hs: 77, as: 0, neutral: true }], new Set(["a", "b"]), null, { k: 0.001 });
    const pr = NCF.fit([], new Set(["a"]), null, {});
    return gaps && near(pj.margin - pjN.margin, 2.8, 1e-9) && near(pjN.margin, 21, 0.2) && near(blow.r.a - blow.r.b, 35, 0.2) && Object.keys(pr.r).length === 0
      && NCF.seasonOf(Date.parse("2027-01-01T20:00Z")) === 2026 && NCF.seasonOf(Date.parse("2026-08-29T16:00Z")) === 2026 && NCF.seasonOf(Date.parse("2026-11-14T17:00Z")) === 2026;
  })());
  check("ncaaf: CALIB from the held-out replay (results only): spreads [0, 0] and totals [0, 0.11] read about even and have no signal; the moneyline stays as it is but is held, so no college market is pickable while the NFL moneyline still is; the reasons say why", (() => {
    const K = "americanfootball_ncaaf", gm = { sportKey: K, home: "H", away: "A", margin: 7, total: 55, sd: 16, sdTotal: 16, gp: 9, gpHome: 9, gpAway: 9, reasons: [], parts: { lastHome: 3, lastAway: 1 } };
    const ml = MCF.sideProb(gm, "h2h", { name: "H" }, "H", "A"), sp = MCF.sideProb(gm, "spreads", { name: "H", point: -3.5 }, "H", "A"), to = MCF.sideProb(gm, "totals", { name: "Over", point: 50.5 }, "H", "A");
    const why = MCF.sideReasons(gm, "h2h", { name: "H" }, "H", "A").against.join(" "), whyS = MCF.sideReasons(gm, "spreads", { name: "H", point: -3.5 }, "H", "A").against.join(" ");
    return JSON.stringify(MCF.CALIB[K]) === '{"spreads":[0,0],"totals":[0,0.11]}' && ["h2h", "spreads", "totals"].every(k => !MCF.hasSignal(K, k)) && MCF.hasSignal("americanfootball_nfl", "h2h") && MCF.hasSignal("icehockey_nhl", "spreads")
      && near(ml, MCF.Phi(7 / 16), 2e-4) && sp === 0.5 && to > 0.5 && to < 0.53 && /won about as often as the price said/.test(why) && /did no better than a coin flip/.test(whyS);
  })());
  check("ncaaf: the curve holds at the extremes (a 35-point favourite 98.6% on the moneyline, about even at a 34.5-point spread before CALIB, the push on a whole number) and the bar is the ratings' own error (16 x sqrt(2 / (9 + 3)) = 6.5 points on the margin)", (() => {
    const gm = { sportKey: "americanfootball_ncaaf", home: "H", away: "A", margin: 35, total: 60, sd: 16, sdTotal: 16, gp: 9, gpHome: 9, gpAway: 9, parts: { lastHome: 10, lastAway: -10 } };
    const ml = MCF.rawSideProb(gm, "h2h", { name: "H" }, "H", "A"), sp = MCF.rawSideProb(gm, "spreads", { name: "H", point: -34.5 }, "H", "A"), push = MCF.rawSideProb(gm, "spreads", { name: "H", point: -35 }, "H", "A");
    const n = MCF.noise(Object.assign({}, gm, { margin: 3 }), "h2h", { name: "H" }, "H", "A");
    return near(ml, 0.9857, 2e-4) && near(sp, 0.5125, 2e-3) && near(push, 0.5, 1e-4) && n && near(n.units, 6.53, 0.01) && n.unit === "points" && n.p > 0.1 && n.p < 0.2;
  })());
  check("context: college names meet ESPN's (the feed's spellings: App State, Hawai'i, UConn, San José State, Miami (FL)) and never cross between the two Miamis or USC and South Carolina", (() => {
    const T = (d, n, l) => ({ displayName: d, name: n, location: l, shortDisplayName: l });
    const yes = [["Appalachian State Mountaineers", T("App State Mountaineers", "Mountaineers", "App State")], ["Hawaii Rainbow Warriors", T("Hawai'i Rainbow Warriors", "Rainbow Warriors", "Hawai'i")], ["Connecticut Huskies", T("UConn Huskies", "Huskies", "UConn")], ["San Jose State Spartans", T("San José State Spartans", "Spartans", "San José State")], ["Miami (FL) Hurricanes", T("Miami Hurricanes", "Hurricanes", "Miami")], ["Mississippi Rebels", T("Ole Miss Rebels", "Rebels", "Ole Miss")], ["Miami (OH) RedHawks", T("Miami (OH) RedHawks", "RedHawks", "Miami (OH)")]];
    const no = [["Miami Hurricanes", T("Miami (OH) RedHawks", "RedHawks", "Miami (OH)")], ["Miami (OH) RedHawks", T("Miami Hurricanes", "Hurricanes", "Miami")], ["USC Trojans", T("South Carolina Gamecocks", "Gamecocks", "South Carolina")], ["Mississippi State Bulldogs", T("Ole Miss Rebels", "Rebels", "Ole Miss")], ["Washington Huskies", T("UConn Huskies", "Huskies", "UConn")]];
    return yes.every(([a, t]) => CTX.teamMatches(a, t)) && !no.some(([a, t]) => CTX.teamMatches(a, t)) && CTX.ESPN.americanfootball_ncaaf === "football/college-football" && CTX.ESPN_CORE.americanfootball_ncaaf === "football/leagues/college-football";
  })());
  check("teams: update-teams writes college football as NCAAF with the feed's other spellings (aka) on the schools that need them", await (async () => {
    const T = require("./update-teams.js"), tmpT = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-teams-"));
    const espnTeam = (id, name, abbr) => ({ team: { id: id, abbreviation: abbr, displayName: name, shortDisplayName: name.split(" ")[0], name: name.split(" ").pop(), location: name.split(" ")[0], color: "000000", logos: [{ href: "https://a.espncdn.com/i/teamlogos/x/500/" + id + ".png", rel: ["full", "default"] }] } });
    const d = await T.run({ out: tmpT, fetch: async l => ({ sports: [{ leagues: [{ teams: l.sportKey === "americanfootball_ncaaf" ? [espnTeam("2026", "App State Mountaineers", "APP"), espnTeam("2390", "Miami Hurricanes", "MIA")] : [espnTeam("1", "Atlanta Hawks", "ATL")] }] }] }) });
    fs.rmSync(tmpT, { recursive: true, force: true });
    const c = d.leagues.americanfootball_ncaaf;
    return c && c.sport === "NCAAF" && c.teams.find(t => t.id === "2026").aka.indexOf("Appalachian State Mountaineers") !== -1 && c.teams.find(t => t.id === "2390").aka.indexOf("Miami (FL) Hurricanes") !== -1 && !d.leagues.basketball_nba.teams[0].aka;
  })());

  /* ---------- the close is always a pre-game price (2026-11-08): (a) DraftKings' close on ESPN, (b) our own last
     SportsGameOdds look before the start, (c) our last Odds API check before the start; the repair pass fixes the closes
     read from SportsGameOdds' post-game record and touches nothing else ---------- */
  {
    const dkOdds = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", "ctx-odds-basketball-nba-401909900.json"), "utf8"));
    const espnCtx = { odds: async () => dkOdds, scoreboard: async () => null }, noEspn = { odds: async () => null, scoreboard: async () => null };
    const T0 = "2026-11-04T00:00:00Z";
    const base = extra => Object.assign({ id: "c1", sportKey: "basketball_nba", sport: "NBA", home: "Boston Celtics", away: "Milwaukee Bucks", commence: T0, context: { espnEventId: "401909900" }, marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, odds: 140 }, extra);
    /* our own looks: two before the start, one in-game (+1010 with no book open: the bug's shape) */
    const sgoPts = [{ at: "2026-11-03T18:00:00Z", fair: 0.41, vendorFair: 0.405, line: null, odds: 145, best: 150, n: 6 }, { at: "2026-11-03T23:30:00Z", fair: 0.4, vendorFair: 0.395, line: null, odds: 148, best: 152, n: 7 }, { at: "2026-11-04T01:40:00Z", fair: null, vendorFair: 0.09, line: null, odds: 1010, best: null, n: 0 }];
    const hist = [{ at: "2026-11-03T15:00:00Z", odds: 140, fair: 0.42 }, { at: "2026-11-03T20:30:00Z", odds: 135, fair: 0.43 }, { at: "2026-11-04T00:30:00Z", odds: 900, fair: 0.1 }];
    const a = await P.closeFor(base({ sgoHistory: sgoPts, history: hist }), { ctx: espnCtx });
    const b = await P.closeFor(base({ sgoHistory: sgoPts, history: hist }), { ctx: noEspn });
    const c = await P.closeFor(base({ sgoHistory: sgoPts.slice(2), history: hist }), { ctx: noEspn });
    const d = await P.closeFor(base({ sgoHistory: sgoPts.slice(2), history: hist.slice(2) }), { ctx: noEspn });
    check("close order: (a) DraftKings' close from ESPN first, (b) our last SportsGameOdds look before the start, (c) our last Odds API check before the start, else null", a && a.source === "DraftKings close (ESPN)" && a.odds === 150 && near(a.fair, dkFair(150, -170), 1e-4)
      && b && /^last pre-game check \(SportsGameOdds, 7 books\)$/.test(b.source) && b.at === "2026-11-03T23:30:00Z" && b.fair === 0.4 && b.odds === 152 && b.samples === 2
      && c && c.source === "last check (Odds API)" && c.at === "2026-11-03T20:30:00Z" && c.fair === 0.43 && c.odds === 135 && c.samples === 2
      && d === null, JSON.stringify([a, b, c, d]));
    check("close: a point recorded after the start is never the close (the in-game +1010 and the Odds API's +900 are skipped)", b.odds !== 1010 && c.odds !== 900 && P.sgoPreClose(base({ sgoHistory: sgoPts.slice(2) })) === null && P.closingLine(base({ history: hist })).at === "2026-11-03T20:30:00Z");
    /* (b) on a spread: the books on our exact line give the price CLV; when none is on it, only the line's direction */
    const spr = extra => base(Object.assign({ marketKey: "spreads", outcome: { name: "Boston Celtics", point: -3 }, odds: -110 }, extra));
    const onLine = P.sgoPreClose(spr({ sgoHistory: [{ at: "2026-11-03T23:00:00Z", fair: 0.53, vendorFair: 0.5, line: -3.5, odds: -105, best: -108, n: 5 }] }));
    const offLine = P.sgoPreClose(spr({ sgoHistory: [{ at: "2026-11-03T23:00:00Z", fair: null, vendorFair: 0.5, line: -3.5, odds: -105, best: null, n: 0 }] }));
    const e1 = spr({}), e2 = spr({}); P.applyClose(e1, onLine); P.applyClose(e2, offLine);
    check("close (b): on our line the consensus fair gives price CLV; off it, no price CLV and the line's move (-3 -> -3.5: toward us)", onLine.fair === 0.53 && onLine.line === -3 && near(e1.clv, 0.53 - P.implied(-110), 1e-4) && e1.lineMove === null && offLine.fair === null && offLine.line === -3.5 && e2.clv === null && e2.lineMove === "toward", JSON.stringify([onLine, offLine, e2.lineMove]));
    /* soccer: DraftKings' moneyline de-vigged three ways (home, away, the draw), never two */
    const CX = require("./context.js"), snap3 = { ml: { home: 300, away: -145 }, draw: 330, spread: null, total: null };
    const mls = n => ({ sportKey: "soccer_usa_mls", marketKey: "h2h", home: "Austin FC", away: "Los Angeles FC", outcome: { name: n, point: null } });
    const tot3 = P.implied(300) + P.implied(-145) + P.implied(330), aus = CX.dkSide(mls("Austin FC"), snap3), drw = CX.dkSide(mls("Draw"), snap3), noDraw = CX.dkSide(mls("Austin FC"), Object.assign({}, snap3, { draw: null }));
    check("close (a), soccer: DraftKings' moneyline is de-vigged across home, away and the draw (Austin FC +300: 23.3%, not the two-way 29.7%); without the draw's price there is no fair", near(aus.fair, P.implied(300) / tot3, 1e-6) && near(drw.fair, P.implied(330) / tot3, 1e-6) && drw.odds === 330 && noDraw.odds === 300 && noDraw.fair === null, JSON.stringify([aus, drw, noDraw]));
    /* the repair pass on the real bug's shape: the Flyers ML, posted +133, graded a win, "closed" +1010 from the post-game record */
    const flyers = base({ id: "flyers", status: "graded", result: "Win", units: 1.33, score: "2-5", finalScore: { home: 2, away: 5 }, gradedAt: "2026-11-04T03:00:00Z", odds: 133, sgoHistory: sgoPts, history: hist,
      close: { source: "consensus close (SportsGameOdds, 0 books)", line: null, odds: 1010, fair: 0.0901, moved: null, samples: 3 }, clv: -0.3391, lineMove: null });
    const lateCheck = base({ id: "late", status: "graded", result: "Loss", units: -1, odds: 140, history: hist, close: { source: "last check (Odds API)", at: "2026-11-04T00:30:00Z", odds: 900, fair: 0.1, samples: 3 }, clv: -0.3167, lineMove: null });
    const good = base({ id: "good", status: "graded", result: "Loss", units: -1, close: { source: "DraftKings close (ESPN)", line: null, odds: 150, fair: 0.3885 }, clv: -0.0282, lineMove: null });
    const lost = base({ id: "lost", status: "graded", result: "Push", units: 0, close: { source: "consensus close (SportsGameOdds, 0 books)", odds: 4991, fair: null, line: 3.5, moved: "away" }, clv: null, lineMove: "away", context: {} });
    const rlog = [flyers, lateCheck, good, lost], keep = rlog.map(e => JSON.stringify([e.status, e.result, e.units, e.score, e.finalScore, e.gradedAt, e.odds]));
    const n1 = await P.repairCloses(rlog, new Date("2026-11-08T15:00:00Z"), { ctx: noEspn });
    check("repair: a close read from SportsGameOdds' post-game record (and one checked after the start) is re-derived from pre-game prices; results, units and grades do not move; a sound close is left alone", n1 === 3
      && flyers.close.source === "last pre-game check (SportsGameOdds, 7 books)" && flyers.close.fair === 0.4 && near(flyers.clv, 0.4 - P.implied(133), 1e-4) && flyers.closeRepair.was.odds === 1010 && flyers.closeRepair.was.clv === -0.3391
      && lateCheck.close.source === "last check (Odds API)" && lateCheck.close.odds === 135 && near(lateCheck.clv, 0.43 - P.implied(140), 1e-4)
      && good.close.odds === 150 && good.clv === -0.0282 && !good.closeRepair
      && lost.close === null && lost.clv === null && lost.lineMove === null && lost.closeRepair.tries === 1
      && rlog.every((e, i) => JSON.stringify([e.status, e.result, e.units, e.score, e.finalScore, e.gradedAt, e.odds]) === keep[i]), JSON.stringify(rlog.map(e => [e.id, e.close, e.clv, e.closeRepair])));
    lost.context = { espnEventId: "401909900" }; /* ESPN finds the game this time */
    const n2 = await P.repairCloses(rlog, new Date("2026-11-08T16:00:00Z"), { ctx: espnCtx });
    check("repair: the next run leaves the repaired closes alone and retries only a pick that found no pre-game price (here ESPN answers: DraftKings' close)", n2 === 1 && flyers.close.source === "last pre-game check (SportsGameOdds, 7 books)" && lost.close && lost.close.source === "DraftKings close (ESPN)" && !("tries" in lost.closeRepair) && lost.closeRepair.was.odds === 4991, JSON.stringify([n2, lost.close, lost.closeRepair]));
    /* end to end: a full run on fixtures repairs a bad close in the log and rewrites performance.js from it */
    const tmpR = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-repair-"));
    const bad = Object.assign(pending("bad-close", { market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 140, basis: "game" }), { status: "graded", result: "Loss", units: -1, score: "104-110", finalScore: { home: 110, away: 104 }, gradedAt: "2026-11-04T03:00:00Z", close: { source: "consensus close (SportsGameOdds, 0 books)", odds: 5188, fair: 0.0189, line: null }, clv: -0.3978, lineMove: null });
    fs.writeFileSync(path.join(tmpR, "picks-log.json"), JSON.stringify([bad]));
    const rr = await P.run({ fixture: true, out: tmpR, now: NOW });
    const rl = JSON.parse(fs.readFileSync(path.join(tmpR, "picks-log.json"), "utf8")).find(e => e.id === "bad-close");
    const pfR = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmpR, "performance.js"), "utf8"), pfR);
    check("repair (full run): the bad close becomes DraftKings' close, performance.js's CLV is rewritten from it, the loss stays a loss", rr.closesRepaired === 1 && rl.close.source === "DraftKings close (ESPN)" && near(rl.clv, mlClv, 0.001) && rl.result === "Loss" && rl.units === -1 && near(pfR.window.PERF_DATA.clv.avg, mlClv * 100, 0.02) && pfR.window.PERF_DATA.clv.sgoCloses === 0, JSON.stringify([rr.closesRepaired, rl.close, pfR.window.PERF_DATA.clv]));
    fs.rmSync(tmpR, { recursive: true, force: true });
  }

  /* ---------- every pipeline request names us honestly (2026-11-08): BOT_UA or Node's own client name, never a browser's ---------- */
  check("user agents: every user-agent header in scripts/ is BOT_UA (or a constant equal to it), nfl.js reads context.js's, and no script sends a browser's name or client hints", (function () {
    const C = require("./context.js"), dir = __dirname;
    if (C.BOT_UA !== "EdgeLineAI-data/1.0 (+https://ajur21.github.io/edgeline-ai/)") return false;
    const files = fs.readdirSync(dir).filter(f => /\.js$/.test(f) && f !== "behavior.js" && f !== "screenshot.js" && f !== "data-test.js");
    let ok = true;
    files.forEach(function (f) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (/Mozilla\/|AppleWebKit|Chrome\/|sec-ch-ua/i.test(src)) ok = false;
      (src.match(/["']user-agent["']\s*:\s*([^,}]+)/gi) || []).forEach(function (m) { if (!/:\s*(BOT_UA|UA|NWS_UA)\s*$/.test(m.trim())) ok = false; });
      (src.match(/const (UA|NWS_UA)\s*=\s*"([^"]+)"/g) || []).forEach(function (m) { if (m.indexOf(C.BOT_UA) === -1) ok = false; });
    });
    return ok && /require\("\.\/context\.js"\)\.BOT_UA/.test(fs.readFileSync(path.join(dir, "nfl.js"), "utf8"));
  })());

  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
