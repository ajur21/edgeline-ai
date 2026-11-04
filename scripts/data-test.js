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
  const pending = (id, extra) => Object.assign({ key: id, id: id, date: "2026-11-03", commence: "2026-11-04T00:00:00Z", sport: "NBA", league: "NBA", sportKey: "basketball_nba", eventId: "nba-old-1", event: "Milwaukee Bucks @ Boston Celtics", edge: 0.03, confidence: "Medium", status: "pending", units: 0 }, extra);
  fs.writeFileSync(path.join(tmp, "picks-log.json"), JSON.stringify([
    pending("old-ml", { market: "Moneyline", marketKey: "h2h", outcome: { name: "Milwaukee Bucks", point: null }, pick: "Milwaukee Bucks ML", odds: 140 }),
    pending("old-spread", { market: "Spread", marketKey: "spreads", outcome: { name: "Boston Celtics", point: -3.5 }, pick: "Boston Celtics -3.5", odds: -110 }),
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
  check("run: added exactly 2 picks (Bucks ML outlier, EPL draw outlier)", r1.added === 2, "added " + r1.added);
  const added = log.filter(e => e.loggedAt);
  const bucks = added.find(e => e.pick === "Milwaukee Bucks ML"), draw = added.find(e => e.pick === "Draw");
  check("run: Bucks ML at Caesars +160, Medium", !!bucks && bucks.book === "Caesars" && bucks.odds === 160 && bucks.confidence === "Medium" && near(bucks.edge, 0.027, 0.003), bucks && JSON.stringify([bucks.book, bucks.odds, bucks.edge]));
  check("run: Draw at BetMGM +330 (3-way de-vig)", !!draw && draw.book === "BetMGM" && draw.odds === 330 && draw.sport === "Soccer");
  check("run: no pick on the far-off NFL game or the two-book game", !added.some(e => e.sport === "NFL"));
  check("run: never both sides of one market", !added.some(a => added.some(b => a !== b && a.eventId === b.eventId && a.marketKey === b.marketKey)));
  check("run: rationale names the book and consensus", /Caesars offers \+160/.test(bucks.rationale) && /4 books/.test(bucks.rationale));

  /* generated files load in a browser-like scope and have the site's shape */
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8") + fs.readFileSync(path.join(tmp, "performance.js"), "utf8"), sandbox);
  const PD = sandbox.window.PICKS_DATA, PF = sandbox.window.PERF_DATA;
  check("picks.js: sample=false, 2 picks on the board with start labels", PD.sample === false && PD.picks.length === 2 && /ET$/.test(PD.picks[0].start), PD.picks.map(p => p.start).join(", "));
  check("picks.js: pick fields match the site shape", PD.picks.every(p => ["id", "sport", "league", "event", "start", "market", "pick", "odds", "modelProb", "confidence", "rationale", "factors", "book"].every(k => k in p)));
  check("performance.js: 1-1-1 record, -0.09u, roi -3.0%", PF.record.wins === 1 && PF.record.losses === 1 && PF.record.pushes === 1 && near(PF.units, -0.09, 0.001) && near(PF.roi, -3.0, 0.01), JSON.stringify([PF.record, PF.units, PF.roi]));
  check("performance.js: one daily point, bySport NBA 1-1, 3 recent, void excluded", PF.daily.length === 1 && PF.bySport[0].record === "1-1" && PF.recent.length === 3);

  /* context + breakdown (fixture ESPN scoreboard, injuries, schedules, weather) */
  const bucksPub = PD.picks.find(p => p.pick === "Milwaukee Bucks ML"), drawPub = PD.picks.find(p => p.pick === "Draw");
  check("breakdown: every board pick carries a breakdown with a tier explanation", PD.picks.every(p => p.breakdown && p.breakdown.tierWhy.indexOf("Medium at 2.0 points") !== -1 && p.breakdown.tier === p.confidence));
  check("breakdown: Bucks ML sees Tatum out as support and Lillard day-to-day as a risk", bucksPub.breakdown.support.some(t => /Tatum/.test(t)) && bucksPub.breakdown.risks.some(t => /Lillard/.test(t)), JSON.stringify(bucksPub.breakdown.risks));
  check("breakdown: Bucks on a back-to-back is a risk; Celtics rest shown", bucksPub.breakdown.risks.some(t => /back-to-back/.test(t)) && bucksPub.context.rest["Boston Celtics"].restDays === 1, JSON.stringify(bucksPub.context.rest));
  check("breakdown: indoor venue, records and TV in context", bucksPub.context.indoor === true && bucksPub.context.records["Boston Celtics"].overall === "5-2" && bucksPub.context.broadcast === "ESPN");
  check("breakdown: outdoor soccer gets Open-Meteo wind and rain at kickoff", drawPub.context.weather && drawPub.context.weather.windMph === 19 && drawPub.context.weather.precipPct === 70 && drawPub.context.weather.source === "Open-Meteo", JSON.stringify(drawPub.context.weather));
  check("breakdown: rough weather on a side pick is listed as a risk", drawPub.breakdown.risks.some(t => /Weather at kickoff/.test(t)));
  check("breakdown: Pinnacle absent in fixtures -> no-anchor risk; verdict written", bucksPub.breakdown.risks.some(t => /No sharp anchor/.test(t)) && typeof bucksPub.breakdown.verdict === "string" && bucksPub.breakdown.verdict.length > 10);
  check("movement: a fresh pick records its first price in history", bucksPub.movement === null && log.find(e => e.pick === "Milwaukee Bucks ML" && e.loggedAt).history.length === 1);

  /* play of the day and parlay of the day on the fixture board */
  check("potd: the Draw (higher EV) is play of the day and is flagged in the log", PD.playOfDay && PD.playOfDay.pick === "Draw" && log.find(e => e.potd === "2026-11-05").pick === "Draw", PD.playOfDay && PD.playOfDay.pick);
  check("potd: board picks carry prices per book and ev", PD.picks.every(p => p.prices && Object.keys(p.prices).length >= 3 && typeof p.ev === "number"));
  check("parlay: none when the legs share no book where both are +EV", PD.parlayOfDay === null);

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

  /* idempotent: a second run at the same moment adds nothing and keeps the board */
  const r2 = await P.run({ fixture: true, out: tmp, now: "2026-11-05T16:00:00Z" }); /* an hour later, same day */
  check("rerun: no duplicates", r2.added === 0 && r2.board === 2);
  const log2 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8")), bucks2 = log2.find(e => e.pick === "Milwaukee Bucks ML" && e.loggedAt);
  check("rerun: price history grows and current price is tracked", bucks2.history.length === 2 && bucks2.current && bucks2.current.odds === 160);
  const sb2 = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "picks.js"), "utf8"), sb2);
  const bucksPub2 = sb2.window.PICKS_DATA.picks.find(p => p.pick === "Milwaukee Bucks ML");
  check("rerun: movement block appears once a later check exists (flat line here)", bucksPub2.movement && bucksPub2.movement.currentOdds === 160 && bucksPub2.movement.history.length === 2);

  /* after the games: the board empties, grading finds no scores yet for the new events */
  const r3 = await P.run({ fixture: true, out: tmp, now: "2026-11-07T15:00:00Z" });
  const log3 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
  const nfl = log3.find(e => e.eventId === "nfl-fix-far");
  check("later: started events leave the board; the NFL game now inside the 36h window joins it", r3.board === 1 && !!nfl && nfl.book === "BetMGM" && nfl.odds === 140, "board " + r3.board);
  check("later: the finished games stay pending until scores arrive (not voided yet)", log3.filter(e => e.eventId === "nba-fix-1" || e.eventId === "epl-fix-1").every(e => e.status === "pending"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
