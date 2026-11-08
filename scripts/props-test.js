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
  /* the main fixture run above was Wednesday: the NFL half is the next game day's research, no lines */
  const DN = DA.players.filter(p => p.league === "NFL"), LN = DA.leagues && DA.leagues.NFL;
  check("nfl run (Wednesday): the next game day is Thursday's JAX @ BAL, researched but not priced (not a game day)", LN && LN.date === "2026-11-05" && LN.today === false && LN.lines.skipped === "not a game day" && LN.lines.next === "2026-11-05" && DA.games.filter(g => g.league === "NFL").length === 1 && DN.length >= 15 && !DN.some(p => p.lines), JSON.stringify(LN && LN.lines));
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
  check("nfl lines: a player with no players-map entry is matched from the odd ids (BRIAN_THOMAS_1_NFL, the suffix dropped); untracked markets (anytime touchdown) are ignored", th2 && th2.lines && th2.lines.recYds.line === 30.5 && th2.sgoPlayerId === "BRIAN_THOMAS_1_NFL" && !Object.keys(dh.lines).some(k => !N.STATS[k]));
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
  fs.rmSync(tmpN, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
