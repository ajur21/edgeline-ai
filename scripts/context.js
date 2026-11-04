/* ==========================================================================
   EdgeLine AI — pick context and breakdowns
   For each pick on the board: ESPN's injury report for both teams, the game's
   venue, records, probable pitchers and weather, each team's rest and recent
   workload from its schedule, Open-Meteo wind and rain at tip-off for outdoor
   games, and the pipeline's own price history (line movement). From that it
   writes a breakdown: the confidence tier and exactly why, what supports the
   pick, what could go wrong, and the raw context for the page to show.
   Free sources only; every fetch is optional and failures leave a field null.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const ESPN = { americanfootball_nfl: "football/nfl", basketball_nba: "basketball/nba", baseball_mlb: "baseball/mlb", icehockey_nhl: "hockey/nhl", soccer_epl: "soccer/eng.1", soccer_spain_la_liga: "soccer/esp.1" };
/* the "core" API uses sport/leagues/league paths; it keeps DraftKings' opening and closing numbers after a game ends */
const ESPN_CORE = { americanfootball_nfl: "football/leagues/nfl", basketball_nba: "basketball/leagues/nba", baseball_mlb: "baseball/leagues/mlb", icehockey_nhl: "hockey/leagues/nhl", soccer_epl: "soccer/leagues/eng.1", soccer_spain_la_liga: "soccer/leagues/esp.1" };
const DK_PROVIDER = "100"; /* ESPN's provider id for DraftKings, the only book it publishes */
const OUTDOOR = { americanfootball_nfl: true, baseball_mlb: true, soccer_epl: true, soccer_spain_la_liga: true };
const ET = "America/New_York";
const DAY = 864e5;
function etDate(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function round(n, d) { const m = Math.pow(10, d == null ? 1 : d); return Math.round(n * m) / m; }

/* ---------- sources ---------- */
function liveSource() {
  const cache = {}; let count = 0;
  async function get(url) {
    if (cache[url]) return cache[url];
    await sleep(80); count++;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
    return (cache[url] = await res.json());
  }
  const site = sport => "https://site.api.espn.com/apis/site/v2/sports/" + ESPN[sport];
  return {
    scoreboard: (sport, yyyymmdd) => get(site(sport) + "/scoreboard?dates=" + yyyymmdd).catch(() => null),
    odds: (sport, eventId) => get("https://sports.core.api.espn.com/v2/sports/" + ESPN_CORE[sport] + "/events/" + eventId + "/competitions/" + eventId + "/odds/" + DK_PROVIDER).catch(() => null),
    injuries: sport => get(site(sport) + "/injuries").catch(() => null),
    schedule: (sport, teamId) => get(site(sport) + "/teams/" + teamId + "/schedule").catch(() => null),
    geocode: city => get("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(city) + "&count=1&language=en&format=json").catch(() => null),
    forecast: (lat, lon, tz) => get("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon + "&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=" + encodeURIComponent(tz || "auto") + "&forecast_days=7").catch(() => null),
    count: () => count
  };
}
function fixtureSource() {
  const dir = path.join(__dirname, "fixtures", "espn");
  const read = n => { const f = path.join(dir, n + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
  const slug = s => ESPN[s].replace("/", "-");
  return {
    scoreboard: async (sport, d) => read("ctx-scoreboard-" + slug(sport) + "-" + d),
    odds: async (sport, id) => read("ctx-odds-" + slug(sport) + "-" + id),
    injuries: async sport => read("ctx-injuries-" + slug(sport)),
    schedule: async (sport, id) => read("ctx-schedule-" + slug(sport) + "-" + id),
    geocode: async city => read("ctx-geocode-" + norm(city)),
    forecast: async () => read("ctx-forecast"),
    count: () => 0
  };
}

/* ---------- ESPN parsing ---------- */
function teamMatches(name, team) {
  const n = norm(name), d = norm(team.displayName), nick = norm(team.name), loc = norm(team.location);
  return n === d || (nick && n.endsWith(nick) && (n.indexOf(loc.slice(0, 4)) !== -1 || loc === "")) || (nick && n === norm(team.shortDisplayName));
}
function findEvent(sb, home, away) {
  for (const e of (sb && sb.events) || []) {
    const c = e.competitions && e.competitions[0]; if (!c) continue;
    const h = c.competitors.find(x => x.homeAway === "home"), a = c.competitors.find(x => x.homeAway === "away");
    if (h && a && teamMatches(home, h.team) && teamMatches(away, a.team)) return { event: e, home: h, away: a, comp: c };
  }
  return null;
}
function teamInjuries(inj, teamName) {
  const t = ((inj && inj.injuries) || []).find(x => teamMatches(teamName, { displayName: x.displayName, name: (x.displayName || "").split(" ").pop(), location: "" }));
  return ((t && t.injuries) || []).map(i => ({
    name: i.athlete && i.athlete.displayName, pos: i.athlete && i.athlete.position && i.athlete.position.abbreviation,
    athleteId: (i.athlete && i.athlete.id) || null, headshot: (i.athlete && i.athlete.headshot && i.athlete.headshot.href) || null,
    status: i.status || "", type: i.details && i.details.type || "", detail: i.details && i.details.detail || "", returnDate: i.details && i.details.returnDate || null,
    note: (i.shortComment || "").slice(0, 160)
  })).filter(i => i.name && !/^active$/i.test(i.status));
}
function restFromSchedule(sched, teamId, commenceMs) {
  const dates = [];
  for (const e of (sched && sched.events) || []) {
    const t = Date.parse(e.date); if (!Number.isFinite(t) || t >= commenceMs - 36e5) continue;
    const c = e.competitions && e.competitions[0]; if (c && c.status && c.status.type && c.status.type.completed === false) continue;
    dates.push(t);
  }
  if (!dates.length) return null;
  dates.sort((a, b) => b - a);
  const restDays = Math.floor((commenceMs - dates[0]) / DAY);
  return { restDays: restDays, b2b: restDays <= 1, lastGame: new Date(dates[0]).toISOString().slice(0, 10), gamesLast7: dates.filter(t => commenceMs - t <= 7 * DAY).length };
}
/* ---------- DraftKings numbers from ESPN ---------- */
function american(s) {
  if (s == null) return null;
  const t = String(s).trim().toUpperCase();
  if (t === "EVEN" || t === "EV" || t === "PK") return 100;
  const n = Number(t.replace(/^\+/, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}
function lineNum(s) { if (s == null) return null; const n = Number(String(s).replace(/^[ou]/i, "").replace(/^\+/, "")); return Number.isFinite(n) ? n : null; }
function impliedP(a) { return a < 0 ? -a / (-a + 100) : 100 / (a + 100); }
function devig2(a, b) { if (a == null || b == null) return null; const pa = impliedP(a), pb = impliedP(b); return pa / (pa + pb); }
/* the scoreboard's odds block (pre-game): "close" here is the current number, "open" the opener */
function scoreboardOdds(comp) {
  const o = (comp.odds || []).find(x => x.provider && (String(x.provider.id) === DK_PROVIDER || /draft\s*kings/i.test(x.provider.name))) || (comp.odds || [])[0];
  if (!o) return null;
  const side = (blk, who, key) => blk && blk[who] && blk[who][key] ? blk[who][key] : null;
  const snap = key => ({
    spread: lineNum(side(o.pointSpread, "home", key) && side(o.pointSpread, "home", key).line), spreadOdds: { home: american(side(o.pointSpread, "home", key) && side(o.pointSpread, "home", key).odds), away: american(side(o.pointSpread, "away", key) && side(o.pointSpread, "away", key).odds) },
    total: lineNum(side(o.total, "over", key) && side(o.total, "over", key).line), totalOdds: { over: american(side(o.total, "over", key) && side(o.total, "over", key).odds), under: american(side(o.total, "under", key) && side(o.total, "under", key).odds) },
    ml: { home: american(side(o.moneyline, "home", key) && side(o.moneyline, "home", key).odds), away: american(side(o.moneyline, "away", key) && side(o.moneyline, "away", key).odds) }
  });
  const now = snap("close"), open = snap("open");
  if (now.spread == null && o.spread != null) now.spread = Number(o.spread);
  if (now.total == null && o.overUnder != null) now.total = Number(o.overUnder);
  return { provider: (o.provider && o.provider.name || "DraftKings").replace(/\s+/g, "") === "DraftKings" ? "DraftKings" : (o.provider && o.provider.name) || "DraftKings", now: now, open: open };
}
/* the core API's odds record (any time, and kept after the game): open / current / close blocks per side */
function coreOdds(o) {
  if (!o || !o.homeTeamOdds) return null;
  const blk = (team, key) => (o[team] && o[team][key]) || null;
  const snap = key => {
    const h = blk("homeTeamOdds", key), a = blk("awayTeamOdds", key), t = o[key] || null;
    return {
      spread: h && h.pointSpread ? lineNum(h.pointSpread.american) : null, spreadOdds: { home: h && h.spread ? american(h.spread.american) : null, away: a && a.spread ? american(a.spread.american) : null },
      total: t && t.total ? lineNum(t.total.american) : null, totalOdds: { over: t && t.over ? american(t.over.american) : null, under: t && t.under ? american(t.under.american) : null },
      ml: { home: h && h.moneyLine ? american(h.moneyLine.american) : null, away: a && a.moneyLine ? american(a.moneyLine.american) : null }
    };
  };
  const close = snap("close"), current = snap("current"), open = snap("open");
  /* before a game ends only `current` is filled; after it ends `close` is the number that counts */
  const fin = close.ml.home != null || close.spread != null || close.total != null;
  return { provider: "DraftKings", close: fin ? close : null, now: fin ? close : current, open: open };
}
/* the pick's own side of a DraftKings snapshot: line (null for a moneyline), price, de-vigged fair */
function dkSide(e, snap) {
  if (!snap) return null;
  const home = e.outcome && e.outcome.name === e.home, away = e.outcome && e.outcome.name === e.away;
  if (e.marketKey === "h2h") {
    if (!home && !away) return null; /* draws are not in ESPN's two-way block */
    const mine = home ? snap.ml.home : snap.ml.away, theirs = home ? snap.ml.away : snap.ml.home;
    return mine == null ? null : { line: null, odds: mine, fair: devig2(mine, theirs) };
  }
  if (e.marketKey === "spreads") {
    if (!home && !away || snap.spread == null) return null;
    const mine = home ? snap.spreadOdds.home : snap.spreadOdds.away, theirs = home ? snap.spreadOdds.away : snap.spreadOdds.home;
    return { line: home ? snap.spread : -snap.spread, odds: mine, fair: devig2(mine, theirs) };
  }
  if (e.marketKey === "totals") {
    if (snap.total == null) return null;
    const over = e.outcome && /^over$/i.test(e.outcome.name);
    const mine = over ? snap.totalOdds.over : snap.totalOdds.under, theirs = over ? snap.totalOdds.under : snap.totalOdds.over;
    return { line: snap.total, odds: mine, fair: devig2(mine, theirs) };
  }
  return null;
}
/* did the market move toward the pick between two snapshots of its side? spreads: a worse number for our side means the
   market likes it; totals: up for an over, down for an under; moneyline: a shorter price. null when nothing moved */
function movedToward(e, from, to) {
  if (!from || !to) return null;
  if (e.marketKey === "h2h") { if (from.odds == null || to.odds == null || from.odds === to.odds) return null; return impliedP(to.odds) > impliedP(from.odds) ? "toward" : "away"; }
  if (from.line == null || to.line == null || from.line === to.line) {
    if (from.odds != null && to.odds != null && from.odds !== to.odds && from.line === to.line) return impliedP(to.odds) > impliedP(from.odds) ? "toward" : "away";
    return null;
  }
  if (e.marketKey === "spreads") return to.line < from.line ? "toward" : "away";
  const over = e.outcome && /^over$/i.test(e.outcome.name);
  return (to.line > from.line) === !!over ? "toward" : "away";
}
function fmtLine(e, s) { if (!s) return "—"; const a = s.odds == null ? "" : (s.odds > 0 ? "+" : "") + s.odds; if (e.marketKey === "h2h") return a; if (e.marketKey === "spreads") return (s.line > 0 ? "+" : "") + s.line + (a ? " (" + a + ")" : ""); return s.line + (a ? " (" + a + ")" : ""); }
/* what the site shows: DraftKings open and now for the pick's side, and the direction */
function dkSummary(e, odds) {
  if (!odds) return null;
  const open = dkSide(e, odds.open), now = dkSide(e, odds.now);
  if (!now) return null;
  return { book: odds.provider || "DraftKings", open: open, now: now, moved: movedToward(e, open, now), label: "DraftKings " + (open ? "opened " + fmtLine(e, open) + ", now " : "now ") + fmtLine(e, now) };
}
/* DraftKings' close for a finished pick from ESPN's core odds record: null when the game is not matched or not closed */
async function closingOdds(src, e) {
  if (!ESPN_CORE[e.sportKey]) return null;
  let id = e.context && e.context.espnEventId;
  if (!id) {
    const sb = await src.scoreboard(e.sportKey, etDate(new Date(Date.parse(e.commence))).replace(/-/g, ""));
    const m = findEvent(sb, e.home, e.away); id = m ? m.event.id : null;
  }
  if (!id) return null;
  const o = coreOdds(await src.odds(e.sportKey, id));
  if (!o || !o.close) return null;
  const side = dkSide(e, o.close); if (!side || side.odds == null) return null;
  const logged = { line: e.outcome && e.outcome.point != null ? Number(e.outcome.point) : null, odds: e.odds };
  const sameLine = e.marketKey === "h2h" || (side.line != null && logged.line != null && Math.abs(side.line - logged.line) < 1e-9);
  return { source: "DraftKings close (ESPN)", espnEventId: String(id), line: side.line, odds: side.odds, fair: sameLine ? round(side.fair, 4) : null, moved: sameLine ? null : movedToward(e, logged, side), open: (function (op) { return op ? { line: op.line, odds: op.odds, fair: op.fair == null ? null : round(op.fair, 4) } : null; })(dkSide(e, o.open)) };
}
/* track mode: refresh only the DraftKings numbers on every board entry (one scoreboard call per sport and day) */
async function trackOdds(entries, opts) {
  const src = opts && opts.fixture ? fixtureSource() : liveSource();
  let changed = 0;
  for (const e of entries) {
    if (!ESPN[e.sportKey]) continue;
    const sb = await src.scoreboard(e.sportKey, etDate(new Date(Date.parse(e.commence))).replace(/-/g, ""));
    const m = findEvent(sb, e.home, e.away); if (!m) continue;
    const odds = scoreboardOdds(m.comp); if (!odds) continue;
    e.context = e.context || { espnEventId: m.event.id, venue: null, indoor: null, records: {}, probables: {}, injuries: {}, rest: {}, weather: null, broadcast: null };
    if (recordDk(e, odds, opts && opts.now)) changed++;
  }
  return { changed: changed, requests: src.count() };
}
/* store the snapshot on the entry; append to dkHistory only when the pick's side actually moved */
function recordDk(e, odds, now) {
  e.context.odds = odds;
  const side = dkSide(e, odds.now); if (!side) return false;
  const last = (e.dkHistory || [])[0] ? e.dkHistory[e.dkHistory.length - 1] : null;
  if (last && last.line === side.line && last.odds === side.odds) return false;
  e.dkHistory = (e.dkHistory || []).concat([{ at: (now ? new Date(now) : new Date()).toISOString(), line: side.line, odds: side.odds, fair: side.fair == null ? null : round(side.fair, 4) }]).slice(-48);
  return true;
}

function recordsOf(comp) {
  const recs = (comp.records || []).reduce((o, r) => { o[r.type || r.name] = r.summary; return o; }, {});
  return { overall: recs.total || recs.overall || null, home: recs.home || null, away: recs.road || recs.away || null };
}
const WMO = { 0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorms", 96: "Thunderstorms", 99: "Thunderstorms" };
async function weatherFor(src, venue, commenceMs) {
  const city = venue && venue.address && (venue.address.city + (venue.address.state ? ", " + venue.address.state : "") + (venue.address.country ? ", " + venue.address.country : ""));
  if (!city) return null;
  const geo = await src.geocode(venue.address.city); const g = geo && geo.results && geo.results[0]; if (!g) return null;
  const fc = await src.forecast(g.latitude, g.longitude, g.timezone); if (!fc || !fc.hourly) return null;
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: g.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date(commenceMs)).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
  const key = local.year + "-" + local.month + "-" + local.day + "T" + (local.hour === "24" ? "00" : local.hour) + ":00";
  const i = fc.hourly.time.indexOf(key); if (i === -1) return null;
  return { city: city, tempF: Math.round(fc.hourly.temperature_2m[i]), windMph: Math.round(fc.hourly.wind_speed_10m[i]), precipPct: fc.hourly.precipitation_probability[i], summary: WMO[fc.hourly.weather_code[i]] || "—", source: "Open-Meteo" };
}

/* ---------- gather context for every board entry ---------- */
async function fetchContext(entries, opts) {
  const src = opts && opts.fixture ? fixtureSource() : liveSource();
  const out = {}, injCache = {};
  for (const e of entries) {
    if (!ESPN[e.sportKey]) continue;
    const commenceMs = Date.parse(e.commence), yyyymmdd = etDate(new Date(commenceMs)).replace(/-/g, "");
    const sb = await src.scoreboard(e.sportKey, yyyymmdd);
    const m = findEvent(sb, e.home, e.away);
    if (!(e.sportKey in injCache)) injCache[e.sportKey] = await src.injuries(e.sportKey);
    const ctx = { espnEventId: m ? m.event.id : null, venue: null, indoor: null, records: {}, probables: {}, injuries: {}, rest: {}, weather: null, broadcast: null };
    ctx.injuries[e.home] = teamInjuries(injCache[e.sportKey], e.home);
    ctx.injuries[e.away] = teamInjuries(injCache[e.sportKey], e.away);
    if (m) {
      const v = m.comp.venue; ctx.venue = v ? (v.fullName + (v.address && v.address.city ? ", " + v.address.city : "")) : null; ctx.indoor = v ? !!v.indoor : null;
      ctx.records[e.home] = recordsOf(m.home); ctx.records[e.away] = recordsOf(m.away);
      [["home", m.home], ["away", m.away]].forEach(function (pair) { const p = (pair[1].probables || [])[0]; if (p && p.athlete) { const era = (p.statistics || []).find(s => s.abbreviation === "ERA"); ctx.probables[pair[0] === "home" ? e.home : e.away] = p.athlete.displayName + (era ? " (ERA " + era.displayValue + ")" : ""); } });
      ctx.broadcast = (m.comp.broadcasts && m.comp.broadcasts[0] && m.comp.broadcasts[0].names || []).join(", ") || null;
      for (const pair of [[e.home, m.home.team.id], [e.away, m.away.team.id]]) ctx.rest[pair[0]] = restFromSchedule(await src.schedule(e.sportKey, pair[1]), pair[1], commenceMs);
      if (m.event.weather) ctx.weather = { summary: m.event.weather.displayValue, tempF: m.event.weather.temperature, source: "ESPN" };
      ctx.odds = scoreboardOdds(m.comp);
      if (OUTDOOR[e.sportKey] && ctx.indoor === false) { const w = await weatherFor(src, v, commenceMs); if (w) ctx.weather = Object.assign(ctx.weather || {}, w); }
    }
    out[e.id] = ctx;
  }
  return { byId: out, requests: src.count() };
}

/* ---------- the breakdown ---------- */
const SEVERE = /^(out|injured reserve|ir|doubtful|suspended|season)/i, SOFT = /^(questionable|day-to-day|day to day|probable|game time)/i;
function pickTeam(e) { return e.marketKey === "totals" ? null : (e.outcome && e.outcome.name === "Draw" ? null : e.outcome && e.outcome.name); }
function buildBreakdown(e, ctx, rules) {
  rules = rules || { minEdge: 0.01, medium: 0.02, high: 0.035 };
  const pts = n => (n * 100).toFixed(1) + " points";
  const tier = e.confidence;
  const tierWhy = "Edge of " + pts(e.edge) + " over the fair line. Lean starts at " + pts(rules.minEdge) + ", Medium at " + pts(rules.medium) + ", High at " + pts(rules.high) + ". Confidence is the size of the price edge only; the context below is what could move the result, not the number.";
  const support = [], risks = [], notes = [];
  if (e.anchor && e.anchorShift) notes.push("Fair line comes from " + e.anchor + ", carried across a line gap: " + e.anchorNote + " A carried price is a fair estimate, not a quote.");
  else if (e.anchor) support.push("Fair line comes from " + e.anchor + "'s de-vigged price, the sharpest public market."); else risks.push("No sharp anchor on this line: fair is the de-vigged average of the books, which is softer.");
  if (e.books >= 6) support.push(e.books + " books price this exact line, so the fair number is well established."); else if (e.books <= 4) risks.push("Only " + e.books + " books price this exact line; thin markets move fast.");
  /* movement since logged */
  if (e.current && e.current.at !== e.loggedAt) {
    const dFair = e.current.fair - e.modelProb, dOdds = e.current.odds - e.odds;
    const mv = { loggedOdds: e.odds, loggedFair: e.modelProb, currentOdds: e.current.odds, currentBook: e.current.book, currentFair: e.current.fair, currentEdge: e.current.edge, checkedAt: e.current.at, history: (e.history || []).slice(-10) };
    if (dFair >= 0.01) support.push("The sharp line has moved toward this side since it was logged (fair " + (e.modelProb * 100).toFixed(1) + "% → " + (e.current.fair * 100).toFixed(1) + "%).");
    else if (dFair <= -0.01) risks.push("The sharp line has moved away since it was logged (fair " + (e.modelProb * 100).toFixed(1) + "% → " + (e.current.fair * 100).toFixed(1) + "%).");
    if (e.current.edge < rules.minEdge) risks.push("At current prices the edge is " + pts(e.current.edge) + ", under the threshold; the logged price may be gone.");
    else if (dOdds > 0) support.push("A better price is now available: " + (e.current.odds > 0 ? "+" : "") + e.current.odds + " at " + e.current.book + ".");
    e.movement = mv;
  }
  /* DraftKings open -> now from ESPN (free, every run): the public market's own drift on this pick */
  const dk = dkSummary(e, ctx && ctx.odds);
  e.dk = dk;
  if (dk && dk.moved === "toward") support.push(dk.label + ": the market has moved toward this side since the open.");
  else if (dk && dk.moved === "away") risks.push(dk.label + ": the market has moved against this side since the open.");
  /* the whole market (SportsGameOdds' nine-book fair) since the open, and a better price if one of its books has it */
  const s = e.sgo;
  const mk = s && s.now && (s.now.odds != null || s.now.line != null) ? { book: "Market consensus", n: s.n, open: s.open, now: s.now, moved: movedToward(e, s.open, s.now), label: "The market (" + (s.n || 0) + " books) " + (s.open ? "opened " + fmtLine(e, s.open) + ", now " : "now ") + fmtLine(e, s.now) } : null;
  e.mkt = mk;
  if (mk && mk.moved === "toward") support.push(mk.label + ": the consensus has moved toward this side since the open.");
  else if (mk && mk.moved === "away") risks.push(mk.label + ": the consensus has moved against this side since the open.");
  if (s && s.best && impliedP(s.best.odds) < impliedP(e.odds) - 1e-9) support.push("A better price is available now: " + (s.best.odds > 0 ? "+" : "") + s.best.odds + " at " + s.best.book + ".");
  const team = pickTeam(e), opp = team ? (team === e.home ? e.away : e.home) : null, isTotal = e.marketKey === "totals", over = isTotal && /^over/i.test(e.pick);
  if (ctx) {
    const injList = (t) => (ctx.injuries && ctx.injuries[t]) || [];
    const severe = t => injList(t).filter(i => SEVERE.test(i.status)), soft = t => injList(t).filter(i => SOFT.test(i.status));
    const names = arr => arr.slice(0, 3).map(i => i.name + (i.pos ? " (" + i.pos + ")" : "") + (i.type ? ", " + i.type.toLowerCase() : "")).join("; ") + (arr.length > 3 ? " and " + (arr.length - 3) + " more" : "");
    if (team) {
      if (severe(team).length) risks.push(team + " without " + names(severe(team)) + ".");
      if (soft(team).length) risks.push(team + " listed " + names(soft(team)) + " as " + soft(team)[0].status.toLowerCase() + ".");
      if (severe(opp).length) support.push(opp + " missing " + names(severe(opp)) + ".");
      if (soft(opp).length) notes.push(opp + " have " + names(soft(opp)) + " " + soft(opp)[0].status.toLowerCase() + ".");
    } else if (isTotal) {
      const outs = severe(e.home).concat(severe(e.away));
      if (outs.length) (over ? risks : support).push("Scorers out: " + names(outs) + ". Fewer healthy scorers leans under.");
    }
    const rest = t => ctx.rest && ctx.rest[t];
    if (team) {
      if (rest(team) && rest(team).b2b) risks.push(team + " are on the second night of a back-to-back.");
      else if (rest(team) && rest(team).gamesLast7 >= 4) risks.push(team + " have played " + rest(team).gamesLast7 + " games in the last 7 days.");
      else if (rest(team) && rest(team).restDays >= 3) support.push(team + " are rested: " + rest(team).restDays + " days since their last game.");
      if (rest(opp) && rest(opp).b2b) support.push(opp + " are on a back-to-back.");
    } else if (isTotal) {
      const tired = [e.home, e.away].filter(t => rest(t) && rest(t).b2b);
      if (tired.length) (over ? risks : support).push(tired.join(" and ") + " on a back-to-back; tired legs lean under.");
    }
    const w = ctx.weather;
    if (w && ctx.indoor === false) {
      const bad = (w.windMph != null && w.windMph >= 15) || (w.precipPct != null && w.precipPct >= 50) || (w.tempF != null && w.tempF <= 32);
      const desc = [w.summary, w.tempF != null ? w.tempF + "°F" : null, w.windMph != null ? "wind " + w.windMph + " mph" : null, w.precipPct != null ? w.precipPct + "% rain" : null].filter(Boolean).join(", ");
      if (isTotal) (bad ? (over ? risks : support) : notes).push("Weather at kickoff: " + desc + (bad ? ". Wind, rain or cold suppresses scoring." : "."));
      else (bad ? risks : notes).push("Weather at kickoff: " + desc + (bad ? ". Rough conditions add variance." : "."));
    } else if (ctx.indoor) notes.push("Indoor venue; weather is not a factor.");
    if (ctx.probables && Object.keys(ctx.probables).length) notes.push("Probable pitchers: " + Object.keys(ctx.probables).map(t => t.split(" ").pop() + " " + ctx.probables[t]).join(" · ") + ".");
    const rec = t => ctx.records && ctx.records[t] && ctx.records[t].overall;
    if (rec(e.home) || rec(e.away)) notes.push("Records: " + e.away + " " + (rec(e.away) || "—") + " · " + e.home + " " + (rec(e.home) || "—") + (ctx.venue ? " · " + ctx.venue : "") + ".");
    if (!ctx.espnEventId) notes.push("No schedule match found for this game, so rest, venue and weather are unknown.");
  }
  return { tier: tier, tierWhy: tierWhy, price: e.rationale, support: support, risks: risks, notes: notes, verdict: risks.length > support.length ? "More working against this one than for it beyond the price; size down." : support.length >= 2 ? "The context lines up with the price." : "Context is neutral; the price edge carries the pick." };
}

async function enrich(entries, opts) {
  const got = await fetchContext(entries, opts);
  entries.forEach(function (e) { e.context = got.byId[e.id] || null; if (e.context && e.context.odds) recordDk(e, e.context.odds, opts && opts.now); e.breakdown = buildBreakdown(e, e.context, opts && opts.rules); });
  return got.requests;
}
function source(opts) { return opts && opts.fixture ? fixtureSource() : liveSource(); }
module.exports = { enrich, fetchContext, buildBreakdown, findEvent, teamInjuries, restFromSchedule, weatherFor, ESPN, ESPN_CORE, source, closingOdds, trackOdds, scoreboardOdds, coreOdds, dkSide, movedToward, dkSummary, recordDk };
