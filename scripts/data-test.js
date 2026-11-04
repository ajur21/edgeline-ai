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

  /* idempotent: a second run at the same moment adds nothing and keeps the board */
  const r2 = await P.run({ fixture: true, out: tmp, now: NOW });
  check("rerun: no duplicates", r2.added === 0 && r2.board === 2);

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
