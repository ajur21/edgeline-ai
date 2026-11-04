/* ==========================================================================
   EdgeLine AI — SportsGameOdds adapter (second price source)
   Free "amateur" tier: 2,500 event objects a month, 10 requests a minute,
   nine U.S. books (DraftKings, FanDuel, BetMGM, Caesars, ESPN BET, Bovada,
   PointsBet, Unibet; William Hill is Caesars' old feed) and the vendor's own
   de-vigged "fair" number with its opener. No Pinnacle, so The Odds API keeps
   the sharp anchor and finds the edges; this feed does the cheap, frequent
   work: refresh every book's price on a pick's line between runs, show how
   the whole market has drifted since the open, and give a nine-book close
   after the game. Every event returned costs one entity, so calls are by
   eventIDs once a game is known and by a tight start window to find it.
   Key: SGO_API_KEY (repository secret). Without it every call is skipped.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const API = "https://api.sportsgameodds.com/v2";
const LEAGUE = { americanfootball_nfl: "NFL", basketball_nba: "NBA", baseball_mlb: "MLB", icehockey_nhl: "NHL" };
const ODD_IDS = ["points-home-game-ml-home", "points-away-game-ml-away", "points-home-game-sp-home", "points-away-game-sp-away", "points-all-game-ou-over", "points-all-game-ou-under"];
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
      const params = { leagueID: p.league, startsAfter: p.startsAfter, startsBefore: p.startsBefore, eventIDs: p.eventIDs && p.eventIDs.join(","), oddIDs: ODD_IDS.join(","), limit: 50 };
      try { const body = await get("/events", params); const list = body.data || []; entities += list.length; return list; } catch (e) { return null; }
    },
    stats: () => ({ requests: requests, entities: entities })
  };
}
function fixtureSource() {
  const dir = path.join(__dirname, "fixtures", "sgo");
  const read = league => { const f = path.join(dir, league + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : []; };
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
function source(opts) { return opts && opts.fixture ? fixtureSource() : liveSource(opts && opts.key != null ? opts.key : process.env.SGO_API_KEY); }

/* ---------- matching ---------- */
function teamMatches(name, team) {
  if (!name || !team || !team.names) return false;
  const n = norm(name), long = norm(team.names.long), med = norm(team.names.medium), loc = norm(team.names.location), short = norm(team.names.short);
  return n === long || n === short || (med && n.endsWith(med) && (loc === "" || n.indexOf(loc.slice(0, 4)) !== -1)) || (loc && n === loc);
}
function matches(ev, e) { return ev && ev.teams && teamMatches(e.home, ev.teams.home) && teamMatches(e.away, ev.teams.away); }

/* ---------- reading one event for one pick ---------- */
function sideIds(e) {
  const home = e.outcome && e.outcome.name === e.home, away = e.outcome && e.outcome.name === e.away;
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
  const mine = ev.odds[ids[0]], theirs = ev.odds[ids[1]]; if (!mine) return null;
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
    const o = theirs && theirs.byBookmaker && theirs.byBookmaker[b];
    const op = o && o.available !== false ? american(o.odds) : null;
    if (op != null && sameLine(bookLine(o, e.marketKey), oppPoint)) fairs.push(implied(price) / (implied(price) + implied(op)));
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
    finished: !!(ev.status && (ev.status.completed || ev.status.ended)), score: results(ev)
  };
}
function results(ev) {
  const g = ev && ev.results && ev.results.game; if (!g || !g.home || !g.away) return null;
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

/* ---------- the close for a finished pick ---------- */
async function close(src, e, movedToward) {
  if (!src.enabled || !LEAGUE[e.sportKey]) return null;
  const found = await findEvents(src, [e]);
  const ev = found[e.id]; if (!ev) return null;
  const s = snapshot(ev, e);
  if (!s || !s.finished) return null;
  const point = e.outcome && e.outcome.point != null ? Number(e.outcome.point) : null;
  /* the number that counts: the vendor's de-vigged fair when its closing line is ours (always for a moneyline);
     else our own consensus across the books still on our line; else no price CLV, only a direction */
  let fair = null, line = s.vendor.line;
  if (s.vendor.sameLine && s.vendor.fair != null) fair = s.vendor.fair;
  else if (s.fairBooks >= 2) { fair = s.fair; line = point; }
  const logged = { line: point, odds: e.odds };
  const closeSide = { line: line, odds: s.vendor.odds };
  return { source: "consensus close (" + SOURCE + ", " + (s.n || s.fairBooks || 0) + " books)", sgoEventId: ev.eventID, line: line, odds: s.best ? s.best.odds : s.vendor.odds, bestBook: s.best ? s.best.book : null, fair: fair,
    moved: fair == null && movedToward ? movedToward(e, logged, closeSide) : null, open: s.open, score: s.score, books: s.books };
}

module.exports = { source, refresh, close, snapshot, findEvents, results, matches, LEAGUE, BOOKS, ODD_IDS, SOURCE };
