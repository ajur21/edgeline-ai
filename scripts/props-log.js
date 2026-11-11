/* ==========================================================================
   EdgeLine AI — graded props and the running record (2026-11-10)
   The state is data/props-log.json (pipeline state like data/picks-log.json:
   the site never loads it); what the page reads is PROPS_DATA.results, built
   from it (scripts/update-props.js calls this module on the two full runs and
   on every hourly track run).

   What is graded: one prop per player per game, the side the board ranked for
   him, which is bestSide(p, { ctx }) of js/props-grade.js (required here, so
   the pipeline and the page use the same maths) on the last lines read before
   his game started, at that posted line, against the box score. Never a price:
   a line is only the number to clear, and no price is read or stored here.

   - lock(log, data, at): every player whose game is still to start at `at`
     gets (or replaces) his pending prop from the file as it stands; one the
     board no longer ranks is taken back out. Nothing is done for a game that
     has started: a run after the start cannot create, change or remove its
     props, so a prop once locked never changes side or line, and nothing is
     ever locked on lines read after a start.
   - grade(log, now, opts): a locked prop whose game has had time to end is
     settled from ESPN's box score (free, no key): the NBA's game summary, the
     NFL's cached box scores in data/nfl-games.json (else the summary). Win,
     Loss, Push (finished on the line) or Void (he did not play, or the game
     was called off). A prop that cannot be settled within a week is dropped.
   - results(log, data): PROPS_DATA.results, the page's contract (CLAUDE.md,
     Props research and lines): { since, asOf, record, byLeague, byGrade,
     slates, recent, check }. `check` (2026-11-11) is the record set against
     what the board stated: each day's tally also carries `stated`, the sum of
     the stated chances of its props decided win or loss, and js/plays.js
     checkFrom turns the sums into how much of a stated edge to keep. The play
     and parlay of the day read it (scripts/of-day.js).
   - gradeEntries(entries, now, opts): the same box-score grading for props
     held outside this log (a prop that is the play of the day or a parlay leg
     lives in data/picks-log.json).
   Each is idempotent: the same file and the same box scores leave the log
   byte for byte as it was.

   The log keeps every prop of the last RULES.keepDays days and, for ever, one
   tally per league and Eastern game day (`days`), so the record runs from the
   first graded slate while the file stays small.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const G = require("../js/props-grade.js");
const NFL = require("./nfl-props.js");
const PLAYS = require("../js/plays.js");

const UA = NFL.UA; /* every request names the pipeline honestly: the same string as BOT_UA in scripts/context.js */
const SITE = "https://site.api.espn.com/apis/site/v2/sports";
const CORE_NFL = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const RULES = {
  keepDays: 10,                 /* a prop's own row is kept this long; its day's tally for ever */
  dropAfterDays: 7,             /* a locked prop no box score settles within a week is dropped, never guessed */
  minHours: { NBA: 2, NFL: 3 }, /* no box score is asked for before a game can have ended */
  minRows: 10,                  /* a finished game's box score with fewer players than this is read again later */
  delayMs: 250                  /* between ESPN requests */
};
const TIERS = ["High", "Medium", "Lean", "Coin flip"];
const LEAGUES = ["NFL", "NBA"];
const NOTE = "Pipeline state for scripts/props-log.js: one prop per player per game, the side the board ranked on the last lines read before the start, graded from the box score. Never a price. Not loaded by the site.";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function round(n, d) { const m = Math.pow(10, d == null ? 4 : d); return Math.round(n * m) / m; }
function keyOf(e) { return e.league + "|" + e.gameId + "|" + e.playerId; }
function dayKey(e) { return e.league + "|" + e.date; }
function tally() { return { w: 0, l: 0, push: 0 }; }
function decided(r) { return r.w + r.l + r.push; }

/* ---------- the file ---------- */
function emptyLog() { return { note: NOTE, version: 1, asOf: null, days: {}, props: [] }; }
function readLog(dataDir) {
  try {
    const l = JSON.parse(fs.readFileSync(path.join(dataDir, "props-log.json"), "utf8"));
    if (l && Array.isArray(l.props) && l.days && typeof l.days === "object") return l;
  } catch (e) { /* none yet */ }
  return emptyLog();
}
/* one prop a line, in a fixed order, so a run that changes nothing writes the same bytes and a diff reads as what changed */
function serialise(log) {
  const props = log.props.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.league.localeCompare(b.league) || (Date.parse(a.start) - Date.parse(b.start)) || String(a.gameId).localeCompare(String(b.gameId)) || String(a.playerId).localeCompare(String(b.playerId)));
  const days = Object.keys(log.days).sort();
  const head = { note: log.note || NOTE, version: log.version || 1, asOf: log.asOf || null };
  if (log.seed) head.seed = log.seed;
  const lines = Object.keys(head).map(k => " " + JSON.stringify(k) + ": " + JSON.stringify(head[k]));
  lines.push(" \"days\": {" + (days.length ? "\n" + days.map(k => "  " + JSON.stringify(k) + ": " + JSON.stringify(log.days[k])).join(",\n") + "\n " : "") + "}");
  lines.push(" \"props\": [" + (props.length ? "\n" + props.map(e => "  " + JSON.stringify(e)).join(",\n") + "\n " : "") + "]");
  return "{\n" + lines.join(",\n") + "\n}\n";
}
function writeLog(dataDir, log) {
  const file = path.join(dataDir, "props-log.json"), text = serialise(log);
  let old = null; try { old = fs.readFileSync(file, "utf8"); } catch (e) { /* new */ }
  if (old === text) return false;
  fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, text);
  return true;
}

/* ---------- locking: the board's side for every player whose game is still to start ---------- */
/* when a player's lines were read: his own stamp (the NFL's, a refresh, a carry-over), else his league's summary */
function linesReadAt(p, data) {
  const lg = G.leagueOf(p), L = data.leagues && data.leagues[lg] && data.leagues[lg].lines;
  return p.linesAt || (L && L.at) || (lg === "NBA" && data.lines && data.lines.at) || data.generatedAt || null;
}
function entryFrom(s, data, ctx) {
  const p = s.p, start = G.startOf(p, ctx);
  return {
    league: G.leagueOf(p), date: G.dayOf(p, ctx), gameId: String(p.gameId), playerId: String(p.id), teamId: p.teamId != null ? String(p.teamId) : null,
    name: p.name, teamAbbr: p.teamAbbr || null, oppAbbr: p.oppAbbr || null, home: !!p.home, start: new Date(Date.parse(start)).toISOString(),
    stat: s.k, side: s.side, line: s.line, prob: round(s.prob, 4), grade: s.grade.tier,
    l10: round(s.l10, 4), n: s.hit.l10[1], /* the board's tie-breaks after the probability: the raw hit rate, then the longer sample */
    linesAt: linesReadAt(p, data), status: "pending", actual: null, result: null
  };
}
/* at: the clock of the run that wrote (or last refreshed) this file, in ms. Returns { added, moved, removed, changed } */
function lock(log, data, at) {
  const out = { added: 0, moved: 0, removed: 0, changed: false };
  if (!data || data.sample || !Array.isArray(data.players)) return out;
  const t = typeof at === "number" ? at : new Date(at).getTime();
  const ctx = G.context(data), inFile = {};
  (data.games || []).forEach(g => { inFile[G.leagueOf(g) + "|" + g.id] = true; });
  const byKey = {}; log.props.forEach(e => { byKey[keyOf(e)] = e; });
  const want = {};
  data.players.forEach(function (p) {
    const start = Date.parse(G.startOf(p, ctx) || "");
    if (!Number.isFinite(start) || start <= t || !G.dayOf(p, ctx)) return; /* started, or no start to lock against */
    const s = G.bestSide(p, { now: t, ctx: ctx }); if (!s) return;
    const e = entryFrom(s, data, ctx), read = Date.parse(e.linesAt || "");
    if (Number.isFinite(read) && read >= start) return; /* lines read after the start are never a prop */
    want[keyOf(e)] = e;
  });
  Object.keys(want).forEach(function (k) {
    const old = byKey[k], e = want[k];
    if (!old) { log.props.push(e); out.added++; return; }
    if (old.status !== "pending" || Date.parse(old.start) <= t) return; /* settled, or locked at its own start */
    if (JSON.stringify(old) !== JSON.stringify(e)) { Object.keys(old).forEach(f => { delete old[f]; }); Object.assign(old, e); out.moved++; }
  });
  /* a pending prop of a game in this file, still to start, that the board no longer ranks (his line is gone, or he is) */
  log.props = log.props.filter(function (e) {
    if (e.status !== "pending" || Date.parse(e.start) <= t || !inFile[e.league + "|" + e.gameId] || want[keyOf(e)]) return true;
    out.removed++; return false;
  });
  out.changed = !!(out.added || out.moved || out.removed);
  return out;
}

/* ---------- box scores ---------- */
function liveSource() {
  let n = 0;
  async function get(url) {
    await sleep(RULES.delayMs); n++;
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) throw new Error("ESPN " + res.status + " for " + url);
    return res.json();
  }
  return {
    nbaSummary: id => get(SITE + "/basketball/nba/summary?event=" + id),
    nflSummary: id => get(SITE + "/football/nfl/summary?event=" + id),
    /* who dressed and who played, per club: only asked for a player the box score has no line for */
    nflGameRoster: (id, teamId) => get(CORE_NFL + "/events/" + id + "/competitions/" + id + "/competitors/" + teamId + "/roster"),
    count: () => n
  };
}
function fixtureSource(dir) {
  dir = dir || path.join(__dirname, "fixtures", "espn");
  const read = f => { const file = path.join(dir, f + ".json"); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null; };
  return { nbaSummary: async id => read("summary-" + id), nflSummary: async id => read(path.join("nfl", "summary-" + id)), nflGameRoster: async (id, teamId) => read(path.join("nfl", "gameroster-" + id + "-" + teamId)), count: () => 0 };
}
function statusOf(sum) { const c = sum && sum.header && (sum.header.competitions || [])[0], st = (c && c.status && c.status.type) || null; return st ? { name: String(st.name || ""), completed: !!st.completed } : null; }
const CALLED_OFF = /POSTPONED|CANCELED|CANCELLED|FORFEIT|SUSPENDED/i;
function num(v) { if (v == null || v === "" || v === "--") return null; const x = Number(String(v).split("-")[0]); return Number.isFinite(x) ? x : null; }
/* an NBA game summary -> null (unreadable) | { off } | { final: false } | { final: true, rows: { <athlete id>: { played, pts, reb, ast, threes } } } */
function nbaBox(sum) {
  const st = statusOf(sum); if (!st) return null;
  if (CALLED_OFF.test(st.name)) return { off: true };
  if (!st.completed) return { final: false };
  const rows = {}; let withStats = 0;
  ((sum.boxscore && sum.boxscore.players) || []).forEach(function (t) {
    (t.statistics || []).forEach(function (s) {
      const idx = {}; (s.keys || []).forEach((k, i) => { idx[k] = i; });
      (s.athletes || []).forEach(function (a) {
        const id = a.athlete && a.athlete.id != null ? String(a.athlete.id) : null; if (!id) return;
        const v = k => (a.stats && idx[k] != null ? num(a.stats[idx[k]]) : null), min = v("minutes");
        const played = !a.didNotPlay && !!(a.stats && a.stats.length) && min != null && min > 0;
        if (played) withStats++;
        rows[id] = { played: played, pts: v("points"), reb: v("rebounds"), ast: v("assists"), threes: v("threePointFieldGoalsMade-threePointFieldGoalsAttempted") };
      });
    });
  });
  return withStats >= RULES.minRows ? { final: true, rows: rows } : null;
}
function nbaActual(row, stat) {
  if (!row || !row.played) return null;
  const v = stat === "pra" ? (row.pts == null || row.reb == null || row.ast == null ? null : row.pts + row.reb + row.ast) : row[stat];
  return v == null ? null : v;
}
/* an NFL game -> the same shape, rows: { <athlete id>: the cached box score row } (the cache first, else ESPN's summary) */
async function nflBox(src, gameId, cache) {
  const g = cache && cache.games && cache.games[gameId];
  let rows = g && g.r;
  if (!rows) {
    const sum = await src.nflSummary(gameId).catch(() => null), st = statusOf(sum); if (!st) return null;
    if (CALLED_OFF.test(st.name)) return { off: true };
    if (!st.completed) return { final: false };
    const parsed = NFL.parseSummary(sum); if (!parsed) return null;
    rows = parsed.game.r;
  }
  if (!rows || rows.length < RULES.minRows) return null;
  const by = {}; rows.forEach(r => { by[String(r[NFL.C.id])] = r; });
  return { final: true, rows: by };
}
/* did a player with no line in the box score play? ESPN's game roster: `valid` is true for a player who took the field,
   `didNotPlay` for one who dressed and did not. true / false, or null when the roster cannot be read (ask again later) */
function playedFromRoster(roster, playerId) {
  const list = roster && roster.entries; if (!Array.isArray(list) || !list.length) return null;
  const e = list.find(x => String(x.playerId) === String(playerId));
  return !!(e && e.valid === true && !e.didNotPlay);
}
function resultOf(side, line, actual) {
  if (actual == null) return "Void";
  if (actual === line) return "Push";
  return (side === "under" ? actual < line : actual > line) ? "Win" : "Loss";
}

/* ---------- grading ---------- */
/* opts: { source, nflCache (data/nfl-games.json parsed) }. Returns { graded, voided, dropped, waiting, games, requests, changed } */
/* has a prop's game had time to end? No box score is asked for before that */
function isDue(e, t) { return Date.parse(e.start) + (RULES.minHours[e.league] || 3) * 36e5 <= t; }
/* the box-score loop every graded prop goes through, whichever log holds it. `due`: props ({ league, gameId, playerId,
   teamId, stat, start }) whose game has had time to end; settle(e, actual) is called for each one a box score answers
   (actual null: he did not play, or the game was called off), old(list) for a game nothing settled within
   RULES.dropAfterDays. out.waiting and out.games are counted here */
async function settleDue(due, t, src, opts, settle, old, out) {
  const byGame = {}; due.forEach(e => { (byGame[e.league + "|" + e.gameId] = byGame[e.league + "|" + e.gameId] || []).push(e); });
  const rosters = {};
  for (const k of Object.keys(byGame).sort()) {
    const list = byGame[k], league = list[0].league, gameId = list[0].gameId;
    if (t - Date.parse(list[0].start) > RULES.dropAfterDays * 864e5) { old(list); continue; }
    let box = null;
    try { box = league === "NBA" ? nbaBox(await src.nbaSummary(gameId)) : await nflBox(src, gameId, opts.nflCache); } catch (err) { box = null; }
    if (!box || box.final === false) { out.waiting += list.length; continue; }
    out.games++;
    if (box.off) { list.forEach(e => settle(e, null)); continue; }
    for (const e of list) {
      const row = box.rows[e.playerId];
      if (league === "NBA") { settle(e, nbaActual(row, e.stat)); continue; }
      if (row) { const v = NFL.rowVal(row, e.stat); if (v == null) { out.waiting++; continue; } settle(e, v); continue; }
      /* no line in the box score: he did not play, or he played and was never thrown to or handed the ball */
      if (!e.teamId) { settle(e, null); continue; }
      const rk = gameId + "|" + e.teamId;
      if (!(rk in rosters)) rosters[rk] = await src.nflGameRoster(gameId, e.teamId).catch(() => null);
      const played = playedFromRoster(rosters[rk], e.playerId);
      if (played == null) { out.waiting++; continue; }
      settle(e, played ? 0 : null);
    }
  }
}
async function grade(log, now, opts) {
  opts = opts || {};
  const t = now.getTime(), src = opts.source || liveSource(), before = src.count ? src.count() : 0;
  const out = { graded: 0, voided: 0, dropped: 0, waiting: 0, games: 0, requests: 0, changed: false };
  const due = log.props.filter(e => e.status === "pending" && isDue(e, t));
  const drop = {};
  await settleDue(due, t, src, opts, function (e, actual) {
    e.actual = actual == null ? null : actual; e.result = resultOf(e.side, e.line, e.actual); e.status = "graded";
    if (e.result === "Void") out.voided++; else out.graded++;
  }, function (list) { list.forEach(e => { drop[keyOf(e)] = true; }); out.dropped += list.length; }, out);
  if (out.dropped) log.props = log.props.filter(e => !drop[keyOf(e)]);
  out.requests = (src.count ? src.count() : 0) - before;
  if (out.graded || out.voided) log.asOf = now.toISOString();
  const tidy = rebuildDays(log, now);
  out.changed = !!(out.graded || out.voided || out.dropped || tidy);
  return out;
}
/* The same grading for props held somewhere else (scripts/of-day.js: a prop that is the play of the day or a parlay leg).
   entries: [{ league, gameId, playerId, teamId, stat, side, line, start }], each still to settle. One a box score answers
   gets `actual` and `result` (Win, Loss, Push, Void) set on it; the caller owns everything else about it.
   Returns { settled: [entries], old: [entries no box score settled within a week], waiting, games, requests } */
async function gradeEntries(entries, now, opts) {
  opts = opts || {};
  const t = now.getTime(), src = opts.source || liveSource(), before = src.count ? src.count() : 0;
  const out = { settled: [], old: [], waiting: 0, games: 0, requests: 0 };
  const due = (entries || []).filter(e => e && isDue(e, t));
  await settleDue(due, t, src, opts, function (e, actual) {
    e.actual = actual == null ? null : actual; e.result = resultOf(e.side, e.line, e.actual); out.settled.push(e);
  }, function (list) { list.forEach(e => out.old.push(e)); }, out);
  out.requests = (src.count ? src.count() : 0) - before;
  return out;
}
/* each day's tally from its props while they are kept; then the props past the window go and the tally stays.
   `stated` is the sum of the stated chances of the day's props decided win or loss: with w and l it says how much of
   what the board states has come true (results().check) */
function rebuildDays(log, now) {
  const before = JSON.stringify(log.days) + "|" + log.props.length, fresh = {};
  log.props.forEach(function (e) {
    if (e.status !== "graded") return;
    const d = fresh[dayKey(e)] || (fresh[dayKey(e)] = Object.assign({ league: e.league, date: e.date }, tally(), { void: 0, stated: 0, byGrade: {} }));
    if (e.result === "Void") { d.void++; return; }
    const f = e.result === "Win" ? "w" : e.result === "Loss" ? "l" : "push", g = d.byGrade[e.grade] || (d.byGrade[e.grade] = tally());
    d[f]++; g[f]++;
    if (f !== "push" && Number.isFinite(Number(e.prob))) d.stated += Number(e.prob);
  });
  /* the tiers in one fixed order, whatever order the props are held in (a run's new props come last, the file's are
     sorted), so the same props always write the same bytes */
  Object.keys(fresh).forEach(function (k) {
    const d = fresh[k], by = {};
    TIERS.concat(Object.keys(d.byGrade).sort()).forEach(tier => { if (d.byGrade[tier] && !by[tier]) by[tier] = d.byGrade[tier]; });
    d.byGrade = by; d.stated = round(d.stated, 4); log.days[k] = d;
  });
  if (now) {
    const cut = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() - RULES.keepDays * 864e5));
    log.props = log.props.filter(e => e.status !== "graded" || e.date >= cut);
  }
  return before !== JSON.stringify(log.days) + "|" + log.props.length;
}

/* ---------- PROPS_DATA.results: the page's contract ---------- */
function results(log, data) {
  const days = Object.keys(log.days).map(k => log.days[k]).filter(d => decided(d) > 0);
  const add = (a, b) => { a.w += b.w || 0; a.l += b.l || 0; a.push += b.push || 0; return a; };
  const record = tally(), byLeague = {}, byGrade = {};
  TIERS.forEach(tier => { byGrade[tier] = tally(); });
  days.forEach(function (d) {
    add(record, d); add(byLeague[d.league] || (byLeague[d.league] = tally()), d);
    Object.keys(d.byGrade || {}).forEach(tier => add(byGrade[tier] || (byGrade[tier] = tally()), d.byGrade[tier]));
  });
  const lgOrder = lg => { const i = LEAGUES.indexOf(lg); return i === -1 ? LEAGUES.length : i; };
  const slates = days.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || lgOrder(a.league) - lgOrder(b.league)).map(d => ({ league: d.league, date: d.date, w: d.w, l: d.l, push: d.push }));
  /* a prop's rank: its place on its league's board for that game day, every prop of the day at the line it locked on,
     in the board's own order (js/props-grade.js better) */
  const boards = {}, ranks = {};
  log.props.forEach(e => { (boards[dayKey(e)] = boards[dayKey(e)] || []).push({ e: e, p: { commence: e.start }, prob: e.prob, l10: e.l10 || 0, hit: { l10: [0, e.n || 0] } }); });
  Object.keys(boards).forEach(k => boards[k].sort((a, b) => G.better(a, b) || String(a.e.playerId).localeCompare(String(b.e.playerId))).forEach((s, i) => { ranks[keyOf(s.e)] = i + 1; }));
  /* the rows the page lists: each league's most recent graded game day, and every graded prop of a game still in the file */
  const last = {}, inFile = {};
  log.props.forEach(e => { if (e.status === "graded" && (!last[e.league] || e.date > last[e.league])) last[e.league] = e.date; });
  ((data && data.games) || []).forEach(g => { inFile[G.leagueOf(g) + "|" + g.id] = true; });
  const recent = log.props.filter(e => e.status === "graded" && (e.date === last[e.league] || inFile[e.league + "|" + e.gameId]))
    .sort((a, b) => lgOrder(a.league) - lgOrder(b.league) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || ranks[keyOf(a)] - ranks[keyOf(b)])
    .map(e => ({ league: e.league, date: e.date, gameId: e.gameId, playerId: e.playerId, name: e.name, teamAbbr: e.teamAbbr, oppAbbr: e.oppAbbr, home: e.home, stat: e.stat, side: e.side, line: e.line, prob: e.prob, grade: e.grade, rank: ranks[keyOf(e)] || null, actual: e.actual, result: e.result }));
  const since = slates.length ? slates.map(s => s.date).sort()[0] : null;
  return { since: since, asOf: log.asOf || null, record: record, byLeague: byLeague, byGrade: byGrade, slates: slates, recent: recent, check: checkOf(log) };
}
/* the record set against what the board stated, per league and overall (js/plays.js checkFrom): { all: { n, hit, stated,
   keep }, NBA: {...}, NFL: {...} }. Only days whose tally carries `stated` count, so both sides of the sum are the same props */
function checkOf(log) {
  const sums = {};
  Object.keys(log.days).forEach(function (k) {
    const d = log.days[k]; if (typeof d.stated !== "number" || !(d.w + d.l > 0)) return;
    const s = sums[d.league] || (sums[d.league] = { n: 0, w: 0, stated: 0 });
    s.n += d.w + d.l; s.w += d.w; s.stated += d.stated;
  });
  return PLAYS.checkFrom(sums);
}
/* how many props are locked and waiting for their game */
function pending(log, now) { const t = now.getTime(); return { open: log.props.filter(e => e.status === "pending" && Date.parse(e.start) > t).length, locked: log.props.filter(e => e.status === "pending" && Date.parse(e.start) <= t).length }; }

module.exports = { RULES, TIERS, NOTE, emptyLog, readLog, writeLog, serialise, lock, grade, results, rebuildDays, pending, resultOf, nbaBox, nbaActual, nflBox, playedFromRoster, liveSource, fixtureSource, keyOf, linesReadAt, gradeEntries, checkOf, isDue };
