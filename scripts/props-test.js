/* Offline test of the props pipeline against scripts/fixtures/espn (NBA), espn/nfl and sgo (NBA-props, NFL-props). Run: node scripts/props-test.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const P = require("./update-props.js");
const sgo = require("./sgo.js");
const fails = [];
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) fails.push(name); };
(async () => {
  const fx = n => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", n + ".json"), "utf8"));
  const sb = P.parseScoreboard(fx("scoreboard"));
  check("scoreboard: two games with home and away teams", sb.length === 2 && sb.every(g => g.home.abbr && g.away.abbr && g.start));
  const withRoster = [sb[0].home.id, sb[0].away.id, sb[1].home.id, sb[1].away.id].find(id => fx("roster-" + id).athletes.length);
  const roster = fx("roster-" + withRoster);
  check("seasonLabel: Nov 2026 -> 2026-27, Mar 2027 -> 2026-27", P.seasonLabel(new Date("2026-11-04T00:00:00Z")) === "2026-27" && P.seasonLabel(new Date("2027-03-01T00:00:00Z")) === "2026-27");
  check("ordinal: 1st 2nd 3rd 4th 11th 21st 23rd", ["1st", "2nd", "3rd", "4th", "11th", "21st", "23rd"].join() === [1, 2, 3, 4, 11, 21, 23].map(P.ordinal).join());
  const rawLog = fx("gamelog-" + roster.athletes[0].id);
  check("gamelog: only the current season is used (no rows from another season)", P.parseGamelog(rawLog, "2025-26").every(r => r.date < "2026-07-01") && P.parseGamelog(rawLog, "2026-27").every(r => r.date >= "2026-10-01"));
  check("gamelog: an unknown season yields no rows", P.parseGamelog(rawLog, "1999-00").length === 0);
  const log = P.parseGamelog(rawLog, "2026-27");
  check("gamelog: regular-season rows newest first with minutes and points", log.length >= 3 && log.every(r => r.min != null && r.pts != null) && log[0].date >= log[1].date);
  check("gamelog: threes parsed from the made-attempted pair", log.every(r => Number.isInteger(r.threes)));
  const blk = P.statBlock(log, "pts");
  check("statBlock: season, last 5, last 10 and last-10 series", blk.season > 0 && blk.l5 > 0 && Array.isArray(blk.last) && blk.last.length <= 10);
  const pa = P.pointsAllowed(fx("schedule-" + withRoster), withRoster);
  check("pointsAllowed: average from completed games", pa.games > 0 && pa.ptsAllowed > 50);
  const fake = { gp: 8, home: true, b2b: true, restDays: 1, injury: null, oppAbbr: "X", opp: { ptsAllowed: 125, rank: 2 }, minutes: { season: 30, l5: 35 },
    stats: { pts: { season: 20, l5: 26, l10: 22, home: 24, away: 18, sd: 3 }, reb: { season: 5, l5: 5 }, ast: { season: 4, l5: 2.5 }, threes: { season: 2, l5: 2 } } };
  const sig = P.signals(fake);
  const keys = sig.map(s => s.key + ":" + s.lean);
  check("signals: points up, assists down, minutes up, home scorer, back-to-back, soft defence, steady", ["pts:over", "ast:under", "min:over", "split:over", "rest:under", "opp:over", "steady:neutral"].every(k => keys.indexOf(k) !== -1), keys.join(","));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-props-"));
  const r = await P.run({ fixture: true, out: tmp, now: "2026-11-04T18:00:00Z" });
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(tmp, "props.js"), "utf8"), sandbox);
  const DA = sandbox.window.PROPS_DATA;
  /* the NBA half (the NFL half is checked below) */
  const D = Object.assign({}, DA, { games: DA.games.filter(g => g.league === "NBA"), players: DA.players.filter(p => p.league === "NBA") });
  check("run: writes props.js with games and players", D.games.length === 2 && D.players.length >= 4 && r.players === D.players.length, "players " + r.players);
  check("run: every entry names its league, sport and event (game.html reads them)", DA.players.every(p => (p.league === "NBA" || p.league === "NFL") && p.sportKey && p.eventId === p.gameId && p.commence) && DA.games.every(g => g.league && g.eventId === g.id));
  check("run: players carry matchup, stats, signals and a 10-game log (headshot derivable from id)", D.players.every(p => (p.headshot || p.id) && p.oppAbbr && p.stats.pts && Array.isArray(p.signals) && p.log.length > 0 && p.log.length <= 10));
  check("run: opponent defence rank attached", D.players.some(p => p.opp && p.opp.rank >= 1));
  check("run: sorted by minutes within a team, rotation players only", D.players.every(p => p.minutes.season >= P.RULES.minMinutes));
  check("run: attribution names ESPN and SportsGameOdds", /ESPN/.test(D.attribution) && /SportsGameOdds/.test(D.attribution));
  const naw = D.players.find(p => p.name === "Nickeil Alexander-Walker"), dort = D.players.find(p => p.name === "Luguentz Dort"), pg = D.players.find(p => p.name === "Paul George");
  check("lines: five players priced in both fixture games, summary written", D.lines && D.lines.players === 5 && D.lines.games === 2 && D.lines.books.length === 8 && D.players.filter(p => p.lines).length === 5, JSON.stringify(D.lines));
  check("lines: consensus line, vendor fair per side summing to one, best book and price on that line", naw && naw.lines.pts.line === 20.5 && naw.lines.pts.vendorFair && Math.abs(naw.lines.pts.over.fair + naw.lines.pts.under.fair - 1) < 1e-6 && naw.lines.pts.over.book === "Caesars" && naw.lines.pts.over.odds === -95 && naw.lines.pts.over.n === 8);
  check("lines: vendor fair on another line falls back to our own de-vig across the books", dort && dort.lines.pts.vendorFair === false && dort.lines.pts.fairBooks === 8 && dort.lines.pts.over.fair === 0.5 && dort.lines.pts.fairLine === 9.5);
  check("lines: a book on an alternate line is left out of the count", D.players.find(p => p.name === "Dyson Daniels").lines.pts.over.n === 7);
  check("lines: the main line is the number the books quote both ways, not the vendor's consensus", pg && pg.lines.reb.line === 5.5 && pg.lines.reb.over.n === 8 && pg.lines.reb.under.n === 8);
  check("lines: a player is matched from the odd ids when the event has no players map", pg && pg.sgoPlayerId === "PAUL_GEORGE_1_NBA" && Object.keys(pg.lines).length === 5);
  check("lines: a player the books do not price has none", !D.players.find(p => p.name === "Kingston Flemings").lines);
  const sh = D.players.find(p => p.name === "Sam Hauser");
  check("lines: an odd with no bookmaker map does not break the run; that side simply has no books", sh && sh.lines.threes && sh.lines.threes.line === 1.5 && sh.lines.threes.under.n === 0 && sh.lines.threes.over.n === 8);
  check("sgo: names match through accents, suffixes and hyphens", sgo.normName("Luka Dončić") === "lukadoncic" && sgo.normName("Jaren Jackson Jr.") === "jarenjackson" && sgo.findPlayer(sgo.playerIndex({ odds: { "points-JAREN_JACKSON_1_NBA-game-ou-over": { statEntityID: "JAREN_JACKSON_1_NBA" } } }), "Jaren Jackson Jr.") === "JAREN_JACKSON_1_NBA" && sgo.findPlayer(sgo.playerIndex({ players: { X_1_NBA: { name: "Nikola Jokic" } } }), "Nikola Jokić") === "X_1_NBA");
  /* the hourly refresh (2026-11-08, the SportsGameOdds surplus): only games starting within three hours are re-read, one
     entity per game the call returns, and each refreshed player says when */
  {
    const fx = league => sgo.source({ fixture: true, fixtureName: league + "-props" });
    const soonList = P.gamesWithin(tmp, new Date("2026-11-04T21:15:00Z"), 3);
    const before = fs.readFileSync(path.join(tmp, "props.js"), "utf8"), costR = P.refreshCost(tmp, new Date("2026-11-04T21:15:00Z"), 3);
    const rf = await P.refreshLines(tmp, new Date("2026-11-04T21:15:00Z"), { hours: 3, sourceFor: fx });
    const sbR = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "props.js"), "utf8"), sbR);
    const DR = sbR.window.PROPS_DATA, first = DR.games.filter(g => g.league === "NBA").sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
    const refreshed = DR.players.filter(p => p.linesAt === "2026-11-04T21:15:00.000Z");
    check("refresh: lines are re-read for the NBA game starting within three hours only (its players get linesAt), the call's entities counted and priced beforehand (the window returns both games), the file otherwise as written", soonList.length === 1 && costR === 2 && rf.games === 1 && rf.players >= 1 && rf.entities === 2 && refreshed.length === rf.players && refreshed.every(p => p.gameId === first.id) && DR.linesRefreshedAt === "2026-11-04T21:15:00.000Z" && DR.players.length === DA.players.length && DR.generatedAt === DA.generatedAt, JSON.stringify(rf));
    const none = await P.refreshLines(tmp, new Date("2026-11-04T12:00:00Z"), { hours: 3, sourceFor: fx });
    check("refresh: with no game inside three hours nothing is asked and the file is left alone", none.games === 0 && none.entities === 0 && P.gamesWithin(tmp, new Date("2026-11-04T12:00:00Z"), 3).length === 0 && before.length > 0);
  }
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-props-"));
  const r2 = await P.run({ fixture: true, out: tmp2, now: "2026-11-04T18:00:00Z", lines: false });
  check("run: --no-lines skips the odds call and writes no lines (either league)", r2.lines.skipped === "off" && r2.nfl.summary.lines.skipped === "off" && (() => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp2, "props.js"), "utf8"), sb); return !sb.window.PROPS_DATA.players.some(p => p.lines); })());
  fs.rmSync(tmp2, { recursive: true, force: true });
  /* the slate is the Eastern date, asked for by date (ESPN's undated scoreboard kept last night's finals until late
     morning on 2026-11-05 and emptied the page and faces.js); a finished slate rolls to tomorrow's */
  const fxs = P.fixtureSource(), allFinal = sb => Object.assign({}, sb, { events: (sb.events || []).map(e => Object.assign({}, e, { status: { type: { name: "STATUS_FINAL", completed: true } }, competitions: (e.competitions || []).map(c => Object.assign({}, c, { status: { type: { name: "STATUS_FINAL", completed: true } } })) })) });
  const asked = [], rolled = Object.assign({}, fxs, { scoreboard: async day => { asked.push(day); const sb = await fxs.scoreboard(day); return asked.length === 1 ? allFinal(sb) : sb; } });
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-props-"));
  const r3 = await P.run({ source: rolled, out: tmp3, now: "2026-11-05T04:30:00Z", lines: false }); /* 11:30 PM ET on Nov 4 */
  check("slate: asked by Eastern date (11:30 PM ET on Nov 4 is 20261104), and a slate that is all final rolls to tomorrow's", asked[0] === "20261104" && asked[1] === "20261105" && r3.players > 0, JSON.stringify([asked, r3.players]));
  const before = fs.readFileSync(path.join(tmp3, "faces.js"), "utf8");
  const none = Object.assign({}, fxs, { scoreboard: async day => allFinal(await fxs.scoreboard(day)) });
  const r4 = await P.run({ source: none, out: tmp3, now: "2026-11-05T15:47:00Z", lines: false });
  check("slate: a night with no games left keeps the last data/faces.js (the model reads injured scorers' points from it)", r4.players === 0 && fs.readFileSync(path.join(tmp3, "faces.js"), "utf8") === before && /Players|players/.test(before), String(r4.players));
  check("slate: a custom NBA source never reaches the live NFL endpoints", r3.nfl === null && r4.nfl === null);
  fs.rmSync(tmp3, { recursive: true, force: true });

  /* ---------- NFL (scripts/nfl-props.js) ---------- */
  const N = require("./nfl-props.js");
  const nfx = n => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", "nfl", n + ".json"), "utf8"));
  const box = N.parseSummary(nfx("summary-401873037"));
  const row = id => box.game.r.find(x => x[N.C.id] === id);
  check("nfl box score: the Thursday game, final 33-10, one row per player with targets, carries and attempts", box && box.game.id === "401873037" && box.game.w === 9 && box.game.h[1] === "BAL" && box.game.a[2] === 33 && box.game.r.length >= 15 && box.game.r.some(x => x[N.C.tgt] > 0) && box.game.r.some(x => x[N.C.att] > 0), box && JSON.stringify(box.game.h));
  check("nfl box score: a defender with no offensive line is not a row; names are kept for the cache", box.game.r.every(x => x[N.C.att] + x[N.C.car] + x[N.C.tgt] + x[N.C.rec] > 0 || x[N.C.ryd] !== 0) && Object.keys(box.names).length === box.game.r.length);
  check("nfl box score: an unfinished game is not parsed", N.parseSummary(Object.assign({}, nfx("summary-401873037"), { header: Object.assign({}, nfx("summary-401873037").header, { competitions: [Object.assign({}, nfx("summary-401873037").header.competitions[0], { status: { type: { completed: false } } })] }) })) === null);
  const wsb = nfx("week-2026-2-9"), wg = N.parseScoreboard(wsb);
  check("nfl scoreboard: week, venue, indoor flag and teams", wg.length === 4 && wg.every(g => g.week === 9 && g.home.abbr && g.venue.city) && wg.find(g => g.id === "401873037").venue.indoor === false);
  check("nfl calendar: weeks begun and weeks ahead read from the scoreboard", N.weeksBegun(wsb, new Date("2026-11-04T18:00:00Z")).length === 9 && N.upcomingWeeks(wsb, new Date("2026-11-04T18:00:00Z"))[0].week === 9);
  /* the main fixture run above was Wednesday: the NFL half is the next game day's research. Since 2026-11-10 a run that
     prices both leagues also reads that slate a day or two ahead from the surplus (checked further down); a run that
     does not ask (--no-early here, the morning run's --lines nfl in production) leaves it unpriced until game day */
  const DN = DA.players.filter(p => p.league === "NFL"), LN = DA.leagues && DA.leagues.NFL;
  const tmpW = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-nfl-wed-")), wedOff = await N.run({ fixture: true, out: tmpW, now: "2026-11-04T18:00:00Z" });
  fs.rmSync(tmpW, { recursive: true, force: true });
  check("nfl run (Wednesday): the next game day is Thursday's JAX @ BAL, researched; with no early read asked for it is not priced (not a game day)", LN && LN.date === "2026-11-05" && LN.today === false && DA.games.filter(g => g.league === "NFL").length === 1 && DN.length >= 15 && wedOff.summary.lines.skipped === "not a game day" && wedOff.summary.lines.next === "2026-11-05" && !wedOff.summary.lines.early && !wedOff.players.some(p => p.lines), JSON.stringify(wedOff.summary.lines));
  check("nfl run: each entry has its position's stats, a projection per stat (quantiles for yards, Poisson for counts) and a game log", DN.every(p => p.keys.length && p.keys.every(k => p.stats[k] && p.proj[k] && p.proj[k].mean >= 0 && (N.STATS[k].dist === "ratio" ? p.proj[k].q.length === 19 : p.proj[k].dist === "poisson") && Array.isArray(p.proj[k].reasons)) && p.log.length > 0 && p.log.length <= 10 && p.gameId === "401873037"));
  check("nfl run: one quarterback per team (the expected starter), up to three backs, four receivers, two tight ends", ["BAL", "JAX"].every(t => DN.filter(p => p.teamAbbr === t && p.pos === "QB").length === 1 && DN.filter(p => p.teamAbbr === t && p.pos === "WR").length <= 4 && DN.filter(p => p.teamAbbr === t && p.pos === "TE").length <= 2));
  check("nfl run: data/faces.js stays NBA only (the game model reads NBA scorers from it)", (() => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp, "faces.js"), "utf8"), sb); return sb.window.FACES_DATA.players.length > 0 && !sb.window.FACES_DATA.players.some(f => DN.some(p => p.id === f.id)); })());
  check("nfl run: the season's box scores are written to nfl-games.json beside props.js", fs.existsSync(path.join(tmp, "nfl-games.json")) && Object.keys(JSON.parse(fs.readFileSync(path.join(tmp, "nfl-games.json"), "utf8")).games).length === 121);
  /* Thursday 9 AM ET, the morning run: lines for the night's game */
  const tmpN = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-nfl-"));
  const th = await N.run({ fixture: true, out: tmpN, now: "2026-11-05T14:00:00Z" });
  const pl = n => th.players.find(p => p.name === n);
  check("nfl lines (Thursday morning): one entity for the one game, nine players priced at six books", th.summary.today && th.summary.lines.games === 1 && th.summary.lines.of === 1 && th.summary.lines.entities === 1 && th.summary.lines.players === 9 && th.summary.lines.books.length === 6, JSON.stringify(th.summary.lines));
  const jb = pl("Jacoby Brissett"), dh = pl("Derrick Henry"), zf = pl("Zay Flowers"), bs = pl("Brenton Strange"), th2 = pl("Brian Thomas Jr.");
  check("nfl lines: passing yards on 235.5 with the vendor's fair, per side summing to one, best book Caesars -105", jb && jb.lines.passYds.line === 235.5 && jb.lines.passYds.vendorFair && Math.abs(jb.lines.passYds.over.fair + jb.lines.passYds.under.fair - 1) < 1e-6 && jb.lines.passYds.over.book === "Caesars" && jb.lines.passYds.over.odds === -105 && jb.sgoEventId === "SGO_NFL_JAXBAL" && jb.eventId === "401873037");
  check("nfl lines: the vendor's fair on another number falls back to our own de-vig across the books", dh && dh.lines.rushYds.vendorFair === false && dh.lines.rushYds.fairBooks === 6 && dh.lines.rushYds.over.fair === 0.5 && dh.lines.rushYds.fairLine === 75.5);
  check("nfl lines: a book on an alternate number is left out; a one-sided ladder is not a two-sided line", zf && zf.lines.recYds.over.n === 5 && bs && bs.lines.rec.under.n === 0 && bs.lines.rec.over.n === 3);
  check("nfl lines: a player with no players-map entry is matched from the odd ids (BRIAN_THOMAS_1_NFL, the suffix dropped); untracked markets (anytime touchdown) are ignored", th2 && th2.lines && th2.lines.recYds.line === 30.5 && th2.sgoPlayerId === "BRIAN_THOMAS_1_NFL" && !Object.keys(dh.lines).some(k => !N.SGO_STATS[k]));
  const thOff = await N.run({ fixture: true, out: tmpN, now: "2026-11-05T14:00:00Z", lines: false });
  check("nfl grade: the projection is the same with or without the books' lines (game data only)", thOff.players.every(p => { const q = th.players.find(x => x.id === p.id); return q && p.keys.every(k => q.proj[k].mean === p.proj[k].mean); }));
  check("nfl lines: the free tier's backstop skips the call when the month is nearly spent", (await N.attachLines(th.players.map(p => Object.assign({}, p, { lines: null })), th.games, { date: "2026-11-05", today: true }, { sgoSource: { enabled: true, usage: async () => ({ used: 2400, max: 2500 }), events: async () => [], stats: () => ({ entities: 0 }) } }, new Date("2026-11-05T14:00:00Z"))).skipped === "budget");
  /* Sunday 3:30 PM ET, the afternoon run: the 1 PM game is under way, the 4:25 game is priced; Thursday's box score comes in */
  const fx0 = N.fixtureSource();
  const sunSrc = Object.assign({}, fx0, { week: async (s, t, w) => { const sb = await fx0.week(s, t, w); if (sb) sb.events.forEach(e => { if (e.id === "401873037") { e.status = { type: { name: "STATUS_FINAL", completed: true, state: "post" } }; e.competitions[0].status = e.status; } }); return sb; } });
  const sun = await N.run({ nflSource: sunSrc, fixture: true, out: tmpN, now: "2026-11-08T20:30:00Z" });
  check("nfl box scores: a game finished since the last run is fetched once and kept", sun.summary.boxscores.fetched === 1 && sun.summary.boxscores.games === 122);
  check("nfl lines (Sunday afternoon): only the game still to start is priced; the one under way keeps its players", sun.summary.lines.of === 1 && sun.summary.lines.entities === 1 && sun.players.filter(p => p.lines).every(p => p.gameId === "401873049") && sun.players.some(p => p.gameId === "401873045"), JSON.stringify(sun.summary.lines));
  const love = sun.players.find(p => p.name === "Jordan Love"), ne = sun.games.find(g => g.id === "401873049");
  check("nfl wind: 13 mph at Foxborough from the National Weather Service, named in the passing reasons as an unfitted prior", ne.wind && ne.wind.mph === 13 && love.proj.passYds.reasons.some(x => /Wind 13 mph/.test(x.label) && /not fitted/.test(x.label)));
  check("nfl injuries: a Questionable receiver is kept, flagged and projected 5% lower", sun.players.some(p => p.injury === "Questionable" && p.proj[p.keys[0]].reasons.some(x => /Questionable/.test(x.label))));
  /* the carry-over: lines read on the morning run stay on the 1 PM game's players after it starts */
  const kc = sun.players.find(p => p.name === "Patrick Mahomes");
  const prevFile = { generatedAt: "2026-11-08T14:10:00Z", leagues: { NFL: { lines: { at: "2026-11-08T14:10:00Z" } } }, games: [], players: [{ league: "NFL", id: kc.id, gameId: "401873045", lines: { passYds: { line: 255.5, over: { n: 6 }, under: { n: 6 } } }, sgoPlayerId: "PATRICK_MAHOMES_1_NFL" }] };
  const carried = await P.runNFL({ nflSource: sunSrc, fixture: true, writeCache: false }, new Date("2026-11-08T20:30:00Z"), tmpN, prevFile);
  const kc2 = carried.players.find(p => p.id === kc.id);
  check("nfl carry: a started game's lines from the morning run stay on its players (same game), marked carried", kc2.lines && kc2.lines.passYds.line === 255.5 && kc2.linesCarried === true && kc2.linesAt === "2026-11-08T14:10:00Z" && carried.summary.carried === 1);
  const failed = await P.runNFL({ nflSource: { scoreboard: async () => null } }, new Date("2026-11-08T20:30:00Z"), tmpN, { generatedAt: "x", leagues: { NFL: { date: "2026-11-08" } }, games: [{ id: "g1", league: "NFL", start: "2026-11-08T21:25Z" }, { id: "g0", league: "NFL", start: "2026-11-01T18:00Z" }], players: [{ league: "NFL", id: "a", gameId: "g1" }, { league: "NFL", id: "b", gameId: "g0" }] });
  check("nfl failure: the last file's NFL games still ahead are kept and the error is recorded", failed.games.length === 1 && failed.players.length === 1 && /no NFL scoreboard/.test(failed.summary.error));
  check("flags: --lines nfl spends entities on the NFL only; --no-lines on neither", JSON.stringify(P.linesFor({ lines: ["NFL"] }, "NFL")) === "true" && P.linesFor({ lines: ["NFL"] }, "NBA") === false && P.linesFor({ lines: false }, "NFL") === false && P.linesFor({}, "NBA") === true);
  /* the maths the page repeats */
  const q = N.distFor("recYds", 60);
  check("nfl P(over): falls as the line rises, about even at the projected median, Poisson for counts", N.pOver({ dist: "ratio", q: q }, 20) > N.pOver({ dist: "ratio", q: q }, 50) && N.pOver({ dist: "ratio", q: q }, 50) > N.pOver({ dist: "ratio", q: q }, 90) && Math.abs(N.pOver({ dist: "ratio", q: q }, q[9]) - 0.5) < 1e-9 && Math.abs(N.pOver({ dist: "poisson", mean: 1.6 }, 1.5) - (1 - Math.exp(-1.6) * 2.6)) < 1e-9);
  /* the held-out check runs on the season's cache (node scripts/nfl-props.js --eval) */
  const idxF = N.indexGames(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "espn", "nfl", "nfl-games.json"), "utf8")));
  const ev = N.summarise(N.evalSample(idxF, { fromWeek: 3 }));
  check("nfl check: every week projected from the weeks before it, against the season average and at the running median", N.STAT_KEYS.every(k => ev[k] && ev[k].n > 20 && ev[k].maeModel > 0 && ev[k].maeBase > 0 && ev[k].brier.model < 0.3), JSON.stringify(N.STAT_KEYS.map(k => ev[k] && [k, ev[k].n, ev[k].maeModel, ev[k].maeBase])));

  /* ====================== 2026-11-10: stat lists, deeper NFL markets, lines before game day, the record ====================== */
  const G = require("../js/props-grade.js"), L = require("./props-log.js"), surplus = require("./surplus.js");
  const load = dir => { const s = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(dir, "props.js"), "utf8"), s); return s.window.PROPS_DATA; };
  const bytes = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");
  const sum3 = o => Object.keys(o).reduce((a, k) => ({ w: a.w + o[k].w, l: a.l + o[k].l, push: a.push + o[k].push }), { w: 0, l: 0, push: 0 });
  const same3 = (a, b) => a.w === b.w && a.l === b.l && a.push === b.push;

  /* ---------- the NBA game log's home flag ---------- */
  {
    const real = fx("gamelog-real-4278039"), rl = P.parseGamelog(real, "2026-27"), blk2 = P.statBlock(rl, "pts");
    check("home/away: ESPN's game log carries no homeAway field (a real log read 2026-11-10); the flag comes from the club he played for against the home club's id: 6 of his 12 regular-season games at home, the others away",
      !Object.keys(real.events).some(id => "homeAway" in real.events[id]) && rl.length === 12 && rl.filter(r => r.home === true).length === 6 && rl.filter(r => r.home === false).length === 6 && rl.find(r => r.id === "401909952").home === true && rl.find(r => r.id === "401909923").home === false, JSON.stringify(rl.map(r => r.home)));
    check("home/away: the home and the road average are both real again, and each counts only its own games", blk2.home > 0 && blk2.away > 0 && Math.abs(blk2.home - P.statBlock(rl.filter(r => r.home), "pts").season) < 1e-9 && Math.abs(blk2.away - P.statBlock(rl.filter(r => !r.home), "pts").season) < 1e-9, JSON.stringify([blk2.home, blk2.away]));
    check("home/away: atVs alone is enough, a neutral site follows the club's id, and an event that says neither is in neither split",
      P.homeOf({ atVs: "vs" }) === true && P.homeOf({ atVs: "@" }) === false && P.homeOf({ atVs: "vs", team: { id: "5" }, homeTeamId: "9", awayTeamId: "5" }) === false && P.homeOf({ team: { id: 9 }, homeTeamId: "9", awayTeamId: "5" }) === true && P.homeOf({ homeAway: "home" }) === true && P.homeOf({}) === null && P.homeOf(null) === null
      && (() => { const b = P.statBlock([{ home: null, pts: 20, reb: 1, ast: 1 }, { home: null, pts: 10, reb: 1, ast: 1 }], "pts"); return b.home === 0 && b.away === 0 && b.season === 15; })());
    /* the grade reads it: the same player at home and on the road projects differently once the split exists */
    const stats = {}; ["pts", "reb", "ast", "threes", "pra"].forEach(k => { stats[k] = P.statBlock(rl, k); });
    const mkp = home => ({ league: "NBA", home: home, gp: rl.length, minutes: { season: 30, l5: 30 }, stats: stats, log: rl, restDays: 2 });
    const ph = G.project(mkp(true), "pts", { leaguePA: 113 }), pa2 = G.project(mkp(false), "pts", { leaguePA: 113 });
    check("home/away: the NBA grade's home/road blend fires again (the projection at home is not the projection on the road)", ph && pa2 && ph.proj !== pa2.proj && Math.sign(ph.proj - pa2.proj) === Math.sign(stats.pts.home - stats.pts.away), JSON.stringify([ph && ph.proj, pa2 && pa2.proj, stats.pts.home, stats.pts.away]));
  }

  /* ---------- the stat lists (PROPS_DATA.leagues.<league>.stats, the page's contract) ---------- */
  {
    const nbaL = DA.leagues.NBA.stats, nflL = DA.leagues.NFL.stats, shape = s => s && Object.keys(s).join() === "key,label,short" && typeof s.label === "string" && s.label.length > 0 && s.label.charAt(0) === s.label.charAt(0).toUpperCase() && s.short === s.short.toUpperCase();
    check("stats (NBA): the five stats in display order, each { key, label, short }, the list every NBA player is graded on", JSON.stringify(nbaL) === JSON.stringify([{ key: "pts", label: "Points", short: "PTS" }, { key: "reb", label: "Rebounds", short: "REB" }, { key: "ast", label: "Assists", short: "AST" }, { key: "threes", label: "Threes", short: "3PM" }, { key: "pra", label: "Pts + Reb + Ast", short: "PRA" }])
      && JSON.stringify(G.keysOf(D.players[0], G.context(DA))) === JSON.stringify(nbaL.map(s => s.key)) && D.players.every(p => nbaL.every(s => p.stats[s.key])));
    check("stats (NFL): the shipped markets in display order, each { key, label, short }; the first five keep the names the page has built in", nflL.every(shape) && JSON.stringify(nflL.map(s => s.key)) === JSON.stringify(["passYds", "passTds", "att", "cmp", "passRushYds", "rushYds", "car", "recYds", "rec"]) && JSON.stringify(nflL.map(s => s.key)) === JSON.stringify(N.SHIPPED)
      && JSON.stringify(nflL.filter(s => N.CORE_KEYS.indexOf(s.key) !== -1).map(s => s.label)) === JSON.stringify(["Passing yards", "Passing TDs", "Rushing yards", "Receiving yards", "Receptions"]), JSON.stringify(nflL));
    const listed = nflL.map(s => s.key);
    check("stats (NFL): a stat's key is its key everywhere in the file: every player's keys are listed, and each is in his stats, his projection and every row of his log", DN.every(p => p.keys.every(k => listed.indexOf(k) !== -1 && p.stats[k] && p.proj[k] && p.log.every(r => typeof G.statVal(r, k) === "number" && r[k] === G.statVal(r, k)))));
    check("stats: the grade's context reads both lists", JSON.stringify(G.context(DA).stats) === JSON.stringify({ NBA: nbaL.map(s => s.key), NFL: listed }));
  }

  /* ---------- the 2026-11-10 markets: pass attempts, completions, passing plus rushing yards, carries ---------- */
  {
    const NEW = ["att", "cmp", "passRushYds", "car"], ctxT = G.context({ players: th.players, games: th.games, leagues: { NFL: th.summary } }), tl = pl("Trevor Lawrence");
    check("new markets: four ship and three do not, each dropped one with its reason; a dropped market is not projected for the page, not asked of the vendor and on no position's list", JSON.stringify(N.SHIPPED.filter(k => N.CORE_KEYS.indexOf(k) === -1)) === JSON.stringify(NEW) && JSON.stringify(Object.keys(N.DROPPED).sort()) === JSON.stringify(["int", "rushRecYds", "td"]) && Object.keys(N.DROPPED).every(k => /season average/.test(N.DROPPED[k]) && !N.SGO_STATS[k] && !Object.keys(N.KEYS_BY_POS).some(pos => N.KEYS_BY_POS[pos].indexOf(k) !== -1) && !th.players.some(p => p.proj[k] || p.stats[k] || (p.lines && p.lines[k]))));
    check("new markets: the vendor's stat ids", N.SGO_STATS.att === "passing_attempts" && N.SGO_STATS.cmp === "passing_completions" && N.SGO_STATS.passRushYds === "passing+rushing_yards" && N.SGO_STATS.car === "rushing_attempts" && Object.keys(N.SGO_STATS).length === 9);
    check("new markets: by position (a quarterback's attempts, completions and passing plus rushing; a back's carries)", JSON.stringify(N.KEYS_BY_POS) === JSON.stringify({ QB: ["passYds", "passTds", "att", "cmp", "passRushYds", "rushYds"], RB: ["rushYds", "car", "recYds", "rec"], WR: ["recYds", "rec"], TE: ["recYds", "rec"] }) && jb.keys.join() === "passYds,passTds,att,cmp,passRushYds" && dh.keys.join() === "rushYds,car,recYds,rec");
    check("new markets (projection): attempts and completions from the starter's volume, completions under attempts, the combined market the sum of its parts at its own level, each with quantiles and a sentence",
      jb.proj.att.mean > 25 && jb.proj.att.mean < 45 && jb.proj.cmp.mean > 0.5 * jb.proj.att.mean && jb.proj.cmp.mean < jb.proj.att.mean && /attempts a start/.test(jb.proj.att.why) && /% completed/.test(jb.proj.cmp.why) && /^passing [\d.]+ \+ rushing [\d.]+/.test(jb.proj.passRushYds.why)
      && Math.abs(jb.proj.passRushYds.mean - N.PARAMS.scale.passRushYds * (jb.proj.passYds.mean + Number(jb.proj.passRushYds.why.match(/rushing ([\d.]+)/)[1]))) < 0.6 && dh.proj.car.mean > 10 && /carries a game/.test(dh.proj.car.why)
      && NEW.every(k => th.players.filter(p => p.proj[k]).every(p => p.proj[k].dist === "ratio" && p.proj[k].q.length === 19 && p.proj[k].q.every((v, i, a) => i === 0 || v >= a[i - 1]) && Array.isArray(p.proj[k].reasons))), JSON.stringify([jb.proj.att.mean, jb.proj.cmp.mean, jb.proj.passRushYds.mean, jb.proj.passYds.mean, dh.proj.car.mean]));
    check("new markets (lines): a two-sided line on each from the vendor's ids (attempts 31.5 and completions 20.5 at six books, passing plus rushing 244.5 at four, carries 18.5 at six), each side's fair summing to one",
      jb.lines.att.line === 31.5 && jb.lines.att.over.n === 6 && jb.lines.att.under.n === 6 && jb.lines.cmp.line === 20.5 && jb.lines.cmp.over.n === 6 && jb.lines.passRushYds.line === 244.5 && jb.lines.passRushYds.over.n === 4 && jb.lines.passRushYds.under.n === 4 && dh.lines.car.line === 18.5 && dh.lines.car.under.n === 6
      && [jb.lines.att, jb.lines.cmp, jb.lines.passRushYds, dh.lines.car].every(ln => G.twoSided(ln) && Math.abs(ln.over.fair + ln.under.fair - 1) < 1e-6), JSON.stringify(Object.keys(jb.lines)));
    check("new markets (lines): the dropped markets' odds are in the response and are not read; a ladder quoted one way is not a line the board can rank", !jb.lines.int && !dh.lines.rushRecYds && !dh.lines.td && tl && tl.lines.att && tl.lines.att.under.n === 0 && !G.twoSided(tl.lines.att) && !G.boardable(tl, "att", null, ctxT));
    const sides = NEW.map(k => { const p = k === "car" ? dh : jb; return G.sideFor(p, k, G.postedLine(p, k), ctxT); });
    check("new markets (grade): each is graded at its posted line from the game data, a probability above even with its reasons, and the board can rank it", sides.every(s => s && s.prob >= 0.5 && s.prob < 1 && s.reasons.length + s.against.length + s.neutral.length >= 2 && s.hit.l10[1] >= 3) && NEW.every(k => G.boardable(k === "car" ? dh : jb, k, null, ctxT)), JSON.stringify(sides.map(s => s && [s.k, s.side, Math.round(s.prob * 1000) / 1000])));
    const repriced = JSON.parse(JSON.stringify(jb)); Object.keys(repriced.lines).forEach(k => ["over", "under"].forEach(sd => { const o = repriced.lines[k][sd]; o.odds = 250; o.fair = 0.2; Object.keys(o.books).forEach(b => { o.books[b] = 250; }); }));
    const b1 = G.bestSide(jb, { ctx: ctxT }), b2 = G.bestSide(repriced, { ctx: ctxT });
    check("new markets (grade): no price takes part: every price and fair changed, the board's side, stat and probability stay", b1 && b2 && b1.k === b2.k && b1.side === b2.side && b1.prob === b2.prob && b1.line === b2.line);
    /* the held-out check on the fixture (weeks 3-8 of 2026, settings frozen on 2025): the rule a market ships by */
    check("new markets (held-out check on the fixture): each shipped one beats the player's season average on error, and 2025's over rate as a constant and a coin flip on the Brier score",
      NEW.every(k => ev[k].n > 100 && ev[k].maeModel <= ev[k].maeBase && ev[k].brier.model < ev[k].brier.constant && ev[k].brier.model < ev[k].brier.even), JSON.stringify(NEW.map(k => [k, ev[k].n, ev[k].maeModel, ev[k].maeBase, ev[k].brier.model, ev[k].brier.constant])));
    check("new markets (held-out check): the dropped ones are still measured (so the next look is honest), and the constant is 2025's over rate per stat", Object.keys(N.DROPPED).every(k => ev[k] && ev[k].n > 100 && ev[k].brier.constant > 0) && N.STAT_KEYS.every(k => N.OVER_2025[k] > 0.2 && N.OVER_2025[k] < 0.6) && ev.int.maeModel > ev.int.maeBase, JSON.stringify(Object.keys(N.DROPPED).map(k => [k, ev[k].maeModel, ev[k].maeBase])));
  }

  /* ---------- NFL lines before game day: the surplus spender's rule, the call, the carry-over, the log line ---------- */
  {
    const t10 = Date.parse("2026-11-10T20:30:00Z"), use = used => ({ used: used, max: 2500 });
    const e1 = surplus.sgoEarly({}, use(300), t10, { cost: 13, daysAhead: 1 });
    check("early lines (spare): entities left less the protected rate times the days left less the reserve; a Sunday slate a day ahead is taken when it fits the spare and the day's pace", e1.take && e1.why === null && e1.days === 21 && e1.rate === 36 && e1.reserve === 150 && e1.spare === 2500 - 300 - 36 * 21 - 150 && e1.cap === Math.floor(2 * e1.spare / 21) && e1.room === e1.cap, JSON.stringify(e1, (k, v) => k === "cycle" ? undefined : v));
    const paced = { sgo: { cycle: "2026-12-01", days: { "2026-11-10": e1.cap - 8 }, total: e1.cap - 8, samples: [] } };
    const e2 = surplus.sgoEarly(paced, use(300), t10, { cost: 13, daysAhead: 1 });
    check("early lines (pace): what the hourly spender already spent today counts against the same day's cap", !e2.take && e2.room === 8 && /today's pace allows 8/.test(e2.why) && surplus.sgoEarly(paced, use(300), t10, { cost: 8, daysAhead: 1 }).take);
    const e3 = surplus.sgoEarly({}, use(1600), t10, { cost: 13, daysAhead: 1 });
    check("early lines (reserve): 144 entities past the protected need are all inside the 150 reserve, so nothing is spent", !e3.take && e3.spare === -6 && /spare -6 < 13/.test(e3.why));
    const e4 = surplus.sgoEarly({}, use(1593), t10, { cost: 1, daysAhead: 2 }), e5 = surplus.sgoEarly({}, use(1560), t10, { cost: 13, daysAhead: 2 });
    check("early lines (a short cycle): two days ahead must leave the day before its own call, so it gives way first", !e4.take && e4.spare === 1 && /spare 1 < 2 \(two days ahead leaves the day before its 1\)/.test(e4.why) && !e5.take && e5.spare === 34 && /today's pace allows 3/.test(e5.why));
    const late = surplus.sgoEarly({}, use(300), Date.parse("2026-11-27T20:30:00Z"), { cost: 13, daysAhead: 1 });
    check("early lines: the reserve is 50 in the cycle's last five days; three days ahead, or no game, is never read early", late.reserve === 50 && late.days === 4 && !surplus.sgoEarly({}, use(300), t10, { cost: 13, daysAhead: 3 }).take && /3 days ahead/.test(surplus.sgoEarly({}, use(300), t10, { cost: 13, daysAhead: 3 }).why) && !surplus.sgoEarly({}, use(300), t10, { cost: 0, daysAhead: 1 }).take && !surplus.sgoEarly({}, use(300), t10, { cost: 13, daysAhead: 0 }).take);
    const sampled = { sgo: { cycle: "2026-12-01", days: {}, total: 10, samples: [{ at: new Date(t10 - 864e5).toISOString(), used: 280, surplus: 5 }] } };
    check("early lines: the protected rate is read from the usage count between runs, net of what the spenders spent", surplus.sgoEarly(sampled, use(300), t10, { cost: 13, daysAhead: 1 }).rate === 15);
    /* the Wednesday afternoon run above (the main fixture run, default flags): Thursday's game is a day ahead */
    const early = LN.lines.early, st = JSON.parse(bytes(tmp, "budget.json")).sgo;
    check("early lines (run): the afternoon run reads Thursday's game a day ahead from the surplus: one entity, nine players priced, each stamped with the read; the summary names the game day and the decision",
      LN.today === false && LN.date === "2026-11-05" && LN.lines.next === "2026-11-05" && LN.lines.players === 9 && LN.lines.entities === 1 && LN.lines.at === "2026-11-04T18:00:00.000Z" && early && early.daysAhead === 1 && early.games === 1 && early.spent === 1 && early.spare === 1378 && early.cap === 102 && early.reserve === 150
      && DN.filter(p => p.lines).length === 9 && DN.filter(p => p.lines).every(p => p.linesAt === "2026-11-04T18:00:00.000Z" && !p.linesCarried) && LN.first && LN.first.matchup === "JAX @ BAL", JSON.stringify(LN.lines));
    check("early lines (run): the spend is counted in data/budget.json on the spenders' own cycle, with the decision", st.cycle === "2026-12-01" && st.days["2026-11-04"] === 1 && st.total === 1 && st.early.slate === "2026-11-05" && st.early.spent === 1 && st.early.players === 9 && st.early.why === null, JSON.stringify(st));
    check("early lines (log line): the run's line gives the spare, the rate, the days left, the reserve, the pace and what was spent", N.earlyText(LN.lines) === "; read 1 day ahead of 2026-11-05 from the SportsGameOdds surplus: spare 1378 (protected 36 a day, 27 days left, reserve 150), today's pace 102 of 102, spent 1", N.earlyText(LN.lines));
    check("early lines: only a run that prices both leagues asks (the afternoon and manual runs); the morning run (--lines nfl), --no-early and --no-lines never do", P.earlyFor({}) === true && P.earlyFor({ lines: true }) === true && P.earlyFor({ lines: ["NBA", "NFL"] }) === true && P.earlyFor({ lines: ["NFL"] }) === false && P.earlyFor({ lines: false }) === false && P.earlyFor({ early: false }) === false);
    /* a morning-type run later that day: nothing is asked, and the game keeps the lines read early */
    const wedGames = DA.games.filter(g => g.league === "NFL"), blank = () => DN.map(p => Object.assign({}, p, { lines: null, linesAt: null }));
    const am = await P.runNFL({ fixture: true, lines: ["NFL"], writeCache: false }, new Date("2026-11-04T22:00:00Z"), tmpN, DA);
    check("early lines (carry): a run that does not price the slate keeps the early lines on its players, marked carried with the time they were read, and the summary says when the lines on the page were read",
      am.summary.lines.skipped === "not a game day" && !am.summary.lines.early && am.summary.lines.at === "2026-11-04T18:00:00.000Z" && am.summary.carried === 9 && am.players.filter(p => p.lines).length === 9 && am.players.filter(p => p.lines).every(p => p.linesCarried === true && p.linesAt === "2026-11-04T18:00:00.000Z"), JSON.stringify(am.summary.lines));
    const thu = await P.runNFL({ fixture: true, lines: ["NFL"], writeCache: false }, new Date("2026-11-05T14:00:00Z"), tmpN, Object.assign({}, DA, { players: am.players }));
    check("early lines (carry): the game-day morning read replaces them (fresh lines, a new stamp, nothing carried)", thu.summary.today === true && thu.summary.lines.players === 9 && !thu.summary.lines.early && !thu.summary.carried && thu.players.filter(p => p.lines).every(p => !p.linesCarried && p.linesAt === "2026-11-05T14:00:00.000Z"));
    check("carry: a game this run priced is left as it was read: a player the books no longer quote there gets no old line back", P.carryLines([{ id: "a", gameId: "g", commence: "2026-11-05T00:00:00Z" }, { id: "b", gameId: "g", commence: "2026-11-05T00:00:00Z", lines: { pts: { line: 2 } } }], [{ id: "a", gameId: "g", lines: { pts: { line: 1 } } }], "2026-11-04T20:30:00Z").n === 0);
    check("carry: a line read after a game's start is never carried", P.carryLines([{ id: "a", gameId: "g", commence: "2026-11-05T00:00:00Z" }], [{ id: "a", gameId: "g", lines: { pts: { line: 1 } }, linesAt: "2026-11-05T00:10:00Z" }], null).n === 0 && P.carryLines([{ id: "a", gameId: "g", commence: "2026-11-05T00:00:00Z" }], [{ id: "a", gameId: "g", lines: { pts: { line: 1 } } }], "2026-11-04T20:30:00Z").n === 1 && P.carryLines([{ id: "a", gameId: "g2", commence: "2026-11-05T00:00:00Z" }], [{ id: "a", gameId: "g", lines: { pts: { line: 1 } } }], "2026-11-04T20:30:00Z").n === 0);
    /* the cycle is short: the decision is made and recorded, the vendor is never called, nothing is spent */
    const calls = { events: 0 }, tmpE = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-early-"));
    const shortSrc = { enabled: true, usage: async () => ({ used: 2330, max: 2500 }), events: async () => { calls.events++; return []; }, stats: () => ({ entities: 0 }) };
    const el = await N.attachLines(blank(), wedGames, { date: "2026-11-05", today: false }, { early: true, out: tmpE, sgoSource: shortSrc }, new Date("2026-11-04T20:30:00Z"));
    const stE = JSON.parse(bytes(tmpE, "budget.json")).sgo;
    check("early lines (a short cycle, run): nothing is asked of the vendor and nothing spent; the summary still says it is not a game day, and the decision is in the state and the log line", el.skipped === "not a game day" && el.next === "2026-11-05" && el.early.skipped === "budget" && /spare -952 < 1/.test(el.early.why) && calls.events === 0 && !stE.days["2026-11-04"] && !stE.total && stE.early.spent === 0 && /spare -952/.test(stE.early.why)
      && N.earlyText(el) === "; early lines for 2026-11-05 (1 day ahead, 1 game) not read: spare -952 < 1 | SportsGameOdds surplus: spare -952 (protected 36 a day, 27 days left, reserve 150), today's pace 0 of 0", N.earlyText(el));
    const noAsk = await N.attachLines(blank(), wedGames, { date: "2026-11-05", today: false }, { out: tmpE, sgoSource: shortSrc }, new Date("2026-11-04T14:00:00Z"));
    const noKey = await N.attachLines(blank(), wedGames, { date: "2026-11-05", today: false }, { early: true, out: tmpE, sgoSource: { enabled: false } }, new Date("2026-11-04T20:30:00Z"));
    const noUse = await N.attachLines(blank(), wedGames, { date: "2026-11-05", today: false }, { early: true, out: tmpE, sgoSource: Object.assign({}, shortSrc, { usage: async () => null }) }, new Date("2026-11-04T20:30:00Z"));
    check("early lines: a morning run does not ask; no key or an unreadable usage count spends nothing", JSON.stringify(noAsk) === JSON.stringify({ skipped: "not a game day", next: "2026-11-05" }) && N.earlyText(noAsk) === "" && noKey.early.skipped === "no key" && noUse.early.skipped === "usage unknown" && calls.events === 0);
    fs.rmSync(tmpE, { recursive: true, force: true });
  }

  /* ---------- NBA lines: only the games still to start ---------- */
  {
    const nbaG = DA.games.filter(g => g.league === "NBA").sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), fresh = () => D.players.map(p => Object.assign({}, p, { lines: null, linesAt: null }));
    const mid = fresh(), lm = await P.attachLines(mid, nbaG, { fixture: true }, new Date(Date.parse(nbaG[0].start) + 10 * 6e4));
    check("nba lines: a game that has started is not priced (an in-game number is never the line); the one still to start is, and its players are stamped", lm.of === 1 && lm.games === 1 && mid.filter(p => p.lines).length > 0 && mid.filter(p => p.lines).every(p => p.gameId === nbaG[1].id && p.linesAt), JSON.stringify(lm));
    const all = await P.attachLines(fresh(), nbaG, { fixture: true }, new Date(Date.parse(nbaG[1].start) + 6e4));
    check("nba lines: with every game started nothing is asked", all.skipped === "every game has started");
  }

  /* ---------- the record: data/props-log.json and PROPS_DATA.results ---------- */
  const tmpL = fs.mkdtempSync(path.join(os.tmpdir(), "edgeline-log-"));
  {
    const T0 = "2026-11-04T18:00:00Z", KEYS = "league,date,gameId,playerId,teamId,name,teamAbbr,oppAbbr,home,start,stat,side,line,prob,grade,l10,n,linesAt,status,actual,result";
    const RES_KEYS = "since,asOf,record,byLeague,byGrade,slates,recent,check", ROW_KEYS = "league,date,gameId,playerId,name,teamAbbr,oppAbbr,home,stat,side,line,prob,grade,rank,actual,result";
    const rL = await P.run({ fixture: true, out: tmpL, now: T0 });
    const DL = load(tmpL), log = L.readLog(tmpL), ctxL = G.context(DL), board = DL.players.map(p => G.bestSide(p, { now: Date.parse(T0), ctx: ctxL })).filter(Boolean);
    check("log: the run locks one prop per player per game, the board's own side (bestSide of js/props-grade.js on this file), for every player the board ranks and no one else",
      log.props.length === board.length && log.props.length === 14 && board.every(s => { const e = log.props.find(x => x.playerId === String(s.p.id) && x.gameId === String(s.p.gameId)); return e && e.league === s.p.league && e.stat === s.k && e.side === s.side && e.line === s.line && Math.abs(e.prob - s.prob) < 1e-4 && e.grade === s.grade.tier && e.status === "pending" && e.actual === null && e.result === null && e.linesAt === "2026-11-04T18:00:00.000Z" && Date.parse(e.linesAt) < Date.parse(e.start) && e.date === G.dayOf(s.p, ctxL) && e.home === !!s.p.home; })
      && new Set(log.props.map(L.keyOf)).size === log.props.length && rL.record.open === 14 && rL.record.added === 14, JSON.stringify([log.props.length, board.length]));
    check("log: a prop is a side, a number and a probability; no price, book or fair is stored", log.props.every(e => Object.keys(e).join() === KEYS) && !/"(odds|book|books|fair|price)"/.test(bytes(tmpL, "props-log.json")));
    const R0 = DL.results;
    check("results: written from the first run, empty until a game is graded (no record yet, nothing listed)", R0 && Object.keys(R0).join() === RES_KEYS && R0.since === null && R0.asOf === null && same3(R0.record, { w: 0, l: 0, push: 0 }) && Object.keys(R0.byLeague).length === 0 && R0.slates.length === 0 && R0.recent.length === 0 && Object.keys(R0.byGrade).join() === "High,Medium,Lean,Coin flip");
    /* idempotent: the same file and the same clock, then a later clock before any start */
    const logB = bytes(tmpL, "props-log.json"), fileB = bytes(tmpL, "props.js");
    const again = await P.track(tmpL, new Date(T0), { fixture: true }), later = await P.track(tmpL, new Date("2026-11-04T23:30:00Z"), { fixture: true });
    check("log: a run that finds nothing new changes nothing: the log and the props file are byte for byte what they were", bytes(tmpL, "props-log.json") === logB && bytes(tmpL, "props.js") === fileB && !again.file && !later.file && again.added === 0 && again.moved === 0 && later.wrote === false && later.open === 14);

    /* locking, on the log in memory: a later read before the tip moves the prop; after the tip nothing does */
    const logM = L.readLog(tmpL), Dm = load(tmpL), nawM = Dm.players.find(p => p.name === "Nickeil Alexander-Walker"), pgM = Dm.players.find(p => p.name === "Paul George"), shM = Dm.players.find(p => p.name === "Sam Hauser");
    const ent = p => logM.props.find(e => e.playerId === String(p.id) && e.gameId === String(p.gameId));
    const first = JSON.stringify(ent(nawM));
    nawM.lines = { pts: Object.assign({}, nawM.lines.pts, { line: 24.5 }) }; nawM.linesAt = "2026-11-04T23:00:00.000Z";
    const m1 = L.lock(logM, Dm, Date.parse("2026-11-04T23:05:00Z"));
    check("log (locking): a later read before the start replaces the prop: the board's side on the last lines read before his game", m1.moved === 1 && m1.added === 0 && m1.removed === 0 && ent(nawM).stat === "pts" && ent(nawM).line === 24.5 && ent(nawM).linesAt === "2026-11-04T23:00:00.000Z" && JSON.stringify(ent(nawM)) !== first, JSON.stringify(ent(nawM)));
    const locked = JSON.stringify(ent(nawM)), others = JSON.stringify(logM.props);
    nawM.lines = { pts: Object.assign({}, nawM.lines.pts, { line: 30.5 }) }; nawM.linesAt = "2026-11-05T00:20:00.000Z";
    const m2 = L.lock(logM, Dm, Date.parse("2026-11-05T00:20:00Z"));           /* his game tipped at 00:00Z */
    delete nawM.lines; const m3 = L.lock(logM, Dm, Date.parse("2026-11-05T00:22:00Z"));
    Dm.players = Dm.players.filter(p => p !== nawM); const m4 = L.lock(logM, Dm, Date.parse("2026-11-05T00:24:00Z"));
    check("log (locking): once his game has started nothing moves a prop: not a new line, not a line taken down, not the player leaving the file", JSON.stringify(ent(nawM)) === locked && !m2.changed && !m3.changed && !m4.changed && JSON.stringify(logM.props) === others);
    delete pgM.lines; const m5 = L.lock(logM, Dm, Date.parse("2026-11-05T00:26:00Z")); /* MIL @ BOS tips at 00:30Z */
    check("log (locking): a player the board stops ranking before his game starts is taken back out (his line was pulled)", m5.removed === 1 && !ent(pgM) && !!ent(shM));
    delete shM.lines; const m6 = L.lock(logM, Dm, Date.parse("2026-11-05T00:31:00Z"));
    check("log (locking): the same thing a minute after the tip changes nothing", !m6.changed && !!ent(shM));
    /* a prop is locked at the start it was locked against: a file that later shows the game an hour on, with other lines, does not reopen it */
    const Dr = load(tmpL), shR = Dr.players.find(p => p.name === "Sam Hauser"), wasR = JSON.stringify(ent(shM));
    Dr.games.forEach(g => { if (g.id === shR.gameId) g.start = "2026-11-05T01:30Z"; }); Dr.players.forEach(p => { if (p.gameId === shR.gameId) p.commence = "2026-11-05T01:30Z"; });
    Object.keys(shR.lines).forEach(k => { shR.lines[k] = Object.assign({}, shR.lines[k], { line: shR.lines[k].line + 3 }); });
    const m7 = L.lock(logM, Dr, Date.parse("2026-11-05T00:40:00Z"));
    check("log (locking): a prop stays locked at the start it was locked against, whatever a later file says about the game's time or lines", JSON.stringify(ent(shM)) === wasR && m7.moved === 0 && m7.removed === 0);
    const cold = L.emptyLog(), c1 = L.lock(cold, load(tmpL), Date.parse("2026-11-05T00:45:00Z"));
    check("log (locking): a first run after a game has started locks nothing for it (lines seen after a start are never a prop); games still ahead lock as usual", cold.props.length > 0 && cold.props.every(e => e.league === "NFL" && Date.parse(e.start) > Date.parse("2026-11-05T00:45:00Z")) && c1.added === cold.props.length);
    const stamped = load(tmpL), late1 = stamped.players.find(p => p.name === "Paul George"); late1.linesAt = "2026-11-05T00:45:00.000Z"; /* a stamp from after his 00:30Z tip */
    const coldS = L.emptyLog(); L.lock(coldS, stamped, Date.parse(T0));
    check("log (locking): lines stamped after a game's start are never a prop, even in a file that calls the game open", coldS.props.length === 13 && !coldS.props.some(e => e.playerId === String(late1.id)));
    check("log (locking): sample data is never locked", L.lock(L.emptyLog(), Object.assign({}, load(tmpL), { sample: true }), Date.parse(T0)).added === 0);

    /* grading from the real box scores (ESPN's summaries of the two fixture games, trimmed) */
    const base = L.fixtureSource(), asked = [], counting = Object.assign({}, base, { nbaSummary: async id => { asked.push(id); return base.nbaSummary(id); }, nflSummary: async id => { asked.push(id); return base.nflSummary(id); } });
    const live = await P.track(tmpL, new Date("2026-11-05T01:15:00Z"), { resultsSource: counting });
    check("grading: no box score is asked for before a game can have ended, and a prop in a game under way waits, locked", asked.length === 0 && live.graded === 0 && live.locked === 5 && live.open === 9 && bytes(tmpL, "props-log.json") === logB, JSON.stringify(live));
    const g1 = await P.track(tmpL, new Date("2026-11-05T05:30:00Z"), { resultsSource: counting });
    const D1 = load(tmpL), R1 = D1.results, row = n => R1.recent.find(r => r.name === n);
    const LOG1 = L.readLog(tmpL);
    check("grading (NBA): both games graded from their box scores, one request a game: five props, 3 wins and 2 losses", asked.sort().join() === "401909923,401909924" && g1.graded === 5 && g1.voided === 0 && g1.games === 2 && g1.file === true && same3(R1.record, { w: 3, l: 2, push: 0 }), JSON.stringify(g1));
    check("grading (NBA): an under that finished below its line wins, an over that finished below it loses, each with the box score's number",
      row("Nickeil Alexander-Walker").stat === "ast" && row("Nickeil Alexander-Walker").side === "under" && row("Nickeil Alexander-Walker").line === 3.5 && row("Nickeil Alexander-Walker").actual === 2 && row("Nickeil Alexander-Walker").result === "Win"
      && row("Luguentz Dort").side === "over" && row("Luguentz Dort").line === 8.5 && row("Luguentz Dort").actual === 6 && row("Luguentz Dort").result === "Loss" && row("Paul George").actual === 5 && row("Paul George").result === "Win", JSON.stringify(R1.recent.map(r => [r.name, r.stat, r.side, r.line, r.actual, r.result])));
    check("results (contract): since is the first graded slate's Eastern day, asOf when the results were written, and the record, byLeague and byGrade count the same props",
      Object.keys(R1).join() === RES_KEYS && R1.since === "2026-11-04" && R1.asOf === "2026-11-05T05:30:00.000Z" && Object.keys(R1.record).join() === "w,l,push" && Object.keys(R1.byLeague).join() === "NBA" && same3(sum3(R1.byLeague), R1.record) && same3(sum3(R1.byGrade), R1.record)
      && Object.keys(R1.byGrade).every(t => ["High", "Medium", "Lean", "Coin flip"].indexOf(t) !== -1 && Object.keys(R1.byGrade[t]).join() === "w,l,push") && JSON.stringify(R1.slates) === JSON.stringify([{ league: "NBA", date: "2026-11-04", w: 3, l: 2, push: 0 }]), JSON.stringify([R1.since, R1.asOf, R1.record, R1.byLeague, R1.byGrade, R1.slates]));
    /* the check (2026-11-11): the record against what the board stated, read by the play and parlay of the day */
    const dayT = LOG1.days["NBA|2026-11-04"], heldT = LOG1.props.filter(e => e.status === "graded" && e.league === "NBA" && e.date === "2026-11-04" && (e.result === "Win" || e.result === "Loss"));
    check("results.check: a day's tally carries the sum of the stated chances of its props decided win or loss, and check says how much of the stated edge the record bears out (empty before anything is graded)",
      dayT && Math.abs(dayT.stated - heldT.reduce((a, e) => a + e.prob, 0)) < 1e-3 && R0.check && R0.check.all.n === 0 && R0.check.all.keep === 0.3 && !R0.check.NBA
      && R1.check.all.n === dayT.w + dayT.l && R1.check.NBA.n === R1.check.all.n && Math.abs(R1.check.NBA.hit - dayT.w / (dayT.w + dayT.l)) < 1e-3 && Math.abs(R1.check.NBA.stated - dayT.stated / (dayT.w + dayT.l)) < 1e-3
      && R1.check.NBA.keep >= 0 && R1.check.NBA.keep <= 1 && Math.abs(R1.check.NBA.keep - 0.3) < 0.05, JSON.stringify([dayT, R0.check, R1.check]));
    check("results (contract): each recent row has exactly the contract's fields, the tier is the data's name for the probability as ranked, the rank is the place on that day's board (1 the likeliest), and no row carries a price",
      R1.recent.length === 5 && R1.recent.every(r => Object.keys(r).join() === ROW_KEYS && r.league === "NBA" && r.date === "2026-11-04" && typeof r.gameId === "string" && typeof r.playerId === "string" && D1.players.some(p => String(p.id) === r.playerId && String(p.gameId) === r.gameId && p.teamAbbr === r.teamAbbr && p.oppAbbr === r.oppAbbr && !!p.home === r.home)
        && (r.side === "over" || r.side === "under") && typeof r.line === "number" && r.prob >= 0.5 && r.prob < 1 && r.grade === G.gradeOf(r.prob).tier && typeof r.actual === "number" && /^(Win|Loss|Push|Void)$/.test(r.result))
      && R1.recent.map(r => r.rank).join() === "1,2,3,4,5" && R1.recent.every((r, i, a) => i === 0 || r.prob <= a[i - 1].prob), JSON.stringify(R1.recent[0]));
    const logG = bytes(tmpL, "props-log.json"), fileG = bytes(tmpL, "props.js"), n0 = asked.length;
    const g2 = await P.track(tmpL, new Date("2026-11-05T05:30:00Z"), { resultsSource: counting }), g3 = await P.track(tmpL, new Date("2026-11-05T09:00:00Z"), { resultsSource: counting });
    check("grading: idempotent: a second run, and one hours later, ask for nothing, grade nothing and leave both files byte for byte", bytes(tmpL, "props-log.json") === logG && bytes(tmpL, "props.js") === fileG && asked.length === n0 && g2.graded === 0 && g3.graded === 0 && !g2.file && !g3.file && same3(g3.record, R1.record));
    /* Thursday: the morning run reads the NFL's game-day lines; the NBA games are over and stay in the file */
    const rT = await P.run({ fixture: true, out: tmpL, now: "2026-11-05T14:00:00Z", lines: ["NFL"] });
    const DT = load(tmpL), logT = L.readLog(tmpL), nflP = logT.props.filter(e => e.league === "NFL");
    check("log: the game-day morning read moves the NFL's props onto the lines just read (the last before the start); the graded NBA props do not move", nflP.length === 9 && nflP.every(e => e.status === "pending" && e.linesAt === "2026-11-05T14:00:00.000Z") && rT.record.moved === 9 && rT.record.added === 0 && logT.props.filter(e => e.league === "NBA").every(e => e.status === "graded") && same3(DT.results.record, R1.record));
    check("results: a graded game still in the file keeps all its graded rows in recent (the page swaps each started player's row for his result); its players keep the lines read before the start", DT.games.filter(g => g.league === "NBA").length === 2 && DT.results.recent.length === 5 && DT.results.recent.every(r => DT.players.some(p => String(p.id) === r.playerId && String(p.gameId) === r.gameId)) && DT.lines.skipped === "off" && DT.lines.carried === 5 && DT.lines.at === "2026-11-04T18:00:00.000Z" && DT.players.filter(p => p.league === "NBA" && p.lines).every(p => p.linesCarried && p.linesAt === "2026-11-04T18:00:00.000Z"), JSON.stringify(DT.lines));
    const g4 = await P.track(tmpL, new Date("2026-11-06T06:00:00Z"), { resultsSource: counting });
    const D4 = load(tmpL), R4 = D4.results, nfl4 = R4.recent.filter(r => r.league === "NFL"), row4 = n => R4.recent.find(r => r.name === n);
    check("grading (NFL): Thursday's game graded from its box score (not in the cache yet, so ESPN's summary): 8 props decided, 3 wins and 5 losses", g4.graded === 8 && g4.voided === 1 && g4.games === 1 && same3(R4.byLeague.NFL, { w: 3, l: 5, push: 0 }) && nfl4.length === 9 && row4("Derrick Henry").stat === "rushYds" && row4("Derrick Henry").side === "under" && row4("Derrick Henry").actual === 57 && row4("Derrick Henry").result === "Win" && row4("Trevor Lawrence").stat === "passTds" && row4("Trevor Lawrence").actual === 1 && row4("Trevor Lawrence").result === "Loss", JSON.stringify(nfl4.map(r => [r.name, r.stat, r.side, r.line, r.actual, r.result])));
    check("grading (NFL, void): the quarterback the board ranked did not play (ESPN's game roster says so): his prop is void, with no number, and in no record", row4("Jacoby Brissett").result === "Void" && row4("Jacoby Brissett").actual === null && row4("Jacoby Brissett").rank >= 1 && R4.record.w + R4.record.l + R4.record.push === 13 && logT.props.length === 14);
    check("results (contract, two leagues): byLeague and byGrade each add up to the record, slates are one a league and game day, newest first, and recent holds each league's latest graded day",
      same3(R4.record, { w: 6, l: 7, push: 0 }) && same3(sum3(R4.byLeague), R4.record) && same3(sum3(R4.byGrade), R4.record) && JSON.stringify(R4.slates) === JSON.stringify([{ league: "NFL", date: "2026-11-05", w: 3, l: 5, push: 0 }, { league: "NBA", date: "2026-11-04", w: 3, l: 2, push: 0 }]) && R4.since === "2026-11-04" && R4.asOf === "2026-11-06T06:00:00.000Z"
      && R4.recent.length === 14 && R4.recent.every(r => Object.keys(r).join() === ROW_KEYS) && nfl4.map(r => r.rank).join() === "1,2,3,4,5,6,7,8,9" && R4.recent.filter(r => r.league === "NBA").map(r => r.rank).join() === "1,2,3,4,5", JSON.stringify([R4.record, R4.byLeague, R4.byGrade, R4.slates]));
    check("log: after every game is graded the run's line counts nothing open and nothing waiting", g4.open === 0 && g4.locked === 0 && /this run graded 8 and voided 1 in 1 game .*record 6-7 since 2026-11-04$/.test(P.recordText(g4)), P.recordText(g4));
  }

  /* every outcome, on box scores built here */
  {
    const NOW = new Date("2026-11-05T06:00:00Z");
    const mk = o => Object.assign({ league: "NBA", date: "2026-11-04", gameId: "g1", playerId: "1", teamId: "1", name: "A", teamAbbr: "AAA", oppAbbr: "BBB", home: true, start: "2026-11-05T00:00:00.000Z", stat: "pts", side: "over", line: 20.5, prob: 0.6, grade: "Lean", l10: 0.6, n: 10, linesAt: "2026-11-04T20:30:00.000Z", status: "pending", actual: null, result: null }, o);
    const KEYS5 = ["minutes", "points", "rebounds", "assists", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"];
    const ath = (id, stats, dnp) => ({ athlete: { id: id, displayName: "P" + id }, didNotPlay: !!dnp, stats: dnp ? [] : stats });
    const filler = Array.from({ length: 10 }, (x, i) => ath("9" + i, ["20", "8", "3", "2", "1-3"]));
    const summary = (state, athletes) => ({ header: { competitions: [{ status: { type: state } }] }, boxscore: { players: [{ statistics: [{ keys: KEYS5, athletes: athletes }] }] } });
    const FINAL = { name: "STATUS_FINAL", completed: true };
    const boxes = {
      g1: summary(FINAL, filler.concat([ath("1", ["34", "25", "5", "4", "2-6"]), ath("2", ["30", "25", "5", "4", "2-6"]), ath("3", ["36", "12", "10", "8", "0-2"]), ath("4", ["28", "9", "2", "1", "1-5"]), ath("5", [], true)])),
      g3: summary({ name: "STATUS_IN_PROGRESS", completed: false }, []), g4: summary({ name: "STATUS_POSTPONED", completed: false }, [])
    };
    const C = N.C, nflRow = (id, o) => { const r = [id, "33", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; Object.keys(o || {}).forEach(k => { r[C[k]] = o[k]; }); return r; };
    const cache = { games: { g2: { r: Array.from({ length: 10 }, (x, i) => nflRow("8" + i, { tgt: 3, rec: 2, wyd: 20 })).concat([nflRow("q1", { tgt: 7, rec: 5, wyd: 55 }), nflRow("q5", { att: 30, cmp: 20, pyd: 210, car: 4, ryd: 31 })]) } } };
    const rosterCalls = [];
    const src = { nbaSummary: async id => boxes[id] || null, nflSummary: async () => null, nflGameRoster: async (id, team) => { rosterCalls.push(team); return team === "33" ? { entries: [{ playerId: "q2", valid: true, didNotPlay: false }, { playerId: "q3", valid: false, didNotPlay: true }, { playerId: "q6", valid: false, didNotPlay: false }] } : null; }, count: () => 0 };
    const nflE = o => mk(Object.assign({ league: "NFL", gameId: "g2", teamId: "33", stat: "recYds", line: 40.5 }, o));
    const log = L.emptyLog();
    log.props = [
      mk({ playerId: "1" }),                                                   /* over 20.5, scored 25: Win */
      mk({ playerId: "2", side: "under" }),                                    /* under 20.5, scored 25: Loss */
      mk({ playerId: "3", stat: "pra", line: 30, grade: "High", prob: 0.72 }), /* 12 + 10 + 8 = 30 on a line of 30: Push */
      mk({ playerId: "4", stat: "threes", side: "under", line: 2.5 }),         /* made 1 of 5: Win */
      mk({ playerId: "5" }),                                                   /* did not play: Void */
      mk({ playerId: "6" }),                                                   /* not in the box score: Void */
      nflE({ playerId: "q1" }),                                                /* 55 receiving yards over 40.5: Win */
      nflE({ playerId: "q2", stat: "rec", side: "under", line: 2.5 }),         /* no line in the box score, but he played: 0 catches, Win */
      nflE({ playerId: "q3" }),                                                /* dressed, did not play: Void */
      nflE({ playerId: "q6" }),                                                /* inactive: Void */
      nflE({ playerId: "q7" }),                                                /* not on the game's roster: Void */
      nflE({ playerId: "q4", teamId: "9" }),                                   /* his club's roster cannot be read: waits */
      nflE({ playerId: "q5", stat: "passRushYds", line: 240.5, grade: "Medium", prob: 0.63 }), /* 210 + 31 = 241 over 240.5: Win */
      mk({ gameId: "g3", playerId: "7" }),                                     /* game under way: waits */
      mk({ gameId: "g4", playerId: "8" }),                                     /* postponed: Void */
      mk({ gameId: "g5", playerId: "9", start: "2026-10-27T00:00:00.000Z", date: "2026-10-26" }), /* nothing settled it in a week: dropped */
      mk({ gameId: "g6", playerId: "10", start: "2026-11-05T05:00:00.000Z" })  /* started an hour ago: not asked yet */
    ];
    const gr = await L.grade(log, NOW, { source: src, nflCache: cache });
    const res = id => { const e = log.props.find(x => x.playerId === id); return e ? [e.status, e.result, e.actual].join("|") : "gone"; };
    check("outcomes: Win (an over above the line, an under below it), Loss, Push (finished on the line) and Void (did not play), from the box score",
      res("1") === "graded|Win|25" && res("2") === "graded|Loss|25" && res("3") === "graded|Push|30" && res("4") === "graded|Win|1" && res("5") === "graded|Void|" && res("6") === "graded|Void|", JSON.stringify(["1", "2", "3", "4", "5", "6"].map(res)));
    check("outcomes (NFL): a line in the box score is the number (a combined market its sum); with no line, ESPN's game roster decides: played means zero, dressed without playing, inactive or absent means void; a roster that cannot be read waits",
      res("q1") === "graded|Win|55" && res("q5") === "graded|Win|241" && res("q2") === "graded|Win|0" && res("q3") === "graded|Void|" && res("q6") === "graded|Void|" && res("q7") === "graded|Void|" && res("q4") === "pending||" && rosterCalls.join() === "33,9", JSON.stringify(["q1", "q5", "q2", "q3", "q6", "q7", "q4"].map(res)) + " " + rosterCalls.join());
    check("outcomes: a game under way waits, a game called off is void, one started within the hour is not asked for, and a prop nothing settles in a week is dropped, never guessed", res("7") === "pending||" && res("8") === "graded|Void|" && res("10") === "pending||" && res("9") === "gone" && gr.dropped === 1 && gr.graded === 7 && gr.voided === 6 && gr.waiting === 2, JSON.stringify(gr));
    check("outcomes: resultOf, side by side", L.resultOf("over", 20.5, 21) === "Win" && L.resultOf("over", 20.5, 20) === "Loss" && L.resultOf("under", 20.5, 20) === "Win" && L.resultOf("under", 20.5, 21) === "Loss" && L.resultOf("over", 5, 5) === "Push" && L.resultOf("under", 5, 5) === "Push" && L.resultOf("over", 0.5, 0) === "Loss" && L.resultOf("under", 0.5, 0) === "Win" && L.resultOf("over", 5, null) === "Void");
    const R = L.results(log, { games: [] });
    check("results: a void is in no record; a push is its own column; byLeague and byGrade each add up to the record", same3(R.record, { w: 5, l: 1, push: 1 }) && same3(R.byLeague.NBA, { w: 2, l: 1, push: 1 }) && same3(R.byLeague.NFL, { w: 3, l: 0, push: 0 }) && same3(sum3(R.byLeague), R.record) && same3(sum3(R.byGrade), R.record) && same3(R.byGrade.High, { w: 0, l: 0, push: 1 }) && same3(R.byGrade.Medium, { w: 1, l: 0, push: 0 }) && same3(R.byGrade.Lean, { w: 4, l: 1, push: 0 })
      && R.recent.filter(r => r.result === "Void").length === 6 && R.recent.filter(r => r.result === "Void").every(r => r.actual === null) && R.recent.length === 13 && R.asOf === NOW.toISOString() && R.since === "2026-11-04", JSON.stringify([R.record, R.byLeague, R.byGrade]));
    const text = L.serialise(log), gr2 = await L.grade(log, NOW, { source: src, nflCache: cache });
    check("outcomes: grading again changes nothing (a graded prop is never re-read)", L.serialise(log) === text && !gr2.changed && gr2.graded === 0 && gr2.voided === 0 && gr2.waiting === 2);
    check("log: the file is valid JSON, one prop a line, and reads back as it was written", JSON.stringify(JSON.parse(text).props) === JSON.stringify(log.props.slice().sort((a, b) => JSON.parse(text).props.findIndex(e => L.keyOf(e) === L.keyOf(a)) - JSON.parse(text).props.findIndex(e => L.keyOf(e) === L.keyOf(b)))) && text.split("\n").filter(l => /^ {2}\{"league"/.test(l)).length === log.props.length);
    /* a run holds its new props after the old ones and the file holds them sorted: the tallies must not depend on which */
    const turned = JSON.parse(text); turned.props.reverse(); L.rebuildDays(turned);
    check("log: the bytes do not depend on the order the props are held in (each day's tiers are written in one fixed order)", L.serialise(turned) === text);
    /* the rolling window: the rows go after RULES.keepDays, the day's tally and the record stay */
    const before = JSON.stringify(L.results(log, { games: [] }).record), kept = log.props.length;
    await L.grade(log, new Date(NOW.getTime() + (L.RULES.keepDays + 2) * 864e5), { source: src, nflCache: cache });
    const RW = L.results(log, { games: [] });
    check("log (rolling window): after " + L.RULES.keepDays + " days a graded prop's row leaves the log; its day's tally stays, so the record and the slates do not move", log.props.length < kept && !log.props.some(e => e.status === "graded") && JSON.stringify(RW.record) === before && RW.slates.length === 2 && RW.since === "2026-11-04" && RW.recent.length === 0 && same3(sum3(RW.byGrade), RW.record), JSON.stringify([log.props.length, RW.record, RW.slates]));
  }
  fs.rmSync(tmpL, { recursive: true, force: true });
  fs.rmSync(tmpN, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
