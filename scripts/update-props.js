/* ==========================================================================
   EdgeLine AI — NBA props research data
   Builds data/props.js from ESPN's public (undocumented) endpoints: today's
   games, rosters with headshots and injury status, each rotation player's
   last games, and every team's points allowed for a defence ranking. Then,
   when SGO_API_KEY is set, one SportsGameOdds call for tonight's games (one
   entity per game) attaches every player's lines: the consensus line per stat,
   each book's price on it for over and under, and the de-vigged fair
   probability per side. Without lines the page still lets the visitor type
   one. Signals ("confluences") compare a player's recent form, home/away
   split, minutes, rest and opponent defence.

   Run:   node scripts/update-props.js            (hits ESPN, ~300-450 requests, polite delay; + 1 SportsGameOdds call)
   Test:  node scripts/update-props.js --fixture  (reads scripts/fixtures/espn/ and fixtures/sgo/NBA-props.json)
   Flags: --out <dir>  --now <iso>  --cache <dir> (save raw responses)  --teams <n> (limit, for quick runs)  --no-lines (skip the odds call)
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const sgo = require("./sgo.js");

const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const RULES = { minMinutes: 14, playersPerTeam: 9, logGames: 10, delayMs: 90, sgoReserve: 150 /* SportsGameOdds entities never spent (shared with update-data.js) */ };
const STATS = { pts: "points", reb: "totalRebounds", ast: "assists", threes: "threePointFieldGoalsMade-threePointFieldGoalsAttempted" };
const ET = "America/New_York";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function round(n, d) { const m = Math.pow(10, d == null ? 1 : d); return Math.round(n * m) / m; }
function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function sd(a) { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) * (x - m)))); }
function etDate(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function startLabel(d) { return new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d) + " ET"; }

/* ---------- sources ---------- */
function liveSource(cacheDir) {
  let n = 0;
  async function get(url, name) {
    await sleep(RULES.delayMs); n++;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("ESPN " + res.status + " for " + url);
    const json = await res.json();
    if (cacheDir) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(path.join(cacheDir, name + ".json"), JSON.stringify(json)); }
    return json;
  }
  return {
    scoreboard: () => get(SITE + "/scoreboard", "scoreboard"),
    roster: id => get(SITE + "/teams/" + id + "/roster", "roster-" + id),
    schedule: id => get(SITE + "/teams/" + id + "/schedule", "schedule-" + id),
    gamelog: id => get(WEB + "/athletes/" + id + "/gamelog", "gamelog-" + id),
    teams: () => get(SITE + "/teams?limit=40", "teams"),
    count: () => n
  };
}
function fixtureSource() {
  const dir = path.join(__dirname, "fixtures", "espn");
  const read = n => { const f = path.join(dir, n + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
  return { scoreboard: async () => read("scoreboard"), roster: async id => read("roster-" + id), schedule: async id => read("schedule-" + id), gamelog: async id => read("gamelog-" + id), teams: async () => read("teams"), count: () => 0 };
}

/* ---------- parsing ---------- */
function parseScoreboard(sb) {
  return (sb.events || []).map(function (e) {
    const c = e.competitions[0];
    const side = ha => { const t = c.competitors.find(x => x.homeAway === ha).team; return { id: t.id, abbr: t.abbreviation, name: t.displayName, logo: t.logo }; };
    return { id: e.id, start: e.date, status: e.status && e.status.type && e.status.type.name, home: side("home"), away: side("away") };
  });
}
/* points allowed per game from a team's completed games this season */
function pointsAllowed(sched, teamId) {
  const vals = [];
  (sched && sched.events || []).forEach(function (e) {
    const c = e.competitions && e.competitions[0]; if (!c || !c.competitors) return;
    const done = c.status && c.status.type && c.status.type.completed; if (!done) return;
    if (e.season && e.season.type && e.season.type !== 2) return; /* regular season only */
    const opp = c.competitors.find(x => x.team && x.team.id !== teamId);
    const v = opp && opp.score && Number(opp.score.value != null ? opp.score.value : opp.score.displayValue);
    if (Number.isFinite(v)) vals.push(v);
  });
  return { games: vals.length, ptsAllowed: vals.length ? round(avg(vals), 1) : null };
}
/* NBA seasons are labelled "2026-27"; a date in Oct-Dec belongs to the season starting that year, Jan-Sep to the one before */
function seasonLabel(d) { const y = d.getUTCFullYear(), m = d.getUTCMonth(); const start = m >= 9 ? y : y - 1; return start + "-" + String(start + 1).slice(2); }
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
/* a player's current regular-season log, newest first: [{date, opp, home, result, min, pts, reb, ast, threes}] */
function parseGamelog(g, season) {
  if (!g || !g.names) return [];
  const idx = {}; g.names.forEach((n, i) => { idx[n] = i; });
  const col = (stats, name) => { const v = stats[idx[name]]; if (v == null) return null; const s = String(v).split("-")[0]; const n = Number(s); return Number.isFinite(n) ? n : null; };
  const out = [];
  const regular = (g.seasonTypes || []).filter(st => /Regular Season/i.test(st.displayName || ""));
  const current = regular.find(st => season && String(st.displayName).indexOf(season) === 0) || null;
  if (!current) return []; /* no games yet this season */
  [current].forEach(function (st) {
    (st.categories || []).forEach(function (cat) {
      (cat.events || []).forEach(function (ev) {
        const meta = g.events && g.events[ev.eventId]; if (!meta) return;
        out.push({ id: ev.eventId, date: String(meta.gameDate || "").slice(0, 10), opp: meta.opponent && meta.opponent.abbreviation, home: meta.homeAway === "home", result: meta.gameResult || null, score: meta.score || null,
          min: col(ev.stats, "minutes"), pts: col(ev.stats, STATS.pts), reb: col(ev.stats, STATS.reb), ast: col(ev.stats, STATS.ast), threes: col(ev.stats, STATS.threes) });
      });
    });
  });
  return out.filter(r => r.min != null).sort((a, b) => a.date < b.date ? 1 : -1);
}

/* ---------- signals ---------- */
function statBlock(log, key) {
  const all = log.map(r => key === "pra" ? r.pts + r.reb + r.ast : r[key]).filter(v => v != null);
  const l5 = all.slice(0, 5), l10 = all.slice(0, 10);
  const home = log.filter(r => r.home).map(r => key === "pra" ? r.pts + r.reb + r.ast : r[key]), away = log.filter(r => !r.home).map(r => key === "pra" ? r.pts + r.reb + r.ast : r[key]);
  return { season: round(avg(all)), l5: round(avg(l5)), l10: round(avg(l10)), home: round(avg(home)), away: round(avg(away)), sd: round(sd(l10)), last: l10 };
}
function signals(p) {
  const out = [];
  const trend = (k, label) => { const s = p.stats[k]; if (!s || s.season < 1 || p.gp < 3) return; const d = s.l5 / s.season - 1; if (d >= 0.12) out.push({ key: k, label: label + " up " + Math.round(d * 100) + "% last 5", lean: "over" }); else if (d <= -0.12) out.push({ key: k, label: label + " down " + Math.round(-d * 100) + "% last 5", lean: "under" }); };
  trend("pts", "Points"); trend("reb", "Rebounds"); trend("ast", "Assists"); trend("threes", "Threes");
  if (p.minutes.season >= 10 && p.gp >= 3) { const d = p.minutes.l5 / p.minutes.season - 1; if (d >= 0.1) out.push({ key: "min", label: "Minutes up: " + p.minutes.l5 + " last 5 vs " + p.minutes.season + " season", lean: "over" }); else if (d <= -0.1) out.push({ key: "min", label: "Minutes down: " + p.minutes.l5 + " last 5 vs " + p.minutes.season + " season", lean: "under" }); }
  const split = p.home ? p.stats.pts.home : p.stats.pts.away, other = p.home ? p.stats.pts.away : p.stats.pts.home;
  if (split && other && p.gp >= 4) { const d = split / other - 1; if (d >= 0.12) out.push({ key: "split", label: (p.home ? "Home" : "Road") + " scorer: " + split + " vs " + other + " " + (p.home ? "away" : "at home"), lean: "over" }); else if (d <= -0.12) out.push({ key: "split", label: "Scores less " + (p.home ? "at home" : "on the road") + ": " + split + " vs " + other, lean: "under" }); }
  if (p.b2b) out.push({ key: "rest", label: "Second night of a back-to-back", lean: "under" });
  else if (p.restDays >= 3 && p.restDays <= 10) out.push({ key: "rest", label: p.restDays + " days' rest", lean: "over" });
  else if (p.restDays > 10) out.push({ key: "rest", label: "First game in " + p.restDays + " days", lean: "neutral" });
  if (p.opp && p.opp.rank) { if (p.opp.rank <= 8) out.push({ key: "opp", label: p.oppAbbr + " allows " + p.opp.ptsAllowed + " pts/g (" + ordinal(p.opp.rank) + " most)", lean: "over" }); else if (p.opp.rank >= 23) out.push({ key: "opp", label: p.oppAbbr + " allows only " + p.opp.ptsAllowed + " pts/g (" + ordinal(31 - p.opp.rank) + " fewest)", lean: "under" }); }
  if (p.stats.pts.sd && p.stats.pts.l10 && p.stats.pts.sd / p.stats.pts.l10 <= 0.22 && p.gp >= 5) out.push({ key: "steady", label: "Steady scorer: ±" + p.stats.pts.sd + " over last 10", lean: "neutral" });
  if (p.injury) out.push({ key: "injury", label: "Injury report: " + p.injury, lean: "under" });
  return out;
}

/* ---------- lines: one SportsGameOdds call for the night, every player prop rides along ---------- */
async function attachLines(players, games, opts, now) {
  if (opts.lines === false || !games.length) return { skipped: opts.lines === false ? "off" : "no games" };
  const src = sgo.source({ fixture: opts.fixture, fixtureName: "NBA-props" });
  if (!src.enabled) return { skipped: "no key" };
  const usage = await src.usage();
  if (usage && usage.max && usage.max - usage.used - games.length < RULES.sgoReserve) return { skipped: "budget", used: usage.used, max: usage.max };
  let list;
  try { list = await sgo.nightEvents(src, "NBA", games.map(g => g.start)); } catch (e) { return { skipped: e.message }; }
  try { return readLines(list); } catch (e) { return { skipped: e.message, entities: src.stats().entities }; }
  function readLines(list) {
  const byGame = {}; let matched = 0;
  games.forEach(g => { const ev = sgo.eventFor(list, g.home.name, g.away.name); if (ev) { byGame[g.id] = { ev: ev, index: sgo.playerIndex(ev) }; matched++; } });
  /* all or nothing: every player is read before any is written, so a bad odd never leaves half a board behind */
  let priced = 0; const books = {}, found = {};
  players.forEach(function (p) {
    const m = byGame[p.gameId]; if (!m) return;
    const pp = sgo.playerProps(m.ev, p.name, m.index); if (!pp) return;
    found[p.id] = pp; priced++;
    Object.keys(pp.stats).forEach(k => { Object.keys(pp.stats[k].over.books).concat(Object.keys(pp.stats[k].under.books)).forEach(b => { books[b] = true; }); });
  });
  players.forEach(function (p) { const pp = found[p.id]; if (pp) { p.lines = pp.stats; p.sgoPlayerId = pp.playerID; } });
  return { source: sgo.SOURCE, at: now.toISOString(), games: matched, of: games.length, players: priced, books: Object.keys(books).sort(), entities: src.stats().entities, used: usage ? usage.used : null, max: usage ? usage.max : null };
  }
}

/* ---------- main ---------- */
async function run(opts) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const src = opts.fixture ? fixtureSource() : liveSource(opts.cache);
  const dataDir = opts.out || path.join(__dirname, "..", "data");
  const sb = await src.scoreboard();
  if (!sb) throw new Error("no scoreboard");
  const games = parseScoreboard(sb).filter(g => g.status !== "STATUS_FINAL");
  const season = seasonLabel(games.length ? new Date(games[0].start) : now);
  const teamsPlaying = {}; games.forEach(g => { teamsPlaying[g.home.id] = g; teamsPlaying[g.away.id] = g; });

  /* league-wide points allowed for the defence ranking */
  const teamsList = await src.teams();
  const allTeams = teamsList && teamsList.sports ? teamsList.sports[0].leagues[0].teams.map(t => t.team) : Object.keys(teamsPlaying).map(id => ({ id: id }));
  const defence = {};
  for (const t of (opts.teams ? allTeams.slice(0, opts.teams) : allTeams)) {
    const s = await src.schedule(t.id).catch(() => null);
    defence[t.id] = pointsAllowed(s, t.id);
  }
  const ranked = Object.keys(defence).filter(id => defence[id].ptsAllowed != null).sort((a, b) => defence[b].ptsAllowed - defence[a].ptsAllowed);
  ranked.forEach((id, i) => { defence[id].rank = i + 1; });

  const players = [], outs = []; /* outs: players ESPN lists as Out, kept for the faces strip (no game log fetched) */
  const teamIds = Object.keys(teamsPlaying).slice(0, opts.teams || 99);
  for (const teamId of teamIds) {
    const game = teamsPlaying[teamId], home = game.home.id === teamId, me = home ? game.home : game.away, opp = home ? game.away : game.home;
    const roster = await src.roster(teamId).catch(() => null);
    const cands = [];
    for (const a of (roster && roster.athletes || [])) {
      const inj = (a.injuries || [])[0];
      const injury = inj ? ((inj.status || "") + (inj.details && inj.details.type ? ": " + inj.details.type : "")).trim() : null;
      if (inj && /out/i.test(inj.status || "")) { outs.push({ id: a.id, name: a.displayName, pos: a.position && a.position.abbreviation, team: me.name, abbr: me.abbr, injury: injury, pts: null, min: null }); continue; }
      const log = parseGamelog(await src.gamelog(a.id).catch(() => null), season);
      if (!log.length) continue;
      const mins = log.map(r => r.min);
      const minutes = { season: round(avg(mins)), l5: round(avg(mins.slice(0, 5))) };
      if (minutes.season < RULES.minMinutes) continue;
      const last = log[0], lastDate = new Date(last.date + "T12:00:00Z"), gameDate = new Date(game.start);
      const restDays = Math.max(0, Math.round((gameDate - lastDate) / 864e5) - 0);
      const p = {
        id: a.id, name: a.displayName, pos: a.position && a.position.abbreviation, jersey: a.jersey || null,
        headshot: (a.headshot && a.headshot.href && a.headshot.href !== "https://a.espncdn.com/i/headshots/nba/players/full/" + a.id + ".png") ? a.headshot.href : null,
        teamId: teamId, team: me.name, teamAbbr: me.abbr, gameId: game.id, opp: opp.name, oppAbbr: opp.abbr, home: home, start: startLabel(gameDate),
        gp: log.length, restDays: restDays, b2b: restDays <= 1, injury: injury, minutes: minutes,
        stats: { pts: statBlock(log, "pts"), reb: statBlock(log, "reb"), ast: statBlock(log, "ast"), threes: statBlock(log, "threes"), pra: statBlock(log, "pra") },
        opp_: null, log: log.slice(0, RULES.logGames).map(r => ({ date: r.date, opp: r.opp, home: r.home, result: r.result, min: r.min, pts: r.pts, reb: r.reb, ast: r.ast, threes: r.threes }))
      };
      p.opp = defence[opp.id] && defence[opp.id].ptsAllowed != null ? { ptsAllowed: defence[opp.id].ptsAllowed, rank: defence[opp.id].rank, games: defence[opp.id].games } : null;
      delete p.opp_;
      p.signals = signals(p);
      p.heat = Math.max(0, p.stats.pts.season ? p.stats.pts.l5 / p.stats.pts.season - 1 : 0);
      cands.push(p);
    }
    cands.sort((a, b) => b.minutes.season - a.minutes.season).slice(0, RULES.playersPerTeam).forEach(p => players.push(p));
  }
  const lines = await attachLines(players, games, opts, now).catch(e => ({ skipped: e.message }));
  const data = { sample: false, source: "ESPN", attribution: "Stats, schedules and player photos from ESPN's public API." + (lines.players ? " Lines from " + lines.source + " (" + lines.books.length + " books)." : ""), generatedAt: now.toISOString(), date: etDate(now), lines: lines, games: games.map(g => ({ id: g.id, start: g.start, startLabel: startLabel(new Date(g.start)), home: g.home, away: g.away })), players: players };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "props.js"), "/* Generated by scripts/update-props.js from ESPN public data. Do not edit. */\nwindow.PROPS_DATA = " + JSON.stringify(data) + ";\n");
  writeFaces(dataDir, facesFrom(players, outs, now));
  return { games: games.length, players: players.length, requests: src.count(), lines: lines, bytes: fs.statSync(path.join(dataDir, "props.js")).size };
}
/* data/faces.js: a slim roster for the faces strips on the pick cards and the breakdown (js/teams.js):
   every rotation player with season points and minutes, plus the players ESPN lists as Out */
function facesFrom(players, outs, now) {
  const seen = {}, list = [];
  players.forEach(p => { seen[p.id] = true; list.push({ id: p.id, name: p.name, pos: p.pos || null, team: p.team, abbr: p.teamAbbr, injury: p.injury || null, pts: p.stats && p.stats.pts ? p.stats.pts.season : null, min: p.minutes ? p.minutes.season : null }); });
  (outs || []).forEach(p => { if (!seen[p.id]) list.push(p); });
  list.sort((a, b) => a.team.localeCompare(b.team) || (b.pts || 0) - (a.pts || 0));
  return { source: "ESPN", attribution: "Player photos via ESPN.", generatedAt: (now || new Date()).toISOString(), league: "basketball_nba", players: list };
}
function writeFaces(dataDir, data) {
  fs.writeFileSync(path.join(dataDir, "faces.js"), "/* Generated by scripts/update-props.js from ESPN public data. Do not edit. */\nwindow.FACES_DATA = " + JSON.stringify(data) + ";\n");
}
function parseArgs(argv) {
  const o = { fixture: false, out: null, now: null, cache: null, teams: 0, lines: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fixture") o.fixture = true; else if (argv[i] === "--out") o.out = argv[++i]; else if (argv[i] === "--now") o.now = argv[++i];
    else if (argv[i] === "--cache") o.cache = argv[++i]; else if (argv[i] === "--teams") o.teams = Number(argv[++i]); else if (argv[i] === "--no-lines") o.lines = false;
  }
  return o;
}
if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(r => console.log("Props: " + r.games + " games, " + r.players + " players, " + r.requests + " ESPN requests, " + Math.round(r.bytes / 1024) + " KB; lines: " + (r.lines.players != null ? r.lines.players + " players priced in " + r.lines.games + " of " + r.lines.of + " games (" + r.lines.entities + " SportsGameOdds entities, month " + r.lines.used + "/" + r.lines.max + ")" : "skipped (" + r.lines.skipped + ")"))).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { run, attachLines, facesFrom, writeFaces, parseGamelog, parseScoreboard, pointsAllowed, statBlock, signals, seasonLabel, ordinal, RULES };
