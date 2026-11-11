/* ==========================================================================
   EdgeLine AI — NFL props research data (called by scripts/update-props.js)
   Builds the NFL half of data/props.js from ESPN's public (undocumented)
   endpoints, no key:
   - the next NFL game day's games (today's while any is still to finish),
   - every offensive skill player on those teams (roster: position, headshot,
     injury status), the expected starting quarterback, the top backs,
     receivers and tight ends by usage,
   - this season's box scores (passing, rushing, receiving with targets), kept
     in data/nfl-games.json so each run only fetches the games finished since
     the last one (about 14 a week; the first run of a season backfills),
   - each defence's yards and catches allowed to quarterbacks, backs,
     receivers and tight ends, from the same box scores,
   - the wind at kickoff for outdoor U.S. stadiums (National Weather Service,
     public domain, keyless).
   Then, on an NFL game day, one SportsGameOdds call for the day's games still
   to start (one entity per game) attaches every player's lines; on the
   afternoon run of the day or two before a game day the same call is paid
   from the month's spare entities, when the surplus spender's rule allows.
   The grade is game data only (owner rule, 2026-11-04): the books' lines are
   the number to clear and their fair price is stored, never used.

   Run alone:  node scripts/nfl-props.js --eval   (held-out check over data/nfl-games.json)
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const sgo = require("./sgo.js");
const surplus = require("./surplus.js"); /* NFL lines before game day spend from the SportsGameOdds surplus (2026-11-10) */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
/* every request names us honestly (never a browser's user agent); the same string as BOT_UA in scripts/context.js on
   main. api.weather.gov asks every caller to name itself this way. A source that refuses it is treated as unavailable.
   Requests are spaced (RULES.delayMs). */
const UA = "EdgeLineAI-data/1.0 (+https://ajur21.github.io/edgeline-ai/)";
const NWS_UA = UA;
const ET = "America/New_York";
const RULES = {
  delayMs: 250,                                   /* between ESPN requests */
  perTeam: { QB: 1, RB: 3, WR: 4, TE: 2 },        /* players kept per team by usage (the quarterback is the expected starter) */
  logGames: 10,
  minGames: 3,                                    /* the board wants this many games behind a player (the NBA's 4 is a fortnight there, a month here) */
  maxNewBoxscores: 180,                           /* a run never fetches more box scores than this (the season's first run backfills ~130) */
  sgoReserve: 150                                 /* SportsGameOdds entities never spent (shared with update-data.js) */
};
/* the markets: two-sided at the six books the free tier carries for the NFL (SportsGameOdds' market list, checked
   2026-11-08), and each one a count we can project from usage. Anytime touchdown is left out: most books quote only
   "yes" (two of six quote "no"), so there is no two-sided line to clear, and a touchdown is the noisiest thing to project.
   2026-11-10 (the owner: "NFL props depth"): pass attempts, completions, interceptions, carries, passing plus rushing
   and rushing plus receiving yards joined, each fitted on 2025 and checked on 2026 like the first five (--eval); the
   vendor's stat ids are from the same market list (each two-sided at all six books) and are unconfirmed until a live
   response carries them: a market the vendor does not return simply has no line. In display order. */
const STATS = {
  passYds: { label: "Passing yards", short: "PASS YDS", sgo: "passing_yards", dist: "ratio" },
  passTds: { label: "Passing TDs", short: "PASS TD", sgo: "passing_touchdowns", dist: "poisson" },
  att: { label: "Pass attempts", short: "PASS ATT", sgo: "passing_attempts", dist: "ratio" },
  cmp: { label: "Completions", short: "CMP", sgo: "passing_completions", dist: "ratio" },
  int: { label: "Interceptions", short: "INT", sgo: "passing_interceptions", dist: "poisson" },
  passRushYds: { label: "Pass + rush yards", short: "PASS+RUSH", sgo: "passing+rushing_yards", dist: "ratio", sum: ["passYds", "rushYds"] },
  rushYds: { label: "Rushing yards", short: "RUSH YDS", sgo: "rushing_yards", dist: "ratio" },
  car: { label: "Carries", short: "CAR", sgo: "rushing_attempts", dist: "ratio" },
  recYds: { label: "Receiving yards", short: "REC YDS", sgo: "receiving_yards", dist: "ratio" },
  rec: { label: "Receptions", short: "REC", sgo: "receiving_receptions", dist: "poisson" },
  rushRecYds: { label: "Rush + rec yards", short: "RUSH+REC", sgo: "rushing+receiving_yards", dist: "ratio", sum: ["rushYds", "recYds"] },
  td: { label: "Touchdowns", short: "TD", sgo: "touchdowns", dist: "poisson" }
};
const STAT_KEYS = Object.keys(STATS);
/* the five the model was first fitted on (2026-11-08); the rest joined on 2026-11-10, each fitted the same way */
const CORE_KEYS = ["passYds", "passTds", "rushYds", "recYds", "rec"];
const SUM_KEYS = STAT_KEYS.filter(k => STATS[k].sum), BASE_KEYS = STAT_KEYS.filter(k => !STATS[k].sum);
/* the markets on the page (SHIPPED): a candidate that did not pass the honest check stays in STATS so --eval --all
   keeps measuring it, and is neither projected for the page nor asked of the vendor */
const DROPPED = {
  /* 2026-11-10. The vendor's market list (2026-11-08) has over 0.5 touchdowns at all six free-tier books and the under
     at one (BetMGM), the anytime "no" at two (DraftKings, ESPN BET): rarely a number quoted both ways. A book settles it
     on any touchdown the player scores (returns and recoveries too) and the box score cache keeps rushing and receiving
     ones only. And the side we would lean is "no touchdown" at 75 to 90% for most receivers, a heavily juiced price that
     would fill the top of a likeliest-first board. Its check: Brier 0.202 against 0.211 for 2025's rate as a constant,
     but its confident bucket ran hot (65% said, 52% came in, 21). */
  td: "one-sided at most free-tier books; settles on touchdowns the box score cache does not keep"
};
const SHIPPED = STAT_KEYS.filter(k => !DROPPED[k]);
const SGO_STATS = {}; SHIPPED.forEach(k => { SGO_STATS[k] = STATS[k].sgo; });
/* the stat list the page reads its tabs and labels from, in display order (PROPS_DATA.leagues.NFL.stats) */
const STAT_LIST = SHIPPED.map(k => ({ key: k, label: STATS[k].label, short: STATS[k].short }));
const KEYS_BY_POS = {
  QB: ["passYds", "passTds", "att", "cmp", "int", "passRushYds", "rushYds"],
  RB: ["rushYds", "car", "recYds", "rec", "rushRecYds", "td"],
  WR: ["recYds", "rec", "td"], TE: ["recYds", "rec", "td"]
};
Object.keys(KEYS_BY_POS).forEach(pos => { KEYS_BY_POS[pos] = KEYS_BY_POS[pos].filter(k => !DROPPED[k]); });
/* box score row columns in data/nfl-games.json (arrays keep the file small) */
const COLS = ["id", "team", "cmp", "att", "pyd", "ptd", "int", "car", "ryd", "rtd", "tgt", "rec", "wyd", "wtd"];
const C = {}; COLS.forEach((c, i) => { C[c] = i; });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function round(n, d) { const m = Math.pow(10, d == null ? 1 : d); return Math.round(n * m) / m; }
function avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function sd(a) { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) * (x - m)))); }
function etDate(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function ymd(d) { return etDate(d).replace(/-/g, ""); }
function startLabel(d) { return new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(d) + " " + new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d) + " ET"; }
function dayLabel(key) { const p = key.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }); }

/* ---------- sources ---------- */
function liveSource(cacheDir) {
  let n = 0;
  const memo = {};
  async function get(url, name, headers) {
    if (memo[url]) return memo[url];
    await sleep(RULES.delayMs); n++;
    const res = await fetch(url, { headers: Object.assign({ "user-agent": UA, accept: "application/json" }, headers || {}) });
    if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
    const json = await res.json();
    if (cacheDir && name) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(path.join(cacheDir, name + ".json"), JSON.stringify(json)); }
    if (!/summary\?/.test(url)) memo[url] = json; /* box scores run to 600 KB: parsed and dropped */
    return json;
  }
  return {
    scoreboard: day => get(SITE + "/scoreboard?dates=" + day, "nfl-scoreboard-" + day),
    week: (season, type, week) => get(SITE + "/scoreboard?seasontype=" + type + "&week=" + week + "&dates=" + season, "nfl-week-" + season + "-" + type + "-" + week),
    summary: id => get(SITE + "/summary?event=" + id, null),
    roster: id => get(SITE + "/teams/" + id + "/roster", "nfl-roster-" + id),
    /* NWS: the grid point for a stadium, then its hourly forecast */
    point: (lat, lon) => get("https://api.weather.gov/points/" + lat + "," + lon, null, { "user-agent": NWS_UA, accept: "application/geo+json" }),
    hourly: url => get(url, null, { "user-agent": NWS_UA, accept: "application/geo+json" }),
    count: () => n
  };
}
function fixtureSource(dir) {
  dir = dir || path.join(__dirname, "fixtures", "espn", "nfl");
  const read = n => { const f = path.join(dir, n + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
  return {
    scoreboard: async day => read("scoreboard-" + day),
    week: async (season, type, week) => read("week-" + season + "-" + type + "-" + week),
    summary: async id => read("summary-" + id),
    roster: async id => read("roster-" + id),
    point: async () => read("nws-point"),
    hourly: async () => read("nws-hourly"),
    count: () => 0
  };
}

/* ---------- box scores ---------- */
function statsByKey(st) { return (st.athletes || []).map(a => { const o = {}; (st.keys || []).forEach((k, i) => { o[k] = a.stats ? a.stats[i] : null; }); return { a: a.athlete || {}, s: o }; }); }
function n0(v) { if (v == null || v === "" || v === "-") return 0; const x = Number(String(v).split(/[-/]/)[0]); return Number.isFinite(x) ? x : 0; }
/* one finished game, slim: { id, s: season, t: season type, w: week, d: start, h/a: [teamId, abbr, score], r: rows by COLS } and the names seen */
function parseSummary(sum) {
  if (!sum || !sum.header || !sum.boxscore) return null;
  const comp = (sum.header.competitions || [])[0]; if (!comp) return null;
  const done = comp.status && comp.status.type && comp.status.type.completed; if (!done) return null;
  const side = ha => { const c = (comp.competitors || []).find(x => x.homeAway === ha); return c ? [String(c.team.id), c.team.abbreviation, Number(c.score)] : null; };
  const rows = {}, names = {};
  (sum.boxscore.players || []).forEach(function (t) {
    const team = String(t.team && t.team.id);
    (t.statistics || []).forEach(function (st) {
      if (!/^(passing|rushing|receiving)$/.test(st.name)) return;
      statsByKey(st).forEach(function (x) {
        const id = x.a.id && String(x.a.id); if (!id) return;
        names[id] = x.a.displayName || names[id];
        const r = rows[id] || (rows[id] = [id, team, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        if (st.name === "passing") { const ca = String(x.s["completions/passingAttempts"] || "0/0").split("/"); r[C.cmp] = n0(ca[0]); r[C.att] = n0(ca[1]); r[C.pyd] = n0(x.s.passingYards); r[C.ptd] = n0(x.s.passingTouchdowns); r[C.int] = n0(x.s.interceptions); }
        if (st.name === "rushing") { r[C.car] = n0(x.s.rushingAttempts); r[C.ryd] = Number(x.s.rushingYards) || 0; r[C.rtd] = n0(x.s.rushingTouchdowns); }
        if (st.name === "receiving") { r[C.tgt] = n0(x.s.receivingTargets); r[C.rec] = n0(x.s.receptions); r[C.wyd] = Number(x.s.receivingYards) || 0; r[C.wtd] = n0(x.s.receivingTouchdowns); }
      });
    });
  });
  const season = sum.header.season || {};
  return { game: { id: String(sum.header.id || comp.id), s: season.year, t: season.type, w: sum.header.week, d: comp.date, h: side("home"), a: side("away"), r: Object.keys(rows).map(k => rows[k]) }, names: names };
}
/* games on a scoreboard: id, start, status, teams, venue */
function parseScoreboard(sb) {
  return ((sb && sb.events) || []).map(function (e) {
    const c = e.competitions[0], v = c.venue || {};
    const side = ha => { const t = c.competitors.find(x => x.homeAway === ha).team; return { id: String(t.id), abbr: t.abbreviation, name: t.displayName, logo: t.logo }; };
    return { id: String(e.id), start: e.date, status: e.status && e.status.type && e.status.type.name, completed: !!(e.status && e.status.type && e.status.type.completed),
      week: e.week && e.week.number, season: e.season && e.season.year, type: e.season && e.season.type, home: side("home"), away: side("away"),
      venue: { name: v.fullName || null, city: v.address && v.address.city || null, state: v.address && v.address.state || null, country: v.address && v.address.country || null, indoor: v.indoor === true }, neutral: !!c.neutralSite };
  });
}
function emptyCache(season) { return { source: "ESPN box scores (scripts/nfl-props.js)", note: "Pipeline state: one row per player per finished game this season, columns in cols. Not loaded by the site.", season: season, updatedAt: null, cols: COLS, done: {}, players: {}, games: {} }; }
function readCache(file) { try { const c = JSON.parse(fs.readFileSync(file, "utf8")); if (c && c.games && c.cols && c.cols.join() === COLS.join()) return c; } catch (e) { /* fresh */ } return null; }
/* the season's weeks that have begun, from the scoreboard's calendar: [{ type, week, start, end }] */
function weeksBegun(sb, now) {
  const cal = (((sb && sb.leagues) || [])[0] || {}).calendar || [];
  const out = [];
  cal.forEach(function (st) { const type = Number(st.value); if (type !== 2 && type !== 3) return; (st.entries || []).forEach(function (w) { if (Date.parse(w.startDate) <= now.getTime()) out.push({ type: type, week: Number(w.value), start: w.startDate, end: w.endDate }); }); });
  return out;
}
function upcomingWeeks(sb, now) {
  const cal = (((sb && sb.leagues) || [])[0] || {}).calendar || [];
  const out = [];
  cal.forEach(function (st) { const type = Number(st.value); if (type !== 2 && type !== 3) return; (st.entries || []).forEach(function (w) { if (Date.parse(w.endDate) > now.getTime()) out.push({ type: type, week: Number(w.value), start: w.startDate, end: w.endDate }); }); });
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
function seasonOf(sb, now) { const s = ((((sb && sb.leagues) || [])[0] || {}).season || {}).year || (sb && sb.season && sb.season.year); return s || (now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1); }
/* fetch every finished game of the season not yet in the cache; a week whose games are all in is never asked for again */
async function updateCache(src, cache, sb, now, log) {
  const season = seasonOf(sb, now);
  if (!cache || cache.season !== season) cache = emptyCache(season);
  let fetched = 0, failed = 0;
  for (const w of weeksBegun(sb, now)) {
    const key = w.type + "-" + w.week;
    if (cache.done[key]) continue;
    const wk = await src.week(season, w.type, w.week).catch(() => null); if (!wk) { failed++; continue; }
    const games = parseScoreboard(wk);
    let all = games.length > 0;
    for (const g of games) {
      if (cache.games[g.id] || g.home.id === "31" || g.home.id === "32") continue; /* the Pro Bowl (AFC v NFC) is not a game to learn from */
      if (!g.completed) { all = false; continue; }
      if (fetched >= RULES.maxNewBoxscores) { all = false; continue; }
      const parsed = parseSummary(await src.summary(g.id).catch(() => null));
      if (!parsed) { all = false; failed++; continue; }
      parsed.game.w = parsed.game.w || w.week; parsed.game.t = parsed.game.t || w.type; parsed.game.s = parsed.game.s || season;
      cache.games[g.id] = parsed.game; fetched++;
      Object.keys(parsed.names).forEach(id => { const p = cache.players[id] || (cache.players[id] = [parsed.names[id], null]); p[0] = parsed.names[id]; });
    }
    if (all && Date.parse(w.end) < now.getTime()) cache.done[key] = true;
  }
  cache.updatedAt = now.toISOString();
  if (log) log("NFL box scores: " + fetched + " fetched, " + Object.keys(cache.games).length + " in the cache" + (failed ? ", " + failed + " could not be read" : ""));
  return { cache: cache, fetched: fetched, failed: failed };
}

/* ---------- the projection: usage x efficiency x the defence, from game data only ----------
   Fitted 2026-11-08 on the 2025 regular season (each game projected from that season's earlier games only) and
   tested, unchanged, on 2026 weeks 2-9 (see EVAL and `node scripts/nfl-props.js --eval`). No price takes part. */
const PARAMS = {
  wRecent: 0.1,                                          /* the last three games' share of the usage (targets, carries, attempts): the season tells more */
  k: { ypa: 25, tdr: 300, ypc: 120, cr: 5, ypt: 15,      /* efficiency shrunk toward the league's for the position by this many attempts / carries / targets */
    cmpr: 400, intr: 2000, rtdr: 200, wtdr: 200,         /* 2026-11-10: completion rate, interception rate, touchdowns a carry and a target */
    attG: 6 },                                           /* the attempts and completions markets: a starter's volume pulled toward the league's by six games */
  opp: { k: 16, pow: 0.75,                               /* a defence's allowed-per-game, shrunk toward the league by 16 games: a small effect */
    by: { att: 1, cmp: 1, int: 0.75, car: 0.75, td: 0.25 } }, /* the same rule for the 2026-11-10 markets, each power fitted on 2025 (0 to 1) */
  home: 0.03,                                            /* +3% at home, -3% away */
  homeBy: { att: -0.01, cmp: 0.01, int: 0, car: 0.03, td: 0.05 }, /* the 2026-11-10 counts: the home edge each one showed on 2025 */
  vacate: { tgt: 0, car: 0.3 },                          /* a missing teammate's carries: the rest pick up 30%; his targets: no rule beat none */
  backupQb: { recYds: 0.96, rec: 1, passYds: 1.15, passTds: 1.15 }, /* the usual quarterback out: receivers' yards -4%; the backup's own thin history reads 15% low */
  injured: 0.95,                                         /* the player himself listed Questionable (a prior: no injury history to fit) */
  scale: { passYds: 0.984, passTds: 0.974, rushYds: 0.995, recYds: 0.958, rec: 0.936, /* each stat's level: a usage sample regresses toward the mean */
    att: 0.97, cmp: 0.962, int: 1.008, car: 0.997, td: 1.016, passRushYds: 0.986, rushRecYds: 1.014 },
  wind: { from: 12, pass: 0.012, catch: 0.006, rush: 0.004, max: 0.15 } /* a prior from public research, not fitted (no wind history) */
};
/* league rates for 2025 (the fallback when the season's own sample is thin) */
const LEAGUE_2025 = { ypa: 6.9, tdr: 0.046, ypc: { QB: 4.9, RB: 4.3, WR: 6.5, TE: 4, all: 4.4 }, cr: { WR: 0.63, TE: 0.73, RB: 0.79, QB: 0.5, all: 0.67 }, ypt: { WR: 8.3, TE: 7.4, RB: 6.1, QB: 5, all: 7.6 },
  cmpr: 0.64, intr: 0.022, attStart: 32.5, rtdr: { QB: 0.047, RB: 0.032, WR: 0.03, TE: 0.03, all: 0.034 }, wtdr: { WR: 0.049, TE: 0.057, RB: 0.036, QB: 0.04, all: 0.049 } };
/* the spread of outcomes around a projection: quantiles (5%, 10% ... 95%) of actual / projected on 2025 (n 461 passing,
   861 rushing, 2,026 receiving player-games), by projection size; a receiver projected under 25 yards is often held to 0 */
const DIST = {
  passYds: [{ upTo: null, q: [0.35, 0.58, 0.64, 0.71, 0.76, 0.81, 0.86, 0.9, 0.95, 1, 1.03, 1.08, 1.12, 1.16, 1.23, 1.29, 1.36, 1.45, 1.61] }],
  rushYds: [{ upTo: 30, q: [-0.02, 0, 0.11, 0.19, 0.29, 0.4, 0.47, 0.57, 0.68, 0.75, 0.86, 0.95, 1.05, 1.26, 1.42, 1.66, 1.84, 2.19, 2.8] }, { upTo: 55, q: [0.1, 0.21, 0.32, 0.42, 0.51, 0.56, 0.65, 0.73, 0.81, 0.89, 0.97, 1.05, 1.18, 1.29, 1.38, 1.55, 1.79, 1.93, 2.5] }, { upTo: null, q: [0.29, 0.37, 0.46, 0.54, 0.57, 0.66, 0.73, 0.82, 0.87, 0.92, 0.99, 1.06, 1.11, 1.16, 1.24, 1.38, 1.49, 1.74, 2.02] }],
  recYds: [{ upTo: 25, q: [0, 0, 0.03, 0.2, 0.29, 0.38, 0.48, 0.6, 0.67, 0.79, 0.91, 1.05, 1.17, 1.34, 1.51, 1.75, 2.02, 2.48, 3.63] }, { upTo: 50, q: [0, 0.13, 0.23, 0.34, 0.43, 0.52, 0.61, 0.7, 0.8, 0.87, 0.97, 1.08, 1.19, 1.34, 1.47, 1.68, 1.86, 2.13, 2.63] }, { upTo: null, q: [0.11, 0.25, 0.33, 0.44, 0.53, 0.59, 0.65, 0.72, 0.78, 0.84, 0.92, 0.99, 1.06, 1.17, 1.27, 1.39, 1.58, 1.78, 2.03] }],
  /* 2026-11-10, the same sample: attempts and completions (n 461 each), carries (739 back-games), passing plus rushing
     (461) and rushing plus receiving (739). The three counts are read from quantiles too: a Poisson count was too
     narrow for each (Brier 0.213 against 0.217 for attempts, 0.219 against 0.223, 0.234 against 0.237 for carries) */
  att: [{ upTo: null, q: [0.5, 0.66, 0.73, 0.78, 0.83, 0.87, 0.89, 0.93, 0.97, 1.01, 1.04, 1.09, 1.11, 1.14, 1.18, 1.23, 1.28, 1.37, 1.49] }],
  cmp: [{ upTo: null, q: [0.45, 0.64, 0.71, 0.77, 0.81, 0.86, 0.89, 0.93, 0.95, 0.99, 1.04, 1.09, 1.13, 1.17, 1.2, 1.26, 1.31, 1.38, 1.49] }],
  car: [{ upTo: 8, q: [0.14, 0.26, 0.31, 0.39, 0.54, 0.63, 0.67, 0.75, 0.86, 0.94, 1, 1.11, 1.2, 1.38, 1.44, 1.53, 1.63, 2.03, 2.29] }, { upTo: 14, q: [0.3, 0.4, 0.51, 0.62, 0.72, 0.76, 0.81, 0.87, 0.92, 1, 1.05, 1.14, 1.21, 1.28, 1.36, 1.5, 1.63, 1.77, 1.99] }, { upTo: null, q: [0.41, 0.55, 0.65, 0.72, 0.77, 0.8, 0.82, 0.85, 0.88, 0.91, 0.97, 1.02, 1.08, 1.13, 1.15, 1.21, 1.28, 1.34, 1.54] }],
  passRushYds: [{ upTo: null, q: [0.39, 0.58, 0.68, 0.73, 0.79, 0.85, 0.89, 0.93, 0.98, 1.01, 1.04, 1.08, 1.13, 1.16, 1.24, 1.3, 1.36, 1.43, 1.55] }],
  rushRecYds: [{ upTo: 45, q: [0.05, 0.11, 0.18, 0.3, 0.36, 0.46, 0.58, 0.65, 0.71, 0.78, 0.88, 1.13, 1.22, 1.33, 1.45, 1.57, 1.79, 2.28, 2.69] }, { upTo: 80, q: [0.19, 0.34, 0.47, 0.54, 0.6, 0.65, 0.7, 0.78, 0.83, 0.9, 0.96, 1.02, 1.12, 1.2, 1.36, 1.44, 1.63, 1.87, 2.36] }, { upTo: null, q: [0.36, 0.44, 0.54, 0.6, 0.64, 0.71, 0.76, 0.82, 0.89, 0.95, 1, 1.04, 1.08, 1.13, 1.2, 1.3, 1.42, 1.54, 1.73] }]
};
const QS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
function distFor(k, mean) { const t = DIST[k]; if (!t) return null; const b = t.find(x => x.upTo == null || mean < x.upTo) || t[t.length - 1]; return b.q.map(r => round(r * mean, 1)); }
/* P(X > line): piecewise linear through the quantiles, with thin tails; Poisson for the counts */
function cdfQ(q, x) {
  if (!q || !q.length) return null;
  if (x < q[0]) return q[0] > 0 ? Math.max(0, QS[0] * x / q[0]) : 0;
  if (x >= q[q.length - 1]) { const tau = Math.max(1, (q[q.length - 1] - q[9]) / 3); return 1 - (1 - QS[QS.length - 1]) * Math.exp(-(x - q[q.length - 1]) / tau); }
  let i = 0; for (let j = 0; j < q.length; j++) if (q[j] <= x) i = j;
  if (i >= q.length - 1) return QS[QS.length - 1];
  const a = q[i], b = q[i + 1]; return b > a ? QS[i] + (QS[i + 1] - QS[i]) * (x - a) / (b - a) : QS[i + 1];
}
function poissonCdf(lambda, k) { if (k < 0) return 0; let term = Math.exp(-lambda), sum = term; for (let i = 1; i <= k; i++) { term *= lambda / i; sum += term; } return Math.min(1, sum); }
function pOver(proj, line) {
  if (!proj || line == null) return null;
  if (proj.dist === "poisson") return 1 - poissonCdf(proj.mean, Math.floor(line + 1e-9));
  return 1 - cdfQ(proj.q, line);
}

/* ---------- reading the season's box scores ---------- */
function rowVal(r, k) {
  switch (k) {
    case "passYds": return r[C.pyd]; case "passTds": return r[C.ptd]; case "rushYds": return r[C.ryd]; case "recYds": return r[C.wyd]; case "rec": return r[C.rec];
    case "att": return r[C.att]; case "car": return r[C.car]; case "tgt": return r[C.tgt];
    case "cmp": return r[C.cmp]; case "int": return r[C.int]; case "td": return r[C.rtd] + r[C.wtd];
    case "passRushYds": return r[C.pyd] + r[C.ryd]; case "rushRecYds": return r[C.ryd] + r[C.wyd]; default: return null;
  }
}
/* positions: the roster's word where we have it, else read from usage (a passer is a quarterback, a runner a back) */
function posOf(idx, id) {
  const p = idx.pos[id]; if (p) return p === "FB" ? "RB" : p;
  const u = idx.usage[id]; if (!u) return null;
  if (u.att >= 20 && u.att > u.tgt) return "QB";
  return u.car > u.tgt ? "RB" : "WR";
}
function indexGames(cache, positions) {
  const games = Object.keys(cache.games || {}).map(id => cache.games[id]).filter(g => g && g.h && g.a).sort((a, b) => Date.parse(a.d) - Date.parse(b.d));
  const idx = { games: games, byPlayer: {}, byTeam: {}, pos: {}, usage: {}, names: {} };
  Object.keys(cache.players || {}).forEach(id => { const p = cache.players[id]; idx.names[id] = p[0]; if (p[1]) idx.pos[id] = p[1]; });
  Object.keys(positions || {}).forEach(id => { const p = positions[id]; if (p && p[1] && !idx.pos[id]) idx.pos[id] = p[1]; if (p && p[0] && !idx.names[id]) idx.names[id] = p[0]; });
  games.forEach(function (g) {
    const teams = {}; teams[g.h[0]] = { home: true, opp: g.a[0], oppAbbr: g.a[1], score: g.h[2], oppScore: g.a[2], rows: [] }; teams[g.a[0]] = { home: false, opp: g.h[0], oppAbbr: g.h[1], score: g.a[2], oppScore: g.h[2], rows: [] };
    g.r.forEach(function (r) {
      const t = teams[r[C.team]]; if (!t) return; t.rows.push(r);
      const u = idx.usage[r[C.id]] || (idx.usage[r[C.id]] = { att: 0, car: 0, tgt: 0 }); u.att += r[C.att]; u.car += r[C.car]; u.tgt += r[C.tgt];
    });
    Object.keys(teams).forEach(function (tid) {
      const t = teams[tid];
      const tot = { att: 0, car: 0, tgt: 0, pyd: 0, ptd: 0, ryd: 0, rec: 0, wyd: 0 };
      t.rows.forEach(r => { tot.att += r[C.att]; tot.car += r[C.car]; tot.tgt += r[C.tgt]; tot.pyd += r[C.pyd]; tot.ptd += r[C.ptd]; tot.ryd += r[C.ryd]; tot.rec += r[C.rec]; tot.wyd += r[C.wyd]; });
      const entry = { gid: g.id, d: g.d, w: g.w, team: tid, home: t.home, opp: t.opp, oppAbbr: t.oppAbbr, score: t.score, oppScore: t.oppScore, tot: tot, rows: t.rows };
      (idx.byTeam[tid] = idx.byTeam[tid] || []).push(entry);
      t.rows.forEach(r => { (idx.byPlayer[r[C.id]] = idx.byPlayer[r[C.id]] || []).push({ gid: g.id, d: g.d, w: g.w, team: tid, home: t.home, opp: t.opp, oppAbbr: t.oppAbbr, result: t.score > t.oppScore ? "W" : t.score < t.oppScore ? "L" : "T", score: t.score + "-" + t.oppScore, r: r, tt: tot }); });
    });
  });
  return idx;
}
const before = (list, t) => (list || []).filter(x => Date.parse(x.d) < t);
/* league rates from every game before t: per attempt, carry and target by position, and what a defence allows a game */
function leagueRates(idx, t) {
  const s = { att: 0, pyd: 0, ptd: 0, cmp: 0, int: 0, car: {}, ryd: {}, tgt: {}, rec: {}, wyd: {}, rtd: {}, wtd: {}, teamGames: 0, allowed: emptyAllowed() };
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; o.all = (o.all || 0) + v; };
  idx.games.forEach(function (g) {
    if (Date.parse(g.d) >= t) return;
    s.teamGames += 2;
    g.r.forEach(function (r) {
      const pos = posOf(idx, r[C.id]) || "WR";
      s.att += r[C.att]; s.pyd += r[C.pyd]; s.ptd += r[C.ptd]; s.cmp += r[C.cmp]; s.int += r[C.int];
      if (r[C.att] >= 10) { s.starts = (s.starts || 0) + 1; s.startAtt = (s.startAtt || 0) + r[C.att]; }
      add(s.car, pos, r[C.car]); add(s.ryd, pos, r[C.ryd]); add(s.tgt, pos, r[C.tgt]); add(s.rec, pos, r[C.rec]); add(s.wyd, pos, r[C.wyd]); add(s.rtd, pos, r[C.rtd]); add(s.wtd, pos, r[C.wtd]);
      addAllowed(s.allowed, r, pos);
    });
  });
  const L = LEAGUE_2025, ratio = (num, den, fb, k) => den >= (k || 1) ? num / den : fb;
  const out = { ypa: ratio(s.pyd, s.att, L.ypa, 500), tdr: ratio(s.ptd, s.att, L.tdr, 500), cmpr: ratio(s.cmp, s.att, L.cmpr, 500), intr: ratio(s.int, s.att, L.intr, 1500), attStart: ratio(s.startAtt || 0, s.starts || 0, L.attStart, 30), ypc: {}, cr: {}, ypt: {}, rtdr: {}, wtdr: {}, teamGames: s.teamGames, allowed: {} };
  ["QB", "RB", "WR", "TE", "all"].forEach(function (p) {
    out.ypc[p] = ratio(s.ryd[p] || 0, s.car[p] || 0, L.ypc[p], 150); out.cr[p] = ratio(s.rec[p] || 0, s.tgt[p] || 0, L.cr[p], 150); out.ypt[p] = ratio(s.wyd[p] || 0, s.tgt[p] || 0, L.ypt[p], 150);
    out.rtdr[p] = ratio(s.rtd[p] || 0, s.car[p] || 0, L.rtdr[p], 1500); out.wtdr[p] = ratio(s.wtd[p] || 0, s.tgt[p] || 0, L.wtdr[p], 1500);
  });
  const tg = Math.max(1, s.teamGames), a = s.allowed, per = o => { const x = {}; Object.keys(o).forEach(k => { x[k] = typeof o[k] === "object" ? per(o[k]) : o[k] / tg; }); return x; };
  out.allowed = per(a);
  return out;
}
/* what one defence has allowed a game before t: passing yards and touchdowns, rushing yards by non-quarterbacks, catches and receiving yards by position */
function emptyAllowed() { return { passYds: 0, passTds: 0, rushYds: 0, att: 0, cmp: 0, int: 0, car: 0, recYds: { WR: 0, TE: 0, RB: 0 }, rec: { WR: 0, TE: 0, RB: 0 }, td: { WR: 0, TE: 0, RB: 0 } }; }
/* one offensive row against a defence: passing by anyone, rushing by non-quarterbacks, receiving by position group */
function addAllowed(a, r, pos) {
  a.passYds += r[C.pyd]; a.passTds += r[C.ptd]; a.att += r[C.att]; a.cmp += r[C.cmp]; a.int += r[C.int];
  if (pos !== "QB") { a.rushYds += r[C.ryd]; a.car += r[C.car]; }
  if (a.recYds[pos] != null) { a.recYds[pos] += r[C.wyd]; a.rec[pos] += r[C.rec]; a.td[pos] += r[C.rtd] + r[C.wtd]; }
}
const BY_GROUP = { recYds: true, rec: true, td: true };
function allowedOf(a, k, pos) { if (!a || a[k] == null) return null; return BY_GROUP[k] ? a[k][pos === "TE" || pos === "RB" ? pos : "WR"] : a[k]; }
function defenceAllowed(idx, teamId, t) {
  const out = Object.assign({ games: 0 }, emptyAllowed());
  /* the offence that faced this defence: the opponent's rows in each of its games */
  before(idx.byTeam[teamId], t).forEach(function (e) {
    const opp = (idx.byTeam[e.opp] || []).find(x => x.gid === e.gid); if (!opp) return;
    out.games++;
    opp.rows.forEach(function (r) { addAllowed(out, r, posOf(idx, r[C.id]) || "WR"); });
  });
  return out;
}
function oppFactor(def, lg, k, pos, params) {
  if (!def || !def.games) return { f: 1, perGame: null, lg: null };
  const P = params.opp, pow = P.by && P.by[k] != null ? P.by[k] : P.pow;
  const sum = allowedOf(def, k, pos), mean = allowedOf(lg.allowed, k, pos);
  if (!mean || sum == null) return { f: 1, perGame: null, lg: null };
  const f = Math.pow((sum + P.k * mean) / ((def.games + P.k) * mean), pow);
  return { f: f, perGame: sum / def.games, lg: mean };
}
/* every defence's rank for one stat and position group, 1 = allows the most */
function defenceRanks(idx, t, k, pos) {
  const vals = Object.keys(idx.byTeam).map(function (tid) {
    const d = defenceAllowed(idx, tid, t); if (!d.games) return null;
    const v = allowedOf(d, k, pos); if (v == null) return null;
    return { tid: tid, v: v / d.games };
  }).filter(Boolean).sort((a, b) => b.v - a.v);
  const out = {}; vals.forEach((x, i) => { out[x.tid] = { rank: i + 1, perGame: round(x.v, 1), of: vals.length }; });
  return out;
}

/* one player's projection for a game, from the games before it.
   g: { t (start ms), team, opp, home, outIds (teammates not playing), starterOut (the team's usual quarterback is not), wind (mph), injury, isStarter } */
function projectPlayer(idx, pid, g, params, lgIn) {
  params = params || PARAMS;
  const games = before(idx.byPlayer[pid], g.t);
  if (!games.length) return null;
  const pos = posOf(idx, pid) || "WR";
  const lg = lgIn || leagueRates(idx, g.t);
  const last3 = games.slice(-3);
  const per = (list, k) => list.length ? avg(list.map(x => rowVal(x.r, k))) : 0;
  const tot = col => games.reduce((s, x) => s + x.r[C[col]], 0); /* raw box score columns */
  const blend = k => params.wRecent * per(last3, k) + (1 - params.wRecent) * per(games, k);
  const usage = { att: blend("att"), car: blend("car"), tgt: blend("tgt"), season: { att: per(games, "att"), car: per(games, "car"), tgt: per(games, "tgt") }, last3: { att: per(last3, "att"), car: per(last3, "car"), tgt: per(last3, "tgt") } };
  /* quarterbacks: attempts as a starter only (a relief appearance would drag the rate down) */
  if (pos === "QB") {
    const starts = games.filter(x => rowVal(x.r, "att") >= 10), s3 = starts.slice(-3);
    if (starts.length) { usage.att = params.wRecent * per(s3, "att") + (1 - params.wRecent) * per(starts, "att"); usage.season.att = per(starts, "att"); usage.last3.att = per(s3, "att"); }
    else usage.att = 30; /* a backup's first start: about a league starter's volume */
    usage.starts = starts.length;
  }
  const reasons = {}, parts = {};
  STAT_KEYS.forEach(k => { reasons[k] = []; parts[k] = {}; });
  /* teammates missing: the rest pick up part of their targets and carries */
  let tgtUp = 1, carUp = 1;
  if (g.outIds && g.outIds.length) {
    const team = before(idx.byTeam[g.team], g.t).slice(-6);
    const share = (id, k) => { let mine = 0, all = 0; team.forEach(e => { const r = e.rows.find(x => x[C.id] === id); if (!r) return; mine += rowVal(r, k); all += e.tot[k]; }); return all ? mine / all : 0; };
    let vt = 0, vc = 0; const named = [];
    g.outIds.forEach(id => { if (id === pid) return; const st = share(id, "tgt"), sc = share(id, "car"); vt += st; vc += sc; if (st >= 0.12 || sc >= 0.25) named.push({ id: id, st: st, sc: sc }); });
    vt = Math.min(vt, 0.6); vc = Math.min(vc, 0.7);
    tgtUp = 1 + params.vacate.tgt * vt / (1 - vt); carUp = 1 + params.vacate.car * vc / (1 - vc);
    named.forEach(n => {
      const nm = idx.names[n.id] || "A teammate";
      if (n.st >= 0.12 && tgtUp > 1.02) ["recYds", "rec"].forEach(k => reasons[k].push({ lean: "over", label: "Targets up " + Math.round((tgtUp - 1) * 100) + "%: " + nm + " (out) took " + Math.round(n.st * 100) + "% of the targets" }));
      if (n.sc >= 0.25 && carUp > 1.02) ["rushYds", "car"].forEach(k => reasons[k].push({ lean: "over", label: "Carries up " + Math.round((carUp - 1) * 100) + "%: " + nm + " (out) took " + Math.round(n.sc * 100) + "% of the carries" }));
    });
  }
  const tgtU = usage.tgt * Math.min(tgtUp, 1.4), carU = usage.car * Math.min(carUp, 1.5), attU = usage.att;
  /* efficiency, shrunk toward the league's for the position */
  const K = params.k, lp = p => (p === "QB" || p === "RB" || p === "WR" || p === "TE") ? p : "all";
  const ypa = (tot("pyd") + K.ypa * lg.ypa) / (tot("att") + K.ypa);
  const tdr = (tot("ptd") + K.tdr * lg.tdr) / (tot("att") + K.tdr);
  const ypc = (tot("ryd") + K.ypc * lg.ypc[lp(pos)]) / (tot("car") + K.ypc);
  const cr = (tot("rec") + K.cr * lg.cr[lp(pos)]) / (tot("tgt") + K.cr);
  const ypt = (tot("wyd") + K.ypt * lg.ypt[lp(pos)]) / (tot("tgt") + K.ypt);
  /* 2026-11-10: completions and interceptions an attempt, touchdowns a carry and a target, shrunk the same way */
  const cmpr = (tot("cmp") + K.cmpr * lg.cmpr) / (tot("att") + K.cmpr);
  const intr = (tot("int") + K.intr * lg.intr) / (tot("att") + K.intr);
  const rtdr = (tot("rtd") + K.rtdr * lg.rtdr[lp(pos)]) / (tot("car") + K.rtdr);
  const wtdr = (tot("wtd") + K.wtdr * lg.wtdr[lp(pos)]) / (tot("tgt") + K.wtdr);
  const def = g.opp ? defenceAllowed(idx, g.opp, g.t) : null;
  /* the attempts and completions markets read the starter's volume pulled toward a league starter's by K.attG games
     (a count regresses; the yards and touchdown projections keep the volume they were fitted on) */
  const attV = K.attG ? (attU * (usage.starts || 0) + K.attG * lg.attStart) / ((usage.starts || 0) + K.attG) : attU;
  const base = { passYds: attU * ypa, passTds: attU * tdr, rushYds: carU * ypc, recYds: tgtU * ypt, rec: tgtU * cr,
    att: attV, cmp: attV * cmpr, int: attU * intr, car: carU, td: carU * rtdr + tgtU * wtdr };
  const out = {}, exact = {};
  const finish = function (k, m) { const proj = { mean: round(m, 1), dist: STATS[k].dist }; if (proj.dist === "ratio") proj.q = distFor(k, m); out[k] = proj; exact[k] = m; };
  BASE_KEYS.forEach(function (k) {
    let m = base[k];
    const of = oppFactor(def, lg, k, pos, params); m *= of.f; parts[k].opp = round(of.f, 3); parts[k].oppPerGame = of.perGame == null ? null : round(of.perGame, 1); parts[k].oppLeague = of.lg == null ? null : round(of.lg, 1);
    const hb = params.homeBy && params.homeBy[k] != null ? params.homeBy[k] : params.home, home = 1 + (g.home ? hb : -hb);
    m *= home; parts[k].home = round(home, 3);
    if (g.starterOut && pos !== "QB" && params.backupQb[k]) { m *= params.backupQb[k]; parts[k].backupQb = params.backupQb[k]; }
    if (g.starterOut && pos === "QB" && g.isBackup && params.backupQb[k]) { m *= params.backupQb[k]; parts[k].backupQb = params.backupQb[k]; }
    if (g.wind != null && g.wind > params.wind.from) {
      const over = g.wind - params.wind.from, W = params.wind;
      const f = k === "passYds" || k === "passTds" || k === "recYds" ? 1 - Math.min(W.max, W.pass * over) : k === "rec" || k === "cmp" ? 1 - Math.min(W.max, W.catch * over) : k === "rushYds" || k === "car" ? 1 + Math.min(W.max / 2, W.rush * over) : 1;
      m *= f; parts[k].wind = round(f, 3);
    }
    if (g.injury && k !== "int") { m *= params.injured; parts[k].injured = params.injured; } /* a hobbled quarterback does not throw fewer interceptions */
    if (params.scale && params.scale[k]) m *= params.scale[k];
    finish(k, m);
  });
  /* the combined markets are the sum of their parts (each already carries its defence, home, wind and injury), then their own level */
  SUM_KEYS.forEach(function (k) {
    const a = STATS[k].sum; let m = exact[a[0]] + exact[a[1]];
    parts[k].sum = [round(exact[a[0]], 1), round(exact[a[1]], 1)];
    if (params.scale && params.scale[k]) m *= params.scale[k];
    finish(k, m);
  });
  return { pos: pos, gp: games.length, usage: usage, eff: { ypa: ypa, tdr: tdr, ypc: ypc, cr: cr, ypt: ypt, cmpr: cmpr, intr: intr, rtdr: rtdr, wtdr: wtdr, attV: attV, attLeague: lg.attStart, carU: carU, tgtU: tgtU }, proj: out, parts: parts, reasons: reasons, tgtUp: tgtUp, carUp: carUp, games: games };
}

/* ---------- the honest check: every game projected from the games before it, against what happened ----------
   No prop lines are kept historically, so the line is the player's own running median (rounded to a half, so nothing
   pushes) and the question is whether our P(over) at that number comes true as often as it says. The sample is the
   players a book would price: the team's usual quarterback; anyone averaging 5+ carries or 3+ targets over 2+ games;
   only games he appeared in (a box score lists no one without a stat, so a zero-target game is missed: a small lean
   to the over in the sample). Injuries are read from who played (ESPN keeps no injury history), so the teammate and
   backup-quarterback rules are tested on what actually happened, not on a report. */
const PHANTOM = 3;
function weightedHit(vals, line) { let num = PHANTOM, den = 2 * PHANTOM; vals.slice(0, 10).forEach((v, i) => { const w = i < 5 ? 1 : 0.6; den += w; if (v > line) num += w; }); return num / den; }
function median(a) { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function evalSample(idx, opts) {
  opts = opts || {};
  const params = opts.params || PARAMS, fromWeek = opts.fromWeek || 2, rows = [];
  const lgCache = {};
  idx.games.forEach(function (g) {
    if (g.t !== 2 || g.w < fromWeek || (opts.toWeek && g.w > opts.toWeek)) return;
    const t = Date.parse(g.d), lg = lgCache[g.d] || (lgCache[g.d] = leagueRates(idx, t));
    [g.h, g.a].forEach(function (side, si) {
      const team = side[0], opp = (si === 0 ? g.a : g.h)[0], home = si === 0;
      const prior = before(idx.byTeam[team], t), last3 = prior.slice(-3);
      if (prior.length < 2) return;
      const now = (idx.byTeam[team] || []).find(e => e.gid === g.id); if (!now) return;
      const played = {}; now.rows.forEach(r => { played[r[C.id]] = r; });
      /* the usual quarterback: most attempts over the last three games */
      const attBy = {}; last3.forEach(e => e.rows.forEach(r => { if (r[C.att]) attBy[r[C.id]] = (attBy[r[C.id]] || 0) + r[C.att]; }));
      const qb = Object.keys(attBy).sort((a, b) => attBy[b] - attBy[a])[0];
      const starterOut = !!(qb && !played[qb]);
      /* regulars missing today */
      const seen = {}; last3.forEach(e => e.rows.forEach(r => { if (r[C.tgt] + r[C.car] >= 3) seen[r[C.id]] = (seen[r[C.id]] || 0) + 1; }));
      const outIds = Object.keys(seen).filter(id => seen[id] >= 2 && !played[id]);
      Object.keys(played).forEach(function (pid) {
        const hist = before(idx.byPlayer[pid], t); if (hist.length < 2) return;
        const pos = posOf(idx, pid) || "WR";
        const mean = k => avg(hist.map(x => rowVal(x.r, k)));
        const keys = [];
        if (pid === qb || (starterOut && pos === "QB" && played[pid][C.att] > 0 && !Object.keys(played).some(o => o !== pid && posOf(idx, o) === "QB" && (attBy[o] || 0) > (attBy[pid] || 0)))) keys.push("passYds", "passTds");
        const isQb = keys.length > 0;
        if (isQb) keys.push("att", "cmp", "int", "passRushYds");
        if (mean("car") >= 5) keys.push("rushYds");
        if (mean("tgt") >= 3 && pos !== "QB") keys.push("recYds", "rec");
        /* 2026-11-10: the usual quarterback's attempts, completions, interceptions and passing plus rushing; a back's
           carries and rushing plus receiving; a touchdown (rushing or receiving, the anytime-scorer market read as over
           0.5) for every back and receiver priced */
        if (pos === "RB" && mean("car") >= 5) keys.push("car", "rushRecYds");
        if (pos !== "QB" && (mean("car") >= 5 || mean("tgt") >= 3)) keys.push("td");
        if (!keys.length) return;
        const pr = projectPlayer(idx, pid, { t: t, team: team, opp: opp, home: home, outIds: outIds, starterOut: starterOut, isBackup: pos === "QB" && pid !== qb }, params, lg);
        if (!pr) return;
        keys.forEach(function (k) {
          const vals = hist.map(x => rowVal(x.r, k)).reverse(); /* newest first */
          const line = k === "td" ? 0.5 : Math.floor(median(vals)) + 0.5; /* a touchdown is only ever quoted at 0.5 */
          const actual = rowVal(played[pid], k);
          rows.push({ k: k, pid: pid, pos: pos, w: g.w, gid: g.id, gp: hist.length, proj: pr.proj[k], base: avg(vals), actual: actual, line: line, pModel: pOver(pr.proj[k], line), pHit: weightedHit(vals, line), tgtUp: pr.tgtUp, carUp: pr.carUp, starterOut: starterOut, isQb: pos === "QB" });
        });
      });
    });
  });
  return rows;
}
function summarise(rows) {
  const out = {};
  STAT_KEYS.forEach(function (k) {
    const r = rows.filter(x => x.k === k); if (!r.length) return;
    const mae = f => avg(r.map(x => Math.abs(f(x) - x.actual)));
    const brier = f => avg(r.map(x => { const y = x.actual > x.line ? 1 : 0; return (f(x) - y) * (f(x) - y); }));
    const ll = f => avg(r.map(x => { const y = x.actual > x.line ? 1 : 0, p = Math.min(0.99, Math.max(0.01, f(x))); return -(y * Math.log(p) + (1 - y) * Math.log(1 - p)); }));
    const blend = x => 0.5 * x.pModel + 0.5 * x.pHit;
    const bins = [[0, 0.4], [0.4, 0.45], [0.45, 0.5], [0.5, 0.55], [0.55, 0.6], [0.6, 1.01]].map(function (b) {
      const s = r.filter(x => blend(x) >= b[0] && blend(x) < b[1]); const sm = r.filter(x => x.pModel >= b[0] && x.pModel < b[1]);
      return { bin: b[0] + "-" + Math.min(1, b[1]), n: s.length, said: s.length ? round(avg(s.map(blend)), 3) : null, hit: s.length ? round(avg(s.map(x => x.actual > x.line ? 1 : 0)), 3) : null,
        nModel: sm.length, saidModel: sm.length ? round(avg(sm.map(x => x.pModel)), 3) : null, hitModel: sm.length ? round(avg(sm.map(x => x.actual > x.line ? 1 : 0)), 3) : null };
    });
    const lean = r.filter(x => Math.max(blend(x), 1 - blend(x)) >= 0.56);
    out[k] = { n: r.length, players: new Set(r.map(x => x.pid)).size, maeModel: round(mae(x => x.proj.mean), 2), maeBase: round(mae(x => x.base), 2), maeGain: round(1 - mae(x => x.proj.mean) / mae(x => x.base), 4),
      overRate: round(avg(r.map(x => x.actual > x.line ? 1 : 0)), 3), brier: { model: round(brier(x => x.pModel), 4), hit: round(brier(x => x.pHit), 4), blend: round(brier(blend), 4), even: round(brier(() => 0.5), 4) },
      logLoss: { model: round(ll(x => x.pModel), 4), blend: round(ll(blend), 4), even: round(ll(() => 0.5), 4) }, bins: bins,
      leanOrBetter: { n: lean.length, won: round(avg(lean.map(x => (blend(x) >= 0.5) === (x.actual > x.line) ? 1 : 0)), 3) } };
  });
  return out;
}

/* ---------- the run: the next game day's players, projected and (on a game day) priced ---------- */
/* outdoor stadiums, for the wind at kickoff (domes, retractable roofs and SoFi's canopy are left out); by the home club */
const STADIUMS = {
  BAL: [39.278, -76.623, "Baltimore"], BUF: [42.774, -78.787, "Orchard Park"], CAR: [35.226, -80.853, "Charlotte"], CHI: [41.862, -87.617, "Chicago"],
  CIN: [39.095, -84.516, "Cincinnati"], CLE: [41.506, -81.7, "Cleveland"], DEN: [39.744, -105.02, "Denver"], GB: [44.501, -88.062, "Green Bay"],
  JAX: [30.324, -81.637, "Jacksonville"], KC: [39.049, -94.484, "Kansas City"], MIA: [25.958, -80.239, "Miami Gardens"], NE: [42.091, -71.264, "Foxborough"],
  NYG: [40.814, -74.074, "East Rutherford"], NYJ: [40.814, -74.074, "East Rutherford"], PHI: [39.901, -75.168, "Philadelphia"], PIT: [40.447, -80.016, "Pittsburgh"],
  SF: [37.403, -121.97, "Santa Clara"], SEA: [47.595, -122.332, "Seattle"], TB: [27.976, -82.503, "Tampa"], TEN: [36.166, -86.771, "Nashville"], WSH: [38.908, -76.864, "Landover"]
};
const UNAVAILABLE = /^(out|doubtful|injured reserve|ir\b|suspended|pup|physically unable|non-football|nfi|reserve)/i;
function sameCity(a, b) { const n = s => String(s || "").toLowerCase().replace(/[^a-z]/g, ""); return !!a && !!b && (n(a) === n(b) || n(a).indexOf(n(b)) !== -1 || n(b).indexOf(n(a)) !== -1); }
/* the wind at kickoff from the National Weather Service's hourly forecast (sustained mph; "10 to 15 mph" reads 15) */
async function windAt(src, game, now) {
  const s = STADIUMS[game.home.abbr]; if (!s || game.venue.indoor || game.neutral || (game.venue.country && game.venue.country !== "USA") || !sameCity(game.venue.city, s[2])) return null;
  const t = Date.parse(game.start); if (t - now.getTime() > 6.5 * 864e5) return null; /* the hourly forecast runs about a week */
  const pt = await src.point(s[0], s[1]).catch(() => null); const url = pt && pt.properties && pt.properties.forecastHourly; if (!url) return null;
  const fc = await src.hourly(url).catch(() => null); const periods = fc && fc.properties && fc.properties.periods; if (!periods) return null;
  const p = periods.find(x => Date.parse(x.startTime) <= t && t < Date.parse(x.endTime)); if (!p) return null;
  const mph = String(p.windSpeed || "").match(/\d+/g); if (!mph) return null;
  return { mph: Math.max.apply(null, mph.map(Number)), dir: p.windDirection || null, at: p.startTime, source: "National Weather Service" };
}
/* the next NFL game day: today's while any game is still to finish, else the earliest day ahead in this week or the next */
async function slateFor(src, todaySb, now) {
  const todays = parseScoreboard(todaySb).filter(g => !g.completed && !/POSTPONED|CANCELED/.test(g.status || ""));
  if (todays.length) return { date: etDate(now), games: todays, today: true };
  const season = seasonOf(todaySb, now);
  for (const w of upcomingWeeks(todaySb, now).slice(0, 2)) {
    const games = parseScoreboard(await src.week(season, w.type, w.week).catch(() => null)).filter(g => !g.completed && Date.parse(g.start) > now.getTime());
    if (games.length) { const day = games.map(g => etDate(new Date(g.start))).sort()[0]; return { date: day, games: games.filter(g => etDate(new Date(g.start)) === day), today: false, week: w.week }; }
  }
  return { date: null, games: [], today: false };
}
/* a roster flattened: id -> { name, pos, jersey, headshot, status, group } */
function rosterMap(r) {
  const out = {};
  ((r && r.athletes) || []).forEach(function (g) {
    (g.items || []).forEach(function (a) {
      const inj = (a.injuries || [])[0], group = g.position || "";
      let status = inj && inj.status ? inj.status : null;
      if (!status && /injuredReserve|suspended/i.test(group)) status = /suspended/i.test(group) ? "Suspended" : "Injured Reserve";
      out[String(a.id)] = { id: String(a.id), name: a.displayName, pos: a.position && a.position.abbreviation, jersey: a.jersey || null, headshot: a.headshot && a.headshot.href || null, status: status, group: group };
    });
  });
  return out;
}
/* one game in a player's log: the position's columns only (a receiver's passing line is always empty) */
function logRow(x, pos) {
  const r = x.r, o = { date: String(x.d).slice(0, 10), week: x.w, opp: x.oppAbbr, home: x.home, result: x.result, score: x.score };
  if (pos === "QB") Object.assign(o, { att: r[C.att], cmp: r[C.cmp], passYds: r[C.pyd], passTds: r[C.ptd], int: r[C.int], car: r[C.car], rushYds: r[C.ryd], passRushYds: r[C.pyd] + r[C.ryd] });
  else Object.assign(o, pos === "RB" ? { car: r[C.car], rushYds: r[C.ryd] } : {}, { tgt: r[C.tgt], rec: r[C.rec], recYds: r[C.wyd], td: r[C.rtd] + r[C.wtd] }, pos === "RB" ? { rushRecYds: r[C.ryd] + r[C.wyd] } : {});
  return o;
}
function statBlock(vals, homes) {
  const all = vals.filter(v => v != null), l5 = all.slice(0, 5), l10 = all.slice(0, 10);
  const home = vals.filter((v, i) => homes[i]), away = vals.filter((v, i) => !homes[i]);
  return { season: round(avg(all)), l5: round(avg(l5)), l10: round(avg(l10)), home: home.length ? round(avg(home)) : 0, away: away.length ? round(avg(away)) : 0, sd: round(sd(l10)), last: l10 };
}
function ordinal(n) { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
const POS_WORD = { QB: "quarterbacks", RB: "running backs", WR: "wide receivers", TE: "tight ends" };
/* the reasons and confluences for one player, in the page's words */
function explain(p, pr, g, ranks) {
  const reasons = {}, sig = [], u = pr.usage, n1 = x => round(x, 1), per = (x, one, many) => n1(x) + " " + (n1(x) === 1 ? one : many);
  /* a combined market is explained by its parts, so the parts are reasoned through even when not graded on their own */
  const rk = p.keys.slice(); p.keys.forEach(k => (STATS[k].sum || []).forEach(a => { if (rk.indexOf(a) === -1) rk.push(a); }));
  rk.forEach(k => { reasons[k] = (pr.reasons[k] || []).slice(); });
  const why = {}, has = k => p.keys.indexOf(k) !== -1, sumOf = k => (pr.parts[k] && pr.parts[k].sum) || [];
  if (has("att")) why.att = n1(u.season.att) + " attempts a start, read as " + n1(pr.eff.attV) + " (a count drifts toward the league's " + n1(pr.eff.attLeague) + ")";
  if (has("cmp")) why.cmp = per(pr.eff.attV, "attempt", "attempts") + " a game, " + Math.round(pr.eff.cmpr * 100) + "% completed";
  if (has("int")) why.int = per(u.att, "attempt", "attempts") + " a game, an interception on " + n1(pr.eff.intr * 100) + "% of them";
  if (has("car")) why.car = per(pr.eff.carU, "carry", "carries") + " a game";
  if (has("passRushYds")) why.passRushYds = "passing " + sumOf("passRushYds")[0] + " + rushing " + sumOf("passRushYds")[1];
  if (has("rushRecYds")) why.rushRecYds = "rushing " + sumOf("rushRecYds")[0] + " + receiving " + sumOf("rushRecYds")[1];
  if (has("td")) why.td = per(pr.eff.carU, "carry", "carries") + " and " + per(pr.eff.tgtU, "target", "targets") + " a game, a touchdown on " + n1(pr.eff.rtdr * 100) + "% of carries and " + n1(pr.eff.wtdr * 100) + "% of targets";
  if (p.keys.indexOf("passYds") !== -1) why.passYds = per(u.att, "attempt", "attempts") + " a game at " + n1(pr.eff.ypa) + " yards an attempt";
  if (p.keys.indexOf("passTds") !== -1) why.passTds = per(u.att, "attempt", "attempts") + " a game, a touchdown on " + n1(pr.eff.tdr * 100) + "% of them";
  if (p.keys.indexOf("rushYds") !== -1) why.rushYds = per(u.car * (pr.carUp > 1 ? Math.min(pr.carUp, 1.5) : 1), "carry", "carries") + " a game at " + n1(pr.eff.ypc) + " yards a carry";
  if (p.keys.indexOf("recYds") !== -1) why.recYds = per(u.tgt, "target", "targets") + " a game at " + n1(pr.eff.ypt) + " yards a target";
  if (p.keys.indexOf("rec") !== -1) why.rec = per(u.tgt, "target", "targets") + " a game, " + Math.round(pr.eff.cr * 100) + "% caught";
  /* the defence, against the league, for this position */
  rk.forEach(function (k) {
    const r = ranks[k] && ranks[k][g.opp]; const part = pr.parts[k] || {};
    if (!r || part.opp == null) return;
    const group = POS_WORD[p.pos === "QB" ? "WR" : p.pos];
    const word = { passYds: "passing yards", passTds: "passing touchdowns", att: "pass attempts", cmp: "completions", int: "interceptions", rushYds: "rushing yards to backs", car: "carries to backs", recYds: "receiving yards to " + group, rec: "catches to " + group, td: "touchdowns to " + group }[k];
    const text = p.oppAbbr + (k === "int" ? " takes " : " allows ") + r.perGame + " " + word + " a game, " + (r.rank <= r.of / 2 ? ordinal(r.rank) + " most" : ordinal(r.of + 1 - r.rank) + " fewest") + " (" + (part.opp >= 1 ? "+" : "") + Math.round((part.opp - 1) * 100) + "%)";
    if (r.rank <= 8) reasons[k].push({ lean: "over", label: text }); else if (r.rank > r.of - 8) reasons[k].push({ lean: "under", label: text }); else reasons[k].push({ lean: "neutral", label: text });
  });
  const main = p.pos === "QB" ? "passYds" : p.pos === "RB" ? "rushYds" : "recYds";
  const mr = ranks[main] && ranks[main][g.opp];
  if (mr && mr.rank <= 8) sig.push({ key: "opp", label: p.oppAbbr + " allows " + mr.perGame + " a game to " + POS_WORD[p.pos] + " (" + ordinal(mr.rank) + " most)", lean: "over" });
  else if (mr && mr.rank > mr.of - 8) sig.push({ key: "opp", label: p.oppAbbr + " allows " + mr.perGame + " a game to " + POS_WORD[p.pos] + " (" + ordinal(mr.of + 1 - mr.rank) + " fewest)", lean: "under" });
  /* usage trend: the last three against the season */
  const uk = p.pos === "QB" ? "att" : p.pos === "RB" ? "car" : "tgt", uw = { att: "Attempts", car: "Carries", tgt: "Targets" }[uk];
  if (u.season[uk] >= 3 && pr.gp >= 4) { const d = u.last3[uk] / u.season[uk] - 1; if (Math.abs(d) >= 0.2) sig.push({ key: "usage", label: uw + " " + (d > 0 ? "up" : "down") + ": " + n1(u.last3[uk]) + " a game last 3 vs " + n1(u.season[uk]) + " season", lean: d > 0 ? "over" : "under" }); }
  p.keys.filter(k => CORE_KEYS.indexOf(k) !== -1).forEach(function (k) { const s = p.stats[k]; if (!s || pr.gp < 4 || s.season < (k === "passTds" || k === "rec" ? 1 : 10)) return; const l3 = avg(s.last.slice(0, 3)), d = l3 / s.season - 1; if (Math.abs(d) >= 0.25) sig.push({ key: k, label: STATS[k].label + " " + (d > 0 ? "up " : "down ") + Math.round(Math.abs(d) * 100) + "% last 3", lean: d > 0 ? "over" : "under" }); });
  const ms = p.stats[main]; if (ms && ms.home && ms.away && pr.gp >= 4) { const mine = p.home ? ms.home : ms.away, other = p.home ? ms.away : ms.home, d = other ? mine / other - 1 : 0; if (Math.abs(d) >= 0.2) sig.push({ key: "split", label: (p.home ? "At home" : "On the road") + ": " + mine + " vs " + other + " " + STATS[main].label.toLowerCase(), lean: d > 0 ? "over" : "under" }); }
  if (p.restDays != null && p.restDays <= 5) sig.push({ key: "rest", label: "Short week: " + p.restDays + " days since his last game", lean: "neutral" });
  else if (p.restDays != null && p.restDays >= 13) sig.push({ key: "rest", label: "Off a bye: " + p.restDays + " days since his last game", lean: "neutral" });
  if (g.wind && g.wind.mph > PARAMS.wind.from) {
    const text = "Wind " + g.wind.mph + " mph at kickoff (National Weather Service forecast), a prior from public research, not fitted";
    sig.push({ key: "wind", label: "Wind " + g.wind.mph + " mph at kickoff", lean: p.pos === "RB" ? "neutral" : "under" });
    rk.forEach(k => { const f = (pr.parts[k] || {}).wind; if (f && Math.abs(f - 1) >= 0.01) reasons[k].push({ lean: f < 1 ? "under" : "over", label: text + ": " + (f > 1 ? "+" : "") + Math.round((f - 1) * 100) + "%" }); });
  }
  if (g.starterOut && p.pos !== "QB" && g.primaryName) { sig.push({ key: "qb", label: "Backup quarterback expected: " + g.primaryName + " is " + (g.primaryStatus || "out").toLowerCase(), lean: "under" }); ["recYds"].forEach(k => { if (reasons[k]) reasons[k].push({ lean: "under", label: "Backup quarterback expected (" + g.primaryName + ", " + (g.primaryStatus || "out").toLowerCase() + "): receivers' yards ran 4% lower in 2025's backup starts" }); }); }
  if (g.starterOut && p.pos === "QB" && g.isBackup) sig.push({ key: "qb", label: "Expected to start: " + (g.primaryName || "the usual starter") + " is " + (g.primaryStatus || "out").toLowerCase(), lean: "neutral" });
  if (p.injury) { sig.push({ key: "injury", label: "Injury report: " + p.injury, lean: "under" }); rk.forEach(k => { if ((pr.parts[k] || {}).injured) reasons[k].push({ lean: "under", label: "Injury report: " + p.injury + " (projection 5% lower)" }); }); }
  /* home or away, where the stat carries it (the combined markets carry it through their parts) */
  Object.keys(why).forEach(k => { const h = (pr.parts[k] || {}).home; if (h && h !== 1) why[k] += (h > 1 ? ", +" : ", -") + Math.round(Math.abs(h - 1) * 100) + "% " + (p.home ? "at home" : "on the road"); });
  /* a combined market: its parts' reasons, each once */
  p.keys.forEach(function (k) { const a = STATS[k].sum; if (!a) return; const seen = {}; reasons[k] = reasons[a[0]].concat(reasons[a[1]]).filter(x => seen[x.label] ? false : (seen[x.label] = true)); });
  const outReasons = {}; p.keys.forEach(k => { outReasons[k] = reasons[k]; });
  return { reasons: outReasons, why: why, signals: sig };
}
async function run(opts) {
  opts = opts || {};
  const now = opts.now ? new Date(opts.now) : new Date();
  const src = opts.nflSource || (opts.fixture ? fixtureSource() : liveSource(opts.cache));
  const dataDir = opts.out || path.join(__dirname, "..", "data");
  const cacheFile = path.join(dataDir, "nfl-games.json");
  const log = opts.log || (() => {});
  const todaySb = await src.scoreboard(ymd(now));
  if (!todaySb) throw new Error("no NFL scoreboard");
  let cache = readCache(cacheFile) || (opts.fixture ? readCache(path.join(__dirname, "fixtures", "espn", "nfl", "nfl-games.json")) : null);
  const up = await updateCache(src, cache, todaySb, now, log); cache = up.cache;
  const slate = await slateFor(src, todaySb, now);
  /* rosters: positions for the cache (defences are read by position), injuries, headshots */
  const rosters = {};
  for (const g of slate.games) for (const t of [g.home, g.away]) { if (!rosters[t.id]) rosters[t.id] = rosterMap(await src.roster(t.id).catch(() => null)); }
  /* positions for the players the box scores know (the rest of a roster is not kept) */
  const learn = r => Object.keys(r).forEach(id => { const a = r[id], p = cache.players[id]; if (a.pos && p) p[1] = a.pos; });
  Object.keys(rosters).forEach(tid => learn(rosters[tid]));
  /* a defence is read by the positions it faced: players with real usage and no position yet get their club's roster
     once (a player no longer on any roster is marked "" and read from his usage) */
  const missing = {};
  Object.keys(cache.games).forEach(gid => cache.games[gid].r.forEach(r => { const p = cache.players[r[C.id]]; if (p && p[1] == null && r[C.att] + r[C.car] + r[C.tgt] >= 3) missing[r[C.id]] = r[C.team]; }));
  const extra = {}; Object.keys(missing).forEach(id => { if (!rosters[missing[id]]) extra[missing[id]] = true; });
  for (const tid of Object.keys(extra).slice(0, 32)) learn(rosterMap(await src.roster(tid).catch(() => null)));
  Object.keys(missing).forEach(id => { const p = cache.players[id]; if (p && p[1] == null && extra[missing[id]]) p[1] = ""; });
  const idx = indexGames(cache, null);
  const players = [], games = [];
  const rankCache = {};
  const ranksFor = (t, k, pos) => { const key = t + "|" + k + "|" + pos; return rankCache[key] || (rankCache[key] = defenceRanks(idx, t, k, pos)); };
  for (const g of slate.games) {
    const t = Date.parse(g.start), lg = leagueRates(idx, t);
    const wind = await windAt(src, g, now).catch(() => null);
    games.push({ id: g.id, league: "NFL", sportKey: "americanfootball_nfl", eventId: g.id, start: g.start, startLabel: startLabel(new Date(g.start)), week: g.week, status: g.status, home: g.home, away: g.away, venue: g.venue.name, indoor: g.venue.indoor, wind: wind });
    for (const side of [g.home, g.away]) {
      const home = side.id === g.home.id, opp = home ? g.away : g.home, roster = rosters[side.id] || {};
      const prior = before(idx.byTeam[side.id], t), last3 = prior.slice(-3);
      const avail = id => roster[id] && !UNAVAILABLE.test(roster[id].status || "");
      /* the usual quarterback (most attempts over the last three games) and who starts today */
      const attBy = {}; last3.forEach(e => e.rows.forEach(r => { if (r[C.att]) attBy[r[C.id]] = (attBy[r[C.id]] || 0) + r[C.att]; }));
      const primary = Object.keys(attBy).sort((a, b) => attBy[b] - attBy[a])[0] || null;
      const starterOut = !!(primary && !avail(primary));
      const qbs = Object.keys(roster).filter(id => roster[id].pos === "QB" && avail(id));
      const seasonAtt = id => (idx.byPlayer[id] || []).reduce((s, x) => s + x.r[C.att], 0);
      const starter = !starterOut && primary ? primary : qbs.sort((a, b) => seasonAtt(b) - seasonAtt(a))[0] || null;
      /* regulars missing today (injured, or no longer on the roster): their carries are partly picked up */
      const seen = {}; last3.forEach(e => e.rows.forEach(r => { if (r[C.tgt] + r[C.car] >= 3) seen[r[C.id]] = (seen[r[C.id]] || 0) + 1; }));
      const outIds = Object.keys(seen).filter(id => seen[id] >= 2 && !avail(id));
      /* candidates: healthy skill players with a game this season, ranked by usage */
      const usageOf = id => { const list = idx.byPlayer[id] || []; return list.length ? { tgt: avg(list.map(x => x.r[C.tgt])), car: avg(list.map(x => x.r[C.car])), att: avg(list.map(x => x.r[C.att])) } : null; };
      const byPos = { QB: [], RB: [], WR: [], TE: [] };
      Object.keys(roster).forEach(function (id) {
        const a = roster[id]; let pos = a.pos === "FB" ? "RB" : a.pos; if (!byPos[pos] || !avail(id)) return;
        const u = usageOf(id); if (!u) return;
        if (pos === "QB" && id !== starter) return;
        byPos[pos].push({ id: id, u: u, score: pos === "RB" ? u.car + u.tgt : u.tgt });
      });
      Object.keys(byPos).forEach(function (pos) {
        byPos[pos].sort((a, b) => b.score - a.score).slice(0, RULES.perTeam[pos]).forEach(function (c) {
          const a = roster[c.id], inj = a.status && !UNAVAILABLE.test(a.status) ? a.status : null;
          const ctx = { t: t, team: side.id, opp: opp.id, home: home, outIds: outIds, starterOut: starterOut, isBackup: pos === "QB" && c.id !== primary, wind: wind ? wind.mph : null, injury: !!inj };
          const pr = projectPlayer(idx, c.id, ctx, PARAMS, lg); if (!pr) return;
          /* a quarterback's rushing only when he runs (4+ carries a game, near the 5+ the check measured) */
          const keys = KEYS_BY_POS[pos].filter(k => k !== "rushYds" || pos !== "QB" || pr.usage.season.car >= 4);
          const hist = pr.games.slice().reverse(); /* newest first */
          const homes = hist.map(x => x.home);
          const series = {}, stats = {}; keys.forEach(k => { series[k] = statBlock(hist.map(x => rowVal(x.r, k)), homes); stats[k] = Object.assign({}, series[k]); delete stats[k].last; });
          const last = hist[0], restDays = last ? Math.round((t - Date.parse(last.d)) / 864e5) : null;
          const p = {
            league: "NFL", sportKey: "americanfootball_nfl", eventId: g.id, gameId: g.id, commence: g.start,
            id: c.id, name: a.name, pos: pos, jersey: a.jersey, headshot: a.headshot && a.headshot !== "https://a.espncdn.com/i/headshots/nfl/players/full/" + c.id + ".png" ? a.headshot : null,
            teamId: side.id, team: side.name, teamAbbr: side.abbr, oppName: opp.name, oppAbbr: opp.abbr, home: home, start: startLabel(new Date(g.start)),
            gp: pr.gp, restDays: restDays, injury: inj, keys: keys,
            usage: { att: { season: round(pr.usage.season.att), l3: round(pr.usage.last3.att) }, car: { season: round(pr.usage.season.car), l3: round(pr.usage.last3.car) }, tgt: { season: round(pr.usage.season.tgt), l3: round(pr.usage.last3.tgt) } },
            stats: stats, proj: {},
            log: hist.slice(0, RULES.logGames).map(x => logRow(x, pos))
          };
          const ranks = {}; keys.forEach(k => { ranks[k] = ranksFor(t, k, pos); (STATS[k].sum || []).forEach(a => { ranks[a] = ranksFor(t, a, pos); }); });
          const ex = explain(Object.assign({}, p, { stats: series }), pr, Object.assign({}, ctx, { wind: wind, primaryName: primary ? (roster[primary] && roster[primary].name) || idx.names[primary] : null, primaryStatus: primary && roster[primary] ? roster[primary].status : "not on the roster" }), ranks);
          keys.forEach(k => { p.proj[k] = Object.assign({}, pr.proj[k], { why: ex.why[k] || null, reasons: ex.reasons[k] }); });
          const mk = pos === "QB" ? "passYds" : pos === "RB" ? "rushYds" : "recYds", mr = ranks[mk] && ranks[mk][opp.id];
          p.opp = mr ? { rank: mr.rank, of: mr.of, perGame: mr.perGame, stat: mk } : null;
          p.signals = ex.signals;
          const ms = series[mk]; p.heat = ms && ms.season ? round(Math.max(0, avg(ms.last.slice(0, 3)) / ms.season - 1), 3) : 0;
          players.push(p);
        });
      });
    }
  }
  /* the cache is written whatever happens next: it is the season's record */
  if (opts.writeCache !== false) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache)); }
  const lines = await attachLines(players, games, slate, opts, now).catch(e => ({ skipped: e.message }));
  const first = games.slice().sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const summary = { date: slate.date, today: slate.today, label: slate.date ? dayLabel(slate.date) : null, week: (first && first.week) || slate.week || null, games: games.length, players: players.length,
    first: first ? { id: first.id, start: first.start, startLabel: first.startLabel, matchup: first.away.abbr + " @ " + first.home.abbr } : null,
    lines: lines, stats: STAT_LIST, boxscores: { games: Object.keys(cache.games).length, fetched: up.fetched, season: cache.season }, model: MODEL_NOTE };
  return { games: games, players: players, summary: summary, requests: src.count() };
}
/* the lines summary in words, for the Actions log (scripts/update-props.js prints it) */
function earlyText(l) {
  const e = l && l.early; if (!e) return "";
  const pace = e.cap != null ? "spare " + e.spare + " (protected " + e.rate + " a day, " + e.days + " days left, reserve " + e.reserve + "), today's pace " + Math.max(0, e.room) + " of " + e.cap : "";
  if (e.skipped) return "; early lines for " + l.next + " (" + e.daysAhead + " day" + (e.daysAhead === 1 ? "" : "s") + " ahead, " + e.games + " game" + (e.games === 1 ? "" : "s") + ") not read: " + (e.why || e.skipped) + (pace ? " | SportsGameOdds surplus: " + pace : "");
  return "; read " + e.daysAhead + " day" + (e.daysAhead === 1 ? "" : "s") + " ahead of " + l.next + " from the SportsGameOdds surplus: " + pace + ", spent " + e.spent;
}
/* what the page says about the model (the held-out numbers are in EVAL) */
const MODEL_NOTE = { basis: "game data only", fitted: "2025 regular season", heldOut: "2026 weeks 3-9" };
/* ---------- lines: one SportsGameOdds call on an NFL game day, for the games still to start ----------
   and, since 2026-11-10, one on the afternoon run of the day or two before a game day (`opts.early`), paid from the
   cycle's spare entities under the surplus spender's rule and pace (scripts/surplus.js sgoEarly; data/budget.json) */
function daysAhead(now, date) { if (!date) return null; const a = etDate(now).split("-").map(Number), b = date.split("-").map(Number); return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 864e5); }
async function attachLines(players, games, slate, opts, now) {
  if (opts.lines === false) return { skipped: "off" };
  const open = games.filter(g => Date.parse(g.start) > now.getTime());
  if (!slate.today) return earlyLines(players, open, slate, opts, now);
  if (!open.length) return { skipped: "every game has started" };
  const src = opts.sgoSource || sgo.source({ fixture: opts.fixture, fixtureName: "NFL-props" });
  if (!src.enabled) return { skipped: "no key" };
  const usage = await src.usage();
  if (usage && usage.max && usage.max - usage.used - open.length < RULES.sgoReserve) return { skipped: "budget", used: usage.used, max: usage.max };
  return priceGames(players, open, src, usage, now);
}
/* the next slate, a day or two ahead: priced only from the surplus, and only when the run asks (the afternoon and
   manual runs; the morning run prices game days alone). Whatever is decided is written to the state and the summary. */
async function earlyLines(players, open, slate, opts, now) {
  const out = { skipped: "not a game day", next: slate.date }, ahead = daysAhead(now, slate.date);
  if (!opts.early) return out;
  const early = out.early = { daysAhead: ahead, games: open.length };
  if (!open.length) { early.skipped = "no game to price"; return out; }
  if (!(ahead >= 1 && ahead <= surplus.SGO.earlyDays)) { early.skipped = "too far ahead"; return out; }
  const src = opts.sgoSource || sgo.source({ fixture: opts.fixture, fixtureName: "NFL-props" });
  if (!src.enabled) { early.skipped = "no key"; return out; }
  const usage = await src.usage();
  if (!usage || !usage.max) { early.skipped = "usage unknown"; return out; }
  const dataDir = opts.out || path.join(__dirname, "..", "data"), t = now.getTime();
  const state = surplus.readState(dataDir), d = surplus.sgoEarly(state, usage, t, { cost: open.length, daysAhead: ahead });
  Object.assign(early, { spare: d.spare, rate: d.rate, days: d.days, cap: d.cap, room: d.room, reserve: d.reserve });
  const record = function (spent, players) { d.cycle.early = { at: now.toISOString(), slate: slate.date, daysAhead: ahead, games: open.length, spare: d.spare, rate: d.rate, days: d.days, cap: d.cap, room: d.room, spent: spent, players: players, why: d.why }; surplus.writeState(dataDir, state); };
  if (!d.take) { early.skipped = "budget"; early.why = d.why; record(0, 0); return out; }
  const before = src.stats().entities;
  let priced;
  try { priced = await priceGames(players, open, src, usage, now); }
  catch (e) { const lost = src.stats().entities - before; surplus.addSpent(d.cycle, t, lost); early.skipped = e.message; early.spent = lost; record(lost, 0); return out; }
  early.spent = src.stats().entities - before;
  surplus.addSpent(d.cycle, t, early.spent); record(early.spent, priced.players);
  return Object.assign(priced, { next: slate.date, early: early });
}
/* one call for these games (one entity per game the window returns); every player found gets his lines */
async function priceGames(players, open, src, usage, now) {
  const list = await sgo.nightEvents(src, "NFL", open.map(g => g.start));
  const byGame = {}; let matched = 0;
  open.forEach(g => { const ev = sgo.eventFor(list, g.home.name, g.away.name); if (ev) { byGame[g.id] = { ev: ev, index: sgo.playerIndex(ev) }; matched++; } });
  let priced = 0; const books = {}, found = {};
  players.forEach(function (p) {
    const m = byGame[p.gameId]; if (!m) return;
    const pp = sgo.playerProps(m.ev, p.name, m.index, SGO_STATS); if (!pp) return;
    found[p.id] = pp; priced++;
    Object.keys(pp.stats).forEach(k => { Object.keys(pp.stats[k].over.books).concat(Object.keys(pp.stats[k].under.books)).forEach(b => { books[b] = true; }); });
  });
  players.forEach(function (p) { const pp = found[p.id]; if (pp) { p.lines = pp.stats; p.sgoPlayerId = pp.playerID; p.sgoEventId = byGame[p.gameId].ev.eventID; p.linesAt = now.toISOString(); } });
  return { source: sgo.SOURCE, at: now.toISOString(), games: matched, of: open.length, players: priced, books: Object.keys(books).sort(), entities: src.stats().entities, used: usage ? usage.used : null, max: usage ? usage.max : null };
}

module.exports = { run, slateFor, rosterMap, windAt, attachLines, earlyLines, earlyText, daysAhead, explain, STADIUMS, MODEL_NOTE, evalSample, summarise, weightedHit, median, PARAMS, LEAGUE_2025, DIST, QS, distFor, cdfQ, poissonCdf, pOver, rowVal, posOf, indexGames, leagueRates, defenceAllowed, allowedOf, oppFactor, defenceRanks, projectPlayer, logRow, RULES, STATS, STAT_KEYS, CORE_KEYS, SHIPPED, DROPPED, STAT_LIST, SGO_STATS, KEYS_BY_POS, COLS, C, liveSource, fixtureSource, parseSummary, parseScoreboard, emptyCache, readCache, weeksBegun, upcomingWeeks, seasonOf, updateCache, etDate, ymd, startLabel, dayLabel, round, avg, sd };

/* node scripts/nfl-props.js --eval [--cache data/nfl-games.json] [--from 3]: the held-out check on the season so far,
   every week projected from the weeks before it with the shipped settings (fitted on 2025, never on this season) */
if (require.main === module) {
  const argv = process.argv.slice(2), arg = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
  if (argv.indexOf("--eval") === -1) { console.log("Usage: node scripts/nfl-props.js --eval [--cache data/nfl-games.json] [--from 3]   (the props run is scripts/update-props.js)"); process.exit(0); }
  const cache = readCache(arg("--cache", path.join(__dirname, "..", "data", "nfl-games.json")));
  if (!cache) { console.error("No box score cache yet: run scripts/update-props.js first"); process.exit(1); }
  const rows = evalSample(indexGames(cache), { fromWeek: Number(arg("--from", 3)) }), S = summarise(rows);
  console.log("Held-out check, " + cache.season + " season: " + rows.length + " player-stat games (line = the player's running median, rounded to a half)");
  STAT_KEYS.forEach(k => { const s = S[k]; if (!s) return; console.log((STATS[k].label + (DROPPED[k] ? " (not shipped)" : "")).padEnd(DROPPED[k] ? 26 : 17) + " n " + String(s.n).padStart(4) + " | MAE " + s.maeModel + " vs season average " + s.maeBase + " (" + (s.maeGain * 100).toFixed(1) + "% lower) | over rate " + s.overRate + " | Brier: ours " + s.brier.model + ", with the hit rate " + s.brier.blend + ", hit rate alone " + s.brier.hit + ", a coin flip " + s.brier.even); });
}
