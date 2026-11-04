/* ==========================================================================
   EdgeLine AI — data pipeline
   Pulls live prices from The Odds API. The fair probability for a line is the
   de-vigged price at Pinnacle (the sharp reference book); when Pinnacle does
   not price that line, the de-vigged average of the other books stands in.
   A pick is any bettable book whose price implies a lower probability than
   fair (the edge). Logs picks in data/picks-log.json, grades finished ones with
   final scores, and rewrites data/picks.js and data/performance.js.

   Run:   ODDS_API_KEY=... node scripts/update-data.js
   Test:  node scripts/update-data.js --fixture            (no network)
   Flags: --out <dir>   write data files elsewhere (tests)
          --now <iso>   pretend it is this moment (tests)
          --verbose     print every candidate edge per sport, even below the threshold
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const API = "https://api.the-odds-api.com/v4";
let VERBOSE = false;
/* days: Eastern weekdays (0 = Sunday) on which to fetch; omitted = every day. With the run at 4:30 PM ET and a
   36-hour window, Wednesday covers Thursday night football, Saturday covers the Sunday slate, Friday covers weekend soccer. */
const SPORTS = [
  { key: "americanfootball_nfl", sport: "NFL", league: "NFL", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread", days: [3, 6, 0, 1] },
  { key: "basketball_nba", sport: "NBA", league: "NBA", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread" },
  { key: "baseball_mlb", sport: "MLB", league: "MLB", markets: ["h2h", "spreads", "totals"], spreadLabel: "Run line" },
  { key: "icehockey_nhl", sport: "NHL", league: "NHL", markets: ["h2h", "spreads", "totals"], spreadLabel: "Puck line" },
  { key: "soccer_epl", sport: "Soccer", league: "Premier League", markets: ["h2h", "totals"], goals: true, days: [5, 6, 0] },
  { key: "soccer_spain_la_liga", sport: "Soccer", league: "La Liga", markets: ["h2h", "totals"], goals: true, days: [5, 6, 0] }
];
/* Pinnacle anchors the fair line; the rest are the books a pick can name. Ten bookmakers cost the same as one region. */
const ANCHOR = "pinnacle";
const BOOKS = [ANCHOR, "draftkings", "fanduel", "betmgm", "williamhill_us", "betrivers", "fanatics", "espnbet", "bovada", "betonlineag"];
const RULES = {
  minBooks: 3,          // the line needs at least this many books (anchor included) to be analysed
  minEdge: 0.01,        // 1 point over the fair line becomes a pick (about +2% EV at even odds)
  medium: 0.02, high: 0.035,
  maxPerSport: 4, maxPicks: 12,
  horizonHours: 36,     // only events starting within this window
  gradeAfterHours: 3,   // grade events that started at least this long ago
  voidAfterDays: 7,     // give up on ungraded events after this long
  windowDays: 30,       // performance window
  minRequestsLeft: 25   // stop fetching odds when the API quota runs this low
};

/* ---------- odds math ---------- */
function implied(american) { const o = Number(american); return o < 0 ? -o / (-o + 100) : 100 / (o + 100); }
function profitPerUnit(american) { const o = Number(american); return o > 0 ? o / 100 : 100 / -o; }
function devig(prices) { const ps = prices.map(implied), s = ps.reduce((a, b) => a + b, 0); return ps.map(p => p / s); }
function fmtOdds(o) { return (o > 0 ? "+" : "") + o; }
function pct(p) { return (p * 100).toFixed(1) + "%"; }
function round(n, d) { return Math.round(n * Math.pow(10, d)) / Math.pow(10, d); }

/* ---------- time (everything user-facing is Eastern) ---------- */
const ET = "America/New_York";
function etWeekday(d) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(d)); }
function etDate(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function startLabel(d, now) {
  const day = etDate(d), today = etDate(now), tomorrow = etDate(new Date(now.getTime() + 864e5));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" }).format(d) + " ET";
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short" }).format(d);
  return (day === today ? "Today" : day === tomorrow ? "Tomorrow" : dow) + " " + time;
}

/* ---------- consensus + edge for one event ---------- */
function marketLabel(cfg, market) { return market === "h2h" ? "Moneyline" : market === "spreads" ? cfg.spreadLabel : "Total"; }
function eventName(cfg, ev) { return cfg.goals ? ev.home_team + " vs. " + ev.away_team : ev.away_team + " @ " + ev.home_team; }
function pickName(cfg, market, o) {
  if (market === "h2h") return o.name === "Draw" ? "Draw" : o.name + " ML";
  if (market === "spreads") return o.name + " " + (o.point > 0 ? "+" : "") + o.point;
  return o.name + " " + o.point + (cfg.goals ? " goals" : "");
}
function lineKey(outs) { return outs.map(o => o.name + ":" + (o.point == null ? "" : o.point)).sort().join("|"); }

function analyzeEvent(cfg, ev) {
  const out = [];
  cfg.markets.forEach(function (market) {
    /* group each book's outcomes by the exact line so we only compare like with like */
    const groups = {};
    (ev.bookmakers || []).forEach(function (bk) {
      const m = (bk.markets || []).find(x => x.key === market);
      if (!m || !m.outcomes || m.outcomes.length < 2) return;
      const key = lineKey(m.outcomes);
      (groups[key] = groups[key] || []).push({ book: bk.title, bookKey: bk.key, outcomes: m.outcomes });
    });
    const best = Object.values(groups).sort((a, b) => b.length - a.length)[0];
    if (!best || best.length < RULES.minBooks) return;
    const names = best[0].outcomes.map(o => o.name + "|" + (o.point == null ? "" : o.point));
    const anchorBook = best.find(b => b.bookKey === ANCHOR);
    const fair = names.map(() => 0);
    const basis = anchorBook ? [anchorBook] : best;
    basis.forEach(function (b) {
      const ordered = names.map(n => b.outcomes.find(o => o.name + "|" + (o.point == null ? "" : o.point) === n));
      devig(ordered.map(o => o.price)).forEach((p, i) => { fair[i] += p / basis.length; });
    });
    const bettable = best.filter(b => b.bookKey !== ANCHOR);
    if (!bettable.length) return;
    const candidates = names.map(function (n, i) {
      let bestPrice = -Infinity, bestBook = "";
      bettable.forEach(function (b) { const o = b.outcomes.find(o => o.name + "|" + (o.point == null ? "" : o.point) === n); if (o.price > bestPrice) { bestPrice = o.price; bestBook = b.book; } });
      const o = best[0].outcomes[i];
      return { outcome: { name: o.name, point: o.point == null ? null : o.point }, odds: bestPrice, book: bestBook, fair: fair[i], edge: fair[i] - implied(bestPrice), books: best.length, anchor: anchorBook ? anchorBook.book : null, market: market };
    }).sort((a, b) => b.edge - a.edge);
    if (VERBOSE && candidates.length) console.log("  " + eventName(cfg, ev) + " | " + market + " | " + best.length + " books" + (anchorBook ? " (anchored)" : " (consensus)") + " | best edge " + (candidates[0].edge * 100).toFixed(2) + " pts on " + candidates[0].outcome.name + " " + (candidates[0].outcome.point == null ? "" : candidates[0].outcome.point) + " at " + fmtOdds(candidates[0].odds) + " (" + candidates[0].book + ")");
    if (candidates.length && candidates[0].edge >= RULES.minEdge) out.push(candidates[0]); /* never both sides of one market */
  });
  return out;
}

function confidence(edge) { return edge >= RULES.high ? "High" : edge >= RULES.medium ? "Medium" : "Lean"; }
function rationale(c, cfg) {
  const line = c.outcome.point == null ? "" : " at " + (c.market === "spreads" && c.outcome.point > 0 ? "+" : "") + c.outcome.point;
  const basis = c.anchor ? c.anchor + "'s de-vigged price" : "the de-vigged consensus of " + c.books + " books";
  return "Fair probability" + line + " is " + pct(c.fair) + " by " + basis + ". " + c.book + " offers " + fmtOdds(c.odds) + ", which implies only " + pct(implied(c.odds)) + ".";
}
function factors(c) {
  return ["Best price " + fmtOdds(c.odds) + " at " + c.book, c.anchor ? "Fair line from " + c.anchor : "Fair line from " + c.books + "-book consensus", "Edge " + (c.edge * 100).toFixed(1) + " points over fair"];
}
function slug(s) { return String(s).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, ""); }

/* ---------- grading ---------- */
function grade(entry, scoreEv) {
  if (!scoreEv || !scoreEv.completed || !Array.isArray(scoreEv.scores)) return null;
  const sc = {}; scoreEv.scores.forEach(s => { sc[s.name] = Number(s.score); });
  const home = sc[scoreEv.home_team], away = sc[scoreEv.away_team];
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  const o = entry.outcome; let result;
  if (entry.market === "h2h") {
    const winner = home > away ? scoreEv.home_team : away > home ? scoreEv.away_team : "Draw";
    result = o.name === winner ? "Win" : (winner === "Draw" && o.name !== "Draw" && !entry.threeWay) ? "Push" : "Loss";
  } else if (entry.market === "spreads") {
    const mine = o.name === scoreEv.home_team ? home : away, theirs = o.name === scoreEv.home_team ? away : home;
    const diff = mine + o.point - theirs;
    result = diff > 0 ? "Win" : diff < 0 ? "Loss" : "Push";
  } else {
    const total = home + away;
    result = total === o.point ? "Push" : (o.name === "Over") === (total > o.point) ? "Win" : "Loss";
  }
  const units = result === "Win" ? round(profitPerUnit(entry.odds), 2) : result === "Loss" ? -1 : 0;
  return { result, units, score: away + "-" + home };
}

/* ---------- performance aggregation ---------- */
function summarize(log, now) {
  const since = etDate(new Date(now.getTime() - RULES.windowDays * 864e5));
  const graded = log.filter(e => e.status === "graded" && e.date >= since).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.commence < b.commence ? -1 : 1);
  const rec = { wins: 0, losses: 0, pushes: 0 };
  graded.forEach(e => { rec[e.result === "Win" ? "wins" : e.result === "Loss" ? "losses" : "pushes"]++; });
  const units = round(graded.reduce((s, e) => s + e.units, 0), 2);
  const risked = graded.length;
  const daily = []; let cum = 0;
  graded.forEach(function (e) {
    cum = round(cum + e.units, 2);
    const last = daily[daily.length - 1];
    if (last && last.date === e.date) last.units = cum; else daily.push({ date: e.date, units: cum });
  });
  const bySportMap = {};
  graded.forEach(function (e) {
    const b = bySportMap[e.sport] = bySportMap[e.sport] || { sport: e.sport, units: 0, w: 0, l: 0 };
    b.units = round(b.units + e.units, 2); if (e.result === "Win") b.w++; if (e.result === "Loss") b.l++;
  });
  const bySport = Object.values(bySportMap).map(b => ({ sport: b.sport, units: b.units, record: b.w + "-" + b.l }));
  const recent = graded.slice().reverse().slice(0, 12).map(e => ({ date: e.date, sport: e.sport, event: e.event, pick: e.pick, odds: e.odds, result: e.result, units: e.units }));
  const avgEdge = graded.length ? round(graded.reduce((s, e) => s + e.edge, 0) / graded.length * 100, 1) : 0;
  return { sample: false, source: "The Odds API", asOf: etDate(now), windowDays: RULES.windowDays, record: rec, units: units, roi: risked ? round(units / risked * 100, 1) : 0, avgEdge: avgEdge, graded: risked, daily: daily, bySport: bySport, recent: recent };
}

/* ---------- API ---------- */
async function apiGet(pathname, params, key, usage) {
  const url = new URL(API + pathname);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  url.searchParams.set("apiKey", key);
  const res = await fetch(url);
  const left = Number(res.headers.get("x-requests-remaining"));
  if (Number.isFinite(left)) usage.remaining = left;
  if (!res.ok) throw new Error("Odds API " + res.status + " for " + pathname + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

/* ---------- main ---------- */
async function run(opts) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const dataDir = opts.out || path.join(__dirname, "..", "data");
  const logPath = path.join(dataDir, "picks-log.json");
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
  const usage = { remaining: null };
  const source = opts.fixture ? fixtureSource() : liveSource(opts.key, usage);

  /* 1. grade pending picks whose events have finished */
  const cutoff = now.getTime() - RULES.gradeAfterHours * 36e5;
  const pendingBySport = {};
  log.filter(e => e.status === "pending" && Date.parse(e.commence) < cutoff).forEach(e => { (pendingBySport[e.sportKey] = pendingBySport[e.sportKey] || []).push(e); });
  for (const sportKey of Object.keys(pendingBySport)) {
    const scores = await source.scores(sportKey);
    const byId = {}; (scores || []).forEach(s => { byId[s.id] = s; });
    pendingBySport[sportKey].forEach(function (e) {
      const g = grade(e, byId[e.eventId]);
      if (g) { e.status = "graded"; e.result = g.result; e.units = g.units; e.score = g.score; e.gradedAt = now.toISOString(); }
      else if (Date.parse(e.commence) < now.getTime() - RULES.voidAfterDays * 864e5) { e.status = "void"; }
    });
  }

  /* 2. fetch odds and find today's edges */
  const active = await source.activeSports();
  const fresh = [];
  for (const cfg of SPORTS) {
    if (active && !active.has(cfg.key)) continue;
    if (!opts.fixture && cfg.days && cfg.days.indexOf(etWeekday(now)) === -1) continue;
    if (usage.remaining != null && usage.remaining < RULES.minRequestsLeft) { console.warn("Odds API quota low (" + usage.remaining + " left); skipping " + cfg.key); continue; }
    const events = await source.odds(cfg);
    const horizon = now.getTime() + RULES.horizonHours * 36e5;
    if (VERBOSE) console.log(cfg.key + ": " + (events || []).length + " events, " + (events || []).filter(ev => { const t = Date.parse(ev.commence_time); return t > now.getTime() && t < horizon; }).length + " within " + RULES.horizonHours + "h");
    const picks = [];
    (events || []).forEach(function (ev) {
      const t = Date.parse(ev.commence_time);
      if (!(t > now.getTime() && t < horizon)) return;
      analyzeEvent(cfg, ev).forEach(function (c) {
        const key = ev.id + "|" + c.market + "|" + c.outcome.name + "|" + c.outcome.point;
        if (log.some(e => e.key === key)) return; /* already on the board at the price we logged */
        picks.push({
          key: key, id: slug(ev.id.slice(0, 10) + "-" + c.market + "-" + c.outcome.name), date: etDate(new Date(t)), commence: ev.commence_time,
          sport: cfg.sport, league: cfg.league, sportKey: cfg.key, eventId: ev.id, home: ev.home_team, away: ev.away_team,
          event: eventName(cfg, ev), market: marketLabel(cfg, c.market), marketKey: c.market, outcome: c.outcome, threeWay: !!cfg.goals && c.market === "h2h",
          pick: pickName(cfg, c.market, c.outcome), odds: c.odds, book: c.book, books: c.books, anchor: c.anchor,
          modelProb: round(c.fair, 4), edge: round(c.edge, 4), ev: round(c.fair * (1 + profitPerUnit(c.odds)) - 1, 4), confidence: confidence(c.edge),
          rationale: rationale(c, cfg), factors: factors(c), status: "pending", units: 0, loggedAt: now.toISOString()
        });
      });
    });
    if (VERBOSE) console.log("  requests remaining: " + usage.remaining);
    picks.sort((a, b) => b.edge - a.edge).slice(0, RULES.maxPerSport).forEach(p => fresh.push(p));
  }
  fresh.sort((a, b) => b.edge - a.edge).slice(0, RULES.maxPicks).forEach(p => log.push(p));

  /* 3. today's board = every pending pick whose event is still ahead */
  const board = log.filter(e => e.status === "pending" && Date.parse(e.commence) > now.getTime()).sort((a, b) => b.edge - a.edge)
    .map(e => ({ id: e.id, sport: e.sport, league: e.league, event: e.event, start: startLabel(new Date(e.commence), now), market: e.market, pick: e.pick, odds: e.odds, book: e.book, modelProb: e.modelProb, confidence: e.confidence, rationale: e.rationale, factors: e.factors }));

  /* 4. write */
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1) + "\n");
  const picksData = { sample: false, source: "The Odds API", generatedAt: now.toISOString(), picks: board };
  fs.writeFileSync(path.join(dataDir, "picks.js"), "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.PICKS_DATA = " + JSON.stringify(picksData, null, 2) + ";\n");
  const perf = summarize(log, now);
  fs.writeFileSync(path.join(dataDir, "performance.js"), "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.PERF_DATA = " + JSON.stringify(perf, null, 2) + ";\n");
  return { added: fresh.length, board: board.length, graded: perf.graded, remaining: usage.remaining };
}

function liveSource(key, usage) {
  if (!key) throw new Error("ODDS_API_KEY is not set");
  return {
    activeSports: async function () { const list = await apiGet("/sports", {}, key, usage); return new Set(list.filter(s => s.active).map(s => s.key)); },
    odds: function (cfg) { return apiGet("/sports/" + cfg.key + "/odds", { bookmakers: BOOKS.join(","), markets: cfg.markets.join(","), oddsFormat: "american" }, key, usage); },
    scores: function (sportKey) { return apiGet("/sports/" + sportKey + "/scores", { daysFrom: 3 }, key, usage); }
  };
}
function fixtureSource() {
  const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
  return {
    activeSports: async function () { return null; },
    odds: async function (cfg) { return read("odds.json").filter(e => e.sport_key === cfg.key); },
    scores: async function (sportKey) { return read("scores.json").filter(e => e.sport_key === sportKey); }
  };
}

function parseArgs(argv) {
  const o = { fixture: false, out: null, now: null, key: process.env.ODDS_API_KEY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fixture") o.fixture = true;
    else if (argv[i] === "--out") o.out = argv[++i];
    else if (argv[i] === "--now") o.now = argv[++i];
    else if (argv[i] === "--verbose") VERBOSE = true;
  }
  return o;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(function (r) {
    console.log("Picks added: " + r.added + ", on the board: " + r.board + ", graded in window: " + r.graded + (r.remaining != null ? ", API requests remaining: " + r.remaining : ""));
  }).catch(function (e) { console.error(e.message); process.exit(1); });
}
module.exports = { run, implied, devig, analyzeEvent, grade, summarize, profitPerUnit, RULES, SPORTS };
