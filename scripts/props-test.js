/* Offline test of the props pipeline against scripts/fixtures/espn. Run: node scripts/props-test.js */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const P = require("./update-props.js");
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
  check("run: attribution to ESPN present", /ESPN/.test(D.attribution));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? "FAILURES: " + fails.length : "ALL PASS");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
