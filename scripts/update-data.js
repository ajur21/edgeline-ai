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
          --track       no Odds API calls: refresh DraftKings numbers (ESPN, free) on the board, rebuild breakdowns, rewrite picks.js
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const context = require("./context.js");
const sgo = require("./sgo.js");

const API = "https://api.the-odds-api.com/v4";
let VERBOSE = false;
/* days: Eastern weekdays (0 = Sunday) on which to fetch; omitted = every day. With the run at 4:30 PM ET and a
   36-hour window, Wednesday covers Thursday night football, Saturday covers the Sunday slate, Friday covers weekend soccer. */
const SPORTS = [
  { key: "americanfootball_nfl", sport: "NFL", league: "NFL", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread", days: [3, 6, 0, 1] },
  { key: "basketball_nba", sport: "NBA", league: "NBA", markets: ["h2h", "spreads", "totals"], spreadLabel: "Spread" },
  { key: "baseball_mlb", sport: "MLB", league: "MLB", markets: ["h2h", "spreads", "totals"], spreadLabel: "Run line" },
  { key: "icehockey_nhl", sport: "NHL", league: "NHL", markets: ["h2h", "spreads", "totals"], spreadLabel: "Puck line" },
  { key: "soccer_epl", sport: "Soccer", league: "Premier League", markets: ["h2h", "totals"], goals: true, days: [5, 6, 0] }
  /* La Liga (soccer_spain_la_liga) is off to stay inside the free request tier; add it back here when the budget allows. */
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
  minRequestsLeft: 25,  // stop fetching odds when the API quota runs this low
  sgoReserve: 150,      // leave this many SportsGameOdds entities untouched each month (free tier: 2,500)
  sgoTrackWindowHours: 8, // in --track runs, spend SportsGameOdds entities only on games starting within this many hours
  watchEdge: 0.005,     // half a point over fair: shown on the market board as "watch", never a pick
  maxAnchorShift: 1     // adjust Pinnacle's price across at most this many points of line difference
};
/* How much win probability one point of line is worth, per sport and market, for carrying Pinnacle's price across a
   half-point or point to the line the other books post. Averages away from key numbers; hockey, baseball and soccer
   lines move in steps too large to convert, so they stay unadjusted. */
const LINE_VALUE = { americanfootball_nfl: { spreads: 0.022, totals: 0.015 }, basketball_nba: { spreads: 0.028, totals: 0.014 } };

/* ---------- odds math ---------- */
function implied(american) { const o = Number(american); return o < 0 ? -o / (-o + 100) : 100 / (o + 100); }
function profitPerUnit(american) { const o = Number(american); return o > 0 ? o / 100 : 100 / -o; }
function devig(prices) { const ps = prices.map(implied), s = ps.reduce((a, b) => a + b, 0); return ps.map(p => p / s); }
function decimal(american) { const o = Number(american); return o > 0 ? 1 + o / 100 : 1 + 100 / -o; }
function americanFromDecimal(dec) { return dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1)); }
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

/* Pinnacle's de-vigged probabilities carried from its own line to another group's line, when the gap is small enough
   to convert: returns { fair: [...], note } in the target group's outcome order, or null */
function shiftedAnchor(cfg, market, anchorBook, group) {
  const slope = LINE_VALUE[cfg.key] && LINE_VALUE[cfg.key][market];
  if (!slope || !anchorBook || market === "h2h") return null;
  const target = group[0].outcomes;
  const aOuts = anchorBook.outcomes;
  const devigged = devig(aOuts.map(o => o.price));
  const fair = [], deltas = [];
  for (let i = 0; i < target.length; i++) {
    const t = target[i], a = aOuts.findIndex(o => o.name === t.name);
    if (a === -1 || t.point == null || aOuts[a].point == null) return null;
    const delta = t.point - aOuts[a].point; /* how far our side's number moved */
    if (Math.abs(delta) > RULES.maxAnchorShift + 1e-9) return null;
    /* a spread side getting more points covers more often; an over at a higher total hits less often */
    const sign = market === "spreads" ? 1 : (/^over$/i.test(t.name) ? -1 : 1);
    fair.push(Math.min(0.98, Math.max(0.02, devigged[a] + sign * delta * slope)));
    deltas.push(Math.abs(delta));
  }
  if (!deltas.some(d => d > 0)) return null;
  const s = fair.reduce((x, y) => x + y, 0); /* keep the two sides summing to one */
  const fmt = o => (market === "spreads" && o.point > 0 ? "+" : "") + o.point;
  return { fair: fair.map(p => p / s), note: anchorBook.book + " posts " + aOuts[0].name + " " + fmt(aOuts[0]) + "; its price was carried " + deltas[0] + " point" + (deltas[0] === 1 ? "" : "s") + " at " + (slope * 100).toFixed(1) + "% a point to the " + fmt(target[0]) + " line the books share.", shift: deltas[0] };
}
/* price one group of books that all post the same line: fair probability per outcome, best bettable price, every book's price.
   `shifted` (optional) is Pinnacle's fair carried over from a neighbouring line when Pinnacle is not in this group. */
function priceGroup(group, market, shifted) {
  const names = group[0].outcomes.map(o => o.name + "|" + (o.point == null ? "" : o.point));
  const anchorBook = group.find(b => b.bookKey === ANCHOR);
  const fair = names.map(() => 0);
  const basis = anchorBook ? [anchorBook] : group;
  if (!anchorBook && shifted) shifted.fair.forEach((p, i) => { fair[i] = p; });
  else basis.forEach(function (b) {
    const ordered = names.map(n => b.outcomes.find(o => o.name + "|" + (o.point == null ? "" : o.point) === n));
    if (ordered.some(o => !o)) return;
    devig(ordered.map(o => o.price)).forEach((p, i) => { fair[i] += p / basis.length; });
  });
  const bettable = group.filter(b => b.bookKey !== ANCHOR);
  if (!bettable.length) return [];
  const anchorName = anchorBook ? anchorBook.book : shifted ? shifted.anchorName : null;
  return names.map(function (n, i) {
    let bestPrice = -Infinity, bestBook = "";
    const prices = {};
    bettable.forEach(function (b) { const o = b.outcomes.find(o => o.name + "|" + (o.point == null ? "" : o.point) === n); if (!o) return; prices[b.book] = o.price; if (o.price > bestPrice) { bestPrice = o.price; bestBook = b.book; } });
    if (!bestBook) return null;
    const o = group[0].outcomes[i];
    return { outcome: { name: o.name, point: o.point == null ? null : o.point }, odds: bestPrice, book: bestBook, prices: prices, fair: fair[i], edge: fair[i] - implied(bestPrice), books: group.length, anchor: anchorName, anchorNote: !anchorBook && shifted ? shifted.note : null, anchorShift: !anchorBook && shifted ? shifted.shift : 0, market: market };
  }).filter(Boolean).sort((a, b) => b.edge - a.edge);
}
/* every priced outcome of an event, across every line any two books agree on. `qualifies` marks the outcomes on the
   market's main line (the largest group, at least minBooks deep), the only ones that can become a pick; the rest exist so
   a logged pick's price keeps being tracked up to tip-off even when its edge is gone or its line is no longer the main one. */
function priceOutcomes(cfg, ev) {
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
    const sorted = Object.values(groups).sort((a, b) => b.length - a.length);
    /* Pinnacle's own line for this market, wherever it sits, so its price can anchor a neighbouring line */
    let anchorBook = null; sorted.forEach(g => { const a = g.find(b => b.bookKey === ANCHOR); if (a) anchorBook = a; });
    sorted.forEach(function (group, gi) {
      if (group.length < 2) return;
      const main = gi === 0 && group.length >= RULES.minBooks;
      const shifted = group.some(b => b.bookKey === ANCHOR) ? null : (function () { const s = shiftedAnchor(cfg, market, anchorBook, group); if (s) s.anchorName = anchorBook.book; return s; })();
      priceGroup(group, market, shifted).forEach(function (c) { c.qualifies = main; out.push(c); });
    });
  });
  return out;
}
function candidateKey(evId, c) { return evId + "|" + c.market + "|" + c.outcome.name + "|" + c.outcome.point; }
/* the picks an event offers: per market, the best outcome on the main line if its edge clears the bar; never both sides */
function analyzeEvent(cfg, ev, priced) {
  const out = [];
  const all = priced || priceOutcomes(cfg, ev);
  cfg.markets.forEach(function (market) {
    const candidates = all.filter(c => c.market === market && c.qualifies);
    if (!candidates.length) return;
    if (VERBOSE) console.log("  " + eventName(cfg, ev) + " | " + market + " | " + candidates[0].books + " books" + (candidates[0].anchor ? (candidates[0].anchorShift ? " (anchored, carried " + candidates[0].anchorShift + ")" : " (anchored)") : " (consensus)") + " | best edge " + (candidates[0].edge * 100).toFixed(2) + " pts on " + candidates[0].outcome.name + " " + (candidates[0].outcome.point == null ? "" : candidates[0].outcome.point) + " at " + fmtOdds(candidates[0].odds) + " (" + candidates[0].book + ")");
    if (candidates[0].edge >= RULES.minEdge) out.push(candidates[0]);
  });
  return out;
}

function confidence(edge) { return edge >= RULES.high ? "High" : edge >= RULES.medium ? "Medium" : "Lean"; }
function rationale(c, cfg) {
  const line = c.outcome.point == null ? "" : " at " + (c.market === "spreads" && c.outcome.point > 0 ? "+" : "") + c.outcome.point;
  const basis = c.anchor ? c.anchor + "'s de-vigged price" : "the de-vigged consensus of " + c.books + " books";
  return "Fair probability" + line + " is " + pct(c.fair) + " by " + basis + ". " + c.book + " offers " + fmtOdds(c.odds) + ", which implies only " + pct(implied(c.odds)) + "." + (c.anchorNote ? " " + c.anchorNote : "");
}
function factors(c) {
  return ["Best price " + fmtOdds(c.odds) + " at " + c.book, c.anchor ? "Fair line from " + c.anchor : "Fair line from " + c.books + "-book consensus", "Edge " + (c.edge * 100).toFixed(1) + " points over fair"];
}
function slug(s) { return String(s).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, ""); }

/* ---------- closing line value ---------- */
/* The closing line is the last price check before tip-off (the pipeline runs twice a day, so "close" means the last
   look, not the final tick). CLV is the closing fair probability minus the probability implied by the price we logged:
   positive means the price we took beat where the sharp market finished. Null until a later check exists. */
function closingLine(entry) {
  const h = (entry.history || []).filter(x => x && Number.isFinite(Number(x.fair)));
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  return { at: last.at, odds: last.odds, fair: round(last.fair, 4), samples: h.length };
}
function clvOf(entry) {
  const c = closingLine(entry);
  return c ? round(c.fair - implied(entry.odds), 4) : null;
}

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

/* ---------- play of the day: one per Eastern day, the highest-EV pick on the board when first chosen ---------- */
function choosePlayOfDay(log, board, today) {
  let cur = log.find(e => !e.type && e.potd === today);
  if (!cur && board.length) { cur = board.slice().sort((a, b) => (b.ev - a.ev) || (b.edge - a.edge))[0]; cur.potd = today; }
  return cur || null;
}

/* ---------- parlay of the day: 2-3 legs from different games, priced at one book, max EV ---------- */
function bestParlay(board) {
  const legsAll = board.filter(e => e.prices && Object.keys(e.prices).length);
  const books = {}; legsAll.forEach(e => Object.keys(e.prices).forEach(b => { books[b] = true; }));
  let best = null;
  Object.keys(books).forEach(function (book) {
    const legs = legsAll.filter(e => e.prices[book] != null && implied(e.prices[book]) <= e.modelProb); /* each leg must still be +EV at this book */
    const n = legs.length;
    function consider(combo) {
      const events = new Set(combo.map(e => e.eventId)); if (events.size !== combo.length) return;
      const dec = combo.reduce((d, e) => d * decimal(e.prices[book]), 1), fair = combo.reduce((f, e) => f * e.modelProb, 1), ev = fair * dec - 1;
      if (ev > 0 && (!best || ev > best.ev)) best = { book: book, legs: combo.map(e => e.id), legPrices: combo.map(e => e.prices[book]), decimal: round(dec, 4), odds: americanFromDecimal(dec), fairProb: round(fair, 4), ev: round(ev, 4) };
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { consider([legs[i], legs[j]]); for (let k = j + 1; k < n; k++) consider([legs[i], legs[j], legs[k]]); }
  });
  return best;
}
function ensureParlayOfDay(log, board, today, now) {
  let cur = log.find(e => e.type === "parlay" && e.date === today);
  if (cur) return cur;
  const b = bestParlay(board);
  if (!b) return null;
  cur = Object.assign({ type: "parlay", id: "parlay-" + today, date: today, status: "pending", units: 0, loggedAt: now.toISOString() }, b);
  log.push(cur);
  return cur;
}
/* a parlay settles once every leg has: any loss loses it, pushes drop out, the rest must all win */
function gradeParlays(log, now) {
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  log.filter(e => e.type === "parlay" && e.status === "pending").forEach(function (p) {
    const legs = p.legs.map(id => byId[id]);
    if (legs.some(l => !l || l.status === "void")) { p.status = "void"; return; }
    if (!legs.every(l => l.status === "graded")) return;
    const wins = [], losses = [];
    legs.forEach(function (l, i) { if (l.result === "Loss") losses.push(l); else if (l.result === "Win") wins.push(p.legPrices[i]); });
    p.status = "graded"; p.gradedAt = now.toISOString();
    if (losses.length) { p.result = "Loss"; p.units = -1; }
    else if (!wins.length) { p.result = "Push"; p.units = 0; }
    else { p.result = "Win"; p.units = round(wins.reduce((d, pr) => d * decimal(pr), 1) - 1, 2); }
  });
}
function record(entries) {
  const r = { wins: 0, losses: 0, pushes: 0, units: 0 };
  entries.forEach(e => { r[e.result === "Win" ? "wins" : e.result === "Loss" ? "losses" : "pushes"]++; r.units = round(r.units + e.units, 2); });
  return r;
}

/* ---------- performance aggregation ---------- */
function summarize(log, now) {
  const since = etDate(new Date(now.getTime() - RULES.windowDays * 864e5));
  const singles = log.filter(e => !e.type);
  const graded = singles.filter(e => e.status === "graded" && e.date >= since).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.commence < b.commence ? -1 : 1);
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
  const recent = graded.slice().reverse().slice(0, 12).map(e => ({ date: e.date, sport: e.sport, event: e.event, pick: e.pick, odds: e.odds, result: e.result, units: e.units, clv: typeof e.clv === "number" ? e.clv : null, closeOdds: e.close ? e.close.odds : null, closeLine: e.close && e.close.line != null ? e.close.line : null, closeSource: e.close ? e.close.source : null, lineMove: e.lineMove || null }));
  /* closing line value: price CLV where the closing line matches ours (always for moneylines), plus a count of the picks
     whose spread or total closed on a different number, by whether it moved toward us */
  const withClv = graded.filter(e => typeof e.clv === "number");
  const clvSum = withClv.reduce((s, e) => s + e.clv, 0), beat = withClv.filter(e => e.clv > 0).length;
  const clv = { n: withClv.length, avg: withClv.length ? round(clvSum / withClv.length * 100, 2) : null, beat: beat, beatPct: withClv.length ? round(beat / withClv.length * 100, 1) : null, graded: graded.length,
    lineToward: graded.filter(e => e.clv == null && e.lineMove === "toward").length, lineAway: graded.filter(e => e.clv == null && e.lineMove === "away").length, espnCloses: graded.filter(e => e.close && /ESPN/.test(e.close.source || "")).length, sgoCloses: graded.filter(e => e.close && /SportsGameOdds/.test(e.close.source || "")).length };
  const avgEdge = graded.length ? round(graded.reduce((s, e) => s + e.edge, 0) / graded.length * 100, 1) : 0;
  /* all-time profit by day, for the calendar */
  const byDateMap = {};
  singles.filter(e => e.status === "graded").forEach(function (e) {
    const d = byDateMap[e.date] = byDateMap[e.date] || { date: e.date, units: 0, wins: 0, losses: 0, pushes: 0 };
    d.units = round(d.units + e.units, 2); d[e.result === "Win" ? "wins" : e.result === "Loss" ? "losses" : "pushes"]++;
  });
  const byDate = Object.values(byDateMap).sort((a, b) => a.date < b.date ? -1 : 1);
  const potd = record(singles.filter(e => e.potd && e.status === "graded" && e.date >= since));
  const parlays = record(log.filter(e => e.type === "parlay" && e.status === "graded" && e.date >= since));
  return { sample: false, source: "The Odds API", asOf: etDate(now), windowDays: RULES.windowDays, record: rec, units: units, roi: risked ? round(units / risked * 100, 1) : 0, avgEdge: avgEdge, graded: risked, daily: daily, bySport: bySport, recent: recent, byDate: byDate, potd: potd, parlays: parlays, clv: clv };
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
  if (opts.track) return trackRun(opts, now, dataDir, logPath, log);
  const source = opts.fixture ? fixtureSource() : liveSource(opts.key, usage);
  const ctxSource = context.source({ fixture: opts.fixture });
  const sgoSrc = sgo.source({ fixture: opts.fixture });
  const sgoBudget = sgoSrc.enabled ? await sgoSrc.usage() : null;
  const sgoOk = () => sgoSrc.enabled && (!sgoBudget || sgoBudget.max - sgoBudget.used - sgoSrc.stats().entities > RULES.sgoReserve);

  /* 1. grade pending picks whose events have finished. Scores come from free sources first (ESPN's scoreboard, then
     SportsGameOdds' results); The Odds API scores endpoint is called only for picks neither could settle. */
  const cutoff = now.getTime() - RULES.gradeAfterHours * 36e5;
  const pendingBySport = {};
  log.filter(e => e.status === "pending" && Date.parse(e.commence) < cutoff).forEach(e => { (pendingBySport[e.sportKey] = pendingBySport[e.sportKey] || []).push(e); });
  let scoresRequests = 0;
  const fromScores = (e, home, away) => ({ completed: true, home_team: e.home, away_team: e.away, scores: [{ name: e.home, score: home }, { name: e.away, score: away }] });
  async function settle(e, scoreEv, sgoClose) {
    const g = grade(e, scoreEv); if (!g) return false;
    e.status = "graded"; e.result = g.result; e.units = g.units; e.score = g.score; e.gradedAt = now.toISOString();
    /* the close, best source first: the nine-book consensus (SportsGameOdds), DraftKings' close (ESPN), our last pre-game check */
    let c = sgoClose || null;
    if (!c && sgoOk()) { try { c = await sgo.close(sgoSrc, e, context.movedToward); } catch (err) { c = null; } }
    if (!c) { try { c = await context.closingOdds(ctxSource, e); } catch (err) { c = null; } }
    const own = closingLine(e);
    e.close = c ? Object.assign(c, { samples: own ? own.samples : 1 }) : own ? Object.assign({ source: "last check (Odds API)" }, own) : null;
    if (e.close) delete e.close.score;
    e.clv = e.close && typeof e.close.fair === "number" ? round(e.close.fair - implied(e.odds), 4) : null;
    e.lineMove = e.close && e.close.moved ? e.close.moved : null;
    return true;
  }
  for (const sportKey of Object.keys(pendingBySport)) {
    const left = [];
    for (const e of pendingBySport[sportKey]) {
      let scoreEv = null, sgoClose = null;
      try {
        const sb = await ctxSource.scoreboard(e.sportKey, etDate(new Date(Date.parse(e.commence))).replace(/-/g, ""));
        const m = context.findEvent(sb, e.home, e.away);
        if (m && m.comp.status && m.comp.status.type && m.comp.status.type.completed && m.home.score != null && m.away.score != null) scoreEv = fromScores(e, m.home.score, m.away.score);
      } catch (err) { scoreEv = null; }
      if (!scoreEv && sgoOk()) {
        try { sgoClose = await sgo.close(sgoSrc, e, context.movedToward); } catch (err) { sgoClose = null; }
        if (sgoClose && sgoClose.score) scoreEv = fromScores(e, sgoClose.score.home, sgoClose.score.away);
      }
      if (!scoreEv || !(await settle(e, scoreEv, sgoClose))) left.push(e);
    }
    if (!left.length) continue;
    const scores = await source.scores(sportKey); scoresRequests++;
    const byId = {}; (scores || []).forEach(s => { byId[s.id] = s; });
    for (const e of left) {
      if (await settle(e, byId[e.eventId], null)) continue;
      if (Date.parse(e.commence) < now.getTime() - RULES.voidAfterDays * 864e5) e.status = "void";
    }
  }

  gradeParlays(log, now);

  /* 2. fetch odds and find today's edges */
  const active = await source.activeSports();
  const fresh = [];
  const marketRows = []; /* every main-line market priced this run, pick or not: the market board */
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
      const priced = priceOutcomes(cfg, ev);
      priced.filter(c => c.qualifies).forEach(function (c) {
        marketRows.push({ key: candidateKey(ev.id, c), eventId: ev.id, sport: cfg.sport, league: cfg.league, sportKey: cfg.key, event: eventName(cfg, ev), home: ev.home_team, away: ev.away_team, commence: ev.commence_time, start: startLabel(new Date(t), now),
          marketKey: c.market, market: marketLabel(cfg, c.market), outcome: c.outcome, pick: pickName(cfg, c.market, c.outcome), odds: c.odds, book: c.book, prices: c.prices, books: c.books, anchor: c.anchor, anchorShift: c.anchorShift || 0,
          modelProb: round(c.fair, 4), edge: round(c.edge, 4), ev: round(c.fair * (1 + profitPerUnit(c.odds)) - 1, 4) });
      });
      /* picks already on the board: track the price and fair line until tip-off, edge or no edge, so the close is real */
      priced.forEach(function (c) {
        const seen = log.find(e => e.key === candidateKey(ev.id, c) && e.status === "pending");
        if (!seen) return;
        seen.current = { at: now.toISOString(), odds: c.odds, book: c.book, fair: round(c.fair, 4), edge: round(c.edge, 4) };
        seen.history = (seen.history || []).concat([{ at: now.toISOString(), odds: c.odds, fair: round(c.fair, 4) }]).slice(-12);
      });
      analyzeEvent(cfg, ev, priced).forEach(function (c) {
        const key = candidateKey(ev.id, c);
        if (log.some(e => e.key === key)) return; /* logged once, at the price first seen */
        picks.push({
          key: key, id: slug(ev.id.slice(0, 10) + "-" + c.market + "-" + c.outcome.name), date: etDate(new Date(t)), commence: ev.commence_time,
          sport: cfg.sport, league: cfg.league, sportKey: cfg.key, eventId: ev.id, home: ev.home_team, away: ev.away_team,
          event: eventName(cfg, ev), market: marketLabel(cfg, c.market), marketKey: c.market, outcome: c.outcome, threeWay: !!cfg.goals && c.market === "h2h",
          pick: pickName(cfg, c.market, c.outcome), odds: c.odds, book: c.book, prices: c.prices, books: c.books, anchor: c.anchor, anchorNote: c.anchorNote || null, anchorShift: c.anchorShift || 0,
          modelProb: round(c.fair, 4), edge: round(c.edge, 4), ev: round(c.fair * (1 + profitPerUnit(c.odds)) - 1, 4), confidence: confidence(c.edge),
          rationale: rationale(c, cfg), factors: factors(c), status: "pending", units: 0, loggedAt: now.toISOString(),
          current: { at: now.toISOString(), odds: c.odds, book: c.book, fair: round(c.fair, 4), edge: round(c.edge, 4) }, history: [{ at: now.toISOString(), odds: c.odds, fair: round(c.fair, 4) }]
        });
      });
    });
    if (VERBOSE) console.log("  requests remaining: " + usage.remaining);
    picks.sort((a, b) => b.edge - a.edge).slice(0, RULES.maxPerSport).forEach(p => fresh.push(p));
  }
  fresh.sort((a, b) => b.edge - a.edge).slice(0, RULES.maxPicks).forEach(p => log.push(p));

  /* 3. today's board = every pending pick whose event is still ahead; then the day's play and parlay */
  const boardEntries = log.filter(e => !e.type && e.status === "pending" && Date.parse(e.commence) > now.getTime()).sort((a, b) => b.edge - a.edge);
  const today = etDate(now);
  /* context (injuries, weather, rest, records) and the written breakdown for every pick on the board */
  let ctxRequests = 0;
  try { ctxRequests = await context.enrich(boardEntries, { fixture: opts.fixture, rules: RULES, now: now }); } catch (err) { console.warn("context step failed: " + err.message); }
  /* second price source: every book's price on each pick's line and the market's drift since the open, then the breakdowns again */
  let sgoStats = { changed: 0, entities: 0 };
  if (sgoOk() && boardEntries.length) { try { sgoStats = await sgo.refresh(boardEntries, { fixture: opts.fixture, now: now, source: sgoSrc }); boardEntries.forEach(e => { e.breakdown = context.buildBreakdown(e, e.context, RULES); }); } catch (err) { console.warn("SportsGameOdds step failed: " + err.message); } }
  const potdEntry = choosePlayOfDay(log, boardEntries, today);
  const parlayEntry = ensureParlayOfDay(log, boardEntries, today, now);
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  const board = boardEntries.map(e => publicPick(e, now));
  const playOfDay = potdEntry ? Object.assign(publicPick(potdEntry, now), { started: Date.parse(potdEntry.commence) <= now.getTime(), status: potdEntry.status, result: potdEntry.result || null }) : null;
  const parlayOfDay = parlayEntry ? { id: parlayEntry.id, date: parlayEntry.date, book: parlayEntry.book, odds: parlayEntry.odds, decimal: parlayEntry.decimal, fairProb: parlayEntry.fairProb, ev: parlayEntry.ev, status: parlayEntry.status, result: parlayEntry.result || null,
    legs: parlayEntry.legs.map((id, i) => { const l = byId[id]; return { id: id, pick: l.pick, event: l.event, sport: l.sport, price: parlayEntry.legPrices[i], started: Date.parse(l.commence) <= now.getTime(), result: l.result || null }; }) } : null;

  /* the market board: every priced market, flagged pick / watch / none, best edge first */
  const pendingByKey = {}; log.filter(e => !e.type && e.status === "pending").forEach(e => { pendingByKey[e.key] = e.id; });
  marketRows.forEach(function (r) { r.pickId = pendingByKey[r.key] || null; r.status = r.pickId ? "pick" : r.edge >= RULES.watchEdge ? "watch" : "none"; delete r.key; });
  marketRows.sort((a, b) => b.edge - a.edge);
  const marketData = { sample: false, source: "The Odds API", generatedAt: now.toISOString(), threshold: RULES.minEdge, watch: RULES.watchEdge, games: new Set(marketRows.map(r => r.eventId)).size, sports: Array.from(new Set(marketRows.map(r => r.sport))), rows: marketRows };

  /* 4. write */
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1) + "\n");
  if (marketRows.length || !fs.existsSync(path.join(dataDir, "market.js"))) fs.writeFileSync(path.join(dataDir, "market.js"), "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.MARKET_DATA = " + JSON.stringify(marketData, null, 1) + ";\n");
  const picksData = { sample: false, source: "The Odds API", generatedAt: now.toISOString(), playOfDay: playOfDay, parlayOfDay: parlayOfDay, picks: board };
  fs.writeFileSync(path.join(dataDir, "picks.js"), "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.PICKS_DATA = " + JSON.stringify(picksData, null, 2) + ";\n");
  const perf = summarize(log, now);
  fs.writeFileSync(path.join(dataDir, "performance.js"), "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.PERF_DATA = " + JSON.stringify(perf, null, 2) + ";\n");
  return { added: fresh.length, board: board.length, graded: perf.graded, remaining: usage.remaining, playOfDay: playOfDay && playOfDay.pick, parlay: parlayOfDay && parlayOfDay.legs.length, contextRequests: ctxRequests, scoresRequests: scoresRequests, market: marketRows.length, marketGames: marketData.games, sgo: { enabled: sgoSrc.enabled, entities: sgoSrc.stats().entities, moved: sgoStats.changed, monthUsed: sgoBudget ? sgoBudget.used : null } };
}
/* the pick as the site sees it */
function publicPick(e, now) {
  return { id: e.id, sport: e.sport, league: e.league, sportKey: e.sportKey, event: e.event, home: e.home, away: e.away, marketKey: e.marketKey, outcome: e.outcome, commence: e.commence, start: startLabel(new Date(e.commence), now), market: e.market, pick: e.pick, odds: e.odds, book: e.book, prices: e.prices || {}, pricesAt: e.pricesAt || e.loggedAt || null, books: e.books || null, anchor: e.anchor || null, modelProb: e.modelProb, ev: e.ev, confidence: e.confidence, rationale: e.rationale, factors: e.factors, breakdown: e.breakdown || null, context: e.context || null, movement: e.movement || null, dk: e.dk || null, dkHistory: e.dkHistory || [], mkt: e.mkt || null,
    sgo: e.sgo ? { at: e.sgo.at, n: e.sgo.n, best: e.sgo.best, fair: e.sgo.fair, vendorFair: e.sgo.vendor ? e.sgo.vendor.fair : null, open: e.sgo.open, now: e.sgo.now } : null, sgoHistory: e.sgoHistory || [] };
}

/* ---------- track mode: free ESPN refresh of the board between odds runs ---------- */
async function trackRun(opts, now, dataDir, logPath, log) {
  const boardEntries = log.filter(e => !e.type && e.status === "pending" && Date.parse(e.commence) > now.getTime()).sort((a, b) => b.edge - a.edge);
  const t = await context.trackOdds(boardEntries, { fixture: opts.fixture, now: now });
  const sgoSrc = sgo.source({ fixture: opts.fixture });
  let sgoStats = { changed: 0, entities: 0 };
  /* hourly runs: spend entities only on games close to tip-off, when the numbers actually move */
  const soon = boardEntries.filter(e => Date.parse(e.commence) - now.getTime() <= RULES.sgoTrackWindowHours * 36e5);
  if (sgoSrc.enabled && soon.length) {
    const u = await sgoSrc.usage();
    if (!u || u.max - u.used > RULES.sgoReserve) { try { sgoStats = await sgo.refresh(soon, { fixture: opts.fixture, now: now, source: sgoSrc }); } catch (err) { console.warn("SportsGameOdds step failed: " + err.message); } }
  }
  boardEntries.forEach(function (e) { e.breakdown = context.buildBreakdown(e, e.context, RULES); });
  const today = etDate(now);
  const potdEntry = log.find(e => !e.type && e.potd === today) || null;
  const parlayEntry = log.find(e => e.type === "parlay" && e.date === today) || null;
  const byId = {}; log.forEach(e => { byId[e.id] = e; });
  /* keep the odds run's timestamp as generatedAt; trackedAt says when the book numbers were last refreshed */
  let generatedAt = now.toISOString();
  const picksPath = path.join(dataDir, "picks.js");
  if (fs.existsSync(picksPath)) { const m = fs.readFileSync(picksPath, "utf8").match(/"generatedAt":\s*"([^"]+)"/); if (m) generatedAt = m[1]; }
  const playOfDay = potdEntry ? Object.assign(publicPick(potdEntry, now), { started: Date.parse(potdEntry.commence) <= now.getTime(), status: potdEntry.status, result: potdEntry.result || null }) : null;
  const parlayOfDay = parlayEntry ? { id: parlayEntry.id, date: parlayEntry.date, book: parlayEntry.book, odds: parlayEntry.odds, decimal: parlayEntry.decimal, fairProb: parlayEntry.fairProb, ev: parlayEntry.ev, status: parlayEntry.status, result: parlayEntry.result || null,
    legs: parlayEntry.legs.map((id, i) => { const l = byId[id]; return { id: id, pick: l.pick, event: l.event, sport: l.sport, price: parlayEntry.legPrices[i], started: Date.parse(l.commence) <= now.getTime(), result: l.result || null }; }) } : null;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1) + "\n");
  const picksData = { sample: false, source: "The Odds API", generatedAt: generatedAt, trackedAt: now.toISOString(), playOfDay: playOfDay, parlayOfDay: parlayOfDay, picks: boardEntries.map(e => publicPick(e, now)) };
  fs.writeFileSync(picksPath, "/* Generated by scripts/update-data.js. Do not edit; the next run overwrites it. */\nwindow.PICKS_DATA = " + JSON.stringify(picksData, null, 2) + ";\n");
  return { track: true, board: boardEntries.length, moved: t.changed, sgoMoved: sgoStats.changed, sgoEntities: sgoStats.entities, contextRequests: t.requests };
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
  const o = { fixture: false, out: null, now: null, key: process.env.ODDS_API_KEY, track: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--fixture") o.fixture = true;
    else if (argv[i] === "--track") o.track = true;
    else if (argv[i] === "--out") o.out = argv[++i];
    else if (argv[i] === "--now") o.now = argv[++i];
    else if (argv[i] === "--verbose") VERBOSE = true;
  }
  return o;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(function (r) {
    if (r.track) { console.log("Track: " + r.board + " on the board, DraftKings moved on " + r.moved + ", market moved on " + r.sgoMoved + " (" + r.sgoEntities + " SportsGameOdds entities), ESPN requests: " + r.contextRequests); return; }
    console.log("Picks added: " + r.added + ", on the board: " + r.board + ", market board: " + r.market + " markets in " + r.marketGames + " games, graded in window: " + r.graded + ", play of the day: " + (r.playOfDay || "none") + ", parlay legs: " + (r.parlay || 0) + ", context requests: " + r.contextRequests + ", Odds API score calls: " + r.scoresRequests + (r.remaining != null ? ", API requests remaining: " + r.remaining : "") + (r.sgo.enabled ? ", SportsGameOdds entities this run: " + r.sgo.entities + (r.sgo.monthUsed != null ? " (month: " + r.sgo.monthUsed + ")" : "") : ", SportsGameOdds: no key"));
  }).catch(function (e) { console.error(e.message); process.exit(1); });
}
module.exports = { run, implied, devig, decimal, americanFromDecimal, analyzeEvent, priceOutcomes, shiftedAnchor, closingLine, clvOf, grade, summarize, profitPerUnit, bestParlay, choosePlayOfDay, gradeParlays, RULES, SPORTS, LINE_VALUE };
