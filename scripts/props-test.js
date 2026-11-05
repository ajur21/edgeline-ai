/* Offline test of the props pipeline against scripts/fixtures/espn. Run: node scripts/props-test.js */
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
  const D = sandbox.window.PROPS_DATA;
  check("run: writes props.js with games and players", D.games.length === 2 && D.players.length >= 4 && r.players === D.players.length, "players " + r.players);
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
  check("run: --no-lines skips the odds call and writes no lines", r2.lines.skipped === "off" && (() => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(tmp2, "props.js"), "utf8"), sb); return !sb.window.PROPS_DATA.players.some(p => p.lines); })());
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
  fs.rmSync(tmp3, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
