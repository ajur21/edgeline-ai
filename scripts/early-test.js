/* Offline test of scripts/early-line.js (run by npm test): ESPN's scoreboards and core odds are built here in their own
   shapes (the parsers are scripts/context.js's), and the model is a stand-in, so what is checked is the early lines'
   own rules: the lock, a number that never moves, its history, grading, the record and the files. */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const E = require("./early-line.js");
let fails = 0;
function check(name, ok, info) { console.log((ok ? "PASS " : "FAIL ") + name + (ok || info == null ? "" : "  " + info)); if (!ok) fails++; }

const NFL = E.LEAGUES.NFL, CFB = E.LEAGUES.NCAAF;
const ymd = t => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)).replace(/-/g, "");
const ml = (h, a) => ({ provider: { id: "100", name: "DraftKings" }, moneyline: { home: { close: { odds: String(h) }, open: { odds: String(h) } }, away: { close: { odds: String(a) }, open: { odds: String(a) } } } });
function ev(id, at, home, away, o) {
  o = o || {};
  return { id: id, date: at, competitions: [{ neutralSite: false, odds: o.odds ? [o.odds] : [],
    status: { type: { state: o.state || "pre", name: o.status || "STATUS_SCHEDULED", completed: !!o.completed } },
    competitors: [{ homeAway: "home", score: o.hs != null ? String(o.hs) : "", team: { id: home[0], abbreviation: home[1], displayName: home[2] } }, { homeAway: "away", score: o.as != null ? String(o.as) : "", team: { id: away[0], abbreviation: away[1], displayName: away[2] } }] }] };
}
const core = (h, a) => ({ homeTeamOdds: { close: { moneyLine: { american: String(h) } }, open: { moneyLine: { american: String(h) } } }, awayTeamOdds: { close: { moneyLine: { american: String(a) } }, open: { moneyLine: { american: String(a) } } } });
function source(boards, odds) {
  let n = 0;
  return { scoreboard: async (sport, day) => { n++; const b = boards[sport + "|" + day]; return b === undefined ? { events: [] } : b; }, odds: async (sport, id) => { n++; return odds[id] || null; }, count: () => n };
}
const BUF = ["2", "BUF", "Buffalo Bills"], MIA = ["15", "MIA", "Miami Dolphins"], KC = ["12", "KC", "Kansas City Chiefs"], ARI = ["22", "ARI", "Arizona Cardinals"], DAL = ["6", "DAL", "Dallas Cowboys"], TEN = ["10", "TEN", "Tennessee Titans"];
const OSU = ["194", "OSU", "Ohio State Buckeyes"], MICH = ["130", "MICH", "Michigan Wolverines"];
/* the stand-in model: our home probability per game id, the bar 6 points */
const MODEL = { g1: 0.86, g2: 0.70, g3: 0.40, c1: 0.55 };
const project = async g => MODEL[g.id] == null ? null : { home: { prob: MODEL[g.id], bar: 0.06 }, away: { prob: Math.round((1 - MODEL[g.id]) * 1e4) / 1e4, bar: 0.06 }, margin: 3, total: 44, thin: false, gp: 9, model: "test" };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-early-"));
  const NOW = Date.parse("2026-11-16T15:00:00Z"); /* Monday 10 AM ET */
  const SUN = "2026-11-22T18:00:00Z", THU = "2026-11-20T01:15:00Z", SOON = "2026-11-17T01:15:00Z", SAT = "2026-11-21T17:00:00Z";
  const boards = {};
  boards[NFL + "|" + ymd(Date.parse(SUN))] = { events: [ev("g1", SUN, BUF, MIA, { odds: ml(-1650, 950) }), ev("g2", SUN, KC, ARI, { odds: ml(-800, 550) }), ev("g9", SUN, DAL, TEN, {})] };
  boards[NFL + "|" + ymd(Date.parse(THU))] = { events: [ev("g3", THU, DAL, TEN, { odds: ml(-150, 130) })] };
  boards[NFL + "|" + ymd(Date.parse(SOON))] = { events: [ev("g4", SOON, KC, BUF, { odds: ml(-120, 100) })] };
  boards[CFB + "|" + ymd(Date.parse(SAT))] = { events: [ev("c1", SAT, OSU, MICH, { odds: ml(-130, 110) }), ev("c2", SAT, MICH, OSU, { odds: ml(-200, 170) })] };
  const src = source(boards, {});
  const r1 = await E.run({ out: dir, now: NOW, src: src, project: project });
  const log1 = E.readLog(dir), g1 = log1.games["NFL|g1"], g2 = log1.games["NFL|g2"], g3 = log1.games["NFL|g3"], c1 = log1.games["NCAAF|c1"];
  check("lock: every game with a DraftKings moneyline both ways, a model and more than 36 hours to go is locked; one without a line, one inside 36 hours and one the model cannot build are not",
    r1.locked === 4 && !!g1 && !!g2 && !!g3 && !!c1 && !log1.games["NFL|g9"] && !log1.games["NFL|g4"] && !log1.games["NCAAF|c2"] && r1.noLine === 1 && r1.late === 1 && r1.noModel === 1, JSON.stringify(r1));
  const imp = a => a > 0 ? 100 / (a + 100) : -a / (-a + 100);
  check("lock: the side is the one with the larger edge over DraftKings' implied chance; edge, bar, past and clears are the board's arithmetic",
    g1.side === "away" && g1.team === "Miami Dolphins" && g1.odds === 950 && Math.abs(g1.edge - (0.14 - imp(950))) < 1e-4 && g1.bar === 0.06 && Math.abs(g1.past - (g1.edge - 0.06)) < 1e-4 && g1.clears === false /* 14% against +950's 9.5%: 4.5 points, short of its 6 */
    && g2.side === "away" && g2.odds === 550 && g2.clears === true && g3.side === "away" && g3.odds === 130 && g3.clears === true && c1.side === "home" && c1.odds === -130 && c1.clears === false && c1.edge < 0, JSON.stringify([g1.side, g1.edge, g3.side, g3.edge, c1.side, c1.edge, g2.side, g2.edge]));
  check("lock: DraftKings' de-vigged chance for our side, when it was locked and how long before kickoff",
    Math.abs(g1.fair - imp(950) / (imp(950) + imp(-1650))) < 1e-3 && g1.at === new Date(NOW).toISOString() && g1.hoursBefore === 147 && g1.status === "pending" && g1.history.length === 0 && log1.since.date === "2026-11-16");
  /* idempotent: the same run again changes nothing */
  const bytes = f => fs.readFileSync(path.join(dir, f), "utf8"), b1 = bytes("early-log.json"), p1 = bytes("early-line.js");
  const r2 = await E.run({ out: dir, now: NOW + 6e4, src: source(boards, {}), project: project });
  check("idempotent: a run a minute later with nothing new locks nothing, adds no history and rewrites neither file", r2.locked === 0 && r2.tracked === 0 && !r2.changed && bytes("early-log.json") === b1 && bytes("early-line.js") === p1, JSON.stringify(r2));
  /* the number never moves: later prices and a later model only add history */
  boards[NFL + "|" + ymd(Date.parse(SUN))].events[0] = ev("g1", SUN, BUF, MIA, { odds: ml(-2000, 1100) });
  MODEL.g1 = 0.88;
  const r3 = await E.run({ out: dir, now: NOW + 864e5, src: source(boards, {}), project: project });
  const g1b = E.readLog(dir).games["NFL|g1"];
  check("locked: a later run with another DraftKings price and another model number leaves the locked number as it was and adds one history point",
    r3.tracked === 1 && g1b.odds === 950 && g1b.prob === g1.prob && g1b.edge === g1.edge && g1b.at === g1.at && g1b.history.length === 1 && g1b.history[0].dkAway === 1100 && g1b.history[0].home === 0.88, JSON.stringify(g1b.history));
  /* grading: finals on the scoreboards, DraftKings' close on the core odds */
  boards[NFL + "|" + ymd(Date.parse(SUN))] = { events: [ev("g1", SUN, BUF, MIA, { state: "post", status: "STATUS_FINAL", completed: true, hs: 31, as: 10 }), ev("g2", SUN, KC, ARI, { state: "post", status: "STATUS_FINAL", completed: true, hs: 20, as: 24 })] };
  boards[NFL + "|" + ymd(Date.parse(THU))] = { events: [ev("g3", THU, DAL, TEN, { state: "post", status: "STATUS_FINAL", completed: true, hs: 17, as: 17 })] };
  boards[CFB + "|" + ymd(Date.parse(SAT))] = { events: [ev("c1", SAT, OSU, MICH, { state: "post", status: "STATUS_POSTPONED", completed: false })] };
  const odds = { g1: core(-2000, 1100), g2: core(-700, 500), g3: core(-140, 120) };
  const before = E.readLog(dir);
  const early = await E.run({ out: dir, now: Date.parse("2026-11-22T20:00:00Z"), src: source(boards, odds), project: project, track: true });
  check("grading: nothing is asked of ESPN before a game can have ended (kickoff plus four hours): Sunday's games wait, Thursday's and Saturday's are settled", early.graded === 2 && early.requests === 3 && E.readLog(dir).games["NFL|g1"].status === "pending" && E.readLog(dir).games["NFL|g2"].status === "pending", JSON.stringify(early));
  const late = await E.run({ out: dir, now: Date.parse("2026-11-23T12:00:00Z"), src: source(boards, odds), project: project, track: true });
  const L = E.readLog(dir), G1 = L.games["NFL|g1"], G2 = L.games["NFL|g2"], G3 = L.games["NFL|g3"], C1 = L.games["NCAAF|c1"];
  check("grading: straight up on the final, a tie a push, a postponed game void; units at the locked DraftKings price",
    G1.result === "Loss" && G1.units === -1 && G2.result === "Win" && Math.abs(G2.units - (550 / 100)) < 1e-4 && G3.result === "Push" && G3.units === 0 && C1.result === "Void" && C1.units === 0 && G1.score.home === 31 && late.graded === 2, JSON.stringify([G1.result, G2.result, G2.units, G3.result, C1.result]));
  check("grading: the close is DraftKings' from the core odds; CLV is its de-vigged chance less what the locked price implied, the move its chance less the lock's",
    G1.close && G1.close.odds === 1100 && Math.abs(G1.clv - (imp(1100) / (imp(1100) + imp(-2000)) - imp(950))) < 1e-3 && Math.abs(G1.move - (G1.close.fair - G1.fair)) < 1e-4 && G1.move < 0 && C1.close === null && C1.clv === null, JSON.stringify([G1.close, G1.clv, G1.move]));
  const D = (function () { global.window = {}; eval(fs.readFileSync(path.join(dir, "early-line.js"), "utf8")); return global.window.EARLY_DATA; })();
  const A = D.record.all, Cl = D.record.clears;
  check("record: every game and the ones past their bar, by league; a void is in neither, a push is its own count; units, CLV and the move add up",
    A.all.n === 3 && A.all.w === 1 && A.all.l === 1 && A.all.push === 1 && Math.abs(A.all.units - (-1 + 5.5 + 0)) < 1e-4 && A.NFL.n === 3 && A.NCAAF.n === 0 && Cl.all.n === 2 && Cl.all.w === 1 && Cl.all.l === 0 && Cl.all.push === 1 && Math.abs(Cl.all.units - 5.5) < 1e-4
    && A.all.clvN === 3 && Math.abs(A.all.clv - (G1.clv + G2.clv + G3.clv)) < 1e-3 && A.all.moveN === 3 && A.all.toward === [G1, G2, G3].filter(x => x.move > 0).length, JSON.stringify(D.record));
  check("the page's file: tracked, not leans; graded games listed newest first with their result, units, CLV and the move; nothing pending once all are graded",
    D.rule.status === "tracked, not leans" && D.rule.minHours === 36 && D.upcoming.length === 0 && D.recent.length === 4 && D.recent[0].id === "g2" /* Sunday's two, likelier first */ && D.recent.every(x => "result" in x && "units" in x && "clv" in x && "move" in x) && D.recent.find(x => x.id === "g1").now.odds === 1100, JSON.stringify(D.recent.map(x => x.id)));
  const quiet = await E.run({ out: dir, now: Date.parse("2026-11-23T13:00:00Z"), src: source(boards, odds), project: project, track: true });
  check("hourly: with nothing due no request is made and nothing is rewritten", quiet.requests === 0 && quiet.graded === 0 && !quiet.changed, JSON.stringify(quiet));
  /* a game never final is void after ten days; a scoreboard ESPN will not serve breaks nothing */
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-early-"));
  const b2 = {}; b2[NFL + "|" + ymd(Date.parse(SUN))] = { events: [ev("g1", SUN, BUF, MIA, { odds: ml(-1650, 950) })] };
  MODEL.g1 = 0.86;
  await E.run({ out: d2, now: NOW, src: source(b2, {}), project: project });
  b2[NFL + "|" + ymd(Date.parse(SUN))] = null; /* ESPN unreadable from here on */
  const mid = await E.run({ out: d2, now: Date.parse("2026-11-24T12:00:00Z"), src: source(b2, {}), project: project, track: true });
  const gone = await E.run({ out: d2, now: Date.parse("2026-12-03T12:00:00Z"), src: source(b2, {}), project: project, track: true });
  check("grading: a game no scoreboard settles waits, then is void ten days after kickoff, never guessed", mid.waiting === 1 && mid.graded === 0 && gone.graded === 1 && E.readLog(d2).games["NFL|g1"].result === "Void", JSON.stringify([mid, gone]));
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-early-"));
  const dead = await E.run({ out: d3, now: NOW, src: { scoreboard: async () => { throw new Error("down"); }, odds: async () => null }, project: project });
  check("a run with ESPN down locks nothing, throws nothing and writes an empty record", dead.locked === 0 && fs.existsSync(path.join(d3, "early-line.js")) && E.readLog(d3).since === null);
  /* a started game is never locked, whatever the clock says of its kickoff */
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-early-")), b4 = {};
  b4[NFL + "|" + ymd(Date.parse(SUN))] = { events: [ev("g1", SUN, BUF, MIA, { odds: ml(-1650, 950), state: "in", status: "STATUS_IN_PROGRESS" })] };
  const st = await E.run({ out: d4, now: NOW, src: source(b4, {}), project: project });
  check("a game ESPN shows under way is never locked", st.locked === 0 && Object.keys(E.readLog(d4).games).length === 0);
  check("the log is one game a line in a fixed order and reads back as written", (function () { const t = fs.readFileSync(path.join(dir, "early-log.json"), "utf8"); const j = JSON.parse(t); return E.serialise(j) === t && t.split("\n").filter(l => l.indexOf('"sportKey":') !== -1).length === Object.keys(j.games).length; })());
  console.log(fails ? "FAILURES: " + fails : "ALL PASS");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
