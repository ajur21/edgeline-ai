/* ==========================================================================
   EdgeLine AI — SportsGameOdds adapter (second price source)
   Free "amateur" tier: 2,500 event objects a month, 10 requests a minute,
   nine U.S. books (DraftKings, FanDuel, BetMGM, Caesars, ESPN BET, Bovada,
   PointsBet, Unibet; William Hill is Caesars' old feed) and the vendor's own
   de-vigged "fair" number with its opener. No Pinnacle, so The Odds API keeps
   the sharp anchor and finds the edges; this feed does the cheap, frequent
   work: refresh every book's price on a pick's line between runs, show how
   the whole market has drifted since the open, record our own pre-game look at the market (`sgoHistory`, a fallback
   for the close) and read a finished game's score. Every event returned costs one entity, so calls are by
   eventIDs once a game is known and by a tight start window to find it.
   Key: SGO_API_KEY (repository secret). Without it every call is skipped.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const API = "https://api.sportsgameodds.com/v2";
const { clubCore } = require("./context.js");
const LEAGUE = { americanfootball_nfl: "NFL", basketball_nba: "NBA", baseball_mlb: "MLB", icehockey_nhl: "NHL", soccer_usa_mls: "MLS" };
const ODD_IDS = ["points-home-game-ml-home", "points-away-game-ml-away", "points-home-game-sp-home", "points-away-game-sp-away", "points-all-game-ou-over", "points-all-game-ou-under"];
/* soccer (MLS, since 2026-11-05; the free tier has no EPL): the 1X2 and the goals total settle on 90 minutes, which the
   API carries on the `reg` period, the 1X2 as a three-way moneyline (ml3way: home, away and the draw, whose entity is
   "all"); `game` would include a playoff shootout's winner. The ids follow the vendor's pattern
   ({stat}-{entity}-{period}-{betType}-{side}) and its MLS page (points-all-reg-ou-over); the three-way ones are unconfirmed
   until a live response shows them, and a wrong id only means no odds, so the pick goes without the second source. */
const SOCCER_ODD_IDS = { home: "points-home-reg-ml3way-home", away: "points-away-reg-ml3way-away", draw: "points-all-reg-ml3way-draw", over: "points-all-reg-ou-over", under: "points-all-reg-ou-under" };
const SOCCER_LEAGUES = { MLS: true };
function oddIdsFor(league) { return SOCCER_LEAGUES[league] ? Object.keys(SOCCER_ODD_IDS).map(k => SOCCER_ODD_IDS[k]) : ODD_IDS; }
/* vendor book ids -> the titles The Odds API uses, so `prices` stays one map */
const BOOKS = { draftkings: "DraftKings", fanduel: "FanDuel", betmgm: "BetMGM", caesars: "Caesars", espnbet: "ESPN BET", bovada: "Bovada", pointsbet: "PointsBet", unibet: "Unibet", betrivers: "BetRivers", fanatics: "Fanatics", pinnacle: "Pinnacle", bet365: "Bet365", hardrock: "Hard Rock Bet", betonline: "BetOnline.ag", williamhill: "Caesars" };
const SOURCE = "SportsGameOdds";
const MIN_GAP_MS = 6200; /* ten requests a minute */

function american(s) { if (s == null) return null; const t = String(s).trim().toUpperCase(); if (t === "EVEN" || t === "EV") return 100; const n = Number(t.replace(/^\+/, "")); return Number.isFinite(n) && n !== 0 ? n : null; }
function num(s) { if (s == null) return null; const n = Number(String(s).replace(/^\+/, "")); return Number.isFinite(n) ? n : null; }
function implied(a) { return a < 0 ? -a / (-a + 100) : 100 / (a + 100); }
function round(n, d) { const m = Math.pow(10, d == null ? 4 : d); return Math.round(n * m) / m; }
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- sources ---------- */
function liveSource(key) {
  let last = 0, requests = 0, entities = 0;
  async function get(pathname, params) {
    const wait = last + MIN_GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now(); requests++;
    const url = new URL(API + pathname); Object.keys(params || {}).forEach(k => { if (params[k] != null && params[k] !== "") url.searchParams.set(k, params[k]); });
    const res = await fetch(url, { headers: { "X-Api-Key": key, accept: "application/json" } });
    if (!res.ok) throw new Error("SportsGameOdds " + res.status + " for " + pathname);
    const body = await res.json();
    if (body && body.success === false) throw new Error("SportsGameOdds: " + (body.error || "request failed"));
    return body;
  }
  return {
    enabled: !!key,
    usage: async function () { try { const u = (await get("/account/usage", {})).data.rateLimits["per-month"]; return { used: Number(u["current-entities"]) || 0, max: Number(u["max-entities"]) || 0 }; } catch (e) { return null; } },
    events: async function (p) {
      const params = { leagueID: p.league, startsAfter: p.startsAfter, startsBefore: p.startsBefore, eventIDs: p.eventIDs && p.eventIDs.join(","), oddIDs: p.allOdds ? null : oddIdsFor(p.league).join(","), oddsAvailable: p.allOdds ? "true" : null, limit: 50 };
      try { const body = await get("/events", params); const list = body.data || []; entities += list.length; return list; } catch (e) { return null; }
    },
    stats: () => ({ requests: requests, entities: entities })
  };
}
function fixtureSource(name) {
  const dir = path.join(__dirname, "fixtures", "sgo");
  const read = league => { const f = path.join(dir, (name || league) + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; };
  let entities = 0;
  return {
    enabled: true,
    usage: async () => ({ used: 0, max: 2500 }),
    events: async function (p) {
      let list = p.league ? read(p.league) : Object.keys(LEAGUE).map(k => LEAGUE[k]).reduce((a, l) => a.concat(read(l)), []);
      if (p.eventIDs) list = list.filter(e => p.eventIDs.indexOf(e.eventID) !== -1);
      if (p.startsAfter) list = list.filter(e => Date.parse(e.status.startsAt) >= Date.parse(p.startsAfter));
      if (p.startsBefore) list = list.filter(e => Date.parse(e.status.startsAt) <= Date.parse(p.startsBefore));
      entities += list.length; return list;
    },
    stats: () => ({ requests: 0, entities: entities })
  };
}
function source(opts) { return opts && opts.fixture ? fixtureSource(opts.fixtureName) : liveSource(opts && opts.key != null ? opts.key : process.env.SGO_API_KEY); }

/* ---------- matching ---------- */
function teamMatches(name, team) {
  if (!name || !team || !team.names) return false;
  const n = norm(name), long = norm(team.names.long), med = norm(team.names.medium), loc = norm(team.names.location), short = norm(team.names.short);
  return n === long || n === short || (med && n.endsWith(med) && (loc === "" || n.indexOf(loc.slice(0, 4)) !== -1)) || (loc && n === loc) || (!!clubCore(name) && clubCore(name) === clubCore(team.names.long));
}
function matches(ev, e) { return ev && ev.teams && teamMatches(e.home, ev.teams.home) && teamMatches(e.away, ev.teams.away); }

/* ---------- reading one event for one pick ---------- */
/* the pick's own odd id first, then the other side(s) of its market (two, for a soccer three-way moneyline) */
function sideIds(e) {
  const home = e.outcome && e.outcome.name === e.home, away = e.outcome && e.outcome.name === e.away;
  if (/^soccer_/.test(e.sportKey || "")) {
    const S = SOCCER_ODD_IDS, draw = /^draw$/i.test((e.outcome && e.outcome.name) || "");
    if (e.marketKey === "h2h") return home ? [S.home, S.away, S.draw] : away ? [S.away, S.home, S.draw] : draw ? [S.draw, S.home, S.away] : null;
    if (e.marketKey === "totals") return /^over$/i.test(e.outcome && e.outcome.name) ? [S.over, S.under] : [S.under, S.over];
    return null;
  }
  if (e.marketKey === "h2h") return home ? ["points-home-game-ml-home", "points-away-game-ml-away"] : away ? ["points-away-game-ml-away", "points-home-game-ml-home"] : null;
  if (e.marketKey === "spreads") return home ? ["points-home-game-sp-home", "points-away-game-sp-away"] : away ? ["points-away-game-sp-away", "points-home-game-sp-home"] : null;
  if (e.marketKey === "totals") return /^over$/i.test(e.outcome && e.outcome.name) ? ["points-all-game-ou-over", "points-all-game-ou-under"] : ["points-all-game-ou-under", "points-all-game-ou-over"];
  return null;
}
function bookLine(entry, market) { return market === "spreads" ? num(entry.spread) : market === "totals" ? num(entry.overUnder) : null; }
function sameLine(a, b) { return a == null && b == null ? true : a != null && b != null && Math.abs(a - b) < 1e-9; }
/* the pick's side on one event: every book's price on our exact line, the consensus fair there, the vendor fair and opener */
function snapshot(ev, e, nowIso) {
  const ids = sideIds(e); if (!ids || !ev || !ev.odds) return null;
  const mine = ev.odds[ids[0]], others = ids.slice(1).map(id => ev.odds[id]); if (!mine) return null;
  const point = e.outcome && e.outcome.point != null ? Number(e.outcome.point) : null;
  const oppPoint = point == null ? null : e.marketKey === "spreads" ? -point : point;
  const books = {}, fairs = [];
  const seen = {};
  Object.keys(mine.byBookmaker || {}).forEach(function (b) {
    const title = BOOKS[b]; if (!title || seen[title]) return;
    const m = mine.byBookmaker[b]; if (!m || m.available === false) return;
    const price = american(m.odds); if (price == null) return;
    if (!sameLine(bookLine(m, e.marketKey), point)) return;
    seen[title] = true; books[title] = price;
    /* this book's other side(s) on the same line; the fair is our side's share of the book's whole market (de-vigged) */
    const ops = others.map(function (t) { const o = t && t.byBookmaker && t.byBookmaker[b]; const op = o && o.available !== false ? american(o.odds) : null; return op != null && sameLine(bookLine(o, e.marketKey), oppPoint) ? op : null; });
    if (ops.length && ops.every(op => op != null)) fairs.push(implied(price) / ops.reduce((s, op) => s + implied(op), implied(price)));
  });
  const vendorLine = e.marketKey === "spreads" ? num(mine.fairSpread) : e.marketKey === "totals" ? num(mine.fairOverUnder) : null;
  const vendorOpenLine = e.marketKey === "spreads" ? num(mine.openFairSpread) : e.marketKey === "totals" ? num(mine.openFairOverUnder) : null;
  const vendorFair = american(mine.fairOdds), vendorOpen = american(mine.openFairOdds);
  const consensus = fairs.length ? fairs.reduce((a, b) => a + b, 0) / fairs.length : null;
  const n = Object.keys(books).length;
  let best = null; Object.keys(books).forEach(function (t) { if (!best || implied(books[t]) < implied(books[best])) best = t; });
  return {
    source: SOURCE, eventId: ev.eventID, at: nowIso || new Date().toISOString(), books: books, n: n, best: best ? { book: best, odds: books[best] } : null,
    fair: consensus == null ? null : round(consensus, 4), fairBooks: fairs.length,
    vendor: { line: vendorLine, odds: vendorFair, fair: vendorFair == null ? null : round(implied(vendorFair), 4), sameLine: e.marketKey === "h2h" || sameLine(vendorLine, point) },
    open: vendorOpen == null && vendorOpenLine == null ? null : { line: vendorOpenLine, odds: vendorOpen },
    now: { line: vendorLine, odds: vendorFair },
    finished: !!(ev.status && (ev.status.completed || ev.status.ended)), score: results(ev, e.sportKey)
  };
}
/* the final score; soccer's after 90 minutes (the `reg` period: a playoff tie's extra time and shootout are not in it) */
function results(ev, sportKey) {
  const g = ev && ev.results && (/^soccer_/.test(sportKey || "") ? ev.results.reg : ev.results.game); if (!g || !g.home || !g.away) return null;
  const h = Number(g.home.points), a = Number(g.away.points);
  return Number.isFinite(h) && Number.isFinite(a) && ev.status && ev.status.completed ? { home: h, away: a } : null;
}

/* ---------- finding games (one entity per event returned) ---------- */
async function findEvents(src, entries, now) {
  const out = {}; /* log entry id -> event */
  const byKnown = {}, unknown = [];
  entries.forEach(function (e) { if (!LEAGUE[e.sportKey]) return; if (e.sgoEventId) (byKnown[e.sgoEventId] = byKnown[e.sgoEventId] || []).push(e); else unknown.push(e); });
  /* known games: one batched call per league */
  const leagues = {};
  Object.keys(byKnown).forEach(id => { const l = LEAGUE[byKnown[id][0].sportKey]; (leagues[l] = leagues[l] || []).push(id); });
  for (const l of Object.keys(leagues)) {
    const list = await src.events({ league: l, eventIDs: leagues[l] });
    (list || []).forEach(ev => { (byKnown[ev.eventID] || []).forEach(e => { out[e.id] = ev; }); });
  }
  /* new games: a window of a few minutes around the start, which also returns the other games tipping at that time */
  const done = {};
  for (const e of unknown) {
    const key = e.sportKey + "|" + e.commence;
    if (!done[key]) {
      const t = Date.parse(e.commence);
      done[key] = (await src.events({ league: LEAGUE[e.sportKey], startsAfter: new Date(t - 15 * 60e3).toISOString(), startsBefore: new Date(t + 15 * 60e3).toISOString() })) || [];
    }
    const ev = done[key].find(x => matches(x, e));
    if (ev) { e.sgoEventId = ev.eventID; out[e.id] = ev; }
  }
  return out;
}

/* ---------- board refresh: prices on our line from nine books, market drift since open ---------- */
async function refresh(entries, opts) {
  const src = (opts && opts.source) || source(opts);
  if (!src.enabled) return { skipped: "no key", changed: 0, entities: 0 };
  const now = opts && opts.now ? new Date(opts.now) : new Date();
  const found = await findEvents(src, entries, now);
  let changed = 0;
  entries.forEach(function (e) {
    const ev = found[e.id]; if (!ev) return;
    const s = snapshot(ev, e, now.toISOString()); if (!s) return;
    e.sgo = s;
    /* fresher prices for the books both feeds carry, new books added; the logged price and book never change */
    Object.keys(s.books).forEach(function (t) { if (t === "Pinnacle") return; e.prices = e.prices || {}; e.prices[t] = s.books[t]; });
    if (s.n) e.pricesAt = now.toISOString();
    const last = (e.sgoHistory || []).length ? e.sgoHistory[e.sgoHistory.length - 1] : null;
    const point = { at: now.toISOString(), fair: s.fair, vendorFair: s.vendor.fair, line: s.now.line, odds: s.now.odds, best: s.best ? s.best.odds : null, n: s.n };
    if (!last || last.fair !== point.fair || last.line !== point.line || last.best !== point.best || last.vendorFair !== point.vendorFair) { e.sgoHistory = (e.sgoHistory || []).concat([point]).slice(-48); changed++; }
  });
  return { changed: changed, entities: src.stats().entities, requests: src.stats().requests };
}

/* ---------- a finished game's result: its score, never a price (2026-11-08) ----------
   This was `close()`, the first source of the close at grading. But the event record after a game carries the last
   in-game prices with no book open: 16 of the first 17 graded picks read "consensus close (SportsGameOdds, 0 books)" (the
   Flyers ML posted at +133 "closed" at +1010), so CLV read 20 to 40 points either way. The close now comes from ESPN's
   DraftKings close or our own pre-game checks (update-data.js closeFor, which reads the `sgoHistory` points `refresh`
   records before the start); this reads only the score, for grading a game ESPN cannot settle. */
async function result(src, e) {
  if (!src.enabled || !LEAGUE[e.sportKey]) return null;
  const found = await findEvents(src, [e]);
  const ev = found[e.id]; if (!ev) return null;
  if (!(ev.status && (ev.status.completed || ev.status.ended))) return null;
  return { sgoEventId: ev.eventID, score: results(ev, e.sportKey) };
}

/* ---------- player props: every player's lines ride along in the game's event object ----------
   oddID = <statID>-<playerID>-game-ou-<over|under>, e.g. points-LEBRON_JAMES_1_NBA-game-ou-over, or for the NFL
   passing_yards-PATRICK_MAHOMES_1_NFL-game-ou-over (NFL statIDs: passing_yards, passing_touchdowns, rushing_yards,
   receiving_yards, receiving_receptions; the vendor's market list, checked 2026-11-08).
   The event's `players` map gives names; when it is missing the name is read back out of the id. */
const PROP_STATS = { pts: "points", reb: "rebounds", ast: "assists", threes: "threePointersMade", pra: "points+rebounds+assists" };
function normName(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
}
function nameFromId(id) { const parts = String(id || "").split("_"); return parts.length > 2 ? parts.slice(0, -2).join(" ") : parts.join(" "); }
/* normalised name -> playerID, from the players map and from every player oddID */
function playerIndex(ev) {
  const idx = {}, last = {};
  const add = (id, name) => { if (!id || !name) return; const n = normName(name); if (!n) return; idx[n] = idx[n] || id; const parts = String(name).trim().split(/\s+/); const key = normName(parts[parts.length - 1]) + "|" + normName(parts[0]).charAt(0); (last[key] = last[key] || []).push(id); };
  Object.keys(ev && ev.players || {}).forEach(id => { const pl = ev.players[id]; add(id, pl && (pl.name || ((pl.firstName || "") + " " + (pl.lastName || "")))); });
  Object.keys(ev && ev.odds || {}).forEach(oid => { const o = ev.odds[oid]; const ent = (o && o.statEntityID) || oid.split("-")[1]; if (!ent || /^(all|home|away)$/.test(ent)) return; if (!ev.players || !ev.players[ent]) add(ent, nameFromId(ent)); });
  return { byName: idx, byLast: last };
}
function findPlayer(index, name) {
  if (!index) return null;
  const n = normName(name); if (index.byName[n]) return index.byName[n];
  const parts = String(name || "").trim().split(/\s+/); if (parts.length < 2) return null;
  const c = index.byLast[normName(parts[parts.length - 1]) + "|" + normName(parts[0]).charAt(0)];
  return c && c.length === 1 ? c[0] : null;
}
/* one stat for one player: the consensus line, every book's price on it for each side, the fair probability per side */
function propSnapshot(ev, playerID, statID) {
  if (!ev || !ev.odds || !playerID) return null;
  const over = ev.odds[statID + "-" + playerID + "-game-ou-over"], under = ev.odds[statID + "-" + playerID + "-game-ou-under"];
  if (!over && !under) return null;
  const main = over || under;
  /* the main line: the number the most books quote on both sides (ties to the vendor consensus); an alternate ladder
     where only one side is offered never becomes the line. Vendor consensus, then the most common one-sided number, as fallbacks */
  const two = {}, vendor = num(main.bookOverUnder);
  if (over && under) Object.keys(over.byBookmaker || {}).forEach(b => {
    const o = (over.byBookmaker || {})[b], u = (under.byBookmaker || {})[b]; if (!o || !u || o.available === false || u.available === false) return;
    const lo = num(o.overUnder), lu = num(u.overUnder); if (lo == null || !sameLine(lo, lu) || american(o.odds) == null || american(u.odds) == null) return;
    two[lo] = (two[lo] || 0) + 1;
  });
  const twoLines = Object.keys(two).map(Number).sort((a, b) => two[b] - two[a] || (sameLine(a, vendor) ? -1 : sameLine(b, vendor) ? 1 : 0) || a - b);
  let line = twoLines.length ? twoLines[0] : null;
  if (line == null) line = vendor; if (line == null) line = num(main.fairOverUnder);
  if (line == null) { const count = {}; Object.keys(main.byBookmaker || {}).forEach(b => { const l = num(main.byBookmaker[b].overUnder); if (l != null) count[l] = (count[l] || 0) + 1; }); const ls = Object.keys(count).sort((a, b) => count[b] - count[a]); line = ls.length ? Number(ls[0]) : null; }
  if (line == null) return null;
  const side = o => {
    const books = {}, seen = {};
    Object.keys(o && o.byBookmaker || {}).forEach(b => { const title = BOOKS[b]; if (!title || seen[title]) return; const m = o.byBookmaker[b]; if (!m || m.available === false) return; const price = american(m.odds); if (price == null || !sameLine(num(m.overUnder), line)) return; seen[title] = true; books[title] = price; });
    let best = null; Object.keys(books).forEach(t => { if (!best || implied(books[t]) < implied(books[best])) best = t; });
    const vendor = o && sameLine(num(o.fairOverUnder), line) ? american(o.fairOdds) : null;
    return { books: books, n: Object.keys(books).length, best: best ? { book: best, odds: books[best] } : null, vendorOdds: vendor };
  };
  const o = side(over), u = side(under);
  /* fair: the vendor's de-vigged pair when it is quoted on this line, else our own de-vig across the books carrying both sides */
  let fairOver = null, fairBooks = 0;
  if (o.vendorOdds != null && u.vendorOdds != null) { const a = implied(o.vendorOdds), b = implied(u.vendorOdds); fairOver = a / (a + b); }
  else {
    const pairs = []; Object.keys(o.books).forEach(t => { if (u.books[t] != null) pairs.push(implied(o.books[t]) / (implied(o.books[t]) + implied(u.books[t]))); });
    if (pairs.length) { fairOver = pairs.reduce((x, y) => x + y, 0) / pairs.length; fairBooks = pairs.length; }
  }
  const openLine = num(main.openFairOverUnder);
  return {
    line: line, fairLine: num(main.fairOverUnder), openLine: openLine, fairBooks: fairBooks, vendorFair: o.vendorOdds != null,
    over: { fair: fairOver == null ? null : round(fairOver, 4), odds: o.best ? o.best.odds : null, book: o.best ? o.best.book : null, n: o.n, books: o.books },
    under: { fair: fairOver == null ? null : round(1 - fairOver, 4), odds: u.best ? u.best.odds : null, book: u.best ? u.best.book : null, n: u.n, books: u.books }
  };
}
/* every tracked stat for one named player on one event; null when the player is not priced.
   stats: our key -> the vendor's statID (the NBA's PROP_STATS by default; scripts/nfl-props.js passes the NFL's) */
function playerProps(ev, name, index, stats) {
  const id = findPlayer(index || playerIndex(ev), name); if (!id) return null;
  const map = stats || PROP_STATS, out = {}; let any = false;
  Object.keys(map).forEach(k => { const s = propSnapshot(ev, id, map[k]); if (s && (s.over.n || s.under.n || s.over.fair != null)) { out[k] = s; any = true; } });
  return any ? { playerID: id, stats: out } : null;
}
/* tonight's events for a league, all odds included (one entity per game) */
async function nightEvents(src, league, starts) {
  const ts = (starts || []).map(s => Date.parse(s)).filter(Number.isFinite); if (!ts.length) return [];
  const list = await src.events({ league: league, allOdds: true, startsAfter: new Date(Math.min.apply(null, ts) - 60 * 60e3).toISOString(), startsBefore: new Date(Math.max.apply(null, ts) + 60 * 60e3).toISOString() });
  return list || [];
}
function eventFor(list, home, away) { return (list || []).find(ev => ev.teams && teamMatches(home, ev.teams.home) && teamMatches(away, ev.teams.away)) || null; }

module.exports = { source, refresh, result, snapshot, sideIds, oddIdsFor, findEvents, results, matches, LEAGUE, BOOKS, ODD_IDS, SOCCER_ODD_IDS, SOURCE, PROP_STATS, propSnapshot, playerProps, playerIndex, findPlayer, normName, nightEvents, eventFor, teamMatches };
