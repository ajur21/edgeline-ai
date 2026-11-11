/* Offline test of the one list of plays (js/plays.js) and the play and parlay of the day chosen from it
   (scripts/of-day.js, `node scripts/update-data.js --of-day`). Fixtures only, no network. Run: node scripts/plays-test.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const PLAYS = require("../js/plays.js");
const OD = require("./of-day.js");
const U = require("./update-data.js");
const UP = require("./update-props.js");
const fails = [];
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (!ok && extra ? "  " + extra : "")); if (!ok) fails.push(name); };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-4 : tol);
const win = (file, name) => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(file, "utf8"), sb); return sb.window[name]; };

(async () => {
  /* ---------- the check: a stated chance against the graded record ---------- */
  const c0 = PLAYS.checkFrom({});
  check("check: with no graded props a stated edge keeps the default 30% (an 80% prop counts as 59%)", c0.all.n === 0 && c0.all.keep === 0.3 && !c0.NBA && near(PLAYS.checked(0.8, "NBA", c0), 0.59) && near(PLAYS.checked(0.8, "NBA", null), 0.59));
  /* 600 NBA props stated at 64.5% on average that hit 53%: the record bears out (318 - 300) / (387 - 300) = 20.7% of the edge */
  const c1 = PLAYS.checkFrom({ NBA: { n: 600, w: 318, stated: 387 }, NFL: { n: 60, w: 39, stated: 37.2 } });
  check("check: keep is the share of the stated edge the record bore out, each league pulled toward all leagues' until it has a few hundred props",
    c1.all.n === 660 && near(c1.all.hit, 357 / 660) && near(c1.NBA.hit, 0.53) && near(c1.NBA.stated, 0.645) && c1.NBA.keep > 0.2 && c1.NBA.keep < 0.26 && c1.NFL.keep > c1.NBA.keep && c1.NFL.keep < 1 && near(PLAYS.checked(0.8, "NBA", c1), 0.5 + c1.NBA.keep * 0.3) && near(PLAYS.checked(0.8, "WNBA", c1), 0.5 + c1.all.keep * 0.3), JSON.stringify(c1));
  const cBad = PLAYS.checkFrom({ NBA: { n: 5000, w: 2300, stated: 3200 } }), cGood = PLAYS.checkFrom({ NBA: { n: 5000, w: 3600, stated: 3200 } });
  check("check: a record under 50% keeps nothing (every prop counts as a coin flip), a record better than stated never counts for more than stated", cBad.NBA.keep === 0 && PLAYS.checked(0.9, "NBA", cBad) === 0.5 && cGood.NBA.keep <= 1 && PLAYS.checked(0.7, "NBA", cGood) <= 0.7 + 1e-9, JSON.stringify([cBad.NBA, cGood.NBA]));

  /* ---------- prices and the lock ---------- */
  check("prices: decimal, expected value and American odds from a decimal price", near(PLAYS.decimal(-110), 1.9091) && PLAYS.decimal(150) === 2.5 && near(PLAYS.evOf(0.55, -110), 0.05, 1e-3) && PLAYS.american(3.8182) === 282 && PLAYS.american(1.5) === -200);
  check("lock: an Eastern day locks at 20:30 UTC of its date; a play starting within two hours after that cannot wait for the lock run", PLAYS.lockAt("2026-11-08") === Date.parse("2026-11-08T20:30:00Z") && PLAYS.startsEarly({ commence: "2026-11-08T18:00:00Z" }, "2026-11-08") && PLAYS.startsEarly({ commence: "2026-11-08T22:29:00Z" }, "2026-11-08") && !PLAYS.startsEarly({ commence: "2026-11-09T00:00:00Z" }, "2026-11-08") && PLAYS.dayOf("2026-11-09T03:10:00Z") === "2026-11-08");

  /* ---------- game leans as plays ---------- */
  const NOW4 = "2026-11-04T18:00:00Z", T4 = Date.parse(NOW4);
  const lean = (id, prob, odds, extra) => Object.assign({ id: id, sport: "NHL", league: "NHL", sportKey: "icehockey_nhl", event: "Away " + id + " @ Home " + id, home: "Home " + id, away: "Away " + id, commence: "2026-11-05T00:00:00Z", market: "Moneyline", pick: id + " ML", modelProb: prob, odds: odds, book: "DraftKings", prices: { DraftKings: odds, BetMGM: odds }, confidence: "Medium", status: "pending", started: false, standing: "clears" }, extra);
  const leans = [lean("a", 0.6, -110), lean("b", 0.55, 100, { standing: "below" }), lean("c", 0.5, -110), lean("d", 0.7, -150, { commence: "2026-11-04T17:00:00Z", started: true }), lean("e", 0.6, 100, { status: "graded" }), lean("f", 0.58, 100, { commence: "2026-11-06T00:00:00Z", context: { espnEventId: "777" } })];
  const lp = PLAYS.leanPlays({ picks: leans }, T4), lpAll = PLAYS.leanPlays({ picks: leans }, T4, { slipped: true });
  check("leans: a lean is a play while its game is ahead, it still clears its bar and it beats its price; slipped, started and graded leans are out", lp.map(x => x.id).join() === "a,f" && lp[0].kind === "lean" && lp[0].prob === 0.6 && lp[0].stated === 0.6 && near(lp[0].ev, 0.6 * PLAYS.decimal(-110) - 1) && lp[0].day === "2026-11-04" && lp[1].day === "2026-11-05" && lp[1].gameKey === "espn:777" && lpAll.map(x => x.id).join() === "a,b,c,f" && lpAll[1].slipped === true, JSON.stringify(lp.map(x => [x.id, x.day, x.gameKey])));

  /* ---------- player props as plays (the props fixture: two NBA games tonight, an NFL game tomorrow) ---------- */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-plays-"));
  await UP.run({ fixture: true, out: tmp, now: NOW4 });
  const D = OD.readProps(tmp), G = require("../js/props-grade.js");
  const pp = PLAYS.propPlays(D, T4), ppAll = PLAYS.propPlays(D, T4, { all: true });
  const NAW = "prop-NBA-401909923-4278039-ast-under-3.5", PG = "prop-NBA-401909924-4251-ast-over-3.5";
  check("props: one play a player (the likeliest side that beats its price), at the stated chance checked against the record, with the player, line, price and every book on that line",
    pp.length === 12 && new Set(pp.map(x => x.player.id)).size === 12 && pp.every(x => x.kind === "prop" && x.ev > 0 && near(x.prob, PLAYS.checked(x.stated, x.league, PLAYS.checkOf(D))) && x.prob < x.stated && near(x.ev, x.prob * PLAYS.decimal(x.odds) - 1, 2e-4) && x.prices[x.book] === x.odds && x.gameKey === "espn:" + x.gameId && x.commence && x.player.name && x.statLabel && x.pick.indexOf(x.player.name + " " + x.side + " " + x.line) === 0) &&
    pp.some(x => x.id === NAW && x.pick === "Nickeil Alexander-Walker under 3.5 assists" && x.odds === -110 && x.day === "2026-11-04" && x.tier === "Medium" && x.stated === 0.6406 && x.prob === 0.5422), JSON.stringify(pp.map(x => [x.id, x.prob, x.ev])));
  check("props: a priced side that does not beat its price is no play (listed only on request, flagged)", ppAll.length === 14 && ppAll.filter(x => !x.worth).length === 2 && ppAll.filter(x => !x.worth).every(x => x.ev <= 0) && pp.every(x => x.worth === true));
  check("props: a game that has started gives no plays, and neither does a file with no priced lines", PLAYS.propPlays(D, Date.parse("2026-11-05T00:10:00Z")).every(x => x.gameId !== "401909923") && PLAYS.propPlays(D, Date.parse("2026-11-05T00:10:00Z")).some(x => x.gameId === "401909924") && PLAYS.propPlays(Object.assign({}, D, { players: D.players.map(p => Object.assign({}, p, { lines: undefined })) }), T4).length === 0 && PLAYS.propPlays(null, T4).length === 0);
  check("props: a record that bears out nothing leaves only sides that pay better than even money, each counted as a coin flip", (() => { const z = PLAYS.propPlays(D, T4, { check: { all: { n: 900, keep: 0 } } }); return z.length > 0 && z.length < 12 && z.every(x => x.prob === 0.5 && PLAYS.decimal(x.odds) > 2); })());
  check("props: the same side as the props page (js/props-grade.js sideFor on the posted line)", (() => { const p = D.players.find(q => String(q.id) === "4278039"), s = G.sideFor(p, "ast", G.postedLine(p, "ast"), G.context(D)); return s.side === "under" && s.line === 3.5 && near(s.prob, 0.6406); })());

  /* ---------- the one list ---------- */
  const mixed = PLAYS.all({ picks: leans }, D, T4);
  check("list: leans and props in one order: Eastern game day first, then the likeliest, then expected value", mixed.length === 14 && mixed[0].id === "a" && mixed[1].id === NAW && mixed.slice(0, 6).every(x => x.day === "2026-11-04") && mixed.slice(6).every(x => x.day === "2026-11-05") && mixed.every((x, i) => i === 0 || mixed[i - 1].day < x.day || (mixed[i - 1].day === x.day && mixed[i - 1].prob >= x.prob)) && mixed[6].id === "f", JSON.stringify(mixed.map(x => [x.day, x.id, x.prob])));
  const fr = PLAYS.frontRunner(mixed, T4);
  check("front-runner: before the lock the page's first play of today and its likeliest two-leg parlay, a lean and a prop from different games at one book", fr.day === "2026-11-04" && fr.late === false && fr.play.id === "a" && fr.parlay && fr.parlay.legs.map(l => l.id).join() === "a," + NAW && fr.parlay.legs[0].gameKey !== fr.parlay.legs[1].gameKey && fr.parlay.legPrices.join() === "-110,-110" && near(fr.parlay.fairProb, 0.6 * 0.5422) && fr.parlay.ev > 0 && ["BetMGM", "DraftKings"].indexOf(fr.parlay.book) !== -1 && PLAYS.frontRunner(mixed, Date.parse("2026-11-04T20:30:00Z")).late === true, JSON.stringify(fr.parlay && [fr.parlay.book, fr.parlay.legs.map(l => l.id), fr.parlay.legPrices]));

  /* ---------- choosing and locking (scripts/of-day.js choose), on a log of its own ---------- */
  const deps = { etDate: d => PLAYS.dayOf(d.getTime()), boardOf: (log, now) => log.filter(e => !e.type && e.status === "pending" && Date.parse(e.commence) > now.getTime()), publicPick: e => e, startLabel: () => "Today 7:00 PM ET", profitPerUnit: U.profitPerUnit };
  const at = iso => new Date(iso);
  {
    const log = [];
    const r = OD.choose(log, D, at(NOW4), deps, { slot: "morning" });
    check("choose (morning): tonight's plays wait for the afternoon run: nothing locks, the day is marked looked at and still open", r.final === false && r.candidates === 5 && r.props === 5 && r.leans === 0 && r.play === null && !r.playLocked && !r.parlayLocked && log.length === 1 && log[0].type === "day" && log[0].date === "2026-11-04" && log[0].checkedAt === "2026-11-04T18:00:00.000Z" && log[0].closedAt === null && log[0].candidates === 5, JSON.stringify(r));
    const pub = OD.publish(log, at(NOW4), deps);
    check("publish (before the lock): no play and no parlay yet, the lock time and an open day", pub.playOfDay === null && pub.parlayOfDay === null && pub.ofDay.date === "2026-11-04" && pub.ofDay.lockAt === "2026-11-04T20:30:00.000Z" && pub.ofDay.playLocked === false && pub.ofDay.parlayLocked === false && pub.ofDay.closed === false && pub.ofDay.checkedAt === "2026-11-04T18:00:00.000Z" && pub.ofDay.last.play === null && pub.ofDay.last.parlay === null, JSON.stringify(pub.ofDay));
    const r2 = OD.choose(log, D, at("2026-11-04T20:31:00Z"), deps, { slot: "afternoon" });
    const prop = log.find(e => e.type === "prop" && e.potd), par = log.find(e => e.type === "parlay");
    check("choose (afternoon, props only): the likeliest prop is the play of the day, held in the log with its line, price and both chances", r2.final && r2.playLocked && r2.play === "Nickeil Alexander-Walker under 3.5 assists" && prop && prop.id === NAW && prop.potd === "2026-11-04" && prop.date === "2026-11-04" && prop.status === "pending" && prop.line === 3.5 && prop.side === "under" && prop.stat === "ast" && prop.odds === -110 && prop.prob === 0.5422 && prop.stated === 0.6406 && prop.keep === 0.3 && prop.checkedOn === 0 && prop.gameId === "401909923" && prop.player.id === "4278039" && prop.player.teamId === "1" && prop.lockedAt === "2026-11-04T20:31:00.000Z" && prop.commence === "2026-11-05T00:00:00.000Z", JSON.stringify(prop));
    check("choose (afternoon, props only): the parlay is the likeliest two props from different games at one book; a prop that is both the play and a leg is held once", r2.parlayLocked && r2.parlay === 2 && par && par.id === "parlay-2026-11-04" && par.legs.join() === NAW + "," + PG && par.legPrices.join() === "-110,-105" && par.odds === 273 && near(par.fairProb, 0.289) && par.ev > 0 && par.status === "pending" && log.filter(e => e.type === "prop").length === 2 && log.filter(e => e.id === NAW).length === 1 && log.find(e => e.type === "day").closedAt === "2026-11-04T20:31:00.000Z", JSON.stringify(par));
    const before = JSON.stringify(log.filter(e => e.type !== "day"));
    const r3 = OD.choose(log, Object.assign({}, D, { players: D.players.filter(p => String(p.id) !== "4278039") }), at("2026-11-04T22:00:00Z"), deps, { slot: "manual" });
    check("choose: one play and one parlay a day, never swapped, whatever a later run finds", r3.play === "Nickeil Alexander-Walker under 3.5 assists" && !r3.playLocked && !r3.parlayLocked && r3.parlay === 2 && JSON.stringify(log.filter(e => e.type !== "day")) === before && log.filter(e => e.type === "day").length === 1 && log.find(e => e.type === "day").closedAt === "2026-11-04T20:31:00.000Z");
    const pub2 = OD.publish(log, at("2026-11-04T22:00:00Z"), deps), pl = pub2.playOfDay, pq = pub2.parlayOfDay;
    check("publish (a prop play): the card's fields (pick, price, book, checked chance as modelProb, stated chance, tier) and the prop's own (player, line, side, reasons)", pl && pl.kind === "prop" && pl.id === NAW && pl.pick === "Nickeil Alexander-Walker under 3.5 assists" && pl.sport === "NBA" && pl.event === "Atlanta Hawks @ Washington Wizards" && pl.odds === -110 && pl.book && pl.modelProb === 0.5422 && pl.statedProb === 0.6406 && pl.confidence === "Medium" && pl.player.name === "Nickeil Alexander-Walker" && pl.line === 3.5 && pl.side === "under" && pl.statLabel === "Assists" && pl.status === "pending" && pl.started === false && pl.result === null && pl.units === null && pl.lockedAt === "2026-11-04T20:31:00.000Z" && Array.isArray(pl.reasons) && pub2.ofDay.playLocked && pub2.ofDay.parlayLocked && pub2.ofDay.closed, JSON.stringify(pl));
    check("publish (a parlay of props): each leg says what it is, when it starts and its price at the parlay's book", pq && pq.legs.length === 2 && pq.legs.every(l => l.kind === "prop" && l.commence && l.started === false && l.player && l.player.name && l.line != null && l.result === null && l.void === false) && pq.legs[0].price === -110 && pq.legs[1].price === -105 && pq.odds === 273 && pq.units === null && pq.lockedAt === "2026-11-04T20:31:00.000Z", JSON.stringify(pq));

    /* the games finish: the box scores grade the held props, then the parlay */
    const KEYS5 = ["minutes", "points", "rebounds", "assists", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"];
    const ath = (id, stats, dnp) => ({ athlete: { id: id, displayName: "P" + id }, didNotPlay: !!dnp, stats: dnp ? [] : stats });
    const filler = Array.from({ length: 10 }, (x, i) => ath("9" + i, ["20", "8", "3", "2", "1-3"]));
    const summary = athletes => ({ header: { competitions: [{ status: { type: { name: "STATUS_FINAL", completed: true } } }] }, boxscore: { players: [{ statistics: [{ keys: KEYS5, athletes: filler.concat(athletes) }] }] } });
    const src = boxes => ({ nbaSummary: async id => boxes[id] || null, nflSummary: async () => null, nflGameRoster: async () => null, count: () => 0 });
    const early = await OD.gradeProps(log, at("2026-11-05T01:00:00Z"), deps, { source: src({}) });
    check("grading: no box score is asked for before a game can have ended", early.graded === 0 && early.voided === 0 && log.filter(e => e.type === "prop").every(e => e.status === "pending"));
    const logW = JSON.parse(JSON.stringify(log));
    const gw = await OD.gradeProps(logW, at("2026-11-05T04:00:00Z"), deps, { source: src({ "401909923": summary([ath("4278039", ["30", "18", "4", "2", "2-5"])]), "401909924": summary([ath("4251", ["33", "21", "6", "5", "3-7"])]) }) });
    const nW = U.gradeParlays(logW, at("2026-11-05T04:00:00Z")), eW = logW.find(e => e.id === NAW), pW = logW.find(e => e.type === "parlay");
    check("grading: a prop play is graded on the box score alone (2 assists under 3.5: a win at the locked -110, +0.91u), and a parlay of two winning props pays both prices", gw.graded === 2 && eW.status === "graded" && eW.result === "Win" && eW.actual === 2 && eW.units === 0.91 && nW === 1 && pW.status === "graded" && pW.result === "Win" && near(pW.units, PLAYS.decimal(-110) * PLAYS.decimal(-105) - 1, 0.01), JSON.stringify([gw, eW.result, eW.units, pW.result, pW.units]));
    const perfW = U.summarize(logW, at("2026-11-05T04:00:00Z"));
    check("record: a prop that was the play of the day counts in the play-of-the-day record and the parlay record, and in no lean record", perfW.potd.wins === 1 && perfW.potd.n === 1 && perfW.potd.props === 1 && perfW.potd.recent.length === 1 && perfW.potd.recent[0].kind === "prop" && perfW.potd.recent[0].pick === "Nickeil Alexander-Walker under 3.5 assists" && perfW.potd.recent[0].units === 0.91 && perfW.parlays.wins === 1 && perfW.graded === 0 && perfW.record.wins === 0 && perfW.recent.length === 0, JSON.stringify([perfW.potd, perfW.parlays, perfW.record]));
    const pubW = OD.publish(logW, at("2026-11-05T04:00:00Z"), deps);
    check("publish (graded, same Eastern night): the play shows its result, the number the player finished on and the units; the parlay its legs' results", pubW.playOfDay.status === "graded" && pubW.playOfDay.result === "Win" && pubW.playOfDay.actual === 2 && pubW.playOfDay.units === 0.91 && pubW.playOfDay.started === true && pubW.parlayOfDay.result === "Win" && pubW.parlayOfDay.legs.every(l => l.result === "Win" && l.started === true) && pubW.parlayOfDay.legs[1].actual === 5);
    const pubN = OD.publish(logW, at("2026-11-05T15:00:00Z"), deps);
    check("publish (the next day): a new day starts open, and yesterday's play and parlay are the last ones, with their results", pubN.playOfDay === null && pubN.parlayOfDay === null && pubN.ofDay.date === "2026-11-05" && pubN.ofDay.closed === false && pubN.ofDay.last.play.date === "2026-11-04" && pubN.ofDay.last.play.kind === "prop" && pubN.ofDay.last.play.result === "Win" && pubN.ofDay.last.play.units === 0.91 && pubN.ofDay.last.parlay.result === "Win" && pubN.ofDay.last.parlay.legs === 2, JSON.stringify(pubN.ofDay));
    const logV = JSON.parse(JSON.stringify(log));
    const gv = await OD.gradeProps(logV, at("2026-11-05T04:00:00Z"), deps, { source: src({ "401909923": summary([ath("4278039", [], true)]), "401909924": summary([ath("4251", ["33", "21", "6", "3", "3-7"])]) }) });
    U.gradeParlays(logV, at("2026-11-05T04:00:00Z"));
    const eV = logV.find(e => e.id === NAW), lV = logV.find(e => e.id === PG), pV = logV.find(e => e.type === "parlay"), perfV = U.summarize(logV, at("2026-11-05T04:00:00Z"));
    check("grading: a player who did not play voids the prop and the parlay it is a leg of; nothing void is in a record; a loss is one unit", gv.voided === 1 && gv.graded === 1 && eV.status === "void" && eV.voidReason === "did not play" && eV.units === 0 && lV.result === "Loss" && lV.units === -1 && lV.actual === 3 && pV.status === "void" && perfV.potd.n === 0 && perfV.parlays.n === 0 && OD.publish(logV, at("2026-11-05T04:30:00Z"), deps).playOfDay.voidReason === "did not play", JSON.stringify([gv, eV.status, lV.result, pV.status]));
  }
  {
    /* leans and props together: a 4 PM lean is the likeliest and starts before the lock run can be trusted to have run */
    const log = [Object.assign(lean("early", 0.6, -110, { commence: "2026-11-04T21:00:00Z" }), { key: "k1" }), Object.assign(lean("late", 0.56, 100), { key: "k2" }), Object.assign(lean("used", 0.9, -110, { commence: "2026-11-04T21:30:00Z", potd: "2026-11-03" }), { key: "k3" })];
    const r = OD.choose(log, D, at(NOW4), deps, { slot: "morning" });
    const par = log.find(e => e.type === "parlay");
    check("choose (morning, an early start): the likeliest play starts before the lock run can be counted on, so it locks now; a lean keeps its own entry", r.final === false && r.playLocked && r.play === "early ML" && log[0].potd === "2026-11-04" && log[0].potdAt === "2026-11-04T18:00:00.000Z" && log.filter(e => e.potd === "2026-11-04").length === 1 && r.candidates === 8 && r.leans === 3 && r.props === 5, JSON.stringify(r));
    check("choose: a play of an earlier day is never the play again", log[2].potd === "2026-11-03" && r.play !== "used ML");
    check("choose (a mixed parlay): legs can be a lean and a lean or a lean and a prop; the likeliest pair from different games locks with the early leg", r.parlayLocked && par && par.legs.join() === "used,early" && par.book && par.legPrices.join() === "-110,-110", JSON.stringify(par));
    const log2 = [Object.assign(lean("early", 0.6, -110, { commence: "2026-11-04T21:00:00Z" }), { key: "k1" })];
    const rb = OD.choose(log2, D, at(NOW4), deps, { slot: "morning" }), par2 = log2.find(e => e.type === "parlay"), pubM = OD.publish(log2, at(NOW4), deps);
    check("choose (a lean and a prop): the parlay's prop leg gets an entry of its own, the play of the day stays the lean", rb.playLocked && rb.parlayLocked && par2.legs.join() === "early," + NAW && log2.filter(e => e.type === "prop").length === 1 && !log2.find(e => e.type === "prop").potd && pubM.playOfDay.kind === "lean" && pubM.playOfDay.id === "early" && pubM.parlayOfDay.legs[0].kind === "lean" && pubM.parlayOfDay.legs[1].kind === "prop" && pubM.parlayOfDay.legs[1].player.name === "Nickeil Alexander-Walker" && pubM.ofDay.closed === false && pubM.ofDay.playLocked === true, JSON.stringify([rb, par2 && par2.legs]));
    const log3 = [];
    const rs = OD.choose(log3, Object.assign({}, D, { sample: true }), at("2026-11-04T20:31:00Z"), deps, { slot: "afternoon" });
    check("choose: sample props are never a play; a day with nothing that qualifies closes with no play and no parlay", rs.final && rs.candidates === 0 && rs.play === null && rs.parlay === 0 && log3.length === 1 && log3[0].closedAt && OD.publish(log3, at("2026-11-04T21:00:00Z"), deps).ofDay.closed === true && OD.publish(log3, at("2026-11-04T21:00:00Z"), deps).playOfDay === null);
    const log4 = [];
    const rm = OD.choose(log4, D, at("2026-11-04T23:00:00Z"), deps, { slot: "morning" }), rn = OD.choose([], D, at("2026-11-04T23:00:00Z"), deps, {});
    check("choose: a morning run never closes the day however late it starts (it read no NBA lines); a manual run after the lock time does", rm.final === false && rn.final === true && rn.playLocked === true);
  }

  /* ---------- end to end: the pipeline's own step on the fixtures ---------- */
  {
    const full = await U.run({ fixture: true, out: tmp, now: NOW4 });
    const pk0 = win(path.join(tmp, "picks.js"), "PICKS_DATA");
    check("run: the odds run chooses nothing and publishes an open day", full.playOfDay == null && pk0.playOfDay === null && pk0.parlayOfDay === null && pk0.ofDay && pk0.ofDay.closed === false && pk0.ofDay.checkedAt === null && Object.keys(pk0).join() === "sample,source,generatedAt,playOfDay,parlayOfDay,ofDay,picks");
    const step = await U.run({ fixture: true, out: tmp, now: "2026-11-04T20:31:00Z", ofDay: true, slot: "afternoon" });
    const pk1 = win(path.join(tmp, "picks.js"), "PICKS_DATA"), log1 = JSON.parse(fs.readFileSync(path.join(tmp, "picks-log.json"), "utf8"));
    check("--of-day: reads the props file the refresh left, locks a prop as the play and two props as the parlay, and rewrites only the day's fields of picks.js", step.ofDayRun && step.final && step.playLocked && step.parlayLocked && step.props === 5 && pk1.playOfDay.kind === "prop" && pk1.playOfDay.id === NAW && pk1.parlayOfDay.legs.map(l => l.id).join() === NAW + "," + PG && pk1.ofDay.closed === true && pk1.generatedAt === pk0.generatedAt && JSON.stringify(pk1.picks) === JSON.stringify(pk0.picks) && log1.filter(e => e.type === "prop").length === 2 && log1.filter(e => e.type === "day").length === 1, JSON.stringify(step));
    const again = await U.run({ fixture: true, out: tmp, now: "2026-11-04T21:00:00Z" });
    const pk2 = win(path.join(tmp, "picks.js"), "PICKS_DATA");
    check("run: a later odds run keeps the locked play and parlay and adds no lean for a prop's entry", again.playOfDay === "Nickeil Alexander-Walker under 3.5 assists" && pk2.playOfDay.id === NAW && pk2.parlayOfDay.legs.length === 2 && pk2.picks.every(p => p.kind === undefined && p.id.indexOf("prop-") !== 0));
    const KEYS5 = ["minutes", "points", "rebounds", "assists", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"];
    const ath = (id, stats) => ({ athlete: { id: id, displayName: "P" + id }, didNotPlay: false, stats: stats });
    const filler = Array.from({ length: 10 }, (x, i) => ath("9" + i, ["20", "8", "3", "2", "1-3"]));
    const summary = a => ({ header: { competitions: [{ status: { type: { name: "STATUS_FINAL", completed: true } } }] }, boxscore: { players: [{ statistics: [{ keys: KEYS5, athletes: filler.concat(a) }] }] } });
    const boxes = { "401909923": summary([ath("4278039", ["30", "18", "4", "5", "2-5"])]), "401909924": summary([ath("4251", ["33", "21", "6", "5", "3-7"])]) };
    const tr = await U.run({ fixture: true, out: tmp, now: "2026-11-05T04:00:00Z", track: true, propsSource: { nbaSummary: async id => boxes[id] || null, nflSummary: async () => null, nflGameRoster: async () => null, count: () => 0 } });
    const pk3 = win(path.join(tmp, "picks.js"), "PICKS_DATA"), perf = win(path.join(tmp, "performance.js"), "PERF_DATA");
    check("track: the hourly run grades the prop play from the box score (5 assists on an under 3.5: a loss), settles the parlay, republishes both and rewrites the record; it chooses nothing", tr.track === true && tr.propPlaysGraded === 2 && pk3.playOfDay.id === NAW && pk3.playOfDay.result === "Loss" && pk3.playOfDay.units === -1 && pk3.playOfDay.actual === 5 && pk3.parlayOfDay.result === "Loss" && pk3.parlayOfDay.units === -1 && perf.potd.n === 1 && perf.potd.losses === 1 && perf.potd.props === 1 && perf.parlays.n === 1 && perf.potd.recent[0].result === "Loss", JSON.stringify([tr.propPlaysGraded, pk3.playOfDay.result, perf.potd, perf.parlays]));
    const dayAfter = await U.run({ fixture: true, out: tmp, now: "2026-11-05T15:00:00Z", ofDay: true, slot: "morning" });
    const pk4 = win(path.join(tmp, "picks.js"), "PICKS_DATA");
    check("--of-day (the next morning): a new day, nothing locked for a 7 PM game, yesterday's play and parlay as the last ones", dayAfter.date === "2026-11-05" && dayAfter.playLocked === false && pk4.playOfDay === null && pk4.ofDay.date === "2026-11-05" && pk4.ofDay.last.play.pick === "Nickeil Alexander-Walker under 3.5 assists" && pk4.ofDay.last.play.result === "Loss" && pk4.ofDay.last.parlay.result === "Loss", JSON.stringify(pk4.ofDay));
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-plays-bare-"));
    const rbare = await U.run({ fixture: true, out: bare, now: NOW4, ofDay: true, slot: "afternoon" });
    check("--of-day: with no picks.js and no props.js it locks nothing, writes the log and never throws", rbare.ofDayRun && rbare.file === false && rbare.candidates === 0 && rbare.play === null && !fs.existsSync(path.join(bare, "picks.js")) && JSON.parse(fs.readFileSync(path.join(bare, "picks-log.json"), "utf8")).length === 1);
    fs.rmSync(bare, { recursive: true, force: true });
  }
  /* the workflow: the step sits after the props refresh and before the feeds, and can never fail the job; the hourly run has none */
  {
    const wf = n => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", n), "utf8");
    const full = wf("update-data.yml"), hourly = wf("track-prices.yml");
    const iProps = full.indexOf("node scripts/update-props.js"), iDay = full.indexOf("node scripts/update-data.js --of-day --slot"), iFeeds = full.indexOf("node scripts/feeds.js");
    check("workflows: the full run chooses after the props refresh and before the feeds, with the run's own slot, in a step that cannot fail the job; the hourly run never chooses", iProps !== -1 && iDay > iProps && iFeeds > iDay && /--of-day --slot \$\{\{[^\n]*'morning'[^\n]*'afternoon'[^\n]*\}\} \|\| echo "::warning::/.test(full) && hourly.indexOf("--of-day") === -1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "\n" + fails.length + " FAILED:\n" + fails.join("\n") : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
