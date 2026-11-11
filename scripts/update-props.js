/* ==========================================================================
   EdgeLine AI — props research data (NBA here; the NFL half in scripts/nfl-props.js)
   Builds data/props.js from ESPN's public (undocumented) endpoints: today's
   games, rosters with headshots and injury status, each rotation player's
   last games, and every team's points allowed for a defence ranking. Then,
   when SGO_API_KEY is set, one SportsGameOdds call for tonight's games (one
   entity per game) attaches every player's lines: the consensus line per stat,
   each book's price on it for over and under, and the de-vigged fair
   probability per side. Without lines the page still lets the visitor type
   one. Signals ("confluences") compare a player's recent form, home/away
   split, minutes, rest and opponent defence.

   The NFL pass runs first (its lines must land before Sunday's early kickoffs): see scripts/nfl-props.js. Each
   league's pass stands alone: one failing keeps the other, and a failed NFL pass carries the last file's NFL
   players whose games are still ahead.

   Then the record (scripts/props-log.js, data/props-log.json): every player's board side is locked on the last lines
   read before his game starts, graded from the box score once it ends, and written as PROPS_DATA.results. The hourly
   track run does the same between full runs (track(), called by scripts/update-data.js --track), so a result lands
   within the hour of a final.

   Run:   node scripts/update-props.js            (hits ESPN, ~300-450 NBA requests + ~30-60 NFL, polite delay; + 1 SportsGameOdds call per league)
   Test:  node scripts/update-props.js --fixture  (reads scripts/fixtures/espn/, fixtures/espn/nfl/ and fixtures/sgo/NBA-props.json, NFL-props.json)
   Flags: --out <dir>  --now <iso>  --cache <dir> (save raw responses)  --teams <n> (limit, for quick runs)
          --no-lines (no odds call for either league)  --lines nfl | nba | nba,nfl (which leagues spend SportsGameOdds
          entities this run; the morning run passes --lines nfl: the NFL's early kickoffs come before the afternoon run)
          --no-nfl (skip the NFL pass)  --no-early (no NFL lines before game day: by default a run that prices both
          leagues, the afternoon run and manual runs, also reads the next NFL slate one or two days ahead when the
          SportsGameOdds surplus allows; the morning run, --lines nfl, never does)
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const sgo = require("./sgo.js");
const NFL = require("./nfl-props.js");
const L = require("./props-log.js"); /* graded props and the record (2026-11-10) */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
const RULES = { minMinutes: 14, playersPerTeam: 9, logGames: 10, delayMs: 90, sgoReserve: 150 /* SportsGameOdds entities never spent (shared with update-data.js) */ };
const STATS = { pts: "points", reb: "totalRebounds", ast: "assists", threes: "threePointFieldGoalsMade-threePointFieldGoalsAttempted" };
/* the NBA's stats in display order, as the page names them (PROPS_DATA.leagues.NBA.stats; every NBA player is graded on all five) */
const STAT_LIST = [{ key: "pts", label: "Points", short: "PTS" }, { key: "reb", label: "Rebounds", short: "REB" }, { key: "ast", label: "Assists", short: "AST" }, { key: "threes", label: "Threes", short: "3PM" }, { key: "pra", label: "Pts + Reb + Ast", short: "PRA" }];
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
    /* always a dated scoreboard: ESPN's undated one keeps last night's slate (all final) until late morning Eastern,
       which on 2026-11-05 at 10:47 AM ET left the page and data/faces.js with no games */
    scoreboard: day => get(SITE + "/scoreboard" + (day ? "?dates=" + day : ""), "scoreboard" + (day ? "-" + day : "")),
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
  const days = [];
  return { days: days, scoreboard: async day => { days.push(day); return read("scoreboard"); }, roster: async id => read("roster-" + id), schedule: async id => read("schedule-" + id), gamelog: async id => read("gamelog-" + id), teams: async () => read("teams"), count: () => 0 };
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
/* was a game-log event a home game for the player? ESPN's game log has no homeAway field (read 2026-11-10: each event
   carries atVs, "vs" at home and "@" away, homeTeamId, awayTeamId and the team he played for). Until then the code
   read meta.homeAway, which is never there, so every NBA row was written as a road game: 0 of 915 rows in that day's
   file were home games, every home average was 0, and the grade's home/road blend never fired. The club he played
   for against the home club's id first (it holds at a neutral site too), then atVs; null when the event says neither. */
function homeOf(meta) {
  if (!meta) return null;
  const team = meta.team && meta.team.id != null ? String(meta.team.id) : null;
  if (team && meta.homeTeamId != null && meta.awayTeamId != null) return team === String(meta.homeTeamId) ? true : team === String(meta.awayTeamId) ? false : null;
  if (meta.atVs === "vs") return true;
  if (meta.atVs === "@") return false;
  if (meta.homeAway === "home") return true;
  if (meta.homeAway === "away") return false;
  return null;
}
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
        out.push({ id: ev.eventId, date: String(meta.gameDate || "").slice(0, 10), opp: meta.opponent && meta.opponent.abbreviation, home: homeOf(meta), result: meta.gameResult || null, score: meta.score || null,
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
  /* a row that does not say where it was played (home null) is in neither split */
  const home = log.filter(r => r.home === true).map(r => key === "pra" ? r.pts + r.reb + r.ast : r[key]), away = log.filter(r => r.home === false).map(r => key === "pra" ? r.pts + r.reb + r.ast : r[key]);
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
/* which leagues spend SportsGameOdds entities this run: lines false = none, an array = those leagues, else both */
function linesFor(opts, league) { return opts.lines === false ? false : Array.isArray(opts.lines) ? opts.lines.indexOf(league) !== -1 : true; }
/* NFL lines before game day (2026-11-10): only a run that prices both leagues asks (the afternoon run and manual runs;
   the morning run passes --lines nfl and prices game days alone), and never with --no-early. Whether it then spends is
   the surplus spender's rule (scripts/surplus.js sgoEarly) */
function earlyFor(opts) { return opts.early !== false && linesFor(opts, "NFL") && linesFor(opts, "NBA"); }
async function attachLines(players, games, opts, now) {
  const on = linesFor(opts, "NBA");
  if (!on || !games.length) return { skipped: !on ? "off" : "no games" };
  /* only the games still to start (2026-11-10): a number read after the tip is an in-game line, and the last one read
     before it is the one the prop is locked and graded on (a started game keeps those: carryLines) */
  const open = games.filter(g => Date.parse(g.start) > now.getTime());
  if (!open.length) return { skipped: "every game has started" };
  const src = opts.sgoSource || sgo.source({ fixture: opts.fixture, fixtureName: "NBA-props" });
  if (!src.enabled) return { skipped: "no key" };
  const usage = await src.usage();
  if (usage && usage.max && usage.max - usage.used - open.length < RULES.sgoReserve) return { skipped: "budget", used: usage.used, max: usage.max };
  let list;
  try { list = await sgo.nightEvents(src, "NBA", open.map(g => g.start)); } catch (e) { return { skipped: e.message }; }
  try { return readLines(list); } catch (e) { return { skipped: e.message, entities: src.stats().entities }; }
  function readLines(list) {
  const byGame = {}; let matched = 0;
  open.forEach(g => { const ev = sgo.eventFor(list, g.home.name, g.away.name); if (ev) { byGame[g.id] = { ev: ev, index: sgo.playerIndex(ev) }; matched++; } });
  /* all or nothing: every player is read before any is written, so a bad odd never leaves half a board behind */
  let priced = 0; const books = {}, found = {};
  players.forEach(function (p) {
    const m = byGame[p.gameId]; if (!m) return;
    const pp = sgo.playerProps(m.ev, p.name, m.index); if (!pp) return;
    found[p.id] = pp; priced++;
    Object.keys(pp.stats).forEach(k => { Object.keys(pp.stats[k].over.books).concat(Object.keys(pp.stats[k].under.books)).forEach(b => { books[b] = true; }); });
  });
  players.forEach(function (p) { const pp = found[p.id]; if (pp) { p.lines = pp.stats; p.sgoPlayerId = pp.playerID; p.linesAt = now.toISOString(); } });
  return { source: sgo.SOURCE, at: now.toISOString(), games: matched, of: open.length, players: priced, books: Object.keys(books).sort(), entities: src.stats().entities, used: usage ? usage.used : null, max: usage ? usage.max : null };
  }
}

/* ---------- main ---------- */
async function runNBA(opts, now, src) {
  /* tonight is the Eastern date; once its games are all final (late at night) the next slate is tomorrow's */
  const ymd = d => etDate(d).replace(/-/g, "");
  let sb = await src.scoreboard(ymd(now));
  if (!sb) throw new Error("no scoreboard");
  let games = parseScoreboard(sb).filter(g => g.status !== "STATUS_FINAL");
  if (!games.length) {
    const next = await src.scoreboard(ymd(new Date(now.getTime() + 864e5)));
    const later = next ? parseScoreboard(next).filter(g => g.status !== "STATUS_FINAL") : [];
    if (later.length) { sb = next; games = later; }
  }
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
  return { games: games, players: players, outs: outs, lines: lines };
}
async function run(opts) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const src = opts.source || (opts.fixture ? fixtureSource() : liveSource(opts.cache));
  const dataDir = opts.out || path.join(__dirname, "..", "data");
  const prev = readPrevious(dataDir);
  /* the NFL first; a custom NBA source (the tests) without an NFL one never reaches the live NFL endpoints */
  const nfl = opts.nfl === false || (opts.source && !opts.nflSource && !opts.fixture) ? null : await runNFL(opts, now, dataDir, prev);
  let nba;
  try { nba = await runNBA(opts, now, src); }
  catch (e) {
    if (!nfl) throw e; /* the NBA alone: fail as before and keep the last file */
    console.log("NBA props pass failed (" + e.message + "): keeping the last file's NBA games still ahead");
    const keep = ((prev && prev.games) || []).filter(g => (g.league || "NBA") === "NBA" && Date.parse(g.start) + 3 * 36e5 > now.getTime()), ids = {};
    keep.forEach(g => { ids[g.id] = true; });
    nba = { games: keep, players: ((prev && prev.players) || []).filter(p => (p.league || "NBA") === "NBA" && ids[p.gameId]), outs: [], lines: Object.assign({}, (prev && prev.lines) || {}, { error: e.message }), failed: true };
  }
  const games = nba.games, players = nba.players, outs = nba.outs, lines = nba.lines;
  /* every entry names its league and event (game.html and the board read them; NFL entries carry more, see CLAUDE.md) */
  players.forEach(p => { const g = games.find(x => x.id === p.gameId); p.league = "NBA"; p.sportKey = "basketball_nba"; p.eventId = p.gameId; p.commence = g ? g.start : null; });
  /* lines read on an earlier run stay on a player whose game this run did not price (it has started, or the call was
     skipped), as long as it is the same game */
  if (!nba.failed) {
    const c = carryLines(players, ((prev && prev.players) || []).filter(p => (p.league || "NBA") === "NBA"), prev && prev.lines && prev.lines.at);
    if (c.n && lines) { lines.carried = c.n; if (!lines.at && c.at) lines.at = c.at; }
  }
  const nbaGames = nba.failed ? games : games.map(g => ({ id: g.id, league: "NBA", sportKey: "basketball_nba", eventId: g.id, start: g.start, startLabel: startLabel(new Date(g.start)), home: g.home, away: g.away }));
  const nflLines = nfl && nfl.summary && nfl.summary.lines, books = {};
  [lines, nflLines].forEach(l => { ((l && l.players && l.books) || []).forEach(b => { books[b] = true; }); });
  const windUsed = !!(nfl && (nfl.games || []).some(g => g.wind));
  const data = { sample: false, source: "ESPN", attribution: "Stats, schedules and player photos from ESPN's public API." + (Object.keys(books).length ? " Lines from " + sgo.SOURCE + " (" + Object.keys(books).length + " books)." : "") + (windUsed ? " NFL wind forecasts from the National Weather Service." : ""), generatedAt: now.toISOString(), date: etDate(now),
    lines: lines, /* the NBA's lines summary (kept as it was); each league's is under leagues */
    leagues: { NBA: { date: etDate(now), games: nbaGames.length, players: players.length, lines: lines, stats: STAT_LIST }, NFL: nfl ? nfl.summary : { skipped: "off" } },
    games: nbaGames.concat(nfl ? nfl.games : []), players: players.concat(nfl ? nfl.players : []) };
  /* the record: lock every board side on this file's lines, settle the games that have ended, write results. A custom
     NBA source (the tests) without a results source never reaches the live box scores */
  const resultsSource = opts.resultsSource || (opts.fixture ? L.fixtureSource() : opts.source ? null : L.liveSource());
  const record = await recordProps(dataDir, data, now, resultsSource, prev);
  fs.mkdirSync(dataDir, { recursive: true });
  writeProps(dataDir, data);
  /* the model reads each injured scorer's points from data/faces.js: a night with no games keeps the last file rather
     than leave the NBA's injuries uncosted */
  if (nba.failed) console.log("Keeping data/faces.js (the NBA pass failed)");
  else if (games.length || !fs.existsSync(path.join(dataDir, "faces.js"))) writeFaces(dataDir, facesFrom(players, outs, now));
  else console.log("No NBA games on the slate: keeping data/faces.js from " + (function () { try { const sb2 = { window: {} }; require("vm").runInNewContext(fs.readFileSync(path.join(dataDir, "faces.js"), "utf8"), sb2); return sb2.window.FACES_DATA.generatedAt; } catch (e) { return "an earlier run"; } })());
  return { games: games.length, players: players.length, requests: src.count(), lines: lines, record: record, bytes: fs.statSync(path.join(dataDir, "props.js")).size, nfl: nfl ? { games: nfl.games.length, players: nfl.players.length, requests: nfl.requests, summary: nfl.summary } : null };
}
function writeProps(dataDir, data) {
  fs.writeFileSync(path.join(dataDir, "props.js"), "/* Generated by scripts/update-props.js from ESPN public data. Do not edit. */\nwindow.PROPS_DATA = " + JSON.stringify(data) + ";\n");
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; } }
/* Lines read on an earlier run stay on a player whose game this run did not price, as long as it is the same game and
   they were read before it started (a number read after a start is never kept). A game this run did price is left as
   the run read it: a player the books no longer quote there has no line, not an old one.
   Returns { n, at: the newest read carried } */
function carryLines(players, prevPlayers, prevAt) {
  let n = 0, latest = null;
  const priced = {}; players.forEach(p => { if (p.lines) priced[p.gameId] = true; });
  players.forEach(function (p) {
    if (p.lines || priced[p.gameId]) return;
    const old = (prevPlayers || []).find(x => x.id === p.id && x.gameId === p.gameId && x.lines); if (!old) return;
    const at = old.linesAt || prevAt || null;
    if (at && p.commence && Date.parse(at) >= Date.parse(p.commence)) return;
    p.lines = old.lines; p.sgoPlayerId = old.sgoPlayerId; if (old.sgoEventId) p.sgoEventId = old.sgoEventId; p.linesAt = at; p.linesCarried = true; n++;
    if (at && (!latest || Date.parse(at) > Date.parse(latest))) latest = at;
  });
  return { n: n, at: latest };
}
/* ---------- the record (scripts/props-log.js) ----------
   Lock, grade, write data/props-log.json and put PROPS_DATA.results on the file. A failure here never loses the props
   file: the last results stand and the log is left as it was. source null = lock only (no box score is asked for). */
async function recordProps(dataDir, data, now, source, prev) {
  try {
    const log = L.readLog(dataDir);
    const lk = L.lock(log, data, now.getTime());
    const gr = source ? await L.grade(log, now, { source: source, nflCache: readJson(path.join(dataDir, "nfl-games.json")) }) : { graded: 0, voided: 0, dropped: 0, waiting: 0, games: 0, requests: 0, changed: false };
    data.results = L.results(log, data);
    const wrote = L.writeLog(dataDir, log), pend = L.pending(log, now);
    return { open: pend.open, locked: pend.locked, added: lk.added, moved: lk.moved, removed: lk.removed, graded: gr.graded, voided: gr.voided, dropped: gr.dropped, waiting: gr.waiting, games: gr.games, requests: gr.requests, wrote: wrote, record: data.results.record, since: data.results.since };
  } catch (e) {
    if (prev && prev.results) data.results = prev.results;
    return { error: e.message };
  }
}
/* the record's part of a run's log line */
function recordText(r) {
  if (!r) return "";
  if (r.error) return "FAILED (" + r.error + "), the last results stand";
  if (r.skipped) return "skipped (" + r.skipped + ")";
  return r.open + " locked on lines for games still to start, " + r.locked + " waiting for a box score; this run graded " + r.graded + (r.voided ? " and voided " + r.voided : "") + " in " + r.games + " game" + (r.games === 1 ? "" : "s") + (r.dropped ? ", dropped " + r.dropped + " no box score settled in a week" : "") + " (" + r.requests + " ESPN requests); record " + r.record.w + "-" + r.record.l + (r.record.push ? "-" + r.record.push : "") + (r.since ? " since " + r.since : "");
}
/* ---------- the hourly track run's part (scripts/update-data.js --track calls it after the surplus's refresh) ----------
   The props file on disk is locked again (a refresh may have re-read the lines of games about to start), every game
   that has ended is graded from its box score (ESPN, free), and results are written into data/props.js only when
   they changed. No SportsGameOdds entity, no Odds API credit. opts: { fixture, resultsSource } */
async function track(dataDir, now, opts) {
  opts = opts || {};
  const D = readPrevious(dataDir);
  if (!D) return { skipped: "no props file" };
  if (D.sample) return { skipped: "sample data" };
  const had = JSON.stringify(D.results || null);
  const r = await recordProps(dataDir, D, now, opts.resultsSource || (opts.fixture ? L.fixtureSource() : L.liveSource()), D);
  if (!r.error && JSON.stringify(D.results || null) !== had) { writeProps(dataDir, D); r.file = true; }
  return r;
}
/* the last props file, for the NFL carry-over */
function readPrevious(dataDir) {
  try { const sb = { window: {} }; require("vm").runInNewContext(fs.readFileSync(path.join(dataDir, "props.js"), "utf8"), sb); return sb.window.PROPS_DATA || null; } catch (e) { return null; }
}
/* the NFL pass. Lines read on an earlier run stay on a player whose game this run did not price (it has started, or
   the call was skipped) as long as it is the same game; a failed pass keeps the last file's NFL games still ahead. */
async function runNFL(opts, now, dataDir, prev) {
  const prevNfl = ((prev && prev.players) || []).filter(p => p.league === "NFL");
  try {
    const r = await NFL.run({ now: now.toISOString(), out: dataDir, fixture: opts.fixture, nflSource: opts.nflSource, sgoSource: opts.nflSgoSource, cache: opts.cache, lines: linesFor(opts, "NFL"), early: earlyFor(opts), writeCache: opts.writeCache, log: m => console.log(m) });
    /* a game priced on an earlier run (the morning's, or a day or two ahead) keeps those lines until a later read
       replaces them; the summary then says when the lines on the page were read */
    const c = carryLines(r.players, prevNfl, prev && prev.leagues && prev.leagues.NFL && prev.leagues.NFL.lines && prev.leagues.NFL.lines.at);
    if (c.n) { r.summary.carried = c.n; if (r.summary.lines && !r.summary.lines.at && c.at) r.summary.lines.at = c.at; }
    return r;
  } catch (e) {
    console.log("NFL props pass failed (" + e.message + "): keeping the last file's NFL games still ahead");
    const keep = ((prev && prev.games) || []).filter(g => g.league === "NFL" && Date.parse(g.start) + 4 * 36e5 > now.getTime());
    const ids = {}; keep.forEach(g => { ids[g.id] = true; });
    const summary = Object.assign({}, (prev && prev.leagues && prev.leagues.NFL) || {}, { error: e.message, carriedFrom: prev && prev.generatedAt });
    return { games: keep, players: prevNfl.filter(p => ids[p.gameId]), summary: summary, requests: 0 };
  }
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
    else if (argv[i] === "--lines") o.lines = String(argv[++i] || "").toUpperCase().split(",").map(x => x.trim()).filter(Boolean); else if (argv[i] === "--no-nfl") o.nfl = false; else if (argv[i] === "--no-early") o.early = false;
  }
  return o;
}
if (require.main === module) {
  const linesText = l => !l ? "none" : l.players != null ? l.players + " players priced in " + l.games + " of " + l.of + " games (" + l.entities + " SportsGameOdds entities, month " + l.used + "/" + l.max + ")" : "skipped (" + l.skipped + (l.next ? ", next game day " + l.next : "") + (l.carried ? ", " + l.carried + " players keep the lines read " + l.at : "") + ")";
  run(parseArgs(process.argv.slice(2))).then(r => {
    console.log("Props NBA: " + r.games + " games, " + r.players + " players, " + r.requests + " ESPN requests, " + Math.round(r.bytes / 1024) + " KB (both leagues); lines: " + linesText(r.lines));
    console.log("Props NFL: " + (r.nfl ? r.nfl.games + " games" + (r.nfl.summary.date ? " on " + r.nfl.summary.date + (r.nfl.summary.today ? " (today)" : "") : "") + ", " + r.nfl.players + " players, " + r.nfl.requests + " ESPN requests; lines: " + linesText(r.nfl.summary.lines) + NFL.earlyText(r.nfl.summary.lines) + (r.nfl.summary.error ? "; FAILED: " + r.nfl.summary.error : "") : "skipped"));
    console.log("Props record: " + recordText(r.record));
  }).catch(e => { console.error(e.message); process.exit(1); });
}
/* ---------- the hourly refresh (2026-11-08, the SportsGameOdds surplus spender in update-data.js --track) ----------
   Late news moves props, so the hourly track runs re-read the lines of NBA and NFL games starting within `hours` (3),
   when the cycle's spare entities allow: one call per league (one entity per game in the window, as the props run),
   every player of those games re-read on his main line per stat. Nothing else in data/props.js changes; each refreshed
   player gets `linesAt`, the file `linesRefreshedAt`. opts: { hours, sourceFor(league) -> a sgo source, leagues } */
async function refreshLines(dataDir, now, opts) {
  opts = opts || {};
  const file = path.join(dataDir, "props.js"), out = { games: 0, players: 0, entities: 0, leagues: {} };
  if (!fs.existsSync(file)) return Object.assign(out, { skipped: "no props file" });
  const sb = { window: {} };
  try { require("vm").runInNewContext(fs.readFileSync(file, "utf8"), sb); } catch (e) { return Object.assign(out, { skipped: "unreadable props file" }); }
  const D = sb.window.PROPS_DATA;
  if (!D || D.sample) return Object.assign(out, { skipped: "sample data" });
  const t0 = now.getTime(), until = t0 + (opts.hours || 3) * 36e5, leagues = opts.leagues || ["NBA", "NFL"];
  for (const league of leagues) {
    const games = (D.games || []).filter(g => (g.league || "NBA") === league && Date.parse(g.start) > t0 && Date.parse(g.start) <= until);
    if (!games.length) continue;
    const src = opts.sourceFor ? opts.sourceFor(league) : null; if (!src || !src.enabled) continue;
    const before = src.stats().entities;
    let list = [];
    try { list = await sgo.nightEvents(src, league, games.map(g => g.start)); } catch (e) { list = []; }
    const stats = league === "NFL" ? NFL.SGO_STATS : undefined;
    let priced = 0;
    games.forEach(function (g) {
      const ev = sgo.eventFor(list, g.home.name, g.away.name); if (!ev) return;
      const index = sgo.playerIndex(ev);
      (D.players || []).filter(p => p.gameId === g.id && (p.league || "NBA") === league).forEach(function (p) {
        const pp = sgo.playerProps(ev, p.name, index, stats); if (!pp) return;
        p.lines = pp.stats; p.sgoPlayerId = pp.playerID; p.sgoEventId = ev.eventID; p.linesAt = now.toISOString(); delete p.linesCarried; priced++;
      });
    });
    const spent = src.stats().entities - before;
    out.leagues[league] = { games: games.length, players: priced, entities: spent };
    out.games += games.length; out.players += priced; out.entities += spent;
  }
  if (out.players) {
    D.linesRefreshedAt = now.toISOString();
    fs.writeFileSync(file, "/* Generated by scripts/update-props.js from ESPN public data. Do not edit. */\nwindow.PROPS_DATA = " + JSON.stringify(D) + ";\n");
  }
  return out;
}
/* what a refresh would cost: one entity for every game the call's window returns (an hour either side of the games it
   refreshes, as nightEvents asks), counted from the props file's own games of that league */
function refreshCost(dataDir, now, hours) {
  const sb = { window: {} };
  try { require("vm").runInNewContext(fs.readFileSync(path.join(dataDir, "props.js"), "utf8"), sb); } catch (e) { return 0; }
  const D = sb.window.PROPS_DATA; if (!D || D.sample) return 0;
  return ["NBA", "NFL"].reduce(function (n, league) {
    const all = (D.games || []).filter(g => (g.league || "NBA") === league), soon = gamesWithin(dataDir, now, hours, [league]);
    if (!soon.length) return n;
    const ts = soon.map(g => Date.parse(g.start)), lo = Math.min.apply(null, ts) - 36e5, hi = Math.max.apply(null, ts) + 36e5;
    return n + all.filter(g => Date.parse(g.start) >= lo && Date.parse(g.start) <= hi).length;
  }, 0);
}
/* the games a refresh would touch */
function gamesWithin(dataDir, now, hours, leagues) {
  const sb = { window: {} };
  try { require("vm").runInNewContext(fs.readFileSync(path.join(dataDir, "props.js"), "utf8"), sb); } catch (e) { return []; }
  const D = sb.window.PROPS_DATA; if (!D || D.sample) return [];
  const t0 = now.getTime(), until = t0 + (hours || 3) * 36e5;
  return (D.games || []).filter(g => (leagues || ["NBA", "NFL"]).indexOf(g.league || "NBA") !== -1 && Date.parse(g.start) > t0 && Date.parse(g.start) <= until);
}

module.exports = { refreshLines, gamesWithin, refreshCost, run, runNFL, track, recordProps, recordText, carryLines, earlyFor, homeOf, STAT_LIST, readPrevious, linesFor, fixtureSource, attachLines, facesFrom, writeFaces, parseGamelog, parseScoreboard, pointsAllowed, statBlock, signals, seasonLabel, ordinal, RULES };
