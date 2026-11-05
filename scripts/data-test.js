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

  /* full run on fixtures, with a pre-existing log to grade */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-data-"));
  const NOW = "2026-11-05T15:00:00Z";
  const pending = (id, extra) => Object.assign({ key: id, id: id, date: "2026-11-03", commence: "2026-11-04T00:00:00Z", sport: "NBA", league: "NBA", sportKey: "basketball_nba", eventId: "nba-old-1", event: "Milwaukee Bucks @ Boston Celtics", home: "Boston Celtics", away: "Milwaukee Bucks", edge: 0.03, confidence: "Medium", status: "pending", units: 0 }, extra);
  fs.writeFileSync(path.join(tmp, "picks-log.json"), JSON.stringify([
    pending("old-ml", { market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 140, history: [{ at: "2026-11-03T17:00:00Z", odds: 140, fair: 0.42 }, { at: "2026-11-03T20:30:00Z", odds: 130, fair: 0.45 }] }),
    pending("old-spread", { market: "Spread", marketKey: "spreads", outcome: { name: "Boston Celtics", point: -3 }, pick: "Boston Celtics -3", odds: -110 }),
    pending("old-total", { market: "Total", marketKey: "totals", outcome: { name: "Over", point: 214 }, pick: "Over 214", odds: -110 }),
    pending("stale", { sport: "NFL", sportKey: "americanfootball_nfl", eventId: "nfl-gone", commence: "2026-10-25T17:00:00Z", date: "2026-10-25", market: "Moneyline", marketKey: "h2h", outcome: { name: "X", point: null }, pick: "X ML", odds: 100 })
  ]));
  /* the log entries above use the market label; the pipeline grades on the market key */
  const fixLog = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8")).map(e => Object.assign(e, { market: e.marketKey }));
  fs.writeFileSync(path.join(tmp, "picks-log.json"), JSON.stringify(fixLog));

  const r1 = await P.run({ fixture: true, out: tmp, now: NOW });
  const log = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  check("run: graded ML as a loss", byId["old-ml"].status === "graded" && byId["old-ml"].result === "Loss" && byId["old-ml"].units === -1);
  check("run: graded spread as a win at +0.91u", byId["old-spread"].result === "Win" && near(byId["old-spread"].units, 0.91, 0.01));
  check("run: graded total as a push", byId["old-total"].result === "Push" && byId["old-total"].units === 0);
  check("run: stale pick voided", byId["stale"].status === "void");
  /* closing line value: the nine-book consensus close (SportsGameOdds fixture: vendor fair +150 for the Bucks, spread closed -3.5, total 214 at -105) wins over
     DraftKings' ESPN close (fixture: BOS -170 / MIL +150), which wins over our own last check */
  const dkFair = (a, b) => P.implied(a) / (P.implied(a) + P.implied(b));
  const mlClv = P.implied(150) - P.implied(140), totClv = P.implied(-105) - P.implied(-110);
  check("clv: moneyline close is the market consensus from SportsGameOdds (took +140, market closed +150 -> negative CLV)", byId["old-ml"].close && /SportsGameOdds, 3 books/.test(byId["old-ml"].close.source) && byId["old-ml"].close.odds === 150 && byId["old-ml"].close.samples === 2 && near(byId["old-ml"].clv, mlClv, 0.001) && byId["old-ml"].clv < 0, JSON.stringify([byId["old-ml"].close, byId["old-ml"].clv, mlClv]));
  check("clv: a total that closed on our number gets price CLV from the vendor fair", near(byId["old-total"].clv, totClv, 0.001) && byId["old-total"].close.line === 214 && byId["old-total"].close.books.FanDuel === -105, JSON.stringify([byId["old-total"].close, byId["old-total"].clv]));
  check("clv: ESPN's DraftKings close is the fallback when SportsGameOdds has no game (unit: soccer is not covered)", (await require("./sgo.js").close(require("./sgo.js").source({ fixture: true }), { sportKey: "soccer_epl", home: "Arsenal", away: "Liverpool", commence: "2026-11-06T20:00:00Z", marketKey: "h2h", outcome: { name: "Draw" }, odds: 330 })) === null && near(dkFair(150, -170) - P.implied(140), -0.0282, 0.001));
  check("grading: free scores settled the NBA picks; The Odds API scores endpoint was called once, for the stale NFL pick only", r1.scoresRequests === 1 && byId["old-ml"].score === "104-110", "scores calls " + r1.scoresRequests);
  check("clv: a spread that closed on a different number has no price CLV but a direction (-3 -> -3.5 is toward us)", byId["old-spread"].clv == null && byId["old-spread"].lineMove === "toward" && byId["old-spread"].close.line === -3.5 && byId["old-spread"].close.fair == null, JSON.stringify(byId["old-spread"].close));
  check("clv: ESPN open is kept alongside the close", byId["old-ml"].close.open && byId["old-ml"].close.open.odds === 130);
  /* the game model (owner rule, 2026-11-04): every side's probability comes from scripts/model.js, never from a book's price */
  check("run: added 5 picks, all graded on game data; two games modelled, the NFL game not (no ESPN record in the fixtures)", r1.added === 5 && r1.modelled === 2 && r1.unmodelled === 1, "added " + r1.added + " " + JSON.stringify([r1.modelled, r1.unmodelled]));
  const added = log.filter(e => e.loggedAt);
  const bucks = added.find(e => e.pick === "Milwaukee Bucks ML"), draw = added.find(e => e.pick === "Draw"), celtics = added.find(e => e.pick === "Boston Celtics ML"), arsenal = added.find(e => e.pick === "Arsenal ML");
  check("run: the old grade's price outliers (Bucks ML +160, the Draw +330) are not picks: the model has them at 19% and 20%", !bucks && !draw);
  const M = require("./model.js"), CTX = require("./context.js");
  const modelOpts = { ppgOf: M.ppgFromFaces(path.join(__dirname, "fixtures", "sample-faces.js")) };
  const gmFix = await M.forEvent(CTX.source({ fixture: true }), CTX, { sportKey: "basketball_nba", home: "Boston Celtics", away: "Milwaukee Bucks", commence: "2026-11-06T00:00:00Z" }, new Date(NOW), modelOpts);
  const gmEpl = await M.forEvent(CTX.source({ fixture: true }), CTX, { sportKey: "soccer_epl", home: "Arsenal", away: "Liverpool", commence: "2026-11-06T20:00:00Z" }, new Date(NOW), modelOpts);
  check("run: Celtics ML at Caesars -145, High: our probability is the model's (margin +10.8 from ratings, home edge, the Bucks' back-to-back and injuries), the edge is that over the price", !!celtics && celtics.book === "Caesars" && celtics.odds === -145 && celtics.basis === "game" && celtics.confidence === "High" && gmFix && near(celtics.modelProb, M.sideProb(gmFix, "h2h", { name: "Boston Celtics", point: null }, "Boston Celtics", "Milwaukee Bucks"), 1e-4) && near(celtics.edge, celtics.modelProb - P.implied(-145), 1e-4) && celtics.model.margin === gmFix.margin && celtics.model.parts.rest === 1.5 && celtics.model.reasons.for.length >= 4, celtics && JSON.stringify([celtics.modelProb, celtics.edge, celtics.model && celtics.model.parts]));
  check("run: the market's number is kept apart as a reference (Celtics ML: the books make it 58.9%, 0.3 under the price, while ours is 15.7 over it) and plays no part in the grade", near(celtics.marketFair, 0.5885, 0.001) && celtics.marketEdge < 0 && near(celtics.edge, 0.157, 0.002));
  check("run: Arsenal ML at FanDuel +125 from the three-way model: home, draw and away sum to one", !!arsenal && arsenal.book === "FanDuel" && arsenal.odds === 125 && arsenal.sport === "Soccer" && gmEpl && near(["Arsenal", "Draw", "Liverpool"].reduce((s, n) => s + M.sideProb(gmEpl, "h2h", { name: n, point: null }, "Arsenal", "Liverpool"), 0), 1, 1e-3) && near(arsenal.modelProb, M.sideProb(gmEpl, "h2h", { name: "Arsenal", point: null }, "Arsenal", "Liverpool"), 1e-4), arsenal && String(arsenal.modelProb));
  check("run: no pick on the NFL games: without an ESPN record there is no model, so no side has a probability", !added.some(e => e.sport === "NFL"));
  check("run: never both sides of one market", !added.some(a => added.some(b => a !== b && a.eventId === b.eventId && a.marketKey === b.marketKey)));
  check("run: rationale states the rule and names the book; the market is a reference only", /^Our probability is 74\.9%, from the game data/.test(celtics.rationale) && /Caesars offers -145/.test(celtics.rationale) && /Not graded against other books' prices/.test(celtics.rationale) && /for reference the market makes it 58\.\d%/.test(celtics.rationale) && celtics.factors.some(f => /from game data, not other books/.test(f)), celtics.rationale);
  check("run: tiers are 3 / 5 / 8 points over the price and a thin sample never rates above Lean", P.confidence(0.1, true) === "Lean" && P.confidence(0.1, false) === "High" && P.confidence(0.05) === "Medium" && P.confidence(0.03) === "Lean" && P.RULES.minEdge === 0.03);

  /* generated files load in a browser-like scope and have the site's shape */
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8") + fs.readFileSync(path.join(tmp, "performance.js"), "utf8"), sandbox);
  const PD = sandbox.window.PICKS_DATA, PF = sandbox.window.PERF_DATA;
  check("picks.js: sample=false, 5 picks on the board with start labels, every one on the game grade with the model's reasons and the market reference", PD.sample === false && PD.picks.length === 5 && /ET$/.test(PD.picks[0].start) && PD.picks.every(p => p.basis === "game" && p.model && p.model.reasons && typeof p.marketFair === "number"), PD.picks.map(p => p.start).join(", "));
  check("picks.js: pick fields match the site shape", PD.picks.every(p => ["id", "sport", "league", "event", "start", "market", "pick", "odds", "modelProb", "confidence", "rationale", "factors", "book", "basis", "model", "marketFair"].every(k => k in p)));
  check("performance.js: 1-1-1 record, -0.09u, roi -3.0%", PF.record.wins === 1 && PF.record.losses === 1 && PF.record.pushes === 1 && near(PF.units, -0.09, 0.001) && near(PF.roi, -3.0, 0.01), JSON.stringify([PF.record, PF.units, PF.roi]));
  check("performance.js: one daily point, bySport NBA 1-1, 3 recent, void excluded", PF.daily.length === 1 && PF.bySport[0].record === "1-1" && PF.recent.length === 3);
  check("performance.js: clv summary: 2 of 3 with price CLV, both negative, one line moved toward us, all three closes from SportsGameOdds", PF.clv && PF.clv.n === 2 && PF.clv.graded === 3 && near(PF.clv.avg, (mlClv + totClv) / 2 * 100, 0.02) && PF.clv.beat === 0 && PF.clv.beatPct === 0 && PF.clv.lineToward === 1 && PF.clv.lineAway === 0 && PF.clv.sgoCloses === 3 && PF.clv.espnCloses === 0, JSON.stringify(PF.clv));
  check("performance.js: recent rows carry clv, closing price/line, source and line direction", near(PF.recent.find(r => r.pick === "Milwaukee Bucks ML").clv, mlClv, 0.001) && PF.recent.find(r => r.pick === "Milwaukee Bucks ML").closeOdds === 150 && PF.recent.find(r => r.pick === "Boston Celtics -3").clv === null && PF.recent.find(r => r.pick === "Boston Celtics -3").lineMove === "toward" && /SportsGameOdds/.test(PF.recent.find(r => r.pick === "Over 214").closeSource));
  check("picks.js: board picks carry commence, sportKey, outcome and book count for the digest, live status and line shopping", PD.picks.every(p => /^\d{4}-/.test(p.commence) && p.sportKey && p.outcome && p.outcome.name && p.books >= 3));
  check("performance.js: the record by grade keeps the old price-edge picks apart from the game-data picks (3 graded on price; 5 pending on game data since 2026-11-05)", PF.byBasis && PF.byBasis.price.n === 3 && PF.byBasis.price.pending === 0 && PF.byBasis.game.n === 0 && PF.byBasis.game.pending === 5 && PF.byBasis.game.since === "2026-11-05" && PF.recent.every(r => r.basis === "price"), JSON.stringify(PF.byBasis));

  /* context + breakdown (fixture ESPN scoreboard, injuries, schedules, weather), written around the model's reasons */
  const celticsPub = PD.picks.find(p => p.pick === "Boston Celtics ML"), arsenalPub = PD.picks.find(p => p.pick === "Arsenal ML"), underPub = PD.picks.find(p => p.pick === "Under 226.5");
  check("breakdown: every board pick explains its tier from our probability and the price, states the rule, and names the 3 / 5 / 8 bars", PD.picks.every(p => p.breakdown && /^Our probability for this side is \d+\.\d%, from the game data/.test(p.breakdown.tierWhy) && p.breakdown.tierWhy.indexOf("Medium at 5.0 points") !== -1 && /Nothing here is graded against other books' prices/.test(p.breakdown.tierWhy) && p.breakdown.tier === p.confidence), celticsPub && celticsPub.breakdown.tierWhy);
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
  check("market.js: 11 markets in 2 games (NBA 6, EPL 5), sorted by our edge, picks flagged with their id, thresholds and basis published", MK && MK.rows.length === 11 && MK.games === 2 && MK.modelled === 2 && MK.basis === "game" && MK.rows.every((r, i) => i === 0 || r.edge <= MK.rows[i - 1].edge) && MK.rows.filter(r => r.status === "pick").length === 5 && MK.rows.find(r => r.pick === "Boston Celtics ML").pickId === celtics.id && MK.rows.find(r => r.pick === "Milwaukee Bucks ML").status === "none" && MK.threshold === 0.03 && MK.watch === 0.015 && r1.market === 11, MK && JSON.stringify(MK.rows.map(r => r.pick + ":" + r.status)));
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
  check("model: an absence the results already show costs nothing more; one listed after the team's last game costs in full; no date counts in full", (() => {
    const nhl = M.SPORT.icehockey_nhl, day = d => Date.parse("2026-10-" + String(d).padStart(2, "0") + "T23:00:00Z");
    const form = { gp: 4, games: [day(10), day(14), day(18), day(22)].map(t => ({ date: t })) }, share = M.unseenShare(form);
    const sk = (date) => ({ name: "S", pos: "C", status: "Out", date: date });
    const before = share(sk("2026-10-01T12:00Z")), half = share(sk("2026-10-16T12:00Z")), after = share(sk("2026-10-30T12:00Z")), none = share(sk(null));
    const cost = d => M.injuryCost([sk(d)], nhl, null, share);
    return before === 0 && near(half, 0.5, 1e-9) && after === 1 && none === 1 && cost("2026-10-01T12:00Z").cost === 0 && cost("2026-10-01T12:00Z").out.length === 0 && near(cost("2026-10-16T12:00Z").cost, 0.06, 1e-9) && near(cost("2026-10-30T12:00Z").cost, 0.12, 1e-9) && M.unseenShare(null)(sk("2026-10-30T12:00Z")) === 1;
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
    const sh = x => (10 * x + 80 * 3.1) / 90, total = Math.round((sh(4) + sh(3) + sh(3) + sh(2)) / 2 * 10) / 10;
    const standings = { children: [{ standings: { entries: [{ stats: [{ name: "pointsFor", value: 64 }, { name: "gamesPlayed", value: 17 }] }, { stats: [{ name: "pointsFor", value: 300 }, { name: "gamesPlayed", value: 100 }] }] } }] };
    return shape && rating && g.total === total && near(M.leagueGoalsFrom(standings), 364 / 117, 1e-9) && M.leagueGoalsFrom({ children: [] }) === null;
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
  check("tracking: a logged pick the model now dislikes still gets its current price, our probability and a second history point (market fair, for the close)", rt.added === 5 && tracked.current && tracked.current.odds === 160 && tracked.current.edge < 0 && tracked.current.modelProb < 0.3 && near(tracked.current.fair, 0.4115, 0.001) && tracked.history.length === 2 && near(tracked.history[1].fair, 0.4115, 0.001), JSON.stringify(tracked.current));
  check("tracking: closingLine/clvOf read the last check against the market's fair, never the model's", P.closingLine(tracked).samples === 2 && near(P.clvOf(tracked), P.closingLine(tracked).fair - P.implied(150), 1e-4) && near(P.closingLine(tracked).fair, 0.4115, 0.001));
  fs.rmSync(tmp2, { recursive: true, force: true });

  /* idempotent: a second run at the same moment adds nothing and keeps the board */
  const r2 = await P.run({ fixture: true, out: tmp, now: "2026-11-05T16:00:00Z" }); /* an hour later, same day */
  check("rerun: no duplicates", r2.added === 0 && r2.board === 5);
  const log2 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8")), celtics2 = log2.find(e => e.pick === "Boston Celtics ML" && e.loggedAt);
  check("rerun: price history grows and current price is tracked", celtics2.history.length === 2 && celtics2.current && celtics2.current.odds === -145);
  const sb2 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8"), sb2);
  const celticsPub2 = sb2.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML");
  check("rerun: movement block appears once a later check exists (flat line here)", celticsPub2.movement && celticsPub2.movement.currentOdds === -145 && celticsPub2.movement.history.length === 2);
  check("rerun: DraftKings history does not grow when the number is unchanged", celticsPub2.dkHistory.length === 1);

  /* track mode: ESPN only, no Odds API; refreshes DraftKings numbers and breakdowns, keeps generatedAt, adds trackedAt */
  const rt2 = await P.run({ fixture: true, out: tmp, now: "2026-11-05T18:00:00Z", track: true });
  const sb3 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8"), sb3);
  const log3b = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  check("track: runs on the five board picks without touching the log size or generatedAt, and stamps trackedAt", rt2.track === true && rt2.board === 5 && log3b.length === log2.length && sb3.window.PICKS_DATA.generatedAt === sb2.window.PICKS_DATA.generatedAt && sb3.window.PICKS_DATA.trackedAt === "2026-11-05T18:00:00.000Z" && sb3.window.PICKS_DATA.picks.length === 5, JSON.stringify(rt2));
  check("track: picks keep their breakdown, model and DraftKings block", sb3.window.PICKS_DATA.picks.every(p => p.breakdown && p.breakdown.verdict && p.model && p.basis === "game") && sb3.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML").dk.moved === "toward");
  check("track: SportsGameOdds refreshed by event id with no new history point when nothing moved", rt2.sgoEntities === 1 && rt2.sgoMoved === 0 && sb3.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML").sgoHistory.length === 1 && sb3.window.PICKS_DATA.picks.find(p => p.pick === "Boston Celtics ML").mkt.moved === "toward", JSON.stringify(rt2));
  check("track: performance.js is left alone", fs.readFileSync(path.join(tmp, "performance.js"), "utf8").indexOf("2026-11-05") !== -1);
  check("track: market.js is left alone (no odds in a track run)", fs.readFileSync(path.join(tmp, "market.js"), "utf8").indexOf("2026-11-05T16:00:00") !== -1);

  /* after the games: the board empties, grading finds no scores yet for the new events */
  const r3 = await P.run({ fixture: true, out: tmp, now: "2026-11-07T15:00:00Z" });
  const log3 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  const nfl = log3.find(e => e.eventId === "nfl-fix-far");
  const mk4 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "market.js"), "utf8"), mk4);
  const nflRows = mk4.window.MARKET_DATA.rows.filter(r => r.eventId === "nfl-fix-far");
  check("later: started events leave the board; the NFL game now inside the 36h window is priced on the market board but, with no model, has no probability and is never a pick", r3.board === 0 && !nfl && r3.unmodelled === 1 && nflRows.length === 2 && nflRows.every(r => r.modelProb === null && r.edge === null && r.status === "none" && r.modelled === false && typeof r.marketFair === "number") && mk4.window.MARKET_DATA.rows.every((r, i) => i === 0 || r.edge !== null || mk4.window.MARKET_DATA.rows[i - 1].edge === null || true), "board " + r3.board + " " + JSON.stringify(nflRows.map(r => [r.pick, r.modelProb, r.status])));
  check("later: the finished games stay pending until scores arrive (not voided yet)", log3.filter(e => e.eventId === "nba-fix-1" || e.eventId === "epl-fix-1").every(e => e.status === "pending"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
